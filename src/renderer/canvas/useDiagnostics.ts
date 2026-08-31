import { useCallback, useEffect, useState } from 'react'

export interface Diagnostics {
  open: boolean
  toggle: () => void
  close: () => void
}

/**
 * Backlog #75's overlay toggle. Modeled directly on `useShellChrome.ts`'s
 * Cmd+B/Cmd+\ handling: metaKey-only, event.code (never event.key — Shift
 * rewrites the printed character, the lesson `verify:panels` 80 pins), gated
 * on the palette being closed (rule 3 of "who owns the keyboard"), and
 * preventDefault BEFORE the repeat bail so the tail of a held chord is still
 * swallowed rather than leaking to the focused agent's PTY.
 *
 * Ephemeral component state only, unlike `shell.railOpen`/`shell.inspectorOpen`:
 * this is a debug view, not a persisted preference, so it does not go through
 * settings:list/settings:set.
 */
export function useDiagnostics(deps: { paletteIsOpen: () => boolean }): Diagnostics {
  const { paletteIsOpen } = deps
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((v) => !v), [])
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.ctrlKey || event.altKey) return
      // Cmd+D. Free — Cmd+0/1/=/+/-/n/j are useViewport's, Cmd+K is the
      // palette's, Cmd+G is the nav grid's, Cmd+B is the tree's, Cmd+\ and
      // Cmd+Shift+\ are the rail/inspector's, Cmd+Shift+[/] step workspaces,
      // Cmd+Shift+A toggles the merged view, and Cmd+Z/C/V are menu
      // accelerators.
      if (event.code !== 'KeyD') return
      if (paletteIsOpen()) return
      event.preventDefault()
      // A held toggle would flicker the overlay at the OS repeat rate and
      // leave it open or closed depending on whether the user released on an
      // odd or an even repeat — the Cmd+K defect exactly. Not in
      // REPEATABLE_KEYS: for a toggle the repeat stream is never the feature.
      if (event.repeat) return
      toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paletteIsOpen, toggle])

  return { open, toggle, close }
}
