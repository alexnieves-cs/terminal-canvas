import { useSyncExternalStore } from 'react'
import type { UpdateResult } from '@shared/ipc-contract'

/**
 * M123. THE LAST UPDATE CHECK'S ANSWER — one value for the whole renderer,
 * in a module-level store outside React (the shape every store since M12
 * takes; `last-line-store.ts` is the nearest sibling), never on
 * `registry.version()`, which carries tier/status/focus/exit and nothing
 * else. Three readers, one source: the palette's `env.update` row, the
 * launcher's second footer line, and the row's own feedback line all say
 * the same sentence because they read the same object. A fourth state
 * beside the result's three — `null`, not checked — is the honest rest
 * state: the setting is off by default, so most launches never ask, and
 * "not checked" is a different sentence from "up to date".
 *
 * The result is a NOTICE and nothing more: nothing here downloads or
 * installs (auto-swap is declined by name for an unsigned build), and the
 * `newer` arm carries only a url for `links.open`.
 */
export interface UpdateState {
  /** Null until the first check answers. */
  result: UpdateResult | null
  /** True from the ask until the answer; the row says `checking…` and refuses a second ask. */
  checking: boolean
  /** When the answer arrived, for the environment row's `read at`. */
  at: number
}

const EMPTY: UpdateState = Object.freeze({ result: null, checking: false, at: 0 }) as UpdateState
let state: UpdateState = EMPTY
const listeners = new Set<() => void>()

function set(next: UpdateState): void {
  state = next
  for (const cb of listeners) cb()
}

export function beginUpdateCheck(): void {
  if (state.checking) return
  set({ ...state, checking: true })
}

export function setUpdateResult(result: UpdateResult, at = Date.now()): void {
  set({ result, checking: false, at })
}

export function getUpdateState(): UpdateState {
  return state
}

/** The one sentence every surface says; the palette row and the launcher both read it. */
export function updateSentence(s: UpdateState): string {
  if (s.checking) return 'checking…'
  if (s.result === null) return 'not checked'
  switch (s.result.kind) {
    case 'current': return `up to date — ${s.result.version}`
    case 'newer': return `${s.result.version} is out`
    case 'could-not-check': return `could not check — ${s.result.reason}`
  }
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    getUpdateState,
    getUpdateState
  )
}
