import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { BrokerAuditRow } from './broker'

/**
 * M87. The broker's audit: one append-only JSONL beside the run ledger,
 * metadata only. Read newest first for M89's page; a malformed line is
 * skipped and counted, never fatal — the parser rule.
 */
export const BROKER_AUDIT_MAX = 2000

export interface BrokerAudit {
  append(row: BrokerAuditRow): void
  list(limit: number): { rows: BrokerAuditRow[]; skipped: number }
}

export function createBrokerAudit(o: { file: string; max?: number }): BrokerAudit {
  const max = o.max ?? BROKER_AUDIT_MAX
  let appends = 0
  const trim = (): void => {
    let lines: string[]
    try { lines = readFileSync(o.file, 'utf8').split('\n').filter((l) => l.trim() !== '') } catch { return }
    if (lines.length <= max) return
    const tmp = `${o.file}.tmp`
    try {
      writeFileSync(tmp, `${lines.slice(lines.length - max).join('\n')}\n`)
      renameSync(tmp, o.file)
    } catch { /* the file stays long; a later append trims again */ }
  }
  return {
    append(row) {
      try {
        mkdirSync(dirname(o.file), { recursive: true })
        appendFileSync(o.file, `${JSON.stringify(row)}\n`)
        appends += 1
        // Ring-trimmed like the memory store — the newest RAW lines, through a
        // temp file — and only every so often, since a trim reads the whole
        // file. Unbounded, a loop of refused calls fills the disk and buries
        // the one real row a person needs to see (M87's verifier).
        if (appends % 100 === 0) trim()
      } catch { /* an audit that cannot be written must not stop the call; the caller's answer stands */ }
    },
    list(limit) {
      if (!existsSync(o.file)) return { rows: [], skipped: 0 }
      let text = ''
      try { text = readFileSync(o.file, 'utf8') } catch { return { rows: [], skipped: 0 } }
      const rows: BrokerAuditRow[] = []
      let skipped = 0
      for (const line of text.split('\n')) {
        if (line.trim() === '') continue
        try {
          const parsed: unknown = JSON.parse(line)
          if (typeof parsed !== 'object' || parsed === null) { skipped += 1; continue }
          const r = parsed as Record<string, unknown>
          if (typeof r.at !== 'number' || typeof r.service !== 'string' || typeof r.method !== 'string' || typeof r.path !== 'string' || typeof r.status !== 'number') { skipped += 1; continue }
          rows.push(r as unknown as BrokerAuditRow)
        } catch { skipped += 1 }
      }
      return { rows: rows.reverse().slice(0, Math.max(0, limit)), skipped }
    }
  }
}
