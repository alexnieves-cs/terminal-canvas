import type { AgentEvent, AgentRecord } from '@shared/world-events'
import { agentTint, DESK_ARC, facingToward, type RosterEntry } from './world-scene'
import type { Vec3 } from './world-transition'

/**
 * The studio around the robots (M416), as decisions with no three.js and no
 * React in them, so `verify:world` can run every rule in plain node and
 * `WorldPlatform` / `WorldProps` / `WorldView` / `WorldChrome` only draw what
 * this says: how big the platform is for a room of N agents and the outline its
 * trim follows, where the cube clusters, stools and whiteboard stand, where the
 * camera opens and how far it may go, what the "Ask your team" pill posts and
 * what the whiteboard then shows, and who the legend names.
 *
 * World units as in world-scene.ts: +x screen-right, +z toward the camera, y up,
 * the meeting table at the origin, the floor at y = 0.
 */

// ── the platform ─────────────────────────────────────────────────────────────

/** A thick slab. `radius` rounds every edge of its RoundedBox, so it can be at most half the thickness. */
export const SLAB = { thickness: 0.9, radius: 0.45, margin: 1.9 } as const

/** How far past a desk's ring a robot can stand: the ring's own wander (world-scene's ±0.3) and the step behind the desk. */
const REACH = DESK_ARC.standBehind + 0.3

/**
 * Half the platform's side. The desks sit on a ring of `arcRadius` and their
 * robots stand `REACH` beyond it; the margin is the pale lip left outside the
 * last of them. A square, because a roster that wraps most of the way round the
 * table (past `maxSpread` the ring itself widens) is round, and a square holds
 * any ring with its corners spare — which is where the props live.
 */
export function slabHalf(arcRadius: number): number {
  return arcRadius + REACH + SLAB.margin
}

export type Pt = readonly [number, number]

/**
 * A closed rounded-rectangle outline in the (x, z) plane, counter-clockwise,
 * with `half` extents and a corner radius clamped to what fits. The one shape
 * the platform's trim and the table's edge line both follow; the straight
 * sides carry only their two end points (a band's vertex alpha interpolates
 * along them), each corner `segments + 1` points on its arc.
 */
export function roundedRectPath(hx: number, hz: number, radius: number, segments = 10): Pt[] {
  const r = Math.max(0, Math.min(radius, hx, hz))
  const pts: Pt[] = []
  const corners: ReadonlyArray<readonly [number, number, number]> = [
    [hx - r, hz - r, 0],
    [-(hx - r), hz - r, Math.PI / 2],
    [-(hx - r), -(hz - r), Math.PI],
    [hx - r, -(hz - r), (3 * Math.PI) / 2]
  ]
  for (const [cx, cz, a0] of corners) {
    const n = r === 0 ? 0 : segments
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((Math.PI / 2) * i) / Math.max(n, 1)
      const p: Pt = [cx + r * Math.cos(a), cz + r * Math.sin(a)]
      const last = pts[pts.length - 1]
      // A corner that meets its neighbour (r equals a half extent) repeats a point; a repeat has no tangent.
      if (last !== undefined && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1e-6) continue
      pts.push(p)
    }
  }
  return pts
}

/** A flat strip of triangles with a vertex alpha, as plain arrays (the scene wraps them in a BufferGeometry). */
export interface Band {
  /** x, y, z per vertex. */
  positions: number[]
  /** One alpha per vertex. */
  alphas: number[]
  index: number[]
}

/**
 * A band that follows `path` at `y`, `offsets` apart across its width (positive
 * = outward from the outline), each vertex carrying the alpha at its offset.
 * Used twice, and it is why there is no bloom pass: a core line (two offsets,
 * alpha 1) and a glow (a gaussian of offsets, alpha falling to 0 at the edges)
 * are the same geometry with different numbers, and a glow that is geometry
 * costs a draw call where a post-processing bloom costs a second full-frame
 * pass (and a second importer of `postprocessing`, which is pinned to one door).
 */
