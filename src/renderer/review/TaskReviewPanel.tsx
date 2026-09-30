import { useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import { proposalDecisionTitle } from '@shared/decision-audit'
import { adoptedRunId, recordOrchEvent } from '@renderer/orchestration/orch-record'
import { outward } from '@shared/outward'
import { checkWords, type CheckRecord } from '@shared/check-evidence'
import { checkOutputDisplay } from '@shared/check-output'
import {
  commentPlace, composeFollowUp, openComments, unmetCriteria, verificationOf,
  type FollowUpCheck, type ReviewComment, proposedComments, answerProposal } from '@shared/review-comments'
import type { ReviewStanding } from '@shared/review-readiness'
import { CheckRunOutput } from '@renderer/checks/CheckRunOutput'
import type { PrEvidence } from '@shared/task-flow'

/**
 * M307. THE REVIEW, TOGETHER — what the task was meant to do, whether it is
 * VERIFIED or only finished, the acceptance criteria as a checklist the
 * person ticks, the checks this canvas witnessed (a failing one opens its
 * own output), the open comments, and the follow-up those compose into.
 *
 * The verdict line is `verificationOf`'s and nothing else's: it separates an
 * agent STOPPING ("agent finished — not verified") from the conjunction a
 * person can defend, and lists what is missing rather than a percentage. The
 * word "done" never appears here — that is the board's column and the
 * person's to set.
 *
 * The follow-up is SHOWN WHOLE before anything is sent: the person reads the
 * exact text the agent will receive. "Send to agent" is a hand-off (like
 * dispatch); "Edit in conversation" inserts it into the composer and sends
 * nothing (M80's insert rule).
 */
export interface TaskReviewPanelProps {
  itemId: string
  title: string
  brief?: string
  criteria?: readonly string[]
  criteriaMet?: readonly string[]
  comments?: readonly ReviewComment[]
  standing: ReviewStanding
  agentWorking: boolean
  /** Null while the lane's rows are unread. */
  checks: readonly CheckRecord[] | null
  readOnly: boolean
  chatOpen: boolean
  press: (run: () => void) => (e: ReactMouseEvent) => void
  onToggleCriterion?: (itemId: string, criterion: string, met: boolean) => void
  onComments?: (itemId: string, next: ReviewComment[]) => void
  /** Resolves null when sent, or the reason it was not. */
  onSendFollowUp?: (itemId: string, text: string) => Promise<string | null>
  onDraftFollowUp?: (itemId: string, text: string) => void
  /** M310. See ReviewTaskContext. */
  suggestCheck?: () => Promise<string | null>
  onRunChecks?: (itemId: string, command: string) => Promise<string | null>
  onOpenPr?: (itemId: string, evidence: PrEvidence) => void
  pr?: { number: number; url: string }
  note?: string
  reviewedFiles?: number | undefined
  /** M314. What the task promised to hand back (its recipe's copy). */
  deliverables?: readonly string[]
  /** M314. Save this task as a recipe; resolves null when saved, or the reason it was not. */
  onSaveRecipe?: (itemId: string, name: string, passedChecks: string[]) => Promise<string | null>
  /** M315. The verdict is rendered at the TOP of the review by `TaskVerdict`; this panel then starts at the evidence. */
  hideVerdict?: boolean
  /** M401 (B9). Bumped by the verdict's Run checks: each change opens the Run checks form and brings it into view. */
  runChecksAsk?: number
}

/**
 * M315. The verdict alone — "agent finished — not verified" and what is
 * missing — so the review can open on it, ABOVE the diff, while the checks,
 * comments and follow-up sit below the changes they are about. The same
 * `verificationOf` call the panel makes, over the same props, so the two can
 * never disagree.
 */

/** M371. A person's answer to an agent's proposal is a decision: recorded beside the work, never in front of it. */
function recordProposalAnswer(itemId: string, c: ReviewComment, keep: boolean): void {
  void recordOrchEvent({
    runId: adoptedRunId(itemId), itemId, event: 'artifact', source: 'person',
    title: proposalDecisionTitle(keep, c.proposedBy?.label ?? 'an agent', commentPlace(c))
  })
}

/**
 * M401 (B9). What "verified" asks for, in one line under a verdict that is not
 * it yet. The critique's reader saw "not verified" after the agent had run the
 * tests and took the banner for a stale one: the agent's own runs are its
 * ACCOUNT (readiness.4 keeps the two sources apart), and only a check this
 * canvas watched exit counts. Saying so, with the verb that produces one, is
 * the fix; loosening the rule would be the false claim it exists to refuse.
 */
export const VERIFIED_MEANS = 'Verified means you reviewed this revision, a check this canvas ran passed on it, and nothing is left open. Tests the agent ran itself are its account, not a check this canvas saw.'

export function TaskVerdict(p: Pick<TaskReviewPanelProps, 'agentWorking' | 'standing' | 'checks' | 'comments' | 'criteria' | 'criteriaMet'> & {
  /** M401 (B9). Opens the Run checks form below; absent where the canvas cannot run one. */
  onRunChecks?: () => void
}): JSX.Element {
  const verification = verificationOf({
    agentWorking: p.agentWorking,
    standing: p.standing,
    checks: p.checks ?? [],
    ...(p.comments === undefined ? {} : { comments: p.comments }),
    ...(p.criteria === undefined ? {} : { criteria: p.criteria }),
    ...(p.criteriaMet === undefined ? {} : { criteriaMet: p.criteriaMet })
  })
  return (
    <div className="task-review__verdict" data-task-verification={verification.stage} data-tone={verification.tone}>
      <span className="task-review__word">{verification.word}</span>
      {(verification.holds.length > 0 || verification.missing.length > 0) && (
        <ul className="task-review__conditions">
          {verification.holds.map((h) => <li key={`h:${h}`} className="task-review__holds" data-task-holds>{h}</li>)}
          {verification.missing.map((m) => <li key={`m:${m}`} className="task-review__missing" data-task-missing>{m}</li>)}
        </ul>
      )}
      {(verification.stage === 'agent-finished' || verification.stage === 'stale') && (
        <p className="task-review__means" data-task-verified-means>
          {VERIFIED_MEANS}
          {p.onRunChecks !== undefined && !(p.checks ?? []).some((c) => c.outcome === 'passed') && (
            <>{' '}<button type="button" className="pf__verb pf__verb--word" data-task-verified-run
              title="Run this lane's checks in a watcher in the lane — the form opens below"
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); p.onRunChecks?.() }}>Run checks…</button></>
          )}
        </p>
      )}
    </div>
  )
}

