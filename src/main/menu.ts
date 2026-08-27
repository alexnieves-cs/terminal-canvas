import { BrowserWindow, Menu, app, clipboard, type MenuItemConstructorOptions } from 'electron'
import { IPC_EVENTS } from '../shared/ipc-contract'
import { settingsInCategory, type SettingValue } from '../shared/settings-schema'
import { menuLabel, type PresetAvailability } from './presets'

export interface AppMenuOptions {
  /** Resolved current values, keyed by SettingDef.id. */
  settingValue(id: string): SettingValue
  onToggleSetting(id: string, value: boolean): void
  onReset(): void
  /** Built-ins and user presets together, each already resolved for availability. */
  presets: PresetAvailability[]
  onSpawnPreset(id: string): void
  onSavePreset(): void
}

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
export function buildAppMenu(options: AppMenuOptions): void {
  const focused = (): BrowserWindow | null => BrowserWindow.getFocusedWindow()

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Restore on launch',
          // Built from the schema, not a hand-written list. A second list of
          // the same settings is a list that drifts, and the symptom is a menu
          // that silently stops offering something the palette still offers.
          submenu: settingsInCategory('Restore on launch').map((def) => ({
            label: def.label,
            type: 'checkbox' as const,
            checked: options.settingValue(def.id) === true,
            // Nothing in the running session changes: these affect boot only,
            // which is exactly why they need no IPC event of their own.
            click: (item) => options.onToggleSetting(def.id, item.checked)
          }))
        },
        {
          label: 'Reset canvas…',
          click: () => options.onReset()
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New panel from preset',
          submenu: options.presets.map((entry) => ({
            label: menuLabel(entry),
            // Disabled rather than hidden: a user who installed neither CLI
            // should still learn the feature exists and what it wants.
            enabled: entry.available,
            click: () => options.onSpawnPreset(entry.preset.id)
          }))
        },
        {
          // No ellipsis: on macOS that promises a dialog, and M5a opens none —
          // a saved preset names itself. See autoName in presets.ts.
          label: 'Save panel as preset',
          click: () => options.onSavePreset()
        }
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
