/**
 * Pure, plain-node motion math for the orchestration cube island (verify:orchestration).
 * No React, no three.js import — a mesh's y-offset/lift/scale/glow at a given
 * moment is a function of (tone, elapsed time, reduced-motion), nothing else,
 * so it is testable without a browser and without mounting a WebGL context.
 *
 * Mirrors the M275 CSS state skins it replaces: busy breathes + bobs + shimmers,
 * needs-you pulses a FINITE 3 cycles (then holds, same as the old
 * `orch-needs-pulse … 3` / `orch-beacon … 3`), idle sits 3px lower, starting
 * settles in once, selection lifts 22px toward the camera. Reduced motion
 * freezes every oscillation but keeps the static offsets (idle's drop,
 * selection's lift) — the same split the old CSS drew between `transform`
 * (kept) and `animation`/`transition` (stood down).
 */

import { TONE_WORKING } from '../panels/panel-state'

export type OrchCubeTone = typeof TONE_WORKING | 'needs-you' | 'idle' | 'starting' | 'exited'

export interface OrchCubeMotion {
  /** Screen-pixel vertical offset (world units in the island's 1px = 1unit camera); positive = down. */
  yOffset: number
  /** Screen-pixel offset toward the camera — the selection lift. */
  lift: number
  /** Uniform scale multiplier; only the one-shot starting settle moves this off 1. */
  scale: number
  /** Extra emissive intensity riding on top of the tone's resting glow, 0..1. */
  emissiveBoost: number
  /** Rim/shimmer intensity, 0..1 — busy only. */
  rimBoost: number
}

export const ORCH_CUBE_LIFT_PX = 22
export const ORCH_CUBE_IDLE_DROP_PX = 3
const DUR_BOB_MS = 2800
const DUR_SHIMMER_MS = 1800
const DUR_BREATH_MS = 1200
const DUR_SPRING_MS = 520
const NEEDS_PULSE_CYCLES = 3

const REST: OrchCubeMotion = { yOffset: 0, lift: 0, scale: 1, emissiveBoost: 0, rimBoost: 0 }

const wave = (elapsedMs: number, periodMs: number): number => Math.sin((elapsedMs / periodMs) * Math.PI * 2) * 0.5 + 0.5

/** A sine pulse that runs for exactly `cycles` periods, then holds at 0. */
function finitePulse(elapsedMs: number, periodMs: number, cycles: number): number {
  return elapsedMs >= periodMs * cycles ? 0 : wave(elapsedMs, periodMs)
}

/** Ease-out-back settle: overshoots slightly, then resolves to 1; 1 forever after `durationMs`. */
function settleScale(elapsedMs: number, durationMs: number): number {
  if (elapsedMs >= durationMs) return 1
  const t = elapsedMs / durationMs
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

export interface OrchCubeMotionInput {
  tone: OrchCubeTone
  hub: boolean
  synthetic: boolean
  selected: boolean
  /** Unacknowledged wants-you: gates the pulse, same condition the beacon uses. */
  attention: boolean
  /** ms since this cube last entered `tone` — drives the one-shot 'starting' settle. */
  sinceToneMs: number
  /** ms since `attention` became true — drives the finite needs-you pulse. */
  sinceAttentionMs: number
  /** A free-running clock for the infinite busy bob/breathe/shimmer. */
  clockMs: number
  reducedMotion: boolean
}

export function orchCubeMotion(input: OrchCubeMotionInput): OrchCubeMotion {
  const { tone, hub, synthetic, selected, attention, sinceToneMs, sinceAttentionMs, clockMs, reducedMotion } = input
  const m: OrchCubeMotion = { ...REST }
  // Static offsets stand even under reduced motion — only oscillation stops.
  if (selected) m.lift = ORCH_CUBE_LIFT_PX
  if (tone === 'idle' && !synthetic) m.yOffset = ORCH_CUBE_IDLE_DROP_PX
  if (reducedMotion) return m
  if (tone === 'starting') m.scale = settleScale(sinceToneMs, DUR_SPRING_MS)
  if (tone === 'needs-you' && attention) {
    m.emissiveBoost = Math.max(m.emissiveBoost, finitePulse(sinceAttentionMs, DUR_BREATH_MS, NEEDS_PULSE_CYCLES))
  }
  // The hub is a different object: steady glow, no micro-motion (M275's
  // `.orch__cube--hub .orch__cube-lift { animation: none; }`), attention excepted above.
  if (tone === TONE_WORKING && !hub) {
    m.emissiveBoost = Math.max(m.emissiveBoost, wave(clockMs, DUR_BOB_MS) * 0.6)
    m.rimBoost = wave(clockMs, DUR_SHIMMER_MS)
    m.yOffset += Math.sin((clockMs / DUR_BOB_MS) * Math.PI * 2) * 2
  }
  return m
}
