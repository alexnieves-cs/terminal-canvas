import { parseAutoCheck, type AutoCheck } from './auto'
import { BACKENDS, BACKEND_IDS, type AgentBackend } from './agent-backends'
import type { PersistedWorkItem } from './work-items'

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
  /** M548. The board task the tournament is for, echoed on its status so Pick can make the winner that task's lane. */
  itemId?: string
  /** M549. The task's own lane (a worktree record id): not counted as another lane when overlap is scored. */
  homeLaneId?: string
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
  if (r.itemId !== undefined && (typeof r.itemId !== 'string' || r.itemId === '')) return { kind: 'refused', reason: 'the task is not named' }
  if (r.homeLaneId !== undefined && (typeof r.homeLaneId !== 'string' || r.homeLaneId === '')) return { kind: 'refused', reason: 'the task\'s lane is not named' }
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
      ...(r.limit === undefined ? {} : { limit: r.limit as number }),
      ...(r.itemId === undefined ? {} : { itemId: r.itemId as string }),
      ...(r.homeLaneId === undefined ? {} : { homeLaneId: r.homeLaneId as string })
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
export const TOURNAMENT_PROMPT = 'You are one of several agents given the same task, each in its own git worktree on its own branch. A check decides: only work that passes it can be kept, and of the passing work the smallest, cleanest change is preferred. Commit your work on this branch as you go. Never weaken, skip or rewrite the check or the tests it runs to make it pass: the check is run again on your work at the end, and a change to what it runs is shown to the person who picks. Never push, never open a pull request, and never change files outside this folder.'

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
  /** M549. Changed files that look like what the check runs (tests, the manifest, a path the command names): shown before a Pick, never a refusal. */
  checkTouched?: string[]
}

export type TournamentState = 'starting' | 'running' | 'scoring' | 'done' | 'stopped'

