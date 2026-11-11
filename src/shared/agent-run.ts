import type { TranscriptTurn } from './transcript'
import type { PendingPermission } from './agent-session'
import { approvalRisk, type ApprovalRisk } from './approval-risk'

/**
 * M671. ONE AGENT RUN AS STEPS, TOOL CALLS AND APPROVALS — a typed event
 * stream folded by a pure reducer, so the Run timeline is a projection and
 * never a second author.
 *
 * Adopted from Creance's `events.ts` + `run/reduceRun.ts` (MIT, © 2026 Amit
 * Shrivastava, commit c8bfae4; see `src/renderer/supervision/NOTICE.md`) and
 * adapted to this app's stream instead of Creance's own. Two differences are
 * deliberate:
 *
 *   - THE SOURCE IS THE TRANSCRIPT, not a second subscription. Everything a
 *     chat learns arrives over `agent:event` and lands in the chat store as
 *     stored turns and pending requests; `runEventsOf` translates exactly
 *     that into `RunEvent`s. A run rebuilt from the store after a relaunch
 *     is therefore the same run the live panel showed — a timeline that kept
 *     its own copy of the bus would drift from the conversation beside it.
 *   - A STEP IS ONE PROMPT'S WORK (a delivered user message to the next),
 *     not one assistant message: the CLI writes one message per tool call,
 *     which would make every call its own step.
 *
 * Creance's other rule is kept verbatim in spirit: an event for an unknown
 * step or call is IGNORED, never thrown — a live view must survive a stream
 * that is out of order or truncated. Pure and import-free apart from types
 * and the risk judgment, so `verify:agent-run` runs it in plain node.
 */

/** A call's state. `no-result` is a call whose step ended without one (an interrupt, an exit) — never `success`. */
export type RunCallStatus = 'running' | 'success' | 'error' | 'no-result'
export type RunStepStatus = 'running' | 'waiting' | 'done' | 'failed'

export type RunEvent =
  | { type: 'step.started'; stepId: string; title: string; at?: number }
  | { type: 'step.completed'; stepId: string; at?: number }
  | { type: 'step.failed'; stepId: string; error: string; at?: number }
  /** No `stepId`: a call belongs to the step open when it starts. */
  | { type: 'tool.call.started'; callId: string; tool: string; input: Record<string, unknown>; at?: number }
  | { type: 'tool.call.completed'; callId: string; output: string; at?: number }
  | { type: 'tool.call.failed'; callId: string; error: string; at?: number }
  | { type: 'approval.requested'; approvalId: string; tool: string; input: Record<string, unknown>; risk: ApprovalRisk; reason?: string }

export interface RunCall {
  id: string
  stepId: string
  tool: string
  input: Record<string, unknown>
  status: RunCallStatus
  startedAt?: number
  endedAt?: number
  output?: string
  error?: string
}

export interface RunApproval {
  id: string
  stepId?: string
  tool: string
  input: Record<string, unknown>
  risk: ApprovalRisk
  reason?: string
}

export interface RunStep {
  id: string
  title: string
  status: RunStepStatus
  startedAt?: number
  endedAt?: number
  error?: string
  callIds: string[]
}

export interface RunState {
  stepIds: string[]
  steps: Record<string, RunStep>
  calls: Record<string, RunCall>
  /** OPEN requests, in request order: an answered one leaves the pending list, and so leaves the run. */
  approvals: RunApproval[]
  /** The step a new call joins: the last one started and not yet ended. */
  openStepId?: string
}

export const initialRunState: RunState = { stepIds: [], steps: {}, calls: {}, approvals: [] }

function stamp(at: number | undefined, key: 'startedAt' | 'endedAt'): Partial<Record<'startedAt' | 'endedAt', number>> {
  return at === undefined ? {} : { [key]: at }
}

/** Close a step: its calls still running did not finish, and say so. */
function closeStep(state: RunState, stepId: string, change: Partial<RunStep>): RunState {
  const step = state.steps[stepId]
  if (step === undefined) return state
  const calls = { ...state.calls }
  for (const id of step.callIds) {
    const c = calls[id]
    if (c !== undefined && c.status === 'running') calls[id] = { ...c, status: 'no-result' }
  }
  const { openStepId, ...rest } = state
  return {
    ...rest,
    ...(openStepId !== undefined && openStepId !== stepId ? { openStepId } : {}),
    calls,
    steps: { ...state.steps, [stepId]: { ...step, ...change } }
  }
}

/** A step with an open approval waits on the person; otherwise its own state stands. */
function settle(state: RunState): RunState {
  const waitingOn = new Set(state.approvals.map((a) => a.stepId).filter((id): id is string => id !== undefined))
  let steps = state.steps
  for (const id of state.stepIds) {
    const s = steps[id]
    if (s === undefined) continue
    const want: RunStepStatus = waitingOn.has(id) && (s.status === 'running' || s.status === 'waiting') ? 'waiting' : s.status === 'waiting' ? 'running' : s.status
    if (want !== s.status) steps = { ...steps, [id]: { ...s, status: want } }
  }
  return steps === state.steps ? state : { ...state, steps }
}

