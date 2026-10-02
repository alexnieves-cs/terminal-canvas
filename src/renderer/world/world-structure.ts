import type { AgentRecord } from '@shared/world-events'
import { isEditTool, openCalls } from './world-activity'
import type { WorldHandoff, WorldStep, WorldTask } from './world-context-store'
import { DESK_ARC, ringPoint, type Station, type Zone } from './world-scene'

/**
 * The room's STRUCTURE (M423), as decisions with no three.js in them: which
 * files are in play and where their tiles float, which two agents are on the
 * same file (the conflict line), the terraces under each task's desks, the
 * handoff arcs between desks, and which task the board shows.
 *
 * Every object these place is a fact about the work. M416's floating cubes
 * were the reference's look with nothing behind it; a file tile is the same
 * look with a file behind it — and a tile two agents are writing is the most
 * useful thing in the room to see from across it.
 */

// ── the file tiles ──────────────────────────────────────────────────────────

export interface FileTile {
  path: string
  /** The file's own name, and the folder it sits in (the tile's two lines). */
  name: string
  dir: string
  /** Agents that touched it, the most recent last. */
  agents: readonly string[]
  /** Agents that WROTE it (an edit tool), in first-write order. */
  writers: readonly string[]
  /** The agent that touched it last, and when. */
  lastAgent: string
  lastAt: number
  /** Two or more live agents have written it: the room's conflict. */
  conflict: boolean
  /** Agents with a call open on it right now — a line runs from each to the tile. */
  open: readonly string[]
}

/** Tiles the sky holds at most; a conflict is always among them. */
export const TILE_MAX = 18
/** Tiles over one desk at most — a column taller than this climbs out of the shot. */
export const TILE_COLUMN = 4

function splitPath(path: string): { name: string; dir: string } {
  const parts = path.split('/').filter((p) => p !== '')
  const name = parts.pop() ?? path
  return { name, dir: parts.slice(-2).join('/') }
}

/**
 * Every file the LIVE agents' rings name, newest first. Only the ring: a
 * file touched fifty events ago has left it, and the sky is for what is in
 * play — the 2D canvas and the agent's transcript keep the rest.
 */
export function fileTiles(records: readonly Pick<AgentRecord, 'agentId' | 'events'>[], now: number, max: number = TILE_MAX): FileTile[] {
  interface Acc { path: string; agents: string[]; writers: string[]; lastAgent: string; lastAt: number; open: Set<string> }
  const byPath = new Map<string, Acc>()
  for (const record of records) {
    for (const event of record.events) {
      if (event.type !== 'tool_call' || event.payload.status !== 'started') continue
      const path = event.payload.path
      if (path === undefined || path === '') continue
      let acc = byPath.get(path)
      if (!acc) { acc = { path, agents: [], writers: [], lastAgent: record.agentId, lastAt: event.ts, open: new Set() }; byPath.set(path, acc) }
      acc.agents = acc.agents.filter((a) => a !== record.agentId).concat(record.agentId)
      if (isEditTool(event.payload.tool) && !acc.writers.includes(record.agentId)) acc.writers.push(record.agentId)
      if (event.ts >= acc.lastAt) { acc.lastAt = event.ts; acc.lastAgent = record.agentId }
    }
    for (const call of openCalls(record.events, now)) {
      if (call.path !== undefined && call.path !== '') byPath.get(call.path)?.open.add(record.agentId)
    }
  }
  const tiles = [...byPath.values()].map((a): FileTile => ({
    path: a.path, ...splitPath(a.path), agents: a.agents, writers: a.writers, lastAgent: a.lastAgent, lastAt: a.lastAt,
    conflict: a.writers.length >= 2, open: [...a.open]
  }))
  tiles.sort((a, b) => (a.conflict === b.conflict ? b.lastAt - a.lastAt : a.conflict ? -1 : 1))
  return tiles.slice(0, max)
}

export interface TileSpot {
  x: number
  y: number
  z: number
}

/** How high the first tile of a column floats (clear of the pill and the card), and the step between tiles. */
export const TILE_BASE_Y = 2.85
export const TILE_STEP_Y = 0.9
/** A conflict floats over the table, between the agents it is between. */
export const CONFLICT_Y = 3.3

/**
 * Where each tile floats. A file is placed over the desk of the agent that
 * touched it LAST, behind the robot (away from the table) so it never sits
 * on the robot's own pill — a column of the agent's recent files. A conflict
 * is not anyone's: it floats over the table, the room's middle, and the
 * lines to its writers cross the room to it. A tile whose agent has no
 * station (it left) is not placed.
 */
export function tileSpots(tiles: readonly FileTile[], stations: ReadonlyMap<string, Station>): Map<string, TileSpot> {
  const out = new Map<string, TileSpot>()
  const column = new Map<string, number>()
  let conflicts = 0
  for (const tile of tiles) {
    if (tile.conflict) {
      const k = conflicts++
      out.set(tile.path, { x: (k - 0.5 * Math.min(2, tiles.filter((t) => t.conflict).length - 1)) * 1.3, y: CONFLICT_Y + Math.floor(k / 3) * TILE_STEP_Y, z: 0 })
      continue
    }
    const station = stations.get(tile.lastAgent)
    const at = station?.home ?? station?.seat
    if (station === undefined || at === undefined) continue
    const k = column.get(tile.lastAgent) ?? 0
    if (k >= TILE_COLUMN) continue
    column.set(tile.lastAgent, k + 1)
    // Outward from the table: the direction from the origin through the robot.
    const r = Math.hypot(at.x, at.z) || 1
    const out1 = 0.55
    out.set(tile.path, { x: at.x + (at.x / r) * out1, y: TILE_BASE_Y + k * TILE_STEP_Y, z: at.z + (at.z / r) * out1 })
  }
  return out
}

