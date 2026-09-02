import { useEffect, useState, type RefObject } from 'react'

/**
 * M46. The shell's breakpoint, measured on THE SHELL — never the window.
 *
 * Three widths, and they are the M23 spec's (§3.4): Compact below 1100,
 * Standard to 1600, Wide above. Below Compact the navigator and the context
 * pane are transient drawers over the canvas; at Standard one pane is
 * resident; at Wide both are.
 *
 * A ResizeObserver on `.shell`, and that is the whole of what this hook
 * measures. The rule the spec states as its most dangerous line (§7.1) is
 * that adaptation must not read `window.innerWidth`: every edge pip and every
 * HUD coordinate is computed against the `.canvas` host's own rect at event
 * time, and a window-derived layout would aim pips at the window's edge while
 * the canvas ends short of it, with nothing thrown. Observing the shell keeps
 * the same property — the canvas still measures itself — while giving the
 * chrome ONE source of truth for the thresholds: the stylesheet keys its
 * column widths off the `data-bp` attribute this value stamps, rather than
 * repeating the numbers in a container query that could drift from these.
 *
 * Not the ResizeObserver the load-bearing note about tiering warns against:
 * that one would be on the CANVAS host, to re-tier on a region toggle, and
 * this observes the shell and touches nothing but chrome state.
 */
export type ShellBreakpoint = 'compact' | 'standard' | 'wide'

export const COMPACT_BELOW = 1100
export const WIDE_FROM = 1600

export function breakpointFor(width: number): ShellBreakpoint {
  if (width < COMPACT_BELOW) return 'compact'
  if (width >= WIDE_FROM) return 'wide'
  return 'standard'
}

export function useShellBreakpoint(shellRef: RefObject<HTMLElement | null>): ShellBreakpoint {
  const [bp, setBp] = useState<ShellBreakpoint>('standard')
  useEffect(() => {
    const el = shellRef.current
    if (!el) return
    const apply = (): void => setBp(breakpointFor(el.getBoundingClientRect().width))
    apply()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [shellRef])
  return bp
}
