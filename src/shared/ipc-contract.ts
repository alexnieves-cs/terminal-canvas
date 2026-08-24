/**
 * Single source of truth for the IPC surface.
 *
 * Imported by main, preload, and renderer alike. Adding a channel here and
 * nowhere else should produce a type error in every process that must handle it.
 */
import type {
  PanelId,
  PanelSpec,
  PtyCreateResult,
  PtyDataChunk,
  PtyExitInfo,
  PtyResizeRequest,
  PtyWriteRequest
} from './types'
import type { CanvasState } from './layout-schema'

/** Renderer -> main, request/response via ipcRenderer.invoke. */
export const IPC = {
  PTY_CREATE: 'pty:create',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_KILL: 'pty:kill',
  /** Live sessions, so a fresh renderer can reconcile instead of guessing. */
  PTY_LIST: 'pty:list',
  /**
   * The resolved starting canvas. Main applies the restore settings before
   * answering, so the renderer never learns those settings exist.
   */
  LAYOUT_LOAD: 'layout:load',
  /** A full snapshot on every change; main coalesces and decides when to write. */
  LAYOUT_SAVE: 'layout:save'
} as const

/** Main -> renderer, fire-and-forget via webContents.send. */
export const IPC_EVENTS = {
  PTY_DATA: 'pty:data',
  PTY_EXIT: 'pty:exit',
  /** Menu-driven clipboard actions; the renderer owns xterm's selection. */
  EDIT_COPY: 'edit:copy',
  EDIT_PASTE: 'edit:paste'
} as const

/** Shape of the bridge the preload exposes on window.canvas. */
export interface CanvasBridge {
  pty: {
    create(spec: PanelSpec): Promise<PtyCreateResult>
    write(req: PtyWriteRequest): Promise<void>
    resize(req: PtyResizeRequest): Promise<void>
    kill(panelId: PanelId): Promise<void>
    /**
     * Sessions that survived whatever destroyed the previous renderer. A page
     * reload does not run React cleanup, so the renderer cannot assume its
     * panels are fresh.
     */
    list(): Promise<PtyCreateResult[]>
    /** Each subscribe returns its own unsubscribe, so React effects clean up. */
    onData(listener: (chunk: PtyDataChunk) => void): () => void
    onExit(listener: (info: PtyExitInfo) => void): () => void
  }
  edit: {
    onCopy(listener: () => void): () => void
    onPaste(listener: (text: string) => void): () => void
  }
  layout: {
    /** Called ONCE, before React mounts. See renderer/main.tsx. */
    load(): Promise<CanvasState>
    save(state: CanvasState): Promise<void>
  }
  platform: NodeJS.Platform
}
