import { BACKENDS, type AgentBackend } from './agent-backends'
import { outward } from './outward'
import type { PermissionMode } from './cost'
import { PERMISSION_MODE_WORDS } from './toolbox'

/**
 * M319. BACKEND FIT — whether the backend a person chose can do THIS task,
 * answered before anything is minted.
 *
 * The registry (`agent-backends.ts`) has long held the facts: codex has no
 * interrupt, copilot asks no permission, only claude takes an appended
 * prompt. What it never did was meet a TASK. Start work had no backend
 * choice at all — every dispatched lane was claude by omission — and the
 * spawn sheet's capability sentence listed every fact about a row whether or
 * not the task in hand needed it. A person could invest a session in a
 * backend that would silently drop the lane's rules (no appended prompt), run
 * past a budget it cannot see (no cost) or ignore Interrupt, and learn it
 * mid-task.
 *
 * Four rules, each a silent failure without it:
 *
 *  - **A requirement is REQUIRED or WANTED, and only a required one refuses.**
 *    An arrangement's seats ARE appended prompts; without one a reviewer seat
 *    is a second implementer. That refuses. A solo lane's rules can ride the
 *    first message instead — weaker (the CLI's deny list does not come with
 *    it), so it is stated, not refused.
 *  - **Only the facts THIS task needs are listed.** A row the task does not
 *    touch is noise that hides the one that matters.
 *  - **Unknown stays unknown.** A backend that reports no cost is never a
 *    figure of $0 and never "within budget": the budget simply does not see
 *    it, and the fit says so before the first turn.
 *  - **Stopping is three different acts.** Interrupt ends the turn and keeps
 *    the process and conversation; cancel stops what has not started yet;
 *    terminate ends the process. One word for all three is how a person
 *    "stops" a codex turn and discovers it kept writing.
 *
 * Pure except `outward` (the text gate) — plain-node tier
 * (`verify:agent-session fit.*`, `stop.*`, `handoff.*`, `resume-lost.*`).
 */

export type TaskRequirementId =
  | 'cli'
  | 'prompt'
  | 'no-publish'
  | 'interrupt'
  | 'resume'
  | 'images'
  | 'cost'
  | 'window'
  | 'permissions'
  | 'read-only'

export type RequirementLevel = 'required' | 'wanted'

export interface TaskRequirement {
  id: TaskRequirementId
  level: RequirementLevel
  /** Why THIS task needs it, in the task's own terms. */
  why: string
}

/** What a task asks of its backend, as the Start work sheet knows it before a start. */
export interface TaskNeedsInput {
  /** An arrangement (swarm) — its seats are appended prompts. */
  swarm?: boolean
  /** A dispatched lane: the no-publish rules ride an appended prompt. Absent is a plain chat. */
  lane?: boolean
  /** agents.budgetUsd — a dollar ceiling the person set. */
  budgetUsd?: number
  /** agents.budgetWindowPercent — the usage-window ceiling. */
  windowPercent?: number
  /** The brief, the criteria or the recipe call for a screenshot or an image. */
  images?: boolean
  /** The task must not change the tree (a review recipe). */
  readOnly?: boolean
  /** Long enough that it may need stopping mid-turn — every dispatched task is. */
  longRunning?: boolean
}

/** Whether a brief names an image as input — a pasted screenshot, a mock, a design. */
export function briefWantsImages(text: string): boolean {
  return /\b(screenshot|screen shot|mock-?up|mock|image|png|jpe?g|figma|design comp)\b/i.test(text)
}

/** Whether a brief or recipe says the tree must not change. */
export function briefIsReadOnly(text: string): boolean {
  return /\b(do not (change|modify|edit) (the )?code|no edits|read-only|nothing in the working tree was modified)\b/i.test(text)
}

