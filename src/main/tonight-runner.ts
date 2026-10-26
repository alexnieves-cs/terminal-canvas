import type { AutoCheck, AutoModeId, AutoStatus } from '../shared/auto'
import type { AgentSessionEvent, AutoStartResult } from '../shared/agent-session'
import type { RateLimitState } from '../shared/rate-limit'
import {
  isTonightTaskFinished, tonightResumeAt, tonightResumeTask,
  type TonightBatchSpec, type TonightStatus, type TonightTask, type TonightTaskStatus
} from '../shared/tonight'

/**
 * M477. The Tonight runner: main's half of a batch, pure over injected deps
 * (the manager's auto door and events, the rate-limit state, the power
 * blocker, a clock and a timer) so `verify:auto tonight.*` drives every
 * branch with fakes — a real night cannot be replayed in a suite.
 *
 * One task at a time, in order (`shared/tonight.ts` says why). The runner
 * never decides done: it reads the auto run's own resolution, so a task's
 * outcome is the run's verdict and M475's gate still holds.
 *
 * THE BLOCKER. Taken in `start`, released in `finish` — and `finish` is the
 * one way out: the last task ending, a stop, a dispose (the app quitting),
 * and a dep throwing all reach it, and it releases at most once. A blocker
 * left held keeps a laptop awake on battery for nothing, silently.
 */

export interface TonightDeps {
  startAuto(panelId: string, opts: { mode: AutoModeId; task: string; limit?: number; check?: AutoCheck }): AutoStartResult
  stopAuto(panelId: string): boolean
  hasSession(panelId: string): boolean
  /** The manager's events; only `auto` events are read. */
  subscribe(cb: (event: AgentSessionEvent) => void): () => void
  rateLimit(): RateLimitState
  /** A node's spend so far, USD (its meter across processes). */
  spentOf(panelId: string): number
  /** `powerSaveBlocker`, or a fake. */
  blocker: { start(): number; stop(id: number): void }
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  onStatus?(status: TonightStatus): void
}

export interface TonightRunner {
  start(batch: TonightBatchSpec): { kind: 'started' } | { kind: 'refused'; reason: string }
  /** True when a batch was live: the current run is stopped, every queued task is stopped, the blocker released. */
  stop(): boolean
  status(): TonightStatus | null
  /** The app is quitting: the same as stop, and nothing more is ever started. */
  dispose(): void
}

interface Live {
  spec: TonightBatchSpec
  status: TonightStatus
  blockerId: number | null
  timer: unknown
  unsubscribe: () => void
  /** The task whose auto run is live, and what it had spent when this attempt began. */
  current?: { task: TonightTask; row: TonightTaskStatus; baseline: number; overBudget: boolean }
  /** Tasks paused by a limit, to be resumed rather than started fresh. */
  resume: Set<string>
  /**
   * True inside `startAuto`: a start the manager refuses resolves the run
   * stuck SYNCHRONOUSLY before it returns, and that event must not be read as
   * the run ending — the refusal path below decides, once.
   */
  starting: boolean
}

