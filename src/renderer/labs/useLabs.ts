import { useSyncExternalStore } from 'react'
import { FULL_SETTING, isFullMode, labsOff, type LabId } from '@shared/labs'

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
// M642. Simple until the first read says otherwise, for the same no-flash reason.
let full = false
const listeners = new Set<() => void>()
let started = false

function read(): void {
  void window.canvas.settings.list().then((rows) => {
    const valueOf = (id: string): unknown => rows.find((row) => row.id === id)?.value
    const next = labsOff(valueOf)
    const nextFull = isFullMode(valueOf)
    if (nextFull === full && next.size === off.size && [...next].every((id) => off.has(id))) return
    full = nextFull
    if (!(next.size === off.size && [...next].every((id) => off.has(id)))) off = next
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

const fullSnapshot = (): boolean => full

/** M642. Whether the product is in Full mode (Simple is the default). */
export function useFullMode(): boolean {
  return useSyncExternalStore(subscribe, fullSnapshot)
}

/** M642. The one write: the View menu's item and nothing else calls it. Settings and the palette write the row themselves. */
export function setFullMode(next: boolean): void {
  void window.canvas.settings.set(FULL_SETTING, next)
}
