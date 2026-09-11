# M211–M212 — D12 artifact provenance and accepted decisions

The [D12 guide](../product-development-guide-2026-09-08.md#d12--preserve-artifact-provenance-and-capture-decisions),
[spec](../superpowers/specs/2026-09-10-m211-m212-d12-artifacts-decisions.md), and
[plan](../superpowers/plans/2026-09-10-m211-m212-d12-artifacts-decisions.md) define this close.
Built in its own worktree, `d12-artifacts-decisions`, from `main` at `f9a63d14`.

## What landed

- An image's optional `artifact` provenance is separate from its title and bytes.
  Captures retain capture id, URL and time; old image records remain absent, and a
  malformed or unknown provenance field drops with a warning while the image stays.
  The image inspector shows the capture URL and identity after a rename.
- An assistant text row has an explicit **remember** action. It previews the
  exact text and repository-memory scope, then writes only after confirmation.
  The existing main-owned memory store scrubs it and persists conversation, turn,
  dispatched-task (when known), and acceptance time. Cancel writes nothing.
- Renderer/layout copy paths preserve provenance, including save/load and a
  rename. No artifact panel, source-log copying, or asset-byte policy was added.

## Evidence

**run** `npm run verify` exit 0 — all 42 suites, build, and real-Electron tier.
The fresh worktree temporarily linked the repository's existing `node_modules`
for Electron's local tools; the link was removed afterward.

**run** `npm run verify:visual` exit 0 — no golden changed. The new confirmation
appears only after an explicit person action, so no baseline was re-written.

**run** `npm run verify:packaged` exit 0.

The D12 checks are scoped: `artifact.provenance.1`, `artifact.inspector.1`,
`memory.decision.1`, and `decision.source.1`. They cover old/malformed data,
rename-safe capture identity, source-id separators, redaction, restart reads,
and the known task relation.

## Owed

The existing manual checks for v10 still apply. A person should additionally
exercise remembering a real multi-paragraph answer and inspect the repository
memory panel after relaunch; no test sends a real agent answer or exposes a
private repository in a golden fixture.
