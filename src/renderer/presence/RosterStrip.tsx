import { useEffect, useState, type CSSProperties, type JSX } from 'react'
import type { AgentPresenceStatus, PresenceRoster, RemotePeer } from '@shared/presence'
import { latestRoster, onRoster } from './presence-store'
import { TONE_WORKING } from '../panels/panel-state'

/** The agent status as the canvas's own tone vocabulary (styles.css [data-tone]).
 *  TONE_WORKING, not the literal: panel-state.ts owns the state words (verify:rail state.2). */
export const TONE: Record<AgentPresenceStatus, string | undefined> = {
  none: undefined, idle: 'idle', working: TONE_WORKING, 'needs-you': 'needs-you', error: 'exited'
}

/**
 * Only the facts a cell SHOWS. The roster arrives at cursor rate, and a cell
 * does not change when a cursor moves, so the strip re-renders only when this
 * key does.
 */
const keyOf = (peers: readonly RemotePeer[]): string =>
  peers.map((p) => [p.clientId, p.presence.initials, p.presence.color, p.presence.displayName, p.status, p.live, p.presence.agentStatus, p.presence.statusLine].join('\u0001')).join('\u0002')

/**
 * Who else is on this workspace: initials in cells of each person's colour.
 * Rest layer only — a name, one state — and the status line on hover. Renders
 * nothing when nobody else is here or presence is off: an empty strip would
 * be a zero-value statement (the density rule).
 */
export function RosterStrip({ workspaceId }: { workspaceId: string | undefined }): JSX.Element | null {
  const [peers, setPeers] = useState<readonly RemotePeer[]>(() => latestRoster(workspaceId)?.peers ?? [])
  useEffect(() => {
    let key = ''
    const take = (roster: PresenceRoster | undefined): void => {
      const next = roster?.peers ?? []
      const k = keyOf(next)
      if (k === key) return
      key = k
      setPeers(next)
    }
    take(latestRoster(workspaceId))
    return onRoster((roster) => { if (roster.workspaceId === workspaceId) take(roster) })
  }, [workspaceId])

  if (peers.length === 0) return null
  return (
    <ul className="roster-strip" aria-label="People on this workspace" data-roster-strip>
      {peers.map((p) => {
        const state = !p.live ? 'away' : p.status
        const detail = [p.presence.displayName, state === 'active' ? null : state, p.presence.statusLine || null].filter((s) => s !== null).join(' — ')
        return (
          <li key={p.clientId} className="roster-strip__cell" data-roster-cell={p.presence.userId} data-state={state}
            style={{ '--peer': p.presence.color } as CSSProperties} title={detail} aria-label={detail}>
            {p.presence.initials}
            {TONE[p.presence.agentStatus] !== undefined && <span className="roster-strip__agent" data-tone={TONE[p.presence.agentStatus]} aria-hidden="true" />}
          </li>
        )
      })}
    </ul>
  )
}
