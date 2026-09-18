import { useEffect, useState } from 'react'
import type { CardDetail } from './card-detail'

/**
 * Zoom-level crossfade for card-detail.ts's render tier.
 *
 * A tier change used to swap a card's whole representation in one frame. This
 * hook remembers the tier being LEFT for TIER_FADE_MS so the caller can draw it
 * as a ghost layer fading out over the incoming one. The ghost is always
 * absolutely positioned by the caller: it never takes part in layout, so the
 * frame's geometry — and a live xterm's fit — cannot move during the fade.
 *
 * The leaving tier is derived DURING render (React's "store the previous prop"
 * pattern) rather than in an effect, so the first frame of the new tier already
 * carries its ghost — an effect would paint one un-faded frame first, which is
 * the abrupt switch this exists to remove.
 *
 * Reduced motion: no ghost, the old instant swap.
 */
export const TIER_FADE_MS = 180

function reducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

export function useTierFade(detail: CardDetail): CardDetail | null {
  const [state, setState] = useState<{ current: CardDetail; leaving: CardDetail | null }>({ current: detail, leaving: null })
  let leaving = state.leaving
  if (state.current !== detail) {
    leaving = reducedMotion() ? null : state.current
    setState({ current: detail, leaving })
  }
  useEffect(() => {
    if (state.leaving === null) return
    const timer = window.setTimeout(() => setState((s) => ({ current: s.current, leaving: null })), TIER_FADE_MS)
    return () => window.clearTimeout(timer)
  }, [state.leaving, state.current])
  return leaving === detail ? null : leaving
}
