import { insideDirectory } from './work-scope'
import { sameReviewIdentity, type ReviewIdentity } from './review-identity'
import type { RunRow } from './run-ledger'
import type { TranscriptTurn } from './transcript'
import { reportedCommands } from './review-readiness'

/**
 * M286. REVISION-BOUND CHECK EVIDENCE — one record per check, saying what
 * ran, where, how it ended, when, and WHICH CONTENT it tested.
 *
 * This is M201's evidence (`review-readiness.ts`) carried one step further.
 * That module says who witnessed a command end; this one binds the outcome
 * to the M285 identity the subject had at that moment, so a green result
 * against an earlier diff can be told apart from a green result against
 * this one. The plan's sentence: *a result against an earlier revision must
 * not authorize the latest diff.*
 *
 * TWO SOURCES, BOTH THIS APP'S OWN. A ledger row is a command main watched
 * exit on a PTY and stamped with the subject's identity as the exit landed
 * (`pty-manager.ts`); a watcher outcome is a process main itself spawned and
 * stamped the same way (`watch-runner.ts`). Nothing here reads agent prose:
 * a command an agent asked for in its transcript is a `CheckClaim`, kept in
 * its own list with the word "claim" on it, and is never a `CheckRecord` —
 * a surface that showed the two as one row would put this app's name on
 * somebody else's answer.
 *
 * NO WORD IS DERIVED FROM THE COMMAND'S TEXT. `npm test` exiting 0 is
 * "exit 0", never a verdict about the tests: this module has no list of
 * test runners, and `checkWords` never says "tests" or "passed" about
 * anything (check-fresh.2 scans this file for the verdict wording).
 * The reviewer reads the command; the record says how it ended.
 *
 * `observed` is what happened; `outcome` is what it means NOW. They differ
 * in exactly one direction — a passed or failed observation whose tested
 * identity is no longer the subject's becomes `stale` — and the record keeps
 * both, so a stale exit 1 still shows the exit code that a reviewer wants.
 *
 * Pure: no DOM, no React, no electron. `verify:review check-fresh.1–.4`.
 */

/** The six outcomes the plan names. `stale` is only ever assigned by `bindCheckFreshness`. */
export type CheckOutcome = 'passed' | 'failed' | 'running' | 'not-run' | 'unknown' | 'stale'

/** What happened, before freshness is applied. Never `stale`. */
export type CheckObserved = Exclude<CheckOutcome, 'stale'>

export interface CheckContext {
  cwd: string
  /** The branch of the recorded worktree `cwd` is inside, when it is inside one. Absent for a shared directory. */
  worktree?: string
}

export interface CheckRecord {
  /** Stable across re-reads of the same row: source, panel and start time. */
  key: string
  source: 'ledger' | 'watcher'
  panelId: string
  command: string
  context: CheckContext
  observed: CheckObserved
  outcome: CheckOutcome
  /** Present when a code was read; `null` when the process ended by signal or its end was lost. */
  exitCode?: number | null
  at: number
  /** The M285 identity the subject had when this ended; absent when main could not read one, or the row predates M286. */
  tested?: ReviewIdentity
  /** Why `outcome` is what it is when it is not simply `observed`, in words a surface can show. */
  note?: string
  /** M306. This run's exact-output record (`check:output`). Absent before M306 and when capture was not wired. */
  outputId?: string
}

/** A command the agent ASKED FOR, as its CLI reported it. Not a result; labelled as a claim wherever it is shown. */
export interface CheckClaim {
  command: string
  claimed: 'ok' | 'error' | 'unanswered'
  at: number
  /** Who says so, in words. */
  source: string
}

export interface CheckSources {
  /** False when this app could not read its own ledger. */
  ledgerRead: boolean
  /** How many panels' ledgers were asked. Zero is "nowhere to read from", not "nothing ran". */
  ledgerPanels: number
  /** False when the lane's conversation is closed, so no claims were looked for. */
  transcriptRead: boolean
}

export interface CheckEvidence {
  checks: CheckRecord[]
  claims: CheckClaim[]
  /** Present only when there is nothing to show: sentences naming WHICH kind of nothing, never an empty list alone. */
  unavailable?: string[]
}

