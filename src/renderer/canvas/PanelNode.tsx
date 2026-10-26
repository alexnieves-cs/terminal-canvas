import type { MouseEvent as ReactMouseEvent, Dispatch, RefObject, SetStateAction, JSX } from 'react'
import { radarFlags, type RadarReport } from '@shared/collision-radar'
import type { Discovery as PreviewDiscovery } from '@shared/preview'
import type { AgentBackend } from '@shared/agent-session'
import type { AgentOptions } from '@shared/cost'
import type { AgentPlanCaller } from '@shared/plan'
import type { CredentialMeta } from '@shared/credential-schema'
import { type PaletteActions, type PresetRow, backendAvailable, claudeAvailable, codexAvailable } from '@renderer/palette/commands'
import type { PersistedRun } from '@shared/layout-schema'
import type { PersistedTeammate } from '@shared/teammates'
import { type PersistedTemplate, allTemplates, isBuiltInTemplate } from '@shared/templates'
import { type PersistedWorkItem, prRefusalSync, teammateRefusal } from '@shared/work-items'
import type { RetainedOutcome } from '@shared/retained-outcomes'
import { type RunLiveFact, projectSession } from '@shared/run-outcome'
import type { SpawnResult } from '@shared/ipc-contract'
import type { WorkItem } from '@shared/work-item'
import { BrowserNode } from '@renderer/browser/BrowserNode'
import { ChatNode } from '@renderer/chat/ChatNode'
import { ChecklistNode } from '@renderer/file/ChecklistNode'
import { DeckNode } from '@renderer/file/DeckNode'
import { FileNode } from '@renderer/file/FileNode'
import { GithubNode } from '@renderer/github/GithubNode'
import { ImageNode } from '@renderer/image/ImageNode'
import { JiraNode } from '@renderer/jira/JiraNode'
import { MemoryNode } from '@renderer/memory/MemoryNode'
import { NoteNode } from '@renderer/note/NoteNode'
import { RelayNode } from '@renderer/relay/RelayNode'
import { ReviewNode, type ReviewTaskContext } from '@renderer/review/ReviewNode'
import { SheetNode } from '@renderer/file/SheetNode'
import { SkillNode } from '@renderer/skills/SkillNode'
import { TerminalPanel } from '@renderer/components/TerminalPanel'
import { ToolboxNode } from '@renderer/toolbox/ToolboxNode'
import { WatcherNode } from '@renderer/watcher/WatcherNode'
import { WorkNode } from '@renderer/work/WorkNode'
import { WorkflowNode } from '@renderer/workflow/WorkflowNode'
import { backendOf } from '@shared/agent-backends'
import { isBrowserPanel, isChatPanel, isFilePanel, isGithubPanel, isImagePanel, isJiraPanel, isMemoryPanel, isNotePanel, isRelayPanel, isReviewPanel, isShapePanel, isSkillPanel, isTerminalPanel, isToolboxPanel, isWatcherPanel, isWorkPanel, isWorkflowPanel, type Panel } from '@renderer/panels/panels'
import { templateRefusal } from '@renderer/palette/template-model'
import type { ChecklistView } from '@shared/checklist'
import type { DeckView } from '@shared/deck'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { RailRow } from '@renderer/shell/rail-rows'
import type { Registry } from '@renderer/session/session-registry'
import type { ReviewHandoff } from '@shared/review-readiness'
import type { SharedCanvas } from '@renderer/shared-canvas/useSharedCanvas'
import type { SheetView } from '@shared/sheet'
import type { VaultIndex } from '@shared/vault'
import type { CardDetail } from './card-detail'
import type { DragState } from './panel-interaction'
import type { FocusSide } from '../focus/focus-model'
import { docFocusRect } from './viewport'
import { railLabel } from '../shell/rail-rows'
import type { LinkDraw } from './useLinkDraw'

/**
 * M507 (E4, the Canvas.tsx split). One panel on the canvas, by kind: the body
 * of Canvas's displayPanels.map, moved VERBATIM. It is a plain function Canvas
 * CALLS inside that map, never a component, so the element tree is exactly
 * what it was (no new boundary, so nothing remounts and no key moves). Every
 * value it reads arrives in one context object, named as Canvas names it.
 */
