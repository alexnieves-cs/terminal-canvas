import { useEffect } from 'react'

/**
 * M645. RADIX'S FOCUS GUARDS ARE TAB STOPS ONLY WHILE A SURFACE IS OPEN.
 *
 * Every Radix menu, popover and dialog content calls `useFocusGuards`, which
 * puts two `<span tabindex="0">` at the very start and end of <body> for as
 * long as the content is MOUNTED. Three of ours are force-mounted from app
 * start (the View menu, the Account menu, the inspector's ⋯ popover), so the
 * guards never leave: the first Tab from a fresh window lands on an invisible
 * span that draws no ring, and so does the last one before the window wraps.
 * A keyboard user sees Tab do nothing, twice per lap.
 *
 * The guards exist so focus can wrap around an OPEN layer, so they are tab
 * stops exactly while one of our surfaces is open, and `-1` otherwise. They
 * are singletons Radix shares across every surface, so the decision is a
 * count of open surfaces, never one surface's own `open`. Each adopter's
 * effect runs after its Radix child's (children's effects run first), so the
 * spans exist by the time this looks for them.
 */
let openSurfaces = 0

function apply(): void {
  const stop = openSurfaces > 0 ? 0 : -1
  document.querySelectorAll<HTMLElement>('[data-radix-focus-guard]').forEach((guard) => { guard.tabIndex = stop })
}

export function useFocusGuardStops(open: boolean): void {
  useEffect(() => {
    if (open) openSurfaces += 1
    apply()
    return () => {
      if (open) openSurfaces = Math.max(0, openSurfaces - 1)
      apply()
    }
  }, [open])
}
