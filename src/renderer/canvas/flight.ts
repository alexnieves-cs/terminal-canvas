/**
 * M56 — the camera's flights, as pure math.
 *
 * A discrete jump (centreOn, fitAll, reset, a bookmark, the trail) is tweened
 * through here; a continuous gesture (wheel, pinch, pan) never is. Two rules
 * that each fail silently if undone:
 *
 * - Scale interpolates in LOG space and is CLAMPED at every frame. A linear
 *   scale tween spends most of a 0.1→3 flight at high zoom and lurches; an
 *   unclamped intermediate feeds screenToWorld a scale the app never allows,
 *   which is verify:viewport check 3's sideways drift, mid-flight.
 * - Translation is chosen so the world point under the screen CENTRE moves
 *   in a straight line — interpolating x/y directly while scale changes
 *   makes the camera swing through an arc nobody asked for.
 *
 * No DOM, no React: verify:viewport runs this under plain node.
 */
import { clampScale, type Point, type Size, type Viewport } from './viewport'
import { CAMERA_MAX_MS, CAMERA_MIN_MS } from '../motion'

// Brief #21. Brief and legible: the camera tier of the one motion system.
export const FLIGHT_MIN_MS = CAMERA_MIN_MS
export const FLIGHT_MAX_MS = CAMERA_MAX_MS

export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
}

/** The world point that sits at screen `centre` under `vp`. */
const worldAtCentre = (vp: Viewport, centre: Point): Point => ({
  x: (centre.x - vp.x) / vp.scale,
  y: (centre.y - vp.y) / vp.scale
})

export function interpolateViewport(from: Viewport, to: Viewport, t: number, centre: Point = { x: 400, y: 300 }): Viewport {
  if (t <= 0) return { x: from.x, y: from.y, scale: from.scale }
  if (t >= 1) return { x: to.x, y: to.y, scale: to.scale }
  const scale = clampScale(Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * t))
  const a = worldAtCentre(from, centre)
  const b = worldAtCentre(to, centre)
  const w = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  return { x: centre.x - w.x * scale, y: centre.y - w.y * scale, scale }
}

/**
 * How long a flight takes: 0 under reduced motion or for no move at all,
 * else FLIGHT_MIN_MS..FLIGHT_MAX_MS by distance — measured in SCREEN units
 * at the destination scale, plus the zoom ratio, so a two-panel hop is
 * quick and a cross-canvas jump is legible rather than a blink.
 */
export function flightDuration(from: Viewport, to: Viewport, size: Size, reducedMotion: boolean): number {
  if (reducedMotion) return 0
  if (from.x === to.x && from.y === to.y && from.scale === to.scale) return 0
  const centre = { x: size.width / 2, y: size.height / 2 }
  const a = worldAtCentre(from, centre)
  const b = worldAtCentre(to, centre)
  const screenDistance = Math.hypot(b.x - a.x, b.y - a.y) * to.scale
  const zoomRatio = Math.abs(Math.log(to.scale / from.scale))
  const span = Math.max(1, Math.hypot(size.width, size.height))
  const amount = Math.min(1, screenDistance / (span * 2) + zoomRatio / 3)
  return Math.round(FLIGHT_MIN_MS + (FLIGHT_MAX_MS - FLIGHT_MIN_MS) * amount)
}
