import { buildMergeBaseArgs, buildUntrackedArgs } from './git-args'
import type { GitRunner } from './review-engine'
import type { AutoCheck, AutoModeId } from '../shared/auto'
import type { AgentCreateResult, AgentSessionEvent, AgentSessionSpec, AutoStartResult } from '../shared/agent-session'
import { BACKENDS } from '../shared/agent-backends'
import {
  isEntrantFinished, outcomeOf, scoreTournament, TOURNAMENT_PROMPT,
  type EntrantDiff, type EntrantStatus, type TournamentSpec, type TournamentStatus
} from '../shared/tournament'

/**
 * M547. The tournament runner: main's half of a tournament, pure over
 * injected deps (the worktree manager, the chat create door, the manager's
 * auto door and events, the spend meter, a git reader, a clock and a timer)
 * so `verify:tournament runner.*` drives every branch with fakes.
 *
 * In order, per entrant and all at once: a worktree for the entrant's panel
 * (`ensureForPanel`, the same lane-maker a dispatched task uses), the chat
 * through the SAME create door the renderer's `agent:create` takes (the
 * Places gate, the CLI probe and the baseline capture all hold), then an
 * auto run of the task with the tournament's check (M475). The runner never
 * decides an entrant passed: it reads the auto run's own verdict, so
 * `checked` is still only ever written by the check's exit code.
 *
 * Three rules a reader relies on:
 * - **All entrants run at once.** Unlike Tonight, the point is to compare
 *   them on the same task at the same moment; M82's concurrency ceiling still
 *   queues their sends, so the canvas's own limit is never exceeded.
 * - **The runner stops an entrant, never kills it.** A budget or time limit
 *   crossing calls `stopAuto` (the run's own stop), and the entrant is
 *   marked over-budget or over-time when that stop lands. A worktree is
 *   never removed here: losing lanes are discarded only when a person picks
 *   a winner (M548), because a person may want to read a loser first.
 * - **The field is scored once, when every entrant has finished** — or when
 *   the tournament is stopped, so a stopped tournament still says who had
 *   passed. Scoring reads each lane's diff from git, never from the agent.
 */

export interface TournamentDeps {
  /** A worktree for the panel in the repository (the worktree manager's `ensureForPanel`, plus its record's id). */
  lane(panelId: string, root: string): Promise<{ kind: 'lane'; path: string; branch: string; worktreeId?: string; head?: string } | { kind: 'refused'; reason: string }>
  /** The chat create door the renderer's `agent:create` uses. */
  create(spec: AgentSessionSpec): AgentCreateResult
  startAuto(panelId: string, opts: { mode: AutoModeId; task: string; limit?: number; check?: AutoCheck }): AutoStartResult
  stopAuto(panelId: string): boolean
  /** The manager's events: `auto` events, and a `disposed` status (the entrant's chat was closed). */
  subscribe(cb: (event: AgentSessionEvent) => void): () => void
  /** A chat's spend so far, USD (its meter across processes). */
  spentOf(panelId: string): number
  /** Files, lines added and removed in a lane since `base` (its fork point, when recorded); null when it cannot be read. */
  diffOf(path: string, base?: string): Promise<EntrantDiff | null>
  /**
   * The tournament's check, run once more in a lane at scoring: true only on
   * a pass. Absent, a pass stands as the run reported it.
   */
  recheck?(path: string, check: AutoCheck): Promise<boolean>
  /** Every file lanes OUTSIDE the tournament have changed in the same repository. */
  otherLaneFiles(root: string, exclude: readonly string[], homeLaneId?: string): Promise<string[]>
  mintSessionId(): string
  mintId(): string
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  onStatus?(status: TournamentStatus): void
}

export interface TournamentRunner {
  /** Makes every lane and chat, starts every run, and answers once all have started (or failed to). */
  start(spec: TournamentSpec): Promise<{ kind: 'started'; status: TournamentStatus } | { kind: 'refused'; reason: string }>
  /** True when a tournament was live: every running entrant is stopped and the field is scored as it stands. */
  stop(): boolean
  status(): TournamentStatus | null
  /** The app is quitting: every run is stopped, nothing is scored, nothing more is started. */
  dispose(): void
}

