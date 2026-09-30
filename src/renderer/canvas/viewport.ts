/**
 * Canvas coordinate math. Deliberately free of DOM and React imports: the
 * whole point of M2 is that this arithmetic can be tested as arithmetic.
 *
 * `x`/`y` are the world origin's position in CANVAS-LOCAL pixels. Turning a
 * MouseEvent's client coordinates into canvas-local space belongs to the input
 * layer, not here.
 */

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/** The world origin's canvas-local position, plus the world-to-screen scale. */
export interface Viewport {
  x: number
  y: number
  scale: number
}

export interface WorldRect {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export const MIN_SCALE = 0.1
export const MAX_SCALE = 3

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function screenToWorld(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale }
}

export function worldToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y }
}

/**
 * Zoom about a canvas-local anchor, keeping the world point under that anchor
 * fixed.
 *
 * The clamp is applied BEFORE the translation is derived. Deriving translation
 * from a requested scale while applying a clamped one makes the canvas drift
 * sideways while appearing frozen — the bug you only notice after holding a
 * pinch at the limit.
 */
export function zoomAt(vp: Viewport, anchor: Point, factor: number): Viewport {
  if (!Number.isFinite(factor) || factor <= 0) return vp
  const scale = clampScale(vp.scale * factor)
  if (scale === vp.scale) return vp
  const world = screenToWorld(anchor, vp)
  return { scale, x: anchor.x - world.x * scale, y: anchor.y - world.y * scale }
}

/** dx/dy are SCREEN pixels: a drag moves content the same distance at any zoom. */
export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, x: vp.x + dx, y: vp.y + dy }
}

/**
 * The topmost rect containing the point, or null. Iterates in reverse so paint
 * order and pick order agree. Left/top edges are inclusive, right/bottom
 * exclusive, so adjacent rects never both claim a shared edge.
 */
export function hitTest(rects: WorldRect[], world: Point): string | null {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i]
    if (world.x >= r.x && world.x < r.x + r.w && world.y >= r.y && world.y < r.y + r.h) {
      return r.id
    }
  }
  return null
}

/**
 * Put one rect's centre in the middle of the viewport, at the CURRENT scale.
 *
 * Deliberately not a zoom: fitTo (Cmd+1) already exists for "show me
 * everything", and framing a panel by changing the scale would discard the
 * zoom level the user chose to work at.
 */
export function centreOn(vp: Viewport, rect: WorldRect, size: Size): Viewport {
  const world = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
  // M315. A panel LARGER than the canvas on an axis is aligned to its leading
  // edge (a margin in), never centred: centring a chat taller than the window
  // put its header — the title, the state, every control — off the top, so a
  // jump to it landed on a panel you could not identify or act on.
  const fitsX = rect.w * vp.scale <= size.width - CENTRE_MARGIN * 2
  const fitsY = rect.h * vp.scale <= size.height - CENTRE_MARGIN * 2
  return {
    scale: vp.scale,
    x: fitsX ? size.width / 2 - world.x * vp.scale : CENTRE_MARGIN - rect.x * vp.scale,
    y: fitsY ? size.height / 2 - world.y * vp.scale : CENTRE_MARGIN - rect.y * vp.scale
  }
}
/** M315. Screen pixels kept between the canvas edge and a panel too large to centre. */
export const CENTRE_MARGIN = 16

/**
 * M402 (B4). Where the camera goes to SHOW a new object: `null` when it is
 * already wholly in view at a readable scale (it appeared where the person is
 * looking, and a camera that moved anyway would take their place from them);
 * otherwise the object centred at a READABLE scale — the current one when it
 * already is, READABLE_SCALE when the camera is further out — and never so
 * close that the object does not fit (then its fit, whatever that reads at).
 * The caller passes the result through the safe area, keeping the scale.
 */
