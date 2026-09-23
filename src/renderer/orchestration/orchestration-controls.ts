/**
 * M290. CAPABILITY-AWARE CONTROLS AND RUN LIMITS, pure.
 *
 * A control appears only where the runtime actually supports it, read off the
 * backend registry (`shared/agent-backends.ts`) and the session's recorded
 * state — never off a preference — and each one says exactly what it affects,
 * in the plan's words: Interrupt stops the current generation and promises no
 * rollback, no process termination and no resumable checkpoint; Retry PREVIEWS
 * a new turn from known context and never assumes a failed command is safe to
 * repeat. Reassign and Stop have no runtime here, so they are ABSENT — with the
 * reason kept beside the absence for the inspector's caption, because "not
 * supported" and "not built" must read differently (the palette's rule).
 *
 * A limit is labelled ENFORCED when main refuses or queues on it, ADVISORY
 * when nothing does, and names what it covers. Spend is summed only over
 * sessions whose CLI reports a dollar figure; every other session reads
 * Unknown, and no universal cap is implied across providers that report none.
 */
import { NEEDS_YOU } from '@shared/attention-words'
import { BACKENDS, type AgentBackend } from '@shared/agent-backends'
import { windowUtilization, type RateLimitState } from '@shared/rate-limit'

export type OrchControlId = 'interrupt' | 'retry' | 'reassign' | 'stop'

export interface OrchControl {
  id: 'interrupt' | 'retry'
  label: string
  /** Exactly what the control affects, and what it does not. */
  affects: string
}

export interface OrchAbsentControl {
  id: OrchControlId
  reason: string
}

export interface OrchLastTurn {
  kind: 'ok' | 'interrupted' | 'error' | 'aborted'
  at: number
  reason?: string
}

export interface OrchControlInput {
  kind: string
  title: string
  /** Absent for a terminal or a non-agent panel. */
  backend?: AgentBackend
  /** The roster word: busy · starting · wants-you · idle · exited … */
  state: string
  /** The session's last recorded turn end, when the chat store has one. */
  lastTurn?: OrchLastTurn
  /** The last prompt the person sent, for a retry preview; absent means nothing to retry from. */
  lastPrompt?: string
}

const GENERATING = new Set(['busy', 'starting', 'wants-you'])

export function orchControls(input: OrchControlInput): { controls: OrchControl[]; absent: OrchAbsentControl[] } {
  const controls: OrchControl[] = []
  const absent: OrchAbsentControl[] = []
  const isChat = input.kind === 'chat' && input.backend !== undefined
  const row = input.backend === undefined ? undefined : BACKENDS[input.backend]
  // Interrupt
  if (isChat && row !== undefined && row.interrupts && GENERATING.has(input.state)) {
    controls.push({ id: 'interrupt', label: 'Interrupt', affects: `stops the current generation in ${input.title} only — the process stays up, nothing it wrote is rolled back, and no resumable checkpoint is kept` })
  } else if (isChat && row !== undefined && !row.interrupts) {
    absent.push({ id: 'interrupt', reason: row.reasons.noInterrupt })
  } else if (isChat) {
    absent.push({ id: 'interrupt', reason: 'nothing is generating — there is no turn to interrupt' })
  } else {
    absent.push({ id: 'interrupt', reason: input.kind === 'terminal' ? 'a terminal has no interrupt door here — Ctrl-C in its own panel is the only one' : 'not a session' })
  }
  // Retry: a preview, never a send.
  const failed = input.state === 'exited' || (input.lastTurn !== undefined && input.lastTurn.kind !== 'ok')
  if (isChat && row !== undefined && row.resumes && failed && input.lastPrompt !== undefined && input.lastPrompt !== '') {
    controls.push({ id: 'retry', label: 'Retry…', affects: `previews a new turn in ${input.title} from its last prompt and known context; it sends nothing until you send it on the canvas, and a command that failed is not assumed safe to repeat` })
  } else if (isChat && row !== undefined && !row.resumes) {
    absent.push({ id: 'retry', reason: `${row.label} cannot resume a conversation, so there is no known context to retry from` })
  } else if (isChat && !failed) {
    absent.push({ id: 'retry', reason: 'the last turn ended normally — there is nothing to retry' })
  } else if (isChat) {
    absent.push({ id: 'retry', reason: 'no prompt of yours is recorded to retry from' })
  } else {
    absent.push({ id: 'retry', reason: input.kind === 'terminal' ? 'a failed command is never re-run from here — it is not assumed safe to repeat' : 'not a session' })
  }
  absent.push({ id: 'reassign', reason: 'no runtime here can move a running session to another teammate' })
  absent.push({ id: 'stop', reason: isChat && row !== undefined && !row.interrupts ? row.reasons.noInterrupt : 'no runtime here stops a session while reporting its surviving child processes — close the panel on the canvas to end it' })
  return { controls, absent }
}

