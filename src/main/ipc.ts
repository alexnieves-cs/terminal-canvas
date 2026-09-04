import { ipcMain, dialog, type WebContents, type BrowserWindow } from 'electron'
import type { WatcherCreateRequest, WatcherCreateResult, WatcherStateEvent } from '@shared/ipc-contract'
import type { AgentSessionSpec, AgentCreateResult, SendAnswer, AgentSessionSnapshot, AgentTranscriptResult, AgentImportRequest, AgentImportResult, ChatAttachment, ClipboardImage } from '../shared/agent-session'
import type { PermissionAnswer } from '../shared/transcript'
import { IPC, IPC_EVENTS, type SpawnRequest, type SpawnResult } from '../shared/ipc-contract'
import { INERT_ENV_REPORT, type EnvReport } from '../shared/env-report'
import { INERT_LINKS, type LinkHandlers } from './link-open'
import type { RunRow } from '../shared/run-ledger'
import type {
  PanelId,
  PanelSpec,
  PtyResizeRequest,
  PtyWriteRequest
} from '../shared/types'
import type { CanvasState } from '../shared/layout-schema'
import type { PersistedTemplate } from '../shared/templates'
import type { PresetTemplate, SessionBackendInfo, PresetListRow, CapturedPanel, MergedWorkspace, FileReadRequest, FileWriteRequest, FileCreateRequest, ToolboxReadRequest, ToolboxPermissionsRequest, WorktreeListRow, WorktreeRemoveResult, ScrollbackSearchHit } from '../shared/ipc-contract'
import { INERT_EXPORTERS, type Exporters } from './export'
import type { ReviewSubject, ReviewDiffRequest, ReviewCommitRequest, ReviewCommitResult, ReviewDiscardRequest, ReviewDiscardResult } from '../shared/review'
import type { PtyManager } from './pty-manager'
import { expandTilde } from './pty-manager'
import type { LayoutStore } from './layout-store'
import type { PromptListRow } from './prompts'
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
  /** M85. Every `.md` under the vault root. */
  vaultRead(root: string): { root: string; notes: unknown[]; skipped: number; reason?: string }
  memoryList(root: string, limit: number): Promise<{ root: string; entries: unknown[]; skipped: number }>
  memoryAdd(req: { root: string; kind: string; text: string; panelId?: string }): Promise<{ ok: true } | { ok: false; reason: string }>
  listTemplates(): PersistedTemplate[]
  saveTemplate(template: Omit<PersistedTemplate, 'id'> & { id?: string }): PersistedTemplate
  removeTemplate(id: string): boolean
  removePrompt(id: string): boolean
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
  /** M42. panelIds are supplied by the handler from the layout, never by the renderer. */
  search(panelIds: PanelId[], query: string): Promise<ScrollbackSearchHit[]>
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
  interrupt(id: string): boolean
  dispose(req: { id: string; drop: boolean }): void
  answer(req: { id: string; requestId: string; answer: PermissionAnswer }): boolean
  list(): AgentSessionSnapshot[]
  transcript(id: string): AgentTranscriptResult
  /** M74. */
  importSession(req: AgentImportRequest): AgentImportResult
}