export function revealTarget(vp: Viewport, rect: WorldRect, size: Size): Viewport | null {
  const room = { w: size.width - 2 * CENTRE_MARGIN, h: size.height - 2 * CENTRE_MARGIN }
  if (!(room.w > 0) || !(room.h > 0) || !(rect.w > 0) || !(rect.h > 0)) return null
  const fits = Math.min(room.w / rect.w, room.h / rect.h)
  const scale = clampScale(Math.min(Math.max(vp.scale, READABLE_SCALE), fits))
  const tl = worldToScreen({ x: rect.x, y: rect.y }, vp)
  const inView = tl.x >= 0 && tl.y >= 0 && tl.x + rect.w * vp.scale <= size.width && tl.y + rect.h * vp.scale <= size.height
  if (inView && vp.scale >= Math.min(READABLE_SCALE, fits) - 1e-9) return null
  return centreOn({ ...vp, scale }, rect, size)
}

/** A canvas-local pixel rect — something painted OVER the canvas, not in the world. */
export interface ScreenRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Nudge a spawn point so a panel of `panel` screen size, centred on it, clears
 * the chrome floating over the canvas's right and bottom edges — the minimap
 * over the zoom pill, the command pill. A chat centred beneath that cluster put
 * its Send button under the minimap, so the one door a beginner needs was
 * covered (verify:panels:product onboarding.start.1).
 *
 * Each overlap moves the point along the CHEAPER axis (left or up), never so
 * far that the panel crosses the host's own left or top margin; when neither
 * axis has the room, it takes what room there is. A point already clear is
 * returned untouched, so placement elsewhere never drifts. Two passes, because
 * clearing one overlay can slide the panel into its neighbour.
 */
export function clearOfOverlays(centre: Point, panel: Size, obstacles: readonly ScreenRect[], margin = 16): Point {
  let c = { x: centre.x, y: centre.y }
  for (let pass = 0; pass < 2; pass++) {
    for (const o of obstacles) {
      const left = c.x - panel.width / 2
      const top = c.y - panel.height / 2
      const right = left + panel.width
      const bottom = top + panel.height
      if (right <= o.x - margin || left >= o.x + o.w + margin || bottom <= o.y - margin || top >= o.y + o.h + margin) continue
      const dx = o.x - margin - right
      const dy = o.y - margin - bottom
      const roomX = Math.max(0, left - margin)
      const roomY = Math.max(0, top - margin)
      const fitsX = -dx <= roomX
      const fitsY = -dy <= roomY
      if (fitsX && (!fitsY || -dx <= -dy)) c = { x: c.x + dx, y: c.y }
      else if (fitsY) c = { x: c.x, y: c.y + dy }
      else if (roomX >= roomY) c = { x: c.x - roomX, y: c.y }
      else c = { x: c.x, y: c.y - roomY }
    }
  }
  return c
}

/**
 * M395. Screen pixels a FRAMING keeps between its content and the floating
 * chrome. Smaller than `clearOfOverlays`' spawn margin on purpose: fitTo's
 * 64px margin already clears the HUD and the pill's rest (each ~54px off the
 * bottom edge) by about 10px, and a gap that flagged them would move every fit
 * on every canvas — only the minimap (and a drawer) reach far enough in to
 * matter, and those are what this exists for.
 */
export const FRAME_CLEAR_GAP = 8

function overlapsRect(a: ScreenRect, b: ScreenRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** The screen box `rects` occupy at camera `vp`. */
export function framedBox(rects: readonly { x: number; y: number; w: number; h: number }[], vp: Viewport): ScreenRect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h)
  }
  const tl = worldToScreen({ x: minX, y: minY }, vp)
  return { x: tl.x, y: tl.y, w: (maxX - minX) * vp.scale, h: (maxY - minY) * vp.scale }
}

