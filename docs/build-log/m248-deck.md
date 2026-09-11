# M248 — deck: slides backed by Markdown, per-slide draft review, PDF export

Spec `docs/superpowers/specs/2026-09-10-m248-deck.md`, plan `docs/superpowers/plans/2026-09-10-m248-deck.md`.
The evidence, the critic's findings and the classification of every Electron-tier red against a
clean 7a3323d0 build are in `docs/build-log/m248-m250-ledger.md`.

What landed: `src/shared/deck.ts` (split, rebuild, LCS diff, `applyKept`, the view parser, slide
HTML), `src/shared/draft-review.ts` (generic), `src/shared/deck-session.ts`, `src/main/deck-pdf.ts`
+ `export:deck-pdf`, `src/renderer/file/DeckNode.tsx` + `deck-controllers.ts`, the `{ slides: true }`
option on `markdown.ts`, the `deck` creation entry and five `deck-*` verbs through all four doors,
and the executor's `origin` (palette = person, `runAgentPlan` = door).

Checks were written first (`scripts/verify-deck.cjs`) and watched failing against absent modules:
every check but the vacuous-until-present `deck.deps.1` was red before `deck.ts` existed.
