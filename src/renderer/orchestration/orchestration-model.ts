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

/** `off-ring` is only offered while the ring is capped — see ORCH_RING_CAP. */
export type OrchRosterFilter = 'all' | 'running' | 'idle' | 'needs-you' | 'off-ring'
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
  /**
   * M301. RECONCILIATION'S TWO FACTS, both of which must be present before
   * this panel may wear a live word. `liveSession` is MAIN's answer (the
   * backend's session list, or the agent runtime's), never the renderer's
   * inference from its own panel record; `hadSession` is whether this panel
   * ever had one, which is what separates "gone" from "never started";
   * `lastSeen` is when the durable record last saw it.
   *
   * All three ABSENT is every caller that has not reconciled — a fixture, a
   * check written before M301 — and absence keeps the pre-M301 behaviour
   * exactly, so nothing silently changes meaning under an old caller.
   */
  liveSession?: boolean
  hadSession?: boolean
  lastSeen?: number
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
  /** Target id → trigger word, for this panel's ENABLED handoff links only. */
  linkTriggers?: Readonly<Record<string, string>>
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
  /** M301. `unknown` is "this had a session and this app cannot see one now" — see shared/session-standing.ts. */
  state: AgentState | 'running' | 'idle' | 'watching' | 'passed' | 'exited' | 'pool' | 'unknown'
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
  /** Only on the `+N more` node: the agents the capped ring could not seat. */
  overflow?: readonly { id: string; state: OrchRosterRow['state'] }[]
}

