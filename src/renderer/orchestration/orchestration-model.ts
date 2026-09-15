/**
 * M268 / M269. Pure projection for the Orchestration center view — counts,
 * roster, isometric graph layout, pipeline stages, focused task — from facts
 * the canvas already owns. No React, no IPC: verify:orchestration drives this
 * under plain node.
 */

import type { AgentState } from '@shared/types'
import { EDGE_FIRE_MS } from '@shared/edge-activity'
import type { WorkItemState } from '@shared/work-items'
import { WORK_ITEM_STATES } from '@shared/work-items'
import { TONE_NEEDS_YOU, TONE_WORKING, type Tone } from '@renderer/panels/panel-state'

/** Same travel window as the canvas edge current (M267). */
export const ORCH_EDGE_FIRE_MS = EDGE_FIRE_MS

/** Honest label for a hub that is layout-only, not a supervisor chat. */
export const ORCH_SYNTHETIC_HUB_TITLE = 'No supervisor yet'

/** A sample older than this is shown with its age, never as a fresh 0%. */
export const ORCH_MACHINE_STALE_MS = 8_000

export type OrchPanelKind = 'chat' | 'terminal' | 'watcher' | 'workflow' | 'work' | 'file' | 'other'

export type OrchRosterFilter = 'all' | 'running' | 'idle' | 'needs-you'
export type OrchActivityScope = 'live' | 'all'
export type OrchMode = 'dev' | 'pipeline'
export type OrchPoolItemState = 'queued' | 'started' | 'finished'

export const ORCH_ROSTER_FILTERS: readonly { id: OrchRosterFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'idle', label: 'Idle' },
  { id: 'needs-you', label: 'Needs you' }
]

export const ORCH_ACTIVITY_SCOPES: readonly { id: OrchActivityScope; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'all', label: 'Historical' }
]

export const ORCH_MODES: readonly { id: OrchMode; label: string }[] = [
  { id: 'dev', label: 'Dev' },
  { id: 'pipeline', label: 'Pipeline' }
]

/** Events older than this (and not on a currently live panel) drop out of Live. */
export const ORCH_LIVE_MS = 2 * 60 * 1000

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
  /** Live session cwd when known. */
  cwd?: string
  /** Work card's board item id. */
  workItemId?: string
  /** File panel path. */
  path?: string
  /** Authored canvas links from this panel. */
  linksTo?: readonly string[]
  /** Pool block items for a live workflow. */
  poolItems?: readonly { item: string; state: OrchPoolItemState; id?: string }[]
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
  /** Epoch ms of the last process-table sample. Absent: never sampled. */
  sampledAt?: number
}

export interface OrchRosterRow {
  id: string
  title: string
  kind: OrchPanelKind
  state: AgentState | 'running' | 'idle' | 'watching' | 'passed' | 'exited' | 'pool'
  tone: Tone
  agentic: boolean
}

export interface OrchGraphNode {
  id: string
  title: string
  kind: OrchPanelKind
  hub: boolean
  /** True when the hub is layout-only — no supervisor/orchestrator chat. */
  synthetic?: boolean
  x: number
  y: number
  state: OrchRosterRow['state']
  size: number
}

