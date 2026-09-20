/**
 * M291. The platform scene — pure, plain node (`verify:orchestration orch-3d.*`).
 *
 * Phase C's islands were CARDS beside a ring of cubes; here each island is a
 * PLATFORM in the scene and every object stands on one. Three visually distinct
 * kinds stand there, and the distinction is by SHAPE and WORD, never colour alone:
 *
 * - a **station** is an agent execution (a chat, an agentic terminal, a plain
 *   terminal, a workflow) — the cube;
 * - a **checkpoint** is a watcher: a command whose result is passed / failed /
 *   running / not run — a hexagonal puck, so a test result never reads as another
 *   reasoning agent;
 * - an **artifact** is a file panel open on the canvas — a thin standing tablet.
 *
 * Objects with no island (a watcher or a file whose directory no island owns, a
 * session with no directory) stand on the WORKSPACE platform, which is grouping
 * and says so (`ORCH_DEP_GROUPING`), never a supervisor.
 *
 * **Placement is stable under live updates.** Phase C's append-only island order
 * is the foundation: the i-th island in that order takes the i-th CELL of a fixed
 * grid, and a cell's position is a function of its index alone — a new island
 * appends into the next free cell and never moves the ones a person already
 * knows; a returning user finds work where it was. A platform's SIZE is fixed too
 * (`ORCH_PLATFORM`), so a station arriving on one island cannot shift its
 * neighbours: past `ORCH_STATION_CAP` a platform seats the most urgent stations
 * and says `+N more` with an honest count, and the FOCUSED platform expands to
 * seat all of them (M292's "grouping with honest counts, expanding on focus").
 * A waiting (needs-you) station is ALWAYS seated, whatever the cap — a blocked
 * or needs-input object is never hidden behind an overflow node.
 *
 * Height is never a hidden quantitative score: every platform has the same two
 * layers (a base and a raised inner plate the stations stand on) and the same
 * thickness; selection lifts by a fixed, finite amount. Those layers are
 * DECORATIVE and expendable before hit accuracy or legibility — the hit-target
 * is the base plate's footprint, computed here, and nothing about the layers
 * changes it.
 */
import type { OrchRosterRow } from './orchestration-model'
import { isLiveRosterState } from './orchestration-model'
import type { TaskIsland } from './orchestration-island'
import { ORCH_DEP_GROUPING } from './orchestration-dependency'

export type OrchObjectKind = 'station' | 'checkpoint' | 'artifact'

/** The workspace platform's id: grouping for what no island owns. */
export const ORCH_WORKSPACE_PLATFORM = '__workspace__'

/** Stations a platform seats at rest. Past it: `+N more`, unless focused. */
export const ORCH_STATION_CAP = 8

/** Model units. The grid is three cells wide; rows go down (nearer the camera). */
export const ORCH_CELL = { w: 286, h: 210, cols: 3, x0: 1, y0: 4 } as const
/** The plate's footprint inside a cell, before the stage's tilt; the inner plate is inset. */
export const ORCH_PLATFORM = { w: 250, h: 150, inset: 18, thickness: 10, innerLift: 8 } as const
/** Station pitch on the inner plate and the object sizes (half-extents the meshes read). */
export const ORCH_PITCH = 46
export const ORCH_OBJECT_SIZE = { station: 17, checkpoint: 14, artifact: 13 } as const

export interface OrchSceneObject {
  id: string
  title: string
  kind: OrchObjectKind
  /** The panel kind under it (chat, terminal, watcher, file, workflow). */
  panelKind: OrchRosterRow['kind'] | 'file'
  state: OrchRosterRow['state']
  platformId: string
  /** Model-space centre (pre-tilt), absolute. */
  x: number
  y: number
  /** Half-extent in model units. */
  size: number
  /** Which layer it stands on: 1 = the inner plate (stations), 0 = the base (checkpoints, artifacts). */
  layer: 0 | 1
  /** A file artifact's path, for the inspector and the List. */
  path?: string
}

