import { useSyncExternalStore } from 'react'
import {
  foldRateLimit,
  RATE_LIMIT_NONE,
  type RateLimitEvent,
  type RateLimitState
} from '@shared/rate-limit'

/**
 * Canvas-wide Claude usage windows. Same shape as usage-store: module-level,
 * never on registry.version() — a rate_limit_event arrives often enough that
 * bumping the canvas counter would re-render every panel for an account fact.
 *
 * A CACHE of what main already folded and emitted on agent:event. Main is the
 * author (it also enforces the window budget); this only projects for the gauge.
 */

let state: RateLimitState = RATE_LIMIT_NONE
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function applyRateLimit(event: RateLimitEvent): void {
  state = foldRateLimit(state, event)
  notify()
}

/** Tests and workspace resets — production only folds forward. */
export function clearRateLimit(): void {
  if (state.kind === 'none') return
  state = RATE_LIMIT_NONE
  notify()
}

export function getRateLimit(): RateLimitState {
  return state
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useRateLimit(): RateLimitState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}
