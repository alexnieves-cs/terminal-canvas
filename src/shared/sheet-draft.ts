import type { Draft, DraftItem, DraftOutcome } from './draft-review'
import { colName, parseRef, type Grid } from './sheet-formula'
import { setCells } from './sheet-model'

/**
 * M246. The sheet's side of the generic draft (draft-review.ts): item ids are
 * A1 cell refs, and applying an item sets that cell. Everything about WHEN a
 * draft exists, who may resolve it and how a change underneath is named lives
 * here or in the session — draft-review.ts stays ignorant of cells so task 6
 * can hand it slides.
 */
export type SheetDraft = Draft<string>
export const DRAFT_ITEM_CAP = 10_000
const VALUE_CAP = 32_768
const CELL_ID = /^[A-Z]{1,3}[1-9]\d{0,6}$/

export function parseSheetDraft(raw: unknown): { kind: 'absent' } | { kind: 'malformed' } | { kind: 'draft'; draft: SheetDraft } {
  if (raw === undefined) return { kind: 'absent' }
  const bad = { kind: 'malformed' as const }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad
  const v = raw as Record<string, unknown>
  if (typeof v.baseHash !== 'string' || v.baseHash.length === 0 || v.baseHash.length > 64) return bad
  if (typeof v.at !== 'number' || !Number.isFinite(v.at)) return bad
  if ('by' in v && (typeof v.by !== 'string' || v.by.length === 0 || v.by.length > 64)) return bad
  if (!Array.isArray(v.items) || v.items.length === 0 || v.items.length > DRAFT_ITEM_CAP) return bad
  const seen = new Set<string>()
  const items: DraftItem<string>[] = []
  for (const it of v.items) {
    if (!it || typeof it !== 'object') return bad
    const i = it as Record<string, unknown>
    if (typeof i.id !== 'string' || !CELL_ID.test(i.id) || seen.has(i.id)) return bad
    if (typeof i.old !== 'string' || typeof i.new !== 'string' || i.old.length > VALUE_CAP || i.new.length > VALUE_CAP) return bad
    seen.add(i.id)
    items.push({ id: i.id, old: i.old, new: i.new })
  }
  return { kind: 'draft', draft: { baseHash: v.baseHash, ...(typeof v.by === 'string' ? { by: v.by } : {}), at: v.at, items } }
}

export function parseDraftOutcome(raw: unknown): { kind: 'absent' } | { kind: 'malformed' } | { kind: 'outcome'; outcome: DraftOutcome } {
  if (raw === undefined) return { kind: 'absent' }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'malformed' }
  const v = raw as Record<string, unknown>
  const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
  if (typeof v.at !== 'number' || !Number.isFinite(v.at) || !count(v.kept) || !count(v.discarded)) return { kind: 'malformed' }
  return { kind: 'outcome', outcome: { at: v.at, kept: v.kept, discarded: v.discarded } }
}

export function cellValue(grid: Grid, id: string): string {
  const ref = parseRef(id)
  return ref === null ? '' : grid[ref.r]?.[ref.c] ?? ''
}

/** Set exactly the items' cells. Never mutates `grid`. */
export function applyDraftItems(grid: Grid, items: readonly DraftItem<string>[]): string[][] {
  return setCells(grid, items.flatMap((i) => { const ref = parseRef(i.id); return ref === null ? [] : [{ r: ref.r, c: ref.c, value: i.new }] }))
}

/** The header's contextual fact. Nothing at all when there is nothing — the rest layer never states a zero. */
export function sheetDraftSummary(draft: SheetDraft | undefined): string {
  const n = draft?.items.length ?? 0
  return n === 0 ? '' : `${n} change${n === 1 ? '' : 's'}`
}

/**
 * Who is asking decides whether an edit writes or proposes. The agent door
 * (and a workflow an agent triggered) carries `caller.panelId`; the palette
 * runner, a person's workflow run and the grid itself carry none.
 */
export function sheetEditRoute(caller: { panelId?: string } | undefined): 'draft' | 'write' {
  return caller?.panelId !== undefined && caller.panelId !== '' ? 'draft' : 'write'
}

/** Keeping is the approval this milestone hands to a person; withdrawing a proposal changes no file. */
export function sheetReviewRefusal(op: 'keep' | 'discard', caller: { panelId?: string } | undefined): string | null {
  return op === 'keep' && sheetEditRoute(caller) === 'draft'
    ? 'a draft is kept by a person — ask them to review it on the sheet'
    : null
}

/** `all`, one cell, or a rectangle like `B2:C4`, as the ids a review verb acts on. null when unreadable. */
export function parseReviewTarget(text: string): string[] | 'all' | null {
  const t = text.trim()
  if (t.toLowerCase() === 'all') return 'all'
  const [a, b] = t.split(':')
  const p = parseRef(a ?? '')
  const q = b === undefined ? p : parseRef(b)
  if (p === null || q === null) return null
  const ids: string[] = []
  for (let r = Math.min(p.r, q.r); r <= Math.max(p.r, q.r); r++) {
    for (let c = Math.min(p.c, q.c); c <= Math.max(p.c, q.c); c++) ids.push(`${colName(c)}${r + 1}`)
  }
  return ids.length > DRAFT_ITEM_CAP ? null : ids
}
