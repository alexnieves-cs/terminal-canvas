/**
 * Observer mode's one stream: the member being observed, as main pushes it on
 * `team:observed` (their awareness at cursor rate, their canvas snapshot when
 * it changes). A module store like presence-store, not Canvas state, for the
 * same reason — a cursor at 15Hz must re-render the observer pane only.
 */
import { useSyncExternalStore } from 'react'
import type { TeamObserved, TeamObserveRequest } from '@shared/team'

export interface ObservedView extends TeamObserved {
  /** When the snapshot last CHANGED, on our clock — the publisher's `at` is theirs and is never compared. */
  snapshotSeenAt: number | null
}

let current: ObservedView | null = null
let wanted: TeamObserveRequest | null = null
const listeners = new Set<() => void>()
let started = false

function start(): void {
  if (started) return
  started = true
  window.canvas.team.onObserved((o) => {
    // A push for someone we already stopped observing is dropped: the detach
    // and a last in-flight update can cross on the bridge.
    if (wanted === null || o.userId !== wanted.userId || o.workspaceId !== wanted.workspaceId) return
    const changed = JSON.stringify(o.snapshot) !== JSON.stringify(current?.snapshot ?? null)
    current = { ...o, snapshotSeenAt: o.snapshot === null ? null : changed ? Date.now() : (current?.snapshotSeenAt ?? Date.now()) }
    for (const l of listeners) l()
  })
}

export function observe(req: TeamObserveRequest | null): void {
  start()
  wanted = req
  current = null
  for (const l of listeners) l()
  void window.canvas.team.observe(req).catch(() => {})
}

const subscribe = (l: () => void): (() => void) => { start(); listeners.add(l); return () => { listeners.delete(l) } }

export function useObserved(): ObservedView | null {
  return useSyncExternalStore(subscribe, () => current)
}
