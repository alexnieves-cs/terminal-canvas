/**
 * The stateful half of subagent detection: a claimed session directory per
 * panel, a byte offset into its parent transcript, and the records built
 * from both. Task 1's `subagent-scan.ts` is pure and knows nothing about a
 * filesystem or about time; this is where the dirty per-tick reads and the
 * per-panel memory that ties polls together actually live.
 *
 * Every read comes through `WatchDeps` rather than `node:fs` directly, for
 * the reason `review-engine.ts` takes its `GitRunner` as a constructor
 * argument: it is what lets the whole state machine be driven against a fake
 * filesystem with no real `~/.claude` anywhere in earshot. Real fs wiring —
 * `readdir`, `readFile`, `stat` — is Task 4's job, not this file's.
 *
 * `poll` runs on a 2s tick, per panel, for the life of the app, so the rule
 * throughout is the same one `subagent-scan.ts` states for itself: a
 * surprise costs a `continue`, never a throw. Every `WatchDeps` call may
 * answer null, and null is an ORDINARY state — no Claude Code installed, no
 * session yet, no `subagents/` directory, an unreadable transcript — not an
 * error.
 */

import {
  chooseSession,
  cwdOf,
  parseMeta,
  scanForResults,
  slugFor,
  slugSharing
} from './subagent-scan'

export interface SubagentRecordInternal {
  id: string
  agentType: string
  description: string
  model: string
  spawnDepth: number
  toolUseId: string
  state: 'running' | 'done'
  startedAt: number
}

export interface WatchDeps {
  /** Directory entries with creation times, or null if the directory is absent. */
  listDirs(path: string): Array<{ name: string; createdAt: number }> | null
  /** File names in a directory, or null if absent. */
  listFiles(path: string): string[] | null
  /** Whole-file read, or null on any failure. */
  readText(path: string): string | null
  /**
   * The FIRST `max` bytes of a file, or null on any failure. Separate from
   * readText because the one caller that wants a file's first LINE — the
   * claim's confirmation read — is pointed at a parent transcript that runs
   * to megabytes on a long conversation, and a whole-file read there is paid
   * on every retry. See `claim` for why a retry is reachable at all.
   */
  readHead(path: string, max: number): string | null
  /** Bytes [from..EOF] plus the new EOF offset, or null on any failure. */
  readFrom(path: string, from: number): { text: string; end: number } | null
  /** File size in bytes, or null if absent. */
  sizeOf(path: string): number | null
  projectsRoot: string
  now(): number
}

/**
 * How far back a first claim reads before settling onto its live offset, so
 * a subagent that finished before this app ever noticed the panel is
 * reported `done` rather than stuck `running` forever. 256KiB is comfortably
 * more than one session's worth of subagent tool_use/tool_result pairs, and
 * small enough that paying it once, on claim, is not itself a cost worth
 * noticing next to the 2s recurring tick.
 */
export const BACK_SCAN_BYTES = 262144

/**
 * How many subagent records one panel may hold. Nothing about Claude Code's
 * format bounds a fan-out, and NOTHING here removes a record once it is
 * added — a completed subagent stays in the map as a `done` node — so the
 * list only ever grows, for the life of the panel. Three separate costs ride
 * on its length and every one of them is invisible: the renderer stacks the
 * nodes in a single column (100 of them is a 6,400px ribbon painted over
 * whatever the user has placed to the right of that panel), the whole list is
 * re-serialised into the dedupe key on EVERY 2s tick, and the whole list
 * crosses IPC on every change. This repo caps everywhere it reads something
 * it does not own for exactly this reason — `REVIEW_FILE_CAP`, and prompts at
 * 100 files / 64KB.
 *
 * The overflow is COUNTED and reported rather than silently dropped, the same
 * rule `REVIEW_FILE_CAP` obeys with its `+N more`: a list that simply stops is
 * indistinguishable from an agent that stopped spawning, which is a wrong
 * answer rather than a bounded one. 24 is comfortably more than a real fan-out
 * and still a column a user can scan.
 */
export const SUBAGENT_CAP = 24