/** The pure reducer: one event to the next state. Unknown steps and calls are ignored. */
export function reduceRun(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case 'step.started': {
      if (state.steps[event.stepId] !== undefined) return state
      // A new prompt ends the step before it: the conversation moved on.
      const prev = state.openStepId === undefined ? state : closeStep(state, state.openStepId, { status: 'done', ...stamp(event.at, 'endedAt') })
      const step: RunStep = { id: event.stepId, title: event.title, status: 'running', callIds: [], ...stamp(event.at, 'startedAt') }
      return { ...prev, stepIds: [...prev.stepIds, step.id], steps: { ...prev.steps, [step.id]: step }, openStepId: step.id }
    }
    case 'step.completed':
      return settle(closeStep(state, event.stepId, { status: 'done', ...stamp(event.at, 'endedAt') }))
    case 'step.failed':
      return settle(closeStep(state, event.stepId, { status: 'failed', error: event.error, ...stamp(event.at, 'endedAt') }))
    case 'tool.call.started': {
      const stepId = state.openStepId
      const step = stepId === undefined ? undefined : state.steps[stepId]
      if (step === undefined || state.calls[event.callId] !== undefined) return state
      const call: RunCall = { id: event.callId, stepId: step.id, tool: event.tool, input: event.input, status: 'running', ...stamp(event.at, 'startedAt') }
      return { ...state, calls: { ...state.calls, [call.id]: call }, steps: { ...state.steps, [step.id]: { ...step, callIds: [...step.callIds, call.id] } } }
    }
    case 'tool.call.completed':
    case 'tool.call.failed': {
      const call = state.calls[event.callId]
      if (call === undefined) return state
      const next: RunCall = event.type === 'tool.call.completed'
        ? { ...call, status: 'success', output: event.output, ...stamp(event.at, 'endedAt') }
        : { ...call, status: 'error', error: event.error, ...stamp(event.at, 'endedAt') }
      return { ...state, calls: { ...state.calls, [call.id]: next } }
    }
    case 'approval.requested': {
      if (state.approvals.some((a) => a.id === event.approvalId)) return state
      const approval: RunApproval = {
        id: event.approvalId, tool: event.tool, input: event.input, risk: event.risk,
        ...(state.openStepId === undefined ? {} : { stepId: state.openStepId }),
        ...(event.reason === undefined ? {} : { reason: event.reason })
      }
      return settle({ ...state, approvals: [...state.approvals, approval] })
    }
  }
}

/** What a step is titled by: its prompt's first line, cut to a row. */
export function stepTitle(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? ''
  if (line === '') return 'A message with no text'
  return line.length > 80 ? `${line.slice(0, 79)}…` : line
}

/** How the conversation's last turn ended, as the chat store records it. Absent while a turn runs or before any. */
export type RunTail = { live: boolean; lastTurn?: { kind: 'ok' | 'interrupted' | 'error' | 'aborted'; reason?: string; at?: number } }

/**
 * The transcript, pending requests and the turn's ending as `RunEvent`s, in
 * order. Queued and undelivered messages are not steps: the agent never had
 * them (M322's rule for the well, kept here).
 */
export function runEventsOf(turns: readonly TranscriptTurn[], pending: readonly PendingPermission[], tail: RunTail): RunEvent[] {
  const events: RunEvent[] = []
  let open: string | undefined
  for (const turn of turns) {
    const at = typeof turn.at === 'number' ? turn.at : undefined
    if (turn.role === 'user') {
      if (turn.delivery !== undefined) continue
      for (const b of turn.blocks) {
        if (b.type !== 'tool_result') continue
        events.push(b.isError
          ? { type: 'tool.call.failed', callId: b.toolUseId, error: b.content === '' ? 'The tool reported an error with no message.' : b.content, ...(at === undefined ? {} : { at }) }
          : { type: 'tool.call.completed', callId: b.toolUseId, output: b.content, ...(at === undefined ? {} : { at }) })
      }
      const text = turn.blocks.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n')
      const images = turn.blocks.some((b) => b.type === 'image')
      if (text !== '' || images) {
        open = turn.id
        events.push({ type: 'step.started', stepId: turn.id, title: text === '' ? 'An image' : stepTitle(text), ...(at === undefined ? {} : { at }) })
      }
      continue
    }
    for (const b of turn.blocks) {
      if (b.type === 'tool_use') events.push({ type: 'tool.call.started', callId: b.id, tool: b.name, input: b.input, ...(at === undefined ? {} : { at }) })
    }
  }
  for (const p of pending) {
    events.push({ type: 'approval.requested', approvalId: p.requestId, tool: p.toolName, input: p.input, risk: approvalRisk(p.toolName, p.input), ...(p.description === undefined ? {} : { reason: p.description }) })
  }
  // The last step ends when nothing is in flight and nothing waits: a turn
  // still answering, or a question still open, keeps it running.
  if (open !== undefined && !tail.live && pending.length === 0 && tail.lastTurn !== undefined) {
    const at = tail.lastTurn.at
    const when = at === undefined ? {} : { at }
    if (tail.lastTurn.kind === 'ok') events.push({ type: 'step.completed', stepId: open, ...when })
    else events.push({ type: 'step.failed', stepId: open, error: tail.lastTurn.kind === 'interrupted' ? 'Interrupted.' : tail.lastTurn.kind === 'aborted' ? `Stopped${tail.lastTurn.reason === undefined ? '' : ` (${tail.lastTurn.reason})`}.` : 'The turn ended with an error.', ...when })
  } else if (open !== undefined && !tail.live && pending.length === 0 && tail.lastTurn === undefined && turns.length > 0) {
    // A restored conversation: the store has the history but no ending for
    // it. The step is over (nothing runs), and nothing says it failed.
    events.push({ type: 'step.completed', stepId: open })
  }
  return events
}

/** The run, folded. */
export function foldRun(events: readonly RunEvent[]): RunState {
  return events.reduce(reduceRun, initialRunState)
}

/** The calls of a step, in call order. */
export function stepCalls(state: RunState, stepId: string): RunCall[] {
  return (state.steps[stepId]?.callIds ?? []).map((id) => state.calls[id]).filter((c): c is RunCall => c !== undefined)
}
