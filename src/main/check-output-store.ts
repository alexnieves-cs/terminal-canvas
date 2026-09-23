import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  CHECK_OUTPUT_MAX_RECORDS, isCheckRunId, parseCheckOutputRecord,
  type CheckOutputRead, type CheckOutputRecord
} from '../shared/check-output'

/**
 * M306. One file per check run under `<userData>/check-output`, named by its
 * run id — the store `RunRow.outputId` refers to.
 *
 * NOT the ledger, and the separation is the point: `runs.jsonl` stays the
 * metadata-only file that is safe to paste, and a run's output lives where
 * only a person opening that one run reads it. NOT a log either: a file is
 * written once, whole, when its run ends, and never appended to — so there is
 * no second scrollback here, only the evidence behind one status.
 *
 * Writes are QUEUED (one at a time, in order) and served from memory until
 * they land: the renderer learns a run id from the exit's state publish,
 * which can beat the disk, and a click in that window must read the record
 * rather than `missing`. Retention is a record COUNT with the oldest pruned
 * first — mtime order, read once and then kept in step — so the directory is
 * bounded by construction rather than by a size nobody watches.
 *
 * A read validates the id against the closed alphabet BEFORE it becomes a
 * path: the id crosses the bridge from the renderer, and `../` is not an id.
 */
export interface CheckOutputStore {
  put(record: CheckOutputRecord): void
  read(runId: string): Promise<CheckOutputRead>
  /** Resolves when every queued write has landed — the quit arm and the verifier's. */
  flush(): Promise<void>
}

export function createCheckOutputStore(o: { dir: string; maxRecords?: number }): CheckOutputStore {
  const max = o.maxRecords ?? CHECK_OUTPUT_MAX_RECORDS
  const pending = new Map<string, CheckOutputRecord>()
  let queue: Promise<void> = Promise.resolve()
  // Oldest first. Null until the first write lists the directory once.
  let order: string[] | null = null

  const listOnce = async (): Promise<string[]> => {
    if (order !== null) return order
    try {
      const names = (await fs.readdir(o.dir)).filter((n) => n.endsWith('.json') && isCheckRunId(n.slice(0, -5)))
      const stamped = await Promise.all(names.map(async (n) => {
        try { return { id: n.slice(0, -5), t: (await fs.stat(join(o.dir, n))).mtimeMs } } catch { return null }
      }))
      order = stamped.filter((s): s is { id: string; t: number } => s !== null).sort((a, b) => a.t - b.t).map((s) => s.id)
    } catch {
      order = []
    }
    return order
  }

  const write = async (record: CheckOutputRecord): Promise<void> => {
    await fs.mkdir(o.dir, { recursive: true })
    const ids = await listOnce()
    const file = join(o.dir, `${record.runId}.json`)
    // Temp and rename: a record is read whole, so a half-written file must
    // never be visible under its final name.
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(record), 'utf8')
    await fs.rename(tmp, file)
    const at = ids.indexOf(record.runId)
    if (at !== -1) ids.splice(at, 1)
    ids.push(record.runId)
    while (ids.length > max) {
      const old = ids.shift()
      if (old === undefined) break
      await fs.rm(join(o.dir, `${old}.json`), { force: true }).catch(() => {})
    }
  }

  return {
    put(record) {
      if (!isCheckRunId(record.runId)) return
      pending.set(record.runId, record)
      queue = queue
        .then(() => write(record))
        // A failed write is a lost record, never a lost queue: the next run
        // still writes, and the reader says `missing` for this one.
        .catch(() => {})
        .finally(() => { if (pending.get(record.runId) === record) pending.delete(record.runId) })
    },

    async read(runId) {
      if (!isCheckRunId(runId)) return { kind: 'missing' }
      const mem = pending.get(runId)
      if (mem !== undefined) return { kind: 'ok', record: mem }
      let text: string
      try {
        text = await fs.readFile(join(o.dir, `${runId}.json`), 'utf8')
      } catch (e) {
        return (e as NodeJS.ErrnoException).code === 'ENOENT' ? { kind: 'missing' } : { kind: 'unreadable', why: (e as Error).message }
      }
      let raw: unknown
      try { raw = JSON.parse(text) } catch { return { kind: 'unreadable', why: 'the record is not valid JSON' } }
      const record = parseCheckOutputRecord(raw)
      return record === null ? { kind: 'unreadable', why: 'the record is malformed' } : { kind: 'ok', record }
    },

    flush() {
      return queue
    }
  }
}
