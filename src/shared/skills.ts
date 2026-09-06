import type { ToolScope } from './toolbox'

/**
 * M125. A skill's identity is `scope` AND `name`, never the name alone.
 *
 * M21 measured that two scopes can define one name and REFUSED to name a
 * winner, recording the link in `alsoDefinedIn`. A shelf keyed by bare name
 * would silently pick one of them, and the user would see a skill sitting in
 * a column while the agent used a different file of the same name.
 *
 * Stringified, not `:`-joined, for `ToolEntryBase.id`'s own reason: a plugin
 * skill's name CONTAINS a colon (`superpowers:brainstorming`), so a joined id
 * collides the first time two coordinates differ only across the delimiter.
 */
export type SkillKey = string

export function skillKey(scope: ToolScope, name: string): SkillKey {
  return JSON.stringify([scope, name])
}

export function parseSkillKey(key: SkillKey): { scope: ToolScope; name: string } | null {
  try {
    const v = JSON.parse(key)
    if (!Array.isArray(v) || v.length !== 2) return null
    const [scope, name] = v
    if (scope !== 'user' && scope !== 'project' && scope !== 'local') return null
    if (typeof name !== 'string' || name === '') return null
    return { scope, name }
  } catch {
    // A malformed key is not a guess. parseLayout's rule: drop, never coerce.
    return null
  }
}

export interface ShelfColumn {
  id: string
  title: string
  keys: SkillKey[]
}

export interface Shelf {
  columns: ShelfColumn[]
}

/** The newest kept; a library, not a history. TEMPLATES_MAX's shape. */
export const SHELF_COLUMNS_MAX = 24

/**
 * A real column, and it cannot be deleted or emptied by a filter.
 *
 * A skill that silently vanishes from the shelf is indistinguishable from a
 * skill that was never installed — this repo's standing rule, applied to a
 * library whose whole promise is "what can this agent do".
 */
export const UNGROUPED_COLUMN_ID = 'ungrouped'

export type PlacementWhy = 'placed' | 'by-plugin' | 'by-scope'

/**
 * The plugin half of `superpowers:brainstorming`, or null for a bare name.
 *
 * Only the FIRST colon: a name may contain more, and splitting on all of them
 * would invent a nesting the CLI does not have.
 */
export function pluginPrefixOf(name: string): string | null {
  const i = name.indexOf(':')
  if (i <= 0) return null
  return name.slice(0, i)
}

/**
 * Where a skill sits, and WHY — and the `why` is not decoration.
 *
 * Derived-default-plus-user-override is two authorities for one position, and
 * its failure is a skill appearing in a column nobody put it in with no way to
 * tell which authority put it there. The fix is this repo's standing one: make
 * the state visible rather than collapsing it. Every card renders the word.
 */
export function placement(
  key: SkillKey,
  shelf: Shelf,
  scope: ToolScope,
  name: string
): { columnId: string; why: PlacementWhy } {
  for (const col of shelf.columns) {
    if (col.keys.includes(key)) return { columnId: col.id, why: 'placed' }
  }
  const plugin = pluginPrefixOf(name)
  if (plugin !== null) return { columnId: `plugin:${plugin}`, why: 'by-plugin' }
  return { columnId: `scope:${scope}`, why: 'by-scope' }
}

/** ABSENT is every pre-M125 file and warns nothing; MALFORMED warns and is dropped. */
export function parseShelf(raw: unknown, warnings: string[]): Shelf {
  if (raw === undefined || raw === null) return { columns: [] }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push('dropped shelf: not an object')
    return { columns: [] }
  }
  const cols = (raw as { columns?: unknown }).columns
  if (cols === undefined) return { columns: [] }
  if (!Array.isArray(cols)) {
    warnings.push('dropped shelf: columns was not an array')
    return { columns: [] }
  }
  const out: ShelfColumn[] = []
  for (const entry of cols) {
    if (out.length >= SHELF_COLUMNS_MAX) break
    if (typeof entry !== 'object' || entry === null) {
      warnings.push('dropped a shelf column: not an object')
      continue
    }
    const e = entry as Record<string, unknown>
    if (typeof e.id !== 'string' || e.id === '' || typeof e.title !== 'string') {
      warnings.push(`dropped shelf column ${String(e.id)}: id or title was unusable`)
      continue
    }
    const keys = Array.isArray(e.keys) ? e.keys.filter((k): k is string => typeof k === 'string') : []
    out.push({ id: e.id, title: e.title, keys })
  }
  return { columns: out }
}

/** Field by field, never a spread: a spread writes `key: undefined`, which survives IPC. */
export function carryShelf(shelf: Shelf): Shelf {
  return { columns: shelf.columns.map((c) => ({ id: c.id, title: c.title, keys: [...c.keys] })) }
}

/**
 * A rename changes the KEY (scope:name), so the shelf slot must follow.
 *
 * In place, preserving order: a rename that appended would silently reorder a
 * column the user arranged by hand.
 */
export function renameInShelf(shelf: Shelf, from: SkillKey, to: SkillKey): Shelf {
  return {
    columns: shelf.columns.map((c) => ({
      id: c.id,
      title: c.title,
      keys: c.keys.map((k) => (k === from ? to : k))
    }))
  }
}

/**
 * M127. `claude plugin details <id>` output, VERBATIM.
 *
 * Lives here rather than beside its reader in `main/plugin-details.ts`
 * because the ipc contract carries it across the bridge, and `shared/` may
 * never import from `main/`. Three-state, never two: `unknown` with a why
 * covers an absent CLI, a non-zero exit and a timeout alike — an empty
 * string would read as a plugin that ships nothing.
 */
export type PluginDetailsResult =
  | { kind: 'ok'; text: string }
  | { kind: 'unknown'; why: string }
