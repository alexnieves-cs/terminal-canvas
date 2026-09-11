# M246 plan — per-item draft review

Spec: [../specs/2026-09-10-m246-draft-review.md](../specs/2026-09-10-m246-draft-review.md).
Starts after M245 is gated and committed, so the two land as separate commits.

## Tasks
1. **Checks** — `scripts/verify-draft.cjs` + `scripts/draft-entry.cjs`, a suite of its own
   (`verify:draft`) so M245's suite stays M245's. Scoped ids `draft.generic.*` (on SLIDE ids —
   the proof the interface is not sheet-shaped), `draft.sheet.*`, `draft.door.*`,
   `draft.record.*`, `draft.disk.*`, `draft.restart.*`, `draft.export.*`. Watched red against the
   absent `sheet-draft.ts` and the session's absent draft API. (`draft-review.ts` was written
   just before its checks, so `draft.generic.*` go green at once — recorded, not hidden.)
2. **Generic module** — `src/shared/draft-review.ts`: `diffItems`, `stage`, `keep`, `discard`,
   `draftState`, `rebase`, `contentHash` (sync FNV; main's CAS guards the write itself).
3. **Sheet adapter** — `src/shared/sheet-draft.ts`: `SheetDraft`, `parseSheetDraft`,
   `applyDraftItems`, `sheetDraftSummary`, `sheetEditRoute(caller)`,
   `sheetReviewRefusal(op, caller)`.
4. **View + session** — `SheetView.draft?` / `draftOutcome?` through `parseSheetView`; the
   session gains `propose`, `keepDraft`, `discardDraft`, `rebaseDraft` and names conflicts by
   file and cell. Keep is one CAS write of only the kept cells; discard writes nothing.
5. **Doors** — the executor threads `caller` into `execute`; `sheet-edit` routes by
   `sheetEditRoute`; new verb `sheet-review <panel> keep|discard <range|all>` with four doors;
   `sheet-edit` leaves `TEAMMATE_REFUSED_VERBS` (proposing writes nothing).
6. **UI** — draft cells `is-draft`, old → new in the formula bar, a contextual strip with
   Keep/Discard (selection) and Keep all/Discard all, the header's "N changes" only when N > 0,
   Rebase when in conflict.
7. **Gate, critic, ledger.**
