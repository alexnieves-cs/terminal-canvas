import { fuzzyMatch } from '@renderer/palette/fuzzy'
import {
  placement,
  skillKey,
  parseSkillKey,
  UNGROUPED_COLUMN_ID,
  pluginPrefixOf,
  type PlacementWhy,
  type Shelf,
  type SkillKey
} from '@shared/skills'
import type { NamedToolEntry, SkillResources, ToolActive, ToolEntry, ToolScope } from '@shared/toolbox'

/**
 * M127. The Skills pane's whole model: an inventory plus the shelf plus the
 * three filters, in; columns of cards, out.
 *
 * Pure by construction, and it joins `rail-entry.cjs` for the reason every
 * view model since M8c has — the component owns the tabs, the search box and
 * the drag handlers, and NOTHING that decides where a card sits.
 *
 * The matcher is `palette/fuzzy.ts`'s, imported unchanged. A second matcher
 * would differ from the palette's exactly in the cases nobody tests, which is
 * this repo's standing reason for never writing one.
 */

/** The three kinds that have a name and a sentence; the tabs are these. */
export type SkillPaneKind = NamedToolEntry['kind']
export const SKILL_PANE_KINDS: readonly SkillPaneKind[] = ['skill', 'agent', 'command']

/**
 * M127 fix wave. THE UNGROUPED REFUSAL, in words and in one place.
 *
 * Ungrouped is a real column and the only one that cannot be deleted — it is
 * where an unplaced card sits, so deleting it would delete a place the model
 * re-creates on the next render. Its Delete control therefore stays PRESENT
 * and disabled with this sentence; a control that is merely grey is
 * indistinguishable from one that is broken. The constant lives beside the
 * model rather than inside the component so the check and the pane cannot
 * drift into two different refusals (`verify:rail skills.1h`).
 *
 * A hyphen, never an en dash or `›`: renderer text, `verify:styles icons.1`.
 */
export const UNGROUPED_DELETE_REASON = 'Ungrouped is where an unplaced card sits - it cannot be deleted'

/**
 * What the pane says when the rack is empty — two sentences, not one, and
 * the difference is the fix: an empty DIRECTORY means "install something or
 * select a panel in a project that has skills", and an empty SEARCH means
 * "clear the query". `buildSkillColumns` returning `[]` is what makes the
 * distinction renderable at all; this is the half the user reads, so it is
 * pinned beside it (`verify:rail skills.1f`).
 */
export function noMatchSentence(kind: SkillPaneKind, query: string): string {
  return query === '' ? `no ${kind} in this directory` : `no ${kind} matches ${query}`
}

/** The pane's own MIME, read by nothing else — M114's rule for the board's drops. */
export const SKILL_CARD_MIME = 'application/x-tc-skill'

export interface SkillFilter {
  kind: SkillPaneKind
  /** '' means no search. */
  query: string
  /** null means every scope; a list means exactly those. */
  scopes: readonly ToolScope[] | null
  /** Hide every derived card. Never hides a column the user made. */
  placedOnly: boolean
}

export interface SkillCard {
  key: SkillKey
  name: string
  description: string
  why: PlacementWhy
  resources: SkillResources
  /** Absent for every user/project skill — never written as `undefined`. */
  pluginId?: string
  /**
   * False for a shelf key with no file behind it any more.
   *
   * The card KEEPS its slot: the shelf is the user's arrangement, and a `git
   * pull` that removed a skill does not get to edit it. A slot that silently
   * emptied would read as a column the app rearranged by itself.
   */
  installed: boolean
  /** M256. The scope the inventory read it from — the badge's source. */
  scope: ToolScope
  /** M256. The inventory's own active word; `unknown` for a shelf ghost. */
  active: ToolActive['kind']
  /** M256. Absent for a ghost — there is no file behind it to name. */
  sourcePath?: string
}

export interface SkillColumn {
  id: string
  title: string
  cards: SkillCard[]
  /**
   * M127 critic wave. WHICH AUTHORITY MADE THIS COLUMN, on the column rather
   * than only on its cards.
   *
   * A card already wears `placed` / `by plugin` / `by scope`, but the heading
   * did not, so a column the user arranged and a column the app derived read
   * identically at a glance — and the whole point of the rack's ORDER (placed
   * first, derived after) is invisible if the two look the same. `null` is
   * Ungrouped, which is neither: it is where an unplaced card sits.
   */
  origin: 'placed' | 'derived' | null
}

