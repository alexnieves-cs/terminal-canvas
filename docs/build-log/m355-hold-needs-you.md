# M355 — a held agent is a needs-you, with its own kind in the decision queue

**Verdict: shipped (the decision's words and where it goes; its answer buttons are
M357).** Arc 2.3. Since M350, an agent main holds at its spend or context cap had one
surface: a refused send in its own composer, and (from M352) the Work tab. Nothing told
a person who was not looking at it. A hold now arrives through every needs-you surface
the app already has:
- the attention store, the dock badge and the edge pips;
- ⌘J, and the OS notification ("claude is held at its $2.00 spend cap ($2.10
  reported)");
- the decision queue, as a `cap` decision in its own words, not "is waiting for your
  reply";
- Orchestrate's task list, whose row jumps to the agent, where the cap is raised.

Built 2026-09-26 in the worktree on top of M354, while M352's gate and M353's visual run
held the Electron lock.

## What landed

- **Main's approval tracker** (`main/approvals.ts`) keeps a held set beside the pending
  set, read from `meter` events that carry a hold. A panel needs you while it is in
  EITHER set:
  - entry to the union says `wants-you`, notifies and beeps once;
  - an answered question on a held agent says nothing;
  - a release says `idle`;
  - an exit says `idle` (the panel stays on the canvas), and a dispose says nothing;
  - the badge counts panels, not reasons.

  `resync` repeats `wants-you` for a held panel too. `heldIds()` is the held set.
- **`create` says a carried hold** (`main/agent-session.ts`). M354 seeds a relaunched
  chat's meter at `create`, which emits nothing, and the tracker hears only events. So
  a hold carried at `create` is emitted once as a `meter` event.
- **`holdWords(hold)`** (`shared/agent-session.ts`): a hold at rest-layer length after
  the agent's name, for example "is held at its own 150k-token context cap (160k in the
  conversation)". The queue row and the notification use it. `capSentence` keeps the
  fix for the composer.
- **`useHolds()`** (`chat/chat-store.ts`) publishes every held chat. It is rebuilt only
  when a hold starts, ends or changes its figures, so a streaming chat never
  re-renders the dock.
- **The `cap` kind**:
  - `decision-inbox.ts`: `InboxKind`, `InboxItem.hold`, and the row's context, which is
    whose cap it is and where it is raised. A held agent's pending question is still a
    permission first.
  - `useDecisionInbox.ts`: subscribes to the holds.
  - `task-queue.ts`: the kind, its rank (after a question, before a check), its words
    ("Stopped — …", "Raise designer's cap", "Raise the cap and what it kept goes first;
    leave it and it stays held, spending nothing more"), its affects line, and the
    remembered history across a relaunch.
  - `Dock.tsx`: the row shows its context.
  - `orch-task-board.ts`: a cap row JUMPS to the agent rather than opening the task's
    page.

## Decisions, and why

- **A hold is `wants-you`, not a new attention state.** The four density layers already
  have one needs-you word, and every surface lights on it with no code of its own. A
  hold is a stop until a person acts, which is what that word means. The queue says
  which KIND of needs-you it is.
- **The key stays the panel's (`q:<panel>`).** Attention has one row per panel, and a
  panel is a permission, a question or a hold, never two at once. A new prefix would
  have split a snooze or a first-seen time across a question that became a hold.
- **An exit clears the needs-you, but not main's hold.** A stopped agent is waiting on no
  one, so leaving it lit would be a phantom. Its next send is still refused until the
  cap is raised, because the hold is main's fact about money, not an attention state.
- **The Orchestrate row jumps to the agent.** "Raise the cap" is done on the agent's Work
  tab (M352's canvas door). Opening the task's page would land a person where no cap
  can be raised.
- **Over the file budget, knowingly.** This touches nine source files across two
  subsystems (main's attention tracker and the renderer's queue). Shipping the main half
  alone would have put a hold in the queue as "is waiting for your reply", a sentence
  that is false. The answer buttons were split off instead (M357).

## Checks

- `verify:agent-session hold.attention.1`:
  - entry says `wants-you` once and notifies once in the hold's own words (own cap and
    Settings cap both);
  - an answered question keeps a held agent waiting;
  - a release and an exit each say `idle`, and a dispose says nothing;
  - the badge returns to 0;
  - the REAL manager says a hold carried at `create`, so the tracker puts a relaunched
    held agent in the queue with no send.
- `verify:rail inbox.cap.1`:
  - a held chat is a `cap` item in `holdWords`' words, keyed `q:<panel>`, with whose cap
    it is and where to raise it as context;
  - a held agent's pending question stays a permission.
- `verify:rail queue.cap.1`:
  - a hold files under its agent's task as `blocked`, ahead of that task's review, with
    its why, next step, after and affects lines;
  - it is remembered and parsed back.
- `verify:orchestration board.cap.1`: a cap row jumps to the agent, with the queue's
  "Raise build's cap".

`verify:agent-session` 177/177, `verify:rail` 253/253, `verify:orchestration` 145/145.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 721.1s: 59/61 suites, and
every red is the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

No committed scene holds an agent, so `verify:visual` is not affected. The cap row is
painted and judged in M357's `queue-hold` scene, which adds its answers.

## Owed

- **M357 (proposed): the hold's answers in the queue.** "Allow $N more" (the verb as a
  person: `capAgent(id, '<limit + N>usd', 'person')`) and "Stop" (`agent:terminate`,
  which keeps the session and the hold). `Dock` needs `capAgent` and a terminate door
  passed in, with a golden of the row.
- **The panels harness has no held agent.** The row is checked in its pure builders, not
  as painted in the Dock. The M352 shot scene's pushes could seed a held agent for a
  `decision-inbox` golden with M357.
- **The composer does not show a hold at rest** (M352's owed item), unchanged.

Next: M356 (a resolved auto chip no longer pushes the chat header's controls past its
frame), then M357.
