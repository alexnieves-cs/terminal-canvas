import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, shell } from 'electron'
import { whichFromEnv } from '../shell-env'
import { createCombineRunner } from '../combine-runner'
import { createLaneMerger } from '../lane-merge'
import { createIntegrator, createReceiptStore } from '../integrator'
import { createRepoSetupStore } from '../repo-setup-store'
import { createRecipeStore } from '../recipe-store'
import { createEditorOpener, type KitHandlers } from '../kit'
import type { EditorId } from '../../shared/editor-open'
import type { Stores } from './stores'
import type { MainState } from './context'

/** The URL scheme each editor registers, for "installed but no shell command". */
const SCHEMES: Record<EditorId, string | null> = { vscode: 'vscode', cursor: 'cursor', windsurf: 'windsurf', zed: 'zed', sublime: 'subl', idea: null, webstorm: null }

/**
 * M311–M314. The kit's doors over main's real stores. `state.loginEnv` is read
 * at the point of USE in every closure (context.ts's rule): these are built
 * before the startup probe resolves the login PATH.
 */
export function createKitHandlers(state: MainState, stores: Stores, userData: string): KitHandlers {
  const { reviewEngine, gitRunner, layoutStore, checkOutputs, runLedger } = stores
  const worktreesDir = join(userData, 'worktrees')
  const mainRootOf = async (cwd: string): Promise<string | null> => {
    const answer = await reviewEngine.resolveRepo(cwd)
    return answer.kind === 'root' ? reviewEngine.commonRootOf(answer.root) : null
  }
  const combine = createCombineRunner({ run: gitRunner, commonRootOf: (p) => reviewEngine.commonRootOf(p), worktreesDir })
  const setup = createRepoSetupStore({
    dir: join(userData, 'repo-setup'),
    mainRootOf,
    lanesOf: (root) => layoutStore.worktrees().filter((w) => w.root === root).sort((a, b) => a.createdAt - b.createdAt).map((w) => w.path),
    loginEnv: () => state.loginEnv,
    outputs: checkOutputs,
    // M321. The preflight's PATH probe, on the login env read at the point of use.
    which: (bin) => whichFromEnv(bin, state.loginEnv) !== null
  })
  const recipes = createRecipeStore({ dir: userData })
  const laneMerge = createLaneMerger({ run: gitRunner, commonRootOf: (p) => reviewEngine.commonRootOf(p) })
  // M317. Integrate lands lanes through the SAME merger Accept uses.
  const receipts = createReceiptStore({ file: join(userData, 'integration-receipts.json') })
  const integrate = createIntegrator({ run: gitRunner, commonRootOf: (p) => reviewEngine.commonRootOf(p), worktreesDir, readOutput: (id) => checkOutputs.read(id), merge: laneMerge, receipts, record: async (row) => { await runLedger.append(row) } })
  const editorOpen = createEditorOpener({
    pref: () => String(layoutStore.getSetting('files.editor') ?? 'auto'),
    which: (bin) => whichFromEnv(bin, state.loginEnv),
    hasApp: (id) => { const s = SCHEMES[id]; return s !== null && app.getApplicationNameForProtocol(`${s}://`) !== '' },
    exists: existsSync,
    // Detached and unref'd: the editor outlives this app, and its stdio is not ours to hold.
    launch: (bin, args) => new Promise((resolve) => {
      try {
        const child = spawn(bin, args, { env: state.loginEnv, detached: true, stdio: 'ignore' })
        child.once('error', (e) => resolve(e.message))
        child.once('spawn', () => { child.unref(); resolve(null) })
      } catch (e) {
        resolve(e instanceof Error ? e.message : String(e))
      }
    }),
    // Only an editor's own scheme, built by planEditorOpen from a fixed table
    // and a path that exists — never a URL the renderer supplied.
    openUrl: async (url) => { if (/^(vscode|cursor|windsurf|zed|subl):\/\//.test(url)) await shell.openExternal(url) },
    openPath: (path) => shell.openPath(path)
  })
  return {
    combine: (req) => combine.run(req),
    setupRead: (cwd) => setup.read(cwd),
    setupSave: (raw) => setup.save(raw),
    setupPrepare: (req) => setup.prepare(req),
    editorOpen,
    recipeList: () => recipes.list(),
    recipeSave: (raw) => recipes.save(raw),
    recipeDelete: (id) => recipes.remove(id),
    laneMerge,
    combineInputs: (req) => combine.inputs(req),
    combineIntegrate: integrate,
    combineReceipts: async (root) => receipts.list(typeof root === 'string' ? await reviewEngine.commonRootOf(root) : undefined),
    setupPreflight: (req) => setup.preflight(req),
    recipeHistory: (id) => recipes.history(id)
  }
}
