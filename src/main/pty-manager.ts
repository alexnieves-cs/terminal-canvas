import { randomUUID } from 'node:crypto'
import type { ReviewIdentity } from '../shared/review-identity'
import { createOutputCapture, mintCheckRunId, type CheckOutputRecord, type OutputCapture } from '../shared/check-output'
import { agentArgs } from './agent-args'
import { AGENT_CAPABILITIES } from '../shared/cost'
import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync
} from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { configStamps as readConfigStamps, resolveToolboxHome } from './toolbox-read'
import { join, resolve, dirname } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { WebContents } from 'electron'
import type * as pty from 'node-pty'
import { IPC_EVENTS } from '../shared/ipc-contract'
import type {
  AgentState,
  PanelId,
  PanelSpec,
  PtyCreateResult,
  SubagentRecord,
  SubagentUpdate,
  WorktreeOutcome
} from '../shared/types'
import { initialDetector, nextState, scanChunk, type AgentEvent, type Detector } from './agent-state'
import { shellIntegrationFor } from './shell-integration'
import type { RunLedger } from './run-ledger'
import type { SessionBackend } from './session-backend'
import { SubagentWatch, type WatchDeps } from './subagent-watch'
import { buildPtyEnv, resolveShellEnv } from './shell-env'
import { resolveTranscript as realResolveTranscript, readFrom as realReadFrom } from './transcript-reader'
import {
  applyChunk,
  createUsageState,
  dropUsage,
  offsetFor,
  resetIfShrunk,
  usageFor
} from './usage-accumulator'

/**
 * Owns every PTY in the app. The renderer never spawns a process; it only ever
 * asks this module to, keyed by panelId.
 *
 * Output is batched on a ~16ms flush (one animation frame). An unbatched stream
 * sends one IPC message per PTY read, and a TUI like `claude` repainting its
 * frame, or a `find /` dump, will emit thousands per second. That floods the
 * renderer's event loop and the UI locks up.
 */

const FLUSH_INTERVAL_MS = 16

/**
 * M36 (backlog #58). The most one flush may carry. Batching solved message
 * COUNT and did nothing about message SIZE: `yes`, `find /`, or an agent
 * `cat`ing a large file produces multi-megabyte strings crossing IPC every
 * frame, and the renderer stalls in exactly the way the batcher exists to
 * prevent. 256 KB is comfortably more than a full 16ms of a chatty TUI and
 * comfortably less than what stalls a frame. Measured in UTF-16 code units
 * (`string.length`), which is bytes for the ASCII that runaway output
 * overwhelmingly is; the name says bytes because that is the budget it
 * stands in for. A constructor parameter with this default, so
 * verify:pty-manager can force it low and make the elision deterministic.
 */
export const FLUSH_MAX_BYTES = 256 * 1024

/** M39. See the constructor's `scrollback` parameter and main/scrollback-log.ts. */
export interface ScrollbackSink {
  append(panelId: PanelId, data: string): void
  drop(panelId: PanelId): void
  enabled(): boolean
}

/**
 * M43. The OS surfaces "a panel wants you" reaches when the canvas is not the
 * front window: the dock badge, an OS notification, a beep. INJECTED so the
 * whole decision path runs under plain node in verify:pty-manager against a
 * fake window-focus answer, and so main owns the real Notification/dock/beep
 * in one place (main/index.ts). `windowFocused` is a getter because focus
 * changes constantly and a captured value would freeze at construction.
 */
export interface AttentionSink {
  /**
   * A panel newly entered wants-you while the window was NOT focused. `body`
   * is M76's: a chat's notification names the tool in its title and the
   * panel in its body; absent, the body is the M43 sentence.
   */
  notify(panelId: PanelId, label: string, count: number, body?: string): void
  /** The dock badge: the number waiting, on every change. */
  badge(count: number): void
  /** The system alert sound, on a panel entering wants-you. */
  beep(): void
  windowFocused(): boolean
  notifyEnabled(): boolean
  soundEnabled(): boolean
}

/**
 * The idleness tick. A SEPARATE timer from the flush, and one per manager
 * rather than per session, because the flush timer only runs when there IS
 * pending data — it structurally cannot observe the absence of data, which is
 * the entire signal idleness is made of.
 *
 * 500ms is the resolution of "idle", not its threshold: the threshold is the
 * agent.idleAfterMs setting, and this only bounds how late the transition can
 * be reported. One timer for the whole app at 2Hz costs nothing.
 */
const IDLE_TICK_MS = 500

/**
 * How often the live cwd/command poll runs. Deliberately a SEPARATE timer from
 * IDLE_TICK_MS rather than a counter inside it: they differ by 4x, and a later
 * edit that merged them would silently make idleness detection four times
 * coarser, which is M6c's whole threshold.
 *
 * 2s is chosen against human patience, not against cost. One `list-panes`
 * answers EVERY session at once — the list is global — so this costs one
 * subprocess per tick whether the canvas holds two panels or forty.
 */
const LIVE_TICK_MS = 2000

/**
 * How often to re-read pinned transcripts.
 *
 * A THIRD timer, not a merge into either existing one, and the reason is
 * asymmetric. IDLE_TICK_MS is 500 and is the RESOLUTION of M6c's idleness
 * threshold — folding a file read onto it would put disk IO on the 500ms path
 * for a number that changes once per agent turn, and folding this onto the
 * idle tick's period would make idleness detection four times coarser
 * silently, while agent.idleAfterMs went on reading whatever the user set.
 * LIVE_TICK_MS is 2000 and is a tmux subprocess; this is a file read; they are
 * unrelated cadences that would be coupled by a merge for no benefit.
 */
const USAGE_TICK_MS = 2000

/**
 * Only the `~`/`~/` expansion, with no existence check and no fallback. This
 * is main's half of "`~` expansion is main's job" (the renderer has no
 * process.env to do it with) — split out of `resolveCwd` so a consumer that
 * must NOT get the spawn-safety fallback (readDir's `fs:list` handler) can
 * still get the expansion. See `resolveCwd`'s own comment for why the
 * fallback exists and why it is wrong for that consumer.
 */
export function expandTilde(raw: string): string {
  return raw === '~' || raw.startsWith('~/') ? resolve(homedir(), raw.slice(2)) : raw
}

/**
 * node-pty passes cwd straight to the OS, so it never expands `~` and it throws
 * if the directory is gone. Both are easy to hit once panels are persisted with
 * a cwd that has since been deleted (M4), so handle them at the boundary.
 *
 * This is a SPAWN-safety fallback and must not be reused for a directory
 * LISTING: a gone directory here silently substitutes the user's home, which
 * is correct for "never fail a shell spawn over a missing cwd" and wrong for
 * "tell the user this directory is gone" — the `fs:list` handler in `ipc.ts`
 * uses `expandTilde` alone so `readDir`'s own `gone` arm stays reachable.
 */
export function resolveCwd(raw: string): string {
  const expanded = expandTilde(raw)
  if (existsSync(expanded)) return expanded
  console.warn(`[pty] cwd ${expanded} does not exist, falling back to home`)
  return homedir()
}

/**
 * A panel with no explicit command runs the user's login shell. Only main can
 * know what that is: the renderer's `process.env` is compiled away to `{}`, so
 * a shell lookup there resolves to `undefined` and every panel silently gets
 * the hardcoded fallback instead. Prefer the SHELL reported by the login-shell
 * probe, then this process's own view of it, mirroring shell-env.ts's own
 * fallback chain so the two cannot disagree about what "the login shell" is.
 */
function resolveCommand(spec: PanelSpec, loginEnv: Record<string, string>): string {
  if (spec.command) return spec.command
  return loginEnv.SHELL || process.env.SHELL || userInfo().shell || '/bin/zsh'
}

/**
 * Where Claude Code keeps its project transcripts. An env override, not a
 * setting: Task 7's Electron test harness cannot fence itself off from the
 * developer's REAL ~/.claude/projects without one, and this repo already
 * paid for the unfenced version once, in its own git fixtures (see
 * CLAUDE.md's project-prompts fence). TC_TMUX_SOCKET is the established
 * shape for exactly this — a developer flag with no UI. A blank or
 * whitespace-only value is treated as unset, the same rule TC_TMUX_SOCKET's
 * own handling records: an empty override is not a deliberate choice of
 * "no directory", it is a shell mistake, and treating it as one would send
 * every subagent poll at a path nobody meant.
 */
function resolveProjectsRoot(): string {
  const override = process.env.TC_CLAUDE_PROJECTS
  return override !== undefined && override.trim() !== '' ? override : join(homedir(), '.claude', 'projects')
}

