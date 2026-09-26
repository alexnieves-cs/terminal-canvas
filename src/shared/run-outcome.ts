import type { PersistedRun } from './runs'
import { holdWords, type AgentSessionStatus, type CapHold } from './agent-session'
import { PLAN_TOOL } from './transcript'

/**
 * M184. A RUN'S OUTCOME ON THE DIAGRAM, pure over the run's own record: one
 * word per node key of the run's DEFINITION (the template as it was at the
 * run's start), read from the run's entries through its MAPPING (node key →
 * panel id). Nothing here reads the live template — a later edit never moves
 * a finished run's words, because the words are drawn from the snapshot.
 *
 * The vocabulary is the recorder's own literal outcomes: `exit 0` and
 * `a turn` are finished, `skipped — …` (the word `useHandoff` writes onto a
 * target an `exit-ok`/`exit-fail` fork did NOT fire) is its own word, a
 * `stopped` seal is its own word, any other `exit …` (a signal included)
 * failed. `wants-you` is reserved for the day an entry records a pending
 * question; today no entry does, and `outcomeWord` answers for it so the
 * day it does the vocabulary is already there.
 *
 * M184 (the critic, findings 7, 8 and 11). Four facts that were one word are
 * now four. A key with NO MAPPING was never instantiated (`absent`), a key
 * mapped with no entry is waiting its turn (`queued`), an entry with no
 * outcome on an OPEN run is working, and the same entry on a SEALED run
 * (`endedAt` set) has no outcome and never will (`unknown`) — a block
 * painting `working` for ever on a run that ended hours ago is a confident
 * wrong answer, and `skipped` painted red said a node that never ran failed.
 * Pure: `verify:viewport run.outcome.1`.
 */

export type BlockOutcome =
  | 'absent' | 'queued' | 'working' | 'unknown'
  | 'finished' | 'failed' | 'skipped' | 'stopped' | 'wants-you'

export type RunExecution = 'not-run' | 'queued' | 'running' | 'ended' | 'unknown'
export type RunQueueReason = 'upstream' | 'in-flight' | 'concurrency'
export type RunExecutionResult = 'none' | 'turn-complete' | 'passed' | 'failed' | 'skipped' | 'stopped' | 'unknown'

/**
 * Live facts are a projection of main-owned session/approval state. They are
 * deliberately not a persisted shape: a request id written into a run would
 * become an actionable-looking stale permission after its process exited.
 */
export interface RunLiveApproval {
  requestId: string
  toolName: string
  argument: string
}

export interface RunLiveFact {
  status?: AgentSessionStatus
  turns?: number
  exitCode?: number | null
  exitSignal?: string
  queued?: number
  queuedReason?: 'in-flight' | 'concurrency'
  attention?: boolean
  /** Arrival order; the first is the question every other attention surface shows. */
  approvals?: readonly RunLiveApproval[]
  /** M367. Main's hold at a cap (M350), when the agent is held. A hold is a needs-you (M355). */
  hold?: CapHold
}