/**
 * How many bytes of a parent transcript the confirmation read looks at. The
 * first LINE is all `cwdOf` wants, and Claude Code writes a session's own
 * header line first; 8KiB is far more than that line has ever been and
 * bounded regardless of how long the conversation runs.
 */
const CONFIRM_HEAD_BYTES = 8192

/** The one filename shape this module reads out of a `subagents/` listing. */
const META_SUFFIX = '.meta.json'

/**
 * The dedupe key reported for an ambiguous panel. A sentinel string rather
 * than `JSON.stringify([])` — the empty array a genuinely CLAIMED panel with
 * no subagents yet would also serialise to — because the two are different
 * facts wearing the same "no records" shape, and colliding their keys would
 * suppress the real transition from "claimed, nothing running yet" straight
 * into "ambiguous" the instant they happened to be adjacent. Any string that
 * cannot come out of `JSON.stringify` on an array (which always starts with
 * `[`) is safe; this one is chosen to read as intent if it ever surfaces in
 * a log. The sharing COUNT is part of it, because that count is rendered to
 * the user ("3 panels share this repository") — a key that ignored it would
 * leave a third panel joining an already-ambiguous pair with the line still
 * reading 2, permanently, since the deduped tick is the only one that would
 * ever have corrected it.
 */
const ambiguousKey = (sharing: number): string => `ambiguous:${sharing}`

/**
 * Per-panel claim state. `records` is keyed by the file's own id (its
 * basename without `.meta.json`) rather than by `toolUseId` — the two happen
 * to be distinct values in practice (Claude Code mints its own file ids),
 * and the id is what a `listFiles` result actually hands back, so keying on
 * it is what lets "not already known" be answered by a single map lookup
 * instead of re-reading and re-parsing a file just to learn the key it would
 * be stored under.
 *
 * Deliberately does NOT carry the dedupe key — see `lastKeys` on the class
 * below for why that lives in a separate, longer-lived map.
 */
interface PanelState {
  /**
   * The slug this claim was derived from. Kept so the NEXT poll can notice
   * the panel has moved: `attributable` recomputes on the live cwd every
   * tick, but a claim is made once and nothing else re-derives it, so a panel
   * that `cd`s into a different repository would go on rendering the first
   * repository's nodes beside a panel that is no longer in it — a confident
   * wrong attribution, which is the one outcome this whole module's
   * confirmation read exists to prevent, reached after the confirmation
   * rather than at it.
   */
  slug: string
  sessionDir: string
  parentPath: string
  subagentsDir: string
  offset: number
  records: Map<string, SubagentRecordInternal>
  /**
   * How many `.meta.json` sidecars this panel has seen beyond SUBAGENT_CAP.
   * Counted rather than ignored so the renderer can say `+N more`: a list
   * that simply stops is indistinguishable from an agent that stopped
   * spawning, which is a wrong answer where the cap is only a bounded one.
   */
  overflow: number
}

/** One panel's answer for one tick. Only CHANGED panels are returned. */
export interface PollResult {
  panelId: string
  records: SubagentRecordInternal[]
  /** How many `.meta.json` sidecars were seen beyond SUBAGENT_CAP. */
  overflow: number
  ambiguous: boolean
  /** How many panels share this panel's repository, itself included. */
  sharing: number
}