/** The retry PREVIEW: what would be sent, to whom, from where. Nothing is sent. */
export interface OrchRetryPreview {
  target: string
  backend: string
  cwd: string | undefined
  prompt: string
  note: string
}

export function orchRetryPreview(input: { title: string; backend: AgentBackend; cwd?: string; lastPrompt: string; lastTurn?: OrchLastTurn }): OrchRetryPreview {
  const why = input.lastTurn === undefined ? 'the session exited' : input.lastTurn.kind === 'interrupted' ? 'the last turn was interrupted' : input.lastTurn.kind === 'aborted' ? `the last turn was aborted (${input.lastTurn.reason ?? 'no reason recorded'})` : input.lastTurn.kind === 'error' ? 'the last turn ended in an error' : 'the last turn ended normally'
  return {
    target: input.title,
    backend: BACKENDS[input.backend].label,
    cwd: input.cwd,
    prompt: input.lastPrompt,
    note: `${why}. Sending again resumes the same conversation on ${BACKENDS[input.backend].label}; anything the failed turn already ran is not undone, and is not assumed safe to run twice.`
  }
}

/* ── Standing: stopped, interrupted, unknown spend — kept apart ─────────── */

export type OrchStandingKind = 'running' | 'idle' | 'stopped' | 'interrupted' | 'aborted' | 'errored' | 'waiting'

export function orchSessionStanding(input: { state: string; exitCode?: number | null; lastTurn?: OrchLastTurn }): { kind: OrchStandingKind; word: string } {
  const cut = input.lastTurn !== undefined && (input.lastTurn.kind === 'interrupted' || (input.lastTurn.kind === 'aborted' && input.lastTurn.reason === 'interrupt-timeout'))
  if (input.state === 'wants-you') return { kind: 'waiting', word: NEEDS_YOU } // 4.1: the one state word
  if (GENERATING.has(input.state)) return { kind: 'running', word: 'running — a turn is in flight' }
  // An interrupt the CLI answered leaves a partial turn; one it ignored ends in
  // main's kill (interrupt-timeout) and the process is gone until the next send.
  // Either way the fact a person needs is that the run was CUT SHORT — not that
  // the session is stopped, and not that it is merely idle.
  if (cut) return { kind: 'interrupted', word: `interrupted — the last turn was cut short${input.lastTurn?.kind === 'aborted' ? ' (the CLI ignored the interrupt and main killed the process)' : ''}; the conversation resumes on the next message` }
  if (input.state === 'exited') return { kind: 'stopped', word: `stopped — the session exited${input.exitCode === undefined || input.exitCode === null ? '' : ` (${input.exitCode})`}` }
  const t = input.lastTurn
  if (t?.kind === 'aborted') return { kind: 'aborted', word: `aborted — ${t.reason ?? 'no reason recorded'}; the session is still up` }
  if (t?.kind === 'error') return { kind: 'errored', word: 'errored — the last turn failed; the session is still up' }
  return { kind: 'idle', word: 'idle' }
}

/* ── Spend and limits ───────────────────────────────────────────────────── */

