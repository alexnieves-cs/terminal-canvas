import { useEffect } from 'react'

/**
 * M40. Cmd+Shift+I arms and disarms broadcast input — the palette row's
 * verb on a chord, so a user who arms the mode by keyboard can end it by
 * keyboard without opening the palette (M31's only exit). The letter is I
 * because Cmd+Shift+B, the obvious spelling, is NOT free: useShellChrome
 * matches `KeyB` without testing Shift, so Cmd+Shift+B toggles the tree.
 *
 * The shape is useDiagnostics's, deliberately: metaKey-only, event.code
 * (Shift rewrites event.key, the lesson verify:panels 80 pins), the
 * palette-closed gate, preventDefault BEFORE the repeat bail. `toggle` is
 * the palette action read through a ref by the caller, so the listener is
 * installed once and never goes stale.
 */
export function useBroadcastChord(deps: { paletteIsOpen: () => boolean; toggle: () => void }): void {
  const { paletteIsOpen, toggle } = deps
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.metaKey || !event.shiftKey || event.ctrlKey || event.altKey) return
      if (event.code !== 'KeyI') return
      if (paletteIsOpen()) return
      event.preventDefault()
      if (event.repeat) return
      toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paletteIsOpen, toggle])
}
