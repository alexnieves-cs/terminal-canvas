import type { CapHold } from '@shared/agent-session'
import type { FloorPoint } from '@shared/redesign-contracts'
import type { AgentRecord } from '@shared/world-events'
import { canvasToFloor, FLOOR_SCALE, floorToCanvas } from '@shared/world-space'
import { isEditTool, openCalls } from './world-activity'
import { holdLead } from './world-facts'
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

/**
 * A canvas box stood up (M450). The centre is `canvasToFloor` of the box's
 * centre, and the size is the box divided by the same scale — one conversion,
 * so a terrace and its region cannot be fitted twice. A desk or a console
 * uses the panel's centre the same way.
 */
export interface CanvasBox {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface FloorTerrace {
  id: string
  /** The chip, already the one sentence the terrace sign paints. */
  label: string
  center: FloorPoint
  w: number
  d: number
}

export function terraceFloor(box: Pick<CanvasBox, 'x' | 'y' | 'w' | 'h'>): { center: FloorPoint; w: number; d: number } {
  return {
    center: canvasToFloor({ x: box.x + box.w / 2, y: box.y + box.h / 2 }),
    w: box.w / FLOOR_SCALE,
    d: box.h / FLOOR_SCALE
  }
}

export function panelFloor(box: Pick<CanvasBox, 'x' | 'y' | 'w' | 'h'>): FloorPoint {
  return canvasToFloor({ x: box.x + box.w / 2, y: box.y + box.h / 2 })
}

/**
 * The canvas delta of a drag between two floor points. The caller commits it
 * with `moveRegion` — one plan, one undo — the same verb the 2D region drag
 * uses. This module does not import that verb: `world.ctx.door.1` keeps
 * every world file but the publisher out of the canvas.
 */
export function terraceDragCanvas(from: FloorPoint, to: FloorPoint): { dx: number; dy: number } {
  const a = floorToCanvas(from)
  const b = floorToCanvas(to)
  return { dx: b.x - a.x, dy: b.y - a.y }
}

/**
 * Where the stood-up room sits after one committed terrace drag. The frame
 * stays: recomputing it would slide the whole room to keep the new centre
 * under the camera. Members and the terrace move by the canvas delta; the
 * floor centre is that delta through `canvasToFloor`, the same conversion
 * the terrace was stood up with.
 */
export function shiftPlacement(
  panels: readonly CanvasBox[],
  regions: readonly CanvasBox[],
  floors: readonly FloorTerrace[],
  regionId: string,
  memberIds: readonly string[],
  dx: number,
  dy: number
): { panels: CanvasBox[]; regions: CanvasBox[]; floors: FloorTerrace[] } {
  const ids = new Set(memberIds)
  const floor = canvasToFloor({ x: dx, y: dy })
  return {
    panels: panels.map((box) => (ids.has(box.id) ? { ...box, x: box.x + dx, y: box.y + dy } : box)),
    regions: regions.map((box) => (box.id === regionId ? { ...box, x: box.x + dx, y: box.y + dy } : box)),
    floors: floors.map((terrace) => (terrace.id === regionId
      ? { ...terrace, center: { x: terrace.center.x + floor.x, z: terrace.center.z + floor.z } }
      : terrace))
  }
}

/**
 * Orbit stays off while a terrace drag owns the pointer. OrbitControls
 * listens on the canvas element itself, so a raycast `stopPropagation`
 * does not reach it — the rig binds the switch.
 */
let terraceOrbit: ((enabled: boolean) => void) | null = null

export function bindTerraceOrbit(next: ((enabled: boolean) => void) | null): void {
  terraceOrbit = next
}

export function setTerraceOrbit(enabled: boolean): void {
  terraceOrbit?.(enabled)
}

/**
 * The sign the mockup paints: title, ticket, then criteria as `done/total`.
 * The 2D chip (`regionLabel`) says "2 of 4 criteria" and an agent count;
 * the terrace drops the zero-value count and keeps the fraction. A chip
 * with no criteria is the title and the ticket.
 */
export function terraceSignFromChip(chip: string): string {
  const parts = chip.split(' · ').map((part) => part.trim()).filter((part) => part !== '')
  const title = parts[0] ?? chip
  const ticket = parts.find((part) => /^[A-Z]+-\d+$/.test(part))
  const criteria = parts.map((part) => /^(\d+) of (\d+) criteria$/.exec(part)).find((match) => match !== null)
  const out = [title]
  if (ticket !== undefined) out.push(ticket)
  if (criteria != null) out.push(`${criteria[1]}/${criteria[2]}`)
  return out.join(' · ')
}

export interface FloorFrame {
  center: FloorPoint
  /** Half the longer side, plus a lip, so the slab holds every terrace. */
  half: number
}

export function frameOf(terraces: readonly Pick<FloorTerrace, 'center' | 'w' | 'd'>[]): FloorFrame | null {
  if (terraces.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const terrace of terraces) {
    minX = Math.min(minX, terrace.center.x - terrace.w / 2)
    maxX = Math.max(maxX, terrace.center.x + terrace.w / 2)
    minZ = Math.min(minZ, terrace.center.z - terrace.d / 2)
    maxZ = Math.max(maxZ, terrace.center.z + terrace.d / 2)
  }
  return {
    center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
    half: Math.max(maxX - minX, maxZ - minZ) / 2 + 1.6
  }
}

/** A placed box whose inline style is canvas pixels (`left` / `top` / `width` / `height`). */
export function boxFromStyle(id: string, left: string, top: string, width: string, height: string): CanvasBox | null {
  const x = Number.parseFloat(left)
  const y = Number.parseFloat(top)
  const w = Number.parseFloat(width)
  const h = Number.parseFloat(height)
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null
  return { id, x, y, w, h }
}

const STAND_BEHIND = 0.85

/**
 * Desks and homes move onto the panel's floor point. A station with no desk
 * (the conductor) stays at its seat. Facing is toward the desk from the
 * camera's side (+z): the robot stands just this side of the panel.
 */
export function placeStations<T extends Station>(stations: ReadonlyMap<string, T>, panels: readonly CanvasBox[]): Map<string, T> {
  if (panels.length === 0) return new Map(stations)
  const byId = new Map(panels.map((panel) => [panel.id, panel]))
  const out = new Map<string, T>()
  for (const [id, station] of stations) {
    const box = byId.get(id)
    if (box === undefined || station.desk === undefined) {
      out.set(id, station)
      continue
    }
    const at = panelFloor(box)
    out.set(id, {
      ...station,
      desk: { x: at.x, z: at.z, facing: 0 },
      home: { x: at.x, z: at.z + STAND_BEHIND, facing: Math.PI }
    })
  }
  return out
}

/** Panels the roster did not take a desk for: plain shells, drawn as consoles. */
export function consoleBoxes(panels: readonly CanvasBox[], deskIds: ReadonlySet<string>): CanvasBox[] {
  return panels.filter((panel) => !deskIds.has(panel.id))
}

/**
 * The ask chip. Only a waiting agent wears one; the words are its latest
 * message (the fixture's "wants to edit ledger.ts"), else a short ask.
 */
export function askChip(record: Pick<AgentRecord, 'status' | 'events'>): string | null {
  if (record.status !== 'waiting_approval') return null
  for (let i = record.events.length - 1; i >= 0; i--) {
    const event = record.events[i]!
    if (event.type === 'message') {
      const text = event.payload.text.trim()
      if (text !== '') return text
    }
  }
  return 'Waiting on you'
}

/**
 * The failed pill. The feed's own words ("exited 1"), not a hardcoded lint
 * sentence. Absent unless the agent has stopped.
 */
export function failedLine(record: Pick<AgentRecord, 'status' | 'events'>): string | null {
  if (record.status !== 'error') return null
  for (let i = record.events.length - 1; i >= 0; i--) {
    const event = record.events[i]!
    if (event.type === 'message') {
      const text = event.payload.text.trim()
      if (text !== '') return text
    }
    if (event.type === 'error' && event.payload.message.trim() !== '') return event.payload.message.trim()
  }
  return 'Exited'
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

// ── the card's headline (M424) ──────────────────────────────────────────────

/** Another live agent writing a file this one is writing — the conflict, from this agent's side. */
export function conflictPartners(records: readonly Pick<AgentRecord, 'agentId' | 'events'>[], agentId: string, now: number): { file: string; others: string[] } | null {
  for (const tile of fileTiles(records, now)) {
    if (tile.conflict && tile.writers.includes(agentId)) return { file: tile.name, others: tile.writers.filter((w) => w !== agentId) }
  }
  return null
}

export type HeadlineTone = 'wait' | 'stop' | 'warn' | 'work' | 'quiet' | 'said'

export interface Headline {
  text: string
  tone: HeadlineTone
}

/** A failed tool is the headline for this long, unless a later call of the same tool went through. */
export const FAILED_MS = 60_000

const VERB_OF: Readonly<Record<string, string>> = {
  read: 'Reading', search: 'Searching', edit: 'Editing', test: 'Testing', shell: 'Running', web: 'Browsing', delegate: 'Delegating'
}

/**
 * The ONE fact a card leads with (M424): the thing that would change what a
 * person does next, not the agent's last sentence. In order — a request
 * waiting on them, a cap's hold (M428), a stop, a failure just now, a file
 * another agent is also writing, a long silence — and only when none of those
 * is true, what the hands are on, and then the agent's own latest words. The
 * card's second line keeps the words, so nothing the agent said is lost by
 * leading with a fact.
 *
 * The hold sits SECOND: like a request it is a needs-you with a person's fix
 * (the decision queue's "Allow more"), and while it stands main serves the
 * agent nothing — so a stop or a failure under it is history the hold already
 * outranks, and its next send would be refused whatever else is true. It
 * comes after a request because a request names the one thing to answer
 * first. `warn`, the amber of a conflict: a blocker, not a crash. The caller
 * passes no hold in the past room (a present-day fact; WorldCard).
 */
export function cardHeadline(
  record: Pick<AgentRecord, 'status' | 'events' | 'lastTs' | 'name'>,
  opts: { approval?: { toolName: string }; held?: CapHold; partners?: { file: string; others: string[] } | null; partnerName?: (id: string) => string; now: number; activity: string; words: string }
): Headline {
  const { now } = opts
  if (record.status === 'waiting_approval') {
    const tool = opts.approval?.toolName
    return { text: tool === undefined ? 'Waiting on you' : `Asks to ${tool === 'Bash' ? 'run' : 'use'} ${tool}`, tone: 'wait' }
  }
  if (opts.held !== undefined) return { text: holdLead(opts.held), tone: 'warn' }
  if (record.status === 'error') {
    for (let i = record.events.length - 1; i >= 0; i--) {
      const e = record.events[i]!
      if (e.type === 'error') return { text: `Stopped: ${e.payload.message}`, tone: 'stop' }
    }
    return { text: 'Stopped', tone: 'stop' }
  }
  // A failure stands until a later call of the same tool goes through, or a minute passes.
  for (let i = record.events.length - 1; i >= 0; i--) {
    const e = record.events[i]!
    if (e.type !== 'tool_result') continue
    if (e.payload.status === 'failed' && now - e.ts < FAILED_MS) {
      const later = record.events.slice(i + 1).some((x) => x.type === 'tool_result' && x.payload.tool === e.payload.tool && x.payload.status === 'done')
      if (!later) return { text: `Failed: ${e.payload.detail ?? e.payload.summary}`, tone: 'stop' }
    }
    break
  }
  if (opts.partners) {
    const names = opts.partners.others.map((id) => opts.partnerName?.(id) ?? id)
    return { text: `${opts.partners.file} — also being written by ${names.join(', ')}`, tone: 'warn' }
  }
  if (opts.activity === 'quiet') {
    const mins = Math.max(1, Math.round((now - record.lastTs) / 60_000))
    return { text: `Quiet for ${mins} min`, tone: 'quiet' }
  }
  const verb = VERB_OF[opts.activity]
  if (verb !== undefined) {
    const open = openCalls(record.events, now)
    const call = [...open].reverse().find((c) => (opts.activity === 'delegate') === /^(Task|Agent)$/.test(c.tool))
    if (call !== undefined) {
      // A file reads as an object ("Editing b.ts"); a command or a sub-task as what it is ("Testing: npm test").
      if (call.path !== undefined && call.path !== '') return { text: `${verb} ${call.path.split('/').pop()!}`, tone: 'work' }
      const target = call.summary.startsWith(`${call.tool} `) ? call.summary.slice(call.tool.length + 1) : call.summary
      return { text: `${verb}: ${target}`, tone: 'work' }
    }
  }
  return { text: opts.words, tone: 'said' }
}

// ── the density tiers (M424) ────────────────────────────────────────────────

/**
 * Which density layer a card shows, from how many screen pixels one world unit
 * spans at its robot (product-rules' four layers, by distance): REST far off —
 * the name and the state dot; CONTEXTUAL in the middle — the one-line
 * headline; the INSPECTOR's full card up close. A waiting or picked agent's
 * card is full at any distance (WorldCard), because a request is never rest.
 */
export type CardTier = 'rest' | 'context' | 'full'
export const TIER_REST_PX = 34
export const TIER_FULL_PX = 88

export function cardTier(pxPerUnit: number, previous: CardTier | null): CardTier {
  // A little hysteresis, so an orbit that sits on a threshold does not flicker the card.
  const up = (px: number): number => (previous === null ? px : px * 1.06)
  const down = (px: number): number => (previous === null ? px : px * 0.94)
  if (previous === 'full') return pxPerUnit >= down(TIER_FULL_PX) ? 'full' : pxPerUnit >= TIER_REST_PX ? 'context' : 'rest'
  if (previous === 'rest') return pxPerUnit < up(TIER_REST_PX) ? 'rest' : pxPerUnit >= TIER_FULL_PX ? 'full' : 'context'
  return pxPerUnit >= up(TIER_FULL_PX) ? 'full' : pxPerUnit < down(TIER_REST_PX) ? 'rest' : 'context'
}
