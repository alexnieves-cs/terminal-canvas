import { parseAutoCheck, type AutoCheck } from './auto'
import { BACKENDS, BACKEND_IDS, type AgentBackend } from './agent-backends'

/**
 * M546. TOURNAMENT — one task, N agents, each in its own worktree, and the
 * task's CHECK decides. The model and the scorer, pure.
 *
 * A tournament is M475's check-gated auto run widened from one lane to N
 * lanes of the SAME task: each entrant is a chat session (a backend, and a
 * model when the backend takes one) in a worktree of its own, all given the
 * same task and the same check. The scorer reads what each run came to and
 * names a winner, or says there is none.
 *
 * Four rules here are load-bearing, and each fails silently if undone.
 *
 * **Only a passed check is eligible, and eligibility comes BEFORE every
 * metric.** A failed entrant is usually the cheapest and the smallest (it
 * stopped early), so a scorer that weighs cost or diff size across all
 * entrants and only then looks at the check crowns the run that gave up.
 * `checked` is only ever written by the check's own exit code (M475), never
 * by what an agent printed, so a `claimed` done is not a pass either.
 *
 * **A pass with no changes cannot win.** The check passing on an untouched
 * tree says the check never tested the task, not that the entrant solved it;
 * it would otherwise win every time on the smallest diff.
 *
 * **An unknown cost is unknown, never zero.** codex, copilot and ACP report
 * no dollar figure (`BACKENDS[b].reportsCost`). Read as $0 they would win
 * every cost comparison for free; here they take the middle of the field on
 * that metric and the reason says the cost was not reported. For the same
 * reason a dollar budget cannot hold an entrant that reports no cost, so a
 * spec that asks for one without a time limit is refused by name.
 *
 * **A tournament without a check is refused.** "The check decides" is the
 * whole idea; without one every entrant's done is a claim, and ranking
 * claims by diff size is ranking by who did the least.
 *
 * Pure: no DOM, no node, no React. `verify:tournament`.
 */

export const TOURNAMENT_ENTRANTS_MIN = 2
/** Each entrant is a live agent and a worktree: more than this is a pool (M132), not a tournament. */
export const TOURNAMENT_ENTRANTS_MAX = 6

export interface TournamentEntrant {
  /** Stable within the tournament; the bracket and the outcome key on it. */
  id: string
  /** What the bracket calls this entrant ("claude · opus"). */
  label: string
  backend: AgentBackend
  /** The backend's model flag, when one is chosen. Absent is the CLI's default. */
  model?: string
  /** M547. The chat panel the entrant runs in — minted by the renderer, which owns panel ids. Required by the runner. */
  panelId?: string
}

export interface TournamentSpec {
  title: string
  /** What every entrant is asked to do — the custom auto mode's task text. */
  task: string
  /** The repository root each entrant's worktree is cut from. */
  root: string
  entrants: TournamentEntrant[]
  /** M475's gate, the same for every entrant. Required. */
  check: AutoCheck
  /** Spend ceiling per entrant in USD. Absent is none. */
  budgetUsd?: number
  /** Wall-clock ceiling per entrant, ms. Absent is none. */
  timeLimitMs?: number
  /** Auto turn limit per entrant; absent is the custom mode's. */
  limit?: number
}

/** What one entrant's run came to: the auto run's verdict, widened by the tournament's own two stops. */
export type EntrantState = 'queued' | 'running' | 'checking' | 'checked' | 'claimed' | 'stuck' | 'over-budget' | 'over-time' | 'stopped'

const FINISHED: ReadonlySet<EntrantState> = new Set(['checked', 'claimed', 'stuck', 'over-budget', 'over-time', 'stopped'])
export const isEntrantFinished = (s: EntrantState): boolean => FINISHED.has(s)

export interface EntrantDiff {
  /** Repo-relative paths the entrant changed since its fork (committed and not). */
  files: string[]
  added: number
  removed: number
}

/** The facts the scorer reads for one entrant. */
export interface EntrantOutcome {
  id: string
  state: EntrantState
  /** USD spent; null when the backend reports no cost. */
  costUsd: number | null
  /** From the first send to the run's end; null while it runs or when it never started. */
  durationMs: number | null
  /** null when the diff could not be read (the worktree is gone, git failed). */
  diff: EntrantDiff | null
  /** Failed checks across the run (M475). */
  checkFailures: number
}

