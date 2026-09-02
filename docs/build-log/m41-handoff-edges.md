# M41 — Handoff edges

**Status:** finished 2026-09-01.
**Branch:** `m41-handoff-edges`. **Spec:** `docs/superpowers/specs/2026-09-01-m41-handoff-edges-design.md`.

One line: the other half of backlog #24 — a link that, when its source completes, starts the
target with the source's recorded output pasted in as context.

## What landed

- `PanelLink.automation` became a union (`shared/handoff.ts`): the existing
  `restart-on-exit` plus `{ kind: 'handoff', enabled, trigger: 'exit' | 'idle' }`. One rule per
  link; a handoff replaces a restart. The parser accepts either, drops a malformed one by name,
  and the cycle rule spans both kinds.
- `setLinkAutomation` is the one mutator (`setRestartOnExit` calls into it); `nextHandoffState`
  is the inspector's three-state cycle.
- The inspector's link row gained a handoff control beside the restart toggle, its title naming
  the next state; the automation list names the trigger and the 200-line bound.
- `useHandoff` (`renderer/canvas/useHandoff.ts`) reacts to `registry.onExit` and to a new
  `onAgentTransition` fan-out (busy→idle), reads `scrollback:tail` as the payload, and pastes it.
  A dormant/exited target is woken/restarted and the payload queued until it can receive;
  `HANDOFF_QUEUE_MS` drops a stuck one. Every outcome is a sentence in the inspector.
- Checks: `verify:layout` handoff.1–.3, `verify:viewport` handoff.1, `verify:rail` handoff.1,
  `verify:panels` handoff.1 (live target) and handoff.2 (dormant off-screen target woken and
  delivered on framing).

## Snags

- The e2e checks first aborted the suite as "infrastructure": a `\r` in the `.cjs` template
  literal for `__m4aWrite` became a real carriage return, an illegal line terminator inside the
  JS string executeJavaScript received. Fixed by escaping it; a renderer-console forwarder in
  the check named it ("Uncaught SyntaxError"). The block is now wrapped so a throw fails the
  check cleanly instead of aborting the run.

## Decided against

- Piping a live stream rather than a bounded tail: the tail is the audit model #24's own
  reason for gating this on scrollback; a stream has no bound to name and no paste boundary.
