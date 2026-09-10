# M203 — Show this task (D08, first half)

## Problem

A task on this canvas is a work card, a lane conversation, a worktree, the reviews opened for it,
the terminals and files working inside its lane, and whatever a person linked to it. Nothing in the
application knows that set. To see a task a person hunts: finds the card, remembers which chat was
dispatched to, pans to it, and guesses which terminals were in the lane. At HEAD the only framing
verbs are `Zoom to fit` over the SELECTION and `Frame all` (`useViewport.ts`'s `fitSelection` and
`fitAll`), and the only relation a card holds is `item.panelId` (the lane chat) and
`item.worktreeId` (the lane's record) — read in `Canvas.tsx`'s `reviewTaskLane`, M202.

## Evidence (read at HEAD `2cb0e79`)

- `work-items.ts` — `PersistedWorkItem.panelId` (the lane chat, KEPT after the chat closes) and
  `worktreeId` (the lane's record).
- `layout-schema.ts` `WorktreeRecord` — `path` (the lane directory) and `panelId` (the panel that
  spawned it); the record outlives its panel (M37).
- `review.ts` `ReviewSubject.workItemId` — M201's provenance on a review opened from a task.
- `panels.ts` `PanelLink` — a person's explicit link; `PersistedRun.panelIds` (runs.ts) — the
  panels one execution of a subgraph ran together.
- `FileSource.path`, `BrowserPanel.preview.root` (M195), and a process panel's live cwd
  (`live-session-store.ts`) or spec cwd — the directory facts D04 already resolves with
  `insideDirectory`.
- `useViewport.ts` — `fitSelection` is `flyTo` and pushes NOTHING onto the camera trail, while
  `jump` (Cmd+1, bookmarks) does. A "show me" that left no way back would be a camera move the
  person cannot undo.

## Intended experience

On a work card, `Show` flies the camera to frame the task: the card, its conversation and every
panel explicitly associated with it. Camera Back returns to where the person was. Nothing moves,
nothing is selected on their behalf, nothing is woken or stopped. If part of the task is gone — the
conversation was closed, the panel that spawned the lane was removed — the verb says so in one
sentence rather than framing a smaller set as though it were the whole.

From any OTHER panel the same verb answers "which task is this part of?": a member of one task
shows that task; a member of two refuses and names both, because picking one silently is a guess;
a panel in no task refuses by name.

## Membership — derived, never inferred

`renderer/canvas/task-members.ts` is one pure function. A panel is a member for exactly one of
these reasons, first match wins, and the reason travels with it:

| Reason | Fact |
|---|---|
| `card` | a work panel whose `work.itemId` is the item |
| `conversation` | `item.panelId` |
| `lane-origin` | the worktree record's `panelId`, when it is a different panel |
| `review` | a review panel whose `subject.workItemId` is the item |
| `in-lane` | a process panel whose cwd, a file panel whose path, or a preview whose bound root lies inside the lane's `path` (`insideDirectory`, M196 — reused, not re-written) |
| `linked` | a panel with a link to or from the card or the conversation — ONE hop |
| `same-run` | a panel in a recorded run that contains the conversation or the lane origin |

**Position is never a reason.** A panel touching the card is not in the task unless a fact above
says so. Links are one hop because a transitive closure over a person's links turns one task into
the whole canvas the first time anyone links two tasks' notes together. A named member that is not
on the canvas lands in `missing` with its reason, never in `members`.

## State ownership and IPC

No new persisted field, no new IPC channel, no new privileged operation. Membership is derived at
press time from refs the canvas already holds (panels, work items, worktree rows, runs, live cwds).
The camera move goes through `jump`, the one camera door that records the trail — a new
`useViewport` member `frameRects`, so `fitSelection` keeps its M146 meaning.

## The verb and its four doors

`show-task <panel>` — non-destructive, a camera move.

| Door | |
|---|---|
| canvas | `Show` on a work card |
| palette | `task.show` (the selected panel) |
| agent | `tc plan show-task wk1` |
| workflow | an action node whose line is `show-task wk1` |

Not on `TEAMMATE_REFUSED_VERBS`: `focus` moves the camera too and is allowed; this starts no
session and changes no setting.

## Risks

- **Merged view.** Its rects are synthetic, but framing reads the DISPLAYED rects
  (`displayPanelsRef`) and writes no geometry, so the read-only rule holds.
- **An anchored card** has a derived rect (M114); framing reads displayed rects for that reason too.
- **A dead door by focus** (M195): the card's `Show` is a `shellControl` button pressed in two
  tasks by the real-renderer check.

## Acceptance criteria

1. `task.members.*` (`verify:groups`): every reason above lands with its reason; an adjacent,
   unrelated panel is excluded; a missing conversation is `missing`, not a member; links are one
   hop; a sibling directory (`/lane-2` beside `/lane`) is not inside the lane; a panel linked to two
   cards is in both tasks.
2. `task.show.target.1` (`verify:groups`): the verb's pure decision — card, sole member, member of
   two (refused naming both), member of none (refused), a card whose item left the board (refused).
3. `closure.v9.1`, `closure.1`, `executor.1` (`verify:verbs`): the four doors, the member, the arm.
4. `task.show.1` (`verify:panels:product`): a real card's `Show`, pressed in two tasks, frames the
   card, its conversation and an in-lane terminal while an adjacent unrelated panel falls outside
   the frame or is irrelevant to it; Camera Back returns to the prior camera; no panel's rect
   changed and no PTY exited.
5. `npm run verify` green.
