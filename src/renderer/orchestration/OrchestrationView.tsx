/**
 * M268 / M269. Orchestration center view — dense HUD over live agent / board /
 * workflow / PTY data. Presentational: Canvas owns verbs (jump, interrupt,
 * markDone, setCenterView). Selection here drives the other panes; a jump
 * returns to the canvas so pan/zoom/PTY stay the canvas's.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import type { Panel } from '@renderer/panels/panels'
import {
  isChatPanel, isFilePanel, isTerminalPanel, isWatcherPanel, isWorkflowPanel, isWorkPanel
} from '@renderer/panels/panels'
import { getAgentState, onAgentTransition } from '@renderer/session/agent-state-store'
import { formatCpu, formatMemory, getMachineCostSampledAt, listMachineCosts, useMachineCost, useMachineCostTotal } from '@renderer/session/machine-cost-store'
import { getLiveSession, useLiveSession } from '@renderer/session/live-session-store'
import { getWatch } from '@renderer/watcher/watcher-store'
import { lastAssistantText } from '@renderer/chat/chat-store'
import { outward } from '@shared/outward'
import { useLastLine } from '@renderer/session/last-line-store'
import { getPool, livePoolKeys } from '@renderer/workflow/pool-store'
import type { PersistedWorkItem } from '@shared/work-items'
import { USER_SET_STATES, WORK_ITEM_STATES, type WorkItemState } from '@shared/work-items'
import { displayPath } from '@shared/display-path'
import { shellControl } from '@renderer/shell/shell-control'
import { railLabel } from '@renderer/shell/rail-rows'
import { agentWord, TONE_WORKING } from '@renderer/panels/panel-state'
import { KindChat, KindFile, KindTerminal, KindWatcher, KindWorkflow, KindWork, Orbit, ProductMark, Search, Stop } from '@renderer/icons'
import { EmptyState } from '@renderer/shell/EmptyState'
import {
  buildOrchestrationSnapshot,
  filterActivity,
  filterGraph,
  filterRoster,
  filterWorkItems,
  isoCubeFaces,
  isLiveRosterState,
  orchActivityCoverage,
  orchBlocker,
  orchCommands,
  orchEdgesFiredByPanel,
  orchFilesCoverage,
  orchKeysShouldHandle,
  orchLogsCoverage,
  orchMachineReadout,
  orchMetricLens,
  orchRosterStep,
  orchTaskFrame,
  ORCH_ACTIVITY_SCOPES,
  ORCH_EDGE_FIRE_MS,
  ORCH_GRAPH_SIZE,
  ORCH_MODES,
  ORCH_ROSTER_FILTERS,
  type OrchActivityScope,
  type OrchCommandId,
  type OrchGraphNode,
  type OrchMetricId,
  type OrchMode,
  type OrchPanelInput,
  type OrchRosterFilter,
  type OrchRosterRow
} from './orchestration-model'
import {
  agentTransitionActivity,
  orchActivityEvents,
  pushOrchActivity,
  subscribeOrchActivity
} from './orchestration-activity'

export interface OrchTemplateInput {
  id: string
  name: string
  poolKeys: readonly string[]
}

export interface OrchestrationViewProps {
  panels: readonly Panel[]
  workItems: readonly PersistedWorkItem[]
  templates?: readonly OrchTemplateInput[]
  displayName?: string
  onJumpPanel: (id: string) => void
  onJumpWorkItem: (id: string) => void
  onInterrupt?: (id: string) => void
  onMarkDone?: (itemId: string) => void
  onFocusRelated?: (panelId: string) => void
  onOpenFiles?: () => void
  onShowCanvas?: () => void
  /** D08 member panel ids for the focused board task; empty/absent = no frame. */
  taskMemberIds?: readonly string[]
}

type SideTab = 'activity' | 'terminal' | 'files'

function panelsToInput(panels: readonly Panel[], templates: readonly OrchTemplateInput[]): OrchPanelInput[] {
  return panels.map((p) => {
    const id = p.rect.id
    const title = railLabel(p, undefined)
    const linksTo = (p.links ?? []).map((l) => l.to)
    if (isChatPanel(p)) {
      return {
        id, title, kind: 'chat' as const, agentic: true,
        agentState: getAgentState(id),
        supervisor: p.chat.supervisor === true,
        orchestrator: p.chat.orchestrator !== undefined,
        ...(linksTo.length > 0 ? { linksTo } : {})
      }
    }
    if (isTerminalPanel(p)) {
      const live = getLiveSession(id)
      return {
        id, title, kind: 'terminal' as const,
        agentic: p.spec.agent !== undefined,
        agentState: getAgentState(id),
        ...(live?.currentCommand ? { currentCommand: live.currentCommand } : {}),
        ...(live?.cwd ? { cwd: live.cwd } : {}),
        ...(linksTo.length > 0 ? { linksTo } : {})
      }
    }
    if (isWatcherPanel(p)) {
      return {
        id, title, kind: 'watcher' as const, agentic: false,
        watcherStatus: getWatch(id).status,
        ...(linksTo.length > 0 ? { linksTo } : {})
      }
    }
    if (isWorkflowPanel(p)) {
      const tpl = templates.find((t) => t.id === p.workflow.templateId)
      const keys = tpl?.poolKeys ?? []
      const live = livePoolKeys(p.workflow.templateId, keys)
      const poolItems = keys.flatMap((k) => getPool(p.workflow.templateId, k).items)
      return {
        id, title, kind: 'workflow' as const, agentic: false,
        templateId: p.workflow.templateId,
        poolLive: live.length > 0,
        ...(poolItems.length > 0 ? { poolItems } : {}),
        ...(linksTo.length > 0 ? { linksTo } : {})
      }
    }
    if (isWorkPanel(p)) {
      return {
        id, title, kind: 'work' as const, agentic: false, workItemId: p.work.itemId,
        ...(linksTo.length > 0 ? { linksTo } : {})
      }
    }
    if (isFilePanel(p)) {
      return {
        id, title, kind: 'file' as const, agentic: false, path: p.source.path,
        ...(linksTo.length > 0 ? { linksTo } : {})
      }
    }
    return { id, title, kind: 'other' as const, agentic: false, ...(linksTo.length > 0 ? { linksTo } : {}) }
  })
}

