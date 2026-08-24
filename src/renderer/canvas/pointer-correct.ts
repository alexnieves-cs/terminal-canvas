import type { Point } from './viewport'

/**
 * The one piece of arithmetic that decides whether a click lands on the right
 * character.
 *
 * xterm computes a cell from a mouse event like this (confirmed in
 * node_modules/@xterm/xterm/lib/xterm.js):
 *
 *   getCoordsRelativeToElement -> [ e.clientX - rect.left, e.clientY - rect.top ]
 *   getCoords                  -> ceil(offset / dimensions.css.cell.width)
 *
 * `rect.left` comes from getBoundingClientRect(), which IS transform-aware and
 * returns screen pixels. `cell.width` comes from the render service, which is
 * NOT transform-aware and is in CSS pixels. Under scale(k) the numerator is k
 * times larger than the denominator expects, so xterm reports a column k times
 * the true one.
 *
 * Rewriting the event's client coordinates so that `clientX - rect.left` is
 * already a CSS-pixel offset fixes it at the source. getMouseReportCoords —
 * the path feeding mouse-reporting TUIs — calls the same helper, so selection
 * and mouse reporting are both corrected by this one function.
 *
 * Deliberately free of DOM types: `RectOrigin` is declared structurally rather
 * than importing DOMRect, so this module has no DOM dependency and runs under
 * plain node in verify:viewport.
 */
export interface RectOrigin {
  left: number
  top: number
}

export function correctForScale(client: Point, rect: RectOrigin, scale: number): Point {
  // A non-finite or non-positive scale can only come from a corrupted
  // viewport; returning the point unchanged is strictly better than emitting
  // NaN coordinates into a synthetic event.
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return client
  return {
    x: rect.left + (client.x - rect.left) / scale,
    y: rect.top + (client.y - rect.top) / scale
  }
}
