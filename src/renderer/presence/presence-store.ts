/**
 * The renderer's cache of presence rosters, one per workspace, fed by main's
 * `presence:remote` push (main/presence/presence-hub.ts owns the truth).
 *
 * A module-level store with listeners, NOT React state, and that is the
 * point: a peer moving their cursor arrives up to 15 times a second per peer,
 * and routing that through Canvas state would re-render every panel. The
 * cursor layer reads `latest()` inside its own paint; the roster strip keeps
 * React state only for the facts it shows and bails out otherwise.
 */
import type { PresenceRoster } from '@shared/presence'

const rosters = new Map<string, PresenceRoster>()
const listeners = new Set<(roster: PresenceRoster) => void>()
let started = false

function put(roster: PresenceRoster): void {
  rosters.set(roster.workspaceId, roster)
  for (const l of listeners) l(roster)
}

function start(): void {
  if (started) return
  started = true
  window.canvas.presence.onRemote(put)
  void window.canvas.presence.rosters().then((all) => { for (const r of all) if (!rosters.has(r.workspaceId)) put(r) }, () => {})
}

export function latestRoster(workspaceId: string | undefined): PresenceRoster | undefined {
  return workspaceId === undefined ? undefined : rosters.get(workspaceId)
}

/** Subscribe to every roster change; starts the IPC subscription on first use. */
export function onRoster(listener: (roster: PresenceRoster) => void): () => void {
  start()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Every workspace's roster as last pushed — the Team view merges across all of them. */
export function allRosters(): PresenceRoster[] {
  start()
  return [...rosters.values()]
}
