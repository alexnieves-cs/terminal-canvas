/* Startup motion: which splash plays, and the field math Field Lines draws.

   Pure — no DOM, no React — so verify:viewport checks it under plain node
   (splash.1, splash.2). StartupSplash.tsx is the only renderer of it.

   THERE IS NO RESTORE WINDOW TO COVER. main.tsx awaits the layout before
   React mounts and the window stays hidden until ready-to-show, so a splash
   here is an overlay on an ALREADY-RESTORED canvas, never a loading screen.
   A version of this that waited on layout:load would wait on nothing. */

export type SplashMode = 'field' | 'ghost' | 'none'

export interface SplashInput {
  /** `appearance.startupAnimation`. */
  enabled: boolean
  /** `?tc-splash=off` — stamped by scripts/load-renderer.cjs for every harness. */
  harnessOff: boolean
  reducedMotion: boolean
  /** A splash already played in this window's session (a Cmd+R, a reset). */
  playedThisSession: boolean
  merged: boolean
  panelCount: number
  /** The version that last played a splash; null on a first launch. */
  lastVersion: string | null
  /** main's `app.getVersion()`; empty when the preload could not say. */
  version: string
}

/**
 * The APEX field plays on EVERY launch of the app (a product decision, not an
 * accident: it is the brand's front door). Stillness still wins — the setting,
 * the harness, reduced motion — and a Cmd+R or reset is not a launch, so
 * `playedThisSession` keeps it from replaying inside one window's life.
 * `ghost` survives as a mode StartupSplash can draw; nothing selects it now.
 */
export function splashMode(i: SplashInput): SplashMode {
  if (!i.enabled || i.harnessOff || i.reducedMotion || i.playedThisSession || i.merged) return 'none'
  return 'field'
}

/** localStorage: the version that last played a splash. Written when one STARTS, so a crash mid-scene cannot replay Field Lines forever. */
export const LAST_VERSION_KEY = 'tc.splash.lastVersion'
/** sessionStorage: survives Cmd+R and a canvas reset, dies with the window. */
export const PLAYED_KEY = 'tc.splash.played'

/** What main.tsx resolves before first render; Canvas adds the rest of SplashInput. */
export interface StartupInput { enabled: boolean; harnessOff: boolean; lastVersion: string | null; version: string }

export const FIELD_MS = 2800
export const GHOST_MS = 800
export const SKIP_FADE_MS = 250

export const clamp = (v: number, a = 0, b = 1): number => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
export const easeOut = (k: number): number => 1 - Math.pow(1 - clamp(k), 3)
export const easeInOut = (k: number): number => {
  const c = clamp(k)
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2
}
/** Progress through [a, b], clamped: the one timeline primitive every beat uses. */
export const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a))
/** A deterministic hash in [0, 1) — the same filing tilts the same way every launch. */
export const hash = (s: number): number => { const x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x) }

export interface Pole { x: number; y: number; q: number }

/**
 * The field at (x, y): each pole pushes along its radius with a softened
 * inverse-square falloff. `r0` is the distance at which one pole reads as
 * strength ~1; the 0.08 softening stops a filing ON a pole blowing up.
 */
export function fieldAt(poles: readonly Pole[], x: number, y: number, r0: number): { x: number; y: number } {
  let ex = 0, ey = 0
  for (const p of poles) {
    const dx = x - p.x, dy = y - p.y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2) + 1e-6
    const s = p.q * (r0 * r0) / (r2 + r0 * r0 * 0.08)
    ex += (dx / r) * s
    ey += (dy / r) * s
  }
  return { x: ex, y: ey }
}

/**
 * A filing's angle, `k` of the way from its loose tilt toward the field.
 * AXIAL: a filing has no head, so it turns the short way modulo PI — turning
 * modulo 2PI would spin half the lattice through 180 degrees for nothing.
 */
export function filingAngle(loose: number, field: number, k: number): number {
  const d = ((((field - loose) % Math.PI) + Math.PI * 1.5) % Math.PI) - Math.PI / 2
  return loose + d * clamp(k)
}
