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
export type WorkbenchTab = 'changes' | 'checks' | 'output' | 'artifacts' | 'timeline'
export const WORKBENCH_TABS: readonly WorkbenchTab[] = ['changes', 'checks', 'output', 'artifacts', 'timeline']

/** The workbench cannot be dragged shut, and cannot swallow the scene. */
export const WORKBENCH_MIN_HEIGHT = 120
export const WORKBENCH_MAX_HEIGHT = 720
/**
 * M299. The resting height, now that the strip rests OPEN: 200, measured so the
 * scene panel is no shorter than it was under M282's tiles at the wide window
 * (1128×649 before; 240 left it 614) and 90 px taller at the default one.
 */
export const WORKBENCH_DEFAULT_HEIGHT = 200

export interface PersistedOrchestrate {
  /**
   * `open` absent is OPEN (M299): the workbench is the page's evidence area and
   * rests at its height; only a person's collapse is written, as `open: false`.
   * M287 wrote `open: true` and read absence as closed — that rest state was
   * chosen with five jump tiles under the scene, and those tiles are gone.
   * A pre-M299 record's `open: true` still parses; its absence now reads open.
   */
  workbench?: { height: number; tab: WorkbenchTab; open?: boolean }
  lens?: 'scene' | 'list'
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
  if (raw.lens === 'scene' || raw.lens === 'list') out.lens = raw.lens
  if (raw.mode === 'dev' || raw.mode === 'pipeline') out.mode = raw.mode
  if (raw.sideTab === 'activity' || raw.sideTab === 'files') out.sideTab = raw.sideTab
  const c = raw.camera
  if (isRecord(c) && isNum(c.x) && isNum(c.y) && isNum(c.k) && c.k > 0) out.camera = { x: c.x, y: c.y, k: c.k }
  if (Array.isArray(raw.islands)) {
    const ids = raw.islands.filter((v): v is string => typeof v === 'string' && v !== '')
    if (ids.length === raw.islands.length) { if (ids.length > 0) out.islands = [...new Set(ids)] } else warnings.push('dropped a malformed orchestrate islands order')
  } else if (raw.islands !== undefined) warnings.push('dropped a malformed orchestrate islands order')
  return Object.keys(out).length === 0 ? undefined : out
}

/** A fresh object, field by field — a spread would write `lens: undefined` as a present key. */
export function carryOrchestrate(p: PersistedOrchestrate): PersistedOrchestrate {
  return {
    ...(p.workbench === undefined ? {} : { workbench: { height: p.workbench.height, tab: p.workbench.tab, ...(p.workbench.open === true ? { open: true as const } : {}) } }),
    ...(p.lens === undefined ? {} : { lens: p.lens }),
    ...(p.mode === undefined ? {} : { mode: p.mode }),
    ...(p.sideTab === undefined ? {} : { sideTab: p.sideTab }),
    ...(p.camera === undefined ? {} : { camera: { x: p.camera.x, y: p.camera.y, k: p.camera.k } }),
    ...(p.islands === undefined || p.islands.length === 0 ? {} : { islands: [...p.islands] })
  }
}

/** Same values, so a view can skip a write that would change nothing. */
export function sameOrchestrate(a: PersistedOrchestrate | undefined, b: PersistedOrchestrate | undefined): boolean {
  return JSON.stringify(a === undefined ? null : carryOrchestrate(a)) === JSON.stringify(b === undefined ? null : carryOrchestrate(b))
}
