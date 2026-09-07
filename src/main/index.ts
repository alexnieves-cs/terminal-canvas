import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { mkdirSync, rmSync, existsSync, unlinkSync, statSync, writeFileSync, chmodSync, readFileSync, readdirSync } from 'node:fs'
import { BrowserWindow, Notification, app, dialog, shell, clipboard, session, webContents } from 'electron'
import { registerIpcHandlers, requestCanvasCounts, requestFromRenderer, requestFromRendererWith } from './ipc'
import { createBrowserHandlers } from './browser-read'
import { buildAppMenu } from './menu'
import { PtyManager, expandTilde, resolveCwd } from './pty-manager'
import { skillWriteHandlers } from './skill-write'
import { resolveToolboxHome } from './toolbox-read'
import { buildPushArgs } from './git-args'
import { createBoardLane } from './board-lane'
import { createPlacesGate, fsRealpath } from './places'
import { createRoutineRunner } from './routine-runner'
import { routineRefusal, ROUTINE_MIN_MS } from '@shared/routines'
import { parseTeammates, parseRoutines } from '@shared/layout-schema'
import { resolveSpawnRequest } from './spawn-request'
import { createDirectBackend, type SessionBackend } from './session-backend'
import { probeTmux } from './tmux-probe'
import { resolveSocket } from './tmux-args'
import { attachPtyLifecycle } from './window-lifecycle'
import { resolveShellEnv, shellProbeOutcome, shellProbeFacts, reprobeShellEnv, whichFromEnv } from './shell-env'
import { buildEnvReport, type CliName } from './env-report'
import { resolveLinkOpen } from './link-open'
import { createRunLedger } from './run-ledger'
import { createLayoutSnapshots, restoreFromSnapshot } from './layout-snapshots'
import { createLayoutStore } from './layout-store'
import { createCredentialStore } from './credential-store'
import { createSafeStorageCrypto } from './credential-crypto'
import { createReviewEngine } from './review-engine'
import { createReviewCommitter } from './review-commit'
import { createReviewDiscarder } from './review-discard'
import { createControlServer, type ControlServer } from './control-server'
import { createControlHandler } from './control-handler'
import { createMemoryStore } from './memory-store'
import { createBroker } from './broker'
import { listAssignedWorkItems as listGithubWorkItems, openPullRequest, commentIssue } from './github-client'
import { createHttpsBrokerFetcher } from './credential-verify'
import { createBrokerAudit } from './broker-audit'
import { readVault } from './vault-read'
import type { ControlCanvasModel , BoardControlReply, BoardControlRequest } from '../shared/ipc-contract'
import { parseControlUrl, CONTROL_SCHEME } from './control-protocol'
import { launcherScript, writeLauncher } from './launcher'
import { findOrphans, orphanPrompt } from './orphans'
import { createExporters } from './export'
import type { OrphanRow } from '../shared/orphans'
import { createGitRunner } from './git-runner'
import { createBaselineCapture, staleBaselineIds } from './baseline-capture'
import { createWorktreeManager } from './worktree-manager'
import { randomUUID } from 'node:crypto'
import { runQuit } from './quit'
import { AgentSessionManager } from './agent-session'
import { claudeCliRunner } from './claude-cli-runner'
import { listPlugins, PLUGIN_LIST_TIMEOUT_MS, type PluginRunner } from './plugin-list'
import { describePlugin } from './plugin-details'
import { createAgentTranscriptLog } from './agent-transcript-log'
import { importClaudeTranscript } from './claude-transcript-import'
import { resolveAttachment, ATTACHMENT_MAX_BYTES } from './attachments'
import { telemetryPlan, scrubEvent } from './telemetry'
import { createApprovalTracker, createAttentionUnion, type ApprovalTracker } from './approvals'
import { allTemplates, isBuiltInTemplate, type PersistedTemplate } from '../shared/templates'
import type { AttentionSink } from './pty-manager'
import { resolveTranscript, readFrom as readTranscriptFrom } from './transcript-reader'
import { trailFor, forgetTrail } from './skill-trail-read'
import type { AgentHandlers } from './ipc'
import { REASON_NO_CODEX, REASON_CODEX_NO_IMAGES, type AgentCreateResult, type AgentSessionSpec } from '../shared/agent-session'
import { BACKENDS, backendOf, type AgentBackend } from '../shared/agent-backends'
import { createScrollbackLog, SEARCH_MAX_HITS, SEARCH_MAX_PER_PANEL } from './scrollback-log'
import { FileWatchers } from './file-watch'
import { spawn as spawnChild, execFileSync, execFile } from 'node:child_process'
import { watch as fsWatch, realpathSync, type FSWatcher } from 'node:fs'
import { createWatchRunner, type WatchSpawnSpec, type WatchHandlers } from './watch-runner'
import { WATCH_TIMER_MIN_MS, type WatchTrigger } from '../shared/watch-trigger'
import type { WatcherHandlers } from './ipc'
import { ToolboxCache } from './toolbox-cache'
import { IPC_EVENTS } from '../shared/ipc-contract'
import {
  allPresets,
  mintPromptId,
  presetFromCapture,
  presetRows,
  pushDefaultPreset,
  resolveAvailability,
  templateOf
} from './presets'
import { mergePrompts, readProjectPrompts } from './prompts'
import { parseShelf } from '../shared/skills'
import type { CapturedPanel } from '../shared/ipc-contract'

let mainWindow: BrowserWindow | null = null
/** M48. When the startup probe ran; the report says so, since it never re-runs. */
let probedAt = 0

/**
 * Whether this process owns the app. TWO COPIES OF ONE BUILD ARE DESTRUCTIVE
 * TO EACH OTHER, and silently: they share one userData directory, so one
 * store's coalesced write lands on top of the other's, and they resolve the
 * SAME tmux socket, so before-quit's default shutdown() — kill-server — destroys the
 * OTHER instance's running agents with nothing said anywhere. Reachable by
 * double-clicking the dock icon while a copy is already open, which
 * window-all-closed's darwin branch makes easy: an instance with no window is
 * still an instance, and still holds the socket.
 *
 * The dev build is NOT the pair this blocks. app.getName() differs between the
 * two ('terminal-canvas' from package.json versus the packaged productName
 * 'Terminal Canvas'), so they already have separate userData paths and
 * separate locks, and resolveSocket already gives them separate sockets. What
 * is left is two copies of the SAME build, which is exactly the destructive
 * case and nothing else.
 *
 * TC_ALLOW_MULTI is a developer escape hatch with no UI, the same shape as
 * TC_TMUX_SOCKET — and it is only safe in combination with that override,
 * since two instances sharing one socket is the whole hazard above.
 */
const allowMultipleInstances = process.env['TC_ALLOW_MULTI']?.trim() === '1'
const hasInstanceLock = allowMultipleInstances || app.requestSingleInstanceLock()
if (!hasInstanceLock) {
  console.warn(
    '[startup] another instance of this build is already running; ' +
      'focusing it and quitting. Set TC_ALLOW_MULTI=1 (with TC_TMUX_SOCKET) ' +
      'to run a second one deliberately.'
  )
  app.quit()
}

/**
 * Which backend spawns panels. Reassigned once by the startup probe; a
 * DirectBackend is the value until then, so a pty:create that somehow arrives
 * before the probe finishes still works rather than throwing.
 */
let backend: SessionBackend = createDirectBackend('startup: tmux not probed yet')

/**
 * The login-shell env, resolved once inside app.whenReady(). Reassigned once
 * by startup, same pattern as `backend` just above: `rebuildMenu` needs it to
 * compute preset availability but runs after that resolution, so this is
 * where it lands rather than a local inside whenReady.
 */
let loginEnv: Record<string, string> = {}

// userData is the standard per-user application directory; app.getPath is only
// valid once the app module is loaded, which it is by the time this module runs.
// M93. Snapshots of saves, beside layout.json: a side effect of every successful write.
const layoutSnapshots = createLayoutSnapshots({ dir: join(app.getPath('userData'), 'layout-snapshots') })
const layoutStore = createLayoutStore({
  filePath: join(app.getPath('userData'), 'layout.json'),
  onWritten: (bytes) => { layoutSnapshots.record(bytes) }
})

/** M112. Decided once, after the store loads; read by createWindow for the renderer's flag. */
let telemetryOn = false

// Its own file, deliberately not a key in layout.json. That file is rewritten
// in full on a 500ms debounce, CLAUDE.md documents hand-editing it as a
// supported path, and parseLayout copies a future-version one to .bak — which
// is correct for a canvas and would silently duplicate a ciphertext.
const credentialStore = createCredentialStore({
  filePath: join(app.getPath('userData'), 'credentials.json'),
  crypto: createSafeStorageCrypto(),
  onWarning: (m) => console.warn('[credentials]', m)
})

/**
 * The ABSOLUTE path to git, resolved from the login env at whenReady — null
 * until then, and null forever on a machine with no git on that PATH.
 *
 * Resolved rather than spawned by name for the reason tmux is: launchd gives
 * a GUI app a bare PATH, so a homebrew-only git is simply not found, and the
 * bare-name spawn then produced a silent no-Changes-section instead of the
 * `git-missing` arm that exists for exactly this. The app already computed
 * this answer for its startup diagnostic and threw it away.
 */
let gitPath: string | null = null
// M71. The agent-session runtime — a conversation with the installed `claude`
// in headless mode, not a PTY. Constructed after the env probe for the same
// reason the PtyManager is: it needs the login environment (how the CLI
// finds its login and its config) and the CLI's resolved path. Null until
// then; nothing can reach it before the window exists. No IPC channel names
// it yet — M72's chat panel is its first caller — but it is wired into the
// quit sequence now so a process it owns can never outlive the app.
let agentSessions: AgentSessionManager | null = null
// M76. Assigned beside it once the runtime exists; create() re-syncs through it.
let approvals: ApprovalTracker | null = null
let claudePath: string | null = null
/** M90. The second headless CLI, from the same probe. Null means the codex chat row is disabled by name. */
let codexPath: string | null = null

// Getters for the reason PtyManager's getBackend is one: this runner is
// constructed at module scope, and resolveShellEnv() has not run yet. Hoisted
// to a named const rather than constructed inline per consumer: a second
// runner would carry its own `warned` flag, and the "git not found" warning
// this repo deliberately logs ONCE would log twice.
const gitRunner = createGitRunner({ gitPath: () => gitPath, env: () => loginEnv })

