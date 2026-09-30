import type { Connectors } from '../useConnectors'
import type { FlowchartIO } from '../useFlowchartIO'
import type { FlowchartVerbs } from '../useFlowchartVerbs'
/**
 * The contract every palette-action slice is written against.
 *
 * `PaletteActionsDeps` is what Canvas hands the hook. `ActionCtx` is that plus
 * the two things the slices share: the object under construction, and the one
 * helper two domains both need.
 *
 * WHY `self` IS AN OBJECT AND NOT A GETTER. Dozens of verbs call a sibling verb
 * — the executor reaches nearly all of them, `beginStartWork` calls
 * `startWork`, `beginSaveTemplate` calls `updateBoundTemplate`. Before the split
 * those were `self.x(…)` against the literal being built, which works because a
 * property body only runs long after the literal exists. The split keeps exactly
 * that: `usePaletteActions` creates ONE empty object, puts it on the ctx, and
 * `Object.assign`s each slice's properties onto it. Every `self.x(…)` call site
 * therefore moved verbatim, and the finished object is the same reference the
 * slices closed over.
 *
 * A getter (`ctx.self()`) would have worked too and been marginally safer, but
 * it would have rewritten every one of those call sites — including the exact
 * strings `verify:deck deck.origin.1` and `verify:draft draft.door.4` read out
 * of the source. Moving bodies untouched is what makes this split reviewable.
 *
 * The identity matters beyond tidiness: `Palette.tsx` memoizes its command list
 * on the actions object, so the hook must keep returning ONE object from ONE
 * `useMemo` with the dependency array it has always had.
 */

import { type CreationResult } from '@shared/verb-table'
import { type PreviewBinding } from '@shared/preview'
import { type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { AgentOptions } from '@shared/cost'
import type { ToolScope } from '@shared/toolbox'
import { type AgentPlanCaller } from '@shared/plan'
import type { SpawnResult } from '@shared/ipc-contract'
import { type PersistedWorkItem } from '@shared/work-items'
import type { Registry } from '@renderer/session/session-registry'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import type { BoardVerbs } from '../useBoardVerbs'
import { type AgentBackend } from '@shared/agent-session'
import type { PersistedTemplate } from '@shared/templates'
import { type Panel } from '@renderer/panels/panels'
import { type CanvasGroup } from '@renderer/groups/groups'
import type { PresetRow, PromptRow } from '@renderer/palette/commands'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { InputMode } from '@renderer/palette/Palette'
import type { SettingRow, WorktreeListRow } from '@shared/ipc-contract'
import type { LinkMode } from '../useLinkMode'
import type { Point, WorldRect } from '../viewport'
import type { Viewport } from '../viewport'
import type { PersistedBookmark } from '@shared/layout-schema'
import type { PersistedTeammate } from '@shared/teammates'
import type { NavigatorPane } from '@renderer/shell/useShellChrome'
import type { Discovery as PreviewDiscovery } from '@shared/preview'
import type { PaletteActions } from '@renderer/palette/commands'

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
  /** M250. A .docx into a new, unreviewed note — main converts, the canvas opens the result. */
  importDocxFile: (path?: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M253. A pack's two doors, and the two "I've read this" statements. */
  exportPackFile: (path?: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  importPackFile: (path?: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M255. The sample pack, written by main and read through the ordinary pack preview. */
  importSamplePackFile: () => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  markPresetReadNow: (id: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M188. Test one node: the same executor the workflow's own run takes. */
  testNodeNow: (templateId: string, key?: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M388. The flowchart's verbs — the Canvas half (useFlowchartVerbs), memoised there so this memo is not rebuilt per render. */
  flowchartVerbs: FlowchartVerbs
  /** M389. The connector verbs — a STABLE facade over useConnectors (whose own object changes with every route), read through a ref at use. */
  connectorVerbs: Pick<Connectors, 'connect' | 'patch' | 'remove'>
  /** M391. Mermaid in and out, and auto-layout. */
  flowchartIO: FlowchartIO
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
  /** M268. Canvas ↔ Orchestration center page. */
  setCenterView: (view: 'canvas' | 'orchestration') => void
  /** M106. */
  toggleFlip: () => void
  /** M113. The board's records (a ref: a verb reads the list once) and their setter. Records, not layout: not in history, like runs and bookmarks. */
  workItemsRef: RefObject<PersistedWorkItem[]>
  setWorkItems: Dispatch<SetStateAction<PersistedWorkItem[]>>
  /**
   * M114/M115. The verbs Canvas installs AFTER the memo is built (they close
   * over the chat and broker doors that live there); a ref rather than four
   * deps so the memo does not rebuild when Canvas re-creates them.
   *
   * The SAME type `useBoardVerbs` fills and `Canvas.tsx` mints, never a
   * hand-copy of its members. A second spelling stays assignable to the first
   * after the first gains a member, so a new verb would simply be invisible
   * here — no red suite, no type error, a door that is only declared.
   */
  boardVerbsRef: RefObject<BoardVerbs>
}

/**
 * What a slice is given. The deps Canvas passes, plus:
 *
 * - `self` — the object being assembled, for the verbs that call siblings.
 *   Empty while the slices are constructed; complete before any of them runs.
 * - `intoNewWorkspace` — shared by `workspaceFromTemplate` and the spawn
 *   sheet's `instantiate` seam, which is why it sits here rather than in
 *   either slice.
 */
export interface ActionCtx extends PaletteActionsDeps {
  self: PaletteActions
  intoNewWorkspace: (template: PersistedTemplate, values: Record<string, string>) => Promise<SpawnResult>
}
