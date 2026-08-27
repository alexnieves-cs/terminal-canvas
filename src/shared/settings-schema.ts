/**
 * Every user-facing toggle in the app, as data.
 *
 * This module imports NOTHING — not electron, not node, not a sibling. That is
 * deliberate and load-bearing: it is what keeps verify:layout in the cheap
 * plain-node tier while covering the schema, and it is what lets main and the
 * renderer both read the same declarations without either owning them.
 *
 * Adding a setting means adding an entry here and nothing else. The palette
 * builds its rows from this list, main/menu.ts builds the Restore submenu from
 * it, and layout-store.ts resolves defaults from it — so a setting that exists
 * here exists everywhere, and one that does not exist here cannot be set.
 */

export type SettingValue = boolean | string | number

/**
 * Named once so the menu's submenu label, the menu's `settingsInCategory`
 * query, and every SettingDef's own `category` field can't drift from one
 * another by a typo — a mismatch here returns [] and renders as a silently
 * empty submenu, with nothing in any log. See CLAUDE.md.
 */
export const RESTORE_CATEGORY = 'Restore on launch'

/** Named once, for the same anti-typo reason RESTORE_CATEGORY is. */
export const AGENT_CATEGORY = 'Agent state'

export interface SettingDef {
  /** Dotted and stable — it is the persisted key, so renaming one loses the
   *  user's choice with no migration. Prefix by area: `restore.`, `agent.`. */
  id: string
  label: string
  /** One line, shown under the label. Says what the setting DOES, not what it is. */
  description: string
  /**
   * Synonyms the fuzzy matcher should see but the row should not show. The
   * whole argument for a searchable settings surface (ideas-backlog #11) is
   * that a user looking for the theme types "dark" — so a setting findable
   * only by its own label is a setting most users will not find.
   */
  keywords: string[]
  /** Tracks what `typeof` can actually answer — see parsePreferences/setPreference. */
  type: 'boolean' | 'number'
  default: SettingValue
  /** Groups rows in the palette and names the menu submenu they came from. */
  category: string
  /**
   * Inclusive bounds for a `number` setting; ignored for booleans.
   *
   * They exist because both ends of the idleness threshold fail SILENTLY: at
   * 0 every pause between tokens reads as "finished" and the border strobes,
   * and at an hour the signal lands long after you have looked. The app keeps
   * working in both cases, which is exactly why the store refuses the value
   * rather than trusting whoever typed it.
   */
  min?: number
  max?: number
}

/**
 * M6b ships with exactly the three settings that already existed as
 * RestoreSettings. That is not a placeholder: ideas-backlog #11 warns against
 * building this schema before three or four toggles exist, and migrating the
 * three real ones is what stops it being an abstraction with no customers.
 * M6c and M6d add theirs.
 */
export const SETTINGS: readonly SettingDef[] = [
  {
    id: 'restore.layout',
    label: 'Restore panel layout',
    description: 'Reopen the panels you had open when the app last quit.',
    keywords: ['panels', 'layout', 'reopen', 'session', 'startup', 'launch'],
    type: 'boolean',
    default: true,
    category: RESTORE_CATEGORY
  },
  {
    id: 'restore.camera',
    label: 'Restore camera position',
    description: 'Return the canvas to the pan and zoom you left it at.',
    keywords: ['camera', 'zoom', 'pan', 'viewport', 'position', 'startup'],
    type: 'boolean',
    default: true,
    category: RESTORE_CATEGORY
  },
  {
    id: 'restore.focus',
    label: 'Restore selection & focus',
    description: 'Reselect the panel that was selected when the app last quit.',
    keywords: ['focus', 'selection', 'selected', 'highlight', 'startup'],
    type: 'boolean',
    default: true,
    category: RESTORE_CATEGORY
  },
  {
    id: 'agent.glow',
    label: 'Show agent state on panels',
    description: 'Colour a panel’s border by what its agent is doing.',
    keywords: ['glow', 'border', 'colour', 'color', 'status', 'busy', 'idle', 'state', 'highlight'],
    type: 'boolean',
    default: true,
    category: AGENT_CATEGORY
  },
  {
    id: 'agent.bell',
    label: 'Detect the terminal bell',
    description:
      'Treat a bell as “this panel wants you”. Your CLI must be set to ring it — Claude Code’s notification channel defaults to auto.',
    keywords: ['bell', 'alert', 'notify', 'notification', 'attention', 'ping', 'sound'],
    type: 'boolean',
    default: true,
    category: AGENT_CATEGORY
  },
  {
    id: 'agent.idleAfterMs',
    label: 'Idle after',
    description: 'Milliseconds of silence before a working panel is called idle.',
    keywords: ['idle', 'timeout', 'threshold', 'delay', 'quiet', 'silence', 'milliseconds'],
    type: 'number',
    // PROVISIONAL — a stand-in, not a measured value. Task 1 measures the
    // within-turn gap distribution against a real `claude` session (p50, p99,
    // shortest turn-boundary gap) and this default is meant to sit above the
    // p99 of within-turn gaps and below the shortest turn boundary worth
    // noticing. That measurement has not been run yet; 1500 is a placeholder
    // so this milestone's settings surface has something to show, and a later
    // task must replace it with the measured number before shipping.
    default: 1500,
    min: 250,
    max: 60000,
    category: AGENT_CATEGORY
  },
  {
    id: 'agent.edgeIndicators',
    label: 'Point at off-screen panels that want you',
    description:
      'Draw an arrow on the edge of the canvas for each panel that wants you but is out of view.',
    keywords: ['edge', 'arrow', 'pip', 'indicator', 'offscreen', 'off-screen', 'attention', 'pointer', 'wants'],
    type: 'boolean',
    default: true,
    category: AGENT_CATEGORY
  }
]

export function settingDef(id: string): SettingDef | undefined {
  return SETTINGS.find((d) => d.id === id)
}

/** Declaration order within a category is menu and palette order. */
export function settingsInCategory(category: string): SettingDef[] {
  return SETTINGS.filter((d) => d.category === category)
}

/**
 * The stored map is SPARSE — it holds only what the user changed — so every
 * read goes through here. A missing entry is not a missing setting; it is a
 * setting still at its default, which is the overwhelmingly common case and
 * the reason the file does not grow a key per toggle per user.
 */
export function resolveSetting(
  persisted: Record<string, SettingValue>,
  id: string
): SettingValue {
  const def = settingDef(id)
  if (def === undefined) return false
  const value = persisted[id]
  return value === undefined ? def.default : value
}
