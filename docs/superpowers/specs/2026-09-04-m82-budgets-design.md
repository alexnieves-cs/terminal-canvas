# M82 — Budgets and queues that stop work

**Status:** design, 2026-09-04. **Branch:** `m82-budgets`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 6, 7 (three states), 9 (a refusal names the fix);
2.0 principles 10, 11.
**Thesis sentence:** two ceilings the canvas actually enforces — how many agents may work at
once, and how much this canvas may spend — each refusing by name and each liftable.

## What this milestone is for

A canvas of agents spends money and CPU in proportion to how many are working, and nothing
in this app has ever said no. M82 adds two ceilings, both settings, both re-read live:
`agents.maxConcurrent` and `agents.budgetUsd`. Neither hides a row or kills anything: a send
beyond the concurrency ceiling QUEUES with the reason; a send beyond the budget is REFUSED
with the reason and the fix; a terminal spawn beyond the ceiling is refused by the sheet with
a `start anyway`, because a terminal is the user's own hands and this app does not hold them.

## Design

### The manager's two arms (`agent-session.ts`; verify:agent-session)

- Deps gain `limits: () => { maxConcurrent: number; budgetUsd: number }` — `0` means no
  ceiling for either, which is the default and every existing fixture's behaviour.
- `send`: with `budgetUsd > 0` and the canvas total at or over it, the send is REFUSED
  (`'refused-budget'`) and nothing is stored — a refused message is not a turn. With
  `maxConcurrent > 0` and that many turns already in flight, the send is QUEUED even though
  this session is free, and the `queued` event carries `reason: 'concurrency'` so the panel
  can say which queue it is in.
- The canvas total is the sum of the sessions' own `costUsd` — the CLI's cumulative figure,
  the same number the panel shows. A session with no figure counts as nothing (never as
  zero-with-confidence: it is simply not yet priced).
- When a result lands and the total crosses the budget, every session with a turn in flight
  is INTERRUPTED (M71's interrupt, not a kill) and a `budget` event is emitted once per
  crossing. Terminal agents cannot be interrupted by this app and are not touched.

### The settings (`settings-schema.ts`; verify:layout)

- `agents.maxConcurrent`, number, default `0`, described as "how many agents may work at
  once — 0 is no ceiling"; `agents.budgetUsd`, number, default `0`, "stop this canvas's
  agents when their reported cost reaches this many dollars — 0 is no ceiling". Both in the
  Agents category, both read live through the store's getter (the M43 pattern).

### The surfaces

- **The composer**: a refused send shows the sentence with the fix
  (`over the $5 budget for this canvas — raise it in settings, or start a new canvas`); a
  send queued for concurrency says so (`queued — 3 agents are already working`).
- **The spawn sheet**: a terminal spawn while the ceiling is reached is refused by name with
  a `start anyway` control that spawns it regardless — a terminal is the user's own hands.
- **The status strip**: over budget, `over budget — $6.12 of $5.00`, in the exited tone.

## What it must not break

- Every existing fixture constructs the manager without `limits`; absent means no ceiling.
- `verify:agent-session`'s queue checks (an in-flight queue is unchanged; concurrency is a
  second reason for the same queue).

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A ceiling of 0 refusing anything; a budget of 0 stopping work | `verify:agent-session budget.1` |
| A refused send stored as a turn; a queued-for-concurrency send losing its reason | `verify:agent-session budget.1` |
| A crossing killing rather than interrupting; the event firing per result rather than per crossing | `verify:agent-session budget.2` |
| The settings absent from the schema or not numbers | `verify:layout budget.1` |
| The composer refusing without naming the fix; the sheet refusing with no way through | `verify:panels budget.1` |

## Manual-only, added

- A real budget crossing against a real `claude` (the cost figures are the CLI's own).
