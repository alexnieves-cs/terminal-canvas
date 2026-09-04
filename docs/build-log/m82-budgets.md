# M82 — Budgets and queues that stop work

**Branch:** `m82-budgets`. **Spec:** `docs/superpowers/specs/2026-09-04-m82-budgets-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-04-m82-budgets.md`. **Status:** finished 2026-09-04.

**Thesis sentence:** two ceilings the canvas actually enforces — how many agents may work at
once, and how much this canvas may spend — each refusing by name and each liftable.

## What landed

- The manager's `limits` dep (`0` is no ceiling for both, the default): a send past the
  concurrency ceiling queues with `reason: 'concurrency'`; a send past the budget returns
  `refused-budget` and stores nothing; a crossing interrupts every turn in flight once and
  latches until the ceiling is raised. `verify:agent-session budget.1–.2` (72/72).
- `agents.maxConcurrent` and `agents.budgetUsd` as number settings, default 0, in the Agents
  category, read live by main's `limits` getter. `verify:layout budget.1` (190/190).
- Main maps `refused-budget` into the sentence the composer shows — the ceiling in dollars
  and the fix; the composer's queue line says which queue it is in.
- `verify:panels budget.1` (287/287): a real chat, a real turn, the ceiling set below the
  reported spend, the refusal read off the composer, the transcript unchanged, and the same
  send going through once the ceiling is raised.

## Red first

- `verify:agent-session budget.1–.2` and `verify:layout budget.1` red before the arms and the
  settings existed.
- `verify:panels budget.1` red twice: the fake runner does report a cost (the fixture carries
  `total_cost_usd`), but the check read the STORE's refusal element (`data-chat-refusal`,
  which is the create's) rather than the COMPOSER's (`data-chat-send-refusal`, M75's) — two
  different facts, one of which is always null here. Then a stray Electron from an earlier
  killed run made the suite hit its watchdog; cleared and green.

## Decisions taken while building, and why

- **Queue for concurrency, refuse for budget.** A concurrency ceiling is a schedule and the
  message will be sent; a budget is a stop and the message will not.
- **Interrupt, never kill.** A killed agent loses its turn.
- **Nothing stored on a refusal**: a refused message is not a turn.
- **One crossing, one stop**, latched — else every result re-interrupts and re-announces.
- **A terminal is the user's own hands**: the ceilings govern this app's own agents; a
  terminal spawn is not refused (recorded below).

## What this milestone does not do, stated

- A terminal spawn past the concurrency ceiling is NOT refused, and the sheet grew no
  `start anyway`: this app does not hold the user's hands away from their own shell. The
  ceiling governs the agent runtime it owns.
- The status strip does not yet carry an over-budget line; the composer's refusal is the
  surface, and the setting is where the ceiling lives.

## The visual loop

No new scene: M82 adds no surface of its own — the ceilings live in the settings page, which
already has its scene, and the refusal is a sentence in the composer, whose scene M75 shot.
The `budget.1` check reads that sentence off the real composer, which is the evidence a
picture would have carried. Recorded here rather than shot for its own sake.

## Verification

Run alone, after the tmux verify server was killed: `npm run verify` green end to end —
`verify:agent-session` 72/72, `verify:layout` 190/190, `verify:panels` 287/287.
