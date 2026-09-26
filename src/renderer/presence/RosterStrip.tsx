import { Fragment, useEffect, useState, type CSSProperties, type JSX } from 'react'
import type { AgentPresenceStatus, PresenceAgent, PresenceRoster, RemotePeer } from '@shared/presence'
import { latestRoster, onRoster } from './presence-store'
import { TONE_WORKING, agentWord } from '../panels/panel-state'
import type { AgentState } from '@shared/types'

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
  peers.map((p) => [p.clientId, p.presence.initials, p.presence.color, p.presence.displayName, p.status, p.live, p.presence.agentStatus, p.presence.statusLine,
    p.presence.agents.map((a) => `${a.id}:${a.status}:${a.name}`).join(',')].join('\u0001')).join('\u0002')

/**
 * M349. An agent's presence status as the canvas's own agent state, so its word
 * comes from panel-state.ts (`agentWord`) like every other state word (verify:rail
 * state.2). "needs you" is said from its owner's side, as the owner's tile already
 * says it in their status line.
 */
const AGENT_STATE: Record<PresenceAgent['status'], AgentState> = { idle: 'idle', working: 'busy', 'needs-you': 'wants-you', error: 'exited' }

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
          <Fragment key={p.clientId}>
            <li className="roster-strip__cell" data-roster-cell={p.presence.userId} data-state={state}
              style={{ '--peer': p.presence.color } as CSSProperties} title={detail} aria-label={detail}>
              {p.presence.initials}
              {/* M348. Not for an away peer: their agents' state is not known from here (offline, or gone quiet). */}
              {state !== 'away' && TONE[p.presence.agentStatus] !== undefined && <span className="roster-strip__agent" data-tone={TONE[p.presence.agentStatus]} aria-hidden="true" />}
            </li>
            {/* M349. Each of this person's agents as a roster citizen beside them: a WHO — its name, whose it
                is, what it is doing — ringed in its owner's colour and never filled, so it is never read as a
                person. Not for an away peer, whose agents' state this seat cannot know. */}
            {state !== 'away' && p.presence.agents.map((a) => {
              const who = `${a.name} — ${p.presence.displayName}'s agent, ${agentWord(AGENT_STATE[a.status]).word}`
              return (
                <li key={`${p.clientId}:${a.id}`} className="roster-strip__agent-cell" data-roster-agent={a.id} data-owner={p.presence.userId}
                  data-tone={TONE[a.status]} style={{ '--peer': p.presence.color } as CSSProperties} title={who} aria-label={who}>
                  {(a.name.trim()[0] ?? 'a').toUpperCase()}
                </li>
              )
            })}
          </Fragment>
        )
      })}
    </ul>
  )
}
