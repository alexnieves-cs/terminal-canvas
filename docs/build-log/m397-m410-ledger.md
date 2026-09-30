# M397–M410 ledger — make the daily loop feel obvious

Run prompt: [2026-09-30-ux-critique-run-prompt-gpt61-sol.md](../superpowers/specs/2026-09-30-ux-critique-run-prompt-gpt61-sol.md)
(written for GPT 6.1 Sol, run by Claude Opus 5.5 as lead with subagent builders and fresh-context critics).
Branch `m397-daily-loop` off main `6362a94e`. **This ledger is the state.** Reread it after a compaction.

Commit trailer: the prompt asks for `Model: GPT 6.1 Sol`. This run was NOT made by that model, so commits carry
the Claude co-author trailer instead. Writing the wrong model's name would be a false record.

Baseline reds (from the M396 gate): `verify:panels:agents template.1`, `verify:panels:product starter.1`,
`verify:visual starter`. `starter` is expected to change (A1, A2).

## Plan (finding IDs → milestones, grouped by the files they touch)

| M | IDs | Area |
|---|---|---|
| M397 | A1, A4, A8, A11 | styles: note editor height, terminal scrim, menu layer, type scale |
| M398 | A2, A3 | shot fence, subagent watcher (main) |
| M399 | A5, A6, A7, A9, A10 | wheel yield, palette freeze, dismissal, search, disabled reasons |
| M400 | B1 | one task form behind every door |
| M401 | B2, B3, B9 | review: merged state, sizing, one reviewed notion |
| M402 | B4 | one placement rule |
| M403 | B5, B6, B7, B8 | permission line, progress strip, return notice, ask a question |
| M404+ | C/D by impact per risk | decided after Wave B; skipped IDs listed with reasons |
| last-1 | critique → one fix batch → confirm | |
| last | gate | |

Machine rules: at most two app instances (slots 1–2, CDP 9210/9220); one Electron verify tier at a time via
`/tmp/tc-electron-lock` (a DIRECTORY: `mkdir` to take it, `rm -rf` only one you made). Builders run one at a time in
this checkout. Screenshots go to `/tmp/tc-daily-loop-shots/<ID>-{before,after}.png`.

## Milestones
