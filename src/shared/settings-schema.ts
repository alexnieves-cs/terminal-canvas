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
  type: 'boolean' | 'enum' | 'number'
  default: SettingValue
  /** Groups rows in the palette and names the menu submenu they came from. */
  category: string
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
    category: 'Restore on launch'
  },
  {
    id: 'restore.camera',
    label: 'Restore camera position',
    description: 'Return the canvas to the pan and zoom you left it at.',
    keywords: ['camera', 'zoom', 'pan', 'viewport', 'position', 'startup'],
    type: 'boolean',
    default: true,
    category: 'Restore on launch'
  },
  {
    id: 'restore.focus',
    label: 'Restore selection & focus',
    description: 'Reselect the panel that was selected when the app last quit.',
    keywords: ['focus', 'selection', 'selected', 'highlight', 'startup'],
    type: 'boolean',
    default: true,
    category: 'Restore on launch'
  }
]

export function settingDef(id: string): SettingDef | undefined {
  return SETTINGS.find((d) => d.id === id)
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
