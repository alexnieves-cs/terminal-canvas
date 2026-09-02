# M63 — The state vocabulary

**Status:** finished 2026-09-02.
**Branch:** `m63-state-vocabulary`. **Spec:** `docs/superpowers/specs/2026-09-02-m63-state-vocabulary-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m63-state-vocabulary.md`.

One line: one function (`panel-state.ts`) says what every panel is doing — `asleep`, `not
started`, `starting`, `working`, `needs you`, `idle`, `exited N`, or its kind — and every
surface reads it; a 3px state edge in the tone's colour on every frame; iris for selection
so blue only ever means working; the card's 32px instruction replaced by the word.

## What landed

- `src/renderer/panels/panel-state.ts`: `panelState(input, agent) → { word, tone }`, the
  tone a closed set of eight. `railTail` is a wrapper over it; `RailRow` carries the input so
  the row applies the agent state it subscribes to. `agentStateLabel` (inspector) delegates.
- The tone block in `styles.css` is the only binding of an agent hue to a state
  (`[data-tone="…"]`); the frame's dot, the rail dot, the pill, the card's state line, the
  summary and block tiers and the popover row all carry `data-tone`. The old
  `.status-dot[data-agent-state=…]` and `.panel__card--agent-*` border rules are gone.
- The state edge: `.pf::before`, 3px, `var(--tone)`, dashed for `asleep`.
- Rail: kind glyphs (five icons) in the left column for sessionless kinds; the word column
  in its tone; pid gone from the rail.
- Attention popover: bottom-aligned to the bell with a caret, each row `label · needs you ›`.
- Status strip: `focus: <id>`.
- `SessionHandle.tail()` returns rows anchored on the last non-empty row, blanks kept.
- Checks: `verify:rail state.1/.2/.3` (504 combinations; the text pin; the wrapper agrees),
  `verify:styles tone.1`, `verify:panels state-edge.1 / state-word.1 / state-popover.1`;
  three older checks restated (`pid N` → the word, `dormant` → `asleep`).

## Decisions not visible in the diff

- **The whole-border attention glow stays** beside the edge. The edge is what survives on a
  card and at 10%; the glow is what says "now". Two checks compare the glow's resolved colour
  and they still pass unchanged.
- **The kind tone was `--fg-3` for one render and is `--line-strong`.** At `--fg-3` the edge
  on a review or file panel read as a black bar in the light theme, heavier than any state.
  A kind is not a state; its edge should be a boundary, not a signal.
- **`.panel__card-idle` keeps its exact text for every unspawned card**, dormant or not. The
  first cut rendered it only for dormant panels and three checks that select on it (13, 21
  and the M57 summary check) found never-started panels with no affordance — and they were
  right: a never-started card wakes on click too. The WORD above it is what tells the two
  apart.
- **The tail anchors on the last non-empty row, not the viewport's bottom.** The first cut
  used `viewportY + rows`, and check 8 (typed keys echo into the card) went red: a fresh
  shell's prompt sits above twenty blank rows, which trimmed to nothing.
- **`running` with no agent word is tone `idle`** (green): alive, and that is all that is
  known. It is the word `railTail` and the plain-node fixtures see.
- **Red first:** `tone.1` and the three panels checks were red on their first run for the
  reasons the spec named (three stray `.status-dot` hue rules; the old words). `state.1` and
  `state.2` were written against a module that already existed and were seen red by fault
  injection (a `dormant` word; a literal planted in `rail-sections.ts`).

## The critic

Handed the brief and the 23 images; 41 findings, with sampled colours. Decisions:

**Accepted and fixed in M63**

- 2, 16, 20, 32 — the focused ring was still BLUE: the later, equal-specificity
  `.panel--selected.panel--agent-*` rules kept `--blue` after the base rule moved to iris.
  The critic sampled it; a check comparing the ring's resolved colour would have caught it,
  and `state-edge.1` now compares resolved colours for the edge for the same reason. Fixed.
- 3, 24, 31 — the Jira kind dot was working-blue and the review/toolbox dots iris. Every kind
  dot is now neutral `--line-strong`; the kind lives in the rail glyph until M67 brings the
  glyph into the chrome.
- 4 (the strip's half) — the "no tmux" sentence was amber. Now `--fg-2`. The review notice
  and the Jira sentence are M67/M68's (scheduled).
- 5, 15 — the strip's token was an id. It is now the selected panel's title and its state
  word, from the vocabulary, in its own subscribing span.
- 7 — the rail's state column said the kind a second time. Empty for sessionless rows.
- 8, 26, 39 — the terminal's chrome dot duplicated the pill's dot. Not painted.
- 9 — the card said `asleep` twice (pill and body). The body keeps only the affordance.
- 11 — the popover's chevron is now the word `jump`.
- 14, 17, 29, 30 — the dashed asleep edge was invisible. Solid `--line-strong`; not-started
  and starting are the lighter `--line`.

**Accepted and scheduled**

- 6, 12 — the palette's Go-to rows say `(dormant)`/`(live)`: M64, finding a panel.
- 18, 19, 21, 22, 27 — compact clipping, the unlabelled pip and ▶, the rail's ragged right
  column: M66.
- 23, 33 (dark idle too bright) — M67, the frame's second pass and the dark values.
- 25 — non-terminal kinds still render whole at 22%: M69, the overview.

**Rejected, with the reason**

- 1 (rail rows carry no edge) — the rail's left slot is the selection bar; a second bar
  there makes selection and state one mark. The brief is amended (principle 2) rather than
  the rail: the row's dot and word carry the tone.
- 10, 34 (the far-zoom needs-you ring reads as focus) — the whole-frame amber glow is the
  attention signal M6c/M43 built and two checks pin; with the ring now iris the two differ in
  hue, and needs-you is the one state allowed to be loud (brief §6).
- 13 (two blues) — same token; the lighter sample is 11px text antialiasing on the rail.
- 28 (edge in screen pixels) — counter-scaling a frame node is the zoom-independent-chrome
  decision the scope decision keeps cut; at `BLOCK_ENTER` the block is the colour.

**Kept** — 35–41.

## The verifier

Every promise confirmed; seven risks, four acted on:

- `Dock.tsx` spelled `needs you` as JSX text and the text pin only matched quoted literals —
  the exact fifth spelling the pin exists to catch. The popover now reads `agentWord()` and
  `state.2` also matches `>word<` JSX text (it then found nothing else but the diagnostics
  table's raw field name, exempted with its reason).
- `tone.1` only scanned attribute selectors; it now scans state-named class selectors too,
  with the frame glow as the one stated exception.
- The strip said `focus:` for the SELECTED id. Fixed with finding 5.
- The `running + exited` agent arm was in the code and not the spec table; the table now has
  it. The stale check-6 comment, check 81's label and the orphaned card-rule comment cleaned.
- Declined: the fallback status in `agentStateLabel` for input-less callers (there are none in
  production; the older checks are the callers), and `.pf::before` at `z-index: 1` over the
  body's first 3px (the frame has a 1px border and the slot's own padding; no glyph lands
  there).