const reviewEngine = createReviewEngine({
  run: gitRunner,
  baselineOf: (panelId) => layoutStore.baseline(panelId),
  peersInRepo: (root, except) => layoutStore.baselinePeers(root, except),
  // Closes over baselineCapture, declared below — the same forward-closure
  // this manager already relies on for layoutStore one line up. Never
  // called until a real review:panel invoke lands, long after both consts
  // have been initialised.
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
const scratchIndexDir = join(app.getPath('userData'), 'git-index')
let scratchIndexSeq = 0
// M53. The subject's own peer count is the refusal the renderer cannot make
// stale; removal is a FILE unlink through node, never a git write.
const reviewDiscard = createReviewDiscarder({
  run: gitRunner,
  peersInRepo: (root, except) => layoutStore.baselinePeers(root, except),
  removeFile: (p) => unlinkSync(p),
  isDirectory: (p) => {
    try { return statSync(p).isDirectory() } catch { return false }
  }
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
  removeTempIndex: (p) => { try { rmSync(p, { force: true }) } catch { /* ignore */ } }
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
  // M129. The trail's own per-panel state (offset/carry/entries/decoder,
  // all owned by skill-trail-read.ts) is forgotten at the same
  // panel-removing site PtyManager already calls this through — a recycled
  // panel id must not inherit a dead panel's trail, the same reason
  // dropPinnedSession exists.
  forgetTrail(panelId)
}

// The manager needs a way to reach the live renderer; a getter rather than a
// captured reference keeps it correct across window reloads. The backend is a
// getter for the same reason — the probe that chooses it is async and has not
// run when this module is evaluated.
/**
 * M52. What each panel ran and how it ended — one JSON line per command end,
 * through its own append writer, capped. No output bytes: metadata only.
 */
const runLedger = createRunLedger({ file: join(app.getPath('userData'), 'runs.jsonl') })
// M73. One append-only transcript per chat panel, beside the scrollback logs.
const agentTranscripts = createAgentTranscriptLog({ dir: join(app.getPath('userData'), 'agent-transcripts') })

// M54. Declared ABOVE the manager, which carries them into every spawn's env.
const controlSocketPath = join(app.getPath('userData'), 'control.sock')
const launcherDir = join(app.getPath('userData'), 'bin')
let controlServer: ControlServer | null = null

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
      body: body ?? (count > 1 ? `${label} wants you (${count} panels waiting)` : `${label} wants you`)
    })
    n.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
        // The Cmd+J path, never a wake: frame the panel that called for you.
        mainWindow.webContents.send(IPC_EVENTS.ATTENTION_JUMP, panelId)
      }
    })
    n.show()
  },
  badge: (count) => { app.dock?.setBadge(count > 0 ? String(count) : '') },
  beep: () => { shell.beep() },
  windowFocused: () => mainWindow?.isFocused() ?? false,
  notifyEnabled: () => layoutStore.getSetting('attention.notify') === true,
  soundEnabled: () => layoutStore.getSetting('attention.sound') === true
}
// M76. One badge, two authors, one writer: PtyManager's waiting set and
// the approval tracker's each report their count to a child sink and the
// dock badge reads the sum. See main/approvals.ts.
const attention = createAttentionUnion(osAttention)

const ptyManager = new PtyManager(
  () => mainWindow?.webContents ?? null,
  () => backend,
  // Getters, closing over layoutStore rather than reading it here: the store
  // is constructed ABOVE this line, and a value read at construction would
  // also freeze the setting at its boot value, so changing it in the palette
  // would reach nothing until a relaunch. Both are only ever called from a
  // running PTY's callbacks, long after module evaluation.
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
  { ledger: runLedger, integrationDir: join(app.getPath('userData'), 'shell-integration'), now: () => Date.now(), control: { socket: controlSocketPath, binDir: launcherDir } }
)

/**
 * M39. One file per panel under userData, appended from the flush and read
 * by the dormant card, search and export. An append stream, deliberately not
 * layout-store's temp-and-rename — see scrollback-log.ts.
 */
const scrollbackLog = createScrollbackLog({ dir: join(app.getPath('userData'), 'scrollback') })

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
  worktreesDir: join(app.getPath('userData'), 'worktrees'),
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
// before-quit below.
const fileWatchers = new FileWatchers()
// Keyed by cwd, so twelve panels in one repository share one answer rather
// than parsing the same 93 KB ~/.claude.json twelve times. See ToolboxCache.
const toolboxCache = new ToolboxCache()

/**
 * Reset is the only action in the app Cmd+Z cannot take back, which is exactly
 * why it is the only one that asks. The message NAMES what is about to be lost
 * — a generic "Are you sure?" trains people to click through the one that
 * mattered, and closing seven idle panels is not the same act as closing seven
 * running agents.
 */
async function confirmReset(): Promise<void> {
  const window = mainWindow
  if (!window) return
  const { panels, running } = await requestCanvasCounts(window.webContents)
  const detail =
    running > 0
      ? `${panels} panel${panels === 1 ? '' : 's'} will be closed, including ${running} running process${running === 1 ? '' : 'es'}. This cannot be undone.`
      : `${panels} panel${panels === 1 ? '' : 's'} will be closed. This cannot be undone.`
  // M93. Reset stays final, and the dialog says where the past is kept.
  const kept = layoutSnapshots.list().length
  const detailWithHistory = kept > 0 ? `${detail} ${kept} snapshot${kept === 1 ? '' : 's'} of earlier saves exist — restore one from the Workspaces pane.` : detail

  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    message: 'Reset this canvas?',
    detail: detailWithHistory,
    buttons: ['Cancel', 'Reset Canvas'],
    // Cancel is the default, so Return dismisses rather than destroys.
    defaultId: 0,
    cancelId: 0
  })
  if (response !== 1) return

  layoutStore.reset()
  layoutStore.flushSync()
  window.webContents.send(IPC_EVENTS.CANVAS_RESET)
}

/**
 * The login environment is already resolved above, so availability costs
 * nothing extra — it is the same whichFromEnv the startup diagnostic runs.
 * Probed ONCE: a brew install mid-session is not noticed until relaunch,
 * which is a known limit rather than a bug.
 */
const which = (command: string): string | null => whichFromEnv(command, loginEnv)

/**
 * M125. The real `PluginRunner`: `claude plugin list --json` over
 * `child_process`, resolved through the SAME `claudePath` the startup probe
 * already found (or the bare name, which `listPlugins` turns into `unknown`
 * on the resulting ENOENT — never a throw). Kept to the shape `listPlugins`
 * needs (stdout + exit code) rather than the full `AgentProcess` streaming
 * shape agent-runner.ts defines: this is one call-and-done, not a
 * conversation.
 */
const runClaudePluginList: PluginRunner = () =>
  new Promise((resolve) => {
    execFile(claudePath ?? 'claude', ['plugin', 'list', '--json'], { env: loginEnv, timeout: PLUGIN_LIST_TIMEOUT_MS }, (error, stdout) => {
      // Absent binary (ENOENT), a non-zero exit, or any other spawn failure
      // all read the same way here: `listPlugins` only asks whether the code
      // was zero, so any error becomes a non-zero code rather than a thrown
      // rejection this Promise never produces.
      if (error !== null) {
        resolve({ stdout: '', code: 1 })
        return
      }
      resolve({ stdout, code: 0 })
    })
  })

/**
 * M127. The real details runner, per id. Built the same way as
 * `runClaudePluginList` and deliberately not folded into it: `describePlugin`
 * takes a zero-argument runner (the id rides in this closure) so the timeout
 * race in `plugin-list.ts` can be shared byte for byte.
 */
const runClaudePluginDetails = (id: string): PluginRunner => () =>
  new Promise((resolve) => {
    execFile(claudePath ?? 'claude', ['plugin', 'details', id], { env: loginEnv, timeout: PLUGIN_LIST_TIMEOUT_MS }, (error, stdout) => {
      if (error !== null) {
        resolve({ stdout: '', code: 1 })
        return
      }
      resolve({ stdout, code: 0 })
    })
  })

/**
 * Spawn from a preset, by id. NAMED rather than inlined into the menu's
 * options, because the palette picks presets too (PRESET_SPAWN_BY_ID) and the
 * two picks have to be the identical code — a second copy is a second place
 * for "which preset does this id mean" to answer differently.
 */
function onSpawnPreset(id: string): void {
  const user = layoutStore.presets()
  const found = allPresets(user).find((p) => p.id === id)
  if (!found) {
    // Never substitute a different preset: spawning the wrong program in
    // the wrong directory is worse than spawning nothing.
    console.warn(`[presets] a pick named ${id}, which no longer exists`)
    return
  }
  mainWindow?.webContents.send(IPC_EVENTS.PRESET_SPAWN, templateOf(found))
}

function rebuildMenu(): void {
  buildAppMenu({
    settingValue: (id) => layoutStore.getSetting(id),
    onToggleSetting: (id, value) => {
      layoutStore.setPreference(id, value)
      // M45. The menu is main's, so the renderer never sees this write
      // unless told — and a theme radio that applies on the next Cmd+K is
      // a picker that appears to do nothing.
      mainWindow?.webContents.send(IPC_EVENTS.SETTINGS_CHANGED, id)
    },
    onReset: () => {
      void confirmReset()
    },
    presets: resolveAvailability(allPresets(layoutStore.presets()), which),
    onSpawnPreset,
    // M65. The sheet is the renderer's; the menu only asks for it.
    onOpenSheet: () => { mainWindow?.webContents.send(IPC_EVENTS.SPAWN_OPEN_SHEET) },
    onTidy: () => { mainWindow?.webContents.send(IPC_EVENTS.CANVAS_TIDY) },
    onFlip: () => { mainWindow?.webContents.send(IPC_EVENTS.CANVAS_FLIP) },
    onSavePreset: () => {
      void savePresetFromFocusedPanel()
    }
  })
}

/**
 * The three things every preset change has to do. Deleting the default one
 * changes what Cmd+N spawns, and the renderer only learns that from a
 * PRESET_DEFAULT push — without it the old template stays in defaultTemplateRef
 * and Cmd+N keeps spawning a preset the user just deleted.
 */
function afterPresetChange(): void {
  rebuildMenu()
  if (mainWindow) pushDefaultPreset(mainWindow.webContents, layoutStore)
}

async function savePresetFromFocusedPanel(): Promise<void> {
  const wc = mainWindow?.webContents
  // A windowless app with a live menu bar is ORDINARY on darwin, not a
  // can't-happen: window-all-closed deliberately does not quit there, so
  // Cmd+W leaves this menu item clickable with nobody to ask. Returning
  // silently is the same posture confirmReset takes one screenful up — there
  // is no panel to save and no window to put a dialog over, so the only
  // honest answer is to do nothing.
  if (!wc) return
  const captured = await requestFromRenderer<CapturedPanel | null>(
    wc,
    IPC_EVENTS.PRESET_CAPTURE,
    null
  )
  if (!captured) {
    // Loud, not silent: a menu item that does nothing is indistinguishable
    // from a broken one.
    await dialog.showMessageBox({
      type: 'info',
      message: 'Focus a panel first',
      detail: 'Click into the panel you want to save, then try again.'
    })
    return
  }
  const preset = presetFromCapture(layoutStore.presets(), captured)
  layoutStore.addPreset(preset)
  rebuildMenu()
}

/**
 * M54. ONE handler behind both doors — the socket below and the URL scheme —
 * over the same store, the same templateOf and the same PRESET_SPAWN send a
 * menu pick uses. A request may arrive with the window closed (darwin keeps
 * the app running) or still loading (a launch-time URL), so the send waits
 * for the renderer rather than sending into a page that is not there yet.
 */
