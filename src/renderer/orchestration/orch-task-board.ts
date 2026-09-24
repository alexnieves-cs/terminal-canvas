import type { Tone } from '@renderer/panels/panel-state'
import type { WorkItemState } from '@shared/work-items'
import type { CheckTally, QueueDecision, TaskGroup } from '@renderer/shell/task-queue'

/**
 * M325. ORCHESTRATE'S DEFAULT VIEW — the tasks, grouped by what they need.
 *
 * The page used to open on the diorama: platforms, a roster, an inspector, an
 * activity feed and a workbench at once, and the next useful action had to be
 * read out of all five. With ten tasks running, the question a person brings
 * to this page is "which one is stuck, why, and what do I do" — so the page
 * now opens on a LIST of tasks in four groups, in the order a person scans:
 *
 * - **Needs attention** — an agent is stopped on the person (a permission, a
 *   question, a keyboard), a check failed, or a decision was lost at a
 *   restart. The task queue's own judgment (`task-queue.ts`), never a second
 *   one: this module re-derives nothing the queue already decided.
 * - **Running** — work is under way, or the task has not started yet.
 * - **Ready for review** — the agent finished with changes nobody has read.
 * - **Completed** — accepted or marked done. History, so the view folds it.
 *
 * Each row carries the task, the agents working on it (idle ones counted,
 * not listed), ONE concrete status sentence, its check results, and ONE
 * action — the queue's next step where it has one. An inline answer is
 * offered only where the response fits in the row (a permission, a reply);
 * everything else opens the task's workspace (`focus/FocusTask.tsx`) on the
 * side that answers it.
 *
 * Pure: no DOM, no React. `verify:orchestration board.*`.
 */

export type BoardGroupId = 'attention' | 'running' | 'review' | 'done'

export const BOARD_GROUPS: readonly { id: BoardGroupId; label: string }[] = [
  { id: 'attention', label: 'Needs attention' },
  { id: 'running', label: 'Running' },
  { id: 'review', label: 'Ready for review' },
  { id: 'done', label: 'Completed' }
]

/** The focus view's sides a board action may open on (a subset of `FocusSide`). */
export type BoardSide = 'changes' | 'checks' | 'review' | 'plan'

export type BoardAction =
  /** A pending permission, answered in the row through the one approval door. */
  | { kind: 'answer'; panelId: string; requestId: string; label: string }
  /** An agent asked a question: a reply box in the row, sent through the composer's own door. */
  | { kind: 'reply'; panelId: string; label: string }
  /** Open the task's workspace, on a side when one answers the need. */
  | { kind: 'open'; side?: BoardSide; label: string }
  /** The task has no conversation yet: Start work. */
  | { kind: 'start'; label: string }
  /** A session no task owns: the canvas is where it lives. */
  | { kind: 'jump'; panelId: string; label: string }

export interface BoardAgentInput {
  id: string
  title: string
  kind: string
  /** The roster's own state and tone; `word` is the state as the roster says it. */
  state: string
  word?: string
  tone: Tone | string
}

export interface BoardAgent extends BoardAgentInput {
  /** Waiting for nothing and doing nothing — collapsed into a count on the row. */
  idle: boolean
}

export interface BoardItemInput {
  id: string
  title: string
  state: WorkItemState
  panelId?: string
  merged?: { into: string }
}

export interface BoardHandoffInput {
  state: string
  standing: string
  detail: string
  changes?: { files: number }
}

export interface BoardPlanInput {
  /** Steps in the plan, and how many of them are verified. */
  steps: number
  verified: number
  /** The step that most needs the person, in words ("Verify integration — failed"), or null. */
  attention: string | null
}

export interface BoardInput {
  items: readonly BoardItemInput[]
  /** The task's member panels (M203's membership). */
  membersOf: (itemId: string) => readonly string[]
  /** Roster rows by panel id — the agents' state, as the page already reads it. */
  agentOf: (panelId: string) => BoardAgentInput | undefined
  /** The task queue's groups — the ONE judgment of what needs the person. */
  groups: readonly Pick<TaskGroup, 'itemId' | 'title' | 'severity' | 'why' | 'next' | 'decisions' | 'oldest'>[]
  checks: Readonly<Record<string, CheckTally>>
  handoffOf: (itemId: string) => BoardHandoffInput | undefined
  planOf?: (itemId: string) => BoardPlanInput | undefined
}

export interface BoardRow {
  /** The item id, or `untasked:<panel>` for decisions no task owns. */
  key: string
  itemId: string | null
  title: string
  group: BoardGroupId
  /** The agents that are doing or waiting on something, first. */
  agents: BoardAgent[]
  /** Agents with nothing to do right now — counted, not listed. */
  idle: number
  status: string
  checks: CheckTally & { text: string }
  action: BoardAction
  /** What else waits on the person in this task, beyond the action's own decision. */
  more: number
  /** The plan's progress in words, when the task has one. */
  plan?: string
}

