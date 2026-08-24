/**
 * The undo stack, as a pure past/present/future triple.
 *
 * Generic over the state it holds and free of React, DOM, and any knowledge of
 * panels — which is what puts it in the plain-node verify bundle beside
 * viewport.ts and lod.ts. Canvas.tsx instantiates it at History<Panel[]>.
 *
 * It is generic for a second reason worth recording: the undo stack and the
 * persistence snapshot are the same data. M4b already serialises Panel[] on
 * every change to feed layout:save, so an undo history is that same sequence
 * kept in memory rather than written to disk.
 */

/** Bounds memory across a long session. Fifty edits is far past useful recall. */
export const HISTORY_LIMIT = 50

export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0
}

/**
 * Records `next` as the new present. The redo branch is dropped: keeping it
 * would let Cmd+Shift+Z jump to a state that never followed the current one.
 *
 * Deliberately no equality check. Canvas pushes once per COMMITTED gesture, and
 * a drag that ends where it started is a real edit; deciding otherwise needs a
 * notion of equality this module has no business defining.
 */
export function pushHistory<T>(h: History<T>, next: T): History<T> {
  const past = [...h.past, h.present]
  return {
    // slice from the END, so the OLDEST entry is the one dropped. Dropping the
    // newest would make the most recent edit the one you cannot undo.
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    future: []
  }
}

/** A no-op at the beginning of history — Cmd+Z on a fresh canvas does nothing. */
export function undoHistory<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  const previous = h.past[h.past.length - 1]
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future]
  }
}

/** A no-op at the end of history. */
export function redoHistory<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  const [next, ...rest] = h.future
  return { past: [...h.past, h.present], present: next, future: rest }
}
