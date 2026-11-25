import { useSyncExternalStore } from 'react'
import type { UpdateInstallResult, UpdateResult } from '@shared/ipc-contract'

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
 * The result is a NOTICE: nothing here downloads or installs. M695: in a
 * signed build the `newer` arm may carry `installable`, and then the install
 * ask's progress and answer are kept here too, so the same three readers say
 * "installing…" and "ready" in the same words. The install itself is main's
 * (its dialog asks first); this store only remembers what main answered.
 */
export interface UpdateState {
  /** Null until the first check answers. */
  result: UpdateResult | null
  /** True from the ask until the answer; the row says `checking…` and refuses a second ask. */
  checking: boolean
  /** When the answer arrived, for the environment row's `read at`. */
  at: number
  /** M695. True from an install ask until main answers it (its dialog, then the download). Optional: absent reads as false. */
  installing?: boolean
  /** M695. Main's last install answer, or absent. */
  install?: UpdateInstallResult | null
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

/** M695. False when an install ask is already in flight: a double press is one dialog. */
export function beginUpdateInstall(): boolean {
  if (state.installing === true) return false
  set({ ...state, installing: true })
  return true
}

/** M695. A decline leaves nothing to say, so it clears the last answer rather than storing a no. */
export function setUpdateInstall(answer: UpdateInstallResult): void {
  set({ ...state, installing: false, install: answer.kind === 'declined' ? null : answer })
}

/** M695. The newer result, when main said this build can install it. */
export function installableVersion(s: UpdateState): string | null {
  return s.result !== null && s.result.kind === 'newer' && s.result.installable === true ? s.result.version : null
}

/** The one sentence every surface says; the palette row and the launcher both read it. */
export function updateSentence(s: UpdateState): string {
  if (s.checking) return 'checking…'
  if (s.installing === true) return `installing ${installableVersion(s) ?? 'the update'}…`
  if (s.install?.kind === 'ready') return `${s.install.version} is downloaded — it installs when the app restarts`
  if (s.install?.kind === 'restarting') return `restarting to install ${s.install.version}…`
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
