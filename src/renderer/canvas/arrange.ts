import { MIN_PANEL_H, MIN_PANEL_W } from '@shared/panel-geometry'
import type { SnapGuide } from './placement'
import type { WorldRect } from './viewport'

/**
 * M390. Arranging: the math a canvas of objects and a flowchart share. Align,
 * distribute, equal-spacing guides, the grid, and the ONE snap function the
 * canvas calls (smartSnap) in place of placement.ts's snapRect.
 *
 * PURE, no DOM, no React — it runs under plain node in verify:flowchart, and
 * like M50's snapping it is a function of a rect that has ALREADY been
 * resolved (applyDrag's output), the other objects' rects and a threshold.
 * The threshold is SCREEN pixels over the scale, the caller's job
 * (SNAP_PX / viewport.scale), exactly as for snapRect: a world-unit threshold
 * is huge zoomed out and invisible zoomed in.
 *
 * The verbs (align, distribute) return POSITIONS ONLY, keyed by id. A verb
 * that resized would produce a rect under the floor the validator rejects —
 * a canvas that cannot be saved — and the caller applies positions through
 * the one move path, so undo, marks and tiering see an ordinary move.
 */

export type AlignEdge = 'left' | 'hcentre' | 'right' | 'top' | 'vcentre' | 'bottom'
export type DistributeAxis = 'h' | 'v'
export type Positions = Map<string, { x: number; y: number }>

/**
 * Line the selection up on one of its own extremes. left/top → the smallest
 * coordinate in the selection, right/bottom → the largest far edge, the
 * centres → the centre of the selection's BOUNDING BOX (not the mean of the
 * centres, which a single far outlier would drag). Only the named axis
 * moves; every rect appears in the result, the ones already on the line
 * included, so the caller can count "n objects aligned" from the selection
 * and detect a no-op by comparing. Fewer than two rects: nothing to align to,
 * an empty map.
 */
export function alignRects(rects: readonly WorldRect[], edge: AlignEdge): Positions {
  const out: Positions = new Map()
  if (rects.length < 2) return out
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const r of rects) {
    if (r.x < minX) minX = r.x
    if (r.x + r.w > maxX) maxX = r.x + r.w
    if (r.y < minY) minY = r.y
    if (r.y + r.h > maxY) maxY = r.y + r.h
  }
  for (const r of rects) {
    let x = r.x
    let y = r.y
    switch (edge) {
      case 'left': x = minX; break
      case 'right': x = maxX - r.w; break
      case 'hcentre': x = (minX + maxX) / 2 - r.w / 2; break
      case 'top': y = minY; break
      case 'bottom': y = maxY - r.h; break
      case 'vcentre': y = (minY + maxY) / 2 - r.h / 2; break
    }
    out.set(r.id, { x, y })
  }
  return out
}