export function bandBuffers(path: readonly Pt[], offsets: readonly number[], alphas: readonly number[], y: number): Band {
  const n = path.length
  const m = offsets.length
  const band: Band = { positions: [], alphas: [], index: [] }
  for (let i = 0; i < n; i++) {
    const prev = path[(i + n - 1) % n]!
    const next = path[(i + 1) % n]!
    const p = path[i]!
    let tx = next[0] - prev[0]
    let tz = next[1] - prev[1]
    const len = Math.hypot(tx, tz) || 1
    tx /= len
    tz /= len
    // The outline is convex and holds the origin, so "outward" is the normal that points away from it.
    let nx = tz
    let nz = -tx
    if (nx * p[0] + nz * p[1] < 0) { nx = -nx; nz = -nz }
    for (let j = 0; j < m; j++) {
      band.positions.push(p[0] + nx * offsets[j]!, y, p[1] + nz * offsets[j]!)
      band.alphas.push(alphas[j] ?? 0)
    }
  }
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j
      const b = i * m + j + 1
      const c = i2 * m + j
      const d = i2 * m + j + 1
      band.index.push(a, b, c, b, d, c)
    }
  }
  return band
}

/**
 * Offsets across a glow and a gaussian alpha over them: 1 at the line, ~0 at
 * both ends. Positive offsets are OUTWARD. The two sides have their own reach
 * because they are different places: inward is the slab's flat top, where the
 * light can spread; outward is the slab's lip, which curves away under the
 * band — a symmetric glow would hang in the air past the edge.
 */
export function glowProfile(inner: number, outer: number = inner): { offsets: number[]; alphas: number[] } {
  const offsets: number[] = []
  const alphas: number[] = []
  const side = (reach: number, sign: 1 | -1, steps: number): void => {
    const sigma = reach / 2.2
    for (let i = 1; i <= steps; i++) {
      // The last step is the reach itself, exactly — not (reach·n)/n, which drifts in the last bit.
      const o = i === steps ? reach : (reach * i) / steps
      const alpha = i === steps ? 0 : Math.exp(-((o / sigma) ** 2) / 2)
      if (sign === -1) { offsets.unshift(-o); alphas.unshift(alpha) } else { offsets.push(o); alphas.push(alpha) }
    }
  }
  side(inner, -1, 6)
  offsets.push(0)
  alphas.push(1)
  side(outer, 1, 3)
  return { offsets, alphas }
}

/** The platform's trim: where it runs (clear of the slab's rounded lip), how wide, how far its glow spreads. */
export const TRIM = { inset: SLAB.radius + 0.2, corner: 1.1, half: 0.045, glowIn: 0.8, glowOut: 0.2, glowPeak: 0.3 } as const

export function trimPath(arcRadius: number): Pt[] {
  const h = slabHalf(arcRadius) - TRIM.inset
  return roundedRectPath(h, h, TRIM.corner)
}

/** The meeting table: a black glossy rounded slab on a column, its cyan line just inside the rim. */
export const TABLE_PLATE = { hx: 1.4, hz: 1.05, radius: 0.62, top: 0.78, thickness: 0.09, line: 0.05, lineHalf: 0.018, glow: 0.3 } as const

// ── the set dressing ─────────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Three clusters, one per cube colour (brown, teal, purple — `STUDIO.cubes`). */
export const CUBE_CLUSTERS = [
  { count: 26, at: [-0.52, 4.7, -0.46] },
  { count: 24, at: [0.58, 5.0, -0.3] },
  { count: 20, at: [0.04, 5.8, -0.84] }
] as const

/** A cluster's centre, in terms of the platform's half-width, so a bigger room spreads them. */
export function clusterCenter(index: number, half: number): Vec3 {
  const c = CUBE_CLUSTERS[index]!.at
  return { x: c[0] * half, y: c[1], z: c[2] * half }
}

export interface CubeSpec {
  /** From the cluster's centre. */
  x: number
  y: number
  z: number
  size: number
  /** 0…2π: out of step with its neighbours. */
  phase: number
  /** A unit vector the cube turns about. */
  axis: readonly [number, number, number]
  /** rad/s. */
  spin: number
  /** How far it wanders, world units. */
  drift: number
  /** −1…1: a shade either side of the cluster's colour, so a cluster is not one flat colour. */
  tone: number
}

