# M351 — an agent's own caps, on its chat's record, read by main

**Verdict: shipped (runtime and record; the verb is M352).** Arc 2.3. M350's caps were one
Settings value for every agent. An agent can now carry its OWN spend and context caps on
its chat panel's record. They stand over the Settings defaults figure by figure, and 0
means "no cap for this agent" even over a Settings cap.

Main reads them from its own copy of the layout, never from a renderer's claim. It
re-reads them the moment one can change (a layout save, or a cap setting set):
- a cap raised above a held agent's figure releases it at once, and what it held goes
  first;
- a cap lowered under an idle agent's figure holds it;
- a cap lowered under a turn in flight interrupts that turn.

The meter now carries the caps in force and says whose each is, so every surface shows
the figure main enforces.

Built 2026-09-26 in the worktree while M350's gate ran, then landed on local `main` after it.

## What landed

- **`AgentCaps`** (`{ usd?, contextK? }`), **`NodeCapsView`** (the caps in force plus
  `ownUsd` / `ownContext`), and the pure **`effectiveCaps(own, defaults)`** and
  **`parseAgentCaps`** (`shared/agent-session.ts`). `NodeMeter.caps` is present whenever
  any cap is set anywhere.
- **`ChatSource.caps`** (`shared/chat-panel.ts`). It is parsed in
  `layout-schema/panels.ts`: each figure must be finite, non-negative and inside its
  setting's range, and unknown keys are not carried. A malformed record warns and is
  dropped with the chat kept, so the Settings caps apply. `carryChatMarks` carries a
  FRESH copy through every by-name copy site.
- **Main asks per agent** (`AgentSessionDeps.caps(id)`). `bootstrap/agent-runtime.ts`
  finds the chat's record by id in any workspace of `layoutStore.current()` and lays it
  over the two settings.
- **`capsChanged()`** (`main/agent-session.ts`), called from `ipc.ts` after
  `layout:save` stores the layout and after `settings:set` stores either cap setting.
  For each agent:
  - a crossing goes through `enforceCap`, which holds the agent and stops a turn in
    flight;
  - otherwise `holdAtSend`'s release half runs, serving what the agent held, first and in
    order;
  - then the meter is said again.

## Decisions, and why

- **Main reads the record it SAVED, not a value the renderer passes.** A cap passed on an
  IPC call is a renderer's claim about a record. Main already holds the saved layout,
  and presence reads panel titles from it the same way (`presence-wiring.ts`), so the cap
  enforced is the cap persisted. That also means no new channel and no change to
  `agent:create`: an agent created before its cap was set is bound by it from the next
  save.
- **Figure by figure, and 0 is a value.** "No spend cap for this one agent, but the
  canvas's context cap still applies" is a real setting a person makes. So `usd: 0` must
  survive the parse and must override a Settings cap. Absent means "whatever Settings
  says".
- **Re-read on every save, not only when a caps field changed.** A save carries no diff,
  and a check that only compares caps would have to keep a copy of every agent's last
  caps to compare against. The re-read is one pass over the sessions, it says a meter
  only when the meter changed, and a save is not a hot path.
- **A lowered cap interrupts a turn in flight.** A cap is a cap from the moment it is set.
  Waiting for the turn's own result would let a runaway tool loop run to its end.
- **Nothing the agent does calls `capsChanged`.** It runs on a person's save of the canvas
  or a person's setting.

## Checks

- `verify:agent-session`:
  - `cap.own.1`: an agent's own figures stand over Settings one by one, 0 is no cap for
    the agent, context is in thousands, and whose each is. An out-of-range figure is
    dropped.
  - `cap.changed.1`:
    - raising a held agent's context cap through `capsChanged` serves its held message
      AT ONCE;
    - lowering its spend cap under its figure while that message's turn is in flight
      interrupts it;
    - an unmeasured agent is never held;
    - the meter carries the caps in force with their owners.
- `verify:layout chat.caps.1`: 0 is kept, a negative or non-object `caps` warns and is
  dropped with the chat kept, unknown keys are not carried, and `carryChatMarks` carries
  a fresh copy.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 724.6s: 59/61 suites, and
every red is the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

The plain tier was green in wave 1, with `verify:agent-session` 174/174 and
`verify:layout` 283/283. `verify:visual` then ran over M350 and M351 together: 72/73, with
only `starter` red as before. Neither milestone moved a golden.

## Owed

- **M352 (proposed): the `cap-agent` verb with its four doors and the Inspector meter.**
  - An agent's own cap has no door yet: only its record carries one.
  - The verb writes the record (`setPanels` + `commitHistory`, one undo), and the save
    reaches main through this milestone's hook.
  - The agent and workflow doors may only LOWER a cap. Raising or clearing one is a
    person's decision, refused by name through a door (`origin: 'door'` in the
    executor), or the cap binds only as long as the agent agrees to it.
  - `capSentence` should say "this agent's own cap" when the hold is under an own cap.
- **M355 (proposed): a held agent as a decision in the queue**, with "Allow $N more" and
  "Stop".

Next: M352 (Arc 2.3 — the `cap-agent` verb with all four doors, a door that can only
tighten, and the meter and caps on the Inspector's Work tab).
