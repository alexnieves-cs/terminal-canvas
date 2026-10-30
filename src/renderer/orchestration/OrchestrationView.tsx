/**
 * M268 / M269. Orchestration center view — dense HUD over live agent / board /
 * workflow / PTY data. Presentational: Canvas owns verbs (jump, interrupt,
 * markDone, setCenterView). Selection here drives the other panes; a jump
 * returns to the canvas so pan/zoom/PTY stay the canvas's.
 */
import { MotionSurface } from '@renderer/primitives/MotionSurface'
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react'
import type { Panel } from '@renderer/panels/panels'
import {
  isChatPanel, isFilePanel, isTerminalPanel, isWatcherPanel, isWorkflowPanel, isWorkPanel
} from '@renderer/panels/panels'
import { getAgentState, onAgentTransition } from '@renderer/session/agent-state-store'
import { getMachineCostSampledAt, useMachineCostTotal } from '@renderer/session/machine-cost-store'
import { getLiveSession, useLiveSession } from '@renderer/session/live-session-store'
import { getWatch } from '@renderer/watcher/watcher-store'
import { useChat, getChat, useApprovals, useChatsVersion } from '@renderer/chat/chat-store'
import { outward } from '@shared/outward'
import { ApprovalAcks, ApprovalDetail } from '@renderer/shell/ApprovalDetail'
import { useApprovalOutcomes } from '@renderer/shell/approval-outcome'
import { TRIGGER_WORDS } from '@renderer/canvas/trigger-words'
import { edgeFiredAt, useEdgeActivityVersion } from '@renderer/canvas/useEdgeActivity'
import { getPool, livePoolKeys } from '@renderer/workflow/pool-store'
import type { PersistedWorkItem } from '@shared/work-items'
import { USER_SET_STATES, WORK_ITEM_STATES, type WorkItemState } from '@shared/work-items'
import { displayPath } from '@shared/display-path'
import { shellControl } from '@renderer/shell/shell-control'
import { railLabel } from '@renderer/shell/rail-rows'
import { formatAgo } from '@renderer/shell/format-ago'
import { agentWord, TONE_WORKING } from '@renderer/panels/panel-state'
import { KindChat, KindFile, KindWatcher, KindWork, Orbit, Search, Stop } from '@renderer/icons'
import { EmptyState } from '@renderer/shell/EmptyState'
import { buildOrchestrationSnapshot, filterActivity, filterRoster, filterWorkItems, isLiveRosterState, orchActivityCoverage, orchBlocker, orchCommands, orchEdgeKey, orchEdgesFiredByPanel, orchFilesCoverage, orchKeysShouldHandle, orchLensLit, orchStageShifts, ORCH_STAGE_WASH_MS, orchMetricLens, orchRosterStep, orchTaskFrame, ORCH_ACTIVITY_SCOPES, ORCH_EDGE_FIRE_MS, ORCH_PACKET_MS, orchEdgePackets, orchRecordFires, type OrchEdgeFire, ORCH_MODES, ORCH_ROSTER_FILTERS, type OrchActivityScope, type OrchCommandId, type OrchMetricId, type OrchMode, type OrchPanelInput, type OrchRosterFilter, type OrchRosterRow } from './orchestration-model'
import {
  orchActivityEvents,
  subscribeOrchActivity
} from './orchestration-activity'
import { classifyActivity } from '@renderer/shell/task-queue'
import { buildOrchLive, type OrchLiveSessionInput, type OrchLiveState } from './orchestration-live'
import { ORCH_WORKSPACE_PLATFORM, orchNextSort, orchPlatforms, orchQualityStep, orchSceneObjects, orchSortRows, orchSpatialStep, type OrchArrow, type OrchListSort, type OrchListSortKey, type OrchPlatform } from './orchestration-platforms'
import { getOrchPrefs, persistedOrchPrefs, prefsFromView, seedOrchPrefs, setOrchPrefs, viewFromPrefs, withSavedView, type OrchLens, type OrchSideTab, type OrchView } from './orchestration-prefs'
import { buildTaskBoard, type BoardPlanInput, type BoardSide } from './orch-task-board'
import { OrchTaskBoard } from './OrchTaskBoard'
import type { TaskQueue } from '@renderer/shell/task-queue'
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
import { standingOf, type Standing } from '@shared/session-standing'
import { OrchSessionFact, useLiveSessions, useLastSeen, orchWebglAvailable, useOrchOutput, useOrchWorktrees } from './orch-view-hooks'
import { stateWord, toneFromState, kindGlyph, SelectedChatPhase, orchRosterGroups, GraphBoard } from './OrchGraphBoard'
import type { OrchWash } from './OrchGraphBoard'
import { OrchCriteria, OrchFollowUp, OrchBriefEditor } from './OrchDetailParts'