interface Row {
  status: EntrantStatus
  /** Spend on this panel before the run began: a reused chat's earlier turns are not this entrant's. */
  baseline: number
  /** Set when the runner itself stopped the run, so the stop that lands reads as the limit it was. */
  stoppedFor?: 'over-budget' | 'over-time'
  timer: unknown
  /** True inside `startAuto`: a refused start resolves stuck synchronously, and the refusal path decides. */
  starting: boolean
  /** The lane's HEAD when it was cut: the diff is measured from here, not from wherever the main tree has moved since. */
  head?: string
}

interface Live {
  spec: TournamentSpec
  status: TournamentStatus
  rows: Map<string, Row>
  unsubscribe: () => void
}

export function createTournamentRunner(deps: TournamentDeps): TournamentRunner {
  let live: Live | null = null
  let last: TournamentStatus | null = null
  let disposed = false
  let opening = false

  const snapshot = (st: TournamentStatus): TournamentStatus => ({ ...st, entrants: st.entrants.map((e) => ({ ...e, ...(e.diff == null ? {} : { diff: { ...e.diff, files: [...e.diff.files] } }) })) })
  const publish = (t: Live): void => {
    if (live !== t) return
    last = snapshot(t.status)
    deps.onStatus?.(last)
  }

  const cost = (row: Row): number | null => (BACKENDS[row.status.backend].reportsCost ? Math.max(0, deps.spentOf(row.status.panelId) - row.baseline) : null)

  const settle = (row: Row, state: EntrantStatus['state'], reason?: string): void => {
    if (row.timer !== null) { deps.clearTimer(row.timer); row.timer = null }
    row.status.state = state
    if (reason !== undefined) row.status.reason = reason
    else delete row.status.reason
    row.status.endedAt ??= deps.now()
  }

  /** Every entrant finished: read the lanes and score. Runs once per tournament. */
  const score = async (t: Live, final: 'done' | 'stopped'): Promise<void> => {
    if (live !== t || t.status.state === 'scoring') return
    t.unsubscribe()
    t.status.state = 'scoring'
    publish(t)
    const rows = [...t.rows.values()]
    // A pass is re-run on the tree as it stands NOW, one lane at a time (two
    // test runs at once fight over ports and caches): the chat stays live
    // after its run ends, so the tree that gets ranked and Picked may not be
    // the tree the check passed on.
    const recheck = deps.recheck
    if (recheck !== undefined) {
      for (const row of rows) {
        if (row.status.state !== 'checked' || row.status.path === undefined) continue
        let passed = false
        try { passed = await recheck(row.status.path, t.spec.check) } catch { passed = false }
        if (live !== t) return
        if (!passed) { row.status.state = 'claimed'; row.status.reason = 'its check failed when it was run again at scoring' }
      }
    }
    const read = async (row: Row): Promise<EntrantDiff | null> => {
      if (row.status.path === undefined) return null
      try { return await deps.diffOf(row.status.path, row.head) } catch { return null }
    }
    const diffs = await Promise.all(rows.map(read))
    const paths = rows.map((r) => r.status.path).filter((p): p is string => p !== undefined)
    let others: string[] = []
    try { others = await deps.otherLaneFiles(t.spec.root, paths, t.spec.homeLaneId) } catch { others = [] }
    if (live !== t) return
    rows.forEach((row, i) => {
      row.status.diff = diffs[i]
      const touched = checkTouched(diffs[i], t.spec.check.command)
      if (touched.length > 0) row.status.checkTouched = touched
    })
    t.status.score = scoreTournament(t.status.entrants.map(outcomeOf), others)
    t.status.state = final
    t.status.endedAt = deps.now()
    publish(t)
    live = null
  }

  const allFinished = (t: Live): boolean => t.status.entrants.every((e) => isEntrantFinished(e.state))

  /** The runner's stop did not land (the chat is already gone): no event will follow, so the limit settles here. */
  const stopFor = (t: Live, row: Row, why: 'over-budget' | 'over-time'): void => {
    row.stoppedFor = why
    let stopped = false
    try { stopped = deps.stopAuto(row.status.panelId) } catch { stopped = false }
    if (stopped || live !== t || isEntrantFinished(row.status.state)) return
    settle(row, why, why === 'over-budget' ? `it spent its $${(t.spec.budgetUsd ?? 0).toFixed(2)} budget` : 'it ran past its time limit')
    publish(t)
    if (allFinished(t)) void score(t, 'done')
  }

  const onAuto = (t: Live, e: AgentSessionEvent): void => {
    if (live !== t) return
    // The entrant's chat was closed (by hand, or an undo of the placement):
    // its run ends with no auto event, so it settles here or the field never finishes.
    if (e.type === 'status' && e.status === 'disposed') {
      const row = t.rows.get(e.id)
      if (row === undefined || isEntrantFinished(row.status.state) || row.status.startedAt === undefined) return
      settle(row, 'stopped', 'its chat was closed')
      publish(t)
      if (allFinished(t)) void score(t, 'done')
      return
    }
    if (e.type !== 'auto') return
    const row = t.rows.get(e.id)
    if (row === undefined || isEntrantFinished(row.status.state)) return
    if (row.starting && e.state !== 'running') return
    row.status.costUsd = cost(row)
    if (e.checkFailures !== undefined) row.status.checkFailures = e.checkFailures
    if (e.state === 'running') {
      row.status.state = e.checking === true ? 'checking' : 'running'
      const budget = t.spec.budgetUsd
      // Never while its check runs: the money is already spent, and stopping
      // would only abort the check that decides whether it was worth it.
      if (budget !== undefined && e.checking !== true && row.stoppedFor === undefined && row.status.costUsd !== null && row.status.costUsd >= budget) {
        stopFor(t, row, 'over-budget')
        return
      }
      publish(t)
      return
    }
    if (e.state === 'done') settle(row, e.verdict === 'checked' ? 'checked' : 'claimed')
    else if (row.stoppedFor === 'over-budget') settle(row, 'over-budget', `it spent its $${(t.spec.budgetUsd ?? 0).toFixed(2)} budget`)
    else if (row.stoppedFor === 'over-time') settle(row, 'over-time', 'it ran past its time limit')
    else if (e.state === 'stuck') settle(row, 'stuck', e.reason === 'check' ? 'its check kept failing' : e.reason === undefined ? 'it stopped without a reason' : `it stopped: ${e.reason}`)
    else settle(row, 'stopped', 'it was stopped by hand')
    publish(t)
    if (allFinished(t)) void score(t, 'done')
  }

  /** One entrant, in order: its lane, its chat, its run. Every refusal is the entrant's, named; the rest go on. */
  const enter = async (t: Live, row: Row): Promise<void> => {
    const s = row.status
    const lane = await deps.lane(s.panelId, t.spec.root)
    // A lane made after a stop is still named, so the bracket says where it is.
    if (lane.kind === 'lane') {
      s.path = lane.path
      s.branch = lane.branch
      if (lane.worktreeId !== undefined) s.worktreeId = lane.worktreeId
      if (lane.head !== undefined) row.head = lane.head
    }
    // Stopped while the lane was being made: nothing more is started for it.
    if (live !== t || isEntrantFinished(s.state)) return
    if (lane.kind === 'refused') { settle(row, 'stuck', `no worktree: ${lane.reason}`); return }
    const appends = BACKENDS[s.backend].appendsPrompt
    const sessionId = deps.mintSessionId()
    const created = deps.create({
      id: s.panelId, cwd: lane.path, sessionId, backend: s.backend,
      ...(s.model === undefined ? {} : { agentOptions: { model: s.model } }),
      ...(appends ? { appendSystemPrompt: TOURNAMENT_PROMPT } : {})
    })
    if (created.kind === 'refused') { settle(row, 'stuck', `no chat: ${created.reason}`); return }
    // `create` is idempotent by id: a live session under this panel id keeps
    // its own folder, and the run would then happen outside the entrant's lane.
    if (created.snapshot.cwd !== lane.path) { settle(row, 'stuck', 'its panel already runs a chat in another folder'); return }
    s.sessionId = sessionId
    row.baseline = deps.spentOf(s.panelId)
    s.state = 'running'
    s.startedAt = deps.now()
    row.starting = true
    let started: AutoStartResult
    try {
      started = deps.startAuto(s.panelId, {
        mode: 'custom',
        task: appends ? t.spec.task : `${TOURNAMENT_PROMPT}\n\n${t.spec.task}`,
        check: t.spec.check,
        ...(t.spec.limit === undefined ? {} : { limit: t.spec.limit })
      })
    } catch (err) {
      started = { kind: 'refused', reason: err instanceof Error ? err.message : String(err) }
    } finally {
      row.starting = false
    }
    if (started.kind === 'refused') { settle(row, 'stuck', `the run did not start: ${started.reason}`); return }
    const limit = t.spec.timeLimitMs
    if (limit !== undefined) {
      row.timer = deps.setTimer(() => {
        row.timer = null
        if (live !== t || isEntrantFinished(s.state) || row.stoppedFor !== undefined) return
        stopFor(t, row, 'over-time')
      }, limit)
    }
  }

  const halt = (t: Live, reason: string): void => {
    for (const row of t.rows.values()) {
      if (isEntrantFinished(row.status.state)) continue
      const wasRunning = row.status.startedAt !== undefined
      settle(row, 'stopped', reason)
      if (wasRunning) { try { deps.stopAuto(row.status.panelId) } catch { /* the run may already be gone */ } }
    }
  }

  return {
    async start(spec) {
      if (disposed) return { kind: 'refused', reason: 'the app is quitting' }
      if (live !== null || opening) return { kind: 'refused', reason: 'a tournament is already running — stop it first' }
      const unnamed = spec.entrants.find((e) => e.panelId === undefined)
      if (unnamed !== undefined) return { kind: 'refused', reason: `${unnamed.label} has no panel to run in` }
      const panels = spec.entrants.map((e) => e.panelId as string)
      if (new Set(panels).size !== panels.length) return { kind: 'refused', reason: 'two entrants name the same panel' }
      opening = true
      const now = deps.now()
      const t: Live = {
        spec,
        status: {
          id: deps.mintId(), title: spec.title, task: spec.task, root: spec.root, check: spec.check.command, state: 'starting', startedAt: now, ...(spec.itemId === undefined ? {} : { itemId: spec.itemId }),
          entrants: spec.entrants.map((e) => ({ id: e.id, label: e.label, backend: e.backend, ...(e.model === undefined ? {} : { model: e.model }), panelId: e.panelId as string, state: 'queued' as const, costUsd: BACKENDS[e.backend].reportsCost ? 0 : null, checkFailures: 0 }))
        },
        rows: new Map(),
        unsubscribe: () => {}
      }
      for (const status of t.status.entrants) t.rows.set(status.panelId, { status, baseline: 0, timer: null, starting: false })
      live = t
      opening = false
      // Subscribed BEFORE the first run starts, so no entrant's first event is missed.
      t.unsubscribe = deps.subscribe((e) => { try { onAuto(t, e) } catch { /* one bad event must not end the field */ } })
      publish(t)
      await Promise.all([...t.rows.values()].map((row) => enter(t, row).catch((err: unknown) => {
        if (!isEntrantFinished(row.status.state)) settle(row, 'stuck', `it could not start: ${err instanceof Error ? err.message : String(err)}`)
      })))
      // Stopped (or quit) while the lanes were being made: say what it came to, start nothing more.
      if (live !== t || t.status.state !== 'starting') return { kind: 'started', status: snapshot(live === t ? t.status : last ?? t.status) }
      t.status.state = 'running'
      publish(t)
      // Every entrant refused, or each run ended before this line: score now, since no event will come.
      if (allFinished(t)) void score(t, 'done')
      return { kind: 'started', status: snapshot(t.status) }
    },
    stop() {
      const t = live
      if (t === null || t.status.state === 'scoring') return false
      halt(t, 'the tournament was stopped')
      void score(t, 'stopped')
      return true
    },
    status() {
      return live === null ? last : snapshot(live.status)
    },
    dispose() {
      disposed = true
      const t = live
      if (t === null) return
      halt(t, 'the app quit')
      t.unsubscribe()
      t.status.state = 'stopped'
      t.status.endedAt = deps.now()
      publish(t)
      live = null
    }
  }
}

