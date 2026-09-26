import { useEffect, useState, type JSX } from 'react'
import { syncLine, type PresenceRoster } from '@shared/presence'
import { latestRoster, onRoster } from './presence-store'

/**
 * M348. What a SHARED workspace's sync is doing, when it is doing something a
 * person should know: offline with changes waiting, reconnecting, catching up.
 * Nothing at rest — a connected, caught-up room states no zero-value fact
 * (CLAUDE.md, the rest layer). The words are `syncLine`'s (shared/presence.ts).
 *
 * Nothing here is at risk, and the chip does not pretend otherwise: main keeps
 * the doc in layout.json as it changes, and the provider sends what the server
 * lacks when it reconnects (verify:canvas-sync offline.1). It says the changes
 * are WAITING, because silence while offline reads as "saved for everyone".
 *
 * Re-renders only when the line changes, never on the roster's 15 Hz cursor
 * reports.
 */
export function SyncChip({ workspaceId, shared }: { workspaceId: string | undefined; shared: boolean }): JSX.Element | null {
  const read = (r: PresenceRoster | undefined): { line: string | null; connection: string } =>
    ({ line: syncLine(r, shared), connection: r?.connection ?? 'off' })
  const [state, setState] = useState(() => read(latestRoster(workspaceId)))
  useEffect(() => {
    let last = ''
    const take = (r: PresenceRoster | undefined): void => {
      const next = read(r)
      const key = `${next.connection}\u0000${next.line ?? ''}`
      if (key === last) return
      last = key
      setState(next)
    }
    take(latestRoster(workspaceId))
    return onRoster((r) => { if (r.workspaceId === workspaceId) take(r) })
    // `read` closes over `shared`, a dep here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, shared])
  if (state.line === null) return null
  return (
    <p className="sync-chip" role="status" data-sync-chip={state.connection}>
      {state.line}
    </p>
  )
}
