import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * M512. THE SLIDING THUMB. A segmented control's lit segment and a tab strip's
 * underline used to jump: the old option lost its fill and the new one gained
 * it in the same frame, so a switch read as a flicker in two places rather
 * than one light moving. This measures the pressed/selected child and hands
 * its box to the container as `--thumb-x` / `--thumb-w`; the stylesheet draws
 * ONE thumb from those and slides it on `--dur-2` (`st:F`).
 *
 * `offsetLeft`/`offsetWidth`, never `getBoundingClientRect`: a control can sit
 * under a transform (a zoom, a drawer sliding in), and layout boxes are what
 * the thumb is positioned in. The container is made positioned by the same
 * stylesheet rule, so it is the children's `offsetParent`.
 *
 * `data-thumb` is `ready` for the first measure and `live` from the next frame:
 * the thumb must APPEAR where it belongs, not slide in from x = 0 on mount.
 * Re-measured on resize, because a badge or a count changes a label's width
 * with no change to `value`.
 */
export function useSlidingThumb<T extends HTMLElement>(value: string, selector: string): RefObject<T | null> {
  const ref = useRef<T | null>(null)
  useLayoutEffect(() => {
    const host = ref.current
    if (host === null) return
    const measure = (): void => {
      const on = host.querySelector<HTMLElement>(selector)
      if (on === null || on.offsetWidth === 0) { host.removeAttribute('data-thumb'); return }
      host.style.setProperty('--thumb-x', `${on.offsetLeft}px`)
      host.style.setProperty('--thumb-w', `${on.offsetWidth}px`)
      if (host.getAttribute('data-thumb') !== 'live') host.setAttribute('data-thumb', 'ready')
    }
    measure()
    const live = requestAnimationFrame(() => { if (host.hasAttribute('data-thumb')) host.setAttribute('data-thumb', 'live') })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(host)
    for (const child of Array.from(host.children)) ro?.observe(child)
    return () => { cancelAnimationFrame(live); ro?.disconnect() }
  }, [value, selector])
  return ref
}