/**
 * The real filesystem half of SubagentWatch. Kept out of subagent-watch.ts
 * so its whole state machine stays drivable against a fake filesystem with
 * no real ~/.claude anywhere in earshot — see that module's own comment.
 *
 * Every method answers null rather than throwing, on ANY failure: a missing
 * ~/.claude is the ordinary case for a user who has never run Claude Code, a
 * missing subagents/ directory is the ordinary case for a session with none
 * yet, and this runs per panel, per LIVE_TICK_MS tick, for the life of the
 * app — a throw here would take pollLive's whole live-cwd loop down with it,
 * for a directory this app does not own and cannot assume exists.
 */
function createFsWatchDeps(): WatchDeps {
  return {
    listDirs(path) {
      try {
        return readdirSync(path, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => ({
            name: entry.name,
            // birthtimeMs, not mtimeMs: chooseSession picks the most
            // RECENTLY CREATED session directory after the panel spawned,
            // and a session's transcript file is appended to for the whole
            // life of the conversation — its mtime keeps moving long after
            // creation, which would make an old, still-active session look
            // newer than one actually started after this panel spawned.
            createdAt: statSync(join(path, entry.name)).birthtimeMs
          }))
      } catch {
        return null
      }
    },
    listFiles(path) {
      try {
        return readdirSync(path)
      } catch {
        return null
      }
    },
    readText(path) {
      try {
        return readFileSync(path, 'utf8')
      } catch {
        return null
      }
    },
    readHead(path, max) {
      try {
        const fd = openSync(path, 'r')
        try {
          // A bounded read, never readFileSync: the one caller is the claim's
          // confirmation, and its file is a parent transcript that grows for
          // the whole life of a conversation — megabytes, read for one line,
          // on every tick a claim keeps failing. See SubagentWatch.claim.
          const buffer = Buffer.alloc(max)
          const read = readSync(fd, buffer, 0, max, 0)
          return buffer.subarray(0, read).toString('utf8')
        } finally {
          closeSync(fd)
        }
      } catch {
        return null
      }
    },
    readFrom(path, from) {
      try {
        const fd = openSync(path, 'r')
        try {
          const end = fstatSync(fd).size
          // A transcript that shrank since the last offset was recorded
          // (rotated, truncated) is a surprise, not an error: report nothing
          // new rather than a negative-length read, and let the caller's
          // offset settle back to the file's real end.
          if (end <= from) return { text: '', end }
          const buffer = Buffer.alloc(end - from)
          readSync(fd, buffer, 0, buffer.length, from)
          return { text: buffer.toString('utf8'), end }
        } finally {
          closeSync(fd)
        }
      } catch {
        return null
      }
    },
    sizeOf(path) {
      try {
        return statSync(path).size
      } catch {
        return null
      }
    },
    projectsRoot: resolveProjectsRoot(),
    now: () => Date.now()
  }
}

interface Session {
  panelId: PanelId
  proc: pty.IPty
  /** Pending output chunks awaiting the next flush. */
  buffer: string[]
  /** Sum of `buffer`'s lengths, kept so the cap costs no join to enforce. */
  pendingChars: number
  /**
   * Characters dropped from the head of `buffer` since the last flush. The
   * next flush announces them in the stream: an elision the user is not told
   * about is missing output with no explanation anywhere, which is the same
   * silent failure every note in CLAUDE.md is written against.
   */
  elidedChars: number
  flushTimer: NodeJS.Timeout | null
  /** Set by kill(), so the resulting exit is not reported as news. */
  killed: boolean
  command: string
  cwd: string
  reattached: boolean
  /**
   * The agent-state detector's whole memory for this panel, including the BEL
   * scanner's position. It lives on the SESSION rather than in a parallel map
   * so it cannot outlive the process it describes: every path that removes a
   * session removes the detector with it, which is why a dormant panel — one
   * with no entry here at all — cannot produce a state.
   */
  detector: Detector
  /**
   * When this session's process was started. SubagentWatch.poll needs it to
   * pick which Claude Code project subdirectory belongs to THIS spawn rather
   * than a stale one from a directory somebody used yesterday — see
   * chooseSession's own comment in subagent-scan.ts.
   */
  spawnedAt: number
  /** M52. The command in flight, from OSC 133 C to D. M306: with its output, when a store is wired. */
  run: { command: string; startedAt: number; capture: OutputCapture | null } | null
}

/** M52. The run ledger and the shell-integration directory, injected. */
export interface RunsDeps {
  ledger: RunLedger | null
  integrationDir: string | null
  now: () => number
  /**
   * M54. The control socket and the launcher dir, put into EVERY spawn's
   * environment (not only a login shell's): an agent CLI's own subprocess
   * shell must find `tc` too. Absent or null means no door — a harness that
   * never asks, or the losing instance of the single-instance lock.
   */
  control?: { socket: string; binDir: string } | null
  /**
   * M286. The panel's review subject's content identity NOW (its baseline's
   * root and sha through `ReviewEngine.identityOf`), asked as a command's
   * end mark lands so the ledger row can say what the command TESTED.
   * Optional and defaulted to "no stamp": every harness that builds a
   * manager without it keeps its rows exactly as they were, and a panel
   * with no baseline answers undefined, which the row records as absence.
   */
  identityOf?: (panelId: PanelId) => Promise<ReviewIdentity | undefined>
  /**
   * M306. Where a marked command's exact output goes as its D mark lands.
   * Optional and inert like `identityOf`, and for the same reason must be
   * mirrored in `scripts/panels-harness.cjs`. Only a login shell with OSC 133
   * ever opens a run, so an agent CLI's bytes are never accumulated here.
   */
  outputs?: { put(record: CheckOutputRecord): void }
}

export class PtyManager {
  private sessions = new Map<PanelId, Session>()
  /** One per manager, not per session. See IDLE_TICK_MS. */
  private idleTimer: NodeJS.Timeout | null = null
  /**
   * Which panel ids this manager has already fired captureBaseline for.
   * Deliberately survives detachAll() — a Cmd+R reload must not recapture —
   * and is cleared only by kill(), alongside dropBaseline, so a panel that
   * genuinely closed and later reuses its id starts fresh. See create()'s
   * own comment for why this is a SECOND guard, not the only one.
   */
  private capturedBaselineIds = new Set<PanelId>()
  /** One per manager, like idleTimer. See LIVE_TICK_MS. */
  private liveTimer: NodeJS.Timeout | null = null
  /**
   * The last live values SENT, per panel, joined into one comparable string.
   * This is the dedupe, and it is the design rather than an optimisation — see
   * IPC_EVENTS.SESSION_LIVE. Cleared alongside the session so a recycled panel
   * id cannot inherit a dead panel's values and thereby suppress its own first
   * real send.
   */
  private lastLive = new Map<PanelId, string>()
  /**
   * Timestamps of every IPC_EVENTS send in the last second, for backlog #75's
   * diagnostics overlay. `send()` is the ONE choke point every push in this
   * class already goes through — PTY_DATA, PTY_EXIT, AGENT_STATE,
   * SESSION_LIVE, SUBAGENT_STATE, USAGE_PANEL — so this is the single place
   * that can see the app's whole send volume without a second copy of
   * `send()`'s own call sites. Trimmed on every push rather than on read: a
   * diagnostics poll is rare (every few seconds, only while the overlay is
   * open), while a send can happen dozens of times a second, so trimming on
   * the hot path keeps the array itself bounded rather than letting it grow
   * between reads that may never come.
   */
  private ipcSendTimestamps: number[] = []
  /**
   * One per manager, like idleTimer and liveTimer — a panel's whole claimed
   * session, offset and dedupe state lives here for the life of the process,
   * per SubagentWatch's own comment. Constructed with REAL node:fs deps
   * (createFsWatchDeps): the watcher itself stays fs-free so its state
   * machine can be driven against a fake filesystem in verify:subagent, with
   * no real ~/.claude anywhere in earshot.
   */
  private readonly subagentWatch = new SubagentWatch(createFsWatchDeps())
  /**
   * The FIRST spawnedAt this manager ever recorded for a panel id, kept
   * across a detachAll() reload the same way capturedBaselineIds is (see
   * that field's own comment): a Cmd+R reattach must not treat "this client
   * just attached" as "this process just started". Under tmux those are
   * NOT the same fact -- M6a's reattached flag exists for the identical
   * ambiguity one layer down, because new-session -A makes create and
   * reattach the same call -- and for a reattached session the agent has
   * been running since BEFORE this attach, so its Claude Code session
   * directory necessarily predates it. Cleared only by kill(), never by
   * detachAll(): a reload's tmux session is still running the same agent it
   * always was, so the original spawn time is still the true one. See
   * create()'s own comment for the failure this closes and the one case it
   * deliberately leaves open.
   */
  private readonly firstSpawnedAt = new Map<PanelId, number>()