/** `unknown`, never a confident `none`: only a skill bundles resources. */
const NOT_A_SKILL: SkillResources = { kind: 'unknown', why: 'only a skill bundles resources' }
/** M137. A skill whose resources were not counted is not "not a skill"; the sentence was false for it. */
const UNCOUNTED: SkillResources = { kind: 'unknown', why: 'its resources were not counted' }
const GONE: SkillResources = { kind: 'unknown', why: 'not installed — its file was not read' }

/** The title a derived column wears; a placed one wears its record's. */
function derivedTitle(columnId: string): string {
  if (columnId.startsWith('plugin:')) return columnId.slice('plugin:'.length)
  if (columnId.startsWith('scope:')) return columnId.slice('scope:'.length)
  return columnId
}

function isNamed(entry: ToolEntry): entry is NamedToolEntry {
  return entry.kind === 'skill' || entry.kind === 'command' || entry.kind === 'agent'
}

/**
 * The columns, in order: the shelf's own columns as the user arranged them,
 * then the derived ones, then Ungrouped LAST and always.
 *
 * Three rules that each fail silently if undone:
 *
 * - A DERIVED column with no cards left after filtering is omitted (it is a
 *   projection of what is there, and an empty projection describes nothing),
 *   while `Ungrouped` is never omitted — a real column the user can drop into
 *   and cannot delete.
 * - A query matching NOTHING yields `[]` rather than a rack of empty columns,
 *   so the component can say "no skill matches `q`". An empty pane and that
 *   sentence are different renderings and lead to different fixes.
 * - `placedOnly` drops derived CARDS, never the user's columns.
 */
export function buildSkillColumns(
  entries: readonly ToolEntry[],
  shelf: Shelf,
  filter: SkillFilter
): SkillColumn[] {
  const matches = (name: string, description: string): boolean => {
    if (filter.query === '') return true
    return fuzzyMatch(filter.query, name) !== null || fuzzyMatch(filter.query, description) !== null
  }
  const inScope = (scope: ToolScope): boolean =>
    filter.scopes === null || filter.scopes.includes(scope)

  // Every card, with the column it belongs in, in inventory order.
  const placedFor = new Map<string, SkillCard[]>()
  const order: string[] = []
  const push = (columnId: string, card: SkillCard): void => {
    let list = placedFor.get(columnId)
    if (list === undefined) {
      list = []
      placedFor.set(columnId, list)
      order.push(columnId)
    }
    list.push(card)
  }

  const seen = new Set<SkillKey>()
  for (const entry of entries) {
    if (!isNamed(entry)) continue
    if (entry.kind !== filter.kind) continue
    if (!inScope(entry.scope)) continue
    const key = skillKey(entry.scope, entry.name)
    seen.add(key)
    if (!matches(entry.name, entry.description)) continue
    const where = placement(key, shelf, entry.scope, entry.name)
    if (filter.placedOnly && where.why !== 'placed') continue
    push(where.columnId, {
      key,
      name: entry.name,
      description: entry.description,
      why: where.why,
      resources: entry.kind === 'skill' ? (entry.resources !== undefined ? entry.resources : UNCOUNTED) : NOT_A_SKILL,
      // Field by field, never a spread: a spread writes `pluginId: undefined`,
      // which survives IPC and reads as present.
      ...(entry.pluginId === undefined ? {} : { pluginId: entry.pluginId }),
      installed: true,
      scope: entry.scope,
      // Read defensively: a hand-built entry (a check's fixture, an older
      // main) may carry no `active`, and a throw here would empty the rack.
      active: (entry.active as ToolActive | undefined)?.kind ?? 'unknown',
      ...(typeof entry.sourcePath === 'string' && entry.sourcePath !== '' ? { sourcePath: entry.sourcePath } : {})
    })
  }

  // The shelf's ghosts: a key the inventory no longer answers for. Only on the
  // Skills tab — the shelf is a shelf of SKILLS, and a ghost key names no kind,
  // so offering it under Agents or Commands would invent one.
  if (filter.kind === 'skill') {
    for (const col of shelf.columns) {
      for (const key of col.keys) {
        if (seen.has(key)) continue
        const parsed = parseSkillKey(key)
        if (parsed === null) continue
        if (!inScope(parsed.scope)) continue
        if (!matches(parsed.name, '')) continue
        const plugin = pluginPrefixOf(parsed.name)
        push(col.id, {
          key,
          name: parsed.name,
          description: '',
          why: 'placed',
          resources: GONE,
          ...(plugin === null ? {} : { pluginId: plugin }),
          installed: false,
          scope: parsed.scope,
          active: 'unknown'
        })
      }
    }
  }

  const total = [...placedFor.values()].reduce((n, list) => n + list.length, 0)
  if (total === 0) return []

  const out: SkillColumn[] = []
  const taken = new Set<string>([UNGROUPED_COLUMN_ID])
  for (const col of shelf.columns) {
    if (col.id === UNGROUPED_COLUMN_ID) continue
    const cards = placedFor.get(col.id) ?? []
    taken.add(col.id)
    // A column the USER made stays, empty or not: it is a place, not a
    // projection, and one that vanished when its last card moved out would
    // take the drop target with it.
    out.push({ id: col.id, title: col.title, cards, origin: 'placed' })
  }
  for (const id of order) {
    if (taken.has(id)) continue
    const cards = placedFor.get(id) ?? []
    if (cards.length === 0) continue
    out.push({ id, title: derivedTitle(id), cards, origin: 'derived' })
  }
  out.push({
    id: UNGROUPED_COLUMN_ID,
    title: 'Ungrouped',
    cards: placedFor.get(UNGROUPED_COLUMN_ID) ?? [],
    origin: null
  })
  return out
}

