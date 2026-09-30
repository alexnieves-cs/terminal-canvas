import type { PersistedGroup } from '@shared/groups'
import { isFramePanel, type Panel } from '@renderer/panels/panels'
import type { Point, WorldRect } from '@renderer/canvas/viewport'
import { applyDrag, type DragState } from '@renderer/canvas/panel-interaction'

export type CanvasGroup = PersistedGroup

export const GROUP_PADDING = 28
export const GROUP_HEADER_H = 34

/** The visible region is derived from the panels it owns, never persisted. */
export function groupRect(group: CanvasGroup, panels: readonly Panel[]): WorldRect | null {
  const members = group.panelIds
    .map((id) => panels.find((panel) => panel.rect.id === id)?.rect)
    .filter((rect): rect is WorldRect => rect !== undefined)
  if (members.length === 0) return null
  const left = Math.min(...members.map((r) => r.x)) - GROUP_PADDING
  const right = Math.max(...members.map((r) => r.x + r.w)) + GROUP_PADDING
  const top = Math.min(...members.map((r) => r.y)) - GROUP_PADDING - GROUP_HEADER_H
  const bottom = Math.max(...members.map((r) => r.y + r.h)) + GROUP_PADDING
  return { id: group.id, x: left, y: top, w: right - left, h: bottom - top }
}

/**
 * A group move carries one immutable drag state per member. Calling applyDrag
 * for each of them is intentional: it retains the origin-based rule when the
 * camera scale changes mid-gesture and prevents accumulated frame deltas from
 * shearing the group apart.
 */
export interface GroupDragState {
  groupId: string
  members: DragState[]
}

export function groupDragState(group: CanvasGroup, panels: readonly Panel[], originWorld: Point): GroupDragState {
  return {
    groupId: group.id,
    // M92. A locked member is skipped: it stays where it is and the others
    // move around it. Skipped HERE, so applyGroupDrag has no state for it.
    members: group.panelIds.flatMap((id) => {
      const panel = panels.find((candidate) => candidate.rect.id === id)
      return panel === undefined || panel.locked === true ? [] : [{
        panelId: id,
        mode: { kind: 'move' as const },
        originRect: panel.rect,
        originWorld
      }]
    })
  }
}

export function applyGroupDrag(panels: Panel[], state: GroupDragState, world: Point): Panel[] {
  const nextRects = new Map(state.members.map((member) => [member.panelId, applyDrag(member, world)]))
  return panels.map((panel) => {
    const rect = nextRects.get(panel.rect.id)
    return rect === undefined ? panel : { ...panel, rect }
  })
}

/**
 * Raise every member without ever changing array order. M395: a FRAME member
 * stays where it is — it is drawn behind what it encloses (`raisePanel`'s rule),
 * and a group lifted over its own region would cover the members it holds.
 */
export function raiseGroup(panels: Panel[], group: CanvasGroup): Panel[] {
  let z = panels.reduce((highest, panel) => Math.max(highest, panel.z), 0)
  const members = new Set(group.panelIds)
  return panels.map((panel) => {
    if (!members.has(panel.rect.id) || isFramePanel(panel)) return panel
    z += 1
    return { ...panel, z }
  })
}

/** Closing/moving a panel repairs its groups and discards only empty ones. */
export function pruneGroups(groups: CanvasGroup[], panelIds: ReadonlySet<string>): CanvasGroup[] {
  let changed = false
  const next = groups.flatMap((group) => {
    const kept = group.panelIds.filter((id) => panelIds.has(id))
    if (kept.length === 0) { changed = true; return [] }
    if (kept.length === group.panelIds.length) return [group]
    changed = true
    return [{ ...group, panelIds: kept }]
  })
  return changed ? next : groups
}

export function toggleGroup(groups: CanvasGroup[], id: string): CanvasGroup[] {
  return groups.map((group) => group.id === id
    ? { ...group, ...(group.collapsed ? {} : { collapsed: true }) }
    : group)
}

export function expandGroup(groups: CanvasGroup[], id: string): CanvasGroup[] {
  return groups.map((group) => {
    if (group.id !== id || !group.collapsed) return group
    const next = { ...group }
    delete next.collapsed
    return next
  })
}

export function removeGroup(groups: CanvasGroup[], id: string): CanvasGroup[] {
  return groups.filter((group) => group.id !== id)
}

/** M92. How many of a group's members are locked — the frame says `N locked`. */
export function lockedCount(group: CanvasGroup, panels: readonly Panel[]): number {
  return group.panelIds.filter((id) => panels.find((p) => p.rect.id === id)?.locked === true).length
}
