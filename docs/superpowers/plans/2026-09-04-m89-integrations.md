# M89 — The connector seam: plan

Spec: `docs/superpowers/specs/2026-09-04-m89-integrations-design.md`. Branch `m89-integrations`.

1. **Red first.** `verify:rail integrations.1` (the pure model), `verify:credentials
   rejected.1` (the mark set and cleared), `verify:palette integrations.1` (one sentence),
   `verify:panels integrations.1` (the pane's states and rows).
2. `integration-model.ts`; `rejectedAt` through the store and the verify handlers;
   `broker:audit` in the contract and BOTH diagrams; the pane; the palette door.
3. `npm run shot`: an `integrations` scene. Critic, verifier, triage, build log, documents;
   `docs/dead-end-audit.md` gains the page.
4. `npm run verify` alone; `graphify update .`; commit; merge; branch `m90-…`.
