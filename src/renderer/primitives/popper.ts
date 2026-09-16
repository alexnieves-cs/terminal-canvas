/**
 * WHY THE POPPER WRAPPER IS NEUTRALISED (see styles.css, the one
 * `[data-radix-popper-content-wrapper]` rule).
 *
 * Every Radix overlay that can float — Menu, Popover, Tooltip — renders its
 * content through Floating UI and wraps it in a div carrying INLINE
 * `position: fixed` and a `transform: translate(...)`. That is the right
 * default for an app whose overlays have no placement of their own.
 *
 * This app is the other kind. Placement here is a stylesheet fact, written
 * from a positioned host: `.shell__view-menu` is `absolute; top: calc(100% +
 * var(--sp-3)); right: 0` under `.shell__view { position: relative }`, and
 * `.inspector__menu` is pinned to `position: absolute` by verify:styles
 * `m207.context.1` — the check reads the rule, so the rule cannot simply be
 * deleted in favour of Floating UI. Nested inside a fixed, transformed
 * wrapper those offsets resolve against the WRAPPER instead of the host, and
 * every migrated menu lands somewhere else. It is a silent failure: no error,
 * no red suite, and only a screenshot sees it.
 *
 * `display: contents` on the wrapper is the whole fix. The element generates
 * no box at all, so its children participate in the host's layout directly
 * and `position: absolute` resolves against the host exactly as it did before
 * Radix was introduced. The alternative, `position: static`, still leaves a
 * flow box that becomes a zero-size flex item in `.shell__view` and
 * `.work-node__verbs`, nudging their gaps.
 *
 * It must be `!important` because Radix writes those styles INLINE, and it
 * must live in styles.css rather than a second stylesheet, because
 * verify:styles reads styles.css alone and a rule it cannot see is a rule
 * that drifts. The declaration names no token, so the token contract — and
 * every lint in checks 1 through 8 — is untouched.
 */
export const POPPER_WRAPPER_ATTR = 'data-radix-popper-content-wrapper'

/**
 * Radix's own placement props, fixed for every overlay this app renders.
 *
 * With the wrapper neutralised, Floating UI's measurements are inert — the
 * stylesheet places the surface — so collision handling is turned OFF rather
 * than left running against a box that does not exist. `avoidCollisions`
 * against a zero rect would otherwise flip `side` on a whim and write
 * `data-side="top"` onto content whose CSS says `bottom: 100%`.
 */
export const INERT_PLACEMENT = { avoidCollisions: false, sideOffset: 0, alignOffset: 0 } as const
