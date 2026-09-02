# M49 — Panel typography: implementation plan

Spec: `../specs/2026-09-01-m49-panel-typography-design.md`. Four tasks.

## Task 1 — The pure checks, RED

`verify:layout type.1`, `verify:viewport type.1`, `verify:registry type.1`
(the fake handle records `refit`), `verify:palette type.1`, `verify:rail
type.1`, and `verify:panels type.1/.2` written; the five plain-node suites
watched red.

## Task 2 — Schema, persistence, registry

`terminal.fontSize` in a `Terminal` category; `fontSize?` on the terminal
panel and its persisted form, through `parsePanel`, `toPanels`, `fromPanels`
(absent stays absent); `registry.setFontSizes` resolving global + overrides
into per-session `configure`, applied at `ensure()` for later sessions, one
`refit` per live session per commit.

## Task 3 — The surfaces

Three palette rows through a new `setPanelFontSize` action; the Detail
field; Canvas reads the setting the way glow does and feeds the registry
with the panels' overrides.

## Task 4 — Close

`docs/load-bearing.md` (a resize wearing a hat; zoom is not font size; the
override is the sixth copy site); backlog #36 → done; README's settings
line; suite counts; build log; `npm run verify`; merge.
