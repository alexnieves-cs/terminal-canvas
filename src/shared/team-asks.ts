import type { AskAnswer, AskOutcome } from './canvas-ops'

/**
 * M375. THE TEAM QUEUE'S POLICY — Arc 2's multi-human approval with a spend
 * threshold. Pure: the owner's main decides with it, and a teammate's
 * screen says the same count with it ("1 of 2 allowed").
 *
 * - An ask needs ONE allow, or TWO distinct people's allows once the asking
 *   agent's spend has reached the threshold (`agents.teamEscalateUsd`). The
 *   second is the escalation: spend past a line the team drew is not one
 *   person's call.
 * - A single deny decides it, whatever the count: a person who says no to
 *   a command on a shared canvas is not outvoted.
 * - The owner answering on their own machine is one person like any other,
 *   and is written to the doc in their name, so the count is one count.
 */

/** Where a summary is cut before it leaves the machine: enough to judge a command, never a transcript. */
export const TEAM_ASK_SUMMARY_MAX = 300

/** How many distinct allows decide an ask: 2 at or past the threshold, else 1. No threshold, no escalation. */
export function approvalsNeeded(spentUsd: number | undefined, escalateAtUsd: number | undefined): 1 | 2 {
  if (escalateAtUsd === undefined || !Number.isFinite(escalateAtUsd) || escalateAtUsd <= 0) return 1
  return spentUsd !== undefined && spentUsd >= escalateAtUsd ? 2 : 1
}

/** What the answers so far decide: open until `need` distinct people allow, denied at the first deny. */
export function askDecision(need: 1 | 2, answers: Readonly<Record<string, AskAnswer>>): 'open' | Exclude<AskOutcome, 'withdrawn'> {
  const all = Object.values(answers)
  if (all.includes('deny')) return 'denied'
  return all.filter((a) => a === 'allow').length >= need ? 'allowed' : 'open'
}

/** The count as a person reads it beside an open ask. */
export function askProgressWords(need: 1 | 2, answers: Readonly<Record<string, AskAnswer>>): string {
  const allows = Object.values(answers).filter((a) => a === 'allow').length
  if (need === 1) return allows === 0 ? 'waiting for one person' : 'allowed'
  return `${Math.min(allows, 2)} of 2 allowed — spend past the team's line needs two people`
}
