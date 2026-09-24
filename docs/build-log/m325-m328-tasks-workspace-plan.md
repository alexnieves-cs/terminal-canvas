# M325–M328 — work that needs attention, one workspace, a readable plan, a restrained system

Four product asks, built 2026-09-24 on local `main` in one session.

| # | Ask | Milestone |
|---|---|---|
| 1 | Redesign Orchestrate around work that needs attention (highest priority) | **M325** |
| 2 | Make the task workspace (`FocusTask`) the primary place to develop | **M326** |
| 3 | Turn multi-agent arrangements into a readable execution plan | **M327** |
| 4 | A restrained visual system across the working interface (loading screen untouched) | **M328** |

## M325 — Orchestrate opens on the tasks

The page opened on the diorama with a roster, an inspector, an activity feed and a workbench
around it; the next useful action had to be read out of five surfaces. It now opens on a
**task list** in four groups — Needs attention, Running, Ready for review, Completed — and the
scene, Watch and the List are an optional visualisation behind the view switch.

| Piece | Where | Check |
|---|---|---|
| The groups, the status sentence, the checks column and ONE action per row — the task queue's own judgment (`task-queue.ts`), never a second one | `orchestration/orch-task-board.ts` | `verify:orchestration board.1–.4` |
| Inline answers where they fit a row: a permission (`ApprovalDetail`, the one approval executor) and a question (a reply through the composer's send door); everything else opens the task's workspace on the side that answers it | `orchestration/OrchTaskBoard.tsx` | — (Electron owed) |
| Secondary verbs in the row's ⋯ menu (open, show on canvas, show in scene, mark done); Completed folded | `OrchTaskBoard.tsx` | — |
| `view: 'visualize'` is the ONLY value written; absent is the task list, so every pre-M325 record (all of which carry a `lens`) opens on the tasks. A saved view with a lens opens the visualisation | `shared/orchestrate-prefs.ts`, `orchestration-prefs.ts` | `verify:orchestration orch-view.1` |
| Each task's check tally (latest run per command) and latest runs on the queue; the queue's timelines are read while any covering page is up, not only while the attention popover is | `shell/task-queue.ts`, `Canvas.tsx` | `verify:rail focus.5` |

Idle agents are counted on a row, not listed ("+2 idle"); the activity feed and the roster are
the visualisation's. The page's arrow/Enter keyboard model is the scene's and stands down while
the list shows (the list is buttons in the tab order).

## M326 — the focus view is where a task is worked on

| Piece | Where | Check |
|---|---|---|
| A task a PERSON starts (the Start work sheet, or its one-gesture fast path) opens in its workspace; an agent-line start and a canvas drop stay on the canvas | `palette-actions/board.ts`, `boardVerbs.focusItem` | — (Electron owed) |
| Orchestrate's rows open the workspace on the side the need asks for (`openingSide`'s `asked`) | `focus-model.ts` | `verify:rail focus.4` |
| The header: the title is a switcher to the other open tasks (needs-you marked); repository · branch · backend; a live activity line (the tool in use, thinking, waiting on you, when the last turn ended); the Next action; ⋯ for Show on canvas | `FocusTask.tsx` `FocusActivity` | — |
| An agent switcher over the conversation when a task has more than one chat, remembered per task (`FocusPrefs.agent`, `shownAgent`) | `focus-model.ts` | `focus.4` |
| Mark reviewed, then Accept, in the page — the review node's own flow lifted to `useLaneAccept` (both surfaces read one author) | `review/useLaneAccept.ts`, `ReviewNode.tsx` | existing `verify:review` accept checks |
| One `FocusTask` instance per task (`key`), so an armed Accept or a picked diff line never crosses tasks; side, file, scroll and agent are remembered per task, the draft lives with the chat | `Canvas.tsx` | — |

## M327 — a task's execution plan

