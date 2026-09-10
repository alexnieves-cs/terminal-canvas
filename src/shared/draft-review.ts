/**
 * M248 (M246's planned API, built first here). A DRAFT is a set of proposed
 * item changes held beside a document, reviewed item by item by a person.
 *
 * GENERIC ON PURPOSE. The deck keys slides on it and the sheet branch will key
 * cells on it, so nothing here may know what an item is: its checks run on
 * non-slide items (`verify:deck draft.*`), and `draft.generic.1` fails this
 * file if it ever names one kind of document or imports anything.
 *
 * Absent is `null` on either side of an item — `{old: null}` is an addition,
 * `{new: null}` a removal. Never `undefined`: it does not survive the layout
 * file's JSON, so an addition would come back as a malformed item.
 */

export interface DraftItem<V> {
  /** What a person types to keep or discard it. Unique within a draft. */
  id: string
  old: V
  new: V
}

export interface Draft<V> {
  /** hashText of the document the items were computed against. */
  baseHash: string
  /** Who proposed it — a panel id — when a door says so. */
  by?: string
  at: number
  items: DraftItem<V>[]
}

export type DraftState = 'none' | 'pending' | 'conflict'

/**
 * FNV-1a over UTF-16 code units, two lanes, 16 hex characters. Not a security
 * hash: it answers "is this still the document the draft was made against",
 * and a CRLF/LF difference must answer no, which a normalising compare would not.
 */
export function hashText(text: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ text.length
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c ^ (i & 0xff), 0x01000193) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

const same = (x: unknown, y: unknown): boolean => x === y || JSON.stringify(x) === JSON.stringify(y)

/** One item per key whose value differs, the new map's order first, then removals in the old map's order. */
export function diffItems<V>(oldMap: ReadonlyMap<string, V>, newMap: ReadonlyMap<string, V>): DraftItem<V | null>[] {
  const out: DraftItem<V | null>[] = []
  for (const [id, value] of newMap) {
    const had = oldMap.has(id)
    if (!had) out.push({ id, old: null, new: value })
    else if (!same(oldMap.get(id), value)) out.push({ id, old: oldMap.get(id) as V, new: value })
  }
  for (const [id, value] of oldMap) if (!newMap.has(id)) out.push({ id, old: value, new: null })
  return out
}

/** The remaining draft, or null when nothing remains — never a draft with no items. */
function split<V>(draft: Draft<V>, ids: readonly string[] | 'all'): { chosen: DraftItem<V>[]; remaining: Draft<V> | null } {
  const wanted = ids === 'all' ? null : new Set(ids)
  const chosen = draft.items.filter((item) => wanted === null || wanted.has(item.id))
  const rest = draft.items.filter((item) => wanted !== null && !wanted.has(item.id))
  return { chosen, remaining: rest.length === 0 ? null : { ...draft, items: rest } }
}

/** Keep: the chosen items are handed back to APPLY; the rest stay proposed. */
export function keep<V>(draft: Draft<V>, ids: readonly string[] | 'all'): { apply: DraftItem<V>[]; remaining: Draft<V> | null } {
  const { chosen, remaining } = split(draft, ids)
  return { apply: chosen, remaining }
}

/** Discard: nothing to apply; the chosen items are dropped from the proposal. */
export function discard<V>(draft: Draft<V>, ids: readonly string[] | 'all'): { apply: DraftItem<V>[]; remaining: Draft<V> | null } {
  return { apply: [], remaining: split(draft, ids).remaining }
}

/** Three states, never two: no draft, a draft on today's document, a draft on yesterday's. */
export function draftState<V>(draft: Draft<V> | null | undefined, diskHash: string): DraftState {
  if (!draft || draft.items.length === 0) return 'none'
  return draft.baseHash === diskHash ? 'pending' : 'conflict'
}
