import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { get as httpsGet } from 'node:https'
import { get as httpGet } from 'node:http'
import { execFile } from 'node:child_process'
import { app, autoUpdater } from 'electron'
import { createBoardLane } from '../board-lane'
import { repositoriesAnswer } from '../board-repo'
import { buildPushArgs } from '../git-args'
import { openPullRequest, commentIssue } from '../github-client'
import { parsePublishRequest, publish } from '../github-publish'
import { createPackHandlers } from '../pack-handlers'
import { createToolGenerator } from '../tool-generate'
import { claudeCliRunner } from '../claude-cli-runner'
import { putAsset } from '../asset-store'
import { importDocx } from '../docx-import'
import { createFile } from '../file-create'
import { runHttpNode, NODE_FETCH_MAX_BYTES, NODE_FETCH_TIMEOUT_MS } from '../node-run'
import { checkForUpdate, repoOf } from '../update-check'
import { createSelfUpdater, selfUpdatePlan, SELF_UPDATE_SETTING, type SelfUpdatePlan, type SignatureRead, type Updater } from '../self-update'
import { parsePortable } from '../../shared/portable'
import { askOpenFile, askSave, confirm, inDownloads, liveWindow } from './dialogs'
import type { Places } from './places'
import type { ControlWiring } from './control-wiring'
import type { Stores } from './stores'
import type { MainState } from './context'

/**
 * M113/M115. The board: the lane a dispatch mints, its status, the
 * repositories a teammate could work in, and the return path to GitHub.
 *
 * The return path's order is load-bearing: the lane's RECORD (ids in, never a
 * path from the renderer), then `git push -u origin <branch>` in the lane with
 * the USER's own git credentials (the app holds none for git), and only then
 * the POST through the broker — whose own write gate asks M102's spend card on
 * the teammate's chat before the token is read.
 */
export function createBoardHandlers(stores: Stores, places: Places, control: ControlWiring) {
  const { layoutStore, worktreeManager, reviewEngine, gitRunner } = stores

  const boardLane = createBoardLane({
    gate: places.gate,
    worktrees: { ensureForPanel: (panelId, cwd) => worktreeManager.ensureForPanel(panelId, cwd) },
    teammate: (id) => layoutStore.teammates().find((t) => t.id === id),
    recordFor: (panelId, root) => layoutStore.worktreeForPanel(panelId, root),
    originOf: places.originOfDir,
    subdirs: places.subdirsOf
  })

  return {
    ...boardLane,
    laneStatus: (req: { path: string; root: string }) => reviewEngine.laneStatus(req.path, req.root),
    // M197 (D05). The start flow's repository field: the SAME bounded
    // one-level walk the lane makes to find one clone, asked for all of
    // them, so the field can never offer a root the lane could not reach.
    // Read-only; the arm decision is board-repo.ts's, where a check drives
    // it — no suite bundles this file.
    repositories: async (req: { teammateId: string }) => repositoriesAnswer(
      layoutStore.teammates().find((t) => t.id === req.teammateId),
      { originOf: places.originOfDir, subdirs: places.subdirsOf, isRepoRoot: places.isRepoRootDir }
    ),
    openPr: async (req: { worktreeId: string; panelId: string; teammateId: string; repo: string; title: string; body: string }) => {
      const lane = layoutStore.worktrees().find((w) => w.id === req.worktreeId)
      if (lane === undefined) return { kind: 'no-lane' as const, reason: 'the lane\'s worktree record is gone — check the Worktrees list' }
      const pushed = await gitRunner(buildPushArgs(lane.path, lane.branch))
      if (!pushed.ok) return { kind: 'push-failed' as const, reason: pushed.notFound ? 'git could not be run' : (pushed.stderr.split('\n').map((l) => l.trim()).filter((l) => l !== '').find((l) => /^(fatal|error):/i.test(l)) ?? pushed.stderr.trim().split('\n').pop() ?? 'git push failed') }
      const root = await reviewEngine.status(lane.root)
      const base = root.kind === 'status' ? root.branch : 'main'
      return openPullRequest({ broker: control.broker, panelId: req.panelId, teammateId: req.teammateId }, { repo: req.repo, head: lane.branch, base, title: req.title, body: req.body })
    },
    commentPr: (req: { panelId: string; teammateId: string; repo: string; number: number; body: string }) =>
      commentIssue({ broker: control.broker, panelId: req.panelId, teammateId: req.teammateId }, { repo: req.repo, number: req.number, body: req.body })
  }
}

/**
 * M186. The asset store: bytes in, an id out. The chooser is the system's own
 * dialog, so this app never invents a file browser and never sees a path the
 * person did not point at.
 */