export class SubagentWatch {
  private readonly deps: WatchDeps
  private readonly panels = new Map<string, PanelState>()
  /**
   * The last dedupe key reported per panel, kept in a map SEPARATE from
   * `panels` and with a different lifetime. Ambiguity is a steady state, not
   * a transient one — two panels sharing one repository is an ordinary,
   * long-lived configuration — so re-announcing it every tick for the life
   * of the app is exactly the failure the dedupe exists to prevent, and it
   * is invisible on screen: it shows up as heat, never a wrong pixel, the
   * same argument check 16 makes for a claimed panel's unchanged records.
   * `panels` is cleared the moment a panel goes ambiguous (see `poll`), but
   * `lastKeys` is not, which is what lets a run of ambiguous ticks dedupe
   * against ITSELF while an ambiguous -> unambiguous -> ambiguous round trip
   * still reports on the second arrival: the middle, unambiguous state
   * writes a real records key in between, so the second ambiguous report
   * differs from what came immediately before it and is not suppressed.
   */
  private readonly lastKeys = new Map<string, string>()
  /**
   * Session directories this panel has already CONFIRMED against and been
   * refused by, keyed `panelId -> "<sessionDir>\0<cwd>"`.
   *
   * Without it, a confirmation failure costs a transcript read on EVERY tick
   * for the life of the panel and never gets anywhere: `claim` stores no
   * state on that path, so the next poll re-derives the identical directory
   * and re-reads the identical file, forever. It is reachable rather than
   * theoretical — `slugFor` maps both `/` and `-` to `-`, so
   * `/Users/me/my-repo` and `/Users/me/my/repo` share a slug, and a panel in
   * one of them keeps resolving the other's session.
   *
   * The negative is keyed on the DIRECTORY and the cwd it was judged against,
   * never on the panel alone: a panel whose agent later starts a genuinely
   * new session (a new directory) must still be able to claim it, and a panel
   * that has moved is being judged against a different cwd. Poisoning the
   * panel itself would trade a repeated read for a feature that is silently
   * dead for the rest of that panel's life, which is the worse of the two.
   * Only a DEFINITE disagreement is remembered — an unreadable or
   * half-written first line is a transient and is retried.
   */
  private readonly failedClaims = new Map<string, string>()

  constructor(deps: WatchDeps) {
    this.deps = deps
  }

  /** One tick. Returns only panels whose record list CHANGED. */
  poll(
    panels: ReadonlyArray<{ panelId: string; cwd: string; spawnedAt: number }>
  ): PollResult[] {
    // A fact about the whole CANVAS, not about any one panel — see
    // attributable's own comment in subagent-scan.ts. Recomputed every tick
    // because which panels collide can change as panels open and close.
    const slugs = new Map<string, string | null>()
    for (const panel of panels) slugs.set(panel.panelId, slugFor(panel.cwd))
    // ONE derivation, shared by the refusal and by the count the renderer
    // states to the user: sharing === 1 IS attributable. See slugSharing.
    const sharing = slugSharing(slugs)

    const out: PollResult[] = []

    for (const panel of panels) {
      const shared = sharing.get(panel.panelId) ?? 0
      if (shared !== 1) {
        // Refused — most often two panels sharing one repository. The claim
        // itself — session dir, offset, records — is dropped rather than
        // merely left stale: an ambiguous panel has nothing this tick can
        // vouch for, and leaving the old claim in place would let it silently
        // resume the instant the colliding neighbour closed, on a claim that
        // was never re-confirmed for this tick. If the ambiguity later clears,
        // the panel re-claims from scratch and re-scans from a fresh offset
        // rather than resuming a stale one.
        this.panels.delete(panel.panelId)
        // The dedupe key, by contrast, is NOT dropped here — see `lastKeys`'
        // own comment for why ambiguity is a steady state that must dedupe
        // like any other, rather than re-announcing itself every 2s tick
        // forever.
        const key = ambiguousKey(shared)
        if (this.lastKeys.get(panel.panelId) === key) continue
        this.lastKeys.set(panel.panelId, key)
        out.push({ panelId: panel.panelId, records: [], overflow: 0, ambiguous: true, sharing: shared })
        continue
      }

      let state = this.panels.get(panel.panelId)
      // A claim is made ONCE and nothing re-derives it, so the panel moving
      // out from under it has to be noticed here or not at all. `slugFor` is
      // a pure function of the live cwd pollLive already hands us, so this
      // costs one string comparison per panel per tick and closes the case
      // where a panel `cd`s into a different repository: the old claim is
      // dropped and the next line re-claims against the new slug, rather than
      // rendering repository A's subagents beside a panel now in repository
      // B. The failure it removes is a CONFIDENT WRONG answer, not an absent
      // one, which is the direction this module refuses to be wrong in.
      if (state && state.slug !== slugs.get(panel.panelId)) {
        this.panels.delete(panel.panelId)
        this.failedClaims.delete(panel.panelId)
        state = undefined
      }
      if (!state) {
        const claimed = this.claim(panel)
        if (!claimed) continue // no session yet, or the confirmation failed
        state = claimed
        this.panels.set(panel.panelId, state)
      }

      this.ingestMeta(state)
      this.ingestResults(state)

      // THE DEDUPE. JSON.stringify over the records, never a string join:
      // `description` is model-authored text that may contain any separator
      // a join would pick, the same reason railSignature in the renderer
      // uses JSON.stringify rather than concatenation. Object field order is
      // fixed by construction (ingestMeta always builds the same shape), so
      // two calls over an unchanged records map serialise identically. The
      // overflow count rides INSIDE the key rather than beside it, because a
      // panel that crosses SUBAGENT_CAP changes only that number on the tick
      // it happens — the records array is already full and byte-identical —
      // and a key that ignored it would leave the node column's `+N more`
      // frozen at the first number it ever showed.
      const records = [...state.records.values()]
      const key = JSON.stringify([records, state.overflow])
      if (key === this.lastKeys.get(panel.panelId)) continue
      this.lastKeys.set(panel.panelId, key)
      out.push({
        panelId: panel.panelId,
        records,
        overflow: state.overflow,
        ambiguous: false,
        sharing: shared
      })
    }

    return out
  }

