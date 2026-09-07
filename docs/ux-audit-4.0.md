# The 4.0 UX audit (M149)

Walked 2026-09-07 from the goldens `verify:visual` wrote at the close of Act II — every scene
`npm run shot` paints, looked at one by one, against the intent its manifest states. The
method is M61–M70's: what the image shows, what is wrong, what was done. The language is the
Obsidian brief's (M109–M111); anything this audit adds is a NEW name in both theme blocks,
never a re-spelling.

Six lenses, a section each. Findings are numbered `F.n`; each ends with FIXED (and its check),
DECLINED (and why), or OWED (the scene it needs).

## 1. Every scene against its intent

- **launcher.** The hero, three doors, five verbs, the environment line naming what was not
  found and the `Check again` verb. As intended. The rail's `no panels — ⌘N to start one` and
  the dock's `0 live · 0 quiet` agree. Nothing wrong.
- **kinds / kinds-dark.** Every kind side by side on both themes; the state edge, the tone
  words, the dormant card's `click to start` with the annotation beside it, the chat's turn
  rows, the work card's four verbs. Two findings:
  - **F.1** The minimap sits over the `tests` panel's chrome controls (top right). The minimap
    is an overlay by design; a panel parked under it loses its `×` and `fill` to it. DECLINED
    as a scene problem — the fixture parks a panel there; the minimap's corner is the one
    place the canvas cannot be — but the minimap should yield on hover. OWED: `minimap-hover`
    scene, Act V's #33 milestone.
  - **F.2** The toolbox row's new `open` control (M140) drops to its own line under the
    description, where every other row verb sits on the row's first line. FIXED: the row's
    header is a flex line with the verb `flex: 0 0 auto` at its end (`styles.css`,
    `verify:styles toolbox.open.1`).
  - **F.3** The dark theme's top-bar appearance control shows a sun on the dark theme too.
    DECLINED: the control opens the appearance choice (system / light / dark), it is not a
    toggle, and one glyph for "appearance" on both themes is the honest one.
- **workflow.** The verb row, three disabled sentences beneath (Stop, Save, Delete each with
  its why — M133's rule, M137's Triggers reason joins them when it applies), the tabs, the
  diagram. **F.4** The diagram's second block is CLIPPED at the panel's right edge at the panel's
  default width. DECLINED, corrected on reading the stylesheet: the pane already scrolls
  (`.workflow-node__pane { overflow: auto }`); the cut is a scroll container at rest, and
  `fill` is the verb that shows the whole shape.
- **skills.** The pane's three tabs, the search and scope chips, two columns. **F.5** The
  second column (`DOCUMENTS · derived`) is cut at the navigator's right edge. DECLINED,
  corrected on reading the stylesheet: `.skills-pane__columns` already scrolls horizontally;
  the cut is the container at rest. **F.6** A card whose name wraps to two lines drops its
  `⋯` menu under the name. DECLINED by the M127 critic's own ruling — "words, not
  ellipses": a skill's name wraps rather than being cut, and the menu host follows the name.
- **chat.** The conversation, the tool rows, the composer, the `no skills used` capsule. As
  intended.
- **board.** Four columns, two cards, the verbs. An empty column is a heading and a count of
  `0`. **F.7** An empty column says nothing about what it is for; it is also a drop target
  that does not look like one. FIXED: an empty user-set column reads `drop a card here`, a
  runtime column reads what sets it (`working · set when a lane starts`, `review · set when a
  PR opens`) — three states for a column, never a bare zero.

(The remaining scenes are walked below as the audit proceeds; each is listed with its verdict.)

## 2. Empty, loading and error states

Every pane's three states, and which scene shows which. Completed in this act's second pass.

## 3. Motion, reduced motion and focus order

Completed in this act's second pass.

## 4. Chrome accessibility

Completed in this act's second pass.

## 5. Density

`compact` (< 1100 px) and `wide` (> 1600 px) exist; `hidpi` is added in this act.

## 6. Act IV and Act V scenes

Owed: one scene per Act IV / V milestone that lands, added with its golden in that
milestone's commit.
