import { app, ipcMain } from 'electron'
import { createUsageStore, type UsageStore } from '../usage-store'
import { USAGE_SETTING } from '../usage-counts'
import type { UsageCountHandlers } from '../ipc'
import type { Stores } from './stores'

/**
 * M697. The local usage tally's impure half: the store over userData, the
 * setting read at use, and the tap that counts a door when it is asked.
 */
export function createUsageCountsWiring(stores: Stores, userData: string): { store: UsageStore; handlers: UsageCountHandlers } {
  const enabled = (): boolean => stores.layoutStore.getSetting(USAGE_SETTING) === true
  const store = createUsageStore({ dir: userData, enabled, now: () => Date.now() })
  return {
    store,
    handlers: {
      read: () => ({ on: enabled(), text: store.text(app.getVersion()) }),
      clear: () => ({ cleared: store.clear() })
    }
  }
}

/**
 * M697. THE TAP. Every `ipcMain.handle` registered after this call counts its
 * door, by CHANNEL NAME ONLY, before the handler runs: no argument is passed
 * to `record`, so nothing a call carries can reach the tally. A record that
 * throws is swallowed; counting must never change what a door answers.
 * Installed once, at module scope in main/index.ts, before any handler is
 * registered.
 */
export function installUsageTap(record: (channel: string) => void): void {
  const handle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown) =>
    handle(channel, (event, ...args) => {
      try { record(channel) } catch { /* the tally never breaks a door */ }
      return listener(event, ...args)
    })) as typeof ipcMain.handle
}
