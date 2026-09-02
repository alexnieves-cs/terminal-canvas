# M63 plan — the state vocabulary

Spec: `docs/superpowers/specs/2026-09-02-m63-state-vocabulary-design.md`.

1. **`panel-state.ts` check-first.** Write `verify:rail state.1/.2/.3` against the module,
   run red (module absent), implement, green. Restate the older rail checks' expected words
   (`dormant` → `asleep`, `pid N` → `running`).
2. **The rail.** `RailRow` carries `stateInput`; `RailPanelRow` computes the word; kind
   glyphs in the left column; pid gone. `verify:rail` signature/row checks restated.
3. **The frame and the card.** `data-tone` on `.pf`, the `::before` edge, the tone block in
   `styles.css`, `StatusBadge` → state word, the card's state line, summary word, block
   tone. `verify:styles tone.1` red first, then green.
4. **Popover, focus ring, strip.** Anchor and rows; `.panel--selected` to iris; `focus:` label.
5. **`verify:panels state-edge.1 / state-word.1 / state-popover.1`**, written red against
   the pre-M63 build (stash), then green.
6. **`tail()` rows as rows** in `session-factory.ts`; the card renders blank rows.
7. **Shot, look, critic, verifier; build log; verify chain; merge; branch.**
