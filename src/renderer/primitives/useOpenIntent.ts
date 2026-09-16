import { useRef } from 'react'
import type { MutableRefObject } from 'react'

/**
 * WHICH HAND OPENED THE OVERLAY — the one fact that decides whether focus is
 * allowed to move.
 *
 * `shell-control.ts` states this app's universal rule: a control mounts
 * `onMouseDown: preventDefault()` so DOM focus NEVER leaves xterm's hidden
 * textarea. Radix's overlays are built on the opposite premise — open, then
 * pull focus into the content and rove it with the arrow keys. Adopting Radix
 * wholesale would move focus out of the running agent on every ⋯ click, which
 * is the dead-control defect the shellControl comment describes, silently.
 *
 * So the two hands are separated, and each keeps the behaviour it already had:
 *
 *   pointer  — focus stays exactly where it was. `onOpenAutoFocus` and
 *              `onCloseAutoFocus` are both prevented, so the agent keeps the
 *              keyboard and there is nothing to restore. This is what every
 *              migrated menu does TODAY.
 *   keyboard — focus moves into the content, arrows and typeahead walk it, and
 *              Escape hands focus back to the trigger. Radix's default, and a
 *              capability these menus did not have before.
 *
 * Escape and outside-click dismissal do NOT depend on this: Radix's
 * DismissableLayer binds them on the document, so a pointer-opened menu whose
 * focus never moved still closes on both.
 *
 * BOTH flags are REFS, not state. Each is written during one event and read in
 * a later event of the SAME gesture, across a render the open itself causes —
 * as state they would be a render behind, and the fallback below would read
 * the stale value and toggle the overlay straight back shut.
 */
export interface OpenIntent {
  /** A pointer opened this, so focus must not move. */
  readonly byPointer: MutableRefObject<boolean>
  /** A pointerdown was seen for the gesture now in flight. */
  readonly sawPointer: MutableRefObject<boolean>
}

export function useOpenIntent(): OpenIntent {
  const byPointer = useRef(false)
  const sawPointer = useRef(false)
  return { byPointer, sawPointer }
}

/**
 * Spread onto the trigger. Records the hand, holds focus for a pointer, and
 * keeps the activation event the rest of this app uses.
 *
 * `toggle` is the fallback for A CLICK THAT HAD NO POINTERDOWN. Radix opens an
 * overlay on pointerdown; every hand-rolled menu here opened on click, because
 * that is what `shellControl` mounts. The difference is invisible to a person
 * — a real mouse fires pointerdown, then click — and decisive for anything
 * that SYNTHESISES the gesture, which is how this repo drives its own UI:
 * verify-panels-agents opens the View menu with a bare
 * `new MouseEvent('click')`, and shot.cjs opens the dock's popover the same
 * way. Without this the trigger silently does nothing under every such script,
 * and the suite that reads the open menu goes red for a reason no stack trace
 * names.
 *
 * `sawPointer` is what keeps a real gesture from toggling twice: pointerdown
 * opens and sets the flag, and the click that follows spends it instead of
 * closing what it just opened.
 */
export function triggerProps(intent: OpenIntent, toggle: () => void): {
  onPointerDown: () => void
  onKeyDown: (event: { key: string }) => void
  onMouseDown: (event: { preventDefault: () => void }) => void
  onClick: () => void
} {
  return {
    onPointerDown: () => { intent.byPointer.current = true; intent.sawPointer.current = true },
    // Enter/Space/the arrows are Radix's keyboard opens. Anything else that
    // reaches the trigger (Tab moving away, a shortcut) must not relabel an
    // open a pointer is about to make.
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') intent.byPointer.current = false
    },
    // shellControl's mechanism, restated here because a Radix trigger does not
    // mount shellControl: preventDefault on mousedown stops the browser moving
    // focus to the button at all. Radix opens on POINTERDOWN, which fires
    // first, so the overlay still opens — only the focus move is refused.
    onMouseDown: (event) => { event.preventDefault() },
    onClick: () => {
      if (intent.sawPointer.current) { intent.sawPointer.current = false; return }
      // No pointerdown preceded this: a synthesised click. Treat it as the
      // pointer gesture it stands in for, focus discipline included.
      intent.byPointer.current = true
      toggle()
    }
  }
}

/** Spread onto the content. Lets focus move only when a key opened it. */
export function contentProps(intent: OpenIntent): {
  onOpenAutoFocus: (event: Event) => void
  onCloseAutoFocus: (event: Event) => void
} {
  return {
    onOpenAutoFocus: (event) => { if (intent.byPointer.current) event.preventDefault() },
    onCloseAutoFocus: (event) => { if (intent.byPointer.current) event.preventDefault() }
  }
}
