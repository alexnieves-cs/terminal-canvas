# M69 — The overview

**Branch:** `m69-overview`. **Spec:** `docs/superpowers/specs/2026-09-02-m69-overview-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m69-overview.md`. **Status:** finished 2026-09-03.

## What landed

- **Every kind has a far view.** `CardDetailContext`, provided once at the world layer, is
  read by `PanelFrame`: below `SUMMARY_ENTER` a review, file, note, toolbox or Jira panel
  renders its title and its kind's word in place of its body; below `BLOCK_ENTER` a block in
  the kind tone with its title. The chrome row and the state edge survive every tier. The
  body stays MOUNTED under the far tiers, hidden (`.pf__keep[hidden]`), because a Jira
  comment draft lives in that subtree and a zoom must not discard typed work (the verifier
  found the first cut unmounting it). A prose file says `note`, through a `kindWord` the file
  node passes (the frame cannot tell prose from a kind).
- **`minimap.ts`**, pure and in the viewport bundle: one uniform scale fits every rect and
  the camera's world rectangle into the thumb with `MINIMAP_PAD` clear on all sides, centred;
  the inverse; the camera at the same scale centred on a point (derived through
  `screenToWorld`, so a change to the convention breaks `minimap.3` rather than the map).
- **The minimap** (`MinimapOverlay.tsx`), top-right of the canvas, outside `.world`, 160×100,
  a hairline on `--s-2`. One block per panel in its tone through the rail rows' state input
  and the agent-state store, so a bell recolours one block. After the critic: asleep is a
  DASHED empty outline, a sessionless kind a hairline outline, and a grey fill means exactly
  not-started; the camera rectangle drops to a hairline when it covers more than nine tenths
  of the map (it was the loudest object on a fitted canvas); an empty canvas shows no map.
  Click flies the camera through `goToViewport`; drag previews the rectangle and moves on
  release; a wheel over it yields; `canvas.minimap` (Shell, default on) removes it and applies
  on `settings:changed` without a palette opening.
- **The agent's hue is the left edge only.** `.panel--agent-busy/wants-you/exited` tinted all
  four sides; at 22% that read as a ring in the state colour. They are `--frame-line` now;
  the edge rule paints the left. A selected wants-you panel is iris like every other
  selection: M6d kept it amber so a jump would not hide the reason it landed there, and the
  reason is the edge now, which selection never paints over. Checks 62 and 97 read the left
  border. The glow pulse (`agent.glow`) is untouched.
- Below the summary band a subagent node's description is hidden (`.world[data-detail]`).

## Decisions not visible in the diff

- **Drag previews; release moves.** The spec said "live". A live drag needs the camera's
  setter, which `useViewport` keeps private on purpose (nothing outside should move the
  camera); the release goes through `goToViewport`, one trail entry. Spec amended in place.
- **The minimap occludes what is under it** (critic, finding 1 — the group fixture's
  header sat under it). Declined: the HUD, the strips and the pips occlude the canvas the
  same way, the canvas is infinite and pans, and docking the map inside the shell would
  hide it at the compact breakpoint the brief says it is for. Reduced to 160×100. Recorded,
  and the group scene's fixture is the one place it shows.
- **The terminal's summary keeps its last line and cost** (critic, finding 4); M63's
  decision, restated: one line is what makes a summary worth zooming out for.
- **Hidden while merged and at compact.** A read-only view has no camera of its own to
  move; a 1000px window has no corner to spare. Recorded (critic, finding 8; verifier, 21).
- **No `worldToMinimap` export** — the projection carries its offsets; the inverse is the
  public half. The spec named a function that the shape did not need.
- **`overview.1` has no review panel** — a review node needs a repository fixture; the
  file, prose file, toolbox and Jira kinds cover the frame path the review node shares.

## The critic

Eight findings. Fixed: 2 (asleep and kind marks), 3 (edge-only tint; iris selection), 5
(empty canvas), 6 (the rectangle's coverage rule), 4's notice half. Declined with a reason:
1, 4's summary half. Recorded: 7 (pips and blocks agree — kept both), 8. What works and was
left alone: the map reads as a map with no label; amber is only ever the one panel; hues are
the vocabulary and nothing else; the far-view titles are legible for every kind.

## The verifier

Twenty-five findings. Fixed: 1 (`note`), 8 (`minimap.1` asserts centring), 12 (`overview.2`
asserts every block's tone, and a prose file joined `overview.1`), 19 (bodies mounted).
Accepted as recorded: 5 (drag, above), 14 (a right-click on the thumb reaches the host — the
same as the HUD), 20 (`settings.list` on every change — cheap, bounded), 23 (the kind word's
colour is `--fg-2` now), 24 (the 22% scene already shows the map), 21, 22, 25.

## Checks

`verify:viewport minimap.1/.2/.3` (red first); `verify:panels overview.1/.2` (red first);
62 and 97 restated to the edge. `npm run verify` green, run alone, before the merge.
