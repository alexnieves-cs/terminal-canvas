import type { CheckRecord } from '@shared/check-evidence'

/**
 * REVIEW & ACCEPT IN ONE PRESS — for a small change something else has
 * already checked.
 *
 * Landing a task used to be Mark reviewed, then Accept…, then the plan's
 * Merge: three presses on one surface even for a one-file fix whose tests
 * passed. This offers the first two as one verb when the change is small
 * enough to read in the card (`QUICK_ACCEPT_MAX_FILES`) AND every check the
 * lane ran passed. The plan and its Merge stay: the dry run still refuses
 * by name, and nothing lands without the person seeing what will.
 *
 * Without a passing check there is no fast path. An agent saying it is done
 * is the claim M307 refuses ("finished is not verified"); a witnessed check
 * is not. Pure: `verify:ux ux.land.*`.
 */
export const QUICK_ACCEPT_MAX_FILES = 5

export function quickAccept(input: { files: number; checks: readonly CheckRecord[] | null }): { offer: true } | { offer: false; reason: string } {
  if (!(input.files > 0)) return { offer: false, reason: 'no changed files' }
  if (input.files > QUICK_ACCEPT_MAX_FILES) return { offer: false, reason: `more than ${QUICK_ACCEPT_MAX_FILES} files — read them, then Mark reviewed` }
  if (input.checks === null || input.checks.length === 0) return { offer: false, reason: 'no check has run on this lane' }
  if (!input.checks.every((c) => c.outcome === 'passed')) return { offer: false, reason: 'a check on this lane has not passed' }
  return { offer: true }
}
