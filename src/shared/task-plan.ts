/**
 * M327. A TASK'S EXECUTION PLAN — who is doing what, what each step waits on,
 * and what counts as done, as a record a person can read and edit.
 *
 * A swarm (M275) opens an arrangement of agents and wires hand-offs between
 * them, and a failed multi-agent run then has to be RECONSTRUCTED from the
 * transcripts: which agent was meant to do what, whether the one that went
 * quiet finished or died, and what was waiting on it. This record says it in
 * one place, per step: its owner, its dependencies, where it works, what it
 * is expected to produce, and — derived here, never stored — what actually
 * happened.
 *
 * Four rules are load-bearing.
 *
 * **Status is DERIVED, never written.** The record holds what a person
 * decided (the steps, their owners, their commands) and three moments a
 * person caused (started, verified, cancelled). Whether a step is running,
 * finished, stopped or verified is read from the agent's session, the
 * witnessed check rows and the review mark at render time, so a relaunch or
 * a crash cannot leave a step saying "running" about an agent that is gone.
 *
 * **Stopped is not finished, and finished is not verified.** An agent whose
 * session ended, errored, or whose conversation was closed before its turn
 * came back is `stopped` — "stopped responding" — and says so. An agent that
 * ended its turn normally is `finished` and NOT verified: a step is verified
 * only by a witnessed check that exited 0 after the step started, a person's
 * own mark, or (for the review step) the person's current review. The same
 * line `verificationOf` draws for a task (M307), drawn per step.
 *
 * **A brief is inserted, never sent.** Starting, retrying or reassigning a
 * step puts the step's brief in its agent's composer (M80's rule); the person
 * sends it. Nothing in this module or its callers dispatches on its own.
 *
 * **The first version is ONE workflow** — implement two parts independently,
 * verify them together, review the result (`implementVerifyPlan`). Steps can
 * be edited, added and removed, but the kinds are the three that workflow
 * needs, and nothing here runs a step automatically when its dependencies
 * finish: the plan says a step is READY, and the person starts it.
 *
 * Pure: no DOM, no React, no electron. `verify:review plan.*`.
 */

export type PlanStepKind = 'agent' | 'check' | 'review'
export const PLAN_STEP_KINDS: readonly PlanStepKind[] = ['agent', 'check', 'review']

export interface PlanStep {
  id: string
  title: string
  kind: PlanStepKind
  /** Who does it, in words — "implementation agent", "you". */
  role: string
  /** The chat panel doing an agent step, once one is assigned. */
  owner?: string
  /** Steps that must be finished or verified before this one is ready. */
  dependsOn: string[]
  /** Where the step works; absent is the task's lane. */
  cwd?: string
  /** What done looks like — the step's expected output, in the person's words. */
  expected: string
  /** A check step's command: the witnessed run of it decides the step. */
  command?: string
  /** When the step was (re)started — a turn or a check run after this is its result. */
  startedAt?: number
  /** A person's own "this step is verified", for an agent step no command can decide. */
  verifiedAt?: number
  cancelledAt?: number
}

export interface TaskPlan {
  steps: PlanStep[]
  createdAt: number
}

export const PLAN_STEPS_MAX = 12

/* ── The one workflow ───────────────────────────────────────────────────── */

/**
 * Implement two parts independently, verify them together, review. The
 * implementation step takes the task's own conversation when it has one — it
 * is the lane's agent already — and the check takes the task's first
 * declared check when a recipe gave it one.
 */
export function implementVerifyPlan(input: { now: number; owner?: string; check?: string }): TaskPlan {
  return {
    createdAt: input.now,
    steps: [
      {
        id: 'api', title: 'Implement API', kind: 'agent', role: 'implementation agent', dependsOn: [],
        expected: 'The API change, committed in the lane, and a plain account of what changed.',
        ...(input.owner === undefined ? {} : { owner: input.owner, startedAt: input.now })
      },
      {
        id: 'ui', title: 'Implement UI', kind: 'agent', role: 'frontend agent', dependsOn: [],
        expected: 'The interface change, committed in the lane, working against the API as specified.'
      },
      {
        id: 'verify', title: 'Verify integration', kind: 'check', role: 'check', dependsOn: ['api', 'ui'],
        expected: 'The check exits 0 in the lane with both changes in it.',
        ...(input.check === undefined || input.check.trim() === '' ? {} : { command: input.check.trim() })
      },
      {
        id: 'review', title: 'Review result', kind: 'review', role: 'you', dependsOn: ['verify'],
        expected: 'The changes and the verification evidence, read — then accepted or sent back.'
      }
    ]
  }
}

