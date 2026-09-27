import { type TokenTotals } from './cost'

/**
 * Dollars per MILLION tokens, per class, per model.
 *
 * CHECKED on 2026-09-14 against platform.claude.com's models overview, which
 * publishes input/output per model and "cache reads cost 10% of the base
 * input price (2.5% on Claude Fable 5.1)". The first transcription
 * (2026-08-30) had Sonnet 5 at 3/15 — half again too high — and lacked both
 * Fables. Cache WRITE rates are still the 1.25x-of-input 5-minute rule rather
 * than a figure read off the pricing page (that page 404'd at check time). A
 * price table with no date is a table nobody can tell is stale, which is why
 * the date is here rather than in a commit message; `verify:usage`
 * `pricing.1` pins the checked rates so a re-transcription error goes red.
 * An unknown model yields no figure at all rather than a plausible-looking
 * wrong one, which is the one thing this table gets to be confident about
 * regardless.
 *
 * KNOWN UNDERCOUNT: `cacheWrite` does not separate 5-minute from 1-hour
 * writes (the latter bill at 2x input), so a session on the 1-hour TTL is
 * priced low. Splitting it needs `cache_creation.ephemeral_1h_input_tokens`
 * carried through TokenTotals.
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
  // Fable 5.1's cache read is 2.5% of input, not 10% — the one row where
  // scaling from input would have been wrong even before the write rate.
  'claude-fable-5-1': { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 },
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-sonnet-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }
}

/**
 * Models before the 4.6 generation report a DATED snapshot id in
 * `message.model` — real transcripts carry `claude-haiku-4-5-20251001`, never
 * the alias — so an exact-key lookup priced every Haiku turn as unknown, and
 * one unknown model blanks a whole run's total. Only an 8-digit date suffix is
 * stripped: anything looser would price an unrelated future id at a
 * neighbour's rate, the plausible-wrong figure `costOf` exists to refuse.
 */
const DATED_SNAPSHOT = /-\d{8}$/

function ratesFor(model: string): ModelRates | undefined {
  return MODEL_RATES[model] ?? MODEL_RATES[model.replace(DATED_SNAPSHOT, '')]
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
  const rates = ratesFor(model)
  if (!rates) return undefined
  return (
    (totals.input * rates.input +
      totals.output * rates.output +
      totals.cacheWrite * rates.cacheWrite +
      totals.cacheRead * rates.cacheRead) /
    PER_MILLION
  )
}

/**
 * M380. What CACHING returned on these totals, in list-price dollars: every
 * token read from cache would otherwise have been fresh input (`saved`), and
 * every token written to it cost more than fresh input (`premium`). `net` is
 * the return — negative for a session that wrote more than it reused, which
 * is a real answer, not an error. Undefined for a model the table does not
 * price, for costOf's reason: a plausible figure for an unknown model is the
 * wrong answer this table refuses.
 */
export function cacheReturnOf(totals: TokenTotals, model: string): { saved: number; premium: number; net: number } | undefined {
  const rates = ratesFor(model)
  if (!rates) return undefined
  const saved = (totals.cacheRead * (rates.input - rates.cacheRead)) / PER_MILLION
  const premium = (totals.cacheWrite * (rates.cacheWrite - rates.input)) / PER_MILLION
  return { saved, premium, net: saved - premium }
}
