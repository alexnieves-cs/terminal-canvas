# 00 — Reconciliation: the table repaired, the scope decided

**Summary:** `README.md`'s milestone table was repaired from the git history
(one number on two rows, eight shipped milestones with no row), the citations
that had to move with it were moved, and the next free number was fixed at
**M36**.
**Status:** finished (2026-09-01).

## What the repair found

- `M24` was on two rows. Jira writes merged first (`e9a105f`, 08-31 00:43);
  drawing links merged eleven hours later (`17d53c5`) and keeps its working
  title in the table's note. Drawing links is **M35** now. Every citation of
  the link-drawing milestone — source comments, `styles.css`, the verify
  suites' comments, `docs/load-bearing.md`, `docs/ideas-backlog.md`,
  `docs/verify-suites.md` — was moved; the Jira-writes citations were left.
  Spec and plan files keep their `m24-link-drawing` names, which is the
  precedent M22 (`m17-editable-file-panels`) and M18 (`m14-workspace-extras`)
  already set.
- `M10`, `M22`, `M25` and `M28` were described in `CLAUDE.md` and absent from
  the table.
- Five features merged with no number at all: machine cost (M29), groups
  (M30), broadcast input (M31), the diagnostics overlay (M32) and the Codex
  launch (M33), numbered in the order they reached `main`.
- Space-drag/middle-drag pan was built as "M26" while M26 (multi-select) had
  already landed; it is **M34**.
- The backlog's #35 entry claimed "done, M25"; M25 is functional links, which
  has its own spec. Groups is M30.
- The backlog's #8 entry credited agent modes to "M20"; that is M23.
- The interface-architecture spec calls itself "M23" and is unbuilt. It holds
  no number until it merges.

## Baseline

`npm run verify` on `main` at `9d84c88` was **red**: 201/202 in
`verify:panels`. Check 143 ("a drag from a carded panel selects it and starts
no marquee") runs immediately after check 142 marquee-selects nineteen panels,
and M26's rule that a press on an already-selected member keeps the selection
for a group drag means the card's press no longer narrows the selection to
itself. The check predates M26 and was never reconciled; both branches were
green in isolation. Repaired in M36 by clearing the selection before the card
press, so the check tests what its comment says — a card press draws no
marquee — rather than a rule M26 replaced.

## Decisions carried forward

- Numbers are minted at reconciliation for work that never claimed one; the
  table's own paragraph explains the order.
- The five landed backlog entries (#18, #21, #35, #68, #75) moved to the
  file's gone table, per its own rule.
- The 1.0 scope, including every backlog entry cut and why, is
  `docs/superpowers/specs/2026-09-01-v1-scope-decision.md`.