  /** A panel is gone: drop its offset, its claimed dir, its records and its dedupe key. */
  drop(panelId: string): void {
    this.panels.delete(panelId)
    this.lastKeys.delete(panelId)
    this.failedClaims.delete(panelId)
  }

  /** Every panel is gone (a reload). */
  clear(): void {
    this.panels.clear()
    this.lastKeys.clear()
    this.failedClaims.clear()
  }

  /**
   * Every panel's DEDUPE forgotten; every panel's CLAIM (its session dir,
   * byte offset and records map) kept. For detachAll()'s reload path, which
   * is a re-send trigger and not a teardown: main's PtyManager and the tmux
   * sessions it holds both survive a Cmd+R, only the renderer is new, so its
   * empty store has to be told every fact again rather than have them
   * deduped away against a memory the fresh renderer never had — the
   * identical reason PtyManager's own lastLive.clear() exists.
   *
   * clear() (above) would satisfy that alone and is the wrong choice: it
   * also drops the claimed session directory, so the next poll would
   * re-derive it from the REATTACHING create() call's new, later spawnedAt —
   * and chooseSession only accepts a directory created ON OR AFTER
   * spawnedAt, which the real one, predating the reload, no longer is. A
   * panel's subagents would vanish at the first Cmd+R and never come back
   * for the life of that panel, with nothing in any log. See
   * pty-manager.ts's detachAll() for where this is called.
   */
  clearDedupe(): void {
    this.lastKeys.clear()
  }

  /**
   * Claims a session directory for a panel that holds no state yet, or
   * returns null having claimed nothing. Every step below can fail on an
   * ordinary state — no Claude Code, no session created yet, an unreadable
   * transcript — and a failure anywhere in the chain means "try again next
   * tick", never a throw and never a partial claim.
   */
  private claim(panel: { panelId: string; cwd: string; spawnedAt: number }): PanelState | null {
    const slug = slugFor(panel.cwd)
    const dirs = this.deps.listDirs(`${this.deps.projectsRoot}/${slug}`)
    if (dirs === null) return null
    const sessionDir = chooseSession(dirs, panel.spawnedAt)
    if (sessionDir === null) return null

    // The negative memory, checked BEFORE any read: a session directory this
    // panel has already been refused by, judged against this same cwd, is
    // refused again for free. See `failedClaims` for why the repeat is
    // reachable and why the key carries both halves.
    const failKey = `${sessionDir}\u0000${panel.cwd}`
    if (this.failedClaims.get(panel.panelId) === failKey) return null

    const parentPath = `${this.deps.projectsRoot}/${slug}/${sessionDir}.jsonl`
    // THE CONFIRMATION. slugFor's mapping is inferred from 31 observed
    // directory names, not documented anywhere — see its own comment — so it
    // is never trusted on its own. A session whose own first transcript line
    // records a DIFFERENT cwd is not this panel's, however well the
    // directory name matched, which is what makes slugFor safe to be wrong
    // about.
    //
    // A bounded HEAD read, never readText: this file is the parent transcript
    // and grows for the whole life of a conversation, so a whole-file read
    // here is megabytes paid for one line — and paid again on every tick a
    // claim keeps failing, which is exactly the case below.
    const head = this.deps.readHead(parentPath, CONFIRM_HEAD_BYTES)
    if (head === null) return null
    const newline = head.indexOf('\n')
    const firstLine = newline === -1 ? head : head.slice(0, newline)
    const recordedCwd = cwdOf(firstLine)
    // Two different failures wearing one `null`, and only one of them is
    // remembered. A cwd that DISAGREES is a durable fact about this
    // directory: it will disagree every tick from now until the agent starts
    // a different session, so re-reading it is pure cost. A first line that
    // did not parse, or a file that did not read, is a transient — a
    // transcript caught mid-write, a directory created a moment ago — and
    // must be retried, or a race would cost the panel its whole feature.
    if (recordedCwd !== null && recordedCwd !== panel.cwd) {
      this.failedClaims.set(panel.panelId, failKey)
      return null
    }
    if (recordedCwd === null) return null

    const size = this.deps.sizeOf(parentPath)
    if (size === null) return null
    // The bounded back-scan: a subagent that finished before this app ever
    // attached to the session is reported settled rather than left stuck
    // `running` forever, without re-reading a transcript that can run to
    // megabytes on every claim.
    const offset = Math.max(0, size - BACK_SCAN_BYTES)

    this.failedClaims.delete(panel.panelId)
    return {
      slug,
      sessionDir,
      parentPath,
      subagentsDir: `${this.deps.projectsRoot}/${slug}/${sessionDir}/subagents`,
      offset,
      records: new Map(),
      overflow: 0
    }
  }

