import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomic } from './atomic-file'
import { dayOf, emptyUsageCounts, parseUsageCounts, recordUsage, usageCountsText, usageFeatureOf, USAGE_FILE, type UsageCounts } from './usage-counts'

/**
 * M697. The tally's one file, over an injected directory, clock and switch,
 * so verify:file drives it under plain node. node:fs only, the tier
 * file-read.ts sits in.
 *
 * `enabled()` is asked on EVERY record: the setting is read at use, never
 * captured, so turning it off stops counting at once. With it off, nothing is
 * read or written, and no file is made. Writes are coalesced (one per
 * `flushMs`) and flushed at quit; the file is 0600 and written atomically, so
 * a crash mid-write leaves the last good tally, never half of one.
 */
export interface UsageStoreDeps {
  dir: string
  enabled: () => boolean
  now: () => number
  flushMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface UsageStore {
  record(channel: string): void
  /** The tally as it stands, or null when there is none. */
  read(): UsageCounts | null
  /** The text Copy my usage counts hands the renderer, or null when there is no tally. */
  text(appVersion: string): string | null
  /** Deletes the file and forgets the tally. True when there was one. */
  clear(): boolean
  flush(): void
}

export function createUsageStore(deps: UsageStoreDeps): UsageStore {
  const file = join(deps.dir, USAGE_FILE)
  const flushMs = deps.flushMs ?? 5_000
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))
  // undefined: not read yet; null: read, and there is none.
  let state: UsageCounts | null | undefined
  let dirty = false
  let timer: unknown = null

  const load = (): UsageCounts | null => {
    if (state !== undefined) return state
    try { state = parseUsageCounts(readFileSync(file, 'utf8')) } catch { state = null }
    return state
  }
  const flush = (): void => {
    if (timer !== null) { clearTimer(timer); timer = null }
    if (!dirty || state === undefined || state === null) return
    dirty = false
    try { writeFileAtomic(file, JSON.stringify(state) + '\n', { mode: 0o600 }) } catch (error) {
      console.warn('[usage] could not write the local tally', error)
    }
  }

  return {
    record: (channel) => {
      // The table first: this runs on every invoke, pty:write included, and
      // an uncounted door must cost one lookup and no setting read or disk.
      if (usageFeatureOf(channel) === null || !deps.enabled()) return
      const before = load() ?? emptyUsageCounts(dayOf(deps.now()))
      const after = recordUsage(before, channel, dayOf(deps.now()))
      if (after === before) return
      state = after
      dirty = true
      if (timer === null) timer = setTimer(() => { timer = null; flush() }, flushMs)
    },
    read: () => load(),
    text: (appVersion) => { const s = load(); return s === null ? null : usageCountsText(s, appVersion) },
    clear: () => {
      if (timer !== null) { clearTimer(timer); timer = null }
      const had = load() !== null
      state = null
      dirty = false
      try { rmSync(file, { force: true }) } catch { /* nothing to remove */ }
      return had
    },
    flush
  }
}
