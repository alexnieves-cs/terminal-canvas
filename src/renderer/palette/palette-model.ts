import { fuzzyMatch } from './fuzzy'

/**
 * The palette's list model: what a row is, which section it lives in, how a
 * query narrows the list, and how the selection moves. Pure — the React layer
 * in Palette.tsx owns no decision this file can make.
 */

export type SectionId =
  | 'panel'
  | 'spawn'
  | 'prompt'
  | 'workspace'
  | 'canvas'
  | 'setting'
  | 'credential'
  | 'manage'

export interface SectionDef {
  id: SectionId
  /** The header text. Rendered once above the section's first row. */
  label: string
}

/**
 * Array order IS display order and IS the primary sort key.
 *
 * Deliberately data rather than the closed `CommandGroup` union this replaced.
 * That union hardcoded its order in two places — the type and verify:palette's
 * check 30 — which is why M6b's plan has to carry a whole written section
 * explaining that adding one section means editing both together. Appending an
 * object literal here is the entire operation instead.
 *
 * `manage` is last because everything in it is an errand: the rows a person
 * runs are worth more vertical space than the rows they administer.
 */
export const SECTIONS: readonly SectionDef[] = [
  { id: 'panel', label: 'Panels' },
  { id: 'spawn', label: 'New panel' },
  { id: 'prompt', label: 'Prompts' },
  { id: 'workspace', label: 'Workspaces' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'setting', label: 'Settings' },
  { id: 'credential', label: 'Credentials' },
  { id: 'manage', label: 'Manage' }
]

/**
 * Which drill-in a row belongs to. `null` is the top level, and is a value the
 * view holds rather than a value a Command carries — a Command names the ONE
 * scope it appears in, or names none and appears only at the top level.
 */
export type PaletteScope =
  | 'presets'
  | 'prompts'
  | 'settings'
  | 'workspaces'
  | 'credentials'
  | 'agent-mode'

/** Unknown ids sink to the bottom rather than throwing: a row in a section
 *  that no longer exists is a display bug, not a reason to blank the palette. */
export function sectionIndex(id: SectionId): number {
  const i = SECTIONS.findIndex((s) => s.id === id)
  return i === -1 ? SECTIONS.length : i
}

export interface Command {
  id: string
  title: string
  /** Second line / right column: a cwd, a preset's command, a prompt's source. */
  subtitle?: string
  /**
   * Searchable, never rendered. This is what makes a retitle safe: a spawn row
   * reads "Claude" under a NEW PANEL header, and the words the header now
   * supplies live here so that typing "new panel" still finds it. Without it a
   * retitle silently deletes a search term people already use — the row is
   * still present and simply stops being reachable the way they reach it.
   */
  searchText?: string
  /**
   * A transient count the VIEW composes into what it renders — never baked
   * into `title`. A workspace's waiting count is the case today: it changes
   * as agents finish, and `title` feeds `haystack()` unconditionally, so a
   * count folded into `title` would make the row findable by typing a digit,
   * with its match score moving under the user for a reason nothing on
   * screen explains. Kept as a plain number, not text, so nothing here can
   * accidentally reintroduce it into the matcher. Present only when > 0,
   * matching how the rest of this file treats its other optional flags.
   */
  waiting?: number
  group: SectionId
  /** Rendered as a <kbd> chip. Only set where a shortcut genuinely exists. */
  shortcut?: string
  /** Present means this row destroys something: red, and gated by a confirm. */
  destructive?: true
  /**
   * Present means: absent from the RESTING list (empty query, no scope), and
   * present the moment the user types or drills in.
   *
   * Two rules, and shipping only the first one is the failure mode. Clearing
   * administration errands out of a seventeen-row resting list is the point;
   * clearing them out of SEARCH would quietly delete four commands from the
   * app. The rule check 31 states in its own comment holds here too — a row
   * that disappears is indistinguishable from a feature that is missing — so
   * every hidden row is one keystroke from coming back, and the two
   * always-visible `manage.*` rows are the door for anyone not guessing.
   */
  hiddenAtRest?: true
  /** The drill-in this row belongs to, if any. See PaletteScope. */
  scope?: PaletteScope
  /**
   * Present means running this row ENTERS that drill-in rather than doing
   * anything. Declarative rather than a callback on purpose: the view closes
   * the palette BEFORE calling run() — a command may focus a panel or open a
   * dialog, and restoring focus afterwards would steal it straight back — so a
   * drill-in that announced itself by calling back during run() could only be
   * noticed after the overlay was already gone. A field can be read first.
   */
  entersScope?: PaletteScope
  /**
   * Present means unrunnable, and says WHY. The same rule menuLabel() states
   * for the preset submenu: a greyed-out row with no reason is a bug report.
   */
  disabledReason?: string
  run(): void
}

