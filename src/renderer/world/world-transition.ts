/**
 * The choreography between the infinite canvas and the 3D world view, as pure
 * functions of ONE number — no three.js, no React, no DOM — so `verify:world`
 * runs every curve in plain node and the files that draw (Canvas's host, the
 * stage layer, the scene) only apply what this decides.
 *
 * One clock, many readers. The stage creates a `WorldTransition`; its rAF loop
 * writes the 2D canvas's and the 3D layer's opacity from it, and the scene's
 * frame loop reads the same object for the camera dolly, each robot's pop and
 * each card's tilt. `sample(now)` is a pure function of the time it is given,
 * so two readers in one frame agree and neither advances anything — a
 * `progress += dt` kept by each would drift apart, and the 2D fade and the
 * 3D dolly would end on different frames.
 */

/** The whole move, either way. */
export const WORLD_TRANSITION_MS = 1000

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export interface TransitionSample {
  /** 0 = the 2D canvas, 1 = the world; linear in time. Staggers are timed on this. */
  raw: number
  /** `raw` through easeInOutCubic — what the fades and the dolly follow. */
  eased: number
  /** Where it is heading. */
  target: 0 | 1
  /** At rest on `target`. */
  settled: boolean
}

export interface WorldTransition {
  /** Heads for `target`, from wherever it is NOW — so a toggle mid-move reverses smoothly instead of jumping. Idempotent. */
  setTarget(target: 0 | 1, now: number): void
  sample(now: number): TransitionSample
}

/**
 * `durationMs` is the time for a FULL 0→1; a reversal from the middle takes
 * half as long, at the same speed, because the move is a ramp on `raw` and not
 * a restarted tween. 0 snaps (prefers-reduced-motion).
 */
export function createWorldTransition(initial: 0 | 1 = 0, durationMs: number = WORLD_TRANSITION_MS): WorldTransition {
  let from: number = initial
  let to: 0 | 1 = initial
  let start = 0
  let span = 0
  const raw = (now: number): number => {
    if (span <= 0 || now >= start + span) return to
    if (now <= start) return from
    return from + (to - from) * ((now - start) / span)
  }
  return {
    setTarget(target, now) {
      if (target === to) return
      from = raw(now)
      to = target
      start = now
      span = durationMs * Math.abs(to - from)
    },
    sample(now) {
      const r = raw(now)
      return { raw: r, eased: easeInOutCubic(r), target: to, settled: r === to }
    }
  }
}

// ── the 2D canvas and the 3D layer ───────────────────────────────────────────

/** "Slightly": the canvas settles back this far as it fades, enough to read as depth and not as a camera move. */
export const HOST_SCALE_MIN = 0.94

export function hostLook(eased: number): { opacity: number; scale: number } {
  return { opacity: 1 - eased, scale: 1 - (1 - HOST_SCALE_MIN) * eased }
}

// ── the camera ───────────────────────────────────────────────────────────────

/** How much higher and wider the opening shot is than the resting orbit. */
export const DOLLY = { up: 1.9, out: 1.55 } as const

export interface Vec3 { x: number; y: number; z: number }

/** The "high and wide" pose for a camera that rests at `rest`, looking at `target` — the same bearing, farther out and higher. */
export function dollyFar(rest: Vec3, target: Vec3): Vec3 {
  return {
    x: target.x + (rest.x - target.x) * DOLLY.out,
    y: target.y + (rest.y - target.y) * DOLLY.up,
    z: target.z + (rest.z - target.z) * DOLLY.out
  }
}

/** The camera at `eased`: the far pose at 0, the rest pose at 1. */
export function dollyAt(rest: Vec3, target: Vec3, eased: number): Vec3 {
  const far = dollyFar(rest, target)
  return {
    x: far.x + (rest.x - far.x) * eased,
    y: far.y + (rest.y - far.y) * eased,
    z: far.z + (rest.z - far.z) * eased
  }
}

// ── the robots ───────────────────────────────────────────────────────────────

/** Of the move's length, how much the farthest robot's start lags the nearest's. */
export const POP_STAGGER = 0.4

/**
 * Each robot's delay (0 … POP_STAGGER) from its distance to the centre of the
 * room: the nearest pops first and the rest follow outward, the farthest last.
 * Normalised between the nearest and the farthest rather than by the farthest
 * alone: the desks sit on one loose ring, so against the farthest they are all
 * within a few percent of each other and the "stagger" would be a single beat.
 * One robot, or robots all the same distance, have no order to give and pop
 * together.
 */
export function popDelays(distances: readonly number[]): number[] {
  const near = Math.min(...distances)
  const span = Math.max(...distances) - near
  return distances.map((d) => (span > 0 ? (POP_STAGGER * (d - near)) / span : 0))
}

/**
 * One robot's scale from the move's `raw` progress and its own `delay`. Timed on the
 * LINEAR progress so the stagger is a real offset, then eased per robot. Played
 * backwards, the same function has the farthest go first and the table's robots last.
 */
