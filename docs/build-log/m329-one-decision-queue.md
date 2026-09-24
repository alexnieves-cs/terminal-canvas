# M329 — one decision queue: every "needs you" lands on the request

Built 2026-09-24 on local `main`, alongside M325–M328's uncommitted work.

The ask (brief item 5): approvals, failures and review requests as task-associated decisions
that each say what happened, what is waiting, what action is requested and **what that action
affects**. Permissions are answered inline, a failed check opens at its output and review jumps
to the changes. A resolved request updates immediately and keeps its history within the task.
Success criterion: every "needs you" indicator leads to a specific, actionable request, never
a generic agent panel.

Most of the queue already existed (M308's inbox, M318's task grouping, #16–18's inline
`ApprovalDetail`, #14's answer acknowledgement). This milestone closes the three gaps an audit
of every indicator found.

## 1. Every indicator lands on the request

An audit of every "needs you" indicator found fifteen that only framed the agent panel
(`goToPanel`). The fix is one resolver, not fifteen: `jumpToAttention` (the landing that
notification clicks, the command pill, ⌘J and resume already shared) now also opens the
**request** (`openRequestOfRef` in `Canvas.tsx`):

- a chat's pending **permission** opens in the queue beside it, the one surface that resolves it (#16);
- a chat's **question** has its last turn scrolled into view in the conversation;
- a **terminal's** prompt is the terminal itself, so framing it is the request.

Nothing in the resolver focuses or acknowledges. Focus is the renderer's single acknowledgement
trigger, so a jump that cleared the badge on arrival would take the decision away before the
person read it (`verify:panels:shell` 97).

`goToPanelOrRequest` routes a WAITING panel through that landing and frames any other panel
as before. It is wired to the Dock's rows, the rail's panel rows, the queue's decision/panel
evidence and Orchestrate's jump. Orchestrate's jump covers its roster double-click, "Open on
canvas", the scene callout, the Watch tower and the task board's untasked rows.

| Indicator | Before | Now |
|---|---|---|
| Top-bar pill, ⌘J / ⇧⌘J | framed the panel | framed, plus the request opened |
| OS notification click, "elsewhere" rows | switch, then frame | switch, then the request |
| Rail panel row, Dock row "jump" | frame | request, when the panel is waiting |
| Queue "Go to" for a permission | closed the popover, framed the agent | opens the request in place |
| A workspace's waiting count (rail) | text inside "Switch to" | its own control: switch, then land on the longest-waiting request |
| Task board "Go to &lt;agent&gt;" | opened the TASK page | lands on that agent's request |
| Focus page's task switcher (needs-you dot) | the other task's remembered side | the side its request asks for: a failed check opens Checks, a review opens Changes |
| Resume "answer", command pill question | frame | request |

Left as they were, on purpose:

- The palette's panel rows and workspace rows are navigation lists. Their count is a label.
- A panel header's "needs you" word shares the header's drag surface, and making it a button would steal the move gesture.
- Orchestrate's explicit "Open on canvas" still says what it does. It now also opens the request when the panel is waiting.

## 2. What each action affects

`QueueDecision.affects` is one required line per decision (`task-queue.ts`):

| Decision | Its line |
|---|---|
| Permission | The tool, the action and the directory it runs in, whose turn waits, and how many more wait behind it |
| Question | Whose next turn waits |
| Failed check | Whether the task can be verified, and the command that has to pass |
| Review | How many changed files, and that nothing lands until Accept |
| Lost | That nothing is live and nothing was allowed |

The Dock renders it under every row, both inbox rows and queue rows.

## 3. History within the task

`resolvedDecisions` reads a task's answered decisions, newest first, from the durable record.
There is no new store:

- the PERSON's rows: an answered permission (`event: 'permission'`) and a review mark (`artifact`, "Reviewed N changed files");
- a check run that went from failing to passing, dated at the passing run.

An agent's claim (`source: 'agent'`) is never history, and neither is a dispatch or a check
still failing.

The permission record now carries what it decided: its task (`itemId`), the inbox key
(`p:<requestId>`) and a title in words (`permissionRecordTitle`, e.g. "Allowed Bash — npm
test"). It used to write "Allowed a request" with the request id as its detail, and without an
`itemId` the task timeline read filtered it out entirely. The task comes from
`boardVerbs.taskOfPanel`, which follows the same one-task-or-none rule as the Focus task verb.

**Immediate update.** `orchestration/record-landed.ts` announces every row main accepted, and
`useTaskQueue` re-reads on a person's row. So an answer leaves the queue (`markAnswered`),
shows its acknowledgement (#14) and appears in the task's history in the same beat. The
announcer is its own module because `orch-record.ts`'s importers are pinned to the writers
(`orch-timeline.6`), and a reader importing it would look like a new writer.

Where history shows: under each task group in the Dock ("Answered in this task · N", folded),
and on the task's focus page ("Answered · N" under Next). The focus page keeps it after the
queue has let go of the task.

## Checks

| Check | Pins |
|---|---|
| `verify:rail queue.affects.1` | every decision has an affects line; each kind names its subject |
| `verify:rail queue.history.1` | order, sources, outcomes; agent claims, dispatches and still-failing checks are excluded |
| `verify:rail queue.history.2` | the permission record's words, clipping, session grant, fallback |
| `verify:panels:shell 96` (amended) | the workspace's waiting count is a control of its own |

Owed: an Electron DOM check that a Dock "Go to" on a permission expands the request in place,
a notification click opening the queue, and the `attention` golden (every popover row gains an
affects line).

## Gate (2026-09-24)

Plain tier: every suite `npm run affected` selects is green (`verify:rail` 250/250, `verify:orchestration` 144/144, `verify:styles`, `verify:meta` 51/51 with this log's README row). Typecheck clean.

Electron tier, run serially:

| Suite | Result | Reds |
|---|---|---|
| `verify:panels:shell` | green | none (amended 96 passes) |
| `verify:panels:orchestrate` | green | none |
| `verify:panels:agents` | 80/82 | `detail.1` (baseline, `m275-swarm-presets.md`) and `template.1` (red since the #16–18 attention work) |
| `verify:panels:product` | 108/117 | the 8 recorded in `m277-libraries.md` plus `starter.1` (left red on purpose, see the golden-debt close) |

Not run: `verify:visual`, and so no goldens.