/**
 * M395. LAND A FRAMING CLEAR OF THE CHROME. `target` is what a framing verb
 * asked for (fitTo, fitReadable, centreOn); `obstacles` are the surfaces
 * floating over the canvas in host-local screen pixels (the minimap, the HUD,
 * the pill's rest, a drawer over the canvas). A framing whose content already
 * clears every obstacle by `gap` is returned UNTOUCHED — the common case, and
 * the reason Fit stays idempotent and every existing fit check keeps its
 * numbers. Otherwise, in order:
 *
 * 1. The same scale, moved along the cheaper axis (`clearOfOverlays`, the
 *    spawn rule) — taken when it clears everything and stays inside the host.
 * 2. `keepScale` (centreOn's contract: framing a panel never discards the
 *    zoom the person chose) stops there with the best move it found.
 * 3. Otherwise the content is refitted into the LARGEST part of the host the
 *    obstacles leave: each obstacle that cuts the frame is cleared by moving
 *    one of the frame's four edges past it, every combination is tried (three
 *    to five obstacles, so at most a thousand tiny rects), and the frame that
 *    allows the largest scale wins — never zooming IN past `target`, so a
 *    fitReadable cap or a fit's own clamp survives.
 */
export function clearFraming(
  target: Viewport,
  rects: readonly { x: number; y: number; w: number; h: number }[],
  size: Size,
  obstacles: readonly ScreenRect[],
  opts: { keepScale?: boolean; margin?: number; gap?: number } = {}
): Viewport {
  const gap = opts.gap ?? FRAME_CLEAR_GAP
  const real = obstacles.filter((o) => o.w > 0 && o.h > 0)
  if (rects.length === 0 || real.length === 0) return target
  const blocks = real.map((o) => ({ x: o.x - gap, y: o.y - gap, w: o.w + 2 * gap, h: o.h + 2 * gap }))
  const hits = (b: ScreenRect): boolean => blocks.some((o) => overlapsRect(b, o))
  const box = framedBox(rects, target)
  if (!hits(box)) return target
  // 1. Move, same scale.
  const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
  const c = clearOfOverlays(centre, { width: box.w, height: box.h }, real, gap)
  const moved: Viewport = { scale: target.scale, x: target.x + (c.x - centre.x), y: target.y + (c.y - centre.y) }
  const mb = framedBox(rects, moved)
  const inside = mb.x >= 0 && mb.y >= 0 && mb.x + mb.w <= size.width && mb.y + mb.h <= size.height
  if (!hits(mb) && inside) return moved
  if (opts.keepScale === true) return moved
  // 3. Refit into the largest free frame.
  const frames = freeFrames(size, real, opts.margin ?? 64, gap)
  const bw = box.w / target.scale, bh = box.h / target.scale
  if (frames.length === 0 || !(bw > 0) || !(bh > 0)) return moved
  let best: { f: ScreenRect; s: number } | null = null
  for (const f of frames) {
    const s = Math.min(target.scale, clampScale(Math.min(f.w / bw, f.h / bh)))
    if (best === null || s > best.s + 1e-9 || (Math.abs(s - best.s) <= 1e-9 && f.w * f.h > best.f.w * best.f.h)) best = { f, s }
  }
  const { f, s } = best!
  const worldLeft = (box.x - target.x) / target.scale
  const worldTop = (box.y - target.y) / target.scale
  return {
    scale: s,
    x: f.x + f.w / 2 - (worldLeft + bw / 2) * s,
    y: f.y + f.h / 2 - (worldTop + bh / 2) * s
  }
}

/**
 * M395, named in M402. The frames of the host, inset by `margin`, that clear
 * every obstacle by `gap`: each obstacle that cuts a frame is cleared by
 * moving one of the frame's four edges past it, every combination kept
 * (three to five obstacles, so at most a thousand tiny rects).
 */
