/**
 * Semantic zoom's three tiers (M437). Pure: no React, no DOM.
 *
 * Work (≥ 0.70) is live terminals. Plan (0.25–0.70) is a card with one
 * sentence. Map (< 0.25) is territories and state dots. `card-detail.ts`
 * answers how a card draws; this answers which tier the canvas is in. It
 * does not ration WebGL contexts — `lod.ts` does, and its budget, its scale
 * floor, its dormancy rule and its focused-panel rule are not touched.
 *
 * Hysteresis is ±0.03 at each threshold. A pinch sitting on 0.70 would
 * otherwise flip every panel twice a frame. Inside the band the tier you
 * are already in stands; crossing the far edge of the band is what changes
 * it. A jump that skips a tier (work straight to map) takes the nominal
 * answer, so the band cannot pin you to a tier you have already left.
 *
 * Plan and Map feed `lod.ts` through its existing `cardIds` input. A panel
 * in that set is a card and its session is not ended. Entering either tier
 * while a terminal holds focus releases that focus first, on the same path
 * ⌘Esc uses (`useKeyboardNav`: blur the active element, `releaseFocus()`
 * which is `setFocusedId(null)`, then focus the canvas host). The focused
 * panel is live unconditionally, including below `LIVE_MIN_SCALE`, so a
 * keystroke would land in it — and once it is a card, a keystroke must not.
 * Releasing focus is what keeps those two sentences from both being true.
 */

import type { ZoomTier } from '@shared/redesign-contracts'

/** The nominal thresholds, before hysteresis. */
export const TIER_AT = { work: 0.70, plan: 0.25 } as const

/** How far past a threshold the current tier keeps standing. */
export const TIER_HYSTERESIS = 0.03

/**
 * Where ⌘1 / ⌘2 / ⌘3 put the scale. Each one is inside its tier even when
 * entered from the neighbour, past that neighbour's hysteresis band.
 * Plan is the mockup's 34%. Map is the overview shot's 18%.
 */
export const TIER_TARGET: Record<ZoomTier, number> = {
  work: 1,
  plan: 0.34,
  map: 0.18
}

// Thousandths, so 0.70 ± 0.03 is 670 and 730 and not a binary residue.
const WORK_NOMINAL = 700
const PLAN_NOMINAL = 250
const WORK_LEAVE = 670
const WORK_ENTER = 730
const PLAN_LEAVE = 220
const PLAN_ENTER = 280

function milli(scale: number): number {
  return Math.round(scale * 1000)
}

function nominal(scale: number): ZoomTier {
  const m = milli(scale)
  if (m >= WORK_NOMINAL) return 'work'
  if (m >= PLAN_NOMINAL) return 'plan'
  return 'map'
}

/**
 * The tier at `scale`, given the tier already showing. Omit `prev` (or pass
 * a scale that is already in `prev`) and the answer is the nominal band.
 * A non-finite scale keeps `prev`, or Map when there is nothing to keep:
 * claiming Work for a scale that is not a number would mount live terminals.
 */
export function tierFor(scale: number, prev?: ZoomTier): ZoomTier {
  if (!Number.isFinite(scale)) return prev ?? 'map'
  const next = nominal(scale)
  if (prev === undefined || prev === next) return next
  const m = milli(scale)
  const acrossWork = (prev === 'work' && next === 'plan') || (prev === 'plan' && next === 'work')
  if (acrossWork && m >= WORK_LEAVE && m < WORK_ENTER) return prev
  const acrossPlan = (prev === 'plan' && next === 'map') || (prev === 'map' && next === 'plan')
  if (acrossPlan && m >= PLAN_LEAVE && m < PLAN_ENTER) return prev
  return next
}

/**
 * The set `assignTiers` takes as `cardIds`. Work contributes nothing, so
 * the live budget still decides. Plan and Map card every panel they are
 * given: a card is not a disposed session.
 */
export function cardIdsForTier(tier: ZoomTier, panelIds: readonly string[]): ReadonlySet<string> {
  if (tier === 'work') return new Set()
  return new Set(panelIds)
}

export interface TierEntry {
  tier: ZoomTier
  /**
   * True when the tier being entered is Plan or Map and a panel holds focus.
   * The caller runs the ⌘Esc path before applying `cardIds`: blur, then
   * `releaseFocus()` (`setFocusedId(null)`), then focus the canvas host.
   */
  releaseFocus: boolean
  /** Pass to `assignTiers` as `cardIds` after focus has been released. */
  cardIds: ReadonlySet<string>
}

/**
 * What a scale change means for focus and for `lod.ts`. Focus is released
 * on the way into Plan or Map, including when the previous tier was already
 * one of those and a terminal is somehow still focused. Entering Work does
 * not release: that is the tier a terminal is focused in.
 */
export function enterTier(input: {
  scale: number
  prev?: ZoomTier
  focusedId: string | null
  panelIds: readonly string[]
}): TierEntry {
  const tier = tierFor(input.scale, input.prev)
  return {
    tier,
    releaseFocus: tier !== 'work' && input.focusedId !== null,
    cardIds: cardIdsForTier(tier, input.panelIds)
  }
}
