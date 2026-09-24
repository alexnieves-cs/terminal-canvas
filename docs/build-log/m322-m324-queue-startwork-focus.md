# M322–M324 — editable queue, project-first Start work, a task's focus view

Three product asks, built 2026-09-24 on local `main`. M323 was built by a forked session in its
own worktree (commit `98653260` on `worktree-agent-a3ffa6c5092f648c4`) and applied onto the
tree; M322 and M324 were built here. M324 depends on M322 (the focus view hosts the same
conversation, queue included).

| # | Ask | Milestone |
|---|---|---|
| 3 | Turn queued messages into visible, editable instructions | **M322** |
| 2 | Make task creation project-first and progressively disclosed | **M323** |
| 1 | Add a focused task workspace | **M324** |

## M322 — the waiting messages are a list a person controls

The chat showed a count (`N messages waiting`); main already held the messages, and a queued
message was stored as a user turn the moment it was sent, so the transcript showed it among
the delivered ones and an exit that dropped the queue left it there looking sent.

| Piece | Where | Check |
|---|---|---|
| Each queue entry names its stored user turn (`turnId`); the turn carries `delivery: 'queued'` until it is written, then is withdrawn and stored again DELIVERED at the end of the transcript | `main/agent-session.ts` (`enqueue`, `takeNext`) | `verify:agent-session queue.1–.2` |
| Edit / Remove one waiting message; Discard an undelivered one (`agent:queue-edit`) | `editQueued`, `removeQueued`, `discardUndelivered`, `agent-handlers.ts` | `queue.1`, `queue.drop.1` |
| Stop and send (`agent:send-correction`): first in line, then the interrupt; the interrupted result serves it. No interrupt door → it still leads the queue and the composer says so | `sendCorrection` | `queue.correct.1`, `verify:rail midturn.1` |
| An exit that drops the queue marks each message `not-delivered` with the sentence why; Cancel (a person's choice) withdraws. A relaunch reads a still-`queued` turn as "the app closed before this was sent" | `markUndelivered`, `agent-handlers.ts` `transcript` | `queue.drop.1–.2` |
| The transcript log's tombstone (`{t:'drop'}`): a removed turn is gone; one appended again takes the END position | `main/agent-transcript-log.ts` | `queue.log.1` |
| User-turn ids carry a per-session stem (`u-<stem>-N`): a relaunch's `u-1` no longer overwrote yesterday's `u-1` in the log | `main/agent-session.ts` | `queue.2` |
| The composer: the waiting list (Edit/Save/Remove, tags), Send after this turn and Stop and send as words in a row of their own, undelivered rows with Send again / Discard; ⌘↩ queues mid-turn, ⌘⇧↩ is Stop and send | `chat/ChatConversation.tsx`, `chat-model.ts` (`composerMidTurn`, `queueRows`, `deliveredUserTurns`) | `verify:rail midturn.1, queue-rows.1, undelivered.1` |
| The unsent draft outlives the mount (workspace switch, focus view, relaunch), cleared by a send and by an explicit close | `chat/chat-drafts.ts`, `useChatSessions.ts` | — (Electron) |

M73's composer arms (`send`/`interrupt`) are unchanged — `chat-model.3` and `composer-live.1`
still pin them; the mid-turn verbs are a SECOND pair of arms.

## M323 — Start work opens on project + request

See the fork's commit message. `start-work-first.ts` holds the preselection (teammate, repository,
backend), whether Options opens at rest, and the kept draft; `verify:palette startwork-first.1–.6`,
`verify:first-run startwork-first.dom.1–.2`. `verify:panels:product start.door.1` changed on
purpose: the sole placed teammate is now preselected, so the repository field is enabled at open.

## M324 — a task's focus view

A third center page (`CenterView` `'focus'`, never persisted) over the mounted canvas: the
conversation on one side (`ChatConversation`, the chat panel's body extracted unchanged so both
hosts share every `data-chat-*` hook), the evidence on the other — the Orchestrate workbench's
reads bound to the task (its `focus` prop hides the strip's chrome and adds line picking, a
remembered file and scroll, and a failed check's follow-up), the review node's `TaskReviewPanel`,
and a bound preview as a second guest on the pane's partition.

| Piece | Where | Check |
|---|---|---|
| Per-task split, side, file and scroll in localStorage, parsed field by field, newest 50 | `focus/focus-model.ts`, `focus-prefs-store.ts` | `verify:rail focus.1–.2` |
| The header's blocker and next action, in the queue's and the handoff's own words; the press stays in the page | `focusHeaderOf` | `focus.3` |
| One composer per chat: the focus view CLAIMS the conversation and the canvas panel shows a note | `chat/conversation-host.ts`, `ChatNode.tsx` | — |
| Doors: board row Focus, card verb `focus`, ⋯ menu "Focus this task", palette `task.focus`, Needs you "Focus task" | `BoardPane`, `WorkNode`, `PanelFrame`, `commands.ts`, `Dock` | `verify:panels:product board.1` (verb list), `verify:verbs closure.1` (`focusTask` excluded: a page) |
| Every "is the canvas covered" test reads `!== 'canvas'` | `Canvas.tsx`, `useShellChrome.ts` | `verify:orchestration orch-page.src.1` (re-pinned) |

**Fresh-context review** (code-reviewer, 2026-09-24): a task switched under a mounted focus page
reused the conversation instance, leaking the draft into the other chat — fixed by keying
`ChatConversation` by chat id; the waiting list's head sentence read a stale `queuedReason` —
now derived from the list. Both fixed.

## Gate (2026-09-24)

Plain-node tier: every affected suite green. Electron tier: `canvas` 7/7, `xterm` 11/11,
`panels:core` 83/83, `shell` 105/105, `kinds` 50/50, `orchestrate` 34/34, `agents` 80/82
(`template.1`, `detail.1` — both recorded pre-existing), `product` 108/117 (the 8 recorded
workflow/reach reds + `starter.1`, left red on purpose).

**Two traps met.** (1) The focus page's root class was `.focus`; xterm puts `focus` on a focused
terminal, so the rule padded every focused terminal off its cell grid — `panels:agents hover.1`
and `links.1` went red with the pointer demonstrably ON the link layer. Renamed `.focus-view`.
(2) Drafts are keyed by panel id, and a recycled id opened on a dead chat's half-message
(`orch-limits.app.1` read `composer: false`) — an explicit close now drops the draft.

## Owed

- Goldens: the chat composer (waiting list, mid-turn row), Start work sheet and the focus page
  change visible surfaces; no golden was written. A critic pass against `npm run shot` first.
- The focus page has no Electron DOM check of its own yet (open from each door, Back restores the
  camera, comment → follow-up lands in the conversation).
- Real-agent drive of Stop and send against a live claude CLI.
