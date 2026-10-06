import type { StateInput } from '@renderer/panels/panel-state'
import { fuzzyMatch, initialsStart, wordStarts } from './fuzzy'

/**
 * The palette's list model: what a row is, which section it lives in, how a
 * query narrows the list, and how the selection moves. Pure — the React layer
 * in Palette.tsx owns no decision this file can make.
 */

export type SectionId =
  | 'task'
  | 'panel'
  | 'spawn'
  | 'prompt'
  | 'workspace'
  | 'bookmark'
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
  // M400 (B1). FIRST, and holding only rows PROMOTED by their `leads`
  // (`filterCommands`): "New task" sat thirteenth for "new task", under
  // Panels' "Open … as a workflow". No row is declared in it, so the resting
  // list and any query no lead answers are unchanged — a declared row here
  // would lead every query its long searchText happens to contain as a
  // subsequence ("auth" did, measured by `verify:palette` 33).
  { id: 'task', label: 'Tasks' },
  { id: 'panel', label: 'Panels' },
  { id: 'spawn', label: 'New panel' },
  { id: 'prompt', label: 'Prompts' },
  { id: 'workspace', label: 'Workspaces' },
  // M56. Between Workspaces and Canvas: a bookmark is a place, like a
  // workspace, and narrower than the canvas verbs below it.
  { id: 'bookmark', label: 'Bookmarks' },
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
  /** M37. Every worktree this app created: remove and reveal. */
  | 'worktrees'
  | 'credentials'
  | 'agent-mode'
  /** M42. Search across every panel's durable log; the query box IS the term. */
  | 'search'
  /** M365. Which agents can do X: the query box IS the capability name, answered by each panel's toolbox. */
  | 'capability'
  /** M48. The environment report: what main found at startup, one row per fact. */
  | 'environment'

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
   * M64. A path, matched ONLY as a contiguous substring — never through the
   * fuzzy subsequence matcher, which lights scattered letters across
   * /private/var/folders for any five-letter query.
   */
  pathText?: string
  /** M64. The Go-to row's state word and its `state:` order (needs-you first). */
  stateWord?: string
  statePriority?: number
  /** M64. The panel whose state the row renders LIVE, in its tone. */
  state?: { id: string; input: StateInput }
  /** M64. Title and hint in the mono face: the row names a thing the machine knows. */
  mono?: true
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
  /**
   * M400. Words this row is THE answer to: a query that is a prefix of one
   * (`new`, `task`, `sta`) ranks it above every fuzzy match. A prefix, never
   * a subsequence — a long searchText matches half the alphabet as a
   * subsequence, and a bonus on that would pull the row over `restart`.
   */
  leads?: readonly string[]
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
  // M64. A row that carries a path keeps its subtitle OUT of the fuzzy
  // haystack: the subtitle is the state word and the shortened path, and a
  // path in the subsequence matcher is exactly what pathText exists to stop.
  if (c.subtitle && c.pathText === undefined) s += ` ${c.subtitle}`
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
  // M64. `state:<word>` — the who-needs-me list. Only Go-to rows (the ones
  // carrying a state word) survive, filtered by the word and ordered by
  // state priority rather than by score, so `state:` alone lists every
  // panel needs-you first.
  const stateQuery = parseStateQuery(query)
  if (stateQuery !== null && scope === null) {
    return commands
      .map((command, order) => ({ command, order }))
      .filter(({ command }) => command.stateWord !== undefined && command.stateWord.includes(stateQuery))
      .sort((a, b) => ((a.command.statePriority ?? 99) - (b.command.statePriority ?? 99)) || (a.order - b.order))
      .map((s) => s.command)
  }
  const scored: Array<{ command: Command; score: number; order: number; weak: boolean }> = []
  commands.forEach((command, order) => {
    if (scope !== null ? command.scope !== scope : resting && command.hiddenAtRest) return
    const match = matchCommand(query, command)
    // M400. A row the query LEADS to is shown in the first section, Tasks —
    // a copy, so the row keeps its own section everywhere else and the
    // headers stay one-per-section (check 30, `verify:panels:core` 48).
    if (match !== null) scored.push({ command: scope === null && leadsQuery(query, command) ? { ...command, group: 'task' } : command, score: match, order, weak: isWeakMatch(query, command) })
  })
  // M409 (C5). At most WEAK_CAP rows that only a scattered subsequence found,
  // the best of them. Top level only: inside a scope (search, capability) the
  // query is a TERM the rows were computed for, not a filter over them.
  const kept = scope === null ? keepBestWeak(scored) : scored
  kept.sort((a, b) =>
    (sectionIndex(a.command.group) - sectionIndex(b.command.group)) ||
    (b.score - a.score) ||
    (a.order - b.order))
  return kept.map((s) => s.command)
}

