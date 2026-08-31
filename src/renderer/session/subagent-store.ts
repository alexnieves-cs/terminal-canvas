import { useSyncExternalStore } from 'react'
import type { PanelId, SubagentRecord, SubagentUpdate } from '@shared/types'

/**
 * Which subagents each panel's agent is running, as told by main.
 *
 * Another module-level store beside agent-state-store.ts and
 * live-session-store.ts, subscribed the same way: PER PANEL ID. It must never
 * bump registry.version() — that counter deliberately moves only on
 * tier/status/focus/exit, and a fact that changes when a model decides to fan
 * out would re-render every panel on every OTHER panel's fan-out. This is the
 * fifth entry to record that rule.
 *
 * A CACHE of main's answer, never a second author of it. Nothing here decides
 * that a subagent exists.
 */

export interface Subagents {
  records: SubagentRecord[]
  /** Subagents beyond main's cap, rendered as `+N more`. */
  overflow: number
  ambiguous: boolean
  /** How many panels share this panel's repository, itself included. */
  sharing: number
}

const subagents = new Map<PanelId, Subagents>()
const listeners = new Map<PanelId, Set<() => void>>()

function notify(panelId: PanelId): void {
  const set = listeners.get(panelId)
  if (!set) return
  for (const listener of set) listener()
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
export function applySubagents(panelId: PanelId, update: SubagentUpdate): void {
  const prev = subagents.get(panelId)
  const serialized = JSON.stringify(update.records)
  if (
    prev &&
    prev.ambiguous === update.ambiguous &&
    prev.sharing === update.sharing &&
    prev.overflow === update.overflow &&
    JSON.stringify(prev.records) === serialized
  ) {
    return
  }
  subagents.set(panelId, {
    records: update.records,
    overflow: update.overflow,
    ambiguous: update.ambiguous,
    sharing: update.sharing
  })
  notify(panelId)
}

/**
 * A panel is gone for good: closed, undone, or dropped by a reset. Without
 * this the map grows for the life of the renderer and a recycled panel id
 * inherits a dead panel's subagents — the same reason clearLiveSession and
 * clearAgentState exist.
 */
export function clearSubagents(panelId: PanelId): void {
  if (!subagents.has(panelId)) return
  subagents.delete(panelId)
  notify(panelId)
}

/** A plain read, for callers that want the answer at call time. */
export function getSubagents(panelId: PanelId): Subagents | undefined {
  return subagents.get(panelId)
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
 * { records, ambiguous } fresh each time makes React see a new value every
 * render and loop — the same trap live-session-store.ts's snapshot exists
 * for.
 */
export function useSubagents(panelId: PanelId): Subagents | undefined {
  return useSyncExternalStore(
    (listener) => subscribe(panelId, listener),
    () => subagents.get(panelId),
    () => subagents.get(panelId)
  )
}