function byIdThen(a: WorldRect, b: WorldRect, d: number): number {
  return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Space the middle objects so every GAP between consecutive objects is the
 * same. Gap-based, never centre-based: with different widths, equal centre
 * spacing gives visibly unequal gaps, which is the one thing distribute is
 * for. The order is by leading edge on the axis with the id as a stable
 * tie-break (two objects at the same x must not swap places between runs);
 * the first and the last stay exactly where they are and bound the span.
 * The result is NOT rounded — a gap of 86.666… is what makes the gaps equal,
 * and rounding each position would leave them a unit apart.
 *
 * When the total size exceeds the span (the objects overlap) the gaps are
 * still equal, and NEGATIVE: an even overlap, which is what a person who
 * asked to distribute a pile gets. Fewer than three: an empty map (two are
 * already "evenly" spaced, one has nothing to space).
 */
export function distributeRects(rects: readonly WorldRect[], axis: DistributeAxis): Positions {
  const out: Positions = new Map()
  if (rects.length < 3) return out
  const h = axis === 'h'
  const start = (r: WorldRect): number => (h ? r.x : r.y)
  const size = (r: WorldRect): number => (h ? r.w : r.h)
  const order = [...rects].sort((a, b) => byIdThen(a, b, start(a) - start(b)))
  const first = order[0]
  const last = order[order.length - 1]
  let total = 0
  for (const r of order) total += size(r)
  const gap = (start(last) + size(last) - start(first) - total) / (order.length - 1)
  let cursor = start(first)
  for (let i = 0; i < order.length; i++) {
    const r = order[i]
    // The ends are written back untouched, not recomputed: cursor arithmetic
    // would land the last within a float error of where it already is.
    const at = i === 0 || i === order.length - 1 ? start(r) : cursor
    out.set(r.id, h ? { x: at, y: r.y } : { x: r.x, y: at })
    cursor = at + size(r) + gap
  }
  return out
}

/** The verb note for an align, e.g. "3 objects aligned left". */
export function alignSentence(n: number, edge: AlignEdge): string {
  const what = n === 1 ? 'object' : 'objects'
  const how: Record<AlignEdge, string> = {
    left: 'aligned left',
    right: 'aligned right',
    top: 'aligned top',
    bottom: 'aligned bottom',
    hcentre: 'centred horizontally',
    vcentre: 'centred vertically'
  }
  return `${n} ${what} ${how[edge]}`
}

/** The verb note for a distribute, e.g. "4 objects spaced evenly across". */
export function distributeSentence(n: number, axis: DistributeAxis): string {
  return `${n} ${n === 1 ? 'object' : 'objects'} spaced evenly ${axis === 'h' ? 'across' : 'down'}`
}

/* ------------------------------------------------------------------ */
/* Equal spacing                                                       */
/* ------------------------------------------------------------------ */

/**
 * One equal-spacing cue. For axis 'x' each segment is a HORIZONTAL
 * measurement from x=`from` to x=`to`, drawn at y=`at` (the middle of the two
 * objects' shared span); for axis 'y' it is vertical, from y to y at x=`at`.
 * One segment per equal gap involved, so the person sees every gap that now
 * matches light up together, not just the two the moving object made.
 */
export interface SpacingSegment { from: number; to: number; at: number }
export interface SpacingGuide {
  axis: 'x' | 'y'
  /** The shared gap, whole world units — the number the label prints. */
  gap: number
  segments: SpacingSegment[]
}

/** One axis's accessors, so the horizontal rule and the vertical rule are ONE function and cannot drift. */
interface Ax {
  name: 'x' | 'y'
  pos: (r: WorldRect) => number
  size: (r: WorldRect) => number
  cpos: (r: WorldRect) => number
  csize: (r: WorldRect) => number
}
const AX_X: Ax = { name: 'x', pos: (r) => r.x, size: (r) => r.w, cpos: (r) => r.y, csize: (r) => r.h }
const AX_Y: Ax = { name: 'y', pos: (r) => r.y, size: (r) => r.h, cpos: (r) => r.x, csize: (r) => r.w }

/** How far `a` and `b` overlap on the cross axis; > 0 means they share a row (or a column). */
function crossOverlap(a: WorldRect, b: WorldRect, ax: Ax): number {
  return Math.min(ax.cpos(a) + ax.csize(a), ax.cpos(b) + ax.csize(b)) - Math.max(ax.cpos(a), ax.cpos(b))
}

interface GapPair { a: WorldRect; b: WorldRect; gap: number }

/**
 * Every visible gap in `rects`: for each rect, the gap to its NEAREST right
 * neighbour among those it shares a row with. Two rects that do not share a
 * row have no gap to measure (there is no line to draw it on), and touching
 * or overlapping rects have none worth a label, so neither is a gap.
 */
function gapPairs(rects: readonly WorldRect[], ax: Ax): GapPair[] {
  const sorted = [...rects].sort((p, q) => byIdThen(p, q, ax.pos(p) - ax.pos(q)))
  const out: GapPair[] = []
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]
    const end = ax.pos(p) + ax.size(p)
    for (let j = i + 1; j < sorted.length; j++) {
      const q = sorted[j]
      if (ax.pos(q) < end) continue
      if (crossOverlap(p, q, ax) <= 0) continue
      const gap = ax.pos(q) - end
      if (gap > 0) out.push({ a: p, b: q, gap })
      break
    }
  }
  return out
}