export interface OrchGraphEdge {
  from: string
  to: string
  authored?: boolean
  /** The link's trigger word ("on exit", "after a turn") when a handoff rule is on. */
  trigger?: string
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

// The stage is about twice as wide as it is tall, and the board is fitted into it
// `meet`: a 720-wide board was height-limited and left half the stage's width
// empty, with eight labels crowded into the rest. The ring stays a CIRCLE in the
// model — the wide, short footprint comes from the camera's tilt
// (orchestration-depth.ts), never from an x-only stretch, which would make the
// ground an ellipse no tilt explains (`orch.depth.3`).
const GRAPH_W = 860
const GRAPH_H = 420
const HUB_X = GRAPH_W / 2
// Above centre: the front row hangs a name plate BELOW its cube, the back row nothing above.
const HUB_Y = 196
const RING_R = 250
const HUB_SIZE = 56
const SAT_SIZE = 38

const WORK_WORKING = WORK_ITEM_STATES[1]
const WORK_REVIEW = WORK_ITEM_STATES[2]

/** Ring slots. Past this, the last slot is a `+N more` node — never a silent drop. */
export const ORCH_RING_CAP = 8
export const ORCH_OVERFLOW_ID = '__more__'

const urgency = (state: OrchRosterRow['state']): number =>
  state === 'wants-you' ? 0 : isLiveRosterState(state) ? 1 : 2

/**
 * The `+N more` node from what it holds. It wears the MOST urgent hidden state,
 * so an amber agent past the cap still turns the overflow amber.
 */
function overflowNode(base: OrchGraphNode, entries: readonly { id: string; state: OrchRosterRow['state'] }[]): OrchGraphNode {
  const state = [...entries].sort((a, b) => urgency(a.state) - urgency(b.state))[0]?.state ?? 'idle'
  return { ...base, title: `+${entries.length} more`, state, overflow: entries }
}

function rosterState(p: OrchPanelInput): OrchRosterRow['state'] {
  if (p.kind === 'watcher') {
    if (p.watcherStatus === 'running') return 'watching'
    if (p.watcherStatus === 'passed') return 'passed'
    if (p.watcherStatus === 'exited') return 'exited'
    return 'idle'
  }
  if (p.kind === 'workflow') return p.poolLive ? 'pool' : 'idle'
  /*
   * M301. THE RECONCILED ARM, and it comes BEFORE the runtime's word on
   * purpose. A panel restored from layout.json whose agent is gone used to
   * fall through to `idle` — the word a LIVE agent waiting for you wears —
   * and nothing anywhere said otherwise. Worse, a session killed mid-turn
   * keeps `busy` as its last event forever, because no event says "and then
   * I was killed": starting from `agentState` would carry that word across
   * a relaunch. So liveness is asked first, and a runtime word can never
   * promote a panel that has no session.
   *
   * `unknown` covers both standings with no session — one we can date and
   * one we cannot. They are one WORD here because the page's question is
   * "may I act on this", whose answer is no either way; the difference is
   * carried in the sentence `standingOf` returns, which the inspector shows.
   * A caller that has not reconciled passes none of these and keeps the
   * pre-M301 behaviour.
   */
  if (p.liveSession === false && p.hadSession === true) return 'unknown'
  if (p.agentState !== undefined) return p.agentState
  return 'idle'
}

function toneOf(state: OrchRosterRow['state']): Tone {
  if (state === 'wants-you') return TONE_NEEDS_YOU
  if (state === 'busy' || state === 'watching' || state === 'pool') return TONE_WORKING
  if (state === 'starting') return 'starting'
  // M301. `unknown` wears the `exited` tone — the quiet, finished family —
  // because the one thing it must NOT look like is a live idle agent. It
  // keeps its own WORD, so the tone is never the only thing carrying it
  // (the product rule that every state has words and a shape, not colour).
  if (state === 'exited' || state === 'unknown') return 'exited'
  return 'idle'
}

function isActiveAgent(p: OrchPanelInput): boolean {
  if (!p.agentic) return false
  // M301. A reconciled panel with no session is not active, whatever its last
  // event said. This is the count that reads "3 running" on the tiles, and it
  // surviving a relaunch that killed all three is the headline lie of Phase E.
  if (p.liveSession === false && p.hadSession === true) return false
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
  const candidates = rosterSource.filter((p) => p.id !== hubPanel?.id)
  // Seat by urgency so a waiting agent is never the one hidden, then keep canvas
  // order among the seated so the ring does not reshuffle on every transition.
  const seated = candidates.length <= ORCH_RING_CAP
    ? new Set(candidates.map((p) => p.id))
    : new Set(candidates.map((p, i) => ({ p, i })).sort((a, b) => urgency(rosterState(a.p)) - urgency(rosterState(b.p)) || a.i - b.i)
      .slice(0, ORCH_RING_CAP - 1).map((x) => x.p.id))
  const satellites = candidates.filter((p) => seated.has(p.id))
  const hidden = candidates.filter((p) => !seated.has(p.id))
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
  const slots = satellites.length + (hidden.length > 0 ? 1 : 0)
  const slotAt = (i: number): { x: number; y: number } => {
    const angle = (Math.PI * 2 * i) / Math.max(slots, 1) - Math.PI / 2
    return { x: HUB_X + Math.cos(angle) * RING_R, y: HUB_Y + Math.sin(angle) * RING_R }
  }
  satellites.forEach((p, i) => {
    nodes.push({
      id: p.id,
      title: p.title,
      kind: p.kind,
      hub: false,
      ...slotAt(i),
      state: rosterState(p),
      size: SAT_SIZE
    })
    edges.push({ from: hubId, to: p.id })
  })
  if (hidden.length > 0) {
    nodes.push(overflowNode(
      { id: ORCH_OVERFLOW_ID, title: '', kind: 'other', hub: false, ...slotAt(satellites.length), state: 'idle', size: SAT_SIZE },
      hidden.map((p) => ({ id: p.id, state: rosterState(p) }))
    ))
    edges.push({ from: hubId, to: ORCH_OVERFLOW_ID })
  }

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edgeKey = (a: string, b: string): string => `${a}\0${b}`
  const seen = new Set(edges.map((e) => edgeKey(e.from, e.to)))
  for (const p of rosterSource) {
    for (const to of p.linksTo ?? []) {
      if (!nodeIds.has(p.id) || !nodeIds.has(to)) continue
      const key = edgeKey(p.id, to)
      if (seen.has(key)) continue
      seen.add(key)
      const trigger = p.linkTriggers?.[to]
      edges.push({ from: p.id, to, authored: true, ...(trigger !== undefined ? { trigger } : {}) })
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
  query: string,
  /** The `+N more` node's ids; `off-ring` with none keeps nothing. */
  offRingIds: readonly string[] = []
): OrchRosterRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((row) => {
    if (q !== '' && !row.title.toLowerCase().includes(q) && !row.kind.includes(q) && !row.id.toLowerCase().includes(q)) {
      return false
    }
    if (filter === 'all') return true
    if (filter === 'off-ring') return offRingIds.includes(row.id)
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

/**
 * How long a packet is visible on a HUD edge. Longer than the canvas's
 * EDGE_FIRE_MS travel: the HUD is read at a glance from across the room, and a
 * 900ms dot on a 150px spoke is gone before the eye lands on it.
 */
export const ORCH_PACKET_MS = 1200

/**
 * One recorded crossing. `origin` orients a state fire (the packet leaves the
 * panel that changed); a handoff always travels from→to. Only a handoff may
 * carry the trigger chip — a state flicker delivered nothing, and a chip on it
 * would name a handoff that did not happen.
 */
export interface OrchEdgeFire {
  at: number
  origin: string
  handoff: boolean
}

export interface OrchPacket {
  key: string
  from: string
  to: string
  /** Position along from→to in [0, 1). */
  t: number
  authored: boolean
  trigger?: string
}

/**
 * Record fires on `keys`. A live handoff is never downgraded by a state fire
 * landing inside its window — a turn end emits both, in either order, and the
 * one that carries the payload is the one worth seeing.
 */
export function orchRecordFires(
  fires: ReadonlyMap<string, OrchEdgeFire>,
  keys: readonly string[],
  fire: OrchEdgeFire,
  packetMs: number = ORCH_PACKET_MS
): Map<string, OrchEdgeFire> {
  const next = new Map(fires)
  for (const key of keys) {
    const cur = next.get(key)
    if (cur !== undefined && cur.handoff && !fire.handoff && fire.at - cur.at < packetMs) continue
    next.set(key, fire)
  }
  return next
}

/** Packets on the given edges right now; an expired or future fire yields none. */
export function orchEdgePackets(
  edges: readonly OrchGraphEdge[],
  fires: ReadonlyMap<string, OrchEdgeFire>,
  now: number,
  packetMs: number = ORCH_PACKET_MS
): OrchPacket[] {
  const out: OrchPacket[] = []
  for (const e of edges) {
    const key = orchEdgeKey(e.from, e.to)
    const fire = fires.get(key)
    if (fire === undefined) continue
    const dt = now - fire.at
    if (dt < 0 || dt >= packetMs) continue
    const reverse = !fire.handoff && fire.origin === e.to
    out.push({
      key,
      from: reverse ? e.to : e.from,
      to: reverse ? e.from : e.to,
      t: dt / packetMs,
      authored: e.authored === true,
      ...(fire.handoff && e.trigger !== undefined ? { trigger: e.trigger } : {})
    })
  }
  return out
}

/**
 * Hub spokes paint first, authored handoffs last, so a real dependency is
 * never drawn UNDER the star layout's lines where they cross.
 */
export function orchEdgePaintOrder<T extends { authored?: boolean }>(edges: readonly T[]): T[] {
  return [...edges.filter((e) => e.authored !== true), ...edges.filter((e) => e.authored === true)]
}

export type OrchBlockerKind ='waiting-on-you' | 'queued' | 'running' | 'reviewable'

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
  const nodes = graph.nodes.flatMap((n): OrchGraphNode[] => {
    // The overflow survives a frame only for what it still holds, and recounts.
    if (n.overflow !== undefined) {
      const kept = n.overflow.filter((o) => keepIds.has(o.id))
      return kept.length > 0 ? [overflowNode(n, kept)] : []
    }
    if (keepIds.has(n.id)) return [n]
    if (keepHub && n.hub && n.synthetic === true) return [n]
    return []
  })
  const ids = new Set(nodes.map((n) => n.id))
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
  return { nodes: [...nodes], edges: [...edges] }
}

/**
 * Which cubes a lens leaves lit. The scene DIMS what a lens excludes rather
 * than removing it: removal re-derives the ring radius and reflows the stage,
 * and a metric click should move attention, not furniture. `null` = no lens.
 * The overflow node is lit when it holds any lit agent; the synthetic hub,
 * holding nothing, dims under every lens.
 */
export function orchLensLit(
  nodes: readonly OrchGraphNode[],
  visibleIds: ReadonlySet<string>,
  active: boolean
): Set<string> | null {
  if (!active) return null
  return new Set(nodes.filter((n) => n.overflow !== undefined
    ? n.overflow.some((o) => visibleIds.has(o.id))
    : visibleIds.has(n.id)).map((n) => n.id))
}

/**
 * Board items whose stage moved since `prev`. An item absent from `prev` is
 * new, not moved — a first render or a fresh card washes nothing.
 */
export function orchStageShifts(
  prev: ReadonlyMap<string, WorkItemState>,
  items: readonly { id: string; state: WorkItemState }[]
): { id: string; from: WorkItemState; to: WorkItemState }[] {
  return items.flatMap((w) => {
    const from = prev.get(w.id)
    return from !== undefined && from !== w.state ? [{ id: w.id, from, to: w.state }] : []
  })
}

/** How long a member cube wears the stage rim — two --dur-flow passes in styles.css. */
export const ORCH_STAGE_WASH_MS = 1800

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

/**
 * The bottom strip's Code card: the selected file when the selection IS a file, else the first
 * file panel. Never a guess at "recent" — the model has no edit times, and inventing an order
 * would read as a fact.
 */
export function orchBestFile(files: readonly OrchFileRow[], selectedId: string | null): OrchFileRow | null {
  return files.find((f) => f.id === selectedId) ?? files[0] ?? null
}

/**
 * A chat's phase, as one word and at most one name. The input is deliberately
 * structural and carries NO `text`: a thinking block's contents cannot reach the
 * HUD through a function that was never handed them. `live` separates a tool that
 * is running from one that merely ran last — the same block reads "Using" in one
 * and "Last tool" in the other, and saying "Using" about a finished turn is the
 * decorative fiction this row exists to avoid. `idle` means the caller shows the
 * last turn's tail (scrubbed by outward() at the call site), or nothing.
 */
export type OrchPhase = { kind: 'thinking' | 'using' | 'last-tool'; label: string } | { kind: 'idle'; label: '' }
export function orchPhase(blocks: readonly { type: string; name?: string }[], live: boolean): OrchPhase {
  const latest = [...blocks].reverse().find((b) => b.type === 'thinking' || b.type === 'tool_use' || b.type === 'text')
  if (live && latest?.type === 'thinking') return { kind: 'thinking', label: 'Thinking…' }
  if (latest?.type === 'tool_use' && latest.name) {
    return live ? { kind: 'using', label: `Using · ${latest.name}` } : { kind: 'last-tool', label: `Last tool: ${latest.name}` }
  }
  return { kind: 'idle', label: '' }
}
