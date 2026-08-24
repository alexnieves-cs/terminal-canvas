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
 */

/**
 * Events this module created. Without a marker the synthetic event re-enters
 * this same capture listener and recurses until the stack overflows. A WeakSet
 * rather than a property on the event: a property is easy to lose if anything
 * ever clones the event.
 */
const synthetic = new WeakSet<Event>()

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
    if (!slot) return
    if (event.type === 'mouseup') activeSlot = null

    // The common case pays nothing: xterm receives the original event.
    if (scale === 1) return

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
      screenX: corrected.x,
      screenY: corrected.y,
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
