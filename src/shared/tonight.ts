import { parseAutoCheck, type AutoCheck, type AutoModeId, AUTO_MODE_IDS } from './auto'
import type { RateLimitState } from './rate-limit'
import type { PersistedWorkItem } from './work-items'

/**
 * M477. TONIGHT — a batch of auto runs handed off for the night, as data.
 *
 * A batch is a list of tasks, each an auto run on a chat panel that already
 * exists, with an optional check (M475's gate) and an optional spend budget.
 * Main runs them ONE AT A TIME, in order: a night is long and the binding
 * constraint is the usage window, not the wall clock, so parallel runs would
 * only reach the limit sooner and leave more work half-done at once.
 *
 * Three rules a reader relies on:
 * - **A usage limit pauses; it never stops.** A batch that meets a limited
 *   window waits until the window resets and resumes the SAME task with a
 *   "continue" turn. Nothing is marked failed because the account ran out.
 * - **The Mac stays awake only while a batch runs** — the power blocker is
 *   taken at start and released on every way a batch ends: done, stopped,
 *   an error, a quit.
 * - **A task's outcome is the auto run's verdict**, so `checked` still means
 *   a check passed and `claimed` still means only the agent said so.
 */

export interface TonightTask {
  /** Stable within the batch; the morning queue keys on it. */
  id: string
  /** The chat panel the run happens in. */
  panelId: string
  title: string
  /** What to do — the custom mode's task text. */
  task: string
  /** Absent is `custom`. */
  mode?: AutoModeId
  check?: AutoCheck
  /** Spend ceiling for this task in USD, across every resume. Absent or 0 is none. */
  budgetUsd?: number
  /** Turn limit per attempt; absent is the mode's. */
  limit?: number
}

export interface TonightBatchSpec {
  tasks: TonightTask[]
  /** Epoch ms before which nothing starts — "after the window resets". Absent is now. */
  notBefore?: number
}

export type TonightTaskState = 'queued' | 'running' | 'paused' | 'checked' | 'claimed' | 'stuck' | 'over-budget' | 'stopped'
export type TonightBatchState = 'waiting' | 'running' | 'paused' | 'done' | 'stopped'

export interface TonightTaskStatus {
  id: string
  panelId: string
  title: string
  state: TonightTaskState
  /** Why a task is stuck or stopped, in the product's words. */
  reason?: string
  /** How many times the run was started: the first, plus one per resume after a limit. */
  attempts: number
  /** Spent on this task so far, USD, across attempts. */
  spentUsd: number
  /** Failed checks across attempts (M475). */
  checkFailures: number
  check?: string
  startedAt?: number
  endedAt?: number
}

export interface TonightStatus {
  state: TonightBatchState
  tasks: TonightTaskStatus[]
  /** While paused or waiting: epoch ms the batch resumes. */
  resumesAt?: number
  /** Why the batch paused, when it did. */
  pausedFor?: string
  startedAt: number
  endedAt?: number
  /** True exactly while the power blocker is held. */
  awake: boolean
}

export const TONIGHT_TASKS_MAX = 50
/** After a window's stated reset, wait this much more before resuming — a reset is not instant on every server. */
export const TONIGHT_RESUME_MARGIN_MS = 2 * 60_000
/** A limit with no reset time in the future still pauses at least this long, never a hot loop. */
export const TONIGHT_MIN_PAUSE_MS = 5 * 60_000

const TERMINAL: ReadonlySet<TonightTaskState> = new Set(['checked', 'claimed', 'stuck', 'over-budget', 'stopped'])
export const isTonightTaskFinished = (s: TonightTaskState): boolean => TERMINAL.has(s)

/** The turn a resumed task gets after a pause: the same task, told it was interrupted. */
export function tonightResumeTask(task: string): string {
  return `You were paused by a usage limit partway through this task. Look at where the work stands, then continue it to the end.\nThe task: ${task}`
}

/**
 * When a limited window lets work resume, in epoch ms — or undefined when
 * nothing is limited. A reset time in the past (a stale event) still pauses
 * `TONIGHT_MIN_PAUSE_MS`: the account said no, and asking again at once is
 * how a night of retries burns through nothing but refusals.
 */
export function tonightResumeAt(rate: RateLimitState, nowMs: number): number | undefined {
  if (rate.kind !== 'limited') return undefined
  const reset = rate.until * 1000 + TONIGHT_RESUME_MARGIN_MS
  return Math.max(reset, nowMs + TONIGHT_MIN_PAUSE_MS)
}