/** How much each metric weighs among PASSING entrants. Lower total is better. */
export const TOURNAMENT_WEIGHTS = { diff: 0.4, overlap: 0.3, cost: 0.2, time: 0.1 } as const
export type TournamentMetric = keyof typeof TOURNAMENT_WEIGHTS

export interface RankedEntrant {
  id: string
  eligible: boolean
  /** 1 is the winner; ineligible entrants are ranked after every eligible one, in the order given. */
  rank: number
  /** Weighted total in [0, 1] for an eligible entrant, lower is better; null for an ineligible one. */
  score: number | null
  /** Each metric's normalised value in [0, 1] (0 is the best of the field). Absent for an ineligible entrant. */
  parts?: Record<TournamentMetric, number>
  /** Files this entrant changed that a lane outside the tournament also changed. */
  overlap: string[]
  /** One sentence: why it is eligible or not, and anything the score had to assume. */
  why: string
}

export interface TournamentScore {
  /** The winning entrant's id, or null when nobody is eligible. */
  winner: string | null
  ranking: RankedEntrant[]
  /** One sentence for the bracket's header. */
  summary: string
}

/**
 * Why an entrant cannot win, or null when it can. In priority order, so the
 * reason named is the first thing that went wrong.
 */
export function ineligibleBecause(o: EntrantOutcome): string | null {
  switch (o.state) {
    case 'checked': break
    case 'claimed': return 'only the agent says it is done — no check confirmed it'
    case 'stuck': return o.checkFailures > 0 ? `its check kept failing (${o.checkFailures} failed)` : 'it stopped before the check passed'
    case 'over-budget': return 'it spent its budget before the check passed'
    case 'over-time': return 'it ran out of time before the check passed'
    case 'stopped': return 'it was stopped'
    default: return 'it has not finished'
  }
  if (o.diff === null) return 'its changes could not be read'
  if (o.diff.files.length === 0) return 'the check passed but it changed nothing, so the pass proves nothing about the task'
  return null
}

/** min-max over the field, 0 the best; every value equal is 0 for all. Unknowns take 0.5. */
function normalise(values: readonly (number | null)[]): number[] {
  const known = values.filter((v): v is number => v !== null)
  if (known.length === 0) return values.map(() => 0.5)
  const lo = Math.min(...known)
  const hi = Math.max(...known)
  return values.map((v) => (v === null ? 0.5 : hi === lo ? 0 : (v - lo) / (hi - lo)))
}

/**
 * The scorer. `otherLaneFiles` is every file a lane OUTSIDE the tournament
 * has changed in the same repository (the collision radar's view): an
 * entrant that touches them will meet that lane at merge, which costs a
 * person time the check never measured. Overlap between entrants themselves
 * is not counted — they all solve the same task, so they touch the same
 * files by construction, and only one of them lands.
 */
export function scoreTournament(outcomes: readonly EntrantOutcome[], otherLaneFiles: readonly string[] = []): TournamentScore {
  const others = new Set(otherLaneFiles)
  const overlapOf = (o: EntrantOutcome): string[] => (o.diff === null ? [] : o.diff.files.filter((f) => others.has(f)).sort())
  const eligible = outcomes.filter((o) => ineligibleBecause(o) === null)
  const size = normalise(eligible.map((o) => (o.diff as EntrantDiff).added + (o.diff as EntrantDiff).removed))
  const overlap = normalise(eligible.map((o) => overlapOf(o).length))
  const cost = normalise(eligible.map((o) => o.costUsd))
  const time = normalise(eligible.map((o) => o.durationMs))
  const scored = eligible.map((o, i) => {
    const parts: Record<TournamentMetric, number> = { diff: size[i], overlap: overlap[i], cost: cost[i], time: time[i] }
    const score = (Object.keys(TOURNAMENT_WEIGHTS) as TournamentMetric[]).reduce((s, m) => s + TOURNAMENT_WEIGHTS[m] * parts[m], 0)
    return { o, parts, score, order: i }
  })
  // Stable: a tie keeps the order the entrants were given, so the same facts always name the same winner.
  scored.sort((a, b) => a.score - b.score || a.order - b.order)
  const ranking: RankedEntrant[] = []
  for (const [i, s] of scored.entries()) {
    const d = s.o.diff as EntrantDiff
    const ov = overlapOf(s.o)
    const notes = [
      `passed its check with ${d.files.length} file${d.files.length === 1 ? '' : 's'} changed (+${d.added} −${d.removed})`,
      ...(s.o.costUsd === null && eligible.length > 1 ? ['its cost was not reported, so cost counted as the middle of the field'] : []),
      ...(ov.length === 0 ? [] : [`${ov.length} of its files ${ov.length === 1 ? 'is' : 'are'} also changed in another lane`])
    ]
    ranking.push({ id: s.o.id, eligible: true, rank: i + 1, score: Math.round(s.score * 1000) / 1000, parts: s.parts, overlap: ov, why: notes.join('; ') })
  }
  for (const o of outcomes) {
    const why = ineligibleBecause(o)
    if (why === null) continue
    ranking.push({ id: o.id, eligible: false, rank: ranking.length + 1, score: null, overlap: overlapOf(o), why })
  }
  const winner = ranking[0]?.eligible === true ? ranking[0].id : null
  const running = outcomes.filter((o) => !isEntrantFinished(o.state)).length
  const passed = eligible.length
  const summary = running > 0
    ? `${running} of ${outcomes.length} still running`
    : winner === null
      ? `no entrant passed the check with a change — nothing to pick`
      : passed === 1
        ? `1 of ${outcomes.length} passed the check`
        : `${passed} of ${outcomes.length} passed the check; ranked by diff size, overlap, cost and time`
  return { winner: running > 0 ? null : winner, ranking, summary }
}

