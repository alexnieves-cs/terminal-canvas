import { useSyncExternalStore } from 'react'
import type { CloudLaneView } from '@shared/ipc-contract'

/**
 * M543. The renderer's copy of main's cloud lanes — main owns them (it holds
 * the broker and the poller); this is a read-through cache filled once from
 * `cloud:list` and kept by `cloud:changed`. Module-level rather than in React
 * state because a card, the palette and the board actions all read it, and
 * none of them owns the others' lifetime.
 *
 * The bridge is optional: the IPC surface harness and any window without it
 * see no lanes, never a throw.
 */
let lanes: readonly CloudLaneView[] = []
let started = false
const listeners = new Set<() => void>()

function emit(next: readonly CloudLaneView[]): void {
  lanes = next
  for (const l of listeners) l()
}

function start(): void {
  if (started) return
  const door = typeof window === 'undefined' ? undefined : window.canvas?.cloud
  if (door === undefined) return
  started = true
  door.onChanged((lane) => emit([...lanes.filter((l) => l.id !== lane.id), lane]))
  void door.list().then((all) => {
    // A change that arrived before the list answered is newer than the list's copy.
    const seen = new Set(lanes.map((l) => l.id))
    emit([...lanes, ...all.filter((l) => !seen.has(l.id))])
  }, () => {})
}

/** A lane's record arriving outside the event (a dispatch's own answer). */
export function rememberCloudLane(lane: CloudLaneView): void {
  emit([...lanes.filter((l) => l.id !== lane.id), lane])
}

export function forgetCloudLaneLocally(id: string): void {
  emit(lanes.filter((l) => l.id !== id))
}

export function cloudLanesNow(): readonly CloudLaneView[] {
  start()
  return lanes
}

function subscribe(fn: () => void): () => void {
  start()
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The newest lane for a board task, or undefined. */
export function laneForItem(all: readonly CloudLaneView[], itemId: string): CloudLaneView | undefined {
  let best: CloudLaneView | undefined
  for (const l of all) if (l.workItemId === itemId && (best === undefined || l.dispatchedAt > best.dispatchedAt)) best = l
  return best
}

export function useCloudLane(itemId: string | undefined): CloudLaneView | undefined {
  const all = useSyncExternalStore(subscribe, cloudLanesNow, cloudLanesNow)
  return itemId === undefined ? undefined : laneForItem(all, itemId)
}
