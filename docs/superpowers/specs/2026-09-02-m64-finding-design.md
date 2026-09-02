# M64 — Finding a panel

**Status:** design, 2026-09-02. **Branch:** `m64-finding`.
**Brief principles built against:** 3 (identity leads, provenance follows), 1 (the state
word in the Go-to row), 7 (three states: the empty search names its term), 9 (copy). Feature
and surface: shot, looked at, critiqued.

## What this milestone is for

Every palette row that names a panel leads with a machine-minted path:
`Go to sh — /private/var/folders/hl/3nv4zlv11vg6kxy1rp3lm3040000gn/T/tc shot fixtures …
(twin)`, ninety characters of identical prefix per row, the user's own title relegated to
the dim right-hand hint. Search hits do the same. The empty search says `No matches` twice
and never names the term. Fuzzy highlighting lights scattered letters across `/private/var`.
The list can scroll so the first match hides under its section header. M61's critic found all
five; the author named "finding a panel" as one of the three things they touch constantly.

## Design

### The Go-to row

`Go to <name>` where `<name>` is `nameOf(panel)`: the user's title if set, else the honest
label without its path or id — `sh`, `claude`, `review: claude — api`, `server.ts`,
`plan.md`, `toolbox: repo`, `Jira tickets`. The row's hint (right column) is the **state
word** in its tone followed by the **path**, left-truncated to its last two segments with a
leading `…/` so the repository name survives (`idle · …/fixtures/repo`). A sessionless kind
shows its kind word and, for a file, its directory.

`PanelRow` gains `name`, `path` (the spec cwd, the file's directory, the toolbox cwd; absent
for a review or Jira panel) and `state: StateInput`; the row's word is computed at build time
from `getAgentState(id)` — the palette's rows are frozen while it is open by design, and a
state that moved while the overlay was up is the same accepted staleness `restartable`
already has. The id is no longer in the row's text; `verify:panels` 39 selects the row by
`data-command-id` instead of by id-in-text.

### Matching

A path matches only as a **contiguous** substring. `Command` gains `pathText?: string`;
`filterCommands` and `bestMatchIndex` run the fuzzy match over the haystack as before, and
when it fails, accept a row whose `pathText` contains the query (case-insensitive) at a low
fixed score — so typing `repo` still finds every panel in a repository named that, and typing
`group` no longer lights `g…o…u…p` across `/private/var/folders`. Highlighting is unchanged
(title only).

### `state:` — finding by what an agent is doing

A query beginning `state:` filters the Panels section to Go-to rows whose state word contains
the rest (`state:needs`, `state:idle`, `state:asleep`) and orders them needs-you first, then
working, idle, starting, exited, not started, asleep. With nothing after the colon it lists
every panel in that order — the "who needs me" list in four keystrokes. Implemented in
`filterCommands` over a `stateWord`/`statePriority` the Go-to rows carry, so it is plain-node
checked; the footer names the prefix while it is active.

### Search hits and the empty state

A hit row is `<name>` (mono) with the matching line as its hint; typing narrows by line as
before. The empty state is one row: `No matches for “term”`, no duplicated hint. The
"nothing indexed" and "search is off" rows are unchanged.

### Scroll to the top on a query change

`Palette.tsx` resets the list's `scrollTop` when the query changes, before the selected-row
`scrollIntoView` runs; the first match is never hidden under a section header.

## What it must not break

- `verify:panels` 39 (Go to frames a dormant panel and does not start it) — restated to select
  by `data-command-id`.
- `keyboard.1`'s ordering (spatial order at rest) — the `state:` order applies only under the
  prefix.
- Every existing `verify:palette` fixture: `label` stays on `PanelRow`; `name`/`path`/`state`
  are additions with defaults derived from `label` when absent, so older fixtures build.

## Checks

- `verify:palette find.1` — a Go-to row's title is `Go to <name>`, its hint carries the word
  and the left-truncated path, and neither contains the id; `find.2` — `pathText` matches
  only contiguously (`repo` finds, `rpo` does not, and the title still fuzzy-matches);
  `find.3` — `state:needs` lists only needs-you rows and `state:` orders by priority;
  `find.4` — the search empty row names the term once and a hit row's title is the name.
- `verify:panels find.5` — after a query that scrolls the list, a new query lands with
  `scrollTop === 0`; and the search scope's hit row for the dormant fixture reads its title.
- `verify:rail` — `shortPath` is pure and lives beside `panelLabel`'s helpers: `find.6`.

## Definition of done

Rows, matching, `state:`, search hits, scroll; checks red first; shot, looked at, critiqued;
verify green alone; merged; branched.