const observedOf = (exitCode: number | null): CheckObserved => (exitCode === null ? 'unknown' : exitCode === 0 ? 'passed' : 'failed')

/**
 * The ledger's rows as checks. `lanePath` narrows to the lane by
 * `insideDirectory` (M196's rule, so `/w/lane` cannot claim `/w/lane-old`);
 * `undefined` keeps every row, for a subject that is a session rather than a
 * lane. A row with no exit code is `unknown`, never passed — the row is
 * written at the command's END, so a null code is a lost end, not a run in
 * progress.
 */
export function checksFromLedger(
  rows: readonly RunRow[],
  lanePath: string | undefined,
  worktreeOf: (cwd: string) => string | undefined = () => undefined
): CheckRecord[] {
  const out: CheckRecord[] = []
  for (const row of rows) {
    if (lanePath !== undefined && (row.cwd === '' || !insideDirectory(lanePath, row.cwd))) continue
    const observed = observedOf(row.exitCode)
    const worktree = worktreeOf(row.cwd)
    out.push({
      key: `ledger:${row.panelId}:${row.startedAt}`,
      source: 'ledger',
      panelId: row.panelId,
      command: row.command,
      context: { cwd: row.cwd, ...(worktree === undefined ? {} : { worktree }) },
      observed,
      outcome: observed,
      exitCode: row.exitCode,
      at: row.endedAt === 0 ? row.startedAt : row.endedAt,
      ...(row.tested === undefined ? {} : { tested: row.tested }),
      ...(row.outputId === undefined ? {} : { outputId: row.outputId })
    })
  }
  return out
}

/** What a watcher panel's record and its last run look like to this module. */
export interface WatcherCheckInput {
  id: string
  cwd: string
  command: string
  args: readonly string[]
  status: 'not-started' | 'running' | 'passed' | 'exited'
  exitCode?: number | null
  signal?: string | null
  startedAt?: number
  endedAt?: number
  tested?: ReviewIdentity
  /** M306. The last run's exact-output record. */
  outputId?: string
}

/**
 * Watcher outcomes as checks. `not-started` is `not-run` — a check that
 * exists and has not happened, which is a different fact from one that
 * ended with no code. A signalled exit is `failed`: `code` is null for a
 * signalled process, and `exited` with a null code would otherwise read as
 * `unknown` beside a process somebody killed (`watch-runner.ts`'s rule).
 */
export function checksFromWatchers(
  watchers: readonly WatcherCheckInput[],
  lanePath: string | undefined,
  worktreeOf: (cwd: string) => string | undefined = () => undefined
): CheckRecord[] {
  const out: CheckRecord[] = []
  for (const w of watchers) {
    if (lanePath !== undefined && (w.cwd === '' || !insideDirectory(lanePath, w.cwd))) continue
    const observed: CheckObserved =
      w.status === 'not-started' ? 'not-run'
        : w.status === 'running' ? 'running'
          : w.status === 'passed' ? 'passed'
            : w.signal !== undefined && w.signal !== null ? 'failed'
              : observedOf(w.exitCode ?? null)
    const worktree = worktreeOf(w.cwd)
    out.push({
      key: `watcher:${w.id}:${w.startedAt ?? 0}`,
      source: 'watcher',
      panelId: w.id,
      command: [w.command, ...w.args].join(' '),
      context: { cwd: w.cwd, ...(worktree === undefined ? {} : { worktree }) },
      observed,
      outcome: observed,
      ...(w.exitCode === undefined ? {} : { exitCode: w.exitCode }),
      at: w.endedAt ?? w.startedAt ?? 0,
      ...(w.tested === undefined ? {} : { tested: w.tested }),
      // A running watcher's id names a record not written yet; only a finished run links one.
      ...(w.outputId === undefined || w.status === 'running' || w.status === 'not-started' ? {} : { outputId: w.outputId })
    })
  }
  return out
}

