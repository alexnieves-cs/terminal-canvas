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

export function normalizeWheel(e: WheelLike): WheelIntent {
  const unit = e.deltaMode === 1 ? LINE_HEIGHT_PX : e.deltaMode === 2 ? PAGE_HEIGHT_PX : 1
  const dx = e.deltaX * unit
  const dy = e.deltaY * unit

  // A macOS pinch arrives as a wheel event with a synthetic ctrlKey; no key is
  // held. Cmd+wheel is the equivalent for a mouse.
  if (e.ctrlKey || e.metaKey) {
    // Exponential, so a given finger distance is the same proportional zoom at
    // every scale and repeated deltas multiply rather than accumulate.
    return { kind: 'zoom', factor: Math.exp(-dy * ZOOM_SENSITIVITY) }
  }

  // Shift+wheel is the platform convention for horizontal scroll.
  if (e.shiftKey && dx === 0) return { kind: 'pan', dx: -dy, dy: 0 }

  return { kind: 'pan', dx: -dx, dy: -dy }
}
