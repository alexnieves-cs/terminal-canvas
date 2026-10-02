import { agentWord } from '@renderer/panels/panel-state'
import type { AgentState } from '@shared/types'
import type { AgentEvent, AgentRecord, AgentStatus } from '@shared/world-events'
import { robotTint } from './world-palette'

/**
 * What the 3D world view DECIDES, with no three.js and no React in it, so
 * `verify:world` can run every rule in plain node and the scene files (the
 * lazily-loaded set in CLAUDE.md's library table) are left to do only drawing.
 *
 * The scene reads the event store and nothing else; everything it needs to know
 * about an agent — where it stands, what it is doing with its hands, what its
 * card says — is a function of that agent's `AgentRecord` and the roster.
 *
 * World units are metres-ish: a robot is ~1.5 tall, a desk ~1.7 wide. +x is
 * screen-right, +z is toward the camera, y is up, the meeting table is the
 * origin. A "facing" is a rotation about y for a model whose front is +z, so a
 * facing of `f` looks along (sin f, 0, cos f).
 */

export interface Slot {
  x: number
  z: number
  /** Rotation about y. */
  facing: number
}

export const TABLE = {
  /** Tabletop radius. */
  radius: 1.2,
  /** How far from the table's centre a robot stands — clear of its edge. */
  seatRadius: 1.95
} as const

export const DESK_ARC = {
  /** The arc's radius for a handful of desks. */
  radius: 5.8,
  /** Arc length each desk is given, so a row of them never overlaps. */
  perDesk: 3.5,
  /** The arc may wrap this far round the table before it widens instead. */
  maxSpread: Math.PI * 1.45,
  /** How far behind its desk (away from the table) the robot stands. */
  standBehind: 1.15
} as const

/** The direction (as a facing) from one point to another. */
export function facingToward(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
}

/**
 * An agent leads the room — stands at the table, owns no desk — when its id or
 * display name carries the word. A matter of naming because the contract has no
 * role field: a source that wants a conductor says so in the name it already
 * sends, and nothing in the event types had to grow for the view.
 */
export function isConductor(agent: { agentId: string; name: string }): boolean {
  return CONDUCTOR_WORD.test(agent.agentId) || CONDUCTOR_WORD.test(agent.name)
}
const CONDUCTOR_WORD = /(?:^|[^a-z])(?:conductor|orchestrator)(?:[^a-z]|$)/i

export interface RosterEntry {
  agentId: string
  name: string
}

/** One agent's fixed places in the room. */
export interface Station {
  agentId: string
  conductor: boolean
  /** Absent for the conductor, who has no desk. */
  desk?: Slot
  /** Where the robot stands behind its desk — absent with the desk. */
  home?: Slot
  /** Where it stands at the meeting table (the conductor's is the head of it). */
  seat: Slot
  /** Roster position, which picks the model (Character / Character_Gun). */
  index: number
}

export interface StationPlan {
  conductorId: string | null
  stations: ReadonlyMap<string, Station>
  /** The arc's radius — how big a room this is, for framing the camera. */
  arcRadius: number
}

/** Angle from the far (−z) side of the table, going round toward +x. */
function ringPoint(angle: number, radius: number): { x: number; z: number } {
  return { x: Math.sin(angle) * radius, z: -Math.cos(angle) * radius }
}

/** How far (radians) from the head of the table a worker's spot is kept — the conductor's place. */
export const HEAD_CLEARANCE = 0.5

/**
 * A worker's spot at the table is the one straight in front of its own desk, so
 * the trip is short and direct and two workers' spots keep the order of their
 * desks. A desk near the far-side centre would put it ON the conductor, so
 * those spots are pushed to either side of the head instead.
 */
function seatAngle(deskAngle: number): number {
  return Math.abs(deskAngle) >= HEAD_CLEARANCE ? deskAngle : deskAngle < 0 ? -HEAD_CLEARANCE : HEAD_CLEARANCE
}

