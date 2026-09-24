/**
 * M287. ORCHESTRATE'S LAYOUT, persisted PER WORKSPACE — what Phase A held in
 * memory (`renderer/orchestration/orchestration-prefs.ts`), now a record on
 * the workspace beside `annotations` and `starter`, with the record rules
 * those two obey: ABSENT on every pre-M287 file and on a workspace whose
 * Orchestrate page was never opened (nothing is written until something
 * changes), a malformed record dropped BY NAME with the workspace kept, and
 * every field optional so a later field costs nobody a rewrite.
 *
 * The workbench's height and tab are the plan's "persist panel sizes per
 * workspace"; the lens, mode, side tab and camera ride along so a relaunch
 * returns to the same view. The SELECTION is not here, for Phase A's reason:
 * a selection that survived the page toggle re-aimed the pool and the feed
 * at a session the user had left. Nothing the canvas owns — its camera, its
 * pane preferences — is in this record, and nothing here reads them.
 *
 * Pure: no DOM, no React, no electron. `verify:layout orchestrate.1`.
 */

/**
 * M300. FIVE TABS, and the last two arrived with their readers. M287 pinned
 * this list at three deliberately — "an empty tab is a promise the page
 * cannot keep" — so Artifacts and Timeline were not stubbed until the durable
 * record existed to fill them. The order is the plan's: what changed, what
 * validated it, what it printed, what it produced, what happened.
 */
export type WorkbenchTab = 'changes' | 'checks' | 'output' | 'artifacts' | 'timeline' | 'combine'
/**
 * M311. A SIXTH, with its reader: Combine (OrchCombine.tsx) answers whether
 * the repository's lanes are safe to put together — overlaps, same-checkout
 * contention, a proposed order, and a check on the combined tree. Last,
 * because it is about every lane, not the subject.
 */
export const WORKBENCH_TABS: readonly WorkbenchTab[] = ['changes', 'checks', 'output', 'artifacts', 'timeline', 'combine']

/** The workbench cannot be dragged shut, and cannot swallow the scene. */
export const WORKBENCH_MIN_HEIGHT = 120
export const WORKBENCH_MAX_HEIGHT = 720
/**
 * M299. The resting height, now that the strip rests OPEN: 200, measured so the
 * scene panel is no shorter than it was under M282's tiles at the wide window
 * (1128×649 before; 240 left it 614) and 90 px taller at the default one.
 */
export const WORKBENCH_DEFAULT_HEIGHT = 200

/**
 * M302. A SAVED VIEW: filters, camera and layout, and NOTHING ELSE.
 *
 * The plan's rule is that a saved view records no runtime mutations, and the
 * TYPE is where that is enforced rather than in a reviewer's memory. There is
 * no panel id, no work-item id, no session, no command and no verb in this
 * record — so "opening a saved view starts nothing" is not a promise about
 * the code that applies it, it is a fact about what the record can hold.
 *
 * A SELECTION is deliberately not here either, for Phase A's reason: a
 * selection that came back with a view would re-aim the pool and the feed at
 * a session the person had left — and after a relaunch, at one that may not
 * exist at all.
 */
export interface OrchSavedView {
  id: string
  name: string
  lens?: 'scene' | 'list' | 'watch'
  mode?: 'dev' | 'pipeline'
  sideTab?: 'activity' | 'files'
  camera?: { x: number; y: number; k: number }
  workbench?: { height: number; tab: WorkbenchTab; open?: boolean }
}

/** The newest kept; a workspace with a hundred views is a menu nobody reads. */
export const ORCH_VIEWS_MAX = 12