/**
 * What a query is matched against — and the field ORDER here is load-bearing,
 * because fuzzyMatch is a single ordered subsequence over one concatenated
 * string. Whatever comes first can only ever be typed first.
 *
 * searchText leads for that reason. It holds the generic words a section
 * header now supplies ("new panel from"), and people type the generic verb
 * before the specific noun — "new panel from claude", never "claude new
 * panel". With the title first, that whole phrase stops matching: the matcher
 * consumes "new panel from" out of the trailing searchText and then has to
 * find "claude" AFTER it, which is not there. The row stays in the list and
 * silently stops answering the query it exists to answer, which is precisely
 * the regression searchText was added to prevent.
 *
 * The cost is a few points of fuzzy.ts's earliness bonus on the title, since
 * the title no longer starts at index 0. That only reorders rows within a
 * section — sections themselves are sorted first — and is worth a phrase that
 * works.
 */
export const haystack = (c: Command): string => {
  let s = c.searchText ? `${c.searchText} ${c.title}` : c.title
  if (c.subtitle) s += ` ${c.subtitle}`
  return s
}

/**
 * Narrow by query and scope, then order for DISPLAY: section first, then
 * score, then construction order.
 *
 * Section-first is the M6p fix, and the defect it replaces is worth stating.
 * The old comparator was `(b.score - a.score) || (a.order - b.order)`, and
 * commands.ts's header comment called construction order "the grouping" on the
 * strength of that stable tiebreak — but score won OUTRIGHT, so the grouping
 * only ever survived the EMPTY query. One keystroke interleaved the groups, and
 * "Delete preset Claude" could sit directly above "New panel from Claude" with
 * nothing but a repeated uppercase chip to tell them apart. Sorting by section
 * first is what lets the headers be true while the user types, and is what
 * makes a destructive row structurally incapable of leapfrogging its benign
 * sibling. Score still decides INSIDE a section, or the ranker is dead.
 *
 * Because that alone would point the selection at the first row of the first
 * section rather than at what the user was typing towards, the view seeds from
 * bestMatchIndex() below rather than from position 0.
 *
 * Disabled rows are kept. They exist to explain themselves.
 */
export function filterCommands(
  commands: Command[],
  query: string,
  scope: PaletteScope | null = null
): Command[] {
  // The resting list is the top level with nothing typed — the only state in
  // which hiddenAtRest applies. Inside a scope the whole point is to SEE the
  // administration rows, so they are shown there with an empty query too.
  const resting = query === '' && scope === null
  const scored: Array<{ command: Command; score: number; order: number }> = []
  commands.forEach((command, order) => {
    if (scope !== null ? command.scope !== scope : resting && command.hiddenAtRest) return
    const match = fuzzyMatch(query, haystack(command))
    if (match) scored.push({ command, score: match.score, order })
  })
  scored.sort((a, b) =>
    (sectionIndex(a.command.group) - sectionIndex(b.command.group)) ||
    (b.score - a.score) ||
    (a.order - b.order))
  return scored.map((s) => s.command)
}

const runnable = (c: Command | undefined): boolean => c !== undefined && c.disabledReason === undefined

/** The row Enter would run on a fresh list, or -1 when there is no such row. */
export function firstRunnable(commands: Command[]): number {
  const index = commands.findIndex((c) => runnable(c))
  return index
}

/**
 * The best-scoring RUNNABLE row, ignoring sections entirely — what the
 * selection seeds to, so Enter still lands on what the user was typing towards
 * even though the list is ordered by section.
 *
 * Runnable is the half that matters: a "best match" parked on a disabled row
 * makes Enter do nothing at all, and a silent no-op reads as a broken palette
 * rather than as a refused command.
 *
 * Strict `>` so ties go to the earliest row, which under filterCommands' order
 * means the earliest section. For an empty query every score is 0, so this
 * degenerates to exactly firstRunnable — which is why the view can seed from
 * this one function in both states rather than branching on the query.
 */