/** A cluster's cubes: a loose ellipsoid, seeded by its index so the same room is the same room. */
export function cubeField(index: number): CubeSpec[] {
  const cluster = CUBE_CLUSTERS[index]!
  const rnd = mulberry32(0x6a09e667 + index * 7919)
  const out: CubeSpec[] = []
  for (let i = 0; i < cluster.count; i++) {
    // Rejection-sample the unit ball, then stretch it into the cluster's own shape.
    let x = 0, y = 0, z = 0
    do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1 } while (x * x + y * y + z * z > 1)
    const ax = rnd() * 2 - 1, ay = rnd() * 2 - 1, az = rnd() * 2 - 1
    const al = Math.hypot(ax, ay, az) || 1
    out.push({
      x: x * 2.6, y: y * 1.15, z: z * 2.2,
      size: 0.16 + rnd() * 0.2,
      phase: rnd() * Math.PI * 2,
      axis: [ax / al, ay / al, az / al],
      spin: 0.08 + rnd() * 0.22,
      drift: 0.06 + rnd() * 0.16,
      tone: rnd() * 2 - 1
    })
  }
  return out
}

export interface Spot { x: number; z: number; facing: number }

/**
 * The whiteboard, in the back-right corner — the far one from the opening
 * camera, so it stands in the middle of the frame's upper half instead of
 * being cropped at its edge. The corners are the part of a square platform no
 * ring of desks reaches, so props placed there collide with no roster however
 * large: the ring's reach is `slabHalf − margin`, the corner sits a full
 * half-width out on the diagonal.
 */
export function boardSpot(half: number): Spot {
  const x = half - 1.8
  const z = -(half - 1.8)
  return { x, z, facing: facingToward({ x, z }, { x: 0, z: 0 }) }
}

/**
 * Four stools, all in corners: two in front of the whiteboard and two tucked
 * into the back-left corner. Corners only, because a roster that wraps most of
 * the way round the table puts desks and robots along every side (past
 * `maxSpread` the ring widens, it does not stop), and a stool at a side's
 * middle stands in a desk. The ring's outer reach is `arcRadius + REACH`, and
 * a corner point `half − 1.9` in on both axes is a diagonal `√2` further out.
 */
export function stoolSpots(half: number): Spot[] {
  const b = boardSpot(half)
  const toward = { x: Math.sin(b.facing), z: Math.cos(b.facing) }
  const side = { x: toward.z, z: -toward.x }
  const at = (x: number, z: number): Spot => ({ x, z, facing: facingToward({ x, z }, { x: 0, z: 0 }) })
  return [
    at(b.x + toward.x * 1.6 + side.x * 0.75, b.z + toward.z * 1.6 + side.z * 0.75),
    at(b.x + toward.x * 1.9 - side.x * 0.75, b.z + toward.z * 1.9 - side.z * 0.75),
    at(-(half - 1.9), -(half - 3.6)),
    at(-(half - 3.2), -(half - 1.9))
  ]
}

// ── the camera ───────────────────────────────────────────────────────────────

/** The point the orbit looks at: the middle of the room, a little above the floor. */
export const ORBIT_TARGET: Vec3 = { x: 0, y: 0.6, z: 0 }

/**
 * The opening angle, after the reference's wide shot: a corner view, not a
 * straight-on one (azimuth), looking down at about 34° (polar is measured from
 * straight up). The polar limits keep it from going under the floor or
 * straight down at it; `max` is well short of the horizon so even a low orbit
 * stays above the slab, whose top is the floor.
 */
export const VIEW = { azimuth: -0.62, polar: 0.98, minPolar: 0.3, maxPolar: 1.36, fov: 34, minDistance: 4 } as const

/** How far the opening camera stands from the target: far enough for the whole slab, a touch of it bleeding past the frame. */
export function viewDistance(arcRadius: number): number {
  return slabHalf(arcRadius) * 2.75
}

export function isoPose(arcRadius: number, target: Vec3 = ORBIT_TARGET): Vec3 {
  const d = viewDistance(arcRadius)
  const s = Math.sin(VIEW.polar)
  return { x: target.x + d * s * Math.sin(VIEW.azimuth), y: target.y + d * Math.cos(VIEW.polar), z: target.z + d * s * Math.cos(VIEW.azimuth) }
}

