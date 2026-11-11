# M670–M671: the agent supervision kit, adopted from Creance

Alex asked for three of Creance's agent organisms as owned source:
ApprovalPrompt, ToolCallCard and RunTimeline
(<https://github.com/amitshrivastavaa/creance>, MIT). They were taken at commit
`c8bfae4` from the repository, because the shadcn registry host
(`creance.pages.dev`) is refused by the build environment's network policy; the
registry is built from that same `main`, so the source is the same. The licence
and attribution are in `src/renderer/supervision/NOTICE.md`, and each file's
header says what was kept and what changed.

## M670: approvals carry a risk

- **The rule adopted.** Creance's prompt hides "Always allow" for high risk:
  a dangerous action is confirmed every time. Here the broadest grant is M98's
  "Allow for session", keyed by session and TOOL. That made the rule more
  important than in Creance: a `Bash` grant given for `ls` would quietly answer
  `rm -rf ~` later.
- **One judgment.** `shared/approval-risk.ts` is pure and errs upward: `low` is a
  tool that only reads, `high` is a command that destroys, publishes, escalates or
  pipes the network into a shell (matched anywhere in the line, so
  `cd x && rm -rf y` is caught by its tail), or a tool named for deleting,
  deploying or paying. Everything else, including any tool it has never seen, is
  `medium`. A wrong `high` costs one press; a wrong `low` costs a grant.
- **Enforced in main, not only hidden.** `approvals.ts`'s `grant` mints nothing
  from a high-risk request and `granted` answers false for one whatever is held.
  The manager's three `preAnswer` call sites now pass the request's input, and the
  answer handler grants with the pending record's own input. So the palette, the
  phone and any door that still sends `scope: 'session'` get an allow-once, never
  a grant.
- **Where it shows.** The chat's question block is `supervision/ApprovalPrompt`
  (same sentence, same `data-chat-*` hooks, a risk label, a sentence saying why
  the session verb is missing, A / Shift+A / D while focus is inside it). The far
  tier and the Needs-you queue's detail hide the session verb the same way.
- **Not copied.** Creance's `autoFocus` (a canvas has many conversations, and
  stealing focus from a composer is a known bug here), its outcome badge (an
  answered request leaves `pending`, and #14's acknowledgement already says what
  was decided), and its CSS (the card uses this sheet's tokens; only high risk
  gets a colour, because most requests are medium and an amber on every `Bash`
  would hide the one that matters).

## M671: a task's Run tab

- **A typed stream through a pure reducer.** `shared/agent-run.ts` is Creance's
  `events.ts` and `reduceRun` adapted. The source is the transcript the chat store
  already holds (filled by `agent:event`), translated by `runEventsOf`, not a
  second subscription to the bus: a run rebuilt after a relaunch is the run the
  panel showed. A step is one delivered prompt's work, because the CLI writes
  one assistant message per tool call. Unknown steps and calls are ignored, never
  thrown. A call whose turn ended without a result is `no-result`, never
  `success` (the same rule as the chat's `no result` pill).
- **The tab.** The task view gets a Run side after Plan whenever the task has a
  conversation. `RunTimeline` follows new steps while you are at the bottom and
  offers "Jump to latest" when you scrolled up; `ToolCallCard` shows the picked
  call (or the latest) with its input, result or error. No Retry: these CLIs retry
  on their own, and a Retry the app cannot honour would be a door that is only
  declared. No nested steps: the CLIs report no step tree.

## Checks

`verify:agent-run` (plain node): `risk.1–.4`, `risk.grant.1–.3`, `run.1–.7`,
`adopt.1–.5`. The visual goldens that show an approval (`approval`, and any scene
with a pending request) change by the risk label; they are re-taken only after
Alex has looked at the new pictures.
