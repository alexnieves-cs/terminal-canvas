# M42 — Search across every panel

**Status:** designed 2026-09-01. Required for 1.0 by the scope amendment
(`2026-09-01-v1-scope-decision.md` §7, feature 4). Depends on M39.
**Backlog entry:** #16.

## What this milestone is for

The canvas's premise is more panels than you can read. Naming a panel says
what it is FOR; search says what it has SAID, which is the question at the
moment you go looking — "which of these twelve printed the stack trace?".
Before M39 an xterm-backed search found nothing on a restored canvas and did
so silently; the durable log is what makes a canvas-wide answer possible at
all, and this milestone is the reader.

## Decisions

1. **The index is the log, searched by main.** `scrollback:search` takes a
   query and answers `{ panelId, line, lineIndex }[]`, case-insensitive
   substring over each panel's ANSI-stripped log, capped at
   `SEARCH_MAX_HITS` (50) total and `SEARCH_MAX_PER_PANEL` (5) per panel,
   newest first within a panel. Only panels the layout currently holds are
   searched — a closed panel's log is already dropped. Live and dormant
   panels are the same case here, because the log is written from the
   flush for both; that is the whole reason #16 was gated on #30.
2. **`Cmd+F` opens the palette in a `search` scope** whose query box IS the
   search term. The palette already owns the keyboard while open, already
   renders sectioned rows with a footer, already dismisses on outside click
   and `Escape`, and already frames a panel through `goToPanel`. A second
   overlay would be a second copy of all four. The scope's rows come from a
   provider Canvas fills asynchronously: `Palette.tsx` reports its query to
   Canvas only while the scope is `search`, Canvas debounces 120 ms, asks
   main, and passes the results in as `ctx.searchResults`; `commands.ts`
   builds one row per hit — the panel's honest label, the matching line as
   the subtitle — running `goToPanel`. `Cmd+F` is free of every TUI claim
   (bare keys are theirs; `Cmd` chords are ours), and the row's `searchText`
   carries the line so the palette's own filter keeps every hit visible.
3. **Three empty states, never one.** With the scope open: "nothing
   indexed — scrollback is off" (the setting is false), "no matches for
   `…`" (a query with zero hits), and no row at all before the first
   keystroke. Collapsing the first two tells the user the wrong fix.
4. **A hit moves the camera, never the terminal.** Enter on a row frames
   and selects the panel through the same `goToPanel` the switcher uses —
   which never wakes. It does NOT scroll a live terminal to the match: that
   is a real side effect on a running session, and `scrollPosition()` exists
   because "did this terminal scroll when it shouldn't have" is already a
   property this repo asserts. The matched line is visible in the row.

## What it must not break

- **Nothing in the renderer touches `fs`**; one new invoke, 59 channels.
- **Search results are chrome**, inside the palette, outside `.world`.
- **`goToPanel` never wakes** — the switcher's rule, inherited.
- **The palette's captured-focus rules** — the scope is a scope.

## Verification

- `verify:file` `search.1–.3`: hits across two panels' logs, newest first
  within a panel, per-panel and total caps honoured, case-insensitive;
  a panel not in the given id list is never searched; an empty query
  answers `[]` without reading a file.
- `verify:palette` `search.1–.3`: rows from results run `goToPanel` with
  the right id and carry the line; the three empty states are three distinct
  disabled rows with distinct reasons; the `search` scope shows only its own
  rows.
- `verify:panels` `search.1`: two panels print two different sentinels;
  `Cmd+F`, type one, the row appears, Enter frames that panel (camera
  moved, selection set, nothing woken).
