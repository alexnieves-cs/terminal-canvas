import { useSyncExternalStore } from 'react'
import type { PanelId } from '@shared/types'
import type { MachineCostSnapshot, PanelMachineCost } from '@shared/machine-cost'

/**
 * Main's most recent slow process-table answer, partitioned by panel.
 *
 * This is deliberately separate from session-registry's version counter:
 * sampling a changing CPU percentage must not re-render every terminal panel,
 * let alone piggyback on the mousemove-heavy canvas render path.
 */
const costs = new Map<PanelId, PanelMachineCost>()
const listeners = new Map<PanelId, Set<() => void>>()
const totalListeners = new Set<() => void>()
let total: MachineCostSnapshot['total'] = { cpuPercent: 0, memoryBytes: 0 }

function sameCost(a: PanelMachineCost | undefined, b: PanelMachineCost | undefined): boolean {
  return a?.cpuPercent === b?.cpuPercent && a?.memoryBytes === b?.memoryBytes
}

function notify(panelId: PanelId): void {
  for (const listener of listeners.get(panelId) ?? []) listener()
}

function notifyTotal(): void {
  for (const listener of totalListeners) listener()
}

/** Replace the live snapshot, clearing a process that exited between polls. */
export function applyMachineCosts(snapshot: MachineCostSnapshot): void {
  const next = new Map(snapshot.panels.map((cost) => [cost.panelId, cost]))
  const ids = new Set([...costs.keys(), ...next.keys()])
  for (const id of ids) {
    const current = costs.get(id)
    const replacement = next.get(id)
    if (sameCost(current, replacement)) continue
    if (replacement) costs.set(id, replacement)
    else costs.delete(id)
    notify(id)
  }
  if (total.cpuPercent !== snapshot.total.cpuPercent || total.memoryBytes !== snapshot.total.memoryBytes) {
    total = snapshot.total
    notifyTotal()
  }
}

export function clearMachineCost(panelId: PanelId): void {
  if (!costs.delete(panelId)) return
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

/** Plain read for the orchestration HUD — same cache the inspector hook uses. */
export function getMachineCost(panelId: PanelId): PanelMachineCost | undefined {
  return costs.get(panelId)
}

/** Every panel in the latest sample, for the compute-block viz. */
export function listMachineCosts(): PanelMachineCost[] {
  return [...costs.values()]
}

export function useMachineCost(panelId: PanelId): PanelMachineCost | undefined {
  return useSyncExternalStore(
    (listener) => subscribe(panelId, listener),
    () => costs.get(panelId),
    () => costs.get(panelId)
  )
}

export function useMachineCostTotal(): MachineCostSnapshot['total'] {
  return useSyncExternalStore(
    (listener) => {
      totalListeners.add(listener)
      return () => totalListeners.delete(listener)
    },
    () => total,
    () => total
  )
}

/** M163. The figure's words, once: the inspector's Machine section is the readout's one home (the metrics rule). */
export function formatCpu(percent: number): string {
  return `${percent.toLocaleString(undefined, { maximumFractionDigits: percent < 10 ? 1 : 0 })}%`
}

export function formatMemory(bytes: number): string {
  const mib = bytes / (1024 * 1024)
  if (mib < 1024) return `${Math.round(mib)} MB`
  return `${(mib / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} GB`
}