interface SpacingPlan { delta: number; gap: number; row: WorldRect[] }

function overlapsAnyOnAxis(row: readonly WorldRect[], at: number, size: number, ax: Ax): boolean {
  for (const o of row) {
    const s = ax.pos(o)
    if (s < at + size && at < s + ax.size(o)) return true
  }
  return false
}

/**
 * The best equal-spacing move for `rect` along one axis, or null. `row` is
 * everything that shares a row with it (strict cross-axis overlap); L and R
 * are its nearest neighbours either side. Two families of candidate:
 *   (a) CENTRED — the gap to L equals the gap to R;
 *   (b) RHYTHM — the gap to L (or to R) equals a gap that ALREADY exists
 *       between two other neighbours in the row, wherever in the row it is.
 * A candidate that would land the rect ON another object is dropped: an
 * equal gap that is negative is an overlap, not a spacing, and the
 * "existing gap" between L and R itself would otherwise push the rect
 * through R. Smallest |delta| within the threshold wins; on a tie the
 * centred candidate (found first) does.
 */
function spacingPlan(rect: WorldRect, others: readonly WorldRect[], threshold: number, ax: Ax, gapGrid?: number): SpacingPlan | null {
  const row: WorldRect[] = []
  for (const o of others) if (o.id !== rect.id && crossOverlap(o, rect, ax) > 0) row.push(o)
  if (row.length === 0) return null
  const pos = ax.pos(rect)
  const size = ax.size(rect)
  const end = pos + size
  let hasL = false
  let hasR = false
  let lEnd = -Infinity
  let rStart = Infinity
  for (const o of row) {
    const s = ax.pos(o)
    const e = s + ax.size(o)
    if (e <= pos && e > lEnd) { hasL = true; lEnd = e }
    if (s >= end && s < rStart) { hasR = true; rStart = s }
  }
  const cands: { delta: number; gap: number }[] = []
  const consider = (target: number, gap: number): void => {
    const delta = target - pos
    if (!(Math.abs(delta) <= threshold)) return
    if (overlapsAnyOnAxis(row, target, size, ax)) return
    cands.push({ delta, gap })
  }
  if (hasL && hasR) {
    const g = (rStart - lEnd - size) / 2
    if (g > 0) consider(lEnd + g, g)
  }
  if (hasL || hasR) {
    const seen = new Set<number>()
    for (const p of gapPairs(row, ax)) {
      if (seen.has(p.gap)) continue
      seen.add(p.gap)
      if (hasL) consider(lEnd + p.gap, p.gap)
      if (hasR) consider(rStart - p.gap - size, p.gap)
    }
  }
  // M443. A 24px gap to the nearest neighbour, competing by the same
  // smallest-|delta| rule. Far from that gap it loses to the threshold.
  if (gapGrid !== undefined && gapGrid > 0) {
    if (hasL) consider(lEnd + gapGrid, gapGrid)
    if (hasR) consider(rStart - gapGrid - size, gapGrid)
  }
  let best: { delta: number; gap: number } | null = null
  for (const c of cands) if (best === null || Math.abs(c.delta) < Math.abs(best.delta)) best = c
  return best === null ? null : { delta: best.delta, gap: best.gap, row }
}

/**
 * The cue for a chosen plan: every gap in the row-plus-rect that now reads
 * the same number, not only the two the rect made. `at` is the middle of the
 * two objects' shared cross span. `moved` is the rect at its snapped
 * position on THIS axis but its input position on the other: the row was
 * chosen on the input, and a cross-axis snap of a few units must not be able
 * to lose the very gap this guide exists to show.
 */
