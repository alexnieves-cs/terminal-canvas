import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import type { Point, WorldRect } from '@renderer/canvas/viewport'

/**
 * A panel is its geometry plus its spec. cols/rows are deliberately absent
 * from the spec: they are not known until the panel is attached and fitted,
 * and inventing them here would reintroduce the spawn-at-80x24 problem lazy
 * spawning exists to avoid.
 */
export interface Panel {
  rect: WorldRect
  spec: PanelSpecTemplate
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
  { rect: { id: 's01', x: 0, y: 0, w: PANEL_W, h: PANEL_H }, spec: shell('s01') },
  { rect: { id: 's02', x: 800, y: 0, w: PANEL_W, h: PANEL_H }, spec: shell('s02') },
  { rect: { id: 's03', x: 1600, y: 0, w: PANEL_W, h: PANEL_H }, spec: shell('s03') },
  { rect: { id: 's04', x: 0, y: 540, w: PANEL_W, h: PANEL_H }, spec: shell('s04') },
  { rect: { id: 's05', x: 800, y: 540, w: PANEL_W, h: PANEL_H }, spec: shell('s05') },
  { rect: { id: 's06', x: 1600, y: 540, w: PANEL_W, h: PANEL_H }, spec: shell('s06') },
  { rect: { id: 's07', x: -900, y: 270, w: PANEL_W, h: PANEL_H }, spec: shell('s07') },
  { rect: { id: 's08', x: -900, y: 810, w: PANEL_W, h: PANEL_H }, spec: shell('s08') },
  { rect: { id: 's09', x: 2500, y: 270, w: PANEL_W, h: PANEL_H }, spec: shell('s09') },
  { rect: { id: 's10', x: 400, y: 1100, w: PANEL_W, h: PANEL_H }, spec: shell('s10') },
  { rect: { id: 's11', x: 1200, y: 1100, w: PANEL_W, h: PANEL_H }, spec: shell('s11') },
  { rect: { id: 's12', x: 400, y: -640, w: PANEL_W, h: PANEL_H }, spec: shell('s12') }
]

/** Cmd+N: a panel centred on wherever the camera is looking. */
export function makePanel(id: string, centre: Point): Panel {
  return {
    rect: { id, x: centre.x - PANEL_W / 2, y: centre.y - PANEL_H / 2, w: PANEL_W, h: PANEL_H },
    spec: shell(id)
  }
}
