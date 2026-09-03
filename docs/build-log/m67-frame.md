# M67 — The frame, second pass

**Branch:** `m67-frame`. **Spec:** `docs/superpowers/specs/2026-09-02-m67-frame-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m67-frame.md`. **Status:** finished 2026-09-02.

The brief overruled three beta decisions in one sentence each; this milestone applied them
and the four frame details the scope decision lists, then asked a fresh critic to judge the
frame on both grounds.

## What landed

- **The ground is flat `--s-0`.** No dot grid, no vignette; `--dot` is gone from both theme
  blocks and from `verify:styles` 1's allowlist.
- **No resting shadow.** `--e-1`/`--e-2` left the panel, the subagent node, the nav-grid
  cell, the top bar's spawn button, the HUD and the link banner. A selected panel, a link
  target and a wants-you selection are rings only. `--e-3`/`--e-4` stay on the palette, the
  dock popover, the compact drawers, the diagnostics overlay and the sheet's suggestions.
- **`--frame-line`** (light `--line`, dark `--line-strong`) is the border of the panel frame,
  the subagent node and the ambiguous notice. A dark-theme frame has a hairline a person can
  see with no shadow to find it by.
- **State edges for the states that have no process.** The critic found asleep and
  not-started frames with no edge at all: `none` moved from `--line` (the frame's own colour,
  invisible) to `--line-strong`, and `asleep` is DASHED, the brief's own spelling.
- **The panel frame's details.** Save lives in the chrome row beside the edit toggle (the
  body's Save is gone); the group header's remove control reads `remove`, titled "Remove
  group (its panels stay)"; commit lost its glyph so commit and discard are one text
  treatment; the toolbox title is `toolbox · <repo>` from the directory's basename, trailing
  slashes stripped (and the rail row and palette row now spell it the same way — the critic
  caught `toolbox: repo` beside `toolbox · repo`); the subagent notice has the same leader
  line a node gets.
- **A note is ink, not amber.** `.pf__note`, the toolbox's stale/state lines and the commit
  outcome were amber; the brief says amber is `needs you` and nothing else. They are `--fg-2`
  now. The file panel's unsaved-changes dot stays amber on purpose (below).
- **The chrome title has a floor.** An editing file panel's chrome holds six controls and the
  title had shrunk to nothing (the critic's one blocking finding). `.panel__title` gets
  `min-width: 8ch` — the first cut added it ABOVE the rule's own `min-width: 0` and was
  overridden, which the reshoot caught — and the summary (`123 B · 6 lines`) is now the first
  thing to truncate.
- **The hint strip yields.** `max-width: 40%`, and whole hints drop from the oldest end (they
  wrap onto rows an inner `.hint-strip__row` is too short to show); the strip is one line
  and never cuts a hint mid-word. The first cut clipped the pill itself and left a sliver of
  the hidden row above; the second moved the clip inside the padding.

## Decisions not visible in the diff

- **The rail's state column is NOT a fixed width.** The spec carried M66's critic's ask; the
  first cut gave `.rail-row__tail` a 6.5em column and every title lost a third of its room in
  a 260px rail. Reverted to the 45% cap with the reason in the rule's comment. The honest fix
  is a wider rail, which is M68's context pass to decide.
- **The group frame keeps its user-chosen colour.** The spec listed it among `--frame-line`
  users; a group's border is its colour label at 62%, which the brief itself exempts ("group
  frame colours stay theirs"). The spec was wrong, the diff is right; recorded here.
- **The unsaved-changes dot stays amber.** The brief's rule is absolute, and this is the one
  deliberate exception: an unsaved draft is the closest thing a file panel has to
  `needs you` — a fact the user must act on before closing — and a grey dot for it would be
  read as decoration. The env banner (login shell unreadable) keeps amber for the same reason.
- **`frame.2a`/`frame.2b` never went red.** They were written after the code; recorded rather
  than faked. `ground.1`/`shadow.1`/`hairline.1` were watched red first.
- **Deferred to M69 (the far view):** the amber ring at 22% (the wants-you selection paints
  all four sides at that tier), non-terminal kinds not summarising, hairlines vanishing at
  22% (the one place the shadow was doing work). **To M68 (the context pane):** the pid
  shown twice in the inspector; the merged lane's tint matching the group tint. **Recorded,
  no change:** the working edge (blue) beside the iris ring is thin at 100% — M63's decision
  stands, and the ring is on three sides where the edge is not; dark `--green` reading
  lime; the dark well one step from the ground; launcher verbs in preset-name case (they
  are the presets' own names).

## The critic

Fourteen findings. Fixed: 1 (asleep/not-started edges), 4 (the title floor — blocking), 5
(amber notes), 7 (toolbox spelling), 8 (the strip's mid-word clip — fixed before the report
arrived; the critic saw the earlier shots), 12's cause (the column was reverted). Deferred
with a milestone: 2, 3, 13, 14. Recorded: 6, 9, 10, 11. What works and was left alone: the
light ground as a desk; dark hairlines; shadows meaning elevation; the notice's leader; the
group header's words; the palette rows; the attention word everywhere.

## The verifier

Twenty-five findings. Fixed: 1's stale `--dot` comment, 2's two stale `--e-3` comments, 7
(trailing slash), 12 (`ground.1` read the first `.canvas {` rule — the grid-area one-liner —
and was vacuous; it now reads every `.canvas` rule), 14 (`hairline.1` counted declarations
in the commented source). Accepted as recorded: 3 (group frame, above), 9's caveats (order is
the hints array's, which IS oldest-first), 10 (above), 13 (`shadow.1`'s regex misses a
fallback form or an alias token — the rule is pinned, not every evasion), 15/16 (frame.2's
scope), 23 (the `Commit` icon is exported with no caller; left for the icon set's own
audit), 24/25.

## Checks

`verify:styles ground.1/shadow.1/hairline.1`; `verify:panels frame.2a/frame.2b`; `verify:rail`
restated for `toolbox · repo`. `npm run verify` green, run alone, before the merge.