/* ── The record ─────────────────────────────────────────────────────────── */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/**
 * Field by field. A step without an id or a title is not a step (it could
 * not be named or depended on) and is dropped by name; a malformed optional
 * field costs that field; a dependency on a step that does not exist is
 * dropped, so a plan never waits on something it cannot show.
 */
export function parseTaskPlan(raw: unknown, warnings: string[]): TaskPlan | undefined {
  if (raw === undefined) return undefined
  if (!isRecord(raw) || !Array.isArray(raw.steps)) { warnings.push('dropped a task plan that was not a plan'); return undefined }
  const steps: PlanStep[] = []
  for (const s of raw.steps.slice(0, PLAN_STEPS_MAX)) {
    if (!isRecord(s) || !isStr(s.id) || !isStr(s.title) || steps.some((x) => x.id === s.id)) { warnings.push('dropped a malformed plan step'); continue }
    const kind: PlanStepKind = (PLAN_STEP_KINDS as readonly unknown[]).includes(s.kind) ? (s.kind as PlanStepKind) : 'agent'
    steps.push({
      id: s.id, title: s.title.trim(), kind,
      role: typeof s.role === 'string' ? s.role : '',
      dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.filter(isStr) : [],
      expected: typeof s.expected === 'string' ? s.expected : '',
      ...(isStr(s.owner) ? { owner: s.owner } : {}),
      ...(isStr(s.cwd) ? { cwd: s.cwd } : {}),
      ...(isStr(s.command) ? { command: s.command } : {}),
      ...(isTime(s.startedAt) ? { startedAt: s.startedAt } : {}),
      ...(isTime(s.verifiedAt) ? { verifiedAt: s.verifiedAt } : {}),
      ...(isTime(s.cancelledAt) ? { cancelledAt: s.cancelledAt } : {})
    })
  }
  const ids = new Set(steps.map((s) => s.id))
  for (const s of steps) s.dependsOn = [...new Set(s.dependsOn.filter((d) => ids.has(d) && d !== s.id))]
  if (steps.length === 0) return undefined
  return { steps, createdAt: isTime(raw.createdAt) ? raw.createdAt : 0 }
}

/** A fresh object, field by field — an optional field that is absent stays absent. */
export function carryTaskPlan(p: TaskPlan): TaskPlan {
  return {
    createdAt: p.createdAt,
    steps: p.steps.map((s) => ({
      id: s.id, title: s.title, kind: s.kind, role: s.role, dependsOn: [...s.dependsOn], expected: s.expected,
      ...(s.owner === undefined ? {} : { owner: s.owner }),
      ...(s.cwd === undefined ? {} : { cwd: s.cwd }),
      ...(s.command === undefined ? {} : { command: s.command }),
      ...(s.startedAt === undefined ? {} : { startedAt: s.startedAt }),
      ...(s.verifiedAt === undefined ? {} : { verifiedAt: s.verifiedAt }),
      ...(s.cancelledAt === undefined ? {} : { cancelledAt: s.cancelledAt })
    }))
  }
}

/** The plan with one step changed; `undefined` in the patch REMOVES that field. */
export function withStep(plan: TaskPlan, id: string, patch: Partial<Omit<PlanStep, 'id'>>): TaskPlan {
  return carryTaskPlan({
    ...plan,
    steps: plan.steps.map((s) => {
      if (s.id !== id) return s
      const next: PlanStep = { ...s }
      for (const [k, v] of Object.entries(patch) as [keyof PlanStep, unknown][]) {
        if (v === undefined || (typeof v === 'string' && v.trim() === '' && k !== 'expected' && k !== 'role' && k !== 'title')) delete (next as unknown as Record<string, unknown>)[k]
        else (next as unknown as Record<string, unknown>)[k] = v
      }
      return next
    })
  })
}

export function addStep(plan: TaskPlan): TaskPlan {
  if (plan.steps.length >= PLAN_STEPS_MAX) return plan
  let n = plan.steps.length + 1
  while (plan.steps.some((s) => s.id === `step-${n}`)) n += 1
  const last = plan.steps[plan.steps.length - 1]
  return carryTaskPlan({ ...plan, steps: [...plan.steps, { id: `step-${n}`, title: 'New step', kind: 'agent', role: 'agent', dependsOn: last === undefined ? [] : [last.id], expected: '' }] })
}