const sendToRenderer = (channel: string, payload: unknown): void => {
  if (mainWindow === null || mainWindow.isDestroyed()) createWindow()
  const win = mainWindow
  if (win === null) return
  const wc = win.webContents
  if (wc.isLoading()) wc.once('did-finish-load', () => wc.send(channel, payload))
  else wc.send(channel, payload)
  if (win.isMinimized()) win.restore()
  win.show()
}
const memoryStore = createMemoryStore({ dir: join(app.getPath('userData'), 'memory') })
// M100. THE PLACES GATE: asked before any spawn resolves a cwd and before a
// file verb answers for a request that names a teammate. Main's, never the
// renderer's — a UI affordance is not an authority boundary.
// M100. A teammate's memory is its own file through the SAME store, a second
// instance over memory/teammates — beside the repository's, never inside it.
const teammateMemory = createMemoryStore({ dir: join(app.getPath('userData'), 'memory', 'teammates') })
const TEAMMATE_ROOT = 'teammate:'
const teammateSlug = (root: string): string => { const id = root.slice(TEAMMATE_ROOT.length); return layoutStore.teammates().find((t) => t.id === id)?.memory ?? id }
// M101. The routine runner: intervals in main, the tick answered by the
// renderer (only it mints panels). Re-armed on every save and delete; a tick
// that fell while the app was closed is marked MISSED at arm, never fired.
const routineRunner = createRoutineRunner({
  now: () => Date.now(),
  setInterval: (fn, ms) => { const t = setInterval(fn, ms); t.unref?.(); return t },
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  fire: (routine) => { mainWindow?.webContents.send(IPC_EVENTS.ROUTINE_FIRE, routine) },
  save: (routine) => layoutStore.saveRoutine(routine)
})
const armRoutines = (startup = false): string[] => routineRunner.arm(layoutStore.routines(), { startup })
// M102. A session TOKEN per chat, minted into its environment: `tc api` from
// inside the chat carries it, and the control handler maps it back to the
// panel that really asked — a claimed panelId beside it is ignored. Memory
// only; a relaunch mints fresh ones, which is right (the old shells are gone).
const panelTokens = new Map<string, string>()
const tokenOfPanel = (id: string): string => {
  let t = panelTokens.get(id)
  if (t === undefined) { t = randomBytes(16).toString('hex'); panelTokens.set(id, t) }
  return t
}
const panelOfToken = (token: string): string | undefined => { for (const [id, t] of panelTokens) if (t === token) return id; return undefined }
const placesGate = createPlacesGate({
  realpath: fsRealpath,
  teammate: (id) => layoutStore.teammates().find((t) => t.id === id),
  // M114. A lane under userData/worktrees is judged by the repository it forks.
  worktreeRootOf: (path) => layoutStore.worktrees().find((w) => w.path === path)?.root
})
// M114. The lane a dispatch mints: the repository under the teammate's places
// (origin read by git, one level deep), the gate on its root, the worktree.
const boardLane = createBoardLane({
  gate: placesGate,
  worktrees: { ensureForPanel: (panelId, cwd) => worktreeManager.ensureForPanel(panelId, cwd) },
  teammate: (id) => layoutStore.teammates().find((t) => t.id === id),
  recordFor: (panelId, root) => layoutStore.worktreeForPanel(panelId, root),
  originOf: (dir) => { try { return execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim() || null } catch { return null } },
  subdirs: (dir) => { try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => join(dir, d.name)) } catch { return [] } }
})

/**
 * M85. Main's OWN watch on the vault root, so a note an agent writes into the
 * folder reaches the pane with no gesture. One recursive watch, replaced when
 * the root changes, debounced so a save that touches several files is one
 * event, and never opening a window (the send goes only to one that exists).
 */
let vaultWatch: { root: string; watcher: FSWatcher } | null = null
let vaultChangedTimer: NodeJS.Timeout | null = null
const armVaultWatch = (root: string): void => {
  if (vaultWatch !== null && vaultWatch.root === root) return
  vaultWatch?.watcher.close()
  vaultWatch = null
  let isDir = false
  try { isDir = statSync(root).isDirectory() } catch { isDir = false }
  if (!isDir) return
  try {
    const watcher = fsWatch(root, { persistent: false, recursive: true }, () => {
      if (vaultChangedTimer !== null) clearTimeout(vaultChangedTimer)
      vaultChangedTimer = setTimeout(() => {
        vaultChangedTimer = null
        const wc = mainWindow !== null && !mainWindow.isDestroyed() ? mainWindow.webContents : null
        if (wc !== null && !wc.isLoading()) wc.send(IPC_EVENTS.VAULT_CHANGED)
      }, 250)
      vaultChangedTimer.unref?.()
    })
    watcher.on('error', () => { vaultWatch?.watcher.close(); vaultWatch = null })
    vaultWatch = { root, watcher }
  } catch { /* no watch; the refresh control still works */ }
}
/** M84. The watcher runner, once it exists — read by the quit sequence. */
let watchRunnerRef: { disposeAll(): void } | null = null

/**
 * M87. The broker over the credential store — the store's LAST reader — with
 * the real HTTPS fetcher and an audit file beside the run ledger. Wired to
 * the control handler only: no IPC channel reaches it, so the renderer can
 * neither spend a credential nor see what an agent spent.
 */
const brokerAudit = createBrokerAudit({ file: join(app.getPath('userData'), 'broker-audit.jsonl') })
// M102. A panel's teammate is MAIN's own record (the chat's `teammateId`),
// never the CLI's claim; the grant is the roster's; a write asks on the
// teammate's chat through the manager's external question — the one door.
const teammateOfPanel = (panelId: string): string | undefined => {
  for (const ws of layoutStore.mergedWorkspaces()) for (const p of ws.panels) if (p.id === panelId && p.kind === 'chat') return p.chat.teammateId
  return undefined
}
const chatOfTeammate = (teammateId: string, preferred?: string): string | undefined => {
  const live = agentSessions?.list().map((s) => s.id) ?? []
  if (preferred !== undefined && live.includes(preferred)) return preferred
  for (const ws of layoutStore.mergedWorkspaces()) for (const p of ws.panels) if (p.kind === 'chat' && p.chat.teammateId === teammateId && live.includes(p.id)) return p.id
  return undefined
}
const broker = createBroker({
  store: credentialStore, fetcher: createHttpsBrokerFetcher(), audit: brokerAudit,
  services: (teammateId) => layoutStore.teammates().find((t) => t.id === teammateId)?.services,
  account: (service) => credentialStore.list().find((c) => c.service === service)?.label,
  approve: async (ask) => {
    const chatId = chatOfTeammate(ask.teammateId, ask.panelId)
    if (chatId === undefined || agentSessions === null) return false
    return agentSessions.askExternal(chatId, ask.service, { command: `${ask.method} ${ask.path}`, account: ask.account, cost: ask.cost }, `${ask.method} ${ask.path} as ${ask.account} · cost: ${ask.cost} (as stated by the caller)`)
  }
})

/** M83. A directory's repository root, or the directory itself when git does not own it. */
const memoryRoot = async (path: string): Promise<string> => {
  if (path === '') return path
  const answer = await reviewEngine.resolveRepo(path)
  return answer.kind === 'root' ? answer.root : path
}

const controlHandler = createControlHandler({
  // M87. The one verb that can spend a credential.
  broker,
  teammateOf: teammateOfPanel,
  panelOfToken,
  presets: () => allPresets(layoutStore.presets()),
  defaultId: () => layoutStore.defaultPresetId() || null,
  spawn: (preset, cwd) => {
    const template = templateOf(preset)
    if (cwd !== undefined) template.cwd = cwd
    sendToRenderer(IPC_EVENTS.PRESET_SPAWN, template)
  },
  list: () => ptyManager.list().map((r) => ({ panelId: r.panelId, pid: r.pid, command: r.command, cwd: r.cwd })),
  // M81. `tc status`: the RENDERER's own model — it is the only side that
  // knows a panel's state word, its edges and its runs. Asked over the
  // ephemeral reply channel canvas:counts already uses; a window that does
  // not answer yields null, which the handler turns into an empty model
  // WITH a note.
  // M83. The project memory: one store for the app, keyed per repository.
  // The control door resolves the root through the SAME `memoryRoot` the IPC
  // door uses. An agent runs `tc memory add` wherever its shell is standing,
  // which is usually a subdirectory: without this its memories land in a file
  // the node and the chat never read, and every door still shows a plausible
  // non-empty list (M83's verifier).
  memory: {
    // M100. The teammate prefix routes here as it does at the IPC door.
    list: async (root, limit) => root.startsWith(TEAMMATE_ROOT) ? teammateMemory.list(teammateSlug(root), limit) : memoryStore.list(await memoryRoot(root), limit),
    add: async (req) => req.root.startsWith(TEAMMATE_ROOT) ? teammateMemory.add({ ...req, root: teammateSlug(req.root) }) : memoryStore.add({ ...req, root: await memoryRoot(req.root) })
  },
  canvas: async () => {
    const wc = mainWindow?.webContents
    if (!wc) return null
    return requestFromRenderer<ControlCanvasModel | null>(wc, IPC_EVENTS.CANVAS_MODEL, null, 1500)
  },
  // M113. The board verb asks the renderer, which owns the workspace it renders.
  board: async (req) => {
    const wc = mainWindow?.webContents
    if (!wc) return null
    return requestFromRendererWith<BoardControlReply | null, BoardControlRequest>(wc, IPC_EVENTS.BOARD_ADD, req, null, 2000)
  },
  // Running sessions only: a dormant card has no session here, and `list`
  // says so in its note.
  focus: (id) => {
    if (!ptyManager.list().some((r) => r.panelId === id)) return false
    sendToRenderer(IPC_EVENTS.ATTENTION_JUMP, id)
    return true
  }
})

