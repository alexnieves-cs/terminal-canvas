# M204 — Show related, the far view's task overview, and Arrange this task (D08, second half)

## Problem

M203 frames a task. A framed task on a busy canvas is still a crowd: the related panels sit among
unrelated ones and nothing says which is which. At far zoom a work card shows its title and its
board word and nothing about whether the work is blocked, reviewable or what it produced — the
summary tier (`PanelFrame`'s `farBody`, M69) gives every sessionless kind a `far` slot, and only the
chat fills it. And a task whose panels drifted across the canvas has no way back to a compact shape
short of dragging each one.

## Intended experience

**Show related** turns a lens on: every panel of the task keeps full presence and wears a thin iris
ring; every other panel dims. Nothing moves, nothing is selected, nothing is carded, woken or
stopped — the lens is paint. A banner names the task, the count, and anything missing, and offers
`Frame`, `Arrange` and `Stop`. The same verb on the same task turns it off; switching workspace or
removing the task from the board clears it. Escape is deliberately NOT bound: Escape belongs to
the focused terminal, and an agent reading an Escape the canvas meant for itself is the paste
defect CLAUDE.md already documents.

**At far zoom** a work card's summary shows, under its title and board word: what the runtime is
doing (M200's execution word), the pending question when there is one (M199's blocker), whether
there is something to review (M202's handoff word), and the key evidence — how many files the lane
changed. Never a transcript.

**Arrange this task** compacts the task's panels in reading order with `tidyPanels` (M50), as ONE
undo step. Locked members stay where they are; a dispatched card keeps its place beside its
conversation (M114's anchor is not rewritten); and the arrangement never lands on a panel outside
the task — the block slides clear of anything it would cover. Pins are kept: a pin is "keep this
live" (M92), not a place, so a pinned member moves and stays live. Maximised members and the members of a COLLAPSED group stay where they are, as obstacles; and the camera follows the arrangement through the trail, because the block can slide clear of a band of panels and land out of view.

## Doors

| Verb | canvas | palette | agent | workflow |
|---|---|---|---|---|
| `show-related <panel>` | the `⋯` menu's task section, on any member | `task.related` | `tc plan show-related wk1` | `show-related wk1` |
| `arrange-task <panel>` | the `⋯` menu's task section, and the lens banner's `Arrange` | `task.arrange` | `tc plan arrange-task wk1` | `arrange-task wk1` |

M203's `show-task` gains the `⋯` door on every member too: the contextual action on the selected
object that D08's IA asks for. The `⋯` menu's task section appears only on a panel that belongs to
exactly one task; a member of two says so and names both rather than choosing.

`arrange-task` is non-destructive (one undo) and, like `tidy`, not refused for a teammate. It is
refused in the merged view: that view's geometry is not this canvas's to write.

## State ownership and IPC

- The lens is a VIEW state in `Canvas.tsx` (`relatedItemId`), never persisted, like M106's flip.
  Its member map is derived with `taskMembership` from the displayed panels, the board, the
  worktree rows and the runs, and reaches every frame through `PanelMarksContext` — the one context
  every kind already reads — so a terminal, a chat and a card dim on one rule.
- Arrange writes panel rects through `commitHistory`; nothing else.
- No IPC change, no persisted field.

## Risks

- **A chromeless terminal is the one kind that resizes on hover if its box collapses (M234).** The
  lens is a token-painted veil (`::after`, `--lens-veil` — never a fractional opacity, `verify:styles` 3) and an `outline` on `.panel` — neither affects layout — and the real-renderer
  check compares every panel's SCREEN BOX before and after — not the xterm grid, which no check reads (recorded in the build log).
- **An anchored card's rect is derived.** Arrange treats a card and its conversation as ONE box and
  moves only the conversation, so the card follows through its unchanged anchor.

## Acceptance criteria

1. `arrange.1–.3` (`verify:groups`): compaction keeps reading order; no moved rect or follower
   overlaps a non-member or a locked member; a follower keeps its offset to its leader; a task with
   nothing movable is refused by name.
2. `closure.v9.1`, `closure.1`, `executor.1` (`verify:verbs`).
3. `task.related.1` (`verify:panels:product`): the lens dims the unrelated panels and rings the
   members; no rect, screen box or session changes; the same verb turns it off. `task.far.1`: at far zoom the
   card shows the task overview. `task.arrange.1`: Arrange moves the task's panels clear of an
   unrelated one, leaves a locked member in place, and one undo restores every rect.
4. `npm run verify` green; `verify:visual` inspected, any changed golden carries a critic's sentence.
