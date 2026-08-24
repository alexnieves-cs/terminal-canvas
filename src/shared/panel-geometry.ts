/**
 * Panel size floors. They live in shared/ rather than beside applyDrag
 * because two layers now need them: the renderer's resize math clamps to
 * them, and the shared layout validator rejects a persisted panel smaller
 * than one — a hand-edited file could otherwise produce a panel too small to
 * hold a terminal and too small to grab a resize handle on.
 */
export const MIN_PANEL_W = 200
export const MIN_PANEL_H = 160
