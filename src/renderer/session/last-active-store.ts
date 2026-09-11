import { useSyncExternalStore } from 'react'

/**
 * M258. WHEN A PANEL LAST CHANGED STATE — the time behind a dormant card's
 * `paused 3m` / `idle 2d`. A module-level store subscribed BY ID (the shape
 * every per-panel store since M12 takes), never on `registry.version()`, and
 * cleared at every panel-removing call site beside `clearLastLine`
 * (`verify:rail last-active.2`), or a recycled id inherits a dead panel's time.
 *
 * The time is only ever an OBSERVED transition. The first word a panel is
 * seen with records the word and NO time — a restored panel that has been
 * asleep since the last quit has no known "since", and inventing one at
 * first sight would print `paused <1m` over a panel that has slept for days.
 * Absent stays absent: the card then says nothing rather than a guess.
 * Nothing here persists; a relaunch forgets every time, honestly.
 */
interface Entry { word: string; at?: number }

const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

function notify(id: string): void {
  const set = listeners.get(id)
  if (!set) return
  for (const cb of set) cb()
}

/** Called with a panel's current state word; a CHANGE from a known word stamps the time. */
export function noteStateWord(id: string, word: string, now = Date.now()): void {
  const prev = entries.get(id)
  if (prev === undefined) { entries.set(id, { word }); return }
  if (prev.word === word) return
  entries.set(id, { word, at: now })
  notify(id)
}

export function clearLastActive(id: string): void {
  if (!entries.delete(id)) return
  notify(id)
}

/** The time of the last observed transition, or undefined when none was seen. */
export function getLastActive(id: string): number | undefined {
  return entries.get(id)?.at
}

export function useLastActive(id: string): number | undefined {
  return useSyncExternalStore(
    (cb) => {
      let set = listeners.get(id)
      if (!set) { set = new Set(); listeners.set(id, set) }
      set.add(cb)
      return () => { set?.delete(cb); if (set?.size === 0) listeners.delete(id) }
    },
    () => getLastActive(id),
    () => getLastActive(id)
  )
}
