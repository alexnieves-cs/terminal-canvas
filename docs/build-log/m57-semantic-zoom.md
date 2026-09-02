# M57 — Semantic zoom

**Status:** finished 2026-09-02.
**Branch:** `m57-semantic-zoom`. **Spec:** `docs/superpowers/specs/2026-09-02-m57-semantic-zoom-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m57-semantic-zoom.md`. Backlog #22.

One line: a card is a tail, then a summary, then a coloured block as the camera pulls away,
decided by a pure render tier with hysteresis that sits below tiering and never inside it.

## What landed

- `canvas/card-detail.ts`: `nextCardDetail(current, scale)` with two hysteresis bands.
- `Canvas.tsx`: one `cardDetail` for the canvas, advanced on `viewport.scale`.
- `TerminalPanel.tsx`: `PanelCard` renders `tail` (unchanged), `summary` (title, state or the
  idle element, one line, cost) and `block` (state-coloured, title across); `data-card-detail`.
- Styles: tokens only; the block title is a token expression, since the scale tops out at 24.
- Checks: `verify:viewport detail.1/.2` (thresholds, hysteresis), `verify:panels detail.1`
  (summary and block read off the DOM at ~0.23 and ~0.10; red by faulting the tier to `tail`).

## Snags

- Checks 13–15 fit-all first, which lands in the summary band; the first summary replaced the
  idle element and all three went red. The element (same text) now survives into `summary`.
- The new check's canvas held one non-terminal node; it now seeds three login shells.

## Not proven

- Readability of the block title at 8% on a real display (it is a marker, not text).