export function bestMatchIndex(commands: Command[], query: string): number {
  let best = -1
  let bestScore = -Infinity
  commands.forEach((command, i) => {
    if (!runnable(command)) return
    const match = fuzzyMatch(query, haystack(command))
    if (match && match.score > bestScore) {
      bestScore = match.score
      best = i
    }
  })
  return best
}

/**
 * The row that leads INTO `scope`, or -1 — which is where the selection has to
 * land when the user pops back OUT of that scope.
 *
 * Popping used to re-seed from bestMatchIndex, and a pop leaves an EMPTY query
 * behind (runRow clears it on the way in), so every score ties at 0 and that
 * degenerates to firstRunnable: the top of the Panels section. The user walked
 * through a door, came back out somewhere else entirely, and Enter was then
 * pointed at a command they never chose — the silent-selection-move class this
 * file's callers already guard three other doors against.
 *
 * The anchor is `entersScope` rather than a remembered row id, which buys two
 * things a ref cannot. It is a pure lookup over rows the caller already holds,
 * so it is testable in the cheapest tier the repo has; and it answers the case
 * where no door was ever traversed at all — M8a's top-bar gear opens the
 * palette straight into the settings scope, and popping from there lands on
 * Manage settings… by the same one rule rather than by a second one.
 *
 * `disabledReason === undefined` is load-bearing, not symmetry with the rest of
 * this file. Entering a scope needs a runnable door, but prompt:list re-fires
 * while the palette is open (Canvas.tsx's reloadPrompts tracks capturedId), so
 * the prompts door can go disabled UNDER a user already inside its scope.
 * Seeding the selection there on the way out makes Enter a dead key — exactly
 * what bestMatchIndex above refuses to do, and for the same reason.
 *
 * `scope` is deliberately NOT nullable. An absent `entersScope` is `undefined`,
 * so `r.entersScope === null` is never true: a nullable parameter would return
 * -1 for every null caller, silently and with nothing for the compiler to say.
 * Callers narrow instead.
 */
export function doorIndex(rows: Command[], scope: PaletteScope): number {
  return rows.findIndex((r) => r.entersScope === scope && r.disabledReason === undefined)
}

/**
 * The next runnable row in `delta`'s direction, wrapping.
 *
 * Returns -1 when nothing is runnable, which the view must tell apart from
 * "row 0": returning 0 there would let Enter run a disabled command. `from`
 * may be out of range — the list shrinks under the selection on every
 * keystroke — and is normalised rather than trusted.
 *
 * Untouched by M6p: it walks the flat array, and the flat array is now in
 * display order, so ArrowDown reads visually downward across section headers
 * without this function knowing sections exist.
 */
export function stepRunnable(commands: Command[], from: number, delta: 1 | -1): number {
  const n = commands.length
  if (n === 0) return -1
  const start = from >= 0 && from < n ? from : delta === 1 ? -1 : 0
  for (let step = 1; step <= n; step += 1) {
    const index = (((start + delta * step) % n) + n) % n
    if (runnable(commands[index])) return index
  }
  return -1
}

export interface HighlightSegment {
  text: string
  /** True when these characters are the ones the query matched. */
  hit: boolean
}

/**
 * Split a title into matched and unmatched runs, so the view can finally spend
 * what fuzzy.ts has been computing and discarding on every keystroke since M5b
 * — its own comment says positions are "indices into the ORIGINAL target, so
 * the view can highlight them", and no view ever did.
 *
 * Matched against the TITLE alone, not against haystack(): the subtitle and
 * searchText are scored for ranking but a row matched only through them shows
 * no highlight, which is honest — there is nothing in the title to point at.
 *
 * Adjacent hits MERGE into one segment. A span per character renders correctly
 * and then breaks sub-pixel letter-spacing and kerning across the whole title,
 * which looks like a font bug rather than like a highlight.
 */
export function splitHighlight(text: string, query: string): HighlightSegment[] {
  const match = fuzzyMatch(query, text)
  if (!match || match.positions.length === 0) return [{ text, hit: false }]
  const hits = new Set(match.positions)
  const out: HighlightSegment[] = []
  for (let i = 0; i < text.length; i += 1) {
    const hit = hits.has(i)
    const last = out[out.length - 1]
    if (last && last.hit === hit) last.text += text[i]
    else out.push({ text: text[i], hit })
  }
  return out
}
