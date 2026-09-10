/**
 * M246. A draft of item-level changes over a file, kept or discarded per item.
 *
 * GENERIC ON PURPOSE. A sheet's items are cells (`B2`); a deck's will be
 * slides (task 6). Nothing here knows what an id means or how to apply one —
 * the owner supplies ids and an apply step. Diffing is STRUCTURAL, by id,
 * never by text line: a line diff of a CSV reports a whole row for one cell
 * and cannot be kept a cell at a time.
 *
 * Until a person keeps an item, the file is untouched; the draft is a record
 * beside it. `baseHash` is the hash of the file the draft was made against,
 * and is how a change underneath is detected — and named — rather than
 * silently applied over.
 */

export interface DraftItem<V> { id: string; old: V; new: V }
export interface Draft<V> {
  /** Hash of the file content the draft's `old` values were read from. */
  baseHash: string
  /** Who proposed it — an agent panel id. Absent for an anonymous draft. */
  by?: string
  at: number
  items: DraftItem<V>[]
}
/** What the last draft came to, kept after it resolves so a restart can say so. */
export interface DraftOutcome { at: number; kept: number; discarded: number }
export type DraftState = 'none' | 'pending' | 'conflict' | 'applied'

/** Every id whose value differs, in the order `after` lists them, then ids only `before` had. */
export function diffItems<V>(before: ReadonlyMap<string, V>, after: ReadonlyMap<string, V>, empty: V): DraftItem<V>[] {
  const out: DraftItem<V>[] = []
  for (const [id, next] of after) {
    const old = before.has(id) ? before.get(id) as V : empty
    if (old !== next) out.push({ id, old, new: next })
  }
  for (const [id, old] of before) if (!after.has(id) && old !== empty) out.push({ id, old, new: empty })
  return out
}

/**
 * Add one proposed change. Re-staging an id REPLACES its `new` and keeps its
 * original `old` — the value on disk the person will compare against — and a
 * proposal that returns an item to its `old` removes it, so a draft never
 * holds a change that changes nothing.
 */
export function stage<V>(draft: Draft<V> | undefined, item: DraftItem<V>, baseHash: string, by: string | undefined, at: number): Draft<V> | undefined {
  const base: Draft<V> = draft ?? { baseHash, ...(by === undefined ? {} : { by }), at, items: [] }
  const existing = base.items.find((i) => i.id === item.id)
  const old = existing ? existing.old : item.old
  const rest = base.items.filter((i) => i.id !== item.id)
  const items = old === item.new ? rest : [...rest, { id: item.id, old, new: item.new }]
  if (items.length === 0) return undefined
  return { ...base, at, items }
}

function split<V>(draft: Draft<V>, ids: readonly string[] | 'all'): { chosen: DraftItem<V>[]; remaining: Draft<V> | undefined } {
  const want = ids === 'all' ? null : new Set(ids)
  const chosen = draft.items.filter((i) => want === null || want.has(i.id))
  const left = draft.items.filter((i) => want !== null && !want.has(i.id))
  return { chosen, remaining: left.length === 0 ? undefined : { ...draft, items: left } }
}

/** The items to APPLY, and what stays pending. The caller writes `apply`; this writes nothing. */
export function keep<V>(draft: Draft<V>, ids: readonly string[] | 'all'): { apply: DraftItem<V>[]; remaining: Draft<V> | undefined } {
  const { chosen, remaining } = split(draft, ids)
  return { apply: chosen, remaining }
}

/** The items dropped, and what stays pending. Nothing is applied, so nothing is written. */
export function discard<V>(draft: Draft<V>, ids: readonly string[] | 'all'): { dropped: DraftItem<V>[]; remaining: Draft<V> | undefined } {
  const { chosen, remaining } = split(draft, ids)
  return { dropped: chosen, remaining }
}

/**
 * Four renderings, never collapsed: nothing to review, something to review,
 * something to review that no longer matches the file, and "the last one was
 * resolved" — the fact a restart would otherwise lose.
 */
export function draftState<V>(draft: Draft<V> | undefined, diskHash: string | undefined, outcome: DraftOutcome | undefined): DraftState {
  if (draft === undefined) return outcome === undefined ? 'none' : 'applied'
  if (diskHash !== undefined && diskHash !== draft.baseHash) return 'conflict'
  return 'pending'
}

/**
 * After the file changed underneath: keep the items whose current value is
 * still their `old` (the draft still describes them), drop the rest and name
 * them. `current(id)` reads the file as it is now.
 */
export function rebase<V>(draft: Draft<V>, diskHash: string, current: (id: string) => V): { draft: Draft<V> | undefined; dropped: DraftItem<V>[] } {
  const keepItems = draft.items.filter((i) => current(i.id) === i.old)
  const dropped = draft.items.filter((i) => current(i.id) !== i.old)
  return { draft: keepItems.length === 0 ? undefined : { ...draft, baseHash: diskHash, items: keepItems }, dropped }
}

/** FNV-1a, 53 bits — sync, identical in renderer and node. Detection, not security: main's CAS guards every write. */
export function contentHash(text: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 0x01000193)
    h2 = Math.imul(h2 ^ ch, 0x5bd1e995)
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${((h2 >>> 0) & 0x1fffff).toString(16).padStart(6, '0')}:${text.length}`
}
