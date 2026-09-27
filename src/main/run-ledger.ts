import { appendFile, readFile, writeFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { redactSecrets } from '../shared/redact'

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
export type { RunRow, UsageRow, EventRow, GapRow, LedgerRow, TimelineEntry, TimelineFilter, TimelineRead } from '../shared/run-ledger'
import {
  parseEventRow, parseGapRow, parseUsageRow,
  type GapRow, type LedgerRow, type TimelineEntry, type TimelineFilter, type TimelineRead, type UsageRow
} from '../shared/run-ledger'
import { parseReviewIdentity } from '../shared/review-identity'
import { isCheckRunId } from '../shared/check-output'

export interface RunLedger {
  /**
   * M374. Resolves whether the row reached the file — never rejects, so a
   * caller that ignores it (a command end, a usage row) cannot turn a full
   * disk into an unhandled rejection in main, and a caller that must know
   * (`recordDecision`, the renderer's `ledger:event`) is told the truth.
   */
  append(row: LedgerRow): Promise<boolean>
  /** A panel's COMMAND rows, newest first, at most `limit`. Usage rows are `usage()`'s. */
  list(panelId: string, limit: number): Promise<RunRow[]>
  /** M142. Every usage row at or after `since`, newest first. */
  usage(since: number): Promise<UsageRow[]>
  /**
   * M300. The durable record for one subject, newest first: command outcomes,
   * durable events, and any gap the trim left, merged in one pass so the
   * reader cannot show two of them out of order.
   */
  timeline(filter: TimelineFilter, limit: number): Promise<TimelineRead>
}

export const RUN_LEDGER_MAX_LINES = 2000

/**
 * A command row read back, field by field. M286's split, now shared by both
 * readers: a malformed OPTIONAL field costs the field and keeps the row, and
 * a line that is not a command row at all (a usage row, an event, a gap)
 * returns null rather than a row of defaults.
 */
function runRowOf(raw: unknown): RunRow | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Partial<RunRow> & { kind?: unknown }
  if (r.kind !== undefined) return null
  if (typeof r.panelId !== 'string' || typeof r.command !== 'string') return null
  const tested = parseReviewIdentity(r.tested)
  return {
    panelId: r.panelId,
    command: r.command,
    cwd: typeof r.cwd === 'string' ? r.cwd : '',
    startedAt: typeof r.startedAt === 'number' ? r.startedAt : 0,
    endedAt: typeof r.endedAt === 'number' ? r.endedAt : 0,
    exitCode: typeof r.exitCode === 'number' ? r.exitCode : null,
    ...(tested === undefined ? {} : { tested }),
    ...(typeof r.outputId === 'string' && isCheckRunId(r.outputId) ? { outputId: r.outputId } : {}),
    ...(typeof r.scrubbed === 'number' && Number.isInteger(r.scrubbed) && r.scrubbed > 0 ? { scrubbed: r.scrubbed } : {})
  }
}

/**
 * M372. A row's WORDS are scrubbed on their way to disk, and the count rides
 * the row. The ledger is where a terminal's command line lands (a command
 * row), where a tool row quotes the command it ran and a permission record
 * the command it allowed: terminal bytes going to disk, so the rule applies
 * — scrub, count, say the count. A scrub replaces only secret-shaped tokens,
 * so a row still says what ran, and a repeated command scrubs the same way
 * every time (a check keyed by its command still matches itself). Usage and
 * gap rows carry no words.
 */
