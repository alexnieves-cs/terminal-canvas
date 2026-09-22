import { useCallback, useState } from 'react'
import type { ShellBreakpoint } from './useShellBreakpoint'

const KEY = 'tc.dockExpanded'

/**
 * Backlog #13. Whether the dock shows its names as a labelled rail. The
 * stored preference is tri-state on purpose: ABSENT means "follow the
 * breakpoint" (Wide labels, narrower is icons — the M257 default), so a person
 * who never presses the toggle sees exactly what they saw before it existed.
 * A per-viewer convenience, so localStorage, wrapped: storage can throw.
 */
function readPref(): boolean | null {
  try {
    const v = window.localStorage.getItem(KEY)
    return v === 'true' ? true : v === 'false' ? false : null
  } catch { return null }
}

export function useDockExpanded(bp: ShellBreakpoint): { expanded: boolean; toggle: () => void } {
  const [pref, setPref] = useState<boolean | null>(readPref)
  const expanded = pref ?? bp === 'wide'
  const toggle = useCallback(() => {
    const next = !expanded
    setPref(next)
    try { window.localStorage.setItem(KEY, next ? 'true' : 'false') } catch { /* this page keeps it */ }
  }, [expanded])
  return { expanded, toggle }
}
