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
   * Close WITHOUT restoring focus — the outside-click exit, and the only
   * caller is Canvas.tsx's capture-phase mousedown.
   *
   * closePalette() would be wrong here, and quietly: restoreFocus(capturedId)
   * calls SessionHandle.focus() on the panel that was focused when the
   * palette opened, while the very click that is closing it is already
   * deciding where focus should go — onto the panel it landed on, or off
   * every panel when it hit the background. Restoring on top of that either
   * yanks the keyboard back to the panel the user just clicked AWAY from, or
   * leaves xterm holding DOM focus while React's focusedId is null (the
   * Cmd+C-has-no-target desync "Focus is released on a background click"
   * exists to prevent). Doing nothing is right because the click itself is
   * the focus gesture. verify:panels 42.
   */
  dismissPalette(): void
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

  // Rule 4 with its one documented exception; see the interface above.
  const dismissPalette = useCallback(() => {
    setOpen(false)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Cmd-gated like every other canvas shortcut — bare keys belong to the
      // TUI. Ctrl/Alt/Shift are all excluded so that Cmd+Ctrl+K, Cmd+Alt+K and
      // Cmd+Shift+K are not silently the SAME chord as Cmd+K: those are
      // distinct shortcuts in every editor the user also has open, and a
      // palette that opens on all four is a palette that opens by accident.
      // Shift is the easy one to forget, because Cmd+Shift+K still arrives
      // with `key === 'K'`, which the check below accepts on its own.
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (event.key !== 'k' && event.key !== 'K') return
      event.preventDefault()
      // preventDefault FIRST, then stand down: a held Cmd+K is still ours to
      // swallow even on the repeats we refuse to act on, or the tail of the
      // chord leaks past to the browser and the PTY.
      //
      // The same auto-repeat rule useViewport's keydown handler applies (see
      // REPEATABLE_KEYS there), with a louder symptom, because this one is a
      // TOGGLE: an unguarded held chord flips the overlay open and closed at
      // the OS repeat rate, and every re-open re-runs openPalette's
      // setCapturedId(focusedIdRef.current) — so which panel the palette's
      // rows act on comes down to whether the user released on an odd or an
      // even repeat.
      if (event.repeat) return
      // A toggle, not an open: Cmd+K twice must not leave a palette the user
      // has to find the Escape key for.
      if (openRef.current) closePalette()
      else openPalette()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openPalette, closePalette])

  return { open, capturedId, openPalette, closePalette, dismissPalette, isOpen }
}
