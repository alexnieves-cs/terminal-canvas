# M49 — Panel typography

**Status:** finished 2026-09-02.
**Branch:** `m49-typography`. **Spec:** `docs/superpowers/specs/2026-09-01-m49-panel-typography-design.md`
(written this session). **Plan:** `docs/superpowers/plans/2026-09-01-m49-panel-typography.md`.

One line: a global terminal font size and a per-panel override, committed per press through the
registry's fan-out, one refit per live session per commit — because a font size is a resize.

## What landed

- `terminal.fontSize` (number, 9–24, default 13, `Terminal` category); `fontSize?` on the
  terminal panel and its persisted form, absent stays absent through `parsePanel`, `toPanels`,
  `fromPanels` and (found on the way) rename.
- `registry.setFontSizes({ global, overrides })`: the effective size per session, seeded at
  `ensure()` for later sessions, one `refit` per live session per commit.
- Three palette rows (`panel.font.larger/smaller/default`) through `setPanelFontSize`, disabled
  with a reason on nothing or a sessionless kind; the context pane's `font size` Detail field.
- Checks: `verify:layout type.1` (fault-injected: dropping every override turns it red),
  `verify:viewport type.1`, `verify:registry type.1`, `verify:palette type.1`, `verify:rail
  type.1`, `verify:panels type.1/.2`.

## Found on the way

- **Rename dropped a panel's links.** `beginRenamePanel` rebuilt the panel from four named
  fields, so a renamed panel lost every link it held on the next save — silently, since links
  render from the panel array. Fixed for `links` and `fontSize` together; recorded in
  load-bearing as the seventh copy site.
