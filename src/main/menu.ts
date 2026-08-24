import { BrowserWindow, Menu, app, clipboard, type MenuItemConstructorOptions } from 'electron'
import { IPC_EVENTS } from '../shared/ipc-contract'

/**
 * Cmd+C / Cmd+V need to reach xterm, not the app menu's default handlers.
 *
 * The stock roles ('copy'/'paste') drive document.execCommand against the
 * focused DOM element. xterm keeps its input in an offscreen textarea and, with
 * the WebGL renderer, its selection is not a DOM selection at all - so the role
 * either copies nothing or copies the wrong thing.
 *
 * Instead we keep the accelerators (so the OS shows them, and so they take
 * priority over the page) but hand the work to the renderer, which knows how to
 * ask xterm for its selection and how to push text into the PTY.
 *
 * Ctrl+C is deliberately untouched and flows through to the PTY as SIGINT -
 * which is what you want when an agent is mid-run.
 */
export function buildAppMenu(): void {
  const focused = (): BrowserWindow | null => BrowserWindow.getFocusedWindow()

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => focused()?.webContents.send(IPC_EVENTS.EDIT_UNDO)
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          click: () => focused()?.webContents.send(IPC_EVENTS.EDIT_REDO)
        },
        { type: 'separator' },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          click: () => focused()?.webContents.send(IPC_EVENTS.EDIT_COPY)
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          click: () => {
            // Read the clipboard here in main and ship the text down, so the
            // renderer never needs clipboard permissions of its own.
            focused()?.webContents.send(IPC_EVENTS.EDIT_PASTE, clipboard.readText())
          }
        },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
