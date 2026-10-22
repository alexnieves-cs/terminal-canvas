/**
 * M446. The Settings nav, as data.
 *
 * Eight pages, in the order the screen shows them. Keyboard has no schema
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
  LABS_CATEGORY,
  RESTORE_CATEGORY,
  SESSION_CATEGORY,
  SETTINGS,
  SHELL_CATEGORY,
  TELEMETRY_CATEGORY,
  TERMINAL_CATEGORY,
  UPDATES_CATEGORY,
  type SettingDef
} from '@shared/settings-schema'

export type SettingsPaneId = 'general' | 'appearance' | 'terminal' | 'agents' | 'sessions' | 'keyboard' | 'integrations' | 'privacy'

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
    // M496. Labs share General rather than a ninth page: seven switches for
    // surfaces the cut list hid are an arrangement of the window, not a subject.
    purpose: 'How the window is arranged, which hidden surfaces are switched back on, and whether a launch looks for a newer release.',
    categories: [SHELL_CATEGORY, LABS_CATEGORY, UPDATES_CATEGORY]
  },
  {
    id: 'appearance',
    label: 'Appearance',
    purpose: 'Which theme the canvas uses, and whether the opening animation plays.',
    categories: [APPEARANCE_CATEGORY]
  },
  // General used to hold these too, which made it the one page with four
  // unrelated subjects on it. Terminal type and the screen-reader mirror are
  // both about how a terminal is read, so they share a page.
  {
    id: 'terminal',
    label: 'Terminal & accessibility',
    purpose: 'How terminal type is sized, and how a screen reader hears what a terminal prints.',
    categories: [TERMINAL_CATEGORY, ACCESSIBILITY_CATEGORY]
  },
  {
    id: 'agents',
    label: 'Agents',
    purpose: 'How many agents may run, what they may spend, and how the canvas shows what they are doing.',
    categories: [AGENT_CATEGORY]
  },
  {
    id: 'sessions',
    label: 'Persistence',
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
    label: 'Files & notes',
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
