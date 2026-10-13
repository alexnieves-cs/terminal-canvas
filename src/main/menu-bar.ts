import { Menu, Tray, app, globalShortcut, nativeImage, type BrowserWindow } from 'electron'
import { IPC_EVENTS } from '../shared/ipc-contract'
import { needsYouCount } from '../shared/attention-words'

/**
 * The UX pass (notes/ux-proposals.md 5.1). THE APP OUTSIDE ITS WINDOW.
 *
 * Two doors that work while another app is in front:
 *  - a menu-bar item whose title is the needs-you count (the dock badge's
 *    number, from the same one writer), with New task… and Show in its menu;
 *  - a system-wide chord, ⌃⌥Space, that brings the window forward on the
 *    New task sheet.
 *
 * Neither reads or sends anything the window does not already: the count is
 * the badge's, and both verbs are the menu's own `SPAWN_OPEN_SHEET 'task'`
 * and focus. A chord another app already holds is left to it — `register`
 * returns false and the menu-bar row still opens the sheet.
 *
 * Module state, not a store: one tray per process, made after `whenReady`
 * (a Tray before it throws), and `menuBarCount` may be called earlier by the
 * badge — the count is held and painted when the tray exists.
 */

export const NEW_TASK_GLOBAL_CHORD = 'Control+Alt+Space'

let tray: Tray | null = null
let count = 0
let windowOf: () => BrowserWindow | null = () => null

/** The menu-bar title for a count: the number alone, or nothing at zero (never a bare "0"). */
export function menuBarTitle(n: number): string {
  return n > 0 ? String(n) : ''
}

function bringForward(): BrowserWindow | null {
  const win = windowOf()
  if (win === null || win.isDestroyed()) return null
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return win
}

function newTask(): void {
  bringForward()?.webContents.send(IPC_EVENTS.SPAWN_OPEN_SHEET, 'task')
}

function paint(): void {
  if (tray === null) return
  tray.setTitle(menuBarTitle(count))
  tray.setToolTip(count > 0 ? `Terminal Canvas — ${needsYouCount(count)}` : 'Terminal Canvas')
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: count > 0 ? `${needsYouCount(count)} — show the next` : 'Nothing needs you',
      enabled: count > 0,
      // The ⌘J path with no id: the renderer walks to the first that waits.
      click: () => { bringForward()?.webContents.send(IPC_EVENTS.ATTENTION_JUMP, null) }
    },
    { type: 'separator' },
    { label: 'New task…', accelerator: NEW_TASK_GLOBAL_CHORD, click: newTask },
    { label: 'Show Terminal Canvas', click: () => { bringForward() } },
    { type: 'separator' },
    { role: 'quit' }
  ]))
}

/** The badge's sink calls this with the same sum it writes on the dock. */
export function menuBarCount(n: number): void {
  count = n
  paint()
}

export function installMenuBar(getWindow: () => BrowserWindow | null): void {
  windowOf = getWindow
  if (tray === null) {
    tray = new Tray(nativeImage.createEmpty())
    paint()
  }
  if (!globalShortcut.isRegistered(NEW_TASK_GLOBAL_CHORD)) {
    const ok = globalShortcut.register(NEW_TASK_GLOBAL_CHORD, newTask)
    if (!ok) console.warn(`[menu-bar] ${NEW_TASK_GLOBAL_CHORD} is held by another app; New task stays in the menu-bar item`)
  }
  app.on('will-quit', () => { globalShortcut.unregister(NEW_TASK_GLOBAL_CHORD) })
}
