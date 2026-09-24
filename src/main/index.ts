import { join } from 'node:path'
import { writeFileSync, chmodSync } from 'node:fs'
import { app } from 'electron'
import { registerIpcHandlers } from './ipc'
import { createBrowserHandlers } from './browser-read'
import { resolveShellEnv, whichFromEnv } from './shell-env'
import { probeTmux } from './tmux-probe'
import { resolveSocket } from './tmux-args'
import { createControlServer } from './control-server'
import { parseControlUrl, CONTROL_SCHEME } from './control-protocol'
import { launcherScript, writeLauncher } from './launcher'
import { runQuit } from './quit'
import { webContents } from 'electron'
import { IPC_EVENTS } from '../shared/ipc-contract'
import { createMainState, createPanelTokens } from './bootstrap/context'
import { createStores } from './bootstrap/stores'
import { createPlaces } from './bootstrap/places'
import { createMenuActions } from './bootstrap/menu-actions'
import { createControlWiring } from './bootstrap/control-wiring'
import { createWindow, sendToRenderer } from './bootstrap/window'
import { startAgentRuntime, createJobDoors } from './bootstrap/agent-runtime'
import { createTaskDoors } from './bootstrap/task-handlers'
import { withDigests } from './task-evidence'
import { initTelemetry } from './bootstrap/telemetry-init'
import { sweepOrphans } from './bootstrap/orphan-sweep'
import { createWatchWiring } from './bootstrap/watch-handlers'
import { createKitHandlers } from './bootstrap/kit-handlers'
import { createAgentHandlers } from './bootstrap/agent-handlers'
import { createPaletteWiring } from './bootstrap/palette-handlers'
import { createToolboxHandlers } from './bootstrap/toolbox-handlers'
import {
  createEnvReporter, createExportHandlers, createLinkHandlers, createPreviewHandlers,
  createScrollbackHandlers, createTrailReader, createWorktreeHandlers
} from './bootstrap/panel-handlers'
import {
  createAssetHandlers, createBoardHandlers, createDocxHandlers, createNodeFetchHandlers,
  createPackWiring, createPortableHandlers, createPublishHandlers, createToolGeneratorWiring,
  createUpdateHandlers
} from './bootstrap/workspace-handlers'

/**
 * THE COMPOSITION ROOT. Every collaborator main owns is constructed here and
 * nowhere else; the modules under `bootstrap/` hold the wiring, and this file
 * holds the ORDER — which is the part that is load-bearing.
 *
 * Three phases, and each one's position is a decision:
 *   1. Module scope: the single-instance lock, the object graph, and the two
 *      doors macOS can knock on before `whenReady` (`open-url`).
 *   2. `app.whenReady()`: the env probe first, then everything that needs a
 *      resolved PATH — the agent runtime, the tmux backend, the window.
 *   3. `before-quit` / `window-all-closed`: teardown, gated on the same lock.
 *
 * `bootstrap/context.ts` explains why the late-resolved values travel as a
 * mutable `state` record rather than as arguments. Read that before moving a
 * construction earlier or later than it sits here.
 */

const state = createMainState()
const tokens = createPanelTokens()

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

const stores = createStores(state)

/**
 * The login environment is resolved inside whenReady, so availability costs
 * nothing extra — it is the same whichFromEnv the startup diagnostic runs.
 * Probed ONCE: a brew install mid-session is not noticed until relaunch,
 * which is a known limit rather than a bug.
 */
const which = (command: string): string | null => whichFromEnv(command, state.loginEnv)

const places = createPlaces(stores)
const menu = createMenuActions(state, stores, which)
const control = createControlWiring(state, stores, places, tokens)
// M311–M314. Built at module scope with the other collaborators; every
// closure inside reads `state` at the point of use (context.ts's rule).
const kit = createKitHandlers(state, stores, app.getPath('userData'))