/** Removing a step removes it from every other step's dependencies, too. */
export function removeStep(plan: TaskPlan, id: string): TaskPlan {
  return carryTaskPlan({ ...plan, steps: plan.steps.filter((s) => s.id !== id).map((s) => ({ ...s, dependsOn: s.dependsOn.filter((d) => d !== id) })) })
}

/**
 * What is wrong with the plan's SHAPE, in sentences: a dependency cycle (no
 * step on it can ever be ready), an agent step with no expected output (so
 * nobody can say it is done), a check with no command. Shown in the editor;
 * nothing refuses to render over them.
 */
export function planProblems(plan: TaskPlan): string[] {
  const out: string[] = []
  const byId = new Map(plan.steps.map((s) => [s.id, s]))
  const visiting = new Set<string>()
  const done = new Set<string>()
  const cyclic = new Set<string>()
  const walk = (id: string, path: string[]): void => {
    if (done.has(id)) return
    if (visiting.has(id)) { for (const p of path.slice(path.indexOf(id))) cyclic.add(p); return }
    visiting.add(id)
    for (const d of byId.get(id)?.dependsOn ?? []) walk(d, [...path, d])
    visiting.delete(id)
    done.add(id)
  }
  for (const s of plan.steps) walk(s.id, [s.id])
  if (cyclic.size > 0) out.push(`${[...cyclic].map((id) => byId.get(id)?.title ?? id).join(', ')} wait on each other — none of them can ever be ready`)
  for (const s of plan.steps) {
    if (s.kind === 'check' && s.command === undefined) out.push(`${s.title} has no command — nothing can verify it`)
    if (s.kind === 'agent' && s.expected.trim() === '') out.push(`${s.title} says nothing about what it should produce — nobody can tell when it is done`)
  }
  return out
}

/* ── What actually happened ─────────────────────────────────────────────── */

/** The agent's session as this renderer sees it. */
export interface PlanAgentFact {
  /** The panel is on the canvas. */
  present: boolean
  title: string
  /** A turn is in flight. */
  live: boolean
  /** Waiting on the person (a permission or a question). */
  waiting: boolean
  /** The session ended or cannot be seen — the process is gone, not between turns. */
  ended: boolean
  /** How the last turn ended, and when. */
  lastTurn?: { kind: 'ok' | 'interrupted' | 'error' | 'aborted'; at: number; reason?: string }
  /** The agent's own last words, first line — its ACCOUNT, never evidence. */
  lastWords?: string
}

export interface PlanFacts {
  agentOf: (panelId: string) => PlanAgentFact | undefined
  /** The latest witnessed run of a command in the task, or undefined. */
  runOf: (command: string) => { exitCode: number | null; at: number } | undefined
  review: { standing: 'none' | 'current' | 'stale' | 'unknown'; accepted: boolean }
}

export type PlanStepState =
  | 'waiting' | 'ready' | 'assigned' | 'working' | 'needs-you'
  | 'stopped' | 'finished' | 'verified' | 'failed' | 'cancelled'

/** Settled far enough for a dependent to start: an agent's normal finish, or verified. */
const SETTLED: readonly PlanStepState[] = ['finished', 'verified']

export type PlanActionId = 'start' | 'assign' | 'open' | 'cancel' | 'retry' | 'verify' | 'run' | 'review' | 'reopen'

export interface PlanStepView {
  id: string
  state: PlanStepState
  /** The state as a word a person reads at a glance. */
  word: string
  /** What is true, in one sentence — the step's actual result when it has one. */
  detail: string
  /** The steps this one still waits on, by title. */
  waitsOn: string[]
  /** The actions that apply now; the first is the step's primary. */
  actions: PlanActionId[]
  /**
   * The tone the EXISTING vocabulary gives the state — no new token. Colour
   * only where the state means something: blue working, amber needs you, red
   * stopped or failed, green verified. Finished-not-verified is the settled
   * neutral (`done`), never green: an agent stopping is not the work passing.
   */
  tone: 'working' | 'needs-you' | 'idle' | 'exited' | 'done' | 'kind' | 'none'
}

