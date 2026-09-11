import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { hookupIpc } from '@sentry/electron/preload-namespaced'
import type { WatcherStateEvent } from '@shared/ipc-contract'
import type { AgentSessionEvent } from '../shared/agent-session'
import type { PersistedRoutine } from '../shared/routines'
import {
  IPC,
  IPC_EVENTS,
  type CanvasBridge,
  type PresetTemplate,
  type CapturedPanel,
  type SpawnRequest,
  type FileReadRequest, type ToolboxReadRequest, type ToolboxPermissionsRequest,
  type FileWriteRequest,
  type FileCreateRequest,
  type FileChangedEvent,
  type DiagnosticsSnapshot
} from '../shared/ipc-contract'
import type { ReviewSubject, ReviewDiffRequest, ReviewCommitRequest, ReviewDiscardRequest } from '../shared/review'
import type {
  AgentStateUpdate,
  LiveSessionUpdate,
  PanelId,
  PanelSpec,
  PtyDataChunk,
  PtyExitInfo,
  PtyResizeRequest,
  PtyWriteRequest,
  SubagentUpdate
} from '../shared/types'
import type { CanvasState } from '../shared/layout-schema'
import type { PanelTextExportRequest } from '../shared/export'
import type { OrphanRow } from '../shared/orphans'
import type { SettingValue } from '../shared/settings-schema'
import type { PanelUsage } from '../shared/cost'
import type { MachineCostTarget } from '../shared/machine-cost'

/**
 * Every subscribe helper returns its own unsubscribe function. Without this,
 * a React StrictMode double-mount (or any panel remount) stacks duplicate
 * listeners and the same PTY output gets written to xterm twice.
 */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

// M112. The flag main stamped on this window's argv. sandbox is false, so
// process.argv is readable here; the renderer itself never sees argv, which
// is why the fact crosses as a bridge FIELD.
//
// Fix round 1 (review): this preload does NOT call the renderer SDK's own
// init() — it never did anything useful here. Classic IPC mode (main pinned
// it) needs `window.__SENTRY_IPC__` exposed into the MAIN world before the
// renderer's init() runs; without it, `renderer/ipc.js`'s own
// `getImplementation` falls back to fetching `sentry-ipc://…`, which the CSP
// (`default-src 'self'`) refuses with NO error — the exact silent failure
// this whole feature exists to avoid, and main pinning Classic makes worse
// (Both mode's IPC-first, fetch-fallback behaviour becomes fetch-ONLY, since
// nothing ever registers the protocol handler either). `hookupIpc()` is the
// `@sentry/electron/preload-namespaced` entry point that does exactly one
// thing — install a `sendEnvelope`/`sendScope`/… object on `window` and
// bridge it into the main world via `contextBridge.exposeInMainWorld` — with
// none of `@sentry/core`'s weight behind it (confirmed against the installed
// package: it imports only `electron` and its own tiny `common/ipc.js`), so
// it is called PLAINLY here rather than behind a dynamic import the way
// `/main` and `/renderer` are: there is no SDK instrumentation to defer,
// only a namespacing utility, and gating the CALL (not the import) is enough
// to keep a `--tc-telemetry` off run from ever touching `window`.
// verify:meta telemetry.5 pins this shape as text so a future edit cannot
// silently swap this back for the dead `sentryRendererInit` path.
const telemetryEnabled = process.argv.includes('--tc-telemetry=1')
if (telemetryEnabled) {
  hookupIpc()
}

