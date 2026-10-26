import { EventEmitter } from 'node:events'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { appRoot, appVersion, dataDir, hostSecret, hub } from './runtime'
import type { MenuKey } from './wire'

/**
 * Lane Q (M590). `electron`, for main running under plain Node on a server.
 *
 * The host build (scripts/build-host.cjs) aliases every `import … from
 * 'electron'` in src/main to THIS file, so the composition root, every store
 * and every `ipcMain.handle` run as they do in the app, unedited. Only the
 * surface main actually touches is here; the inventory was taken with
 * `grep -rnoE "\b(app|dialog|…)\.[a-zA-Z]+" src/main` and a member main does
 * not call is absent on purpose, so a new call is a loud `undefined is not a
 * function` on the host rather than a silent no-op someone has to find.
 *
 * Three kinds of member:
 *   - CARRIED to the page: `webContents.send` (events), `ipcMain` (doors),
 *     `dialog.*` and `shell.openExternal` (asked of the person in the browser).
 *   - MADE REAL on the host: `app.getPath`, `safeStorage` (AES-GCM with a key
 *     in the data folder, never the page), `net.fetch`, `shell.trashItem`.
 *   - INERT, because a server has no such thing: the dock, the tray, global
 *     shortcuts, power events, a second window's PDF printer.
 */

// ── app ─────────────────────────────────────────────────────────────────────

const paths = new Map<string, string>()

class App extends EventEmitter {
  readonly name = 'Terminal Canvas'
  /** True: the host is a deployment, and main gates its fixtures and dev paths on `!isPackaged`. */
  readonly isPackaged = process.env['TC_HOST_DEV'] !== '1'
  readonly dock = undefined
  private readyPromise: Promise<void> | null = null
  private ready = false

  whenReady(): Promise<void> {
    if (this.readyPromise === null) {
      this.readyPromise = new Promise((resolve) => setImmediate(() => {
        this.ready = true
        this.emit('ready')
        resolve()
      }))
    }
    return this.readyPromise
  }

  isReady(): boolean { return this.ready }

  getPath(name: string): string {
    const set = paths.get(name)
    if (set !== undefined) return set
    switch (name) {
      case 'userData': return dataDir
      case 'home': return homedir()
      case 'temp': return tmpdir()
      case 'downloads': return join(homedir(), 'Downloads')
      default: return join(dataDir, name)
    }
  }

  setPath(name: string, value: string): void { paths.set(name, value) }
  getVersion(): string { return appVersion }
  getName(): string { return this.name }
  getAppPath(): string { return appRoot }
  /** The host is the only instance on its data folder: the container is the lock. */
  requestSingleInstanceLock(): boolean { return true }
  setAsDefaultProtocolClient(): boolean { return false }
  getApplicationNameForProtocol(): string { return '' }

  /**
   * Electron's order: `before-quit` (preventable), then `will-quit`, then
   * exit. Main's before-quit handler is where tmux sessions are kept or
   * killed, so a SIGTERM to the container has to come through here.
   */
  quit(): void {
    let prevented = false
    const event = { preventDefault: () => { prevented = true } }
    this.emit('before-quit', event)
    if (prevented) return
    this.emit('will-quit', event)
    if (prevented) return
    this.emit('quit', event, 0)
    setImmediate(() => process.exit(0))
  }

  exit(code = 0): void { process.exit(code) }
}

export const app = new App()

// ── ipcMain ─────────────────────────────────────────────────────────────────

type IpcHandler = Parameters<typeof hub.handle>[1]
type IpcListener = Parameters<typeof hub.on>[1]

interface IpcMainLike {
  handle(channel: string, handler: IpcHandler): void
  handleOnce(channel: string, handler: IpcHandler): void
  removeHandler(channel: string): void
  on(channel: string, listener: IpcListener): IpcMainLike
  once(channel: string, listener: IpcListener): IpcMainLike
  removeListener(channel: string, listener: IpcListener): IpcMainLike
  off(channel: string, listener: IpcListener): IpcMainLike
}