export function createAssetHandlers(state: MainState) {
  return {
    put: (req: { path?: string; bytes?: Uint8Array } | undefined) => putAsset({
      dir: join(app.getPath('userData'), 'assets'),
      ...(typeof req?.path === 'string' ? { path: req.path } : {}),
      ...(req?.bytes === undefined ? {} : { bytes: req.bytes })
    }),
    choose: async () => {
      const win = liveWindow(state)
      if (win === null) return null
      return askOpenFile(win, { title: 'Choose a picture', filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] })
    }
  }
}

/**
 * M189. The portable file on disk. Main writes and reads; the RENDERER built
 * the record and the renderer decides what to make of a parse — main never
 * turns a file into a workspace, the same division that keeps the board's own
 * writes in the renderer (M113).
 */
export function createPortableHandlers(state: MainState) {
  return {
    write: async (req: { path?: string; suggested?: string; file?: unknown } | undefined) => {
      let path = typeof req?.path === 'string' && req.path.trim() !== '' ? req.path : undefined
      if (path === undefined) {
        const win = liveWindow(state)
        if (win === null) return { kind: 'refused' as const, reason: 'there is no window to ask' }
        const chosen = await askSave(win, {
          title: 'Export this canvas',
          defaultPath: inDownloads(typeof req?.suggested === 'string' && req.suggested.trim() !== '' ? req.suggested : 'canvas.tccanvas'),
          filters: [{ name: 'Canvas file', extensions: ['tccanvas', 'json'] }]
        })
        if (chosen === null) return { kind: 'cancelled' as const }
        path = chosen
      }
      const text = `${JSON.stringify(req?.file ?? null, null, 2)}\n`
      try {
        writeFileSync(path, text, 'utf8')
      } catch (error) {
        return { kind: 'refused' as const, reason: `that file could not be written: ${error instanceof Error ? error.message : String(error)}` }
      }
      return { kind: 'written' as const, path, bytes: Buffer.byteLength(text, 'utf8') }
    },
    read: async (req: { path?: string } | undefined) => {
      let path = typeof req?.path === 'string' && req.path.trim() !== '' ? req.path : undefined
      if (path === undefined) {
        const win = liveWindow(state)
        if (win === null) return { kind: 'refused' as const, reason: 'there is no window to ask' }
        const chosen = await askOpenFile(win, { title: 'Import a canvas', filters: [{ name: 'Canvas file', extensions: ['tccanvas', 'json'] }] })
        if (chosen === null) return { kind: 'cancelled' as const }
        path = chosen
      }
      let text: string
      try {
        text = readFileSync(path, 'utf8')
      } catch (error) {
        return { kind: 'refused' as const, reason: `that file could not be read: ${error instanceof Error ? error.message : String(error)}` }
      }
      return { kind: 'read' as const, path, parse: parsePortable(text) }
    }
  }
}

/**
 * M250. A .docx into a NEW note beside it. The chooser is the system's own (a
 * cancel is `cancelled`, never a refusal); pictures go through the SAME store
 * and caps a dropped picture does; the note through createFile's `wx`. The
 * docx itself is only read — see main/docx-import.ts.
 */
export function createDocxHandlers(state: MainState) {
  return {
    import: async (req: { path?: string } | undefined) => {
      let path = typeof req?.path === 'string' && req.path.trim() !== '' ? req.path.trim() : undefined
      if (path === undefined) {
        const win = liveWindow(state)
        if (win === null) return { kind: 'refused' as const, reason: 'there is no window to ask' }
        const chosen = await askOpenFile(win, { title: 'Import a Word document', filters: [{ name: 'Word document', extensions: ['docx'] }] })
        if (chosen === null) return { kind: 'cancelled' as const }
        path = chosen
      }
      return importDocx({ path }, {
        putAsset: (bytes) => putAsset({ dir: join(app.getPath('userData'), 'assets'), bytes }),
        createFile
      })
    }
  }
}

/**
 * M253. Packs — the ONE factory production and the panels harness both build
 * (main/pack-handlers.ts), so the suite drives this code and not a copy. Only
 * the choosers are this file's: the system's own dialogs.
 */
export function createPackWiring(state: MainState, stores: Stores, afterPresetChange: () => void, which: (command: string) => string | null) {
  return createPackHandlers({
    store: stores.layoutStore,
    credentials: () => stores.credentialStore.list(),
    which,
    afterPresetChange,
    app: app.getVersion(),
    sampleDir: join(app.getPath('userData'), 'packs'),
    chooseOpen: async () => {
      const win = liveWindow(state)
      if (win === null) return { kind: 'refused', reason: 'there is no window to ask' }
      const path = await askOpenFile(win, { title: 'Read a pack', filters: [{ name: 'Pack', extensions: ['tcpack', 'json'] }] })
      return path === null ? { kind: 'cancelled' } : { kind: 'path', path }
    },
    chooseSave: async (suggested: string) => {
      const win = liveWindow(state)
      if (win === null) return { kind: 'refused', reason: 'there is no window to ask' }
      const path = await askSave(win, { title: 'Export a pack', defaultPath: inDownloads(suggested), filters: [{ name: 'Pack', extensions: ['tcpack', 'json'] }] })
      return path === null ? { kind: 'cancelled' } : { kind: 'path', path }
    }
  })
}

