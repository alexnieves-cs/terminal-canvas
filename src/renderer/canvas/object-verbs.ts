import type { AdvancedDoor, AdvancedDoorId } from './advanced-doors'
import { REASON_GROUP_NEEDS_TWO, type PaletteActions } from '@renderer/palette/commands'
import { requestArrival } from '@renderer/world/world-select'
import { setWorldCameraTarget, setWorldOn } from '@renderer/world/world-toggle'
import { boxFromStyle } from '@renderer/world/world-structure'
import {
  worldDoor, type WorldBox, type WorldDoor, type WorldScope
} from '@renderer/sessions/sessions-model'

export { roomKind, worldDoor, flatTerraceLayout, urgentFace, panelsInRegion, type WorldBox, type WorldDoor, type WorldScope, type FlatTerracePlace } from '@renderer/sessions/sessions-model'

/**
 * M408 (D1). THE OBJECT VERB LISTS — one per surface family, read by every
 * surface that offers them, so a verb added to an object's menu is added to
 * its right-click menu in the same edit and cannot drift.
 *
 *  - `panelVerbs` is the panel's ⋯ menu (M106/M204/#19/M258): its task
 *    section, its advanced doors, Fill view / Restore size and the palette's
 *    door. The ⋯ menu (PanelFrame) and the panel's context menu
 *    (CanvasContextMenu) both render it, and both run a row through
 *    `runPanelVerb` against the one `PanelMarks` the canvas provides — whose
 *    task verbs are the palette's own actions (Canvas's `taskVerbs`).
 *  - `selectionVerbs` is the command pill's action row (M249/M390): Fit and
 *    the selection's verbs, in its one priority order. The pill and a
 *    context menu on a multi-selection or on the ground render it, and both
 *    run a row through `runSelectionVerb` against `PaletteActions`, the
 *    executor every palette row calls.
 *
 * Pure: no React, no DOM. A row that cannot run is DISABLED with its reason,
 * never removed (the product's rule for every verb surface).
 */

/** M204 (D08). What the ⋯ menu knows about a panel's task, asked when it opens. */
export type TaskMenuFact = { kind: 'none' } | { kind: 'one'; title: string; related: boolean } | { kind: 'many'; titles: string[] }

export type PanelVerbSection = 'task' | 'advanced' | 'frame'

export interface PanelVerb {
  /** Stable: `task.focus`, `task.show`, `task.related`, `task.arrange`, `door.<id>`, `frame.maximise`, `frame.restore`, `frame.palette`. */
  id: string
  section: PanelVerbSection
  label: string
  title: string
  /** Why the row cannot run; absent when it can. */
  disabled?: string
  /** An advanced door's one-clause benefit, shown under its label. */
  benefit?: string
  /** The DOM attribute the ⋯ menu's row has always carried (the suites select on it), and its value. */
  attr: [string, string]
}

export interface PanelVerbFacts {
  /** Absent: the canvas offers no task verbs (a fixture). */
  task?: TaskMenuFact
  /** The task's focus view is offered (M324). */
  taskFocus: boolean
  /** Absent or empty: no advanced section. */
  advanced?: readonly AdvancedDoor[]
  /** The merged view: geometry is not this canvas's to write. */
  readOnly: boolean
  /** The frame has a close control (the merged view's read-only geometry has none) — and with it Fill view. */
  framed: boolean
  maximised: boolean
  /** The palette's door is wired (absent in a fixture). */
  palette: boolean
}

const READ_ONLY = 'the merged view is read-only'

