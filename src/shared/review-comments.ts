import { carryReviewIdentity, parseReviewIdentity, type ReviewIdentity } from './review-identity'
import type { ReviewHandoffState, ReviewStanding } from './review-readiness'
import type { CheckRecord } from './check-evidence'

/**
 * M307. THE REVIEWER'S SIDE OF A REVIEW — comments pinned to diff lines, the
 * precise follow-up they compose into, and the one judgment that separates
 * an agent FINISHING from a task being VERIFIED.
 *
 * COMMENTS are the person's, like `brief` and `reviewed`: stored on the work
 * item, never on a panel, so they survive the review node being closed and
 * the chat being restarted. Each is addressed by path, SIDE and line number
 * (M307's `DiffLine.oldNo/newNo`) and keeps the line's text as it read when
 * written — so a comment whose line has since moved still says what it was
 * about, and the follow-up quotes it rather than pointing at a number that
 * now means something else. A comment also keeps the review identity it was
 * written against; a reader compares it to the subject now and says
 * "written against an earlier revision" instead of pretending it is fresh.
 *
 * THE FOLLOW-UP is composed, shown whole, and sent only by a person's press
 * (a hand-off, like dispatch — `useBoardVerbs.ts`'s note on M80's insert
 * rule, which is for templates a person finishes). It names each point with
 * a number so the agent's reply can be matched back, carries the failing
 * checks this canvas actually OBSERVED (never an agent's claim), and lists
 * the criteria the person has not confirmed.
 *
 * VERIFIED is a CONJUNCTION this app can defend, never a word an agent can
 * earn by saying it is done: the review mark is CURRENT against the subject's
 * content identity, at least one check this canvas witnessed PASSED on that
 * same content, no witnessed check failed or went stale, no comment is still
 * open, and every acceptance criterion is confirmed by the person. Anything
 * short of that is at most "agent finished", with the missing parts named.
 *
 * Pure: no DOM, no React, no electron. `verify:review review-comment.1–.4`.
 */

export const REVIEW_COMMENTS_MAX = 100
export const REVIEW_COMMENT_BODY_MAX = 4000

