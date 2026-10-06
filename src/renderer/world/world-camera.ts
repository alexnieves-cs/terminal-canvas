/**
 * The room's camera (M451). Pure: no three.js, no React, no DOM.
 *
 * Fit aims at the centre of the terrace bounds. The opening Fit aimed at the
 * slab origin, so a room whose terraces do not sit on that origin landed
 * off-centre and nothing reported it (CONCEPT.md, "Fit room sits off-centre").
 * Zoom keeps the floor point under the cursor. Scroll and a trackpad pinch
 * share one factor: a pinch arrives as a wheel with `ctrlKey` set.
 *
 * Pitch is `world-space`'s. The tier scales and the hysteresis band are the
 * same numbers as `zoom-tier`, copied here: `world.ctx.door.1` lets only the
 * publisher import a canvas module, and `zoom-tier` is frozen. `rd-world.pose.1`
 * fails if the copy drifts.
 */

import type { CameraPose, FloorPoint, ZoomTier } from '@shared/redesign-contracts'
import {
  cameraToViewport,
  canvasToFloor,
  floorToCanvas,
  FLOOR_SCALE,
  TIER_PITCH,
  viewportToCamera,
  type CanvasSize,
  type CanvasViewport
} from '@shared/world-space'

/**
 * Where ⌘1 / ⌘2 / ⌘3 put the scale. Must stay equal to `TIER_TARGET`
 * (work 1, plan 0.34, map 0.18).
 */
export const TIER_SCALE: Record<ZoomTier, number> = {
  work: 1,
  plan: 0.34,
  map: 0.18
}

// Thousandths, matching `tierFor`. 0.70 ± 0.03 is 670 and 730, not a residue.
const WORK_NOMINAL = 700
const PLAN_NOMINAL = 250
const WORK_LEAVE = 670
const WORK_ENTER = 730
const PLAN_LEAVE = 220
const PLAN_ENTER = 280

function milli(scale: number): number {
  return Math.round(scale * 1000)
}

function nominalTier(scale: number): ZoomTier {
  const m = milli(scale)
  if (m >= WORK_NOMINAL) return 'work'
  if (m >= PLAN_NOMINAL) return 'plan'
  return 'map'
}

/**
 * The tier at `scale`, given the tier already showing. Same band as `tierFor`:
 * inside it the current tier stands, and a jump that skips a tier takes the
 * nominal answer. A non-finite scale keeps `prev`, or Map.
 */
export function tierAt(scale: number, prev?: ZoomTier): ZoomTier {
  if (!Number.isFinite(scale)) return prev ?? 'map'
  const next = nominalTier(scale)
  if (prev === undefined || prev === next) return next
  const m = milli(scale)
  const acrossWork = (prev === 'work' && next === 'plan') || (prev === 'plan' && next === 'work')
  if (acrossWork && m >= WORK_LEAVE && m < WORK_ENTER) return prev
  const acrossPlan = (prev === 'plan' && next === 'map') || (prev === 'map' && next === 'plan')
  if (acrossPlan && m >= PLAN_LEAVE && m < PLAN_ENTER) return prev
  return next
}

export interface FloorBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface ScreenPoint {
  x: number
  y: number
}

export interface WorldCamera {
  target: FloorPoint
  /** World units from the target. */
  distance: number
  /** Radians down from the horizon. Same meaning as `CameraPose.pitch`. */
  pitch: number
  /** Radians about Y. 0 looks toward +z. */
  azimuth: number
  tier: ZoomTier
}

/** Radians of azimuth/pitch per pixel of drag. */
export const ORBIT_SPEED = 0.005

/** One wheel notch, or one pinch step. Greater than 1 zooms in. */
export const WHEEL_ZOOM = 1.08

export function boundsCenter(bounds: FloorBounds): FloorPoint {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2
  }
}

/** A box around the points, grown by `pad` world units. Null when there is nothing to frame. */
export function boundsOf(points: readonly FloorPoint[], pad = 1): FloorBounds | null {
  if (points.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  if (!Number.isFinite(minX)) return null
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad }
}

export function toPose(cam: WorldCamera): CameraPose {
  return { tier: cam.tier, target: cam.target, distance: cam.distance, pitch: cam.pitch }
}

function finiteSize(size: CanvasSize): CanvasSize {
  return {
    width: Number.isFinite(size.width) && size.width > 0 ? size.width : 1,
    height: Number.isFinite(size.height) && size.height > 0 ? size.height : 1
  }
}

function fromPose(pose: CameraPose, azimuth: number): WorldCamera {
  return {
    target: pose.target,
    distance: pose.distance,
    pitch: pose.pitch,
    azimuth,
    tier: pose.tier
  }
}

/**
 * Frame `bounds` at `tier`'s pitch, aimed at their centre. `margin` is the
 * share of the viewport the bounds may fill, so a terrace does not sit on
 * the glass edge.
 */
export function fitRoom(bounds: FloorBounds, size: CanvasSize, tier: ZoomTier = 'map', margin = 0.9): WorldCamera {
  const box = finiteSize(size)
  const target = boundsCenter(bounds)
  const spanX = Math.max(1e-3, bounds.maxX - bounds.minX)
  const spanZ = Math.max(1e-3, bounds.maxZ - bounds.minZ)
  const raw = Math.min(box.width / (spanX * FLOOR_SCALE), box.height / (spanZ * FLOOR_SCALE)) * margin
  const scale = Number.isFinite(raw) && raw > 0 ? raw : 1
  const center = floorToCanvas(target)
  const pose = viewportToCamera({
    scale,
    x: box.width / 2 - center.x * scale,
    y: box.height / 2 - center.y * scale
  }, box, tier)
  return fromPose(pose, 0)
}