export interface PanelNodeContext {
  activeWorkspaceId: string | undefined
  addGithubToBoard: (item: WorkItem) => void
  addJiraToBoard: (item: WorkItem) => void
  beginNewChatRef: RefObject<(opts?: { cwd?: string | undefined; title?: string | undefined; agentOptions?: AgentOptions | undefined; appendSystemPrompt?: string | undefined; message?: string | undefined; backend?: AgentBackend | undefined; teammateId?: string | undefined; sandbox?: true | undefined; routine?: true | undefined; } | undefined) => Promise<SpawnResult>>
  beginWorkflowTrigger: (templateId: string) => void
  bindPreview: (paneId?: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  boardKeys: Set<string>
  buildWorkflowWithAi: (templateId: string) => void
  capturePreviewNow: () => Promise<{ kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }>
  cardDetail: CardDetail
  credentialRows: CredentialMeta[]
  deleteWorkflowTemplate: (templateId: string) => void
  demotingPanelIds: ReadonlySet<string>
  discoverProject: () => Promise<PreviewDiscovery | { kind: "refused"; reason: string; }>
  docFocusId: string | null
  enteringPanelIds: ReadonlySet<string>
  firstTaskStrip: (panelId: string) => JSX.Element | undefined
  flipped: boolean
  focusedId: string | null
  glowEnabled: boolean
  imageReloads: Record<string, number>
  linkDraw: LinkDraw
  liveRunFacts: Readonly<Record<string, RunLiveFact>>
  markPreviewRead: (paneId: string) => void
  markTemplateRead: (templateId: string) => Promise<void>
  merged: boolean
  nameChat: (id: string, title: string) => void
  noteVault: { root: string; index: VaultIndex; onOpenNote: (relative: string) => void; onCreateNote: (name: string) => void; onFilterTag: (tag: string) => void; } | null
  onBeginDrag: (state: DragState) => void
  onBeginLink: (id: string, event: ReactMouseEvent) => void
  onBrowserNavigated: (id: string, url: string) => void
  onClosePanel: (id: string) => void
  onContextPasted: (id: string) => void
  onDocFocus: (id: string, on: boolean) => void
  onFocusPanel: (id: string) => void
  onPanelEntryEnd: (id: string) => void
  onReviewCommitted: (nodeId: string, sha: string) => void
  onSelectPanel: (id: string, additive?: boolean) => void
  onSlotMount: (id: string) => void
  onSlotUnmount: (id: string) => void
  openAsChatVoid: (id: string) => void
  openCredentials: () => void
  openFileAtCentre: (path: string) => void
  openFocusTask: (itemId: string, side?: FocusSide) => void
  openInTerminal: (id: string) => { kind: string; reason?: string; }
  openPreview: (url?: string) => Promise<{ kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }>
  openingContexts: Map<string, string>
  palette: PaletteController
  paletteActions: PaletteActions
  paletteActionsRef: RefObject<PaletteActions | null>
  panels: Panel[]
  panelsRef: RefObject<Panel[]>
  patchWorkItem: (itemId: string, fields: Partial<PersistedWorkItem> & { anchor?: PersistedWorkItem["anchor"]; note?: string; }) => void
  presetRows: PresetRow[]
  previewSubjectReason: string | undefined
  railRows: RailRow[]
  registry: Registry
  relayNameFor: (userId: string) => string
  reloadWorkflowDraft: (templateId: string) => void
  renameSkillEverywhere: (panelId: string, newName: string) => void
  replaceImage: (panelId: string, path?: string) => Promise<{ kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }>
  restoreFocus: (id: string) => void
  retainedOutcomes: RetainedOutcome[]
  reviewTaskLane: (itemId: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  rimCovered: Set<string>
  runWorkflow: (templateId: string, source?: "click" | "fire", caller?: AgentPlanCaller) => string | undefined
  runs: PersistedRun[]
  saveWorkflowCopy: (templateId: string) => Promise<{ kind: "saved"; name?: string; } | { kind: "refused"; reason: string; }>
  saveWorkflowDraft: (templateId: string) => Promise<{ kind: "saved"; } | { kind: "stale"; reason: string; } | { kind: "refused"; reason: string; }>
  selectAndRaise: (id: string, additive?: boolean) => void
  selectOnly: (id: string | null) => void
  selectedIds: ReadonlySet<string>
  setChecklistView: (id: string, view: ChecklistView) => void
  setDeckView: (id: string, view: DeckView) => void
  setImportReviewed: (id: string) => void
  setNoteText: (panelId: string, text: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  setNoteTint: (panelId: string, tint: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  setPreviewWidth: (device: string, paneId?: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  setRelaySession: (panelId: string, sessionId: string | undefined) => void
  setRetainedOutcomes: Dispatch<SetStateAction<RetainedOutcome[]>>
  setSheetView: (id: string, view: SheetView) => void
  setWatcherArmed: (id: string, armed: boolean) => void
  shared: SharedCanvas
  skillSources: { panelId: string; cwd: string; label: string; }[]
  spawnGithubItem: (item: WorkItem) => void
  spawnJiraTicket: (item: WorkItem) => void
  startDevServer: (script?: string) => Promise<{ kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }>
  stopWorkflowRun: (templateId: string, runId?: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  taskContextFor: (itemId: string | undefined) => ReviewTaskContext | undefined
  taskHandoffOf: (itemId: string) => ReviewHandoff | undefined
  /** M479. The collision radar's last answer, for the work cards. */
  radar: RadarReport | null
  teammates: PersistedTeammate[] | null
  templateRows: PersistedTemplate[]
  terminalNameOf: ReadonlyMap<string, string>
  vaultReady: boolean
  version: number
  wakingPanelIds: ReadonlySet<string>
  workItems: PersistedWorkItem[]
  workItemsRef: RefObject<PersistedWorkItem[]>
}

export function renderPanelNode(panel: Panel, ctx: PanelNodeContext): JSX.Element | null {
  const {
    activeWorkspaceId, addGithubToBoard, addJiraToBoard, beginNewChatRef, beginWorkflowTrigger, bindPreview, boardKeys, buildWorkflowWithAi, capturePreviewNow, cardDetail, credentialRows, deleteWorkflowTemplate, demotingPanelIds, discoverProject, docFocusId, enteringPanelIds, firstTaskStrip, flipped, focusedId, glowEnabled, imageReloads, linkDraw, liveRunFacts, markPreviewRead, markTemplateRead, merged, nameChat, noteVault, onBeginDrag, onBeginLink, onBrowserNavigated, onClosePanel, onContextPasted, onDocFocus, onFocusPanel, onPanelEntryEnd, onReviewCommitted, onSelectPanel, onSlotMount, onSlotUnmount, openAsChatVoid, openCredentials, openFileAtCentre, openFocusTask, openInTerminal, openPreview, openingContexts, palette, paletteActions, paletteActionsRef, panels, panelsRef, patchWorkItem, presetRows, previewSubjectReason, railRows, registry, relayNameFor, reloadWorkflowDraft, renameSkillEverywhere, replaceImage, restoreFocus, retainedOutcomes, reviewTaskLane, rimCovered, runWorkflow, runs, saveWorkflowCopy, saveWorkflowDraft, selectAndRaise, selectOnly, selectedIds, setChecklistView, setDeckView, setImportReviewed, setNoteText, setNoteTint, setPreviewWidth, setRelaySession, setRetainedOutcomes, setSheetView, setWatcherArmed, shared, skillSources, spawnGithubItem, spawnJiraTicket, startDevServer, stopWorkflowRun, radar, taskContextFor, taskHandoffOf, teammates, templateRows, terminalNameOf, vaultReady, version, wakingPanelIds, workItems, workItemsRef
  } = ctx
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
        guide={firstTaskStrip(panel.rect.id)}
        onNameChat={nameChat}
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
      onMergeCloud={(panelId) => { const a = paletteActionsRef.current; if (a !== undefined && a !== null) void a.mergeCloud(panelId).then((r) => a.say(r.kind === 'refused' ? r.reason : r.note ?? '')) }}
      onSendToCloud={(panelId, provider) => { const a = paletteActionsRef.current; if (a !== undefined && a !== null) void a.sendToCloud(panelId, provider).then((r) => a.say(r.kind === 'refused' ? r.reason : r.note ?? '')) }}
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
      collisions={item === undefined || radar === null ? undefined : radarFlags(item.id, radar, (id) => workItems.find((w) => w.id === id)?.title ?? 'another task')}
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
      defaultTitle={terminalNameOf.get(panel.rect.id)}
      onRename={merged ? undefined : paletteActions.renamePanel}
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
      rimInset={rimCovered.has(panel.rect.id)}
    />
  )
}
