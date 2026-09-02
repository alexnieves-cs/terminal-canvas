import { correctForScale } from '@renderer/canvas/pointer-correct'

/**
 * Corrects mouse coordinates on their way to xterm.
 *
 * Lives on `document` in the CAPTURE phase, not on the panel, and that is
 * forced rather than chosen. On mousedown xterm binds its drag listeners to
 * the document:
 *
 *   this._document.addEventListener("mouseup", s.mouseup)
 *   this._document.addEventListener("mousemove", s.mousedrag)
 *
 * A listener scoped to the panel would correct the mousedown and never see the
 * drag that follows.
 *
 * NOT covered yet, and both gaps belong to the milestone that takes on
 * mouse-reporting TUIs — this file should not read as though either were
 * already handled:
 *
 *   - A mousemove with no button held — HANDLED since M51. A hover used to
 *     return early uncorrected (the pin is set at mousedown, and a hover has
 *     none), and it became user-visible the moment link underlines followed
 *     the hover. It is now corrected against the slot under the cursor,
 *     resolved per event; see the hover branch in onEvent.
 *   - Wheel. `TYPES` covers mousedown/mousemove/mouseup only, so no wheel
 *     event is ever corrected. xterm's wheel handler routes through
 *     getMouseReportCoords too, so a wheel over the FOCUSED panel — the one
 *     case useViewport yields to the terminal — still reports a column k times
 *     the true one to a mouse-reporting TUI at any scale != 1. Scrollback
 *     scrolling, the only thing a non-reporting terminal does with a wheel,
 *     ignores the coordinates entirely, which is why nothing visibly misbehaves
 *     today.
 */

/**
 * Events this module created. Without a marker the synthetic event re-enters
 * this same capture listener and recurses until the stack overflows. A WeakSet
 * rather than a property on the event: a property is easy to lose if anything
 * ever clones the event.
 */
const synthetic = new WeakSet<Event>()

/**
 * True for the clones this module dispatches. Their client coordinates are
 * CSS-pixel values measured against a panel's slot, not real screen points, so
 * anything that converts a mouse event to world space (Canvas's onMouseMove ->
 * screenToWorld -> the HUD cursor) must skip them: the clones bubble through
 * .canvas like any other event, and during a selection drag at scale != 1 they
 * are the ONLY moves that reach it, which made the HUD's world cursor sit
 * shifted for the whole gesture.
 */
export function isCorrectedEvent(event: Event): boolean {
  return synthetic.has(event)
}

const TYPES = ['mousedown', 'mousemove', 'mouseup'] as const

export function installPointerCorrection(getScale: () => number): () => void {
  /**
   * The slot whose rect corrections are measured against for the rest of the
   * current drag. Once a corrected mousedown starts a selection, the cursor
   * spends most of the gesture OUTSIDE the slot — target becomes <body> or the
   * document — so `closest('.panel__slot')` stops finding anything and the
   * moves would sail through uncorrected. Pinning the slot at mousedown and
   * holding it until mouseup is what makes drag-selection work.
   */
  let activeSlot: HTMLElement | null = null

  const onEvent = (event: MouseEvent): void => {
    if (synthetic.has(event)) return

    const scale = getScale()
    const target = event.target as HTMLElement | null

    let slot = activeSlot
    if (event.type === 'mousedown') {
      slot = target?.closest?.('.panel__slot') ?? null
      // Record the slot even at scale 1 so a drag that begins at 1:1 and
      // continues while the user zooms stays anchored to the right element.
      activeSlot = slot
    }
    // A move with no button held cannot be part of a drag, so release the pin.
    // This is the only thing standing between a missed mouseup and a permanently
    // stale pin: Electron does not reliably deliver mouseup when the button is
    // released outside the window, and a pin that outlives its gesture does far
    // worse than leave moves uncorrected — at any scale != 1 it makes EVERY
    // mousemove in the document, hover included, get stopImmediatePropagation'd
    // and replaced by a clone corrected against a rect no gesture is using. React's
    // root listener never sees the original, so every document-level move handler
    // sees only clones until the next mousedown happens to re-pin — the HUD's
    // world cursor, which now skips clones via isCorrectedEvent, would simply
    // freeze. usePanelDrag's move listener carries the same guard for the same
    // reason; fix one and check the other.
    if (event.type === 'mousemove' && event.buttons === 0) {
      activeSlot = null
      // M51. THE HOVER HALF. A hover that never followed a mousedown used to
      // return here uncorrected — recorded above as a known limit — and it
      // became user-visible the moment link underlines followed the hover:
      // at any zoom ≠ 1 the underline sat over the wrong cell. So a hover is
      // corrected against the slot UNDER THE CURSOR, resolved per event
      // rather than from the pin (the pin is still released, so a stale one
      // cannot outlive its gesture). A hover outside any slot passes
      // untouched, so the HUD's world cursor and every document-level move
      // handler keep seeing the original.
      const hoverSlot = (target?.closest?.('.panel__slot') as HTMLElement | null) ?? null
      if (!hoverSlot) return
      slot = hoverSlot
    }
    if (!slot) return
    if (event.type === 'mouseup') activeSlot = null

    // The common case pays nothing: xterm receives the original event.
    if (scale === 1) return

    // INVARIANT: the slot's origin must equal the origin of the element xterm
    // measures against (.xterm-screen). The correction re-expresses the click
    // relative to `rect`, but xterm subtracts its own element's rect, so the two
    // origins have to coincide or the difference d survives as d * (1 - 1/scale).
    // It holds today because .panel__slot has no padding or border and
    // .panel__terminal fills it. Give the slot 8px of padding and every click at
    // k ~ 0.48 lands about two columns off — and check 9 would NOT report it,
    // because a two-column shift is still inside the four characters of "beta".
    // Anything that insets the terminal within its slot needs this rect changed
    // to the screen element's, and needs a check with a tighter target.
    const rect = slot.getBoundingClientRect()
    const corrected = correctForScale({ x: event.clientX, y: event.clientY }, rect, scale)

    // Stop the original before it reaches xterm's listener, which is bound on
    // a descendant of the slot and would otherwise run first in the target
    // phase. stopImmediatePropagation, not stopPropagation: xterm's selection
    // service and its mouse-report handler can both be attached to the same
    // node, and stopping propagation alone would still let the sibling run.
    event.stopImmediatePropagation()
    event.preventDefault()

    const clone = new MouseEvent(event.type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: corrected.x,
      clientY: corrected.y,
      // screenX/screenY are deliberately NOT set. The only corrected values we
      // have are client-space, and copying them into screen-space fields would
      // put a coordinate in a frame it does not belong to — in this file, of all
      // files. xterm reads clientX/clientY only, so nothing needs them.
      button: event.button,
      // buttons distinguishes a drag from a hover. Drop it and xterm treats
      // every corrected mousemove as a hover, so selection never extends.
      buttons: event.buttons,
      // detail is the click count. Drop it and double-click word-select and
      // triple-click line-select stop working, with no error anywhere.
      detail: event.detail,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey
    })
    synthetic.add(clone)

    // Dispatch at the ORIGINAL target. During a drag that target is often the
    // document or <body>; xterm's drag listeners are on the document, so the
    // clone still reaches them by bubbling.
    ;(target ?? document).dispatchEvent(clone)
  }

  for (const type of TYPES) document.addEventListener(type, onEvent, true)
  return () => {
    for (const type of TYPES) document.removeEventListener(type, onEvent, true)
  }
}