  /**
   * The config stat vector taken when a panel's agent actually SPAWNED.
   *
   * Follows firstSpawnedAt's rule exactly, including the reattach case, and
   * for the identical reason: `new-session -A` makes "this client attached"
   * and "this process started" the same call, so a REATTACHED session's agent
   * has been running since before this attach. Restamping here would clear the
   * staleness flag on every Cmd+R while the stale agent kept running — a fact
   * silently corrected on screen and nowhere else.
   *
   * Recorded at spawn because it CANNOT be recovered afterwards: once the
   * agent is running there is no way to learn what its config looked like when
   * it booted, which is spawnedAt's own documented precedent for why a fact
   * like this is captured early or not at all.
   */
  private readonly configStamps = new Map<PanelId, Map<string, string>>()

  /** What this panel's config looked like when its agent started, if known. */
  configStampsFor(panelId: PanelId): Map<string, string> | undefined {
    return this.configStamps.get(panelId)
  }
  /** One per manager, like idleTimer and liveTimer. See USAGE_TICK_MS. */
  private usageTimer: NodeJS.Timeout | null = null
  private usageState = createUsageState()

  /**
   * M142 (backlog #19's history half). ONE usage row on the run ledger when a
   * panel's usage is about to be dropped — every site that calls `dropUsage`
   * (kill, the process's exit, a detach that forgets the panel) — so "what
   * did this canvas cost last week" is answerable from #46's ledger rather
   * than a third store. Per-model totals only, never a price: the renderer
   * prices with the summary's rule. A panel with no turns writes nothing (a
   * shell that never ran an agent is not a session that cost nothing; it is
   * not a session).
   */
  private recordUsage(panelId: PanelId): void {
    const u = usageFor(this.usageState, panelId)
    if (u === undefined || u.turns === 0 || this.runs.ledger === null) return
    void this.runs.ledger.append({ kind: 'usage', panelId, byModel: { ...u.byModel }, turns: u.turns, endedAt: this.runs.now() })
  }
  /** Resolved transcript paths, cached: the glob runs once per session. */
  private transcriptPaths = new Map<PanelId, string>()
  /**
   * Panels owed ONE forced usage:panel resend, regardless of whether the
   * transcript grew. detachAll() marks every panel that already had usage
   * state here: a Cmd+R reload wipes the renderer's usage-store, but
   * pollUsage's only send trigger is applyChunk seeing genuinely NEW bytes —
   * so a reattached panel whose agent is currently idle would otherwise show
   * "no answer yet" indefinitely, even though this manager already holds its
   * full totals. Consumed and cleared the first time pollUsage forces a send
   * for that panel.
   */
  private forceResend = new Set<PanelId>()
  /**
   * One StringDecoder per pinned panel, carrying whatever incomplete trailing
   * UTF-8 bytes the last read ended on. readFrom hands back RAW bytes rather
   * than a decoded string precisely because a read can land mid-write, at any
   * byte offset — routinely inside a multibyte codepoint, since transcripts
   * carry non-ASCII constantly (em dashes, emoji, international source).
   * Decoding an arbitrary byte range directly turns a split codepoint into a
   * replacement character on BOTH sides of the split, corrupting the line
   * that straddles it — JSON.parse then throws and the whole turn is dropped,
   * permanently, since the byte offset has already moved past it.
   * StringDecoder.write() buffers exactly that trailing partial sequence
   * across calls and emits only complete characters, which is why it has to
   * live here rather than in transcript-reader.ts: this manager already
   * carries per-panel state for the offset and the totals, and the decoder's
   * lifetime must track theirs — surviving a detach/reattach (the bytes it is
   * holding are still unconsumed, exactly like the offset that already counts
   * them), reset alongside a shrink (those buffered bytes belonged to a file
   * that is gone), and dropped alongside dropUsage (the recycled-id hazard
   * dropBaseline and dropPinnedSession each close on their own doors).
   */
  private transcriptDecoders = new Map<PanelId, StringDecoder>()

  private decoderFor(panelId: PanelId): StringDecoder {
    let d = this.transcriptDecoders.get(panelId)
    if (!d) {
      d = new StringDecoder('utf8')
      this.transcriptDecoders.set(panelId, d)
    }
    return d
  }

  constructor(
    private readonly getTarget: () => WebContents | null,
    /**
     * A getter, not a captured reference, for the same reason getTarget is one:
     * the backend is chosen by an async startup probe that has not finished
     * when this manager is constructed at module scope.
     */
    private readonly getBackend: () => SessionBackend,
    /**
     * Getters for the same reason getTarget and getBackend are: this manager
     * is constructed at module scope, before the layout store has resolved
     * anything — and a captured value would also freeze the setting at its
     * boot value, so a change made in the palette would reach nothing until a
     * relaunch.
     *
     * The defaults mirror the schema's, and exist so the other construction
     * sites (the verify harnesses) keep compiling unchanged.
     */
    private readonly getIdleAfterMs: () => number = () => 1500,
    private readonly getBellEnabled: () => boolean = () => true,
    /**
     * Review-baseline hooks. Optional and defaulted for the same reason
     * getIdleAfterMs is: the verify harnesses construct this manager directly
     * and must keep compiling. In production they reach the layout store.
     */
    private readonly captureBaseline: (panelId: PanelId, cwd: string) => void = () => {},
    private readonly dropBaseline: (panelId: PanelId) => void = () => {},
    /**
     * The stored agent session id for this panel, if it has one.
     *
     * OPTIONAL and defaulted, the trade captureBaseline/dropBaseline already
     * make: every fixture in the verify suites constructs a manager without
     * these, and a required dep would change what a dozen existing checks
     * assert while looking like a widening.
     */
    private readonly pinnedSession: (panelId: PanelId) => string | undefined = () => undefined,
    private readonly setPinnedSession: (panelId: PanelId, sessionId: string) => void = () => {},
    /**
     * Drop the pin, beside dropBaseline and for its reason: the map must not
     * grow for the life of the install, and a recycled panel id must not
     * inherit a dead panel's session — `--session-id` naming an EXISTING
     * session is a RESUME, so that panel would come back holding a
     * stranger's conversation.
     */
    private readonly dropPinnedSession: (panelId: PanelId) => void = () => {},
    /**
     * The real-fs half, injected exactly as captureBaseline/dropBaseline are
     * and for the same reason review-engine.ts takes a GitRunner: a harness
     * can substitute a fake without a real ~/.claude/projects directory
     * anywhere in earshot. Defaulted to the real implementations so every
     * existing construction site — every verify harness — keeps compiling.
     */
    private readonly resolveTranscript: (sessionId: string) => string | undefined = realResolveTranscript,
    private readonly readFrom: (
      path: string,
      offset: number
    ) => { bytes: Buffer; size: number } | undefined = realReadFrom,
    /** See FLUSH_MAX_BYTES. Overridden only by verify:pty-manager. */
    private readonly flushMaxBytes: number = FLUSH_MAX_BYTES,
    /**
     * M37. Answers "where should this panel's worktree be" — creating it,
     * reusing it, or refusing. Injected for captureBaseline's reason: the
     * git-running half lives in worktree-manager.ts and is driven under plain
     * node in verify:review; this manager only has to spawn where it is told
     * and carry the answer. Undefined (every harness that never asks) means a
     * panel asking for a worktree is refused with a reason rather than
     * silently spawned in place.
     */
    private readonly worktreeFor: (panelId: PanelId, cwd: string) => Promise<WorktreeOutcome> =
      async () => ({ kind: 'refused', reason: 'worktrees are not available in this build' }),
    /**
     * M39. Where a flush's bytes are also written. Injected so this suite's
     * recorder can count appends while verify:file owns the disk half; the
     * default records nothing, which is what every harness that never asks
     * gets. `enabled()` is read per flush, never captured, so the setting
     * takes effect on the next flush rather than the next launch.
     */
    private readonly scrollback: ScrollbackSink = { append: () => {}, drop: () => {}, enabled: () => false },
    /**
     * M43. The OS attention surfaces. Inert by default — every existing
     * fixture constructs this manager without one, and an inert sink makes no
     * dock/notification/beep, exactly as before this milestone.
     */
    private readonly attentionSink: AttentionSink = {
      notify: () => {}, badge: () => {}, beep: () => {},
      windowFocused: () => true, notifyEnabled: () => false, soundEnabled: () => false
    },
    /**
     * M52. The run ledger and the shell-integration directory. Inert by
     * default: no ledger means command ends are not recorded, no directory
     * means no shell is decorated — every existing fixture spawns exactly as
     * before. `now` is injected so a check can pin durations.
     */
    private readonly runs: RunsDeps = { ledger: null, integrationDir: null, now: () => Date.now() }
  ) {
    // nothing to construct; fields are the injected dependencies.
  }

  /** M43. The panel ids currently in wants-you, in entry order. */
  private waiting = new Set<PanelId>()

  /** M43. The ids currently waiting — read by main for the snapshot and tests. */
  attention(): PanelId[] {
    return [...this.waiting]
  }

