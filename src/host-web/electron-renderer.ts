import { ipcRenderer } from './ipc-renderer'

/**
 * Lane Q (M591). `electron`, as the app's preload sees it in a browser tab.
 * vite.host.config.ts aliases the preload's `import … from 'electron'` here.
 *
 * `contextBridge` has no second world to bridge into: a page is one world,
 * so exposing is assignment. `webUtils.getPathForFile` answers '' because a
 * file dropped on a browser tab has no path on the HOST; the renderer's drop
 * path already treats '' as "no path" (it is what Electron returns for a
 * file that did not come from disk).
 */

export { ipcRenderer }

export const contextBridge = {
  exposeInMainWorld(key: string, api: unknown): void {
    ;(window as unknown as Record<string, unknown>)[key] = api
  }
}

export const webUtils = {
  getPathForFile: (): string => ''
}

export type IpcRendererEvent = { sender: unknown }
