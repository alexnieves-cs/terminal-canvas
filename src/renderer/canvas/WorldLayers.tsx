import type { Dispatch, JSX, MouseEvent as ReactMouseEvent, RefObject, SetStateAction } from 'react'
import type { RadarReport } from '@shared/collision-radar'
import type { Discovery as PreviewDiscovery } from '@shared/preview'
import type { AgentBackend } from '@shared/agent-session'
import type { AgentOptions } from '@shared/cost'
import type { AgentPlanCaller } from '@shared/plan'
import type { Annotation } from '@shared/annotations'
import type { CanvasGroup } from '@renderer/groups/groups'
import { type LiveBinding, ShapeLayer } from '@renderer/flowchart/ShapeLayer'
import { type Panel, RELAY_H, RELAY_W, isChatPanel, isTerminalPanel, type TerminalPanel, type ShapePanel } from '@renderer/panels/panels'
import type { PeerFlow } from '@renderer/flowchart/shared-shapes'
import type { PersistedRun } from '@shared/layout-schema'
import type { PersistedTeammate } from '@shared/teammates'
import type { PersistedTemplate } from '@shared/templates'
import type { PersistedWorkItem } from '@shared/work-items'
import type { PresetRow, PaletteActions } from '@renderer/palette/commands'
import type { RetainedOutcome } from '@shared/retained-outcomes'
import type { RunLiveFact } from '@shared/run-outcome'
import type { SpawnResult } from '@shared/ipc-contract'
import type { ToolScope } from '@shared/toolbox'
import type { WorkItem } from '@shared/work-item'
import { ConnectorLayer } from '@renderer/flowchart/ConnectorLayer'
import { GroupLayer } from '@renderer/groups/GroupLayer'
import { InlineApproval } from '@renderer/shell/ApprovalDetail'
import { NavigateTier } from '@renderer/palette/navigate-tier'
import { SkillTrailLane } from '@renderer/skills/SkillTrailLane'
import { waitingSince } from '@renderer/panels/header-rest'
import type { ChecklistView } from '@shared/checklist'
import type { CredentialMeta } from '@shared/credential-schema'
import type { DeckView } from '@shared/deck'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { PendingApproval } from '@renderer/shell/rail-sections'
import type { PersistedGroup } from '@shared/groups'
import type { RailRow } from '@renderer/shell/rail-rows'
import type { Registry } from '@renderer/session/session-registry'
import type { ReviewHandoff } from '@shared/review-readiness'
import type { ReviewTaskContext } from '@renderer/review/ReviewNode'
import type { SharedCanvas } from '@renderer/shared-canvas/useSharedCanvas'
import type { SharedPanel } from '@shared/canvas-ops'
import type { SheetView } from '@shared/sheet'
import type { Shelf } from '@shared/skills'
import type { TaskRegion } from '@shared/redesign-contracts'
import type { VaultIndex } from '@shared/vault'
import type { CardDetail } from './card-detail'
import type { Connectors } from './useConnectors'
import type { DragState } from './panel-interaction'
import type { FocusSide } from '../focus/focus-model'
import type { Point, Viewport } from './viewport'
import type { SnapGuide } from './placement'
import type { SpacingGuide } from './arrange'
import type { TaskCluster } from './task-clusters'
import { AgentLinkLayer } from './AgentLinkLayer'
import { AnnotationLayer } from './AnnotationLayer'
import { LinkLayer } from './LinkLayer'
import { MergedLanes } from './MergedLanes'
import { SharedPlaceholderLayer } from '../shared-canvas/SharedPlaceholderLayer'
import { SnapGuides } from './SnapGuides'
import { SubagentLayer } from './SubagentLayer'
import { TaskClusterLayer, TaskRegionLayer, TierLayer } from './TaskClusterLayer'
import { renderPanelNode } from './PanelNode'
import type { FlowchartVerbs } from './useFlowchartVerbs'
import type { LinkDraw } from './useLinkDraw'
import type { MergedLayout } from './merged-layout'

/**
 * M507 (E4, the Canvas.tsx split). Everything inside the transformed .world
 * layer: run frames and groups, task clusters and regions, the tiers, inline
 * approvals, the annotate sheet, snap guides, teammates' placeholders, notes
 * in the margins, links, the skill trail, every panel, connectors and shapes,
 * merged lanes, subagents and the landing halo. Moved out of Canvas VERBATIM
 * as a plain function, not a component, and called in place, so the element
 * tree (and so every mount, key and paint order) is exactly what it was.
 */
