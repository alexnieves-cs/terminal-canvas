# M58 — Export

**Status:** finished 2026-09-02.
**Branch:** `m58-export`. **Spec:** `docs/superpowers/specs/2026-09-02-m58-export-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m58-export.md`. Backlog #39, narrowed per the
scope decision.

One line: a panel's output as text from the durable log (stripped, scrubbed, count reported)
and the canvas as a PNG from main's `capturePage`, each through a save dialog, with the arms
and the scrubbing plain-node tested.

## What landed

- `ScrollbackLog.readAll`; `main/export.ts` (`createExporters`, `INERT_EXPORTERS`);
  `shared/export.ts` result types (five arms for text, three for the picture).
- `export:panel-text` / `export:canvas-png` through contract, preload, handler (trailing
  parameter, inert default), `index.ts` (save dialog into Downloads, `capturePage().toPNG()`).
- Palette: `Export panel output…` (reasons: no focus, not a terminal, scrollback off) and
  `Export canvas as PNG…`.
- Checks: `verify:file export.1–4`, `verify:palette export.1`, `verify:panels export.1` (red
  first on the inert exporters), `verify:ipc` 65.

## Snags

- The first fixture for the panels check looked for a `tier` field the session hook does not
  expose; it now spawns its own login shell at the camera centre and focuses that.

## Not proven

- The real save dialog and the Finder reveal: manual-only, like every native dialog here.
- A PNG of a canvas wider than the window is the window: region capture is out of scope.
