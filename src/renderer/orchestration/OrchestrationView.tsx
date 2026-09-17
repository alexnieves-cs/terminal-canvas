/**
 * M268 / M269. Orchestration center view — dense HUD over live agent / board /
 * workflow / PTY data. Presentational: Canvas owns verbs (jump, interrupt,
 * markDone, setCenterView). Selection here drives the other panes; a jump
 * returns to the canvas so pan/zoom/PTY stay the canvas's.
 */
import { MachineSparkline as Sparkline } from '@renderer/shell/MachineChart'
import { MotionSurface } from '@renderer/primitives/MotionSurface'
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import type { Panel } from '@renderer/panels/panels'
import {
  isChatPanel, isFilePanel, isTerminalPanel, isWatcherPanel, isWorkflowPanel, isWorkPanel
} from '@renderer/panels/panels'
import { getAgentState, onAgentTransition } from '@renderer/session/agent-state-store'
import { formatCpu, formatMemory, getMachineCostSampledAt, listMachineCosts, useMachineCost, useMachineCostTotal } from '@renderer/session/machine-cost-store'
import { getLiveSession, useLiveSession } from '@renderer/session/live-session-store'
import { getWatch } from '@renderer/watcher/watcher-store'
import { useChat, lastAssistantText } from '@renderer/chat/chat-store'
import { outward } from '@shared/outward'
import { TRIGGER_WORDS } from '@renderer/canvas/trigger-words'
import { edgeFiredAt, useEdgeActivityVersion } from '@renderer/canvas/useEdgeActivity'
import { useLastLine } from '@renderer/session/last-line-store'
import { getPool, livePoolKeys } from '@renderer/workflow/pool-store'
import type { PersistedWorkItem } from '@shared/work-items'
import { USER_SET_STATES, WORK_ITEM_STATES, type WorkItemState } from '@shared/work-items'
import { displayPath } from '@shared/display-path'
import { shellControl } from '@renderer/shell/shell-control'
import { railLabel } from '@renderer/shell/rail-rows'
import { formatAgo } from '@renderer/shell/format-ago'
import { agentWord, TONE_WORKING, type Tone } from '@renderer/panels/panel-state'
import { KindChat, KindFile, KindTerminal, KindWatcher, KindWorkflow, KindWork, Orbit, ProductMark, Search, Stop } from '@renderer/icons'
import { EmptyState } from '@renderer/shell/EmptyState'
import {
  buildOrchestrationSnapshot,
  filterActivity,
  filterRoster,
  filterWorkItems,
  isLiveRosterState,
  orchActivityCoverage,
  orchBlocker,
  orchCommands,
  orchEdgeKey,
  orchEdgesFiredByPanel,
  orchFilesCoverage,
  orchKeysShouldHandle,
  orchLensLit,
  orchLogsCoverage,
  orchStageShifts,
  ORCH_OVERFLOW_ID,
  ORCH_STAGE_WASH_MS,
  orchMachineReadout,
  orchMetricLens,
  orchRosterStep,
  orchTaskFrame,
  ORCH_ACTIVITY_SCOPES,
  ORCH_EDGE_FIRE_MS,
  ORCH_PACKET_MS,
  orchEdgePackets,
  orchEdgePaintOrder,
  orchRecordFires,
  type OrchEdgeFire,
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
  orchActivityEvents,
  subscribeOrchActivity
} from './orchestration-activity'
import { orchGroundPlane, orchProjectNode, type OrchDepthBand, type OrchStage } from './orchestration-depth'
import type { OrchCubeSpec } from './OrchestrationCubes'
import type { OrchCubeTone } from './orchestration-cube-motion'

/**
 * The R3F island is `import()`ed the first time Orchestration paints, never at
 * module scope, and the split is load-bearing rather than tidy. This view is in
 * the app's FIRST chunk, so a static import of OrchestrationCubes puts three.js
 * and @react-three/fiber — measured at +2.2MB — into startup for every session,
 * including the many that never open Orchestration at all. Monaco is kept out of
 * that chunk the same way, by CodeEditor (see file/editor-registry.ts's header);
 * this is the same rule, and it fails the same way: silently, with every suite
 * still green, because nothing here pins the chunk split.
 *
 * `OrchCubeSpec` above is an `import type`, erased at compile time, so naming the
 * module for its type costs nothing at runtime. That is easy to undo by accident
 * — dropping the `type` keyword re-bundles three with no error and no red suite.
 */
const OrchestrationCubes = lazy(async () => ({ default: (await import('./OrchestrationCubes')).OrchestrationCubes }))

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
  /** D08 members of ANY board item — the stage wash rims the item that moved, not only the focused one. */
  taskMembersOf?: (itemId: string) => readonly string[]
}

/** A board stage change, painted as a brief rim on the moved item's member cubes. */
interface OrchWash { at: number; stage: WorkItemState; ids: readonly string[] }

type SideTab = 'activity' | 'terminal' | 'files'

