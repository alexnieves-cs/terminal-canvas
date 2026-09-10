# M246 plan — deck → .pptx

Spec: `docs/superpowers/specs/2026-09-10-m246-deck-pptx-export.md`.

1. **Checks first, watched red.** `scripts/verify-deck.cjs` + `deck-entry.cjs` (missing modules
   read as `{}`), fixture `scripts/fixtures/deck/demo.deck.md`; `verify:deck` in package.json.
   Observed: 0/11, every check red for its module's absence. `gate.2` red once
   `deck-export.ts` called `redactSecrets` unnamed.
2. `shared/deck.ts` — `parseDeck`, `unmappedName`, `deckExportSentence`, result types.
3. `FileSource.deck` + `parseFileSource` + both portable copy sites.
4. `main/deck-export.ts` over injected deps; `readImage` decides a picture; `pptxgenjs@4.0.1`
   pinned exact. `gate.2` names the file.
5. Channel `deck:export-pptx`: contract → `Exporters.deckPptx` (injected `DeckExporter`, so
   `export.ts` keeps pptxgenjs out of verify:file's bundle) → ipc handler → preload → the
   `index.ts` dialog with a pptx filter. CLAUDE.md list, README diagram, verify:ipc 135.
6. Doors: `export-deck` verb + `V9_DOORS`; palette `deck.export`; `usePaletteActions` case and
   action; `PanelMarks.deck` + the ⋯ menu section; `FileNode` kind word; a deck paints as prose.
7. Alias settled by building: main's `@shared`-only alias bundles, pptxgenjs externalised.
8. Docs: build log, README row, load-bearing entry, ledger line.
