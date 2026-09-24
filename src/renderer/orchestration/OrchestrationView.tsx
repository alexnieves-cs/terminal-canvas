/**
 * M268 / M269. Orchestration center view — dense HUD over live agent / board /
 * workflow / PTY data. Presentational: Canvas owns verbs (jump, interrupt,
 * markDone, setCenterView). Selection here drives the other panes; a jump
 * returns to the canvas so pan/zoom/PTY stay the canvas's.
 */
import { MotionSurface } from '@renderer/primitives/MotionSurface'
import { Component, lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react'
import type { Panel } from '@renderer/panels/panels'
import {
  isChatPanel, isFilePanel, isTerminalPanel, isWatcherPanel, isWorkflowPanel, isWorkPanel
} from '@renderer/panels/panels'
import { getAgentState, onAgentTransition } from '@renderer/session/agent-state-store'
import { getMachineCostSampledAt, useMachineCostTotal } from '@renderer/session/machine-cost-store'
import { getLiveSession, useLiveSession } from '@renderer/session/live-session-store'
import { getWatch } from '@renderer/watcher/watcher-store'
import { useChat, getChat, lastAssistantText, useApprovals, useChatsVersion } from '@renderer/chat/chat-store'
import { outward } from '@shared/outward'
import { ApprovalAcks, ApprovalDetail } from '@renderer/shell/ApprovalDetail'
import { useApprovalOutcomes } from '@renderer/shell/approval-outcome'
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
  ORCH_STAGE_WASH_MS,
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
  orchPhase
} from './orchestration-model'
import {
  orchActivityEvents,
  subscribeOrchActivity
} from './orchestration-activity'
import { classifyActivity } from '@renderer/shell/task-queue'
import { ORCH_COS_TILT, ORCH_FIT_FLOOR, ORCH_SIN_TILT, ORCH_ZOOM_RANGE, orchDepthBand, orchFitCamera, orchProjectWorld, type OrchCamera, type OrchDepthBand } from './orchestration-depth'
import type { OrchCubeSpec, OrchPlatformSpec } from './OrchestrationCubes'
import { buildOrchLive, type OrchLiveSessionInput, type OrchLiveState } from './orchestration-live'
import {
  ORCH_PLATE_LABEL, ORCH_PLATE_MORE, ORCH_PLATFORM, ORCH_SELECT_LIFT, ORCH_WORKSPACE_PLATFORM, orchConnectors, orchHiddenLine, orchHitOrder, orchLabelBudget, orchLabelMargins, orchNameTier, orchObjectVisible, orchPlatformBounds, orchPlatformCountsLine, orchPlatformHitPolygon, orchPolygonBounds, orchNextSort, orchPlatforms, orchQualityStep, orchSceneObjects, orchSegmentBetween, orchSortRows, orchSpatialStep, orchZoomLevel,
  type OrchArrow, type OrchListSort, type OrchListSortKey, type OrchNameTier, type OrchObjectKind, type OrchPlatform, type OrchZoomLevel
} from './orchestration-platforms'
import { getOrchPrefs, persistedOrchPrefs, prefsFromView, seedOrchPrefs, setOrchPrefs, viewFromPrefs, withSavedView, type OrchLens, type OrchSideTab } from './orchestration-prefs'
import { OrchWorkbench, benchSubjectKey, type BenchSubject } from './OrchWorkbench'
import { completionOf, type Completion } from '@shared/completion'
import { agentWorkingOf, verificationOf } from '@shared/review-comments'
import type { CheckRecord } from '@shared/check-evidence'
import { sameOrchestrate, type OrchSavedView, type PersistedOrchestrate, type WorkbenchTab } from '@shared/orchestrate-prefs'
import type { ReviewHandoff } from '@shared/review-readiness'
import { onChatTurnEnd } from '@renderer/chat/chat-store'
import {
  orchAnswerKey, orchAttentionRows, orchIslandGroups, orchIslandOrder, orchMoveIsland, orchNextAction, orchPickIslandItem, orchPlacementLine, orchPruneSent, orchTaskIslands,
  type OrchAttentionRow, type TaskIsland
} from './orchestration-island'
import { ORCH_DEP_GROUPING, ORCH_DEP_READ_ONLY, orchBlockedLine, orchDependencyEdges, orchDependencyFocus, type OrchDependencyEdge } from './orchestration-dependency'
import { orchControls, orchLimits, orchRetryPreview, orchSessionStanding, orchSpendWord, orchStops } from './orchestration-controls'
import { backendHandoff, type HandoffTurn } from '@shared/backend-fit'
import { BACKEND_IDS } from '@shared/agent-backends'
import { useRateLimit } from '@renderer/session/rate-limit-store'
import { BACKENDS, type AgentBackend } from '@shared/agent-backends'
import type { WorktreeListRow } from '@shared/ipc-contract'
import type { OrchCubeTone } from './orchestration-cube-motion'
import { standingOf, type Standing } from '@shared/session-standing'

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
/** M292. Waiting-station cards drawn at once; past it the beacon, the plate word and the queue carry the fact. */
const ORCH_WAITING_CARDS = 3
/** M294. A platform's label plate: its backing width, height and the gap above the diamond's top tip. */
/** M294. A station-chain connector lights for this long after either end changes state — once, then rests. */
const ORCH_CONNECTOR_LIT_MS = 1400

const OrchestrationCubes = lazy(async () => ({ default: (await import('./OrchestrationCubes')).OrchestrationCubes }))
/**
 * M304. The Watch lens — the same deferred-chunk rule as the cubes above: a
 * perspective three.js scene, `import()`ed the first time Watch opens and never
 * reached statically (`orch-live.door.1`). Only its TYPES are imported above.
 */
const OrchestrationLive = lazy(async () => ({ default: (await import('./OrchestrationLive')).OrchestrationLive }))

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
  /**
   * M300. Open ONE file on the canvas, by path — the Artifacts tab's door.
   * Optional like every capability prop on this page: absent means the row is
   * disabled and says why, never a control that looks live and does nothing.
   */
  onOpenPath?: (path: string) => void
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
  onAnswer?: (id: string, requestId: string, allow: boolean, scope?: 'session') => void
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
   * prompt in its composer, UNSENT. Retry never sends; the one send on this
   * page is the follow-up composer's `onSend` (M299), owned by the canvas.
   */
  onRetryOnCanvas?: (panelId: string, prompt: string) => void
  /**
   * M319. Continue a chat's task on ANOTHER backend: a new chat on `backend`,
   * in the same folder and as the same teammate, with the reviewed hand-off
   * INSERTED in its composer (M80's rule — the person sends it). Absent hides
   * the door.
   */
  onContinueOnBackend?: (panelId: string, backend: AgentBackend, text: string) => void
  /** M319. Discovery's answer per backend CLI, for the hand-off's target list. */
  backendsAvailable?: Partial<Record<AgentBackend, boolean>>
  /** M299. The workspace's name, for the title row (`Orchestrate / <workspace>`). */
  workspaceName?: string
  /**
   * M299. The follow-up composer's ONE exit: the canvas hands in the chat
   * composer's own send door, resolved to the refusal sentence or null. The
   * view spells no send of its own (`orch-limits.4`); absent, no input is
   * rendered — a dead composer is a promise the page cannot keep.
   */
  onSend?: (panelId: string, text: string) => Promise<string | null>
  /**
   * M302. Save an island's shape as a reusable template. OPTIONAL like every
   * capability on this page: absent, no button is rendered — a control that
   * looks live and does nothing is the defect class M195 named.
   */
  onSaveArrangement?: (islandId: string) => Promise<string | null>
  /**
   * Navigation hierarchy. The canvas's selection at the moment this page
   * mounted — Canvas and Orchestrate are two views of the same work, so the
   * panel the person was looking at stays selected across the switch. Taken
   * only when it names a roster row; anything else starts unselected.
   */
  initialSelectedId?: string | null
  /** The page's one selected session (null for none or many), for the title bar's crumb and the return handoff. */
  onSelectionChange?: (panelId: string | null) => void
}

/** A board stage change, painted as a brief rim on the moved item's member cubes. */
interface OrchWash { at: number; stage: WorkItemState; ids: readonly string[] }

type SideTab = OrchSideTab

/**
 * M301. RECONCILIATION, asked of MAIN and not inferred here.
 *
 * `agentSession.list()` is the agent runtime's own answer to "which sessions
 * exist", the same shape of question the orphan sweep asks the terminal
 * backend at launch. It is asked once when the page mounts and again on every
 * refresh tick, which is when the page's other reads happen too.
 *
 * `null` while the first answer is outstanding, and that is not "none": a
 * `null` reconciliation leaves every panel's state exactly as it was before
 * M301, so the page never flashes a wall of `unknown` in the moment between
 * mounting and hearing back. A read that FAILS also leaves it null — a door
 * that could not answer is not a door that answered "nothing".
 */
export interface OrchSessionFact {
  /** The runtime holds a session record for this panel. */
  live: boolean
  /** A process is up right now. An idle resumable chat is live and not running. */
  running: boolean
  exit?: { code?: number | null; signal?: string }
}

/**
 * MEASURED, M301, and it changed the design: for this runtime a chat's
 * PROCESS EXITING IS NOT THE CONVERSATION ENDING. The agent process exits
 * between turns and `--resume` brings it back, so `status: 'exited'` is the
 * ordinary state of an idle chat. A first version read liveness off that
 * status and made every idle agent on the page say `no session`;
 * `orch-task.2` caught it.
 *
 * So liveness is: the runtime holds a session record for this panel and has
 * not DISPOSED it. Two facts, both measured — a relaunch leaves an empty
 * runtime, and a dispose leaves a record marked `disposed`, and the page must
 * reach the same verdict either way. (A second measurement: dispose does not
 * remove the row from `list()` within a process, so membership alone is not
 * enough. The status is the discriminator, as it was for the process.)
 *
 * The status is also read for WORDS: an ended process's exit code and signal
 * are what let the card say a session stopped on its own rather than being
 * stopped by something else, without ever calling it a crash.
 */
const RUNNING_STATUSES: readonly string[] = ['starting', 'ready', 'streaming']
/** The runtime tore this session down. Gone, exactly as a relaunch leaves it gone. */
const GONE_STATUSES: readonly string[] = ['disposed']

function useLiveSessions(refresh: number): ReadonlyMap<string, OrchSessionFact> | null {
  const [live, setLive] = useState<ReadonlyMap<string, OrchSessionFact> | null>(null)
  useEffect(() => {
    if (typeof window.canvas?.agentSession?.list !== 'function') return
    let alive = true
    // MEASURED, and it is why terminals are here at all: a restored CHAT
    // auto-creates its runtime session, so a chat's conversation is never
    // "gone" and its reconciliation is only ever about whether a process is
    // up. A restored agentic TERMINAL has no such resume — main either has a
    // PTY for it or does not — so that is where "this panel had a session and
    // has none now" is a real state, and where the page said `idle` about it.
    const ptys = typeof window.canvas?.pty?.list === 'function' ? window.canvas.pty.list().catch(() => []) : Promise.resolve([])
    void Promise.all([window.canvas.agentSession.list(), ptys]).then(
      ([rows, sessions]) => {
        if (!alive) return
        const map = new Map<string, OrchSessionFact>()
        for (const s of sessions) map.set(s.panelId, { live: true, running: true })
        for (const r of rows) {
          // Listed at all = the runtime holds this session. `running` is the
          // narrower fact of a process being up right now, which an idle
          // resumable chat does not have and does not need.
          map.set(r.id, {
            live: !GONE_STATUSES.includes(r.status),
            running: RUNNING_STATUSES.includes(r.status),
            ...(RUNNING_STATUSES.includes(r.status) ? {} : { exit: { ...(r.exitCode === undefined ? {} : { code: r.exitCode }), ...(r.exitSignal === undefined ? {} : { signal: r.exitSignal }) } })
          })
        }
        setLive(map)
      },
      () => { if (alive) setLive(null) }
    )
    return () => { alive = false }
  }, [refresh])
  return live
}

/**
 * M301. WHEN THE RECORD LAST SAW EACH PANEL — one read, not one per panel.
 *
 * "Unknown since some time" is the kind of sentence that makes a reader
 * distrust a whole page, so a reconciled panel says WHEN it was last seen
 * wherever the record can tell us. The durable record is asked once, with an
 * empty filter, and the newest row per panel is the answer; a panel the
 * record has never held simply has no date, which `standingOf` words as its
 * own arm rather than inventing one.
 *
 * `null` while the read is outstanding or after it failed, and that is not an
 * empty map: an empty map would say "the record knows nothing about any of
 * these", which is a claim, and a failed read is not entitled to make it.
 */
const LAST_SEEN_ROWS = 200

function useLastSeen(refresh: number): ReadonlyMap<string, number> | null {
  const [seen, setSeen] = useState<ReadonlyMap<string, number> | null>(null)
  useEffect(() => {
    if (typeof window.canvas?.ledger?.timeline !== 'function') return
    let alive = true
    void window.canvas.ledger.timeline({}, LAST_SEEN_ROWS).then(
      (read) => {
        if (!alive) return
        const map = new Map<string, number>()
        // Newest first, so the FIRST sighting of a panel is its latest.
        for (const e of read.entries) {
          if (e.kind === 'gap') continue
          const id = e.kind === 'command' ? e.row.panelId : e.row.panelId
          const at = e.kind === 'command' ? e.row.endedAt : e.row.at
          if (id !== undefined && !map.has(id)) map.set(id, at)
        }
        setSeen(map)
      },
      () => { if (alive) setSeen(null) }
    )
    return () => { alive = false }
  }, [refresh])
  return seen
}