function Sparkline({ values, tone }: { values: number[]; tone?: string }): JSX.Element {
  const w = 120
  const h = 28
  if (values.length < 2) {
    return <svg className="orch__spark" width={w} height={h} aria-hidden="true" />
  }
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = Math.max(max - min, 1)
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / span) * (h - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg className="orch__spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline fill="none" stroke={tone ?? 'var(--iris)'} strokeWidth="1.5" points={pts} />
    </svg>
  )
}

function stateWord(row: OrchRosterRow): string {
  if (row.state === 'wants-you' || row.state === 'busy' || row.state === 'idle' || row.state === 'starting' || row.state === 'exited') {
    return agentWord(row.state).word
  }
  if (row.state === 'pool') return 'pool live'
  if (row.state === 'watching') return agentWord('busy').word
  if (row.state === 'passed') return agentWord('idle').word
  if (row.state === 'running') return agentWord('busy').word
  return agentWord('idle').word
}

function toneFromState(state: OrchRosterRow['state']): string {
  if (state === 'wants-you') return 'needs-you'
  if (state === 'busy' || state === 'watching' || state === 'pool') return TONE_WORKING
  if (state === 'starting') return 'starting'
  if (state === 'exited') return 'exited'
  return 'idle'
}

function formatAgo(at: number): string {
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}

function kindGlyph(kind: OrchRosterRow['kind']): JSX.Element {
  if (kind === 'chat') return <KindChat />
  if (kind === 'terminal') return <KindTerminal />
  if (kind === 'watcher') return <KindWatcher />
  if (kind === 'workflow') return <KindWorkflow />
  if (kind === 'work') return <KindWork />
  if (kind === 'file') return <KindFile />
  return <Orbit />
}

function IsoCube(props: {
  node: OrchGraphNode
  selected: boolean
  onSelect: (id: string) => void
  onJump: (id: string) => void
}): JSX.Element {
  const { node, selected, onSelect, onJump } = props
  const faces = isoCubeFaces(0, 0, node.size)
  const synthetic = node.synthetic === true || node.id === '__hub__'
  const live = isLiveRosterState(node.state)
  const needs = node.state === 'wants-you'
  return (
    <g
      className={`orch__cube${node.hub ? ' orch__cube--hub' : ''}${selected ? ' orch__cube--on' : ''}${live ? ' orch__cube--live' : ''}${needs ? ' orch__cube--needs' : ''}`}
      transform={`translate(${node.x}, ${node.y})`}
      style={{ cursor: synthetic ? 'default' : 'pointer' }}
      data-tone={toneFromState(node.state)}
      onClick={() => { if (!synthetic) onSelect(node.id) }}
      onDoubleClick={() => { if (!synthetic) onJump(node.id) }}
    >
      <polygon className="orch__cube-face orch__cube-face--left" points={faces.left} data-tone={toneFromState(node.state)} />
      <polygon className="orch__cube-face orch__cube-face--right" points={faces.right} data-tone={toneFromState(node.state)} />
      <polygon className="orch__cube-face orch__cube-face--top" points={faces.top} data-tone={toneFromState(node.state)} />
      <text y={node.size * 0.95} textAnchor="middle" className="orch__cube-label">{node.title}</text>
    </g>
  )
}

function GraphBoard(props: {
  nodes: readonly OrchGraphNode[]
  edges: readonly { from: string; to: string; authored?: boolean }[]
  selectedId: string | null
  selectedIds: readonly string[]
  firingKeys: ReadonlySet<string>
  onSelect: (id: string) => void
  onJump: (id: string) => void
}): JSX.Element {
  const { nodes, edges, selectedId, selectedIds, firingKeys, onSelect, onJump } = props
  const [cam, setCam] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>): void => {
    event.preventDefault()
    const factor = event.deltaY > 0 ? 0.92 : 1.08
    setCam((c) => ({ ...c, k: Math.min(2.2, Math.max(0.55, c.k * factor)) }))
  }

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const target = event.target as SVGElement
    if (target.closest('.orch__cube')) return
    drag.current = { x: event.clientX, y: event.clientY, cx: cam.x, cy: cam.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const d = drag.current
    if (d === null) return
    const svg = event.currentTarget
    const sx = svg.clientWidth > 0 ? ORCH_GRAPH_SIZE.w / svg.clientWidth : 1
    const sy = svg.clientHeight > 0 ? ORCH_GRAPH_SIZE.h / svg.clientHeight : 1
    setCam((c) => ({ ...c, x: d.cx + (event.clientX - d.x) * sx, y: d.cy + (event.clientY - d.y) * sy }))
  }

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <svg
      className="orch__graph"
      viewBox={`0 0 ${ORCH_GRAPH_SIZE.w} ${ORCH_GRAPH_SIZE.h}`}
      role="img"
      aria-label="Agent graph"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <radialGradient id="orch-hub-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--iris)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--iris)" stopOpacity="0" />
        </radialGradient>
        <filter id="orch-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g transform={`translate(${cam.x}, ${cam.y}) scale(${cam.k})`}>
        <circle cx={ORCH_GRAPH_SIZE.w / 2} cy={ORCH_GRAPH_SIZE.h / 2} r="118" fill="url(#orch-hub-glow)" />
        {edges.map((e) => {
          const from = nodes.find((n) => n.id === e.from)
          const to = nodes.find((n) => n.id === e.to)
          if (!from || !to) return null
          const firing = firingKeys.has(`${e.from}:${e.to}`) || firingKeys.has(`${e.to}:${e.from}`)
          return (
            <line
              key={`${e.from}-${e.to}-${e.authored === true ? 'a' : 'h'}`}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              className={`orch__edge${e.authored === true ? ' orch__edge--authored' : ''}${firing ? ' orch__edge--current' : ''}`}
              data-edge-activity={firing ? 'firing' : undefined}
            />
          )
        })}
        {nodes.map((n) => (
          <IsoCube
            key={n.id}
            node={n}
            selected={selectedId === n.id || selectedIds.includes(n.id)}
            onSelect={onSelect}
            onJump={onJump}
          />
        ))}
      </g>
    </svg>
  )
}