const WORDS: Record<PlanStepState, string> = {
  waiting: 'Waiting', ready: 'Ready', assigned: 'Assigned', working: 'Working', 'needs-you': 'Needs you',
  stopped: 'Stopped responding', finished: 'Finished — not verified', verified: 'Verified', failed: 'Failed', cancelled: 'Cancelled'
}
const TONES: Record<PlanStepState, PlanStepView['tone']> = {
  waiting: 'none', ready: 'kind', assigned: 'kind', working: 'working', 'needs-you': 'needs-you',
  stopped: 'exited', finished: 'done', verified: 'idle', failed: 'exited', cancelled: 'none'
}

const oneLine = (s: string, max = 140): string => {
  const line = s.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/**
 * Every step's state, in plan order. Dependencies are resolved first (a
 * step's readiness reads its dependencies' states), which is why this takes
 * the whole plan rather than one step.
 */
export function planView(plan: TaskPlan, facts: PlanFacts): PlanStepView[] {
  const byId = new Map(plan.steps.map((s) => [s.id, s]))
  const memo = new Map<string, PlanStepView>()
  const onPath = new Set<string>()
  const view = (id: string): PlanStepView => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    const s = byId.get(id)!
    // A cycle reads as waiting on itself rather than recursing forever (planProblems names it).
    if (onPath.has(id)) return { id, state: 'waiting', word: WORDS.waiting, detail: 'Part of a dependency cycle', waitsOn: [], actions: [], tone: TONES.waiting }
    onPath.add(id)
    const deps = s.dependsOn.filter((d) => byId.has(d)).map((d) => ({ step: byId.get(d)!, v: view(d) }))
    onPath.delete(id)
    const out = stepView(s, deps.filter((d) => !SETTLED.includes(d.v.state)).map((d) => d.step.title), facts)
    memo.set(id, out)
    return out
  }
  return plan.steps.map((s) => view(s.id))
}

function make(id: string, state: PlanStepState, detail: string, actions: PlanActionId[], waitsOn: string[] = []): PlanStepView {
  return { id, state, word: WORDS[state], detail, waitsOn, actions, tone: TONES[state] }
}

function stepView(s: PlanStep, unmet: string[], facts: PlanFacts): PlanStepView {
  const since = s.startedAt ?? 0
  if (s.cancelledAt !== undefined) return make(s.id, 'cancelled', 'Cancelled — nothing is running for this step.', ['retry'])

  if (s.kind === 'check') {
    // What it checks is not there yet: a run from before cannot verify it.
    if (unmet.length > 0) return make(s.id, 'waiting', `Waits for ${joinWords(unmet)}.`, [], unmet)
    // Only a run of THIS attempt counts: a step never started has no result,
    // even when the same command passed (or failed) before the plan existed.
    const run = s.command === undefined || s.startedAt === undefined ? undefined : facts.runOf(s.command)
    if (run !== undefined && run.at >= since) {
      if (run.exitCode === 0) return make(s.id, 'verified', `\`${s.command}\` passed.`, ['reopen'])
      return make(s.id, 'failed', `\`${s.command}\` ${run.exitCode === null ? 'ended without an exit code' : `exited ${run.exitCode}`} — nothing is verified until it passes.`, ['retry'])
    }
    if (s.command === undefined) return make(s.id, 'ready', 'Ready — set the command that proves this step.', [])
    return make(s.id, 'ready', `Ready to run \`${s.command}\`.`, ['run'])
  }

  if (s.kind === 'review') {
    if (facts.review.accepted) return make(s.id, 'verified', 'Accepted — the lane was merged.', [])
    if (facts.review.standing === 'current' && unmet.length === 0) return make(s.id, 'verified', 'You reviewed the current changes.', ['review'])
    if (unmet.length > 0) return make(s.id, 'waiting', `Waits for ${joinWords(unmet)}.`, [], unmet)
    return make(s.id, 'ready', facts.review.standing === 'stale' ? 'The changes moved since your review — read them again.' : 'Ready for your review: the changes and the check evidence.', ['review'])
  }

  // An agent step.
  if (s.verifiedAt !== undefined) return make(s.id, 'verified', 'Marked verified by you.', ['reopen'])
  if (s.owner === undefined) {
    if (unmet.length > 0) return make(s.id, 'waiting', `Waits for ${joinWords(unmet)}.`, [], unmet)
    return make(s.id, 'ready', 'Ready — no agent has this step yet.', ['start', 'assign'])
  }
  const a = facts.agentOf(s.owner)
  if (a === undefined || !a.present) return make(s.id, 'stopped', 'Its agent\'s conversation was closed — the step stopped before it was verified.', ['retry', 'assign'])
  if (a.waiting) return make(s.id, 'needs-you', `${a.title} is waiting on you.`, ['open', 'cancel'])
  if (a.live) return make(s.id, 'working', `${a.title} is working on it.`, ['open', 'cancel'])
  const t = a.lastTurn
  if (t !== undefined && t.at >= since) {
    if (t.kind === 'ok') return make(s.id, 'finished', a.lastWords !== undefined && a.lastWords !== '' ? `${a.title} finished its turn: “${oneLine(a.lastWords)}”` : `${a.title} finished its turn.`, ['verify', 'open'])
    if (t.kind === 'interrupted') return make(s.id, 'stopped', `${a.title} was interrupted before finishing.`, ['retry', 'assign'])
    return make(s.id, 'stopped', `${a.title} stopped responding — its turn ${t.kind === 'error' ? 'failed' : 'was cut off'}${t.reason !== undefined && t.reason !== '' ? `: ${oneLine(t.reason, 90)}` : ''}.`, ['retry', 'assign'])
  }
  if (a.ended) return make(s.id, 'stopped', `${a.title}'s session ended — it stopped responding before finishing.`, ['retry', 'assign'])
  if (unmet.length > 0) return make(s.id, 'waiting', `Waits for ${joinWords(unmet)} — ${a.title} is assigned.`, [], unmet)
  return make(s.id, 'assigned', `Assigned to ${a.title} — its brief is waiting in the conversation to be sent.`, ['open', 'assign'])
}

