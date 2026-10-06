# Lane L-C · 06 Navigate: Plan tier and the ⌘K palette

- Milestone: M444
- Branch: `rd/l-c-navigate`
- Wave: 2b, after `rd-wave2a`. You own `Canvas.tsx` in this wave, and only inside the `TierLayer` slot L-B left.
- Mockup: [06-navigate-palette.png](../mockups/06-navigate-palette.png)
- Checks: `npm run verify:rd-l-c`
- Shots: `rd-plan-palette` (34%, palette open on "plaid", ref 06), `rd-map` (18%, ref 06 — there is no separate map mockup)

## Goal

Zoomed out to 34%. Panels become status cards, and five task territories show. The palette is grouped (panels & tasks, commands, files) with fly-to and fit-task actions and kind filters. The Work/Plan/Map switch and the minimap sit with the zoom HUD.

Files. `Canvas.tsx` (only in the TierLayer slot L-B left), `canvas/card-detail.ts`, `tier-fade.ts`, `flight.ts`, `useViewport.ts` (only by adding to it; the setter stays private), `CanvasHud.tsx` (Work/Plan/Map switch), `MinimapOverlay.tsx` ("MAP · 5 TASKS"), `palette/Palette.tsx`, `palette-model.ts`, `commands.ts`, `fuzzy.ts`, `palette/commands/*`, `canvas/palette-actions/*`.

You own `src/renderer/palette/**` and `src/renderer/canvas/palette-actions/**` in this wave. L-E already landed `palette-actions/settings.ts`; extend it, do not rewrite the settings row's contract.

- Tiers use F2's `tierFor`. Work ≥70% shows live terminals. Plan (~25–70%) shows a card with name, state pill and one status sentence (from the state vocabulary and the agent's last line, e.g. "Writing tests for streamCsv"). Map <25% shows only territories, with labels and state dots. Cards come from `lod.ts` `cardIds`, so no session is ended or respawned (a pid-preservation check, the 145/148 shape).
- ⌘1/2/3 fly to each tier's target scale around the cursor or selection. ⌘0 fits all and ⌘⇧0 fits the selected task. Flights take 220ms with ease-out. Reduced motion lands in one frame (the existing reduced-motion scene still passes).
- The palette is grouped as PANELS & TASKS · COMMANDS · FILES, with match highlighting, a kind filter chip ("Everything"; Tab cycles kinds), and a row action ↵ fly to or ⌘↵ fit task. Footer key hints. The existing palette checks stay green (49d/49e drill-in, 72c hover stability).
- ⌘K belongs to the canvas unless focus lock is on (D4). `verify:palette` covers both.

## Prompt

Lane L-C (M444): screen 06 per GUIDE.pdf §7 L-C. lb-scout in parallel on `lod.ts`, `tier-fade.ts`, `card-detail.ts`, `flight.ts`, `useViewport.ts`, `viewport.ts`, `CanvasHud.tsx`, `MinimapOverlay.tsx` and the whole `palette/` directory (it follows canvas's layering rule). Tiers are presentation only: route cards through `lod.ts`'s `cardIds`; never change `LIVE_BUDGET`, `LIVE_MIN_SCALE` or dormancy precedence; entering Plan/Map releases focus (F2's helper). Mount only in L-B's TierLayer slot. Add pid-preservation checks for tier changes. Palette: restyle and regroup without renaming the classes `verify:panels` selects. Shot scenes `rd-plan-palette` (34%, palette open on "plaid", ref 06) and `rd-map` (18%).
