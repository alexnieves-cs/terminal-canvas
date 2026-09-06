import { missedAt, type PersistedRoutine } from '@shared/routines'

/**
 * M101. THE ROUTINE RUNNER: one interval per routine, armed in main, with NO
 * process in it — a tick is a `fire` the renderer answers by minting a fresh
 * chat as the routine's teammate (only the renderer mints panels). Timers,
 * the clock and the fire are injected, so the arming, the pause, the re-arm
 * and the missed mark run under plain node (`verify:file routine.1`).
 *
 * The app is not a daemon. Arming a routine whose due tick fell while the
 * app was closed marks it MISSED with the time and does NOT fire it: a run
 * nobody asked for at a time nobody chose is the surprise the design rule
 * refuses; the row says what was missed and `Run now` is one click away.
 */
export interface RoutineRunnerDeps {
  now: () => number
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (handle: unknown) => void
  fire: (routine: PersistedRoutine) => void
  /** The record changed here (a missed mark, a run's stamp): main saves it. */
  save: (routine: PersistedRoutine) => void
}

export interface RoutineRunner {
  /**
   * Arms every unpaused routine given (a paused one is known but has no
   * interval), disarming any not in the list. A routine whose interval and
   * pause are UNCHANGED keeps its timer — a save must not reset every phase,
   * or a frequent routine's saves starve a slower one forever. The missed
   * mark is computed only at STARTUP (`startup: true`): a resume after a long
   * pause is not "the app was closed". Returns the ids marked missed.
   */
  arm(routines: readonly PersistedRoutine[], opts?: { startup?: boolean }): string[]
  /** Fires one now, whatever the schedule says. False for an unknown id. */
  runNow(id: string): boolean
  /** Every known id, paused included. */
  ids(): string[]
  disposeAll(): void
}

export function createRoutineRunner(deps: RoutineRunnerDeps): RoutineRunner {
  // A paused routine is KNOWN (no interval, `Run now` still works); an
  // unknown id is refused. Absent handle = paused.
  const armed = new Map<string, { routine: PersistedRoutine; handle: unknown | null }>()
  const disarm = (id: string): void => {
    const a = armed.get(id)
    if (a === undefined) return
    if (a.handle !== null) deps.clearInterval(a.handle)
    armed.delete(id)
  }
  const fire = (routine: PersistedRoutine): void => {
    const stamped: PersistedRoutine = { ...routine, lastRun: { at: deps.now(), outcome: 'started' } }
    delete stamped.missed
    const a = armed.get(routine.id)
    if (a !== undefined) a.routine = stamped
    deps.save(stamped)
    deps.fire(stamped)
  }
  return {
    arm(routines, opts) {
      const wanted = new Set(routines.map((r) => r.id))
      for (const id of [...armed.keys()]) if (!wanted.has(id)) disarm(id)
      const missed: string[] = []
      for (const r of routines) {
        const existing = armed.get(r.id)
        if (existing !== undefined && existing.routine.everyMs === r.everyMs && existing.routine.paused === r.paused) {
          // Same schedule: keep the timer's phase, take the newer record.
          existing.routine = r
          continue
        }
        disarm(r.id)
        if (r.paused) { armed.set(r.id, { routine: r, handle: null }); continue }
        const due = opts?.startup === true ? missedAt(r, deps.now()) : null
        let routine = r
        if (due !== null && (r.missed === undefined || r.missed.at !== due)) {
          routine = { ...r, missed: { at: due } }
          deps.save(routine)
          missed.push(r.id)
        }
        const handle = deps.setInterval(() => { const a = armed.get(r.id); if (a) fire(a.routine) }, r.everyMs)
        armed.set(r.id, { routine, handle })
      }
      return missed
    },
    runNow(id) {
      const a = armed.get(id)
      if (a === undefined) return false
      fire(a.routine)
      return true
    },
    ids: () => [...armed.keys()],
    disposeAll() { for (const id of [...armed.keys()]) disarm(id) }
  }
}