function joinWords(xs: readonly string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/** For the task list: how far the plan is, and the step that most needs the person. */
export function planSummary(plan: TaskPlan, views: readonly PlanStepView[]): { steps: number; verified: number; attention: string | null } {
  const rank: Partial<Record<PlanStepState, number>> = { stopped: 0, failed: 1, 'needs-you': 2, ready: 3, finished: 4 }
  const worst = views
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => rank[v.state] !== undefined)
    .sort((a, b) => (rank[a.v.state] ?? 9) - (rank[b.v.state] ?? 9) || a.i - b.i)[0]
  const title = worst === undefined ? undefined : plan.steps.find((s) => s.id === worst.v.id)?.title
  return {
    steps: plan.steps.length,
    verified: views.filter((v) => v.state === 'verified').length,
    attention: worst === undefined || title === undefined ? null : `${title} — ${worst.v.word.toLowerCase()}`
  }
}

/**
 * The brief a step's agent is handed — inserted in its composer, never sent.
 * It says the step, the task it is part of, what to produce, where, and who
 * else is working beside it, so an agent started on one step does not wander
 * into another's.
 */
export function stepBrief(plan: TaskPlan, stepId: string, task: { title: string; brief?: string; lane?: string }): string {
  const s = plan.steps.find((x) => x.id === stepId)
  if (s === undefined) return ''
  const others = plan.steps.filter((x) => x.id !== s.id)
  const alongside = others.filter((x) => x.kind === 'agent' && !x.dependsOn.includes(s.id) && !s.dependsOn.includes(x.id)).map((x) => `${x.title} (${x.role || 'another agent'})`)
  const after = others.filter((x) => x.dependsOn.includes(s.id)).map((x) => x.title)
  const lines = [
    `Your step: ${s.title} — part of the task “${task.title}”.`,
    ...(task.brief === undefined || task.brief.trim() === '' ? [] : [`The task: ${task.brief.trim()}`]),
    `Expected output: ${s.expected.trim() === '' ? 'say what you produced when you finish.' : s.expected.trim()}`,
    ...(s.cwd !== undefined ? [`Work in: ${s.cwd}`] : task.lane !== undefined ? [`Work in: ${task.lane}`] : []),
    ...(alongside.length === 0 ? [] : [`Running alongside you: ${alongside.join(', ')} — stay within your step.`]),
    ...(after.length === 0 ? [] : [`Waiting on this step: ${after.join(', ')}.`]),
    'End your turn when the step is complete, and say plainly what you changed and anything you could not do.'
  ]
  return lines.join('\n')
}
