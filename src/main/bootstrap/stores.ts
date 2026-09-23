import { join } from 'node:path'
import { mkdirSync, rmSync, unlinkSync, statSync } from 'node:fs'
import { Notification, app, shell } from 'electron'
import { PtyManager, type AttentionSink } from '../pty-manager'
import { createLayoutSnapshots } from '../layout-snapshots'
import { createLayoutStore, type LayoutStore } from '../layout-store'
import { createCredentialStore, type CredentialStore } from '../credential-store'
import { createSafeStorageCrypto } from '../credential-crypto'
import { createReviewEngine, type ReviewEngine } from '../review-engine'
import { createReviewCommitter } from '../review-commit'
import { createReviewDiscarder } from '../review-discard'
import { createRunLedger } from '../run-ledger'
import { createCheckOutputStore, type CheckOutputStore } from '../check-output-store'
import { createAgentTranscriptLog } from '../agent-transcript-log'
import { createScrollbackLog } from '../scrollback-log'
import { createWorktreeManager } from '../worktree-manager'
import { createBaselineCapture } from '../baseline-capture'
import { createGitRunner } from '../git-runner'
import { createMemoryStore } from '../memory-store'
import { createBrokerAudit } from '../broker-audit'
import { createLastExitStore, type LastExitStore } from '../last-exit'
import { createAttentionUnion } from '../approvals'
import { FileWatchers } from '../file-watch'
import { ToolboxCache } from '../toolbox-cache'
import { forgetTrail } from '../skill-trail-read'
import { IPC_EVENTS } from '../../shared/ipc-contract'
import { needsYouCount, needsYouNamed } from '../../shared/attention-words'
import type { MainState } from './context'

/**
 * Everything main owns for the whole life of the process: the stores rooted
 * at `userData`, the two per-panel-id lifecycle managers, and the git-backed
 * review graph.
 *
 * THE DECLARATION ORDER IN `createStores` IS LOAD-BEARING and is the order
 * these were in at main/index.ts's module scope, unchanged. Three pairs here
 * close over each other FORWARDS — `reviewEngine` reads `baselineCapture`,
 * `ptyManager` reads `worktreeManager` and `scrollbackLog` — which is legal
 * because every one of those reads happens inside a callback that cannot run
 * until a real invoke or a real PTY exists, long after this function returns.
 * Reordering to "fix" a forward reference, or hoisting one of them into its
 * own factory, turns a working closure into a temporal-dead-zone throw on the
 * first review or the first spawn.
 */
export interface Stores {
  layoutStore: LayoutStore
  layoutSnapshots: ReturnType<typeof createLayoutSnapshots>
  credentialStore: CredentialStore
  gitRunner: ReturnType<typeof createGitRunner>
  reviewEngine: ReviewEngine
  reviewDiscard: ReturnType<typeof createReviewDiscarder>
  reviewCommit: ReturnType<typeof createReviewCommitter>
  baselineCapture: ReturnType<typeof createBaselineCapture>
  /** The hook `PtyManager` and `agent:create` both fire; the store's guard makes it once-only. */
  captureBaseline: (panelId: string, cwd: string) => void
  /** kill()'s baseline hook: poison an in-flight capture AND drop the persisted record. */
  dropBaseline: (panelId: string) => void
  runLedger: ReturnType<typeof createRunLedger>
  /** M306. One file per check run's exact output, referenced by `RunRow.outputId`. */
  checkOutputs: CheckOutputStore
  agentTranscripts: ReturnType<typeof createAgentTranscriptLog>
  scrollbackLog: ReturnType<typeof createScrollbackLog>
  worktreeManager: ReturnType<typeof createWorktreeManager>
  ptyManager: PtyManager
  fileWatchers: FileWatchers
  toolboxCache: ToolboxCache
  memoryStore: ReturnType<typeof createMemoryStore>
  teammateMemory: ReturnType<typeof createMemoryStore>
  brokerAudit: ReturnType<typeof createBrokerAudit>
  attention: ReturnType<typeof createAttentionUnion>
  /** M54. Declared ABOVE the manager, which carries them into every spawn's env. */
  controlSocketPath: string
  launcherDir: string
  /** Brief #20. Which panels had a session when the window last went away. */
  lastExit: LastExitStore
}

