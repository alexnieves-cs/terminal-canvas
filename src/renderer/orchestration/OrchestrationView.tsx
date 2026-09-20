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
import { useChat, getChat, lastAssistantText, useApprovals } from '@renderer/chat/chat-store'
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
import { KindChat, KindFile, KindTerminal, KindWatcher, KindWorkflow, KindWork, Orbit, Search, Stop } from '@renderer/icons'
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
  type OrchRosterRow,
  orchBestFile,
  orchPhase
} from './orchestration-model'
import {
  orchActivityEvents,
  subscribeOrchActivity
} from './orchestration-activity'
import { ORCH_COS_TILT, ORCH_GROUND_K, orchGroundPlane, orchProjectNode, type OrchDepthBand, type OrchStage } from './orchestration-depth'
import type { OrchCubeSpec } from './OrchestrationCubes'
import { getOrchPrefs, persistedOrchPrefs, seedOrchPrefs, setOrchPrefs, type OrchLens, type OrchSideTab } from './orchestration-prefs'
import { OrchWorkbench, type BenchSubject } from './OrchWorkbench'
import { sameOrchestrate, type PersistedOrchestrate, type WorkbenchTab } from '@shared/orchestrate-prefs'
import type { ReviewHandoff } from '@shared/review-readiness'
import { onChatTurnEnd } from '@renderer/chat/chat-store'
import {
  orchAnswerKey, orchAttentionRows, orchIslandGroups, orchIslandOrder, orchMoveIsland, orchNextAction, orchPickIslandItem, orchPlacementLine, orchPruneSent, orchTaskIslands,
  type OrchAttentionRow, type TaskIsland
} from './orchestration-island'
import { ORCH_DEP_GROUPING, ORCH_DEP_READ_ONLY, orchBlockedLine, orchDependencyEdges, orchDependencyFocus, type OrchDependencyEdge } from './orchestration-dependency'
import { orchControls, orchLimits, orchRetryPreview, orchSessionStanding, orchSpendWord } from './orchestration-controls'
import { useRateLimit } from '@renderer/session/rate-limit-store'
import { BACKENDS, type AgentBackend } from '@shared/agent-backends'
import type { WorktreeListRow } from '@shared/ipc-contract'
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
  /**
   * M284. A pending permission answered through the SAME executor the Dock, the
   * palette and the inspector use (`answerApproval` → `agent:answer`), keyed by the
   * request's own `(panel id, requestId)` — never a second permission state.
   */
  onAnswer?: (id: string, requestId: string, allow: boolean) => void
  /** M284. The existing review node for this panel, on the canvas (openReview) — a labelled page change. */
  onReviewOnCanvas?: (panelId: string) => void
  /** M287. This workspace's persisted Orchestrate layout, and where a change goes (the workspace record, saved by the canvas). */
  orchestrate?: PersistedOrchestrate
  onOrchestrate?: (next: PersistedOrchestrate) => void
  /** M287. The board's one patch door, for the brief, the criteria and the review mark. Nothing here dispatches. */
  onPatchWorkItem?: (itemId: string, fields: Partial<PersistedWorkItem>) => void
  /** M287. The canvas's own readiness judgement for a task — the ONE author of its signature and identity. */
  taskHandoffOf?: (itemId: string) => ReviewHandoff | undefined
  onRefreshTaskHandoffs?: () => void
  /**
   * M289. What the canvas RECORDED for each handoff edge (`useHandoff`'s
   * `setResult` sentences, keyed `from:to`) — the one source of "did it fire,
   * was it skipped, and why". The lens reads these back; it decides nothing.
   */
  automationResults?: ReadonlyMap<string, string>
  /**
   * M290. Retry's one exit: open the chat on the canvas with the previewed
   * prompt in its composer, UNSENT. Nothing on this page sends a message.
   */
  onRetryOnCanvas?: (panelId: string, prompt: string) => void
}

/** A board stage change, painted as a brief rim on the moved item's member cubes. */
interface OrchWash { at: number; stage: WorkItemState; ids: readonly string[] }

type SideTab = OrchSideTab

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

function kindGlyphSized(kind: OrchRosterRow['kind'], size: number): JSX.Element {
  if (kind === 'chat') return <KindChat size={size} />
  if (kind === 'terminal') return <KindTerminal size={size} />
  if (kind === 'watcher') return <KindWatcher size={size} />
  if (kind === 'workflow') return <KindWorkflow size={size} />
  if (kind === 'work') return <KindWork size={size} />
  if (kind === 'file') return <KindFile size={size} />
  return <Orbit size={size} />
}
const kindGlyph = (kind: OrchRosterRow['kind']): JSX.Element => kindGlyphSized(kind, 16)

/** Where a plate's top edge hangs, in cube sizes below the cube's centre — clear of the platform's rim. */
const PLATE_DROP_K = 1.2
const PLATE_H = 34
const PLATE_MAX_CHARS = 20

/**
 * A node's name plate: a kind tile, the name, and under it the state dot with
 * the product's state word and the role. It replaced two bare `<text>` rows,
 * which had no backing — over the grid and the spokes a name was half
 * legible, and two neighbours' names ran into each other. Every fact on it is
 * one the roster already has; nothing here is invented (no progress, no step).
 *
 * Plain SVG, never a foreignObject: this layer sits under a pan/zoom
 * projection, and the file's callouts are the only foreignObjects for the
 * reason orchestration-depth.ts gives. The width is ESTIMATED from the
 * character count (the name is mono, so the estimate is close) — measuring
 * text would be a layout read per node per camera frame.
 */