/**
 * A spec from the bridge, by name: anything malformed is refused with a
 * reason, never trimmed into a smaller tournament silently.
 */
export function parseTournament(raw: unknown): { kind: 'ok'; spec: TournamentSpec } | { kind: 'refused'; reason: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { kind: 'refused', reason: 'the tournament is not an object' }
  const r = raw as Record<string, unknown>
  if (typeof r.task !== 'string' || r.task.trim() === '') return { kind: 'refused', reason: 'the tournament says nothing to do' }
  if (typeof r.root !== 'string' || !r.root.startsWith('/')) return { kind: 'refused', reason: 'the tournament names no repository (an absolute path)' }
  if (r.check === undefined) return { kind: 'refused', reason: 'a tournament needs a check — the check is what picks the winner' }
  const check = parseAutoCheck(r.check)
  if (check.kind === 'refused') return { kind: 'refused', reason: check.reason }
  if (!Array.isArray(r.entrants)) return { kind: 'refused', reason: 'the tournament has no entrants' }
  if (r.entrants.length < TOURNAMENT_ENTRANTS_MIN) return { kind: 'refused', reason: `a tournament needs at least ${TOURNAMENT_ENTRANTS_MIN} entrants` }
  if (r.entrants.length > TOURNAMENT_ENTRANTS_MAX) return { kind: 'refused', reason: `a tournament takes at most ${TOURNAMENT_ENTRANTS_MAX} entrants` }
  if (r.budgetUsd !== undefined && (typeof r.budgetUsd !== 'number' || !Number.isFinite(r.budgetUsd) || r.budgetUsd <= 0)) return { kind: 'refused', reason: 'the budget is not a positive sum of money' }
  if (r.timeLimitMs !== undefined && (typeof r.timeLimitMs !== 'number' || !Number.isFinite(r.timeLimitMs) || r.timeLimitMs <= 0)) return { kind: 'refused', reason: 'the time limit is not a positive number of milliseconds' }
  if (r.limit !== undefined && (typeof r.limit !== 'number' || !Number.isInteger(r.limit) || r.limit <= 0)) return { kind: 'refused', reason: 'the turn limit is not a positive whole number' }
  const entrants: TournamentEntrant[] = []
  const ids = new Set<string>()
  for (const [i, e] of r.entrants.entries()) {
    const n = `entrant ${i + 1}`
    if (typeof e !== 'object' || e === null || Array.isArray(e)) return { kind: 'refused', reason: `${n} is not an object` }
    const o = e as Record<string, unknown>
    if (typeof o.id !== 'string' || o.id === '') return { kind: 'refused', reason: `${n} has no id` }
    if (ids.has(o.id)) return { kind: 'refused', reason: `${n} repeats the id ${o.id}` }
    if (!BACKEND_IDS.includes(o.backend as AgentBackend)) return { kind: 'refused', reason: `${n} names an unknown agent` }
    if (o.model !== undefined && (typeof o.model !== 'string' || o.model.trim() === '' || /\s/.test(o.model.trim()))) return { kind: 'refused', reason: `${n}'s model is not one word` }
    if (o.panelId !== undefined && (typeof o.panelId !== 'string' || o.panelId === '')) return { kind: 'refused', reason: `${n}'s panel is not named` }
    const backend = o.backend as AgentBackend
    // A dollar budget is read from the spend meter; a backend with no meter would run past it silently.
    if (r.budgetUsd !== undefined && r.timeLimitMs === undefined && !BACKENDS[backend].reportsCost) {
      return { kind: 'refused', reason: `${BACKENDS[backend].label} reports no cost, so a dollar budget cannot stop ${n} — add a time limit` }
    }
    ids.add(o.id)
    const model = typeof o.model === 'string' ? o.model.trim() : undefined
    const label = typeof o.label === 'string' && o.label.trim() !== '' ? o.label.trim() : model === undefined ? BACKENDS[backend].label : `${BACKENDS[backend].label} · ${model}`
    entrants.push({ id: o.id, label, backend, ...(model === undefined ? {} : { model }), ...(o.panelId === undefined ? {} : { panelId: o.panelId as string }) })
  }
  const task = r.task.trim()
  return {
    kind: 'ok',
    spec: {
      title: typeof r.title === 'string' && r.title.trim() !== '' ? r.title.trim() : task.split('\n')[0].slice(0, 80),
      task, root: r.root, entrants, check: check.check as AutoCheck,
      ...(r.budgetUsd === undefined ? {} : { budgetUsd: r.budgetUsd as number }),
      ...(r.timeLimitMs === undefined ? {} : { timeLimitMs: r.timeLimitMs as number }),
      ...(r.limit === undefined ? {} : { limit: r.limit as number })
    }
  }
}