/**
 * M255. The publisher. The confirmation is the SYSTEM's own dialog, in main,
 * defaulting to Cancel — the renderer cannot answer it, and it is asked on
 * every publish (no session grant). The repository is the draft's own origin,
 * read through the same git runner the lane uses.
 */
export function createPublishHandlers(state: MainState, stores: Stores, control: ControlWiring) {
  return {
    publish: async (raw: unknown) => {
      const req = parsePublishRequest(raw)
      if (typeof req === 'string') return { kind: 'refused' as const, reason: req }
      return publish({
        broker: control.broker,
        remoteOf: async (dir: string) => {
          const answer = await stores.gitRunner(['-C', dir, 'remote', 'get-url', 'origin'])
          return answer.ok && answer.stdout.trim() !== '' ? answer.stdout.trim() : null
        },
        confirm: async (ask) => {
          const win = liveWindow(state)
          if (win === null) return false
          const verb = ask.kind === 'release' ? 'Publish release' : ask.kind === 'comment' ? 'Post comment' : 'Post discussion'
          return confirm(win, { message: ask.message, detail: ask.detail, verb })
        }
      }, req)
    }
  }
}

/**
 * M188. The fetch node's one GET. The real fetcher lives HERE and is called by
 * no suite (the `verify:meta update.1` shape): every check drives an injected
 * one, and no suite in this repo reaches the network.
 */
export function createNodeFetchHandlers() {
  return {
    fetch: (req: { url?: unknown; method?: unknown } | undefined) => runHttpNode(
      { url: String(req?.url ?? ''), ...(typeof req?.method === 'string' ? { method: req.method } : {}) },
      {
        now: () => Date.now(),
        fetch: (url: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
          const done = (status: number, body: string): void => { clearTimeout(deadline); resolve({ status, body }) }
          // M190's critic (4). The GETTER FOLLOWS THE SCHEME: `httpNodeRefusal`
          // allows http(s), and an `http:` url sent through `https.get` fails
          // TLS on port 80 and comes back as "the server did not answer" — a
          // named-refusal system reporting a network fault for a shape this
          // app decided to allow.
          const get = url.startsWith('http://') ? httpGet : httpsGet
          const request = get(url, { headers: { 'User-Agent': 'terminal-canvas' } }, (res) => {
            const chunks: Buffer[] = []
            let bytes = 0
            res.on('data', (c: Buffer) => {
              // The cap is applied HERE too, not only after: a server that
              // answers a gigabyte would otherwise be held in memory whole
              // before `runHttpNode` sliced it — and the request is DESTROYED
              // at the cap rather than left streaming for the whole deadline
              // (M190's critic, 6).
              bytes += c.length
              if (bytes <= NODE_FETCH_MAX_BYTES) chunks.push(c)
              else { request.destroy(); done(res.statusCode ?? 0, Buffer.concat(chunks).toString('utf8')) }
            })
            res.on('end', () => done(res.statusCode ?? 0, Buffer.concat(chunks).toString('utf8')))
          })
          const deadline = setTimeout(() => { request.destroy(new Error(`the server did not answer within ${NODE_FETCH_TIMEOUT_MS / 1000} seconds`)) }, NODE_FETCH_TIMEOUT_MS)
          request.on('error', (error) => { clearTimeout(deadline); reject(error) })
        })
      }
    )
  }
}

/**
 * M123. The update NOTICE's one verb, over the one real fetcher in the app
 * that is not the broker's. Here and not in update-check.ts so that module
 * runs under plain node and `verify:meta update.1` can pin that no suite
 * bundles an `https` call. A GET with a deadline for the whole call (the M87
 * rule: node's socket timeout is inactivity, and a byte every 29 s holds a
 * call open forever), GitHub's required User-Agent, and NO redirect following
 * — the feed url is fixed, and a 3xx to somewhere else is a could-not-check
 * naming the status, not a fetch of wherever it pointed. The repository is
 * package.json's own `repository.url`; a build without one gets the third
 * state by name.
 *
 * M695. And its second verb, `install`, over Electron's own `autoUpdater`
 * (Squirrel.Mac; no updater package). All of the deciding is in
 * self-update.ts, pure; what is here is the three impure things it is handed:
 * the `codesign` reads, the dialog, and the updater. The plan is read only on
 * a `newer` answer, so a launch with nothing to install spawns nothing.
 */