export interface OrchPlatform {
  id: string
  /** The island's goal, or the workspace label. */
  label: string
  /** The island's placement line (repository · branch · own worktree …). */
  sub: string
  /** The island's state word: working / review / no task yet; the workspace says grouping. */
  state: string
  /** The workspace platform: grouping only, never a task. */
  synthetic: boolean
  /** The island behind it, when it is one. */
  island?: TaskIsland
  cell: { col: number; row: number }
  /** Model-space centre and footprint (the BASE plate, pre-tilt). */
  x: number
  y: number
  w: number
  h: number
  /** Expanded on focus past the cap — wider than its cell; painted over its neighbours. */
  expanded: boolean
  stations: OrchSceneObject[]
  checkpoints: OrchSceneObject[]
  artifacts: OrchSceneObject[]
  /** Seated past the cap: their ids and states, and how many of them need a person (always 0 — they are seated). */
  hidden: { ids: string[]; needsYou: number }
  counts: { stations: number; checkpoints: number; artifacts: number; needsYou: number; live: number }
}

export interface OrchPlatformsInput {
  islands: readonly TaskIsland[]
  /** Presentation order (orchIslandOrder's), island ids. Islands not in it go last, in the islands' order. */
  order: readonly string[]
  /** The roster: every session, watcher and workflow the snapshot knows. */
  roster: readonly OrchRosterRow[]
  files: readonly { id: string; title: string; path: string }[]
  /** A panel's directory: a session's cwd, a watcher's cwd, a file's parent. */
  homeOf: (id: string) => string | undefined
  /** The focused island (expands past the cap), or null. */
  focusedId: string | null
}

const within = (dir: string, root: string): boolean => dir === root || dir.startsWith(root.endsWith('/') ? root : `${root}/`)

const urgency = (state: OrchRosterRow['state']): number => (state === 'wants-you' ? 0 : isLiveRosterState(state) ? 1 : 2)

export function orchCellCentre(index: number): { col: number; row: number; x: number; y: number } {
  const col = index % ORCH_CELL.cols
  const row = Math.floor(index / ORCH_CELL.cols)
  return { col, row, x: ORCH_CELL.x0 + col * ORCH_CELL.w + ORCH_CELL.w / 2, y: ORCH_CELL.y0 + row * ORCH_CELL.h + ORCH_CELL.h / 2 }
}

/** Grid columns for n objects: square-ish, at most 4 on a resting plate. */
function gridCols(n: number, max: number): number {
  return Math.max(1, Math.min(max, Math.ceil(Math.sqrt(Math.max(1, n)))))
}

/**
 * Seat the stations: every waiting one, then the live ones, then the rest, in
 * canvas order among equals so the plate does not reshuffle on each transition.
 * Past the cap the remainder is COUNTED, never dropped.
 */
export function orchSeatStations<T extends { id: string; state: OrchRosterRow['state'] }>(all: readonly T[], cap: number, expanded: boolean): { seated: T[]; hidden: T[] } {
  if (expanded || all.length <= cap) return { seated: [...all], hidden: [] }
  const ranked = all.map((s, i) => ({ s, i })).sort((a, b) => urgency(a.s.state) - urgency(b.s.state) || a.i - b.i)
  // The cap counts the NON-waiting seats: every waiting station is seated on
  // top of it, so a plate with three agents waiting still shows the eight most
  // relevant of the rest rather than five of them.
  const seated = new Set<string>()
  let others = 0
  for (const { s } of ranked) {
    if (s.state === 'wants-you') seated.add(s.id)
    else if (others < cap) { seated.add(s.id); others += 1 }
  }
  return { seated: all.filter((s) => seated.has(s.id)), hidden: all.filter((s) => !seated.has(s.id)) }
}

