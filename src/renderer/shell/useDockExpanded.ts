import { useCallback, useState } from 'react'
import type { ShellBreakpoint } from './useShellBreakpoint'

const KEY = 'tc.dockExpanded'

/**
 * Backlog #13. Whether the dock shows its names as a labelled rail. The
 * stored preference is tri-state on purpose: ABSENT means the default, and a
 * pressed toggle is remembered either way. M700 (Strip bay) made the default
 * the icon column at every width: the bay is the 330px column the work lives
 * in, so the names are one press away rather than 156px of every screen.
 * A per-viewer convenience, so localStorage, wrapped: storage can throw.
 */
function readPref(): boolean | null {
  try {
    const v = window.localStorage.getItem(KEY)
    return v === 'true' ? true : v === 'false' ? false : null
  } catch { return null }
}

export function useDockExpanded(_bp: ShellBreakpoint): { expanded: boolean; toggle: () => void } {
  const [pref, setPref] = useState<boolean | null>(readPref)
  const expanded = pref ?? false
  const toggle = useCallback(() => {
    const next = !expanded
    setPref(next)
    try { window.localStorage.setItem(KEY, next ? 'true' : 'false') } catch { /* this page keeps it */ }
  }, [expanded])
  return { expanded, toggle }
}
