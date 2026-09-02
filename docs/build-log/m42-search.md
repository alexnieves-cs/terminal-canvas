# M42 — Search across every panel

**Status:** finished 2026-09-02.
**Branch:** `m42-search`. **Spec:** `docs/superpowers/specs/2026-09-01-m42-search-design.md`.

One line: the reader M39's durable log was built for — `Cmd+F`, a string, every panel that
said it, camera to the match.

## What landed

- `ScrollbackLog.search(ids, query, { maxHits, maxPerPanel })` (`main/scrollback-log.ts`):
  per panel, whole file (ring-bounded), ANSI-stripped, scanned from the end so newest hits
  come first; caps at 5 per panel / 50 total; an empty/whitespace query answers [] without
  opening a file.
- `scrollback:search` — channel #59, both diagrams. The handler supplies the panel ids from
  `mergedWorkspaces()`, never a renderer argument; gated on `scrollback.persist` like tail.
- A `search` palette scope. `commands.ts` builds `search.hit.<panelId>.<index>` rows (group
  panel) running `goToPanel`, plus three distinct empty states (off / no matches / nothing yet).
- `Cmd+F` opens the scope (usePalette, `event.code === 'KeyF'`); Palette reports its query to
  Canvas while the scope is search; Canvas debounces 120 ms, invokes, and clears on scope-leave.
- A `data-command-id` on palette rows so a check can find one row by id.
- Checks: `verify:file` search.1–.3, `verify:palette` search.1–.3, `verify:ipc` (59),
  `verify:meta` (both diagrams), `verify:panels` search.1 (Cmd+F, type a sentinel, the row
  appears for the right panel only, Enter frames and selects it, camera moved).

## Folded in (M41 verifier note)

- `describeAutomation` now names BOTH handoff bounds (`last 200 lines, 16 KiB max`); the spec
  and the load-bearing entry claimed both were stated in the row but only the line bound was.
  `verify:rail` handoff.1 tightened to require the KiB bound. Also `broadcast.3` (the M40
  chord's two guards, added during M41) is now recorded — it was unlisted in a build log.

## Decided against

- Scrolling the live terminal to the match: a real side effect on a running session, and the
  matched line is already in the row.
