/**
 * Round 7. THIS WEEK'S SPEND AND TOKENS, AS A SHAPE.
 *
 * The ledger already held the only timestamped money in this app — one
 * `UsageRow` per CLOSED session, carrying `endedAt` — and the inspector threw
 * every timestamp away the moment it arrived: `foldUsageHistory` reduced the
 * rows to three scalars, so "$4.12 across 9 sessions" was the most the pane
 * could ever say. It could not say whether that was one expensive afternoon
 * or a steady week, which is the question a person actually asks of a cost
 * readout.
 *
 * Pure: no React, no DOM, no clock of its own — `now` is a parameter, because
 * a function that reads the wall clock cannot be checked against a fixture.
 * Plain-node tier, `verify:usage-series`.
 *
 * THE PRICING RULE IS CARRIED, NOT RE-DERIVED. `foldUsageHistory`'s comment
 * is the law here too: a bucket holding any model without a list price has
 * `costUsd: undefined`, NEVER a smaller number that looks complete. A chart
 * makes that worse than a figure does — a bar drawn short reads as "cheap
 * day", and there is no hover that undoes a shape somebody has already seen.
 * So an unpriced bucket is a HOLE the chart draws as a gap, and the series
 * says `priced: false` so the surface can name why.
 */
import { costOf } from '@shared/pricing'
import type { UsageRow } from '@shared/run-ledger'

export const USAGE_SERIES_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** One day. `costUsd` is undefined when anything in the day is unpriced. */
export interface UsageBucket {
  /** Local midnight opening the day — the x value, and stable to sort on. */
  dayStart: number
  /** Two letters, the way a week of columns is read left to right. */
  label: string
  tokens: number
  costUsd: number | undefined
  sessions: number
}

export interface UsageSeries {
  buckets: UsageBucket[]
  /** False when ANY day in the window is unpriced — the caller says so rather than drawing a short bar. */
  priced: boolean
  /** True when nothing closed all week: an empty chart and an empty sentence are different answers. */
  empty: boolean
  /** The tallest token day, so a caller can size an axis without walking the buckets again. */
  peakTokens: number
}

/** Local midnight for a moment. Local, not UTC: "Tuesday" means the person's Tuesday. */
function midnight (ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * The last `days` days ending today, EVERY ONE PRESENT even when nothing ran.
 *
 * A day with no sessions is a real answer — it is a day nobody spent anything
 * — and dropping it would compress the axis so that two runs a week apart sat
 * side by side and read as consecutive. This is the same reason the machine
 * series keeps its gaps rather than closing them.
 */
export function buildUsageSeries (rows: readonly UsageRow[], now: number, days: number = USAGE_SERIES_DAYS): UsageSeries {
  const today = midnight(now)
  const first = today - (days - 1) * DAY_MS
  const byDay = new Map<number, UsageBucket>()
  for (let i = 0; i < days; i += 1) {
    const dayStart = today - (days - 1 - i) * DAY_MS
    byDay.set(dayStart, {
      dayStart,
      label: new Date(dayStart).toLocaleDateString(undefined, { weekday: 'short' }),
      tokens: 0,
      costUsd: 0,
      sessions: 0
    })
  }

  let priced = true
  let sessions = 0
  for (const row of rows) {
    // A row from outside the window is not an error and not a warning — the
    // caller asked main for a week and main answers with what it has; the
    // window is this function's, so it is this function that drops it.
    const day = midnight(row.endedAt)
    if (day < first || day > today) continue
    const bucket = byDay.get(day)
    if (bucket === undefined) continue
    bucket.sessions += 1
    sessions += 1
    for (const [model, totals] of Object.entries(row.byModel)) {
      bucket.tokens += totals.input + totals.output + totals.cacheWrite + totals.cacheRead
      const c = costOf(totals, model)
      // Undefined POISONS the bucket and the series, and never resets: once a
      // day holds one unpriced model, no later priced row in it can restore a
      // total, because the total would be missing that model's money.
      if (c === undefined) { bucket.costUsd = undefined; priced = false } else if (bucket.costUsd !== undefined) bucket.costUsd += c
    }
  }

  const buckets = [...byDay.values()].sort((a, b) => a.dayStart - b.dayStart)
  return { buckets, priced, empty: sessions === 0, peakTokens: Math.max(0, ...buckets.map((b) => b.tokens)) }
}

/** The chart's own caption. Says what the shape cannot: the window, and whether money is missing from it. */
export function usageSeriesWord (series: UsageSeries): string {
  if (series.empty) return 'nothing closed this week'
  if (!series.priced) return 'tokens by day — spend is incomplete (a model without a list price)'
  return 'spend and tokens by day, this week'
}
