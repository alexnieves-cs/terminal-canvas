/**
 * What an agent has spent, in a shape with no vendor in it.
 *
 * FOUR classes, never two. Measured from a real Claude Code transcript on
 * 2026-08-30: one assistant turn reported input_tokens 2 against
 * cache_read_input_tokens 120118. Cache reads are priced near a tenth of
 * fresh input and cache writes above it, so `input + output` — the obvious
 * model, and the one every naive implementation reaches for — is wrong by
 * more than an order of magnitude on exactly the long-lived sessions this app
 * exists to run. Collapsing these into one number anywhere but inside
 * costOf() reintroduces that error.
 */
export interface TokenTotals {
  /** Fresh, uncached input. */
  input: number
  output: number
  /** cache_creation_input_tokens: written to the cache, priced above input. */
  cacheWrite: number
  /** cache_read_input_tokens: served from cache, priced far below input. */
  cacheRead: number
}

/**
 * One panel's spend.
 *
 * `byModel` is not a nicety: a session can change model mid-conversation, and
 * a flat total cannot be priced at all once it has. It is the unit the price
 * table is applied to.
 */
export interface PanelUsage {
  totals: TokenTotals
  byModel: Record<string, TokenTotals>
  turns: number
  /** Of `turns`, how many were subagent (isSidechain) turns. Included in it. */
  subagentTurns: number
}

export function emptyTotals(): TokenTotals {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
}

export function addTotals(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead
  }
}

/**
 * Which agent CLI a preset launches, when this app knows how to account for
 * it. Absent means "we do not account for this one", which is every login
 * shell and every preset the user wrote by hand.
 *
 * A UNION with one member rather than a boolean, so a second adapter is a new
 * member rather than a rename of every use site — and deliberately not an
 * abstraction beyond that. ideas-backlog #19's own constraint: do not build
 * the abstraction until a second CLI actually wants it.
 */
export type AgentKind = 'claude-code'

export const AGENT_KINDS: readonly AgentKind[] = ['claude-code']
