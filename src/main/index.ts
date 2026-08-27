import { join } from 'node:path'
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
import { IPC_EVENTS } from '../shared/ipc-contract'
import {
  allPresets,
  autoName,
  mintPresetId,
  mintPromptId,
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

// The manager needs a way to reach the live renderer; a getter rather than a
// captured reference keeps it correct across window reloads. The backend is a
// getter for the same reason — the probe that chooses it is async and has not
// run when this module is evaluated.
const ptyManager = new PtyManager(
  () => mainWindow?.webContents ?? null,
  () => backend
)

// userData is the standard per-user application directory; app.getPath is only
// valid once the app module is loaded, which it is by the time this module runs.
const layoutStore = createLayoutStore({
  filePath: join(app.getPath('userData'), 'layout.json')
})

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
    settings: layoutStore.settings(),
    onToggle: (key, value) => layoutStore.setSetting(key, value),
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
  const user = layoutStore.presets()
  const preset = {
    id: mintPresetId(user),
    name: autoName(captured, allPresets(user)),
    cwd: captured.cwd,
    // Absent stays absent, all the way to resolveCommand.
    ...(captured.command !== undefined ? { command: captured.command } : {}),
    args: [...captured.args],
    w: captured.w,
    h: captured.h
  }
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
    for (const session of ptyManager.list()) {
      if (known.has(session.panelId)) continue
      console.warn(
        `[tmux] orphan session ${session.panelId} (pid ${session.pid}) has no saved ` +
          `panel; killing it. A session with no panel cannot be reached, closed, or typed into.`
      )
      backend.destroy(session.panelId)
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
    rebuildMenu
  )
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  // Flush BEFORE tearing anything down. killAll can take time and this must
  // not be racing a process teardown; the store already holds the newest
  // snapshot, so this is a synchronous write with nothing to wait for.
  layoutStore.flushSync()
  ptyManager.killAll()
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
