import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import { registerIpcHandlers } from './ipc'
import { buildAppMenu } from './menu'
import { PtyManager } from './pty-manager'
import { attachPtyLifecycle } from './window-lifecycle'
import { resolveShellEnv, whichFromEnv } from './shell-env'
import { createLayoutStore } from './layout-store'

let mainWindow: BrowserWindow | null = null

// The manager needs a way to reach the live renderer; a getter rather than a
// captured reference keeps it correct across window reloads.
const ptyManager = new PtyManager(() => mainWindow?.webContents ?? null)

// userData is the standard per-user application directory; app.getPath is only
// valid once the app module is loaded, which it is by the time this module runs.
const layoutStore = createLayoutStore({
  filePath: join(app.getPath('userData'), 'layout.json')
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
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Cmd+R and Cmd+W destroy the renderer without running React cleanup, so no
  // pty:kill is ever sent. Without this the surviving PTY makes the next
  // pty:create throw "already has a live PTY" and the panel is unrecoverable.
  attachPtyLifecycle(mainWindow, () => ptyManager.killAll())

  // Belt and braces against Chromium's own pinch-to-zoom. The renderer already
  // preventDefaults ctrl+wheel, but a missed path must not be able to zoom the
  // whole UI, which would silently break every coordinate the canvas computes.
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
}

app.whenReady().then(async () => {
  // Resolve the login-shell environment before the first PTY can be requested,
  // so no panel ever spawns with the bare launchd PATH.
  const env = await resolveShellEnv()
  for (const binary of ['claude', 'codex', 'git']) {
    const found = whichFromEnv(binary, env)
    console.log(`[startup] ${binary}: ${found ?? 'NOT FOUND on resolved PATH'}`)
  }

  // Load before the menu and window exist: Task 10 gives the menu the restore
  // settings, and the renderer's first act is layout:load, which needs a
  // resolved store to answer from.
  layoutStore.load()

  buildAppMenu()
  registerIpcHandlers(ptyManager, layoutStore)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  // Flush BEFORE killing the PTYs. killAll can take time and this must not be
  // racing a process teardown; the store already holds the newest snapshot, so
  // this is a synchronous write with nothing to wait for.
  layoutStore.flushSync()
  ptyManager.killAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
