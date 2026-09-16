import { useSyncExternalStore } from 'react'
import type { PanelId } from '@shared/types'
import type { MachineCostSnapshot, PanelMachineCost } from '@shared/machine-cost'
import { appendMachineSample, type MachineSample } from './machine-series'

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
/** Null until the first `applyMachineCosts` — a default 0% is not a sample. */
let sampledAt: number | null = null

/**
 * Round 7. Two minutes of readings per panel, for the inspector's sparkline.
 *
 * ITS OWN LISTENER SET, and that is the load-bearing part. The `costs`
 * listeners above fire only when a panel's figure CHANGES; a history grows on
 * every sample, so putting it on the same set would have turned a 2-second
 * poll into a 2-second re-render of every terminal panel subscribed to its
 * own cost — the exact cost this file's opening comment says it exists to
 * avoid. Nothing subscribes here unless a chart is on screen.
 */
const history = new Map<PanelId, readonly MachineSample[]>()
const historyListeners = new Map<PanelId, Set<() => void>>()
const EMPTY_SERIES: readonly MachineSample[] = []

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
  const first = sampledAt === null
  sampledAt = Date.now()
  const next = new Map(snapshot.panels.map((cost) => [cost.panelId, cost]))
  const ids = new Set([...costs.keys(), ...next.keys()])
  for (const id of ids) {
    const current = costs.get(id)
    const replacement = next.get(id)
    // Round 7. The history records EVERY sample, including one identical to
    // the last — a flat two minutes is a real answer and the `sameCost`
    // short-circuit below would have drawn it as a gap. It is appended before
    // that short-circuit for exactly that reason.
    if (replacement) {
      const grown = appendMachineSample(history.get(id) ?? EMPTY_SERIES, { at: sampledAt, cpuPercent: replacement.cpuPercent, memoryBytes: replacement.memoryBytes })
      if (grown !== history.get(id)) {
        history.set(id, grown)
        for (const listener of historyListeners.get(id) ?? []) listener()
      }
    }
    if (sameCost(current, replacement)) continue
    if (replacement) costs.set(id, replacement)
    else costs.delete(id)
    notify(id)
  }
  const totalsChanged = total.cpuPercent !== snapshot.total.cpuPercent || total.memoryBytes !== snapshot.total.memoryBytes
  total = snapshot.total
  if (first || totalsChanged) notifyTotal()
}

/** Epoch ms of the last applied sample, or null when none has arrived. */
export function getMachineCostSampledAt(): number | null {
  return sampledAt
}

export function clearMachineCost(panelId: PanelId): void {
  // Round 7. The history goes with the panel. A closed panel's samples are
  // not a fact about anything any more, and a key left in this map is a leak
  // that a relaunch is the only thing that clears.
  const hadHistory = history.delete(panelId)
  if (hadHistory) for (const listener of historyListeners.get(panelId) ?? []) listener()
  if (!costs.delete(panelId)) return
  notify(panelId)
}

/**
 * Round 7. The panel's last two minutes.
 *
 * Returns the SAME array until a sample lands — `useSyncExternalStore` tears
 * on a getSnapshot that builds a new value each call, so the ring is rebuilt
 * on append and only on append.
 */
export function useMachineSeries(panelId: PanelId): readonly MachineSample[] {
  const read = (): readonly MachineSample[] => history.get(panelId) ?? EMPTY_SERIES
  return useSyncExternalStore(
    (listener) => {
      const set = historyListeners.get(panelId) ?? new Set<() => void>()
      set.add(listener)
      historyListeners.set(panelId, set)
      return () => {
        set.delete(listener)
        if (set.size === 0) historyListeners.delete(panelId)
      }
    },
    read,
    read
  )
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