export const ipcMain: IpcMainLike = {
  handle: (channel: string, handler: IpcHandler): void => hub.handle(channel, handler),
  handleOnce: (channel: string, handler: IpcHandler): void => {
    hub.handle(channel, (event, ...args) => { hub.removeHandler(channel); return handler(event, ...args) })
  },
  removeHandler: (channel: string): void => hub.removeHandler(channel),
  on: (channel: string, listener: IpcListener): IpcMainLike => { hub.on(channel, listener); return ipcMain },
  once: (channel: string, listener: IpcListener): IpcMainLike => {
    const once: IpcListener = (event, ...args) => { hub.removeListener(channel, once); listener(event, ...args) }
    hub.on(channel, once)
    return ipcMain
  },
  removeListener: (channel: string, listener: IpcListener): IpcMainLike => { hub.removeListener(channel, listener); return ipcMain },
  off: (channel: string, listener: IpcListener): IpcMainLike => { hub.removeListener(channel, listener); return ipcMain }
}

// ── windows and their contents ──────────────────────────────────────────────

const HOSTED_ONLY = 'not available in the hosted version: it needs the macOS app'

let nextContentsId = 1

class Contents extends EventEmitter {
  readonly id = nextContentsId++
  readonly session = sessionStub
  private destroyed = false

  constructor(private readonly page: boolean) { super() }

  send(channel: string, ...args: unknown[]): void {
    if (this.page && !this.destroyed) hub.broadcast(channel, args)
  }

  isDestroyed(): boolean { return this.destroyed }
  /** The page window is "loading" until a browser tab has connected and said ready. */
  isLoading(): boolean { return this.page ? !hub.live() : false }
  isFocused(): boolean { return this.page && hub.live() }
  getURL(): string { return '' }
  reload(): void { /* a tab reloads itself */ }
  focus(): void { /* the browser owns focus */ }
  setVisualZoomLevelLimits(): Promise<void> { return Promise.resolve() }
  setWindowOpenHandler(): void { /* links leave through shell.openExternal, which the page answers */ }
  capturePage(): Promise<never> { return Promise.reject(new Error(`capturing the window is ${HOSTED_ONLY}`)) }
  printToPDF(): Promise<never> { return Promise.reject(new Error(`printing to PDF is ${HOSTED_ONLY}`)) }
  destroy(): void { this.destroyed = true }
}

interface WindowOptions {
  webPreferences?: { preload?: string }
  show?: boolean
}

const windows = new Set<BrowserWindow>()
/** The window whose contents ARE the browser tab: the one main gave a preload. */
let pageWindow: BrowserWindow | null = null

export class BrowserWindow extends EventEmitter {
  readonly webContents: Contents
  private destroyed = false

  constructor(options: WindowOptions = {}) {
    super()
    const page = typeof options.webPreferences?.preload === 'string'
    this.webContents = new Contents(page)
    windows.add(this)
    if (page) pageWindow = this
    // Electron emits this once the first paint is ready; main shows the window on it.
    if (page) setImmediate(() => this.emit('ready-to-show'))
  }

  static getFocusedWindow(): BrowserWindow | null { return pageWindow !== null && hub.live() ? pageWindow : null }
  static getAllWindows(): BrowserWindow[] { return [...windows] }
  static fromWebContents(contents: unknown): BrowserWindow | null {
    for (const w of windows) if (w.webContents === contents) return w
    // A page sender (an IPC event's `sender`) belongs to the page window.
    return pageWindow
  }

  loadURL(): Promise<void> { return Promise.resolve() }
  loadFile(): Promise<void> { return Promise.resolve() }
  show(): void {}
  showInactive(): void {}
  hide(): void {}
  focus(): void {}
  blur(): void {}
  restore(): void {}
  minimize(): void {}
  maximize(): void {}
  isMinimized(): boolean { return false }
  isMaximized(): boolean { return false }
  isVisible(): boolean { return true }
  isFocused(): boolean { return this === pageWindow && hub.live() }
  isFullScreen(): boolean { return false }
  setTitle(): void {}
  setProgressBar(): void {}
  setDocumentEdited(): void {}
  setRepresentedFilename(): void {}
  flashFrame(): void {}
  getBounds(): { x: number; y: number; width: number; height: number } { return { x: 0, y: 0, width: 1440, height: 900 } }
  setBounds(): void {}
  isDestroyed(): boolean { return this.destroyed }

