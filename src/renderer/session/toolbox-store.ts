import { useSyncExternalStore } from 'react'
import type { PanelId } from '@shared/types'
import type { ToolInventoryResult } from '@shared/toolbox'

/**
 * Another module-level store, subscribed per panel id, over a cached snapshot.
 *
 * The rule every store in this directory records, and it is the one that must
 * not be undone: **this store must never bump `registry.version()`.** That
 * counter is what `TerminalPanel`'s `memo` is gated on, and it deliberately
 * moves only on tier/status/focus/exit — anything higher-frequency riding it
 * re-renders every panel on the canvas on every OTHER panel's change, the 60Hz
 * cascade `version()` exists to block. A toolbox answer is lower-frequency
 * than any of its five predecessors (it changes when a human saves a config
 * file), which is exactly why the temptation to "just" reuse the counter is
 * strongest here and would be no less wrong.
 *
 * A cache of main's answer, never a second author of it.
 */

const results = new Map<PanelId, ToolInventoryResult>()
const listeners = new Map<PanelId, Set<() => void>>()

function notify(panelId: PanelId): void {
  const set = listeners.get(panelId)
  if (set === undefined) return
  for (const listener of set) listener()
}

export function applyToolbox(panelId: PanelId, result: ToolInventoryResult): void {
  results.set(panelId, result)
  notify(panelId)
}

/**
 * Cleared at every panel-removing site, or the map grows for the life of the
 * renderer and a RECYCLED panel id inherits a dead panel's inventory.
 */
export function clearToolbox(panelId: PanelId): void {
  if (!results.has(panelId)) return
  results.delete(panelId)
  notify(panelId)
}

function subscribe(panelId: PanelId, listener: () => void): () => void {
  const set = listeners.get(panelId) ?? new Set<() => void>()
  set.add(listener)
  listeners.set(panelId, set)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(panelId)
  }
}

export function getToolbox(panelId: PanelId): ToolInventoryResult | undefined {
  return results.get(panelId)
}

/**
 * The snapshot is the STORED object, never one built per call:
 * `useSyncExternalStore` compares by identity, so a fresh object on every read
 * makes React believe the store changed on every render, and it loops.
 */
export function useToolbox(panelId: PanelId): ToolInventoryResult | undefined {
  return useSyncExternalStore(
    (listener) => subscribe(panelId, listener),
    () => results.get(panelId)
  )
}
