import { useSyncExternalStore } from 'react'
import type { AgentState, PanelId } from '@shared/types'

/**
 * What each panel's agent is doing, as told by main.
 *
 * Module-level and outside React, like session-registry.ts — but subscribed
 * PER PANEL ID rather than through one version counter, and that difference is
 * the whole point. registry.version() deliberately ignores 16ms-batched PTY
 * data so a chatty agent cannot re-render the canvas at 60Hz; routing agent
 * state through it would put exactly that traffic back. Here a state change
 * notifies the one panel it is about and nothing else.
 *
 * This store is a CACHE of main's state, never a second author of it. Nothing
 * in the renderer writes a state it decided for itself — focus goes out over
 * agent:acknowledge and comes back as an update, so main stays the only place
 * the machine runs. See IPC.AGENT_ACKNOWLEDGE for why that asymmetry exists.
 */

const states = new Map<PanelId, AgentState>()
const listeners = new Map<PanelId, Set<() => void>>()

function notify(panelId: PanelId): void {
  const set = listeners.get(panelId)
  if (!set) return
  for (const listener of set) listener()
}

/** Called by the one IPC subscription in Canvas.tsx. */
export function applyAgentState(panelId: PanelId, state: AgentState): void {
  const prev = states.get(panelId)
  if (prev === state) return
  states.set(panelId, state)
  notify(panelId)
  syncAttention(panelId, state)
  for (const listener of transitionListeners) listener(panelId, state, prev)
}

/**
 * M41. A fan-out of every state CHANGE, with the previous state — for the
 * handoff hook, which needs two transitions no per-id subscription serves:
 * busy -> idle (a completed turn) and "left starting" (a woken target can now
 * receive a paste). It rides applyAgentState, the ONE IPC subscription, so it
 * adds no second `agent.onState` and stays a pure in-renderer fan-out — the
 * same rule the per-id `subscribe` and the attention set already obey.
 */
type TransitionListener = (panelId: PanelId, state: AgentState, prev: AgentState | undefined) => void
const transitionListeners = new Set<TransitionListener>()

export function onAgentTransition(listener: TransitionListener): () => void {
  transitionListeners.add(listener)
  return () => transitionListeners.delete(listener)
}

/**
 * A panel is gone for good: closed, undone, or dropped by a reset. Without
 * this the map grows for the life of the renderer and a recycled panel id
 * would inherit a dead panel's border.
 */
export function clearAgentState(panelId: PanelId): void {
  if (!states.has(panelId)) return
  states.delete(panelId)
  notify(panelId)
  syncAttention(panelId, undefined)
}

export function getAgentState(panelId: PanelId): AgentState | undefined {
  return states.get(panelId)
}

/**
 * Who is waiting, in ENTRY order — a Set iterates in insertion order, which is
 * exactly the queue Cmd+J steps through: longest-waiting first.
 *
 * A SECOND subscription rather than a second store. The per-id subscription
 * above answers "what is panel n3 doing"; this answers "who wants me", which
 * is a set-valued question no per-id hook can serve without every panel
 * subscribing to every other panel — the fan-out this module exists to avoid.
 *
 * It notifies only on MEMBERSHIP change. busy/idle churn on a chatty agent
 * moves through applyAgentState constantly and must not reach here, or the
 * pip layer re-renders at the flush rate for panels whose pips did not move.
 */
const wanting = new Set<PanelId>()
const attentionListeners = new Set<() => void>()
// useSyncExternalStore compares snapshots by identity, so this must be a
// cached array rebuilt only when membership actually changed. Returning a
// fresh array per call makes React re-render forever.
let attentionSnapshot: PanelId[] = []

function syncAttention(panelId: PanelId, state: AgentState | undefined): void {
  const should = state === 'wants-you'
  if (should === wanting.has(panelId)) return
  if (should) wanting.add(panelId)
  else wanting.delete(panelId)
  attentionSnapshot = [...wanting]
  for (const listener of attentionListeners) listener()
}

function subscribe(panelId: PanelId, listener: () => void): () => void {
  let set = listeners.get(panelId)
  if (!set) {
    set = new Set()
    listeners.set(panelId, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(panelId)
  }
}

/**
 * The snapshot is a string or undefined — a primitive, so useSyncExternalStore
 * can compare it by identity without a cache. Returning the map, or an object
 * built per call, would make React see a new value every render and loop.
 */
export function useAgentState(panelId: PanelId): AgentState | undefined {
  return useSyncExternalStore(
    (listener) => subscribe(panelId, listener),
    () => states.get(panelId),
    () => states.get(panelId)
  )
}

/**
 * The queue as a plain read, for the Cmd+J handler: a keydown wants the
 * current answer at press time, not a subscription.
 */
export function attentionIds(): PanelId[] {
  return attentionSnapshot
}

/**
 * The queue can only ever hold panels with a LIVE process, and that falls out
 * of where the states come from rather than needing a filter here: main emits
 * agent state only for sessions in PtyManager's map, which has no dormant
 * entries. A restored canvas full of never-spawned panels therefore draws no
 * pips at all — the spec's "indicators drawn for dormant panels" failure is
 * unreachable by construction, and adding a defensive filter would create a
 * second place that decides what "waiting" means.
 */
/** The same queue, as a subscription, for the pip layer. */
export function useAttentionIds(): PanelId[] {
  return useSyncExternalStore(
    (listener) => {
      attentionListeners.add(listener)
      return () => attentionListeners.delete(listener)
    },
    () => attentionSnapshot,
    () => attentionSnapshot
  )
}
