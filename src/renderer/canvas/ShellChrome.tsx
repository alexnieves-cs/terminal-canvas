import { Navigator } from '../shell/Navigator'
import type { Dispatch, MouseEvent as ReactMouseEvent, RefObject, SetStateAction, JSX } from 'react'
import { type Panel, isChatPanel, isTerminalPanel } from '@renderer/panels/panels'
import type { PersistedRoutine } from '@shared/routines'
import type { PersistedTeammate } from '@shared/teammates'
import type { PersistedWorkItem } from '@shared/work-items'
import { type PresetRow, REASON_NO_REPO_MEMORY } from '@renderer/palette/commands'
import type { Tone } from '@renderer/panels/panel-state'
import type { ToolScope } from '@shared/toolbox'
import { getChat } from '@renderer/chat/chat-store'
import { panelName } from '@renderer/palette/panel-name'
import type { BoardVerbs } from './useBoardVerbs'
import type { CenterView } from '../shell/useShellChrome'
import type { FocusSide } from '../focus/focus-model'
import { Dock } from '../shell/Dock'
import { ReplaySheet } from '../replay/ReplaySheet'
import { ShareDialog } from '../account/ShareDialog'
import { TopBar } from '../shell/TopBar'
import { contextualHint } from './hints'
import { notifyRefused } from '../shell/toast'
import { panelLabel } from './canvas-constants'

import type { Accounts } from '@renderer/account/useAccounts'
import type { ElsewhereRow } from '@renderer/shell/rail-sections'
import type { FileRow } from '@renderer/shell/file-tree-model'
import type { HintId } from './hints'
import type { Inbox } from '@renderer/shell/decision-inbox'
import type { IntegrationRow } from '@renderer/shell/integration-model'
import type { PaletteActions } from '@renderer/palette/commands'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { RailAttention } from '@renderer/shell/rail-sections'
import type { RailRow } from '@renderer/shell/rail-rows'
import type { RailRun } from '@renderer/shell/rail-sections'
import type { RailWorkspace } from '@renderer/shell/rail-sections'
import type { RateLimitState } from '@shared/rate-limit'
import type { SettingRow } from '@shared/ipc-contract'
import type { ShapePanel } from '@renderer/panels/panels'
import type { SharedCanvas } from '@renderer/shared-canvas/useSharedCanvas'
import type { ShelfState } from '@renderer/shell/SkillsPane'
import type { ShellChrome } from '@renderer/shell/useShellChrome'
import type { SkillColumn } from '@renderer/shell/skills-pane-model'
import type { SkillKey } from '@shared/skills'
import type { SkillUse } from '@renderer/skills/skill-trail-store'
import type { SkillsInventoryState } from '@renderer/shell/SkillsPane'
import type { SnapshotMeta } from '@shared/ipc-contract'
import type { TagEntry } from '@shared/vault'
import type { TaskMembership } from './task-members'
import type { TaskMenuFact } from './object-verbs'
import type { TaskQueue } from '@renderer/shell/task-queue'
import type { UsageHistory } from '@renderer/shell/inspector-fields'
import type { UsageSeries } from '@renderer/shell/usage-series'
import type { VaultNoteRow } from '@shared/ipc-contract'
import type { WorkItemState } from '@shared/work-items'
import type { WorkspaceRow } from '@shared/ipc-contract'
/**
 * M507 (E4, the Canvas.tsx split). The shell's chrome around the canvas, in
 * screen-reader order: the dock, the top bar, the share dialog, the replay
 * sheet, the resume strip and the navigator. Moved VERBATIM; it is a plain
 * function Canvas calls in the same place in the shell, never a component, and
 * every value it reads arrives in one context object named as Canvas names it.
 */
