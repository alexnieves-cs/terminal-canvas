# M25 — Functional panel links

## Decision

M25 adds one functional link action: **restart the destination terminal when
the source terminal exits**. It is stored as `automation` on the existing
directed `PanelLink`; there can be one action per source/destination pair, so
the relation is its natural durable owner.

The Inspector is the control and audit surface. Its outgoing link row enables
or disables the action, and its Automations list names the source, destination,
enabled state and the most recent result. A canvas line is never the only place
that says a PTY may be affected.

## Safety contract

- Both endpoints must be terminal panels.
- A cycle is refused when enabling a rule and removed when parsing a hand-edited
  file. A finite chain may cascade; a restart-generated exit is an exit and
  therefore follows the same declared rules.
- A target that is absent, dormant or never started is skipped and reported;
  an automation never wakes a target or spawns a new agent.
- The registry records the source exit before Canvas observes it. This keeps the
  automation, rail and Inspector status in one order rather than creating a
  second raw IPC listener that can race the rendered state.
- The action remains undoable and persistent because it belongs to `PanelLink`,
  which already rides `History<Panel[]>`. Payload-bearing or multiple actions
  per pair would require a first-class automation collection and that history
  refactor.

## Explicit non-goal

Output-to-input piping is not implemented. It carries arbitrary terminal bytes
and therefore needs a separate payload, confirmation and audit design rather
than sharing this narrow restart action.

## Verification

`verify:viewport` covers terminal-only eligibility, metadata preservation,
disablement and cycle refusal. `verify:layout` proves durable parsing removes a
hand-edited cycle, and `verify:rail` proves Inspector signatures move when an
automation changes.
