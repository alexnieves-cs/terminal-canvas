/**
 * Brief #18. FINISHED EXECUTION IS NOT FINISHED WORK.
 *
 * Four outcomes that the page used to blur, kept apart here and nowhere else:
 *
 *   - `idle`     the agent is waiting. Its run is not over; it answers the
 *                next message. Nothing about the work is decided.
 *   - `ended`    the run ended — every session's process exited. The work may
 *                be anything from untouched to complete; nobody has looked.
 *   - `reviewed` a person read the changes and the mark still holds for THIS
 *                content (M285's standing). Checks, comments or criteria may
 *                still be open — `unresolved` says which.
 *   - `done`     the board says done. That is the person's word (M197): this
 *                module never infers it, however green everything else is.
 *
 * Each outcome carries a HANDOFF: what changed, which checks ran, what is
 * still unresolved, and the ONE next action — the four questions a person
 * coming back asks, answered from reads the page already holds (the review
 * handoff, the bound checks, M307's verification) so no surface derives a
 * second answer. `null` while anything is still running or waiting on the
 * person: a handoff mid-flight would be a claim about work that is moving.
 *
 * Pure: no DOM, no React. `verify:orchestration completion.1–.4`.
 */

import type { CheckRecord } from './check-evidence'
import type { Verification } from './review-comments'
import type { WorkItemState } from './work-items'

export type CompletionOutcome = 'idle' | 'ended' | 'reviewed' | 'done'

/** The next available action, as a verb the page can run. */
export type CompletionNext =
  | { action: 'review'; label: string }
  | { action: 'checks'; label: string }
  | { action: 'mark-done'; label: string }
  | { action: 'follow-up'; label: string }
  | { action: 'open'; label: string }
  | { action: 'none'; label: string }

export interface CompletionInput {
  board: WorkItemState
  /** The task's sessions, counted by the roster's own groups. */
  sessions: { active: number; needsYou: number; idle: number; ended: number }
  /** The lane's changes, when the handoff read them; absent is "not read", `files: 0` is clean. */
  changes?: { files: number; added: number; removed: number; shared?: boolean }
  /** Bound checks (`bindCheckFreshness`); null when they were not read. */
  checks: readonly CheckRecord[] | null
  /** M307's verdict, when it could be formed; null when its inputs were not read. */
  verification: Verification | null
  /** The review mark holds for the content now (M285's standing `current`). */
  reviewedNow: boolean
}

export interface Completion {
  outcome: CompletionOutcome
  /** The resting word — never celebratory; only `done` is the board's word. */
  word: string
  /** One sentence: what this outcome means and what it does NOT mean. */
  meaning: string
  changed: string
  checks: string
  unresolved: string[]
  next: CompletionNext
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

function changedLine(c: CompletionInput['changes']): string {
  if (c === undefined) return 'Changes not read yet'
  if (c.files === 0) return 'No changes in the lane'
  return `${plural(c.files, 'file')} changed · +${c.added} −${c.removed}${c.shared ? ' · in a shared directory, not attributed to this task alone' : ''}`
}

function checksLine(checks: CompletionInput['checks']): string {
  if (checks === null) return 'Checks not read — open the Checks tab'
  if (checks.length === 0) return 'No check has run'
  const passed = checks.filter((c) => c.outcome === 'passed').length
  const failed = checks.filter((c) => c.outcome === 'failed').length
  const stale = checks.filter((c) => c.outcome === 'stale' || c.outcome === 'unknown').length
  const running = checks.filter((c) => c.outcome === 'running').length
  const parts = [
    passed > 0 ? `${passed} passed` : '',
    failed > 0 ? `${failed} failed` : '',
    stale > 0 ? `${stale} on an earlier version` : '',
    running > 0 ? `${running} running` : ''
  ].filter((p) => p !== '')
  return `${plural(checks.length, 'check')} ran · ${parts.join(' · ') || 'no result recorded'}`
}

export function completionOf(v: CompletionInput): Completion | null {
  // Still moving, or waiting on the person (the Needs-you card owns that): no handoff yet.
  if (v.board !== 'done' && (v.sessions.active > 0 || v.sessions.needsYou > 0)) return null
  const total = v.sessions.active + v.sessions.needsYou + v.sessions.idle + v.sessions.ended
  const changed = changedLine(v.changes)
  const checks = checksLine(v.checks)
  const unresolved = v.board === 'done' ? [] : [...(v.verification?.missing ?? [])]
  const hasChanges = v.changes !== undefined && v.changes.files > 0
  const failed = (v.checks ?? []).some((c) => c.outcome === 'failed')
  const noFreshCheck = v.checks !== null && !v.checks.some((c) => c.outcome === 'passed' || c.outcome === 'failed')

  if (v.board === 'done') {
    return { outcome: 'done', word: 'Done', meaning: 'Marked done on the board — the task is closed.', changed, checks, unresolved, next: { action: 'none', label: 'Nothing is waiting on this task' } }
  }
  if (v.reviewedNow) {
    const verified = v.verification?.stage === 'verified'
    const next: CompletionNext = verified ? { action: 'mark-done', label: 'Mark done' }
      : failed ? { action: 'checks', label: 'Read the failed check' }
        : noFreshCheck ? { action: 'checks', label: 'Run the checks' }
          : { action: 'review', label: 'Resolve what is open' }
    return {
      outcome: 'reviewed',
      word: verified ? 'Reviewed · verified' : 'Reviewed',
      meaning: verified
        ? 'You reviewed this revision and every check and criterion holds. It is not done until you mark it.'
        : 'You reviewed this revision; some of the work is still open, so it is not verified.',
      changed, checks, unresolved, next
    }
  }
  const ended = total > 0 && v.sessions.ended === total
  const next: CompletionNext = hasChanges ? { action: 'review', label: 'Review the changes' }
    : ended ? { action: 'open', label: 'Open on canvas to restart or read it' }
      : { action: 'follow-up', label: 'Send a follow-up' }
  if (ended) {
    return {
      outcome: 'ended', word: 'Run ended',
      meaning: hasChanges ? 'Every session has exited. The run is over; nobody has reviewed what it left.'
        : v.changes === undefined ? 'Every session has exited. The run is over — that says nothing yet about the work.'
          : 'Every session has exited, and the lane holds no changes.',
      changed, checks, unresolved, next
    }
  }
  return {
    outcome: 'idle', word: 'Idle',
    meaning: hasChanges ? 'The agent stopped and is waiting. Its changes are unreviewed — idle is not finished.'
      : v.changes === undefined ? 'The agent is waiting for its next message. Idle is not finished — its run is still open.'
        : 'The agent is waiting for its next message. Nothing has changed yet.',
    changed, checks, unresolved, next
  }
}
