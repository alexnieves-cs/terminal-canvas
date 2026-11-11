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
import { FULL_SETTING, LABS } from '@shared/labs'

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
    purpose: 'Simple or Full, how the window is arranged, which extra surfaces are switched on, and whether a launch looks for a newer release.',
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

/**
 * M641 (lane W). WINDOW MEMORY IS NOT A CHOICE. These rows record where the
 * person last left the window (which pane, which tab, how wide), and the page
 * showed them as settings with values like `unset` and `detail` that nobody
 * can meaningfully pick from a list. They stay settings (the palette still
 * finds them, a plan may still read them); the page leaves them out.
 */
export const PAGE_HIDDEN: ReadonlySet<string> = new Set([
  'shell.layout.wide', 'shell.layout.narrow', 'shell.inspectorWidth', 'shell.navWidth',
  'shell.centerView', 'shell.contextTab', 'shell.navigator'
])

export function rowsForPane(id: SettingsPaneId): SettingDef[] {
  const cats = new Set<string>(settingsPane(id).categories)
  return SETTINGS.filter((def) => cats.has(def.category) && def.type !== 'list' && def.id !== 'keyboard.overrides' && !PAGE_HIDDEN.has(def.id))
}

/**
 * M641. A page is short sections under plain headings, not one list: Agents
 * was twenty-two rows in schema order, a budget beside a bell. The heading is
 * derived from the row (its category, or its id's prefix inside the two big
 * categories), so a new setting lands in a section without this file changing.
 */
export function sectionOf(def: Pick<SettingDef, 'id' | 'category'>): string {
  if (def.id === FULL_SETTING) return 'Mode'
  if (def.category === SHELL_CATEGORY) return 'Window'
  if (def.category === LABS_CATEGORY) return 'More surfaces'
  if (def.category === UPDATES_CATEGORY) return 'Updates'
  if (def.category === RESTORE_CATEGORY) return 'When the app opens'
  if (def.category === SESSION_CATEGORY) return 'When the app quits'
  if (def.category === AGENT_CATEGORY) {
    if (def.id.startsWith('vm.')) return 'Sandboxed lanes'
    if (/^agents\.(maxConcurrent|budget|nodeCap)/.test(def.id)) return 'Limits and budgets'
    if (/^(learn\.|agents\.team|agents\.turnSnapshots)/.test(def.id)) return 'Teams and lessons'
    return 'Attention'
  }
  if (def.category === TELEMETRY_CATEGORY) return def.id.startsWith('remote.') ? 'Phone alerts and remote clients' : 'Crash reports'
  return def.category
}

export interface PaneSection<T> { title: string; rows: T[] }

/**
 * The page's rows in sections, in order of first appearance with Mode first.
 * In Simple the `full` labs' own switches are left out: each only has an
 * effect in Full, and a row that reads On while its surface is hidden is a lie.
 */
export function sectionsFor<T extends Pick<SettingDef, 'id' | 'category'>>(rows: readonly T[], full: boolean): PaneSection<T>[] {
  const fullOnly = new Set<string>(LABS.filter((lab) => lab.full === true).map((lab) => lab.setting))
  const out: PaneSection<T>[] = []
  for (const row of rows) {
    if (!full && fullOnly.has(row.id)) continue
    const title = sectionOf(row)
    const section = out.find((s) => s.title === title)
    if (section === undefined) out.push({ title, rows: [row] })
    else section.rows.push(row)
  }
  const mode = out.findIndex((s) => s.title === 'Mode')
  if (mode > 0) out.unshift(...out.splice(mode, 1))
  return out
}
