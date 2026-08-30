import { useSyncExternalStore } from 'react'
import type { PanelId } from '@shared/types'
import type { FileResult } from '@shared/file-panel'

/**
 * What each open file panel's file currently says, as told by main.
 *
 * A FOURTH module-level store beside agent-state-store.ts and
 * live-session-store.ts, subscribed the same way: PER PANEL ID.
 *
 * It must never bump registry.version(). That counter deliberately moves only
 * on tier/status/focus/exit so a chatty agent cannot re-render the canvas at
 * 60Hz, and this is the most acute case yet — file content can change several
 * times a second while an agent writes, and riding that counter would
 * re-render every panel on the canvas on every byte some OTHER panel's file
 * gained. CLAUDE.md records this rule three times already; this is the fourth.
 *
 * A CACHE of main's answer, never a second author of it. Nothing here decides
 * what a file says; main reads and this holds what arrived.
 */

const results = new Map<PanelId, FileResult>()
const listeners = new Map<PanelId, Set<() => void>>()

function notify(panelId: PanelId): void {
  const set = listeners.get(panelId)
  if (!set) return
  for (const listener of set) listener()
}

/**
 * Called by the ONE canvas-wide file:changed subscription, and by the
 * component's own first read.
 *
 * No equality check here, unlike applyLiveSession: main already deduped
 * against a hash of the whole result, and re-hashing a 2MB string on the
 * renderer's main thread to save a re-render of one panel is the wrong trade —
 * the exact opposite of the trade that made the hash worth it in main, where
 * it saved an IPC message.
 */
export function applyFileResult(panelId: PanelId, result: FileResult): void {
  results.set(panelId, result)
  notify(panelId)
}

/**
 * A panel is gone for good: closed, undone, or dropped by a reset. Without
 * this the map grows for the life of the renderer and a recycled panel id
 * inherits a dead panel's file — the same reason clearAgentState and
 * clearLiveSession exist.
 */
export function clearFileResult(panelId: PanelId): void {
  if (!results.has(panelId)) return
  results.delete(panelId)
  notify(panelId)
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
 * trap attentionSnapshot and useLiveSession each exist for.
 */
export function useFileResult(panelId: PanelId): FileResult | undefined {
  return useSyncExternalStore(
    (listener) => subscribe(panelId, listener),
    () => results.get(panelId),
    () => results.get(panelId)
  )
}
