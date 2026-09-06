import { realpathSync } from 'node:fs'
import { insidePlace, placeRefusal, type Realpath } from '@shared/places'
import type { PersistedTeammate } from '@shared/teammates'

/**
 * M100. THE PLACES GATE, in MAIN — asked before any spawn resolves a cwd and
 * before any file verb answers for a request that names a teammate. The
 * renderer never decides this: a UI affordance is not an authority boundary,
 * and every verb reaches the filesystem through main anyway.
 *
 * A request with NO teammate passes untouched: a plain panel is the user's
 * own hands, and the gate governs identities, not people. An unknown
 * teammate id is refused by name (a record that vanished must not read as
 * "unrestricted").
 */
export interface PlacesGateDeps {
  realpath: Realpath
  teammate: (id: string) => PersistedTeammate | undefined
}

export type PlacesAnswer = { ok: true } | { ok: false; reason: string }

export interface PlacesGate {
  check(teammateId: string | undefined, path: string): PlacesAnswer
}

export function createPlacesGate(deps: PlacesGateDeps): PlacesGate {
  return {
    check(teammateId, path) {
      if (teammateId === undefined) return { ok: true }
      const t = deps.teammate(teammateId)
      if (t === undefined) return { ok: false, reason: `no teammate is called ${teammateId} — it may have been deleted; open the Teammates pane` }
      if (insidePlace(path, t.places, deps.realpath)) return { ok: true }
      return { ok: false, reason: placeRefusal(t.name, path) }
    }
  }
}

/** The real filesystem's realpath — the only non-pure line in this module. */
export const fsRealpath: Realpath = (p) => realpathSync(p)
