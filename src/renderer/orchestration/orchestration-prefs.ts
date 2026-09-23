/**
 * M283. Orchestrate's own camera and layout, held OUTSIDE the view.
 *
 * `OrchestrationView` mounts only while its page is shown, so every React state
 * it owned — the scene camera, the mode, the side tab — reset to
 * its default on each Canvas → Orchestrate round trip. A returning user should
 * recognise where work is (the plan's "stable placement"), so the page reads its
 * starting values here and writes them back as they change. The SELECTION is
 * deliberately not among them — see OrchestrationView's own note.
 *
 * Independent of the Canvas by construction: nothing here is the canvas's
 * viewport, layout or pane preferences, and nothing the canvas owns reads it.
 * Module-level and in-memory, deliberately — a live selection names panel ids
 * that are meaningless after a relaunch, and the canvas's persisted camera goes
 * through the layout file, which this must never share.
 */
import type { OrchMode } from './orchestration-model'
import { ORCH_VIEWS_MAX, WORKBENCH_DEFAULT_HEIGHT, type OrchSavedView, type PersistedOrchestrate, type WorkbenchTab } from '@shared/orchestrate-prefs'

export type OrchLens = 'scene' | 'list' | 'watch'
/** M287. Output and Review left the side column for the workbench; the side keeps Activity and Files. */
export type OrchSideTab = 'activity' | 'files'

export interface OrchPrefs {
  mode: OrchMode
  lens: OrchLens
  camera: { x: number; y: number; k: number }
  tab: OrchSideTab
  /** M287. The workbench's height and tab, the plan's "persist panel sizes per workspace". */
  workbench: { height: number; tab: WorkbenchTab; open: boolean }
  /** M288. Island presentation order (orchestrate-prefs.ts `islands`). */
  islands: readonly string[]
  /**
   * M302. The person's saved views. They live here beside the live prefs
   * because they are made OF them — a view is this record's own fields,
   * named and kept — and they persist through the same one write.
   */
  views: readonly OrchSavedView[]
  /**
   * #18. The agent pool and the activity feed are SECONDARY to the task, the
   * scene and the workbench, so each folds away. In memory for the session
   * (like the camera between page switches), deliberately not in the
   * workspace record: a fold is a glance-level choice, not a view to restore.
   */
  poolOpen: boolean
  feedOpen: boolean
}

const DEFAULTS: OrchPrefs = {
  mode: 'dev',
  lens: 'scene',
  camera: { x: 0, y: 0, k: 1 },
  tab: 'activity',
  workbench: { height: WORKBENCH_DEFAULT_HEIGHT, tab: 'changes', open: true },
  islands: [],
  views: [],
  poolOpen: true,
  feedOpen: true
}

/**
 * M287. Seed the in-memory prefs from the workspace's persisted record when
 * the page mounts — the record wins over whatever a previous workspace left
 * here, and an absent record leaves the defaults. Field by field, so a
 * record that carries only the workbench does not reset the lens.
 */
export function seedOrchPrefs(persisted: PersistedOrchestrate | undefined): void {
  if (persisted === undefined) return
  prefs = {
    ...prefs,
    ...(persisted.lens === undefined ? {} : { lens: persisted.lens }),
    ...(persisted.mode === undefined ? {} : { mode: persisted.mode }),
    ...(persisted.sideTab === undefined ? {} : { tab: persisted.sideTab }),
    ...(persisted.camera === undefined ? {} : { camera: { ...persisted.camera } }),
    ...(persisted.workbench === undefined ? {} : { workbench: { height: persisted.workbench.height, tab: persisted.workbench.tab, open: persisted.workbench.open !== false } }),
    ...(persisted.islands === undefined ? {} : { islands: [...persisted.islands] }),
    ...(persisted.views === undefined ? {} : { views: persisted.views.map((v) => ({ ...v })) })
  }
}

/**
 * M302. The CURRENT view, captured as a record — filters, camera and layout,
 * and nothing else, which the type guarantees. It reads the live prefs, so
 * "save this view" saves exactly what the person is looking at.
 */
export function viewFromPrefs(p: OrchPrefs, name: string, id: string): OrchSavedView {
  return {
    id,
    name: name.trim(),
    lens: p.lens,
    mode: p.mode,
    sideTab: p.tab,
    camera: { ...p.camera },
    workbench: { height: p.workbench.height, tab: p.workbench.tab, ...(p.workbench.open ? {} : { open: false }) }
  }
}

/**
 * M302. Apply a saved view to the live prefs. It can only set the fields a
 * view HOLDS, which is why opening one starts nothing: there is no session,
 * no task and no command in the record to act on. A field the view does not
 * carry is left as it is rather than reset to a default — half a saved view
 * is still the person's view.
 */
export function prefsFromView(p: OrchPrefs, v: OrchSavedView): OrchPrefs {
  return {
    ...p,
    ...(v.lens === undefined ? {} : { lens: v.lens }),
    ...(v.mode === undefined ? {} : { mode: v.mode }),
    ...(v.sideTab === undefined ? {} : { tab: v.sideTab }),
    ...(v.camera === undefined ? {} : { camera: { ...v.camera } }),
    ...(v.workbench === undefined ? {} : { workbench: { height: v.workbench.height, tab: v.workbench.tab, open: v.workbench.open !== false } })
  }
}

/** The newest kept, oldest dropped; a name that already exists is REPLACED, not doubled. */
export function withSavedView(views: readonly OrchSavedView[], next: OrchSavedView): OrchSavedView[] {
  const others = views.filter((v) => v.id !== next.id && v.name !== next.name)
  return [...others, next].slice(-ORCH_VIEWS_MAX)
}

/** The record the workspace saves — every field, so a relaunch returns to the same view. */
export function persistedOrchPrefs(p: OrchPrefs): PersistedOrchestrate {
  return { workbench: { height: p.workbench.height, tab: p.workbench.tab, ...(p.workbench.open ? {} : { open: false }) }, lens: p.lens, mode: p.mode, sideTab: p.tab, camera: { ...p.camera }, ...(p.islands.length === 0 ? {} : { islands: [...p.islands] }), ...(p.views.length === 0 ? {} : { views: p.views.map((v) => ({ ...v })) }) }
}

let prefs: OrchPrefs = DEFAULTS

export function getOrchPrefs(): OrchPrefs {
  return prefs
}

export function setOrchPrefs(patch: Partial<OrchPrefs>): void {
  prefs = { ...prefs, ...patch }
}

/** For a harness that needs a fresh page; the app never resets these. */
export function resetOrchPrefs(): void {
  prefs = DEFAULTS
}