export interface PersistedOrchestrate {
  /**
   * `open` absent is OPEN (M299): the workbench is the page's evidence area and
   * rests at its height; only a person's collapse is written, as `open: false`.
   * M287 wrote `open: true` and read absence as closed — that rest state was
   * chosen with five jump tiles under the scene, and those tiles are gone.
   * A pre-M299 record's `open: true` still parses; its absence now reads open.
   */
  workbench?: { height: number; tab: WorkbenchTab; open?: boolean }
  /**
   * M325. The page opens on the TASK LIST; the scene, Watch and the List are
   * an optional visualisation a person chooses. Only that choice is written,
   * as `'visualize'` — ABSENT is the task list, which is what makes every
   * pre-M325 record (all of which carry a `lens`) open on the tasks too.
   */
  view?: 'visualize'
  lens?: 'scene' | 'list' | 'watch'
  mode?: 'dev' | 'pipeline'
  sideTab?: 'activity' | 'files'
  camera?: { x: number; y: number; k: number }
  /**
   * M288. The islands' presentation ORDER, by island id, oldest first. A new
   * island appends and never re-arranges the ones a person already knows; a
   * move is presentation only (never a dispatch) and is undoable on the page.
   * Ids that no longer name an island are dropped on read.
   */
  islands?: string[]
  /**
   * M302. The person's saved views, oldest first. Absent on every pre-M302
   * file; a malformed view is dropped BY NAME with its siblings kept, which
   * is the field rule applied one level down.
   */
  views?: OrchSavedView[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function clampWorkbenchHeight(h: number): number {
  return Math.min(WORKBENCH_MAX_HEIGHT, Math.max(WORKBENCH_MIN_HEIGHT, Math.round(h)))
}

/**
 * Absent → undefined (the caller writes no key). Not an object → dropped by
 * name. Inside, each field is parsed on its own: a malformed height or an
 * unknown tab costs the workbench field and keeps the lens beside it — the
 * field rule, applied per field. An EMPTY record parses to undefined too,
 * so a file cannot carry `"orchestrate": {}` as a claim about nothing.
 */
export function parseOrchestrate(raw: unknown, warnings: string[]): PersistedOrchestrate | undefined {
  if (raw === undefined) return undefined
  if (!isRecord(raw)) {
    warnings.push('dropped an orchestrate record that was not an object')
    return undefined
  }
  const out: PersistedOrchestrate = {}
  const wb = raw.workbench
  if (isRecord(wb) && isNum(wb.height) && WORKBENCH_TABS.includes(wb.tab as WorkbenchTab)) {
    out.workbench = { height: clampWorkbenchHeight(wb.height), tab: wb.tab as WorkbenchTab, ...(typeof wb.open === 'boolean' ? { open: wb.open } : {}) }
  } else if (wb !== undefined) warnings.push('dropped a malformed orchestrate workbench')
  if (raw.view === 'visualize') out.view = 'visualize'
  if (raw.lens === 'scene' || raw.lens === 'list' || raw.lens === 'watch') out.lens = raw.lens
  if (raw.mode === 'dev' || raw.mode === 'pipeline') out.mode = raw.mode
  if (raw.sideTab === 'activity' || raw.sideTab === 'files') out.sideTab = raw.sideTab
  const c = raw.camera
  if (isRecord(c) && isNum(c.x) && isNum(c.y) && isNum(c.k) && c.k > 0) out.camera = { x: c.x, y: c.y, k: c.k }
  if (Array.isArray(raw.islands)) {
    const ids = raw.islands.filter((v): v is string => typeof v === 'string' && v !== '')
    if (ids.length === raw.islands.length) { if (ids.length > 0) out.islands = [...new Set(ids)] } else warnings.push('dropped a malformed orchestrate islands order')
  } else if (raw.islands !== undefined) warnings.push('dropped a malformed orchestrate islands order')
  const views = raw.views
  if (Array.isArray(views)) {
    const kept: OrchSavedView[] = []
    for (const v of views) {
      const parsedView = parseSavedView(v)
      if (parsedView === null) warnings.push('dropped a malformed orchestrate saved view')
      else kept.push(parsedView)
    }
    if (kept.length > 0) out.views = kept.slice(-ORCH_VIEWS_MAX)
  } else if (views !== undefined) warnings.push('dropped a malformed orchestrate views list')
  return Object.keys(out).length === 0 ? undefined : out
}

/**
 * One view, field by field. A view with no id or no name is not a view — it
 * could not be opened or named — so it is dropped; every OTHER field is
 * optional and a malformed one costs that field, because a view whose camera
 * is corrupt is still a usable lens-and-layout view.
 */
function parseSavedView(raw: unknown): OrchSavedView | null {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || raw.id === '') return null
  if (typeof raw.name !== 'string' || raw.name.trim() === '') return null
  const out: OrchSavedView = { id: raw.id, name: raw.name }
  if (raw.lens === 'scene' || raw.lens === 'list' || raw.lens === 'watch') out.lens = raw.lens
  if (raw.mode === 'dev' || raw.mode === 'pipeline') out.mode = raw.mode
  if (raw.sideTab === 'activity' || raw.sideTab === 'files') out.sideTab = raw.sideTab
  const c = raw.camera
  if (isRecord(c) && isNum(c.x) && isNum(c.y) && isNum(c.k) && c.k > 0) out.camera = { x: c.x, y: c.y, k: c.k }
  const wb = raw.workbench
  if (isRecord(wb) && isNum(wb.height) && WORKBENCH_TABS.includes(wb.tab as WorkbenchTab)) {
    out.workbench = { height: clampWorkbenchHeight(wb.height), tab: wb.tab as WorkbenchTab, ...(typeof wb.open === 'boolean' ? { open: wb.open } : {}) }
  }
  return out
}

/** A fresh object, field by field — a spread would write `lens: undefined` as a present key. */
export function carryOrchestrate(p: PersistedOrchestrate): PersistedOrchestrate {
  return {
    ...(p.workbench === undefined ? {} : { workbench: { height: p.workbench.height, tab: p.workbench.tab, ...(p.workbench.open === true ? { open: true as const } : {}) } }),
    ...(p.view === 'visualize' ? { view: 'visualize' as const } : {}),
    ...(p.lens === undefined ? {} : { lens: p.lens }),
    ...(p.mode === undefined ? {} : { mode: p.mode }),
    ...(p.sideTab === undefined ? {} : { sideTab: p.sideTab }),
    ...(p.camera === undefined ? {} : { camera: { x: p.camera.x, y: p.camera.y, k: p.camera.k } }),
    ...(p.islands === undefined || p.islands.length === 0 ? {} : { islands: [...p.islands] }),
    ...(p.views === undefined || p.views.length === 0 ? {} : { views: p.views.map(carrySavedView) })
  }
}

/** A fresh view object, field by field, for `carryOrchestrate`'s reason. */
function carrySavedView(v: OrchSavedView): OrchSavedView {
  return {
    id: v.id,
    name: v.name,
    ...(v.lens === undefined ? {} : { lens: v.lens }),
    ...(v.mode === undefined ? {} : { mode: v.mode }),
    ...(v.sideTab === undefined ? {} : { sideTab: v.sideTab }),
    ...(v.camera === undefined ? {} : { camera: { x: v.camera.x, y: v.camera.y, k: v.camera.k } }),
    ...(v.workbench === undefined ? {} : { workbench: { height: v.workbench.height, tab: v.workbench.tab, ...(v.workbench.open === true ? { open: true as const } : {}) } })
  }
}

/** Same values, so a view can skip a write that would change nothing. */
export function sameOrchestrate(a: PersistedOrchestrate | undefined, b: PersistedOrchestrate | undefined): boolean {
  return JSON.stringify(a === undefined ? null : carryOrchestrate(a)) === JSON.stringify(b === undefined ? null : carryOrchestrate(b))
}
