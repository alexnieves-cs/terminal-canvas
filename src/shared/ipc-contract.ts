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
  LAYOUT_SAVE: 'layout:save',
  /**
   * Which backend spawns panels, and why. The renderer shows this only when it
   * is 'direct', so the user is never told their sessions are durable when
   * they are not.
   */
  SESSION_BACKEND: 'session:backend'
} as const

/** Main -> renderer, fire-and-forget via webContents.send. */
export const IPC_EVENTS = {
  PTY_DATA: 'pty:data',
  PTY_EXIT: 'pty:exit',
  /** Menu-driven clipboard actions; the renderer owns xterm's selection. */
  EDIT_COPY: 'edit:copy',
  EDIT_PASTE: 'edit:paste',
  /**
   * Cmd+Z / Cmd+Shift+Z, forwarded from the main-process menu exactly as
   * EDIT_COPY/EDIT_PASTE are. Ctrl+Z is deliberately untouched and reaches the
   * PTY as SIGTSTP — the same split as Cmd+C (copy) versus Ctrl+C (SIGINT).
   */
  EDIT_UNDO: 'edit:undo',
  EDIT_REDO: 'edit:redo',
  /**
   * What a Reset canvas… confirmation has to name. Main owns the dialog but
   * only the renderer knows the live session statuses, so it asks over this
   * channel — a main->renderer request/reply, not a handled invoke, which is
   * why it lives here and not in IPC (verify:ipc only walks IPC).
   */
  CANVAS_COUNTS: 'canvas:counts',
  /** Confirmed reset: drop every panel and return to the first-run canvas. */
  CANVAS_RESET: 'canvas:reset'
} as const

export interface SessionBackendInfo {
  kind: 'tmux' | 'direct'
  /** Human-readable cause, shown in the HUD when kind is 'direct'. */
  reason: string
}

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
    onUndo(listener: () => void): () => void
    onRedo(listener: () => void): () => void
  }
  layout: {
    /** Called ONCE, before React mounts. See renderer/main.tsx. */
    load(): Promise<CanvasState>
    save(state: CanvasState): Promise<void>
  }
  canvas: {
    /** Registers the answer to canvas:counts. Returns its own unsubscribe. */
    onCounts(provide: () => { panels: number; running: number }): () => void
    onReset(listener: () => void): () => void
  }
  session: {
    info(): Promise<SessionBackendInfo>
  }
  platform: NodeJS.Platform
}
