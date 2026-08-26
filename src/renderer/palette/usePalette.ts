import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Who owns the keyboard.
 *
 * M5a deferred preset editing here by name: "building a preset-manager dialog
 * now would be the first modal in this app, and it would collide with xterm's
 * keyboard focus — the same problem M5b has to solve properly and once." This
 * hook is that once, and the rules are four:
 *
 * 1. Opening focuses the palette's input. xterm reads its own hidden textarea
 *    and nothing else, so that alone stops bare keys reaching the PTY. (The
 *    focusing itself is Palette.tsx's, on mount — the element has to exist.)
 * 2. DOM focus is NOT app focus. focusedId is deliberately left alone:
 *    clearing it would demote the panel (assignTiers pins the focused panel
 *    live), lose the Cmd+C target, and drop the very panel most commands are
 *    about to act on. The id is CAPTURED at open time instead.
 * 3. Canvas shortcuts stand down — see isOpen(), which useViewport and the
 *    edit:paste listener consult.
 * 4. Closing calls restoreFocus(capturedId), i.e. SessionHandle.focus().
 */

export interface PaletteController {
  open: boolean
  /** focusedId as it was when the palette opened. */
  capturedId: string | null
  openPalette(): void
  closePalette(): void
  /**
   * Referentially STABLE, and reads a ref rather than state. useViewport keeps
   * it in a keydown effect's dep array, and a function that changed identity
   * on every open/close would tear that listener down and reinstall it — the
   * same constraint shouldYieldWheel documents one file over.
   */
  isOpen: () => boolean
}

export function usePalette(deps: {
  focusedIdRef: RefObject<string | null>
  restoreFocus: (id: string) => void
}): PaletteController {
  const [open, setOpen] = useState(false)
  const [capturedId, setCapturedId] = useState<string | null>(null)

  const openRef = useRef(open)
  openRef.current = open
  const capturedRef = useRef(capturedId)
  capturedRef.current = capturedId
  // deps is a fresh object every render; mirroring it keeps the toggle
  // listener's dep array empty so it installs exactly once.
  const depsRef = useRef(deps)
  depsRef.current = deps

  const isOpen = useCallback(() => openRef.current, [])

  const openPalette = useCallback(() => {
    setCapturedId(depsRef.current.focusedIdRef.current)
    setOpen(true)
  }, [])

  const closePalette = useCallback(() => {
    setOpen(false)
    const id = capturedRef.current
    // Restore the terminal's keyboard. Nothing else gives it back: the input
    // is about to unmount, and an unmounted element's blur focuses <body>.
    if (id) depsRef.current.restoreFocus(id)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Cmd-gated like every other canvas shortcut — bare keys belong to the
      // TUI. Ctrl/Alt excluded so Cmd+Ctrl+K is not silently the same chord.
      if (!event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key !== 'k' && event.key !== 'K') return
      event.preventDefault()
      // A toggle, not an open: Cmd+K twice must not leave a palette the user
      // has to find the Escape key for.
      if (openRef.current) closePalette()
      else openPalette()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openPalette, closePalette])

  return { open, capturedId, openPalette, closePalette, isOpen }
}
