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
  if (states.get(panelId) === state) return
  states.set(panelId, state)
  notify(panelId)
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
}

export function getAgentState(panelId: PanelId): AgentState | undefined {
  return states.get(panelId)
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
