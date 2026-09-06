# M122–M125 — The product: build log

Branch `m122-product`, base `main@d57403e` (Act II merged). One spec
(`docs/superpowers/specs/2026-09-06-m122-m125-product-design.md`), one plan
(`docs/superpowers/plans/2026-09-06-m122-m125-product.md`), two tracks on the one branch:
Track A (M122 search → M124 audit and hand checks) in the main session, Track B (M123 the
update notice) as a fresh-context subagent in a worktree. The red check is its own commit
before its feat commit, as in Act II.

## M122 — Find in panels…

One scope over the two durable logs — the scrollback log (M39) and the chat transcript log
(M73) — for the ACTIVE workspace's panels, built in MAIN by `main/panel-search.ts`, pure
over injected readers (`verify:file psearch.1` drives it over two real logs under plain
node). Three rules, each a silent failure without it: every line leaves through
`redactSecrets` — the outward gate's fourth named caller (`verify:verbs gate.2` names it
rather than loosening the count) — and the result carries the count; the cap is STATED on
the result (`capped`, `cap`), never silent; a dormant panel's log answers like a live one,
which is the point of the durable log. The existing `scrollback:search` invoke was WIDENED,
not duplicated: its answer is `PanelSearchResult` now, the renderer's `searchResults`
holds the whole answer, and the palette's scope shows the cap row and the redaction row
FIRST (`the first 50 matches — narrow the search`, `2 secrets redacted from these lines`),
then the hits — a transcript hit flying to its chat and to its turn through the chat
store's `scrollToTurn` bus (the panel scrolls the row whose id is the turn's). Persistence
off is no longer the whole answer: the reason reads `terminal output is not being kept —
turn on Keep output; chats still answer`, and the transcript hits stay beneath it. Both
harnesses wrap their scrollback search into the new shape; five older palette fixtures
moved to it.

## M123 — the update notice (Track B)

<!-- filled from Track B's report at the merge -->

## M124 — the third audit, and the owed hand checks

The CI red of Act 0, fixed at its cause: `verify:review`'s across fixture made a bare
origin whose HEAD named the runner's default branch (`master`), so the second clone checked
out an unborn branch, its commit started a second root, and `push HEAD:main` was
non-fast-forward — locally green only because this machine's default branch is `main`.
`git symbolic-ref HEAD refs/heads/main` on the bare repo (every git has it) and an explicit
`checkout main` in the second clone. CI is read again after M125's push.

`docs/dead-end-audit.md` gained the M113–M123 section: every surface the two acts added,
walked from every state with the sentence it shows. `verify:panels reach.2` tabs through the
Board pane's rows (the uncarded row's `Show on canvas` in order) and the card's enabled verbs
with a REAL Tab.

**The hand checks, on this machine:**

<!-- filled after the checks: each done or restated, with the date and the words seen -->

## M125 — reconcile and ship 3.0.0

<!-- filled at the ship -->

## The checks

`verify:file psearch.1`, `verify:palette psearch.1`, `verify:verbs gate.2` (widened by
name), Track B's `verify:file update.1` and `verify:meta update.1`, `verify:panels reach.2`,
`verify:review` (the fixture), `verify:ipc` at 112.

## The gate

<!-- filled at the gate -->

## What green does not prove

That `api.github.com` answers the real fetcher (declined by construction in every suite);
that the `.dmg` opens on another Mac past Gatekeeper with the sentence; the five hand checks
and the one outward dispatch — each recorded once by hand, on this machine, above.
