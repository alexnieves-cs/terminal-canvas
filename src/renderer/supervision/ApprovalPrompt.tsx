import { memo, type JSX, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { shellControl } from '@renderer/shell/shell-control'
import { HIGH_RISK_NOTE, offersSessionGrant, riskWords, type ApprovalRisk } from '@shared/approval-risk'

/**
 * M670. THE INLINE APPROVAL — the human-in-the-loop gate in a conversation.
 *
 * Adapted from Creance's `ApprovalPrompt` (MIT, © 2026 Amit Shrivastava,
 * commit c8bfae4; `NOTICE.md` beside this file). Kept from it: a labelled
 * GROUP, never a modal (the person can still read the run before deciding);
 * the risk on the prompt itself; HIGH risk hides the broad grant — Creance's
 * "Always allow", this app's "Allow for session", the broadest scope main
 * implements (M98: in memory, for this conversation) — and says why; and
 * single-key answers while focus is inside the prompt (A, Shift+A, D),
 * advertised with `aria-keyshortcuts`.
 *
 * Changed for this app: no `autoFocus` (a canvas holds many conversations,
 * and stealing focus from a composer or a terminal is the M49 bug), the
 * buttons are `shellControl`s (focus never leaves where the person typed),
 * the outcome is not rendered here (an answered request leaves `pending`,
 * and the queue's acknowledgement, #14, says what was decided), and every
 * `data-chat-*` hook the suites read stays on the element it was on. The
 * sentence is the caller's, so the chat's M169 wording is unchanged.
 */

export interface ApprovalPromptProps {
  requestId: string
  toolName: string
  risk: ApprovalRisk
  /** The question, as a sentence. */
  sentence: ReactNode
  /** The accessible name of the group. */
  label: string
  onAllow(scope: 'once' | 'session'): void
  onDeny(): void
  /** A, Shift+A and D while focus is inside the prompt. Default true. */
  shortcuts?: boolean
}

function ApprovalPromptImpl({ requestId, toolName, risk, sentence, label, onAllow, onDeny, shortcuts = true }: ApprovalPromptProps): JSX.Element {
  const session = offersSessionGrant(risk)
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!shortcuts || e.metaKey || e.ctrlKey || e.altKey) return
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]') !== null) return
    const key = e.key.toLowerCase()
    if (key === 'a' && e.shiftKey && session) onAllow('session')
    else if (key === 'a' && !e.shiftKey) onAllow('once')
    else if (key === 'd' && !e.shiftKey) onDeny()
    else return
    // Handled here: the canvas's own bare-key shortcuts must not also fire.
    e.preventDefault()
    e.stopPropagation()
  }
  return (
    <div className="chat__permission sv-approval" data-chat-permission={requestId} data-risk={risk}
      role="group" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown}>
      <span className="chat__role">asks</span>
      <p className="chat__permission-sentence">{sentence}</p>
      <span className="sv-risk" data-sv-risk={risk}>{riskWords(risk)}</span>
      {!session && <p className="sv-approval__note" data-sv-risk-note>{HIGH_RISK_NOTE}</p>}
      <div className="chat__permission-verbs">
        <button type="button" className="chat__verb chat__verb--allow" data-chat-allow
          aria-keyshortcuts={shortcuts ? 'A' : undefined}
          title="Allow this one tool call — the next one asks again" {...shellControl(() => onAllow('once'))}>Allow once</button>
        {/* M98. The third verb, between the two: allow, and stop asking for this tool until the panel closes. M670: never for high risk. */}
        {session && (
          <button type="button" className="chat__verb chat__verb--allow" data-chat-allow-session
            aria-keyshortcuts={shortcuts ? 'Shift+A' : undefined}
            title={`Allow ${toolName} for the rest of this session — it will not ask again`} {...shellControl(() => onAllow('session'))}>Allow for session</button>
        )}
        <button type="button" className="chat__verb chat__verb--deny" data-chat-deny
          aria-keyshortcuts={shortcuts ? 'D' : undefined}
          title="Deny this tool call" {...shellControl(onDeny)}>Deny</button>
      </div>
    </div>
  )
}

export const ApprovalPrompt = memo(ApprovalPromptImpl)