/** What the overlay's buttons ask of the camera; the scene (WorldView) fills it in, the chrome (WorldChrome) calls it. */
export interface CameraApi {
  /** Glide back to the opening angle, framed for the room as it is NOW. */
  fit(): void
  /** One step in (+1) or out (−1). */
  zoom(direction: 1 | -1): void
}

/** One zoom step: the distance to the target times this (in), or divided by it (out). */
export const ZOOM_STEP = 0.78

/** The camera moved along its line to the target by `factor` of its distance (< 1 closes in), kept inside [min, max]. */
export function dollyBy(position: Vec3, target: Vec3, factor: number, min: number, max: number): Vec3 {
  const dx = position.x - target.x, dy = position.y - target.y, dz = position.z - target.z
  const d = Math.hypot(dx, dy, dz)
  if (d === 0) return position
  const k = Math.min(max, Math.max(min, d * factor)) / d
  return { x: target.x + dx * k, y: target.y + dy * k, z: target.z + dz * k }
}

/** A camera glide's progress: `t` of `span` ms through an ease-in-out, 0 before it and 1 after. */
export function glide(t: number, span: number): number {
  const x = Math.min(1, Math.max(0, span <= 0 ? 1 : t / span))
  return x * x * (3 - 2 * x)
}

// ── "Ask your team" ──────────────────────────────────────────────────────────

/**
 * Who a posted request is FROM. A pseudo-agent in the same event store, never a
 * live status, so it gets no robot (`isLiveStatus`) and never counts toward the
 * room — only the whiteboard reads it. Its own id and its own seq counter, on
 * purpose: an event written into a REAL agent's stream would take a seq the
 * real feed is about to use, and the store drops the later one as a duplicate.
 */
export const ASK_AGENT_ID = 'world:you'
export const ASK_NAME = 'You'
export const ASK_MAX = 280

/** What a request says: trimmed, its runs of whitespace one space, cut to `ASK_MAX`; null for nothing. */
export function askText(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim()
  return text === '' ? null : text.slice(0, ASK_MAX)
}

export function askEvent(raw: string, seq: number, now: number): AgentEvent | null {
  const text = askText(raw)
  return text === null ? null : { agentId: ASK_AGENT_ID, seq, ts: now, type: 'message', payload: { text }, name: ASK_NAME }
}

export interface BoardCard {
  title: string
  body: string
  /** When the request was posted, or null before any was. */
  stamp: number | null
}

/** What the whiteboard's document card says: the latest request, or the board's own invitation to make one. */
export function boardCard(record: Pick<AgentRecord, 'events'> | undefined): BoardCard {
  if (record !== undefined) {
    for (let i = record.events.length - 1; i >= 0; i--) {
      const event = record.events[i]!
      if (event.type === 'message') return { title: 'Request', body: event.payload.text, stamp: event.ts }
    }
  }
  return { title: 'Board', body: 'Requests you post below land here.', stamp: null }
}

// ── the legend ───────────────────────────────────────────────────────────────

export const LEGEND_MAX = 8

export interface LegendEntry {
  agentId: string
  name: string
  color: string
}

const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

/**
 * The agent's colour as its robot wears it: the same hue, pushed to the robot's
 * candy saturation and mid lightness. `colorOf` is tuned for a dot on a dark
 * rail, and a legend dot beside a bright toy should look like the toy.
 */
export function candyHex(hex: string): string {
  const m = HEX6.exec(hex)
  if (m === null) return hex
  const r = parseInt(m[1]!, 16) / 255, g = parseInt(m[2]!, 16) / 255, b = parseInt(m[3]!, 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  const s = 0.82
  const l = Math.min(0.58, Math.max(0.46, (max + min) / 2))
  const a = s * Math.min(l, 1 - l)
  const k = (n: number): number => (n + h / 30) % 12
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  const out = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${out(f(0))}${out(f(8))}${out(f(4))}`
}

/** The agents the legend names, in roster order, and how many more there were than fit. */
export function legendEntries(roster: readonly RosterEntry[], max: number = LEGEND_MAX): { shown: LegendEntry[]; more: number } {
  const shown = roster.slice(0, max).map((a) => ({ agentId: a.agentId, name: a.name, color: candyHex(agentTint(a.agentId)) }))
  return { shown, more: Math.max(0, roster.length - max) }
}
