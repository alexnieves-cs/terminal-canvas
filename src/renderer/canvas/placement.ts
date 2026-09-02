import { MIN_PANEL_H, MIN_PANEL_W } from '@shared/panel-geometry'
import type { WorldRect } from './viewport'

/**
 * M50. Placement: snapping while a panel is dragged, and tidy on request.
 *
 * PURE, no DOM, no React — it runs under plain node in verify:viewport
 * (snap.1–4, tidy.1–2), and it is applied to applyDrag's OUTPUT: applyDrag is
 * the single place a drag resolves to a rect, and snapping is a function of
 * that rect, the other panels' rects, and a threshold. The caller derives
 * the threshold as SNAP_PX / viewport.scale — SCREEN pixels over the scale,
 * the same 1/k relationship applyDrag embodies and verify:viewport 27 pins —
 * because a world-unit threshold is huge zoomed out and invisible zoomed in.
 */

/** The snap distance, in SCREEN pixels. Divide by the scale before calling. */
export const SNAP_PX = 8
/** The gap tidy leaves between panels, in world units. */
export const TIDY_GAP = 24

export interface SnapGuide {
  axis: 'x' | 'y'
  /** The world coordinate the guide sits on. */
  at: number
  /** The span to draw it across: the union of the two rects involved. */
  from: number
  to: number
}

export interface SnapResult {
  rect: WorldRect
  guides: SnapGuide[]
}

export interface SnapOptions {
  /** A resize: only the growing edges are candidates, and the size never falls under the floor. */
  resize?: { growsX: boolean; growsY: boolean }
}

interface Candidate { delta: number; at: number; from: number; to: number }

function pick(cands: Candidate[], threshold: number): Candidate | null {
  let best: Candidate | null = null
  for (const c of cands) {
    if (Math.abs(c.delta) > threshold) continue
    if (best === null || Math.abs(c.delta) < Math.abs(best.delta)) best = c
  }
  return best
}

/**
 * Snap `rect` to the nearest edge or centre of any of `others` within
 * `threshold` (world units), per axis; the smallest delta wins. A rect with
 * the same id as `rect` is skipped, so the caller may pass the whole panel
 * list. Returns the snapped rect and the guides it snapped to (none when
 * nothing was within reach).
 */
export function snapRect(rect: WorldRect, others: readonly WorldRect[], threshold: number, opts: SnapOptions = {}): SnapResult {
  const xs: Candidate[] = []
  const ys: Candidate[] = []
  const resize = opts.resize
  for (const o of others) {
    if (o.id === rect.id) continue
    const spanY = { from: Math.min(rect.y, o.y), to: Math.max(rect.y + rect.h, o.y + o.h) }
    const spanX = { from: Math.min(rect.x, o.x), to: Math.max(rect.x + rect.w, o.x + o.w) }
    const oEdgesX = [o.x, o.x + o.w, o.x + o.w / 2]
    const oEdgesY = [o.y, o.y + o.h, o.y + o.h / 2]
    // A move snaps its left, right or centre; a resize only its moving
    // (right/bottom) edge — the origin corner is where the user's other hand is.
    const myX = resize
      ? (resize.growsX ? [rect.x + rect.w] : [])
      : [rect.x, rect.x + rect.w, rect.x + rect.w / 2]
    const myY = resize
      ? (resize.growsY ? [rect.y + rect.h] : [])
      : [rect.y, rect.y + rect.h, rect.y + rect.h / 2]
    for (const mine of myX) for (const at of oEdgesX) xs.push({ delta: at - mine, at, ...spanY })
    for (const mine of myY) for (const at of oEdgesY) ys.push({ delta: at - mine, at, ...spanX })
  }
  const bx = pick(xs, threshold)
  const by = pick(ys, threshold)
  const guides: SnapGuide[] = []
  let out: WorldRect = { ...rect }
  if (bx) {
    if (resize) {
      // The snapped width; refused (not clamped into a different size)
      // when it would fall under the floor, so a snap never produces a rect
      // the validator rejects.
      const w = rect.w + bx.delta
      if (w >= MIN_PANEL_W) { out = { ...out, w }; guides.push({ axis: 'x', at: bx.at, from: bx.from, to: bx.to }) }
    } else {
      out = { ...out, x: rect.x + bx.delta }
      guides.push({ axis: 'x', at: bx.at, from: bx.from, to: bx.to })
    }
  }
  if (by) {
    if (resize) {
      const h = rect.h + by.delta
      if (h >= MIN_PANEL_H) { out = { ...out, h }; guides.push({ axis: 'y', at: by.at, from: by.from, to: by.to }) }
    } else {
      out = { ...out, y: rect.y + by.delta }
      guides.push({ axis: 'y', at: by.at, from: by.from, to: by.to })
    }
  }
  return { rect: out, guides }
}

/**
 * Compact `rects` WITHOUT reordering and WITHOUT resizing. Reading order is
 * kept: rows are formed by vertical overlap of the rects as they are, ordered
 * top to bottom, and within a row left to right; each row is packed from the
 * selection's leftmost x with `gap` between panels, and the next row starts
 * `gap` below the tallest panel of the row above. A tidy that sorted by id
 * would destroy the spatial meaning the canvas was carrying; one that resized
 * could produce a rect under the floor, which the validator rejects and
 * which is therefore a canvas that cannot be saved. Idempotent: tidying a
 * tidied arrangement changes nothing. The returned array keeps the input's
 * order (the panel array's order is paint-stable and must not move).
 */
export function tidyPanels<T extends WorldRect>(rects: readonly T[], gap: number = TIDY_GAP): T[] {
  if (rects.length === 0) return []
  const originX = Math.min(...rects.map((r) => r.x))
  const originY = Math.min(...rects.map((r) => r.y))
  // Rows by vertical overlap, seeded top to bottom by centre.
  const byCentreY = [...rects].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || (a.x - b.x))
  const rows: T[][] = []
  for (const r of byCentreY) {
    const row = rows.find((candidates) => candidates.some((c) => r.y < c.y + c.h && c.y < r.y + r.h))
    if (row) row.push(r)
    else rows.push([r])
  }
  const placed = new Map<string, { x: number; y: number }>()
  let y = originY
  for (const row of rows) {
    row.sort((a, b) => (a.x + a.w / 2) - (b.x + b.w / 2))
    let x = originX
    let tallest = 0
    for (const r of row) {
      placed.set(r.id, { x, y })
      x += r.w + gap
      tallest = Math.max(tallest, r.h)
    }
    y += tallest + gap
  }
  return rects.map((r) => {
    const p = placed.get(r.id)
    return p === undefined ? r : { ...r, x: p.x, y: p.y }
  })
}