export interface OrchGraphEdge {
  from: string
  to: string
  authored?: boolean
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

export interface OrchPipelineStage {
  state: WorkItemState
  count: number
  ids: string[]
}

export interface OrchFileRow {
  id: string
  title: string
  path: string
}

export interface OrchSnapshot {
  greeting: string
  counts: OrchCounts
  roster: OrchRosterRow[]
  graph: { nodes: OrchGraphNode[]; edges: OrchGraphEdge[] }
  task: OrchTaskCard | null
  terminalSnippet: { panelId: string; title: string; command: string; cwd?: string } | null
  workflows: Array<{ id: string; title: string; live: boolean; poolItems: readonly { item: string; state: OrchPoolItemState }[] }>
  files: OrchFileRow[]
  pipeline: OrchPipelineStage[]
  machine: OrchMachineInput
}

const GRAPH_W = 720
const GRAPH_H = 420
const HUB_X = GRAPH_W / 2
const HUB_Y = GRAPH_H / 2
const RING_R = 148
const HUB_SIZE = 56
const SAT_SIZE = 38

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

export function isLiveRosterState(state: OrchRosterRow['state']): boolean {
  return state === 'busy' || state === 'starting' || state === 'wants-you' || state === 'watching' || state === 'pool'
}

/**
 * A greeting name is a person's display name. Empty, whitespace, and the
 * placeholders that used to produce "Good evening, there." are omitted so
 * the sentence is "Good evening." rather than a false familiarity.
 */
export function orchGreetingName(raw?: string): string {
  const name = (raw ?? '').trim()
  if (name === '' || /^(there|user|guest|undefined|null)$/i.test(name)) return ''
  return name
}

export type OrchCommandId = 'interrupt' | 'jump' | 'mark-done' | 'focus-related' | 'open-files'
export interface OrchCommand {
  id: OrchCommandId
  label: string
}

/**
 * Selection-driven command surface: only verbs that can run now. A decorative
 * disabled button is not a door.
 */
export function orchCommands(input: {
  selectedId?: string | null
  selectedIds?: readonly string[]
  canInterrupt: boolean
  /** When omitted, Jump is real iff at least one selected id is a real panel. */
  canJump?: boolean
  canMarkDone: boolean
  canFocusRelated: boolean
  canOpenFiles: boolean
}): OrchCommand[] {
  const ids = input.selectedIds ?? (input.selectedId != null && input.selectedId !== '' ? [input.selectedId] : [])
  const canJump = input.canJump ?? ids.some((id) => id !== '__hub__')
  const out: OrchCommand[] = []
  if (input.canInterrupt) out.push({ id: 'interrupt', label: 'Interrupt' })
  if (canJump) out.push({ id: 'jump', label: 'Jump' })
  if (input.canMarkDone) out.push({ id: 'mark-done', label: 'Mark done' })
  if (input.canFocusRelated) out.push({ id: 'focus-related', label: 'Focus related' })
  if (input.canOpenFiles) out.push({ id: 'open-files', label: 'Open Files' })
  return out
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
  const name = orchGreetingName(displayName)
  const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

  const agentic = panels.filter((p) => p.agentic || p.kind === 'chat' || (p.kind === 'terminal' && p.agentic))
  const rosterSource = panels.filter((p) =>
    p.kind === 'chat' || p.kind === 'terminal' || p.kind === 'watcher' || p.kind === 'workflow'
  )
  const roster: OrchRosterRow[] = rosterSource.map((p) => {
    const state = rosterState(p)
    return { id: p.id, title: p.title, kind: p.kind, state, tone: toneOf(state), agentic: p.agentic }
  })

  const activeAgents = agentic.filter(isActiveAgent).length
  const waiting = panels.filter((p) => p.agentState === 'wants-you').length
  const tasksInProgress = workItems.filter((w) => w.state === WORK_WORKING || w.state === WORK_REVIEW).length
  const watchersRunning = panels.filter((p) => p.kind === 'watcher' && p.watcherStatus === 'running').length
  const workflowsLive = panels.filter((p) => p.kind === 'workflow' && p.poolLive).length

  const greetingParts = [
    name === '' ? `Good ${period}.` : `Good ${period}, ${name}.`,
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
  const syntheticHub = hubPanel === undefined
  nodes.push({
    id: hubId,
    title: hubPanel?.title ?? ORCH_SYNTHETIC_HUB_TITLE,
    kind: hubPanel?.kind ?? 'chat',
    hub: true,
    ...(syntheticHub ? { synthetic: true } : {}),
    x: HUB_X,
    y: HUB_Y,
    state: hubPanel ? rosterState(hubPanel) : 'idle',
    size: HUB_SIZE
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
      state: rosterState(p),
      size: SAT_SIZE
    })
    edges.push({ from: hubId, to: p.id })
  })

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edgeKey = (a: string, b: string): string => `${a}\0${b}`
  const seen = new Set(edges.map((e) => edgeKey(e.from, e.to)))
  for (const p of rosterSource) {
    for (const to of p.linksTo ?? []) {
      if (!nodeIds.has(p.id) || !nodeIds.has(to)) continue
      const key = edgeKey(p.id, to)
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ from: p.id, to, authored: true })
    }
  }

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
    : {
        panelId: withCmd.id,
        title: withCmd.title,
        command: (withCmd.currentCommand ?? '').trim(),
        ...(withCmd.cwd !== undefined ? { cwd: withCmd.cwd } : {})
      }

  const workflows = panels
    .filter((p) => p.kind === 'workflow')
    .map((p) => ({
      id: p.id,
      title: p.title,
      live: p.poolLive === true,
      poolItems: p.poolItems ?? []
    }))

  const files: OrchFileRow[] = panels
    .filter((p) => p.kind === 'file' && (p.path ?? '').trim() !== '')
    .map((p) => ({ id: p.id, title: p.title, path: p.path ?? '' }))

  const pipeline: OrchPipelineStage[] = WORK_ITEM_STATES.map((state) => {
    const matched = workItems.filter((w) => w.state === state)
    return { state, count: matched.length, ids: matched.map((w) => w.id) }
  })

  return {
    greeting,
    counts: { activeAgents, tasksInProgress, watchersRunning, workflowsLive, waiting },
    roster,
    graph: { nodes, edges },
    task,
    terminalSnippet,
    workflows,
    files,
    pipeline,
    machine
  }
}