export interface OrchSpendInput {
  backend?: AgentBackend
  costUsd?: number
}

/** One session's spend, or Unknown with the reason. */
export function orchSpendWord(s: OrchSpendInput): { known: boolean; word: string } {
  if (s.backend === undefined) return { known: false, word: 'Unknown — not an agent session' }
  const row = BACKENDS[s.backend]
  if (!row.reportsCost) return { known: false, word: `Unknown — ${row.label} reports no cost` }
  if (s.costUsd === undefined) return { known: false, word: `Unknown — ${row.label} has reported nothing yet this launch` }
  return { known: true, word: `$${s.costUsd.toFixed(2)} reported by ${row.label}` }
}

export type OrchLimitKind = 'enforced' | 'advisory'

export interface OrchLimitRow {
  id: 'concurrency' | 'spend' | 'window' | 'time'
  kind: OrchLimitKind
  label: string
  value: string
  /** What the limit covers, and what it does not. */
  coverage: string
}

export interface OrchLimitsInput {
  maxConcurrent: number
  budgetUsd: number
  budgetWindowPercent: number
  /** Agent chat sessions with a turn in flight now. */
  inFlight: number
  sessions: readonly OrchSpendInput[]
  rateLimit: RateLimitState
}

export function orchLimits(input: OrchLimitsInput): OrchLimitRow[] {
  const spends = input.sessions.map(orchSpendWord)
  const known = input.sessions.filter((_s, i) => spends[i]!.known)
  const spent = known.reduce((sum, s) => sum + (s.costUsd ?? 0), 0)
  const unknown = input.sessions.length - known.length
  const util = windowUtilization(input.rateLimit)
  return [
    {
      id: 'concurrency',
      kind: input.maxConcurrent > 0 ? 'enforced' : 'advisory',
      label: 'Concurrency',
      value: input.maxConcurrent > 0 ? `${input.inFlight} of ${input.maxConcurrent} turns in flight` : `${input.inFlight} in flight · no ceiling set`,
      coverage: input.maxConcurrent > 0
        ? 'agent chat sessions on this canvas — main queues a send past the ceiling (agents.maxConcurrent); terminals and watchers are not counted'
        : 'nothing queues — set agents.maxConcurrent to make this enforced'
    },
    {
      id: 'spend',
      kind: input.budgetUsd > 0 ? 'enforced' : 'advisory',
      label: 'Spend',
      value: `${known.length > 0 ? `$${spent.toFixed(2)}` : 'Unknown'}${input.budgetUsd > 0 ? ` of $${input.budgetUsd.toFixed(2)}` : ''}${unknown > 0 ? ` · ${unknown} session${unknown === 1 ? '' : 's'} unknown` : ''}`,
      coverage: input.budgetUsd > 0
        ? `sessions whose CLI reports a dollar figure (${known.length} of ${input.sessions.length} here) — main refuses their next send past the budget; the ${unknown} unknown ${unknown === 1 ? 'is' : 'are'} not counted and not capped`
        : `a sum over the ${known.length} session${known.length === 1 ? '' : 's'} that report cost; nothing refuses on it — set agents.budgetUsd to make this enforced`
    },
    {
      id: 'window',
      kind: input.budgetWindowPercent > 0 ? 'enforced' : 'advisory',
      label: 'Usage window',
      value: util === undefined ? 'no usage window reported yet' : `${Math.round(util * 100)}% used${input.budgetWindowPercent > 0 ? ` · stops at ${input.budgetWindowPercent}%` : ''}`,
      coverage: input.budgetWindowPercent > 0
        ? 'the subscription windows the claude CLI reports — main refuses a send past the percentage; providers that report no window are not covered'
        : 'read from the claude CLI\'s rate-limit events only; nothing refuses on it'
    },
    {
      id: 'time',
      kind: 'advisory',
      label: 'Time',
      value: 'no time limit',
      coverage: 'no runtime here enforces a wall-clock limit on a task or a turn; an interrupt is the only stop'
    }
  ]
}