`PersistedWorkItem.plan` (the user's, like the brief) holds the steps and what a person
decided — owner, dependencies, directory, expected output, a check's command — and three
moments a person caused (started, verified, cancelled). **Every state is derived** at render
time from the agents' sessions, the witnessed check runs and the review mark (`planView`), so
a relaunch cannot leave a step "running" about an agent that is gone.

The first version is ONE workflow — implement API and UI independently, verify integration
(waits for both), review the result — editable (add, remove, retitle, re-kind, re-wire).

| Piece | Where | Check |
|---|---|---|
| The record, parsed field by field; a malformed plan costs the field, never the card; a provider re-add keeps it | `shared/task-plan.ts`, `work-items.ts` | `plan.1`, `plan.6` |
| **Stopped responding ≠ finished ≠ verified.** A normal turn end after the step started is "Finished — not verified" with the agent's own first line; an errored/aborted turn, a closed conversation or a disposed session is "Stopped responding" with Retry and Assign beside it; verified only by a witnessed check after the step started, a person's mark, or the person's current review | `planView` | `plan.2–.3` |
| Cycles and missing commands are named, never a hang | `planProblems` | `plan.4` |
| A step's brief — its task, expected output, directory, who runs alongside, what waits on it — INSERTED in the agent's composer, never sent (M80) | `stepBrief`, `FocusPlan.tsx` | `plan.5` |
| Actions beside the step: Start an agent (a chat in the step's directory on the task's backend), Assign/Reassign, Open its conversation, Cancel (the runtime's interrupt — the conversation is kept), Retry, Mark verified, Run check (the review's Run checks), Review | `focus/FocusPlan.tsx` | — (Electron owed) |
| The page claims the conversation BEFORE the brief is inserted (the canvas panel behind would otherwise take it) | `FocusTask.tsx` `showAgentWith` | — |
| The plan's progress and the step that most needs the person on Orchestrate's row | `planSummary`, `focus/plan-facts.ts` | `plan.5`, `board.3` |

## M328 — a restrained system

Token-level, so it reaches every working surface at once, and the loading splash (a `<canvas>`
drawn in script) is untouched by construction.

- Radii one step tighter: `--r-sm/md/lg` 4/6/8 (was 5/8/12), still decreasing inward.
- No glow: `--glow-iris` is the 1px accent ring only; `--glow-tone` and the working/needs-you
  spill are zero. The Orchestrate stage marker is a ring.
- Neutral ground: the four aura tokens are zero-alpha (the layers `ground.1`/`aura.1` pin stay);
  `.orch` loses its iris wash; the user turn's bubble is neutral.
- Sans-serif headings: `.orch__title` is the UI face at `--t-xl`/600; the eyebrow is neutral
  caps, not iris mono. The display serif stays a note's.
- One prominent action per context: the list row's primary is filled only in Needs attention;
  the decision bar fills Mark reviewed until the changes are read, then Accept; the plan fills
  one action per step; everything else is outline or in a ⋯ menu.
- Continuous motion: none added. The remaining loops are the streaming caret (feedback) and
  the scene's live edge (the visualisation, not a work view).

## Gate (2026-09-24)

Full `npm run verify`, then the touched Electron parts re-run after fixes. Plain-node tier
green (43 suites; `verify:orchestration` 144, `rail` 247, `styles` 81, `meta` 51). Electron:
`canvas` 11/11, `xterm`, `panels:core` 83/83, `shell` 105/105, `kinds` 50/50, `orchestrate`
37/37 (three new `orch-tasks.app.*`), `agents` 80/82 (`template.1`, `detail.1` — recorded
pre-existing), `product` 108/117 (the 8 recorded workflow/reach reds + `starter.1`).

**Changed on purpose, with why:**
- `panels:core aura.paint.1` now asserts the ground stays NEUTRAL when a panel needs you
  (M328 reversed M229's warm ground; the attribute plumbing stays).
- `panels:orchestrate` and `shot.cjs`'s diorama scenes choose the Scene lens after opening
  (`toVisual`) — the checks were written against the scene, which is now the visualisation.
  `panels:shell orch-page.5` does the same before choosing Pipeline.

**A pre-existing crash surfaced.** `inspector-fields.ts` indexed `AGENT_CAPABILITIES` by a
panel's `spec.agent`; the reconcile fixture writes `agent: 'claude'` (the key is
`'claude-code'`), and selecting that panel on the canvas threw and unmounted the whole shell.
Nothing ran after that block until `orch-tasks.app.*`. Now `?.` — an unknown agent kind costs
the Cost section, never the app.

**Fresh-context review** (code-reviewer): a plan's check step read "Verified" from a run that
happened before the step was ever started (`since` defaulted to 0). A check step now has no
result until it is started — `plan.3` pins it.

## Owed

- Goldens: every Orchestrate scene now opens on the task list, and the token changes move
  every scene's corners and glows — `npm run shot` + a critic's sentence per changed scene
  before `UPDATE_GOLDENS=1`. Nothing was re-baselined.
- Electron DOM checks beyond `orch-tasks.app.1–.3`: the inline answer on the wire, the
  start → focus route, the agent switcher, the decision bar, a plan step's Start/Cancel/Retry.
- `shot.cjs orchestration-dark` now captures the task list (it needs no cube); decide at the
  golden round whether it stays the list or chooses the scene, and add a task-list scene.
