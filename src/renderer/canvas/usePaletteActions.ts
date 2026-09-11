import { onboardingReadiness, isFirstLaunchBackend, FIRST_LAUNCH_ENGINES } from '@shared/onboarding'
import { CREATABLE_OBJECTS, type CreationResult } from '@shared/verb-table'
import { checklistController } from '@renderer/file/checklist-controllers'
import { sheetController } from '@renderer/file/sheet-controllers'
import { forgetAgentLinksFor } from './agent-links-store'
import { normalisePreviewPath, type PreviewBinding } from '@shared/preview'
import { inspectionDirectory } from './inspection-directory'
import { applyDraftOp, getDraft, resetDraft } from '@renderer/workflow/template-draft-store'
import { configureNode, moveNode } from '@shared/template-edit'
import { LIBRARY, defaultNodeOf, placementFor } from '@shared/template-library'
import { HANDOFF_TRIGGERS } from '@shared/handoff'
import { isBuiltInTemplate, type TemplateNode } from '@shared/templates'
import { useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { AgentOptions } from '@shared/cost'
import type { ToolScope } from '@shared/toolbox'
import { BACKEND_IDS, DEFAULT_BACKEND } from '@shared/agent-backends'
import { backendAvailable, claudeAvailable, codexAvailable } from '@renderer/palette/commands'
import { carryMarks } from '@renderer/panels/panels'
import { disposeWatcher } from '@renderer/watcher/useWatchers'
import { disposeChat } from '@renderer/chat/useChatSessions'
import { insertIntoComposer, lastAssistantText, reportedModels, scrollToTurn } from '@renderer/chat/chat-store'
import { refreshChatGrants } from '@renderer/chat/useChatSessions'
import { buildPlan, describePlan, parsePlanLine, planIsDestructive, runPlan, runAgentPlan, type AgentPlanCaller, type PlanFacts, type PlanStep, type StepOutcome } from '@shared/plan'
import { outward } from '@shared/outward'
import { REASON_NO_LIVE_PAGE, normaliseTypedUrl } from '@shared/browser-panel'
import { browserGuestId } from '@renderer/browser/browser-store'
import type { SettingValue } from '@shared/settings-schema'
import { DENY_MESSAGE } from '@renderer/chat/chat-model'
import { fillPlaceholders, askableHoles, fillBuiltIns } from '@renderer/chat/composer-model'
import { allTemplates } from '@shared/templates'
import type { SpawnResult } from '@shared/ipc-contract'
import { WORK_ITEM_STATES, upsertWorkItem, workItemRefusal, type PersistedWorkItem } from '@shared/work-items'
import { repoOfKey } from '@shared/work-items'
import { startWorkNeeds, type StartWorkOutcome, type StartWorkRepo } from '@renderer/palette/start-work'
import type { Registry } from '@renderer/session/session-registry'
import { tidyPanels } from './placement'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import { clearAgentState, getAgentState } from '@renderer/session/agent-state-store'
import { clearLastLine } from '@renderer/session/last-line-store'
import { beginUpdateCheck, getUpdateState, setUpdateResult, updateSentence } from '@renderer/session/update-store'
import { clearLiveSession, getLiveSession } from '@renderer/session/live-session-store'
import { buildSpawnRequest } from '@renderer/palette/spawn-sheet'
import { LINEUPS, lineupPlan, type Lineup } from '@shared/lineups'
import { getChat } from '@renderer/chat/chat-store'
import { templateRefusal, templateHoles } from '@renderer/palette/template-model'
import { SUPERVISOR_PROMPT, type AgentBackend } from '@shared/agent-session'
import type { HandoffTrigger } from '@shared/handoff'
import type { PersistedTemplate } from '@shared/templates'
import { clearSubagents } from '@renderer/session/subagent-store'
// M130. Beside the four clears above: a recycled id must not inherit a dead
// panel's skill trail.
import { clearTrail } from '@renderer/skills/skill-trail-store'
import { clearFileResult } from '@renderer/session/file-store'
import { clearToolbox } from '@renderer/session/toolbox-store'
import { clearUsage } from '@renderer/session/usage-store'
import { clearMachineCost } from '@renderer/session/machine-cost-store'
import { clearScrollbackTail } from '@renderer/session/scrollback-store'
import {
  isWatcherPanel, isGithubPanel, isMemoryPanel, isBrowserPanel, isWorkPanel, isSkillPanel, isImagePanel,
  isNotePanel, isChatPanel, isFilePanel, isJiraPanel, isReviewPanel, isTerminalPanel, isToolboxPanel, isWorkflowPanel,
  linksOf, removeLink, setLinkLabel, type Panel
} from '@renderer/panels/panels'
import { expandGroup, removeGroup, toggleGroup, type CanvasGroup } from '@renderer/groups/groups'
import { GROUP_COLOURS } from '@shared/groups'
import type { PaletteActions, PresetRow, PromptRow } from '@renderer/palette/commands'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { InputMode } from '@renderer/palette/Palette'
import { findService } from '@shared/credential-schema'
import type { CapturedPanel, SettingRow, WorktreeListRow } from '@shared/ipc-contract'
import { railLabel } from '../shell/rail-rows'
import type { LinkMode } from './useLinkMode'
import type { Point, WorldRect } from './viewport'
import type { Viewport } from './viewport'
import { zoomTarget } from './viewport'
import type { PersistedBookmark } from '@shared/layout-schema'
import type { PersistedTeammate } from '@shared/teammates'
import type { NavigatorPane } from '@renderer/shell/useShellChrome'
import type { Discovery as PreviewDiscovery } from '@shared/preview'

export interface PaletteActionsDeps {
  createObjectNow: (kind: string, value?: string) => Promise<CreationResult>
  recheckEnvironment: () => Promise<import("@shared/env-report").EnvReport>
  /** M182. Every saved template, through a ref: the editing verbs bind and edit against the live list. */
  templateRowsRef: RefObject<PersistedTemplate[]>
  /** M182. Re-read the saved templates after a save through the binding. */
  reloadTemplates: () => void
  /** M181. Canvas's starter layout: mints through the ordinary paths and records the keys. */
  applyStarter: () => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M184. Canvas's save of a workflow draft (the revision check lives there). */
  saveWorkflowDraft: (templateId: string) => Promise<{ kind: 'saved' } | { kind: 'stale'; reason: string } | { kind: 'refused'; reason: string }>
  /** M184. Canvas's stop: every live pool of this template interrupted, nothing killed. */
  stopWorkflowRun: (templateId: string, runId?: string) => { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  saveWorkflowCopyDraft: (templateId: string) => Promise<{ kind: 'saved'; name?: string } | { kind: 'refused'; reason: string }>
  /** M190. A feedback draft in the person's own browser; this app submits nothing. */
  prepareFeedbackNow: (says?: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M189. The portable file's two verbs — the renderer builds it and decides what to make of one. */
  exportCanvasFile: (path?: string, withPixels?: boolean) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  importCanvasFile: (path?: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M253. A pack's two doors, and the two "I've read this" statements. */
  exportPackFile: (path?: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  importPackFile: (path?: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  markPresetReadNow: (id: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  markWorkflowReadNow: (templateId: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M188. Test one node: the same executor the workflow's own run takes. */
  testNodeNow: (templateId: string, key?: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M187. The note's three verbs — one record, three forms. */
  addNote: (form: string, text?: string, world?: { x: number; y: number }) => { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  setNoteText: (panelId: string, text: string) => { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  setNoteTint: (panelId: string, tint: string) => { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /** M186. A picture into the store and onto the canvas, and the repair beside it. */
  addImageFromPath: (path: string, world?: { x: number; y: number }) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  replaceImagePanel: (panelId: string, path?: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M185. The preview's four verbs and the discovery the pane's own control asks. */
  openPreviewNow: (url?: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  bindPreviewNow: () => { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  setPreviewWidthNow: (device: string, paneId?: string) => { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  capturePreviewNow: () => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  startDevServerNow: (script?: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  discoverProject: () => Promise<PreviewDiscovery | { kind: 'refused'; reason: string }>
  /** M184. Canvas's Run over the draft (the same instantiation the panel's Run calls). */
  runWorkflowNow: (templateId: string, caller?: AgentPlanCaller) => string | undefined
  registry: Registry
  palette: PaletteController
  linkMode: LinkMode
  /** Read through refs: each changes on every frame of a drag. */
  panelsRef: RefObject<Panel[]>
  displayPanelsRef: RefObject<Panel[]>
  mergedRef: RefObject<boolean>
  promptBodiesRef: RefObject<Map<string, string>>
  nextGroupIdRef: RefObject<number>
  presetRows: PresetRow[]
  promptRows: PromptRow[]
  settingRows: SettingRow[]
  broadcastInput: boolean
  broadcastReady: boolean
  resetViewport: () => void
  /** M146. Zoom to fit's two arms: the selection when any, else every panel. */
  fitAll: () => void
  fitSelection: (rects: WorldRect[]) => void
  selectedIdsRef: RefObject<ReadonlySet<string>>
  centreOn: (rect: WorldRect) => void
  worldCentre: () => Point
  /** M56. The camera's named verbs and the bookmark state, read through refs. */
  goToViewport: (vp: Viewport) => void
  cameraBack: () => void
  cameraForward: () => void
  bookmarksRef: RefObject<PersistedBookmark[]>
  setBookmarks: Dispatch<SetStateAction<PersistedBookmark[]>>
  viewportRef: RefObject<Viewport>
  selectAndRaise: (id: string, additive?: boolean) => void
  selectOnly: (id: string | null) => void
  onSelectPanel: (id: string, additive?: boolean) => void
  onClosePanel: (id: string) => void
  openReview: (subjectId: string) => void
  openFilePanel: (path: string, centre: Point, opts?: { prose?: true }) => void
  openToolboxPanel: (cwd: string, label: string, centre: Point) => void
  openJiraPanel: () => void
  /** M83. Open the memory node for the captured panel's repository. */
  openMemoryPanel: () => Promise<void>
  /** M133. Open a template as a workflow panel — a VIEW of the shape. */
  openWorkflowPanel: (templateId: string) => void
  /** M88. Mint the GitHub work panel. */
  openGithubPanel: () => void
  /** M86. A review across every worktree of the subject's repository. */
  openReviewAcross: (subjectId: string) => void
  /** M84. The palette's Watch… row: ask for the command, then the trigger. */
  beginWatcher: () => void
  beginNewNote: () => void
  /** M103. Mint a browser panel at the world centre, opening to an http(s) url the caller already normalised. */
  /** M195. The optional binding is what the pane is a preview OF; absent is a pane bound to nothing. */
  openBrowserPanel: (url: string, preview?: PreviewBinding) => void
  /** M128. Mint a skill panel at a world point. */
  openSkillPanel: (scope: ToolScope, name: string, world: { x: number; y: number }) => void
  /** M73. Mint a chat panel; resolves the sheet's answer (a refusal is main's named reason). */
  beginNewChat: (opts?: { cwd?: string; title?: string; agentOptions?: AgentOptions; appendSystemPrompt?: string; message?: string; backend?: AgentBackend; teammateId?: string; sandbox?: true }) => Promise<SpawnResult>
  /** M92. Lock, pin and maximise, each with its opposite. */
  lockPanel: (id: string) => void
  unlockPanel: (id: string) => void
  pinPanel: (id: string) => void
  unpinPanel: (id: string) => void
  maximisePanel: (id: string) => void
  restorePanel: (id: string) => void
  /** M93. Enter annotate mode; refused by name while merged. */
  beginAnnotate: () => { kind: string; reason?: string }
  /** M80. Instantiate a template: every node and edge in one history entry. */
  instantiateTemplate: (template: PersistedTemplate, values: Record<string, string>) => Promise<SpawnResult>
  /** M74. The two front-end verbs. */
  openAsChat: (id: string) => void
  openInTerminal: (id: string) => void
  restartWithSpec: (id: string, nextSpec: PanelSpecTemplate) => void
  commitHistory: (next: Panel[]) => void
  switchWorkspace: (id: string) => Promise<boolean>
  movePanelsToWorkspace: (
    panelIds: string[],
    target: { workspaceId: string } | { newName: string }
  ) => void
  toggleMerged: () => void
  reloadPresets: () => void
  reloadPrompts: (capturedId: string | null) => void
  reloadSettings: () => void
  reloadCredentials: () => void
  /** M37. The worktree list, reloaded after a remove. */
  reloadWorktrees: () => void
  /** M37. The palette's current worktree rows, so a confirm can name the branch. */
  worktreeRows: readonly WorktreeListRow[]
  reloadWorkspaces: () => void
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setGroups: Dispatch<SetStateAction<CanvasGroup[]>>
  setInputMode: Dispatch<SetStateAction<InputMode | null>>
  setBroadcastInput: Dispatch<SetStateAction<boolean>>
  /** M100. The roster as loaded (a ref: the sheet's submit reads it once), and the navigator's chooser. */
  teammatesRef: RefObject<PersistedTeammate[]>
  chooseNavigator: (pane: NavigatorPane) => void
  /** M106. */
  toggleFlip: () => void
  /** M113. The board's records (a ref: a verb reads the list once) and their setter. Records, not layout: not in history, like runs and bookmarks. */
  workItemsRef: RefObject<PersistedWorkItem[]>
  setWorkItems: Dispatch<SetStateAction<PersistedWorkItem[]>>
  /**
   * M114/M115. The verbs Canvas installs AFTER the memo is built (they close
   * over the chat and broker doors that live there); a ref rather than four
   * deps so the memo does not rebuild when Canvas re-creates them.
   */
  boardVerbsRef: RefObject<{ dispatch?: (itemId: string, teammateId: string, root?: string) => Promise<StartWorkOutcome>; openPr?: (itemId: string) => void; commentPr?: (itemId: string) => void; markDone?: (itemId: string) => void; review?: (itemId: string) => { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }; show?: (panelId: string) => { kind: 'ran'; note?: string; partial?: true } | { kind: 'refused'; reason: string }; related?: (panelId: string) => { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }; arrange?: (panelId: string) => { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string } }>
}

/**
 * Every verb the palette, the top bar, the rail and the inspector can run —
 * the single `actions` object those four surfaces share.
 *
 * Lifted out of `Canvas.tsx` verbatim (M28, a purely structural split). Three
 * properties of the original are load-bearing and survive the move unchanged.
 *
 * It stays ONE `useMemo` returning ONE object, with the identical dependency
 * array it had inside Canvas. `Palette.tsx` takes this as its `actions` prop
 * and memoizes its command list on it, so splitting it into per-verb
 * callbacks would hand that memo a fresh identity on every render — the
 * defect "the palette's selection moves only when the user moves it"
 * describes, visible as the selection re-seating itself during an unrelated
 * mousemove over the canvas.
 *
 * The deps object is destructured on entry and the dependency array names the
 * DESTRUCTURED members, never `deps` itself: the caller builds a fresh object
 * literal every render, so a dependency on it would rebuild every verb on
 * every frame of a pan.
 *
 * `deleteWorkspace` still holds one of the canvas layer's five
 * `registry.dispose` call sites. `verify:panels` 94 counts them across this
 * directory rather than in `Canvas.tsx` alone, precisely so this split could
 * happen without weakening the count.
 */
export function usePaletteActions(deps: PaletteActionsDeps): PaletteActions {
  const {
    createObjectNow,
    recheckEnvironment, applyStarter, saveWorkflowDraft, saveWorkflowCopyDraft, prepareFeedbackNow, exportCanvasFile, importCanvasFile, exportPackFile, importPackFile, markPresetReadNow, markWorkflowReadNow, testNodeNow, addNote, setNoteText, setNoteTint, addImageFromPath, replaceImagePanel, openPreviewNow, bindPreviewNow, setPreviewWidthNow, capturePreviewNow, startDevServerNow, discoverProject, stopWorkflowRun, runWorkflowNow, templateRowsRef, reloadTemplates, registry, palette, linkMode, panelsRef, displayPanelsRef, mergedRef,
    promptBodiesRef, nextGroupIdRef, presetRows, promptRows, settingRows,
    broadcastInput, broadcastReady, resetViewport, fitAll, fitSelection, selectedIdsRef, centreOn, worldCentre,
    goToViewport, cameraBack, cameraForward, bookmarksRef, setBookmarks, viewportRef,
    selectAndRaise, selectOnly, onSelectPanel, onClosePanel, openReview,
    openFilePanel, openToolboxPanel, openJiraPanel, openMemoryPanel, openWorkflowPanel, openGithubPanel, openReviewAcross, beginWatcher, beginNewNote, beginNewChat, openAsChat, openInTerminal, instantiateTemplate,
    lockPanel, unlockPanel, pinPanel, unpinPanel, maximisePanel, restorePanel, beginAnnotate,
    restartWithSpec, commitHistory, switchWorkspace,
    movePanelsToWorkspace, toggleMerged, reloadPresets, reloadPrompts,
    reloadSettings, reloadCredentials, reloadWorkspaces, reloadWorktrees, worktreeRows, setPanels, setGroups,
    setInputMode, setBroadcastInput, teammatesRef, chooseNavigator, openBrowserPanel, openSkillPanel, toggleFlip,
    workItemsRef, setWorkItems, boardVerbsRef
  } = deps

  // M147. `self` names the object being built, for the one verb that opens
  // another verb's door (workspaceFromTemplate → beginSpawnSheet); the shape
  // of the memo is otherwise unchanged (ONE useMemo, CLAUDE.md's rule).
  // M147/M149. The three doors behind `New workspace from <template>`: a
  // workspace named after the template, the switch, then M80's instantiation
  // there — run only once the shape is fully answered, never before.
  const intoNewWorkspace = async (template: PersistedTemplate, values: Record<string, string>): Promise<SpawnResult> => {
    // A name that is already taken gets a counter: `two shells (2)`. The
    // store appends without deduping, and two identical names in the
    // switcher are two rows nothing tells apart (the Act II critic).
    const taken = new Set((await window.canvas.workspace.list()).map((w) => w.name))
    let name = template.name
    for (let n = 2; taken.has(name); n += 1) name = `${template.name} (${n})`
    const from = await window.canvas.workspace.list().then((ws) => ws.find((w) => w.active)?.id)
    const id = await window.canvas.workspace.create(name)
    const switched = await switchWorkspace(id)
    reloadWorkspaces()
    if (!switched) return { kind: 'refused', reason: 'the new workspace could not be opened' }
    const result = await instantiateTemplate(template, values)
    // A refusal AFTER the mint (a preset gone unavailable between the row
    // and the click) would strand the user in an empty workspace named after
    // the template — the very failure workspace.template.2 closed for
    // Escape. Undo the mint and say why, in the refusal's own words.
    if (result.kind === 'refused') {
      if (from !== undefined) await switchWorkspace(from)
      await window.canvas.workspace.remove(id)
      reloadWorkspaces()
      return { kind: 'refused', reason: `${result.reason} — the new workspace was not kept` }
    }
    return result
  }
  return useMemo<PaletteActions>(() => {
      const facts = (): PlanFacts => ({
        // M180. The agent's state word rides on a terminal's facts so the
        // agent door can refuse `submit` against a panel in wants-you
        // (`agentDoorRefusal`); absent stays absent.
        panels: panelsRef.current.map((p) => { const state = getAgentState(p.rect.id); return { id: p.rect.id, kind: p.kind, ...(registry.get(p.rect.id)?.spec.agent === undefined ? {} : { agent: registry.get(p.rect.id)!.spec.agent }), ...(state === undefined ? {} : { state }) } }),
        presets: presetRows.map((r) => ({ id: r.id })),
        // M182. Every template (built-in and saved): the editing verbs bind against it.
        templates: allTemplates(templateRowsRef.current).map((t) => ({ id: t.id })),
        worktrees: worktreeRows.map((w) => ({ id: w.id }))
      })
      // M246. `caller` is WHO asked: present through the agent door (and a
      // workflow an agent triggered), absent for the palette runner and a
      // person's own run. Only verbs whose meaning depends on it read it.
      const execute = async (step: PlanStep, caller?: AgentPlanCaller): Promise<StepOutcome> => {
        const a = step.args
        const creation = CREATABLE_OBJECTS.find((entry) => entry.verb === step.verb)
        if (creation) return self.createObject(creation.id, a.value)
        const panelOf = (id: string): Panel | undefined => panelsRef.current.find((p) => p.rect.id === id)
        switch (step.verb) {
          case 'checklist-edit': return self.editChecklist(a.panel!, a.operation!, a.value)
          case 'checklist-hand': return self.handChecklist(a.panel!, Number(a.line), a.agent!)
          case 'sheet-edit': return self.editSheet(a.panel!, a.cell!, a.value ?? '', caller)
          case 'sheet-review': return self.reviewSheet(a.panel!, a.operation!, a.target, caller)
          case 'agent-links': return self.setAgentLinks(a.state!)
          case 'starter': return applyStarter()
          case 'workflow-save': return self.saveWorkflow(a.template!)
          // M246 (critic, finding 1). The caller rides the run into every action
          // node: dropped here, an agent could put `sheet-review f1 keep all` in a
          // template and run it as if a person had.
          case 'workflow-run': return self.runWorkflowNow(a.template!, caller)
          case 'workflow-stop': return self.stopWorkflow(a.template!)
          case 'workflow-copy': return self.saveWorkflowCopy(a.template!)
          case 'node-test': return self.testNode(a.template!, a.node)
          case 'feedback': return self.prepareFeedback(a.says)
          case 'export-canvas': return self.exportCanvas(a.path, a.pictures)
          case 'import-canvas': return self.importCanvas(a.path)
          case 'export-pack': return self.exportPack(a.path)
          case 'import-pack': return self.importPack(a.path)
          case 'note-add': return self.addNote(a.form!, a.text)
          case 'note-set': return self.setNoteText(a.panel!, a.text ?? '')
          case 'note-tint': return self.setNoteTint(a.panel!, a.tint!)
          case 'image-add': return self.addImage(a.path!)
          case 'image-replace': return self.replaceImage(a.panel!, a.path)
          case 'preview-open': return self.openPreview(a.url)
          case 'preview-bind': return self.bindPreview()
          case 'review-task': return self.reviewTask(step.args.panel as string)
          case 'show-task': return self.showTask(step.args.panel as string)
          case 'show-related': return self.showRelated(step.args.panel as string)
          case 'arrange-task': return self.arrangeTask(step.args.panel as string)
          case 'preview-width': return self.setPreviewWidth(a.device!)
          case 'preview-capture': return self.capturePreview()
          case 'preview-dev': return self.startDevServer(a.script)
          // M182. The six editing verbs, each one draft operation through the store's door.
          case 'workflow-add': {
            const kind = String(a.kind ?? '')
            // M183. The library's default for the kind, placed where a drop would land (to the right of the rightmost block).
            if (!LIBRARY.some((e) => e.kind === kind)) return { kind: 'refused', reason: `${kind} is not a node kind — ${LIBRARY.map((e) => e.kind).join(', ')}` }
            const saved = allTemplates(templateRowsRef.current).find((t) => t.id === a.template)
            const base = getDraft(a.template!)?.template ?? saved
            const at = base === undefined ? { dx: 0, dy: 0 } : placementFor(base)
            const r = self.editWorkflow(a.template!, { type: 'add', node: { ...defaultNodeOf(kind as TemplateNode['kind']), ...at } as Omit<TemplateNode, 'key'> })
            return r.kind === 'ok' ? { kind: 'ran', note: 'node added to the draft' } : r
          }
          case 'workflow-move': {
            const dx = Number(a.dx), dy = Number(a.dy)
            if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { kind: 'refused', reason: 'dx and dy must be numbers' }
            const r = self.editWorkflow(a.template!, { type: 'move', key: String(a.key), dx, dy })
            return r.kind === 'ok' ? { kind: 'ran' } : r
          }
          case 'workflow-set': {
            const raw = String(a.value ?? '')
            const field = String(a.field ?? '')
            // A number where the field takes one; a list where it takes one; text otherwise.
            const value: unknown = field === 'width' ? Number(raw) : field === 'args' ? raw.split(/\s+/).filter((w) => w !== '') : raw
            const r = self.editWorkflow(a.template!, { type: 'set', key: String(a.key), patch: { [field]: value } })
            return r.kind === 'ok' ? { kind: 'ran' } : r
          }
          case 'workflow-remove': { const r = self.editWorkflow(a.template!, { type: 'remove', key: String(a.key) }); return r.kind === 'ok' ? { kind: 'ran' } : r }
          case 'workflow-edge': {
            const trigger = String(a.trigger ?? '')
            if (!(HANDOFF_TRIGGERS as readonly string[]).includes(trigger)) return { kind: 'refused', reason: `${trigger} is not a trigger — ${HANDOFF_TRIGGERS.join(', ')}` }
            const r = self.editWorkflow(a.template!, { type: 'edge', from: String(a.from), to: String(a.to), trigger: trigger as HandoffTrigger })
            return r.kind === 'ok' ? { kind: 'ran' } : r
          }
          case 'workflow-unedge': { const r = self.editWorkflow(a.template!, { type: 'unedge', from: String(a.from), to: String(a.to) }); return r.kind === 'ok' ? { kind: 'ran' } : r }
          case 'check-readiness': {
            const readiness = onboardingReadiness(await recheckEnvironment())
            return { kind: 'ran', note: readiness.rows.map((row) => row.sentence).join(' ') }
          }
          case 'new-chat': {
            if (a.backend !== undefined && !isFirstLaunchBackend(a.backend)) return { kind: 'refused', reason: `choose one of ${Object.keys(FIRST_LAUNCH_ENGINES).join(' or ')}` }
            const readiness = onboardingReadiness(await window.canvas.env.report(), a.backend)
            if (readiness.preferred === undefined) return { kind: 'refused', reason: 'no conversation engine is available — check readiness in the launcher' }
            if (a.backend !== undefined && readiness.preferred !== a.backend) return { kind: 'refused', reason: `${a.backend} is not available — check readiness` }
            const result = await beginNewChat({ backend: readiness.preferred })
            return result.kind === 'refused' ? result : { kind: 'ran', note: result.id ?? 'conversation opened' }
          }
          case 'focus': selectAndRaise(a.panel!); { const p = panelOf(a.panel!); if (p) centreOn(p.rect) } return { kind: 'ran' }
          case 'start': onSelectPanel(a.panel!); return { kind: 'ran' }
          case 'spawn': { const row = presetRows.find((p) => p.id === a.preset); if (!row?.available) return { kind: 'refused', reason: `${a.preset} is not available — ${row === undefined ? 'no such preset' : 'its command is not on the PATH'}` }; return window.canvas.preset.spawnById(a.preset!).then((refusal) => (refusal === null ? { kind: 'ran' as const } : { kind: 'refused' as const, reason: refusal })) }
          case 'type': {
            const p = panelOf(a.panel!)
            if (p && isChatPanel(p)) { insertIntoComposer(p.rect.id, a.text ?? ''); return { kind: 'ran', note: 'inserted into the composer' } }
            const h = registry.get(a.panel!)?.handle
            if (!h) return { kind: 'refused', reason: `${a.panel} has no live session — start it first` }
            // paste, not write: bracketed paste is the one handoff an agent
            // TUI treats as text rather than keystrokes (the Jira rule).
            h.paste(a.text ?? '')
            return { kind: 'ran' }
          }
          case 'submit': {
            const p = panelOf(a.panel!)
            if (p && isChatPanel(p)) return { kind: 'refused', reason: 'a chat sends with `send <panel> <text>` — submit is for an agent terminal' }
            const h = registry.get(a.panel!)?.handle
            if (!h) return { kind: 'refused', reason: `${a.panel} has no live session — start it first` }
            h.write('\r')
            return { kind: 'ran' }
          }
          case 'send': {
            const answer = await window.canvas.agentSession.send(a.panel!, a.text ?? '')
            if (typeof answer === 'object') return { kind: 'refused', reason: answer.refused }
            if (answer === 'no-session') return { kind: 'refused', reason: `${a.panel} has no chat session yet — open it first` }
            if (answer.startsWith('refused')) return { kind: 'refused', reason: `the send was refused: ${answer}` }
            return { kind: 'ran', note: answer }
          }
          case 'interrupt': {
            const p = panelOf(a.panel!)
            if (p && isChatPanel(p)) { const did = await window.canvas.agentSession.interrupt(p.rect.id); return did ? { kind: 'ran' } : { kind: 'refused', reason: 'nothing is in flight' } }
            const h = registry.get(a.panel!)?.handle
            if (!h) return { kind: 'refused', reason: `${a.panel} has no live session` }
            h.write('\x03')
            return { kind: 'ran' }
          }
          case 'restart': { const p = panelOf(a.panel!); if (!p || !isTerminalPanel(p)) return { kind: 'refused', reason: 'only a terminal panel restarts' }; restartWithSpec(p.rect.id, p.spec); return { kind: 'ran' } }
          case 'read': {
            // Guardrail 2: through the ONE outward gate, whichever front-end.
            const p = panelOf(a.panel!)
            // M103. A browser panel's text is read in MAIN, which owns the
            // scheme check, the cap and the gate; the note it hands back says
            // the content is a remote page's, and that is what the plan reads
            // out. No live guest is a named refusal, never an empty read.
            if (p && isBrowserPanel(p)) {
              const guest = browserGuestId(p.rect.id)
              if (guest === undefined) return { kind: 'refused', reason: `${a.panel}: ${REASON_NO_LIVE_PAGE}` }
              const page = await window.canvas.browser.read({ panelId: p.rect.id, webContentsId: guest })
              if (page.kind === 'refused') return { kind: 'refused', reason: `${a.panel}: ${page.reason}` }
              return { kind: 'ran', note: `${page.note}: ${page.text.slice(0, 160).replace(/\s+/g, ' ')}` }
            }
            const raw = p && isChatPanel(p) ? lastAssistantText(p.rect.id) : (await window.canvas.scrollback.tail({ panelId: a.panel!, lines: 40 })).join('\n')
            const gate = outward(raw, `panel ${a.panel}`)
            return { kind: 'ran', note: `${gate.note}: ${gate.text.slice(-160).replace(/\s+/g, ' ')}` }
          }
          case 'set-setting': {
            const row = settingRows.find((r) => r.id === a.setting)
            if (!row) return { kind: 'refused', reason: `no setting is called ${a.setting}` }
            const v = a.value ?? ''
            const value: SettingValue = row.type === 'boolean' ? v === 'true' || v === 'on' : row.type === 'number' ? Number(v) : row.type === 'list' ? v.split(',').map((x) => x.trim()) : v
            if (row.type === 'number' && !Number.isFinite(value as number)) return { kind: 'refused', reason: `${a.setting} takes a number` }
            // Main owns the store and refuses an unknown id or a wrong type; the
            // reload is what makes a refusal visible (the row keeps its value).
            await window.canvas.settings.set(a.setting!, value)
            reloadSettings()
            return { kind: 'ran' }
          }
          case 'lock': lockPanel(a.panel!); return { kind: 'ran' }
          case 'unlock': unlockPanel(a.panel!); return { kind: 'ran' }
          case 'pin': pinPanel(a.panel!); return { kind: 'ran' }
          case 'unpin': unpinPanel(a.panel!); return { kind: 'ran' }
          case 'maximise': maximisePanel(a.panel!); return { kind: 'ran' }
          case 'restore': restorePanel(a.panel!); return { kind: 'ran' }
          case 'tidy': {
            // The same arithmetic as the `tidyPanels` member above (one history
            // entry, locked panels stay), repeated rather than called because a
            // member of this literal cannot name a sibling before the object
            // exists — and `verify:verbs closure.1` maps this verb to it.
            const chosen = panelsRef.current.filter((p) => p.locked !== true)
            if (chosen.length < 2) return { kind: 'refused', reason: 'nothing to tidy — fewer than two unlocked panels' }
            const tidied = new Map(tidyPanels(chosen.map((p) => p.rect)).map((r) => [r.id, r]))
            commitHistory(panelsRef.current.map((p) => { const r = tidied.get(p.rect.id); return r === undefined ? p : { ...p, rect: r } }))
            return { kind: 'ran' }
          }
          case 'zoom-fit': {
            const selected = selectedIdsRef.current
            const rects = panelsRef.current.filter((p) => selected.has(p.rect.id)).map((p) => p.rect)
            if (rects.length > 0) fitSelection(rects)
            else if (panelsRef.current.length > 0) fitAll()
            else resetViewport()
            return { kind: 'ran' }
          }
          case 'zoom-reset': resetViewport(); return { kind: 'ran' }
          // M149. The table had advertised the verb with no arm here (the Act
          // II critic): a plan naming it was refused as `no executor`.
          case 'workspace-from-template': self.workspaceFromTemplate(String(step.args.template ?? '')); return { kind: 'ran' }
          // M149. `dispatch` and `board` had sat in the table since M113–M116
          // with no arm here — `verify:verbs executor.1` found both beside
          // the workspace verb. Each binds by KEY and refuses by name.
          case 'dispatch': {
            const item = (workItemsRef.current ?? []).find((w) => w.id === a.item || w.key === a.item)
            if (item === undefined) return { kind: 'refused', reason: `no work item is called ${a.item} — name one by its id or key` }
            const mate = teammatesRef.current.find((t) => t.id === a.teammate || t.name === a.teammate)
            if (mate === undefined) return { kind: 'refused', reason: `no teammate is called ${a.teammate}` }
            // M197. AWAITED. Before this the verb was called and `ran` was
            // returned in the same breath — every refusal happened after that
            // return, into the card's note, which the plan's caller never
            // reads. A verb that cannot fail in the caller's view is a verb
            // that fails silently.
            const outcome = await self.startWork(item.id, mate.id)
            return outcome.kind === 'started' ? { kind: 'ran', note: `started on ${outcome.panelId}` } : { kind: 'refused', reason: outcome.reason }
          }
          case 'board': {
            const what = String(a.what ?? '').trim()
            if (a.op === 'add') {
              if (what === '') return { kind: 'refused', reason: 'board add needs a title' }
              const id = self.addWorkItem({ source: 'typed', title: what, state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'] })
              return { kind: 'ran', note: `added ${id}` }
            }
            if (a.op === 'done') {
              const item = (workItemsRef.current ?? []).find((w) => w.id === what || w.key === what)
              if (item === undefined) return { kind: 'refused', reason: `no work item is called ${what}` }
              self.markDone(item.id); return { kind: 'ran' }
            }
            return { kind: 'refused', reason: `board ${String(a.op)} is not a verb — add <title> or done <id>` }
          }
          case 'workspace': { const ok = await switchWorkspace(a.workspace!); return ok ? { kind: 'ran' } : { kind: 'refused', reason: `could not switch to ${a.workspace}` } }
          case 'review': openReview(a.panel!); return { kind: 'ran' }
          case 'run-template': palette.openPalette(); return { kind: 'refused', reason: 'open the spawn sheet on the template from New panel… — its parameters are asked there' }
          case 'close': onClosePanel(a.panel!); return { kind: 'ran' }
          case 'reset-canvas': void window.canvas.canvas.requestReset(); return { kind: 'ran', note: 'the reset asks once more in its own dialog' }
          case 'discard': {
            const p = panelOf(a.panel!)
            if (!p || !isReviewPanel(p)) return { kind: 'refused', reason: `${a.panel} is not a review node — open one with \`review <panel>\` first` }
            const result = await window.canvas.review.at(p.subject)
            if (result.kind !== 'changes') return { kind: 'refused', reason: `nothing to discard — the review reads ${result.kind}` }
            const done = await window.canvas.review.discard({ root: result.root, baseline: p.subject.baselineSha, subjectId: p.subject.subjectId, paths: result.files.map((f) => f.path) })
            if (done.kind === 'discarded') return { kind: 'ran', note: `${result.files.length} files` }
            return { kind: 'refused', reason: done.kind === 'nothing-to-discard' ? 'nothing to discard' : done.detail }
          }
          case 'remove-worktree': {
            const done = await window.canvas.worktree.remove(a.worktree!)
            reloadWorktrees()
            return done.kind === 'removed' ? { kind: 'ran' } : { kind: 'refused', reason: done.kind === 'unknown' ? `no worktree is called ${a.worktree}` : done.reason }
          }
          default: return { kind: 'refused', reason: `${step.verb} has no executor` }
        }
      }

    const self: PaletteActions = ({
    createObject: createObjectNow,
    editChecklist: async (panel, operation, value) => checklistController(panel)?.edit(operation, value) ?? { kind: 'refused', reason: 'open a checklist in this workspace first' },
    handChecklist: async (panel, line, agent) => checklistController(panel)?.hand(line, agent) ?? { kind: 'refused', reason: 'open a checklist in this workspace first' },
    editSheet: async (panel, cell, value, caller) => sheetController(panel)?.edit(cell, value, caller) ?? { kind: 'refused', reason: `${panel} is not an open sheet in this workspace` },
    // M247. The toggle is the `canvas.agentLinks` SETTING, so every door writes the
    // same record the HUD button and the settings palette row write.
    setAgentLinks: async (mode) => {
      if (mode !== 'on' && mode !== 'off' && mode !== 'toggle') return { kind: 'refused', reason: 'use agent-links on, off or toggle' }
      const rows = await window.canvas.settings.list()
      const current = rows.find((r) => r.id === 'canvas.agentLinks')?.value !== false
      const next = mode === 'toggle' ? !current : mode === 'on'
      self.toggleSetting('canvas.agentLinks', next)
      return { kind: 'ran', note: next ? 'agent links shown' : 'agent links hidden' }
    },
    reviewSheet: async (panel, operation, target, caller) => sheetController(panel)?.review(operation, target ?? 'all', caller) ?? { kind: 'refused', reason: `${panel} is not an open sheet in this workspace` },
    spawnPreset: (id) => {
      const row = presetRows.find((p) => p.id === id)
      // buildCommands already disables an unavailable row, so this is the
      // second half of the same rule rather than the only one: a stale list —
      // the palette was open while the store changed — must not spawn a panel
      // that dies instantly with "command not found".
      if (!row || !row.available) return
      // Routed through the SAME main-side path the menu uses, so a palette
      // spawn and a menu spawn cannot drift: main resolves the template
      // (absent command included) and sends PRESET_SPAWN back, which Canvas
      // already handles through onSpawn — which is what gives it the ordinary
      // undo behaviour, where removing a panel disposes its session.
      void window.canvas.preset.spawnById(id)
    },
    /**
     * The merged view's second door, beside the top bar's own button. It
     * earns a Command row where closePanel and startPanel deliberately do not
     * (see their own comments): the toolbar can be the only gesture for a
     * verb only if the toolbar is always reachable, and this one is a whole
     * mode — a user who has never noticed the button has no other way in, and
     * a mode with one undiscovered entrance reads as a feature that was never
     * built.
     */
    toggleMerged: () => toggleMerged(),
    toggleBroadcastInput: () => {
      // The command's disabled state is UX, not authority: the selection or a
      // session can change while the palette is open, so re-check the live
      // target set at the action boundary before arming the keyboard route.
      if (!broadcastInput && !broadcastReady) return
      setBroadcastInput((active) => !active)
    },
    beginRenamePreset: (id, currentName) => {
      setInputMode({
        kind: 'text',
        label: `Rename \u201c${currentName}\u201d to\u2026`,
        initial: currentName,
        submit: (value) => {
          void window.canvas.preset.rename(id, value).then(() => {
            setInputMode(null)
            reloadPresets()
          })
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without this the mode would be set on a palette that is already gone
      // — and the effect above would immediately clear it again. Reopening in
      // the same batch is what turns "run the rename command" into "the
      // palette is now a text field", which is the whole point of input mode.
      palette.openPalette()
    },
    deletePreset: (id) => {
      // Gated, not instant. A delete row sat one Enter away from destroying a
      // preset, styled identically to "Go to n1", and the fuzzy matcher will
      // happily put it under a query the user aimed somewhere else.
      //
      // The gate is input mode rather than a dialog, and that is not a
      // shortcut: M5a deferred preset editing entirely because "building a
      // preset-manager dialog now would be the first modal in this app, and it
      // would collide with xterm's keyboard focus". Input mode is that problem
      // already solved, so a confirm inherits all four of usePalette's focus
      // rules instead of reopening the question.
      const name = presetRows.find((p) => p.id === id)?.name ?? id
      setInputMode({
        kind: 'confirm',
        label: `Delete preset \u201c${name}\u201d?`,
        initial: '',
        submit: () => {
          void window.canvas.preset.remove(id).then(reloadPresets)
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without this the mode would be set on a palette that is already gone
      // and the clear-on-close effect would wipe it again — the same pairing
      // beginRenamePreset makes, for the same reason.
      palette.openPalette()
    },
    setDefaultPreset: (id) => {
      // No local bookkeeping: main answers by pushing PRESET_DEFAULT, which
      // the existing subscription writes into defaultTemplateRef. One source
      // of truth for what Cmd+N spawns, and it is main's.
      void window.canvas.preset.setDefault(id).then(reloadPresets)
    },
    goToPanel: (id) => {
      // displayPanelsRef, not panelsRef: while merged the rail lists every
      // workspace's panels, and the rect worth framing is the LANE-OFFSET
      // one — the only place that panel exists on screen. Reading `panels`
      // here would leave every foreign row navigating nowhere at all, which
      // reads as the rail being broken rather than as a lookup in the wrong
      // array.
      const panel = displayPanelsRef.current.find((p) => p.rect.id === id)
      if (!panel) return
      centreOn(panel.rect)
      // Selection WITHOUT the wake. onSelectPanel is the click path and it
      // deliberately wakes (a card's whole affordance is "click to start");
      // navigating is not interacting, so the switcher leaves dormancy alone.
      // verify:panels 39.
      //
      // It DOES raise, though, and deliberately: the selection ring is the
      // only feedback this command gives, and a framed panel that happens to
      // sit under an overlapping one shows none of it — the camera moves and
      // nothing visibly happens. Raising is a z change and nothing else, so it
      // costs none of what the no-wake rule is protecting.
      selectAndRaise(id)
    },
    insertPrompt: (id) => {
      // The panel the palette CAPTURED, not the focused one: opening the
      // palette moves DOM focus to its input, and a background click clears
      // focusedId outright.
      const target = palette.capturedId
      const body = promptBodiesRef.current.get(id)
      // A row whose body the last reload did not carry is a list that moved
      // under the user (the file was deleted while the palette was open).
      // Inserting nothing is the only honest answer; inserting the wrong
      // prompt into a running agent is not.
      if (!target || body === undefined) return
      // M75. The delivery depends on the target's kind: a chat's composer
      // takes text through the store's insert bus; a terminal takes a
      // bracketed paste. paste(), NEVER write(), for the terminal:
      // session-factory.ts spells out the failure it exists to prevent —
      // term.paste wraps the payload in bracketed-paste markers (and
      // normalises LF to CR), so a multi-line prompt arrives as ONE input; a
      // raw write submits every newline separately. verify:panels 40 is the
      // check that can tell the two apart.
      const deliver = (text: string): void => {
        const panel = panelsRef.current.find((p) => p.rect.id === target)
        if (panel !== undefined && isChatPanel(panel)) insertIntoComposer(target, text)
        else registry.get(target)?.handle.paste(text)
      }
      // M75. Backlog #27: a SAVED prompt's {{holes}} are filled first, one
      // question per hole through the palette's own text line; a project
      // prompt is never expanded (M5b's decision — the same file must behave
      // the same inside and outside this app), so its holes stay as typed.
      // M141. A SAVED prompt's four built-in holes are filled from the target
      // first — live cwd, branch (main's), selection, title — and never
      // asked; only the ordinary holes become questions. A project prompt is
      // untouched by both (`proj:` ids skip every expansion).
      const isProject = id.startsWith('proj:')
      const holes = isProject ? [] : askableHoles(body)
      const withBuiltIns = async (text: string): Promise<string> => {
        if (isProject) return text
        const panel = panelsRef.current.find((p) => p.rect.id === target)
        const session = registry.get(target)
        const cwd = panel !== undefined && isChatPanel(panel) ? panel.chat.cwd : (getLiveSession(target)?.cwd ?? (panel !== undefined && isTerminalPanel(panel) ? panel.spec.cwd : ''))
        let branch = ''
        if (cwd !== '' && /\{\{branch\}\}/.test(text)) {
          try { const status = await window.canvas.git.status(cwd); if (status.kind === 'status') branch = status.branch } catch { branch = '' }
        }
        // `{{panel}}` is the panel's TITLE — railLabel's one-label rule, the
        // words the frame and the rail show — never the switcher's label,
        // which carries `— cwd (id)` for telling two rows apart (core
        // `prompt.builtin.1` reads the frame's title back out of the terminal).
        return fillBuiltIns(text, { cwd, branch, selection: session?.handle.getSelection() ?? '', panel: panel === undefined ? '' : railLabel(panel, session?.status) })
      }
      if (holes.length === 0) { void withBuiltIns(body).then(deliver); return }
      const values: Record<string, string> = {}
      const ask = (i: number): void => {
        const name = holes[i]
        if (name === undefined) { setInputMode(null); void withBuiltIns(fillPlaceholders(body, values)).then(deliver); return }
        setInputMode({
          kind: 'text',
          label: `${name} (${i + 1} of ${holes.length}) — the value for {{${name}}}`,
          initial: '',
          submit: (value) => { values[name] = value; ask(i + 1) }
        })
        // Reopened for EVERY hole, not only the first: Palette.tsx closes
        // before calling submit, so the second hole's mode would otherwise
        // be set on a palette that is already gone and wiped by the
        // clear-on-close effect — the prompt then inserted with its second
        // hole as typed, and nothing said so (M75's verifier).
        palette.openPalette()
      }
      ask(0)
    },
    beginSavePrompt: () => {
      const target = palette.capturedId
      // The current SELECTION, the same call that backs Cmd+C. A deliberate
      // gesture and nothing else: capturing automatically would mean
      // retaining everything the user ever types, credentials included.
      const selection = target ? (registry.get(target)?.handle.getSelection() ?? '') : ''
      // buildCommands already disables the row without a selection; this is
      // the second half of the same rule, against a list that went stale
      // while the palette was open.
      if (!selection) return
      setInputMode({
        kind: 'text',
        label: 'Name this prompt\u2026',
        initial: '',
        submit: (name) => {
          void window.canvas.prompt.save(name, selection).then(() => setInputMode(null))
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without this the mode would be set on a palette that is already gone
      // and the clear-on-close effect would wipe it again — the same pairing
      // beginRenamePreset makes, for the same reason.
      palette.openPalette()
    },
    deletePrompt: (id) => {
      // Confirmed for the same reason deletePreset is; see there.
      const name = promptRows.find((p) => p.id === id)?.name ?? id
      const captured = palette.capturedId
      setInputMode({
        kind: 'confirm',
        label: `Delete prompt \u201c${name}\u201d?`,
        initial: '',
        submit: () => {
          // Reloaded rather than filtered locally: main is the only side that
          // knows what the store now says, and a project prompt refuses
          // deletion there (the row is disabled, but a stale list could still
          // reach here). Reloaded against the id captured when the row RAN,
          // not against palette.capturedId at confirm time: the confirm step
          // reopens the palette, which re-captures — and re-capturing while
          // the input holds DOM focus can hand back a different panel, whose
          // project prompts are a different directory's.
          void window.canvas.prompt.remove(id).then(() => reloadPrompts(captured))
        }
      })
      palette.openPalette()
    },
    beginRenamePanel: (id, currentTitle) => {
      setInputMode({
        kind: 'text',
        label: 'Name this panel…',
        initial: currentTitle,
        submit: (value) => {
          const name = value.trim()
          setPanels((prev) => {
            // A captured id can outlive its panel — the row is aimed at
            // whatever was focused when the palette opened, and that panel
            // may have since been closed. Mapping over a missing id would
            // still rewrite the array (a fresh reference for every element)
            // and push a no-op history entry, so bail out instead: nothing
            // changed, so nothing should look like it did.
            if (!prev.some((p) => p.rect.id === id)) return prev
            // Palette.tsx only calls submit() with a non-empty trimmed value
            // (an empty Enter is a cancel, not a rename to "") — so `name`
            // is never '' here, and clearing a title is not offered by this
            // surface at all. Rebuilt field by field rather than spread, the
            // same absent-stays-absent rule fromPanels obeys, so a future
            // caller that DOES want to clear a title can't get there by
            // accidentally spreading `title: undefined` through.
            // ALL THREE kinds are rebuilt, and `kind` is carried explicitly
            // by each arm rather than spread: a rename that dropped it would
            // turn a review node or a file panel back into a terminal panel on
            // the next parse, which reads its absent spec and empties the
            // canvas. A fourth kind adds a fourth arm here, and the union's
            // exhaustiveness is what makes forgetting one a compile error
            // rather than a silent loss of a panel's own field.
            const next: Panel[] = prev.map((p) => {
              if (p.rect.id !== id) return p
              if (isReviewPanel(p)) {
                return { kind: p.kind, rect: p.rect, subject: p.subject, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M187. The sixteenth kind: a rename carries the note's own
              // record field by field, absent staying absent — the same rule
              // the file panel's fontSize learned in M49.
              if (isNotePanel(p)) {
                return { kind: p.kind, rect: p.rect, note: p.note, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              if (isFilePanel(p)) {
                return { kind: p.kind, rect: p.rect, source: p.source, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M133. The workflow panel's own arm — its `workflow` record is
              // its only identity, and a rename that dropped it would leave a
              // panel naming no template at all on the next parse.
              if (isWorkflowPanel(p)) {
                return { kind: p.kind, rect: p.rect, workflow: p.workflow, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              if (isJiraPanel(p)) return { kind: p.kind, rect: p.rect, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              if (isToolboxPanel(p)) {
                return { kind: p.kind, rect: p.rect, source: p.source, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M83. The seventh arm — a memory node carries its root.
              if (isMemoryPanel(p)) {
                return { kind: p.kind, rect: p.rect, source: p.source, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M88. The ninth arm — a github panel carries nothing but its title.
              if (isGithubPanel(p)) {
                return { kind: p.kind, rect: p.rect, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M84. The eighth arm — a watcher carries its whole record.
              if (isWatcherPanel(p)) {
                return { kind: p.kind, rect: p.rect, watch: p.watch, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M73. The sixth arm; `verify:layout chat.1` is the parse side of
              // the same field-by-field rule this rename obeys.
              if (isChatPanel(p)) {
                return { kind: p.kind, rect: p.rect, chat: p.chat, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M103. The browser pane's one field, by name.
              if (isBrowserPanel(p)) {
                return { kind: p.kind, rect: p.rect, url: p.url, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M116. The work card's one field, by name — the twelfth arm.
              if (isWorkPanel(p)) {
                return { kind: p.kind, rect: p.rect, work: { itemId: p.work.itemId }, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M128. The skill panel's two fields, by name — the thirteenth arm.
              if (isSkillPanel(p)) {
                return { kind: p.kind, rect: p.rect, skill: { scope: p.skill.scope, name: p.skill.name }, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M181. The image panel's one field, by name — the fifteenth arm.
              if (isImagePanel(p)) {
                return { kind: p.kind, rect: p.rect, image: { path: p.image.path }, z: p.z, title: name, ...carryMarks(p), ...(p.links === undefined ? {} : { links: p.links }) }
              }
              // M49. `fontSize` and `links` ride along field by field, absent
              // staying absent: a rename that rebuilt the panel without them
              // silently dropped a font override and every link the panel
              // held — found while adding the override, fixed for both.
              return { kind: p.kind, rect: p.rect, spec: p.spec, z: p.z, title: name, ...carryMarks(p),
                ...(p.links === undefined ? {} : { links: p.links }),
                ...(p.fontSize === undefined ? {} : { fontSize: p.fontSize }) }
            })
            // One entry for the whole gesture, on commit — the rule a drag
            // already follows. Pushing per keystroke would make one rename
            // take a dozen Cmd+Z presses to unwind.
            commitHistory(next)
            return next
          })
          setInputMode(null)
        }
      })
      // Same reason beginRenamePreset does this: Palette.tsx closes the
      // overlay BEFORE running a row's command, so without reopening, the mode
      // would be set on a palette that is already gone.
      palette.openPalette()
    },
    jumpPrompt: (id, direction) => {
      registry.get(id)?.handle.jumpPrompt(direction)
    },
    copyLastOutput: (id) => {
      const text = registry.get(id)?.handle.lastCommandOutput()
      if (text !== null && text !== undefined) void navigator.clipboard.writeText(text)
    },
    tidyPanels: (ids) => {
      // The merged view is read-only for geometry (M14) — the menu's Tidy and
      // the row both reach here.
      if (mergedRef.current) return
      // ONE history entry for the whole arrangement — twenty panels moving is
      // one gesture to undo, not twenty. Sizes never change (tidyPanels'
      // contract), so no rect can fall under the floor the validator
      // rejects; order never changes, so the arrangement keeps its meaning.
      setPanels((prev) => {
        const wanted = new Set(ids)
        // M92. A locked panel stays where it is under Arrange too.
        const chosen = prev.filter((p) => wanted.has(p.rect.id) && p.locked !== true)
        if (chosen.length < 2) return prev
        const tidied = new Map(tidyPanels(chosen.map((p) => p.rect)).map((r) => [r.id, r]))
        const next = prev.map((p) => {
          const r = tidied.get(p.rect.id)
          return r === undefined || (r.x === p.rect.x && r.y === p.rect.y) ? p : { ...p, rect: r }
        })
        if (next.every((p, i) => p === prev[i])) return prev
        commitHistory(next)
        return next
      })
    },
    setPanelFontSize: (id, size) => {
      // A COMMIT, one history entry, the rule a drag and a rename follow. The
      // registry does the rest on the next render: it resolves the effective
      // size and refits the live session once. Rebuilt field by field so an
      // absent override stays absent (fromPanels' rule) — `undefined` here
      // means "back to the global", which is the field's absence.
      setPanels((prev) => {
        const target = prev.find((p) => p.rect.id === id)
        if (!target || !isTerminalPanel(target)) return prev
        if (target.fontSize === size) return prev
        const next: Panel[] = prev.map((p) => {
          if (p.rect.id !== id || !isTerminalPanel(p)) return p
          return { kind: p.kind, rect: p.rect, spec: p.spec, z: p.z,
            ...(p.title === undefined ? {} : { title: p.title }),
            ...carryMarks(p),
            ...(p.links === undefined ? {} : { links: p.links }),
            ...(size === undefined ? {} : { fontSize: size }) }
        })
        commitHistory(next)
        return next
      })
    },
    resetCanvas: () => {
      // Main owns the confirmation dialog and the counts request. The palette
      // asks for the flow the menu item already runs rather than growing a
      // second one that could drift from it. FIRE-AND-FORGET: main returns
      // before the user answers the dialog, so this promise resolving says
      // nothing about whether a reset happened and nothing here may act on it.
      void window.canvas.canvas.requestReset()
    },
    // M146. TWO verbs, two names (backlog #23): `Reset zoom` is Cmd+0's
    // INITIAL; `Zoom to fit` frames the SELECTION when there is one and every
    // panel otherwise, as a flight, moving nothing but the camera. An empty
    // canvas has nothing to fit and resets instead — a verb that did nothing
    // would read as broken.
    resetZoom: () => resetViewport(),
    zoomToFit: () => {
      const target = zoomTarget(selectedIdsRef.current, panelsRef.current.map((p) => p.rect))
      if (target.kind === 'selection') fitSelection(target.rects)
      else if (target.kind === 'all') fitAll()
      else resetViewport()
    },
    // M56. Bookmarks and the trail. Names are minted as "View N" over the
    // current count; a rename is a later milestone's, and a place with a
    // number is still a place.
    addBookmark: () => {
      const camera = viewportRef.current
      const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      setBookmarks((current) => [...current, { id, name: `View ${current.length + 1}`, camera: { x: camera.x, y: camera.y, scale: camera.scale } }])
    },
    goToBookmark: (id) => {
      const found = bookmarksRef.current.find((b) => b.id === id)
      if (found) goToViewport(found.camera)
    },
    deleteBookmark: (id, name) => {
      // Gated like deletePreset: a delete row one Enter away from a place
      // the user chose to keep, styled like "Go to".
      setInputMode({
        kind: 'confirm',
        label: `Delete bookmark \u201c${name}\u201d?`,
        initial: '',
        submit: () => { setBookmarks((current) => current.filter((b) => b.id !== id)) }
      })
      palette.openPalette()
    },
    beginRenameBookmark: (id, currentName) => {
      setInputMode({
        kind: 'text',
        label: `Rename \u201c${currentName}\u201d to\u2026`,
        initial: currentName,
        submit: (value) => {
          const name = value.trim()
          if (name !== '') setBookmarks((current) => current.map((b) => (b.id === id ? { ...b, name } : b)))
          setInputMode(null)
        }
      })
      palette.openPalette()
    },
    cameraBack: () => cameraBack(),
    cameraForward: () => cameraForward(),
    // M58. Fire-and-forget into main, which owns the dialog, the write and
    // the reveal; a refusal is logged, since the palette has no toast.
    exportPanelText: (panelId) => {
      // M112. The live buffer rides along when the panel has one, so an
      // export works with persistence off; main decides which source wins.
      const session = registry.get(panelId)
      // `buffer` is `undefined` when the panel never spawned — spread into
      // the request object, that would normally be the `key: undefined`
      // shape the absent-stays-absent rule warns about, but it is benign
      // HERE because main discriminates on `typeof buffer === 'string'`,
      // not `'buffer' in req`. A later refactor to an `in` check would
      // silently flip an unspawned panel's `off` result to `empty`.
      const buffer = session && session.spawned ? session.handle.serialize() ?? undefined : undefined
      void window.canvas.export.panelText({ panelId, buffer }).then((r) => {
        // M112 (review round 1, IMPORTANT 3). The one place `source` is
        // read: the palette has no toast, so console feedback is the whole
        // of "the palette's feedback says which" — a written result names
        // which of the two sources actually answered.
        if (r.kind === 'written') console.info(`[export] panel text written from the ${r.source} — ${r.path}`)
        else if (r.kind !== 'cancelled') console.warn(`[export] panel text: ${r.kind}${'reason' in r ? ` — ${r.reason}` : ''}`)
      })
    },
    exportCanvasPng: () => {
      void window.canvas.export.canvasPng().then((r) => {
        if (r.kind === 'failed') console.warn(`[export] canvas png — ${r.reason}`)
      })
    },
    toggleSetting: (id, value) => {
      // Main owns the store, so the write goes there and the row list is
      // reloaded from the answer rather than updated optimistically: an
      // optimistic row that main refused (an unknown id, a wrong type) would
      // show the new value until the next reload and then flip back.
      void window.canvas.settings.set(id, value).then(reloadSettings)
    },
    beginEditSetting: (id, label, current) => {
      // Read off the row we already loaded, rather than hardcoding 250/60000
      // (or any other bound): the schema is the single source of truth for
      // min/max, and a renderer-side constant would silently drift from it
      // the day a range changes. Absent for a row with no bound.
      const row = settingRows.find((s) => s.id === id)
      const { min, max } = row ?? {}

      // Re-entrant so an out-of-range refusal can reopen the same edit with
      // the bad value still visible, rather than starting over from `current`.
      const openEdit = (initial: string, refused?: string): void => {
        setInputMode({
          kind: 'number',
          label: refused ? `${label} (ms) — ${refused}` : `${label} (ms)…`,
          initial,
          // Set ONLY on the refusal reopen. The ordinary label above is a
          // placeholder-worthy hint ("here's the current value"); this one is
          // an answer to a question nobody asked unless they just typed
          // something wrong, and a placeholder can't show it — see
          // InputMode's `feedback` doc comment in Palette.tsx.
          ...(refused ? { feedback: true as const } : {}),
          submit: (value) => {
            const parsed = Number(value)
            // A non-number is a cancel, not a write of NaN. main's
            // setPreference would refuse NaN anyway, but bouncing it here
            // means a typo does not close the palette and silently change
            // nothing.
            if (!Number.isFinite(parsed)) {
              setInputMode(null)
              return
            }
            // Checked here too, even though main enforces the SAME bound in
            // setPreference. main's check is the last line of defence for a
            // file it did not write; it is not enough on its own, because a
            // refusal that happens only there is INVISIBLE — the palette
            // closes exactly as it does on success, SETTINGS_SET's handler
            // resolves regardless, and reloadSettings() re-fetches the
            // unchanged value with nothing anywhere saying the edit was
            // dropped. Re-opening here is what makes the refusal visible to
            // the user; it does not replace main's check, which still catches
            // a value that reached this process by some other route.
            if ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
              openEdit(value, `must be ${min ?? '−∞'}–${max ?? '∞'}, got ${parsed}`)
              return
            }
            void window.canvas.settings.set(id, parsed).then(() => {
              setInputMode(null)
              reloadSettings()
            })
          }
        })
        // Palette.tsx closes the overlay BEFORE running a row's command (and
        // before calling an input mode's submit), so without this the mode
        // would be set on a palette that is already gone and the
        // clear-on-close effect would wipe it — the same pairing
        // beginRenamePreset and deletePreset both make, and the reason the
        // out-of-range branch above must call openEdit (which reopens) rather
        // than just setInputMode.
        palette.openPalette()
      }

      openEdit(String(current))
    },
    /**
     * M85. A free-text setting — the vault's folder, and the only one so far.
     * The same text line every rename uses, reopened by `openPalette()` for
     * the reason the number edit above states in full. An empty submit CLEARS
     * the setting rather than cancelling: "no vault" is a real answer, and the
     * pane says so.
     */
    // The vault pane's `Choose a folder…` — the SAME text line the setting's
    // palette row opens, so there is one way to answer the question.
    beginChooseVault: () => {
      const current = settingRows.find((r) => r.id === 'vault.root')
      const initial = typeof current?.value === 'string' ? current.value : ''
      setInputMode({
        kind: 'text',
        label: 'Vault folder — a folder; `none` clears it',
        initial,
        submit: (value) => {
          // Blank is CANCEL, as on every other text line in this app; `none`
          // clears the setting on purpose (M85's verifier: an Enter meant to
          // dismiss must not lose a vault).
          const typed = value.trim()
          if (typed === '') { setInputMode(null); return }
          void window.canvas.settings.set('vault.root', typed.toLowerCase() === 'none' ? '' : typed).then(() => {
            setInputMode(null)
            reloadSettings()
          })
        }
      })
      palette.openPalette()
    },
    beginEditTextSetting: (id, label, current) => {
      setInputMode({
        kind: 'text',
        label: `${label} — a folder; \`none\` clears it`,
        initial: current,
        submit: (value) => {
          // Blank is CANCEL, as on every other text line in this app; `none`
          // clears the setting on purpose (M85's verifier: an Enter meant to
          // dismiss must not lose a vault).
          const typed = value.trim()
          if (typed === '') { setInputMode(null); return }
          void window.canvas.settings.set(id, typed.toLowerCase() === 'none' ? '' : typed).then(() => {
            setInputMode(null)
            reloadSettings()
          })
        }
      })
      palette.openPalette()
    },
    switchWorkspace,
    // M147. Three existing doors in order — workspace:create (named after the
    // template), the switch, then M80's instantiation in the new workspace.
    // A template with parameters asks its sheet FIRST (M80's rule: a hole is
    // asked, never guessed) and the three doors run on the sheet's Enter,
    // through the `into` seam beginSpawnSheet threads to the sheet's own
    // instantiate: the first cut minted and switched BEFORE the sheet, so an
    // Escape stranded the user in an empty workspace named after the template
    // (the 4.0 audit's `runs` scene; shell `workspace.template.2`).
    workspaceFromTemplate: (templateId) => {
      void window.canvas.template.list().then(async (templates) => {
        const template = allTemplates(templates).find((t) => t.id === templateId)
        if (template === undefined) return
        if (templateHoles(template).length > 0) { self.beginSpawnSheet(templateId, { intoNewWorkspace: true }); return }
        await intoNewWorkspace(template, {})
      })
    },
    beginCreateWorkspace: () => {
      setInputMode({
        kind: 'text',
        label: 'Name the new workspace…',
        initial: '',
        submit: (value) => {
          const name = value.trim()
          // An empty trimmed value is a cancel, not "name this workspace
          // the empty string" — parseWorkspace accepts '' and it would
          // round-trip to disk, leaving the switch row and the admin rows
          // rendering blank text with no way back to a real name short of
          // deleting the workspace.
          if (name.length === 0) {
            setInputMode(null)
            return
          }
          void window.canvas.workspace.create(name).then((id) => {
            // Create then switch, as two calls rather than one store method.
            // createWorkspace deliberately does NOT activate what it mints
            // (a create that also switched would move the user somewhere
            // they did not ask to go) — but this row is "new workspace",
            // and arriving in it IS what the user asked for. The store
            // keeps the two separable; the command composes them.
            switchWorkspace(id)
            reloadWorkspaces()
            setInputMode(null)
          }, (error: unknown) => {
            // Unhandled otherwise: void-ing this chain silences the lint,
            // not the rejection. Nothing has happened to the canvas yet at
            // this point (create runs before switch), so failing here is
            // the cheap, honest case — just tell the palette to stop
            // waiting rather than leaving it hung on a promise that will
            // never resolve.
            console.warn('[workspace] could not create workspace', name, error)
            setInputMode(null)
          })
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without reopening, the mode would be set on a palette that is gone.
      palette.openPalette()
    },
    beginRenameWorkspace: (id, currentName) => {
      setInputMode({
        kind: 'text',
        label: 'Rename this workspace…',
        initial: currentName,
        submit: (value) => {
          const name = value.trim()
          // Same cancel rule as beginCreateWorkspace: an empty trimmed
          // value must not reach the store, or the rename "succeeds" into
          // a blank name that round-trips to disk.
          if (name.length === 0) {
            setInputMode(null)
            return
          }
          void window.canvas.workspace.rename(id, name)
            .catch((error: unknown) => {
              // Unhandled otherwise. Refused or rejected, the palette still
              // has to stop waiting — reloadWorkspaces() below reflects
              // whichever name main actually kept either way.
              console.warn('[workspace] could not rename workspace', id, error)
            })
            .finally(() => {
              reloadWorkspaces()
              setInputMode(null)
            })
        }
      })
      // Same reason beginCreateWorkspace/beginRenamePreset both do this.
      palette.openPalette()
    },
    deleteWorkspace: (id, name, panelCount) => {
      // Gated, not instant — the same reason deletePreset above is: a
      // delete row sat one Enter away from destroying a workspace's worth
      // of running agents, styled identically to "Go to n1".
      //
      // `panelCount` (commands.ts's `w.panelIds.length`) is a PANEL count,
      // not a LIVE one — three dormant, never-spawned panels would read as
      // "stop 3 running agents", which is false, in the one place a false
      // claim is worst: a destructive confirm. Recomputed honestly below,
      // before the question is ever shown, against main's own pty list
      // rather than this renderer's local registry — the same reason
      // dispose()'s own fix above exists: a panel this renderer holds no
      // PanelSession for (another workspace's, or one surviving a reload)
      // can still be genuinely running, so the registry alone would
      // undercount exactly the panels most worth warning about.
      void (async (): Promise<void> => {
        let liveCount = panelCount
        try {
          const [rows, sessions] = await Promise.all([
            window.canvas.workspace.list(),
            window.canvas.pty.list()
          ])
          const row = rows.find((w) => w.id === id)
          if (row) {
            const liveIds = new Set(sessions.map((s) => s.panelId))
            liveCount = row.panelIds.filter((pid) => liveIds.has(pid)).length
          }
        } catch (error: unknown) {
          // Failing toward the ORIGINAL (panel) count is the safe direction
          // for a destructive confirm: overstating what is about to stop is
          // the honest side of a guess to be wrong on, understating it is
          // not.
          console.warn('[workspace] could not compute a live count for delete confirm', id, error)
        }
        setInputMode({
          kind: 'confirm',
          // The count is IN the question. "Delete this workspace?" and
          // "stop 3 running agents?" are different questions, and only the
          // second one is the one actually being asked.
          label:
            liveCount > 0
              ? `Delete “${name}” and stop ${liveCount} running ${liveCount === 1 ? 'agent' : 'agents'}?`
              : `Delete “${name}”?`,
          initial: '',
          submit: () => {
            void (async (): Promise<void> => {
              try {
                const before = await window.canvas.workspace.list()
                const doomed = before.find((w) => w.id === id)
                // Re-read rather than trusting the row's captured
                // panelIds: the palette's list is a snapshot from when it
                // opened, and a panel may have been closed (or opened)
                // since.
                if (doomed) {
                  // Deleting the ACTIVE workspace: switch away BEFORE
                  // removing the record, never after. IPC.WORKSPACE_ACTIVATE's
                  // own doc comment says why — activate() writes its
                  // `outgoing` argument into whichever workspace main
                  // considers active AT THE MOMENT IT RUNS, and main's own
                  // remove() reassigns activeWorkspaceId to a neighbour the
                  // instant this record is gone. An activate() issued AFTER
                  // remove() would therefore write THIS (about-to-be-deleted)
                  // workspace's own stale panels — captured before dispose()
                  // below ever ran — into whatever main just made active,
                  // silently resurrecting a disposed panel's id there. This
                  // was caught by a failing check, not by reading the doc
                  // comment first: verify:panels 69 disposed the session
                  // correctly and then watched it reappear in the registry a
                  // moment later, reintroduced by exactly this write.
                  // Switching first means the outgoing write lands on the
                  // record actually being left — this one, which we are
                  // about to delete anyway, so it is harmless there.
                  //
                  // A workspace with no neighbour (this was the ONLY one)
                  // gets the SAME treatment, not a special one: mint a
                  // fresh replacement and switch to IT first, exactly as
                  // though it were a neighbour that already existed. The
                  // earlier shape of this branch let main's remove()
                  // install its own fresh default and switched to THAT
                  // afterward — which is the identical after-remove()
                  // mistake this comment already rules out, just with the
                  // neighbour missing rather than merely stale: the
                  // outgoing write still landed on a real, currently-active
                  // record (the fresh default) with this doomed workspace's
                  // disposed panels, resurrecting them there. 'Canvas'
                  // matches the name main's own defaultWorkspace() would
                  // have installed, so the user sees the same thing either
                  // way — the only difference is which process decided.
                  // Captured BEFORE the switch below, and out of this
                  // canvas's own panel array, because that array is the only
                  // place a KIND is knowable here: main's workspace rows
                  // carry ids and nothing else. A review node holds no
                  // PanelSession, and dispose() reaches pty.kill regardless
                  // (see the loop's own comment), so an unguarded node id
                  // here sends a kill for a panel that never had a session
                  // and drops the baseline of whatever panel recycles that
                  // id. Positive test, as everywhere else.
                  //
                  // Honest about its reach: this covers the ACTIVE
                  // workspace, which is the only one whose panels this
                  // renderer holds objects for. Deleting a HIDDEN workspace
                  // that contains a review node still sends that stray kill
                  // — harmless in the same way it was harmless everywhere
                  // before this guard (main tolerates destroying a session it
                  // never spawned), and closable only by teaching
                  // WORKSPACE_LIST to carry a kind, which is a channel
                  // change this milestone did not scope.
                  // M16: every SESSIONLESS kind, not only review nodes — a
                  // file panel owns no PanelSession either, so an unguarded
                  // id here sends the same stray kill.
                  const doomedSessionlessIds = doomed.active
                    ? new Set(panelsRef.current
                        .filter((p) => !isTerminalPanel(p))
                        .map((p) => p.rect.id))
                    : new Set<string>()
                  let target = before.find((w) => w.id !== id)
                  if (doomed.active && !target) {
                    const freshId = await window.canvas.workspace.create('Canvas')
                    target = { id: freshId, name: 'Canvas', panelIds: [], active: false }
                  }
                  // AWAITED, and a refusal ABANDONS the delete. This is the
                  // one caller that cannot treat switchWorkspace as
                  // fire-and-forget: the in-flight guard can refuse it (a
                  // chord pressed while this confirm's own awaits were
                  // running), and a delete that carried on regardless would
                  // remove the ACTIVE record without having switched away —
                  // exactly the resurrection this ordering exists to prevent,
                  // with main's remove() reassigning activeWorkspaceId and
                  // this workspace's already-disposed panels landing in the
                  // neighbour. Refusing the whole delete is the honest
                  // failure: the user still has their workspace, and pressing
                  // the row again works.
                  if (doomed.active && target) {
                    const switched = await switchWorkspace(target.id)
                    if (!switched) {
                      console.warn(
                        '[workspace] delete abandoned: could not switch away from the active workspace',
                        id
                      )
                      return
                    }
                  }
                  for (const panelId of doomed.panelIds) {
                    // THE FOURTH registry.dispose CALL SITE in the canvas
                    // layer (after onClosePanel, applyHistory and onReset,
                    // all three still in Canvas.tsx). Said "in this file"
                    // until M28 lifted these actions out of Canvas.tsx; the
                    // count is the layer's, which is the scope verify:panels
                    // 94 now reads. It
                    // adds no caller of pty.kill: dispose(id) and
                    // disposeAll() remain the only two inside
                    // session-registry.ts, and routing through dispose()
                    // rather than reaching for pty.kill directly is exactly
                    // what has kept that count true across four milestones.
                    //
                    // Disposing rather than detaching is deliberate. The
                    // workspace RECORD is going, so a surviving session is
                    // one no UI can ever reach or stop again — the backlog
                    // item for recovering an orphan session does not exist
                    // — which means an agent would burn tokens invisibly
                    // until quit kill-servers the whole tmux socket. This
                    // holds even for a panelId this renderer has no LOCAL
                    // PanelSession for (a hidden workspace's own panel, or
                    // one surviving a reload): dispose()'s own fix sends
                    // pty.kill regardless, mirroring main's PtyManager.kill.
                    // And, like the reset and undo loops, it skips a
                    // sessionless panel's id — see doomedSessionlessIds above
                    // for what the skip buys and exactly how far it reaches.
                    // M73. A chat's session is main's and the record is
                    // going, so it is disposed WITH its file — for every
                    // doomed id, since a hidden workspace's chat is not in
                    // panelsRef to be told apart: for any other kind this is
                    // a no-op in main (no session) and on disk (no file).
                    disposeChat(panelId, true); disposeWatcher(panelId)
                    // M247. BEFORE the sessionless `continue` below: a file object is
                    // exactly what agent links point AT, so its links must go too.
                    forgetAgentLinksFor(panelId)
                    if (doomedSessionlessIds.has(panelId)) {
                      clearFileResult(panelId)
                      clearToolbox(panelId)
                      continue
                    }
                    registry.dispose(panelId)
                    clearAgentState(panelId)
                    clearLastLine(panelId)
                    clearLiveSession(panelId)
                    clearSubagents(panelId)
                    clearTrail(panelId)
                    clearUsage(panelId)
                    clearMachineCost(panelId)
                    clearScrollbackTail(panelId)
                  }
                }
                await window.canvas.workspace.remove(id)
              } catch (error: unknown) {
                // Unhandled otherwise. By the time any of these awaits could
                // reject, the sessions above may already be disposed — the
                // worst case this action's brief calls out — so silence here
                // would strand the user on a canvas full of dead panels with
                // no path back and nothing in any log.
                console.warn('[workspace] could not delete workspace', id, error)
              } finally {
                reloadWorkspaces()
                setInputMode(null)
              }
            })()
          }
        })
        // Palette.tsx closes the overlay BEFORE running a row's command, so
        // without reopening, the mode would be set on a palette that is
        // gone. Reopened here rather than before the count above, since
        // this whole function is now async: opening early would show a
        // confirm whose wording changes a beat later, which reads as the
        // dialog glitching rather than as a deliberate wait.
        palette.openPalette()
      })()
    },
    // Not a new dispose call site — this IS onClosePanel, the one the panel's
    // own × already uses. See PaletteActions.closePanel for why it is reached
    // through this object rather than closed over directly by the rail.
    closePanel: (id) => onClosePanel(id),
    // The wake path, and deliberately not what a row CLICK does. See
    // PaletteActions.startPanel.
    startPanel: (id) => onSelectPanel(id),
    savePanelAsPreset: (id) => {
      // displayPanelsRef, not panelsRef, and this is the read-only split
      // deciding in favour of ON SCREEN rather than SAVED for once. While
      // merged the inspector can have a FOREIGN panel selected, and against
      // panelsRef the lookup simply found nothing: the Save control stayed
      // enabled and did nothing at all — an affordance that lies, which is
      // worse than a disabled one with a reason, and worse again because the
      // user's next move is to press it harder.
      //
      // Saving a foreign panel is safe where DRAGGING one is not, and the
      // difference is direction: a preset is a READ of the panel's spec and
      // its box into a store of its own. It writes no workspace record, moves
      // no session, and the lane offset never reaches it — the rect's w/h are
      // the only geometry a preset carries, and lanes translate, so they are
      // the panel's own numbers either way.
      const panel = displayPanelsRef.current.find((p) => p.rect.id === id)
      // Nothing to save for a sessionless panel: neither a review node nor a
      // file panel has a spec, and the preset either would produce is a shell
      // in a directory it never named. The POSITIVE test, so a fourth kind is
      // a compile error here rather than a shell spawned in a stranger's cwd.
      if (!panel || !isTerminalPanel(panel)) return
      // Where the panel IS, falling back to where it was spawned — the same
      // asymmetry reloadPrompts obeys, stated there in full.
      const captured: CapturedPanel = {
        cwd: getLiveSession(panel.rect.id)?.cwd ?? panel.spec.cwd,
        args: [...panel.spec.args],
        w: panel.rect.w,
        h: panel.rect.h
      }
      // Absent stays absent: a captured login-shell panel must save as a
      // login-shell preset, not as whatever this machine's shell happens to
      // be. Built field by field for the same reason onCapture is.
      if (panel.spec.command !== undefined) captured.command = panel.spec.command
      if (panel.spec.agent !== undefined) captured.agent = panel.spec.agent
      // M20. Both capture surfaces carry it, never one — presetFromCapture is
      // the shared mint precisely so the menu's path and the inspector's
      // cannot disagree about what a saved preset is, and a knob added to one
      // only would give a user two different presets for one panel depending
      // on which surface saved it.
      if (panel.spec.agentOptions !== undefined) captured.agentOptions = panel.spec.agentOptions
      void window.canvas.preset.savePanel(captured).then(reloadPresets)
    },
    /**
     * Restart in place: end this panel's process and start a fresh one at the
     * same id, the same rect and the same spec.
     *
     * THE FIFTH registry.dispose CALL SITE in this file, and — like the other
     * four — it adds no caller of pty.kill: dispose() is still exactly one of
     * the two, both inside session-registry.ts. verify:panels 94 pins both
     * numbers by reading the source, because no runtime behaviour can observe
     * how many callers a function has and CLAUDE.md records this exact count
     * going stale once already.
     *
     * Four things about the sequence are load-bearing.
     *
     * clearAgentState FIRST, before the dispose. Agent state survives a
     * panel's closure by design — main sends the transition and the
     * renderer's store keeps it until something clears it — so without this a
     * panel restarted out of wants-you keeps its amber border: a fresh agent
     * wearing a dead one's question, and nothing will ever clear it, because
     * only focus or a write acknowledges and neither says anything about the
     * PREVIOUS process. main's `create` sends `starting` directly (it is the
     * one state nothing transitions into, so a change-gated send would never
     * emit it), which is what re-seeds the panel a moment later.
     *
     * AWAIT the dispose. Under tmux the session must be DESTROYED before the
     * respawn, or `new-session -A` attaches to the very session this was meant
     * to replace and the whole verb becomes a silent no-op — the panel blinks
     * and comes back with the same process in it. dispose() returns the
     * kill's promise for exactly this caller.
     *
     * ensure with dormant FALSE, explicitly rather than inherited. A dormant
     * re-ensure leaves the panel refusing to spawn, which on screen is
     * indistinguishable from a restart that did nothing at all.
     *
     * bumpVersion at the end. ensure() deliberately does not bump — it is
     * normally called during render, where notifying a useSyncExternalStore
     * subscriber makes React warn — so from an event handler nothing else
     * would re-render to mount the new handle's slot or re-run the tiering
     * effect, and the panel would show literally nothing with no error
     * anywhere. dispose() did bump, but that bump is a tick stale by the time
     * this resolves. NOT focus(): it bumps too, but it also moves the
     * keyboard, which a shell control must never do (shell-control.ts).
     *
     * No history entry — the panel array does not change, so there is no
     * gesture to undo. No confirm — the process this ends is precisely the one
     * the user asked to replace; the control's own title is where the warning
     * lives instead.
     */
    // M92. Pass-throughs: the rule lives in Canvas beside the record.
    lockPanel, unlockPanel, pinPanel, unpinPanel, maximisePanel, restorePanel,
    // M93. The annotate door.
    beginAnnotate: () => { void beginAnnotate() },
    restartPanel: (id) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      // A sessionless panel has no process to restart. The isRestartable gate
      // inside restartWithSpec would refuse either kind anyway (neither holds
      // a session, so the status is undefined), but the narrowing has to
      // happen before `panel.spec` is read at all.
      if (!panel || !isTerminalPanel(panel)) return
      restartWithSpec(id, panel.spec)
    },
    /**
     * M20. Set a panel's permission mode AND restart it, as ONE gesture.
     *
     * Compound rather than two verbs, and the compounding is the design. A
     * bare "change this panel's mode" is unsound twice: `registry.ensure`
     * returns an existing session unchanged, so the spec would move while the
     * process kept the old flags — every surface reading the session would
     * then disagree with every surface reading the panel — and an undo of the
     * spec edit would lie in the other direction, restoring a spec the running
     * process never had. Restarting closes both, because a restart is the one
     * thing that re-reads the argv: tmux `new-session -A` ignores it entirely
     * on a reattach.
     *
     * It is also what lets the inspector label its rows plainly rather than
     * hedging each with "requested". With this as the only mutation path, the
     * session's spec and the running process cannot disagree.
     *
     * ONE history entry, pushed through commitHistory like every other
     * committed gesture — unlike plain restartPanel, which pushes none
     * because the panel array genuinely does not change there. Here it does:
     * the spec is part of the panel, so an undo has something real to undo.
     */
    restartPanelWithMode: (id, mode) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      if (!panel || !isTerminalPanel(panel)) return
      // Gated on the SESSION's agent, matching agentArgs: a flag appended to a
      // panel main will not treat as an agent is emitted nowhere, so the verb
      // would look like it worked and do nothing.
      if (registry.get(id)?.spec.agent === undefined) return
      const nextSpec: PanelSpecTemplate = {
        ...panel.spec,
        agentOptions: { ...panel.spec.agentOptions, permissionMode: mode }
      }
      setPanels((current) => {
        const next = current.map((p) =>
          p.rect.id === id && isTerminalPanel(p) ? { ...p, spec: nextSpec } : p
        )
        commitHistory(next)
        return next
      })
      restartWithSpec(id, nextSpec)
    },
    openReview,
    // Reads the panel from the ref rather than closing over `panels`, the
    // rule every other action in this object obeys: `panels` is a fresh array
    // on every setPanelRect, so closing over it would rebuild this whole memo
    // on every frame of a drag.
    openToolbox: (panelId) => {
      const panel = panelsRef.current.find((p) => p.rect.id === panelId)
      if (panel === undefined) return
      const directory = inspectionDirectory(panel, 'tools')
      if (directory.kind !== 'known') return
      openToolboxPanel(directory.cwd, railLabel(panel, registry.get(panelId)?.status), worldCentre())
    },
    // M61. Pure transitions from groups.ts, the same ones GroupLayer's
    // buttons reach through Canvas — one definition of "collapse".
    // Refused in the merged view at the action as well as at the row, the way
    // beginCreateGroup below is: the row's reason is the user-facing refusal,
    // this is the one a future caller cannot forget.
    toggleGroup: (id) => { if (mergedRef.current) return; setGroups((current) => (current.find((g) => g.id === id)?.collapsed ? expandGroup : toggleGroup)(current, id)) },
    removeGroup: (id) => { if (mergedRef.current) return; setGroups((current) => removeGroup(current, id)) },
    // M80. The selected panels and the enabled handoff edges among them, saved
    // as a shape of work. A kind that is neither a terminal nor a chat is
    // DROPPED with the count said in the sentence — a template makes panels,
    // and a review node's subject would not exist in the new canvas.
    beginSaveTemplate: (panelIds) => {
      // The merged view's rects are lane-space: a template saved there would
      // record a geometry that exists in one render (M80's verifier).
      if (mergedRef.current) { setInputMode({ kind: 'text', label: 'the merged view is read-only — switch to a workspace first', initial: '', submit: () => setInputMode(null) }); palette.openPalette(); return }
      const chosen = panelsRef.current.filter((p) => panelIds.includes(p.rect.id))
      const usable = chosen.filter((p) => isTerminalPanel(p) || isChatPanel(p))
      const dropped = chosen.length - usable.length
      if (usable.length === 0) {
        // Refused BY NAME, never silently: the row was enabled because
        // something was selected, and nothing happening reads as broken.
        setInputMode({ kind: 'text', label: 'a template is made of terminals and chats — none is selected', initial: '', submit: () => setInputMode(null) })
        palette.openPalette()
        return
      }
      setInputMode({
        kind: 'text',
        // M182. Bound panels PREFILL their template's name and the label says
        // what Enter does; another name saves a copy (the critic's F3).
        label: (() => {
          const bs = usable.map((p) => p.templateBinding?.templateId)
          const one = bs[0] !== undefined && bs.every((b) => b === bs[0]) ? allTemplates(templateRowsRef.current).find((t) => t.id === bs[0]) : undefined
          return one !== undefined && !isBuiltInTemplate(one.id)
            ? `Enter updates "${one.name}" (revision ${one.revision ?? 0}); another name saves a copy${dropped === 0 ? '' : ` (${dropped} other panel${dropped === 1 ? '' : 's'} cannot be saved)`}`
            : `Name this ${usable.length}-panel template…${dropped === 0 ? '' : ` (${dropped} other panel${dropped === 1 ? '' : 's'} cannot be saved)`}`
        })(),
        initial: (() => { const bs = usable.map((p) => p.templateBinding?.templateId); const one = bs[0] !== undefined && bs.every((b) => b === bs[0]) ? allTemplates(templateRowsRef.current).find((t) => t.id === bs[0]) : undefined; return one !== undefined && !isBuiltInTemplate(one.id) ? one.name : '' })(),
        submit: (value) => {
          const name = value.trim()
          setInputMode(null)
          if (name === '') return
          const centre = usable.reduce((acc, p) => ({ x: acc.x + (p.rect.x + p.rect.w / 2) / usable.length, y: acc.y + (p.rect.y + p.rect.h / 2) / usable.length }), { x: 0, y: 0 })
          const keyOf = new Map(usable.map((p, i) => [p.rect.id, `n${i + 1}`]))
          const nodes = usable.map((p) => {
            const key = keyOf.get(p.rect.id) as string
            const dx = Math.round(p.rect.x + p.rect.w / 2 - centre.x)
            const dy = Math.round(p.rect.y + p.rect.h / 2 - centre.y)
            if (isChatPanel(p)) return { key, kind: 'chat' as const, cwd: p.chat.cwd, dx, dy, ...(p.title === undefined ? {} : { title: p.title }) }
            const live = getLiveSession(p.rect.id)?.cwd ?? p.spec.cwd
            // The spec's own command and arguments, verbatim. A panel with NO
            // command is the login shell, and only main resolves that — so it
            // saves as the built-in shell preset rather than as nothing, which
            // is what made a saved template unstartable (M80's verifier).
            return {
              key, kind: 'terminal' as const, cwd: live, dx, dy,
              ...(p.title === undefined ? {} : { title: p.title }),
              ...(p.spec.command === undefined
                ? { presetId: 'shell' }
                : { command: p.spec.command, args: [...(p.spec.args ?? [])] })
            }
          })
          const edges = usable.flatMap((p) => linksOf(p)
            .filter((l) => l.automation?.kind === 'handoff' && l.automation.enabled && keyOf.has(l.to))
            .map((l) => ({ from: keyOf.get(p.rect.id) as string, to: keyOf.get(l.to) as string, trigger: (l.automation as { trigger: HandoffTrigger }).trigger })))
          // M182. THE CANVAS BINDING'S UPDATE (the critic's F1–F4): when every
          // saved panel carries one template's binding and the name typed is
          // that template's, the record is updated THROUGH THE OPERATIONS —
          // `moveNode` for every bound panel, `configureNode` for a terminal or
          // chat's captured fields — so a pool, orchestrator or collect node
          // keeps its kind and its fields and an unselected node is left alone.
          // Refused by name for a dirty diagram draft, a key not in the record
          // or two panels on one key; saved with the revision the rows hold,
          // which are reloaded on every save.
          const bindings = usable.map((p) => p.templateBinding?.templateId)
          const boundId = bindings[0] !== undefined && bindings.every((b) => b === bindings[0]) ? bindings[0] : undefined
          const bound = boundId === undefined ? undefined : allTemplates(templateRowsRef.current).find((t) => t.id === boundId)
          if (bound !== undefined && bound.name === name && !isBuiltInTemplate(bound.id)) {
            void self.updateBoundTemplate(usable.map((p) => p.rect.id)).then((r) => {
              if (r.kind === 'refused') { setInputMode({ kind: 'text', label: r.reason, initial: '', submit: () => setInputMode(null) }); palette.openPalette() }
            })
            return
          }
          void window.canvas.template.save({ name, nodes, edges })
        }
      })
      palette.openPalette()
    },
    // M149. The feedback line as a door of its own: the shape every refusal
    // reopen already uses (a text mode with `feedback`), for a refusal that
    // arrives on a keystroke and would otherwise be swallowed. Enter or
    // Escape closes it; nothing is submitted.
    say: (sentence: string) => {
      setInputMode({ kind: 'text', label: sentence, initial: '', feedback: true as const, submit: () => setInputMode(null) })
      palette.openPalette()
    },
    // M174. `seed.cwd` is the launcher's recents chip: the sheet opens ON that folder.
    beginSpawnSheet: (templateId?: string, into?: { intoNewWorkspace: true }, seed?: { cwd: string }) => {
      // The focused panel's LIVE directory first (M12's poll, falling back to
      // the spawn cwd), then main's recent list, then every panel's directory.
      // The captured id while the palette is open; from the menu (palette
      // closed) the most recently focused panel, which the registry records.
      const focusedAt = registry.lastFocusedAt()
      const lastFocused = Object.keys(focusedAt).sort((a, b) => focusedAt[b] - focusedAt[a])[0]
      const captured = palette.capturedId ?? lastFocused ?? null
      const focusedPanel = captured === null ? undefined : panelsRef.current.find((p) => p.rect.id === captured)
      const focusedCwd = seed !== undefined ? seed.cwd : focusedPanel !== undefined && isTerminalPanel(focusedPanel)
        ? (getLiveSession(focusedPanel.rect.id)?.cwd ?? focusedPanel.spec.cwd)
        : undefined
      const panelDirs = panelsRef.current.filter(isTerminalPanel).map((p) => getLiveSession(p.rect.id)?.cwd ?? p.spec.cwd)
      const presets = presetRows.map((p) => ({ id: p.id, name: p.name, available: p.available, ...(p.agent === undefined ? {} : { agent: p.agent }), ...(p.cwd === undefined ? {} : { cwd: p.cwd }), ...(p.agentOptions === undefined ? {} : { agentOptions: p.agentOptions }) }))
      const defaultPresetId = presetRows.find((p) => p.isDefault)?.id ?? presetRows[0]?.id ?? ''
      void Promise.all([window.canvas.spawn.recent(), window.canvas.template.list()]).then(([recents, templateList]) => {
        const claudeOk = claudeAvailable(presetRows)
        const templates = templateList.map((template) => {
          const refusal = templateRefusal(template, presetRows, claudeOk)
          return refusal === undefined ? { template } : { template, refusal }
        })
        setInputMode({
          kind: 'sheet',
          label: 'New panel',
          initial: '',
          submit: () => {},
          sheet: {
            presets, defaultPresetId, ...(focusedCwd === undefined ? {} : { focusedCwd }), recents, panelDirs,
            claudeAvailable: claudeOk,
            codexAvailable: codexAvailable(presetRows),
            // M118. Every row's availability from the registry's order — a third row needs no new boolean.
            available: Object.fromEntries(BACKEND_IDS.map((id) => [id, backendAvailable(presetRows, id)])),
            // M99. What live sessions have reported, for the model field's suggestions.
            reportedModels: reportedModels(),
            hasSupervisor: panelsRef.current.some((p) => isChatPanel(p) && p.chat.supervisor === true),
            templates,
            ...(templateId === undefined ? {} : { templateId }),
            instantiate: into === undefined ? instantiateTemplate : intoNewWorkspace,
            teammates: teammatesRef.current,
            // M104. The ceiling as read live: the preview says who queues before Enter.
            ceiling: { maxConcurrent: Number(settingRows.find((r) => r.id === 'agents.maxConcurrent')?.value ?? 0), liveAgents: panelsRef.current.filter((p) => isChatPanel(p) && (getChat(p.rect.id).snapshot?.status === 'streaming' || getChat(p.rect.id).snapshot?.status === 'starting')).length,
              // M121. Sends already waiting behind the ceiling take room too.
              queued: panelsRef.current.reduce((n, p) => n + (isChatPanel(p) ? (getChat(p.rect.id).snapshot?.queued ?? 0) : 0), 0) },
            // M73. A chat is minted HERE, never sent to spawn:sheet: main
            // validates the directory and the CLI through agent:create and
            // the refusal is shown in the sheet like any other.
            // M81. A supervisor is a chat created with the supervisor's own
            // system prompt and its first question in the composer — unsent,
            // like a template's (M80): nothing starts work unread.
            submit: (values) => values.what.kind === 'supervisor'
              ? beginNewChat({ cwd: values.cwd, title: values.title === '' ? 'supervisor' : values.title, agentOptions: values.agentOptions, appendSystemPrompt: SUPERVISOR_PROMPT, message: 'What is this canvas doing?' })
              : values.what.kind === 'chat'
                // M118. The backend by NAME from the arm, never a switch: absent is claude.
                ? beginNewChat({ cwd: values.cwd, title: values.title, agentOptions: values.agentOptions, ...(values.what.backend === undefined ? {} : { backend: values.what.backend }) })
                : values.what.kind === 'lineup'
                  // M104. Seat by seat through the ordinary doors: an agent seat is
                  // the first available agent preset (a worktree lane only when
                  // asked), a shell seat is the login shell or its command, a browser
                  // seat is an M103 pane — never in a worktree.
                  ? (async (): Promise<SpawnResult> => {
                    const plan = lineupPlan(LINEUPS[(values.what as { id: Lineup['id'] }).id], { cwd: values.cwd, worktrees: values.worktree === true, maxConcurrent: 0, liveAgents: 0 })
                    const agentPreset = presetRows.find((p) => p.agent !== undefined && p.available)
                    // Refused BEFORE any seat is minted: a refusal mid-loop leaves half a lineup.
                    if (agentPreset === undefined && plan.seats.some((s) => s.kind === 'agent')) return { kind: 'refused', reason: 'no agent CLI is on the PATH — install claude or codex, or check the environment report' }
                    for (const seat of plan.seats) {
                      if (seat.kind === 'browser') {
                        // M195 (D03). A lineup's preview seat is a preview of the
                        // lineup's OWN folder by construction, so it is born bound
                        // — the one place the app mints a pane already knowing the
                        // project. A cwd that is not absolute binds nothing (there
                        // is no panel yet to take a source id from either, which is
                        // why the binding is a root alone).
                        const lineupRoot = normalisePreviewPath(values.cwd)
                        openBrowserPanel(seat.url ?? 'http://localhost:3000/', lineupRoot === null ? undefined : { root: lineupRoot })
                        continue
                      }
                      if (seat.kind === 'agent') {
                        if (agentPreset === undefined) return { kind: 'refused', reason: 'no agent CLI is on the PATH — install claude or codex, or check the environment report' }
                        const r = await window.canvas.spawn.sheet({ presetId: agentPreset.id, cwd: values.cwd, title: seat.role, ...(seat.lane ? { worktree: true } : {}) })
                        if (r.kind === 'refused') return r
                        continue
                      }
                      const r = seat.command === undefined ? await window.canvas.spawn.sheet({ presetId: 'shell', cwd: values.cwd, title: seat.role }) : await window.canvas.spawn.sheet({ command: seat.command, cwd: values.cwd, title: seat.role })
                      if (r.kind === 'refused') return r
                    }
                    return { kind: 'spawned' }
                  })()
                : values.what.kind === 'teammate'
                  // M100. A chat AS a teammate: the id rides the create; main reads
                  // the brief from its roster and checks the places before the cwd.
                  ? beginNewChat({ cwd: values.cwd, title: values.title === '' ? (teammatesRef.current.find((t) => t.id === (values.what as { id: string }).id)?.name ?? '') : values.title, agentOptions: values.agentOptions, teammateId: (values.what as { id: string }).id })
                : window.canvas.spawn.sheet(buildSpawnRequest(values, presets))
          }
        })
        palette.openPalette()
      })
    },
    beginCreateGroup: (panelIds) => {
      if (mergedRef.current) return
      const present = panelIds.filter((id) => panelsRef.current.some((panel) => panel.rect.id === id))
      if (present.length < 2) return
      setInputMode({
        kind: 'text',
        label: `Name this ${present.length}-panel group…`,
        initial: '',
        submit: (value) => {
          const label = value.trim()
          if (label === '') { setInputMode(null); return }
          const number = nextGroupIdRef.current++
          setGroups((current) => [...current, {
            id: `g${number}`,
            label,
            colour: GROUP_COLOURS[(number - 1) % GROUP_COLOURS.length],
            panelIds: present
          }])
          selectOnly(null)
          setInputMode(null)
        }
      })
      palette.openPalette()
    },
    movePanelsToWorkspace,
    beginMovePanelsToNewWorkspace: (panelIds) => {
      setInputMode({
        kind: 'text',
        label: `Move ${panelIds.length} panel${panelIds.length === 1 ? '' : 's'} to a new workspace named…`,
        initial: '',
        submit: (value) => {
          const name = value.trim()
          // An empty trimmed value is a CANCEL, not "name this workspace the
          // empty string" — the same rule beginCreateWorkspace states, and
          // worse here: an empty name would round-trip to disk on a
          // workspace that now holds the user's panels, leaving every row
          // that names it blank with no way back short of deleting the
          // workspace those panels are in.
          if (name.length === 0) {
            setInputMode(null)
            return
          }
          // ONE call, not create-then-move: main mints the workspace inside
          // movePanels and defers the mint until the move is known non-empty,
          // so a name that turns out to move nothing leaves no empty
          // workspace behind. Composing it here out of create() + a move
          // would put that ordering in a second place and lose it.
          movePanelsToWorkspace(panelIds, { newName: name })
          setInputMode(null)
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without reopening, the mode would be set on a palette that is already
      // gone and the clear-on-close effect would wipe it — the same pairing
      // beginCreateWorkspace and beginRenamePreset both make.
      palette.openPalette()
    },
    beginLink: (id) => {
      linkMode.arm(id)
      // The overlay must be GONE: the completing gesture is a click on the
      // canvas, and a palette sitting over it would swallow that click as its
      // own outside-click dismissal. runRow already closes before running a
      // command, so this is belt and braces for the inspector's button, which
      // does not go through runRow at all.
      palette.closePalette()
    },
    removeLink: (from, to) => {
      setPanels((current) => {
        const next = removeLink(current, from, to)
        commitHistory(next)
        return next
      })
    },
    beginRelabelLink: (from, to, current) => {
      setInputMode({
        kind: 'text',
        label: 'Label this link',
        initial: current,
        submit: (value) => {
          setPanels((panelsNow) => {
            // Trimmed, and an empty result CLEARS the label rather than
            // storing '' — see setLinkLabel. Otherwise a user who wants a
            // label gone has no verb for it, and a blank label round-trips to
            // disk as a row they can neither see nor explain.
            const next = setLinkLabel(panelsNow, from, to, value.trim())
            commitHistory(next)
            return next
          })
          setInputMode(null)
        }
      })
      // The same reopen beginRenamePreset makes, for the same reason: the
      // overlay is closed BEFORE a row's command runs, so without this the
      // mode would be set on a palette that is already gone and the
      // clear-on-close effect would wipe it again.
      palette.openPalette()
    },

    /**
     * Masked token entry, gated the same way beginEditSetting's number edit
     * is: RE-ENTRANT, so a refusal from main (an unreachable network, a
     * malformed token) can reopen the same prompt with the reason on screen
     * rather than closing silently. The one deliberate difference from
     * beginEditSetting is `initial`, which stays '' on every call — see
     * InputMode's 'secret' doc comment in Palette.tsx for why a masked field
     * must never be re-seeded with what the user just typed, refusal or not.
     */
    beginSetCredential: (service) => {
      const label = findService(service)?.label ?? service
      const openEntry = (refused?: string): void => {
        setInputMode({
          kind: 'secret',
          label: refused
            ? `${label} token — ${refused}`
            : (findService(service)?.help ?? `Paste the ${label} token…`),
          initial: '',
          ...(refused ? { feedback: true as const } : {}),
          submit: (value) => {
            const jiraLines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
            const token = service === 'jira' && jiraLines.length === 3 ? JSON.stringify({ site: jiraLines[0], email: jiraLines[1], token: jiraLines[2] }) : value
            if (service === 'jira' && jiraLines.length !== 3) { openEntry('enter site URL, email, and API token on three lines'); return }
            void window.canvas.credential.set({ service, token }).then((res) => {
              if (!res.ok) {
                openEntry(res.reason)
                return
              }
              setInputMode(null)
              reloadCredentials()
            })
          }
        })
        // Palette.tsx closes the overlay BEFORE running a row's command, so
        // without this the mode would be set on a palette that is already
        // gone — the same pairing beginRenamePreset and beginEditSetting both
        // make, for the same reason, including on the refusal reopen.
        palette.openPalette()
      }
      openEntry()
    },
    verifyCredential: (service) => {
      // On SUCCESS, the reload is the only signal: the row's own title
      // already reads "Verify X (label)", and a stored, never-verified
      // credential shows the service's own label until this succeeds and
      // CredentialMeta.label updates to what the remote service actually
      // calls the account — a success dialog on top of that would be a
      // second, noisier way to say what the row itself is about to say.
      //
      // On FAILURE, that same silence is exactly wrong: runRow already
      // closed the palette before this ran, so a rejection reason computed
      // in main — "GitHub rejected the token — it may be revoked or lack
      // scope", the single most useful thing this verb can report — would
      // otherwise cross IPC and be dropped with the overlay already gone.
      // Surfaced the same way beginSetCredential's own refusal path already
      // demonstrates: reopen the palette in an input mode carrying the
      // reason, with feedback: true so it renders as an answer rather than a
      // hint. 'confirm' rather than 'secret' or 'text', because there is
      // nothing to type or correct here — only a fact to acknowledge, the
      // same shape deletePreset's question already reuses this mode for.
      const label = findService(service)?.label ?? service
      void window.canvas.credential.verify(service).then((res) => {
        if (!res.ok) {
          setInputMode({
            kind: 'confirm',
            label: `${label} verification failed — ${res.reason}`,
            initial: '',
            feedback: true,
            submit: () => {}
          })
          palette.openPalette()
          return
        }
        reloadCredentials()
      })
    },
    beginDeleteCredential: (service) => {
      // Gated, not instant — the same reason deletePreset and deleteWorkspace
      // above are: a delete row sat one Enter away from destroying a stored
      // credential, styled identically to every other row until the confirm
      // question is on screen.
      const label = findService(service)?.label ?? service
      setInputMode({
        kind: 'confirm',
        label: `Delete the stored ${label} token?`,
        initial: '',
        submit: () => {
          void window.canvas.credential.remove(service).then(reloadCredentials)
        }
      })
      // Same reason beginRenamePreset/deletePreset both do this.
      palette.openPalette()
    },

    /**
     * The palette's door onto a file panel: main owns the native open dialog,
     * so this is an invoke rather than anything the renderer can put on
     * screen itself.
     *
     * A null reply is a CANCEL and must mint nothing — the one outcome a
     * dialog has that a click does not, and the one an unchecked `then` would
     * turn into a panel pointed at the empty string. The camera's own centre
     * is the placement, exactly as a menu-driven spawn uses worldCentre():
     * there is no cursor to land under, because the gesture ended in a
     * separate window.
     */
    openFile: () => {
      void window.canvas.file.open().then((path) => {
        if (path === null) return
        openFilePanel(path, worldCentre())
      })
    },
    // M83. The project memory for the captured panel's repository — resolved
    // by MAIN (only it knows what a directory's repository root is), so the
    // node's subject is the same root `tc memory` writes under.
    openMemory: () => { void openMemoryPanel() },
    openWorkflow: (templateId) => { openWorkflowPanel(templateId) },
    openGithub: () => openGithubPanel(),
    reviewAcross: (id) => openReviewAcross(id),
    beginWatcher,
    openJira: () => openJiraPanel(),
    newNote: () => beginNewNote(),
    newChat: (backend) => { void beginNewChat(backend === undefined ? undefined : { backend }) },
    checkReadiness: recheckEnvironment,
    openStarter: applyStarter,
    saveWorkflow: async (templateId) => {
      const r = await saveWorkflowDraft(templateId)
      return r.kind === 'saved' ? { kind: 'ran', note: 'saved' } : { kind: 'refused', reason: r.reason }
    },
    stopWorkflow: (templateId) => stopWorkflowRun(templateId),
    // M184 (the critic, finding 1). `runWorkflow` answers `undefined` on
    // SUCCESS and a refusal SENTENCE on failure (it is the fire path's own
    // shape). The first cut read those the other way round, so the one door
    // with nobody watching reported a refusal for every run that started and
    // a success for every one that did not.
    runWorkflowNow: (templateId, caller) => {
      const refusal = runWorkflowNow(templateId, caller)
      return refusal === undefined ? { kind: 'ran' } : { kind: 'refused', reason: refusal }
    },
    testNode: (templateId, key) => testNodeNow(templateId, key),
    prepareFeedback: (says) => prepareFeedbackNow(says),
    exportCanvas: (path, withPixels) => exportCanvasFile(path, withPixels === 'with-pictures'),
    importCanvas: (path) => importCanvasFile(path),
    exportPack: (path) => exportPackFile(path),
    importPack: (path) => importPackFile(path),
    markPresetRead: (id) => markPresetReadNow(id),
    markWorkflowRead: (templateId) => markWorkflowReadNow(templateId),
    addNote: (form, text) => addNote(form, text),
    setNoteText: (panelId, text) => setNoteText(panelId, text),
    setNoteTint: (panelId, tint) => setNoteTint(panelId, tint),
    addImage: (path) => addImageFromPath(path),
    replaceImage: (panelId, path) => replaceImagePanel(panelId, path),
    openPreview: (url) => openPreviewNow(url),
    bindPreview: () => bindPreviewNow(),
    // M202 (D07). ONE action, four doors — the card's verb, the palette row,
    // the agent line and an action node all land here, the way M197 made
    // every Start work door land on one. The panel is resolved to its ITEM
    // here rather than by each door, so a card whose item left the board
    // refuses in one sentence instead of four.
    reviewTask: (panelId) => {
      const panel = panelsRef.current.find((p) => p.rect.id === panelId)
      if (panel === undefined) return { kind: 'refused', reason: `there is no panel ${panelId} on this canvas` }
      if (!isWorkPanel(panel)) return { kind: 'refused', reason: `${panelId} is not a work card — a task review needs one` }
      return boardVerbsRef.current?.review?.(panel.work.itemId) ?? { kind: 'refused', reason: 'the canvas is not ready yet' }
    },
    // M203 (D08). Canvas owns every fact membership reads (the runs, the live
    // cwds, the worktree rows), so this delegates the way `reviewTask` does
    // rather than widening this hook's deps with four more.
    showTask: (panelId) => boardVerbsRef.current?.show?.(panelId) ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
    // M204 (D08). The same delegation, for the same reason.
    showRelated: (panelId) => boardVerbsRef.current?.related?.(panelId) ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
    arrangeTask: (panelId) => boardVerbsRef.current?.arrange?.(panelId) ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
    setPreviewWidth: (device) => setPreviewWidthNow(device),
    capturePreview: () => capturePreviewNow(),
    startDevServer: (script) => startDevServerNow(script),
    saveWorkflowCopy: async (templateId) => {
      const r = await saveWorkflowCopyDraft(templateId)
      return r.kind === 'refused' ? { kind: 'refused', reason: r.reason } : { kind: 'ran', note: r.name === undefined ? 'saved as a copy' : `saved as ${r.name}` }
    },
    // M182. The binding's Update as ONE member, so the text mode's submit and
    // a check drive the same path: every selected panel must carry the same
    // template's binding with a key the record holds, once each.
    updateBoundTemplate: async (panelIds) => {
      if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
      const chosen = panelsRef.current.filter((p) => panelIds.includes(p.rect.id) && (isTerminalPanel(p) || isChatPanel(p)))
      const ids = new Set(chosen.map((p) => p.templateBinding?.templateId))
      const templateId = chosen[0]?.templateBinding?.templateId
      if (chosen.length === 0 || templateId === undefined || ids.size !== 1 || ids.has(undefined)) return { kind: 'refused', reason: 'every selected panel must have been minted by the same template — save as a new template instead' }
      const bound = allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
      if (bound === undefined) return { kind: 'refused', reason: `the template these panels came from is gone — save as a new template` }
      if (isBuiltInTemplate(bound.id)) return { kind: 'refused', reason: `${bound.name} is built in — save as a new template (a copy)` }
      if (getDraft(bound.id)?.dirty === true) return { kind: 'refused', reason: `the diagram holds unsaved edits to ${bound.name} — save or reload them first` }
      const seen = new Set<string>()
      let next: PersistedTemplate = bound
      const centre = chosen.reduce((acc, p) => ({ x: acc.x + (p.rect.x + p.rect.w / 2) / chosen.length, y: acc.y + (p.rect.y + p.rect.h / 2) / chosen.length }), { x: 0, y: 0 })
      for (const p of chosen) {
        const key = p.templateBinding!.key
        if (seen.has(key)) return { kind: 'refused', reason: `two panels are bound to ${key} — keep one of them` }
        seen.add(key)
        if (!next.nodes.some((n) => n.key === key)) return { kind: 'refused', reason: `${bound.name} has no node ${key} any more — save as a new template` }
        const moved = moveNode(next, key, Math.round(p.rect.x + p.rect.w / 2 - centre.x), Math.round(p.rect.y + p.rect.h / 2 - centre.y))
        if (moved.kind === 'refused') return moved
        next = moved.template
        const node = next.nodes.find((n) => n.key === key)!
        if (node.kind === 'terminal' || node.kind === 'chat') {
          const patch: Record<string, unknown> = isChatPanel(p)
            ? { cwd: p.chat.cwd, ...(p.title === undefined ? {} : { title: p.title }) }
            : isTerminalPanel(p) ? { cwd: getLiveSession(p.rect.id)?.cwd ?? p.spec.cwd, ...(p.title === undefined ? {} : { title: p.title }), ...(p.spec.command === undefined ? { presetId: 'shell' } : { command: p.spec.command, args: [...(p.spec.args ?? [])] }) } : {}
          const set = configureNode(next, key, patch)
          if (set.kind === 'refused') return set
          next = set.template
        }
      }
      const result = await window.canvas.template.save(next, bound.revision ?? 0)
      if (result.kind === 'stale') return { kind: 'refused', reason: result.reason }
      resetDraft(bound.id, result.template)
      reloadTemplates()
      return { kind: 'ran', note: `${bound.name} updated to revision ${result.template.revision ?? 0}` }
    },
    // M182. ONE door for every editor: the store's `applyDraftOp` over the
    // saved record (`allTemplates`, so a built-in can be edited into a copy).
    editWorkflow: (templateId, op) => {
      if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only' }
      const saved = allTemplates(templateRowsRef.current).find((t) => t.id === templateId)
      const r = applyDraftOp(templateId, saved, op)
      return r.kind === 'ok' ? { kind: 'ok' } : r
    },
    beginWorkflowEdit: (templateId, verb) => {
      const labels = { add: 'add <kind> — terminal, chat, pool, orchestrator or collect', move: 'move <key> <dx> <dy>', set: 'set <key> <field> <value>', remove: 'remove <key>', edge: 'edge <from> <to> <trigger>', unedge: 'unedge <from> <to>' }
      setInputMode({
        kind: 'text', label: `${labels[verb]} — on ${allTemplates(templateRowsRef.current).find((t) => t.id === templateId)?.name ?? templateId}`, initial: '',
        submit: (value) => {
          const words = value.trim().split(/\s+/).filter((w) => w !== '')
          // The same plan line the agent door takes, so the two doors cannot differ.
          void self.runAgentPlan(`workflow-${verb} ${templateId} ${words.join(' ')}`).then((reply) => {
            if (reply.kind === 'refused') { setInputMode({ kind: 'text', label: reply.reason, initial: '', submit: () => setInputMode(null) }); palette.openPalette() }
            else setInputMode(null)
          })
        }
      })
      palette.openPalette()
    },
    openAsChat: (id) => openAsChat(id),
    openInTerminal: (id) => openInTerminal(id),
    // M76. The ONE answer verb every surface calls; main clears every
    // surface through its permission-answered event. A deny carries a
    // message the agent reads.
    // M98. `scope` rides only when given (an `undefined` key crosses IPC
    // as present); a scoped answer refreshes the store's grants mirror.
    answerApproval: (id, requestId, allow, scope) => {
      void window.canvas.agentSession.answer({ id, requestId, answer: allow ? { allow: true } : { allow: false, message: DENY_MESSAGE }, ...(scope === undefined ? {} : { scope }) })
        .then(() => { if (scope !== undefined) refreshChatGrants(id) })
    },
    setPresetWorktree: (id, on) => {
      // Main owns the store and refuses a built-in; the reload is what makes
      // the toggle row's own title flip.
      void window.canvas.preset.setWorktree(id, on).then(reloadPresets)
    },
    beginRemoveWorktree: (id) => {
      // Gated, for deletePreset's reason. The question names the BRANCH,
      // because that is what the user would recognise; the path is in the
      // row's subtitle they just read. A dirty tree is refused by git itself
      // and the refusal comes back as a note in the palette's input mode
      // rather than as silence.
      const row = worktreeRows.find((w) => w.id === id)
      const branch = row?.branch ?? id
      setInputMode({
        kind: 'confirm',
        label: `Remove worktree “${branch}”? Its branch stays; git refuses if the tree is dirty.`,
        initial: '',
        submit: () => {
          void window.canvas.worktree.remove(id).then((result) => {
            reloadWorktrees()
            if (result.kind === 'refused' || result.kind === 'failed') {
              // Shown, never swallowed: a remove that did nothing and said
              // nothing reads as the row being broken. Input mode is the one
              // surface the palette already has for a sentence the user must
              // read; `submit` closes it.
              setInputMode({ kind: 'confirm', label: `Not removed — ${result.reason}`, initial: '', submit: () => {} })
              palette.openPalette()
            }
          })
        }
      })
      palette.openPalette()
    },
    revealWorktree: (id) => {
      void window.canvas.worktree.reveal(id)
    },
    beginClearScrollback: () => {
      // Gated, for deletePreset's reason: a destructive row still runs on one
      // Enter. The question says what goes, because "scrollback" is jargon
      // and the user may have found this row by typing "clear".
      setInputMode({
        kind: 'confirm',
        label: 'Clear every panel’s recorded output from disk? Restored panels will show nothing until they run again.',
        initial: '',
        submit: () => {
          void window.canvas.scrollback.clear()
        }
      })
      palette.openPalette()
    }    ,
    // M96. THE VERB LINE. The palette's text mode takes `verb args; verb
    // args`; the plan is built against the live canvas (M81's facts plus each
    // session's agent kind), refused by name with its fix on the same line
    // (the palette's `feedback` idiom), confirmed once when any step is
    // destructive, and run by the executor below — the ONLY place a verb's
    // meaning lives. The table knows what a verb IS; this knows what it DOES.
    runAgentPlan: (line, caller) => runAgentPlan(line, facts(), (step) => execute(step, caller), caller),
    beginRunVerb: () => {
      const open = (initial: string, refused?: string): void => {
        setInputMode({
          kind: 'text',
          // The mode names itself on the line (the critic could not tell it from
          // Rename), and Enter is `run`, not `save`.
          label: refused ? `Run a verb — ${refused}` : 'Run a verb — e.g. focus n3 · type n3 hello · close n3; several with ;',
          verb: 'run',
          initial,
          ...(refused ? { feedback: true as const } : {}),
          submit: (line) => {
            const built = buildPlan(parsePlanLine(line), facts())
            if (built.kind === 'refused') { open(line, `${built.reason} — ${built.fix}`); palette.openPalette(); return }
            const run = (acknowledged: boolean): void => {
              void runPlan(built.plan, execute, { acknowledged }).then((report) => {
                // The report on the same line, in the state vocabulary; a stop
                // re-prompts with the line so it can be corrected.
                const stopped = report.steps.some((r) => r.kind === 'refused')
                const notes = report.steps.filter((r) => r.kind === 'ran' && r.note !== undefined).map((r) => (r as { note: string }).note).join(' · ')
                open(stopped ? line : '', `${report.summary}${notes === '' ? '' : ' · ' + notes}`)
                palette.openPalette()
              })
            }
            if (planIsDestructive(built.plan)) {
              setInputMode({
                kind: 'confirm',
                label: `${describePlan(built.plan).join(' · ')} — run it?`,
                initial: '',
                submit: () => run(true)
              })
              palette.openPalette()
              return
            }
            run(false)
          }
        })
      }
      open('')
      palette.openPalette()
    },
    // M97. The Auto verbs: main starts and stops; the refusal comes back by
    // name and is shown on the palette's line rather than swallowed.
    startAuto: (id, mode, task) => {
      const begin = (t?: string): void => {
        void window.canvas.agentSession.autoStart({ id, mode, ...(t === undefined ? {} : { task: t }) }).then((r) => {
          if (r.kind === 'refused') { setInputMode({ kind: 'text', label: `auto refused — ${r.reason}`, initial: '', feedback: true, submit: () => {} }); palette.openPalette() }
        })
      }
      if (mode === 'custom' && task === undefined) {
        setInputMode({ kind: 'text', label: 'The task, in a sentence…', initial: '', submit: (v) => { if (v.trim() !== '') begin(v) } })
        palette.openPalette()
        return
      }
      begin(task)
    },
    stopAuto: (id) => { void window.canvas.agentSession.autoStop(id) },
    // M103. The page door: a URL or a bare host in the palette's text mode
    // (a bare host gets http://, a dev server being the ordinary case), a
    // refusal by name kept on the feedback line for correction, and the
    // panel minted at the world centre through Canvas.tsx's minter — the
    // same shape every typed door here takes.
    beginBrowser: () => {
      const ask = (initial: string, feedback?: true): void => setInputMode({
        kind: 'text',
        label: feedback === undefined ? 'Open a page — a URL, or a host like localhost:3000' : 'Try a URL or a host — http(s) pages only',
        initial,
        ...(feedback === undefined ? {} : { feedback }),
        submit: (value) => {
          const normalised = normaliseTypedUrl(value)
          if (normalised.kind === 'refused') { ask(value, true); return }
          setInputMode(null)
          openBrowserPanel(normalised.url)
        }
      })
      ask('http://localhost:3000')
    },
    // M100. The roster's door: the navigator's pane, chosen the way the dock chooses it.
    openTeammates: () => chooseNavigator('teammates')
    ,
    // M106. The flip is Canvas's view state; the row reaches it through the same event the menu sends.
    toggleFlip: () => toggleFlip(),
    // M113. The dedupe lives in upsertWorkItem; the id the caller gets back is
    // the SURVIVING one, which for a second `Add to board` is the first's.
    addWorkItem: (item) => {
      const id = item.id ?? `wi${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
      const next = upsertWorkItem(workItemsRef.current ?? [], { ...item, id }, Date.now())
      setWorkItems(next)
      // M197. The MIRROR is made current here, not left to the next render.
      // `workItemsRef.current = workItems` is a render-time assignment, so a
      // caller that adds an item and acts on it in the same tick — which is
      // exactly what the start flow's submit does, minting the typed task and
      // then starting it — reads a list the new item is not in yet, and the
      // start refuses with `no work item is called <id>`. The render-time
      // assignment then writes this same value again; making it current
      // sooner cannot make it wrong.
      workItemsRef.current = next
      // The card's rail label is the panel's title, stamped at mint; an update through the dedupe moves it too, or the rail reads yesterday's title beside today's card.
      setPanels((current) => current.map((p) => { const wid = isWorkPanel(p) ? p.work.itemId : undefined; const rec = wid === undefined ? undefined : next.find((i) => i.id === wid); return rec === undefined || p.title === rec.title ? p : { ...p, title: rec.title } }))
      const identity = item.key === undefined ? undefined : next.find((i) => i.source === item.source && i.key === item.key)
      return identity === undefined ? id : identity.id
    },
    /**
     * M197 (D05). START WORK — the ONE action, and every door is a route
     * into it: the palette row, the card's menu, the Teammates-pane drop and
     * the agent's `dispatch` verb all land here.
     *
     * It asks only for what it cannot derive. `startWorkNeeds` answers which
     * of the triple is missing, and an EMPTY answer dispatches with NO SHEET
     * at all — which is what keeps M114's one-gesture drop a one-gesture
     * drop. The sheet opens only when something is genuinely unknown.
     *
     * The task is minted here when there is none (the typed door), through
     * the SAME `addWorkItem` dedupe every other board door takes, so a start
     * on an item already on the board updates it rather than minting a twin.
     */
    beginStartWork: (opts) => {
      const openSheet = (title: string, titleFixed: boolean, wanted: string | null, itemId: string | undefined, teammateId: string | undefined): void => {
        setInputMode({
          kind: 'start',
          label: 'Start work',
          verb: 'start',
          initial: '',
          submit: () => undefined,
          start: {
            title,
            titleFixed,
            wanted,
            teammates: teammatesRef.current ?? [],
            ...(teammateId === undefined ? {} : { teammateId }),
            repositories: (id) => window.canvas.board.repositories({ teammateId: id }),
            submit: async (choice) => {
              // The task is minted only once the triple is answered: a sheet
              // the user escapes must leave no card behind, the same rule
              // M149 reached for `New workspace from` (an Escape used to
              // strand the user in an empty workspace).
              const id = itemId ?? self.addWorkItem({ source: 'typed', title: choice.title, state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'] })
              const outcome = await self.startWork(id, choice.teammateId, choice.root)
              return outcome.kind === 'started' ? { kind: 'started' } : { kind: 'refused', reason: outcome.reason }
            },
            openTeammates: () => chooseNavigator('teammates')
          }
        })
        palette.openPalette()
      }
      const item = opts?.itemId === undefined ? undefined : (workItemsRef.current ?? []).find((i) => i.id === opts.itemId)
      const title = item?.title ?? opts?.title ?? ''
      const wanted = item?.key === undefined ? null : repoOfKey(item.key)
      const teammateId = opts?.teammateId
      // With no teammate chosen there is nothing to read and nothing to
      // derive: the sheet opens on the question it can answer.
      if (teammateId === undefined || item === undefined) { openSheet(title, item !== undefined, wanted, item?.id, teammateId); return }
      void window.canvas.board.repositories({ teammateId }).then((answer) => {
        const repos: readonly StartWorkRepo[] = answer.kind === 'repos' ? answer.repos : []
        const needs = startWorkNeeds({ title, teammateId }, { teammates: teammatesRef.current ?? [], repos, wanted })
        if (needs.length > 0) { openSheet(title, true, wanted, item.id, teammateId); return }
        void self.startWork(item.id, teammateId)
      })
    },
    /** M197. The executor, unchanged in shape: the same `dispatchWorkItem` every door already ran through, now answering. */
    startWork: async (itemId, teammateId, root): Promise<StartWorkOutcome> =>
      (await boardVerbsRef.current?.dispatch?.(itemId, teammateId, root)) ?? { kind: 'refused', reason: 'the canvas is not ready yet' },
    beginNewWorkItem: () => {
      setInputMode({
        kind: 'text',
        label: 'New work item — a title',
        initial: '',
        submit: (value) => {
          const refusal = workItemRefusal(value)
          if (refusal !== null) { setInputMode({ kind: 'text', label: refusal, initial: value, submit: () => undefined }); return }
          const id = `wi${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
          setWorkItems((current) => upsertWorkItem(current, { id, source: 'typed', title: value.trim(), state: WORK_ITEM_STATES[0] as PersistedWorkItem['state'] }, Date.now()))
          setInputMode(null)
        }
      })
      palette.openPalette()
    },
    // M114/M115. Installed by Canvas; a verb asked before install is a no-op, never a throw.
    dispatchWorkItem: (itemId, teammateId, root) => boardVerbsRef.current?.dispatch?.(itemId, teammateId, root),
    openPr: (itemId) => boardVerbsRef.current?.openPr?.(itemId),
    commentPr: (itemId) => boardVerbsRef.current?.commentPr?.(itemId),
    markDone: (itemId) => boardVerbsRef.current?.markDone?.(itemId),
    // M116. A view, like openTeammates.
    openBoard: () => chooseNavigator('board'),
    // M127/M128. The skill card's door — the drop, and a click on a card.
    // Canvas owns the mint (it owns the panel array and the id counter); this
    // is the pass-through that gives every caller one name to reach it by.
    openSkillPanel: (scope, name, world) => openSkillPanel(scope, name, world),
    // M123. The by-hand update check. The answer lands on the palette's
    // feedback line (the shape beginSetCredential's refusal already uses:
    // reopen the palette in an input mode carrying the sentence, with
    // feedback so it renders as an answer rather than a hint), and the store
    // remembers it for the environment row and the launcher. On `newer` the
    // line's verb is Enter — `Open release` through links.open, main's own
    // door for a url, never a download: auto-swap is declined by name for
    // an unsigned build. A second ask while one is in flight is a no-op
    // (the store refuses it), so a double-tap on the row is one GET.
    checkForUpdates: () => {
      if (getUpdateState().checking) return
      beginUpdateCheck()
      void window.canvas.update.check().then((result) => {
        setUpdateResult(result)
        const sentence = updateSentence(getUpdateState())
        if (result.kind === 'newer') {
          const url = result.url
          setInputMode({ kind: 'confirm', label: `${sentence} — Open release`, initial: '', feedback: true, submit: () => { void window.canvas.links.open({ panelId: '', target: url }); setInputMode(null) } })
        } else {
          setInputMode({ kind: 'confirm', label: sentence, initial: '', feedback: true, submit: () => setInputMode(null) })
        }
        palette.openPalette()
      }).catch((e: unknown) => {
        // The invoke itself failed (no handler in an old main): the third
        // state, never a hang with the row saying `checking…` forever.
        setUpdateResult({ kind: 'could-not-check', reason: e instanceof Error ? e.message : 'the update check did not answer' })
      })
    },
    // M120. The sandbox flag rides the create; the backend by NAME from the row, absent is claude.
    newSandboxChat: (backend) => { void beginNewChat({ sandbox: true, ...(backend === DEFAULT_BACKEND ? {} : { backend }) }) },
    // M122. The chat store's bus; the panel scrolls the turn's row into view.
    scrollChatTurn: (panelId, turnIndex) => scrollToTurn(panelId, turnIndex)

  }); return self }, [recheckEnvironment, applyStarter, saveWorkflowDraft, saveWorkflowCopyDraft, prepareFeedbackNow, exportCanvasFile, importCanvasFile, exportPackFile, importPackFile, markPresetReadNow, markWorkflowReadNow, testNodeNow, addNote, setNoteText, setNoteTint, addImageFromPath, replaceImagePanel, openPreviewNow, bindPreviewNow, setPreviewWidthNow, capturePreviewNow, startDevServerNow, discoverProject, stopWorkflowRun, runWorkflowNow, resetViewport, fitAll, fitSelection, selectedIdsRef, centreOn, selectAndRaise, presetRows, promptRows,
       reloadPresets, palette.openPalette, palette.closePalette,
       palette.capturedId, reloadPrompts, commitHistory, reloadSettings,
       settingRows, switchWorkspace, reloadWorkspaces, onClosePanel,
       onSelectPanel, openReview, linkMode, reloadCredentials,
       movePanelsToWorkspace, toggleMerged, broadcastInput, broadcastReady,
       openFilePanel, openJiraPanel, worldCentre, beginNewNote, beginNewChat, openAsChat, openInTerminal, reloadWorktrees,
       lockPanel, unlockPanel, pinPanel, unpinPanel, maximisePanel, restorePanel, beginAnnotate,
       worktreeRows, setInputMode, goToViewport, cameraBack, cameraForward, bookmarksRef, setBookmarks, viewportRef,
       registry, panelsRef, restartWithSpec, onClosePanel, lockPanel, unlockPanel, pinPanel, unpinPanel, maximisePanel, restorePanel, teammatesRef, chooseNavigator, openBrowserPanel, openSkillPanel, toggleFlip, workItemsRef, setWorkItems, boardVerbsRef, createObjectNow])
}
