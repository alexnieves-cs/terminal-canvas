import { useSyncExternalStore } from 'react'
import { applyAgentEvent, emptyAgent, isAgentEvent, type AgentRecord, type AgentStatus, type WorldConnection } from '@shared/world-events'
import type { CanvasBridge } from '@shared/ipc-contract'
import { ASK_AGENT_ID, askEvent } from './world-set'
import { foldTo, trimJournal, type Fold, type JournalEntry } from './world-replay'
import { installAwayTracker } from './world-away'

/**
 * Every agent the world feed has described: a ring of its last events and the
 * status they imply. The ONE subscriber to WORLD_EVENTS — the 2D canvas and the
 * 3D world view both read this store and never the bridge, so a second view
 * cannot see a different world than the first.
 *
 * A module-level store subscribed through useSyncExternalStore, the shape
 * session/subagent-store.ts uses, and NOT zustand: zustand's door is the
 * workflow editor's own and is "not an app-wide state layer"
 * (src/renderer/CLAUDE.md). Like every store beside it, it never bumps
 * registry.version() — a simulated tick would re-render every panel.
 *
 * A CACHE of what the feed said. Nothing here decides an agent's status; the
 * reducer in shared/world-events.ts does, the same one verify:world runs.
 */

const agents = new Map<string, AgentRecord>()
/** Replaced only when an agent is FIRST seen, so the roster hook is stable across ticks. */
let agentIds: readonly string[] = []
/** Bumped once per batch that changed anything — the cheap "did the world move" read for a frame loop. */
let version = 0

/**
 * M425. Every accepted event, in arrival order — the room's memory for the
 * scrubber and the away tour (world-replay.ts). Trimmed to the last hour.
 */
let journal: JournalEntry[] = []
let lastArrival = -Infinity
/**
 * M425. The room as of a past moment, while a person scrubs or tours; null is
 * live. While it is set, every READ below (getAgent, the ids, every hook)
 * answers from this fold, and live events still land in `agents` and the
 * journal but notify nobody but the scrubber — the past room holds still
 * while the present keeps arriving.
 */
let replay: Fold | null = null
let replayIds: readonly string[] = []
const journalListeners = new Set<() => void>()

const agentListeners = new Map<string, Set<() => void>>()
const rosterListeners = new Set<() => void>()
const worldListeners = new Set<() => void>()

function notifyAll(set: Iterable<() => void> | undefined): void {
  if (!set) return
  for (const listener of set) listener()
}

/**
 * Folds a batch from the feed in, then notifies — each changed agent once, the
 * roster once if it grew, the world once — so a 16ms batch of forty tokens is
 * one render, not forty. Anything `isAgentEvent` refuses is dropped silently:
 * the feed is instrumentation, and one bad event must not stop the rest.
 */
export function ingestAgentEvents(batch: readonly unknown[], arrivedAt: number = Date.now()): void {
  const changed = new Set<string>()
  let rosterGrew = false
  for (const event of batch) {
    if (!isAgentEvent(event)) continue
    const prev = agents.get(event.agentId)
    if (!prev) rosterGrew = true
    const next = applyAgentEvent(prev ?? emptyAgent(event.agentId), event)
    if (next === prev) continue
    agents.set(event.agentId, next)
    changed.add(event.agentId)
    // Arrival only rises (the fold stops at the first line past its moment); a clock step back is folded flat.
    lastArrival = Math.max(lastArrival, arrivedAt)
    journal.push({ at: lastArrival, event })
  }
  if (changed.size === 0) return
  if (rosterGrew) agentIds = [...agents.keys()]
  version++
  notifyAll(journalListeners)
  // The past room holds still: live events are kept, and shown when the person comes back to live.
  if (replay !== null) return
  if (journal.length > 256 && (journal.length & 255) === 0) journal = trimJournal(journal, Date.now())
  for (const id of changed) notifyAll(agentListeners.get(id))
  if (rosterGrew) notifyAll(rosterListeners)
  notifyAll(worldListeners)
}

/** The pseudo-agent's own seq: it is the only writer of its stream, so a counter is all the contract asks. */
let askSeq = 0

/**
 * The "Ask your team" pill's door (M416). There is no existing command for it —
 * the app's "team ask" is the approval queue, an agent asking people, the other
 * way round — so a request is a `message` event in this store from a
 * pseudo-agent (`ASK_AGENT_ID`) that is never live and so never has a robot.
 * Only the whiteboard reads it. NOTHING here dispatches to a running agent;
 * that is a bridge call, and the scene reads the store and nothing else
 * (`verify:world world.door.3`). Returns false for a request with nothing in it.
 */
export function postTeamAsk(text: string, now: number = Date.now()): boolean {
  const event = askEvent(text, ++askSeq, now)
  if (event === null) { askSeq--; return false }
  ingestAgentEvents([event])
  return agents.has(ASK_AGENT_ID)
}

let connection: WorldConnection = { state: 'live' }
const connectionListeners = new Set<() => void>()

function setConnection(next: WorldConnection): void {
  if (next.state === connection.state && (next.state === 'live' || (connection.state === 'lost' && connection.reason === next.reason))) return
  connection = next
  notifyAll(connectionListeners)
}

let disconnect: (() => void) | null = null
/** The bridge `connectAgentWorld` was given, kept so a retry from a view goes through here and no view holds the bridge. */
let world: CanvasBridge['world'] | null = null

