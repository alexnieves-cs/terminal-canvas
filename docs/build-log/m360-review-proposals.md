# M360 — cross-agent review: an agent's comment is a proposal the person keeps or discards

**Verdict: shipped (the record and its display; the doors that write it are M361).** Arc 2,
cross-agent review. M275's Review swarm gives a review seat the diff and asks it to "judge
readiness", but its verdict lived only as chat text. The one place a review's objections
are recorded is the task's review comments (M307): pinned to diff lines, quoted in the
follow-up, and holding "verified" back while open. Those comments are the PERSON's, by
design.

This milestone gives a comment an author other than the person. A comment with
`proposedBy` is an agent's **proposal**, and:
- it is not the person's open comment;
- it never rides the follow-up to the working agent;
- it never counts toward "every comment resolved";
- while unread, it holds "verified" back ("1 proposed comment from an agent not read"),
  so a second reviewer's objection is never passed silently;
- the person keeps it, which makes it theirs as written (its line, its words, its time),
  or discards it.

## What landed

- **`ReviewComment.proposedBy`** (`shared/review-comments.ts`): `{ label, panelId? }`,
  carried by name and parsed. A malformed attribution drops the whole COMMENT, never only
  the field, because dropping the field would turn an agent's words into the person's.
- **`openComments`** now counts the person's comments only. The follow-up composes from
  it. **`proposedComments`** lists the proposals. **`answerProposal(comments, id,
  keep)`** keeps or discards one.
- **`verificationOf`**: an unread proposal is a missing clause, and "every comment
  resolved" counts the person's comments.
- **`recipe-portability.ts`**: a run's open-comment count is the person's.
- **The task's review** (`review/TaskReviewPanel.tsx`) lists a proposal with a dashed
  rule, "proposed by <agent>", and `Keep` and `Discard`. Its count line reads "N open, M
  proposed, K resolved". The review node's pinned comment (`review/ReviewNode.tsx`) says
  "<agent> proposes".

## Decisions, and why

- **A proposal, not a verdict record.** Readiness already has one person-owned mark
  (`ReviewMark`) and "marking a review done has no verb, on purpose". A second record of
  an agent's verdict would compete with it. A proposal on a line is the shape a reviewer's
  objection actually has, and the person's own path (keep, then send) already turns
  objections into work.
- **Unread holds `verified` back, kept or not is the person's.** Verified is a
  conjunction this app can defend (M307). Calling a task verified while another
  reviewer's objection sits unread is not defensible. Nothing forces the person to agree:
  a discard is an answer.
- **Keep preserves the agent's words and time.** The person adopts the objection as
  written; editing it is their existing comment gesture.

## Checks

- `verify:review review-comment.proposed.1`:
  - a proposal is not open and never rides the follow-up;
  - it holds verified back with its own clause, while "every comment resolved" still
    counts the person's;
  - kept, it is the person's with its words and time; discarded, it is gone;
  - a malformed attribution (empty label, or a non-object) drops the comment.

  `verify:review` 160/160.

**No golden, and why.** A proposal is painted in the task's review (`TaskReviewPanel`),
which renders only for a task with a worktree lane (`taskContextFor`), and in a lane's
review node. The shot fixture's one working task, `wi-12`, has no lane. Giving it one
changes the shared fixture under every scene. The display is checked by `verify:styles`
(the two new rules) and by the pure builders it renders from, and the golden is owed as
M362: a fixture task with a lane, one proposal, and its critic.

## Gate

`npm run typecheck` is clean. `npm run verify:visual`: 75/76, with every committed scene
unchanged (no fixture holds a proposal) and `starter` red on purpose. The full
`npm run verify` ran in 721.3s: 59/61 suites, and every red is the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

## Owed

- **M361: the doors that write a proposal.** Built beside this milestone.
- **M362 (proposed): a golden of a proposal.** A laned task in the shot fixture, a
  proposal written through M361's `canvas:plan` door as an agent would, and the task's
  review showing it with Keep and Discard, judged by a critic.
- **The focus view's comment markers** (`FocusTask.tsx`) mark a proposal's line like any
  comment. It is a marker only, and the focus view has no list of its own.

Next: M361 (the `review-comment` verb, four doors, and the review seat's brief).
