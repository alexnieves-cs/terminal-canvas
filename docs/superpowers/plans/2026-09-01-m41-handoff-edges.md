# M41 — Handoff edges: implementation plan

Spec: `../specs/2026-09-01-m41-handoff-edges-design.md`. Six tasks,
check-first.

## Task 1 — The format (`verify:layout`)

Checks `handoff.1–.3` per the spec. RED. Then the automation union on
`PanelLink` (`shared/layout-schema.ts`), `parseWorkspace`'s per-link
validation extended to the second kind (a malformed `trigger` drops the
automation, keeps the link), and the cycle rule widened to "any ENABLED
automation of either kind" — a handoff cycle on `idle` is an infinite
ping-pong.

## Task 2 — The mutator (`verify:viewport`)

Check `handoff.1`: `setLinkAutomation(panels, from, to, next)` cycles
off → `{handoff, exit}` → `{handoff, idle}` → off, refuses a sessionless
endpoint, refuses a cycle, and replaces a restart-on-exit rule rather than
stacking a second. RED. Then `panels.ts`; `setRestartOnExit` becomes a
thin call into it.

## Task 3 — The inspector rows (`verify:rail`)

Check `handoff.1`: the automation list names the trigger and the bound
(`handoff on exit · last 200 lines`), and the link row's control label
states the next state. RED. Then `inspector-fields.ts`/`Inspector.tsx`:
the `↻` control becomes a three-state cycle for handoff beside the
existing restart toggle.

## Task 4 — Delivery (`verify:panels`)

Checks `handoff.1`/`.2` per the spec. RED. Then `Canvas.tsx`: a
`useHandoff` hook (M28's shape — one `Deps` object, destructured on entry)
subscribing to `registry.onExit` and to the agent-state store's busy→idle
transitions; a per-target queue in a ref; `deliver(target)` when the target
is running and past `starting`; `scrollback:tail(source, 200)` as the
payload, wrapped with one header line, through `handle.paste`; results
into the existing `automationResult` map with the spec's sentences.

## Task 5 — The wake and the timeout

Inside Task 4's hook: a dormant/never-spawned target is `registry.wake`d
and the payload queued; an exited target is `restartWithSpec`'d; a queue
entry older than `HANDOFF_QUEUE_MS` is dropped with its sentence.
`handoff.2` is the check.

## Task 6 — Close

`docs/load-bearing.md` (the overrule of M25's no-wake rule for this kind,
the paste-never-write rule reached a fourth time, the queue is never
persisted); README bullet; backlog #24 → gone (its last open halves are
recorded as decisions in the spec); suite counts; build log; `npm run
verify`; merge.
