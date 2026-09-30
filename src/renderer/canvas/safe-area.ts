import { screenToWorld, type Point, type ScreenRect, type Size, type Viewport, type WorldRect } from './viewport'
import { freeSpot } from './placement'

/**
 * M395. THE CANVAS'S SAFE AREA, READ FROM THE DOM.
 *
 * The camera frames things (Fit all, Fit task, a jump, Go to, a flight to a
 * panel) and new objects are placed, in a host that is NOT all visible: the
 * minimap, the HUD and the command pill float over it, and at the compact
 * breakpoint the navigator and context panes are drawers over it. This module
 * is the one place that measures those surfaces, in HOST-LOCAL screen pixels,
 * so the pure framing math (`viewport.ts`'s `clearFraming`) and placement
 * (`placement.ts`'s `freeSpot`) can stay pure. It reads at call time, like
 * every other host measurement here (docs/load-bearing.md: the shell insets
 * the canvas, and nothing measures the window).
 *
 * `minimap`:
 * - `'never'` — a framing that will leave every object in view, which is
 *   exactly what hides the map (`minimapNeeded`);
 * - `'shown'` (the default) — the map while it is showing (placing an object);
 * - `'always'` — its box even while it is hidden, because a framing that
 *   leaves some object out of view brings it back.
 * Its box is its LAYOUT box (offset*), not its painted one: tucked aside it is
 * a quarter-size tile, and it springs back the moment the pointer leaves.
 */
export type MinimapReserve = 'never' | 'shown' | 'always'

export function chromeObstacles(host: HTMLElement | null, opts: { minimap?: MinimapReserve } = {}): ScreenRect[] {
  if (host === null) return []
  const hb = host.getBoundingClientRect()
  const local = (r: DOMRect): ScreenRect => ({ x: r.left - hb.left, y: r.top - hb.top, w: r.width, h: r.height })
  const out: ScreenRect[] = []
  const map = host.querySelector<HTMLElement>(':scope > .minimap')
  if (map !== null && map.offsetWidth > 0) {
    const hidden = map.getAttribute('data-presence') === 'hidden'
    const reserve = opts.minimap ?? 'shown'
    if (reserve === 'always' || (reserve === 'shown' && !hidden)) {
      out.push(map.offsetParent === host
        ? { x: map.offsetLeft, y: map.offsetTop, w: map.offsetWidth, h: map.offsetHeight }
        : local(map.getBoundingClientRect()))
    }
  }
  for (const el of host.querySelectorAll<HTMLElement>(':scope > .canvas-hud, :scope > .command-pill .command-pill__rest')) {
    const r = local(el.getBoundingClientRect())
    if (r.w > 0 && r.h > 0) out.push(r)
  }
  // A pane OVER the canvas (the compact drawers, a floating inspector): the
  // part of it inside the host. A pane BESIDE the canvas (a grid column) does
  // not intersect the host and adds nothing.
  const shell = host.closest('.shell')
  if (shell !== null) {
    for (const el of shell.querySelectorAll<HTMLElement>('aside.shell__rail, aside.shell__inspector')) {
      const r = el.getBoundingClientRect()
      const x0 = Math.max(r.left, hb.left), x1 = Math.min(r.right, hb.right)
      const y0 = Math.max(r.top, hb.top), y1 = Math.min(r.bottom, hb.bottom)
      if (x1 - x0 > 1 && y1 - y0 > 1) out.push({ x: x0 - hb.left, y: y0 - hb.top, w: x1 - x0, h: y1 - y0 })
    }
  }
  return out
}

/** The host's size, as the framing math reads it. */
export function hostSize(host: HTMLElement): Size {
  const b = host.getBoundingClientRect()
  return { width: b.width, height: b.height }
}

/** The chrome as WORLD rects at camera `vp` — obstacles for placing a new object. */
export function chromeWorldRects(host: HTMLElement | null, vp: Viewport, opts: { minimap?: MinimapReserve } = {}): WorldRect[] {
  return chromeObstacles(host, opts).map((o, i) => {
    const tl = screenToWorld({ x: o.x, y: o.y }, vp)
    return { id: `chrome:${i}`, x: tl.x, y: tl.y, w: o.w / vp.scale, h: o.h / vp.scale }
  })
}

/** Screen pixels a new object keeps from the host's edge when it is placed in view. */
export const PLACE_EDGE_PX = 16

/** The world the camera shows, inset by PLACE_EDGE_PX on every side — where a new object may land. */
export function placeableWorld(host: HTMLElement | null, vp: Viewport): { x: number; y: number; w: number; h: number } | undefined {
  if (host === null) return undefined
  const w = host.clientWidth, h = host.clientHeight
  if (!(w > 2 * PLACE_EDGE_PX) || !(h > 2 * PLACE_EDGE_PX)) return undefined
  const tl = screenToWorld({ x: PLACE_EDGE_PX, y: PLACE_EDGE_PX }, vp)
  return { x: tl.x, y: tl.y, w: (w - 2 * PLACE_EDGE_PX) / vp.scale, h: (h - 2 * PLACE_EDGE_PX) / vp.scale }
}

/**
 * M395. Where a new AUTHORED object may go, read once outside a `setPanels`
 * updater (DOM reads are not the updater's business): the chrome as world
 * rects and the world in view. `placeIn` then runs INSIDE the updater, pure,
 * over the updater's own `current` — the cascade's batching rule.
 */
export interface PlacementRoom { chrome: WorldRect[]; within?: { x: number; y: number; w: number; h: number } }
export function placementRoom(host: HTMLElement | null, vp: Viewport): PlacementRoom {
  const within = placeableWorld(host, vp)
  return { chrome: chromeWorldRects(host, vp), ...(within === undefined ? {} : { within }) }
}
export function placeIn(room: PlacementRoom, centre: Point, size: { w: number; h: number }, rects: readonly { x: number; y: number; w: number; h: number }[]): Point | null {
  return freeSpot(centre, size, [...rects, ...room.chrome], room.within === undefined ? {} : { within: room.within })
}