export function filterRoster(
  rows: readonly OrchRosterRow[],
  filter: OrchRosterFilter,
  query: string
): OrchRosterRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((row) => {
    if (q !== '' && !row.title.toLowerCase().includes(q) && !row.kind.includes(q) && !row.id.toLowerCase().includes(q)) {
      return false
    }
    if (filter === 'all') return true
    if (filter === 'needs-you') return row.tone === TONE_NEEDS_YOU
    if (filter === 'running') return isLiveRosterState(row.state)
    return !isLiveRosterState(row.state) && row.tone !== TONE_NEEDS_YOU
  })
}

export function filterActivity<T extends { panelId?: string; at: number }>(
  rows: readonly T[],
  opts: {
    selectedId: string | null
    scope: OrchActivityScope
    livePanelIds: readonly string[]
    now: number
    liveMs?: number
    /** When set, only these panels (task frame / metric lens). Empty → none. */
    panelIds?: readonly string[] | null
  }
): T[] {
  const liveMs = opts.liveMs ?? ORCH_LIVE_MS
  const allow = opts.panelIds === undefined || opts.panelIds === null
    ? null
    : new Set(opts.panelIds)
  return rows.filter((row) => {
    if (allow !== null && (row.panelId === undefined || !allow.has(row.panelId))) return false
    if (opts.selectedId !== null && row.panelId !== opts.selectedId) return false
    if (opts.scope === 'all') return true
    if (row.panelId !== undefined && opts.livePanelIds.includes(row.panelId)) return true
    return opts.now - row.at <= liveMs
  })
}

export function filterWorkItems(
  items: readonly OrchWorkItemInput[],
  stage: WorkItemState | null
): OrchWorkItemInput[] {
  if (stage === null) return [...items]
  return items.filter((item) => item.state === stage)
}

/**
 * Isometric cube face polygons, centred on (cx, cy). Four points each so a
 * restyle cannot collapse a cube into a diamond without the suite noticing.
 */
export function isoCubeFaces(cx: number, cy: number, size: number): { top: string; left: string; right: string } {
  const hx = size * 0.5
  const hy = size * 0.29
  const rise = size * 0.52
  const topY = cy - rise
  const midY = topY + hy
  const botY = topY + hy * 2
  const ground = cy + hy * 0.35
  const top = `${cx},${topY} ${cx + hx},${midY} ${cx},${botY} ${cx - hx},${midY}`
  const left = `${cx - hx},${midY} ${cx},${botY} ${cx},${ground + hy} ${cx - hx},${ground}`
  const right = `${cx + hx},${midY} ${cx},${botY} ${cx},${ground + hy} ${cx + hx},${ground}`
  return { top, left, right }
}

/** Filter activity / performance to one roster id, or pass all through. */
export function filterBySelection<T extends { id?: string; panelId?: string }>(
  rows: readonly T[],
  selectedId: string | null
): T[] {
  if (selectedId === null) return [...rows]
  return rows.filter((r) => r.id === selectedId || r.panelId === selectedId)
}

/**
 * Arrow roster step. Clamps at the ends; an empty list stays unselected.
 * `delta` is +1 (down) or -1 (up). No selection yet lands on the first/last.
 */
