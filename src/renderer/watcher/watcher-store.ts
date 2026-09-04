import { useSyncExternalStore } from 'react'
import type { WatchStateInput } from '@renderer/panels/panel-state'

/**
 * M84. The renderer's mirror of each watcher's runs — a module-level store
 * subscribed PER PANEL ID, `chat-store.ts`'s shape and for its reason: a
 * watcher's tail arrives at the flush rate, and a state that rode
 * `registry.version()` would re-render every panel on the canvas each time a
 * test printed a line.
 *
 * Snapshot objects are CACHED, so `getWatch` returns the same object until
 * something changes and `useSyncExternalStore` can do its job. Cleared at
 * every panel-removing site through `clearWatch`, or the map grows for the
 * life of the renderer and a recycled id inherits a dead watcher's last run —
 * the failure every sibling store names.
 */

export interface WatchSnapshot {
  status: 'not-started' | 'running' | 'passed' | 'exited'
  exitCode?: number | null
  signal?: string | null
  tail: string
  startedAt?: number
  endedAt?: number
  pending: boolean
  /** Main could not arm this watcher's trigger; the reason is the body's. */
  disarmed?: string
}

const states = new Map<string, WatchSnapshot>()
const listeners = new Map<string, Set<() => void>>()

const EMPTY: WatchSnapshot = Object.freeze({ status: 'not-started', tail: '', pending: false }) as WatchSnapshot

function notify(id: string): void {
  for (const cb of listeners.get(id) ?? []) cb()
}

export function setWatch(id: string, next: WatchSnapshot): void {
  // A disarmed reason SURVIVES a state event: main's runs and main's arming
  // are two facts, and a `run now` on a watcher whose trigger could not be
  // armed must not quietly erase the sentence explaining why it never fires
  // on its own.
  const held = states.get(id)?.disarmed
  states.set(id, held === undefined ? next : { ...next, disarmed: held })
  notify(id)
}

export function setDisarmed(id: string, reason: string): void {
  const current = states.get(id) ?? EMPTY
  states.set(id, { ...current, disarmed: reason })
  notify(id)
}

export function clearDisarmed(id: string): void {
  const current = states.get(id)
  if (current === undefined || current.disarmed === undefined) return
  const { disarmed: _dropped, ...rest } = current
  states.set(id, rest)
  notify(id)
}

export function getWatch(id: string): WatchSnapshot {
  return states.get(id) ?? EMPTY
}

export function clearWatch(id: string): void {
  states.delete(id)
  notify(id)
}

export function useWatch(id: string): WatchSnapshot {
  return useSyncExternalStore(
    (cb) => {
      let set = listeners.get(id)
      if (set === undefined) { set = new Set(); listeners.set(id, set) }
      set.add(cb)
      return () => {
        set?.delete(cb)
        if (set?.size === 0) listeners.delete(id)
      }
    },
    () => getWatch(id)
  )
}

/**
 * What the ONE state vocabulary needs from a watcher (`panel-state.ts`).
 * Built here rather than in each surface, so the rail, the frame and the
 * inspector cannot each decide for themselves what a signal means.
 */
export function watchStateInput(id: string): WatchStateInput {
  const s = getWatch(id)
  return {
    status: s.status,
    ...(s.exitCode === undefined ? {} : { exitCode: s.exitCode }),
    ...(s.signal === undefined ? {} : { signal: s.signal }),
        ...(s.disarmed === undefined ? {} : { disarmed: true })
  }
}
