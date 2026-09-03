# M67 — The frame, second pass

**Status:** design, 2026-09-02. **Branch:** `m67-frame`.
**Brief sections built against:** Colour (the ground, resting shadows, dark hairlines), The
panel frame (Save in the chrome row, the group's Remove), principle 4 (line, not shadow).
Surface milestone: shot in both themes, looked at, critiqued.

## What this milestone is for

M63 gave every panel a state edge and M66 a name for every control; both were applied to a
frame that still carries the beta's raised look — a `--e-2` under every panel at rest, a
dotted ground with a vignette, dark-theme borders that vanish into the well. The brief
overrules each in one sentence and this milestone applies those sentences, plus the four
frame details the scope decision lists and the frame items M66's critic deferred here.

## Design

### The ground

- The canvas ground is flat `--s-0`: no dot grid, no vignette. `--dot` is removed from
  both theme blocks (`theme.1` keeps the sets equal) and its allowlist entry from
  `verify:styles` 1. Panning is read from the panels moving, the HUD's coordinates and, in
  M69, the minimap.

### Resting shadows

- `--e-1` and `--e-2` leave the stylesheet's body entirely: the panel, the subagent node,
  the nav-grid cell, the top bar's spawn button, the HUD, the link banner. `--line` carries
  every boundary. The two tokens stay declared (a later overlay may want them) but nothing
  at rest uses them.
- `--e-3`/`--e-4` are overlay-only: the palette, the dock's popover, the compact drawers, the
  diagnostics overlay, the sheet's suggestion list. A selected panel is a ring (`0 0 0 1px
  var(--iris)`), never a lifted one; the link target and the wants-you selection likewise
  keep their rings and lose their elevation. `.panel`'s `transition` keeps `box-shadow` for
  the ring's appearance.

### Dark hairlines

- A new token pair `--frame-line` (light: `--line`; dark: `--line-strong`) is the panel
  frame's border, the group frame's and the subagent node's. Inside a panel, `--line` stays.
  A dark-theme frame is visible against the well without a shadow to find it by.

### The panel frame's details

- **Save in the chrome row.** The file panel's Save sits in the chrome beside the edit
  toggle (after `editing`), never over the body; the body's Save is removed. Same class and
  `data-file-node-save`, so the one check that reads its error keeps its hook.
- **Remove, labelled.** The group header's remove control reads `remove` in the same text
  treatment as `card`/`expand`, with the title `Remove group (its panels stay)`. The `×` is
  the panel-close glyph and a group is not closed.
- **One verb treatment for commit and discard.** Both already share a class shape; the
  chrome's commit control gains the same text-only treatment as the row's discard (no glyph),
  and both read as verbs in the mono face at `--t-xs`.
- **The toolbox title is `toolbox · <repo name>`** — the directory's basename, the same
  split the rail row makes — with the full directory in the body's first line as now. The
  user's own title still wins.
- **The subagent notice gets a leader line** from the panel's right edge to the notice, the
  same `.subagent-edge` a node gets, so the notice reads as belonging to that panel.

### Carried from M66's critic

- The hint strip yields to the HUD: it takes `max-width: 40%` of the canvas and drops its
  oldest hint first when it does not fit (the strip already fades hints; the width rule
  hides from the left). One line, always.
- The rail row's state column has a fixed width (`not started`'s), so a title truncates only
  when the row is genuinely too narrow, and the state never pushes it.
- The theme and context toggles keep their glyphs and titles; the top bar's right cluster
  gains no words. Recorded: the brief's iconography rule is satisfied by `aria-label` +
  `title`, and the critic's "cannot identify" for these two is accepted as the cost of a
  32px-tall bar.

## What it must not break

- `.panel`'s `box-shadow`/`border-color`-only transition (never `transform`).
- `verify:styles` 1 (no literal colour), 8 (no structure in a theme block), `theme.1`,
  `tone.1`, `frame.1`.
- The group `remove` stays `groupControl` (M61's fix).

## Checks

- `verify:styles ground.1` — `.canvas`'s background is a flat token: no `radial-gradient`,
  no `--dot` anywhere.
- `verify:styles shadow.1` — no `var(--e-1)`/`var(--e-2)` in the body; every `var(--e-3)`
  /`var(--e-4)` sits in a rule whose selector names an overlay (`.palette`, `.dock__popover`,
  `.shell--*-drawer`, `.diagnostics-overlay`, `.sheet__suggestions`).
- `verify:styles hairline.1` — `--frame-line` is declared in both blocks, `.panel` uses it,
  and the dark block binds it to `--line-strong`.
- `verify:panels frame.2` — the file panel's Save is inside `.pf__chrome`; the group header's
  remove control has visible text `remove`.

## Definition of done

Every item above; checks red first; shot in both themes; looked at; critiqued; verified;
merged; branched `m68-context`.