export function panelVerbs(f: PanelVerbFacts): PanelVerb[] {
  const rows: PanelVerb[] = []
  const t = f.task
  if (t !== undefined && t.kind === 'one') {
    if (f.taskFocus) rows.push({ id: 'task.focus', section: 'task', label: 'Focus this task', title: 'Open this task beside its conversation — changes, checks, review and preview in one place', attr: ['data-panel-menu-task-verb', 'focus'] })
    rows.push({ id: 'task.show', section: 'task', label: 'Show this task', title: 'Frame this task — nothing moves', attr: ['data-panel-menu-task-verb', 'show'] })
    rows.push({ id: 'task.related', section: 'task', label: t.related ? 'Stop showing related' : 'Show related', title: t.related ? 'Turn the lens off' : 'Ring this task\'s panels and dim the rest — nothing moves', attr: ['data-panel-menu-task-verb', 'related'] })
    rows.push({ id: 'task.arrange', section: 'task', label: 'Arrange this task', title: f.readOnly ? READ_ONLY : 'Compact this task\'s panels in reading order, clear of everything else — one undo', ...(f.readOnly ? { disabled: READ_ONLY } : {}), attr: ['data-panel-menu-task-verb', 'arrange'] })
    // M454. The task's way into the room: the terrace centre, this panel picked first.
    rows.push({ id: 'task.world', section: 'task', label: 'View in World', title: 'Open the World on this task, with this panel picked', attr: ['data-panel-menu-world', 'task'] })
  }
  if (!f.readOnly) {
    for (const d of f.advanced ?? []) rows.push({ id: `door.${d.id}`, section: 'advanced', label: d.label, title: d.benefit, benefit: d.benefit, attr: ['data-panel-menu-door', d.id] })
  }
  if (f.framed) {
    const verb = f.maximised ? 'restore' : 'maximise'
    rows.push({
      id: `frame.${verb}`, section: 'frame', label: f.maximised ? 'Restore size' : 'Fill view',
      title: f.readOnly ? READ_ONLY : f.maximised ? 'Restore this panel to where it was' : 'Fill the view with this panel',
      ...(f.readOnly ? { disabled: READ_ONLY } : {}), attr: ['data-panel-menu-maximise', verb]
    })
  }
  // M454. A panel that is not in one task still has the door. It lands on that panel's own floor point.
  rows.push({ id: 'frame.world', section: 'frame', label: 'View in World', title: 'Open the World on this panel', attr: ['data-panel-menu-world', 'panel'] })
  if (f.palette) rows.push({ id: 'frame.palette', section: 'frame', label: 'Verbs in ⌘K…', title: 'Every verb for this panel, in the palette', attr: ['data-panel-menu-palette', 'true'] })
  return rows
}

/** The doors a panel verb runs through — `PanelMarks`'s own members, so the ⋯ menu and the context menu share one executor. */
export interface PanelVerbDoors {
  maximise: (id: string) => void
  restore: (id: string) => void
  more?: (id: string) => void
  task?: { show: (id: string) => void; related: (id: string) => void; arrange: (id: string) => void; focus?: (id: string) => void }
  advanced?: { run: (id: string, door: AdvancedDoorId) => void }
}

export function runPanelVerb(verbId: string, panelId: string, doors: PanelVerbDoors): void {
  if (verbId === 'task.focus') doors.task?.focus?.(panelId)
  else if (verbId === 'task.show') doors.task?.show(panelId)
  else if (verbId === 'task.related') doors.task?.related(panelId)
  else if (verbId === 'task.arrange') doors.task?.arrange(panelId)
  else if (verbId === 'frame.maximise') doors.maximise(panelId)
  else if (verbId === 'frame.restore') doors.restore(panelId)
  else if (verbId === 'frame.palette') doors.more?.(panelId)
  else if (verbId === 'task.world') viewInWorld(panelId, 'task')
  else if (verbId === 'frame.world') viewInWorld(panelId, 'panel')
  else if (verbId.startsWith('door.')) doors.advanced?.run(panelId, verbId.slice('door.'.length) as AdvancedDoorId)
}

/** The palette id R-080 asks `commands.ts` to spell as a literal. Kept here so the row and the check name one string. */
export function worldViewPaletteId(): string {
  return 'world.view'
}

/** Regions and panels, read off the canvas that stays mounted under the room. */
export function readWorldBoxes(doc?: Pick<Document, 'querySelectorAll'>): { panels: WorldBox[]; regions: WorldBox[] } {
  const root = doc ?? (typeof document === 'undefined' ? undefined : document)
  if (root === undefined || typeof root.querySelectorAll !== 'function') return { panels: [], regions: [] }
  doc = root
  const panels: WorldBox[] = []
  for (const el of doc.querySelectorAll<HTMLElement>('.panel[data-panel-id]')) {
    const id = el.getAttribute('data-panel-id')
    if (id === null) continue
    const box = boxFromStyle(id, el.style.left, el.style.top, el.style.width, el.style.height)
    if (box !== null) panels.push(box)
  }
  const regions: WorldBox[] = []
  for (const el of doc.querySelectorAll<HTMLElement>('[data-task-region]')) {
    const id = el.getAttribute('data-task-region')
    if (id === null) continue
    const box = boxFromStyle(id, el.style.left, el.style.top, el.style.width, el.style.height)
    if (box !== null) regions.push(box)
  }
  return { panels, regions }
}

/**
 * Ask the room to frame this door. Does not turn the world on: Sessions is
 * still another page, and turning the world on there makes Canvas turn it
 * straight off. The caller opens it once the canvas page is showing.
 */
export function stageWorldDoor(door: WorldDoor, now: number): void {
  if (door.agentIds.length === 0) return
  requestArrival(door.agentIds, now)
  if (door.floor !== null) setWorldCameraTarget(door.floor)
}