const nulList = (s: string): string[] => s.split('\0').filter((p) => p !== '')

/**
 * M547. What a lane changed since it forked from the main tree's branch:
 * committed and uncommitted tracked edits (`diff --numstat` from the
 * merge-base against the WORKING TREE, because an agent mid-task has often
 * not committed) and untracked files, counted by their lines. Read-only:
 * `rev-parse`, `merge-base`, `diff`, `ls-files` and reading files — never
 * `add -N`, which would change the index of a lane an agent is in.
 * Binary files count as one changed file with no lines.
 */
export async function readEntrantDiff(git: GitRunner, lane: string, readText: (path: string) => string | null, fork?: string): Promise<EntrantDiff | null> {
  const base = fork ?? await mergeBaseOf(git, lane)
  if (base === null) return null
  // `--no-optional-locks`: a plain `git diff` refreshes the index and takes
  // its lock, in a lane an agent may be committing in.
  const num = await git(['--no-optional-locks', '-C', lane, 'diff', '--numstat', '-z', '--no-renames', base])
  if (!num.ok) return null
  const files = new Set<string>()
  let added = 0
  let removed = 0
  // `-z --numstat`: "<added>\t<removed>\t<path>\0" per file; a binary file is "-\t-\t<path>".
  for (const rec of nulList(num.stdout)) {
    const m = /^(-|\d+)\t(-|\d+)\t(.+)$/s.exec(rec)
    if (m === null) continue
    files.add(m[3])
    if (m[1] !== '-') added += Number(m[1])
    if (m[2] !== '-') removed += Number(m[2])
  }
  const others = await git(buildUntrackedArgs(lane))
  if (!others.ok) return null
  for (const p of nulList(others.stdout)) {
    files.add(p)
    const text = readText(`${lane}/${p}`)
    // A NUL in the text is a binary file: one changed file, no lines.
    if (text !== null && text !== '' && !text.includes('\0')) added += text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  }
  return { files: [...files].sort(), added, removed }
}