function spacingGuide(plan: SpacingPlan, moved: WorldRect, ax: Ax): SpacingGuide {
  const label = Math.round(plan.gap)
  const segments: SpacingSegment[] = []
  for (const p of gapPairs([...plan.row, moved], ax)) {
    if (Math.round(p.gap) !== label) continue
    const lo = Math.max(ax.cpos(p.a), ax.cpos(p.b))
    const hi = Math.min(ax.cpos(p.a) + ax.csize(p.a), ax.cpos(p.b) + ax.csize(p.b))
    segments.push({ from: ax.pos(p.a) + ax.size(p.a), to: ax.pos(p.b), at: (lo + hi) / 2 })
  }
  return { axis: ax.name, gap: label, segments }
}

export interface SpacingSnapOptions {
  /** A resize never snaps to equal spacing: it has no gap of its own to equalise. */
  resize?: { growsX: boolean; growsY: boolean }
}
export interface SpacingSnapResult { dx: number; dy: number; guides: SpacingGuide[] }

/**
 * FigJam/Figma-style equal-spacing snap for a MOVE. Horizontal spacing looks
 * at the objects that share a ROW with `rect` (their y-ranges overlap its),
 * vertical spacing at those that share a COLUMN — an object in another row
 * has no gap to `rect` that a person could see, so it must not attract it.
 * Returns the correction and one guide per axis that snapped. A resize
 * returns nothing: the same rule as M50's, that only a move has a position to
 * correct on the far side.
 */
export function spacingSnap(rect: WorldRect, others: readonly WorldRect[], threshold: number, opts: SpacingSnapOptions = {}): SpacingSnapResult {
  if (opts.resize) return { dx: 0, dy: 0, guides: [] }
  const px = spacingPlan(rect, others, threshold, AX_X)
  const py = spacingPlan(rect, others, threshold, AX_Y)
  const guides: SpacingGuide[] = []
  if (px) guides.push(spacingGuide(px, { ...rect, x: rect.x + px.delta }, AX_X))
  if (py) guides.push(spacingGuide(py, { ...rect, y: rect.y + py.delta }, AX_Y))
  return { dx: px ? px.delta : 0, dy: py ? py.delta : 0, guides }
}

/* ------------------------------------------------------------------ */
/* Grid                                                                */
/* ------------------------------------------------------------------ */

/** The size floor for a resize — the PANEL floor; a shape passes a smaller one. */
const PANEL_MIN = { w: MIN_PANEL_W, h: MIN_PANEL_H }

/** `+ 0` turns -0 into 0: a rounded -0.3 must not put a "-0" in a saved layout. */
function roundTo(v: number, grid: number): number {
  return Math.round(v / grid) * grid + 0
}

/**
 * The far edge of a resize on the grid. The EDGE is what lands on a grid
 * line, not the width (the origin corner is where the person's other hand is,
 * and may be off-grid). If the nearest line would leave the size under the
 * floor, the first line at or above the floor is used instead: a snap never
 * produces a rect the validator rejects, and the size sticks on a grid line
 * rather than passing through the floor.
 */
function gridEdge(start: number, len: number, grid: number, minLen: number): number {
  const w = roundTo(start + len, grid) - start
  return w >= minLen ? w : Math.ceil((start + minLen) / grid) * grid - start
}

export interface GridSnapOptions {
  resize?: { growsX: boolean; growsY: boolean }
  min?: { w: number; h: number }
}

/**
 * Snap to a grid. A move rounds x and y; a resize rounds only the growing
 * right/bottom edge, never under `min`. A grid that is not a positive number
 * changes nothing (a caller passing 0 for "off" gets its rect back).
 */
export function gridSnap(rect: WorldRect, grid: number, opts: GridSnapOptions = {}): WorldRect {
  if (!(grid > 0)) return { ...rect }
  const min = opts.min ?? PANEL_MIN
  const r = opts.resize
  if (r) {
    return {
      ...rect,
      w: r.growsX ? gridEdge(rect.x, rect.w, grid, min.w) : rect.w,
      h: r.growsY ? gridEdge(rect.y, rect.h, grid, min.h) : rect.h
    }
  }
  return { ...rect, x: roundTo(rect.x, grid), y: roundTo(rect.y, grid) }
}

