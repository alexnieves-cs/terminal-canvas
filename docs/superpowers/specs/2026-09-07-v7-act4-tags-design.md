# v7 Act IV.1 — M150, tags on the vault's file lineage: design

Written 2026-09-07 after Act III closed. The brief's first Act IV rank is "the Obsidian panel on
the M16/M22/M27 file lineage: wikilinks, tags, backlinks". Two of the three are BUILT: M85 gave
a folder of notes `[[wikilinks]]` (strict, code spans excluded, an alias form), a name index
and BACKLINKS with line numbers, painted in the note panel (M27's prose file panel) and listed
in the Vault pane. What is not built is TAGS. That is this milestone, and it is deliberately
one thing done through the seams that exist, never a new panel kind — a note is a file panel
in prose mode and a vault is many of them plus an index (M85's ruling, kept).

## What a tag is

`#name` in a note's body — a `#` followed by a word of letters, digits, `_`, `-` or `/`
(Obsidian's nested form `#area/sub`), at a token start (preceded by start-of-text, whitespace
or `(`), NOT inside a code span or fenced block (the same `codeSpans` `parseWikiLinks` uses —
one exclusion for both syntaxes), and NOT a heading: a `#` at a line start followed by a
space is markdown's heading mark, and `#1` (a bare number) is an issue reference, not a tag.
Case-insensitive for matching, painted as written. Front matter is not parsed: a `tags:` key
in YAML is a second syntax and a second parser; declined by name, with the note that
Obsidian reads both.

## Where it lives

- `src/shared/vault.ts`: `parseTags(body): Tag[]` (`{ name, start, end }`, positions so the
  painter needs no second parse — the wikilink rule) and `VaultIndex.tags: Record<string,
  TagEntry[]>` (lower-cased name → the notes carrying it, with the note's path, title and the
  first line it appears on), built inside `buildVaultIndex` from the same pass.
- The Vault pane (`VaultPane.tsx`): a TAGS section under the notes — one row per tag with
  its count, sorted by count then name, capped at the pane's own row cap with the cap
  reported (M85's rule); pressing a tag row FILTERS the notes list to that tag and the
  pane's search field reads `#name` so the filter is visible and clearable (Escape or the
  field's clear). A vault with no tags shows no section — absence, not a heading over
  nothing. Reading and missing arms are the pane's existing three.
- The note panel (`FileNode.tsx`'s prose mode): a `#tag` in the body paints as a chip in
  the same family as a `[[link]]`, and pressing it filters the Vault pane (opening the pane
  if it is closed) — the one door, from either side.
- Nothing is written: tags are read from the body, never stored; the layout carries no tag
  record. The `vault.root` setting, the read cap and the `file:changed` re-read are M85's
  unchanged.

## Not this milestone (declined by name)

- Wikilinks and backlinks for a note OUTSIDE a vault (a lone `.md` in a repository): a
  "local vault" of the note's own directory is a second root and a second walk;
  `docs/ideas-backlog.md` gains an entry (#85) with the shape.
- Front-matter `tags:`; tag renaming (a write across notes); a tag graph. Each an entry
  under #85's heading.

## Checks (red first)

- `verify:file tags.1` (plain node, the vault bundle): `parseTags` over a fixture body — a
  tag at a line start, one after a space, one in parentheses, a nested `#a/b`, a heading
  `# Not a tag`, a bare `#1`, a tag inside backticks and inside a fence (both text), a
  trailing punctuation `#done.` (the tag is `done`); positions exact.
- `verify:file tags.2`: `buildVaultIndex` fills `tags` — two notes sharing a tag list both,
  case-folded, first line correct; a note with no tags contributes nothing.
- `verify:panels product vault.tags.1` (real Electron, the product part carries the M85
  pane checks): a fixture vault with three notes and two tags — the TAGS section lists
  both with counts, pressing one filters the list to its notes and puts `#name` in the
  search field, Escape clears; the note panel's chip does the same from the other side.
- `verify:styles tags.1`: the chip's rule exists and names no new colour (the link family).
- `verify:visual`: the `vault` scene gains tags in its fixture; its golden is updated in the
  same commit after looking (the M148 rule).
