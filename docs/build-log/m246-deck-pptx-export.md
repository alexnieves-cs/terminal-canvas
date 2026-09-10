# M246 — a Markdown deck, exported to .pptx

Spec: `docs/superpowers/specs/2026-09-10-m246-deck-pptx-export.md`.
Plan: `docs/superpowers/plans/2026-09-10-m246-deck-pptx-export.md`.

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
- Four doors for `export-deck`; the ⋯ menu's deck section (`Export to PowerPoint…`, `Show as a
  deck` / `Show as a file`); the file frame's kind word `deck`; a deck paints as prose.

## Evidence
- Red first: `verify:deck` 0/11 before `deck.ts`/`deck-export.ts` existed; `gate.2` red once the
  exporter called `redactSecrets` without being named.
- Green: `verify:deck` 11/11 (a real .pptx unzipped: 4 slides, 2 notes pages word for word, 1
  picture in `ppt/media`, the planted `ghp_` token in no part, count 1 in the sentence, 3
  omissions named); `verify:verbs` 25/25 (`gate.2`, `closure.v9.1` with `export-deck`);
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
