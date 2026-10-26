import { useSyncExternalStore } from 'react'
import type { VmLaneInfo } from '@shared/vm-lane'

/**
 * M553 (lane J). The renderer's copy of main's sandboxed lanes — a cache of
 * `vm:lanes` and its pushes, never a second author: main decides which
 * panel runs in a VM. Read by the chat header's `sandboxed` label. Started
 * lazily on the first reader, so a window that never shows a chat never
 * subscribes, and a bridge without `vm` (an older preload, a harness)
 * leaves the list empty rather than throwing.
 */
let lanes: readonly VmLaneInfo[] = []
const listeners = new Set<() => void>()
let started = false

function start(): void {
  if (started) return
  started = true
  const door = (window as { canvas?: { vm?: { lanes(): Promise<{ lanes: VmLaneInfo[] }>; onChanged(l: (lanes: VmLaneInfo[]) => void): () => void } } }).canvas?.vm
  if (door === undefined) return
  const set = (next: VmLaneInfo[]): void => { lanes = next; for (const l of listeners) l() }
  door.onChanged(set)
  void door.lanes().then((v) => set(v.lanes), () => { /* no lanes is the answer */ })
}

function subscribe(listener: () => void): () => void {
  start()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The lane a chat panel runs in, or undefined. */
export function useVmLane(panelId: string): VmLaneInfo | undefined {
  const all = useSyncExternalStore(subscribe, () => lanes)
  return all.find((l) => l.panelId === panelId)
}
