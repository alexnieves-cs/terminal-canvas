# M57 — Semantic zoom

**Status:** designed 2026-09-02. Backlog #22, deprioritised by the scope
amendment but not cut.

## What this milestone is for

A card at 45% and a card at 8% render the same text tail; at 8% it is a grey
smear. The zoomed-out view is where you see everything, and it is the least
informative view in the app. The card should become LESS as you zoom out —
tail, then a summary, then a coloured block — from facts the `Panel` itself
holds, so a dormant panel (no buffer, no tail) has the same three renderings.

## Shape

### A render tier, not a session tier

`canvas/card-detail.ts` (pure): `CardDetail = 'tail' | 'summary' | 'block'`,
`nextCardDetail(current, scale)` with HYSTERESIS — enter `summary` below
0.26 and leave it above 0.32; enter `block` below 0.11 and leave it above
0.15 — so a pinch that hovers on a boundary does not flip the whole canvas
between two renderings (the same class of thrash `DEMOTE_DELAY_MS` and
`CULL_MARGIN_PX` prevent, cheaper here since nothing is destroyed, still
visibly bad). It is deliberately NOT a fourth state in `assignTiers`: that
function rations WebGL contexts and PTYs and is plain-node tested for that;
typography is a component-level decision below it, reading the same scale.
One value for the whole canvas (the scale is global), held as state in
`Canvas.tsx`, advanced by an effect on `viewport.scale`.

### The three cards

- **tail** (today, above 0.32): the terminal tail or the recorded lines.
- **summary** (0.11–0.26 entering): the panel's title in `--t-lg`, the
  agent state as a word, the last line of the tail or recorded log in mono,
  and the cost line. Every fact is on the `Panel` or in a store keyed by
  id — none needs an attached terminal.
- **block** (below 0.11): a filled block in the agent-state colour (idle,
  working, wants-you, exited), with the title in `--t-2xl` centred and
  nothing else. At this scale a card is a map marker.

The card carries `data-card-detail` so the harness reads the tier off the
DOM. `.panel__card-idle`'s exact text and `.panel__card`'s structure at
`tail` stay byte-identical: three verify:panels checks read them.

## What it must not break

- `lod.ts` unchanged; `verify:viewport` tier checks unchanged.
- The card's `tail` markup and the idle text.
- Dormant cards: the same three tiers from recorded lines + panel facts.

## Verification

- `verify:viewport detail.1` thresholds: tail above, summary between, block
  below, monotone; `detail.2` hysteresis: a scale oscillating inside a band
  keeps the current tier, and only crossing the far edge flips it.
- `verify:panels detail.1`: at the default zoom every card is `tail`;
  pinched to ~0.2 every card is `summary` and shows its title; at ~0.08
  every card is `block`; back at 1.0 they are `tail` again — and the idle
  text is unchanged throughout.
