import { ipcMain, type WebContents } from 'electron'
import { IPC, IPC_EVENTS } from '../shared/ipc-contract'
import type {
  PanelId,
  PanelSpec,
  PtyResizeRequest,
  PtyWriteRequest
} from '../shared/types'
import type { CanvasState } from '../shared/layout-schema'
import type { SessionBackendInfo, PresetListRow } from '../shared/ipc-contract'
import type { PtyManager } from './pty-manager'
import type { LayoutStore } from './layout-store'

/**
 * The preset mutations the palette drives, handed in from main/index.ts
 * because they need pieces only that module owns — the availability probe,
 * the menu rebuild, and the window to push PRESET_DEFAULT at. Kept as an
 * explicit parameter rather than reached for as module state, the same
 * dependency-injection posture ptyManager/layoutStore/getBackendInfo already
 * take.
 */
export interface PresetHandlers {
  list(): PresetListRow[]
  rename(id: string, name: string): boolean
  remove(id: string): boolean
  setDefault(id: string): void
  /**
   * A palette pick. Main answers by sending PRESET_SPAWN, exactly as a menu
   * pick does, so the two cannot drift apart.
   */
  spawn(id: string): void
  requestReset(): void
}

/** Registers the whole renderer -> main surface. One place, one call. */
export function registerIpcHandlers(
  ptyManager: PtyManager,
  layoutStore: LayoutStore,
  getBackendInfo: () => SessionBackendInfo,
  presets: PresetHandlers
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

  ipcMain.handle(IPC.PRESET_LIST, () => presets.list())
  ipcMain.handle(IPC.PRESET_RENAME, (_event, id: string, name: string) => presets.rename(id, name))
  ipcMain.handle(IPC.PRESET_DELETE, (_event, id: string) => presets.remove(id))
  ipcMain.handle(IPC.PRESET_SET_DEFAULT, (_event, id: string) => presets.setDefault(id))
  ipcMain.handle(IPC.PRESET_SPAWN_BY_ID, (_event, id: string) => presets.spawn(id))
  ipcMain.handle(IPC.CANVAS_REQUEST_RESET, () => presets.requestReset())
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
