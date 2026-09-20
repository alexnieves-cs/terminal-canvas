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
 * Height is never a hidden quantitative score: every platform has the same three
 * layers (a base, a middle tier and the deck the stations stand on) and the same
 * thickness; selection lifts by a fixed, finite amount. Those layers are
 * DECORATIVE and expendable before hit accuracy or legibility — the hit-target
 * is the base plate's footprint, computed here, and nothing about the layers
 * changes it.
 *
 * M294. The plate is the reference's ISOMETRIC DIAMOND: a square of side
 * `ORCH_PLATFORM.side` rotated 45° in its own plane BEFORE the stage tilt, so it
 * projects to a rhombus `2·half` wide and `2·half·cos(tilt)` tall. Its footprint
 * is therefore a POLYGON, not a box, and the hit rule follows the mesh: the
 * hit-target is the six-point outline `orchPlatformHitPolygon` cuts (the top
 * face's diamond plus the thickness band under its lower edges), tested with a
 * point-in-polygon in `orchHitAt` and drawn as the same `<polygon>` in the SVG —
 * a box would have answered a click in the diamond's empty corners with the
 * wrong island, silently. Stations stand on the deck inside the diamond's
 * inscribed axis-aligned square (half-side `half / 2`), which is why the pitch
 * adapts to the count (`orchStationPitch`) instead of a fixed 46.
 *
 * Cells are a ZIG-ZAG strip, still a function of the index alone: even indices
 * take the lower row, odd the upper, each half a pitch further right, so
 * neighbouring diamonds interlock and a fleet of three fills the stage's
 * height as well as its width (one straight row sat in the middle third). The
 * workspace plate is index 0 (lower-left); the reported `cell` stays the
 * 3-wide append index (`col = i % 3`, `row = ⌊i / 3⌋`) the live-update check
 * derives "the next cell" from — it is an ordinal, not a position.
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

/**
 * The plate: a square of `side` (pre-rotation), three stacked layers each
 * `inset` smaller than the one under it, every layer `thickness` thick (model
 * z-units; the base is the full thickness, the tiers above it half each), and
 * `stack` the z from the base's top face to the deck's — the screen rise the
 * view lifts a standing station by, so it stands ON the deck, not in it.
 */
export const ORCH_PLATFORM = { side: 220, inset: 14, thickness: 10, stack: 10, layers: 3 } as const
/** Half the diamond's diagonal (pre-tilt): the plate's half-width on screen at k = 1, and its pre-tilt half-height. */
export const ORCH_PLATFORM_HALF = ORCH_PLATFORM.side / Math.SQRT2
/**
 * Model units. `cols` is the width of the APPEND INDEX (`cell.col/row`), not a
 * row of geometry: positions come from the zig-zag lattice below. `gap` is the
 * clearance between two interlocking diamonds' edges (pre-tilt units).
 */
export const ORCH_CELL = { cols: 3, x0: 1, y0: 4, gap: 20, perBand: 6 } as const
/**
 * M298. Bands PAST the first widen by this many cells each, and each band
 * starts one x-pitch further left per widening, so the fleet grows as a
 * pyramid centred under band 0 rather than a strip of six: measured on the
 * model stage, 25 platforms in fixed bands of six were 42% as wide as the
 * stage and 106% as tall (Fit all clipped), 100 were 29% wide and could not
 * fit at the zoom floor. Band 0 is exactly M294's, so the first six cells
 * (the counts a person actually has) do not move; a returning user with more
 * finds the seventh onward moved ONCE, by this change, and never again.
 */
export const ORCH_BAND_GROWTH = 2
/** The lattice: half a diamond-plus-gap per index along x; the two rows a diamond-plus-gap apart. */
export const ORCH_LATTICE = { xPitch: ORCH_PLATFORM_HALF + ORCH_CELL.gap / 2, rowPitch: ORCH_PLATFORM_HALF + ORCH_CELL.gap } as const
/** Station pitch bounds on the deck (adaptive to the count, see orchStationPitch) and the object sizes (half-extents the meshes read). */
export const ORCH_PITCH = { min: 46, max: 76 } as const
export const ORCH_OBJECT_SIZE = { station: 17, checkpoint: 14, artifact: 13 } as const
/**
 * M294. The finite selection lift, in SCREEN pixels along world y (up). The
 * first cut lifted 6 units along z, which an orthographic camera cannot show —
 * a pure z move has no perspective — so "selected" painted nothing. The hit
 * polygon, the label and the objects on the plate move by the same amount, so
 * the target keeps following the mesh; the mesh damps to it (reduced motion snaps).
 */
export const ORCH_SELECT_LIFT = 14

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
  /** Which layer it stands on: 1 = the deck (stations), 0 = the base ring (checkpoints, artifacts). */
  layer: 0 | 1
  /**
   * M294. Nothing of its kind stands in the grid row below it on this plate —
   * the space a resting name plate hangs into is free. The compact name tier
   * needs it; the full tier (a wide pitch) does not.
   */
  front: boolean
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
  /**
   * M294. Where the label plate hangs: `above` the top tip on the upper row,
   * `below` the bottom tip on the lower row — a lower plate's top tip points
   * into the V between two upper plates, where a label would cover their bodies.
   */
  labelSide: 'above' | 'below'
  /** Model-space centre and the diamond's BOUNDING footprint (the base plate, pre-tilt): `w = h = 2 · half`. */
  x: number
  y: number
  w: number
  h: number
  /** The square's side before its 45° turn; `half = side / √2` is the diamond's half-diagonal. */
  side: number
  half: number
  /** The station pitch this plate seats its grid at (adaptive, see orchStationPitch). */
  pitch: number
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

/**
 * A cell's centre from its index alone. The zig-zag: within a band of
 * `perBand` indices, index r stands `r · xPitch` to the right, on the LOWER
 * row when r is even and the upper when odd — the workspace (index 0) is
 * lower-left, the first island upper-middle, the second lower-right, so three
 * platforms form a centred cluster; bands stack down, two rows apart.
 */
export function orchCellCentre(index: number): { col: number; row: number; x: number; y: number } {
  const col = index % ORCH_CELL.cols
  const row = Math.floor(index / ORCH_CELL.cols)
  const { band, r } = orchBandOf(index)
  const half = ORCH_PLATFORM_HALF
  return {
    col, row,
    // M298: band b holds perBand + b·growth cells and starts b·growth/2 pitches
    // further left, so every band is centred under the first (the pyramid).
    x: ORCH_CELL.x0 + half + (r - band * ORCH_BAND_GROWTH / 2) * ORCH_LATTICE.xPitch,
    y: ORCH_CELL.y0 + half + band * 2 * ORCH_LATTICE.rowPitch + (r % 2 === 0 ? ORCH_LATTICE.rowPitch : 0)
  }
}

/** M298. Which band an index falls in and its position within it — bands widen by ORCH_BAND_GROWTH each (6, 8, 10 …). */
export function orchBandOf(index: number): { band: number; r: number; width: number } {
  let band = 0
  let start = 0
  for (;;) {
    const width = ORCH_CELL.perBand + band * ORCH_BAND_GROWTH
    if (index < start + width) return { band, r: index - start, width }
    start += width
    band += 1
  }
}

/** Grid columns for n objects: square-ish, at most `max` on a resting plate. */
function gridCols(n: number, max: number): number {
  return Math.max(1, Math.min(max, Math.ceil(Math.sqrt(Math.max(1, n)))))
}

/** The axis-aligned square a diamond of half-diagonal `half` inscribes: its half-side. */
export const orchInscribedHalf = (half: number): number => half / 2

/**
 * The pitch a resting plate seats a `cols × rows` grid at: as wide as the
 * inscribed square allows, between `ORCH_PITCH.min` and `.max` — two stations
 * stand far enough apart for full name plates, nine still fit the deck.
 */
export function orchStationPitch(cols: number, rows: number, half: number = ORCH_PLATFORM_HALF): number {
  const room = (orchInscribedHalf(half) - ORCH_OBJECT_SIZE.station - 6) * 2
  const span = Math.max(1, Math.max(cols, rows) - 1)
  return Math.max(ORCH_PITCH.min, Math.min(ORCH_PITCH.max, Math.floor(room / span)))
}

/** The side an EXPANDED plate needs so a `cols × rows` grid at `pitch` fits its inscribed square. */
function expandedSide(cols: number, rows: number, pitch: number): number {
  const halfNeeded = (Math.max(cols, rows) - 1) * pitch / 2 + ORCH_OBJECT_SIZE.station + 10
  return Math.max(ORCH_PLATFORM.side, halfNeeded * 2 * Math.SQRT2)
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
    // Stations on the deck: a grid centred in the diamond's inscribed square.
    // Past the cap (focused) the plate grows to seat them all; the diamond then
    // may exceed its cell and paints OVER its neighbours (last in the overlay).
    const cols = gridCols(seated.length, expanded ? Math.max(3, Math.ceil(Math.sqrt(seated.length))) : 3)
    const rows = Math.max(1, Math.ceil(seated.length / cols))
    const pitch = expanded ? ORCH_PITCH.max : orchStationPitch(cols, rows)
    const side = expanded ? expandedSide(cols, rows, pitch) : ORCH_PLATFORM.side
    const half = side / Math.SQRT2
    const w = half * 2
    const h = half * 2
    const gridX0 = cell.x - ((cols - 1) * pitch) / 2
    const gridY0 = cell.y - ((rows - 1) * pitch) / 2
    const stations: OrchSceneObject[] = seated.map((r, i) => ({
      id: r.id, title: r.title, kind: 'station', panelKind: r.kind, state: r.state, platformId: slot.id,
      x: gridX0 + (i % cols) * pitch, y: gridY0 + Math.floor(i / cols) * pitch, size: ORCH_OBJECT_SIZE.station, layer: 1,
      front: i + cols >= seated.length
    }))
    // Checkpoints walk the base ring's lower-LEFT edge from the left tip toward
    // the bottom tip, artifacts the lower-RIGHT edge from the right tip — the
    // stations' inscribed square never reaches those tips, so the evidence stands
    // clear of the grid, and the two kinds are on two sides as well as two shapes.
    const alongEdge = (i: number, sign: -1 | 1): { x: number; y: number } => {
      const t = 0.14 + 0.16 * i
      return { x: cell.x + sign * (half - t * half - 12), y: cell.y + t * half - 12 }
    }
    const checkpoints: OrchSceneObject[] = checks.map((r, i) => ({
      id: r.id, title: r.title, kind: 'checkpoint', panelKind: 'watcher', state: r.state, platformId: slot.id,
      ...alongEdge(i, -1), size: ORCH_OBJECT_SIZE.checkpoint, layer: 0, front: i === checks.length - 1
    }))
    const artifacts: OrchSceneObject[] = files.map((f, i) => ({
      id: f.id, title: f.title, kind: 'artifact', panelKind: 'file', state: 'idle', platformId: slot.id,
      ...alongEdge(i, 1), size: ORCH_OBJECT_SIZE.artifact, layer: 0, front: i === files.length - 1, path: f.path
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
      labelSide: index % 2 === 0 ? 'below' : 'above',
      x: cell.x, y: cell.y, w, h, side, half, pitch, expanded,
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
  // The words that matter most come FIRST, because the line is cut to its
  // backing on a small plate (the critic found `needs you` past the ellipsis).
  if (c.needsYou > 0) parts.push(`${c.needsYou} ${c.needsYou === 1 ? 'needs' : 'need'} you`)
  if (c.live > 0) parts.push(`${c.live} working`)
  if (c.stations > 0) parts.push(`${c.stations} ${c.stations === 1 ? 'station' : 'stations'}`)
  if (c.checkpoints > 0) parts.push(`${c.checkpoints} ${c.checkpoints === 1 ? 'check' : 'checks'}`)
  if (c.artifacts > 0) parts.push(`${c.artifacts} ${c.artifacts === 1 ? 'file' : 'files'}`)
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

/**
 * Model-space bounds of every platform's DIAMOND (pre-tilt), for Fit all.
 * M298: the plates only. The first cut folded label room into these bounds
 * in pre-tilt units (90), which scale with k — but the label plate is
 * SCREEN-sized (ORCH_PLATE_LABEL, 44 px and an 8 px gap), so at k = 1.57 (one
 * platform) the room was 79 px for a 52 px label and at k = 0.65 (eight) it
 * was 33 px: the labels clipped, measured in the real panel. The label's
 * room is `orchLabelMargins`, in pixels, and orchFitCamera takes it as such.
 */
export function orchPlatformBounds(platforms: readonly OrchPlatform[]): { x: number; y: number; w: number; h: number } {
  if (platforms.length === 0) return { x: 0, y: 0, w: ORCH_PLATFORM_HALF * 2, h: ORCH_PLATFORM_HALF * 2 }
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  for (const p of platforms) {
    x0 = Math.min(x0, p.x - p.w / 2); x1 = Math.max(x1, p.x + p.w / 2)
    y0 = Math.min(y0, p.y - p.h / 2)
    y1 = Math.max(y1, p.y + p.h / 2)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
/** The label plate under/over a platform's tip: screen px, never scaled by the camera. */
export const ORCH_PLATE_LABEL = { w: 210, h: 44, gap: 8 } as const
/** The `+N more` chip on a label's far side (M298: there, not beside it — beside, it ran past the fit's width). */
export const ORCH_PLATE_MORE = { h: 18, gap: 6 } as const
/** The thickness band under a diamond's lower edges, in screen px at k = 1 (ORCH_PLATFORM.thickness · sin tilt). */
const ORCH_BAND_PX = ORCH_PLATFORM.thickness * Math.sin((56 * Math.PI) / 180)
/**
 * M298. Screen-pixel room the fit must leave above and below the plates for
 * their label plates: a side is reserved only when some platform hangs a
 * label there. Fit selected on a lower-row plate reserves the bottom, an
 * upper-row plate the top — the same number either way, so neither row's
 * plate lands off-centre.
 */
export function orchLabelMargins(platforms: readonly OrchPlatform[]): { top: number; bottom: number; side: { px: number; at: number } } {
  const room = ORCH_PLATE_LABEL.h + ORCH_PLATE_LABEL.gap
  // The `+N more` chip stands on the label's far side; its row is reserved only when a plate has one.
  const chip = (side: 'above' | 'below'): number => (platforms.some((p) => p.labelSide === side && p.hidden.ids.length > 0) ? ORCH_PLATE_MORE.h + ORCH_PLATE_MORE.gap : 0)
  return {
    top: platforms.some((p) => p.labelSide === 'above') ? room + chip('above') : 0,
    bottom: platforms.some((p) => p.labelSide === 'below') ? room + chip('below') + ORCH_BAND_PX : ORCH_BAND_PX,
    // Sideways: a label is half its width either side of its plate's centre,
    // and that centre is `half` model units inside the bounds' edge — when the
    // fit is width-bound and far out (25 platforms, wide window: 104% measured)
    // the label, not the diamond, is the outermost thing.
    side: { px: ORCH_PLATE_LABEL.w / 2, at: platforms.reduce((m, p) => Math.min(m, p.half), ORCH_PLATFORM_HALF) }
  }
}

export interface OrchHitTarget {
  id: string; kind: 'platform' | OrchObjectKind; x: number; y: number; w: number; h: number; platformId?: string
  /** M294. A platform's outline; when present the test is point-in-polygon and the box is only its bounds. */
  points?: readonly { x: number; y: number }[]
}

/**
 * M294. The platform's hit outline ON SCREEN: the projected diamond (centre,
 * half-width `hx`, half-height `hy = hx · cos tilt`) plus the thickness band
 * `band` px under its two lower edges — the six points the mesh's silhouette
 * has. The stacked tiers rise inside this outline (each tier is inset further
 * than it rises), so the base's silhouette IS the platform's.
 */
export function orchPlatformHitPolygon(c: { x: number; y: number }, hx: number, hy: number, band: number): { x: number; y: number }[] {
  return [
    { x: c.x, y: c.y - hy }, { x: c.x + hx, y: c.y }, { x: c.x + hx, y: c.y + band },
    { x: c.x, y: c.y + hy + band }, { x: c.x - hx, y: c.y + band }, { x: c.x - hx, y: c.y }
  ]
}

export function orchPolygonBounds(points: readonly { x: number; y: number }[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  for (const p of points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Even-odd point-in-polygon, edges inclusive enough for a click on the outline. */
export function orchPointInPolygon(pt: { x: number; y: number }, points: readonly { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!; const b = points[j]!
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * The topmost target under a point, in PAINT order (the last target containing
 * the point wins) — the same rule the overlay SVG's DOM order applies, so a
 * plain-node check and `document.elementFromPoint` answer alike. Platforms
 * paint far-to-near and objects after every platform, because an object only
 * ever overlaps what is BEHIND it on screen (it stands up from its plate), and
 * an expanded platform paints after its neighbours because it covers them.
 * A platform target carries its polygon; an object is its box.
 */
export function orchHitAt(point: { x: number; y: number }, targets: readonly OrchHitTarget[]): OrchHitTarget | null {
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i]!
    if (t.points !== undefined) { if (orchPointInPolygon(point, t.points)) return t; continue }
    if (point.x >= t.x && point.x <= t.x + t.w && point.y >= t.y && point.y <= t.y + t.h) return t
  }
  return null
}

/**
 * M294. The part of segment a→b OUTSIDE both outlines: from where it leaves
 * `outlineA` to where it enters `outlineB` — so a connector runs from one
 * plate's edge to the next and never across a body. Null when the outlines
 * overlap along the segment (nothing to draw) or an end is not inside its outline.
 */
export function orchSegmentBetween(a: { x: number; y: number }, b: { x: number; y: number }, outlineA: readonly { x: number; y: number }[], outlineB: readonly { x: number; y: number }[]): { x1: number; y1: number; x2: number; y2: number } | null {
  const crossings = (outline: readonly { x: number; y: number }[]): number[] => {
    const ts: number[] = []
    const dx = b.x - a.x; const dy = b.y - a.y
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const p = outline[j]!; const q = outline[i]!
      const ex = q.x - p.x; const ey = q.y - p.y
      const den = dx * ey - dy * ex
      if (Math.abs(den) < 1e-9) continue
      const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den
      const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) ts.push(t)
    }
    return ts
  }
  const exitA = Math.max(...crossings(outlineA), -Infinity)
  const enterB = Math.min(...crossings(outlineB), Infinity)
  if (!Number.isFinite(exitA) || !Number.isFinite(enterB) || enterB <= exitA) return null
  return { x1: a.x + (b.x - a.x) * exitA, y1: a.y + (b.y - a.y) * exitA, x2: a.x + (b.x - a.x) * enterB, y2: a.y + (b.y - a.y) * enterB }
}

/**
 * M294. The scene's connectors — light paths that make it read as connected,
 * and are GROUPING, never dependency: a path from each platform to the next in
 * lattice order, and a chain along a plate's seated stations. There is no hub
 * and no supervisor node: a path joins two things that exist. Authored
 * dependency edges (M289) are a different element with a different word; the
 * lens dims these and focuses only on those.
 */
export interface OrchConnector { kind: 'platform' | 'station'; from: string; to: string; platformId: string }
export function orchConnectors(platforms: readonly OrchPlatform[]): OrchConnector[] {
  const out: OrchConnector[] = []
  for (let i = 1; i < platforms.length; i++) out.push({ kind: 'platform', from: platforms[i - 1]!.id, to: platforms[i]!.id, platformId: platforms[i]!.id })
  for (const p of platforms) for (let i = 1; i < p.stations.length; i++) out.push({ kind: 'station', from: p.stations[i - 1]!.id, to: p.stations[i]!.id, platformId: p.id })
  return out
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
 * M294. What name plate a resting object gets, by the DENSITY at this zoom:
 * `full` (glyph, name, state word) when the station pitch on screen clears a
 * full plate's width; `compact` (name and state word in two short lines, cut
 * to the pitch) when the pitch is narrower but nothing stands in the row the
 * plate hangs into; `none` past that — the name stays on hover, on its card
 * and in the List. A density rule that degrades by tier rather than a switch
 * that hides every name at rest (the critic's "no names on stations").
 */
export type OrchNameTier = 'full' | 'compact' | 'none'
export const ORCH_NAME_PITCH_PX = { full: 96, compact: 56 } as const
export function orchNameTier(pitchPx: number, front: boolean): OrchNameTier {
  if (pitchPx >= ORCH_NAME_PITCH_PX.full) return 'full'
  if (pitchPx >= ORCH_NAME_PITCH_PX.compact && front) return 'compact'
  return 'none'
}

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
