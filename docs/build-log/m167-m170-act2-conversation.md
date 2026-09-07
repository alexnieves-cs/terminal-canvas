# v8 Act II — the conversation (M167–M170): build log

Branch `m167-conversation`, 2026-09-07, from `main` at Act I's merge. Spec:
`docs/superpowers/specs/2026-09-07-v8-act2-conversation-design.md`. Plan:
`docs/superpowers/plans/2026-09-07-v8-act2-conversation.md`. Ledger:
`docs/build-log/m161-m179-ledger.md` (evidence, sentences, decisions).

## M167 — turns

`shared/markdown.ts` — a closed grammar (headings 1–3, paragraphs, lists, fences, inline
code / bold / italic / links; a table as its source in a fence, an image as its alt text),
a TREE the node maps to React, `plainText` for what a check reads. Red on a stub module
(`md.1`), then the parser. The user's turn is a bubble on `--bubble` at ≤ 75 % aligned right;
the assistant's is unboxed prose at the measure; the caps role labels are clipped to
accessible names; the time reveals on hover; the caret is a soft blink that reduced motion
stops. `verify:styles turns.1`.

## M168 — tool rows

`toolGroups` / `toolVerb` / `toolState` / `toolGroupLabel` (`chat-model.7`): one row per
call — the family's glyph in a soft tint, the verb, the target, a state pill — and
consecutive rows under one header collapsed by default with the rows kept in the DOM; any
verb on a hidden row reveals the group first, so a script's dispatched click and a person's
land on the same state (`tools.3`). The span is between the first and last STAMPED rows and
only past a second — every row of one turn shares its stamp, and `worked for 0s` said
nothing. The result well is capped at twelve lines with `show all`.

A chain-ordering slip is recorded in the ledger: the background job that committed
`feat(m168)` swept M169's half-finished edits in with `git add -A`, and its build failed on
them; the runs it went on to make used the M167 build. M169's plain-node checks had been
watched red before those edits; the split is recorded rather than rewritten.

## M169 — the composer

A rounded well anchored to the panel's bottom (a hairline, an inset shadow on `--bezel`, the
iris ring on focus); the chips row (`model` · `N skills` · `@ attach`); the textarea's rows
from `composerRows` (two to six); Send the one filled control, Interrupt in its place only
while a turn runs (present always for `codex.1`); the approval as a sentence and its verbs
in the well; `Message claude…`. `composer.1`, `composer-rows.1`.

## M170 — the agent card when it is a terminal

`agentHeader(spec, branch?)` over `chatHeaderLine` — one builder, so the two frames cannot
drift; a claude / codex / copilot terminal wears the chat's glyph beside its state dot and
the `folder · engine` line; a plain shell wears neither. `header.3`, `agent-card.1`.

## Goldens

33 scenes; a fresh-context critic walked every diff (its sentences are in the ledger). The
walk's own findings: the chips had inherited the M75 attachment chip's mono by source order;
an opened diff sat beside its row instead of beneath it.

## Reviews

(filled once the fresh-context critic and verifier have run over the act)
