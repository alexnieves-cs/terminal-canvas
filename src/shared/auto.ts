import { buildPlan, type PlanFacts, type PlanInput } from './plan'
import { verbById } from './verb-table'

/**
 * M97. AUTO — a bounded autonomous run, as data.
 *
 * A mode is a prompt vocabulary (an opening, a continuation, the marker the
 * agent is told to print when it is done) and a TURN LIMIT that main
 * enforces beside M82's two ceilings, read live the same way. The renderer's
 * chip is a projection of main's `auto` events; nothing here is read by the
 * renderer to decide a stop, so nothing on screen can move one.
 *
 * A mode validates as a PLAN against M96's table — its prompts are `send`
 * steps — so a mode carrying a destructive verb without its confirmation
 * is refused by name (`verify:verbs auto.1`), which is the same rule M101
 * applies to a routine.
 */

export type AutoModeId = 'complete' | 'harden' | 'review' | 'custom'

export interface AutoMode {
  id: AutoModeId
  label: string
  /** What the run is for, one line — the palette row's hint. */
  hint: string
  turnLimit: number
  /** The opening prompt; `{{task}}` is the custom task. */
  opening: string
  continuation: string
  /** Verb steps the mode runs besides its prompts — empty for every built-in. */
  steps: readonly { verb: string; args: Record<string, string> }[]
}

/** The word the agent prints, alone on a line, when the work is done. */
export const AUTO_DONE_MARKER = 'AUTO-DONE'

const TAIL = `When the work is finished, print ${AUTO_DONE_MARKER} alone on its own line and stop. If you are blocked, say why and print ${AUTO_DONE_MARKER}.`

export const AUTO_MODES: Readonly<Record<AutoModeId, AutoMode>> = {
  complete: {
    id: 'complete', label: 'Complete', hint: 'finish the task this conversation is about', turnLimit: 8,
    opening: `Continue the task this conversation is about until it is complete: build what is missing, run what proves it, fix what fails. Work in bounded steps and report what changed after each. ${TAIL}`,
    continuation: `Keep going with the same task. Report what changed. ${TAIL}`,
    steps: []
  },
  harden: {
    id: 'harden', label: 'Harden', hint: 'find and fix the silent failures', turnLimit: 8,
    opening: `Harden the code this conversation is about: look for the failures that would be SILENT — an absent key read as present, an error swallowed, a count that drifts, a control that vanishes instead of refusing by name — and fix each with a check that would have caught it. ${TAIL}`,
    continuation: `Keep hardening. Name each silent failure you found and how its check catches it. ${TAIL}`,
    steps: []
  },
  review: {
    id: 'review', label: 'Review', hint: 'read and report — change nothing', turnLimit: 4,
    opening: `Review the code this conversation is about. Read; change NOTHING. Report every defect you find with the file and line, ranked by what it would silently break. ${TAIL}`,
    continuation: `Continue the review; change nothing. ${TAIL}`,
    steps: []
  },
  custom: {
    id: 'custom', label: 'Custom task…', hint: 'a task of your own, run bounded', turnLimit: 8,
    opening: `Task: {{task}}\nWork in bounded steps and report what changed after each. ${TAIL}`,
    continuation: `Keep going with the task. Report what changed. ${TAIL}`,
    steps: []
  }
}

export const AUTO_MODE_IDS: readonly AutoModeId[] = ['complete', 'harden', 'review', 'custom']

/**
 * M475. CHECK-GATED DONE. The marker is the agent's CLAIM; a run whose
 * start named a check treats it as "ready to check", runs the command in the
 * session's folder, and only a zero exit makes the run `done` with verdict
 * `checked`. A failing check sends its output back as the next turn, up to
 * `retries` times, then the run is stuck: check. A run started WITHOUT a
 * check still ends on the marker, but its verdict is `claimed` — the chip,
 * the run record and every later surface say "the agent says", never
 * "passed". The rule a reader relies on: `checked` is only ever written by
 * a check's own exit code, never by anything the agent printed.
 */
export interface AutoCheck {
  /** One shell command line, run in the session's folder (`npm test`, a build, a script). */
  command: string
  /** Failed checks sent back to the agent before the run is stuck. Absent is `AUTO_CHECK_RETRIES`. */
  retries?: number
  /** Absent is `AUTO_CHECK_TIMEOUT_MS`; a check that runs past it FAILS (it never passes by timing out). */
  timeoutMs?: number
}

export const AUTO_CHECK_RETRIES = 3
export const AUTO_CHECK_RETRIES_MAX = 10
export const AUTO_CHECK_TIMEOUT_MS = 10 * 60_000
/** How much of a failed check's output goes back to the agent: its TAIL, where a runner says why. */
export const AUTO_CHECK_FEEDBACK_CHARS = 8 * 1024

/** What a check came to. `exitCode` null is a signal or a timeout, and is a failure. */
export interface AutoCheckResult {
  exitCode: number | null
  output: string
  timedOut?: boolean
  /** The runner could not start the command at all (no shell, no folder). Also a failure. */
  error?: string
}

