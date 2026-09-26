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

export interface AutoPrompts { opening: string; continuation: string; limit: number }

/** The prompts a run sends, with the custom task filled where the mode takes one. */
export function autoPlanOf(mode: AutoModeId, _panelId: string, task = ''): AutoPrompts {
  const m = AUTO_MODES[mode]
  return { opening: m.opening.split('{{task}}').join(task.trim() === '' ? '(no task given)' : task.trim()), continuation: m.continuation, limit: m.turnLimit }
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
export type AutoStuckReason = 'limit' | 'permission' | 'exit' | 'budget' | 'cap' | 'error'

export interface AutoStatus {
  mode: AutoModeId
  turn: number
  limit: number
  state: AutoState
  reason?: AutoStuckReason
}

const STUCK_WORDS: Record<AutoStuckReason, string> = {
  limit: 'limit reached',
  permission: 'a permission question went unanswered',
  exit: 'the agent exited',
  budget: 'the budget refused a send',
  // M350. The agent's own cap, not the canvas's budget: a different fix, so a different word.
  cap: 'cap reached',
  error: 'a turn ended in an error'
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
    case 'done': return { head: 'auto done', tail: ` · ${s.mode}` }
    case 'stopped': return { head: 'auto stopped', tail: ` · ${s.mode}` }
    case 'stuck': return { head: 'auto stuck', tail: ` — ${s.reason === undefined ? 'no reason given' : STUCK_WORDS[s.reason]}` }
  }
}

export function autoChipWords(s: AutoStatus): string {
  switch (s.state) {
    case 'running': return `auto · ${s.mode} · ${s.turn}/${s.limit}`
    case 'done': return `auto · ${s.mode} · done`
    case 'stopped': return `auto · ${s.mode} · stopped`
    case 'stuck': return `auto · ${s.mode} · stuck — ${s.reason === undefined ? 'no reason given' : STUCK_WORDS[s.reason]}`
  }
}