export function orchPlatforms(input: OrchPlatformsInput): OrchPlatform[] {
  const byId = new Map(input.islands.map((i) => [i.id, i]))
  const ordered: TaskIsland[] = []
  for (const id of input.order) { const isl = byId.get(id); if (isl !== undefined && !ordered.includes(isl)) ordered.push(isl) }
  for (const isl of input.islands) if (!ordered.includes(isl)) ordered.push(isl)

  // Which platform owns each roster row and file: a member of an island, else
  // the island whose directory contains its home (nearest, so a worktree beats
  // the repository it forks from), else the workspace.
  const dirs = ordered.filter((i) => i.placement.kind !== 'unknown').map((i) => ({ id: i.id, dir: (i.placement as { path: string }).path }))
  const memberOf = new Map<string, string>()
  for (const isl of ordered) for (const m of isl.memberIds) if (!memberOf.has(m)) memberOf.set(m, isl.id)
  const ownerOf = (id: string): string => {
    const member = memberOf.get(id)
    if (member !== undefined) return member
    const home = input.homeOf(id)
    if (home === undefined || home === '') return ORCH_WORKSPACE_PLATFORM
    const hits = dirs.filter((d) => within(home, d.dir)).sort((a, b) => b.dir.length - a.dir.length)
    return hits[0]?.id ?? ORCH_WORKSPACE_PLATFORM
  }
  const stationsOf = new Map<string, OrchRosterRow[]>()
  const checkpointsOf = new Map<string, OrchRosterRow[]>()
  const artifactsOf = new Map<string, { id: string; title: string; path: string }[]>()
  const push = <T>(map: Map<string, T[]>, key: string, v: T): void => { const list = map.get(key) ?? []; list.push(v); map.set(key, list) }
  for (const r of input.roster) push(r.kind === 'watcher' ? checkpointsOf : stationsOf, ownerOf(r.id), r)
  for (const f of input.files) push(artifactsOf, ownerOf(f.id), f)

  // The workspace plate ALWAYS takes cell 0, islands the cells after it in
  // presentation order. A first cut put the workspace last, and every new
  // island moved it one cell along — measured in the real app as the plate a
  // person was looking at sliding right. A fixed first cell is stable by
  // construction; when nothing stands on it the plate says so in words.
  const slots: { id: string; island?: TaskIsland }[] = [{ id: ORCH_WORKSPACE_PLATFORM }, ...ordered.map((i) => ({ id: i.id, island: i }))]

  return slots.map((slot, index) => {
    const cell = orchCellCentre(index)
    const isl = slot.island
    const all = stationsOf.get(slot.id) ?? []
    const checks = checkpointsOf.get(slot.id) ?? []
    const files = artifactsOf.get(slot.id) ?? []
    const expanded = input.focusedId === slot.id && all.length > ORCH_STATION_CAP
    const { seated, hidden } = orchSeatStations(all, ORCH_STATION_CAP, expanded)
    // Stations on the inner plate: a grid centred on the plate. Past the cap
    // (focused) the plate grows to seat them all; the grid then may exceed the
    // cell and the plate paints OVER its neighbours (last in the overlay).
    const cols = gridCols(seated.length, expanded ? Math.max(4, Math.ceil(Math.sqrt(seated.length))) : 4)
    const rows = Math.max(1, Math.ceil(seated.length / cols))
    const w = expanded ? Math.max(ORCH_PLATFORM.w, cols * ORCH_PITCH + ORCH_PLATFORM.inset * 2 + 64) : ORCH_PLATFORM.w
    const h = expanded ? Math.max(ORCH_PLATFORM.h, rows * ORCH_PITCH + ORCH_PLATFORM.inset * 2 + 28) : ORCH_PLATFORM.h
    // Checkpoints line the left edge of the base plate, artifacts the right; the
    // stations' grid sits between, a little to the right of centre so the
    // label plate (top-left) has the plate's corner to itself.
    const gridX0 = cell.x - ((cols - 1) * ORCH_PITCH) / 2
    const gridY0 = cell.y + 10 - ((rows - 1) * ORCH_PITCH) / 2
    const stations: OrchSceneObject[] = seated.map((r, i) => ({
      id: r.id, title: r.title, kind: 'station', panelKind: r.kind, state: r.state, platformId: slot.id,
      x: gridX0 + (i % cols) * ORCH_PITCH, y: gridY0 + Math.floor(i / cols) * ORCH_PITCH, size: ORCH_OBJECT_SIZE.station, layer: 1
    }))
    const edgeY = (i: number, n: number): number => cell.y + 6 + (i - (n - 1) / 2) * 30
    const checkpoints: OrchSceneObject[] = checks.map((r, i) => ({
      id: r.id, title: r.title, kind: 'checkpoint', panelKind: 'watcher', state: r.state, platformId: slot.id,
      x: cell.x - w / 2 + 18, y: edgeY(i, checks.length), size: ORCH_OBJECT_SIZE.checkpoint, layer: 0
    }))
    const artifacts: OrchSceneObject[] = files.map((f, i) => ({
      id: f.id, title: f.title, kind: 'artifact', panelKind: 'file', state: 'idle', platformId: slot.id,
      x: cell.x + w / 2 - 18, y: edgeY(i, files.length), size: ORCH_OBJECT_SIZE.artifact, layer: 0, path: f.path
    }))
    const needsYou = all.filter((s) => s.state === 'wants-you').length
    return {
      id: slot.id,
      label: isl?.goal ?? 'Workspace',
      sub: isl === undefined ? ORCH_DEP_GROUPING : placementOf(isl),
      state: isl?.state ?? 'grouping',
      synthetic: isl === undefined,
      ...(isl === undefined ? {} : { island: isl }),
      cell: { col: cell.col, row: cell.row },
      x: cell.x, y: cell.y, w, h, expanded,
      stations, checkpoints, artifacts,
      hidden: { ids: hidden.map((s) => s.id), needsYou: hidden.filter((s) => s.state === 'wants-you').length },
      counts: { stations: all.length, checkpoints: checks.length, artifacts: files.length, needsYou, live: all.filter((s) => isLiveRosterState(s.state)).length }
    }
  })
}

