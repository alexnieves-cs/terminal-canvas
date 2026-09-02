import { useCallback, useEffect, useRef } from 'react'

/**
 * Tracks whether the bare Space key is currently held — backlog #68's
 * space-drag pan, gated the same way the marquee's own background click is.
 *
 * "Cmd is required for every canvas shortcut," and Space is a bare key that
 * belongs to whatever agent is running in a focused panel — a literal space
 * keystroke must reach the PTY untouched. So this hook only ever claims a
 * Space keydown (preventDefault, mark held) when `document.activeElement`
 * is genuinely nothing: not an xterm textarea, not the palette's input, not
 * a review/file draft. That single DOM-truth test subsumes the four
 * app-state checks (`focusedId`, `palette.isOpen()`, the review/file draft
 * elements) a hand-built equivalent would otherwise need to get right
 * separately — the same DOM-over-app-state instinct `xterm-pointer.ts`'s
 * `.panel__slot` test and `useNavGrid`'s draft-target test both already use.
 *
 * When something IS focused, this does nothing at all — no preventDefault,
 * no state change — so the keystroke flows exactly as it would if this hook
 * did not exist. `isHeld` is a stable ref-read accessor, the same shape
 * `useLinkMode.isArmed` and `useNavGrid.isOpen` already use, so a caller can
 * put it in a dep array without tearing a listener down on every press.
 */
export function useSpaceHeld(): { isHeld: () => boolean } {
  const heldRef = useRef(false)
  const isHeld = useCallback(() => heldRef.current, [])

  useEffect(() => {
    const nothingFocused = (): boolean => {
      const a = document.activeElement
      // Body/null is "nothing focused"; the canvas host (M44 made it
      // focusable so Cmd+Escape can land there and Tab can walk the chrome)
      // counts too — focusing the canvas IS canvas focus, so Space should
      // still arm the pan. Without this, a background click now focuses the
      // host (tabIndex) and Space would never arm — verify:panels 176.
      return a === null || a === document.body ||
        (a instanceof HTMLElement && a.getAttribute('role') === 'application')
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      // Not ours right now: something legitimately wants this keystroke.
      // Bail with no side effect at all, the same shape usePalette's
      // modifier checks and useNavGrid's draft-target check both use for
      // "this chord isn't mine."
      if (!nothingFocused()) return
      event.preventDefault()
      heldRef.current = true
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') heldRef.current = false
    }

    // blur disarms too, useNavGrid's and useLinkMode's reason: Cmd+Tab away
    // must not leave Space "held" forever with no keyup ever delivered here.
    const onBlur = (): void => { heldRef.current = false }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return { isHeld }
}
