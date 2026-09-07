# v8 Act III — the shell (M171–M175): design

Brief: `2026-09-07-m162-product-polish-brief.md` (BridgeMind One's posture; findings 4, 5,
6, 9, 11, 12, 13, 16, 21). Branch `m171-shell`. The Act 0 map lists every check that reads
these surfaces; each milestone below names the ones it rewrites and keeps the rest.

## M171 — the rail as places

The Panels list groups its rows by what they ARE, under quiet headings with counts:
`Agents · 4` (terminals and chats), `Files · 2` (file and note), `Boards` (work, jira,
github), `Integrations` (browser, watcher, memory, toolbox, skill), `Workflows` (workflow).
Each row: the kind glyph in a soft tint (a terminal gains `KindTerminal`), the name, the
state DOT (the word moves to the row's `title` and stays in `.rail-row__tail` for the checks
— `84`, `state-word.1` — clipped like `.chat__role`), the last line beneath (M105). `start`
reveals on the row's hover / focus-within (the rest rule) — `reveal.1` is REWRITTEN to that
shape (`start` at 0 at rest, 1 on focus-within; `close` unchanged). A selected row is a
soft filled pill (`--iris-dim`, `--r-md`).

- Headings are `<li class="rail-heading">` — never `.rail-row`, so `empty.1`'s count and
  `panels-split.2` hold; they do not render when the list is empty. Their words come from a
  pure `railGroups(rows)` in `rail-rows.ts` (`verify:rail groups.1`): every row lands in
  exactly one group, in array order within it, empty groups omitted, the group order fixed.
- No state word is written in the new markup (`state.2`); the dot's `title` is the row's
  `tail`.
- Goldens: `navigator-panels`, and every scene with the rail (the whole set).

## M172 — the dock and top bar

The dock's buttons stay (`[data-dock]`, `aria-pressed`, ≥ 24px, `targets.1`, `shell.2`) and
gain a LABEL that reveals on hover as a floating tag beside the button (`.dock__label`, at
opacity 0, revealed on the button's `:hover` / `:focus-visible`); the current place is a
filled pill (`--iris-dim`). The `0 live / 0 quiet` capsules leave the dock (finding 16): the
count lives in the rail's `Agents · N` heading. The top bar: the wordmark in the UI face at
`--t-md` weight 600 (already), ONE filled `New…` (`.shell__spawn` unchanged — `primary.1`,
shell `76`), search as a rounded FIELD-shaped button (`.shell__search` stays a button so
`78` holds; it looks like a field), the merge toggle, the appearance chooser (M45's three-way
choice, now a bar control that opens the same setting row — declined as a bare toggle, F.3)
and the pane toggle at the right. `hud.1`'s "zero zoom controls in the bar" holds.

## M173 — the status bar at rest says nothing

`.canvas-hud` keeps its class and its three `[data-hud-*]` controls (`hud.1`, shell `77`,
`compact.1`, `blur.1`) and becomes a floating pill: `−` `100%` `+` `fit`. The coordinates,
the selected panel's name, the CPU · RAM total (`[data-machine-cost-total]` — the metrics
rule) and the tmux notice leave. The tmux fact goes to the launcher as a dismissible first-run
banner (`[data-launcher-tmux]`, dismissed into `hints.seen` beside the hint ids) and stays in
the environment report and the palette's line. The hint strip is REMOVED: its four hints
become the empty state's sentences (`Navigator`'s `no panels — ⌘N to start one` keeps
`empty.1`'s words and gains the three others beneath), `firstrun.3` is rewritten to read
them there (`[data-hint]` on the empty state's lines; the `palette` hint still vanishes
after ⌘K; `hints.seen` still persists), and `compact.1` drops its `.hint-strip` probe.

## M174 — the launcher as a welcome

Title in the UI face (`.launcher__wordmark` — the last mono prose), one line of purpose,
three large soft doors (the existing three, restyled: `--r-lg`, `--s-1`, a hairline, the
name at `--t-lg`), a recents row (`spawn:recent` — the last folders, as chips that open the
sheet on them; absent when there are none, with a sentence), the command verbs as a quiet
list in the UI face with mono ONLY on the command itself (`launcher-codex.1`'s `Start …`
text and `.launcher__verb-name` / `.launcher__verb-hint` / `[data-launcher-preset]` /
`[data-launcher-new-codex]` stay; `reach.1`'s tab walk holds), the environment line as one
calm sentence with `Fix…` (`[data-launcher-check-again]` keeps its attribute and reads
`Check again`; the sentence drops its ` · asked /bin/zsh · checked 2 folders` tail into the
title). `shadow.1`'s `.launcher` lift stays.

## M175 — palette and sheets

The palette, the spawn sheet, the settings drill-in and the context pane take the same
material: 14px, the UI face for titles and labels, section headings in small caps tracking,
rows with the kind glyph, `kbd` chips only where a chord exists; the palette's path column
through `displayPath` (finding 11) and its state column as a dot with the word on hover
(the word stays in the DOM for `palette` checks); the sheet's `WHERE` / `WHAT` / `HOW`
labels in the UI face with mono only on the path and command inputs (finding 12); the
context pane's action bar unchanged in order (finding 13, `reach.1`) but in the material.
Goldens: `palette`, `palette-dark`, `palette-query`, `templates`, `spawn-sheet`, `lineup`,
`supervisor`, `chat-copilot`, `inspector-*`.

## Declined

Modes as a top-level switch (the brief). A dock that expands to a labelled rail (a hover tag
is the label; the rail's width is the navigator's). Removing `.shell__settings`
(`targets.1` names it; it becomes the appearance/settings door).