/**
 * M409 (C5). How many rows a subsequence-only match may add. "add a" matched
 * 174 of 184 rows and "undo" 123, because any row holding those letters in
 * order anywhere in a long searchText qualified. Five keeps a typo or an
 * abbreviation findable without burying the rows the words actually name.
 */
export const WEAK_CAP = 5

function keepBestWeak<T extends { score: number; order: number; weak: boolean }>(scored: T[]): T[] {
  const weak = scored.filter((s) => s.weak)
  if (weak.length <= WEAK_CAP) return scored
  const best = new Set([...weak].sort((a, b) => (b.score - a.score) || (a.order - b.order)).slice(0, WEAK_CAP))
  return scored.filter((s) => !s.weak || best.has(s))
}

/** `state:needs` → `needs`; `state:` → ``; anything else → null. */
export function parseStateQuery(query: string): string | null {
  const m = /^state:\s*(.*)$/i.exec(query.trim())
  return m === null ? null : m[1].trim().toLowerCase()
}

/** A low, fixed score for a contiguous path hit: below any title match, above nothing. */
const PATH_SCORE = 1

/**
 * The fuzzy match over the haystack, and — only when that fails — a
 * contiguous, case-insensitive substring match over `pathText`.
 */
/**
 * M66. A match the user can SEE — in the title, where the highlight paints —
 * outranks one carried only by hidden searchText at the scores short queries
 * reach (a six-letter run contiguous in searchText still scores past it — the
 * bonus is a thumb on the scale, not a section): a row that leads a list with
 * nothing lit in it looks like a mistake.
 */
const VISIBLE_BONUS = 40
/**
 * M400. Above any score a short query reaches without leading: a word run is
 * ~50, plus VISIBLE_BONUS, plus M409's best tier (TITLE_WORDS). Raised from
 * 200 when the tiers landed, so a rival whose title a lead's query starts
 * ("Preview: start the dev server" for "start") cannot catch the lead.
 */
const LEAD_BONUS = 400

/**
 * M409 (C5). The match tiers, above the fuzzy score and below LEAD_BONUS. A
 * query whose words START words of the title is what a person meant; one
 * that starts the title's initials ("np") nearly so; one whose words start
 * words of the hidden searchText or subtitle is a real answer but less sure.
 * Anything else was found by a scattered subsequence — WEAK, and capped.
 */
const TITLE_WORDS = 150
const INITIALS = 100
const HAYSTACK_WORDS = 80

function tierBonus(query: string, command: Command): number {
  if (query.trim() === '') return 0
  if (wordStarts(query, command.title)) return TITLE_WORDS
  if (initialsStart(query, command.title)) return INITIALS
  if (wordStarts(query, haystack(command))) return HAYSTACK_WORDS
  return 0
}

/**
 * M409. Found only by a scattered subsequence of the HIDDEN text: no tier, no
 * lead, not a path hit, and not a subsequence of the title. The M409 critic:
 * a title subsequence is an abbreviation a person typed on purpose ("rnme" for
 * Rename, "gh" for GitHub) — the letters light up in the row they meant — so
 * it is never capped; only scatter across searchText/subtitle, which paints
 * nothing and was where "undo" found 123 rows, is.
 */