export function freeFrames(size: Size, obstacles: readonly ScreenRect[], margin: number, gap: number = FRAME_CLEAR_GAP): ScreenRect[] {
  const blocks = obstacles.filter((o) => o.w > 0 && o.h > 0).map((o) => ({ x: o.x - gap, y: o.y - gap, w: o.w + 2 * gap, h: o.h + 2 * gap }))
  let frames: ScreenRect[] = [{ x: margin, y: margin, w: size.width - 2 * margin, h: size.height - 2 * margin }]
  for (const o of blocks) {
    const next: ScreenRect[] = []
    for (const f of frames) {
      if (!overlapsRect(f, o)) { next.push(f); continue }
      const cuts: ScreenRect[] = [
        { ...f, w: o.x - f.x },
        { ...f, x: o.x + o.w, w: f.x + f.w - (o.x + o.w) },
        { ...f, h: o.y - f.y },
        { ...f, y: o.y + o.h, h: f.y + f.h - (o.y + o.h) }
      ]
      for (const g of cuts) if (g.w > 0 && g.h > 0) next.push(g)
    }
    frames = next
    if (frames.length > 1024) break
  }
  return frames
}

/**
 * The fourth camera verb (after resetViewport, worldCentre and centreOn),
 * factored out as pure math for the same reason those are: so the one fact
 * that separates it from centreOn — it sets the SCALE, because a workspace's
 * saved zoom is part of what it means to come back to it, where centreOn
 * deliberately leaves scale alone so framing a panel never discards the zoom
 * the user chose — is provable under plain node instead of taken on faith
 * from a useCallback body this tier cannot execute. There is no geometry to
 * compute; the whole contract is that nothing here is dropped or coerced.
 */
export function restoreCamera(camera: Viewport): Viewport {
  return { x: camera.x, y: camera.y, scale: camera.scale }
}

/**
 * How far inside the viewport edge a pip sits, in screen pixels. A pip drawn
 * exactly on the boundary is half clipped by the window.
 */
export const EDGE_INDICATOR_MARGIN = 24

/** A point on the viewport edge and the direction to draw an arrow at. */
export interface EdgeIndicator {
  x: number
  y: number
  /** Radians, `Math.atan2` convention: 0 points right, PI/2 points down. */
  angle: number
}

/**
 * Where to draw a pip pointing at `rect`, or null when it needs no pip.
 *
 * The visibility test is in SCREEN space, which is the whole reason this is
 * here and not in the component: `worldToScreen` folds in both the camera
 * translation and the scale, and an implementation that compares world
 * coordinates against a screen-sized box is correct only at scale 1 and
 * translation 0 — it then silently emits no pips at all when zoomed in, which
 * is indistinguishable from the feature not existing (verify:viewport 65).
 *
 * PARTIALLY visible counts as visible. A pip aimed at something already on
 * screen is noise on the one surface whose job is to be believed, and the
 * user can see the panel's own border for that (verify:viewport 57).
 */
export function edgeIndicator(
  rect: WorldRect,
  vp: Viewport,
  size: Size,
  margin = EDGE_INDICATOR_MARGIN
): EdgeIndicator | null {
  const topLeft = worldToScreen({ x: rect.x, y: rect.y }, vp)
  const bottomRight = worldToScreen({ x: rect.x + rect.w, y: rect.y + rect.h }, vp)
  const overlaps =
    bottomRight.x > 0 && topLeft.x < size.width &&
    bottomRight.y > 0 && topLeft.y < size.height
  if (overlaps) return null

  const centreX = size.width / 2
  const centreY = size.height / 2
  const dx = (topLeft.x + bottomRight.x) / 2 - centreX
  const dy = (topLeft.y + bottomRight.y) / 2 - centreY
  // Unreachable while the rect is off screen (a rect centred on the viewport
  // centre overlaps it), but a zero-length ray has no direction and would
  // emit NaN, so it is refused rather than divided by.
  if (dx === 0 && dy === 0) return null

  // Clip the ray from the viewport centre toward the panel against the inset
  // box, by finding the smaller of the two per-axis crossings. Clamping each
  // axis INDEPENDENTLY is the tempting shorthand and is wrong: it parks every
  // diagonal in the same corner, so direction stops carrying information
  // (verify:viewport 62).
  const halfW = Math.max(0, centreX - margin)
  const halfH = Math.max(0, centreY - margin)
  const tx = dx === 0 ? Infinity : halfW / Math.abs(dx)
  const ty = dy === 0 ? Infinity : halfH / Math.abs(dy)
  const t = Math.min(tx, ty)

  return { x: centreX + dx * t, y: centreY + dy * t, angle: Math.atan2(dy, dx) }
}