  /**
   * M43. Re-emit the current agent state for every live session. The channel
   * M6d declined twice, and the dock badge is the customer that changes the
   * answer: after a reload the renderer reads zero waiting until the next real
   * transition, while the dock says N — a canvas disagreeing with its own
   * icon. No new channel; the existing event, sent once more per session.
   */
  resendStates(): void {
    for (const session of this.sessions.values()) {
      this.send(IPC_EVENTS.AGENT_STATE, {
        panelId: session.panelId,
        state: session.detector.state satisfies AgentState
      })
    }
  }

  /**
   * M43. Recompute the waiting set and drive the OS surfaces when it CHANGES.
   * The badge is set on every change; a notification and a beep fire only for
   * a panel NEWLY entering wants-you (a notification only when the window is
   * not focused). Nothing here clears a state — focus and a write remain the
   * only two clearers (see acknowledge), so a notification that framed a panel
   * still leaves it amber until the user clicks in.
   */
  private syncAttention(): void {
    const next = new Set<PanelId>()
    for (const s of this.sessions.values()) {
      if (s.detector.state === 'wants-you') next.add(s.panelId)
    }
    let changed = next.size !== this.waiting.size
    if (!changed) for (const id of next) if (!this.waiting.has(id)) { changed = true; break }
    if (!changed) return
    const entering: PanelId[] = []
    for (const id of next) if (!this.waiting.has(id)) entering.push(id)
    this.waiting = next
    this.attentionSink.badge(next.size)
    for (const id of entering) {
      const session = this.sessions.get(id)
      const label = session ? session.command : id
      if (!this.attentionSink.windowFocused() && this.attentionSink.notifyEnabled()) {
        this.attentionSink.notify(id, label, next.size)
      }
      if (this.attentionSink.soundEnabled()) this.attentionSink.beep()
    }
  }
  