function NodePlate({ node, synthetic, overflow, x, y }: { node: OrchGraphNode; synthetic: boolean; overflow: boolean; x: number; y: number }): JSX.Element {
  const name = node.title.length > PLATE_MAX_CHARS ? `${node.title.slice(0, PLATE_MAX_CHARS - 1).trimEnd()}…` : node.title
  const role = node.hub ? (synthetic ? 'Workspace hub' : 'Orchestrator') : overflow ? 'Other' : node.kind
  // A placeholder has no process, so it has no state to say: the role stands alone.
  //
  // M280: an ordinary satellite's plate says its STATE and nothing else — the
  // card beside it carries the kind, and the two sat eight pixels apart saying
  // the same word twice. The hub and the `+N more` node keep their role, because
  // theirs is not a kind: "Workspace hub", "Orchestrator" and "Other" name a
  // position in the ring that no card repeats and `node.kind` cannot express.
  const sub = synthetic ? role : node.hub || overflow ? `${stateWord(node)} · ${role}` : stateWord(node)
  const w = Math.max(92, Math.min(176, Math.max(name.length * 6.7, sub.length * 5.6) + 40))
  return (
    <g className="orch__plate" transform={`translate(${x - w / 2}, ${y})`} aria-hidden="true">
      <title>{node.title}</title>
      <rect className="orch__plate-bg" width={w} height={PLATE_H} rx={7} />
      <rect className="orch__plate-tile" x={6} y={7} width={20} height={20} rx={5} />
      <g className="orch__plate-glyph" transform="translate(10, 11)">{node.hub && !synthetic ? <Orbit size={12} /> : kindGlyphSized(node.kind, 12)}</g>
      <text x={32} y={14.5} className="orch__cube-label">{name}</text>
      {!synthetic && <circle className="orch__cube-state" cx={35} cy={24.5} r={2.5} />}
      <text x={synthetic ? 32 : 42} y={28} className="orch__cube-role">{sub}</text>
    </g>
  )
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
      // The panel this cube stands for. The shot harness needs to address one
      // cube by panel to drive it into a state (an all-idle fixture cannot show
      // a lit ring), and every other DOM hook on this element — data-lit,
      // data-depth, data-expanded — is already spelled this way.
      data-node={node.id}
      // The cube's ROLE. The harness seeds by kind so a lit ring contains more
      // than one role — a scene in which every working cube is a terminal cannot
      // show that brightness preserves hue, whatever the shader does.
      data-kind={node.kind}
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
      <NodePlate node={node} synthetic={synthetic} overflow={overflow} x={props.labelOffset.x} y={node.size * PLATE_DROP_K + props.labelOffset.y} />
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

/**
 * A callout card's box. ONE definition because two readers must agree on it:
 * the card's own <foreignObject>, and the collision placer that decides where
 * the card may sit. They were the same two literals written out twice, so the
 * kind line (M280) grew the card in one of them and the ring silently began
 * overlapping cards on the crowded side — a layout bug, not a type error.
 * Collapsed holds a tile beside three lines: name, kind, one state word.
 */
export const CALLOUT_H = { rest: 94, expanded: 172 } as const
export const calloutHeight = (expanded: boolean): number => (expanded ? CALLOUT_H.expanded : CALLOUT_H.rest)

/** How far below the cube centre a flipped card's anchor sits — under the name plate, whose own geometry decides it. */
const calloutBelow = (size: number): number => size * PLATE_DROP_K + PLATE_H + 2

/** Read only the selected conversation; never expose thinking contents in the HUD. */
function SelectedChatPhase({ panelId }: { panelId: string }): JSX.Element | null {
  const chat = useChat(panelId)
  const liveBlocks = chat.live?.blocks ?? []
  const turns = chat.turns.filter((turn) => turn.role === 'assistant')
  const blocks = chat.live ? liveBlocks.map((entry) => entry.block) : turns[turns.length - 1]?.blocks ?? []
  const liveText = liveBlocks[liveBlocks.length - 1]?.text ?? ''
  const tail = chat.live
    ? outward(liveText, `panel ${panelId}`).text.split('\n').map((line) => line.trim()).filter(Boolean).pop() ?? ''
    : outwardTail(panelId, true, '')
  // A tool name is the agent's text too, so the label crosses the gate like the tail.
  const found = orchPhase(blocks, Boolean(chat.live))
  const phase = found.kind === 'idle' ? tail : outward(found.label, `panel ${panelId}`).text
  return phase ? <span className="orch__phase" data-phase={found.kind} title={phase}>{phase}</span> : null
}

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
  // A LIVE chat's work line is its phase (Thinking… / Using · tool); a terminal has
  // no thinking channel, so it keeps its command. Same row — CALLOUT_H does not move.
  const livePhase = chat.live ? orchPhase(chat.live.blocks.map((b) => b.block), true) : null
  const work = live?.currentCommand || (livePhase && livePhase.kind !== 'idle' ? outward(livePhase.label, `panel ${node.id}`).text : undefined)
    || (tool?.type === 'tool_use' ? tool.name : undefined) || task
  const cwd = live?.cwd || chat.snapshot?.cwd
  const cost = chat.snapshot?.costUsd ?? chat.meta?.costUsd
  const lastLine = useLastLine(node.id)
  // The tail is what the agent last SAID, so it crosses outward() like every other
  // HUD reader (orch.gate.2). Only an expanded card pays for the scrub — at most
  // the hovered and the selected card — and a blank tail is omitted, never "—".
  const tail = expanded ? outwardTail(node.id, chat.turns.length > 0 || chat.live !== undefined && chat.live !== null, lastLine.line) : ''
  const needs = node.state === 'wants-you'
  const ask = (chat.snapshot?.pending.length ?? 0) > 0 ? 'Waiting on approval' : needs ? 'Needs input' : undefined
  const height = calloutHeight(expanded)
  const width = needs ? 218 : 184
  // Far cards shrink a little (never grow, so the collision pass stays honest).
  const s = band === 'far' ? 0.92 : band === 'mid' ? 0.96 : 1
  // The stem runs 22px from the anchor toward the card on whichever side it hangs.
  const sy = below ? 22 : -22
  const anchorY = below ? node.y + calloutBelow(node.size) : node.y - node.size
  return <g className="orch__callout" data-depth={band} transform={`translate(${node.x}, ${anchorY})`}>
    <path className="orch__callout-stem" d={`M 0 0 L ${offsetX + drift.x} ${sy + drift.y}`} />
    <g transform={`translate(${offsetX + drift.x}, ${sy + drift.y}) scale(${s}) translate(${-offsetX}, ${-sy})`}>
    <foreignObject x={offsetX - width / 2} y={below ? 22 : -height - 22} width={width} height={height + 22}>
      <div className="orch__callout-slot" data-below={below || undefined}><div className="orch__callout-card" data-needs={needs || undefined} data-expanded={expanded || undefined}
        onClick={(e) => onCard(e, () => onSelect(node.id))} onDoubleClick={(e) => onCard(e, () => onJump(node.id))}>
        {ask && <strong className="orch__callout-ask">{ask}</strong>}
        <div className="orch__callout-head">
          {/* The kind's glyph in a role-tinted tile, as the plate under the cube
              wears it — the card and the plate name the same panel, so they
              should not disagree about what it looks like. */}
          <span className="orch__callout-tile" aria-hidden="true">{kindGlyphSized(node.kind, 13)}</span>
          <div className="orch__callout-names">
            <strong title={node.title}>{node.title}</strong>
            {/* Name, kind, one state — the rest layer's three facts, on three
                lines instead of crushed onto one. `kind` is a real field; the
                reference's role blurbs ("Web & Docs") have no source here and
                are not invented to fill the line. */}
            <span className="orch__callout-kind">{node.kind}</span>
          </div>
        </div>
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
  /** M290. Whether this panel's runtime has an interrupt door right now (the view's capability read). */
  canInterrupt: (id: string) => boolean
  /** M289. The dependency lens is on: trigger words on the authored edges, spokes marked as grouping. */
  depFocus: boolean
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
  // M283. The camera starts where the user left it, not at the origin (orchestration-prefs.ts).
  const [cam, setCam] = useState(() => getOrchPrefs().camera)
  useEffect(() => { setOrchPrefs({ camera: cam }); props.onCamera(cam) }, [cam, props.onCamera])
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  // Project endpoints and cubes together so depth never detaches a connection.
  // The stage centres on the hub's model position and reads the ring radius off
  // the satellites, so the tilt foreshortens around whatever the model laid out.
  const hubNode = nodes.find((n) => n.hub)
  const stage: OrchStage = {
    w: ORCH_GRAPH_SIZE.w, h: ORCH_GRAPH_SIZE.h,
    cx: hubNode?.x ?? ORCH_GRAPH_SIZE.w / 2, cy: hubNode?.y ?? ORCH_GRAPH_SIZE.h / 2,
    ringR: nodes.reduce((r, n) => n.hub || !hubNode ? r : Math.max(r, Math.hypot(n.x - hubNode.x, n.y - hubNode.y)), 0) || 250
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
  // Every node is an obstacle, not only the other cards: a back-of-ring cube's
  // card hangs BELOW it, straight down the spoke onto the hub, and with only the
  // hub reserved it slid sideways onto a neighbour's cube and name plate instead.
  // Each footprint (cube and plate) costs its overlap. A dense ring has NO free
  // spot for a 184×154 card — four captures of weight-tuning only moved which
  // node it hid — so the weights say what is least harmful to hide: a REAL hub
  // costs double (every connection leads to it), a neighbour costs its area, and
  // the `No supervisor yet` placeholder costs almost nothing, because it says
  // nothing. With no supervisor the card hangs over the empty centre, as before;
  // with one, it slides beside it.
  const footprints = projected.map((o) => ({ id: o.id, weight: o.hub ? (o.synthetic === true || o.id === '__hub__' ? 0.25 : 2) : 1, x: o.x - o.size * 1.4, y: o.y - o.size, w: o.size * 2.8, h: o.size + calloutBelow(o.size) }))
  const cover = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad: number): number =>
    Math.max(0, Math.min(a.x + a.w + pad, b.x + b.w) - Math.max(a.x - pad, b.x)) * Math.max(0, Math.min(a.y + a.h + pad, b.y + b.h) - Math.max(a.y - pad, b.y))
  for (const n of [...calloutNodes].sort((a, b) => Number(expanded(b.id)) - Number(expanded(a.id)))) {
    const w = n.state === 'wants-you' ? 218 : 184
    const h = calloutHeight(expanded(n.id))
    const others = footprints.filter((f) => f.id !== n.id)
    // ABOVE and BELOW are both CANDIDATES, not a decision taken before the search.
    // This was a one-dimensional search on a two-dimensional board: y was fixed
    // first (above, or below only when above did not fit on the stage) and only x
    // was ever swept. On a twelve-node ring that is the whole reason the weights
    // above had to choose what was "least harmful to hide" — the placer was
    // picking the best seat in one row while the free seat sat in the other. Below
    // clears the cube's name plate, mirroring the 22px stem above; a row that runs
    // off the stage is dropped rather than clamped, because a clamped row silently
    // re-enters the search as a DIFFERENT box from the one its cost was computed
    // for. If neither row fits, the old clamp is the fallback.
    const rows = [n.y - n.size - h - 22, n.y + calloutBelow(n.size) + 22]
      .filter((y) => y >= 8 && y + h <= ORCH_GRAPH_SIZE.h - 8)
    if (rows.length === 0) rows.push(Math.max(8, Math.min(ORCH_GRAPH_SIZE.h - h - 8, n.y - n.size - h - 22)))
    // The candidate set is every gap EDGE plus a coarse sweep of the board. Edges
    // alone were enough while a card was two lines tall; at three (M280's kind
    // line) a crowded arc can have no edge-derived slot that clears its
    // neighbours, and the placer then had to pick the least-bad overlap from a
    // set that never contained the free spot 30px further along. The sweep is
    // 24px, which is finer than the 12px gap the edge candidates already leave.
    const sweep = []
    for (let x = 8; x <= ORCH_GRAPH_SIZE.w - w - 8; x += 24) sweep.push(x + w / 2 - n.x)
    const drifts = [0, ...[...occupied, ...others].flatMap((r) => [r.x + r.w + 12 + w / 2 - n.x, r.x - 12 - w / 2 - n.x]), w + 16, -w - 16, ...sweep]
    const candidates = rows.flatMap((y) => drifts.map((dx) => {
      const x = Math.max(8, Math.min(ORCH_GRAPH_SIZE.w - w - 8, n.x + dx - w / 2))
      const box = { x, y, w, h }
      // Another CARD is never acceptable to cover (its verbs are under it), so it
      // outweighs any node; among nodes the covered area decides.
      const overlap = occupied.reduce((sum, r) => sum + cover(box, r, 8) * 8, 0) + others.reduce((sum, r) => sum + cover(box, r, 0) * r.weight, 0)
      // Nearness is part of the cost, not a tie-break: by covered area alone the
      // card went to the far side of the ring, its stem crossing three spokes — a
      // card a long way from its cube reads as somebody else's. 60 px² per px of
      // drift; 20 was measured too weak (the far side still won on area).
      // Now that y is searched too, the measure is the distance from the CUBE to
      // the card's centre, so the two rows compete on the same terms — a straight
      // horizontal comparison would have made every card below free.
      const distance = Math.hypot(x + w / 2 - n.x, y + h / 2 - n.y)
      return { x, y, w, h, overlap: overlap + distance * 60, distance }
    })).sort((a, b) => a.overlap - b.overlap || a.distance - b.distance)
    const placed = candidates[0]
    occupied.push(placed)
    if (placed.y > n.y) below.add(n.id)
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
      roleColor: n.hub || n.kind === 'chat' ? '--iris' : n.kind === 'terminal' || n.kind === 'file' ? '--deck-steel' : '--deck-violet',
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
            under concentric rings; the ring at 1/ORCH_GROUND_K is the orbit track. It moves
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
          {[0.4, 1 / ORCH_GROUND_K, 1].map((r) => <ellipse key={r} rx={ground.rx * r} ry={ground.ry * r} className={`orch__ground-ring${r === 1 / ORCH_GROUND_K ? ' orch__ground-ring--track' : ''}`} />)}
        </g>
        {/* A platform is a disc on the GROUND, so it is flattened by the stage's own
            tilt like the ground is — a fixed 0.34 was the old 32° camera's number
            written down twice. `data-lit` is the agent's real tone, never a role. */}
        {projected.map(n => <ellipse key={`platform-${n.id}`} className="orch__platform" data-role={n.hub ? 'orchestrator' : n.kind}
          data-lit={n.synthetic === true || n.overflow !== undefined ? undefined : toneFromState(n.state)}
          cx={n.x} cy={n.y + n.size * 0.62} rx={n.size * 1.35} ry={n.size * 1.35 * ORCH_COS_TILT} />)}
        {orchEdgePaintOrder(edges).map((e) => {
          const from = projected.find((n) => n.id === e.from)
          const to = projected.find((n) => n.id === e.to)
          if (!from || !to) return null
          const firing = firingKeys.has(`${e.from}:${e.to}`) || firingKeys.has(`${e.to}:${e.from}`)
          return (
            <line
              key={`${e.from}-${e.to}-${e.authored === true ? 'a' : 'h'}`}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              className={`orch__edge${e.authored === true ? ' orch__edge--authored' : ''}${firing ? ' orch__edge--current' : ''}${lensedOut(e.from) || lensedOut(e.to) ? ' orch__edge--lensed' : ''}${props.depFocus && e.authored !== true ? ' orch__edge--grouping' : ''}`}
              data-role={to.hub ? from.kind : to.kind}
              data-connected-live={!from.synthetic && !to.synthetic && (isLiveRosterState(from.state) || isLiveRosterState(to.state)) || undefined}
              data-edge-activity={firing ? 'firing' : undefined}
              data-orch-edge={e.authored === true ? 'dependency' : 'grouping'}
            />
          )
        })}
        {/* M289. With the lens on, every dependency says its trigger on the line, and
            the synthetic centre says what it is: grouping, not a supervisor. */}
        {props.depFocus && orchEdgePaintOrder(edges).filter((e) => e.authored === true).map((e) => {
          const from = projected.find((n) => n.id === e.from)
          const to = projected.find((n) => n.id === e.to)
          if (!from || !to) return null
          return <text key={`label-${e.from}-${e.to}`} className="orch__edge-label" x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6} textAnchor="middle" data-orch-edge-label={`${e.from}:${e.to}`}>{e.trigger ?? 'a bare link'}</text>
        })}
        {props.depFocus && hubNode !== undefined && (hubNode.synthetic === true || hubNode.id === '__hub__') && (() => {
          const h = projected.find((n) => n.id === hubNode.id)
          return h === undefined ? null : <text className="orch__edge-label orch__edge-label--grouping" x={h.x} y={h.y + h.size + 18} textAnchor="middle" data-orch-grouping>{ORCH_DEP_GROUPING}</text>
        })()}
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
              onInterrupt={props.onInterrupt && props.canInterrupt(n.id) ? props.onInterrupt : undefined} />
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

/**
 * M284. The worktree record the task island reads its branch from. A READ of main's
 * list, refetched when the board changes (a dispatch mints a lane), never a watch.
 */
function useOrchWorktrees(signal: unknown): readonly WorktreeListRow[] {
  const [rows, setRows] = useState<readonly WorktreeListRow[]>([])
  useEffect(() => {
    if (typeof window.canvas?.worktree?.list !== 'function') return
    let live = true
    void window.canvas.worktree.list().then((got) => { if (live) setRows(got) }, () => { if (live) setRows([]) })
    return () => { live = false }
  }, [signal])
  return rows
}

function OrchestrationViewImpl(props: OrchestrationViewProps): JSX.Element {
  const { panels, workItems, templates = [], displayName, onJumpPanel, onJumpWorkItem, onInterrupt, onMarkDone, onFocusRelated, onOpenFiles, onShowCanvas, taskMemberIds, taskMembersOf, onAnswer, onReviewOnCanvas, orchestrate, onOrchestrate, onPatchWorkItem, taskHandoffOf, onRefreshTaskHandoffs, automationResults, onRetryOnCanvas } = props
  // M287. The workspace's persisted record seeds the in-memory prefs BEFORE
  // the states below read them — a useState initializer, so it runs once per
  // mount and never on a later render of the same page.
  useState(() => { seedOrchPrefs(orchestrate); return true })
  const [tick, setTick] = useState(0)
  // M283. Seeded from, and written back to, Orchestrate's own prefs so a round trip
  // through the Canvas returns to the same view (orchestration-prefs.ts).
  // The SELECTION is not a layout pref and is not kept: a selection surviving the page
  // toggle re-aimed the pool, the commands and the feed at a session the user was no longer
  // looking at (the golden critic caught it), which is the plan's stale-target hazard.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [tab, setTab] = useState<SideTab>(() => getOrchPrefs().tab)
  const [mode, setMode] = useState<OrchMode>(() => getOrchPrefs().mode)
  const [graphCamera, setGraphCamera] = useState(() => getOrchPrefs().camera)
  useEffect(() => { setOrchPrefs({ tab, mode }) }, [tab, mode])
  // M287. The workbench: its tab, its height, and what it is pinned to. The pin
  // is NOT persisted — it names a live panel id, meaningless after a relaunch.
  const [benchTab, setBenchTab] = useState<WorkbenchTab>(() => getOrchPrefs().workbench.tab)
  const [benchHeight, setBenchHeight] = useState<number>(() => getOrchPrefs().workbench.height)
  // Closed at rest (the critic: an open strip by default squeezed the scene to half and
  // clipped the card row). A tab, Review changes, a terminal card or a drag opens it.
  const [benchOpen, setBenchOpen] = useState<boolean>(() => getOrchPrefs().workbench.open)
  const openBench = useCallback((t: WorkbenchTab): void => { setBenchTab(t); setBenchOpen(true) }, [])
  const [benchPinned, setBenchPinned] = useState<BenchSubject | null>(null)
  const [benchRefresh, setBenchRefresh] = useState(0)
  useEffect(() => onChatTurnEnd(() => setBenchRefresh((n) => n + 1)), [])
  useEffect(() => { setOrchPrefs({ workbench: { tab: benchTab, height: benchHeight, open: benchOpen } }) }, [benchTab, benchHeight, benchOpen])
  // M288. Which island the inspector and the workbench are about (null = the
  // canvas's focused task, Phase A's pick), the islands' presentation order
  // (seeded from the workspace record, appended-only) and the undo stack of
  // presentation moves — a move changes this array and nothing else.
  const [focusIslandId, setFocusIslandId] = useState<string | null>(null)
  const [islandOrder, setIslandOrder] = useState<readonly string[]>(() => getOrchPrefs().islands)
  const [orderHistory, setOrderHistory] = useState<readonly (readonly string[])[]>([])
  useEffect(() => { setOrchPrefs({ islands: islandOrder }) }, [islandOrder])
  // M289. The dependency lens: on, the lit set is the selection's dependency
  // closure and everything else dims in place. Read-only by construction.
  const [depFocus, setDepFocus] = useState(false)
  // M290. The retry PREVIEW, by panel id; nothing is sent from this page.
  const [retryFor, setRetryFor] = useState<string | null>(null)
  // M290. The global limits, read off the settings store the way the
  // navigator and the file tree read theirs; re-read when settings change.
  const [limitRows, setLimitRows] = useState<{ maxConcurrent: number; budgetUsd: number; budgetWindowPercent: number } | null>(null)
  useEffect(() => {
    let live = true
    const read = (): void => {
      if (typeof window.canvas?.settings?.list !== 'function') { setLimitRows({ maxConcurrent: 0, budgetUsd: 0, budgetWindowPercent: 0 }); return }
      void window.canvas.settings.list().then((rows) => {
        if (!live) return
        const num = (id: string): number => { const v = rows.find((r) => r.id === id)?.value; const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 }
        setLimitRows({ maxConcurrent: num('agents.maxConcurrent'), budgetUsd: num('agents.budgetUsd'), budgetWindowPercent: num('agents.budgetWindowPercent') })
      }, () => { if (live) setLimitRows({ maxConcurrent: 0, budgetUsd: 0, budgetWindowPercent: 0 }) })
    }
    read()
    const off = typeof window.canvas?.settings?.onChanged === 'function' ? window.canvas.settings.onChanged(() => read()) : undefined
    return () => { live = false; off?.() }
  }, [])
  const rateLimit = useRateLimit()
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
  const listOrderRef = useRef<string[]>([])
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

  // M284. The one task island (orchestration-island.ts), from the persisted work item
  // and the worktree record it names — the same pick as the canvas's focused task.
  const worktrees = useOrchWorktrees(workItems)
  const islands: TaskIsland[] = useMemo(() => orchTaskIslands({
    items: workItems.map((w) => ({
      id: w.id, title: w.title, state: w.state,
      ...(w.key !== undefined ? { key: w.key } : {}),
      ...(w.panelId !== undefined ? { panelId: w.panelId } : {}),
      ...(w.worktreeId !== undefined ? { worktreeId: w.worktreeId } : {})
    })),
    worktrees,
    sessions: liveSnap.roster.map((r) => ({ id: r.id, title: r.title, kind: r.kind, agentic: r.kind === 'chat' || (r.kind === 'terminal' && panels.some((p) => p.rect.id === r.id && isTerminalPanel(p) && p.spec.agent !== undefined)) })),
    membersOf: (itemId) => taskMembersOf?.(itemId) ?? [],
    cwdOf: (id) => {
      const live = getLiveSession(id)?.cwd
      if (live !== undefined && live !== '') return live
      const p = panels.find((x) => x.rect.id === id)
      if (p !== undefined && isChatPanel(p)) return p.chat.cwd
      if (p !== undefined && isTerminalPanel(p)) return p.spec.cwd
      return undefined
    }
  }), [workItems, worktrees, liveSnap.roster, panels, taskMembersOf])
  // M288. The PRIMARY island is Phase A's pick (the canvas's focused task, else the
  // first session island); the FOCUSED island is the one the person chose here, or
  // the primary. Every read below that says `island` means the focused one.
  const primaryItem = useMemo(() => orchPickIslandItem(workItems.map((w) => ({ id: w.id, title: w.title, state: w.state }))), [workItems])
  const primaryIsland: TaskIsland | null = (primaryItem !== null ? islands.find((i) => i.itemId === primaryItem.id) : undefined) ?? islands.find((i) => i.source === 'session') ?? null
  const island: TaskIsland | null = (focusIslandId === null ? undefined : islands.find((i) => i.id === focusIslandId)) ?? primaryIsland
  const islandIds = useMemo(() => islands.map((i) => i.id), [islands])
  const orderedIds = useMemo(() => orchIslandOrder(islandOrder, islandIds), [islandOrder, islandIds])
  // Append-only: the order state learns new ids and forgets gone ones, never re-sorts.
  useEffect(() => { if (orderedIds.join('\n') !== islandOrder.join('\n')) setIslandOrder(orderedIds) }, [orderedIds, islandOrder])
  const islandGroups = useMemo(() => orchIslandGroups(islands, orderedIds), [islands, orderedIds])
  const moveIsland = (id: string, dir: -1 | 1): void => {
    const next = orchMoveIsland(orderedIds, id, dir)
    if (next === null) return
    setOrderHistory((h) => [...h, orderedIds])
    setIslandOrder(next)
  }
  const undoMove = (): void => {
    const prev = orderHistory[orderHistory.length - 1]
    if (prev === undefined) return
    setIslandOrder(orchIslandOrder(prev, islandIds))
    setOrderHistory(orderHistory.slice(0, -1))
  }
  // M288. The frame is the canvas's focused task (Phase A) until a person picks
  // another island here; then it is that island's members.
  const members = frameTask
    ? (focusIslandId !== null && island !== null && island.memberIds.length > 0
        ? island.memberIds
        : taskMemberIds !== undefined && taskMemberIds.length > 0 ? taskMemberIds : null)
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
  const lensLit = useMemo(
    () => orchLensLit(framed.graph.nodes, lensIds, effectiveFilter !== 'all' || query.trim() !== ''),
    [framed.graph.nodes, lensIds, effectiveFilter, query]
  )
  // M289. With the dependency lens on, the lit set is the selection's dependency
  // closure (computed below, read here through a ref set on every render).
  const depLitRef = useRef<ReadonlySet<string> | null>(null)
  const litIds = depLitRef.current ?? lensLit
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
  // Always pulled now: the bottom strip's Terminal card shows the same tail the Logs tab does.
  const outputLines = useOrchOutput(outputPanelId, outputKind, true)
  const codeFile = orchBestFile(visibleFiles, selectedId)

  // M284. Scene | List — the same objects and the same actions, the list being the
  // keyboard (and reduced-motion, and no-WebGL) way to reach every one of them.
  const [lens, setLens] = useState<OrchLens>(() => getOrchPrefs().lens)
  useEffect(() => { setOrchPrefs({ lens }) }, [lens])
  // M287. Every pref, to the workspace record — coalesced, because the camera
  // moves at pointer speed and each write is a layout save. Skipped when the
  // record already says the same, so mounting the page writes nothing.
  const onOrchestrateRef = useRef(onOrchestrate)
  onOrchestrateRef.current = onOrchestrate
  const persistedRef = useRef(orchestrate)
  persistedRef.current = orchestrate
  const flushOrchestrate = useCallback((): void => {
    const next = persistedOrchPrefs(getOrchPrefs())
    if (!sameOrchestrate(persistedRef.current, next)) onOrchestrateRef.current?.(next)
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(flushOrchestrate, 250)
    return () => window.clearTimeout(timer)
  }, [tab, mode, lens, graphCamera, benchTab, benchHeight, benchOpen, islandOrder, flushOrchestrate])
  // M288. Leaving the page inside the 250 ms window dropped the pending write —
  // measured as an Undo move that came back undone on the next visit, because
  // the mount re-seeds from the record. The unmount flushes what the timer owed.
  useEffect(() => () => { flushOrchestrate() }, [flushOrchestrate])

  const listRows = useMemo(
    () => [...visibleRoster].sort((a, b) => Number(island?.memberIds.includes(b.id) ?? false) - Number(island?.memberIds.includes(a.id) ?? false)),
    [visibleRoster, island]
  )
  listOrderRef.current = listRows.map((r) => r.id)

  // M284. Needs attention: the chat store's own pending permissions. A request answered
  // anywhere (Dock, chat, palette, here) leaves the store, so its row leaves with it.
  const pending = useApprovals()
  const [sent, setSent] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => {
    setSent((cur) => { const next = orchPruneSent(cur, pending); return next.size === cur.size ? cur : next })
  }, [pending])
  const titleOf = useCallback((id: string): string => liveSnap.roster.find((r) => r.id === id)?.title ?? id, [liveSnap.roster])
  const attentionRows = useMemo(
    () => orchAttentionRows(pending.map((p) => ({ ...p, argument: outward(p.argument, `panel ${p.id}`).text })), titleOf, sent),
    [pending, titleOf, sent]
  )
  // A session waiting on the user with NO permission pending asked a question: it is
  // answered in its own conversation, so the row says so and opens it.
  const waitingOnly = liveSnap.roster.filter((r) => r.state === 'wants-you' && !pending.some((p) => p.id === r.id))
  const answer = (row: OrchAttentionRow, allow: boolean): void => {
    const key = orchAnswerKey(row.id, row.requestId)
    // Re-read the LIVE queue, not the row: a request answered elsewhere between render
    // and click is gone, and main's own guard would refuse it — say nothing, send nothing.
    if (onAnswer === undefined || sent.has(key) || !pending.some((p) => p.id === row.id && p.requestId === row.requestId)) return
    setSent((cur) => new Set(cur).add(key))
    onAnswer(row.id, row.requestId, allow)
  }

  // M284. The inspector's subject: the selected session, else the island's task.
  const inspectTask = selectedRow === null && island !== null
  const pendingOfSelected = selectedRow === null ? undefined : pending.find((p) => p.id === selectedRow.id)
  const nextAction = selectedRow !== null
    ? orchNextAction({ state: selectedRow.state, kind: selectedRow.kind, ...(pendingOfSelected !== undefined ? { pendingTool: pendingOfSelected.toolName } : {}) })
    : null
  const islandWaiting = island === null ? undefined : attentionRows.find((r) => island.memberIds.includes(r.id))
  const reviewSubjectId = selectedRow !== null
    ? (selectedRow.kind === 'chat' || selectedRow.kind === 'terminal' ? selectedRow.id : null)
    : island?.subjectId ?? null
  // M287. What the workbench is bound to: the selected session, else the island's
  // task (with its lane, so Changes reads the lane's fork diff — the canvas's own
  // read) or, for a session with no task, that session.
  const benchCurrent: BenchSubject | null = useMemo(() => {
    if (selectedRow !== null) {
      return selectedRow.kind === 'chat' || selectedRow.kind === 'terminal' ? { kind: 'session', id: selectedRow.id, title: selectedRow.title } : null
    }
    if (island === null) return null
    if (island.itemId !== undefined) {
      const item = workItems.find((w) => w.id === island.itemId)
      const lane = item?.worktreeId === undefined ? undefined : worktrees.find((w) => w.id === item.worktreeId)
      return {
        kind: 'task', itemId: island.itemId, title: island.goal, memberIds: island.memberIds,
        ...(lane === undefined ? {} : { lane: { id: lane.id, path: lane.path, root: lane.root, branch: lane.branch } }),
        ...(item?.panelId === undefined ? {} : { chatId: item.panelId })
      }
    }
    return island.subjectId === null ? null : { kind: 'session', id: island.subjectId, title: island.goal }
  }, [selectedRow, island, workItems, worktrees])
  const benchSubject = benchPinned ?? benchCurrent

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
      // M284. From a List row, step in the LIST's order (island members first) and from
      // the row that has the keyboard — the roster's order and the last selection are
      // the scene's, and stepping by them left a keyboard user's focus behind.
      const listRow = target?.closest('[data-orch-list-row]')?.getAttribute('data-orch-list-row') ?? null
      const rows = listRow !== null ? listOrderRef.current.map((id) => ({ id })) : visibleRosterRef.current
      const current = selectedIdsRef.current
      const primary = listRow ?? current[current.length - 1] ?? null
      if (isEscape) {
        event.preventDefault()
        setSelectedIds([])
        setFreshNeeds(new Set())
        return
      }
      if (isEnter) {
        if (primary === null) return
        // M284. Enter INSPECTS — it hands the keyboard to the inspector's actions and
        // stays on this page. Leaving for the canvas is the labelled Open on canvas
        // button (the plan's direct controls), never a side effect of a key.
        // A focused button's own Enter is its click, and is left alone.
        if (target !== null && target.closest('button, a, input, textarea, select') !== null) return
        event.preventDefault()
        document.querySelector<HTMLElement>('[data-orch-inspector] [data-orch-open]')?.focus()
        return
      }
      event.preventDefault()
      const next = orchRosterStep(rows, primary, event.key === 'ArrowDown' ? 1 : -1)
      if (next === null) return
      select(next, { range: event.shiftKey })
      // M284. In the List the keyboard's focus follows the selection, so Tab and Enter
      // act on the row the user just arrowed to (a no-op in the scene, which has no rows).
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-orch-list-row="${CSS.escape(next)}"] button`)?.focus({ preventScroll: false })
      })
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

  // M290. Interrupt only where the runtime has an interrupt door — read off
  // the backend registry, never assumed for every chat (codex and copilot have none).
  const backendOf = (id: string): AgentBackend | undefined => {
    const panel = panels.find((p) => p.rect.id === id)
    return panel !== undefined && isChatPanel(panel) ? panel.chat.backend ?? 'claude' : undefined
  }
  const canInterruptId = (id: string): boolean => {
    const row = liveSnap.roster.find((r) => r.id === id)
    const backend = backendOf(id)
    return row !== undefined && backend !== undefined && BACKENDS[backend].interrupts
      && (row.state === 'busy' || row.state === 'starting' || row.state === 'wants-you')
  }
  const lastUserPrompt = (id: string): string | undefined => {
    const turns = getChat(id).turns
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const t = turns[i]!
      if (t.role !== 'user') continue
      const text = t.blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim()
      if (text !== '') return text
    }
    return undefined
  }
  const selectedChat = useChat(selectedRow !== null && selectedRow.kind === 'chat' ? selectedRow.id : '')
  // A chat's roster word comes from the agent-state store, which reads a process
  // that ended between turns as `idle`; the SESSION's own status says `exited`.
  // For the controls and the standing the session's word is the fact.
  const selectedState = selectedRow === null ? '' : selectedRow.kind === 'chat' && selectedChat.snapshot?.status === 'exited' ? 'exited' : selectedRow.state
  const selectedControls = selectedRow === null ? null : orchControls({
    kind: selectedRow.kind, title: selectedRow.title, state: selectedState,
    ...(backendOf(selectedRow.id) === undefined ? {} : { backend: backendOf(selectedRow.id)! }),
    ...(selectedChat.lastTurn === undefined ? {} : { lastTurn: selectedChat.lastTurn }),
    ...(selectedRow.kind === 'chat' && lastUserPrompt(selectedRow.id) !== undefined ? { lastPrompt: lastUserPrompt(selectedRow.id)! } : {})
  })
  const selectedStanding = selectedRow === null ? null : orchSessionStanding({ state: selectedState, ...(selectedChat.lastTurn === undefined ? {} : { lastTurn: selectedChat.lastTurn }) })
  const selectedSpend = selectedRow === null ? null : orchSpendWord({ ...(backendOf(selectedRow.id) === undefined ? {} : { backend: backendOf(selectedRow.id)! }), ...(selectedChat.snapshot?.costUsd ?? selectedChat.meta?.costUsd) === undefined ? {} : { costUsd: (selectedChat.snapshot?.costUsd ?? selectedChat.meta?.costUsd)! } })
  const retryPreview = retryFor !== null && selectedRow !== null && retryFor === selectedRow.id && backendOf(retryFor) !== undefined && lastUserPrompt(retryFor) !== undefined
    ? orchRetryPreview({ title: selectedRow.title, backend: backendOf(retryFor)!, ...(selectedLive?.cwd === undefined || selectedLive.cwd === '' ? {} : { cwd: selectedLive.cwd }), lastPrompt: lastUserPrompt(retryFor)!, ...(selectedChat.lastTurn === undefined ? {} : { lastTurn: selectedChat.lastTurn }) })
    : null
  // M289. The typed relations, from the graph's authored edges and the canvas's
  // recorded outcomes; the focus is the selection's closure.
  const depEdges: OrchDependencyEdge[] = useMemo(() => orchDependencyEdges({
    edges: liveSnap.graph.edges,
    results: automationResults ?? new Map(),
    stateOf: (id) => liveSnap.roster.find((r) => r.id === id)?.state,
    titleOf: (id) => liveSnap.roster.find((r) => r.id === id)?.title ?? id
  }), [liveSnap.graph.edges, liveSnap.roster, automationResults])
  const depFocusData = selectedId !== null && selectedId !== '__hub__' ? orchDependencyFocus(selectedId, depEdges) : null
  depLitRef.current = depFocus && depFocusData !== null ? depFocusData.lit : null
  const depTouches = depFocusData !== null && (depFocusData.prerequisites.length > 0 || depFocusData.dependents.length > 0)
  const blockedLine = depFocusData === null ? null : orchBlockedLine(depFocusData)
  const limits = orchLimits({
    maxConcurrent: limitRows?.maxConcurrent ?? 0, budgetUsd: limitRows?.budgetUsd ?? 0, budgetWindowPercent: limitRows?.budgetWindowPercent ?? 0,
    inFlight: panels.filter((p) => isChatPanel(p) && (getChat(p.rect.id).snapshot?.status === 'streaming' || getChat(p.rect.id).snapshot?.status === 'starting')).length,
    sessions: panels.filter(isChatPanel).map((p) => { const c = getChat(p.rect.id); const cost = c.snapshot?.costUsd ?? c.meta?.costUsd; return { backend: p.chat.backend ?? 'claude', ...(cost === undefined ? {} : { costUsd: cost }) } }),
    rateLimit
  })
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

  // M284/M288. Island cards — ONE floating card when there is one island (Phase A's
  // card, unchanged), a grouped column when there are more; in the List they lead the
  // table. A click FOCUSES the island (inspector and workbench follow) and stays on
  // this page; Open on canvas is the inspector's labelled action. The move arrows are
  // PRESENTATION ONLY: they reorder this column, write the order to the workspace
  // record, and dispatch nothing; Undo move puts the previous order back.
  const islandFocused = (isl: TaskIsland): boolean => selectedRow === null && island !== null && island.id === isl.id
  const islandCard = (isl: TaskIsland, floating: boolean): JSX.Element => {
    const waiting = attentionRows.find((r) => isl.memberIds.includes(r.id))
    const ambiguous = isl.placement.kind === 'shared' && (isl.writers > 1 || isl.sharedWith.length > 0)
    return (
      <button
        key={isl.id}
        type="button"
        className={`${floating ? 'orch__float orch__float--task ' : 'orch__island--static '}orch__island${islandFocused(isl) ? ' orch__island--on' : ''}`}
        style={floating ? floatStyle : undefined}
        data-orch-island={isl.itemId ?? isl.subjectId ?? ''}
        data-orch-island-id={isl.id}
        data-orch-island-source={isl.source}
        data-orch-island-ambiguous={ambiguous || undefined}
        aria-pressed={islandFocused(isl)}
        title="Select the task — Open on canvas is in the inspector"
        {...shellControl(() => { setFocusIslandId(isl.id === primaryIsland?.id ? null : isl.id); setSelectedIds([]); setFreshNeeds(new Set()) })}
      >
        {/* Kind and state share ONE line, and the stage is that WORD, not the bars the
            old task card drew under it: the card must be no taller than the one it
            replaced, or it covers the ring's back cubes and their needs-you beacons
            (the golden critic found `tests`'s beacon hidden, twice). */}
        <span className="orch__float-state">{isl.source === 'work-item' ? 'Task' : 'Session · no task yet'} · {isl.state} · {isl.memberIds.length} {isl.memberIds.length === 1 ? 'session' : 'sessions'}{waiting !== undefined ? ' · needs you' : ''}</span>
        <span className="orch__float-title" data-orch-island-goal>{isl.goal}</span>
        <span className="orch__island-place" data-orch-island-place>{orchPlacementLine(isl)}</span>
      </button>
    )
  }
  const islandColumn = (floating: boolean): JSX.Element | null => {
    if (islands.length === 0) return null
    if (islands.length === 1 && orderHistory.length === 0) return islandCard(islands[0]!, floating)
    return (
      <div className={floating ? 'orch__float orch__float--task orch__islands' : 'orch__islands orch__islands--static'} style={floating ? floatStyle : undefined} data-orch-islands data-orch-island-order={orderedIds.join(' ')} role="group" aria-label="Task islands">
        <div className="orch__section-head orch__islands-head">
          <span className="orch__section-title">{islands.length} islands</span>
          {orderHistory.length > 0 && <button type="button" className="orch__mini" data-orch-island-undo {...shellControl(undoMove)}>Undo move</button>}
        </div>
        {islandGroups.map((g) => (
          <div key={g.key ?? '\0none'} className="orch__island-group" data-orch-island-group={g.key ?? ''}>
            <span className="orch__caption orch__island-group-label" title={g.key ?? undefined}>{g.label} · <span data-orch-grouping>{ORCH_DEP_GROUPING}</span></span>
            {g.islands.map((isl) => (
              <div key={isl.id} className="orch__island-row">
                {islandCard(isl, false)}
                <span className="orch__island-tools" aria-label={`Move ${isl.goal}`}>
                  <button type="button" className="orch__mini" data-orch-island-move="up" data-orch-island-of={isl.id} disabled={orderedIds.indexOf(isl.id) === 0} title="Move up — presentation only, nothing is dispatched" {...shellControl(() => moveIsland(isl.id, -1))}>▲</button>
                  <button type="button" className="orch__mini" data-orch-island-move="down" data-orch-island-of={isl.id} disabled={orderedIds.indexOf(isl.id) === orderedIds.length - 1} title="Move down — presentation only, nothing is dispatched" {...shellControl(() => moveIsland(isl.id, 1))}>▼</button>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="orch" role="region" aria-label="Orchestration">
      <header className="orch__header">
        <div className="orch__brand">
          {/* No mark and no product name here: the top bar, 40px above, already
              says both. The page opens on the one line that is about NOW. */}
          <div className="orch__brand-copy">
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
          <div className="orch__mode-row">
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
            <span className="orch__lens" role="group" aria-label="Scene or list">
              {(['scene', 'list'] as const).map((l) => (
                <button key={l} type="button" className={`orch__tab${lens === l ? ' orch__tab--on' : ''}`} aria-pressed={lens === l}
                  data-orch-lens={l} {...shellControl(() => setLens(l))}>{l === 'scene' ? 'Scene' : 'List'}</button>
              ))}
            </span>
          </div>

          <div className="orch__graph-wrap">
            {lens === 'list' ? (
              // M284. The List is the scene's equal, not a summary of it: every roster
              // object, the island's members first and marked, each one a real button in
              // the tab order (Arrow keys move the selection, Enter opens on canvas — the
              // page's own keyboard model), and the inspector beside it carries every
              // action the scene's selection does.
              <div className="orch__list" data-orch-list role="region" aria-label="Sessions list">
                {islandColumn(false)}
                <table className="orch__list-table">
                  <thead>
                    <tr><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">State</th><th scope="col">Next</th></tr>
                  </thead>
                  <tbody>
                    {listRows.map((row) => {
                      const next = orchNextAction({ state: row.state, kind: row.kind, ...(pending.some((p) => p.id === row.id) ? { pendingTool: pending.find((p) => p.id === row.id)!.toolName } : {}) })
                      const inIsland = island?.memberIds.includes(row.id) === true
                      return (
                        <tr key={row.id} data-orch-list-row={row.id} data-selected={selectedIds.includes(row.id) || undefined}>
                          <td>
                            <button type="button" className="orch__list-name" aria-pressed={selectedIds.includes(row.id)}
                              {...shellControl(() => select(row.id))} onDoubleClick={() => jump(row.id)}>
                              <span className="orch__dot status-dot" data-tone={row.tone} aria-hidden="true" />
                              {row.title}{inIsland && <span className="orch__list-tag">in task</span>}
                            </button>
                          </td>
                          <td>{row.kind}</td>
                          <td>{stateWord(row)}</td>
                          <td className="orch__list-next" data-verb={next.verb}>{next.label}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {visibleRoster.length === 0 && <EmptyState id="orch-roster" onVerb={onShowCanvas} />}
              </div>
            ) : mode === 'dev' ? (
              <GraphBoard
                nodes={members === null ? framed.graph.nodes : [...framed.graph.nodes, ...liveSnap.graph.nodes.filter((n) => !members.includes(n.id) && n.id !== ORCH_OVERFLOW_ID)]}
                edges={framed.graph.edges}
                panels={panels}
                workItems={workItems}
                memberIds={members}
                litIds={litIds}
                wash={wash}
                onOverflow={openOffRing}
                canInterrupt={canInterruptId}
                depFocus={depFocus}
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
                {...shellControl(() => { select(liveSnap.terminalSnippet!.panelId); openBench('output') })}
                onDoubleClick={() => jump(liveSnap.terminalSnippet!.panelId)}
              >
                <span className="orch__float-title">{liveSnap.terminalSnippet.title}</span>
                <code className="orch__float-code">{liveSnap.terminalSnippet.command}</code>
              </button>
            )}

            {/* M284. The task island's label: goal, repository and where its files live
                (own worktree + branch, or a shared directory, said). A click SELECTS the
                task — the inspector follows — and stays on this page; Open on canvas is
                the inspector's separate, labelled action (the plan's direct controls). */}
            {lens === 'scene' && islandColumn(true)}
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
              {/* M290. Run limits: each says whether main ENFORCES it or it is advisory, and
                  what it covers. Unknown spend reads Unknown; no cap is implied across
                  providers that report none. */}
              <div className="orch__limits" data-orch-limits aria-label="Run limits">
                <div className="orch__section-title">Run limits</div>
                <ul className="orch__limit-list">
                  {limits.map((l) => (
                    <li key={l.id} className="orch__limit" data-orch-limit={l.id} data-orch-limit-kind={l.kind} title={l.coverage}>
                      <span className="orch__limit-label">{l.label}</span>
                      <span className="orch__limit-kind" data-kind={l.kind}>{l.kind}</span>
                      <span className="orch__limit-value">{l.value}</span>
                      <span className="orch__caption orch__limit-coverage">{l.coverage}</span>
                    </li>
                  ))}
                </ul>
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

            {/* Jump cards (M282): previews that JUMP, never an embedded xterm or Monaco — a second
                xterm here would refit and SIGWINCH the running agent, and file:read re-arms a watch. */}
            <div className="orch__jump orch__selected" aria-label="Terminal">
              <div className="orch__section-title">Terminal</div>
              {outputPanelId === null ? (
                <EmptyState id="orch-selected" />
              ) : (
                <button
                  type="button"
                  className="orch__jump-card"
                  title="Double-click to jump to the panel"
                  {...shellControl(() => { select(outputPanelId); openBench('output') })}
                  onDoubleClick={() => jump(outputPanelId)}
                >
                  <span className="orch__jump-head">
                    <span className="orch__selected-title">{selectedRow?.title ?? liveSnap.terminalSnippet?.title}</span>
                    {selectedRow !== null && <span className="orch__roster-state" data-tone={selectedRow.tone}>{stateWord(selectedRow)}</span>}
                  </span>
                  {selectedRow?.kind === 'chat' && <SelectedChatPhase panelId={selectedRow.id} />}
                  {outputCommand !== undefined && outputCommand !== '' && <code className="orch__float-code">{outputCommand}</code>}
                  <pre className="orch__jump-log" aria-label="Scrollback tail">
                    {outputLines.length === 0 ? 'No recorded output yet.' : outputLines.slice(-6).join('\n')}
                  </pre>
                  <span className="orch__caption">
                    {selectedCost !== undefined ? `${formatCpu(selectedCost.cpuPercent)} · ${formatMemory(selectedCost.memoryBytes)}` : ''}
                    {outputCwd !== undefined ? `${selectedCost !== undefined ? ' · ' : ''}${displayPath(outputCwd).short}` : ''}
                  </span>
                </button>
              )}
            </div>

            <div className="orch__jump" aria-label="Code">
              <div className="orch__section-title">Code</div>
              {codeFile === null ? (
                <EmptyState id="orch-files" onVerb={onShowCanvas} />
              ) : (
                <button
                  type="button"
                  className="orch__jump-card"
                  title={displayPath(codeFile.path).full}
                  {...shellControl(() => { select(codeFile.id); jump(codeFile.id) })}
                >
                  <span className="orch__jump-head">
                    <span className="orch__roster-kind" aria-hidden="true"><KindFile /></span>
                    <span className="orch__selected-title">{codeFile.title}</span>
                  </span>
                  <code className="orch__float-code">{displayPath(codeFile.path).short}</code>
                  <span className="orch__task-jump">Open in its panel</span>
                </button>
              )}
            </div>

            <div className="orch__jump" aria-label="Files">
              <div className="orch__section-title">Files</div>
              {visibleFiles.length === 0 ? (
                <EmptyState id="orch-files" onVerb={onShowCanvas} />
              ) : (
                <>
                  <ul className="orch__jump-list">
                    {visibleFiles.slice(0, 5).map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          className={`orch__jump-row${selectedId === f.id ? ' orch__jump-row--on' : ''}`}
                          title={displayPath(f.path).full}
                          {...shellControl(() => select(f.id))}
                          onDoubleClick={() => jump(f.id)}
                        >
                          <KindFile /><span>{f.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {onOpenFiles !== undefined && (
                    <button type="button" className="orch__mini" {...shellControl(() => onOpenFiles())}>Open files</button>
                  )}
                </>
              )}
            </div>
          </div>
        </main>

        <MotionSurface open enter><aside className="orch__side" aria-label="Decisions and inspector">
          {/* M284. Needs attention — a pending permission is answered HERE through the
              existing identity, and leaves the moment it is answered anywhere. */}
          <section className="orch__needs" aria-label="Needs attention" data-orch-needs>
            <div className="orch__section-head">
              <div className="orch__section-title">Needs attention</div>
              <span className="orch__caption">{attentionRows.length + waitingOnly.length === 0 ? 'Nothing needs you' : `${attentionRows.length + waitingOnly.length} waiting`}</span>
            </div>
            {(attentionRows.length > 0 || waitingOnly.length > 0) && (
              <ul className="orch__needs-list">
                {attentionRows.map((row) => (
                  <li key={orchAnswerKey(row.id, row.requestId)} className="orch__needs-row" data-orch-needs-row={row.id} data-orch-request={row.requestId} data-sent={row.sent || undefined}>
                    <button type="button" className="orch__needs-main" {...shellControl(() => select(row.id))}>
                      <span className="orch__needs-title">{row.title}</span>
                      <span className="orch__needs-ask">wants to use <strong>{row.toolName}</strong>{row.argument !== '' ? ` · ${row.argument}` : ''}</span>
                    </button>
                    {row.sent ? (
                      <span className="orch__caption" role="status">Answer sent — waiting for the agent</span>
                    ) : (
                      <span className="orch__needs-actions">
                        <button type="button" className="orch__mini" data-orch-allow disabled={onAnswer === undefined} {...shellControl(() => answer(row, true))}>Allow</button>
                        <button type="button" className="orch__mini orch__mini--stop" data-orch-deny disabled={onAnswer === undefined} {...shellControl(() => answer(row, false))}>Deny</button>
                      </span>
                    )}
                  </li>
                ))}
                {waitingOnly.map((row) => (
                  <li key={row.id} className="orch__needs-row" data-orch-needs-row={row.id}>
                    <button type="button" className="orch__needs-main" {...shellControl(() => select(row.id))}>
                      <span className="orch__needs-title">{row.title}</span>
                      <span className="orch__needs-ask">is waiting on you — reply in its conversation</span>
                    </button>
                    <span className="orch__needs-actions">
                      <button type="button" className="orch__mini" {...shellControl(() => jump(row.id))}>Open on canvas</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* M284. The inspector: identity, state, next action — for the selected session,
              or for the task island when nothing is selected. */}
          <section className="orch__inspector" aria-label="Inspector" data-orch-inspector={selectedRow?.id ?? (inspectTask ? 'task' : '')}>
            {selectedRow !== null ? (
              <>
                <div className="orch__inspector-id">
                  <span className="orch__roster-kind" aria-hidden="true">{kindGlyph(selectedRow.kind)}</span>
                  <span className="orch__selected-title" data-orch-inspector-title>{selectedRow.title}</span>
                  <span className="orch__roster-state" data-tone={selectedRow.tone} data-orch-inspector-state>{stateWord(selectedRow)}</span>
                </div>
                <p className="orch__caption">{selectedRow.kind} · {selectedRow.id}{island?.memberIds.includes(selectedRow.id) === true ? ` · in ${island.goal}` : ''}{outputCwd !== undefined ? ` · ${displayPath(outputCwd).short}` : ''}</p>
                {nextAction !== null && <p className="orch__inspector-next" data-orch-next={nextAction.verb}>Next: {nextAction.label}</p>}
                {/* M290. Standing and spend, kept apart: a stopped session, an interrupted
                    run and an unknown spend are three different facts. */}
                {selectedRow.kind === 'chat' && selectedStanding !== null && <p className="orch__caption" data-orch-standing={selectedStanding.kind}>{selectedStanding.word}</p>}
                {selectedRow.kind === 'chat' && selectedSpend !== null && <p className="orch__caption" data-orch-spend={selectedSpend.known ? 'known' : 'unknown'}>Spend: {selectedSpend.word}</p>}
                {blockedLine !== null && <p className="orch__inspector-next orch__dep-blocked" data-orch-dep-blocked>{blockedLine}</p>}
                <div className="orch__roster-actions" data-orch-controls={selectedRow.id}>
                  <button type="button" className="orch__mini" data-orch-open {...shellControl(() => jump(selectedRow.id))}>Open on canvas</button>
                  {reviewSubjectId !== null && <button type="button" className="orch__mini" data-orch-review-open {...shellControl(() => openBench('changes'))}>Review changes</button>}
                  {/* M290. Controls only where the runtime supports them; each button's title
                      says exactly what it affects. Absent ones are named in the caption below. */}
                  {selectedControls?.controls.map((c) => c.id === 'interrupt'
                    ? (onInterrupt !== undefined && <button key={c.id} type="button" className="orch__mini orch__mini--stop" data-orch-control="interrupt" title={c.affects} {...shellControl(() => onInterrupt(selectedRow.id))}><Stop size={12} /> {c.label}</button>)
                    : <button key={c.id} type="button" className="orch__mini" data-orch-control="retry" title={c.affects} aria-expanded={retryFor === selectedRow.id} {...shellControl(() => setRetryFor((cur) => (cur === selectedRow.id ? null : selectedRow.id)))}>{c.label}</button>)}
                </div>
                {selectedControls !== null && selectedControls.controls.length > 0 && (
                  <ul className="orch__control-notes" data-orch-control-notes>
                    {selectedControls.controls.map((c) => <li key={c.id} className="orch__caption"><strong>{c.label.replace('…', '')}</strong> {c.affects}</li>)}
                  </ul>
                )}
                {selectedControls !== null && (selectedRow.kind === 'chat' || selectedRow.kind === 'terminal') && (
                  <p className="orch__caption" data-orch-control-absent={selectedControls.absent.map((a) => a.id).join(' ')}>
                    Not available here: {selectedControls.absent.map((a) => `${a.id} — ${a.reason}`).join('; ')}.
                  </p>
                )}
                {retryPreview !== null && (
                  <div className="orch__retry" data-orch-retry-preview={selectedRow.id} role="group" aria-label="Retry preview">
                    <div className="orch__section-title">Retry — a preview, nothing sent</div>
                    <p className="orch__caption">To <strong data-orch-retry-target>{retryPreview.target}</strong> on {retryPreview.backend}{retryPreview.cwd !== undefined ? ` in ${displayPath(retryPreview.cwd).short}` : ''}.</p>
                    <pre className="orch__term-log orch__retry-prompt" aria-label="Prompt to resend">{outward(retryPreview.prompt, `panel ${selectedRow.id}`).text}</pre>
                    <p className="orch__caption">{retryPreview.note}</p>
                    <span className="orch__roster-actions">
                      {onRetryOnCanvas !== undefined && <button type="button" className="orch__mini" data-orch-retry-go {...shellControl(() => { const text = lastUserPrompt(selectedRow.id); setRetryFor(null); if (text !== undefined) onRetryOnCanvas(selectedRow.id, text) })}>Open on canvas with this prompt</button>}
                      <button type="button" className="orch__mini" data-orch-retry-cancel {...shellControl(() => setRetryFor(null))}>Cancel</button>
                    </span>
                  </div>
                )}
                {/* M289. Dependencies — the typed relations this object is on, read-only. */}
                {depFocusData !== null && (depTouches || depFocus) && (
                  <section className="orch__deps" data-orch-deps={selectedRow.id} aria-label="Dependencies">
                    <div className="orch__section-head">
                      <div className="orch__section-title">Dependencies</div>
                      <button type="button" className="orch__mini" data-orch-dep-focus aria-pressed={depFocus} {...shellControl(() => setDepFocus((v) => !v))}>{depFocus ? 'Show all' : 'Focus dependencies'}</button>
                    </div>
                    {!depTouches && <p className="orch__caption">No typed relation touches this object — the spokes in the scene are grouping, not dependencies.</p>}
                    {depFocusData.prerequisites.length > 0 && (
                      <>
                        <span className="orch__caption">Prerequisites — what must happen first</span>
                        <ul className="orch__dep-list" data-orch-dep-prereqs>
                          {depFocusData.prerequisites.map((e) => (
                            <li key={`${e.from}:${e.to}`} className="orch__dep-row" data-orch-dep-edge={`${e.from}:${e.to}`} data-orch-dep-status={e.status}>
                              <button type="button" className="orch__activity-row" {...shellControl(() => select(e.from))}>
                                <span className="orch__activity-title">{e.fromTitle} → {e.trigger}</span>
                                <span className="orch__activity-detail">{e.status}{e.sentence !== undefined ? ` · ${e.sentence}` : ''} · {e.condition}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {depFocusData.dependents.length > 0 && (
                      <>
                        <span className="orch__caption">Dependents — what waits on this</span>
                        <ul className="orch__dep-list" data-orch-dep-dependents>
                          {depFocusData.dependents.map((e) => (
                            <li key={`${e.from}:${e.to}`} className="orch__dep-row" data-orch-dep-edge={`${e.from}:${e.to}`} data-orch-dep-status={e.status}>
                              <button type="button" className="orch__activity-row" {...shellControl(() => select(e.to))}>
                                <span className="orch__activity-title">{e.trigger} → {e.toTitle}</span>
                                <span className="orch__activity-detail">{e.status}{e.sentence !== undefined ? ` · ${e.sentence}` : ''} · {e.condition}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    <p className="orch__caption" data-orch-dep-readonly>{ORCH_DEP_READ_ONLY}</p>
                  </section>
                )}
              </>
            ) : island !== null ? (
              <>
                <div className="orch__inspector-id">
                  <span className="orch__roster-kind" aria-hidden="true"><KindWork size={16} /></span>
                  <span className="orch__selected-title" data-orch-inspector-title>{island.goal}</span>
                  <span className="orch__roster-state" data-orch-inspector-state>{island.state}</span>
                </div>
                <p className="orch__caption">{orchPlacementLine(island)}{island.placement.kind !== 'unknown' ? ` · ${displayPath(island.placement.path).short}` : ''}</p>
                {/* M288. Shared-directory ambiguity, shown: when more than one session can
                    write here, no change is attributed to this task alone. */}
                {island.placement.kind === 'shared' && (island.writers > 1 || island.sharedWith.length > 0) && (
                  <p className="orch__caption orch__island-ambiguity" data-orch-island-ambiguity={island.writers}>
                    Shared directory — {island.writers} sessions write in {displayPath(island.placement.path).short}{island.sharedWith.length > 0 ? `, across ${island.sharedWith.length + 1} islands` : ''}; a change here cannot be attributed to this task alone, and the workbench says so per read.
                  </p>
                )}
                <p className="orch__inspector-next" data-orch-next={islandWaiting !== undefined ? 'answer' : island.state === WORK_ITEM_STATES[2] ? 'review' : 'watch'}>
                  Next: {islandWaiting !== undefined ? `Answer ${islandWaiting.title}'s ${islandWaiting.toolName} request` : island.state === WORK_ITEM_STATES[2] ? 'Review its changes' : 'Watch its sessions work'}
                </p>
                <div className="orch__roster-actions">
                  <button type="button" className="orch__mini" data-orch-open {...shellControl(() => {
                    if (island.itemId !== undefined) onJumpWorkItem(island.itemId)
                    else if (island.subjectId !== null) jump(island.subjectId)
                  })}>Open on canvas</button>
                  {reviewSubjectId !== null && <button type="button" className="orch__mini" data-orch-review-open {...shellControl(() => openBench('changes'))}>Review changes</button>}
                </div>
                {/* M287. The brief and the acceptance criteria — the task's own words,
                    persisted on the work item through the board's one patch door.
                    Editing them LAUNCHES NOTHING: no dispatch, no send, no spawn is
                    reachable from these handlers (verify:orchestration workbench.2). */}
                {island.itemId !== undefined && onPatchWorkItem !== undefined && (
                  <OrchBriefEditor
                    key={island.itemId}
                    itemId={island.itemId}
                    brief={workItems.find((w) => w.id === island.itemId)?.brief ?? ''}
                    criteria={workItems.find((w) => w.id === island.itemId)?.criteria ?? []}
                    onPatchWorkItem={onPatchWorkItem}
                  />
                )}
              </>
            ) : (
              <p className="orch__caption">Select a session in the scene or the list to inspect it.</p>
            )}
          </section>

          <div className="orch__tabs" role="tablist">
                {(['activity', 'files'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={`orch__tab${tab === t ? ' orch__tab--on' : ''}`}
                  {...shellControl(() => setTab(t))}
                >{t === 'activity' ? 'Activity' : 'Files'}</button>
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
      {/* M287. The workbench: Changes · Checks · Output, under the scene. */}
      <OrchWorkbench
        subject={benchSubject}
        current={benchCurrent}
        pinned={benchPinned}
        onPin={setBenchPinned}
        tab={benchTab}
        onTab={setBenchTab}
        height={benchHeight}
        onHeight={setBenchHeight}
        open={benchOpen}
        onOpen={setBenchOpen}
        panels={panels}
        workItems={workItems}
        worktrees={worktrees}
        taskHandoffOf={taskHandoffOf}
        onRefreshTaskHandoffs={onRefreshTaskHandoffs}
        onPatchWorkItem={onPatchWorkItem}
        onReviewOnCanvas={onReviewOnCanvas}
        onJump={jump}
        onShowCanvas={onShowCanvas}
        output={{ panelId: outputPanelId, title: selectedRow?.title ?? liveSnap.terminalSnippet?.title, command: outputCommand, lines: outputLines }}
        refresh={benchRefresh}
      />
    </div>
  )
}

/**
 * M287. Two fields, saved on blur or Enter-less commit — never on every
 * keystroke, so a half-typed brief is not written twenty times, and never
 * sent anywhere: the only call out of here is `onPatchWorkItem`.
 */
function OrchBriefEditor({ itemId, brief, criteria, onPatchWorkItem }: {
  itemId: string
  brief: string
  criteria: readonly string[]
  onPatchWorkItem: (itemId: string, fields: Partial<PersistedWorkItem>) => void
}): JSX.Element {
  const [briefDraft, setBriefDraft] = useState(brief)
  const [criteriaDraft, setCriteriaDraft] = useState(criteria.join('\n'))
  const commitBrief = (): void => { if (briefDraft.trim() !== brief) onPatchWorkItem(itemId, { brief: briefDraft.trim() }) }
  const commitCriteria = (): void => {
    const next = criteriaDraft.split('\n').map((c) => c.trim()).filter((c) => c !== '')
    if (next.join('\n') !== criteria.join('\n')) onPatchWorkItem(itemId, { criteria: next })
  }
  // A <details>, open only when something is written: two textareas at rest pushed the
  // inspector's Activity feed out of frame (the critic).
  return (
    <details className="orch__brief" data-orch-brief-editor={itemId} open={brief !== '' || criteria.length > 0}>
      <summary className="orch__brief-summary">Brief &amp; acceptance criteria{brief === '' && criteria.length === 0 ? ' · none yet' : ''}</summary>
      <label className="orch__brief-field">
        <span className="orch__section-title">Brief</span>
        <textarea className="orch__brief-input" data-orch-brief rows={2} value={briefDraft} placeholder="What should be done, in your words. Editing this starts nothing."
          onChange={(e) => setBriefDraft(e.target.value)} onBlur={commitBrief} />
      </label>
      <label className="orch__brief-field">
        <span className="orch__section-title">Acceptance criteria</span>
        <textarea className="orch__brief-input" data-orch-criteria rows={2} value={criteriaDraft} placeholder="One per line."
          onChange={(e) => setCriteriaDraft(e.target.value)} onBlur={commitCriteria} />
      </label>
    </details>
  )
}

export const OrchestrationView = memo(OrchestrationViewImpl)