const INERT_AGENTS: AgentHandlers = {
  create: () => ({ kind: 'refused', reason: 'the agent runtime is not available' }),
  send: () => 'no-session',
  clipboardImage: () => null,
  interrupt: () => false,
  dispose: () => {},
  answer: () => false,
  list: () => [],
  transcript: () => ({ turns: [], snapshot: null }),
  importSession: () => ({ kind: 'refused', reason: 'the agent runtime is not available' })
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

const INERT_SCROLLBACK: ScrollbackHandlers = {
  tail: async () => [],
  clear: async () => {},
  search: async () => []
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
  envReport: () => EnvReport = () => INERT_ENV_REPORT,
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
  watchers: WatcherHandlers = INERT_WATCHERS
): void {
  ipcMain.handle(IPC.AGENT_CREATE, (_event, spec: AgentSessionSpec) => agents.create(spec))
  ipcMain.handle(IPC.AGENT_SEND, (_event, id: string, text: string, attachments: ChatAttachment[] = []) => agents.send(id, text, Array.isArray(attachments) ? attachments : []))
  ipcMain.handle(IPC.AGENT_CLIPBOARD_IMAGE, () => agents.clipboardImage())
  ipcMain.handle(IPC.AGENT_INTERRUPT, (_event, id: string) => agents.interrupt(id))
  ipcMain.handle(IPC.AGENT_DISPOSE, (_event, req: { id: string; drop: boolean }) => agents.dispose(req))
  ipcMain.handle(IPC.AGENT_ANSWER, (_event, req: { id: string; requestId: string; answer: PermissionAnswer }) => agents.answer(req))
  ipcMain.handle(IPC.AGENT_LIST, () => agents.list())
  ipcMain.handle(IPC.AGENT_TRANSCRIPT, (_event, id: string) => agents.transcript(id))
  ipcMain.handle(IPC.AGENT_IMPORT, (_event, req: AgentImportRequest) => agents.importSession(req))
  ipcMain.handle(IPC.GIT_STATUS, (_event, root: string) => reviewEngine.status(root))
  ipcMain.handle(IPC.REVIEW_ACROSS, (_event, root: string) => reviewEngine.reviewAcross(root))
  ipcMain.handle(IPC.VAULT_READ, (_event, root: string) => palette.vaultRead(root))
  ipcMain.handle(IPC.WATCHER_CREATE, (_event, req: WatcherCreateRequest) => watchers.create(req))
  ipcMain.handle(IPC.WATCHER_RUN, (_event, id: string) => watchers.run(id))
  ipcMain.handle(IPC.WATCHER_STOP, (_event, id: string) => watchers.stop(id))
  ipcMain.handle(IPC.WATCHER_DISPOSE, (_event, id: string) => watchers.dispose(id))
  ipcMain.handle(IPC.WATCHER_LIST, () => watchers.list())
  ipcMain.handle(IPC.SCROLLBACK_TAIL, (_event, req: { panelId: PanelId; lines: number }) =>
    scrollback.tail(req.panelId, Math.max(1, Math.min(200, Math.floor(req.lines)))))
  ipcMain.handle(IPC.SCROLLBACK_CLEAR, () => scrollback.clear())
  // M42. The id list is MAIN's — every panel in every workspace — never a
  // renderer argument: a closed panel's log is already dropped, and a search
  // that accepted ids could ask for one the layout no longer holds.
  ipcMain.handle(IPC.SCROLLBACK_SEARCH, (_event, query: string): Promise<ScrollbackSearchHit[]> => {
    const ids = new Set<PanelId>()
    for (const ws of layoutStore.mergedWorkspaces()) {
      for (const panel of ws.panels) ids.add(panel.id)
    }
    return scrollback.search([...ids], query)
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

  ipcMain.handle(IPC.ENV_REPORT, () => envReport())
  ipcMain.handle(IPC.EXPORT_PANEL_TEXT, (_event, panelId: string) => exporters.panelText(panelId))
  ipcMain.handle(IPC.EXPORT_CANVAS_PNG, () => exporters.canvasPng())
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
  ipcMain.handle(IPC.TEMPLATE_SAVE, (_event, template: Omit<PersistedTemplate, 'id'> & { id?: string }) => palette.saveTemplate(template))
  ipcMain.handle(IPC.TEMPLATE_DELETE, (_event, id: string) => palette.removeTemplate(id))

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
    // resolveCwd is pty-manager's — the SAME expansion a spawn gets, so the
    // toolbox and the agent can never disagree about which directory they are
    // describing. index.ts already reaches for it this way for prompts.
    return toolboxCache.read({
      cwd: req.cwd === '' ? '' : resolveCwd(req.cwd),
      home: resolveToolboxHome(),
      spawnStamps: ptyManager.configStampsFor(req.panelId)
    })
  })

  ipcMain.handle(IPC.TOOLBOX_PERMISSIONS, (_event, req: ToolboxPermissionsRequest) => {
    return readPermissionRules(req.path, req.bucket)
  })
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

export function requestCanvasCounts(
  webContents: WebContents
): Promise<{ panels: number; running: number }> {
  return requestFromRenderer(webContents, IPC_EVENTS.CANVAS_COUNTS, { panels: 0, running: 0 })
}