/* ------------------------------------------------------------------ */
/* The one snap                                                        */
/* ------------------------------------------------------------------ */

export interface SmartSnapOptions {
  resize?: { growsX: boolean; growsY: boolean }
  /** World units; a positive number turns the grid on, null/absent leaves it off. */
  grid?: number | null
  /** Equal-spacing guides on a move. On unless it is `false`. */
  spacing?: boolean
  /**
   * M443. A gap of this many world units is a candidate, beside the centred
   * and rhythm gaps. Absent leaves those two families alone, so a caller
   * that never asked (the flowchart) does not start snapping to 24.
   */
  gapGrid?: number | null
  /** The floor for a resize; the panel floor unless a shape passes a smaller one. */
  min?: { w: number; h: number }
  /**
   * M402. World units a rect paints ABOVE its top edge (a live terminal's rim
   * name, panels.ts's `occupiedRect`), by id. Only the STACKING pairs read it
   * — my top on your bottom, my bottom on your top — so a terminal stacked
   * under another lands its name clear of the upper one's bottom row, while
   * top-to-top alignment still lines up the FRAMES a person sees.
   */
  rimOf?: (id: string) => number
}
export interface SmartSnapResult { rect: WorldRect; guides: SnapGuide[]; spacing: SpacingGuide[] }

interface AlignCand { delta: number; at: number; from: number; to: number }

/** left, right, centre — the order snapRect tries them in, so a tie resolves identically. */
function edgeAt(start: number, len: number, k: number): number {
  return k === 0 ? start : k === 1 ? start + len : start + len / 2
}

/**
 * Edge and centre alignment, per axis — the M50 rule (snapRect): a move
 * snaps its left, right or centre to any other's; a resize only its growing
 * far edge. Reimplemented rather than called because snapRect refuses a
 * resize against a HARD-CODED panel floor and picks the nearest candidate
 * BEFORE checking it, so a shape (whose floor is smaller) would lose valid
 * snaps and a panel would lose the next-nearest one when the nearest is
 * refused. Here a candidate that would put the size under `min` is not a
 * candidate at all. scripts/flowchart-checks/arrange.cjs pins that, away
 * from the floor, this and snapRect give the same rect and guides.
 */
function alignCandidates(
  rect: WorldRect,
  others: readonly WorldRect[],
  threshold: number,
  resize: { growsX: boolean; growsY: boolean } | undefined,
  min: { w: number; h: number },
  rimOf: (id: string) => number = () => 0
): { x: AlignCand | null; y: AlignCand | null } {
  let bx: AlignCand | null = null
  let by: AlignCand | null = null
  const nMineX = resize ? (resize.growsX ? 1 : 0) : 3
  const nMineY = resize ? (resize.growsY ? 1 : 0) : 3
  for (const o of others) {
    if (o.id === rect.id) continue
    for (let i = 0; i < nMineX; i++) {
      const mine = resize ? rect.x + rect.w : edgeAt(rect.x, rect.w, i)
      for (let k = 0; k < 3; k++) {
        const at = edgeAt(o.x, o.w, k)
        const delta = at - mine
        const a = Math.abs(delta)
        if (a > threshold || (bx !== null && a >= Math.abs(bx.delta))) continue
        if (resize && rect.w + delta < min.w) continue
        bx = { delta, at, from: Math.min(rect.y, o.y), to: Math.max(rect.y + rect.h, o.y + o.h) }
      }
    }
    for (let i = 0; i < nMineY; i++) {
      const mine = resize ? rect.y + rect.h : edgeAt(rect.y, rect.h, i)
      const mineIsBottom = resize !== undefined || i === 1
      for (let k = 0; k < 3; k++) {
        const at = edgeAt(o.y, o.h, k)
        // M402. A stacking pair keeps the upper edge's rim clear: my top
        // stops my rim below your bottom, my bottom stops at your rim.
        const rim = !mineIsBottom && i === 0 && k === 1 ? rimOf(rect.id) : mineIsBottom && k === 0 ? -rimOf(o.id) : 0
        const delta = at + rim - mine
        const a = Math.abs(delta)
        if (a > threshold || (by !== null && a >= Math.abs(by.delta))) continue
        if (resize && rect.h + delta < min.h) continue
        by = { delta, at, from: Math.min(rect.x, o.x), to: Math.max(rect.x + rect.w, o.x + o.w) }
      }
    }
  }
  return { x: bx, y: by }
}

