# M201 plan — local review readiness as a fact

Spec: [2026-09-09-m201-review-readiness.md](../specs/2026-09-09-m201-review-readiness.md).

## Task 1 — the checks, watched failing

`scripts/review-entry.cjs` gains one spread, `../src/shared/review-readiness`. Because naming a
module before it exists makes esbuild fail to resolve the WHOLE bundle — so no check runs and the
red is not evidence (the entry's own header records this happening to its first draft) — the
module is created as a stub exporting nothing first, the checks are written and watched failing
against it, and only then is it implemented.

`readiness.1`–`readiness.5` in `scripts/verify-review.cjs`, ids and properties per the spec.
`work.readiness.1` in `scripts/verify-layout.cjs` for the persisted mark.

## Task 2 — `src/shared/review-readiness.ts`

Pure. Exports, in order:

- `ReviewHandoffState`, `ReviewStanding`, `ReviewHandoff`, `ReviewChanges`
- `reviewSignature(files: readonly ReviewFile[]): string` — sorted `path:added:removed:b:u`
  rows, FNV-1a, 8 hex chars. Deterministic, order-independent.
- `reviewStanding(mark, signature)` — three arms.
- `reviewHandoff(input): ReviewHandoff` — the priority ladder, one arm per state, each with its
  own `word`, `tone`, `detail` and `action`.
- `CheckAttribution`, `CommandEvidence`, `ReviewEvidence`
- `observedCommands(rows, lanePath, now)` — ledger rows inside the lane via `insideDirectory`.
- `reportedCommands(turns)` — `tool_use` with a string `command` input, paired to `tool_result`
  by `toolUseId`.
- `reviewEvidence(observed, reported, cap)` — merged list, failures first, overflow COUNTED.

Tones come from the existing vocabulary (`none`, `idle`, `working`, `needs-you`, `exited`) — no
new token, no styles change this milestone.

## Task 3 — the persisted mark

`PersistedWorkItem.reviewed?: { at, signature, files }` in `src/shared/work-items.ts`:
the interface, `carryWorkItem`'s field-by-field rebuild, and `parseOne`'s validation. A malformed
`reviewed` costs the FIELD and not the entry, following the `anchor` precedent one line above it.
`upsertWorkItem` keeps it (it is the user's, not the provider's) — it is already covered by the
`...found` spread, and the check pins that.

## Task 4 — `ReviewSubject.workItemId`

One optional field in `src/shared/review.ts`, with the `across?: true` comment's rule restated:
absent must survive every copy site. `makeReviewPanel`, `layout-adapt.ts`'s two arms and
`layout-schema.ts`'s `parsePanel` review arm carry it when present. Nothing reads it yet; M202
does.

## Task 5 — verification

`npm run verify:review`, `npm run verify:layout`, then `npm run verify`. Ledger and CLAUDE.md
updated; the signature's recorded bound written down in both the module header and the build log.
