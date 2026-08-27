import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC,
  IPC_EVENTS,
  type CanvasBridge,
  type PresetTemplate,
  type CapturedPanel
} from '../shared/ipc-contract'
import type {
  AgentStateUpdate,
  PanelId,
  PanelSpec,
  PtyDataChunk,
  PtyExitInfo,
  PtyResizeRequest,
  PtyWriteRequest
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
    spawnById: (id: string) => ipcRenderer.invoke(IPC.PRESET_SPAWN_BY_ID, id)
  },
  prompt: {
    list: (cwd: string | null) => ipcRenderer.invoke(IPC.PROMPT_LIST, cwd),
    save: (name: string, body: string) => ipcRenderer.invoke(IPC.PROMPT_SAVE, name, body),
    remove: (id: string) => ipcRenderer.invoke(IPC.PROMPT_DELETE, id)
  },
  session: {
    info: () => ipcRenderer.invoke(IPC.SESSION_BACKEND)
  },
  settings: {
    list: () => ipcRenderer.invoke(IPC.SETTINGS_LIST),
    set: (id: string, value: SettingValue) => ipcRenderer.invoke(IPC.SETTINGS_SET, id, value)
  },
  agent: {
    onState: (listener) => subscribe<AgentStateUpdate>(IPC_EVENTS.AGENT_STATE, listener),
    acknowledge: (panelId: PanelId) => ipcRenderer.invoke(IPC.AGENT_ACKNOWLEDGE, panelId)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('canvas', bridge)
