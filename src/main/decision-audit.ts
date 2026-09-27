import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { redactSecrets } from '../shared/redact'
import { DECISION_AUDIT_MAX, decisionOf, parseDecisionRow, type DecisionRow } from '../shared/decision-audit'
import type { EventRow, LedgerRow } from '../shared/run-ledger'

/**
 * M369. The decision audit's file: one append-only JSONL in userData, beside
 * the run ledger and the broker's audit (M87's shape). Written by MAIN only,
 * from the ledger's own writer, so no renderer can add or edit a decision by
 * a door of its own. Every row's words pass `redactSecrets` on the way to
 * disk, and the count rides the row. Ring-trimmed at DECISION_AUDIT_MAX —
 * ten times the ledger's — so it outlives the ledger by weeks, and a trim
 * is the oldest decisions leaving, never a row edited.
 */
export interface DecisionAudit {
  /** Mirror one ledger row, if a person decided it. Never throws. */
  record(row: EventRow): void
  /** Newest first. */
  list(limit: number): { rows: DecisionRow[]; skipped: number }
}

export function createDecisionAudit(o: { file: string; max?: number }): DecisionAudit {
  const max = o.max ?? DECISION_AUDIT_MAX
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
    record(row) {
      const d = decisionOf(row)
      if (d === null) return
      const title = redactSecrets(d.title)
      const detail = d.detail === undefined ? undefined : redactSecrets(d.detail)
      const scrubbed = title.count + (detail?.count ?? 0)
      const out: DecisionRow = { ...d, title: title.text, ...(detail === undefined ? {} : { detail: detail.text }), ...(scrubbed > 0 ? { scrubbed } : {}) }
      try {
        mkdirSync(dirname(o.file), { recursive: true })
        appendFileSync(o.file, `${JSON.stringify(out)}\n`)
        appends += 1
        // Only every so often: a trim reads the whole file.
        if (appends % 200 === 0) trim()
      } catch (error) {
        console.warn('[decision-audit] could not append', error)
      }
    },
    list(limit) {
      let text: string
      try { text = readFileSync(o.file, 'utf8') } catch { return { rows: [], skipped: 0 } }
      const rows: DecisionRow[] = []
      let skipped = 0
      for (const line of text.split('\n')) {
        if (line.trim() === '') continue
        let parsed: unknown
        try { parsed = JSON.parse(line) } catch { skipped += 1; continue }
        const r = parseDecisionRow(parsed)
        if (r === null) { skipped += 1; continue }
        rows.push(r)
      }
      return { rows: rows.reverse().slice(0, Math.max(0, limit)), skipped }
    }
  }
}

/**
 * M373. A row on the record: the run ledger FIRST, then the audit's mirror —
 * a row the ledger refused is not a decision this app recorded (M369's
 * rule). One function, so the renderer's `ledger:event` door and main's own
 * writers (the share doors) keep that order the same way. False when the
 * ledger threw; the audit is then left alone.
 */
export async function recordDecision(ledger: { append(row: LedgerRow): Promise<void> }, audit: Pick<DecisionAudit, 'record'>, row: EventRow): Promise<boolean> {
  try {
    await ledger.append(row)
  } catch {
    return false
  }
  audit.record(row)
  return true
}
