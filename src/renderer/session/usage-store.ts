import { useSyncExternalStore } from 'react'
import type { PanelId } from '@shared/types'
import type { PanelUsage } from '@shared/cost'

/**
 * What each panel's agent has spent, as told by main.
 *
 * Another module-level store beside agent-state-store.ts, live-session-store.ts
 * and the link store, and subscribed the same way: PER PANEL ID. This must
 * never bump registry.version() — that counter deliberately moves only on
 * tier/status/focus/exit so a chatty agent cannot re-render the canvas at
 * 60Hz, and a fact that changes on every agent TURN riding it would put that
 * traffic straight back, for every panel, on every OTHER panel's turn. This is
 * one more entry recording that rule; each of the others found it
 * independently.
 *
 * A CACHE of main's answer, never a second author of it. Nothing here counts
 * anything; main reads the transcript and this holds what arrived.
 */

const usage = new Map<PanelId, PanelUsage>()
const listeners = new Map<PanelId, Set<() => void>>()

/**
 * M699. Every arrival, stamped, per panel: the fleet wall's spend over time
 * (backlog #19's history half for a live session; M142's ledger is the
 * week's). ITS OWN LISTENER SET, machine-cost-store's Round 7 rule: the
 * per-panel listeners above are a panel's own readout, and a wall that
 * subscribed there would make every panel's turn re-render every other
 * panel's subscriber. Nothing subscribes here unless the wall is showing.
 *
 * Bounded twice, like the world journal it is drawn beside: the last hour,
 * and at most HISTORY_MAX arrivals a panel (an arrival is one agent turn).
 * The stored objects are main's, replaced and never mutated, so a point
 * costs one reference.
 */
export interface UsageArrival { at: number; usage: PanelUsage }
export const HISTORY_MAX = 720
export const HISTORY_MAX_AGE_MS = 60 * 60_000
let history: ReadonlyMap<PanelId, readonly UsageArrival[]> = new Map()
const historyListeners = new Set<() => void>()

function notifyHistory(): void {
  for (const listener of historyListeners) listener()
}

function notify(panelId: PanelId): void {
  const set = listeners.get(panelId)
  if (!set) return
  for (const listener of set) listener()
}

/**
 * Called by the one IPC subscription in Canvas.tsx.
 *
 * No equality check, unlike applyLiveSession's: main already sends only on a
 * change, and usage is a monotonically growing object whose every arrival IS a
 * change. A deep compare here would cost more than the re-render it saves.
 * The object is REPLACED rather than mutated, which is what lets the hook hand
 * React a stable reference between arrivals.
 */
export function applyUsage(panelId: PanelId, next: PanelUsage, at: number = Date.now()): void {
  usage.set(panelId, next)
  notify(panelId)
  // M699. A NEW map each arrival: the wall's useSyncExternalStore compares by
  // identity. One map of a few panels per agent turn is the whole cost.
  const prev = history.get(panelId) ?? []
  let start = Math.max(0, prev.length + 1 - HISTORY_MAX)
  while (start < prev.length && at - prev[start]!.at > HISTORY_MAX_AGE_MS) start += 1
  const grown = new Map(history)
  grown.set(panelId, [...prev.slice(start), { at, usage: next }])
  history = grown
  notifyHistory()
}

/**
 * A panel is gone for good: closed, undone, or dropped by a reset. Without
 * this the map grows for the life of the renderer and a recycled panel id
 * inherits a dead panel's spend — the same reason clearAgentState and
 * clearLiveSession exist.
 */
export function clearUsage(panelId: PanelId): void {
  // M699. The history goes with the panel, for the reason above: a recycled
  // id must not draw a dead panel's spend on the wall.
  if (history.has(panelId)) {
    const shrunk = new Map(history)
    shrunk.delete(panelId)
    history = shrunk
    notifyHistory()
  }
  if (!usage.has(panelId)) return
  usage.delete(panelId)
  notify(panelId)
}

/** A plain read, for callers that want the answer at call time. */
export function getUsage(panelId: PanelId): PanelUsage | undefined {
  return usage.get(panelId)
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
 * The snapshot is the STORED object, never one built per call.
 * useSyncExternalStore compares snapshots by identity, so returning a fresh
 * object each time makes React see a new value every render and loop — the
 * same trap attentionSnapshot and useLiveSession both exist for.
 */
export function useUsage(panelId: PanelId): PanelUsage | undefined {
  return useSyncExternalStore(
    (listener) => subscribe(panelId, listener),
    () => usage.get(panelId),
    () => usage.get(panelId)
  )
}

/** M699. Every panel's arrivals, for a plain read (the time-lapse film reads it once). */
export function getUsageHistory(): ReadonlyMap<PanelId, readonly UsageArrival[]> {
  return history
}

/** M699. The same map as a hook; a new identity only when an arrival lands or a panel goes. */
export function useUsageHistory(): ReadonlyMap<PanelId, readonly UsageArrival[]> {
  return useSyncExternalStore(
    (listener) => {
      historyListeners.add(listener)
      return () => { historyListeners.delete(listener) }
    },
    () => history,
    () => history
  )
}
