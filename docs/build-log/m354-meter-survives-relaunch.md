# M354 — an agent's meter survives an app relaunch

**Verdict: shipped.** Arc 2.3. M350 carried an agent's spend across its PROCESSES, but not
across a relaunch of the app. A relaunch re-creates every chat by id, and each came back
unmeasured:
- quitting the app released every held agent;
- a capped agent got a fresh allowance at every launch;
- M82's canvas budget could be spent again after every launch.

A chat's meter now picks up where the last launch left it:
- its spend carried across every process it has run;
- its context at its last message;
- held at rest if either is already past its cap.

Built 2026-09-26 in the worktree while M352's gate ran, then landed on local `main` after
M353.

## What landed

- **`AgentTranscriptMeta.spentUsd`** (`main/agent-transcript-log.ts`), the carried figure
  (M350's `priorUsd + procUsd`). The runtime writes it beside `costUsd` on every
  `result` (`bootstrap/agent-runtime.ts`). The reader keeps it only when it is finite and
  not negative.
- **`carriedMeter(read)`** (`agent-transcript-log.ts`), pure. It returns:
  - the last meta line's `spentUsd`;
  - the context of the last assistant turn that reported usage, through M350's
    `contextTokens`.

  A figure never measured is absent, never 0.
- **`AgentSessionDeps.carried(id)`** (`main/agent-session.ts`), read once at `create`:
  - it seeds `priorUsd` and `context`;
  - it holds the agent at rest when a carried figure is past its cap;
  - it sets the meter key, so the next change is said and a repeat is not.

  The runtime passes `carriedMeter(agentTranscripts.read(id))`.

## Decisions, and why

- **Seed from `spentUsd`, a new field, and never from `costUsd`.** The last meta line's
  `costUsd` looks like the figure, and it is two different wrong things:
  - it is one process's cost, so it forgets every process before the last one;
  - `importSession` writes it for a conversation run in a terminal, outside this app, so
    seeding from it would count that spend against a cap set here.

  Files written before M354 have no `spentUsd`, so their spend starts unmeasured once,
  as it did before. That is the price of not guessing.
- **A relaunched canvas's budget does NOT start from zero.** The M350 ledger left this
  open as a product decision. M82's setting is labelled "Budget for this canvas", not "for
  this launch". A budget that resets when the app is quit lets it be spent once per launch.
  The spend of restored chats now counts, and the budget is released the way it always
  was: by raising it. A chat that is closed takes its log, and so its spend, with it. That
  was already true of a closed chat's live spend.
- **A carried hold is set at `create`, not only at the first send.** `holdAtSend` would
  refuse the first send anyway. Holding at rest means the Inspector's Work tab and the
  meter say the hold before a person types into a composer that will refuse them.
  Nothing is in flight at `create`, so there is nothing to interrupt.
- **Context is the last assistant TURN's usage**, which is its first record's figure.
  Main's live figure is set on every record of a message, and a message's records repeat
  one usage (M350), so the two agree. A codex turn reports no per-message usage and
  seeds nothing: unknown is never "over".

## Checks

- `verify:agent-session cap.carry.1`, through a real file round trip of the log:
  - the carried spend and the last reporting message's context are read, a turn with no
    usage is skipped, and the LAST meta line wins;
  - an imported conversation's meta (`costUsd` only) carries nothing, and a panel with no
    log carries nothing;
  - a re-created chat's snapshot says the carried figures and a hold under its $2 cap;
  - a send is refused with nothing spawned;
  - once the cap is raised, the next process's $0.30 adds to the carried $2.10, making
    $2.40. `costUsd` stays the process's own $0.30.

  With the seed at `create` removed, the check goes red. `verify:agent-session` 176/176.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 723.9s: 59/61 suites, and
every red is the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

The plain tier was green, including `verify:agent-session` 176/176 and `verify:meta` (this
ledger's README row and the load-bearing entry). Nothing it renders changed, so
`verify:visual` was not run.

## Owed

- **Measure `total_cost_usd` across a `--resume` by hand** (M350's owed item, still open).
  If a resumed claude process reported the conversation's whole cost, M350's carry would
  double count, and this milestone would carry the doubled figure across a relaunch.
- **M355 (proposed): the hold as a decision**, unchanged from M352.

Next: M355 (Arc 2.3 — a held agent reaches the decision queue with "Allow $N more" and
"Stop").