/**
 * The binding. For every passed or failed record, the subject's identity
 * NOW against the record's own base is asked for through `currentOf`:
 *
 *   - the same identity → the outcome stands;
 *   - a different one → `stale`, with the exit code kept and a note;
 *   - `undefined` (main could not read the tree) → `unknown`, because a
 *     result this app cannot place against the current content authorizes
 *     nothing;
 *   - `null` (not yet asked) → the outcome stands with a note saying
 *     freshness has not been read, so a surface never shows a green it has
 *     not checked without saying so.
 *
 * A record with no `tested` identity at all — written before M286, or when
 * the stamp could not be read — is `unknown` for the same reason: it may be
 * a perfectly good exit 0, and nobody can say of what.
 *
 * Running, not-run and unknown records pass through untouched: there is no
 * result to be stale.
 */
export function bindCheckFreshness(
  checks: readonly CheckRecord[],
  /** The subject's identity NOW for a tested base, in the check's own directory — two lanes can share a base sha. */
  currentOf: (base: string, cwd: string) => ReviewIdentity | undefined | null
): CheckRecord[] {
  return checks.map((c) => {
    if (c.observed !== 'passed' && c.observed !== 'failed') return c
    if (c.tested === undefined) return { ...c, outcome: 'unknown', note: 'the content it tested was not recorded, so this result cannot be placed against the changes' }
    const now = currentOf(c.tested.base, c.context.cwd)
    if (now === null) return { ...c, note: 'freshness not read yet' }
    if (now === undefined) return { ...c, outcome: 'unknown', note: 'the changes could not be re-read, so whether this result is about them is unknown' }
    if (sameReviewIdentity(now, c.tested)) return { ...c, outcome: c.observed }
    return { ...c, outcome: 'stale', note: `tested an earlier version of the changes (exit ${c.exitCode === null || c.exitCode === undefined ? '?' : String(c.exitCode)}) — the changes have moved since` }
  })
}

/**
 * The record's word for a surface. Exit codes, never verdicts: "exit 0" is
 * a fact about a process, "passed" would be a claim about what the process
 * was for. `stale` carries its exit code so a stale failure is still read
 * as a failure that happened.
 */
export function checkWords(c: CheckRecord): string {
  const exit = c.exitCode === undefined || c.exitCode === null ? 'no exit code' : `exit ${String(c.exitCode)}`
  switch (c.outcome) {
    case 'passed': return exit
    case 'failed': return c.exitCode === undefined || c.exitCode === null ? 'ended by signal' : exit
    case 'running': return 'running'
    case 'not-run': return 'not run'
    case 'stale': return `stale · ${exit} at an earlier revision`
    default: return c.exitCode === undefined || c.exitCode === null ? 'no result' : `${exit} · revision unknown`
  }
}

/** The agent's own commands, from its transcript — claims, in their own type. */
export function claimsFromTranscript(turns: readonly TranscriptTurn[]): CheckClaim[] {
  return reportedCommands(turns).map((c) => ({
    command: c.command,
    claimed: c.outcome === 'passed' ? 'ok' : c.outcome === 'failed' ? 'error' : 'unanswered',
    at: c.at,
    source: 'the agent asked for this and its CLI reported the result — a claim, not a check this app ran'
  }))
}

const RANK: Record<CheckOutcome, number> = { failed: 0, stale: 1, running: 2, unknown: 3, 'not-run': 4, passed: 5 }

/**
 * One list, failures first, then stale, running, unknown, not run, passes;
 * newest first within each. The empty arm is SENTENCES, and which sentences
 * depends on what was looked at — "nothing ran" and "nobody could look" are
 * different facts (readiness.5's rule, kept).
 */
export function checkEvidence(checks: readonly CheckRecord[], claims: readonly CheckClaim[], sources: CheckSources): CheckEvidence {
  const sorted = [...checks].sort((a, b) => (RANK[a.outcome] - RANK[b.outcome]) || (b.at - a.at))
  const out: CheckEvidence = { checks: sorted, claims: [...claims].sort((a, b) => b.at - a.at) }
  if (sorted.length > 0) return out
  const unavailable: string[] = []
  if (!sources.ledgerRead) unavailable.push('this canvas could not read its own record of what it ran')
  else if (sources.ledgerPanels === 0) unavailable.push('no session on this canvas could have recorded a command for this subject, so there is nowhere to read checks from')
  else unavailable.push('no checks have run here — this canvas recorded no command and no watcher run for this subject')
  if (!sources.transcriptRead) unavailable.push('the conversation is closed, so the commands it asked for were not looked for')
  return { ...out, unavailable }
}