// M54. The URL door. Registered at module scope because macOS delivers a
// launch-time URL before whenReady's body runs. The URL never reaches the
// renderer — this is not a navigation, and will-navigate /
// setWindowOpenHandler stay exactly as they are.
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (!hasInstanceLock) return
  const parsed = parseControlUrl(url)
  if (parsed.kind === 'bad') { console.warn(`[control] refused URL ${url}: ${parsed.error}`); return }
  void control.handler(parsed.req).then((r) => { if (!r.ok) console.warn(`[control] URL refused — ${r.error ?? ''}`) })
})

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
  state.loginEnv = env
  state.probedAt = Date.now()
  for (const binary of ['claude', 'codex', 'copilot', 'git']) {
    const found = whichFromEnv(binary, env)
    // The diagnostic and the review engine's git are ONE resolution, not two.
    // This loop already computed the right answer before M9a's fix round and
    // only logged it, while git-runner.ts spawned the bare name against the
    // launchd PATH — see MainState's own comment on gitPath.
    if (binary === 'git') state.gitPath = found
    if (binary === 'claude') state.claudePath = found
    if (binary === 'codex') state.codexPath = found
    if (binary === 'copilot') state.copilotPath = found
    console.log(`[startup] ${binary}: ${found ?? 'NOT FOUND on resolved PATH'}`)
  }

  // M71/M76/M138. The agent runtime, its approval tracker and the pool caller
  // — all three onto `state`, all three needing the env probe above.
  startAgentRuntime(state, stores, tokens)

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
  state.backend = await probeTmux(env, app.getPath('userData'), tmuxSocket)

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
      `socket=${tmuxSocket} backend=${state.backend.kind} (${state.backend.reason}) ` +
      `PATH=${env['PATH'] ?? '<none>'}`
  )

  // Load before the menu and window exist: Task 10 gives the menu the restore
  // settings, and the renderer's first act is layout:load, which needs a
  // resolved store to answer from.
  stores.layoutStore.load()

  // AFTER the store loads (the setting lives there) and BEFORE the window
  // exists (the renderer learns the decision as an argv flag, not a channel).
  await initTelemetry(state, stores)

  // M55. The orphan sweep and the stale-baseline drop, both of which need the
  // store loaded and neither of which needs a window.
  const recovered = await sweepOrphans(state, stores)

  menu.rebuildMenu()

  const watch = createWatchWiring(state, stores)
  // M84. Read by the quit sequence: a watcher's child is an ordinary process
  // that nothing else in that sequence would reach.
  state.watchRunner = watch.runner

  const palette = createPaletteWiring(state, stores, places, menu, control, which)
  // M101. Arm every routine the layout holds; a tick that fell while the app
  // was closed is marked missed here (startup only), never fired.
  palette.armRoutines(true)

  const toolbox = createToolboxHandlers(state, places)

  // POSITIONAL, AND THE ORDER IS THE CONTRACT. Every parameter of
  // `registerIpcHandlers` is documented "appended last so no existing
  // positional call site shifts" — `scripts/panels-entry.cjs` and the other
  // Electron harness entries construct it the same way. Inserting, removing
  // or reordering an argument here silently re-binds every later one to the
  // wrong collaborator, and the failure is a wrong answer on a channel rather
  // than a type error.
  registerIpcHandlers(
    stores.ptyManager,
    stores.layoutStore,
    () => ({
      kind: state.backend.kind,
      reason: state.backend.reason
    }),
    palette.handlers,
    menu.rebuildMenu,
    stores.reviewEngine,
    stores.reviewCommit,
    stores.credentialStore,
    stores.fileWatchers,
    () => state.window,
    stores.toolboxCache,
    join(app.getPath('userData'), 'diagnostics'),
    createWorktreeHandlers(stores),
    createScrollbackHandlers(stores),
    createEnvReporter(state, stores, which),
    createLinkHandlers(stores, kit.editorOpen),
    // M52. The ledger's read half.
    (panelId, limit) => stores.runLedger.list(panelId, limit),
    stores.reviewDiscard,
    createExportHandlers(state, stores),
    createAgentHandlers(state, stores, places),
    watch.handlers,
    // M103. The guest is resolved by the id the node learned on did-attach;
    // main checks it is a webview before reading anything.
    createBrowserHandlers({ guestOf: (id) => webContents.fromId(id) ?? null }),
    createBoardHandlers(stores, places, control),
    toolbox.listPlugins,
    toolbox.pluginDetails,
    toolbox.skillWrite,
    createTrailReader(state, stores),
    createUpdateHandlers(),
    createPreviewHandlers(),
    createAssetHandlers(state),
    createNodeFetchHandlers(),
    createPortableHandlers(state),
    createDocxHandlers(state),
    createToolGeneratorWiring(state),
    createPackWiring(state, stores, menu.afterPresetChange, which),
    createPublishHandlers(state, stores, control),
    // M300. The durable record's two doors, on the SAME ledger the M52 read
    // half above uses — one file, one queue, one trim.
    (filter, limit) => stores.runLedger.timeline(filter, limit),
    async (row) => {
      try {
        // M320. An artifact row's per-path digests are MAIN's, taken from
        // the files as they are now, at the moment the row lands — the
        // reviewed version a later reader compares the live file with.
        await stores.runLedger.append(await withDigests(row))
        return true
      } catch {
        // A row that did not land is reported as not landed. The caller says
        // so; it does not get a silent true and a record with a hole in it.
        return false
      }
    },
    // M306. One check run's exact output, from its own store beside the ledger.
    (runId) => stores.checkOutputs.read(runId),
    // M311–M314. The workflow kit: combine, repository setup, editor, recipes.
    kit,
    // Brief #20. What was running when the window last went away, once.
    () => stores.lastExit.take(),
    // M316. The job journal's doors: what an interrupted pool left, and the choices.
    createJobDoors(state, stores),
    // M320–M321. The task doors: deliverables, their search index, the gated
    // hand-off export, and the recipe preflight.
    createTaskDoors(state, stores)
  )
  createWindow(state, stores)

  // M55. The restore answer reaches the renderer once it can hold panels;
  // sendToRenderer waits for the load. The ids are the sessions' own.
  if (recovered.length > 0) sendToRenderer(state, stores, IPC_EVENTS.SESSION_RECOVER, recovered)

  // M54. The door, on the winning side of the lock only (the gate above),
  // and the launcher that reaches it. The CLI file is read as NODE outside
  // this process, where app.asar is not readable — hence the unpacked path.
  void createControlServer({ path: stores.controlSocketPath, handle: control.handler })
    .then((server) => { state.controlServer = server })
    .catch((error: unknown) => console.warn(`[control] could not listen on ${stores.controlSocketPath}: ${String(error)}`))
  try {
    const appPath = app.isPackaged ? app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked') : app.getAppPath()
    writeLauncher({
      dir: stores.launcherDir,
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
    if (state.window === null || state.window.isDestroyed()) createWindow(state, stores)
  })

  // A second launch of this build reaches the running instance here rather
  // than starting a process of its own. Restoring is not optional: on darwin
  // the window can be CLOSED while the app runs on, which is the state a user
  // relaunches from the dock to escape, so an implementation that only calls
  // focus() would leave the relaunch looking like it did nothing at all.
  app.on('second-instance', () => {
    if (state.window === null || state.window.isDestroyed()) {
      createWindow(state, stores)
      return
    }
    if (state.window.isMinimized()) state.window.restore()
    state.window.show()
    state.window.focus()
  })
})

