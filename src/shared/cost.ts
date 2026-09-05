import { BACKENDS, type BackendDef } from './agent-backends'

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
 * Which agent CLI a preset launches, when this app knows its integration
 * contract. An integration can support launch controls without claiming cost
 * accounting: see `transcriptAccounting` in AGENT_CAPABILITIES.
 *
 * Absent means an ordinary terminal/login shell or a user command whose
 * vendor contract this app does not know.
 */
export type AgentKind = 'claude-code' | 'codex'

export const AGENT_KINDS: readonly AgentKind[] = ['claude-code', 'codex']

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
  /** Claude Code only. */
  permissionMode?: PermissionMode
  /** Claude Code only. */
  effort?: Effort
  /** Supported by Claude Code and Codex. */
  model?: string
  /** Codex only: `codex --sandbox`. */
  sandbox?: CodexSandbox
  /** Codex only: `codex --ask-for-approval`. */
  approvalPolicy?: CodexApprovalPolicy
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

/** `codex --sandbox`, measured from Codex CLI help on 2026-08-30. */
export type CodexSandbox = 'read-only' | 'workspace-write' | 'danger-full-access'

export const CODEX_SANDBOXES: readonly CodexSandbox[] = [
  'read-only',
  'workspace-write',
  'danger-full-access'
]

/** `codex --ask-for-approval`, measured from Codex CLI help on 2026-08-30. */
export type CodexApprovalPolicy = 'on-request' | 'never'

export const CODEX_APPROVAL_POLICIES: readonly CodexApprovalPolicy[] = ['on-request', 'never']

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
 * The bounded spawn contract for every integrated CLI. This table is the
 * boundary between a saved generic AgentOptions record and vendor argv: an
 * option unsupported by an agent is deliberately omitted, never guessed at
 * and never passed using another CLI's spelling.
 *
 * `sessionIdFlag` belongs here too because session pinning is not a generic
 * promise. Claude creates a transcript at a caller-supplied id; Codex's TUI
 * has no equivalent create-session flag, so it must not receive a synthetic
 * id or be represented as transcript-accounted.
 */
export interface AgentCapability {
  readonly flags: Partial<{ readonly [K in keyof AgentOptions]: string }>
  readonly sessionIdFlag?: string
  /** Whether this app has a stable, per-panel transcript adapter. */
  readonly transcriptAccounting: boolean
  /**
   * M90. What the headless (chat) contract can do, when this app knows one.
   * Absent means the CLI is launched only in a terminal. Every "codex cannot"
   * reason in the panel reads this table rather than a scattered constant.
   */
  readonly headless?: { readonly interrupts: boolean; readonly images: boolean; readonly permissions: boolean; readonly terminalDoor: boolean }
}

/**
 * M99. `headless` is DERIVED from the registry row, never written a second
 * time: two tables of the same booleans agree until one is edited, and the
 * one that drifts is whichever the failing surface did not read.
 * `verify:agent-session registry.2` compares the two.
 */
function headlessOf(row: BackendDef): NonNullable<AgentCapability['headless']> {
  return { interrupts: row.interrupts, images: row.images, permissions: row.asksPermission, terminalDoor: row.terminalDoor }
}

export const AGENT_CAPABILITIES: Readonly<Record<AgentKind, AgentCapability>> = {
  'claude-code': {
    flags: {
      permissionMode: '--permission-mode',
      effort: '--effort',
      model: '--model'
    },
    sessionIdFlag: '--session-id',
    transcriptAccounting: true,
    headless: headlessOf(BACKENDS.claude)
  },
  codex: {
    flags: {
      model: '--model',
      sandbox: '--sandbox',
      approvalPolicy: '--ask-for-approval'
    },
    transcriptAccounting: false,
    headless: headlessOf(BACKENDS.codex)
  }
}
