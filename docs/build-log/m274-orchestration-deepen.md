# M274 — Orchestration deepen (O1–O4)

Approved 2026-09-15 as an orchestration-only follow-on to Waves 1–4.
**O5 (external Agent Orchestrator / AO integration) is held** and is not
claimed here.

Wave 2 (M271) already overlapped O1–O2. This milestone finishes those
items and adds O3–O4 on the same HUD — still a tail + jump, still no
live xterm in the overlay, still no Three.js, still no fake CI/Steward
branding. Secrets leave through `outward()`.

## What landed

### O1 (finish)
- Selection command bar still emits only real verbs; multi-select
  Interrupt/Jump only when every selected row can run them.
- Empty arms stay in `empty-states.ts` with Show Canvas; none say Connect.
- Greeting still omits placeholder names (`Good evening.`, never
  `Good evening, there.`).
- Roster keyboard: ArrowUp/Down, Enter, Escape. `orchKeysShouldHandle`
  returns false for `.xterm` / contenteditable so a focused terminal
  keeps its keys. Buttons still use `shellControl`.
- Orchestration golden/shot scene remains from M271.

### O2 (finish)
- Travelling current on `.orch__edge` only inside `ORCH_EDGE_FIRE_MS` of
  a real agent transition, not because endpoints are live. Same
  `edge-current` language as M267; reduced motion reports without travel.
- Pipeline stage `data-orch-stage-shift` when the focused task's board
  state actually changes.
- Cube `--live` / `--needs` still from real agent tone.
- Canvas stays mounted behind Orchestrate (M272).
- New needs-you roster rows carry `data-attention-new` until select/ack.

### O3
- Task-centric frame from D08 member ids Canvas already computes.
- Blocker strip: one factual line (waiting on you / reviewable / running
  / queued), never invented.
- Live = working panels + recent window; Historical = durable session
  activity; Logs = recorded tail, not a live terminal; Files stay
  path-real.
- Metric cards are one shared lens (roster + graph + activity).
- Optional multi-select on the filtered pool.

### O4
- Synthetic hub title is **No supervisor yet**, never a fake Orchestrator
  persona. A real supervisor/orchestrator chat still takes the hub.
- Machine readout: `no sample yet` until a sample exists; stale samples
  keep their last reading and name their age.
- `verify:orchestration` pins `outward()` on the HUD chat/scrollback
  readers (`orch.gate.1`).
- Density: greeting/metrics at rest, commands/blocker contextual, logs
  and system as detail. No global restyle.

## Held
O5 / AO. Wave 5 (provenance, portable workflows, annotations, focus-mode,
multiplayer) remains out of scope from the CoS plan.
