import { WORK_ITEM_STATES, type PersistedWorkItem } from '@shared/work-items'
import { addLink, makeWorkPanel, nextZ, type Panel } from './panels'

/**
 * M443. One task from a selection: a work card plus a link from each selected
 * panel to that card. Membership is those links (task-members), never where
 * the panels sit. The returned panel array is the one history entry. The
 * work item is a second store — undo restores the panels and leaves the item.
 */
export function applyMakeTask(input: {
  panels: readonly Panel[]
  selectedIds: readonly string[]
  cardId: string
  itemId: string
  now: number
  title?: string
}): { panels: Panel[]; item: PersistedWorkItem } | null {
  const ids = input.selectedIds.filter((id) => input.panels.some((panel) => panel.rect.id === id))
  if (ids.length === 0) return null
  const chosen = input.panels.filter((panel) => ids.includes(panel.rect.id))
  let cx = 0
  let cy = 0
  for (const panel of chosen) {
    cx += panel.rect.x + panel.rect.w / 2
    cy += panel.rect.y + panel.rect.h / 2
  }
  cx /= chosen.length
  cy /= chosen.length
  const title = input.title ?? chosen[0]?.title ?? 'Task'
  const card = makeWorkPanel(input.cardId, { x: cx, y: cy + 220 }, nextZ([...input.panels]), input.itemId, title)
  let panels: Panel[] = [...input.panels, card]
  for (const id of ids) panels = addLink(panels, id, input.cardId)
  const item: PersistedWorkItem = {
    id: input.itemId,
    source: 'typed',
    title,
    state: WORK_ITEM_STATES[1],
    createdAt: input.now,
    updatedAt: input.now
  }
  return { panels, item }
}
