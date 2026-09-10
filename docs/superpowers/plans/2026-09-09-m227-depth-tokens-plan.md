# M227 — plan

Spec: [`../specs/2026-09-09-m227-depth-tokens.md`](../specs/2026-09-09-m227-depth-tokens.md).

Test-first. Each task's check is written and **watched failing** before its implementation.

| # | Task | Check | Evidence |
|---|---|---|---|
| 1 | Write `depth.1` and `rim.1` in `scripts/verify-styles.cjs` against the untouched stylesheet | `depth.1`, `rim.1` | both FAIL, details naming the absence — [`m227-pure-red-evidence.md`](../../build-log/m227-pure-red-evidence.md) |
| 2 | Lift `rim.1` out to M228 (it needs an applied surface, which M227 has by definition none of) | — | `57/57` with `depth.1` still red |
| 3 | Declare the four tokens in the LIGHT block, with the comment that says why `--rim` is not `--edge-light` | `depth.1`, `theme.1` | `theme.1` red on parity until task 4 |
| 4 | Declare the same four in the DARK block, valued for a dark ground (`--glass-0` below `--s-0`, `--rim` a low-alpha white, `--rim-inner` deep enough to read at the golden's scale) | `depth.1`, `theme.1`, check 11 | green |
| 5 | Extend `obsidian.1`'s `GLASS` floor with all four | `obsidian.1` | green |
| 6 | Zero-drift proof | `verify:visual` | every scene unchanged within both budgets |

**Order matters at tasks 3–4.** Declaring one block first and watching `theme.1` go red is the
cheap proof that the parity gate is live for these names — the failure mode it exists to catch
(a token in one theme falling through to the other's value, visible only when a user hovers, in
the theme the author was not looking at) is silent by construction.

**Risk.** `verify:panels theme.1` pins `--well`'s dark literal by RESOLVED value and parses with
`toRgb`, which skips an rgba. Nothing here re-spells a measured token, but the panels suite is
the one that would catch it if a later act did, so it runs at the act's close.
