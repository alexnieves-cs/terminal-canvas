import { appendFile, readFile, writeFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'

/**
 * M52. The run ledger: what each panel ran, and how it ended.
 *
 * An APPEND stream beside layout.json — one JSON line per command end —
 * through its own writer, deliberately not layout-store.ts's
 * temp-and-rename, which is the wrong shape for a growing log (the same line
 * scrollback-log.ts draws). It records NO output bytes: panel id, command,
 * cwd, start, end, exit code — a few hundred bytes per panel lifetime, all
 * metadata, which is what keeps it entirely outside #31's disclosure
 * surface. Capped by line count with a ring trim; reads are newest first; a
 * malformed line costs that line, never the file. Writes are queued so two
 * command ends cannot interleave a line, and flushSync stays the only thing
 * before-quit waits on — a lost last row is a lost row, not a lost file.
 */
import type { RunRow } from '../shared/run-ledger'
export type { RunRow } from '../shared/run-ledger'

export interface RunLedger {
  append(row: RunRow): Promise<void>
  /** A panel's rows, newest first, at most `limit`. */
  list(panelId: string, limit: number): Promise<RunRow[]>
}

export const RUN_LEDGER_MAX_LINES = 2000

export function createRunLedger(o: { file: string; maxLines?: number }): RunLedger {
  const max = o.maxLines ?? RUN_LEDGER_MAX_LINES
  let queue: Promise<void> = Promise.resolve()
  // The line count, read once from the file and then kept in step: the cap
  // is checked on every append without re-reading a growing log each time.
  let count: number | null = null

  const readLines = async (): Promise<string[]> => {
    if (!existsSync(o.file)) return []
    try {
      return (await readFile(o.file, 'utf8')).split('\n').filter((l) => l !== '')
    } catch {
      return []
    }
  }

  const trim = async (): Promise<void> => {
    const lines = await readLines()
    if (lines.length <= max) return
    const kept = lines.slice(lines.length - max)
    const tmp = `${o.file}.tmp`
    await writeFile(tmp, kept.join('\n') + '\n')
    await rename(tmp, o.file)
  }

  return {
    append(row) {
      queue = queue.then(async () => {
        if (count === null) count = (await readLines()).length
        await appendFile(o.file, JSON.stringify(row) + '\n')
        count += 1
        if (count > max) { await trim(); count = max }
      }).catch(() => {})
      return queue
    },
    async list(panelId, limit) {
      await queue
      const lines = await readLines()
      const out: RunRow[] = []
      for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
        try {
          const parsed = JSON.parse(lines[i]!) as Partial<RunRow>
          if (parsed.panelId !== panelId || typeof parsed.command !== 'string') continue
          out.push({
            panelId, command: parsed.command, cwd: typeof parsed.cwd === 'string' ? parsed.cwd : '',
            startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : 0,
            endedAt: typeof parsed.endedAt === 'number' ? parsed.endedAt : 0,
            exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : null
          })
        } catch { /* a malformed line costs that line */ }
      }
      return out
    }
  }
}
