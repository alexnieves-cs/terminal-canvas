import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type Dispatch, type SetStateAction, type JSX, type MouseEvent, type CSSProperties } from 'react'
import { CanvasHud } from './CanvasHud'
import { useHistoryVerbs } from './useHistoryVerbs'
import { useMainRows } from './useMainRows'
import { useShellSettings } from './useShellSettings'
import { useShellReads } from './useShellReads'
import { usePanelGestures } from './usePanelGestures'
import { useShellTail } from './useShellTail'
import { renderPanelNode } from './PanelNode'
import { useDropVerbs } from './useDropVerbs'
import { useTestDoors } from './useTestDoors'
import { useRestartVerbs } from './useRestartVerbs'
import { useReviewVerbs } from './useReviewVerbs'
import { useAnnotations } from './useAnnotations'
import { useTaskLens } from './useTaskLens'
import { useRunRows } from './useRunRows'
import { useAttentionModels } from './useAttentionModels'
import { useNavigatorModels } from './useNavigatorModels'
import { useChatSwapVerbs } from './useChatSwapVerbs'
import { useObjectVerbs } from './useObjectVerbs'
import { useCreationVerbs } from './useCreationVerbs'
import { usePreviewVerbs } from './usePreviewVerbs'
import { useWorkflowVerbs } from './useWorkflowVerbs'
import { CenterPages } from './CenterPages'
import { useSkillsPane } from './useSkillsPane'
import { DiagnosticsOverlay } from './DiagnosticsOverlay'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useDiagnostics } from './useDiagnostics'
import { useHandoff } from './useHandoff'
import { shellControl } from '../shell/shell-control'
import { EdgeIndicators } from './EdgeIndicators'
import { Minimap, MINIMAP_W, MINIMAP_H } from './MinimapOverlay'
import { CardDetailContext } from '@renderer/components/card-detail-context'
import { LinkLayer } from './LinkLayer'
import { ShapeLayer, type LiveBinding } from '@renderer/flowchart/ShapeLayer'
import { editNewShape, useFlowchartVerbs } from './useFlowchartVerbs'
import { useConnectors, type Connectors } from './useConnectors'
import { useShapeKeys } from './useShapeKeys'
import { useFlowchartIO } from './useFlowchartIO'
import { ConnectorLayer } from '@renderer/flowchart/ConnectorLayer'
import { buildPeerFlow, type PeerFlow } from '@renderer/flowchart/shared-shapes'
import { AgentLinkLayer } from './AgentLinkLayer'
import { forgetAgentLinksFor, forgetAllAgentLinks, publishAgentLinks } from './agent-links-store'
import { agentLinks } from '@shared/agent-links'
import { indexToolFiles } from '@shared/tool-index'
import { getChat as getChatState } from '@renderer/chat/chat-store'
import { useLinkMode } from './useLinkMode'
import { useSpaceHeld } from './useSpaceHeld'
import { Launcher } from './Launcher'
import { SnapGuides } from './SnapGuides'
import { alignRects, smartSnap, type SpacingGuide } from './arrange'
import { SNAP_PX, type SnapGuide } from './placement'
import { contextualHint, hintsLeft, STARTER_HINT} from './hints'
import { FirstTaskHint } from './FirstTaskHint'
import { useLinkDraw } from './useLinkDraw'
import { SubagentLayer } from './SubagentLayer'
import { useCanvasTestHooks } from './useCanvasTestHooks'
import { usePaletteActions } from './usePaletteActions'
import { useWorkspaceVerbs } from './useWorkspaceVerbs'
import { useCanvasPointer } from './useCanvasPointer'
import { ordinalBook, panelName, publishTerminalNames, terminalNames } from '@renderer/palette/panel-name'
import { inspectionDirectory } from './inspection-directory'
import { capabilityAcross, normalizeCapability, type CapabilityAnswer } from '@shared/toolbox-query'
import { useVault } from './useVault'
import {
  EMPTY_PRESETS,
  EMPTY_SELECTION, NO_GUIDES,
  MACHINE_COST_SAMPLE_MS, APP_OPENED_AT, retainSelection, panelLabel} from './canvas-constants'
import { useViewport, prefersReducedMotion } from './useViewport'
import { RestoreSplash, StartupSplash } from './StartupSplash'
import { type StartupInput } from './splash'
import { Onboarding } from '@renderer/onboarding/Onboarding'
import { BlankCanvas } from '@renderer/shell/EmptyState'
import { FIT_TASK_NO_CONTEXT, missingSentence} from './task-members'
import { type TaskCluster } from './task-clusters'
import { TaskClusterLayer, TaskRegionLayer, TierLayer } from './TaskClusterLayer'
import { moveRegion} from './task-regions'
import { InlineApproval } from '@renderer/shell/ApprovalDetail'
import { waitingSince } from '@renderer/panels/header-rest'
import { connectedSpawnMenu } from '@renderer/panels/connected-spawn'
import { armConnectedSpawn, clearArmedSpawn, noteSpawnCursor, openConnectedSpawn, spawnCursor, spawnSize, takeArmedSpawn} from '@renderer/panels/spawn-cursor'
import { useCanvasClipboard } from './useCanvasClipboard'
import { useCanvasContextMenu } from './useCanvasContextMenu'
import { useTiering } from './useTiering'
import {
  screenToWorld, worldToScreen, type Point, type Viewport, type WorldRect, clearOfOverlays, type ScreenRect } from './viewport'
import { chromeObstacles, placementRoom as readPlacementRoom, viewCentre } from './safe-area'
import { placePanel, type PlaceFn, type PlaceHow } from './place-new'
import { placementQuiet } from './place-quiet'
import { Marquee, type MarqueeScreenRect } from './MarqueeLayer'
import { MergedLanes } from './MergedLanes'
import { mergedLayout } from './merged-layout'
import { usePanelDrag } from './usePanelDrag'
import { GroupLayer } from '@renderer/groups/GroupLayer'
import { pruneGroups, type CanvasGroup } from '@renderer/groups/groups'
import { movesOrigin, type DragState } from './panel-interaction'
import { type JumpDirection } from './attention'
import { dismissReturn} from '@renderer/shell/presence'
import { PORT_MIN_SCALE } from '@renderer/components/PanelPorts'
import { checklistFocused } from '@renderer/file/checklist-controllers'
import { pillFocused, orchestratorTarget } from './command-pill'
import { CommandPill, orchestratorCandidates } from './CommandPill'
import { noteEditorFocused } from '@renderer/file/rich-note-focus'
import { deckFocused } from '@renderer/file/deck-controllers'
import { sheetController, sheetFocused } from '@renderer/file/sheet-controllers'
import { focusedDraft} from './draft-focus'
import { NavGrid } from '@renderer/navgrid/NavGrid'
import { useNavGrid } from '@renderer/navgrid/useNavGrid'
import { createRegistry } from '@renderer/session/session-registry'
import { useRegistryVersion } from '@renderer/session/useRegistry'
import {
  applyAgentState, attentionIds, clearAgentState, useAttentionIds, onAgentTransition
} from '@renderer/session/agent-state-store'
import {
  applyLiveSession, clearLiveSession, getLiveSession
} from '@renderer/session/live-session-store'
import { applySubagents, clearSubagents } from '@renderer/session/subagent-store'
import { applyFileResult, clearFileResult } from '@renderer/session/file-store'
import { clearToolbox } from '@renderer/session/toolbox-store'
import { applyUsage, clearUsage} from '@renderer/session/usage-store'
import { applyMachineCosts, clearMachineCost } from '@renderer/session/machine-cost-store'
import { clearScrollbackTail } from '@renderer/session/scrollback-store'
import { createSessionFactory } from '@renderer/terminal/session-factory'
import type { CanvasState, PersistedBookmark, PersistedRun } from '@shared/layout-schema'
import { retainOutcome, type RetainedOutcome } from '@shared/retained-outcomes'
import { searchWork, type WorkEvidenceRow } from '@shared/work-search'
import { buildResumeSummary, pickResumeSubject, type ResumeSummary } from '@shared/resume-summary'
import type { MachineCostTarget } from '@shared/machine-cost'
import type {
  MergedWorkspace,
  PresetTemplate,
  SessionBackendInfo} from '@shared/ipc-contract'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import { fromPanels, toPanels } from '@renderer/panels/layout-adapt'
import { findConnector, isShapePanel, RELAY_W, RELAY_H, makeImagePanel, isImagePanel, isWorkflowPanel, makeSkillPanel, makeWorkPanel, isWorkPanel, isBrowserPanel, makeGithubPanel, isWatcherPanel,
  cascadeCentre, firstRunPanels, isFilePanel, isReviewPanel, isTerminalPanel, makeJiraPanel,
  makeChatPanel, isChatPanel,
  makePanel, nextZ, occupiedRect, terminalRimAt, rimCoveredIds, pickRects, setPanelRect,
  addLink, setLinkAutomation, linksOf, workCardItemId,
  type Panel, type TerminalPanel as TerminalPanelModel, CHAT_W, CHAT_H} from '@renderer/panels/panels'
import { seedAfter } from '@renderer/panels/recover'
import { nextCardDetail, type CardDetail } from './card-detail'
import { createHistory, pushHistory, type History } from '@renderer/panels/history'
import { usePalette } from '@renderer/palette/usePalette'
import { Palette, type InputMode } from '@renderer/palette/Palette'
import { NavigateTier } from '@renderer/palette/navigate-tier'
import { ConnectedSpawnMenu } from '@renderer/palette/SpawnSheet'
import { lineupWhatId } from '@renderer/palette/spawn-sheet'
import { STARTER_LAYOUTS } from '@shared/lineups'
import type { PresetRow} from '@renderer/palette/commands'
import type { WorkItem } from '@shared/work-item'
import { REASON_NO_CLAUDE, REASON_NO_REPO_MEMORY } from '@renderer/palette/commands'
import { getChat, insertIntoComposer, onChatTurnStart, scrollToTurn, useChatsVersion } from '@renderer/chat/chat-store'
import type { SpawnResult } from '@shared/ipc-contract'
import type { AgentOptions } from '@shared/cost'
import { disposeChat, revokeChatGrants } from '@renderer/chat/useChatSessions'
import { disposeWatcher} from '@renderer/watcher/useWatchers'
import { approvals, useApprovals } from '@renderer/chat/chat-store'
import { TONE_NEEDS_YOU, TONE_WORKING, type Tone } from '@renderer/panels/panel-state'
import { forgetAllEdges, forgetEdgesFor, setEdgeContext } from './useEdgeActivity'
import { REASON_NO_CODEX, type AgentBackend } from '@shared/agent-session'
import { BACKENDS, backendOf, carryBackend } from '@shared/agent-backends'
// How long an attention landing stays lit. Matches `.landing-halo`'s
// animation in styles.css: the timer only unmounts what the CSS has already
// faded, and under reduced motion (animation forced off) it is the whole
// signal — a still ring shown for this long, then gone.
const LANDING_LIT_MS = 900
import { projectSession, type RunLiveFact } from '@shared/run-outcome'
import { getWatch } from '@renderer/watcher/watcher-store'
import { disposeRelayTerminal } from '@renderer/relay/RelayTerminal'
import { getDraft} from '@renderer/workflow/template-draft-store'
import { displayPath } from '@shared/display-path'
import { laneOfPath } from '@shared/work-scope'
import type { AgentPlanCaller } from '@shared/plan'
import { PackPreview} from '../pack/PackPreview'
import { isStarterCaption, starterKeysToApply, type PersistedStarter } from '@shared/starter'
import { onboardingReadiness, foundAgentIds} from '@shared/onboarding'
import { clearBrowser } from '@renderer/browser/browser-store'
import { useRuns } from './useRuns'
import { allTemplates, type PersistedTemplate, type TemplateEdge } from '@shared/templates'
import { applyPoolEvent } from '@renderer/workflow/pool-store'
import type { PoolMintReply, PoolMintRequest } from '@shared/ipc-contract'
import { fillTemplate, templatePanels, templateRefusal, workflowBlockRefusal } from '@renderer/palette/template-model'
import { enabledEdges, sealAbandoned} from './run-model'
import type { ApprovalRow } from '@renderer/palette/commands'
import { claudeAvailable, codexAvailable} from '@renderer/palette/commands'
import { deliverToComposer } from '@renderer/chat/chat-store'
import { clearLastLine} from '@renderer/session/last-line-store'
import { clearLastActive } from '@renderer/session/last-active-store'
import { type PersistedTeammate } from '@shared/teammates'
import type { ToolScope } from '@shared/toolbox'

/* M127. Module scope, never a fresh literal per render: canvas-constants.ts's
   own rule — a new object each render is re-render churn through every memo
   that takes the shelf as a dependency. */
import { ROUTINE_PROMPT, type PersistedRoutine } from '@shared/routines'
import { pinCount} from '@renderer/canvas/lod'
import { ANNOTATIONS_MAX, type Annotation} from '@shared/annotations'
import { WORK_ITEM_STATES, carryWorkItem, type PersistedWorkItem} from '@shared/work-items'
import { REVIEW_COMMENTS_MAX, commentPlace, newReviewComment } from '@shared/review-comments'
import { useTaskHandoffs } from '@renderer/canvas/useTaskHandoffs'
import { useBoardVerbs, type BoardVerbs } from './useBoardVerbs'
import { AnnotationLayer } from './AnnotationLayer'
import { SkillTrailLane } from '@renderer/skills/SkillTrailLane'
import { applyTrail, clearTrail } from '@renderer/skills/skill-trail-store'
import { PanelMarksContext} from '@renderer/components/PanelFrame'
// M8a. The frame is rendered here rather than in App.tsx because every verb it
// will eventually need (paletteActions, the camera verbs, presetRows) is state
// that lives inside Canvas — an App-owned frame would mean lifting all of it up
// or threading it back through a callback, making App a state owner in exchange
// for a tidier diagram.
import { TopBar } from '../shell/TopBar'
import { focusLocked} from '@shared/shortcuts'
import type { FocusSide } from '../focus/focus-model'
import { planView } from '@shared/task-plan'
import type { PersistedOrchestrate } from '@shared/orchestrate-prefs'
import { WorldStage } from '../world/WorldStage'
import { WorldLens } from '../world/WorldLens'
import { landingViewport } from '../world/plan-floor'
import { setWorldLanding, setWorldOn, useWorldOn, worldLandingViewport } from '../world/world-toggle'
import { useWorldContextPublisher } from '../world/useWorldContextPublisher'
import { Inspector } from '../shell/Inspector'
import { ReopenNotice} from '../shell/ReopenNotice'
import { JobRecoveryNotice} from '../shell/JobRecoveryNotice'
import { WelcomeBack } from '../shell/WelcomeBack'
import { adoptCommand, adoptSentence} from '@shared/tmux-adopt'
import { useShellChrome, type CenterView } from '../shell/useShellChrome'
import { useDockExpanded } from '../shell/useDockExpanded'
import { useShellBreakpoint } from '../shell/useShellBreakpoint'
import { Dock } from '../shell/Dock'
import { Navigator } from '../shell/Navigator'
import { railLabel } from '../shell/rail-rows'
import { isRestartable} from '../shell/inspector-fields'
import type { LinkAutomation } from '@shared/handoff'
import { TRIGGER_WORDS } from './trigger-words'
import type { PanelSearchResult } from '@shared/ipc-contract'
// M129. Composed into shouldIgnoreKeys; see skills/editor-focus.ts.
import { skillEditorFocused } from '../skills/editor-focus'
import { adoptedRunId, isSettledHandoff, recordOrchEvent} from '../orchestration/orch-record'
import { PresenceLayer } from '../presence/PresenceLayer'
import { useSharedCanvas } from '../shared-canvas/useSharedCanvas'
import { SharedPlaceholderLayer } from '../shared-canvas/SharedPlaceholderLayer'
import { notifyRefused } from '../shell/toast'
import { RosterStrip } from '../presence/RosterStrip'
import { SyncChip } from '../presence/SyncChip'
import { useRosterNames } from '../presence/useRosterNames'
import { ShareDialog } from '../account/ShareDialog'
import { ReplaySheet } from '../replay/ReplaySheet'



const registry = createRegistry({
  bridge: window.canvas,
  factory: createSessionFactory()
})

// THERE IS DELIBERATELY NO `beforeunload` TEARDOWN HERE, and adding one back
// silently deletes M4c's headline feature.
//
// Until M4c this file called registry.disposeAll() on beforeunload, because
// "the renderer is going away" and "these processes should die" were the same
// statement. M4c split them: a teardown detaches the tmux CLIENT while the
// SESSION keeps running, so the next page's pty:create lands back in the same
// process. disposeAll() sends pty:kill for every panel, and pty:kill means
// `tmux kill-session` — the opposite of a detach.
//
// It also WINS the race. beforeunload runs before the navigation starts, so on
// Cmd+R main receives every pty:kill first and window-lifecycle.ts's
// did-start-navigation detachAll() then walks an already-empty map. Measured
// under this repo's own Electron: pty:kill(n1) arrived first, detachAll second.
//
// Renderer teardown is main's job in all three of its shapes
// (did-start-navigation, render-process-gone, closed) and quitting is
// before-quit's (killAll + backend.shutdown()), so nothing here is left
// unhandled. What this loses is freeing xterm/WebGL from the renderer side on
// an orderly reload — which costs nothing, since the page is being destroyed
// and the browser reclaims both anyway.
//
// verify:panels check 26 reloads a real renderer against a real PtyManager on
// a tmux backend and asserts the session survives; that is what fails if this
// listener comes back.

/** M78. The word an edge carries on the canvas for its rule. */
function edgeWord(automation: LinkAutomation): string {
  // One phrasing, verbatim, on the line and in the pane's select (M78's critic).
  if (automation.kind === 'restart-on-exit') return 'restart on exit'
  return TRIGGER_WORDS[automation.trigger]
}


