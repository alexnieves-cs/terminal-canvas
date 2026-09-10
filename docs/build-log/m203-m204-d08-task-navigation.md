# M203–M204 — D08 navigate tasks spatially

The [D08 guide](../product-development-guide-2026-09-08.md#d08--navigate-tasks-spatially),
[M203 spec](../superpowers/specs/2026-09-10-m203-show-this-task.md) and
[M204 spec](../superpowers/specs/2026-09-10-m204-show-related-and-arrange.md) define this close.
Built in its own worktree (`d08-task-navigation`), from `main` at `2cb0e79`.

## What the phase found

Nothing in the application knew which panels a task was. The only framing verbs were `Zoom to
fit` over the selection and `Frame all`; the only relations a card held were `item.panelId` (its
conversation) and `item.worktreeId` (its lane's record). Every other fact that ties a panel to a
task already had an authority — the worktree record's `path`, a review's `subject.workItemId`
(M201), a person's `PanelLink`, a run's `panelIds` (M79), a file's path, a preview's bound root
(M195), a process's cwd — and none of them was ever read together.

## What shipped

**`renderer/canvas/task-members.ts`** is the one pure derivation. A panel is a member for exactly
one reason, first match wins, and the reason travels with it: `card`, `conversation`,
`lane-origin`, `review`, `in-lane`, `linked`, `same-run`. **Position is never a reason**; links are
**one hop**; a named member that is not on the canvas is **missing**, never dropped. No field was
added to the layout: every fact already had an authority, and the guide's "persist only explicit
membership that lacks an existing authority" found nothing lacking one.

Three verbs, each with four doors (`V9_DOORS`, `closure.v9.1`):

| Verb | canvas | palette | agent / workflow |
|---|---|---|---|
| `show-task` | `Show` on a work card; the `⋯` menu of any member | `task.show` | `show-task wk1` |
| `show-related` | the `⋯` menu of any member | `task.related` | `show-related wk1` |
| `arrange-task` | the `⋯` menu of any member; `Arrange` on the lens bar | `task.arrange` | `arrange-task wk1` |

- **Show this task** frames the members through `useViewport.frameRects` — `jump`, not `flyTo`, so
  the move is on the camera TRAIL and Cmd+[ returns. It selects, focuses, wakes and moves nothing.
  From a panel in two tasks it refuses and names both.
- **Show related** is a view state (`relatedItemId`, never persisted — M106's flip is the
  precedent). Members wear an iris outline; every other panel wears a veil. Both ride
  `PanelMarksContext`, the one context every kind's frame reads, as `data-task-lens`. A lens bar
  names the task, counts it, says what is missing, and offers Frame / Arrange / Stop.
- **The far view** — a work card's summary tier now carries the task overview in `PanelFrame`'s
  `far` slot (the chat's pending question is its sibling): the execution word, the question it waits
  on, the readiness word, and `N files changed`. A zero is never stated.
- **Arrange this task** is `tidyPanels` (M50) over the task, as one history entry, sliding the
  block clear of every panel outside the task, then framing the result through the trail.

## Decisions recorded rather than assumed

- **Escape does not end the lens.** Escape belongs to the focused terminal; a canvas that read it
  first is the paste defect CLAUDE.md documents. Stop is on the bar, and the verb toggles.
- **A panel in no task shows no `⋯` task section.** There is no task to act on, and an empty
  heading on every menu of the canvas is noise; the verbs refuse by name from every other door.
- **Pins move; locks, maximised panels and folded groups do not.** A pin is "keep this live"
  (M92), not a place. A collapsed group was folded on purpose and its members are obstacles.
- **A dispatched card is a follower.** Its rect is derived from its conversation every render
  (M114) and is never written; Arrange packs card and conversation as one box, writes only the
  conversation, and one undo restores both.
- **The card's `Show` is enabled in the merged view**, where every other card verb refuses: it
  reads the displayed rects and writes no geometry. Arrange refuses there by name.

## Five real defects only the real renderer found

1. **A dormant terminal was dropped from its task.** A restored terminal has no live cwd and no
   registry session; `cwdOf` read the registry and got nothing. It reads the panel's own spec now.
2. **A task's lane depended on ⌘K having been opened.** Membership read the palette's
   `worktreeRows`, which loads on palette open — the trap M202's `reviewTaskLane` already names. The
   first green run of `task.show.1` was green BECAUSE the next defect had opened the palette.
3. **A successful Show opened the palette** (`say()` opens it) over the task it had just framed,
   and the open palette swallowed Cmd+[. Surfaces now speak only on a refusal or a missing member.
4. **The lens's first dim was a fractional opacity**, which `verify:styles` 3 forbids (it
   compounds against muted tokens and hides from a colour audit). It is `--lens-veil`, a declared
   token in both theme blocks, on a pointer-transparent `::after`.
5. **Arrange answered `arranged 2 panels` and moved nothing.** It called `commitHistory` alone,
   which only pushes an undo entry — `history` is separate state this component never reads. The
   camera even framed where the panels would have gone. The file's protocol is to move through
   `setPanels` and push the entry from inside its updater, as `tidyPanels` does. Two runs of
   `task.arrange.1` read the layout store and saw nothing move; reading the rendered rects (the way
   `tidy.1` reads a tidy) and then the code found the cause.

All five are in `docs/load-bearing.md`.

**Found, not fixed — older than D08.** The agent door's `tidy` executor arm
(`usePaletteActions.ts`, the `case 'tidy':` block, M149) commits the same way — `commitHistory`
alone — so by the same reading it answers `ran` and moves nothing. It is outside this phase's scope
and is recorded here and in `docs/load-bearing.md` rather than changed silently.

## The critic round

A fresh-context critic read the uncommitted diff against the guide. Disposition:

| # | Finding | Disposition |
|---|---|---|
| 1 | Arrange can slide the task off screen, silently | **Fixed** — the camera frames the result through the trail |
| 2 | The lens rebuilt the frozen marks context every drag frame | **Fixed** — `lensMap` is keyed on a member signature string |
| 3 | Verify line mostly unchecked (merged, collapsed, keyboard) | **Fixed in part** — merged refusal in `task.arrange.1`; folded members fixed (`arrange.4`); the rest recorded below |
| 4 | Card `Show` dead from the keyboard (`press` binds mousedown only) | **Fixed** — `shellControl`. The card's OTHER verbs still use `press`; older than D08, recorded |
| 5 | Lens bar acted through a proxy panel that could be in two tasks | **Fixed** — `frameItem` / `arrangeItem` by item id |
| 6 | Lane-origin "missing" depended on ⌘K, and `''` reported a gone panel | **Fixed** — `laneOf` carries the record's `panelId`; the origin is optional (`arrange.4`) |
| 7 | Lens memo may lag a late lane load or a `cd` | **Recorded** — it corrects on the next panel or board change |
| 8 | Disabled controls with no named reason on an empty lens | **Fixed** — enabled; each refuses by name |
| 9 | Checks passing for the wrong reason | **Fixed in part** — the follower path now runs for real; the spec says "screen box", not "grid"; `task.show.1` does not assert where the adjacent panel lands |

## Evidence

Red-first: `task.members.1–.5` and `task.show.target.1` watched failing against a throwing stub
(6/13, every older check still running); `arrange.1–.3` watched failing against the absent
`arrangePlan` (12/15). `task.show.1` was written before its three defects were found and went red
three times for three different reasons, each fixed at the cause.

`verify:panels:product`'s watchdog re-measured: 167.5 s wall green with the four new checks, 88 %
of the old 190000 — two points under `headroom.1`'s line — so re-pinned to 230000.

`browser.1` failed in two of three `verify:panels:product` runs this phase and passed in one, each
time with `live: false` — the guest never loaded its loopback page. D08 touches no browser code.
Recorded as a flake, not dispositioned as fixed.

**Final gate: `npm run verify` exit 1 — 38/39 suites, 546.0 s.** Every suite but one printed its
tally and passed, including `verify:panels:product` with all four D08 checks (`task.show.1`,
`task.related.1`, `task.far.1`, `task.arrange.1`) and every plain-node suite D08 touched
(`verify:groups` 16/16, `verify:verbs` 23/23, `verify:palette` 148/148, `verify:styles` 60/60,
`verify:meta` 40/40). **The one red suite is `verify:panels:shell`**, checks 166/167 (the inspector's
token total never painted within its 10 s wait). It is NOT recorded as green, and it was not
dismissed by assertion — it was measured:

| Run | `verify:panels:shell` |
|---|---|
| the gate, with D08 | 166, 167 failed |
| alone, with D08 | 166, 167 **passed**; 127, 157, 158 failed; the 96 s watchdog fired |
| alone, the BASELINE `2cb0e79` (no D08 at all), in a throwaway worktree | 98, 98b, 106, **127, 157, 158** failed — 90/96 |

The baseline fails the same checks with none of this phase's code in it, and a different set fails
each run. The machine's load average was **17.6** during the standalone run (system indexers —
`mobileassetd`, `mds`, Finder — not this project) and 7.9 during the baseline's. That is the pacing
failure the verify-velocity pass recorded on `main` (`918ee95c`): the panels parts wait on fixed
300 ms `settle()` windows, which a loaded machine outruns. **D08 did not cause it and did not fix
it**; the gate owes a clean run on an idle machine before this phase is merged.

**`verify:visual`: exit 0, 62/62 — all 60 scenes match their goldens.** The card's new `Show`
verb changed no scene (the one work card in the scenes, `card12`, is at scale 1 with its verbs at
rest), so no golden was regenerated and none needed a critic's sentence. **`verify:packaged`:
exit 0, 12/12.**

## Owed by hand

- A person driving the lens on a canvas of thirty panels at far zoom: whether the veil reads as
  "stepped back" or as "disabled".
- The xterm GRID of a lit terminal is not compared by any check — only its screen box.
- Opening the `⋯` menu of a DORMANT terminal wakes it (the chrome press selects the panel, since
  M106). Not D08's, and observed while writing `task.related.1`.
- Keyboard-only reach for the card's verbs other than `Show`.
- Every hand check owed by earlier phases is still owed.
