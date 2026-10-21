# M457–M509 ledger — the streams run, 6.0 to a finished product

Run book: [docs/streams/RUN.md](../streams/RUN.md).
Plan: [docs/streams/ROADMAP.md](../streams/ROADMAP.md).
Ownership: [docs/streams/ownership.json](../streams/ownership.json).
**This ledger is the state.** One row per merged PR, newest at the bottom of its stream.

## Decisions

- 2026-10-21: the owner chose all five streams at once, and to ship 6.0.0 unsigned
  (signing and notarization are decided before 6.1).
- Goldens are written only after the owner has looked at the CI shot gallery.

## S0 (M457) — run scaffolding

| PR | What | Checks |
|---|---|---|
| this PR | Lanes A–E in `docs/streams/ownership.json`, the hook reads them (lane from `RD_LANE` or `.git/tc-lane`), `st:<lane>` CSS fences, this ledger, `verify:meta streams.own.1` | `verify:meta` |

## A — Trust the gate (M458–M464)

| PR | Milestone | What | Checks |
|---|---|---|---|
| #32 | M462 | `verify:visual` runs on CI as a non-blocking job and uploads every scene (`out/visual/`): `TC_VISUAL_SCALE`/`TC_SHOT_SCALE` paint 2x on the runner's 1x screen, `VISUAL_SHOT_DIR` keeps the captures, the watchdog honours `TC_WATCHDOG_SCALE` | job uploaded 97 scenes; size and "runner" paint issues are B's (#31) |

## B — Ship 6.0 (M465–M474)

| PR | Milestone | What | Checks |
|---|---|---|---|

## C — Autonomy (M475–M486)

| PR | Milestone | What | Checks |
|---|---|---|---|

## D — Reach (M487–M494)

| PR | Milestone | What | Checks |
|---|---|---|---|

## E — Cut and untangle (M495–M509)

| PR | Milestone | What | Checks |
|---|---|---|---|
