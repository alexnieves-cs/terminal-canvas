/**
 * One spatial truth (M437). Pure: no three.js, no React, no DOM.
 *
 * The World is the canvas stood up. A canvas point becomes a floor point by
 * dividing by 100 — x stays x, y becomes z — and the camera that frames a
 * viewport is the same numbers run the other way. Both views call these
 * functions, so a terrace and its region cannot drift apart by being
 * converted twice, differently.
 *
 * Pitch is the angle down from the horizon, in radians. Work is close
 * (across the desk), Plan is the room's existing 34° look-down, Map is near
 * top-down and short of straight down so the floor still has a little depth.
 * `distance` is whatever makes this viewport's scale true at that pitch:
 * the round trip is an identity, not a second camera fitted by eye.
 */

import type { CameraPose, FloorPoint, ZoomTier } from './redesign-contracts'

/** Canvas pixels per floor unit. `canvasToFloor` divides by this. */
export const FLOOR_SCALE = 100

export interface CanvasPoint {
  x: number
  y: number
}

/** The world origin's position in canvas-local pixels, plus the scale. The same shape as `viewport.ts`. */
export interface CanvasViewport {
  x: number
  y: number
  scale: number
}

export interface CanvasSize {
  width: number
  height: number
}

/** Radians down from the horizon. */
export const TIER_PITCH: Record<ZoomTier, number> = {
  work: (18 * Math.PI) / 180,
  plan: (34 * Math.PI) / 180,
  map: (78 * Math.PI) / 180
}

export function canvasToFloor(p: CanvasPoint): FloorPoint {
  return { x: p.x / FLOOR_SCALE, z: p.y / FLOOR_SCALE }
}

export function floorToCanvas(p: FloorPoint): CanvasPoint {
  return { x: p.x * FLOOR_SCALE, y: p.z * FLOOR_SCALE }
}

function usableScale(scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

function usableSin(pitch: number): number {
  const sin = Math.sin(pitch)
  // A horizon look (sin 0) would put the camera infinitely far. No tier
  // asks for that; a bad pitch still returns a finite pose.
  return Math.abs(sin) < 1e-6 ? (sin < 0 ? -1e-6 : 1e-6) : sin
}

/**
 * The camera that frames `viewport` at `tier`'s pitch. The target is the
 * canvas point under the viewport's centre, on the floor. `size` is the
 * canvas in screen pixels — the same size `centreOn` takes.
 */
export function viewportToCamera(viewport: CanvasViewport, size: CanvasSize, tier: ZoomTier): CameraPose {
  const scale = usableScale(viewport.scale)
  const center = {
    x: (size.width / 2 - viewport.x) / scale,
    y: (size.height / 2 - viewport.y) / scale
  }
  const pitch = TIER_PITCH[tier]
  const distance = size.height / (scale * FLOOR_SCALE * usableSin(pitch))
  return { tier, target: canvasToFloor(center), distance, pitch }
}

/** The viewport whose centre and scale are `pose`. Inverse of `viewportToCamera`. */
export function cameraToViewport(pose: CameraPose, size: CanvasSize): CanvasViewport {
  const scale = size.height / (pose.distance * FLOOR_SCALE * usableSin(pose.pitch))
  const center = floorToCanvas(pose.target)
  return {
    scale,
    x: size.width / 2 - center.x * scale,
    y: size.height / 2 - center.y * scale
  }
}