export function floorToScreen(cam: WorldCamera, size: CanvasSize, floor: FloorPoint): ScreenPoint {
  const box = finiteSize(size)
  const vp = cameraToViewport(toPose(cam), box)
  const canvas = floorToCanvas(floor)
  return { x: vp.x + canvas.x * vp.scale, y: vp.y + canvas.y * vp.scale }
}

export function screenToFloor(cam: WorldCamera, size: CanvasSize, screen: ScreenPoint): FloorPoint {
  const box = finiteSize(size)
  const vp = cameraToViewport(toPose(cam), box)
  const scale = vp.scale === 0 ? 1 : vp.scale
  return canvasToFloor({ x: (screen.x - vp.x) / scale, y: (screen.y - vp.y) / scale })
}

/**
 * Multiply the scale by `factor` (>1 zooms in) and move the target so the
 * floor point under `cursor` stays under `cursor`. The tier follows the
 * scale, with the same hysteresis `tierAt` copies from the canvas.
 */
export function zoomToCursor(cam: WorldCamera, size: CanvasSize, cursor: ScreenPoint, factor: number): WorldCamera {
  const box = finiteSize(size)
  const safe = Number.isFinite(factor) && factor > 0 ? factor : 1
  const before = screenToFloor(cam, box, cursor)
  const vp = cameraToViewport(toPose(cam), box)
  const scale = vp.scale * safe
  const canvas = floorToCanvas(before)
  const pose = viewportToCamera({
    scale,
    x: cursor.x - canvas.x * scale,
    y: cursor.y - canvas.y * scale
  }, box, tierAt(scale, cam.tier))
  return fromPose(pose, cam.azimuth)
}

/**
 * The scale factor for one wheel notch. A pinch arrives as a wheel event
 * with `ctrlKey` set and takes the same step — the flag is the caller's
 * proof it did not invent a second curve.
 */
export function wheelFactor(deltaY: number, ctrlKey: boolean): number {
  void ctrlKey
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1
  return deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM
}

/** ⌘1 / ⌘2 / ⌘3. The target stays; the pitch and the scale are the tier's. */
export function tierPose(tier: ZoomTier, target: FloorPoint, size: CanvasSize, azimuth = -0.62): WorldCamera {
  const box = finiteSize(size)
  const scale = TIER_SCALE[tier]
  const center = floorToCanvas(target)
  const pose = viewportToCamera({
    scale,
    x: box.width / 2 - center.x * scale,
    y: box.height / 2 - center.y * scale
  }, box, tier)
  // `viewportToCamera` already takes the tier's pitch. Restate it so a later
  // edit to that function cannot leave a tier pose on the previous pitch.
  return { ...fromPose(pose, azimuth), pitch: TIER_PITCH[tier], tier }
}

/** Drag. The target stays; the view turns around it. Pitch stays inside the tier range. */
export function orbitBy(cam: WorldCamera, dx: number, dy: number): WorldCamera {
  const lo = TIER_PITCH.work * 0.5
  const hi = TIER_PITCH.map
  const pitch = Math.min(hi, Math.max(lo, cam.pitch - dy * ORBIT_SPEED))
  return { ...cam, azimuth: cam.azimuth - dx * ORBIT_SPEED, pitch }
}

/**
 * Shift-drag. The target slides across the floor by the drag, in canvas
 * pixels at the current scale, so the point under the cursor travels with
 * the pointer.
 */
export function panBy(cam: WorldCamera, dx: number, dy: number, size: CanvasSize): WorldCamera {
  const box = finiteSize(size)
  const vp = cameraToViewport(toPose(cam), box)
  const scale = vp.scale || 1
  const shift = canvasToFloor({ x: -dx / scale, y: -dy / scale })
  return { ...cam, target: { x: cam.target.x + shift.x, z: cam.target.z + shift.z } }
}

/** F. Work tier, aimed at the agent, keeping the side the camera is already on. */
export function followAgent(cam: WorldCamera, agent: FloorPoint, size: CanvasSize): WorldCamera {
  return tierPose('work', agent, size, cam.azimuth)
}

/** The 2D viewport that frames this pose, so ⌘⇧W can land on the same spot. */
export function backTo2d(cam: WorldCamera, size: CanvasSize): CanvasViewport {
  return cameraToViewport(toPose(cam), finiteSize(size))
}

/**
 * The four floor corners of the viewport, for a plan wedge. `MinimapOverlay`
 * does not draw this yet (R-060); the room's own map uses `cameraWedge`.
 */
export function cameraFootprint(cam: WorldCamera, size: CanvasSize): FloorPoint[] {
  const box = finiteSize(size)
  return [
    screenToFloor(cam, box, { x: 0, y: 0 }),
    screenToFloor(cam, box, { x: box.width, y: 0 }),
    screenToFloor(cam, box, { x: box.width, y: box.height }),
    screenToFloor(cam, box, { x: 0, y: box.height })
  ]
}