/** The requirements a task has, in a stable order (the order the sheet lists them). */
export function taskRequirements(input: TaskNeedsInput): TaskRequirement[] {
  const out: TaskRequirement[] = [{ id: 'cli', level: 'required', why: 'the CLI must be on the login PATH to start at all' }]
  if (input.swarm === true) out.push({ id: 'prompt', level: 'required', why: 'each seat of an arrangement is its role, carried as an appended system prompt' })
  else if (input.lane === true) out.push({ id: 'prompt', level: 'wanted', why: 'the lane\'s rules (stay in the worktree, never push) are an appended system prompt' })
  if (input.lane === true || input.swarm === true) out.push({ id: 'no-publish', level: 'wanted', why: '"never push, never merge" is enforced by the CLI\'s tool deny list, not only asked' })
  if (input.longRunning !== false && (input.lane === true || input.swarm === true)) out.push({ id: 'interrupt', level: 'wanted', why: 'a long task may need stopping mid-turn without losing the conversation' })
  if (input.lane === true || input.swarm === true) out.push({ id: 'resume', level: 'wanted', why: 'recovery after a restart continues the same conversation' })
  if (input.images === true) out.push({ id: 'images', level: 'wanted', why: 'the brief refers to an image or screenshot' })
  if (input.budgetUsd !== undefined && input.budgetUsd > 0) out.push({ id: 'cost', level: 'wanted', why: `a $${input.budgetUsd.toFixed(2)} budget is set — it can only stop what reports a cost` })
  if (input.windowPercent !== undefined && input.windowPercent > 0) out.push({ id: 'window', level: 'wanted', why: `a usage-window ceiling of ${input.windowPercent}% is set` })
  if (input.readOnly === true) out.push({ id: 'read-only', level: 'wanted', why: 'the task must not change the tree' })
  if (input.lane === true || input.swarm === true) out.push({ id: 'permissions', level: 'wanted', why: 'a person approves commands as they run' })
  return out
}

export interface FitRow {
  id: TaskRequirementId
  level: RequirementLevel
  ok: boolean
  /** One sentence: what this backend does for this requirement, in the vendor's own terms. */
  line: string
}

export type FitVerdict = 'fits' | 'degraded' | 'refused'

export interface BackendFit {
  backend: AgentBackend
  verdict: FitVerdict
  rows: FitRow[]
  /** The first unmet REQUIRED row's sentence — what disables Start. */
  refusal?: string
}

/**
 * Which CLIs stream account usage windows (`rate-limit.ts` reads claude's
 * `rate_limit_event`; no other recorded stream has one). A table keyed by
 * EVERY backend rather than a comparison to a literal — `registry.1` — so a
 * fifth row fails to compile until someone measures it.
 */
const REPORTS_WINDOW: Readonly<Record<AgentBackend, boolean>> = { claude: true, codex: false, copilot: false, acp: false }

/** The one sentence a requirement gets for a backend, met or not. */
function rowLine(backend: AgentBackend, id: TaskRequirementId, available: boolean, mode?: PermissionMode | null): { ok: boolean; line: string } {
  const row = BACKENDS[backend]
  switch (id) {
    case 'cli': return available ? { ok: true, line: `${row.binary} is on the login PATH` } : { ok: false, line: row.reasons.noCli }
    case 'prompt': return row.appendsPrompt
      ? { ok: true, line: `${row.label} takes an appended system prompt` }
      : { ok: false, line: row.reasons.noPrompt }
    case 'no-publish': return row.appendsPrompt
      ? { ok: true, line: `${row.label} is started with git push / merge and gh pr create / merge denied` }
      : { ok: false, line: `${row.label} has no deny list here — "never push" is only asked in the first message` }
    case 'interrupt': return row.interrupts
      ? { ok: true, line: `Interrupt ends ${row.label}'s turn and keeps the conversation` }
      : { ok: false, line: `${row.reasons.noInterrupt} — ending the process is the only stop` }
    case 'resume': return row.resumes
      ? { ok: true, line: `${row.label} resumes the same conversation after a restart` }
      : { ok: false, line: `${row.label} cannot resume — a restart starts a new conversation` }
    case 'images': return row.images
      ? { ok: true, line: `${row.label} takes an image in a message` }
      : { ok: false, line: row.reasons.noImages }
    case 'cost': return row.reportsCost
      ? { ok: true, line: `${row.label} reports a dollar figure, so the budget can stop it` }
      : { ok: false, line: `${row.label} reports no cost — its spend is Unknown and the budget cannot stop it` }
    case 'window': return REPORTS_WINDOW[backend]
      ? { ok: true, line: `${row.label} reports its usage windows, so the ceiling applies` }
      : { ok: false, line: `${row.label} reports no usage window — the ceiling does not apply to it` }
    case 'read-only': return row.sandboxArgs !== undefined
      ? { ok: true, line: `${row.label} has a read-only mode (the brief is still the only rule inside a lane)` }
      : { ok: false, line: row.reasons.noSandbox }
    // M403 (B5). "Asks" was promised unconditionally, but the app passes no
    // --permission-mode: the person's settings decide. A mode that does not
    // ask (auto, dontAsk, bypassPermissions) is said as what it is, and the
    // row is unmet — the task wanted a person approving commands.
    case 'permissions':
      if (!row.asksPermission) return { ok: false, line: row.reasons.noPermissions }
      if (mode !== undefined && mode !== null && !PERMISSION_MODE_WORDS[mode].asks) return { ok: false, line: `${row.label} ${PERMISSION_MODE_WORDS[mode].does} — ${mode} mode, from your settings` }
      return { ok: true, line: `${row.label} asks before a command runs` }
  }
}

