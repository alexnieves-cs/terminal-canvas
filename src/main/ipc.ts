import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc-contract'
import type {
  PanelId,
  PanelSpec,
  PtyResizeRequest,
  PtyWriteRequest
} from '../shared/types'
import type { CanvasState } from '../shared/layout-schema'
import type { PtyManager } from './pty-manager'
import type { LayoutStore } from './layout-store'

/** Registers the whole renderer -> main surface. One place, one call. */
export function registerIpcHandlers(ptyManager: PtyManager, layoutStore: LayoutStore): void {
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
}
