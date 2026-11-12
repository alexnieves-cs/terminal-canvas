/**
 * M496 (E2, the cut list). The surfaces that are off by default, as data.
 *
 * The owner's cut list (docs/streams/cut-list.md) kept 22 surfaces, hid 7 and
 * removed none. A hidden surface keeps every line of its code; what goes is
 * its DOORS for a person: the top-bar button, the chord, the palette row that
 * mints one. One boolean setting each, `labs.<id>`, defaulting to false, turns
 * the doors back on from Settings or the palette. World was kept (it is the one
 * lab shown by default), so its setting is the switch that hides it.
 *
 * Two rules, both so that hiding can never strand anyone:
 *
 * - **Hide what mints, never what acts on what exists.** A deck already on a
 *   canvas still renders, edits and exports. So `deck.edit` stays, and only
 *   `object.create.deck` goes. A row hidden here that a saved
 *   object needs is a dead end, which `verify:palette labs.3` refuses.
 * - **The agent line and the workflow node stay.** `tc plan create-deck` is
 *   typed on purpose by someone who knows the verb; the four-doors rule
 *   (`V9_DOORS`) is about the verb existing, and it still does.
 *
 * Like settings-schema.ts this module imports nothing, so main, the renderer
 * and the plain-node suites all read the same list.
 */

export type LabId = 'world' | 'accounts' | 'relay' | 'decks' | 'toolbox' | 'tournament' | 'flowcharts' | 'film' | 'fork'

/**
 * M642 (lane W). SIMPLE AND FULL. One boolean, off by default, that the
 * `full` labs below also need. Simple is the product a new person meets: the
 * canvas, agents, terminals, attention, review, tasks and overnight. Full adds
 * the surfaces that are impressive in a demo and a lot to take in on day one
 * (the 3D World, tournaments, flowchart shapes, the night film). The same two
 * rules hold: only the doors that MINT go, and nothing already on a canvas is
 * stranded. A `full` lab keeps its own `labs.<id>` switch (on by default), so
 * someone in Full can still put one of them away.
 *
 * Not a lab itself: it has no rows of its own, so `LABS` does not list it and
 * `verify:palette labs.1` exempts it by this name.
 */
export const FULL_SETTING = 'labs.full'

export interface LabDef {
  id: LabId
  /** The persisted key. Declared in settings-schema.ts as a boolean whose default is `shown`. */
  setting: `labs.${LabId}`
  /**
   * Whether the doors show before anyone touches the switch. False for the
   * cut list's hidden surfaces; true for one the owner kept but can still
   * switch off. settings-schema.ts declares the same default (`labs.1`).
   */
  shown: boolean
  /** M642. True for a surface Simple hides: its doors also need `FULL_SETTING` on. */
  full?: true
  /** Palette row ids this lab hides, exactly. */
  rows: readonly string[]
  /** Palette row id prefixes this lab hides (rows minted per item, like a team ask). */
  prefixes?: readonly string[]
}

export const LABS: readonly LabDef[] = [
  // The lens, ⌘⇧W, Sessions' Show in World and this row. `#/world` itself
  // still opens the room: a typed address is not a door anyone stumbles on,
  // and `TC_WORLD=1 npm run dev` depends on it. SHOWN by default: the owner
  // had just approved the World scenes' goldens, and hiding the lens moved
  // 35 of them, so World stays on and this is the switch that turns it off.
  // M642. A `full` lab since Simple became the default: still on by its own
  // switch, and shown once Full is on. The harnesses run Full (TC_FULL), so
  // the World scenes' goldens show what they always did.
  { id: 'world', setting: 'labs.world', shown: true, full: true, rows: ['world.view'] },
  // The account menu and the People page go with these rows. A DMG without
  // TC_SUPABASE_URL already answers "accounts are not configured" behind each.
  { id: 'accounts', setting: 'labs.accounts', shown: false, rows: ['account.sign-in', 'canvas.people', 'share.workspace', 'share.open', 'share.role'] },
  { id: 'relay', setting: 'labs.relay', shown: false, rows: ['object.create.relay'] },
  { id: 'decks', setting: 'labs.decks', shown: false, rows: ['object.create.deck'] },
  { id: 'toolbox', setting: 'labs.toolbox', shown: false, rows: ['panel.toolbox', 'panel.memory'] },
  // M642. The other three surfaces Simple hides. Only what STARTS one: a
  // tournament already running keeps its stop, pick, judge and combine rows,
  // a shape already drawn keeps its label, style, layout and export rows, and
  // the morning card keeps its own film button on the night it has one.
  { id: 'tournament', setting: 'labs.tournament', shown: true, full: true, rows: ['task.tournament', 'task.tournament-field'] },
  { id: 'flowcharts', setting: 'labs.flowcharts', shown: true, full: true, rows: ['flowchart.import'], prefixes: ['shape.add.'] },
  { id: 'film', setting: 'labs.film', shown: true, full: true, rows: ['film.last-night'] },
  // M682. Fork from a turn resumes the agent in a new worktree, and that resume
  // still owes its hand check on a real Mac (lane K). Until it has one, a new
  // person does not meet it: the chat's "fork from here" is its only door
  // outside Replay, and Replay's Branch already needs per-turn snapshots on.
  // No palette row mints a fork, so the lab hides no rows, only that button.
  { id: 'fork', setting: 'labs.fork', shown: true, full: true, rows: [] }
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
 * The labs that are OFF, from resolved setting values. An absent value is the
 * lab's own default; any other non-boolean is OFF, so a malformed value never
 * turns a hidden surface back on.
 */
export function labsOff(valueOf: (settingId: string) => unknown): Set<LabId> {
  // M642. Absent or malformed is Simple, for the same reason as below.
  const full = valueOf(FULL_SETTING) === true
  return new Set(LABS.filter((lab) => {
    if (lab.full === true && !full) return true
    const value = valueOf(lab.setting)
    return value === undefined ? !lab.shown : value !== true
  }).map((lab) => lab.id))
}

/** M642. Whether the product is in Full, from resolved setting values. */
export function isFullMode(valueOf: (settingId: string) => unknown): boolean {
  return valueOf(FULL_SETTING) === true
}

/** Drop the rows whose lab is off. Order is kept; a row no lab names always stays. */
export function withoutHiddenLabs<T extends { id: string }>(rows: readonly T[], off: ReadonlySet<LabId>): T[] {
  if (off.size === 0) return rows.slice()
  return rows.filter((row) => {
    const lab = labOfRow(row.id)
    return lab === undefined || !off.has(lab)
  })
}