  async create(spec: PanelSpec): Promise<PtyCreateResult> {
    if (this.sessions.has(spec.panelId)) {
      throw new Error(`panel ${spec.panelId} already has a live PTY`)
    }

    const loginEnv = await resolveShellEnv()
    const env = buildPtyEnv(loginEnv, spec.env)
    // M54. Before the shell integration reads `env`, so both the login shell
    // and its decorated copy carry the door. PATH is PREPENDED so `tc`
    // resolves with nothing installed, and a user's own `tc` (unlikely, but
    // a name that short is not ours alone) is shadowed only inside a panel.
    const control = this.runs.control ?? null
    if (control !== null) {
      env['TC_CONTROL_SOCKET'] = control.socket
      env['PATH'] = env['PATH'] === undefined || env['PATH'] === '' ? control.binDir : `${control.binDir}:${env['PATH']}`
    }

    // M37. The worktree decides the cwd BEFORE the baseline is captured
    // below, so the snapshot is taken in the worktree — which is the whole
    // reason the review engine needs no change: it sees an ordinary
    // repository root. A refusal spawns in the requested cwd as an ordinary
    // panel and is carried on the result, never swallowed: a worktree the
    // user asked for and did not get must not be silent.
    let cwd = resolveCwd(spec.cwd)
    let worktree: WorktreeOutcome | undefined
    if (spec.worktree === true) {
      worktree = await this.worktreeFor(spec.panelId, cwd)
      if (worktree.kind === 'active') cwd = worktree.path
    }

    // Fire-and-forget: the baseline must never delay or fail a spawn. It is
    // taken BEFORE the process starts so the snapshot precedes the agent's
    // first byte. Gated on capturedBaselineIds rather than called
    // unconditionally: this function runs again for every panel on a Cmd+R
    // reload — main's PtyManager is a module-scope singleton that survives a
    // renderer reload untouched — and under tmux that second call REATTACHES
    // to a session that may have been working for an hour, so calling this
    // again there would reset the baseline to "now" and the pane would
    // report "no changes" for an agent that rewrote the repository. This
    // in-memory guard is deliberately NOT the only one: it resets on an app
    // relaunch (a fresh PtyManager, a fresh empty Set), which is exactly why
    // the store keeps its own persistent record — see captureBaseline's own
    // second existence check in index.ts.
    if (!this.capturedBaselineIds.has(spec.panelId)) {
      this.capturedBaselineIds.add(spec.panelId)
      this.captureBaseline(spec.panelId, cwd)
    }

    const command = resolveCommand(spec, loginEnv)

    // M52. OSC 133 for a LOGIN SHELL only (an absent `command`): main is the
    // only party that knows which shell it resolved. The rc files are
    // written once per launch, idempotently; the env and args the
    // integration returns are what the backend spawns with.
    let spawnEnv = env
    let spawnArgs: string[] | null = null
    if (spec.command === undefined && this.runs.integrationDir !== null) {
      const integration = shellIntegrationFor({ command, absentCommand: true, args: spec.args, env, dir: this.runs.integrationDir })
      if (integration.shell !== null) {
        for (const f of integration.files) {
          try {
            mkdirSync(dirname(f.path), { recursive: true })
            if (!existsSync(f.path) || readFileSync(f.path, 'utf8') !== f.content) writeFileSync(f.path, f.content)
          } catch (error: unknown) {
            console.warn(`[shell-integration] could not write ${f.path}: ${String(error)}`)
          }
        }
        spawnEnv = integration.env
        spawnArgs = integration.args
      }
    }

    // Pin an agent session id, and pass it as a flag so the transcript this
    // panel writes is one we can find later.
    //
    // Read-then-mint, never mint: this function runs again for EVERY panel on
    // a Cmd+R reload, and under tmux `new-session -A` reattaches rather than
    // creating — the command is not re-run and the agent keeps the id it was
    // given. A fresh uuid on that second call would name a transcript that
    // does not exist while the real one went on growing, and the panel's cost
    // would freeze at whatever it was before the reload with nothing in any
    // log. Same shape as captureBaseline's guard twenty lines up, and the same
    // shape as `reattached` needing its probe BEFORE the spawn.
    //
    // Gated on spec.agent, never on the resolved command: appending a flag to
    // a command the user typed is the move resolveCommand deliberately refuses.
    //
    // M20: the assembly itself now lives in the pure `agentArgs`, so the argv
    // — including the spawn-time knobs from spec.agentOptions — is checkable
    // without a real `claude` on PATH. The read-then-mint of the session id
    // stays HERE, because it writes to the store and is therefore not pure.
    let sessionId = this.pinnedSession(spec.panelId)
    // M74. A spec that RESUMES a session (`Open in terminal` from a chat
    // panel) adopts that id as its pin rather than minting one beside it: the
    // pin is what M17's cost accounting reads and what a later `Open as chat`
    // follows, and both must name the conversation actually running here.
    // `spec.args` may be ABSENT (agentArgs's own comment: verify-panels.cjs
    // omits it deliberately), so the read is guarded rather than assumed.
    const specArgs = Array.isArray(spec.args) ? spec.args : []
    const resumeAt = specArgs.indexOf('--resume')
    const resumed = resumeAt >= 0 ? specArgs[resumeAt + 1] : undefined
    if (spec.agent !== undefined && typeof resumed === 'string' && resumed !== '' && sessionId !== resumed) {
      sessionId = resumed
      this.setPinnedSession(spec.panelId, sessionId)
    }
    if (
      spec.agent !== undefined &&
      AGENT_CAPABILITIES[spec.agent].sessionIdFlag !== undefined &&
      sessionId === undefined
    ) {
      sessionId = randomUUID()
      this.setPinnedSession(spec.panelId, sessionId)
    }
    const args = spawnArgs ?? agentArgs(spec, sessionId ?? '')

    // BEFORE the spawn, not after. `new-session -A` creates the session if it
    // is missing, so a probe taken afterwards answers true unconditionally and
    // every panel — including one on a cold start — claims to have reattached.
    const reattached = this.getBackend().hasSession(spec.panelId)

    const proc = this.getBackend().spawn({ ...spec, args }, command, cwd, spawnEnv)

    // A genuinely NEW session's spawnedAt is now, recorded in firstSpawnedAt
    // for the life of this manager (or until kill()). A REATTACHED one
    // reuses whatever this manager already holds for this panel id, because
    // the Claude Code session directory it needs to re-claim necessarily
    // predates this moment, not this attach -- see firstSpawnedAt's own
    // comment. Treating the attach as the spawn would make chooseSession's
    // post-spawn filter (createdAt >= spawnedAt) reject the panel's own,
    // still-valid session directory, permanently: the exact silent failure
    // detachAll()'s clearDedupe() (R8) exists to prevent for an
    // ALREADY-CLAIMED panel, reachable again here for one that had not been
    // claimed yet at the moment of the reload (a panel reloaded before its
    // first successful poll, or one two colliding panels' shared ambiguity
    // had already dropped the claim for).
    //
    // Deliberate limit, left as-is: after a full app RELAUNCH this manager
    // is new and firstSpawnedAt is empty, so a reattached panel still falls
    // back to Date.now() and its pre-existing session stays unclaimable.
    // Fixing that needs the tmux session's own start time -- a seventh
    // LIST_FORMAT column and a verify:tmux count change -- which is out of
    // scope here. The safe direction is no nodes rather than wrong nodes,
    // this milestone's own stated principle, so the fallback is correct
    // even though it is lossy.
    let spawnedAt = this.firstSpawnedAt.get(spec.panelId)
    if (!reattached || spawnedAt === undefined) {
      spawnedAt = Date.now()
      this.firstSpawnedAt.set(spec.panelId, spawnedAt)
    }
    // Stamped on exactly the same condition, for exactly the same reason. It
    // is fire-and-forget and must never delay a spawn, so a failure to stat
    // anything is simply an absent stamp, which reads as `unknown` rather than
    // as `fresh` — the safe direction, since `fresh` would be a claim.
    if (!reattached || !this.configStamps.has(spec.panelId)) {
      try {
        this.configStamps.set(spec.panelId, readConfigStamps(cwd, resolveToolboxHome()))
      } catch {
        // A panel whose config cannot be stamped answers `unknown` freshness.
      }
    }

    const session: Session = {
      panelId: spec.panelId,
      proc,
      buffer: [],
      pendingChars: 0,
      elidedChars: 0,
      flushTimer: null,
      killed: false,
      command,
      cwd,
      reattached,
      detector: initialDetector(Date.now()),
      run: null,
      spawnedAt
    }
    this.sessions.set(spec.panelId, session)
    // Only ever ticks while something is in the map; see startIdleTick.
    this.startIdleTick()
    this.startLiveTick()
    this.startUsageTick()

    // The one DIRECT send in this class, and applyEvent structurally cannot
    // do it: applyEvent sends only on a CHANGE, and the detector is born in
    // 'starting', so nothing ever *enters* it and the state would never reach
    // the wire at all. Without this send a panel that has spawned but not yet
    // produced a byte carries no state — which is exactly the window that
    // matters, because a real `claude` takes seconds to boot and that silence
    // is the moment the user most needs to see something is happening. It is
    // sent after the map entry exists so the ordering matches every other
    // send: a state is only ever announced for a session main is holding.
    this.send(IPC_EVENTS.AGENT_STATE, {
      panelId: spec.panelId,
      state: session.detector.state satisfies AgentState
    })

    proc.onData((data) => this.enqueue(session, data))
    proc.onExit(({ exitCode, signal }) => {
      // Flush whatever is pending BEFORE announcing exit, otherwise the last
      // lines of output (often the error that explains the exit) are dropped.
      // flush() itself refuses a session the map no longer holds (M61), so a
      // kill()ed process's tail cannot land in a panel recreated at this id.
      this.flush(session)
      // The OS process exits some milliseconds after kill() returned, by which
      // time this panelId may already have been recreated. Evicting by key
      // alone would unhook that new session and orphan its PTY, so only remove
      // the entry if it is still this exact session.
      if (this.sessions.get(spec.panelId) === session) {
        this.sessions.delete(spec.panelId)
        // lastLive's own comment claims it is cleared alongside the session
        // unconditionally — kill() and detachAll() already do; a natural exit
        // (the panel's own shell typed `exit`) is the third route out of the
        // map and was the one route that left a stale entry behind. Unreachable
        // today only because every re-create route goes through
        // dispose -> pty.kill first (see Canvas.tsx's five dispose call sites),
        // which is a property of the renderer's call sites, not of this class.
        this.lastLive.delete(spec.panelId)
        // subagentWatch follows lastLive at every site it is cleared, for the
        // identical reason: a recycled panel id must not inherit a dead
        // panel's claimed session directory and report a stranger's
        // subagents as its own.
        this.subagentWatch.drop(spec.panelId)
        // And firstSpawnedAt with them, for symmetry with kill(): this is the
        // third route out of the sessions map and was the one that left the
        // entry standing. Harmless TODAY only because create() overwrites it
        // whenever `reattached` is false, so the stale value is replaced
        // before anything reads it — but that is a property of create()'s
        // branch, not of this map, and it sits three lines under a comment
        // whose whole subject is a map that WAS left stale on this exact
        // path. A per-panel map that only some exits clear is the shape the
        // recycled-id failure keeps arriving in.
        this.firstSpawnedAt.delete(spec.panelId)
        this.configStamps.delete(spec.panelId)
      }
      // AFTER the flush above and before the exit is announced. Order matters
      // in one direction only: 'exited' is terminal in the state machine
      // precisely so the last bytes a dying process emits — which the flush
      // has just delivered — cannot revive the panel to 'busy'.
      //
      // The SEND obeys the same guard PTY_EXIT does, for the same reason and
      // with a sharper failure: an exit we asked for arrives milliseconds
      // after kill() returned, by which time the renderer has already run
      // clearAgentState(id) at its dispose site. An unguarded 'exited' lands
      // AFTER that cleanup and re-adds the entry — so the map grows for the
      // life of the renderer and a recycled id inherits a dead panel's
      // border, which is precisely the failure clearAgentState's own comment
      // claims to prevent. The recycled id is not hypothetical: onReset
      // disposes every panel and immediately installs firstRunPanels(), whose
      // id is the constant FIRST_RUN_ID, so resetting a canvas whose 'p1' was
      // running painted the brand-new 'p1' red until its first byte arrived —
      // and never healed at all if that panel was never promoted.
      //
      // The TRANSITION is not guarded, only the send. The detector still has
      // to reach its terminal state: this closure keeps `session` alive after
      // the map entry is gone, so a straggler read on a killed session would
      // otherwise be applied to a detector still sitting in 'busy' and send a
      // state for a panel nobody can see. 'exited' is terminal, so once it is
      // recorded no later event can produce a send at all.
      this.applyEvent(session, { kind: 'exit' }, session.killed)
      if (this.sessions.size === 0) { this.stopIdleTick(); this.stopLiveTick(); this.stopUsageTick() }
      // An exit we asked for is not news the panel needs to paint.
      if (session.killed) return
      // The tmux CLIENT's exit code carries no information — an inner command
      // exiting 0 and one exiting 42 both produce client exit 1 — so a naive
      // port would make this message present, plausible and wrong. The tmux
      // backend recovers the real code from the pane-died hook's file; the
      // direct backend returns null and node-pty's own code stands.
      const real = this.getBackend().exitCodeFor(spec.panelId)
      this.send(IPC_EVENTS.PTY_EXIT, { panelId: spec.panelId, exitCode: real ?? exitCode, signal })
    })

    console.log(
      `[pty] spawned ${command} pid=${proc.pid} panel=${spec.panelId} ` +
        `${spec.cols}x${spec.rows} cwd=${cwd}`
    )

    return {
      panelId: spec.panelId,
      pid: proc.pid,
      command,
      cwd,
      reattached,
      // Absent stays absent: a spread of `undefined` would survive IPC as a
      // present key and read as an outcome.
      ...(worktree === undefined ? {} : { worktree })
    }
  }

  /**
   * Every live session. The renderer uses this to reconcile after a reload
   * rather than blindly creating a panel that may already exist.
   *
   * The backend answers first: after a reload this map is EMPTY (navigation
   * killed the clients) while the tmux sessions live on, so the map alone
   * would report nothing and every panel would restore dormant. A backend with
   * no independent view returns null and the map is the answer, as before.
   */
  list(): PtyCreateResult[] {
    const fromBackend = this.getBackend().list()
    if (fromBackend) return fromBackend
    return [...this.sessions.values()].map((s) => ({
      panelId: s.panelId,
      pid: s.proc.pid,
      command: s.command,
      cwd: s.cwd,
      reattached: s.reattached
    }))
  }

  /** Returns false when no live session owns this panelId. */
  write(panelId: PanelId, data: string): boolean {
    const session = this.sessions.get(panelId)
    if (!session) return false
    session.proc.write(data)
    // Typing into a panel is reading it. Main already holds this fact, which
    // is why only the FOCUS half of acknowledgement needed a new channel.
    this.applyEvent(session, { kind: 'acknowledge' })
    return true
  }

  resize(panelId: PanelId, cols: number, rows: number): void {
    const session = this.sessions.get(panelId)
    if (!session) return
    // node-pty throws on non-positive dimensions, which a hidden or
    // zero-height container will produce.
    if (cols < 1 || rows < 1) return
    try {
      session.proc.resize(cols, rows)
    } catch (error) {
      console.warn(`[pty] resize failed for ${panelId}`, error)
    }
  }