export function createTonightRunner(deps: TonightDeps): TonightRunner {
  let live: Live | null = null
  let last: TonightStatus | null = null
  let disposed = false

  // The live status is mutated in place (the rows are what `current` holds);
  // a reader is handed a copy, so nothing it keeps changes under it.
  const snapshot = (st: TonightStatus): TonightStatus => ({ ...st, tasks: st.tasks.map((t) => ({ ...t })) })
  const publish = (): void => {
    if (live === null) return
    last = snapshot(live.status)
    deps.onStatus?.(last)
  }

  const finish = (b: Live, state: 'done' | 'stopped', reason?: string): void => {
    if (live !== b) return
    if (b.timer !== null) { deps.clearTimer(b.timer); b.timer = null }
    b.unsubscribe()
    for (const row of b.status.tasks) {
      if (!isTonightTaskFinished(row.state)) { row.state = 'stopped'; row.reason = reason ?? 'the batch was stopped'; row.endedAt ??= deps.now() }
    }
    b.status.state = state
    b.status.endedAt = deps.now()
    delete b.status.resumesAt
    if (b.blockerId !== null) {
      const id = b.blockerId
      b.blockerId = null
      try { deps.blocker.stop(id) } catch { /* released or never held; nothing else to do */ }
    }
    b.status.awake = false
    publish()
    live = null
  }

  const guarded = (b: Live, fn: () => void): void => {
    try { fn() } catch (err) { finish(b, 'stopped', `the batch stopped on an error: ${err instanceof Error ? err.message : String(err)}`) }
  }

  const pause = (b: Live, until: number, why: string): void => {
    b.status.state = 'paused'
    b.status.resumesAt = until
    b.status.pausedFor = why
    publish()
    b.timer = deps.setTimer(() => {
      b.timer = null
      if (live !== b) return
      guarded(b, () => { b.status.state = 'running'; delete b.status.resumesAt; delete b.status.pausedFor; next(b) })
    }, Math.max(0, until - deps.now()))
  }

  const settle = (b: Live, row: TonightTaskStatus, state: TonightTaskStatus['state'], reason?: string): void => {
    row.state = state
    if (reason !== undefined) row.reason = reason
    else delete row.reason
    row.endedAt = deps.now()
    b.current = undefined
  }

  /** Start the next queued task, or pause on a limit, or finish. */
  const next = (b: Live): void => {
    if (live !== b || b.current !== undefined) return
    const row = b.status.tasks.find((t) => t.state === 'queued' || t.state === 'paused')
    if (row === undefined) { finish(b, 'done'); return }
    const resumeAt = tonightResumeAt(deps.rateLimit(), deps.now())
    if (resumeAt !== undefined) {
      row.state = 'paused'
      pause(b, resumeAt, 'the usage limit was reached')
      return
    }
    const task = b.spec.tasks.find((t) => t.id === row.id) as TonightTask
    if (!deps.hasSession(task.panelId)) { settle(b, row, 'stuck', 'its chat is gone'); publish(); next(b); return }
    if (task.budgetUsd !== undefined && row.spentUsd >= task.budgetUsd) { settle(b, row, 'over-budget', 'its budget was spent'); publish(); next(b); return }
    const resuming = b.resume.has(task.id)
    b.current = { task, row, baseline: deps.spentOf(task.panelId) - row.spentUsd, overBudget: false }
    row.state = 'running'
    row.attempts += 1
    row.startedAt ??= deps.now()
    b.status.state = 'running'
    b.starting = true
    let started: AutoStartResult
    try {
      started = deps.startAuto(task.panelId, {
        // A resume is a custom run whatever the first was: its task text is the
        // "you were paused" turn, which only the custom mode carries.
        mode: resuming ? 'custom' : task.mode ?? 'custom',
        task: resuming ? tonightResumeTask(task.task) : task.task,
        ...(task.limit === undefined ? {} : { limit: task.limit }),
        ...(task.check === undefined ? {} : { check: task.check })
      })
    } finally {
      b.starting = false
    }
    b.resume.delete(task.id)
    if (started.kind === 'refused') {
      // A refusal while the account is limited is the limit, and pauses; any
      // other refusal is this task's, named, and the batch goes on.
      const at = tonightResumeAt(deps.rateLimit(), deps.now())
      b.current = undefined
      if (at !== undefined || /budget/.test(started.reason)) {
        row.state = 'paused'
        b.resume.add(task.id)
        pause(b, at ?? deps.now() + 30 * 60_000, at !== undefined ? 'the usage limit was reached' : started.reason)
        return
      }
      settle(b, row, 'stuck', started.reason)
      publish()
      next(b)
      return
    }
    publish()
  }

  const onAuto = (b: Live, e: AgentSessionEvent): void => {
    const cur = b.current
    if (live !== b || cur === undefined || e.type !== 'auto' || e.id !== cur.task.panelId) return
    if (b.starting && e.state !== 'running') return
    cur.row.spentUsd = Math.max(0, deps.spentOf(cur.task.panelId) - cur.baseline)
    if (e.check !== undefined) cur.row.check = e.check
    if (e.checkFailures !== undefined) cur.row.checkFailures = e.checkFailures
    if (e.state === 'running') {
      const budget = cur.task.budgetUsd
      if (budget !== undefined && !cur.overBudget && cur.row.spentUsd >= budget) {
        cur.overBudget = true
        deps.stopAuto(cur.task.panelId)
        return
      }
      publish()
      return
    }
    if (e.state === 'done') {
      settle(b, cur.row, e.verdict === 'checked' ? 'checked' : 'claimed')
    } else if (cur.overBudget) {
      settle(b, cur.row, 'over-budget', `it spent its $${(cur.task.budgetUsd ?? 0).toFixed(2)} budget`)
    } else if (e.state === 'stuck' && tonightResumeAt(deps.rateLimit(), deps.now()) !== undefined && e.reason !== 'check' && e.reason !== 'permission') {
      // The run ended because the account ran out, not because the work did:
      // the task waits for the window and resumes where it stopped.
      cur.row.state = 'paused'
      b.resume.add(cur.task.id)
      b.current = undefined
    } else if (e.state === 'stuck') {
      settle(b, cur.row, 'stuck', stuckWords(e.reason))
    } else {
      settle(b, cur.row, 'stopped', 'it was stopped by hand')
    }
    publish()
    next(b)
  }

  return {
    start(batch) {
      if (disposed) return { kind: 'refused', reason: 'the app is quitting' }
      if (live !== null) return { kind: 'refused', reason: 'a batch is already running — stop it first' }
      if (batch.tasks.length === 0) return { kind: 'refused', reason: 'the batch has no tasks' }
      const missing = batch.tasks.find((t) => !deps.hasSession(t.panelId))
      if (missing !== undefined) return { kind: 'refused', reason: `${missing.title} has no chat to run in` }
      const now = deps.now()
      let blockerId: number | null
      try { blockerId = deps.blocker.start() } catch (err) { return { kind: 'refused', reason: `the Mac cannot be kept awake: ${err instanceof Error ? err.message : String(err)}` } }
      const b: Live = {
        spec: batch,
        status: {
          state: 'running', startedAt: now, awake: true,
          tasks: batch.tasks.map((t) => ({ id: t.id, panelId: t.panelId, title: t.title, state: 'queued' as const, attempts: 0, spentUsd: 0, checkFailures: 0, ...(t.check === undefined ? {} : { check: t.check.command }), ...(t.sandboxed === true ? { sandboxed: true as const } : {}) }))
        },
        blockerId, timer: null, unsubscribe: () => {}, resume: new Set(), starting: false
      }
      live = b
      b.unsubscribe = deps.subscribe((e) => guarded(b, () => onAuto(b, e)))
      guarded(b, () => {
        if (batch.notBefore !== undefined && batch.notBefore > now) {
          b.status.state = 'waiting'
          b.status.resumesAt = batch.notBefore
          publish()
          b.timer = deps.setTimer(() => { b.timer = null; if (live === b) guarded(b, () => { b.status.state = 'running'; delete b.status.resumesAt; next(b) }) }, batch.notBefore - now)
          return
        }
        next(b)
      })
      return { kind: 'started' }
    },
    stop() {
      const b = live
      if (b === null) return false
      const cur = b.current
      b.current = undefined
      if (cur !== undefined) {
        settle(b, cur.row, 'stopped', 'the batch was stopped')
        try { deps.stopAuto(cur.task.panelId) } catch { /* the run may already be gone */ }
      }
      finish(b, 'stopped')
      return true
    },
    status() {
      return live === null ? last : snapshot(live.status)
    },
    dispose() {
      disposed = true
      const b = live
      if (b === null) return
      const cur = b.current
      b.current = undefined
      if (cur !== undefined) {
        settle(b, cur.row, 'stopped', 'the app quit')
        try { deps.stopAuto(cur.task.panelId) } catch { /* quitting */ }
      }
      finish(b, 'stopped', 'the app quit')
    }
  }
}

function stuckWords(reason: AutoStatus['reason']): string {
  switch (reason) {
    case 'check': return 'its check kept failing'
    case 'limit': return 'it reached its turn limit'
    case 'permission': return 'a permission question went unanswered'
    case 'exit': return 'the agent exited'
    case 'budget': return 'the canvas budget refused a send'
    case 'cap': return 'the agent reached its own cap'
    case 'error': return 'a turn ended in an error'
    default: return 'it stopped without a reason'
  }
}
