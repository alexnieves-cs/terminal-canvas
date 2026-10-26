import { useEffect, type RefObject } from 'react'

/**
 * M600. THE KEYBOARD HALF OF A MODAL, for an overlay that cannot become a
 * Radix Dialog. The palette (and the New task / panel / setup sheets inside
 * it), Settings and Onboarding are hand-built: they own the window while open,
 * but Tab walked out of them into the dimmed canvas and, on close, focus fell
 * to <body> — so the next key went nowhere.
 *
 * Three things, and only these:
 *   - Tab and Shift+Tab wrap inside the container. The listener is on the
 *     DOCUMENT in the bubble phase, so it runs after React's own handlers and
 *     leaves alone any Tab a surface already answered (`defaultPrevented`):
 *     the palette's input cycles kinds with Tab, the directory field accepts
 *     a suggestion with it.
 *   - On close, focus goes back to what had it before the overlay opened —
 *     but only when nothing else took it. A row that flew to a panel and
 *     focused its terminal keeps that focus.
 *   - Nothing else is made inert. `pointer-events: none` on the body freezes
 *     every live terminal behind a sheet (primitives/Dialog.tsx's reason for
 *     modal={false} by default); the caller sets `aria-modal` on its own root.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

export function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0)
}

export function useModalFocus(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const root = ref.current
      if (root === null || !(event.target instanceof Node) || !root.contains(event.target)) return
      const list = focusablesIn(root)
      if (list.length === 0) return
      const at = list.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey
        ? (at <= 0 ? list[list.length - 1] : undefined)
        : (at === -1 || at === list.length - 1 ? list[0] : undefined)
      if (next === undefined) return
      event.preventDefault()
      next.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const now = document.activeElement
      const lost = now === null || now === document.body || !now.isConnected || (ref.current?.contains(now) ?? false)
      if (lost && before !== null && before.isConnected) before.focus({ preventScroll: true })
    }
  }, [ref, active])
}
