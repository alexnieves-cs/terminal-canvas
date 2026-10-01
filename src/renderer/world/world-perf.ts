/**
 * What keeps the 3D world view cheap and honest about where it can run — as
 * pure functions, no three.js and no React, so `verify:world` runs every rule
 * in plain node and the files that draw only apply what this decides.
 *
 * Three limits, all of them about a view that must never cost the 2D canvas
 * anything: the size of the picture (pixel ratio), how many cards the DOM
 * carries over it (a card is a live React tree that follows a 3D point every
 * frame), and the screens it will not open on at all.
 */

/**
 * The narrowest window the world opens in. Below it the room is a postage
 * stamp, the orbit gesture fights the page's own scroll, and a second WebGL
 * context is a lot to ask of a phone-class GPU — so the view says so instead of
 * trying (see `WorldStage`).
 */
export const WORLD_MIN_WIDTH = 900

export function worldFits(width: number): boolean {
  return width >= WORLD_MIN_WIDTH
}

/** The pixel ratio the view starts at and never exceeds: past this a retina canvas costs 2x the fill for no visible gain at this scale. */
export const DPR_MAX = 1.75
export const DPR_MIN = 1

/**
 * The pixel ratio, given the display's own — clamped into [DPR_MIN, DPR_MAX].
 * A 3x phone display and a 2x laptop both land at the cap; a 1x monitor stays
 * at 1. (R3F clamps `dpr={[min, max]}` itself; this is the same rule where the
 * governor below needs a number.)
 */
export function clampDpr(devicePixelRatio: number, max: number = DPR_MAX): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return DPR_MIN
  return Math.min(max, Math.max(DPR_MIN, devicePixelRatio))
}

/** Below this the picture is dropping frames a person can see. */
export const LOW_FPS = 40
/** How many half-second windows in a row must be low before the ratio steps down — a shader compile or a model load is not a trend. */
export const LOW_WINDOWS = 3
/** What one step costs. */
export const DPR_STEP = 0.25

export interface DprGovernor {
  /** One window's fps. The new pixel ratio when it should change, else null. */
  observe(fps: number): number | null
  /** The window was not a clean measurement (the page was hidden, the frame loop stalled): forget the streak. */
  gap(): void
  readonly dpr: number
}

/**
 * Steps the pixel ratio DOWN, and only down, after a sustained run of low
 * frame rates. Down-only on purpose: lowering it is what raises the frame
 * rate, so a rule that also stepped back up would oscillate between the two
 * and the picture would shimmer for as long as the view was open.
 */
export function createDprGovernor(start: number): DprGovernor {
  let dpr = clampDpr(start)
  let low = 0
  return {
    observe(fps) {
      if (fps >= LOW_FPS) { low = 0; return null }
      low += 1
      if (low < LOW_WINDOWS || dpr <= DPR_MIN) return null
      low = 0
      dpr = Math.max(DPR_MIN, dpr - DPR_STEP)
      return dpr
    },
    gap() { low = 0 },
    get dpr() { return dpr }
  }
}

/** How many agents get a full status card; the rest get a status dot. */
export const CARD_BUDGET = 6
/** How much closer an agent without a full card must be to take one from an agent that has it — so two at the same distance do not trade places every time the camera breathes. */
export const CARD_HYSTERESIS = 0.85

export interface CardCandidate {
  agentId: string
  /** From the camera to the agent, in world units. */
  distance: number
}

/**
 * The agents that get a FULL card: the nearest `max`, with the incumbents'
 * distances discounted so a challenger has to be clearly nearer to displace one.
 * Returns `current` itself (same object) when nothing changed, so a caller can
 * skip the re-render by identity.
 */
export function cardTiers(candidates: readonly CardCandidate[], current: ReadonlySet<string>, max: number = CARD_BUDGET): ReadonlySet<string> {
  const ranked = candidates
    .map((c) => ({ id: c.agentId, rank: current.has(c.agentId) ? c.distance * CARD_HYSTERESIS : c.distance }))
    .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1))
    .slice(0, max)
    .map((c) => c.id)
  const same = ranked.length === current.size && ranked.every((id) => current.has(id))
  return same ? current : new Set(ranked)
}

/** The reduced-motion query, read live — a person may flip the setting while the view is open. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