/**
 * THE snap the canvas calls instead of snapRect. Per axis, the candidate with
 * the smallest |delta| among edge/centre alignment and (on a move) equal
 * spacing; an ALIGNMENT wins an exact tie, because a line the eye can follow
 * is the stronger cue than a number. The grid (when `grid` is a number)
 * applies to an axis ONLY when neither of the others is in reach on it —
 * otherwise a grid line a few units from a neighbour's edge would beat the
 * neighbour and objects would never line up with each other again.
 * Guides come back only for the snaps actually applied, and a resize never
 * comes back under `min`.
 *
 * Both axes are judged against the INPUT rect (an x snap cannot change which
 * row a rect is in for the y decision), the same as snapRect.
 */
export function smartSnap(rect: WorldRect, others: readonly WorldRect[], threshold: number, opts: SmartSnapOptions = {}): SmartSnapResult {
  const resize = opts.resize
  const min = opts.min ?? PANEL_MIN
  const grid = opts.grid !== undefined && opts.grid !== null && opts.grid > 0 ? opts.grid : null
  const align = alignCandidates(rect, others, threshold, resize, min, opts.rimOf)
  const useSpacing = !resize && opts.spacing !== false
  const gapGrid = opts.gapGrid !== undefined && opts.gapGrid !== null && opts.gapGrid > 0 ? opts.gapGrid : undefined
  const px = useSpacing ? spacingPlan(rect, others, threshold, AX_X, gapGrid) : null
  const py = useSpacing ? spacingPlan(rect, others, threshold, AX_Y, gapGrid) : null
  const spaceX = px !== null && (align.x === null || Math.abs(px.delta) < Math.abs(align.x.delta))
  const spaceY = py !== null && (align.y === null || Math.abs(py.delta) < Math.abs(align.y.delta))

  const guides: SnapGuide[] = []
  const spacing: SpacingGuide[] = []
  let out: WorldRect = { ...rect }

  if (spaceX && px) {
    out = { ...out, x: rect.x + px.delta }
    spacing.push(spacingGuide(px, out, AX_X))
  } else if (align.x) {
    out = resize ? { ...out, w: rect.w + align.x.delta } : { ...out, x: rect.x + align.x.delta }
    guides.push({ axis: 'x', at: align.x.at, from: align.x.from, to: align.x.to })
  } else if (grid !== null) {
    if (!resize) out = { ...out, x: roundTo(rect.x, grid) }
    else if (resize.growsX) out = { ...out, w: gridEdge(rect.x, rect.w, grid, min.w) }
  }

  if (spaceY && py) {
    // The guide is built from the rect at its snapped y and its INPUT x:
    // the column was chosen on the input, and an x snap of a few units
    // must not be able to lose the very gap this guide exists to show.
    out = { ...out, y: rect.y + py.delta }
    spacing.push(spacingGuide(py, { ...rect, y: out.y }, AX_Y))
  } else if (align.y) {
    out = resize ? { ...out, h: rect.h + align.y.delta } : { ...out, y: rect.y + align.y.delta }
    guides.push({ axis: 'y', at: align.y.at, from: align.y.from, to: align.y.to })
  } else if (grid !== null) {
    if (!resize) out = { ...out, y: roundTo(rect.y, grid) }
    else if (resize.growsY) out = { ...out, h: gridEdge(rect.y, rect.h, grid, min.h) }
  }

  return { rect: out, guides, spacing }
}
