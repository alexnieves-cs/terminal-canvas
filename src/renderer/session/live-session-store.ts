import { useSyncExternalStore } from 'react'
import type { PanelId } from '@shared/types'

/**
 * Where each panel IS and what it is RUNNING, as told by main.
 *
 * Another module-level store beside agent-state-store.ts, and subscribed the
 * same way: PER PANEL ID. registry.version() deliberately bumps only on
 * tier/status/focus/exit so a chatty agent cannot re-render the canvas at 60Hz;
 * a fact that changes on a 2s tick riding it would put that traffic straight
 * back, for every panel, on every OTHER panel's `cd`. This is the fourth entry
 * to record that rule — #5, #17 and #18 each found it independently.
 *
 * A CACHE of main's answer, never a second author of it. Nothing here decides a
 * cwd; main polls tmux and this holds what arrived.
 */

export interface LiveSession {
  cwd: string
  currentCommand: string
}

const live = new Map<PanelId, LiveSession>()
const listeners = new Map<PanelId, Set<() => void>>()
// Canvas-wide. useAttentionQueue cannot subscribe per id in a loop whose
// length is the census. Fired only from notify(), which apply and clear
// call after a real cwd or command change.
const anyListeners = new Set<() => void>()

function notify(panelId: PanelId): void {
  const set = listeners.get(panelId)
  if (set) for (const listener of set) listener()
  for (const listener of anyListeners) listener()
}

/** Fires when any panel's cwd or command changes. The return unsubscribes. */
export function subscribeLiveSessions(listener: () => void): () => void {
  anyListeners.add(listener)
  return () => { anyListeners.delete(listener) }
}

/**
 * Called by the one IPC subscription in Canvas.tsx.
 *
 * The equality check is a SECOND dedupe and is not redundant with main's.
 * Main's stops the message crossing the process boundary; this one stops a
 * re-render if a message ever arrives unchanged — a reload, a future
 * snapshot-on-load, or a second sender. The object is replaced only on a real
 * change, which is what lets the hook below hand React a stable reference.
 */
export function applyLiveSession(panelId: PanelId, cwd: string, currentCommand: string): void {
  const prev = live.get(panelId)
  if (prev && prev.cwd === cwd && prev.currentCommand === currentCommand) return
  live.set(panelId, { cwd, currentCommand })
  notify(panelId)
}

/**
 * A panel is gone for good: closed, undone, or dropped by a reset. Without this
 * the map grows for the life of the renderer and a recycled panel id inherits a
 * dead panel's directory — the same reason clearAgentState exists.
 */
export function clearLiveSession(panelId: PanelId): void {
  if (!live.has(panelId)) return
  live.delete(panelId)
  notify(panelId)
}

/** A plain read, for callers that want the answer at call time. */
export function getLiveSession(panelId: PanelId): LiveSession | undefined {
  return live.get(panelId)
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
 * useSyncExternalStore compares snapshots by identity, so returning
 * { cwd, currentCommand } fresh each time makes React see a new value every
 * render and loop — the same trap attentionSnapshot exists for.
 */
export function useLiveSession(panelId: PanelId): LiveSession | undefined {
  return useSyncExternalStore(
    (listener) => subscribe(panelId, listener),
    () => live.get(panelId),
    () => live.get(panelId)
  )
}
