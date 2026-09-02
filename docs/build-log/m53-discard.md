# M53 — Discard, per file

**Status:** finished 2026-09-02.
**Branch:** `m53-discard`. **Spec:** `docs/superpowers/specs/2026-09-02-m53-discard-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m53-discard.md`. Backlog #51.

One line: each review-node row gains a discard that arms with a disclosure sentence, refuses
on a shared checkout and a lost baseline before any write, restores from the baseline into
the worktree only, unlinks what the baseline never held, and re-reads.

## What landed

- `shared/review.ts`: `ReviewDiscardRequest` (root, baseline, subject, paths) and a four-arm
  `ReviewDiscardResult` whose `discarded` carries restored/removed/failed together.
- `git-args.ts`: `buildLsTreeArgs`, `buildRestoreArgs` (`--worktree`, never `--staged`).
- `main/review-discard.ts`: `createReviewDiscarder({ run, peersInRepo, removeFile, isDirectory })`.
- `review:discard` through contract, preload, handler (inert default refuses) and `index.ts`.
- `review-node-model.ts`: `discard` mirrors `commit` — ready over every reported path
  (renames included), blocked by name on `shared`, none elsewhere.
- `ReviewNode.tsx`: the row control (`data-review-node-discard`), the armed sentence
  (`data-review-node-discard-armed`), confirm (`data-review-node-discard-confirm`), the
  outcome line, a refresh after. Styles with tokens; `--red` only on the confirm.
- Checks: `verify:review discard.1–7`, `verify:rail discard.1`, `verify:panels discard.1`
  (red first on the inert handler's refusal, then green with the harness wired), `verify:ipc` 63.

## Snags

- The panels check's first red was the honest one: the harness had no discarder, so the
  inert default's "discard is not wired" came back through the node's own outcome line —
  proof the UI path reaches main before the write path was ever wired.

## Not proven

- A restore under a running agent that is mid-write to the same file: the worktree is
  written under it by definition (#51's own constraint), and no check races one.
- `git restore` needs git ≥ 2.23 (2019); an older git returns `failed` with git's own
  message, which no check drives.
