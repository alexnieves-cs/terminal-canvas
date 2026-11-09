# Reliability: crashes, recovery, budgets and the soak

What the app does when something breaks, how that is checked, and how to read
and re-pin the numbers. Landed as M650–M654 (ledger: `docs/build-log/m457-m509-ledger.md`, section W).

## What happens when something breaks

| What broke | What the app does | Where |
|---|---|---|
| An exception or an unawaited rejection in main, after the window exists | Recorded (scrubbed) in `crash-log.jsonl` in the app's data folder; main keeps running, because exiting would end every agent on the direct backend | `main/crash-guard.ts` |
| The same, before the first window | An error box, then exit. There is nothing to carry on behind | `main/crash-guard.ts`, `main/index.ts` |
| The boot sequence itself rejects | The same error box and exit, instead of an app with no window | `main/index.ts` (the `.catch` on `whenReady`) |
| The renderer crashes | Recorded, and the window loads again by itself, at most three times a minute. On tmux the terminals reattach | `main/index.ts` (`render-process-gone`) |
| The whole app is killed, force quit, or loses power | The next launch finds the run marker (`running.json`) nobody cleared, puts the saved canvas back, and says in one sentence what came back | `main/last-exit.ts`, `shared/persistence.ts` |

`crash-log.jsonl` never leaves the machine. It keeps the newest 100 records;
each has the error's name, message and stack with the data folder, the home
folder and anything shaped like a token replaced, and a count of what was
replaced.

## Crash reports that leave the machine

Off by default, and there are two separate switches in Settings, Privacy & export:

- **Sentry DSN** (since M112): a person's own Sentry project. Reports go there and nowhere else.
- **Send crash reports to the maintainers** (M652): the opt-in toggle for the
  project's own address. **That address does not exist yet**: `PROJECT_DSN` in
  `main/telemetry.ts` is empty, so the toggle sends nothing, and its description
  says so. When a DSN is added, it goes in that constant and the description
  loses its last clause in the same change. `verify:file telemetry.6` fails if
  only one of the two moves.

Either way every event passes `scrubEvent`, an allowlist that drops
breadcrumbs, request, user, tags and frame variables, and runs each kept
string through `redactSecrets`. A native dump (process memory) rides only its
own setting and never the maintainers' toggle.

## The checks

`npm run verify:reliability` (in `npm run verify`, Electron tier) launches the
built app as a child process and drives it from outside
(`scripts/lib/real-app.cjs`: stdout, the control socket, DevTools).

- `recover.*`: six terminals, `SIGKILL`, relaunch. The same panels in the same
  places, the same process ids on tmux, one sentence in the notice. Then the
  renderer alone is crashed and must come back. Then a clean quit must not be
  called a crash.
- `perf.*`: the budgets below.

Plain-node halves: `verify:file crash.1`–`crash.3` (the guard's policy),
`telemetry.6` (the toggle), `verify:layout persist.6` (the run marker and the words).

## The budgets

Budgets are for the hosted macOS runner, where the gate runs. Each is the
runner's measured figure with wide headroom: they catch a start that takes
three times as long or a canvas that drops to a slideshow, not a 15% drift.
Every run prints its figures as `MEASURE` lines whether it passes or not.

| Budget | Check | Limit | Measured on the runner |
|---|---|---:|---|
| Cold start: spawn to a mounted canvas and an answering control door, best of the suite's launches | `perf.cold.1` | see `BUDGETS` | see the ledger |
| Frame time while panning, 50 terminals, p95 of 120 frames | `perf.frame.1` | see `BUDGETS` | see the ledger |
| Frame time while pinch-zooming, 50 terminals, p95 of 120 frames | `perf.frame.2` | see `BUDGETS` | see the ledger |
| Idle CPU: whole process tree, 50 idle terminals, 20 s, percent of one core | `perf.idle.1` | see `BUDGETS` | see the ledger |

The limits live in one place, `BUDGETS` at the top of
`scripts/verify-reliability.cjs`, each beside the figure it was pinned from.

**To re-pin one:** take the `MEASURE` lines from three green runs of the
`verify` job on `main`, write the worst of the three into `measured`, and set
`budget` to about three times that. Tighten only with a reason; a budget that
flakes gets fixed, never moved out of the gate.

`TC_PERF_BUDGET_SCALE=<n>` multiplies every budget for a machine that is not
the runner. CI never sets it.

Energy impact has no budget yet. Idle CPU is the part of it this suite can
measure from outside.

## The soak

`npm run soak` (`scripts/soak.cjs`), and `.github/workflows/soak.yml` on the Mac runner:

- **Weekly**, Sundays 08:00 UTC: 20 terminals printing for 5 hours.
- **On demand** (Actions, soak, Run workflow): up to 330 minutes, which is what
  one hosted job allows.
- **On a pull request that touches the soak's own files**: a 10-minute smoke.

It samples once a minute from outside the app: memory (whole tree and main),
main's open file descriptors, process count, the renderer's JS heap and DOM
node count, sessions alive (main's list and tmux's), CPU, and disk.

It fails when the app exits, when any terminal's process dies, when scrollback
on disk passes its per-panel cap, when a clean quit leaves a session behind,
or, on a run of 90 minutes or more, when a series **grew** after the warm-up:
both its slope per hour and its first-to-last-quarter difference over the
limits in `LIMITS`. A shorter run is a smoke and reports growth without judging it.

Each run uploads `samples.csv`, `summary.md` and `chart.svg` and writes the
summary to the job page.

**The growth limits are a first pin**, set before a full-length run existed to
set them from. After the first three weekly runs, set each `perHour` to about
three times the largest slope seen and each `total` to about three times the
largest difference.

## Running these off a Mac

The suite and the soak also run on Linux under `xvfb-run`, which is how they
were developed. Two things to know: tmux needs a UTF-8 locale
(`LANG=C.UTF-8`), or it rewrites the tabs in its listing and the app sees no
sessions; and software rendering needs `TC_PERF_BUDGET_SCALE`.
