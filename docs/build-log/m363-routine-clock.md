# M363 — the routine scene's times are pinned to a clock

**Verdict: shipped.** Owed by M356. The `routine` scene's row says "missed at <time> — the
app was closed" and "last run <time>". The fixture set both times as `Date.now()` minus an
hour and minus 50 minutes, and the page prints them as a clock time
(`toLocaleTimeString`). So the golden pinned the hour it was painted: "06:16 AM" in the
committed golden, "01:47 PM" in M356's run. That run's `UPDATE_GOLDENS` rewrote it
unasked, and a plain run at the wrong hour fails it. Both times are now fixed clock times
in the fixture.

## What landed

- **`clockAt(h, m)`** (`scripts/shot.cjs`): the most recent 06:06 or 06:16, today or
  yesterday. It is always in the past, as a run and a missed tick must be.
- The `nightly review` routine's `lastRun.at` is `clockAt(6, 6)` and its `missed.at` is
  `clockAt(6, 16)`. Those are the times the committed golden shows, so the golden is
  unchanged.

## Decisions, and why

- **Pin the fixture, don't mask the pixels.** The times are part of what the scene is
  for ("missed at <time> — the app was closed"). A mask would hide the one fact the row
  says. A fixed clock keeps the row whole and stable.
- **The same minute gap as before** (a run at 06:06, a missed tick ten minutes later at
  06:16, one `everyMs` apart), so the record still reads as a real schedule.

## Checks

`npm run verify:visual` at 15:40 local time, with the fixture pinned: `routine` 0 px differ
against the committed golden, which was painted at 07:06 and shows 06:06 and 06:16. The
pinned times reproduce it to the pixel nine hours later. 73/74 passed, and the red is
`starter`, which stays red on purpose. `verify:meta` 51/51.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 692.3s: 58/61 suites.
- `verify:panels:agents`: its baseline, `template.1` and `detail.1`.
- `verify:panels:product`: its baseline, `starter.1` and the seven `workflow.*`.
- `verify:panels:shell`: "infrastructure error: ENOENT … seed.txt", at a load average of
  about 25. Rerun alone, it passed 105/105 in 79.0s. The cause is a race in that check's
  own wait predicate, which reads a file while `git checkout` is replacing it. It is
  unrelated to this `shot.cjs` change and is fixed as M364.

## Owed

Nothing new.

Next: M364 (the panels:shell discard check waits for its restore without reading a file mid-replace), then M357.
