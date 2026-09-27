import type { SnapshotMeta, ClipboardFile } from '@shared/ipc-contract'
import type { CheckOutputRead } from '../shared/check-output'
import type { LastExit } from '../shared/persistence'
import { INERT_JOBS, type JobHandlers } from './job-recovery'
import type { RelayClient } from './relay/relay-client'
import { RELAY_SESSION_ID } from '../shared/relay-protocol'
import { INERT_TASKS, type TaskHandlers } from './task-evidence'
import type { UsageRow } from '@shared/run-ledger'
import type { SkillWriteRequest, SkillCreateRequest, SkillRenameRequest, SkillDeleteRequest } from '@shared/ipc-contract'
import type { PreviewCaptureResult, AssetPutResult, NodeFetchResult, PortableWriteResult, PortableReadResult } from '@shared/ipc-contract'
import type { PackHandlers } from './pack-handlers'
import type { GithubPublishResult } from '@shared/ipc-contract'
import type { Discovery as PreviewDiscovery } from '@shared/preview'
import type { Trail } from '@shared/skill-trail'
import type { SkillWriteResult } from '@shared/skill-edit'
import { ipcMain, dialog, type WebContents, type BrowserWindow } from 'electron'
import type { WatcherCreateRequest, WatcherCreateResult, WatcherStateEvent, GithubListResult } from '@shared/ipc-contract'
import type { AgentSessionSpec, AgentCreateResult, SendAnswer, AgentSessionSnapshot, AgentTranscriptResult, AgentImportRequest, AutoStartRequest, AutoStartResult, AgentImportResult, ChatAttachment, ClipboardImage, QueueEditRequest, CorrectionAnswer } from '../shared/agent-session'
import type { PermissionAnswer } from '../shared/transcript'
import { IPC, IPC_EVENTS, type SpawnRequest, type SpawnResult } from '../shared/ipc-contract'
import { INERT_ENV_REPORT, type EnvReport } from '../shared/env-report'
import { INERT_LINKS, type LinkHandlers } from './link-open'
import type { BrowserHandlers } from './browser-read'
import type { ImageResult, StarterFiles } from '../shared/starter'
import type { TemplateSaveResult } from '../shared/templates'
import { incomingWorkflowGraphSchema, graphProblems } from '../shared/workflow-graph-schema'
import type { BrowserReadRequest } from '../shared/browser-panel'
import type { BoardLaneRequest, BoardLaneResult, BoardOpenPrRequest, BoardOpenPrResult, BoardCommentRequest, BoardCommentResult, PanelSearchResult, UpdateResult , PoolStartRequest, PoolStartResult, BoardRepositoriesResult } from '../shared/ipc-contract'
import type { LaneStatus } from '../shared/review'
import type { EventRow, RunRow, TimelineFilter, TimelineRead } from '../shared/run-ledger'
import type {
  PanelId,
  PanelSpec,
  PtyResizeRequest,
  PtyWriteRequest
} from '../shared/types'
import type { CanvasState } from '../shared/layout-schema'
import type { PersistedTemplate } from '../shared/templates'
import type { PersistedTeammate } from '../shared/teammates'
import type { PersistedRoutine } from '../shared/routines'
import type { Shelf } from '../shared/skills'
import type { PresetTemplate, SessionBackendInfo, PresetListRow, CapturedPanel, MergedWorkspace, FileReadRequest, FileWriteRequest, FileCreateRequest, ToolboxReadRequest, ToolboxPermissionsRequest, WorktreeListRow, WorktreeRemoveResult } from '../shared/ipc-contract'
import { INERT_EXPORTERS, type Exporters } from './export'
import { INERT_TOOLS, type ToolHandlers } from './tool-generate'
import type { ReviewSubject, ReviewDiffRequest, ReviewCommitRequest, ReviewCommitResult, ReviewDiscardRequest, ReviewDiscardResult } from '../shared/review'
import type { DeckPdfExportRequest, PanelTextExportRequest } from '../shared/export'
import type { PtyManager } from './pty-manager'
import { expandTilde } from './pty-manager'
import type { LayoutStore } from './layout-store'
import type { PromptListRow } from './prompts'
import type { PluginListResult } from './plugin-list'
import type { PluginDetailsResult } from '@shared/skills'
import { SETTINGS, type SettingValue } from '../shared/settings-schema'
import type { ReviewEngine } from './review-engine'
import type { CredentialStore } from './credential-store'
import { accountOfCredentialKey } from '../shared/credential-schema'
import type { AccountLoginResult, AccountLogoutResult, AccountSessionMeta, AccountStatus, AccountUseResult, ShareListResult, ShareMemberResult, ShareMembersResult, ShareResult } from '../shared/account'
import type { TeamAskRow } from '../shared/team-asks'
import type { TeamAskAnswerRequest } from '../shared/ipc-contract'
import { parseRendererOp, parseWorkspaceRole, type CanvasOp, type CanvasSharedView, type SharedTextOpen, type Verdict, type WorkspaceRole } from '../shared/canvas-ops'
import { parseTextCursor, type LocalPresence, type PresenceRoster } from '../shared/presence'
import { OBSERVING_MODE, type TeamListResult, type TeamObserveRequest } from '../shared/team'
import { verifyCredential, createHttpsFetcher } from './credential-verify'
import {
  commentOnWorkItem,
  createJiraRequester,
  listAssignedWorkItems,
  listWorkItemTransitions,
  transitionWorkItem,
  verifyJiraCredential
} from './jira-client'
import type { FileWatchers } from './file-watch'
import { readDir } from './fs-tree'
import type { ToolboxCache } from './toolbox-cache'
import { createToolboxDoor } from './toolbox-door'
import { readPermissionRules, resolveToolboxHome } from './toolbox-read'
import { resolveCwd } from './pty-manager'
import { writeFile } from './file-write'
import { createFile } from './file-create'
import { sampleMachineCosts } from './machine-cost'
import type { MachineCostTarget } from '../shared/machine-cost'
import { writeDiagnosticsBundle } from './diagnostics-export'
import type { DiagnosticsSnapshot } from '../shared/ipc-contract'
import { INERT_KIT, type KitHandlers } from './kit'
import type { EditorTarget } from '../shared/editor-open'
import type { IntegrateRequest } from '../shared/integration'

/**
 * The preset AND prompt mutations the palette drives, handed in from
 * main/index.ts because they need pieces only that module owns — the
 * availability probe, the menu rebuild, the window to push PRESET_DEFAULT at,
 * and the layout store. Kept as an explicit parameter rather than reached for
 * as module state, the same dependency-injection posture
 * ptyManager/layoutStore/getBackendInfo already take. Named PaletteHandlers,
 * not PresetHandlers, since M5b's prompt library is the same "the palette
 * asks main" surface rather than a fifth constructor argument.
 */
export interface PaletteHandlers {
  list(): PresetListRow[]
  rename(id: string, name: string): boolean
  remove(id: string): boolean
  setDefault(id: string): void
  /**
   * A palette pick. Main answers by sending PRESET_SPAWN, exactly as a menu
   * pick does, so the two cannot drift apart. M253: answers the refusal
   * sentence when it spawns nothing (an unread pack preset), null when it sent.
   */
  spawn(id: string): string | null
  /** M253. "I've read this": drops an imported preset's mark and rebuilds the menu. */
  markPresetReviewed(id: string): boolean
  /**
   * The inspector's save. Handed in for the same reason `spawn` is: minting a
   * preset needs the layout store and a menu rebuild, both of which are
   * main/index.ts's.
   */
  savePanel(captured: CapturedPanel): void
  /** M37. See IPC.PRESET_SET_WORKTREE. */
  setWorktree(id: string, on: boolean): boolean
  /**
   * M65. The spawn sheet's request: resolve a preset (absent command stays
   * absent) or a typed command into a template, refuse a directory that is
   * not there, and send PRESET_SPAWN. Main's, so the sheet and the menu
   * spawn through one path.
   */
  spawnWith(req: SpawnRequest): SpawnResult
  /** M65. The last twelve spawn directories, newest first. */
  recentDirectories(): string[]
  /** M262. When each of those was last used; absent for one recorded before M262. */
  recentDirectoryUsed?(): Record<string, number>
  requestReset(): void
  listPrompts(cwd: string | null): PromptListRow[]
  savePrompt(name: string, body: string): void
  /** M80. Templates: the list (built-ins first), a save, a delete that refuses a built-in. */
  /** M80. The preset's resolved template, or null. */
  presetTemplate(id: string): PresetTemplate | null | { refused: string }
  /** M83. The project memory, for the node and the chat's context. */
  /** M89. The broker's audit rows, newest first. */
  brokerAudit(limit: number, service?: string): { rows: unknown[]; skipped: number }
  /** M88. The GitHub work list. */
  githubList(panelId?: string): Promise<GithubListResult>
  /** M85. Every `.md` under the vault root. */
  vaultRead(root: string): { root: string; notes: unknown[]; skipped: number; reason?: string }
  /** M93. */
  snapshotList(): SnapshotMeta[]
  /** M142. The run ledger's usage rows at or after `since`. */
  ledgerUsage(since: number): Promise<UsageRow[]>
  /** M181. An image panel's bytes, by magic number under the cap — four arms, never a throw. */
  imageRead(path: string): ImageResult
  /** M181. The starter's two files, written once under userData/starter. */
  starterPrepare(): StarterFiles
  snapshotRestore(at: number, afterId?: number): { kind: 'restored'; workspaceId: string } | { kind: 'refused'; reason: string }
  memoryList(root: string, limit: number): Promise<{ root: string; entries: unknown[]; skipped: number }>
  memoryAdd(req: { root: string; kind: string; text: string; panelId?: string; source?: { conversationId: string; turnId: string; taskId?: string } }): Promise<{ ok: true } | { ok: false; reason: string }>
  listTemplates(): PersistedTemplate[]
  /** M100. */
  listTeammates(): PersistedTeammate[]
  /**
   * M131 fix round 2. `cwd`, present only from the assign door, lets main
   * check a project-scoped skill's REAL visibility (symlink-resolved
   * `insidePlace`) for this save and report it back on `notVisible` — never
   * a new channel, and never silent: a skill the pane just "saved" that
   * never reaches the agent is this repo's "row that disappears" failure.
   */
  saveTeammate(teammate: PersistedTeammate, cwd?: string): { teammate: PersistedTeammate; notVisible?: { name: string; repoRoot: string }[] }
  removeTeammate(id: string): boolean
  choosePlace(): Promise<string | null>
  /** M101. */
  listRoutines(): PersistedRoutine[]
  saveRoutine(routine: PersistedRoutine): { kind: 'saved'; routine: PersistedRoutine } | { kind: 'refused'; reason: string }
  removeRoutine(id: string): boolean
  runRoutine(id: string): boolean
  /** M182. The saved record, or `stale` with the standing one when `expectedRevision` does not match. */
  saveTemplate(template: Omit<PersistedTemplate, 'id'> & { id?: string }, expectedRevision?: number): TemplateSaveResult
  removeTemplate(id: string): boolean
  removePrompt(id: string): boolean
  /** M127. The skill shelf, whole. */
  shelf(): Shelf
  saveShelf(shelf: Shelf): Shelf
}