/**
 * Every agent's desk and table seat, from the roster alone. First-seen order
 * decides everything, so a new agent joining slides the arc to make room and
 * nobody swaps places. The arc is a LOOSE one: each desk's radius and angle
 * wander a little, by a function of its index rather than of chance, so the
 * same roster is always the same room.
 */
export function stationPlan(roster: readonly RosterEntry[]): StationPlan {
  const conductor = roster.find(isConductor)
  const workers = roster.filter((a) => a !== conductor)
  const n = workers.length

  const wanted = n > 1 ? ((n - 1) * DESK_ARC.perDesk) / DESK_ARC.radius : 0
  const spread = Math.min(wanted, DESK_ARC.maxSpread)
  // Past the cap the arc grows rather than the desks crowd.
  const arcRadius = wanted > DESK_ARC.maxSpread ? ((n - 1) * DESK_ARC.perDesk) / DESK_ARC.maxSpread : DESK_ARC.radius

  const stations = new Map<string, Station>()
  const center = { x: 0, z: 0 }

  let workerIndex = 0
  roster.forEach((agent, index) => {
    if (agent === conductor) {
      const at = ringPoint(0, TABLE.seatRadius)
      stations.set(agent.agentId, { agentId: agent.agentId, conductor: true, seat: { ...at, facing: facingToward(at, center) }, index })
      return
    }
    const i = workerIndex++
    const baseAngle = n > 1 ? -spread / 2 + (spread * i) / (n - 1) : 0
    const angle = baseAngle + (n > 1 ? Math.sin(i * 1.31) * 0.05 : 0)
    const radius = arcRadius + Math.sin(i * 2.17) * 0.3
    const desk = ringPoint(angle, radius)
    const stand = ringPoint(angle, radius + DESK_ARC.standBehind)
    const seatAt = ringPoint(seatAngle(angle), TABLE.seatRadius)
    stations.set(agent.agentId, {
      agentId: agent.agentId,
      conductor: false,
      desk: { ...desk, facing: facingToward(desk, center) },
      home: { ...stand, facing: facingToward(stand, center) },
      seat: { ...seatAt, facing: facingToward(seatAt, center) },
      index
    })
  })
  return { conductorId: conductor?.agentId ?? null, stations, arcRadius }
}

// ── who is in the room ──────────────────────────────────────────────────────

/**
 * A table for the reason `CAN_TYPE` below is one: `verify:rail state.2` keeps a
 * state word from being spelled as a literal outside panel-state.ts.
 */
const LIVE: Readonly<Record<AgentStatus, boolean>> = {
  working: true, thinking: true, waiting_approval: true, idle: false, error: false
}

/**
 * Whether an agent gets a robot. The room is for work happening NOW — an agent
 * that is working, thinking or waiting on a person. A dormant or finished one
 * (idle), or one that stopped on an error, stays on the 2D canvas only: it has
 * nothing to do at a desk, and a room of idle robots would bury the live ones.
 * So an errored agent leaves the room too: the HitReact and the bee over it are seen
 * only by someone watching when the error lands.
 */
export function isLiveStatus(status: AgentStatus): boolean {
  return LIVE[status]
}

// ── what an agent does ──────────────────────────────────────────────────────

export type Goal = 'home' | 'table'

/**
 * Where an agent wants to be. The conductor lives at the table; anyone else
 * walks there when they are waiting on a person (the one status that is a
 * request), and goes back when it is answered. Nothing else moves an agent
 * between places — a thought or a tool call happens where it stands.
 */
export function goalOf(status: AgentStatus, conductor: boolean): Goal {
  return conductor || status === 'waiting_approval' ? 'table' : 'home'
}

/** The one-shot a new event sets off, if any. Status and tool starts do not: they are STATES (below), not blips. */
export type Effect = 'tilt' | 'wave' | 'hit'

