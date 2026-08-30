import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import {
  IPC,
  IPC_EVENTS,
  type CanvasBridge,
  type PresetTemplate,
  type CapturedPanel,
  type FileReadRequest,
  type FileChangedEvent
} from '../shared/ipc-contract'
import type { ReviewSubject, ReviewDiffRequest, ReviewCommitRequest } from '../shared/review'
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
import type { SettingValue } from '../shared/settings-schema'

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
    savePanel: (captured: CapturedPanel) => ipcRenderer.invoke(IPC.PRESET_SAVE_PANEL, captured)
  },
  prompt: {
    list: (cwd: string | null) => ipcRenderer.invoke(IPC.PROMPT_LIST, cwd),
    save: (name: string, body: string) => ipcRenderer.invoke(IPC.PROMPT_SAVE, name, body),
    remove: (id: string) => ipcRenderer.invoke(IPC.PROMPT_DELETE, id)
  },
  session: {
    info: () => ipcRenderer.invoke(IPC.SESSION_BACKEND),
    onLive: (listener) => subscribe<LiveSessionUpdate>(IPC_EVENTS.SESSION_LIVE, listener),
    onSubagents: (listener) => subscribe<SubagentUpdate>(IPC_EVENTS.SUBAGENT_STATE, listener)
  },
  settings: {
    list: () => ipcRenderer.invoke(IPC.SETTINGS_LIST),
    set: (id: string, value: SettingValue) => ipcRenderer.invoke(IPC.SETTINGS_SET, id, value)
  },
  agent: {
    onState: (listener) => subscribe<AgentStateUpdate>(IPC_EVENTS.AGENT_STATE, listener),
    acknowledge: (panelId: PanelId) => ipcRenderer.invoke(IPC.AGENT_ACKNOWLEDGE, panelId)
  },
  workspace: {
    list: () => ipcRenderer.invoke(IPC.WORKSPACE_LIST),
    activate: (id: string, outgoing: CanvasState) =>
      ipcRenderer.invoke(IPC.WORKSPACE_ACTIVATE, id, outgoing),
    create: (name: string) => ipcRenderer.invoke(IPC.WORKSPACE_CREATE, name),
    rename: (id: string, name: string) =>
      ipcRenderer.invoke(IPC.WORKSPACE_RENAME, id, name),
    remove: (id: string) => ipcRenderer.invoke(IPC.WORKSPACE_DELETE, id)
  },
  review: {
    panel: (panelId: PanelId) => ipcRenderer.invoke(IPC.REVIEW_PANEL, panelId),
    baseline: (panelId: PanelId) => ipcRenderer.invoke(IPC.REVIEW_BASELINE, panelId),
    at: (subject: ReviewSubject) => ipcRenderer.invoke(IPC.REVIEW_AT, subject),
    diff: (req: ReviewDiffRequest) => ipcRenderer.invoke(IPC.REVIEW_DIFF, req),
    commit: (req: ReviewCommitRequest) => ipcRenderer.invoke(IPC.REVIEW_COMMIT, req)
  },
  credential: {
    list: () => ipcRenderer.invoke(IPC.CREDENTIAL_LIST),
    set: (req: { service: string; token: string }) => ipcRenderer.invoke(IPC.CREDENTIAL_SET, req),
    remove: (service: string) => ipcRenderer.invoke(IPC.CREDENTIAL_DELETE, service),
    verify: (service: string) => ipcRenderer.invoke(IPC.CREDENTIAL_VERIFY, service)
  },
  jira: { list: () => ipcRenderer.invoke(IPC.JIRA_LIST) },
  file: {
    open: () => ipcRenderer.invoke(IPC.FILE_OPEN),
    read: (req: FileReadRequest) => ipcRenderer.invoke(IPC.FILE_READ, req),
    close: (panelId: PanelId) => ipcRenderer.invoke(IPC.FILE_CLOSE, panelId),
    onChanged: (listener) => subscribe<FileChangedEvent>(IPC_EVENTS.FILE_CHANGED, listener),
    pathForFile: (file: File) => webUtils.getPathForFile(file)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('canvas', bridge)
