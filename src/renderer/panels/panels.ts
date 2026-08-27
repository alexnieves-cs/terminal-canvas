import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import type { Point, WorldRect } from '@renderer/canvas/viewport'

/**
 * A panel is its geometry, its spec, and its paint order. cols/rows are
 * deliberately absent from the spec: they are not known until the panel is
 * attached and fitted, and inventing them here would reintroduce the
 * spawn-at-80x24 problem lazy spawning exists to avoid.
 */
export interface Panel {
  rect: WorldRect
  spec: PanelSpecTemplate
  /**
   * Paint order, rendered as style.zIndex. Stacking is NOT the array's order:
   * React reconciles a reordered keyed list by MOVING DOM nodes, and a move is
   * remove-then-insert, which would momentarily detach the subtree holding a
   * live terminal's host and its WebGL context. M3's eviction proves a
   * deliberate detach is survivable — dispose the addon, refresh on the way
   * back — but an incidental detach triggered by clicking an unrelated panel
   * does none of that. Keeping array order stable means React never moves
   * those nodes at all.
   */
  z: number
  /**
   * A name the user typed. Optional because most panels never get one, and
   * because the fallback chain below it (resolved command, then "login shell")
   * is what an unnamed panel is supposed to show — see TerminalPanel's header.
   *
   * It lives on Panel rather than PanelSession because it is layout, not
   * session state: it survives a relaunch, it belongs to the id rather than to
   * the process, and a panel that has never spawned can still have one.
   */
  title?: string
}

export const PANEL_W = 720
export const PANEL_H = 460

/**
 * `command` is deliberately omitted, not defaulted here. The renderer cannot
 * see the login shell: electron-vite compiles `process.env` in the renderer
 * bundle down to `{}`, so `process.env.SHELL` is always `undefined` and any
 * fallback beside it becomes the only branch that ever runs — a bash or fish
 * user would silently get zsh. An absent command means "the login shell", and
 * main fills it in from the environment it already probed. See PanelSpec.
 */
const shell = (panelId: string, cwd = '~'): PanelSpecTemplate => ({
  panelId,
  cwd,
  args: ['-l']
})

/**
 * Scattered well outside the initial viewport, exactly as M2's placeholders
 * were: panning to find something stays testable by hand, and culling has
 * something to cull.
 */
export const SEED_PANELS: Panel[] = [
  { rect: { id: 's01', x: 0, y: 0, w: PANEL_W, h: PANEL_H }, spec: shell('s01'), z: 1 },
  { rect: { id: 's02', x: 800, y: 0, w: PANEL_W, h: PANEL_H }, spec: shell('s02'), z: 2 },
  { rect: { id: 's03', x: 1600, y: 0, w: PANEL_W, h: PANEL_H }, spec: shell('s03'), z: 3 },
  { rect: { id: 's04', x: 0, y: 540, w: PANEL_W, h: PANEL_H }, spec: shell('s04'), z: 4 },
  { rect: { id: 's05', x: 800, y: 540, w: PANEL_W, h: PANEL_H }, spec: shell('s05'), z: 5 },
  { rect: { id: 's06', x: 1600, y: 540, w: PANEL_W, h: PANEL_H }, spec: shell('s06'), z: 6 },
  { rect: { id: 's07', x: -900, y: 270, w: PANEL_W, h: PANEL_H }, spec: shell('s07'), z: 7 },
  { rect: { id: 's08', x: -900, y: 810, w: PANEL_W, h: PANEL_H }, spec: shell('s08'), z: 8 },
  { rect: { id: 's09', x: 2500, y: 270, w: PANEL_W, h: PANEL_H }, spec: shell('s09'), z: 9 },
  { rect: { id: 's10', x: 400, y: 1100, w: PANEL_W, h: PANEL_H }, spec: shell('s10'), z: 10 },
  { rect: { id: 's11', x: 1200, y: 1100, w: PANEL_W, h: PANEL_H }, spec: shell('s11'), z: 11 },
  { rect: { id: 's12', x: 400, y: -640, w: PANEL_W, h: PANEL_H }, spec: shell('s12'), z: 12 }
]

/** The id the single first-run panel gets. Kept out of the `n` sequence Cmd+N uses. */
export const FIRST_RUN_ID = 'p1'

/**
 * What a fresh install — or a canvas that was reset — opens with.
 *
 * One panel at the world origin, deliberately a placeholder: the new-canvas
 * wizard milestone (count control, per-panel working directory, CLI picker)
 * replaces this. SEED_PANELS' twelve scattered entries stay put as verify
 * fixture data, which is what they have always actually been.
 */
export function firstRunPanels(): Panel[] {
  return [{ rect: { id: FIRST_RUN_ID, x: -PANEL_W / 2, y: -PANEL_H / 2, w: PANEL_W, h: PANEL_H }, spec: shell(FIRST_RUN_ID), z: 1 }]
}

/**
 * Cmd+N, and every preset spawn: a panel centred on the point it is given, on
 * top. That point is USUALLY where the camera is looking, but not always —
 * Canvas.tsx runs it through cascadeCentre (below) first, which steps it off
 * an already-occupied slot. Placement deliberately does not live here:
 * makePanel has no panel list and no business gaining one, and
 * verify:viewport 48 pins exact centring as this function's contract.
 *
 * `spec` and `size` are optional so the no-preset call is unchanged. An absent
 * spec means the login shell, and note that `shell(id)` omits `command`
 * entirely rather than defaulting it — see the note above on why the renderer
 * must never resolve one.
 */
