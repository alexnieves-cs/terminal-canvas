import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { stripAnsi } from '../shared/ansi'

/**
 * M39. One append-only file per panel under `<userData>/scrollback`, written
 * from pty-manager's flush — one append per 16ms flush, of the same string
 * the renderer was sent — so a restored panel can show what it said, and
 * search and export have something to read.
 *
 * AN APPEND STREAM, NOT layout-store's PATTERN, and the difference is stated
 * here where a reader will look for it: the layout store's temp-and-rename
 * is right for a few kilobytes of state written twice a minute and wrong for
 * a byte stream from twelve processes — copying it would rewrite the whole
 * file every 16ms. This is the app's third "state that survives a relaunch"
 * and it is legitimately a different shape.
 *
 * Every write goes through a per-panel promise QUEUE, so order is preserved
 * without the flush path ever waiting on disk, and the ring trim runs inside
 * the same queue so it can never race an append. Retention is the feature:
 * a file past 1.25× the cap is trimmed to its last cap bytes at a line
 * boundary. Unbounded is not a v1 with a to-do; it is a disk-full bug with a
 * delay fuse.
 *
 * node:fs keeps this in the plain-node tier (verify:file) — it is `electron`
 * and `node-pty` that move a module out of it, not the filesystem.
 */
export const SCROLLBACK_MAX_BYTES = 2 * 1024 * 1024

/** M42. A total cap and a per-panel cap so a common token cannot flood the palette. */
export const SEARCH_MAX_HITS = 50
export const SEARCH_MAX_PER_PANEL = 5

/** One matching line: its panel, the stripped text, and its index among the log's split lines. */
export interface ScrollbackHit {
  panelId: string
  line: string
  lineIndex: number
}

/** How far back a tail reads. 64 KiB covers hundreds of lines of a TUI's repaints. */
export const TAIL_WINDOW_BYTES = 64 * 1024

export interface ScrollbackLog {
  append(panelId: string, data: string): Promise<void>
  /** The last `lines` NON-EMPTY, ANSI-stripped lines, oldest first. [] for a panel with no file. */
  tail(panelId: string, lines: number): Promise<string[]>
  /**
   * M58. The WHOLE file, raw. `tail` reads a 64KB window and would truncate
   * an export silently; this is bounded by the log's own cap instead. '' when
   * the panel has no file.
   */
  readAll(panelId: string): Promise<string>
  size(panelId: string): Promise<number>
  /**
   * M42. Case-insensitive substring over the ANSI-stripped log of each LISTED
   * panel, newest hit first WITHIN a panel, capped per panel and in total.
   * An empty or whitespace query answers [] without opening a file.
   */
  search(panelIds: string[], query: string, opts: { maxHits: number; maxPerPanel: number }): Promise<ScrollbackHit[]>
  /** A closed panel's log goes with it. */
  drop(panelId: string): Promise<void>
  clearAll(): Promise<void>
  totalBytes(): Promise<number>
  /** Resolves once this panel's queue is empty. For checks; production never waits. */
  idle(panelId: string): Promise<void>
}

