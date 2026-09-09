# M200 — Honest supervision surfaces

## Problem

Attention can answer a live permission request, but a selected workflow run only paints the word
`working`, and a task card shows the board state without explaining whether its conversation is
queued, running, blocked, or merely finished with one turn. These surfaces describe the same work
with different state meanings.

## Intended experience

- Attention remains the global answer to “what needs me,” ordered oldest first.
- A selected workflow run overlays each node with the M199 projection. When blocked, a contextual
  line names the node, tool and argument; Allow/Deny target the exact panel and request id supplied
  by main's mirror.
- A task card keeps its board disposition pill and adds a separate execution line for its linked
  conversation. A pending question uses the same tool/argument and the same answer door.
- A completed chat turn says `turn complete`; a sealed run says `run ended`. Neither changes the
  task to done or review.
- Concurrency queues and current-turn queues name their different causes. Backend limitations keep
  controls visible only where the capability exists and otherwise state the next action.

Metrics remain in inspector/deep detail. The resting header gains no counters.

## Architecture

`run-supervision.ts` is the single vocabulary. Workflow and task surfaces build its live input
from `chat-store` and `agent-state-store`, both caches of main-owned facts. `answerApproval` remains
the one renderer verb and `agent:answer` remains the one IPC door. No request is copied into layout.

## Acceptance

1. Attention, selected chat, selected workflow run and task card name the same oldest blocker.
2. Answering from the workflow or task targets the intended session/request and clears all views.
3. Queued and active nodes have distinct words and reasons.
4. Stopped, failed, skipped and unknown outcomes remain distinct.
5. A successful turn or run never changes or visually relabels the work-item disposition.
6. Both themes, compact/wide layout and reduced motion remain usable; intended visual changes get
   critic sentences before any golden update.