/** Registers the whole renderer -> main surface. One place, one call. */
/** M37. What main hands the worktree channels; see createWorktreeManager. */
export interface WorktreeHandlers {
  list(): Omit<WorktreeListRow, 'attached' | 'panelTitle'>[]
  remove(id: string): Promise<WorktreeRemoveResult>
  reveal(id: string): boolean
}

/** M39. What main hands the scrollback channels; see createScrollbackLog. */
export interface ScrollbackHandlers {
  tail(panelId: PanelId, lines: number): Promise<string[]>
  clear(): Promise<void>
  /** M42/M122. panelIds are supplied by the handler from the ACTIVE workspace's layout, never by the renderer; the answer covers both logs. */
  search(panelIds: PanelId[], query: string): Promise<PanelSearchResult>
}

/**
 * M73. What main/index.ts wires over AgentSessionManager and the transcript
 * log. `create` validates the directory and the CLI's presence and refuses by
 * name; `transcript` reads the file and the live snapshot together.
 */
export interface AgentHandlers {
  create(spec: AgentSessionSpec): AgentCreateResult
  send(id: string, text: string, attachments: ChatAttachment[]): SendAnswer
  /** M75. */
  clipboardImage(): ClipboardImage
  /** M145. See ATTACHMENT_CLIPBOARD_FILE. */
  clipboardFile(): ClipboardFile
  interrupt(id: string): boolean
  /** M319. Optional so every harness that builds these handlers by hand still does; absent answers 0 / false. */
  cancelQueued?(id: string): number
  terminate?(id: string): boolean
  /** M351. A cap may have changed (a chat's record saved, a setting set): main re-reads every agent's caps. Optional, like terminate. */
  capsChanged?(): void
  /** M322. Optional for the same reason; absent answers false. */
  queueEdit?(req: QueueEditRequest): boolean
  sendCorrection?(id: string, text: string, attachments: ChatAttachment[]): CorrectionAnswer
  dispose(req: { id: string; drop: boolean }): void
  /** M98. `scope: 'session'` grants the request's tool for the rest of the session before answering. */
  answer(req: { id: string; requestId: string; answer: PermissionAnswer; scope?: 'session' }): boolean
  list(): AgentSessionSnapshot[]
  transcript(id: string): AgentTranscriptResult
  /** M74. */
  importSession(req: AgentImportRequest): AgentImportResult
  /** M97. */
  autoStart(req: AutoStartRequest): AutoStartResult
  autoStop(id: string): boolean
  /** M98. The tools granted for a session, in grant order. */
  grants(id: string): string[]
  /** M98. Drop every grant for a session; it asks again. */
  revokeGrants(id: string): void
  /** M138. See AGENT_POOL_START. */
  poolStart(req: PoolStartRequest): PoolStartResult
  /** M138. See AGENT_POOL_STOP. */
  poolStop(req: { templateId: string; key: string }): boolean
}

const INERT_AGENTS: AgentHandlers = {
  create: () => ({ kind: 'refused', reason: 'the agent runtime is not available' }),
  send: () => 'no-session',
  clipboardImage: () => null,
  clipboardFile: () => ({ kind: 'failed', why: 'the agent runtime has not started yet' }),
  interrupt: () => false,
  dispose: () => {},
  answer: () => false,
  list: () => [],
  transcript: () => ({ turns: [], snapshot: null }),
  importSession: () => ({ kind: 'refused', reason: 'the agent runtime is not available' }),
  autoStart: () => ({ kind: 'refused', reason: 'the agent runtime is not available' }),
  autoStop: () => false,
  grants: () => [],
  revokeGrants: () => {},
  poolStart: () => ({ kind: 'refused', reason: 'the agent runtime has not started yet' }),
  poolStop: () => false
}

/**
 * M84. The watcher runtime's verbs, inert by default for the reason every
 * collaborator before it is: every channel keeps a handler (`verify:ipc`),
 * and a harness that did not wire the runtime gets a NAMED refusal rather
 * than a process.
 */
export interface WatcherHandlers {
  create(req: WatcherCreateRequest): WatcherCreateResult | Promise<WatcherCreateResult>
  run(id: string): void | Promise<void>
  stop(id: string): void | Promise<void>
  dispose(id: string): void | Promise<void>
  list(): WatcherStateEvent[] | Promise<WatcherStateEvent[]>
}

const INERT_WATCHERS: WatcherHandlers = {
  create: () => ({ ok: false, reason: 'the watcher runtime is not available' }),
  run: () => {},
  stop: () => {},
  dispose: () => {},
  list: () => []
}

/** M103. The harnesses that construct positionally keep a handler; it refuses by name. */
const INERT_BROWSER: BrowserHandlers = {
  read: async () => ({ kind: 'refused', reason: 'the browser pane is not available here' })
}

/** M185. The preview's two main-side questions; see main/preview-discover.ts and main/preview-capture.ts. */
export interface PreviewHandlers {
  discover(req: { pids: number[]; cwd: string }): Promise<PreviewDiscovery>
  capture(req: { webContentsId: number }): Promise<PreviewCaptureResult>
}

const INERT_PREVIEW: PreviewHandlers = {
  discover: async (req) => ({ kind: 'none', candidates: [], scripts: [], note: `discovery is not available here (${req?.cwd ?? 'no directory'})` }),
  capture: async () => ({ kind: 'refused', reason: 'the preview is not available here' })
}

/** M186. The asset store's two doors; see main/asset-store.ts. */
export interface AssetHandlers {
  put(req: { path?: string; bytes?: Uint8Array }): Promise<AssetPutResult>
  choose(): Promise<string | null>
}

const INERT_ASSETS: AssetHandlers = {
  put: async () => ({ kind: 'refused', reason: 'the asset store is not available here' }),
  choose: async () => null
}

/** M250. The .docx import's one door; see main/docx-import.ts. */
export interface DocxHandlers {
  import(req: { path?: string }): Promise<import('../shared/imported-note').DocxImportResult>
}

const INERT_DOCX: DocxHandlers = {
  import: async () => ({ kind: 'refused', reason: 'importing a .docx is not available here' })
}

/** M188. The fetch node's one door; see main/node-run.ts. */
export interface NodeHandlers {
  fetch(req: { url: string; method?: string }): Promise<NodeFetchResult>
}

const INERT_NODES: NodeHandlers = {
  fetch: async () => ({ kind: 'refused', reason: 'fetch nodes are not available here' })
}

/** M189. The portable file's two doors; see shared/portable.ts for the format. */
export interface PortableHandlers {
  write(req: { path?: string; file: unknown; suggested?: string }): Promise<PortableWriteResult>
  read(req: { path?: string }): Promise<PortableReadResult>
}

const INERT_PORTABLE: PortableHandlers = {
  write: async () => ({ kind: 'refused', reason: 'export is not available here' }),
  read: async () => ({ kind: 'refused', reason: 'import is not available here' })
}

/** M253. A pack's three doors; the one implementation is main/pack-handlers.ts. */
const INERT_PACK: PackHandlers = {
  read: async () => ({ kind: 'refused', reason: 'packs are not available here' }),
  add: async () => ({ kind: 'refused', reason: 'packs are not available here' }),
  write: async () => ({ kind: 'refused', reason: 'packs are not available here' }),
  sample: async () => ({ kind: 'refused', reason: 'packs are not available here' })
}

/** M255. The publisher's one door; the implementation is main/github-publish.ts, wired in index.ts. */
export interface PublishHandlers {
  publish(req: unknown): Promise<GithubPublishResult>
}
const INERT_PUBLISH: PublishHandlers = {
  publish: async () => ({ kind: 'refused', reason: 'publishing is not available here' })
}

/** M129. The four writers; see main/skill-write.ts for every rule they enforce. */
export interface SkillWriteHandlers {
  write(req: SkillWriteRequest): Promise<SkillWriteResult>
  create(req: SkillCreateRequest): Promise<SkillWriteResult>
  rename(req: SkillRenameRequest): Promise<SkillWriteResult>
  remove(req: SkillDeleteRequest): Promise<SkillWriteResult>
}
const NOT_WIRED: SkillWriteResult = {
  kind: 'refused',
  why: 'editing skills is not available here'
}
const INERT_SKILL_WRITERS: SkillWriteHandlers = {
  write: async () => NOT_WIRED,
  create: async () => NOT_WIRED,
  rename: async () => NOT_WIRED,
  remove: async () => NOT_WIRED
}

/** M114. The board's main-side verbs; see board-lane.ts. Inert by default like every collaborator before it. */
export interface BoardHandlers {
  lane(req: BoardLaneRequest): Promise<BoardLaneResult>
  laneStatus(req: { path: string; root: string }): Promise<LaneStatus>
  openPr(req: BoardOpenPrRequest): Promise<BoardOpenPrResult>
  commentPr(req: BoardCommentRequest): Promise<BoardCommentResult>
  /** M197. The repositories under a teammate's places — read-only, three arms. */
  repositories(req: { teammateId: string }): Promise<BoardRepositoriesResult>
}
const INERT_BOARD: BoardHandlers = {
  lane: async () => ({ kind: 'refused', reason: 'dispatch is not available here' }),
  laneStatus: async () => ({ kind: 'unreadable', detail: 'the lane is not available here' }),
  openPr: async () => ({ kind: 'refused', reason: 'the PR door is not available here' }),
  commentPr: async () => ({ kind: 'refused', reason: 'the PR door is not available here' }),
  repositories: async () => ({ kind: 'refused', reason: 'the repository list is not available here' })
}

/**
 * M123. The update notice's one verb. Inert by default like every collaborator
 * before it: a harness that did not wire a fetcher gets a NAMED third state,
 * never a network call and never a hang.
 */
export interface UpdateHandlers {
  check(): Promise<UpdateResult>
}
const INERT_UPDATE: UpdateHandlers = {
  check: async () => ({ kind: 'could-not-check', reason: 'the update check is not available here' })
}

const INERT_SCROLLBACK: ScrollbackHandlers = {
  tail: async () => [],
  clear: async () => {},
  search: async () => ({ hits: [], capped: false, cap: 0, redacted: 0 })
}

const INERT_WORKTREES: WorktreeHandlers = {
  list: () => [],
  remove: async () => ({ kind: 'unknown' }),
  reveal: () => false
}

/**
 * The Terminal Canvas account's three doors (main/account-session.ts). Inert
 * by default for every collaborator's reason, and the defaults are REFUSALS:
 * a harness that did not wire accounts never opens a browser.
 */
export interface AccountHandlers {
  login(): Promise<AccountLoginResult>
  logout(githubId?: string): Promise<AccountLogoutResult>
  sessions(): AccountSessionMeta[]
  use(githubId: string): AccountUseResult
  status(): AccountStatus
}
export const INERT_ACCOUNT: AccountHandlers = {
  login: async () => ({ kind: 'refused', reason: 'accounts are not available here' }),
  logout: async () => ({ kind: 'refused', reason: 'accounts are not available here' }),
  sessions: () => [],
  use: () => ({ kind: 'refused', reason: 'accounts are not available here' }),
  status: () => ({ configured: false, reason: 'accounts are not available here' })
}

/**
 * Presence's two doors (main/presence/presence-hub.ts). Inert by default: a
 * report goes nowhere and every roster is empty, so a harness that did not
 * wire presence connects to no server.
 */