/**
 * Starts the feed. Idempotent, and called once at module scope in main.tsx —
 * ahead of the first render for the reason the default-template subscription
 * there is: a push that lands before a component's effect has subscribed is
 * lost, and nothing re-sends it.
 *
 * Also the one subscriber to the feed's CONNECTION: main reports `lost` when
 * its translator or its send fails, and a bridge with no `world` door at all
 * (an older preload) is `lost` from the start rather than an empty room that
 * looks like "no agents".
 */
export function connectAgentWorld(bridge: Pick<CanvasBridge, 'world'>): () => void {
  // M425: the away stamp the room's catch-up reads — from startup, not from when the room first opened.
  installAwayTracker()
  if (!disconnect) {
    const door = bridge.world as CanvasBridge['world'] | undefined
    if (door === undefined) {
      setConnection({ state: 'lost', reason: 'This window has no world feed.' })
    } else {
      world = door
      const offEvents = door.onEvents(ingestAgentEvents)
      const offConnection = door.onConnection(setConnection)
      // The push only fires on a CHANGE; a feed that failed before this window
      // loaded would otherwise read as live.
      void door.status().then(setConnection, () => undefined)
      disconnect = () => { offEvents(); offConnection() }
    }
  }
  return () => {
    disconnect?.()
    disconnect = null
  }
}

/**
 * Asks main to rebuild the feed and say every agent's status again. The
 * answer is the connection that results; it is also pushed, so every view that
 * shows `lost` clears at once. Never rejects: a retry that cannot even reach
 * main leaves the connection `lost`, with the reason.
 */
export async function retryAgentWorld(): Promise<void> {
  try {
    if (world === null) throw new Error('This window has no world feed.')
    setConnection(await world.retry())
  } catch (error) {
    setConnection({ state: 'lost', reason: error instanceof Error ? error.message : String(error) })
  }
}

export function getWorldConnection(): WorldConnection {
  return connection
}

export function useWorldConnection(): WorldConnection {
  return useSyncExternalStore((l) => subscribeIn(connectionListeners, l), getWorldConnection, getWorldConnection)
}

export function getAgent(agentId: string): AgentRecord | undefined {
  return replay !== null ? replay.records.get(agentId) : agents.get(agentId)
}

export function getAgentIds(): readonly string[] {
  return replay !== null ? replayIds : agentIds
}

// ── the room's memory (M425) ────────────────────────────────────────────────

/** The journal as it stands: every accepted event of the last hour, arrival order. */
export function getJournal(): readonly JournalEntry[] {
  return journal
}

export function subscribeJournal(listener: () => void): () => void {
  return subscribeIn(journalListeners, listener)
}

/** The moment the room shows: the replay's, or now. Every clock-read rule in the scene (quiet, stale calls, a fresh tile) reads this, so the past room is quiet where it was quiet. */
export function worldNow(): number {
  return replay !== null ? replay.at : Date.now()
}

export function replayAt(): number | null {
  return replay?.at ?? null
}

const replayListeners = new Set<() => void>()

/**
 * Shows the room as of `t` (null: live again). Folds forward from the last
 * moment when `t` is later — a playing scrubber — and from the start when it
 * is earlier. Notifies EVERY reader, because every record may have changed.
 */
export function setReplayAt(t: number | null): void {
  if (t === null) {
    if (replay === null) return
    replay = null
    journal = trimJournal(journal, Date.now())
  } else {
    const at = Math.min(t, Date.now())
    if (replay !== null && replay.at === at) return
    replay = foldTo(journal, at, replay ?? undefined)
    if (replay.ids.length !== replayIds.length || replay.ids.some((id, i) => replayIds[i] !== id)) replayIds = replay.ids
  }
  version++
  for (const set of agentListeners.values()) notifyAll(set)
  notifyAll(rosterListeners)
  notifyAll(worldListeners)
  notifyAll(replayListeners)
}

export function useReplayAt(): number | null {
  return useSyncExternalStore((l) => subscribeIn(replayListeners, l), replayAt, replayAt)
}

export function getAgentWorldVersion(): number {
  return version
}

function subscribeIn(set: Set<() => void>, listener: () => void): () => void {
  set.add(listener)
  return () => { set.delete(listener) }
}

function subscribeAgent(agentId: string, listener: () => void): () => void {
  let set = agentListeners.get(agentId)
  if (!set) {
    set = new Set()
    agentListeners.set(agentId, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) agentListeners.delete(agentId)
  }
}

/**
 * Any change at all, outside React — for a render loop (an R3F useFrame) that
 * reads getAgent on its own beat and only wants to know the world moved.
 */
export function subscribeAgentWorld(listener: () => void): () => void {
  return subscribeIn(worldListeners, listener)
}

/** Every agent id the feed has named, first-seen order. Stable until a new one appears. */
export function useAgentIds(): readonly string[] {
  return useSyncExternalStore((l) => subscribeIn(rosterListeners, l), getAgentIds, getAgentIds)
}

/**
 * One agent's record. The snapshot is the STORED object, never one built per
 * call — useSyncExternalStore compares by identity, and a fresh object each
 * read loops React (subagent-store.ts records the same trap).
 */
export function useAgent(agentId: string): AgentRecord | undefined {
  return useSyncExternalStore(
    (l) => subscribeAgent(agentId, l),
    () => getAgent(agentId),
    () => getAgent(agentId)
  )
}

/** Just the status: a string snapshot, so a new thought does not re-render a status dot. */
export function useAgentStatus(agentId: string): AgentStatus | undefined {
  return useSyncExternalStore(
    (l) => subscribeAgent(agentId, l),
    () => getAgent(agentId)?.status,
    () => getAgent(agentId)?.status
  )
}
