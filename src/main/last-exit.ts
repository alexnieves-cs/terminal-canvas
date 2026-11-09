import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { parseLastExit, parseRunMarker, type LastExit } from '../shared/persistence'

/**
 * Brief #20. Which panels had a session when the window last went away —
 * the one fact the next launch cannot reconstruct (see shared/persistence.ts).
 *
 * Three rules, each with a quiet failure:
 *
 * - **Read and delete at construction**, not at the first ask. A record left
 *   on disk outlives a crash: the launch after a crash would read the quit
 *   BEFORE it and report panels as ended that the crash, not the quit, took.
 *   Deleted up front, a crash leaves no record and the notice makes no claim.
 * - **Handed out once.** A reload (Cmd+R) is not a return; a second ask gets
 *   null, and the renderer then says only what the live sessions say.
 * - **Sealed by the quit.** Cmd+Q runs `before-quit` (which records, then
 *   kills or detaches) and THEN closes the window — whose own `closed` record
 *   would overwrite the quit's with an empty running set, taken after the
 *   kill. The quit's record is the true one, so it seals the store.
 */
export interface LastExitStore {
  /** The pending record, once; null after the first take or when there is none. */
  take(): LastExit | null
  /**
   * The window is going away. `quit` writes to disk for the next launch and
   * seals; `window` (macOS keeps the app alive) is held in memory for the
   * window that reopens in this same process.
   */
  record(how: 'quit' | 'window', kept: boolean, running: readonly string[]): void
  /**
   * M651. This run is alive, with these sessions. The FIRST call reads what
   * the previous run left (a marker nobody cleared is a crash, handed out by
   * `take`); every call rewrites the marker, and only when it changed. Call it
   * behind the single-instance gate and before the window exists.
   */
  alive(kept: boolean, running: readonly string[]): void
}

export function createLastExitStore(opts: { file: string; marker?: string; now?: () => number }): LastExitStore {
  const now = opts.now ?? Date.now
  const marker = opts.marker
  let began = false
  let lastMarker = ''
  let pending: LastExit | null = null
  try {
    pending = parseLastExit(JSON.parse(readFileSync(opts.file, 'utf8')))
  } catch { /* absent or unreadable: no record, no claim */ }
  try { unlinkSync(opts.file) } catch { /* nothing to delete */ }
  let sealed = false
  return {
    take() {
      const r = pending
      pending = null
      return r
    },
    record(how, kept, running) {
      if (sealed) return
      const r: LastExit = { at: now(), how, kept, running: [...running] }
      if (how === 'window') { pending = r; return }
      sealed = true
      try {
        writeFileSync(opts.file, JSON.stringify(r))
      } catch (error) {
        console.warn('[last-exit] could not record the quit', error)
      }
      // After the record, so a death between the two lines leaves BOTH files
      // and the next launch reads a quit (the record outranks the marker).
      if (marker !== undefined) try { unlinkSync(marker) } catch { /* never written */ }
    },
    alive(kept, running) {
      if (marker === undefined || sealed) return
      if (!began) {
        began = true
        let left: ReturnType<typeof parseRunMarker> = null
        try { left = parseRunMarker(JSON.parse(readFileSync(marker, 'utf8'))) } catch { /* absent or unreadable: no evidence, no claim */ }
        if (left !== null && pending === null) pending = { ...left, how: 'crash' }
      }
      // `at` is left out of the comparison and refreshed only on a change: a
      // marker rewritten every tick for a new timestamp would be a disk write
      // every few seconds for the life of the app, to record nothing.
      const body = JSON.stringify({ kept, running: [...running].sort() })
      if (body === lastMarker) return
      try {
        writeFileSync(marker, JSON.stringify({ at: now(), kept, running: [...running].sort() }))
        lastMarker = body
      } catch (error) {
        console.warn('[last-exit] could not write the run marker', error)
      }
    }
  }
}
