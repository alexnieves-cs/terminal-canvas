import { useCallback, useEffect, useRef, useState } from 'react'
import { DOCK_ORDER, type NavPaneId } from './nav-dock'

export interface ShellChrome {
  /** Which navigator pane is open, or null for none. */
  navigatorPane: NavPaneId | null
  /** Selecting the ACTIVE pane collapses it — one control, two directions. */
  selectPane: (id: NavPaneId) => void
  /** Open the last-used pane, or close whichever is open. */
  toggleNavigator: () => void
  contextOpen: boolean
  toggleContext: () => void

  // -- Retired, and kept only until the grid is rewired -------------------
  // Canvas still renders the old four-column frame, so these are DERIVED from
  // the two real values above rather than stored beside them. Two sources for
  // one fact is the drift "One map, and a typed view over it" exists to
  // prevent, and deriving is what makes the intermediate state honest rather
  // than merely compiling. They go when the grid does.
  railOpen: boolean
  inspectorOpen: boolean
  treeOpen: boolean
  toggleRail: () => void
  toggleInspector: () => void
  toggleTree: () => void
}

/** The pane a fresh `toggleNavigator` opens, and the schema's own default.
 *  Panels rather than Workspaces because it is what the rail this replaces
 *  showed most of, and because a canvas with one workspace has a Workspaces
 *  pane with one row in it. */
const DEFAULT_PANE: NavPaneId = 'panels'

function asPane(value: unknown): NavPaneId | null {
  // 'none' is a legitimate stored value meaning "closed", and every other
  // string is checked against DOCK_ORDER rather than trusted: parsePreferences
  // guards the load door and setPreference guards the write door, but this is
  // a THIRD reader, and a value that reached here from a build that knew a
  // fifth pane must render as closed rather than as a pane this build cannot
  // draw.
  if (typeof value !== 'string' || value === 'none') return null
  return (DOCK_ORDER as readonly string[]).includes(value) ? (value as NavPaneId) : null
}

/**
 * Navigator and context visibility, persisted through main's settings store.
 *
 * Read at mount AND on every change to main's setting rows, and written
 * through settings:set — never held only in React state. The preferences map
 * is already the one place a user toggle lives ("One map, and a typed view
 * over it"), and a second store for these would be exactly the drift that
 * entry exists to prevent.
 *
 * `settingsSignal` is what closes the last hop of that rule. Both settings are
 * ordinary `SettingDef`s, so main's `settings:list` auto-generates a runnable
 * palette row for each of them — nobody wrote those rows and nobody wired them
 * to this hook. Running one writes to main's store and reloads `settingRows`;
 * without a dependency on that reload, the store changes and the frame does
 * not, so the row's own title reads the opposite of what is on screen until
 * the next launch. The value is used for its IDENTITY only — the list is
 * re-read from main rather than picked out of the passed rows, exactly as
 * `glowEnabled`/`pipsEnabled` do in `Canvas.tsx`, because `settingRows` is
 * empty until the palette has been opened and the frame has to be right on the
 * first paint. `verify:panels` 79 is the check.
 *
 * NOTHING IS WRITTEN AT MOUNT. The preferences map is sparse on purpose — an
 * absent id means "still at the schema default" — and writing a value here
 * would make every user explicit on their first launch, which is what would
 * destroy the adaptive residency this milestone runs on.
 */
