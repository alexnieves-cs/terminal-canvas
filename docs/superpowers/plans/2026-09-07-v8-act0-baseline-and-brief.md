# v8 Act 0 — plan

Branch `m161-polish-brief`. Spec: `docs/superpowers/specs/2026-09-07-v8-act0-baseline-and-brief-design.md`.

1. **M161.** `npm run verify` at the start (tallies to the ledger); `verify:packaged`;
   `verify:visual` unchanged; read the goldens. Commit the prompt, `CLAUDE.md`'s section and
   the ledger (`docs(m161)`).
2. **M162 red.** `face.1` and `polish.1` appended to `scripts/verify-styles.cjs`; run it;
   both red; commit `check(m162)`.
3. **M162 green.** The four tokens; the face sweep over `src/renderer/styles.css` (the
   brief's inventory); `verify:styles` green, including 11 with `--bubble` as a ground.
   `npm run build`, `verify:visual`: every changed scene read and sentenced in the ledger,
   then `UPDATE_GOLDENS=1`. Commit `feat(m162)` with the goldens.
4. **Reviews.** A fresh-context critic and a fresh-context verifier over the act's diff, the
   brief and the ledger; the fix wave; the build log `docs/build-log/m161-m162-act0-brief.md`.
5. Close the act in the ledger; merge to `main`.