  /** Picks up any `*.meta.json` sidecar this panel has not already read. */
  private ingestMeta(state: PanelState): void {
    const files = this.deps.listFiles(state.subagentsDir)
    if (files === null) return // no subagents/ yet — ordinary for a fresh session
    let overflow = 0
    for (const file of files) {
      if (!file.endsWith(META_SUFFIX)) continue
      const id = file.slice(0, -META_SUFFIX.length)
      if (state.records.has(id)) continue
      // THE CAP. Counted before the read, so an over-cap fan-out costs a
      // listing rather than N file reads per tick, and reported through
      // `overflow` rather than silently dropped. See SUBAGENT_CAP.
      if (state.records.size >= SUBAGENT_CAP) {
        overflow += 1
        continue
      }
      const text = this.deps.readText(`${state.subagentsDir}/${file}`)
      if (text === null) continue
      const meta = parseMeta(text)
      // A malformed meta is re-read on every tick, DELIBERATELY, and this is
      // the one place in this module where a repeated read is the correct
      // answer rather than the cost `failedClaims` above exists to remove.
      // Claude Code writes these sidecars while we are listing the directory,
      // so a file caught mid-write parses as malformed — and marking it known
      // would drop that subagent's node permanently, for a race rather than
      // for anything wrong with the file. The retry IS the defence. It is
      // bounded by the cap above and by the file being a small sidecar rather
      // than a transcript.
      if (meta === null) continue
      state.records.set(id, {
        id,
        agentType: meta.agentType,
        description: meta.description,
        model: meta.model,
        spawnDepth: meta.spawnDepth,
        toolUseId: meta.toolUseId,
        state: 'running',
        startedAt: this.deps.now()
      })
    }
    state.overflow = overflow
  }

  /**
   * Scans the newly-appended tail of the parent transcript for completions.
   * Always reads from the last offset forward — even when nothing is
   * currently `running` — because the offset itself is the cost worth
   * keeping small: deferring the advance would only trade this tick's small
   * read for a larger one the next time a subagent starts, never eliminate
   * it, while unconditionally advancing keeps every read a bounded delta.
   */
  private ingestResults(state: PanelState): void {
    const chunk = this.deps.readFrom(state.parentPath, state.offset)
    if (chunk === null) return
    state.offset = chunk.end

    const running = new Set<string>()
    for (const record of state.records.values()) {
      if (record.state === 'running') running.add(record.toolUseId)
    }
    const done = scanForResults(chunk.text, running)
    if (done.size === 0) return
    for (const record of state.records.values()) {
      if (done.has(record.toolUseId)) record.state = 'done'
    }
  }
}
