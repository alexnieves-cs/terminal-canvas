import { ipcMain, type WebContents } from 'electron'
import { IPC, IPC_EVENTS } from '../shared/ipc-contract'
import type {
  PanelId,
  PanelSpec,
  PtyResizeRequest,
  PtyWriteRequest
} from '../shared/types'
import type { CanvasState } from '../shared/layout-schema'
import type { SessionBackendInfo } from '../shared/ipc-contract'
import type { PtyManager } from './pty-manager'
import type { LayoutStore } from './layout-store'

/** Registers the whole renderer -> main surface. One place, one call. */
export function registerIpcHandlers(
  ptyManager: PtyManager,
  layoutStore: LayoutStore,
  getBackendInfo: () => SessionBackendInfo
): void {
  ipcMain.handle(IPC.PTY_CREATE, (_event, spec: PanelSpec) => ptyManager.create(spec))

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

  ipcMain.handle(IPC.LAYOUT_LOAD, () => layoutStore.initial())

  ipcMain.handle(IPC.LAYOUT_SAVE, (_event, state: CanvasState) => {
    layoutStore.save(state)
  })

  ipcMain.handle(IPC.SESSION_BACKEND, () => getBackendInfo())
}

/**
 * Asks the renderer for the panel and running-process counts, so the reset
 * confirmation can name what it is about to destroy. Resolves to zeroes if the
 * renderer does not answer within the timeout — a dialog that never opens is a
 * worse failure than one that undercounts.
 */
export function requestCanvasCounts(
  webContents: WebContents
): Promise<{ panels: number; running: number }> {
  return new Promise((resolve) => {
    const replyChannel = `canvas:counts:reply:${Date.now()}`
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners(replyChannel)
      resolve({ panels: 0, running: 0 })
    }, 1000)
    ipcMain.once(replyChannel, (_event, counts: { panels: number; running: number }) => {
      clearTimeout(timer)
      resolve(counts)
    })
    webContents.send(IPC_EVENTS.CANVAS_COUNTS, replyChannel)
  })
}
