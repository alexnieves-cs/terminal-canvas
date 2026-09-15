/**
 * M268. Pure projection for the Orchestration center view — counts, roster,
 * SVG graph layout, focused task — from facts the canvas already owns.
 * No React, no IPC: verify:orchestration drives this under plain node.
 */

import type { AgentState } from '@shared/types'
import type { WorkItemState } from '@shared/work-items'
import { WORK_ITEM_STATES } from '@shared/work-items'
import { TONE_NEEDS_YOU, TONE_WORKING, type Tone } from '@renderer/panels/panel-state'

export type OrchPanelKind = 'chat' | 'terminal' | 'watcher' | 'workflow' | 'work' | 'other'

export interface OrchPanelInput {
  id: string
  kind: OrchPanelKind
  title: string
  /** Terminal started as an agent, or any chat. */
  agentic: boolean
  agentState?: AgentState
  /** Chat marks that decide the graph hub. */
  supervisor?: boolean
  orchestrator?: boolean
  /** Watcher runtime word. */
  watcherStatus?: 'not-started' | 'running' | 'passed' | 'exited'
  /** Workflow template id when kind is workflow. */
  templateId?: string
  /** True when any pool block for this workflow is live. */
  poolLive?: boolean
  /** Live session command when known (tmux). */
  currentCommand?: string
  /** Work card's board item id. */
  workItemId?: string
}

export interface OrchWorkItemInput {
  id: string
  title: string
  state: WorkItemState
  panelId?: string
  note?: string
  tags?: string[]
}

export interface OrchMachineInput {
  cpuPercent: number
  memoryBytes: number
}

export interface OrchRosterRow {
  id: string
  title: string
  kind: OrchPanelKind
  state: AgentState | 'running' | 'idle' | 'watching' | 'passed' | 'exited' | 'pool'
  tone: Tone
}

export interface OrchGraphNode {
  id: string
  title: string
  kind: OrchPanelKind
  hub: boolean
  x: number
  y: number
  state: OrchRosterRow['state']
}

export interface OrchGraphEdge {
  from: string
  to: string
}

export interface OrchTaskCard {
  id: string
  title: string
  state: WorkItemState
  /** Index into WORK_ITEM_STATES for the step strip. */
  stepIndex: number
  panelId?: string
  note?: string
}

export interface OrchCounts {
  activeAgents: number
  tasksInProgress: number
  watchersRunning: number
  workflowsLive: number
  waiting: number
}

export interface OrchSnapshot {
  greeting: string
  counts: OrchCounts
  roster: OrchRosterRow[]
  graph: { nodes: OrchGraphNode[]; edges: OrchGraphEdge[] }
  task: OrchTaskCard | null
  terminalSnippet: { panelId: string; title: string; command: string } | null
  workflows: Array<{ id: string; title: string; live: boolean }>
  machine: OrchMachineInput
}

const GRAPH_W = 640
const GRAPH_H = 360
const HUB_X = GRAPH_W / 2
const HUB_Y = GRAPH_H / 2
const RING_R = 120

const WORK_WORKING = WORK_ITEM_STATES[1]
const WORK_REVIEW = WORK_ITEM_STATES[2]

function rosterState(p: OrchPanelInput): OrchRosterRow['state'] {
  if (p.kind === 'watcher') {
    if (p.watcherStatus === 'running') return 'watching'
    if (p.watcherStatus === 'passed') return 'passed'
    if (p.watcherStatus === 'exited') return 'exited'
    return 'idle'
  }
  if (p.kind === 'workflow') return p.poolLive ? 'pool' : 'idle'
  if (p.agentState !== undefined) return p.agentState
  return 'idle'
}

function toneOf(state: OrchRosterRow['state']): Tone {
  if (state === 'wants-you') return TONE_NEEDS_YOU
  if (state === 'busy' || state === 'watching' || state === 'pool') return TONE_WORKING
  if (state === 'starting') return 'starting'
  if (state === 'exited') return 'exited'
  return 'idle'
}

function isActiveAgent(p: OrchPanelInput): boolean {
  if (!p.agentic) return false
  const s = p.agentState
  return s === 'busy' || s === 'starting' || s === 'wants-you'
}

/**
 * Build the Orchestration snapshot. `hour` is injected so the greeting is
 * deterministic under tests (0–23).
 */
