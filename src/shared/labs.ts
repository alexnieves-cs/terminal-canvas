/**
 * M496 (E2, the cut list). The surfaces that are off by default, as data.
 *
 * The owner's cut list (docs/streams/cut-list.md) kept 22 surfaces, hid 7 and
 * removed none. A hidden surface keeps every line of its code; what goes is
 * its DOORS for a person: the top-bar button, the chord, the palette row that
 * mints one. One boolean setting each, `labs.<id>`, defaulting to false, turns
 * the doors back on from Settings or the palette.
 *
 * Two rules, both so that hiding can never strand anyone:
 *
 * - **Hide what mints, never what acts on what exists.** A deck already on a
 *   canvas still renders, edits and exports; a Jira panel already there still
 *   offers Connect Jira…. So `deck.edit` and the credential rows stay, and only
 *   `object.create.deck` and `jira.open` go. A row hidden here that a saved
 *   object needs is a dead end, which `verify:palette labs.3` refuses.
 * - **The agent line and the workflow node stay.** `tc plan create-deck` is
 *   typed on purpose by someone who knows the verb; the four-doors rule
 *   (`V9_DOORS`) is about the verb existing, and it still does.
 *
 * Like settings-schema.ts this module imports nothing, so main, the renderer
 * and the plain-node suites all read the same list.
 */

export type LabId = 'world' | 'accounts' | 'relay' | 'decks' | 'sheets' | 'jira' | 'toolbox'

export interface LabDef {
  id: LabId
  /** The persisted key. Declared in settings-schema.ts as a boolean defaulting to false. */
  setting: `labs.${LabId}`
  /** Palette row ids this lab hides, exactly. */
  rows: readonly string[]
  /** Palette row id prefixes this lab hides (rows minted per item, like a team ask). */
  prefixes?: readonly string[]
}

export const LABS: readonly LabDef[] = [
  // The lens, ⌘⇧W, Sessions' Show in World and this row. `#/world` itself
  // still opens the room: a typed address is not a door anyone stumbles on,
  // and `TC_WORLD=1 npm run dev` depends on it.
  { id: 'world', setting: 'labs.world', rows: ['world.view'] },
  // The account menu and the People page go with these rows. A DMG without
  // TC_SUPABASE_URL already answers "accounts are not configured" behind each.
  { id: 'accounts', setting: 'labs.accounts', rows: ['account.sign-in', 'canvas.people', 'share.workspace', 'share.open', 'share.role'] },
  { id: 'relay', setting: 'labs.relay', rows: ['object.create.relay'] },
  { id: 'decks', setting: 'labs.decks', rows: ['object.create.deck'] },
  { id: 'sheets', setting: 'labs.sheets', rows: ['object.create.sheet'] },
  { id: 'jira', setting: 'labs.jira', rows: ['jira.open'] },
  { id: 'toolbox', setting: 'labs.toolbox', rows: ['panel.toolbox', 'panel.memory'] }
]

/** The lab whose doors include this palette row, or undefined for a row no lab hides. */
export function labOfRow(rowId: string): LabId | undefined {
  for (const lab of LABS) {
    if (lab.rows.includes(rowId)) return lab.id
    if (lab.prefixes?.some((prefix) => rowId.startsWith(prefix)) === true) return lab.id
  }
  return undefined
}

/**
 * The labs that are OFF, from resolved setting values. Anything but an explicit
 * `true` is off: the default is false, and a malformed value must not turn a
 * hidden surface back on.
 */
export function labsOff(valueOf: (settingId: string) => unknown): Set<LabId> {
  return new Set(LABS.filter((lab) => valueOf(lab.setting) !== true).map((lab) => lab.id))
}

/** Drop the rows whose lab is off. Order is kept; a row no lab names always stays. */
export function withoutHiddenLabs<T extends { id: string }>(rows: readonly T[], off: ReadonlySet<LabId>): T[] {
  if (off.size === 0) return rows.slice()
  return rows.filter((row) => {
    const lab = labOfRow(row.id)
    return lab === undefined || !off.has(lab)
  })
}
