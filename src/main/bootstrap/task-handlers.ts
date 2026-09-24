import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { app } from 'electron'
import { createTaskEvidence, type TaskHandlers } from '../task-evidence'
import { createReceiptStore } from '../integrator'
import { askSave, inDownloads, liveWindow } from './dialogs'
import type { Stores } from './stores'
import type { MainState } from './context'

/**
 * M320–M321. The task doors, composed for `registerIpcHandlers`'s last
 * parameter. The ledger and the check-output store are the ones every other
 * reader shares; the receipts are READ from the file M317's integrator
 * writes (a second read-only view of it, never a second writer).
 */
export function createTaskDoors(state: MainState, stores: Stores): TaskHandlers {
  const userData = app.getPath('userData')
  const receipts = createReceiptStore({ file: join(userData, 'integration-receipts.json') })
  return createTaskEvidence({
    timeline: (filter, limit) => stores.runLedger.timeline(filter, limit),
    checkOutput: (id) => stores.checkOutputs.read(id),
    receipts: () => receipts.list(),
    capturesDir: join(userData, 'captures'),
    askPath: async (suggested) => askSave(liveWindow(state), { title: 'Export task hand-off', defaultPath: inDownloads(suggested), filters: [{ name: 'Markdown', extensions: ['md'] }] }),
    write: async (path, text) => {
      const tmp = `${path}.tmp`
      await fs.writeFile(tmp, text, { mode: 0o600 })
      await fs.rename(tmp, path)
    }
  })
}