/** M294. A platform's label plate: its backing width, height and the gap above the diamond's top tip. */

/**
 * M304. The Watch lens — the same deferred-chunk rule as the cubes (OrchGraphBoard.tsx): a
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
  /**
   * M325. The task queue — the ONE judgment of what needs the person, grouped
   * by task — which the task list reads its Needs attention rows from.
   * Absent, the list still groups tasks by their own state.
   */
  taskQueue?: TaskQueue
  /** M325. Open a task's workspace (the focus view), on a side when one answers the need. */
  onOpenTask?: (itemId: string, side?: BoardSide) => void
  /** M325. Start work for a task that has no conversation yet. */
  onStartWork?: (itemId: string) => void
  /** M327. A task's plan progress, when it has a plan. */
  planOf?: (itemId: string) => BoardPlanInput | undefined
  /**
   * M432. "View in World": open the 3D room framed on these panels' robots —
   * an island's members, the selected session first. Optional like every
   * capability here: absent, no chip is drawn.
   */
  onViewInWorld?: (panelIds: readonly string[]) => void
}


type SideTab = OrchSideTab

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


function OrchestrationViewImpl(props: OrchestrationViewProps): JSX.Element {
  const { panels, workItems, templates = [], displayName, onJumpPanel, onJumpWorkItem, onInterrupt, onMarkDone, onFocusRelated, onOpenFiles, onOpenPath, onShowCanvas, taskMemberIds, taskMembersOf, onAnswer, onReviewOnCanvas, orchestrate, onOrchestrate, onPatchWorkItem, taskHandoffOf, onRefreshTaskHandoffs, automationResults, onRetryOnCanvas, onContinueOnBackend, backendsAvailable, workspaceName, onSend, onSaveArrangement, initialSelectedId, onSelectionChange, taskQueue, onOpenTask, onStartWork, planOf, onViewInWorld } = props
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
  // M325. The task list is the page's default; the lenses are the visualisation.
  const [view, setView] = useState<OrchView>(() => getOrchPrefs().view)
  useEffect(() => { setOrchPrefs({ view }) }, [view])
  const showLens = useCallback((l: OrchLens): void => { setView('visualize'); setLens(l) }, [])
  const viewRef = useRef(view)
  viewRef.current = view
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
  }, [tab, mode, view, lens, graphCamera, benchTab, benchHeight, benchOpen, islandOrder, flushOrchestrate])
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
    setView(next.view)
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

  // M325. THE TASK LIST — the page's default. The queue decides what needs the
  // person; the roster says what each agent is doing; the canvas's readiness
  // judgement says what a task's lane holds. Nothing here re-derives any of them.
  const rosterById = useMemo(() => new Map(liveSnap.roster.map((r) => [r.id, r])), [liveSnap.roster])
  const board = useMemo(() => buildTaskBoard({
    items: workItems,
    membersOf: (id) => taskMembersOf?.(id) ?? [],
    agentOf: (id) => { const r = rosterById.get(id); return r === undefined ? undefined : { id: r.id, title: r.title, kind: r.kind, state: r.state, word: stateWord(r), tone: r.tone } },
    groups: taskQueue?.groups ?? [],
    checks: taskQueue?.checks ?? {},
    handoffOf: (id) => taskHandoffOf?.(id),
    ...(planOf === undefined ? {} : { planOf })
  }), [workItems, taskMembersOf, rosterById, taskQueue, taskHandoffOf, planOf])

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
      // M325. The task list is buttons in the tab order; the scene's keys are the scene's.
      if (viewRef.current === 'tasks') return
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
    // M322. What the agent SAW: a waiting or undelivered message is not part of the conversation being handed on.
    turns: selectedChat.turns.filter((t) => t.delivery === undefined).map((t): HandoffTurn => ({ role: t.role === 'user' ? 'user' : 'assistant', text: t.blocks.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n') }))
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

  // M325. THE TASK LIST is the page's default view: the header, one line of
  // counts, the switch to the visualisation, and the list. The roster, the
  // inspector, the activity feed and the workbench are the visualisation's;
  // a task's own conversation and evidence are its workspace (the focus view).
  if (view === 'tasks') {
    return (
      <div className="orch orch--tasks" role="region" aria-label="Orchestration" data-orch-view="tasks">
        <header className="orch__tasks-head">
          <div className="orch__task-id">
            <span className="orch__eyebrow">Orchestrate{workspaceName !== undefined && workspaceName !== '' && <span className="orch__title-scope"> / {workspaceName}</span>}</span>
            <h1 className="orch__title orch__title--tasks" data-orch-title>Tasks</h1>
            <p className="orch__tasks-headline" data-board-headline role="status">{board.headline}</p>
          </div>
          <span className="orch__lens" role="group" aria-label="Tasks or a visualisation">
            <button type="button" className="orch__tab orch__tab--on" aria-pressed={true} data-orch-view-tasks>Tasks</button>
            {(['scene', 'watch', 'list'] as const).map((l) => (
              <button key={l} type="button" className="orch__tab" aria-pressed={false} data-orch-lens={l}
                title={l === 'scene' ? 'The tasks as platforms and their agents as a scene' : l === 'watch' ? 'Watch the sessions work — files as towers, writes and commands as they happen' : 'Every session, by name, in a table'}
                {...shellControl(() => showLens(l))}>{l === 'scene' ? 'Scene' : l === 'watch' ? 'Watch' : 'List'}</button>
            ))}
          </span>
        </header>
        <OrchTaskBoard
          board={board}
          approvalOf={(panelId, requestId) => attentionRows.find((r) => r.id === panelId && r.requestId === requestId)}
          onOpen={(itemId, side) => { if (onOpenTask !== undefined) onOpenTask(itemId, side); else onJumpWorkItem(itemId) }}
          {...(onStartWork === undefined ? {} : { onStart: onStartWork })}
          onJump={jump}
          onShowOnCanvas={onJumpWorkItem}
          onShowInScene={(itemId) => {
            const isl = islands.find((i) => i.itemId === itemId)
            showLens('scene')
            if (isl !== undefined) { setFocusIslandId(isl.id); setSelectedIds([]) }
          }}
          {...(onMarkDone === undefined ? {} : { onMarkDone })}
          {...(onAnswer === undefined ? {} : {
            onAnswer: (panelId: string, requestId: string, allow: boolean, scope?: 'session') => {
              const row = attentionRows.find((r) => r.id === panelId && r.requestId === requestId)
              if (row !== undefined) answer(row, allow, scope)
            }
          })}
          {...(onSend === undefined ? {} : { onSend })}
        />
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
              <button type="button" className="orch__tab" aria-pressed={false} data-orch-view-tasks
                title="Back to the task list — what needs you, what is running, what is ready for review"
                {...shellControl(() => setView('tasks'))}>Tasks</button>
              {(['scene', 'watch', 'list'] as const).map((l) => (
                <button key={l} type="button" className={`orch__tab${lens === l ? ' orch__tab--on' : ''}`} aria-pressed={lens === l}
                  data-orch-lens={l} title={l === 'watch' ? 'Watch the sessions work — files as towers, writes and commands as they happen' : undefined}
                  {...shellControl(() => showLens(l))}>{l === 'scene' ? 'Scene' : l === 'watch' ? 'Watch' : 'List'}</button>
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
                  <button type="button" className="orch__mini" {...shellControl(() => showLens('list'))}>Show the List</button>
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
                // M432. The island's members, the selected session first when it is one of them.
                {...(onViewInWorld === undefined ? {} : { onViewInWorld: (id: string) => {
                  const members = platforms.find((p) => p.id === id)?.island?.memberIds ?? []
                  onViewInWorld(selectedId !== null && members.includes(selectedId) ? [selectedId, ...members.filter((m) => m !== selectedId)] : members)
                } })}
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

export const OrchestrationView = memo(OrchestrationViewImpl)