/** M200. The same live table for a task's linked conversation. */
export function projectSession(panelId: string, fact: RunLiveFact): RunNodeSupervision {
  const approval = fact.approvals?.[0]
  if (fact.attention === true) {
    if (approval !== undefined) return {
      panelId, execution: 'running', result: 'none', word: 'needs you', tone: 'needs-you', approval,
      // M359. A plan waits to be approved; it is not a tool asking to be used.
      blocker: { kind: 'approval', subject: approval.toolName }, detail: approval.toolName === PLAN_TOOL ? `a plan waits for your approval — ${approval.argument}` : `${approval.toolName} asks to use ${approval.argument}`
    }
    // M367. A HELD agent is not waiting at its keyboard: it asked nothing, and
    // an answer typed into it is refused. Its blocker is the cap, in the
    // hold's own words, and its fix is the queue's Allow or its Work tab.
    if (fact.hold !== undefined) return {
      panelId, execution: 'running', result: 'none', word: 'needs you', tone: 'needs-you',
      blocker: { kind: 'cap', subject: panelId }, detail: `the agent ${holdWords(fact.hold)} — allow it more from Needs you, or stop it`
    }
    return { panelId, execution: 'running', result: 'none', word: 'needs you', tone: 'needs-you', blocker: { kind: 'keyboard', subject: panelId }, detail: 'this session needs you at its keyboard — open it to answer' }
  }
  if ((fact.queued ?? 0) > 0) {
    const reason = fact.queuedReason ?? 'in-flight'
    return { panelId, execution: 'queued', result: 'none', word: 'queued', tone: 'starting', queueReason: reason,
      detail: reason === 'concurrency'
        ? `queued — ${fact.queued} message${fact.queued === 1 ? '' : 's'} waiting for the canvas concurrency ceiling`
        : `queued — ${fact.queued} message${fact.queued === 1 ? '' : 's'} waiting for the current turn to end` }
  }
  if (fact.status === 'disposed') return { panelId, execution: 'ended', result: 'stopped', word: 'stopped', tone: 'asleep', detail: 'execution stopped; the task disposition is unchanged' }
  if (fact.status === 'exited') {
    if (fact.exitCode === 0) return { panelId, execution: 'ended', result: 'passed', word: 'exit 0', tone: 'none', detail: 'execution result — the process exited 0; the task disposition is unchanged' }
    return { panelId, execution: 'ended', result: 'failed', word: 'failed', tone: 'exited', detail: `execution failed${fact.exitCode == null ? '' : ` — exit ${fact.exitCode}`}${fact.exitSignal === undefined ? '' : ` (${fact.exitSignal})`}; the task disposition is unchanged` }
  }
  if (fact.status === 'ready' && (fact.turns ?? 0) > 0) return { panelId, execution: 'ended', result: 'turn-complete', word: 'turn complete', tone: 'none', detail: 'execution result — one agent turn completed; the task disposition is unchanged' }
  if (fact.status === 'ready') return { panelId, execution: 'running', result: 'none', word: 'ready', tone: 'idle', detail: 'the conversation is ready; no task result has been reviewed' }
  if (fact.status === 'starting') return { panelId, execution: 'running', result: 'none', word: 'starting', tone: 'starting', detail: 'the conversation is starting' }
  if (fact.status === 'streaming') return { panelId, execution: 'running', result: 'none', word: 'working', tone: 'working', detail: 'execution is in progress' }
  return { panelId, execution: 'not-run', result: 'none', word: 'not started', tone: 'none', detail: 'the conversation has not started execution' }
}

export interface RunNodeSupervision {
  panelId?: string
  execution: RunExecution
  result: RunExecutionResult
  word: string
  tone: string
  detail: string
  queueReason?: RunQueueReason
  blocker?: { kind: 'approval' | 'keyboard' | 'cap'; subject: string }
  /** Present only for a live structured request, never reconstructed from history. */
  approval?: RunLiveApproval
}

function historical(outcome: string): Pick<RunNodeSupervision, 'execution' | 'result' | 'word' | 'tone' | 'detail'> {
  if (outcome === 'a turn') return { execution: 'ended', result: 'turn-complete', word: 'turn complete', tone: 'none', detail: 'execution result — one agent turn completed; the task disposition is unchanged' }
  if (outcome === 'exit 0') return { execution: 'ended', result: 'passed', word: 'exit 0', tone: 'none', detail: 'execution result — the process exited 0; the task disposition is unchanged' }
  if (outcome === 'passed' || outcome.startsWith('handed off')) return { execution: 'ended', result: 'passed', word: outcome === 'passed' ? 'passed' : 'handed off', tone: 'none', detail: `execution result — ${outcome}; the task disposition is unchanged` }
  if (outcome.startsWith('skipped')) return { execution: 'ended', result: 'skipped', word: 'skipped', tone: 'asleep', detail: outcome }
  if (outcome.startsWith('stopped')) return { execution: 'ended', result: 'stopped', word: 'stopped', tone: 'asleep', detail: outcome }
  return { execution: 'ended', result: 'failed', word: 'failed', tone: 'exited', detail: `execution result — ${outcome}` }
}

/**
 * M199. One run-node table. The immutable record says what ran and ended;
 * the optional live map says why an OPEN entry is blocked now. Live facts
 * never override a recorded outcome and never mutate the run.
 */
