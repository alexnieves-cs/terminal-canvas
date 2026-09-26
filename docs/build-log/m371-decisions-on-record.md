# M371 — a cap set and a proposal answered are decisions on the record

**Verdict: shipped (the renderer's two; share decisions are owed).** Owed by M369. The
decision audit mirrors every person-sourced ledger row. Two decisions a person makes on
this canvas wrote no row at all, so they reached neither the ledger, the task's history,
nor the audit:
- **a cap set on an agent** (`cap-agent`, M352, including the queue's Allow, M357);
- **an agent's proposed review comment, kept or discarded** (M360).

Each now records one ledger row at its one writer. A person's cap change is
`source: 'person'` and reaches the audit, for example "Set claude — api's own caps — spend
cap $4.10". A door's lowering, by an agent's plan or a workflow node, is recorded as the
agent's ("An agent set …"). It is on the record, and it stays out of the person audit.
A proposal answer reads "Kept review seat's proposed comment on src/a.ts:12", or
"Discarded …".

## What landed

- **`capDecisionTitle`** and **`proposalDecisionTitle`** (`shared/decision-audit.ts`):
  one set of words each, for the ledger, the task's history and the audit.
- **`palette-actions/caps.ts`**: `capAgent` records a `session` event after a change
  lands, carrying the chat's task when it has exactly one (`taskOfPanel`). A refused
  change records nothing.
- **`review/TaskReviewPanel.tsx`**: Keep and Discard record an `artifact` event beside
  writing the comments. Recording is beside the work, never in front of it, so a
  failed record never fails the answer (`recordOrchEvent`'s rule).

## Decisions, and why

- **Recorded where the decision is made, through the existing door.** `recordOrchEvent`
  is how every other person decision reaches the ledger (#14's permission answers,
  M300's review marks), and M369 mirrors from there. There is still one path to the
  audit.
- **An agent's cap lowering is on the record as the agent's.** It is a real event,
  worth seeing in the task's timeline, but the audit is a person's decisions, and the
  source is what says whose it was.
- **Only a change that landed is recorded.** A cap refused by name (a door raising one,
  a bad value) wrote nothing and decided nothing.
- **`orch-record.ts` gains two named importers** (`verify:orchestration orch-timeline.6`,
  its list and its sentence): the cap verb and the task's review. The check pins the
  renderer's ONE door into the ledger's history to the writers that own a fact main
  cannot see, and a person's cap change and proposal answer are two such facts. The
  gate's first run caught the undeclared importers, which is what the check is for.

## Checks

- `verify:control audit.3`:
  - a person's cap title, an agent's, a kept proposal and a discarded one;
  - through a real store, the person's cap and the kept proposal land in the audit, and
    the agent's lowering does not.

  31/31. `verify:palette` 162/162 and `verify:review` 161/161 stay green.

No display changed (a ledger row and an audit row are records, not pixels), so
`verify:visual` was not run.

## Gate

`npm run typecheck` is clean. The first full `npm run verify` went red on
`verify:orchestration orch-timeline.6`, the two undeclared importers named above, and on a
`verify:relay relay.bp.*` backpressure flake. The relay suite passed 56/56 alone. With the
importer list extended, the rerun ran 59/61 suites in 778.8s, and every red is the
baseline:
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: its 230s watchdog fired under load (22.7). Rerun alone at load
  11.7, it finished inside its watchdog (headroom 79%) with the baseline `starter.1` and
  seven `workflow.*`, plus `onboarding.start.1`. That is a known load flake (the recorded
  reply did not arrive), and it passed alone.

## Owed

- **Workspace share and role decisions** (`main/share-control.ts`) are made in main,
  behind a person's dialog, and write no ledger row. Main would append a person row to
  the run ledger itself when the person confirms, so the same mirror reaches the audit.
- **No panels check drives a cap change or a proposal answer to the ledger.** The
  builders and the audit are checked in plain node, and the calls are one line each.

Next: M372 (the run ledger's person rows are scrubbed on their way to disk).