  kill(panelId: PanelId): void {
    const session = this.sessions.get(panelId)
    // No LOCAL session is not the same as no session. Under tmux a panel can
    // be reattachable — its session survived a reload — while this manager has
    // never spawned a client for it, because the panel was off-screen or held
    // back by LIVE_BUDGET and never went live. Returning here would leave that
    // session running an agent with nothing left able to reach, close, or type
    // into it for the rest of the run. destroy() is keyed by panel id and is a
    // no-op on the direct backend, so this costs nothing when there is
    // genuinely nothing there.
    if (!session) {
      this.getBackend().destroy(panelId)
      this.scrollback.drop(panelId)
      this.dropBaseline(panelId)
      this.capturedBaselineIds.delete(panelId)
      this.dropPinnedSession(panelId)
      this.lastLive.delete(panelId)
      this.subagentWatch.drop(panelId)
      this.firstSpawnedAt.delete(panelId)
      this.configStamps.delete(panelId)
      this.recordUsage(panelId)
      dropUsage(this.usageState, panelId)
      this.transcriptPaths.delete(panelId)
      this.forceResend.delete(panelId)
      this.transcriptDecoders.delete(panelId)
      return
    }
    session.killed = true
    if (session.flushTimer) clearTimeout(session.flushTimer)
    try {
      session.proc.kill()
    } catch (error) {
      console.warn(`[pty] kill failed for ${panelId}`, error)
    }
    // Closing a panel must end the SESSION, not merely detach a client.
    // Without this the tmux session survives with no panel able to reach it.
    this.getBackend().destroy(panelId)
    // M39. A closed panel's log goes with it — search over closed panels is
    // not a promise this app makes, and this is what keeps the directory
    // bounded by the canvas. A restart-in-place therefore starts a fresh log,
    // matching its fresh process.
    this.scrollback.drop(panelId)
    this.dropBaseline(panelId)
    this.capturedBaselineIds.delete(panelId)
    this.dropPinnedSession(panelId)
    this.lastLive.delete(panelId)
    this.subagentWatch.drop(panelId)
    this.firstSpawnedAt.delete(panelId)
    this.configStamps.delete(panelId)
    this.recordUsage(panelId)
    dropUsage(this.usageState, panelId)
    this.transcriptPaths.delete(panelId)
    this.forceResend.delete(panelId)
    this.transcriptDecoders.delete(panelId)
    this.sessions.delete(panelId)
    if (this.sessions.size === 0) { this.stopIdleTick(); this.stopLiveTick(); this.stopUsageTick() }
  }

  /**
   * before-quit's END arm (main/quit.ts), so no PTY outlives the app — the
   * default. The KEEP arm calls detachAll() instead, and PTYs outlive the
   * app on purpose (M38).
   */
  killAll(): void {
    for (const panelId of [...this.sessions.keys()]) this.kill(panelId)
  }

  /**
   * The renderer is gone but its processes must not be. Kills the local handle
   * — which, on the tmux backend, is a CLIENT — and forgets the session
   * WITHOUT calling backend.destroy(). That omission is the entire milestone:
   * kill() ends the session, detachAll() lets it keep running.
   */
  detachAll(): void {
    for (const session of [...this.sessions.values()]) {
      // A panel with existing usage state is exactly a panel whose renderer
      // is about to lose its usage-store entirely — the reload wipes it —
      // while THIS manager goes on holding full totals for it. Marking it
      // here is what lets pollUsage force one resend the next time it sees
      // this panel, instead of waiting on a byte that may not arrive for a
      // while if the agent is currently idle.
      if (usageFor(this.usageState, session.panelId) !== undefined) {
        this.forceResend.add(session.panelId)
      }
      session.killed = true
      if (session.flushTimer) clearTimeout(session.flushTimer)
      try {
        session.proc.kill()
      } catch (error) {
        console.warn(`[pty] detach failed for ${session.panelId}`, error)
      }
      this.sessions.delete(session.panelId)
    }
    // A reload's fresh PtyManager would start with an empty lastLive anyway,
    // but THIS manager survives a detach and keeps running — so without this
    // clear, pollLive dedupes every reattached panel against its stale
    // pre-reload value and sends nothing until the cwd changes again, which
    // may be never. lastLive is supposed to be cleared alongside the
    // session; kill() already does both, detachAll() must too.
    this.lastLive.clear()
    // subagentWatch.clearDedupe(), deliberately NOT .clear(). detachAll()
    // is a re-send trigger, not a teardown — main's PtyManager and the tmux
    // sessions it holds both survive a Cmd+R, only the renderer is new, so
    // its empty store must be told every fact again rather than have them
    // deduped away, the identical reason lastLive.clear() exists two lines
    // up. A full clear() here would ALSO drop the claimed session directory,
    // so the next poll would re-derive it from the REATTACHING create()
    // call's new, later spawnedAt — and chooseSession only accepts a
    // directory created ON OR AFTER spawnedAt, which the real one, predating
    // the reload, no longer is. That was this file's first draft, caught in
    // review: a panel's subagents would have vanished at the first Cmd+R and
    // never come back for the life of that panel, with nothing in any log —
    // exactly the failure this milestone is supposed to be about. See
    // SubagentWatch.clearDedupe()'s own comment for the same story from the
    // other side.
    this.subagentWatch.clearDedupe()
    // The pin is the exact MIRROR of lastLive, for the opposite reason: this
    // is a reload, the tmux session survives it, and the agent keeps the id
    // it was given — dropping the pin here would re-mint a fresh uuid on the
    // next create() and name a transcript that does not exist while the real
    // one goes on growing, freezing the panel's cost forever with nothing in
    // any log (check 28). lastLive must be cleared here because the tmux
    // session survives and the LOCAL cached value goes stale; the pin must
    // survive here because the tmux session survives and the pin is still
    // correct.
    //
    // transcriptPaths is cleared, usageState is deliberately NOT. The agent
    // kept running across the reload and its transcript kept growing, so the
    // accumulated totals and the byte offset are still correct — re-reading
    // from zero would double-count every turn already folded in before the
    // reload. The cached PATH is dropped only because it is cheap to
    // re-resolve on the next poll and a stale one (from a transcript that
    // has since rotated, however unlikely) is the one thing here that could
    // actually be wrong; the totals and offset cannot be, because nothing
    // about a reload changes what the agent already wrote.
    this.transcriptPaths.clear()
    if (this.sessions.size === 0) { this.stopIdleTick(); this.stopLiveTick(); this.stopUsageTick() }
    // M43 fix: the waiting set (and the dock badge) is derived from the
    // sessions just deleted — recompute so a reload does not leave the badge
    // stuck at the pre-reload count when a reattached agent emits nothing.
    this.syncAttention()
  }

  /**
   * The renderer's half of clearing wants-you: it knows about focus, which
   * main cannot see. See IPC.AGENT_ACKNOWLEDGE.
   *
   * An id with no live session is silently ignored rather than treated as an
   * error: the renderer focuses dormant and carded panels freely, and those
   * have no entry here by design.
   */
  acknowledge(panelId: PanelId): void {
    const session = this.sessions.get(panelId)
    if (!session) return
    this.applyEvent(session, { kind: 'acknowledge' })
  }

  private startIdleTick(): void {
    if (this.idleTimer) return
    this.idleTimer = setInterval(() => {
      for (const session of this.sessions.values()) {
        this.applyEvent(session, { kind: 'tick' })
      }
    }, IDLE_TICK_MS)
    // Do not hold the process open for a 2Hz timer nothing is waiting on —
    // the verify harnesses run under plain node, where a live interval would
    // keep the suite from ever exiting.
    this.idleTimer.unref?.()
  }

  private stopIdleTick(): void {
    if (!this.idleTimer) return
    clearInterval(this.idleTimer)
    this.idleTimer = null
  }

  private startLiveTick(): void {
    if (this.liveTimer) return
    this.liveTimer = setInterval(() => this.pollLive(), LIVE_TICK_MS)
    // Same reason idleTimer is unref'd: do not hold a plain-node verify process
    // open for a 0.5Hz timer nothing is waiting on.
    this.liveTimer.unref?.()
  }

  private stopLiveTick(): void {
    if (!this.liveTimer) return
    clearInterval(this.liveTimer)
    this.liveTimer = null
  }

