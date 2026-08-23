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