/** Largest clamped scale at which every rect fits with a margin, centred. */
export function fitTo(rects: WorldRect[], size: Size, margin = 64): Viewport {
  if (rects.length === 0) return { x: 0, y: 0, scale: 1 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }

  const boxW = maxX - minX
  const boxH = maxY - minY
  const availW = size.width - margin * 2
  const availH = size.height - margin * 2

  // A degenerate box or a canvas smaller than its own margins would divide by
  // zero or go negative; fall back to 100% rather than emitting NaN.
  const fits = boxW > 0 && boxH > 0 && availW > 0 && availH > 0
  const scale = fits ? clampScale(Math.min(availW / boxW, availH / boxH)) : 1

  const centreX = (minX + maxX) / 2
  const centreY = (minY + maxY) / 2
  return {
    scale,
    x: size.width / 2 - centreX * scale,
    y: size.height / 2 - centreY * scale
  }
}

/**
 * M395. The canvas host's size that `worldCentre` (the world point at the
 * host's centre) implies at camera `vp` — worldToScreen of that point IS the
 * host's centre. For a caller that holds only the narrow camera verbs (the
 * palette's actions) and must not grow a host ref or measure the window.
 */
export function viewSizeAround(centre: Point, vp: Viewport): Size {
  const c = worldToScreen(centre, vp)
  return { width: 2 * c.x, height: 2 * c.y }
}

/** Below this, a panel's body text is no longer comfortably read. */
export const READABLE_SCALE = 0.8

/**
 * The first start's framing: the new task, never the whole canvas, and READABLE.
 * `fitTo` alone zooms a lone card past 100% and, on a busy canvas or a small
 * window, below the point where the chat can be read. So: never above 1, and
 * when the rects together would need less than READABLE_SCALE, frame only
 * `focus` (the conversation the caret was just put in).
 */
export function fitReadable(rects: WorldRect[], focus: WorldRect | undefined, size: Size, margin = 64): Viewport {
  const atMost1 = (vp: Viewport, box: WorldRect[]): Viewport => vp.scale <= 1 ? vp : centreAt(box, size, 1)
  const all = fitTo(rects, size, margin)
  if (all.scale >= READABLE_SCALE || focus === undefined) return atMost1(all, rects)
  return atMost1(fitTo([focus], size, margin), [focus])
}

function centreAt(rects: WorldRect[], size: Size, scale: number): Viewport {
  const minX = Math.min(...rects.map((r) => r.x)); const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const minY = Math.min(...rects.map((r) => r.y)); const maxY = Math.max(...rects.map((r) => r.y + r.h))
  return { scale, x: size.width / 2 - ((minX + maxX) / 2) * scale, y: size.height / 2 - ((minY + maxY) / 2) * scale }
}

/**
 * M149. What `Zoom to fit` frames, as a pure decision over the SELECTION and
 * the canvas: the selected rects when any, every panel otherwise, and a reset
 * on an empty canvas (a verb that did nothing would read as broken). Kept
 * pure so the three arms are pinned under plain node (`fit.target.1`) rather
 * than only by the Electron `fit.1` — the Act II critic's point: `fit.sel.1`
 * exercised `fitTo` and never this choice.
 */
export type ZoomTarget = { kind: 'selection'; rects: WorldRect[] } | { kind: 'all' } | { kind: 'reset' }
export function zoomTarget(selectedIds: ReadonlySet<string>, all: readonly WorldRect[]): ZoomTarget {
  const rects = all.filter((r) => selectedIds.has(r.id))
  if (rects.length > 0) return { kind: 'selection', rects }
  if (all.length > 0) return { kind: 'all' }
  return { kind: 'reset' }
}