export interface PresenceHandlers {
  local(report: LocalPresence): void
  rosters(): PresenceRoster[]
  /**
   * The Team view's two doors ride presence's collaborator rather than a new
   * positional parameter (src/main/CLAUDE.md rule 3): they are presence's
   * facts — the org's rows through the account, and one read-only room.
   */
  team(orgId?: string): Promise<TeamListResult>
  observe(req: TeamObserveRequest | null): void
  /**
   * The shared canvas (presence/canvas-sync.ts) rides here too, for the same
   * reason: the workspace's Y.Doc is the presence room's doc.
   */
  canvasOp(op: Extract<CanvasOp, { kind: 'rect' | 'delete' }>): Verdict
  canvasView(): CanvasSharedView | null
  /** After layout:save stored the active workspace. */
  canvasSaved(sharedAck: number | undefined): void
  /** After a workspace switch. */
  canvasActivated(): void
  share(req: { orgId?: string }): Promise<ShareResult>
  shares(): Promise<ShareListResult>
  openShare(shareId: string): Promise<{ kind: 'ok'; workspaceId: string } | { kind: 'refused' | 'failed'; reason: string }>
  setShareMember(req: { shareId: string; userId: string; role: WorkspaceRole | null }): Promise<ShareMemberResult>
  shareMembers(shareId: string): Promise<ShareMembersResult>
  /** Shared text's replica doors (canvas-sync.ts). Inert: no doc to open, every update refused. */
  textOpen(workspaceId: string): SharedTextOpen | null
  textClose(workspaceId: string): void
  textUpdate(workspaceId: string, update: Uint8Array): Verdict
  /** M377. The team's asks this person may answer, and their answer to one. Inert: none, and every answer refused. */
  teamAsks(): TeamAskRow[]
  answerTeamAsk(req: TeamAskAnswerRequest): Verdict
}
const SHARING_NOT_WIRED = 'sharing is not wired in this build'
export const INERT_PRESENCE: PresenceHandlers = {
  local: () => {}, rosters: () => [], observe: () => {},
  team: async () => ({ kind: 'refused', reason: 'the Team view is not wired in this build' }),
  canvasOp: () => ({ ok: true }), canvasView: () => null, canvasSaved: () => {}, canvasActivated: () => {},
  share: async () => ({ kind: 'refused', reason: SHARING_NOT_WIRED }),
  shares: async () => ({ kind: 'refused', reason: SHARING_NOT_WIRED }),
  openShare: async () => ({ kind: 'refused', reason: SHARING_NOT_WIRED }),
  setShareMember: async () => ({ kind: 'refused', reason: SHARING_NOT_WIRED }),
  shareMembers: async () => ({ kind: 'refused', reason: SHARING_NOT_WIRED }),
  textOpen: () => null, textClose: () => {},
  textUpdate: () => ({ ok: false, reason: SHARING_NOT_WIRED }),
  teamAsks: () => [],
  answerTeamAsk: () => ({ ok: false, reason: SHARING_NOT_WIRED })
}

/**
 * The pty relay's doors (main/relay/relay-client.ts). Inert by default — every
 * open refused by name, every keystroke dropped — so a harness that did not
 * wire the relay opens no socket to anything.
 */
export type RelayHandlers = Pick<RelayClient, 'spawn' | 'attach' | 'detach' | 'input' | 'resize' | 'control' | 'kill' | 'list' | 'view' | 'replay'>
const RELAY_NOT_WIRED = 'the relay is not wired in this build'
export const INERT_RELAY: RelayHandlers = {
  spawn: async () => ({ kind: 'refused', reason: RELAY_NOT_WIRED }),
  attach: async () => ({ kind: 'refused', reason: RELAY_NOT_WIRED }),
  detach: () => {}, input: () => false, resize: () => {}, control: () => {}, kill: () => {},
  list: async () => ({ kind: 'refused', reason: RELAY_NOT_WIRED }),
  view: () => null, replay: () => {}
}

const RELAY_PANEL = /^[A-Za-z0-9_-]{1,128}$/
const RELAY_USER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Every argument is untrusted renderer input and is typed here; the relay's
 * own parser (relay-protocol.ts) types it again on the other end. Input is
 * capped per call: a paste larger than that is the renderer's to chunk.
 */
function registerRelayHandlers(relay: RelayHandlers): void {
  const panel = (v: unknown): string | undefined => (typeof v === 'string' && RELAY_PANEL.test(v) ? v : undefined)
  const dim = (v: unknown, hi: number): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= hi ? v : undefined)
  ipcMain.handle(IPC.RELAY_SPAWN, (_event, raw: unknown) => {
    const r = (raw ?? {}) as Record<string, unknown>
    const id = panel(r['panelId']), cols = dim(r['cols'], 1000), rows = dim(r['rows'], 500)
    const program = typeof r['program'] === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(r['program']) ? r['program'] : undefined
    const shareId = typeof r['shareId'] === 'string' && RELAY_USER.test(r['shareId']) ? r['shareId'] : undefined
    if (id === undefined || program === undefined || cols === undefined || rows === undefined) return { kind: 'refused', reason: 'not a relay spawn' }
    return relay.spawn(id, { program, cols, rows, ...(shareId === undefined ? {} : { shareId }) })
  })
  ipcMain.handle(IPC.RELAY_ATTACH, (_event, raw: unknown) => {
    const r = (raw ?? {}) as Record<string, unknown>
    const id = panel(r['panelId'])
    const sessionId = typeof r['sessionId'] === 'string' && RELAY_SESSION_ID.test(r['sessionId']) ? r['sessionId'] : undefined
    if (id === undefined || sessionId === undefined) return { kind: 'refused', reason: 'not a relay session' }
    return relay.attach(id, sessionId)
  })
  ipcMain.handle(IPC.RELAY_DETACH, (_event, id: unknown) => { const p = panel(id); if (p !== undefined) relay.detach(p) })
  ipcMain.handle(IPC.RELAY_INPUT, (_event, id: unknown, data: unknown) => {
    const p = panel(id)
    return p !== undefined && typeof data === 'string' && data.length <= 64 * 1024 ? relay.input(p, data) : false
  })
  ipcMain.handle(IPC.RELAY_RESIZE, (_event, raw: unknown) => {
    const r = (raw ?? {}) as Record<string, unknown>
    const p = panel(r['panelId']), cols = dim(r['cols'], 1000), rows = dim(r['rows'], 500)
    if (p !== undefined && cols !== undefined && rows !== undefined && cols >= 2) relay.resize(p, cols, rows)
  })
  ipcMain.handle(IPC.RELAY_CONTROL, (_event, raw: unknown) => {
    const r = (raw ?? {}) as Record<string, unknown>
    const p = panel(r['panelId']), action = r['action']
    if (p === undefined) return
    if (action === 'request' || action === 'release' || action === 'revoke') relay.control(p, action)
    else if ((action === 'grant' || action === 'deny') && typeof r['userId'] === 'string' && RELAY_USER.test(r['userId'])) relay.control(p, action, r['userId'])
  })
  ipcMain.handle(IPC.RELAY_KILL, (_event, id: unknown) => { const p = panel(id); if (p !== undefined) relay.kill(p) })
  ipcMain.handle(IPC.RELAY_LIST, () => relay.list())
  ipcMain.handle(IPC.RELAY_VIEW, (_event, id: unknown) => {
    const p = panel(id)
    if (p === undefined) return null
    // The view now, and the whole screen again right after it: a reloaded
    // renderer has an empty xterm and the relay's ring is the only copy.
    const v = relay.view(p)
    if (v !== null) queueMicrotask(() => relay.replay(p))
    return v
  })
}

/** A workspace id as the layout store mints them (ID_PATTERN's bound), for the text doors. */
const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,128}$/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** `team:observe`'s body: two bounded ids, or null to stop. */
function parseObserve(raw: unknown): TeamObserveRequest | null | undefined {
  if (raw === null) return null
  const r = raw as Record<string, unknown> | undefined
  if (r === undefined || typeof r !== 'object') return undefined
  const w = r['workspaceId'], u = r['userId']
  if (typeof w !== 'string' || typeof u !== 'string' || w === '' || u === '' || w.length > 128 || u.length > 128) return undefined
  return { workspaceId: w, userId: u }
}

/** A renderer report, shape-checked here and bounded; the hub trusts nothing it did not parse. */
function parseLocalPresence(raw: unknown): LocalPresence | undefined {
  const r = raw as Record<string, unknown> | null
  if (r === null || typeof r !== 'object' || typeof r['workspaceId'] !== 'string') return undefined
  const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const c = r['cursor'] as Record<string, unknown> | null
  const v = r['viewport'] as Record<string, unknown> | null
  return {
    workspaceId: r['workspaceId'],
    currentPanelId: typeof r['currentPanelId'] === 'string' ? r['currentPanelId'] : null,
    cursor: c !== null && typeof c === 'object' && fin(c['x']) && fin(c['y']) ? { x: c['x'], y: c['y'] } : null,
    viewport: v !== null && typeof v === 'object' && fin(v['x']) && fin(v['y']) && fin(v['scale']) ? { x: v['x'], y: v['y'], scale: v['scale'] } : null,
    selection: Array.isArray(r['selection']) ? r['selection'].filter((s): s is string => typeof s === 'string').slice(0, 200) : [],
    textCursor: parseTextCursor(r['textCursor']),
    // OBSERVING_MODE is the hub's own word for an observer room; a canvas
    // report never claims it, or peers would publish snapshots to nobody.
    mode: typeof r['mode'] === 'string' && r['mode'] !== OBSERVING_MODE ? r['mode'].slice(0, 32) : 'canvas',
    currentTask: typeof r['currentTask'] === 'string' ? r['currentTask'].slice(0, 140) : ''
  }
}