function placementOf(isl: TaskIsland): string {
  const repo = isl.repository ?? 'no repository found'
  if (isl.placement.kind === 'worktree') return `${repo} · ${isl.placement.branch} · own worktree`
  if (isl.placement.kind === 'shared') return `${repo} · shared directory${isl.writers > 1 ? ` · ${isl.writers} sessions write here` : ''}`
  return `${repo} · no working directory reported`
}

/** The counts line under a platform's label — words, never a bare zero. */
export function orchPlatformCountsLine(p: Pick<OrchPlatform, 'counts' | 'hidden'>): string {
  const parts: string[] = []
  const c = p.counts
  if (c.stations > 0) parts.push(`${c.stations} ${c.stations === 1 ? 'station' : 'stations'}`)
  if (c.checkpoints > 0) parts.push(`${c.checkpoints} ${c.checkpoints === 1 ? 'check' : 'checks'}`)
  if (c.artifacts > 0) parts.push(`${c.artifacts} ${c.artifacts === 1 ? 'file' : 'files'}`)
  if (c.needsYou > 0) parts.push(`${c.needsYou} ${c.needsYou === 1 ? 'needs' : 'need'} you`)
  return parts.length === 0 ? 'nothing here yet' : parts.join(' · ')
}

/** The `+N more` chip's words: what is seated past the cap, and that none of it is waiting on a person. */
export function orchHiddenLine(p: Pick<OrchPlatform, 'hidden'>): string | null {
  if (p.hidden.ids.length === 0) return null
  return `+${p.hidden.ids.length} more · ${p.hidden.needsYou === 0 ? 'none need you' : `${p.hidden.needsYou} need you`}`
}

/** Every object in the scene, in platform order — the List's rows and the keyboard's walk. */
export function orchSceneObjects(platforms: readonly OrchPlatform[]): OrchSceneObject[] {
  return platforms.flatMap((p) => [...p.stations, ...p.checkpoints, ...p.artifacts])
}

