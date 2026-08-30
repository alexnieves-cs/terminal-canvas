import { type TokenTotals } from '../shared/cost'

/**
 * Dollars per MILLION tokens, per class, per model.
 *
 * PRICES AS OF 2026-08-30, from Anthropic's published API price list. A price
 * table with no date is a table nobody can tell is stale, which is why that
 * sentence is here rather than in a commit message — and why an unknown model
 * yields no figure at all rather than a plausible-looking wrong one.
 *
 * These are API LIST prices. They are not what a Max or Pro subscriber is
 * charged, which is nothing per token. Everything downstream labels the
 * figure accordingly; see buildUsageFields.
 *
 * The four rates are not derivable from one another. Cache writes cost MORE
 * than fresh input (a 5-minute write is 1.25x) and cache reads cost far LESS
 * (0.1x), so a table that stored one "input" rate and scaled it would be
 * inventing two of its four numbers.
 */
export interface ModelRates {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

export const MODEL_RATES: Record<string, ModelRates> = {
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-sonnet-5': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }
}

const PER_MILLION = 1_000_000

/**
 * List-price dollars for these totals, or undefined when the model is not in
 * the table.
 *
 * UNDEFINED, never 0. A model that shipped after this table was written must
 * read as "not priced here"; a zero renders as "$0.00" beside an agent that
 * is visibly working, which is the confident wrong answer the whole design
 * refuses. Note the asymmetry with a KNOWN model at zero tokens, which
 * legitimately IS 0 — those are two different sentences.
 */
export function costOf(totals: TokenTotals, model: string): number | undefined {
  const rates = MODEL_RATES[model]
  if (!rates) return undefined
  return (
    (totals.input * rates.input +
      totals.output * rates.output +
      totals.cacheWrite * rates.cacheWrite +
      totals.cacheRead * rates.cacheRead) /
    PER_MILLION
  )
}
