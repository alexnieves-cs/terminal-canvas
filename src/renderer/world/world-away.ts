import { useSyncExternalStore } from 'react'
import { AWAY_MS } from './world-replay'

/**
 * When a person last looked away from the window for long enough to have
 * missed something (M425): hidden, minimised or unfocused for `AWAY_MS`. The
 * room's "while you were away" card asks this, and a dismissal clears it.
 *
 * Installed once, from the store's `connectAgentWorld` at startup, NOT from
 * the room: the room is lazily loaded and mounted only while it shows, and
 * the away that matters most is the one that began before it was opened.
 * In-session only, never persisted — the journal it tells from is in memory
 * too, so a stamp from a previous run would point at events nobody kept.
 */

let leftAt: number | null = null
let since: number | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const l of listeners) l()
}

/** The return rule, pure: away long enough means "since the moment they left". */
export function awayFrom(left: number | null, back: number, min: number = AWAY_MS): number | null {
  return left !== null && back - left >= min ? left : null
}

export function noteLeft(now: number = Date.now()): void {
  leftAt ??= now
}

export function noteBack(now: number = Date.now()): void {
  const from = awayFrom(leftAt, now)
  leftAt = null
  if (from !== null) {
    since = from
    notify()
  }
}

let installed = false
export function installAwayTracker(): void {
  if (installed || typeof document === 'undefined' || typeof window === 'undefined') return
  installed = true
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? noteLeft() : noteBack()))
  window.addEventListener('blur', () => noteLeft())
  window.addEventListener('focus', () => noteBack())
  // The overview shot opens the card without waiting out AWAY_MS. The app
  // never calls it; a real away is the visibility and focus listeners above.
  const door = {
    away(msAgo: number): void {
      noteLeft(Date.now() - msAgo)
      noteBack()
    }
  }
  Object.defineProperty(window, '__rdW3', { configurable: true, value: door })
}

export function awaySince(): number | null {
  return since
}

export function dismissAway(): void {
  if (since === null) return
  since = null
  notify()
}

export function useAwaySince(): number | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    awaySince,
    awaySince
  )
}
