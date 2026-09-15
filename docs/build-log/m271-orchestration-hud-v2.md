# M271 — Orchestration HUD v2 (Wave 2)

## Intent

Selection-driven verbs on the M269 glass HUD, shared empty states, a shot
scene so glass/CSS regressions are visible, denser isometric depth on live
and needs-you only. Still a tail + jump — live xterm stays on the canvas.

## What landed

- `orchCommands`: Interrupt, Jump, Mark done, Focus related, Open Files —
  only when they can run. No decorative disabled buttons.
- Pipeline stage carrying `data-orch-stage-current` when it is the focused
  task's board state (M267 travelling-current language, CSS).
- Empty arms use `EMPTY_STATES` ids (`orch-roster`, `orch-pipeline`,
  `orch-task`, …) with Show Canvas as the named next step.
- Shot scene `orchestration` + `verify:visual` golden slot.
- SVG/CSS glow and pulse on `--live` / `--needs` cubes. No Three.js.
- Greeting: empty / `there` / `user` / `guest` names become `Good evening.`
  HUD command buttons use `shellControl` so they do not steal terminal focus.
  Roster ArrowUp/Down / Enter / Escape never handle a key whose target is
  `.xterm` or contenteditable (`orchKeysShouldHandle`).

Every tail/chat reader still goes through `outward()` / `redactSecrets`.