export interface TournamentStatus {
  id: string
  title: string
  task: string
  root: string
  /** The check's command line. */
  check: string
  /** M548. The board task, when the tournament was started from one. */
  itemId?: string
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

// ── M548 — starting one from a task, and the bracket's words ──────────────

/** One entrant as a field names it: `claude`, `claude:opus`, `codex:gpt-5`. */
export interface FieldEntry { backend: AgentBackend; model?: string }

/**
 * The field a tournament runs when none is named: two claude models, then
 * every other agent this Mac has, up to four. Two models of one agent is
 * still a real comparison (they write different code), and a Mac with only
 * claude still gets a tournament rather than a refusal.
 */
export function defaultField(available: (b: AgentBackend) => boolean): FieldEntry[] {
  const field: FieldEntry[] = []
  if (available('claude')) field.push({ backend: 'claude', model: 'opus' }, { backend: 'claude', model: 'sonnet' })
  for (const b of ['codex', 'copilot'] as const) if (available(b) && field.length < 4) field.push({ backend: b })
  return field
}

/** A typed field (`claude:opus codex`), by name: an unknown agent or a missing CLI is refused, never dropped. */
export function parseField(text: string, available: (b: AgentBackend) => boolean): { kind: 'ok'; field: FieldEntry[] } | { kind: 'refused'; reason: string } {
  const words = text.trim().split(/[\s,]+/).filter((w) => w !== '')
  const field: FieldEntry[] = []
  for (const w of words) {
    const [name, model, extra] = w.split(':')
    if (!BACKEND_IDS.includes(name as AgentBackend) || extra !== undefined || model === '') return { kind: 'refused', reason: `${w} is not an agent — name one of ${BACKEND_IDS.join(', ')}, optionally as agent:model` }
    const backend = name as AgentBackend
    if (!available(backend)) return { kind: 'refused', reason: BACKENDS[backend].reasons.noCli }
    field.push({ backend, ...(model === undefined ? {} : { model }) })
  }
  if (field.length < TOURNAMENT_ENTRANTS_MIN) return { kind: 'refused', reason: `a tournament needs at least ${TOURNAMENT_ENTRANTS_MIN} entrants` }
  if (field.length > TOURNAMENT_ENTRANTS_MAX) return { kind: 'refused', reason: `a tournament takes at most ${TOURNAMENT_ENTRANTS_MAX} entrants` }
  return { kind: 'ok', field }
}

/**
 * The spec a task card starts, before panel ids: the task's text (title,
 * brief or description, and its acceptance criteria — Tonight's rule) and
 * its check (the card's checks, else its recipe's, joined with `&&`). A
 * task with no check is refused by name, the model's rule reached at the
 * door, so the card can say why before anything is minted.
 */
export function tournamentFromItem(item: PersistedWorkItem, root: string, field: readonly FieldEntry[]): { kind: 'ok'; spec: Record<string, unknown> } | { kind: 'refused'; reason: string } {
  if (item.state === 'done' || item.merged !== undefined) return { kind: 'refused', reason: 'this task is done — a tournament needs open work' }
  const checks = [...(item.checks ?? []), ...(item.checks === undefined || item.checks.length === 0 ? item.recipeUsed?.definition.checks ?? [] : [])].map((c) => c.trim()).filter((c) => c !== '')
  if (checks.length === 0) return { kind: 'refused', reason: 'this task has no check — add one to the task (or its recipe); the check is what picks the winner' }
  const what = (item.brief ?? item.description ?? '').trim()
  const criteria = (item.criteria ?? []).filter((c) => c.trim() !== '')
  const task = [what === '' ? item.title : `${item.title}\n\n${what}`, ...(criteria.length === 0 ? [] : [`Done when:\n${criteria.map((c) => `- ${c}`).join('\n')}`])].join('\n\n')
  return {
    kind: 'ok',
    spec: { title: item.key ?? item.title, task, root, check: { command: checks.join(' && ') }, entrants: field.map((f, i) => ({ id: String.fromCharCode(97 + i), backend: f.backend, ...(f.model === undefined ? {} : { model: f.model }) })) }
  }
}

/**
 * The tone a bracket column wears, from the closed set the renderer's
 * `panel-state.ts` draws (`[data-tone]`): colour comes from there and only
 * there, and this is the one map from an entrant's state into it.
 */
export const ENTRANT_TONES: Readonly<Record<EntrantState, string>> = {
  queued: 'starting', running: 'working', checking: 'working', checked: 'done', claimed: 'idle',
  stuck: 'exited', 'over-budget': 'exited', 'over-time': 'exited', stopped: 'idle'
}

const minutes = (ms: number): string => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))}s` : `${Math.round(ms / 60_000)}m`)

/** A bracket column's facts line: the change, the cost and the time, each only when known. */
export function entrantFacts(e: EntrantStatus, nowMs: number): string {
  const parts: string[] = []
  if (e.diff != null) parts.push(`+${e.diff.added} −${e.diff.removed} in ${e.diff.files.length} file${e.diff.files.length === 1 ? '' : 's'}`)
  else if (e.diff === null) parts.push('changes unread')
  parts.push(e.costUsd === null ? 'cost not reported' : `$${e.costUsd.toFixed(2)}`)
  if (e.startedAt !== undefined) parts.push(minutes((e.endedAt ?? nowMs) - e.startedAt))
  if (e.checkFailures > 0) parts.push(`${e.checkFailures} failed check${e.checkFailures === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/**
 * Whether Pick may take this entrant, or why not. Only a scored field, and
 * only an eligible entrant: picking one the check did not pass would make
 * "the check decides" a suggestion.
 */
export function pickRefusal(st: TournamentStatus | null, entrantId: string | undefined): string | null {
  if (st === null) return 'no tournament has run'
  if (st.score === undefined) return st.state === 'scoring' ? 'the field is still being scored' : 'the tournament is still running — wait, or stop it first'
  const id = entrantId ?? st.score.winner ?? undefined
  if (id === undefined) return 'no entrant passed the check, so there is nothing to pick'
  const ranked = st.score.ranking.find((r) => r.id === id)
  if (ranked === undefined) return `no entrant is called ${id}`
  if (!ranked.eligible) return `${st.entrants.find((e) => e.id === id)?.label ?? id} cannot be picked: ${ranked.why}`
  return null
}

// ── M549 — the judge ──────────────────────────────────────────────────────

/** The judge compares what passed; with fewer than two there is nothing to compare. Null when it may run. */
export function judgeRefusal(st: TournamentStatus | null): string | null {
  if (st === null) return 'no tournament has run'
  if (st.score === undefined) return st.state === 'scoring' ? 'the field is still being scored' : 'the tournament is still running — the judge reads finished work'
  const passed = st.score.ranking.filter((r) => r.eligible).length
  if (passed < 2) return passed === 1 ? 'only one entrant passed the check — there is nothing to compare; pick it' : 'no entrant passed the check, so there is nothing to compare'
  return null
}

/**
 * The judge's one message. It runs READ-ONLY (plan mode) at the repository's
 * main tree, so it can read every entrant's worktree and change none of
 * them; its comparison is advice, and the scorer's winner stands unless a
 * person picks another. Only passing entrants are listed — a failed run's
 * code is not a candidate, and showing it invites "take the best parts" of
 * code that did not pass. Where two entrants each have something the other
 * lacks, it names the files, because combining is the person's next step
 * (the task's Combine tab), never the judge's.
 */
export function judgePrompt(st: TournamentStatus): string {
  const ranked = (st.score?.ranking ?? []).filter((r) => r.eligible)
  const rows = ranked.map((r) => {
    const e = st.entrants.find((x) => x.id === r.id) as EntrantStatus
    const d = e.diff
    return `- ${r.rank}. ${e.label} — branch ${e.branch ?? '(unknown)'}, worktree ${e.path ?? '(unknown)'}; ${d == null ? 'changes unread' : `+${d.added} −${d.removed} in ${d.files.length} file${d.files.length === 1 ? '' : 's'}`}; the scorer's note: ${r.why}${e.checkTouched === undefined ? '' : `; it changed what the check may run: ${e.checkTouched.join(', ')}`}`
  })
  return [
    `You are judging a tournament: ${ranked.length} agents each worked the same task in their own git worktree, and each of the entrants below passed the check \`${st.check}\`.`,
    `The task:\n${st.task}`,
    `The passing entrants, in the scorer's order (smaller change, less overlap with other lanes, lower cost and time rank first):\n${rows.join('\n')}`,
    'Read each worktree\'s changes against where its branch forked from the main branch (for example `git -C <worktree> diff $(git -C <worktree> merge-base HEAD <the main tree\'s branch>)`). Change nothing: do not edit, commit, push or run anything that writes.',
    'Then write a short comparison, at most twelve lines: what each entrant did differently, any risk the check would not catch, and which one you would keep and why. If two entrants each have a part worth keeping, name the files to take from each — the person can put them together with Combine on the task.'
  ].join('\n\n')
}
