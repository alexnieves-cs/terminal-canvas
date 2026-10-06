/**
 * M446. The Settings nav, as data.
 *
 * Seven pages, in the order the screen shows them. Keyboard has no schema
 * category: its rows are the shortcut registry. Every other page hosts the
 * settings whose category it names, so the page is the schema's rows plus
 * one sentence about what the page is for — a heading over an empty box
 * would read as a section that was never built.
 *
 * List settings stay out. They are memory (which hints have been seen,
 * which navigator sections are folded, the override list itself), not a
 * choice a person toggles from a row.
 */

import {
  ACCESSIBILITY_CATEGORY,
  AGENT_CATEGORY,
  APPEARANCE_CATEGORY,
  FILES_CATEGORY,
  RESTORE_CATEGORY,
  SESSION_CATEGORY,
  SETTINGS,
  SHELL_CATEGORY,
  TELEMETRY_CATEGORY,
  TERMINAL_CATEGORY,
  UPDATES_CATEGORY,
  type SettingDef
} from '@shared/settings-schema'

export type SettingsPaneId = 'general' | 'appearance' | 'agents' | 'sessions' | 'keyboard' | 'integrations' | 'privacy'

export interface SettingsPane {
  id: SettingsPaneId
  label: string
  purpose: string
  categories: readonly string[]
}

export const SETTINGS_PANES: readonly SettingsPane[] = [
  {
    id: 'general',
    label: 'General',
    purpose: 'How the window is arranged, how terminal type is sized, and whether a launch looks for a newer release.',
    categories: [SHELL_CATEGORY, ACCESSIBILITY_CATEGORY, TERMINAL_CATEGORY, UPDATES_CATEGORY]
  },
  {
    id: 'appearance',
    label: 'Appearance',
    purpose: 'Which theme the canvas uses, and whether the opening animation plays.',
    categories: [APPEARANCE_CATEGORY]
  },
  {
    id: 'agents',
    label: 'Agents',
    purpose: 'How many agents may run, what they may spend, and how the canvas shows what they are doing.',
    categories: [AGENT_CATEGORY]
  },
  {
    id: 'sessions',
    label: 'Sessions & persistence',
    purpose: 'What comes back after you quit: the layout, the camera, the selection, and a session you asked to keep.',
    categories: [RESTORE_CATEGORY, SESSION_CATEGORY]
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    purpose: 'Canvas shortcuts always use ⌘ — every bare key belongs to the terminal you\'re typing in.',
    categories: []
  },
  {
    id: 'integrations',
    label: 'Integrations',
    purpose: 'The notes folder on this machine, and how its files are listed. A token is stored from the palette and is never read back.',
    categories: [FILES_CATEGORY]
  },
  {
    id: 'privacy',
    label: 'Privacy & export',
    purpose: 'What may leave this machine. A crash report is off until you turn it on. Exporting your work stays a verb you run yourself.',
    categories: [TELEMETRY_CATEGORY]
  }
]

export function settingsPane(id: SettingsPaneId): SettingsPane {
  const found = SETTINGS_PANES.find((pane) => pane.id === id)
  if (found === undefined) throw new Error(`unknown settings page ${id}`)
  return found
}

export function rowsForPane(id: SettingsPaneId): SettingDef[] {
  const cats = new Set<string>(settingsPane(id).categories)
  return SETTINGS.filter((def) => cats.has(def.category) && def.type !== 'list' && def.id !== 'keyboard.overrides')
}