export interface TaskBoard {
  groups: { id: BoardGroupId; label: string; rows: BoardRow[] }[]
  /** One line for the page's header: counts per group, the first group's first. */
  headline: string
}

/** An agent is idle when it is neither working nor waiting on anyone. */
const IDLE_STATES: readonly string[] = ['idle', 'passed', 'exited', 'unknown', 'watching']
export function agentIsIdle(a: Pick<BoardAgentInput, 'state' | 'tone'>): boolean {
  return a.tone !== 'needs-you' && IDLE_STATES.includes(a.state)
}

export function checksText(t: CheckTally | undefined): string {
  if (t === undefined || t.passed + t.failed === 0) return 'No checks run'
  if (t.failed === 0) return `${t.passed} passed`
  if (t.passed === 0) return `${t.failed} failed`
  return `${t.failed} failed · ${t.passed} passed`
}

/** "Build and Test are working", "Build is working; 2 idle". The roster's words, joined. */
export function agentsSentence(agents: readonly BoardAgent[]): string {
  const busy = agents.filter((a) => !a.idle && a.tone !== 'needs-you')
  const waiting = agents.filter((a) => a.tone === 'needs-you')
  const idle = agents.filter((a) => a.idle)
  const names = (xs: readonly BoardAgent[]): string => (xs.length <= 2 ? xs.map((a) => a.title).join(' and ') : `${xs[0]!.title} and ${xs.length - 1} others`)
  const parts: string[] = []
  if (waiting.length > 0) parts.push(`${names(waiting)} ${waiting.length === 1 ? 'is' : 'are'} waiting on you`)
  if (busy.length > 0) parts.push(`${names(busy)} ${busy.length === 1 ? 'is' : 'are'} working`)
  if (parts.length === 0 && idle.length > 0) parts.push(idle.length === 1 ? `${idle[0]!.title} is idle — its last turn ended` : `${idle.length} agents are idle — their last turns ended`)
  else if (idle.length > 0) parts.push(`${idle.length} idle`)
  return parts.join('; ')
}

/** The queue's next step, as a row action — inline where the answer fits in a row. */
function actionFromGroup(g: Pick<TaskGroup, 'next' | 'decisions'>, hasItem: boolean): BoardAction {
  const first: QueueDecision | undefined = g.decisions[0]
  if (first?.kind === 'permission' && first.inbox?.approval !== undefined) {
    return { kind: 'answer', panelId: first.inbox.approval.id, requestId: first.inbox.approval.requestId, label: g.next.label }
  }
  if (first?.kind === 'question' && first.evidence.kind === 'decision') {
    return { kind: 'reply', panelId: first.evidence.panelId, label: g.next.label }
  }
  if (!hasItem) {
    const ev = g.next.evidence
    const panelId = ev.kind === 'review' ? '' : ev.panelId
    return { kind: 'jump', panelId, label: 'Open on canvas' }
  }
  const ev = g.next.evidence.kind
  const side: BoardSide | undefined = ev === 'output' ? 'checks' : ev === 'review' ? 'changes' : undefined
  return { kind: 'open', ...(side === undefined ? {} : { side }), label: g.next.label }
}

