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
