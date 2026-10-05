import { useSyncExternalStore } from 'react'
import { STUDIO } from './world-palette'
import { clampDpr, DPR_MIN } from './world-perf'

/**
 * The World view's bloom (M420): the settings and the one bit that turns it on.
 * Pure of three.js and of `postprocessing` — the composer is `WorldBloom.tsx`,
 * the only world file that imports the library — so the scene files that need
 * to KNOW whether bloom is running (the trim, the eyes) can read it without
 * importing a second door.
 *
 * Its own file, not `world-set.ts`: that one is in the agent store's import
 * graph, and an HMR edit of anything in that graph re-instantiates the STORE
 * (M416's trap), so tuning these numbers would have emptied the roster.
 *
 * **Bloom is a lens over the scene, and the scene keeps a complete look
 * without it.** Everything that glows is also drawn as geometry (the trim's
 * halo band, the eyes' halo plane), and `glowScale(.., false)` / `haloShare(false)` /
 * `unlitScale(false)` / `unlitInk(.., false)` are the identity — so turning bloom off, by hand or by the quality tier (M430), returns
 * the M416/M417 picture exactly rather than a half-lit one.
 */
export const BLOOM = {
  /**
   * How far above the page ground's HDR luminance the threshold sits. The
   * ground is unlit and, under the composer's ACES, is painted as its
   * `acesPreimage` (see below) — about 1.76 in linear luminance, BRIGHTER than
   * any glow colour at a sane boost — so the threshold is derived from it
   * (`bloomThreshold`), never hand-set: a threshold under the ground makes the
   * whole frame bloom to white (measured: ground 239 -> 255).
   */
  groundMargin: 0.12,
  /** How softly the threshold fades in; narrow, so the ground just under it does not bleed. */
  smoothing: 0.12,
  /** How far above the threshold a glowing material's HDR luminance is placed (`glowScale`). */
  glowOver: 1.0,
  /** How hard the glow reads over the pale slab: subtle, a glow and not a haze. */
  intensity: 0.6,
  /** Mipmap-blur radius: wide and soft rather than a tight ring. */
  radius: 0.7,
  /** Mip levels of the blur. Fewer is cheaper; the widest levels are the haze. */
  levels: 7,
  /**
   * The most pixels the composer is asked to fill. Its cost is fill, not draw
   * calls (+15 calls, M1 Pro uncapped: +3.1 ms at 5.3 MP, +10.6 ms at 18 MP —
   * about 1.2 ms per megapixel), and the 18 MP wide-retina window is the one
   * place the M417 scene was at 94 fps and bloom alone would have put it at 47.
   * Over this the pixel ratio comes down (`bloomDprCap`) rather than the bloom
   * going away: a window under it keeps its full retina sharpness.
   */
  maxPixels: 8_000_000
} as const

/**
 * The pixel ratio the bloom's pixel budget allows a canvas of this CSS size —
 * never under `DPR_MIN`, never over what the display itself asks for.
 */
export function bloomDprCap(cssWidth: number, cssHeight: number, devicePixelRatio: number): number {
  const pixels = cssWidth * cssHeight
  const fit = pixels > 0 ? Math.sqrt(BLOOM.maxPixels / pixels) : Infinity
  return Math.max(DPR_MIN, Math.min(clampDpr(devicePixelRatio), fit))
}

/**
 * The HDR luminance above which a pixel blooms: just over what the ground is
 * painted at. Derived from the palette so a changed ground colour moves the
 * threshold with it.
 */
export function bloomThreshold(ground: string = STUDIO.ground): number {
  const [r, g, b] = acesPreimage(hexLinear(ground))
  return linearLuma(r, g, b) + BLOOM.groundMargin
}

/**
 * The multiplier for a glowing material's colour: 1 with bloom off (a value
 * past 1 would only clip to white), and with it on, enough to put the colour's
 * HDR luminance `glowOver` above the threshold — the composer has something to
 * bloom, and the ground, which sits just under, does not.
 */