export function projectRun(run: PersistedRun, live: Readonly<Record<string, RunLiveFact>> = {}): Record<string, RunNodeSupervision> {
  const out: Record<string, RunNodeSupervision> = {}
  if (run.definition === undefined) return out
  for (const node of run.definition.nodes) {
    const panelId = run.mapping?.[node.key]
    if (panelId === undefined) {
      out[node.key] = { execution: 'not-run', result: 'none', word: 'not run', tone: 'none', detail: 'this node was not instantiated for the run' }
      continue
    }
    const entry = run.entries.find((e) => e.panelId === panelId)
    if (entry === undefined) {
      out[node.key] = { panelId, execution: 'queued', result: 'none', word: 'queued', tone: 'starting', queueReason: 'upstream', detail: 'queued — waiting for upstream work to reach this node' }
      continue
    }
    if (entry.outcome !== undefined) {
      out[node.key] = { panelId, ...historical(entry.outcome) }
      continue
    }
    if (run.endedAt !== undefined) {
      out[node.key] = { panelId, execution: 'unknown', result: 'unknown', word: 'no outcome', tone: 'none', detail: 'the run ended without an execution outcome for this node' }
      continue
    }
    const fact = live[panelId]
    if (fact === undefined) {
      out[node.key] = { panelId, execution: 'running', result: 'none', word: 'working', tone: 'working', detail: 'the run entry is open; this backend has no live queue or approval detail to show' }
      continue
    }
    if (fact?.status === 'exited' || fact?.status === 'disposed') {
      out[node.key] = { panelId, execution: 'unknown', result: 'unknown', word: 'no outcome', tone: 'none', detail: 'the session ended before the run recorded an execution outcome' }
      continue
    }
    out[node.key] = projectSession(panelId, fact)
  }
  return out
}

export function classifyOutcome(outcome: string | undefined): BlockOutcome {
  if (outcome === undefined) return 'working'
  if (outcome === 'exit 0' || outcome === 'a turn' || outcome === 'passed') return 'finished'
  if (outcome.startsWith('handed off')) return 'finished'
  if (outcome.startsWith('skipped')) return 'skipped'
  if (outcome.startsWith('stopped')) return 'stopped'
  return 'failed'
}

/** Aggregate wording for a Runs row; deliberately names execution only. */
export function runOutcomeSummary(open: boolean, outcomes: readonly (string | undefined)[]): { word: string; tone: 'working' | 'exited' | 'asleep' | 'none' } {
  if (open) return { word: 'working', tone: 'working' }
  const classified = outcomes.map(classifyOutcome)
  if (classified.includes('failed')) return { word: 'failed', tone: 'exited' }
  if (classified.includes('stopped')) return { word: 'stopped', tone: 'asleep' }
  return { word: 'run ended', tone: 'none' }
}

export function blockOutcomes(run: PersistedRun): Record<string, BlockOutcome> {
  const out: Record<string, BlockOutcome> = {}
  if (run.definition === undefined) return out
  for (const node of run.definition.nodes) {
    const panelId = run.mapping?.[node.key]
    if (panelId === undefined) { out[node.key] = 'absent'; continue }
    // `recordRunEvent`'s own `find` keeps at most one entry per panel id, so
    // the first match IS the entry — a reversed copy looked for a last one
    // that cannot exist.
    const entry = run.entries.find((e) => e.panelId === panelId)
    if (entry === undefined) { out[node.key] = 'queued'; continue }
    if (entry.outcome === undefined) { out[node.key] = run.endedAt === undefined ? 'working' : 'unknown'; continue }
    out[node.key] = classifyOutcome(entry.outcome)
  }
  return out
}

/** The state vocabulary's word for the tone. */
export function outcomeWord(o: BlockOutcome): string {
  if (o === 'wants-you') return 'needs you'
  if (o === 'absent') return 'not run'
  if (o === 'unknown') return 'no outcome'
  return o
}

/**
 * The `data-tone` the block wears, so the diagram reads the ONE tone block in
 * `styles.css` rather than binding `--blue`/`--green`/`--red` itself (the
 * tone block's own rule: add a state there and every surface follows).
 */
export function outcomeTone(o: BlockOutcome): string {
  if (o === 'working') return 'working'
  if (o === 'finished') return 'idle'
  if (o === 'failed') return 'exited'
  if (o === 'wants-you') return 'needs-you'
  if (o === 'skipped' || o === 'stopped') return 'asleep'
  if (o === 'queued') return 'starting'
  return 'none'
}
