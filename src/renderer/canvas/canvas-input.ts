/**
 * Turns platform wheel events into canvas intents.
 *
 * Takes a plain object rather than a real WheelEvent so the disambiguation is
 * a pure function, testable without a DOM. React is not imported here.
 */

export interface WheelLike {
  deltaX: number
  deltaY: number
  /** 0 = pixels (trackpad), 1 = lines (mouse wheel), 2 = pages. */
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export type WheelIntent =
  | { kind: 'zoom'; factor: number }
  | { kind: 'pan'; dx: number; dy: number }

export const LINE_HEIGHT_PX = 16
export const PAGE_HEIGHT_PX = 800
export const ZOOM_SENSITIVITY = 0.01

/**
 * Largest per-event delta the zoom will honour. Trackpad pinches arrive as
 * 1-5px per event, but a single mouse-wheel notch is ~120px, which
 * unclamped is a 3.3x jump straight into the scale limit. Clamping caps one
 * notch at about 1.28x while leaving pinch deltas untouched.
 */
export const MAX_ZOOM_DELTA = 25

export function normalizeWheel(e: WheelLike): WheelIntent {
  const unit = e.deltaMode === 1 ? LINE_HEIGHT_PX : e.deltaMode === 2 ? PAGE_HEIGHT_PX : 1
  const dx = e.deltaX * unit
  const dy = e.deltaY * unit

  // A macOS pinch arrives as a wheel event with a synthetic ctrlKey; no key is
  // held. Cmd+wheel is the equivalent for a mouse.
  if (e.ctrlKey || e.metaKey) {
    // Exponential, so a given finger distance is the same proportional zoom at
    // every scale and repeated deltas multiply rather than accumulate. Clamp
    // the delta first: a mouse wheel notch is ~120px where a trackpad pinch is
    // 1-5px, so left unclamped one notch would slam straight into MAX_SCALE.
    const clampedDy = Math.min(MAX_ZOOM_DELTA, Math.max(-MAX_ZOOM_DELTA, dy))
    return { kind: 'zoom', factor: Math.exp(-clampedDy * ZOOM_SENSITIVITY) }
  }

  // Shift+wheel is the platform convention for horizontal scroll. Chromium
  // already swaps deltaX/deltaY for shift+wheel on macOS, so dx is nonzero
  // only when the platform did NOT do the swap itself; gating on dx === 0
  // avoids double-swapping in the case where it did.
  if (e.shiftKey && dx === 0) return { kind: 'pan', dx: -dy, dy: 0 }

  return { kind: 'pan', dx: -dx, dy: -dy }
}
