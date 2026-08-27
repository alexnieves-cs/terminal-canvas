import { useCallback, useEffect, useState } from 'react'

export interface ShellChrome {
  railOpen: boolean
  inspectorOpen: boolean
  toggleRail: () => void
  toggleInspector: () => void
}

/**
 * Rail and inspector visibility, persisted through main's settings store.
 *
 * Read at mount and written through settings:set — never held only in React
 * state. The preferences map is already the one place a user toggle lives
 * ("One map, and a typed view over it"), and a second store for two booleans
 * would be exactly the drift that entry exists to prevent.
 */
export function useShellChrome(deps: { paletteIsOpen: () => boolean }): ShellChrome {
  const { paletteIsOpen } = deps
  const [railOpen, setRailOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)

  // Read once at mount. Like glowEnabled and pipsEnabled in Canvas.tsx, this
  // cannot ride settingRows: that list loads only when the palette OPENS, and
  // the frame has to be right on the first paint whether or not the user has
  // ever pressed Cmd+K.
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const rail = rows.find((r) => r.id === 'shell.railOpen')
      const inspector = rows.find((r) => r.id === 'shell.inspectorOpen')
      if (rail) setRailOpen(rail.value === true)
      if (inspector) setInspectorOpen(inspector.value === true)
    })
  }, [])

  const toggleRail = useCallback(() => {
    setRailOpen((open) => {
      const next = !open
      void window.canvas.settings.set('shell.railOpen', next)
      return next
    })
  }, [])

  const toggleInspector = useCallback(() => {
    setInspectorOpen((open) => {
      const next = !open
      void window.canvas.settings.set('shell.inspectorOpen', next)
      return next
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Cmd, and only Cmd — the same gate every canvas shortcut obeys so that
      // a bare keystroke always reaches the PTY.
      if (!event.metaKey || event.ctrlKey || event.altKey) return
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
  }, [paletteIsOpen, toggleRail, toggleInspector])

  return { railOpen, inspectorOpen, toggleRail, toggleInspector }
}