/**
 * The fit of one backend to one task. `available` is discovery's answer for
 * the backend's CLI; absent reads as available (a caller with no discovery,
 * e.g. a check) — never as absent, which would refuse every start.
 */
export function backendFit(backend: AgentBackend, requirements: readonly TaskRequirement[], available = true, mode?: PermissionMode | null): BackendFit {
  const rows: FitRow[] = requirements.map((r) => ({ id: r.id, level: r.level, ...rowLine(backend, r.id, available, mode) }))
  const refusedRow = rows.find((r) => r.level === 'required' && !r.ok)
  const degraded = rows.some((r) => r.level === 'wanted' && !r.ok)
  return {
    backend,
    verdict: refusedRow !== undefined ? 'refused' : degraded ? 'degraded' : 'fits',
    rows,
    ...(refusedRow === undefined ? {} : { refusal: refusedRow.line })
  }
}

/** The one-line summary a picker row carries: `fits`, or what it gives up. */
export function fitSummary(fit: BackendFit): string {
  const label = BACKENDS[fit.backend].label
  if (fit.verdict === 'refused') return `${label} cannot do this task — ${fit.refusal ?? 'a requirement is not met'}`
  const lost = fit.rows.filter((r) => !r.ok).map((r) => FIT_WORDS[r.id])
  return lost.length === 0 ? `${label} can do everything this task needs` : `${label} can do this task without ${lost.join(', ')}`
}

const FIT_WORDS: Record<TaskRequirementId, string> = {
  cli: 'its CLI',
  prompt: 'an appended prompt',
  'no-publish': 'an enforced no-push rule',
  interrupt: 'a graceful interrupt',
  resume: 'resume',
  images: 'images',
  cost: 'a known cost',
  window: 'a usage window',
  'read-only': 'a read-only mode',
  permissions: 'permission prompts'
}

/* ── Stopping: three different acts ─────────────────────────────────────── */

export type StopKind = 'interrupt' | 'cancel' | 'terminate'

export interface StopOption {
  kind: StopKind
  label: string
  available: boolean
  /** What happens — to the turn, the process and the conversation — or why it is not available. */
  effect: string
}

/**
 * The three stops, for one session in one state. `queued` is the messages
 * waiting behind the turn in flight; `generating` whether a turn is in flight.
 */