/** A just-written tile glows for this long. */
export const TILE_FRESH_MS = 2500

// ── the terraces ────────────────────────────────────────────────────────────

/** A terrace's band across the ring: inside the desks to past the robots behind them. */
export const TERRACE = { inner: 1.15, outer: DESK_ARC.standBehind + 0.75, lift: 0.035, segments: 24 } as const

/**
 * A terrace's outline in the (x, z) plane: the outer arc from `from` to `to`,
 * then the inner arc back — the annular sector under one task's desks.
 */
export function terraceOutline(zone: Pick<Zone, 'from' | 'to'>, arcRadius: number, segments: number = TERRACE.segments): Array<readonly [number, number]> {
  const rIn = arcRadius - TERRACE.inner
  const rOut = arcRadius + TERRACE.outer
  const pts: Array<readonly [number, number]> = []
  for (let i = 0; i <= segments; i++) {
    const a = zone.from + ((zone.to - zone.from) * i) / segments
    const p = ringPoint(a, rOut)
    pts.push([p.x, p.z])
  }
  for (let i = segments; i >= 0; i--) {
    const a = zone.from + ((zone.to - zone.from) * i) / segments
    const p = ringPoint(a, rIn)
    pts.push([p.x, p.z])
  }
  return pts
}

/** Where a terrace's sign stands: on the floor at the outer edge, in the middle of its span. */
export function terraceSignSpot(zone: Pick<Zone, 'from' | 'to'>, arcRadius: number): { x: number; z: number } {
  return ringPoint((zone.from + zone.to) / 2, arcRadius + TERRACE.outer + 0.2)
}

/** What a terrace's sign says: the task, and how far its plan has got when it has one. */
export function terraceLine(task: Pick<WorldTask, 'title' | 'steps'> | undefined, fallback: string): { title: string; progress: string | null } {
  if (task === undefined) return { title: fallback, progress: null }
  const done = task.steps.filter((s) => s.tone === 'done' || /^Verified$|^Finished/.test(s.word)).length
  return { title: task.title, progress: task.steps.length > 0 ? `${done}/${task.steps.length} steps` : null }
}

/** Which task each agent sits with: the first task (in the board's order) that lists it. */
export function taskOfAgent(tasks: readonly Pick<WorldTask, 'id' | 'members'>[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const task of tasks) for (const m of task.members) if (!out.has(m)) out.set(m, task.id)
  return out
}

// ── the handoff arcs ────────────────────────────────────────────────────────

export interface HandoffArc {
  from: string
  to: string
  /** Points along the floor, from the source's desk to the target's. */
  points: Array<readonly [number, number]>
  /** It fired within `HANDOFF_FRESH_MS`. */
  fresh: boolean
}

export const HANDOFF_FRESH_MS = 6000

/**
 * A handoff between two agents in the room is a curve on the floor between
 * their desks, bowed toward the table so it does not run through the desks
 * between them. Both ends must be in the room; a handoff to an agent that is
 * not live is the 2D canvas's to show.
 */
export function handoffArcs(handoffs: readonly WorldHandoff[], stations: ReadonlyMap<string, Station>, now: number, segments = 20): HandoffArc[] {
  const out: HandoffArc[] = []
  for (const h of handoffs) {
    const a = stations.get(h.from)
    const b = stations.get(h.to)
    const pa = a?.desk ?? a?.seat
    const pb = b?.desk ?? b?.seat
    if (pa === undefined || pb === undefined || h.from === h.to) continue
    // A quadratic bowed toward the origin: the control point is the midpoint pulled in.
    const cx = (pa.x + pb.x) * 0.25
    const cz = (pa.z + pb.z) * 0.25
    const points: Array<readonly [number, number]> = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const u = 1 - t
      points.push([u * u * pa.x + 2 * u * t * cx + t * t * pb.x, u * u * pa.z + 2 * u * t * cz + t * t * pb.z])
    }
    out.push({ from: h.from, to: h.to, points, fresh: h.firedAt !== null && now - h.firedAt < HANDOFF_FRESH_MS })
  }
  return out
}

// ── the board ───────────────────────────────────────────────────────────────

/**
 * The task the board shows: the picked agent's, else the one with the most
 * agents in the room (the board's order breaks a tie), else none — and then
 * the board keeps the last request a person sent.
 */
export function focusTask(tasks: readonly WorldTask[], picked: string | null, live: readonly string[]): WorldTask | undefined {
  if (picked !== null) {
    const own = tasks.find((t) => t.members.includes(picked))
    if (own !== undefined) return own
  }
  let best: WorldTask | undefined
  let most = 0
  for (const task of tasks) {
    const n = task.members.filter((m) => live.includes(m)).length
    if (n > most) { most = n; best = task }
  }
  return best
}

/** The board's plan lines: at most this many steps, the first not finished at the top of them. */
export const BOARD_STEPS = 5

export function boardSteps(steps: readonly WorldStep[], max: number = BOARD_STEPS): WorldStep[] {
  if (steps.length <= max) return [...steps]
  const open = steps.findIndex((s) => s.tone !== 'done' && !/^Verified$/.test(s.word))
  const start = Math.max(0, Math.min(open === -1 ? steps.length - max : open - 1, steps.length - max))
  return steps.slice(start, start + max)
}
