import { screenToWorld, type Point, type Size, type Viewport, type WorldRect } from './viewport'

/**
 * M69. THE OVERVIEW'S PROJECTION — pure, in the viewport bundle.
 *
 * The minimap draws every panel as a block in its tone and the camera as a
 * rectangle, at thumbnail scale, in a corner of the canvas. This module is
 * the geometry: ONE uniform scale that fits every rect AND the viewport's
 * own world rect into the thumb with PAD clear on all sides (so the camera
 * is always visible in it, even far from every panel), the inverse (a click
 * on the thumb names a world point), and the camera a click asks for (the
 * same scale, that point at the centre). No DOM, no React.
 */

export const MINIMAP_PAD = 6

export interface MinimapBlock { id: string; x: number; y: number; w: number; h: number }
export interface MinimapProjection {
  scale: number
  ox: number
  oy: number
  blocks: MinimapBlock[]
  view: { x: number; y: number; w: number; h: number }
}

/** The camera's rectangle in WORLD units. */
export function viewportWorldRect(vp: Viewport, size: Size): { x: number; y: number; w: number; h: number } {
  const tl = screenToWorld({ x: 0, y: 0 }, vp)
  const br = screenToWorld({ x: size.width, y: size.height }, vp)
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y }
}

export function minimapProjection(input: {
  rects: readonly WorldRect[]
  viewport: Viewport
  size: Size
  thumb: { w: number; h: number }
}): MinimapProjection {
  const view = viewportWorldRect(input.viewport, input.size)
  const all = [...input.rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })), view]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const r of all) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h)
  }
  const spanW = Math.max(1, maxX - minX), spanH = Math.max(1, maxY - minY)
  const innerW = input.thumb.w - 2 * MINIMAP_PAD, innerH = input.thumb.h - 2 * MINIMAP_PAD
  const scale = Math.min(innerW / spanW, innerH / spanH)
  // Centred in the thumb: the slack on the tighter axis is split.
  const ox = MINIMAP_PAD + (innerW - spanW * scale) / 2 - minX * scale
  const oy = MINIMAP_PAD + (innerH - spanH * scale) / 2 - minY * scale
  const project = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x * scale + ox, y: r.y * scale + oy, w: r.w * scale, h: r.h * scale })
  return {
    scale, ox, oy,
    blocks: input.rects.map((r) => ({ id: r.id, ...project(r) })),
    view: project(view)
  }
}

/** A world box in thumb pixels. Regions and the camera share this projection. */
export function projectBox(box: { x: number; y: number; w: number; h: number }, pr: MinimapProjection): { x: number; y: number; w: number; h: number } {
  return { x: box.x * pr.scale + pr.ox, y: box.y * pr.scale + pr.oy, w: box.w * pr.scale, h: box.h * pr.scale }
}

/** A point on the thumb, back in the world. */
export function minimapToWorld(p: Point, pr: MinimapProjection): Point {
  return { x: (p.x - pr.ox) / pr.scale, y: (p.y - pr.oy) / pr.scale }
}

/** The camera at the SAME scale with `world` at the viewport's centre. */
export function viewportCentredAt(world: Point, vp: Viewport, size: Size): Viewport {
  // worldToScreen is p * scale + (x, y); solve for the translation that puts
  // `world` at the screen centre. Derived through screenToWorld rather than
  // written as a formula so a change to the convention breaks minimap.3, not
  // the map silently.
  const probe: Viewport = { x: 0, y: 0, scale: vp.scale }
  const atOrigin = screenToWorld({ x: size.width / 2, y: size.height / 2 }, probe)
  return { x: (atOrigin.x - world.x) * vp.scale, y: (atOrigin.y - world.y) * vp.scale, scale: vp.scale }
}

/**
 * M258. THE CAMERA'S RECTANGLE IS A HANDLE. A drag that starts on it keeps
 * the grab offset — the rectangle slides under the pointer rather than
 * jumping to centre on it — and is computed from the ORIGIN camera and the
 * ORIGIN projection every frame (applyDrag's rule: accumulating per-frame
 * deltas drifts). The thumb delta goes through the inverse as
 * toWorld(to) − toWorld(from), never toWorld(to − from): the latter
 * subtracts the projection's offset, which must cancel. The caller still
 * moves the camera only through goToViewport (the minimap's load-bearing
 * rule): this names the camera, it does not set it.
 */
export function minimapPanViewport(origin: Viewport, from: Point, to: Point, pr: MinimapProjection): Viewport {
  const a = minimapToWorld(from, pr), b = minimapToWorld(to, pr)
  const dx = b.x - a.x, dy = b.y - a.y
  return { x: origin.x - dx * origin.scale, y: origin.y - dy * origin.scale, scale: origin.scale }
}