/** The panel menu's door. Already on the canvas, so the world opens now. */
export function viewInWorld(panelId: string, scope: WorldScope, now = Date.now()): void {
  const door = worldDoor(panelId, scope, ...boxesOf(readWorldBoxes()))
  stageWorldDoor(door, now)
  setWorldOn(true)
}

function boxesOf(read: { panels: WorldBox[]; regions: WorldBox[] }): [WorldBox[], WorldBox[]] {
  return [read.panels, read.regions]
}

export type SelectionVerbKey = 'fit' | 'plan' | 'layout' | 'tidy' | 'align' | 'space' | 'arrange' | 'related' | 'group' | 'close'

export interface SelectionVerb {
  key: SelectionVerbKey
  label: string
  /** Why it cannot run; absent when it can. */
  reason?: string
}

export interface SelectionFacts {
  selectedIds: readonly string[]
  /** The selection holds a flowchart shape (M390). */
  shape: boolean
  /** Which way the selection is long, for Line up / Space evenly. */
  longAxis: 'x' | 'y'
}

/** The pill's actions, in its one priority order: Fit first (it never depends on a selection), the selection's after. */
export function selectionVerbs(f: SelectionFacts): SelectionVerb[] {
  const n = f.selectedIds.length
  const single = n === 1
  if (n === 0) return [{ key: 'fit', label: 'Fit' }]
  return [
    { key: 'fit', label: 'Fit' },
    // M390/M391. A diagram's selection leads with Lay out; any selection of
    // two or more can be lined up and, from three, spaced evenly — each along
    // the selection's own long axis, the same verbs the palette runs.
    // M394. Sketch → plan, where the chart is: the Start work sheet opens with its steps.
    ...(f.shape ? [{ key: 'plan', label: 'New task' }, { key: 'layout', label: 'Lay out' }] as SelectionVerb[] : []),
    { key: 'tidy', label: 'Tidy', ...(n >= 2 ? {} : { reason: 'select at least two panels to tidy' }) },
    { key: 'align', label: 'Line up', ...(n >= 2 ? {} : { reason: 'select two or more objects to line up' }) },
    { key: 'space', label: 'Space evenly', ...(n >= 3 ? {} : { reason: 'select three or more objects to space evenly' }) },
    { key: 'arrange', label: 'Arrange task', ...(single ? {} : { reason: 'select one panel of a task' }) },
    { key: 'related', label: 'Related', ...(single ? {} : { reason: 'select one panel of a task' }) },
    { key: 'group', label: 'Group', ...(n >= 2 ? {} : { reason: REASON_GROUP_NEEDS_TWO }) },
    { key: 'close', label: 'Close', ...(single ? {} : { reason: 'select one panel to close — the pill never closes several at once' }) }
  ]
}

export type SelectionVerbActions = Pick<PaletteActions, 'zoomToFit' | 'tidyPanels' | 'showRelated' | 'arrangeTask' | 'beginCreateGroup' | 'closePanel' | 'say' | 'alignObjects' | 'distributeObjects' | 'layoutFlowchart' | 'planFromChart'>

export function runSelectionVerb(key: SelectionVerbKey, f: SelectionFacts, actions: SelectionVerbActions): void {
  const said = (r: { kind: 'ran' } | { kind: 'refused'; reason: string } | { kind: 'ran'; note?: string }): void => {
    if (r.kind === 'refused') actions.say(r.reason)
  }
  const single = f.selectedIds.length === 1 ? f.selectedIds[0] : undefined
  switch (key) {
    case 'fit': actions.zoomToFit(); return
    case 'plan': said(actions.planFromChart()); return
    case 'layout': said(actions.layoutFlowchart('down')); return
    case 'tidy': actions.tidyPanels([...f.selectedIds]); return
    case 'align': said(actions.alignObjects(f.longAxis === 'x' ? 'vcentre' : 'hcentre')); return
    case 'space': said(actions.distributeObjects(f.longAxis === 'x' ? 'across' : 'down')); return
    case 'arrange': if (single !== undefined) said(actions.arrangeTask(single)); return
    case 'related': if (single !== undefined) said(actions.showRelated(single)); return
    case 'group': actions.beginCreateGroup([...f.selectedIds]); return
    case 'close': if (single !== undefined) actions.closePanel(single); return
  }
}

/** Which way a set of rects is long — the pill's rule, shared. */
export function longAxisOf(rects: ReadonlyArray<{ x: number; y: number; w: number; h: number }>): 'x' | 'y' {
  if (rects.length === 0) return 'x'
  const w = Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x))
  const h = Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y))
  return w >= h ? 'x' : 'y'
}