export function glowScale(hex: string, on: boolean): number {
  if (!on) return 1
  return (bloomThreshold() + BLOOM.smoothing + BLOOM.glowOver) / hexLuma(hex)
}

/**
 * The scale an unlit CANVAS texture (the whiteboard) is drawn through, and the
 * canvas colours that go with it. A flat colour can be painted as its ACES
 * pre-image (the ground is), but a texture's pre-image of white is far past 1, which an
 * 8-bit canvas cannot hold — and a flat lift (tried: 1.5x) cannot work, because
 * ACES's shoulder squeezes the card's light-grey words and rules into the white
 * (the critic: "heading and text lines almost gone"). So the material is scaled
 * by `unlitScale` — a little under the bloom threshold, so the sheet's white
 * does not itself bloom, which makes its brightest 240 where bloom-off shows 255 — and
 * every colour painted on the canvas is `unlitInk` — its own pre-image over that
 * scale — which the scaled material and the composer's ACES turn back into the
 * colour that was asked for. Both are the identity with bloom off.
 */
// Just under the bloom threshold, so a white sheet at full scale never blooms —
// at its first value (the pre-image of 0.985, ~4.4) the whole card bloomed out.
const UNLIT_HEADROOM = 0.1
// Computed on first use: the ACES port and the threshold it needs are declared above and below.
let unlitScaleMemo = 0
function unlitScaleValue(): number {
  if (unlitScaleMemo === 0) unlitScaleMemo = bloomThreshold() - UNLIT_HEADROOM
  return unlitScaleMemo
}

/** The brightest an unlit texture can show through `unlitScale` (about 240 of 255 — as bright as the ground). */
export function unlitCeil(): number {
  const k = unlitScaleValue()
  return acesToneMap([k, k, k])[1]
}

export function unlitScale(on: boolean): number {
  return on ? unlitScaleValue() : 1
}

/** One linear channel back to an sRGB byte. */
export function linearToSrgbByte(v: number): number {
  const c = Math.min(1, Math.max(0, v))
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055))
}

/** The canvas colour (`#rrggbb`) to paint so that `hex` is what shows through `unlitScale` and the composer's ACES. */
export function unlitInk(hex: string, on: boolean): string {
  if (!on) return hex
  const ceil = unlitCeil()
  const pre = acesPreimage(hexLinear(hex).map((v) => Math.min(v, ceil)) as unknown as Rgb)
  return '#' + pre.map((v) => linearToSrgbByte(v / unlitScaleValue()).toString(16).padStart(2, '0')).join('')
}

/**
 * How much more opaque the geometric halo band is drawn with bloom on, OVER THE PALE SLAB (the table's band, over black, keeps its own opacity). The
 * band is unlit (`toneMapped={false}`), and under the composer ACES maps it
 * anyway: the most saturated cyan ACES can reproduce is about (143, 219, 225),
 * against the band's own (54, 230, 255), so at the same alpha its tint over the
 * pale slab loses about half its red-channel pull. 2.2 puts the blended tint
 * back where bloom-off had it (measured on the slab: red 165). The bloom is the
 * glow AROUND the core; the band is still what gives the trim its reach inward
 * across the slab's flat top, which an isotropic bloom would spill over the edge.
 */
export const HALO_SHARE_ON = 2.2

export function haloShare(on: boolean): number {
  return on ? HALO_SHARE_ON : 1
}

/**
 * three's ACES Filmic tone map (what the scene's renderer applies with bloom
 * off, and what `WorldBloom` applies in its pass with bloom on), ported from
 * the shader chunk so a check can compare against it. It is NOT the identity
 * on an unlit colour: the page ground, which fills half the frame, comes out
 * of it darker than it goes in (the studio ground measured 239 -> ~226) —
 * `toneMapped={false}` means nothing once a composer owns the frame, so the
 * unlit colours are painted as their `acesPreimage` instead.
 */