/** M258. Is a thumb point on the camera's rectangle? `slop` px of grace at its edge, so a thin rectangle is still grabbable. */
export function minimapViewHit(p: Point, pr: MinimapProjection, slop = 3): boolean {
  const v = pr.view
  return p.x >= v.x - slop && p.x <= v.x + v.w + slop && p.y >= v.y - slop && p.y <= v.y + v.h + slop
}

/**
 * M258. THE ZOOM READOUT IS NEWS, NOT FURNITURE: shown while a zoom is under
 * way, and at rest only when the scale differs materially from 100%. "100%"
 * printed permanently is a zero-value statement.
 */
export const ZOOM_READOUT_BAND = 0.05
export function zoomReadoutShown(scale: number, zooming: boolean): boolean {
  return zooming || Math.abs(scale - 1) > ZOOM_READOUT_BAND
}

/**
 * M395 (backlog #83). THE MAP IS NEEDED ONLY WHEN SOMETHING IS OUT OF VIEW.
 * With every object already inside the camera's rectangle the map is almost
 * all view rectangle and a click on it goes nowhere (the live audit), so the
 * overlay hides; it returns the moment one object leaves the view. Pure over
 * the rects and the camera, so Fit all — which frames every rect — hides it
 * deterministically, and a second Fit computes the same framing (useViewport's
 * fitAll relies on that to stay idempotent).
 */
export function minimapNeeded(rects: readonly WorldRect[], vp: Viewport, size: Size): boolean {
  if (rects.length === 0) return false
  const v = viewportWorldRect(vp, size)
  return rects.some((r) => r.x < v.x || r.y < v.y || r.x + r.w > v.x + v.w || r.y + r.h > v.y + v.h)
}

/**
 * M395 (backlog #83, the critic's P1). THE MAP STEPS ASIDE for work under
 * it. It is a screen-space overlay over a world that moves, so sooner or
 * later a chat's Send or a panel's corner sits beneath it. `aside` is the
 * map tucked into its corner (styles.css: a quarter-size tile, click-through)
 * — a presence, not an absence, because the rest rule's opacity is 0 or 1 and
 * a map that vanished outright would read as broken.
 *
 * The rule, over two pointer samples (now and the one before):
 * - out of reach (not within `approach` px of the map): at rest;
 * - a gesture in flight that did not begin on the map (a drag, a marquee, a
 *   pan) crossing into reach: aside — nobody drags a panel to click a map;
 * - once aside, it stays aside while the pointer is in reach (hysteresis: the
 *   map must not spring back under the pointer that just made it move);
 * - the pointer in the approach ring and OVER A PANEL THE MAP COVERS: aside,
 *   before it arrives — the person is working in that panel, near its edge;
 * - the pointer arriving on the map in one move FROM such a panel: aside — a
 *   fast move can skip the ring;
 * - anything else — the pointer reaching the map from open ground, from the
 *   HUD, from the canvas edge — is intent to use it: at rest.
 * `over` is the panel id under the pointer (the DOM's answer, not geometry:
 * the HUD sits over panels too), or null.
 */
export type MinimapPresence = 'rest' | 'aside'
export interface MinimapPointer { at: Point; over: string | null; pressed: boolean }
export interface ScreenBox { x: number; y: number; w: number; h: number }
export const MINIMAP_APPROACH_PX = 16

/** The panels whose screen rect the map's box covers, at camera `vp`. */
export function minimapCovered(map: ScreenBox, rects: readonly WorldRect[], vp: Viewport): Set<string> {
  const out = new Set<string>()
  for (const r of rects) {
    const x = r.x * vp.scale + vp.x, y = r.y * vp.scale + vp.y, w = r.w * vp.scale, h = r.h * vp.scale
    if (x < map.x + map.w && map.x < x + w && y < map.y + map.h && map.y < y + h) out.add(r.id)
  }
  return out
}

export function minimapPresence(
  prev: MinimapPresence,
  now: MinimapPointer | null,
  before: MinimapPointer | null,
  map: ScreenBox,
  covered: ReadonlySet<string>,
  approach: number = MINIMAP_APPROACH_PX
): MinimapPresence {
  const within = (p: Point, by: number): boolean => p.x >= map.x - by && p.x <= map.x + map.w + by && p.y >= map.y - by && p.y <= map.y + map.h + by
  if (now === null || !within(now.at, approach)) return 'rest'
  if (now.pressed) return 'aside'
  if (prev === 'aside') return 'aside'
  const onCovered = (s: MinimapPointer): boolean => s.over !== null && covered.has(s.over)
  const inMap = within(now.at, 0)
  if (!inMap && onCovered(now)) return 'aside'
  if (inMap && before !== null && !within(before.at, 0) && onCovered(before)) return 'aside'
  return 'rest'
}
