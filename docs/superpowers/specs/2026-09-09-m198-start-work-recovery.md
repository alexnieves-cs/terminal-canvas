# M198 — Start work recovery and idempotency

## Problem and evidence

M197 made every entry door reach one executor, but the executor mints a fresh chat id before
every `board:lane` call. `ensureForPanel` only reuses a lane for the same panel id and root.
Two clicks, a retry after `agent:create` refuses, or a retry after the first send refuses can
therefore create a second worktree and leave the first one without a visible owner.

## Intended experience

Starting the same board item while an attempt is in flight joins that attempt. Once a lane is
created, the item immediately records its teammate, reserved conversation id and worktree id.
A retry resumes from those facts: it reuses the lane, creates the missing conversation if
needed, and retries only a refused first send. A successfully dispatched item returns its
existing conversation without sending the task twice.

The item note names the exact incomplete stage. The task remains `todo` until the agent emits
its first message-start event; recovery does not invent `working`.

## Ownership and data

- The renderer owns the in-flight promise because it owns the board item and the dispatch
  transaction.
- Main remains the authority for worktree creation/reuse and agent-session creation.
- Existing `panelId`, `worktreeId`, `teammateId`, and `note` fields are sufficient. No schema
  or IPC change is needed.
- The reserved panel id is written as soon as main returns the lane, so a restart can reuse it.
  `nextIdRef` is re-seeded from that id when recovering to prevent a later mint from colliding.

## Failure states

- Lane refusal records only the refusal; no association exists yet.
- Chat refusal keeps the lane association and says the conversation still needs creating.
- Send refusal keeps the lane and visible conversation and says the first message needs retrying.
- A stale association whose panel id now belongs to a different kind refuses by name rather than
  attaching a task to the wrong object.
- A teammate or repository change deliberately starts a new attempt only when the standing
  association cannot be reused; this milestone does not silently move an existing lane.

## Acceptance

1. Two simultaneous starts produce one lane, one chat and one first send.
2. A chat-creation refusal leaves a recorded lane and a retry reuses it.
3. A first-send refusal leaves one visible conversation and a retry sends through it.
4. Starting an already-dispatched item returns the existing conversation without duplicate work.
5. Runtime state still changes only from the agent's message-start event.

