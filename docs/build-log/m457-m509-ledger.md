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

## B — Ship 6.0 (M465–M474)

| PR | Milestone | What | Checks |
|---|---|---|---|
| #31 | M465 | `shots.yml`: every scene painted on `macos-latest` (offscreen at 2x, so the runner's 1024px screen cannot clamp it), published as a phone gallery (artifact + the orphan `shots-gallery` branch). Harness fixes the first runs exposed: a hidden window's first capture is a stale frame (the three dark scenes that captured light), each `rd-*` scene paints its own steward fixture, `runner` is not a private word on GitHub runners, the flowchart scenes use ⌘0 (Fit all) and the palette's New shell since the redesign moved ⌘1/⌘N | shots run: one image per declared scene; `verify` |

## C — Autonomy (M475–M486)

| PR | Milestone | What | Checks |
|---|---|---|---|

## D — Reach (M487–M494)

| PR | Milestone | What | Checks |
|---|---|---|---|

## E — Cut and untangle (M495–M509)

| PR | Milestone | What | Checks |
|---|---|---|---|