/** Model-space bounds of every platform (pre-tilt), for Fit all. */
export function orchPlatformBounds(platforms: readonly OrchPlatform[]): { x: number; y: number; w: number; h: number } {
  if (platforms.length === 0) return { x: 0, y: 0, w: ORCH_CELL.w, h: ORCH_CELL.h }
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  for (const p of platforms) {
    x0 = Math.min(x0, p.x - p.w / 2); x1 = Math.max(x1, p.x + p.w / 2)
    // The label plate and a station's lift sit ABOVE the plate; leave room for them.
    y0 = Math.min(y0, p.y - p.h / 2 - 48); y1 = Math.max(y1, p.y + p.h / 2 + 12)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export interface OrchHitTarget { id: string; kind: 'platform' | OrchObjectKind; x: number; y: number; w: number; h: number; platformId?: string }

/**
 * The topmost target under a point, in PAINT order (the last box containing
 * the point wins) — the same rule the overlay SVG's DOM order applies, so a
 * plain-node check and `document.elementFromPoint` answer alike. Platforms
 * paint far-to-near and objects after every platform, because an object only
 * ever overlaps what is BEHIND it on screen (it stands up from its plate), and
 * an expanded platform paints after its neighbours because it covers them.
 */
export function orchHitAt(point: { x: number; y: number }, targets: readonly OrchHitTarget[]): OrchHitTarget | null {
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i]!
    if (point.x >= t.x && point.x <= t.x + t.w && point.y >= t.y && point.y <= t.y + t.h) return t
  }
  return null
}

/**
 * Paint order for hit targets: the resting platforms by depth (far first), then
 * their objects by depth, then an EXPANDED platform and, last, its own objects —
 * an expanded plate covers its neighbours' stations, so those must not stay
 * clickable through it.
 */
export function orchHitOrder<T extends { kind: OrchHitTarget['kind']; depth: number; expanded?: boolean; platformId?: string }>(targets: readonly T[]): T[] {
  const byDepth = (a: T, b: T): number => a.depth - b.depth
  const expandedIds = new Set(targets.filter((t) => t.kind === 'platform' && t.expanded === true).map((t) => (t as unknown as { id: string }).id))
  const onExpanded = (t: T): boolean => t.kind === 'platform' ? t.expanded === true : t.platformId !== undefined && expandedIds.has(t.platformId)
  const rest = targets.filter((t) => !onExpanded(t))
  const top = targets.filter(onExpanded)
  return [
    ...rest.filter((t) => t.kind === 'platform').sort(byDepth), ...rest.filter((t) => t.kind !== 'platform').sort(byDepth),
    ...top.filter((t) => t.kind === 'platform').sort(byDepth), ...top.filter((t) => t.kind !== 'platform').sort(byDepth)
  ]
}

// ---------------------------------------------------------------------------
// M292. Semantic zoom, bounded labels. M293. The keyboard's spatial walk.
// ---------------------------------------------------------------------------

/**
 * What a platform shows at this camera: its SUMMARY (label, counts, and any
 * waiting station — never hidden), its STATIONS, or its EVIDENCE (checkpoints
 * and artifacts, with labels). Decided by how wide the plate is ON SCREEN, so
 * one rule serves a zoomed-out fleet and a zoomed-in island alike; a focused
 * platform is always at evidence.
 */
export type OrchZoomLevel = 'summary' | 'stations' | 'evidence'
export const ORCH_ZOOM_BREAKS = { stations: 132, evidence: 236 } as const
export function orchZoomLevel(platformScreenW: number, focused: boolean): OrchZoomLevel {
  if (focused) return 'evidence'
  if (platformScreenW < ORCH_ZOOM_BREAKS.stations) return 'summary'
  if (platformScreenW < ORCH_ZOOM_BREAKS.evidence) return 'stations'
  return 'evidence'
}

/** Whether an object is DRAWN at a level: waiting stations always; stations from `stations`; the rest from `evidence`. */
export function orchObjectVisible(o: Pick<OrchSceneObject, 'kind' | 'state'>, level: OrchZoomLevel): boolean {
  if (o.state === 'wants-you') return true
  if (level === 'summary') return false
  if (level === 'stations') return o.kind === 'station'
  return true
}

/** Name plates the scene may draw at once; past it the plates go to the objects that matter most. */
export const ORCH_LABEL_BUDGET = 48

/**
 * Which objects get a name plate: selected and waiting ones first, then the
 * hovered one, then live ones, then the rest nearest the camera — up to the
 * budget. A scene of a hundred stations drew a hundred plates over each other;
 * the title stays on hover and in the List for the ones without.
 */
