import type { LaneMergeRequest, LaneMergeResult } from '../shared/lane-merge'
import type { CombineRunResult } from '../shared/combine'
import type { PrepareResult } from '../shared/repo-setup'
import type { Recipe } from '../shared/recipes'
import { planEditorOpen, isEditorPref, type EditorId, type EditorOpenResult, type EditorPref, type EditorTarget } from '../shared/editor-open'
import type { SetupRead } from './repo-setup-store'

/**
 * M311–M314. THE WORKFLOW KIT'S DOORS — combine, repository setup, the
 * editor, recipes — as ONE collaborator of `registerIpcHandlers`, appended
 * last (that function's positional rule) so eight channels cost one
 * parameter and one harness mirror, not eight of each.
 *
 * Electron-free: the harness constructs it with real stores over temp dirs
 * and a fake opener, so the doors it proves are the ones main registers.
 */
export interface KitHandlers {
  combine: (req: { root: string; lanes: string[] }) => Promise<CombineRunResult>
  setupRead: (cwd: string) => Promise<SetupRead>
  setupSave: (raw: unknown) => Promise<{ ok: true; setup: unknown } | { ok: false; reason: string }>
  setupPrepare: (req: { lane: string }) => Promise<PrepareResult>
  editorOpen: (target: EditorTarget) => Promise<EditorOpenResult>
  recipeList: () => Promise<Recipe[]>
  recipeSave: (raw: unknown) => Promise<{ ok: true; recipe: Recipe } | { ok: false; reason: string }>
  recipeDelete: (id: string) => Promise<boolean>
  /** M315. Accept a task by merging its lane (shared/lane-merge.ts). */
  laneMerge: (req: LaneMergeRequest) => Promise<LaneMergeResult>
}

const off = 'not wired in this process'
/** The honest inert answers: refusals and `unreadable`s with a reason, never an empty success. */
export const INERT_KIT: KitHandlers = {
  combine: async () => ({ kind: 'unreadable', detail: `combining is ${off}` }),
  setupRead: async () => ({ kind: 'not-a-repo' }),
  setupSave: async () => ({ ok: false, reason: `repository setup is ${off}` }),
  setupPrepare: async () => ({ kind: 'unreadable', detail: `preparation is ${off}` }),
  editorOpen: async () => ({ kind: 'refused', reason: `the editor is ${off}` }),
  recipeList: async () => [],
  recipeSave: async () => ({ ok: false, reason: `recipes are ${off}` }),
  recipeDelete: async () => false,
  laneMerge: async () => ({ kind: 'refused', reason: `accepting is ${off}` })
}

/** What the editor opener needs from the OS — injected, so the harness never launches an editor. */
export interface EditorOpenerDeps {
  pref: () => EditorPref | string
  which: (bin: string) => string | null
  hasApp: (id: EditorId) => boolean
  exists: (path: string) => boolean
  launch: (bin: string, args: string[]) => Promise<string | null>
  openUrl: (url: string) => Promise<void>
  openPath: (path: string) => Promise<string>
}

export function createEditorOpener(deps: EditorOpenerDeps): (t: EditorTarget) => Promise<EditorOpenResult> {
  return async (raw) => {
    if (typeof raw?.path !== 'string' || !raw.path.startsWith('/')) return { kind: 'refused', reason: 'open in editor needs an absolute path' }
    if (!deps.exists(raw.path)) return { kind: 'refused', reason: `${raw.path} does not exist` }
    const int = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined)
    const line = int(raw.line), col = int(raw.col)
    const t: EditorTarget = { path: raw.path, ...(line === undefined ? {} : { line }), ...(col === undefined ? {} : { col }), ...(raw.dir === true ? { dir: true } : {}) }
    const pref = deps.pref()
    const plan = planEditorOpen(t, isEditorPref(pref) ? pref : 'auto', deps.which, deps.hasApp)
    if (plan.kind === 'refused') return plan
    if (plan.kind === 'cli') {
      const err = await deps.launch(plan.bin, plan.args)
      return err === null ? { kind: 'opened', editor: plan.label } : { kind: 'refused', reason: `${plan.label} did not start — ${err}` }
    }
    if (plan.kind === 'url') { await deps.openUrl(plan.url); return { kind: 'opened', editor: plan.label } }
    const err = await deps.openPath(plan.path)
    return err !== '' ? { kind: 'refused', reason: err } : { kind: 'opened', editor: 'its default app', ...(plan.note === undefined ? {} : { note: plan.note }) }
  }
}