export function registerIpcHandlers(
  ptyManager: PtyManager,
  layoutStore: LayoutStore,
  getBackendInfo: () => SessionBackendInfo,
  palette: PaletteHandlers,
  // Its own parameter, not a PaletteHandlers member: SETTINGS_SET needs it to
  // redraw the Restore submenu's checkbox state, the same collaborator
  // getBackendInfo already is rather than something routed through palette.
  rebuildMenu: () => void,
  // Appended last so no existing positional call site shifts. Its own
  // parameter rather than a PaletteHandlers member for the same reason
  // getBackendInfo and rebuildMenu already are: it is main/index.ts's own
  // collaborator, constructed once at module scope, not something the
  // palette surface owns.
  reviewEngine: ReviewEngine,
  /**
   * The write half. A separate parameter from reviewEngine rather than a
   * member of it, because the engine is the read side: a five-call
   * transaction with a cleanup obligation and a non-fatal reconcile step has
   * a different failure model, and folding it in would make every engine
   * fixture carry a filesystem dependency it has no use for.
   */
  reviewCommit: (req: ReviewCommitRequest) => Promise<ReviewCommitResult>,
  // Appended last, for the identical reason reviewEngine and rebuildMenu are:
  // a collaborator main/index.ts constructs once at module scope, not
  // something any existing surface (palette, review) owns, and appending it
  // rather than inserting it keeps every existing positional call site
  // (scripts/panels-entry.cjs included) from having to shift.
  credentialStore: CredentialStore,
  /**
   * Appended last, like reviewEngine and reviewCommit before them, so no
   * existing positional call site shifts.
   */
  fileWatchers: FileWatchers,
  /**
   * Its own parameter rather than reaching for `palette.window`: the dialog
   * needs a parent window, and main/index.ts is the only thing that has one.
   */
  getWindow: () => BrowserWindow | null,
  /**
   * Appended last, like every collaborator before it, so no existing
   * positional call site shifts — scripts/panels-entry.cjs included.
   */
  toolboxCache: ToolboxCache,
  /**
   * Backlog #75's export directory, resolved once by main/index.ts the same
   * way layoutStore's and credentialStore's own file paths are — appended
   * last, like every collaborator above it.
   */
  diagnosticsDir: string,
  /**
   * M37. The worktree verbs. Optional with an inert default, so the harnesses
   * that construct this positionally keep compiling and every channel still
   * has a handler (verify:ipc): the default lists nothing and answers
   * `unknown`, which is what an install with no worktrees looks like.
   */
  worktrees: WorktreeHandlers = INERT_WORKTREES,
  /**
   * M39. The durable log's two read/clear verbs. Optional with an inert
   * default for WorktreeHandlers' reason: the positional harnesses keep
   * compiling and every channel still has a handler.
   */
  scrollback: ScrollbackHandlers = INERT_SCROLLBACK,
  /** M48. Appended last with an inert default, like every collaborator before it. */
  envReport: (again: boolean) => EnvReport | Promise<EnvReport> = () => INERT_ENV_REPORT,
  /** M51. Appended last with an inert default; the harness passes a recorder. */
  links: LinkHandlers = INERT_LINKS,
  /** M52. The run ledger's read half, inert by default. */
  ledgerList: (panelId: string, limit: number) => Promise<RunRow[]> = async () => [],
  /** M53. Inert by default: a harness that does not wire discard gets a refusal, never a write. */
  reviewDiscard: (req: ReviewDiscardRequest) => Promise<ReviewDiscardResult> = async () => ({ kind: 'refused', detail: 'discard is not wired' }),
  /** M58. Inert by default: a harness that does not wire export gets `failed`, never a dialog. */
  exporters: Exporters = INERT_EXPORTERS,
  /**
   * M73. The agent-session runtime's verbs. Inert by default for the same
   * reason as every collaborator before it: every channel keeps a handler
   * (verify:ipc) and a harness that did not wire the runtime gets a NAMED
   * refusal, never a process.
   */
  agents: AgentHandlers = INERT_AGENTS,
  /** M84. The watcher runtime; see WatcherHandlers. */
  watchers: WatcherHandlers = INERT_WATCHERS,
  /** M103. Appended last, like every collaborator before it. */
  browser: BrowserHandlers = INERT_BROWSER,
  /** M114. Appended last, like every collaborator before it. */
  board: BoardHandlers = INERT_BOARD,
  /**
   * M126. The enabled plugins, asked fresh on every toolbox read. Inert by
   * default (`unknown`, never spawning anything) for the same reason as every
   * collaborator before it: a harness that does not wire it keeps compiling
   * and TOOLBOX_READ still answers, just with no plugin skills.
   */
  listPlugins: () => Promise<PluginListResult> = async () => ({
    kind: 'unknown',
    why: 'plugin list is not wired'
  }),
  /**
   * M128. One plugin's `claude plugin details` text. Inert by default for
   * every collaborator's reason: a harness that does not wire it keeps
   * compiling, and the panel's plugin section shows its `unknown` arm rather
   * than nothing at all.
   */
  pluginDetails: (id: string) => Promise<PluginDetailsResult> = async (id) => ({
    kind: 'unknown',
    why: `plugin details for ${id} is not wired`
  }),
  /**
   * M129. The four writers. Inert by default for every collaborator's
   * reason, and here the default matters more than most: a harness that did
   * not wire the writers gets a NAMED REFUSAL rather than a write, so no
   * suite can reach the real `~/.claude` through a channel it forgot about.
   */
  skillWriters: SkillWriteHandlers = INERT_SKILL_WRITERS,
  /**
   * M130. A terminal panel's live skill trail. Inert by default for every
   * collaborator's reason: a harness that does not wire it gets a named
   * `unreadable` rather than a read against nothing.
   */
  skillTrail: (panelId: string) => Promise<Trail> = async () => ({
    kind: 'unreadable',
    why: 'the skill trail is not wired'
  }),
  /** M123. Appended last, like every collaborator before it. */
  update: UpdateHandlers = INERT_UPDATE,
  /** M185. Appended last, like every collaborator before it. */
  preview: PreviewHandlers = INERT_PREVIEW,
  /** M186. Appended last, like every collaborator before it. */
  assets: AssetHandlers = INERT_ASSETS,
  /** M188. Appended last, like every collaborator before it. */
  nodes: NodeHandlers = INERT_NODES,
  /** M189. Appended last, like every collaborator before it. */
  portable: PortableHandlers = INERT_PORTABLE,
  /** M250. Appended last, like every collaborator before it. */
  docx: DocxHandlers = INERT_DOCX,
  /** M252. Appended last, like every collaborator before it — a harness that does not wire it gets a named refusal, never a process. */
  tools: ToolHandlers = INERT_TOOLS,
  /** M253. Appended last, like every collaborator before it. */
  pack: PackHandlers = INERT_PACK,
  /** M255. Appended last, like every collaborator before it. */
  publisher: PublishHandlers = INERT_PUBLISH,
  /**
   * M300. The durable record's two doors, appended last so no existing
   * positional call site shifts. Inert by default like every collaborator
   * before them, and the defaults are the HONEST ones: an unwired read
   * answers "no entries, and the scan did not reach the start", never an
   * empty record that reads as "nothing happened"; an unwired write answers
   * false, so a caller reports that its row did not land.
   */
  ledgerTimeline: (filter: TimelineFilter, limit: number) => Promise<TimelineRead> = async () => ({ entries: [], reachedStart: false }),
  ledgerEvent: (row: EventRow) => Promise<boolean> = async () => false,
  /**
   * M306. One check run's exact output, appended last so no positional call
   * site shifts. The inert default is the HONEST one: `unreadable` with a
   * reason, never `missing` — an unwired store is not a pruned record.
   */
  checkOutput: (runId: string) => Promise<CheckOutputRead> = async () => ({ kind: 'unreadable', why: 'check output is not wired' }),
  /**
   * M311–M314. The workflow kit — combine, repository setup, the editor,
   * recipes — as ONE collaborator appended last (kit.ts's header): eight
   * channels, one positional parameter, one harness mirror.
   */
  kit: KitHandlers = INERT_KIT,
  /**
   * Brief #20. What had a session when the window last went away, handed out
   * once (main/last-exit.ts). Appended last so no positional call site
   * shifts; the inert default is the honest one — no record, no claim.
   */
  lastExit: () => LastExit | null = () => null,
  /**
   * M316. The job journal's two doors (main/job-recovery.ts), appended last
   * so no positional call site shifts; inert by default — no jobs, and every
   * recovery refused by name.
   */
  jobs: JobHandlers = INERT_JOBS,
  /**
   * M320–M321. The task doors — a task's deliverables and their evidence,
   * the search index over them, the gated hand-off export, and the recipe
   * preflight — as ONE collaborator appended last (the kit's rule: one
   * positional parameter, one harness mirror). Inert by default: nothing
   * recorded, every export refused by name.
   */
  tasks: TaskHandlers = INERT_TASKS,
  /** The account: sign in through GitHub. Appended last, like every collaborator before it. */
  account: AccountHandlers = INERT_ACCOUNT,
  /** Presence. Appended last, like every collaborator before it. */
  presence: PresenceHandlers = INERT_PRESENCE,
  /** The pty relay. Appended last, like every collaborator before it. */
  relay: RelayHandlers = INERT_RELAY
): void {
  registerRelayHandlers(relay)
  ipcMain.handle(IPC.PRESENCE_LOCAL, (_event, raw: unknown) => {
    const report = parseLocalPresence(raw)
    if (report !== undefined) presence.local(report)
  })
  ipcMain.handle(IPC.PRESENCE_ROSTERS, () => presence.rosters())
  ipcMain.handle(IPC.TEAM_LIST, (_event, orgId?: unknown) =>
    presence.team(typeof orgId === 'string' && /^[0-9a-f-]{36}$/i.test(orgId) ? orgId : undefined))
  ipcMain.handle(IPC.TEAM_OBSERVE, (_event, raw: unknown) => {
    const req = parseObserve(raw)
    if (req !== undefined) presence.observe(req)
  })
  ipcMain.handle(IPC.CANVAS_OP, (_event, raw: unknown): Verdict => {
    const op = parseRendererOp(raw)
    return op === undefined ? { ok: false, reason: 'not a canvas operation' } : presence.canvasOp(op)
  })
  ipcMain.handle(IPC.CANVAS_SHARED_VIEW, () => presence.canvasView())
  ipcMain.handle(IPC.TEXT_OPEN, (_event, id: unknown) => (typeof id === 'string' && WORKSPACE_ID.test(id) ? presence.textOpen(id) : null))
  ipcMain.handle(IPC.TEXT_CLOSE, (_event, id: unknown) => { if (typeof id === 'string' && WORKSPACE_ID.test(id)) presence.textClose(id) })
  // M377. The team's asks: read, and one answer — shape-checked here, the
  // name it is written in decided by main (the signed-in person), never sent.
  ipcMain.handle(IPC.TEAM_ASKS, () => presence.teamAsks())
  ipcMain.handle(IPC.TEAM_ASK_ANSWER, (_event, raw: unknown): Verdict => {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const { workspaceId, askId, answer } = r
    if (typeof workspaceId !== 'string' || !WORKSPACE_ID.test(workspaceId)) return { ok: false, reason: 'no such workspace' }
    if (typeof askId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(askId)) return { ok: false, reason: 'no such ask' }
    if (answer !== 'allow' && answer !== 'deny') return { ok: false, reason: 'an answer is allow or deny' }
    return presence.answerTeamAsk({ workspaceId, askId, answer })
  })
  ipcMain.handle(IPC.TEXT_UPDATE, (_event, id: unknown, update: unknown): Verdict => {
    if (typeof id !== 'string' || !WORKSPACE_ID.test(id) || !(update instanceof Uint8Array)) return { ok: false, reason: 'not a shared text update' }
    // Bounded before Yjs parses it: a replica's honest update is one burst of
    // typing, and a paste of a whole file is still far under this.
    if (update.byteLength > 8 * 1024 * 1024) return { ok: false, reason: 'that update is too large' }
    return presence.textUpdate(id, update)
  })
  ipcMain.handle(IPC.WORKSPACE_SHARE, (_event, raw: unknown) => {
    const orgId = (raw as { orgId?: unknown } | undefined)?.orgId
    return presence.share(typeof orgId === 'string' && UUID.test(orgId) ? { orgId } : {})
  })
  ipcMain.handle(IPC.WORKSPACE_SHARES, () => presence.shares())
  ipcMain.handle(IPC.WORKSPACE_OPEN_SHARE, (_event, shareId: unknown) =>
    typeof shareId === 'string' && UUID.test(shareId) ? presence.openShare(shareId) : Promise.resolve({ kind: 'refused' as const, reason: 'not a share id' }))
  ipcMain.handle(IPC.WORKSPACE_SHARE_MEMBER, (_event, raw: unknown) => {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
    const shareId = r['shareId'], userId = r['userId']
    const role = r['role'] === null ? null : parseWorkspaceRole(r['role'])
    if (typeof shareId !== 'string' || !UUID.test(shareId) || typeof userId !== 'string' || !UUID.test(userId) || role === undefined || role === 'owner') {
      return Promise.resolve({ kind: 'refused' as const, reason: 'a share, a person and editor, viewer or none' })
    }
    return presence.setShareMember({ shareId, userId, role })
  })
  ipcMain.handle(IPC.AUTH_LOGIN, () => account.login())
  // A GitHub id is digits; anything else is refused as "no such session" by the
  // service, never used to build a key that names something else.
  ipcMain.handle(IPC.AUTH_LOGOUT, (_event, githubId?: unknown) =>
    account.logout(typeof githubId === 'string' && githubId !== '' ? githubId : undefined))
  ipcMain.handle(IPC.AUTH_SESSIONS, () => account.sessions())
  ipcMain.handle(IPC.AUTH_USE, (_event, githubId: unknown) =>
    typeof githubId === 'string' && /^\d{1,20}$/.test(githubId) ? account.use(githubId) : { kind: 'refused', reason: 'not a GitHub user id' })
  ipcMain.handle(IPC.AUTH_STATUS, () => account.status())
  ipcMain.handle(IPC.WORKSPACE_SHARE_MEMBERS, (_event, shareId: unknown) =>
    typeof shareId === 'string' && UUID.test(shareId) ? presence.shareMembers(shareId) : Promise.resolve({ kind: 'refused' as const, reason: 'not a share id' }))
  // M320. Shape-checked here; main re-checks every path against its root.
  ipcMain.handle(IPC.TASK_EVIDENCE, (_event, req: unknown) => {
    const r = req as { itemId?: unknown; panelIds?: unknown; root?: unknown } | null
    if (typeof r?.itemId !== 'string') return INERT_TASKS.evidence({ itemId: '', panelIds: [] })
    const panelIds = Array.isArray(r.panelIds) ? r.panelIds.filter((p): p is string => typeof p === 'string').slice(0, 200) : []
    return tasks.evidence({ itemId: r.itemId, panelIds, ...(typeof r.root === 'string' && r.root.startsWith('/') ? { root: r.root } : {}) })
  })
  ipcMain.handle(IPC.TASK_EVIDENCE_INDEX, () => tasks.index())
  ipcMain.handle(IPC.TASK_EXPORT_HANDOFF, (_event, req: unknown) => {
    const r = req as { itemId?: unknown; title?: unknown; markdown?: unknown } | null
    if (typeof r?.itemId !== 'string' || typeof r.markdown !== 'string') return { kind: 'failed', reason: 'an export names a task and its text' }
    return tasks.exportHandoff({ itemId: r.itemId, title: typeof r.title === 'string' ? r.title : r.itemId, markdown: r.markdown.slice(0, 512 * 1024) })
  })
  // M316. Shape-checked here; the plan re-checks every index against the record.
  ipcMain.handle(IPC.JOB_LIST, () => jobs.list())
  ipcMain.handle(IPC.JOB_RECOVER, (_event, req: unknown) => {
    const r = req as { jobId?: unknown; choice?: unknown; items?: unknown } | null
    const choice = r?.choice
    if (typeof r?.jobId !== 'string' || (choice !== 'reconnect' && choice !== 'continue' && choice !== 'retry' && choice !== 'abandon')) return { kind: 'refused', reason: 'a recovery names a job and a choice' }
    const items = Array.isArray(r.items) ? r.items.filter((i): i is number => typeof i === 'number' && Number.isInteger(i)) : undefined
    return jobs.recover({ jobId: r.jobId, choice, ...(items === undefined ? {} : { items }) })
  })
  // M311–M314. Shapes are checked here; each store validates its own fields again.
  ipcMain.handle(IPC.COMBINE_RUN, (_event, req: unknown) => {
    const r = req as { root?: unknown; lanes?: unknown } | null
    return typeof r?.root === 'string' && Array.isArray(r.lanes) ? kit.combine({ root: r.root, lanes: r.lanes.filter((l): l is string => typeof l === 'string') }) : { kind: 'unreadable', detail: 'a combine names a repository and its lanes' }
  })
  // M317. Shapes checked here; the integrator re-reads every fact it acts on.
  ipcMain.handle(IPC.COMBINE_INPUTS, (_event, req: unknown) => {
    const r = req as { root?: unknown; lanes?: unknown } | null
    return typeof r?.root === 'string' && Array.isArray(r.lanes) ? kit.combineInputs({ root: r.root, lanes: r.lanes.filter((l): l is string => typeof l === 'string') }) : { kind: 'unreadable', detail: 'a read names a repository and its lanes' }
  })
  ipcMain.handle(IPC.COMBINE_INTEGRATE, (_event, req: unknown) => {
    const r = req as Partial<IntegrateRequest> | null
    const lanes = Array.isArray(r?.lanes) ? r.lanes.filter((l): l is IntegrateRequest['lanes'][number] => typeof l?.lane === 'string' && l.lane.startsWith('/') && typeof l.label === 'string' && typeof l.digest === 'string') : []
    if (typeof r?.root !== 'string' || typeof r.base !== 'string' || typeof r.tree !== 'string' || lanes.length === 0 || typeof r.check?.outputId !== 'string' || typeof r.check.command !== 'string') {
      return { kind: 'refused', reason: 'an integration names a repository, its checked lanes and the check that witnessed them' }
    }
    return kit.combineIntegrate({
      root: r.root, base: r.base, tree: r.tree, check: { command: r.check.command, outputId: r.check.outputId },
      lanes: lanes.map((l) => ({ lane: l.lane, label: l.label, digest: l.digest, ...(typeof l.itemId === 'string' ? { itemId: l.itemId } : {}), ...(typeof l.title === 'string' ? { title: l.title } : {}) })),
      reviewed: Array.isArray(r.reviewed) ? r.reviewed.filter((p): p is string => typeof p === 'string') : []
    })
  })
  ipcMain.handle(IPC.COMBINE_RECEIPTS, (_event, root: unknown) => (typeof root === 'string' ? kit.combineReceipts(root) : []))
  // M315. Shape-checked here; the merger re-reads the repository itself.
  ipcMain.handle(IPC.LANE_MERGE, (_event, req: unknown) => {
    const r = req as { lane?: unknown; title?: unknown; dryRun?: unknown; expectHead?: unknown } | null
    if (typeof r?.lane !== 'string' || !r.lane.startsWith('/')) return { kind: 'refused', reason: 'an accept names the lane it merges' }
    return kit.laneMerge({ lane: r.lane, title: typeof r.title === 'string' ? r.title : '', ...(r.dryRun === true ? { dryRun: true } : {}), ...(typeof r.expectHead === 'string' ? { expectHead: r.expectHead } : {}) })
  })
  ipcMain.handle(IPC.SETUP_READ, (_event, cwd: unknown) => (typeof cwd === 'string' ? kit.setupRead(cwd) : { kind: 'not-a-repo' as const }))
  ipcMain.handle(IPC.SETUP_SAVE, (_event, setup: unknown) => kit.setupSave(setup))
  ipcMain.handle(IPC.SETUP_PREPARE, (_event, req: unknown) => {
    const lane = (req as { lane?: unknown } | null)?.lane
    return typeof lane === 'string' ? kit.setupPrepare({ lane }) : { kind: 'unreadable', detail: 'a preparation names its lane' }
  })
  ipcMain.handle(IPC.EDITOR_OPEN, (_event, target: unknown) => kit.editorOpen(target as EditorTarget))
  ipcMain.handle(IPC.RECIPE_LIST, () => kit.recipeList())
  ipcMain.handle(IPC.RECIPE_SAVE, (_event, recipe: unknown) => kit.recipeSave(recipe))
  ipcMain.handle(IPC.RECIPE_DELETE, (_event, id: unknown) => (typeof id === 'string' ? kit.recipeDelete(id) : false))
  // M321. The preflight probe and a recipe's versions.
  ipcMain.handle(IPC.SETUP_PREFLIGHT, (_event, req: unknown) => {
    const r = req as { root?: unknown; tools?: unknown } | null
    const tools = Array.isArray(r?.tools) ? r.tools.filter((t): t is string => typeof t === 'string') : []
    return kit.setupPreflight?.({ root: typeof r?.root === 'string' ? r.root : '', tools }) ?? { tools: {}, ports: null }
  })
  ipcMain.handle(IPC.RECIPE_HISTORY, (_event, id: unknown) => (typeof id === 'string' ? (kit.recipeHistory?.(id) ?? []) : []))
  ipcMain.handle(IPC.TOOL_GENERATE, (_event, req: { description: string; folder: string }) => tools.generate(req))
  ipcMain.handle(IPC.UPDATE_CHECK, () => update.check())
  // M250. The renderer names a path (or none, for the chooser) and nothing
  // else; a non-string is treated as absent rather than trusted.
  ipcMain.handle(IPC.DOCX_IMPORT, (_event, req: { path?: unknown }) => docx.import(typeof req?.path === 'string' ? { path: req.path } : {}))
  // M181. A relative path is refused as `missing` before the read: the record
  // parser already drops one, and a read resolved against main's cwd would
  // name a file nobody meant.
  ipcMain.handle(IPC.IMAGE_READ, (_event, path: string) => (typeof path === 'string' && path.startsWith('/') ? palette.imageRead(path) : { kind: 'missing' as const }))
  ipcMain.handle(IPC.STARTER_PREPARE, () => palette.starterPrepare())
  ipcMain.handle(IPC.AGENT_CREATE, (_event, spec: AgentSessionSpec) => agents.create(spec))
  ipcMain.handle(IPC.AGENT_SEND, (_event, id: string, text: string, attachments: ChatAttachment[] = []) => agents.send(id, text, Array.isArray(attachments) ? attachments : []))
  ipcMain.handle(IPC.AGENT_CLIPBOARD_IMAGE, () => agents.clipboardImage())
  ipcMain.handle(IPC.ATTACHMENT_CLIPBOARD_FILE, () => agents.clipboardFile())
  ipcMain.handle(IPC.AGENT_INTERRUPT, (_event, id: string) => agents.interrupt(id))
  ipcMain.handle(IPC.AGENT_DISPOSE, (_event, req: { id: string; drop: boolean }) => agents.dispose(req))
  // M319. Cancel and terminate — the id is the only input, as for interrupt.
  ipcMain.handle(IPC.AGENT_CANCEL_QUEUED, (_event, id: unknown) => (typeof id === 'string' ? (agents.cancelQueued?.(id) ?? 0) : 0))
  ipcMain.handle(IPC.AGENT_TERMINATE, (_event, id: unknown) => (typeof id === 'string' ? (agents.terminate?.(id) ?? false) : false))
  // M322. The request is checked field by field: an op this version does not
  // know, or an edit without text, is no edit.
  ipcMain.handle(IPC.AGENT_QUEUE_EDIT, (_event, req: unknown) => {
    if (typeof req !== 'object' || req === null) return false
    const r = req as Record<string, unknown>
    if (typeof r.id !== 'string' || typeof r.turnId !== 'string') return false
    if (r.op === 'edit') return typeof r.text === 'string' ? (agents.queueEdit?.({ id: r.id, op: 'edit', turnId: r.turnId, text: r.text }) ?? false) : false
    if (r.op === 'remove' || r.op === 'discard') return agents.queueEdit?.({ id: r.id, op: r.op, turnId: r.turnId }) ?? false
    return false
  })
  ipcMain.handle(IPC.AGENT_SEND_CORRECTION, (_event, id: string, text: string, attachments: ChatAttachment[] = []) =>
    agents.sendCorrection?.(id, text, Array.isArray(attachments) ? attachments : []) ?? { answer: 'no-session', interrupted: false })
  ipcMain.handle(IPC.AGENT_ANSWER, (_event, req: { id: string; requestId: string; answer: PermissionAnswer; scope?: 'session' }) => agents.answer(req))
  ipcMain.handle(IPC.AGENT_LIST, () => agents.list())
  ipcMain.handle(IPC.AGENT_TRANSCRIPT, (_event, id: string) => agents.transcript(id))
  ipcMain.handle(IPC.AGENT_IMPORT, (_event, req: AgentImportRequest) => agents.importSession(req))
  ipcMain.handle(IPC.AGENT_AUTO_START, (_event, req: AutoStartRequest) => agents.autoStart(req))
  ipcMain.handle(IPC.AGENT_AUTO_STOP, (_event, id: string) => agents.autoStop(id))
  // M98. Grants are main's (the tracker's), read and dropped by panel id.
  ipcMain.handle(IPC.AGENT_GRANTS, (_event, id: string) => agents.grants(id))
  ipcMain.handle(IPC.AGENT_REVOKE_GRANTS, (_event, id: string) => agents.revokeGrants(id))
  ipcMain.handle(IPC.AGENT_POOL_START, (_event, req: PoolStartRequest) => agents.poolStart(req))
  ipcMain.handle(IPC.AGENT_POOL_STOP, (_event, req: { templateId: string; key: string }) => agents.poolStop(req))
  ipcMain.handle(IPC.GIT_STATUS, (_event, root: string) => reviewEngine.status(root))
  // Backlog #86. null for not-a-repo AND unreadable: the caller's fallback is the same short path either way.
  ipcMain.handle(IPC.GIT_ROOT, async (_event, dir: string) => {
    if (typeof dir !== 'string' || dir === '') return null
    const repo = await reviewEngine.resolveRepo(dir)
    return repo.kind === 'root' ? repo.root : null
  })
  ipcMain.handle(IPC.REVIEW_ACROSS, (_event, root: string) => reviewEngine.reviewAcross(root))
  // M286. `undefined` does not survive an invoke as a distinct answer; null does.
  ipcMain.handle(IPC.REVIEW_IDENTITY, async (_event, req: { root: string; base: string }) => (await reviewEngine.identityOf(req.root, req.base)) ?? null)
  ipcMain.handle(IPC.VAULT_READ, (_event, root: string) => palette.vaultRead(root))
  ipcMain.handle(IPC.SNAPSHOT_LIST, () => palette.snapshotList())
  ipcMain.handle(IPC.LEDGER_USAGE, (_event, since: number) => palette.ledgerUsage(typeof since === 'number' && Number.isFinite(since) ? since : 0))
  ipcMain.handle(IPC.SNAPSHOT_RESTORE, (_event, at: number, afterId?: number) => palette.snapshotRestore(at, afterId))
  ipcMain.handle(IPC.WATCHER_CREATE, (_event, req: WatcherCreateRequest) => watchers.create(req))
  ipcMain.handle(IPC.WATCHER_RUN, (_event, id: string) => watchers.run(id))
  ipcMain.handle(IPC.WATCHER_STOP, (_event, id: string) => watchers.stop(id))
  ipcMain.handle(IPC.WATCHER_DISPOSE, (_event, id: string) => watchers.dispose(id))
  ipcMain.handle(IPC.WATCHER_LIST, () => watchers.list())
  // M103. The read is main's whole: the guest is resolved and checked here,
  // the scheme on its live url, the cap, the outward gate — the renderer
  // only names which panel.
  ipcMain.handle(IPC.BROWSER_READ, (_event, req: BrowserReadRequest) => browser.read(req))
  // M185. Discovery READS (one lsof, one package.json) and capture writes one
  // PNG into the app's own directory; both are main's for the same reason the
  // read is — the renderer names the panel and nothing else.
  ipcMain.handle(IPC.PREVIEW_DISCOVER, (_event, req: { pids: number[]; cwd: string }) => preview.discover(req))
  ipcMain.handle(IPC.PREVIEW_CAPTURE, (_event, req: { webContentsId: number }) => preview.capture(req))
  // M186. The store is main's: the renderer holds no file handle and can name
  // a path, never write one.
  ipcMain.handle(IPC.ASSET_PUT, (_event, req: { path?: string; bytes?: Uint8Array }) => assets.put(req))
  ipcMain.handle(IPC.ASSET_CHOOSE, () => assets.choose())
  // M188. The fetch node's GET: main's, so the cap and the outward gate are
  // in one place and the renderer never holds a socket.
  ipcMain.handle(IPC.NODE_FETCH, (_event, req: { url: string; method?: string }) => nodes.fetch(req))
  // M189. The file is main's to write and read; what to MAKE of it is the
  // renderer's, which is the same division M113's board keeps.
  ipcMain.handle(IPC.PORTABLE_EXPORT, (_event, req: { path?: string; file: unknown; suggested?: string }) => portable.write(req))
  ipcMain.handle(IPC.PORTABLE_IMPORT, (_event, req: { path?: string }) => portable.read(req))
  // M253. Read answers and adds nothing; add takes a TOKEN, never a payload,
  // so what is added is exactly what main parsed and the person was shown.
  ipcMain.handle(IPC.PACK_READ, (_event, req: { path?: string }) => pack.read(req))
  ipcMain.handle(IPC.PACK_ADD, (_event, req: { token: string }) => pack.add(req))
  ipcMain.handle(IPC.PACK_EXPORT, (_event, req: { path?: string; name: string; suggested?: string }) => pack.write(req))
  ipcMain.handle(IPC.PACK_SAMPLE, () => pack.sample())
  // M255. The request is `unknown` on purpose: the publisher parses it field
  // by field and refuses a malformed one by name.
  ipcMain.handle(IPC.GITHUB_PUBLISH, (_event, req: unknown) => publisher.publish(req))
  ipcMain.handle(IPC.BOARD_LANE, (_event, req: BoardLaneRequest) => board.lane(req))
  ipcMain.handle(IPC.BOARD_LANE_STATUS, (_event, req: { path: string; root: string }) => board.laneStatus(req))
  ipcMain.handle(IPC.BOARD_OPEN_PR, (_event, req: BoardOpenPrRequest) => board.openPr(req))
  ipcMain.handle(IPC.BOARD_COMMENT_PR, (_event, req: BoardCommentRequest) => board.commentPr(req))
  ipcMain.handle(IPC.BOARD_REPOSITORIES, (_event, req: { teammateId: string }) => board.repositories(req))
  ipcMain.handle(IPC.SCROLLBACK_TAIL, (_event, req: { panelId: PanelId; lines: number }) =>
    scrollback.tail(req.panelId, Math.max(1, Math.min(200, Math.floor(req.lines)))))
  ipcMain.handle(IPC.SCROLLBACK_CLEAR, () => scrollback.clear())
  // M42. The id list is MAIN's — every panel in every workspace — never a
  // renderer argument: a closed panel's log is already dropped, and a search
  // that accepted ids could ask for one the layout no longer holds.
  ipcMain.handle(IPC.SCROLLBACK_SEARCH, (_event, query: string): Promise<PanelSearchResult> => {
    // M122. The ACTIVE workspace's panels: a hit in another workspace would fly
    // nowhere (goToPanel names a panel on this canvas). A second scope later.
    // `initial()` applies restore.layout and answers NO panels with it off — search
    // would go quiet with nothing to say why (the verifier found it). The active
    // ROW of the merged list carries every panel whatever the setting says.
    return scrollback.search((layoutStore.mergedWorkspaces().find((w) => w.active)?.panels ?? []).map((p) => p.id), query)
  })
  ipcMain.handle(IPC.PTY_CREATE, (_event, spec: PanelSpec) => {
    // M65. Every spawn's directory joins the recent list, here rather than
    // in the sheet's handler, so ⌘N and a menu pick count too: the list is
    // "where panels start", not "where the sheet was used".
    layoutStore.addRecentDirectory(resolveCwd(spec.cwd))
    return ptyManager.create(spec)
  })

  // M37. `attached` is computed HERE, at list time, from the layout: a
  // record's panelId is in some workspace's panel list or it is not. Never
  // stored — see WorktreeRecord in layout-schema.ts.
  ipcMain.handle(IPC.WORKTREE_LIST, (): WorktreeListRow[] => {
    const titles = new Map<string, string | undefined>()
    for (const ws of layoutStore.mergedWorkspaces()) {
      for (const panel of ws.panels) titles.set(panel.id, panel.title)
    }
    return worktrees.list().map((w) => ({
      ...w,
      attached: titles.has(w.panelId),
      ...(titles.get(w.panelId) === undefined ? {} : { panelTitle: titles.get(w.panelId) })
    }))
  })
  ipcMain.handle(IPC.WORKTREE_REMOVE, (_event, id: string) => worktrees.remove(id))
  ipcMain.handle(IPC.WORKTREE_REVEAL, (_event, id: string) => worktrees.reveal(id))
  ipcMain.handle(IPC.PRESET_SET_WORKTREE, (_event, id: string, on: boolean) => palette.setWorktree(id, on))
  ipcMain.handle(IPC.SPAWN_SHEET, (_event, req: SpawnRequest) => palette.spawnWith(req))
  ipcMain.handle(IPC.SPAWN_RECENT, () => palette.recentDirectories())
  ipcMain.handle(IPC.SPAWN_RECENT_USED, () => palette.recentDirectoryUsed?.() ?? {})

  ipcMain.handle(IPC.PTY_WRITE, (_event, req: PtyWriteRequest) => {
    ptyManager.write(req.panelId, req.data)
  })

  ipcMain.handle(IPC.PTY_RESIZE, (_event, req: PtyResizeRequest) => {
    ptyManager.resize(req.panelId, req.cols, req.rows)
  })

  ipcMain.handle(IPC.PTY_KILL, (_event, panelId: PanelId) => {
    ptyManager.kill(panelId)
  })

  ipcMain.handle(IPC.PTY_LIST, () => ptyManager.list())

  // One snapshot for every requested root PID. This handler never schedules a
  // timer itself: rendering is the customer, so rendering chooses the slow
  // cadence and closing the canvas stops the work with its effect cleanup.
  ipcMain.handle(IPC.MACHINE_COST_SAMPLE, (_event, targets: MachineCostTarget[]) =>
    sampleMachineCosts(
      Array.isArray(targets)
        ? targets.filter((target): target is MachineCostTarget =>
          typeof target?.panelId === 'string' &&
          Number.isSafeInteger(target.pid) && target.pid > 0
        )
        : []
    )
  )

  // The renderer's half of clearing wants-you. Main sees typing (pty:write
  // clears it there) but cannot see FOCUS, which is the other way a user says
  // "I have read this panel" — hence a channel rather than more inference.
  ipcMain.handle(IPC.AGENT_ACKNOWLEDGE, (_event, panelId: PanelId) => {
    ptyManager.acknowledge(panelId)
  })

  ipcMain.handle(IPC.LAYOUT_LOAD, () => layoutStore.initial())

  ipcMain.handle(IPC.LAYOUT_SAVE, (_event, state: CanvasState, meta?: unknown) => {
    layoutStore.save(state)
    // M351. An agent's own caps live on its chat's record, so a save is where
    // one can change. After the store, which is what the caps are read from.
    agents.capsChanged?.()
    // After the store, never before: the shared canvas diffs the STORE's copy
    // (restore settings applied), not the renderer's raw state.
    const ack = (meta as { sharedAck?: unknown } | undefined)?.sharedAck
    presence.canvasSaved(typeof ack === 'number' && Number.isSafeInteger(ack) && ack >= 0 ? ack : undefined)
  })

  ipcMain.handle(IPC.SESSION_BACKEND, () => getBackendInfo())
  ipcMain.handle(IPC.SESSION_LAST_EXIT, () => lastExit())

  ipcMain.handle(IPC.ENV_REPORT, (_event, again?: boolean) => envReport(again === true))
  ipcMain.handle(IPC.EXPORT_PANEL_TEXT, (_event, req: PanelTextExportRequest) => exporters.panelText(req))
  ipcMain.handle(IPC.EXPORT_CANVAS_PNG, () => exporters.canvasPng())
  ipcMain.handle(IPC.EXPORT_DECK_PDF, (_event, req: DeckPdfExportRequest) => exporters.deckPdf(req))
  ipcMain.handle(IPC.DECK_EXPORT_PPTX, (_event, req: { path: string }) => exporters.deckPptx(req))
  ipcMain.handle(IPC.REVIEW_DISCARD, (_event, req: ReviewDiscardRequest) => reviewDiscard(req))
  ipcMain.handle(IPC.LEDGER_LIST, (_event, panelId: string, limit: number) => ledgerList(panelId, Math.max(1, Math.min(200, limit))))
  // M300. The same clamp the list read takes, for the same reason: a limit is
  // the caller's ask, not the caller's authority over how much main reads.
  ipcMain.handle(IPC.LEDGER_TIMELINE, (_event, filter: TimelineFilter, limit: number) => ledgerTimeline(filter ?? {}, Math.max(1, Math.min(200, limit))))
  // The `kind` is MAIN's, never the caller's: a door that took the discriminant
  // from the renderer could write a usage or a gap row through the event door.
  ipcMain.handle(IPC.LEDGER_EVENT, (_event, row: Omit<EventRow, 'kind'>) => ledgerEvent({ ...row, kind: 'event' }))
  // M306. A non-string is not an id; the store validates the alphabet again.
  ipcMain.handle(IPC.CHECK_OUTPUT, (_event, runId: unknown) => (typeof runId === 'string' ? checkOutput(runId) : { kind: 'missing' as const }))
  ipcMain.handle(IPC.LINK_OPEN, (_event, req: { panelId: string; target: string }) => links.open(req))
  ipcMain.handle(IPC.DIAGNOSTICS_SAMPLE, () => ({
    ipcMessagesPerSecond: ptyManager.ipcMessageRate()
  }))
  ipcMain.handle(IPC.DIAGNOSTICS_EXPORT, (_event, snapshot: DiagnosticsSnapshot) =>
    writeDiagnosticsBundle({ dir: diagnosticsDir }, snapshot)
  )

  ipcMain.handle(IPC.PRESET_LIST, () => palette.list())
  ipcMain.handle(IPC.PRESET_RENAME, (_event, id: string, name: string) => palette.rename(id, name))
  ipcMain.handle(IPC.PRESET_DELETE, (_event, id: string) => palette.remove(id))
  ipcMain.handle(IPC.PRESET_SET_DEFAULT, (_event, id: string) => palette.setDefault(id))
  ipcMain.handle(IPC.PRESET_SPAWN_BY_ID, (_event, id: string) => palette.spawn(id))
  ipcMain.handle(IPC.PRESET_MARK_REVIEWED, (_event, id: string) => palette.markPresetReviewed(id))
  ipcMain.handle(IPC.PRESET_SAVE_PANEL, (_event, captured: CapturedPanel) => {
    palette.savePanel(captured)
  })
  ipcMain.handle(IPC.CANVAS_REQUEST_RESET, () => palette.requestReset())

  ipcMain.handle(IPC.PROMPT_LIST, (_event, cwd: string | null) => palette.listPrompts(cwd))
  ipcMain.handle(IPC.PROMPT_SAVE, (_event, name: string, body: string) => palette.savePrompt(name, body))
  ipcMain.handle(IPC.PROMPT_DELETE, (_event, id: string) => palette.removePrompt(id))
  ipcMain.handle(IPC.PRESET_TEMPLATE, (_event, id: string) => palette.presetTemplate(id))
  ipcMain.handle(IPC.MEMORY_LIST, (_event, root: string, limit: number) => palette.memoryList(root, limit))
  ipcMain.handle(IPC.MEMORY_ADD, (_event, req: { root: string; kind: string; text: string; panelId?: string; source?: { conversationId: string; turnId: string; taskId?: string } }) => palette.memoryAdd(req))
  ipcMain.handle(IPC.TEMPLATE_LIST, () => palette.listTemplates())
  // Round 6. The payload is READ here, not cast. Everything on the other side
  // of this bridge is the renderer's — the React Flow editor, the palette's
  // verb, a draft restored from memory — and a record that the layout reader
  // will later refuse is a save that appears to succeed and is gone after the
  // next relaunch, with nothing left pointing at the save that caused it. The
  // refusal is named here, while the person is still looking at the diagram.
  ipcMain.handle(IPC.TEMPLATE_SAVE, (_event, template: unknown, expectedRevision?: number): TemplateSaveResult => {
    const read = incomingWorkflowGraphSchema.safeParse(template)
    if (!read.success) return { kind: 'refused', reason: `that is not a workflow this app can save — ${graphProblems(read.error)[0] ?? 'it has the wrong shape'}` }
    return palette.saveTemplate(read.data as Omit<PersistedTemplate, 'id'> & { id?: string }, typeof expectedRevision === 'number' ? expectedRevision : undefined)
  })
  ipcMain.handle(IPC.TEMPLATE_DELETE, (_event, id: string) => palette.removeTemplate(id))
  ipcMain.handle(IPC.TEAMMATE_LIST, () => palette.listTeammates())
  ipcMain.handle(IPC.TEAMMATE_SAVE, (_event, teammate: PersistedTeammate, cwd?: string) => palette.saveTeammate(teammate, cwd))
  ipcMain.handle(IPC.TEAMMATE_DELETE, (_event, id: string) => palette.removeTeammate(id))
  ipcMain.handle(IPC.TEAMMATE_CHOOSE_PLACE, () => palette.choosePlace())
  ipcMain.handle(IPC.ROUTINE_LIST, () => palette.listRoutines())
  ipcMain.handle(IPC.ROUTINE_SAVE, (_event, routine: PersistedRoutine) => palette.saveRoutine(routine))
  ipcMain.handle(IPC.ROUTINE_DELETE, (_event, id: string) => palette.removeRoutine(id))
  ipcMain.handle(IPC.ROUTINE_RUN, (_event, id: string) => palette.runRoutine(id))
  // M127. The shelf is written WHOLE — the columns are one record and a
  // per-column channel would let a half-applied drag persist.
  ipcMain.handle(IPC.SHELF_LIST, () => palette.shelf())
  ipcMain.handle(IPC.SHELF_SAVE, (_event, shelf: Shelf) => palette.saveShelf(shelf))
  // M128. One plugin's details, verbatim and parsed nowhere. Asked only by a
  // skill panel that names a plugin — never on a toolbox read.
  ipcMain.handle(IPC.PLUGIN_DETAILS, (_event, id: string) => pluginDetails(id))

  // expandTilde, deliberately NOT resolveCwd: `~` expansion is main's job and
  // the renderer has no process.env to do it with — the same boundary
  // readProjectPrompts sits on — but resolveCwd's existence-fallback is a
  // SPAWN-safety behaviour (never fail a shell over a missing cwd) that is
  // wrong here. A directory that vanished under an expanded tree node must
  // reach readDir's own `gone` arm, not silently render $HOME's contents
  // under a heading that still names the deleted directory.
  ipcMain.handle(IPC.FS_LIST, (_event, path: string) =>
    readDir(expandTilde(path), { showHidden: layoutStore.getSetting('files.showHidden') === true })
  )

  ipcMain.handle(IPC.SETTINGS_LIST, () =>
    SETTINGS.map((def) => ({
      id: def.id,
      label: def.label,
      description: def.description,
      keywords: [...def.keywords],
      type: def.type,
      value: layoutStore.getSetting(def.id),
      persisted: def.id in layoutStore.preferences(),
      category: def.category,
      // Passed through so the palette can reject an out-of-range edit before
      // it ever reaches this process's own (silent) range check below.
      min: def.min,
      max: def.max,
      // Copied, not passed by reference: the row crosses the bridge as a
      // clone anyway, and an absent field must stay ABSENT (a boolean row
      // has no values), so the spread-with-undefined trap is avoided by
      // building the field only when the schema has one.
      ...(def.values ? { values: [...def.values] } : {})
    }))
  )
  ipcMain.handle(IPC.SETTINGS_SET, (_event, id: string, value: SettingValue) => {
    layoutStore.setPreference(id, value)
    // M351. The Settings caps are every agent's default: re-read them now, not at the next send.
    if (id === 'agents.nodeCapUsd' || id === 'agents.nodeCapContextK') agents.capsChanged?.()
    // The Restore submenu renders checkbox state from the same schema, so a
    // toggle made in the palette has to redraw it or the two surfaces disagree
    // until the next unrelated rebuild.
    rebuildMenu()
    // M45. And the renderer re-reads, for the same reason in the other
    // direction: the theme applies the moment it is written, not on the next
    // palette open.
    getWindow()?.webContents.send(IPC_EVENTS.SETTINGS_CHANGED, id)
  })

  // Straight through to the store, with no PaletteHandlers indirection: unlike
  // preset:spawn-by-id (which needs main's command resolution) and
  // canvas:request-reset (which needs main's dialog), nothing here needs a
  // collaborator main/index.ts owns. A handler that just forwards is the right
  // shape when there is genuinely nothing to add.
  ipcMain.handle(IPC.WORKSPACE_LIST, () => layoutStore.workspaces())

  ipcMain.handle(
    IPC.WORKSPACE_ACTIVATE,
    (_event, id: string, outgoing: CanvasState) => {
      const result = layoutStore.activateWorkspace(id, outgoing)
      presence.canvasActivated()
      return result
    }
  )

  ipcMain.handle(IPC.WORKSPACE_CREATE, (_event, name: string) =>
    layoutStore.createWorkspace(name)
  )

  ipcMain.handle(IPC.WORKSPACE_RENAME, (_event, id: string, name: string) =>
    layoutStore.renameWorkspace(id, name)
  )

  ipcMain.handle(IPC.WORKSPACE_DELETE, (_event, id: string) =>
    layoutStore.deleteWorkspace(id)
  )

  ipcMain.handle(IPC.WORKSPACE_MERGED, (): MergedWorkspace[] => layoutStore.mergedWorkspaces())

  ipcMain.handle(
    IPC.WORKSPACE_MOVE_PANELS,
    (
      _event,
      panelIds: PanelId[],
      target: { workspaceId: string } | { newName: string }
    ): { workspaceId: string } | null => layoutStore.movePanels(panelIds, target)
  )

  ipcMain.handle(IPC.REVIEW_PANEL, (_event, panelId: PanelId) => reviewEngine.review(panelId))

  // `?? null`, never undefined: an invoke's reply crosses a structured
  // clone, and `undefined` and "no such panel" would be the same value on
  // the far side of it — the absent-vs-present distinction this codebase
  // already guards for `command`.
  ipcMain.handle(IPC.REVIEW_BASELINE, (_event, panelId: PanelId) =>
    layoutStore.baseline(panelId) ?? null)

  // The subject is unpacked HERE rather than in the engine: the engine's
  // question is about a baseline and a subject id, and teaching it the
  // renderer's node shape would make it a second reader of a persisted type.
  ipcMain.handle(IPC.REVIEW_AT, (_event, subject: ReviewSubject) =>
    reviewEngine.reviewAt(
      { root: subject.repoRoot, sha: subject.baselineSha },
      subject.subjectId
    ))

  ipcMain.handle(IPC.REVIEW_DIFF, (_event, req: ReviewDiffRequest) =>
    reviewEngine.fileDiff(req))

  ipcMain.handle(IPC.REVIEW_COMMIT, (_event, req: ReviewCommitRequest) => reviewCommit(req))

  // Metadata only, on every arm. The store's list() already projects field by
  // field; this handler must not re-widen it, and verify:meta 20/21 pin
  // that as source text because no runtime behaviour can observe the
  // difference — everything keeps working, and the renderer simply holds a
  // secret it should never have.
  //
  // Account sessions share the store but not these doors: they are minted by
  // the sign-in flow and listed by auth:sessions. Filtered here, so the
  // Credentials palette never offers a paste or a delete for one — a pasted
  // "session" would be a forged identity.
  ipcMain.handle(IPC.CREDENTIAL_LIST, () => credentialStore.list().filter((m) => accountOfCredentialKey(m.service) === undefined))

  ipcMain.handle(IPC.CREDENTIAL_SET, (_event, req: { service: string; token: string }) => {
    // A malformed payload must refuse like any other rejection, not throw: an
    // uncaught TypeError from `token.trim()` still crosses back as a rejected
    // invoke, but the renderer's `.then` never runs and the prompt hangs open
    // with no feedback. The reason stays generic — it must not echo the
    // payload back.
    if (typeof req?.service !== 'string' || typeof req?.token !== 'string') {
      return { ok: false, reason: 'malformed request' }
    }
    if (accountOfCredentialKey(req.service) !== undefined) return { ok: false, reason: 'an account is signed in, never pasted' }
    return credentialStore.set(req.service, req.token)
  })

  ipcMain.handle(IPC.CREDENTIAL_DELETE, (_event, service: string) =>
    typeof service === 'string' && accountOfCredentialKey(service) === undefined && credentialStore.delete(service))

  // The one caller of credentialStore.read(), and it never returns what it
  // reads: read() supplies the token to a request and verifyCredential
  // answers with what the service said. No handler in this file may call
  // read() directly — that would put a token on the IPC boundary.
  ipcMain.handle(IPC.CREDENTIAL_VERIFY, (_event, service: string) =>
    service === 'jira'
      ? verifyJiraCredential({ store: credentialStore, requester: createJiraRequester() })
      : verifyCredential({ store: credentialStore, fetcher: createHttpsFetcher() }, service))

  // M88. The same injected shape as Jira's, so the harness drives the node
  // over a recorded requester through `palette.githubList`.
  ipcMain.handle(IPC.BROKER_AUDIT, (_event, limit: number, service?: string) => palette.brokerAudit(Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 100, typeof service === 'string' && service !== '' ? service : undefined))
  ipcMain.handle(IPC.GITHUB_LIST, (_event, panelId?: string) => palette.githubList(typeof panelId === 'string' && panelId !== '' ? panelId : undefined))
  ipcMain.handle(IPC.JIRA_LIST, () =>
    listAssignedWorkItems({ store: credentialStore, requester: createJiraRequester() }))

  ipcMain.handle(IPC.JIRA_TRANSITIONS, (_event, itemId: string) =>
    listWorkItemTransitions({ store: credentialStore, requester: createJiraRequester() }, itemId))
  // The two writes. Each performs ONE named mutation and returns an arm —
  // never the stored `email`, never the stored `token`, and never anything
  // derived from either. Named per field rather than as "the credential
  // bundle", because `site` legitimately DOES cross, inside `WorkItem.url`.
  ipcMain.handle(IPC.JIRA_COMMENT, (_event, req: { itemId: string; body: string }) =>
    commentOnWorkItem({ store: credentialStore, requester: createJiraRequester() }, req.itemId, req.body))
  ipcMain.handle(IPC.JIRA_TRANSITION, (_event, req: { itemId: string; transitionId: string }) =>
    transitionWorkItem({ store: credentialStore, requester: createJiraRequester() }, req.itemId, req.transitionId))

  ipcMain.handle(IPC.FILE_OPEN, async () => {
    const win = getWindow()
    const result = win === null
      ? await dialog.showOpenDialog({ properties: ['openFile'] })
      : await dialog.showOpenDialog(win, { properties: ['openFile'] })
    // ?? null, never undefined: undefined does not survive the structured
    // clone as a distinguishable value, the rule this file already follows.
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.FILE_READ, (event, req: FileReadRequest) => {
    // The watch's callback sends to the SAME webContents that asked. A reload
    // replaces those contents and closeAll() runs on navigation, so a stale
    // sender is never reached — but capturing it here rather than reaching for
    // a module-level window is what makes that true rather than incidental.
    const sender = event.sender
    return fileWatchers.watch(req.panelId, req.path, (result) => {
      if (sender.isDestroyed()) return
      sender.send(IPC_EVENTS.FILE_CHANGED, { panelId: req.panelId, result })
    }, req.encoding === 'base64' ? 'base64' : undefined)
  })

  ipcMain.handle(IPC.FILE_CLOSE, (_event, panelId: PanelId) => {
    fileWatchers.close(panelId)
  })

  // M366. Main's one toolbox read is its own door now (`toolbox-door.ts`),
  // so `tc toolbox` asks through the same directory rule over the same cache.
  const toolboxDoor = createToolboxDoor({
    cache: toolboxCache,
    home: resolveToolboxHome,
    stampsFor: (panelId) => ptyManager.configStampsFor(panelId),
    listPlugins
  })
  ipcMain.handle(IPC.TOOLBOX_READ, (_event, req: ToolboxReadRequest) => toolboxDoor(req))

  ipcMain.handle(IPC.TOOLBOX_PERMISSIONS, (_event, req: ToolboxPermissionsRequest) => {
    return readPermissionRules(req.path, req.bucket)
  })

  // M129. The four writers — the only handlers in this file that put bytes
  // into ~/.claude. Every rule they enforce lives in main/skill-write.ts;
  // nothing here decides anything, for credential-store.ts's own division
  // between deciding and writing.
  ipcMain.handle(IPC.SKILL_WRITE, (_event, req: SkillWriteRequest) => skillWriters.write(req))
  ipcMain.handle(IPC.SKILL_CREATE, (_event, req: SkillCreateRequest) => skillWriters.create(req))
  ipcMain.handle(IPC.SKILL_RENAME, (_event, req: SkillRenameRequest) => skillWriters.rename(req))
  ipcMain.handle(IPC.SKILL_DELETE, (_event, req: SkillDeleteRequest) => skillWriters.remove(req))
  ipcMain.handle(IPC.SKILL_TRAIL, (_event, panelId: string) => skillTrail(panelId))
  ipcMain.handle(IPC.FILE_WRITE, (_event, req: FileWriteRequest) =>
    // No sender capture, unlike FILE_READ: this is a plain request/response
    // with nothing to push afterwards. Our own write lands back through the
    // watcher like any other change, which is what makes the panel update
    // itself with no second code path.
    // Only the one known encoding is honoured; anything else the renderer sends is text.
    writeFile(req.path, req.content, req.baseMtimeMs, req.encoding === 'base64' ? 'base64' : undefined))

  // M27. Create a note. Deliberately NOT folded into FILE_WRITE — see
  // IPC.FILE_CREATE's own comment for why a create and a compare-and-swap
  // cannot share a door. No sender capture, for FILE_WRITE's reason: the
  // renderer opens the panel from the returned path, and every change after
  // that arrives through the existing watch like any other.
  ipcMain.handle(IPC.FILE_CREATE, (_event, req: FileCreateRequest) =>
    createFile(req.root, req.name, req.seed))
}

/**
 * A main -> renderer REQUEST, answered on an ephemeral channel invented per
 * call. Two callers now (canvas:counts and preset:capture), which is why it is
 * general rather than a second copy of the same trick.
 *
 * Resolves to `fallback` if the renderer does not answer in time. A dialog
 * that never opens is a worse failure than one that undercounts, and a capture
 * that hangs would wedge the menu.
 *
 * The sequence number matters: two requests inside the same millisecond would
 * otherwise share a reply channel, and the first `once` listener would consume
 * the other's answer.
 */
let replySeq = 0

export function requestFromRenderer<T>(
  webContents: WebContents,
  channel: string,
  fallback: T,
  timeoutMs = 1000
): Promise<T> {
  return new Promise((resolve) => {
    const replyChannel = `${channel}:reply:${Date.now()}:${(replySeq += 1)}`
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners(replyChannel)
      resolve(fallback)
    }, timeoutMs)
    ipcMain.once(replyChannel, (_event, payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
    webContents.send(channel, replyChannel)
  })
}

/**
 * M113. The same one-shot reply as above, with a PAYLOAD beside the reply
 * channel: `tc board add` carries a title where counts and model carry
 * nothing. A sibling rather than a widened parameter so the two existing
 * callers' wire shape (a bare channel string) stays byte-identical.
 */
export function requestFromRendererWith<T, P>(
  webContents: WebContents,
  channel: string,
  payload: P,
  fallback: T,
  timeoutMs = 1000
): Promise<T> {
  return new Promise((resolve) => {
    const replyChannel = `${channel}:reply:${Date.now()}:${(replySeq += 1)}`
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners(replyChannel)
      resolve(fallback)
    }, timeoutMs)
    ipcMain.once(replyChannel, (_event, reply: T) => {
      clearTimeout(timer)
      resolve(reply)
    })
    webContents.send(channel, { replyChannel, req: payload })
  })
}

export function requestCanvasCounts(
  webContents: WebContents
): Promise<{ panels: number; running: number }> {
  return requestFromRenderer(webContents, IPC_EVENTS.CANVAS_COUNTS, { panels: 0, running: 0 })
}
