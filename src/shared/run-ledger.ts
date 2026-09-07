import type { TokenTotals } from './cost'
/**
 * M52. One row of the run ledger — what a panel ran and how it ended. Shared
 * so the contract can name it; the writer is main/run-ledger.ts. No output
 * bytes, ever: metadata only.
 */
export interface RunRow {
  panelId: string
  command: string
  cwd: string
  startedAt: number
  endedAt: number
  exitCode: number | null
}

/**
 * M142 (backlog #19's history half). A panel's usage, written ONCE when the
 * panel is killed or its process exits, beside the command rows — history
 * rides #46's ledger, never a third store. Per-model token totals, never a
 * price: the RENDERER prices with the summary's own rule (`costOf`), so a
 * price-table change re-prices last week the same way it re-prices today.
 */
export interface UsageRow {
  kind: 'usage'
  panelId: string
  byModel: Record<string, TokenTotals>
  turns: number
  endedAt: number
}

export type LedgerRow = RunRow | UsageRow

/** A usage row read back: the record rules — a malformed one costs that row. */
export function parseUsageRow(raw: unknown): UsageRow | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.kind !== 'usage' || typeof r.panelId !== 'string' || typeof r.turns !== 'number' || typeof r.endedAt !== 'number') return null
  if (typeof r.byModel !== 'object' || r.byModel === null) return null
  const byModel: Record<string, TokenTotals> = {}
  for (const [model, t] of Object.entries(r.byModel as Record<string, unknown>)) {
    if (typeof t !== 'object' || t === null) return null
    const tt = t as Record<string, unknown>
    const n = (k: string): number | null => (typeof tt[k] === 'number' && Number.isFinite(tt[k]) ? (tt[k] as number) : null)
    const input = n('input'), output = n('output'), cacheWrite = n('cacheWrite'), cacheRead = n('cacheRead')
    if (input === null || output === null || cacheWrite === null || cacheRead === null) return null
    byModel[model] = { input, output, cacheWrite, cacheRead }
  }
  return { kind: 'usage', panelId: r.panelId, byModel, turns: r.turns, endedAt: r.endedAt }
}