export function Canvas({
  initial,
  liveSessionIds,
  defaultTemplate,
  allPanelIds,
  startup
}: {
  /** The startup splash's boot inputs; absent (a harness mount) means no splash. */
  startup?: StartupInput
  initial: CanvasState
  /** Panels that already have a process; see renderer/main.tsx for the rule. */
  liveSessionIds: Set<string>
  /**
   * Cmd+N's template, as of the moment React mounted. A PROP rather than
   * something this component subscribes for, because main's push arrives
   * before any effect here runs — see renderer/main.tsx.
   */
  defaultTemplate?: PresetTemplate
  /**
   * Every panel id in every workspace, not just this one's — see
   * renderer/main.tsx for why nextIdRef needs the whole set rather than
   * `initial.panels` alone. A prop, and re-derived on every switch (below,
   * from ActivateResult.allPanelIds) rather than fetched here again: main
   * already answers with the up-to-date set as part of the switch itself.
   */
  allPanelIds: readonly string[]
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  // An empty panel list means first run (or a reset canvas): the store returns
  // no panels and the renderer decides what "nothing" opens with. That also
  // makes closing every panel and relaunching give back one fresh panel rather
  // than a blank canvas — intended, since a canvas with nothing on it and no
  // visible affordance is the outcome this design already rejected.
  const [panels, setPanels] = useState<Panel[]>(() =>
    initial.panels.length > 0 ? toPanels(initial.panels) : firstRunPanels()
  )
  // Brief #20. The terminals that came back from disk, fixed at mount — the
  // reopen notice's subject. Read from the first `panels` value, never from a
  // later one: a panel spawned after launch was not restored.
  const [restoredTerminals] = useState(() => (initial.panels.length > 0 ? panels.filter(isTerminalPanel).map((p) => ({ id: p.rect.id, label: panelLabel(p) })) : []))
  const [groups, setGroups] = useState<CanvasGroup[]>(() => initial.groups ?? [])
  // M56. Bookmarks: places, persisted beside the camera, per workspace.
  const [bookmarks, setBookmarks] = useState<PersistedBookmark[]>(() => initial.bookmarks ?? [])
  // M79. Runs: a history kept with the layout, owned by useRuns below.
  // M121 (6). `sealAbandoned` seals every open run at load — the idle predicate
  // it now takes is inert here (every panel is idle at load), and the stale
  // row a seeded `running` auto status shows comes through useRuns.onAutoEvent;
  // carried to M124 rather than redesigned here.
  const [runs, setRuns] = useState<PersistedRun[]>(() => sealAbandoned(initial.runs ?? [], Date.now()))
  // M316. The runs THIS launch's seal cut off — open in the saved layout, so
  // the relaunch interrupted them. Fixed at mount: a run sealed last launch
  // was already told about then, and is not news now.
  const [runsCutOff] = useState<ReadonlySet<string>>(() => new Set((initial.runs ?? []).filter((r) => r.endedAt === undefined).map((r) => r.id)))
  // M93. Notes in the margins: layout, saved with the workspace, absent on disk when empty.
  const [annotations, setAnnotations] = useState<Annotation[]>(() => initial.annotations ?? [])
  // M181. The starter record: which manifest keys were ever applied to this
  // workspace. Absent until the first application; a record, not layout —
  // never in history, kept across a reset's undo like runs and bookmarks.
  const [starter, setStarter] = useState<PersistedStarter | undefined>(() => initial.starter)
  // M287. Orchestrate's per-workspace layout record: seeded from the workspace,
  // written by the Orchestrate page, saved beside the starter.
  const [orchestrate, setOrchestrate] = useState<PersistedOrchestrate | undefined>(() => initial.orchestrate)
  const orchestrateRef = useRef(orchestrate)
  orchestrateRef.current = orchestrate
  const starterRef = useRef(starter)
  starterRef.current = starter
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  // M113. The board's records: saved with the workspace, absent on disk when
  // empty, and NOT in history — records like runs and bookmarks, not layout.
  const [workItems, setWorkItems] = useState<PersistedWorkItem[]>(() => initial.workItems ?? [])
  const workItemsRef = useRef(workItems)
  workItemsRef.current = workItems
  // D11. This record is intentionally separate from the live panel graph:
  // close removes geometry, never the task's retained meaning.
  const [retainedOutcomes, setRetainedOutcomes] = useState<RetainedOutcome[]>(() => initial.retainedOutcomes ?? [])
  const retainedOutcomesRef = useRef(retainedOutcomes)
  retainedOutcomesRef.current = retainedOutcomes
  const [resumeDismissed, setResumeDismissed] = useState(false)
  const [resumeSummary, setResumeSummary] = useState<ResumeSummary | null>(null)
  // #10. The resumed task's next action, shown in its lens bar after Continue — the summary's collapsed form.
  const [resumedNext, setResumedNext] = useState<{ itemId: string; text: string; action?: ResumeSummary['action'] } | null>(null)
  // M114/M115. The board verbs Canvas installs after the palette memo exists (see usePaletteActions' boardVerbsRef).
  const boardVerbsRef = useRef<BoardVerbs>({})
  const markLaneClosed = useCallback((chatId: string) => {
    const item = workItemsRef.current.find((candidate) => candidate.panelId === chatId)
    if (item !== undefined) {
      const captured = retainOutcome(item, runsRef.current, Date.now())
      if (captured !== null) setRetainedOutcomes((current) => [captured, ...current.filter((outcome) => outcome.itemId !== item.id)].slice(0, 200))
    }
    setWorkItems((current) => current.some((i) => i.panelId === chatId)
      ? current.map((i) => (i.panelId === chatId ? carryWorkItem({ ...i, note: 'lane closed', anchor: undefined, updatedAt: Date.now() }) : i))
      : current)
  }, [])
  // M114. `working` from the RUNTIME: the lane chat's first message start.
  useEffect(() => onChatTurnStart((chatId) => {
    setWorkItems((current) => current.some((i) => i.panelId === chatId && i.state === WORK_ITEM_STATES[0])
      ? current.map((i) => (i.panelId === chatId && i.state === WORK_ITEM_STATES[0] ? carryWorkItem({ ...i, state: WORK_ITEM_STATES[1] as PersistedWorkItem['state'], updatedAt: Date.now() }) : i))
      : current)
  }), [])
  // M93. Annotate mode is EXPLICIT: entered from the palette, left by Escape
  // or the strip's Done. A selected note is the canvas's, like a selected
  // edge; the editing note is the one whose input is open.
  const [annotating, setAnnotating] = useState(false)
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null)
  const [editingAnnotation, setEditingAnnotation] = useState<string | null>(null)
  // M395. Read by endAnnotate at press time: the label still being typed is
  // left to its editor's own commit, never dropped as empty under it.
  const editingAnnotationRef = useRef(editingAnnotation)
  editingAnnotationRef.current = editingAnnotation
  const annotationSeq = useRef(0)
  // The pointer hook is called above the verb's declaration (the M28 ordering
  // rule): it reads the verb through a ref, as beginNewChatRef does.
  const placeAnnotationRef = useRef<(world: { x: number; y: number }) => boolean>(() => false)
  // M155. The annotate mode's TOOL (`label` places M93's note, `draw` inks a
  // stroke) — a view state, remembered for the session, never persisted —
  // and the stroke in progress, painted live by the layer.
  const [annotateTool, setAnnotateTool] = useState<'label' | 'draw'>('label')
  const [inkDraft, setInkDraft] = useState<Array<[number, number]> | null>(null)
  const inkToolRef = useRef<() => boolean>(() => false)
  const commitInkRef = useRef<(points: Array<[number, number]>, scale: number) => void>(() => {})
  const runsRef = useRef(runs)
  runsRef.current = runs
  // M79. useRuns is created far below (it needs restartWithSpec); the workspace
  // verbs above it reach its `forgetOpen` through a ref, the same indirection
  // every other late-declared verb here uses.
  const forgetOpenRunsRef = useRef<() => void>(() => {})
  // M231. A workspace switch replaces every panel, so every edge signal it
  // held is about panels that are no longer on this canvas. Cleared here,
  // beside the runs it belongs with, rather than left to the per-panel
  // forgetEdgesFor calls — those fire on CLOSE, and a workspace switch closes
  // nothing.
  const forgetOpenRuns = useCallback(() => { forgetOpenRunsRef.current(); forgetAllEdges(); forgetAllAgentLinks() }, [])
  // M80. The sheet is opened by usePaletteActions, which is created above the
  // instantiate verb; the ref is the same indirection every late verb uses.
  const instantiateTemplateRef = useRef<(template: PersistedTemplate, values: Record<string, string>, caller?: AgentPlanCaller) => Promise<SpawnResult>>(async () => ({ kind: 'refused', reason: 'the canvas is not ready' }))
  const instantiateTemplateStable = useCallback((template: PersistedTemplate, values: Record<string, string>) => instantiateTemplateRef.current(template, values), [])
  /**
   * M133. How many times M80's instantiation has been ENTERED, for
   * `workflow.panel.1e`: the whole claim of the workflow panel's Run is that
   * it reaches this one function and never a second copy of it, and only a
   * count can tell those apart. A ref, not state — nothing renders from it.
   */
  const instantiateCountRef = useRef(0)
  // The open run's duration ticks once a second, and only while one is open:
  // Date.now() read every render would give the rail's rows a new identity at
  // drag frequency (M79's verifier).
  const [runTick, setRunTick] = useState(0)
  const bookmarksRef = useRef(bookmarks)
  bookmarksRef.current = bookmarks
  const bookmarkRows = useMemo(() => bookmarks.map((b) => ({ id: b.id, name: b.name })), [bookmarks])
  const nextGroupIdRef = useRef(
    (initial.groups ?? []).reduce((next, group) => {
      const match = /^g(\d+)$/.exec(group.id)
      return match ? Math.max(next, Number(match[1]) + 1) : next
    }, 1)
  )
  /**
   * M14's merged view: every workspace's panels on one canvas, in lanes.
   *
   * TRANSIENT view state, deliberately not a persisted setting. It is the
   * palette being open, not the rail being collapsed: persisting it would
   * mean a launch that reads every workspace's panels and mints a session for
   * each before the user has done anything at all.
   *
   * `mergedData` is main's answer (workspace:merged) and `merged` is whether
   * the user is looking at it; they are separate because leaving must not
   * throw away what was fetched mid-flight, and because a null `mergedData`
   * with `merged` true is the moment between the toggle and the answer.
   */
  const [merged, setMerged] = useState(false)
  const [mergedData, setMergedData] = useState<MergedWorkspace[] | null>(null)
  // Selection and drag handlers need the merged boundary before their own
  // declarations below; the stable ref also keeps memo'd panel callbacks from
  // changing identity when this transient view toggles.
  const mergedRef = useRef(merged)
  mergedRef.current = merged
  const mergedView = useMemo(
    () => (mergedData ? mergedLayout(mergedData) : null),
    [mergedData]
  )
  /**
   * What is RENDERED and TIERED — never what is SAVED.
   *
   * `panels` stays the active workspace's real array and remains the ONLY
   * thing the layout.save effect reads, which is what keeps the number of
   * writers to a workspace record at one. That split is the entire reason
   * geometry is read-only while merged: a rect here carries mergedLayout's
   * lane offset, so a drag would have to un-offset it and write it into
   * ANOTHER workspace's record while the coalesced save is writing this
   * one's — producing a well-formed layout.json with wrong coordinates in
   * it, found launches later with nothing naming the drag that caused it.
   */
  // M114. A dispatched card FOLLOWS its lane: its rect is re-derived from the
  // lane chat's every render (an M93 panel anchor, reached from the other
  // side) and never written back — the record keeps the offset, the panel
  // keeps the rect it had, and a drag of the card clears the anchor.
  const anchoredPanels = useMemo(() => {
    if (workItems.every((i) => i.anchor === undefined)) return panels
    return panels.map((p) => {
      const itemId = workCardItemId(p)
      if (itemId === undefined) return p
      const item = workItems.find((i) => i.anchor !== undefined && i.id === itemId)
      const lane = item?.anchor === undefined ? undefined : panels.find((q) => q.rect.id === item.anchor?.panelId)
      if (item?.anchor === undefined || lane === undefined) return p
      return { ...p, rect: { ...p.rect, x: lane.rect.x + item.anchor.dx, y: lane.rect.y + item.anchor.dy } }
    })
  }, [panels, workItems])
  const displayPanels = merged && mergedView ? mergedView.panels : anchoredPanels
  // M405 (D2). Untitled terminals' names, ordinals included, over the same list the rail names.
  // M407: computed ONCE here and handed to the rail and the Go-to rows, and
  // published for every label that holds one panel and no list (railLabel's
  // ~20 single-panel callers), so the rim's `home 2` is `home 2` everywhere.
  // M407 follow-up: the merged view numbers in its own book (`ordinalBook`'s
  // reason), and `~/x` is the same place as `<home>/x`.
  const inMergedView = merged && mergedView !== null
  const terminalNameOf = useMemo(
    () => terminalNames(displayPanels, ordinalBook(inMergedView ? 'merged' : 'workspace'), window.canvas?.home),
    [displayPanels, inMergedView])
  // Published in a LAYOUT effect, not during render: a render React throws
  // away would otherwise leave its names behind. The cost is the one M407
  // recorded, one render later: a single-panel caller rendered in this pass
  // reads the previous map (a new terminal's place without its ordinal).
  useLayoutEffect(() => { publishTerminalNames(terminalNameOf) }, [terminalNameOf])
  // Entry motion belongs to a panel's creation, not its mount. TerminalPanel
  // deliberately unmounts as it crosses LOD tiers, and replaying an entrance
  // after a pan would turn ordinary navigation into motion. The id is removed
  // when the wrapper animation ends, so its one-time render cost cannot join
  // the canvas's 60Hz path either.
  const [enteringPanelIds, setEnteringPanelIds] = useState<ReadonlySet<string>>(() => new Set())
  const [demotingPanelIds, setDemotingPanelIds] = useState<ReadonlySet<string>>(() => new Set())
  const [wakingPanelIds, setWakingPanelIds] = useState<ReadonlySet<string>>(() => new Set())
  // Hit testing and the pip layer keep the WHOLE array: a review node is a
  // real, clickable panel and an off-screen one is a real thing to point at.
  const rects = useMemo(() => displayPanels.map((p) => p.rect), [displayPanels])

  /**
   * Tiering's input, and the reason a sessionless panel cannot take a
   * LIVE_BUDGET slot or a WebGL context: it is not in the array assignTiers is
   * given, so the guarantee is structural rather than a rule assignTiers has
   * to obey. The same filter gates registry.ensure below — a review node and a
   * file panel each have no spec to ensure with, and minting a PanelSession
   * for one would put a terminal in the map with nothing to run in it.
   *
   * `isTerminalPanel`, never `!isReviewPanel`. That spelling was correct while
   * `review` was the only sessionless kind and is wrong in the DANGEROUS
   * direction with two: a file panel satisfies !isReviewPanel, lands here,
   * reaches registry.ensure with no spec, and burns a budget slot and a WebGL
   * context on a <pre>. See isTerminalPanel's own comment in panels.ts.
   */
  const terminalPanels = useMemo(
    // displayPanels, so the merged view tiers foreign panels too — and
    // isTerminalPanel, main's POSITIVE predicate, never !isReviewPanel: with a
    // third kind on the canvas the negative test admits a file panel here,
    // which reaches registry.ensure with no spec and burns a budget slot and a
    // WebGL context on a <pre>.
    () => displayPanels.filter((p): p is TerminalPanelModel => isTerminalPanel(p)),
    [displayPanels]
  )
  const terminalRects = useMemo(() => terminalPanels.map((p) => p.rect), [terminalPanels])
  // M44. A ref mirror for the keyboard-nav listener, which reads the current
  // rects without re-subscribing every time a drag moves one.
  const terminalRectsRef = useRef(terminalRects)
  terminalRectsRef.current = terminalRects
  // A collapsed group is a presentation request, never a lifecycle command:
  // its panels remain in the registry and merely receive lod.ts's cheap card.
  const collapsedPanelIds = useMemo(() => new Set(
    groups.filter((group) => group.collapsed).flatMap((group) => group.panelIds)
  ), [groups])
  // hitTest returns the LAST match, so paint order and pick order agree only
  // if the array it receives is in paint order. Paint order is z now, not
  // array position — see the note on Panel.z.
  const hitOrder = useMemo(
    () => [...displayPanels].sort((a, b) => a.z - b.z).map((p) => p.rect),
    [displayPanels]
  )
  // M395. What a press on the canvas's own ground picks: hitOrder, except that
  // a frame's MIDDLE is ground (panels.ts's `pickRects`) — so a sweep that
  // starts inside a region is a marquee over its contents, never a click on
  // the region. Only the background press and link mode read it; everything
  // that looks a panel's rect up by id keeps hitOrder's one rect per panel.
  const pickOrder = useMemo(
    () => pickRects([...displayPanels].sort((a, b) => a.z - b.z)),
    [displayPanels]
  )
  // M35. Read through a ref because hitOrder is a fresh array on every frame
  // of a panel drag, and useLinkDraw's document listeners are installed once.
  // Declared here, immediately after hitOrder itself, rather than beside the
  // other display-time refs further down (displayPanelsRef's neighbourhood):
  // useLinkDraw is constructed further below, once viewportRef exists (see
  // its own comment there for why THAT is deferred), and this ref has to
  // exist before that construction reads it.
  const hitOrderRef = useRef(hitOrder)
  hitOrderRef.current = hitOrder

  // M13. Armed by the palette's `panel.link` row and the inspector's Link
  // button; resolved by the next mousedown on the canvas (see
  // onLinkModeMouseDownCapture). Declared up here because the mousedown
  // handler and the render both read it.
  const linkMode = useLinkMode()
  // Declared before useViewport (which takes it as an argument) rather than
  // grouped with the other callbacks below: a const used before its
  // declaration is a TDZ error, not just a style preference.
  //
  // The id is a monotonic sequence, NOT the array's length. Length-derived ids
  // were sound while the array only grew; removePanel breaks that — spawn n13, close any
  // panel, spawn again, and the second panel is n13 too. Every consequence is
  // silent: registry.ensure returns the EXISTING session, so the new panel
  // renders the old one's handle.host (which can only live in one slot), and
  // setPanelRect/removePanel then act on both entries at once. The counter is a
  // ref rather than state because nothing renders it. `n` keeps it clear of the
  // seed panels' `s` ids.
  //
  // Seeded from the RESTORED ids, never from a constant. `1` on every run was
  // sound while the array always started empty; persistence breaks that.
  // Restore a canvas holding n5, press Cmd+N five times, and the fifth panel is
  // n5 too — the same duplicate-id defect the comment above describes,
  // resurrected through a different door.
  //
  // M7: seeded from `allPanelIds` — EVERY workspace's ids, not just this
  // one's (`initial.panels`) — for the same persistence reason, arriving
  // through a different door. PanelId doubles as the tmux session name, so
  // Cmd+N in workspace B minting an id workspace A already uses is two panels
  // naming one session; the second to go live attaches to the first one's
  // process, with nothing visibly wrong on either panel. `switchWorkspace`
  // re-seeds this same ref from ActivateResult.allPanelIds on every switch,
  // for the identical reason.
  // ONE seeding rule for all five prefixes, shared with switchWorkspace and
  // with M55's recovery: seedAfter (panels/recover.ts). The character class
  // used to live inline here and in useWorkspaceVerbs, each warning that
  // missing the other reopened the duplicate-id defect; a third copy for
  // recovery would have been a third door.
  const nextIdRef = useRef(seedAfter(allPanelIds, 1))
  // The undo stack holds Panel[] — the same array persistence already
  // serialises. Camera moves are deliberately absent: pan and zoom are
  // continuous and self-evidently reversible by doing the opposite, and
  // putting them here would make Cmd+Z usually rewind a scroll instead of the
  // edit the user meant.
  //
  // The `present` half of History is read only through the updater callbacks
  // below (setHistory((h) => ...)), never off a `history` local — every read
  // site needs the LATEST past/future, and closing over a render's snapshot
  // would undo/redo against a stale stack the moment two edits landed in the
  // same tick. Destructuring only the setter also keeps `noUnusedLocals`
  // honest instead of manufacturing a read nothing else needs.
  // M409: `history` is also read for whether ⌘K's Undo/Redo rows can run
  // (two booleans, below). Never undo against it, for the reason above.
  const [history, setHistoryState] = useState<History<Panel[]>>(() => createHistory(panels))
  // M407. The history as the LAST updater left it — read by the test hook's
  // depth and nothing that decides an undo (those decide inside the updater).
  // M407 follow-up: assigned inside the updater, never from the render's
  // `history` (which lags every update still queued in this tick).
  const historyRef = useRef(history)
  /**
   * M407. A RETIRED CAPTION COMES BACK ON ⌘Z. The panel history holds panels,
   * not annotations, so a retirement is its own entry here, pinned to the
   * history's `present` as it stood right after the press that retired it
   * (the press may also have raised the panel — one history push). ⌘Z takes
   * the retirement back while that is still the present, i.e. while it is the
   * newest thing that happened; once a later edit moved the panels, ⌘Z walks
   * the panel history back to that present first, and the caption returns on
   * the press after. `present: null` until the press's render commits.
   */
  const captionUndoRef = useRef<Array<{ present: Panel[] | null; captions: Annotation[] }>>([])
  const captionRedoRef = useRef<Array<{ present: Panel[]; captions: Annotation[] }>>([])
  /**
   * M407 follow-up. Every history write goes through here. An UPDATER (commit,
   * undo, redo) records what it returns in `historyRef`; a plain VALUE is a
   * reset (`createHistory` — reset, a workspace switch, a move out), and a
   * reset drops the caption entries with the panels' past: they were pinned
   * to a `present` that no longer exists, and after a switch they would put
   * one workspace's captions back on another's canvas.
   */
  const setHistory = useCallback<Dispatch<SetStateAction<History<Panel[]>>>>((update) => {
    if (typeof update !== 'function') { captionUndoRef.current = []; captionRedoRef.current = [] }
    setHistoryState((h) => {
      const next = typeof update === 'function' ? update(h) : update
      historyRef.current = next
      return next
    })
  }, [])

  // Declared before onSpawn (which uses it) rather than grouped with the
  // other undo plumbing below applyHistory needs: applyHistory itself needs
  // setSelectedIds/setFocusedId/setDormantIds, which are not declared until
  // further down, so it is defined after them. commitHistory has no such
  // dependency and can be pushed up here instead of forward-declaring onSpawn.
  //
  // A note on a pattern used throughout this file's history plumbing: onSpawn,
  // onClosePanel, and onSelectPanel below all call commitHistory (which itself
  // calls setHistory) from INSIDE a setPanels(current => ...) updater, and the
  // undo/redo paths (the effect above and __m4bUndo) call applyHistory (which
  // calls four more setters) from inside a setHistory updater. React's
  // documented contract is that updater functions are pure — no side effects.
  // This is safe ONLY because this app deliberately runs without StrictMode
  // (see src/renderer/main.tsx and CLAUDE.md's "No StrictMode" note): under
  // StrictMode, React double-invokes updaters in development to surface
  // exactly this kind of impurity, and every operation here (pushHistory,
  // registry.dispose, the setState calls in applyHistory) is idempotent under
  // a second invocation with the same arguments, but the DOUBLE-INVOCATION
  // itself — two dispose() calls, two history pushes — is not something this
  // code has been proven against. If StrictMode is ever turned back on, this
  // whole call chain needs re-auditing before trusting it again.
  const commitHistory = useCallback((next: Panel[]) => {
    // M407. A new edit drops a caption's redo, as it drops the panels' future.
    captionRedoRef.current = []
    setHistory((h) => pushHistory(h, next))
  }, [])

  // The template Cmd+N spawns. A ref, not state: it is read inside onSpawn's
  // callback and a re-render is pointless — nothing on screen depends on it.
  //
  // SEEDED from the prop, not from undefined. main pushes PRESET_DEFAULT at
  // did-finish-load, which is over before this component's effects run, so the
  // subscription below never sees the boot push — renderer/main.tsx catches it
  // at module scope and it arrives here as a prop. Seeding from undefined
  // instead reads as harmless (makePanel falls back to a login shell) and is
  // exactly the silent inertness that made every configured default do
  // nothing; verify:panels 32 is the check that fails if this goes back.
  // The subscription stays for the re-push case: a runtime change to the
  // presets or the default still has to land after mount.
  const defaultTemplateRef = useRef<PresetTemplate | undefined>(defaultTemplate)

  // M65. A sheet spawn is a USER-initiated one: it is focused on arrival, and
  // focus is what promotes it live regardless of the budget — which is why a
  // typed command needs no "spawn at a stated grid" door. The id is queued
  // here and selected once the panel exists in state (the effect below).
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  // M402 (B4). ONE PLACEMENT RULE FOR EVERY CREATE DOOR: a free spot near the
  // parent or where the person is looking, never inside a group the object
  // does not belong to, then a flight to it at a readable zoom (place-new.ts's
  // placePanel, placement.ts's placeNew, useViewport's reveal). `placer()` is
  // called OUTSIDE the door's setPanels updater — it reads the DOM (the
  // chrome, the view) and the groups once — and what it returns runs INSIDE
  // the updater over `current`: the cascade's batching rule, kept. It queues
  // the made object for the reveal effect (below jumpAnywhere), which flies
  // once the object is rendered; `quiet` is for a mint no person asked for
  // (a workflow's pool), where a camera that moved by itself would be taken
  // from them. `lit` lands with the attention jump's arrival glow.
  // Every object made since the last reveal (M402 follow-up: a list — one
  // slot showed only the last of N creates batched into one tick).
  const pendingRevealRef = useRef<{ id: string; lit?: true }[]>([])
  const clusterHullsRef = useRef<readonly TaskCluster[]>([])
  const placer = useCallback((opts: { quiet?: true; lit?: true; exact?: boolean } = {}): PlaceFn => {
    // A point the person GAVE (a double-click, a drop, the starter's layout)
    // is kept exactly, as M395 kept it.
    if (opts.exact === true) return <T extends Panel>(_current: readonly Panel[], made: T): T => made
    const room = readPlacementRoom(hostRef.current, viewportRef.current)
    const groupsNow = groupsRef.current
    // The task regions as they are drawn (clusterHulls, read once like the
    // groups). An ANCHORED object goes beside its parent and joins the
    // parent's task, so the regions are obstacles only for the others.
    const regions = clusterHullsRef.current.filter((c) => c.kind === 'task').map((c) => c.rect)
    // QUIET too when an agent's line or a workflow node made it (place-quiet.ts):
    // no reveal follows, so an anchored object takes a spot in view first.
    const quiet = opts.quiet === true || placementQuiet()
    return <T extends Panel>(current: readonly Panel[], made: T, how?: PlaceHow): T => {
      // The updater may run twice (StrictMode): queue the id once.
      if (!quiet && !pendingRevealRef.current.some((p) => p.id === made.rect.id)) pendingRevealRef.current.push({ id: made.rect.id, ...(opts.lit === true ? { lit: true as const } : {}) })
      return placePanel(made, current, room, groupsNow, { ...(how?.anchored === true ? how : { ...how, regions }), ...(quiet ? { preferView: true } : {}) })
    }
  }, [])
  const onSpawn = useCallback(
    (centre: Point, template?: PresetTemplate, opening?: { title?: string; context?: string; focus?: true; exact?: true; atCursor?: true }) => {
      // M443. A connected drop is exact: the panel lands on the release and
      // links back with a handoff-on-exit. A bare Cmd+N (no template, no
      // opening) uses the cursor when the mouse has moved, and still runs
      // place() so two presses with no further move keep cascading.
      const armed = takeArmedSpawn()
      const bare = template === undefined && opening === undefined
      const cursorPoint = bare ? spawnCursor() : null
      const asked = armed?.at ?? cursorPoint ?? centre
      const atCursor = opening?.atCursor === true || cursorPoint !== null || armed !== null
      const chosen = template ?? defaultTemplateRef.current
      const presetSized = chosen?.w !== undefined || chosen?.h !== undefined
      const size = atCursor && !presetSized ? spawnSize(panelsRef.current, selectedIdsRef.current) : (chosen ? { w: chosen.w, h: chosen.h } : undefined)
      const id = `n${nextIdRef.current++}`
      if (opening?.focus) setPendingFocusId(id)
      setEnteringPanelIds((current) => new Set(current).add(id))
      // M402. The one placement rule (placer, above) unless the caller gave an EXACT point.
      // An armed connected spawn is exact too: the person dropped on that point.
      const place = opening?.exact === true || armed !== null ? null : placer()
      setPanels((current) => {
        // Where the panel ACTUALLY goes. Without this, N presses at an
        // unmoved camera produce N byte-identical rects and the canvas looks
        // like it holds one panel — see cascadeCentre for the whole argument.
        // M402: the free spot nearest the view's centre (placePanel), with
        // the cascade as its last resort.
        //
        // `current` — this updater's own argument — and never a panelsRef.
        // React applies queued updaters sequentially, so two spawns batched
        // into one tick each see the previous one's array; a ref (written a
        // render later) would hand both presses the same array and both would
        // pick the same slot, which is the stacking bug resurrected through a
        // door that only opens under batching.
        //
        // The placer being PURE is also what keeps this line clear of the
        // hazard the note above describes: called twice with the same
        // `current` it returns the same point, so a StrictMode double-invoke
        // could not place the panel somewhere else.
        const made: Panel = { ...makePanel(
            id,
            asked,
            nextZ(current),
            chosen
              ? {
                  panelId: id,
                  cwd: chosen.cwd,
                  args: [...chosen.args],
                  ...(chosen.command !== undefined ? { command: chosen.command } : {}),
                  ...(chosen.agent !== undefined ? { agent: chosen.agent } : {})
                  ,
                  // M20. The knobs, same absent-stays-absent rule as the two
                  // fields above it — this is the copy verify:panels 156
                  // exists to catch, because a key dropped here is legal
                  // TypeScript and produces a panel with no knobs, which
                  // looks exactly like a user who never asked for any.
                  ...(chosen.agentOptions !== undefined ? { agentOptions: chosen.agentOptions } : {}),
                  // M37. The same rule, a fifth time.
                  ...(chosen.worktree !== undefined ? { worktree: chosen.worktree } : {}),
                  // M147/M149. A sixth time, and the one the Act II critic
                  // caught: without this line a preset's env — and the
                  // sheet's Env field, which main merges into this same
                  // template — was dropped here, after the parser and before
                  // buildPtyEnv, so the form did nothing (core env.spawn.1).
                  ...(chosen.env !== undefined ? { env: { ...chosen.env } } : {})
                }
              : undefined,
            size
          ), ...(opening?.title === undefined ? {} : { title: opening.title }) }
        let next = [...current, place === null ? made : place(current, made)]
        if (armed !== null) {
          next = setLinkAutomation(addLink(next, armed.from, id), armed.from, id, { kind: 'handoff', enabled: true, trigger: 'exit' })
        }
        commitHistory(next)
        return next
      })
    },
    [commitHistory, placer]
  )
  const [openingContexts, setOpeningContexts] = useState<Map<string, string>>(() => new Map())
  // A STABLE identity, and the reason is TerminalPanel's memo. This was an
  // inline arrow on every terminal panel — a new function on every Canvas
  // render, and Canvas renders on every mousemove — so every panel's memo
  // re-rendered at 60Hz regardless of `version`, `title`, `glow` and M35's
  // `onBeginLink`/`linkTarget` discipline, all of which exist to protect it.
  // Nothing threw and nothing looked wrong; the app just got heavy while a
  // panel was dragged. Closes over a setter only, so the list is empty.
  // verify:panels memo-stable.1 pins the JSX.
  const onContextPasted = useCallback((id: string) => {
    setOpeningContexts((current) => { const next = new Map(current); next.delete(id); return next })
  }, [])
  /**
   * M88. ONE verb for both work panels: the item's id, title and body become
   * the new panel's opening context and its title. `source` is the word the
   * context leads with (`Jira ticket`, `GitHub issue`), because the agent
   * reading it should know which system the id belongs to.
   */
  const spawnWorkItem = useCallback((item: WorkItem, source: string) => {
    const id = `n${nextIdRef.current}`
    setOpeningContexts((current) => new Map(current).set(id, `${source} ${item.id}: ${item.title}\n\n${item.description}`))
    onSpawn(viewCentre(hostRef.current, viewportRef.current), undefined, { title: `${item.id}: ${item.title}` })
  }, [onSpawn])
  const spawnJiraTicket = useCallback((item: WorkItem) => spawnWorkItem(item, 'Jira ticket'), [spawnWorkItem])
  // M113. `Add to board` on a work panel's row. The key is the provider's own
  // id (`owner/repo#N`, `PROJ-12`) — the identity the dedupe reads, so a
  // second press updates rather than duplicates. Declared after the palette
  // memo exists (it calls addWorkItem), which is why these are functions of
  // a ref rather than closures over paletteActions.
  const addToBoardRef = useRef<(item: WorkItem, source: 'github' | 'jira') => void>(() => undefined)
  const addGithubToBoard = useCallback((item: WorkItem) => addToBoardRef.current(item, 'github'), [])
  // M113. The keys already on the board, so a row reads `On board` (still pressable — a second press updates).
  const boardKeys = useMemo(() => new Set(workItems.flatMap((i) => (i.key === undefined ? [] : [i.key]))), [workItems])
  const addJiraToBoard = useCallback((item: WorkItem) => addToBoardRef.current(item, 'jira'), [])
  const spawnGithubItem = useCallback((item: WorkItem) => spawnWorkItem(item, item.state === 'review requested' || item.state === 'pull request' ? 'GitHub pull request' : 'GitHub issue'), [spawnWorkItem])
  const openGithubPanel = useCallback(() => {
    const id = `g${nextIdRef.current++}`
    const place = placer()
    setPanels((current) => { const centre = viewCentre(hostRef.current, viewportRef.current); const next = [...current, place(current, makeGithubPanel(id, centre, nextZ(current)))]; commitHistory(next); return next })
  }, [commitHistory, placer])
  // M116. A work card for an item, at the viewport's centre. The title is
  // the item's at mint (the rail's `work · <title>`); a card for an item the
  // board does not hold is refused by name — it would render "no longer on
  // the board" from its first frame.
  const spawnWorkCard = useCallback((itemId: string): void => {
    const item = workItems.find((i) => i.id === itemId)
    if (item === undefined) return
    const id = `k${nextIdRef.current++}`
    const place = placer()
    setPanels((current) => { const centre = viewCentre(hostRef.current, viewportRef.current); const next = [...current, place(current, makeWorkPanel(id, centre, nextZ(current), item.id, item.title))]; commitHistory(next); return next })
  }, [commitHistory, workItems, placer])
  const openJiraPanel = useCallback(() => {
    const id = `j${nextIdRef.current++}`
    const place = placer()
    setPanels((current) => { const centre = viewCentre(hostRef.current, viewportRef.current); const next = [...current, place(current, makeJiraPanel(id, centre, nextZ(current)))]; commitHistory(next); return next })
  }, [commitHistory, placer])
  // The selection is a SET: M18's marquee and M26's additive click build a
  // multi-selection without renaming the older single-selection call sites.
  //
  // focusedId is deliberately NOT widened alongside it. assignTiers pins the
  // focused panel live unconditionally, so focus is a budget-and-WebGL-context
  // claim rather than a highlight — a set of them would hold LIVE_BUDGET slots
  // for the rest of the run, with nothing on screen saying so.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() =>
    initial.selectedId === null ? EMPTY_SELECTION : new Set([initial.selectedId])
  )
  // A visible, intentionally temporary keyboard route. It is not persisted:
  // a relaunch must never resume sending a user's next keystroke to several
  // agents just because that happened to be useful before the window closed.
  const [broadcastInput, setBroadcastInput] = useState(false)
  // A chrome press selects and begins its drag in the same synchronous event.
  // React has not re-rendered between those two calls, so group drag reads this
  // mirror rather than a selection closure from the previous render.
  const selectedIdsRef = useRef<ReadonlySet<string>>(selectedIds)
  selectedIdsRef.current = selectedIds
  // M405 (D3). A starter caption RETIRES once its object is taken up: selecting
  // the example is following the caption ("Click it to start a shell here"),
  // the same rule the launcher's starter tip follows when its door is used. A
  // person's own notes never retire; the merged view changes nothing.
  // M407: only a DIRECT, single selection of that object retires it — a press
  // on it, or Go to it — never a marquee that happens to sweep it up or a
  // selection a workspace switch restores (an effect on `selectedIds` took all
  // three); `selectAndRaise` calls this. And it is undoable (captionUndoRef).
  const retireCaptionsOf = useCallback((id: string): void => {
    if (mergedRef.current) return
    const retired = annotationsRef.current.filter((a) => isStarterCaption(a) && a.anchor.kind === 'panel' && a.anchor.panelId === id)
    if (retired.length === 0) return
    captionUndoRef.current = [...captionUndoRef.current, { present: null, captions: retired }]
    captionRedoRef.current = []
    const gone = new Set(retired.map((a) => a.id))
    setAnnotations((current) => current.filter((a) => !gone.has(a.id)))
  }, [])
  // The press's raise (if any) pushed its history entry in the same event, so
  // by this commit `history.present` is what "right after the retirement" is.
  useEffect(() => {
    for (const entry of captionUndoRef.current) if (entry.present === null) entry.present = history.present
  }, [annotations, history])
  /**
   * M407. ⌘Z / ⌘⇧Z for a retirement; true when the press was spent on one.
   * M407 follow-up: `present` is the history the press's own updater was
   * handed. Read from a ref, two presses in one tick both saw the history
   * before the first one's undo, so the second walked the panels back again
   * instead of bringing the caption back.
   */
  const stepCaptionHistory = useCallback((direction: 'undo' | 'redo', present: Panel[]): boolean => {
    if (direction === 'undo') {
      const top = captionUndoRef.current[captionUndoRef.current.length - 1]
      if (top === undefined || top.present !== present) return false
      captionUndoRef.current = captionUndoRef.current.slice(0, -1)
      captionRedoRef.current = [...captionRedoRef.current, { present, captions: top.captions }]
      setAnnotations((current) => { const have = new Set(current.map((a) => a.id)); return [...current, ...top.captions.filter((a) => !have.has(a.id))].slice(-ANNOTATIONS_MAX) })
      return true
    }
    const top = captionRedoRef.current[captionRedoRef.current.length - 1]
    if (top === undefined || top.present !== present) return false
    captionRedoRef.current = captionRedoRef.current.slice(0, -1)
    captionUndoRef.current = [...captionUndoRef.current, { present, captions: top.captions }]
    const gone = new Set(top.captions.map((a) => a.id))
    setAnnotations((current) => current.filter((a) => !gone.has(a.id)))
    return true
  }, [])
  /**
   * The one selected panel, or null when zero OR MANY are selected. Every
   * existing reader of the selection — the inspector, the review query, the
   * rail, the HUD, the CanvasState written to disk — is asking "which single
   * panel is this about", and a multi-selection correctly reads as none: the
   * inspector's empty state is already a first-class state (verify:rail 27b),
   * not an error path that needs a new case adding to it.
   */
  const selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null
  /**
   * Replace the whole selection with one panel, or clear it. The verb every
   * pre-existing `setSelectedId(x)` call site wanted; the set-shaped setter
   * stays private to this component so a caller cannot grow the selection by
   * accident before the gesture that is supposed to exists.
   */
  /**
   * The selection as an ARRAY, memoised on the Set's identity.
   *
   * Not `[...selectedIds]` inline at the JSX: this flows into Palette's
   * `commands` memo, whose [rows] effect re-seats the selected row, so a fresh
   * array on every render would re-seat the palette's selection on every
   * mousemove over the canvas — the silent-selection-move defect
   * "resetViewport must stay a useCallback" documents. `selectedIds` keeps its
   * identity across renders that do not change the selection (EMPTY_SELECTION
   * and retainSelection both preserve it), which is what makes this stable.
   */
  const selectedPanelIds = useMemo(() => [...selectedIds], [selectedIds])

  // M78. The selected EDGE, exclusive with the panel selection: selecting a
  // panel or clicking the background clears it; selecting it clears them.
  const [selectedLink, setSelectedLink] = useState<{ from: string; to: string } | null>(null)
  // M389. The selected CONNECTOR, exclusive with both the panel selection and
  // the selected link — the same rule, one more kind of line.
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null)
  const selectOnly = useCallback((id: string | null): void => {
    const next = id === null ? EMPTY_SELECTION : new Set([id])
    selectedIdsRef.current = next
    setSelectedIds(next)
    setSelectedLink(null)
    setSelectedConnectorId(null)
  }, [])
  /** Additive selection is deliberately add-only: background click clears. */
  const addToSelection = useCallback((id: string): void => {
    // A merged selection could contain ids owned by several workspaces. The
    // marquee already refuses to construct one there; shift-click must uphold
    // the same boundary rather than reopening that path through panel chrome.
    if (mergedRef.current || selectedIdsRef.current.has(id)) return
    const next = new Set(selectedIdsRef.current)
    next.add(id)
    selectedIdsRef.current = next
    setSelectedIds(next)
    setSelectedLink(null)
    setSelectedConnectorId(null)
  }, [])
  // M13/motion: an entry animation ends and the id leaves the set. Kept
  // beside the selection helpers rather than folded into them — it is a
  // render-cost concern, not a selection one.
  const onPanelEntryEnd = useCallback((id: string) => {
    setEnteringPanelIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
    setDemotingPanelIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
    setWakingPanelIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])
  const [focusedId, setFocusedId] = useState<string | null>(initial.focusedId)
  // M173: the HUD no longer prints the cursor; the state stays (the pointer hook
  // sets it per mousemove — backlog #87 owns removing that re-render) and nothing reads it.
  const [, setCursor] = useState<Point>({ x: 0, y: 0 })
  /**
   * The rubber band, in SCREEN pixels, or null when no marquee is in
   * progress. Screen rather than world because that is what the band is
   * PAINTED in — see Marquee.tsx — while the selection it drives is computed
   * in world units from the same two points; the two spaces are derived from
   * one gesture rather than kept in step by hand.
   */
  const [marquee, setMarquee] = useState<MarqueeScreenRect | null>(null)
  /** The gesture's origin in WORLD units, or null between gestures. */
  const marqueeFromRef = useRef<Point | null>(null)
  /**
   * The in-progress gesture's own teardown, or null when none is running.
   *
   * beginMarquee's `endMarquee` closes over the listeners it must remove, so
   * it cannot be lifted out of that closure — and something OUTSIDE the
   * gesture (entering the merged view) has to be able to end it. A ref is the
   * narrowest way to publish exactly that one verb.
   */
  const marqueeEndRef = useRef<(() => void) | null>(null)

  // One shot: the backend cannot change during a run, so this is not a
  // subscription. A failure leaves it null and the HUD simply says nothing,
  // which is the correct silent case — we only ever speak up for bad news.
  const [backendInfo, setBackendInfo] = useState<SessionBackendInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.canvas.session
      .info()
      .then((info) => {
        if (!cancelled) setBackendInfo(info)
      })
      .catch((error: unknown) => {
        console.warn('[backend] could not read the session backend', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Panels that came from disk start dormant; first-run panels do not. The
  // renderer is what generates first-run panels, so it is also what knows
  // which panels were restored — no flag has to cross the IPC boundary.
  //
  // A restored panel with a live tmux session is subtracted out here: it has
  // no process to spawn, so M4b's dormancy rule does not apply to it — see
  // renderer/main.tsx for the full rule this settles.
  const [dormantIds, setDormantIds] = useState<ReadonlySet<string>>(
    () => new Set(initial.panels.map((p) => p.id).filter((id) => !liveSessionIds.has(id)))
  )
  // M81. `tc status` answers from an effect installed once, so every fact it
  // reads must come from a ref: a captured `dormantIds` told the supervisor a
  // woken panel was still asleep while the pill beside it said `idle`.
  const dormantIdsRef = useRef(dormantIds)
  dormantIdsRef.current = dormantIds
  const prevDormantRef = useRef<ReadonlySet<string>>(dormantIds)
  // Paint-only demote/wake: a single id flipping dormant gets a CSS beat.
  // A workspace switch replaces the whole set and must not choreograph every
  // card — that would be layout-adjacent motion on panels whose xterm is
  // already unmounted.
  useEffect(() => {
    const prev = prevDormantRef.current
    const demoted: string[] = []
    for (const id of dormantIds) if (!prev.has(id)) demoted.push(id)
    const woken: string[] = []
    for (const id of prev) if (!dormantIds.has(id)) woken.push(id)
    prevDormantRef.current = dormantIds
    if (demoted.length === 1) setDemotingPanelIds((current) => new Set(current).add(demoted[0]!))
    if (woken.length === 1) setWakingPanelIds((current) => new Set(current).add(woken[0]!))
  }, [dormantIds])

  // Applying a history state has to reach the registry too: an undone close
  // must recreate the panel's session, and it comes back DORMANT because its
  // PTY was killed on the click that closed it and there is nothing to
  // revive — registry.ensure (in the useMemo below) recreates the session
  // from scratch once the panel reappears in `panels`, and passing dormant:
  // true for it is what turns that into a card instead of a fresh spawn.
  //
  // Takes the PREVIOUS present array as its first argument, not just `next`.
  // Before M7 the departing set was derived from the WHOLE registry (every
  // session not in `next.present`), which was self-healing rather than a
  // shortcut: the registry only ever held ids from this one canvas's own
  // history, so "everything the registry has that `next` doesn't" and
  // "everything THIS transition just dropped" were the same set. M7 breaks
  // that equivalence — the registry now legitimately holds sessions for every
  // OTHER workspace too (see switchWorkspace's "demote, not dispose" doc
  // comment) — so a registry-wide diff would dispose every hidden workspace's
  // sessions on ANY undo/redo in this one, including a genuine no-op (empty
  // past/future, `next === previous`, nothing actually moved). Diffing
  // against the specific state this transition left, instead, gives the
  // right answer in both worlds: a real undo/redo still disposes exactly the
  // panel(s) that vanished from `present`, and a no-op disposes nothing,
  // because previousIds and ids are then identical.
  const applyHistory = useCallback((previousPresent: Panel[], next: History<Panel[]>) => {
    const ids = new Set(next.present.map((p) => p.rect.id))
    // Undo of a spawn (or redo of a close) removes a panel from `present`
    // without ever routing through onClosePanel, so without this loop a
    // panel undone out of existence keeps a live PTY forever: no panel
    // remains to render a close button for it, and the NEXT action clears
    // `future`, so redo cannot bring it back either. Calling registry.dispose
    // here is legitimate, not a violation of "tiering must never reach
    // dispose" — undo of a spawn IS an explicit panel removal, the same act
    // the close button and the reset handler perform, just driven by Cmd+Z
    // instead of a click. It does not add a caller of pty.kill: dispose(id)
    // and disposeAll() remain the only two (see session-registry.ts), and
    // routing through dispose() rather than calling pty.kill directly is
    // exactly what keeps that count true.
    // GUARDED FOR REVIEW NODES, the same branch onClosePanel takes one
    // screenful of reasons further down. A node owns no PanelSession, and
    // the registry's dispose sends pty.kill even for an id this renderer
    // holds no local session for (see CLAUDE.md, "dispose(id) sends pty.kill
    // even when this renderer holds no local session for that id") — so an
    // unguarded node undone out of existence sends a tmux kill-session named
    // after a panel that never had one, and drops in main the baseline of
    // whatever panel later recycles that id. M16's file panel is the SECOND
    // sessionless kind, and its arrival is what turns the old positive test
    // (`isReviewPanel`) from safe into wrong: a file panel satisfies
    // !isReviewPanel, so it would have taken the dispose branch and sent
    // exactly the stray kill this guard exists to prevent. The test is now
    // `!isTerminalPanel`, which is still a POSITIVE question about the one
    // kind that owns a process — see isTerminalPanel's own comment for why it
    // is spelled as it is. The guard stays on the ITERATION rather than on the
    // call, which is what keeps verify:panels 94's dispose-call-site count at
    // five.
    for (const panel of previousPresent) {
      if (!isTerminalPanel(panel)) {
        // A file panel's own cache still has to go — for the reason the two
        // clears below exist: without it the map grows for the life of the
        // renderer and a recycled id inherits a dead panel's file. Gated on
        // the panel actually being GONE, exactly as the dispose branch is: an
        // undo that merely moved a panel leaves it mounted, and clearing a
        // mounted panel's result puts it back to "reading…" with nothing left
        // to re-read it, because the effect's deps did not change.
        // The file is KEPT here (drop: false): an undo that removes a chat
        // panel can be redone, and the redone panel carries the same session
        // id — its transcript must still be there to render. Only an
        // explicit close, a reset and a workspace delete drop the file.
        if (!ids.has(panel.rect.id)) { clearFileResult(panel.rect.id); clearToolbox(panel.rect.id); disposeChat(panel.rect.id, false); disposeWatcher(panel.rect.id); clearBrowser(panel.rect.id); disposeRelayTerminal(panel.rect.id) }
        continue
      }
      if (!ids.has(panel.rect.id)) {
        registry.dispose(panel.rect.id)
        // Without this the agent-state map grows for the life of the
        // renderer and a recycled id inherits a dead panel's border.
        clearAgentState(panel.rect.id)
        // M231. Beside every other per-panel store cleared here: without it the
        // edge maps grow for the life of the renderer and a recycled panel id
        // inherits a dead edge's fire.
        forgetEdgesFor(panel.rect.id); forgetAgentLinksFor(panel.rect.id)
        clearLastLine(panel.rect.id)
        clearLastActive(panel.rect.id)
        clearLiveSession(panel.rect.id)
        clearSubagents(panel.rect.id)
        clearTrail(panel.rect.id)
        clearUsage(panel.rect.id)
        clearMachineCost(panel.rect.id)
        clearScrollbackTail(panel.rect.id)
      }
    }
    // File acceptance and handoff links are facts, not canvas geometry history.
    // M245: so is a sheet's loss consent — undoing a MOVE must not re-arm a confirmation.
    setPanels((current) => next.present.map((panel) => {
      const live = current.find((p) => p.rect.id === panel.rect.id)
      return isFilePanel(panel) && live && isFilePanel(live) && (live.source.checklist !== undefined || live.source.sheet !== undefined || live.source.deck !== undefined)
        ? { ...panel, source: live.source } : panel
    }))
    setGroups((current) => pruneGroups(current, ids))
    setDormantIds((current) => {
      const merged = new Set([...current].filter((id) => ids.has(id)))
      for (const panel of next.present) {
        const session = registry.get(panel.rect.id)
        // Read the registry's OWN dormant flag, not `!spawned`. registry.wake
        // clears session.dormant but does not spawn (a woken panel still has
        // to be promoted to live before attachSlot spawns it) — so a panel
        // woken while zoomed out below LIVE_MIN_SCALE stays unspawned with
        // dormant already false. Re-deriving from `!spawned` would put it
        // back in dormantIds on the next undo even though registry.ensure
        // (in the tiering memo) returns that SAME session untouched, leaving
        // its card reading "not started" instead of "click to start" until
        // another click. Keying off session.dormant means the two can never
        // diverge for a panel whose session already exists.
        //
        // A session of `undefined` is the OTHER case this loop has to cover:
        // undoing a close deletes the session entirely (registry.dispose),
        // so it does not exist yet here and the memo below recreates it from
        // scratch once `panels` re-renders. That recreation is what must
        // come back dormant (its PTY is gone with nothing to revive), so a
        // missing session counts as dormant too.
        if (!session || session.dormant) merged.add(panel.rect.id)
      }
      return merged
    })
    setSelectedIds((current) => retainSelection(current, (id) => ids.has(id)))
    setFocusedId((id) => (id && ids.has(id) ? id : null))
  }, [])

  // Mirrors focusedId into a ref so shouldYieldWheel (below) can read the
  // current focus without being redefined on every focus change — it must
  // stay referentially stable (useCallback with an empty dep list) so
  // useViewport's effect installs the wheel listener exactly once.
  const focusedIdRef = useRef(focusedId)
  focusedIdRef.current = focusedId
  // M44. Mirrors for the keyboard-nav listener, which installs once and reads
  // the current values through refs (the useViewport pattern).
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const lastFocusedAtRef = useRef<Record<string, number>>({})
  lastFocusedAtRef.current = registry.lastFocusedAt()

  // Same mirror-into-a-ref pattern, for the reset listener below: it must
  // install once, but panels changes on every frame of a drag.
  const panelsRef = useRef(panels)
  panelsRef.current = panels

  // M27. The same pattern again, for a value declared in the OTHER direction:
  // `noteRoot` depends on the selection and the live-session store and is
  // computed far below, while `beginNewNote` sits in the palette-actions memo
  // far above. Assigned where noteRoot is defined; read at CALL time, which is
  // also what makes the row act on the panel selected NOW rather than the one
  // selected when the palette opened.
  const noteRootRef = useRef<string | null>(null)
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  // Panels can disappear through close, undo, reset, or a workspace move.
  // Repair membership in one place so none of those paths leave a group
  // pointing at a vanished rect.
  useEffect(() => {
    const ids = new Set(panels.map((panel) => panel.rect.id))
    setGroups((current) => pruneGroups(current, ids))
  }, [panels])

  /**
   * The same mirror for the merged view's two facts, and the split between
   * them matters at every read site.
   *
   * `mergedRef` gates the MUTATING gestures (drag, resize, close, marquee).
   * Those handlers must keep a stable identity — onBeginDrag and onClosePanel
   * both go into TerminalPanel's memo'd props, and a fresh arrow per toggle
   * would re-render every panel — so they read the flag rather than close
   * over it.
   *
   * `displayPanelsRef` is what anything acting on WHAT IS ON SCREEN reads:
   * goToPanel and the attention jump both frame a rect, and while merged the
   * only rects that exist on screen are lane-offset ones. Reading `panels`
   * there would leave the rail listing a foreign panel whose row navigates
   * nowhere. Everything that acts on what is SAVED keeps reading panelsRef —
   * that is the read-only split, restated as two refs.
   */
  /**
   * What the canvas looked like the instant before the merged view opened:
   * the camera, the selection and the focus.
   *
   * The merged view's whole design claim is that it writes nothing, and until
   * this ref existed that claim was false for three of the four fields
   * layout.save persists. Panning while merged wrote a LANE-SPACE camera into
   * the active workspace's record — coordinates that mean nothing outside the
   * lane arrangement they came from — and selecting a foreign panel wrote its
   * id there too. Neither is recoverable by leaving, because the damage is
   * already on disk: quit while merged and the next launch opens onto empty
   * space with a selectedId naming a panel this workspace has never held.
   *
   * A ref rather than state because nothing renders from it and it must not
   * re-run the save effect on its own; null exactly when `merged` is false.
   */
  const preMergeRef = useRef<{
    camera: Viewport
    selectedId: string | null
    focusedId: string | null
  } | null>(null)
  const displayPanelsRef = useRef(displayPanels)
  displayPanelsRef.current = displayPanels

  /**
   * ONE in-flight flag covering BOTH async workspace transitions —
   * `switchWorkspace` and `toggleMerged` — because either one starting while
   * the other (or itself) is mid-flight corrupts a workspace RECORD, and the
   * two ways it does so are different enough that a per-function guard would
   * close only half of it.
   *
   * A switch's window is two IPC round trips (activate, then pty:list),
   * widened arbitrarily by whatever main is doing — pollLive's execFileSync
   * blocks main's event loop for the duration of a tmux subprocess every two
   * seconds. Inside that window:
   *
   *   Two Cmd+Shift+] presses. The second reads `workspaceRows.active`, which
   *   the first switch has not refreshed yet (reloadWorkspaces runs at the
   *   very END of the async block), re-targets the SAME id, and captures a
   *   second `outgoing` from `panelsRef` — still workspace A's panels,
   *   because setPanels has not landed either. Both activates write A's panel
   *   array, the second into B's record: A's panel ids listed in TWO
   *   workspaces, which is the one-tmux-session-two-panels hazard global
   *   panel ids exist to make impossible.
   *
   *   Cmd+Shift+A then Cmd+Shift+]. toggleMerged commits `preMergeRef` AFTER
   *   its two awaits, so the merge entry lands after the switch has already
   *   happened — and that ref then describes the OUTGOING workspace while
   *   `merged` is true, which is exactly what the layout.save effect reads.
   *   Every save for as long as the view stays open writes the previous
   *   workspace's camera, selection and focus into the INCOMING workspace's
   *   record, and leaving restores that camera over the switch's own. It is
   *   the corruption switchWorkspace's own merged-leave guard exists to
   *   prevent, reached from the other side.
   *
   * A second transition requested while one is in flight is REFUSED, never
   * queued: a queued switch lands on a canvas the user has since left, and
   * the rule this file already applies to an uncarried undo stack holds here
   * too — doing nothing is the honest failure, doing something is the
   * dangerous one. It is set SYNCHRONOUSLY at entry (both bodies run to their
   * first await synchronously, so nothing can interleave before it is set)
   * and cleared in a `finally`, so a throw or a rejection cannot wedge the
   * two chords dead for the rest of the run.
   */
  const transitionRef = useRef(false)

  // Same ordering problem, same fix as reloadWorkspacesRef below: the nav grid
  // (M11) needs `switchWorkspace` for its commit, and that is declared several
  // hundred lines further down — so useNavGrid cannot exist here, while both
  // consumers of "is the grid open" DO: shouldYieldWheel's rule 0 immediately
  // below, and the shouldIgnoreKeys passed into useViewport. It holds the
  // PREDICATE rather than a mirrored boolean so both read the hook's own ref
  // with no one-render lag, and both stay referentially stable — each sits in
  // an effect dep array that must never be torn down and reinstalled.
  // Populated by an effect right after useNavGrid is declared; read only from
  // event handlers, long after mount.
  const navGridIsOpenRef = useRef<() => boolean>(() => false)

  // The one place that decides who owns a wheel gesture. Four rules, and the
  // ORDER is the load-bearing part: the nav grid outranks everything, the
  // palette outranks zoom, and zoom outranks the focused panel.
  const shouldYieldWheel = useCallback((event: WheelEvent): boolean => {
    const target = event.target as HTMLElement | null

    // 0. While the nav grid is open every canvas gesture stands down. It has
    // already swallowed the keyboard; it would be strange for a pinch to zoom
    // the world behind it. Unlike rule 1 this is NOT a containment test: the
    // grid covers the whole canvas and yields the gesture by standing the
    // camera down rather than by handing it to a scroll host, so there is
    // nothing under the cursor for a target test to find.
    if (navGridIsOpenRef.current()) return true

    // 1. The palette owns EVERY wheel over itself, zoom gestures included. It
    // is a screen-space overlay mounted INSIDE .canvas, so useViewport's
    // capture-phase listener sees the event before the overlay does; without
    // this rule its preventDefault() suppresses the native scrolling of
    // .palette__list (max-height: 46vh, overflow-y: auto) and pans the camera
    // instead — the list simply never gets to move. The containment test is
    // explicit for the same reason onMouseDownCapture's is: .palette's own
    // bubble-phase stopPropagation cannot stop a capture listener on an
    // ancestor that has already run. Outranking rule 2 is deliberate and is
    // rule 3 of "who owns the keyboard" applied to the pointer: while the
    // palette is open, every other canvas gesture stands down.
    if (target?.closest?.('.palette')) return true

    // 1b. M46. The HUD's zoom cluster is the ONE pointer surface in the HUD:
    // a wheel over the buttons a user is about to press must not pan the
    // world underneath them. The rest of the HUD is pointer-events: none and
    // never becomes a target, so this rule fires only over the cluster.
    if (target?.closest?.('.canvas-hud')) return true

    // M69. The minimap takes the pointer (its own mousedown says so); a wheel
    // over it must not zoom the world under a thumb of the world.
    if (target?.closest?.('.minimap')) return true

    // M249. The command pill, rule 1's reason again: it is a screen-space
    // overlay inside .canvas, so its own onWheel stopPropagation runs AFTER
    // useViewport's capture listener has already panned the camera — a wheel
    // over the running-agents list would move the world instead of the list.
    if (target?.closest?.('.command-pill')) return true

    // 2. A zoom gesture is otherwise always the camera's, never a terminal
    // scroll, regardless of what is under the cursor. Both spellings are
    // claimed because canvas-input.ts treats both as a zoom intent: a trackpad
    // pinch arrives as a wheel with ctrlKey true, and Cmd+wheel is the mouse
    // equivalent. Claiming only ctrlKey would leave a mouse user who has
    // clicked into a panel unable to zoom the canvas while the cursor is over
    // it — and would make Cmd, the modifier every other canvas shortcut
    // requires, the one thing the canvas ignores here.
    if (event.ctrlKey || event.metaKey) return false

    // M399 (A5). The first-run launcher card, rule 1's reason once more: a
    // screen-space card inside .canvas with its own scroller (`.launcher`,
    // max-height and overflow-y: auto). At 1200×800 and below its lower
    // doors — the Starter canvas line the amber tip points at among them —
    // sit under the fold, and without this rule the wheel panned the empty
    // canvas behind the card instead, so nothing below the fold could be
    // reached with a wheel at all. Only while the card HAS something to
    // scroll, and after rule 2: a card that fits leaves the wheel to the
    // camera as before (verify:canvas 2 pans over it), and a pinch still
    // zooms.
    const card = target?.closest?.('.launcher')
    if (card && card.scrollHeight > card.clientHeight) return true

    // 3. A wheel belongs to a PANEL only when it is over the FOCUSED one AND
    // that panel owns internal scroll. Which panels do is answered by the
    // KIND, through what it renders: a live terminal's slot and a review
    // node's diff body both carry data-scroll-host, and a card carries
    // nothing. Deliberately NOT an `if (panel.kind === …)` here — this
    // predicate is the sole authority on wheel ownership, and every future
    // kind that scrolls would otherwise mean editing it again, in a function
    // whose whole recorded history is about how easily it can be narrowed
    // by accident.
    //
    // The old test was `.panel__slot`, which was this same question asked in
    // terminal-only vocabulary: a restored focusedId can name a panel lod.ts
    // still refuses to promote (dormancy beats focus), and a card has no
    // xterm to hand the event to — yielding there means the wheel reaches
    // nothing at all and the app reads as frozen.
    const id = focusedIdRef.current
    if (!id) return false
    const panel = target?.closest?.('.panel')
    if (panel?.getAttribute('data-panel-id') !== id) return false
    return panel.querySelector('[data-scroll-host]') !== null
  }, [])

  // The palette owns the keyboard while it is open; see usePalette's four
  // rules. restoreFocus is SessionHandle.focus() on the panel that was focused
  // when it opened — the registry lookup lives here because the palette layer
  // deliberately knows nothing about the registry.
  const restoreFocus = useCallback((id: string) => {
    registry.get(id)?.handle.focus()
  }, [])
  // M409 (the critic): the draft is read as the palette OPENS — a moment later
  // the palette's own input has the keyboard.
  const palette = usePalette({ focusedIdRef, restoreFocus, draftHeld: () => focusedDraft() !== null })
  // null is command mode. Set by beginRenamePreset and beginSavePrompt.
  const [inputMode, setInputMode] = useState<InputMode | null>(null)
  // The palette always OPENS in command mode. Both ends of a rename leave the
  // mode set otherwise: a completed one resolves after Palette has already
  // closed itself (it closes before calling submit, so nothing on screen is
  // left to clear it), and a cancelled one never reaches submit at all. Either
  // way the next Cmd+K would greet the user with a stale text field, no list,
  // and no explanation.
  useEffect(() => {
    if (!palette.open) setInputMode(null)
  }, [palette.open])

  // Cmd+J needs `centreOn` (returned BY this very useViewport call) and
  // `selectAndRaise` (defined further below, near goToPanel) as closures, but
  // must ALSO be passed INTO this call as its seventh argument — a genuine
  // circular dependency, not just an ordering inconvenience: the value this
  // callback needs does not exist until after the call it is an argument to
  // returns. jumpAttentionImplRef is the indirection every other "must be
  // stable but needs current data" case in this file already uses (see
  // panelsRef/focusedIdRef above) — the OUTER callback below has a fixed,
  // empty-deps identity for useViewport's dep array, while the actual jump
  // logic is assigned into the ref once centreOn and selectAndRaise exist and
  // is refreshed every render so it never runs against a stale closure.
  const jumpAttentionImplRef = useRef<(direction: JumpDirection) => void>(() => {})
  // The panel an ATTENTION jump is flying to, until the camera settles. Only
  // attention navigation arms it — a bookmark, the trail or fit-all lands on
  // a place, not on a panel that asked for you, and lighting whatever sits
  // there would teach the eye that the glow means nothing.
  const landingTargetRef = useRef<string | null>(null)
  // M279. The top bar's needs-you pill: forward, always — the same queue ⌘J walks.
  const jumpToWaiting = useCallback(() => { jumpAttentionImplRef.current(1) }, [])
  const onJumpAttention = useCallback((direction: JumpDirection) => {
    jumpAttentionImplRef.current(direction)
  }, [])

  // The same indirection, for the same reason, for M14's two workspace
  // chords: stepWorkspace needs `workspaceRows`, which is state declared
  // hundreds of lines below this call, and toggleMerged needs the merged
  // state — referencing either here would be a TDZ error rather than a stale
  // closure. The OUTER callbacks have a fixed, empty-deps identity so
  // useViewport's keydown effect is installed once (a fresh identity there
  // would tear the window listener down and reinstall it on every mousemove
  // over the canvas), while the implementations are assigned into the refs
  // once they exist and refreshed every render.
  const stepWorkspaceImplRef = useRef<(delta: 1 | -1) => void>(() => {})
  const onStepWorkspace = useCallback((delta: 1 | -1) => {
    stepWorkspaceImplRef.current(delta)
  }, [])
  const toggleMergedImplRef = useRef<() => void>(() => {})
  const onToggleMerged = useCallback(() => {
    toggleMergedImplRef.current()
  }, [])
  // Every canvas keyboard shortcut stands down while EITHER overlay owns the
  // keyboard, and so do the four menu accelerators below (see the edit:*
  // subscriptions). ONE predicate rather than three copies of "who owns the
  // keyboard", which is what this file already does for the wheel.
  //
  // Composed here rather than passing palette.isOpen straight through,
  // because the nav grid's own capture listener cannot be relied on to stop
  // useViewport's. Both are bound on `window`, and a SAME-TARGET dispatch —
  // which is exactly what verify:panels' window.dispatchEvent produces, and
  // never what a real keypress produces — invokes every listener on that
  // target regardless of phase, so the shared predicate is the only thing
  // that covers it. (For a real keypress the grid's capture-phase
  // stopPropagation at `window` DOES suppress bubble-phase listeners on
  // `window`, so it is belt-and-braces there — but it is not useless and
  // must not be removed: it is what stops a bare arrow reaching xterm's own
  // target-phase handler further down the tree.)
  //
  // Stable identity, reading a stable callback and a ref, because it sits in
  // useViewport's keydown effect dep array — a fresh arrow per render would
  // tear that listener down and reinstall it on every mousemove over the
  // canvas (Canvas re-renders on setCursor).
  // The UX pass (ux-proposals 2.5, overriding D4 for two chords at the
  // owner's word): the same predicate WITHOUT the focus lock. ⌘J and ⌘Y are
  // the two chords a person needs most while a locked agent works — "who
  // needs me" and "allow it" — and neither means anything to a terminal, so
  // the lock lets those two through and keeps every other key.
  const shouldIgnoreKeysButLock = useCallback(
    () => canvasCoveredRef.current || palette.isOpen() || navGridIsOpenRef.current() || chromeTransientRef.current || skillEditorFocused() || checklistFocused() || pillFocused() || noteEditorFocused() || deckFocused() || sheetFocused(),
    [palette.isOpen]
  )
  const shouldIgnoreKeys = useCallback(
    // M129. A skill-editor field having the keyboard is the same situation as
    // an open palette: the user is looking at a text field, `focusedId` still
    // names a terminal (rule 2 keeps it), and a Cmd+V routed below would put
    // the clipboard into a running agent the user is not looking at.
    // M249. The command pill's input is the same situation again (pill.paste.1).
    // M250. A rich note editor is a text surface too; its own edit:* subscriptions act on it.
    // M283. The Orchestrate page covering the canvas is the same situation at page scale:
    // `focusedId` still names a terminal the user cannot see, and the four edit:* chords
    // are MENU IPC — `inert` on the host stops keydown, never them (orch-page.3).
    // D4 (R-008). A focus-locked panel owns the canvas chords. useViewport bails
    // before preventDefault only when this predicate is true, so ⌘N reaches
    // the terminal (⌘J and ⌘Y are the UX pass's exception, above). focusLocked() is a module read, so the callback
    // stays stable and that listener is not torn down on every mousemove.
    () => shouldIgnoreKeysButLock() || focusLocked(),
    [shouldIgnoreKeysButLock]
  )

  // ⌘N (the UX pass): the New task sheet. Read through the ref at press time
  // — the palette's actions are assigned further down — so this stays stable.
  const openNewTask = useCallback(() => { paletteActionsRef.current?.beginStartWork() }, [])
  const {
    viewport, resetViewport, worldCentre, centreOn, restoreCamera, zoomBy, fitAll, fitSelection, frameRects, frameReadable,
    beginPanDrag, panning,
    goToViewport, cameraBack, cameraForward, trail, flying, landing, reveal
  } = useViewport(
    hostRef, rects, onSpawn, shouldYieldWheel, initial.camera, shouldIgnoreKeys, onJumpAttention,
    onStepWorkspace, onToggleMerged, openNewTask
  )
  // M410. The terminals whose rim name a neighbour above would cover draw it
  // inside their frame instead (panels.ts's `rimCoveredIds`). The rim's WORLD
  // height follows the zoom (terminalRimAt); a boolean per panel, so a memo'd
  // TerminalPanel re-renders only when its own answer flips.
  const rimWorld = terminalRimAt(viewport.scale)
  const rimCovered = useMemo(() => rimCoveredIds(displayPanels, rimWorld), [displayPanels, rimWorld])
  // M57. The RENDER tier every card draws at — one value for the canvas,
  // since the scale is global — advanced through nextCardDetail's hysteresis
  // so a pinch on a boundary cannot flip every card twice a frame. Below
  // tiering, never inside it: assignTiers rations contexts, this rations
  // typography.
  const [cardDetail, setCardDetail] = useState<CardDetail>('tail')
  // M106. FLIP: every terminal turned over to its far view — M57's summary tier
  // invoked deliberately rather than by camera distance, through the same
  // context and the same renderer (no second one is grown). A view state,
  // never persisted; a locked panel does not move (nothing moves), a
  // maximised one flips in place.
  const [flipped, setFlipped] = useState(false)
  useEffect(() => window.canvas.canvas.onFlip(() => setFlipped((v) => !v)), [])
  // `paletteActionsRef` is the existing ref, assigned after the actions are built; read inside the listener only.
  useEffect(() => window.canvas.canvas.onTidy(() => paletteActionsRef.current?.tidyPanels(panelsRef.current.map((p) => p.rect.id))), [])
  // M313. ⌘⇧E — the focused panel in the person's own editor (the palette
  // row's chord). Meta-only, so a terminal's own keys (all Ctrl/Alt) pass
  // through untouched; a field that owns its keys (Monaco, a draft) is left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.metaKey || !e.shiftKey || e.altKey || e.ctrlKey || (e.key !== 'e' && e.key !== 'E')) return
      const t = e.target as HTMLElement | null
      if (t?.closest('.monaco-editor, [contenteditable="true"]') != null) return
      const id = focusedIdRef.current
      if (id === null || id === undefined) return
      e.preventDefault()
      paletteActionsRef.current?.openInEditor(undefined, id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // M113. `tc board add/done`: the renderer answers because it OWNS the
  // workspace it renders — a main-side write would be overwritten by the next
  // coalesced save. Answered synchronously from refs, like the model.
  useEffect(() => window.canvas.canvas.onBoard((req) => {
    const actions = paletteActionsRef.current
    if (actions === null || actions === undefined) return { kind: 'refused', reason: 'the canvas is still starting' }
    if (req.op === 'add') return { kind: 'ok', id: actions.addWorkItem({ source: 'typed', title: req.title, state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'] }) }
    // M313. `tc task` / `terminal-canvas://task`: Start work opens FILLED IN,
    // and a person presses Start — nothing is added or run by the request
    // (control-protocol.ts's rule for the one verb the URL door may propose).
    if (req.op === 'propose') {
      actions.beginStartWork({
        title: req.title,
        ...(req.brief === undefined ? {} : { brief: req.brief }),
        ...(req.criteria === undefined ? {} : { criteria: req.criteria }),
        ...(req.recipe === undefined ? {} : { recipeId: req.recipe }),
        ...(req.cwd === undefined ? {} : { preferRoot: req.cwd }),
        // M370. The arrangement `tc task --swarm` named, chosen on the sheet.
        ...(req.swarm === undefined ? {} : { swarm: req.swarm })
      })
      return { kind: 'ok', id: 'start-work' }
    }
    const item = workItemsRef.current.find((i) => i.id === req.id)
    if (item === undefined) return { kind: 'refused', reason: `no work item is called ${req.id} — tc status lists the board` }
    actions.markDone(req.id)
    return { kind: 'ok', id: req.id }
  }), [])
  // M138. The pool's two doors. Events feed the per-block store (ONE
  // subscription for the canvas; the store fans out by address). A mint
  // request makes a WORKER: a chat panel minted here — the renderer owns the
  // workspace it renders — created through the ordinary `agent:create` (the
  // M100/M120 gates unchanged), placed beside the template's workflow panel,
  // titled by its block and item, and wired by handoff edge (a chat's `idle`
  // is its result) to every target the template's edges name from the pool
  // block, so a `collect` joins the workers M78's way. Main sends the item;
  // nothing is typed here.
  useEffect(() => window.canvas.agentSession.onPoolEvent(applyPoolEvent), [])
  /** M138. Per template, the edges out of its pool blocks and the ids the last Run minted for their targets. Declared ABOVE its reader (this file's create-then-assign rule). */
  const poolTargetsRef = useRef(new Map<string, { edges: TemplateEdge[]; minted: Map<string, string> }>())
  useEffect(() => window.canvas.canvas.onPoolMint(async (req: PoolMintRequest): Promise<PoolMintReply> => {
    const id = `c${nextIdRef.current++}`
    const sessionId = crypto.randomUUID()
    const result = await window.canvas.agentSession.create({ id, cwd: req.cwd, sessionId })
    if (result.kind === 'refused') return { kind: 'refused', reason: result.reason }
    const targets = poolTargetsRef.current.get(req.templateId)
    // M402. A pool's mint is the workflow's, not a person's press: placed by
    // the one rule when its workflow is not on this canvas, and QUIET — the
    // camera is not flown for a mint nobody asked for.
    const place = placer({ quiet: true })
    setPanels((current) => {
      const host = current.find((p) => isWorkflowPanel(p) && p.workflow.templateId === req.templateId)
      const made = { ...makeChatPanel(id, host === undefined
        ? viewCentre(hostRef.current, viewportRef.current)
        : { x: host.rect.x + host.rect.w + 40 + 280, y: host.rect.y + 180 + req.index * 400 }, nextZ(current), { cwd: req.cwd, sessionId }), title: `${req.key} · ${req.item}` }
      let next: Panel[] = [...current, host === undefined ? place(current, made) : made]
      for (const edge of targets?.edges ?? []) {
        if (edge.from !== req.key) continue
        const to = targets?.minted.get(edge.to)
        if (to === undefined) continue
        next = addLink(next, id, to)
        next = setLinkAutomation(next, id, to, { kind: 'handoff', enabled: true, trigger: 'idle' })
      }
      commitHistory(next)
      return next
    })
    return { kind: 'ok', id }
  }), [commitHistory, placer])
  /** M138. Stop a live pool: main's, through the one invoke. */
  const stopPool = useCallback((templateId: string, key: string) => { void window.canvas.agentSession.poolStop({ templateId, key }) }, [])
  useEffect(() => {
    setCardDetail((current) => nextCardDetail(current, viewport.scale))
  }, [viewport.scale])
  // Backlog #68: space-drag and middle-drag pan for the mouse-only user. See
  // useSpaceHeld.ts for why this is gated on real DOM focus rather than the
  // app's own focusedId/palette/draft state.
  const spaceHeld = useSpaceHeld()
  const version = useRegistryVersion(registry)

  // Main reads ONE process table for this whole list, then walks each root's
  // descendants there. The renderer owns this low-frequency schedule because
  // closing or switching a canvas should stop the work immediately; neither
  // the registry nor a module-level main timer can know that fact.
  const machineCostTargets = useMemo<MachineCostTarget[]>(() => panels.flatMap((panel) => {
    if (!isTerminalPanel(panel)) return []
    const status = registry.get(panel.rect.id)?.status
    return status?.kind === 'running' ? [{ panelId: panel.rect.id, pid: status.pid }] : []
  }), [panels, version])

  useEffect(() => {
    let current = true
    let inFlight = false
    const sample = (): void => {
      if (inFlight) return
      if (machineCostTargets.length === 0) {
        applyMachineCosts({ panels: [], total: { cpuPercent: 0, memoryBytes: 0 } })
        return
      }
      inFlight = true
      void window.canvas.machine.sample(machineCostTargets).then((snapshot) => {
        if (current) applyMachineCosts(snapshot)
      }).catch((error: unknown) => {
        // A ps failure is normally a transient process-table race. Keep the
        // prior reading until the next tick rather than turning it into zero.
        console.warn('[machine-cost] could not sample process trees', error)
      }).finally(() => {
        inFlight = false
      })
    }
    sample()
    const timer = window.setInterval(sample, MACHINE_COST_SAMPLE_MS)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [machineCostTargets])

  // What the banner calls the source panel. railLabel is the honest chain's
  // one reader — the panel header, the rail row, the attention section and
  // the inspector's link rows all go through it — so the banner reads it too
  // rather than becoming a fifth re-derivation that says `/bin/zsh` where
  // every other surface says `auth refactor`. Falls back to the bare id only
  // if the panel is gone, which a disarm makes very short-lived.
  const linkSourceName = useMemo(() => {
    if (linkMode.from === null) return ''
    const panel = panels.find((p) => p.rect.id === linkMode.from)
    return panel ? railLabel(panel, registry.get(panel.rect.id)?.status) : linkMode.from
  }, [linkMode.from, panels, version])

  // Sessions exist for every panel; only their tier changes. In a memo rather
  // than an effect: ensure() runs synchronously during render (so a session
  // exists by the time this same render tries to look one up below) and
  // deliberately never calls bump() — notifying a useSyncExternalStore
  // subscriber mid-render is what React's "update while rendering another
  // component" warning is about. The panel list living in React state is
  // already what triggers this render, so nothing is lost by not bumping.
  useMemo(() => {
    for (const panel of terminalPanels) {
      registry.ensure(panel.rect.id, panel.spec, { dormant: dormantIds.has(panel.rect.id) })
    }
  }, [terminalPanels, dormantIds])

  // Only sessions that are already running can be broadcast targets. This is
  // a filter over the existing registry, never a call to ensure/wake, so an
  // inactive selection remains inactive when the mode is armed.
  const broadcastTargetIds = useMemo(() => (
    merged
      ? []
      : terminalPanels
        .filter((panel) => {
          const session = registry.get(panel.rect.id)
          return selectedIds.has(panel.rect.id) && session?.status.kind === 'running'
        })
        .map((panel) => panel.rect.id)
  ), [merged, selectedIds, terminalPanels, version])
  const broadcastReady = broadcastTargetIds.length >= 2

  useEffect(() => {
    if (!broadcastInput || !broadcastReady) {
      registry.setInputTargets([])
      if (broadcastInput && !broadcastReady) setBroadcastInput(false)
      return
    }
    registry.setInputTargets(broadcastTargetIds)
    return () => registry.setInputTargets([])
  }, [broadcastInput, broadcastReady, broadcastTargetIds])

  // Menu-driven clipboard stays at this exact hook position: `focusedIdRef`
  // exists above it, while addImageRef is assigned below it. The hook reads
  // the latter lazily, once an edit event arrives after this render completes.
  // M390/M391. The canvas's own ⌘C/⌘V for authored objects and pasted
  // Mermaid, reached lazily for the same reason as getAddImage (the verbs are
  // defined far below this hook).
  const objectClipboardRef = useRef<{ copy: () => boolean; paste: (text: string) => boolean } | null>(null)
  const { sayRef, editRef: canvasEditRef } = useCanvasClipboard({
    registry, focusedIdRef, panelsRef, shouldIgnoreKeys,
    getAddImage: () => addImageRef.current,
    getObjects: () => objectClipboardRef.current,
    getStartTask: () => (seed) => paletteActionsRef.current?.beginStartWork(seed)
  })

  // ONE subscription for the whole canvas, not one per panel: the payload
  // names its own panel, and the store fans it out to exactly the panel that
  // subscribed to that id. A per-panel subscription would mean every panel
  // receiving and discarding every other panel's updates — the same argument
  // the single Cmd+C/Cmd+V subscription above makes.
  useEffect(() => window.canvas.agent.onState((update) => {
    applyAgentState(update.panelId, update.state, update.owner)
  }), [])

  /**
   * M130. THE TRAIL, refreshed on the two moments it can have changed — and
   * on no timer of its own.
   *
   * A terminal's trail is a tail of the CLI's transcript in MAIN, so asking
   * costs an invoke and a read; a hot poll would spend one per panel per tick
   * for a canvas nobody is looking at, which is the same arithmetic
   * `machine:sample` is scheduled by the renderer to avoid. The two moments
   * are: once when this renderer first sees the panel (a relaunch must show
   * what the last session did), and every time its agent goes IDLE — the
   * transition that means a turn just ended, the same one M41's handoff and
   * M105's last line already ride, taken from `onAgentTransition` so this
   * adds no second `agent.onState`.
   *
   * A CHAT is deliberately absent from both: its trail is derived from turns
   * already in this renderer's memory (`trailFromTurns`) and there is nothing
   * to ask anyone for.
   */
  const trailAskedRef = useRef<Set<string>>(new Set())
  useEffect(() => onAgentTransition((panelId, state) => {
    if (state !== 'idle') return
    void window.canvas.skill.trail(panelId).then((trail) => applyTrail(panelId, trail)).catch(() => {})
  }), [])
  useEffect(() => {
    for (const panel of terminalPanels) {
      if (trailAskedRef.current.has(panel.rect.id)) continue
      trailAskedRef.current.add(panel.rect.id)
      const id = panel.rect.id
      void window.canvas.skill.trail(id).then((trail) => applyTrail(id, trail)).catch(() => {})
    }
  }, [terminalPanels])

  // M43. A clicked OS notification frames its panel — the Cmd+J path, which
  // never wakes. Read through the ref so this subscribes once and never goes
  // stale as paletteActions is rebuilt.
  // M249. Named so the command pill's Jump runs the SAME landing a clicked
  // notification does (goToPanel: frame, raise, select — never wake), rather
  // than a third copy of "go to a waiting panel". Stable identity: it reads
  // the actions through their ref.
  const jumpToAttention = useCallback((panelId: string) => {
    landingTargetRef.current = panelId
    paletteActionsRef.current?.goToPanel(panelId)
    openRequestOfRef.current(panelId)
  }, [])
  // Decision queue. EVERY "needs you" door lands on the REQUEST, never only
  // on the agent: a chat's pending permission opens in the queue beside it
  // (the one surface that resolves it, #16), a chat's question is scrolled
  // into view in its conversation, and a terminal's prompt is the terminal
  // itself. Nothing here focuses or acknowledges — focus is the renderer's
  // single acknowledgement trigger, and a jump that cleared the badge on
  // arrival would take the decision away before the person read it.
  // Decision queue. A row that names a WAITING panel — the rail, the Dock's
  // "jump", Orchestrate's jump — lands on its request like every attention
  // door; any other panel is just framed, as goToPanel always did.
  const goToPanelOrRequest = useCallback((panelId: string) => {
    const waiting = attentionIds().includes(panelId) || approvals().some((a) => a.id === panelId)
    if (waiting) jumpToAttention(panelId)
    else paletteActionsRef.current?.goToPanel(panelId)
  }, [jumpToAttention])
  const openRequestOfRef = useRef<(panelId: string) => void>(() => {})
  openRequestOfRef.current = (panelId: string) => {
    const request = approvals().find((a) => a.id === panelId)
    if (request !== undefined) { chromeRef.current.openAttentionAt(request.requestId); return }
    const panel = displayPanelsRef.current.find((p) => p.rect.id === panelId)
    if (panel === undefined || !isChatPanel(panel)) return
    const turns = getChat(panelId).turns.length
    if (turns > 0) scrollToTurn(panelId, turns - 1)
  }

  // Attention navigation's arrival: after the camera lands, the destination
  // frame is briefly lit, or a person flown across a busy canvas has to
  // hunt for which of the panels now on screen is the one that wanted them.
  // Keyed on the settle, never on `flying` turning false — a reduced-motion
  // or already-framed jump never flies at all, and is still an arrival.
  // A settle that did not land (a gesture grabbed the camera) disarms: the
  // person has already chosen to look somewhere else.
  const [landingLit, setLandingLit] = useState<{ id: string; seq: number } | null>(null)
  useEffect(() => {
    const id = landingTargetRef.current
    if (landing.seq === 0 || id === null) return
    landingTargetRef.current = null
    if (landing.landed) setLandingLit({ id, seq: landing.seq })
  }, [landing])
  useEffect(() => {
    if (landingLit === null) return
    const timer = setTimeout(() => setLandingLit(null), LANDING_LIT_MS)
    return () => clearTimeout(timer)
  }, [landingLit])
  // D17 / 4.4. A notification click can name a panel in a HIDDEN workspace —
  // main keeps those sessions running and notifies for them. Read through a
  // ref assigned below, once workspaceRows and switchWorkspace exist, so a
  // click there switches first instead of framing an id this canvas lacks.
  const attentionJumpRef = useRef<(panelId: string) => void>(jumpToAttention)
  // The UX pass: the menu-bar item's "show the next" sends no id — it is ⌘J.
  useEffect(() => window.canvas.agent.onAttentionJump((id) => {
    if (typeof id === 'string') attentionJumpRef.current(id)
    else jumpAttentionImplRef.current(1)
  }), [])

  // One subscription for the whole canvas, like agent.onState above and for the
  // same reason: the store fans out per panel id, so a per-panel subscription
  // here would deliver every panel's update to every panel.
  useEffect(() => window.canvas.session.onLive((update) => {
    applyLiveSession(update.panelId, update.cwd, update.currentCommand)
  }), [])

  // One subscription for the whole canvas, like session.onLive above and for
  // the same reason: the store fans out per panel id, so a per-panel
  // subscription here would deliver every panel's update to every panel.
  useEffect(() => window.canvas.session.onSubagents((update) => {
    applySubagents(update.panelId, update)
  }), [])

  // The fourth canvas-wide subscription, for the same reason as the ones
  // above: main's file:changed names its own panel and the store fans it out
  // to exactly the panel that subscribed to that id, so a per-panel
  // subscription would deliver every file's change to every file panel. It
  // carries the whole RESULT rather than a "something changed" ping, so a
  // panel that is mounted but scrolled away is updated without a second
  // round trip.
  useEffect(() => window.canvas.file.onChanged((event) => {
    applyFileResult(event.panelId, event.result)
  }), [])

  /**
   * M85. THE VAULT: its folder from the settings, its notes from main, and a
   * bump whenever anything under a watched file changes so an agent writing
   * a note into the folder appears without a gesture.
   *
   * The signal is a COUNTER rather than the event: the vault does not care
   * WHICH file changed (its own read is a walk), and passing the event would
   * re-read on every keystroke of an editor's save while a counter coalesces
   * into one render.
   */
  const [vaultRoot, setVaultRoot] = useState('')
  // False until the settings have answered once — see FileNode's `vaultReady`.
  const [vaultReady, setVaultReady] = useState(false)
  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        if (!live) return
        const row = rows.find((r) => r.id === 'vault.root')
        if (row) setVaultRoot(typeof row.value === 'string' ? row.value : '')
        setVaultReady(true)
      }).catch(() => setVaultReady(true))
    }
    read()
    const off = window.canvas.settings.onChanged(read)
    return () => { live = false; off() }
  }, [])
  const vault = useVault(vaultRoot)

  // Read at CALL time by the note's verbs, which are memoised above where
  // `vaultRoot` is declared — the same forward-ref shape `noteRootRef` uses.
  const vaultRootRef = useRef('')
  vaultRootRef.current = vault.root

  // The fifth canvas-wide subscription, for the same reason as the ones
  // above: the store fans out per panel id, so a per-panel subscription here
  // would deliver every panel's usage update to every panel.
  useEffect(() => window.canvas.session.onUsage(({ panelId, usage }) => {
    applyUsage(panelId, usage)
  }), [])

  // M507. The preset menu's events, undo/redo and the reset, lifted into useHistoryVerbs.ts at exactly this position (it declares paletteActionsRef).
  const { paletteActionsRef, redoCanvas, resetCanvas, undoCanvas, undoCanvasRef } = useHistoryVerbs({
    applyHistory, commitHistory, defaultTemplateRef, dormantIdsRef, focusedIdRef, markLaneClosed, nextIdRef, onSpawn, panelsRef, resetViewport, runsRef, selectOnly, setAnnotating, setAnnotations, setDormantIds, setEditingAnnotation, setEnteringPanelIds, setFocusedId, setGroups, setHistory, setPanels, setSelectedAnnotation, setStarter, shouldIgnoreKeys, stepCaptionHistory, worldCentre, registry
  })

  // Same mirror-into-a-ref pattern, for the listeners below that need the
  // current scale but must not resubscribe: `viewport` changes on every wheel
  // event, and a document-level listener reinstalled at 60Hz mid-gesture would
  // drop the drag state it is holding.
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport

  // M35. The drag half of link creation. linkMode (declared above, the armed
  // click-then-click path the palette and inspector use) is UNCHANGED and
  // stays: it is the keyboard-reachable route, verify:palette 76/77 pin it,
  // and ports are an additional entry point rather than a replacement.
  //
  // Declared HERE — after viewportRef, not beside linkMode further up —
  // because it reads viewportRef synchronously in the object literal below;
  // a `const` read before its own declaration is a TDZ error, the identical
  // constraint linkMode's own comment states for its position relative to
  // useViewport. hitOrderRef is declared earlier for the same reason and
  // was already in scope.
  // M389. The connectors hook sits far below (it needs the flowchart's
  // addShape); the link draw reaches it through this ref, created here and
  // assigned where the hook runs — the create-above/assign-below pattern.
  const connectorsRef = useRef<Connectors | null>(null)
  const linkDraw = useLinkDraw({
    hostRef,
    viewportRef,
    rectsRef: hitOrderRef,
    // M389. Quick-connect from ANY object: a panel's port released on empty
    // ground makes a connected process step there — "this agent does this".
    // Before, the release cancelled silently.
    onDropEmpty: (from, cursor) => {
      if (mergedRef.current) return
      // A shape still quick-connects a process step (flowchart.app.1's door
      // is the double-click; this one is the port). A panel opens the
      // connected-object menu instead of minting a shape.
      const source = panelsRef.current.find((panel) => panel.rect.id === from)
      if (source !== undefined && isShapePanel(source)) {
        connectorsRef.current?.extend(from, null, cursor)
        return
      }
      const name = source === undefined ? from : panelName(source)
      openConnectedSpawn(from, cursor, name)
    },
    onCommit: (from, to) => {
      // The VERB refuses, not only the affordance. This repo's standing rule,
      // stated for the move verb: it "refuses on `mergedRef` too rather than
      // only its palette rows going disabled — a disabled row is an
      // affordance, and the verb has to be the authority."
      //
      // Here the affordance is `readOnly`, which suppresses the ports — and
      // `readOnly` is OPTIONAL WITH A DEFAULT on all four non-terminal kinds,
      // so a missed or dropped `readOnly={merged}` at any of the five call
      // sites compiles clean and renders ports in the merged view with
      // nothing red anywhere.
      //
      // Corrected in the M35 final review: an earlier draft of this comment
      // claimed that drag would addLink a FOREIGN panel id into the active
      // workspace's record, persisted and then silently pruned by
      // buildLinkSegments. That path is not reachable — addLink (panels.ts,
      // frozen) refuses unless BOTH ids are already in the array it is
      // handed, and that array is always `current` from this component's own
      // `panels` state (the active workspace's own array), never
      // `displayPanels` (the merged, lane-translated one the ports would
      // actually render against). A foreign endpoint on either side returns
      // the SAME array: nothing written, no history entry, nothing persisted.
      //
      // What a dropped readOnly DOES reach is a drag between two panels both
      // already in the active workspace, while the merged view happens to be
      // showing them in a foreign lane — a real write of an ordinary, valid
      // link, which is a "the merged view is read-only" violation rather than
      // a corrupted record.
      //
      // linkDraw.end() at toggleMerged stands down an in-flight draw; this
      // stands down a commit that reaches here by any other route.
      //
      // NO CHECK EXERCISES THIS. It is structural defence: ports do not render
      // while merged, so the gesture cannot be driven through the UI there,
      // and a check that reached past the UI to call onCommit directly would
      // be asserting against a fixture rather than against the feature. See
      // the M35 task-8 report for the declined check 180.
      if (mergedRef.current) return
      // M389. A line that touches a SHAPE is a connector, never a link: a link
      // means something (task membership, handoff) and a diagram's arrow must
      // not (ledger D2). Between two live objects it is the link it always was.
      const ends = panelsRef.current.filter((p) => p.rect.id === from || p.rect.id === to)
      if (ends.some(isShapePanel)) { connectorsRef.current?.connect(from, to); return }
      setPanels((current) => {
        const next = addLink(current, from, to)
        // addLink returns the SAME array when it refuses (a self-link, a
        // duplicate), and committing unconditionally would push a history
        // entry for a gesture that changed nothing — one wasted Cmd+Z. The
        // rule is one entry per COMMITTED gesture, never one per attempt.
        if (next !== current) commitHistory(next)
        return next
      })
    }
  })
  // Ruling P3: a STABLE identity, never an inline arrow at the TerminalPanel
  // call site. Canvas re-renders on every mousemove over .canvas (setCursor),
  // so a fresh arrow per render would be a changed prop on every memoized
  // panel on every frame — the exact hazard resetViewport's own comment
  // records for the palette's dependency arrays. `linkDraw.begin` is itself
  // stable (a useCallback with an empty dep array inside useLinkDraw), so
  // depending on it alone keeps this callback's identity fixed too.
  const onBeginLink = useCallback(
    (id: string, event: MouseEvent) => linkDraw.begin(id, event),
    [linkDraw.begin]
  )

  // Switching workspaces, the merged view, and moving panels between
  // workspaces, lifted into useWorkspaceVerbs.ts. Called from exactly the
  // position those verbs used to occupy — both refs it returns are assigned
  // further down this component, and the await-before-commit orderings inside
  // it are load-bearing (see the hook's own doc comment).
  const {
    switchWorkspace, resolveDormant, toggleMerged, movePanelsToWorkspace,
    deleteWorkspaceRef, reloadWorkspacesRef
  } = useWorkspaceVerbs({
    registry, transitionRef, mergedRef, preMergeRef, panelsRef, groupsRef, bookmarksRef, runsRef, annotationsRef, setAnnotations, starterRef, setStarter, orchestrateRef, setOrchestrate, retainedOutcomesRef, setRetainedOutcomes, workItemsRef, setWorkItems,
    viewportRef, nextIdRef, toggleMergedImplRef, restoreCamera, selectedId,
    focusedId, selectOnly, linkDraw, setPanels, setGroups, setBookmarks, setRuns, forgetOpenRuns,
    setDormantIds, setFocusedId, setSelectedIds, setHistory, setMerged,
    setMergedData, setFlipped
  })

  // The `window.__m4a*` surface verify:panels drives the renderer through,
  // lifted into useCanvasTestHooks.ts. Called from exactly the position the
  // effect used to occupy: deleteWorkspaceRef is created above and assigned
  // below, and moving this call would break that order silently.
  useCanvasTestHooks({
    instantiateCountRef,
    setSelectedIds,
    registry,
    viewportRef,
    focusedIdRef,
    panelsRef,
    defaultTemplateRef,
    deleteWorkspaceRef,
    setHistory,
    applyHistory,
    resetCanvas,
    switchWorkspace,
    movePanelsToWorkspace
  })

  // One gesture at a time, driven by document listeners installed once. Moves
  // rewrite the rect on every frame; only a resize commits anything to the PTY,
  // and only on release.
  // M50. Snapping: applied to applyDrag's OUTPUT, per frame, against every
  // other panel's rect, with the threshold in SCREEN pixels over the scale
  // (verify:viewport 27's 1/k relationship — a world-unit threshold is huge
  // zoomed out and invisible zoomed in). The guides are the one piece of
  // state a drag leaves in React: cleared on commit. Off when the setting
  // is off: a user aligning by eye against a snap is fighting the app.
  const [snapEnabled, setSnapEnabled] = useState(true)
  useEffect(() => {
    // Read at mount and on every settings write (settings:changed, M45):
    // this block sits above settingRows' declaration, and a subscription is
    // the more honest source anyway — the row's own palette toggle and a
    // menu write both land here.
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        if (!live) return
        const row = rows.find((r) => r.id === 'placement.snap')
        if (row) setSnapEnabled(row.value === true)
      })
    }
    read()
    const off = window.canvas.settings.onChanged(read)
    return () => { live = false; off() }
  }, [])
  const snapEnabledRef = useRef(snapEnabled)
  snapEnabledRef.current = snapEnabled

  // M247. Agent → object links. The toggle is a SETTING (canvas.agentLinks), read
  // the way snap is: at mount and on every settings:changed, so the palette row,
  // the HUD button, the agent line and an action node all land here.
  const [agentLinksOn, setAgentLinksOn] = useState(true)
  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        if (!live) return
        const row = rows.find((r) => r.id === 'canvas.agentLinks')
        if (row) setAgentLinksOn(row.value === true)
      })
    }
    read()
    const off = window.canvas.settings.onChanged(read)
    return () => { live = false; off() }
  }, [])
  // Derived from each conversation's tool calls, never stored: a restart re-derives
  // them from the chat store. Published PER AGENT into agent-links-store, which
  // replaces a snapshot only when its content changed — never the registry's
  // version counter, which a busy agent's tool calls would otherwise drive.
  //
  // useChatsVersion bumps on EVERY chat state replacement, streamed deltas
  // included; the turns array is replaced only when a turn lands. So each
  // agent's links are recomputed only when its turns array or the set of
  // objects (a path, a draft) actually changed — otherwise a streaming reply
  // would re-index every transcript on the canvas several times a second.
  // Its own name: Canvas's `chatsVersion` is declared far below, and a dependency
  // array is evaluated during render, so borrowing it here would throw.
  const linksChatsVersion = useChatsVersion()
  const agentLinkCache = useRef(new Map<string, { turns: unknown; objectsKey: string }>())
  useEffect(() => {
    const objects = panels.filter(isFilePanel).map((p) => ({
      id: p.rect.id,
      path: p.source.path,
      ...(p.source.sheet?.draft?.by === undefined ? {} : { draftBy: p.source.sheet.draft.by })
    }))
    const objectsKey = JSON.stringify(objects)
    for (const agent of panels.filter(isChatPanel)) {
      const turns = getChatState(agent.rect.id).turns
      const hit = agentLinkCache.current.get(agent.rect.id)
      if (hit !== undefined && hit.turns === turns && hit.objectsKey === objectsKey) continue
      agentLinkCache.current.set(agent.rect.id, { turns, objectsKey })
      publishAgentLinks(agent.rect.id, agentLinks({ agent: agent.rect.id, cwd: agent.chat.cwd, touches: indexToolFiles(turns), objects }))
    }
    // A closed agent's cache entry goes with it; its links went at the forget site.
    const live = new Set(panels.map((p) => p.rect.id))
    for (const id of [...agentLinkCache.current.keys()]) if (!live.has(id)) agentLinkCache.current.delete(id)
  }, [panels, linksChatsVersion])
  // A draft badge opens that draft's review: the sheet, brought into view and focused.
  const openDraftReview = useCallback((objectId: string) => {
    paletteActionsRef.current?.goToPanel(objectId)
    sheetController(objectId)?.focusDraft()
  }, [])
  const toggleAgentLinks = useCallback(() => {
    paletteActionsRef.current?.toggleSetting('canvas.agentLinks', !agentLinksOn)
  }, [agentLinksOn])
  const [snapGuides, setSnapGuidesState] = useState<{ guides: readonly SnapGuide[]; spacing: readonly SpacingGuide[] }>(NO_GUIDES)
  // Clearing is the common call (every commit): the same object back when
  // there is nothing to clear, so a release that snapped nothing re-renders nothing.
  const setSnapGuides = useCallback((guides: readonly SnapGuide[], spacing: readonly SpacingGuide[] = []): void => {
    setSnapGuidesState((current) => (guides.length === 0 && spacing.length === 0 ? (current === NO_GUIDES ? current : NO_GUIDES) : { guides, spacing }))
  }, [])
  // M390. smartSnap (arrange.ts) in place of snapRect: edge/centre alignment
  // as before, plus EQUAL SPACING on a move, and a resize floor that is the
  // object's own (`min` — a shape's is SHAPE_MIN, a panel's the 200x160).
  const snapNow = useCallback((rect: WorldRect, exclude: ReadonlySet<string>, resize?: { growsX: boolean; growsY: boolean }, min?: { w: number; h: number }): WorldRect => {
    if (!snapEnabledRef.current) return rect
    const others = panelsRef.current.filter((p) => !exclude.has(p.rect.id)).map((p) => p.rect)
    // M402. The rim a terminal's name paints above its frame (occupiedRect),
    // so a stack snaps the lower name clear of the upper one's bottom row. A
    // multi-move's bounds (`selection`) carry the rim of a terminal on its top
    // edge — its members' TOPMOST, read from their pre-drag rects (the bounds
    // have moved, the members in panelsRef have not). The rim at THIS zoom
    // (terminalRimAt): the strip is taller in the world below 100%.
    const rim = terminalRimAt(viewportRef.current.scale)
    const rimOf = (id: string): number => {
      const members = panelsRef.current.filter((p) => (id === 'selection' ? exclude.has(p.rect.id) : p.rect.id === id))
      const top = Math.min(...members.map((p) => p.rect.y))
      return Math.max(0, ...members.filter((p) => p.rect.y === top).map((p) => p.rect.y - occupiedRect(p, rim).y))
    }
    const out = smartSnap(rect, others, SNAP_PX / viewportRef.current.scale, { ...(resize ? { resize } : {}), ...(min === undefined ? {} : { min }), spacing: true, grid: null, gapGrid: 24, rimOf })
    setSnapGuides(out.guides, out.spacing)
    return out.rect
  }, [setSnapGuides])

  // The shared canvas (presence/canvas-sync.ts in main): a peer's move lands
  // in `panels` here without a history entry, a teammate's panels are inert
  // placeholders, and every gesture below writes through as it happens.
  const shared = useSharedCanvas({ setPanels, setGroups, refit: (id) => registry.refit(id) })
  const sharedRef = useRef(shared)
  sharedRef.current = shared

  const beginDrag = usePanelDrag({
    hostRef,
    viewportRef,
    writeThroughRef: shared.writeThroughRef,
    snapMany: useCallback((rects: readonly WorldRect[], ids: ReadonlySet<string>) => {
      const bounds = {
        id: 'selection',
        x: Math.min(...rects.map((r) => r.x)), y: Math.min(...rects.map((r) => r.y)),
        w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)),
        h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y))
      }
      const snapped = snapNow(bounds, ids)
      return { dx: snapped.x - bounds.x, dy: snapped.y - bounds.y }
    }, [snapNow]),
    onDrag: useCallback(
      (id: string, rect: WorldRect, state: DragState, alreadySnapped?: boolean, free?: boolean) => {
        const resize = state.mode.kind === 'resize'
          ? { growsX: state.mode.edge === 'e' || state.mode.edge === 'se', growsY: state.mode.edge === 's' || state.mode.edge === 'se' }
          : undefined
        // M395. ⌘ held: this frame does not snap, and a guide a snapping
        // frame drew a moment ago goes with it — a guide beside an object
        // that did not stop on it would explain a snap that is not happening.
        if (free === true) setSnapGuides([])
        // M388. A west/north resize (a shape's) moves the origin; snapping
        // covers growing right/bottom edges only, so those frames do not snap
        // rather than snapping the wrong edge.
        const snapped = alreadySnapped === true || (state.mode.kind === 'resize' && movesOrigin(state.mode.edge)) ? rect : snapNow(rect, new Set([id]), resize, state.min)
        // A teammate's placeholder is not in `panels`: it moves in the shared
        // layer, and the drag's write-through carries it to the doc.
        if (sharedRef.current.isPlaceholder(id)) { sharedRef.current.movePlaceholder(id, snapped); return snapped }
        // M92. The first move or resize clears the maximised mark: its
        // restore rect would lie once the user has placed the panel by hand.
        setPanels((current) => setPanelRect(current, id, snapped).map((p) => (p.rect.id === id && p.maximised !== undefined ? (({ maximised: _m, ...rest }) => rest as Panel)(p) : p)))
        return snapped
      },
      [snapNow, setSnapGuides]
    ),
    onCommit: useCallback((states: readonly DragState[]) => {
      setSnapGuides([])
      // A placeholder-only gesture changed nothing of ours: no history entry,
      // or Cmd+Z would spend a press undoing nothing.
      if (states.every((state) => sharedRef.current.isPlaceholder(state.panelId))) return
      // One history entry per gesture. onDrag (above) called setPanels ~60
      // times during the drag; pushing there would make a single drag take
      // sixty Cmd+Z presses to undo. This runs exactly once, on mouseup,
      // reading the settled array back out of setPanels's updater rather than
      // closing over a stale `panels` from render.
      setPanels((current) => {
        commitHistory(current)
        return current
      })
      // M114. A card the user MOVED chose its own place: its anchor to the
      // lane is dropped, or the next render would snap it back beside the chat.
      const movedCards = states.filter((state) => state.mode.kind === 'move').map((state) => workCardItemId(panelsRef.current.find((p) => p.rect.id === state.panelId) ?? ({ kind: 'terminal' } as unknown as Panel))).filter((id): id is string => id !== undefined)
      if (movedCards.length > 0) setWorkItems((current) => current.map((i) => (movedCards.includes(i.id) && i.anchor !== undefined ? carryWorkItem({ ...i, anchor: undefined }) : i)))
      // A move changes no terminal dimension, so it has nothing to commit.
      const resized = states.filter((state) => state.mode.kind === 'resize')
      if (resized.length === 0) return
      // One commit per gesture, never one per frame: a full-screen agent TUI
      // repaints its whole frame on every SIGWINCH, and resizing live would
      // mean sixty of those a second at sizes the user never meant to keep.
      // refit sends at most one pty:resize, and none if the grid is unchanged.
      for (const state of resized) registry.refit(state.panelId)
    }, [commitHistory])
  })

  // M507. The panel gestures (drag, close, select, focus, the attention jump), lifted into usePanelGestures.ts at exactly this position.
  const { docFocusId, inboxRef, onBeginDrag, onBeginGroupDrag, onBeginPlaceholderDrag, onClosePanel, onDocFocus, onFocusPanel, onRemoveGroup, onRemovePlaceholder, onSelectPanel, onSlotMount, onSlotUnmount, openPill, pillJump, pillOpenRef, readyReviewRef, selectAndRaise, toggleGroupCollapsed } = usePanelGestures({
    addToSelection, beginDrag, boardVerbsRef, cameraBack, centreOn, commitHistory, displayPanelsRef, frameRects, hostRef, jumpAttentionImplRef, jumpToAttention, landingTargetRef, markLaneClosed, mergedRef, openRequestOfRef, panels, panelsRef, pendingFocusId, retireCaptionsOf, selectOnly, selectedIds, selectedIdsRef, setDormantIds, setFocusedId, setGroups, setPanels, setPendingFocusId, setSelectedIds, setSnapGuides, sharedRef, snapNow, viewportRef, registry
  })

  // This remains after registry.ensure and at the former tiering-hook position.
  // The hook owns only card/live presentation; it never disposes a session.
  const tieringDiagnosticsRef = useTiering({
    registry, hostRef, terminalRects, viewport, focusedId, version, dormantIds,
    collapsedPanelIds, panels, flying
  })

  // Persist on every change. Unthrottled on purpose, including the ~60/sec a
  // drag produces: main coalesces to one write per 500ms and keeps only the
  // newest, so one process owns the timing — and it is the one that has to
  // survive the other's death.
  //
  // This resembles the flood pty-manager.ts's 16ms batching exists to prevent,
  // and the difference is worth stating. That was THOUSANDS of messages a
  // second arriving continuously at the renderer's event loop; this is sixty
  // small JSON payloads a second reaching an otherwise-idle main process, and
  // only while a gesture is in progress.
  //
  // While merged, three of the four fields come from the PRE-MERGE snapshot
  // rather than from live state, and that is the whole of this effect's
  // special-casing — `panels` is untouched and stays the only array written,
  // which is the split displayPanels' own comment describes.
  //
  // Two ways to stop the merged view writing a lane-space camera were
  // available and only one of them is safe. Capture-on-enter plus
  // restore-on-leave ALONE lets the next save correct the record, which is
  // fine for a user who leaves the view — and wrong for the one who quits
  // inside it, because before-quit flushes whatever the last save left and
  // there is no "next save" to correct anything. So the snapshot is read
  // HERE too: every save issued while merged writes exactly what the save
  // issued one instant before the toggle would have written. `panels` is
  // still live, so a Cmd+N while merged is persisted normally.
  useEffect(() => {
    // Read at call time rather than through a dep, because a ref cannot
    // trigger this effect and does not need to: it is written once, in the
    // same synchronous block that sets `merged`, so the render that flips the
    // flag already sees it.
    const before = preMergeRef.current
    void window.canvas.layout.save({
      panels: fromPanels(panels),
      groups,
      camera: merged && before ? before.camera : viewport,
      selectedId: merged && before ? before.selectedId : selectedId,
      focusedId: merged && before ? before.focusedId : focusedId,
      bookmarks,
      runs,
      ...(annotations.length === 0 ? {} : { annotations }),
      ...(workItems.length === 0 ? {} : { workItems }),
      ...(retainedOutcomes.length === 0 ? {} : { retainedOutcomes }),
      ...(starter === undefined ? {} : { starter }),
      ...(orchestrate === undefined ? {} : { orchestrate })
    }, shared.saveMeta)
  }, [panels, groups, viewport, selectedId, focusedId, merged, bookmarks, runs, annotations, workItems, retainedOutcomes, starter, orchestrate, shared.saveMeta])

  // Every mouse gesture the canvas host owns, lifted into useCanvasPointer.ts.
  // Four of the returned handlers are plain functions rather than useCallbacks
  // — see the hook's doc comment for why memoizing them would be a behaviour
  // change rather than a cleanup.
  const {
    onCanvasMouseDownCapture, onMouseDown, onMouseDownCapture, onMouseMove
  } = useCanvasPointer({
    hostRef, viewport, viewportRef, panelsRef, marqueeFromRef, marqueeEndRef,
    // M395. pickOrder, not hitOrder: a frame's middle is ground to a press.
    navGridIsOpenRef, hitOrder: pickOrder, palette, linkMode, merged, spaceHeld,
    beginPanDrag, commitHistory, selectAndRaise, selectOnly, onSelectPanel,
    setPanels, setSelectedIds, setFocusedId, setMarquee, setCursor,
    annotate: (world) => placeAnnotationRef.current(world),
    // M155. The draw tool, through refs: the hook is installed once.
    inkTool: () => inkToolRef.current(),
    inkPreview: (points) => setInkDraft(points),
    ink: (points, scale) => commitInkRef.current(points, scale)
  })

  // Loaded on mount AND whenever the palette opens — but never on a
  // subscription: availability is probed once at startup anyway (a brew
  // install mid-session is a known limit of M5a, not something a subscription
  // here would fix), and reloading after every mutation is enough because main
  // is the only side that knows what the store now says. The mount-time load
  // is the effect twelve lines below, added by M8a: until then this list was
  // palette-only, and the comment here still said so — see that effect for why
  // the top bar cannot wait for a first Cmd+K.
  const [presetRows, setPresetRows] = useState<PresetRow[]>(EMPTY_PRESETS)
  // M137. Read by `runWorkflow`, which is installed once (a fired trigger
  // reaches it through a ref), so the rows it refuses against must be live.
  const presetRowsRef = useRef(presetRows)
  presetRowsRef.current = presetRows
  // M100. The roster: loaded once, reloaded after every save; a ref for the
  // sheet's submit and the palette's actions, state for the pane.
  const [teammates, setTeammates] = useState<PersistedTeammate[] | null>(null)
  const teammatesRef = useRef<PersistedTeammate[]>([])
  const [selectedTeammateId, setSelectedTeammateId] = useState<string | null>(null)
  const reloadTeammates = useCallback(() => {
    void window.canvas.teammate.list().then((rows) => { teammatesRef.current = rows; setTeammates(rows) })
  }, [])
  useEffect(() => { reloadTeammates() }, [reloadTeammates])
  // A teammate's display name: its own name, its id when that name is blank,
  // nothing when the roster does not hold it. ONE resolution for the rail's
  // rows and (M428) the world's cards, so the two cannot name one agent twice.
  const teammateNameOf = useCallback((teammateId: string): string | undefined => {
    const t = (teammates ?? []).find((x) => x.id === teammateId)
    return t === undefined ? undefined : (t.name.trim() === '' ? t.id : t.name)
  }, [teammates])
  // M101. Routines: the list for the pane, and the TICK — main fires, the
  // renderer mints a fresh chat as the teammate, sends the prompt (a routine
  // is scheduled work: the send is the point — the design rule rides its
  // system prompt), inserts the plan line for the record, and reports the
  // run back through the one save door so the row says what happened.
  const [routines, setRoutines] = useState<PersistedRoutine[] | null>(null)
  const reloadRoutines = useCallback(() => { void window.canvas.routine.list().then(setRoutines) }, [])
  useEffect(() => { reloadRoutines() }, [reloadRoutines])
  // `beginNewChatRef` is declared further down (the M80/M81 mint ref) and is
  // read only inside the listener, after every render has assigned it.
  useEffect(() => window.canvas.routine.onFire((routine) => {
    const mint = beginNewChatRef.current
    void (async () => {
      const mate = teammatesRef.current.find((t) => t.id === routine.teammateId)
      const result = await mint({ cwd: mate?.places[0] ?? '', title: routine.name, teammateId: routine.teammateId, appendSystemPrompt: ROUTINE_PROMPT, routine: true })
      const at = Date.now()
      if (result.kind === 'refused') {
        const latestR = (await window.canvas.routine.list()).find((r) => r.id === routine.id) ?? routine
        await window.canvas.routine.save({ ...latestR, lastRun: { at, outcome: 'refused', error: result.reason } })
        reloadRoutines()
        return
      }
      // The id the mint answered — never "the newest chat", which a user's own
      // chat could be (the verifier's finding).
      const panelId = result.id
      // Merge onto the LATEST record: a pause saved while the mint was in flight
      // must not be overwritten by the fire's stale payload.
      const latest = (await window.canvas.routine.list()).find((r) => r.id === routine.id) ?? routine
      if (panelId !== undefined) {
        const answer = await window.canvas.agentSession.send(panelId, routine.prompt)
        const refused = typeof answer === 'object' ? answer.refused : answer.startsWith('refused') || answer === 'no-session' ? answer : undefined
        if (routine.plan !== undefined && routine.plan.trim() !== '') insertIntoComposer(panelId, routine.plan)
        await window.canvas.routine.save({ ...latest, lastRun: { at, outcome: refused === undefined ? 'started' : 'refused', panelId, ...(refused === undefined ? {} : { error: refused }) } })
      }
      reloadRoutines()
    })()
  }), [reloadRoutines])
  // M507. The rows main owns (templates, worktrees, accounts, credentials, workspaces), lifted into useMainRows.ts at exactly this position.
  const { accounts, canJumpAnywhere, credentialRows, jumpAnywhere, promptBodiesRef, promptRows, reloadCredentials, reloadPresets, reloadPrompts, reloadSettings, reloadTemplates, reloadWorkspaces, reloadWorktrees, setTemplateRows, settingRows, templateRows, templateRowsRef, workspaceListSignature, workspaceRows, worktreeRows } = useMainRows({
    attentionJumpRef, displayPanels, displayPanelsRef, jumpToAttention, palette, panelsRef, reloadWorkspacesRef, setPresetRows, switchWorkspace
  })
  // M507. The shell's settings (reveal, glow, overview, theme, font size, the column widths), lifted into useShellSettings.ts at exactly this position.
  const { globalFontSize, glowEnabled, inspectorPinned, inspectorWidth, minimapEnabled, navWidth, pipsEnabled, setInspectorPinned, setInspectorWidth, setNavWidth} = useShellSettings({
    displayPanels, landingTargetRef, merged, palette, panels, pendingRevealRef, reloadWorkspaces, resolveDormant, reveal, setDormantIds, setMergedData, settingRows, stepWorkspaceImplRef, switchWorkspace, viewportRef, workspaceListSignature, workspaceRows, registry
  })
  // (this redesign) THE DRAG. Imperative, on `shellRef` directly — never React state per
  // mousemove — for the same reason `applyDrag`'s own doc comment gives for
  // panel dragging: recomputing from a per-frame delta through a re-render
  // is the path that drifts and stutters. The CSS var IS the resize; commit
  // to the setting only once, on mouseup, clamped to the schema's own bounds.
  const onInspectorResizeDown = useCallback((event: ReactMouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    const shell = shellRef.current
    if (shell === null) return
    const startX = event.clientX
    const startWidth = inspectorWidth
    const min = 220, max = 480
    // `MouseEvent` alone resolves to React's `MouseEvent<T>` in this file
    // (imported for JSX handler props above) — `globalThis.MouseEvent` is
    // the real DOM type a `document.addEventListener` callback receives.
    const onMove = (e: globalThis.MouseEvent): void => {
      // The inspector sits on the RIGHT edge, so dragging left (negative dx) widens it.
      const next = Math.min(max, Math.max(min, startWidth - (e.clientX - startX)))
      shell.style.setProperty('--shell-ctx-w', `${next}px`)
    }
    const onUp = (e: globalThis.MouseEvent): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const next = Math.min(max, Math.max(min, startWidth - (e.clientX - startX)))
      setInspectorWidth(next)
      void window.canvas.settings.set('shell.inspectorWidth', next)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [inspectorWidth])
  // M279. The navigator's handle: on its RIGHT edge, so dragging right widens.
  const onNavResizeDown = useCallback((event: ReactMouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    const shell = shellRef.current
    if (shell === null) return
    const startX = event.clientX
    const startWidth = navWidth
    const min = 300, max = 480
    const onMove = (e: globalThis.MouseEvent): void => {
      const next = Math.min(max, Math.max(min, startWidth + (e.clientX - startX)))
      shell.style.setProperty('--shell-nav-w', `${next}px`)
    }
    const onUp = (e: globalThis.MouseEvent): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const next = Math.min(max, Math.max(min, startWidth + (e.clientX - startX)))
      setNavWidth(next)
      void window.canvas.settings.set('shell.navWidth', next)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [navWidth])
  // M507. What the shell reads once or on a settings change (font sizes, environment, update check, hints, recents), lifted into useShellReads.ts at exactly this position.
  const { adoptable, attemptedHint, clusterArrival, envBannerDismissed, envReport, envReportRef, firstTask, hintsLoaded, hintsSeen, hintsSeenRef, launcherPutAway, launcherRecentUsed, launcherRecents, markHint, onToggleInspectorPinned, recheckEnvironment, scrollbackPersist, scrollbackPersistRef, setAdoptable, setClusterArrival, setEnvBannerDismissed, setFirstTask, setLauncherPutAway, setSplash, splash, updateState } = useShellReads({
    globalFontSize, hostRef, initial, merged, palette, panels, panelsRef, setInspectorPinned, settingRows, startup, viewport, registry
  })

  // Rail and inspector visibility, persisted through main's settings store and
  // chorded on Cmd+\ / ⇧Cmd+\. Sits beside glowEnabled and pipsEnabled above
  // because it is the same kind of state and reads exactly the way they do:
  // its own settings:list call (settingRows is empty until the palette has
  // been opened, and the frame must be right on the first paint), re-run
  // whenever settingRows changes identity. That last half is not optional —
  // both settings are ordinary booleans, so main auto-generates a palette row
  // for each, and without the dependency a palette toggle would persist while
  // the rail never moved. See useShellChrome's own doc comment and
  // verify:panels 78.
  // M46. The shell measures ITSELF for its breakpoint (never the window —
  // useShellBreakpoint's own comment), and the chrome hook turns the
  // persisted booleans into what they mean at this width.
  const shellRef = useRef<HTMLDivElement>(null)
  const shellBp = useShellBreakpoint(shellRef)
  const chrome = useShellChrome({
    paletteIsOpen: palette.isOpen,
    settingsSignal: settingRows,
    bp: shellBp,
    // The splash is a canvas affordance; a persisted centerView of
    // 'orchestration' would restore straight over it with nothing shown.
    suppressOrchestrationOnBoot: splash !== 'none',
    // The launcher's own key, so the quiet shell and the launcher can never
    // disagree about whether this is a first workspace.
    firstWorkspace: panels.length === 0 && !merged
  })
  // Backlog #13. The dock's labelled mode: remembered, else Wide's default.
  const dock = useDockExpanded(shellBp)
  // The quiet shell ending opens the rail (and at Wide the inspector) in the
  // SAME commit that adds the first object — which was
  // placed in the wider, rail-less host. Without this the object jumps
  // sideways by half a column the moment the normal layout returns (and the
  // next spawn lands on top of it: verify:panels:shell 107 found it as a
  // click on the wrong panel). Only the flip is compensated; a ⌘\ toggle
  // keeps its old behaviour. The columns have no transition, so the widths
  // are exact, and restoreCamera is a set, not a flight.
  const firstWorkspaceNow = panels.length === 0 && !merged
  // M303 (Quiet instrument). Outside Compact, an UNPINNED inspector floats
  // over the canvas and only while something is selected: it answers "what
  // is this", and with nothing selected there is no this. It never takes a
  // column in that mode — a column that opened on the click that selected a
  // panel would narrow the host mid-gesture and slide the panel out from
  // under the cursor. Pinned keeps M46's resident column at every width.
  const ctxFloat = false && chrome.bp !== 'compact' && chrome.ctxVisible && !inspectorPinned
  const ctxResident = chrome.ctxVisible && !ctxFloat
  // `shell--inspector-collapsed` keeps its M46 meaning — the region is not on
  // screen — so a floating sheet that IS showing drops it; the float class
  // zeroes the column itself.
  // M389. A selected connector floats the inspector too: its route, arrows and label are configuration.
  const ctxFloatShown = ctxFloat && (selectedIds.size > 0 || selectedConnectorId !== null)
  const quietShellRef = useRef({ first: firstWorkspaceNow, nav: chrome.navVisible, ctx: ctxResident })
  useLayoutEffect(() => {
    const prev = quietShellRef.current
    quietShellRef.current = { first: firstWorkspaceNow, nav: chrome.navVisible, ctx: ctxResident }
    // BOTH ways, so the pair cancels: in (a reset, a last close) pans by +half,
    // out pans back. Compensating only the way out left every later object
    // half a column away in WORLD space from where it lands without the
    // quiet shell — verify:panels:shell 107 again. So on an empty canvas the
    // camera reads INITIAL plus that half (verify:panels:core 23 says so),
    // which is INITIAL's picture in the wider host.
    if (prev.first === firstWorkspaceNow || chrome.bp === 'compact') return
    // Positive = the host got narrower; a column opening on either side
    // moves the host's centre by half its width, towards the other side.
    const narrowed = (Number(chrome.navVisible) - Number(prev.nav)) * navWidth
      + (Number(ctxResident) - Number(prev.ctx)) * inspectorWidth
    if (narrowed === 0) return
    restoreCamera({ ...viewport, x: viewport.x - narrowed / 2 })
    // viewport is read at the flip, deliberately not a dependency: keyed on
    // it this would re-run on every pan.
  }, [firstWorkspaceNow, chrome.navVisible, ctxResident, chrome.bp, navWidth, inspectorWidth, restoreCamera])
  // A transient surface (a Compact drawer, the Attention popover) stands the
  // canvas's shortcuts down exactly as the palette does — ONE predicate,
  // composed below, never a copy (spec §7.6). Read through a ref so
  // shouldIgnoreKeys keeps its identity.
  const chromeTransientRef = useRef(false)
  chromeTransientRef.current = chrome.navDrawer || chrome.ctxDrawer || chrome.attentionOpen
  const chromeRef = useRef(chrome)
  chromeRef.current = chrome
  // M283. Orchestrate is a separate PAGE over a canvas that stays mounted (M268): its
  // sessions keep running, but nothing typed there may reach them. A ref of its own, not
  // folded into chromeTransientRef — that one also arms the outside-click dismissal of
  // the drawers, and every mousedown on Orchestrate would trip it. Read by
  // shouldIgnoreKeys, declared above, only from handlers long after this assignment.
  const canvasCoveredRef = useRef(false)
  // M413. The 3D world view covers the host the way Orchestrate does, and for the same
  // reasons: its sessions keep running underneath and nothing typed over the world may reach
  // them. The same bit the top bar's toggle, `#/world` and TC_WORLD=1 all write. M427: no
  // longer dev-only — the packaged renderer was measured loading the room under file://.
  const worldOn = useWorldOn()
  const closeWorldView = useCallback(() => setWorldOn(false), [])
  // M449. Assigned during render, not a hook: Canvas's hook order is load-bearing.
  // The stage calls this once the move back has settled and the inline transform is gone.
  setWorldLanding((target) => {
    const box = hostRef.current?.getBoundingClientRect()
    const width = box !== undefined && box.width > 0 ? box.width : window.innerWidth
    const height = box !== undefined && box.height > 0 ? box.height : window.innerHeight
    const posed = worldLandingViewport()
    restoreCamera(posed ?? landingViewport(target, { width, height }, viewportRef.current.scale))
  })
  const canvasCovered = chrome.centerView !== 'canvas' || worldOn
  canvasCoveredRef.current = canvasCovered
  // M283. The element that last had focus INSIDE the canvas host, kept so a return from
  // Orchestrate hands the keyboard back — without it the user's next keystroke after the
  // round trip goes nowhere. Cleared when focus moves deliberately to something OUTSIDE
  // the host (a rail field), so a return never steals it back from there.
  const lastHostFocusRef = useRef<HTMLElement | null>(null)
  // NATIVE focusin/focusout on the DOCUMENT, tested against the host read at event time.
  // Not React's onFocusCapture (xterm builds its textarea imperatively, outside React's
  // tree), and not a listener on the host node itself — that node is re-created during
  // the app's life while Canvas stays mounted, so a listener bound once stayed on a node
  // no longer in the page (orch-page.4 read the record as null, terminal focused, twice).
  useEffect(() => {
    const onIn = (event: FocusEvent): void => {
      const host = hostRef.current
      if (host !== null && event.target instanceof HTMLElement && host.contains(event.target)) lastHostFocusRef.current = event.target
    }
    const onOut = (event: FocusEvent): void => {
      const host = hostRef.current
      // Focus going to NOTHING (our own blur below, a window switch) keeps the record;
      // focus moving deliberately from the host to something OUTSIDE it drops it.
      const from = event.target
      const next = event.relatedTarget
      if (host === null || !(from instanceof Node) || !host.contains(from)) return
      if (next instanceof Node && !host.contains(next)) lastHostFocusRef.current = null
    }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut) }
  }, [])
  useLayoutEffect(() => {
    const host = hostRef.current
    const active = document.activeElement
    // The canvas page's side regions (navigator, file tree, inspector) collapse to
    // ZERO-WIDTH columns under Orchestrate, never display:none (the shell's load-bearing
    // rule), so their controls stayed in the tab order: Tab on Orchestrate walked into the
    // hidden inspector, whose primary action is a terminal's Restart (orch-page.4 found it).
    // Set here because those components own their roots and forward no attributes.
    for (const region of shellRef.current?.querySelectorAll<HTMLElement>('.shell__rail, .shell__tree, .shell__inspector') ?? []) {
      region.inert = chrome.centerView !== 'canvas'
    }
    if (canvasCovered) {
      // Blurred HERE, explicitly, rather than trusting `inert` to do it: Chromium's
      // focus fixup for an inert subtree runs lazily at a later style pass, and until it
      // does the terminal's textarea still takes a real keystroke (orch-page.3).
      // The side regions only count under Orchestrate: under the world they stay usable.
      if (active instanceof HTMLElement && (host?.contains(active) === true || (chrome.centerView !== 'canvas' && active.closest('.shell__rail, .shell__tree, .shell__inspector') !== null))) active.blur()
      return
    }
    // A task LATER, not here (a timeout, not a frame — a hidden window throttles frames): a Radix focus scope on the Orchestrate page hands focus
    // back to a body-level focus guard in its UNMOUNT cleanup, a passive effect that runs
    // after this layout effect — restored here, the keyboard was taken straight back
    // (orch-page.4 measured it on `span[data-radix-focus-guard]`).
    const later = window.setTimeout(() => {
      const el = lastHostFocusRef.current
      if (el === null || !el.isConnected) return
      // Yield only to a place the user is TYPING — a rail field, the command box. A
      // Dock or tab button that Tab or a click left focused on the way back is not
      // somewhere keystrokes are meant to go, and leaving it would strand them.
      const now = document.activeElement
      if (now instanceof HTMLElement && now !== document.body && now.closest('input, textarea, select, [contenteditable="true"]') !== null) return
      el.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(later)
  }, [chrome.centerView, canvasCovered])
  // M283. The palette mounts INSIDE the canvas host, which is opacity 0 and inert while
  // covered — opened over Orchestrate (Cmd+K, the top bar's search) it was an invisible
  // text field eating keystrokes. Its verbs are the canvas's, so opening it is a return
  // to the Canvas page. A palette `say()` does this too, which is why Orchestrate's own
  // refusals are said on Orchestrate, never through the palette.
  //
  // Navigation hierarchy: Canvas and Orchestrate are two VIEWS of the same work, so one
  // selection crosses the switch. Going in, Orchestrate seeds from the canvas's selection
  // (`initialSelectedId`); coming back, whatever Orchestrate had selected is selected here.
  // Handed over INSIDE the setter, synchronously — never an effect on centerView — so a
  // labelled jump (`leaveForCanvas(); goToPanel(id)`) still selects ITS target last.
  // Orchestrate having nothing selected leaves the canvas's selection alone: the canvas
  // may have held a note or terminal Orchestrate has no row for.
  const [orchSelectedId, setOrchSelectedId] = useState<string | null>(null)
  const orchSelectedRef = useRef<string | null>(null)
  orchSelectedRef.current = orchSelectedId
  const chromeSetCenterView = chrome.setCenterView
  const centerViewNow = chrome.centerView
  const setCenterView = useCallback((view: CenterView): void => {
    if (view === centerViewNow) return
    if (view === 'orchestration') {
      const cur = selectedIdsRef.current
      // One selected object carries itself; several carry their TASK when they
      // are all one task's (Orchestrate resolves a non-session member to the
      // task's session), so a lassoed task survives the switch too.
      const ids = [...cur]
      const shared = ids.length > 1 ? taskMemberships(displayPanelsRef.current, workItemsRef.current).filter((m) => ids.every((id) => m.members.some((x) => x.panelId === id))) : []
      setOrchSelectedId(ids.length === 1 ? ids[0]! : shared.length === 1 ? ids[0]! : null)
    } else if (centerViewNow === 'orchestration') {
      // Only Orchestrate hands a selection back; a task's focus view returns
      // to the canvas exactly as it was left (M324).
      const id = orchSelectedRef.current
      const cur = selectedIdsRef.current
      if (id !== null && !(cur.size === 1 && cur.has(id)) && panelsRef.current.some((p) => p.rect.id === id)) {
        selectOnly(id)
        // The focus a plain return restores belongs to the OLD selection — typing would
        // land in a session that is no longer the selected one (the M284 hazard below).
        lastHostFocusRef.current = null
      }
    }
    chromeSetCenterView(view)
  }, [centerViewNow, chromeSetCenterView, selectOnly])
  // M284. Every labelled "Open on canvas" from Orchestrate names its OWN target, so the
  // focus a plain return would restore (above) belongs to a panel the user did not ask
  // for — typing would land in that session. The target's own selection decides instead.
  const leaveForCanvas = useCallback((): void => {
    lastHostFocusRef.current = null
    setCenterView('canvas')
  }, [setCenterView])
  useEffect(() => {
    if (palette.open && chrome.centerView !== 'canvas') setCenterView('canvas')
  }, [palette.open, chrome.centerView, setCenterView])
  // M413. The same two rules for the world: the palette mounts inside the host, which is
  // invisible and inert under it, so opening the palette leaves the world; and the world is
  // a view OF the canvas page, so leaving that page (Orchestrate, a task's focus view,
  // People) turns it off rather than leaving a toggle pressed under another page.
  useEffect(() => {
    if (worldOn && (palette.open || chrome.centerView !== 'canvas')) setWorldOn(false)
  }, [worldOn, palette.open, chrome.centerView])
  // M324. A TASK'S FOCUS VIEW — the third center page. It remembers the page it
  // was opened from (the canvas, or Orchestrate) so Back returns there; the
  // canvas's camera is never touched, so "there" is exactly where it was.
  // M325. `side` opens the task on the side that answers what it needs (a
  // failing check, the changes to review); absent, the task's remembered side.
  const [focusTask, setFocusTask] = useState<{ itemId: string; from: 'canvas' | 'orchestration'; side?: FocusSide; at: number } | null>(null)
  const openFocusTask = useCallback((itemId: string, side?: FocusSide): void => {
    // Sessions, Review and People are pages, not a task's origin. Back returns
    // to the canvas, the same way team already did. Orchestrate is an origin,
    // and a task opened from focus keeps the one it was opened from.
    setFocusTask((cur) => ({ itemId, from: centerViewNow === 'focus' ? (cur?.from ?? 'canvas') : centerViewNow === 'team' || centerViewNow === 'sessions' || centerViewNow === 'review' ? 'canvas' : centerViewNow, ...(side === undefined ? {} : { side }), at: Date.now() }))
    setCenterView('focus')
  }, [centerViewNow, setCenterView])
  const closeFocusTask = useCallback((): void => {
    const from = focusTask?.from ?? 'canvas'
    setFocusTask(null)
    setCenterView(from)
  }, [focusTask, setCenterView])
  const openFocusTaskRef = useRef(openFocusTask)
  openFocusTaskRef.current = openFocusTask
  // M324. The palette's door: a work card names its item; any other panel its
  // ONE task. Opened a task later — the palette row runs while the palette is
  // still open, and an open palette returns every covering page to the canvas.
  boardVerbsRef.current.focus = (panelId: string) => {
    const panel = panelsRef.current.find((p) => p.rect.id === panelId)
    if (panel === undefined) return { kind: 'refused', reason: `there is no panel ${panelId} on this canvas` }
    const owners = isWorkPanel(panel) ? [panel.work.itemId] : taskMemberships(displayPanelsRef.current, workItemsRef.current).filter((m) => m.members.some((x) => x.panelId === panelId)).map((m) => m.itemId)
    if (owners.length === 0) return { kind: 'refused', reason: 'that panel is not part of a task — select a work card or one of its panels' }
    if (owners.length > 1) return { kind: 'refused', reason: `that panel is part of ${owners.length} tasks — focus one from its card` }
    const itemId = owners[0]!
    window.setTimeout(() => openFocusTaskRef.current(itemId), 0)
    return { kind: 'ran' }
  }
  // M326. A task a PERSON just started opens in its workspace — the place it
  // is worked on — once the palette that started it has closed (an open
  // palette returns every covering page to the canvas, so the open waits a
  // beat). An agent's start (the agent line) and a canvas drop stay on the canvas.
  boardVerbsRef.current.focusItem = (itemId: string) => {
    window.setTimeout(() => { if (workItemsRef.current.some((w) => w.id === itemId)) openFocusTaskRef.current(itemId) }, 0)
  }
  // Decision queue. The same ownership rule as `focus` above: one task or none.
  boardVerbsRef.current.taskOfPanel = (panelId: string) => {
    const panel = panelsRef.current.find((p) => p.rect.id === panelId)
    if (panel === undefined) return undefined
    const owners = isWorkPanel(panel) ? [panel.work.itemId] : taskMemberships(displayPanelsRef.current, workItemsRef.current).filter((m) => m.members.some((x) => x.panelId === panelId)).map((m) => m.itemId)
    return owners.length === 1 ? owners[0] : undefined
  }
  // M361. The review-comment verb's write. The task is the review's own
  // subject, else the ONE task the panel belongs to (taskOfPanel's rule).
  // A full list refuses rather than evicting: `parseReviewComments` keeps the
  // last REVIEW_COMMENTS_MAX, so an agent appending past it would silently
  // push the person's oldest comments out.
  boardVerbsRef.current.addReviewComment = (panelId, draft) => {
    const panel = panelsRef.current.find((p) => p.rect.id === panelId)
    if (panel === undefined) return { kind: 'refused', reason: `there is no panel ${panelId} on this canvas` }
    const itemId = isReviewPanel(panel) && panel.subject.workItemId !== undefined ? panel.subject.workItemId : boardVerbsRef.current.taskOfPanel?.(panelId)
    const item = itemId === undefined ? undefined : workItemsRef.current.find((w) => w.id === itemId)
    if (item === undefined) return { kind: 'refused', reason: `${panelId} is not part of one task — name its card, its review, or a panel only that task holds` }
    if ((item.comments ?? []).length >= REVIEW_COMMENTS_MAX) return { kind: 'refused', reason: `${item.title} already holds ${REVIEW_COMMENTS_MAX} comments — resolve or remove some first` }
    const comment = newReviewComment({ ...draft, quote: '', at: Date.now() })
    setWorkItems((current) => current.map((w) => (w.id === item.id ? carryWorkItem({ ...w, comments: [...(w.comments ?? []), comment], updatedAt: Date.now() }) : w)))
    return { kind: 'ran', note: `${draft.proposedBy === undefined ? 'commented' : 'proposed a comment'} on ${commentPlace(comment)} in ${item.title}` }
  }
  // A focus view with no task to show (deleted, or a workspace switch took it
  // away) is an empty page — it returns to the canvas instead.
  useEffect(() => {
    if (chrome.centerView !== 'focus') return
    if (focusTask === null || !workItems.some((w) => w.id === focusTask.itemId)) { setFocusTask(null); setCenterView('canvas') }
  }, [chrome.centerView, focusTask, workItems, setCenterView])

  // Backlog #75's diagnostics overlay toggle. Ephemeral, unlike chrome above:
  // this is a debug view, not a persisted preference.
  const diagnostics = useDiagnostics({ paletteIsOpen: palette.isOpen })
  // Stable identity, for the same reason resetViewport/centreOn must stay
  // useCallbacks: the overlay's own poll effect depends on this, and Canvas
  // re-renders on every mousemove over .canvas (setCursor) — an unstable
  // identity would restart that effect's interval on every frame the mouse
  // moves while the overlay is open.
  const getDiagnosticsInput = useCallback(
    () => ({
      panels: registry.all(),
      budget: tieringDiagnosticsRef.current.budget,
      liveCount: tieringDiagnosticsRef.current.liveCount,
      heldCount: tieringDiagnosticsRef.current.heldCount,
      backend: backendInfo
    }),
    [backendInfo]
  )

  // Named for what it holds, not for the store function it came from:
  // Task 5 imports the store's `attentionIds` read into this same scope.
  const waitingIds = useAttentionIds()
  // M229. What the CANVAS is doing, as one word for the ground's light. Two
  // facts this component already holds, and no new subscription: the
  // wants-you queue it renders the bell from, and the runs array it persists.
  //
  // needs-you outranks working, the order STATE_PRIORITY already gives them —
  // a canvas where someone is being ASKED something outranks one merely busy.
  // undefined is the third state and it is the common one: an idle canvas
  // stamps no attribute and resolves to --aura-1, byte-identical to before
  // M229. (Three states, not two: "nothing running" and "running quietly" are
  // different facts, and only the first leaves the ground alone.)
  //
  // The two words come from panel-state.ts, never spelled here: the ground is
  // answering the SAME fact a panel's edge answers, so it says it with the
  // same vocabulary. `verify:rail state.2` caught the first cut writing
  // 'working' straight into this file, which is precisely the drift that
  // check exists to stop.
  const canvasActivity: Tone | undefined = waitingIds.length > 0
    ? TONE_NEEDS_YOU
    : runs.some((r) => r.endedAt === undefined) ? TONE_WORKING : undefined
  // M231. The three facts the edge store cannot observe for itself, pushed in
  // from the component that already holds all three. The store grows no
  // subscriptions of its own, and this rides no counter: it re-runs when the
  // panels, the runs or the wants-you queue actually change, which is exactly
  // when an edge's answer can change. registry.version() is deliberately not
  // in the dependency list — that counter carries tier/status/focus/exit and
  // nothing higher-frequency, and edge activity is the high-frequency thing
  // that rule exists to keep off it.
  const openRunPanels = useMemo(() => {
    const live = new Set<string>()
    for (const r of runs) if (r.endedAt === undefined) for (const id of r.panelIds) live.add(id)
    return live
  }, [runs])
  useEffect(() => {
    setEdgeContext({ edges: enabledEdges(panels), armed: openRunPanels, blocked: new Set(waitingIds) })
  }, [panels, openRunPanels, waitingIds])
  // M76. The pending requests with the panel's label, for the palette's
  // Allow/Deny rows. The label is the same one the rail row shows.
  const pendingApprovals = useApprovals()
  const chatsVersion = useChatsVersion()
  const liveRunFacts = useMemo<Readonly<Record<string, RunLiveFact>>>(() => {
    const out: Record<string, RunLiveFact> = {}
    for (const panel of panels) {
      const id = panel.rect.id
      const approvals = pendingApprovals.filter((a) => a.id === id).map(({ requestId, toolName, argument }) => ({ requestId, toolName, argument }))
      if (isChatPanel(panel)) {
        const snapshot = getChat(id).snapshot
        out[id] = {
          ...(snapshot === null ? {} : { status: snapshot.status, turns: snapshot.turns, exitCode: snapshot.exitCode, exitSignal: snapshot.exitSignal, queued: snapshot.queued, queuedReason: snapshot.queuedReason }),
          // M367. The hold rides the fact, so every surface projecting it says a cap, not a keyboard.
          ...(snapshot?.meter?.held === undefined ? {} : { hold: snapshot.meter.held }),
          attention: waitingIds.includes(id), approvals
        }
      } else if (waitingIds.includes(id)) out[id] = { attention: true }
    }
    return out
  }, [panels, pendingApprovals, waitingIds, chatsVersion])

  // M202 (D07). Local review readiness per card. It reads git ONCE PER
  // REPOSITORY on a chat turn ending — never per card and never on a timer —
  // and answers `undefined` until the first read lands, so a card says
  // nothing about review rather than guessing.
  const { handoffOf: taskHandoffOf, laneOf: taskLaneOf, pathsOf: taskPathsOf, refresh: refreshTaskHandoffs, handoffsVersion } = useTaskHandoffs({ workItems, liveFacts: liveRunFacts })
  const activeWorkspaceId = workspaceRows.find((w) => w.active)?.id
  useEffect(() => { setResumeDismissed(false) }, [activeWorkspaceId])
  useEffect(() => {
    if (resumeDismissed || workItems.length === 0) { setResumeSummary(null); return }
    const subject = pickResumeSubject(workItems, retainedOutcomes)
    if (subject === null) { setResumeSummary(null); return }
    const item = workItems.find((i) => i.id === subject.itemId)
    if (item === undefined) { setResumeSummary(null); return }
    // M315. Resume is for RETURNING. A task created since this window opened
    // is the one the person is looking at: a "Resume work" card for it, seconds
    // after pressing Start, read as if they had been away and lost their place.
    if (item.createdAt >= APP_OPENED_AT) { setResumeSummary(null); return }
    const retained = retainedOutcomes.find((o) => o.itemId === item.id)
    const laneId = item.panelId
    const execution = laneId === undefined || liveRunFacts[laneId] === undefined ? undefined : projectSession(laneId, liveRunFacts[laneId])
    const handoff = taskHandoffOf(item.id)
    setResumeSummary(buildResumeSummary({
      item: {
        id: item.id,
        title: item.title,
        state: item.state,
        ...(item.description !== undefined ? { description: item.description } : {}),
        ...(item.note !== undefined ? { note: item.note } : {})
      },
      ...(retained !== undefined ? { retained: { execution: retained.execution, state: retained.state, ...(retained.refs === undefined ? {} : { refs: retained.refs }) } } : {}),
      ...(execution !== undefined ? { execution: { word: execution.word, detail: execution.detail, ...(execution.blocker !== undefined ? { blocker: execution.blocker } : {}) } } : {}),
      ...(handoff !== undefined ? { handoff: { actionLabel: handoff.actionLabel, detail: handoff.detail, word: handoff.word, action: handoff.action, ...(handoff.blocker !== undefined ? { blocker: handoff.blocker } : {}) } } : {})
    }))
  }, [workItems, retainedOutcomes, resumeDismissed, liveRunFacts, taskHandoffOf, handoffsVersion, activeWorkspaceId])
  const paletteTemplates = useMemo(() => templateRows.map((t) => {
    const refusal = templateRefusal(t, presetRows, claudeAvailable(presetRows))
    return { id: t.id, name: t.name, nodes: t.nodes.length, edges: t.edges.length, ...(refusal === undefined ? {} : { refusal }) }
  }), [templateRows, presetRows])
  const orchTemplates = useMemo(() => allTemplates(templateRows).map((t) => ({
    id: t.id,
    name: t.name,
    poolKeys: t.nodes.filter((n) => n.kind === 'pool').map((n) => n.key)
  })), [templateRows])
  const paletteApprovals = useMemo<ApprovalRow[]>(() => pendingApprovals.map((a) => {
    const panel = panelsRef.current.find((p) => p.rect.id === a.id)
    return { ...a, label: panel === undefined ? a.id : railLabel(panel, undefined) }
  }), [pendingApprovals])

  // Cell 8's door. The palette's own workspaces drill-in, never a second list:
  // the grid holds eight cells and the ninth is how you reach a ninth
  // workspace, which is a surface that already exists.
  const openWorkspaceScope = useCallback(
    () => palette.openPalette('workspaces'), [palette.openPalette])

  /**
   * M11's Cmd+G grid. Declared HERE rather than beside shouldYieldWheel
   * because it needs `workspaceRows` and `waitingIds`, neither of which exists
   * that far up; the two consumers that DO live up there read it back through
   * navGridIsOpenRef (see that ref's own comment).
   *
   * onCommit is switchWorkspace itself, not a second switching path: the grid
   * is a GESTURE onto M7's existing transaction, the same way the rail's
   * workspace row is.
   */
  const navGrid = useNavGrid({
    workspaces: workspaceRows,
    attentionIds: waitingIds,
    onCommit: switchWorkspace,
    onMore: openWorkspaceScope,
    // The palette owns the keyboard while it is open; two surfaces both
    // claiming Cmd is the one arrangement rule 3 of "who owns the keyboard"
    // exists to prevent.
    // M283. And never over Orchestrate: the grid mounts inside the covered canvas host,
    // so it would be invisible, and its release commits a workspace switch.
    enabled: !palette.open && chrome.centerView === 'canvas' && !worldOn
  })
  // Publishes the predicate to the two consumers declared above it — see
  // navGridIsOpenRef's own comment. In an effect rather than a render-time
  // assignment because navGrid.isOpen is a stable useCallback: this runs once.
  useEffect(() => { navGridIsOpenRef.current = navGrid.isOpen }, [navGrid.isOpen])

  // M507. The review verbs and the toolbox doors, lifted into useReviewVerbs.ts at exactly this position.
  const { onDragOver, openFileAtCentre, openFilePanel, openReview, openReviewAcross, openToolboxPanel, reviewTaskLane } = useReviewVerbs({
    commitHistory, hostRef, jumpToAttention, nextIdRef, panelsRef, placer, selectOnly, setPanels, taskLaneOf, viewportRef, workItemsRef, worldCentre, registry
  })
  // M507. The drop and the refs its later verbs fill, lifted into useDropVerbs.ts at exactly this position.
  const { addImageRef, beginNewChatRef, dropPath, importDocxRef, onDrop, openAsChatRef, openInTerminalRef } = useDropVerbs({
    hitOrderRef, navGridIsOpenRef, openFilePanel, palette, paletteActionsRef, panelsRef, viewportRef, registry
  })
  // M507. The window doors the Electron suites drive, lifted into useTestDoors.ts at exactly this position.
  useTestDoors({
    beginNewChatRef, commitHistory, dropPath, historyRef, hostRef, lastHostFocusRef, nextIdRef, onClosePanel, openAsChatRef, openFilePanel, openInTerminalRef, openJiraPanel, openToolboxPanel, paletteActionsRef, panelsRef, placer, selectOnly, setPanels, spawnWorkCard, undoCanvasRef, viewportRef, workItemsRef, worldCentre
  })

  // M507. The review commit, the restart sequence and the automation rows, lifted into useRestartVerbs.ts at exactly this position.
  const { automationResult, automationRows, automationRowsBuilt, automationRowsSignature, onReviewCommitted, restartWithSpec, setAutomationResult } = useRestartVerbs({
    panels, panelsRef, setPanels, registry
  })
  // M78. What every edge with a rule SAYS on the canvas (principle 13): the
  // trigger in the vocabulary's words, and `⋈ waiting` while a join is owed.
  const edgeLabels = useMemo(() => {
    const out = new Map<string, string>()
    for (const row of automationRowsBuilt) {
      if (!row.enabled) continue
      const key = `${row.from}:${row.to}`
      const result = automationResult.get(key)
      const userLabel = linksOf(panels.find((p) => p.rect.id === row.from) ?? panels[0]!).find((l) => l.to === row.to)?.label
      out.set(key, `${userLabel === undefined ? '' : `${userLabel} · `}${edgeWord(row.automation)}${result !== undefined && result.startsWith('waiting for') ? ' · waiting' : ''}`)
    }
    return out
  }, [automationRowsSignature, automationResult])
  const selectLink = useCallback((from: string, to: string) => {
    selectedIdsRef.current = EMPTY_SELECTION
    setSelectedIds(EMPTY_SELECTION)
    setSelectedConnectorId(null)
    setSelectedLink({ from, to })
  }, [])
  // M78. Delete/Backspace removes the selected edge (one history entry, the
  // palette row's own verb); Escape deselects. Gated like every canvas key.
  useEffect(() => {
    if (selectedLink === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (shouldIgnoreKeys()) return
      // A text field owns its own Backspace — a composer, a file editor, and
      // xterm's helper textarea alike (the M24 lesson). With focus in one of
      // them the edge is removed from the pane or the badge instead.
      const active = document.activeElement
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement || active instanceof HTMLSelectElement || (active instanceof HTMLElement && active.isContentEditable)) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        paletteActionsRef.current?.removeLink(selectedLink.from, selectedLink.to)
        setSelectedLink(null)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setSelectedLink(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selectedLink, shouldIgnoreKeys])
  // The merged view has no edge verbs; a workspace switch replaces the panels
  // under a selection. Both clear it rather than leaving a stale key.
  useEffect(() => { if (merged) setSelectedLink(null) }, [merged])
  useEffect(() => {
    if (selectedLink === null) return
    const source = panelsRef.current.find((p) => p.rect.id === selectedLink.from)
    if (source === undefined || !linksOf(source).some((l) => l.to === selectedLink.to)) setSelectedLink(null)
  }, [selectedLink, panels])
  const selectedEdge = useMemo(() => {
    if (selectedLink === null) return null
    const source = panels.find((p) => p.rect.id === selectedLink.from)
    const target = panels.find((p) => p.rect.id === selectedLink.to)
    if (source === undefined || target === undefined) return null
    const link = linksOf(source).find((l) => l.to === selectedLink.to)
    if (link === undefined) return null
    return {
      from: selectedLink.from, to: selectedLink.to,
      source: railLabel(source, undefined), target: railLabel(target, undefined),
      ...(link.label === undefined ? {} : { label: link.label }),
      ...(link.automation === undefined ? {} : { automation: link.automation }),
      canHandoff: (isTerminalPanel(source) || isChatPanel(source)) && (isTerminalPanel(target) || isChatPanel(target)),
      canRestart: isTerminalPanel(source) && isTerminalPanel(target),
      sourceIsChat: isChatPanel(source),
      result: automationResult.get(`${selectedLink.from}:${selectedLink.to}`)
    }
  }, [selectedLink, panels, automationResult])
  useEffect(() => registry.onExit((info) => {
    const source = panelsRef.current.find((panel) => panel.rect.id === info.panelId)
    if (!source || !isTerminalPanel(source)) return
    for (const link of linksOf(source)) {
      if (link.automation?.kind !== 'restart-on-exit' || !link.automation.enabled) continue
      const key = `${source.rect.id}:${link.to}`
      const target = panelsRef.current.find((panel) => panel.rect.id === link.to)
      const session = target && isTerminalPanel(target) ? registry.get(target.rect.id) : undefined
      /*
       * M301 (the critic): these three went STRAIGHT to the map and so were
       * never recorded — the lens came back from a relaunch showing remembered
       * handoffs beside forgotten restarts, with nothing saying why. They take
       * the same funnel as every other outcome now.
       *
       * `setHandoffResult` is declared BELOW this callback, and must stay out
       * of its dependency array: a dep array is evaluated during render, at
       * this line, where that const is still in its temporal dead zone — the
       * array would throw where the call does not. The call is safe because it
       * happens at EVENT time, by which point the render that created this
       * closure has finished, and because `setHandoffResult` is itself a
       * `useCallback(…, [])` and so is the same function every render.
       */
      if (!target || !isTerminalPanel(target) || !session || session.dormant) {
        setHandoffResult(key, 'skipped — target is dormant')
        continue
      }
      if (!isRestartable(session.status)) {
        setHandoffResult(key, 'skipped — target has not started')
        continue
      }
      setHandoffResult(key, `ran after exit ${info.exitCode}`)
      restartWithSpec(target.rect.id, target.spec)
    }
  }), [registry, restartWithSpec])

  // M41: the handoff kind, in its own hook beside the restart effect above —
  // it reacts to the SAME registry.onExit plus busy->idle transitions, reads
  // main's scrollback tail as the payload, and pastes it (never writes). A
  // stable setter so the hook's effect does not re-subscribe every render.
  const setHandoffResult = useCallback((key: string, sentence: string) => {
    setAutomationResult((current) => new Map(current).set(key, sentence))
    // M300. The same funnel, recorded. This map is IN MEMORY — Phase C's
    // deferred item is exactly that after a relaunch a handoff that fired
    // reads `unknown`, because the only record of it was this Map. The
    // durable row is what survives; the lens reads it back in M301.
    // `app` is the honest source: this app ran the automation, and the
    // sentence is its own vocabulary, not an agent's claim.
    //
    // M301 (the critic): only a SETTLED outcome is written. `queued — …` and
    // `waiting for …` describe an in-memory queue and join set that a
    // relaunch empties, so restoring one would draw a `· waiting` edge for a
    // join that can never complete.
    if (!isSettledHandoff(sentence)) return
    const [from, to] = key.split(':')
    void recordOrchEvent({
      runId: adoptedRunId(from ?? key), panelId: from, event: 'handoff', source: 'app',
      title: `Handoff ${from} → ${to}`, detail: sentence,
      // The link's own key, so the lens can match a row to an edge without
      // parsing the title — the title is prose and is allowed to change.
      key
    })
  }, [])
  const scrollbackEnabled = useCallback(() => scrollbackPersistRef.current, [])

  // M42 — search across every panel, over the durable log. The palette owns
  // the query (its input box IS the term) and reports it here while its scope
  // is `search`; Canvas debounces 120ms, asks main, and holds the answer.
  // Both are CLEARED when the scope leaves search, so a reopened palette
  // starts from no answer (null), not stale hits.
  const [searchResults, setSearchResults] = useState<PanelSearchResult | null>(null)
  const searchQueryRef = useRef('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // D13. The query as STATE too, for the renderer-side half (tasks and
  // retained outcomes) — the ref stays the stale-reply guard for main's half.
  const [workSearchQuery, setWorkSearchQuery] = useState('')
  const [workEvidence, setWorkEvidence] = useState<readonly WorkEvidenceRow[]>([])
  const onSearchQuery = useCallback((query: string) => {
    searchQueryRef.current = query
    setWorkSearchQuery(query)
    if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current)
    if (query.trim() === '') {
      // An empty box is "no answer yet" (null), NOT "no matches" ([]): the
      // three empty states depend on that distinction.
      setSearchResults(null)
      return
    }
    searchTimerRef.current = setTimeout(() => {
      const q = query
      void window.canvas.scrollback.search(q).then((hits) => {
        // Ignore an answer that arrived after the user typed on — only the
        // latest query's result may land.
        if (searchQueryRef.current === q) setSearchResults(hits)
      }, (err: unknown) => {
        // D13. The invoke ITSELF failing is a failure, never "no matches":
        // the row names it, and the tasks half still answers beneath it.
        if (searchQueryRef.current !== q) return
        // Electron's own rejection text, never pane content — main already scrubbed any reader's reason.
        const reason = err instanceof Error ? err.message : 'the search did not answer'
        setSearchResults({ hits: [], capped: false, cap: 0, redacted: 0, failures: [{ source: 'terminal and chat logs', reason }] })
      })
    }, 120)
  }, [])
  // M365. The capability query: while the palette's `capability` scope is
  // open, every panel with a toolbox directory (the inspector's own rule,
  // `inspectionDirectory(…, 'tools')`, asked rather than copied — M194) is
  // answered from main's toolbox read, one read per distinct directory. The
  // reads are main's cached ones (ToolboxCache), and only the LATEST query's
  // answers land. '' clears them, so a reopened scope starts from none.
  const [capability, setCapability] = useState<{ panelId: string; label: string; answer: CapabilityAnswer }[] | null>(null)
  const capabilityQueryRef = useRef('')
  const onCapabilityQuery = useCallback((query: string) => {
    capabilityQueryRef.current = query
    if (normalizeCapability(query) === '') { setCapability(null); return }
    const asked = panelsRef.current.flatMap((p) => {
      const d = inspectionDirectory(p, 'tools')
      return d.kind === 'known' ? [{ panelId: p.rect.id, label: panelName(p), cwd: d.cwd }] : []
    })
    void capabilityAcross(query, asked, (panelId, cwd) => window.canvas.toolbox.read({ panelId, cwd })).then((rows) => {
      if (capabilityQueryRef.current !== query) return
      setCapability(rows)
    })
  }, [])
  const workSearch = useMemo(() => {
    if (workSearchQuery.trim() === '') return null
    const cards = new Map<string, string>()
    for (const p of panels) if (isWorkPanel(p)) cards.set(p.work.itemId, p.rect.id)
    return searchWork(workSearchQuery, workItems, retainedOutcomes, (itemId) => cards.get(itemId), undefined, workEvidence)
  }, [workSearchQuery, workItems, retainedOutcomes, panels, workEvidence])
  // M320. The record's per-task index (check runs, reviewed paths, captures),
  // read once each time the search scope opens — a reference list, not content.
  useEffect(() => {
    if (palette.scope !== 'search' || typeof window.canvas?.tasks?.index !== 'function') return
    let live = true
    void window.canvas.tasks.index().then((rows) => { if (live) setWorkEvidence(rows) }, () => undefined)
    return () => { live = false }
  }, [palette.scope])
  // Leaving the search scope drops the answer, so the next open starts clean.
  useEffect(() => {
    if (palette.scope !== 'search') {
      if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current)
      searchQueryRef.current = ''
      setWorkSearchQuery('')
      setSearchResults(null)
    }
  }, [palette.scope])
  // The wake half of onSelectPanel WITHOUT the select/raise: a handoff must
  // start its target but must not steal the selection or the camera. Clears
  // Canvas's dormantIds (assignTiers reads it) alongside the registry flag,
  // so a framed target actually promotes and spawns.
  const wakeTarget = useCallback((id: string) => {
    setDormantIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
    registry.wake(id)
  }, [registry])
  // M79. The recorder observes the handoff hook; Run again restarts the roots.
  const runsApi = useRuns({ panelsRef, runsRef, setRuns, restartWithSpec })
  useHandoff({ registry, panelsRef, restartWithSpec, wakeTarget, setResult: setHandoffResult, scrollbackEnabled, onRunEvent: runsApi.onRunEvent })
  // M507. The run rows and the link automation setters, lifted into useRunRows.ts at exactly this position.
  const { onRunAgain, onSetLinkAutomation, onSetRestartOnExit, panelRun, railRuns, runFrames } = useRunRows({
    commitHistory, focusedIdRef, forgetOpenRunsRef, panels, runTick, runs, runsApi, runsRef, selectedId, setAutomationResult, setPanels, setRunTick
  })
  // M73. Mint a chat panel. The CLI session id is minted HERE so the panel
  // record is complete before any invoke resolves; main's agent:create is
  // asked FIRST so a refusal (no such directory, no claude) is answered by
  // name with no panel minted, and the hook's later create is idempotent.
  /**
   * M80. INSTANTIATE a template: each node through the ordinary create path
   * (a terminal through the same `makePanel` a spawn uses, a chat through
   * `beginNewChat`, which is what asks main for the session), then the edges
   * through `setLinkAutomation` — which is also what refuses a cycle. ONE
   * history entry for the whole shape: undoing a template is one press.
   *
   * A chat node's `message` is INSERTED into its composer, never sent: a
   * template must not start work the user has not read.
   */
  // M246. `caller` is who started the run, handed to every action node (the critic's finding 1).
  const instantiateTemplate = useCallback(async (template: PersistedTemplate, values: Record<string, string>, caller?: AgentPlanCaller): Promise<SpawnResult> => {
    instantiateCountRef.current += 1
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    // Fix round 2. The blocks have no runtime yet and the loop below skips
    // them by name, so a template carrying one would mint a PARTIAL shape and
    // commit a history entry for it while still reporting `spawned`. Every
    // Run door is disabled with this same sentence (`templateRefusal`); this
    // is the last gate, for a caller that asked anyway.
    const blocked = workflowBlockRefusal(template)
    if (blocked !== undefined) return { kind: 'refused', reason: blocked }
    const filled = fillTemplate(template, values)
    const centre = viewCentre(hostRef.current, viewportRef.current)
    const places = templatePanels(filled, centre)
    const minted = new Map<string, string>()
    const madePanels: Panel[] = []
    const messages: Array<{ id: string; text: string }> = []
    // Every chat session main has already created, so a refusal half way
    // through disposes them rather than leaving an agent with no panel
    // (M80's verifier).
    const createdChats: string[] = []
    const undoCreated = (): void => { for (const id of createdChats) void window.canvas.agentSession.dispose({ id, drop: true }) }
    const poolNodes: Array<Extract<typeof filled.nodes[number], { kind: 'pool' }>> = []
    const runNodes: Array<Extract<typeof filled.nodes[number], { kind: 'action' | 'http' }>> = []
    for (const place of places) {
      const node = place.node
      if (node.kind === 'chat') {
        const id = `c${nextIdRef.current++}`
        const sessionId = crypto.randomUUID()
        const result = await window.canvas.agentSession.create({ id, cwd: node.cwd, sessionId })
        if (result.kind === 'refused') { undoCreated(); return { kind: 'refused', reason: result.reason } }
        createdChats.push(id)
        const panel = makeChatPanel(id, place.centre, 1, { cwd: node.cwd, sessionId })
        // M182. The canvas binding: this panel is the template's node `key`; `Save selection as template` reads it to UPDATE the same record.
        madePanels.push({ ...(node.title === undefined ? panel : { ...panel, title: node.title }), templateBinding: { templateId: template.id, key: node.key } })
        minted.set(node.key, id)
        // The message goes in AFTER the panel is committed: the insert bus only
        // reaches a chat the store has seeded, and the store is seeded by the
        // panel's own hook — which cannot run before the panel exists.
        if (node.message !== undefined && node.message !== '') messages.push({ id, text: node.message })
        continue
      }
      // M132: the three workflow kinds land in TemplateNode's union but have
      // no runtime here yet — this task lands the schema, not the runtime,
      // so they are skipped BY NAME rather than instantiated as panels.
      // M138. The three block kinds have a runtime. A POOL starts AFTER the
      // shape is committed (its workers are minted on main's request, one per
      // item, beside this template's workflow panel). An ORCHESTRATOR is a
      // chat whose prompt rides every spawn through --append-system-prompt,
      // carried on its record (M81's rule). A COLLECT is a chat the pool's
      // workers hand off into through M78's join, its first message naming
      // the target.
      if (node.kind === 'pool') { poolNodes.push(node); continue }
      // M188. The two EXECUTABLE kinds mint no panel: they are the workflow's
      // own hands. They are collected here and run AFTER the shape is
      // committed, in template order, so an action that names a panel this
      // instantiation is minting can bind to it.
      if (node.kind === 'action' || node.kind === 'http') { runNodes.push(node); continue }
      if (node.kind === 'orchestrator' || node.kind === 'collect') {
        const id = `c${nextIdRef.current++}`
        const sessionId = crypto.randomUUID()
        const create = node.kind === 'orchestrator'
          ? { id, cwd: node.cwd, sessionId, appendSystemPrompt: node.prompt }
          : { id, cwd: node.cwd, sessionId }
        const result = await window.canvas.agentSession.create(create)
        if (result.kind === 'refused') { undoCreated(); return { kind: 'refused', reason: result.reason } }
        createdChats.push(id)
        const chat = node.kind === 'orchestrator' ? { cwd: node.cwd, sessionId, orchestrator: node.prompt } : { cwd: node.cwd, sessionId }
        madePanels.push({ ...makeChatPanel(id, place.centre, 1, chat), title: `${node.key} · ${node.kind}`, templateBinding: { templateId: template.id, key: node.key } })
        minted.set(node.key, id)
        if (node.kind === 'collect') messages.push({ id, text: `Results are handed off into this chat as the workers finish. Join them in the order they arrive and write the joined text to ${node.target}.` })
        continue
      }
      // A preset node is RESOLVED by main (only main turns an absent command
      // into the login shell, M5b) and minted here — never spawned through the
      // event path, which would place it itself and commit its own history
      // entry, and leave the renderer guessing which panel had arrived.
      let spec: PanelSpecTemplate | null = null
      if (node.presetId !== undefined) {
        const resolved = await window.canvas.preset.template(node.presetId)
        if (resolved === null) { undoCreated(); return { kind: 'refused', reason: `${node.key} names a preset that no longer exists` } }
        // M253. Main's own sentence for an unread pack preset — never the
        // "no longer exists" arm, which would tell the person the wrong fix.
        if ('refused' in resolved) { undoCreated(); return { kind: 'refused', reason: `${node.key}: ${resolved.refused}` } }
        spec = {
          panelId: '', cwd: node.cwd, args: [...resolved.args],
          ...(resolved.command === undefined ? {} : { command: resolved.command }),
          ...(resolved.agent === undefined ? {} : { agent: resolved.agent }),
          ...(resolved.agentOptions === undefined ? {} : { agentOptions: resolved.agentOptions }),
          ...(resolved.env === undefined ? {} : { env: { ...resolved.env } })
        }
      } else if ((node.command ?? '') !== '') {
        spec = { panelId: '', cwd: node.cwd, command: node.command as string, args: [...(node.args ?? [])] }
      }
      if (spec === null) { undoCreated(); return { kind: 'refused', reason: `${node.key} names neither a preset nor a command` } }
      const id = `n${nextIdRef.current++}`
      const panel = makePanel(id, place.centre, 1, { ...spec, panelId: id })
      madePanels.push({ ...(node.title === undefined ? panel : { ...panel, title: node.title }), templateBinding: { templateId: template.id, key: node.key } })
      minted.set(node.key, id)
    }
    setPanels((current) => {
      let next: Panel[] = [...current]
      let z = nextZ(current)
      for (const panel of madePanels) next = [...next, { ...panel, z: z++ }]
      for (const edge of filled.edges) {
        const from = minted.get(edge.from)
        const to = minted.get(edge.to)
        if (from === undefined || to === undefined) continue
        next = addLink(next, from, to)
        next = setLinkAutomation(next, from, to, { kind: 'handoff', enabled: true, trigger: edge.trigger })
      }
      commitHistory(next)
      return next
    })
    // M133. THE ONE PLACE a run learns its template. The recorder opens runs
    // from the handoff hook's events and knows nothing about templates, so
    // the origin is handed to it here, at the only moment anything knows that
    // these panel ids came from this shape of work.
    // (`noteTemplate` is a stable useCallback, so the captured `runsApi` object being
    // one render old cannot matter — the member is the same function.)
    // M184. The run learns its template AND the shape it ran: the definition as
    // it was at this instant and the node key → panel id mapping the
    // instantiation just made.
    runsApi.noteTemplate(madePanels.map((p) => p.rect.id), template.id, {
      // M184 (the critic, finding 5). A DIRTY draft's run is not the record's
      // revision: two runs of two different shapes both printing `revision 3`
      // is a wrong answer about which shape ran. `-1` is the mark the Runs tab
      // renders as `unsaved`.
      definition: { templateId: template.id, revision: getDraft(template.id)?.dirty === true ? -1 : (template.revision ?? 0), nodes: filled.nodes.map((n) => ({ ...n })), edges: filled.edges.map((e) => ({ ...e })) },
      mapping: Object.fromEntries(minted)
    })
    // M138. The pools start last, once every target they could hand off into
    // exists; a refusal (no list, a list main cannot read, a block already
    // running) lands in the block's own rows through the same reducer main's
    // events use, so the Runs tab says why in main's words.
    poolTargetsRef.current.set(template.id, { edges: filled.edges.map((e) => ({ ...e })), minted })
    for (const node of poolNodes) {
      const joined = filled.edges.some((e) => e.from === node.key)
      const started = await window.canvas.agentSession.poolStart({ templateId: template.id, key: node.key, node, ...(joined ? { joined: true as const } : {}) })
      if (started.kind === 'refused') applyPoolEvent({ templateId: template.id, key: node.key, event: { kind: 'refused', why: started.reason } })
    }
    // M188. The executable nodes, in template order, after every panel exists.
    // Each answers through the SAME `runNodeNow` the inspector's Test control
    // and the `node-test` verb take — one executor, so a node cannot behave
    // one way when a person tests it and another when the workflow runs it.
    for (const node of runNodes) {
      // The run's caller, never a hard-coded `undefined`: an agent-started run's
      // nodes must be refused and routed exactly as that agent's own line would be.
      const outcome = await runNodeRef.current?.(node, caller, template.reviewed !== false)
      if (outcome !== undefined && outcome.kind === 'failed') sayRef.current(`${node.key}: ${outcome.reason}`)
    }
    for (const { id, text } of messages) void deliverToComposer(id, text)
    // The whole shape is the selection: a template is one thing.
    const ids = madePanels.map((p) => p.rect.id)
    if (ids.length > 0) {
      selectOnly(ids[0] as string)
      for (const id of ids.slice(1)) addToSelection(id)
    }
    return { kind: 'spawned' }
  }, [commitHistory, selectOnly, addToSelection])
  instantiateTemplateRef.current = instantiateTemplate

  // M507. The layout marks, task membership and the related-item lens, lifted into useTaskLens.ts at exactly this position.
  const { approvalTaskOf, clusterHulls, lens, lockPanel, maximisePanel, navTask, panelMarks, pinPanel, relatedItemId, restorePanel, setRelatedItemId, taskMemberships, taskMenuRef, unlockPanel, unpinPanel } = useTaskLens({
    activeWorkspaceId, annotating, cardDetail, chrome, clusterHullsRef, commitHistory, displayPanels, displayPanelsRef, dormantIds, focusedId, focusedIdRef, goToViewport, groups, hostRef, merged, mergedRef, onFocusPanel, openFocusTaskRef, palette, paletteActionsRef, panels, panelsRef, runs, selectedId, selectedPanelIds, setPanels, setResumedNext, shouldIgnoreKeys, taskLaneOf, version, viewport, viewportRef, workItems, workItemsRef, worktreeRows, worldOn, registry
  })
  // M507. Annotations, ink and the time machine's rows, lifted into useAnnotations.ts at exactly this position.
  const { annotationMarks, beginAnnotate, commitAnnotation, endAnnotate, restoreSnapshot, snapshots } = useAnnotations({
    annotateTool, annotating, annotationSeq, annotations, chrome, commitInkRef, editingAnnotationRef, inkToolRef, merged, mergedRef, nextIdRef, panels, placeAnnotationRef, reloadWorkspacesRef, selectedAnnotation, setAnnotating, setAnnotations, setEditingAnnotation, setInkDraft, setSelectedAnnotation, shouldIgnoreKeys, switchWorkspace, panelsRef
  })
  const beginNewChat = useCallback(async (opts?: { cwd?: string; title?: string; agentOptions?: AgentOptions; appendSystemPrompt?: string; message?: string; backend?: AgentBackend; teammateId?: string; sandbox?: true; routine?: true; at?: Point }): Promise<SpawnResult> => {
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    const focused = focusedIdRef.current
    const focusedPanel = focused === null ? undefined : panelsRef.current.find((p) => p.rect.id === focused)
    const fallback = focusedPanel !== undefined && isTerminalPanel(focusedPanel)
      ? (getLiveSession(focusedPanel.rect.id)?.cwd ?? focusedPanel.spec.cwd)
      : focusedPanel !== undefined && isChatPanel(focusedPanel) ? focusedPanel.chat.cwd : '~'
    const cwd = (opts?.cwd ?? '').trim() === '' ? fallback : (opts?.cwd ?? '').trim()
    const id = `c${nextIdRef.current++}`
    const sessionId = crypto.randomUUID()
    const agentOptions = opts?.agentOptions !== undefined && Object.keys(opts.agentOptions).length > 0 ? opts.agentOptions : undefined
    // M81. ONE supervisor per canvas, refused HERE as well as in the sheet's
    // disabled row: the row is the affordance, this is the rule.
    if (opts?.appendSystemPrompt !== undefined && opts.teammateId === undefined && panelsRef.current.some((p) => isChatPanel(p) && p.chat.supervisor === true)) {
      return { kind: 'refused', reason: 'this canvas already has a supervisor' }
    }
    // M118. A row that cannot carry an appended prompt refuses the three doors
    // that append one (supervisor, routine, dispatch) BY NAME: a copilot
    // supervisor would silently not be one.
    if (opts?.appendSystemPrompt !== undefined && !BACKENDS[backendOf(opts ?? {})].appendsPrompt) return { kind: 'refused', reason: BACKENDS[backendOf(opts ?? {})].reasons.noPrompt }
    // M90. The backend rides the create and the record; absent stays absent.
    const backend = carryBackend(opts ?? {})
    // M100. The identity rides the create (main reads the brief and checks the places) and the record.
    const identity = opts?.teammateId === undefined ? {} : { teammateId: opts.teammateId }
    // M120. The sandbox flag: main resolves the cwd to its own folder and ignores the one here; the record keeps the mark so a relaunch re-creates it the same way.
    // The record's cwd is the INTENDED one except for a sandbox chat: the snapshot's cwd is a live session's, and a recycled panel id answers with a STALE session's folder (verify:panels codex.1 found it).
    const sandbox = opts?.sandbox === true ? { sandbox: true as const } : {}
    const result = await window.canvas.agentSession.create({ id, cwd, sessionId, ...backend, ...identity, ...sandbox, ...(agentOptions === undefined ? {} : { agentOptions }), ...(opts?.appendSystemPrompt === undefined ? {} : { appendSystemPrompt: opts.appendSystemPrompt }) })
    if (result.kind === 'refused') return { kind: 'refused', reason: result.reason }
    const title = (opts?.title ?? '').trim()
    // The navigation cluster and the command pill float over the host's edges;
    // a chat cascaded beneath them put its Send under the minimap, a covered
    // door (onboarding.start.1). Measured at spawn, because which corner the
    // cluster sits in is a breakpoint the CSS owns, not a constant here.
    const clearOfChrome = (world: Point): Point => {
      const host = hostRef.current
      if (!host) return world
      const hb = host.getBoundingClientRect()
      const vp = viewportRef.current
      const local = (r: DOMRect): ScreenRect => ({ x: r.left - hb.left, y: r.top - hb.top, w: r.width, h: r.height })
      // M395: the one reader of the chrome (safe-area.ts) — the map by its
      // LAYOUT box, whether it is tucked aside or hidden with everything in
      // view (it returns), plus any drawer lying over the canvas.
      const obstacles = chromeObstacles(host, { minimap: 'always' })
      // The minimap renders NOTHING on an empty canvas and arrives one render
      // after this chat does — onto its Send. So when it is absent, reserve its
      // box where the CSS will put it: stacked above the zoom pill on a wide
      // window (styles.css, the navigation cluster), top-right otherwise, and
      // nowhere in the compact layout, which hides it.
      const hud = document.querySelector<HTMLElement>('.canvas-hud')
      if (document.querySelector('.minimap') === null && document.querySelector('.shell[data-bp="compact"]') === null && hud !== null) {
        const h = local(hud.getBoundingClientRect())
        const w = MINIMAP_W + 2
        const tall = MINIMAP_H + 2
        obstacles.push(window.matchMedia('(min-width: 1280px)').matches
          ? { x: h.x + h.w - w, y: h.y - 6 - tall, w, h: tall }
          : { x: hb.width - 12 - w, y: 12, w, h: tall })
      }
      const screen = clearOfOverlays(worldToScreen(world, vp), { width: CHAT_W * vp.scale, height: CHAT_H * vp.scale }, obstacles)
      return screenToWorld(screen, vp)
    }
    // M402. The one placement rule (placer) unless the caller gave a point.
    const place = opts?.at === undefined ? placer() : null
    setPanels((current) => {
      // M181. An EXACT placement when the caller asked for one (the starter,
      // which lays four examples out relative to this rect and so must know it
      // without waiting for a commit). M402: the one placement rule otherwise —
      // a free spot, never inside a group the chat is not in (a chat landed in
      // the starter's) — then kept clear of the chrome floating over the
      // canvas, whose minimap may not have rendered yet (clearOfChrome).
      const want = opts?.at ?? viewCentre(hostRef.current, viewportRef.current)
      const placed = place === null ? null : place(current, makeChatPanel(id, want, 0, { cwd, sessionId })).rect
      const centre = placed === null ? want : clearOfChrome({ x: placed.x + placed.w / 2, y: placed.y + placed.h / 2 })
      // M121. A routine's chat is MARKED, the way a lane is: the record is what
      // makes its next spawn carry ROUTINE_PROMPT again after a relaunch.
      const panel = makeChatPanel(id, centre, nextZ(current), { cwd: opts?.sandbox === true ? result.snapshot.cwd : cwd, sessionId, ...backend, ...identity, ...sandbox, ...(opts?.appendSystemPrompt === undefined || opts.teammateId !== undefined ? {} : { supervisor: true }), ...(opts?.routine === true ? { routine: true as const } : {}), ...(agentOptions === undefined ? {} : { agentOptions }) })
      const next = [...current, title === '' ? panel : { ...panel, title }]
      commitHistory(next)
      return next
    })
    selectOnly(id)
    // M81/M80's rule: a first message is INSERTED, never sent.
    if (opts?.message !== undefined && opts.message !== '') void deliverToComposer(id, opts.message)
    return { kind: 'spawned', id }
  }, [commitHistory, selectOnly, placer])
  beginNewChatRef.current = beginNewChat
  /**
   * M114/M115/M202/M204. The board's verbs — dispatch a work item into a lane,
   * start a swarm arrangement over that lane, open and comment its PR, mark it
   * done, and the four camera verbs that show, frame and arrange a task.
   *
   * Called at exactly the position the contiguous run it replaces occupied,
   * and that position is load-bearing twice over. It must stay BELOW
   * `reviewTaskLane` and `taskMemberships`, which it takes; and ten of its
   * verbs are installed into `boardVerbsRef` DURING RENDER rather than
   * returned, so it must stay above every reader of that filled ref —
   * `usePaletteActions` and the JSX.
   */
  const {
    patchWorkItem, taskContextFor, markDone, frameItem, arrangeItem, fitTaskContext
  } = useBoardVerbs({
    panels, setPanels, panelsRef, displayPanelsRef, groups, setWorkItems, workItemsRef,
    boardVerbsRef, mergedRef, nextIdRef, commitHistory,
    selectedIds, selectedIdsRef, selectOnly, focusedId, focusedIdRef, onFocusPanel,
    viewportRef, hostRef, placer, frameRects, palette, setInputMode,
    presetRowsRef, teammatesRef, credentialRows,
    taskHandoffOf, taskLaneOf, taskPathsOf, refreshTaskHandoffs, taskMemberships, reviewTaskLane,
    startWorkRef: paletteActionsRef, relatedItemId, setRelatedItemId, closePanel: onClosePanel
  })
  // M504. Terminal ↔ chat, watcher and vault verbs, lifted into useChatSwapVerbs.ts at exactly this position.
  const { beginCreateVaultNote, beginWatcher, onFrontEnd, openAsChat, openAsChatVoid, openInTerminal, openVaultNote, setWatcherArmed } = useChatSwapVerbs({
    commitHistory, hostRef, mergedRef, nextIdRef, noteRootRef, onClosePanel, openAsChatRef, openFilePanel, openInTerminalRef, palette, panelsRef, placer, selectOnly, selectedIdRef, setEnteringPanelIds, setFocusedId, setInputMode, setPanels, setPendingFocusId, setSelectedIds, vaultRootRef, viewportRef, worldCentre
  })

  // M500. The workflow panel's verbs (M133–M184), lifted into useWorkflowVerbs.ts at exactly this position.
  const { beginWorkflowTrigger, buildWorkflowWithAi, deleteWorkflowTemplate, openWorkflowPanel, reloadWorkflowDraft, runWorkflow, saveWorkflowCopy, saveWorkflowDraft, stopWorkflowRun } = useWorkflowVerbs({
    beginNewChatRef, commitHistory, hostRef, instantiateTemplateRef, mergedRef, nextIdRef, paletteActionsRef, panelsRef, placer, presetRowsRef, reloadTemplates, runsRef, selectOnly, setInputMode, setPanels, setTemplateRows, stopPool, templateRowsRef, viewportRef
  })

  // M503. The object verbs (notes, memory, browser, relay, packs, node runs), lifted into useObjectVerbs.ts at exactly this position.
  const { addNote, addPack, beginNewNote, exportCanvas, exportPack, importCanvas, importPack, importSamplePack, markPresetRead, openBrowserPanel, openMemoryPanel, openRelayPanel, packPreview, prepareFeedback, runNodeRef, setNoteText, setNoteTint, setPackPreview, setRelaySession, testNode } = useObjectVerbs({
    commitHistory, focusedIdRef, hostRef, nextIdRef, noteRootRef, openFilePanel, palette, paletteActionsRef, panelsRef, placer, reloadPresets, reloadTemplates, reloadWorkspacesRef, selectOnly, setDormantIds, setInputMode, setPanels, switchWorkspace, templateRowsRef, viewportRef, worldCentre
  })

  // M388. The flowchart's verbs (useFlowchartVerbs.ts). Called HERE, below
  // everything it reads (onBeginDrag, the selection helpers, worldCentre) and
  // above usePaletteActions, which takes its verbs as deps.
  // ⌘Esc's hand-back, for a press on a shape: a terminal that held the
  // keyboard must not receive the Enter or Tab meant for the diagram.
  const releaseKeyboard = useCallback(() => {
    const active = document.activeElement as HTMLElement | null
    if (active !== null && active !== hostRef.current && hostRef.current?.contains(active) === true) active.blur()
    setFocusedId(null)
    hostRef.current?.focus({ preventScroll: true })
  }, [])
  const visibleWorld = useCallback(() => {
    const vp = viewportRef.current
    const host = hostRef.current
    const w = host?.clientWidth ?? window.innerWidth
    const h = host?.clientHeight ?? window.innerHeight
    return { x: -vp.x / vp.scale, y: -vp.y / vp.scale, w: w / vp.scale, h: h / vp.scale }
  }, [])
  const shapeStepRef = useRef<{ nextStep: (id: string) => void; previousStep: (id: string) => void } | null>(null)
  // M395. The chrome and the world in view, read when a new object needs a free spot (safe-area.ts).
  const flowchart = useFlowchartVerbs({ setPanels, commitHistory, panelsRef, nextIdRef, mergedRef, selectedIdsRef, selectOnly, addToSelection, onBeginDrag, worldCentre, releaseKeyboard, visibleWorld, stepRef: shapeStepRef, placer })
  // M344. The relay strip names people from this workspace's presence roster
  // ("sam is in control"), not by the first eight characters of a uuid.
  // M392. So does a teammate's shape's owner mark (below).
  const rosterNames = useRosterNames(activeWorkspaceId)
  // The shapes, in their own array for the ShapeLayer: a new array only when
  // `displayPanels` is (a panel changed) — never on a camera frame.
  const shapePanels = useMemo(() => displayPanels.filter(isShapePanel), [displayPanels])
  // M392. A shared canvas's placeholders as the flowchart layers draw them
  // (shared-shapes.ts): a teammate's shape as the real shape, read-only; every
  // placeholder as an arrow's end; the rest still cards. None while merged —
  // the placeholders are not drawn there either. `previous` keeps an unchanged
  // shape the same object, so a view that moved one repaints one.
  const peerFlowRef = useRef<PeerFlow | null>(null)
  const peerFlow = useMemo(() => {
    const next = buildPeerFlow(merged ? [] : shared.placeholders, (userId) => rosterNames.get(userId), peerFlowRef.current)
    peerFlowRef.current = next
    return next
  }, [merged, shared.placeholders, rosterNames])
  // The role table's delete row, per drawn shape: the placeholder's ×.
  const peerRemovable = useMemo(() => {
    const byId = new Map(shared.placeholders.map((p) => [p.id, p]))
    return new Set(peerFlow.shapes.map((s) => s.rect.id).filter((id) => { const p = byId.get(id); return p !== undefined && shared.mayRemove(p) }))
  }, [peerFlow, shared.placeholders, shared.mayRemove])
  const onPeerShapePress = useCallback((id: string, event: { clientX: number; clientY: number }) => {
    const p = sharedRef.current.placeholders.find((x) => x.id === id)
    if (p !== undefined) onBeginPlaceholderDrag(p, event)
  }, [onBeginPlaceholderDrag])
  const onPeerShapeRemove = useCallback((id: string) => {
    const p = sharedRef.current.placeholders.find((x) => x.id === id)
    if (p !== undefined) onRemovePlaceholder(p)
  }, [onRemovePlaceholder])
  // The minimap's set: its identity changes only when a shape is added or removed.
  const shapeIdKey = shapePanels.map((p) => p.rect.id).join(',')
  const shapeIdSet = useMemo(() => new Set(shapeIdKey === '' ? [] : shapeIdKey.split(',')), [shapeIdKey])
  // M389. Connectors: their views, the draw from a shape's port, their verbs.
  const connectors = useConnectors({
    setPanels, commitHistory, panelsRef, displayPanels, peers: peerFlow.endpoints, hitOrderRef, nextIdRef, hostRef, viewportRef, mergedRef,
    selectedIds, selectOnly, selectedId: selectedConnectorId, setSelectedId: setSelectedConnectorId, shouldIgnoreKeys
  })
  connectorsRef.current = connectors
  // M390. The diagram's bare keys (useShapeKeys' header: why they are safe).
  shapeStepRef.current = useShapeKeys({ hostRef, panelsRef, selectedIdsRef, shouldIgnoreKeys, mergedRef, flowchart, connectors, selectOnly })
  // M391. Mermaid in and out, and auto-layout.
  const flowchartIO = useFlowchartIO({
    setPanels, commitHistory, panelsRef, nextIdRef, setGroups, nextGroupIdRef, mergedRef, selectedIdsRef, selectOnly, addToSelection,
    worldCentre, frameRects, reducedMotion: prefersReducedMotion,
    nameOf: (p) => (isShapePanel(p) ? railLabel(p, undefined) : panelLabel(p))
  })
  // The palette slice reaches the connector verbs through the ref — the hook's
  // own object is new with every route, and a dep that changes per drag frame
  // would rebuild every verb in the palette (usePaletteActions.ts's header).
  const connectorVerbs = useMemo(() => ({
    connect: (...a: Parameters<Connectors['connect']>) => connectorsRef.current?.connect(...a) ?? { kind: 'refused' as const, reason: 'the canvas is not ready' },
    patch: (...a: Parameters<Connectors['patch']>) => connectorsRef.current?.patch(...a) ?? { kind: 'refused' as const, reason: 'the canvas is not ready' },
    remove: (...a: Parameters<Connectors['remove']>) => connectorsRef.current?.remove(...a) ?? { kind: 'refused' as const, reason: 'the canvas is not ready' }
  }), [])
  objectClipboardRef.current = {
    copy: () => flowchart.copyObjects().kind === 'ran',
    paste: (text) => {
      if (flowchart.pasteObjects(text)) return true
      // M391. A pasted diagram SAYS what it made and what it left out — the
      // same sentence the file and agent doors return (useFlowchartIO).
      const imported = flowchartIO.importPasted(text)
      if (imported === null) return false
      paletteActionsRef.current?.say(imported.kind === 'ran' ? (imported.note ?? 'diagram imported') : imported.reason)
      return true
    }
  }
  const onConnectorSelect = useCallback((id: string) => { connectors.select(id) }, [connectors.select])
  const selectedConnectorDetail = useMemo(() => {
    if (selectedConnectorId === null) return null
    const found = findConnector(panels, selectedConnectorId)
    if (found === null) return null
    const target = panels.find((p) => p.rect.id === found.connector.to)
    const name = (p: Panel | undefined): string => (p === undefined ? 'nothing' : isShapePanel(p) ? railLabel(p, undefined) : panelLabel(p))
    return { connector: found.connector, fromName: name(found.holder), toName: name(target) }
  }, [selectedConnectorId, panels])
  // M388. THE CANVAS DOOR FOR A SHAPE: a double-click on the GROUND — the
  // host, the world layer or the aura, never a panel, a shape, a control or
  // an annotation — places a process step there with its label open. Typing
  // names it; Escape or a click away with nothing typed leaves an empty step,
  // which ⌘Z takes back like any other add.
  const onCanvasDoubleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || mergedRef.current || annotating || linkDraw.state !== null) return
    const target = event.target as HTMLElement
    const host = hostRef.current
    if (host === null) return
    const ground = target === host || target.classList.contains('world') || target.classList.contains('canvas__aura')
    if (!ground) return
    const bounds = host.getBoundingClientRect()
    const world = screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewportRef.current)
    const made = flowchart.addShape('process', '', world)
    if (made.kind === 'ran' && made.id !== undefined) editNewShape(made.id)
  }, [flowchart, annotating, linkDraw.state])

  /**
   * M186. A PICTURE INTO THE STORE AND ONTO THE CANVAS, the one door every
   * gesture takes: a drop on empty canvas, a paste with no agent to take it,
   * the palette row, the agent's verb and the node's Replace. The bytes go
   * into the content-addressed store first (so the panel names an identity a
   * later export can carry), and the panel is minted from the store's own
   * path — never from the source, which the person may move or delete.
   */
  const addImageFromPath = useCallback(async (path: string, world?: Point): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const stored = await window.canvas.asset.put({ path })
    if (stored.kind === 'refused') return { kind: 'refused', reason: stored.reason }
    const at = world ?? viewCentre(hostRef.current, viewportRef.current)
    const imageId = `img${nextIdRef.current++}`
    // M395. With no place of its own (the palette row, the agent's verb) a
    // picture lands in the free spot nearest the centre; a drop keeps its point.
    const place = placer({ exact: world !== undefined })
    setPanels((current) => {
      const next = [...current, place(current, makeImagePanel(imageId, at, nextZ(current), stored.path, displayPath(path).short, stored.id))]
      commitHistory(next)
      return next
    })
    selectOnly(imageId)
    return { kind: 'ran', note: `${displayPath(path).short}${stored.wrote ? '' : ' (already in this canvas\'s pictures)'}` }
  }, [commitHistory, selectOnly])
  addImageRef.current = addImageFromPath
  /**
   * M250. A .docx into a NEW note, the one door all four gestures take (the
   * drop, the palette row, the agent's verb, an action node). Main converts
   * and writes; this only opens what main answered, as a note behind the
   * import gate (`imported` without `reviewed`). The loss report is the
   * result's note, so every door says what was dropped in the same words.
   */
  const importDocxFile = useCallback(async (path?: string, world?: Point): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const result = await window.canvas.docx.import(path === undefined ? {} : { path })
    if (result.kind === 'cancelled') return { kind: 'refused', reason: 'no document chosen' }
    if (result.kind === 'exists') return { kind: 'refused', reason: `${displayPath(result.path).short} already exists — rename or move it, then import again` }
    if (result.kind === 'refused') return result
    const at = world ?? viewCentre(hostRef.current, viewportRef.current)
    openFilePanel(result.path, at, { prose: true, exact: true, imported: { from: result.source, dropped: result.dropped } })
    return { kind: 'ran', note: `${displayPath(result.path).short} — ${result.dropped || 'nothing was dropped'}` }
  }, [openFilePanel])
  importDocxRef.current = importDocxFile
  /**
   * M186. Replace: the SAME store door, pointed at an existing panel. A
   * picture whose bytes are gone is an object a person can repair — the arm
   * that says `missing` keeps the panel, and this is the verb beside it.
   */
  const [imageReloads, setImageReloads] = useState<Record<string, number>>({})
  const replaceImage = useCallback(async (panelId: string, path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const target = panelsRef.current.find((p) => p.rect.id === panelId)
    if (target === undefined || !isImagePanel(target)) return { kind: 'refused', reason: 'that panel is not a picture' }
    // No path given: the SYSTEM's own chooser. A cancel is not a refusal and
    // says nothing — a sentence about a dialog the person closed on purpose
    // is noise.
    const chosen = path ?? await window.canvas.asset.choose()
    if (chosen === null || chosen === undefined) return { kind: 'ran', note: 'nothing chosen' }
    const stored = await window.canvas.asset.put({ path: chosen })
    if (stored.kind === 'refused') return { kind: 'refused', reason: stored.reason }
    setPanels((current) => {
      const next = current.map((p) => (p.rect.id === panelId && isImagePanel(p) ? { ...p, image: { path: stored.path, asset: stored.id }, title: displayPath(chosen).short } : p))
      commitHistory(next)
      return next
    })
    setImageReloads((current) => ({ ...current, [panelId]: (current[panelId] ?? 0) + 1 }))
    return { kind: 'ran', note: `${displayPath(chosen).short} is this picture now` }
  }, [commitHistory])

  // M501. The preview's verbs (M185 onward), lifted into usePreviewVerbs.ts at exactly this position.
  const { bindPreview, capturePreviewNow, discoverProject, openPreview, previewSubjectReason, setPreviewWidth, startDevServer } = usePreviewVerbs({
    commitHistory, displayPanelsRef, focusedIdRef, nextIdRef, openBrowserPanel, panelsRef, placer, registry, selectedIdsRef, selectOnly, setPanels, workItemsRef
  })

  /**
   * M128. The skill panel's mint — the ONE door, called by the Skills pane's
   * drop, a click on a card, and (through the palette's action object) by
   * anything later. The world point is the drop's own, so the panel lands
   * under the cursor at every zoom; one history entry, like every other mint.
   * The record is the pair and NOTHING else: everything the panel shows is
   * read live from the inventory.
   */
  const openSkillPanel = useCallback((scope: ToolScope, name: string, world: Point): void => {
    const skillId = `s${nextIdRef.current++}`
    setPanels((current) => {
      const next = [...current, makeSkillPanel(skillId, cascadeCentre(world, current), nextZ(current), scope, name)]
      commitHistory(next)
      return next
    })
    selectOnly(skillId)
  }, [commitHistory, selectOnly])
  /**
   * M103. The guest navigated: the record follows, with NO history entry
   * (M90's thread-id rule — a Cmd+Z that un-navigated a page would remove a
   * panel two presses later with nothing on screen explaining why). The
   * url written is the guest's own `getURL()`, never the page's word for it.
   * Same array back when nothing changed, so a reload to the same page
   * writes nothing.
   */
  const onBrowserNavigated = useCallback((id: string, url: string): void => {
    setPanels((current) => {
      const panel = current.find((p) => p.rect.id === id)
      if (!panel || !isBrowserPanel(panel) || panel.url === url) return current
      return current.map((p) => (p === panel ? { ...panel, url } : p))
    })
  }, [])

  // M502. The creation verbs (the starter, createObject, the first-run work doors), lifted into useCreationVerbs.ts at exactly this position.
  const { applyStarter, askWithoutFolder, chatInFolder, createObject, creationShareRef, markPreviewRead, markTemplateRead, relayNameFor, setChecklistView, setDeckView, setImportReviewed, setSheetView, startFirstWork } = useCreationVerbs({
    addImageFromPath, annotationSeq, beginNewChat, boardVerbsRef, commitHistory, envReportRef, fitAll, fitSelection, frameReadable, hintsSeenRef, hostRef, mergedRef, nextGroupIdRef, nextIdRef, noteRootRef, onSpawn, openBrowserPanel, openFilePanel, openRelayPanel, openWorkflowPanel, palette, paletteActionsRef, panelsRef, placer, reloadTeammates, rosterNames, setAnnotations, setClusterArrival, setDormantIds, setFirstTask, setGroups, setInputMode, setPanels, setStarter, setTemplateRows, starterRef, teammatesRef, templateRowsRef, transitionRef, viewportRef, workItemsRef, workspaceRows, worldCentre
  })
  // M246. The plan door's run: `runWorkflow`'s second parameter is the SOURCE
  // (click | fire), so passing it straight through would hand the caller in as
  // a source. Stable, so the palette actions do not re-memo every render.
  const runWorkflowFromPlan = useCallback((templateId: string, caller?: AgentPlanCaller) => runWorkflow(templateId, 'click', caller), [runWorkflow])
  const paletteActions = usePaletteActions({
    createObjectNow: createObject,
    applyStarter,
    saveWorkflowDraft,
    saveWorkflowCopyDraft: saveWorkflowCopy,
    addImageFromPath,
    replaceImagePanel: replaceImage,
    testNodeNow: testNode,
    exportCanvasFile: exportCanvas,
    prepareFeedbackNow: prepareFeedback,
    importCanvasFile: importCanvas,
    importDocxFile,
    exportPackFile: exportPack,
    importPackFile: importPack,
    importSamplePackFile: importSamplePack,
    markPresetReadNow: markPresetRead,
    addNote,
    setNoteText,
    setNoteTint,
    flowchartVerbs: flowchart,
    connectorVerbs,
    flowchartIO,
    openPreviewNow: openPreview,
    bindPreviewNow: bindPreview,
    setPreviewWidthNow: setPreviewWidth,
    capturePreviewNow,
    startDevServerNow: startDevServer,
    discoverProject,
    stopWorkflowRun,
    runWorkflowNow: runWorkflowFromPlan,
    templateRowsRef,
    reloadTemplates,
    recheckEnvironment,
    registry, palette, linkMode, panelsRef, displayPanelsRef, mergedRef,
    promptBodiesRef, nextGroupIdRef, presetRows, promptRows, settingRows,
    broadcastInput, broadcastReady, resetViewport, fitAll, fitSelection, selectedIdsRef, centreOn, worldCentre,
    goToViewport, cameraBack, cameraForward, undoCanvas, redoCanvas, bookmarksRef, setBookmarks, viewportRef,
    selectAndRaise, selectOnly, onSelectPanel, onClosePanel, openReview, openReviewAcross,
    openFilePanel, openToolboxPanel, openJiraPanel, openMemoryPanel, openWorkflowPanel, openGithubPanel, beginWatcher, beginNewNote, beginNewChat, openAsChat, openInTerminal,
    lockPanel, unlockPanel, pinPanel, unpinPanel, maximisePanel, restorePanel, beginAnnotate,
    instantiateTemplate: instantiateTemplateStable,
    restartWithSpec, commitHistory, switchWorkspace,
    movePanelsToWorkspace, toggleMerged, reloadPresets, reloadPrompts,
    reloadSettings, reloadCredentials, reloadWorkspaces, reloadWorktrees, worktreeRows, setPanels, setGroups,
    setInputMode, setBroadcastInput, openBrowserPanel, openSkillPanel,
    teammatesRef, chooseNavigator: chrome.chooseNavigator, setCenterView, toggleFlip: () => setFlipped((v) => !v),
    workItemsRef, setWorkItems, boardVerbsRef
  })
  sayRef.current = paletteActions.say
  addToBoardRef.current = (item, source) => {
    paletteActions.addWorkItem({ source, key: item.id, title: item.title, url: item.url, state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'], ...(item.description === '' ? {} : { description: item.description }), ...(item.state === null ? {} : { remoteState: item.state }) })
  }
  // The link layer's remover, with an identity that outlives the palette's
  // captured id. `paletteActions` is rebuilt whenever `palette.capturedId`
  // changes, so handing `paletteActions.removeLink` straight to LinkLayer
  // re-rendered the whole layer on every palette open — the exact case its
  // own memo comment names as one it stops. Read through a ref so the wrapper
  // never goes stale and never changes. verify:panels memo-stable.1.
  paletteActionsRef.current = paletteActions
  // M408 (D1). The right-click menu. Every input is a ref or a stable
  // callback, so its listener is one identity for the life of the canvas.
  const panelMarksRef = useRef(panelMarks)
  panelMarksRef.current = panelMarks
  const contextMenu = useCanvasContextMenu({
    hostRef, panelsRef, selectedIdsRef, marksRef: panelMarksRef, paletteActionsRef, editRef: canvasEditRef, registry, mergedRef,
    // selectAndRaise, never onSelectPanel (M408 follow-up): a right-click is
    // inspecting, and onSelectPanel's registry.wake would spawn a dormant panel.
    selectPanel: selectAndRaise,
    focusPanel: useCallback((id: string | null) => {
      if (id === null) { setFocusedId(null); focusedIdRef.current = null; return }
      onFocusPanel(id)
      // Set now as well: the Copy or Paste this precedes reads the ref in the same task.
      focusedIdRef.current = id
    }, [onFocusPanel])
  })
  const removeLinkStable = useCallback((from: string, to: string) => {
    paletteActionsRef.current?.removeLink(from, to)
  }, [])
  // M505. The navigator's models (rail, tree, vault, integrations, Board pane), lifted into useNavigatorModels.ts at exactly this position.
  const { boardPaneProps, frameTaskOf, goToPanelStable, goToWorkItem, insertPath, inspectorContextBand, inspectorModel, integrationsPaneProps, noteRoot, noteVault, onBroadcastStopMouseDown, openCredentials, openSettingsScope, panelRows, railAttention, railElsewhere, railRows, railWorkspaces, refreshTree, releaseFocusStable, selectedIsSessionless, selectedPanel, sendFromPill, toggleBroadcastStable, toggleDir, treeContextReason, treeRoot, treeRootLabel, treeRootPending, treeRows, vaultFilterRequest, vaultSelectedPath } = useNavigatorModels({
    beginCreateVaultNote, beginNewChatRef, centreOn, chrome, credentialRows, deleteWorkspaceRef, displayPanels, displayPanelsRef, dormantIds, focusedIdRef, frameRects, globalFontSize, hostRef, lastFocusedAtRef, liveRunFacts, markDone, noteRootRef, onFocusPanel, openFocusTask, openPill, openVaultNote, palette, paletteActions, paletteActionsRef, panels, panelsRef, pendingApprovals, prepareFeedback, reloadCredentials, selectedId, selectedIdRef, setFocusedId, setRelatedItemId, setWorkItems, settingRows, shouldIgnoreKeys, spawnWorkCard, taskHandoffOf, taskMemberships, teammateNameOf, teammates, templateRows, terminalNameOf, terminalRectsRef, vault, viewportRef, waitingIds, workItems, workItemsRef, workspaceRows, worktreeRows, registry
  })
  /* M499. The Skills pane (M127–M256), lifted into useSkillsPane.ts at
   * exactly this position: the shelf, its rename door and the pane's props. */
  const { shelf, skillSources, renameSkillEverywhere, skillsPaneProps } = useSkillsPane({
    panels, panelsRef, setPanels, commitHistory, selectedId, railRows, teammates, reloadTeammates,
    toggleNavigator: chrome.toggleNavigator, worktreeRows, paletteActionsRef, worldCentre
  })

  // M506. The attention models (inbox, briefing, task queue, resume) and the panes beside them, lifted into useAttentionModels.tsx at exactly this position.
  const { attentionAnnouncement, branchLine, briefing, hasSelection, inbox, inspectorSummary, jobRecovery, planViewsFor, reopen, repository, resumeBanner, resumeStrip, reviewModel, runResumeAction, taskQueue, teammatesPaneProps, toolboxModel, vaultPaneProps } = useAttentionModels({
    approvalTaskOf, backendInfo, beginNewChat, boardVerbsRef, centreOn, chrome, chromeRef, credentialRows, displayPanels, dormantIds, frameItem, handoffsVersion, inboxRef, jumpToAttention, liveSessionIds, openVaultNote, palette, paletteActions, paletteActionsRef, panels, panelsRef, railAttention, readyReviewRef, reloadRoutines, reloadTeammates, restoredTerminals, resumeSummary, routines, runs, runsApi, runsCutOff, runsRef, selectAndRaise, selectedId, selectedIsSessionless, selectedPanel, selectedTeammateId, setRelatedItemId, setResumeDismissed, setResumedNext, setSelectedTeammateId, taskHandoffOf, taskMemberships, teammates, teammatesRef, vault, vaultFilterRequest, vaultSelectedPath, waitingIds, workItems, workItemsRef, registry
  })
  // M393. THE LIVING FLOWCHART. A shape joined by a connector to a live
  // object — a terminal, an agent's chat, a watcher, a work card — shows that
  // object's state: a ring on its outline in the state's tone and ONE word,
  // the same word the rail shows for it (useShownState). The first such
  // connection binds; a diagram drawn over the work becomes a dashboard of
  // it. Bindings are REUSED across renders when nothing about them changed,
  // so a drag re-renders only the shape that moved.
  const liveCacheRef = useRef<Map<string, LiveBinding>>(new Map())
  const shapeLive = useMemo(() => {
    const rows = new Map(railRows.map((r) => [r.id, r]))
    const byId = new Map(panels.map((p) => [p.rect.id, p]))
    const out = new Map<string, LiveBinding>()
    const bind = (shapeId: string, panelId: string): void => {
      if (out.has(shapeId)) return
      const row = rows.get(panelId)
      if (row === undefined) return
      const prev = liveCacheRef.current.get(shapeId)
      out.set(shapeId, prev !== undefined && prev.kind === 'panel' && prev.panelId === panelId && prev.input === row.state && prev.name === row.label ? prev : { kind: 'panel', panelId, input: row.state, name: row.label })
    }
    // M394. A shape bound to a plan step shows the STEP's state first: the
    // chart the person drew became that plan, and the step is what it means.
    const views = new Map<string, ReturnType<typeof planView> | undefined>()
    for (const p of panels) {
      if (!isShapePanel(p) || p.shape.step === undefined) continue
      const { item, step } = p.shape.step
      if (!views.has(item)) views.set(item, planViewsFor(item))
      const v = views.get(item)?.find((x) => x.id === step)
      if (v === undefined) continue
      const prev = liveCacheRef.current.get(p.rect.id)
      out.set(p.rect.id, prev !== undefined && prev.kind === 'step' && prev.word === v.word && prev.tone === v.tone ? prev : { kind: 'step', word: v.word, tone: v.tone, name: 'this step' })
    }
    for (const p of panels) {
      for (const c of p.connectors ?? []) {
        const t = byId.get(c.to)
        if (t === undefined) continue
        if (isShapePanel(p) && !isShapePanel(t)) bind(p.rect.id, t.rect.id)
        else if (!isShapePanel(p) && isShapePanel(t)) bind(t.rect.id, p.rect.id)
      }
    }
    liveCacheRef.current = out
    return out
  }, [panels, railRows, workItems, taskQueue])

  /**
   * M403 (B6). THE FIRST START'S GUIDE, as a quiet strip inside its own
   * conversation. It used to float outside `.world` under (or over) the panel
   * and covered the composer's Send/Answer — the buttons its sentence points
   * at. Inside the panel it is ABSOLUTELY positioned over the top of the
   * transcript (never a box that collapses the body, the M236 frame rule), so
   * it is permanent — with its panel, until Got it — and needs no anchor,
   * flip or selection rule. The facts are read off the task as before (M310).
   */
  // M403 (B8). A folderless chat's first message names it — a plain title
  // write, never a history step (nobody asked to rename it, so there is no
  // act to undo), and never over a title already there.
  const nameChat = useCallback((id: string, title: string): void => {
    setPanels((current) => current.map((p) => (p.rect.id === id && p.title === undefined ? { ...p, title } : p)))
  }, [])
  const firstTaskStrip = (panelId: string): JSX.Element | undefined => {
    if (firstTask === null || firstTask.panelId !== panelId || hintsSeen.has('first-task')) return undefined
    const itemId = firstTask.itemId
    const item = itemId === undefined ? undefined : workItems.find((w) => w.id === itemId)
    const facts = (() => {
      if (item === undefined || itemId === undefined) return {}
      const handoff = taskHandoffOf(itemId)
      const lane = taskLaneOf(itemId)
      const laneWatchers = lane === undefined ? [] : displayPanels.filter(isWatcherPanel).filter((p) => p.watch.cwd === lane.path || p.watch.cwd.startsWith(`${lane.path}/`))
      return {
        facts: {
          ...(handoff === undefined ? {} : { standing: handoff.standing }),
          hasChanges: handoff?.changes !== undefined && handoff.changes.files > 0,
          checksPassed: laneWatchers.some((p) => getWatch(p.rect.id).status === 'passed'),
          github: item.source === 'github',
          pr: item.pr !== undefined,
          merged: item.merged !== undefined
        },
        onReview: () => { const r = boardVerbsRef.current.review?.(itemId); if (r !== undefined && r.kind === 'refused') paletteActionsRef.current?.say(r.reason) }
      }
    })()
    return <FirstTaskHint strip panelId={panelId} sent={firstTask.sent} onDismiss={() => { markHint('first-task'); setFirstTask(null) }} {...facts} />
  }

  // R-051. One terrace drag is one `moveRegion` plan and one history entry.
  // The scene cannot import the verb; it calls this through the publisher,
  // which reads the latest input, so this stays a fresh closure rather than
  // a memo that would freeze the first render's memberships. `commitHistory`
  // sits inside the updater, once — not once per member.
  const moveTaskRegion = (regionId: string, dx: number, dy: number): readonly string[] => {
    if (dx === 0 && dy === 0) return []
    const membership = taskMemberships(panelsRef.current, workItemsRef.current).find((m) => m.itemId === regionId)
    if (membership === undefined) return []
    const byId = new Map(panelsRef.current.map((p) => [p.rect.id, p]))
    const members = membership.members.flatMap((member) => {
      const panel = byId.get(member.panelId)
      if (panel === undefined) return []
      return [{ id: panel.rect.id, x: panel.rect.x, y: panel.rect.y, w: panel.rect.w, h: panel.rect.h }]
    })
    if (members.length === 0) return []
    const plan = moveRegion(members, dx, dy)
    const ids = new Set(plan.rects.map((rect) => rect.id))
    setPanels((current) => {
      let next = current
      for (const rect of plan.rects) next = setPanelRect(next, rect.id, rect)
      next = next.map((p) => (ids.has(p.rect.id) && p.maximised !== undefined ? (({ maximised: _m, ...rest }) => rest as Panel)(p) : p))
      commitHistory(next)
      return next
    })
    return plan.rects.map((rect) => rect.id)
  }

  // M421. The world's half of the work — tasks and their plans, waiting
  // requests, handoffs, who else is here — and the doors its buttons call.
  // Derived only while the room is up (the hook's own `on`).
  useWorldContextPublisher({
    on: worldOn,
    workspaceId: activeWorkspaceId,
    panels: displayPanels,
    approvals: pendingApprovals,
    jump: jumpAnywhere,
    canJump: canJumpAnywhere,
    closeWorld: closeWorldView,
    // M432. "View in Orchestrate" on a picked robot's card: the panel becomes the canvas's
    // selection (selectOnly writes the ref at once), and the page switch carries it, as
    // any canvas → Orchestrate switch does. Leaving the canvas page turns the room off (M413).
    orchestrate: (panelId) => {
      selectOnly(panelId)
      setCenterView('orchestration')
    },
    // M428. The branch an agent works on: a terminal's from its PTY's
    // worktree outcome (only `active` names one — a refusal ran in the plain
    // cwd), a chat's from the task lane its folder sits in — the handoff
    // hook's records, never the palette's lazily-read worktree list (which is
    // empty until ⌘K opens: task.show.1's trap).
    branchOf: (panel) => {
      if (isTerminalPanel(panel)) {
        const status = registry.get(panel.rect.id)?.status
        return status?.kind === 'running' && status.worktree?.kind === 'active' ? status.worktree.branch : undefined
      }
      if (!isChatPanel(panel)) return undefined
      const lanes = workItems.flatMap((item) => { const lane = taskLaneOf(item.id); return lane === undefined ? [] : [lane] })
      const branch = laneOfPath(panel.chat.cwd, lanes)?.branch
      return branch === undefined || branch === '' ? undefined : branch
    },
    teammateNameOf,
    moveRegion: moveTaskRegion,
    // R-071. An agent terminal's reply: bracketed paste, then one explicit submit.
    // The publisher refuses a plain shell before this runs.
    pasteTerminal: async (agentId, text) => {
      const handle = registry.get(agentId)?.handle
      if (handle === undefined) return 'answer in its terminal'
      handle.paste(text)
      handle.write('\r')
      return null
    },
    tasks: () => workItems.filter((item) => item.state !== 'done').map((item) => {
      const members = taskMemberships(displayPanels, [item])[0]?.members.map((m) => m.panelId) ?? (item.panelId === undefined ? [] : [item.panelId])
      const views = planViewsFor(item.id) ?? []
      const steps = (item.plan?.steps ?? []).map((step) => ({ id: step.id, title: step.title, word: views.find((v) => v.id === step.id)?.word ?? '', tone: views.find((v) => v.id === step.id)?.tone ?? 'none', ...(step.owner === undefined ? {} : { owner: step.owner }) }))
      return { id: item.id, title: item.title, state: item.state, members, steps }
    })
  })

  // M442. Appended hooks. Nothing above this point moves: a hook inserted
  // earlier would shift every later hook's state for the life of the canvas.
  // M507. The hooks M442 appended, lifted into useShellTail.ts at exactly this position; append new hooks BELOW this call.
  const { completeOnboarding, connectedSpawn, finishOnboarding, makeTaskRef, moveSessionsToTask, onHandOffPanel, onPausePanel, onboardingDone, onboardingProbes, restoreFacts, restoreOpen, setConnectedSpawn, setRestoreLeft, showOnboarding, taskCriteria, taskRegions } = useShellTail({
    commitHistory, displayPanels, envReport, inspectorModel, mergedRef, nextIdRef, onJumpAttention, onSpawn, paletteActionsRef, panelsRef, pendingApprovals, presetRows, reloadPresets, reloadWorkspaces, selectedIdsRef, setPanels, setWorkItems, shouldIgnoreKeys, shouldIgnoreKeysButLock, startup, taskMemberships, waitingIds, workItems, workItemsRef, workspaceRows, worldCentre
  })
  return (
    <div
      ref={shellRef}
      // M46. `shell--rail-collapsed` / `shell--inspector-collapsed` /
      // `shell--tree-collapsed` keep their M8a/M20 meanings (the region is
      // not on screen); the drawer classes say a transient overlay is up at
      // Compact; data-bp is what the stylesheet keys its columns on.
      className={`shell${chrome.navVisible ? '' : ' shell--rail-collapsed'}${
        ctxResident || ctxFloatShown ? '' : ' shell--inspector-collapsed'}${
        ctxFloatShown ? ' shell--inspector-float' : ''}${
        chrome.navVisible && chrome.navigator === 'files' ? '' : ' shell--tree-collapsed'}${
        chrome.navDrawer ? ' shell--nav-drawer' : ''}${chrome.ctxDrawer ? ' shell--ctx-drawer' : ''}${
        inspectorPinned ? ' shell--inspector-pinned' : ''}${
        chrome.centerView !== 'canvas' ? ' shell--center-orch' : ''}${
        resumeStrip !== null ? ' shell--strip' : ''}`}
      // (this redesign) The resize handle sets this same custom property live, imperatively,
      // during a drag; this inline value is only what REACT last committed —
      // the source of truth between drags, not during one. Set ONLY outside
      // Compact (or when pinned): an inline style beats every stylesheet
      // rule including `.shell[data-bp="compact"]`'s own zeroing, so setting
      // it unconditionally would silently defeat the compact collapse for
      // every user, not only a pinned one.
      // Also withheld while the pane is hidden outside Compact, for the same
      // reason: set there, it beat `.shell--inspector-collapsed`'s zero, so
      // the Context pane toggle (⇧⌘\) flipped the class and the column stayed.
      style={{
        ...(((chrome.bp !== 'compact' && ctxResident) || (chrome.bp === 'compact' && inspectorPinned)) ? { '--shell-ctx-w': `${inspectorWidth}px` } : {}),
        // M279. The navigator's width, by the same rule: only while it is a resident column.
        ...((chrome.bp !== 'compact' && chrome.navVisible) ? { '--shell-nav-w': `${navWidth}px` } : {})
      } as CSSProperties}
      data-bp={chrome.bp}
      data-dock={dock.expanded ? 'expanded' : 'icons'}
      onMouseDownCapture={(event) => {
        onMouseDownCapture(event)
        // A transient surface is dismissed by a mousedown OUTSIDE it — the
        // palette's own rule, on the drawers and the popover. The dock is
        // excluded because its icons toggle these surfaces themselves.
        if (!chromeTransientRef.current) return
        const t = event.target as HTMLElement | null
        if (t?.closest('.shell__dock, .dock__popover, .shell--nav-drawer .shell__rail, .shell--ctx-drawer .shell__inspector')) return
        chromeRef.current.dismissTransient()
      }}
    >
      {/* M109. The ground's light, under every region (the chrome is glass).
          M229: it answers activity too. It MUST — the two aura layers light
          the same ground, and a gate critic reading the first cut found a
          cool corner wash and a warm centre wash meeting in a muddy seam
          around x 600–700. If the ground's colour is a statement about state,
          a patch of ground still saying the old thing is a contradictory
          statement, and it undercuts the whole premise. Same attribute, same
          value, one source. */}
      <div className="shell__aura" aria-hidden="true" data-activity={canvasActivity} />
      {/* M256 (spec §19). The polite live region for "a panel just started
          wanting you" — see useAttentionAnnouncer's own comment for why this
          is not the dock badge's aria-live (a count, not a sentence). */}
      <div className="sr-only" aria-live="polite">{attentionAnnouncement}</div>
      {/* M256 (spec §18). A genuine scrim under a Compact drawer: the panels
          under it are still there in world space (the column is 0 width, not
          display:none — see the frame comment above), so the scrim is purely
          visual and takes no pointer handler of its own. The dismissal is the
          existing outside-mousedown-capture listener above, which already
          fires on any target that is not the drawer or the dock; the scrim
          just needs to not be in that exclusion list, and it isn't. */}
      {(chrome.navDrawer || chrome.ctxDrawer) && <div className="shell__scrim" aria-hidden="true" />}
      {/* DOM order is screen order for a screen reader: dock, then the top
          bar, then the navigator. */}
      <Dock
        navigator={chrome.navigator}
        navVisible={chrome.navVisible}
        onChoose={chrome.chooseNavigator}
        centerView={chrome.centerView}
        onSetCenterView={setCenterView}
        attention={railAttention}
        elsewhere={railElsewhere}
        onJumpElsewhere={jumpAnywhere}
        attentionOpen={chrome.attentionOpen}
        onToggleAttention={chrome.toggleAttention}
        onGoToPanel={goToPanelOrRequest}
        onAnswer={paletteActions.answerApproval}
        // M357. A hold's answers: the verb as a person (a refusal says why), and main's terminate.
        onAllowMore={(id, value) => { const r = paletteActions.capAgent(id, value, 'person'); if (r.kind === 'refused') notifyRefused(r.reason) }}
        onStopAgent={(id) => { void window.canvas.agentSession.terminate(id) }}
        // M378. A team answer main refused says why, like every other refusal.
        onTeamAskRefused={notifyRefused}
        attentionFocus={chrome.attentionFocus}
        taskTitleOf={approvalTaskOf}
        inbox={inbox}
        queue={taskQueue}
        onEvidence={(e) => {
          // M318. A decision's evidence: the asking panel, or the task's review.
          if (e.kind === 'review') { boardVerbsRef.current.review?.(e.itemId); return }
          if (e.kind === 'decision' || e.kind === 'panel' || e.kind === 'output') goToPanelOrRequest(e.panelId)
        }}
        onFocusTask={openFocusTask}
        onSettings={openSettingsScope}
        expanded={dock.expanded}
        onToggleExpanded={dock.toggle}
      />
      <TopBar
        presets={presetRows}
        onOpenSheet={() => paletteActions.beginStartWork()}
        workspaceName={workspaceRows.find((w) => w.active)?.name}
        onShowWorkspaces={() => chrome.chooseNavigator('workspaces')}
        // The crumb names the task of what is selected on the page SHOWING — the
        // canvas's selection, or Orchestrate's — so it always says what an action affects.
        {...(() => {
          const id = chrome.centerView === 'orchestration' ? orchSelectedId : selectedId
          if (id === null) return {}
          const task = taskMenuRef.current(id)
          return task.kind === 'one' ? { taskName: task.title, onShowTask: () => { leaveForCanvas(); frameTaskOf(id) } } : {}
        })()}
        onSearch={palette.openPalette}
        theme={(() => { const value = settingRows.find((row) => row.id === 'appearance.theme')?.value; return value === 'light' || value === 'dark' ? value : 'system' })()}
        onSetTheme={(value) => { void window.canvas.settings.set('appearance.theme', value) }}
        merged={merged}
        onToggleMerged={toggleMerged}
        contextOpen={chrome.ctxVisible}
        onToggleContext={chrome.toggleContext}
        navigatorOpen={chrome.navVisible}
        onToggleNavigator={chrome.toggleNavigator}
        inspectorPinned={inspectorPinned}
        onToggleInspectorPinned={onToggleInspectorPinned}
        centerView={chrome.centerView}
        onSetCenterView={setCenterView}
        running={inspectorSummary.running}
        waiting={inspectorSummary.waiting}
        onJumpWaiting={jumpToWaiting}
        accounts={accounts}
        sharedWorkspace={shared.view !== null}
        sessionCount={panels.filter((p) => isTerminalPanel(p) || isChatPanel(p)).length}
      />
      <ShareDialog accounts={accounts} workspaces={workspaceRows}
        onOpened={(id) => { void switchWorkspace(id) }} onWorkspacesChanged={reloadWorkspaces} />
      {/* M383. A conversation scrubbed back to any turn, and one beside it — a view over the renderer's own transcripts. */}
      <ReplaySheet
        chats={panels.flatMap((p) => (isChatPanel(p) ? [{ id: p.rect.id, label: panelName(p), cwd: p.chat.cwd }] : []))}
        turnsOf={(id) => getChat(id).turns} />
      {resumeStrip}
      <Navigator
        onResizeHandleDown={onNavResizeDown}
        hints={hintsLoaded ? contextualHint(hintsSeen, attemptedHint) : []}
        shapeCount={shapePanels.length}
        board={boardPaneProps}
        runs={railRuns}
        onRunAgain={onRunAgain}
        navigator={chrome.navigator}
        onToggle={chrome.toggleNavigator}
        merged={merged}
        workspaces={railWorkspaces}
        snapshots={snapshots}
        onRestoreSnapshot={restoreSnapshot}
        onSwitchWorkspace={paletteActions.switchWorkspace}
        onJumpWaitingWorkspace={(workspaceId) => {
          // The active workspace's own waiting panels are the ⌘J queue; any
          // other's are its elsewhere row, longest-waiting first.
          const id = railElsewhere.find((w) => w.workspaceId === workspaceId)?.panelIds[0]
          if (id !== undefined) jumpAnywhere(id)
          else jumpToWaiting()
        }}
        onCreateWorkspace={paletteActions.beginCreateWorkspace}
        onRenameWorkspace={paletteActions.beginRenameWorkspace}
        onDeleteWorkspace={paletteActions.deleteWorkspace}
        inbox={resumeBanner}
        rows={railRows}
        selectedId={selectedId}
        taskMemberReason={navTask === null ? undefined : (panelId) => navTask.members.find((m) => m.panelId === panelId)?.reason}
        onGoToPanel={goToPanelOrRequest}
        onStartPanel={paletteActions.startPanel}
        onClosePanel={paletteActions.closePanel}
        treeRootPath={treeRoot}
        treeRootLabel={treeRootLabel}
        // M68. The rail's own label for the panel (the honest chain, the user's title first), never the internal panelLabel.
        treeRootPanel={selectedId === null ? null : (railRows.find((r) => r.id === selectedId)?.label ?? null)}
        onToggleMerged={paletteActions.toggleMerged}
        treeRows={treeRows}
        treeRootPending={treeRootPending}
        // M48 (spec §5). Which panel, and why there is nothing to list.
        // M194. The policy answers with a reason ONLY for the two states this
        // line has never had words for — a sandboxed conversation, and a
        // directory that cannot be used. A kind that simply has none still
        // falls through to the line that NAMES the panel (M48 §5), which is
        // more specific than anything the policy could invent.
        treeEmptyReason={treeContextReason ?? (!selectedPanel
          ? 'select a panel to list its directory'
          : `${panelLabel(selectedPanel)} has no directory to list`)}
        onToggleDir={toggleDir}
        onInsertPath={insertPath}
        onRefreshTree={refreshTree}
        // M83. The Files pane's door to the memory of the directory it is
        // standing in — disabled by NAME, never hidden, when there is none.
        onOpenMemory={paletteActions.openMemory}
        memoryReason={noteRoot === null ? REASON_NO_REPO_MEMORY : undefined}
        vault={vaultPaneProps}
        integrations={integrationsPaneProps}
        skills={skillsPaneProps}
        teammates={teammatesPaneProps}
      />
      {/* M35 (Fix round 1). `canvas--ports-hidden` is a CLASS on the canvas
          host, never a `scale` prop threaded into every TerminalPanel. Ports
          are hidden below PORT_MIN_SCALE — a 14px dot is under two screen
          pixels at MIN_SCALE (0.1) — but `viewport.scale` changes on every
          frame of a zoom (`zoomAt`), and a `scale` prop on a memoized panel
          component would be a changed prop on every one of those frames,
          defeating `memo` for every panel on every zoom gesture. See
          PanelPorts.tsx's own comment. */}
      {/* M268/M272. Orchestration shares the canvas grid cell; the canvas host
          stays mounted (visually behind, never unmounted) so PTYs and agents
          keep running. The overlay animates in; prefers-reduced-motion snaps. */}
      {chrome.centerView === 'canvas' && <WorldLens on={worldOn} />}
      {/* M413. The 3D world view's layer, over a host that stays mounted (dev only; see WorldStage). */}
      <WorldStage on={worldOn} hostRef={hostRef} />
      {/* M498. Orchestrate, Team, a task's focus view, Sessions and Review:
          the pages over the canvas cell, laid out in CenterPages.tsx. */}
      <CenterPages
        centerView={chrome.centerView} chooseNavigator={chrome.chooseNavigator} setCenterView={setCenterView} leaveForCanvas={leaveForCanvas}
        panels={panels} panelsRef={panelsRef} displayPanelsRef={displayPanelsRef} workItems={workItems} workItemsRef={workItemsRef}
        taskMemberships={taskMemberships} orchTemplates={orchTemplates}
        goToPanelOrRequest={goToPanelOrRequest} goToWorkItem={goToWorkItem} frameTaskOf={frameTaskOf} openFileAtCentre={openFileAtCentre}
        openReview={openReview} markDone={markDone} paletteActions={paletteActions} paletteActionsRef={paletteActionsRef}
        orchestrate={orchestrate} setOrchestrate={setOrchestrate} patchWorkItem={patchWorkItem}
        taskHandoffOf={taskHandoffOf} refreshTaskHandoffs={refreshTaskHandoffs} automationResult={automationResult}
        presetRows={presetRows} beginNewChat={beginNewChat} workspaceRows={workspaceRows}
        selectedId={selectedId} setOrchSelectedId={setOrchSelectedId} taskQueue={taskQueue}
        openFocusTask={openFocusTask} closeFocusTask={closeFocusTask} planViewsFor={planViewsFor}
        accounts={accounts} focusTask={focusTask} setFocusTask={setFocusTask} taskContextFor={taskContextFor}
        teammates={teammates} moveSessionsToTask={moveSessionsToTask} pendingApprovals={pendingApprovals}
        backendInfo={backendInfo} registry={registry}
      />
      <div
        // `panning` is real React state (flips only at drag begin/end, so no
        // 60Hz cost); spaceHeld.isHeld() reads a ref and is therefore
        // best-effort here — Canvas already re-renders on nearly every
        // mousemove (setCursor), so the class catches up within a frame or
        // two of the keypress rather than exactly on it. Cursor feedback
        // only; the gesture itself never consults this className.
        // M121. The flip as a readable FACT on the host (verify:panels flip.1),
        // never inferred from which panels happen to render summaries.
        data-flipped={flipped ? '' : undefined}
        data-cluster-arrival={clusterArrival ? '' : undefined}
        className={`canvas${annotating ? ' canvas--annotating' : ''}${panning ? ' canvas--panning' : spaceHeld.isHeld() ? ' canvas--space-armed' : ''}${linkDraw.state !== null ? ' canvas--linking' : ''}${viewport.scale < PORT_MIN_SCALE ? ' canvas--ports-hidden' : ''}${docFocusId !== null ? ' canvas--doc-focus' : ''}${chrome.centerView !== 'canvas' ? ' canvas--behind-orch' : ''}${worldOn ? ' canvas--behind-world' : ''}`}
        ref={hostRef}
        aria-hidden={canvasCovered ? true : undefined}
        // M283. Covered means out of the tab order and deaf to clicks and keys, not only
        // invisible: an opacity-0 host still takes Tab into a terminal's textarea, and
        // typing there reached the PTY. `inert`, not display:none — a collapsed host
        // refits every xterm and SIGWINCHes each running agent (orch-page.2).
        inert={canvasCovered}
        // M44. Focusable so Cmd+Escape can land DOM focus here and Tab from
        // here walks the chrome. role=application because the canvas owns its
        // own keyboard model (a screen reader must pass keys through, not
        // intercept them), with a spoken name and a role description.
        tabIndex={0}
        role="application"
        aria-label="Canvas"
        aria-roledescription="infinite canvas of terminal panels"
        onMouseDownCapture={onCanvasMouseDownCapture}
        onMouseDown={onMouseDown}
        onContextMenu={contextMenu.onContextMenu}
        onMouseMove={(event) => {
          const host = hostRef.current
          if (host !== null) {
            const box = host.getBoundingClientRect()
            noteSpawnCursor(screenToWorld({ x: event.clientX - box.left, y: event.clientY - box.top }, viewportRef.current))
          }
          onMouseMove(event)
        }}
        onDoubleClick={onCanvasDoubleClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        // M395. The canvas never SCROLLS — the camera is the only thing that
        // moves the world. `overflow: hidden` still lets a focus() without
        // preventScroll, or a scrollIntoView, scroll it: that slid every
        // overlay (the HUD, the map, Create) up under the top bar in the
        // `group` and `overview` shots, and every host-local measurement with
        // them. Put it back the moment it happens (React's onScroll does not
        // bubble, so this is the host's own scroll only).
        onScroll={(event) => { const el = event.currentTarget; if (el.scrollTop !== 0 || el.scrollLeft !== 0) { el.scrollTop = 0; el.scrollLeft = 0 } }}
      >
        {/* M249. A SIBLING of .world, never inside it: outside the transformed
            layer it cannot change a panel's size, and it is absolutely
            positioned so expanding it pushes nothing (pill.rects.1). The
            pill reads its own queue (R-030). */}
        <CommandPill actions={paletteActions} panels={panels}
          {...(lens !== null ? { taskTitle: workItems.find((i) => i.id === lens.itemId)?.title ?? lens.itemId } : {})}
          selectedIds={[...selectedIds]} orchestratorId={orchestratorTarget(orchestratorCandidates(panels))}
          engineReason={onboardingReadiness(envReport).preferred === undefined ? 'no conversation engine available — check readiness' : undefined}
          onJump={pillJump} onSend={sendFromPill} openRef={pillOpenRef} />
        {/* M408 (D1). The right-click menu, in screen space beside the pill. */}
        {contextMenu.element}
        {/* M69. The far-view tier, provided once for every kind's frame. */}
        <CardDetailContext.Provider value={cardDetail}>
        {/* M92. The marks every frame paints, keyed by id, provided ONCE like the tier. */}
        <PanelMarksContext.Provider value={panelMarks}>
        {/* M109. The camera's light, under the world: a sibling BEFORE .world so
            the world paints over it, moved at 0.12 of the viewport's translation
            (parallax — the ground is far away). Never a click target. */}
        {/* M229. data-activity is the ENTIRE cost of the responsive aura: one
            attribute on the layer that was already here, re-valuing the one
            gradient already painting on it. No second layer, no per-panel
            element, no layout read per frame — a light that cost frames
            during a drag would be a net loss whatever it looked like. */}
        <div className="canvas__aura" data-screen-control="" aria-hidden="true" data-activity={canvasActivity} style={{ transform: `translate(${viewport.x * 0.09}px, ${viewport.y * 0.09}px)` }} />
        <div
          className="world"
          data-detail={cardDetail}
          // M144. `--chrome-scale`: the counter-scale every frame's chrome bar
          // and resize handles read (backlog #60), clamped to [1, 2.5] — 1× at
          // the working zoom and above, so nothing changes there; 2.5× at 0.4
          // and below, where the panels are cards. ONE variable on the world,
          // so no panel re-renders for a zoom; and a CSS transform on the
          // chrome only, so no layout box moves and no agent is reflowed.
          // M395. `--far-scale`: the UNCLAMPED 1/scale the far tiers set a
          // card's name in (styles.css), so it holds a minimum SCREEN size
          // where --chrome-scale has stopped growing; read only under
          // .world[data-detail="summary"|"block"], never by a live body.
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`, '--chrome-scale': String(Math.min(2.5, Math.max(1, 1 / viewport.scale))), '--far-scale': String(1 / viewport.scale) } as CSSProperties}
        >
          {/* M79. Run frames: derived, read-only, never groups. */}
          <GroupLayer
            groups={merged ? [] : runFrames}
            panels={displayPanels}
            readOnly={true}
            onBeginDrag={() => {}}
            onToggle={() => {}}
            onRemove={() => {}}
          />
          <GroupLayer
            groups={merged ? [] : groups}
            panels={displayPanels}
            readOnly={merged}
            onBeginDrag={onBeginGroupDrag}
            onToggle={toggleGroupCollapsed}
            onRemove={onRemoveGroup}
          />
          {cardDetail === 'cluster'
            ? <TaskClusterLayer clusters={clusterHulls} />
            : !merged && <TaskClusterLayer region clusters={clusterHulls.filter((c) => c.kind === 'task')} />}
          {!merged && <TaskRegionLayer regions={taskRegions} />}
          <TierLayer />
          <NavigateTier
            scale={viewport.scale}
            panels={displayPanels}
            railRows={railRows}
            terminalPanels={terminalPanels}
            focusedId={focusedId}
            collapsedPanelIds={collapsedPanelIds}
            releaseFocus={releaseFocusStable}
            hostRef={hostRef}
            onSelect={selectAndRaise}
            merged={merged}
            approvalOf={(id) => pendingApprovals.find((a) => a.id === id)}
            onAnswer={(id, requestId, allow) => paletteActions.answerApproval(id, requestId, allow)}
            onOpen={goToPanelOrRequest}
          />
          {!merged && pendingApprovals.map((approval) => {
            const host = displayPanels.find((panel) => panel.rect.id === approval.id)
            if (host === undefined) return null
            return (
              <div key={approval.requestId} className="inline-approval-host" style={{ position: 'absolute', left: host.rect.x + 16, top: host.rect.y + host.rect.h - 132, width: Math.max(160, Math.min(420, host.rect.w - 32)), zIndex: host.z + 2 }}>
                <InlineApproval
                  approval={approval}
                  waiting={waitingSince(approval.requestId, Date.now())}
                  onAllow={() => paletteActions.answerApproval(approval.id, approval.requestId, true)}
                  onDeny={() => paletteActions.answerApproval(approval.id, approval.requestId, false)}
                  onViewDiff={() => paletteActions.openReview(approval.id)}
                />
              </div>
            )
          })}
          {/* First child, and z-index 0 in the stylesheet, so it paints
              beneath every panel — nextZ mints z >= 1. It is inside .world so
              it pans and zooms with the panels. The LAYER itself still takes
              no pointer events; M35 Task 6 opts each link's own hit stroke
              and remove badge back in individually so a link can be hovered
              and removed without the layer as a whole ever swallowing a
              click. See LinkLayer.

              Fed displayPanels rather than panels, for the same reason the
              panel map below is: while merged the only rects on screen are
              lane-offset ones, and a layer drawn from `panels` would paint
              every link at its un-offset position — lines detached from the
              panels they join. buildLinkSegments skips a link whose target is
              not in the array it was handed, so a link that crosses a lane
              boundary simply does not draw rather than drawing wrong.

              onRemove is the SAME paletteActions.removeLink the inspector's
              link rows use — never a second copy — so both surfaces produce
              exactly one history entry and cannot disagree about what
              removing a link means. Suppressed while merged, where geometry
              and links are read-only, the same gate the drag and the move
              verb already take. */}
          {/* M93. In annotate mode a transparent sheet over the world takes every
              click — a panel's own mousedown stops propagation, so without it a
              note could be placed on the ground but never on a panel. */}
          {annotating && <div className="annotate-sheet" data-annotate-sheet />}
          <SnapGuides guides={snapGuides.guides} spacing={snapGuides.spacing} />
          {/* The shared canvas: teammates' panels, inert, at the doc's rects. */}
          {!merged && (
            // M392. A teammate's drawable shape is the ShapeLayer's (peerFlow); the rest stay cards.
            <SharedPlaceholderLayer placeholders={peerFlow.cards} workspaceId={activeWorkspaceId}
              mayArrange={shared.mayArrange} mayRemove={shared.mayRemove} files={shared.view?.files ?? []}
              onBeginDrag={onBeginPlaceholderDrag} onRemove={onRemovePlaceholder}
              // M343. Beside the placeholder, never over it: both stay visible.
              onAttachRelay={(p) => { if (p.relay !== undefined) openRelayPanel({ program: p.relay.program, sessionId: p.relay.session, ...(creationShareRef.current === undefined ? {} : { shareId: creationShareRef.current }) }, { x: p.x + p.w + 40 + RELAY_W / 2, y: p.y + RELAY_H / 2 }) }} />
          )}
          {/* M93. Notes in the margins, a sibling of the links so they pan and zoom with the world. */}
          <AnnotationLayer annotations={annotations} panels={displayPanels} selectedId={selectedAnnotation} editingId={editingAnnotation} draft={inkDraft} merged={merged}
            onSelect={merged ? undefined : setSelectedAnnotation} onBeginEdit={merged ? undefined : setEditingAnnotation} onCommitEdit={commitAnnotation} onCancelEdit={(id) => { const a = annotationsRef.current.find((x) => x.id === id); commitAnnotation(id, a?.text ?? '') }} />
          <LinkLayer
            panels={displayPanels}
            draw={linkDraw.state}
            onRemove={merged ? undefined : removeLinkStable}
            edgeLabels={edgeLabels}
            selectedKey={selectedLink === null ? null : `${selectedLink.from}:${selectedLink.to}`}
            onSelect={merged ? undefined : selectLink}
            cardDetail={cardDetail}
          />
          {/* M247. Beside LinkLayer, in the same world transform and on the same curve. */}
          <AgentLinkLayer panels={displayPanels} cardDetail={cardDetail} hidden={!agentLinksOn}
            onOpenDraft={merged ? undefined : openDraftReview} />
          {/* M130. THE TRAIL'S LANE, derived beside `anchoredPanels` and never
              written back: one column per host at a fixed offset to its
              right, re-derived from the host's rect on every render. Not
              panels — plain elements in the world layer, so forty skill uses
              cost zero LOD budget and zero records (M79's run frames, M114's
              anchored card).

              Suppressed while MERGED, where every geometry the view paints is
              a lane offset that exists only in that render; at the far tiers,
              where the host itself is drawn as a card and its trail would be
              a column of unreadable slivers; and for a host whose lane the
              user folded away. */}
          {!merged && cardDetail === 'tail' && displayPanels.filter((p) => p.skillTrail !== 'collapsed').map((panel) => (
            <SkillTrailLane
              key={`trail:${panel.rect.id}`}
              panel={panel}
              selected={selectedIds.has(panel.rect.id)}
              cwd={isTerminalPanel(panel) ? panel.spec.cwd : isChatPanel(panel) ? panel.chat.cwd : null}
              shelf={shelf}
              onOpenSkill={openSkillPanel}
            />
          ))}
          {/* M507. Each panel by kind, in PanelNode.tsx: a plain function called here, so the tree is unchanged. */}
          {displayPanels.map((panel) => renderPanelNode(panel, {
              activeWorkspaceId, addGithubToBoard, addJiraToBoard, beginNewChatRef, beginWorkflowTrigger, bindPreview, boardKeys, buildWorkflowWithAi, capturePreviewNow, cardDetail, credentialRows, deleteWorkflowTemplate, demotingPanelIds, discoverProject, docFocusId, enteringPanelIds, firstTaskStrip, flipped, focusedId, glowEnabled, imageReloads, linkDraw, liveRunFacts, markPreviewRead, markTemplateRead, merged, nameChat, noteVault, onBeginDrag, onBeginLink, onBrowserNavigated, onClosePanel, onContextPasted, onDocFocus, onFocusPanel, onPanelEntryEnd, onReviewCommitted, onSelectPanel, onSlotMount, onSlotUnmount, openAsChatVoid, openCredentials, openFileAtCentre, openFocusTask, openInTerminal, openPreview, openingContexts, palette, paletteActions, paletteActionsRef, panels, panelsRef, patchWorkItem, presetRows, previewSubjectReason, railRows, registry, relayNameFor, reloadWorkflowDraft, renameSkillEverywhere, replaceImage, restoreFocus, retainedOutcomes, reviewTaskLane, rimCovered, runWorkflow, runs, saveWorkflowCopy, saveWorkflowDraft, selectAndRaise, selectOnly, selectedIds, setChecklistView, setDeckView, setImportReviewed, setNoteText, setNoteTint, setPreviewWidth, setRelaySession, setRetainedOutcomes, setSheetView, setWatcherArmed, shared, skillSources, spawnGithubItem, spawnJiraTicket, startDevServer, stopWorkflowRun, taskContextFor, taskHandoffOf, teammates, templateRows, terminalNameOf, vaultReady, version, wakingPanelIds, workItems, workItemsRef
            }))}
          {/* M388. Every flowchart shape, in one memoised layer (ShapeLayer's
              header: why not PanelFrame). A fragment of boxes carrying
              Panel.z, so shapes interleave with panels by the one stacking rule. */}
          {/* M389. Every connector, beneath the shapes (the link layer's slot). */}
          <ConnectorLayer
            views={connectors.views}
            selectedId={connectors.selectedId}
            editingId={connectors.editingId}
            readOnly={merged}
            ghost={connectors.ghost}
            onSelect={onConnectorSelect}
            onEditLabel={connectors.editLabel}
            onCommitLabel={connectors.commitLabel}
          />
          <ShapeLayer
            shapes={shapePanels}
            selectedIds={selectedIds}
            readOnly={merged}
            onPress={flowchart.onShapePress}
            onResize={flowchart.onShapeResize}
            onPort={connectors.beginDraw}
            onCommitText={flowchart.onShapeText}
            dropTargetId={connectors.dropTargetId ?? (linkDraw.state?.target ?? null)}
            live={shapeLive}
            peerShapes={peerFlow.shapes}
            peerMarks={peerFlow.marks}
            peerRemovable={peerRemovable}
            onPeerPress={shared.mayArrange && !merged ? onPeerShapePress : undefined}
            onPeerRemove={onPeerShapeRemove}
          />
          {/* INSIDE .world, unlike the pips and the marquee below it: a lane
              header names a region of the WORLD, so it has to pan and scale
              with the panels it labels — see MergedLanes' own comment. Last
              in the world layer rather than first only because JSX order is
              not paint order here: panels carry an explicit zIndex from
              Panel.z (>= 1) and the lanes sit at 0, which is what keeps a
              lane behind the panels it contains. */}
          <MergedLanes lanes={merged && mergedView ? mergedView.lanes : []} />
          {/* Inside .world, not beside it — the opposite of EdgeIndicators
              and for the mirror-image reason: a pip must stay pinned to the
              viewport's edge, a subagent node belongs to a place beside its
              parent panel, so it has to pan and zoom with it. terminalPanels,
              never `panels`: a review node has no subagents of its own, and
              it is already outside this array for the identical reason it is
              outside assignTiers' input. */}
          <SubagentLayer panels={terminalPanels} />
          {/* Inside .world for SubagentLayer's reason: it marks a place on
              the canvas and must pan and zoom with the panel it lights. An
              overlay rather than a class on the panel, because each kind
              renders its own .panel and tiering may remount it at the very
              moment the flight ends — a class would be lost with it. Keyed
              on the settle so a second arrival restarts the light. */}
          {landingLit && (() => {
            const lit = displayPanels.find((p) => p.rect.id === landingLit.id)
            return lit
              ? <div key={landingLit.seq} className="landing-halo" data-landing-for={lit.rect.id} aria-hidden
                  style={{ left: lit.rect.x, top: lit.rect.y, width: lit.rect.w, height: lit.rect.h, zIndex: lit.z + 1 }} />
              : null
          })()}
        </div>
        </PanelMarksContext.Provider>
        </CardDetailContext.Provider>
        {pipsEnabled && (
          <EdgeIndicators rects={rects} viewport={viewport} ids={waitingIds} onFly={goToPanelStable} labelOf={(id) => { const p = panels.find((x) => x.rect.id === id); return p === undefined ? id : panelName(p, undefined, { defaultName: terminalNameOf.get(id) }) }} />
        )}
        {/* M69. The overview: outside .world like the pips, in the top-right
            corner, hidden while merged (the merged view's geometry is not this
            canvas's) and by `canvas.minimap`. */}
        {/* An overview of nothing is noise beside the launcher: it appears
            with the first object. */}
        {minimapEnabled && !merged && panels.length > 0 && (
          <Minimap rects={rects} rows={railRows} viewport={viewport} goTo={goToViewport} marks={annotationMarks} selected={selectedIds} shapeIds={shapeIdSet} flying={flying} regions={taskRegions.map((region) => region.bounds)} />
        )}
        {/* M66. Lane HEADERS in screen space — chrome, like the pips: a lane
            name inside .world scaled to 4px text at the zoom the merged view
            is used at (M61's critic, finding 4). Positioned from the lane's
            world rect through the viewport, so they ride a pan; the in-world
            .merged-lane__name stays for the checks that read it and is not
            painted. */}
        {merged && mergedView && mergedView.lanes.map((lane) => {
          const at = worldToScreen({ x: lane.bounds.x, y: lane.bounds.y - 56 }, viewport)
          // The header hangs UP from its anchor (translate -100%), so an
          // anchor above ~36px puts it outside the host: clamp, so a lane
          // whose top is at the viewport's top still shows its name.
          return (
            <div key={lane.workspaceId} className={`lane-header${lane.active ? ' lane-header--active' : ''}`} data-screen-control="" data-lane-header={lane.workspaceId} style={{ left: Math.max(at.x, 8), top: Math.max(at.y, 36) }}>
              <span className="lane-header__name">{lane.name}</span>
              {lane.active && <span className="lane-header__note">this workspace</span>}
            </div>
          )
        })}
        {/* Beside the pips and outside .world for the same reason — see
            Marquee.tsx. It renders null at rest, so there is no "no marquee"
            element for anything to find. */}
        <Marquee
          rect={marquee}
          selectionCount={selectedIds.size}
          onAlign={() => {
            setPanels((prev) => {
              const wanted = selectedIdsRef.current
              const chosen = prev.filter((panel) => wanted.has(panel.rect.id) && panel.locked !== true)
              if (chosen.length < 2) return prev
              const positions = alignRects(chosen.map((panel) => panel.rect), 'left')
              const next = prev.map((panel) => {
                const at = positions.get(panel.rect.id)
                return at === undefined ? panel : { ...panel, rect: { ...panel.rect, x: at.x, y: at.y } }
              })
              if (next.every((panel, index) => panel === prev[index])) return prev
              commitHistory(next)
              return next
            })
          }}
          onTidy={() => paletteActions.tidyPanels([...selectedIds])}
          onMakeTask={() => makeTaskRef.current()}
          onPauseAll={() => { for (const id of selectedIds) void window.canvas.agentSession.interrupt(id) }}
        />
        {connectedSpawn !== null && (() => {
          const at = worldToScreen(connectedSpawn.at, viewport)
          const model = connectedSpawnMenu(connectedSpawn.name, presetRows)
          const from = connectedSpawn.from
          const point = connectedSpawn.at
          const cwdOf = (): string => {
            const source = panels.find((panel) => panel.rect.id === from)
            if (source !== undefined && isTerminalPanel(source)) return source.spec.cwd
            if (source !== undefined && isChatPanel(source)) return source.chat.cwd
            return '~'
          }
          return (
            <ConnectedSpawnMenu
              title={model.title}
              agents={model.agents}
              presets={model.presets}
              foot={model.foot}
              style={{ position: 'absolute', left: at.x, top: at.y, zIndex: 40 }}
              onClose={() => { clearArmedSpawn(); setConnectedSpawn(null) }}
              onAgent={(kind) => {
                armConnectedSpawn({ from, at: point })
                const cwd = cwdOf()
                onSpawn(point, kind === 'shell' ? { cwd, args: [] } : { cwd, args: [], agent: kind === 'claude' ? 'claude-code' : 'codex' }, { focus: true })
                setConnectedSpawn(null)
              }}
              onPreset={(id) => {
                armConnectedSpawn({ from, at: point })
                void window.canvas.preset.spawnById(id)
                setConnectedSpawn(null)
              }}
            />
          )
        })()}
        {/* Presence: remote selections and cursors on their own 2D canvas, and
            the roster of who else is here. Siblings of .world like Marquee —
            screen-pinned, and a remote update repaints this layer only. */}
        <PresenceLayer workspaceId={activeWorkspaceId} viewport={viewport} rects={rects} />
        {/* M348. One top-centre column: who is here, then — on a shared
            workspace that is offline or catching up — what its sync is doing. */}
        <div className="presence-top" data-screen-control="">
          <RosterStrip workspaceId={activeWorkspaceId} />
          <SyncChip workspaceId={activeWorkspaceId} shared={shared.view !== null} />
        </div>
        {/* A SIBLING of .world, like EdgeIndicators above: .world carries the
            one translate()/scale() transform, and an overlay inside it would
            pan and zoom away with the canvas it is pinned to. */}
        {/* M13. Success criterion 6: an armed mode must never be invisible.
            A SIBLING of .world like NavGrid above, so it is viewport-pinned
            chrome rather than something that pans away from the user while
            the mode it describes is still armed. */}
        {linkMode.from !== null && (
          <div className="link-banner" role="status" data-screen-control="">
            Linking from <strong>{linkSourceName}</strong> — click a panel, or press Escape
          </div>
        )}
        {/* M93. The annotate strip: LOUD, with its exit on it (M40's rule). */}
        {/* M395. The strip TAKES the pointer (styles.css) and keeps its presses:
            a press on it is a press on a tool, never a label dropped on the
            ground beneath it — the canvas's own mousedown places labels. */}
        {annotating && (
          <div className="link-banner link-banner--annotate" role="status" data-screen-control="" data-annotate-strip onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}>
            <strong>Annotating</strong> — {annotateTool === 'draw' ? 'drag to draw, on a panel or the canvas' : 'click to place a note, on a panel or the canvas'}; Escape to stop
            {/* M155. The cap, said before it bites: ink reaches it in ordinary use where labels never did. */}
            {annotations.length >= ANNOTATIONS_MAX && <span className="link-banner__note" data-annotate-cap> · at the cap of {ANNOTATIONS_MAX} — the oldest goes next</span>}
            {/* M155. The two tools, pressed state as data: `draw` inks a drag, `label` is M93's note. */}
            <span className="link-banner__tools" role="group" aria-label="Annotate tool">
              <button type="button" className={`link-banner__tool${annotateTool === 'label' ? ' link-banner__tool--on' : ''}`} data-annotate-tool="label" aria-pressed={annotateTool === 'label'} {...shellControl(() => setAnnotateTool('label'))}>label</button>
              <button type="button" className={`link-banner__tool${annotateTool === 'draw' ? ' link-banner__tool--on' : ''}`} data-annotate-tool="draw" aria-pressed={annotateTool === 'draw'} {...shellControl(() => setAnnotateTool('draw'))}>draw</button>
            </span>
            <button type="button" className="link-banner__stop" aria-label="Stop annotating" data-annotate-done {...shellControl(endAnnotate)}>Done</button>
          </div>
        )}
        {broadcastInput && (
          <div className="link-banner" role="status" data-screen-control="">
            Broadcasting keyboard input to <strong>{broadcastTargetIds.length} terminals</strong>
            {/* M40. The exit lives on the banner: a mode whose only way out is
                a palette search is a dead end for whoever arrived by the
                chord. shellControl so the press never moves DOM focus off
                the terminal that is still receiving the keystrokes. */}
            {/* onMouseDown overrides shellControl's own (which only
                preventDefaults): onBroadcastStopMouseDown does that AND
                stopPropagation, the extra this one control inside .canvas needs. */}
            <button type="button" className="link-banner__stop" aria-label="Stop broadcasting"
              {...shellControl(toggleBroadcastStable)} onMouseDown={onBroadcastStopMouseDown}>Stop</button>
            <span className="link-banner__hint">⌘⇧I</span>
          </div>
        )}
        <NavGrid controller={navGrid} />
        <DiagnosticsOverlay
          open={diagnostics.open}
          onClose={diagnostics.close}
          getRendererInput={getDiagnosticsInput}
        />
        {splash !== 'none' && !merged && (
          <StartupSplash mode={splash} rects={rects} viewport={viewport} onDone={() => setSplash('none')} />
        )}
        {restoreOpen && restoreFacts !== null && !merged && (
          <RestoreSplash
            facts={restoreFacts}
            rects={panels.map((panel) => ({ x: panel.rect.x, y: panel.rect.y, w: panel.rect.w, h: panel.rect.h }))}
            onDone={() => setRestoreLeft(true)}
          />
        )}
        {showOnboarding && !merged && (
          <Onboarding
            workspaceName={workspaceRows.find((w) => w.active)?.name ?? ''}
            probes={onboardingProbes}
            enabled={foundAgentIds(onboardingProbes)}
            {...(envReport === null ? {} : { tmux: { path: envReport.tmux.path } })}
            onHandoff={(_handoff, answers) => completeOnboarding(answers)}
            onSkip={finishOnboarding}
            onCustom={() => { finishOnboarding(); paletteActionsRef.current?.beginSpawnSheet() }}
          />
        )}
        {/* One empty state at a time. The launcher holds an empty canvas
            until the person puts it away ("Blank canvas"); only then does the
            quieter blank card show, and every button on it does something:
            the task box opens the new-task sheet on that sentence, the quick
            spawns are ⌘N's preset and a login shell, and a starter layout
            opens the panel sheet on its lineup (the person still picks the
            folder there). */}
        {onboardingDone && panels.length === 0 && !merged && launcherPutAway && (
          <BlankCanvas
            workspace={workspaceRows.find((w) => w.active)?.name ?? ''}
            onStart={(sentence) => paletteActions.beginStartWork({ title: sentence.trim() })}
            onQuick={(id) => {
              if (id === 'import') { void importCanvas(); return }
              if (id === 'agent') {
                const preset = presetRows.find((p) => p.isDefault && p.available) ?? presetRows.find((p) => p.agent !== undefined && p.available)
                if (preset !== undefined) { paletteActions.spawnPreset(preset.id); return }
                paletteActions.beginSpawnSheet()
                return
              }
              onSpawn(worldCentre(), { cwd: '~', args: [] }, { focus: true })
            }}
            adopt={adoptable === null ? null : {
              sentence: adoptSentence(adoptable.sessions),
              onPlace: () => {
                // One panel per session, each through the one placement rule,
                // so they cascade rather than stack. Each is a tmux client:
                // closing it detaches, and their session keeps running.
                for (const row of adoptable.sessions) {
                  onSpawn(worldCentre(), { cwd: row.cwd === '' ? '~' : row.cwd, ...adoptCommand(adoptable.tmuxPath, row.target), title: `${row.agent} · ${row.session}` })
                }
                setAdoptable(null)
              },
              onLeave: () => setAdoptable(null)
            }}
            onLayout={(id) => {
              const layout = STARTER_LAYOUTS.find((row) => row.id === id)
              if (layout === undefined) return
              if (layout.lineup === null) { onSpawn(worldCentre(), { cwd: '~', args: [] }, { focus: true }); return }
              paletteActions.beginSpawnSheet(undefined, undefined, { what: lineupWhatId(layout.lineup) })
            }}
          />
        )}
        {/* M48. The launcher: keyed on the panel COUNT of this canvas, never
            on activity, and never while merged (the merged view's geometry is
            read-only). A sibling of .world, so it never scales. */}
        {/* M403 (B6). The first start's guide is no longer a popover here: it
            sat over the composer's Send/Answer, the buttons its own copy told
            the person to use. It is a strip INSIDE its conversation
            (`firstTaskStrip`, handed to that ChatNode as `guide`). */}
        {panels.length === 0 && !merged && !launcherPutAway && (() => {
          // Computed once so the tmux/starter notices and the starter door's
          // own disabled reason read the SAME facts — two separate ternaries
          // over the same inputs had already drifted once (the Act III
          // critic, hints.ts's header).
          const launcherHintsLeft = hintsLoaded ? hintsLeft(hintsSeen, 'launcher') : []
          const starterReasonForLauncher = starterKeysToApply(starter).length === 0 ? 'every starter object is already on this canvas' : onboardingReadiness(envReport).preferred === undefined ? 'no conversation engine has been discovered — the starter begins with an agent; install one and Check again' : null
          return (
          <Launcher
            presets={presetRows}
            onImportCanvas={() => { void importCanvas() }}
            recents={launcherRecents}
            recentUsed={launcherRecentUsed}
            onCreateObject={(kind) => { void createObject(kind).then((r) => { if (r.kind === 'refused') paletteActionsRef.current?.say(r.reason) }) }}
            onBlankCanvas={() => setLauncherPutAway(true)}
            // M205 (D09). The intent form: D05's Start work, the one alternative, and the folder dialog.
            onStartWork={startFirstWork}
            onAsk={askWithoutFolder}
            onChatHere={chatInFolder}
            onChooseFolder={() => window.canvas.teammate.choosePlace()}
            teammates={teammates ?? []}
            tmux={backendInfo?.kind === 'direct' && launcherHintsLeft.some((h) => h.id === 'tmux') ? backendInfo.reason : null}
            onDismissTmux={() => markHint('tmux')}
            // M205 critic 2.4. Only worth pointing at when the door itself
            // would work — a hint aimed at a disabled starter reads as a
            // broken promise the moment someone follows it.
            starterHint={starterReasonForLauncher === null && launcherHintsLeft.some((h) => h.id === 'starter') ? STARTER_HINT.text : null}
            onDismissStarterHint={() => markHint('starter')}
            report={envReport}
            onOpenSetup={(url) => { void window.canvas.links.open({ panelId: '', target: url }) }}
            onCheckAgain={() => paletteActions.checkReadiness()}
            onSpawnPreset={paletteActions.spawnPreset}
            onOpenSheet={paletteActions.beginSpawnSheet}
            onOpenFile={paletteActions.openFile}
            onNewNote={paletteActions.newNote}
            noteReason={noteRoot === null ? 'select a panel first — a note is saved in its directory' : null}
            onNewChat={paletteActions.newChat}
            // M205. The starter is an OPTIONAL line; the primary never lays it out.
            onOpenStarter={() => { void paletteActions.openStarter() }}
            starterReason={starterReasonForLauncher}
            chatReason={claudeAvailable(presetRows) ? null : REASON_NO_CLAUDE}
            onNewCodexChat={() => paletteActions.newChat('codex')}
            codexReason={codexAvailable(presetRows) ? null : REASON_NO_CODEX}
            update={updateState}
            onOpenRelease={(url) => { void window.canvas.links.open({ panelId: '', target: url }) }}
          />
          )
        })()}
        {/* The UX pass (4.4). One "while you were away" card: the floating
            briefing (M309: only when the navigator's Panels pane is not there
            to hold it; Resume alone is the strip), the Reopened notice and
            Unfinished work (M316), and the login-shell banner (M48), each a
            section of it, with one Dismiss all. */}
        {(() => {
          const floatBriefing = briefing !== null && resumeBanner !== null && !(chrome.navVisible && chrome.navigator === 'panels')
          const envProblem = envReport !== null && !envReport.shell.ok && !envBannerDismissed
          const sections = [floatBriefing, reopen !== null, jobRecovery !== null, envProblem].filter(Boolean).length
          return (
            <div className="recovery-slot" data-recovery-slot="" data-screen-control="">
              {sections > 0 && (
                <WelcomeBack
                  count={sections}
                  onDismissAll={() => {
                    if (floatBriefing) dismissReturn()
                    if (reopen?.acknowledgeable === true) reopen.acknowledge()
                    jobRecovery?.dismiss()
                    setEnvBannerDismissed(true)
                  }}
                >
                  {floatBriefing && resumeBanner}
                  {reopen !== null && (
                    <ReopenNotice
                      model={reopen}
                      onGo={paletteActions.goToPanel}
                      onStart={(id) => { paletteActions.goToPanel(id); wakeTarget(id) }}
                    />
                  )}
                  {jobRecovery !== null && <JobRecoveryNotice model={jobRecovery} />}
                  {envProblem && envReport !== null && (
                    <div className="env-banner" data-env-banner role="status">
                      Your login shell could not be read ({envReport.shell.reason ?? 'the probe failed'}) — CLIs installed
                      through your shell's rc files may not be found.{' '}
                      {/* The UX pass. The fix is a button, not a sentence pointing at ⌘K. */}
                      <button type="button" className="pf__verb pf__verb--word env-banner__check" data-env-banner-check {...shellControl(() => palette.openPalette('environment'))}>Check environment</button>
                    </div>
                  )}
                </WelcomeBack>
              )}
            </div>
          )
        })()}
        {/* M204 (D08). The lens bar: which task is lit, how much of it, what
            is missing, and the ways out. Viewport-pinned like the env banner.
            M264: Escape clears the lens when it is not destined for a focused
            terminal or text draft (see the relatedItemId keydown effect). */}
        {lens !== null && (() => {
          const title = workItems.find((i) => i.id === lens.itemId)?.title ?? lens.itemId
          const gone = missingSentence(lens.missing)
          // Every control is present and enabled but Arrange in the merged
          // view; each refuses BY NAME through the feedback line (a task with
          // nothing on the canvas says so) rather than greying out silently.
          const act = (r: { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }): void => { if (r.kind === 'refused') paletteActionsRef.current?.say(r.reason) }
          return (
            <div className="task-lens" data-screen-control="" data-task-lens-bar={lens.itemId} role="status">
              <span className="task-lens__title">{title}</span>
              <span className="task-lens__count" data-task-lens-count>{lens.members.length} related</span>
              {gone !== '' && <span className="task-lens__missing" data-task-lens-missing>{gone}</span>}
              {resumedNext !== null && resumedNext.itemId === lens.itemId && (resumedNext.action === 'review' || resumedNext.action === 'answer'
                // M315. A next action with a door is a BUTTON — as a label it
                // was the one word on the bar that looked pressable and was not.
                ? <button type="button" className="pf__verb pf__verb--word task-lens__next task-lens__next--go" data-task-lens-next title={resumedNext.text} {...shellControl(() => runResumeAction(resumedNext.itemId, resumedNext.action))}>{resumedNext.text}</button>
                : <span className="task-lens__next" data-task-lens-next title={resumedNext.text}>{resumedNext.text}</span>)}
              <button type="button" className="pf__verb pf__verb--word" data-task-lens-verb="frame" title="Frame every panel of this task"
                {...shellControl(() => act(frameItem(lens.itemId)))}>Frame</button>
              <button type="button" className="pf__verb pf__verb--word" data-task-lens-verb="arrange" disabled={merged}
                title={merged ? 'the merged view is read-only' : 'Compact this task\'s panels in reading order, clear of everything else — one undo'}
                {...shellControl(() => { if (!merged) act(arrangeItem(lens.itemId)) })}>Arrange</button>
              <button type="button" className="pf__verb pf__verb--word" data-task-lens-verb="stop" title="Stop showing what is related" {...shellControl(() => setRelatedItemId(null))}>Stop</button>
            </div>
          )
        })()}
        <CanvasHud
          updateNewer={updateState.result?.kind === 'newer' ? { version: updateState.result.version, url: updateState.result.url } : null}
          viewport={viewport}
          onZoomBy={zoomBy}
          onFit={fitAll}
          fitTask={{ disabledReason: fitTaskContext ? undefined : FIT_TASK_NO_CONTEXT, run: () => { const r = boardVerbsRef.current.fitTask?.(); if (r !== undefined && r.kind === 'refused') paletteActionsRef.current?.say(r.reason) } }}
          agentLinks={{ on: agentLinksOn, onToggle: toggleAgentLinks }}
          // M263/M395. Occupied canvas only: one Create + into the shared
          // sheet, on the HUD's ground (CanvasHud). The empty canvas's launcher
          // owns Start work · Ask · Create… and the Fit verbs have nothing to frame.
          create={panels.length > 0 ? { onOpen: paletteActions.beginSpawnSheet, ...(merged ? { disabledReason: 'leave merged view to create an object' } : {}) } : undefined}
          empty={panels.length === 0}
        />
        {packPreview !== null && (
          <PackPreview preview={packPreview} onAdd={addPack} onClose={() => setPackPreview(null)} />
        )}
        {/* A flat, non-interactive scrim: no blur (a composited layer over a
            canvas that repaints on every pan frame is the cost .palette's own
            comment already declines to pay) and no pointer-events, so the
            outside-click exit stays exactly where it was — .shell's capture
            handler, never here. */}
        {palette.open && <div className="palette__scrim" data-screen-control="" aria-hidden="true" />}
        {palette.open && (
          <Palette
            controller={palette}
            actions={paletteActions}
            presets={presetRows}
            prompts={promptRows}
            panels={panelRows}
            settings={settingRows}
            workspaces={workspaceRows}
            credentials={credentialRows}
            worktrees={worktreeRows}
            envReport={envReport}
            starterReason={starterKeysToApply(starter).length === 0 ? 'every starter object is already on this canvas' : onboardingReadiness(envReport).preferred === undefined ? 'no conversation engine has been discovered — the starter begins with an agent' : starter === undefined && panels.length > 0 ? 'the starter lays out on an empty canvas — reset the canvas or make a new workspace for it' : null}
            update={updateState}
            workflowTemplateOf={(panelId) => { const p = panelsRef.current.find((x) => x.rect.id === panelId); return p !== undefined && isWorkflowPanel(p) ? p.workflow.templateId : undefined }}
            bookmarks={bookmarkRows}
            cameraTrail={trail}
            // M407 follow-up: a retired caption is an undo step too, so ⌘K's
            // rows agree with what ⌘Z will do (`present: null` is pinned to
            // this very present when the press's render commits).
            canUndo={history.past.length > 0 || (captionUndoRef.current.at(-1) !== undefined && (captionUndoRef.current.at(-1)?.present ?? history.present) === history.present)}
            canRedo={history.future.length > 0 || captionRedoRef.current.at(-1)?.present === history.present}
            canvasCovered={canvasCoveredRef.current}
            globalFontSize={globalFontSize}
            // The renderer's own attention set (agent-state-store.ts), not a
            // second derivation: main never learns "which panels are
            // wants-you" as a set, only individual agent:state transitions,
            // and asking it to recompute one here would make it a second
            // author of a fact this side already folds correctly.
            attentionIds={waitingIds}
            pinnedCount={pinCount(panels)}
            approvals={paletteApprovals}
            templates={paletteTemplates}
            teammateCount={teammates === null ? undefined : teammates.length}
            hasSelection={hasSelection()}
            selectedIds={selectedPanelIds}
            groups={groups}
            noteRoot={noteRoot}
            merged={merged}
            broadcastReady={broadcastReady}
            broadcastActive={broadcastInput}
            inputMode={inputMode}
            searchResults={searchResults}
            workSearch={workSearch}
            scrollbackEnabled={scrollbackPersist}
            onSearchQuery={onSearchQuery}
            capability={capability}
            onCapabilityQuery={onCapabilityQuery}
          />
        )}
      </div>
      <Inspector
        templateOf={(id) => allTemplates(templateRows).find((t) => t.id === id)}
        onTestNode={testNode}
        onToggle={chrome.toggleContext}
        tab={chrome.contextTab}
        onSelectTab={chrome.setContextTab}
        model={inspectorModel}
        summary={inspectorSummary}
        contextBand={inspectorContextBand}
        onShowRelated={(itemId) => { setRelatedItemId(itemId); const r = frameItem(itemId); if (r.kind === 'refused') paletteActionsRef.current?.say(r.reason) }}
        // M310. A step that exists is gone to (a panel) or opened (a link, by
        // main's own door); one that does not leads to where it is MADE — the
        // review for a review, checks or a PR, Start work for a conversation.
        onChainStep={(itemId, step) => {
          if (step.present && step.panelIds[0] !== undefined) { paletteActions.goToPanel(step.panelIds[0]); return }
          if (step.present && step.url !== undefined) { void window.canvas.links.open({ panelId: selectedIdRef.current ?? '', target: step.url }); return }
          if (step.step === 'conversation') { paletteActions.beginStartWork({ itemId }); return }
          if (step.step === 'review' || step.step === 'checks' || step.step === 'pr') {
            const r = boardVerbsRef.current.review?.(itemId)
            if (r !== undefined && r.kind === 'refused') paletteActionsRef.current?.say(r.reason)
          }
        }}
        onShowTask={(panelId) => { const r = boardVerbsRef.current.show?.(panelId); if (r !== undefined && (r.kind === 'refused' || r.partial === true)) paletteActionsRef.current?.say(r.kind === 'refused' ? r.reason : (r.note ?? '')) }}
        onRename={paletteActions.beginRenamePanel}
        onClose={paletteActions.closePanel}
        onSavePreset={paletteActions.savePanelAsPreset}
        onRestart={paletteActions.restartPanel}
        onLock={paletteActions.lockPanel} onUnlock={paletteActions.unlockPanel} onPin={paletteActions.pinPanel} onUnpin={paletteActions.unpinPanel} onMaximise={paletteActions.maximisePanel} onRestore={paletteActions.restorePanel} pinnedCount={pinCount(panels)}
        onFrontEnd={onFrontEnd}
        onReviewApproval={chrome.openAttentionAt}
        onRevokeGrants={revokeChatGrants}
        // M352. The Caps fields are a PERSON's door: raising a cap is theirs to do.
        onCap={(id, value) => paletteActions.capAgent(id, value, 'person')}
        onOpenReview={paletteActions.openReview}
        taskCriteria={taskCriteria}
        onPausePanel={onPausePanel}
        onHandOffPanel={onHandOffPanel}
        onLink={paletteActions.beginLink}
        onRemoveLink={paletteActions.removeLink}
        onRelabelLink={paletteActions.beginRelabelLink}
        selectedConnector={selectedConnectorDetail}
        onPatchConnector={(id, patch) => { const r = connectors.patch(id, patch); if (r.kind === 'refused') paletteActions.say(r.reason) }}
        onRemoveConnector={(id) => { connectors.remove(id) }}
        onStyleShape={(id, patch) => { const r = flowchart.setShapeStyle([id], patch); if (r.kind === 'refused') paletteActions.say(r.reason) }}
        onShapeChart={(id, act) => {
          const said = (r: { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }): void => { paletteActions.say(r.kind === 'ran' ? (r.note ?? 'done') : r.reason) }
          if (act === 'plan') said(paletteActions.planFromChart(id))
          else if (act === 'layout-down' || act === 'layout-right') said(flowchartIO.layout(act === 'layout-down' ? 'down' : 'right', [id]))
          else void flowchartIO.exportFlowchart(act === 'export-mermaid' ? 'mermaid' : 'svg').then(said)
        }}
        onSetRestartOnExit={onSetRestartOnExit}
        onSetLinkAutomation={onSetLinkAutomation}
        automationResults={automationResult}
        automations={automationRows}
        selectedEdge={selectedEdge}
        panelRun={panelRun}
        onRunAgain={onRunAgain}
        review={reviewModel}
        branchLine={branchLine}
        repository={repository}
        toolbox={toolboxModel}
        onOpenToolbox={paletteActions.openToolbox}
        onResizeHandleDown={onInspectorResizeDown}
        onGoToPanel={paletteActions.goToPanel}
      />
    </div>
  )
}
