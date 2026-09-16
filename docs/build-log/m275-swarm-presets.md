# M275 — Swarm start-work presets (Explore / Implement / Test / Review)

Built 2026-09-15 on `main`, on top of M274. One milestone, no run prompt:
four reviewed arrangements that a single **Start work** opens, each with a
supervisor hub, workers with named roles, authored handoff edges with real
triggers, worktrees only where isolation is actually called for, and named
refusals everywhere else.

## The one decision the rest follows from

**The primary seat goes through `dispatchWorkItem`.** A swarm does not make a
lane; it asks M114's executor for one and then adds seats and edges around it.
So a task a swarm started is the same kind of thing as a task a solo start
made — `item.panelId`, `item.worktreeId`, the card's `dispatched` edge, the
Places gate, `ensureForPanel`, the first send, Open PR, Review the lane and
M202's readiness reader all keep working with no "but it was a swarm" arm. A
second lane-maker would have been a second author of what a task IS, and the
two would have drifted in whichever arm nobody opens.

Everything after that step is additive and cannot unmake it: a seat refused
half way disposes the sessions *that call* created and leaves the primary lane
standing, with the card's note naming the seat and the reason.

## What landed

### The arrangements (`src/shared/swarm.ts`, pure)
- **Explore** — two readers (one in the task lane, one at the repository root,
  neither writing), both handing findings into the hub. Two incoming edges is a
  JOIN (M78's `joinAdvance`): the hub advances when both have finished, which is
  the difference between a report and half a report.
- **Implement** — an implementer in the task lane and a tester **in the same
  lane**. A tester in its own worktree would test the branch point and pass
  while the change is broken: a green answer about the wrong tree.
- **Test** — a triage chat plus a `npm test` terminal in the lane, wired
  `exit-fail` and nothing else. A passing run must not wake an agent; `always`
  would spend a turn saying "it passed" on every run.
- **Review** — a `git --no-pager` terminal gathering the diff, wired `exit-ok`
  into a review chat, plus the task's own review node. `--no-pager` because a
  pager in a pty never exits, and an `exit-ok` edge would then never fire.

### Rules the presets encode
- **Place is a decision about isolation.** `own-lane` for a seat that writes
  beside another writer, `task-lane` for a seat that must see what the primary
  wrote, `root` for a seat that only reads — a second worktree for a read is a
  lie about what is happening (M104 learned the same thing from the other side).
- **Triggers are not interchangeable.** A chat has no exit code, so chat → chat
  is `idle`; a terminal has one, so `exit-fail` means literally "only when it
  failed". `verify:swarm swarm.edges.1` fails a preset that names a trigger its
  source can never fire.
- **The hub's edges are statements.** `setLinkAutomation` returns the identical
  array on a cycle — no throw, no red — so an enabled edge out of a hub its own
  workers feed would be drawn in full and wired in part. `swarm.edges.2`/`.3`
  walk the automated subgraph for a cycle.
- **The board state a swarm starts FROM is checked; the state it leaves is not
  invented.** `working` and `review` are the runtime's words (M113). Review
  refuses over a `todo` card by name — "start work on it first, then review
  it" — and nothing here writes either word.
- **An imported arrangement is inert.** `reviewed: false` is M190's template
  rule, fail-safe, and `swarmRefusal` names it *before* the CLI arm so the first
  sentence a person sees is the one they can act on.

### The seat mark
A chat persists `{ preset, role }` and nothing else; the brief lives in
`SWARM_BRIEFS` as code. Prose written into everybody's `layout.json` can never
be corrected, and a resumed session would carry last month's words with no way
to tell. `swarmSystemPrompt` rebuilds it on every spawn, and the mark goes
**first** in `ensureChatSession`'s ternary ladder — the hub is also a
`supervisor` and the primary seat is also a `dispatch`, so any later position
is unreachable for exactly the panels that need it. Recorded in
`docs/load-bearing.md`; pinned by `swarm.resume.1`, which reads the order.

### The four doors
- canvas — `Swarm…` on a work card, then one of the four rows, each disabled by
  `swarmRefusal`'s own sentence (the same function the sheet's Start reads).
- palette — `work.swarm.explore` and its three siblings, written out as literal
  `id: '…'` rows because `closure.v9.1` reads `commands.ts` as TEXT; a looped
  row is a door the door-check cannot see. `swarm.rows.1` is the other half.
- agent — `tc plan swarm wk1 ada explore`. The root is resolved the way a
  sheetless start resolves it, and `ambiguous`/`none` refuse with the sentence
  naming the choice, because a plan has no typist.
- workflow — an action node holding the same line, through the same executor.

`swarm` is on `TEAMMATE_REFUSED_VERBS` beside `dispatch`, at four times the
scale: a place-bounded teammate opening five sessions through a plan is the
fold the Places gate exists to refuse.

### The sheet
An **Arrangement** field after the repository (the seats' folders are that
repository's, so a shape chosen before it would preview worktrees of nowhere),
defaulting to **Solo** — a person who opened the sheet to start one task must
not get five agents for pressing Enter. A chosen arrangement states its seats,
its counts and its ceiling line before anything is minted, and a swarm ALWAYS
opens the sheet even when the triple is complete: M197's empty-needs fast path
exists so M114's one-gesture drop stays one gesture, and a shape that opens
five panels, two worktrees and three handoffs is not that.

## Checks

- `verify:swarm` — **39 new checks**, the suite added by being written (the
  runner derives its list from `package.json`'s `verify:*` keys).
- `verify:panels:product` `board.1` updated: the card's seventh verb. The
  assertion now names the aliases in order rather than counting them, so the
  next arrival reads as "a verb was added" and not as "a number moved".
- Green: `verify:verbs` 28/28, `verify:layout` 268/268, `verify:palette`
  149/149, `verify:meta` 50/50, `verify:styles` 75/75, `verify:first-run`
  17/17, `verify:panels:product` 118/118, plus the rest of `npm run affected`.
- **Pre-existing red, not this milestone's:** `verify:panels:agents` `detail.1`
  (confirmed identical with these changes stashed).

## Not claimed

- No pack/portable IMPORT path mints a swarm preset yet, so `reviewed: false`
  is reachable only by construction. The refusal is real and checked; the
  importer that would produce one is owed with the pack format's next pass.
- The Test arrangement's `npm test` is AUTHORED, not discovered. This app
  cannot know a repository's suite, and guessing one silently is worse than a
  command a person can read in the panel's title and change in the terminal. A
  repository with no such script exits non-zero, which fires exactly the edge
  that says a failure needs you — the honest outcome, and a visible one.
- No goldens were regenerated: the sheet's new field and the card's new verb
  change visible surfaces, so `npm run shot` + a fresh-context critic's sentence
  per changed scene is owed before `UPDATE_GOLDENS=1` writes anything.
