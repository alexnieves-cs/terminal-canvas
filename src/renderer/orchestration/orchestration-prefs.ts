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

export type OrchLens = 'scene' | 'list'

export interface OrchPrefs {
  mode: OrchMode
  lens: OrchLens
  camera: { x: number; y: number; k: number }
  tab: 'activity' | 'terminal' | 'review' | 'files'
}

const DEFAULTS: OrchPrefs = {
  mode: 'dev',
  lens: 'scene',
  camera: { x: 0, y: 0, k: 1 },
  tab: 'activity',
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
