import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import { registerIpcHandlers } from './ipc'
import { buildAppMenu } from './menu'
import { PtyManager } from './pty-manager'
import { attachPtyLifecycle } from './window-lifecycle'
import { resolveShellEnv, whichFromEnv } from './shell-env'

let mainWindow: BrowserWindow | null = null

// The manager needs a way to reach the live renderer; a getter rather than a
// captured reference keeps it correct across window reloads.
const ptyManager = new PtyManager(() => mainWindow?.webContents ?? null)

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

  buildAppMenu()
  registerIpcHandlers(ptyManager)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => ptyManager.killAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
