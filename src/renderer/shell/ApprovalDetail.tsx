import { memo, useState, type JSX } from 'react'
import type { PendingApproval } from './rail-sections'
import { shellControl } from './shell-control'
import { approvalHeadline } from '@renderer/chat/chat-model'
import { approvalOutcomeWords, noteApprovalOutcome, useApprovalOutcomes, type ApprovalOutcome } from './approval-outcome'

export interface ApprovalDetailProps {
  approval: PendingApproval
  /** The requesting agent, by the name the rail gives it. */
  agent: string
  /** The task the agent's panel belongs to, when it belongs to one. */
  task?: string
  /** `scope` is set only for the session grant; absent means this one request. */
  onAnswer: (allow: boolean, scope?: 'session') => void
  /** The answer is sent and not yet confirmed; the verbs are inert. */
  sent?: boolean
}

/**
 * #17. ONE layout for a permission request, wherever it is resolved — the
 * Needs-you queue and Orchestrate's card render this and nothing else, so a
 * request reads the same in both places: its CONTEXT (who asks, for which
 * task, in which directory), then the ACTION in full in a code block, then
 * the SCOPED verbs.
 *
 * The action is never the row-sized `argument`: that cut is right for a list
 * and wrong for a decision, because what it drops (a command's tail, a path's
 * checkout) is what a reviewer is deciding on. Every other key of the input
 * is one press away under "Full input", never hidden.
 *
 * The verbs name their scope, and only scopes main actually implements are
 * offered: `Allow once` answers this request and the next one asks again;
 * `Allow <tool> for this session` is M98's grant — main holds it in memory
 * for this conversation only (a relaunch asks again, and the inspector's
 * Detail revokes it) and its manager consults it for every backend. There
 * is no "always" here because nothing persists a grant.
 */
function ApprovalDetailImpl({ approval, agent, task, onAnswer, sent = false }: ApprovalDetailProps): JSX.Element {
  const [restOpen, setRestOpen] = useState(false)
  const action = approval.action ?? approval.argument
  // #14. The press leaves its outcome behind before the request drops, so the
  // queue can say what was decided before it shows the next one.
  const decide = (allow: boolean, scope?: 'session'): void => {
    noteApprovalOutcome({ requestId: approval.requestId, panelId: approval.id, agent, toolName: approval.toolName, kind: !allow ? 'deny' : scope === 'session' ? 'session' : 'once' })
    onAnswer(allow, scope)
  }
  const where = approval.cwd === undefined ? '' : approval.cwd.replace(/\/+$/, '').split('/').filter((p) => p !== '').slice(-1)[0] ?? '/'
  return (
    <div className="approval" data-approval={approval.requestId}>
      {/* #14. ONE sentence first — who, what will happen, where — so the facts
          and the code block below are confirmation, not a puzzle to decode. */}
      <p className="approval__headline" data-approval-headline>
        <strong>{agent}</strong> asks to {approvalHeadline(approval.toolName)}{where === '' ? '' : <> in <span className="approval__mono">{where}</span></>}
      </p>
      <dl className="approval__context">
        <div className="approval__fact"><dt>Agent</dt><dd data-approval-agent>{agent}</dd></div>
        {task !== undefined && task !== '' && <div className="approval__fact"><dt>Task</dt><dd data-approval-task>{task}</dd></div>}
        {approval.cwd !== undefined && <div className="approval__fact"><dt>In</dt><dd className="approval__mono" data-approval-cwd title={approval.cwd}>{approval.cwd}</dd></div>}
        <div className="approval__fact"><dt>Wants</dt><dd data-approval-tool>{approval.toolName}</dd></div>
      </dl>
      {approval.description !== undefined && <p className="approval__why" data-approval-why>{approval.description}</p>}
      {action !== '' && (
        <pre className={`approval__action${approval.actionIsCode === false ? ' approval__action--prose' : ''}`} data-approval-action><code>{action}</code></pre>
      )}
      {approval.rest !== undefined && (
        <>
          <button type="button" className="approval__rest-toggle" aria-expanded={restOpen} data-approval-rest-toggle {...shellControl(() => setRestOpen((o) => !o))}>
            {restOpen ? 'Hide full input' : 'Full input'}
          </button>
          {restOpen && <pre className="approval__action approval__rest" data-approval-rest><code>{approval.rest}</code></pre>}
        </>
      )}
      {sent ? (
        <p className="approval__sent" role="status">Answer sent — waiting for the agent</p>
      ) : (
        <div className="approval__verbs" role="group" aria-label={`Answer ${agent}'s ${approval.toolName} request`}>
          <button type="button" className="approval__verb approval__verb--primary" data-approval-verb="once"
            title={`Allow this one ${approval.toolName} call — the next one asks again`}
            {...shellControl(() => decide(true))}>Allow once</button>
          <button type="button" className="approval__verb" data-approval-verb="session"
            title={`Allow every ${approval.toolName} call in this conversation until it closes — held in memory, so a relaunch asks again; revoke it in the inspector's Detail`}
            {...shellControl(() => decide(true, 'session'))}>Allow {approval.toolName} for this session</button>
          <button type="button" className="approval__verb approval__verb--deny" data-approval-verb="deny"
            title={`Deny this ${approval.toolName} call — the agent is told it was denied`}
            {...shellControl(() => decide(false))}>Deny</button>
        </div>
      )}
      {/* #14. The scope of each verb in words, not only on hover: what a
          person is agreeing to is the decision. */}
      {!sent && (
        <p className="approval__scope" data-approval-scope>
          Once answers only this call. For this session allows every {approval.toolName} call in this conversation until it closes — a relaunch asks again.
        </p>
      )}
    </div>
  )
}

export const ApprovalDetail = memo(ApprovalDetailImpl)

/**
 * #14. What was just decided, where the decision was. Rendered at the head of
 * the Needs-you queue and Orchestrate's card while an outcome is live
 * (APPROVAL_ACK_MS); both hold off opening the next request until it passes.
 * `only` narrows it to the requests a surface lists.
 */
export function ApprovalAcks({ only }: { only?: (o: ApprovalOutcome) => boolean }): JSX.Element | null {
  const outcomes = useApprovalOutcomes().filter((o) => only === undefined || only(o))
  if (outcomes.length === 0) return null
  return (
    <ul className="approval-ack" role="status" aria-live="polite" data-approval-acks>
      {outcomes.map((o) => (
        <li key={o.requestId} className="approval-ack__row" data-approval-ack={o.kind}>
          <span className="approval-ack__mark" aria-hidden="true">{o.kind === 'deny' ? '✕' : '✓'}</span>{approvalOutcomeWords(o)}
        </li>
      ))}
    </ul>
  )
}
