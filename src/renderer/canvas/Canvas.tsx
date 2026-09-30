import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type DragEvent, type JSX, type MouseEvent, type CSSProperties } from 'react'
import { CanvasHud } from './CanvasHud'
import { NewObjectRow } from './NewObjectRow'
import { CREATABLE_OBJECTS, creationReason, type CreationHost, type CreationResult } from '@shared/verb-table'
import type { ChecklistView } from '@shared/checklist'
import { DECK_SEED, type DeckView } from '@shared/deck'
import { isSheetPath, type SheetView } from '@shared/sheet'
import { DiagnosticsOverlay } from './DiagnosticsOverlay'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useDiagnostics } from './useDiagnostics'
import { useBroadcastChord } from './useBroadcastChord'
import { useKeyboardNav } from './useKeyboardNav'
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
import { AgentLinkLayer } from './AgentLinkLayer'
import { forgetAgentLinksFor, forgetAllAgentLinks, publishAgentLinks } from './agent-links-store'
import { agentLinks } from '@shared/agent-links'
import { indexToolFiles } from '@shared/tool-index'
import { getChat as getChatState } from '@renderer/chat/chat-store'
import { useLinkMode } from './useLinkMode'
import { useSpaceHeld } from './useSpaceHeld'
import { useTheme } from './useTheme'
import { Launcher } from './Launcher'
import { SnapGuides } from './SnapGuides'
import { smartSnap, type SpacingGuide } from './arrange'
import { SNAP_PX, type SnapGuide } from './placement'
import { attemptOf, contextualHint, hintsLeft, STARTER_HINT, type HintId } from './hints'
import { FirstTaskHint } from './FirstTaskHint'
import type { EnvReport } from '@shared/env-report'
import { terminalTheme } from '@renderer/terminal/themes'
import { useLinkDraw } from './useLinkDraw'
import { SubagentLayer } from './SubagentLayer'
import { useCanvasTestHooks } from './useCanvasTestHooks'
import { usePaletteActions } from './usePaletteActions'
import { useWorkspaceVerbs } from './useWorkspaceVerbs'
import { useCanvasPointer } from './useCanvasPointer'
import { panelName } from '@renderer/palette/panel-name'
import { useRailModels } from './useRailModels'
import { useFileTree } from './useFileTree'
import { inspectionDirectory } from './inspection-directory'
import { capabilityAcross, normalizeCapability, type CapabilityAnswer } from '@shared/toolbox-query'
import { useVault } from './useVault'
import { buildIntegrationRows, INTEGRATION_AUDIT_ROWS } from '@renderer/shell/integration-model'
import { SERVICES } from '@shared/credential-schema'
import type { BrokerAuditRowWire } from '@shared/ipc-contract'
import { useInspectorDetail } from './useInspectorDetail'
import { useActivityFeed } from './useActivityFeed'
import {
  EMPTY_CREDENTIALS, EMPTY_PRESETS, EMPTY_PROMPTS, EMPTY_WORKTREES,
  EMPTY_SELECTION, NO_GUIDES, EMPTY_SETTINGS, EMPTY_WORKSPACES,
  MACHINE_COST_SAMPLE_MS, retainSelection, panelLabel, MAXIMISE_MARGIN } from './canvas-constants'
import { useViewport, prefersReducedMotion } from './useViewport'
import { StartupSplash } from './StartupSplash'
import { splashMode, LAST_VERSION_KEY, PLAYED_KEY, type SplashMode, type StartupInput } from './splash'
import type { TaskMenuFact } from '@renderer/components/PanelFrame'
import { advancedDoors, type AdvancedDoor, type AdvancedDoorId } from './advanced-doors'
import { REASON_TOOL_UNREAD, type ToolGenerateResult } from '@shared/tool-spec'
import { FIT_TASK_NO_CONTEXT, missingSentence, showTaskTarget, taskMembership, type TaskMembership } from './task-members'
import { taskClusters } from './task-clusters'
import { TaskClusterLayer } from './TaskClusterLayer'
import { useCanvasClipboard } from './useCanvasClipboard'
import { useTiering } from './useTiering'
import {
  screenToWorld, worldToScreen, type Point, type Viewport, type WorldRect, hitTest, simplifyStroke, docFocusRect, clearOfOverlays, type ScreenRect } from './viewport'
import { Marquee, type MarqueeScreenRect } from './MarqueeLayer'
import { MergedLanes } from './MergedLanes'
import { mergedLayout } from './merged-layout'
import { usePanelDrag } from './usePanelDrag'
import { GroupLayer } from '@renderer/groups/GroupLayer'
import { applyGroupDrag, expandGroup, groupDragState, pruneGroups, raiseGroup, removeGroup, toggleGroup, type CanvasGroup } from '@renderer/groups/groups'
import { useGroupDrag } from '@renderer/groups/useGroupDrag'
import { applyDrag, movesOrigin, type DragState } from './panel-interaction'
import { nextAttentionId, reachableQueue, type JumpDirection } from './attention'
import { jumpOrder, type Inbox } from '@renderer/shell/decision-inbox'
import { useDecisionInbox } from '@renderer/shell/useDecisionInbox'
import { useTaskQueue } from '@renderer/shell/useTaskQueue'
import { taskChain } from '@renderer/shell/inspector-context'
import { useAwaySince } from '@renderer/shell/presence'
import { ReturnBriefingCard, useReturnBriefing } from '@renderer/shell/ReturnBriefing'
import { TerminalPanel } from '@renderer/components/TerminalPanel'
import { PORT_MIN_SCALE } from '@renderer/components/PanelPorts'
import { ReviewNode } from '@renderer/review/ReviewNode'
import { FileNode } from '@renderer/file/FileNode'
import { ChecklistNode } from '@renderer/file/ChecklistNode'
import { checklistFocused } from '@renderer/file/checklist-controllers'
import { pillFocused, orchestratorTarget } from './command-pill'
import { CommandPill, orchestratorCandidates } from './CommandPill'
import { noteEditorFocused } from '@renderer/file/rich-note-focus'
import { typeIntoEditor, editorText, focusEditor } from '@renderer/file/editor-registry'
import type { ImportedNote } from '@shared/imported-note'
import { DeckNode } from '@renderer/file/DeckNode'
import { deckFocused } from '@renderer/file/deck-controllers'
import { SheetNode } from '@renderer/file/SheetNode'
import { sheetController, sheetFocused } from '@renderer/file/sheet-controllers'
import { serveDraftEdit } from './draft-focus'
import { ToolboxNode } from '@renderer/toolbox/ToolboxNode'
import { NavGrid } from '@renderer/navgrid/NavGrid'
import { useNavGrid } from '@renderer/navgrid/useNavGrid'
import { createRegistry } from '@renderer/session/session-registry'
import { useRegistryVersion } from '@renderer/session/useRegistry'
import {
  applyAgentState, attentionIds, clearAgentState, useAttentionIds, getAgentState, onAgentTransition
} from '@renderer/session/agent-state-store'
import {
  applyLiveSession, clearLiveSession, getLiveSession
} from '@renderer/session/live-session-store'
import { applySubagents, clearSubagents } from '@renderer/session/subagent-store'
import { applyFileResult, clearFileResult } from '@renderer/session/file-store'
import { clearToolbox } from '@renderer/session/toolbox-store'
import { applyUsage, clearUsage, getUsage } from '@renderer/session/usage-store'
import { applyMachineCosts, clearMachineCost } from '@renderer/session/machine-cost-store'
import { clearScrollbackTail } from '@renderer/session/scrollback-store'
import { createSessionFactory } from '@renderer/terminal/session-factory'
import type { CanvasState, PersistedBookmark, PersistedRun } from '@shared/layout-schema'
import { retainOutcome, type RetainedOutcome } from '@shared/retained-outcomes'
import { searchWork, type WorkEvidenceRow } from '@shared/work-search'
import { portableCwd } from '@shared/recipe-portability'
import { buildResumeSummary, pickResumeSubject, type ResumeSummary } from '@shared/resume-summary'
import type { MachineCostTarget } from '@shared/machine-cost'
import type {
  CapturedPanel,
  MergedWorkspace,
  PresetTemplate,
  SessionBackendInfo,
  SettingRow,
  WorkspaceRow, WorktreeListRow } from '@shared/ipc-contract'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import { fromPanels, toPanels } from '@renderer/panels/layout-adapt'
import { findConnector, isShapePanel, makeRelayPanel, isRelayPanel, RELAY_W, RELAY_H, makeNotePanel, isNotePanel, makeImagePanel, isImagePanel, makeWorkflowPanel, isWorkflowPanel, makeSkillPanel, isSkillPanel, makeWorkPanel, isWorkPanel, makeBrowserPanel, isBrowserPanel, makeWatcherPanel, makeGithubPanel, isGithubPanel, makeMemoryPanel, isWatcherPanel, isMemoryPanel,
  cascadeCentre, firstRunPanels, isFilePanel, isJiraPanel, isReviewPanel, isTerminalPanel, isToolboxPanel, makeFilePanel, makeJiraPanel,
  makeToolboxPanel, makeChatPanel, isChatPanel,
  makePanel, makeReviewPanel, maximiseRect, nextZ, pickRects, raisePanel, removePanel, reviewCentre, setPanelRect, TASK_REVIEW_SIZE, withFrameContents,
  addLink, setRestartOnExit, setLinkAutomation, linksOf, workCardItemId,
  type Panel, type TerminalPanel as TerminalPanelModel, type WorkPanel as WorkPanelModel, CHAT_W, CHAT_H, type ChatPanel } from '@renderer/panels/panels'
import { recoverPanels, seedAfter } from '@renderer/panels/recover'
import { nextCardDetail, type CardDetail } from './card-detail'
import { shellQuote } from '@renderer/shell/file-tree-model'
import { createHistory, pushHistory, undoHistory, redoHistory, type History } from '@renderer/panels/history'
import { usePalette } from '@renderer/palette/usePalette'
import { Palette, type InputMode } from '@renderer/palette/Palette'
import type { PaletteActions, PresetRow, PromptRow } from '@renderer/palette/commands'
import { type CredentialMeta } from '@shared/credential-schema'
import type { WorkItem } from '@shared/work-item'
import { JiraNode } from '@renderer/jira/JiraNode'
import { ChatNode } from '@renderer/chat/ChatNode'
import { REASON_NO_CLAUDE, REASON_CHAT_BUSY, REASON_CHAT_EMPTY, REASON_NO_REPO_MEMORY } from '@renderer/palette/commands'
import { getChat, insertIntoComposer, attachToComposer, onChatTurnStart, scrollToTurn, useChatsVersion } from '@renderer/chat/chat-store'
import { attachmentKind } from '@renderer/chat/composer-model'
import type { SpawnResult } from '@shared/ipc-contract'
import type { AgentOptions } from '@shared/cost'
import { useChatSessions, disposeChat, revokeChatGrants } from '@renderer/chat/useChatSessions'
import { disposeWatcher, useWatchers } from '@renderer/watcher/useWatchers'
import { approvals, useApprovals } from '@renderer/chat/chat-store'
import { panelState, TONE_NEEDS_YOU, TONE_WORKING, type Tone } from '@renderer/panels/panel-state'
import { activityNow, forgetAllEdges, forgetEdgesFor, freezeEdgeClock, noteEdgeArrived, noteEdgeFired, noteEdgeWaiting, setEdgeContext } from './useEdgeActivity'
import { SUPERVISOR_PROMPT, REASON_NO_CODEX, type AgentBackend } from '@shared/agent-session'
import { BACKENDS, BACKEND_IDS, backendOf, carryBackend } from '@shared/agent-backends'
import { chatStateInput } from '@renderer/chat/chat-model'
import { costOf } from '@shared/pricing'
import { MemoryNode } from '@renderer/memory/MemoryNode'
import { GithubNode } from '@renderer/github/GithubNode'
import { WorkNode, WORK_ITEM_GONE } from '@renderer/work/WorkNode'
// How long an attention landing stays lit. Matches `.landing-halo`'s
// animation in styles.css: the timer only unmounts what the CSS has already
// faded, and under reduced motion (animation forced off) it is the whole
// signal — a still ring shown for this long, then gone.
const LANDING_LIT_MS = 900
/** M315. When this window's renderer started — a task created after it is not a RESUME. */
const APP_OPENED_AT = Date.now()
import { WorkflowNode } from '@renderer/workflow/WorkflowNode'
import { projectSession, type RunLiveFact } from '@shared/run-outcome'
import { workflowWatch, workflowFireRefusal } from '@renderer/workflow/workflow-diagram'
import { setDisarmed, clearDisarmed, getWatch } from '@renderer/watcher/watcher-store'
import { setWatcherFiredHandler } from '@renderer/watcher/useWatchers'
import { blockCount } from '@shared/workflow-nodes'
import { WatcherNode } from '@renderer/watcher/WatcherNode'
import { BrowserNode } from '@renderer/browser/BrowserNode'
import { RelayNode } from '@renderer/relay/RelayNode'
import { applyRelayTheme, disposeRelayTerminal } from '@renderer/relay/RelayTerminal'
import { RELAY_PROGRAM, RELAY_SESSION_ID } from '@shared/relay-protocol'
import { ImageNode } from '@renderer/image/ImageNode'
import { NoteNode } from '@renderer/note/NoteNode'
import { clearDraft, getDraft, markDraftRead, resetDraft, selectedOf } from '@renderer/workflow/template-draft-store'
import { getPool } from '@renderer/workflow/pool-store'
import { REASON_NOTHING_RUNNING, TEMPLATE_GONE } from '@renderer/workflow/WorkflowNode'
import { runsForTemplate } from '@renderer/workflow/workflow-diagram'
import { DEVICE_WIDTHS, deviceWidth, isDeviceWidthId, normalisePreviewPath, type Discovery as PreviewDiscovery, type PreviewBinding } from '@shared/preview'
import { navigateBrowser, browserGuestId } from '@renderer/browser/browser-store'
import { usePreviewReload } from '@renderer/browser/usePreviewReload'
import { normaliseTypedUrl } from '@shared/browser-panel'
import { displayPath } from '@shared/display-path'
import { laneOfPath } from '@shared/work-scope'
import { buildFeedback, FEEDBACK_REPO } from '@shared/feedback'
import type { AgentPlanCaller } from '@shared/plan'
import { buildPortable, exportSentence, remapPortable, type parsePortable } from '@shared/portable'
import { PackPreview, type PackPreviewState } from '../pack/PackPreview'
import { NOTE_FORMS, NOTE_TINTS, isNoteForm, isNoteTint, noteSummary, normaliseNoteText } from '@shared/notes'
import { AGENT_KEY, STARTER_OBJECTS, STARTER_VERSION, starterKeysToApply, type PersistedStarter } from '@shared/starter'
import { onboardingReadiness, FIRST_LAUNCH_ENGINES, firstWorkPlan, firstWorkRepoAnswer, LANE_ENGINE, type FirstWorkOutcome, type FirstWorkRequest } from '@shared/onboarding'
import { GROUP_COLOURS } from '@shared/groups'
import { BUILT_IN_TEMPLATES } from '@shared/templates'
import { clearBrowser } from '@renderer/browser/browser-store'
import { parseTriggerWords } from '@renderer/watcher/trigger-input'
import { useRuns } from './useRuns'
import { allTemplates, isBuiltInTemplate, type PersistedTemplate, type TemplateEdge } from '@shared/templates'
import { applyPoolEvent } from '@renderer/workflow/pool-store'
import type { PoolMintReply, PoolMintRequest } from '@shared/ipc-contract'
import { fillTemplate, templateHoles, templatePanels, templateRefusal, workflowBlockRefusal } from '@renderer/palette/template-model'
import { enabledEdges, interruptedRunAccount, sealAbandoned, type InterruptedRun } from './run-model'
import { buildRunRows, runSignature } from '@renderer/shell/rail-sections'
import type { ApprovalRow } from '@renderer/palette/commands'
import { claudeAvailable, codexAvailable, backendAvailable } from '@renderer/palette/commands'
import { onChatSession, onChatAuto, onChatTurnEnd, onChatSeeded, lastAssistantText, deliverToComposer } from '@renderer/chat/chat-store'
import { setLastLine, clearUnread, clearLastLine, getLastLine } from '@renderer/session/last-line-store'
import { clearLastActive } from '@renderer/session/last-active-store'
import { beginUpdateCheck, getUpdateState, setUpdateResult, useUpdateState } from '@renderer/session/update-store'
import { lastLineOf } from '../shell/rail-rows'
import { emptyTeammate, type PersistedTeammate } from '@shared/teammates'
import { parseSkillKey, renameInShelf, skillKey, UNGROUPED_COLUMN_ID, type Shelf, type ShelfColumn, type SkillKey } from '@shared/skills'
import type { NamedToolEntry, ToolInventoryResult, ToolScope } from '@shared/toolbox'
import { buildSkillColumns, SKILL_CARD_MIME, type SkillPaneKind } from '@renderer/shell/skills-pane-model'
import type { ShelfState, SkillsInventoryState } from '@renderer/shell/SkillsPane'
import { SkillNode } from '@renderer/skills/SkillNode'

/* M127. Module scope, never a fresh literal per render: canvas-constants.ts's
   own rule — a new object each render is re-render churn through every memo
   that takes the shelf as a dependency. */
import { ROUTINE_PROMPT, type PersistedRoutine } from '@shared/routines'
import { pinCount, pinRefusal } from '@renderer/canvas/lod'
import { ANNOTATIONS_MAX, annotationPoint, dropEmptyLabels, resolveAnchor, type Annotation, INK_WIDTH } from '@shared/annotations'
import { WORK_ITEM_STATES, USER_SET_STATES, carryWorkItem, prRefusalSync, teammateRefusal, type PersistedWorkItem, type WorkItemState } from '@shared/work-items'
import { REVIEW_COMMENTS_MAX, commentPlace, newReviewComment } from '@shared/review-comments'
import { ACROSS_BASELINE, type ReviewSubject } from '@shared/review'
import { useTaskHandoffs } from '@renderer/canvas/useTaskHandoffs'
import { useBoardVerbs, type BoardVerbs } from './useBoardVerbs'
import type { StartWorkOutcome } from '@renderer/palette/start-work'
import { sendRefusalSentence } from '@shared/agent-session'
import { AnnotationLayer } from './AnnotationLayer'
import { SkillTrailLane } from '@renderer/skills/SkillTrailLane'
import { applyTrail, clearTrail, recentSkillUses } from '@renderer/skills/skill-trail-store'
import type { SnapshotMeta } from '@shared/ipc-contract'
import { PanelMarksContext, type PanelMarks } from '@renderer/components/PanelFrame'
// M8a. The frame is rendered here rather than in App.tsx because every verb it
// will eventually need (paletteActions, the camera verbs, presetRows) is state
// that lives inside Canvas — an App-owned frame would mean lifting all of it up
// or threading it back through a callback, making App a state owner in exchange
// for a tidier diagram.
import { TopBar } from '../shell/TopBar'
import { OrchestrationView } from '../orchestration/OrchestrationView'
import { FocusTask } from '../focus/FocusTask'
import type { FocusSide } from '../focus/focus-model'
import { planFactsOf } from '../focus/plan-facts'
import { planSummary, planView } from '@shared/task-plan'
import type { PersistedOrchestrate } from '@shared/orchestrate-prefs'
import { Inspector } from '../shell/Inspector'
import type { AutomationRow } from '../shell/Inspector'
import { ResumeBanner } from '../shell/ResumeBanner'
import { ReopenNotice, useReopenNotice } from '../shell/ReopenNotice'
import { JobRecoveryNotice, useJobRecovery } from '../shell/JobRecoveryNotice'
import { buildInspectorContext } from '../shell/inspector-context'
import { useShellChrome, type CenterView } from '../shell/useShellChrome'
import { useDockExpanded } from '../shell/useDockExpanded'
import { useAttentionAnnouncer } from '../shell/useAttentionAnnouncer'
import { useShellBreakpoint } from '../shell/useShellBreakpoint'
import { Dock } from '../shell/Dock'
import { Navigator } from '../shell/Navigator'
import { railLabel } from '../shell/rail-rows'
import { describeAutomation, isRestartable, isRunning } from '../shell/inspector-fields'
import type { LinkAutomation } from '@shared/handoff'
import { TRIGGER_WORDS } from './trigger-words'
import type { PanelSearchResult } from '@shared/ipc-contract'
// M129. Composed into shouldIgnoreKeys; see skills/editor-focus.ts.
import { skillEditorFocused } from '../skills/editor-focus'
import { adoptedRunId, isSettledHandoff, recordOrchEvent, runOfTask } from '../orchestration/orch-record'
import { arrangementTemplate } from '../orchestration/orch-arrangement'
import { PresenceLayer } from '../presence/PresenceLayer'
import { useSharedCanvas } from '../shared-canvas/useSharedCanvas'
import { SharedPlaceholderLayer } from '../shared-canvas/SharedPlaceholderLayer'
import type { SharedPanel } from '@shared/canvas-ops'
import { notifyRefused } from '../shell/toast'
import { RosterStrip } from '../presence/RosterStrip'
import { SyncChip } from '../presence/SyncChip'
import { usePresenceReport } from '../presence/usePresenceReport'
import { useRosterNames } from '../presence/useRosterNames'
import { relayNameOf } from '../relay/relay-gate'
import { TeamView } from '../team/TeamView'
import { useAccounts } from '../account/useAccounts'
import { ShareDialog } from '../account/ShareDialog'
import { ReplaySheet } from '../replay/ReplaySheet'

// M137. Moved below the import block, where a module-scope constant belongs.
const EMPTY_SHELF: Shelf = { columns: [] }
/** Field by field, never a spread — a spread writes `key: undefined`. */
const carryOneColumn = (c: ShelfColumn): ShelfColumn => ({ id: c.id, title: c.title, keys: [...c.keys] })


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
  const [, setHistory] = useState<History<Panel[]>>(() => createHistory(panels))

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
  const onSpawn = useCallback(
    (centre: Point, template?: PresetTemplate, opening?: { title?: string; context?: string; focus?: true; exact?: true }) => {
      const chosen = template ?? defaultTemplateRef.current
      const id = `n${nextIdRef.current++}`
      if (opening?.focus) setPendingFocusId(id)
      setEnteringPanelIds((current) => new Set(current).add(id))
      setPanels((current) => {
        // Where the panel ACTUALLY goes. Without this, N presses at an
        // unmoved camera produce N byte-identical rects and the canvas looks
        // like it holds one panel — see cascadeCentre for the whole argument.
        //
        // `current` — this updater's own argument — and never a panelsRef.
        // React applies queued updaters sequentially, so two spawns batched
        // into one tick each see the previous one's array; a ref (written a
        // render later) would hand both presses the same array and both would
        // pick the same slot, which is the stacking bug resurrected through a
        // door that only opens under batching.
        //
        // cascadeCentre being PURE is also what keeps this line clear of the
        // hazard the note above describes: called twice with the same
        // `current` it returns the same point, so a StrictMode double-invoke
        // could not place the panel somewhere else.
        const placed = opening?.exact ? centre : cascadeCentre(centre, current)
        const next = [
          ...current,
          { ...makePanel(
            id,
            placed,
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
            chosen ? { w: chosen.w, h: chosen.h } : undefined
          ), ...(opening?.title === undefined ? {} : { title: opening.title }) }
        ]
        commitHistory(next)
        return next
      })
    },
    [commitHistory]
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
    onSpawn(screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current), undefined, { title: `${item.id}: ${item.title}` })
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
    setPanels((current) => { const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current); const next = [...current, makeGithubPanel(id, cascadeCentre(centre, current), nextZ(current))]; commitHistory(next); return next })
  }, [commitHistory])
  // M116. A work card for an item, at the viewport's centre. The title is
  // the item's at mint (the rail's `work · <title>`); a card for an item the
  // board does not hold is refused by name — it would render "no longer on
  // the board" from its first frame.
  const spawnWorkCard = useCallback((itemId: string): void => {
    const item = workItems.find((i) => i.id === itemId)
    if (item === undefined) return
    const id = `k${nextIdRef.current++}`
    setPanels((current) => { const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current); const next = [...current, makeWorkPanel(id, cascadeCentre(centre, current), nextZ(current), item.id, item.title)]; commitHistory(next); return next })
  }, [commitHistory, workItems])
  const openJiraPanel = useCallback(() => {
    const id = `j${nextIdRef.current++}`
    setPanels((current) => { const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current); const next = [...current, makeJiraPanel(id, cascadeCentre(centre, current), nextZ(current))]; commitHistory(next); return next })
  }, [commitHistory])
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
  const palette = usePalette({ focusedIdRef, restoreFocus })
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
    () => canvasCoveredRef.current || palette.isOpen() || navGridIsOpenRef.current() || chromeTransientRef.current || skillEditorFocused() || checklistFocused() || pillFocused() || noteEditorFocused() || deckFocused() || sheetFocused(),
    [palette.isOpen]
  )

  const {
    viewport, resetViewport, worldCentre, centreOn, restoreCamera, zoomBy, fitAll, fitSelection, frameRects, frameReadable,
    beginPanDrag, panning,
    goToViewport, cameraBack, cameraForward, trail, flying, landing
  } = useViewport(
    hostRef, rects, onSpawn, shouldYieldWheel, initial.camera, shouldIgnoreKeys, onJumpAttention,
    onStepWorkspace, onToggleMerged
  )
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
    setPanels((current) => {
      const host = current.find((p) => isWorkflowPanel(p) && p.workflow.templateId === req.templateId)
      const centre = host === undefined
        ? cascadeCentre(screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current), current)
        : { x: host.rect.x + host.rect.w + 40 + 280, y: host.rect.y + 180 + req.index * 400 }
      const panel = makeChatPanel(id, centre, nextZ(current), { cwd: req.cwd, sessionId })
      let next: Panel[] = [...current, { ...panel, title: `${req.key} · ${req.item}` }]
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
  }), [commitHistory])
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
  const sayRef = useCanvasClipboard({
    registry, focusedIdRef, panelsRef, shouldIgnoreKeys,
    getAddImage: () => addImageRef.current,
    getObjects: () => objectClipboardRef.current
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
  useEffect(() => window.canvas.agent.onAttentionJump((id) => attentionJumpRef.current(id)), [])

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

  // The three preset events main pushes (see main/index.ts's menu handlers).
  // Routed through onSpawn/commitHistory rather than a second spawn path so a
  // preset spawn inherits the SAME undo behaviour as Cmd+N: undo removing a
  // panel must dispose its session, and that guarantee lives in applyHistory,
  // reachable only by going through the ordinary history stack.
  // Declared here, above the preset-event effect that reads it (M65's
  // ⌘⇧N subscription), and assigned beside usePaletteActions far below —
  // the create-then-assign shape M28's hook split records.
  const paletteActionsRef = useRef<PaletteActions | null>(null)
  useEffect(() => {
    const offSpawn = window.canvas.preset.onSpawn((template) => {
      // M65. A template from the sheet carries its title and asks for focus;
      // a menu template carries neither and spawns exactly as before.
      onSpawn(worldCentre(), template, template.title === undefined && template.focus === undefined
        ? undefined
        : { ...(template.title === undefined ? {} : { title: template.title }), ...(template.focus === undefined ? {} : { focus: true as const }) })
    })
    // M65. The menu's ⌘⇧N asks the renderer for the sheet. Through a ref:
    // paletteActions is built far below this effect.
    const offSheet = window.canvas.spawn.onOpenSheet(() => paletteActionsRef.current?.beginSpawnSheet())
    // M90. A codex chat's thread id is the CLI's: written onto the record the
    // first time the stream names it, with no history entry (nothing the user
    // did), so a relaunch resumes the same thread. A claude id never changes.
    const offSession = onChatSession((id, sessionId) => {
      setPanels((current) => {
        const panel = current.find((p) => p.rect.id === id)
        if (!panel || !isChatPanel(panel) || !BACKENDS[backendOf(panel.chat)].adoptsThreadId || panel.chat.sessionId === sessionId) return current
        return current.map((p) => (p === panel ? { ...panel, chat: { ...panel.chat, sessionId } } : p))
      })
    })
    // M55. Recovered orphans, only ever after the user answered Restore.
    // Through commitHistory like a spawn, so Cmd+Z un-adopts — which
    // disposes the sessions, and that is right: asked, said yes, said no.
    const offRecover = window.canvas.session.onRecover((rows) => {
      const centre = worldCentre()
      nextIdRef.current = seedAfter(rows.map((r) => r.panelId), nextIdRef.current)
      setEnteringPanelIds((current) => { const next = new Set(current); for (const r of rows) next.add(r.panelId); return next })
      setPanels((current) => {
        const fresh = recoverPanels(rows.filter((r) => !current.some((p) => p.rect.id === r.panelId)), current, centre)
        if (fresh.length === 0) return current
        const next = [...current, ...fresh]
        commitHistory(next)
        return next
      })
    })
    const offDefault = window.canvas.preset.onDefault((template) => {
      defaultTemplateRef.current = template
    })
    const offCapture = window.canvas.preset.onCapture(() => {
      const id = focusedIdRef.current
      if (!id) return null
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      // A sessionless panel has no spec to capture, so it saves as no preset:
      // a review node has no command and a file panel names a file rather than
      // a directory. Neither can be the focused panel today (nothing focuses
      // one but its own body), and this answers null rather than throwing if
      // that ever changes. `!isTerminalPanel`, not `isReviewPanel`: the latter
      // lets a file panel through to `panel.spec`, which does not exist.
      if (!panel || !isTerminalPanel(panel)) return null
      // Where the panel IS, falling back to where it was spawned — the same
      // asymmetry reloadPrompts obeys, stated there in full.
      const captured: CapturedPanel = {
        cwd: getLiveSession(panel.rect.id)?.cwd ?? panel.spec.cwd,
        args: [...panel.spec.args],
        w: panel.rect.w,
        h: panel.rect.h
      }
      // Absent stays absent: a captured login-shell panel must save as a
      // login-shell preset, not as whatever this machine's shell happens to be.
      if (panel.spec.command !== undefined) captured.command = panel.spec.command
      if (panel.spec.agent !== undefined) captured.agent = panel.spec.agent
      if (panel.spec.worktree !== undefined) captured.worktree = panel.spec.worktree
      // M20. Both capture surfaces carry it, never one — presetFromCapture is
      // the shared mint precisely so the menu's path and the inspector's
      // cannot disagree about what a saved preset is, and a knob added to one
      // only would give a user two different presets for one panel depending
      // on which surface saved it.
      if (panel.spec.agentOptions !== undefined) captured.agentOptions = panel.spec.agentOptions
      return captured
    })
    return () => {
      offSheet()
      offSession()
      offSpawn()
      offRecover()
      offDefault()
      offCapture()
    }
  }, [onSpawn, worldCentre])

  // Menu-driven undo/redo, delivered the same way as copy/paste — through
  // main's menu accelerators, never the stock 'undo'/'redo' roles, which
  // drive document.execCommand against whatever DOM element happens to be
  // focused (xterm's hidden textarea, most of the time) rather than this
  // history stack.
  useEffect(() => {
    // Rule 3 again, and this is the sharpest edge of it: Cmd+Z is a menu
    // accelerator on exactly the same footing as Cmd+V, so with the palette
    // open and a name half-typed it does not undo the TYPING — it runs
    // applyHistory, which removes a panel and disposes its session, behind the
    // overlay, with no visible cause. verify:panels 37.
    //
    // Sharper still under the nav grid, which is why the guard is
    // shouldIgnoreKeys and not palette.isOpen: the grid is revealed by a
    // HELD Cmd, so Cmd+Z is one keypress away for the whole time it is up —
    // it kills a running agent behind an opaque overlay, and the workspace
    // switch on release then carries the evidence off screen entirely.
    // verify:panels 123.
    const offUndo = window.canvas.edit.onUndo(() => {
      if (shouldIgnoreKeys()) return
      // A draft's ⌘Z undoes its TYPING, never a panel spawn behind it.
      if (serveDraftEdit('undo')) return
      setHistory((h) => { const next = undoHistory(h); applyHistory(h.present, next); return next })
    })
    const offRedo = window.canvas.edit.onRedo(() => {
      if (shouldIgnoreKeys()) return
      if (serveDraftEdit('redo')) return
      setHistory((h) => { const next = redoHistory(h); applyHistory(h.present, next); return next })
    })
    return () => {
      offUndo()
      offRedo()
    }
  }, [applyHistory, shouldIgnoreKeys])

  // Pulled out of the onReset listener below so verify:panels' __m4bReset
  // hook (see the test-hook effect further down) can drive the exact same
  // path a confirmed main-process reset does — executeJavaScript has no way
  // to trigger the native confirmation dialog that guards the real trigger,
  // so this is the narrow verb the suite calls instead.
  const resetCanvas = useCallback(() => {
    // dispose, not just drop: reset kills every process. This is one of the
    // FIVE dispose call sites in this file — the others are the close button,
    // undo/redo removing a panel, workspace delete, and restart in place —
    // and pty.kill itself still has only its two callers inside
    // session-registry.ts, because every one of the five routes through
    // dispose() rather than calling pty.kill directly. verify:panels 94 pins
    // both numbers; it regex-counts the call over this whole file, comments
    // included, which is why this comment does not spell it with its
    // parentheses.
    // Reset drops every panel whatever its kind, but only a terminal panel
    // has anything to TEAR DOWN. A review node holds no PanelSession, and
    // the registry's dispose reaches pty.kill even for an id this renderer
    // holds no local session for — so skipping the node here is what stops a
    // reset sending a tmux kill-session named after a panel that never had
    // one, and dropping in main the baseline of whatever panel later
    // recycles that id (FIRST_RUN_ID makes recycled ids reachable from this
    // very function). Positive test, and on the iteration rather than on the
    // call, for the two reasons applyHistory's own guard states.
    for (const panel of panelsRef.current) {
      if (!isTerminalPanel(panel)) {
        // M16: `!isTerminalPanel`, not `isReviewPanel`. A file panel is the
        // second sessionless kind and would otherwise have taken the dispose
        // branch below, sending a kill for a panel that never had a session.
        // Its cached content goes with it, the same reason the two clears
        // below exist — a reset drops every panel at once, and FIRST_RUN_ID
        // makes recycled ids reachable from this very function.
        clearFileResult(panel.rect.id)
        clearToolbox(panel.rect.id)
        // M73. See onClosePanel: main's session, main's file, no registry.
        disposeChat(panel.rect.id, true); disposeWatcher(panel.rect.id); clearBrowser(panel.rect.id); disposeRelayTerminal(panel.rect.id)
        markLaneClosed(panel.rect.id)
        continue
      }
      registry.dispose(panel.rect.id)
      // Same reason as the undo/redo site above: reset drops every panel at
      // once, and each dropped id needs its cached agent state cleared too.
      clearAgentState(panel.rect.id)
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
    const fresh = firstRunPanels()
    setPanels(fresh)
    setGroups([])
    // M93. A reset is a reset: the notes go with the panels.
    setAnnotations([])
    // M181. And the starter may lay itself out again: a reset is a first run.
    setStarter(undefined)
    setSelectedAnnotation(null); setEditingAnnotation(null); setAnnotating(false)
    setDormantIds(new Set())
    selectOnly(null)
    setFocusedId(null)
    setHistory(createHistory(fresh))
    // firstRunPanels() places its panel at the world origin. Without
    // returning the camera too, reset from anywhere but the origin leaves
    // that panel off screen — an empty canvas, exactly what "First run"
    // is not supposed to allow — and the save effect below immediately
    // persists the still-distant camera over the one layoutStore.reset()
    // just cleared, so the blank view survives a relaunch.
    resetViewport()
  }, [resetViewport])

  // Main owns the reset dialog but only the renderer knows the live statuses,
  // so it supplies the counts the confirmation names.
  useEffect(() => {
    // M81. `tc status`'s model: the canvas in its OWN words — the state
    // vocabulary's word per panel, the edge labels' trigger words, the run
    // rows' outcome — so a supervisor reading this and a person reading the
    // rail are told the same thing (principle 11).
    const offModel = window.canvas.canvas.onModel(() => ({
      panels: panelsRef.current.map((p) => {
        const word = isTerminalPanel(p)
          ? panelState({ kind: 'terminal', status: registry.get(p.rect.id)?.status, dormant: dormantIdsRef.current.has(p.rect.id) }, getAgentState(p.rect.id))
          : isChatPanel(p)
            ? panelState({ kind: 'chat', status: undefined, dormant: false, chat: chatStateInput(getChat(p.rect.id).snapshot, getChat(p.rect.id).turns.length > 0) ?? { status: 'not-started' as const, pending: 0, hasHistory: false } }, undefined)
            // A document kind has no process word; the model says so in the
          // vocabulary's own terms rather than inventing one (M81's verifier:
          // the prompt tells the supervisor the closed set, so a `review`
          // here is a word its instructions say does not exist).
          // The vocabulary's own function decides the word, never a literal:
          // a document kind has no process, which is what `panelState` says
          // for a terminal that never started (verify:rail state.2).
          : panelState({ kind: 'terminal', status: undefined, dormant: false }, undefined)
        const usage = getUsage(p.rect.id)
        // No usage recorded is NOT zero — a confident `cost: 0` beside a
        // working agent is the answer `machine-cost` already refuses.
        const priced = usage === undefined || Object.keys(usage.byModel).length === 0
          ? undefined
          : Object.entries(usage.byModel).reduce<number | undefined>((acc, [model, totals]) => {
            const c = costOf(totals, model)
            return acc === undefined || c === undefined ? undefined : acc + c
          }, 0)
        const cost = priced
        // M366. The directory the inspector's Tools rule reads for this
        // panel, so `tc toolbox` asks main about the same directories the
        // palette's capability scope does (a sandbox chat has none).
        const tools = inspectionDirectory(p, 'tools')
        return {
          id: p.rect.id, kind: p.kind, state: word.word,
          ...(p.title === undefined ? {} : { title: p.title }),
          ...(isTerminalPanel(p) ? { cwd: getLiveSession(p.rect.id)?.cwd ?? p.spec.cwd } : isChatPanel(p) ? { cwd: p.chat.cwd } : {}),
          ...(tools.kind === 'known' ? { toolsCwd: tools.cwd } : {}),
          ...(cost === undefined ? {} : { cost })
        }
      }),
      edges: panelsRef.current.flatMap((p) => linksOf(p)
        // Every edge, including a plain link and a DISABLED rule: "no edge"
        // and "an edge that is off" are different facts (M81's verifier).
        .map((l) => ({
          from: p.rect.id,
          to: l.to,
          trigger: l.automation?.kind === 'handoff' && l.automation.enabled
            ? TRIGGER_WORDS[l.automation.trigger]
            : l.automation?.kind === 'handoff' ? 'off' : 'none'
        }))),
      runs: runsRef.current.map((r) => {
        const row = buildRunRows([r], new Set(), Date.now())[0]
        return { id: r.id, name: r.name, outcome: row?.outcome ?? '', panels: r.panelIds.length, ...(r.costUsd === undefined ? {} : { cost: r.costUsd }) }
      })
    }))
    const offCounts = window.canvas.canvas.onCounts(() => ({
      panels: panelsRef.current.length,
      // The SAME predicate the inspector's summary uses. It was written inline
      // here until M8c; two derivations of "how many agents are running" agree
      // the day they are written and drift the first time one is wrong, and
      // the drift window here is exactly the moment a spawn is in flight —
      // which no check would ever happen to sample.
      running: panelsRef.current.filter((p) => isRunning(registry.get(p.rect.id)?.status)).length
    }))
    const offReset = window.canvas.canvas.onReset(resetCanvas)
    return () => {
      offCounts()
      offModel()
      offReset()
    }
  }, [resetCanvas])

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
      connectorsRef.current?.extend(from, null, cursor)
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
    const out = smartSnap(rect, others, SNAP_PX / viewportRef.current.scale, { ...(resize ? { resize } : {}), ...(min === undefined ? {} : { min }), spacing: true, grid: null })
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

  const beginGroupDrag = useGroupDrag({
    hostRef,
    viewportRef,
    onDrag: useCallback((state, world, free) => {
      // M50. The group snaps as ONE rect — its members' bounding rect —
      // and the snap's delta shifts the cursor's world point, so every
      // member moves by the same amount and nothing shears.
      const members = new Set(state.members.map((m) => m.panelId))
      const rects = state.members.map((m) => applyDrag(m, world))
      let snappedWorld = world
      // M395. ⌘ held: a free frame, as for a panel (dragFrame's rule).
      if (free) setSnapGuides([])
      else if (rects.length > 0) {
        const bounds = {
          id: `group:${state.groupId}`,
          x: Math.min(...rects.map((r) => r.x)), y: Math.min(...rects.map((r) => r.y)),
          w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)),
          h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y))
        }
        const snapped = snapNow(bounds, members)
        snappedWorld = { x: world.x + (snapped.x - bounds.x), y: world.y + (snapped.y - bounds.y) }
      }
      setPanels((current) => applyGroupDrag(current, state, snappedWorld))
    }, [snapNow, setSnapGuides]),
    onCommit: useCallback(() => {
      setSnapGuides([])
      setPanels((current) => {
        commitHistory(current)
        return current
      })
    }, [commitHistory])
  })

  const onBeginGroupDrag = useCallback((group: CanvasGroup, event: MouseEvent<HTMLElement>) => {
    if (mergedRef.current) return
    // A viewer of a shared workspace arranges nothing, a group included.
    if (sharedRef.current.view !== null && !sharedRef.current.mayArrange) return
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const origin = screenToWorld(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewportRef.current
    )
    // Raising is part of the one group gesture and only rewrites Panel.z;
    // member array order remains untouched, so live terminal hosts stay put.
    setPanels((current) => raiseGroup(current, group))
    beginGroupDrag(groupDragState(group, panelsRef.current, origin))
  }, [beginGroupDrag])

  // A teammate's placeholder, moved by its header through the SAME gesture a
  // panel uses — so the same write-through, snap and role gate apply.
  const onBeginPlaceholderDrag = useCallback((p: SharedPanel, event: MouseEvent<HTMLElement>) => {
    if (mergedRef.current) return
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const origin = screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewportRef.current)
    beginDrag([{ panelId: p.id, mode: { kind: 'move' }, originRect: { id: p.id, x: p.x, y: p.y, w: p.w, h: p.h }, originWorld: origin }])
  }, [beginDrag])
  const onRemovePlaceholder = useCallback((p: SharedPanel) => {
    void sharedRef.current.removePlaceholder(p.id).then((verdict) => {
      if (!verdict.ok) notifyRefused('Not removed from the shared canvas', verdict.reason)
    })
  }, [])

  // M61. The same two pure transitions the palette's group.toggle row runs
  // (usePaletteActions), so the frame's button and the row cannot disagree.
  const toggleGroupCollapsed = useCallback((id: string) => {
    setGroups((current) => (current.find((g) => g.id === id)?.collapsed ? expandGroup : toggleGroup)(current, id))
  }, [])
  const onRemoveGroup = useCallback((id: string) => {
    setGroups((current) => removeGroup(current, id))
  }, [])

  const onBeginDrag = useCallback(
    (state: DragState) => {
      // GEOMETRY IS READ-ONLY WHILE MERGED, and this is the authoritative
      // gate for both move and resize — every handle and every chrome, on a
      // terminal panel and a review node alike, begins its gesture here. The
      // panels also render no resize handles while merged (TerminalPanel's
      // `readOnly`), which is the visible half; this is the half that holds
      // if some future surface forgets to pass the prop. A drag here would
      // move a rect that carries mergedLayout's lane offset, and setPanelRect
      // writes into `panels` — the ACTIVE workspace's array — so a foreign
      // panel dragged in this view would either land nowhere or, once
      // un-offset by a well-meaning later change, write a wrong coordinate
      // into a workspace record nobody was looking at.
      if (mergedRef.current) return
      // M92. LOCK is one early return, here, at the gate every move and
      // resize passes through: the handles still render (a control that
      // vanishes reads as a bug) and say why in their title.
      if (panelsRef.current.find((p) => p.rect.id === state.panelId)?.locked === true) return
      const host = hostRef.current
      if (!host) return
      const bounds = host.getBoundingClientRect()
      // The panel supplies CLIENT coordinates; only the canvas knows the
      // viewport, so the conversion belongs here. Converting the POINT (not a
      // delta) is what makes the gesture move by screenDelta / scale:
      // usePanelDrag converts each move the same way, and the two translations
      // cancel in the subtraction applyDrag does.
      // A group is N ordinary drags, not one drag of an enclosing rectangle.
      // Snapshot every origin rect before the first frame rewrites `panels`,
      // then apply the same pointer delta to each immutable origin in
      // usePanelDrag. The pressed member is always present; a resize stays a
      // one-member gesture even when a selection exists.
      //
      // M395. A FRAME CARRIES WHAT IS WHOLLY INSIDE IT, as FigJam's sections
      // do: a move of a frame (by its label or its ring, alone or in a
      // selection) takes every object lying wholly within it at THIS moment
      // along — computed here, at the gesture, and never stored, so M187's
      // "a frame owns nothing" stays true of the record (`frameContents`).
      // The carried objects are ordinary members: one delta, one snap over
      // the bounds, one history entry on release. A locked object stays put
      // (M92), in a selection as in a group.
      const all = panelsRef.current
      const pressed = all.find((panel) => panel.rect.id === state.panelId)
      const moving = state.mode.kind !== 'move' || pressed === undefined
        ? []
        : withFrameContents(selectedIdsRef.current.has(state.panelId)
          ? all.filter((panel) => selectedIdsRef.current.has(panel.rect.id) && (panel.locked !== true || panel.rect.id === state.panelId))
          : [pressed], all)
      const group = moving.length <= 1
        ? [state]
        : moving.map((panel) => (panel.rect.id === state.panelId ? state : {
            ...state,
            panelId: panel.rect.id,
            originRect: panel.rect
          }))
      beginDrag(group.map((member) => ({
        ...member,
        originWorld: screenToWorld(
          { x: member.originWorld.x - bounds.left, y: member.originWorld.y - bounds.top },
          viewportRef.current
        )
      })))
    },
    [beginDrag]
  )

  // Stable identities: these go into TerminalPanel's effect deps, and a fresh
  // arrow each render would tear the terminal down and reopen it every frame.
  const onSlotMount = useCallback((id: string) => registry.attachSlot(id), [])
  const onSlotUnmount = useCallback((id: string) => registry.detachSlot(id), [])
  const onClosePanel = useCallback((id: string) => {
    // Closing is gated with the rest of the mutating gestures, and this gate
    // has to be HERE rather than on the panel's own × — the rail's close
    // control and the inspector's Close button reach the same verb through
    // paletteActions.closePanel, and the rail lists every merged panel. A
    // close aimed at a foreign id would find nothing in `panels` (removePanel
    // is a no-op there) and still reach registry.dispose, which sends
    // pty.kill even for an id this renderer holds no local session for — i.e.
    // it would kill another workspace's agent and leave its panel on that
    // workspace's canvas, with nothing on screen having changed here.
    if (mergedRef.current) return
    // A review node owns no session, so it is dropped from the array and
    // nothing else. This is NOT a sixth dispose call site and must not
    // become one: the registry's dispose sends pty.kill even for an id this
    // renderer holds no session for (see CLAUDE.md), so routing a review
    // node through it would send a tmux kill-session for a panel that never
    // had one — and, worse, drop the baseline of whatever panel later
    // recycles that id.
    // M16 widens this from `isReviewPanel` to "any panel that is not a
    // terminal": a file panel owns no session either, so routing it through
    // the dispose below would send the same stray kill for the same reason.
    if (panelsRef.current.some((p) => p.rect.id === id && !isTerminalPanel(p))) {
      // Its cached content is dropped here rather than in FileNode's unmount
      // cleanup: the cleanup's job is the WATCH (main-side), and a closed
      // panel's result must not survive for a recycled id to inherit. A no-op
      // for a review node, which has no entry.
      clearFileResult(id)
      clearToolbox(id)
      // M73. A chat panel's session is MAIN's, not the registry's, so this
      // is still not a registry.dispose call site: the close ends the
      // process through agent:dispose and drops the durable file. A no-op
      // for the other sessionless kinds.
      // M338. A relay panel DETACHES; the relay reaps a session nobody is attached to.
      disposeChat(id, true); disposeWatcher(id); clearBrowser(id); disposeRelayTerminal(id)
      // M114. The lane's card stays, its state stays: `lane closed` is a note,
      // never a silent trip back to todo.
      markLaneClosed(id)
      setPanels((current) => {
        const next = removePanel(current, id)
        commitHistory(next)
        return next
      })
      setSelectedIds((current) => retainSelection(current, (sid) => sid !== id))
      setFocusedId((current) => (current === id ? null : current))
      return
    }
    // What actually matters is that dispose runs SYNCHRONOUSLY inside this
    // handler, killing the pty on the click that asked for it. The ordering
    // against setPanels is not load-bearing: this is a React synthetic
    // onMouseDown, so setPanels is batched and the unmount happens after the
    // handler returns either way. TerminalPanel's cleanup then runs against an
    // already-disposed session, which is fine by construction — detachSlot
    // early-returns on a missing id, and the cleanup's removeChild is guarded
    // on host.parentNode === slot.
    registry.dispose(id)
    // Same reason as the other two dispose sites: a closed panel's id must
    // not keep a cached agent state that a recycled id could inherit.
    clearAgentState(id)
    forgetEdgesFor(id); forgetAgentLinksFor(id)
    clearLastLine(id)
    clearLastActive(id)
    clearLiveSession(id)
    clearSubagents(id)
    clearTrail(id)
    clearUsage(id)
    clearMachineCost(id)
    clearScrollbackTail(id)
    setPanels((current) => {
      const next = removePanel(current, id)
      commitHistory(next)
      return next
    })
    setSelectedIds((current) => retainSelection(current, (sid) => sid !== id))
    setFocusedId((current) => (current === id ? null : current))
  }, [commitHistory])
  /**
   * Select and raise, without waking. The half onSelectPanel and the palette's
   * goToPanel share: a raise is a z change and nothing more (see "Stacking is
   * Panel.z, never array order"), so it is safe for a navigation that must not
   * start a process, while registry.wake — onSelectPanel's other half — is not.
   */
  const selectAndRaise = useCallback((id: string, additive = false) => {
    if (additive) {
      addToSelection(id)
      return
    }
    // Pressing the chrome of a member is how a completed selection begins a
    // group drag. Do not erase its peers between that press and onBeginDrag;
    // clicking an unselected panel, or the background, still replaces it.
    if (selectedIdsRef.current.size > 1 && selectedIdsRef.current.has(id)) return
    selectOnly(id)
    setPanels((current) => {
      // Skip the raise (and the history push it would trigger) when `id` is
      // already topmost. onFocusPanel calls this on every click into a panel
      // to type — without this guard, an ordinary editing session fills
      // HISTORY_LIMIT with z-order noise, and a user's first several Cmd+Z
      // presses undo clicking rather than the edit they meant. This decision
      // belongs here, not in history.ts: that module's docstring deliberately
      // declines to define equality for pushHistory ("no equality check...
      // deciding otherwise needs a notion of equality this module has no
      // business defining") — recognizing a no-op RAISE is a panels.ts/Canvas
      // concept (topmost z), not a general state-equality one, so it stays a
      // caller-side decision instead of smuggling one into the primitive.
      const panel = current.find((p) => p.rect.id === id)
      const alreadyTop = panel !== undefined && current.every((p) => p.z <= panel.z)
      if (alreadyTop) return current
      const next = raisePanel(current, id)
      // M395. A frame is never raised (raisePanel hands back the SAME array):
      // selecting it leaves it behind what it encloses, and pushes nothing.
      if (next === current) return current
      commitHistory(next)
      return next
    })
  }, [addToSelection, commitHistory, selectOnly])

  /**
   * M256. DOCUMENT FOCUS — one file at a time, centred, widened and the only
   * object at full strength. A VIEW state, never a layout one: the widening is
   * a display rect handed to the one panel (`docFocusRect`), so nothing is
   * written to the layout, the history or the undo stack, and leaving puts
   * the panel back exactly where it was. Entering is a camera JUMP onto the
   * trail, so leaving by the panel's own control is a Camera Back.
   *
   * Left implicitly when the panel stops being the selection (a background
   * click, another panel) — quietening the canvas around a file nobody has
   * selected would hide the thing the person just chose.
   */
  const [docFocusId, setDocFocusId] = useState<string | null>(null)
  const onDocFocus = useCallback((id: string, on: boolean) => {
    if (!on) { setDocFocusId(null); cameraBack(); return }
    const panel = panelsRef.current.find((p) => p.rect.id === id)
    if (panel === undefined) return
    selectAndRaise(id)
    setDocFocusId(id)
    frameRects([docFocusRect(panel.rect)])
  }, [selectAndRaise, frameRects, cameraBack])
  useEffect(() => {
    if (docFocusId !== null && (!selectedIds.has(docFocusId) || selectedIds.size !== 1)) setDocFocusId(null)
  }, [docFocusId, selectedIds])

  // Which panel the jump key last visited. A ref, not state: it is a cursor
  // for a keydown handler and nothing renders from it, so putting it in state
  // would re-render the canvas on every press for no visible reason.
  const jumpCursorRef = useRef<string | null>(null)
  // M308. Assigned below, where the inbox is built; read at press time.
  const inboxRef = useRef<Inbox | null>(null)

  /**
   * Cmd+J. centreOn + selectAndRaise, and deliberately NOTHING ELSE — no
   * registry.wake, no registry.focus, no agent:acknowledge. Focus is the
   * renderer's single trigger for acknowledgement (see onFocusPanel), and
   * routing a second one through navigation would make the renderer a second
   * author of a state main owns. The panel therefore keeps its amber border
   * after you land on it, which is why styles.css lets wants-you outrank
   * .panel--selected.
   *
   * Assigned into jumpAttentionImplRef (declared above, before useViewport)
   * rather than being the callback passed to useViewport directly — see that
   * ref's own comment for why the two cannot be the same binding. Reassigned
   * every render so the closure below always sees the CURRENT centreOn and
   * selectAndRaise, never a stale one from the render that first set it.
   */
  jumpAttentionImplRef.current = (direction: JumpDirection) => {
    // panelsRef, not `panels`: this reads at keypress time and must not put a
    // 60Hz-changing array into a useCallback's dep list (the same mirror-into-
    // a-ref move focusedIdRef makes).
    //
    // The attention store and the panel list can disagree: closing a panel
    // disposes its session and clears its agent state synchronously while
    // pty:kill is still in flight to main, and one more agent:state for that
    // id in that window (an idle tick, a bell) re-inserts it into the queue
    // with nothing left to clear it afterward (M6c's session.killed guard
    // suppresses the matching `exited`). reachableQueue drops any such
    // phantom BEFORE it can seat the cursor — seating it there first and
    // bailing out on a missing panel would leave the cursor stuck on an id it
    // can never leave, killing the key rather than skipping one press.
    // displayPanelsRef, the same array the rail's Attention section is built
    // from: while merged a waiting panel in another lane IS on screen and IS
    // framable, and a queue narrowed to `panels` would skip it while its row
    // sat visible one column to the left.
    const known = new Set(displayPanelsRef.current.map((p) => p.rect.id))
    // M308. The inbox's order — most unblocked first, snoozed skipped.
    const queue = jumpOrder(reachableQueue(attentionIds(), known), inboxRef.current)
    const id = nextAttentionId(queue, jumpCursorRef.current, direction)
    // Nothing is waiting: the key does nothing at all. Moving the camera
    // "somewhere" would be worse than silence — the user asked to be taken to
    // a panel that wants them, and there isn't one.
    if (id === null) return
    const panel = displayPanelsRef.current.find((p) => p.rect.id === id)
    // Belt-and-braces: a panel can still vanish between the filter above and
    // this lookup in principle. It must never be the ONLY thing standing
    // between the user and a working key, which is why the filter exists.
    if (!panel) return
    jumpCursorRef.current = id
    landingTargetRef.current = id
    centreOn(panel.rect)
    selectAndRaise(id)
    openRequestOfRef.current(id)
  }

  // M249. The command pill's Jump: Cmd+J's own queue and its own cursor — so
  // a pill press and a Cmd+J press advance ONE cycle rather than two that
  // disagree about which waiting panel is next — landing through
  // jumpToAttention, the notification click's function. Nothing waiting
  // does nothing, for Cmd+J's reason.
  const pillJump = useCallback(() => {
    const known = new Set(displayPanelsRef.current.map((p) => p.rect.id))
    const id = nextAttentionId(jumpOrder(reachableQueue(attentionIds(), known), inboxRef.current), jumpCursorRef.current, 1)
    if (id === null) return
    jumpCursorRef.current = id
    // #16. jumpToAttention opens the request itself (a permission in the queue).
    jumpToAttention(id)
  }, [jumpToAttention])
  // Filled by CommandPill with its "expand and take the keyboard"; a ref so
  // useKeyboardNav's listener installs once (openPill's identity is fixed).
  const pillOpenRef = useRef<() => void>(() => {})
  const openPill = useCallback(() => pillOpenRef.current(), [])

  const onSelectPanel = useCallback((id: string, additive = false) => {
    if (additive) {
      selectAndRaise(id, true)
      return
    }
    selectAndRaise(id)
    // Waking hangs off SELECT, not focus. A carded panel has no .panel__slot
    // and so no focus handler of its own — its click falls through to the
    // canvas background, which hit-tests and selects. Hooking onFocusPanel
    // would leave a dormant panel unwakeable by clicking the very card that
    // says "click to start".
    setDormantIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
    registry.wake(id)
  }, [selectAndRaise])
  const onFocusPanel = useCallback((id: string) => {
    onSelectPanel(id)
    setFocusedId(id)
    // M105. Looking at it is reading it: the unread mark clears on focus.
    clearUnread(id)
    registry.focus(id)
    // Looking at a panel is reading it. Sent unconditionally rather than only
    // when this panel is in wants-you: main is the only author of that state,
    // and a renderer that decided when to bother telling it would be deciding
    // the state itself — the exact second-author problem the acknowledge
    // channel exists to avoid. The handler is a map lookup and a no-op for
    // any panel that does not want you.
    void window.canvas.agent.acknowledge(id)
  }, [onSelectPanel])
  // M65. The sheet's spawn gets focus once its panel is in state.
  useEffect(() => {
    if (pendingFocusId === null) return
    if (!panels.some((p) => p.rect.id === pendingFocusId)) return
    setPendingFocusId(null)
    onSelectPanel(pendingFocusId)
  }, [pendingFocusId, panels, onSelectPanel])

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
  // M80. The saved shapes of work, for the palette's rows (the sheet asks main
  // itself when it opens, so a template saved while the palette is shut is
  // offered the moment the sheet opens either way).
  const [templateRows, setTemplateRows] = useState<PersistedTemplate[]>([])
  // M133's verbs are read from refs at CALL time, the rule every verb in this
  // file obeys: the user can save or delete a template between opening the
  // palette and running the row.
  const templateRowsRef = useRef<PersistedTemplate[]>([])
  templateRowsRef.current = templateRows
  // M182. Reloaded after every save through the binding's Update: a second
  // Update with the rows read at mount would always expect the old revision.
  const reloadTemplates = useCallback(() => { void window.canvas.template.list().then(setTemplateRows) }, [])
  useEffect(() => { reloadTemplates() }, [reloadTemplates])
  const reloadPresets = useCallback(() => {
    void window.canvas.preset.list().then(setPresetRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadPresets()
  }, [palette.open, reloadPresets])
  // The top bar names the default preset, so the list must exist before the
  // palette has ever been opened — the bar renders on the first paint and the
  // user may never press Cmd+K at all. The palette-open reload above STAYS:
  // this one runs once, and it is the reopen that keeps the rows fresh after
  // a rename, a delete or a change of default.
  useEffect(() => { reloadPresets() }, [reloadPresets])

  // The prompt list, reloaded whenever the palette opens — and whenever the
  // panel it captured changes, because a project's prompts are its own
  // directory's and two panels are rarely in the same one.
  const [promptRows, setPromptRows] = useState<PromptRow[]>(EMPTY_PROMPTS)
  // Bodies are deliberately NOT in the row type the palette renders:
  // buildCommands has no use for a paragraph, and putting one in a list row's
  // props means re-rendering the whole list whenever a prompt file changes.
  const promptBodiesRef = useRef(new Map<string, string>())
  const reloadPrompts = useCallback((capturedId: string | null) => {
    const panel = capturedId ? panelsRef.current.find((p) => p.rect.id === capturedId) : undefined
    // Where the panel IS, falling back to where it was spawned.
    //
    // The fallback is the asymmetry this milestone states once and obeys twice:
    // DISPLAY renders nothing without a live answer, because a spawn-time value
    // under a present-tense label is indistinguishable from a correct one — but
    // a CONSUMER needs a directory, and the spawn cwd is exactly what it used
    // before this milestone, so falling back here is never worse than not
    // shipping. A review node has no cwd of its own and still lists the saved
    // prompts alone, and so does a file panel — the path it names is a FILE,
    // and handing a file to prompt.list as though it were a directory would
    // read the wrong project's commands or none at all.
    const cwd = panel !== undefined && isTerminalPanel(panel)
      ? (getLiveSession(panel.rect.id)?.cwd ?? panel.spec.cwd)
      : null
    void window.canvas.prompt.list(cwd).then((rows) => {
      promptBodiesRef.current = new Map(rows.map((r) => [r.id, r.body]))
      setPromptRows(rows.map(({ id, name, source }) => ({ id, name, source })))
    })
  }, [])
  useEffect(() => {
    if (palette.open) reloadPrompts(palette.capturedId)
  }, [palette.open, palette.capturedId, reloadPrompts])

  // The settings list, reloaded whenever the palette opens — main owns the
  // store, so the row list always reflects what it actually holds rather than
  // whatever the palette last rendered.
  const [settingRows, setSettingRows] = useState<SettingRow[]>(EMPTY_SETTINGS)
  const reloadSettings = useCallback(() => {
    void window.canvas.settings.list().then(setSettingRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadSettings()
  }, [palette.open, reloadSettings])

  // Credential metadata, reloaded on palette open ONLY — the same shape as
  // reloadSettings immediately above, and deliberately not also on mount the
  // way reloadPresets is: nothing outside the palette reads this list, so
  // there is no top-bar-shaped reason to have it ready before a first Cmd+K.
  // That absence is also what keeps credential:list off the boot path —
  // scripts/verify-canvas.cjs's registerIpcHandlers wiring has no credential
  // store to answer it, and firing this at mount would surface as an
  // unrelated-looking canvas failure that points nowhere near this feature.
  const [credentialRows, setCredentialRows] = useState<CredentialMeta[]>(EMPTY_CREDENTIALS)
  const reloadCredentials = useCallback(() => {
    void window.canvas.credential.list().then(setCredentialRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadCredentials()
  }, [palette.open, reloadCredentials])
  // M37. The worktree list, for the same reason and on the same trigger as
  // credentials: main owns the records, the palette is the only reader, and
  // reading at mount would surface a failure nowhere near this feature.
  const [worktreeRows, setWorktreeRows] = useState<WorktreeListRow[]>(EMPTY_WORKTREES)
  const worktreeEpochRef = useRef(0)
  const reloadWorktrees = useCallback(() => {
    // M86. Each row carries where its branch stands against its tracking ref,
    // read per worktree from the LOCAL ref — a fetch is never run, and the
    // phrase says so. A row whose status could not be read keeps no phrase
    // rather than a wrong one.
    // Rows land at once and the phrases enrich them after; an older reload
    // settling after a newer one is dropped, or a removed worktree could
    // reappear (M86's verifier).
    const epoch = ++worktreeEpochRef.current
    void window.canvas.worktree.list().then(async (rows) => {
      if (epoch !== worktreeEpochRef.current) return
      setWorktreeRows(rows)
      const withStatus = await Promise.all(rows.map(async (row) => {
        try {
          const s = await window.canvas.git.status(row.path)
          if (s.kind !== 'status') return row
          const phrase = s.upstream === null ? `${s.branch} · no upstream` : `${s.branch} · ahead ${s.upstream.ahead} · behind ${s.upstream.behind}`
          return { ...row, status: phrase }
        } catch { return row }
      }))
      if (epoch !== worktreeEpochRef.current) return
      setWorktreeRows(withStatus)
    })
  }, [])
  useEffect(() => {
    if (palette.open) reloadWorktrees()
  }, [palette.open, reloadWorktrees])

  // The workspace list, reloaded after every mutation the palette's own
  // create/rename/delete commands drive below — the same "main is the only
  // side that knows what the store now says" rule reloadPresets/
  // reloadPrompts/reloadSettings already follow. It also reloads on mount
  // and on every palette open, the same two occasions the sibling lists
  // reload on below, and every row that needs `attentionIds` reads it from
  // this same state and loader rather than a second one.
  const [workspaceRows, setWorkspaceRows] = useState<WorkspaceRow[]>(EMPTY_WORKSPACES)
  // M336. Who is signed in, the active one first; the top bar's account menu
  // and M337's share dialog read the same hook, kept live by auth:changed.
  const accounts = useAccounts()
  /**
   * Which workspaces EXIST, as a value that only changes when one of them
   * does — the merged refetch's dep, and see that effect for what a stale
   * lane costs.
   *
   * Derived rather than read off the array because reloadWorkspaces() hands
   * back a fresh array of fresh objects every time it runs, including on
   * every panels.length change, so the array identity is not evidence that
   * anything moved. JSON.stringify rather than a join for the reason
   * railSignature gives: a workspace NAME is user text, and a separator a
   * name is free to contain lets two different lists collapse to one string
   * — here that means a rename that goes unnoticed and a lane left showing
   * the old name, for the users whose names contain the delimiter and nobody
   * else.
   *
   * panelIds is deliberately NOT in it: it changes on every spawn and close,
   * which panels.length already covers one dep along.
   *
   * NOT rail-sections' own `workspaceSignature`, which this file already
   * imports and uses for the rail's frozen rows: that one folds in each
   * workspace's WAITING COUNT, so it moves on every bell — and a bell must
   * not fire an IPC round trip and a re-tier of every lane. Two signatures
   * over the same rows, answering two different questions.
   */
  const workspaceListSignature = useMemo(
    () => JSON.stringify(workspaceRows.map((w) => [w.id, w.name, w.active])),
    [workspaceRows]
  )
  const reloadWorkspaces = useCallback(() => {
    // Rejection handled rather than voided. void-ing the chain silences the
    // lint, not the failure, and M8d raised what a swallowed one costs: before
    // the rail, a failed reload meant missing rows in a surface that reloads on
    // every open, so the next Cmd+K repaired it. Now it leaves an always-mounted
    // Workspaces section stuck on whatever it last had — at mount, on nothing at
    // all — with no console line naming the reason.
    void window.canvas.workspace.list().then(setWorkspaceRows, (error: unknown) => {
      console.warn('[workspace] could not list workspaces', error)
    })
  }, [])
  // Mount (so the first Cmd+K sees real rows even if no mutation has run
  // yet) and every palette open (so a workspace mutated while the palette
  // was closed still shows up) — the two occasions reloadPresets/
  // reloadSettings already cover for their own lists. Deliberately NOT a
  // dependency of any agent-state effect: the ROWS change rarely, while the
  // waiting COUNT is derived live below from attentionIds, so a bell must
  // not reload this list on every agent:state message.
  useEffect(() => { reloadWorkspaces() }, [reloadWorkspaces])
  // Keeps reloadWorkspacesRef current for switchWorkspace, declared earlier
  // in this component — see that ref's own comment for why.
  useEffect(() => { reloadWorkspacesRef.current = reloadWorkspaces }, [reloadWorkspaces])

  /**
   * D17 / 4.4. Go to a waiting panel WHEREVER it lives: on this canvas, the
   * notification click's own landing; in a hidden workspace, the existing
   * activation first, then the same landing once that canvas has rendered.
   * The landing waits on `displayPanels` holding the id rather than on the
   * switch's promise, because the promise resolves before React has
   * committed the incoming panels, and goToPanel on an id not yet rendered
   * frames nothing. A refused switch (another transition in flight) drops
   * the jump — the same answer a second press gets from Cmd+J.
   */
  const pendingJumpRef = useRef<string | null>(null)
  const jumpAnywhere = useCallback((panelId: string) => {
    if (displayPanelsRef.current.some((p) => p.rect.id === panelId)) { jumpToAttention(panelId); return }
    const owner = workspaceRows.find((w) => !w.active && w.panelIds.includes(panelId))
    if (owner === undefined) return
    pendingJumpRef.current = panelId
    void switchWorkspace(owner.id).then((ok) => { if (!ok) pendingJumpRef.current = null })
  }, [workspaceRows, switchWorkspace, jumpToAttention])
  useEffect(() => { attentionJumpRef.current = jumpAnywhere }, [jumpAnywhere])
  useEffect(() => {
    const id = pendingJumpRef.current
    if (id === null || !displayPanels.some((p) => p.rect.id === id)) return
    pendingJumpRef.current = null
    jumpToAttention(id)
  }, [displayPanels, jumpToAttention])

  /**
   * Cmd+Shift+] and Cmd+Shift+[: the next or previous workspace, WRAPPING.
   *
   * It walks `workspaceRows` — the rail's own list, in main's own order — so
   * the chord and the rail's Workspaces section cannot disagree about what
   * "next" means, and it wraps rather than stopping at the ends: an
   * unwrapped `rows[at + delta]` is `undefined` at both edges, which reads as
   * a chord that stopped working rather than as a boundary.
   *
   * A single workspace is a deliberate no-op. `switchWorkspace` on the
   * ALREADY-active id is a real activate round trip that rewrites the record
   * it just read, and there is nowhere to go, so the honest answer is
   * nothing at all. Everything else — including leaving the merged view
   * first — is switchWorkspace's, so this cannot become a second switching
   * path.
   */
  const stepWorkspace = useCallback((delta: 1 | -1) => {
    if (workspaceRows.length < 2) return
    const at = workspaceRows.findIndex((w) => w.active)
    // No active row means the list has not loaded yet (mount, or a failed
    // reload that logged its own warning) — stepping from an unknown index
    // would land on an arbitrary workspace, which is worse than nothing.
    if (at < 0) return
    const next = workspaceRows[(at + delta + workspaceRows.length) % workspaceRows.length]
    switchWorkspace(next.id)
  }, [workspaceRows, switchWorkspace])
  // Handed to useViewport through the ref declared beside its call, for the
  // ordering reason that ref's own comment gives.
  stepWorkspaceImplRef.current = stepWorkspace
  useEffect(() => {
    if (palette.open) reloadWorkspaces()
  }, [palette.open, reloadWorkspaces])
  // The third occasion, and the one the rail added. A workspace row renders
  // `N panels`, and NOTHING above reloads on a spawn or a close: mount, palette
  // open, and the create/rename/delete/switch call sites are the whole set. So
  // a mouse-only user who clicks the top bar's New panel three times reads
  // "1 panel" two lines above a Panels list showing four rows, and it stays
  // wrong until they happen to open the palette — which they may never do, and
  // mouse-only reachability is exactly what this section exists for.
  //
  // Keyed on panels.LENGTH, never on `panels`: the array identity is fresh on
  // every setPanelRect, i.e. every frame of a drag, so keying on the array
  // would fire an IPC round trip at 60Hz for rect changes no workspace row
  // displays — the same churn railSignature and every memo in this file exist
  // to keep off the shell.
  //
  // It sees main's post-save state because of DECLARATION ORDER: the
  // layout.save effect is declared earlier in this component, React runs a
  // commit's effects in declaration order, and both IPC handlers are
  // synchronous and processed in arrival order. doSave mutates w.panels in
  // place — only its scheduleWrite is debounced — and workspaces() reads that
  // same in-memory snapshot, so the reply is fresh within one round trip.
  // Moving this effect above the save one would leave every count one panel
  // stale, with nothing to point at.
  useEffect(() => { reloadWorkspaces() }, [panels.length, reloadWorkspaces])

  /**
   * Keep the merged view current while it is open.
   *
   * Keyed on `panels.length` and not on `panels`: the array is a fresh
   * identity on every setPanelRect — i.e. every frame of a drag — and an
   * effect on the array itself would put an IPC round trip on the 60Hz path.
   * The COUNT is what a Cmd+N or a close actually changes, which is the whole
   * reason to refetch: without this, a panel spawned while merged is missing
   * from its own lane until the user toggles the view off and on, which reads
   * as the spawn having failed.
   *
   * It re-derives dormancy under the identical rule and in the identical
   * order, because a refetch is an entry as far as registry.ensure is
   * concerned: it can introduce panel ids this canvas has never rendered (a
   * spawn in ANOTHER window, a panel filed here by a move).
   *
   * `panels.length` ALONE was not enough, and the gap was the worst thing in
   * this milestone. A workspace mutation changes no panel on THIS canvas, so
   * deleting a NON-ACTIVE workspace while merged left its lane rendering
   * panels whose sessions had just been disposed — and a lane on screen is
   * clickable, because hitOrder is built from displayPanels. Clicking a ghost
   * runs onSelectPanel, which clears dormancy and calls registry.ensure,
   * which MINTS A FRESH SESSION for an id no workspace holds any more;
   * tiering promotes it and attachSlot spawns. An agent under a deleted
   * workspace's panel id, reachable from no UI ever again, from one click —
   * the no-unguarded-spawn rule broken through a door no per-task review
   * could see. Create and rename leave the same lane stale, cosmetically.
   *
   * So it also keys on `workspaceListSignature`, a STRING derived from
   * workspaceRows rather than the array itself: reloadWorkspaces() hands back
   * a brand-new array of brand-new objects on every call, including the one
   * this component fires on every panels.length change, so an effect keyed on
   * the array would refetch on identities that describe no change at all.
   * The signature covers id, name and which one is active — every workspace
   * MUTATION — and deliberately not panelIds, which changes on every spawn
   * and is already covered by panels.length one dep along. Gating the delete
   * on `merged` was the alternative and is worse: it would leave the stale
   * lane in place for create and rename too.
   */
  useEffect(() => {
    if (!merged) return
    let live = true
    void (async (): Promise<void> => {
      let workspaces: MergedWorkspace[]
      try {
        workspaces = await window.canvas.workspace.merged()
      } catch (error: unknown) {
        console.warn('[merged] could not refresh the merged view', error)
        return
      }
      const dormant = await resolveDormant(
        workspaces.flatMap((w) => w.panels.map((p) => p.id))
      )
      // The guard is not defensiveness: this fetch can resolve after the user
      // has already left the merged view, and committing then would put every
      // other workspace's panels back on a canvas that is no longer showing
      // them — with a dormantIds set naming ids this workspace does not hold.
      if (!live) return
      setMergedData(workspaces)
      setDormantIds(dormant)
    })()
    return () => { live = false }
  }, [merged, panels.length, workspaceListSignature, resolveDormant])

  // Read once at mount and again whenever a setting changes, so toggling the
  // glow off takes effect without a relaunch. settingRows is loaded only when
  // the palette OPENS, so it cannot be the source here — a panel must know
  // this whether or not the palette has ever been opened.
  const [glowEnabled, setGlowEnabled] = useState(true)
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'agent.glow')
      if (row) setGlowEnabled(row.value === true)
    })
  }, [settingRows])

  // Read the same way glowEnabled is, and for the same reason: settingRows is
  // loaded only when the palette OPENS, so it cannot be the source — the pips
  // must know this whether or not the palette has ever been opened.
  const [pipsEnabled, setPipsEnabled] = useState(true)
  // M69. The overview, read the same way.
  const [minimapEnabled, setMinimapEnabled] = useState(true)
  useEffect(() => {
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        const row = rows.find((r) => r.id === 'agent.edgeIndicators')
        if (row) setPipsEnabled(row.value === true)
        const mm = rows.find((r) => r.id === 'canvas.minimap')
        if (mm) setMinimapEnabled(mm.value === true)
      })
    }
    read()
    // M69. And on settings:changed, the way the theme is: a toggle from the
    // menu or the `tc` CLI must apply without a palette ever opening.
    const off = window.canvas.settings.onChanged(read)
    return off
  }, [settingRows])

  // M44: xterm's screen-reader mode, fanned across every session (live and
  // detached) through the shared applyTerminalOptions. Read on the settings
  // reload the frame already re-reads, like glow/pips above.
  const [screenReaderMode, setScreenReaderMode] = useState(false)
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'accessibility.screenReaderMode')
      if (row) setScreenReaderMode(row.value === true)
    })
  }, [settingRows])
  useEffect(() => {
    registry.applyTerminalOptions({ screenReaderMode })
  }, [screenReaderMode])

  // M45: the theme. useTheme stamps data-theme (the stylesheet's two colour
  // blocks select on it) and the terminal follows through the SAME fan-out
  // the screen-reader option uses — every session, live and detached, and
  // sessions created later inherit it. configure() refreshes an opened
  // terminal itself; a detached one repaints on its next attach.
  const resolvedTheme = useTheme(settingRows)
  useEffect(() => {
    registry.applyTerminalOptions({ theme: terminalTheme(resolvedTheme) })
    // M338. Relay xterms are not in the registry (their pty is remote); same switch.
    applyRelayTheme(terminalTheme(resolvedTheme))
  }, [resolvedTheme])

  // M49: the global terminal font size, read the way glow is, and fanned
  // through the registry together with every terminal panel's override —
  // the registry resolves the effective size per session and refits each
  // live one ONCE per commit. A font size is a resize wearing a hat; zoom is
  // not font size, and nothing here reaches for the camera.
  const [globalFontSize, setGlobalFontSize] = useState(13)
  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        if (!live) return
        const row = rows.find((r) => r.id === 'terminal.fontSize')
        if (row && typeof row.value === 'number') setGlobalFontSize(row.value)
      })
    }
    read()
    // And on any write, as useTheme does: the setting's own palette row
    // reloads settingRows, but a write from anywhere else must apply too.
    const off = window.canvas.settings.onChanged(read)
    return () => { live = false; off() }
  }, [settingRows])
  // (this redesign) The inspector's width and pinned-through-compact setting, read the
  // same way `globalFontSize` is — `shell.inspectorWidth`/`shell.inspectorPinned`
  // are ordinary settings, so a write from the palette or from this pane's own
  // resize handle must both apply, and only `settings:list` sees both.
  const [inspectorWidth, setInspectorWidth] = useState(260)
  const [inspectorPinned, setInspectorPinned] = useState(false)
  // M279. The navigator's width, the same way (`shell.navWidth`).
  const [navWidth, setNavWidth] = useState(300)
  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        if (!live) return
        const w = rows.find((r) => r.id === 'shell.inspectorWidth')
        if (w && typeof w.value === 'number') setInspectorWidth(w.value)
        const nw = rows.find((r) => r.id === 'shell.navWidth')
        if (nw && typeof nw.value === 'number') setNavWidth(nw.value)
        const p = rows.find((r) => r.id === 'shell.inspectorPinned')
        if (p && typeof p.value === 'boolean') setInspectorPinned(p.value)
      })
    }
    read()
    const off = window.canvas.settings.onChanged(read)
    return () => { live = false; off() }
  }, [settingRows])
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
  const onToggleInspectorPinned = useCallback((): void => {
    setInspectorPinned((v) => { const next = !v; void window.canvas.settings.set('shell.inspectorPinned', next); return next })
  }, [])
  const fontOverridesSig = panels.map((p) => (isTerminalPanel(p) && p.fontSize !== undefined ? `${p.rect.id}=${p.fontSize}` : '')).filter(Boolean).join(',')
  useEffect(() => {
    const overrides: Record<string, number> = {}
    for (const p of panelsRef.current) if (isTerminalPanel(p) && p.fontSize !== undefined) overrides[p.rect.id] = p.fontSize
    registry.setFontSizes({ global: globalFontSize, overrides })
  }, [globalFontSize, fontOverridesSig])

  // M48: the environment report, read ONCE — main probes once, and the
  // report says when. Null until the invoke answers, and the launcher and the
  // palette both render the null honestly rather than as "nothing found".
  const [envReport, setEnvReport] = useState<EnvReport | null>(null)
  // M181. A ref beside the state: `applyStarter` is installed once (the
  // palette memo captures it), so it must read the report at CALL time — a
  // closure over the null the first render held refused the starter for
  // "no engine" while the launcher beside it showed the primary enabled
  // (the journey check found it, one run in three).
  const envReportRef = useRef(envReport)
  envReportRef.current = envReport
  const recheckEnvironment = useCallback(async (): Promise<EnvReport> => {
    const report = await window.canvas.env.report(true)
    setEnvReport(report)
    return report
  }, [])
  useEffect(() => {
    let live = true
    void window.canvas.env.report().then((r) => { if (live) setEnvReport(r) }).catch(() => {})
    return () => { live = false }
  }, [])

  // M123. The launch-time update check — ONCE per launch, and only when the
  // setting says so. Read the way `agent.glow` and `vault.root` are (a
  // settings:list of its own, never settingRows, which is empty until the
  // palette has opened), and gated on the STORE rather than a ref: a second
  // mount of this component (a workspace switch does not remount, but a
  // reload does) finds the answer already there and asks nothing. Off by
  // default, so a fresh install never makes a network call it was not told
  // to; the by-hand row is the door for everyone else. The answer goes into
  // the store and nowhere else — the launcher and the environment rows read
  // it; no dialog, no badge: a notice, not an interruption.
  const updateState = useUpdateState()
  useEffect(() => {
    let live = true
    void window.canvas.settings.list().then((rows) => {
      if (!live) return
      const row = rows.find((r) => r.id === 'update.checkOnLaunch')
      if (row === undefined || row.value !== true) return
      if (getUpdateState().checking || getUpdateState().result !== null) return
      beginUpdateCheck()
      void window.canvas.update.check().then((result) => { setUpdateResult(result) })
        .catch((e: unknown) => { setUpdateResult({ kind: 'could-not-check', reason: e instanceof Error ? e.message : 'the update check did not answer' }) })
    }).catch(() => {})
    return () => { live = false }
  }, [])

  // M48: the gesture hints. `hints.seen` is read the way every other setting
  // is; a gesture is "seen" when the thing it moves has moved — the camera's
  // translation, its scale, the palette opening, the panel count growing —
  // and the id is written once. Never keyed on the event itself, which
  // would need a hook into every input path for a fact the state already
  // carries.
  const [hintsSeen, setHintsSeen] = useState<ReadonlySet<string>>(() => new Set())
  // Read by startFirstWork at press time, so the callback need not re-create on every hint.
  const hintsSeenRef = useRef(hintsSeen)
  hintsSeenRef.current = hintsSeen
  const hintsLoadedRef = useRef(false)
  // M173 (the Act III critic): a STATE beside the ref, so the banner and the rail's hints render only once `hints.seen` has been read — the banner painted and vanished on every launch when the backend probe answered first.
  const [hintsLoaded, setHintsLoaded] = useState(false)
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'hints.seen')
      if (row && Array.isArray(row.value)) setHintsSeen(new Set(row.value as string[]))
      hintsLoadedRef.current = true
      setHintsLoaded(true)
    })
  }, [settingRows])
  // M174. The launcher's recents row: asked once whenever the canvas is empty
  // (the only time the launcher shows), never polled.
  const [launcherRecents, setLauncherRecents] = useState<string[]>([])
  // M262. When each was last used — a SEPARATE read so an old main (no
  // handler) costs the times only, never the list.
  const [launcherRecentUsed, setLauncherRecentUsed] = useState<Record<string, number>>({})
  useEffect(() => {
    if (panels.length !== 0) return
    let live = true
    void window.canvas.spawn.recent().then((r) => { if (live) setLauncherRecents(r) }).catch(() => { if (live) setLauncherRecents([]) })
    void window.canvas.spawn.recentUsed().then((r) => { if (live) setLauncherRecentUsed(r) }).catch(() => { if (live) setLauncherRecentUsed({}) })
    return () => { live = false }
  }, [panels.length])
  // M262. `Blank canvas`: the person put the card away. Session-only and per
  // workspace-empty episode — the next time this canvas empties, the card is
  // back, because an empty canvas with no way to start is the state M48 fixed.
  const [launcherPutAway, setLauncherPutAway] = useState(false)
  useEffect(() => { if (panels.length !== 0) setLauncherPutAway(false) }, [panels.length])
  // Startup splash. Decided ONCE, from the layout as it was restored — the
  // ghost traces what you left, not what you did in the first 800 ms.
  const [splash, setSplash] = useState<SplashMode>(() => startup === undefined ? 'none' : splashMode({
    ...startup,
    reducedMotion: prefersReducedMotion(),
    playedThisSession: (() => { try { return window.sessionStorage.getItem(PLAYED_KEY) !== null } catch { return false } })(),
    merged: false,
    panelCount: initial.panels.length
  }))
  useEffect(() => {
    if (splash === 'none' || startup === undefined) return
    try {
      window.localStorage.setItem(LAST_VERSION_KEY, startup.version || 'unknown')
      window.sessionStorage.setItem(PLAYED_KEY, '1')
    } catch { /* storage unavailable: the splash may replay, nothing worse */ }
    // Mount-only by design: the write marks that a splash STARTED.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Entering the merged view ENDS the splash rather than hiding it: hidden,
  // leaving the view would remount it and replay the scene from zero.
  useEffect(() => { if (merged) setSplash('none') }, [merged])
  // M262. THE STARTER CLUSTER: a first start mints a card and its agent; for
  // one arrival they rise in turn and the camera frames them TOGETHER, so the
  // first thing a person sees is the pair, never one panel alone on a void.
  const [clusterArrival, setClusterArrival] = useState(false)
  // The first start's handoff hint: which conversation it reads, and whether
  // the sentence was sent (Start task) or only inserted (a conversation).
  // M310. `itemId` makes the hint the flagship guide: the task it follows.
  const [firstTask, setFirstTask] = useState<{ panelId: string; sent: boolean; itemId?: string } | null>(null)
  // M262. The gesture a person last reached for on the EMPTY canvas — read
  // by a passive capture listener that never prevents or stops anything, so
  // no gesture handler below it changes. Only a background target counts: a
  // drag inside a panel or the launcher is not a reach for the camera.
  const [attemptedHint, setAttemptedHint] = useState<HintId | null>(null)
  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const onInput = (e: Event): void => {
      if (panelsRef.current.length !== 0) return
      const target = e.target instanceof Element ? e.target : null
      if (e.type !== 'keydown' && (target === null || target.closest('.panel, .launcher, .palette, button, input, textarea, select') !== null)) return
      if (e.type === 'keydown' && document.activeElement !== null && document.activeElement !== document.body && document.activeElement !== host) return
      const attempt = attemptOf(e as unknown as Parameters<typeof attemptOf>[0])
      if (attempt !== null) setAttemptedHint(attempt)
    }
    const kinds = ['mousedown', 'wheel', 'dblclick'] as const
    for (const k of kinds) host.addEventListener(k, onInput, { capture: true, passive: true })
    window.addEventListener('keydown', onInput, { capture: true, passive: true })
    return () => {
      for (const k of kinds) host.removeEventListener(k, onInput, { capture: true })
      window.removeEventListener('keydown', onInput, { capture: true })
    }
  }, [hostRef])
  const markHint = useCallback((id: string) => {
    if (!hintsLoadedRef.current) return
    setHintsSeen((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev); next.add(id)
      void window.canvas.settings.set('hints.seen', [...next])
      return next
    })
  }, [])
  const hintBaseRef = useRef<{ x: number; y: number; scale: number; panels: number } | null>(null)
  useEffect(() => {
    const base = hintBaseRef.current
    if (!base) { hintBaseRef.current = { x: viewport.x, y: viewport.y, scale: viewport.scale, panels: panels.length }; return }
    if (viewport.x !== base.x || viewport.y !== base.y) markHint('pan')
    if (viewport.scale !== base.scale) markHint('zoom')
    if (panels.length > base.panels) markHint('new-panel')
    if (palette.open) markHint('palette')
  }, [viewport.x, viewport.y, viewport.scale, panels.length, palette.open, markHint])

  // M41: read the SAME way, for the handoff hook's "scrollback is off" skip —
  // a handoff whose source recorded nothing says a different sentence when the
  // reason is the setting than when the panel simply printed nothing.
  const [scrollbackPersist, setScrollbackPersist] = useState(true)
  const scrollbackPersistRef = useRef(scrollbackPersist)
  scrollbackPersistRef.current = scrollbackPersist
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'scrollback.persist')
      if (row) setScrollbackPersist(row.value === true)
    })
  }, [settingRows])

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
  canvasCoveredRef.current = chrome.centerView !== 'canvas'
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
    if (chrome.centerView !== 'canvas') {
      // Blurred HERE, explicitly, rather than trusting `inert` to do it: Chromium's
      // focus fixup for an inert subtree runs lazily at a later style pass, and until it
      // does the terminal's textarea still takes a real keystroke (orch-page.3).
      if (active instanceof HTMLElement && (host?.contains(active) === true || active.closest('.shell__rail, .shell__tree, .shell__inspector') !== null)) active.blur()
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
  }, [chrome.centerView])
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
  // M324. A TASK'S FOCUS VIEW — the third center page. It remembers the page it
  // was opened from (the canvas, or Orchestrate) so Back returns there; the
  // canvas's camera is never touched, so "there" is exactly where it was.
  // M325. `side` opens the task on the side that answers what it needs (a
  // failing check, the changes to review); absent, the task's remembered side.
  const [focusTask, setFocusTask] = useState<{ itemId: string; from: 'canvas' | 'orchestration'; side?: FocusSide; at: number } | null>(null)
  const openFocusTask = useCallback((itemId: string, side?: FocusSide): void => {
    setFocusTask((cur) => ({ itemId, from: centerViewNow === 'focus' ? (cur?.from ?? 'canvas') : centerViewNow === 'team' ? 'canvas' : centerViewNow, ...(side === undefined ? {} : { side }), at: Date.now() }))
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
    enabled: !palette.open && chrome.centerView === 'canvas'
  })
  // Publishes the predicate to the two consumers declared above it — see
  // navGridIsOpenRef's own comment. In an effect rather than a render-time
  // assignment because navGrid.isOpen is a stable useCallback: this runs once.
  useEffect(() => { navGridIsOpenRef.current = navGrid.isOpen }, [navGrid.isOpen])

  /**
   * A review node is minted from the SUBJECT's stored baseline, asked for
   * once here and then carried inside the node — see ReviewSubject. The
   * label is snapshotted through the same honest chain the rail row walks,
   * because the panel it names may be closed long before the node is.
   */
  const openReview = useCallback((subjectId: string) => {
    const subject = panelsRef.current.find((p) => p.rect.id === subjectId)
    // A review of a review is not a thing, and neither is a review of a file
    // panel: only a terminal panel ever had a session, and only a session ever
    // had a baseline. The id could only reach here from a row that should have
    // been gated.
    // M77: a chat panel has a baseline too (agent:create captures one).
    if (subject === undefined || !(isTerminalPanel(subject) || isChatPanel(subject))) return
    const label = railLabel(subject, isTerminalPanel(subject) ? registry.get(subjectId)?.status : undefined)
    void window.canvas.review.baseline(subjectId).then((baseline) => {
      // Null is reachable despite the row's gate: a panel can be killed
      // between the click and the reply, and main drops its baseline on
      // kill. Minting a node with no baseline would produce a panel that can
      // never answer anything.
      if (baseline === null) return
      // RE-READ, never the captured `subject`: the await is a real gap, and
      // it is not only "the panel got closed" (dispose drops the baseline
      // too, which the null check above already catches). A WORKSPACE
      // SWITCH landing in this gap replaces the whole `panels` array while
      // leaving the subject's session — and therefore its baseline —
      // perfectly intact (demote, not dispose), so `baseline` comes back
      // non-null for a panel that is no longer in THIS canvas. Using the
      // captured `subject.rect` would place the node by a rect that only
      // meant something in the workspace that is no longer on screen, and
      // the node would carry a subjectId nothing here answers to.
      const current = panelsRef.current.find((p) => p.rect.id === subjectId)
      if (current === undefined || !(isTerminalPanel(current) || isChatPanel(current))) return
      // `r`, from the SAME counter `n` comes from. PanelId doubles as a tmux
      // session name, so a review node minting an id a terminal panel in any
      // workspace already owns is M7's invisible collision through a new
      // door — the second panel to go live attaches to the first one's
      // session and the user simply sees one agent through two panels.
      const id = `r${nextIdRef.current++}`
      setPanels((existing) => {
        // cascadeCentre for the reason onSpawn uses it: opening two reviews
        // of one panel must not stack them byte-identically, which is a
        // canvas that looks like it holds one node while holding two.
        const centre = cascadeCentre(reviewCentre(current.rect), existing)
        const next = [
          ...existing,
          makeReviewPanel(id, centre, nextZ(existing), {
            subjectId,
            repoRoot: baseline.root,
            baselineSha: baseline.sha,
            label
          })
        ]
        commitHistory(next)
        return next
      })
      selectOnly(id)
    })
  }, [commitHistory])

  /**
   * M202 (D07). THE TASK REVIEW — the one implementation all four doors reach
   * (the card's verb, the palette row, `tc plan review-task` and an action
   * node), the way M197 made every Start work door land on one.
   *
   * It is deliberately NOT `openReviewAcross` with an extra field. That one
   * starts from the SUBJECT PANEL and asks main for its baseline, so it needs
   * the lane's conversation to still be open — and a task whose chat has been
   * closed is exactly the case this milestone exists for: the item keeps its
   * `panelId` and notes `lane closed`, and the work is still sitting in the
   * worktree. This one starts from the WORKTREE RECORD instead, which carries
   * the repository `root` and outlives the panel that made it (a worktree
   * record OUTLIVES its panel — M37's rule), so the review opens on a lane
   * whose agent was dismissed hours ago.
   *
   * Every refusal is BY NAME, because the card's button is always present.
   */
  const reviewTaskLane = useCallback((itemId: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    const item = workItemsRef.current.find((i) => i.id === itemId)
    if (item === undefined) return { kind: 'refused', reason: WORK_ITEM_GONE }
    if (item.worktreeId === undefined) return { kind: 'refused', reason: 'no lane yet — start work on this item first' }
    // The SAME records the card's readiness was judged against, read by the
    // handoff hook rather than by the palette's list — which loads only when
    // ⌘K opens, and would refuse this verb on a real lane until it did.
    const record = taskLaneOf(itemId)
    // The worktree was removed outside this app, or its record was pruned.
    // Never fall back to another root: reviewing a different repository under
    // this task's name is the substitution the guide forbids by name.
    if (record === undefined) return { kind: 'refused', reason: 'the worktree this task was started in is not listed any more — start work again to give it a fresh lane' }
    // M315. One review per task. A second press used to stack a second node
    // beside the first, off-screen, and the person saw nothing happen. The
    // existing one is brought into view instead — the press always LANDS.
    // A census node a canvas saved before M315 is REPLACED by the lane's own
    // review below rather than landed on — it cannot show the diff.
    const isLaneReview = (p: Panel): boolean => isReviewPanel(p) && p.subject.workItemId === itemId && p.subject.across !== true
    const already = panelsRef.current.find(isLaneReview)
    if (already !== undefined) { jumpToAttention(already.rect.id); return { kind: 'ran' } }
    const mint = (subject: ReviewSubject): void => {
      if (panelsRef.current.some(isLaneReview)) return
      const census = subject.across === true ? panelsRef.current.find((p) => isReviewPanel(p) && p.subject.workItemId === itemId) : undefined
      if (census !== undefined) { jumpToAttention(census.rect.id); return }
      const id = `r${nextIdRef.current++}`
      setPanels((current) => {
        const existing = subject.across === true ? current : current.filter((p) => !(isReviewPanel(p) && p.subject.workItemId === itemId))
        const anchorPanel = existing.find((p) => p.rect.id === item.panelId) ?? existing.find((p) => isWorkPanel(p) && p.work.itemId === itemId)
        const centre = cascadeCentre(anchorPanel === undefined ? { x: 0, y: 0 } : reviewCentre(anchorPanel.rect, TASK_REVIEW_SIZE.w, TASK_REVIEW_SIZE.h), existing)
        const next = [...existing, makeReviewPanel(id, centre, nextZ(existing), subject, TASK_REVIEW_SIZE)]
        commitHistory(next)
        return next
      })
      selectOnly(id)
      // The review opens where the person can SEE it: minted beside the
      // conversation it was otherwise placed off-screen with no camera move,
      // and the press looked like it did nothing. `pendingJumpRef` waits for
      // the panel to be rendered before framing it, and lands with the
      // arrival glow the attention jump already has.
      pendingJumpRef.current = id
    }
    const across: ReviewSubject = {
      subjectId: item.panelId ?? itemId,
      repoRoot: record.root,
      // Never sent to git: an across node asks `review:across` with its
      // root alone and each section compares against its own fork.
      baselineSha: ACROSS_BASELINE,
      label: item.title,
      across: true,
      workItemId: itemId
    }
    // M315. THE LANE, not the census. An across node lists every worktree of
    // the repository with no diff, no line comments and a blocked commit —
    // so the review a task's "Review changes" opened could not show what the
    // agent changed, and the comment loop the guide promised had no gutter to
    // start from. The lane's own section carries its fork point; a review of
    // the WORKTREE against that fork is an ordinary `review:at` node, the
    // most-exercised review there is. The census is the fallback only when
    // the fork cannot be read, never a silent substitute for another root.
    void window.canvas.review.across(record.root).then((answer) => {
      const section = answer.kind === 'across' ? answer.sections.find((s) => s.path === record.path || (s.path !== answer.root && s.panelId === record.panelId)) : undefined
      mint(section?.base === undefined
        ? across
        : { subjectId: item.panelId ?? itemId, repoRoot: section.path, baselineSha: section.base, label: item.title, workItemId: itemId })
    }).catch(() => mint(across))
    return { kind: 'ran' }
  }, [commitHistory, taskLaneOf, jumpToAttention])

  /**
   * M86. A review of EVERY worktree of the subject's repository: the same mint
   * as `openReview`, with the subject flagged `across`. The node asks for its
   * root's sections rather than one baseline, so a killed subject changes
   * nothing about what it shows — the whole reason the flag exists.
   */
  const openReviewAcross = useCallback((subjectId: string) => {
    const subject = panelsRef.current.find((p) => p.rect.id === subjectId)
    if (subject === undefined || !(isTerminalPanel(subject) || isChatPanel(subject))) return
    void window.canvas.review.baseline(subjectId).then((baseline) => {
      if (baseline === null) return
      const current = panelsRef.current.find((p) => p.rect.id === subjectId)
      if (current === undefined || !(isTerminalPanel(current) || isChatPanel(current))) return
      const id = `r${nextIdRef.current++}`
      setPanels((existing) => {
        const centre = cascadeCentre(reviewCentre(current.rect), existing)
        const next = [
          ...existing,
          makeReviewPanel(id, centre, nextZ(existing), { subjectId, repoRoot: baseline.root, baselineSha: baseline.sha, label: `every worktree of ${baseline.root.split('/').pop() ?? baseline.root}`, across: true })
        ]
        commitHistory(next)
        return next
      })
      selectOnly(id)
    })
  }, [commitHistory])

  /**
   * Put a file on the canvas, at a world point.
   *
   * Modelled on openReview, and it needs none of that function's await: the
   * path is already in hand, so there is no IPC gap for a workspace switch to
   * land in and nothing to re-read afterwards. The READ is the node's own
   * (FileNode's mount effect), which is what keeps "the renderer is showing
   * this file" and "main is watching it" one statement.
   */
  const openFilePanel = useCallback((path: string, centre: Point, opts?: { prose?: true; checklist?: ChecklistView; imported?: ImportedNote; sheet?: SheetView; deck?: DeckView; exact?: true }) => {
    // M245. A newly opened .csv/.tsv/.xlsx opens as a sheet. Only NEW opens:
    // a persisted file panel without the key stays the text view it was.
    const sheet = opts?.sheet ?? (opts?.prose !== true && opts?.checklist === undefined && opts?.deck === undefined && isSheetPath(path) ? {} : undefined)
    if (path === '') return
    // `f`, off the SAME counter as `n` and `r`. PanelId doubles as a tmux
    // session name and the global-uniqueness rule turns on nothing else being
    // able to mint a colliding one — see nextIdRef's own comment for the two
    // seed sites that keep this counter ahead of every persisted id.
    //
    // Minted OUTSIDE the updater, exactly as openReview mints its `r`: a
    // state updater must be pure, and `nextIdRef.current++` inside one is a
    // side effect StrictMode would run twice, burning an id per spawn.
    const id = `f${nextIdRef.current++}`
    setPanels((existing) => {
      // cascadeCentre for the reason onSpawn and openReview both use it:
      // opening the same file twice at an unmoved camera must not stack the
      // two byte-identically, which is a canvas that looks like it holds one
      // panel while holding two.
      const next = [
        ...existing,
        makeFilePanel(id, opts?.exact ? centre : cascadeCentre(centre, existing), nextZ(existing), {
          path,
          // Conditional, never `...opts`. A spread writes `prose: undefined`,
          // which `'prose' in source` reads as PRESENT — the absent-stays-
          // absent trap this field's own doc comment records. ONE mint
          // function for both, so a note and an opened file cannot drift
          // apart in id minting, cascading, z-order or selection.
          ...(opts?.prose === true ? { prose: true as const } : {}),
          ...(opts?.checklist === undefined ? {} : { checklist: opts.checklist }),
          ...(sheet === undefined ? {} : { sheet }),
          ...(opts?.imported === undefined ? {} : { imported: opts.imported }),
          ...(opts?.deck === undefined ? {} : { deck: opts.deck })
        })
      ]
      commitHistory(next)
      return next
    })
    // selectOnly, not setSelectedIds: a freshly opened file panel is the
    // whole selection, and this is the one helper that says so. See the
    // selectedIds note — the marquee made selection a SET, so every
    // single-panel selector goes through here.
    selectOnly(id)
  }, [commitHistory, selectOnly])
  // M149 (the Act II critic). A STABLE door for the memo'd toolbox nodes: a
  // fresh arrow per render defeated ToolboxNode's memo for every node.
  const openFileAtCentre = useCallback((path: string) => openFilePanel(path, worldCentre()), [openFilePanel, worldCentre])

  /**
   * Open a toolbox node for one panel's directory.
   *
   * Takes the cwd and a LABEL rather than a panel id, and that is the same
   * decision `openReview` makes for `ReviewSubject`: the node must keep
   * answering after the panel it was opened from is closed, so it snapshots
   * what it needs at mint time and holds no reference to the panel.
   */
  const openToolboxPanel = useCallback((cwd: string, label: string, centre: Point) => {
    if (cwd === '') return
    // `t`, off the SAME counter as `n`, `r`, `f` and `j`. Minted OUTSIDE the
    // updater for openFilePanel's stated reason: a state updater must be pure,
    // and `nextIdRef.current++` inside one is a side effect StrictMode would
    // run twice. See nextIdRef's two seed sites, both of which had to widen
    // their regex to `[nrfjt]` for this prefix — and which were already blind
    // to M19's own `j`.
    const id = `t${nextIdRef.current++}`
    setPanels((existing) => {
      const next = [
        ...existing,
        makeToolboxPanel(id, cascadeCentre(centre, existing), nextZ(existing), { cwd, label })
      ]
      commitHistory(next)
      return next
    })
    selectOnly(id)
  }, [commitHistory, selectOnly])

  /**
   * The drop door, on the .canvas host.
   *
   * preventDefault on dragover is REQUIRED, not defensive: without it the
   * browser's default action for a dropped file is to NAVIGATE to it, which
   * destroys the app's own page — every panel, every camera, the whole
   * renderer — and looks like a crash rather than like a missing handler.
   *
   * Known, currently-unaddressed edge case: these handlers are on `.canvas`,
   * and both the palette and the nav grid mount as children of it too — so a
   * drop while either overlay is open mints a file panel underneath it,
   * unseen until the overlay closes. Worth a note, not a fix.
   */
  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }, [])
  /**
   * M59. ONE function behind the real drop and the __m59Drop hook, so a check
   * through the hook is evidence about the door a user reaches. Three
   * answers, each the audit's: a drop while the palette or the nav grid is
   * open is IGNORED (it used to mint a file panel unseen underneath the
   * overlay); a drop OVER a live terminal panel PASTES the path into it —
   * bracketed, shell-quoted, the same door Jira context and the file tree
   * use, because a file dragged onto an agent's terminal means "give this to
   * the agent"; anywhere else opens a file panel at the drop's own world
   * point, as before.
   */
  // M75. A path relative to a chat's directory, when it is inside it.
  const relativeTo = (cwd: string, path: string): string => {
    const base = cwd.replace(/\/+$/, '')
    return path.startsWith(base + '/') ? path.slice(base.length + 1) : path
  }
  const addImageRef = useRef<((path: string, world?: Point) => Promise<unknown>) | null>(null)
  const importDocxRef = useRef<((path: string, world?: Point) => Promise<unknown>) | null>(null)
  const dropPath = useCallback((path: string, screen: Point): 'ignored' | 'pasted' | 'opened' => {
    if (palette.isOpen() || navGridIsOpenRef.current()) return 'ignored'
    const world = screenToWorld(screen, viewportRef.current)
    const hit = hitTest(hitOrderRef.current, world)
    if (hit !== null) {
      const target = panelsRef.current.find((p) => p.rect.id === hit)
      const session = registry.get(hit)
      if (target !== undefined && target.kind === 'terminal' && session !== undefined && session.spawned) {
        session.handle.paste(shellQuote(path))
        return 'pasted'
      }
      // M75. A drop on a chat panel: an image becomes an attachment on the
      // next message, anything else a `@` reference relative to the panel's
      // directory — the composer's own verbs, never a file panel.
      if (target !== undefined && isChatPanel(target)) {
        if (attachmentKind(path) === 'image') attachToComposer(hit, { kind: 'path', path })
        else insertIntoComposer(hit, `@${relativeTo(target.chat.cwd, path)} `)
        return 'pasted'
      }
    }
    // M186. A PICTURE dropped on nothing becomes a picture. The agent targets
    // above are untouched — a drop on a chat is still an attachment and a drop
    // on a terminal is still a shell-quoted path — because this is the arm for
    // a gesture that landed on the canvas itself, which had no arm at all.
    // Through a REF: `addImageFromPath` is declared with the other media
    // verbs further down, and naming a `const` from a hook's dependency list
    // above its declaration is a TDZ error rather than a style preference
    // (the same reason `openFilePanel`'s own test hook sits in its own effect).
    if (attachmentKind(path) === 'image') {
      void addImageRef.current?.(path, world)
      return 'opened'
    }
    // M250. A WORD DOCUMENT dropped on nothing becomes a note — the canvas
    // door of `import-docx`, through a ref for addImageRef's TDZ reason. A
    // .docx opened as a file panel would be a "binary" arm nobody can use.
    if (/\.docx$/i.test(path)) {
      void importDocxRef.current?.(path, world)
      return 'opened'
    }
    openFilePanel(path, world)
    return 'opened'
  }, [openFilePanel, palette, registry])
  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    // M127. The Skills pane's OWN MIME, read here and nowhere else — M114's
    // rule for the board's drops. A card dropped on the canvas opens the
    // skill's panel at the drop point, through the ONE door
    // `openSkillPanel`; the `skill` panel kind is M128's, so today that door
    // records the request and opens nothing. Checked BEFORE the file arm,
    // because a drag with no files would otherwise fall out of it silently.
    // M59's guard, hoisted ABOVE the skill arm: a drop while the palette or
    // the nav grid owns the keyboard opens NOTHING. The skill arm returned
    // before ever reaching it, so a card dropped under an open overlay minted
    // a panel the user could not see — the same defect the file arm's own
    // comment already records.
    if (palette.isOpen() || navGridIsOpenRef.current()) return
    const skill = event.dataTransfer.getData(SKILL_CARD_MIME)
    if (skill !== '') {
      const parsed = parseSkillKey(skill)
      if (parsed !== null) {
        const box = event.currentTarget.getBoundingClientRect()
        const world = screenToWorld({ x: event.clientX - box.left, y: event.clientY - box.top }, viewportRef.current)
        paletteActionsRef.current?.openSkillPanel(parsed.scope, parsed.name, world)
      }
      return
    }
    // One file. A multi-file drop opening N panels at once is a decision to
    // ask for rather than to acquire as a side effect of a gesture.
    const file = event.dataTransfer.files[0]
    if (file === undefined) return
    // Electron 43 REMOVED File.path from the renderer. Reading `file.path`
    // yields undefined, the mint is skipped, and the drop looks like it did
    // nothing at all — with no error, because undefined is a perfectly
    // ordinary value for a property that does not exist. webUtils.getPathForFile,
    // behind the bridge, is the supported replacement.
    const path = window.canvas.file.pathForFile(file)
    if (!path) return
    const host = event.currentTarget.getBoundingClientRect()
    // The DROP's own screen point, so the panel lands under the cursor at
    // every zoom rather than where the cursor would have been at 1:1.
    dropPath(path, { x: event.clientX - host.left, y: event.clientY - host.top })
    // M137. `palette.isOpen()` is read through a stable ref, so `dropPath` is
    // the one dependency; if the palette ever becomes a value, it joins this list.
  }, [dropPath])

  /**
   * verify:panels' route into the file-panel gesture, the same reason every
   * other window hook in this file exists: main's open dialog is native and a
   * real drop cannot be synthesised, so executeJavaScript has no other way in.
   *
   * It drives openFilePanel — the SAME function the palette row and the drop
   * handler both call — rather than reaching for setPanels itself, so a check
   * that passes through it is evidence about production code rather than about
   * a second mint path that only the suite can reach.
   *
   * Its own effect rather than a member of the __m4a* block above, and that is
   * forced rather than tidy: this effect's dependency list is evaluated during
   * render at the line it sits on, and openFilePanel is a `const` declared
   * further down — naming it up there is a TDZ error, not a style preference.
   */
  // M73. Assigned below, after beginNewChat is declared; read by the test hook.
  const beginNewChatRef = useRef<(opts?: { cwd?: string; title?: string; agentOptions?: AgentOptions; appendSystemPrompt?: string; message?: string; backend?: AgentBackend; teammateId?: string; sandbox?: true; routine?: true }) => Promise<SpawnResult>>(
    async () => ({ kind: 'refused', reason: 'the canvas is not ready' })
  )
  const openAsChatRef = useRef<(id: string) => Promise<{ kind: string; reason?: string }>>(async () => ({ kind: 'refused', reason: 'not ready' }))
  const openInTerminalRef = useRef<(id: string) => { kind: string; reason?: string }>(() => ({ kind: 'refused', reason: 'not ready' }))
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__m13Open = (path: string): void => openFilePanel(path, worldCentre())
    // M283. What a return from Orchestrate would hand the keyboard back to (orch-page.4).
    w.__m283HostFocus = (): string | null => { const el = lastHostFocusRef.current; return el === null ? null : `${el.tagName}.${String(el.className).split(' ')[0]}${el.isConnected ? '' : ' (gone)'}` }
    // M113/M114. The board's doors for verify:panels — the SAME verbs the
    // palette rows and the card call, through the palette ref.
    // M182. The binding's Update, through the same member the text mode's submit calls.
    w.__m182Update = (ids: string[]): Promise<{ kind: string; reason?: string; note?: string }> => paletteActionsRef.current?.updateBoundTemplate(ids) ?? Promise.resolve({ kind: 'refused', reason: 'not ready' })
    w.__m113 = {
      add: (item: Omit<PersistedWorkItem, 'id' | 'createdAt' | 'updatedAt' | 'state'> & { state?: PersistedWorkItem['state'] }): string | null =>
        paletteActionsRef.current?.addWorkItem({ ...item, state: item.state ?? (WORK_ITEM_STATES[0] as PersistedWorkItem['state']) }) ?? null,
      dispatch: (itemId: string, teammateId: string, root?: string): Promise<StartWorkOutcome> =>
        paletteActionsRef.current?.dispatchWorkItem(itemId, teammateId, root) ?? Promise.resolve({ kind: 'refused', reason: 'not ready' }),
      // M197. The START door, through the SAME action every real door takes —
      // the hook proves the real path rather than a parallel one, the rule
      // __m13Open established.
      start: (opts?: { itemId?: string; teammateId?: string; title?: string }): void => paletteActionsRef.current?.beginStartWork(opts),
      items: (): PersistedWorkItem[] => workItemsRef.current,
      close: (id: string): void => onClosePanel(id),
      show: (itemId: string): void => spawnWorkCard(itemId),
      done: (itemId: string): void => paletteActionsRef.current?.markDone(itemId)
    }
    // M233. The flow door, for the shot harness and the panels suite.
    //
    // It calls the SAME store functions useHandoff calls — noteEdgeFired,
    // noteEdgeArrived, noteEdgeWaiting — rather than reaching into the
    // layer or setting an attribute, which is the rule __m13Open and
    // __m59Drop already obey: a hook that reconstructs the behaviour proves
    // the reconstruction, not the app. A scene painted through this is
    // therefore a scene of the real grammar with only the TRIGGER faked.
    //
    // A state with no golden is a state no critic ever sees, and `firing`
    // and `waiting` cannot be reached from a fixture without a real agent
    // exiting on cue — which is the whole reason this exists.
    w.__m233Flow = (op: string, from: string, to: string, owed?: string[]): void => {
      if (op === 'fired') noteEdgeFired(from, to)
      else if (op === 'arrived') noteEdgeArrived(from, to)
      else if (op === 'waiting') noteEdgeWaiting(to, owed ?? [])
      else if (op === 'thaw') freezeEdgeClock(null)
    }
    // A read-only window onto the store, so a scene or a check can say WHY a
    // state did not render instead of guessing from an absent attribute.
    w.__m233Dump = (): string => JSON.stringify([...activityNow()])
    // The clock freeze, so a golden of a moving packet is not a flaky golden.
    // See freezeEdgeClock: it fakes WHEN it is and nothing else — the real
    // reducer computes the real t and the real bez() places the real dot.
    w.__m233Freeze = (at: number): void => freezeEdgeClock(at)
    // M59. The drop door, by screen point — see dropPath.
    // M91. The hook takes CLIENT coordinates (what a check reads off a rect)
    // and subtracts the host's origin, exactly as the real onDrop does — the
    // first version handed them to dropPath raw, which is host-relative, and
    // an error the size of the shell's left columns went unseen while the
    // rail was 260px (the slot's centre still fell inside the panel).
    w.__m59Drop = (path: string, x: number, y: number): string => {
      const bounds = hostRef.current?.getBoundingClientRect()
      return dropPath(path, { x: x - (bounds?.left ?? 0), y: y - (bounds?.top ?? 0) })
    }
    // M21's mint, through the SAME openToolboxPanel the inspector button and
    // the palette row both call — so the hook proves the real path rather than
    // a parallel one, the rule __m13Open already obeys.
    w.__m20Toolbox = (cwd: string, label: string): void =>
      openToolboxPanel(cwd, label, worldCentre())
    // M276. The file editor's door, for the checks that used to type by
    // calling the native textarea value setter — Monaco has no such surface.
    // It executes a REAL edit on the REAL model, so the change event React
    // listens to fires exactly as it does under a keystroke: the rule
    // __m13Open established, applied to a widget instead of a verb. The
    // refused alternative (a hidden mirror textarea, so those checks passed
    // untouched) is written up in monaco.ts.
    w.__m276Type = (node: Element | null, text: string): boolean => typeIntoEditor(node, text)
    w.__m276Text = (node: Element | null): string | null => editorText(node)
    w.__m276Focus = (node: Element | null): boolean => focusEditor(node)
    // M24's mint, through the SAME openJiraPanel the palette row calls — so
    // the hook proves the real gesture rather than a parallel mint, the rule
    // __m13Open and __m20Toolbox already obey.
    w.__m24Jira = (): void => openJiraPanel()
    // M73's mint, through the SAME beginNewChat the palette row, the launcher
    // line and the sheet call — read through a ref because beginNewChat is
    // declared below this block (it needs selectOnly), the create-above /
    // assign-below shape this file already uses. Resolves main's answer, so a
    // check can read a refusal by name.
    w.__m73Chat = (cwd: string): Promise<{ kind: string; reason?: string }> => beginNewChatRef.current({ cwd })
    // M81. The supervisor the sheet's row makes, and whether a second is offered.
    w.__m81Supervisor = async (cwd?: string): Promise<boolean> => {
      const result = await beginNewChatRef.current({ ...(cwd === undefined ? {} : { cwd }), title: 'supervisor', appendSystemPrompt: SUPERVISOR_PROMPT, message: 'What is this canvas doing?' })
      return result.kind === 'spawned'
    }
    w.__m81SupervisorOffered = (): boolean => !panelsRef.current.some((p) => isChatPanel(p) && p.chat.supervisor === true)
    // M287. A watcher panel, minted the way the palette's `watch` verb mints
    // one (makeWatcherPanel + commitHistory + selectOnly); the node registers
    // itself with main on mount, so a check can then `watcher.run` it and read
    // a REAL run's outcome and stamp in the workbench. The trigger is a timer
    // an hour out — the check runs it by hand.
    w.__m287Watcher = (cwd: string, command: string, args: string[]): string => {
      const watcherId = `w${nextIdRef.current++}`
      const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
      setPanels((current) => {
        const next = [...current, makeWatcherPanel(watcherId, cascadeCentre(centre, current), nextZ(current), { cwd, command, args, trigger: { kind: 'timer', everyMs: 3600000 } })]
        commitHistory(next)
        return next
      })
      selectOnly(watcherId)
      return watcherId
    }
    // M74's two verbs, through the same functions the palette rows, the
    // action bar and the chrome buttons call.
    w.__m74OpenAsChat = (id: string): Promise<{ kind: string; reason?: string }> => openAsChatRef.current(id)
    w.__m74OpenInTerminal = (id: string): { kind: string; reason?: string } => openInTerminalRef.current(id)
  }, [openFilePanel, worldCentre, openJiraPanel, dropPath])

  /**
   * A node committed. Advance ITS OWN stored baseline to the commit it just
   * made, and nothing else.
   *
   * Without this the node reports the same files after a commit as before it,
   * permanently: it diffs the working tree against its baseline, and
   * committing does not change the working tree. A second press would then
   * re-commit content that is already in history.
   *
   * The SUBJECT PANEL's baseline in main is deliberately left alone. A node
   * can outlive its subject, so reaching into that panel's state is only
   * sometimes possible at all — and a write verb on one panel silently
   * resetting another surface's reading is the wrong direction.
   *
   * NO history entry. Cmd+Z cannot undo a commit, and an undo that restored
   * the old baseline would put the node back to reporting work that is now in
   * history — an undo stack that lies about what it can reverse is worse than
   * one that declines. The panel array still changes, so the existing
   * layout.save effect persists the new sha with no extra plumbing.
   */
  const onReviewCommitted = useCallback((nodeId: string, sha: string) => {
    if (sha === '') return
    setPanels((existing) => existing.map((p) =>
      p.rect.id === nodeId && isReviewPanel(p)
        ? { ...p, subject: { ...p.subject, baselineSha: sha } }
        : p))
  }, [])

  /**
   * The restart sequence, shared by `restartPanel` and `restartPanelWithMode`
   * so the two can never drift.
   *
   * `nextSpec` is what the panel should come back as. `restartPanel` passes
   * the spec unchanged; `restartPanelWithMode` passes one carrying a new
   * permission mode, which is the ONLY way a knob ever changes on a live
   * panel — see restartPanelWithMode's own comment for why a bare edit is
   * unsound.
   *
   * Every ordering note on the old restartPanel still applies verbatim and is
   * left where it was; this function is that body with one parameter added.
   */
  const restartWithSpec = useCallback(
    (id: string, nextSpec: PanelSpecTemplate) => {
      if (!isRestartable(registry.get(id)?.status)) return
      clearAgentState(id)
      forgetEdgesFor(id); forgetAgentLinksFor(id)
      clearLastLine(id)
      clearLastActive(id)
      clearLiveSession(id)
      clearSubagents(id)
      clearTrail(id)
      clearUsage(id)
      clearMachineCost(id)
      clearScrollbackTail(id)
      void registry.dispose(id).then(() => {
        // RE-CHECKED, never captured: the await is a real gap and the panel
        // can be closed inside it.
        if (!panelsRef.current.some((p) => p.rect.id === id)) return
        registry.ensure(id, nextSpec, { dormant: false })
        registry.touch(id)
        registry.bumpVersion()
      })
    },
    [registry]
  )

  // #24: functional links run from the registry's post-status exit hook, not
  // from a second raw IPC listener. A dormant or absent target is RECORDED as
  // skipped and never woken: an automation may restart an already-running
  // terminal, but it must not create an agent the user did not explicitly
  // start. The rule graph is cycle-free at creation and load, so one exit can
  // cascade only along a finite directed chain.
  const [automationResult, setAutomationResult] = useState<Map<string, string>>(() => new Map())
  /**
   * M301, closing Phase C's deferred item. This map is IN MEMORY, so after a
   * relaunch a handoff that fired — or was skipped, or was refused — read
   * `unknown`/`pending` in the dependency lens until the edge happened to fire
   * again. The only record of it was this Map, and the Map does not survive
   * quitting.
   *
   * It does now: M300 writes a durable row at `setHandoffResult`, the one
   * funnel every outcome passes through, with the link's own `from:to` key. On
   * mount the record is read ONCE and the newest row per key seeds the map, so
   * the lens opens on what actually happened rather than on silence.
   *
   * SEEDING, not authority: a row only fills a key this run has not written,
   * so a live outcome always wins over a remembered one. And a failed read
   * seeds nothing — the lens then says `unknown`, which is true, rather than
   * inheriting a stale sentence.
   */
  useEffect(() => {
    if (typeof window.canvas?.ledger?.timeline !== 'function') return
    let live = true
    void window.canvas.ledger.timeline({}, 200).then(
      (read) => {
        if (!live) return
        const seed = new Map<string, string>()
        for (const e of read.entries) {
          if (e.kind !== 'event' || e.row.event !== 'handoff') continue
          const key = e.row.key
          // Newest first, so the first row for a key is its latest outcome.
          // Belt and braces with the write-side filter above: a row an older
          // build may already have left on disk is not restored either.
          if (key !== undefined && e.row.detail !== undefined && isSettledHandoff(e.row.detail) && !seed.has(key)) seed.set(key, e.row.detail)
        }
        if (seed.size === 0) return
        setAutomationResult((current) => {
          const next = new Map(current)
          for (const [k, v] of seed) if (!next.has(k)) next.set(k, v)
          return next
        })
      },
      () => { /* a read that failed seeds nothing; `unknown` is the honest word */ }
    )
    return () => { live = false }
  }, [])
  const automationRowsBuilt: AutomationRow[] = panels.flatMap((source) => linksOf(source)
    .filter((link) => link.automation !== undefined)
    .map((link) => {
      const target = panels.find((panel) => panel.rect.id === link.to)
      return target === undefined ? null : {
        from: source.rect.id,
        to: target.rect.id,
        source: railLabel(source, undefined),
        target: railLabel(target, undefined),
        enabled: link.automation!.enabled,
        automation: link.automation!,
        sentence: describeAutomation(link.automation!)
      }
    })
    .filter((row): row is AutomationRow => row !== null))
  const automationRowsSignature = JSON.stringify(automationRowsBuilt)
  const automationRows = useMemo(() => automationRowsBuilt, [automationRowsSignature])
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
  const [runAgainResult, setRunAgainResult] = useState<{ id: string; sentence: string } | null>(null)
  useEffect(() => { forgetOpenRunsRef.current = runsApi.forgetOpen }, [runsApi])
  // M172. The `N live / N quiet` capsules left the dock (the metrics rule); the
  // rail's `Agents · N` heading carries the count. `railCapsules` stays a pure
  // export for `verify:rail lastline.1`.
  // M105. A chat's turn end sets its LAST LINE SAID and, when the user was
  // elsewhere, the unread mark — per id, in its own store, never on version().
  useEffect(() => onChatTurnEnd((id) => { setLastLine(id, lastLineOf(lastAssistantText(id)), focusedIdRef.current !== id) }), [])
  // M105. After a relaunch the row still says what its chat said last — read,
  // never unread: a restored answer was read in its earlier life.
  useEffect(() => onChatSeeded((id) => { if (getLastLine(id).line !== '') return; const line = lastLineOf(lastAssistantText(id)); if (line !== '') setLastLine(id, line, false) }), [])
  // M97. An auto run is a run: the store's auto bus feeds the recorder.
  useEffect(() => onChatAuto((id, status) => runsApi.onAutoEvent(id, status)), [runsApi])
  const anyOpen = runs.some((r) => r.endedAt === undefined)
  useEffect(() => {
    if (!anyOpen) return
    const timer = setInterval(() => setRunTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [anyOpen])
  const onRunAgain = useCallback((id: string) => { setRunAgainResult({ id, sentence: runsApi.runAgain(id, runsRef.current) }) }, [runsApi])
  const terminalIdSet = useMemo(() => new Set(panels.filter(isTerminalPanel).map((p) => p.rect.id)), [panels])
  const runRowsBuilt = useMemo(() => buildRunRows(runs, terminalIdSet, Date.now()), [runs, terminalIdSet, runTick])
  const runRowsSig = runSignature(runRowsBuilt) + (runAgainResult === null ? '' : `|${runAgainResult.id}:${runAgainResult.sentence}`)
  const railRuns = useMemo(() => runRowsBuilt.map((r) => (runAgainResult !== null && runAgainResult.id === r.id ? { ...r, note: runAgainResult.sentence } : r)), [runRowsSig])
  // The run FRAMES: the newest run per set of panels, as read-only group frames,
  // derived every render and never persisted as groups.
  const runFrames = useMemo<CanvasGroup[]>(() => {
    const seen = new Set<string>()
    const out: CanvasGroup[] = []
    for (const run of runs) {
      const key = [...run.panelIds].sort().join(',')
      if (seen.has(key)) continue
      seen.add(key)
      const members = run.panelIds.filter((id) => panels.some((p) => p.rect.id === id))
      if (members.length === 0) continue
      out.push({ id: `run:${run.id}`, label: run.name, colour: 'blue', panelIds: members })
    }
    return out
  }, [runs, panels])
  const panelRun = useMemo(() => {
    if (selectedId === null) return null
    const run = runs.find((r) => r.panelIds.includes(selectedId))
    if (!run) return null
    const row = runRowsBuilt.find((r) => r.id === run.id)
    return row === undefined ? null : { id: run.id, name: run.name, facts: row.facts, outcome: row.outcome, tone: row.tone, runAgain: row.runAgain }
  }, [runs, selectedId, runRowsSig])

  const onSetRestartOnExit = useCallback((from: string, to: string, enabled: boolean) => {
    setPanels((current) => {
      const next = setRestartOnExit(current, from, to, enabled)
      if (next === current) return current
      commitHistory(next)
      return next
    })
    if (!enabled) setAutomationResult((current) => {
      const next = new Map(current)
      next.delete(`${from}:${to}`)
      return next
    })
  }, [commitHistory])

  // M41: the one-rule-per-link mutator, the handoff control's verb. Same
  // shape as onSetRestartOnExit above, which is now a thin call into it.
  const onSetLinkAutomation = useCallback((from: string, to: string, automation: LinkAutomation) => {
    setPanels((current) => {
      const next = setLinkAutomation(current, from, to, automation)
      if (next === current) return current
      commitHistory(next)
      return next
    })
    if (!automation.enabled) setAutomationResult((current) => {
      const next = new Map(current)
      next.delete(`${from}:${to}`)
      return next
    })
  }, [commitHistory])

  // Palette actions. Everything the palette can do that needs the registry,
  // the camera, or IPC lives here — buildCommands takes callbacks precisely so
  // none of that reaches the pure layer.
  /**
   * M27. Create a note and open it, ready to write in.
   *
   * Two steps rather than one, and the prompt is the palette's own input mode
   * rather than a dialog — the machinery M5a's preset editing was deferred
   * over ("a modal would fight xterm for keyboard focus") and which every
   * rename, delete and confirm in this app already reuses, so a note prompt
   * inherits all four of usePalette's focus rules for free.
   *
   * The root is read from the ref at CALL time rather than closed over: the
   * user may select a different panel between opening the palette and running
   * the row, and a note belongs to the project they are looking at NOW.
   *
   * `exists` RE-PROMPTS with feedback rather than opening the existing file.
   * "Create" and "open" are different acts, and silently turning one into the
   * other is how a user ends up appending to a file they thought was new —
   * with the existing bytes untouched either way, since main refuses at the
   * `wx` flag rather than after a check.
   */
  // M73. Keep main told about every chat panel on this canvas; disposal is
  // explicit at the removing sites (see useChatSessions).
  // M84. One module-level subscription to watcher:state, installed once.
  useWatchers()
  useChatSessions(panels)
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
    const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
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

  // M92. Lock, pin and maximise are LAYOUT facts, each one history entry.
  // Absent stays absent: the field is deleted, never set to undefined, so the
  // record on disk has no key. Maximise stores the rect to go back to; the
  // first drag or resize clears the mark (usePanelDrag's onDrag), since the
  // restore rect would lie once the user moved it.
  const setPanelFlag = useCallback((id: string, patch: (panel: Panel) => Panel | null): void => {
    if (mergedRef.current) return
    setPanels((current) => {
      const panel = current.find((p) => p.rect.id === id)
      if (!panel) return current
      const next = patch(panel)
      if (next === null) return current
      const out = current.map((p) => (p === panel ? next : p))
      commitHistory(out)
      return out
    })
  }, [commitHistory])
  const strip = (panel: Panel, key: 'locked' | 'pinned' | 'maximised' | 'skillTrail'): Panel => {
    const { [key]: _gone, ...rest } = panel
    return rest as Panel
  }
  const lockPanel = useCallback((id: string) => setPanelFlag(id, (p) => (p.locked === true ? null : { ...p, locked: true })), [setPanelFlag])
  const unlockPanel = useCallback((id: string) => setPanelFlag(id, (p) => (p.locked === true ? strip(p, 'locked') : null)), [setPanelFlag])
  const pinPanel = useCallback((id: string) => setPanelFlag(id, (p) => (pinRefusal(p.kind, p.pinned === true, pinCount(panelsRef.current)) !== undefined ? null : { ...p, pinned: true })), [setPanelFlag])
  const unpinPanel = useCallback((id: string) => setPanelFlag(id, (p) => (p.pinned === true ? strip(p, 'pinned') : null)), [setPanelFlag])
  const maximisePanel = useCallback((id: string) => {
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    // M315. Fill view is for READING, so it fills at 100%. Computed against the
    // camera as it stood, a Fill view from a zoomed-out canvas (43% after Fit
    // all) filled the window with 43%-size text. The camera goes to 100% with
    // the world point under the canvas centre held still, and the rect is
    // sized for THAT camera; within 2% of 100% nothing moves.
    const now = viewportRef.current
    const target = Math.abs(now.scale - 1) <= 0.02 ? now : (() => {
      const cx = bounds.width / 2
      const cy = bounds.height / 2
      const wx = (cx - now.x) / now.scale
      const wy = (cy - now.y) / now.scale
      return { x: cx - wx, y: cy - wy, scale: 1 }
    })()
    // Always: at 100% already, this still stops a flight in progress — the rect
    // below is sized for THIS camera, and a camera still moving would carry it off.
    goToViewport(target)
    const rect = maximiseRect(target, { width: bounds.width, height: bounds.height }, MAXIMISE_MARGIN)
    // The raise rides the same patch (one history entry, one setState).
    setPanelFlag(id, (p) => (p.maximised !== undefined ? null : { ...p, maximised: { restore: p.rect }, rect: { ...rect, id }, z: nextZ(panelsRef.current) }))
  }, [setPanelFlag, goToViewport])
  const restorePanel = useCallback((id: string) => setPanelFlag(id, (p) => (p.maximised === undefined ? null : { ...strip(p, 'maximised'), rect: p.maximised.restore })), [setPanelFlag])
  // M130. The fourth layout mark, through the same one-history-entry door the
  // other three take. Absent stays absent: expanding DELETES the key rather
  // than writing `skillTrail: undefined`, which survives IPC and reads as
  // present on the next parse.
  const toggleSkillTrail = useCallback((id: string) => setPanelFlag(id, (p) => (
    p.skillTrail === 'collapsed' ? strip(p, 'skillTrail') : { ...p, skillTrail: 'collapsed' as const }
  )), [setPanelFlag])

  // Frozen on a SIGNATURE of the marks, not on `panels`: a drag rebuilds the
  // array at 60Hz, and a context value that changed with it would re-render
  // every frame consuming it (the rail's own freeze, applied here).
  // M203/M204 (D08). EVERY TASK'S MEMBERS, built ONE way for the three verbs,
  // the lens and the ⋯ menu — derived from what the canvas already holds and
  // never stored. A plain function, not a hook: each caller passes the panels
  // it means (the DISPLAYED ones) and reads it at its own moment.
  const taskMemberships = (shown: readonly Panel[], items: readonly PersistedWorkItem[]): TaskMembership[] => {
    const cwdOf = (id: string): string | undefined => {
      const live = getLiveSession(id)?.cwd
      if (live !== undefined) return live
      const p = shown.find((q) => q.rect.id === id)
      if (p !== undefined && isChatPanel(p)) return p.chat.cwd
      // The panel's OWN spec, never only the registry: a restored terminal is
      // DORMANT (no session, no PTY) until touched, and reading the registry
      // alone dropped every sleeping terminal in the lane out of its task —
      // `task.show.1` found it on its first real press.
      if (p !== undefined && isTerminalPanel(p)) return p.spec.cwd
      return registry.get(id)?.spec.cwd
    }
    // The LANE comes from the handoff hook's records, never from
    // `worktreeRows`: the palette's list loads only when ⌘K opens, so reading
    // it made a task's in-lane panels vanish until somebody had opened the
    // palette (task.show.1's second run) — the trap M202's `reviewTaskLane`
    // already names. The origin panel id rides the SAME record (M204's
    // critic: read from the palette's list, a gone origin could not be
    // reported until ⌘K had opened, and a fallback of '' reported a panel
    // with no id as gone).
    const memberships = items.map((item) => {
      const lane = taskLaneOf(item.id)
      return taskMembership({ item, panels: shown, cwdOf, runs, ...(lane === undefined ? {} : { lane: { path: lane.path, panelId: lane.panelId } }) })
    })
    return memberships
  }
  // Presence: this window's cursor, viewport, selection and mode, to main at
  // 15Hz for the active workspace's awareness (renderer/presence/). It creates
  // no ref any earlier hook depends on. It sits AFTER taskMemberships, which
  // presenceTask calls during render: placed beside activeWorkspaceId it read
  // that const inside its temporal dead zone, and the canvas threw
  // `Cannot access 'taskMemberships' before initialization` on the first
  // render with a focused panel (verify:panels:core 6 found it).
  // The task for the Team view's tile: the focused panel's task, else the one
  // in progress — the same "focused" pick Orchestrate's taskMemberIds makes.
  const presenceTask = useMemo(() => {
    const own = focusedId === null ? undefined : taskMemberships(panels, workItems).find((m) => m.members.some((x) => x.panelId === focusedId))
    const item = (own === undefined ? undefined : workItems.find((w) => w.id === own.itemId))
      ?? workItems.find((w) => w.state === WORK_ITEM_STATES[1])
    return item?.title ?? ''
  }, [focusedId, panels, workItems])
  usePresenceReport({
    hostRef, workspaceId: activeWorkspaceId, viewport, focusedId, selectedIds: selectedPanelIds,
    mode: annotating ? 'annotate' : merged ? 'merged' : chrome.centerView,
    currentTask: presenceTask
  })
  // M303 (Quiet instrument). The hulls are computed at EVERY tier now: far
  // out they are M270's filled silhouettes; nearer in, the task ones are
  // drawn as quiet dashed regions (TaskClusterLayer's `region`), so a task
  // reads as one place on the canvas at the distance you work at. Groups are
  // left out near in — GroupLayer already frames them there.
  const clusterHulls = useMemo(() => {
    return taskClusters({
      panels: displayPanels.map((p) => ({
        id: p.rect.id,
        rect: p.rect,
        tone: panelState(
          { kind: p.kind, status: isTerminalPanel(p) ? registry.get(p.rect.id)?.status : undefined, dormant: dormantIds.has(p.rect.id) },
          getAgentState(p.rect.id)
        ).tone
      })),
      memberships: taskMemberships(displayPanels, workItems),
      titles: Object.fromEntries(workItems.map((i) => [i.id, i.title])),
      groups: groups.map((g) => ({ id: g.id, title: g.label, panelIds: g.panelIds }))
    })
  }, [cardDetail, displayPanels, workItems, groups, dormantIds, version, runs, taskLaneOf])
  // M204 (D08). THE TASK LENS — a VIEW state, never persisted (M106's flip is
  // the precedent). Derived as the task's panels change, and cleared when the
  // task leaves the board — which includes switching to a workspace whose
  // board does not hold it, since Canvas is not remounted per workspace.
  const [relatedItemId, setRelatedItemId] = useState<string | null>(null)
  // #10. The collapsed resume line lives exactly as long as the lens it rides.
  useEffect(() => { if (relatedItemId === null) setResumedNext(null) }, [relatedItemId])
  const lens = useMemo(() => {
    if (relatedItemId === null) return null
    const item = workItems.find((i) => i.id === relatedItemId)
    return item === undefined ? null : (taskMemberships(displayPanels, [item])[0] ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatedItemId, displayPanels, workItems, worktreeRows, runs])
  // M303 (Quiet instrument). The navigator groups by TASK at rest, not only
  // while a lens is lit: the lit lens wins, otherwise the one task the
  // selection belongs to. A selection in several tasks (or none) falls back
  // to the by-kind places — guessing one of many would mislabel the rest.
  const navTask = useMemo(() => {
    if (lens !== null) return lens
    if (selectedId === null) return null
    const owners = taskMemberships(displayPanels, workItems).filter((m) => m.members.some((x) => x.panelId === selectedId))
    return owners.length === 1 ? owners[0]! : null
  }, [lens, selectedId, displayPanels, workItems])
  // Keyed on a SIGNATURE string, never on `lens` itself: the lens is
  // re-derived from `displayPanels`, a new array on every frame of a drag,
  // and the marks context below is frozen precisely so a drag re-renders no
  // frame (M204's critic). The same members with the same reasons are the
  // same map.
  const lensSignature = lens === null ? null : lens.members.map((m) => `${m.panelId}=${m.reason}`).join(',')
  const lensMap = useMemo(() => (lensSignature === null ? null : new Map(lensSignature === '' ? [] : lensSignature.split(',').map((e) => e.split('=') as [string, string]))), [lensSignature])
  useEffect(() => { if (relatedItemId !== null && !workItems.some((i) => i.id === relatedItemId)) setRelatedItemId(null) }, [relatedItemId, workItems])
  // M264. Escape clears the sticky stage when the lens is lit — but never when
  // the key belongs to a focused terminal (`.xterm`), an open text draft, or
  // chrome that already owns Escape (shouldIgnoreKeys). Stealing agent Escape
  // is the paste defect M204 deliberately avoided.
  useEffect(() => {
    if (relatedItemId === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (shouldIgnoreKeys()) return
      const active = document.activeElement
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement || active instanceof HTMLSelectElement || (active instanceof HTMLElement && active.isContentEditable)) return
      if (active instanceof Element && active.closest('.xterm') !== null) return
      event.preventDefault()
      setRelatedItemId(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [relatedItemId, shouldIgnoreKeys])
  // M204 (D08). The ⋯ menu's task section asks this at the moment it opens.
  // A ref, so the marks object below keeps ONE identity and no frame
  // re-renders for a membership it is not showing.
  const taskMenuRef = useRef<(id: string) => TaskMenuFact>(() => ({ kind: 'none' }))
  taskMenuRef.current = (id) => {
    const items = workItemsRef.current
    const owners = taskMemberships(displayPanelsRef.current, items).filter((m) => m.members.some((x) => x.panelId === id))
    const title = (m: TaskMembership): string => items.find((i) => i.id === m.itemId)?.title ?? m.itemId
    if (owners.length === 0) return { kind: 'none' }
    if (owners.length > 1) return { kind: 'many', titles: owners.map(title) }
    return { kind: 'one', title: title(owners[0]!), related: owners[0]!.itemId === relatedItemId }
  }
  // Brief #19. The ⋯ menu's advanced doors: what is true of this panel, asked
  // when the menu opens (a ref, the task section's reason), and the palette
  // verb each door runs — no new action, only a new moment to offer it.
  const advancedRef = useRef<(id: string) => AdvancedDoor[]>(() => [])
  advancedRef.current = (id) => {
    const all = displayPanelsRef.current
    const p = all.find((x) => x.rect.id === id)
    if (p === undefined) return []
    const cwd = isTerminalPanel(p) ? p.spec.cwd : isChatPanel(p) ? p.chat.cwd : undefined
    const owners = taskMemberships(all, workItemsRef.current).filter((m) => m.members.some((x) => x.panelId === id))
    return advancedDoors({
      kind: p.kind,
      agentic: isChatPanel(p) || (isTerminalPanel(p) && p.spec.agent !== undefined),
      hasCwd: cwd !== undefined && cwd !== '',
      teammate: isChatPanel(p) && p.chat.teammateId !== undefined,
      taskMembers: owners.length === 1 ? owners[0]!.members.length : 0,
      watched: cwd !== undefined && all.some((x) => isWatcherPanel(x) && x.watch.cwd === cwd)
    })
  }
  const advancedVerbs = useMemo(() => ({
    of: (id: string) => advancedRef.current(id),
    run: (id: string, door: AdvancedDoorId) => {
      const a = paletteActionsRef.current
      if (a === null || a === undefined) return
      if (door === 'teammate') a.openTeammates()
      else if (door === 'skill') a.openToolbox(id)
      else if (door === 'workflow') void a.createObject('workflow')
      else if (door === 'watcher') { onFocusPanel(id); focusedIdRef.current = id; a.beginWatcher() }
      else {
        const owner = taskMemberships(displayPanelsRef.current, workItemsRef.current).find((m) => m.members.some((x) => x.panelId === id))
        a.beginSaveTemplate(owner === undefined ? [id] : owner.members.map((x) => x.panelId))
      }
    }
  }), [onFocusPanel])
  // #17. The approval detail's Task line — the same membership the ⋯ menu
  // reads, through its ref, so the Dock's memo sees ONE function for the life
  // of the canvas.
  const approvalTaskOf = useCallback((panelId: string): string | undefined => {
    const fact = taskMenuRef.current(panelId)
    return fact.kind === 'one' ? fact.title : fact.kind === 'many' ? fact.titles.join(', ') : undefined
  }, [])
  const taskVerbs = useMemo(() => {
    const speak = (r: { kind: 'ran'; note?: string; partial?: true } | { kind: 'refused'; reason: string } | undefined): void => {
      if (r !== undefined && (r.kind === 'refused' || ('partial' in r && r.partial === true))) paletteActionsRef.current?.say(r.kind === 'refused' ? r.reason : (r.note ?? ''))
    }
    return {
      of: (id: string) => taskMenuRef.current(id),
      show: (id: string) => speak(paletteActionsRef.current?.showTask(id)),
      related: (id: string) => speak(paletteActionsRef.current?.showRelated(id)),
      arrange: (id: string) => speak(paletteActionsRef.current?.arrangeTask(id)),
      // M324. The member's ONE task (the menu offers the verb only then).
      focus: (id: string) => {
        const owner = taskMemberships(displayPanelsRef.current, workItemsRef.current).filter((m) => m.members.some((x) => x.panelId === id))
        if (owner.length === 1) openFocusTaskRef.current(owner[0]!.itemId)
      }
    }
  }, [])
  const marksSignature = panels.map((p) => (p.locked === true || p.pinned === true || p.maximised !== undefined || p.skillTrail === 'collapsed' ? `${p.rect.id}:${p.locked === true ? 'L' : ''}${p.pinned === true ? 'P' : ''}${p.maximised !== undefined ? 'M' : ''}${p.skillTrail === 'collapsed' ? 'T' : ''}` : '')).filter((s) => s !== '').join(',')
  const panelMarks = useMemo<PanelMarks>(() => ({
    marks: new Map(marksSignature === '' ? [] : marksSignature.split(',').map((entry) => {
      const [id, flags] = entry.split(':') as [string, string]
      return [id, { locked: flags.includes('L'), pinned: flags.includes('P'), maximised: flags.includes('M'), trailCollapsed: flags.includes('T') }] as const
    })),
    maximise: maximisePanel,
    restore: restorePanel,
    // M130. The capsule's verb. Present for every kind, because the frame
    // decides whether to paint a capsule from the TRAIL, not from the kind.
    toggleTrail: toggleSkillTrail,
    readOnly: merged,
    // M106. The ⋯ menu's door: the ref is set HERE as well as by the render,
    // because openPalette captures the ref synchronously and the focus it just
    // asked for lands a render later.
    more: (id) => { onFocusPanel(id); focusedIdRef.current = id; palette.openPalette() },
    // M204 (D08). The lens rides the one context every kind's frame reads, so
    // a terminal, a chat and a card dim on ONE rule.
    lens: lensMap,
    task: taskVerbs,
    advanced: advancedVerbs
  }), [marksSignature, maximisePanel, restorePanel, toggleSkillTrail, merged, onFocusPanel, palette, lensMap, taskVerbs, advancedVerbs])

  // M93. The verbs. Placement resolves the anchor against the panels in paint
  // order (the topmost hit wins). Notes are OUTSIDE the panel history: History
  // is one stack over one Panel[], and widening it is a bigger change than a
  // margin note earns — so deleting a note is not undoable, said plainly in
  // the build log rather than pretended here.
  const placeAnnotation = useCallback((world: { x: number; y: number }): boolean => {
    if (!annotating || mergedRef.current) return false
    const ordered = [...panelsRef.current].sort((a, b) => a.z - b.z)
    const anchor = resolveAnchor(world, ordered)
    const id = `a${Date.now().toString(36)}${(annotationSeq.current++).toString(36)}`
    // M395. No empty label outlives its editor. The one still open is left to
    // its editor, which commits what was typed as it unmounts here (an empty
    // one removes itself); any other empty label is dropped (dropEmptyLabels).
    setAnnotations((current) => [...dropEmptyLabels(current, editingAnnotationRef.current), { id, text: '', anchor }].slice(-ANNOTATIONS_MAX))
    setSelectedAnnotation(id)
    setEditingAnnotation(id)
    return true
  }, [annotating])
  const commitAnnotation = useCallback((id: string, text: string) => {
    setEditingAnnotation((current) => (current === id ? null : current))
    // An empty FRESH note is no note (a mis-click removes itself); an existing
    // note emptied and blurred keeps its text — clearing is not deleting, and
    // Delete is the verb for that.
    setAnnotations((current) => {
      const existing = current.find((a) => a.id === id)
      if (text === '' && existing !== undefined && existing.text !== '') return current
      return text === '' ? current.filter((a) => a.id !== id) : current.map((a) => (a.id === id ? { ...a, text } : a))
    })
    if (text === '') setSelectedAnnotation((current) => (current === id ? null : current))
  }, [])
  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((current) => current.filter((a) => a.id !== id))
    setSelectedAnnotation((current) => (current === id ? null : current))
    setEditingAnnotation((current) => (current === id ? null : current))
  }, [])
  const beginAnnotate = useCallback((): { kind: string; reason?: string } => {
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only — leave it to annotate' }
    setAnnotating(true)
    return { kind: 'entered' }
  }, [])
  // M395. Done closes the open label too: its editor commits what was typed
  // as it unmounts (AnnotationLayer's NoteEditor), and a label left with
  // nothing in it is removed rather than kept as "…".
  const endAnnotate = useCallback(() => {
    setAnnotating(false)
    setInkDraft(null)
    setEditingAnnotation(null)
    setAnnotations((current) => {
      const next = dropEmptyLabels(current, editingAnnotationRef.current)
      return next.length === current.length ? current : next
    })
  }, [])
  placeAnnotationRef.current = placeAnnotation
  // M155. A finished stroke: anchored by its FIRST point (a stroke that starts
  // on a panel belongs to it — the label's own rule), its points stored
  // RELATIVE to that anchor point and simplified so a slow hand does not keep
  // a thousand of them; selected on commit so Delete is one keystroke away.
  // Like a label (M93), a stroke is OUTSIDE history: Delete is not undoable,
  // said here and in the build log rather than pretended.
  const commitInk = useCallback((points: Array<[number, number]>, scale: number) => {
    if (!annotating || mergedRef.current || points.length < 2) return
    if (!points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return
    const ordered = [...panelsRef.current].sort((a, b) => a.z - b.z)
    const first = { x: points[0]![0], y: points[0]![1] }
    const anchor = resolveAnchor(first, ordered)
    // Relative to the ANCHOR POINT for both kinds — the point the painter adds.
    // The first cut measured a panel stroke from the panel's top-left, and the
    // painter (through annotationPoint) added dx,dy a second time: every
    // stroke drawn on a panel sat offset by its own start (the M155 critic).
    // The tolerance is 0.75 SCREEN px, through the scale the stroke was drawn at.
    const rel = simplifyStroke(points, 0.75 / Math.max(scale, 0.01)).map(([x, y]) => [x - first.x, y - first.y] as [number, number])
    const id = `k${Date.now().toString(36)}${(annotationSeq.current++).toString(36)}`
    setAnnotations((current) => [...current, { id, text: '', anchor, ink: { points: rel, width: INK_WIDTH } }].slice(-ANNOTATIONS_MAX))
    setSelectedAnnotation(id)
  }, [annotating])
  inkToolRef.current = () => annotating && annotateTool === 'draw'
  commitInkRef.current = commitInk
  // Delete removes the selected note; Escape clears the selection or leaves the mode.
  useEffect(() => {
    if (selectedAnnotation === null && !annotating) return
    const onKey = (event: KeyboardEvent): void => {
      if (shouldIgnoreKeys()) return
      const active = document.activeElement
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement || active instanceof HTMLSelectElement || (active instanceof HTMLElement && active.isContentEditable)) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedAnnotation !== null) {
        event.preventDefault()
        removeAnnotation(selectedAnnotation)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        if (selectedAnnotation !== null) setSelectedAnnotation(null)
        else setAnnotating(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selectedAnnotation, annotating, shouldIgnoreKeys, removeAnnotation])
  // A panel-anchored note whose panel is gone draws nothing (annotationPoint
  // is null) and is dropped by the parser on the next load — NOT pruned here
  // on every panels change: undo of a panel's removal would otherwise have
  // pruned its note for good (the verifier). The mode ends when the view merges.
  useEffect(() => { if (merged) { setAnnotating(false); setSelectedAnnotation(null); setEditingAnnotation(null) } }, [merged])
  // M93. The time machine's rows: read when the Workspaces pane is on screen
  // and after every restore; null until the first answer (three states).
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null)
  const readSnapshots = useCallback(() => {
    void window.canvas.snapshot.list().then(setSnapshots).catch(() => setSnapshots([]))
  }, [])
  useEffect(() => { if (chrome.navigator === 'workspaces') readSnapshots() }, [chrome.navigator, readSnapshots])
  const restoreSnapshot = useCallback((at: number) => {
    if (mergedRef.current) return
    // The renderer's own id counter rides along: a panel spawned inside the
    // store's coalesce window is not on disk yet, and main mints past both.
    void window.canvas.snapshot.restore(at, nextIdRef.current).then(async (result) => {
      if (result.kind === 'refused') { console.warn(`[snapshot] ${result.reason}`); return }
      // A new workspace exists on disk; the list re-reads, then the ordinary
      // switch — the same transaction a click on a workspace row runs.
      await reloadWorkspacesRef.current?.()
      await switchWorkspace(result.workspaceId)
      readSnapshots()
    })
  }, [switchWorkspace, readSnapshots])
  const annotationMarks = useMemo(() => annotations.flatMap((a) => { const p = annotationPoint(a, panels); return p === null ? [] : [p] }), [annotations, panels])

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
      const obstacles = [...document.querySelectorAll<HTMLElement>('.minimap, .canvas-hud, .command-pill__rest')]
        .map((n) => local(n.getBoundingClientRect()))
        .filter((r) => r.w > 0 && r.h > 0)
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
    setPanels((current) => {
      // M181. An EXACT placement when the caller asked for one (the starter,
      // which lays four examples out relative to this rect and so must know it
      // without waiting for a commit); the cascade otherwise, kept clear of the
      // chrome floating over the canvas.
      const centre = opts?.at ?? clearOfChrome(cascadeCentre(screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current), current))
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
  }, [commitHistory, selectOnly])
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
    viewportRef, frameRects, palette, setInputMode,
    presetRowsRef, teammatesRef, credentialRows,
    taskHandoffOf, taskLaneOf, taskPathsOf, refreshTaskHandoffs, taskMemberships, reviewTaskLane,
    startWorkRef: paletteActionsRef, relatedItemId, setRelatedItemId
  })
  // M74. Terminal → chat. main is asked FIRST (`agent:import` validates the
  // pin, the live process and the CLI's file, and writes the turns under the
  // NEW id); a refusal is shown by name in the palette's line and nothing
  // is minted. Then the terminal leaves through the ordinary close path (its
  // process is not live — the precondition) and the chat takes its rect.
  const openAsChat = useCallback(async (id: string): Promise<{ kind: string; reason?: string }> => {
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    const panel = panelsRef.current.find((p) => p.rect.id === id)
    if (!panel || !isTerminalPanel(panel)) return { kind: 'refused', reason: 'only a terminal panel can open as chat' }
    const newId = `c${nextIdRef.current++}`
    const result = await window.canvas.agentSession.importSession({ fromPanelId: id, toPanelId: newId })
    if (result.kind === 'refused') {
      setInputMode({ kind: 'text', label: result.reason, initial: '', feedback: true, submit: () => setInputMode(null) })
      palette.openPalette()
      return result
    }
    const rect = panel.rect
    const knobs = panel.spec.agentOptions
    const title = panel.title
    onClosePanel(id)
    setPanels((current) => {
      const chat = makeChatPanel(newId, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, nextZ(current),
        { cwd: panel.spec.cwd, sessionId: result.sessionId, ...(knobs === undefined ? {} : { agentOptions: knobs }) }, { w: rect.w, h: rect.h })
      const next = [...current, title === undefined ? chat : { ...chat, title }]
      commitHistory(next)
      return next
    })
    selectOnly(newId)
    return { kind: 'opened' }
  }, [commitHistory, onClosePanel, selectOnly, palette])
  // M74. Chat → terminal. The chat leaves through its own close path (the
  // session disposed with its file — the CLI's transcript is the durable
  // one) and a terminal spawns at its rect with `claude --resume <id>`, the
  // chat's knobs and title, focused so it is live before the hand leaves
  // the keyboard. main adopts the resumed id as the terminal's pin.
  const openInTerminal = useCallback((id: string): { kind: string; reason?: string } => {
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    const panel = panelsRef.current.find((p) => p.rect.id === id)
    if (!panel || !isChatPanel(panel)) return { kind: 'refused', reason: 'only a chat panel can open in a terminal' }
    // M90/M99. The terminal door is `claude --resume`; a backend without one refuses by its row's reason.
    const row = BACKENDS[backendOf(panel.chat)]
    if (!row.terminalDoor) return { kind: 'refused', reason: row.reasons.noTerminal }
    // The precondition IN the verb, not only on its three doors (M74's
    // verifier): a turn in flight or a permission waiting is one front-end
    // still working, and an empty chat has nothing to resume.
    const mirror = getChat(id)
    if (mirror.snapshot !== null && (mirror.snapshot.status === 'streaming' || mirror.snapshot.pending.length > 0)) return { kind: 'refused', reason: REASON_CHAT_BUSY }
    if (!mirror.turns.some((t) => t.role === 'user' && t.blocks.some((b) => b.type === 'text'))) return { kind: 'refused', reason: REASON_CHAT_EMPTY }
    const rect = panel.rect
    const tid = `n${nextIdRef.current++}`
    const knobs = panel.chat.agentOptions
    const title = panel.title
    // The session goes, the FILE stays (drop: false): one Cmd+Z past the
    // move restores the chat panel, and it must render its turns. The
    // ordinary close path would drop the file, so this is the one removal
    // that does not go through it.
    disposeChat(id, false); disposeWatcher(id); clearBrowser(id); disposeRelayTerminal(id)
    setPanels((current) => { const next = removePanel(current, id); commitHistory(next); return next })
    setSelectedIds((current) => retainSelection(current, (sid) => sid !== id))
    setFocusedId((current) => (current === id ? null : current))
    setPendingFocusId(tid)
    setEnteringPanelIds((current) => new Set(current).add(tid))
    setPanels((current) => {
      const term = makePanel(tid, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, nextZ(current),
        { panelId: tid, cwd: panel.chat.cwd, command: 'claude', args: ['--resume', panel.chat.sessionId], agent: 'claude-code', ...(knobs === undefined ? {} : { agentOptions: knobs }) },
        { w: rect.w, h: rect.h })
      const next = [...current, title === undefined ? term : { ...term, title }]
      commitHistory(next)
      return next
    })
    selectOnly(tid)
    return { kind: 'opened', reason: tid }
  }, [commitHistory, onClosePanel, selectOnly])
  openAsChatRef.current = openAsChat
  openInTerminalRef.current = openInTerminal
  // A void wrapper with a stable identity for the memoised terminal panel.
  const openAsChatVoid = useCallback((id: string) => { void openAsChat(id) }, [openAsChat])
  const onFrontEnd = useCallback((id: string) => {
    const panel = panelsRef.current.find((p) => p.rect.id === id)
    if (panel && isChatPanel(panel)) openInTerminal(id)
    else void openAsChat(id)
  }, [openAsChat, openInTerminal])
  /**
   * M84. Asking for a watcher: the command, then when to run it.
   *
   * Two text lines rather than a form, because the palette's line is the one
   * input this app already has for "type a thing" and a modal form would be
   * a second vocabulary for the same act. The trigger line takes the words
   * the node itself shows (`on a change in <path>`, `every 10m`, `when the
   * branch moves`), so what a user types is what they will read back.
   */
  /**
   * M84. Arm or disarm a watcher — a PERSISTED fact on the panel record, so a
   * paused watcher is still paused after a relaunch, and one history entry so
   * ⌘Z puts it back. `armed: true` is written as ABSENCE: the field's absence
   * already means armed, and writing it would make every file differ from the
   * one before it for no new fact.
   */
  const setWatcherArmed = useCallback((id: string, armed: boolean) => {
    setPanels((current) => {
      const next = current.map((p) => {
        if (p.rect.id !== id || !isWatcherPanel(p)) return p
        const { armed: _was, ...rest } = p.watch
        return { ...p, watch: armed ? rest : { ...rest, armed: false as const } }
      })
      commitHistory(next)
      return next
    })
  }, [commitHistory])

  /**
   * M85. Opening a note by its path INSIDE the vault, and offering to create
   * one a link points at but nothing answers.
   *
   * Both go through M27's own verbs — `openFilePanel(..., { prose: true })`
   * and `file:create` — because a note is a file panel in prose mode and a
   * vault is many of them. A second creation path would be a second set of
   * rules about what a note is.
   */
  const openVaultNote = useCallback((relative: string) => {
    const root = vaultRootRef.current
    if (root === '') return
    openFilePanel(`${root.replace(/\/+$/, '')}/${relative}`, worldCentre(), { prose: true })
  }, [openFilePanel, worldCentre])

  const beginCreateVaultNote = useCallback((name: string) => {
    const root = vaultRootRef.current
    if (root === '') return
    // The name as typed in the link, with `.md` — a link that said
    // `[[api notes]]` must create `api notes.md` and resolve NEXT time, which
    // it only does if the file is named what the link said.
    const file = /\.md$/i.test(name) ? name : `${name}.md`
    // Every refusal RE-PROMPTS with its reason, M27's own shape: a `[[../x]]`
    // that main refuses (outside the root), a name that already exists, a
    // write that failed — each closed the line silently and left the link
    // dashed with nothing said (M85's verifier). The catch is mandatory for
    // FileNode's reason: an unhandled rejection leaves the line open forever.
    const prompt = (initial: string, label: string, feedback?: true): void => {
      setInputMode({
        kind: 'text',
        label,
        initial,
        ...(feedback === undefined ? {} : { feedback }),
        submit: (typed) => {
          const named = typed.trim()
          if (named === '') { setInputMode(null); return }
          void window.canvas.file.create({ root, name: named, seed: `# ${named.replace(/\.md$/i, '').split('/').pop() ?? named}\n\n` })
            .then((res) => {
              if (res.kind === 'created') { setInputMode(null); openFilePanel(res.path, worldCentre(), { prose: true }); return }
              const why = res.kind === 'exists' ? 'there is already a note with that name' : res.detail
              prompt(named, `Couldn\u2019t create that note \u2014 ${why}`, true)
            })
            .catch((error: unknown) => { prompt(named, `Couldn\u2019t create that note \u2014 ${String(error)}`, true) })
        }
      })
      palette.openPalette()
    }
    prompt(file, `Create ${file}?`)
  }, [openFilePanel, palette, worldCentre])

  const beginWatcher = useCallback(() => {
    const root = noteRootRef.current
    if (root === null) return
    // The selected panel, when it is one a watcher can wait on — which is
    // what makes `after this passes` a thing a person can type.
    const selected = selectedIdRef.current === null ? undefined : panelsRef.current.find((p) => p.rect.id === selectedIdRef.current)
    const sourceRef = selected !== undefined && (isTerminalPanel(selected) || isChatPanel(selected))
      ? { id: selected.rect.id, label: railLabel(selected, undefined) }
      : undefined
    const askTrigger = (command: string, initial: string, label: string, feedback?: true): void => {
      setInputMode({
        kind: 'text',
        label,
        initial,
        ...(feedback === undefined ? {} : { feedback }),
        submit: (answer) => {
          const text = answer.trim()
          if (text === '') { setInputMode(null); return }
          const trigger = parseTriggerWords(text, root, sourceRef)
          if (trigger === null) {
            askTrigger(command, text, sourceRef === undefined ? 'Try: a path, `every 10m`, or `branch`' : `Try: a path, \`every 10m\`, \`branch\`, or \`after this passes\``, true)
            return
          }
          setInputMode(null)
          const parts = command.trim().split(/\s+/)
          const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
          const watcherId = `w${nextIdRef.current++}`
          setPanels((current) => {
            const next = [...current, makeWatcherPanel(watcherId, cascadeCentre(centre, current), nextZ(current), {
              cwd: root, command: parts[0] as string, args: parts.slice(1), trigger
            })]
            commitHistory(next)
            return next
          })
          selectOnly(watcherId)
        }
      })
    }
    setInputMode({
      kind: 'text',
      label: 'What should it run?',
      initial: 'npm test',
      submit: (command) => {
        if (command.trim() === '') { setInputMode(null); return }
        askTrigger(command, 'src', sourceRef === undefined ? 'When? a path to watch, `every 10m`, or `branch`' : `When? a path, \`every 10m\`, \`branch\`, or \`after this passes\` (${sourceRef.label})`)
      }
    })
  }, [commitHistory, selectOnly])

  /**
   * M133. THE WORKFLOW PANEL'S FOUR VERBS, all of them doors that already
   * existed — which is the milestone's claim: no new IPC, no new writer, no
   * new trust boundary.
   *
   *  - open  : a sessionless panel carrying the template's ID alone.
   *  - run   : M80's OWN `instantiateTemplate`, through the ref every other
   *            caller uses. Never a second copy (`workflow.panel.1e`).
   *  - trigger: a WATCHER on this template — `shared/watch-trigger.ts`
   *            unchanged and main's existing arming, asked with the same
   *            words `beginWatcher` asks them in.
   *  - build : §4.1's chat door, pointed at a template file. The message is
   *            INSERTED into the composer, never sent.
   */
  const openWorkflowPanel = useCallback((templateId: string, at?: Point) => {
    if (mergedRef.current) return
    const template = allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
    const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
    const id = `wf${nextIdRef.current++}`
    setPanels((current) => {
      const next = [...current, makeWorkflowPanel(id, at ?? cascadeCentre(centre, current), nextZ(current), templateId, template?.name ?? templateId)]
      commitHistory(next)
      return next
    })
    selectOnly(id)
  }, [commitHistory, selectOnly])

  // M246. `caller` is who started the run: an agent through `tc plan workflow-run`
  // (its identity rides into every action node), or absent for a person's Run and
  // for a timer's fire (a template a person authored and reviewed).
  const runWorkflow = useCallback((templateId: string, source: 'click' | 'fire' = 'click', caller?: AgentPlanCaller): string | undefined => {
    // M184. The DRAFT is what runs when there is one: what the person sees on
    // the diagram is what the Run button starts. The snapshot the run records
    // below is this same shape, so its outcomes never move under a later edit.
    const template = getDraft(templateId)?.template ?? allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
    if (template === undefined) return 'not run: that template is no longer saved'
    // A template with parameters cannot run unasked. On the CLICK path the
    // sheet is where a person answers them. On the FIRE path there is nobody
    // to answer: a 3am timer would leave a modal over an empty canvas while
    // the watcher recorded a success, so it is refused BY NAME and mints
    // nothing (`workflowFireRefusal`).
    const holes = templateHoles(template)
    if (holes.length > 0) {
      if (source === 'fire') return workflowFireRefusal(holes)
      paletteActionsRef.current?.beginSpawnSheet(templateId)
      return undefined
    }
    // M137. The same refusal Run's door shows (a block that cannot run yet, a
    // missing preset, a cycle), consulted HERE so the fire path returns it —
    // `instantiateTemplate` refuses the same shapes silently, which left a
    // watcher recording a success per tick while minting nothing.
    const refusal = templateRefusal(template, presetRowsRef.current, claudeAvailable(presetRowsRef.current))
    if (refusal !== undefined) return `not run: ${refusal}`
    void instantiateTemplateRef.current(template, {}, caller)
    return undefined
  }, [])

  // Read through a ref by the fired handler, which is installed once.
  const runWorkflowRef = useRef(runWorkflow)
  runWorkflowRef.current = runWorkflow

  const beginWorkflowTrigger = useCallback((templateId: string) => {
    const template = allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
    if (template === undefined) return
    // The watcher's directory is the template's FIRST node's — the one
    // directory the shape already names. `~` when it has none.
    const root = template.nodes[0]?.cwd ?? '~'
    const ask = (initial: string, label: string, feedback?: true): void => {
      setInputMode({
        kind: 'text',
        label,
        initial,
        ...(feedback === undefined ? {} : { feedback }),
        submit: (answer) => {
          const text = answer.trim()
          if (text === '') { setInputMode(null); return }
          const trigger = parseTriggerWords(text, root, undefined)
          if (trigger === null) { ask(text, 'Try: a path, `every 10m`, or `branch`', true); return }
          setInputMode(null)
          const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
          const watcherId = `w${nextIdRef.current++}`
          setPanels((current) => {
            const next = [...current, makeWatcherPanel(watcherId, cascadeCentre(centre, current), nextZ(current), {
              ...workflowWatch(templateId, root, trigger)
            })]
            commitHistory(next)
            return next
          })
          selectOnly(watcherId)
        }
      })
    }
    ask('src', `When should ${template.name} run? a path to watch, \`every 10m\`, or \`branch\``)
  }, [commitHistory, selectOnly])

  const buildWorkflowWithAi = useCallback((templateId: string) => {
    const template = allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
    if (template === undefined) return
    const root = template.nodes[0]?.cwd ?? '~'
    void beginNewChatRef.current({
      cwd: root,
      title: `build ${template.name}`,
      // Named, not pasted: the chat is told WHERE the template lives and what
      // shape it has, and reads it with its own tools. This app writes no
      // template on an agent's behalf.
      message: `The workflow "${template.name}" (id ${template.id}) is saved in this app's layout file, under the top-level \`templates\` array: each entry is { id, name, description?, nodes[], edges[] }, a node is { key, kind: 'terminal' | 'chat' | 'pool' | 'orchestrator' | 'collect', cwd, dx, dy, ... }, and an edge is { from, to, trigger: 'exit' | 'exit-ok' | 'exit-fail' | 'idle' | 'always' }. It has ${blockCount(template)} blocks today. What should it do differently?`
    })
  }, [])

  /**
   * M133. A WORKFLOW TRIGGER firing. Main armed and ran the watcher exactly
   * as it does every other one; what a workflow watcher's fire MEANS is the
   * renderer's, because only the renderer can mint panels. This is the whole
   * of the "no second scheduler" claim: one subscription, one arming, one
   * table of triggers.
   */
  useEffect(() => {
    setWatcherFiredHandler((watcherId) => {
      const panel = panelsRef.current.find((p) => p.rect.id === watcherId)
      if (panel === undefined || !isWatcherPanel(panel)) return
      const templateId = panel.watch.templateId
      if (templateId === undefined) return
      // A refusal is SAID, on the watcher's own body, rather than swallowed:
      // a trigger that fired and did nothing with no sentence anywhere is the
      // silent failure this whole file is written against.
      const refused = runWorkflowRef.current(templateId, 'fire')
      if (refused !== undefined) setDisarmed(watcherId, refused)
      else clearDisarmed(watcherId)
    })
    return () => setWatcherFiredHandler(null)
  }, [panelsRef])

  /**
   * M184. SAVE THE DRAFT. The revision the draft was READ at is the
   * expectation, so a record saved by anyone else in between is refused as
   * stale with the draft kept — the panel offers Reload and Save a copy.
   * A built-in never reaches here (the panel offers only the copy).
   */
  const saveWorkflowDraft = useCallback(async (templateId: string): Promise<{ kind: 'saved' } | { kind: 'stale'; reason: string } | { kind: 'refused'; reason: string }> => {
    const draft = getDraft(templateId)
    if (draft === undefined || !draft.dirty) return { kind: 'refused', reason: 'nothing to save — the diagram matches the template' }
    if (isBuiltInTemplate(templateId)) return { kind: 'refused', reason: 'a built-in workflow saves as a copy' }
    const result = await window.canvas.template.save(draft.template, draft.baseRevision)
    if (result.kind === 'stale') return { kind: 'stale', reason: result.reason }
    // Round 6. A refusal is passed through as itself, never turned into a
    // stale: the panel's stale arm offers Reload, and reloading a record
    // whose shape main would not accept walks a person in a circle.
    if (result.kind === 'refused') return { kind: 'refused', reason: result.reason }
    resetDraft(templateId, result.template)
    reloadTemplates()
    return { kind: 'saved' }
  }, [reloadTemplates])
  /** M184. The draft under a NEW id at revision 0 — a built-in's only save, and the way out of a stale one. */
  const saveWorkflowCopy = useCallback(async (templateId: string): Promise<{ kind: 'saved'; name?: string } | { kind: 'refused'; reason: string }> => {
    const draft = getDraft(templateId)
    const base = draft?.template ?? allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
    if (base === undefined) return { kind: 'refused', reason: `no template is called ${templateId}` }
    const taken = new Set(allTemplates(templateRowsRef.current).map((t) => t.name))
    let name = `${base.name} (copy)`
    for (let n = 2; taken.has(name); n += 1) name = `${base.name} (copy ${n})`
    const { id: _id, revision: _revision, ...rest } = base
    const result = await window.canvas.template.save({ ...rest, name })
    if (result.kind !== 'saved') return { kind: 'refused', reason: result.reason }
    // M184 (the critic, finding 4). REBIND the panel to the copy, and only
    // then drop the draft: dropping it first snapped the diagram back to the
    // original record, so the edits left the screen with no message and the
    // copy holding them had no panel open on it — visible work loss on a
    // built-in's only save path.
    setPanels((current) => {
      const next = current.map((p) => (isWorkflowPanel(p) && p.workflow.templateId === templateId ? { ...p, workflow: { ...p.workflow, templateId: result.template.id }, title: result.template.name } : p))
      commitHistory(next)
      return next
    })
    resetDraft(templateId)
    reloadTemplates()
    return { kind: 'saved', name }
  }, [reloadTemplates, commitHistory])
  /**
   * M184. Stop: every live pool AND every chat of the selected run interrupted
   * (M138's own pool stop, M71's own interrupt), nothing killed — a budget and
   * a stop are the same shape, and a killed agent loses its turn.
   *
   * M184 (the critic, finding 3). The first cut read pool keys off the RECORD
   * and interrupted no chat at all, so a workflow of three chats mid-turn
   * answered `no pool is running`, which was false. The subject is the run:
   * the named one when the diagram has one selected, otherwise every run of
   * this template still open. A run's own `definition` names its pool blocks,
   * so a block deleted from the draft since is still stopped.
   */
  const stopWorkflowRun = useCallback((templateId: string, runId?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    const runs = runsForTemplate(runsRef.current, templateId)
    const chosen = runId === undefined ? runs.filter((r) => r.endedAt === undefined) : runs.filter((r) => r.id === runId)
    const keys = new Set<string>()
    for (const r of chosen) for (const n of r.definition?.nodes ?? []) if (n.kind === 'pool') keys.add(n.key)
    // No run to read from (a run of an earlier session is not attributable,
    // M133's third state) — the record's blocks are the only shape there is.
    if (chosen.length === 0) {
      const template = getDraft(templateId)?.template ?? allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
      for (const n of template?.nodes ?? []) if (n.kind === 'pool') keys.add(n.key)
    }
    const live = [...keys].filter((k) => getPool(templateId, k).live)
    const panelIds = new Set<string>()
    for (const r of chosen) for (const id of r.panelIds) panelIds.add(id)
    const chats = panelsRef.current.filter((p) => panelIds.has(p.rect.id) && isChatPanel(p)).map((p) => p.rect.id)
    if (live.length === 0 && chats.length === 0) return { kind: 'refused', reason: REASON_NOTHING_RUNNING }
    for (const k of live) stopPool(templateId, k)
    for (const id of chats) void window.canvas.agentSession.interrupt(id)
    const parts: string[] = []
    if (live.length > 0) parts.push(`${live.length} pool${live.length === 1 ? '' : 's'}`)
    if (chats.length > 0) parts.push(`${chats.length} chat${chats.length === 1 ? '' : 's'}`)
    return { kind: 'ran', note: `${parts.join(' and ')} interrupted` }
  }, [stopPool])

  /** M184. Discard the draft: the record as it stands is the truth again. */
  const reloadWorkflowDraft = useCallback((templateId: string) => {
    resetDraft(templateId, allTemplates(templateRowsRef.current).find((t) => t.id === templateId))
    reloadTemplates()
  }, [reloadTemplates])

  const deleteWorkflowTemplate = useCallback((templateId: string) => {
    if (isBuiltInTemplate(templateId)) return
    // M182. The draft goes with the record: a deleted template is not editable through a draft that outlived it.
    clearDraft(templateId)
    void window.canvas.template.remove(templateId).then(() => window.canvas.template.list().then(setTemplateRows))
  }, [])

  const beginNewNote = useCallback(() => {
    const root = noteRootRef.current
    // The row is already disabled without a root; this is the second half of
    // the same rule, against a selection that changed while the palette was
    // open — the guard beginSavePrompt already keeps for its own list.
    if (root === null) return

    const stamp = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    // A date-stamped default, because the commonest note has no name the user
    // has thought of yet, and an empty field makes them invent one before
    // they can write anything down. Editable, obviously — it is a text field.
    const suggested = `notes/${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}.md`

    const prompt = (initial: string, label: string, feedback?: true): void => {
      setInputMode({
        kind: 'text',
        label,
        initial,
        ...(feedback === undefined ? {} : { feedback }),
        submit: (name) => {
          // A blank submit is the same CANCEL a blank rename already is.
          if (name.trim() === '') { setInputMode(null); return }
          const seedTitle = name.trim().replace(/\.[^./]*$/, '').split('/').pop() ?? name.trim()
          void window.canvas.file
            .create({ root, name, seed: `# ${seedTitle}\n\n` })
            .then((res) => {
              if (res.kind === 'created') {
                setInputMode(null)
                openFilePanel(res.path, worldCentre(), { prose: true })
                return
              }
              // Every refusal re-prompts carrying the typed name, so the user
              // can correct it — InputMode's `feedback` exists precisely
              // because a placeholder only shows when the field is EMPTY,
              // which it never is on this path.
              const why =
                res.kind === 'exists' ? 'there is already a file with that name'
                  : res.detail
              prompt(name, `Couldn\u2019t create that note \u2014 ${why}`, true)
            })
            .catch((error: unknown) => {
              // Mandatory, for FileNode's reason: an unhandled rejection
              // leaves the input mode open forever with no explanation, which
              // reads as the app having frozen.
              prompt(name, `Couldn\u2019t create that note \u2014 ${String(error)}`, true)
            })
        }
      })
      // Palette.tsx closes the overlay BEFORE it runs a row's command AND
      // before it calls an input mode's submit, so without this the mode
      // would be set on a palette that is already gone and Canvas's own
      // clear-on-close effect would wipe it. The same pairing
      // beginRenamePreset, deletePreset and beginEditSetting all make — and
      // the reason every refusal branch below re-enters through `prompt`
      // rather than calling setInputMode on its own. Watched failing exactly
      // here: verify:panels 176 reported `stillInInput:false` with the
      // palette back in command mode, so a duplicate name silently did
      // nothing rather than saying the name was taken.
      palette.openPalette()
    }

    prompt(suggested, 'Name this note\u2026')
  }, [palette, openFilePanel, worldCentre])

  // Every verb the palette, top bar, rail and inspector share, lifted into
  // usePaletteActions.ts. Still ONE memoized object with the same dependency
  // array — Palette.tsx memoizes its command list on this prop's identity.
  /**
   * M83. The memory node for a panel's directory. The node carries the
   * DIRECTORY; main resolves it to the repository root on every read and
   * write (`memoryRoot` in `main/index.ts`), which is what keeps this door,
   * the chat's first-send context and `tc memory add` on one list. Doing the
   * resolution here instead would put a second resolver in the renderer and
   * the two would disagree only for panels below the root.
   */
  const openMemoryPanel = useCallback(async (): Promise<void> => {
    // The SAME directory the two doors are enabled from (`noteRoot`, the
    // SELECTED panel's, which every kind that has one supplies). Reading the
    // captured or focused panel instead — as the first version did — made the
    // enabling fact and the acting fact two different panels: a selected file
    // node lit the control and clicking it did nothing at all, and a terminal
    // focused in another repository opened THAT repository's memory under the
    // tree of this one. Both are silent (M83's verifier).
    const root = noteRootRef.current
    if (root === null) return
    const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
    const memoryId = `m${nextIdRef.current++}`
    setPanels((current) => {
      const next = [...current, makeMemoryPanel(memoryId, cascadeCentre(centre, current), nextZ(current), { root })]
      commitHistory(next)
      return next
    })
    selectOnly(memoryId)
  }, [commitHistory, selectOnly])

  /**
   * M103. Mint a browser panel at the world centre. The url is already
   * http(s) by the caller's rule (`normaliseTypedUrl`); the record holds
   * where the page OPENS, and every later navigation is written back onto it
   * through `onBrowserNavigated` so a relaunch returns to the last page.
   */
  const openBrowserPanel = useCallback((url: string, preview?: PreviewBinding, at?: Point): void => {
    const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
    const browserId = `b${nextIdRef.current++}`
    setPanels((current) => {
      const next = [...current, makeBrowserPanel(browserId, at ?? cascadeCentre(centre, current), nextZ(current), url, preview)]
      commitHistory(next)
      return next
    })
    selectOnly(browserId)
  }, [commitHistory, selectOnly])
  /** M338. A relay terminal at `at`: a fresh session of `program`, or an attach to a session the relay already has. */
  const openRelayPanel = useCallback((relay: { program: string; sessionId?: string; shareId?: string }, at?: Point): void => {
    const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
    const relayId = `r${nextIdRef.current++}`
    setPanels((current) => {
      const made = makeRelayPanel(relayId, at ?? cascadeCentre(centre, current), nextZ(current), relay)
      const next = [...current, relay.sessionId === undefined ? made : { ...made, relay: { ...made.relay, sessionId: relay.sessionId } }]
      commitHistory(next)
      return next
    })
    selectOnly(relayId)
  }, [commitHistory, selectOnly])
  /**
   * M338. The relay minted this panel's session (or it was forgotten, for a
   * new one): written to the record so a relaunch attaches instead of starting
   * a second process. Not an undo step — the person did nothing; the relay
   * answered — so the history is left alone, the rule a browser's navigation follows.
   */
  const setRelaySession = useCallback((panelId: string, sessionId: string | undefined): void => {
    setPanels((current) => current.map((p) => {
      if (p.rect.id !== panelId || !isRelayPanel(p) || p.relay.sessionId === sessionId) return p
      const { sessionId: _old, ...rest } = p.relay
      return { ...p, relay: sessionId === undefined ? rest : { ...rest, sessionId } }
    }))
  }, [])
  /**
   * M190. FEEDBACK — a DRAFT in the person's own browser, never a submission.
   * The facts are chosen by type (a version, a platform, engine words, panel
   * counts) and scrubbed; the draft says so; and the only thing that leaves
   * this app is a link the person opens, through the ONE `link:open` door.
   */
  // M192. The app's own version, learned once from main's update check (which
  // answers `app.getVersion()` in every arm) and used by the feedback draft
  // and the portable file's `app` field.
  const [appVersion, setAppVersion] = useState<string | null>(null)
  useEffect(() => { void window.canvas.update.check().then((r) => { if ('version' in r && typeof r.version === 'string') setAppVersion(r.version) }) }, [])
  const prepareFeedback = useCallback(async (says?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const report = await window.canvas.env.report()
    const counts = new Map<string, number>()
    for (const panel of panelsRef.current) counts.set(panel.kind, (counts.get(panel.kind) ?? 0) + 1)
    const draft = buildFeedback(FEEDBACK_REPO, {
      // The version comes from MAIN (`app.getVersion()`, through the update
      // check's own answer), never a literal in the renderer: a hardcoded
      // number is right for exactly one release and then quietly lies in
      // every bug report that carries it.
      version: appVersion ?? 'unknown',
      platform: 'macOS',
      engines: onboardingReadiness(report).rows.map((row) => ({ name: FIRST_LAUNCH_ENGINES[row.backend].name, state: row.discovery === 'unknown' ? 'unanswered' : row.discovery })),
      kinds: [...counts].map(([kind, count]) => ({ kind, count })),
      says: says ?? ''
    })
    const opened = await window.canvas.links.open({ panelId: focusedIdRef.current ?? 'canvas', target: draft.url })
    if (opened.kind === 'refused') return { kind: 'refused', reason: opened.reason ?? 'that link could not be opened' }
    return { kind: 'ran', note: `a draft in your browser · ${draft.redacted} secret${draft.redacted === 1 ? '' : 's'} scrubbed${draft.truncated ? ' · cut to fit a link' : ''} · nothing was sent` }
  }, [appVersion])

  /**
   * M189. EXPORT — the RENDERER builds the record, because the renderer is
   * the only side that knows what is on this canvas (M113's rule for the
   * board, reached again); main only writes the bytes. Pictures are omitted
   * unless the person asked for them, and the sentence says what travelled,
   * what was scrubbed and what was left out.
   */
  const exportCanvas = useCallback(async (path?: string, withPixels?: boolean): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const persisted = fromPanels(panelsRef.current)
    const images: { id: string; mediaType: string; base64: string }[] = []
    if (withPixels === true) {
      for (const panel of panelsRef.current) {
        if (!isImagePanel(panel) || panel.image.asset === undefined) continue
        const read = await window.canvas.image.read(panel.image.path)
        if (read.kind !== 'data') continue
        const comma = read.dataUrl.indexOf(',')
        images.push({ id: panel.image.asset, mediaType: read.mediaType, base64: read.dataUrl.slice(comma + 1) })
      }
    }
    const file = buildPortable({
      kind: 'canvas',
      workspaceName: (await window.canvas.workspace.list()).find((w) => w.active)?.name ?? 'canvas',
      panels: persisted,
      templates: templateRowsRef.current,
      app: appVersion ?? 'unknown',
      now: Date.now(),
      ...(images.length === 0 ? {} : { images }),
      ...((await window.canvas.routine.list()).length > 0 ? { hasRoutines: true } : {})
    })
    const written = await window.canvas.portable.write({ ...(path === undefined ? {} : { path }), file, suggested: `${file.workspace.name.replace(/[^a-zA-Z0-9-_ ]/g, '') || 'canvas'}.tccanvas` })
    if (written.kind === 'cancelled') return { kind: 'ran', note: 'nothing exported' }
    if (written.kind === 'refused') return { kind: 'refused', reason: written.reason }
    return { kind: 'ran', note: `${displayPath(written.path).short} · ${exportSentence(file)}` }
  }, [appVersion])
  /**
   * M189. IMPORT — a SEPARATE workspace, every id remapped, and nothing
   * started: no PTY is spawned, no chat session created, no watcher armed and
   * no routine scheduled, because the kinds that would do any of those cannot
   * travel at all (`travels`) and every panel arrives in its not-started
   * state, which is the state a persisted panel has always had.
   */
  const importCanvas = useCallback(async (path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const answer = await window.canvas.portable.read(path === undefined ? {} : { path })
    if (answer.kind === 'cancelled') return { kind: 'ran', note: 'nothing imported' }
    if (answer.kind === 'refused') return { kind: 'refused', reason: answer.reason }
    const parse = answer.parse as ReturnType<typeof parsePortable>
    if (parse.kind !== 'file') return { kind: 'refused', reason: parse.reason }
    const remapped = remapPortable(parse.file, (prefix) => `${prefix}i${nextIdRef.current++}`)
    const made = await window.canvas.workspace.create(`${remapped.workspace.name} (imported)`)
    if (made === null || made === undefined || made === '') return { kind: 'refused', reason: 'a new workspace could not be made for the import' }
    // The templates travel with it, each under its new id; a name collision is
    // a copy, never an overwrite of a workflow the person already had.
    // M190 (the critic, 2). An imported template is UNREVIEWED: its action
    // nodes hold verb lines somebody else wrote, and Run is refused by name
    // until a person has read them.
    for (const template of remapped.templates) await window.canvas.template.save({ ...template, reviewed: false })
    reloadTemplates()
    const switched = await switchWorkspace(made)
    reloadWorkspacesRef.current?.()
    if (!switched) return { kind: 'refused', reason: 'the new workspace could not be opened' }
    const next = toPanels(remapped.workspace.panels)
    // M189. EVERY imported panel is DORMANT, exactly as a restored one is
    // (the boot's own rule at `dormantIds`'s seed). Without this a terminal
    // panel added to the array is a NEW panel, and the tiering effect asks
    // `registry.ensure` for it without the dormant flag — which spawns a
    // process the person only asked to look at. The check counts the PTYs
    // across the whole import and requires the count not to move.
    setDormantIds((current) => new Set([...current, ...next.map((p) => p.rect.id)]))
    setPanels(() => {
      commitHistory(next)
      return next
    })
    const warned = parse.warnings.length === 0 ? '' : ` · ${parse.warnings.length} warning${parse.warnings.length === 1 ? '' : 's'}`
    return { kind: 'ran', note: `${remapped.workspace.panels.length} object${remapped.workspace.panels.length === 1 ? '' : 's'} into a new workspace · nothing was started${warned}` }
  }, [commitHistory, reloadTemplates, switchWorkspace])

  /**
   * M253. PACKS. Import READS: main parses, holds the parse under a token and
   * answers requirements, and this only SHOWS it — nothing is added until the
   * preview's Add sends that token back. Main does the adding (a pack's
   * objects are library records only main can mint ids for), so the renderer
   * never supplies a payload. Export is main-built for the same reason.
   */
  const [packPreview, setPackPreview] = useState<PackPreviewState | null>(null)
  const importPack = useCallback(async (path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const answer = await window.canvas.pack.read(path === undefined ? {} : { path })
    if (answer.kind === 'cancelled') return { kind: 'ran', note: 'nothing read' }
    if (answer.kind === 'refused') return { kind: 'refused', reason: answer.reason }
    if (answer.parse.kind !== 'pack') return { kind: 'refused', reason: answer.parse.reason }
    setPackPreview({ token: answer.token, path: answer.path, pack: answer.parse.pack, warnings: answer.parse.warnings, requirements: answer.requirements ?? { credentials: [], tools: [] } })
    return { kind: 'ran', note: `${answer.parse.pack.manifest.name} — nothing is added until you choose Add` }
  }, [])
  // M255. The sample dev-relations pack: main writes it once under userData
  // and answers the path; it is then READ like any pack — same preview, same
  // inert add — so the sample earns no door of its own past the file.
  const importSamplePack = useCallback(async (): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const sample = await window.canvas.pack.sample()
    if (sample.kind === 'refused') return { kind: 'refused', reason: sample.reason }
    return importPack(sample.path)
  }, [importPack])
  const addPack = useCallback(async (token: string) => {
    const added = await window.canvas.pack.add({ token })
    if (added.kind === 'added') { reloadTemplates(); reloadPresets() }
    return added
  }, [reloadTemplates, reloadPresets])
  const exportPack = useCallback(async (path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const name = (await window.canvas.workspace.list()).find((w) => w.active)?.name ?? 'pack'
    const written = await window.canvas.pack.write({ ...(path === undefined ? {} : { path }), name })
    if (written.kind === 'cancelled') return { kind: 'ran', note: 'nothing exported' }
    if (written.kind === 'refused') return { kind: 'refused', reason: written.reason }
    return { kind: 'ran', note: `${displayPath(written.path).short} · ${written.sentence}` }
  }, [])
  const markPresetRead = useCallback(async (id: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const changed = await window.canvas.preset.markReviewed(id)
    if (!changed) return { kind: 'refused', reason: 'that preset no longer exists' }
    reloadPresets()
    return { kind: 'ran', note: 'marked read — it will spawn now' }
  }, [reloadPresets])

  /**
   * M188. RUN ONE NODE — the ONE executor the workflow's own run, the
   * inspector's Test control and the `node-test` verb all take, so a node
   * cannot behave one way when a person tests it and another when the
   * workflow runs it.
   *
   * An `action` node runs its verb LINE through `runAgentPlan` — the same
   * function the agent door takes — so a destructive step still needs its
   * confirmation, an unbindable line is refused by name, and nothing here is
   * a second executor. A `http` node's GET is main's.
   */
  const runNodeNow = useCallback(async (node: { key?: string; kind: string; line?: string; url?: string; method?: string }, caller?: AgentPlanCaller, reviewed?: boolean): Promise<{ kind: 'ok'; output: string; ms: number } | { kind: 'failed'; reason: string; ms: number }> => {
    const started = Date.now()
    if (node.kind === 'action') {
      const line = node.line ?? ''
      // M190 (the critic, finding 2). A template that ARRIVED from a file is
      // unreviewed: its action nodes hold verb lines somebody else wrote, and
      // the import is inert only until the first Run. The person opens the
      // node, sees the line and marks it reviewed; until then it is refused
      // by name with the line quoted, so the refusal is also the review.
      if (reviewed === false) {
        return { kind: 'failed', reason: `this workflow came from outside this canvas (a file, or an agent's answer) and has not been read yet — open ${node.key ?? 'the block'} and confirm its line (${line.slice(0, 80)}) before running it`, ms: Date.now() - started }
      }
      // The CALLER travels with the line: without it a teammate's plan could
      // write a verb into a template and run it with its identity erased.
      const reply = await paletteActionsRef.current?.runAgentPlan(line, caller)
      if (reply === undefined) return { kind: 'failed', reason: 'the canvas is not ready to run a verb', ms: Date.now() - started }
      return reply.kind === 'ran'
        ? { kind: 'ok', output: reply.summary, ms: Date.now() - started }
        : { kind: 'failed', reason: reply.reason, ms: Date.now() - started }
    }
    if (node.kind === 'http') {
      const answer = await window.canvas.node.fetch({ url: node.url ?? '', ...(node.method === undefined ? {} : { method: node.method }) })
      if (answer.kind === 'refused') return { kind: 'failed', reason: answer.reason, ms: Date.now() - started }
      return { kind: 'ok', output: `${answer.status} · ${answer.note}${answer.truncated ? ' · cut' : ''}\n${answer.text.slice(0, 2000)}`, ms: answer.ms }
    }
    // Three states, never two: a kind with no runtime is not a failure of the
    // node, and saying "failed" about it would send a person looking for a
    // fault in a shape that is correct.
    return { kind: 'failed', reason: `a ${node.kind} node runs as part of the workflow, not on its own — Run the workflow to start it`, ms: Date.now() - started }
  }, [])
  const runNodeRef = useRef(runNodeNow)
  runNodeRef.current = runNodeNow
  /**
   * M188. Test this node: ONE node, with its input and its answer, running no
   * neighbour and recording no run. The subject is the SELECTED block of the
   * named template's draft — what the person is looking at.
   */
  const testNode = useCallback(async (templateId: string, key?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const template = getDraft(templateId)?.template ?? allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
    if (template === undefined) return { kind: 'refused', reason: TEMPLATE_GONE }
    const chosenKey = key ?? selectedOf(templateId) ?? undefined
    if (chosenKey === undefined) return { kind: 'refused', reason: 'select a node on the diagram, or name one' }
    const node = template.nodes.find((n) => n.key === chosenKey)
    if (node === undefined) return { kind: 'refused', reason: `no node is called ${chosenKey}` }
    const outcome = await runNodeRef.current(node as { key?: string; kind: string; line?: string; url?: string; method?: string }, undefined, template.reviewed !== false)
    return outcome.kind === 'ok'
      ? { kind: 'ran', note: `${chosenKey} · ${outcome.ms} ms · ${outcome.output.split('\n')[0]?.slice(0, 120) ?? ''}` }
      : { kind: 'refused', reason: `${chosenKey} · ${outcome.ms} ms · ${outcome.reason}` }
  }, [])

  /**
   * M187. THE NOTE'S THREE VERBS. One record, three forms, and one door each:
   * add (the palette's rows and the agent's verb), set the text (the node's
   * own editor commits through here, so the canvas's history has one entry
   * per commit rather than one per keystroke), and tint (a sticky's alone).
   */
  const addNote = useCallback((form: string, text?: string, world?: Point): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    if (!isNoteForm(form)) return { kind: 'refused', reason: `${form} is not a note form — ${NOTE_FORMS.join(', ')}` }
    const at = world ?? screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
    const noteId = `nt${nextIdRef.current++}`
    setPanels((current) => {
      // A FRAME goes to the BACK: a region drawn over the objects it encloses
      // would cover them at the moment it is made, and the first thing a
      // person would have to do is send it backwards.
      const z = form === 'frame' ? Math.min(0, ...current.map((p) => p.z)) - 1 : nextZ(current)
      const next = [...current, makeNotePanel(noteId, cascadeCentre(at, current), z, form, normaliseNoteText(text ?? ''))]
      commitHistory(next)
      return next
    })
    selectOnly(noteId)
    return { kind: 'ran', note: `${form} note` }
  }, [commitHistory, selectOnly])
  const setNoteText = useCallback((panelId: string, text: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    const target = panelsRef.current.find((p) => p.rect.id === panelId)
    if (target === undefined || !isNotePanel(target)) return { kind: 'refused', reason: 'that panel is not a note' }
    const next = normaliseNoteText(text)
    setPanels((current) => {
      const updated = current.map((p) => (p.rect.id === panelId && isNotePanel(p) ? { ...p, note: { ...p.note, text: next } } : p))
      commitHistory(updated)
      return updated
    })
    return { kind: 'ran', note: noteSummary(next, target.note.form) }
  }, [commitHistory])
  const setNoteTint = useCallback((panelId: string, tint: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    const target = panelsRef.current.find((p) => p.rect.id === panelId)
    if (target === undefined || !isNotePanel(target)) return { kind: 'refused', reason: 'that panel is not a note' }
    if (!isNoteTint(tint)) return { kind: 'refused', reason: `${tint} is not a tint — ${NOTE_TINTS.join(', ')}` }
    if (target.note.form !== 'sticky') return { kind: 'refused', reason: 'only a sticky note carries a tint' }
    setPanels((current) => {
      const updated = current.map((p) => (p.rect.id === panelId && isNotePanel(p) ? { ...p, note: { ...p.note, tint } } : p))
      commitHistory(updated)
      return updated
    })
    return { kind: 'ran', note: `${tint} note` }
  }, [commitHistory])

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
  const flowchart = useFlowchartVerbs({ setPanels, commitHistory, panelsRef, nextIdRef, mergedRef, selectedIdsRef, selectOnly, addToSelection, onBeginDrag, worldCentre, releaseKeyboard, visibleWorld, stepRef: shapeStepRef })
  // The shapes, in their own array for the ShapeLayer: a new array only when
  // `displayPanels` is (a panel changed) — never on a camera frame.
  const shapePanels = useMemo(() => displayPanels.filter(isShapePanel), [displayPanels])
  // The minimap's set: its identity changes only when a shape is added or removed.
  const shapeIdKey = shapePanels.map((p) => p.rect.id).join(',')
  const shapeIdSet = useMemo(() => new Set(shapeIdKey === '' ? [] : shapeIdKey.split(',')), [shapeIdKey])
  // M389. Connectors: their views, the draw from a shape's port, their verbs.
  const connectors = useConnectors({
    setPanels, commitHistory, panelsRef, displayPanels, hitOrderRef, nextIdRef, hostRef, viewportRef, mergedRef,
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
    paste: (text) => flowchart.pasteObjects(text) || flowchartIO.importPasted(text)
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
    const at = world ?? screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
    const imageId = `img${nextIdRef.current++}`
    setPanels((current) => {
      const next = [...current, makeImagePanel(imageId, at, nextZ(current), stored.path, displayPath(path).short, stored.id)]
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
    const at = world ?? screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
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

  /**
   * M185. THE PREVIEW'S FOUR VERBS, all over one subject rule.
   *
   * The SUBJECT of discovery is a running terminal or chat — the panel that
   * has a directory and a process tree — because that is the only thing on
   * this canvas that knows what project is open and what it started. The
   * focused panel first, then the selection; no subject is a REFUSAL BY NAME
   * that says what to select, never a silent nothing.
   */
  const previewSubject = useCallback((): { id: string; cwd: string; pids: number[] } | undefined => {
    const candidates = [focusedIdRef.current, ...selectedIdsRef.current].filter((id): id is string => id !== null && id !== undefined)
    for (const id of candidates) {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      if (panel === undefined) continue
      if (isChatPanel(panel)) return { id, cwd: panel.chat.cwd, pids: [] }
      if (!isTerminalPanel(panel)) continue
      const status = registry.get(id)?.status
      const cwd = getLiveSession(id)?.cwd ?? panel.spec.cwd
      return { id, cwd, pids: status?.kind === 'running' ? [status.pid] : [] }
    }
    return undefined
  }, [registry])
  // M195 (D03). One subscription for every preview on the canvas: a file
  // change reloads the pane BOUND to the folder it happened in, and no other.
  usePreviewReload({ onScreenPanelsRef: displayPanelsRef })
  const REASON_NO_PREVIEW_SUBJECT = 'select the terminal your project runs in — discovery reads that panel\'s own directory and processes'
  const discoverProject = useCallback(async (): Promise<PreviewDiscovery | { kind: 'refused'; reason: string }> => {
    const subject = previewSubject()
    if (subject === undefined) return { kind: 'refused', reason: REASON_NO_PREVIEW_SUBJECT }
    return window.canvas.preview.discover({ pids: subject.pids, cwd: subject.cwd })
  }, [previewSubject])
  /** The pane the verbs act on: the selected browser panel, else the focused one. */
  const previewPane = useCallback((): Extract<Panel, { kind: 'browser' }> | undefined => {
    const ids = [...selectedIdsRef.current, focusedIdRef.current]
    for (const id of ids) {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      if (panel !== undefined && isBrowserPanel(panel)) return panel
    }
    return undefined
  }, [])
  /**
   * M195 (D03). THE BINDING, taken from the SAME subject rule discovery reads.
   *
   * That sameness is what makes it honest rather than a guess: the folder a
   * preview reloads for is the folder its candidate list was answered from. A
   * cwd that is not absolute (a preset's `~`, a spec never resolved) binds
   * NOTHING — `shared/places.ts`'s rule reached from the display side: a
   * relative root would have to be resolved against a root nobody chose, and
   * the pane would then follow whatever that guess hit.
   */
  const previewBindingFor = useCallback((subject: { id: string; cwd: string } | undefined): PreviewBinding | undefined => {
    if (subject === undefined) return undefined
    const root = normalisePreviewPath(subject.cwd)
    return root === null ? undefined : { root, sourcePanelId: subject.id }
  }, [])
  const bindPreview = useCallback((paneId?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    // NAMED by the pane's own control, found by the verb's subject rule
    // otherwise — `setPreviewWidth`'s rule, and for its reason: with two panes
    // selected, a control that did not name itself bound the OTHER one and
    // then rendered the success note on the pane that had not changed.
    const named = paneId === undefined ? undefined : panelsRef.current.find((p) => p.rect.id === paneId)
    const pane = named !== undefined && isBrowserPanel(named) ? named : previewPane()
    if (pane === undefined) return { kind: 'refused', reason: 'select a preview pane first' }
    const subject = previewSubject()
    if (subject === undefined) return { kind: 'refused', reason: REASON_NO_PREVIEW_SUBJECT }
    const binding = previewBindingFor(subject)
    if (binding === undefined) {
      return { kind: 'refused', reason: `that panel's folder is not an absolute path (${subject.cwd === '' ? 'it has none' : subject.cwd}) — there is nothing to bind this preview to` }
    }
    // The filesystem root is refused BY NAME rather than accepted: a pane bound
    // to `/` reloads for every change anywhere, which is the behaviour this
    // milestone exists to end, arrived at by a different road.
    if (binding.root === '/') return { kind: 'refused', reason: 'that panel sits at the filesystem root, so binding to it would reload this preview for every change on the machine — point the panel at a project first' }
    setPanels((current) => {
      const next = current.map((p) => (p.rect.id === pane.rect.id && isBrowserPanel(p) ? { ...p, preview: binding } : p))
      commitHistory(next)
      return next
    })
    return { kind: 'ran', note: `${pane.title ?? 'the preview'} reloads for ${displayPath(binding.root, binding.root).short}` }
  }, [commitHistory, previewBindingFor, previewPane, previewSubject])
  /**
   * M195. Why the pane's Bind control is not available, computed at RENDER so
   * the control can be present-and-disabled with its reason rather than
   * answering a refusal after a press. Safe to call here: `focusedIdRef` and
   * `selectedIdsRef` are both assigned during this render, above.
   */
  const previewSubjectReason = previewSubject() === undefined ? REASON_NO_PREVIEW_SUBJECT : undefined
  const openPreview = useCallback(async (url?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    // M252. An unread tool's pane loads NOTHING, from any door — its page is
    // code nobody has read, and pointing the pane at it is running it.
    if (previewPane()?.preview?.reviewed === false) return { kind: 'refused', reason: REASON_TOOL_UNREAD }
    if (url !== undefined) {
      const normalised = normaliseTypedUrl(url)
      if (normalised.kind === 'refused') return { kind: 'refused', reason: normalised.reason }
      // An open pane is POINTED at the page rather than a second pane minted:
      // two panes on one project is the thing a person then has to tidy. The
      // record is written and the guest reloaded through the store's own door,
      // which is what the node listens to — never a second guest.
      const pane = previewPane()
      // M195. The pane is BOUND to the same subject discovery reads, and the
      // note says which folder — so a binding is never made silently, and a
      // pane opened against no subject says it is bound to nothing rather
      // than quietly reloading for everything (which is what it used to do).
      const binding = previewBindingFor(previewSubject())
      // What the note says about the source, for whichever binding the pane
      // ends up with — the new one, the one it already had, or none.
      const sourceNote = (bound: PreviewBinding | undefined): string =>
        bound === undefined ? 'not bound to a folder yet' : `reloads for ${displayPath(bound.root, bound.root).short}`
      // The guest is NAVIGATED (M185's critic, finding 2) — a reload reloads
      // the page it already has, and the record's new url would then be
      // written back to the old one by the guest's own did-navigate.
      if (pane !== undefined && navigateBrowser(pane.rect.id, normalised.url)) {
        // A navigation writes the url with NO history entry (M186's rule — the
        // guest's own did-navigate writes it back constantly). A BINDING is a
        // deliberate change to what this pane is a preview of, so when this
        // open changes one it takes a history entry, the same as the bind door:
        // otherwise the two doors would disagree about whether binding can be
        // undone, and an accidental rebind here could not be.
        const rebinds = binding !== undefined && binding.root !== pane.preview?.root
        setPanels((current) => {
          const next = current.map((p) => (p.rect.id === pane.rect.id && isBrowserPanel(p)
            // An existing binding is KEPT when this open knows no better one: a
            // person navigating a bound preview to another page of the same
            // project has not unbound it.
            ? { ...p, url: normalised.url, ...(binding === undefined ? {} : { preview: binding }) }
            : p))
          if (rebinds) commitHistory(next)
          return next
        })
        return { kind: 'ran', note: `${pane.title ?? 'the preview'} now shows ${normalised.url} · ${sourceNote(binding ?? pane.preview)}` }
      }
      openBrowserPanel(normalised.url, binding)
      return { kind: 'ran', note: `opened ${normalised.url} · ${sourceNote(binding)}` }
    }
    const found = await discoverProject()
    if (found.kind === 'refused') return found
    if (found.kind === 'one') {
      const one = found.candidates[0]
      if (one === undefined) return { kind: 'refused', reason: found.note }
      // M195. Discovery answered ABOUT the subject, so the pane it opens is
      // bound to that subject's own folder — the binding and the candidate
      // come from one question.
      openBrowserPanel(one.url, previewBindingFor(previewSubject()))
      return { kind: 'ran', note: found.note }
    }
    // `many` and `none` are two different next actions and neither is an open:
    // the note says which, and the pane's own list is where a person picks.
    return { kind: 'refused', reason: found.note }
  }, [discoverProject, openBrowserPanel, previewBindingFor, previewPane, previewSubject])
  /**
   * The pane is NAMED by the pane's own control and found by the verb's
   * subject rule otherwise. The first cut had the control `selectOnly` the
   * pane and then call this, which reads the selection through a ref that
   * React had not written yet — the chip did nothing at all on a pane that
   * was not already selected, and the state update it depended on arrived
   * one render later.
   */
  const setPreviewWidth = useCallback((device: string, paneId?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } => {
    if (!isDeviceWidthId(device)) return { kind: 'refused', reason: `${device} is not a device width — ${DEVICE_WIDTHS.map((d) => d.id).join(', ')}` }
    const named = paneId === undefined ? undefined : panelsRef.current.find((p) => p.rect.id === paneId)
    const pane = named !== undefined && isBrowserPanel(named) ? named : previewPane()
    if (pane === undefined) return { kind: 'refused', reason: 'select a preview pane first' }
    setPanels((current) => {
      // `full` is the ABSENT default, so choosing it REMOVES the key rather
      // than writing `device: 'full'`: the record, the parser and the node all
      // spell "the pane's own width" as the absence, and a written `full`
      // would be a second spelling that only the parser would ever see.
      const next = current.map((p) => {
        if (p.rect.id !== pane.rect.id || !isBrowserPanel(p)) return p
        const { device: _was, ...rest } = p
        return (device === 'full' ? rest : { ...rest, device }) as typeof p
      })
      commitHistory(next)
      return next
    })
    return { kind: 'ran', note: `${deviceWidth(device).label} in ${pane.title ?? 'the preview'}` }
  }, [commitHistory, previewPane])
  const capturePreviewNow = useCallback(async (): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    const pane = previewPane()
    if (pane === undefined) return { kind: 'refused', reason: 'select a preview pane first' }
    const guestId = browserGuestId(pane.rect.id)
    if (guestId === undefined) return { kind: 'refused', reason: 'no page is open in this pane — open one, then capture it' }
    const shot = await window.canvas.preview.capture({ webContentsId: guestId })
    if (shot.kind === 'refused') return { kind: 'refused', reason: shot.reason }
    // A capture is an ORDINARY image object, not a new kind: it moves, groups,
    // exports and deletes like every other picture, and its title names the
    // page it is of so its provenance is on screen rather than in a log.
    const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
    const imageId = `img${nextIdRef.current++}`
    // D12. The task is the one whose lane the pane previews, found through the
    // binding's source panel — never guessed from the camera or the title.
    const boundTo = pane.preview?.sourcePanelId
    const task = boundTo === undefined ? undefined : workItemsRef.current.find((item) => item.panelId === boundTo)
    const artifact = { kind: 'capture' as const, id: shot.id, url: shot.url, capturedAt: shot.capturedAt, sourcePanelId: pane.rect.id, ...(task === undefined ? {} : { taskId: task.id }) }
    setPanels((current) => {
      const next = [...current, makeImagePanel(imageId, cascadeCentre(centre, current), nextZ(current), shot.path, `capture · ${shot.host}`, undefined, artifact)]
      commitHistory(next)
      return next
    })
    selectOnly(imageId)
    // M320. A capture of a task's lane is one of the task's DELIVERABLES, and
    // its provenance used to live only on the image panel — delete the panel,
    // lose the fact. The row keeps it (the capture id is main's file name),
    // naming the pane it was taken in even after that pane is gone.
    if (task !== undefined) {
      void recordOrchEvent({
        runId: runOfTask(task.id) ?? adoptedRunId(task.id), itemId: task.id, event: 'artifact', source: 'person',
        title: `Captured ${shot.host}`, detail: shot.url, key: `capture:${shot.id}`, panelId: pane.rect.id,
        producer: { title: pane.title ?? 'a preview', kind: 'browser' }, at: shot.capturedAt
      })
    }
    return { kind: 'ran', note: `captured ${shot.url}` }
  }, [commitHistory, previewPane, selectOnly])
  const startDevServer = useCallback(async (script?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    // M252. The dev script is a generated tool's COMMAND: no process for an
    // unread one, whichever door asked.
    if (previewPane()?.preview?.reviewed === false) return { kind: 'refused', reason: REASON_TOOL_UNREAD }
    const subject = previewSubject()
    if (subject === undefined) return { kind: 'refused', reason: REASON_NO_PREVIEW_SUBJECT }
    const found = await window.canvas.preview.discover({ pids: subject.pids, cwd: subject.cwd })
    const chosen = script === undefined ? found.scripts[0] : found.scripts.find((s) => s.name === script)
    if (chosen === undefined) {
      return { kind: 'refused', reason: found.scripts.length === 0 ? found.note : `${script} is not one of this project's dev scripts — ${found.scripts.map((s) => s.name).join(', ')}` }
    }
    // Through the ORDINARY spawn door: the dev server is a panel a person can
    // see, read and stop, never a hidden child of the preview. Discovery
    // itself still runs nothing — this is a separate verb a person asked for.
    // `npm run <name>` and not the script's own command: the script line is
    // what npm runs FOR you (it resolves the project's own binaries), and
    // running it directly would miss node_modules/.bin. The pane's tooltip
    // says both, so the promise and the spawn agree (M185's critic, 5).
    const spawned = await window.canvas.spawn.sheet({ cwd: subject.cwd, command: `npm run ${chosen.name}`, title: `${chosen.name} · ${found.project ?? 'project'}` })
    if (spawned.kind === 'refused') return { kind: 'refused', reason: spawned.reason }
    return { kind: 'ran', note: `npm run ${chosen.name} in ${subject.cwd}` }
  }, [previewSubject])

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

  /**
   * M181. THE STARTER CANVAS, laid out around the conversation. Idempotent
   * through the workspace's record: only keys never applied are minted, so a
   * canvas the person has edited is never overwritten and a closed example
   * stays closed. Every object goes through an ordinary path — the chat
   * through `beginNewChat` (it spawns on its first send), the terminal as a
   * DORMANT login-shell card (it wakes on the first click, M4b), the note as
   * a prose file panel over a real Markdown file main wrote once, the
   * workflow as M133's projection, the image as the fifteenth kind over the
   * PNG main wrote beside the note. The examples land in ONE history entry
   * after the chat's own; nothing spawns.
   */
  const applyStarter = useCallback(async (): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> => {
    // Every arm says what it decided on the console: a starter that quietly did
    // nothing is indistinguishable from a click that missed (the journey check).
    const say = (what: string): void => { console.info(`[starter] ${what}`) }
    if (mergedRef.current) { say('refused: merged'); return { kind: 'refused', reason: 'the merged view is read-only — leave it to open the starter canvas' } }
    const keys = starterKeysToApply(starterRef.current)
    if (keys.length === 0) { say('refused: every key applied'); return { kind: 'refused', reason: 'every starter object is already on this canvas — close what you do not need; a reset lays it out again' } }
    // A canvas with panels and NO record is the person's own arrangement:
    // the starter lays itself out on an empty canvas only (the primary's
    // door) and never over what is there (the critic's finding 6).
    if (starterRef.current === undefined && panelsRef.current.length > 0) { say('refused: canvas not empty'); return { kind: 'refused', reason: 'this canvas already has panels — the starter lays out on an empty canvas; reset the canvas or make a new workspace for it' } }
    const applied = [...(starterRef.current?.keys ?? [])]
    let origin: WorldRect | undefined = panelsRef.current.find((p): p is ChatPanel => isChatPanel(p))?.rect
    if (keys.includes(AGENT_KEY)) {
      const readiness = onboardingReadiness(envReportRef.current)
      if (readiness.preferred === undefined) { say('refused: no engine discovered'); return { kind: 'refused', reason: 'no conversation engine has been discovered — the starter canvas begins with an agent; install one and Check again' } }
      say(`minting the chat with ${readiness.preferred}`)
      // The chat is placed EXACTLY at the view's centre (`at`), so its rect is
      // known here without waiting for React to commit `beginNewChat`'s
      // setPanels: a frame wait never fired in a hidden window (the shot
      // harness) and a timer is not a commit guarantee (the critic, twice).
      const centre = worldCentre()
      const result = await beginNewChat({ backend: readiness.preferred, title: 'your agent', at: centre })
      if (result.kind === 'refused') { say(`chat refused: ${result.reason}`); return result }
      say(`chat ${result.id ?? '(no id)'} minted`)
      applied.push(AGENT_KEY)
      origin = { id: result.id ?? '', x: centre.x - CHAT_W / 2, y: centre.y - CHAT_H / 2, w: CHAT_W, h: CHAT_H }
    }
    const at: WorldRect = origin ?? { id: '', x: worldCentre().x - CHAT_W / 2, y: worldCentre().y - CHAT_H / 2, w: CHAT_W, h: CHAT_H }
    const wanted = STARTER_OBJECTS.filter((o) => keys.includes(o.key))
    let files: { notePath: string; imagePath: string } | undefined
    if (wanted.some((o) => o.kind === 'file' || o.kind === 'image')) {
      // A refusal after the chat was minted still RECORDS the chat's key: a second click must not mint a second conversation (idempotence, the critic's finding 5).
      try { files = await window.canvas.starter.prepare() } catch { setStarter({ version: STARTER_VERSION, keys: applied }); say('refused: starter files'); return { kind: 'refused', reason: 'the starter files could not be written under the app\'s own folder' } }
    }
    const minted: Panel[] = []
    const captions: Annotation[] = []
    const dormant: string[] = []
    for (const o of wanted) {
      const centre = { x: at.x + o.rect.dx + o.rect.w / 2, y: at.y + o.rect.dy + o.rect.h / 2 }
      const size = { w: o.rect.w, h: o.rect.h }
      const z = nextZ([...panelsRef.current, ...minted]) + 1
      let panel: Panel
      if (o.kind === 'terminal') { const id = `n${nextIdRef.current++}`; panel = { ...makePanel(id, centre, z, undefined, size), title: 'a terminal' }; dormant.push(id) }
      else if (o.kind === 'file') { panel = { ...makeFilePanel(`f${nextIdRef.current++}`, centre, z, { path: files!.notePath, prose: true }, size), title: 'a note' } }
      else if (o.kind === 'workflow') { const t = BUILT_IN_TEMPLATES[0]; const p = makeWorkflowPanel(`wf${nextIdRef.current++}`, centre, z, t.id, t.name); panel = { ...p, rect: { ...p.rect, x: centre.x - size.w / 2, y: centre.y - size.h / 2, w: size.w, h: size.h } } }
      else { const p = makeImagePanel(`im${nextIdRef.current++}`, centre, z, files!.imagePath, 'an image'); panel = { ...p, rect: { ...p.rect, x: centre.x - size.w / 2, y: centre.y - size.h / 2, w: size.w, h: size.h } } }
      minted.push(panel)
      captions.push({ id: `a${Date.now().toString(36)}${(annotationSeq.current++).toString(36)}`, text: o.caption, anchor: { kind: 'panel', panelId: panel.rect.id, dx: 0, dy: panel.rect.h + 22 } })
      applied.push(o.key)
    }
    if (minted.length > 0) {
      // A FUNCTIONAL update, never a value from the ref: the chat's own
      // setPanels is still queued at this point, and a value computed from
      // the ref would replace the array WITHOUT the chat (the act-close
      // visual run: four examples, no conversation).
      setPanels((current) => { const next = [...current, ...minted]; commitHistory(next); return next })
      if (dormant.length > 0) setDormantIds((current) => new Set([...current, ...dormant]))
      setAnnotations((current) => [...current, ...captions].slice(-ANNOTATIONS_MAX))
      const number = nextGroupIdRef.current++
      setGroups((current) => [...current, { id: `g${number}`, label: 'Examples', colour: GROUP_COLOURS[(number - 1) % GROUP_COLOURS.length], panelIds: minted.map((p) => p.rect.id) }])
      // The camera FITS the arrangement (M146's fit, which knows the visible
      // viewport with the inspector open): minted at the view's centre, the
      // chat sat on the right edge with every example off screen under the
      // minimap, and a pan alone left the column under the inspector.
      fitSelection([at, ...minted.map((p) => p.rect)])
    }
    setStarter({ version: STARTER_VERSION, keys: applied })
    say(`laid out ${minted.map((p) => p.rect.id).join(', ') || 'nothing new'}`)
    return { kind: 'ran', note: `${keys.length} starter object${keys.length === 1 ? '' : 's'} laid out` }
  }, [beginNewChat, commitHistory, worldCentre, fitSelection])

  // M248. The deck's view (slide on show, staged proposal) is a fact about the file, carried like the checklist's.
  const setDeckView = useCallback((id: string, view: DeckView) => {
    setPanels((current) => current.map((panel) => isFilePanel(panel) && panel.rect.id === id
      ? { ...panel, source: { ...panel.source, deck: view } } : panel))
  }, [])
  const setChecklistView = useCallback((id: string, view: ChecklistView) => {
    setPanels((current) => current.map((panel) => isFilePanel(panel) && panel.rect.id === id
      ? { ...panel, source: { ...panel.source, checklist: view } } : panel))
  }, [])
  // M252. What a described tool becomes on the canvas — and nothing it
  // becomes is RUN. A workflow is saved `reviewed: false`, so M190's refusal
  // names each action block until a person reads it; an app opens as a
  // preview whose binding is unread, so the pane makes no guest at all. The
  // note is returned, never `say()`d: say opens the palette (M149), and the
  // inert object on the canvas already says what it is.
  const arriveTool = useCallback(async (result: ToolGenerateResult, at: Point): Promise<CreationResult> => {
    if (result.kind === 'refused') return result
    const dropped = result.dropped.length === 0 ? '' : ` · ${result.dropped.length} part${result.dropped.length === 1 ? '' : 's'} of the answer left out: ${result.dropped.join('; ')}`
    if (result.kind === 'workflow') {
      const saved = await window.canvas.template.save(result.template)
      if (saved.kind !== 'saved') return { kind: 'refused', reason: saved.reason }
      const rows = await window.canvas.template.list()
      templateRowsRef.current = rows
      setTemplateRows(rows)
      openWorkflowPanel(saved.template.id, at)
      return { kind: 'ran', note: `${saved.template.name} arrived as a workflow — nothing has run; read its blocks, then choose "I've read this" to allow runs${dropped}` }
    }
    openBrowserPanel(result.url, { root: result.root, reviewed: false, tool: result.capabilities }, at)
    return { kind: 'ran', note: `${result.name} arrived in ${result.root} — nothing of it has run; read what it can reach, then choose "I've read this"${dropped}` }
  }, [openWorkflowPanel, openBrowserPanel])
  // M252. "I've read this" — a PERSON'S act, and deliberately NOT a verb: no
  // palette row, no agent line, no workflow node reaches either function
  // below (verify:verbs tool.door.1), so an agent cannot un-inert its own
  // answer — the shape of Mark reviewed on a review (M202). The workflow's
  // mark is cleared on the RECORD at the revision it was read at; a stale
  // save is refused and said, like any other.
  const markTemplateRead = useCallback(async (templateId: string): Promise<void> => {
    const template = templateRowsRef.current.find((t) => t.id === templateId)
    if (template === undefined) return
    let revision = template.revision ?? 0
    if (template.reviewed === false) {
      const read = { ...template }
      delete read.reviewed
      const saved = await window.canvas.template.save(read, template.revision)
      if (saved.kind !== 'saved') { paletteActionsRef.current?.say(saved.reason); return }
      revision = saved.template.revision ?? revision
      // The renderer's own copies change THE MOMENT the save lands, before the
      // list round-trip: a Run pressed in that gap read the unread row and was
      // refused (verify:panels tool.2, diagnosed by its own detail).
      templateRowsRef.current = templateRowsRef.current.map((t) => (t.id === templateId ? saved.template : t))
      markDraftRead(templateId, revision)
      const rows = await window.canvas.template.list()
      templateRowsRef.current = rows
      setTemplateRows(rows)
      return
    }
    // Run runs the DRAFT when there is one (M184): a record already read with
    // a draft still marked would leave every door refused.
    markDraftRead(templateId, revision)
  }, [])
  const markPreviewRead = useCallback((paneId: string): void => {
    setPanels((current) => current.map((panel) => {
      if (!isBrowserPanel(panel) || panel.rect.id !== paneId || panel.preview?.reviewed !== false) return panel
      const preview = { ...panel.preview }
      delete preview.reviewed
      return { ...panel, preview }
    }))
  }, [])
  // M250. The ONE writer of `reviewed: true` — a person's click on the note.
  const setImportReviewed = useCallback((id: string) => {
    setPanels((current) => current.map((panel) => isFilePanel(panel) && panel.rect.id === id && panel.source.imported !== undefined
      ? { ...panel, source: { ...panel.source, imported: { ...panel.source.imported, reviewed: true as const } } } : panel))
  }, [])
  // M245. Widths and loss consent, never cells — the file holds those.
  const setSheetView = useCallback((id: string, view: SheetView) => {
    setPanels((current) => current.map((panel) => isFilePanel(panel) && panel.rect.id === id
      ? { ...panel, source: { ...panel.source, sheet: view } } : panel))
  }, [])
  const creationWorkspaceRef = useRef<string | undefined>(undefined)
  creationWorkspaceRef.current = workspaceRows.find((w) => w.active)?.id
  // M338. The active workspace's share, for a relay session started in it.
  const creationShareRef = useRef<string | undefined>(undefined)
  creationShareRef.current = workspaceRows.find((w) => w.active)?.share?.id
  // M344. The relay strip names people from this workspace's presence roster
  // ("sam is in control"), not by the first eight characters of a uuid.
  const rosterNames = useRosterNames(activeWorkspaceId)
  const relayNameFor = useCallback((userId: string): string => relayNameOf(rosterNames, userId), [rosterNames])
  const createObject = useCallback(async (kind: string, value?: string): Promise<CreationResult> => {
    const entry = CREATABLE_OBJECTS.find((item) => item.id === kind)
    if (!entry) return { kind: 'refused', reason: `unknown object kind: ${kind}` }
    const reason = creationReason(entry, { merged: mergedRef.current, noteRoot: noteRootRef.current })
    if (reason) return { kind: 'refused', reason }
    // Capture the workspace as well as the camera before an asynchronous chooser.
    // A late answer must not mint into another workspace after a switch.
    const workspace = creationWorkspaceRef.current
    const at = worldCentre()
    const current = (): boolean => creationWorkspaceRef.current === workspace && !mergedRef.current && !transitionRef.current
    const refused = (): CreationResult => ({ kind: 'refused', reason: 'the workspace changed — create the object again here' })
    const host: CreationHost = {
      terminal: async () => { onSpawn(at, { cwd: noteRootRef.current ?? '~', args: [] }, { exact: true, focus: true }); return { kind: 'ran' } },
      agent: async () => {
        const readiness = onboardingReadiness(await window.canvas.env.report())
        if (!current()) return refused()
        if (!readiness.preferred) return { kind: 'refused', reason: 'no conversation engine is available — check readiness' }
        const result = await beginNewChat({ backend: readiness.preferred, at })
        return result.kind === 'refused' ? result : { kind: 'ran' }
      },
      document: async (view, name) => {
        const root = noteRootRef.current
        if (!root) return { kind: 'refused', reason: 'select a panel with a workspace folder first' }
        if (view === 'sheet') {
          // M245. A new sheet is an empty CSV. xlsx is opened, never minted: an
          // empty workbook is a file nobody asked for in a format they did not choose.
          const filename = name?.trim() || `sheets/sheet-${Date.now()}.csv`
          if (!/\.(csv|tsv)$/i.test(filename)) return { kind: 'refused', reason: 'choose a filename ending in .csv or .tsv' }
          const made = await window.canvas.file.create({ root, name: filename, seed: '' })
          if (made.kind !== 'created') return { kind: 'refused', reason: made.kind === 'exists' ? 'that file already exists — choose another filename' : made.detail }
          if (!current()) return { kind: 'refused', reason: `created ${made.path}; the workspace changed, so open the file there explicitly` }
          openFilePanel(made.path, at, { exact: true, sheet: {} })
          return { kind: 'ran' }
        }
        const checklist = view === 'checklist'
        const filename = name?.trim() || `notes/${view}-${Date.now()}.md`
        if (!/\.md$/i.test(filename)) return { kind: 'refused', reason: 'choose a Markdown filename ending in .md' }
        const seed = view === 'deck' ? DECK_SEED : `# ${checklist ? 'Checklist' : 'Note'}\n\n`
        const result = await window.canvas.file.create({ root, name: filename, seed })
        if (result.kind !== 'created') return { kind: 'refused', reason: result.kind === 'exists' ? 'that file already exists — choose another filename' : result.detail }
        if (!current()) return { kind: 'refused', reason: `created ${result.path}; the workspace changed, so open the file there explicitly` }
        openFilePanel(result.path, at, view === 'deck' ? { deck: {}, exact: true } : { prose: true, exact: true, ...(checklist ? { checklist: { accepted: seed } } : {}) })
        return { kind: 'ran' }
      },
      image: async (path) => {
        const chosen = path ?? await window.canvas.asset.choose()
        if (!current()) return refused()
        if (!chosen) return { kind: 'refused', reason: 'no image chosen' }
        return addImageFromPath(chosen, at)
      },
      workflow: async () => {
        const result = await window.canvas.template.save({ name: 'New workflow', nodes: [], edges: [] })
        if (result.kind !== 'saved') return { kind: 'refused', reason: result.reason }
        if (!current()) return refused()
        const rows = await window.canvas.template.list()
        if (!current()) return refused()
        templateRowsRef.current = rows
        setTemplateRows(rows)
        openWorkflowPanel(result.template.id, at)
        return { kind: 'ran' }
      },
      browser: async (url) => {
        const parsed = normaliseTypedUrl(url ?? 'http://localhost:3000')
        if (parsed.kind === 'refused') return { kind: 'refused', reason: 'use an http(s) URL' }
        openBrowserPanel(parsed.url, undefined, at)
        return { kind: 'ran' }
      },
      relay: async (value) => {
        // Asked FIRST: a relay that is not set up, or a person not signed in,
        // is refused by name here rather than as a dead panel on the canvas.
        const listed = await window.canvas.relay.list()
        if (!current()) return refused()
        if (listed.kind === 'refused') return { kind: 'refused', reason: listed.reason }
        const typed = value?.trim() ?? ''
        const attach = /^attach\s+(\S+)$/.exec(typed)
        if (attach !== null) {
          const sessionId = attach[1]!
          if (!RELAY_SESSION_ID.test(sessionId)) return { kind: 'refused', reason: 'that is not a relay session id' }
          const meta = listed.sessions.find((s) => s.sessionId === sessionId)
          if (meta === undefined) return { kind: 'refused', reason: 'no session by that id that you may attach to — it may have ended' }
          openRelayPanel({ program: meta.program, sessionId, ...(meta.shareId === null ? {} : { shareId: meta.shareId }) }, at)
          return { kind: 'ran' }
        }
        const program = typed === '' ? 'shell' : typed
        if (!RELAY_PROGRAM.test(program)) return { kind: 'refused', reason: 'name a program on the relay (like shell), or attach <session id>' }
        // A shared workspace's session is bound to its share, so its members
        // may attach by their role; an unshared one is the owner's alone.
        const shareId = creationShareRef.current
        openRelayPanel({ program, ...(shareId === undefined ? {} : { shareId }) }, at)
        return { kind: 'ran' }
      },
      tool: async (description) => {
        const folder = noteRootRef.current
        if (!folder) return { kind: 'refused', reason: 'select a panel with a workspace folder first — a tool is made inside one' }
        const typed = description?.trim() ?? ''
        if (typed === '') {
          // The palette FIRST: input mode is cleared whenever the palette is
          // closed, so a prompt set on a closed palette would vanish unseen.
          palette.openPalette()
          setInputMode({ kind: 'text', label: 'Describe a tool — what should it do?', initial: '', submit: (said) => { setInputMode(null); if (said.trim() !== '') void createObject('tool', said) } })
          return { kind: 'ran' }
        }
        const result = await window.canvas.tool.generate({ description: typed, folder })
        if (!current()) return refused()
        return arriveTool(result, at)
      }
    }
    try { const result = await entry.create(host, value); if (result.kind === 'refused') paletteActionsRef.current?.say(result.reason); return result }
    catch (error) { const reason = `Could not create ${entry.label.toLowerCase()}: ${String(error)}`; paletteActionsRef.current?.say(reason); return { kind: 'refused', reason } }
  }, [worldCentre, onSpawn, beginNewChat, openFilePanel, addImageFromPath, openWorkflowPanel, openBrowserPanel, openRelayPanel, arriveTool, palette])
  /**
   * M205 (D09). THE FIRST START — the launcher's primary. A sentence and a
   * folder, run through D05's own executor (`startWork` → `dispatchWorkItem`),
   * so a new person starts through the same path a returning one does.
   *
   * The ORDER is the rule: the pure plan, then the repository question, and
   * only then any mint. `git:status` is read-only, so a folder that is not a
   * repository (or a machine with no git) refuses having minted nothing — no
   * teammate holding a grant for a start that never happened, no card.
   *
   * The teammate is REUSED when a standing one's place contains the folder;
   * otherwise one is minted whose only place is exactly that folder
   * (`firstWorkPlan`'s rules). Main's Places gate stays the authority.
   *
   * A retry of the same sentence in the same folder resumes the SAME item
   * (M198's recovery journal lives on it): the launcher stays up after a
   * refusal BEFORE any mint (`firstWorkPlan`'s own refusals, `not-a-repository`
   * — nothing named above is on the canvas yet, so there is nothing to show
   * but the launcher's own line), and a second press must not mint a twin
   * card. A refusal AFTER the mint (`startWork` itself failing) instead puts
   * the teammate's card on the canvas — the critic's "orphans" finding
   * (M205 2.5): without a panel, a real teammate and a real `todo` item would
   * sit invisibly in the store with only `dispatchWorkItemAttempt`'s own
   * `note` recording why, findable by nobody who does not go looking. The
   * card surfaces that same note and offers the same dispatch retry every
   * other work item already does, so this failure reads and recovers exactly
   * like any other rather than needing a launcher-only special case.
   */
  const firstWorkItemRef = useRef<{ key: string; itemId: string } | null>(null)
  const startFirstWork = useCallback(async (req: FirstWorkRequest): Promise<FirstWorkOutcome> => {
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
    const plan = firstWorkPlan(req, { teammates: teammatesRef.current, readiness: onboardingReadiness(envReportRef.current) })
    if (plan.kind === 'refused') return { kind: 'refused', reason: plan.reason }
    // Codex-only: no lane, so no repository question — a conversation in the
    // folder needs no branch. Inserted, never sent (M80), like chatInFolder.
    if (plan.kind === 'chat') {
      const message = req.intention.trim()
      const r = await beginNewChat({ cwd: plan.folder, ...(plan.engine === LANE_ENGINE ? {} : { backend: plan.engine }), ...(message === '' ? {} : { message }) })
      if (r.kind === 'refused') return { kind: 'refused', reason: r.reason }
      if (r.id !== undefined && !hintsSeenRef.current.has('first-task')) setFirstTask({ panelId: r.id, sent: false })
      // The same one restrained arrival a task start gets (M262's flag, below):
      // every first start places its object the same way.
      setClusterArrival(true)
      window.setTimeout(() => setClusterArrival(false), 1200)
      return { kind: 'started' }
    }
    const repo = firstWorkRepoAnswer(await window.canvas.git.status(plan.folder), plan.folder)
    if (repo.kind !== 'repository') return repo
    const actions = paletteActionsRef.current
    if (actions === null || actions === undefined) return { kind: 'refused', reason: 'the canvas is not ready yet' }
    let teammateId = plan.teammate.reuse
    const mint = plan.teammate.mint
    if (mint !== undefined) {
      const id = `tm-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
      const saved = await window.canvas.teammate.save({ ...emptyTeammate(id, mint.name), places: mint.places })
      // The mirror is made current HERE: `dispatchWorkItem` → main reads the
      // roster by id, and the reload below lands a render later.
      teammatesRef.current = [...teammatesRef.current.filter((t) => t.id !== id), saved.teammate]
      reloadTeammates()
      teammateId = id
    }
    const key = `${plan.folder}\n${plan.title}`
    const standing = firstWorkItemRef.current?.key === key && workItemsRef.current.some((i) => i.id === firstWorkItemRef.current?.itemId) ? firstWorkItemRef.current.itemId : undefined
    const itemId = standing ?? actions.addWorkItem({ source: 'typed', title: plan.title, ...(plan.description === undefined ? {} : { description: plan.description }), state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'] })
    firstWorkItemRef.current = { key, itemId }
    if (teammateId === undefined) return { kind: 'refused', reason: 'no teammate was chosen for this folder' }
    const outcome = await actions.startWork(itemId, teammateId, plan.folder)
    if (outcome.kind !== 'started') {
      // The critic's finding (M205 2.5): a failure at THIS stage has already
      // minted a teammate and a work item — `dispatchWorkItemAttempt` already
      // wrote the reason into the item's own `note` — but with no panel
      // neither is visible, so if the launcher is later put away the two
      // records sit invisibly in the store, looking orphaned. A card makes
      // the failure and its retry findable: the note renders on it
      // (WorkNode's `data-work-note`) and `Start work again…` is the SAME
      // dispatch path a second press of Start work above already takes, so
      // there are two doors to one retry, never two retries. Guarded so a
      // second failed attempt at the same item never mints a twin card.
      const failedItem = workItemsRef.current.find((i) => i.id === itemId)
      if (failedItem !== undefined && !panelsRef.current.some((p) => workCardItemId(p) === itemId)) {
        const cardId = `k${nextIdRef.current++}`
        const centre = screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, viewportRef.current)
        setPanels((current) => { const next = [...current, makeWorkPanel(cardId, cascadeCentre(centre, current), nextZ(current), failedItem.id, failedItem.title)]; commitHistory(next); return next })
      }
      return { kind: 'refused', reason: outcome.reason }
    }
    // The keyboard follows the work: the sentence was SENT, so the next thing
    // a person types is the follow-up. An empty insert through the store's
    // own bus is what places the composer's caret (ChatNode's `insertAtCaret`
    // focuses) — the launcher that held focus has just unmounted, and without
    // this the keyboard lands on nothing.
    void deliverToComposer(outcome.panelId, '', { focus: true })
    // M262. The cluster arrival: framed once both have mounted (two frames —
    // the card and the chat land in separate commits), then the flag clears
    // so a later mint rises alone, as it always has.
    setClusterArrival(true)
    // The NEW task, not the whole canvas, at a scale its chat can be read at
    // (`fitReadable`): fitAll zoomed a lone card past 100% and a busy canvas
    // below reading size. Looked up at frame time — both have mounted by then.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const mine = panelsRef.current.filter((p) => p.rect.id === outcome.panelId || workCardItemId(p) === outcome.itemId)
      const chat = mine.find((p) => p.rect.id === outcome.panelId)
      if (mine.length === 0) fitAll(); else frameReadable(mine.map((p) => p.rect), chat?.rect)
    }))
    if (!hintsSeenRef.current.has('first-task')) setFirstTask({ panelId: outcome.panelId, sent: true, itemId: outcome.itemId })
    window.setTimeout(() => setClusterArrival(false), 1200)
    // A later start of the same words in the same folder is a NEW task: the
    // conversation this one made may be closed by then, and reusing its item
    // would fold the second start into the first (the M205 critic).
    firstWorkItemRef.current = null
    return { kind: 'started' }
  }, [reloadTeammates, fitAll, frameReadable, beginNewChat])
  /** M205. The ONE alternative: M120's no-folder conversation, on the engine readiness found, the sentence in its composer — inserted, never sent (M80). */
  const askWithoutFolder = useCallback((intention: string): void => {
    const preferred = onboardingReadiness(envReportRef.current).preferred
    if (preferred === undefined) return
    const message = intention.trim()
    void beginNewChat({ sandbox: true, ...(preferred === 'claude' ? {} : { backend: preferred }), ...(message === '' ? {} : { message }) })
      .then((r) => { if (r.kind === 'refused') paletteActionsRef.current?.say(r.reason) })
  }, [beginNewChat])
  /** M205. After `not-a-repository`: a conversation IN that folder. No lane (there is no branch to make), nothing sent. */
  const chatInFolder = useCallback((req: FirstWorkRequest): void => {
    const preferred = onboardingReadiness(envReportRef.current).preferred
    if (preferred === undefined) return
    const message = req.intention.trim()
    void beginNewChat({ cwd: req.folder.trim(), ...(preferred === 'claude' ? {} : { backend: preferred }), ...(message === '' ? {} : { message }) })
      .then((r) => { if (r.kind === 'refused') paletteActionsRef.current?.say(r.reason) })
  }, [beginNewChat])

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
    goToViewport, cameraBack, cameraForward, bookmarksRef, setBookmarks, viewportRef,
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
  const removeLinkStable = useCallback((from: string, to: string) => {
    paletteActionsRef.current?.removeLink(from, to)
  }, [])
  // M40. The banner's Stop and the Cmd+Shift+I chord both run the palette
  // row's own verb through the same ref, so the three exits cannot drift:
  // the guard (two live selected terminals, or the mode already on) lives
  // in toggleBroadcastInput and nowhere else.
  const toggleBroadcastStable = useCallback(() => {
    paletteActionsRef.current?.toggleBroadcastInput()
  }, [])
  useBroadcastChord({ paletteIsOpen: palette.isOpen, toggle: toggleBroadcastStable })
  // M44. Cmd+Arrow traverse (never wakes), Cmd+Enter focus+wake, Cmd+Escape
  // out of the terminal. goToPanel through the ref so the listener never goes
  // stale; focusPanel is onFocusPanel; releaseFocus is the background release.
  const goToPanelStable = useCallback((id: string) => { paletteActionsRef.current?.goToPanel(id) }, [])
  const releaseFocusStable = useCallback(() => setFocusedId(null), [])
  // M249. The pill's input: the orchestrator chat's own send — the door
  // ChatNode's composer calls — or, with no orchestrator, the sheet's
  // supervisor path with the text as its first message, UNSENT in the new
  // composer (M81: nothing starts work unread). Read through refs at send
  // time, so the target is the canvas as it is when Enter lands.
  //
  // It RETURNS its sentence for the pill to show in place, never `say()`: say
  // opens the palette, which would take the keyboard straight back from the
  // terminal the send just returned it to (the critic's finding). Every
  // refusal arm is spelled by sendRefusalSentence — the string arms
  // (budget, backend, no-session…) read as silence otherwise (M197's trap).
  const sendFromPill = useCallback(async (text: string): Promise<string | null> => {
    try {
      const target = orchestratorTarget(orchestratorCandidates(panelsRef.current))
      if (target !== null) return sendRefusalSentence(await window.canvas.agentSession.send(target, text, []))
      const made = await beginNewChatRef.current({ title: 'supervisor', appendSystemPrompt: SUPERVISOR_PROMPT, message: text })
      return made.kind === 'refused' ? made.reason : 'no orchestrator yet — made a supervisor chat; your message is in its composer, unsent'
    } catch (error) {
      return `not sent — ${error instanceof Error ? error.message : String(error)}`
    }
  }, [])
  useKeyboardNav({
    shouldIgnoreKeys,
    rectsRef: terminalRectsRef,
    selectedIdRef,
    focusedIdRef,
    viewportRef,
    lastFocusedAtRef,
    hostRef,
    goToPanel: goToPanelStable,
    focusPanel: onFocusPanel,
    releaseFocus: releaseFocusStable,
    openPill
  })
  // The banner lives INSIDE the canvas host, unlike every other shell
  // control, so its press would bubble to useCanvasPointer's background
  // onMouseDown — which hit-tests the world point under the banner, selects
  // whatever panel lies beneath (or clears the selection and starts a
  // marquee) and releases focus. Stopping it here is what panel chrome does
  // for the same reason; the palette's outside-click dismissal is a CAPTURE
  // listener and has already run. verify:panels broadcast.2 went red on
  // exactly this: Stop cleared the two-panel selection, so the chord that
  // followed was refused by its own guard.
  const onBroadcastStopMouseDown = useCallback((event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  /**
   * The top bar's ⚙. It opens the palette straight into the settings
   * drill-in through the controller's own scope — the SAME authority the
   * `Manage settings…` row's `entersScope: 'settings'` reaches, not a second
   * door. The scope is what makes the button honest: every setting row is
   * hiddenAtRest, so merely opening the palette would land the user on a list
   * with no settings visible at all, which reads as a feature that was never
   * built.
   */
  // M68. The Jira panel's Connect verb: the palette's Credentials scope.
  const openCredentials = useCallback(() => palette.openPalette('credentials'), [palette.openPalette])
  const openSettingsScope = useCallback(() => {
    palette.openPalette('settings')
    // A useCallback for consistency with its sibling verbs, not for a
    // load-bearing reason. An earlier comment here claimed an unstable
    // identity would re-render TopBar on every mousemove over the canvas;
    // that is false. TopBar is not memo-wrapped, so it re-renders whenever
    // Canvas does — which a mousemove's setCursor already makes it do —
    // whatever this prop's identity is. The parallel note in useViewport.ts
    // IS true and load-bearing (those callbacks sit in a keydown effect's dep
    // array); don't read this one as saying the same thing.
  }, [palette.openPalette])

  // Keeps deleteWorkspaceRef current for the __m7aWorkspace test hook
  // declared earlier in this component — see that ref's own comment for why
  // it exists instead of a direct reference.
  useEffect(() => {
    deleteWorkspaceRef.current = paletteActions.deleteWorkspace
  }, [paletteActions])

  // The rail's and inspector's derived models, lifted into useRailModels.ts.
  // Each is frozen on a signature string so a drag's 60Hz rect churn cannot
  // re-render panes that render nothing about a rect.
  const {
    panelRows, railRows, railWorkspaces, railAttention, railElsewhere,
    selectedPanel, selectedLive, inspectorModel, selectedIsSessionless
  } = useRailModels({
    registry, palette, panelsRef, viewportRef, panels, displayPanels, dormantIds,
    workspaceRows, waitingIds, selectedId, globalFontSize,
    // M116. A work card's row speaks its item's state; absent when the board is empty.
    ...(workItems.length === 0 ? {} : { workStateOf: (itemId: string) => workItems.find((i) => i.id === itemId)?.state, workItemOf: (itemId: string) => workItems.find((i) => i.id === itemId) }),
    // M133. A workflow trigger's template name, so a watcher whose command is
    // `/usr/bin/true` reads as the workflow it runs — built-ins included.
    templateNameOf: (templateId: string) => allTemplates(templateRows).find((t) => t.id === templateId)?.name,
    teammateNameOf: (teammateId: string) => {
      const t = (teammates ?? []).find((x) => x.id === teammateId)
      return t === undefined ? undefined : (t.name.trim() === '' ? t.id : t.name)
    },
    templateOf: (templateId: string) => allTemplates(templateRows).find((t) => t.id === templateId),
    // M196 (D04). The lane records, already read for the skills door's own
    // lane question. ONE source: this is the same list main's `laneRootOf`
    // asks, so the inspector and the Places gate cannot disagree about which
    // repository a lane belongs to.
    lanes: worktreeRows
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
      out.set(shapeId, prev !== undefined && prev.panelId === panelId && prev.input === row.state && prev.name === row.label ? prev : { panelId, input: row.state, name: row.label })
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
  }, [panels, railRows])

  const inspectorContextBand = useMemo(() => {
    if (selectedPanel === undefined || inspectorModel === null) return undefined
    const approval = pendingApprovals.find((a) => a.id === selectedPanel.rect.id)
    const memberships = taskMemberships(displayPanels, workItems)
    const membership = memberships.find((m) => m.members.some((x) => x.panelId === selectedPanel.rect.id))
    const relatedItem = membership === undefined ? undefined : workItems.find((i) => i.id === membership.itemId)
    const workItem = isWorkPanel(selectedPanel)
      ? workItems.find((i) => i.id === selectedPanel.work.itemId)
      : relatedItem
    const laneId = workItem?.panelId
    const execution = laneId === undefined || liveRunFacts[laneId] === undefined ? undefined : projectSession(laneId, liveRunFacts[laneId])
    const handoff = workItem === undefined ? undefined : taskHandoffOf(workItem.id)
    return buildInspectorContext({
      panel: selectedPanel,
      ...(approval !== undefined ? { approvalTool: approval.toolName } : {}),
      agentState: getAgentState(selectedPanel.rect.id),
      restartable: inspectorModel.restartable,
      ...(workItem !== undefined ? { workItem: { id: workItem.id, title: workItem.title, state: workItem.state, ...(workItem.note !== undefined ? { note: workItem.note } : {}) } } : {}),
      ...(execution !== undefined ? { execution: { detail: execution.detail, ...(execution.blocker !== undefined ? { blocker: execution.blocker } : {}) } } : {}),
      ...(handoff !== undefined ? { handoff: { actionLabel: handoff.actionLabel, detail: handoff.detail, ...(handoff.blocker !== undefined ? { blocker: handoff.blocker } : {}) } } : {}),
      ...(membership !== undefined && relatedItem !== undefined ? { related: {
        itemId: relatedItem.id, title: relatedItem.title, memberCount: membership.members.length,
        // M310. The flagship flow as one strip, from this task's own members.
        chain: taskChain({
          item: {
            source: relatedItem.source,
            ...(relatedItem.key === undefined ? {} : { key: relatedItem.key }),
            ...(relatedItem.url === undefined ? {} : { url: relatedItem.url }),
            ...(relatedItem.panelId === undefined ? {} : { panelId: relatedItem.panelId }),
            ...(relatedItem.pr === undefined ? {} : { pr: relatedItem.pr })
          },
          members: membership.members.map((m) => ({ panelId: m.panelId, kind: displayPanels.find((p) => p.rect.id === m.panelId)?.kind ?? 'other' }))
        })
      } } : {})
    })
  }, [selectedPanel, inspectorModel, pendingApprovals, displayPanels, workItems, liveRunFacts, taskHandoffOf])

  // M180. The agent door: `tc plan` lands on the SAME executor the palette's
  // verb line runs, with the caller main resolved riding beside the line.
  useEffect(() => window.canvas.canvas.onPlan((req) => paletteActions.runAgentPlan(req.line, req.caller)), [paletteActions])
  // M190. Help ▸ Prepare feedback… — main's menu item, the renderer's draft.
  useEffect(() => window.canvas.canvas.onFeedback(() => { void prepareFeedback() }), [prepareFeedback])

  // The file tree column, lifted into useFileTree.ts. Roots on the SELECTED
  // panel while insertPath pastes into the FOCUSED one — see the hook's doc
  // comment for why collapsing those onto one id is a bug, not a cleanup.
  const {
    treeRoot, treeRootLabel, treeRows, treeRootPending, treeContextReason, noteRoot,
    toggleDir, refreshTree, insertPath
  } = useFileTree({
    registry, selectedPanel, selectedLive, selectedId, settingRows,
    focusedIdRef, panelsRef, noteRootRef
  })

  /**
   * M89. THE INTEGRATIONS PAGE'S DATA: the credential metas the palette
   * already reloads, plus the broker's audit rows, folded through the pure
   * model. Read when the pane is chosen and on its refresh — the audit is a
   * file, and a page nobody is looking at must not re-read it on every tick.
   */
  const [integrationAudit, setIntegrationAudit] = useState<{ rows: BrokerAuditRowWire[]; skipped: number; state: 'pending' | 'failed' | 'ready'; failure?: string }>({ rows: [], skipped: 0, state: 'pending' })
  const reloadIntegrations = useCallback(() => {
    reloadCredentials()
    // One read PER SERVICE, so a busy service cannot push another's rows out
    // of the window and leave it reading `no calls yet` (M89's verifier).
    void Promise.all(SERVICES.map((svc) => window.canvas.broker.audit(INTEGRATION_AUDIT_ROWS, svc.id)))
      .then((answers) => setIntegrationAudit({ rows: answers.flatMap((a) => a.rows), skipped: answers.reduce((n, a) => n + a.skipped, 0), state: 'ready' }))
      .catch((error: unknown) => setIntegrationAudit({ rows: [], skipped: 0, state: 'failed', failure: String(error) }))
  }, [reloadCredentials])
  useEffect(() => { if (chrome.navigator === 'integrations') reloadIntegrations() }, [chrome.navigator, reloadIntegrations])
  const integrationRows = useMemo(() => buildIntegrationRows(SERVICES, credentialRows, integrationAudit.rows), [credentialRows, integrationAudit.rows])
  const integrationsPaneProps = useMemo(() => ({
    onToggle: chrome.toggleNavigator,
    rows: integrationRows,
    audit: integrationAudit.state,
    ...(integrationAudit.failure === undefined ? {} : { auditFailure: integrationAudit.failure }),
    skipped: integrationAudit.skipped,
    panelLabel: (panelId: string) => { const p = panelsRef.current.find((q) => q.rect.id === panelId); return p === undefined ? undefined : railLabel(p, isTerminalPanel(p) ? registry.get(panelId)?.status : undefined) },
    onConnect: (_service: string) => openCredentials(),
    // The verify's OWN answer, then the reload — never a timer racing a
    // fifteen-second request (M89's verifier). A failure is the palette's
    // line, as the credential rows already do it.
    onVerify: (service: string) => { void window.canvas.credential.verify(service).then((res) => { if (!res.ok) paletteActions.verifyCredential(service); reloadIntegrations() }).catch(() => reloadIntegrations()) },
    onRefresh: reloadIntegrations,
    // M102. The roster's grants per service, by teammate name, with the
    // folders each may act from — a teammate's `places`, empty meaning it is
    // granted the service but has nowhere yet to spend it (this redesign's permission
    // line: who may use it, and from which workspace).
    grants: Object.fromEntries(SERVICES.map((svc) => [svc.id, (teammates ?? []).filter((t) => t.services.includes(svc.id)).map((t) => ({ name: t.name, places: t.places }))]))
  }), [chrome.toggleNavigator, integrationRows, integrationAudit.state, integrationAudit.failure, integrationAudit.skipped, openCredentials, paletteActions, reloadIntegrations, teammates])

  // M150. A note's chip asks the pane to filter: the request rides to the
  // pane as data (tag + a counter, so the same tag asked twice lands twice)
  // and the pane is SHOWN on the way — one door from either side.
  // `chooseNavigator` is the dock's TOGGLE (it collapses the pane that is
  // already showing), so it is called only when the vault is not the pane on
  // screen — the first cut closed the pane the user had just read the note
  // from (the M150 critic's Critical; product `vault.tags.1` reads the rail).
  const vaultFilterSeq = useRef(0)
  const [vaultFilterRequest, setVaultFilterRequest] = useState<{ tag: string; nonce: number } | null>(null)
  const { chooseNavigator: chooseNavigatorPane, navVisible: navPaneVisible, navigator: navPane } = chrome
  const filterVaultTag = useCallback((tag: string) => {
    setVaultFilterRequest({ tag, nonce: (vaultFilterSeq.current += 1) })
    if (!(navPaneVisible && navPane === 'vault')) chooseNavigatorPane('vault')
  }, [chooseNavigatorPane, navPaneVisible, navPane])
  /**
   * M85. ONE object each for the pane and for every in-vault note, memoised
   * on the fields they carry: `Navigator` and `FileNode` are memo'd, and a
   * fresh literal per render defeated both on every mousemove and drag frame
   * while a vault was set — the invisible churn the rail's signature freeze
   * exists to prevent (M85's verifier).
   */
  const noteVault = useMemo(() => (
    vault.root === '' ? null : { root: vault.root.replace(/\/+$/, ''), index: vault.index, onOpenNote: openVaultNote, onCreateNote: beginCreateVaultNote, onFilterTag: filterVaultTag }
  ), [vault.root, vault.index, openVaultNote, beginCreateVaultNote, filterVaultTag])
  const vaultSelectedPath = ((): string | null => {
    const p = selectedPanel
    if (!p || !isFilePanel(p) || noteVault === null) return null
    return p.source.path.startsWith(`${noteVault.root}/`) ? p.source.path.slice(noteVault.root.length + 1) : null
  })()
  // M100. The Teammates pane's model. Every write goes to main and reloads
  // the roster from the answer — never an optimistic local flip.
  // M116. The Board pane's model. A row click flies through `centreOn` and
  // NOTHING else — no focus, no raise (the minimap's rule: navigating is not
  // interacting). A drop sets a state the USER may set and refuses the rest
  // by the record's own list, so the pane's drop targets and this setter
  // agree by construction. The card set is a signature so a drag's 60Hz
  // rect churn does not rebuild the pane's props.
  const cardItemIds = panels.filter(isWorkPanel).map((p) => p.work.itemId).sort().join('\u0000')
  // M116. A drop on a user-set column. `done` goes through the SAME verb the
  // card's button and `tc board done` reach (the PR-comment offer included);
  // a drop that leaves a lane mid-turn says so in the note rather than
  // pretending the runtime stopped — the next turn will say `working` again.
  const setWorkItemState = useCallback((itemId: string, state: WorkItemState): void => {
    if (!USER_SET_STATES.includes(state)) return
    if (state === WORK_ITEM_STATES[3]) { markDone(itemId); return }
    setWorkItems((current) => current.map((i) => {
      if (i.id !== itemId) return i
      const laneOpen = i.panelId !== undefined && i.state === WORK_ITEM_STATES[1] && panelsRef.current.some((p) => p.rect.id === i.panelId)
      return carryWorkItem({ ...i, state, ...(laneOpen ? { note: 'lane still open — close the chat to stop it' } : {}), updatedAt: Date.now() })
    }))
  }, [markDone])
  // Frame a panel's one task on the canvas, or say why not — Orchestrate's "focus
  // related" and the title bar's task crumb are the same verb, so one body.
  const frameTaskOf = useCallback((panelId: string): void => {
    const shown = displayPanelsRef.current
    const items = workItemsRef.current
    const target = showTaskTarget(panelId, shown, taskMemberships(shown, items), Object.fromEntries(items.map((i) => [i.id, i.title])))
    if (target.kind === 'refused') {
      paletteActionsRef.current?.say(target.reason)
      return
    }
    setRelatedItemId(target.itemId)
    frameRects(target.rects)
  }, [frameRects])
  const goToWorkItem = useCallback((itemId: string): void => {
    const card = panelsRef.current.find((p): p is WorkPanelModel => isWorkPanel(p) && p.work.itemId === itemId)
    if (card !== undefined) centreOn(card.rect)
  }, [centreOn])
  const boardPaneProps = useMemo(() => {
    const cards = new Set(cardItemIds.split('\u0000'))
    return {
      items: workItems,
      teammates: teammates ?? [],
      laneLabelOf: (panelId: string) => railRows.find((r) => r.id === panelId)?.label,
      hasCard: (itemId: string) => cards.has(itemId),
      onGoTo: goToWorkItem,
      onSetState: setWorkItemState,
      onShowOnCanvas: spawnWorkCard,
      onFocusTask: openFocusTask,
      onToggle: chrome.toggleNavigator
    }
  }, [workItems, teammates, railRows, cardItemIds, goToWorkItem, setWorkItemState, spawnWorkCard, chrome.toggleNavigator, openFocusTask])
  /* ---------------------------------------------------------- M127: skills --
   * The Skills pane's state: the shelf (a TOP-LEVEL record, read and written
   * through its own pair of invokes — never through the undo history, which
   * is layout's, and never through `layout:save`, which carries one
   * workspace's CanvasState), the inventory for the SELECTED panel's cwd (the
   * inspector's Toolbox section's own rule, its `no-cwd` arm included), and
   * the three filters.
   */
  const [shelf, setShelf] = useState<Shelf>(EMPTY_SHELF)
  // The shelf's own three states, kept apart from the inventory's: an
  // unread shelf and an empty shelf paint the same columns, and only one of
  // them means "a card you move now will not be saved". A rejected invoke
  // used to be an unhandled rejection with an empty pane and nothing on
  // screen saying why — this is that failure, named.
  const [shelfState, setShelfState] = useState<ShelfState>({ kind: 'pending' })
  // The shelf as a ref, for the same reason panelsRef exists: a rename has
  // to read the CURRENT shelf outside a state updater.
  const shelfRef = useRef(shelf)
  shelfRef.current = shelf
  useEffect(() => {
    void window.canvas.shelf.list()
      .then((s) => { setShelf(s); setShelfState({ kind: 'loaded' }) })
      .catch((e) => setShelfState({ kind: 'unavailable', why: String(e && (e as Error).message ? (e as Error).message : e) }))
  }, [])
  const writeShelf = useCallback((next: Shelf): void => {
    setShelf(next)
    void window.canvas.shelf.save(next)
      .then((s) => { setShelf(s); setShelfState({ kind: 'loaded' }) })
      .catch((e) => setShelfState({ kind: 'unavailable', why: String(e && (e as Error).message ? (e as Error).message : e) }))
  }, [])
  /**
   * M129 fix. One rename, two authorities, ONE call.
   *
   * The panel record holds `{scope, name}` and the shelf holds
   * `scope:name` — a rename that moved the folder and updated neither would
   * leave the panel describing a skill that is gone and the shelf slot
   * rendering `not installed here`, which is indistinguishable from a skill
   * that was never installed. The record goes through `commitHistory` (it is
   * layout); the shelf goes through its own invoke (it is a library).
   */
  const renameSkillEverywhere = useCallback((panelId: string, newName: string): void => {
    // Read through the REF, never inside a setPanels updater: an updater
    // must stay pure (this file's own rule, stated at commitHistory), and
    // this one has to fire an invoke and a second setState.
    const target = panelsRef.current.find((p) => p.rect.id === panelId)
    if (target === undefined || !isSkillPanel(target)) return
    const scope = target.skill.scope
    const oldName = target.skill.name
    setPanels((current) => {
      const next = current.map((p) =>
        p.rect.id === panelId && isSkillPanel(p) ? { ...p, skill: { scope, name: newName } } : p)
      commitHistory(next)
      return next
    })
    const carried = renameInShelf(shelfRef.current, skillKey(scope, oldName), skillKey(scope, newName))
    setShelf(carried)
    void window.canvas.shelf.save(carried)
      .then((saved) => { setShelf(saved); setShelfState({ kind: 'loaded' }) })
      .catch((e) => setShelfState({ kind: 'unavailable', why: String(e && (e as Error).message ? (e as Error).message : e) }))
    setSkillsReadTick((t) => t + 1)
  }, [commitHistory])
  const [skillKindTab, setSkillKindTab] = useState<SkillPaneKind>('skill')
  const [skillQuery, setSkillQuery] = useState('')
  const [skillScopes, setSkillScopes] = useState<ToolScope[] | null>(null)
  const [skillPlacedOnly, setSkillPlacedOnly] = useState(false)
  // M131 fix round 2. Main's REAL verdict on the assign door's last save —
  // never the renderer's own advisory guess. Absent means nothing to say;
  // it is not persisted and clears on the pane's next assignment.
  const [skillAssignNotice, setSkillAssignNotice] = useState<string | null>(null)
  // M194. The inspector's Toolbox rule, ASKED rather than copied. This was a
  // third hand-written copy of it, and the moment the inspector's own rule
  // learned about chats it began to disagree with this one silently: the
  // Tools section would list a conversation's commands while the pane one
  // dock row away said "no directory" about the same folder. `skillsCwd`
  // also feeds `skill:create` and the assign door, so a sandbox chat — which
  // the policy answers `absent` for — must not reach either.
  const skillsCwd = (() => {
    const d = inspectionDirectory(panels.find((x) => x.rect.id === selectedId), 'tools')
    return d.kind === 'known' ? d.cwd : null
  })()
  const [skillsInventory, setSkillsInventory] = useState<ToolInventoryResult | undefined>(undefined)
  // M129 fix. Main's own answer to the last `skill:create`, as a sentence —
  // the refusals (an existing name, a plugin's folder, a path outside every
  // writable root) all arrive here, and a door that swallowed them would
  // leave the user watching a pane that never grew a card.
  const [newSkillResult, setNewSkillResult] = useState<string | null>(null)
  // Bumped after a create, a rename or a delete so the pane and the panels
  // re-read the inventory through the ordinary door rather than being handed
  // a row this renderer invented.
  const [skillsReadTick, setSkillsReadTick] = useState(0)
  useEffect(() => {
    // Cleared before the invoke, never after: the `live` flag stops a stale
    // WRITE and nothing stops the stale RENDER, so panel A's skills would sit
    // under panel B's heading for a whole round trip.
    setSkillsInventory(undefined)
    if (selectedId === null || skillsCwd === null) return
    let live = true
    void window.canvas.toolbox.read({ panelId: selectedId, cwd: skillsCwd })
      .then((r) => { if (live) setSkillsInventory(r) })
      // M194. A rejected read is NOT a panel without a directory. The pane
      // grew an `unavailable` arm this milestone and this is the only site
      // that can produce a rejection; laundering it into `no-cwd` here would
      // print "no directory" over a folder the user is looking at.
      .catch(() => { if (live) setSkillsInventory({ kind: 'unavailable', reason: 'the skills read did not answer' }) })
    return () => { live = false }
  }, [selectedId, skillsCwd, skillsReadTick])
  /**
   * M128. Every OPEN panel that HAS a directory, with the rail's own label.
   * The skill panel asks each one's inventory — the cache is keyed by
   * resolved cwd, so twelve panels in one repository cost one parse — and
   * that list is also the answer to "which panels can see this skill".
   * A panel with no directory is absent rather than listed as "no": it was
   * never a candidate, and listing it would read as a refusal.
   */
  // M137. Terminal, chat and toolbox panels only: a watcher's cwd is deliberately
  // absent from "Available in" — a watcher runs a command, it never reads a skill.
  const skillSources = useMemo(() => panels.flatMap((p) => {
    const cwd = isTerminalPanel(p) ? p.spec.cwd : isChatPanel(p) ? p.chat.cwd : isToolboxPanel(p) ? p.source.cwd : undefined
    if (cwd === undefined || cwd === '') return []
    return [{ panelId: p.rect.id, cwd, label: railRows.find((r) => r.id === p.rect.id)?.label ?? p.rect.id }]
  }), [panels, railRows])
  // M256. Keyed on a SIGNATURE of the skill panels, never on `panels`: the
  // array changes identity on every drag frame, and the Skills pane's props
  // must not rebuild at 60Hz for a fact that changes when a panel opens.
  const placedSkillSig = panels.filter(isSkillPanel).map((p) => skillKey(p.skill.scope, p.skill.name)).sort().join('\n')
  const placedSkillKeys = useMemo<ReadonlySet<SkillKey>>(() => new Set(placedSkillSig === '' ? [] : placedSkillSig.split('\n')), [placedSkillSig])
  const skillsPaneProps = useMemo(() => {
    const entries = skillsInventory?.kind === 'inventory' ? skillsInventory.inventory.entries : []
    const state: SkillsInventoryState =
      skillsCwd === null ? { kind: 'no-cwd' }
        : skillsInventory === undefined ? { kind: 'pending' }
          : skillsInventory.kind === 'no-cwd' ? { kind: 'no-cwd' }
            : skillsInventory.kind === 'unavailable' ? { kind: 'unavailable', why: skillsInventory.reason }
            : { kind: 'inventory', readAt: skillsInventory.inventory.readAt }
    const paneColumns = buildSkillColumns(entries, shelf, { kind: skillKindTab, query: skillQuery, scopes: skillScopes, placedOnly: skillPlacedOnly })
    // M131. A project-scoped key's repository, read back out of the
    // inventory's own `sourcePath` (`<root>/.claude/skills/<name>/SKILL.md`)
    // — the assign door's own check, so a bad assignment is refused before
    // it ever reaches `teammate:save`. `insidePlace` runs with an identity
    // realpath: the renderer has no filesystem, and the real, symlink-
    // resolved check is main's own at the one brief-append site, which never
    // trusts this one.
    const repoRootOfKey = (key: SkillKey): string | null => {
      const parsed = parseSkillKey(key)
      if (parsed === null || parsed.scope !== 'project') return null
      const entry = entries.find((e): e is NamedToolEntry => 'name' in e && e.scope === parsed.scope && e.name === parsed.name)
      if (entry === undefined) return null
      const suffix = `/.claude/skills/${parsed.name}/SKILL.md`
      return entry.sourcePath.endsWith(suffix) ? entry.sourcePath.slice(0, -suffix.length) : null
    }
    // M131 fix round 2. A light, renderer-side prefix check — kept ONLY as
    // an early sentence, never the authority: `@shared/places` pulls in
    // `node:path`, which the renderer cannot bundle (it has no filesystem to
    // realpath against anyway), so this can be wrong in either direction. It
    // no longer blocks the save — main's own `saveTeammate` now computes the
    // REAL (symlink-resolved) verdict on the same cwd and returns
    // `notVisible` on its response, which is what `skillAssignNotice` below
    // actually renders; a card the pane shows as "saved" never silently
    // fails to reach the agent (this repo's "row that disappears" rule).
    const roughlyInside = (repoRoot: string, places: readonly string[]): boolean =>
      places.some((p) => { const norm = p.replace(/\/+$/, ''); return repoRoot === norm || repoRoot.startsWith(norm + '/') })
    const assignOne = (key: SkillKey, teammateId: string): void => {
      const t = (teammates ?? []).find((x) => x.id === teammateId)
      if (t === undefined) return
      const repoRoot = repoRootOfKey(key)
      if (repoRoot !== null && !roughlyInside(repoRoot, t.places)) {
        setSkillAssignNotice(`this may not be visible to ${t.name} yet — ${repoRoot} looks outside their places; saving anyway to let main's real check decide`)
      } else {
        setSkillAssignNotice(null)
      }
      const merged = Array.from(new Set([...(t.skills ?? []), key]))
      void window.canvas.teammate.save({ ...t, skills: merged }, skillsCwd ?? undefined).then((r) => {
        reloadTeammates()
        if (r.notVisible !== undefined && r.notVisible.length > 0) {
          setSkillAssignNotice(r.notVisible.map((n) => `not visible to ${t.name}: ${n.repoRoot} is outside their places`).join('; '))
        } else {
          setSkillAssignNotice(null)
        }
      })
    }
    return {
      onToggle: chrome.toggleNavigator,
      state,
      shelfState,
      // M129 fix. The `skill:create` door. The scope names a ROOT main
      // derives itself from the asking cwd — the renderer sends the word,
      // never a path. The project word stays present and disabled with its
      // reason when no selected panel has a directory.
      // M194 opened this arm. Before it, `skillsCwd` answered for terminal and
      // toolbox panels only, and a terminal's record carries the cwd the user
      // ASKED for — M37 applies the lane at spawn — so a worktree lane could
      // not reach this door. A DISPATCHED chat's `chat.cwd` IS the lane
      // (`board-lane.ts`), and main derives the project root from the cwd it is
      // handed (`skill-write.ts`'s `rootsOf`), so a project skill written from
      // one would land in `userData/worktrees/tc/…/.claude/skills` and vanish
      // with the lane, having never been in the repository the person meant.
      // M196 (D04) closed it. Main translates a lane to its record's root
      // before deriving the project skill root, the same subject the Places
      // gate already judges, so a project skill written from a dispatched
      // conversation lands in the repository the person meant. What was a
      // REFUSAL is now a statement: the door stays open and says where the
      // file will go, because a person writing a project skill from a lane
      // needs to know which repository gets it — the folder in the header is
      // not that repository.
      projectScopeReason: skillsCwd === null || skillsCwd === ''
        ? 'select a panel with a directory to write a skill into its repository'
        : null,
      // The lane STATEMENT, which is not a refusal: the row stays enabled and
      // says which repository the write reaches. `laneOfPath` is the one
      // containment rule main asks too, replacing the prefix test written here
      // by hand — the same fact answered twice was D04's subject.
      projectScopeNote: (() => {
        if (skillsCwd === null || skillsCwd === '') return null
        const lane = laneOfPath(skillsCwd, worktreeRows)
        return lane === undefined ? null : `this conversation works in a ${lane.branch} lane — a project skill goes to ${displayPath(lane.root).short}, the repository it was cut from`
      })(),
      newSkillResult,
      onNewSkill: (scope: 'user' | 'project', name: string) => {
        setNewSkillResult(`creating ${name}…`)
        void window.canvas.skill.create({ cwd: skillsCwd ?? '', scope, name })
          .then((r) => {
            setNewSkillResult(
              r.kind === 'created' ? `created ${r.path}`
                : r.kind === 'refused' ? r.why
                  : r.kind === 'failed' ? `the skill could not be created — ${r.why}`
                    : r.kind
            )
            // Re-read through the ordinary door: the card must come from the
            // inventory, never from a row invented here.
            if (r.kind === 'created') setSkillsReadTick((t) => t + 1)
          })
          .catch(() => setNewSkillResult('the create did not answer'))
      },
      columns: paneColumns,
      // M256. The workspace's canvas facts: which skills already have a panel,
      // the one door that opens one, and a usage snapshot read on open.
      placedKeys: placedSkillKeys,
      onPlaceOnCanvas: (scope: ToolScope, name: string) => { paletteActionsRef.current?.openSkillPanel(scope, name, worldCentre()) },
      readUsage: () => recentSkillUses(panelsRef.current.map((p) => ({ id: p.rect.id, kind: p.kind, label: railRows.find((r) => r.id === p.rect.id)?.label ?? p.rect.id }))),
      teammates: teammates ?? [],
      assignNotice: skillAssignNotice,
      onAssignColumn: (columnId: string, teammateId: string) => {
        const col = paneColumns.find((c) => c.id === columnId)
        if (col === undefined) return
        for (const card of col.cards) assignOne(card.key, teammateId)
      },
      onAssignCard: (key: SkillKey, teammateId: string) => assignOne(key, teammateId),
      kind: skillKindTab,
      onChooseKind: setSkillKindTab,
      query: skillQuery,
      onQuery: setSkillQuery,
      scopes: skillScopes,
      onToggleScope: (scope: ToolScope) => setSkillScopes((cur) => {
        // A pressed scope on its own means "only this"; pressing it again is
        // every scope, never an empty list — a filter that can hide
        // everything reads as a broken pane.
        if (cur !== null && cur.length === 1 && cur[0] === scope) return null
        return [scope]
      }),
      placedOnly: skillPlacedOnly,
      onTogglePlacedOnly: () => setSkillPlacedOnly((v) => !v),
      onPlace: (key: SkillKey, columnId: string) => {
        // The override, written whole: the key leaves every column it was in
        // and joins exactly one. A card dropped where it already sits is a
        // no-op rather than a duplicate.
        const columns = shelf.columns.map((c) => ({ id: c.id, title: c.title, keys: c.keys.filter((k) => k !== key) }))
        const target = columns.find((c) => c.id === columnId)
        if (target === undefined) {
          if (columnId !== UNGROUPED_COLUMN_ID) return
          columns.push({ id: UNGROUPED_COLUMN_ID, title: 'Ungrouped', keys: [key] })
        } else target.keys.push(key)
        writeShelf({ columns })
      },
      onNewColumn: () => {
        const id = `col-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
        writeShelf({ columns: [...shelf.columns.map(carryOneColumn), { id, title: `collection ${shelf.columns.length + 1}`, keys: [] }] })
      },
      onDeleteColumn: (id: string) => {
        // Ungrouped refuses in the model AND here: the pane's control is
        // disabled with the reason, and this is the door a later caller would
        // otherwise reach past it.
        if (id === UNGROUPED_COLUMN_ID) return
        writeShelf({ columns: shelf.columns.filter((c) => c.id !== id).map(carryOneColumn) })
      }
    }
  // `worktreeRows` is a useState array (EMPTY_WORKTREES until a read lands),
  // so its identity is stable between reads and naming it here costs no churn.
  // Omitting it left the lane refusal frozen at whatever it was when another
  // dep last changed — the kind of staleness that shows up as a door that is
  // enabled when it should not be, only sometimes.
  }, [chrome.toggleNavigator, shelf, shelfState, newSkillResult, skillsInventory, skillsCwd, worktreeRows, skillKindTab, skillQuery, skillScopes, skillPlacedOnly, writeShelf, teammates, reloadTeammates, skillAssignNotice, placedSkillKeys, railRows, worldCentre])

  const teammatesPaneProps = useMemo(() => ({
    onToggle: chrome.toggleNavigator,
    teammates: teammates ?? [],
    loaded: teammates !== null,
    selectedId: selectedTeammateId,
    onSelect: setSelectedTeammateId,
    onCreate: (name: string) => {
      const id = `tm-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
      void window.canvas.teammate.save(emptyTeammate(id, name)).then(() => { reloadTeammates(); setSelectedTeammateId(id) })
    },
    onSave: (t: PersistedTeammate) => { void window.canvas.teammate.save(t).then(reloadTeammates) },
    onDelete: (id: string) => { void window.canvas.teammate.remove(id).then(() => { reloadTeammates(); setSelectedTeammateId(null) }) },
    // M197 (D05). Every door is a route into the ONE start action: the drop
    // still starts in one gesture when nothing is missing, and opens the
    // sheet on the missing input when something is.
    onDispatch: (itemId: string, teammateId: string) => paletteActionsRef.current?.beginStartWork({ itemId, teammateId }),
    onAddPlace: (id: string) => {
      void window.canvas.teammate.choosePlace().then((folder) => {
        if (folder === null) return
        const t = teammatesRef.current.find((x) => x.id === id)
        if (!t || t.places.includes(folder)) return
        void window.canvas.teammate.save({ ...t, places: [...t.places, folder] }).then(reloadTeammates)
      })
    },
    onChat: (id: string) => {
      const t = teammatesRef.current.find((x) => x.id === id)
      if (!t) return
      void beginNewChat({ cwd: t.places[0] ?? '', title: t.name, teammateId: id })
    },
    services: SERVICES.map((svc) => ({ id: svc.id, label: svc.label, connected: credentialRows.some((c) => c.service === svc.id) })),
    routines: routines ?? [],
    onSaveRoutine: async (r: PersistedRoutine) => { const a = await window.canvas.routine.save(r); reloadRoutines(); return a.kind === 'refused' ? a.reason : null },
    onDeleteRoutine: (id: string) => { void window.canvas.routine.remove(id).then(reloadRoutines) },
    onRunRoutine: (id: string) => { void window.canvas.routine.run(id) },
    onOpenLast: (panelId: string) => { selectAndRaise(panelId); const p = panelsRef.current.find((x) => x.rect.id === panelId); if (p) centreOn(p.rect) }
  }), [chrome.toggleNavigator, teammates, selectedTeammateId, reloadTeammates, beginNewChat, credentialRows, routines, reloadRoutines, selectAndRaise, centreOn])

  const vaultPaneProps = useMemo(() => ({
    onToggle: chrome.toggleNavigator,
    root: vault.root,
    notes: vault.notes,
    pending: vault.pending,
    ...(vault.reason === undefined ? {} : { reason: vault.reason }),
    skipped: vault.skipped,
    selectedPath: vaultSelectedPath,
    onOpenNote: openVaultNote,
    onChooseRoot: paletteActions.beginChooseVault,
    onRefresh: vault.refresh,
    // M150. The index's tags and the note's request, as data.
    tags: vault.index.tags,
    filterRequest: vaultFilterRequest
  }), [chrome.toggleNavigator, vault.root, vault.notes, vault.pending, vault.reason, vault.skipped, vaultSelectedPath, openVaultNote, paletteActions.beginChooseVault, vault.refresh, vault.index.tags, vaultFilterRequest])


  // The inspector's async detail sections, lifted into useInspectorDetail.ts.
  // Each is a three-state result — nothing to show / asked but unanswered / a
  // real answer — and must stay one; see the hook's doc comment.
  // M279. The activity feed's producer — always mounted, so the inspector's
  // Activity tab has rows before the orchestration page is ever opened.
  useActivityFeed({ panels })
  const {
    branchLine, repository,
    toolboxModel, reviewModel, inspectorSummary, hasSelection
  } = useInspectorDetail({
    registry, palette, panels, selectedId, selectedPanel,
    selectedIsSessionless, waitingIds,
    // M68. Read from the registry, whose version() this component already
    // re-renders on for status changes — so the flip is seen without a store.
    // M77. A chat's process is main's runtime, read from the chat store.
    selectedSpawned: selectedId !== null && (registry.get(selectedId)?.status.kind === 'running' || getChat(selectedId).snapshot?.pid !== undefined)
  })

  const attentionAnnouncement = useAttentionAnnouncer(railAttention)
  // M308. The Needs-you queue as decisions: ranked by what each unblocks,
  // duplicates grouped, snoozes applied. The ref is ⌘J's and the pill's —
  // their handlers are declared above this line and read it at press time.
  const inbox = useDecisionInbox({ rows: railAttention, panels: displayPanels, taskOf: approvalTaskOf })
  inboxRef.current = inbox

  // M309. The return briefing: every task that moved while the person was
  // away, from the durable record, measured from when they were last here.
  const awaySince = useAwaySince()
  const taskMembersOf = (itemId: string): string[] => {
    const item = workItems.find((w) => w.id === itemId)
    if (item === undefined) return []
    return taskMemberships(displayPanels, [item])[0]?.members.map((m) => m.panelId) ?? (item.panelId === undefined ? [] : [item.panelId])
  }
  const panelLabelOf = (panelId: string): string => { const p = displayPanels.find((q) => q.rect.id === panelId); return p === undefined ? 'a closed panel' : panelLabel(p) }
  const briefing = useReturnBriefing({
    since: awaySince,
    workItems,
    membersOf: taskMembersOf,
    handoffOf: taskHandoffOf,
    inbox,
    labelOf: panelLabelOf
  })
  // M318. The same decisions grouped by TASK — why each is stopped, its next
  // step, what waits on it — with failed checks, unreviewed changes and
  // decisions a restart lost. Timelines are read only while the popover shows.
  const taskQueue = useTaskQueue({
    inbox, workItems, panels: displayPanels, membersOf: taskMembersOf, handoffOf: taskHandoffOf, labelOf: panelLabelOf,
    // M325. Orchestrate's task list and the focus view read the check tallies too.
    active: chrome.attentionOpen || chrome.centerView !== 'canvas'
  })

  // Brief #20. What came back running, what came back stopped, and what was
  // lost while the app was closed — kept until each is dealt with.
  const presentIds = useMemo(() => new Set(displayPanels.map((p) => p.rect.id)), [displayPanels])
  const reopen = useReopenNotice({
    restored: restoredTerminals,
    liveAtBoot: liveSessionIds,
    present: presentIds,
    dormant: dormantIds,
    backend: backendInfo?.kind ?? null
  })

  // M316. What an interrupted job left — the pool's journal from main, and
  // the handoff runs this launch's seal cut off — with the recovery choices.
  const interruptedRuns = useMemo(() => runs
    .filter((r) => runsCutOff.has(r.id))
    .map((r) => interruptedRunAccount(r, (id) => { const p = displayPanels.find((q) => q.rect.id === id); return p === undefined ? 'a closed panel' : panelLabel(p) }))
    .filter((r): r is InterruptedRun => r !== null), [runs, runsCutOff, displayPanels])
  const jobRecovery = useJobRecovery({ runs: interruptedRuns, continueRun: (runId) => runsApi.continueRun(runId, runsRef.current) })

  // M303 (Quiet instrument). Resume work is an INBOX item: it rests at the
  // head of the navigator's Panels pane, and floats over the canvas only when
  // that pane is closed — a card over the canvas covered the panels it named.
  // M309. While there is a return to brief, the briefing takes the banner's
  // slot: the banner is one task's resume, the briefing every task's.
  // M315. The step a resume names, performed: review opens the lane's review
  // in view, answer goes to the waiting conversation. Resume and start keep
  // the frame Continue already did — the conversation is what they open.
  const runResumeAction = (itemId: string, action: ResumeSummary['action']): void => {
    if (action === 'review') {
      const r = boardVerbsRef.current.review?.(itemId)
      if (r !== undefined && r.kind === 'refused') paletteActionsRef.current?.say(r.reason)
    } else if (action === 'answer') {
      const panelId = workItemsRef.current.find((i) => i.id === itemId)?.panelId
      if (panelId !== undefined) jumpToAttention(panelId)
    }
  }
  const resumeOf = (shape: 'card' | 'strip'): JSX.Element | null => resumeSummary === null ? null : (
    <ResumeBanner
      summary={resumeSummary}
      shape={shape}
      onContinue={(itemId) => {
        setResumeDismissed(true)
        setRelatedItemId(itemId)
        // #10. Continuing collapses the summary into the task's normal status:
        // the lens bar it opens carries the next action until the lens closes.
        setResumedNext({ itemId, text: resumeSummary.blocker !== undefined ? `open blocker — ${resumeSummary.blocker}` : resumeSummary.nextAction, ...(resumeSummary.action === undefined ? {} : { action: resumeSummary.action }) })
        const r = frameItem(itemId)
        if (r.kind === 'refused') paletteActionsRef.current?.say(r.reason)
        // M315. Continue DOES the step it names. It framed the task and left
        // "Review" as a label, so the one press a returning person makes
        // brought them back to the conversation and no further.
        else runResumeAction(itemId, resumeSummary.action)
      }}
      onDismiss={() => setResumeDismissed(true)}
    />
  )
  const resumeBanner = briefing !== null ? (
    <ReturnBriefingCard
      briefing={briefing}
      onGoToPanel={paletteActions.goToPanel}
      onReview={(itemId) => { boardVerbsRef.current.review?.(itemId) }}
      onDecision={(panelId, requestId) => {
        jumpToAttention(panelId)
        if (requestId !== undefined) chromeRef.current.openAttentionAt(requestId)
      }}
    />
  ) : resumeSummary !== null && panels.length > 0 ? resumeOf('card') : null
  // #10. Outside the navigator, Resume is a one-line STRIP in its own grid row
  // above the center column — outside the canvas's content, so it covers
  // nothing — and only while the Panels pane is not already holding the card.
  // The briefing keeps its floating slot: it is a list, not a line.
  const resumeStrip = briefing === null && resumeSummary !== null && panels.length > 0 && !(chrome.navVisible && chrome.navigator === 'panels')
    ? resumeOf('strip') : null
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
        inspectorPinned={inspectorPinned}
        onToggleInspectorPinned={onToggleInspectorPinned}
        centerView={chrome.centerView}
        onSetCenterView={setCenterView}
        running={inspectorSummary.running}
        waiting={inspectorSummary.waiting}
        onJumpWaiting={jumpToWaiting}
        accounts={accounts}
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
      {chrome.centerView === 'orchestration' && (
        <div className="shell__orch shell__orch--on" data-center-view="orchestration" role="presentation">
          <OrchestrationView
            panels={panels}
            workItems={workItems}
            templates={orchTemplates}
            taskMemberIds={(() => {
              const focused = workItems.find((w) => w.state === WORK_ITEM_STATES[1]) ?? workItems.find((w) => w.state === WORK_ITEM_STATES[2])
              if (focused === undefined) return []
              return taskMemberships(panels, [focused])[0]?.members.map((m) => m.panelId) ?? []
            })()}
            taskMembersOf={(itemId) => {
              const item = workItems.find((w) => w.id === itemId)
              return item === undefined ? [] : taskMemberships(panels, [item])[0]?.members.map((m) => m.panelId) ?? []
            }}
            onJumpPanel={(id) => {
              leaveForCanvas()
              goToPanelOrRequest(id)
            }}
            onJumpWorkItem={(id) => {
              leaveForCanvas()
              goToWorkItem(id)
            }}
            onInterrupt={(id) => { void window.canvas.agentSession.interrupt(id) }}
            onMarkDone={markDone}
            onFocusRelated={(id) => {
              leaveForCanvas()
              frameTaskOf(id)
            }}
            onOpenFiles={() => {
              leaveForCanvas()
              chrome.chooseNavigator('files')
            }}
            /*
             * M300. An artifact opens through the canvas's OWN file verb —
             * the same `openFilePanel` the palette row, the drop and the M13
             * link all reach — so Orchestrate owns no second file reader and
             * inherits the watch ownership that one already has. It changes
             * page, which is why the row labels itself "Open on canvas".
             */
            onOpenPath={(path) => {
              leaveForCanvas()
              openFileAtCentre(path)
            }}
            onShowCanvas={() => setCenterView('canvas')}
            // M284. The Dock's, the palette's and the inspector's executor — one permission path.
            onAnswer={paletteActions.answerApproval}
            onReviewOnCanvas={(id) => {
              leaveForCanvas()
              openReview(id)
            }}
            // M287. The workspace's Orchestrate record, the board's one patch
            // door, and the canvas's own readiness judgement — one author each.
            orchestrate={orchestrate}
            onOrchestrate={setOrchestrate}
            onPatchWorkItem={patchWorkItem}
            taskHandoffOf={taskHandoffOf}
            onRefreshTaskHandoffs={refreshTaskHandoffs}
            // M289. What each handoff edge RECORDED, for the read-only lens.
            automationResults={automationResult}
            // M290. Retry's exit: the chat on the canvas with the prompt in its
            // composer, unsent — the composer's own send is the only send.
            onRetryOnCanvas={(id, text) => {
              leaveForCanvas()
              paletteActions.goToPanel(id)
              insertIntoComposer(id, text)
            }}
            // M319. The cross-backend hand-off's exit: a NEW chat on the chosen
            // backend, in the source chat's folder and as its teammate, with the
            // reviewed text inserted — never sent — in its composer.
            backendsAvailable={Object.fromEntries(BACKEND_IDS.map((b) => [b, backendAvailable(presetRows, b)]))}
            onContinueOnBackend={(id, backend, text) => {
              const source = panelsRef.current.find((p) => p.rect.id === id)
              if (source === undefined || !isChatPanel(source)) return
              leaveForCanvas()
              void beginNewChat({
                cwd: source.chat.cwd, backend, message: text,
                title: `${source.title ?? id} · on ${BACKENDS[backend].label}`,
                ...(source.chat.teammateId === undefined ? {} : { teammateId: source.chat.teammateId })
              })
            }}
            // M299. The title row's scope, and the follow-up composer's one send door:
            // the same agentSession.send a chat's composer uses, its answer read by the
            // one sentence-maker, so a refusal reads the same on both pages.
            workspaceName={workspaceRows.find((w) => w.active)?.name}
            // Navigation hierarchy: the canvas's selection goes in, Orchestrate's comes out.
            initialSelectedId={selectedId}
            onSelectionChange={setOrchSelectedId}
            // M325. The task list: the queue's groups, and a task opens in its workspace.
            taskQueue={taskQueue}
            onOpenTask={openFocusTask}
            // M327. A task's plan progress on its row, read the way its plan side reads it.
            planOf={(itemId) => {
              const item = workItems.find((w) => w.id === itemId)
              if (item?.plan === undefined) return undefined
              const members = new Set(taskMemberships(panels, [item])[0]?.members.map((m) => m.panelId) ?? [])
              const owners = new Set(item.plan.steps.map((st) => st.owner).filter((o): o is string => o !== undefined))
              const chats = panels.filter(isChatPanel).filter((p) => p.rect.id === item.panelId || members.has(p.rect.id) || owners.has(p.rect.id)).map((p) => ({ id: p.rect.id, title: p.title ?? p.rect.id }))
              const h = taskHandoffOf(itemId)
              const views = planView(item.plan, planFactsOf({ chats, runs: taskQueue.runs[itemId] ?? [], review: { standing: h?.standing ?? 'none', accepted: h?.state === 'accepted' || item.merged !== undefined } }))
              return planSummary(item.plan, views)
            }}
            onStartWork={(id) => { leaveForCanvas(); paletteActions.beginStartWork({ itemId: id }) }}
            onSend={async (id, text) => sendRefusalSentence(await window.canvas.agentSession.send(id, text, []))}
            /*
             * M302. SAVE AN ARRANGEMENT. The shape is built here, where the
             * panels and their links live, and saved through the EXISTING
             * template door — so a saved arrangement is an ordinary template
             * everywhere else in the app, with no second store and no schema
             * of its own. Refusals are sentences, never silence.
             */
            onSaveArrangement={async (islandId) => {
              const item = workItems.find((w) => w.id === islandId)
              const shown = displayPanelsRef.current
              const memberIds = item === undefined
                ? shown.filter((p) => isChatPanel(p)).map((p) => p.rect.id)
                : taskMemberships(shown, [item])[0]?.members.map((m) => m.panelId) ?? []
              const members = memberIds.flatMap((id) => {
                const p = shown.find((x) => x.rect.id === id)
                if (p === undefined || !isChatPanel(p)) return []
                return [{ panelId: id, title: railLabel(p, undefined), cwd: p.chat.cwd, rect: p.rect }]
              })
              if (members.length === 0) return 'this island has no conversation to save — an arrangement is its agents and the handoffs between them'
              // Offsets from the FIRST member, so the saved shape is the shape
              // on screen and not a set of absolute coordinates that would put
              // the next instantiation wherever this one happened to sit.
              const origin = members[0]!.rect
              const laneChat = item?.panelId === undefined ? undefined : shown.find((x) => x.rect.id === item.panelId)
              const arrangementRoots = [laneChat !== undefined && isChatPanel(laneChat) ? laneChat.chat.cwd : undefined, item?.recipeUsed?.repository]
                .filter((x): x is string => x !== undefined && x !== '')
              const edges = members.flatMap((m) => {
                const p = shown.find((x) => x.rect.id === m.panelId)
                return (p?.links ?? []).flatMap((l) => (l.automation?.kind === 'handoff' && l.automation.enabled
                  ? [{ from: m.panelId, to: l.to, trigger: l.automation.trigger }]
                  : []))
              })
              const template = arrangementTemplate(item?.title ?? 'Arrangement', {
                goal: item?.title ?? 'Arrangement',
                ...(item?.brief === undefined ? {} : { brief: item.brief }),
                ...(item?.criteria === undefined ? {} : { criteria: item.criteria }),
                // M321. A member working in the task's lane or repository is saved
                // as `{{repository}}` — a template HOLE the spawn sheet asks for —
                // so the arrangement starts in whichever repository it is taken to,
                // not in this machine's lane (which may not even exist then).
                members: members.map((m) => ({ panelId: m.panelId, title: m.title, cwd: portableCwd(m.cwd, arrangementRoots), dx: m.rect.x - origin.x, dy: m.rect.y - origin.y })),
                edges
              })
              const saved = await window.canvas.template.save(template)
              if (saved.kind === 'stale') return 'another editor saved this template first — open it and try again'
              paletteActionsRef.current?.say(`Saved “${template.name}” as an arrangement — starting it opens its conversations and sends nothing`)
              return null
            }}
          />
        </div>
      )}
      {/* The Team view: the same overlay cell, over the same mounted canvas.
          It reads nothing from the canvas — its tiles are people. */}
      {chrome.centerView === 'team' && (
        <div className="shell__orch shell__orch--on" data-center-view="team" role="presentation">
          <TeamView />
        </div>
      )}
      {/* M324. A task's focus view: the same overlay cell as Orchestrate, over
          the same mounted canvas. A task that no longer exists (deleted,
          another workspace) falls back to the canvas by the effect below. */}
      {chrome.centerView === 'focus' && focusTask !== null && (() => {
        const item = workItems.find((w) => w.id === focusTask.itemId)
        if (item === undefined) return null
        const members = taskMemberships(panels, [item])[0]?.members.map((m) => m.panelId) ?? []
        const group = taskQueue.groups.find((g) => g.itemId === item.id)
        const handoff = taskHandoffOf(item.id)
        const ctx = taskContextFor(item.id)
        return (
          <div className="shell__orch shell__orch--on" data-center-view="focus" role="presentation">
            <FocusTask
              // One instance per task: a switch is a new page, so nothing held
              // mid-gesture (an armed Accept, a picked diff line) crosses tasks.
              key={item.id}
              item={item}
              panels={panels}
              workItems={workItems}
              memberIds={members}
              {...(group === undefined ? {} : { group })}
              {...(taskQueue.history[item.id] === undefined ? {} : { history: taskQueue.history[item.id] })}
              {...(handoff === undefined ? {} : { handoff })}
              {...(ctx === undefined ? {} : { taskContext: ctx })}
              backendAvailable={(b) => backendAvailable(presetRows, b)}
              teammateName={(id) => (id === undefined ? undefined : (teammates ?? []).find((t) => t.id === id)?.name ?? id)}
              taskHandoffOf={taskHandoffOf}
              onRefreshTaskHandoffs={refreshTaskHandoffs}
              onPatchWorkItem={patchWorkItem}
              onBack={closeFocusTask}
              onShowOnCanvas={(id) => {
                setFocusTask(null)
                leaveForCanvas()
                const it = workItemsRef.current.find((w) => w.id === id)
                if (it?.panelId !== undefined && panelsRef.current.some((p) => p.rect.id === it.panelId)) frameTaskOf(it.panelId)
                else goToWorkItem(id)
              }}
              onJump={(id) => { setFocusTask(null); leaveForCanvas(); paletteActions.goToPanel(id) }}
              onOpenPath={(path) => { setFocusTask(null); leaveForCanvas(); openFileAtCentre(path) }}
              onStartWork={(id) => { setFocusTask(null); leaveForCanvas(); paletteActions.beginStartWork({ itemId: id }) }}
              {...(focusTask.side === undefined ? {} : { initialSide: focusTask.side })}
              openedAt={focusTask.at}
              // M326. Another task, in the same page; Back still returns where the first was opened from.
              // A task that needs the person opens on its request's evidence —
              // a failed check at its output, changes at the diff; a permission
              // or question is already in the conversation the page claims.
              onSwitchTask={(id) => {
                const ev = taskQueue.groups.find((g) => g.itemId === id)?.next.evidence.kind
                openFocusTask(id, ev === 'output' ? 'checks' : ev === 'review' ? 'changes' : undefined)
              }}
              needsYou={new Set(taskQueue.groups.filter((g) => g.itemId !== null && g.severity !== 'review').map((g) => g.itemId as string))}
              // M327. The plan's check step reads the task's witnessed runs; a
              // step's new agent is an ordinary chat in the step's directory, on
              // the task's backend, its brief INSERTED (M80's rule) by the page.
              checkRuns={taskQueue.runs[item.id] ?? []}
              onSpawnAgent={async (opts) => {
                // No message here: the focus view claims the new conversation
                // first, then hands it the brief — the canvas's panel must not take it.
                const r = await beginNewChat({
                  title: opts.title,
                  ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
                  ...(item.backend === undefined ? {} : { backend: item.backend }),
                  ...(item.teammateId === undefined ? {} : { teammateId: item.teammateId })
                })
                return r.kind === 'spawned' && r.id !== undefined ? { id: r.id } : { reason: r.kind === 'refused' ? r.reason : 'no conversation was opened' }
              }}
              onInterrupt={(id) => { void window.canvas.agentSession.interrupt(id) }}
            />
          </div>
        )
      })()}
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
        className={`canvas${annotating ? ' canvas--annotating' : ''}${panning ? ' canvas--panning' : spaceHeld.isHeld() ? ' canvas--space-armed' : ''}${linkDraw.state !== null ? ' canvas--linking' : ''}${viewport.scale < PORT_MIN_SCALE ? ' canvas--ports-hidden' : ''}${docFocusId !== null ? ' canvas--doc-focus' : ''}${chrome.centerView !== 'canvas' ? ' canvas--behind-orch' : ''}`}
        ref={hostRef}
        aria-hidden={chrome.centerView !== 'canvas' ? true : undefined}
        // M283. Covered means out of the tab order and deaf to clicks and keys, not only
        // invisible: an opacity-0 host still takes Tab into a terminal's textarea, and
        // typing there reached the PTY. `inert`, not display:none — a collapsed host
        // refits every xterm and SIGWINCHes each running agent (orch-page.2).
        inert={chrome.centerView !== 'canvas'}
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
        onMouseMove={onMouseMove}
        onDoubleClick={onCanvasDoubleClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* M263. Occupied canvas only: one Create + into the shared sheet. Empty
            canvas owns Start work · Ask · Create… on the launcher — mounting
            both would duplicate the primary verbs. */}
        {panels.length > 0 && (
          <NewObjectRow onOpenCreate={paletteActions.beginSpawnSheet}
            disabledReason={merged ? 'leave merged view to create an object' : undefined} />
        )}
        {/* M249. A SIBLING of .world, never inside it: outside the transformed
            layer it cannot change a panel's size, and it is absolutely
            positioned so expanding it pushes nothing (pill.rects.1). The
            attention count is the REACHABLE queue, Cmd+J's, so the pill never
            says "1 chat needs you" about a phantom it cannot jump to. */}
        <CommandPill actions={paletteActions} panels={panels}
          attentionCount={reachableQueue(waitingIds, new Set(displayPanels.map((p) => p.rect.id))).length}
          {...(lens !== null ? { taskTitle: workItems.find((i) => i.id === lens.itemId)?.title ?? lens.itemId } : {})}
          selectedIds={[...selectedIds]} orchestratorId={orchestratorTarget(orchestratorCandidates(panels))}
          engineReason={onboardingReadiness(envReport).preferred === undefined ? 'no conversation engine available — check readiness' : undefined}
          onJump={pillJump} onSend={sendFromPill} openRef={pillOpenRef} />
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
        <div className="canvas__aura" aria-hidden="true" data-activity={canvasActivity} style={{ transform: `translate(${viewport.x * 0.09}px, ${viewport.y * 0.09}px)` }} />
        <div
          className="world"
          data-detail={cardDetail}
          // M144. `--chrome-scale`: the counter-scale every frame's chrome bar
          // and resize handles read (backlog #60), clamped to [1, 2.5] — 1× at
          // the working zoom and above, so nothing changes there; 2.5× at 0.4
          // and below, where the panels are cards. ONE variable on the world,
          // so no panel re-renders for a zoom; and a CSS transform on the
          // chrome only, so no layout box moves and no agent is reflowed.
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`, '--chrome-scale': String(Math.min(2.5, Math.max(1, 1 / viewport.scale))) } as CSSProperties}
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
            <SharedPlaceholderLayer placeholders={shared.placeholders} workspaceId={activeWorkspaceId}
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
          {displayPanels.map((panel) => {
            // The partition, at the last hop. onSelect is selectAndRaise and
            // NOT onSelectPanel: the latter clears the dormant id and calls
            // registry.wake, which is the app's spawn gesture and means
            // nothing for a panel with no process — the same distinction the
            // rail draws between navigating and starting.
            if (isReviewPanel(panel)) {
              return (
                <ReviewNode
                  key={panel.rect.id}
                  panel={panel}
                  selected={selectedIds.has(panel.rect.id)}
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                  onCommitted={onReviewCommitted}
                  // The commit input is the second surface in this app that
                  // takes DOM focus off xterm, so it inherits usePalette's
                  // rule 4 — see ReviewNode's own prop comments for both
                  // halves, and for why no check can observe it.
                  restoreFocus={restoreFocus}
                  focusedId={focusedId}
                  readOnly={merged}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                                  // M86. A section's heading is the honest chain's label for its panel.
                  sectionLabel={(panelId) => { const p = panelsRef.current.find((q) => q.rect.id === panelId); return p === undefined ? undefined : railLabel(p, isTerminalPanel(p) ? registry.get(panelId)?.status : undefined) }}
                  // M202 (D07). The task, when this review was opened from a
                  // card. Every piece is resolved HERE — the canvas owns the
                  // board, the worktree records and the panel list, and a
                  // review node reaching for any of them would be a second
                  // author of facts that already have one. Absent (and the
                  // whole section with it) for a review opened any other way,
                  // and absent too when the item or its worktree is gone,
                  // because a task section with no task is worse than none.
                  task={taskContextFor(panel.subject.workItemId)}
                  />
              )
            }
            // The second sessionless arm, and onSelect is selectAndRaise here
            // for the same reason it is above: a file panel has no process, so
            // onSelectPanel's clear-dormant and registry.wake would be the
            // app's spawn gesture aimed at something that can never spawn.
            if (isFilePanel(panel)) {
              if (panel.source.deck !== undefined) return <DeckNode key={panel.rect.id} panel={panel}
                selected={selectedIds.has(panel.rect.id)} onSelect={selectAndRaise} onFocus={onFocusPanel} onBeginDrag={onBeginDrag}
                onClose={onClosePanel} restoreFocus={restoreFocus} focusedId={focusedId} readOnly={merged}
                onBeginLink={onBeginLink} linkTarget={linkDraw.state?.target === panel.rect.id} onView={setDeckView} />
              if (panel.source.sheet !== undefined) return <SheetNode key={panel.rect.id} panel={panel}
                selected={selectedIds.has(panel.rect.id)} onSelect={selectAndRaise} onFocus={onFocusPanel} onBeginDrag={onBeginDrag}
                onClose={onClosePanel} restoreFocus={restoreFocus} focusedId={focusedId} readOnly={merged}
                onBeginLink={onBeginLink} linkTarget={linkDraw.state?.target === panel.rect.id} onView={setSheetView} />
              if (panel.source.checklist !== undefined) return <ChecklistNode key={panel.rect.id} panel={panel}
                selected={selectedIds.has(panel.rect.id)} onSelect={selectAndRaise} onFocus={onFocusPanel} onBeginDrag={onBeginDrag}
                onClose={onClosePanel} restoreFocus={restoreFocus} focusedId={focusedId} readOnly={merged}
                onBeginLink={onBeginLink} linkTarget={linkDraw.state?.target === panel.rect.id} onView={setChecklistView}
                agents={panels.filter(isChatPanel).map((p) => ({ id: p.rect.id, label: railLabel(p, undefined) }))} />
              return (
                <FileNode
                  key={panel.rect.id}
                  // M256. The widened DISPLAY rect while in document focus —
                  // and a drag on it leaves focus instead of moving it, so the
                  // widened size can never be committed to the layout.
                  panel={docFocusId === panel.rect.id ? { ...panel, rect: docFocusRect(panel.rect) } : panel}
                  docFocused={docFocusId === panel.rect.id}
                  onDocFocus={onDocFocus}
                  selected={selectedIds.has(panel.rect.id)}
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={docFocusId === panel.rect.id ? () => onDocFocus(panel.rect.id, false) : onBeginDrag}
                  onClose={onClosePanel}
                  // The editor textarea is a third surface that takes DOM
                  // focus off xterm, so it inherits usePalette's rule 4 —
                  // see FileNode's own prop comments for both halves, and
                  // ReviewNode's restoreFocus prop for the precedent.
                  restoreFocus={restoreFocus}
                  focusedId={focusedId}
                  readOnly={merged}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                  vaultReady={vaultReady}
                  onImportReviewed={setImportReviewed}
                  {...(noteVault !== null && panel.source.path.startsWith(`${noteVault.root}/`) ? { vault: noteVault } : {})}
                  {...(shared.view !== null && activeWorkspaceId !== undefined ? { sharedWorkspaceId: activeWorkspaceId } : {})}
                />
              )
            }
            // M84. The eighth kind — a PROCESS node without a PTY: its
            // process is main's watch runner, addressed by this id.
            if (isWatcherPanel(panel)) {
              const trigger = panel.watch.trigger
              const source = trigger.kind === 'panel' ? panelsRef.current.find((p) => p.rect.id === trigger.sourceId) : undefined
              return (
                <WatcherNode
                  key={panel.rect.id}
                  panel={panel}
                  selected={selectedIds.has(panel.rect.id)}
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                  readOnly={merged}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                  onSetArmed={setWatcherArmed}
                  {...(source === undefined ? {} : { sourceLabel: railLabel(source, undefined) })}
                  workflowWord={panel.watch.templateId === undefined
                    ? { kind: 'none' }
                    : ((n) => (n === undefined ? { kind: 'gone' } as const : { kind: 'named', name: n } as const))(allTemplates(templateRows).find((t) => t.id === panel.watch.templateId)?.name)}
                />
              )
            }
            // M103. The eleventh kind: a live page in a guest process, its
            // chrome ours and its state the kind word.
            if (isBrowserPanel(panel)) {
              return (
                <BrowserNode
                  key={panel.rect.id}
                  panel={panel}
                  onDiscover={discoverProject}
                  onOpenPreview={(url) => { void openPreview(url) }}
                  onSetDevice={(paneId, device) => { setPreviewWidth(device, paneId) }}
                  onCapture={capturePreviewNow}
                  onStartDev={startDevServer}
                  onBindSource={bindPreview}
                  onMarkRead={markPreviewRead}
                  {...(previewSubjectReason === undefined ? {} : { bindReason: previewSubjectReason })}
                  selected={selectedIds.has(panel.rect.id)}
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                  readOnly={merged}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                  onNavigated={onBrowserNavigated}
                />
              )
            }
            // M338. A relay terminal: sessionless here, its pty on the relay VM.
            if (isRelayPanel(panel)) {
              return (
                <RelayNode
                  key={panel.rect.id}
                  panel={panel}
                  onSession={setRelaySession}
                  nameOf={relayNameFor}
                  selected={selectedIds.has(panel.rect.id)}
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                  readOnly={merged}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                />
              )
            }
            // M388. The seventeenth kind renders in the ShapeLayer below, never here.
            if (isShapePanel(panel)) return null
            // M187. The sixteenth kind: a note, in one of its three forms.
            if (isNotePanel(panel)) {
              return (
                <NoteNode
                  key={panel.rect.id}
                  panel={panel}
                  selected={selectedIds.has(panel.rect.id)}
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                  readOnly={merged}
                  onText={(panelId, text) => { setNoteText(panelId, text) }}
                  onTint={(panelId, tint) => { setNoteTint(panelId, tint) }}
                />
              )
            }
            // M181. The fifteenth kind: a picture, sessionless like the file panel.
            if (isImagePanel(panel)) {
              return (
                <ImageNode
                  key={panel.rect.id}
                  panel={panel}
                  onReplace={replaceImage}
                  reloadKey={imageReloads[panel.rect.id]}
                  selected={selectedIds.has(panel.rect.id)}
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                  readOnly={merged}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                />
              )
            }
            // M83. The seventh kind, sessionless like the four before it.
            if (isMemoryPanel(panel)) {
              return (
                <MemoryNode
                  key={panel.rect.id}
                  panel={panel}
                  selected={selectedIds.has(panel.rect.id)}
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                  readOnly={merged}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                  // 5.2 (D12). A camera and focus move onto the decision's
                  // source conversation — never a reopen: a closed chat is
                  // said to be closed, and the entry keeps its ids regardless.
                  onShowSource={(conversationId) => {
                    if (!panelsRef.current.some((p) => p.rect.id === conversationId)) return 'the conversation this was accepted from is closed — the decision keeps its source, but the transcript is not open on this canvas'
                    selectOnly(conversationId)
                    onFocusPanel(conversationId)
                    return null
                  }}
                />
              )
            }
            if (isToolboxPanel(panel)) {
              return (
                <ToolboxNode
                  key={panel.rect.id}
                  panel={panel}
                  selected={selectedIds.has(panel.rect.id)}
                  // selectAndRaise, never onSelectPanel: the latter's
                  // clear-dormant and registry.wake are the SPAWN gesture, and
                  // a toolbox node can never spawn anything.
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                  readOnly={merged}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                  onOpenFile={openFileAtCentre}
                />
              )
            }
            // M73. The fifth sessionless arm on the canvas and the first
            // process kind that is not a terminal: selectAndRaise, never
            // onSelectPanel, for the same reason as the four above — the
            // spawn gesture belongs to the composer's Send, not to a click.
            if (isChatPanel(panel)) {
              return (
                <ChatNode
                  key={panel.rect.id}
                  panel={panel}
                  selected={selectedIds.has(panel.rect.id)}
                  onSelect={selectAndRaise}
                  onFocus={onFocusPanel}
                  onBeginDrag={onBeginDrag}
                  onClose={onClosePanel}
                  readOnly={merged}
                  onBeginLink={onBeginLink}
                  linkTarget={linkDraw.state?.target === panel.rect.id}
                  claudeAvailable={backendAvailable(presetRows, backendOf(panel.chat))}
                  onOpenInTerminal={openInTerminal}
                  // M97. Focus first so the palette CAPTURES this chat (its rows act on
                  // the captured id); the open waits a tick for the focus ref to land.
                  onOpenAuto={(id) => { onFocusPanel(id); setTimeout(() => palette.openPalette(), 0) }}
                  teammateName={panel.chat.teammateId === undefined ? undefined : (teammates ?? []).find((t) => t.id === panel.chat.teammateId)?.name ?? panel.chat.teammateId}
                  taskId={workItems.find((item) => item.panelId === panel.rect.id)?.id}
                />
              )
            }
            if (isGithubPanel(panel)) return <GithubNode key={panel.rect.id} panel={panel} selected={selectedIds.has(panel.rect.id)} onSelect={selectAndRaise} onFocus={onFocusPanel} onBeginDrag={onBeginDrag} onClose={onClosePanel} onSpawn={spawnGithubItem} onAddToBoard={addGithubToBoard} boardKeys={boardKeys} readOnly={merged} onBeginLink={onBeginLink} linkTarget={linkDraw.state?.target === panel.rect.id} onConnect={openCredentials} />
            // M116. The work card: the record by id from the board's list, the
            // lane's rail label (the chat the item was dispatched to, when it
            // is still here), the roster for Assign. The verbs are Track A's
            // (M114/M115) and arrive as props after the merge; absent they
            // render disabled by name.
            if (isWorkPanel(panel)) {
              const item = workItems.find((i) => i.id === panel.work.itemId)
              const execution = item?.panelId === undefined || liveRunFacts[item.panelId] === undefined ? undefined : projectSession(item.panelId, liveRunFacts[item.panelId])
              const retained = item === undefined ? undefined : retainedOutcomes.find((outcome) => outcome.itemId === item.id)
              return <WorkNode key={panel.rect.id} panel={panel} item={item} teammates={teammates ?? []} laneLabel={item?.panelId === undefined ? undefined : railRows.find((r) => r.id === item.panelId)?.label} execution={execution} onAnswer={paletteActions.answerApproval} retainedOutcome={retained}
                selected={selectedIds.has(panel.rect.id)} onSelect={selectAndRaise} onFocus={onFocusPanel} onBeginDrag={onBeginDrag} onClose={onClosePanel} readOnly={merged} onBeginLink={onBeginLink} linkTarget={linkDraw.state?.target === panel.rect.id}
                // M114/M115. The verbs, through the SAME palette members the rows call.
                onDispatch={(itemId, teammateId) => paletteActionsRef.current?.beginStartWork({ itemId, teammateId })}
                onFocusTask={openFocusTask}
                teammateReason={teammateRefusal}
                // M275. The card's arrangement door, into the SAME one start
                // action every other door takes — with the shape chosen, so
                // the sheet opens on it rather than on a blank arrangement.
                onSwarm={(itemId, preset) => paletteActionsRef.current?.beginStartWork({ itemId, swarm: preset })}
                agentAvailable={claudeAvailable(presetRows) || codexAvailable(presetRows)}
                onOpenPr={(itemId) => paletteActionsRef.current?.openPr(itemId)}
                prReason={item === undefined ? 'this item is no longer on the board' : prRefusalSync(item, credentialRows.some((c) => c.service === 'github' && c.rejectedAt === undefined), item.teammateId === undefined ? undefined : teammates?.find((t) => t.id === item.teammateId))}
                // M202 (D07). ONE action for all four doors. It replaces the
                // M116 handler that required the lane's CHAT to still be open
                // and otherwise only left a note — a task whose agent was
                // dismissed is exactly the one a person comes back to review.
                onReview={(itemId) => { const r = reviewTaskLane(itemId); if (r.kind === 'refused') patchWorkItem(itemId, { note: r.reason }) }}
                // M203 (D08). The card's door onto the same verb; the sentence
                // is SAID, never written to the item — a camera move leaves no
                // record, and a missing member is a fact of now, not of the task.
                onShow={(panelId) => { const r = paletteActionsRef.current?.showTask(panelId); if (r !== undefined && (r.kind === 'refused' || r.partial === true)) paletteActionsRef.current?.say(r.kind === 'refused' ? r.reason : (r.note ?? '')) }}
                handoff={item === undefined ? undefined : taskHandoffOf(item.id)}
                // M202 (D07). Resume is a CAMERA and FOCUS move onto the
                // lane's conversation, never a send: the person decides what
                // their agent is told next.
                onResume={(itemId) => {
                  const it = workItemsRef.current.find((i) => i.id === itemId)
                  if (it?.panelId === undefined) return
                  if (!panelsRef.current.some((p) => p.rect.id === it.panelId)) { patchWorkItem(itemId, { note: 'the lane chat is closed — its worktree is still there to review' }); return }
                  selectOnly(it.panelId)
                  onFocusPanel(it.panelId)
                }}
                onClearHistory={(itemId) => setRetainedOutcomes((current) => current.filter((outcome) => outcome.itemId !== itemId))}
                onDone={(itemId) => paletteActionsRef.current?.markDone(itemId)} />
            }
            // M128. The skill panel: every OPEN panel that has a directory,
            // with the rail's own label, so the body can answer which of them
            // can see this skill. The record carries nothing else.
            if (isSkillPanel(panel)) {
              return <SkillNode key={panel.rect.id} panel={panel} sources={skillSources}
                selected={selectedIds.has(panel.rect.id)} onSelect={selectAndRaise} onFocus={onFocusPanel} onBeginDrag={onBeginDrag} onClose={onClosePanel} readOnly={merged} onBeginLink={onBeginLink} linkTarget={linkDraw.state?.target === panel.rect.id}
                // INSERTED into the composer, never sent — M80's rule for a
                // template's first message. `beginNewChat` is the one mint.
                onChat={(cwd, message) => { void beginNewChatRef.current({ ...(cwd === undefined ? {} : { cwd }), message }) }}
                // M129 fix. A rename that LANDED: the panel record's name and
                // the shelf's `scope:name` key are both stale the instant the
                // folder moves, and both are written here — one history entry
                // for the record, and the shelf through its own invoke (the
                // shelf is a library, never layout, so it is not in history).
                onRenamed={(panelId, newName) => { renameSkillEverywhere(panelId, newName) }} />
            }
            // M133. The workflow panel: the template by id (built-ins
            // included — they are code, not rows), the workspace's runs for
            // the Runs tab, and the four verbs, each the door that already
            // existed. Delete refuses a built-in by name.
            if (isWorkflowPanel(panel)) {
              const template = allTemplates(templateRows).find((t) => t.id === panel.workflow.templateId)
              return <WorkflowNode key={panel.rect.id} panel={panel} template={template} runs={runs} liveFacts={liveRunFacts} onAnswer={paletteActions.answerApproval}
                selected={selectedIds.has(panel.rect.id)} onSelect={selectAndRaise} onFocus={onFocusPanel} onBeginDrag={onBeginDrag} onClose={onClosePanel} readOnly={merged} onBeginLink={onBeginLink} linkTarget={linkDraw.state?.target === panel.rect.id}
                onRun={runWorkflow} onTrigger={beginWorkflowTrigger} onBuildWithAi={buildWorkflowWithAi} onMarkRead={(templateId) => { void markTemplateRead(templateId) }} onDelete={deleteWorkflowTemplate}
                onSave={saveWorkflowDraft} onSaveCopy={saveWorkflowCopy} onReload={reloadWorkflowDraft} onStopRun={stopWorkflowRun}
                deleteReason={isBuiltInTemplate(panel.workflow.templateId) ? 'a built-in workflow ships with the app and cannot be deleted' : null}
                runReason={template === undefined ? null : (templateRefusal(template, presetRows, claudeAvailable(presetRows)) ?? null)} />
            }
            if (isJiraPanel(panel)) return <JiraNode key={panel.rect.id} panel={panel} selected={selectedIds.has(panel.rect.id)} onSelect={selectAndRaise} onFocus={onFocusPanel} onBeginDrag={onBeginDrag} onClose={onClosePanel} onSpawn={spawnJiraTicket} onAddToBoard={addJiraToBoard} boardKeys={boardKeys} focusedId={focusedId} restoreFocus={restoreFocus} readOnly={merged} onBeginLink={onBeginLink} linkTarget={linkDraw.state?.target === panel.rect.id} onConnect={openCredentials} />
            const session = registry.get(panel.rect.id)
            if (!session) return null
            return (
              <TerminalPanel
                key={panel.rect.id}
                session={session}
                version={version}
                rect={panel.rect}
                z={panel.z}
                title={panel.title}
                cardDetail={cardDetail}
                // M106. Flip hands the far view's summary to every terminal deliberately — a
                // prop, because a LIVE panel never reads the card's detail.
                flipped={flipped}
                selected={selectedIds.has(panel.rect.id)}
                onSelect={onSelectPanel}
                onSlotMount={onSlotMount}
                onSlotUnmount={onSlotUnmount}
                onFocus={onFocusPanel}
                onBeginDrag={onBeginDrag}
                onClose={onClosePanel}
                glow={glowEnabled}
                readOnly={merged}
                openingContext={openingContexts.get(panel.rect.id)}
                onContextPasted={onContextPasted}
                entering={enteringPanelIds.has(panel.rect.id)}
                demoting={demotingPanelIds.has(panel.rect.id)}
                waking={wakingPanelIds.has(panel.rect.id)}
                onEntryEnd={onPanelEntryEnd}
                onBeginLink={onBeginLink}
                linkTarget={linkDraw.state?.target === panel.rect.id}
                onOpenAsChat={openAsChatVoid}
              />
            )
          })}
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
          <EdgeIndicators rects={rects} viewport={viewport} ids={waitingIds} labelOf={(id) => { const p = panels.find((x) => x.rect.id === id); return p === undefined ? id : panelName(p) }} />
        )}
        {/* M69. The overview: outside .world like the pips, in the top-right
            corner, hidden while merged (the merged view's geometry is not this
            canvas's) and by `canvas.minimap`. */}
        {/* An overview of nothing is noise beside the launcher: it appears
            with the first object. */}
        {minimapEnabled && !merged && panels.length > 0 && (
          <Minimap rects={rects} rows={railRows} viewport={viewport} goTo={goToViewport} marks={annotationMarks} selected={selectedIds} shapeIds={shapeIdSet} />
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
            <div key={lane.workspaceId} className={`lane-header${lane.active ? ' lane-header--active' : ''}`} data-lane-header={lane.workspaceId} style={{ left: Math.max(at.x, 8), top: Math.max(at.y, 36) }}>
              <span className="lane-header__name">{lane.name}</span>
              {lane.active && <span className="lane-header__note">this workspace</span>}
            </div>
          )
        })}
        {/* Beside the pips and outside .world for the same reason — see
            Marquee.tsx. It renders null at rest, so there is no "no marquee"
            element for anything to find. */}
        <Marquee rect={marquee} />
        {/* Presence: remote selections and cursors on their own 2D canvas, and
            the roster of who else is here. Siblings of .world like Marquee —
            screen-pinned, and a remote update repaints this layer only. */}
        <PresenceLayer workspaceId={activeWorkspaceId} viewport={viewport} rects={rects} />
        {/* M348. One top-centre column: who is here, then — on a shared
            workspace that is offline or catching up — what its sync is doing. */}
        <div className="presence-top">
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
          <div className="link-banner" role="status">
            Linking from <strong>{linkSourceName}</strong> — click a panel, or press Escape
          </div>
        )}
        {/* M93. The annotate strip: LOUD, with its exit on it (M40's rule). */}
        {/* M395. The strip TAKES the pointer (styles.css) and keeps its presses:
            a press on it is a press on a tool, never a label dropped on the
            ground beneath it — the canvas's own mousedown places labels. */}
        {annotating && (
          <div className="link-banner link-banner--annotate" role="status" data-annotate-strip onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}>
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
          <div className="link-banner" role="status">
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
        {/* M48. The launcher: keyed on the panel COUNT of this canvas, never
            on activity, and never while merged (the merged view's geometry is
            read-only). A sibling of .world, so it never scales. */}
        {/* The first start's one handoff hint — gone once dismissed, and with its panel. */}
        {/* M315. The guide is its conversation's caption: it steps aside while
            the person has another panel selected — the review it opened sat
            UNDER it, the guide floating over the diff it had just sent them to. */}
        {firstTask !== null && !hintsSeen.has('first-task') && panels.some((p) => p.rect.id === firstTask.panelId) &&
          (selectedIds.size === 0 || selectedIds.has(firstTask.panelId)) && (
          <FirstTaskHint panelId={firstTask.panelId} sent={firstTask.sent} onDismiss={() => { markHint('first-task'); setFirstTask(null) }}
            // Attached to its conversation: the panel's bottom-centre through
            // the viewport, so the hint rides a pan like the lane headers do.
            anchor={(() => { const r = panels.find((p) => p.rect.id === firstTask.panelId)?.rect; return r === undefined ? undefined : worldToScreen({ x: r.x + r.w / 2, y: r.y + r.h }, viewport) })()}
            above={(() => { const r = panels.find((p) => p.rect.id === firstTask.panelId)?.rect; return r === undefined ? undefined : worldToScreen({ x: r.x + r.w / 2, y: r.y }, viewport) })()}
            {...(() => {
              // M310. The flagship guide's facts, read off the task as it stands.
              const itemId = firstTask.itemId
              const item = itemId === undefined ? undefined : workItems.find((w) => w.id === itemId)
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
            })()} />
        )}
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
        {/* M309. The return briefing floats over the canvas only when the
            navigator's Panels pane is not there to hold it. Resume alone
            never floats here any more — it is the strip (see resumeStrip). */}
        {briefing !== null && resumeBanner !== null && !(chrome.navVisible && chrome.navigator === 'panels') && resumeBanner}
        {(reopen !== null || jobRecovery !== null) && (
          <div className="reopen-stack">
            {reopen !== null && (
              <ReopenNotice
                model={reopen}
                onGo={paletteActions.goToPanel}
                onStart={(id) => { paletteActions.goToPanel(id); wakeTarget(id) }}
              />
            )}
            {jobRecovery !== null && <JobRecoveryNotice model={jobRecovery} />}
          </div>
        )}
        {envReport !== null && !envReport.shell.ok && (
          <div className="env-banner" data-env-banner role="status">
            Your login shell could not be read ({envReport.shell.reason ?? 'the probe failed'}) — CLIs installed
            through your shell's rc files may not be found. Environment… in ⌘K says what was.
          </div>
        )}
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
            <div className="task-lens" data-task-lens-bar={lens.itemId} role="status">
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
        />
        {packPreview !== null && (
          <PackPreview preview={packPreview} onAdd={addPack} onClose={() => setPackPreview(null)} />
        )}
        {/* A flat, non-interactive scrim: no blur (a composited layer over a
            canvas that repaints on every pan frame is the cost .palette's own
            comment already declines to pay) and no pointer-events, so the
            outside-click exit stays exactly where it was — .shell's capture
            handler, never here. */}
        {palette.open && <div className="palette__scrim" aria-hidden="true" />}
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
        onLink={paletteActions.beginLink}
        onRemoveLink={paletteActions.removeLink}
        onRelabelLink={paletteActions.beginRelabelLink}
        selectedConnector={selectedConnectorDetail}
        onPatchConnector={(id, patch) => { const r = connectors.patch(id, patch); if (r.kind === 'refused') paletteActions.say(r.reason) }}
        onRemoveConnector={(id) => { connectors.remove(id) }}
        onStyleShape={(id, patch) => { const r = flowchart.setShapeStyle([id], patch); if (r.kind === 'refused') paletteActions.say(r.reason) }}
        onShapeChart={(id, act) => {
          const said = (r: { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }): void => { paletteActions.say(r.kind === 'ran' ? (r.note ?? 'done') : r.reason) }
          if (act === 'layout-down' || act === 'layout-right') said(flowchartIO.layout(act === 'layout-down' ? 'down' : 'right', [id]))
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