  /**
   * One poll for every panel, on LIVE_TICK_MS. Two independent halves live
   * here now, and they disagree on whether tmux is required — which is why
   * the null-backend early return that used to guard the whole method now
   * guards only the first half.
   *
   * The live cwd/command half: backend.list() is null on the direct backend
   * by contract — not "nothing is running", but "ask the manager", and the
   * manager holds only spawn-time values — so there is no live answer there
   * and none is invented.
   *
   * The subagent half runs UNCONDITIONALLY, after that guarded block, never
   * inside it: it reads the filesystem, not tmux, and a direct-backend panel
   * has a real Claude Code session running just the same. Gating it on
   * backend.list() would silently disable subagent detection whenever this
   * app runs without tmux — which is a real, supported, production
   * configuration (see "The probe checks that the SERVER starts" in
   * CLAUDE.md), not an edge case.
   */
  private pollLive(): void {
    const entries = this.getBackend().list()
    // Every live cwd this tick has an answer for, regardless of whether that
    // answer changed — used below as the subagent half's live-cwd source, so
    // that half need not re-derive it from lastLive's packed dedupe string.
    const liveCwd = new Map<PanelId, string>()
    if (entries) {
      for (const entry of entries) {
        liveCwd.set(entry.panelId, entry.cwd)
        // Only panels this manager is actually holding. An entry for a
        // session this renderer has no local session for belongs to a panel
        // nothing is subscribed to, and sending for it would grow lastLive
        // with ids the map will never clear.
        if (!this.sessions.has(entry.panelId)) continue
        // NUL, not a space: a path may contain a space, so ('/a b', 'sh')
        // and ('/a', 'b sh') would collide into one key under a space
        // delimiter — a panel whose update is silently suppressed, for the
        // users whose directories happen to contain the delimiter and nobody
        // else. NUL is the one byte a POSIX path cannot contain, the same
        // collision railSignature avoids with JSON.stringify.
        const key = `${entry.cwd}\u0000${entry.currentCommand}`
        if (this.lastLive.get(entry.panelId) === key) continue
        this.lastLive.set(entry.panelId, key)
        this.send(IPC_EVENTS.SESSION_LIVE, {
          panelId: entry.panelId,
          cwd: entry.cwd,
          currentCommand: entry.currentCommand
        })
      }
    }

    const panels = [...this.sessions.values()].map((session) => ({
      panelId: session.panelId,
      // M12's consumer-fallback rule: a consumer that needs A directory,
      // rather than one making a present-tense claim, falls back happily to
      // the resolved spawn cwd when there is no live answer yet — or, under
      // the direct backend, ever.
      cwd: liveCwd.get(session.panelId) ?? session.cwd,
      spawnedAt: session.spawnedAt
    }))

    for (const entry of this.subagentWatch.poll(panels)) {
      // The watcher already deduped (see SubagentWatch.poll's own comment);
      // this is not a second gate, only the wire mapping.
      const payload: SubagentUpdate = {
        panelId: entry.panelId,
        ambiguous: entry.ambiguous,
        // Both numbers are main's own derivations, carried rather than
        // recomputed on the far side: `sharing` because the renderer cannot
        // see the other panels' slugs at all, and `overflow` because the
        // renderer is handed the CAPPED list and so has nothing left to count
        // it from.
        sharing: entry.sharing,
        overflow: entry.overflow,
        // Field by field, never a spread: spreading would carry toolUseId
        // onto the wire, where it is both meaningless and the internal key
        // of a format this repo does not own. Same rule M5a's absent
        // `command` forces on four other layers, for the same reason — a
        // structured clone carries whatever the object actually has.
        records: entry.records.map(
          (r): SubagentRecord => ({
            id: r.id,
            agentType: r.agentType,
            description: r.description,
            model: r.model,
            spawnDepth: r.spawnDepth,
            state: r.state,
            startedAt: r.startedAt
          })
        )
      }
      this.send(IPC_EVENTS.SUBAGENT_STATE, payload)
    }
  }

  private startUsageTick(): void {
    if (this.usageTimer) return
    this.usageTimer = setInterval(() => this.pollUsage(), USAGE_TICK_MS)
    // Same reason idleTimer and liveTimer are unref'd: do not hold a
    // plain-node verify process open for a timer nothing is waiting on.
    this.usageTimer.unref?.()
  }

  private stopUsageTick(): void {
    if (!this.usageTimer) return
    clearInterval(this.usageTimer)
    this.usageTimer = null
  }

  /**
   * Re-read each pinned panel's transcript from where we left off.
   *
   * Only panels this manager is holding AND that carry a pin, the same
   * narrowing pollLive makes: a panel with no pin has no transcript, and a
   * panel not in the map belongs to nothing subscribed.
   */
  private pollUsage(): void {
    for (const panelId of this.sessions.keys()) {
      const sessionId = this.pinnedSession(panelId)
      if (sessionId === undefined) continue
      let path = this.transcriptPaths.get(panelId)
      if (path === undefined) {
        // Undefined here is the ORDINARY state for the first seconds of every
        // pinned panel — the agent has started and not yet answered — so this
        // is a retry, not a failure.
        path = this.resolveTranscript(sessionId)
        if (path === undefined) continue
        this.transcriptPaths.set(panelId, path)
      }
      const offset = offsetFor(this.usageState, panelId)
      let read = this.readFrom(path, offset)
      if (read === undefined) continue
      // A shrink means the file was truncated or replaced: the stored offset
      // now points PAST the file's end, so `readFrom` short-circuits at that
      // stale offset and hands back an EMPTY read — a size, but no bytes.
      // Resetting the state AFTER consuming that empty read (the ordering
      // this replaces) fixes the OFFSET for next tick while `applyChunk` still
      // runs on this tick's empty text, silently sets offset = fileSize
      // having parsed nothing, and the whole replacement file is skipped —
      // forever, since the offset it leaves behind already covers it. The
      // reset has to run BEFORE the read that is actually consumed, and a
      // second read from 0 has to follow it, so the replacement file's
      // content is what applyChunk actually sees this tick.
      if (read.size < offset) {
        resetIfShrunk(this.usageState, panelId, read.size)
        // The decoder's buffered partial bytes belonged to the file that is
        // gone — carrying them into a full re-read from 0 would prepend a
        // stray tail from a stream this panel no longer has any relationship
        // to. A fresh decoder is exactly what a fresh offset already implies.
        this.transcriptDecoders.delete(panelId)
        read = this.readFrom(path, 0)
        if (read === undefined) continue
      }
      // write(), never toString(): a read can land mid-write, at any byte
      // offset, and routinely splits a multibyte UTF-8 codepoint — decoding
      // that byte range directly would corrupt the line straddling the split
      // on BOTH sides of it. The decoder buffers exactly the incomplete
      // trailing bytes and folds them into the NEXT call, which is why it has
      // to persist per panel across ticks rather than being constructed here.
      const text = this.decoderFor(panelId).write(read.bytes)
      const usage = applyChunk(this.usageState, panelId, text, read.size)
      // undefined means nothing changed. That dedupe IS the throttle; see
      // applyChunk's own comment and verify:usage 18. But a panel marked in
      // forceResend just lost its renderer-side usage-store to a reload, so
      // "nothing changed" is exactly the case that must still send: the
      // agent may be idle for a while, and the reattached panel would
      // otherwise show "no answer yet" indefinitely despite this manager
      // already holding its full totals.
      if (usage === undefined) {
        if (this.forceResend.has(panelId)) {
          this.forceResend.delete(panelId)
          const forced = usageFor(this.usageState, panelId)
          if (forced !== undefined) this.send(IPC_EVENTS.USAGE_PANEL, { panelId, usage: forced })
        }
        continue
      }
      this.forceResend.delete(panelId)
      this.send(IPC_EVENTS.USAGE_PANEL, { panelId, usage })
    }
  }

  /**
   * Runs one event through the state machine and sends ONLY on an actual
   * change. That dedupe IS the throttle the design asks for: a panel printing
   * a megabyte produces one 'busy' message rather than one per 16ms flush, so
   * this channel cannot become the 60Hz cascade the renderer's memo exists to
   * block.
   *
   * `mute` advances the machine WITHOUT telling anyone. Every caller passes
   * `session.killed`, and the split is the point: suppressing the TRANSITION
   * too would leave a detector stranded mid-state on an object this class's
   * own onExit/onData closures still hold, and those closures keep running
   * after the map entry — and the renderer's cached state — are both gone.
   */
  private applyEvent(session: Session, event: AgentEvent, mute = false): void {
    const before = session.detector.state
    session.detector = nextState(session.detector, event, Date.now(), this.getIdleAfterMs())
    if (session.detector.state === before) return
    // The waiting set is recomputed on EVERY real state change, mute or not: a
    // killed panel leaving wants-you must still drop the badge, even though its
    // agent:state is not sent (the renderer's teardown handles that half).
    this.syncAttention()
    if (mute) return
    this.send(IPC_EVENTS.AGENT_STATE, {
      panelId: session.panelId,
      state: session.detector.state satisfies AgentState
    })
  }