export function orchLabelBudget<T extends { id: string; state: OrchRosterRow['state']; depth: number }>(
  objects: readonly T[], priority: { selected: ReadonlySet<string>; hovered: string | null }, budget: number = ORCH_LABEL_BUDGET
): Set<string> {
  const rank = (o: T): number => priority.selected.has(o.id) || o.state === 'wants-you' ? 0 : priority.hovered === o.id ? 1 : isLiveRosterState(o.state) ? 2 : 3
  return new Set([...objects].sort((a, b) => rank(a) - rank(b) || b.depth - a.depth).slice(0, budget).map((o) => o.id))
}

export type OrchArrow = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

/**
 * M293. The next object in a direction: the nearest one whose centre lies in
 * that direction's half-plane, weighted so a straight line beats a diagonal.
 * With no current object, the first one. Null when nothing lies that way, so
 * the caller can leave the selection alone.
 */
export function orchSpatialStep<T extends { id: string; x: number; y: number }>(objects: readonly T[], currentId: string | null, key: OrchArrow): T | null {
  if (objects.length === 0) return null
  const from = currentId === null ? undefined : objects.find((o) => o.id === currentId)
  if (from === undefined) return objects[0]!
  const dx = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
  const dy = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
  let best: T | null = null
  let bestCost = Infinity
  for (const o of objects) {
    if (o.id === from.id) continue
    const ox = o.x - from.x
    const oy = o.y - from.y
    const along = ox * dx + oy * dy
    if (along <= 0) continue
    const across = Math.abs(ox * dy) + Math.abs(oy * dx)
    const cost = along + across * 2.5
    if (cost < bestCost) { bestCost = cost; best = o }
  }
  return best
}

// ---------------------------------------------------------------------------
// M292. Adaptive quality from measured frame time.
// ---------------------------------------------------------------------------

export type OrchQuality = 'full' | 'lean' | 'flat'
/** Mean frame time (ms) above which a tier steps down, and below which it steps back up. */
export const ORCH_FRAME_BUDGET = { down: 24, up: 12 } as const

/**
 * One step at a time, with hysteresis: down when the window's mean frame is
 * over budget, up only when it is well under — so a scene at the edge of the
 * budget does not flicker its bloom. Driven by the FRAME, never by a count.
 */
export function orchQualityStep(current: OrchQuality, meanFrameMs: number): OrchQuality {
  const order: OrchQuality[] = ['full', 'lean', 'flat']
  const i = order.indexOf(current)
  if (meanFrameMs > ORCH_FRAME_BUDGET.down) return order[Math.min(order.length - 1, i + 1)]!
  if (meanFrameMs < ORCH_FRAME_BUDGET.up) return order[Math.max(0, i - 1)]!
  return current
}

// ---------------------------------------------------------------------------
// M293. The List's rows and sort — the scene's equal, not a summary of it.
// ---------------------------------------------------------------------------

export type OrchListSortKey = 'name' | 'kind' | 'state' | 'island'
export interface OrchListSort { key: OrchListSortKey | null; dir: 1 | -1 }

/**
 * Sort the List's rows by a column, stable, or leave them in scene order
 * (platform by platform, stations then checkpoints then artifacts) when no
 * column is chosen — the same walk the keyboard takes through the scene.
 */
export function orchSortRows<T extends { title: string; kind: OrchObjectKind; state: string; platformLabel: string }>(rows: readonly T[], sort: OrchListSort): T[] {
  if (sort.key === null) return [...rows]
  const key = sort.key
  const of = (r: T): string => key === 'name' ? r.title : key === 'kind' ? r.kind : key === 'state' ? r.state : r.platformLabel
  return rows.map((r, i) => ({ r, i })).sort((a, b) => (of(a.r).localeCompare(of(b.r)) * sort.dir) || a.i - b.i).map((x) => x.r)
}

/** The next sort for a header click: none → ascending → descending → none. */
export function orchNextSort(current: OrchListSort, key: OrchListSortKey): OrchListSort {
  if (current.key !== key) return { key, dir: 1 }
  if (current.dir === 1) return { key, dir: -1 }
  return { key: null, dir: 1 }
}
