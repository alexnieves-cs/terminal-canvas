import { useSyncExternalStore } from 'react'
import { labsOff, type LabId } from '@shared/labs'

/**
 * M496. Which hidden surfaces are switched back on, for the renderer.
 *
 * One module-level copy, read through `settings.list` and re-read on
 * `settings:changed`, the way the overview's toggle is (useShellSettings): a
 * switch from the Settings page, the palette or `tc` must apply without the
 * palette ever opening. Until the first read lands each lab is at its default,
 * so a launch never flashes a hidden door and then takes it away.
 */

let off: ReadonlySet<LabId> = labsOff(() => undefined)
const listeners = new Set<() => void>()
let started = false

function read(): void {
  void window.canvas.settings.list().then((rows) => {
    const next = labsOff((id) => rows.find((row) => row.id === id)?.value)
    if (next.size === off.size && [...next].every((id) => off.has(id))) return
    off = next
    for (const listener of listeners) listener()
  })
}

function start(): void {
  if (started) return
  started = true
  read()
  window.canvas.settings.onChanged(read)
}

function subscribe(listener: () => void): () => void {
  start()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const snapshot = (): ReadonlySet<LabId> => off

/** The labs that are off right now. A new Set only when the answer changes, so it is a stable memo key. */
export function useLabsOff(): ReadonlySet<LabId> {
  return useSyncExternalStore(subscribe, snapshot)
}

/** Whether one lab's doors are shown. */
export function useLab(id: LabId): boolean {
  return !useLabsOff().has(id)
}

/** For an event handler, read when it fires: a key handler bound once must not hold a stale answer. */
export function labOn(id: LabId): boolean {
  start()
  return !off.has(id)
}