/** A batch from the bridge, by name: anything malformed is refused with a reason, never trimmed into a smaller batch silently. */
export function parseTonightBatch(raw: unknown): { kind: 'ok'; batch: TonightBatchSpec } | { kind: 'refused'; reason: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { kind: 'refused', reason: 'the batch is not an object' }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.tasks) || r.tasks.length === 0) return { kind: 'refused', reason: 'the batch has no tasks' }
  if (r.tasks.length > TONIGHT_TASKS_MAX) return { kind: 'refused', reason: `a batch holds at most ${TONIGHT_TASKS_MAX} tasks` }
  if (r.notBefore !== undefined && (typeof r.notBefore !== 'number' || !Number.isFinite(r.notBefore))) return { kind: 'refused', reason: 'the start time is not a time' }
  const tasks: TonightTask[] = []
  const ids = new Set<string>()
  for (const [i, t] of r.tasks.entries()) {
    const n = `task ${i + 1}`
    if (typeof t !== 'object' || t === null || Array.isArray(t)) return { kind: 'refused', reason: `${n} is not an object` }
    const o = t as Record<string, unknown>
    if (typeof o.id !== 'string' || o.id === '') return { kind: 'refused', reason: `${n} has no id` }
    if (ids.has(o.id)) return { kind: 'refused', reason: `${n} repeats the id ${o.id}` }
    if (typeof o.panelId !== 'string' || o.panelId === '') return { kind: 'refused', reason: `${n} names no chat` }
    if (typeof o.task !== 'string' || o.task.trim() === '') return { kind: 'refused', reason: `${n} says nothing to do` }
    if (o.mode !== undefined && !AUTO_MODE_IDS.includes(o.mode as AutoModeId)) return { kind: 'refused', reason: `${n} names an unknown mode` }
    if (o.budgetUsd !== undefined && (typeof o.budgetUsd !== 'number' || !Number.isFinite(o.budgetUsd) || o.budgetUsd < 0)) return { kind: 'refused', reason: `${n}'s budget is not a sum of money` }
    if (o.limit !== undefined && (typeof o.limit !== 'number' || !Number.isInteger(o.limit) || o.limit <= 0)) return { kind: 'refused', reason: `${n}'s turn limit is not a positive whole number` }
    const check = parseAutoCheck(o.check)
    if (check.kind === 'refused') return { kind: 'refused', reason: `${n}: ${check.reason}` }
    ids.add(o.id)
    tasks.push({
      id: o.id, panelId: o.panelId, title: typeof o.title === 'string' && o.title.trim() !== '' ? o.title.trim() : o.task.trim().split('\n')[0].slice(0, 80), task: o.task.trim(),
      ...(o.mode === undefined ? {} : { mode: o.mode as AutoModeId }),
      ...(check.check === undefined ? {} : { check: check.check }),
      ...(o.budgetUsd === undefined || o.budgetUsd === 0 ? {} : { budgetUsd: o.budgetUsd as number }),
      ...(o.limit === undefined ? {} : { limit: o.limit as number })
    })
  }
  return { kind: 'ok', batch: { tasks, ...(r.notBefore === undefined ? {} : { notBefore: r.notBefore as number }) } }
}

/**
 * M480 (C2b). WHICH TASKS A "RUN TONIGHT" TAKES — the board's open tasks
 * whose lane conversation is still on the canvas, in board order. Each one
 * the door leaves out is named with its reason, so "Run tonight" never
 * silently runs fewer tasks than the person expected.
 *
 * The task text is the person's own (the brief, else the provider's
 * description, else the title), with the acceptance criteria listed; the
 * check is the task's recipe's checks joined with `&&`, so a recipe that
 * names tests gates the night by them and a task without one is `claimed`
 * at best — the morning queue says which.
 */
export function tonightBatchFrom(
  items: readonly PersistedWorkItem[],
  chatOpen: (panelId: string) => boolean
): { tasks: TonightTask[]; skipped: { title: string; reason: string }[] } {
  const tasks: TonightTask[] = []
  const skipped: { title: string; reason: string }[] = []
  for (const item of items) {
    if (item.state === 'done' || item.merged !== undefined) continue
    if (item.state === 'review') { skipped.push({ title: item.title, reason: 'waiting on your review' }); continue }
    if (item.panelId === undefined) { skipped.push({ title: item.title, reason: 'not started — start it once so it has a lane' }); continue }
    if (!chatOpen(item.panelId)) { skipped.push({ title: item.title, reason: 'its conversation is closed' }); continue }
    if (tasks.length >= TONIGHT_TASKS_MAX) { skipped.push({ title: item.title, reason: `a night holds at most ${TONIGHT_TASKS_MAX} tasks` }); continue }
    const what = (item.brief ?? item.description ?? '').trim()
    const criteria = (item.criteria ?? []).filter((c) => c.trim() !== '')
    const task = [what === '' ? item.title : `${item.title}\n\n${what}`, ...(criteria.length === 0 ? [] : [`Done when:\n${criteria.map((c) => `- ${c}`).join('\n')}`])].join('\n\n')
    const checks = (item.recipeUsed?.definition.checks ?? []).map((c) => c.trim()).filter((c) => c !== '')
    tasks.push({ id: item.id, panelId: item.panelId, title: item.title, task, ...(checks.length === 0 ? {} : { check: { command: checks.join(' && ') } }) })
  }
  return { tasks, skipped }
}

/** The one line a door says after a start, a refusal or a stop. */
export function tonightWords(r: { kind: 'started'; tasks: number; checked: number; skipped: number } | { kind: 'refused'; reason: string }): string {
  if (r.kind === 'refused') return r.reason
  const s = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`
  return `${s(r.tasks, 'task')} queued for tonight, one at a time (${r.checked} gated by a check); the Mac stays awake while they run${r.skipped === 0 ? '' : ` · ${r.skipped} left out`}`
}