export function createScrollbackLog(o: {
  dir: string
  maxBytes?: number
  tailWindowBytes?: number
}): ScrollbackLog {
  const maxBytes = o.maxBytes ?? SCROLLBACK_MAX_BYTES
  const windowBytes = o.tailWindowBytes ?? TAIL_WINDOW_BYTES
  const queues = new Map<string, Promise<void>>()
  const fileOf = (panelId: string): string => join(o.dir, `${panelId}.log`)

  const enqueue = (panelId: string, job: () => Promise<void>): Promise<void> => {
    const prior = queues.get(panelId) ?? Promise.resolve()
    // A failed job must not poison every later one: log and carry on, which
    // is what a per-flush disk hiccup deserves (the renderer already has the
    // bytes; only the record is short).
    const next = prior.then(job).catch((error) => {
      console.warn(`[scrollback] write failed for ${panelId}`, error)
    })
    queues.set(panelId, next)
    return next
  }

  const statSize = async (path: string): Promise<number> => {
    try {
      return (await fs.stat(path)).size
    } catch {
      return 0
    }
  }

  /**
   * Keep the LAST `maxBytes`, starting at the first line boundary inside that
   * window, through a temp file and a rename — the one place this module
   * borrows the layout store's move, because a trim is a whole-file rewrite
   * and it happens once per cap's worth of output rather than per flush.
   */
  const trim = async (path: string, size: number): Promise<void> => {
    const handle = await fs.open(path, 'r')
    try {
      const start = Math.max(0, size - maxBytes)
      const buf = Buffer.alloc(size - start)
      await handle.read(buf, 0, buf.length, start)
      const nl = buf.indexOf(0x0a)
      const kept = nl >= 0 && nl + 1 < buf.length ? buf.subarray(nl + 1) : buf
      const tmp = `${path}.tmp`
      await fs.writeFile(tmp, kept)
      await fs.rename(tmp, path)
    } finally {
      await handle.close()
    }
  }

  return {
    append(panelId, data) {
      return enqueue(panelId, async () => {
        await fs.mkdir(o.dir, { recursive: true })
        const path = fileOf(panelId)
        await fs.appendFile(path, data, 'utf8')
        const size = await statSize(path)
        if (size > maxBytes * 1.25) await trim(path, size)
      })
    },

    async readAll(panelId) {
      const path = fileOf(panelId)
      // After the queue drains, so an export never races a flush mid-line.
      await (queues.get(panelId) ?? Promise.resolve())
      try {
        return await fs.readFile(path, 'utf8')
      } catch (error: unknown) {
        if ((error as { code?: string }).code === 'ENOENT') return ''
        throw error
      }
    },
    async tail(panelId, lines) {
      const path = fileOf(panelId)
      const size = await statSize(path)
      if (size === 0) return []
      const start = Math.max(0, size - windowBytes)
      let handle
      try {
        handle = await fs.open(path, 'r')
      } catch {
        return []
      }
      let buf: Buffer
      try {
        buf = Buffer.alloc(size - start)
        await handle.read(buf, 0, buf.length, start)
      } finally {
        await handle.close()
      }
      // A window that starts mid-file starts mid-LINE, and possibly mid-
      // CHARACTER: skip to the first newline, and if there is none, strip the
      // orphaned UTF-8 continuation bytes (10xxxxxx) a mid-sequence start
      // leaves behind — decoding them yields U+FFFD, which a card would then
      // render as a real character the agent never printed.
      if (start > 0) {
        const nl = buf.indexOf(0x0a)
        if (nl >= 0) buf = buf.subarray(nl + 1)
        else {
          let i = 0
          while (i < buf.length && (buf[i]! & 0xc0) === 0x80) i += 1
          buf = buf.subarray(i)
        }
      }
      const text = stripAnsi(buf.toString('utf8'))
      const out: string[] = []
      const all = text.split(/\r?\n|\r/)
      for (let i = all.length - 1; i >= 0 && out.length < lines; i -= 1) {
        const line = all[i]!.trim()
        if (line !== '') out.unshift(line)
      }
      return out
    },

    async search(panelIds, query, opts) {
      const q = query.trim().toLowerCase()
      if (q === '') return []
      const hits: ScrollbackHit[] = []
      for (const panelId of panelIds) {
        if (hits.length >= opts.maxHits) break
        const path = fileOf(panelId)
        let text: string
        try {
          if ((await statSize(path)) === 0) continue
          // The whole file, which the ring trim keeps at <= 1.25x the cap —
          // bounded by construction, so no windowing is needed here.
          text = await fs.readFile(path, 'utf8')
        } catch {
          continue
        }
        const lines = stripAnsi(text).split(/\r?\n|\r/)
        let perPanel = 0
        // From the END: the newest matching line first, which is the one a
        // user looking for "which panel printed the stack trace" wants first.
        for (let i = lines.length - 1; i >= 0 && perPanel < opts.maxPerPanel && hits.length < opts.maxHits; i -= 1) {
          const line = lines[i]!.trim()
          if (line === '') continue
          if (line.toLowerCase().includes(q)) {
            hits.push({ panelId, line, lineIndex: i })
            perPanel += 1
          }
        }
      }
      return hits
    },

    size(panelId) {
      return statSize(fileOf(panelId))
    },

    drop(panelId) {
      return enqueue(panelId, async () => {
        await fs.rm(fileOf(panelId), { force: true })
      })
    },

    async clearAll() {
      // Wait for every queue so a trailing append cannot land after the clear.
      await Promise.all([...queues.values()])
      let names: string[] = []
      try {
        names = await fs.readdir(o.dir)
      } catch {
        return
      }
      await Promise.all(names.filter((n) => n.endsWith('.log') || n.endsWith('.log.tmp'))
        .map((n) => fs.rm(join(o.dir, n), { force: true })))
    },

    async totalBytes() {
      let names: string[] = []
      try {
        names = await fs.readdir(o.dir)
      } catch {
        return 0
      }
      const sizes = await Promise.all(names.filter((n) => n.endsWith('.log')).map((n) => statSize(join(o.dir, n))))
      return sizes.reduce((a, b) => a + b, 0)
    },

    idle(panelId) {
      return queues.get(panelId) ?? Promise.resolve()
    }
  }
}