/** The word a bracket column shows for an entrant's state: one table, every surface. */
export const ENTRANT_STATE_WORDS: Readonly<Record<EntrantState, string>> = {
  queued: 'waiting',
  running: 'working',
  checking: 'checking',
  checked: 'passed',
  claimed: 'unchecked',
  stuck: 'failed',
  'over-budget': 'over budget',
  'over-time': 'out of time',
  stopped: 'stopped'
}

/**
 * M547. The lane rules every entrant is given: appended to the system prompt
 * where the backend takes one, else leading the task text (M319's rule, so a
 * codex entrant is not silently told less).
 */
export const TOURNAMENT_PROMPT = 'You are one of several agents given the same task, each in its own git worktree on its own branch. A check decides: only work that passes it can be kept, and of the passing work the smallest, cleanest change is preferred. Commit your work on this branch as you go. Never push, never open a pull request, and never change files outside this folder.'

/** M547. One entrant as the runner reports it: the spec's row, its lane and what its run has come to. */
export interface EntrantStatus {
  id: string
  label: string
  backend: AgentBackend
  model?: string
  panelId: string
  /** The CLI session the chat pins; the renderer places the chat panel with it. */
  sessionId?: string
  /** The entrant's worktree, once made. */
  path?: string
  branch?: string
  worktreeId?: string
  state: EntrantState
  /** Why an entrant is stuck, stopped or out of the running, in the product's words. */
  reason?: string
  /** USD so far; null when the backend reports no cost. */
  costUsd: number | null
  checkFailures: number
  /** Epoch ms the auto run started and ended. */
  startedAt?: number
  endedAt?: number
  /** Read when the field finishes; null when it could not be read. */
  diff?: EntrantDiff | null
}

export type TournamentState = 'starting' | 'running' | 'scoring' | 'done' | 'stopped'

export interface TournamentStatus {
  id: string
  title: string
  task: string
  root: string
  /** The check's command line. */
  check: string
  state: TournamentState
  entrants: EntrantStatus[]
  /** Present once the field is scored. */
  score?: TournamentScore
  startedAt: number
  endedAt?: number
}

/** The scorer's facts for one entrant, read from its status. */
export function outcomeOf(e: EntrantStatus): EntrantOutcome {
  return {
    id: e.id, state: e.state, costUsd: e.costUsd, checkFailures: e.checkFailures,
    durationMs: e.startedAt !== undefined && e.endedAt !== undefined ? Math.max(0, e.endedAt - e.startedAt) : null,
    diff: e.diff ?? null
  }
}
