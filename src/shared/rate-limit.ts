/**
 * Account-level Claude usage windows, folded from `rate_limit_event`.
 *
 * Token counts stay per-panel; this is the subscriber question the inspector's
 * no-selection gauge answers: "can I start a 6-wide pool right now?" Three
 * states on purpose — no event yet, allowed, limited until T — so a depleted
 * window is never rendered the same as a stuck agent or as "zero usage".
 */

export interface RateLimitWindow {
  /** Fraction of the window used, 0..1. */
  utilization: number
  /** Unix seconds when this window resets. */
  resetsAt: number
}

export interface RateLimitWindows {
  five_hour?: RateLimitWindow
  seven_day?: RateLimitWindow
}

/** What one parsed `rate_limit_event` carries. */
export interface RateLimitEvent {
  type: 'rate-limit'
  /** CLI's own word: `allowed`, `rejected`, … */
  status: string
  /** Top-level reset hint when the CLI names one; absent when it does not. */
  resetsAt?: number
  overage: boolean
  windows: RateLimitWindows
}

/**
 * Live canvas-wide usage. `none` is every launch until the first event;
 * collapsing it with `allowed` at 0% would make "never heard" look like "plenty left".
 */
export type RateLimitState =
  | { kind: 'none' }
  | {
      kind: 'allowed'
      overage: boolean
      windows: RateLimitWindows
      /** Wall-clock ms when this state was folded. */
      at: number
    }
  | {
      kind: 'limited'
      /** Unix seconds — when the binding window resets. */
      until: number
      overage: boolean
      windows: RateLimitWindows
      at: number
    }

export const RATE_LIMIT_NONE: RateLimitState = { kind: 'none' }

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

function finite(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

function str(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined
}

/** One window: both utilization and resetsAt must be finite numbers, or the window is dropped. */
function parseWindow(raw: unknown): RateLimitWindow | undefined {
  if (!isRecord(raw)) return undefined
  const utilization = finite(raw.utilization)
  const resetsAt = finite(raw.resetsAt)
  if (utilization === undefined || resetsAt === undefined) return undefined
  return { utilization, resetsAt }
}

/**
 * Parse `rate_limit_info`. `undefined` means absent or not an object — the
 * line parser turns that into `malformed`, never a coerced empty event.
 */
export function parseRateLimitInfo(raw: unknown): Omit<RateLimitEvent, 'type'> | undefined {
  if (!isRecord(raw)) return undefined
  const status = str(raw.status)
  if (status === undefined) return undefined
  const windowsRaw = isRecord(raw.unifiedWindows) ? raw.unifiedWindows : {}
  const five = parseWindow(windowsRaw.five_hour)
  const seven = parseWindow(windowsRaw.seven_day)
  const windows: RateLimitWindows = {
    ...(five === undefined ? {} : { five_hour: five }),
    ...(seven === undefined ? {} : { seven_day: seven })
  }
  const resetsAt = finite(raw.resetsAt)
  return {
    status,
    ...(resetsAt === undefined ? {} : { resetsAt }),
    overage: raw.isUsingOverage === true,
    windows
  }
}

/** Fold the latest event into canvas-wide state. `allowed` vs anything else. */
export function foldRateLimit(prev: RateLimitState, event: RateLimitEvent, nowMs: number = Date.now()): RateLimitState {
  const windows = event.windows
  if (event.status === 'allowed') {
    return { kind: 'allowed', overage: event.overage, windows, at: nowMs }
  }
  const until =
    event.resetsAt ??
    windows.five_hour?.resetsAt ??
    windows.seven_day?.resetsAt ??
    (prev.kind === 'limited' ? prev.until : Math.floor(nowMs / 1000))
  return { kind: 'limited', until, overage: event.overage, windows, at: nowMs }
}

/**
 * The binding utilization: max of the windows we have. `undefined` when no
 * event has named a window yet — a budget must not refuse on that.
 */
export function windowUtilization(state: RateLimitState): number | undefined {
  if (state.kind === 'none') return undefined
  const a = state.windows.five_hour?.utilization
  const b = state.windows.seven_day?.utilization
  if (a === undefined && b === undefined) return undefined
  return Math.max(a ?? 0, b ?? 0)
}

export type BudgetUnit = 'usd' | 'window'

export interface BudgetCrossing {
  spent: number
  limit: number
  unit: BudgetUnit
}

/**
 * One comparison, two units — M82's stop path, not a second enforcer.
 * USD wins when both are configured and both are crossed (the dollar ceiling
 * is the explicit hard stop); otherwise the first arm that crosses fires.
 */
export function budgetCrossing(input: {
  budgetUsd: number
  budgetWindowPercent: number
  spentUsd: number
  windowUtil: number | undefined
}): BudgetCrossing | null {
  const { budgetUsd, budgetWindowPercent, spentUsd, windowUtil } = input
  if (budgetUsd > 0 && spentUsd >= budgetUsd) {
    return { spent: spentUsd, limit: budgetUsd, unit: 'usd' }
  }
  if (budgetWindowPercent > 0 && windowUtil !== undefined) {
    const limit = budgetWindowPercent / 100
    if (windowUtil >= limit) return { spent: windowUtil, limit, unit: 'window' }
  }
  return null
}