const LAST_LINES = 12
/** Failures first, then stale, running, unknown, not run, passes — `checkEvidence`'s order, newest first within each. */
const RANK: Record<string, number> = { failed: 0, stale: 1, running: 2, unknown: 3, 'not-run': 4, passed: 5 }

export function TaskReviewPanel(p: TaskReviewPanelProps): JSX.Element {
  const [openCheck, setOpenCheck] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendNote, setSendNote] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  // M310. Run checks: null closed, else the command being edited.
  const [checkDraft, setCheckDraft] = useState<string | null>(null)
  const [checkNote, setCheckNote] = useState<string | null>(null)
  const [prAsked, setPrAsked] = useState(false)
  // M314. Save as recipe: null closed, else the name being typed.
  const [recipeName, setRecipeName] = useState<string | null>(null)
  const [recipeNote, setRecipeNote] = useState<string | null>(null)
  const ordered = useMemo(() => [...(p.checks ?? [])].sort((a, b) => (RANK[a.outcome] ?? 9) - (RANK[b.outcome] ?? 9) || b.at - a.at), [p.checks])
  const failing = useMemo(() => ordered.filter((c) => c.outcome === 'failed'), [ordered])
  const lastLines = useFailingLastLines(failing)
  const verification = verificationOf({
    agentWorking: p.agentWorking,
    standing: p.standing,
    checks: p.checks ?? [],
    ...(p.comments === undefined ? {} : { comments: p.comments }),
    ...(p.criteria === undefined ? {} : { criteria: p.criteria }),
    ...(p.criteriaMet === undefined ? {} : { criteriaMet: p.criteriaMet })
  })
  const open = openComments(p.comments)
  const proposed = proposedComments(p.comments)
  const resolvedCount = (p.comments ?? []).filter((c) => c.resolved === true && c.proposedBy === undefined).length
  const unmet = unmetCriteria(p.criteria, p.criteriaMet)
  const followUpChecks: FollowUpCheck[] = failing.map((c) => ({
    command: c.command,
    ended: checkWords(c),
    ...(lastLines.get(c.key) === undefined ? {} : { lastLines: lastLines.get(c.key) })
  }))
  // M315. A comment already SENT is not a new follow-up: sending again repeated
  // it word for word to an agent that had already acted on it. Sent comments
  // stay open (the person resolves them); only unsent ones compose.
  const unsent = open.filter((c) => c.sentAt === undefined)
  const followUp = composeFollowUp({
    title: p.title,
    ...(p.brief === undefined ? {} : { brief: p.brief }),
    comments: unsent,
    failing: followUpChecks,
    unmet
  })
  const canSend = followUp !== '' && !p.readOnly && p.chatOpen && !sending && p.onSendFollowUp !== undefined

  const send = (): void => {
    if (!canSend || p.onSendFollowUp === undefined) return
    setSending(true)
    setSendNote(null)
    const ids = new Set(unsent.map((c) => c.id))
    void p.onSendFollowUp(p.itemId, followUp).then((refusal) => {
      setSending(false)
      if (refusal !== null) { setSendNote(refusal); return }
      const now = Date.now()
      p.onComments?.(p.itemId, (p.comments ?? []).map((c) => (ids.has(c.id) ? { ...c, sentAt: now } : c)))
      setSendNote('sent — the comments stay open until you resolve them')
      setPreviewOpen(false)
    })
  }

  // The checks that WITNESSED-passed on this content: a recipe saved from a
  // task carries proof it worked, not every command someone once tried.
  const passedChecks = [...new Set(ordered.filter((c) => c.outcome === 'passed').map((c) => c.command))]
  const saveRecipe = (): void => {
    if (recipeName === null || recipeName.trim() === '' || p.onSaveRecipe === undefined) return
    const name = recipeName.trim()
    setRecipeNote('saving…')
    void p.onSaveRecipe(p.itemId, name, passedChecks).then((refusal) => {
      if (refusal !== null) { setRecipeNote(refusal); return }
      setRecipeName(null)
      setRecipeNote(`saved — “${name}” is in Start work's Recipe list`)
    })
  }

  // M401 (B9). The verdict's Run checks lands HERE, on the one form — never a
  // second one up top. The same open the form's own button does, then the
  // block is scrolled into the review's view.
  const runBlockRef = useRef<HTMLDivElement | null>(null)
  const askedRef = useRef(p.runChecksAsk ?? 0)
  useEffect(() => {
    if (p.runChecksAsk === undefined || p.runChecksAsk === askedRef.current) return
    askedRef.current = p.runChecksAsk
    setCheckNote(null)
    setCheckDraft((cur) => cur ?? '')
    void p.suggestCheck?.().then((cmd) => setCheckDraft((cur) => (cur === '' && cmd !== null ? cmd : cur)), () => {})
    runBlockRef.current?.scrollIntoView({ block: 'nearest' })
  }, [p.runChecksAsk]) // eslint-disable-line react-hooks/exhaustive-deps

  const runChecks = (): void => {
    if (checkDraft === null || checkDraft.trim() === '' || p.onRunChecks === undefined) return
    const command = checkDraft.trim()
    setCheckNote('making the checks watcher in the lane…')
    void p.onRunChecks(p.itemId, command).then((refusal) => {
      if (refusal !== null) { setCheckNote(refusal); return }
      setCheckDraft(null)
      setCheckNote(`running \`${command}\` in a watcher beside the lane — its result lands above with its own output`)
    })
  }

  return (
    <div className="task-review" data-task-review={p.itemId}>
      {p.hideVerdict !== true && <div className="task-review__verdict" data-task-verification={verification.stage} data-tone={verification.tone}>
        <span className="task-review__word">{verification.word}</span>
        {(verification.holds.length > 0 || verification.missing.length > 0) && (
          <ul className="task-review__conditions">
            {verification.holds.map((h) => <li key={`h:${h}`} className="task-review__holds" data-task-holds>{h}</li>)}
            {verification.missing.map((m) => <li key={`m:${m}`} className="task-review__missing" data-task-missing>{m}</li>)}
          </ul>
        )}
      </div>}

      {p.brief !== undefined && p.brief.trim() !== '' && (
        <div className="task-review__block">
          <span className="task-review__label">Intended outcome</span>
          <p className="task-review__brief" data-task-brief>{p.brief}</p>
        </div>
      )}

      {(p.deliverables ?? []).length > 0 && (
        <div className="task-review__block" data-task-deliverables={String((p.deliverables ?? []).length)}>
          <span className="task-review__label">Expected back</span>
          <ul className="task-review__deliverables">
            {(p.deliverables ?? []).map((d) => <li key={d}>{d}</li>)}
          </ul>
        </div>
      )}

      {(p.criteria ?? []).length > 0 && (
        <div className="task-review__block">
          <span className="task-review__label">Acceptance criteria · {(p.criteria ?? []).length - unmet.length} of {(p.criteria ?? []).length} confirmed</span>
          <ul className="task-review__criteria">
            {(p.criteria ?? []).map((c) => {
              const met = !unmet.includes(c)
              return (
                <li key={c}>
                  <label className="task-review__criterion" data-task-criterion={met ? 'met' : 'open'}>
                    <input type="checkbox" checked={met} disabled={p.readOnly || p.onToggleCriterion === undefined}
                      onMouseDown={(e) => e.stopPropagation()}
                      onChange={(e) => p.onToggleCriterion?.(p.itemId, c, e.target.checked)} />
                    <span>{c}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="task-review__block">
        <span className="task-review__label">Checks this canvas ran</span>
        {p.checks === null ? (
          <p className="pf__note" data-task-checks="reading">reading the lane's checks…</p>
        ) : p.checks.length === 0 ? (
          <p className="pf__note" data-task-checks="none">none yet — run the lane's tests from a watcher or a terminal in the lane, and they appear here with their output</p>
        ) : (
          <ul className="task-review__checks" data-task-checks={String(p.checks.length)}>
            {ordered.slice(0, 8).map((c) => (
              <li key={c.key} className="task-review__check" data-task-check={c.outcome}>
                <button type="button" className="task-review__check-row" aria-expanded={openCheck === c.key}
                  title={c.note ?? 'open this run\'s output'}
                  onMouseDown={p.press(() => setOpenCheck(openCheck === c.key ? null : c.key))}>
                  <span className="task-review__check-word" data-tone={c.outcome === 'failed' ? 'needs-you' : c.outcome === 'passed' ? 'idle' : 'none'}>{checkWords(c)}</span>
                  <code className="task-review__check-command">{c.command}</code>
                </button>
                {openCheck === c.key && (
                  <CheckRunOutput outputId={c.outputId} subject={`panel ${c.panelId}`}
                    fallback="This run has no output record — it ran before output capture was added." />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {p.onRunChecks !== undefined && !p.readOnly && (
        <div className="task-review__block task-review__run" data-task-run-checks ref={runBlockRef}>
          {checkDraft === null ? (
            <button type="button" className="pf__verb pf__verb--word" data-task-run-open
              title="Run this lane's checks in a watcher in the lane — each run keeps its own output"
              onMouseDown={p.press(() => {
                setCheckNote(null)
                setCheckDraft('')
                void p.suggestCheck?.().then((cmd) => setCheckDraft((cur) => (cur === '' && cmd !== null ? cmd : cur)), () => {})
              })}>Run checks in the lane…</button>
          ) : (
            <div className="task-review__run-form" onMouseDown={(e) => e.stopPropagation()}>
              <input className="task-review__run-input" data-task-run-command value={checkDraft} spellCheck={false}
                aria-label="Command that runs this lane's checks" placeholder="npm test"
                onChange={(e) => setCheckDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Escape') { e.preventDefault(); setCheckDraft(null) }
                  if (e.key === 'Enter') { e.preventDefault(); runChecks() }
                }} />
              <button type="button" className="pf__verb pf__verb--word" data-task-run-go disabled={checkDraft.trim() === ''}
                onMouseDown={p.press(runChecks)}>Run</button>
              <button type="button" className="pf__verb pf__verb--word" onMouseDown={p.press(() => setCheckDraft(null))}>Cancel</button>
            </div>
          )}
          {checkNote !== null && <p className="pf__note" data-task-run-note role="status">{checkNote}</p>}
        </div>
      )}

      <div className="task-review__block">
        <span className="task-review__label">Comments · {open.length} open{proposed.length > 0 ? `, ${proposed.length} proposed` : ''}{resolvedCount > 0 ? `, ${resolvedCount} resolved` : ''}</span>
        {(p.comments ?? []).length === 0 ? (
          <p className="pf__note" data-task-comments="none">none — press + beside a line in the diff above to comment on it</p>
        ) : (
          <ul className="task-review__comments">
            {(p.comments ?? []).map((c) => c.proposedBy !== undefined ? (
              // M360. An agent's proposal: whose it is, and the person's two answers. It is not a comment of theirs until kept.
              <li key={c.id} className="task-review__comment task-review__comment--proposed" data-task-comment="proposed">
                <span className="task-review__comment-place">{commentPlace(c)}</span>
                {c.quote.trim() !== '' && <code className="task-review__comment-quote">{outward(c.quote, 'review comment').text}</code>}
                <p className="task-review__comment-body">{c.body}</p>
                <span className="task-review__comment-state" data-task-comment-by>proposed by {c.proposedBy.label}</span>
                {!p.readOnly && p.onComments !== undefined && (
                  <span className="task-review__comment-verbs">
                    <button type="button" className="pf__verb pf__verb--word" data-task-comment-verb="keep"
                      title="Keep it as your comment: it joins the follow-up like any comment of yours"
                      onMouseDown={p.press(() => { p.onComments?.(p.itemId, answerProposal(p.comments ?? [], c.id, true)); recordProposalAnswer(p.itemId, c, true) })}>Keep</button>
                    <button type="button" className="pf__verb pf__verb--word" data-task-comment-verb="discard"
                      title="Discard the agent's proposal"
                      onMouseDown={p.press(() => { p.onComments?.(p.itemId, answerProposal(p.comments ?? [], c.id, false)); recordProposalAnswer(p.itemId, c, false) })}>Discard</button>
                  </span>
                )}
              </li>
            ) : (
              <li key={c.id} className="task-review__comment" data-task-comment={c.resolved === true ? 'resolved' : c.sentAt !== undefined ? 'sent' : 'open'}>
                <span className="task-review__comment-place">{commentPlace(c)}</span>
                {c.quote.trim() !== '' && <code className="task-review__comment-quote">{outward(c.quote, 'review comment').text}</code>}
                <p className="task-review__comment-body">{c.body}</p>
                <span className="task-review__comment-state">{c.resolved === true ? 'resolved' : c.sentAt !== undefined ? 'sent to the agent' : 'not sent'}</span>
                {!p.readOnly && p.onComments !== undefined && (
                  <span className="task-review__comment-verbs">
                    <button type="button" className="pf__verb pf__verb--word" data-task-comment-verb="resolve"
                      onMouseDown={p.press(() => p.onComments?.(p.itemId, (p.comments ?? []).map((x) => (x.id === c.id ? { ...x, resolved: x.resolved !== true } : x))))}>
                      {c.resolved === true ? 'Reopen' : 'Resolve'}
                    </button>
                    <button type="button" className="pf__verb pf__verb--word" data-task-comment-verb="remove"
                      onMouseDown={p.press(() => p.onComments?.(p.itemId, (p.comments ?? []).filter((x) => x.id !== c.id)))}>Remove</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="task-review__block task-review__followup">
        <span className="task-review__label">Follow-up for the agent</span>
        {followUp === '' ? (
          <p className="pf__note" data-task-followup="empty">{open.length > unsent.length
            ? `nothing new to send — ${open.length - unsent.length} comment${open.length - unsent.length === 1 ? '' : 's'} already sent; resolve ${open.length - unsent.length === 1 ? 'it' : 'them'} once the change is right`
            : 'nothing to send — no open comments and no failing checks'}</p>
        ) : (
          <>
            <p className="pf__note" data-task-followup="ready">
              {unsent.length} comment{unsent.length === 1 ? '' : 's'}{failing.length > 0 ? `, ${failing.length} failing check${failing.length === 1 ? '' : 's'}` : ''}{unmet.length > 0 ? `, ${unmet.length} criteria not confirmed` : ''} — read it before it goes
            </p>
            <button type="button" className="pf__verb pf__verb--word" aria-expanded={previewOpen} data-task-followup-verb="preview"
              onMouseDown={p.press(() => setPreviewOpen((v) => !v))}>{previewOpen ? 'Hide the message' : 'Show the message'}</button>
            {previewOpen && <pre className="task-review__followup-text" data-task-followup-text>{followUp}</pre>}
          </>
        )}
        <div className="task-review__followup-verbs">
          <button type="button" className="pf__verb pf__verb--word task-review__send" data-task-followup-verb="send"
            disabled={!canSend}
            title={p.readOnly ? 'leave merged view to act on this review' : !p.chatOpen ? 'the lane\'s conversation is closed' : followUp === '' ? 'nothing to send' : 'send exactly this message to the lane\'s agent'}
            onMouseDown={canSend ? p.press(send) : undefined}>{sending ? 'sending…' : 'Send to agent'}</button>
          <button type="button" className="pf__verb pf__verb--word" data-task-followup-verb="draft"
            disabled={followUp === '' || p.readOnly || !p.chatOpen || p.onDraftFollowUp === undefined}
            title="put this message in the conversation's composer to edit; nothing is sent"
            onMouseDown={followUp === '' || p.readOnly || !p.chatOpen ? undefined : p.press(() => p.onDraftFollowUp?.(p.itemId, followUp))}>Edit in conversation</button>
        </div>
        {sendNote !== null && <p className="pf__note" data-task-followup-note role="status">{sendNote}</p>}
      </div>

      {/* M310. The pull request, carrying this review's evidence. Open even
          when not verified — the body says plainly what is missing. */}
      {(p.onOpenPr !== undefined || p.pr !== undefined) && (
        <div className="task-review__block" data-task-pr={p.pr === undefined ? 'none' : String(p.pr.number)}>
          <span className="task-review__label">Pull request</span>
          {p.pr !== undefined ? (
            <p className="pf__note">#{p.pr.number} is open — {p.pr.url}</p>
          ) : (
            <>
              <p className="pf__note">{verification.stage === 'verified' ? 'verified — the body will say so, with the checks it passed' : `not verified yet — the body will say so: ${verification.missing.join('; ')}`}</p>
              <button type="button" className="pf__verb pf__verb--word" data-task-pr-open disabled={p.readOnly || prAsked}
                title="Push the lane's branch and open a pull request whose body carries the outcome, the criteria and the checks"
                onMouseDown={p.readOnly || prAsked ? undefined : p.press(() => {
                  setPrAsked(true)
                  p.onOpenPr?.(p.itemId, {
                    verification: { word: verification.word, missing: verification.missing },
                    checks: ordered.filter((c) => c.outcome !== 'running' && c.outcome !== 'not-run').map((c) => ({ command: c.command, words: checkWords(c), ...(c.tested === undefined ? {} : { tested: c.tested.base.slice(0, 10) }) })),
                    ...(p.reviewedFiles === undefined ? {} : { reviewedFiles: p.reviewedFiles }),
                    openComments: open.length
                  })
                })}>{prAsked ? 'opening…' : 'Open pull request'}</button>
            </>
          )}
          {p.note !== undefined && p.pr === undefined && prAsked && <p className="pf__note" role="status">{p.note}</p>}
        </div>
      )}

      {/* M314. A task that went well, kept as a recipe: its outcome, criteria,
          deliverables, arrangement and the checks that PASSED here. Offered
          any time, and the line says whether it was verified — a recipe saved
          from an unverified task is the person's call, stated, not hidden. */}
      {p.onSaveRecipe !== undefined && !p.readOnly && (
        <details className="task-review__block task-review__more" data-task-save-recipe>
          {/* M315. Behind a disclosure: a recipe is about the NEXT task, and at
              rest it competed with the decisions this one is waiting on. */}
          <summary className="task-review__label">Save as a recipe for next time</summary>
          {recipeName === null ? (
            <>
              <p className="pf__note">{verification.stage === 'verified' ? 'verified — save how this was done to start the next one the same way' : 'not verified yet — a recipe saved now keeps checks that have not passed out of it'}{passedChecks.length > 0 ? ` · keeps ${passedChecks.map((c) => `\`${c}\``).join(', ')}` : ''}</p>
              <button type="button" className="pf__verb pf__verb--word" data-task-save-recipe-open
                title="Save this task's outcome, criteria, deliverables, arrangement and passing checks as a recipe for Start work"
                onMouseDown={p.press(() => { setRecipeNote(null); setRecipeName(p.title.slice(0, 60)) })}>Save as recipe…</button>
            </>
          ) : (
            <div className="task-review__run-form" onMouseDown={(e) => e.stopPropagation()}>
              <input className="task-review__run-input" data-task-recipe-name value={recipeName} spellCheck={false}
                aria-label="Recipe name" placeholder="e.g. Fix a flaky integration test"
                onChange={(e) => setRecipeName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Escape') { e.preventDefault(); setRecipeName(null) }
                  if (e.key === 'Enter') { e.preventDefault(); saveRecipe() }
                }} />
              <button type="button" className="pf__verb pf__verb--word" data-task-recipe-save disabled={recipeName.trim() === ''}
                onMouseDown={p.press(saveRecipe)}>Save</button>
              <button type="button" className="pf__verb pf__verb--word" onMouseDown={p.press(() => setRecipeName(null))}>Cancel</button>
            </div>
          )}
          {recipeNote !== null && <p className="pf__note" data-task-recipe-note role="status">{recipeNote}</p>}
        </details>
      )}
    </div>
  )
}

/** The last lines of each failing check's own record, for the follow-up — redacted, and only runs that HAVE a record. */
function useFailingLastLines(failing: readonly CheckRecord[]): Map<string, string[]> {
  const key = failing.map((c) => `${c.key}\0${c.outputId ?? ''}`).join('\n')
  const [lines, setLines] = useState<Map<string, string[]>>(() => new Map())
  useEffect(() => {
    const door = window.canvas?.ledger?.output
    const withRecord = failing.filter((c) => c.outputId !== undefined)
    if (withRecord.length === 0 || typeof door !== 'function') { setLines(new Map()); return }
    let live = true
    void Promise.all(withRecord.map(async (c) => {
      try {
        const read = await door(c.outputId as string)
        if (read.kind !== 'ok') return null
        const text = outward(checkOutputDisplay(read.record), `panel ${c.panelId}`).text
        const tail = text.split('\n').filter((l) => l.trim() !== '').slice(-LAST_LINES)
        return [c.key, tail] as const
      } catch { return null }
    })).then((pairs) => {
      if (!live) return
      setLines(new Map(pairs.filter((x): x is readonly [string, string[]] => x !== null).map(([k, v]) => [k, v])))
    })
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return lines
}
