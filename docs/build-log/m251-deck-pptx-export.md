# M251 — a Markdown deck, exported to .pptx

Spec: `docs/superpowers/specs/2026-09-10-m251-deck-pptx-export.md`.
Plan: `docs/superpowers/plans/2026-09-10-m251-deck-pptx-export.md`.

## What landed
- `shared/deck.ts`: the parse (slides on `---` outside fences, title, bullets with level and
  numbering, pictures, `Note:` notes, body) with every unmappable construct named per slide.
- `FileSource.deck?: true` — a view of a file, `prose`'s twin; parsed true-or-absent, carried by
  both portable copy sites.
- `main/deck-export.ts` over injected deps, the real pptxgenjs@4.0.1 (pinned exact). Scrubs field
  by field with `redactSecrets` and counts; pictures decided by magic number through M181's
  `readImage`, so a deck line pointing at a secret file embeds nothing and is reported instead.
- `deck:export-pptx` through `Exporters.deckPptx` (an injected `DeckExporter`, so `export.ts` does
  not pull pptxgenjs into verify:file's bundle); the save dialog filtered to `.pptx`.
- Four doors for `deck-export-pptx`; the ⋯ menu's deck section (`Export to PowerPoint…`, `Show as a
  deck` / `Show as a file`); the file frame's kind word `deck`; a deck paints as prose.

## Evidence
- Red first: `verify:deck` 0/11 before `deck.ts`/`deck-export.ts` existed; `gate.2` red once the
  exporter called `redactSecrets` without being named.
- Green: `verify:deck` 11/11 (a real .pptx unzipped: 4 slides, 2 notes pages word for word, 1
  picture in `ppt/media`, the planted `ghp_` token in no part, count 1 in the sentence, 3
  omissions named); `verify:verbs` 25/25 (`gate.2`, `closure.v9.1` with `deck-export-pptx`);
  `verify:layout` 255/255, `verify:file` 97/97, `verify:checklist` 16/16 unchanged; `npm run
  build` green with main's `@shared`-only alias.
- Alias settled by building, not by reading: main externalises dependencies and bundled clean.

## Known limits (named, not fixed)
- The slide view IS the prose view; there is no slide-by-slide renderer on the canvas.
- A picture inline inside a paragraph is read as its alt text, not embedded.
- The `Show as a deck` toggle is not an undo step (the `setChecklistView` precedent).
- Not yet exercised: a real click on the ⋯ menu item in `verify:panels`, and opening the file in
  Keynote/PowerPoint by hand — the zip's structure is checked, its rendering is not.

## Also fixed
- `verify:meta milestones.1` was red on `main` before this branch: M244's build log landed without a
  README row. The row is added here.

## Rebased onto M248's deck (2026-09-10) — this section supersedes "What landed" where they differ
M248 (another session, `m248-deck` 5eaf7cee) built THE deck: `source.deck: DeckView`, Marp front
matter, `<!-- notes … -->` speaker notes, `DeckNode`, per-slide draft review and a PDF export.
This branch had built its own model (`deck?: true`, `Note:` lines) and the two collided on the
same field and the same file names. By the user's choice, M248's model wins everywhere:
- DROPPED here: my `FileSource.deck` flag and its parse, my line parser, the ⋯ menu deck section
  with its Show-as-a-deck toggle, and the FileNode/file-node-model deck tweaks (M248 routes a deck
  to `DeckNode`).
- KEPT and ported: `shared/deck-pptx.ts` maps M248's `splitDeck` slides and
  `parseMarkdown(…, { slides: true })` blocks onto .pptx content — so the .pptx, the PDF and the
  DeckNode agree on slide boundaries, front matter and notes; the exporter, the field-by-field
  scrub and `gate.2`'s seventh name, and the report are unchanged.
- The verb is `deck-export-pptx` (palette `deck.export-pptx`), mirroring M248's `deck-export-pdf`;
  its canvas door is a **PPTX** button beside PDF in the deck's header. The suite is
  `verify:deck-export` (M248 owns `verify:deck`), bundled to its own output file.
- `verify:ipc` pinned to 137: M248's `export:deck-pdf`, then `deck:export-pptx`, `tool:generate`.
- M248's list items are flat, so bullets carry level 0; nesting is not claimed.

Evidence after the merge: both typechecks clean; the whole plain-node tier green suite by suite
(31 suites — `verify:deck` 44/44 is M248's, `verify:deck-export` 11/11, `verify:tool` 11/11,
`verify:verbs` 26/26, `verify:meta` 45/45; `verify:palette` and `verify:styles` green because
M248's fixes for the base's reds came with the merge). The Electron tier on the merged tree is
owed, behind the shared `/tmp/tc-electron-lock`.