function panelsToInput(
  panels: readonly Panel[],
  templates: readonly OrchTemplateInput[],
  live: ReadonlyMap<string, OrchSessionFact> | null,
  lastSeen: ReadonlyMap<string, number> | null
): OrchPanelInput[] {
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
        /*
         * M301. A chat's `sessionId` is persisted with the panel, so its
         * presence is exactly "this panel had a session" — the fact that
         * separates a conversation whose agent is gone from one that was
         * never started. Reconciliation is applied only while main has
         * answered (`live !== null`); before that, and for a terminal, the
         * pre-M301 behaviour stands and is recorded as a limitation.
         */
        ...(live === null ? {} : { liveSession: live.get(id)?.live === true, hadSession: p.chat.sessionId !== undefined }),
        ...(lastSeen?.get(id) === undefined ? {} : { lastSeen: lastSeen.get(id) }),
        supervisor: p.chat.supervisor === true,
        orchestrator: p.chat.orchestrator !== undefined,
        ...(linksTo.length > 0 ? { linksTo } : {}), ...linkTriggers
      }
    }
    if (isTerminalPanel(p)) {
      const liveSess = getLiveSession(id)
      const agentic = p.spec.agent !== undefined
      return {
        id, title, kind: 'terminal' as const,
        agentic,
        agentState: getAgentState(id),
        /*
         * M301. A terminal has no `--resume`: main has a PTY for it or it has
         * none. `hadSession` is the RECORD's evidence that it ran — a ledger
         * sighting — rather than a persisted session id, which the renderer
         * does not hold for terminals.
         *
         * THE RECORD MUST ACTUALLY SPEAK BEFORE ANYTHING IS CLAIMED (the
         * critic's findings 3 and 4). A sighting is read from the newest
         * `LAST_SEEN_ROWS` of one file, so its ABSENCE means one of three
         * things — it never ran, it ran before the window, or the read has not
         * landed — and only the first would justify "not started". So a
         * terminal with no sighting is left UNRECONCILED, exactly as a
         * pre-M301 build leaves it: the page keeps its old word rather than
         * swapping one confident wrong answer for another. The same rule makes
         * a failed or outstanding `lastSeen` read degrade to unreconciled
         * instead of asserting "never ran" about every terminal at once.
         */
        ...(live === null || !agentic || lastSeen?.get(id) === undefined ? {} : { liveSession: live.get(id)?.live === true, hadSession: true }),
        ...(lastSeen?.get(id) === undefined ? {} : { lastSeen: lastSeen.get(id) }),
        ...(liveSess?.currentCommand ? { currentCommand: liveSess.currentCommand } : {}),
        ...(liveSess?.cwd ? { cwd: liveSess.cwd } : {}),
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
  // M301. The reconciled word. It is NOT routed through agentWord, because
  // agentWord answers for a session that exists and this one does not — the
  // fallback below used to hand `idle` to exactly this case, which is the
  // lie M301 was written to end.
  if (row.state === 'unknown') return 'no session'
  return agentWord('idle').word
}

function toneFromState(state: OrchRosterRow['state']): Tone {
  if (state === 'wants-you') return 'needs-you'
  if (state === 'busy' || state === 'watching' || state === 'pool') return TONE_WORKING
  if (state === 'starting') return 'starting'
  // M301. Quiet and finished, never the live-idle family. The word carries it too.
  if (state === 'unknown') return 'exited'
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
function NodePlate({ node, synthetic, overflow, x, y, sub: subOverride, compact, selected = false }: { node: OrchGraphNode; synthetic: boolean; overflow: boolean; x: number; y: number; sub?: string
  /** M294. The compact tier: name and state word in two short lines, cut to this width (the station pitch on screen). */
  compact?: number
  /** #11. The selected station is never cut: it takes the full plate with its whole name, whatever the tier. Truncation is for the periphery. */
  selected?: boolean }): JSX.Element {
  const role = node.hub ? (synthetic ? 'Workspace hub' : 'Orchestrator') : overflow ? 'Other' : node.kind
  // A placeholder has no process, so it has no state to say: the role stands alone.
  //
  // M280: an ordinary satellite's plate says its STATE and nothing else — the
  // card beside it carries the kind, and the two sat eight pixels apart saying
  // the same word twice. The hub and the `+N more` node keep their role, because
  // theirs is not a kind: "Workspace hub", "Orchestrator" and "Other" name a
  // position in the ring that no card repeats and `node.kind` cannot express.
  // M291. A checkpoint's plate says `check · <result>` and an artifact's says
  // `file`: the kind is in the word as well as in the shape.
  const sub = subOverride ?? (synthetic ? role : node.hub || overflow ? `${stateWord(node)} · ${role}` : stateWord(node))
  if (compact !== undefined && !selected) {
    // The compact plate is cut to the pitch: at most `compact - 6` px wide, the
    // name and the word each truncated to what that width holds. No glyph — the
    // shape under it already says the kind — and the state dot stays, so the
    // word is never colour alone and the colour never word alone.
    const w = Math.max(44, Math.min(compact - 6, Math.max(node.title.length * 6.2, sub.length * 5.4) + 14))
    const fit = (text: string, px: number): string => { const cap = Math.max(4, Math.floor((w - 12) / px)); return text.length > cap ? `${text.slice(0, cap - 1).trimEnd()}…` : text }
    return (
      <g className="orch__plate orch__plate--compact" transform={`translate(${x - w / 2}, ${y})`} aria-hidden="true" data-orch-name-tier="compact">
        <title>{node.title}</title>
        <rect className="orch__plate-bg" width={w} height={PLATE_H - 6} rx={5} />
        <text x={6} y={12} className="orch__cube-label">{fit(node.title, 6.2)}</text>
        {!synthetic && <circle className="orch__cube-state" cx={8} cy={21} r={2} />}
        <text x={synthetic ? 6 : 13} y={24} className="orch__cube-role">{fit(sub, 5.4)}</text>
      </g>
    )
  }
  // #11. The name is set at --t-sm (12px mono, ~7.3px a character) and the
  // state line at --t-xs (~5.9px); the estimates follow the type. Selected, the
  // plate grows to the whole name — capped only where a name is a paragraph.
  const name = !selected && node.title.length > PLATE_MAX_CHARS ? `${node.title.slice(0, PLATE_MAX_CHARS - 1).trimEnd()}…` : node.title
  const w = Math.max(92, Math.min(selected ? 420 : 196, Math.max(name.length * 7.3, sub.length * 5.9) + 40))
  return (
    <g className="orch__plate" transform={`translate(${x - w / 2}, ${y})`} aria-hidden="true" data-orch-name-tier="full">
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
  /** M291. Station, checkpoint or artifact — the word on the plate and the DOM hook; absent for the legacy ring. */
  objectKind?: OrchObjectKind
  /** M292/M294. The name plate's density tier (orchNameTier): `none` draws no plate (the title stays on hover and in the List); absent = the legacy ring's full plate. */
  nameTier?: OrchNameTier
  /** M294. The station pitch on screen, the compact plate's width bound. */
  pitchPx?: number
  onSelect: (id: string) => void
  onJump: (id: string) => void
  onOverflow: () => void
}): JSX.Element {
  const { node, selected, attention, onSelect, onJump, onOverflow } = props
  const objectKind = props.objectKind
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
      data-orch-object={objectKind}
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
      {((props.nameTier ?? 'full') !== 'none' || selected) && <NodePlate node={node} synthetic={synthetic} overflow={overflow} x={props.labelOffset.x} y={node.size * PLATE_DROP_K + props.labelOffset.y}
        selected={selected}
        {...(props.nameTier === 'compact' ? { compact: props.pitchPx ?? 80 } : {})}
        {...(objectKind === 'checkpoint' ? { sub: `check · ${stateWord(node)}` } : objectKind === 'artifact' ? { sub: 'file' } : {})} />}
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

/**
 * M305. The roster's state groups, in scan order. Pure over the rows; the group
 * ids are the product's own state words, and `metric` names the lens a group's
 * header applies (null: no lens for that group).
 */
type OrchRosterGroupId = typeof TONE_WORKING | 'needs-you' | 'idle' | 'ended'
function orchRosterGroups<R extends { state: string }>(rows: readonly R[]): { id: OrchRosterGroupId; label: string; metric: OrchMetricId | null; rows: R[] }[] {
  const of = (st: string): OrchRosterGroupId =>
    st === 'wants-you' ? 'needs-you'
      : st === 'busy' || st === 'starting' || st === 'running' || st === 'watching' || st === 'pool' ? TONE_WORKING
        : st === 'exited' || st === 'unknown' ? 'ended' : 'idle'
  const groups = [
    { id: TONE_WORKING, label: 'Working', metric: 'agents' as OrchMetricId | null, rows: [] as R[] },
    { id: 'needs-you' as const, label: 'Needs you', metric: 'waiting' as OrchMetricId | null, rows: [] as R[] },
    { id: 'idle' as const, label: 'Idle', metric: null, rows: [] as R[] },
    { id: 'ended' as const, label: 'Ended', metric: null, rows: [] as R[] }
  ]
  for (const r of rows) groups.find((g) => g.id === of(r.state))!.rows.push(r)
  return groups.filter((g) => g.rows.length > 0)
}

/** Cards share the projected cube anchor but never inherit its face rotation. */
function CubeCallout({ node, offsetX, offsetY = 0, below, drift, band, expanded, task, onSelect, onJump, onInterrupt }: {
  node: OrchGraphNode; offsetX: number; expanded: boolean; task?: string
  /** M291. How far the placed row sits from the default row on its side (negative = higher); the stem stretches to it. */
  offsetY?: number
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
    <path className="orch__callout-stem" d={`M 0 0 L ${offsetX + drift.x} ${sy + drift.y + offsetY}`} />
    <g transform={`translate(${offsetX + drift.x}, ${sy + drift.y + offsetY}) scale(${s}) translate(${-offsetX}, ${-sy})`}>
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

/**
 * M291. The platform label plate: the island's goal, its placement line and
 * its counts, top-left of the plate, screen-aligned (plain SVG text, never
 * rotated with the stage). It is the island CARD Phase C floated over the ring,
 * moved onto the platform it names; a click focuses the island, a double-click
 * fits the camera to it. The `data-orch-island-id` hook is the same one the
 * List's column carries, so a check may address the island either way.
 */
function PlatformPlate({ p, cx, y, w, level, focused, selected, onFocus, onFit }: {
  /** M294. The plate is CENTRED on the diamond's top tip (`cx`), its bottom edge `y + h` a gap above the tip. */
  p: OrchPlatform; cx: number; y: number; w: number; level: OrchZoomLevel; focused: boolean; selected: boolean
  onFocus: (id: string) => void; onFit: (id: string) => void
}): JSX.Element {
  const waiting = p.counts.needsYou > 0
  const ambiguous = p.island !== undefined && p.island.placement.kind === 'shared' && (p.island.writers > 1 || p.island.sharedWith.length > 0)
  const label = p.label.length > 30 ? `${p.label.slice(0, 29).trimEnd()}…` : p.label
  const counts = orchPlatformCountsLine(p)
  const hidden = orchHiddenLine(p)
  // Three lines, the plan's label: the goal; the repository and where its files
  // live (branch · own worktree, or a shared directory, said); then the state
  // WORD with the counts — so the plate says what the platform's colour and
  // glow only echo. The place line is the same text the List's column carries.
  // A session island's state IS `no task yet`; saying it twice was the critic's note.
  const stateLine = p.synthetic ? 'grouping only' : p.island?.source === 'work-item' ? `Task · ${p.state}` : 'Session · no task yet'
  const thirdLine = `${stateLine} · ${counts}`
  const placeLine = p.sub
  // The backing is at most the plate's width plus a little; each line is cut
  // to what fits it (SVG text does not clip), the full text on the title.
  // M298: never wider than ORCH_PLATE_LABEL.w — that is the width the fit reserves sideways.
  const plateW = Math.max(150, Math.min(ORCH_PLATE_LABEL.w, Math.max(w + 12, 150), Math.max(label.length * 6.6, placeLine.length * 5.4, thirdLine.length * 5.4) + 24))
  // M298: the `+N more` chip stands on the plate's far side from the tip (above an upper-row
  // label, below a lower-row one) inside the plate's width — beside it, it ran past the fit's
  // reserved width into the rail (measured on the 61- and 100-session fixtures).
  const moreY = p.labelSide === 'above' ? -(ORCH_PLATE_MORE.h + ORCH_PLATE_MORE.gap) : ORCH_PLATE_LABEL.h + ORCH_PLATE_MORE.gap
  const fitLine = (text: string, px: number): string => { const cap = Math.max(8, Math.floor((plateW - 16) / px)); return text.length > cap ? `${text.slice(0, cap - 1).trimEnd()}…` : text }
  const placeShown = fitLine(placeLine, 5.4)
  const thirdShown = fitLine(thirdLine, 5.4)
  const x = cx - plateW / 2
  return (
    <g className={`orch__pplate${focused ? ' orch__pplate--on' : ''}`} transform={`translate(${x}, ${y})`}
      data-orch-platform-plate={p.id} data-orch-island-id={p.island?.id} data-orch-island={p.island?.itemId ?? p.island?.subjectId ?? undefined}
      data-orch-island-source={p.island?.source} data-orch-island-ambiguous={ambiguous || undefined} data-orch-zoom={level}
      tabIndex={0} role="button" aria-pressed={selected} aria-label={`${p.label} — ${placeLine}; ${thirdLine}`}
      onClick={(e) => { e.stopPropagation(); onFocus(p.id) }} onDoubleClick={(e) => { e.stopPropagation(); onFit(p.id) }}
      onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'Enter') { e.preventDefault(); onFocus(p.id) } }}>
      <title>{`${p.label} — ${placeLine}. ${thirdLine}. Click to select the island; double-click to fit the camera to it.`}</title>
      <rect className="orch__pplate-bg" width={plateW} height={44} rx={6} />
      {waiting && <circle className="orch__cube-beacon orch__pplate-beacon" cx={plateW - 10} cy={10} r={3} aria-hidden="true" />}
      <text x={8} y={13} className="orch__pplate-title" data-orch-island-goal>{label}</text>
      <text x={8} y={25} className="orch__pplate-sub orch__pplate-place" data-orch-island-place={p.island === undefined ? undefined : ''}><title>{placeLine}</title>{placeShown}</text>
      <text x={8} y={37} className="orch__pplate-sub" data-orch-platform-state={p.state} data-orch-platform-counts><title>{thirdLine}</title>{thirdShown}</text>
      {p.synthetic && <text x={8} y={25} className="orch__pplate-sub" data-orch-grouping style={{ display: 'none' }}>{ORCH_DEP_GROUPING}</text>}
      {hidden !== null && (
        <g className="orch__pplate-more" transform={`translate(0, ${moreY})`} data-orch-platform-more={p.hidden.ids.length} role="button" tabIndex={0}
          aria-label={`${hidden} — focus the island to see them all`} onClick={(e) => { e.stopPropagation(); onFit(p.id) }}
          onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'Enter') { e.preventDefault(); onFit(p.id) } }}>
          <title>{`${hidden}. Focus the island to see every station.`}</title>
          <rect className="orch__pplate-bg" width={hidden.length * 5.6 + 16} height={18} rx={9} />
          <text x={8} y={12.5} className="orch__pplate-sub">{hidden}</text>
        </g>
      )}
    </g>
  )
}

/**
 * M292. The minimap: every platform as a rectangle in model space, the camera's
 * viewport over them; a click moves the camera there. Screen-aligned HTML/SVG in
 * the scene's corner, outside the projection.
 */
function Minimap({ platforms, cam, stage, onCentre }: { platforms: readonly OrchPlatform[]; cam: OrchCamera; stage: { w: number; h: number }; onCentre: (pt: { x: number; y: number }) => void }): JSX.Element {
  const bounds = orchPlatformBounds(platforms)
  const W = 112
  const H = 60
  const s = Math.min(W / Math.max(1, bounds.w + 40), H / Math.max(1, bounds.h + 40))
  const ox = (W - bounds.w * s) / 2 - bounds.x * s
  const oy = (H - bounds.h * s) / 2 - bounds.y * s
  // The viewport in model space: invert orchProjectWorld at the stage's corners.
  const inv = (sx: number, sy: number): { x: number; y: number } => ({
    x: (sx - stage.w / 2 - cam.x) / cam.k + stage.w / 2,
    y: ((sy - stage.h / 2 - cam.y) / cam.k) / ORCH_COS_TILT + stage.h / 2
  })
  const tl = inv(0, 0)
  const br = inv(stage.w, stage.h)
  return (
    <svg className="orch__minimap" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Minimap of every platform and the camera" data-orch-minimap
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onCentre({ x: ((e.clientX - r.left) - ox) / s, y: ((e.clientY - r.top) - oy) / s }) }}>
      {/* M294. Each plate is its diamond (pre-tilt, so the minimap is a plan view). */}
      {platforms.map((p) => { const mx = ox + p.x * s; const my = oy + p.y * s; const r = Math.max(2, p.half * s); return <polygon key={p.id} className={`orch__minimap-plate${p.synthetic ? ' orch__minimap-plate--group' : ''}`} data-orch-minimap-plate={p.id} data-lit={p.counts.live > 0 || undefined} data-needs={p.counts.needsYou > 0 || undefined}
        points={`${mx},${my - r} ${mx + r},${my} ${mx},${my + r} ${mx - r},${my}`} /> })}
      <rect className="orch__minimap-view" x={ox + tl.x * s} y={oy + tl.y * s} width={Math.max(4, (br.x - tl.x) * s)} height={Math.max(3, (br.y - tl.y) * s)} rx={1} />
    </svg>
  )
}

