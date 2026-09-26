# M350 — each agent's own meter and caps, enforced by main outside the agent loop

**Verdict: shipped.** Arc 2.3, first half. M82 gave the CANVAS a budget: one ceiling over
every agent's reported cost. Nothing measured or capped ONE agent. A canvas well under budget
could hold a single agent that had spent all of it, or whose conversation had filled its
context. Every agent now has a meter that main keeps:
- its spend, carried across every process it has run;
- its context, measured on every message.

Two caps in Settings hold an agent that crosses either:
- `agents.nodeCapUsd`, the spend cap for each agent;
- `agents.nodeCapContextK`, the context cap for each agent.

Main enforces them, not the agent:
- a message that crosses the context cap interrupts the turn it is in;
- a result that crosses the spend cap holds the agent;
- a held agent's sends are refused by name, in its own figures, and what it had queued
  waits unsent;
- raising the cap releases it at the next send, and the held messages go first.

Built 2026-09-26 in a worktree off M348, while M349 went through its gate, then landed on
local `main` after it.

## What landed

- **`NodeMeter`, `CapHold` and `NodeCaps`** (`shared/agent-session.ts`), with the pure
  `contextTokens`, `capCrossing` and `capSentence`. The snapshot carries `meter` (absent
  until anything is measured), and a new `meter` event carries the whole meter each time
  it changes. `SendResult` gains `refused-cap`, `turn-aborted` gains the reason `cap`, and
  auto's stuck reasons gain `cap` ("the agent reached its own cap").
- **Main** (`main/agent-session.ts`):
  - `procUsd` and `priorUsd`: the current process's reported cost, and the finished
    ones' carried at `spawn`;
  - `context`, set from each assistant message's usage;
  - `enforceCap`: at a message and at a result, latched like M82's budget;
  - `holdAtSend`: at a send, read live; it releases and serves the held queue first;
  - `meterChanged`: says the meter only when it changed;
  - the result path and codex's exit path serve nothing while the agent is held.
- **`spent()` now sums each agent's CARRIED spend**, and so does the pool's `spend`
  (`bootstrap/agent-runtime.ts`). Before, M82's canvas budget summed `costUsd`, which
  restarts at 0 in a new process, so a budget could be spent again after every respawn.
- **Settings** (`shared/settings-schema.ts`): `agents.nodeCapUsd` (dollars) and
  `agents.nodeCapContextK` (thousands of tokens). 0 is no cap, and that is the default.
  Both are read live through the manager's new `caps` dependency.
- **The refusal says the figures** (`bootstrap/agent-handlers.ts answerIn`), for example
  "this agent reached its $1.00 spend cap ($1.25 reported) — raise agents.nodeCapUsd in
  Settings, then send again". The composer shows it through M197's `sendRefusalSentence`,
  which gained a fallback sentence for the bare word.
- **The renderer's chat store** (`chat/chat-store.ts`) folds `meter` into the snapshot, so
  M351's surfaces read it with nothing new to wire.

## Decisions, and why

- **Context is measured per MESSAGE, not per turn.** A turn is a whole tool loop. Reading
  context at the result would let one long loop run to its end past the cap, which is the
  failure a context cap exists to prevent. Each assistant message's usage is the
  conversation's size at that call. It is SET, never summed, because claude repeats one
  message's usage on every block record.
- **Context counts every input class plus the output**: `input + cacheWrite + cacheRead +
  output`. Cached tokens are still in the window, and what the agent wrote is sent back
  on the next call.
- **Hold, don't kill.** A context crossing INTERRUPTS the turn (M82's distinction: a kill
  loses the turn, an interrupt keeps what it produced). A backend with no interrupt door
  is killed with the reason `cap`, as the budget does. A spend crossing arrives at a
  result, when nothing is in flight, so it only holds.
- **The hold is released only by a cap read live at a send**, never by the agent. The
  messages it kept go first. Otherwise a person's newest message would jump ahead of what
  they queued before the hold, and the conversation would be answered out of order.
- **Spend first when both cross**, as in M82's `budgetCrossing`: dollars are the explicit
  hard stop. An unmeasured figure crosses nothing. A backend that reports no cost (codex)
  has no spend to cap, and "unknown" is never "over".
- **`costUsd` keeps its meaning.** Orchestrate's "$X reported by …" and the transcript meta
  read it as the current process's figure, so the carried spend lives in new fields rather
  than changing a field other surfaces already read that way.
- **The caps are settings (one value for every agent) in this milestone.** A per-agent cap
  set on one node needs its own verb and all four doors. A hold also belongs in the
  decision queue with "allow more" or "stop", not only in the composer's refusal. Both
  are M351, and the ledger split them here to keep this milestone to one subsystem (the
  agent runtime) and its contract.

## Checks

`verify:agent-session`, new:
- `cap.meter.1`: 0.5 in one process, then 0.2 in a new one, is 0.7. `costUsd` stays 0.2,
  an unpriced agent has no meter, and the canvas budget refuses on the carried figure.
- `cap.context.1`: a message's four token classes are summed into one context figure. It
  is set, not summed across records, and three repeated block records say the meter once.
- `cap.hold.1`:
  - a crossing message interrupts its turn once, and nothing is killed;
  - the hold is set once, with its figures;
  - the queued message stays queued, and nothing is dequeued;
  - a send is refused with the transcript unchanged.
- `cap.release.1`: raising the cap releases the agent at the next send. The held message is
  written to the agent first, and the new one queues behind it.
- `cap.usd.1`: the spend cap holds at the result with nothing interrupted, the auto run
  goes stuck with reason `cap`, and the refusal is `refused-cap`, not the budget's.
- `cap.words.1`: both sentences carry their figures and name the setting.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 724.0s: 59/61 suites, and
every red is the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

The plain tier was green in wave 1, including `verify:agent-session` 172/172 and
`verify:meta` (the load-bearing entries and this ledger's README row). `verify:visual` was
not run for this milestone: nothing it renders changed (the two new settings rows appear
only in a settings search). It runs after M351, which lands on top.

## Owed

- **M351–M352 (proposed): a per-agent cap.**
  - M351: an agent's own caps on its chat panel's record, read by main from its own copy
    of the layout.
  - M352: `cap-agent`, the verb with all four doors. The Inspector's Work tab (the
    canvas door) shows the meter's rows (spend of cap, context of cap), with a golden.
- **M355 (proposed): the decision.** A held agent becomes a `cap` kind in the decision
  queue (`task-queue.ts` / `decision-inbox.ts`), with "Allow $N more" and "Stop".
- **Measure `total_cost_usd` across a resume by hand.** The carry rests on the field's
  contract ("cumulative for the current process"). The load-bearing entry's figures are
  from ONE process. If a resumed claude process reported the conversation's whole cost,
  the carry would double count. That needs a real claude, a paid turn, an exit and a
  `--resume`: a manual-only check for someone with an account.
- **A node's spend does not survive an app relaunch.** Nor did M82's canvas spend. The
  transcript meta already stores `costUsd` per turn (`agentTranscripts.appendMeta`), so
  `create` could seed `priorUsd` from it. Proposed M354, with the question of whether a
  relaunched canvas's budget should start from zero, which is a product decision.
- **codex reports usage per turn only**, so its context is not measured and its context cap
  never crosses. Its spend is unpriced too. Both say "unknown", never "under".

Next: M351 (Arc 2.3 — an agent's own caps on its chat's record, read by main from its saved
layout and re-read on every save).