export interface RenderShellChromeContext {
  accounts: Accounts
  approvalTaskOf: (panelId: string) => string | undefined
  attemptedHint: HintId | null
  boardPaneProps: { items: PersistedWorkItem[]; teammates: PersistedTeammate[]; laneLabelOf: (panelId: string) => string | undefined; hasCard: (itemId: string) => boolean; onGoTo: (itemId: string) => void; onSetState: (itemId: string, state: WorkItemState) => void; onShowOnCanvas: (itemId: string) => void; onFocusTask: (itemId: string, side?: FocusSide) => void; onToggle: () => void; }
  boardVerbsRef: RefObject<BoardVerbs>
  chrome: ShellChrome
  dock: { expanded: boolean; toggle: () => void; }
  frameTaskOf: (panelId: string) => void
  goToPanelOrRequest: (panelId: string) => void
  hintsLoaded: boolean
  hintsSeen: ReadonlySet<string>
  inbox: Inbox
  insertPath: (path: string) => void
  inspectorPinned: boolean
  inspectorSummary: { rateLimit: RateLimitState; panels: number; running: number; waiting: number; tokens: number; cost: number | undefined; history?: UsageHistory | null; usageSeries?: UsageSeries | null; }
  integrationsPaneProps: { skipped: number; panelLabel: (panelId: string) => string | undefined; onConnect: (_service: string) => void; onVerify: (service: string) => void; onRefresh: () => void; grants: { [k: string]: { name: string; places: string[]; }[]; }; auditFailure?: string | undefined; onToggle: () => void; rows: IntegrationRow[]; audit: "failed" | "ready" | "pending"; }
  jumpAnywhere: (panelId: string) => void
  jumpToWaiting: () => void
  leaveForCanvas: () => void
  merged: boolean
  navTask: TaskMembership | null
  noteRoot: string | null
  onNavResizeDown: (event: ReactMouseEvent) => void
  onRunAgain: (id: string) => void
  onToggleInspectorPinned: () => void
  openFocusTask: (itemId: string, side?: FocusSide) => void
  openSettingsScope: () => void
  orchSelectedId: string | null
  palette: PaletteController
  paletteActions: PaletteActions
  panels: Panel[]
  presetRows: PresetRow[]
  railAttention: RailAttention[]
  railElsewhere: ElsewhereRow[]
  railRows: RailRow[]
  railRuns: (RailRun | { note: string; id: string; name: string; panels: number; duration: string; cost: string; facts: string; outcome: string; tone: Tone; runAgain: { enabled: true; } | { enabled: false; reason: string; }; })[]
  railWorkspaces: RailWorkspace[]
  refreshTree: () => void
  reloadWorkspaces: () => void
  restoreSnapshot: (at: number) => void
  resumeBanner: JSX.Element | null
  resumeStrip: JSX.Element | null
  selectedId: string | null
  selectedPanel: Panel | undefined
  setCenterView: (view: CenterView) => void
  settingRows: SettingRow[]
  shapePanels: ShapePanel[]
  shared: SharedCanvas
  skillsPaneProps: { onToggle: () => void; state: SkillsInventoryState; shelfState: ShelfState; projectScopeReason: string | null; projectScopeNote: string | null; newSkillResult: string | null; onNewSkill: (scope: "user" | "project", name: string) => void; columns: SkillColumn[]; placedKeys: ReadonlySet<string>; onPlaceOnCanvas: (scope: ToolScope, name: string) => void; readUsage: () => SkillUse[]; teammates: PersistedTeammate[]; assignNotice: string | null; onAssignColumn: (columnId: string, teammateId: string) => void; onAssignCard: (key: SkillKey, teammateId: string) => void; kind: "skill" | "command" | "agent"; onChooseKind: Dispatch<SetStateAction<"skill" | "command" | "agent">>; query: string; onQuery: Dispatch<SetStateAction<string>>; scopes: ToolScope[] | null; onToggleScope: (scope: ToolScope) => void; placedOnly: boolean; onTogglePlacedOnly: () => void; onPlace: (key: SkillKey, columnId: string) => void; onNewColumn: () => void; onDeleteColumn: (id: string) => void; }
  snapshots: SnapshotMeta[] | null
  switchWorkspace: (id: string) => Promise<boolean>
  taskMenuRef: RefObject<(id: string) => TaskMenuFact>
  taskQueue: TaskQueue
  teammatesPaneProps: { onToggle: () => void; teammates: PersistedTeammate[]; loaded: boolean; selectedId: string | null; onSelect: Dispatch<SetStateAction<string | null>>; onCreate: (name: string) => void; onSave: (t: PersistedTeammate) => void; onDelete: (id: string) => void; onDispatch: (itemId: string, teammateId: string) => void | undefined; onAddPlace: (id: string) => void; onChat: (id: string) => void; services: { id: string; label: string; connected: boolean; }[]; routines: PersistedRoutine[]; onSaveRoutine: (r: PersistedRoutine) => Promise<string | null>; onDeleteRoutine: (id: string) => void; onRunRoutine: (id: string) => void; onOpenLast: (panelId: string) => void; }
  toggleDir: (path: string) => void
  toggleMerged: () => void
  treeContextReason: string | undefined
  treeRoot: string | null
  treeRootLabel: string | null
  treeRootPending: boolean
  treeRows: FileRow[]
  vaultPaneProps: { skipped: number; selectedPath: string | null; onOpenNote: (relative: string) => void; onChooseRoot: () => void; onRefresh: () => void; tags: Record<string, TagEntry[]>; filterRequest: { tag: string; nonce: number; } | null; reason?: string | undefined; onToggle: () => void; root: string; notes: VaultNoteRow[]; pending: boolean; }
  workspaceRows: WorkspaceRow[]
}

export function renderShellChrome(ctx: RenderShellChromeContext): JSX.Element {
  const {
    accounts, approvalTaskOf, attemptedHint, boardPaneProps, boardVerbsRef, chrome, dock, frameTaskOf, goToPanelOrRequest, hintsLoaded, hintsSeen, inbox, insertPath, inspectorPinned, inspectorSummary, integrationsPaneProps, jumpAnywhere, jumpToWaiting, leaveForCanvas, merged, navTask, noteRoot, onNavResizeDown, onRunAgain, onToggleInspectorPinned, openFocusTask, openSettingsScope, orchSelectedId, palette, paletteActions, panels, presetRows, railAttention, railElsewhere, railRows, railRuns, railWorkspaces, refreshTree, reloadWorkspaces, restoreSnapshot, resumeBanner, resumeStrip, selectedId, selectedPanel, setCenterView, settingRows, shapePanels, shared, skillsPaneProps, snapshots, switchWorkspace, taskMenuRef, taskQueue, teammatesPaneProps, toggleDir, toggleMerged, treeContextReason, treeRoot, treeRootLabel, treeRootPending, treeRows, vaultPaneProps, workspaceRows
  } = ctx
  return (
    <>
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
    </>
  )
}