const bridge: CanvasBridge = {
  pty: {
    create: (spec: PanelSpec) => ipcRenderer.invoke(IPC.PTY_CREATE, spec),
    write: (req: PtyWriteRequest) => ipcRenderer.invoke(IPC.PTY_WRITE, req),
    resize: (req: PtyResizeRequest) => ipcRenderer.invoke(IPC.PTY_RESIZE, req),
    kill: (panelId: PanelId) => ipcRenderer.invoke(IPC.PTY_KILL, panelId),
    list: () => ipcRenderer.invoke(IPC.PTY_LIST),
    onData: (listener) => subscribe<PtyDataChunk>(IPC_EVENTS.PTY_DATA, listener),
    onExit: (listener) => subscribe<PtyExitInfo>(IPC_EVENTS.PTY_EXIT, listener)
  },
  machine: {
    sample: (targets: MachineCostTarget[]) => ipcRenderer.invoke(IPC.MACHINE_COST_SAMPLE, targets)
  },
  edit: {
    onCopy: (listener) => subscribe<void>(IPC_EVENTS.EDIT_COPY, listener),
    onPaste: (listener) => subscribe<string>(IPC_EVENTS.EDIT_PASTE, listener),
    onUndo: (listener) => subscribe<void>(IPC_EVENTS.EDIT_UNDO, listener),
    onRedo: (listener) => subscribe<void>(IPC_EVENTS.EDIT_REDO, listener)
  },
  layout: {
    load: () => ipcRenderer.invoke(IPC.LAYOUT_LOAD),
    save: (state: CanvasState) => ipcRenderer.invoke(IPC.LAYOUT_SAVE, state)
  },
  canvas: {
    // canvas:counts is a main -> renderer REQUEST, not an invoke: main sends a
    // one-shot reply channel name, and the renderer answers on it directly
    // rather than the renderer initiating with ipcRenderer.invoke.
    onModel: (provide) => {
      const wrapped = (_event: IpcRendererEvent, replyChannel: string): void => {
        ipcRenderer.send(replyChannel, provide())
      }
      ipcRenderer.on(IPC_EVENTS.CANVAS_MODEL, wrapped)
      return () => ipcRenderer.removeListener(IPC_EVENTS.CANVAS_MODEL, wrapped)
    },
    // M113. The request rides WITH the reply channel: a board op has a payload
    // where counts and model have none.
    // M138. The mint is ASYNC (a chat is created over IPC before it has an
    // id), so the reply is sent when the handler's promise settles — a
    // rejection answers as a refusal naming the error, never silence.
    onPoolMint: (handle) => {
      const wrapped = (_event: IpcRendererEvent, envelope: { replyChannel: string; req: Parameters<typeof handle>[0] }): void => {
        Promise.resolve()
          .then(() => handle(envelope.req))
          .then((reply) => ipcRenderer.send(envelope.replyChannel, reply),
            (error: unknown) => ipcRenderer.send(envelope.replyChannel, { kind: 'refused', reason: error instanceof Error ? error.message : String(error) }))
      }
      ipcRenderer.on(IPC_EVENTS.POOL_MINT, wrapped)
      return () => ipcRenderer.removeListener(IPC_EVENTS.POOL_MINT, wrapped)
    },
    onPlan: (handle) => {
      const wrapped = (_event: IpcRendererEvent, envelope: { replyChannel: string; req: Parameters<typeof handle>[0] }): void => {
        Promise.resolve().then(() => handle(envelope.req)).then(
          (reply) => ipcRenderer.send(envelope.replyChannel, reply),
          () => ipcRenderer.send(envelope.replyChannel, { kind: 'refused', reason: 'the canvas could not execute the plan' }))
      }
      ipcRenderer.on(IPC_EVENTS.CANVAS_PLAN, wrapped)
      return () => ipcRenderer.removeListener(IPC_EVENTS.CANVAS_PLAN, wrapped)
    },
    onBoard: (handle) => {
      const wrapped = (_event: IpcRendererEvent, envelope: { replyChannel: string; req: Parameters<typeof handle>[0] }): void => {
        ipcRenderer.send(envelope.replyChannel, handle(envelope.req))
      }
      ipcRenderer.on(IPC_EVENTS.BOARD_ADD, wrapped)
      return () => ipcRenderer.removeListener(IPC_EVENTS.BOARD_ADD, wrapped)
    },
    onCounts: (provide) => {
      const wrapped = (_event: IpcRendererEvent, replyChannel: string): void => {
        ipcRenderer.send(replyChannel, provide())
      }
      ipcRenderer.on(IPC_EVENTS.CANVAS_COUNTS, wrapped)
      return () => ipcRenderer.removeListener(IPC_EVENTS.CANVAS_COUNTS, wrapped)
    },
    onReset: (listener) => subscribe<void>(IPC_EVENTS.CANVAS_RESET, listener),
    onTidy: (listener) => subscribe<void>(IPC_EVENTS.CANVAS_TIDY, () => listener()),
    onFeedback: (listener) => subscribe<void>(IPC_EVENTS.CANVAS_FEEDBACK, () => listener()),
    onFlip: (listener) => subscribe<void>(IPC_EVENTS.CANVAS_FLIP, () => listener()),
    requestReset: () => ipcRenderer.invoke(IPC.CANVAS_REQUEST_RESET)
  },
  preset: {
    onSpawn: (listener) => subscribe<PresetTemplate>(IPC_EVENTS.PRESET_SPAWN, listener),
    onDefault: (listener) => subscribe<PresetTemplate>(IPC_EVENTS.PRESET_DEFAULT, listener),
    // Same shape as canvas.onCounts: a main -> renderer REQUEST, answered on a
    // one-shot reply channel whose name main invents and sends.
    onCapture: (provide: () => CapturedPanel | null) => {
      const wrapped = (_event: IpcRendererEvent, replyChannel: string): void => {
        ipcRenderer.send(replyChannel, provide())
      }
      ipcRenderer.on(IPC_EVENTS.PRESET_CAPTURE, wrapped)
      return () => ipcRenderer.removeListener(IPC_EVENTS.PRESET_CAPTURE, wrapped)
    },
    list: () => ipcRenderer.invoke(IPC.PRESET_LIST),
    rename: (id: string, name: string) => ipcRenderer.invoke(IPC.PRESET_RENAME, id, name),
    remove: (id: string) => ipcRenderer.invoke(IPC.PRESET_DELETE, id),
    setDefault: (id: string) => ipcRenderer.invoke(IPC.PRESET_SET_DEFAULT, id),
    spawnById: (id: string) => ipcRenderer.invoke(IPC.PRESET_SPAWN_BY_ID, id),
    template: (id: string) => ipcRenderer.invoke(IPC.PRESET_TEMPLATE, id),
    setWorktree: (id: string, on: boolean) => ipcRenderer.invoke(IPC.PRESET_SET_WORKTREE, id, on),
    savePanel: (captured: CapturedPanel) => ipcRenderer.invoke(IPC.PRESET_SAVE_PANEL, captured)
  },
  // M80. A preset's resolved template, for a template's node.
  // (declared inside `preset` below)
  // Saved shapes of work.
  // M83. The project memory.
  memory: {
    list: (root: string, limit: number) => ipcRenderer.invoke(IPC.MEMORY_LIST, root, limit),
    add: (req) => ipcRenderer.invoke(IPC.MEMORY_ADD, req)
  },
  teammate: {
    list: () => ipcRenderer.invoke(IPC.TEAMMATE_LIST),
    save: (teammate, cwd) => ipcRenderer.invoke(IPC.TEAMMATE_SAVE, teammate, cwd),
    remove: (id: string) => ipcRenderer.invoke(IPC.TEAMMATE_DELETE, id),
    choosePlace: () => ipcRenderer.invoke(IPC.TEAMMATE_CHOOSE_PLACE)
  },
  // M127. The shelf, read and written whole.
  shelf: {
    list: () => ipcRenderer.invoke(IPC.SHELF_LIST),
    save: (shelf) => ipcRenderer.invoke(IPC.SHELF_SAVE, shelf)
  },
  // M128. One plugin's details text, verbatim.
  plugin: {
    details: (id) => ipcRenderer.invoke(IPC.PLUGIN_DETAILS, id)
  },
  routine: {
    list: () => ipcRenderer.invoke(IPC.ROUTINE_LIST),
    save: (routine) => ipcRenderer.invoke(IPC.ROUTINE_SAVE, routine),
    remove: (id: string) => ipcRenderer.invoke(IPC.ROUTINE_DELETE, id),
    run: (id: string) => ipcRenderer.invoke(IPC.ROUTINE_RUN, id),
    onFire: (listener) => subscribe<PersistedRoutine>(IPC_EVENTS.ROUTINE_FIRE, listener)
  },
  template: {
    list: () => ipcRenderer.invoke(IPC.TEMPLATE_LIST),
    save: (template, expectedRevision) => ipcRenderer.invoke(IPC.TEMPLATE_SAVE, template, expectedRevision),
    remove: (id: string) => ipcRenderer.invoke(IPC.TEMPLATE_DELETE, id)
  },
  prompt: {
    list: (cwd: string | null) => ipcRenderer.invoke(IPC.PROMPT_LIST, cwd),
    save: (name: string, body: string) => ipcRenderer.invoke(IPC.PROMPT_SAVE, name, body),
    remove: (id: string) => ipcRenderer.invoke(IPC.PROMPT_DELETE, id)
  },
  files: {
    list: (path: string) => ipcRenderer.invoke(IPC.FS_LIST, path)
  },
  env: {
    report: (again?: boolean) => ipcRenderer.invoke(IPC.ENV_REPORT, again === true)
  },
  ledger: {
    list: (panelId: string, limit: number) => ipcRenderer.invoke(IPC.LEDGER_LIST, panelId, limit),
    usage: (since: number) => ipcRenderer.invoke(IPC.LEDGER_USAGE, since)
  },
  agentSession: {
    create: (spec) => ipcRenderer.invoke(IPC.AGENT_CREATE, spec),
    send: (id, text, attachments) => ipcRenderer.invoke(IPC.AGENT_SEND, id, text, attachments ?? []),
    clipboardImage: () => ipcRenderer.invoke(IPC.AGENT_CLIPBOARD_IMAGE),
    clipboardFile: () => ipcRenderer.invoke(IPC.ATTACHMENT_CLIPBOARD_FILE),
    interrupt: (id) => ipcRenderer.invoke(IPC.AGENT_INTERRUPT, id),
    dispose: (req) => ipcRenderer.invoke(IPC.AGENT_DISPOSE, req),
    answer: (req) => ipcRenderer.invoke(IPC.AGENT_ANSWER, req),
    list: () => ipcRenderer.invoke(IPC.AGENT_LIST),
    transcript: (id) => ipcRenderer.invoke(IPC.AGENT_TRANSCRIPT, id),
    importSession: (req) => ipcRenderer.invoke(IPC.AGENT_IMPORT, req),
    onEvent: (listener) => subscribe<AgentSessionEvent>(IPC_EVENTS.AGENT_EVENT, listener),
    autoStart: (req) => ipcRenderer.invoke(IPC.AGENT_AUTO_START, req),
    autoStop: (id) => ipcRenderer.invoke(IPC.AGENT_AUTO_STOP, id),
    grants: (id) => ipcRenderer.invoke(IPC.AGENT_GRANTS, id),
    revokeGrants: (id) => ipcRenderer.invoke(IPC.AGENT_REVOKE_GRANTS, id),
    poolStart: (req) => ipcRenderer.invoke(IPC.AGENT_POOL_START, req),
    poolStop: (req) => ipcRenderer.invoke(IPC.AGENT_POOL_STOP, req),
    onPoolEvent: (listener) => {
      const wrapped = (_event: IpcRendererEvent, e: Parameters<typeof listener>[0]): void => listener(e)
      ipcRenderer.on(IPC_EVENTS.POOL_EVENT, wrapped)
      return () => ipcRenderer.removeListener(IPC_EVENTS.POOL_EVENT, wrapped)
    }
  },
  snapshot: {
    list: () => ipcRenderer.invoke(IPC.SNAPSHOT_LIST),
    restore: (at, afterId) => ipcRenderer.invoke(IPC.SNAPSHOT_RESTORE, at, afterId)
  },
  vault: {
    read: (root) => ipcRenderer.invoke(IPC.VAULT_READ, root),
    onChanged: (listener) => subscribe<void>(IPC_EVENTS.VAULT_CHANGED, () => listener())
  },
  watcher: {
    create: (req) => ipcRenderer.invoke(IPC.WATCHER_CREATE, req),
    run: (id) => ipcRenderer.invoke(IPC.WATCHER_RUN, id),
    stop: (id) => ipcRenderer.invoke(IPC.WATCHER_STOP, id),
    dispose: (id) => ipcRenderer.invoke(IPC.WATCHER_DISPOSE, id),
    list: () => ipcRenderer.invoke(IPC.WATCHER_LIST),
    onState: (listener) => subscribe<WatcherStateEvent>(IPC_EVENTS.WATCHER_STATE, listener)
  },
  spawn: {
    sheet: (req: SpawnRequest) => ipcRenderer.invoke(IPC.SPAWN_SHEET, req),
    recent: () => ipcRenderer.invoke(IPC.SPAWN_RECENT),
    onOpenSheet: (listener) => subscribe<void>(IPC_EVENTS.SPAWN_OPEN_SHEET, () => listener())
  },
  links: {
    open: (req: { panelId: string; target: string }) => ipcRenderer.invoke(IPC.LINK_OPEN, req)
  },
  export: {
    panelText: (req: PanelTextExportRequest) => ipcRenderer.invoke(IPC.EXPORT_PANEL_TEXT, req),
    canvasPng: () => ipcRenderer.invoke(IPC.EXPORT_CANVAS_PNG),
    deckPptx: (req: { path: string }) => ipcRenderer.invoke(IPC.DECK_EXPORT_PPTX, req),
    deckPdf: (req) => ipcRenderer.invoke(IPC.EXPORT_DECK_PDF, req)
  },
  tool: {
    generate: (req: { description: string; folder: string }) => ipcRenderer.invoke(IPC.TOOL_GENERATE, req)
  },
  diagnostics: {
    sample: () => ipcRenderer.invoke(IPC.DIAGNOSTICS_SAMPLE),
    export: (snapshot: DiagnosticsSnapshot) => ipcRenderer.invoke(IPC.DIAGNOSTICS_EXPORT, snapshot)
  },
  session: {
    info: () => ipcRenderer.invoke(IPC.SESSION_BACKEND),
    onLive: (listener) => subscribe<LiveSessionUpdate>(IPC_EVENTS.SESSION_LIVE, listener),
    onRecover: (listener) => subscribe<OrphanRow[]>(IPC_EVENTS.SESSION_RECOVER, listener),
    onSubagents: (listener) => subscribe<SubagentUpdate>(IPC_EVENTS.SUBAGENT_STATE, listener),
    onUsage: (listener) =>
      subscribe<{ panelId: PanelId; usage: PanelUsage }>(IPC_EVENTS.USAGE_PANEL, listener)
  },
  settings: {
    list: () => ipcRenderer.invoke(IPC.SETTINGS_LIST),
    set: (id: string, value: SettingValue) => ipcRenderer.invoke(IPC.SETTINGS_SET, id, value),
    onChanged: (listener) => subscribe<string>(IPC_EVENTS.SETTINGS_CHANGED, listener)
  },
  agent: {
    onState: (listener) => subscribe<AgentStateUpdate>(IPC_EVENTS.AGENT_STATE, listener),
    acknowledge: (panelId: PanelId) => ipcRenderer.invoke(IPC.AGENT_ACKNOWLEDGE, panelId),
    onAttentionJump: (listener) => subscribe<PanelId>(IPC_EVENTS.ATTENTION_JUMP, listener)
  },
  workspace: {
    list: () => ipcRenderer.invoke(IPC.WORKSPACE_LIST),
    activate: (id: string, outgoing: CanvasState) =>
      ipcRenderer.invoke(IPC.WORKSPACE_ACTIVATE, id, outgoing),
    create: (name: string) => ipcRenderer.invoke(IPC.WORKSPACE_CREATE, name),
    rename: (id: string, name: string) =>
      ipcRenderer.invoke(IPC.WORKSPACE_RENAME, id, name),
    remove: (id: string) => ipcRenderer.invoke(IPC.WORKSPACE_DELETE, id),
    merged: () => ipcRenderer.invoke(IPC.WORKSPACE_MERGED),
    movePanels: (panelIds: PanelId[], target: { workspaceId: string } | { newName: string }) =>
      ipcRenderer.invoke(IPC.WORKSPACE_MOVE_PANELS, panelIds, target)
  },
  review: {
    panel: (panelId: PanelId) => ipcRenderer.invoke(IPC.REVIEW_PANEL, panelId),
    baseline: (panelId: PanelId) => ipcRenderer.invoke(IPC.REVIEW_BASELINE, panelId),
    at: (subject: ReviewSubject) => ipcRenderer.invoke(IPC.REVIEW_AT, subject),
    diff: (req: ReviewDiffRequest) => ipcRenderer.invoke(IPC.REVIEW_DIFF, req),
    commit: (req: ReviewCommitRequest) => ipcRenderer.invoke(IPC.REVIEW_COMMIT, req),
    discard: (req: ReviewDiscardRequest) => ipcRenderer.invoke(IPC.REVIEW_DISCARD, req),
    across: (root: string) => ipcRenderer.invoke(IPC.REVIEW_ACROSS, root)
  },
  git: {
    status: (root: string) => ipcRenderer.invoke(IPC.GIT_STATUS, root)
  },
  scrollback: {
    tail: (req: { panelId: string; lines: number }) => ipcRenderer.invoke(IPC.SCROLLBACK_TAIL, req),
    clear: () => ipcRenderer.invoke(IPC.SCROLLBACK_CLEAR),
    search: (query: string) => ipcRenderer.invoke(IPC.SCROLLBACK_SEARCH, query)
  },
  worktree: {
    list: () => ipcRenderer.invoke(IPC.WORKTREE_LIST),
    remove: (id: string) => ipcRenderer.invoke(IPC.WORKTREE_REMOVE, id),
    reveal: (id: string) => ipcRenderer.invoke(IPC.WORKTREE_REVEAL, id)
  },
  credential: {
    list: () => ipcRenderer.invoke(IPC.CREDENTIAL_LIST),
    set: (req: { service: string; token: string }) => ipcRenderer.invoke(IPC.CREDENTIAL_SET, req),
    remove: (service: string) => ipcRenderer.invoke(IPC.CREDENTIAL_DELETE, service),
    verify: (service: string) => ipcRenderer.invoke(IPC.CREDENTIAL_VERIFY, service)
  },
  broker: {
    audit: (limit, service) => ipcRenderer.invoke(IPC.BROKER_AUDIT, limit, service)
  },
  github: {
    list: (panelId) => ipcRenderer.invoke(IPC.GITHUB_LIST, panelId)
  },
  jira: {
    list: () => ipcRenderer.invoke(IPC.JIRA_LIST),
    transitions: (itemId: string) => ipcRenderer.invoke(IPC.JIRA_TRANSITIONS, itemId),
    comment: (req: { itemId: string; body: string }) => ipcRenderer.invoke(IPC.JIRA_COMMENT, req),
    transition: (req: { itemId: string; transitionId: string }) => ipcRenderer.invoke(IPC.JIRA_TRANSITION, req)
  },
  file: {
    open: () => ipcRenderer.invoke(IPC.FILE_OPEN),
    read: (req: FileReadRequest) => ipcRenderer.invoke(IPC.FILE_READ, req),
    close: (panelId: PanelId) => ipcRenderer.invoke(IPC.FILE_CLOSE, panelId),
    write: (req: FileWriteRequest) => ipcRenderer.invoke(IPC.FILE_WRITE, req),
    create: (req: FileCreateRequest) => ipcRenderer.invoke(IPC.FILE_CREATE, req),
    onChanged: (listener) => subscribe<FileChangedEvent>(IPC_EVENTS.FILE_CHANGED, listener),
    pathForFile: (file: File) => webUtils.getPathForFile(file)
  },
  toolbox: {
    read: (req: ToolboxReadRequest) => ipcRenderer.invoke(IPC.TOOLBOX_READ, req),
    permissions: (req: ToolboxPermissionsRequest) => ipcRenderer.invoke(IPC.TOOLBOX_PERMISSIONS, req)
  },
  // M129. The four writers. Main derives the writable roots itself — the
  // renderer names a path, never a root.
  skill: {
    write: (req) => ipcRenderer.invoke(IPC.SKILL_WRITE, req),
    create: (req) => ipcRenderer.invoke(IPC.SKILL_CREATE, req),
    rename: (req) => ipcRenderer.invoke(IPC.SKILL_RENAME, req),
    remove: (req) => ipcRenderer.invoke(IPC.SKILL_DELETE, req),
    trail: (panelId) => ipcRenderer.invoke(IPC.SKILL_TRAIL, panelId)
  },
  browser: {
    read: (req) => ipcRenderer.invoke(IPC.BROWSER_READ, req)
  },
  preview: {
    discover: (req) => ipcRenderer.invoke(IPC.PREVIEW_DISCOVER, req),
    capture: (req) => ipcRenderer.invoke(IPC.PREVIEW_CAPTURE, req)
  },
  asset: {
    put: (req) => ipcRenderer.invoke(IPC.ASSET_PUT, req),
    choose: () => ipcRenderer.invoke(IPC.ASSET_CHOOSE)
  },
  node: {
    fetch: (req) => ipcRenderer.invoke(IPC.NODE_FETCH, req)
  },
  portable: {
    write: (req) => ipcRenderer.invoke(IPC.PORTABLE_EXPORT, req),
    read: (req) => ipcRenderer.invoke(IPC.PORTABLE_IMPORT, req)
  },
  board: {
    lane: (req) => ipcRenderer.invoke(IPC.BOARD_LANE, req),
    laneStatus: (req) => ipcRenderer.invoke(IPC.BOARD_LANE_STATUS, req),
    openPr: (req) => ipcRenderer.invoke(IPC.BOARD_OPEN_PR, req),
    commentPr: (req) => ipcRenderer.invoke(IPC.BOARD_COMMENT_PR, req),
    repositories: (req) => ipcRenderer.invoke(IPC.BOARD_REPOSITORIES, req)
  },
  update: {
    check: () => ipcRenderer.invoke(IPC.UPDATE_CHECK)
  },
  image: {
    read: (path) => ipcRenderer.invoke(IPC.IMAGE_READ, path)
  },
  starter: {
    prepare: () => ipcRenderer.invoke(IPC.STARTER_PREPARE)
  },
  platform: process.platform,
  telemetry: { enabled: telemetryEnabled }
}

contextBridge.exposeInMainWorld('canvas', bridge)
