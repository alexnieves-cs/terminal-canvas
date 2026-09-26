# M353 — the orchestration scenes wait for their Changes pane

**Verdict: shipped.** Arc 0, owed by M349. Under load, M349's `UPDATE_GOLDENS=1` wrote the
`orchestration` and `orchestration-working` goldens while the workbench's Changes pane still
said `Reading changes…`. They were restored from HEAD by hand, because nothing stopped a
golden from pinning a loading caption. Every orchestration shot now waits for the caption to
resolve, and a caption still there after 5 seconds is a thrown scene, not a golden.

## What landed

- **`changesRead(k, scene)`** (`scripts/shot.cjs`). It polls every 100ms for an
  `.orch__caption[role="status"]` reading `Reading changes…` (`OrchWorkbench.tsx`), and
  throws naming the scene after 50 polls.
- It runs before all four orchestration shots: `orchestration`, `orchestration-dark`,
  `orchestration-working` and `orchestration-watch`. M349 named two. The other two show
  the same workbench, and a shot with no caption returns at once.

## Decisions, and why

- **Wait on the caption, not a longer sleep.** A sleep long enough for a loaded machine
  slows every run, and still loses on a slower one. The caption is the page's own
  statement that it is not ready.
- **Throw rather than shoot.** A golden of a loading caption fails every later run, or
  passes a regression that also stalls. A thrown scene names the cause in the run's
  output.

## Checks

`npm run verify:visual` against the committed goldens, with the waits in place:
- `orchestration`: 0 px differ;
- `orchestration-dark`: 0 px;
- `orchestration-working`: 44 px (0.004%);
- `orchestration-watch`: 438 px (0.035%), its in-flight arc, as its intent discloses.

73/74 passed. The one red is `starter`, which stays red on purpose. No golden changed,
so no critic was needed: the goldens M349 restored from HEAD are the settled pane, and
the scenes now wait for that pane before they shoot. `verify:meta` 51/51.

## Gate

The full `npm run verify` ran in 724.1s: 59/61 suites, and every red is the
baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

`shot.cjs` is hand-run, so the gate does not run these scenes. The visual run above is
their check.

## Owed

Nothing new.

Next: M354 (an agent's meter survives an app relaunch), then M355 (a held agent is a
needs-you, with its own kind in the decision queue).
