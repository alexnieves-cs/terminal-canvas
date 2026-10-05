import { useSyncExternalStore } from 'react'
import { useBloomOn } from './world-bloom'
import { CARD_BUDGET, clampDpr, DPR_MAX, DPR_MIN, DPR_STEP, LOW_FPS, LOW_WINDOWS } from './world-perf'

/**
 * M430: ONE quality tier for the room, decided from the MEASURED frame rate —
 * where M414–M427 had three knobs tuned apart (a pixel-ratio governor, a card
 * budget, and M427's "starved → bloom off" stopgap) and a shadow pass that was
 * always on. It mirrors Orchestrate's `OrchQuality` (`orchestration-platforms.ts`,
 * M292) in shape and in its one rule — the frame decides, never a count — and
 * departs from it in one place on purpose: it never steps back UP (below).
 *
 * Pure of three.js (`verify:world world.door.1` pins the importer set), so every
 * rule runs in plain node; `WorldView`'s `QualityGovernor` feeds it a window's
 * frame rate and applies what it returns. The tier is held in memory for the
 * app's run and NEVER stored — the M427 rule: a person's own choice is the only
 * one written to storage, and a slow GPU this minute is not a preference.
 */

export type WorldQuality = 'full' | 'lean' | 'flat'
export const QUALITY_ORDER: readonly WorldQuality[] = ['full', 'lean', 'flat']

/**
 * What a tier DRAWS. Each item is here because it costs frames, and nothing
 * here removes information — a robot, its status, a waiting request, a file
 * tile and the plan are drawn at every tier (and a waiting or picked agent
 * keeps its full card whatever the budget: `WorldCard`'s `full`).
 */
export interface QualityPlan {
  /**
   * May the bloom composer run. The person's own bloom choice still has to be
   * on (`bloomRenders`). Its cost is fill: a HalfFloat scene buffer, a mip
   * chain and an FXAA pass, ~1.2 ms per megapixel on an M1 Pro (M420).
   */
  readonly bloom: boolean
  /**
   * The key light's shadow-map edge in pixels; 0 = the light casts NO shadow.
   * Its cost is a second render of every caster into the map (the depth pass:
   * the draw calls again) plus a filtered lookup per lit fragment. A smaller
   * map is a quarter of the depth pass's fill at half the edge; 0 removes the
   * pass AND the lookup (see `Lights` in WorldView for why the light's
   * `castShadow`, not the canvas's `shadows`, is the switch that does both).
   */
  readonly shadowMap: number
  /** The highest pixel ratio this tier draws at. Fill is quadratic in it. */
  readonly dprMax: number
  /** How low the ratio steps WITHIN this tier before the tier itself steps down. */
  readonly dprFloor: number
  /**
   * How many agents get a full card (`cardTiers`). A card is a DOM tree that
   * follows a 3D point every frame and is painted over the live canvas with a
   * backdrop blur, so each one is a composited layer re-blurred every frame.
   */
  readonly cards: number
}

/**
 * Full is the M420 room. Lean gives up the composer first — the single
 * full-frame pass, and the one thing a person can see without by only a
 * softer trim — then a quarter of the shadow pass's fill, a lower ratio and a
 * card. Flat is the room with no pass but the scene: no bloom, no shadows,
 * 1x, one card. Robot motion is NOT a tier item: it is a few transforms per
 * robot on the CPU (the matrices are updated every frame anyway), it costs no
 * fill, and a still room would lose the one thing that says who is working.
 * `antialias` is not one either: it is a context attribute, fixed when the
 * context is made, and changing it would mean a new context (`world.door.9`).
 */
const PLANS: Readonly<Record<WorldQuality, QualityPlan>> = {
  full: { bloom: true, shadowMap: 2048, dprMax: DPR_MAX, dprFloor: 1.25, cards: CARD_BUDGET },
  lean: { bloom: false, shadowMap: 1024, dprMax: 1.5, dprFloor: DPR_MIN, cards: 2 },
  flat: { bloom: false, shadowMap: 0, dprMax: DPR_MIN, dprFloor: DPR_MIN, cards: 1 }
}

export function qualityPlan(tier: WorldQuality): QualityPlan {
  return PLANS[tier]
}

/** Bloom renders iff the PERSON has it on AND the tier allows it: the tier can only take the bloom away, never give back one a person turned off. */
export function bloomRenders(personOn: boolean, tier: WorldQuality): boolean {
  return personOn && PLANS[tier].bloom
}

/**
 * Low windows in a row at a tier's pixel-ratio floor before the tier steps
 * down — twice a ratio step's, because a tier change is far more visible (the
 * bloom goes, shadows pop) and, in this session, is not undone. Three seconds
 * of half-second windows: a model load or a shader compile is not a trend.
 */
export const TIER_WINDOWS = LOW_WINDOWS * 2

/**
 * The pixel ratio the canvas draws at: the governed ratio, under the tier's
 * cap, under what the display asks for (a window moved to a 1x monitor is not
 * drawn at 1.75), and under `ceiling` — whatever else caps it this frame (the
 * bloom's pixel budget, `bloomDprCap`). Never below `DPR_MIN`.
 */
export function worldDpr(governed: number, display: number, plan: QualityPlan, ceiling: number = Infinity): number {
  const want = Math.min(governed, clampDpr(display), plan.dprMax, ceiling)
  return Number.isFinite(want) ? Math.max(DPR_MIN, want) : DPR_MIN
}

export interface QualityStep {
  readonly tier: WorldQuality
  readonly dpr: number
}