export function createStores(state: MainState): Stores {
  // userData is the standard per-user application directory; app.getPath is
  // only valid once the app module is loaded, which it is by the time this runs.
  const userData = app.getPath('userData')

  // M93. Snapshots of saves, beside layout.json: a side effect of every successful write.
  const layoutSnapshots = createLayoutSnapshots({ dir: join(userData, 'layout-snapshots') })
  const layoutStore = createLayoutStore({
    filePath: join(userData, 'layout.json'),
    onWritten: (bytes) => { layoutSnapshots.record(bytes) }
  })

  // Its own file, deliberately not a key in layout.json. That file is rewritten
  // in full on a 500ms debounce, CLAUDE.md documents hand-editing it as a
  // supported path, and parseLayout copies a future-version one to .bak — which
  // is correct for a canvas and would silently duplicate a ciphertext.
  const credentialStore = createCredentialStore({
    filePath: join(userData, 'credentials.json'),
    crypto: createSafeStorageCrypto(),
    onWarning: (m) => console.warn('[credentials]', m)
  })

  // Getters for the reason PtyManager's getBackend is one: this runner is
  // constructed before resolveShellEnv() has run. Hoisted to a named const
  // rather than constructed inline per consumer: a second runner would carry
  // its own `warned` flag, and the "git not found" warning this repo
  // deliberately logs ONCE would log twice.
  const gitRunner = createGitRunner({ gitPath: () => state.gitPath, env: () => state.loginEnv })

  const reviewEngine = createReviewEngine({
    run: gitRunner,
    baselineOf: (panelId) => layoutStore.baseline(panelId),
    peersInRepo: (root, except) => layoutStore.baselinePeers(root, except),
    // Closes over baselineCapture, declared below — see the header's rule.
    // Never called until a real review:panel invoke lands, long after both
    // consts have been initialised.
    notARepo: (panelId) => baselineCapture.isNotARepo(panelId),
    repoUnreadable: (panelId) => baselineCapture.unreadableDetail(panelId),
    // M86. The worktree records for a root, with each panel's own title so a
    // section can be called what the user calls it.
    worktreesOf: (root) => {
      const titles = new Map<string, string | undefined>()
      for (const ws of layoutStore.mergedWorkspaces()) for (const panel of ws.panels) titles.set(panel.id, panel.title)
      return layoutStore.worktrees().filter((w) => w.root === root).map((w) => ({
        path: w.path, branch: w.branch, panelId: w.panelId,
        ...(titles.get(w.panelId) === undefined ? {} : { panelTitle: titles.get(w.panelId) })
      }))
    }
  })

  /**
   * Scratch indexes live under userData, never inside the repository being
   * committed: a scratch file in the tree would appear as an untracked file in
   * the very review about to be committed, and would be staged by a user who
   * pressed commit twice.
   *
   * One file per commit, named by timestamp and a counter rather than reused,
   * so two nodes committing in two repositories at the same moment cannot share
   * one index — which would produce a commit containing the other repository's
   * paths.
   */
  const scratchIndexDir = join(userData, 'git-index')
  let scratchIndexSeq = 0
  // M53. The subject's own peer count is the refusal the renderer cannot make
  // stale; removal is a FILE unlink through node, never a git write.
  const reviewDiscard = createReviewDiscarder({
    run: gitRunner,
    peersInRepo: (root, except) => layoutStore.baselinePeers(root, except),
    removeFile: (p) => unlinkSync(p),
    isDirectory: (p) => {
      try { return statSync(p).isDirectory() } catch { return false }
    },
    // M285. The engine's own identity read, so the re-check before a write
    // and the answer the person read are one computation.
    identityOf: (root, base) => reviewEngine.identityOf(root, base)
  })
  const reviewCommit = createReviewCommitter({
    run: gitRunner,
    tempIndexPath: () => {
      mkdirSync(scratchIndexDir, { recursive: true })
      return join(scratchIndexDir, `idx-${Date.now()}-${scratchIndexSeq++}`)
    },
    // Best effort: a scratch index that outlives its commit is a stale file in
    // a directory nothing else reads, and throwing here would turn a successful
    // commit into a rejected invoke.
    removeTempIndex: (p) => { try { rmSync(p, { force: true }) } catch { /* ignore */ } },
    identityOf: (root, base) => reviewEngine.identityOf(root, base)
  })

  // The once-only guard. Written here rather than inside PtyManager because the
  // store is the thing that knows whether a baseline already exists, and a
  // manager-held flag would be lost on the very reload this guard exists for.
  // The epoch half — a kill poisoning an in-flight capture so it cannot write
  // after the panel it belongs to is gone — lives in baseline-capture.ts,
  // tested in isolation under plain node (verify:review 35/35b) rather than
  // inline here, where nothing but a real Electron run could ever drive it.
  const baselineCapture = createBaselineCapture({
    baselineOf: (panelId) => layoutStore.baseline(panelId),
    setBaseline: (panelId, baseline) => layoutStore.setBaseline(panelId, baseline),
    resolveRepo: (cwd) => reviewEngine.resolveRepo(cwd),
    captureBaseline: (root) => reviewEngine.captureBaseline(root)
  })

  const captureBaseline = (panelId: string, cwd: string): void => baselineCapture.capture(panelId, cwd)

  // kill()'s baseline hook: poison any in-flight capture for this id (see
  // baseline-capture.ts) AND drop the persisted record, so neither an
  // in-flight write nor a stale on-disk one can reach a recycled id.
  const dropBaseline = (panelId: string): void => {
    baselineCapture.drop(panelId)
    layoutStore.dropBaseline(panelId)
    // M130. The trail's own per-panel state (offset/carry/entries/decoder,
    // all owned by skill-trail-read.ts) is forgotten at the same
    // panel-removing site PtyManager already calls this through — a recycled
    // panel id must not inherit a dead panel's trail, the same reason
    // dropPinnedSession exists.
    forgetTrail(panelId)
  }

  /**
   * M52. What each panel ran and how it ended — one JSON line per command end,
   * through its own append writer, capped. No output bytes: metadata only.
   */
  const runLedger = createRunLedger({ file: join(userData, 'runs.jsonl') })
  /**
   * M306. A check run's exact output, one file per run, in its OWN directory
   * so the ledger above stays the metadata-only file that is safe to paste.
   */
  const checkOutputs = createCheckOutputStore({ dir: join(userData, 'check-output') })
  // M73. One append-only transcript per chat panel, beside the scrollback logs.
  const agentTranscripts = createAgentTranscriptLog({ dir: join(userData, 'agent-transcripts') })

  // M54. Declared ABOVE the manager, which carries them into every spawn's env.
  const controlSocketPath = join(userData, 'control.sock')
  const launcherDir = join(userData, 'bin')

  // M43. The real OS attention surfaces. Every method reads live state through
  // a getter (focus and the two settings change constantly), and the whole
  // decision path — when to notify, when to beep — lives in PtyManager, tested
  // under plain node; this object only DOES what it is told. Confirmed by hand
  // against a real dock, a real notification and a real beep (manual-only list).
  const osAttention: AttentionSink = {
    notify: (panelId, label, count, body) => {
      if (!Notification.isSupported()) return
      const n = new Notification({
        title: label,
        // 4.1. The same words the pill and dock use (shared/attention-words.ts).
        body: body ?? (count > 1 ? `${needsYouNamed(label)} · ${needsYouCount(count)}` : needsYouNamed(label))
      })
      n.on('click', () => {
        const win = state.window
        if (win) {
          if (win.isMinimized()) win.restore()
          win.focus()
          // The Cmd+J path, never a wake: frame the panel that called for you.
          win.webContents.send(IPC_EVENTS.ATTENTION_JUMP, panelId)
        }
      })
      n.show()
    },
    badge: (count) => { app.dock?.setBadge(count > 0 ? String(count) : '') },
    beep: () => { shell.beep() },
    windowFocused: () => state.window?.isFocused() ?? false,
    notifyEnabled: () => layoutStore.getSetting('attention.notify') === true,
    soundEnabled: () => layoutStore.getSetting('attention.sound') === true
  }
  // M76. One badge, two authors, one writer: PtyManager's waiting set and
  // the approval tracker's each report their count to a child sink and the
  // dock badge reads the sum. See main/approvals.ts.
  const attention = createAttentionUnion(osAttention)

  const ptyManager = new PtyManager(
    () => state.window?.webContents ?? null,
    () => state.backend,
    // Getters, closing over layoutStore rather than reading it here: a value
    // read at construction would freeze the setting at its boot value, so
    // changing it in the palette would reach nothing until a relaunch. Both
    // are only ever called from a running PTY's callbacks.
    () => Number(layoutStore.getSetting('agent.idleAfterMs')),
    () => layoutStore.getSetting('agent.bell') === true,
    captureBaseline,
    dropBaseline,
    (panelId) => layoutStore.session(panelId),
    (panelId, sessionId) => layoutStore.setSession(panelId, sessionId),
    (panelId) => layoutStore.dropSession(panelId),
    // The real transcript reader and the flush cap keep their defaults.
    undefined,
    undefined,
    undefined,
    // M37. Closes over worktreeManager, declared below — the same forward
    // closure captureBaseline already relies on; never called before a real
    // pty:create lands.
    (panelId, cwd) => worktreeManager.ensureForPanel(panelId, cwd),
    // M39. The durable log, gated per flush on the setting so the toggle takes
    // effect on the next flush rather than the next launch.
    {
      append: (panelId, data) => { void scrollbackLog.append(panelId, data) },
      drop: (panelId) => { void scrollbackLog.drop(panelId) },
      enabled: () => layoutStore.getSetting('scrollback.persist') === true
    },
    // M43's OS sink, through M76's union — declared above the manager.
    attention.forPty,
    // M52. The run ledger (an append stream beside layout.json) and the
    // shell-integration directory the rc files are written under. Declared
    // above this construction because they are values, not getters.
    {
      ledger: runLedger, integrationDir: join(userData, 'shell-integration'), now: () => Date.now(), control: { socket: controlSocketPath, binDir: launcherDir },
      // M286. The stamp a ledger row carries: the panel's baseline, read at
      // the moment of use (the store is the thing that knows it), through
      // the engine's one identity computation.
      identityOf: (panelId) => {
        const b = layoutStore.baseline(panelId)
        return b === undefined ? Promise.resolve(undefined) : reviewEngine.identityOf(b.root, b.sha)
      },
      // M306. A marked shell command's exact output, as its D mark lands.
      outputs: checkOutputs
    }
  )

  /**
   * M39. One file per panel under userData, appended from the flush and read
   * by the dormant card, search and export. An append stream, deliberately not
   * layout-store's temp-and-rename — see scrollback-log.ts.
   */
  const scrollbackLog = createScrollbackLog({ dir: join(userData, 'scrollback') })

  /**
   * M37. Worktrees live under userData, never inside the repository — inside it
   * they would be untracked files in the main checkout's own `git status` and
   * in every review of a panel spawned there. Records live in layout.json
   * beside baselines and sessions; the manager reads and writes them through
   * the store so a relaunch finds them.
   */
  const worktreeManager = createWorktreeManager({
    run: gitRunner,
    resolveRepo: (cwd) => reviewEngine.resolveRepo(cwd),
    worktreesDir: join(userData, 'worktrees'),
    records: {
      forPanel: (panelId, root) => layoutStore.worktreeForPanel(panelId, root),
      add: (record) => layoutStore.addWorktree(record),
      drop: (id) => layoutStore.dropWorktree(id),
      list: () => layoutStore.worktrees()
    }
  })

  // One instance for the app's whole lifetime, alongside ptyManager: both are
  // per-panel-id lifecycle managers with the same two teardown seams (a
  // renderer reload, and a real quit) — see window-lifecycle's callback and
  // before-quit.
  const fileWatchers = new FileWatchers()
  // Keyed by cwd, so twelve panels in one repository share one answer rather
  // than parsing the same 93 KB ~/.claude.json twelve times. See ToolboxCache.
  const toolboxCache = new ToolboxCache()

  const memoryStore = createMemoryStore({ dir: join(userData, 'memory') })
  // M100. A teammate's memory is its own file through the SAME store, a second
  // instance over memory/teammates — beside the repository's, never inside it.
  const teammateMemory = createMemoryStore({ dir: join(userData, 'memory', 'teammates') })

  /**
   * M87. The audit file beside the run ledger. Wired to the control handler
   * only: no IPC channel reaches the broker, so the renderer can neither spend
   * a credential nor see what an agent spent — it reads these rows and nothing
   * else.
   */
  const brokerAudit = createBrokerAudit({ file: join(userData, 'broker-audit.jsonl') })
  // Brief #20. Read and deleted HERE, at construction — see last-exit.ts.
  const lastExit = createLastExitStore({ file: join(userData, 'last-exit.json') })

  return {
    layoutStore, layoutSnapshots, credentialStore, gitRunner, reviewEngine,
    reviewDiscard, reviewCommit, baselineCapture, captureBaseline, dropBaseline,
    runLedger, checkOutputs, agentTranscripts, scrollbackLog, worktreeManager, ptyManager,
    fileWatchers, toolboxCache, memoryStore, teammateMemory, brokerAudit,
    attention, controlSocketPath, launcherDir, lastExit
  }
}
