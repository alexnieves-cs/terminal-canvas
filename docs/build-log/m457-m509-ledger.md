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
| #31 | M465 | `shots.yml`: every scene painted on `macos-latest` (offscreen at 2x, so the runner's 1024px screen cannot clamp it), published as a phone gallery (artifact + the orphan `shots-gallery` branch). Harness fixes the first runs exposed: a hidden window's first capture is a stale frame (the three dark scenes that captured light), each `rd-*` scene paints its own steward fixture, `runner` is not a private word on GitHub runners, the flowchart scenes use ⌘0 (Fit all) and the palette's New shell since the redesign moved ⌘1/⌘N | shots run: one image per declared scene; `verify` |

## C — Autonomy (M475–M486)

| PR | Milestone | What | Checks |
|---|---|---|---|
| #33 | M475 (C1a) | Check-gated done: `AUTO-DONE` is a claim; a run started with a check runs it after the marker and only exit 0 is `checked`; a failed check goes back as the next turn up to its retries, then stuck: check; no check is `claimed` ("done · unchecked", never "passed"). Production runner `auto-check-runner.ts` | `verify:auto` auto.check.1–14 |
| #36 | M476 (C1b) | The chip says `checked` or `agent says done`; the review queue names the check that passed and sorts checked work first, bare claims last | `verify:ux` ux.verdict.1–3 |
| this PR | M477 (C2a) | Tonight batches: one auto run at a time on existing chats, each with an optional check and budget; a usage limit pauses and resumes the same task, never stops it; `powerSaveBlocker` held only while a batch runs, released on every exit (done, stop, quit, error). No door yet (C2b) | `verify:auto` tonight.1–6 |

## D — Reach (M487–M494)

| PR | Milestone | What | Checks |
|---|---|---|---|

## E — Cut and untangle (M495–M509)

| PR | Milestone | What | Checks |
|---|---|---|---|
