import { join } from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { BrowserWindow, app, dialog, shell } from 'electron'
import { registerIpcHandlers, requestCanvasCounts, requestFromRenderer } from './ipc'
import { buildAppMenu } from './menu'
import { PtyManager, resolveCwd } from './pty-manager'
import { createDirectBackend, type SessionBackend } from './session-backend'
import { probeTmux } from './tmux-probe'
import { resolveSocket } from './tmux-args'
import { attachPtyLifecycle } from './window-lifecycle'
import { resolveShellEnv, whichFromEnv } from './shell-env'
import { createLayoutStore } from './layout-store'
import { createReviewEngine } from './review-engine'
import { createReviewCommitter } from './review-commit'
import { createGitRunner } from './git-runner'
import { createBaselineCapture, staleBaselineIds } from './baseline-capture'
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
import type { CapturedPanel } from '../shared/ipc-contract'

let mainWindow: BrowserWindow | null = null

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
const layoutStore = createLayoutStore({
  filePath: join(app.getPath('userData'), 'layout.json')
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
  repoUnreadable: (panelId) => baselineCapture.unreadableDetail(panelId)
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
}

// The manager needs a way to reach the live renderer; a getter rather than a
// captured reference keeps it correct across window reloads. The backend is a
// getter for the same reason — the probe that chooses it is async and has not
// run when this module is evaluated.
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
  dropBaseline
)

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

  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    message: 'Reset this canvas?',
    detail,
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
    onToggleSetting: (id, value) => layoutStore.setPreference(id, value),
    onReset: () => {
      void confirmReset()
    },
    presets: resolveAvailability(allPresets(layoutStore.presets()), which),
    onSpawnPreset,
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
      sandbox: false
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
  attachPtyLifecycle(mainWindow, () => ptyManager.detachAll())

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
  })
}

app.whenReady().then(async () => {
  // Resolve the login-shell environment before the first PTY can be requested,
  // so no panel ever spawns with the bare launchd PATH.
  const env = await resolveShellEnv()
  loginEnv = env
  for (const binary of ['claude', 'codex', 'git']) {
    const found = whichFromEnv(binary, env)
    // The diagnostic and the review engine's git are ONE resolution, not two.
    // This loop already computed the right answer before M9a's fix round and
    // only logged it, while git-runner.ts spawned the bare name against the
    // launchd PATH — see gitPath's declaration above.
    if (binary === 'git') gitPath = found
    console.log(`[startup] ${binary}: ${found ?? 'NOT FOUND on resolved PATH'}`)
  }

  // After the env probe, because tmux must be resolved from the LOGIN PATH:
  // launchd gives a GUI app a bare PATH and /opt/homebrew/bin is not on it.
  //
  // The socket is resolved from app.isPackaged so a packaged build and a dev
  // build never share a tmux server: before-quit calls shutdown(), which is
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

  // A tmux session with no panel to reach it is worse than no session: it
  // holds a process and a shell the user cannot see, close, or type into.
  // Possible if a crash landed between a spawn and the store's coalesced save.
  //
  // Killed rather than adopted on purpose. Adopting would mint geometry the
  // user never chose, which is placement work belonging to ideas-backlog item
  // 25. This is a deliberate trade, not an oversight.
  {
    const known = new Set(
      layoutStore.initial().panels.map((p) => p.id)
    )
    // Collected as the orphan loop runs rather than from a second list()
    // call: a session KILLED as an orphan two lines below has not survived,
    // and treating it as though it had would leave its baseline in place for
    // a panel that is about to spawn a brand-new agent.
    const surviving: string[] = []
    for (const session of ptyManager.list()) {
      if (known.has(session.panelId)) {
        surviving.push(session.panelId)
        continue
      }
      console.warn(
        `[tmux] orphan session ${session.panelId} (pid ${session.pid}) has no saved ` +
          `panel; killing it. A session with no panel cannot be reached, closed, or typed into.`
      )
      backend.destroy(session.panelId)
    }

    // A baseline describes ONE session's starting point, and quitting the app
    // kills every session (before-quit runs shutdown(), i.e. kill-server), so
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
      savePanel: (captured) => {
        layoutStore.addPreset(presetFromCapture(layoutStore.presets(), captured))
        rebuildMenu()
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
      removePrompt: (id) => layoutStore.deletePrompt(id)
    },
    rebuildMenu,
    reviewEngine,
    reviewCommit
  )
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  // Teardown FIRST, flush SECOND, and the order is the whole point. killAll ->
  // kill(id) -> dropBaseline(id) -> layoutStore.dropBaseline -> scheduleWrite,
  // a 500ms debounce on a process that is quitting: flushing before the
  // teardown loses every one of those writes silently, so memory says the
  // baselines are gone while layout.json says they are not, and layout.json
  // wins at the next launch. There is nothing to race — kill() is synchronous
  // all the way down to the backend's execFileSync.
  //
  // Wrapped so the flush still runs if the teardown throws. An exception in
  // before-quit can wedge the quit before the window is allowed to close, and
  // losing the flush would ALSO be the very bug this reordering fixes.
  // flushSync itself is safe to leave bare: writeNow catches its own errors
  // and says so in its comment.
  try {
    ptyManager.killAll()
  } catch (error) {
    console.warn('[pty] killAll failed during quit', error)
  }
  layoutStore.flushSync()
  // Quit is the one teardown where sessions are NOT meant to survive. M4c's
  // scope is reload survival: agents never outlive the app, so there is no
  // process left burning tokens behind a closed window.
  try {
    backend.shutdown()
  } catch (error) {
    // Never throw here. An exception in before-quit can wedge the quit before
    // the window is allowed to close — the same rule layoutStore.flushSync
    // follows.
    console.warn('[tmux] shutdown failed', error)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