export type AutoVerdict = 'checked' | 'claimed'

/**
 * A check spec from the bridge, by name: absent is no check (`undefined`),
 * anything present and wrong is refused with a reason rather than read as
 * "no check" — a typo in the field would otherwise silently downgrade a
 * gated run to a claimed one.
 */
export function parseAutoCheck(raw: unknown): { kind: 'ok'; check: AutoCheck | undefined } | { kind: 'refused'; reason: string } {
  if (raw === undefined) return { kind: 'ok', check: undefined }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { kind: 'refused', reason: 'the check is not an object' }
  const r = raw as Record<string, unknown>
  if (typeof r.command !== 'string' || r.command.trim() === '') return { kind: 'refused', reason: 'the check has no command' }
  if (/[\r\n]/.test(r.command)) return { kind: 'refused', reason: 'the check command is more than one line' }
  if (r.retries !== undefined && (typeof r.retries !== 'number' || !Number.isInteger(r.retries) || r.retries < 0 || r.retries > AUTO_CHECK_RETRIES_MAX)) return { kind: 'refused', reason: `the check's retries must be a whole number from 0 to ${AUTO_CHECK_RETRIES_MAX}` }
  if (r.timeoutMs !== undefined && (typeof r.timeoutMs !== 'number' || !Number.isFinite(r.timeoutMs) || r.timeoutMs <= 0)) return { kind: 'refused', reason: "the check's timeout must be a positive number of milliseconds" }
  return { kind: 'ok', check: { command: r.command.trim(), ...(r.retries === undefined ? {} : { retries: r.retries as number }), ...(r.timeoutMs === undefined ? {} : { timeoutMs: r.timeoutMs as number }) } }
}

/** Passed means exit 0 and nothing else: a timeout, a signal, or a runner error is a failure whatever the output says. */
export function autoCheckPassed(r: AutoCheckResult): boolean {
  return r.exitCode === 0 && r.timedOut !== true && r.error === undefined
}

/** The turn a failed check sends back: the command, how it ended, and the tail of what it printed. */
export function autoCheckFeedback(command: string, r: AutoCheckResult, attempt: number, retries: number): string {
  const how = r.error !== undefined ? `could not run: ${r.error}`
    : r.timedOut === true ? 'timed out'
      : r.exitCode === null ? 'was killed by a signal'
        : `exited ${r.exitCode}`
  const out = r.output.length > AUTO_CHECK_FEEDBACK_CHARS
    ? `… (${(r.output.length - AUTO_CHECK_FEEDBACK_CHARS).toLocaleString('en-US')} earlier characters not shown)\n${r.output.slice(r.output.length - AUTO_CHECK_FEEDBACK_CHARS)}`
    : r.output
  return `The check \`${command}\` ${how}, so the task is not done yet (check ${attempt} of ${retries + 1}). Its output:\n\n${out.trim() === '' ? '(no output)' : out}\n\nFix what it reports. ${TAIL}`
}

/**
 * The step after a check, pure. `failures` counts failed checks INCLUDING
 * this one. A pass is done-checked; a failure past the retries is stuck:
 * check; a failure with retries left but no turns left is stuck: limit; else
 * the output goes back as the next turn.
 */
export type AutoAfterCheck =
  | { kind: 'done'; verdict: 'checked' }
  | { kind: 'retry'; prompt: string }
  | { kind: 'stuck'; reason: 'check' | 'limit' }

export function autoAfterCheck(check: AutoCheck, r: AutoCheckResult, failures: number, turn: number, limit: number): AutoAfterCheck {
  if (autoCheckPassed(r)) return { kind: 'done', verdict: 'checked' }
  const retries = check.retries ?? AUTO_CHECK_RETRIES
  if (failures > retries) return { kind: 'stuck', reason: 'check' }
  if (turn >= limit) return { kind: 'stuck', reason: 'limit' }
  return { kind: 'retry', prompt: autoCheckFeedback(check.command, r, failures, retries) }
}

export interface AutoPrompts { opening: string; continuation: string; limit: number }

/**
 * The prompts a run sends, with the custom task filled where the mode takes
 * one. A gated run's prompts say which check follows the marker, so the
 * agent runs it itself first instead of learning about it from a failure.
 */
export function autoPlanOf(mode: AutoModeId, _panelId: string, task = '', check?: AutoCheck): AutoPrompts {
  const m = AUTO_MODES[mode]
  const gate = check === undefined ? '' : ` After you print ${AUTO_DONE_MARKER}, \`${check.command}\` runs in this folder, and the task counts as done only if it exits 0 — run it yourself first.`
  return { opening: m.opening.split('{{task}}').join(task.trim() === '' ? '(no task given)' : task.trim()) + gate, continuation: m.continuation + gate, limit: m.turnLimit }
}

/**
 * A mode is a plan: its prompts are `send` steps on the panel it runs in,
 * and any verb step it carries is bound against the table. A destructive
 * verb without its acknowledged confirmation is refused by name — the check
 * that turns "a convention" into a rule.
 */
