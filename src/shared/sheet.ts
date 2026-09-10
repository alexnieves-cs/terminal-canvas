/**
 * M245. What makes a file panel a sheet, and the small facts around it.
 *
 * `SheetView` persists PRESENTATION AND CONSENT ONLY. Cell content lives in
 * the file and nowhere else; a copy in layout.json would be a second author
 * of the data that goes stale the moment an agent writes the file.
 */
export interface SheetView {
  /** Column widths in px, by column index. Absent means every column is the default. */
  widths?: number[]
  /** The xlsx loss list the person confirmed. A list that later grows asks again. */
  lossAccepted?: string[]
}

export type SheetFormat = 'csv' | 'tsv' | 'xlsx'

export function sheetFormat(path: string): SheetFormat {
  if (/\.xlsx$/i.test(path)) return 'xlsx'
  if (/\.tsv$/i.test(path)) return 'tsv'
  return 'csv'
}
export const isSheetPath = (path: string): boolean => /\.(csv|tsv|xlsx)$/i.test(path)

export function parseSheetView(raw: unknown): { kind: 'absent' } | { kind: 'malformed'; reason: string } | { kind: 'view'; view: SheetView } {
  if (raw === undefined) return { kind: 'absent' }
  const bad = { kind: 'malformed' as const, reason: 'sheet view must hold bounded column widths and a loss list of strings' }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad
  const value = raw as Record<string, unknown>
  const view: SheetView = {}
  if ('widths' in value) {
    const w = value.widths
    if (!Array.isArray(w) || w.length > 16384 || !w.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 16 && n <= 4000)) return bad
    view.widths = [...w] as number[]
  }
  if ('lossAccepted' in value) {
    const l = value.lossAccepted
    if (!Array.isArray(l) || l.length > 50 || !l.every((s) => typeof s === 'string' && s.length <= 200)) return bad
    view.lossAccepted = [...l] as string[]
  }
  return { kind: 'view', view }
}

/** The header's size fact. An empty sheet says nothing rather than "0 rows" — the rest layer never states a zero. */
export function sheetSummary(rows: number, cols: number): string {
  if (rows === 0) return ''
  return `${rows.toLocaleString('en-US')} row${rows === 1 ? '' : 's'} × ${cols} col${cols === 1 ? '' : 's'}`
}

/**
 * Bytes cross the bridge as base64 (`file:read`/`file:write` with
 * `encoding: 'base64'`). atob/btoa, not Buffer: this module runs in the
 * renderer, which has no Buffer, and in plain node for the checks, which has both.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