/**
 * M256. THE SKILLS WORKSPACE'S FOUR WORDS — pure, so the badge, the state and
 * the purpose line are decided once and the workspace only paints them.
 */

/**
 * The scope badge. PLUGIN wins over the scope it was read under: a plugin's
 * skill is read from the user's plugin cache, and a `User` badge on it would
 * send a person to `~/.claude/skills` looking for a folder that is not there.
 */
export type SkillBadge = 'User' | 'Project' | 'Local' | 'Plugin'
export function skillBadge(card: Pick<SkillCard, 'scope' | 'pluginId'>): SkillBadge {
  if (card.pluginId !== undefined) return 'Plugin'
  return card.scope === 'user' ? 'User' : card.scope === 'project' ? 'Project' : 'Local'
}

/**
 * Four states, never folded: a skill on the canvas, one the agent will load,
 * one that is present but will NOT load (disabled, or waiting on approval),
 * and a shelf slot whose file is gone. "Available" and "unavailable" lead to
 * different fixes — turn it on, or reinstall it — so each carries its reason.
 */
export type SkillState =
  | { kind: 'placed'; word: 'On canvas'; why: string }
  | { kind: 'installed'; word: 'Installed'; why: string }
  | { kind: 'available'; word: 'Available'; why: string }
  | { kind: 'unavailable'; word: 'Unavailable'; why: string }
export function skillState(card: Pick<SkillCard, 'installed' | 'active'>, placedOnCanvas: boolean): SkillState {
  if (!card.installed) return { kind: 'unavailable', word: 'Unavailable', why: 'not installed - the shelf kept its slot' }
  if (card.active === 'disabled') return { kind: 'available', word: 'Available', why: 'present but turned off in settings' }
  if (card.active === 'needs-approval') return { kind: 'available', word: 'Available', why: 'present, waiting for approval before it loads' }
  if (placedOnCanvas) return { kind: 'placed', word: 'On canvas', why: 'a panel for it is open on this canvas' }
  if (card.active === 'unknown') return { kind: 'installed', word: 'Installed', why: 'installed; whether it is active could not be told' }
  return { kind: 'installed', word: 'Installed', why: 'installed and active for this directory' }
}

/**
 * The one-line purpose a row leads with — the description's first sentence,
 * never a mid-word cut. Empty stays empty: an invented "no description" would
 * read as the skill's own words.
 */
export const PURPOSE_MAX = 140
export function skillPurpose(description: string): string {
  const flat = description.replace(/\s+/g, ' ').trim()
  if (flat === '') return ''
  const stop = flat.search(/[.!?](\s|$)/)
  const first = stop === -1 ? flat : flat.slice(0, stop + 1)
  if (first.length <= PURPOSE_MAX) return first
  const cut = first.slice(0, PURPOSE_MAX)
  const space = cut.lastIndexOf(' ')
  return `${(space > PURPOSE_MAX / 2 ? cut.slice(0, space) : cut).replace(/[,;:\s]+$/, '')}…`
}

/**
 * A SKILL.md with its YAML frontmatter removed, for the preview. Only a
 * frontmatter block that OPENS the file and CLOSES is removed; an unclosed
 * `---` is text, and the preview shows it rather than swallowing the file.
 */
export function stripFrontmatter(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.exec(text)
  return m === null ? text : text.slice(m[0].length).replace(/^\s+/, '')
}
