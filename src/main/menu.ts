import { BrowserWindow, Menu, app, clipboard, type MenuItemConstructorOptions } from 'electron'
import { IPC_EVENTS } from '../shared/ipc-contract'
import { APPEARANCE_CATEGORY, RESTORE_CATEGORY, settingsInCategory, type SettingValue } from '../shared/settings-schema'
import { acceleratorFor, parseOverrideList } from '../shared/shortcut-overrides'
import { menuLabel, type PresetAvailability } from './presets'

export interface AppMenuOptions {
  /** M106. The Workspace menu's two verbs. */
  onTidy: () => void
  /** M190. Help ▸ Prepare feedback… — the renderer builds and opens the draft. */
  onFeedback: () => void
  onFlip: () => void
  /** M65. The File menu's New panel… (⌘⇧N): open the spawn sheet. */
  onOpenSheet(): void
  /** Resolved current values, keyed by SettingDef.id. */
  settingValue(id: string): SettingValue
  onToggleSetting(id: string, value: SettingValue): void
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
function stringList(value: SettingValue): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

export function buildAppMenu(options: AppMenuOptions): void {
  const focused = (): BrowserWindow | null => BrowserWindow.getFocusedWindow()
  // R-025. An empty override list is today's historical accelerator:
  // acceleratorFor(id, []) is electronAccelerator(id). Listeners still match
  // the frozen registry; this only changes what the menu shows.
  const accel = (id: string): string => acceleratorFor(id, parseOverrideList(stringList(options.settingValue('keyboard.overrides'))))

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: RESTORE_CATEGORY,
          // Built from the schema, not a hand-written list. A second list of
          // the same settings is a list that drifts, and the symptom is a menu
          // that silently stops offering something the palette still offers.
          submenu: settingsInCategory(RESTORE_CATEGORY).map((def) => ({
            label: def.label,
            type: 'checkbox' as const,
            checked: options.settingValue(def.id) === true,
            // Nothing in the running session changes: these affect boot only,
            // which is exactly why they need no IPC event of their own.
            click: (item) => options.onToggleSetting(def.id, item.checked)
          }))
        },
        {
          label: APPEARANCE_CATEGORY,
          // M45. One radio group per enum setting, derived from the schema
          // the same way the Restore submenu is. `checked` is the setting's
          // current value, so a change made in the palette redraws here on
          // the rebuild settings:set already triggers.
          submenu: settingsInCategory(APPEARANCE_CATEGORY).flatMap((def) =>
            (def.values ?? []).map((value) => ({
              label: `${def.label}: ${value}`,
              type: 'radio' as const,
              checked: options.settingValue(def.id) === value,
              click: () => options.onToggleSetting(def.id, value)
            }))
          )
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
          // M65. The spawn sheet: where, what, how. ⌘N stays the instant
          // default; this is the considered one.
          label: 'New panel…',
          accelerator: accel('spawn-sheet'),
          click: () => options.onOpenSheet()
        },
        {
          label: 'New panel from preset',
          submenu: options.presets.map((entry) => ({
            label: menuLabel(entry),
            // Disabled rather than hidden: a user who installed neither CLI
            // should still learn the feature exists and what it wants.
            enabled: entry.available && entry.preset.reviewed !== false,
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
          accelerator: accel('undo'),
          click: () => focused()?.webContents.send(IPC_EVENTS.EDIT_UNDO)
        },
        {
          label: 'Redo',
          accelerator: accel('redo'),
          click: () => focused()?.webContents.send(IPC_EVENTS.EDIT_REDO)
        },
        { type: 'separator' },
        {
          label: 'Copy',
          accelerator: accel('copy'),
          click: () => focused()?.webContents.send(IPC_EVENTS.EDIT_COPY)
        },
        {
          label: 'Paste',
          accelerator: accel('paste'),
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
      // M106. The workspace's two verbs, in one menu: Tidy Panes (M40's
      // arrangement, one undo) and Flip Terminals (M57's far view invoked
      // deliberately — a view state, never persisted).
      label: 'Workspace',
      submenu: [
        { label: 'Tidy Panes', accelerator: accel('tidy-alias'), click: () => options.onTidy() },
        { label: 'Flip Terminals', accelerator: accel('flip'), click: () => options.onFlip() }
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
    { role: 'windowMenu' },
    {
      // M190. The feedback door in the menu bar, where a person looks for it.
      // It opens a DRAFT in their own browser; the app submits nothing, and
      // the label says "Prepare" for exactly that reason.
      role: 'help',
      submenu: [
        { label: 'Prepare feedback…', click: () => options.onFeedback() }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