export function effectOf(event: AgentEvent): Effect | null {
  switch (event.type) {
    case 'thought': return 'tilt'
    case 'message': return 'wave'
    case 'error': return 'hit'
    case 'tool_result': return event.payload.status === 'failed' ? 'hit' : null
    default: return null
  }
}

/** A tool call nobody ever answered stops counting as "typing" after this. */
export const TYPING_STALE_MS = 60_000

/**
 * Which statuses can be mid tool call. A table rather than `status !== 'working'`
 * because `verify:rail state.2` forbids a state word spelled as a literal anywhere
 * in the renderer outside panel-state.ts — the vocabulary has one home — and a
 * table is also the honest shape: every status answers the question.
 */
const CAN_TYPE: Readonly<Record<AgentStatus, boolean>> = {
  working: true, thinking: false, idle: false, waiting_approval: false, error: false
}

/**
 * Is the agent mid tool call — a call opened and not yet answered, while it is
 * `working`. Pairs by callId and falls back to "the latest open call" for a
 * source that has none (the contract's own rule for it). `now` is a parameter so
 * the stale cap is testable; a source that never sends a result would otherwise
 * type for ever.
 */
export function isTyping(record: Pick<AgentRecord, 'status' | 'events'>, now: number): boolean {
  if (!CAN_TYPE[record.status]) return false
  const open = new Map<string, number>()
  for (const event of record.events) {
    if (event.type === 'tool_call' && event.payload.status === 'started') {
      open.set(event.payload.callId ?? `anon:${open.size}:${event.seq}`, event.ts)
    } else if (event.type === 'tool_result') {
      const id = event.payload.callId
      if (id !== undefined) open.delete(id)
      else {
        const last = [...open.keys()].pop()
        if (last !== undefined) open.delete(last)
      }
    }
  }
  for (const ts of open.values()) if (now - ts < TYPING_STALE_MS) return true
  return false
}

// ── what the card says ──────────────────────────────────────────────────────

/** The panel state each feed status IS, where the app already has a word for it. */
const PANEL_STATE: Readonly<Partial<Record<AgentStatus, AgentState>>> = {
  working: 'busy', idle: 'idle', waiting_approval: 'wants-you'
}

/**
 * The word the card shows. Where the app's own vocabulary has the state —
 * working, idle, needs you — the word comes from `panel-state.ts`'s `agentWord`,
 * so a person reads the same word on the rail, the canvas and in the world and
 * "needs you" is never respelled. The feed's `thinking` and `error` have no panel
 * state (a panel is `working` while it thinks, and an error is a status of the
 * feed, not of a process), so those two are this view's own words.
 */
export function statusWord(status: AgentStatus): string {
  const panel = PANEL_STATE[status]
  return panel !== undefined ? agentWord(panel).word : status
}

/**
 * The robot's colour — its shell, its desk screen's glow and its legend dot.
 * `order` is the store's first-seen agent ids (`getAgentIds`); see `robotTint`
 * for why it is the arrival order and not a hash of the id (M417).
 */
export function agentTint(agentId: string, order: readonly string[]): string {
  return robotTint(agentId, order)
}

// ── the hologram card and the procedural robot (M415) ───────────────────────

/** A live agent that has said nothing for this long — no event, no open call — reads as quiet. */
export const QUIET_MS = 45_000

/**
 * The card's status badge. Named for the panel states (never the words: `verify:rail
 * state.2` forbids spelling `working` outside panel-state.ts), plus `quiet`, which no
 * panel state has — it is the world's own reading of a live agent gone silent.
 */
export type BadgeKind = 'busy' | 'quiet' | 'idle' | 'wants-you' | 'stopped'

export interface Badge {
  kind: BadgeKind
  word: string
}

const BADGE_OF: Readonly<Record<AgentStatus, BadgeKind>> = {
  working: 'busy', thinking: 'busy', waiting_approval: 'wants-you', idle: 'idle', error: 'stopped'
}