export function popOf(raw: number, delay: number): number {
  return easeInOutCubic((raw - delay) / (1 - POP_STAGGER))
}

/** How long a robot takes to appear on its own — an agent that turns live mid-session, or a model that loaded late. */
export const ARRIVE_MS = 380

// ── leaving the room (M417) ──────────────────────────────────────────────────

/**
 * How long a robot takes to leave when its agent stops being live (goes idle,
 * finishes or errors). Until M417 it was simply unmounted — the robot, its pill
 * and its desk vanished between two frames, and a person who looked away for
 * that frame could not tell whether an agent had left or had never been there.
 */
export const LEAVE_MS = 900
/** Of the leave, the farewell hop before the sink. */
const LEAVE_HOP = 0.2
/** How high the farewell hop goes, world units. */
const LEAVE_HOP_UP = 0.14
/** The card's fade runs over this stretch of the leave. */
const CARD_FADE_FROM = 0.1
const CARD_FADE_TO = 0.65
/** How far below the floor the robot ends — past its own height, so it has gone through the slab before the shrink ends. */
export const LEAVE_SINK = 1.7

export interface LeavePose {
  /** Multiplies the robot's body scale: 1 standing, 0 gone. */
  scale: number
  /**
   * Multiplies the pop its pill and card read (`cardStand`): a straight line from
   * the hop to past the middle, so the card lies back and fades WHILE the robot
   * sinks. Riding the body's cubic instead, it stayed full for most of the leave
   * and dropped in the last few frames — the critic read that as a glitch.
   */
  card: number
  /** World units the robot stands below (negative: above) where it stood. */
  sink: number
  done: boolean
}

/**
 * The leave at `ms` into it: a small hop, then an accelerating sink through the
 * floor as the figure shrinks. Through the floor rather than a fade because the
 * slab is opaque and the robot's visor and eyes share one material across every
 * robot (`robotKit`), so a per-robot opacity would mean a material per robot;
 * the floor hides it for free. A `span` of 0 is prefers-reduced-motion: gone at once.
 */
export function leavePose(ms: number, span: number = LEAVE_MS): LeavePose {
  if (span <= 0 || ms >= span) return { scale: 0, card: 0, sink: LEAVE_SINK, done: true }
  const u = Math.max(0, ms / span)
  // 0.45 is where `cardStand` reaches 0: the card is gone by u = 0.65, two thirds into the leave.
  const card = 1 - 0.55 * Math.min(1, Math.max(0, (u - CARD_FADE_FROM) / (CARD_FADE_TO - CARD_FADE_FROM)))
  if (u < LEAVE_HOP) return { scale: 1, card, sink: -Math.sin((Math.PI * u) / LEAVE_HOP) * LEAVE_HOP_UP, done: false }
  const k = (u - LEAVE_HOP) / (1 - LEAVE_HOP)
  const fall = k * k * k
  return { scale: 1 - fall, card, sink: fall * LEAVE_SINK, done: false }
}

export interface Leaver<S> {
  /** Where it stood when it left — the plan has already re-flowed without it. */
  station: S
  /** performance.now() when it left. */
  at: number
}

/**
 * Who is mid-leave after the roster moved from `before` to `after` at `now`:
 * every id in `before` and not in `after` starts leaving, anyone back in `after`
 * stops (it returned before it was gone), and a leave older than `span` is over.
 * Returns `current` itself when nothing changed, so a caller can skip a render
 * by identity — and so a render-time "derive from the previous roster" settles.
 */
export function settleLeavers<S extends { agentId: string }>(
  current: ReadonlyMap<string, Leaver<S>>, before: readonly S[], after: readonly S[], now: number, span: number = LEAVE_MS
): ReadonlyMap<string, Leaver<S>> {
  const staying = new Set(after.map((s) => s.agentId))
  let next: Map<string, Leaver<S>> | null = null
  const edit = (): Map<string, Leaver<S>> => (next ??= new Map(current))
  for (const s of before) {
    if (!staying.has(s.agentId) && !current.has(s.agentId)) edit().set(s.agentId, { station: s, at: now })
  }
  for (const [id, leaver] of next ?? current) {
    if (staying.has(id) || now - leaver.at >= span) edit().delete(id)
  }
  return next ?? current
}

// ── the cards ────────────────────────────────────────────────────────────────

/** A card starts lying this far back from facing the camera, then stands up. */
export const CARD_TILT_DEG = 80

/** The card's progress inside its robot's pop: it stands up over the second half, after the robot has arrived. */
export function cardStand(pop: number): number {
  return easeInOutCubic((pop - 0.45) / 0.55)
}

/** The card's rotateX, in degrees, at a stand of 0…1. */
export function cardTiltDeg(stand: number): number {
  return CARD_TILT_DEG * (1 - stand)
}