function panelsToInput(panels: readonly Panel[], templates: readonly OrchTemplateInput[]): OrchPanelInput[] {
  return panels.map((p) => {
    const id = p.rect.id
    const title = railLabel(p, undefined)
    const linksTo = (p.links ?? []).map((l) => l.to)
    // Only an ENABLED handoff has a trigger worth naming; a bare or switched-off
    // link is still a dependency line, but nothing can cross it on its own.
    const triggers = Object.fromEntries((p.links ?? []).flatMap((l) =>
      l.automation?.kind === 'handoff' && l.automation.enabled ? [[l.to, TRIGGER_WORDS[l.automation.trigger]]] : []))
    const linkTriggers = Object.keys(triggers).length > 0 ? { linkTriggers: triggers } : {}
    if (isChatPanel(p)) {
      return {
        id, title, kind: 'chat' as const, agentic: true,
        agentState: getAgentState(id),
        supervisor: p.chat.supervisor === true,
        orchestrator: p.chat.orchestrator !== undefined,
        ...(linksTo.length > 0 ? { linksTo } : {}), ...linkTriggers
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
        ...(linksTo.length > 0 ? { linksTo } : {}), ...linkTriggers
      }
    }
    if (isWatcherPanel(p)) {
      return {
        id, title, kind: 'watcher' as const, agentic: false,
        watcherStatus: getWatch(id).status,
        ...(linksTo.length > 0 ? { linksTo } : {}), ...linkTriggers
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
        ...(linksTo.length > 0 ? { linksTo } : {}), ...linkTriggers
      }
    }
    if (isWorkPanel(p)) {
      return {
        id, title, kind: 'work' as const, agentic: false, workItemId: p.work.itemId,
        ...(linksTo.length > 0 ? { linksTo } : {}), ...linkTriggers
      }
    }
    if (isFilePanel(p)) {
      return {
        id, title, kind: 'file' as const, agentic: false, path: p.source.path,
        ...(linksTo.length > 0 ? { linksTo } : {}), ...linkTriggers
      }
    }
    return { id, title, kind: 'other' as const, agentic: false, ...(linksTo.length > 0 ? { linksTo } : {}), ...linkTriggers }
  })
}


function stateWord(row: Pick<OrchRosterRow, 'state'>): string {
  if (row.state === 'wants-you' || row.state === 'busy' || row.state === 'idle' || row.state === 'starting' || row.state === 'exited') {
    return agentWord(row.state).word
  }
  if (row.state === 'pool') return 'pool live'
  if (row.state === 'watching') return agentWord('busy').word
  if (row.state === 'passed') return agentWord('idle').word
  if (row.state === 'running') return agentWord('busy').word
  return agentWord('idle').word
}

function toneFromState(state: OrchRosterRow['state']): Tone {
  if (state === 'wants-you') return 'needs-you'
  if (state === 'busy' || state === 'watching' || state === 'pool') return TONE_WORKING
  if (state === 'starting') return 'starting'
  if (state === 'exited') return 'exited'
  return 'idle'
}

// M279. formatAgo moved to shell/format-ago.ts: the inspector's Activity tab
// reads the same buffer and must age a row the same way.

function kindGlyph(kind: OrchRosterRow['kind']): JSX.Element {
  if (kind === 'chat') return <KindChat />
  if (kind === 'terminal') return <KindTerminal />
  if (kind === 'watcher') return <KindWatcher />
  if (kind === 'workflow') return <KindWorkflow />
  if (kind === 'work') return <KindWork />
  if (kind === 'file') return <KindFile />
  return <Orbit />
}

/**
 * The cube's SVG surface: hit-target, beacon and label. The 3D body itself is
 * a real-lit mesh painted by `<OrchestrationCubes>` (a WebGL canvas sandwiched
 * between this layer's ground/edges and its callouts in `.orch__graph-wrap`)
 * — this element keeps the same classes/data attributes the old CSS-3D body
 * carried (`orch__cube`, `data-tone`, `data-attention`, `data-depth`, …) so
 * click/dblclick, keyboard nav, `verify-orchestration.cjs` and `shot.cjs`'s
 * selectors are all unchanged. `attention` is computed once for both this
 * element and its mesh by `useAttentionAck` in `GraphBoard`, not locally —
 * two independent acknowledgment clocks would drift.
 */
function IsoCube(props: {
  node: OrchGraphNode
  labelOffset: { x: number; y: number }
  band: OrchDepthBand
  selected: boolean
  attention: boolean
  /** The board stage this cube's task just entered, while the wash is live. */
  wash?: OrchWash
  onSelect: (id: string) => void
  onJump: (id: string) => void
  onOverflow: () => void
}): JSX.Element {
  const { node, selected, attention, onSelect, onJump, onOverflow } = props
  const overflow = node.overflow !== undefined
  // The overflow node is not a panel: nothing to select or jump to, its verb is the roster.
  const synthetic = node.synthetic === true || node.id === '__hub__' || overflow
  const live = isLiveRosterState(node.state)
  const needs = node.state === 'wants-you'
  // State skins (M275, now carried by the mesh's material/motion, not CSS):
  // `tone` is still the DOM hook other suites and the callout card read.
  const tone = toneFromState(node.state)
  const skin = `${node.hub ? ' orch__cube--hub' : ''}${overflow ? ' orch__cube--overflow' : synthetic ? ' orch__cube--synthetic' : ''}${selected ? ' orch__cube--on' : ''}${live ? ' orch__cube--live' : ''}${needs ? ' orch__cube--needs' : ''}${tone === TONE_WORKING ? ' orch__cube--busy' : ''}${tone === 'starting' ? ' orch__cube--starting' : ''}${tone === 'exited' ? ' orch__cube--exited' : ''}${tone === 'idle' && !synthetic ? ' orch__cube--idle' : ''}`
  return (
    <g
      className={`orch__cube${skin}`}
      transform={`translate(${node.x}, ${node.y})`}
      style={{ cursor: synthetic && !overflow ? 'default' : 'pointer' }}
      data-tone={tone}
      data-role={node.hub ? 'orchestrator' : node.kind}
      data-attention={attention || undefined}
      data-depth={props.band}
      data-orch-overflow={overflow ? node.overflow!.length : undefined}
      onClick={() => { if (overflow) onOverflow(); else if (!synthetic) onSelect(node.id) }}
      onDoubleClick={() => { if (!synthetic) onJump(node.id) }}
    >
      {/* Keyed on the shift's time so a second move restarts the rim instead of
          silently continuing the first one's animation. */}
      {props.wash !== undefined && (
        <ellipse key={props.wash.at} className="orch__cube-wash" data-stage={props.wash.stage} data-orch-wash={props.wash.stage}
          cy={node.size * 0.65} rx={node.size * 0.98} ry={node.size * 0.3} aria-hidden="true" />
      )}
      {/* Transparent hit-target standing in for the old foreignObject body — same
          footprint, so pointer capture, hover and the label's baseline don't move. */}
      <rect x={-node.size} y={-node.size} width={node.size * 2} height={node.size * 2} className="orch__cube-hit" fill="transparent" />
      {/* Needs-you beacon: a small amber point above the cube. It stops the moment the
          cube is selected — the person has looked, so the graph stops calling. */}
      {attention ? <circle className="orch__cube-beacon" cy={-node.size * 1.02} r={3} aria-hidden="true" /> : null}
      <circle className="orch__cube-state" cx={node.size * 0.7} cy={-node.size * 0.65} r={3} aria-hidden="true" />
      <text x={props.labelOffset.x} y={node.size * 1.4 + props.labelOffset.y} textAnchor="middle" className="orch__cube-label">{node.title}</text>
      <text x={props.labelOffset.x} y={node.size * 1.4 + props.labelOffset.y + 15} textAnchor="middle" className="orch__cube-role">{node.hub ? (synthetic ? 'Workspace hub' : 'Orchestrator') : node.kind}</text>
    </g>
  )
}