export function makePanel(
  id: string,
  centre: Point,
  z: number,
  spec?: Omit<PanelSpecTemplate, 'panelId'> & { panelId?: string },
  size?: { w?: number; h?: number }
): Panel {
  const w = size?.w ?? PANEL_W
  const h = size?.h ?? PANEL_H
  return {
    rect: { id, x: centre.x - w / 2, y: centre.y - h / 2, w, h },
    // panelId is forced to the minted id: a template carrying a stale one
    // would give two panels the same session, which registry.ensure resolves
    // by returning the FIRST — so both render one handle.host and one silently
    // disappears. Same failure parseLayout's duplicate-id check exists for.
    spec: spec ? { ...spec, panelId: id } : shell(id),
    z
  }
}

/**
 * World units, +x and +y per step. 48 clears the ~30px `.panel__chrome`
 * (7px padding, 12px text, a 1px border), so every panel in a stack shows its
 * whole header — its title AND its close button — plus a sliver of terminal.
 *
 * Down-RIGHT rather than up-left, and that is not arbitrary: the new panel
 * takes `nextZ` and paints on top, so stepping down-right is what leaves the
 * OLDER panel's chrome uncovered. Up-left would lay the new chrome straight
 * over the old one and reveal nothing.
 */
export const CASCADE_STEP = 48

/**
 * Half a world pixel — deliberately NOT a "looks stacked" radius.
 *
 * Every coincidence this app can actually produce is EXACT: two Cmd+N presses
 * at an unmoved camera both come from the same `screenToWorld(centre,
 * viewportRef.current)`, so they agree bit for bit. The epsilon exists only so
 * the comparison survives recovering a centre as `rect.x + w / 2` from a rect
 * makePanel built as `centre.x - w / 2`. Widening it into a fuzzy radius
 * re-introduces the overlap rule cascadeCentre exists to avoid (see its note),
 * through the back door.
 *
 * Max-norm rather than Euclidean, because the step is axis-aligned.
 */
export const CASCADE_EPSILON = 0.5

/**
 * The same ceiling as lod.ts's LIVE_BUDGET, and for the same reason: more than
 * eight simultaneously live stacked panels is not a state worth cascading for.
 *
 * The bound itself is load-bearing. Worst case is 8 x 48 = 384 world px, which
 * keeps the deepest slot inside the cull region at EVERY scale — at MAX_SCALE
 * (3) in a 900px window the cull rect's half-height is 150 + CULL_MARGIN_PX / 3
 * = 230 world px, and the deepest panel's top edge is 384 - PANEL_H / 2 = 154.
 * Marching past this instead of wrapping is a worse failure than the stacking
 * it replaces: a panel outside the cull region is never promoted, so it never
 * spawns a PTY, and Cmd+N appears to do nothing at all.
 */
export const CASCADE_MAX_STEPS = 8

/**
 * Where a new panel actually goes: `centre`, unless a panel is ALREADY centred
 * there, in which case it steps down-and-right until it finds a free slot.
 *
 * The defect this fixes is indistinguishability, not overlap. Before it, N
 * presses of Cmd+N at one camera produced N byte-identical rects: the canvas
 * looked like it held one panel, and the buried ones could not be closed
 * (their close buttons were underneath) while each still held a WebGL context
 * and a LIVE_BUDGET slot.
 *
 * The test is therefore panel CENTRES, never rect overlap. Overlap is the
 * normal state of a working canvas — two 720x460 panels can barely both be on
 * screen without touching — so an overlap rule would step nearly every press
 * away from where the user is looking, which is the one thing Cmd+N promises.
 * Perfect coincidence is the only state with no visual evidence at all.
 *
 * Collision-based rather than a spawn counter, and that buys three things a
 * counter cannot: it self-resets (pan somewhere empty and the next panel is
 * centred again), it FILLS GAPS (close the middle of a cascade and the next
 * spawn lands back in that hole), and it works against panels restored from
 * disk, since it reads the live array rather than session-local state.
 *
 * Pure, and called from inside Canvas.tsx's `setPanels` updater with that
 * updater's own `current` — see the call site for why a ref read would
 * resurrect the bug under batching.
 */
export function cascadeCentre(centre: Point, panels: Panel[]): Point {
  const taken = (point: Point): boolean =>
    panels.some(
      ({ rect }) =>
        Math.abs(rect.x + rect.w / 2 - point.x) < CASCADE_EPSILON &&
        Math.abs(rect.y + rect.h / 2 - point.y) < CASCADE_EPSILON
    )
  for (let step = 0; step <= CASCADE_MAX_STEPS; step++) {
    const candidate = { x: centre.x + step * CASCADE_STEP, y: centre.y + step * CASCADE_STEP }
    if (!taken(candidate)) return candidate
  }
  // Every slot occupied: wrap to the original centre rather than march the
  // panel out of the cull region, where it would never be promoted at all.
  return centre
}

/** One above the highest current z, so a raised or new panel is on top. */
export function nextZ(panels: Panel[]): number {
  return panels.reduce((max, p) => Math.max(max, p.z), 0) + 1
}

/**
 * Replace one panel's rect. Serves both move and resize: applyDrag has already
 * decided what the rect is, and the move/resize distinction lives in DragMode
 * where it actually matters (it decides whether a pty:resize commit fires).
 */
export function setPanelRect(panels: Panel[], id: string, rect: WorldRect): Panel[] {
  return panels.map((p) => (p.rect.id === id ? { ...p, rect } : p))
}

export function removePanel(panels: Panel[], id: string): Panel[] {
  return panels.filter((p) => p.rect.id !== id)
}

/** Raise by z, never by array position — see the note on Panel.z. */
export function raisePanel(panels: Panel[], id: string): Panel[] {
  const top = nextZ(panels)
  return panels.map((p) => (p.rect.id === id ? { ...p, z: top } : p))
}
