import { toPanels } from '@renderer/panels/layout-adapt'
import type { MergedWorkspace } from '@shared/ipc-contract'
import type { Panel } from '@renderer/panels/panels'
import type { WorldRect } from './viewport'

/**
 * Places every workspace's panels into non-overlapping lanes, for DISPLAY
 * ONLY.
 *
 * The obstacle this module exists for is coordinates, not budget. Every
 * workspace stores its panels in the same world space, clustered around
 * wherever that canvas's camera has been, so two workspaces' panels overlap
 * by construction — not by a cascade collision, but because nothing has ever
 * kept them apart. cascadeCentre cannot help: it separates a new panel from a
 * coincident one within ONE array, and here the arrays were laid out
 * independently by two cameras that never knew about each other. A prior
 * milestone's docs misattributed this obstacle to a WebGL context budget;
 * LIVE_BUDGET has nothing to do with it — two panels can be a screen's width
 * apart and still both be well within it.
 *
 * Nothing here is ever written back. The returned rects are synthetic — the
 * lane offset exists only for this one render — while the ids, specs, titles
 * and kinds are the panels' own, which is what lets every existing consumer
 * (the registry, agent state, edge pips, the rail, the inspector) work on a
 * foreign panel with no change at all. A future reader who persists these
 * rects produces a well-formed layout.json with wrong coordinates in it,
 * discovered launches later with nothing to blame.
 *
 * Pure, like viewport.ts and lod.ts, and for the same reason: this is the
 * geometry most likely to be subtly wrong and least pleasant to debug through
 * a running WebGL canvas. No DOM, no React, no camera, no clock, no
 * randomness — the same input must always produce the same output, or lanes
 * would shuffle between refetches and read as the canvas rearranging itself.
 */

/** World units between lanes. Wide enough to read as a gap at a fitted zoom. */
export const LANE_GUTTER = 400

/** An empty workspace has no bounding box; it still gets a lane this wide. */
export const LANE_MIN_WIDTH = 800

export interface Lane {
  workspaceId: string
  name: string
  active: boolean
  /** The translation applied to every panel of this workspace. */
  origin: { x: number; y: number }
  /** World rect containing every panel in the lane. Lane chrome draws from this. */
  bounds: WorldRect
}

export interface MergedLayout {
  panels: Panel[]
  lanes: Lane[]
}

export function mergedLayout(workspaces: MergedWorkspace[]): MergedLayout {
  // The ACTIVE workspace's lane comes first, so toggling the mode does not
  // scroll the user away from the canvas they were just looking at.
  const ordered = [...workspaces].sort((a, b) => Number(b.active) - Number(a.active))

  const panels: Panel[] = []
  const lanes: Lane[] = []
  let cursorX = 0

  for (const workspace of ordered) {
    const own = toPanels(workspace.panels)

    // An empty workspace has nothing to measure and still gets a lane: one
    // that vanished would read as a workspace that was deleted, and would
    // make the merged view disagree with the rail about how many exist.
    const box = boundingBox(own)
    const width = Math.max(box?.w ?? 0, LANE_MIN_WIDTH)

    // Translate so the workspace's own top-left lands at the lane's origin.
    // Relative geometry is untouched — the arrangement is the information
    // worth preserving. A merged view that re-flowed every panel into a grid
    // would show the user a canvas they have never seen.
    const origin = { x: cursorX - (box?.x ?? 0), y: -(box?.y ?? 0) }

    for (const panel of own) {
      panels.push({
        ...panel,
        rect: { ...panel.rect, x: panel.rect.x + origin.x, y: panel.rect.y + origin.y }
      })
    }

    lanes.push({
      workspaceId: workspace.id,
      name: workspace.name,
      active: workspace.active,
      origin,
      bounds: { id: workspace.id, x: cursorX, y: 0, w: width, h: box?.h ?? 0 }
    })

    cursorX += width + LANE_GUTTER
  }

  return { panels, lanes }
}

function boundingBox(panels: Panel[]): { x: number; y: number; w: number; h: number } | null {
  if (panels.length === 0) return null
  const left = Math.min(...panels.map((p) => p.rect.x))
  const top = Math.min(...panels.map((p) => p.rect.y))
  const right = Math.max(...panels.map((p) => p.rect.x + p.rect.w))
  const bottom = Math.max(...panels.map((p) => p.rect.y + p.rect.h))
  return { x: left, y: top, w: right - left, h: bottom - top }
}
