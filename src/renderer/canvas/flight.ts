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
import type { ZoomTier } from '@shared/redesign-contracts'
import { electronAccelerator } from '@shared/shortcuts'

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

/** M444. Cubic ease-out. Tier flights use this; `easeInOut` stays on every other jump. */
export function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 1 - Math.pow(1 - x, 3)
}

/** M444. One duration, the token `--dur-flight`. Reduced motion is one frame. */
export const TIER_FLIGHT_MS = 220

export function tierFlightMs(reduced: boolean): number {
  return reduced ? 0 : TIER_FLIGHT_MS
}

/**
 * M444. The viewport at `scale` that keeps the world point under `anchor`
 * fixed. Same clamp-before-translate rule as `zoomAt`, with an absolute
 * scale rather than a factor, so a tier target cannot drift off the cursor.
 */
export function viewportAtScale(vp: Viewport, scale: number, anchor: Point): Viewport {
  const next = clampScale(scale)
  if (next === vp.scale) return { x: vp.x, y: vp.y, scale: vp.scale }
  const worldX = (anchor.x - vp.x) / vp.scale
  const worldY = (anchor.y - vp.y) / vp.scale
  return { scale: next, x: anchor.x - worldX * next, y: anchor.y - worldY * next }
}

/** Cursor, else the selection's screen centre, else the host centre. */
export function tierAnchor(size: Size, pointer: Point | null, selection: Point | null): Point {
  if (pointer !== null) return pointer
  if (selection !== null) return selection
  return { x: size.width / 2, y: size.height / 2 }
}

/** Centre of the union of the selected rects, in the same space as the rects. */
export function selectionCentre(
  rects: readonly { id: string; x: number; y: number; w: number; h: number }[],
  ids: ReadonlySet<string>
): Point | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let count = 0
  for (const rect of rects) {
    if (!ids.has(rect.id)) continue
    count += 1
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.w)
    maxY = Math.max(maxY, rect.y + rect.h)
  }
  if (count === 0) return null
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

/**
 * A harness key event often arrives with `key` and an empty `code`.
 * `matchShortcut` matches `code`, so a bare `0` still has to name Digit0.
 * A real Shift+0 already carries `code: 'Digit0'`; that value is kept.
 */
export function chordCode(event: { key: string; code: string }): string {
  if (event.code !== '') return event.code
  const key = event.key
  if (key === '0' || key === ')') return 'Digit0'
  if (key === '1' || key === '!') return 'Digit1'
  if (key === '2' || key === '@') return 'Digit2'
  if (key === '3' || key === '#') return 'Digit3'
  if (key === 't' || key === 'T') return 'KeyT'
  if (key.length === 1 && /[a-z]/i.test(key)) return `Key${key.toUpperCase()}`
  return ''
}

/** The accelerators L-C binds. Reading them throws if the registry drops a chord. */
export function navigateAccelerators(): {
  fitAll: string
  work: string
  plan: string
  map: string
  fitTask: string
  tidy: string
  tidyAlias: string
} {
  return {
    fitAll: electronAccelerator('fit-all'),
    work: electronAccelerator('tier-work'),
    plan: electronAccelerator('tier-plan'),
    map: electronAccelerator('tier-map'),
    fitTask: electronAccelerator('fit-task'),
    tidy: electronAccelerator('tidy'),
    tidyAlias: electronAccelerator('tidy-alias')
  }
}

/**
 * M444. The camera and the arrangement live in hooks this module cannot
 * import (they import it). The binders are the seam: useViewport registers
 * the flight, arrangement registers tidy and the selection centre, board
 * registers fit-task. A chord before those hooks exist is a no-op.
 */
let tierFlight: ((tier: ZoomTier) => void) | null = null
export function bindTierFlight(fn: (tier: ZoomTier) => void): void { tierFlight = fn }
export function requestTier(tier: ZoomTier): void { tierFlight?.(tier) }

let tidyAll: (() => void) | null = null
export function bindTidyAll(fn: () => void): void { tidyAll = fn }
export function runTidyAll(): void { tidyAll?.() }

let fitTaskRun: (() => void) | null = null
export function bindFitTask(fn: () => void): void { fitTaskRun = fn }
export function runFitTask(): void { fitTaskRun?.() }

let selectionScreen: (() => Point | null) | null = null
export function bindSelectionCentre(fn: () => Point | null): void { selectionScreen = fn }
export function currentSelectionCentre(): Point | null { return selectionScreen?.() ?? null }

let tierPointer: Point | null = null
export function setTierPointer(point: Point | null): void { tierPointer = point }
export function currentTierPointer(): Point | null { return tierPointer }
