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
import { WORKBENCH_DEFAULT_HEIGHT, type PersistedOrchestrate, type WorkbenchTab } from '@shared/orchestrate-prefs'

export type OrchLens = 'scene' | 'list'
/** M287. Output and Review left the side column for the workbench; the side keeps Activity and Files. */
export type OrchSideTab = 'activity' | 'files'

export interface OrchPrefs {
  mode: OrchMode
  lens: OrchLens
  camera: { x: number; y: number; k: number }
  tab: OrchSideTab
  /** M287. The workbench's height and tab, the plan's "persist panel sizes per workspace". */
  workbench: { height: number; tab: WorkbenchTab }
}

const DEFAULTS: OrchPrefs = {
  mode: 'dev',
  lens: 'scene',
  camera: { x: 0, y: 0, k: 1 },
  tab: 'activity',
  workbench: { height: WORKBENCH_DEFAULT_HEIGHT, tab: 'changes' }
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
    ...(persisted.workbench === undefined ? {} : { workbench: { ...persisted.workbench } })
  }
}

/** The record the workspace saves — every field, so a relaunch returns to the same view. */
export function persistedOrchPrefs(p: OrchPrefs): PersistedOrchestrate {
  return { workbench: { ...p.workbench }, lens: p.lens, mode: p.mode, sideTab: p.tab, camera: { ...p.camera } }
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
