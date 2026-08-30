import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import type { Point, WorldRect } from '@renderer/canvas/viewport'
import type { ReviewSubject } from '@shared/review'
import type { FileSource } from '@shared/file-panel'

export type { ReviewSubject }

export interface PanelBase {
  rect: WorldRect
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

/**
 * A panel with a PTY behind an xterm — what `Panel` meant on its own until
 * M9b.
 */
export interface TerminalPanel extends PanelBase {
  kind: 'terminal'
  spec: PanelSpecTemplate
}

/**
 * A non-terminal panel: a rendered review of what one agent changed.
 *
 * It has no spec, and that absence is the point rather than an omission —
 * there is nothing to spawn, so it never reaches assignTiers, never reaches
 * registry.ensure, and can take neither a LIVE_BUDGET slot nor a WebGL
 * context. Canvas.tsx partitions on kind BEFORE tiering so that is
 * structurally true rather than merely unasked-for.
 */
export interface ReviewPanel extends PanelBase {
  kind: 'review'
  subject: ReviewSubject
}

/**
 * A local file rendered on the canvas, watched by main.
 *
 * The SECOND sessionless kind, and its arrival is what forces isTerminalPanel
 * below to exist. Like a review node it has no spec, so it never reaches
 * assignTiers, never reaches registry.ensure, and can take neither a
 * LIVE_BUDGET slot nor a WebGL context — structurally, via Canvas.tsx's
 * partition, rather than by a guard anyone has to remember.
 */
export interface FilePanel extends PanelBase {
  kind: 'file'
  source: FileSource
}

export type Panel = TerminalPanel | ReviewPanel | FilePanel

/**
 * The only kind test written against a `Panel` anywhere, and it is
 * deliberately positive. (Other reads of a `kind` field exist and are not
 * this: `layout-schema.ts` and `layout-adapt.ts`'s toPanels branch on the
 * PERSISTED record on the way in from disk, before a `Panel` exists at all;
 * `Inspector.tsx` branches on `InspectorModel.kind`, an already-built view
 * model; and `railTail` branches on a bare `Panel['kind']` argument it was
 * handed. Nothing but this function asks a live `Panel` what it is.)
 *
 * Never write `kind === 'terminal'` anywhere: `kind` is absent in every
 * layout.json written before M9b (see parsePanel) and in every verify
 * fixture written before it, and both must keep meaning "terminal". Asking
 * only whether something IS a review node makes the default fall the safe
 * way everywhere at once — a terminal panel misread as a review node stops
 * spawning silently on a restored canvas, while a review node misread as a
 * terminal fails loudly the first time anything reads its absent spec.
 */
export function isReviewPanel(panel: Panel): panel is ReviewPanel {
  return panel.kind === 'review'
}

export function isFilePanel(panel: Panel): panel is FilePanel {
  return panel.kind === 'file'
}

/**
 * The partition test, and the reason it is spelled as a negation of the known
 * non-terminal kinds rather than as `kind === 'terminal'`.
 *
 * Canvas.tsx spelled "is a terminal panel" as `!isReviewPanel(p)` until M13,
 * and that was correct with exactly one non-terminal kind. With two it is
 * wrong in the DANGEROUS direction: a file panel satisfies !isReviewPanel,
 * lands in terminalPanels, reaches assignTiers and registry.ensure with no
 * spec, and mints a PanelSession for a <pre> — burning a LIVE_BUDGET slot and
 * a WebGL context on a panel that has no process.
 *
 * Written this way rather than as a positive `kind === 'terminal'` test
 * because absence must keep meaning terminal: `kind` is absent in every
 * layout.json written before M9b and in every verify fixture written before
 * it. A fourth kind edits exactly this one line.
 */
export function isTerminalPanel(panel: Panel): panel is TerminalPanel {
  return !isReviewPanel(panel) && !isFilePanel(panel)
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
 *
 * Goes through a small local helper rather than twelve edited literals, so
 * the coordinates verify:panels' fixtures depend on cannot be disturbed by
 * the M9b `kind` edit.
 */
const seed = (id: string, x: number, y: number, z: number): TerminalPanel => ({
  kind: 'terminal',
  rect: { id, x, y, w: PANEL_W, h: PANEL_H },
  spec: shell(id),
  z
})

export const SEED_PANELS: Panel[] = [
  seed('s01', 0, 0, 1), seed('s02', 800, 0, 2), seed('s03', 1600, 0, 3),
  seed('s04', 0, 540, 4), seed('s05', 800, 540, 5), seed('s06', 1600, 540, 6),
  seed('s07', -900, 270, 7), seed('s08', -900, 810, 8), seed('s09', 2500, 270, 9),
  seed('s10', 400, 1100, 10), seed('s11', 1200, 1100, 11), seed('s12', 400, -640, 12)
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
  return [{ kind: 'terminal', rect: { id: FIRST_RUN_ID, x: -PANEL_W / 2, y: -PANEL_H / 2, w: PANEL_W, h: PANEL_H }, spec: shell(FIRST_RUN_ID), z: 1 }]
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
): TerminalPanel {
  const w = size?.w ?? PANEL_W
  const h = size?.h ?? PANEL_H
  return {
    kind: 'terminal',
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

/**
 * A review node is TALLER and NARROWER than a terminal panel: it is a list of
 * paths and a column of diff lines, both of which read better in a portrait
 * box than in the 720x460 landscape one a terminal wants.
 */
export const REVIEW_W = 640
export const REVIEW_H = 520

/** World units between a subject's right edge and its review node's left. */
export const REVIEW_GAP = 40

/**
 * Beside the subject, top-aligned with it, so the pair reads as one unit at
 * any zoom.
 *
 * The RESULT is a request, not a decision: Canvas.tsx runs it through
 * cascadeCentre exactly as onSpawn does, so opening two reviews of one panel
 * does not stack them byte-identically — the coincidence rule M6 established,
 * which review nodes inherit for free because cascadeCentre reads rects and
 * knows nothing about kinds.
 */
export function reviewCentre(subject: WorldRect, w = REVIEW_W, h = REVIEW_H): Point {
  return { x: subject.x + subject.w + REVIEW_GAP + w / 2, y: subject.y + h / 2 }
}

/**
 * Centred exactly on the point it is given, the contract makePanel has.
 *
 * `subject` is carried VERBATIM. Do not copy makePanel's `{ ...spec, panelId:
 * id }` line here: that line exists because a spec's panelId names the panel
 * ITSELF, while a subject's subjectId names a DIFFERENT panel. Forcing the
 * minted id into it makes the node a review of itself — no baseline, "not
 * started" forever, and nothing anywhere saying why. verify:viewport 76.
 */
export function makeReviewPanel(
  id: string,
  centre: Point,
  z: number,
  subject: ReviewSubject,
  size?: { w?: number; h?: number }
): ReviewPanel {
  const w = size?.w ?? REVIEW_W
  const h = size?.h ?? REVIEW_H
  return {
    kind: 'review',
    rect: { id, x: centre.x - w / 2, y: centre.y - h / 2, w, h },
    subject,
    z
  }
}

/**
 * A file panel is a READING surface: the review node's portrait box, for the
 * review node's reason, not the terminal's 720x460 landscape one.
 */
export const FILE_W = 640
export const FILE_H = 520

/**
 * Centred exactly on the point it is given, the contract makePanel has.
 *
 * `source` is copied field by field rather than carried by reference, so a
 * caller reusing its object cannot mutate a mounted panel's path underneath
 * it. It is emphatically NOT rewritten: do not copy makePanel's
 * `{ ...spec, panelId: id }` line here — a spec's panelId names the panel
 * itself, and there is no field here that names a panel at all.
 */
export function makeFilePanel(
  id: string,
  centre: Point,
  z: number,
  source: FileSource,
  size?: { w?: number; h?: number }
): FilePanel {
  const w = size?.w ?? FILE_W
  const h = size?.h ?? FILE_H
  return {
    kind: 'file',
    rect: { id, x: centre.x - w / 2, y: centre.y - h / 2, w, h },
    source: { path: source.path },
    z
  }
}
