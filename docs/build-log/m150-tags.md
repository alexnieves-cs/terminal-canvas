# M150 — tags on the vault's file lineage: build log

`main`, 2026-09-07, after Act III closed at `8ce16b1`. Spec:
`docs/superpowers/specs/2026-09-07-v7-act4-tags-design.md`; plan:
`docs/superpowers/plans/2026-09-07-v7-act4-tags.md`. The brief's first Act IV rank is "the
Obsidian panel on the M16/M22/M27 file lineage: wikilinks, tags, backlinks"; M85 had built
two of the three, so this milestone is the third, through the seams that exist — no new panel
kind (a note is a file panel in prose mode; a vault is many of them plus an index).

## Red

`check(m150)`: `verify:file tags.1` (the parser's arms: a line start, after a space, in
parentheses, nested `#a/b`; a heading, a bare number, a code span and a fence are text;
trailing punctuation is not the tag; positions exact), `tags.2` (the index's tag map, case-
folded, first line, once per note), `verify:styles tags.1` (the chip reads `--iris` and
declares no colour), `verify:panels product vault.tags.1` (the pane's TAGS rows with counts,
the filter through the search field, Escape, the note's chip from the other side). All four
watched red; product 57/58.

## Built

- `shared/vault.ts`: `parseTags` with the SAME `codeSpans` exclusion `parseWikiLinks` uses
  (one exclusion for both syntaxes), `TagEntry`, `VaultIndex.tags` filled in the same pass as
  the backlinks. The tag regex is Unicode-aware (`\p{L}\p{N}`), so `#café` is a tag.
- `VaultPane.tsx`: a TAGS section under the notes (none when the vault has none — absence,
  never a heading over nothing), rows by count then name, capped at forty with the rest
  counted; a `#name` in the filter field filters BY TAG through the index; a row press writes
  the tag into that field (and clears it on a second press); a `filterRequest` prop (tag +
  nonce) lands a chip's ask in the same field, so the filter is visible and clearable.
- `FileNode.tsx`: links and tags painted in ONE walk by offset; a tag is a chip
  (`data-file-tag`) whose click filters the pane through `onFilterTag`; `Canvas.tsx` opens
  the vault navigator on the way (`chrome.chooseNavigator('vault')`).
- One harness lesson: the pane's tag row is a `shellControl` on `.rail-row__main`, and the
  first cut of `vault.tags.1` dispatched its click on the row's `<li>` — `filtered: false`
  beside a chip that worked.

## Declined by name

Backlog #85: a note outside a vault (a second root and walk), front-matter `tags:` (a
second parser), tag rename (the first vault write), a tag graph.

## Green

file 83/83, styles 39/39, product 58/58 (75.0 s). The `vault` scene's fixture gained tags
(`#decision #tmux` on the flush-gate note, `#decision` on the tmux note) — and the golden
DID NOT MOVE: two chips and a TAGS section are a few lines of small text, about 15 % of a
32 px tile, under the suite's 35 % tile budget (jitter on a WebGL terminal reaches 23 %),
which is the suite's stated limit (`docs/verify-suites.md`). The fresh capture was looked
at instead: the TAGS rows sit under the three notes with `2` and `1`, and the chips paint in
the link family. `UPDATE_GOLDENS=1` now keeps a golden that still passes byte for byte —
the first update of this milestone rewrote all fifty-four for nothing, 14 MB of PNG. The critic and verifier over the diff, spec and checks
are recorded below.