/** With no fork point recorded: the merge-base with the main tree's HEAD, which holds while the main tree stays on its branch. */
async function mergeBaseOf(git: GitRunner, lane: string): Promise<string | null> {
  const common = await git(['-C', lane, 'rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (!common.ok) return null
  const mainDir = common.stdout.trim().replace(/\/\.git\/?$/, '')
  const mainBranch = await git(['-C', mainDir, 'rev-parse', 'HEAD'])
  if (!mainBranch.ok) return null
  const base = await git(buildMergeBaseArgs(lane, mainBranch.stdout.trim()))
  return base.ok ? base.stdout.trim() : null
}

/**
 * M549. Files an entrant changed that look like what its check runs: the
 * package manifest, build files, test files, and any path the check command
 * names. An entrant can pass a check by weakening it, and a weakened check
 * often makes the smallest diff; this is SHOWN beside the entrant, never a
 * refusal, because adding a test is often the task.
 */
export function checkTouched(diff: EntrantDiff | null, command: string): string[] {
  if (diff == null) return []
  const words = new Set(command.split(/[\s"'=]+/).filter((w) => w.includes('/') || w.includes('.')).map((w) => w.replace(/^\.\//, '')))
  const shape = /(^|\/)(package\.json|Makefile|justfile|Cargo\.toml|pyproject\.toml|tsconfig[^/]*\.json|[^/]*\.(test|spec)\.[a-z]+|__tests__\/.*|tests?\/.*)$/
  return diff.files.filter((f) => shape.test(f) || words.has(f) || [...words].some((w) => w.endsWith('/') && f.startsWith(w)))
}
