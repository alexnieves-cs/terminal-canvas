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