export interface ReviewComment {
  id: string
  path: string
  /** `new` addresses an added or context line by its new-file number; `old` a deleted line by its old-file number. */
  side: 'new' | 'old'
  line: number
  /** The line's text (marker stripped) when the comment was written. */
  quote: string
  body: string
  at: number
  /** The subject's identity when written. Absent reads "revision unknown". */
  identity?: ReviewIdentity
  /** When it was last included in a follow-up that was SENT. */
  sentAt?: number
  /** The person closed it. Resolved comments stay listed, struck through, until removed. */
  resolved?: boolean
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** A fresh copy, by name — the `carryWorkItem` rule: no spread, no `key: undefined`. */
export function carryReviewComment(c: ReviewComment): ReviewComment {
  return {
    id: c.id, path: c.path, side: c.side, line: c.line, quote: c.quote, body: c.body, at: c.at,
    ...(c.identity === undefined ? {} : { identity: carryReviewIdentity(c.identity) }),
    ...(c.sentAt === undefined ? {} : { sentAt: c.sentAt }),
    ...(c.resolved === true ? { resolved: true } : {})
  }
}

/** Field-level: a malformed comment costs that comment, a malformed list costs the list — never the card. */
export function parseReviewComments(raw: unknown): ReviewComment[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: ReviewComment[] = []
  for (const r of raw) {
    if (!isRecord(r) || !isStr(r.id) || !isStr(r.path) || (r.side !== 'new' && r.side !== 'old')) continue
    if (!isNum(r.line) || r.line < 1 || typeof r.quote !== 'string' || !isStr(r.body) || !isNum(r.at)) continue
    const identity = parseReviewIdentity(r.identity)
    out.push(carryReviewComment({
      id: r.id, path: r.path, side: r.side, line: Math.floor(r.line), quote: r.quote,
      body: r.body.slice(0, REVIEW_COMMENT_BODY_MAX), at: r.at,
      ...(identity === undefined ? {} : { identity }),
      ...(isNum(r.sentAt) ? { sentAt: r.sentAt } : {}),
      ...(r.resolved === true ? { resolved: true } : {})
    }))
  }
  return out.length === 0 ? undefined : out.slice(-REVIEW_COMMENTS_MAX)
}

/** The line a comment is written against, from a numbered diff line. Null for a line with no number (hunk, meta). */
export function commentAnchorOf(line: { kind: string; text: string; oldNo?: number; newNo?: number }): { side: 'new' | 'old'; line: number; quote: string } | null {
  const quote = line.text.length > 0 && (line.kind === 'add' || line.kind === 'del' || line.kind === 'context') ? line.text.slice(1) : line.text
  if ((line.kind === 'add' || line.kind === 'context') && line.newNo !== undefined) return { side: 'new', line: line.newNo, quote }
  if (line.kind === 'del' && line.oldNo !== undefined) return { side: 'old', line: line.oldNo, quote }
  return null
}

/** A comment's address in the words the follow-up and the list both use. */
export function commentPlace(c: Pick<ReviewComment, 'path' | 'side' | 'line'>): string {
  return c.side === 'new' ? `${c.path}:${c.line}` : `${c.path}:${c.line} (removed line)`
}

/** Open = not resolved. Sent-and-open is still open: sending is not fixing. */
export const openComments = (comments: readonly ReviewComment[] | undefined): ReviewComment[] =>
  (comments ?? []).filter((c) => c.resolved !== true)

/** A failing check, as the follow-up quotes it: what ran, how it ended, and its last lines when the record was read. */
export interface FollowUpCheck {
  command: string
  ended: string
  /** The record's last lines, already redacted by the caller. */
  lastLines?: string[]
}

export interface FollowUpInput {
  title: string
  brief?: string
  comments: readonly ReviewComment[]
  failing: readonly FollowUpCheck[]
  /** Criteria the person has NOT confirmed. */
  unmet: readonly string[]
}

/**
 * The message. Deterministic (the verifier compares it), plain text an agent
 * CLI reads without markup, and quoting — never paraphrasing — the lines.
 * Empty input composes nothing: a follow-up with no points is not a message.
 */
export function composeFollowUp(input: FollowUpInput): string {
  const points = input.comments.filter((c) => c.resolved !== true)
  if (points.length === 0 && input.failing.length === 0) return ''
  const out: string[] = [`Review of "${input.title}" — please address these, then tell me what you changed for each numbered point.`]
  if (input.brief !== undefined && input.brief.trim() !== '') out.push('', `The intended outcome: ${input.brief.trim()}`)
  if (points.length > 0) {
    out.push('', 'Comments on the diff:')
    points.forEach((c, i) => {
      out.push(`${i + 1}. ${commentPlace(c)}`)
      if (c.quote.trim() !== '') out.push(`   > ${c.quote.trimEnd()}`)
      for (const line of c.body.trim().split('\n')) out.push(`   ${line}`)
    })
  }
  if (input.failing.length > 0) {
    out.push('', 'Checks that failed when this canvas ran them:')
    input.failing.forEach((f, i) => {
      out.push(`${points.length + i + 1}. \`${f.command}\` — ${f.ended}`)
      for (const line of (f.lastLines ?? []).slice(-12)) out.push(`   | ${line}`)
    })
  }
  if (input.unmet.length > 0) {
    out.push('', 'Acceptance criteria not yet confirmed:')
    for (const c of input.unmet) out.push(`- ${c}`)
  }
  return out.join('\n')
}

/** The criteria the person has not confirmed — by TEXT, so an edited criterion is unconfirmed again. */
export function unmetCriteria(criteria: readonly string[] | undefined, met: readonly string[] | undefined): string[] {
  const done = new Set(met ?? [])
  return (criteria ?? []).filter((c) => !done.has(c))
}

/* ── Finished is not verified ─────────────────────────────────────────────── */

/**
 * The lane's agent is mid-turn, by the handoff's own state — named here so a
 * renderer never spells the state word (`verify:rail state.2`).
 */
export function agentWorkingOf(state: ReviewHandoffState): boolean {
  return state === 'working'
}

export type VerificationStage =
  /** The agent is running a turn. */
  | 'working'
  /** Comments were sent and the agent has not come back yet. */
  | 'changes-requested'
  /** The agent stopped. Nothing here says the work is right. */
  | 'agent-finished'
  /** A review exists and the content has moved since it — re-reading comes first. */
  | 'stale'
  /** Every condition holds against the CURRENT content. */
  | 'verified'

export interface VerificationInput {
  /** The agent's run state for the lane: running a turn, or not. */
  agentWorking: boolean
  standing: ReviewStanding
  /**
   * The lane's witnessed checks with freshness ALREADY bound
   * (`bindCheckFreshness`), which judges each against its OWN tested base —
   * a watcher stamps against HEAD, a lane's review against its fork point, so
   * comparing both to one identity here would call every committed lane stale.
   */
  checks: readonly CheckRecord[]
  comments?: readonly ReviewComment[]
  criteria?: readonly string[]
  criteriaMet?: readonly string[]
}

export interface Verification {
  stage: VerificationStage
  /** The resting word. Never "done" — that is the board's column, the person's. */
  word: string
  tone: 'neutral' | 'working' | 'amber' | 'green'
  /** What holds, in short clauses a surface lists with a tick. */
  holds: string[]
  /** What is missing for `verified`, in short clauses a surface lists as open. */
  missing: string[]
}

export function verificationOf(v: VerificationInput): Verification {
  const holds: string[] = []
  const missing: string[] = []
  const open = openComments(v.comments)
  const unsentOpen = open.filter((c) => c.sentAt === undefined)
  const sentOpen = open.filter((c) => c.sentAt !== undefined)
  const unmet = unmetCriteria(v.criteria, v.criteriaMet)

  if (v.standing === 'current') holds.push('reviewed at this revision')
  else if (v.standing === 'stale') missing.push('the changes moved since your review')
  else if (v.standing === 'unknown') missing.push('your review predates revision tracking — review again')
  else missing.push('not reviewed')

  // `passed` survives the binding only when the content it tested is the content now.
  const passedNow = v.checks.filter((c) => c.outcome === 'passed')
  const failed = v.checks.filter((c) => c.outcome === 'failed')
  const stale = v.checks.filter((c) => c.outcome === 'stale')
  if (passedNow.length > 0 && failed.length === 0) holds.push(`${passedNow.length} check${passedNow.length === 1 ? '' : 's'} passed on this revision`)
  if (failed.length > 0) missing.push(`${failed.length} check${failed.length === 1 ? '' : 's'} failed`)
  else if (passedNow.length === 0) missing.push(stale.length > 0 ? 'checks ran on an earlier revision — run them again' : 'no check has run on this revision')

  if (open.length === 0 && (v.comments ?? []).length > 0) holds.push('every comment resolved')
  if (unsentOpen.length > 0) missing.push(`${unsentOpen.length} comment${unsentOpen.length === 1 ? '' : 's'} not sent`)
  if (sentOpen.length > 0) missing.push(`${sentOpen.length} comment${sentOpen.length === 1 ? '' : 's'} sent, not resolved`)

  if ((v.criteria ?? []).length > 0) {
    if (unmet.length === 0) holds.push('every acceptance criterion confirmed')
    else missing.push(`${unmet.length} of ${(v.criteria ?? []).length} criteria not confirmed`)
  }

  if (v.agentWorking) {
    return sentOpen.length > 0
      ? { stage: 'changes-requested', word: 'changes requested — agent working', tone: 'working', holds, missing }
      : { stage: 'working', word: 'agent working', tone: 'working', holds, missing }
  }
  if (missing.length === 0) return { stage: 'verified', word: 'verified', tone: 'green', holds, missing }
  if (v.standing === 'stale') return { stage: 'stale', word: 'changed since your review', tone: 'amber', holds, missing }
  return { stage: 'agent-finished', word: 'agent finished — not verified', tone: 'amber', holds, missing }
}