  private enqueue(session: Session, data: string): void {
    // The choke point. Every byte from every PTY in this app passes through
    // here, so the detector sits at the one place both of its signals exist —
    // and a dormant panel, which has no entry in the session map at all,
    // cannot produce a state. The bug where a restored canvas draws
    // indicators for twelve processes that do not exist is unreachable rather
    // than defended against.
    //
    // Scanning happens BEFORE the buffering, so a bell is seen on the read
    // that carried it rather than up to 16ms later when the flush runs.
    const scanned = scanChunk(session.detector.scan, data)
    // The scanner's position must be written back, or an OSC body straddling
    // a flush boundary is re-entered as ordinary text on the next chunk and a
    // window title ending in BEL rings a bell — intermittently, under load.
    session.detector = { ...session.detector, scan: scanned.pos }
    // M52. The marks: a command start opens a run, a command end closes it
    // into the ledger — a per-command event at human speed, from a scan that
    // already runs on every chunk. Never bumps anything higher-frequency.
    // M306. `cursor` is where this chunk's not-yet-captured bytes begin: a
    // C mark moves it past itself, a D mark closes the capture at its own end
    // (the D sequence itself is stripped on display), and whatever follows
    // the last mark is captured below while a run is still open.
    let cursor = 0
    for (let m = 0; m < scanned.marks.length; m += 1) {
      const mark = scanned.marks[m]
      const end = scanned.ends[m] ?? data.length
      if (mark.kind === 'C') {
        session.run = { command: mark.command, startedAt: this.runs.now(), capture: this.runs.outputs === undefined ? null : createOutputCapture() }
        cursor = end
      } else if (mark.kind === 'D') {
        const run = session.run
        session.run = null
        run?.capture?.push(data.slice(cursor, end))
        cursor = end
        if (run && this.runs.ledger) {
          const ledger = this.runs.ledger
          const outputs = this.runs.outputs
          const endedAt = this.runs.now()
          const outputId = run.capture !== null && outputs !== undefined ? mintCheckRunId(session.panelId, run.startedAt) : undefined
          const row = { panelId: session.panelId, command: run.command, cwd: session.cwd, startedAt: run.startedAt, endedAt, exitCode: mark.exit, ...(outputId === undefined ? {} : { outputId }) }
          const capture = run.capture
          // M306. The record and the row land together after one stamp, so
          // the output a person opens names the revision the row claims.
          const land = (tested: ReviewIdentity | undefined): void => {
            if (outputId !== undefined && capture !== null) {
              outputs?.put({
                v: 1, runId: outputId, panelId: session.panelId, source: 'shell',
                command: run.command, cwd: session.cwd, startedAt: run.startedAt, endedAt,
                exitCode: mark.exit, signal: null,
                ...(tested === undefined ? {} : { tested }),
                ...capture.snapshot()
              })
            }
            void ledger.append(tested === undefined ? row : { ...row, tested })
          }
          // M286. The stamp is read as the end mark lands — the tree as the
          // command left it — and the row waits for it; a failed read writes
          // the row without a stamp rather than losing the row.
          const stamp = this.runs.identityOf
          if (stamp === undefined) land(undefined)
          else void stamp(session.panelId).then(land, () => land(undefined))
        }
      }
    }
    if (session.run?.capture && cursor < data.length) session.run.capture.push(cursor === 0 ? data : data.slice(cursor))
    // Output BEFORE bell, for this chunk. A panel's very first bytes may
    // contain a bell; bell-then-output would leave the machine in 'busy',
    // because the output event would overwrite the bell's state. This order
    // gives starting -> busy -> wants-you.
    //
    // Both are MUTED for a killed session, the same guard the exit send
    // obeys. This path is reached from the captured proc.onData closure, not
    // from a map lookup, so it still runs in the window between kill() —
    // which deleted the map entry and ran the renderer's clearAgentState —
    // and onExit, which is what finally records 'exited'. A read already
    // buffered in the pty landing in that window would otherwise apply an
    // unmuted 'output' to a detector still at 'starting' or 'idle', i.e. a
    // real change, i.e. a 'busy' sent for a panel the renderer has dropped:
    // the same recycled-id defect the exit guard exists to close, entered
    // through the other door. Reachable in one gesture — Cmd+N, close the
    // panel before its first byte, and the shell's prompt bytes land after
    // kill().
    //
    // Muting rather than returning early is not a style choice. enqueue also
    // BUFFERS, and onExit deliberately flushes pending output BEFORE
    // announcing the exit so the last lines — usually the error explaining
    // the exit — are not dropped. An early return here would silently delete
    // that, which is a load-bearing property this file documents above.
    this.applyEvent(session, { kind: 'output' }, session.killed)
    // Bells are counted, not merely detected, but the machine treats any
    // positive count as one event: two bells in one chunk are one request for
    // attention.
    if (scanned.bells > 0 && this.getBellEnabled()) {
      this.applyEvent(session, { kind: 'bell' }, session.killed)
    }

    session.buffer.push(data)
    session.pendingChars += data.length
    // The cap keeps the TAIL. Whole chunks go first, from the head, because a
    // chunk boundary is where node-pty already cut and a cut inside one can
    // land mid-escape-sequence; only a single chunk larger than the whole cap
    // is sliced, and then to its LAST cap characters. Head-preserving
    // truncation would drop exactly the bytes the flush-before-exit rule
    // exists to protect — the error that explains an exit is the last thing
    // a dying process prints. The scan above already ran over every byte, so
    // a bell in a dropped chunk was still counted.
    while (session.pendingChars > this.flushMaxBytes && session.buffer.length > 1) {
      const dropped = session.buffer.shift() as string
      session.pendingChars -= dropped.length
      session.elidedChars += dropped.length
    }
    if (session.pendingChars > this.flushMaxBytes) {
      const only = session.buffer[0] as string
      const keep = only.slice(only.length - this.flushMaxBytes)
      session.elidedChars += only.length - keep.length
      session.buffer[0] = keep
      session.pendingChars = keep.length
    }
    if (session.flushTimer) return
    session.flushTimer = setTimeout(() => this.flush(session), FLUSH_INTERVAL_MS)
  }

  private flush(session: Session): void {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer)
      session.flushTimer = null
    }
    // M61. A session that is no longer THIS panel's session has no right to
    // speak to it. kill() and detachAll() delete the map entry synchronously
    // and never drain the buffer; the OS process exits milliseconds later,
    // usually printing something on its way out, and by then the id may
    // belong to a recreated panel (restart in place reuses it). Both sends
    // below are keyed by panelId alone, so an unguarded flush here would
    // paint a dead process's last line into a fresh terminal and append it
    // to a log kill() had just dropped — resurrecting the file, with nothing
    // on screen to say why. There are TWO doors in: onExit's deliberate
    // flush-before-announce, and a flush timer armed by a read that landed
    // after kill(). Gating here closes both; gating only onExit would not.
    // A NATURAL exit is untouched: a session that exited on its own is still
    // in the map when onExit runs, so its last lines — the error that
    // explains the exit — still reach the renderer and the log. A DETACHED
    // session (detachAll deletes the entry too) is gated on purpose: its
    // renderer is the one being torn down, and under tmux the bytes a
    // detaching client prints are the client's own farewell, not output.
    if (this.sessions.get(session.panelId) !== session) {
      session.buffer.length = 0
      session.pendingChars = 0
      session.elidedChars = 0
      return
    }
    if (session.buffer.length === 0) return
    let data = session.buffer.join('')
    session.buffer.length = 0
    session.pendingChars = 0
    if (session.elidedChars > 0) {
      // Told in the stream, on its own line, with attributes reset first so a
      // drop that landed mid-SGR cannot paint the notice in the agent's
      // colours. Rounded UP so a small elision never reads as "0 KB".
      const kb = Math.max(1, Math.ceil(session.elidedChars / 1024))
      data = `\r\n\x1b[0m[terminal-canvas: ${kb} KB of output elided]\r\n` + data
      session.elidedChars = 0
    }
    this.send(IPC_EVENTS.PTY_DATA, { panelId: session.panelId, data })
    // M39. The same string, marker included, so the log is what the renderer
    // was shown — one append per flush, beside the one send. The sink queues
    // its own disk write; nothing here waits.
    if (this.scrollback.enabled()) this.scrollback.append(session.panelId, data)
  }

  private send(channel: string, payload: unknown): void {
    const now = Date.now()
    this.ipcSendTimestamps.push(now)
    // Trim to the last 1000ms in place: this runs on every send, so an array
    // that only ever grew would be the exact unbounded-map hazard
    // capturedBaselineIds/lastLive both exist to close on their own doors.
    const cutoff = now - 1000
    let start = 0
    while (start < this.ipcSendTimestamps.length && this.ipcSendTimestamps[start] < cutoff) start += 1
    if (start > 0) this.ipcSendTimestamps.splice(0, start)
    const target = this.getTarget()
    if (!target || target.isDestroyed()) return
    target.send(channel, payload)
  }

  /**
   * Messages actually sent in the last second, counted whether or not a
   * target exists to receive them — a refused send is still work this
   * process did, and dropping it here would make the rate lie about renderer
   * teardown windows rather than reporting nothing sent. Backlog #75.
   */
  ipcMessageRate(): number {
    const cutoff = Date.now() - 1000
    return this.ipcSendTimestamps.filter((t) => t >= cutoff).length
  }
}