/**
 * M155. Ramer–Douglas–Peucker over a stroke's points: a point whose distance
 * from the chord between its neighbours' survivors is under `tolerance`
 * (world units) is dropped, so a slow hand does not store a thousand points
 * and a straight run keeps its two ends. Tolerance 0 keeps every point;
 * fewer than three points pass through untouched. Iterative, not recursive:
 * a long stroke is exactly the input that would blow a recursive stack.
 */
export function simplifyStroke(points: ReadonlyArray<readonly [number, number]>, tolerance: number): Array<[number, number]> {
  if (points.length < 3) return points.map((p) => [p[0], p[1]])
  const keep = new Uint8Array(points.length)
  keep[0] = 1; keep[points.length - 1] = 1
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [a, b] = stack.pop()!
    const ax = points[a]![0], ay = points[a]![1], bx = points[b]![0], by = points[b]![1]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let far = -1, farDist = tolerance
    for (let i = a + 1; i < b; i++) {
      const px = points[i]![0] - ax, py = points[i]![1] - ay
      // Distance from the CHORD (the segment, not the infinite line): a hook
      // that doubles back past an end is kept, not measured against a line
      // it never crossed.
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2))
      const ex = px - t * dx, ey = py - t * dy
      const d = Math.sqrt(ex * ex + ey * ey)
      if (d > farDist || (tolerance === 0 && d >= 0 && far === -1)) { far = i; farDist = d }
    }
    if (far !== -1 && (farDist > tolerance || tolerance === 0)) { keep[far] = 1; stack.push([a, far], [far, b]) }
  }
  const out: Array<[number, number]> = []
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push([points[i]![0], points[i]![1]])
  return out
}

/**
 * M395. INK, DRAWN AS A CURVE. A stroke is stored as the points `simplifyStroke`
 * kept, and painted as the uniform Catmull–Rom spline THROUGH them, each span
 * written as the cubic Bézier it equals: from p[i] to p[i+1] with controls
 * p[i] + (p[i+1] − p[i−1]) / 6 and p[i+1] − (p[i+2] − p[i]) / 6, the ends
 * repeated. The curve passes through every stored point and turns there with
 * ONE tangent (C1), so a scribble reads as a hand and not as the visible
 * corners a polyline of simplified points had (the M155 critic's "minor").
 *
 * RENDER ONLY: the points, their count and the layout record are unchanged —
 * this answers an SVG `d` and nothing else, and the hit path is drawn from the
 * same `d`, so a click lands on the curve a person sees. One point is a bare
 * move; two are a line. Two decimals, `pathOf`'s precision before it.
 */
export function smoothStrokePath(points: ReadonlyArray<readonly [number, number]>): string {
  const n = points.length
  if (n === 0) return ''
  const f = (v: number): string => v.toFixed(2)
  const at = (i: number): readonly [number, number] => points[Math.max(0, Math.min(n - 1, i))]!
  let d = `M${f(points[0]![0])} ${f(points[0]![1])}`
  if (n === 2) return `${d} L${f(points[1]![0])} ${f(points[1]![1])}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`
  }
  return d
}

/**
 * M256. The reading surface a document-focused file is shown at: at least
 * DOC_FOCUS_MIN, never smaller than the panel already is, and grown about the
 * panel's own CENTRE so the file widens in place rather than sliding right.
 * Pure and display-only — Canvas hands it to the one focused panel and never
 * writes it to the layout.
 */
export const DOC_FOCUS_MIN = { w: 920, h: 720 }
export function docFocusRect(rect: WorldRect): WorldRect {
  const w = Math.max(rect.w, DOC_FOCUS_MIN.w)
  const h = Math.max(rect.h, DOC_FOCUS_MIN.h)
  return { id: rect.id, x: rect.x - (w - rect.w) / 2, y: rect.y - (h - rect.h) / 2, w, h }
}
