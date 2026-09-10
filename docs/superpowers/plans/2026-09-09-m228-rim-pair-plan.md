# M228 — plan

Spec: [`../specs/2026-09-09-m228-rim-pair.md`](../specs/2026-09-09-m228-rim-pair.md).

| # | Task | Check | Evidence |
|---|---|---|---|
| 1 | Restore `rim.1` (written in M227, held back) into `verify-styles.cjs` | `rim.1` | FAIL — `{both: true, rimUsed: false, innerUsed: false}`: the tokens exist, nothing wears them |
| 2 | Declare `--rim-top` on bare `:root` | 7, 8 | 7 (no colour on bare `:root`) and 8 (no structural token in a theme block) stay green — the recipe holds geometry, the theme holds colour |
| 3 | Wear `--rim-top` at all eight frame shadow sites and the launcher | `rim.1`, `shadow.1` | `rim.1` still FAIL — `{rimUsed: false}` because it grepped for `var(--rim)` and the sites wear `var(--rim-top)` |
| 4 | Wear `--rim-inner` on `.panel__slot` and `.launcher__well` | `rim.1` | `{innerUsed: true, rimUsed: false}` |
| 5 | Rewrite `rim.1` to follow the recipe — and make it STRICTER while doing so | `rim.1` | green, `58/58` |
| 6 | **Mutation-test `rim.1`** | — | three mutations, three reds, each for its own reason |
| 7 | Build, `verify:visual`, walk every moved golden through the gate | `verify:visual` | one critic sentence per changed scene, in the ledger, BEFORE `UPDATE_GOLDENS=1` |

**Task 5 is the one to be honest about.** A check that goes red against a correct stylesheet is a
check the next person deletes, so it had to change — but "the check is inconvenient" and "the
check is wrong" are different findings, and only the second licenses editing it. Here the check
was wrong: it assumed a spelling (`var(--rim)` at the site) rather than a fact (the surface wears
a rim). The rewrite asserts the fact, and adds an arm the first cut did not have.

**Task 6 exists because task 5 happened.** A check that was just rewritten to go green is exactly
the check most likely to have been rewritten into vacuity. Three mutations — a surface wearing
both halves, a literal folded into the recipe, and the frame losing its rim — must each produce a
red naming its own cause.