export function createUpdateHandlers(state: MainState, stores: Stores) {
  const repo = (): string | null => {
    try { return repoOf(JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'))) } catch { return null }
  }
  // The running bundle's signature cannot change under this process (a staged
  // update replaces it only at the next start), so it is read at most once.
  let signature: Promise<SignatureRead | null> | null = null
  const plan = (): Promise<SelfUpdatePlan> => selfUpdatePlan({
    setting: stores.layoutStore.getSetting(SELF_UPDATE_SETTING),
    platform: process.platform,
    packaged: app.isPackaged,
    arch: process.arch,
    execPath: process.execPath,
    repo: repo()
  }, (bundle) => (signature ??= readSignature(bundle)))
  const updater = createSelfUpdater({
    plan,
    current: app.getVersion(),
    confirm: (ask) => confirm(liveWindow(state), ask),
    updater: electronUpdater(),
    // The invoke answers `restarting` before the windows close.
    defer: (fn) => { setTimeout(fn, 250) }
  })
  return {
    check: async () => {
      const r = repo()
      if (r === null) return { kind: 'could-not-check' as const, reason: 'this build names no GitHub repository in its package.json' }
      const result = await checkForUpdate(app.getVersion(), {
        repo: r,
        fetch: (url: string) => new Promise((resolve, reject) => {
          const deadline = setTimeout(() => { req.destroy(new Error('GitHub did not answer within 10 seconds')) }, 10_000)
          const req = httpsGet(url, { headers: { 'User-Agent': 'terminal-canvas', Accept: 'application/vnd.github+json' } }, (res) => {
            const chunks: Buffer[] = []
            res.on('data', (c: Buffer) => { chunks.push(c) })
            res.on('end', () => { clearTimeout(deadline); resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }) })
          })
          req.on('error', (error) => { clearTimeout(deadline); reject(error) })
        })
      })
      if (result.kind !== 'newer') return result
      // An unsigned build answers exactly what M123 answered: no field at all.
      const p = await plan()
      return p.on ? { ...result, installable: true as const } : result
    },
    install: (req: unknown) => updater.install(req)
  }
}

/**
 * M695. `codesign` reports on stderr, and a non-zero exit is an ANSWER (an
 * unsigned app exits 1 with "not signed at all"); only a process that could
 * not run or was killed at the deadline is null, which the plan reads as
 * could-not-read-signature, never as signed.
 */
function codesign(args: string[]): Promise<{ code: number; text: string } | null> {
  return new Promise((resolve) => {
    execFile('/usr/bin/codesign', args, { timeout: 30_000 }, (error, stdout, stderr) => {
      const text = `${String(stdout)}${String(stderr)}`
      if (error === null) { resolve({ code: 0, text }); return }
      const code = (error as { code?: unknown }).code
      resolve(typeof code === 'number' ? { code, text } : null)
    })
  })
}

async function readSignature(bundle: string): Promise<SignatureRead | null> {
  // --strict without --deep: the seal over the bundle's resources and the
  // main executable. Squirrel.Mac checks the DOWNLOAD itself before it is used.
  const verify = await codesign(['--verify', '--strict', '--verbose=2', bundle])
  if (verify === null) return null
  if (verify.code !== 0) return { verifyCode: verify.code, verifyText: verify.text, display: '' }
  const display = await codesign(['--display', '--verbose=2', bundle])
  if (display === null) return null
  return { verifyCode: 0, verifyText: verify.text, display: display.text }
}

/**
 * Electron's `autoUpdater` as the four things self-update.ts asks of it. Read
 * at CALL time, never at creation: nothing here touches the updater unless a
 * plan said on and the person said yes.
 */
function electronUpdater(): Updater {
  return {
    setFeedURL: (options) => autoUpdater.setFeedURL(options),
    checkForUpdates: () => autoUpdater.checkForUpdates(),
    quitAndInstall: () => autoUpdater.quitAndInstall(),
    onError: (listener) => {
      const f = (error: Error): void => listener(error instanceof Error ? error.message : String(error ?? ''))
      autoUpdater.on('error', f)
      return () => { autoUpdater.removeListener('error', f) }
    },
    onDownloaded: (listener) => {
      const f = (): void => listener()
      autoUpdater.on('update-downloaded', f)
      return () => { autoUpdater.removeListener('update-downloaded', f) }
    },
    onNotAvailable: (listener) => {
      const f = (): void => listener()
      autoUpdater.on('update-not-available', f)
      return () => { autoUpdater.removeListener('update-not-available', f) }
    }
  }
}

/**
 * M252. Describe a tool: the SAME claude binary and login environment sessions
 * use, one run with no tools, and a reply that is only data.
 */
export function createToolGeneratorWiring(state: MainState) {
  return createToolGenerator({ runner: claudeCliRunner, command: () => state.claudePath ?? 'claude', env: () => state.loginEnv })
}
