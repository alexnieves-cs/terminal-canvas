/**
 * The floor texture, painted from the layout (M449). Pure: no three.js, no
 * React, no captured PNG. A panel's canvas pixel and the texel that stands
 * for it are the same point run through `world-space.ts`, so the 2D plan and
 * the floor agree at the hand-off frame.
 *
 * W2 mounts `paintPlanFloor` on the ground mesh. This module only builds the
 * pixels and the viewport the 2D camera takes when the move back settles.
 */

import type { ZoomTier } from '@shared/redesign-contracts'
import {
  FLOOR_SCALE, TIER_PITCH, cameraToViewport, canvasToFloor, floorToCanvas, viewportToCamera,
  type CanvasPoint, type CanvasSize, type CanvasViewport
} from '@shared/world-space'

export interface PlanRect {
  x: number
  y: number
  w: number
  h: number
}

export interface PlanLayout {
  regions: readonly PlanRect[]
  panels: readonly PlanRect[]
}

interface Rgba { r: number; g: number; b: number }

// Night ink and two neutrals. Not state colours: the floor is a map, and
// state stays on the objects that carry it.
const INK: Rgba = { r: 11, g: 13, b: 18 }
const REGION: Rgba = { r: 32, g: 36, b: 48 }
const PANEL: Rgba = { r: 78, g: 84, b: 98 }

function fill(data: Uint8ClampedArray, color: Rgba): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color.r
    data[i + 1] = color.g
    data[i + 2] = color.b
    data[i + 3] = 255
  }
}

function blit(data: Uint8ClampedArray, width: number, height: number, rect: PlanRect, color: Rgba): void {
  const x0 = Math.max(0, Math.floor(rect.x))
  const y0 = Math.max(0, Math.floor(rect.y))
  const x1 = Math.min(width, Math.ceil(rect.x + rect.w))
  const y1 = Math.min(height, Math.ceil(rect.y + rect.h))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4
      data[i] = color.r
      data[i + 1] = color.g
      data[i + 2] = color.b
      data[i + 3] = 255
    }
  }
}

/** RGBA pixels, row-major, one texel per canvas pixel of `size`. */
export function planFloorPixels(layout: PlanLayout, size: CanvasSize): Uint8ClampedArray {
  const width = Math.max(1, Math.round(size.width))
  const height = Math.max(1, Math.round(size.height))
  const data = new Uint8ClampedArray(width * height * 4)
  fill(data, INK)
  for (const region of layout.regions) blit(data, width, height, region, REGION)
  for (const panel of layout.panels) blit(data, width, height, panel, PANEL)
  return data
}

export interface PlanFloorContext {
  width: number
  height: number
  getContext(kind: '2d'): {
    createImageData(w: number, h: number): { data: Uint8ClampedArray }
    putImageData(image: { data: Uint8ClampedArray }, x: number, y: number): void
  } | null
}

/** Paint `layout` into a canvas. W2 calls this for the ground texture. */
export function paintPlanFloor(canvas: PlanFloorContext, layout: PlanLayout): void {
  const ctx = canvas.getContext('2d')
  if (ctx === null) return
  const pixels = planFloorPixels(layout, { width: canvas.width, height: canvas.height })
  const image = ctx.createImageData(canvas.width, canvas.height)
  image.data.set(pixels)
  ctx.putImageData(image, 0, 0)
}

/**
 * Screen-pixel gap at the hand-off between a canvas point and the same point
 * on the floor. Both go through `world-space.ts`. Quantising onto the texture
 * grid is the only error, and at 1440×900 it stays inside 2px.
 */
export function handoffMisalignPx(points: readonly CanvasPoint[], viewport: CanvasViewport, size: CanvasSize): number {
  const width = Math.max(1, Math.round(size.width))
  const height = Math.max(1, Math.round(size.height))
  const back = cameraToViewport(viewportToCamera(viewport, size, 'plan'), size)
  let max = 0
  for (const p of points) {
    const floor = floorToCanvas(canvasToFloor(p))
    const fromPlan = { x: viewport.x + p.x * viewport.scale, y: viewport.y + p.y * viewport.scale }
    const fromFloor = { x: viewport.x + floor.x * viewport.scale, y: viewport.y + floor.y * viewport.scale }
    const fromRoundTrip = { x: back.x + floor.x * back.scale, y: back.y + floor.y * back.scale }
    const tx = Math.min(width - 1, Math.max(0, Math.round(p.x)))
    const ty = Math.min(height - 1, Math.max(0, Math.round(p.y)))
    const fromTexel = { x: viewport.x + tx * viewport.scale, y: viewport.y + ty * viewport.scale }
    max = Math.max(
      max,
      Math.hypot(fromPlan.x - fromFloor.x, fromPlan.y - fromFloor.y),
      Math.hypot(fromFloor.x - fromRoundTrip.x, fromFloor.y - fromRoundTrip.y),
      Math.hypot(fromPlan.x - fromTexel.x, fromPlan.y - fromTexel.y)
    )
  }
  return max
}

/**
 * The 2D viewport whose centre is the camera's floor target, at `scale`.
 * `cameraToViewport` is the inverse, so the centre is that target and the
 * scale the person had is the scale they land on.
 */
export function landingViewport(target: { x: number; z: number }, size: CanvasSize, scale: number, tier: ZoomTier = 'plan'): CanvasViewport {
  const pitch = TIER_PITCH[tier]
  const sin = Math.sin(pitch)
  const safe = Number.isFinite(scale) && scale > 0 ? scale : 1
  const denom = Math.abs(sin) < 1e-6 ? 1e-6 : sin
  const distance = size.height / (safe * FLOOR_SCALE * denom)
  return cameraToViewport({ tier, target, distance, pitch }, size)
}