function useOrchOutput(panelId: string | null, kind: OrchRosterRow['kind'] | undefined, active: boolean): string[] {
  const [lines, setLines] = useState<string[]>([])
  const lastLine = useLastLine(panelId ?? '')
  useEffect(() => {
    if (!active || panelId === null) return
    let cancelled = false
    const pull = (): void => {
      if (kind === 'chat') {
        const raw = lastAssistantText(panelId)
        const text = raw === '' ? '' : outward(raw, `panel ${panelId}`).text
        if (!cancelled) setLines(text === '' ? (lastLine.line === '' ? [] : [lastLine.line]) : text.split('\n').slice(-28))
        return
      }
      if (typeof window.canvas?.scrollback?.tail !== 'function') {
        if (!cancelled) setLines(lastLine.line === '' ? [] : [lastLine.line])
        return
      }
      void window.canvas.scrollback.tail({ panelId, lines: 28 }).then(
        (got) => {
          if (cancelled) return
          setLines(got.length === 0 ? got : outward(got.join('\n'), `panel ${panelId}`).text.split('\n'))
        },
        () => { if (!cancelled) setLines([]) }
      )
    }
    pull()
    const timer = window.setInterval(pull, 2000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [panelId, kind, active, lastLine.line])
  return lines
}

function OrchestrationViewImpl(props: OrchestrationViewProps): JSX.Element {
  const { panels, workItems, templates = [], displayName, onJumpPanel, onJumpWorkItem, onInterrupt, onMarkDone, onFocusRelated, onOpenFiles, onShowCanvas, taskMemberIds } = props
  const [tick, setTick] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [tab, setTab] = useState<SideTab>('activity')
  const [mode, setMode] = useState<OrchMode>('dev')
  const [rosterFilter, setRosterFilter] = useState<OrchRosterFilter>('all')
  const [query, setQuery] = useState('')
  const [metric, setMetric] = useState<OrchMetricId | null>(null)
  const [activityScope, setActivityScope] = useState<OrchActivityScope>('live')
  const [pipelineStage, setPipelineStage] = useState<WorkItemState | null>(null)
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [memHistory, setMemHistory] = useState<number[]>([])
  const [openedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [frameTask, setFrameTask] = useState(true)
  const [edgeFires, setEdgeFires] = useState<Map<string, number>>(() => new Map())
  const [freshNeeds, setFreshNeeds] = useState<Set<string>>(() => new Set())
  const [stageShift, setStageShift] = useState<{ from: WorkItemState; to: WorkItemState; at: number } | null>(null)
  const knownNeedsRef = useRef<Set<string>>(new Set())
  const prevStageRef = useRef<WorkItemState | undefined>(undefined)
  const visibleRosterRef = useRef<OrchRosterRow[]>([])
  const selectedIdsRef = useRef<string[]>([])
  const total = useMachineCostTotal()
  const selectedId = selectedIds[selectedIds.length - 1] ?? null
  const selectedCost = useMachineCost(selectedId ?? '')
  const selectedLive = useLiveSession(selectedId ?? '')

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => onAgentTransition((panelId, state, prev) => {
    const panel = panels.find((p) => p.rect.id === panelId)
    const title = panel ? railLabel(panel, undefined) : panelId
    pushOrchActivity(agentTransitionActivity(panelId, title, state, prev, Date.now()))
    setTick((n) => n + 1)
    if (prev !== state) {
      const at = Date.now()
      setEdgeFires((cur) => {
        const next = new Map(cur)
        for (const key of orchEdgesFiredByPanel(
          // Snapshot edges are rebuilt below; fire any live graph edge that
          // still names this panel — parent re-filters by time each tick.
          liveEdgesRef.current,
          panelId
        )) next.set(key, at)
        return next
      })
    }
  }), [panels])

  const liveEdgesRef = useRef<{ from: string; to: string }[]>([])

  useEffect(() => {
    const sampledAt = getMachineCostSampledAt()
    const panelCount = listMachineCosts().length
    if (sampledAt === null || panelCount <= 0) return
    setCpuHistory((h) => [...h, total.cpuPercent].slice(-24))
    setMemHistory((h) => [...h, total.memoryBytes / (1024 * 1024)].slice(-24))
  }, [total.cpuPercent, total.memoryBytes])

  const activity = useSyncExternalStore(
    subscribeOrchActivity,
    orchActivityEvents,
    orchActivityEvents
  )

  const liveSnap = useMemo(() => buildOrchestrationSnapshot({
    panels: panelsToInput(panels, templates),
    workItems: workItems.map((w) => ({
      id: w.id, title: w.title, state: w.state,
      ...(w.panelId !== undefined ? { panelId: w.panelId } : {}),
      ...(w.note !== undefined ? { note: w.note } : {}),
      ...(w.key !== undefined ? { tags: [w.key] } : {})
    })),
    machine: {
      cpuPercent: total.cpuPercent,
      memoryBytes: total.memoryBytes,
      ...(getMachineCostSampledAt() !== null ? { sampledAt: getMachineCostSampledAt() as number } : {})
    },
    hour: new Date().getHours(),
    ...(displayName !== undefined ? { displayName } : {})
  }), [panels, workItems, templates, total.cpuPercent, total.memoryBytes, displayName, tick, now])

  liveEdgesRef.current = liveSnap.graph.edges

  const members = frameTask && taskMemberIds !== undefined && taskMemberIds.length > 0
    ? taskMemberIds
    : null
  const framed = orchTaskFrame({
    graph: liveSnap.graph,
    roster: liveSnap.roster,
    files: liveSnap.files,
    memberIds: members
  })

  const visibleRoster = useMemo(
    () => filterRoster(framed.roster, rosterFilter, query),
    [framed.roster, rosterFilter, query]
  )
  visibleRosterRef.current = visibleRoster
  selectedIdsRef.current = selectedIds

  const lensIds = useMemo(() => new Set(visibleRoster.map((r) => r.id)), [visibleRoster])
  const visibleGraph = useMemo(
    () => filterGraph(framed.graph, lensIds, { keepSyntheticHub: !framed.framed }),
    [framed.graph, framed.framed, lensIds]
  )
  const visibleFiles = framed.files

  const livePanelIds = useMemo(
    () => liveSnap.roster.filter((r) => isLiveRosterState(r.state)).map((r) => r.id),
    [liveSnap.roster]
  )

  const activityPanelIds = useMemo(() => {
    if (framed.framed) return framed.roster.map((r) => r.id)
    if (rosterFilter === 'all' && query.trim() === '') return null
    return visibleRoster.map((r) => r.id)
  }, [framed.framed, framed.roster, rosterFilter, query, visibleRoster])

  const filteredActivity = useMemo(
    () => filterActivity(activity, {
      selectedId: selectedIds.length === 1 ? selectedId : null,
      scope: activityScope,
      livePanelIds,
      now,
      ...(activityPanelIds !== null ? { panelIds: activityPanelIds } : {})
    }),
    [activity, selectedIds.length, selectedId, activityScope, livePanelIds, now, activityPanelIds]
  )

  const selectedRow = liveSnap.roster.find((r) => r.id === selectedId) ?? null
  const outputPanelId = selectedRow !== null
    ? selectedRow.id
    : liveSnap.terminalSnippet?.panelId ?? null
  const outputKind = selectedRow?.kind ?? (liveSnap.terminalSnippet ? 'terminal' : undefined)
  const outputLines = useOrchOutput(outputPanelId, outputKind, tab === 'terminal')

  const stageItems = useMemo(
    () => filterWorkItems(workItems.map((w) => ({
      id: w.id, title: w.title, state: w.state,
      ...(w.panelId !== undefined ? { panelId: w.panelId } : {}),
      ...(w.note !== undefined ? { note: w.note } : {})
    })), pipelineStage),
    [workItems, pipelineStage]
  )

  const computeBlocks = useMemo(() => {
    void tick
    return listMachineCosts()
      .slice()
      .sort((a, b) => b.cpuPercent - a.cpuPercent)
      .slice(0, 6)
      .map((c) => {
        const row = liveSnap.roster.find((r) => r.id === c.panelId)
        return { ...c, title: row?.title ?? c.panelId }
      })
  }, [liveSnap.roster, total.cpuPercent, total.memoryBytes, tick])

  const jump = useCallback((id: string): void => { onJumpPanel(id) }, [onJumpPanel])
  const select = useCallback((id: string, opts?: { additive?: boolean; range?: boolean }): void => {
    setFreshNeeds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setSelectedIds((cur) => {
      if (opts?.range === true && cur.length > 0) {
        const rows = visibleRosterRef.current
        const from = rows.findIndex((r) => r.id === cur[cur.length - 1])
        const to = rows.findIndex((r) => r.id === id)
        if (from >= 0 && to >= 0) {
          const lo = Math.min(from, to)
          const hi = Math.max(from, to)
          return rows.slice(lo, hi + 1).map((r) => r.id)
        }
      }
      if (opts?.additive === true) {
        return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      }
      return cur.length === 1 && cur[0] === id ? [] : [id]
    })
  }, [])

  useEffect(() => {
    const cur = new Set(liveSnap.roster.filter((r) => r.state === 'wants-you').map((r) => r.id))
    const known = knownNeedsRef.current
    const added: string[] = []
    for (const id of cur) {
      if (!known.has(id)) added.push(id)
    }
    knownNeedsRef.current = cur
    if (added.length === 0) return
    setFreshNeeds((prev) => {
      const next = new Set(prev)
      for (const id of added) next.add(id)
      return next
    })
  }, [liveSnap.roster])

  useEffect(() => {
    const cur = liveSnap.task?.state
    const prev = prevStageRef.current
    if (prev !== undefined && cur !== undefined && prev !== cur) {
      setStageShift({ from: prev, to: cur, at: Date.now() })
    }
    prevStageRef.current = cur
  }, [liveSnap.task?.state])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const isArrow = event.key === 'ArrowDown' || event.key === 'ArrowUp'
      const isEnter = event.key === 'Enter'
      const isEscape = event.key === 'Escape'
      if (!isArrow && !isEnter && !isEscape) return
      const target = event.target instanceof Element ? event.target : null
      if (!orchKeysShouldHandle(target)) return
      if (isEscape && target !== null && target.closest('input, textarea, select')) return
      const rows = visibleRosterRef.current
      const current = selectedIdsRef.current
      const primary = current[current.length - 1] ?? null
      if (isEscape) {
        event.preventDefault()
        setSelectedIds([])
        setFreshNeeds(new Set())
        return
      }
      if (isEnter) {
        if (primary === null) return
        event.preventDefault()
        jump(primary)
        return
      }
      event.preventDefault()
      const next = orchRosterStep(rows, primary, event.key === 'ArrowDown' ? 1 : -1)
      if (next === null) return
      select(next, { range: event.shiftKey })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jump, select])

  const applyMetric = (id: OrchMetricId): void => {
    const next = orchMetricLens(id, metric)
    setMetric(next.metric)
    setRosterFilter(next.rosterFilter)
    setQuery(next.query)
    setMode(next.mode)
  }

  const firingKeys = useMemo(() => {
    const out = new Set<string>()
    for (const [key, at] of edgeFires) {
      if (now - at >= 0 && now - at < ORCH_EDGE_FIRE_MS) out.add(key)
    }
    return out
  }, [edgeFires, now])

  const machineReadout = orchMachineReadout({
    sampledAt: getMachineCostSampledAt(),
    now,
    cpuPercent: total.cpuPercent,
    memoryBytes: total.memoryBytes,
    panelCount: listMachineCosts().length
  })

  const clock = new Date(now)
  const clockLabel = `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}:${String(clock.getSeconds()).padStart(2, '0')}`
  const openSecs = Math.max(0, Math.floor((now - openedAt) / 1000))
  const openLabel = `${String(Math.floor(openSecs / 3600)).padStart(2, '0')}:${String(Math.floor((openSecs % 3600) / 60)).padStart(2, '0')}:${String(openSecs % 60).padStart(2, '0')}`

  const canInterruptId = (id: string): boolean => {
    const row = liveSnap.roster.find((r) => r.id === id)
    const panel = panels.find((p) => p.rect.id === id)
    return row !== undefined && panel !== undefined && isChatPanel(panel)
      && (row.state === 'busy' || row.state === 'starting' || row.state === 'wants-you')
  }
  const selectedCanStop = selectedRow !== null && canInterruptId(selectedRow.id)
  const canInterruptAll = selectedIds.length > 0 && selectedIds.every(canInterruptId) && onInterrupt !== undefined
  const canJumpAll = selectedIds.length > 0 && selectedIds.every((id) => id !== '__hub__' && liveSnap.roster.some((r) => r.id === id))
  const canMarkDone = liveSnap.task !== null && liveSnap.task.state !== WORK_ITEM_STATES[3] && onMarkDone !== undefined
  const canFocusRelated = selectedIds.length === 1 && selectedRow !== null && onFocusRelated !== undefined
  const commands = orchCommands({
    selectedIds,
    canInterrupt: canInterruptAll,
    canJump: canJumpAll,
    canMarkDone,
    canFocusRelated,
    canOpenFiles: visibleFiles.length > 0 && onOpenFiles !== undefined
  })
  const runCommand = (id: OrchCommandId): void => {
    if (id === 'interrupt' && onInterrupt !== undefined) {
      for (const pid of selectedIds) if (canInterruptId(pid)) onInterrupt(pid)
    } else if (id === 'jump' && selectedId !== null) {
      jump(selectedId)
    } else if (id === 'mark-done' && liveSnap.task !== null && onMarkDone !== undefined) onMarkDone(liveSnap.task.id)
    else if (id === 'focus-related' && selectedRow !== null && onFocusRelated !== undefined) onFocusRelated(selectedRow.id)
    else if (id === 'open-files' && onOpenFiles !== undefined) onOpenFiles()
  }

  const waitingRow = liveSnap.roster.find((r) => r.state === 'wants-you')
  const reviewItem = workItems.find((w) => w.state === WORK_ITEM_STATES[2])
  const runningRow = liveSnap.roster.find((r) => r.state === 'busy' || r.state === 'starting')
  const queuedItem = workItems.find((w) => w.state === WORK_ITEM_STATES[0])
  const blocker = orchBlocker({
    waiting: liveSnap.counts.waiting,
    ...(waitingRow !== undefined ? { waitingTitle: waitingRow.title } : {}),
    reviewable: workItems.filter((w) => w.state === WORK_ITEM_STATES[2]).length,
    ...(reviewItem !== undefined ? { reviewTitle: reviewItem.title } : {}),
    running: liveSnap.counts.activeAgents,
    ...(runningRow !== undefined ? { runningTitle: runningRow.title } : {}),
    queued: workItems.filter((w) => w.state === WORK_ITEM_STATES[0]).length,
    ...(queuedItem !== undefined ? { queuedTitle: queuedItem.title } : {})
  })
  const stageShiftLive = stageShift !== null && now - stageShift.at < ORCH_EDGE_FIRE_MS

  const outputCommand = selectedLive?.currentCommand || (outputPanelId === liveSnap.terminalSnippet?.panelId ? liveSnap.terminalSnippet?.command : undefined)
  const outputCwd = selectedLive?.cwd || (outputPanelId === liveSnap.terminalSnippet?.panelId ? liveSnap.terminalSnippet?.cwd : undefined)

  return (
    <div className="orch" role="region" aria-label="Orchestration">
      <header className="orch__header">
        <div className="orch__brand">
          <span className="orch__mark" aria-hidden="true"><ProductMark size={18} /></span>
          <div className="orch__brand-copy">
            <span className="orch__product">Terminal Canvas</span>
            <p className="orch__greeting">{liveSnap.greeting}</p>
          </div>
          <div className="orch__clocks">
            <div className="orch__clock" title="Local time">
              <span className="orch__clock-label">Local</span>
              <span className="orch__clock-value">{clockLabel}</span>
            </div>
            <div className="orch__clock" title="How long this Orchestration view has been open">
              <span className="orch__clock-label">View open</span>
              <span className="orch__clock-value">{openLabel}</span>
            </div>
          </div>
        </div>
        <div className="orch__metrics" data-orch-density="rest">
          <button type="button" className="orch__metric" data-tone={liveSnap.counts.activeAgents > 0 ? TONE_WORKING : 'idle'} aria-pressed={metric === 'agents'} {...shellControl(() => applyMetric('agents'))}>
            <span className="orch__metric-label">Active agents</span>
            <span className="orch__metric-value">{liveSnap.counts.activeAgents}</span>
            <span className="orch__metric-sub">{liveSnap.counts.activeAgents > 0 ? agentWord('busy').word : agentWord('idle').word}</span>
          </button>
          <button type="button" className="orch__metric" data-tone={liveSnap.counts.tasksInProgress > 0 ? TONE_WORKING : 'idle'} aria-pressed={metric === 'tasks'} {...shellControl(() => applyMetric('tasks'))}>
            <span className="orch__metric-label">Tasks in progress</span>
            <span className="orch__metric-value">{liveSnap.counts.tasksInProgress}</span>
            <span className="orch__metric-sub">{liveSnap.counts.tasksInProgress > 0 ? 'In progress' : 'Clear'}</span>
          </button>
          <button type="button" className="orch__metric" data-tone={liveSnap.counts.watchersRunning > 0 ? TONE_WORKING : 'idle'} aria-pressed={metric === 'watchers'} {...shellControl(() => applyMetric('watchers'))}>
            <span className="orch__metric-label">Watchers</span>
            <span className="orch__metric-value">{liveSnap.counts.watchersRunning}</span>
            <span className="orch__metric-sub">{liveSnap.counts.watchersRunning > 0 ? agentWord('busy').word : agentWord('idle').word}</span>
          </button>
          <button type="button" className="orch__metric" data-tone={liveSnap.counts.waiting > 0 ? 'needs-you' : 'idle'} aria-pressed={metric === 'waiting'} {...shellControl(() => applyMetric('waiting'))}>
            <span className="orch__metric-label">Waiting on you</span>
            <span className="orch__metric-value">{liveSnap.counts.waiting}</span>
            <span className="orch__metric-sub">{liveSnap.counts.waiting > 0 ? 'Attention' : 'Clear'}</span>
          </button>
        </div>
        {blocker !== null && (
          <p className="orch__blocker" data-orch-blocker={blocker.kind} data-orch-density="contextual">{blocker.line}</p>
        )}
        {commands.length > 0 && (
          <div className="orch__commands" data-orch-commands data-orch-density="contextual" role="toolbar" aria-label="Selection commands">
            {commands.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                className="orch__command"
                data-orch-command={cmd.id}
                title={cmd.label}
                {...shellControl(() => runCommand(cmd.id))}
              >
                {cmd.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="orch__body">
        <aside className="orch__roster" aria-label="Agent pool">
          <div className="orch__section-head">
            <div className="orch__section-title">Agent pool</div>
            {taskMemberIds !== undefined && taskMemberIds.length > 0 && (
              <button type="button" className="orch__mini" {...shellControl(() => setFrameTask((v) => !v))}>
                {frameTask ? 'Show all' : 'This task'}
              </button>
            )}
            <label className="orch__filter">
              <span className="orch__sr">Filter agents</span>
              <select
                className="orch__select"
                value={rosterFilter}
                onChange={(e) => setRosterFilter(e.target.value as OrchRosterFilter)}
                aria-label="Filter agents"
              >
                {ORCH_ROSTER_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
          </div>
          <label className="orch__search">
            <Search size={14} />
            <span className="orch__sr">Search agents</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name"
              aria-label="Search agents"
            />
          </label>
          {visibleRoster.length === 0 ? (
            <EmptyState id="orch-roster" onVerb={onShowCanvas} />
          ) : (
            <ul className="orch__roster-list" data-orch-roster>
              {visibleRoster.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`orch__roster-row${selectedIds.includes(row.id) ? ' orch__roster-row--on' : ''}`}
                    data-tone={row.tone}
                    data-attention-new={freshNeeds.has(row.id) ? '' : undefined}
                    aria-pressed={selectedIds.includes(row.id)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault()
                      select(row.id, { additive: e.metaKey || e.ctrlKey, range: e.shiftKey })
                    }}
                    onDoubleClick={() => jump(row.id)}
                  >
                    <span className="orch__dot status-dot" data-tone={row.tone} aria-hidden="true" />
                    <span className="orch__roster-kind" aria-hidden="true">{kindGlyph(row.kind)}</span>
                    <span className="orch__roster-label">{row.title}</span>
                    <span className="orch__roster-state">{stateWord(row)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedRow !== null && (
            <div className="orch__roster-actions">
              <button type="button" className="orch__mini" {...shellControl(() => jump(selectedRow.id))}>Open on canvas</button>
              {selectedCanStop && onInterrupt !== undefined && (
                <button type="button" className="orch__mini orch__mini--stop" {...shellControl(() => onInterrupt(selectedRow.id))}>
                  <Stop size={12} /> Interrupt
                </button>
              )}
            </div>
          )}
        </aside>

        <main className="orch__main">
          <div className="orch__mode" role="tablist" aria-label="Orchestration mode">
            {ORCH_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                className={`orch__tab${mode === m.id ? ' orch__tab--on' : ''}`}
                {...shellControl(() => setMode(m.id))}
              >{m.label}</button>
            ))}
          </div>

          <div className="orch__graph-wrap">
            {mode === 'dev' ? (
              <GraphBoard
                nodes={visibleGraph.nodes}
                edges={visibleGraph.edges}
                selectedId={selectedId}
                selectedIds={selectedIds}
                firingKeys={firingKeys}
                onSelect={(id) => select(id)}
                onJump={jump}
              />
            ) : (
              <div className="orch__pipeline" aria-label="Workflow pipeline">
                <div className="orch__pipeline-flow">
                  {liveSnap.pipeline.map((stage, i) => (
                    <button
                      key={stage.state}
                      type="button"
                      className={`orch__wp${pipelineStage === stage.state ? ' orch__wp--on' : ''}${stage.count > 0 ? ' orch__wp--hot' : ''}${liveSnap.task?.state === stage.state ? ' orch__wp--current' : ''}${stageShiftLive && stageShift?.to === stage.state ? ' orch__wp--shift' : ''}`}
                      data-tone={stage.state === WORK_ITEM_STATES[1] ? TONE_WORKING : stage.state === WORK_ITEM_STATES[2] ? 'starting' : stage.state === WORK_ITEM_STATES[3] ? 'idle' : 'kind'}
                      data-orch-stage-current={liveSnap.task?.state === stage.state ? '' : undefined}
                      data-orch-stage-shift={stageShiftLive && stageShift?.to === stage.state ? '' : undefined}
                      aria-pressed={pipelineStage === stage.state}
                      {...shellControl(() => setPipelineStage((cur) => cur === stage.state ? null : stage.state))}
                    >
                      <span className="orch__wp-id">WP{i + 1}</span>
                      <span className="orch__wp-name">{stage.state}</span>
                      <span className="orch__wp-count">{stage.count}</span>
                    </button>
                  ))}
                </div>
                <ul className="orch__pipeline-items">
                  {stageItems.length === 0 ? (
                    <li><EmptyState id="orch-pipeline" onVerb={onShowCanvas} /></li>
                  ) : stageItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="orch__pipeline-item"
                        {...shellControl(() => {
                          if (item.panelId) { select(item.panelId); onJumpWorkItem(item.id) }
                          else onJumpWorkItem(item.id)
                        })}
                      >
                        <span className="orch__pipeline-item-title">{item.title}</span>
                        <span className="orch__pipeline-item-state">{item.state}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {liveSnap.workflows.some((w) => w.poolItems.length > 0) && (
                  <ul className="orch__pool-items" aria-label="Pool items">
                    {liveSnap.workflows.flatMap((w) => w.poolItems.map((item, i) => (
                      <li key={`${w.id}-${item.item}-${i}`}>
                        <button type="button" className="orch__pipeline-item" data-tone={item.state === 'started' ? TONE_WORKING : item.state === 'finished' ? 'idle' : 'starting'} {...shellControl(() => jump(w.id))}>
                          <span className="orch__pipeline-item-title">{item.item}</span>
                          <span className="orch__pipeline-item-state">{item.state} · {w.title}</span>
                        </button>
                      </li>
                    )))}
                  </ul>
                )}
              </div>
            )}

            {liveSnap.terminalSnippet && (
              <button
                type="button"
                className="orch__float orch__float--term"
                title="Jump to terminal"
                {...shellControl(() => { select(liveSnap.terminalSnippet!.panelId); setTab('terminal') })}
                onDoubleClick={() => jump(liveSnap.terminalSnippet!.panelId)}
              >
                <span className="orch__float-title">{liveSnap.terminalSnippet.title}</span>
                <code className="orch__float-code">{liveSnap.terminalSnippet.command}</code>
              </button>
            )}

            {liveSnap.task && (
              <button
                type="button"
                className="orch__float orch__float--task"
                title="Open task on canvas"
                {...shellControl(() => onJumpWorkItem(liveSnap.task!.id))}
              >
                <span className="orch__float-title">{liveSnap.task.title}</span>
                <span className="orch__float-state">{liveSnap.task.state}</span>
                <div className="orch__steps" aria-hidden="true">
                  {WORK_ITEM_STATES.map((s, i) => (
                    <span
                      key={s}
                      className={`orch__step${i <= liveSnap.task!.stepIndex ? ' orch__step--on' : ''}`}
                    />
                  ))}
                </div>
              </button>
            )}
          </div>

          <div className="orch__bottom">
            <div className="orch__perf" aria-label="System performance" data-orch-density="detail">
              <div className="orch__section-title">System</div>
              <p className="orch__caption">{
                machineReadout.kind === 'none' || machineReadout.kind === 'empty'
                  ? 'No process sample yet'
                  : machineReadout.kind === 'stale'
                    ? `Last sample ${machineReadout.age}`
                    : 'From this machine\'s process table'
              }</p>
              <div className="orch__perf-grid">
                <div className="orch__perf-card">
                  <span className="orch__perf-label">CPU</span>
                  <span className="orch__perf-value">{machineReadout.cpu}</span>
                  {machineReadout.kind === 'live' || machineReadout.kind === 'stale'
                    ? <Sparkline values={cpuHistory} />
                    : <Sparkline values={[]} />}
                </div>
                <div className="orch__perf-card">
                  <span className="orch__perf-label">Memory</span>
                  <span className="orch__perf-value">{machineReadout.memory}</span>
                  {machineReadout.kind === 'live' || machineReadout.kind === 'stale'
                    ? <Sparkline values={memHistory} tone="var(--green)" />
                    : <Sparkline values={[]} />}
                </div>
              </div>
              {computeBlocks.length > 0 && (
                <div className="orch__compute" aria-label="Compute by panel">
                  {computeBlocks.map((block) => (
                    <button
                      key={block.panelId}
                      type="button"
                      className={`orch__compute-block${selectedId === block.panelId ? ' orch__compute-block--on' : ''}`}
                      title={`${block.title} · ${formatCpu(block.cpuPercent)}`}
                      {...shellControl(() => select(block.panelId))}
                    >
                      <span className="orch__compute-bar" style={{ height: `${Math.min(100, Math.max(8, block.cpuPercent))}%` }} />
                      <span className="orch__compute-label">{formatCpu(block.cpuPercent)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="orch__task-panel">
              <div className="orch__section-title">Current task</div>
              {liveSnap.task === null ? (
                <EmptyState id="orch-task" onVerb={onShowCanvas} />
              ) : (
                <div className="orch__task-card">
                  <button type="button" className="orch__task-main" {...shellControl(() => onJumpWorkItem(liveSnap.task!.id))}>
                    <span className="orch__task-title">{liveSnap.task.title}</span>
                    <span className="orch__task-state" data-tone={TONE_WORKING}>{liveSnap.task.state}</span>
                    {liveSnap.task.note !== undefined && <span className="orch__task-note">{liveSnap.task.note}</span>}
                  </button>
                  <div className="orch__steps" role="list" aria-label="Task stages">
                    {WORK_ITEM_STATES.map((s, i) => (
                      <button
                        key={s}
                        type="button"
                        className={`orch__step-btn${i <= liveSnap.task!.stepIndex ? ' orch__step-btn--on' : ''}${pipelineStage === s ? ' orch__step-btn--sel' : ''}`}
                        title={s}
                        {...shellControl(() => { setMode('pipeline'); setPipelineStage((cur) => cur === s ? null : s) })}
                      >{s}</button>
                    ))}
                  </div>
                  <div className="orch__roster-actions">
                    <button type="button" className="orch__mini" {...shellControl(() => onJumpWorkItem(liveSnap.task!.id))}>Open on canvas</button>
                    {onMarkDone !== undefined && USER_SET_STATES.includes(WORK_ITEM_STATES[3]) && liveSnap.task.state !== WORK_ITEM_STATES[3] && (
                      <button type="button" className="orch__mini" {...shellControl(() => onMarkDone(liveSnap.task!.id))}>Mark done</button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="orch__selected" aria-label="Selected agent">
              <div className="orch__section-title">Selected</div>
              {selectedRow === null ? (
                <EmptyState id="orch-selected" />
              ) : (
                <div className="orch__selected-body">
                  <span className="orch__selected-title">{selectedRow.title}</span>
                  <span className="orch__roster-state" data-tone={selectedRow.tone}>{stateWord(selectedRow)}</span>
                  {selectedCost !== undefined ? (
                    <span className="orch__perf-value">{formatCpu(selectedCost.cpuPercent)} · {formatMemory(selectedCost.memoryBytes)}</span>
                  ) : (
                    <span className="orch__caption">No process sample for this panel yet</span>
                  )}
                  {outputCommand !== undefined && outputCommand !== '' && <code className="orch__float-code">{outputCommand}</code>}
                  {outputCwd !== undefined && <span className="orch__caption" title={outputCwd}>{displayPath(outputCwd).short}</span>}
                </div>
              )}
            </div>
          </div>
        </main>

        <aside className="orch__side" aria-label="Activity">
          <div className="orch__tabs" role="tablist">
                {(['activity', 'terminal', 'files'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={`orch__tab${tab === t ? ' orch__tab--on' : ''}`}
                  {...shellControl(() => setTab(t))}
                >{t === 'activity' ? 'Activity' : t === 'terminal' ? 'Logs' : 'Files'}</button>
              ))}
          </div>
          {tab === 'activity' && (
            <>
              <label className="orch__filter orch__filter--block">
                <span className="orch__sr">Activity scope</span>
                <select
                  className="orch__select"
                  value={activityScope}
                  onChange={(e) => setActivityScope(e.target.value as OrchActivityScope)}
                  aria-label="Activity scope"
                >
                  {ORCH_ACTIVITY_SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <p className="orch__caption">{orchActivityCoverage(activityScope)}</p>
              <ul className="orch__activity" aria-label="Activity feed">
                {filteredActivity.length === 0 ? (
                  <li><EmptyState id="orch-activity" /></li>
                ) : filteredActivity.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="orch__activity-row"
                      data-tone={e.tone}
                      disabled={e.panelId === undefined}
                      {...shellControl(() => {
                        if (!e.panelId) return
                        select(e.panelId)
                      })}
                      onDoubleClick={() => { if (e.panelId) jump(e.panelId) }}
                    >
                      <span className="orch__dot status-dot" data-tone={e.tone} aria-hidden="true" />
                      <span className="orch__activity-title">{e.title}</span>
                      <span className="orch__activity-detail">{e.detail}</span>
                      <time className="orch__activity-time">{formatAgo(e.at)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {tab === 'terminal' && (
            <div className="orch__term-tab" data-orch-density="detail">
              <p className="orch__caption">{orchLogsCoverage()}</p>
              {outputPanelId === null ? (
                <EmptyState id="orch-terminal" onVerb={onShowCanvas} />
              ) : (
                <>
                  <button
                    type="button"
                    className="orch__term-card"
                    {...shellControl(() => jump(outputPanelId))}
                  >
                    <span className="orch__float-title">{selectedRow?.title ?? liveSnap.terminalSnippet?.title}</span>
                    {outputCommand !== undefined && outputCommand !== '' && <code className="orch__float-code">{outputCommand}</code>}
                    <span className="orch__task-jump">Jump to panel</span>
                  </button>
                  <pre className="orch__term-log" aria-label="Scrollback tail">
                    {outputLines.length === 0 ? 'No recorded output yet for this panel.' : outputLines.join('\n')}
                  </pre>
                </>
              )}
            </div>
          )}
          {tab === 'files' && (
            <>
              <p className="orch__caption">{orchFilesCoverage()}</p>
            <ul className="orch__activity">
              {visibleFiles.length === 0 ? (
                <li><EmptyState id="orch-files" onVerb={onShowCanvas} /></li>
              ) : visibleFiles.map((f) => {
                const shown = displayPath(f.path)
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      className={`orch__activity-row${selectedId === f.id ? ' orch__roster-row--on' : ''}`}
                      title={shown.full}
                      {...shellControl(() => { select(f.id); jump(f.id) })}
                    >
                      <span className="orch__roster-kind" aria-hidden="true"><KindFile /></span>
                      <span className="orch__activity-title">{f.title}</span>
                      <span className="orch__activity-detail">{shown.short}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

export const OrchestrationView = memo(OrchestrationViewImpl)
