# M373 — a workspace share decision is a person's row on the record

**Verdict: shipped.** Owed by M371. Sharing a canvas with an organization, opening a
shared workspace here, and setting or removing someone's role in one wrote nothing to the
run ledger. So they reached neither the ledger nor the decision audit (M369), though
"who was given access, and when" is exactly what an audit is for. Each now writes a
person's row where the change lands, in main:
- "Shared “Canvas” with Acme"
- "Opened the shared workspace “Canvas” here, as editor"
- "Made octo viewer of “Canvas”", or "Removed octo from “Canvas”"

The ids ride the detail (`share s1 · user u9`).

## What landed

- **`shareDecisionRow`** (`shared/decision-audit.ts`): the three decisions' words, with
  the ids in the detail. The row's run id is the share's (`share-<id>`), so every
  decision about one shared workspace reads back together.
- **`recordDecision(ledger, audit, row)`** (`main/decision-audit.ts`): the ledger first,
  then the audit's mirror only for a row the ledger took (M369's order), in one function.
  `index.ts`'s `ledger:event` writer uses it now, so main's own writers cannot keep that
  order differently.
- **`createShareDoors`** (`bootstrap/presence-wiring.ts`): `share`, `openShare` and
  `setShareMember` record after the change lands. The app's share dialog and `tc`'s
  confirm both reach these doors, so one place covers both.

## Decisions, and why

- **Recorded at the doors, not at the two callers.** Every change these doors make was a
  person's: the dialog in the app, or `tc`'s Cancel-default confirm (share-control.ts).
  Recording in `share-control.ts` would miss the dialog, and recording in the renderer
  would miss `tc`.
- **Only a change is a decision.** `openShare`'s already-open answer changes nothing and
  records nothing. A refused or failed change records nothing.
- **Beside the work, never in front of it.** The words need lookups (the organization's
  name; the member's login and the workspace's name for a role change). They run after
  the answer is returned. A failed lookup falls back to the ids ("user u9", "its
  organization"), and a failed record never fails the change.
- **`permission`, not a new event kind.** Of the ledger's kinds, a share is a decision
  about who may see or change something. A new kind would reach every timeline reader
  for one writer.

## Checks

- `verify:control share.audit.1`:
  - the four titles and the detail;
  - each row is a person's `permission` row under `share-s1`;
  - through a real ledger and a real audit, all four land in both, and a
    `share-s1` timeline read returns the four;
  - a ledger that throws gets `false`, and the audit is never touched.

  36/36. `verify:account` 61/61, `verify:presence` 33/33 and `verify:file` 114/114 stay
  green.

No display changed, so `verify:visual` was not run.

## Gate

At this commit: `npm run typecheck` is clean; `verify:control` 36/36, `verify:account`
61/61, `verify:presence` 33/33, `verify:file` 114/114 and `verify:review` 161/161 (its
"FAIL test/api.test.ts" is fixture output). The full `npm run verify` ran once for the
chain M366, M373 and M374; its result is in M374's ledger.

## Owed

- **The run ledger's `append` swallows its own write failure** (M52's queue ends in
  `.catch(() => {})`). So `recordDecision`'s refusal arm is reached only by a ledger that
  says it failed, and a failed disk write still mirrors to the audit. This predates
  M369. Making `append` report a failed write reaches every ledger writer. Proposed
  M374.
- **An account switch** (`tc use`, the menu's account picker) is a person's decision too,
  and records nothing. It changes who the app acts as, not who may see a workspace, and
  it is left for the audit's next pass.

Next: M362 (a proposal golden on a laned fixture task), or M374 (the ledger reports a
failed write).
