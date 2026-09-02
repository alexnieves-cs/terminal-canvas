# M49 — Panel typography

**Status:** designed 2026-09-02. Backlog #36; the scope decision's §4 row for
this milestone (numbered M44 there, M49 in §7's table).

## What this milestone is for

The terminal's font size is 13px, once, in `create-terminal.ts`. The most
requested setting in the history of terminal emulators, and in this app not
a cosmetic one: a font size change changes `cols`/`rows`, which is a
`pty:resize`, which is a SIGWINCH, which is a full-screen agent TUI
repainting its frame. It is a resize wearing a hat, and it is governed by
the resize handle's rule — commit, never live.

## Decisions

1. **A global setting and a per-panel override, global as the fallback.**
   `terminal.fontSize` (number, 9–24, default 13, a new `Terminal`
   category) is the schema's setting; a terminal panel may carry
   `fontSize?: number`, an optional persisted field exactly as `title` is
   — absent stays absent through every copy site, present-but-out-of-range
   is dropped with a warning. The effective size is `panel.fontSize ??
   global`.
2. **Through M44's fan-out, resolved in the registry.** The registry holds
   the global size and the override map (`setFontSizes({ global,
   overrides })`); it configures every session's terminal — live and
   detached — with its EFFECTIVE size, a session created later inherits
   its own at creation (no first-fit-then-refit), and each live session is
   refitted ONCE per commit, which sends at most one `pty:resize` (the
   SIGWINCH economy `refit` already practises). Theme and screen-reader
   mode keep using `applyTerminalOptions`.
3. **Committed on each press, no live control.** The palette carries three
   rows on the focused terminal panel — `Font: larger`, `Font: smaller`,
   `Font: default` — each a commit, disabled with `REASON_NO_FOCUS` on
   nothing and with a named reason on a sessionless kind; the global size is
   the ordinary number setting's row. No slider: a slider that refits on
   every tick is sixty full repaints a second.
4. **Zoom is not font size.** The camera's `scale()` is invisible to
   `getComputedStyle` and the fit; zooming cannot change a grid, and nothing
   here reaches for the camera. Written beside the fan-out.
5. **The pointer corrector reads live metrics.** `cellSize()` derives from
   the rendered screen on every call and caches nothing; the check that
   would catch a cache is `__m4aCellToScreen` after a size change.
6. **The context pane shows it.** A `font size` Detail field: `13 (default)`
   or `16`.

## Verification

- `verify:layout` `type.1`: the setting's bounds; a persisted override
  parses, absent stays absent, out-of-range is dropped with a warning.
- `verify:viewport` `type.1`: `toPanels`/`fromPanels` carry the override and
  keep absence absent (the sixth field-by-field copy site).
- `verify:registry` `type.1`: the global size reaches sessions without an
  override, an override survives a global change, a later session inherits
  its effective size at creation, and each live session is refitted once
  per commit.
- `verify:palette` `type.1`: the three rows on a focused terminal, their
  disabled reasons otherwise.
- `verify:rail` `type.1`: the Detail field.
- `verify:panels` `type.1`: setting the global size through the setting
  grows a live terminal's cell and a real click on a marker cell still
  reaches xterm — the corrector read the new metrics; `type.2`: a per-panel
  override persists across a reload and wins over the global.
