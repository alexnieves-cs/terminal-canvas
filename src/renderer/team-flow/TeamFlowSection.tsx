import type { JSX } from 'react'
import { handoffWords, reviewWords, type FlowRequest } from '@shared/team-flow'
import { shellControl } from '@renderer/shell/shell-control'
import { waitedWords } from '@renderer/shell/decision-inbox'
import { useTeamFlow, writeTeamFlow } from './useTeamFlow'

/**
 * M583. The multiplayer canvas in Needs you: what a teammate handed this
 * person, the team's review queue, and what this person is waiting on the
 * team for. It sits under "Your team is asking" (M378) and keeps that
 * section's shape — a jump to the agent's panel, the words a person needs to
 * decide, and the verbs — because these are the same kind of fact: a person
 * on the shared canvas waiting for this one.
 *
 * Every row names people by presence's names only; an id is never shown and
 * a name is never guessed ("A teammate").
 */
export function TeamFlowSection({ onGoToPanel, onRefused }: { onGoToPanel: (panelId: string) => void; onRefused?: (reason: string) => void }): JSX.Element | null {
  const flow = useTeamFlow()
  const now = Date.now()
  const send = (req: FlowRequest): void => { void writeTeamFlow(req).then((reason) => { if (reason !== null) onRefused?.(reason) }) }
  if (flow.handoffs.length === 0 && flow.reviews.length === 0 && flow.mine.length === 0) return null
  return (
    <>
      {flow.handoffs.length > 0 && (
        <>
          <div className="shell__region-title" data-team-handoffs-title="">Handed to you · {flow.handoffs.length}</div>
          <ul className="rail-list rail-list--attention" aria-label="Handed to you">
            {flow.handoffs.map((row) => {
              const w = handoffWords(row)
              return (
                <li key={`${row.workspaceId}/${row.handoffId}`} className="rail-row rail-attention team-flow" data-team-handoff={row.handoffId}>
                  <button type="button" className="rail-row__main" title={`Go to ${w.who}`} {...shellControl(() => onGoToPanel(row.panelId))}>
                    <span className="rail-row__dot status-dot" data-agent-state="wants-you" data-tone="needs-you" aria-hidden="true" />
                    <span className="rail-row__label">{w.who}</span>
                    <span className="rail-row__go">jump</span>
                  </button>
                  <div className="inbox__why">
                    {row.note !== '' && <p className="team-flow__note" data-team-handoff-note="">{row.note}</p>}
                    <p className="inbox__meta">
                      <span>{w.ask}</span>
                      {w.scrubbed !== undefined && <span data-team-flow-scrubbed="">{w.scrubbed}</span>}
                      <span>waiting {waitedWords(row.at, now)}</span>
                    </p>
                  </div>
                  <div className="inbox__group-verbs team-flow__verbs">
                    <button type="button" className="approval__verb" data-team-handoff-verb="take"
                      title="Take it: you hold this agent now — its questions and its review are yours. It keeps running where it runs."
                      {...shellControl(() => send({ kind: 'take', workspaceId: row.workspaceId, handoffId: row.handoffId }))}>Take it</button>
                    <button type="button" className="approval__verb approval__verb--deny" data-team-handoff-verb="decline"
                      title={row.named ? 'Decline — it stays with the person who offered it' : 'Not for you — it stays offered to everyone else'}
                      {...shellControl(() => send({ kind: 'decline', workspaceId: row.workspaceId, handoffId: row.handoffId }))}>Decline</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {flow.reviews.length > 0 && (
        <>
          <div className="shell__region-title" data-team-reviews-title="">Review queue · {flow.reviews.length}</div>
          <ul className="rail-list rail-list--attention" aria-label="Review queue">
            {flow.reviews.map((row) => {
              const w = reviewWords(row)
              return (
                <li key={`${row.workspaceId}/${row.reviewId}`} className="rail-row rail-attention team-flow" data-team-review={row.reviewId}>
                  <button type="button" className="rail-row__main" title={`Go to ${w.who}`} {...shellControl(() => onGoToPanel(row.panelId))}>
                    <span className="rail-row__dot status-dot" data-agent-state="wants-you" data-tone="needs-you" aria-hidden="true" />
                    <span className="rail-row__label">{w.who}</span>
                    <span className="rail-row__go">jump</span>
                  </button>
                  <div className="inbox__why">
                    <p className="team-flow__title" data-team-review-title="">{row.title}</p>
                    {row.summary !== '' && <p className="team-flow__note">{row.summary}</p>}
                    <p className="inbox__meta">
                      <span data-team-review-looking="">{w.looking}</span>
                      {w.scrubbed !== undefined && <span data-team-flow-scrubbed="">{w.scrubbed}</span>}
                      <span>waiting {waitedWords(row.at, now)}</span>
                    </p>
                  </div>
                  <div className="inbox__group-verbs team-flow__verbs">
                    {!row.mine && (
                      <button type="button" className="approval__verb" data-team-review-verb="look"
                        title="Say you're looking, so the team does not review it twice"
                        {...shellControl(() => send({ kind: 'look', workspaceId: row.workspaceId, reviewId: row.reviewId }))}>I'm looking</button>
                    )}
                    <button type="button" className="approval__verb" data-team-review-verb="approve"
                      title="Approve — one approval passes it, unless someone asks for changes"
                      {...shellControl(() => send({ kind: 'approve', workspaceId: row.workspaceId, reviewId: row.reviewId }))}>Approve</button>
                    <button type="button" className="approval__verb approval__verb--deny" data-team-review-verb="request-changes"
                      title="Ask for changes — one request decides it, whoever else approved"
                      {...shellControl(() => send({ kind: 'request-changes', workspaceId: row.workspaceId, reviewId: row.reviewId }))}>Ask for changes</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {flow.mine.length > 0 && (
        <>
          <div className="shell__region-title" data-team-mine-title="">Waiting on your team · {flow.mine.length}</div>
          <ul className="rail-list rail-list--attention" aria-label="Waiting on your team">
            {flow.mine.map((row) => (
              <li key={`${row.workspaceId}/${row.id}`} className="rail-row rail-attention team-flow" data-team-mine={row.id} data-team-mine-kind={row.kind}>
                <button type="button" className="rail-row__main" title={`Go to ${row.panelTitle}`} {...shellControl(() => onGoToPanel(row.panelId))}>
                  <span className="rail-row__label">{row.kind === 'handoff' ? 'Handoff' : 'Review'} · {row.panelTitle}</span>
                  <span className="rail-row__go">jump</span>
                </button>
                <p className="inbox__meta"><span data-team-mine-standing="">{row.standing}</span></p>
                <div className="inbox__group-verbs team-flow__verbs">
                  <button type="button" className="approval__verb approval__verb--deny" data-team-mine-verb="withdraw"
                    title={row.kind === 'handoff' ? 'Call the offer back — you keep the agent' : 'Take it out of the queue'}
                    {...shellControl(() => send(row.kind === 'handoff'
                      ? { kind: 'withdraw', workspaceId: row.workspaceId, handoffId: row.id }
                      : { kind: 'withdraw-review', workspaceId: row.workspaceId, reviewId: row.id }))}>Withdraw</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
