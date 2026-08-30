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

/**
 * The knobs an agent CLI exposes at spawn, carried as ONE optional record
 * rather than three optional fields.
 *
 * Three separate fields would be three conditional copies at each of the nine
 * sites that rebuild a spec or a preset field-by-field (parsePanel,
 * parsePreset, templateOf, presetFromCapture, toPanels, fromPanels, Canvas's
 * template->spec and spec->CapturedPanel, and the pty.create payload) —
 * twenty-seven places for an optional key to vanish silently, with `tsc`
 * saying nothing because every one of them is legally optional. One record is
 * nine, and the absent-vs-undefined trap presets.ts already warns about has to
 * be got right once instead of nine times.
 *
 * Absent means "the CLI's own defaults", which is every login shell and every
 * preset written before M20.
 */
export interface AgentOptions {
  permissionMode?: PermissionMode
  effort?: Effort
  model?: string
}

/**
 * `claude --permission-mode`. A CLOSED union, unlike `model` below, and the
 * asymmetry is principled rather than inconsistent: dropping an unrecognised
 * value here falls back to the CLI's own default, which is MORE restrictive,
 * never less. A permission value passed through verbatim because we did not
 * recognise it is the one failure this feature cannot accept.
 *
 * Measured from `claude --help` on 2026-08-30. Like M17's `--session-id`
 * filename rule, that is one machine on one CLI version and NO suite checks
 * it — a release that renames a mode makes the flag fail the spawn outright.
 */
export type PermissionMode =
  | 'acceptEdits'
  | 'auto'
  | 'bypassPermissions'
  | 'manual'
  | 'dontAsk'
  | 'plan'

export const PERMISSION_MODES: readonly PermissionMode[] = [
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'manual',
  'dontAsk',
  'plan'
]

/** `claude --effort`. Closed for the same reason PERMISSION_MODES is. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

/**
 * `claude --model` is deliberately NOT a closed union: it takes an alias
 * (`opus`) or a full id (`claude-fable-5`), so a fixed list rots the day a
 * model ships — and pricing.ts already sets this repo's posture for a model it
 * does not recognise (answer undefined, never a plausible wrong number).
 *
 * What it is guarded against is NOT shell injection, which is unreachable:
 * args reach node-pty as an argv array, and tmux execs the multi-argument form
 * of new-session directly rather than through `sh -c`. The real surface is
 * `claude`'s OWN argument parser — a value of `--dangerously-skip-permissions`
 * would be read as a flag rather than as --model's operand, and layout.json
 * and presets are both shareable artifacts. Hence the leading-alphanumeric
 * anchor, which is the whole point of the pattern; the length cap is the same
 * bound this repo puts on everything it reads and does not own.
 */
export const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/

/**
 * How each knob is spelled as a flag. A flat const beside the one AgentKind,
 * NOT a per-agent capability table: AgentKind has exactly one member, so such
 * a table would have one row, one consumer, and would still leave exactly the
 * one `spec.agent === 'claude-code'` branch it claims to remove — the
 * customer-free abstraction AgentKind's own comment declines by name.
 *
 * BUILD THE TABLE WHEN THE SECOND AgentKind LANDS, and not before.
 */
export const AGENT_FLAGS: { readonly [K in keyof AgentOptions]-?: string } = {
  permissionMode: '--permission-mode',
  effort: '--effort',
  model: '--model'
}
