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

/* M439. Restore progress. A line is pending until a fact arrives, active
   while a measurement is in flight, and done only with that measurement.
   There is no clock: the splash leaves when `settled` is true, including at
   0ms. The APEX field above is a different surface (`splash.1`). */

export const RESTORE_TAGLINE = 'Every agent, in its place.'
export const RESTORE_SKIP_HINT = 'Hold ⌥ to skip reattaching'

export type RestoreStepId = 'workspace' | 'layout' | 'tmux' | 'agents'
export type RestorePhase = 'pending' | 'active' | 'done' | 'failed' | 'skipped'

export interface RestoreFacts {
  workspace?: { name: string; path: string }
  layout?: { tasks: number; objects: number }
  /** Both numbers are the measurement. A missing object is "not counted yet". */
  tmux?: { done: number; total: number }
  /** Binaries the boot will look for. Known before the probe answers. */
  agentsPlanned?: readonly string[]
  /** Present only after the probe answered, including an empty list. */
  agentsFound?: readonly string[]
  failed?: { step: RestoreStepId; sentence: string }
  /** Option is held: remaining reattaches are skipped, not killed. */
  optionHeld?: boolean
  reducedMotion?: boolean
}

export interface RestoreLine {
  id: RestoreStepId
  phase: RestorePhase
  label: string
  detail?: string
  /** The workspace's name, only once that open was measured. */
  name?: string
  /** Set on the agents line only once discovery answered. */
  found?: readonly string[]
}

export interface RestoreView {
  lines: RestoreLine[]
  settled: boolean
  breathing: boolean
  failed: boolean
}

const RESTORE_ORDER: readonly RestoreStepId[] = ['workspace', 'layout', 'tmux', 'agents']
const RESTORE_LABEL: Record<RestoreStepId, string> = {
  workspace: 'Workspace opened',
  layout: 'Layout restored',
  tmux: 'Reattaching tmux sessions',
  agents: 'Checking agents'
}

function countWords(n: number, one: string, many: string): string {
  if (n === 0) return `no ${many}`
  if (n === 1) return `1 ${one}`
  return `${n} ${many}`
}

function layoutDetail(tasks: number, objects: number): string {
  return `${countWords(tasks, 'task', 'tasks')}, ${countWords(objects, 'object', 'objects')}`
}

function tmuxDetail(tmux: { done: number; total: number } | undefined, optionHeld: boolean): string | undefined {
  if (optionHeld) return 'left asleep'
  if (tmux === undefined) return undefined
  if (tmux.total === 0) return 'none to reattach'
  if (tmux.done === 0) return `none of ${tmux.total} yet`
  return `${tmux.done} of ${tmux.total}`
}

function workspaceReady(facts: RestoreFacts): boolean {
  const name = facts.workspace?.name.trim() ?? ''
  const path = facts.workspace?.path.trim() ?? ''
  return name !== '' && path !== ''
}

function stepComplete(id: RestoreStepId, facts: RestoreFacts): boolean {
  if (facts.failed?.step === id) return false
  switch (id) {
    case 'workspace': return workspaceReady(facts)
    case 'layout': return facts.layout !== undefined
    case 'tmux': return facts.optionHeld === true || (facts.tmux !== undefined && facts.tmux.done >= facts.tmux.total)
    case 'agents': return facts.agentsFound !== undefined
  }
}

function stepInFlight(id: RestoreStepId, facts: RestoreFacts): boolean {
  if (stepComplete(id, facts) || facts.failed !== undefined) return false
  if (id === 'tmux' && facts.tmux !== undefined && facts.optionHeld !== true && facts.tmux.done < facts.tmux.total) return true
  return false
}

/** The checklist the card renders. Absent facts stay pending and carry no count. */
export function restoreLines(facts: RestoreFacts): RestoreView {
  const failed = facts.failed !== undefined
  let activeTaken = false
  const lines = RESTORE_ORDER.map((id): RestoreLine => {
    if (facts.failed?.step === id) return { id, phase: 'failed', label: RESTORE_LABEL[id], detail: facts.failed.sentence }
    if (id === 'tmux' && facts.optionHeld === true && !stepComplete('tmux', { ...facts, optionHeld: false })) {
      return { id, phase: 'skipped', label: RESTORE_LABEL[id], detail: tmuxDetail(facts.tmux, true) }
    }
    if (stepComplete(id, facts)) {
      const detail = id === 'workspace' ? facts.workspace?.path
        : id === 'layout' && facts.layout !== undefined ? layoutDetail(facts.layout.tasks, facts.layout.objects)
          : id === 'tmux' ? tmuxDetail(facts.tmux, false)
            : facts.agentsFound !== undefined && facts.agentsFound.length === 0 ? 'none found'
              : facts.agentsFound?.join(', ')
      return {
        id, phase: 'done', label: RESTORE_LABEL[id],
        ...(detail !== undefined && detail !== '' ? { detail } : {}),
        ...(id === 'workspace' && facts.workspace !== undefined ? { name: facts.workspace.name } : {}),
        ...(id === 'agents' && facts.agentsFound !== undefined ? { found: facts.agentsFound } : {})
      }
    }
    const inflight = stepInFlight(id, facts) && !activeTaken
    if (inflight) activeTaken = true
    const planned = id === 'agents' && facts.agentsFound === undefined && facts.agentsPlanned !== undefined && facts.agentsPlanned.length > 0
      ? facts.agentsPlanned.join(', ')
      : undefined
    const detail = id === 'tmux' && inflight ? tmuxDetail(facts.tmux, false) : planned
    return { id, phase: inflight ? 'active' : 'pending', label: RESTORE_LABEL[id], ...(detail !== undefined ? { detail } : {}) }
  })
  const settled = failed || lines.every((line) => line.phase === 'done' || line.phase === 'skipped')
  const breathing = !settled && facts.reducedMotion !== true && lines.some((line) => line.phase === 'active')
  return { lines, settled, breathing, failed }
}

/** No minimum display time. A settled restore leaves even at 0ms; an unsettled one stays. */
export function splashShouldLeave(input: { settled: boolean; shownForMs: number }): boolean {
  return input.settled === true
}

export interface GhostRect { x: number; y: number; w: number; h: number }
export interface GhostBox extends GhostRect { left: number; top: number; width: number; height: number }

/**
 * The skeleton behind the card. Fractions of the stage, from the rects'
 * own bounding box, so a panel's place relative to the others is the one
 * the layout stored. Undefined means the layout has not been read: no
 * frames, rather than a picture of a layout that was not there.
 */
export function ghostLayout(rects: readonly GhostRect[] | undefined): GhostBox[] {
  if (rects === undefined || rects.length === 0) return []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h)
  }
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const pad = 0.08
  const scale = 1 - pad * 2
  return rects.map((r) => ({
    x: r.x, y: r.y, w: r.w, h: r.h,
    left: pad + ((r.x - minX) / spanX) * scale,
    top: pad + ((r.y - minY) / spanY) * scale,
    width: (r.w / spanX) * scale,
    height: (r.h / spanY) * scale
  }))
}