export function isWeakMatch(query: string, command: Command): boolean {
  if (query.trim() === '' || tierBonus(query, command) > 0 || leadsQuery(query, command)) return false
  if (fuzzyMatch(query, command.title) !== null) return false
  return fuzzyMatch(query, haystack(command)) !== null
}

/**
 * M400. Is the query a prefix of one of the row's `leads`? Case- and outer-space-insensitive.
 * M403. At least three characters, unless the query IS a whole lead: "n", "t", "s", "st" and
 * "ne" are the first keystrokes of Split, Terminal and Settings too, and a one-letter prefix
 * promoted New task… over every one of them (the M400 critic).
 */
export const LEAD_MIN = 3
export function leadsQuery(query: string, command: Command): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (q === '') return false
  const leads = (command.leads ?? []).map((lead) => lead.toLowerCase())
  return leads.includes(q) || (q.length >= LEAD_MIN && leads.some((lead) => lead.startsWith(q)))
}

export function matchCommand(query: string, command: Command): number | null {
  const fuzzy = fuzzyMatch(query, haystack(command))
  if (fuzzy !== null) return fuzzy.score + (query.trim() !== '' && fuzzyMatch(query, command.title) !== null ? VISIBLE_BONUS : 0) + tierBonus(query, command) + (leadsQuery(query, command) ? LEAD_BONUS : 0)
  const q = query.trim().toLowerCase()
  if (command.pathText !== undefined && q !== '' && command.pathText.toLowerCase().includes(q)) return PATH_SCORE
  return null
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
    const score = matchCommand(query, command)
    if (score !== null && score > bestScore) {
      bestScore = score
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
 * M399 (A6). THE ORDER A PERSON IS ARROWING THROUGH DOES NOT MOVE.
 *
 * `rows` is re-ranked whenever its commands rebuild, and they rebuild on
 * things nobody typed: a panel's state word (part of a row's haystack) turning
 * from `working` to `idle`, a list arriving, a row going runnable. During the
 * critique the list re-sorted under the keyboard and Enter started a `claude`
 * the tester never chose. So once a person navigates, the view holds the
 * order it showed (`order`, the row ids as they were) until the query or the
 * scope changes:
 *   - rows still present keep their held position, with their NEW content
 *     (a changed title or disabled reason is still shown — only the order is
 *     held);
 *   - rows that left are gone;
 *   - rows that arrived go after the last held row of their own section (or
 *     at the end), so a section is never split into two headers; nothing
 *     above them moves, and the selection stays on its row by id
 *     (seatSelection).
 * Pure, so the cheapest tier tests it (verify:palette palette.hold.1).
 */
/**
 * M399 (A6). WHICH ROW IS SELECTED after `rows` changed, as a row ID — the
 * palette's selection is a row, never a slot. Palette.tsx's seat effect, lifted
 * out whole so the cheapest tier can hold it to its rules:
 *   - a query or scope change RE-SEATS: popping out of a scope lands on its
 *     door, anything else on the best runnable match;
 *   - any other change (a list arriving, a re-rank under the keyboard, a row
 *     turning unrunnable) FOLLOWS THE ROW by id wherever it moved, and falls
 *     back to the best match only when that row is gone or cannot run.
 * `leaving` is the scope the palette was in before this change.
 */
export function seatSelection(p: {
  rows: Command[]
  query: string
  scope: PaletteScope | null
  leaving: PaletteScope | null
  reseat: boolean
  current: string | null
}): string | null {
  const idAt = (i: number): string | null => (i >= 0 ? p.rows[i]?.id ?? null : null)
  if (p.reseat) {
    if (p.leaving !== null && p.scope === null) {
      const door = doorIndex(p.rows, p.leaving)
      if (door >= 0) return idAt(door)
    }
    return idAt(bestMatchIndex(p.rows, p.query))
  }
  const at = p.current === null ? -1 : p.rows.findIndex((r) => r.id === p.current)
  if (at >= 0 && p.rows[at].disabledReason === undefined) return p.current
  // M403 (the M399 critic). The held row is still there but can no longer
  // run: the selection moves to its NEAREST runnable neighbour (below first on
  // a tie), not to the best match, which could be a screen away from where
  // the person was looking.
  if (at >= 0) {
    for (let d = 1; d < p.rows.length; d += 1) {
      if (runnable(p.rows[at + d])) return idAt(at + d)
      if (runnable(p.rows[at - d])) return idAt(at - d)
    }
    return null
  }
  return idAt(bestMatchIndex(p.rows, p.query))
}

export function holdOrder(rows: Command[], order: readonly string[]): Command[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const held = new Set(order)
  const out: Command[] = order.flatMap((id) => { const r = byId.get(id); return r === undefined ? [] : [r] })
  for (const r of rows) {
    if (held.has(r.id)) continue
    let at = -1
    for (let i = out.length - 1; i >= 0; i -= 1) if (out[i].group === r.group) { at = i; break }
    if (at < 0) out.push(r)
    else out.splice(at + 1, 0, r)
  }
  return out
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

/**
 * M444. A visual band over the sections `SECTIONS` already orders.
 * Files are path rows, which stay in Panels so that section header stays
 * unique (verify:panels 48). The chip is how they are read as a group.
 * Commands are the canvas, settings, credential and manage sections.
 * Everything else is panels and tasks.
 */
export type PaletteKind = 'everything' | 'panels' | 'commands' | 'files'
export type CommandBand = 'panels' | 'commands' | 'files'

const COMMAND_GROUPS: ReadonlySet<string> = new Set(['canvas', 'setting', 'credential', 'manage'])

export function cyclePaletteKind(kind: PaletteKind): PaletteKind {
  if (kind === 'everything') return 'panels'
  if (kind === 'panels') return 'commands'
  if (kind === 'commands') return 'files'
  return 'everything'
}

export function kindChipLabel(kind: PaletteKind): string {
  if (kind === 'panels') return 'Panels & tasks'
  if (kind === 'commands') return 'Commands'
  if (kind === 'files') return 'Files'
  return 'Everything'
}

export function commandBand(row: { group: string; pathText?: string }): CommandBand {
  if (row.pathText !== undefined && row.pathText !== '') return 'files'
  if (COMMAND_GROUPS.has(row.group)) return 'commands'
  return 'panels'
}

export function filterByKind<T extends { group: string; pathText?: string }>(rows: readonly T[], kind: PaletteKind): T[] {
  if (kind === 'everything') return [...rows]
  return rows.filter((row) => commandBand(row) === kind)
}

/**
 * A band header at this index, or null when the previous row is the same
 * band. Files never open a header while Everything is showing: a path row
 * between two panels must not restart "Panels & tasks", and it must not
 * invent a third section header the panels check would count.
 */
export function bandHeaderAt(
  rows: readonly { group: string; pathText?: string }[],
  index: number,
  kind: PaletteKind
): string | null {
  if (kind !== 'everything') return index === 0 ? kindChipLabel(kind) : null
  const band = commandBand(rows[index])
  if (band === 'files') return null
  const prev = index === 0 ? null : commandBand(rows[index - 1])
  if (band === 'panels') return prev === null || prev === 'commands' ? 'Panels & tasks' : null
  return prev === 'commands' ? null : 'Commands'
}

/** The panel id behind `panel.goto.<id>`, or null for every other row. */
export function panelIdOfGoto(row: { id: string }): string | null {
  const prefix = 'panel.goto.'
  if (!row.id.startsWith(prefix)) return null
  const id = row.id.slice(prefix.length)
  return id === '' ? null : id
}
