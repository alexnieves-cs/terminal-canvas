import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { Stores } from './stores'
import { createEventLog, type EventLog } from '../event-log'

/**
 * M701. Builds the local event log (main/event-log.ts) and gives it the two
 * things only Electron knows: where userData is, and whether the APP has
 * focus. Everything else reaches it through `state.eventLog` at the three
 * places that already fan out (the agent runtime's subscribe, the PTY
 * manager's agent-state hook, layout:save), read at use like every other
 * MainState member (rule 1).
 *
 * APP focus, not window focus. Moving between this app's own windows (a
 * second window, devtools) fires blur then focus on the next tick; counting
 * that as "switched to another tool" would inflate the very number this log
 * exists to measure. So a blur is recorded only when, a tick later, no window
 * of this app has focus.
 *
 * The `start` record is index.ts's to write, inside whenReady and after the
 * instance-lock gate: a second instance that lost the lock quits through
 * whenReady too, and must not write a start into the winner's log.
 */
export function createEventLogWiring(stores: Stores, userData: string): EventLog {
  const focused = (): boolean => BrowserWindow.getFocusedWindow() !== null
  const log = createEventLog({
    dir: join(userData, 'event-log'),
    enabled: () => stores.layoutStore.getSetting('telemetry.localEventLog') === true,
    focused
  })
  let appFocused: boolean | null = null
  const settle = (): void => {
    const now = focused()
    if (now === appFocused) return
    appFocused = now
    log.focus(now)
  }
  app.on('browser-window-focus', () => setTimeout(settle, 0))
  app.on('browser-window-blur', () => setTimeout(settle, 0))
  return log
}
