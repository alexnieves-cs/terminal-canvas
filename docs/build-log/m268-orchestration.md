# M268 — Orchestration center view

## Intent

A second center **page** beside the canvas: an interactive HUD inspired by
agentic-dashboard references, wired to real agent / board / watcher / workflow /
machine data. The canvas stays mounted when Orchestration is showing so PTYs and
agents keep running.

## What landed

- `shell.centerView`: `'canvas' | 'orchestration'` in `settings-schema.ts`,
  read/written through `useShellChrome` (`centerView` / `setCenterView`).
  Orchestration auto-hides the rail and inspector without rewriting their prefs.
- Dock **Orchestrate** entry (Work group) + TopBar **Canvas | Orchestrate**
  segmented control + palette rows `Show Orchestration` / `Show Canvas`.
- `src/renderer/orchestration/` — pure `orchestration-model.ts`, activity ring
  `orchestration-activity.ts`, and `OrchestrationView.tsx` (roster, SVG graph,
  task card, sparklines, activity / terminal / workflows tabs).
- Jump from any entity returns to the canvas and uses existing `goToPanel` /
  `goToWorkItem`.
- `verify:orchestration` — model counts, graph hub, activity truncate, settings pin.
- `setCenterView` listed in `EXCLUDED_ACTIONS` (view swap, like `toggleMerged`).

## Verification

- `npm run verify:orchestration` 10/10
- `npm run build` green
- `verify:styles`, `verify:verbs`, `verify:rail` (state.2), `verify:palette`, `verify:meta` (milestones.1) green
- `verify:panels:shell` 98/99 — check 106 (inspector review mint) failed once at 88% headroom; unrelated to center-view wiring (default `centerView` is canvas)

## Not in this milestone

- Three.js / chart libraries (product no-styling-dependency rule).
- Fake CI/deploy pipelines.
- Unmounting or relocating panel trees.