export function orchRosterStep(
  rows: readonly { id: string }[],
  selectedId: string | null,
  delta: number
): string | null {
  if (rows.length === 0) return null
  if (selectedId === null) return delta >= 0 ? rows[0]!.id : rows[rows.length - 1]!.id
  const i = rows.findIndex((r) => r.id === selectedId)
  if (i < 0) return delta >= 0 ? rows[0]!.id : rows[rows.length - 1]!.id
  const next = i + delta
  if (next < 0) return rows[0]!.id
  if (next >= rows.length) return rows[rows.length - 1]!.id
  return rows[next]!.id
}

/**
 * Roster keyboard is for the HUD. A focused terminal, a contenteditable
 * surface, or a target outside `.orch` must keep its keys — shellControl
 * leaves xterm focused on purpose, and stealing those arrows would write
 * into a running agent.
 */
export function orchKeysShouldHandle(target: { closest: (selector: string) => unknown } | null): boolean {
  if (target === null) return false
  if (target.closest('.xterm') != null) return false
  if (target.closest('.xterm-helper-textarea') != null) return false
  if (target.closest('.xterm-screen') != null) return false
  if (target.closest('[contenteditable="true"]') != null) return false
  return target.closest('.orch') != null
}

export function orchEdgeKey(from: string, to: string): string {
  return `${from}:${to}`
}

/** Edges that touch a panel the instant a real agent transition fires. */
export function orchEdgesFiredByPanel(
  edges: readonly OrchGraphEdge[],
  panelId: string
): string[] {
  return edges
    .filter((e) => e.from === panelId || e.to === panelId)
    .map((e) => orchEdgeKey(e.from, e.to))
}

export function orchEdgeIsFiring(
  from: string,
  to: string,
  fires: ReadonlyMap<string, number>,
  now: number,
  fireMs: number = ORCH_EDGE_FIRE_MS
): boolean {
  const at = fires.get(orchEdgeKey(from, to)) ?? fires.get(orchEdgeKey(to, from))
  if (at === undefined) return false
  const dt = now - at
  return dt >= 0 && dt < fireMs
}

export type OrchBlockerKind = 'waiting-on-you' | 'queued' | 'running' | 'reviewable'

export interface OrchBlocker {
  kind: OrchBlockerKind
  line: string
}

