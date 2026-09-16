import { join } from 'node:path'
import { BrowserWindow, session, shell } from 'electron'
import { attachPtyLifecycle } from '../window-lifecycle'
import { pushDefaultPreset } from '../presets'
import type { Stores } from './stores'
import type { MainState } from './context'

/**
 * The shell window and every guard on it.
 *
 * Five of the handlers below are named by `verify:meta browser.1`, which
 * reads this file AS TEXT: `will-attach-webview`, the partition's two
 * permission handlers, the guest's window-open handler and its
 * `will-navigate`. Renaming or restructuring them to taste breaks that check
 * even when the behaviour is identical — it cannot execute a window, so
 * reading for the names is the only pin available.
 */
export function createWindow(state: MainState, stores: Stores): void {
  const window = new BrowserWindow({
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
      additionalArguments: state.telemetryOn ? ['--tc-telemetry=1'] : []
    }
  })
  state.window = window

  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    // Only if this window is still the current one: `createWindow` can run
    // again (activate, second-instance) before a previous window's `closed`
    // lands, and clearing unconditionally would null out the LIVE window.
    if (state.window === window) state.window = null
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
  attachPtyLifecycle(window, () => {
    stores.ptyManager.detachAll()
    stores.fileWatchers.closeAll()
  })

  // Belt and braces against Chromium's own pinch-to-zoom. The renderer
  // preventDefaults ctrl+wheel on every path the camera claims — but not on
  // the ones it YIELDS: a pinch over the command palette is deliberately left
  // uncancelled (shouldYieldWheel's rule 1), so this is the only thing
  // stopping it zooming the whole UI, which would silently break every
  // coordinate the canvas computes.
  window.webContents.setVisualZoomLevelLimits(1, 1).catch((error: unknown) => {
    console.warn('[window] could not pin visual zoom', error)
  })

  // Second line of defence behind the renderer's drop guard. Any navigation
  // away from the app kills every PTY in this window (attachPtyLifecycle), and
  // there is no navigation this window is ever supposed to perform after its
  // initial load — so refuse them all rather than trust one renderer listener.
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    console.warn(`[window] blocked navigation to ${url}`)
  })

  // Never let a link navigate the shell window itself.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // M103. THE GUEST'S PROPERTIES, CLOSED BEFORE IT EXISTS. A page cannot set
  // them, and the node does not need to remember to: whatever the tag's
  // attributes say, the guest gets no preload, no node integration and
  // context isolation — and only an http(s) src ever attaches, so a record
  // that slipped past the parser with a file: url still opens nothing.
  window.webContents.on('will-attach-webview', (event, webPreferences, params) => {
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
  window.webContents.on('did-attach-webview', (_event, guest) => {
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
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
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
  window.webContents.on('did-finish-load', () => {
    pushDefaultPreset(window.webContents, stores.layoutStore)
    // M43. The snapshot M6d declined twice: a fresh renderer reads zero waiting
    // until the next real transition, while the dock badge (main's own count)
    // says N. Re-emit each session's current state so the two agree.
    stores.ptyManager.resendStates()
  })
}

/**
 * M54. ONE send behind both control doors — the socket and the URL scheme —
 * and behind every `sendToRenderer` caller besides. A request may arrive with
 * the window closed (darwin keeps the app running) or still loading (a
 * launch-time URL), so this OPENS a window when there is none and waits for
 * the load rather than sending into a page that is not there yet.
 *
 * That opening is exactly why a background event must NOT come through here:
 * a timer watcher's tick would pop the app back open while nobody is looking
 * (M84's verifier). News for a window that exists goes through
 * `readyContents` instead.
 */
export function sendToRenderer(state: MainState, stores: Stores, channel: string, payload: unknown): void {
  if (state.window === null || state.window.isDestroyed()) createWindow(state, stores)
  const win = state.window
  if (win === null) return
  const wc = win.webContents
  if (wc.isLoading()) wc.once('did-finish-load', () => wc.send(channel, payload))
  else wc.send(channel, payload)
  if (win.isMinimized()) win.restore()
  win.show()
}
