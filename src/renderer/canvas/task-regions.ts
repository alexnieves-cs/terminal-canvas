/**
 * Task territories (M437). Pure: no React, no DOM.
 *
 * A task is a labelled region around the panels a FACT ties to it.
 * Membership comes from `task-members.ts` — position is not a reason, and a
 * panel named by two tasks is not given one of them by guessing. The hull
 * `task-clusters.ts` draws at the far card tier is a different shape: 28px
 * of padding, and only when two members are present. A region is the 24px
 * grid, one member is enough, and the two must not be collapsed into each
 * other or the territory and the silhouette stop meaning the same task.
 *
 * Bounds are the union of the member rects, plus 24px, snapped outward onto
 * the 24px grid so the padding never comes out shorter than 24 and every
 * edge sits on a grid line. The corner radius is 20; it is a constant
 * because the contract's bounds are a rect, not a shape.
 *
 * Moving a region moves every member by the same delta and returns one
 * plan. The caller commits that plan as one history entry, so one undo
 * puts the whole task back. The delta is not snapped: a drag is continuous,
 * and the region re-snaps when it is rebuilt around the members.
 */

import type { TaskRegion, TaskRegionBounds } from '@shared/redesign-contracts'
import { CLUSTER_PAD } from './task-clusters'
import { tasksOfPanel, type TaskMembership } from './task-members'

export const REGION_PAD = 24
export const REGION_GRID = 24
export const REGION_RADIUS = 20

/**
 * False when someone points a region at the cluster hull's padding.
 * The two constants are widened: `tsc` rejects a comparison it can see is
 * `24 !== 28`, and a later edit that made them equal would then compile
 * while the territories collapsed into the silhouette.
 */
export function distinctFromClusterPad(): boolean {
  const regionPad: number = REGION_PAD
  const clusterPad: number = CLUSTER_PAD
  return regionPad !== clusterPad
}

export interface RegionMember {
  panelId: string
  rect: { x: number; y: number; w: number; h: number }
  /** Counted in the label. A changes card and a note are in the territory and are not agents. */
  agent: boolean
}

export interface RegionSpec {
  id: string
  ticket: string | null
  title: string
  members: readonly RegionMember[]
  criteriaDone: number
  criteriaTotal: number
}

interface RectLike {
  x: number
  y: number
  w: number
  h: number
}

function snapDown(n: number): number {
  return Math.floor((n + 1e-9) / REGION_GRID) * REGION_GRID
}

function snapUp(n: number): number {
  return Math.ceil((n - 1e-9) / REGION_GRID) * REGION_GRID
}

/** The padded, grid-snapped union. Null when there is nothing to enclose. */
export function regionBounds(rects: readonly RectLike[]): TaskRegionBounds | null {
  if (rects.length === 0) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const rect of rects) {
    if (rect.x < left) left = rect.x
    if (rect.y < top) top = rect.y
    if (rect.x + rect.w > right) right = rect.x + rect.w
    if (rect.y + rect.h > bottom) bottom = rect.y + rect.h
  }
  const x = snapDown(left - REGION_PAD)
  const y = snapDown(top - REGION_PAD)
  const farX = snapUp(right + REGION_PAD)
  const farY = snapUp(bottom + REGION_PAD)
  return { x, y, w: farX - x, h: farY - y }
}

/**
 * The chip. Ticket, then the agent count, then criteria — each omitted when
 * it would be a zero or an absent fact. "0 agents" and "0 of 0 criteria"
 * are the zero-value statement the rest layer does not say.
 */
export function regionLabel(region: Pick<TaskRegion, 'title' | 'ticket' | 'agentCount' | 'criteriaDone' | 'criteriaTotal'>): string {
  const parts = [region.title]
  if (region.ticket !== null && region.ticket !== '') parts.push(region.ticket)
  if (region.agentCount > 0) parts.push(region.agentCount === 1 ? '1 agent' : `${region.agentCount} agents`)
  if (region.criteriaTotal > 0) parts.push(`${region.criteriaDone} of ${region.criteriaTotal} criteria`)
  return parts.join(' · ')
}

/** One region per spec that has a member. Specs with no members are not drawn. */
export function buildRegions(specs: readonly RegionSpec[]): TaskRegion[] {
  const out: TaskRegion[] = []
  for (const spec of specs) {
    if (spec.members.length === 0) continue
    const bounds = regionBounds(spec.members.map((member) => member.rect))
    if (bounds === null) continue
    let agentCount = 0
    for (const member of spec.members) if (member.agent) agentCount += 1
    out.push({
      id: spec.id,
      ticket: spec.ticket,
      title: spec.title,
      agentCount,
      criteriaDone: spec.criteriaDone,
      criteriaTotal: spec.criteriaTotal,
      bounds
    })
  }
  return out
}

export interface RegionMeta {
  ticket: string | null
  title: string
  criteriaDone: number
  criteriaTotal: number
}

/**
 * Regions from memberships the caller already computed. A panel that merely
 * touches the task is not a member; only `membership.members` is.
 */
export function regionsFromMemberships(
  memberships: readonly TaskMembership[],
  panels: readonly RegionMember[],
  meta: Readonly<Record<string, RegionMeta>>
): TaskRegion[] {
  return buildRegions(memberships.map((membership) => {
    const ids = new Set(membership.members.map((member) => member.panelId))
    const info = meta[membership.itemId]
    return {
      id: membership.itemId,
      ticket: info?.ticket ?? null,
      title: info?.title ?? membership.itemId,
      criteriaDone: info?.criteriaDone ?? 0,
      criteriaTotal: info?.criteriaTotal ?? 0,
      members: panels.filter((panel) => ids.has(panel.panelId))
    }
  }))
}

/**
 * The one task a panel belongs to, when the memberships say there is one.
 * Two tasks is null: choosing one would be the guess `task-members.ts` refuses.
 */
export function regionIdForPanel(panelId: string, memberships: readonly TaskMembership[], regions: readonly TaskRegion[]): string | null {
  const ids = tasksOfPanel(panelId, memberships)
  if (ids.length !== 1) return null
  const id = ids[0]
  return regions.some((region) => region.id === id) ? id : null
}

/**
 * Topmost region containing the point. Later regions paint above earlier
 * ones, so they win a tie. Left and top are inclusive; right and bottom are
 * exclusive, so a shared edge has one owner.
 */
export function hitTestRegions(regions: readonly TaskRegion[], point: { x: number; y: number }): string | null {
  for (let i = regions.length - 1; i >= 0; i--) {
    const bounds = regions[i].bounds
    if (point.x >= bounds.x && point.x < bounds.x + bounds.w && point.y >= bounds.y && point.y < bounds.y + bounds.h) {
      return regions[i].id
    }
  }
  return null
}

export interface RegionMove {
  /** Every member's rect after the drag. One array, one undo entry. */
  rects: Array<{ id: string; x: number; y: number; w: number; h: number }>
}

/** Translate every member by the same delta. Sizes stay. */
export function moveRegion(
  members: readonly { id: string; x: number; y: number; w: number; h: number }[],
  dx: number,
  dy: number
): RegionMove {
  return {
    rects: members.map((member) => ({
      id: member.id,
      x: member.x + dx,
      y: member.y + dy,
      w: member.w,
      h: member.h
    }))
  }
}
