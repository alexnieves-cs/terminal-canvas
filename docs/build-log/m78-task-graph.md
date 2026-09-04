# M78 — The task graph

**Branch:** `m78-task-graph`. **Spec:** `docs/superpowers/specs/2026-09-03-m78-task-graph-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-03-m78-task-graph.md`. **Status:** finished 2026-09-03.

**Thesis sentence:** the links between panels stop being annotations and become the plan — a
graph the canvas runs, with conditions on its edges and joins at its nodes, across both
front-ends.

## What landed

- `shared/handoff.ts`: five triggers, `HANDOFF_TRIGGERS`, `HandoffEvent`, `handoffFires` (the
  one table). `renderer/canvas/handoff-rules.ts`: `incomingHandoffs`, `joinAdvance`.
  `verify:viewport graph.1–.3` (127/127). The parser accepts the five and drops an unknown one
  as malformed; a handoff's endpoints are process kinds (a chat at either end), a restart's
  are terminals — `verify:layout graph.1–.2` (187/187). `describeAutomation` names the five —
  `verify:rail graph.1` (156/156). `setLinkAutomation` accepts a chat at either end.
- `useHandoff.ts`: the condition asked of the one table with a failed exit condition recorded by
  name; the join (arrivals in a ref, one delivery, payload in panel order, `waiting for …` and
  `joined — N sources` on the rows); a chat source (the store's `onChatTurnEnd`, payload the
  last assistant text) and a chat target (`agentSession.send`, which spawns an asleep chat).
- The surface: `LinkLayer` edge labels (`→ on exit 0`, `⋈ waiting`) and a selected stroke; a
  click on an edge selects it; `Canvas` owns `selectedLink`, Delete/Backspace (the palette row's
  own remove, one history entry), Escape; the context pane's edge view with a labelled select
  over `off`, the five triggers and `restart`, the last result, Label… and Remove.
- `verify:panels graph.1–.3` (283/283): the join (both tokens in the target's log, in order,
  two headers, the rows), the `exit-fail` edge skipped by name on exit 0; an edge selected by a
  click, the pane's select setting `exit-ok` (the layout carries it), Delete, one undo; a chat's
  turn end into a terminal's log, and a terminal's exit as a `user` line on a chat's stdin.
- A `graph` shot scene. README row; CLAUDE.md note and counts; verify-suites counts; four
  `docs/load-bearing.md` entries; this log.

## Red first

- Every plain-node check red at module scope (`handoffFires`, `handoff-rules.ts` absent;
  `describeAutomation` returning one sentence for three triggers; the parser dropping `exit-ok`).
- `verify:panels graph.1–.3` red three times for three different reasons, each a finding:
  the hover badge selecting broke `link-draw.5` (selection moved to a click on the edge); the
  rule maps were keyed `from:to` while the segment key is `from to` (labels and selection never
  matched — an `ek` in the layer); the join target was a `/bin/sh`, which EXECUTED the pasted
  transcript and exited on the first source's own `exit` line; a bare `cat` then never left
  `starting`. A shell that prints once and sleeps is the target that works.
- **The links were invisible.** The `graph` scene showed a selected edge in the pane and no
  line on the canvas; the DOM had the paths at the right rects with visible strokes. The link
  layer's SVG was `width: 0; height: 0; overflow: visible`, and inside the world's
  `will-change: transform` compositing layer that painted nothing. One pixel fixed it. Every
  link check reads DOM and computed style, so all were green throughout — the load-bearing
  entry records it.
- Check 112 went red twice in a row on a click landing between two re-asks of the Changes
  section; it now clicks inside its wait and re-clicks while nothing has been minted.

## Decisions taken while building, and why

- **One table.** `handoffFires` in `shared/` so the hook, the pane and the checks read one
  function; the harness's fixtures are its cells.
- **Click selects, badge removes.** M35's badge and its check stand; a click lands after the
  background's mousedown by construction.
- **A join of one is M41.** No special case: `incomingHandoffs` returns one id and
  `joinAdvance` is ready on the first arrival.
- **A chat target never queues.** `agentSession.send` spawns; the queue is the terminal's.
- **`waiting for …` names the sources still owed**, and a failed condition says which exit it
  was not — a silent non-fire reads as a broken edge.

## What this milestone does not do, stated

- A join has no timeout: an edge whose source never fires leaves the target waiting, and the
  row says so. M41's five-minute queue applies once the join has fired.
- A handoff into a plain shell is INPUT and the shell runs it (the harness found this): the
  feature is for agents, which read pasted context, not for shells.
- The edge's label on the canvas is the rule, not the user's label, while a rule exists.

## The visual loop

**Before any critic**, the `graph` scene showed no edges at all — the paint defect above —
and, once they painted, edges hidden under other cards until the fixture's ruled edges moved to
open space.

**The critic** (briefs + the PNG, fresh context). Accepted: the status strip said `nothing
selected` beside an Edge pane (it names the edge now); the second edge's label sat off screen
(rule labels sit at t = 0.72 toward the arrowhead); the remove badge was red (iris, with a
name); the arrowhead did not take the selection (its own marker); the line and the select
phrased one fact two ways (`trigger-words.ts`, verbatim on both and in the sentences); the ends
line in the UI face (mono); `—` for an empty label (`none — the rule is shown on the line`);
the pane silent on whether the edge fired (`last`: `never fired` / `waiting for …` / the
sentence); the stock select (hairline). Declined, recorded: the arrowheads landing on the
state edge at a corner (M13's anchors), dashed-until-fired and the minimap's hairlines
(backlog), the accent reading teal (it is `--iris`).

**The verifier** (spec + diff, fresh context): "delivered with gaps". Accepted and fixed: the
Delete listener with focus in a text field, a select or xterm's helper (guarded on the active
element — with focus in one of them the edge is removed from the pane or the badge); a restart
rule on a chat edge accepted by the mutator and dropped by the parser (refused at both, and
the option disabled by name); exit-family triggers offered for a chat source that never exits
(disabled by name); a failed or interrupted chat turn counted as a turn's end (only an ok
result fires); stale join arrivals from a re-enabled edge (pruned when not expected or older
than the queue's five minutes); a join's other rows saying `handed off together` before the
delivery queued or was refused (they mirror the delivery's sentence under `joined —`); four
copies of the trigger words (one module); an older turn's text handed off under a new turn's
header (the last turn only); `selectedLink` surviving a shift-click, a switch and the merged
view (cleared); a ruled edge hiding the user's label (kept beside the rule); check 112's retry
minting two nodes (one click per 1.5 s). Recorded as limits in the spec: no `2 of 3` count on
the line; the join's arrivals cleared with the effect's deps (stable callbacks, so in practice
never mid-join).

## Verification

Run alone, after the tmux verify server was killed: `npm run verify` green end to end —
`verify:viewport` 127/127, `verify:layout` 187/187, `verify:rail` 156/156, `verify:panels`
283/283. The `graph` scene re-shot six times and read.
