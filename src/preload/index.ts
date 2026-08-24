import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, IPC_EVENTS, type CanvasBridge } from '../shared/ipc-contract'
import type {
  PanelId,
  PanelSpec,
  PtyDataChunk,
  PtyExitInfo,
  PtyResizeRequest,
  PtyWriteRequest
} from '../shared/types'
import type { CanvasState } from '../shared/layout-schema'

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
    onPaste: (listener) => subscribe<string>(IPC_EVENTS.EDIT_PASTE, listener)
  },
  layout: {
    load: () => ipcRenderer.invoke(IPC.LAYOUT_LOAD),
    save: (state: CanvasState) => ipcRenderer.invoke(IPC.LAYOUT_SAVE, state)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('canvas', bridge)