export type Rgb = readonly [number, number, number]

const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.076, 0.90834, 0.01566], [0.0284, 0.13383, 0.83777]] as const
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]] as const

function mul3(m: readonly (readonly [number, number, number])[], v: readonly [number, number, number]): [number, number, number] {
  return [0, 1, 2].map((i) => m[i]![0] * v[0] + m[i]![1] * v[1] + m[i]![2] * v[2]) as [number, number, number]
}

/** `toneMappingExposure` is 1 in this view (WorldView's `gl`), so the shader's `/ 0.6` is the only scale. */
export function acesToneMap(color: Rgb): Rgb {
  const v = mul3(ACES_IN, [color[0] / 0.6, color[1] / 0.6, color[2] / 0.6])
  const fit = v.map((x) => {
    const a = x * (x + 0.0245786) - 0.000090537
    const b = x * (0.983729 * x + 0.432951) + 0.238081
    return a / b
  }) as [number, number, number]
  return mul3(ACES_OUT, fit).map((x) => Math.min(1, Math.max(0, x))) as unknown as Rgb
}

/**
 * The linear colour that comes OUT of `acesToneMap` as `target`. Numeric — the
 * map mixes channels, so there is no per-channel inverse — by a per-channel
 * Newton step with a finite-difference slope: the map is monotone over the
 * studio's pale range, and a target it only reaches at infinity (pure white)
 * is capped at 0.985.
 */
export function acesPreimage(target: Rgb): Rgb {
  const goal = target.map((v) => Math.min(Math.max(v, 0), 0.985)) as unknown as Rgb
  const at: [number, number, number] = [goal[0], goal[1], goal[2]]
  for (let i = 0; i < 24; i++) {
    for (let k = 0; k < 3; k++) {
      const here = acesToneMap(at)[k]!
      const probe: [number, number, number] = [at[0], at[1], at[2]]
      probe[k] += 1e-3
      const slope = Math.max(1e-3, (acesToneMap(probe)[k]! - here) / 1e-3)
      at[k] = Math.max(0, at[k]! + (goal[k]! - here) / slope)
    }
  }
  return at
}

/** Rec. 709 luminance of a linear-light colour, the measure the bloom's threshold is read in. */
export function linearLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** One sRGB channel (0–255) to linear light. */
export function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** A `#rrggbb` colour as linear light. */
export function hexLinear(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [srgbToLinear((n >> 16) & 255), srgbToLinear((n >> 8) & 255), srgbToLinear(n & 255)]
}

/** Linear luminance of a `#rrggbb` colour, times a boost. */
export function hexLuma(hex: string, boost = 1): number {
  const [r, g, b] = hexLinear(hex)
  return linearLuma(r, g, b) * boost
}

const STORAGE_KEY = 'tc.world.bloom'

/** A dev's saved choice, if any. Default ON; storage can throw (a private window, blocked site data), and the view must render the same without it. */
function stored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

let on = typeof window !== 'undefined' ? stored() : true
const listeners = new Set<() => void>()

export function isBloomOn(): boolean {
  return on
}

/**
 * Turns the PERSON's bloom on or off live: the scene re-renders without the
 * composer and the glowing materials fall back to their un-boosted colours.
 * `persist: false` flips it for this session only. Since M430 nothing in the
 * app calls it for a slow GPU: the quality tier holds the composer off without
 * touching this bit (`bloomRenders` in world-quality.ts — rendered iff this is
 * on AND the tier allows it), so a slow GPU this minute is never written here
 * and never carried into the next session.
 */
export function setBloomOn(next: boolean, persist = true): void {
  if (next === on) return
  on = next
  if (persist) {
    try {
      if (next) window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, '0')
    } catch {
      // The choice holds for this session, which is all storage would have added.
    }
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Whether bloom is on, as a React subscription. */
export function useBloomOn(): boolean {
  return useSyncExternalStore(subscribe, isBloomOn, () => true)
}