export function buildOrchestrationSnapshot(input: {
  panels: readonly OrchPanelInput[]
  workItems: readonly OrchWorkItemInput[]
  machine: OrchMachineInput
  hour: number
  displayName?: string
}): OrchSnapshot {
  const { panels, workItems, machine, hour, displayName } = input
  const name = (displayName ?? '').trim() || 'there'
  const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

  const agentic = panels.filter((p) => p.agentic || p.kind === 'chat' || (p.kind === 'terminal' && p.agentic))
  const rosterSource = panels.filter((p) =>
    p.kind === 'chat' || p.kind === 'terminal' || p.kind === 'watcher' || p.kind === 'workflow'
  )
  const roster: OrchRosterRow[] = rosterSource.map((p) => {
    const state = rosterState(p)
    return { id: p.id, title: p.title, kind: p.kind, state, tone: toneOf(state) }
  })

  const activeAgents = agentic.filter(isActiveAgent).length
  const waiting = panels.filter((p) => p.agentState === 'wants-you').length
  const tasksInProgress = workItems.filter((w) => w.state === WORK_WORKING || w.state === WORK_REVIEW).length
  const watchersRunning = panels.filter((p) => p.kind === 'watcher' && p.watcherStatus === 'running').length
  const workflowsLive = panels.filter((p) => p.kind === 'workflow' && p.poolLive).length

  const greetingParts = [
    `Good ${period}, ${name}.`,
    activeAgents > 0
      ? `Your agents are working. ${tasksInProgress} task${tasksInProgress === 1 ? '' : 's'} in progress.`
      : tasksInProgress > 0
        ? `${tasksInProgress} task${tasksInProgress === 1 ? '' : 's'} in progress.`
        : 'Nothing is running yet.'
  ]
  const greeting = greetingParts.join(' ')

  const hubPanel = panels.find((p) => p.kind === 'chat' && p.supervisor)
    ?? panels.find((p) => p.kind === 'chat' && p.orchestrator)
  const satellites = rosterSource.filter((p) => p.id !== hubPanel?.id).slice(0, 8)
  const nodes: OrchGraphNode[] = []
  const edges: OrchGraphEdge[] = []
  const hubId = hubPanel?.id ?? '__hub__'
  nodes.push({
    id: hubId,
    title: hubPanel?.title ?? 'Orchestrator',
    kind: hubPanel?.kind ?? 'chat',
    hub: true,
    x: HUB_X,
    y: HUB_Y,
    state: hubPanel ? rosterState(hubPanel) : 'idle'
  })
  satellites.forEach((p, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(satellites.length, 1) - Math.PI / 2
    nodes.push({
      id: p.id,
      title: p.title,
      kind: p.kind,
      hub: false,
      x: HUB_X + Math.cos(angle) * RING_R,
      y: HUB_Y + Math.sin(angle) * RING_R,
      state: rosterState(p)
    })
    edges.push({ from: hubId, to: p.id })
  })

  const focused = workItems.find((w) => w.state === WORK_WORKING)
    ?? workItems.find((w) => w.state === WORK_REVIEW)
    ?? null
  const task: OrchTaskCard | null = focused === null ? null : {
    id: focused.id,
    title: focused.title,
    state: focused.state,
    stepIndex: Math.max(0, WORK_ITEM_STATES.indexOf(focused.state)),
    ...(focused.panelId !== undefined ? { panelId: focused.panelId } : {}),
    ...(focused.note !== undefined ? { note: focused.note } : {})
  }

  const withCmd = panels.find((p) => (p.currentCommand ?? '').trim() !== '')
  const terminalSnippet = withCmd === undefined
    ? null
    : { panelId: withCmd.id, title: withCmd.title, command: (withCmd.currentCommand ?? '').trim() }

  const workflows = panels
    .filter((p) => p.kind === 'workflow')
    .map((p) => ({ id: p.id, title: p.title, live: p.poolLive === true }))

  return {
    greeting,
    counts: { activeAgents, tasksInProgress, watchersRunning, workflowsLive, waiting },
    roster,
    graph: { nodes, edges },
    task,
    terminalSnippet,
    workflows,
    machine
  }
}

/** Filter activity / performance to one roster id, or pass all through. */
export function filterBySelection<T extends { id?: string; panelId?: string }>(
  rows: readonly T[],
  selectedId: string | null
): T[] {
  if (selectedId === null) return [...rows]
  return rows.filter((r) => r.id === selectedId || r.panelId === selectedId)
}

export const ORCH_GRAPH_SIZE = { w: GRAPH_W, h: GRAPH_H } as const