// M54. The URL door. Registered at module scope because macOS delivers a
// launch-time URL before whenReady's body runs. The URL never reaches the
// renderer — this is not a navigation, and will-navigate /
// setWindowOpenHandler stay exactly as they are.
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (!hasInstanceLock) return
  const parsed = parseControlUrl(url)
  if (parsed.kind === 'bad') { console.warn(`[control] refused URL ${url}: ${parsed.error}`); return }
  void controlHandler(parsed.req).then((r) => { if (!r.ok) console.warn(`[control] URL refused — ${r.error ?? ''}`) })
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: '#12131a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // node-pty lives in main, but the preload still needs `require('electron')`
      // to reach contextBridge/ipcRenderer.
      sandbox: false,
      // M103. The browser pane is a <webview> — a guest PROCESS, the one shape
      // that pans, zooms, clips and z-orders with the world (M0 measured it;
      // an iframe is refused by the renderer's CSP and a WebContentsView does
      // not follow the transform, M91). Electron's docs discourage the tag,
      // and every property they warn about is closed by name below:
      // will-attach-webview, the partition's permission handler, the guest's
      // window-open handler. verify:meta browser.1 reads all five as text.
      webviewTag: true,
      // M112. The renderer's one fact about telemetry, as an argv flag the
      // preload reads: no channel, no store read from the renderer, and the
      // SDK is never loaded in a process that will not send.
      additionalArguments: telemetryOn ? ['--tc-telemetry=1'] : []
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Cmd+R and Cmd+W destroy the renderer without running React cleanup, so no
  // pty:kill is ever sent. detachAll — not killAll — frees the local handles
  // and empties the session map while leaving the tmux sessions running, so
  // the next page reattaches instead of getting a fresh shell. On the direct
  // backend there is no session behind the handle and this is exactly the old
  // behaviour.
  // The two seams window-lifecycle.ts already covers for PTYs, and for the
  // same reason. Without the navigation one, every Cmd+R leaks one FSWatcher
  // per open file panel, forever, in a main process the reload does not
  // restart.
  attachPtyLifecycle(mainWindow, () => {
    ptyManager.detachAll()
    fileWatchers.closeAll()
  })

  // Belt and braces against Chromium's own pinch-to-zoom. The renderer
  // preventDefaults ctrl+wheel on every path the camera claims — but not on
  // the ones it YIELDS: a pinch over the command palette is deliberately left
  // uncancelled (shouldYieldWheel's rule 1), so this is the only thing
  // stopping it zooming the whole UI, which would silently break every
  // coordinate the canvas computes.
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch((error: unknown) => {
    console.warn('[window] could not pin visual zoom', error)
  })

  // Second line of defence behind the renderer's drop guard. Any navigation
  // away from the app kills every PTY in this window (attachPtyLifecycle), and
  // there is no navigation this window is ever supposed to perform after its
  // initial load — so refuse them all rather than trust one renderer listener.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    console.warn(`[window] blocked navigation to ${url}`)
  })

  // Never let a link navigate the shell window itself.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // M103. THE GUEST'S PROPERTIES, CLOSED BEFORE IT EXISTS. A page cannot set
  // them, and the node does not need to remember to: whatever the tag's
  // attributes say, the guest gets no preload, no node integration and
  // context isolation — and only an http(s) src ever attaches, so a record
  // that slipped past the parser with a file: url still opens nothing.
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    if (!/^https?:/.test(params.src)) {
      console.warn(`[browser] refused a guest at ${params.src}: http(s) only`)
      event.preventDefault()
    }
  })
  // Once attached, the guest's own new windows are denied — a page's
  // `window.open` or a target=_blank link would otherwise mint a BrowserWindow
  // with no chrome of ours and no handler on it. `link:open` stays the door
  // for a page that should leave the app, and it is a labelled verb.
  mainWindow.webContents.on('did-attach-webview', (_event, guest) => {
    guest.setWindowOpenHandler(() => ({ action: 'deny' }))
    // A navigation to anything but the web is refused too; the READ path
    // checks the live url again on its own (browser-read.ts).
    guest.on('will-navigate', (event, url) => {
      if (!/^https?:/.test(url)) { console.warn(`[browser] refused navigation to ${url}`); event.preventDefault() }
    })
  })
  // Every permission ask — camera, microphone, geolocation, notifications,
  // the lot — answered no by default. The partition is the pane's own, so
  // the main window's session (which never sees a page) is untouched.
  session.fromPartition('persist:tc-browser').setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.fromPartition('persist:tc-browser').setPermissionCheckHandler(() => false)

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // After did-finish-load, not before: a send to a webContents that has not
  // finished loading is dropped, and Cmd+N would spawn nothing until the next
  // preset change.
  //
  // The renderer's half of this ordering is load-bearing and NOT in a
  // component: did-finish-load fires at the page's load event, while
  // Canvas.tsx's preset effect is two awaited IPC round trips later, so a
  // subscription made there is not listening yet and the push lands with no
  // listener at all. renderer/main.tsx subscribes at module scope — before
  // boot()'s first await, and therefore before the load event — and hands the
  // cached template to Canvas as a prop. Moving that subscription back into a
  // component makes every configured default silently inert again.
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow) pushDefaultPreset(mainWindow.webContents, layoutStore)
    // M43. The snapshot M6d declined twice: a fresh renderer reads zero waiting
    // until the next real transition, while the dock badge (main's own count)
    // says N. Re-emit each session's current state so the two agree.
    ptyManager.resendStates()
  })
}