function GraphBoard(props: {
  platforms: readonly OrchPlatform[]
  edges: readonly { from: string; to: string; authored?: boolean; trigger?: string }[]
  fires: ReadonlyMap<string, OrchEdgeFire>
  selectedId: string | null
  selectedIds: readonly string[]
  panels: readonly Panel[]
  workItems: readonly PersistedWorkItem[]
  memberIds: readonly string[] | null
  /** Objects a metric / roster lens leaves lit; everything else dims in place. `null` = no lens. */
  litIds: ReadonlySet<string> | null
  wash: OrchWash | null
  onInterrupt?: (id: string) => void
  /** M290. Whether this panel's runtime has an interrupt door right now (the view's capability read). */
  canInterrupt: (id: string) => boolean
  /** M289. The dependency lens is on: trigger words on the authored edges, membership spokes drawn and marked as grouping. */
  depFocus: boolean
  firingKeys: ReadonlySet<string>
  /** M291. The focused island's platform (expands past the cap; the breadcrumb's middle). */
  focusedPlatformId: string | null
  onFocusPlatform: (id: string | null) => void
  /** M292. Quality tier from the view's frame-time read. */
  quality: 'full' | 'lean' | 'flat'
  /** M293. WebGL could not be had: paint flat SVG bodies instead of mounting the island. */
  webgl: 'ready' | 'unavailable'
  onWebglLost: () => void
  onCamera: (camera: { x: number; y: number; k: number }) => void
  onSelect: (id: string) => void
  onJump: (id: string) => void
  describedBy?: string
}): JSX.Element {
  const { platforms, edges, selectedId, selectedIds, firingKeys, litIds, wash, onSelect, onJump, focusedPlatformId, onFocusPlatform } = props
  const lensedOut = (id: string): boolean => litIds !== null && !litIds.has(id)
  const hasSelection = selectedId !== null || selectedIds.length > 0
  const isSelected = (id: string): boolean => selectedId === id || selectedIds.includes(id)
  const attentionOf = useAttentionAck()
  const [hovered, setHovered] = useState<string | null>(null)
  // M283. The camera starts where the user left it, not at the origin (orchestration-prefs.ts).
  const [cam, setCam] = useState(() => getOrchPrefs().camera)
  useEffect(() => { setOrchPrefs({ camera: cam }); props.onCamera(cam) }, [cam, props.onCamera])
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  // M298. The stage FOLLOWS the panel's aspect ratio: its width stays the
  // model's 860 (so x is the same unit everywhere) and its height is what the
  // panel's shape makes it. The fixed 860×420 stage letterboxed inside the
  // real panel (xMidYMid meet) — measured 536×224 at the app's default
  // window, 812×224 narrow, 1128×649 wide: none of them 2.05:1 — so the fit
  // filled a band of the panel, not the panel; two platforms in the narrow
  // window spanned 31% of its width. Read off the scene's own box, so the SVG
  // viewBox, the island's viewBox and the hit-targets keep one projection.
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const [stageH, setStageH] = useState<number>(ORCH_GRAPH_SIZE.h)
  useEffect(() => {
    const el = sceneRef.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const read = (): void => {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      // Whole units, and never a sliver: a zero-height stage would divide by it.
      setStageH(Math.max(120, Math.round((ORCH_GRAPH_SIZE.w * r.height) / r.width)))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const stage = useMemo(() => ({ w: ORCH_GRAPH_SIZE.w, h: stageH }), [stageH])
  // M292. Camera Back: every DELIBERATE move (Fit all, Fit selected, a minimap
  // click, a focus) pushes the camera it left; a pan or a wheel does not, or
  // Back would step through every pixel of a drag.
  const history = useRef<OrchCamera[]>([])
  const [historyDepth, setHistoryDepth] = useState(0)
  const moveCamera = (next: OrchCamera): void => {
    autoFitted.current = false
    history.current = [...history.current.slice(-19), cam]
    setHistoryDepth(history.current.length)
    setCam(next)
  }
  // M298. Fit all keeps the label plates' pixels clear (orchLabelMargins) and
  // may go under the wheel's zoom floor (ORCH_FIT_FLOOR): everything, always.
  const fitAllCamera = (): OrchCamera => orchFitCamera(orchPlatformBounds(platforms), stage, 24, orchLabelMargins(platforms), ORCH_FIT_FLOOR)
  const fitAll = (): void => moveCamera(fitAllCamera())
  const fitPlatform = (id: string): void => {
    const p = platforms.find((x) => x.id === id)
    if (p === undefined) return
    moveCamera(orchFitCamera(orchPlatformBounds([p]), stage, 28, orchLabelMargins([p])))
  }
  const back = (): void => {
    const prev = history.current[history.current.length - 1]
    if (prev === undefined) return
    history.current = history.current.slice(0, -1)
    setHistoryDepth(history.current.length)
    setCam(prev)
  }
  // The camera flies on TWO occasions only: the first paint of a scene whose
  // camera is still the origin (the fleet must be in frame — M298: a lone
  // platform too, which the zig-zag seats lower-LEFT of the stage, measured
  // 43% of the panel's height and clipped at k = 1), and a change in how many
  // platforms there are (a new island landed off-screen). Never on an event.
  const countRef = useRef<number | null>(null)
  useEffect(() => {
    const n = platforms.length
    if (countRef.current === n) return
    const first = countRef.current === null
    countRef.current = n
    if (first && (cam.x !== 0 || cam.y !== 0 || cam.k !== 1)) return
    // Even then, only when something is now OFF the stage: a new island that
    // landed in view moves nothing, so the ones a person is looking at stay put.
    const b = orchPlatformBounds(platforms)
    const tl = orchProjectWorld({ x: b.x, y: b.y }, stage, cam)
    const br = orchProjectWorld({ x: b.x + b.w, y: b.y + b.h }, stage, cam)
    if (!first && tl.x >= 0 && tl.y >= 0 && br.x <= stage.w && br.y <= stage.h) return
    autoFitted.current = true
    setCam(fitAllCamera())
  }, [platforms.length])
  // M298. The first paint fits against the DEFAULT stage (the panel's box is
  // read a render later); when the measured stage arrives, a camera the
  // auto-fit set is fitted again. A camera a person has moved since is not.
  const autoFitted = useRef(false)
  useEffect(() => {
    if (!autoFitted.current) return
    setCam(fitAllCamera())
  }, [stageH])

  // ---- Projection: platforms, then every object on them, through one camera.
  const focusedIsOn = (id: string): boolean => focusedPlatformId === id
  // M294. The diamond ON SCREEN: half-width `half · k`, half-height that times
  // cos(tilt), the thickness band under it; the six-point outline is the
  // hit-target AND the mesh's silhouette (orchPlatformHitPolygon's header).
  // The focused plate is LIFTED by ORCH_SELECT_LIFT px — its outline, its
  // label and every object on it move together, so the target keeps following
  // the mesh (the mesh damps to the same number). The deck's rise (the stacked
  // tiers' height on screen) lifts a layer-1 object so it stands on the deck.
  const band = ORCH_PLATFORM.thickness * cam.k * ORCH_SIN_TILT
  const deckRise = ORCH_PLATFORM.stack * cam.k * ORCH_SIN_TILT
  const projPlatforms = platforms.map((p) => {
    const focused = focusedIsOn(p.id)
    const lift = focused ? ORCH_SELECT_LIFT : 0
    const c = orchProjectWorld({ x: p.x, y: p.y }, stage, cam)
    const y = c.y - lift
    const hx = p.half * cam.k
    const hy = hx * ORCH_COS_TILT
    const w = hx * 2
    const h = p.h * cam.k
    const points = orchPlatformHitPolygon({ x: c.x, y }, hx, hy, band)
    const hit = orchPolygonBounds(points)
    const level = orchZoomLevel(w, focused || p.expanded)
    // The label plate: centred on the tip its side names (p.labelSide), a gap clear of it.
    const labelY = p.labelSide === 'above' ? y - hy - ORCH_PLATE_LABEL.gap - ORCH_PLATE_LABEL.h : y + hy + band + ORCH_PLATE_LABEL.gap
    const label = { x: c.x - ORCH_PLATE_LABEL.w / 2, y: labelY, w: ORCH_PLATE_LABEL.w, h: ORCH_PLATE_LABEL.h }
    return { p, x: c.x, y, w, h, hx, hy, lift, depth: c.depth, level, points, hit, label, pitchPx: p.pitch * cam.k }
  })
  const levelOf = new Map(projPlatforms.map((pp) => [pp.p.id, pp.level]))
  const platformOf = (id: string): typeof projPlatforms[number] | undefined => projPlatforms.find((pp) => pp.p.id === id)
  const objects = orchSceneObjects(platforms)
  const projected = objects
    .filter((o) => orchObjectVisible(o, levelOf.get(o.platformId) ?? 'evidence'))
    .map((o) => {
      const c = orchProjectWorld({ x: o.x, y: o.y }, stage, cam)
      const size = o.size * cam.k
      const pp = platformOf(o.platformId)
      const y = c.y - (pp?.lift ?? 0) - (o.layer === 1 ? deckRise : 0)
      // A node-shaped record so the callout placer and IsoCube read it unchanged.
      const node: OrchGraphNode = { id: o.id, title: o.title, kind: o.panelKind === 'file' ? 'file' : o.panelKind, hub: false, x: c.x, y, state: o.state, size }
      return { ...node, object: o, lift: pp?.lift ?? 0, depth: c.depth + o.layer * 0.02, band: orchDepthBand(Math.max(-1, Math.min(1, c.depth))), drift: { x: 0, y: 0 } }
    })
  const budgeted = orchLabelBudget(projected, { selected: new Set(selectedIds.concat(selectedId === null ? [] : [selectedId])), hovered })
  // M294. A name at rest, by DENSITY (orchNameTier): the full plate where the
  // plate's station pitch on screen clears it, a compact two-line plate cut to
  // the pitch where nothing stands in the row it hangs into, none past that —
  // every name is in the List and on hover, and the selected, hovered and
  // waiting stations carry theirs on a CARD. The budget still caps the count.
  const nameTierOf = (n: typeof projected[number]): OrchNameTier => {
    if (!budgeted.has(n.id)) return 'none'
    return orchNameTier(platformOf(n.object.platformId)?.pitchPx ?? 0, n.object.front)
  }
  const points = new Map(projected.map((n) => [n.id, { x: n.x, y: n.y }]))

  const expanded = (id: string): boolean => selectedIds.includes(id) || selectedId === id || hovered === id
  // M291. A card for the selected, the hovered and the WAITING stations only:
  // the ring gave every live cube a card, and on a platform of seven stations
  // those cards covered the plate's label and each other. A working station's
  // word is on its platform's plate (`N working`) and in the List.
  // Waiting cards are capped at ORCH_WAITING_CARDS (nearest first): the
  // 100-session fixture put ten waiting stations on one island and ten amber
  // cards covered every plate. Every waiting station still has its beacon, its
  // plate word, the platform's `N need you` and its row in Needs attention.
  const waitingCards = new Set(projected.filter((n) => n.object.kind === 'station' && n.state === 'wants-you' && !expanded(n.id)).sort((a, b) => b.depth - a.depth).slice(0, ORCH_WAITING_CARDS).map((n) => n.id))
  const calloutNodes = projected.filter((n) => n.object.kind === 'station'
    && (props.memberIds === null || props.memberIds.includes(n.id))
    // A lensed-out cube keeps its place but not its card: the lit set's callouts are the answer.
    && !lensedOut(n.id)
    && (waitingCards.has(n.id) || expanded(n.id)))
  const offsets = new Map<string, { x: number; y: number }>()
  // Cards that hang BELOW their cube: a back-row cube has no room above it.
  const below = new Set<string>()
  const occupied: { x: number; y: number; w: number; h: number }[] = []
  // Every object AND every plate is an obstacle; a card over a platform's label
  // hides the island's name, which is the one thing the plate is for.
  const footprints = [
    ...projected.map((o) => ({ id: o.id, weight: 1, x: o.x - o.size * 1.4, y: o.y - o.size, w: o.size * 2.8, h: o.size + calloutBelow(o.size) })),
    // The island's label weighs like another CARD (the critic: the selected
    // station's card sat on the island's goal and repository lines) — a card
    // over a label hides the one fact the plate exists for. The obstacle IS the
    // label's box (M294: centred above the diamond's top tip), one definition.
    ...projPlatforms.map((pp) => ({ id: `plate:${pp.p.id}`, weight: 12, ...pp.label }))
  ]
  const cover = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad: number): number =>
    Math.max(0, Math.min(a.x + a.w + pad, b.x + b.w) - Math.max(a.x - pad, b.x)) * Math.max(0, Math.min(a.y + a.h + pad, b.y + b.h) - Math.max(a.y - pad, b.y))
  // A card that cannot clear the label band EXPANDED collapses to its rest
  // height: the three plates' labels form one band across the stage and the
  // fitted camera leaves ~130 units above it, less than an expanded card and
  // its stem — so an expanded card could only ever sit ON a label (the critic,
  // rounds 1–3). The rest card fits above the band; the detail is the inspector's.
  const compact = new Set<string>()
  for (const n of [...calloutNodes].sort((a, b) => Number(expanded(b.id)) - Number(expanded(a.id)))) {
    const w = n.state === 'wants-you' ? 218 : 184
    const plateTopOf = platformOf(n.object.platformId)?.label.y
    const fits = (hh: number): boolean => (plateTopOf !== undefined && plateTopOf - hh - 8 >= 8) || n.y + calloutBelow(n.size) + 22 + hh <= stage.h - 8
    if (expanded(n.id) && !fits(calloutHeight(true)) && fits(calloutHeight(false))) compact.add(n.id)
    const h = calloutHeight(expanded(n.id) && !compact.has(n.id))
    const others = footprints.filter((f) => f.id !== n.id)
    // A third row: ABOVE the island's label plate. The row just above the cube
    // always crosses that label's band (the cubes stand near the plate's top),
    // and sliding fully off the platform cost the placer more than covering
    // the label did (the critic, twice) — the field above the platforms is empty.
    const plateTop = plateTopOf
    // And a row BESIDE the cube: at the fitted camera the stage leaves ~130 units
    // above a platform and an expanded card is 172 plus its stem, so neither
    // above nor below fits and the clamp fallback landed on the label (the
    // critic, round 3). Beside, the x sweep finds the field past the platform.
    const beside = Math.max(8, Math.min(stage.h - h - 8, n.y - h / 2))
    const rows = [n.y - n.size - h - 22, ...(plateTop === undefined ? [] : [plateTop - h - 8]), n.y + calloutBelow(n.size) + 22, beside]
      .filter((y) => y >= 8 && y + h <= stage.h - 8)
    if (rows.length === 0) rows.push(Math.max(8, Math.min(stage.h - h - 8, n.y - n.size - h - 22)))
    const sweep = []
    for (let x = 8; x <= stage.w - w - 8; x += 24) sweep.push(x + w / 2 - n.x)
    const drifts = [0, ...[...occupied, ...others].flatMap((r) => [r.x + r.w + 12 + w / 2 - n.x, r.x - 12 - w / 2 - n.x]), w + 16, -w - 16, ...sweep]
    const candidates = rows.flatMap((y) => drifts.map((dx) => {
      const x = Math.max(8, Math.min(stage.w - w - 8, n.x + dx - w / 2))
      const box = { x, y, w, h }
      const overlap = occupied.reduce((sum, r) => sum + cover(box, r, 8) * 8, 0) + others.reduce((sum, r) => sum + cover(box, r, 0) * r.weight, 0)
      const distance = Math.hypot(x + w / 2 - n.x, y + h / 2 - n.y)
      return { x, y, w, h, overlap: overlap + distance * 60, distance }
    })).sort((a, b) => a.overlap - b.overlap || a.distance - b.distance)
    const placed = candidates[0]
    occupied.push(placed)
    if (placed.y > n.y) below.add(n.id)
    // The placed ROW too: the card used to render at the cube's own row whatever
    // the placer chose (it took an x offset and a side only), so the above-label
    // row was picked and then drawn on the label. The lift is the difference
    // from the default row on that side; the stem stretches to it.
    const defaultY = placed.y > n.y ? n.y + calloutBelow(n.size) + 22 : n.y - n.size - h - 22
    offsets.set(n.id, { x: placed.x + w / 2 - n.x, y: placed.y - defaultY })
  }

  const cubeSpecs: OrchCubeSpec[] = projected.map((n) => {
    const selected = isSelected(n.id)
    return {
      id: n.id, x: n.x, y: n.y, size: n.size, depth: n.depth, hub: false, synthetic: false, lift: n.lift,
      shape: n.object.kind === 'checkpoint' ? 'puck' : n.object.kind === 'artifact' ? 'tablet' : 'cube',
      tone: toneFromState(n.state) as OrchCubeTone, selected,
      // Role → hue: a chat is the accent, a terminal/file steel, a watcher/workflow violet — the secondary family.
      roleColor: n.kind === 'chat' ? '--iris' : n.kind === 'terminal' || n.kind === 'file' ? '--deck-steel' : '--deck-violet',
      dimmed: hasSelection && !selected, lensedOut: lensedOut(n.id),
      attention: attentionOf(n, selected)
    }
  })
  const platformSpecs: OrchPlatformSpec[] = projPlatforms.map((pp) => ({
    id: pp.p.id, x: pp.x, y: pp.y, side: pp.p.side * cam.k, inset: ORCH_PLATFORM.inset * cam.k, thickness: ORCH_PLATFORM.thickness * cam.k, depth: pp.depth, lift: pp.lift,
    synthetic: pp.p.synthetic, selected: focusedIsOn(pp.p.id), dimmed: focusedPlatformId !== null && !focusedIsOn(pp.p.id) && hasSelection,
    lit: pp.p.counts.live > 0, needsYou: pp.p.counts.needsYou > 0, expanded: pp.p.expanded
  }))
  // M294. Connectors: light paths between neighbouring platforms and along a
  // plate's stations, trimmed to the outlines they join so no path crosses a
  // body. They are GROUPING (the same word the lens gives membership), never a
  // dependency, and there is no hub for them to meet at. A station chain
  // LIGHTS once, finitely, when either end changes state — the class restarts
  // its one-shot animation through the key, and nothing loops.
  const stateStamps = useRef(new Map<string, { state: string; at: number }>())
  const now = Date.now()
  for (const n of projected) {
    const prev = stateStamps.current.get(n.id)
    if (prev === undefined) stateStamps.current.set(n.id, { state: n.state, at: 0 })
    else if (prev.state !== n.state) stateStamps.current.set(n.id, { state: n.state, at: now })
  }
  const connectors = orchConnectors(platforms).flatMap((c) => {
    if (c.kind === 'platform') {
      const a = platformOf(c.from); const b = platformOf(c.to)
      if (a === undefined || b === undefined) return []
      const seg = orchSegmentBetween({ x: a.x, y: a.y }, { x: b.x, y: b.y }, a.points, b.points)
      return seg === null ? [] : [{ ...c, ...seg, lit: 0 }]
    }
    const a = projected.find((n) => n.id === c.from); const b = projected.find((n) => n.id === c.to)
    if (a === undefined || b === undefined) return []
    const box = (n: typeof a): { x: number; y: number }[] => [{ x: n.x - n.size * 1.1, y: n.y - n.size * 1.1 }, { x: n.x + n.size * 1.1, y: n.y - n.size * 1.1 }, { x: n.x + n.size * 1.1, y: n.y + n.size * 1.1 }, { x: n.x - n.size * 1.1, y: n.y + n.size * 1.1 }]
    const seg = orchSegmentBetween({ x: a.x, y: a.y }, { x: b.x, y: b.y }, box(a), box(b))
    const at = Math.max(stateStamps.current.get(a.id)?.at ?? 0, stateStamps.current.get(b.id)?.at ?? 0)
    return seg === null ? [] : [{ ...c, ...seg, lit: now - at < ORCH_CONNECTOR_LIT_MS ? at : 0 }]
  })

  // Paint (= hit) order: resting plates far→near, their objects, then an expanded plate and its objects.
  const hitOrder = orchHitOrder([
    ...projPlatforms.map((pp) => ({ kind: 'platform' as const, id: pp.p.id, depth: pp.depth, expanded: pp.p.expanded })),
    ...projected.map((n) => ({ kind: n.object.kind, id: n.id, depth: n.depth, platformId: n.object.platformId }))
  ])

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>): void => {
    event.preventDefault()
    autoFitted.current = false
    const factor = event.deltaY > 0 ? 0.92 : 1.08
    setCam((c) => ({ ...c, k: Math.min(ORCH_ZOOM_RANGE.max, Math.max(ORCH_ZOOM_RANGE.min, c.k * factor)) }))
  }
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const target = event.target as SVGElement
    if (target.closest('.orch__cube, .orch__callout-host, .orch__pplate')) return
    drag.current = { x: event.clientX, y: event.clientY, cx: cam.x, cy: cam.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const d = drag.current
    if (d === null) return
    const svg = event.currentTarget
    const sx = svg.clientWidth > 0 ? stage.w / svg.clientWidth : 1
    const sy = svg.clientHeight > 0 ? stage.h / svg.clientHeight : 1
    autoFitted.current = false
    setCam((c) => ({ ...c, x: d.cx + (event.clientX - d.x) * sx, y: d.cy + (event.clientY - d.y) * sy }))
  }
  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const centreOn = (pt: { x: number; y: number }): void => {
    const fy = stage.h / 2 + (pt.y - stage.h / 2) * ORCH_COS_TILT
    moveCamera({ k: cam.k, x: -(pt.x - stage.w / 2) * cam.k, y: -(fy - stage.h / 2) * cam.k })
  }
  const focusedPlatform = platforms.find((p) => p.id === focusedPlatformId) ?? null
  const selectedObject = selectedId === null ? null : objects.find((o) => o.id === selectedId) ?? null
  const authored = orchEdgePaintOrder(edges).filter((e) => e.authored === true)

  return (
    <>
    <div className="orch__graph-scene" ref={sceneRef} role="group" aria-label="Task platforms" aria-describedby={props.describedBy} data-lens={litIds !== null ? 'true' : undefined} data-orch-webgl={props.webgl} data-orch-quality={props.quality}>
      {/* Ground layer: defs and the dependency edges — what the meshes paint OVER. Owns pan/zoom. */}
      <svg
        className="orch__graph orch__graph--ground"
        viewBox={`0 0 ${stage.w} ${stage.h}`}
        aria-hidden="true"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* M293. With no WebGL the bodies are flat SVG: the plate's footprint and
            a glyph-less block per object, so every state's word and shape survive. */}
        {props.webgl === 'unavailable' && hitOrder.map((t) => {
          if (t.kind === 'platform') {
            const pp = projPlatforms.find((x) => x.p.id === t.id)!
            return <polygon key={`flat-${t.id}`} className={`orch__flat-plate${pp.p.synthetic ? ' orch__flat-plate--group' : ''}`} data-orch-flat="platform" points={pp.points.map((q) => `${q.x},${q.y}`).join(' ')} data-lit={pp.p.counts.live > 0 || undefined} />
          }
          const n = projected.find((x) => x.id === t.id)!
          return n.object.kind === 'checkpoint'
            ? <polygon key={`flat-${t.id}`} className="orch__flat-object" data-orch-flat={t.kind} data-tone={toneFromState(n.state)} points={Array.from({ length: 6 }, (_, i) => `${n.x + Math.cos((Math.PI / 3) * i) * n.size},${n.y + Math.sin((Math.PI / 3) * i) * n.size * 0.8}`).join(' ')} />
            : <rect key={`flat-${t.id}`} className="orch__flat-object" data-orch-flat={t.kind} data-tone={toneFromState(n.state)} x={n.x - n.size * (t.kind === 'artifact' ? 0.7 : 1)} y={n.y - n.size} width={n.size * (t.kind === 'artifact' ? 1.4 : 2)} height={n.size * 2} rx={2} />
        })}
        {/* M289/M291. With the lens on, membership is drawn and MARKED as grouping:
            a quiet dashed spoke from each station to its plate's anchor. At rest a
            station standing on its plate needs no line. */}
        {props.depFocus && projected.filter((n) => n.object.kind === 'station').map((n) => {
          const pp = projPlatforms.find((x) => x.p.id === n.object.platformId)
          if (pp === undefined) return null
          return <line key={`spoke-${n.id}`} x1={pp.x} y1={pp.label.y + pp.label.h} x2={n.x} y2={n.y} className={`orch__edge orch__edge--grouping${lensedOut(n.id) ? ' orch__edge--lensed' : ''}`} data-orch-edge="grouping" data-role={n.kind} />
        })}
        {authored.map((e) => {
          const from = points.get(e.from)
          const to = points.get(e.to)
          if (!from || !to) return null
          const firing = firingKeys.has(`${e.from}:${e.to}`) || firingKeys.has(`${e.to}:${e.from}`)
          const fromN = projected.find((n) => n.id === e.from)!
          const toN = projected.find((n) => n.id === e.to)!
          return (
            <line
              key={`${e.from}-${e.to}-a`}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              className={`orch__edge orch__edge--authored${firing ? ' orch__edge--current' : ''}${lensedOut(e.from) || lensedOut(e.to) ? ' orch__edge--lensed' : ''}`}
              data-role={toN.kind}
              data-connected-live={(isLiveRosterState(fromN.state) || isLiveRosterState(toN.state)) || undefined}
              data-edge-activity={firing ? 'firing' : undefined}
              data-orch-edge="dependency"
            />
          )
        })}
        {props.depFocus && authored.map((e) => {
          const from = points.get(e.from)
          const to = points.get(e.to)
          if (!from || !to) return null
          return <text key={`label-${e.from}-${e.to}`} className="orch__edge-label" x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6} textAnchor="middle" data-orch-edge-label={`${e.from}:${e.to}`}>{e.trigger ?? 'a bare link'}</text>
        })}
      </svg>
      {/* The R3F island: platforms and the object meshes, painted above the
          ground layer and below the hit-targets. `pointer-events: none`. The
          fallback keeps the layer's box; with no WebGL the island is not mounted
          at all (the flat bodies above stand in) and the boundary says so. */}
      {props.webgl === 'ready' && (
        <WebglBoundary onLost={props.onWebglLost}>
          <Suspense fallback={<div className="orch__cube-canvas" aria-hidden="true" />}>
            <OrchestrationCubes nodes={cubeSpecs} platforms={platformSpecs} viewBox={stage} quality={props.quality} />
          </Suspense>
        </WebglBoundary>
      )}
      {/* Overlay: hit-targets in PAINT order (orchHitOrder — what elementFromPoint
          answers), plates, beacons, labels, callouts. Root is pointer-events:none. */}
      <svg className="orch__graph orch__graph--over" data-has-selection={hasSelection ? 'true' : undefined} viewBox={`0 0 ${stage.w} ${stage.h}`}>
        <filter id="orch-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* M294. The connectors paint FIRST in the overlay — above the meshes
            (a path under an opaque deck is no path) and under every target,
            plate and card. Trimmed to the outlines, so they never cross a body. */}
        <g className="orch__connectors" aria-hidden="true" data-orch-connectors={connectors.length}>
          {connectors.map((c) => (
            <line key={`${c.kind}-${c.from}-${c.to}-${c.lit}`} className={`orch__connector orch__connector--${c.kind}${c.lit > 0 ? ' orch__connector--lit' : ''}${props.depFocus ? ' orch__connector--lensed' : ''}`}
              data-orch-edge="grouping" data-orch-connector={c.kind} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}><title>{ORCH_DEP_GROUPING}</title></line>
          ))}
        </g>
        {hitOrder.map((t) => {
          if (t.kind === 'platform') {
            const pp = projPlatforms.find((x) => x.p.id === t.id)!
            return (
              <g key={`platform-${t.id}`} className={`orch__platform-host${focusedIsOn(t.id) ? ' orch__platform-host--on' : ''}`} data-orch-platform={t.id} data-orch-platform-zoom={pp.level} data-orch-platform-cell={`${pp.p.cell.col},${pp.p.cell.row}`}
                data-orch-platform-expanded={pp.p.expanded || undefined} data-orch-platform-synthetic={pp.p.synthetic || undefined} data-orch-platform-lift={pp.lift || undefined}
                onPointerEnter={() => setHovered(`platform:${t.id}`)} onPointerLeave={() => setHovered(null)}>
                {/* The base plate's footprint IS the hit-target — the diamond's six-point
                    outline, the mesh's own silhouette (M294): a click on empty plate
                    selects the island; a double-click fits the camera to it. */}
                <polygon className="orch__platform-hit" data-orch-platform-hit={t.id} points={pp.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="transparent"
                  onClick={() => onFocusPlatform(t.id)} onDoubleClick={() => { onFocusPlatform(t.id); fitPlatform(t.id) }} />
                <PlatformPlate p={pp.p} cx={pp.x} y={pp.label.y} w={pp.w} level={pp.level} focused={focusedIsOn(t.id)} selected={focusedIsOn(t.id) && selectedId === null}
                  onFocus={(id) => onFocusPlatform(id)} onFit={(id) => { onFocusPlatform(id); fitPlatform(id) }} />
              </g>
            )
          }
          const n = projected.find((x) => x.id === t.id)!
          return (
            <g key={n.id} className="orch__callout-host" data-ghost={props.memberIds !== null && !props.memberIds.includes(n.id) || undefined}
              data-lensed={lensedOut(n.id) || undefined}
              onPointerEnter={() => setHovered(n.id)} onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(n.id)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovered(null) }}
              tabIndex={0}
              aria-label={`${n.title} — ${n.object.kind}`}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || e.key !== 'Enter') return
                // Enter INSPECTS: it selects (never toggles off) and the page-level
                // handler then hands the keyboard to the inspector's Open on canvas.
                if (!isSelected(n.id)) onSelect(n.id)
              }}>
            <IsoCube
              node={n}
              band={n.band}
              labelOffset={{ x: 0, y: 0 }}
              selected={isSelected(n.id)}
              attention={attentionOf(n, isSelected(n.id))}
              objectKind={n.object.kind}
              nameTier={nameTierOf(n)}
              pitchPx={platformOf(n.object.platformId)?.pitchPx ?? 80}
              {...(wash !== null && wash.ids.includes(n.id) ? { wash } : {})}
              onSelect={onSelect}
              onJump={onJump}
              onOverflow={() => undefined}
            />
            </g>
          )
        })}
        {projected.filter((n) => offsets.has(n.id)).map((n) => (
          <g key={`callout-${n.id}`} className="orch__callout-wrap" onPointerEnter={() => setHovered(n.id)} onPointerLeave={() => setHovered(null)}>
            <CubeCallout node={n} offsetX={offsets.get(n.id)!.x} offsetY={offsets.get(n.id)!.y} below={below.has(n.id)} drift={n.drift} band={n.band} expanded={expanded(n.id) && !compact.has(n.id)}
              task={props.workItems.find((w) => w.panelId === n.id)?.title} onSelect={onSelect} onJump={onJump}
              onInterrupt={props.onInterrupt && props.canInterrupt(n.id) ? props.onInterrupt : undefined} />
          </g>
        ))}
        <EdgePackets edges={authored} fires={props.fires} points={points} />
      </svg>
    </div>
      {/* M292. Screen-aligned orientation: breadcrumb, Fit all / Fit selected / Back, the minimap.
          M298: a RAIL beside the scene, not a corner over it — measured at the app's default
          window, the stacked corner tools covered a plate or a label in every fixture (one to
          three of them), because a composition that fills the panel has no empty corner. The
          rail's width is the fit's to lose at wide windows (11% at 1128 px) and nothing at the
          default and narrow ones, where the fit is height-bound. */}
      <div className="orch__scene-tools" data-orch-scene-tools>
        <nav className="orch__crumbs" aria-label="Selection breadcrumb" data-orch-crumbs>
          <button type="button" className="orch__crumb" data-orch-crumb="all" {...shellControl(() => { onFocusPlatform(null); fitAll() })}>All work</button>
          {focusedPlatform !== null && <><span className="orch__crumb-sep" aria-hidden="true" />
            <button type="button" className="orch__crumb" data-orch-crumb="platform" title={focusedPlatform.label} {...shellControl(() => fitPlatform(focusedPlatform.id))}>{focusedPlatform.label}</button></>}
          {selectedObject !== null && <><span className="orch__crumb-sep" aria-hidden="true" />
            <span className="orch__crumb orch__crumb--leaf" data-orch-crumb="object">{selectedObject.title} · {selectedObject.kind}</span></>}
        </nav>
        {props.webgl === 'unavailable' && (
          <p className="orch__caption orch__webgl-notice" data-orch-webgl-notice role="status">3D is unavailable here (no WebGL context) — the scene is flat, and every action is the same.</p>
        )}
        <div className="orch__scene-buttons" role="toolbar" aria-label="Camera">
          <button type="button" className="orch__mini" data-orch-fit="all" title="Fit every platform in view" {...shellControl(fitAll)}>Fit all</button>
          <button type="button" className="orch__mini" data-orch-fit="selected" disabled={focusedPlatform === null && selectedObject === null} title="Fit the selected island in view" {...shellControl(() => { const id = selectedObject?.platformId ?? focusedPlatform?.id; if (id !== undefined) fitPlatform(id) })}>Fit selected</button>
          <button type="button" className="orch__mini" data-orch-camera-back disabled={historyDepth === 0} title="Back to the previous camera" {...shellControl(back)}>Back</button>
        </div>
        <Minimap platforms={platforms} cam={cam} stage={stage} onCentre={centreOn} />
      </div>
    </>
  )
}