export function buildTaskBoard(input: BoardInput): TaskBoard {
  const rows: BoardRow[] = []
  const agentsOf = (ids: readonly string[]): BoardAgent[] => {
    const out: BoardAgent[] = []
    for (const id of ids) {
      const a = input.agentOf(id)
      if (a === undefined) continue
      // A card, a file, a review node is membership, not an agent.
      if (a.kind !== 'chat' && a.kind !== 'terminal' && a.kind !== 'watcher') continue
      out.push({ ...a, idle: agentIsIdle(a) })
    }
    // Waiting first, then working, then idle — the order a person reads a row in.
    const rank = (a: BoardAgent): number => (a.tone === 'needs-you' ? 0 : a.idle ? 2 : 1)
    return out.sort((x, y) => rank(x) - rank(y))
  }
  const groupOf = new Map(input.groups.filter((g) => g.itemId !== null).map((g) => [g.itemId as string, g]))

  for (const item of input.items) {
    const agents = agentsOf(input.membersOf(item.id))
    const tally = input.checks[item.id]
    const checks = { passed: tally?.passed ?? 0, failed: tally?.failed ?? 0, text: checksText(tally) }
    const h = input.handoffOf(item.id)
    const plan = input.planOf?.(item.id)
    const planWords = plan === undefined ? undefined : `Plan ${plan.verified} of ${plan.steps} verified${plan.attention === null ? '' : ` · ${plan.attention}`}`
    const g = groupOf.get(item.id)
    const shown = agents.filter((a) => !a.idle)
    const base = { key: item.id, itemId: item.id, title: item.title, agents: shown, idle: agents.length - shown.length, checks, ...(planWords === undefined ? {} : { plan: planWords }) }

    if (g !== undefined && g.severity !== 'review') {
      rows.push({ ...base, group: 'attention', status: g.why, action: actionFromGroup(g, true), more: Math.max(0, g.decisions.length - 1) })
      continue
    }
    const accepted = item.merged !== undefined || h?.state === 'accepted'
    if (item.state === 'done' || accepted) {
      rows.push({
        ...base, group: 'done',
        status: item.merged !== undefined ? `Accepted — merged into ${item.merged.into}.` : accepted ? (h?.detail ?? 'Accepted.') : 'Marked done.',
        action: { kind: 'open', label: 'Open' }, more: 0
      })
      continue
    }
    if (g !== undefined) {
      rows.push({ ...base, group: 'review', status: g.why, action: actionFromGroup(g, true), more: Math.max(0, g.decisions.length - 1) })
      continue
    }
    // A member waiting on the person that the queue has not grouped (a
    // terminal at its keyboard is not an inbox item) still needs attention.
    const waiting = agents.find((a) => a.tone === 'needs-you')
    if (waiting !== undefined || h?.state === 'blocked') {
      rows.push({
        ...base, group: 'attention',
        status: waiting !== undefined ? `Stopped — ${waiting.title} is waiting on you.` : (h?.detail ?? 'Stopped — an agent is waiting on you.'),
        // The label names the agent, so the press lands on IT — and on its
        // request (a terminal's prompt is the terminal) — never on the task page.
        action: waiting !== undefined ? { kind: 'jump', panelId: waiting.id, label: `Go to ${waiting.title}` } : { kind: 'open', label: 'Open' }, more: 0
      })
      continue
    }
    if (item.state === 'review' || (h?.state === 'ready' && h.standing !== 'current')) {
      rows.push({ ...base, group: 'review', status: h?.detail ?? 'The agent finished — nothing is verified yet.', action: { kind: 'open', side: 'changes', label: 'Review the changes' }, more: 0 })
      continue
    }
    if (item.panelId === undefined && agents.length === 0) {
      rows.push({ ...base, group: 'running', status: 'Not started — no agent has this task yet.', action: { kind: 'start', label: 'Start work' }, more: 0 })
      continue
    }
    const who = agentsSentence(agents)
    const changed = h?.changes === undefined ? '' : `${h.changes.files} file${h.changes.files === 1 ? '' : 's'} changed so far`
    const status = who !== '' ? `${who}${changed === '' ? '.' : ` — ${changed}.`}` : h !== undefined ? h.detail : 'Its conversation was closed — nothing is running.'
    rows.push({ ...base, group: 'running', status, action: { kind: 'open', ...(plan !== undefined && plan.attention !== null ? { side: 'plan' as const } : {}), label: 'Open' }, more: 0 })
  }

  // Decisions from panels no task owns — still somebody's decision.
  for (const g of input.groups) {
    if (g.itemId !== null) continue
    const first = g.decisions[0]
    const panelId = first === undefined ? '' : first.evidence.kind === 'review' ? '' : first.evidence.panelId
    const a = panelId === '' ? undefined : input.agentOf(panelId)
    rows.push({
      key: `untasked:${panelId}`, itemId: null, title: a?.title ?? g.title, group: 'attention',
      agents: a === undefined ? [] : [{ ...a, idle: false }], idle: 0,
      status: g.why, checks: { passed: 0, failed: 0, text: 'Not in a task' },
      action: actionFromGroup(g, false), more: Math.max(0, g.decisions.length - 1)
    })
  }

  // Needs attention keeps the queue's order (most blocking first); the rest keep the board's.
  const queueOrder = new Map(input.groups.map((g, i) => [g.itemId ?? `untasked:${(() => { const e = g.decisions[0]?.evidence; return e === undefined || e.kind === 'review' ? '' : e.panelId })()}`, i]))
  const groups = BOARD_GROUPS.map(({ id, label }) => {
    const mine = rows.filter((r) => r.group === id)
    if (id === 'attention' || id === 'review') mine.sort((a, b) => (queueOrder.get(a.key) ?? 1e9) - (queueOrder.get(b.key) ?? 1e9))
    return { id, label, rows: mine }
  })
  const counts = groups.filter((g) => g.rows.length > 0).map((g) => `${g.rows.length} ${g.id === 'attention' ? (g.rows.length === 1 ? 'needs attention' : 'need attention') : g.id === 'running' ? 'running' : g.id === 'review' ? 'ready for review' : 'completed'}`)
  const n = groups[0]!.rows.length
  const headline = rows.length === 0
    ? 'No tasks yet.'
    : n === 0 ? `Nothing needs you — ${counts.join(' · ')}.` : `${counts.join(' · ')}.`
  return { groups, headline }
}
