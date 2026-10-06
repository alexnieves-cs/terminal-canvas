import type { ZoomTier } from '@shared/redesign-contracts'

/**
 * M57 — semantic zoom's RENDER tier.
 *
 * Deliberately not a fourth state in lod.ts's assignTiers: that function
 * rations WebGL contexts and PTYs and is plain-node tested for exactly that,
 * so it must not start making typography decisions. This one reads the same
 * scale and answers a different question — how a CARD draws itself — with
 * no resource consequence at all.
 *
 * Hysteresis, because a pinch hovering on a boundary would otherwise flip
 * every card on the canvas twice a frame: each tier is entered below one
 * scale and left above a HIGHER one. The bands are (0.26, 0.32) for
 * tail/summary, (0.16, 0.20) for block, and (0.12, 0.15) for cluster —
 * cluster sits above MIN_SCALE (0.1) so far-view hulls can actually paint.
 * Inside a band the current tier stands.
 */
export type CardDetail = 'tail' | 'summary' | 'block' | 'cluster'

export const SUMMARY_ENTER = 0.26
export const SUMMARY_LEAVE = 0.32
/** Raised so the cluster band sits above MIN_SCALE (0.1) and still below summary. */
export const BLOCK_ENTER = 0.16
export const BLOCK_LEAVE = 0.20
/** M270. Below this (and above MIN_SCALE), task/group silhouettes replace miniature blocks. */
export const CLUSTER_ENTER = 0.12
export const CLUSTER_LEAVE = 0.15

export function nextCardDetail(current: CardDetail, scale: number): CardDetail {
  switch (current) {
    case 'tail':
      if (scale < CLUSTER_ENTER) return 'cluster'
      if (scale < BLOCK_ENTER) return 'block'
      if (scale < SUMMARY_ENTER) return 'summary'
      return 'tail'
    case 'summary':
      if (scale < CLUSTER_ENTER) return 'cluster'
      if (scale < BLOCK_ENTER) return 'block'
      if (scale > SUMMARY_LEAVE) return 'tail'
      return 'summary'
    case 'block':
      if (scale < CLUSTER_ENTER) return 'cluster'
      if (scale > SUMMARY_LEAVE) return 'tail'
      if (scale > BLOCK_LEAVE) return 'summary'
      return 'block'
    case 'cluster':
      if (scale > SUMMARY_LEAVE) return 'tail'
      if (scale > BLOCK_LEAVE) return 'summary'
      if (scale > CLUSTER_LEAVE) return 'block'
      return 'cluster'
  }
}

/**
 * M395 (the critic's P1 #3). READING FROM AFAR: the far tier's name split so
 * the part that TELLS CARDS APART survives. Agent names are `<agent> —
 * <place>` (`claude — api (2)`), and an ellipsis at the end cut all four of
 * the fixture's agents to the same `claude — …`. The kicker (`claude`) is the
 * part that may give — one small line, truncated first — and the name
 * (`api (2)`) is what the card is set in. A title with no ` — ` is all name.
 * The separator is kept for the renderer, so the element's text is the title
 * exactly (checks and the near tier's flipped card read it whole).
 */
export const FAR_TITLE_SEPARATOR = ' — '
export function farTitleParts(title: string): { kicker?: string; name: string } {
  const at = title.indexOf(FAR_TITLE_SEPARATOR)
  if (at <= 0) return { name: title }
  const kicker = title.slice(0, at)
  const name = title.slice(at + FAR_TITLE_SEPARATOR.length)
  if (kicker.trim() === '' || name.trim() === '') return { name: title }
  return { kicker, name }
}

/**
 * M444. The one sentence on a Plan card. The agent's last line is the news;
 * the state word is what remains when that line is blank (a fresh terminal
 * often has none). Newlines collapse so a wrapped line stays one sentence.
 */
export function planStatusSentence(stateWord: string, lastLine: string | null | undefined): string {
  const line = (lastLine ?? '').replace(/\s+/g, ' ').trim()
  return line === '' ? stateWord : line
}

/**
 * M444. The minimap's header. A count of zero is not a number on the canvas:
 * the empty sentence lives in the body, and this line says MAP with no digit.
 */
export function minimapHeader(count: number): string {
  if (!(count > 0)) return 'MAP'
  if (count === 1) return 'MAP · 1 TASK'
  return `MAP · ${count} TASKS`
}

/**
 * M444. The tier the canvas is showing, including hysteresis (`enterTier`).
 * The HUD reads it so the Work/Plan/Map switch matches the cards, without
 * Canvas growing a prop for a value the tier mount already computed.
 */
let shownTier: ZoomTier = 'work'
const shownListeners = new Set<() => void>()

export function getShownTier(): ZoomTier {
  return shownTier
}

export function subscribeShownTier(listener: () => void): () => void {
  shownListeners.add(listener)
  return () => { shownListeners.delete(listener) }
}

export function publishShownTier(tier: ZoomTier): void {
  if (shownTier === tier) return
  shownTier = tier
  for (const listener of shownListeners) listener()
}