function scrubbedRow(row: LedgerRow): LedgerRow {
  if (!('kind' in row) || row.kind === undefined) {
    const run = row as RunRow
    const command = redactSecrets(run.command)
    return command.count === 0 ? row : { ...run, command: command.text, scrubbed: (run.scrubbed ?? 0) + command.count }
  }
  if (row.kind !== 'event') return row
  const title = redactSecrets(row.title)
  const detail = row.detail === undefined ? undefined : redactSecrets(row.detail)
  const n = title.count + (detail?.count ?? 0)
  if (n === 0) return row
  return { ...row, title: title.text, ...(detail === undefined ? {} : { detail: detail.text }), scrubbed: (row.scrubbed ?? 0) + n }
}

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

  /**
   * M300. The trim keeps `max - 1` rows and spends the freed line on a GAP
   * row at the head, because a trimmed ledger and a quiet one are otherwise
   * the same file and an empty timeline would read as "nothing happened".
   *
   * A second trim MERGES into the leading gap instead of appending another —
   * the markers would otherwise accumulate one per trim forever, which is the
   * same bounded leak the count-tracking above was written to close.
   */
  const trim = async (): Promise<void> => {
    const lines = await readLines()
    if (lines.length <= max) return
    const kept = lines.slice(lines.length - (max - 1))
    let dropped = lines.length - kept.length
    // A gap among the dropped lines carries rows this file already forgot;
    // its count is inherited, never restarted, or the record would understate
    // how much is missing every time it trims again.
    for (const line of lines.slice(0, lines.length - kept.length)) {
      try {
        const gap = parseGapRow(JSON.parse(line))
        // The marker line itself is not one of the rows it stands for.
        if (gap !== null) dropped += gap.dropped - 1
      } catch { /* a malformed line costs that line */ }
    }
    const marker: GapRow = { kind: 'gap', at: Date.now(), dropped }
    const tmp = `${o.file}.tmp`
    await writeFile(tmp, [JSON.stringify(marker), ...kept].join('\n') + '\n')
    await rename(tmp, o.file)
  }

  return {
    append(row) {
      // Set only once the line is on disk: a trim that fails AFTER it does
      // not unwrite the row, so it still counts as landed.
      let landed = false
      queue = queue.then(async () => {
        if (count === null) count = (await readLines()).length
        await appendFile(o.file, JSON.stringify(scrubbedRow(row)) + '\n')
        landed = true
        count += 1
        if (count > max) { await trim(); count = max }
      }).catch(() => {})
      return queue.then(() => landed)
    },
    async usage(since) {
      await queue
      const lines = await readLines()
      const out: UsageRow[] = []
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        try {
          const row = parseUsageRow(JSON.parse(lines[i]!))
          if (row !== null && row.endedAt >= since) out.push(row)
        } catch { /* a malformed line costs that line */ }
      }
      return out
    },
    async list(panelId, limit) {
      await queue
      const lines = await readLines()
      const out: RunRow[] = []
      for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
        try {
          const row = runRowOf(JSON.parse(lines[i]!))
          if (row !== null && row.panelId === panelId) out.push(row)
        } catch { /* a malformed line costs that line */ }
      }
      return out
    },
    async timeline(filter, limit) {
      await queue
      const lines = await readLines()
      const panels = filter.panelIds === undefined ? null : new Set(filter.panelIds)
      const entries: TimelineEntry[] = []
      let i = lines.length - 1
      for (; i >= 0 && entries.length < limit; i -= 1) {
        try {
          const raw: unknown = JSON.parse(lines[i]!)
          // A gap is nobody's panel and nobody's task: it is a statement about
          // the FILE, so it passes every filter. Hiding it behind a subject
          // filter would put the reader back in front of a silent hole.
          const gap = parseGapRow(raw)
          if (gap !== null) { entries.push({ kind: 'gap', row: gap }); continue }
          const event = parseEventRow(raw)
          if (event !== null) {
            if (filter.runId !== undefined && event.runId !== filter.runId) continue
            if (filter.itemId !== undefined && event.itemId !== filter.itemId) continue
            // An event with no panel belongs to the task, so it is kept by a
            // panel filter only when the task filter already matched it.
            if (panels !== null && event.panelId !== undefined && !panels.has(event.panelId)) continue
            if (panels !== null && event.panelId === undefined && filter.itemId === undefined) continue
            entries.push({ kind: 'event', row: event })
            continue
          }
          const command = runRowOf(raw)
          // A command row predates the run id and carries no item, so a panel
          // filter claims it and a run/task-only read leaves it out rather
          // than guessing which execution ran it. An EMPTY filter claims it
          // too — that read asks for the record itself, which is what the
          // last-seen reconciliation pass wants.
          const claimed = panels !== null
            ? panels.has(command?.panelId ?? '')
            : filter.itemId === undefined && filter.runId === undefined
          if (command !== null && claimed) entries.push({ kind: 'command', row: command })
        } catch { /* a malformed line costs that line */ }
      }
      return { entries, reachedStart: i < 0 }
    }
  }
}
