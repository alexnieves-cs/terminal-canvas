import { useSyncExternalStore } from 'react'

/**
 * M309. WHEN THE PERSON WAS LAST HERE — the "since" every return briefing
 * is measured from.
 *
 * Two ways to have been away, one answer. A RELAUNCH reads the last moment
 * the previous run saw this window focused (written every minute while
 * focused, and on blur and unload, so a crash loses at most a minute). A
 * RETURN within a run is the window regaining focus after at least
 * `AWAY_MS` behind other windows. Either sets `awaySince`; dismissing the
 * briefing clears it. Short absences (a glance at another app) brief nothing:
 * a briefing after every alt-tab is a nag, not a recovery.
 *
 * localStorage, wrapped: a per-viewer convenience (the dock-expanded
 * precedent). Storage that throws or comes back empty yields no briefing —
 * never a fabricated "since the beginning of time".
 */
export const PRESENCE_KEY = 'tc.lastSeenAt'
export const AWAY_MS = 20 * 60_000
const WRITE_EVERY_MS = 60_000

let awaySince: number | null = null
let blurredAt: number | null = null
let started = false
const listeners = new Set<() => void>()
const emit = (): void => { for (const l of listeners) l() }

const read = (): number | null => {
  try {
    const raw = window.localStorage.getItem(PRESENCE_KEY)
    const n = raw === null ? NaN : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch { return null }
}
const write = (at: number): void => {
  try { window.localStorage.setItem(PRESENCE_KEY, String(at)) } catch { /* this run keeps nothing */ }
}

/** The absence a relaunch or a refocus decided, from its last-seen stamp. Pure, for the verifier. */
export function awayFrom(lastSeen: number | null, now: number, minAway = AWAY_MS): number | null {
  return lastSeen !== null && now - lastSeen >= minAway ? lastSeen : null
}

function start(): void {
  if (started || typeof window === 'undefined') return
  started = true
  awaySince = awayFrom(read(), Date.now())
  const seen = (): void => { if (document.hasFocus()) write(Date.now()) }
  seen()
  window.setInterval(seen, WRITE_EVERY_MS)
  window.addEventListener('blur', () => { blurredAt = Date.now(); write(blurredAt) })
  window.addEventListener('beforeunload', () => { if (document.hasFocus()) write(Date.now()) })
  window.addEventListener('focus', () => {
    const back = awayFrom(blurredAt, Date.now())
    blurredAt = null
    write(Date.now())
    // A briefing already open keeps its EARLIER since: two absences read as one.
    if (back !== null && awaySince === null) { awaySince = back; emit() }
  })
}

export function dismissReturn(): void {
  if (awaySince === null) return
  awaySince = null
  write(Date.now())
  emit()
}

/** Null while there is nothing to brief; the epoch ms the person was last here otherwise. */
export function useAwaySince(): number | null {
  start()
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => awaySince, () => awaySince)
}