/**
 * What the badge says. A working or thinking agent is WORKING while anything is
 * happening — an event inside `QUIET_MS`, or a tool call still open (a long test
 * run is not silence) — and QUIET once neither is true. `now` is a parameter
 * because quiet arrives with the clock, not with an event, and so the rule is
 * testable. Words come from `agentWord` wherever the app already has one.
 */
export function cardBadge(record: Pick<AgentRecord, 'status' | 'events' | 'lastTs'>, now: number): Badge {
  const kind = BADGE_OF[record.status]
  if (kind === 'busy' && now - record.lastTs > QUIET_MS && !isTyping(record, now)) return { kind: 'quiet', word: 'quiet' }
  switch (kind) {
    case 'busy': return { kind, word: agentWord('busy').word }
    case 'idle': return { kind, word: agentWord('idle').word }
    case 'wants-you': return { kind, word: agentWord('wants-you').word }
    default: return { kind, word: statusWord(record.status) }
  }
}

/**
 * The card's title. The contract has no task field, so the title is the
 * agent's own latest words about what it is doing — its last thought or
 * message — and its name when it has said nothing yet.
 */
export function cardTitle(record: Pick<AgentRecord, 'name' | 'events'>): string {
  for (let i = record.events.length - 1; i >= 0; i--) {
    const event = record.events[i]!
    if (event.type === 'thought' || event.type === 'message') {
      const text = event.payload.text.trim()
      if (text !== '') return text
    }
  }
  return record.name
}

export interface ToolLine {
  /** callId, or the call's seq for a source that has none — a stable React key. */
  key: string
  tool: string
  text: string
  state: 'running' | 'done' | 'failed'
}

/**
 * The agent's latest few tool calls, oldest first (a log reads down), one line
 * per CALL: a result folds into the call it answers (by callId, or the latest
 * open call for a source without ids — `isTyping`'s rule), so a finished call
 * is one `done` line, not a `started` line and a `done` line.
 */
export function recentTools(record: Pick<AgentRecord, 'events'>, max = 4): ToolLine[] {
  const lines: ToolLine[] = []
  const byCall = new Map<string, ToolLine>()
  for (const event of record.events) {
    if (event.type === 'tool_call') {
      const p = event.payload
      const line: ToolLine = { key: p.callId ?? `seq:${event.seq}`, tool: p.tool, text: toolText(p.tool, p.summary), state: p.status === 'started' ? 'running' : p.status }
      lines.push(line)
      byCall.set(line.key, line)
    } else if (event.type === 'tool_result') {
      const p = event.payload
      const open = p.callId !== undefined ? byCall.get(p.callId) : [...lines].reverse().find((l) => l.state === 'running')
      const state = p.status === 'failed' ? 'failed' : 'done'
      if (open) open.state = state
      else lines.push({ key: p.callId ?? `seq:${event.seq}`, tool: p.tool, text: toolText(p.tool, p.summary), state })
    }
  }
  return lines.slice(-max)
}

/** The real feed's summary starts with the tool's own name ("Read src/x.ts"); the line already shows it, in its own column. */
function toolText(tool: string, summary: string): string {
  return summary.startsWith(`${tool} `) ? summary.slice(tool.length + 1) : summary === tool ? '' : summary
}

/** A new tool call makes the robot hop. Only a START: its result is a state change, not a beat. */
export function hopsOn(event: AgentEvent): boolean {
  return event.type === 'tool_call' && event.payload.status === 'started'
}

/**
 * The robot's lean, in radians about its own x axis (+ is forward): toward its
 * desk while it types, a little back while it thinks, toward the table while it
 * waits there for a person, into the step while it walks. The robot faces what
 * it is busy with, so "toward its focus" is forward.
 */
export function leanOf(status: AgentStatus, typing: boolean, moving: boolean): number {
  if (moving) return 0.1
  if (typing) return 0.16
  if (status === 'thinking') return -0.06
  if (status === 'waiting_approval') return 0.08
  return 0
}
