# The v8 run — ledger (M161 →, 4.0.0 → 4.1.0)

Started 2026-09-07 at `7049dab` (`v4.0.0`, the head of the M134–M160 run). Unattended, goal
mode, on Fable 5.1. The run prompt is
`docs/superpowers/specs/2026-09-07-v8-product-polish-prompt.md`; its "goal condition" block is
what this file answers to. This file is the run's resumable state: the milestone map, each
act's status, every declined item with its reason, the golden scenes touched with the critic's
sentence each, and the evidence lines (command + exit code) the final message is built from.
Appended to, never rewritten. A session that resumes mid-run reads the LAST section and
continues; it rebuilds its understanding from this file, `CLAUDE.md`, the brief
(`docs/superpowers/specs/2026-09-07-m162-product-polish-brief.md`) and README's table, in
that order.

## Method, per milestone (the prompt's fixed shape)

spec in `docs/superpowers/specs/` → plan in `docs/superpowers/plans/` → red checks committed
and WATCHED red (`check(mNNN)`) → the feature (`feat(mNNN)`) → goldens regenerated with
`npm run verify:visual`, every changed scene LOOKED at and given the critic's sentence here
before `UPDATE_GOLDENS=1` → a fresh-context critic and a fresh-context verifier (subagents
that see only the diff, the spec, the checks and the docs) → the fix wave (`fix(mNNN)`) → the
act's build log → merge to `main`. Never two Electron chains at once; `tmux -L
terminal-canvas-verify-panels kill-server` before every Electron run.

## Milestone map

M160 is the last number used before this run (`docs/build-log/m160-reconcile.md`). Numbers are
assigned in order and never reused; a milestone that is declined keeps its number and says so.

| # | Act | One line |
|---|---|---|
| M161 | 0 | Baseline: `npm run verify` and `verify:packaged` at `7049dab`, the goldens regenerated unchanged, every golden read |
| M162 | 0 | The brief: `2026-09-07-m162-product-polish-brief.md` — references measured, the findings with dispositions, the face / rest / path / metrics rules, the new tokens; `verify:styles` checks per mechanical rule |
| M163 | I | The quiet header: glyph · title · state dot at rest; verbs and marks on hover/focus; machine cost to the inspector |
| M164 | I | The body's material: the UI face for prose, 14px/1.5, the 20px inset, the path rule in every body |
| M165 | I | Diffs as cards |
| M166 | I | The far view as a status wall |
| M167 | II | Turns |
| M168 | II | Tool rows |
| M169 | II | The composer |
| M170 | II | The agent card when it is a terminal |
| M171 | III | The rail as places |
| M172 | III | The dock and top bar |
| M173 | III | The status bar at rest says nothing |
| M174 | III | The launcher as a welcome |
| M175 | III | Palette and sheets |
| M176 | IV | Motion with intent |
| M177 | IV | Empty states as places |
| M178 | IV | The second full audit |
| M179 | IV | Reconcile: 4.1.0, README, CLAUDE.md, the release body, the tag |

Branches: `m161-polish-brief` (Act 0), `m163-frame` (Act I), `m167-conversation` (Act II),
`m171-shell` (Act III), `m176-finish` (Act IV), each merged to `main` at the act's close.

## Act 0 — M161 (in progress)

- Tree at start: `7049dab` plus two uncommitted doc files (the run prompt, untracked, and
  `CLAUDE.md`'s "What it is supposed to be" section, modified) — both the prompt author's, both
  committed as the first commit of Act 0. No source file differs from `7049dab`.