export function stopOptions(backend: AgentBackend, state: { generating: boolean; queued: number; /** Whether a process is up at all; absent reads as up. */ processUp?: boolean }): StopOption[] {
  const row = BACKENDS[backend]
  const interrupt: StopOption = row.interrupts
    ? state.generating
      ? { kind: 'interrupt', label: 'Interrupt', available: true, effect: `ends the current turn — ${row.label} stays up, the conversation continues on the next message, and nothing already written is rolled back` }
      : { kind: 'interrupt', label: 'Interrupt', available: false, effect: 'nothing is generating — there is no turn to interrupt' }
    : { kind: 'interrupt', label: 'Interrupt', available: false, effect: row.reasons.noInterrupt }
  const cancel: StopOption = state.queued > 0
    ? { kind: 'cancel', label: `Cancel ${state.queued} queued`, available: true, effect: `drops the ${state.queued === 1 ? 'message' : `${state.queued} messages`} waiting behind this turn — the turn in flight is not touched` }
    : { kind: 'cancel', label: 'Cancel queued', available: false, effect: 'nothing is queued behind this turn' }
  const terminate: StopOption = state.processUp === false ? {
    kind: 'terminate',
    label: 'End process',
    available: false,
    effect: `${row.label} has no process running — the next message starts one`
  } : {
    kind: 'terminate',
    label: 'End process',
    available: true,
    effect: `kills ${row.label}'s process${state.generating ? ' mid-turn (the turn is lost; files it already wrote stay written)' : ''}; ${row.resumes ? 'the next message starts a new process on the same conversation' : 'the conversation cannot be resumed'} — child processes it started are not tracked and may survive`
  }
  return [interrupt, cancel, terminate]
}

/* ── A failed resume, recognised ────────────────────────────────────────── */

/**
 * The measured way each CLI says "that conversation does not exist" when it
 * is asked to resume it (`scripts/fixtures/agent-session/*-resume-fail.*`,
 * recorded 2026-09-23 against claude 2.1.281, codex-cli 0.156.1 and
 * GitHub Copilot CLI 1.0.87). claude answers in-stream (a `result` with
 * `errors`); codex and copilot print to stderr and exit 1 with no stream.
 *
 * Why it matters: the manager resumed on EVERY spawn after the first, so a
 * conversation the CLI had pruned (claude cleans old sessions) failed again
 * on every message, and the panel said "the next message resumes the
 * conversation" over each failure.
 */
const RESUME_LOST: Readonly<Record<AgentBackend, RegExp | null>> = {
  claude: /No conversation found with session ID:?\s*([\w-]+)?/,
  codex: /thread\/resume failed: no rollout found for thread id\s*([\w-]+)?/,
  copilot: /No session, task, or name matched '([^']+)'/,
  // ACP's is a JSON-RPC error answering session/load, which its adapter reads.
  acp: null
}

/** The CLI's own sentence when `text` is a failed resume for this backend; null otherwise. ACP's is a JSON-RPC error on session/load, handled by its adapter. */
export function resumeLostDetail(backend: AgentBackend, text: string | undefined): string | null {
  const pattern = RESUME_LOST[backend]
  if (pattern === null || text === undefined || text === '') return null
  const m = pattern.exec(text)
  if (m === null) return null
  const line = text.split('\n').find((l) => pattern.test(l)) ?? m[0]
  return line.replace(/^Error:\s*/, '').trim().slice(0, 240)
}

/** What the chat says after an exit: the backend by name, and a resume promise only when one is true. */
export function exitSentence(backend: AgentBackend, exit: { code?: number | null; signal?: string; resumeLost?: string }): string {
  const row = BACKENDS[backend]
  const how = `${typeof exit.code === 'number' ? ` with ${exit.code}` : ''}${exit.signal ? ` (${exit.signal})` : ''}`
  if (exit.resumeLost !== undefined) return `${row.label} could not resume this conversation — ${exit.resumeLost}. The next message starts a NEW conversation; nothing from before is in its context.`
  if (!row.resumes) return `${row.label} exited${how} — the next message starts a new conversation`
  return `${row.label} exited${how} — the next message resumes the conversation`
}

/* ── Continuing on a different backend ──────────────────────────────────── */

