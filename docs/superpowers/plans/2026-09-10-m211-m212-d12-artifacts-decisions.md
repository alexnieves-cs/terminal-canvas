# M211–M212 plan — D12 artifact provenance and decisions

Spec: [2026-09-10-m211-m212-d12-artifacts-decisions.md](../specs/2026-09-10-m211-m212-d12-artifacts-decisions.md).

1. Add a pure, optional artifact-reference schema and parser coverage for absent,
   malformed, unknown, capture identity and rename-safe image provenance.
2. Carry capture URL/id into the ordinary image record without changing asset
   identity or image read/refusal behavior.
3. Extend the existing memory store and bridge with optional accepted-decision
   source metadata. Drive redaction, malformed old JSONL and restart reads under
   the plain-node file suite before wiring UI.
4. Add the assistant-text confirmation affordance and pass dispatched task context
   from the canvas. It previews text and repository scope, with an explicit cancel.
5. Run focused checks, the full verify gate, visual review/golden gate and packaged
   gate. Record the result and remaining manual checks in the v10 ledger/log.
