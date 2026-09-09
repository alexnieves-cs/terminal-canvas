# M195 plan — D03, preview ownership

The spec is [2026-09-08-m195-preview-ownership.md](../specs/2026-09-08-m195-preview-ownership.md).
Ordered so that each step's checks can be watched RED before the code that turns them green, and so
that no step leaves the tree unbuildable.

## 1. The pure rule (red first)

1. Write `preview.bind.1` and `preview.bind.2` in `verify:file` against exports that do not exist
   yet; run `npm run verify:file` and record the red (the entry must MISS the export rather than
   throw, so every check below still runs — the suite's existing `has` guard shape).
2. `src/shared/preview.ts`: `PreviewBinding`, `normalisePreviewPath`, `pathInsidePreview`,
   `previewReloadDecision`, `previewSourceLine`. No node import; the comment names why.
3. Green.

## 2. The record and the parser (red first)

4. `browser.preview.1` in `verify:layout` against a parser that ignores the field: red.
5. `PersistedBrowserPanel.preview` in `layout-schema.ts` with the five parse arms; `BrowserPanel.preview`
   in `panels.ts`; carry the field at every by-name rebuild (`layout-adapt.ts`, `panels.ts`,
   `makeBrowserPanel`). Grep for `kind: 'browser'` to find every copy site.
6. Green.

## 3. The filter (red first)

7. `preview.bind.1` in `verify:panels:product`: two servers, two bound panes, one unbound; red
   against the current node-side subscription (which reloads all three).
8. `renderer/browser/usePreviewReload.ts`; delete the effect from `BrowserNode.tsx`; call the hook
   from `Canvas.tsx`.
9. Green.

## 4. The binding doors

10. `preview-bind` in `verb-table.ts` (`actions: ['bindPreview']`), `V9_DOORS` row, `PaletteActions.bindPreview`,
    the palette row `preview.bind` in `commands.ts`, the executor arm in `usePaletteActions.ts`,
    `bindPreview` in `Canvas.tsx`, and the binding written by `openPreview`.
11. `closure.v9.1` and `closure.1` must stay green with no edit to either — that is the door check
    doing its job. Run `verify:verbs` and record.

## 5. The surfaces

12. `BrowserNode.tsx`: the source readout and the Bind/Change control in the existing
    `.browser-node__preview` row (present-and-disabled with a reason, never removed).
13. `inspector-fields.ts`: the browser arm's three provenance fields; `preview.source.1` in
    `verify:rail`, red first.
14. `styles.css` only if the row needs it — no new token unless both theme blocks get it.

## 6. The gate

15. `npm run typecheck`, then the touched suites, then `npm run verify` whole.
16. `npm run verify:visual` under the SYSTEM `TMPDIR`; look at every changed scene; write the
    critic's sentence BEFORE `UPDATE_GOLDENS=1`.
17. `npm run verify:packaged`.
18. A fresh-context critic on the implementation and one on the checks; every finding verified
    against source before it is accepted or declined.
19. The build log `docs/build-log/m195-d03-preview-ownership.md` and the ledger row.