  close(): void { this.destroy() }
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.webContents.destroy()
    windows.delete(this)
    if (pageWindow === this) pageWindow = null
    this.emit('closed')
  }
}

/** Wires the hub's page lifecycle to the page window's contents, as Electron's own load and navigation events. */
hub.setHooks({
  onPageReady() {
    pageWindow?.webContents.emit('did-finish-load')
  },
  onPageGone() {
    // The exact event a Cmd+R produces in the app: main's attachPtyLifecycle
    // detaches (on tmux, leaves every shell running) and file watches close.
    pageWindow?.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false, url: '' })
  },
  onMenu(id) {
    const item = menuItems.get(id)
    if (item === undefined || typeof item.click !== 'function') return
    if (item.type === 'checkbox') item.checked = item.checked !== true
    try {
      item.click(item, pageWindow, {})
    } catch (error) {
      console.warn(`[host] menu item ${id} threw`, error)
    }
  }
})

export const webContents = {
  fromId: (id: number): Contents | undefined => {
    for (const w of windows) if (w.webContents.id === id) return w.webContents
    return undefined
  },
  getAllWebContents: (): Contents[] => [...windows].map((w) => w.webContents),
  getFocusedWebContents: (): Contents | null => pageWindow?.webContents ?? null
}

// ── dialogs, asked of the person in the browser ─────────────────────────────

interface MessageBoxOptions {
  type?: string
  title?: string
  message: string
  detail?: string
  buttons?: string[]
  defaultId?: number
  cancelId?: number
  checkboxLabel?: string
  checkboxChecked?: boolean
}

/** Electron's overloads take the parent window first or not at all. */
function optionsOf<T>(a: unknown, b: unknown): T {
  return (b === undefined ? a : b) as T
}

export const dialog = {
  showMessageBox(a: unknown, b?: unknown): Promise<{ response: number; checkboxChecked: boolean }> {
    const o = optionsOf<MessageBoxOptions>(a, b)
    const buttons = o.buttons && o.buttons.length > 0 ? o.buttons : ['OK']
    // No page to ask is a cancel: the safe answer to every confirm main asks.
    const cancel = o.cancelId ?? (buttons.length > 1 ? buttons.length - 1 : 0)
    return hub.ask('message', {
      type: o.type ?? 'none', title: o.title ?? '', message: o.message, detail: o.detail ?? '',
      buttons, defaultId: o.defaultId ?? 0, cancelId: cancel,
      checkboxLabel: o.checkboxLabel ?? '', checkboxChecked: o.checkboxChecked === true
    }, { response: cancel, checkboxChecked: o.checkboxChecked === true })
  },
  showOpenDialog(a: unknown, b?: unknown): Promise<{ canceled: boolean; filePaths: string[] }> {
    const o = optionsOf<{ title?: string; defaultPath?: string; properties?: string[]; filters?: unknown }>(a, b)
    return hub.ask('open', {
      title: o.title ?? 'Open', defaultPath: o.defaultPath ?? homedir(),
      directory: (o.properties ?? []).includes('openDirectory'), filters: o.filters ?? []
    }, { canceled: true, filePaths: [] })
  },
  showSaveDialog(a: unknown, b?: unknown): Promise<{ canceled: boolean; filePath?: string }> {
    const o = optionsOf<{ title?: string; defaultPath?: string; filters?: unknown }>(a, b)
    return hub.ask('save', { title: o.title ?? 'Save', defaultPath: o.defaultPath ?? join(homedir(), 'Downloads'), filters: o.filters ?? [] },
      { canceled: true })
  },
  showErrorBox(title: string, content: string): void { console.error(`[host] ${title}: ${content}`) }
}