export interface RenderWorldLayersContext {
  activeWorkspaceId: string | undefined
  addGithubToBoard: (item: WorkItem) => void
  addJiraToBoard: (item: WorkItem) => void
  agentLinksOn: boolean
  annotating: boolean
  annotations: Annotation[]
  annotationsRef: RefObject<Annotation[]>
  beginNewChatRef: RefObject<(opts?: { cwd?: string | undefined; title?: string | undefined; agentOptions?: AgentOptions | undefined; appendSystemPrompt?: string | undefined; message?: string | undefined; backend?: AgentBackend | undefined; teammateId?: string | undefined; sandbox?: true | undefined; routine?: true | undefined; } | undefined) => Promise<SpawnResult>>
  beginWorkflowTrigger: (templateId: string) => void
  bindPreview: (paneId?: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  boardKeys: Set<string>
  buildWorkflowWithAi: (templateId: string) => void
  capturePreviewNow: () => Promise<{ kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }>
  cardDetail: CardDetail
  clusterHulls: TaskCluster[]
  collapsedPanelIds: Set<string>
  commitAnnotation: (id: string, text: string) => void
  connectors: Connectors
  creationShareRef: RefObject<string | undefined>
  credentialRows: CredentialMeta[]
  deleteWorkflowTemplate: (templateId: string) => void
  demotingPanelIds: ReadonlySet<string>
  discoverProject: () => Promise<PreviewDiscovery | { kind: "refused"; reason: string; }>
  displayPanels: Panel[]
  docFocusId: string | null
  edgeLabels: Map<string, string>
  editingAnnotation: string | null
  enteringPanelIds: ReadonlySet<string>
  firstTaskStrip: (panelId: string) => JSX.Element | undefined
  flipped: boolean
  flowchart: FlowchartVerbs
  focusedId: string | null
  glowEnabled: boolean
  goToPanelOrRequest: (panelId: string) => void
  groups: PersistedGroup[]
  hostRef: RefObject<HTMLDivElement | null>
  imageReloads: Record<string, number>
  inkDraft: [number, number][] | null
  landingLit: { id: string; seq: number; } | null
  linkDraw: LinkDraw
  liveRunFacts: Readonly<Record<string, RunLiveFact>>
  markPreviewRead: (paneId: string) => void
  markTemplateRead: (templateId: string) => Promise<void>
  merged: boolean
  mergedView: MergedLayout | null
  nameChat: (id: string, title: string) => void
  noteVault: { root: string; index: VaultIndex; onOpenNote: (relative: string) => void; onCreateNote: (name: string) => void; onFilterTag: (tag: string) => void; } | null
  onBeginDrag: (state: DragState) => void
  onBeginGroupDrag: (group: CanvasGroup, event: ReactMouseEvent<HTMLElement>) => void
  onBeginLink: (id: string, event: ReactMouseEvent) => void
  onBeginPlaceholderDrag: (p: SharedPanel, event: { clientX: number; clientY: number; }) => void
  onBrowserNavigated: (id: string, url: string) => void
  onClosePanel: (id: string) => void
  onConnectorSelect: (id: string) => void
  onContextPasted: (id: string) => void
  onDocFocus: (id: string, on: boolean) => void
  onFocusPanel: (id: string) => void
  onPanelEntryEnd: (id: string) => void
  onPeerShapePress: (id: string, event: { clientX: number; clientY: number; }) => void
  onPeerShapeRemove: (id: string) => void
  onRemoveGroup: (id: string) => void
  onRemovePlaceholder: (p: SharedPanel) => void
  onReviewCommitted: (nodeId: string, sha: string) => void
  onSelectPanel: (id: string, additive?: boolean) => void
  onSlotMount: (id: string) => void
  onSlotUnmount: (id: string) => void
  openAsChatVoid: (id: string) => void
  openCredentials: () => void
  openDraftReview: (objectId: string) => void
  openFileAtCentre: (path: string) => void
  openFocusTask: (itemId: string, side?: FocusSide) => void
  openInTerminal: (id: string) => { kind: string; reason?: string; }
  openPreview: (url?: string) => Promise<{ kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }>
  openRelayPanel: (relay: { program: string; sessionId?: string; shareId?: string; }, at?: Point) => void
  openSkillPanel: (scope: ToolScope, name: string, world: Point) => void
  openingContexts: Map<string, string>
  palette: PaletteController
  paletteActions: PaletteActions
  paletteActionsRef: RefObject<PaletteActions | null>
  panels: Panel[]
  panelsRef: RefObject<Panel[]>
  patchWorkItem: (itemId: string, fields: Partial<PersistedWorkItem> & { anchor?: PersistedWorkItem["anchor"]; note?: string; }) => void
  peerFlow: PeerFlow
  peerRemovable: Set<string>
  pendingApprovals: PendingApproval[]
  presetRows: PresetRow[]
  previewSubjectReason: string | undefined
  railRows: RailRow[]
  registry: Registry
  relayNameFor: (userId: string) => string
  releaseFocusStable: () => void
  reloadWorkflowDraft: (templateId: string) => void
  removeLinkStable: (from: string, to: string) => void
  renameSkillEverywhere: (panelId: string, newName: string) => void
  replaceImage: (panelId: string, path?: string) => Promise<{ kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }>
  restoreFocus: (id: string) => void
  retainedOutcomes: RetainedOutcome[]
  reviewTaskLane: (itemId: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  rimCovered: Set<string>
  runFrames: PersistedGroup[]
  runWorkflow: (templateId: string, source?: "click" | "fire", caller?: AgentPlanCaller) => string | undefined
  runs: PersistedRun[]
  saveWorkflowCopy: (templateId: string) => Promise<{ kind: "saved"; name?: string; } | { kind: "refused"; reason: string; }>
  saveWorkflowDraft: (templateId: string) => Promise<{ kind: "saved"; } | { kind: "stale"; reason: string; } | { kind: "refused"; reason: string; }>
  selectAndRaise: (id: string, additive?: boolean) => void
  selectLink: (from: string, to: string) => void
  selectOnly: (id: string | null) => void
  selectedAnnotation: string | null
  selectedIds: ReadonlySet<string>
  selectedLink: { from: string; to: string; } | null
  setChecklistView: (id: string, view: ChecklistView) => void
  setDeckView: (id: string, view: DeckView) => void
  setEditingAnnotation: Dispatch<SetStateAction<string | null>>
  setImportReviewed: (id: string) => void
  setNoteText: (panelId: string, text: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  setNoteTint: (panelId: string, tint: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  setPreviewWidth: (device: string, paneId?: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  setRelaySession: (panelId: string, sessionId: string | undefined) => void
  setRetainedOutcomes: Dispatch<SetStateAction<RetainedOutcome[]>>
  setSelectedAnnotation: Dispatch<SetStateAction<string | null>>
  setSheetView: (id: string, view: SheetView) => void
  setWatcherArmed: (id: string, armed: boolean) => void
  shapeLive: Map<string, LiveBinding>
  shapePanels: ShapePanel[]
  shared: SharedCanvas
  shelf: Shelf
  skillSources: { panelId: string; cwd: string; label: string; }[]
  snapGuides: { guides: readonly SnapGuide[]; spacing: readonly SpacingGuide[]; }
  spawnGithubItem: (item: WorkItem) => void
  spawnJiraTicket: (item: WorkItem) => void
  startDevServer: (script?: string) => Promise<{ kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }>
  stopWorkflowRun: (templateId: string, runId?: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  taskContextFor: (itemId: string | undefined) => ReviewTaskContext | undefined
  taskHandoffOf: (itemId: string) => ReviewHandoff | undefined
  /** M479. The collision radar's last answer, for the work cards. */
  radar: RadarReport | null
  taskRegions: TaskRegion[]
  teammates: PersistedTeammate[] | null
  templateRows: PersistedTemplate[]
  terminalNameOf: ReadonlyMap<string, string>
  terminalPanels: TerminalPanel[]
  toggleGroupCollapsed: (id: string) => void
  vaultReady: boolean
  version: number
  viewport: Viewport
  wakingPanelIds: ReadonlySet<string>
  workItems: PersistedWorkItem[]
  workItemsRef: RefObject<PersistedWorkItem[]>
}

export function renderWorldLayers(ctx: RenderWorldLayersContext): JSX.Element {
  const {
    activeWorkspaceId, addGithubToBoard, addJiraToBoard, agentLinksOn, annotating, annotations, annotationsRef, beginNewChatRef, beginWorkflowTrigger, bindPreview, boardKeys, buildWorkflowWithAi, capturePreviewNow, cardDetail, clusterHulls, collapsedPanelIds, commitAnnotation, connectors, creationShareRef, credentialRows, deleteWorkflowTemplate, demotingPanelIds, discoverProject, displayPanels, docFocusId, edgeLabels, editingAnnotation, enteringPanelIds, firstTaskStrip, flipped, flowchart, focusedId, glowEnabled, goToPanelOrRequest, groups, hostRef, imageReloads, inkDraft, landingLit, linkDraw, liveRunFacts, markPreviewRead, markTemplateRead, merged, mergedView, nameChat, noteVault, onBeginDrag, onBeginGroupDrag, onBeginLink, onBeginPlaceholderDrag, onBrowserNavigated, onClosePanel, onConnectorSelect, onContextPasted, onDocFocus, onFocusPanel, onPanelEntryEnd, onPeerShapePress, onPeerShapeRemove, onRemoveGroup, onRemovePlaceholder, onReviewCommitted, onSelectPanel, onSlotMount, onSlotUnmount, openAsChatVoid, openCredentials, openDraftReview, openFileAtCentre, openFocusTask, openInTerminal, openPreview, openRelayPanel, openSkillPanel, openingContexts, palette, paletteActions, paletteActionsRef, panels, panelsRef, patchWorkItem, peerFlow, peerRemovable, pendingApprovals, presetRows, previewSubjectReason, railRows, registry, relayNameFor, releaseFocusStable, reloadWorkflowDraft, removeLinkStable, renameSkillEverywhere, replaceImage, restoreFocus, retainedOutcomes, reviewTaskLane, rimCovered, runFrames, runWorkflow, runs, saveWorkflowCopy, saveWorkflowDraft, selectAndRaise, selectLink, selectOnly, selectedAnnotation, selectedIds, selectedLink, setChecklistView, setDeckView, setEditingAnnotation, setImportReviewed, setNoteText, setNoteTint, setPreviewWidth, setRelaySession, setRetainedOutcomes, setSelectedAnnotation, setSheetView, setWatcherArmed, shapeLive, shapePanels, shared, shelf, skillSources, snapGuides, spawnGithubItem, spawnJiraTicket, startDevServer, stopWorkflowRun, radar, taskContextFor, taskHandoffOf, taskRegions, teammates, templateRows, terminalNameOf, terminalPanels, toggleGroupCollapsed, vaultReady, version, viewport, wakingPanelIds, workItems, workItemsRef
  } = ctx
  return (
    <>
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
        activeWorkspaceId, addGithubToBoard, addJiraToBoard, beginNewChatRef, beginWorkflowTrigger, bindPreview, boardKeys, buildWorkflowWithAi, capturePreviewNow, cardDetail, credentialRows, deleteWorkflowTemplate, demotingPanelIds, discoverProject, docFocusId, enteringPanelIds, firstTaskStrip, flipped, focusedId, glowEnabled, imageReloads, linkDraw, liveRunFacts, markPreviewRead, markTemplateRead, merged, nameChat, noteVault, onBeginDrag, onBeginLink, onBrowserNavigated, onClosePanel, onContextPasted, onDocFocus, onFocusPanel, onPanelEntryEnd, onReviewCommitted, onSelectPanel, onSlotMount, onSlotUnmount, openAsChatVoid, openCredentials, openFileAtCentre, openFocusTask, openInTerminal, openPreview, openingContexts, palette, paletteActions, paletteActionsRef, panels, panelsRef, patchWorkItem, presetRows, previewSubjectReason, railRows, registry, relayNameFor, reloadWorkflowDraft, renameSkillEverywhere, replaceImage, restoreFocus, retainedOutcomes, reviewTaskLane, rimCovered, runWorkflow, runs, saveWorkflowCopy, saveWorkflowDraft, selectAndRaise, selectOnly, selectedIds, setChecklistView, setDeckView, setImportReviewed, setNoteText, setNoteTint, setPreviewWidth, setRelaySession, setRetainedOutcomes, setSheetView, setWatcherArmed, shared, skillSources, spawnGithubItem, spawnJiraTicket, startDevServer, stopWorkflowRun, radar, taskContextFor, taskHandoffOf, teammates, templateRows, terminalNameOf, vaultReady, version, wakingPanelIds, workItems, workItemsRef
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
    </>
  )
}
