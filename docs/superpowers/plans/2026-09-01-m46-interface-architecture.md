# M46 — The interface architecture: implementation plan

Spec: `../specs/2026-09-01-m46-interface-architecture-design.md` (over the
"M23" spec it adopts). Six tasks, check-first, in the order of risk — the
grid first, because every inset and promotion check in `verify:panels` is
in scope and the rest is built on top of it.

## Task 1 — The grid and the dock (`verify:panels`)

Restate 73/125/156 for the new grid (`.shell` at 1440 → canvas 1132 ± 1,
a panel under the reclaimed width still promoted). RED. Then: `.shell`
becomes `dock | navigator | canvas | context` with container queries;
`Dock.tsx` (four `.icon-button`s with `aria-pressed`, `shellControl`);
`useShellChrome` gains the active navigator (persisted as
`shell.navigator`, a new enum setting through M45's `'enum'`), and the
resident/transient decision per breakpoint from the sparse map.

## Task 2 — One navigator pane (`verify:panels`)

Check: switching navigator panes spawns nothing (148's shape) and the
Attention icon carries the waiting count. RED. Then `Navigator.tsx`
rendering ONE of the existing `SideRail` sections or `FileTree` by the
active id; the Attention popover.

## Task 3 — Compact drawers (`verify:panels`)

Check: below 1100, the navigator is a drawer dismissed by outside click
AND `Escape`, and a wheel over it moves no camera (47/105's pair, a third
surface). RED. Then the drawer state composed into `shouldIgnoreKeys` and
`shouldYieldWheel` — one predicate each, never a copy.

## Task 4 — The context pane (`verify:panels`, `verify:rail`)

Checks: the identity header on screen with each of the three tabs active;
Close destructive and confirm-gated (read back from the panel list); the
Work tab current immediately after switching. RED. Then `ContextPane.tsx`
replacing `Inspector.tsx`'s body: pinned header, tabs (`shell.contextTab`,
enum, persisted), the three-rank action bar, sections regrouped by
question; `inspectorSignature` untouched and `verify:rail` 86 green.

## Task 5 — The top bar and the HUD

Zoom cluster into the HUD (`pointer-events` on that cluster only,
`shouldYieldWheel` rule for the HUD); `Merged` as an icon toggle; the
canvas-wide totals in the no-selection summary (`verify:rail` check on
`buildInspectorSummary`).

## Task 6 — Close

Every unconditionally rendered section's empty state (§8.3); README's
"What it does" and the Keyboard table (`Cmd+\` now toggles the navigator);
`docs/load-bearing.md` (never measure the window; a resident region is a
grid column; the signature stays whole); the "M23" spec's status line
updated to "built as M46/M47"; suite counts; build log; `npm run verify`;
merge.