export function useShellChrome(deps: {
  paletteIsOpen: () => boolean
  /** Change signal, compared by identity; see the note above. */
  settingsSignal: unknown
}): ShellChrome {
  const { paletteIsOpen, settingsSignal } = deps
  // Matches the schema defaults, so the first paint is right before the
  // settings read below resolves.
  const [navigatorPane, setNavigatorPane] = useState<NavPaneId | null>(DEFAULT_PANE)
  const [contextOpen, setContextOpen] = useState(true)

  // The pane toggleNavigator reopens. A REF and not state: nothing renders it,
  // so making it state would re-render the whole shell every time a pane
  // changed in order to store a value only a callback reads.
  const lastPaneRef = useRef<NavPaneId>(DEFAULT_PANE)

  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const nav = rows.find((r) => r.id === 'shell.navigatorPane')
      const context = rows.find((r) => r.id === 'shell.contextOpen')
      if (nav) {
        const pane = asPane(nav.value)
        setNavigatorPane(pane)
        // Only a REAL pane seeds the reopen target. A stored 'none' means the
        // user closed the navigator, not that they want it reopened onto
        // nothing — so the ref keeps whatever it had.
        if (pane !== null) lastPaneRef.current = pane
      }
      if (context) setContextOpen(context.value === true)
    })
  }, [settingsSignal])

  // The IPC write is deliberately OUTSIDE the setState updater. A React state
  // updater must be pure — under StrictMode it is invoked twice, and a side
  // effect inside it fires twice too, which is the same hazard Canvas.tsx's
  // `commitHistory` comment flags. main.tsx omits StrictMode today, so the
  // updater form was not actually broken; it was one `<StrictMode>` away from
  // writing every toggle to the store twice. Reading state from the closure
  // costs these callbacks their stable identity, which is fine: their only
  // consumers are the keydown effect below (which already depends on them) and
  // a button's onClick.
  const selectPane = useCallback((id: NavPaneId) => {
    // Selecting the ACTIVE pane collapses it. One control, two directions —
    // the same toggle the dock button's aria-pressed already describes — and
    // it means a user who opened a pane can close it without hunting for a
    // second affordance.
    const next = navigatorPane === id ? null : id
    setNavigatorPane(next)
    if (next !== null) lastPaneRef.current = next
    void window.canvas.settings.set('shell.navigatorPane', next ?? 'none')
  }, [navigatorPane])

  const toggleNavigator = useCallback(() => {
    const next = navigatorPane === null ? lastPaneRef.current : null
    setNavigatorPane(next)
    void window.canvas.settings.set('shell.navigatorPane', next ?? 'none')
  }, [navigatorPane])

  const toggleContext = useCallback(() => {
    const next = !contextOpen
    setContextOpen(next)
    void window.canvas.settings.set('shell.contextOpen', next)
  }, [contextOpen])

  const toggleTree = useCallback(() => { selectPane('files') }, [selectPane])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Cmd, and only Cmd — the same gate every canvas shortcut obeys so that
      // a bare keystroke always reaches the PTY.
      if (!event.metaKey || event.ctrlKey || event.altKey) return
      // Cmd+B. Free — Cmd+0/1/=/+/-/n/j are useViewport's, Cmd+K is the
      // palette's, Cmd+G is the nav grid's, Cmd+\ and Cmd+Shift+\ are the two
      // below, and Cmd+Z/C/V are menu accelerators — and it is the chord a
      // user already has muscle memory for as "toggle the file sidebar".
      if (event.code === 'KeyB') {
        if (paletteIsOpen()) return
        // preventDefault BEFORE the repeat bail, like the branch below: this
        // rejects a chord that IS ours and we are declining to act on, so the
        // tail of a held Cmd+B must still be swallowed rather than leaking to
        // the focused agent's PTY.
        event.preventDefault()
        // For a toggle the repeat stream is NEVER the feature: held, it would
        // flicker the column at the OS repeat rate and leave it open or closed
        // depending on whether the user released on an odd or an even repeat —
        // the Cmd+K defect exactly. Not in REPEATABLE_KEYS and not a candidate
        // for it.
        if (event.repeat) return
        selectPane('files')
        return
      }
      // event.code, not event.key: with Shift held macOS reports key '|', so
      // a key check would silently miss the context pane's chord.
      if (event.code !== 'Backslash') return
      // Canvas shortcuts stand down while the palette is open — rule 3 of
      // "who owns the keyboard". isOpen reads a ref, so this listener is not
      // torn down and rebuilt on every open and close.
      if (paletteIsOpen()) return
      // preventDefault BEFORE the repeat bail, unlike the modifier checks
      // above: those reject a chord that is not ours, while this one rejects
      // a chord that IS ours and we are declining to act on, so the tail of a
      // held Cmd+\ must still be swallowed rather than leaking to the focused
      // agent's PTY.
      event.preventDefault()
      // A held toggle would flicker the region at the OS repeat rate and leave
      // it open or closed depending on whether the user released on an odd or
      // an even repeat — the Cmd+K defect exactly.
      if (event.repeat) return
      // The MAPPING is inherited, not chosen: Cmd+\ moved the left region and
      // Cmd+Shift+\ the right one, so each chord keeps the region it had, now
      // pointing at that region's successor. The plan said Cmd+\ should reach
      // the CONTEXT pane, which contradicts its own stated reason for keeping
      // these chords at all — existing muscle memory — so the reason wins.
      if (event.shiftKey) toggleContext()
      else toggleNavigator()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paletteIsOpen, toggleNavigator, toggleContext, selectPane])

  return {
    navigatorPane,
    selectPane,
    toggleNavigator,
    contextOpen,
    toggleContext,
    // Derived, never stored — see the interface note.
    railOpen: navigatorPane !== null,
    inspectorOpen: contextOpen,
    treeOpen: navigatorPane === 'files',
    toggleRail: toggleNavigator,
    toggleInspector: toggleContext,
    toggleTree
  }
}
