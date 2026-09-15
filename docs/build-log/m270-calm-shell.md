# M270 — Calm task-first shell (Wave 1)

## Intent

Hierarchy, not a restyle. The inspector leads with next action / blocker /
related work; inapplicable primary verbs stay mounted but hidden; far zoom
shows task/group silhouettes; the rail groups by role in the lit task.

## What landed

- `inspector-context.ts` — next / blocker / related from facts already on the
  canvas. Restart and Save-as-preset `hidden` when the kind has no process
  (still in the DOM for reach checks). Process metrics sit in a `<details>`.
- Quiet chrome: workflow verb bands and refusal lines fade at summary/block
  tiers and return on hover/focus — content wins, keyboard still reaches them.
- `task-clusters.ts` + `TaskClusterLayer` at the cluster card-detail band
  (entered below 0.12, above `MIN_SCALE` 0.1). Membership is D08's. Tone is
  the worst of the members. Ungrouped panels are not hulled.
- Rail role groups when a task lens is on (`Doing this`, `Review`, `Files in
  this`, `Watching`, `Linked`, `Elsewhere`). Kind groups remain without a
  lens; browser/memory stay Files; watcher stays with workflows as
  `Runs & watchers`. The dock Connections pane is labelled Services.

## Not in this milestone

Wave 5. No fake metrics. No global restyle.
