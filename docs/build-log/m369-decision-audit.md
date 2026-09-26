# M369 — the decision audit: what a person decided, scrubbed, outliving the ledger

**Verdict: shipped (the record and its read door; the decisions that record nothing today
are M371).** Arc 4, the audit trail. Nothing answered "who decided what, when" across the
canvas. The run ledger records a person's decisions beside every tool call and shell
command, and it keeps its newest 2000 lines, so a busy afternoon of agents trims the
morning's decisions away. A task's history keeps twelve per task. The broker's audit is
credential calls only.

The decision audit is that record:
- every person-sourced ledger row (`EventRow.source: 'person'`), mirrored by MAIN at the
  moment it lands in the ledger, into its own append-only file;
- the ring cap is ten times the ledger's (20,000 rows);
- each row's words are scrubbed on the way to disk, with the count on the row;
- it is read, newest first, with `tc audit [--limit N]`.

## What landed

- **`shared/decision-audit.ts`** (new): `DecisionRow`, `decisionOf(EventRow)` (a person's
  rows only, words clipped), `parseDecisionRow` (a malformed line costs itself),
  `DECISION_AUDIT_MAX`.
- **`main/decision-audit.ts`** (new): `createDecisionAudit`, the broker audit's shape
  (M87). `record` runs `redactSecrets` over the title and detail and keeps the count as
  `scrubbed`. `list` reads newest first, skipping and counting a torn line. It
  ring-trims through a temp file every 200 appends.
- **`bootstrap/stores.ts`** creates it at `userData/decision-audit.jsonl`.
  **`index.ts`**'s ledger writer records each row AFTER the ledger accepted it.
- **`tc audit [--limit N]`**: `cli/tc.ts` builds it, `control-protocol.ts` parses it
  (limit 1–1000), `control-handler.ts` answers from `deps.audit`, and
  `control-wiring.ts` reads main's store. It is read-only and socket-only, like `tc
  status`.
- **`redactSecrets`' named callers** gain `main/decision-audit.ts`, deliberately
  (`verify:verbs gate.2`, its sentence and its list).

## Decisions, and why

- **Mirrored from the ledger's one writer, not a second door.** Every person decision the
  app already records reaches main through `ledger:event`, and main is the only writer
  of this file. No renderer can add, edit or remove a decision by a channel of its own.
- **Recorded only after the ledger accepted the row.** A row the ledger refused is not a
  decision this app recorded, and the two records must agree on what happened.
- **Scrubbed on write, with the count kept.** A permission record can quote the command it
  allowed (`Allowed Bash — curl -H "Authorization: …"`). A decision log on disk is a
  disclosure surface, so it follows the rule: scrub, count, say the count.
- **A ring, ten times the ledger's.** An unbounded append-only file fills a disk. A trim
  is the oldest decisions leaving, never a row edited.
- **`tc audit` is readable from an agent's shell.** It is metadata, scrubbed, with no
  credential and no pane text. `tc status` already tells an agent more.

## Checks

- `verify:control audit.1`:
  - an agent's row is never kept;
  - a GitHub token in a permission record's command is scrubbed on disk, and
    `scrubbed: 1` rides the row;
  - rows read newest first, and a torn line is skipped and counted;
  - a store capped at 3 holds at most 8 lines after 204 appends, the newest first.
- `verify:control audit.2`:
  - `tc audit` and `--limit 5` build;
  - `--limit 0` and a stray word are refused by name, and the protocol refuses a limit of
    0;
  - the handler answers with the limit asked, and a window with no audit says so.

  `verify:control` 30/30.
- `verify:verbs gate.2` names the new caller. 29/29.

No renderer code changed, so `verify:visual` was not run.

## Gate

`npm run typecheck` is clean. The first `npm run verify` stopped after wave 1:
`verify:relay`'s backpressure checks `relay.bp.3` and `relay.bp.4` failed at a load of
about 15. This milestone touches nothing in the relay. Rerun alone, `verify:relay`
passed 56/56. The full gate was then run again: 722.6s, 59/61 suites, and every red is
the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

## Owed

- **M371 (proposed): the decisions that record nothing today.** A cap set or raised
  (`palette-actions/caps.ts`), a proposal kept or discarded (`TaskReviewPanel`'s
  `answerProposal`) and a workspace share or role change (`share-control.ts`) write no
  ledger row, so they cannot reach this audit. Each needs a person-sourced `ledger:event`
  at its one writer.
- **The run ledger's own person rows are written unscrubbed.** They are the same titles
  this audit scrubs (`main/run-ledger.ts` is not a `redactSecrets` caller). The ledger
  is a disclosure surface since M300 and needs the same scrub with a count, proposed
  M372.
- **A person-facing view of the audit.** `tc audit` is the door today. A palette scope
  or an Orchestrate page is its own milestone.

Next: M371 (the missing decisions reach the audit), then M372 (the ledger's person rows
are scrubbed).