// ── shell ───────────────────────────────────────────────────────────────────

export const shell = {
  /** The person's browser opens it, in a new tab. Nothing opens on the server. */
  openExternal(url: string): Promise<void> {
    if (!/^(https?|mailto):/i.test(url)) return Promise.reject(new Error(`refused to open ${url}: http(s) and mailto only`))
    void hub.ask('open-url', { url }, null)
    return Promise.resolve()
  },
  /** Electron's contract: '' on success, the error text otherwise. */
  openPath(): Promise<string> { return Promise.resolve(`opening a file on the server is ${HOSTED_ONLY}`) },
  showItemInFolder(): void {},
  /**
   * A server has no Trash, and `rm` is not what the app's Delete means: it
   * means "recoverable". So it moves into the data folder's own Trash, where
   * a person with a shell on the host can still get it back.
   */
  async trashItem(path: string): Promise<void> {
    const trash = join(dataDir, 'Trash')
    mkdirSync(trash, { recursive: true })
    renameSync(path, join(trash, `${Date.now()}-${basename(path)}`))
  },
  beep(): void {}
}

// ── clipboard: the host's own, which the page never reads ───────────────────

let clipText = ''

export const clipboard = {
  readText: (): string => clipText,
  writeText: (text: string): void => { clipText = text },
  readImage: (): NativeImage => nativeImage.createEmpty(),
  availableFormats: (): string[] => (clipText === '' ? [] : ['text/plain'])
}

// ── images ──────────────────────────────────────────────────────────────────

export interface NativeImage {
  isEmpty(): boolean
  toPNG(): Buffer
  toDataURL(): string
  getSize(): { width: number; height: number }
}

function image(png: Buffer): NativeImage {
  return {
    isEmpty: () => png.length === 0,
    toPNG: () => png,
    toDataURL: () => `data:image/png;base64,${png.toString('base64')}`,
    getSize: () => ({ width: png.length >= 24 ? png.readUInt32BE(16) : 0, height: png.length >= 24 ? png.readUInt32BE(20) : 0 })
  }
}

export const nativeImage = {
  createEmpty: (): NativeImage => image(Buffer.alloc(0)),
  createFromBuffer: (buffer: Buffer): NativeImage => image(buffer),
  createFromPath: (path: string): NativeImage => image(existsSync(path) ? readFileSync(path) : Buffer.alloc(0)),
  createFromDataURL: (url: string): NativeImage => image(Buffer.from(url.replace(/^data:[^,]*,/, ''), 'base64'))
}

// ── menus: the page matches their accelerators (M591) ───────────────────────

interface MenuItemLike {
  label?: string
  role?: string
  type?: string
  checked?: boolean
  accelerator?: string
  enabled?: boolean
  visible?: boolean
  click?: (item: MenuItemLike, window: BrowserWindow | null, event: unknown) => void
  submenu?: MenuItemLike[] | { template: MenuItemLike[] }
}

const menuItems = new Map<string, MenuItemLike>()

function walk(template: MenuItemLike[], path: string, keys: MenuKey[]): void {
  template.forEach((item, index) => {
    const id = `${path}${index}`
    const sub = Array.isArray(item.submenu) ? item.submenu : item.submenu?.template
    if (sub !== undefined) walk(sub, `${id}.`, keys)
    if (typeof item.click !== 'function') return
    menuItems.set(id, item)
    if (typeof item.accelerator === 'string' && item.accelerator !== '' && item.enabled !== false && item.visible !== false) {
      keys.push({ id, accelerator: item.accelerator, label: item.label ?? '' })
    }
  })
}

