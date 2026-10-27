import { spawn } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { app, shell } from 'electron'
import { whichFromEnv } from '../shell-env'
import { createCombineRunner } from '../combine-runner'
import { createLaneMerger } from '../lane-merge'
import { createCollisionRadar } from '../collision-radar'
import { createIntegrator, createReceiptStore } from '../integrator'
import { createRepoSetupStore } from '../repo-setup-store'
import { createRecipeStore } from '../recipe-store'
import { createEditorOpener, type KitHandlers } from '../kit'
import { createLearnDoors } from '../learn'
import { createLearnStore } from '../learn-store'
import { createLessonProposer } from '../lesson-proposer'
import { claudeCliRunner } from '../claude-cli-runner'
import { createProofRunner } from '../lesson-proof-runner'
import { runAutoCheck } from '../auto-check-runner'
import { prepareFailureLine } from '../../shared/repo-setup'
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
  const { reviewEngine, gitRunner, layoutStore, checkOutputs, runLedger, lessonStore } = stores
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
  const merger = createLaneMerger({ run: gitRunner, commonRootOf: (p) => reviewEngine.commonRootOf(p) })
  // M488. One merge at a time, whoever asks — the card's Accept, Integrate and
  // an MCP client: a failed merge runs `git merge --abort` in the main tree,
  // which would abort ANOTHER caller's merge left stopped on conflicts.
  let mergeQueue: Promise<unknown> = Promise.resolve()
  const laneMerge: typeof merger = (req) => {
    const run = mergeQueue.then(() => merger(req), () => merger(req))
    mergeQueue = run.catch(() => undefined)
    return run
  }
  // M479. The same runner and root resolver as Accept, so a lane the radar reads is the lane Accept would merge.
  const laneRadar = createCollisionRadar({ run: gitRunner, commonRootOf: (p) => reviewEngine.commonRootOf(p) })
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
  // M573. The replay's worktree sits beside the lanes' (and is removed on
  // every way out, and a crash's leftovers are swept at the next replay); the repository's
  // SAVED setup prepares it; the check is the auto gate's runner, so a
  // proof's pass is the same exit-0 rule.
  const proofRunner = createProofRunner({
    run: gitRunner,
    worktreesDir,
    readFile: (p) => { try { return readFileSync(p, 'utf8') } catch { return null } },
    writeFile: (p, text) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text) },
    removeDir: (p) => { try { rmSync(p, { recursive: true, force: true }) } catch { /* left for git worktree prune */ } },
    isLink: (p) => { try { return lstatSync(p).isSymbolicLink() } catch { return false } },
    listDir: (d) => { try { return readdirSync(d) } catch { return [] } },
    prepare: async (lane) => {
      const r = await setup.prepare({ lane })
      return r.kind === 'prepared' || r.kind === 'no-setup' ? { kind: r.kind } : { kind: r.kind, detail: prepareFailureLine(r) ?? 'the setup failed' }
    },
    runner: claudeCliRunner,
    command: () => state.claudePath ?? 'claude',
    env: () => state.loginEnv,
    runCheck: async (spec) => {
      const r = await runAutoCheck({ ...spec, env: state.loginEnv })
      // A timeout or a check that never started is a failure even if a code came back (autoCheckPassed's rule).
      return { exitCode: r.timedOut === true || r.error !== undefined ? null : r.exitCode, output: r.error === undefined ? r.output : `${r.output}\n${r.error}` }
    },
    now: () => Date.now()
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
    recipeHistory: (id) => recipes.history(id),
    laneRadar,
    // M570 (lane O). The same root resolver as Accept, so a lane's lessons file under the tree it merges into.
    // M571. The proposer is M252's headless no-tools run on the sessions' own claude; the switch is read per press.
    learn: createLearnDoors({
      lessons: lessonStore,
      learn: createLearnStore({ dir: join(userData, 'learn') }),
      commonRootOf: (p) => reviewEngine.commonRootOf(p),
      baselineOf: (id) => layoutStore.baseline(id),
      agentsOn: () => layoutStore.getSetting('learn.agents') === true,
      propose: createLessonProposer({ runner: claudeCliRunner, command: () => state.claudePath ?? 'claude', env: () => state.loginEnv }),
      prove: proofRunner.run,
      stopProof: proofRunner.stop,
      // M576. Accept and Retire write the person's CLAUDE.md or a project
      // skill; through a temp file and a rename, so a crash mid-write leaves
      // the old file, never half of the new one.
      files: {
        // Absent is null; any other failure throws, so an unreadable CLAUDE.md is never taken for a missing one.
        read: (p) => {
          try { return readFileSync(p, 'utf8') } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
            throw error
          }
        },
        create: (p, text) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text, { flag: 'wx' }) },
        write: (p, text) => {
          mkdirSync(dirname(p), { recursive: true })
          const tmp = `${p}.tc-learn-${process.pid}.tmp`
          writeFileSync(tmp, text)
          renameSync(tmp, p)
        },
        remove: (p) => {
          rmSync(p, { force: true })
          // A skill's directory, left empty, goes with it; one holding anything else stays.
          if (basename(p) === 'SKILL.md') { try { rmdirSync(dirname(p)) } catch { /* not empty, or not ours to remove */ } }
        },
        isLink: (p) => { try { return lstatSync(p).isSymbolicLink() } catch { return false } }
      },
      now: () => Date.now()
    })
  }
}
