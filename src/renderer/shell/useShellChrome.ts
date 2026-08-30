import { useCallback, useEffect, useState } from 'react'

export interface ShellChrome {
  railOpen: boolean
  inspectorOpen: boolean
  treeOpen: boolean
  toggleRail: () => void
  toggleInspector: () => void
  toggleTree: () => void
}

/**
 * Rail and inspector visibility, persisted through main's settings store.
 *
 * Read at mount AND on every change to main's setting rows, and written
 * through settings:set — never held only in React state. The preferences map
 * is already the one place a user toggle lives ("One map, and a typed view
 * over it"), and a second store for two booleans would be exactly the drift
 * that entry exists to prevent.
 *
 * `settingsSignal` is what closes the last hop of that rule. Both settings are
 * ordinary boolean `SettingDef`s, so main's `settings:list` auto-generates a
 * runnable palette row for each of them — nobody wrote those rows and nobody
 * wired them to this hook. Running one writes to main's store and reloads
 * `settingRows`; without a dependency on that reload, the store changes and
 * the frame does not, so the row's own title ("Show the side rail: Off")
 * reads the opposite of what is on screen until the next launch. The value is
 * used for its IDENTITY only — the list is re-read from main rather than
 * picked out of the passed rows, exactly as `glowEnabled`/`pipsEnabled` do in
 * `Canvas.tsx`, because `settingRows` is empty until the palette has been
 * opened and the frame has to be right on the first paint.
 * `verify:panels` 78 is the check.
 */
export function useShellChrome(deps: {
  paletteIsOpen: () => boolean
  /** Change signal, compared by identity; see the note above. */
  settingsSignal: unknown
}): ShellChrome {
  const { paletteIsOpen, settingsSignal } = deps
  const [railOpen, setRailOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  // Matches the schema default, so the first paint is right before the
  // settings read below resolves.
  const [treeOpen, setTreeOpen] = useState(false)

  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const rail = rows.find((r) => r.id === 'shell.railOpen')
      const inspector = rows.find((r) => r.id === 'shell.inspectorOpen')
      const tree = rows.find((r) => r.id === 'files.treeOpen')
      if (rail) setRailOpen(rail.value === true)
      if (inspector) setInspectorOpen(inspector.value === true)
      if (tree) setTreeOpen(tree.value === true)
    })
  }, [settingsSignal])

  // The IPC write is deliberately OUTSIDE the setState updater. A React state
  // updater must be pure — under StrictMode it is invoked twice, and a side
  // effect inside it fires twice too, which is the same hazard Canvas.tsx's
  // `commitHistory` comment flags. main.tsx omits StrictMode today, so the
  // updater form was not actually broken; it was one `<StrictMode>` away from
  // writing every toggle to the store twice. Reading `railOpen` from the
  // closure costs this callback its stable identity, which is fine: its only
  // consumers are the keydown effect below (which already depends on it) and
  // a button's onClick.
  const toggleRail = useCallback(() => {
    const next = !railOpen
    setRailOpen(next)
    void window.canvas.settings.set('shell.railOpen', next)
  }, [railOpen])

  const toggleInspector = useCallback(() => {
    const next = !inspectorOpen
    setInspectorOpen(next)
    void window.canvas.settings.set('shell.inspectorOpen', next)
  }, [inspectorOpen])

  const toggleTree = useCallback(() => {
    const next = !treeOpen
    setTreeOpen(next)
    void window.canvas.settings.set('files.treeOpen', next)
  }, [treeOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Cmd, and only Cmd — the same gate every canvas shortcut obeys so that
      // a bare keystroke always reaches the PTY.
      if (!event.metaKey || event.ctrlKey || event.altKey) return
      // Cmd+B. Free — Cmd+0/1/=/+/-/n/j are useViewport's, Cmd+K is the
      // palette's, Cmd+G is the nav grid's, Cmd+\ and Cmd+Shift+\ are the two
      // above, and Cmd+Z/C/V are menu accelerators — and it is the chord a
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
        toggleTree()
        return
      }
      // event.code, not event.key: with Shift held macOS reports key '|', so
      // a key check would silently miss the inspector's chord.
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
      // A held toggle would flicker the region at the OS repeat rate and
      // leave it open or closed depending on whether the user released on an
      // odd or an even repeat — the Cmd+K defect exactly. Not in
      // REPEATABLE_KEYS, and not an allow-list case: for a toggle the repeat
      // stream is never the feature.
      if (event.repeat) return
      if (event.shiftKey) toggleInspector()
      else toggleRail()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paletteIsOpen, toggleRail, toggleInspector, toggleTree])

  return { railOpen, inspectorOpen, treeOpen, toggleRail, toggleInspector, toggleTree }
}