export class Menu {
  constructor(readonly template: MenuItemLike[] = []) {}
  static buildFromTemplate(template: MenuItemLike[]): Menu { return new Menu(template) }
  /** The page has no menu bar; what it gets is the list of keys to match. */
  static setApplicationMenu(menu: Menu | null): void {
    menuItems.clear()
    const keys: MenuKey[] = []
    if (menu !== null) walk(menu.template, '', keys)
    hub.setMenu(keys)
  }
  static getApplicationMenu(): Menu | null { return null }
  popup(): void {}
  append(): void {}
}

export class MenuItem {
  constructor(readonly options: MenuItemLike) {}
}

// ── inert on a server ───────────────────────────────────────────────────────

export class Tray extends EventEmitter {
  setImage(): void {}
  setToolTip(): void {}
  setTitle(): void {}
  setContextMenu(): void {}
  destroy(): void {}
}

export class Notification extends EventEmitter {
  static isSupported(): boolean { return false }
  show(): void {}
  close(): void {}
}

export const globalShortcut = {
  register: (): boolean => false,
  isRegistered: (): boolean => false,
  unregister: (): void => {},
  unregisterAll: (): void => {}
}

let nextBlocker = 1
const blockers = new Set<number>()
export const powerSaveBlocker = {
  start: (): number => { const id = nextBlocker++; blockers.add(id); return id },
  stop: (id: number): void => { blockers.delete(id) },
  isStarted: (id: number): boolean => blockers.has(id)
}

class PowerMonitor extends EventEmitter {
  /** A server is never idle in the screen-saver sense. */
  getSystemIdleTime(): number { return 0 }
}
export const powerMonitor = new PowerMonitor()

const sessionStub = {
  setPermissionRequestHandler: (): void => {},
  setPermissionCheckHandler: (): void => {},
  clearCache: (): Promise<void> => Promise.resolve(),
  clearStorageData: (): Promise<void> => Promise.resolve(),
  webRequest: { onHeadersReceived: (): void => {}, onBeforeRequest: (): void => {} },
  on: (): void => {}
}

export const session = {
  defaultSession: sessionStub,
  fromPartition: (): typeof sessionStub => sessionStub
}

export const net = {
  fetch: (input: string | URL | Request, init?: RequestInit): Promise<Response> => globalThis.fetch(input, init)
}

// ── safeStorage: real encryption, with the key on the host ──────────────────

/**
 * The credential store's one door. The key is a file in the data folder
 * (0600), or `TC_HOST_SECRET` when the deployment injects one; either way it
 * never crosses to the page, which keeps CLAUDE.md's rule — plaintext exists
 * in one process and crosses the bridge in neither direction — true on the
 * host as it is on the Mac.
 */
function storageKey(): Buffer {
  // A secret the deployment injects survives a volume wipe; the key file does not have to.
  if (hostSecret !== '') return createHash('sha256').update(hostSecret).digest()
  const file = join(dataDir, 'host-key')
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex')
  mkdirSync(dataDir, { recursive: true })
  const key = randomBytes(32)
  writeFileSync(file, key.toString('hex'), { mode: 0o600 })
  try { chmodSync(file, 0o600) } catch { /* the mode above already applied */ }
  return key
}

let key: Buffer | null = null

export const safeStorage = {
  isEncryptionAvailable: (): boolean => true,
  encryptString(plain: string): Buffer {
    key ??= storageKey()
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return Buffer.concat([Buffer.from('tch1'), iv, cipher.getAuthTag(), body])
  },
  decryptString(sealed: Buffer): string {
    key ??= storageKey()
    if (sealed.subarray(0, 4).toString() !== 'tch1') throw new Error('not sealed by this host')
    const iv = sealed.subarray(4, 16)
    const tag = sealed.subarray(16, 32)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(sealed.subarray(32)), decipher.final()]).toString('utf8')
  }
}

/** Not Electron's: verify:host attaches a page to the stand-in's own hub through this (host.shim.3). */
export { hub as __hubForVerify }

export default {
  app, ipcMain, BrowserWindow, webContents, dialog, shell, clipboard, nativeImage, Menu, MenuItem,
  Tray, Notification, globalShortcut, powerSaveBlocker, powerMonitor, session, net, safeStorage
}