export interface HandoffTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface BackendHandoffInput {
  from: AgentBackend
  to: AgentBackend
  title: string
  brief?: string
  criteria?: readonly string[]
  cwd?: string
  /** The conversation so far, oldest first — text only. */
  turns: readonly HandoffTurn[]
  /** Paths the lane has changed, when known. */
  changedFiles?: readonly string[]
}

export interface BackendHandoff {
  /** The DRAFT a person reads and edits before anything is sent. */
  text: string
  /** What does not carry over, named, so nobody assumes it did. */
  dropped: string[]
  /** Tokens the outward gate scrubbed from the draft. */
  redacted: number
}

export const HANDOFF_TURNS_MAX = 6
export const HANDOFF_TURN_CHARS = 1200

/**
 * A context hand-off from one backend's conversation to a fresh one on
 * another. A different CLI cannot resume another vendor's conversation, so
 * what carries is TEXT: the task, the last few exchanges (bounded, newest
 * kept), the files changed. It is a DRAFT — nothing here sends — and it goes
 * through the outward gate, because it is a chat's content read for another
 * reader (the M189 rule).
 */
export function backendHandoff(input: BackendHandoffInput): BackendHandoff {
  const fromRow = BACKENDS[input.from]
  const toRow = BACKENDS[input.to]
  const kept = input.turns.filter((t) => t.text.trim() !== '').slice(-HANDOFF_TURNS_MAX)
  const skipped = input.turns.filter((t) => t.text.trim() !== '').length - kept.length
  const clip = (s: string): string => (s.length > HANDOFF_TURN_CHARS ? `${s.slice(0, HANDOFF_TURN_CHARS)}… (cut)` : s)
  const lines: string[] = [
    `You are continuing a task another agent (${fromRow.label}) started. Its conversation cannot be resumed here, so this is the context it had — check anything that matters against the files rather than trusting it.`,
    '',
    `## Task`,
    input.title.trim()
  ]
  if (input.brief !== undefined && input.brief.trim() !== '') lines.push('', `Outcome: ${input.brief.trim()}`)
  if (input.criteria !== undefined && input.criteria.length > 0) lines.push('', 'Done when:', ...input.criteria.map((c) => `- ${c}`))
  if (input.cwd !== undefined) lines.push('', `Working directory: ${input.cwd}`)
  if (input.changedFiles !== undefined && input.changedFiles.length > 0) {
    lines.push('', `## Files changed so far (${input.changedFiles.length})`, ...input.changedFiles.slice(0, 40).map((p) => `- ${p}`))
    if (input.changedFiles.length > 40) lines.push(`- … and ${input.changedFiles.length - 40} more`)
  }
  if (kept.length > 0) {
    lines.push('', `## The conversation so far${skipped > 0 ? ` (the last ${kept.length}; ${skipped} earlier ${skipped === 1 ? 'message' : 'messages'} left out)` : ''}`)
    for (const t of kept) lines.push('', `**${t.role === 'user' ? 'Person' : fromRow.label}:** ${clip(t.text.trim())}`)
  }
  lines.push('', '## Next', 'Say what you understand the state to be, then continue the task.')
  const dropped: string[] = [
    `${fromRow.label}'s tool calls and their outputs (only the text of the conversation carries)`,
    'permission grants made for the earlier session'
  ]
  if (skipped > 0) dropped.push(`${skipped} earlier ${skipped === 1 ? 'message' : 'messages'}`)
  if (fromRow.appendsPrompt && !toRow.appendsPrompt) dropped.push(`the appended system prompt — ${toRow.reasons.noPrompt}`)
  if (fromRow.images && !toRow.images) dropped.push(`images — ${toRow.reasons.noImages}`)
  if (fromRow.interrupts && !toRow.interrupts) dropped.push(`a graceful interrupt — ${toRow.reasons.noInterrupt}`)
  if (fromRow.reportsCost && !toRow.reportsCost) dropped.push(`a known cost — ${toRow.label} reports none`)
  const gated = outward(lines.join('\n'), `handoff ${fromRow.label} → ${toRow.label}`)
  return { text: gated.text, dropped, redacted: gated.redacted }
}
