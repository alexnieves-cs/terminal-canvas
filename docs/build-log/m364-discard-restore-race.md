# M364 — a discard's restore is waited for, never read mid-replace

**Verdict: shipped.** Found in M363's gate. `verify:panels:shell` ended its part with
"infrastructure error: ENOENT … seed.txt" under a load average of about 25. The review
node's Discard check presses Discard on a modified file, then waits for the file to read
`seed` again. Discard is a `git checkout`, which REPLACES the file, so for a moment it
does not exist. The wait's predicate called `readFileSync` bare. When it landed in that
moment it threw, and the harness treats a throw as the part's infrastructure failing, not
as "not yet". The fix: a file that is not there yet is "not restored yet".

## What landed

- `scripts/verify-panels-shell.cjs`: the restore wait's predicate catches the read and
  answers false, so `waitUntil` keeps polling to its 8s bound. The check's meaning is
  unchanged: the file must read `seed` again within that bound.

## Decisions, and why

- **Fix the predicate, not the harness's `waitUntil`.** A predicate that throws for a
  reason nobody expected is still an infrastructure error worth ending a part on. Only
  this predicate's throw is an expected, transient state.
- **Numbered on its own.** M363 was a `shot.cjs` fixture change, and this is a verify
  harness race. Folding it in would have hidden it inside an unrelated milestone.

## Checks

`verify:panels:shell` in the full gate: see Gate.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 717.6s: 59/61 suites, and
every red is the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

`verify:panels:shell` passed in the gate (78.8s, the discard check included), at a load
average of 10–14.

## Owed

Nothing new.

Next: M357 (the hold's answers in the decision queue).
