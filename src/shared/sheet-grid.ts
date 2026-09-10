/**
 * M245. Which cells a sheet puts in the DOM.
 *
 * Only the visible window plus an overscan margin. A 50,000-row CSV rendered
 * whole is 400,000 elements, which locks the renderer for seconds on open and
 * again on every edit — and the canvas beside it with it. Pure, so the bound
 * is checkable in plain node (verify:sheet `sheet.grid.*`).
 *
 * Rows have a fixed height, so the row window is a division. Columns can be
 * resized, so the column window walks prefix sums.
 */
export interface WindowInput {
  rows: number
  cols: number
  rowHeight: number
  widths: readonly number[]
  defaultWidth: number
  scrollTop: number
  scrollLeft: number
  height: number
  width: number
  overscan: number
}
/** Inclusive ranges; `r1 < r0` (or `c1 < c0`) means nothing to render. */
export interface CellWindow { r0: number; r1: number; c0: number; c1: number }

export const colWidth = (widths: readonly number[], c: number, fallback: number): number => widths[c] ?? fallback

export function colLeft(widths: readonly number[], c: number, fallback: number): number {
  let x = 0
  for (let i = 0; i < c; i++) x += colWidth(widths, i, fallback)
  return x
}

export function visibleWindow(w: WindowInput): CellWindow {
  const r0 = Math.max(0, Math.floor(w.scrollTop / w.rowHeight) - w.overscan)
  const r1 = Math.min(w.rows - 1, Math.floor((w.scrollTop + w.height) / w.rowHeight) + w.overscan)
  let c0 = -1
  let c1 = -1
  let x = 0
  for (let c = 0; c < w.cols; c++) {
    const right = x + colWidth(w.widths, c, w.defaultWidth)
    if (c0 < 0 && right > w.scrollLeft) c0 = c
    if (x < w.scrollLeft + w.width) c1 = c
    else break
    x = right
  }
  if (c0 < 0) return { r0, r1, c0: 0, c1: -1 }
  return { r0, r1, c0: Math.max(0, c0 - w.overscan), c1: Math.min(w.cols - 1, c1 + w.overscan) }
}
