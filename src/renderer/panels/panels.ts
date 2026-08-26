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
 * Cmd+N, and every preset spawn: a panel centred on wherever the camera is
 * looking, on top.
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
