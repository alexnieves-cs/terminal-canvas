import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { focusLocked } from '@shared/shortcuts'
import type { PaletteScope } from './palette-model'

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
  /**
   * M409 (the critic). Whether a text draft held the keyboard when the palette
   * opened — a Monaco, note, checklist or sheet editor, any field
   * `draft-focus.ts` calls a draft. Captured beside capturedId because DOM
   * focus is the palette's input by the time a row is built, and the Undo
   * row must know whose ⌘Z the person was in.
   */
  capturedDraft: boolean
  /** `initialScope` opens straight into a drill-in; omitted means top level. */
  openPalette(initialScope?: PaletteScope): void
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
  /**
   * Which drill-in is open, or null at the top level.
   *
   * This lived in Palette.tsx's own useState until M8a's top bar needed a
   * settings button, and it moved here rather than growing a second way in.
   * The rule the milestone is protecting is that there is exactly ONE
   * authority for what scope the palette is in: a shell button that reached
   * into Palette.tsx's state — or that faked the drill-in by pre-filling the
   * query — would be a second author of the same fact, and the two would
   * agree the day they were written and drift the first time either changed.
   *
   * Scope lives beside `open` for a reason of its own: a scope must never
   * outlive the overlay it was entered from, which Palette.tsx used to get
   * for free by unmounting. Now that the state survives the unmount, BOTH
   * exits below clear it explicitly.
   */
  scope: PaletteScope | null
  setScope: (scope: PaletteScope | null) => void
  /**
   * M399 (A7). The scope the palette was OPENED into (the dock's ⚙ opens
   * Settings, ⌘F opens Search), or null — and null again the moment the
   * person moves to another scope. Escape inside a scope pops to the root,
   * which is right for a door a person walked through and wrong for one they
   * never saw: the gear's first Escape used to land on the root palette. So
   * Escape in the ENTRY scope closes, and hands the keyboard back.
   */
  entryScope: PaletteScope | null
}

export function usePalette(deps: {
  focusedIdRef: RefObject<string | null>
  restoreFocus: (id: string) => void
  /** Read at open time; absent reads as no draft. */
  draftHeld?: () => boolean
}): PaletteController {
  const [open, setOpen] = useState(false)
  const [capturedId, setCapturedId] = useState<string | null>(null)
  const [capturedDraft, setCapturedDraft] = useState(false)
  const [scope, setScopeState] = useState<PaletteScope | null>(null)
  const [entryScope, setEntryScope] = useState<PaletteScope | null>(null)
  // Any scope move made INSIDE the palette (a door, a pop) spends the entry:
  // from then on Escape pops as it always has.
  const setScope = useCallback((next: PaletteScope | null) => {
    setEntryScope(null)
    setScopeState(next)
  }, [])
  // M399 (A7). What held the keyboard when the palette opened, when that was
  // a control of the shell (a keyboard-reached ⚙, the top bar's search): the
  // trigger a closing Escape hands focus back to. A terminal's textarea is
  // NOT recorded — rule 4's restoreFocus(capturedId) already gives that back,
  // through the session, which is the one path that also re-pins the panel.
  const returnRef = useRef<HTMLElement | null>(null)

  const openRef = useRef(open)
  openRef.current = open
  // M42. Cmd+F's toggle needs the CURRENT scope at press time without adding
  // scope to the once-installed listener's deps — the same mirror openRef is.
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const capturedRef = useRef(capturedId)
  capturedRef.current = capturedId
  // deps is a fresh object every render; mirroring it keeps the toggle
  // listener's dep array empty so it installs exactly once.
  const depsRef = useRef(deps)
  depsRef.current = deps

  const isOpen = useCallback(() => openRef.current, [])

  /**
   * `initialScope` is how the top bar's ⚙ opens the palette already inside the
   * settings drill-in. It is one argument on the existing verb rather than a
   * second opener, so every rule opening already obeys — capturing focusedId,
   * standing the canvas shortcuts down — applies unchanged.
   *
   * It defaults to null rather than being left alone, which is what makes a
   * plain Cmd+K always land at the top level: without the reset, closing
   * inside the settings scope and reopening with Cmd+K would silently drop
   * the user back into Settings with the whole command list invisible.
   *
   * The parameter is deliberately safe to pass this straight to an onClick:
   * a React MouseEvent is not a PaletteScope, so `onSearch={openPalette}`
   * would type-error rather than open a bogus scope — every caller passes a
   * literal or nothing.
   */
  const openPalette = useCallback((initialScope?: PaletteScope) => {
    setCapturedId(depsRef.current.focusedIdRef.current)
    setCapturedDraft(depsRef.current.draftHeld?.() === true)
    setScopeState(initialScope ?? null)
    setEntryScope(initialScope ?? null)
    const active = document.activeElement
    returnRef.current = active instanceof HTMLElement && active !== document.body && !active.closest('.xterm') && !active.closest('.palette') ? active : null
    setOpen(true)
  }, [])

  const closePalette = useCallback(() => {
    setOpen(false)
    // Explicit now that the state outlives the overlay's unmount — see the
    // `scope` note on the interface above.
    setScopeState(null)
    setEntryScope(null)
    const back = returnRef.current
    returnRef.current = null
    const id = capturedRef.current
    // M399 (A7). A shell control that held the keyboard at open (the ⚙
    // reached with Tab) gets it back: that trigger, not a terminal, is where
    // the keyboard was, and restoring the captured panel would type the next
    // key into an agent the person had tabbed away from. A pointer open never
    // moved focus (shellControl), so `back` is null and rule 4 runs as before.
    if (back !== null && back.isConnected) back.focus()
    // Restore the terminal's keyboard. Nothing else gives it back: the input
    // is about to unmount, and an unmounted element's blur focuses <body>.
    else if (id) depsRef.current.restoreFocus(id)
  }, [])

  // Rule 4 with its one documented exception; see the interface above.
  const dismissPalette = useCallback(() => {
    setOpen(false)
    setScopeState(null)
    setEntryScope(null)
    returnRef.current = null
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
      // M42. Cmd+F opens the palette straight into the search scope — the
      // query box IS the search term. Free of every TUI claim (bare keys are
      // theirs; Cmd chords are ours), matched on event.code so a rebound
      // layout still gets the physical F key.
      if (event.code === 'KeyF') {
        event.preventDefault()
        if (event.repeat) return
        if (openRef.current && scopeRef.current === 'search') closePalette()
        else openPalette('search')
        return
      }
      if (event.key !== 'k' && event.key !== 'K') return
      // D4 (R-009). While a panel is focus-locked, ⌘K is the terminal's Clear.
      // Returning before preventDefault lets the key reach xterm. Swallowing
      // it here would clear nothing and open nothing.
      if (focusLocked()) return
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

  return { open, capturedId, capturedDraft, openPalette, closePalette, dismissPalette, isOpen, scope, setScope, entryScope }
}