export function validateAutoMode(mode: AutoMode, facts: PlanFacts, panelId = facts.panels.find((p) => p.kind === 'chat')?.id ?? ''): { kind: 'ok' } | { kind: 'refused'; reason: string } {
  for (const step of mode.steps) {
    const verb = verbById(step.verb)
    if (verb === undefined) return { kind: 'refused', reason: `${mode.id} names ${step.verb}, which is not a verb` }
    if (verb.destructive) return { kind: 'refused', reason: `${mode.id} carries ${step.verb}, a destructive verb — an auto mode runs unattended and cannot confirm it` }
  }
  const inputs: PlanInput[] = [
    { verb: 'send', args: [panelId, mode.opening] },
    ...mode.steps.map((s) => ({ verb: s.verb, args: Object.values(s.args) }))
  ]
  const built = buildPlan(inputs, facts)
  if (built.kind === 'refused') return { kind: 'refused', reason: built.reason }
  if (mode.turnLimit <= 0) return { kind: 'refused', reason: `${mode.id} has no turn limit` }
  return { kind: 'ok' }
}

export type AutoState = 'running' | 'done' | 'stuck' | 'stopped'
export type AutoStuckReason = 'limit' | 'permission' | 'exit' | 'budget' | 'cap' | 'error' | 'check'

export interface AutoStatus {
  mode: AutoModeId
  turn: number
  limit: number
  state: AutoState
  reason?: AutoStuckReason
  /** M475. The gate's command, when the run named one. */
  check?: string
  /** M475. True while the check runs: the run is live, the agent is idle, nothing is sent. */
  checking?: true
  /** M475. Failed checks so far. Absent is none. */
  checkFailures?: number
  /** M475. On `done` only: `checked` when the check passed, `claimed` when there was no check. Absent on a pre-M475 record reads as claimed. */
  verdict?: AutoVerdict
}

/**
 * M475. A run record's outcome word for a done the agent only claimed. A
 * completed execution (`retained-outcomes`), never `passed`, which is the
 * word a check's exit earns.
 */
export const AUTO_CLAIMED_OUTCOME = 'done · unchecked'

/** M476. The two words a surface uses for a done run — one table, every surface. */
export const AUTO_VERDICT_WORDS: Readonly<Record<AutoVerdict, string>> = { checked: 'checked', claimed: 'agent says done' }

/** M475. The one reading of a done run: only a check's exit writes `checked`. */
export function autoVerdictOf(s: AutoStatus): AutoVerdict | undefined {
  if (s.state !== 'done') return undefined
  return s.verdict === 'checked' ? 'checked' : 'claimed'
}

const STUCK_WORDS: Record<AutoStuckReason, string> = {
  limit: 'limit reached',
  permission: 'a permission question went unanswered',
  exit: 'the agent exited',
  budget: 'the budget refused a send',
  // M350. The agent's own cap, not the canvas's budget: a different fix, so a different word.
  cap: 'cap reached',
  error: 'a turn ended in an error',
  // M475. The check kept failing past its retries: the agent's AUTO-DONE was never confirmed.
  check: 'the check kept failing'
}

/** The chip's words: one function, every surface. */
/**
 * M356. A RESOLVED chip's words in two parts, for a header that has no room:
 * the head (what the run came to) never clips, the tail (the mode, or why it
 * stuck) gives first. The whole sentence stays `autoChipWords`, on the chip's
 * title. A running chip is one part: its count is its head, and it has the
 * header to itself, because the Auto door is hidden while a run runs.
 */
export function autoChipParts(s: AutoStatus): { head: string; tail: string } {
  switch (s.state) {
    case 'running': return { head: autoChipWords(s), tail: '' }
    // M475/M476. A checked done says so; a claimed one says whose word it is;
    // a record from before M475 (no verdict) keeps its old words.
    case 'done': return { head: s.verdict === 'checked' ? 'auto checked' : s.verdict === 'claimed' ? AUTO_VERDICT_WORDS.claimed : 'auto done', tail: ` · ${s.mode}` }
    case 'stopped': return { head: 'auto stopped', tail: ` · ${s.mode}` }
    case 'stuck': return { head: 'auto stuck', tail: ` — ${s.reason === undefined ? 'no reason given' : STUCK_WORDS[s.reason]}` }
  }
}

export function autoChipWords(s: AutoStatus): string {
  switch (s.state) {
    case 'running': return s.checking === true ? `auto · ${s.mode} · checking` : `auto · ${s.mode} · ${s.turn}/${s.limit}`
    case 'done': return s.verdict === undefined ? `auto · ${s.mode} · done` : `auto · ${s.mode} · ${AUTO_VERDICT_WORDS[s.verdict]}`
    case 'stopped': return `auto · ${s.mode} · stopped`
    case 'stuck': return `auto · ${s.mode} · stuck — ${s.reason === undefined ? 'no reason given' : STUCK_WORDS[s.reason]}`
  }
}