export interface QualityGovernor {
  /**
   * One half-second window's frame rate, and what else caps the ratio this
   * window (`ceiling`: the display and the bloom's pixel budget — a step starts
   * from what is actually DRAWN, or it would spend three windows "stepping" a
   * ratio nobody is drawing at). The new tier and ratio when either changes, else null.
   */
  observe(fps: number, ceiling?: number): QualityStep | null
  /** The window was not a clean measurement (the page was hidden, the loop stalled, a pinned tier): forget the streak. */
  gap(): void
  readonly tier: WorldQuality
  readonly dpr: number
}

/**
 * The step rule.
 *
 * WITHIN a tier the pixel ratio steps down by `DPR_STEP` after `LOW_WINDOWS`
 * low windows in a row, as M414's governor did, until it reaches the tier's
 * floor. AT the floor, `TIER_WINDOWS` more low windows step the TIER down one
 * (full → lean → flat), and the ratio is brought under the new tier's cap.
 * A good window, or a gap, forgets the streak.
 *
 * **It never steps back UP — not the ratio, not the tier — for the session.**
 * Orchestrate steps back up with hysteresis (under 12 ms after over 24), and
 * that is right there: its diorama renders on demand and its tiers flip a pool
 * and a composer. Here it would oscillate. Lowering the quality is what raised
 * the frame rate, so the measurement that would justify a step up is a
 * measurement of the CHEAPER tier and says nothing about whether the dearer
 * one fits — the dearer one already measured slow, which is why we are here.
 * A rule that stepped up would climb back, fail again and drop, for as long as
 * the view was open: the bloom pulsing, shadows popping on and off, and a
 * shader recompile hitch on every flip (dropping the shadow recompiles every
 * lit material — `Lights` in WorldView). Since a tier is only ever left by
 * failing it, "never return to a tier that failed" and "never step up" are the
 * same rule. The way back up is a new session (a relaunch or a reload): the
 * tier is in memory only, and a reopened view starts from the session's tier
 * (`sessionQuality`), its ratio from that tier's cap.
 */
export function createQualityGovernor(start: number, tier: WorldQuality = 'full'): QualityGovernor {
  let current = tier
  let dpr = Math.min(clampDpr(start), PLANS[current].dprMax)
  let low = 0
  return {
    observe(fps, ceiling = Infinity) {
      if (!Number.isFinite(fps)) { low = 0; return null }
      if (fps >= LOW_FPS) { low = 0; return null }
      low += 1
      const plan = PLANS[current]
      const drawn = Math.min(dpr, ceiling)
      if (drawn > plan.dprFloor + 1e-9) {
        if (low < LOW_WINDOWS) return null
        low = 0
        dpr = Math.max(plan.dprFloor, drawn - DPR_STEP)
        return { tier: current, dpr }
      }
      if (low < TIER_WINDOWS) return null
      low = 0
      const next = QUALITY_ORDER[QUALITY_ORDER.indexOf(current) + 1]
      // Flat at 1x: nothing is left to give up. The room says what it can.
      if (next === undefined) return null
      current = next
      dpr = Math.min(drawn, PLANS[current].dprMax)
      return { tier: current, dpr }
    },
    gap() { low = 0 },
    get tier() { return current },
    get dpr() { return dpr }
  }
}

/**
 * The harness's pin (`window.__tcWorldQuality`), read once a window. The app
 * never writes it: it exists so a CDP drive can measure the same room at each
 * tier on the same build, as `window.__tcOrchQuality` does for Orchestrate.
 * Anything but a tier name is no pin.
 */
export function readQualityPin(value: unknown): WorldQuality | null {
  return value === 'full' || value === 'lean' || value === 'flat' ? value : null
}

// ── The session's tier, in memory ───────────────────────────────────────────
// A tiny store, not React state, because the scene's parts read it from
// inside fiber's own root (the cards, the materials' bloom treatment) as well
// as the DOM around it, and because a reopened view must start where the
// session got to. NOTHING here touches storage (`world.quality.store.1`).

let governed: WorldQuality = 'full'
let pinned: WorldQuality | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** The tier the room draws at now: the harness's pin, or the governed tier. */
export function getWorldQuality(): WorldQuality {
  return pinned ?? governed
}

/** The governed tier alone — where a reopened view's governor starts. */
export function sessionQuality(): WorldQuality {
  return governed
}

/** The governor's step. Down only: a call naming a dearer tier than the session's is ignored. */
export function stepWorldQuality(tier: WorldQuality): void {
  if (QUALITY_ORDER.indexOf(tier) <= QUALITY_ORDER.indexOf(governed)) return
  const before = getWorldQuality()
  governed = tier
  if (getWorldQuality() !== before) notify()
}

/** The harness pin, as read this window (null: none). */
export function pinWorldQuality(tier: WorldQuality | null): void {
  if (tier === pinned) return
  const before = getWorldQuality()
  pinned = tier
  if (getWorldQuality() !== before) notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The room's tier, as a React subscription. */
export function useWorldQuality(): WorldQuality {
  return useSyncExternalStore(subscribe, getWorldQuality, () => 'full')
}

/**
 * Whether the bloom is RENDERING — the person's choice AND the tier. Every
 * part that compensates for the composer (the ground's pre-image, the trim's
 * and the eyes' glow scale, the board's ink) must read THIS, never the
 * person's bit alone: with the tier holding the composer off, a material still
 * painted for it is a ground pushed to its ACES pre-image with no ACES after
 * it, a trim and eyes scaled past 1.0 and clipped — no error, just a wrong room.
 */
export function useBloomRendered(): boolean {
  return bloomRenders(useBloomOn(), useWorldQuality())
}
