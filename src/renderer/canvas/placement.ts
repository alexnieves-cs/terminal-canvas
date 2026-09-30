import { MIN_PANEL_H, MIN_PANEL_W } from '@shared/panel-geometry'
import { fitTo, READABLE_SCALE, type Point, type WorldRect } from './viewport'

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
 *
 * M395 (live audit P1 #9). TO THE VIEW'S SHAPE. Given `opts.view` (the canvas
 * host's size in screen pixels), an arrangement that would be a STRIP — wider
 * than the view's own aspect and framing below READABLE_SCALE — is re-flowed:
 * the panels, in the reading order the rows give them (top to bottom, left to
 * right), fill lines left to right and wrap at a row-width target, the way
 * text wraps. The target is the one whose flow frames LARGEST in the view —
 * the total area at the view's aspect, measured over the candidate widths
 * rather than estimated — so 22 panels become a block, not the three-row
 * strip the audit found readable only at 11%. Nothing is reordered (the
 * sequence is the rows' own) and nothing resized. A set that already frames
 * readably, or is not wider than the view, is left exactly as the rows pack
 * it (three panels stay a row), and the flow is taken only when it frames
 * larger. Still idempotent: a flowed arrangement's rows ARE its lines, in the
 * same sequence with the same sizes, so a second tidy measures the same
 * candidates and lands on the same lines.
 */
export function tidyPanels<T extends WorldRect>(rects: readonly T[], gap: number = TIDY_GAP, opts: { view?: { width: number; height: number } } = {}): T[] {
  if (rects.length === 0) return []
  const { placed: natural, sequence } = packRows(rects, gap)
  const view = opts.view
  if (view === undefined || !(view.width > 0) || !(view.height > 0)) return natural
  const scaleOf = (rs: readonly WorldRect[]): number => fitTo([...rs], view).scale
  const naturalScale = scaleOf(natural)
  const box = boundsOfRects(natural)
  if (naturalScale >= READABLE_SCALE || box.w / box.h <= view.width / view.height) return natural
  // Candidate line widths: every prefix of the sequence (where a line could
  // break) and the area target, never narrower than the widest panel.
  const widest = Math.max(...rects.map((r) => r.w))
  const area = rects.reduce((sum, r) => sum + (r.w + gap) * (r.h + gap), 0)
  const candidates = new Set<number>([Math.max(widest, Math.sqrt(area * (view.width / view.height)))])
  let run = -gap
  for (const r of sequence) { run += r.w + gap; if (run >= widest) candidates.add(run) }
  let best: { placed: T[]; scale: number } | null = null
  for (const width of [...candidates].sort((a, b) => a - b)) {
    const placed = flow(rects, sequence, gap, width)
    const scale = scaleOf(placed)
    if (best === null || scale > best.scale + 1e-9) best = { placed, scale }
  }
  return best !== null && best.scale > naturalScale + 1e-9 ? best.placed : natural
}

function boundsOfRects(rs: readonly WorldRect[]): { w: number; h: number } {
  const minX = Math.min(...rs.map((r) => r.x)), maxX = Math.max(...rs.map((r) => r.x + r.w))
  const minY = Math.min(...rs.map((r) => r.y)), maxY = Math.max(...rs.map((r) => r.y + r.h))
  return { w: maxX - minX, h: maxY - minY }
}

/** Tidy's packer: rows by overlap, each packed left to right. Returns the placement and the reading-order sequence. */
function packRows<T extends WorldRect>(rects: readonly T[], gap: number): { placed: T[]; sequence: T[] } {
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
  const at = new Map<string, { x: number; y: number }>()
  const sequence: T[] = []
  let y = originY
  for (const row of rows) {
    row.sort((a, b) => (a.x + a.w / 2) - (b.x + b.w / 2))
    let x = originX
    let tallest = 0
    for (const r of row) {
      at.set(r.id, { x, y })
      sequence.push(r)
      x += r.w + gap
      tallest = Math.max(tallest, r.h)
    }
    y += tallest + gap
  }
  return { placed: place(rects, at), sequence }
}

/** The sequence in lines of at most `width` world units from the origin (a panel wider than that gets a line of its own). */
function flow<T extends WorldRect>(rects: readonly T[], sequence: readonly T[], gap: number, width: number): T[] {
  const originX = Math.min(...rects.map((r) => r.x))
  const originY = Math.min(...rects.map((r) => r.y))
  const at = new Map<string, { x: number; y: number }>()
  let x = originX, y = originY, tallest = 0
  for (const r of sequence) {
    if (x > originX && x + r.w - originX > width + 1e-9) { y += tallest + gap; x = originX; tallest = 0 }
    at.set(r.id, { x, y })
    x += r.w + gap
    tallest = Math.max(tallest, r.h)
  }
  return place(rects, at)
}

/** The input's order, each rect at its placed point (the panel array is paint-stable and must not move). */
function place<T extends WorldRect>(rects: readonly T[], at: ReadonlyMap<string, { x: number; y: number }>): T[] {
  return rects.map((r) => {
    const p = at.get(r.id)
    return p === undefined ? r : { ...r, x: p.x, y: p.y }
  })
}

/** M395. The gap a new object keeps from everything around it, in world units (tidy's). */
export const FREE_GAP = TIDY_GAP
/** M395. The search grid's pitch, in world units. */
export const FREE_STEP = 24

/**
 * M395 (live audit P1 #5). WHERE A NEW AUTHORED OBJECT GOES: the free spot
 * nearest `centre`. A sticky, a shape, a picture or a new file used to land on
 * whatever sat at the view's centre (the audit measured a free text covering
 * 53% of a sticky, a sticky covering the GitHub panel) because the only rule
 * was cascadeCentre's EXACT-centre test. This searches square rings of
 * `step` around `centre`, nearest (Euclidean) first, for a centre whose rect
 * of `size` clears every rect by `gap` and — when `within` is given (the
 * world the camera shows) — lies wholly inside it, so the object lands where
 * the person is looking or not at all: `null` means there is no free room in
 * view, and the caller falls back to its old point (overlapping is better
 * than appearing off-screen, where a new object reads as "nothing happened").
 *
 * M402 (B4): now under EVERY create door, a terminal's included, through
 * `placeNew` below — see there for why cascadeCentre's argument no longer
 * holds. Pure; called with the updater's own `current`, like the cascade.
 */
export function freeSpot(
  centre: Point,
  size: { w: number; h: number },
  rects: readonly { x: number; y: number; w: number; h: number }[],
  opts: { gap?: number; step?: number; within?: { x: number; y: number; w: number; h: number }; maxRings?: number } = {}
): Point | null {
  const gap = opts.gap ?? FREE_GAP
  // The pitch grows with the object (a quarter of its smaller side), so a
  // frame-sized object zoomed out does not test a thousand near-identical spots.
  const step = opts.step ?? Math.max(FREE_STEP, Math.min(size.w, size.h) / 4)
  const within = opts.within
  const halfW = size.w / 2, halfH = size.h / 2
  const fits = (c: Point): boolean => {
    const x = c.x - halfW, y = c.y - halfH
    if (within !== undefined && (x < within.x || y < within.y || x + size.w > within.x + within.w || y + size.h > within.y + within.h)) return false
    for (const r of rects) {
      if (x - gap < r.x + r.w && r.x < x + size.w + gap && y - gap < r.y + r.h && r.y < y + size.h + gap) return false
    }
    return true
  }
  // Far enough to reach the view's farthest corner from `centre`, or 80 rings.
  const maxRings = opts.maxRings ?? (within !== undefined
    ? Math.ceil(Math.max(Math.abs(centre.x - within.x), Math.abs(within.x + within.w - centre.x), Math.abs(centre.y - within.y), Math.abs(within.y + within.h - centre.y)) / step) + 1
    : 80)
  let best: { c: Point; d: number } | null = null
  const consider = (i: number, j: number): void => {
    const d = Math.hypot(i * step, j * step)
    if (best !== null && d >= best.d) return
    const c = { x: centre.x + i * step, y: centre.y + j * step }
    if (fits(c)) best = { c, d }
  }
  for (let k = 0; k <= maxRings; k++) {
    // Every point on ring k is at least k·step away: once the best found is
    // nearer than that, no later ring can beat it.
    if (best !== null && (best as { d: number }).d <= k * step) break
    if (k === 0) { consider(0, 0); continue }
    for (let i = -k; i <= k; i++) { consider(i, -k); consider(i, k) }
    for (let j = -k + 1; j <= k - 1; j++) { consider(-k, j); consider(k, j) }
  }
  return best === null ? null : (best as { c: Point }).c
}

/**
 * M402. Rings an anchored search walks before giving up (to the cascade). At
 * the pitch freeSpot derives from a review's size that is several thousand
 * world units — past any real canvas's crowd around one agent.
 */
export const ANCHOR_RINGS = 40

type Box = { x: number; y: number; w: number; h: number }

/**
 * M402 (B4). ONE PLACEMENT RULE FOR EVERY CREATE DOOR. The live critique found
 * the rule depended on the door: ⌘N, an opened file and ⌘K's New note
 * cascaded onto whatever was there, "+ Create" free-spotted the same file ⌘K
 * cascaded, and a new chat landed inside the starter's group frame. Now every
 * door asks here, inside its `setPanels` updater over `current`:
 *
 * - `anchored` (a review beside its agent): the free spot nearest `centre`,
 *   which the caller put beside the parent, WHEREVER the parent is — a parent
 *   off screen is the normal case for a review opened from the rail, and the
 *   caller flies there;
 * - otherwise the free spot nearest `centre` wholly IN VIEW and clear of the
 *   floating chrome (`within`, `chrome`), where the person is looking; and
 *   when the view has no room, the nearest free spot anywhere — the caller
 *   flies there too.
 *
 * `obstacles` are what the caller says the object must not land in: every
 * panel's OCCUPIED rect (a terminal's rim name included) and the frame of
 * every group the object does not belong to — a group's frame reaches 28 +
 * 34 world units past its members, more than the 24 gap, which is how a chat
 * came to land inside one. `null` only when nothing within reach is free; the
 * caller falls back to cascadeCentre, which is still the rule of last resort.
 *
 * Why ⌘N no longer keeps the centre (docs/load-bearing.md, "Cmd+N"): the
 * cascade tested only exact centres because an overlap rule "would step
 * nearly every press away from where the user is looking". That held while an
 * object off the view read as "nothing happened". Every create door now ends
 * with a flight to what it made (Canvas.tsx's reveal), so stepping away from
 * the centre is SEEN, and a new terminal no longer buries the one under it.
 */
export function placeNew(req: {
  size: { w: number; h: number }
  centre: Point
  anchored?: boolean
  obstacles: readonly Box[]
  chrome?: readonly Box[]
  within?: Box
}): Point | null {
  if (req.anchored === true) return freeSpot(req.centre, req.size, req.obstacles, { maxRings: ANCHOR_RINGS })
  if (req.within !== undefined) {
    const inView = freeSpot(req.centre, req.size, [...req.obstacles, ...(req.chrome ?? [])], { within: req.within })
    if (inView !== null) return inView
  }
  return freeSpot(req.centre, req.size, req.obstacles)
}
