import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { AgentSessionEvent } from '../shared/agent-session'
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
    onCounts: (provide) => {
      const wrapped = (_event: IpcRendererEvent, replyChannel: string): void => {
        ipcRenderer.send(replyChannel, provide())
      }
      ipcRenderer.on(IPC_EVENTS.CANVAS_COUNTS, wrapped)
      return () => ipcRenderer.removeListener(IPC_EVENTS.CANVAS_COUNTS, wrapped)
    },
    onReset: (listener) => subscribe<void>(IPC_EVENTS.CANVAS_RESET, listener),
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
    setWorktree: (id: string, on: boolean) => ipcRenderer.invoke(IPC.PRESET_SET_WORKTREE, id, on),
    savePanel: (captured: CapturedPanel) => ipcRenderer.invoke(IPC.PRESET_SAVE_PANEL, captured)
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
    report: () => ipcRenderer.invoke(IPC.ENV_REPORT)
  },
  ledger: {
    list: (panelId: string, limit: number) => ipcRenderer.invoke(IPC.LEDGER_LIST, panelId, limit)
  },
  agentSession: {
    create: (spec) => ipcRenderer.invoke(IPC.AGENT_CREATE, spec),
    send: (id, text) => ipcRenderer.invoke(IPC.AGENT_SEND, id, text),
    interrupt: (id) => ipcRenderer.invoke(IPC.AGENT_INTERRUPT, id),
    dispose: (req) => ipcRenderer.invoke(IPC.AGENT_DISPOSE, req),
    answer: (req) => ipcRenderer.invoke(IPC.AGENT_ANSWER, req),
    list: () => ipcRenderer.invoke(IPC.AGENT_LIST),
    transcript: (id) => ipcRenderer.invoke(IPC.AGENT_TRANSCRIPT, id),
    onEvent: (listener) => subscribe<AgentSessionEvent>(IPC_EVENTS.AGENT_EVENT, listener)
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
    panelText: (panelId: PanelId) => ipcRenderer.invoke(IPC.EXPORT_PANEL_TEXT, panelId),
    canvasPng: () => ipcRenderer.invoke(IPC.EXPORT_CANVAS_PNG)
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
    discard: (req: ReviewDiscardRequest) => ipcRenderer.invoke(IPC.REVIEW_DISCARD, req)
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
  platform: process.platform
}

contextBridge.exposeInMainWorld('canvas', bridge)