/**
 * M293. WebGL can go two ways: the context never comes (a headless GPU, a
 * blocked driver, a harness that denies it) — probed BEFORE the island mounts,
 * by asking a scratch canvas — or it is lost while running. Either way the
 * view flips to the flat SVG bodies and says so; every action was on the
 * SVG hit-targets all along, so nothing is lost but the lighting.
 */
class WebglBoundary extends Component<{ onLost: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true } }
  override componentDidCatch(): void { this.props.onLost() }
  override render(): ReactNode { return this.state.failed ? <div className="orch__cube-canvas" aria-hidden="true" /> : this.props.children }
}

export function orchWebglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    if (gl === null) return false
    const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')
    ext?.loseContext()
    return true
  } catch {
    return false
  }
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
  const { panels, workItems, templates = [], displayName, onJumpPanel, onJumpWorkItem, onInterrupt, onMarkDone, onFocusRelated, onOpenFiles, onOpenPath, onShowCanvas, taskMemberIds, taskMembersOf, onAnswer, onReviewOnCanvas, orchestrate, onOrchestrate, onPatchWorkItem, taskHandoffOf, onRefreshTaskHandoffs, automationResults, onRetryOnCanvas, onContinueOnBackend, backendsAvailable, workspaceName, onSend, onSaveArrangement, initialSelectedId, onSelectionChange } = props
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
  // What IS carried is the selection on screen a moment ago — the canvas's, handed in
  // as `initialSelectedId` and seeded below once the roster exists — never this page's
  // own from an earlier visit, so the target is always the one being looked at.
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
  // Brief #17. Reading mode: the workbench takes the working area. In memory
  // only — a relaunch returns to the scene, which is where the page starts.
  const [benchReading, setBenchReading] = useState(false)
  useEffect(() => { if (!benchOpen) setBenchReading(false) }, [benchOpen])
  useEffect(() => {
    if (!benchReading) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      // Esc in a field (a commit message) is the field's; leaving the mode waits for it.
      if (t !== null && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      setBenchReading(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [benchReading])
  // The pin is a DESCRIPTOR (which session, which task), never a frozen subject: a task
  // pinned before its lane existed must read the lane once it does (the critic).
  const [benchPin, setBenchPin] = useState<{ kind: 'session'; id: string } | { kind: 'task'; itemId: string } | null>(null)
  const [benchRefresh, setBenchRefresh] = useState(0)
  useEffect(() => onChatTurnEnd(() => setBenchRefresh((n) => n + 1)), [])
  /**
   * M301 (the critic's finding 1 and 2). RECONCILIATION'S OWN TICK.
   *
   * The liveness reads used to key off `benchRefresh`, whose ONLY writer is
   * `onChatTurnEnd` — so the page re-asked main exactly once per finished chat
   * turn. Two failures fell out of that, in opposite directions:
   *
   * - The Electron check's "after the kill" read was pre-kill data, because
   *   the workbench's Refresh bumps the STRIP's own counter and never reaches
   *   here. The check could not have failed.
   * - Worse in the app: restored chats create their sessions asynchronously,
   *   so a launch straight onto this page could read `agentSession.list()`
   *   before they land, mark every restored conversation `no session`, and
   *   then never re-ask until somebody sent a message. A confident, dated
   *   sentence about a session that is perfectly alive is the same lie this
   *   milestone exists to stop, pointed the other way.
   *
   * So the reconciliation has its own trigger, and three things move it: a
   * chat turn ending, any agent STATE transition (which is what a session
   * starting, dying or changing hands actually emits), and the person's own
   * Refresh in the workbench.
   */
  const [reconcileTick, setReconcileTick] = useState(0)
  const reconcile = useCallback(() => setReconcileTick((n) => n + 1), [])
  useEffect(() => onAgentTransition(reconcile), [reconcile])
  useEffect(() => { setOrchPrefs({ workbench: { tab: benchTab, height: benchHeight, open: benchOpen } }) }, [benchTab, benchHeight, benchOpen])
  // M288. Which island the inspector and the workbench are about (null = the
  // canvas's focused task, Phase A's pick), the islands' presentation order
  // (seeded from the workspace record, appended-only) and the undo stack of
  // presentation moves — a move changes this array and nothing else.
  const [focusIslandId, setFocusIslandId] = useState<string | null>(null)
  const [islandsOpen, setIslandsOpen] = useState(false)
  // #18. The secondary sections fold; the task, the scene and the workbench do not.
  const [poolOpen, setPoolOpenState] = useState(() => getOrchPrefs().poolOpen)
  const [feedOpen, setFeedOpenState] = useState(() => getOrchPrefs().feedOpen)
  const setPoolOpen = (open: boolean): void => { setOrchPrefs({ poolOpen: open }); setPoolOpenState(open) }
  const setFeedOpen = (open: boolean): void => { setOrchPrefs({ feedOpen: open }); setFeedOpenState(open) }
  const [islandOrder, setIslandOrder] = useState<readonly string[]>(() => getOrchPrefs().islands)
  const [orderHistory, setOrderHistory] = useState<readonly (readonly string[])[]>([])
  useEffect(() => { setOrchPrefs({ islands: islandOrder }) }, [islandOrder])
  // M289. The dependency lens: on, the lit set is the selection's dependency
  // closure and everything else dims in place. Read-only by construction.
  const [depFocus, setDepFocus] = useState(false)
  // M290. The retry PREVIEW, by panel id; nothing is sent from this page.
  const [retryFor, setRetryFor] = useState<string | null>(null)
  // M319. The cross-backend hand-off: which chat, to which backend, and the
  // draft as the person has edited it (null until they touch it — the draft
  // then follows the target they pick).
  const [handoffFor, setHandoffFor] = useState<string | null>(null)
  const [handoffTo, setHandoffTo] = useState<AgentBackend | null>(null)
  const [handoffEdit, setHandoffEdit] = useState<string | null>(null)
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
  // M318. Information vs intervention: the feed can narrow to what needs a person.
  const [interveneOnly, setInterveneOnly] = useState(false)
  const [pipelineStage, setPipelineStage] = useState<WorkItemState | null>(null)
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

  const activity = useSyncExternalStore(
    subscribeOrchActivity,
    orchActivityEvents,
    orchActivityEvents
  )

  // M301. Main's answer to "which agent sessions exist", on the same tick the
  // strip's other reads take. Null until it lands, which keeps pre-M301
  // behaviour rather than flashing `unknown` across the page.
  const liveSessions = useLiveSessions(benchRefresh + reconcileTick)
  const lastSeen = useLastSeen(benchRefresh + reconcileTick)
  /**
   * M301. The selected object's reconciled standing, from the SAME two facts
   * the model uses — main's session list and the record's last sighting — so
   * the card's sentence and the scene's word can never disagree. Null while
   * main has not answered: an unreconciled page says nothing rather than
   * something it has not checked.
   */
  const selectedStandingOf = useCallback((id: string, agentic: boolean): Standing | null => {
    if (liveSessions === null) return null
    const p = panels.find((x) => x.rect.id === id)
    // MEASURED: this used the CHAT rule for every object, so a reconciled
    // terminal read `no session` in the scene and `never-started` on its card
    // — two answers to one question, from two copies of the rule. It is one
    // rule now, the same `panelsToInput` applies: a chat's persisted session
    // id, or, for a terminal, the record's own sighting that it ever ran.
    // The same one rule the scene applies, including its refusal to claim
    // anything about a terminal the record cannot speak for.
    const isChat = p !== undefined && isChatPanel(p)
    const hadSession = isChat ? p.chat.sessionId !== undefined : lastSeen?.get(id) !== undefined
    if (!isChat && agentic && lastSeen?.get(id) === undefined) return null
    const fact = liveSessions.get(id)
    const state = getAgentState(id)
    return standingOf({
      agentic, liveSession: fact?.live === true, hadSession,
      // The runtime's word, so a LIVE session reads `live` and not `starting`
      // — the first version left this out and every live agent's card said
      // "the session is live and has not reported yet", forever.
      ...(state === undefined ? {} : { agentState: state }),
      // The exit is carried whether or not the runtime still holds the
      // session: on a LIVE one it words "the process is down, the
      // conversation resumes", and on a gone one it words how it ended.
      ...(fact?.exit === undefined ? {} : { exit: fact.exit }),
      ...(lastSeen?.get(id) === undefined ? {} : { lastSeen: lastSeen.get(id) })
    })
  }, [liveSessions, lastSeen, panels])
  const liveSnap = useMemo(() => buildOrchestrationSnapshot({
    panels: panelsToInput(panels, templates, liveSessions, lastSeen),
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
  }), [panels, workItems, templates, liveSessions, lastSeen, total.cpuPercent, total.memoryBytes, displayName, tick, now])

  // Navigation hierarchy: seed ONCE per mount from the canvas's selection, and only a
  // roster row — a canvas note or terminal has no session here to aim commands at, so
  // one that belongs to a task hands over that task's session instead.
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true
    if (initialSelectedId == null) return
    if (liveSnap.roster.some((r) => r.id === initialSelectedId)) { setSelectedIds([initialSelectedId]); return }
    // The TASK carries even when the selection itself has no row here: a
    // task's card, note or file selected on the canvas opens Orchestrate on
    // that task's first session, not on nothing — switching places must not
    // cost a person the task they were in. One task only; a member of two is
    // ambiguous, and a guess would aim commands at the wrong one.
    const owners = workItems.filter((w) => (taskMembersOf?.(w.id) ?? []).includes(initialSelectedId))
    if (owners.length !== 1) return
    const session = (taskMembersOf?.(owners[0]!.id) ?? []).find((id) => liveSnap.roster.some((r) => r.id === id))
    if (session !== undefined) setSelectedIds([session])
  }, [initialSelectedId, liveSnap.roster, workItems, taskMembersOf])
  // Reported back so the title bar names the task of what is selected HERE, and the
  // return to the canvas can keep it. A ref: the caller passes a fresh arrow each render.
  const onSelectionChangeRef = useRef(onSelectionChange)
  onSelectionChangeRef.current = onSelectionChange
  useEffect(() => {
    onSelectionChangeRef.current?.(selectedIds.length === 1 ? selectedIds[0]! : null)
  }, [selectedIds])

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
  // M315. The task's JOURNEY stage, not only the board's column. The board's
  // `review` means a pull request exists, so a local task whose agent had
  // finished read "Working" here while the canvas's guide said "Ready to
  // review" about the same lane. Settled changes in the lane are the review
  // step; an accepted (merged) task is done.
  const islandStage = ((): string | undefined => {
    if (island === null) return undefined
    const h = island.itemId === undefined ? undefined : taskHandoffOf?.(island.itemId)
    if (h?.state === 'accepted') return WORK_ITEM_STATES[3]
    if ((island.state === WORK_ITEM_STATES[0] || island.state === WORK_ITEM_STATES[1]) && (h?.state === 'ready' || h?.state === 'shared')) return WORK_ITEM_STATES[2]
    return island.state
  })()
  const islandIds = useMemo(() => islands.map((i) => i.id), [islands])
  const orderedIds = useMemo(() => orchIslandOrder(islandOrder, islandIds), [islandOrder, islandIds])
  // Append-only: the order state learns new ids and forgets gone ones, never re-sorts.
  useEffect(() => { if (orderedIds.join('\n') !== islandOrder.join('\n')) setIslandOrder(orderedIds) }, [orderedIds, islandOrder])
  const islandGroups = useMemo(() => orchIslandGroups(islands, orderedIds), [islands, orderedIds])
  // M291. The platform scene: one platform per island in presentation order,
  // every roster object and file on the platform whose directory owns it, the
  // rest on the workspace plate. `homeOf` reads the same facts the islands do.
  const platforms: OrchPlatform[] = useMemo(() => orchPlatforms({
    islands, order: orderedIds, roster: liveSnap.roster, files: liveSnap.files, focusedId: focusIslandId,
    homeOf: (id) => {
      const live = getLiveSession(id)?.cwd
      if (live !== undefined && live !== '') return live
      const p = panels.find((x) => x.rect.id === id)
      if (p === undefined) return undefined
      if (isChatPanel(p)) return p.chat.cwd
      if (isTerminalPanel(p)) return p.spec.cwd
      if (isWatcherPanel(p)) return p.watch.cwd
      if (isFilePanel(p)) return p.source.path.slice(0, Math.max(0, p.source.path.lastIndexOf('/')))
      return undefined
    }
  }), [islands, orderedIds, liveSnap.roster, liveSnap.files, focusIslandId, panels])
  const sceneObjects = useMemo(() => orchSceneObjects(platforms), [platforms])
  const sceneObjectsRef = useRef(sceneObjects)
  sceneObjectsRef.current = sceneObjects
  // M293. WebGL is PROBED before the island mounts (a scratch context), and a
  // context lost at runtime flips the same flag through the boundary. Either
  // way the scene paints flat SVG bodies and says so; no action depends on it.
  const [webgl, setWebgl] = useState<'ready' | 'unavailable'>(() => (orchWebglAvailable() ? 'ready' : 'unavailable'))
  // M292. Quality from MEASURED frame time: the scene reports its frames, and a
  // tier steps down when the mean of the last window exceeds the budget and
  // back up when it has been comfortably under it for a while (hysteresis, so
  // the bloom does not flicker on and off at the edge). Object count alone
  // decides nothing — it is the frame, not the number, that stalls.
  const [quality, setQuality] = useState<'full' | 'lean' | 'flat'>('full')
  const frameSamples = useRef<number[]>([])
  useEffect(() => {
    if (webgl !== 'ready') return
    let raf = 0
    let last = performance.now()
    const tick = (now: number): void => {
      const dt = now - last
      last = now
      // Only frames the compositor actually painted count; an idle demand-mode
      // scene yields long gaps that are not "slow frames".
      if (dt < 250) frameSamples.current = [...frameSamples.current.slice(-59), dt]
      const samples = frameSamples.current
      if (samples.length >= 30) {
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length
        // The harness pins a tier to measure the same fixture with and without
        // the quality work (`window.__tcOrchQuality`); the app never sets it.
        const pinned = (window as unknown as { __tcOrchQuality?: unknown }).__tcOrchQuality
        setQuality((q) => (pinned === 'full' || pinned === 'lean' || pinned === 'flat' ? pinned : orchQualityStep(q, mean)))
        ;(window as unknown as { __tcOrchFrame?: number }).__tcOrchFrame = mean
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [webgl])
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
  // Named apart from M299's `selectedStanding`, which is the RUN's standing
  // (a turn's phase and spend). This one is about whether a session exists at
  // all — two different facts that the page shows in the same card.
  const selectedReconcile = selectedRow === null ? null : selectedStandingOf(selectedRow.id, selectedRow.agentic)
  const outputPanelId = selectedRow !== null
    ? selectedRow.id
    : liveSnap.terminalSnippet?.panelId ?? null
  const outputKind = selectedRow?.kind ?? (liveSnap.terminalSnippet ? 'terminal' : undefined)
  // Always pulled: the workbench's Output tab shows this tail (M299: the Terminal tile is gone).
  const outputLines = useOrchOutput(outputPanelId, outputKind, true)

  // M284. Scene | List — the same objects and the same actions, the list being the
  // keyboard (and reduced-motion, and no-WebGL) way to reach every one of them.
  const [lens, setLens] = useState<OrchLens>(() => getOrchPrefs().lens)
  useEffect(() => { setOrchPrefs({ lens }) }, [lens])
  const lensRef = useRef(lens)
  lensRef.current = lens
  // M304. The Watch lens's model, built only while Watch is showing: every roster
  // session's tool calls (chats) or live command (terminals), scrubbed through
  // outward() before a single character can reach a texture (orchestration-live.ts's
  // header). Re-derived when any chat changes (useChatsVersion) or the clock ticks
  // (a terminal's command has no store version of its own here).
  const chatsVersion = useChatsVersion()
  const liveIslands = useMemo(() => islands.map((i) => ({ id: i.id, label: i.goal })), [islands])
  const liveModel = useMemo(() => {
    if (lens !== 'watch') return null
    const islandOf = (id: string): string | null => islands.find((i) => i.memberIds.includes(id))?.id ?? null
    const stateOf = (state: string): OrchLiveState => state === 'busy' || state === 'starting' || state === 'running' || state === 'watching' ? TONE_WORKING
      : state === 'wants-you' ? 'needs-you' : state === 'exited' || state === 'unknown' ? 'exited' : 'idle'
    const inputs: OrchLiveSessionInput[] = liveSnap.roster
      .filter((r) => r.kind !== 'file' && r.kind !== 'work')
      .map((r) => {
        const chat = r.kind === 'chat' ? getChat(r.id) : null
        const blocks = chat === null ? [] : [...chat.turns.flatMap((t) => t.blocks), ...(chat.live?.blocks.map((b) => b.block) ?? [])]
        const command = r.kind === 'chat' ? undefined : getLiveSession(r.id)?.currentCommand
        // M311. The checkout the session works in, so Watch keys files by checkout
        // and tells a shared checkout (contention) from separate lanes (overlap).
        const checkout = chat?.snapshot?.cwd ?? getLiveSession(r.id)?.cwd
        return { id: r.id, title: r.title, state: stateOf(r.state), islandId: islandOf(r.id), blocks, ...(command ? { command } : {}), ...(checkout !== undefined && checkout.startsWith('/') ? { checkout } : {}) }
      })
    return buildOrchLive(inputs, (text, id) => outward(text, `panel ${id}`).text)
    // `now` re-reads terminal commands on the view's clock; chatsVersion is every chat's change.
  }, [lens, liveSnap.roster, islands, chatsVersion, now])
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

  /*
   * M302 — SAVED VIEWS. A view is the page's own prefs, named and kept, and
   * it persists through the SAME write every other pref takes; there is no
   * second store and no second door.
   *
   * Applying one sets the layout state and nothing else. It cannot start,
   * stop, retry or select anything — not because this handler is careful but
   * because `OrchSavedView` has no field that names a session, a task or a
   * command. The plan's rule ("saved views record filters, camera and layout,
   * never runtime mutations") is therefore enforced by the record's shape.
   *
   * This also closes Phase A's deferred "Orchestrate prefs are in memory" for
   * the preferences a view owns: they now survive a relaunch in the
   * workspace's record.
   */
  const [savedViews, setSavedViews] = useState<readonly OrchSavedView[]>(() => getOrchPrefs().views)
  const [viewName, setViewName] = useState<string | null>(null)
  const applyView = useCallback((v: OrchSavedView): void => {
    const next = prefsFromView(getOrchPrefs(), v)
    setOrchPrefs(next)
    // The React state follows the prefs, in the same order the page reads them.
    setLens(next.lens)
    setMode(next.mode)
    setTab(next.tab)
    setGraphCamera(next.camera)
    setBenchTab(next.workbench.tab)
    setBenchHeight(next.workbench.height)
    setBenchOpen(next.workbench.open)
  }, [])
  const commitView = useCallback((name: string): void => {
    const trimmed = name.trim()
    if (trimmed === '') return
    const view = viewFromPrefs(getOrchPrefs(), trimmed, `view-${Date.now().toString(36)}`)
    const views = withSavedView(getOrchPrefs().views, view)
    setOrchPrefs({ views })
    setSavedViews(views)
    setViewName(null)
    flushOrchestrate()
  }, [flushOrchestrate])
  const saveView = useCallback((): void => { setViewName('') }, [])

  // M293. The List's rows are EVERY object in the scene — stations, checkpoints
  // and artifacts, each with its platform — in scene order unless a column is
  // chosen; the roster's filter and query still apply (an artifact matches by
  // title). The same selection, the same verbs, the same Open on canvas.
  const [listSort, setListSort] = useState<OrchListSort>({ key: null, dir: 1 })
  const listRows = useMemo(() => {
    const visible = new Set(visibleRoster.map((r) => r.id))
    const q = query.trim().toLowerCase()
    const labelOf = new Map(platforms.map((p) => [p.id, p.label]))
    const rows = sceneObjects
      .filter((o) => o.kind === 'artifact' ? (effectiveFilter === 'all' && (q === '' || o.title.toLowerCase().includes(q))) : visible.has(o.id))
      .map((o) => ({ ...o, platformLabel: labelOf.get(o.platformId) ?? '', tone: toneFromState(o.state) }))
    return orchSortRows(rows, listSort)
  }, [sceneObjects, visibleRoster, query, effectiveFilter, platforms, listSort])
  listOrderRef.current = listRows.map((r) => r.id)

  // M284. Needs attention: the chat store's own pending permissions. A request answered
  // anywhere (Dock, chat, palette, here) leaves the store, so its row leaves with it.
  const pending = useApprovals()
  const [sent, setSent] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => {
    setSent((cur) => { const next = orchPruneSent(cur, pending); return next.size === cur.size ? cur : next })
  }, [pending])
  const titleOf = useCallback((id: string): string => liveSnap.roster.find((r) => r.id === id)?.title ?? id, [liveSnap.roster])
  // #17. The detail shows the action IN FULL and the rest of the input, so
  // both pass the page's gate beside the argument (orch.gate.3) — this page
  // shows nothing a reader here has not scrubbed.
  const islandMemberIds = island?.memberIds
  const attentionRows = useMemo(
    () => orchAttentionRows(pending.map((p) => ({
      ...p,
      argument: outward(p.argument, `panel ${p.id}`).text,
      ...(p.action === undefined ? {} : { action: outward(p.action, `panel ${p.id}`).text }),
      ...(p.rest === undefined ? {} : { rest: outward(p.rest, `panel ${p.id}`).text }),
      ...(p.description === undefined ? {} : { description: outward(p.description, `panel ${p.id}`).text })
    })), titleOf, sent, islandMemberIds ?? []),
    [pending, titleOf, sent, islandMemberIds]
  )
  // #18. One request's detail open at a time, the queue's rule: the person's
  // choice, else the first (the selected task's, by the sort above).
  const [openNeed, setOpenNeed] = useState<string | null | undefined>(undefined)
  // #14. The Dock's rule: while an answer is acknowledged, the next request waits folded.
  const acknowledging = useApprovalOutcomes().length > 0
  const shownNeed = openNeed !== undefined ? openNeed : (acknowledging || attentionRows[0] === undefined ? null : orchAnswerKey(attentionRows[0].id, attentionRows[0].requestId))
  // A session waiting on the user with NO permission pending asked a question: it is
  // answered in its own conversation, so the row says so and opens it.
  const waitingOnly = liveSnap.roster.filter((r) => r.state === 'wants-you' && !pending.some((p) => p.id === r.id))
  const answer = (row: OrchAttentionRow, allow: boolean, scope?: 'session'): void => {
    const key = orchAnswerKey(row.id, row.requestId)
    // Re-read the LIVE queue, not the row: a request answered elsewhere between render
    // and click is gone, and main's own guard would refuse it — say nothing, send nothing.
    if (onAnswer === undefined || sent.has(key) || !pending.some((p) => p.id === row.id && p.requestId === row.requestId)) return
    setSent((cur) => new Set(cur).add(key))
    onAnswer(row.id, row.requestId, allow, scope)
  }

  // M284. The inspector's subject: the selected session, else the island's task.
  const selectedArtifact = selectedRow === null && selectedId !== null ? (liveSnap.files.find((f) => f.id === selectedId) ?? null) : null
  const selectedArtifactWithPlatform = selectedArtifact === null ? null : { ...selectedArtifact, platformId: sceneObjects.find((o) => o.id === selectedArtifact.id)?.platformId ?? ORCH_WORKSPACE_PLATFORM }
  const inspectTask = selectedRow === null && selectedArtifact === null && island !== null
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
  const subjectOfTask = useCallback((itemId: string): BenchSubject | null => {
    const item = workItems.find((w) => w.id === itemId)
    if (item === undefined) return null
    const isl = islands.find((i) => i.itemId === itemId)
    const lane = item.worktreeId === undefined ? undefined : worktrees.find((w) => w.id === item.worktreeId)
    return {
      kind: 'task', itemId, title: item.title, memberIds: isl?.memberIds ?? (taskMembersOf?.(itemId) ?? []),
      ...(lane === undefined ? {} : { lane: { id: lane.id, path: lane.path, root: lane.root, branch: lane.branch } }),
      ...(item.panelId === undefined ? {} : { chatId: item.panelId })
    }
  }, [workItems, islands, worktrees, taskMembersOf])
  const benchPinned: BenchSubject | null = benchPin === null ? null
    : benchPin.kind === 'session'
      ? { kind: 'session', id: benchPin.id, title: liveSnap.roster.find((r) => r.id === benchPin.id)?.title ?? benchPin.id }
      : subjectOfTask(benchPin.itemId) ?? { kind: 'task', itemId: benchPin.itemId, title: benchPin.itemId, memberIds: [] }
  const setBenchPinned = useCallback((s: BenchSubject | null): void => {
    setBenchPin(s === null ? null : s.kind === 'session' ? { kind: 'session', id: s.id } : { kind: 'task', itemId: s.itemId })
  }, [])
  const benchSubject = benchPinned ?? benchCurrent

  /*
   * Brief #18. The focused task's COMPLETION HANDOFF — idle, run ended,
   * reviewed and done kept apart (shared/completion.ts), with what changed,
   * which checks ran, what is open and the next action. Its checks are the
   * workbench's own read for this task, handed up (`onChecks`): when the strip
   * is on another subject they are "not read", said, never re-read here.
   */
  const [benchChecks, setBenchChecks] = useState<{ key: string; checks: readonly CheckRecord[] | null } | null>(null)
  const onBenchChecks = useCallback((key: string, checks: readonly CheckRecord[] | null): void => setBenchChecks({ key, checks }), [])
  const completion: Completion | null = useMemo(() => {
    if (island === null || island.source !== 'work-item' || island.itemId === undefined) return null
    const item = workItems.find((w) => w.id === island.itemId)
    if (item === undefined) return null
    const counts = { active: 0, needsYou: 0, idle: 0, ended: 0 }
    for (const g of orchRosterGroups(liveSnap.roster.filter((r) => island.memberIds.includes(r.id)))) {
      if (g.id === TONE_WORKING) counts.active += g.rows.length
      else if (g.id === 'needs-you') counts.needsYou += g.rows.length
      else if (g.id === 'idle') counts.idle += g.rows.length
      else counts.ended += g.rows.length
    }
    const handoff = taskHandoffOf?.(item.id)
    const taskKey = benchSubjectKey(subjectOfTask(item.id) ?? null)
    const checks = benchChecks !== null && taskKey !== '' && benchChecks.key === taskKey ? benchChecks.checks : null
    const changes = handoff === undefined ? undefined
      : handoff.changes !== undefined ? { files: handoff.changes.files, added: handoff.changes.added, removed: handoff.changes.removed, ...(handoff.changes.shared ? { shared: true } : {}) }
        : handoff.state === 'empty' ? { files: 0, added: 0, removed: 0 } : undefined
    const verification = handoff !== undefined && checks !== null
      ? verificationOf({
        agentWorking: agentWorkingOf(handoff.state), standing: handoff.standing, checks,
        ...(item.comments === undefined ? {} : { comments: item.comments }),
        ...(item.criteria === undefined ? {} : { criteria: item.criteria }),
        ...(item.criteriaMet === undefined ? {} : { criteriaMet: item.criteriaMet })
      })
      : null
    return completionOf({
      board: item.state, sessions: counts, checks, verification,
      reviewedNow: handoff?.standing === 'current',
      ...(changes === undefined ? {} : { changes })
    })
  }, [island, workItems, liveSnap.roster, taskHandoffOf, benchChecks, subjectOfTask])
  const runCompletion = (c: Completion): void => {
    if (island === null) return
    const n = c.next
    if (n.action === 'review') { openBench('changes'); return }
    if (n.action === 'checks') { openBench('checks'); return }
    if (n.action === 'mark-done') { if (island.itemId !== undefined) onMarkDone?.(island.itemId); return }
    const target = island.subjectId ?? island.memberIds[0]
    if (target !== undefined && target !== null) jump(target)
  }

  const stageItems = useMemo(
    () => filterWorkItems(workItems.map((w) => ({
      id: w.id, title: w.title, state: w.state,
      ...(w.panelId !== undefined ? { panelId: w.panelId } : {}),
      ...(w.note !== undefined ? { note: w.note } : {})
    })), pipelineStage),
    [workItems, pipelineStage]
  )

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
      const isArrow = event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowRight'
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
        // After the render the selection just caused, or the button focused is the
        // one React is about to replace (M293: Enter on a scene object).
        window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-orch-inspector] [data-orch-open]')?.focus())
        return
      }
      event.preventDefault()
      // M293. In the SCENE the arrows walk the platforms spatially — the nearest
      // object in that direction, across islands — so every object is reachable
      // without a precision click in 3D; the List keeps its row order.
      const spatial = listRow === null && lensRef.current === 'scene'
      if (spatial) {
        const step = orchSpatialStep(sceneObjectsRef.current, primary, event.key as OrchArrow)
        if (step === null) return
        select(step.id, { range: event.shiftKey })
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLElement>(`.orch__callout-host [data-node="${CSS.escape(step.id)}"]`)?.parentElement?.focus({ preventScroll: true })
        })
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') return
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
  // M319. The three stops for the selected chat, and the hand-off draft.
  const selectedStops = selectedRow === null ? null : orchStops({
    kind: selectedRow.kind, state: selectedState, queued: selectedChat.snapshot?.queued ?? 0,
    ...(backendOf(selectedRow.id) === undefined ? {} : { backend: backendOf(selectedRow.id)! }),
    ...(selectedChat.snapshot === null ? {} : { processUp: selectedChat.snapshot.pid !== undefined })
  })
  const handoffFrom = handoffFor !== null && selectedRow !== null && handoffFor === selectedRow.id ? backendOf(handoffFor) : undefined
  const handoffTargets = handoffFrom === undefined ? [] : BACKEND_IDS.filter((b) => b !== handoffFrom && backendsAvailable?.[b] !== false)
  const handoffTarget = handoffTo !== null && handoffTargets.includes(handoffTo) ? handoffTo : handoffTargets[0]
  const handoffItem = island?.itemId === undefined ? undefined : workItems.find((w) => w.id === island.itemId)
  const handoffDraft = handoffFrom === undefined || handoffTarget === undefined || selectedRow === null ? null : backendHandoff({
    from: handoffFrom, to: handoffTarget,
    title: handoffItem?.title ?? selectedRow.title,
    ...(handoffItem?.brief === undefined ? {} : { brief: handoffItem.brief }),
    ...(handoffItem?.criteria === undefined ? {} : { criteria: handoffItem.criteria }),
    ...(selectedLive?.cwd === undefined || selectedLive.cwd === '' ? {} : { cwd: selectedLive.cwd }),
    turns: selectedChat.turns.map((t): HandoffTurn => ({ role: t.role === 'user' ? 'user' : 'assistant', text: t.blocks.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n') }))
  })
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
  // M299. The card's role line and the criteria rows read what exists: the registry's
  // backend id for a chat, and the work item's own criteria — never a verdict, which no
  // criterion carries (checks live in the workbench, read from the ledger).
  const selectedBackend = selectedRow !== null && selectedRow.kind === 'chat' ? backendOf(selectedRow.id) : undefined
  const islandCriteria: readonly string[] = island?.itemId !== undefined ? (workItems.find((w) => w.id === island.itemId)?.criteria ?? []) : []
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
        <span className="orch__island-place" data-orch-island-place title={orchPlacementLine(isl)}>{floating ? orchPlacementLine({ ...isl, writers: 0 }) : orchPlacementLine(isl)}</span>
      </button>
    )
  }
  const islandColumn = (floating: boolean): JSX.Element | null => {
    if (islands.length === 0) return null
    if (islands.length === 1 && orderHistory.length === 0) return floating ? null : islandCard(islands[0]!, floating)
    // In the SCENE the column rests folded: the focused island's card, the same size as
    // Phase A's one card, and a one-line toggle — an open column covered the ring's back
    // cubes, their needs-you beacons and their callouts (the critic, three scenes). The
    // List always shows it whole.
    const folded = floating && !islandsOpen
    if (folded) {
      // M291. In the scene the island CARD is the platform's own label plate,
      // so at rest the column is only its toggle: the folded floating card
      // Phase C fought the critic over would now say the same thing twice.
      return (
        <div className="orch__islands--rest" data-orch-islands data-orch-island-order={orderedIds.join(' ')} role="group" aria-label="Task islands">
          <button type="button" className="orch__mini orch__islands-toggle" style={floatStyle} data-orch-islands-toggle aria-expanded={false} title="Show every island, grouped by repository" {...shellControl(() => setIslandsOpen(true))}>{`${islands.length} islands ▾`}</button>
        </div>
      )
    }
    return (
      <div className={floating ? 'orch__float orch__float--task orch__islands' : 'orch__islands orch__islands--static'} style={floating ? floatStyle : undefined} data-orch-islands data-orch-islands-open="" data-orch-island-order={orderedIds.join(' ')} role="group" aria-label="Task islands">
        <div className="orch__section-head orch__islands-head">
          {floating
            ? <button type="button" className="orch__mini" data-orch-islands-toggle aria-expanded={true} {...shellControl(() => setIslandsOpen(false))}>{`${islands.length} islands ▴`}</button>
            : <span className="orch__section-title">{islands.length} islands</span>}
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
    <div className="orch" role="region" aria-label="Orchestration" data-orch-reading={benchReading || undefined}>
      <header className="orch__header">
        {/* M305. The TASK HEADER replaces M299's title row, its four count tiles, the
            blocker strip and the loose command row. One object: what the task is (its
            goal, as the page's title), where it runs, how far along it is (the board's
            own four words as a rail — never a fifth), what blocks it, and what to do.
            The counts did not vanish: they are the roster's group headers now, where
            each one sits beside the sessions it counts, and a group with nothing in it
            is not drawn (a rest fact is never a zero-value statement). */}
        <div className="orch__task-head">
          <div className="orch__task-id">
            <span className="orch__eyebrow">
              Orchestrate{workspaceName !== undefined && workspaceName !== '' && <span className="orch__title-scope"> / {workspaceName}</span>}
              {island !== null && <> · {island.source === 'work-item' ? 'Task' : 'Session · no task yet'}{island.repository !== null ? ` · ${island.repository}` : ''}</>}
            </span>
            <h1 className="orch__title" data-orch-title>{island !== null ? island.goal : 'Orchestrate'}</h1>
            {island !== null && (
              <p className="orch__context" data-orch-context={island.placement.kind}>
                <span className="orch__context-place">{orchPlacementLine(island)}</span>
                {/* The textual truth. It reads liveSnap — never the lens, frame or ring
                    cap — so the scene below may illustrate it but can never hide it. */}
                {blocker !== null && <span id="orch-blocker" className="orch__blocker" data-orch-blocker={blocker.kind} data-orch-density="contextual">{blocker.line}</span>}
              </p>
            )}
            {island === null && blocker !== null && (
              <p className="orch__context"><span id="orch-blocker" className="orch__blocker" data-orch-blocker={blocker.kind} data-orch-density="contextual">{blocker.line}</span></p>
            )}
          </div>
          {island !== null && island.source === 'work-item' && (
            <ol className="orch__phases" aria-label="Task stage" data-orch-phase={islandStage}>
              {WORK_ITEM_STATES.map((st, i) => {
                const at = WORK_ITEM_STATES.indexOf(islandStage as WorkItemState)
                const place = at < 0 ? 'next' : i < at ? 'done' : i === at ? 'now' : 'next'
                return (
                  <li key={st} className="orch__phase" data-place={place} aria-current={place === 'now' ? 'step' : undefined}>
                    <span className="orch__phase-dot" aria-hidden="true" />{st === 'todo' ? 'To do' : st.charAt(0).toUpperCase() + st.slice(1)}
                  </li>
                )
              })}
            </ol>
          )}
          <div className="orch__task-actions" data-orch-commands={commands.length > 0 ? '' : undefined} role="toolbar" aria-label="Task and selection commands">
            {commands.map((cmd) => (
              <button key={cmd.id} type="button" className="orch__command" data-orch-command={cmd.id} title={cmd.label} {...shellControl(() => runCommand(cmd.id))}>
                {cmd.label}
              </button>
            ))}
            {reviewSubjectId !== null && (
              <button type="button" className="orch__command is-primary" data-orch-review-primary {...shellControl(() => openBench('changes'))}>Review changes</button>
            )}
          </div>
        </div>
        {/* Brief #18. The handoff: a small state change, not a celebration — its
            outcome word, what it means, the four facts, and the one next verb. */}
        {completion !== null && (
          <section className="orch__handoff" data-orch-completion={completion.outcome} aria-label="Where this task stands" aria-live="polite">
            <div className="orch__handoff-head">
              <strong className="orch__handoff-word">{completion.word}</strong>
              <span className="orch__handoff-meaning">{completion.meaning}</span>
            </div>
            <dl className="orch__handoff-facts">
              <div><dt>Changed</dt><dd data-orch-handoff-changed>{completion.changed}</dd></div>
              <div><dt>Checks</dt><dd data-orch-handoff-checks>{completion.checks}</dd></div>
              <div><dt>Open</dt><dd data-orch-handoff-open={completion.unresolved.length}>{completion.unresolved.length === 0 ? 'Nothing unresolved' : completion.unresolved.join(' · ')}</dd></div>
            </dl>
            {/* M315. Not a second "review the changes" beside the header's filled
                Review changes — the page offered the same verb four times. */}
            {completion.next.action !== 'none' && !(completion.next.action === 'review' && completion.next.label === 'Review the changes' && reviewSubjectId !== null) && (
              (completion.next.action !== 'mark-done' || onMarkDone !== undefined) && (
                <button type="button" className="orch__command" data-orch-handoff-next={completion.next.action} {...shellControl(() => runCompletion(completion))}>{completion.next.label}</button>
              )
            )}
          </section>
        )}
      </header>

      <div className={`orch__body${poolOpen ? '' : ' orch__body--pool-closed'}`}>
        <aside className="orch__roster" aria-label="Agent pool" data-orch-pool-open={poolOpen ? '' : undefined}>
          <div className="orch__section-head">
            <button type="button" className="orch__section-title orch__fold" data-orch-pool-toggle aria-expanded={poolOpen}
              title={poolOpen ? 'Fold the agent pool away' : 'Show the agent pool'}
              {...shellControl(() => setPoolOpen(!poolOpen))}>
              {poolOpen ? 'Agent pool' : `Pool · ${liveSnap.roster.length}`}
            </button>
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
            // M305. Grouped by STATE, in the order a person scans: what is working, what
            // waits on them, what is idle, what has ended. A group with nothing in it is
            // not drawn, and its count is the header — the tiles' counts, beside the
            // sessions they count. Working and Needs you headers are the metric lens's
            // door (the tiles' click since M269): press to light those in the scene.
            <div className="orch__roster-groups" data-orch-roster>
              {orchRosterGroups(visibleRoster).map((g) => (
                <section key={g.id} className="orch__roster-group" data-orch-roster-group={g.id}>
                  {g.metric !== null ? (
                    <button type="button" className="orch__group-head" aria-pressed={metric === g.metric} title={`Light the ${g.label.toLowerCase()} sessions in the scene`} {...shellControl(() => applyMetric(g.metric!))}>
                      <span>{g.label}</span><span className="orch__group-count">{g.rows.length}</span>
                    </button>
                  ) : (
                    <div className="orch__group-head"><span>{g.label}</span><span className="orch__group-count">{g.rows.length}</span></div>
                  )}
                  <ul className="orch__roster-list">
                    {g.rows.map((row) => (
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
                </section>
              ))}
            </div>
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
            <span className="orch__lens" role="group" aria-label="Scene, watch or list">
              {(['scene', 'watch', 'list'] as const).map((l) => (
                <button key={l} type="button" className={`orch__tab${lens === l ? ' orch__tab--on' : ''}`} aria-pressed={lens === l}
                  data-orch-lens={l} title={l === 'watch' ? 'Watch the sessions work — files as towers, writes and commands as they happen' : undefined}
                  {...shellControl(() => setLens(l))}>{l === 'scene' ? 'Scene' : l === 'watch' ? 'Watch' : 'List'}</button>
              ))}
            </span>
            {/* M302. SAVED VIEWS — filters, camera and layout, and nothing else.
                Opening one starts nothing, and that is a fact about the RECORD
                (shared/orchestrate-prefs.ts's OrchSavedView holds no session,
                task, command or verb), not a promise about this handler. */}
            <span className="orch__lens" role="group" aria-label="Saved views" data-orch-views={savedViews.length}>
              {savedViews.map((v) => (
                <button key={v.id} type="button" className="orch__tab" data-orch-view={v.id}
                  title={`show this workspace's ${v.name} view — filters, camera and layout only; it starts nothing`}
                  {...shellControl(() => applyView(v))}>{v.name}</button>
              ))}
              {viewName === null ? (
                <button type="button" className="orch__tab" data-orch-view-save
                  title="save the current lens, camera and workbench layout as a named view"
                  {...shellControl(saveView)}>Save view</button>
              ) : (
                /* An inline name, never window.prompt: a modal dialog from the
                   renderer blocks every IPC answer in flight, and Electron
                   disables it anyway. Enter saves, Escape abandons. */
                <input className="orch__view-name" data-orch-view-name autoFocus value={viewName}
                  placeholder="name this view" aria-label="Name this view"
                  onChange={(e) => setViewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitView(viewName) }
                    if (e.key === 'Escape') { e.preventDefault(); setViewName(null) }
                  }}
                  onBlur={() => setViewName(null)} />
              )}
            </span>
          </div>

          <div className="orch__graph-wrap" data-orch-island-order={orderedIds.join(' ')}>
            {lens === 'list' ? (
              // M284. The List is the scene's equal, not a summary of it: every roster
              // object, the island's members first and marked, each one a real button in
              // the tab order (Arrow keys move the selection, Enter opens on canvas — the
              // page's own keyboard model), and the inspector beside it carries every
              // action the scene's selection does.
              <div className="orch__list" data-orch-list role="region" aria-label="Sessions list">
                {islandColumn(false)}
                <table className="orch__list-table" data-orch-list-sort={listSort.key ?? ''} data-orch-list-dir={listSort.dir === 1 ? 'asc' : 'desc'}>
                  <thead>
                    <tr>
                      {([['name', 'Name'], ['kind', 'Kind'], ['state', 'State'], ['island', 'Island']] as const).map(([key, label]) => (
                        <th key={key} scope="col" aria-sort={listSort.key === key ? (listSort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                          <button type="button" className="orch__list-sort" data-orch-list-sort-by={key} title={`Sort by ${label.toLowerCase()}`} {...shellControl(() => setListSort((cur) => orchNextSort(cur, key as OrchListSortKey)))}>
                            {label}
                          </button>
                        </th>
                      ))}
                      <th scope="col">Next</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map((row) => {
                      const next = row.kind === 'artifact'
                        ? { verb: 'open' as const, label: 'Open on canvas to read or edit it' }
                        : orchNextAction({ state: row.state, kind: row.panelKind, ...(pending.some((p) => p.id === row.id) ? { pendingTool: pending.find((p) => p.id === row.id)!.toolName } : {}) })
                      const inIsland = island?.memberIds.includes(row.id) === true
                      return (
                        <tr key={row.id} data-orch-list-row={row.id} data-orch-list-kind={row.kind} data-selected={selectedIds.includes(row.id) || undefined}>
                          <td>
                            <button type="button" className="orch__list-name" aria-pressed={selectedIds.includes(row.id)}
                              {...shellControl(() => select(row.id))} onDoubleClick={() => jump(row.id)}>
                              <span className="orch__dot status-dot" data-tone={row.tone} aria-hidden="true" />
                              {row.title}{inIsland && <span className="orch__list-tag">in task</span>}
                            </button>
                          </td>
                          <td>{row.kind === 'station' ? row.panelKind : `${row.kind} · ${row.panelKind}`}</td>
                          <td>{row.kind === 'artifact' ? 'file' : stateWord(row)}</td>
                          <td className="orch__list-island" title={row.platformLabel}>{row.platformLabel}</td>
                          <td className="orch__list-next" data-verb={next.verb}>{next.label}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {visibleRoster.length === 0 && <EmptyState id="orch-roster" onVerb={onShowCanvas} />}
              </div>
            ) : lens === 'watch' && liveModel !== null ? (
              webgl === 'ready' ? (
                <Suspense fallback={<div className="orch-live orch-live--loading" data-orch-live-loading />}>
                  <OrchestrationLive model={liveModel} islands={liveIslands} primaryIslandId={island?.id ?? null}
                    selectedId={selectedId} quality={quality} onSelect={(id) => select(id)} onJump={jump}
                    // M311. A shared write's review path: a contended file selects
                    // its first writer and opens Changes; an overlap opens Combine.
                    onFileAction={(kind, f) => {
                      if (kind === 'contended' && f.writers[0] !== undefined) { select(f.writers[0]); setBenchTab('changes') } else setBenchTab('combine')
                      setBenchOpen(true)
                    }} />
                </Suspense>
              ) : (
                // Watch is three.js or nothing; without WebGL the List is the same sessions, by name.
                <div className="orch-live orch-live--fallback" data-orch-live-fallback>
                  <p>Watch needs WebGL, which this window can't use. The List shows the same sessions and their state.</p>
                  <button type="button" className="orch__mini" {...shellControl(() => setLens('list'))}>Show the List</button>
                </div>
              )
            ) : mode === 'dev' ? (
              <GraphBoard
                platforms={platforms}
                edges={framed.graph.edges}
                panels={panels}
                workItems={workItems}
                memberIds={members}
                litIds={litIds}
                wash={wash}
                canInterrupt={canInterruptId}
                depFocus={depFocus}
                {...(blocker !== null ? { describedBy: 'orch-blocker' } : {})}
                onInterrupt={onInterrupt}
                selectedId={selectedId}
                selectedIds={selectedIds}
                firingKeys={firingKeys}
                fires={edgeFires}
                // EXPLICIT focus only: the primary island is the inspector's default
                // subject, not a focused platform — a first cut treated it as focused
                // and it never left the evidence level, whatever the zoom.
                focusedPlatformId={focusIslandId}
                onFocusPlatform={(id) => { setFocusIslandId(id); setSelectedIds([]); setFreshNeeds(new Set()) }}
                quality={quality}
                webgl={webgl}
                onWebglLost={() => setWebgl('unavailable')}
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

          {/* M299. No bottom row. M282's five tiles (System, Current task, Terminal, Code,
              Files) are gone: CPU/memory is deep detail and lives in the shell's machine
              chart; the task's stage, Mark done and its brief are the inspector's; the
              terminal tail is the workbench's Output tab; the open file is the inspector's
              artifact arm and the Files side tab. The room they took is the workbench's. */}
        </main>

        <MotionSurface open enter><aside className="orch__side" aria-label="Decisions and inspector">
          {/* M284. Needs attention — a pending permission is answered HERE through the
              existing identity, and leaves the moment it is answered anywhere. */}
          {/* M305. A CARD, and only when something needs the person: `Nothing needs you`
              was a zero-value statement at rest, and the dock's bell already says it. */}
          {(attentionRows.length > 0 || waitingOnly.length > 0 || acknowledging) && (
          <section className="orch__needs orch__needs--card" aria-label="Needs you" data-orch-needs>
            <div className="orch__section-head">
              <div className="orch__needs-eyebrow">Needs you</div>
              <span className="orch__caption">{`${attentionRows.length + waitingOnly.length} decision${attentionRows.length + waitingOnly.length === 1 ? '' : 's'}`}</span>
            </div>
            {/* #14. The last answer, in words, before the next request opens. The card
                stays up for it even when that answer was the last one waiting. */}
            <ApprovalAcks />
            {(
              <ul className="orch__needs-list">
                {attentionRows.map((row) => {
                  const key = orchAnswerKey(row.id, row.requestId)
                  const open = shownNeed === key
                  return (
                  <li key={key} className="orch__needs-row" data-orch-needs-row={row.id} data-orch-request={row.requestId} data-sent={row.sent || undefined} data-orch-in-task={row.inTask ? '' : undefined}>
                    <button type="button" className="orch__needs-main" aria-expanded={open} {...shellControl(() => { select(row.id); setOpenNeed(open ? null : key) })}>
                      <span className="orch__needs-title"><span className="orch__dot status-dot" data-tone="needs-you" aria-hidden="true" />{row.title}{row.inTask && <span className="orch__list-tag">this task</span>}</span>
                      <span className="orch__needs-ask">wants to use <strong>{row.toolName}</strong>{row.argument !== '' ? ` · ${row.argument}` : ''}</span>
                    </button>
                    {/* #17. The same detail the Needs-you queue shows — context,
                        the action in full, scoped verbs — so a request reads the
                        same wherever it is answered. */}
                    {open && onAnswer !== undefined && (
                      <ApprovalDetail
                        approval={row}
                        agent={row.title}
                        {...(row.inTask && island !== null ? { task: island.goal } : {})}
                        sent={row.sent}
                        onAnswer={(allow, scope) => answer(row, allow, scope)}
                      />
                    )}
                  </li>
                  )
                })}
                {waitingOnly.map((row) => (
                  <li key={row.id} className="orch__needs-row" data-orch-needs-row={row.id}>
                    <button type="button" className="orch__needs-main" {...shellControl(() => select(row.id))}>
                      <span className="orch__needs-title"><span className="orch__dot status-dot" data-tone="needs-you" aria-hidden="true" />{row.title}</span>
                      <span className="orch__needs-ask">needs you — reply in its conversation</span>
                    </button>
                    <span className="orch__needs-actions">
                      <button type="button" className="orch__mini" {...shellControl(() => jump(row.id))}>Open on canvas</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          )}

          {/* M290. Run limits: each says whether main ENFORCES it or it is advisory, and
              what it covers. Unknown spend reads Unknown; no cap is implied across
              providers that report none. A folded line at rest (the critic: the block in
              the System card made the bottom row taller and shrank the whole diorama). */}
          <details className="orch__brief orch__limits" data-orch-limits>
            <summary className="orch__brief-summary orch__brief-summary--quiet">Run limits · {limits.filter((l) => l.kind === 'enforced').length} enforced · {limits.filter((l) => l.kind === 'advisory').length} advisory</summary>
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
          </details>

          {/* M284. The inspector: identity, state, next action — for the selected session,
              or for the task island when nothing is selected. */}
          <section className="orch__inspector" aria-label="Inspector" data-orch-inspector={selectedRow?.id ?? selectedArtifact?.id ?? (inspectTask ? 'task' : '')}>
            {selectedArtifactWithPlatform !== null ? (
              // M291. An artifact — a file open on the canvas — standing on a platform.
              <>
                <div className="orch__inspector-id">
                  <span className="orch__roster-kind" aria-hidden="true">{kindGlyph('file')}</span>
                  <span className="orch__selected-title" data-orch-inspector-title>{selectedArtifactWithPlatform.title}</span>
                  <span className="orch__roster-state" data-orch-inspector-state>artifact</span>
                </div>
                <p className="orch__caption" title={selectedArtifactWithPlatform.path}>file · {displayPath(selectedArtifactWithPlatform.path).short}{selectedArtifactWithPlatform.platformId !== ORCH_WORKSPACE_PLATFORM ? ` · in ${platforms.find((p) => p.id === selectedArtifactWithPlatform.platformId)?.label ?? ''}` : ''}</p>
                <p className="orch__inspector-next" data-orch-next="open">Next: Open on canvas to read or edit it</p>
                <div className="orch__roster-actions" data-orch-controls={selectedArtifactWithPlatform.id}>
                  <button type="button" className="orch__mini" data-orch-open {...shellControl(() => jump(selectedArtifactWithPlatform.id))}>Open on canvas</button>
                </div>
              </>
            ) : selectedRow !== null ? (
              <>
                {/* M299. The selected-agent card: glyph, name, role line (kind · backend), the
                    Selected chip; then the task it is in, a status box (next action, standing,
                    spend, dependency block — the M290 facts, kept apart), the task's acceptance
                    criteria as rows, the M290 controls, and a follow-up composer on the real
                    send door. Every data-orch-* hook of Phases A–C stays where it was. */}
                <div className="orch__inspector-id orch__inspector-id--card">
                  <span className="orch__inspector-glyph" aria-hidden="true">{kindGlyph(selectedRow.kind)}</span>
                  <span className="orch__inspector-name">
                    <span className="orch__selected-title" data-orch-inspector-title>{selectedRow.title}</span>
                    <span className="orch__caption">
                      {/* M301. The standing rides the state span as a data hook so a
                          check can read it whatever the word is; the SENTENCE below
                          appears only when there is one to make, because an empty
                          line is an empty box. */}
                      <span className="orch__roster-state" data-tone={selectedRow.tone} data-orch-inspector-state
                        {...(selectedReconcile === null ? {} : { 'data-orch-reconcile': selectedReconcile.standing })}>{stateWord(selectedRow)}</span>
                      {` · ${selectedRow.kind}`}{selectedBackend !== undefined ? ` · ${selectedBackend}` : ''}
                    </span>
                  </span>
                  <span className="orch__chip" data-orch-selected-chip>Selected</span>
                </div>
                {/* M301. The reconciliation's own sentence, and only when it has
                    one to make: a panel whose session this app cannot see says
                    so, with when the record last saw it. Never a diagnosis —
                    "stopped", "crashed" and "finished" are not distinguishable
                    from here, and the plan forbids guessing between them. */}
                {selectedReconcile !== null && selectedReconcile.detail !== '' && (
                  <p className="orch__caption" data-orch-reconcile-detail={selectedReconcile.standing}>{selectedReconcile.detail}</p>
                )}
                {island?.memberIds.includes(selectedRow.id) === true ? (
                  <div className="orch__inspector-task">
                    <span className="orch__inspector-task-title">{island.goal}</span>
                    <span className="orch__caption">{orchPlacementLine(island)}</span>
                  </div>
                ) : (
                  <p className="orch__caption">{selectedRow.id}{outputCwd !== undefined ? ` · ${displayPath(outputCwd).short}` : ''}</p>
                )}
                <div className="orch__inspector-box" data-tone={blockedLine !== null ? 'needs-you' : selectedRow.tone}>
                  {nextAction !== null && <p className="orch__inspector-next" data-orch-next={nextAction.verb}>Next: {nextAction.label}</p>}
                  {selectedRow.kind === 'chat' && <SelectedChatPhase panelId={selectedRow.id} />}
                  {/* M290. Standing and spend, kept apart: a stopped session, an interrupted
                      run and an unknown spend are three different facts. */}
                  {selectedRow.kind === 'chat' && selectedStanding !== null && <p className="orch__caption" data-orch-standing={selectedStanding.kind}>{selectedStanding.word}</p>}
                  {selectedRow.kind === 'chat' && selectedSpend !== null && <p className="orch__caption" data-orch-spend={selectedSpend.known ? 'known' : 'unknown'}>Spend: {selectedSpend.word}</p>}
                  {blockedLine !== null && <p className="orch__inspector-next orch__dep-blocked" data-orch-dep-blocked>{blockedLine}</p>}
                </div>
                {island?.memberIds.includes(selectedRow.id) === true && islandCriteria.length > 0 && <OrchCriteria criteria={islandCriteria} />}
                <div className="orch__roster-actions" data-orch-controls={selectedRow.id}>
                  {reviewSubjectId !== null && <button type="button" className="orch__mini" data-orch-checks-open {...shellControl(() => openBench('checks'))}>Inspect checks</button>}
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
                {/* M319. THE THREE STOPS, never one word for all of them: Interrupt ends
                    the turn and keeps the conversation, Cancel drops what is queued,
                    End process kills the CLI and keeps the session. Each says what it
                    does to the turn, the process and the conversation — or why not. */}
                {selectedStops !== null && (
                  <div className="orch__stops" data-orch-stops={selectedRow.id} role="group" aria-label="Stop">
                    <span className="orch__roster-actions">
                      {selectedStops.map((st) => (
                        <button key={st.kind} type="button" className={`orch__mini${st.kind === 'terminate' ? ' orch__mini--stop' : ''}`} data-orch-stop={st.kind} disabled={!st.available} title={st.effect}
                          {...shellControl(() => {
                            if (!st.available) return
                            if (st.kind === 'interrupt') onInterrupt?.(selectedRow.id)
                            else if (st.kind === 'cancel') void window.canvas.agentSession.cancelQueued(selectedRow.id)
                            else void window.canvas.agentSession.terminate(selectedRow.id)
                          })}>{st.label}</button>
                      ))}
                      {onContinueOnBackend !== undefined && (
                        <button type="button" className="orch__mini" data-orch-handoff-open aria-expanded={handoffFor === selectedRow.id}
                          {...shellControl(() => { setHandoffEdit(null); setHandoffTo(null); setHandoffFor((cur) => (cur === selectedRow.id ? null : selectedRow.id)) })}>Continue on another backend…</button>
                      )}
                    </span>
                    <ul className="orch__control-notes">{selectedStops.map((st) => <li key={st.kind} className="orch__caption" data-orch-stop-effect={st.kind}><strong>{st.label}</strong> {st.available ? '' : '(not now) '}{st.effect}</li>)}</ul>
                  </div>
                )}
                {handoffDraft !== null && handoffTarget !== undefined && onContinueOnBackend !== undefined && (
                  <div className="orch__retry" data-orch-handoff={selectedRow.id} role="group" aria-label="Continue on another backend">
                    <div className="orch__section-title">Continue on another backend — a draft, nothing sent</div>
                    <label className="orch__caption">To{' '}
                      <select className="orch__select" data-orch-handoff-to value={handoffTarget} onChange={(e) => { setHandoffTo(e.target.value as AgentBackend); setHandoffEdit(null) }}>
                        {handoffTargets.map((b) => <option key={b} value={b}>{BACKENDS[b].label}</option>)}
                      </select>
                      {' '}— a new conversation in the same folder. {BACKENDS[handoffFrom!].label}'s conversation cannot be resumed there, so only this text carries.
                    </label>
                    <textarea className="orch__term-log orch__retry-prompt orch__handoff-text" data-orch-handoff-text aria-label="Hand-off text" rows={10} spellCheck={false}
                      value={handoffEdit ?? handoffDraft.text}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => setHandoffEdit(e.target.value)} />
                    <p className="orch__caption" data-orch-handoff-dropped>Does not carry: {handoffDraft.dropped.join('; ')}.{handoffDraft.redacted > 0 ? ` ${handoffDraft.redacted} secret${handoffDraft.redacted === 1 ? '' : 's'} redacted.` : ''}</p>
                    <span className="orch__roster-actions">
                      <button type="button" className="orch__mini" data-orch-handoff-go
                        {...shellControl(() => { const text = handoffEdit ?? handoffDraft.text; setHandoffFor(null); onContinueOnBackend(selectedRow.id, handoffTarget, text) })}>Open on {BACKENDS[handoffTarget].label} with this text</button>
                      <button type="button" className="orch__mini" data-orch-handoff-cancel {...shellControl(() => setHandoffFor(null))}>Cancel</button>
                    </span>
                  </div>
                )}
                {/* Folded (the critic: seven lines of prose at the rest layer): the summary says how
                    many and which; the reasons open on demand. */}
                {selectedControls !== null && (selectedRow.kind === 'chat' || selectedRow.kind === 'terminal') && (
                  <details className="orch__brief orch__absent" data-orch-control-absent={selectedControls.absent.map((a) => a.id).join(' ')}>
                    <summary className="orch__brief-summary orch__brief-summary--quiet">Not available here · {selectedControls.absent.map((a) => a.id).join(', ')}</summary>
                    <ul className="orch__control-notes">{selectedControls.absent.map((a) => <li key={a.id} className="orch__caption"><strong>{a.id}</strong> — {a.reason}</li>)}</ul>
                  </details>
                )}
                {selectedRow.kind === 'chat' && onSend !== undefined && (
                  <OrchFollowUp key={selectedRow.id} panelId={selectedRow.id} title={selectedRow.title} onSend={onSend} />
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
                              <button type="button" className="orch__activity-row" title={`Select ${e.fromTitle}`} {...shellControl(() => select(e.from))}>
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
                              <button type="button" className="orch__activity-row" title={`Select ${e.toTitle}`} {...shellControl(() => select(e.to))}>
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
                {/* M299: one line, the whole sentence on its title (the critic: a long amber paragraph). */}
                {island.placement.kind === 'shared' && (island.writers > 1 || island.sharedWith.length > 0) && (
                  <p className="orch__caption orch__island-ambiguity" data-orch-island-ambiguity={island.writers} title={`Shared directory — ${island.writers} sessions write in ${displayPath(island.placement.path).short}${island.sharedWith.length > 0 ? `, across ${island.sharedWith.length + 1} islands` : ''}; a change here cannot be attributed to this task alone, and the workbench says so per read.`}>
                    Shared directory — {island.writers} sessions write here; a change cannot be attributed to this task alone
                  </p>
                )}
                <p className="orch__inspector-next" data-orch-next={islandWaiting !== undefined ? 'answer' : islandStage === WORK_ITEM_STATES[2] ? 'review' : 'watch'}>
                  Next: {islandWaiting !== undefined ? `Answer ${islandWaiting.title}'s ${islandWaiting.toolName} request` : islandStage === WORK_ITEM_STATES[2] ? 'Review its changes' : 'Watch its sessions work'}
                </p>
                {islandCriteria.length > 0 && <OrchCriteria criteria={islandCriteria} />}
                <div className="orch__roster-actions">
                  {reviewSubjectId !== null && <button type="button" className="orch__mini" data-orch-checks-open {...shellControl(() => openBench('checks'))}>Inspect checks</button>}
                  <button type="button" className="orch__mini" data-orch-open {...shellControl(() => {
                    if (island.itemId !== undefined) onJumpWorkItem(island.itemId)
                    else if (island.subjectId !== null) jump(island.subjectId)
                  })}>Open on canvas</button>
                  {reviewSubjectId !== null && <button type="button" className="orch__mini" data-orch-review-open {...shellControl(() => openBench('changes'))}>Review changes</button>}
                  {/* M299. Mark done moved here from M282's Current task tile. */}
                  {island.itemId !== undefined && onMarkDone !== undefined && USER_SET_STATES.includes(WORK_ITEM_STATES[3]) && island.state !== WORK_ITEM_STATES[3] && (
                    <button type="button" className="orch__mini" data-orch-mark-done {...shellControl(() => onMarkDone(island.itemId!))}>Mark done</button>
                  )}
                  {/* M302. Save this island's shape as a reusable arrangement — an
                      ordinary template, through the ordinary door, so it is readable
                      by every other surface that reads templates. Its title says the
                      one thing a person must know before starting it again. */}
                  {onSaveArrangement !== undefined && island.memberIds.length > 0 && (
                    <button type="button" className="orch__mini" data-orch-save-arrangement
                      title="save the agents, their directories and the handoffs between them as a template — starting it opens conversations with their messages ready, and sends nothing"
                      {...shellControl(() => { void onSaveArrangement(island.id) })}>Save arrangement</button>
                  )}
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
              // M299. Nothing selected and no island: the fact is that no task is in progress
              // (M282's Current task tile said this; the tile is gone, the sentence is not).
              <EmptyState id="orch-task" onVerb={onShowCanvas} />
            )}
          </section>

          <div className="orch__tabs orch__tabs--fold" role="tablist">
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
              <button type="button" className="orch__mini orch__fold-end" data-orch-feed-toggle aria-expanded={feedOpen}
                title={feedOpen ? 'Fold the activity feed away' : 'Show the activity feed'}
                {...shellControl(() => setFeedOpen(!feedOpen))}>{feedOpen ? 'Hide' : 'Show'}</button>
          </div>
          {feedOpen && tab === 'activity' && (
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
              {/* M318. What needs a person, apart from what only informs. */}
              {(() => {
                const need = filteredActivity.filter((e) => classifyActivity(e) === 'intervene').length
                return (
                  <p className="orch__caption orch__activity-weights" data-orch-activity-weights={need}>
                    {need === 0 ? 'Nothing here needs you — every row is information.' : `${need} need${need === 1 ? 's' : ''} you · ${filteredActivity.length - need} for information`}
                    {' '}<button type="button" className="orch__mini" data-orch-activity-intervene={interveneOnly ? 'on' : 'off'} aria-pressed={interveneOnly}
                      {...shellControl(() => setInterveneOnly(!interveneOnly))}>{interveneOnly ? 'Show everything' : 'Needs you only'}</button>
                  </p>
                )
              })()}
              <ul className="orch__activity" aria-label="Activity feed">
                {(interveneOnly ? filteredActivity.filter((e) => classifyActivity(e) === 'intervene') : filteredActivity).length === 0 ? (
                  <li><EmptyState id="orch-activity" /></li>
                ) : (interveneOnly ? filteredActivity.filter((e) => classifyActivity(e) === 'intervene') : filteredActivity).map((e) => (
                  <li key={e.id} data-activity-weight={classifyActivity(e)}>
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
                      {classifyActivity(e) === 'intervene' && <span className="orch__activity-need" data-activity-need>{agentWord('wants-you').word}</span>}
                      <time className="orch__activity-time">{formatAgo(e.at)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {feedOpen && tab === 'files' && (
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
        reading={benchReading}
        onReading={setBenchReading}
        onChecks={onBenchChecks}
        panels={panels}
        workItems={workItems}
        worktrees={worktrees}
        taskHandoffOf={taskHandoffOf}
        // M301. The person's Refresh re-asks MAIN too, not just the strip's
        // own reads — it is the one control on the page that means "look again".
        onRefreshTaskHandoffs={() => { reconcile(); onRefreshTaskHandoffs?.() }}
        onPatchWorkItem={onPatchWorkItem}
        onReviewOnCanvas={onReviewOnCanvas}
        {...(onOpenPath === undefined ? {} : { onOpenPath })}
        onJump={jump}
        onShowCanvas={onShowCanvas}
        output={{ panelId: outputPanelId, title: selectedRow?.title ?? liveSnap.terminalSnippet?.title, command: outputCommand, lines: outputLines }}
        refresh={benchRefresh}
        edges={depEdges}
        {...(onSend === undefined ? {} : { onSend })}
      />
    </div>
  )
}

/**
 * M299. Acceptance criteria as rows. The marker is a neutral ring, never a tick: no
 * criterion carries a verdict, and drawing one would claim a check that was not made.
 */
function OrchCriteria({ criteria }: { criteria: readonly string[] }): JSX.Element {
  return (
    <div className="orch__criteria" data-orch-criteria={criteria.length}>
      <div className="orch__section-title">Acceptance criteria</div>
      <ul className="orch__criteria-list" title="Written by a person on the task; no verdict is recorded per criterion — the workbench's Checks tab reads the ledger">
        {criteria.map((c, i) => <li key={i} className="orch__criterion"><span className="orch__criterion-mark" aria-hidden="true" />{c}</li>)}
      </ul>
    </div>
  )
}

/**
 * M299. The follow-up composer: one line to the selected chat through the SAME
 * door its canvas composer uses (`onSend`, wired by the canvas), never a second path. The
 * draft clears only on an accepted send; a refusal is shown beside the field in main's
 * own sentence. The menu's Paste arrives as `edit:paste` (not a native paste — the
 * gotcha in CLAUDE.md), so the field subscribes while it has focus, as Palette does.
 */
function OrchFollowUp({ panelId, title, onSend }: { panelId: string; title: string; onSend: (panelId: string, text: string) => Promise<string | null> }): JSX.Element {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => window.canvas.edit.onPaste((text) => {
    if (document.activeElement !== inputRef.current) return
    setDraft((d) => d + text)
  }), [])
  const send = (): void => {
    const text = draft.trim()
    if (text === '' || busy) return
    setBusy(true)
    setRefusal(null)
    void onSend(panelId, text).then((why) => {
      setBusy(false)
      if (why === null) setDraft('')
      else setRefusal(why)
    })
  }
  return (
    <form className="orch__followup" data-orch-followup={panelId} onSubmit={(e) => { e.preventDefault(); send() }}>
      <input
        ref={inputRef}
        data-edit-owner
        type="text"
        className="orch__followup-input"
        data-orch-followup-input
        value={draft}
        placeholder={`Follow up with ${title}…`}
        aria-label={`Follow up with ${title}`}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="submit" className="orch__mini orch__followup-send" data-orch-followup-send disabled={busy || draft.trim() === ''}>Send</button>
      {refusal !== null && <p className="orch__caption orch__followup-refusal" role="status" data-orch-followup-refusal>{refusal}</p>}
    </form>
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
  // A <details>, FOLDED at rest (M299; M287 opened it when something was written, and its
  // two textareas then repeated the criteria the card now shows as rows). The summary says
  // whether anything is written; the fields open on demand.
  return (
    <details className="orch__brief" data-orch-brief-editor={itemId}>
      <summary className="orch__brief-summary orch__brief-summary--quiet">{brief === '' && criteria.length === 0 ? 'Brief & acceptance criteria · none yet' : 'Edit brief & acceptance criteria'}</summary>
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
