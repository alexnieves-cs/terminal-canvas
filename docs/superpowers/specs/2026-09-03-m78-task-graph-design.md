# M78 — The task graph

**Status:** design, 2026-09-03. **Branch:** `m78-task-graph`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 6 (every control says what it is), 7 (three states),
9 (a row names the fix); 2.0 principles 10 (three natures, one canvas), 11 (one vocabulary
whoever produced it), 13 (an edge says what it does).
**Thesis sentence:** the links between panels stop being annotations and become the plan —
a graph the canvas runs, with conditions on its edges and joins at its nodes, across both
front-ends.

## What this milestone is for

M41's handoff is one edge: when A ends, B starts with A's tail. It cannot say "only if A
succeeded", it cannot wait for two sources, a chat can be neither end, and an edge cannot be
picked up and read — its rule lives in the source panel's context pane, its label is a word
the user typed. M78 makes the edge the object: a condition decides whether it fires, a
target with several incoming edges is a join that starts once when all have fired, a chat
is a valid source (a turn's end) and target (a send), and an edge is selectable — click,
Delete, undo — with its condition set from the context pane. Every edge says what it does
on the canvas.

## Design

### The pure rules (`shared/handoff.ts`, `renderer/canvas/handoff-rules.ts`; verify:viewport, verify:layout, verify:rail)

- `HandoffTrigger` gains three values beside `exit` and `idle`: `exit-ok` (the process
  exited 0), `exit-fail` (exited non-zero or by signal), `always` (any exit, or a turn's
  end). `parseLinkAutomation` accepts the five and drops an unknown one as malformed, as
  before. `handoffFires(trigger, event)` is the one table: `event` is `{ kind: 'exit';
  code: number | null }` or `{ kind: 'idle' }`.
- `describeAutomation` names each: `handoff on exit 0`, `handoff on a failing exit`,
  `handoff after a turn`, `handoff on exit`, `handoff always`; `nextHandoffState`'s cycle is
  unchanged (off → exit → idle → off), the other three set from the edge's own control.
- `incomingHandoffs(panels, targetId)`: the enabled handoff edges pointing at a target, in
  the panels array's order — a JOIN when there are two or more. `joinAdvance(expected,
  arrived)`: the pure reducer — arrived payloads keyed by source; `ready` when every
  expected source has arrived; `payload` the arrivals concatenated in EXPECTED order, each
  under its own header; `waitingFor` the sources still owed. A target with one incoming
  edge is a join of one and fires as M41 did.
- `setLinkAutomation` accepts a chat at either end (a chat is a process kind); a review, file,
  toolbox or Jira panel is still refused; a cycle is still refused; a RESTART rule needs two
  terminals at the mutator as at the parser (amended after the verifier). A chat never exits,
  so the pane disables the exit-family triggers for a chat source by name; a chat's turn end
  counts only when the result is not an error and not an interrupt.

### The runtime (`useHandoff.ts`)

- A source fires on `exit` (the registry's exit, with its code) or `idle` (the terminal's
  busy → idle transition, or a chat's `result` event through the chat store's new
  `onChatTurnEnd` fan-out) and every outgoing enabled edge asks `handoffFires`; an edge whose
  condition fails records `skipped — exit 1 is not exit 0` (or the mirror) in the
  automation list and contributes nothing.
- A chat SOURCE's payload is its last assistant text (the store's turns), under the same
  header, with the same two bounds. A chat TARGET receives through `agentSession.send` — a
  send spawns an asleep chat, so a chat target never queues.
- The join: arrivals are held per target in the hook's own ref (in-flight state, never
  persisted, like the queue); the target starts once, when the last expected source
  arrives, with the concatenated payload; until then every edge that has fired records
  `waiting for <the sources still owed>`. A source firing twice before the join completes
  replaces its own arrival (the latest output is what B should read).

### The surface

- **Edge labels (principle 13).** Every edge with a rule carries a small label on the line —
  `on exit 0`, `after a turn`, `always`, the ONE vocabulary (`trigger-words.ts`) the pane's
  select and the automation sentences also read — placed toward the arrowhead (t = 0.72) so an
  edge whose midpoint is off screen still says what it does; the user's own label, when set,
  precedes it (`feeds · on exit 0`). An edge that has fired into a waiting join adds
  `· waiting` (amended after the verifier: a `2 of 3` count would be a second parse of the
  result sentence; the pane's `last` field says what is owed). A bare link keeps the user's
  label or none.
- **Selection.** A click on an edge selects it (the panels deselect; the hover badge stays
  M35's remove control — the first draft made the badge select and broke M35's own check);
  Delete or Backspace removes a selected edge (one undo restores it, M35's history entry);
  Escape deselects. The context pane, with an edge selected, shows the edge: source →
  target, the rule as a labelled select of the five triggers plus `off`, and the last
  result sentence.
- The M41 automation list keeps its rows and gains the join's `waiting for …` sentence and
  the skipped condition's.

## What it must not break

- `verify:panels handoff.1–.2` (the one-edge case is a join of one).
- `verify:viewport handoff.1` (the cycle refusal, the sessionless refusal for document kinds).
- Every pre-M78 layout: `exit` and `idle` parse as before.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| `exit-ok` firing on exit 1; `always` missing a turn's end; an unknown trigger defaulted | `verify:viewport graph.1`, `verify:layout graph.1` |
| A join firing twice, or on the first arrival; payload order not the edges' order | `verify:viewport graph.2` |
| A chat endpoint refused by the mutator; a file endpoint accepted | `verify:viewport graph.3` |
| The sentences drifting from the triggers | `verify:rail graph.1` |
| A join firing once after both sources, and a failed condition recording `skipped` | `verify:panels graph.1` |
| An edge selected by a click on it, removed by Delete, restored by one undo; the pane's select setting the rule | `verify:panels graph.2` |
| A chat source's turn end handing off to a terminal, and a terminal's exit handing off into a chat's composer send | `verify:panels graph.3` |

## Manual-only, added

- The real `claude` as a join target receiving two sources' output (the runner is fake in
  every suite).
