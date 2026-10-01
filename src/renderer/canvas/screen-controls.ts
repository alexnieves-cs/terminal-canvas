/**
 * M408 follow-up (the critic's item 5). THE SCREEN-SPACE CONTROLS INSIDE
 * `.canvas` — every child of the canvas host that is not `.world` — carry
 * `data-screen-control` on their ROOT, and this one selector is what the
 * pointer's capture and bubble halves (useCanvasPointer) and the right-click
 * (useCanvasContextMenu) ask. A press on one is never a press on the world
 * beneath it: no link completed, no pan, no hit-test that selects the panel
 * under a HUD button, no ground menu over a notice.
 *
 * It was a CLASS LIST, written twice, and it was short: the task lens, the
 * reopen stack, the return briefing, the broadcast banner's Stop, the
 * presence column and the pack preview all bubbled into the world. A list
 * of classes is the shape that drifts — a new overlay is added beside
 * `.world` and nobody remembers the list — so the attribute is on the root
 * and `verify:panels:core screen.attr.1` walks `.canvas > :not(.world)` and
 * names any root without it. A pointer-events:none layer (the aura, the
 * presence canvas) carries it too: it is never a target, so it costs nothing,
 * and the walk has no exceptions to keep.
 */
export const SCREEN_CONTROL_ATTR = 'data-screen-control'
export const SCREEN_CONTROLS = `[${SCREEN_CONTROL_ATTR}]`