app.on('before-quit', () => {
  // See the whenReady gate: a losing instance quits through here, and killAll
  // -> shutdown() is kill-server on a socket the WINNER owns, while flushSync
  // writes a store this process never loaded. Both are total and silent.
  if (!hasInstanceLock) return

  // M54. Unlink the socket on the way out; a stale file is replaced at the
  // next listen anyway, but a clean quit should not leave a door on disk.
  void state.controlServer?.close()

  // The file watchers are the renderer's, not a session's, and go either way.
  try {
    stores.fileWatchers.closeAll()
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
  const keepOnQuit = stores.layoutStore.getSetting('session.keepOnQuit') === true && state.backend.kind === 'tmux'
  // Brief #20. Which panels had a session at this moment, recorded BEFORE the
  // teardown below empties the list — the next launch's only way to tell a
  // session the quit stopped from one that was kept and died anyway.
  try {
    stores.lastExit.record('quit', keepOnQuit, stores.ptyManager.list().map((s) => s.panelId))
  } catch (error) {
    console.warn('[quit] could not record the running sessions', error)
  }
  runQuit({
    keep: keepOnQuit,
    manager: stores.ptyManager,
    backend: state.backend,
    flush: () => stores.layoutStore.flushSync(),
    agents: state.agents ?? undefined,
    // M84. A watcher's child is an ordinary process: nothing else in this
    // sequence would reach it, and a quit mid-run would orphan it.
    watchers: state.watchRunner ?? undefined
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
