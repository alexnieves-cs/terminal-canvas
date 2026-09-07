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
import type { NamedToolEntry, SkillResources, ToolEntry, ToolScope } from '@shared/toolbox'

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
}

export interface SkillColumn {
  id: string
  title: string
  cards: SkillCard[]
}

/** `unknown`, never a confident `none`: only a skill bundles resources. */
const NOT_A_SKILL: SkillResources = { kind: 'unknown', why: 'only a skill bundles resources' }
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
      resources: entry.kind === 'skill' && entry.resources !== undefined ? entry.resources : NOT_A_SKILL,
      // Field by field, never a spread: a spread writes `pluginId: undefined`,
      // which survives IPC and reads as present.
      ...(entry.pluginId === undefined ? {} : { pluginId: entry.pluginId }),
      installed: true
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
          installed: false
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
    out.push({ id: col.id, title: col.title, cards })
  }
  for (const id of order) {
    if (taken.has(id)) continue
    const cards = placedFor.get(id) ?? []
    if (cards.length === 0) continue
    out.push({ id, title: derivedTitle(id), cards })
  }
  out.push({
    id: UNGROUPED_COLUMN_ID,
    title: 'Ungrouped',
    cards: placedFor.get(UNGROUPED_COLUMN_ID) ?? []
  })
  return out
}
