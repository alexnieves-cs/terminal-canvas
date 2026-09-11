import type { SnapshotMeta, ClipboardFile } from '@shared/ipc-contract'
import type { UsageRow } from '@shared/run-ledger'
import type { SkillWriteRequest, SkillCreateRequest, SkillRenameRequest, SkillDeleteRequest } from '@shared/ipc-contract'
import type { PreviewCaptureResult, AssetPutResult, NodeFetchResult, PortableWriteResult, PortableReadResult } from '@shared/ipc-contract'
import type { Discovery as PreviewDiscovery } from '@shared/preview'
import type { Trail } from '@shared/skill-trail'
import type { SkillWriteResult } from '@shared/skill-edit'
import { ipcMain, dialog, type WebContents, type BrowserWindow } from 'electron'
import { statSync } from 'node:fs'
import type { WatcherCreateRequest, WatcherCreateResult, WatcherStateEvent, GithubListResult } from '@shared/ipc-contract'
import type { AgentSessionSpec, AgentCreateResult, SendAnswer, AgentSessionSnapshot, AgentTranscriptResult, AgentImportRequest, AutoStartRequest, AutoStartResult, AgentImportResult, ChatAttachment, ClipboardImage } from '../shared/agent-session'
import type { PermissionAnswer } from '../shared/transcript'
import { IPC, IPC_EVENTS, type SpawnRequest, type SpawnResult } from '../shared/ipc-contract'
import { INERT_ENV_REPORT, type EnvReport } from '../shared/env-report'
import { INERT_LINKS, type LinkHandlers } from './link-open'
import type { BrowserHandlers } from './browser-read'
import type { ImageResult, StarterFiles } from '../shared/starter'
import type { TemplateSaveResult } from '../shared/templates'
import type { BrowserReadRequest } from '../shared/browser-panel'
import type { BoardLaneRequest, BoardLaneResult, BoardOpenPrRequest, BoardOpenPrResult, BoardCommentRequest, BoardCommentResult, PanelSearchResult, UpdateResult , PoolStartRequest, PoolStartResult, BoardRepositoriesResult } from '../shared/ipc-contract'
import type { LaneStatus } from '../shared/review'
import type { RunRow } from '../shared/run-ledger'
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
import { readPermissionRules, resolveToolboxHome } from './toolbox-read'
import { resolveCwd } from './pty-manager'
import { writeFile } from './file-write'
import { createFile } from './file-create'
import { sampleMachineCosts } from './machine-cost'
import type { MachineCostTarget } from '../shared/machine-cost'
import { writeDiagnosticsBundle } from './diagnostics-export'
import type { DiagnosticsSnapshot } from '../shared/ipc-contract'

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
   * pick does, so the two cannot drift apart.
   */
  spawn(id: string): void
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
  requestReset(): void
  listPrompts(cwd: string | null): PromptListRow[]
  savePrompt(name: string, body: string): void
  /** M80. Templates: the list (built-ins first), a save, a delete that refuses a built-in. */
  /** M80. The preset's resolved template, or null. */
  presetTemplate(id: string): PresetTemplate | null
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
  memoryAdd(req: { root: string; kind: string; text: string; panelId?: string }): Promise<{ ok: true } | { ok: false; reason: string }>
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
  /** M252. Appended last, like every collaborator before it — a harness that does not wire it gets a named refusal, never a process. */
  tools: ToolHandlers = INERT_TOOLS
): void {
  ipcMain.handle(IPC.TOOL_GENERATE, (_event, req: { description: string; folder: string }) => tools.generate(req))
  ipcMain.handle(IPC.UPDATE_CHECK, () => update.check())
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
  ipcMain.handle(IPC.REVIEW_ACROSS, (_event, root: string) => reviewEngine.reviewAcross(root))
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

  ipcMain.handle(IPC.LAYOUT_SAVE, (_event, state: CanvasState) => {
    layoutStore.save(state)
  })

  ipcMain.handle(IPC.SESSION_BACKEND, () => getBackendInfo())

  ipcMain.handle(IPC.ENV_REPORT, (_event, again?: boolean) => envReport(again === true))
  ipcMain.handle(IPC.EXPORT_PANEL_TEXT, (_event, req: PanelTextExportRequest) => exporters.panelText(req))
  ipcMain.handle(IPC.EXPORT_CANVAS_PNG, () => exporters.canvasPng())
  ipcMain.handle(IPC.EXPORT_DECK_PDF, (_event, req: DeckPdfExportRequest) => exporters.deckPdf(req))
  ipcMain.handle(IPC.DECK_EXPORT_PPTX, (_event, req: { path: string }) => exporters.deckPptx(req))
  ipcMain.handle(IPC.REVIEW_DISCARD, (_event, req: ReviewDiscardRequest) => reviewDiscard(req))
  ipcMain.handle(IPC.LEDGER_LIST, (_event, panelId: string, limit: number) => ledgerList(panelId, Math.max(1, Math.min(200, limit))))
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
  ipcMain.handle(IPC.PRESET_SAVE_PANEL, (_event, captured: CapturedPanel) => {
    palette.savePanel(captured)
  })
  ipcMain.handle(IPC.CANVAS_REQUEST_RESET, () => palette.requestReset())

  ipcMain.handle(IPC.PROMPT_LIST, (_event, cwd: string | null) => palette.listPrompts(cwd))
  ipcMain.handle(IPC.PROMPT_SAVE, (_event, name: string, body: string) => palette.savePrompt(name, body))
  ipcMain.handle(IPC.PROMPT_DELETE, (_event, id: string) => palette.removePrompt(id))
  ipcMain.handle(IPC.PRESET_TEMPLATE, (_event, id: string) => palette.presetTemplate(id))
  ipcMain.handle(IPC.MEMORY_LIST, (_event, root: string, limit: number) => palette.memoryList(root, limit))
  ipcMain.handle(IPC.MEMORY_ADD, (_event, req: { root: string; kind: string; text: string; panelId?: string }) => palette.memoryAdd(req))
  ipcMain.handle(IPC.TEMPLATE_LIST, () => palette.listTemplates())
  ipcMain.handle(IPC.TEMPLATE_SAVE, (_event, template: Omit<PersistedTemplate, 'id'> & { id?: string }, expectedRevision?: number) => palette.saveTemplate(template, typeof expectedRevision === 'number' ? expectedRevision : undefined))
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
    (_event, id: string, outgoing: CanvasState) =>
      layoutStore.activateWorkspace(id, outgoing)
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
  ipcMain.handle(IPC.CREDENTIAL_LIST, () => credentialStore.list())

  ipcMain.handle(IPC.CREDENTIAL_SET, (_event, req: { service: string; token: string }) => {
    // A malformed payload must refuse like any other rejection, not throw: an
    // uncaught TypeError from `token.trim()` still crosses back as a rejected
    // invoke, but the renderer's `.then` never runs and the prompt hangs open
    // with no feedback. The reason stays generic — it must not echo the
    // payload back.
    if (typeof req?.service !== 'string' || typeof req?.token !== 'string') {
      return { ok: false, reason: 'malformed request' }
    }
    return credentialStore.set(req.service, req.token)
  })

  ipcMain.handle(IPC.CREDENTIAL_DELETE, (_event, service: string) =>
    credentialStore.delete(service))

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
    })
  })

  ipcMain.handle(IPC.FILE_CLOSE, (_event, panelId: PanelId) => {
    fileWatchers.close(panelId)
  })

  ipcMain.handle(IPC.TOOLBOX_READ, (_event, req: ToolboxReadRequest) => {
    // M194. Inspection must never borrow the spawn resolver's home fallback:
    // a deleted project would otherwise display HOME's tools as its own.
    if (req.cwd === '') return { kind: 'no-cwd' }
    const cwd = expandTilde(req.cwd)
    // Three facts, three sentences. An earlier round of this had two, and the
    // one that named non-existence was the arm that never saw it: `statSync`
    // THROWS on a missing path, so a deleted project always lands in the
    // catch. Each of these has a different fix, which is why they are not
    // merged (the DirResult union's own rule, `shared/fs-tree.ts`).
    if (!cwd.startsWith('/')) return { kind: 'unavailable', reason: `the working directory is not an absolute path (${req.cwd})` }
    try {
      if (!statSync(cwd).isDirectory()) return { kind: 'unavailable', reason: 'that path is a file, not a directory' }
    } catch {
      return { kind: 'unavailable', reason: 'the directory is no longer there — it may have been moved or deleted' }
    }
    return toolboxCache.read(
      {
        cwd,
        home: resolveToolboxHome(),
        spawnStamps: ptyManager.configStampsFor(req.panelId)
      },
      // Passed as a RESOLVER, never pre-awaited here: the cache asks this
      // only on an actual miss, so N toolbox panels sharing one cwd spawn
      // `claude plugin list --json` once, not once per panel. `unknown`
      // reads as no plugins, never as an error surfaced here — the pane
      // already has a place for "the CLI didn't answer" one level up (the
      // ordinary env-report three-state rule), and TOOLBOX_READ has no slot
      // to carry a second one through.
      async () => {
        const pluginsResult = await listPlugins()
        return pluginsResult.kind === 'ok' ? pluginsResult.plugins : undefined
      }
    )
  })

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
    writeFile(req.path, req.content, req.baseMtimeMs))

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
