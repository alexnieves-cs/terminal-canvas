import type { Point, WorldRect } from './viewport'

/**
 * The rubber-band marquee's arithmetic. Pure, DOM-free, and separate from the
 * gesture that drives it for the same reason canvas-input.ts takes a plain
 * delta rather than a WheelEvent — the whole point is that this arithmetic
 * can be tested as arithmetic, without a browser and without a running
 * canvas. The gesture that actually drives a drag into these two functions
 * lands in a later task; nothing here manages selection state.
 */

/** Normalises a drag into a rect, whichever direction it was dragged. */
export function marqueeRect(from: Point, to: Point): WorldRect {
  return {
    id: 'marquee',
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    w: Math.abs(to.x - from.x),
    h: Math.abs(to.y - from.y)
  }
}

/**
 * Every panel the marquee INTERSECTS, in array order.
 *
 * Intersection rather than containment: a marquee requiring full containment
 * could never select a panel larger than the visible canvas, which at
 * ordinary zoom levels is most of them — a gesture that would silently do
 * nothing on the common case. Strict inequalities, so a panel merely touching
 * the marquee's edge is excluded — dragging a marquee up against a panel to
 * deliberately leave it out is a real gesture and must work.
 */
export function marqueeSelection(rect: WorldRect, panels: readonly WorldRect[]): string[] {
  return panels
    .filter(
      (p) =>
        p.x < rect.x + rect.w &&
        p.x + p.w > rect.x &&
        p.y < rect.y + rect.h &&
        p.y + p.h > rect.y
    )
    .map((p) => p.id)
}
