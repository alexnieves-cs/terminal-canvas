import { useSyncExternalStore } from 'react'
import type { PanelId } from '@shared/types'
import type { PanelUsage } from '@shared/cost'

/**
 * What each panel's agent has spent, as told by main.
 *
 * A FOURTH module-level store beside agent-state-store.ts, live-session-store.ts
 * and the link store, and subscribed the same way: PER PANEL ID. This must
 * never bump registry.version() — that counter deliberately moves only on
 * tier/status/focus/exit so a chatty agent cannot re-render the canvas at
 * 60Hz, and a fact that changes on every agent TURN riding it would put that
 * traffic straight back, for every panel, on every OTHER panel's turn. This is
 * the fourth entry to record that rule; each of the previous three found it
 * independently.
 *
 * A CACHE of main's answer, never a second author of it. Nothing here counts
 * anything; main reads the transcript and this holds what arrived.
 */

const usage = new Map<PanelId, PanelUsage>()
const listeners = new Map<PanelId, Set<() => void>>()

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
export function applyUsage(panelId: PanelId, next: PanelUsage): void {
  usage.set(panelId, next)
  notify(panelId)
}

/**
 * A panel is gone for good: closed, undone, or dropped by a reset. Without
 * this the map grows for the life of the renderer and a recycled panel id
 * inherits a dead panel's spend — the same reason clearAgentState and
 * clearLiveSession exist.
 */
export function clearUsage(panelId: PanelId): void {
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