app.whenReady().then(async () => {
  // THE GATE, AND IT MUST STAY AHEAD OF EVERYTHING BELOW. app.quit() above
  // still runs the ready and quit handlers, so a losing instance that reached
  // even the first line of this body would start a tmux client on the winner's
  // socket and write the winner's layout.json on the way back out — the very
  // damage the lock is taken to prevent, caused by the fix. The same rule
  // guards before-quit; between them, a process without the lock touches no
  // store, no socket and no PTY.
  if (!hasInstanceLock) return

  // Resolve the login-shell environment before the first PTY can be requested,
  // so no panel ever spawns with the bare launchd PATH.
  const env = await resolveShellEnv()
  loginEnv = env
  probedAt = Date.now()
  for (const binary of ['claude', 'codex', 'git']) {
    const found = whichFromEnv(binary, env)
    // The diagnostic and the review engine's git are ONE resolution, not two.
    // This loop already computed the right answer before M9a's fix round and
    // only logged it, while git-runner.ts spawned the bare name against the
    // launchd PATH — see gitPath's declaration above.
    if (binary === 'git') gitPath = found
    if (binary === 'claude') claudePath = found
    if (binary === 'codex') codexPath = found
    console.log(`[startup] ${binary}: ${found ?? 'NOT FOUND on resolved PATH'}`)
  }
  // The bare name is kept when the probe found nothing: the spawn then fails
  // with ENOENT and the session reads `exited` with the reason in its stderr
  // tail, which is a named failure. M72 disables the chat verb by name before
  // it gets that far.
  agentSessions = new AgentSessionManager({
    runner: claudeCliRunner,
    command: claudePath ?? 'claude',
    // M90. Present only when found: an absent codex makes a codex send
    // `refused-backend`, never a spawn of a bare name that ENOENTs.
    ...(codexPath === null ? {} : { codex: { command: codexPath } }),
    hasTurns: (id) => agentTranscripts.read(id).turns.length > 0,
    env,
    newSessionId: () => randomUUID(),
    // M73. Whether the CLI already holds a transcript for a session id —
    // M17's glob, so a restored chat panel that has had a turn resumes and
    // one that never did pins. Decided at spawn, never persisted.
    transcriptExists: (sessionId) => resolveTranscript(sessionId) !== undefined,
    // M82. Read LIVE, like every other setting the manager consults: a ceiling
    // raised in the palette must take effect on the next send.
    limits: () => ({
      maxConcurrent: Number(layoutStore.getSetting('agents.maxConcurrent')) || 0,
      budgetUsd: Number(layoutStore.getSetting('agents.budgetUsd')) || 0
    }),
    // M98. Resolved at CALL time through the module-level `approvals`: the
    // tracker is created after the manager (it subscribes to it), so a
    // captured reference here would be null for the life of the app.
    preAnswer: (id, toolName) => approvals?.granted(id, toolName) ?? false
    ,
    // M102. Each headless session gets the door and its OWN panel id and token
    // — the same block PtyManager gives a terminal — so `tc api` from a chat
    // is that chat's, never a claim.
    envFor: (id) => ({
      ...env,
      TC_CONTROL_SOCKET: controlSocketPath,
      TC_PANEL_ID: id,
      TC_PANEL_TOKEN: tokenOfPanel(id),
      PATH: env['PATH'] === undefined || env['PATH'] === '' ? launcherDir : `${launcherDir}:${env['PATH']}`
    })
  })
  // M73. The durable transcript, written from the manager's own events so
  // the renderer never has to echo a turn back; and every event forwarded
  // to the renderer on ONE channel, already batched at the manager.
  const agentSessionsHere = agentSessions
  // M76. A pending permission is `needs you` on the terminal's own channel,
  // decided here in main — the renderer's store is a cache of this, never a
  // second author. The label is the chat's directory name.
  const approvalsHere = createApprovalTracker({
    sink: attention.forAgents,
    emitState: (panelId, state) => { mainWindow?.webContents.send(IPC_EVENTS.AGENT_STATE, { panelId, state }) },
    label: (id) => { const cwd = agentSessionsHere.get(id)?.cwd ?? id; return cwd.replace(/\/+$/, '').split('/').pop() || cwd }
  })
  approvals = approvalsHere
  agentSessionsHere.subscribe((event) => {
    approvalsHere.apply(event)
    if (event.type === 'turn') agentTranscripts.appendTurn(event.id, event.turn)
    if (event.type === 'result') {
      const snap = agentSessionsHere.get(event.id)
      if (snap) agentTranscripts.appendMeta(event.id, { usage: snap.usage, costUsd: snap.costUsd, turns: snap.turns })
    }
    mainWindow?.webContents.send(IPC_EVENTS.AGENT_EVENT, event)
  })

  // After the env probe, because tmux must be resolved from the LOGIN PATH:
  // launchd gives a GUI app a bare PATH and /opt/homebrew/bin is not on it.
  //
  // The socket is resolved from app.isPackaged so a packaged build and a dev
  // build never share a tmux server: before-quit's default arm calls shutdown(), which is
  // kill-server, and a shared socket would mean quitting either one destroys
  // the other's agents. TC_TMUX_SOCKET is a developer override with no UI.
  const tmuxSocket = resolveSocket({
    packaged: app.isPackaged,
    override: process.env['TC_TMUX_SOCKET']
  })
  backend = await probeTmux(env, app.getPath('userData'), tmuxSocket)

  // One line naming everything an outside observer needs, because for a
  // PACKAGED app stdout is the only channel there is: no IPC into a test
  // harness, no renderer hook, and — unlike every other Electron suite here —
  // no custom entry point, since scripts/panels-entry.cjs works by BEING the
  // entry and a packaged app runs its own main.
  //
  // Reaching this line is itself the evidence that node-pty loaded: session-
  // backend.ts imports it at module scope, so a .node binary trapped inside the
  // asar throws during import and the app never gets here.
  //
  // The resolved PATH is included because it is the only way to tell a
  // recovered login environment from launchd's bare one — and shell-env.ts's
  // entire reason for existing has never been observable under npm run dev,
  // where the app inherits the developer's own terminal environment.
  console.log(
    `[startup] packaged=${app.isPackaged} userData=${app.getPath('userData')} ` +
      `socket=${tmuxSocket} backend=${backend.kind} (${backend.reason}) ` +
      `PATH=${env['PATH'] ?? '<none>'}`
  )

  // Load before the menu and window exist: Task 10 gives the menu the restore
  // settings, and the renderer's first act is layout:load, which needs a
  // resolved store to answer from.
  layoutStore.load()

  // M112. Telemetry, if and only if a DSN is here. Decided AFTER the store
  // loads (the setting lives there) and BEFORE the window exists (the
  // renderer learns the decision as an argv flag, not a channel). The ~100 ms
  // of boot above this line is uncovered, and that is the trade. The
  // minidump integration — process memory — rides only on its own setting.
  //
  // Fix round 1 (review, IMPORTANT 1): `@sentry/electron/main` pulls in all
  // of `@sentry/node`, and `externalizeDepsPlugin` leaves that as a real
  // `require()` in `out/main/index.js` — a static top-level import would run
  // it on EVERY launch, DSN or not, which is exactly the load the posture
  // ("no process may load or initialise the SDK at all" with no DSN)
  // forbids. The dynamic `import()` below only executes once `plan.on` is
  // true, matching the shape `renderer/main.tsx` already used.
  {
    const plan = telemetryPlan((id) => layoutStore.getSetting(id))
    if (plan.on) {
      // Fix round 1 (review, IMPORTANT 2): this whole block sits inside
      // `app.whenReady().then(async () => {…})` with no `.catch` on that
      // chain, and `createWindow()` is hundreds of lines below. A DSN that
      // passes telemetryPlan's regex but upsets the SDK (or a minidump
      // handler that fails to install) would otherwise throw here, becoming
      // an unhandled rejection that leaves the app permanently window-less
      // — the exact failure mode `renderer/main.tsx`'s own neighbouring
      // comment already names as "not hypothetical", now reachable from an
      // opt-in diagnostics feature nobody asked to depend on for the app to
      // open at all. Caught, logged, and `telemetryOn` stays false: a failed
      // telemetry init must degrade to off, never to a blank window.
      try {
        const { init: sentryInit, IPCMode, onUncaughtExceptionIntegration, onUnhandledRejectionIntegration, electronMinidumpIntegration, linkedErrorsIntegration, functionToStringIntegration } = await import('@sentry/electron/main')
        const paths = { userData: app.getPath('userData'), home: app.getPath('home') }
        const integrations = [onUncaughtExceptionIntegration(), onUnhandledRejectionIntegration(), linkedErrorsIntegration(), functionToStringIntegration()]
        if (plan.nativeCrashes) integrations.push(electronMinidumpIntegration())
        sentryInit({
          dsn: plan.dsn,
          release: `terminal-canvas@${app.getVersion()}`,
          sendDefaultPii: false,
          defaultIntegrations: false,
          integrations,
          // Classic rides Electron IPC to main, which holds the DSN and the
          // scrubber. Protocol mode registers a `sentry-ipc://` handler the
          // renderer CSP (`default-src 'self'`) would refuse with no error —
          // so the mode is named here, never left at the SDK's own default
          // (`Both`). This is a MAIN-only option in the real 7.18.0 types
          // (`ElectronMainOptions`, not `ElectronRendererOptions`): it
          // decides how main LISTENS, so `main.tsx`'s renderer-side
          // `init()` call takes no `ipcMode` at all — passing one there
          // does not typecheck. What DOES need pairing on that side is
          // `preload/index.ts`'s `hookupIpc()` call (fix round 1, CRITICAL):
          // Classic mode with nothing exposing `window.__SENTRY_IPC__`
          // means the renderer falls back to fetching `sentry-ipc://…`,
          // which the CSP refuses with no error — the silent failure this
          // feature exists to avoid.
          ipcMode: IPCMode.Classic,
          // Fix round 1 (review, MINOR 1): `scrubEvent` returns `Dict | null`
          // (`Record<string, unknown> | null`), which is not provably
          // related to Sentry's `Event` type — going through `unknown`
          // makes that widening explicit rather than asserting a direct
          // relationship that does not exist. `scrubEvent` itself is
          // Task 3's and stays unmodified.
          beforeSend: (event) => scrubEvent(event, paths) as unknown as typeof event | null,
          beforeBreadcrumb: () => null
          // M112 review, IMPORTANT 1: `beforeSend` only sees envelopes the SDK
          // resolves to an EVENT (`node_modules/@sentry/electron/main/ipc.js`'s
          // `handleEnvelope`, confirmed against the installed 7.18.0 tree).
          // Profile chunks, span containers and replay envelopes take a
          // different branch of that function straight to
          // `getTransport().send(...)` — `scrubEvent` never runs on them. This
          // is safe TODAY only because `renderer/main.tsx`'s own `init()` call
          // passes `defaultIntegrations: false` plus exactly
          // `globalHandlersIntegration()`, which manufactures error events and
          // nothing else. The natural next edit to that call —
          // `replayIntegration()`, `browserTracingIntegration()`, or the logs
          // integration, any of which starts emitting a type `beforeSend`
          // cannot see — would export renderer data around this allowlist with
          // NO symptom: no failed check, no thrown error, just unscrubbed
          // bytes on the wire. `verify:meta telemetry.5` pins that
          // `globalHandlersIntegration` is *named* in that call; it does not
          // and cannot pin that nothing else is. Whoever adds a second
          // renderer integration must widen `scrubEvent` (or gate the new
          // envelope kind before it reaches the transport) in the same change.
        })
        telemetryOn = true
        console.log(`[startup] telemetry=on nativeCrashes=${plan.nativeCrashes}`)
      } catch (error: unknown) {
        console.error('[startup] telemetry failed to initialise; continuing without it', error)
      }
    } else {
      console.log(`[startup] telemetry=off (${plan.reason})`)
    }
  }

  // M55. A tmux session with no panel to reach it holds a process and a
  // shell the user cannot see, close, or type into — possible if a crash
  // landed between a spawn and the store's coalesced save. Until M55 these
  // were killed outright ("adopting would mint geometry the user never
  // chose"); placement exists now, so the user is ASKED, once, by name.
  // Never adopted silently: no dialog, no restore.
  //
  // The known set is EVERY workspace's ids. It used to be the active
  // workspace's alone, which killed a session kept across quit (M38) for a
  // panel in a hidden workspace at the next launch — verify:tmux orphan.1.
  let recovered: OrphanRow[] = []
  {
    const known = new Set(layoutStore.workspaces().flatMap((w) => w.panelIds))
    const orphans = findOrphans(ptyManager.list(), known)
    let restore = false
    if (orphans.length > 0) {
      const prompt = orphanPrompt(orphans)
      // App-modal: the window does not exist yet, and that is fine. Restore
      // is the default button because the cost of a wrong Discard is an
      // agent's work, and the cost of a wrong Restore is a panel to close.
      const { response } = await dialog.showMessageBox({
        type: 'question',
        message: prompt.message,
        detail: prompt.detail,
        buttons: prompt.buttons,
        defaultId: 0,
        cancelId: 1
      })
      restore = response === 0
    }
    // Collected as the loop runs rather than from a second list() call: a
    // session KILLED here has not survived, and treating it as though it
    // had would leave its baseline in place for a panel that is about to
    // spawn a brand-new agent.
    const surviving: string[] = []
    // M77. A chat's baseline survives a relaunch: the conversation RESUMES
    // (`--resume`) rather than starting over, so its starting point is still
    // the right thing to diff against. Every saved chat panel counts.
    for (const w of layoutStore.mergedWorkspaces()) for (const p of w.panels) if (p.kind === 'chat') surviving.push(p.id)
    const orphanIds = new Set(orphans.map((o) => o.panelId))
    for (const session of ptyManager.list()) {
      if (known.has(session.panelId)) { surviving.push(session.panelId); continue }
      if (orphanIds.has(session.panelId) && restore) { surviving.push(session.panelId); continue }
      console.warn(
        `[tmux] orphan session ${session.panelId} (pid ${session.pid}) has no saved ` +
          'panel; discarding it. A session with no panel cannot be reached, closed, or typed into.'
      )
      backend.destroy(session.panelId)
    }
    if (restore) recovered = orphans

    // A baseline describes ONE session's starting point, and quitting the app
    // kills every session by default (before-quit's end arm runs shutdown(), i.e.
    // kill-server; the M38 keep arm is exactly the case where sessions DO survive
    // and their baselines are kept, which staleBaselineIds handles by asking), so
    // a baseline that outlived its session would have the next launch's fresh
    // agent diffed against a snapshot from a previous day — blaming it for
    // every edit the user made by hand in between. Dropped HERE, at startup,
    // and nowhere else: PtyManager's in-memory capturedBaselineIds is the
    // guard that covers Cmd+R within one run, where the sessions really do
    // survive and recapture really would be wrong, and this main process's
    // copy of that set is empty by construction. See staleBaselineIds' own
    // comment (verify:review 37/37b).
    for (const id of staleBaselineIds(layoutStore.baselineIds(), surviving)) {
      console.log(
        `[review] dropping the stored baseline for panel ${id}: its session did not ` +
          `survive, so its next spawn is a new session and needs a new snapshot.`
      )
      layoutStore.dropBaseline(id)
    }
  }

  rebuildMenu()
  // M73. The chat panel's verbs over the runtime and the transcript log.
  // `create` refuses BY NAME before any process exists: a directory that is
  // not there (a file is refused too, spawn-request.ts's rule) and a CLI the
  // probe did not find — the two facts a first send would otherwise discover
  // as an `exited` session with an ENOENT in its stderr.
  /**
   * M84. THE WATCHER RUNTIME'S ARMING, which is main's alone.
   *
   * `watch-runner.ts` answers "run it and tell me how it went"; the four
   * kinds of trigger are armed here, and all four call the SAME `fire`. A
   * second path into a run would be a watcher that runs twice for one save.
   *
   * Nothing here allocates a pty: a watcher's process is an ordinary
   * `child_process.spawn` with its output read as bytes and kept only as a
   * capped tail. That is what lets a canvas hold twenty watchers.
   */
  const watchFileWatchers = new FileWatchers()
  const watchDirWatchers = new Map<string, FSWatcher>()
  const watchTimers = new Map<string, NodeJS.Timeout>()
  const watchTriggers = new Map<string, WatchTrigger>()
  const watchRunner = createWatchRunner({
    spawn: (spec: WatchSpawnSpec, handlers: WatchHandlers) => {
      const child = spawnChild(spec.command, [...spec.args], { cwd: spec.cwd, env: loginEnv, shell: false })
      // stdout and stderr into ONE tail, in arrival order: a failing command
      // says why on stderr and what it was doing on stdout, and two separate
      // streams in a 340px body would interleave wrongly anyway.
      child.stdout?.on('data', (chunk: Buffer) => handlers.onData(chunk.toString('utf8')))
      child.stderr?.on('data', (chunk: Buffer) => handlers.onData(chunk.toString('utf8')))
      // `error` is a spawn failure (ENOENT for a command that is not there),
      // which must reach the same exit arm rather than vanishing: a watcher
      // that shows `working` forever because its command does not exist is
      // this milestone's worst silent failure.
      child.on('error', (error: Error) => handlers.onData(`${error.message}\n`))
      child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => handlers.onExit(code, signal))
      return { kill: (sig?: string) => { try { child.kill((sig ?? 'SIGTERM') as NodeJS.Signals) } catch { /* already gone */ } } }
    },
    now: () => Date.now(),
    ledger: { append: (row) => runLedger.append(row) },
    onState: (id, state) => {
      // sendToRenderer OPENS a window when there is none (macOS's closed-window
      // state), so a timer watcher's tick would pop the app back open while
      // nobody is looking (M84's verifier). A state event is news for a window
      // that exists; there is no window to tell otherwise.
      const wc = mainWindow !== null && !mainWindow.isDestroyed() ? mainWindow.webContents : null
      if (wc !== null && !wc.isLoading()) wc.send(IPC_EVENTS.WATCHER_STATE, { id, ...state })
    }
  })
  watchRunnerRef = watchRunner
  // M101. Arm every routine the layout holds; a tick that fell while the app
  // was closed is marked missed here (startup only), never fired.
  armRoutines(true)
  const disarmWatch = (id: string): void => {
    watchFileWatchers.close(id)
    const dir = watchDirWatchers.get(id)
    if (dir !== undefined) { dir.close(); watchDirWatchers.delete(id) }
    const timer = watchTimers.get(id)
    if (timer !== undefined) { clearInterval(timer); watchTimers.delete(id) }
    watchTriggers.delete(id)
  }
  /**
   * A `panel` trigger is armed by the RENDERER, not here: it is the side that
   * already learns every exit and every turn's end (it draws the handoff
   * edges from exactly those events), and it decides with `handoffFires` —
   * the same one table — before calling `watcher:run`. Arming it here would
   * need main to learn panel endings a second way, and the two paths would
   * disagree only in the cases nobody tests.
   */
  /**
   * M84. Watchers main is still arming for panels that no longer exist.
   *
   * Arming is the renderer's gesture and disarming is too, so any path that
   * removes a panel WITHOUT passing through close, undo, reset or workspace
   * delete — a reload, a crash and reopen — leaves main holding an interval
   * and a recursive watch that go on RUNNING THE COMMAND for a node nobody
   * can see or stop. Main reconciles against its own layout store, which is
   * the only place that knows every workspace's panels.
   */
  const reconcileWatchers = (): void => {
    const known = new Set<string>()
    // mergedWorkspaces() is the one reader that carries every workspace's
    // whole panels — a rail row's panelIds would do here too, but this is the
    // API that already exists and it copies what it returns.
    for (const workspace of layoutStore.mergedWorkspaces()) {
      for (const panel of workspace.panels) if (panel.kind === 'watcher') known.add(panel.id)
    }
    for (const id of watchRunner.ids()) {
      if (!known.has(id)) { disarmWatch(id); watchRunner.remove(id) }
    }
  }

  const watcherHandlers: WatcherHandlers = {
    create: (req) => {
      reconcileWatchers()
      const cwd = resolveCwd(req.cwd)
      let isDir = false
      try { isDir = statSync(cwd).isDirectory() } catch { isDir = false }
      if (!isDir) return { ok: false, reason: `no such directory: ${req.cwd}` }
      if (req.command.trim() === '') return { ok: false, reason: 'a watcher needs a command to run' }
      // Idempotent at an id: a restored canvas re-creates every watcher it
      // holds, and a second arm on the same id would double every trigger —
      // one save, two runs, forever, with nothing on screen saying why.
      disarmWatch(req.id)
      watchRunner.add({ id: req.id, cwd, command: req.command, args: req.args, trigger: req.trigger })
      watchTriggers.set(req.id, req.trigger)
      // Disarmed on purpose: the watcher is KNOWN (it can still be run by
      // hand, and its last run is still its state) and nothing is armed. This
      // is a pause, not a delete — the node says which it is.
      if (req.armed === false) return { ok: true }
      const trigger = req.trigger
      if (trigger.kind === 'path' || trigger.kind === 'git-ref') {
        // A file and a DIRECTORY are watched differently, and getting this
        // wrong is silent: `FileWatchers` watches a file by watching its
        // parent and filtering on its basename (M22's atomic-rename rule,
        // which is how every editor and every agent writes a file), and
        // handed a directory it reads it as a file and refuses. A directory
        // is watched recursively instead — the commonest trigger of all is
        // "anything under src".
        //
        // A git trigger is a FILE watch on `.git/HEAD`, whose rewrite is what
        // a branch change, a checkout and a commit have in common.
        const target = trigger.kind === 'path' ? resolveCwd(trigger.path) : join(resolveCwd(trigger.root), '.git', 'HEAD')
        let isDirTarget = false
        try { isDirTarget = statSync(target).isDirectory() } catch { isDirTarget = false }
        if (isDirTarget) {
          try {
            // Coalesced by the runner itself (one run at a time, one pending),
            // so a save that touches forty files is one run.
            const w = fsWatch(target, { persistent: false, recursive: true }, () => watchRunner.fire(req.id))
            // An FSWatcher is an EventEmitter, and an unhandled `error` event
            // THROWS in the main process — deleting or unmounting a watched
            // directory is an ordinary thing to do, and without this arm it
            // takes the whole app down (M84's verifier).
            w.on('error', (error: Error) => {
              disarmWatch(req.id)
              const wc = mainWindow !== null && !mainWindow.isDestroyed() ? mainWindow.webContents : null
              if (wc !== null && !wc.isLoading()) {
                wc.send(IPC_EVENTS.WATCHER_STATE, { id: req.id, ...(watchRunner.stateOf(req.id) ?? { status: 'not-started' as const, tail: '', pending: false }), disarmed: `stopped watching ${target}: ${error.message}` })
              }
            })
            watchDirWatchers.set(req.id, w)
          } catch (error) {
            disarmWatch(req.id)
            return { ok: false, reason: `could not watch ${target}: ${String(error)}` }
          }
        } else {
          const first = watchFileWatchers.watch(req.id, target, () => watchRunner.fire(req.id))
          if (first.kind === 'missing' || first.kind === 'unreadable') {
            disarmWatch(req.id)
            return { ok: false, reason: `nothing to watch at ${target}` }
          }
        }
      } else if (trigger.kind === 'timer') {
        if (trigger.everyMs < WATCH_TIMER_MIN_MS) return { ok: false, reason: `the shortest interval is ${WATCH_TIMER_MIN_MS / 1000}s` }
        const timer = setInterval(() => watchRunner.fire(req.id), trigger.everyMs)
        // Never keep the app alive for a watcher: quitting with a timer armed
        // must exit, not wait for the next tick.
        timer.unref?.()
        watchTimers.set(req.id, timer)
      }
      return { ok: true }
    },
    run: (id) => watchRunner.fire(id),
    stop: (id) => watchRunner.stop(id),
    dispose: (id) => { disarmWatch(id); watchRunner.remove(id) },
    list: () => watchRunner.ids().map((id) => ({ id, ...(watchRunner.stateOf(id) ?? { status: 'not-started' as const, tail: '', pending: false }) }))
  }

  const agentHandlers: AgentHandlers = {
    create: (spec: AgentSessionSpec): AgentCreateResult => {
      const manager = agentSessions
      if (manager === null) return { kind: 'refused', reason: 'the agent runtime has not started yet' }
      // M99. Refused by the backend's ROW: the probe's path for that binary,
      // and the row's own `noCli` sentence. A lookup, never a switch.
      const backend = backendOf(spec)
      const cliPath: Record<AgentBackend, string | null> = { claude: claudePath, codex: codexPath }
      if (cliPath[backend] === null) return { kind: 'refused', reason: BACKENDS[backend].reasons.noCli }
      // M100. Places first — on the EXPANDED path, before resolveCwd's fallback
      // to home could turn a refused folder into an allowed one silently.
      const place = placesGate.check(spec.teammateId, expandTilde(spec.cwd))
      if (!place.ok) return { kind: 'refused', reason: place.reason }
      const cwd = resolveCwd(spec.cwd)
      // M100. The brief rides EVERY spawn from the roster main holds — the
      // renderer never carries it, and a relaunch's re-create gets it again
      // (the M81 supervisor rule, reached for an identity).
      const mate = spec.teammateId === undefined ? undefined : layoutStore.teammates().find((t) => t.id === spec.teammateId)
      const brief = mate !== undefined && mate.brief.trim() !== '' ? { appendSystemPrompt: [spec.appendSystemPrompt, `You are ${mate.name}. ${mate.brief.trim()}`].filter((x): x is string => x !== undefined && x !== '').join('\n\n') } : {}
      let isDir = false
      try { isDir = statSync(cwd).isDirectory() } catch { isDir = false }
      if (!isDir) return { kind: 'refused', reason: `no such directory: ${spec.cwd}` }
      const snapshot = manager.create({ ...spec, cwd, ...brief })
      // M77. The SAME capture PtyManager fires, keyed by the chat's panel id,
      // so review:panel / review:baseline / review:at answer for a chat with
      // no change to the engine. The store's once-only guard makes a
      // relaunch's re-create a no-op.
      captureBaseline(spec.id, cwd)
      // M76. A reloaded renderer re-creates every chat by id; a question
      // still pending must light its attention surfaces again.
      approvals?.resync(spec.id)
      return { kind: 'created', snapshot }
    },
    // M75. Attachments are resolved HERE (the renderer has no fs): every one
    // must decode or the send is refused whole, naming the one that could not.
    send: (id, text, attachments) => {
      const images: { mediaType: string; base64: string; name: string }[] = []
      for (const attachment of attachments) {
        const resolved = resolveAttachment(attachment)
        if (resolved.kind === 'refused') return { refused: resolved.reason }
        images.push({ mediaType: resolved.mediaType, base64: resolved.base64, name: resolved.name })
      }
      const answer = agentSessions?.send(id, text, images) ?? 'no-session'
      if (answer === 'refused-backend') return { refused: REASON_NO_CODEX }
      if (answer === 'refused-images') return { refused: REASON_CODEX_NO_IMAGES }
      // M82. The ceiling refuses BY NAME with the fix, in dollars the user set.
      if (answer === 'refused-budget') {
        const limit = Number(layoutStore.getSetting('agents.budgetUsd')) || 0
        return { refused: `over the $${limit.toFixed(2)} budget for this canvas — raise it in settings, or start a new canvas` }
      }
      return answer
    },
    clipboardImage: () => {
      const image = clipboard.readImage()
      if (image.isEmpty()) return null
      const png = image.toPNG()
      // Capped BEFORE it crosses the bridge, with the cap the send would apply.
      if (png.length > ATTACHMENT_MAX_BYTES) return { refused: `the clipboard image is larger than the ${Math.round(ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB attachment cap` }
      return { mediaType: 'image/png', base64: png.toString('base64'), size: png.length }
    },
    interrupt: (id) => agentSessions?.interrupt(id) ?? false,
    dispose: ({ id, drop }) => {
      agentSessions?.dispose(id)
      if (drop) { agentTranscripts.drop(id); dropBaseline(id) }
    },
    // M98. `scope: 'session'` GRANTS the pending request's tool first, then
    // answers through the one `answerPermission` — the grant is keyed by the
    // tool name main holds in its own pending record, never by a name the
    // renderer sent. A deny never grants, whatever the scope says.
    answer: ({ id, requestId, answer, scope }) => {
      const toolName = scope === 'session' && answer.allow ? agentSessions?.get(id)?.pending.find((p) => p.requestId === requestId)?.toolName : undefined
      const answered = agentSessions?.answerPermission(id, requestId, answer) ?? false
      // Granted only for a request that was really answered: a grant for a
      // question the process never heard would outlive it invisibly.
      if (answered && toolName !== undefined) approvals?.grant(id, toolName)
      return answered
    },
    grants: (id) => approvals?.grantsOf(id) ?? [],
    revokeGrants: (id) => { approvals?.revoke(id) },
    list: () => agentSessions?.list() ?? [],
    transcript: (id) => {
      const read = agentTranscripts.read(id)
      return { turns: read.turns, snapshot: agentSessions?.get(id) ?? null, ...(read.meta === undefined ? {} : { meta: read.meta }) }
    },
    // M74. Open a terminal's session as a chat. Three refusals, each named
    // for its fix; the live check is the one-front-end-at-a-time rule.
    // M97. Main counts, main stops: the request carries a mode and an optional
    // task; the limit is the mode's unless the caller lowers it.
    autoStart: (req) => agentSessions?.startAuto(req.id, { mode: req.mode, task: req.task, limit: req.limit }) ?? { kind: 'refused', reason: 'the agent runtime is not available' },
    autoStop: (id) => agentSessions?.stopAuto(id) ?? false,
    importSession: ({ fromPanelId, toPanelId }) => {
      const sessionId = layoutStore.session(fromPanelId)
      if (sessionId === undefined) return { kind: 'refused', reason: 'that terminal was not started as a claude session — start one from the Claude preset' }
      if (ptyManager.list().some((s) => s.panelId === fromPanelId)) return { kind: 'refused', reason: 'stop the terminal first — one front-end at a time' }
      const path = resolveTranscript(sessionId)
      if (path === undefined) return { kind: 'refused', reason: 'claude has not written a transcript for that session yet' }
      let text: string
      try { text = readFileSync(path, 'utf8') } catch { return { kind: 'refused', reason: 'that session\'s transcript could not be read' } }
      const imported = importClaudeTranscript(text)
      agentTranscripts.drop(toPanelId)
      for (const turn of imported.turns) agentTranscripts.appendTurn(toPanelId, turn)
      agentTranscripts.appendMeta(toPanelId, imported.meta)
      return { kind: 'imported', sessionId, turns: imported.meta.turns }
    }
  }
  registerIpcHandlers(
    ptyManager,
    layoutStore,
    () => ({
      kind: backend.kind,
      reason: backend.reason
    }),
    {
      list: () =>
        presetRows(
          resolveAvailability(allPresets(layoutStore.presets()), which),
          layoutStore.defaultPresetId()
        ),
      rename: (id, name) => {
        const changed = layoutStore.renamePreset(id, name)
        // The menu lists presets by name, and Cmd+N's template carries none —
        // but a rename can still change what the menu SAYS, so rebuild. Cheap,
        // and the alternative is a menu that disagrees with the palette until
        // relaunch.
        if (changed) afterPresetChange()
        return changed
      },
      remove: (id) => {
        const changed = layoutStore.deletePreset(id)
        if (changed) afterPresetChange()
        return changed
      },
      setDefault: (id) => {
        layoutStore.setDefaultPreset(id)
        afterPresetChange()
      },
      spawn: (id) => {
        onSpawnPreset(id)
      },
      spawnWith: (req) => {
        // M100. A teammate's terminal is gated the same way its chat is.
        const place = placesGate.check(req.teammateId, expandTilde(req.cwd))
        if (!place.ok) return { kind: 'refused' as const, reason: place.reason }
        // One pure resolver, shared with the verify harness — see
        // spawn-request.ts for the rules (absent command stays absent, a
        // file is refused like a missing path, a typed command is a task).
        const resolved = resolveSpawnRequest(req, allPresets(layoutStore.presets()), {
          expand: expandTilde,
          isDirectory: (p) => { try { return statSync(p).isDirectory() } catch { return false } }
        })
        if (resolved.kind === 'refused') return resolved
        mainWindow?.webContents.send(IPC_EVENTS.PRESET_SPAWN, resolved.template)
        return { kind: 'spawned' }
      },
      recentDirectories: () => layoutStore.recentDirectories(),
      savePanel: (captured) => {
        layoutStore.addPreset(presetFromCapture(layoutStore.presets(), captured))
        rebuildMenu()
      },
      setWorktree: (id, on) => {
        const changed = layoutStore.setPresetWorktree(id, on)
        // The template Cmd+N holds carries the flag, so a change has to
        // re-push it — the same reason setDefault goes through afterPresetChange.
        if (changed) afterPresetChange()
        return changed
      },
      requestReset: () => {
        void confirmReset()
      },
      listPrompts: (cwd) =>
        mergePrompts(
          layoutStore.prompts(),
          // resolveCwd is pty-manager's — the same expansion a spawn gets, so
          // the prompts the palette lists come from the directory the panel
          // is actually in, not from a literal '~' that resolves to nothing.
          cwd === null ? [] : readProjectPrompts(resolveCwd(cwd))
        ),
      savePrompt: (name, body) => {
        layoutStore.addPrompt({ id: mintPromptId(layoutStore.prompts()), name, body })
      },
      removePrompt: (id) => layoutStore.deletePrompt(id),
      // M80. Built-ins first, then the user's — the preset list's own rule; a
      // save mints an id when the caller has none; a delete refuses a built-in
      // by returning false, the same answer a project prompt's id gets.
      // M80. The resolved template, never a spawn: only main can turn an
      // absent command into the login shell (M5b), and a template's node
      // needs that answer before it mints anything.
      presetTemplate: (id) => {
        const found = allPresets(layoutStore.presets()).find((p) => p.id === id)
        return found === undefined ? null : templateOf(found)
      },
      // M83. The ROOT is resolved HERE, in one place, for every door — the
      // node, the chat's first-send context and the control verb. A chat
      // panel's cwd is often a subdirectory, and keying its memory by that
      // cwd would give the same repository two memories that never see each
      // other, with nothing on screen saying so. A directory outside a
      // repository keeps its own path as the key rather than failing: the
      // store's named refusals are for an ABSENT root, not for a directory
      // that git does not own.
      // M89. The audit's read half — rows only, metadata by construction.
      brokerAudit: (limit, service) => brokerAudit.list(limit, service),
      // M88. GitHub through the injected requester, over the credential store.
      // Through the BROKER: the client never reads the store, and the panel's
      // reads sit in the audit beside the agents' own calls.
      githubList: (panelId) => listGithubWorkItems({ broker, ...(panelId === undefined ? {} : { panelId }) }),
      // M85. The vault's read, in main for `file-read.ts`'s reason. The root
      // is expanded and realpath'd, NEVER resolveCwd'd: that helper falls back
      // to $HOME for a path that is not there, and a typo'd vault would have
      // walked the user's entire home directory and listed it as the vault
      // (M85's verifier). A missing root is the reader's own "no vault" arm.
      snapshotList: () => layoutSnapshots.list(),
      snapshotRestore: (at, afterId) => {
        const path = join(app.getPath('userData'), 'layout-snapshots', `${at}.json`)
        let bytes: string
        try { bytes = readFileSync(path, 'utf8') } catch { return { kind: 'refused', reason: 'that snapshot is gone — the ring keeps the newest twenty' } }
        const result = restoreFromSnapshot(layoutStore.current(), bytes, Date.now(), (n) => `n${n}`, afterId)
        if (result.kind === 'refused') return result
        const added = result.layout.workspaces[result.layout.workspaces.length - 1]!
        layoutStore.addWorkspaceRecord(added)
        return { kind: 'restored', workspaceId: added.id }
      },
      vaultRead: (root) => {
        const expanded = expandTilde(root.trim())
        let real = expanded
        try { real = realpathSync(expanded) } catch { /* the reader answers with its reason */ }
        armVaultWatch(real)
        return readVault(real)
      },
      memoryList: async (root, limit) => root.startsWith(TEAMMATE_ROOT) ? teammateMemory.list(teammateSlug(root), limit) : memoryStore.list(await memoryRoot(root), limit),
      memoryAdd: async (req) => {
        const r = req.root.startsWith(TEAMMATE_ROOT) ? teammateMemory.add({ ...req, root: teammateSlug(req.root) }) : memoryStore.add({ ...req, root: await memoryRoot(req.root) })
        return r.ok ? { ok: true } : { ok: false, reason: r.reason }
      },
      listTemplates: () => allTemplates(layoutStore.templates()),
      // M126. The shelf, whole. Parsed on the way in by the SAME rules the
      // file is, so a malformed column reaching the store from the renderer
      // is dropped by name rather than written back to disk.
      shelf: () => layoutStore.shelf(),
      saveShelf: (shelf) => {
        const warnings: string[] = []
        const parsed = parseShelf(shelf, warnings)
        return layoutStore.saveShelf(parsed)
      },
      // M100. The roster. A save is an upsert by id; the record is parsed by
      // the same rules the file is (a relative place never lands).
      listTeammates: () => layoutStore.teammates(),
      saveTeammate: (teammate) => {
        // A record the parser drops is REFUSED, never replaced with an empty one
        // (which would wipe its places and services silently — the verifier).
        const warnings: string[] = []
        const parsed = parseTeammates([teammate], warnings)[0]
        if (parsed === undefined) throw new Error(`the teammate could not be kept — ${warnings.join('; ')}`)
        layoutStore.saveTeammate(parsed)
        return parsed
      },
      removeTeammate: (id) => layoutStore.deleteTeammate(id),
      // M101. A save is refused BY NAME against M96's table and the teammate's
      // schedule permission; a saved or deleted routine re-arms the runner.
      listRoutines: () => layoutStore.routines(),
      saveRoutine: (routine) => {
        const parsed = parseRoutines([routine], [])[0]
        if (parsed === undefined) return { kind: 'refused' as const, reason: `the routine could not be kept — the interval is at least ${ROUTINE_MIN_MS / 60_000} minute and it needs a name, a teammate and a prompt` }
        const mate = layoutStore.teammates().find((t) => t.id === parsed.teammateId)
        const refusal = routineRefusal(parsed, mate === undefined ? undefined : { name: mate.name, scheduling: mate.scheduling, places: mate.places })
        if (refusal !== null) return { kind: 'refused' as const, reason: refusal }
        layoutStore.saveRoutine(parsed)
        armRoutines()
        return { kind: 'saved' as const, routine: parsed }
      },
      removeRoutine: (id) => { const r = layoutStore.deleteRoutine(id); armRoutines(); return r },
      runRoutine: (id) => routineRunner.runNow(id),
      // A place is chosen in the OS dialog: the answer is absolute and real,
      // which is the only kind the record keeps.
      choosePlace: async () => {
        const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Choose a folder this teammate may touch' })
        return r.canceled || r.filePaths.length === 0 ? null : (r.filePaths[0] ?? null)
      },
      saveTemplate: (template) => {
        const id = template.id !== undefined && template.id !== '' && !isBuiltInTemplate(template.id)
          ? template.id
          : `tpl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
        const saved: PersistedTemplate = { ...template, id }
        layoutStore.saveTemplate(saved)
        return saved
      },
      removeTemplate: (id) => (isBuiltInTemplate(id) ? false : layoutStore.deleteTemplate(id))
    },
    rebuildMenu,
    reviewEngine,
    reviewCommit,
    credentialStore,
    fileWatchers,
    () => mainWindow,
    toolboxCache,
    join(app.getPath('userData'), 'diagnostics'),
    {
      list: () => layoutStore.worktrees(),
      remove: (id) => worktreeManager.remove(id),
      reveal: (id) => {
        const found = layoutStore.worktrees().find((w) => w.id === id)
        if (found === undefined) return false
        shell.showItemInFolder(found.path)
        return true
      }
    },
    {
      // The tail answers [] when persistence is off, so a card never shows
      // lines from a log the user has asked not to keep — even one written
      // before the toggle.
      tail: (panelId, lines) =>
        layoutStore.getSetting('scrollback.persist') === true ? scrollbackLog.tail(panelId, lines) : Promise.resolve([]),
      clear: () => scrollbackLog.clearAll(),
      // Gated on the SAME setting as tail: search reads the same files, so a
      // user who turned persistence off must get nothing rather than stale
      // hits from a log they asked not to keep.
      search: (panelIds, query) =>
        layoutStore.getSetting('scrollback.persist') === true
          ? scrollbackLog.search(panelIds, query, { maxHits: SEARCH_MAX_HITS, maxPerPanel: SEARCH_MAX_PER_PANEL })
          : Promise.resolve([])
    },
    // M48. The environment report, built on demand from facts this file
    // already holds: the probe's outcome, the login env, the same which()
    // the presets use, the backend the probe chose, the layout file.
    async (again) => {
      // M107. Check again: ask the login shell once more and REPORT what it
      // found. The app's own environment (the presets' which, the PTYs' env)
      // applies on relaunch — said on the row, so a green re-probe does not
      // read as a fixed spawn.
      const env2 = again ? await reprobeShellEnv() : loginEnv
      const which2 = again ? (name: CliName) => whichFromEnv(name, env2) : which
      return buildEnvReport({
      env: env2,
      shell: shellProbeOutcome(),
      which: which2,
      backend: { kind: backend.kind, reason: backend.reason, tmuxPath: backend.kind === 'tmux' ? (which('tmux') ?? null) : null },
      layoutPath: join(app.getPath('userData'), 'layout.json'),
      backupWritten: layoutStore.backupWritten(),
      now: again ? Date.now() : probedAt,
      control: { socket: controlSocketPath, cliPath: join(launcherDir, 'tc') },
      // M107. Which shells were asked and whether one answered — the third state.
      probe: shellProbeFacts()
      })
    },
    // M51. The only place a Cmd-clicked link opens. The resolution is pure
    // (link-open.ts); this does the two shell calls and turns their outcomes
    // into a result — never a navigation of this window.
    {
      open: async (req) => {
        const cwd = ptyManager.list().find((s) => s.panelId === req.panelId)?.cwd ?? homedir()
        const r = resolveLinkOpen({ target: req.target, cwd }, { home: homedir(), exists: existsSync })
        if (r.kind === 'url') { await shell.openExternal(r.url); return { kind: 'opened' } }
        if (r.kind === 'path') {
          const err = await shell.openPath(r.path)
          return err ? { kind: 'refused', reason: err } : (r.note ? { kind: 'opened', reason: r.note } : { kind: 'opened' })
        }
        return { kind: 'refused', reason: r.reason }
      }
    },
    // M52. The ledger's read half.
    (panelId, limit) => runLedger.list(panelId, limit),
    reviewDiscard,
    // M58. The save dialog and the composited frame are main's; the arms and
    // the scrubbing live in export.ts, plain-node tested. A written file is
    // revealed in the Finder, which is the only "done" the palette can show.
    createExporters({
      log: scrollbackLog,
      persistOn: () => layoutStore.getSetting('scrollback.persist') === true,
      askPath: async (suggested) => {
        const win = mainWindow !== null && !mainWindow.isDestroyed() ? mainWindow : undefined
        const options = { defaultPath: join(app.getPath('downloads'), suggested) }
        const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
        return r.canceled || !r.filePath ? null : r.filePath
      },
      capture: async () => {
        if (mainWindow === null || mainWindow.isDestroyed()) throw new Error('no window to capture')
        return (await mainWindow.webContents.capturePage()).toPNG()
      }
    }),
    agentHandlers,
    watcherHandlers,
    // M103. The guest is resolved by the id the node learned on did-attach;
    // main checks it is a webview before reading anything.
    createBrowserHandlers({ guestOf: (id) => webContents.fromId(id) ?? null }),
    {
      ...boardLane,
      laneStatus: (req) => reviewEngine.laneStatus(req.path, req.root),
      // M115. The return path, in order: the lane's record (ids in, never a
      // path from the renderer), `git push -u origin <branch>` in the lane
      // with the USER's own git credentials (the app holds none for git),
      // then the POST through the broker — whose own write gate asks M102's
      // spend card on the teammate's chat before the token is read.
      openPr: async (req) => {
        const lane = layoutStore.worktrees().find((w) => w.id === req.worktreeId)
        if (lane === undefined) return { kind: 'no-lane', reason: 'the lane\'s worktree record is gone — check the Worktrees list' }
        const pushed = await gitRunner(buildPushArgs(lane.path, lane.branch))
        if (!pushed.ok) return { kind: 'push-failed', reason: pushed.notFound ? 'git could not be run' : (pushed.stderr.split('\n').map((l) => l.trim()).filter((l) => l !== '').find((l) => /^(fatal|error):/i.test(l)) ?? pushed.stderr.trim().split('\n').pop() ?? 'git push failed') }
        const root = await reviewEngine.status(lane.root)
        const base = root.kind === 'status' ? root.branch : 'main'
        return openPullRequest({ broker, panelId: req.panelId, teammateId: req.teammateId }, { repo: req.repo, head: lane.branch, base, title: req.title, body: req.body })
      },
      commentPr: (req) => commentIssue({ broker, panelId: req.panelId, teammateId: req.teammateId }, { repo: req.repo, number: req.number, body: req.body })
    },
    () => listPlugins(runClaudePluginList),
    // M127. The same CLI, the same login env and the same timeout as the
    // list above — two calls onto one binary, kept in step deliberately.
    (id) => describePlugin(runClaudePluginDetails(id), id),
    // M128. The four writers, with every dependency resolved HERE and none
    // of them nameable by the renderer: the writable roots are derived from
    // the asking panel's own cwd (through `resolveCwd`, the same expansion a
    // spawn gets) and the home the toolbox reads, the plugin paths are the
    // CLI's own answer, and `trash` is `shell.trashItem` so a delete is
    // recoverable in the Finder rather than gone.
    skillWriteHandlers({
      resolveCwd,
      home: resolveToolboxHome,
      realpath: realpathSync,
      plugins: async () => {
        const listed = await listPlugins(runClaudePluginList)
        // `unknown` reads as NO plugin paths, which only ever makes the
        // plugin refusal miss — never a write into a plugin's folder that
        // the containment check would then have to be trusted to catch, so
        // the roots below are what actually bound this.
        return listed.kind === 'ok' ? listed.plugins : []
      },
      trash: (path) => shell.trashItem(path)
    }),
    // M129. A chat panel's trail is derived in the renderer from events
    // already in memory (Task 8) and never asks main — `agentSessions.get`
    // is keyed by exactly the chat panels this manager tracks, so its
    // presence is the same fact the chat store itself reads. A terminal
    // panel here only ever runs claude (`codex.terminalDoor` is false —
    // §6.1's `codex` refusal has no way to be reached from a terminal in
    // this app today, and nothing here pretends otherwise): the only
    // question is whether it has a pinned agent session at all.
    async (panelId) => {
      if (agentSessions?.get(panelId) != null) {
        return { kind: 'unreadable', why: 'this is a chat; its trail is in memory' }
      }
      const sessionId = layoutStore.session(panelId)
      return trailFor({
        backend: 'claude',
        panelId,
        pinnedSession: () => sessionId,
        resolveTranscript,
        // Raw bytes + the file's current size — trailFor owns the decoder
        // and the shrink check itself now (see skill-trail-read.ts), so this
        // is the same shape transcript-reader.ts's readFrom already returns.
        readDelta: readTranscriptFrom
      })
    }
  )
  createWindow()

  // M55. The restore answer reaches the renderer once it can hold panels;
  // sendToRenderer waits for the load. The ids are the sessions' own.
  if (recovered.length > 0) sendToRenderer(IPC_EVENTS.SESSION_RECOVER, recovered)

  // M54. The door, on the winning side of the lock only (the gate above),
  // and the launcher that reaches it. The CLI file is read as NODE outside
  // this process, where app.asar is not readable — hence the unpacked path.
  void createControlServer({ path: controlSocketPath, handle: controlHandler })
    .then((server) => { controlServer = server })
    .catch((error: unknown) => console.warn(`[control] could not listen on ${controlSocketPath}: ${String(error)}`))
  try {
    const appPath = app.isPackaged ? app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked') : app.getAppPath()
    writeLauncher({
      dir: launcherDir,
      script: launcherScript({ execPath: process.execPath, cliPath: join(appPath, 'out', 'main', 'tc.js') }),
      writeFile: (p, content) => { writeFileSync(p, content); chmodSync(p, 0o755) }
    })
  } catch (error: unknown) {
    console.warn(`[control] could not write the tc launcher: ${String(error)}`)
  }
  // Only the packaged build registers itself: the dev binary would register
  // Electron.app as the handler for every terminal-canvas:// link on the Mac.
  if (app.isPackaged) app.setAsDefaultProtocolClient(CONTROL_SCHEME)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // A second launch of this build reaches the running instance here rather
  // than starting a process of its own. Restoring is not optional: on darwin
  // the window can be CLOSED while the app runs on, which is the state a user
  // relaunches from the dock to escape, so an implementation that only calls
  // focus() would leave the relaunch looking like it did nothing at all.
  app.on('second-instance', () => {
    if (mainWindow === null || mainWindow.isDestroyed()) {
      createWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
})

app.on('before-quit', () => {
  // See the whenReady gate: a losing instance quits through here, and killAll
  // -> shutdown() is kill-server on a socket the WINNER owns, while flushSync
  // writes a store this process never loaded. Both are total and silent.
  if (!hasInstanceLock) return

  // M54. Unlink the socket on the way out; a stale file is replaced at the
  // next listen anyway, but a clean quit should not leave a door on disk.
  void controlServer?.close()

  // The file watchers are the renderer's, not a session's, and go either way.
  try {
    fileWatchers.closeAll()
  } catch (error) {
    console.warn('[files] closeAll failed during quit', error)
  }
  // M38. Whether quitting ENDS the agents (M4c's sequence, the default) or
  // KEEPS them on the socket for the next launch to reattach is the
  // `session.keepOnQuit` setting — read HERE, at quit time, never captured
  // at boot, or the toggle would silently do nothing until the next launch.
  // The direct backend has no sessions to keep, so it always ends. The
  // ordering inside each arm lives in quit.ts with its reasons, where
  // verify:pty-manager can run it against a real server.
  runQuit({
    keep: layoutStore.getSetting('session.keepOnQuit') === true && backend.kind === 'tmux',
    manager: ptyManager,
    backend,
    flush: () => layoutStore.flushSync(),
    agents: agentSessions ?? undefined,
    // M84. A watcher's child is an ordinary process: nothing else in this
    // sequence would reach it, and a quit mid-run would orphan it.
    watchers: watchRunnerRef ?? undefined
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
