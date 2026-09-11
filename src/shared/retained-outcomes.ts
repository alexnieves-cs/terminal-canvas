import type { PersistedRun } from './runs'
import type { PersistedWorkItem, WorkItemState } from './work-items'

/** D11's bounded record of a task after its lane has left the canvas. */
export const RETAINED_OUTCOMES_MAX = 200
export type RetainedExecution = 'not-recorded' | 'completed' | 'failed' | 'stopped' | 'unknown'

export interface RetainedOutcome {
  id: string
  itemId: string
  title: string
  state: WorkItemState
  capturedAt: number
  execution: RetainedExecution
  /** The run was a source when captured; its absence later is rendered as unavailable. */
  runId?: string
  /** Provenance only — never a request to recreate a panel or a session. */
  sourcePanelId: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const STATES: readonly WorkItemState[] = ['todo', 'working', 'review', 'done']
const EXECUTIONS: readonly RetainedExecution[] = ['not-recorded', 'completed', 'failed', 'stopped', 'unknown']

/** Absent is old layout; malformed costs one record and never the history. */
export function parseRetainedOutcomes(raw: unknown, warnings: string[]): RetainedOutcome[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) { warnings.push('replaced a retainedOutcomes field that was not an array'); return [] }
  const seen = new Set<string>()
  const out: RetainedOutcome[] = []
  raw.forEach((entry, index) => {
    if (!isRecord(entry) || !isStr(entry.id) || seen.has(entry.id) || !isStr(entry.itemId) || !isStr(entry.title) ||
      !STATES.includes(entry.state as WorkItemState) || !isNum(entry.capturedAt) ||
      !EXECUTIONS.includes(entry.execution as RetainedExecution) || !isStr(entry.sourcePanelId)) {
      warnings.push(`dropped retained outcome ${isRecord(entry) && isStr(entry.id) ? entry.id : `#${index}`}: malformed record`)
      return
    }
    const runId = isStr(entry.runId) ? entry.runId : undefined
    if (entry.runId !== undefined && runId === undefined) warnings.push(`retained outcome ${entry.id}: malformed run reference dropped`)
    seen.add(entry.id)
    out.push({ id: entry.id, itemId: entry.itemId, title: entry.title, state: entry.state as WorkItemState,
      capturedAt: entry.capturedAt, execution: entry.execution as RetainedExecution, sourcePanelId: entry.sourcePanelId,
      ...(runId === undefined ? {} : { runId }) })
  })
  return out.sort((a, b) => b.capturedAt - a.capturedAt).slice(0, RETAINED_OUTCOMES_MAX)
}

function executionOf(run: PersistedRun): RetainedExecution {
  if (run.endedAt === undefined) return 'unknown'
  const outcomes = run.entries.map((entry) => entry.outcome)
  if (outcomes.some((word) => word === undefined)) return 'unknown'
  if (outcomes.some((word) => word?.startsWith('stopped'))) return 'stopped'
  if (outcomes.some((word) => word !== 'exit 0' && word !== 'a turn' && word !== 'passed' && !word?.startsWith('handed off') && !word?.startsWith('skipped'))) return 'failed'
  return 'completed'
}

/** Capture from facts already in memory, before the close removes its panel. */
export function retainOutcome(item: PersistedWorkItem, runs: readonly PersistedRun[], at: number): RetainedOutcome | null {
  if (item.panelId === undefined) return null
  const run = runs.filter((candidate) => candidate.panelIds.includes(item.panelId as string))
    .sort((a, b) => b.startedAt - a.startedAt)[0]
  return {
    id: `outcome_${item.id}_${at}`.replace(/[^A-Za-z0-9_-]/g, '_'), itemId: item.id, title: item.title,
    state: item.state, capturedAt: at, sourcePanelId: item.panelId,
    execution: run === undefined ? 'not-recorded' : executionOf(run),
    ...(run === undefined ? {} : { runId: run.id })
  }
}

export function retainedNextAction(outcome: RetainedOutcome): string {
  if (outcome.state === 'done') return 'review the retained evidence before closing history'
  if (outcome.state === 'review') return 'review the lane changes'
  return 'start work again when you are ready'
}