/**
 * Attention acknowledgment for every cube, computed once here (not per-cube
 * inside IsoCube) so the SVG hit-target's beacon and the mesh's finite pulse
 * read the exact same clock. Mutating the ref during render is deliberate:
 * with at most nine cubes this is cheap bookkeeping, not a render side effect
 * anyone observes, and it avoids nine independent effects for a dynamic list.
 */
function useAttentionAck(): (node: OrchGraphNode, selected: boolean) => boolean {
  const ack = useRef(new Map<string, boolean>())
  return (node, selected) => {
    const needs = node.state === 'wants-you'
    if (!needs) ack.current.set(node.id, false)
    else if (selected) ack.current.set(node.id, true)
    return needs && !selected && !(ack.current.get(node.id) ?? false)
  }
}

/** The last non-blank line of a chat reply or terminal tail, scrubbed for the HUD. */
function outwardTail(panelId: string, isChat: boolean, terminalLine: string): string {
  const raw = isChat ? lastAssistantText(panelId) : terminalLine
  if (raw.trim() === '') return ''
  const lines = outward(raw, `panel ${panelId}`).text.split('\n').map((l) => l.trim()).filter((l) => l !== '')
  return lines[lines.length - 1] ?? ''
}

/** How far below the cube centre a flipped card's anchor sits, in cube sizes — under the label. */
const CALLOUT_BELOW_K = 1.4

/** Cards share the projected cube anchor but never inherit its face rotation. */
function CubeCallout({ node, offsetX, below, drift, band, expanded, task, onSelect, onJump, onInterrupt }: {
  node: OrchGraphNode; offsetX: number; expanded: boolean; task?: string
  /** The card hangs under the cube, stem pointing up — set when there is no room above. */
  below: boolean
  /** Callouts pan fastest: the card slides past its cube by this, the stem stretches to follow. */
  drift: { x: number; y: number }; band: OrchDepthBand
  onSelect: (id: string) => void; onJump: (id: string) => void; onInterrupt?: (id: string) => void
}): JSX.Element {
  // The card is the cube's other face: click selects, double-click jumps. Its own
  // buttons keep their verbs — a Jump press must not also toggle the selection.
  const onCard = (event: { target: EventTarget }, run: () => void): void => {
    if (event.target instanceof Element && event.target.closest('button') !== null) return
    run()
  }
  const chat = useChat(node.id)
  const live = useLiveSession(node.id)
  const blocks = [...chat.turns.flatMap((t) => t.blocks), ...(chat.live?.blocks.map((b) => b.block) ?? [])]
  const tool = blocks.reverse().find((b) => b.type === 'tool_use')
  const work = live?.currentCommand || (tool?.type === 'tool_use' ? tool.name : undefined) || task
  const cwd = live?.cwd || chat.snapshot?.cwd
  const cost = chat.snapshot?.costUsd ?? chat.meta?.costUsd
  const lastLine = useLastLine(node.id)
  // The tail is what the agent last SAID, so it crosses outward() like every other
  // HUD reader (orch.gate.2). Only an expanded card pays for the scrub — at most
  // the hovered and the selected card — and a blank tail is omitted, never "—".
  const tail = expanded ? outwardTail(node.id, chat.turns.length > 0 || chat.live !== undefined && chat.live !== null, lastLine.line) : ''
  const needs = node.state === 'wants-you'
  const ask = (chat.snapshot?.pending.length ?? 0) > 0 ? 'Waiting on approval' : needs ? 'Needs input' : undefined
  const height = expanded ? 154 : 76
  const width = needs ? 218 : 184
  // Far cards shrink a little (never grow, so the collision pass stays honest).
  const s = band === 'far' ? 0.92 : band === 'mid' ? 0.96 : 1
  // The stem runs 22px from the anchor toward the card on whichever side it hangs.
  const sy = below ? 22 : -22
  const anchorY = below ? node.y + node.size * CALLOUT_BELOW_K : node.y - node.size
  return <g className="orch__callout" data-depth={band} transform={`translate(${node.x}, ${anchorY})`}>
    <path className="orch__callout-stem" d={`M 0 0 L ${offsetX + drift.x} ${sy + drift.y}`} />
    <g transform={`translate(${offsetX + drift.x}, ${sy + drift.y}) scale(${s}) translate(${-offsetX}, ${-sy})`}>
    <foreignObject x={offsetX - width / 2} y={below ? 22 : -height - 22} width={width} height={height + 22}>
      <div className="orch__callout-slot" data-below={below || undefined}><div className="orch__callout-card" data-needs={needs || undefined} data-expanded={expanded || undefined}
        onClick={(e) => onCard(e, () => onSelect(node.id))} onDoubleClick={(e) => onCard(e, () => onJump(node.id))}>
        {ask && <strong className="orch__callout-ask">{ask}</strong>}
        <strong title={node.title}>{node.title}</strong>
        {!ask && <span>{stateWord(node)}</span>}
        {work && <span className="orch__callout-work" title={work}>{work}</span>}
        <div className="orch__callout-detail">
          {tail && <span className="orch__callout-tail" title={tail}>{tail}</span>}
          {cwd && <code title={cwd}>{displayPath(cwd).short}</code>}
          {cost !== undefined && <span>${cost.toFixed(2)}</span>}
          <div className="orch__callout-actions">
            <button type="button" className="orch__mini" {...shellControl(() => onJump(node.id))}>Jump</button>
            {onInterrupt && <button type="button" className="orch__mini" {...shellControl(() => onInterrupt(node.id))}>Interrupt</button>}
          </div>
        </div>
      </div></div>
    </foreignObject>
    </g>
  </g>
}

