# M47 — One panel frame

**Status:** finished 2026-09-02.
**Branch:** `m47-frame`. **Spec:** `docs/superpowers/specs/2026-09-01-m47-panel-frame-design.md`.

One line: five hand-rolled panel headers become `PanelFrame`; the DOM contract the checks read
stays as aliases, and the stylesheet's duplicated families go.

## What landed

- `components/PanelFrame.tsx`: the box, the chrome row (state dot or kind accent, the title the
  kind computes, the kind's controls, the close control with the kind's arming rule), the resize
  handles and the link ports. Terminal, review, file, toolbox and Jira all render through it.
- `.pf-*` in the stylesheet: `.pf__body`/`.pf__body--text`, `.pf__summary`, `.pf__note`,
  `.pf__more` once; `.status-dot` as the one rule set keyed on `data-agent-state`; kind accents
  from existing doctrine (review/toolbox iris, file neutral, Jira blue).
- Checks: `verify:styles frame.1` (RED at three-to-four copies each, then green);
  `verify:panels frame.1` (every kind renders through `.pf`), `frame.2` (no transform on
  `.pf__body` as source text, and a cell at scale ≈0.7 maps through `__m4aCellToScreen`).

## Decisions taken beyond the spec, in writing

- **The kind glyph in the chrome is a coloured dot, not an icon.** The spec's `.pf__state` is
  "agent-state dot, or the kind glyph"; a second icon beside the kind's own refresh/edit controls
  read as clutter at 36px, and the accent colour carries the kind. An icon can replace the dot
  later without touching the rule set.
- **`__refresh` has no frame family.** The refresh controls are `.icon-button`s since M45; the
  kind classes stay on them as aliases with no rule behind them.

## Not proven by any suite

- How the five kinds look side by side after the migration: `scripts/shot.cjs` paints only
  terminals; the eye is the check, and it was not run for this milestone.
