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
  return {
    scale: vp.scale,
    x: size.width / 2 - world.x * vp.scale,
    y: size.height / 2 - world.y * vp.scale
  }
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