function blockerCountLine(kind: OrchBlockerKind, count: number, title: string | undefined, noun: string): string {
  if (count <= 0) return ''
  const head =
    kind === 'waiting-on-you' ? 'Waiting on you'
      : kind === 'reviewable' ? 'Reviewable'
        : kind === 'running' ? 'Running'
          : 'Queued'
  if (title !== undefined && title.trim() !== '') {
    return count === 1 ? `${head} — ${title}` : `${head} — ${title} and ${count - 1} more`
  }
  return `${head} — ${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * One resting line from facts that already exist. Priority is waiting →
 * reviewable → running → queued. Returns null when none of those counts
 * are above zero — never invents a status word.
 */
export function orchBlocker(input: {
  waiting: number
  waitingTitle?: string
  reviewable: number
  reviewTitle?: string
  running: number
  runningTitle?: string
  queued: number
  queuedTitle?: string
}): OrchBlocker | null {
  if (input.waiting > 0) {
    return { kind: 'waiting-on-you', line: blockerCountLine('waiting-on-you', input.waiting, input.waitingTitle, 'agent') }
  }
  if (input.reviewable > 0) {
    return { kind: 'reviewable', line: blockerCountLine('reviewable', input.reviewable, input.reviewTitle, 'task') }
  }
  if (input.running > 0) {
    return { kind: 'running', line: blockerCountLine('running', input.running, input.runningTitle, 'agent') }
  }
  if (input.queued > 0) {
    return { kind: 'queued', line: blockerCountLine('queued', input.queued, input.queuedTitle, 'task') }
  }
  return null
}

export type OrchMetricId = 'agents' | 'tasks' | 'watchers' | 'waiting'

export interface OrchLens {
  metric: OrchMetricId | null
  rosterFilter: OrchRosterFilter
  query: string
  mode: OrchMode
}

/** Metric cards are the same filter everywhere — click again to clear. */
export function orchMetricLens(id: OrchMetricId, current: OrchMetricId | null): OrchLens {
  if (current === id) {
    return { metric: null, rosterFilter: 'all', query: '', mode: 'dev' }
  }
  if (id === 'agents') return { metric: id, rosterFilter: 'running', query: '', mode: 'dev' }
  if (id === 'waiting') return { metric: id, rosterFilter: 'needs-you', query: '', mode: 'dev' }
  if (id === 'watchers') return { metric: id, rosterFilter: 'running', query: 'watcher', mode: 'dev' }
  return { metric: id, rosterFilter: 'all', query: '', mode: 'pipeline' }
}

export function filterGraph(
  graph: { nodes: readonly OrchGraphNode[]; edges: readonly OrchGraphEdge[] },
  keepIds: ReadonlySet<string>,
  opts?: { keepSyntheticHub?: boolean }
): { nodes: OrchGraphNode[]; edges: OrchGraphEdge[] } {
  const keepHub = opts?.keepSyntheticHub !== false
  const nodes = graph.nodes.filter((n) => {
    if (keepIds.has(n.id)) return true
    if (keepHub && n.hub && n.synthetic === true) return true
    return false
  })
  const ids = new Set(nodes.map((n) => n.id))
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
  return { nodes: [...nodes], edges: [...edges] }
}

/**
 * Task-centric frame: keep only panels a D08 membership names. Synthetic
 * hub is dropped — it is not a member. Empty member set → empty frame.
 */
export function orchTaskFrame(input: {
  graph: { nodes: readonly OrchGraphNode[]; edges: readonly OrchGraphEdge[] }
  roster: readonly OrchRosterRow[]
  files: readonly OrchFileRow[]
  memberIds: readonly string[] | null
}): {
  graph: { nodes: OrchGraphNode[]; edges: OrchGraphEdge[] }
  roster: OrchRosterRow[]
  files: OrchFileRow[]
  framed: boolean
} {
  if (input.memberIds === null) {
    return {
      graph: { nodes: [...input.graph.nodes], edges: [...input.graph.edges] },
      roster: [...input.roster],
      files: [...input.files],
      framed: false
    }
  }
  const keep = new Set(input.memberIds)
  return {
    graph: filterGraph(input.graph, keep, { keepSyntheticHub: false }),
    roster: input.roster.filter((r) => keep.has(r.id)),
    files: input.files.filter((f) => keep.has(f.id)),
    framed: true
  }
}

export function orchActivityCoverage(scope: OrchActivityScope, liveMs: number = ORCH_LIVE_MS): string {
  const minutes = Math.max(1, Math.round(liveMs / 60_000))
  if (scope === 'live') {
    return `Live: panels currently working, plus events from the last ${minutes} minute${minutes === 1 ? '' : 's'}.`
  }
  return 'Historical: durable activity recorded this session.'
}

export function orchLogsCoverage(): string {
  return 'Logs: recorded scrollback or last chat turn — not a live terminal.'
}

export function orchFilesCoverage(): string {
  return 'Files: canvas file panels, each with its real path.'
}

export type OrchMachineKind = 'none' | 'empty' | 'stale' | 'live'

export function orchMachineReadout(input: {
  sampledAt: number | null | undefined
  now: number
  cpuPercent: number
  memoryBytes: number
  panelCount: number
  staleMs?: number
}): { kind: OrchMachineKind; cpu: string; memory: string; age: string | null } {
  const staleMs = input.staleMs ?? ORCH_MACHINE_STALE_MS
  if (input.sampledAt === undefined || input.sampledAt === null) {
    return { kind: 'none', cpu: 'no sample yet', memory: 'no sample yet', age: null }
  }
  if (input.panelCount <= 0) {
    return { kind: 'empty', cpu: 'no sample yet', memory: 'no sample yet', age: null }
  }
  const ageMs = Math.max(0, input.now - input.sampledAt)
  const age = ageMs < 1000 ? 'just now' : ageMs < 60_000 ? `${Math.floor(ageMs / 1000)}s ago` : `${Math.floor(ageMs / 60_000)}m ago`
  const cpu = `${input.cpuPercent.toLocaleString(undefined, { maximumFractionDigits: input.cpuPercent < 10 ? 1 : 0 })}%`
  const mib = input.memoryBytes / (1024 * 1024)
  const memory = mib < 1024 ? `${Math.round(mib)} MB` : `${(mib / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} GB`
  if (ageMs > staleMs) return { kind: 'stale', cpu, memory, age }
  return { kind: 'live', cpu, memory, age }
}

export const ORCH_GRAPH_SIZE = { w: GRAPH_W, h: GRAPH_H } as const
