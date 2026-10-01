/**
 * The world-event contract: what an agent is doing, as a flat stream both the
 * 2D canvas and the 3D world view read. Additive instrumentation — nothing here
 * drives an agent; it only describes one.
 *
 * Deliberately NOT `AgentSessionEvent` (shared/agent-session.ts). That is the
 * session runtime's own protocol, shaped by what `claude`'s stream-json emits
 * and keyed by panel id; this is a view-level summary keyed by agent id, so a
 * simulated agent, a real session and (later) a relay or teammate agent can all
 * land in one store without the views learning any of their protocols.
 *
 * Plain functions over plain data, no React and no Electron, so main (the
 * simulator), the renderer (the store) and `verify:world` share one reducer.
 */

export type AgentStatus = 'working' | 'thinking' | 'idle' | 'waiting_approval' | 'error'

export type AgentEventType = 'status' | 'thought' | 'tool_call' | 'tool_result' | 'message' | 'error'

export interface ToolCallPayload {
  tool: string
  /** One line a person can read at a glance — `Edit src/auth.ts`, not the arguments. */
  summary: string
  detail?: string
  status: 'started' | 'done' | 'failed'
  durationMs?: number
  /**
   * Pairs a `tool_result` with the `tool_call` it answers. Optional because a
   * source that cannot pair them (a transcript with no ids) still emits both;
   * a view without it falls back to "the latest open call".
   */
  callId?: string
}

export interface TextPayload {
  text: string
}

export interface ErrorPayload {
  message: string
}

/** The payload each event type carries, so `payload` narrows on `type`. */
export interface AgentEventPayloads {
  status: AgentStatus
  thought: TextPayload
  tool_call: ToolCallPayload
  tool_result: ToolCallPayload
  message: TextPayload
  error: ErrorPayload
}

interface AgentEventOf<T extends AgentEventType> {
  agentId: string
  /**
   * Per-AGENT, strictly increasing. The store drops anything at or below the
   * last seq it holds for that agent, so a replay or a second sender cannot
   * double an event or move the status backwards.
   */
  seq: number
  /** Epoch ms at the source. */
  ts: number
  type: T
  payload: AgentEventPayloads[T]
  /** A display name, carried on any event; the store keeps the latest seen. */
  name?: string
}

export type AgentEvent = { [T in AgentEventType]: AgentEventOf<T> }[AgentEventType]

/** How many events a view can look back over, per agent. */
export const AGENT_EVENT_RING = 50

/**
 * One agent as a view sees it. Replaced, never mutated, on every accepted
 * event — the renderer store hands these to useSyncExternalStore, which
 * compares by identity.
 */
export interface AgentRecord {
  agentId: string
  name: string
  status: AgentStatus
  /** Oldest first, at most AGENT_EVENT_RING long. */
  events: readonly AgentEvent[]
  lastSeq: number
  lastTs: number
}

export function emptyAgent(agentId: string): AgentRecord {
  return { agentId, name: agentId, status: 'idle', events: [], lastSeq: -Infinity, lastTs: 0 }
}

/**
 * The status an event implies, or null when it implies none. Only `status` and
 * `error` move it: a thought or a tool call arrives WITHIN a status the source
 * already announced, and inferring one from them would let a stale tool_result
 * flip a `waiting_approval` agent back to working.
 */
export function statusAfter(event: AgentEvent): AgentStatus | null {
  if (event.type === 'status') return event.payload
  if (event.type === 'error') return 'error'
  return null
}

/**
 * Folds one event into an agent's record. Returns the SAME record when the
 * event is a duplicate or out of order, which is what lets the store skip the
 * notify — and lets a caller test "did anything change" by identity.
 */
export function applyAgentEvent(prev: AgentRecord, event: AgentEvent): AgentRecord {
  if (event.seq <= prev.lastSeq) return prev
  const events = prev.events.length >= AGENT_EVENT_RING
    ? [...prev.events.slice(prev.events.length - AGENT_EVENT_RING + 1), event]
    : [...prev.events, event]
  return {
    agentId: prev.agentId,
    name: event.name ?? prev.name,
    status: statusAfter(event) ?? prev.status,
    events,
    lastSeq: event.seq,
    lastTs: event.ts
  }
}

const TYPES: ReadonlySet<string> = new Set<AgentEventType>(['status', 'thought', 'tool_call', 'tool_result', 'message', 'error'])
const STATUSES: ReadonlySet<string> = new Set<AgentStatus>(['working', 'thinking', 'idle', 'waiting_approval', 'error'])

/**
 * The envelope check the store runs on what crosses the bridge. Shallow on
 * purpose — it guards the fields the reducer reads (id, seq, type, a status
 * value), so one malformed event from a future source is dropped rather than
 * poisoning an agent's status with `undefined`.
 */
export function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  if (typeof e.agentId !== 'string' || e.agentId === '') return false
  if (typeof e.seq !== 'number' || !Number.isFinite(e.seq)) return false
  if (typeof e.ts !== 'number' || typeof e.type !== 'string' || !TYPES.has(e.type)) return false
  if (e.type === 'status') return typeof e.payload === 'string' && STATUSES.has(e.payload)
  return typeof e.payload === 'object' && e.payload !== null
}

/**
 * Whether the feed is delivering. The feed is main → renderer over IPC, so
 * "disconnected" is not a socket dropping: it is main's feed failing (its
 * translator or its send threw) or the bridge not being there at all. `lost`
 * carries the reason a person can read, and the view offers a retry — which
 * asks main to rebuild the feed and say every agent's status again.
 */
export type WorldConnection = { state: 'live' } | { state: 'lost'; reason: string }
