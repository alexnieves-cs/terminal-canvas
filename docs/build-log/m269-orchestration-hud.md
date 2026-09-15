# M269 — Orchestration HUD density and wiring

## Intent

M268 shipped the center page. This pass makes it read as a live ops HUD —
dark glass, neon-accent cubes, agent pool, pipeline stages, activity, terminal
tail, process metrics — still driven by canvas agents, board items, watchers,
workflows, PTY scrollback and `machine:sample`. No fake product branding.

## What landed

- Isometric SVG agent graph (hub + satellites). Click selects; double-click
  jumps to the canvas. Authored panel links draw as dashed amber edges on top
  of the hub-and-spoke. Wheel zooms; drag empty space pans — only inside this
  overlay. The canvas host stays mounted and hidden, so pan/zoom/PTY there are
  untouched.
- Agent pool: All / Running / Idle / Needs you, plus a name filter. Selection
  drives the selected-agent pane, activity filter, and terminal tail.
  Interrupt is the existing `agentSession.interrupt` for a selected chat that
  is in flight.
- Dev | Pipeline. Pipeline stages are the board's four words (`todo` /
  `working` / `review` / `done`); a click filters the list. Pool items from a
  live workflow appear with their real queued/started/finished states. Mark
  done is the board's own user-settable verb.
- Activity Live | Historical over the existing agent-transition ring. Click
  selects the related agent; double-click jumps.
- Terminal tab tails `scrollback:tail` for a selected terminal, or the last
  assistant text for a selected chat. Command/cwd come from the live-session
  store when tmux has published them.
- Files tab lists file panels (path rule) and workflow panels.
- System sparklines and per-panel compute bars from the real process table.
  A panel with no sample says so rather than printing a confident zero.
- `verify:orchestration` gains filter, pipeline, cube-geometry and authored-edge
  checks.

## How to try it

1. Canvas | Orchestrate in the top bar, or the dock's Orchestrate control, or
   palette `Show Orchestration`.
2. Click an agent in the pool or a cube — the selected pane, activity, and
   terminal tab follow. Double-click to land on that panel on the canvas.
3. Metric cards toggle the matching pool filter (or open Pipeline for tasks).
4. Pipeline: click a stage to filter tasks; Mark done on the current task card
   uses the board verb.
5. Terminal tab: select a terminal with a live command, wait for the tail.

## Verification

- `npm run verify:orchestration`
- `npm run verify:styles`
- `npm run verify:rail` (state.2 / labels.1)
- `npx tsc --noEmit -p tsconfig.web.json`

## Not in this milestone

- Three.js / chart libraries.
- Invented CI/deploy pipelines or Steward/NEXUS branding.
- A golden scene for this overlay (`verify:visual` is unchanged).
- Relocating live xterm into the HUD — the tail is the durable log, and jump
  still opens the real panel.