const packetFade = (t: number): number => Math.min(1, t / 0.08, (1 - t) / 0.12)

/**
 * The packets and payload chips on firing HUD edges. Its own component so the
 * per-frame clock re-renders a few circles, never the cubes and their callouts
 * (the canvas LinkLayer makes the same split for the same reason). The rAF runs
 * only while a packet is live; under reduced motion there is no travel — the
 * chip holds at the midpoint for the window, so the fact survives the motion.
 */
function EdgePackets({ edges, points, fires }: {
  edges: readonly { from: string; to: string; authored?: boolean; trigger?: string }[]
  points: ReadonlyMap<string, { x: number; y: number }>
  fires: ReadonlyMap<string, OrchEdgeFire>
}): JSX.Element | null {
  const [, setFrame] = useState(0)
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Date.now() at render, not a stored clock: a fire that arrives while idle
  // must be measured against now, or it reads as future and never starts.
  const packets = orchEdgePackets(edges, fires, Date.now())
  const live = packets.length > 0
  useEffect(() => {
    if (!live || reduced) return
    let raf = requestAnimationFrame(function step() { setFrame((n) => n + 1); raf = requestAnimationFrame(step) })
    return () => cancelAnimationFrame(raf)
  }, [live, reduced])
  if (!live) return null
  return (
    <g className="orch__packets" aria-hidden="true">
      {packets.map((p) => {
        const a = points.get(p.from)
        const b = points.get(p.to)
        if (!a || !b) return null
        const at = (t: number): { x: number; y: number } => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
        const t = reduced ? 0.5 : p.t
        const head = at(t)
        const fade = reduced ? 1 : packetFade(p.t)
        return (
          <g key={p.key} data-orch-packet={p.key} data-authored={p.authored || undefined}>
            {!reduced && [0.14, 0.07].map((lag, i) => {
              const tail = at(Math.max(0, t - lag))
              return <circle key={lag} className="orch__packet-trail" cx={tail.x} cy={tail.y} r={p.authored ? 2 + i : 1.5 + i * 0.5} opacity={fade * (0.3 + i * 0.25)} />
            })}
            {!reduced && <circle className="orch__packet-halo" cx={head.x} cy={head.y} r={p.authored ? 7 : 5} opacity={fade * 0.5} />}
            {!reduced && <circle className="orch__packet" cx={head.x} cy={head.y} r={p.authored ? 3.5 : 2.5} opacity={fade} />}
            {p.trigger !== undefined && (
              <g className="orch__chip" transform={`translate(${head.x}, ${head.y - 16})`} opacity={fade} data-orch-chip={p.trigger}>
                <rect x={-(p.trigger.length * 5.4 + 14) / 2} y={-9} width={p.trigger.length * 5.4 + 14} height={18} rx={9} />
                <text y={3.5} textAnchor="middle">{p.trigger}</text>
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}

function GraphBoard(props: {
  nodes: readonly OrchGraphNode[]
  edges: readonly { from: string; to: string; authored?: boolean; trigger?: string }[]
  fires: ReadonlyMap<string, OrchEdgeFire>
  selectedId: string | null
  selectedIds: readonly string[]
  panels: readonly Panel[]
  workItems: readonly PersistedWorkItem[]
  memberIds: readonly string[] | null
  /** Cubes a metric / roster lens leaves lit; everything else dims in place. `null` = no lens. */
  litIds: ReadonlySet<string> | null
  wash: OrchWash | null
  onInterrupt?: (id: string) => void
  firingKeys: ReadonlySet<string>
  onCamera: (camera: { x: number; y: number; k: number }) => void
  onSelect: (id: string) => void
  onJump: (id: string) => void
  onOverflow: () => void
  describedBy?: string
}): JSX.Element {
  const { nodes, edges, selectedId, selectedIds, firingKeys, litIds, wash, onSelect, onJump, onOverflow } = props
  const lensedOut = (id: string): boolean => litIds !== null && !litIds.has(id)
  const hasSelection = selectedId !== null || selectedIds.length > 0
  const isSelected = (n: OrchGraphNode): boolean => selectedId === n.id || selectedIds.includes(n.id)
  const attentionOf = useAttentionAck()
  const [hovered, setHovered] = useState<string | null>(null)
  const [cam, setCam] = useState({ x: 0, y: 0, k: 1 })
  useEffect(() => props.onCamera(cam), [cam, props.onCamera])
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  // Project endpoints and cubes together so depth never detaches a connection.
  // The stage centres on the hub's model position and reads the ring radius off
  // the satellites, so the tilt foreshortens around whatever the model laid out.
  const hubNode = nodes.find((n) => n.hub)
  const stage: OrchStage = {
    w: ORCH_GRAPH_SIZE.w, h: ORCH_GRAPH_SIZE.h,
    cx: hubNode?.x ?? ORCH_GRAPH_SIZE.w / 2, cy: hubNode?.y ?? ORCH_GRAPH_SIZE.h / 2,
    ringR: nodes.reduce((r, n) => n.hub || !hubNode ? r : Math.max(r, Math.hypot(n.x - hubNode.x, n.y - hubNode.y)), 0) || 148
  }
  const projected = nodes.map((node) => {
    const p = orchProjectNode(node, stage, cam)
    return { ...node, x: p.x, y: p.y, size: node.size * p.scale, depth: p.depth, band: p.band, drift: p.calloutDrift }
  })
  const ground = orchGroundPlane(stage, cam, (hubNode?.size ?? 56) * 0.55)

  const expanded = (id: string): boolean => selectedIds.includes(id) || selectedId === id || hovered === id
  const calloutNodes = projected.filter((n) => !n.synthetic && n.id !== '__hub__' && n.overflow === undefined
    && (props.memberIds === null || props.memberIds.includes(n.id))
    // A lensed-out cube keeps its place but not its card: the lit set's callouts are the answer.
    && !lensedOut(n.id)
    && (isLiveRosterState(n.state) || expanded(n.id)))
  const offsets = new Map<string, number>()
  // Cards that hang BELOW their cube: a back-of-ring cube has no room above it,
  // and x was the only axis clamped — its expanded card drew past the stage top.
  const below = new Set<string>()
  const occupied: { x: number; y: number; w: number; h: number }[] = []
  // Reserve the selected card's space first so attention cannot cover its verbs.
  // Keep each card near its anchor; a slanted stem identifies a shifted card.
  for (const n of [...calloutNodes].sort((a, b) => Number(expanded(b.id)) - Number(expanded(a.id)))) {
    const w = n.state === 'wants-you' ? 218 : 184
    const h = expanded(n.id) ? 154 : 76
    const flip = n.y - n.size - h - 22 < 8
    // Below clears the cube's label (it sits at size × 1.15), mirroring the 22px stem above.
    const y = flip ? n.y + n.size * CALLOUT_BELOW_K + 22 : n.y - n.size - h - 22
    if (flip) below.add(n.id)
    const candidates = [0, ...occupied.flatMap((r) => [r.x + r.w + 12 + w / 2 - n.x, r.x - 12 - w / 2 - n.x]), w + 16, -w - 16].map((dx) => {
      const x = Math.max(8, Math.min(ORCH_GRAPH_SIZE.w - w - 8, n.x + dx - w / 2))
      const overlap = occupied.reduce((sum, r) => sum + Math.max(0, Math.min(x + w + 8, r.x + r.w) - Math.max(x - 8, r.x))
        * Math.max(0, Math.min(y + h + 8, r.y + r.h) - Math.max(y - 8, r.y)), 0)
      return { x, y, w, h, overlap, distance: Math.abs(x + w / 2 - n.x) }
    }).sort((a, b) => a.overlap - b.overlap || a.distance - b.distance)
    const placed = candidates[0]
    occupied.push(placed)
    offsets.set(n.id, placed.x + w / 2 - n.x)
  }

  const cubeSpecs: OrchCubeSpec[] = projected.map((n) => {
    const overflow = n.overflow !== undefined
    const synthetic = n.synthetic === true || n.id === '__hub__' || overflow
    const selected = isSelected(n)
    return {
      id: n.id, x: n.x, y: n.y, size: n.size, depth: n.depth, hub: n.hub, synthetic,
      // toneFromState's five real returns are exactly OrchCubeTone's members;
      // its declared type is the wider Tone only because TONE_WORKING/TONE_NEEDS_YOU are.
      tone: toneFromState(n.state) as OrchCubeTone, selected,
      roleColor: n.hub || n.kind === 'chat' ? '--iris' : n.kind === 'terminal' || n.kind === 'file' ? '--green' : n.kind === 'watcher' ? '--amber' : '--deck-violet',
      dimmed: hasSelection && !selected, lensedOut: lensedOut(n.id),
      attention: attentionOf(n, selected)
    }
  })

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>): void => {
    event.preventDefault()
    const factor = event.deltaY > 0 ? 0.92 : 1.08
    setCam((c) => ({ ...c, k: Math.min(2.2, Math.max(0.55, c.k * factor)) }))
  }

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const target = event.target as SVGElement
    if (target.closest('.orch__cube, .orch__callout-host')) return
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
    <div className="orch__graph-scene" role="group" aria-label="Agent graph" aria-describedby={props.describedBy} data-lens={litIds !== null ? 'true' : undefined}>
      {/* Ground layer: defs, ground plane, edges — everything the cube meshes
          must paint OVER. Owns pan/zoom; a pointerdown that starts on a cube or
          callout never reaches here because the overlay layer above it claims
          those hit-targets first (pointer-events re-enabled per element). */}
      <svg
        className="orch__graph orch__graph--ground"
        viewBox={`0 0 ${ORCH_GRAPH_SIZE.w} ${ORCH_GRAPH_SIZE.h}`}
        aria-hidden="true"
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
          {/* In the ground group's own coordinates (it is translated and scaled). */}
          <clipPath id="orch-ground-clip"><ellipse rx={ground.rx} ry={ground.ry} /></clipPath>
          <radialGradient id="orch-ground-fade-g" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="70%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="orch-ground-fade" maskContentUnits="userSpaceOnUse">
            <ellipse rx={ground.rx} ry={ground.ry} fill="url(#orch-ground-fade-g)" />
          </mask>
        </defs>
        {/* Ground plane: a grid clipped to the tilted ellipse and faded at its rim,
            under concentric rings; the ring at 1/1.45 is the orbit track. It moves
            with the hub layer, so the hub stays planted while satellites parallax. */}
        <g transform={`translate(${ground.x}, ${ground.y}) scale(${ground.k})`} aria-hidden="true">
          <ellipse rx={ground.rx * 1.08} ry={ground.ry * 1.08} fill="url(#orch-hub-glow)" />
          <ellipse rx={ground.rx} ry={ground.ry} className="orch__ground-plane" mask="url(#orch-ground-fade)" />
          <g clipPath="url(#orch-ground-clip)" mask="url(#orch-ground-fade)">
            {Array.from({ length: 13 }, (_, i) => {
              const t = (i - 6) / 6
              return <g key={i}>
                <line className="orch__ground-grid" x1={t * ground.rx} y1={-ground.ry} x2={t * ground.rx} y2={ground.ry} />
                <line className="orch__ground-grid" x1={-ground.rx} y1={t * ground.ry} x2={ground.rx} y2={t * ground.ry} />
              </g>
            })}
          </g>
          {[0.4, 1 / 1.45, 1].map((r) => <ellipse key={r} rx={ground.rx * r} ry={ground.ry * r} className={`orch__ground-ring${r === 1 / 1.45 ? ' orch__ground-ring--track' : ''}`} />)}
        </g>
        {projected.map(n => <ellipse key={`platform-${n.id}`} className="orch__platform" data-role={n.hub ? 'orchestrator' : n.kind} cx={n.x} cy={n.y + n.size * 0.8} rx={n.size * 1.15} ry={n.size * 0.34} />)}
        {orchEdgePaintOrder(edges).map((e) => {
          const from = projected.find((n) => n.id === e.from)
          const to = projected.find((n) => n.id === e.to)
          if (!from || !to) return null
          const firing = firingKeys.has(`${e.from}:${e.to}`) || firingKeys.has(`${e.to}:${e.from}`)
          return (
            <line
              key={`${e.from}-${e.to}-${e.authored === true ? 'a' : 'h'}`}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              className={`orch__edge${e.authored === true ? ' orch__edge--authored' : ''}${firing ? ' orch__edge--current' : ''}${lensedOut(e.from) || lensedOut(e.to) ? ' orch__edge--lensed' : ''}`}
              data-role={to.hub ? from.kind : to.kind}
              data-connected-live={!from.synthetic && !to.synthetic && (isLiveRosterState(from.state) || isLiveRosterState(to.state)) || undefined}
              data-edge-activity={firing ? 'firing' : undefined}
            />
          )
        })}
      </svg>
      {/* The R3F island: real-lit cube meshes, painted above the ground/edges and
          below the hit-targets/callouts. `pointer-events: none` (styles.css) —
          every click still lands on the SVG layer below or above it. */}
      {/* The fallback is the same empty box the loaded island renders into, so
          the layer keeps its place in the sandwich for the frame or two before
          the chunk arrives — a missing box would let the overlay's hit-targets
          reflow, and this view is captured as a golden. */}
      <Suspense fallback={<div className="orch__cube-canvas" aria-hidden="true" />}>
        <OrchestrationCubes nodes={cubeSpecs} viewBox={ORCH_GRAPH_SIZE} />
      </Suspense>
      {/* Overlay layer: hit-targets, beacons, labels and callouts. The svg root
          is pointer-events:none so an empty-space drag falls through to the
          ground layer's pan/zoom; each interactive child re-enables its own
          pointer-events (styles.css), exactly like the single-svg version did
          via `target.closest('.orch__cube, .orch__callout-host')`. */}
      <svg className="orch__graph orch__graph--over" data-has-selection={hasSelection ? 'true' : undefined} viewBox={`0 0 ${ORCH_GRAPH_SIZE.w} ${ORCH_GRAPH_SIZE.h}`}>
        <filter id="orch-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Order among these no longer decides visual occlusion of the cube body
            (the mesh's real z-buffer does), only of labels/beacons, which rarely
            overlap — kept sorted anyway so a label still wins the same ties. */}
        {projected.sort((a, b) => a.depth - b.depth || a.y - b.y).map((n) => (
          <g key={n.id} className="orch__callout-host" data-ghost={props.memberIds !== null && !props.memberIds.includes(n.id) || undefined}
            data-lensed={lensedOut(n.id) || undefined}
            onPointerEnter={() => setHovered(n.id)} onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered(n.id)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovered(null) }}
            tabIndex={n.synthetic && n.overflow === undefined ? undefined : 0}
            aria-label={n.overflow !== undefined ? `${n.title} — show them in the agent pool` : n.title}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget || e.key !== 'Enter') return
              if (n.overflow !== undefined) onOverflow()
              else if (!n.synthetic) onSelect(n.id)
            }}>
          <IsoCube
            node={n}
            band={n.band}
            labelOffset={{ x: Math.tanh(cam.x / 240) * 12, y: Math.tanh(cam.y / 180) * 9 + (cam.k - 1) * 4 }}
            selected={isSelected(n)}
            attention={attentionOf(n, isSelected(n))}
            {...(wash !== null && wash.ids.includes(n.id) ? { wash } : {})}
            onSelect={onSelect}
            onJump={onJump}
            onOverflow={onOverflow}
          />
          </g>
        ))}
        {/* Cards are billboards nearest the eye, so they paint after EVERY cube. Inside
            each cube's host, a card flipped under a back-of-ring cube lay beneath the
            hub, which paints later by depth. The group repeats the host's hover so
            reaching for Jump never reads as leaving the cube and collapses the card. */}
        {projected.filter((n) => offsets.has(n.id)).map((n) => (
          <g key={`callout-${n.id}`} className="orch__callout-wrap" onPointerEnter={() => setHovered(n.id)} onPointerLeave={() => setHovered(null)}>
            <CubeCallout node={n} offsetX={offsets.get(n.id)!} below={below.has(n.id)} drift={n.drift} band={n.band} expanded={expanded(n.id)}
              task={props.workItems.find((w) => w.panelId === n.id)?.title} onSelect={onSelect} onJump={onJump}
              onInterrupt={props.onInterrupt && props.panels.some((p) => p.rect.id === n.id && isChatPanel(p)) && ['busy', 'starting', 'wants-you'].includes(n.state) ? props.onInterrupt : undefined} />
          </g>
        ))}
        {/* Above the cubes so a chip is never hidden behind the object it leaves;
            the packet fades in and out at the ends so it never sits on a face. */}
        <EdgePackets edges={edges} fires={props.fires} points={new Map(projected.map((n) => [n.id, n]))} />
      </svg>
    </div>
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
  const { panels, workItems, templates = [], displayName, onJumpPanel, onJumpWorkItem, onInterrupt, onMarkDone, onFocusRelated, onOpenFiles, onShowCanvas, taskMemberIds, taskMembersOf } = props
  const [tick, setTick] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [tab, setTab] = useState<SideTab>('activity')
  const [mode, setMode] = useState<OrchMode>('dev')
  const [graphCamera, setGraphCamera] = useState({ x: 0, y: 0, k: 1 })
  // Foreground cards respond first, then settle at the edge of their readable area.
  const floatStyle = mode === 'dev' ? { translate: `${Math.tanh(graphCamera.x / 20) * 22}px ${Math.tanh(graphCamera.y / 14) * 16 - (graphCamera.k - 1) * 8}px` } : undefined
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
  const [edgeFires, setEdgeFires] = useState<Map<string, OrchEdgeFire>>(() => new Map())
  const [freshNeeds, setFreshNeeds] = useState<Set<string>>(() => new Set())
  const [stageShift, setStageShift] = useState<OrchWash | null>(null)
  const knownNeedsRef = useRef<Set<string>>(new Set())
  const prevStagesRef = useRef<Map<string, WorkItemState> | null>(null)
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

  // M279. The feed's PRODUCER lives in canvas/useActivityFeed.ts now (always
  // mounted); this effect keeps only the page's own reactions to a transition.
  useEffect(() => onAgentTransition((panelId, state, prev) => {
    setTick((n) => n + 1)
    if (prev !== state) {
      const at = Date.now()
      // Snapshot edges are rebuilt below; fire any live graph edge that still
      // names this panel. The packet leaves the panel that changed.
      setEdgeFires((cur) => orchRecordFires(cur, orchEdgesFiredByPanel(liveEdgesRef.current, panelId), { at, origin: panelId, handoff: false }))
    }
  }), [panels])

  const liveEdgesRef = useRef<{ from: string; to: string; authored?: boolean }[]>([])

  // A handoff crossing is useHandoff's fact, not ours: the edge store's layer
  // version moves when an edge turns `firing`, and the HUD reads the fire's own
  // timestamp rather than stamping a second, later one.
  const edgeVersion = useEdgeActivityVersion()
  useEffect(() => {
    const now = Date.now()
    const hits = liveEdgesRef.current.filter((e) => {
      if (e.authored !== true) return false
      const at = edgeFiredAt(e.from, e.to)
      return at !== undefined && now - at >= 0 && now - at < ORCH_PACKET_MS
    })
    if (hits.length === 0) return
    setEdgeFires((cur) => {
      let next: Map<string, OrchEdgeFire> = cur
      for (const e of hits) {
        const at = edgeFiredAt(e.from, e.to)!
        const key = orchEdgeKey(e.from, e.to)
        if (cur.get(key)?.at === at) continue
        next = orchRecordFires(next, [key], { at, origin: e.from, handoff: true })
      }
      return next
    })
  }, [edgeVersion])

  // The line's firing class must lapse when the packet does, not at the next
  // one-second tick — one timer at the soonest expiry.
  useEffect(() => {
    const t = Date.now()
    const soonest = Math.min(...[...edgeFires.values()].map((f) => f.at + ORCH_PACKET_MS - t).filter((ms) => ms > 0))
    if (!Number.isFinite(soonest)) return
    const timer = window.setTimeout(() => setNow(Date.now()), soonest + 16)
    return () => window.clearTimeout(timer)
  }, [edgeFires, now])

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

  const offRingIds = useMemo(
    () => framed.graph.nodes.find((n) => n.overflow !== undefined)?.overflow?.map((o) => o.id) ?? [],
    [framed.graph.nodes]
  )
  // The ring un-capped (an agent closed): an `off-ring` lens would keep nothing, so it lapses.
  const effectiveFilter: OrchRosterFilter = rosterFilter === 'off-ring' && offRingIds.length === 0 ? 'all' : rosterFilter
  const visibleRoster = useMemo(
    () => filterRoster(framed.roster, effectiveFilter, query, offRingIds),
    [framed.roster, effectiveFilter, query, offRingIds]
  )
  visibleRosterRef.current = visibleRoster
  selectedIdsRef.current = selectedIds

  const lensIds = useMemo(() => new Set(visibleRoster.map((r) => r.id)), [visibleRoster])
  const litIds = useMemo(
    () => orchLensLit(framed.graph.nodes, lensIds, effectiveFilter !== 'all' || query.trim() !== ''),
    [framed.graph.nodes, lensIds, effectiveFilter, query]
  )
  const openOffRing = useCallback((): void => {
    setMetric(null)
    setQuery('')
    setRosterFilter('off-ring')
  }, [])
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

  // Any board item's move, not only the focused task's: the focused task is
  // re-picked by state, so tracking its one state read a DIFFERENT task taking
  // over as a shift. Per item id, a first sight is never a move.
  // Read through a ref: the caller passes a fresh arrow every render, and the
  // effect must run on a board change, not on every Canvas render.
  const membersOfRef = useRef(taskMembersOf)
  membersOfRef.current = taskMembersOf
  useEffect(() => {
    const prev = prevStagesRef.current
    prevStagesRef.current = new Map(workItems.map((w) => [w.id, w.state]))
    if (prev === null) return
    const moved = orchStageShifts(prev, workItems).at(-1)
    if (moved === undefined) return
    const item = workItems.find((w) => w.id === moved.id)
    const ids = membersOfRef.current?.(moved.id) ?? (item?.panelId !== undefined ? [item.panelId] : [])
    setStageShift({ at: Date.now(), stage: moved.to, ids })
  }, [workItems])

  // The rim lapses at its own window, not at the next one-second tick.
  useEffect(() => {
    if (stageShift === null) return
    const left = stageShift.at + ORCH_STAGE_WASH_MS - Date.now()
    if (left <= 0) return
    const timer = window.setTimeout(() => setNow(Date.now()), left + 16)
    return () => window.clearTimeout(timer)
  }, [stageShift])

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
    void now
    // Date.now(), not `now`: that state can be up to a second old when a fire
    // lands, which would read the fire as future and skip the line entirely.
    return new Set(orchEdgePackets(liveEdgesRef.current, edgeFires, Date.now()).map((p) => p.key))
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
  const wash = stageShift !== null && Date.now() - stageShift.at < ORCH_STAGE_WASH_MS ? stageShift : null

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
        {/* The textual truth. It reads liveSnap — never the lens, frame or ring
            cap — so the scene below may illustrate it but can never hide it. */}
        {blocker !== null && (
          <p id="orch-blocker" className="orch__blocker" data-orch-blocker={blocker.kind} data-orch-density="contextual">{blocker.line}</p>
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
                value={effectiveFilter}
                onChange={(e) => setRosterFilter(e.target.value as OrchRosterFilter)}
                aria-label="Filter agents"
              >
                {ORCH_ROSTER_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                {offRingIds.length > 0 && <option value="off-ring">{`Not on the ring (${offRingIds.length})`}</option>}
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
                nodes={members === null ? framed.graph.nodes : [...framed.graph.nodes, ...liveSnap.graph.nodes.filter((n) => !members.includes(n.id) && n.id !== ORCH_OVERFLOW_ID)]}
                edges={framed.graph.edges}
                panels={panels}
                workItems={workItems}
                memberIds={members}
                litIds={litIds}
                wash={wash}
                onOverflow={openOffRing}
                {...(blocker !== null ? { describedBy: 'orch-blocker' } : {})}
                onInterrupt={onInterrupt}
                selectedId={selectedId}
                selectedIds={selectedIds}
                firingKeys={firingKeys}
                fires={edgeFires}
                onCamera={setGraphCamera}
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
                      className={`orch__wp${pipelineStage === stage.state ? ' orch__wp--on' : ''}${stage.count > 0 ? ' orch__wp--hot' : ''}${liveSnap.task?.state === stage.state ? ' orch__wp--current' : ''}${stageShiftLive && stageShift?.stage === stage.state ? ' orch__wp--shift' : ''}`}
                      data-tone={stage.state === WORK_ITEM_STATES[1] ? TONE_WORKING : stage.state === WORK_ITEM_STATES[2] ? 'starting' : stage.state === WORK_ITEM_STATES[3] ? 'idle' : 'kind'}
                      data-orch-stage-current={liveSnap.task?.state === stage.state ? '' : undefined}
                      data-orch-stage-shift={stageShiftLive && stageShift?.stage === stage.state ? '' : undefined}
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
                style={floatStyle}
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
                style={floatStyle}
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
                    ? <Sparkline values={memHistory} tone="--green" />
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

        <MotionSurface open enter><aside className="orch__side" aria-label="Activity">
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
                      <span className="orch__event-chip" data-tone={e.tone} aria-hidden="true">{e.kind === 'watcher' ? <KindWatcher /> : e.kind === 'task' ? <KindWork /> : e.kind === 'agent' ? <KindChat /> : <Orbit />}</span>
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
        </aside></MotionSurface>
      </div>
    </div>
  )
}

export const OrchestrationView = memo(OrchestrationViewImpl)
