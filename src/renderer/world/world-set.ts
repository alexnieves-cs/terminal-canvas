import type { AgentEvent, AgentRecord } from '@shared/world-events'
import type { AgentStatus } from '@shared/world-events'
import { agentTint, DESK_ARC, facingToward, type RosterEntry } from './world-scene'
import { seatIndex } from './world-palette'
import type { Vec3 } from './world-transition'
import type { RoomPlan } from './world-minimap'

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
  /** M425: glide to one agent — its desk, or the table when it waits there — from the side the camera is on. False when it is not in the room. */
  focus(agentId: string): boolean
  /** M434: the room from above, for the minimap (`world-minimap.ts`) — null before the scene has its controls. */
  plan(): RoomPlan | null
  /** M434: glide so the orbit looks at this point on the floor, from the same side and distance. */
  centre(x: number, z: number): void
}

/** How far a focus glide stands from its agent. */
export const FOCUS_DISTANCE = 11

/** Where a focus glide puts the camera: `FOCUS_DISTANCE` from the agent along the line the camera already looks down. */
export function focusPose(at: { x: number; z: number }, camera: Vec3, target: Vec3): { position: Vec3; target: Vec3 } {
  const look = { x: at.x, y: 0.9, z: at.z }
  const dx = camera.x - target.x, dy = camera.y - target.y, dz = camera.z - target.z
  const d = Math.hypot(dx, dy, dz) || 1
  return { position: { x: look.x + (dx / d) * FOCUS_DISTANCE, y: look.y + (dy / d) * FOCUS_DISTANCE, z: look.z + (dz / d) * FOCUS_DISTANCE }, target: look }
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

export interface BoardStep {
  title: string
  word: string
  tone: string
}

export interface BoardCard {
  title: string
  body: string
  /** When the request was posted, or null before any was. */
  stamp: number | null
  /** M423: the task's plan, when the board shows a task — at most `BOARD_STEPS` lines. */
  steps?: readonly BoardStep[]
}

/**
 * M423: the board shows the task in focus (`focusTask`) and its plan; with no
 * task in the room it keeps M416's last request. A task with no plan yet is
 * its title alone — the board never states a zero ("0 steps").
 */
export function taskBoard(task: { title: string; steps: readonly BoardStep[] } | undefined, record: Pick<AgentRecord, 'events'> | undefined): BoardCard {
  if (task === undefined) return boardCard(record)
  return task.steps.length > 0 ? { title: 'Plan', body: task.title, stamp: null, steps: task.steps } : { title: 'Task', body: task.title, stamp: null }
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

/**
 * The agents the legend names, in roster order, and how many more there were
 * than fit. Each dot is its robot's shell colour exactly (`agentTint` over the
 * same first-seen `order` the robots read), so the dot beside a name is the toy
 * it names.
 */
export function legendEntries(roster: readonly RosterEntry[], order: readonly string[], max: number = LEGEND_MAX): { shown: LegendEntry[]; more: number } {
  const shown = roster.slice(0, max).map((a) => ({ agentId: a.agentId, name: a.name, color: agentTint(a.agentId, order) }))
  return { shown, more: Math.max(0, roster.length - max) }
}

// ── the richness pass: rim, breath, contact, floor, accessories ─────────────

/**
 * The shell's rim: three's `sheen` on the robots' MeshPhysicalMaterial, a
 * lobe that lights only at grazing angles — so the silhouette catches a pale
 * edge against the pale slab instead of the tint running flat into it. White,
 * and soft (`roughness`), because a tinted or tight sheen reads as a second
 * colour painted on the outline rather than light on plastic.
 */
export const SHELL_RIM = { sheen: 0.55, roughness: 0.42, color: '#ffffff' } as const

/** How the platform's trim breathes: `hz` cycles a second, `depth` the most it brightens (0 = still). */
export interface TrimPulse { hz: number; depth: number }

export const TRIM_STILL: TrimPulse = { hz: 0, depth: 0 }

/**
 * Which statuses make the trim breathe. A table, not `s === 'working'`: `verify:rail state.2`
 * keeps state words out of renderer literals (world-scene's `CAN_TYPE` is the precedent),
 * and every status answers.
 */
const BREATHES: Readonly<Record<AgentStatus, boolean>> = {
  working: true, thinking: true, idle: false, waiting_approval: false, error: false
}

/**
 * The trim follows the room's work: still while nobody is busy — the resting
 * look is M416's exactly, so an idle room is the quiet room it always was —
 * and breathing while agents work, deeper and a little quicker the larger the
 * share of the room that is busy. `working` and `thinking` count; waiting
 * does not, because the table already turns amber for that (M422) and two
 * signals for one fact would compete. The slowest breath is ~0.3 Hz and the
 * quickest under 0.6, below anything that reads as a blink or an alarm.
 */
export function trimPulse(statuses: readonly (AgentStatus | undefined)[]): TrimPulse {
  const live = statuses.filter((s) => s !== undefined && s !== 'idle')
  if (live.length === 0) return TRIM_STILL
  const busy = live.filter((s) => s !== undefined && BREATHES[s]).length
  if (busy === 0) return TRIM_STILL
  const share = busy / live.length
  return { hz: 0.3 + 0.25 * share, depth: 0.25 + 0.35 * share }
}

/**
 * The multiplier on the trim's glow at time `t` seconds: 1 at the bottom of
 * each breath, `1 + depth` at the top. It only ever BRIGHTENS, so a still room
 * (and prefers-reduced-motion, which holds it still) is exactly 1 — the trim
 * as it was before it breathed.
 */
export function trimBreath(t: number, pulse: TrimPulse, reduced: boolean): number {
  if (reduced || pulse.depth <= 0 || pulse.hz <= 0) return 1
  return 1 + pulse.depth * 0.5 * (1 - Math.cos(2 * Math.PI * pulse.hz * t))
}

/**
 * The soft shadow under each robot: a contact blob that grounds it where the
 * key light's shadow cannot — the `flat` quality tier draws no shadow map at
 * all, and even with one a shadow falls off to the side, leaving the feet
 * floating. The blob follows the body: smaller and fainter as it hops off the
 * floor, and gone with it when it pops in, leaves or sinks.
 */
// Tighter and denser after a look at the lit room (M431 critic): at 0.5/0.34 the key light's cast shadow drowned it and the robots read as hovering.
export const CONTACT = { radius: 0.42, opacity: 0.5 } as const

export function contactBlob(lift: number, body: number): { scale: number; opacity: number } {
  const off = Math.min(Math.max(lift, 0) / 0.4, 1)
  const b = Math.min(Math.max(body, 0), 1)
  return { scale: b * (1 - 0.3 * off), opacity: CONTACT.opacity * b * (1 - 0.6 * off) }
}

/**
 * The floor's paint: large soft tiles centred on the table, so the seams run
 * through the room's middle and every desk ring sits on the same grid, and a
 * faint darkening toward the lip that keeps the eye in. Painted once in code
 * (the CSP takes no image from elsewhere) and only ever darkens, a few percent.
 */
export const FLOOR = { tile: 1.6, seam: 0.07, vignette: 0.09, px: 1024 } as const

/**
 * Where the seams cross a floor `span` wide, as fractions 0…1 across it: one
 * through the middle and then every `tile` out to the edges.
 */
export function floorSeams(span: number, tile: number = FLOOR.tile): number[] {
  if (!(span > 0) || !(tile > 0)) return []
  const half = span / 2
  const out: number[] = []
  for (let k = -Math.floor(half / tile); k <= Math.floor(half / tile); k++) {
    const at = (half + k * tile) / span
    if (at > 0 && at < 1) out.push(at)
  }
  return out
}

/** What stands on a desk beside the screen. One per agent, so desks in a ring differ. */
export type Accessory = 'mug' | 'plant' | 'papers' | 'lamp'
export const ACCESSORIES: readonly Accessory[] = ['plant', 'mug', 'lamp', 'papers']

/**
 * An agent's desk accessory and which end of the desk it stands at, from its
 * seat in the first-seen order (`seatIndex`, the same count its tint comes
 * from) — so it never changes in a session, and neighbours differ. The side
 * flips every full turn of the list, so the fifth desk is not the first's twin.
 */
export function deskAccessory(agentId: string, order: readonly string[]): { kind: Accessory; side: 1 | -1 } {
  const i = seatIndex(agentId, order)
  return { kind: ACCESSORIES[i % ACCESSORIES.length]!, side: Math.floor(i / ACCESSORIES.length) % 2 === 0 ? 1 : -1 }
}
