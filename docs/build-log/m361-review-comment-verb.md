# M361 — `review-comment`: four doors, and an agent's door proposes

**Verdict: shipped.** Arc 2, cross-agent review, second half. M360 made an agent's review
comment a proposal the person keeps or discards. Nothing could write one: a review comment
had one door, the `+` beside a diff line, which is a person's gesture.

`review-comment <panel> <path:line> <comment>` is the verb, with all four doors:
- **canvas**: the `+` beside each numbered line of a review's diff;
- **palette**: `Comment on a review line…`;
- **agent**: `tc plan review-comment wk1 src/server.ts:12 the 429 path has no test`;
- **workflow**: an action node, `review-comment wk1 src/server.ts:12 …`.

A person's door writes the person's comment. An agent's or a workflow's door
(`origin: 'door'`, M248) writes a PROPOSAL attributed to the calling panel's title, or to
"a workflow". The Review swarm's review seat is now told to put each objection on its
line this way. So an agent reviewer's findings reach the person on the lines they are
about, where they can be kept into the follow-up or discarded.

## What landed

- **`parseCommentPlace`** (`shared/review-comments.ts`): `path:line` (a new-file line) or
  `path:line:old` (a removed line). A path may hold colons, since the last `:<number>` is
  the line.
- **`newReviewComment`**: the one builder for a new comment. It mints the id, cuts the
  body, and adds the attribution for a door.
- **The verb**:
  - `VERBS` and `V9_DOORS` rows (`shared/verb-table.ts`);
  - `PaletteActions.reviewComment` and the `review.comment` row, which opens the verb
    line (`palette/commands.ts`);
  - a slice of its own (`canvas/palette-actions/review-comment.ts`);
  - the executor arm, which passes the step's origin and caller.
- **`BoardVerbs.addReviewComment`** (`useBoardVerbs.ts`, installed in `Canvas.tsx`). It
  resolves the task from the panel: a review's own subject, else the ONE task the panel
  belongs to (`taskOfPanel`'s rule). It appends through the same work-item record the
  gesture writes.
- **The review seat's brief** (`shared/swarm.ts`): "Put each objection on its line with
  `tc plan review-comment $TC_PANEL_ID <path>:<line> <what is wrong>` … it reaches the
  person as a proposed comment they keep or discard."

## Decisions, and why

- **WHO asked decides what is written**, as in `cap-agent` (M352). One verb function
  serves every door, so the grammar and the task resolution cannot disagree between
  them. Only the attribution differs.
- **A full list refuses; it never evicts.** `parseReviewComments` keeps the last 100. An
  agent appending past that would silently push the person's oldest comments out, so at
  100 the verb refuses by name.
- **The review seat names its own panel** (`$TC_PANEL_ID`, M102). A seat is a member of
  exactly one task, and `taskOfPanel` resolves it. It never has to know the card's id.
- **No quote from a door.** The verb does not read the diff, so a door's comment has an
  empty quote and no revision identity. The follow-up then names its place without
  quoting it. The canvas gesture, which has the line in hand, still quotes. Reading the
  lane's diff at the verb, to quote and stamp it, is owed.

## Checks

- `verify:verbs`: `closure.v9.1` binds the new doors (`tc plan review-comment wk1 …` and
  the node's line against the fixture), `slices.1` sees one owner for `reviewComment`,
  and `executor.1` sees its arm. 29/29.
- `verify:review review-comment.door.1`: the place grammar, the builder's attribution
  and cut, and a door's comment parsed back as a proposal.
- `verify:swarm` 39/39 and `verify:palette` 161/161.

`UPDATE_GOLDENS=1 npm run verify:visual` wrote nothing: every scene stayed inside both
budgets, so the new palette row moves no committed picture. No committed scene shows a
proposal (M360's note, owed as M362).

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 775.7s: 59/61 suites.
`verify:panels:agents` held its baseline, `template.1` and `detail.1`.
`verify:panels:product` hit its watchdog under load. It was rerun alone at a load of 37,
which hit the watchdog again with the load flake `onboarding.start.1`. At a load of 10
it was 112/120, every red the baseline (`starter.1` and the seven `workflow.*`).

`verify:verbs` 29/29 (`closure.v9.1` binds the new doors), `verify:review` with
`review-comment.door.1`, `verify:swarm` 39/39 and `verify:palette` 161/161.

## Owed

- **A door's comment carries no quote or revision.** Reading the lane's diff at the verb
  would let a door quote the line and stamp the identity, as the gesture does. It needs
  an async read of `review:across` for the lane.
- **The canvas gesture keeps its own builder** (`ReviewNode.tsx`'s `commenting`). It
  should call `newReviewComment` too, which is a small follow-up.
- **No panels check drives the verb end to end.** The pure parts and the binding are
  checked. A panels check would need a work item with a lane, which the harness's
  product part has.

Next: M365 (which agents can…, the cross-panel capability query).
