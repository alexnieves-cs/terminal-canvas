# M64 — Finding a panel

**Status:** finished 2026-09-02.
**Branch:** `m64-finding`. **Spec:** `docs/superpowers/specs/2026-09-02-m64-finding-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m64-finding.md`.

One line: a row that names a panel leads with its name, then its state word and a
left-truncated directory; a path matches only contiguously; `state:` lists panels needs-you
first; the empty search names its term; a new query starts at the top of the list.

## What landed

- `palette/panel-name.ts`: `panelName`, `panelPath`, `shortPath` (pure; `verify:rail find.6`).
- `PanelRow` gains `name`, `path`, `stateWord`, `statePriority` (optional; older fixtures
  build); `useRailModels` fills them once per palette open with `getAgentState`.
- Go-to rows: `Go to <name>`, hint `word · …/last/two`, `pathText` for contiguous matching,
  the title and name as searchText. Search hits lead with the name; the empty row is
  `No matches for “term”` with the reason `try another word`.
- `palette-model.ts`: `matchCommand` (fuzzy, then contiguous `pathText`), `parseStateQuery`,
  the `state:` branch in `filterCommands`; a row with a path keeps its subtitle out of the
  fuzzy haystack. `STATE_PRIORITY`/`statePriority` live in `panel-state.ts` (the vocabulary
  owns its order — `state.2` caught them spelled in `panel-name.ts`).
- `Palette.tsx`: the list's `scrollTop` resets on every query change.
- Checks: `verify:palette find.1–.4`, `verify:rail find.6`, `verify:panels find.5`; check 39
  restated to select its row by `data-command-id` (the id left the row's text).

## Decisions not visible in the diff

- **The title outranks the name** — the first cut had `name ?? title`, and `find.1` caught a
  titled panel reading its command. The order is the brief's: the user's word first.
- **A row with a path keeps its subtitle out of the fuzzy haystack.** `find.2` caught the
  shortened path in the subtitle re-admitting the scattered match the milestone exists to
  stop. The state word is not fuzzy-matched either; `state:` is how state is queried.
- **`Tidy everything` still matches `group`** through its searchText (`g…r…o…u…p` in "grid
  align clean up"). Pre-existing, not a path, not this milestone's subject; recorded.
- **The `ENOENT` infrastructure error** on one panels run (the commit fixture's seed file)
  did not reproduce on the next run alone. A stale Electron from the earlier killed run is
  the likely cause; `pkill -f verify-panels.cjs` joins the pre-run hygiene.

## The critic

Handed the brief and five palette/search images; 28 findings.

**Accepted and fixed in M64**

- 1 — the palette said `working` while the rail said `idle` for one panel: the rows are
  frozen on open by design, so the word is now rendered LIVE by a per-panel subscribing
  span in the row (`LiveStateWord`), from the same vocabulary; the build-time word is only
  the `state:` order's key.
- 2, 15, 20 — the state word is its own fixed column in its tone, between title and hint,
  so paths line up as a column.
- 3, 22 — a search hit's line is mono, left-anchored, and the term is marked in it.
- 5 — `no focused panel` was the rule, not the fix: `click into a panel first`.
- 7, 8 — Go-to titles, paths and hit lines are in the mono face (brief §5, Type).
- 9 — a sessionless row's hint is its path only; the kind glyph is the rail's; the palette
  no longer puts a kind word in the state slot.
- 14, 21 — `…/T/tc shot fixtures` surfaced macOS's one-letter temp segment: the cut now
  lands on a real name.
- 17 — **the state edge was eating the terminal's first cell** (`$ claude` read
  `aiting for input`). The edge overlaid the body as a pseudo-element; it is now the
  frame's left BORDER, declared as the last border rule so the glow tints cannot reset it.
  M63's own check read the pseudo-element and could not see the cell it covered; the check
  now reads the border, and the search scene is where a human saw it.
- 18 — the search footer said `↵ run`; it says `↵ go to`.
- 19 — the `Go to ` prefix is gone: the title is the identity, the verb is in the footer and
  in searchText (typing `go to` still lists every panel; check 39 relies on it).

**Accepted and scheduled**

- 4, 10, 11 (settings hints truncated and in a second voice; the list clips mid-row) — M66.
- 12, 13 (rows that match on text the user cannot see rank first; the selection lands on a
  settings row under a different section) — a scorer question over `searchText`, M66.
- 16 (two hits, one title, no line number) — M66.
- 23 (the empty row's hint repeats the fact; PANELS heading over no panel) — the hint is now
  the way out (`try another word`); the heading is M66's.

**Rejected, with the reason**

- 6 (a destructive row in red) — red also marks a destructive verb; the brief is amended
  (§5 Colour) to say so, as a deliberate second meaning that never appears on a panel.

**Kept** — 24–28.

## The verifier

Every promise confirmed except the `state:` footer hint, which the spec promised and the
diff did not carry; it is struck from the spec rather than added (the `state:` rows already
show their words in a column, and a footer line that repeats the prefix teaches nothing).
Acted on:

- `find.1`'s fixture carried a `state` object the code never read (the spec said rows carry
  state; the code computed the word instead). Rows now carry `state` and the palette reads
  it live — the fixture became true rather than being trimmed.
- `find.3` validated hand-written priorities through a `??` fallback. The fallback is gone
  and the fixture carries no priorities: `statePriority()` is what orders the list.
- `find.5` asserted the second query's `scrollTop === 0` without asserting the first list
  overflowed — it did (`before > 0`), which the report missed, but the point stands and the
  check now also asserts the first list overflowed before the second query.
- The `useRailModels` comment claimed a lifetime the diff did not establish; the rows are
  built on palette open and the WORD is live, and the comment now says exactly that.
- Declined: `panelName` keeping args in a command name (the spec's command is a path; args
  are a separate field), and `shortPath`'s home (`palette/panel-name.ts` beside the rows it
  serves; the spec's "beside `panelLabel`" was a location, not a rule).
- Noted, not changed: a row with a path keeps its subtitle out of the fuzzy haystack, so
  typing `idle` does not find idle terminals — `state:idle` does, and the spec now says so.
