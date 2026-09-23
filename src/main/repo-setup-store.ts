import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import {
  allocatePorts, detectSetup, parseRepoSetup, setupEnv,
  type PrepareResult, type PrepareStep, type RepoSetup
} from '../shared/repo-setup'
import { createOutputCapture, mintCheckRunId, checkOutputDisplay, type CheckOutputRecord } from '../shared/check-output'

/**
 * M312. The repository setup's store and its one runner.
 *
 * One JSON file per repository under `userData/repo-setup/<slug>.json`, the
 * memory store's keying (a hash of the MAIN tree's root, so every lane of a
 * repository reads the same record), written temp-and-rename because a record
 * is read whole.
 *
 * `prepare` runs ONLY a saved record, never a detected draft — an install runs
 * the repository's own scripts, and the first run of those is a person's
 * decision (repo-setup.ts's header). Each step is `/bin/sh -c` in the lane with
 * the login env plus the lane's ports, captured whole into the check-output
 * store (source `setup`), so a failure opens its own output the way a failed
 * check does rather than a second reader existing for it.
 */
export type SetupRead =
  | { kind: 'saved'; setup: RepoSetup }
  | { kind: 'draft'; setup: RepoSetup }
  | { kind: 'not-a-repo' }

export interface RepoSetupStoreDeps {
  dir: string
  /** The main tree of `cwd`, or null when `cwd` is in no repository. */
  mainRootOf: (cwd: string) => Promise<string | null>
  /** Every lane path of a repository, oldest first — a lane's index is its port slot. */
  lanesOf: (root: string) => string[]
  loginEnv: () => Record<string, string>
  outputs?: { put: (r: CheckOutputRecord) => void }
  now?: () => number
  /** Overridable so the verifier does not wait fifteen minutes. */
  stepTimeoutMs?: number
  /** Overridable so the verifier does not bind real sockets. */
  isPortFree?: (port: number) => Promise<boolean>
}

export interface RepoSetupStore {
  read(cwd: string): Promise<SetupRead>
  save(raw: unknown): Promise<{ ok: true; setup: RepoSetup } | { ok: false; reason: string }>
  prepare(req: { lane: string }): Promise<PrepareResult>
}

const STEP_TIMEOUT_MS = 15 * 60_000

const slug = (root: string): string => createHash('sha256').update(root).digest('hex').slice(0, 16)

const portFree = (port: number): Promise<boolean> => new Promise((resolve) => {
  const server = createServer()
  server.once('error', () => resolve(false))
  server.once('listening', () => server.close(() => resolve(true)))
  server.listen(port, '127.0.0.1')
})

export function createRepoSetupStore(deps: RepoSetupStoreDeps): RepoSetupStore {
  const now = deps.now ?? Date.now
  const fileOf = (root: string): string => join(deps.dir, `${slug(root)}.json`)

  const readSaved = async (root: string): Promise<RepoSetup | null> => {
    try {
      const parsed = parseRepoSetup(JSON.parse(await fs.readFile(fileOf(root), 'utf8')))
      // A record whose root is not this one is another repository's hash collision — never trusted.
      return parsed !== null && parsed.root === root ? parsed : null
    } catch {
      return null
    }
  }

  const detect = async (root: string): Promise<RepoSetup> => {
    let names: string[] = []
    try { names = await fs.readdir(root) } catch { /* an unlistable root detects nothing */ }
    let manifest: string | undefined
    if (names.includes('package.json')) {
      try { manifest = await fs.readFile(join(root, 'package.json'), 'utf8') } catch { /* no scripts */ }
    }
    return detectSetup(root, names, manifest)
  }

  const runStep = (command: string, cwd: string, env: Record<string, string>): Promise<PrepareStep> => new Promise((resolve) => {
    const startedAt = now()
    const capture = createOutputCapture()
    const runId = mintCheckRunId('setup', startedAt)
    const base = deps.loginEnv()
    const child = spawn('/bin/sh', ['-c', command], {
      cwd,
      env: { ...(Object.keys(base).length > 0 ? base : process.env as Record<string, string>), ...env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), deps.stepTimeoutMs ?? STEP_TIMEOUT_MS)
    const onData = (b: Buffer): void => capture.push(b.toString('utf8'))
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    let done = false
    const finish = (code: number | null, signal: string | null): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      const endedAt = now()
      const snap = capture.snapshot()
      const record: CheckOutputRecord = { v: 1, runId, panelId: 'setup', source: 'setup', command, cwd, startedAt, endedAt, exitCode: code, signal, ...snap }
      deps.outputs?.put(record)
      const tail = checkOutputDisplay(record).split('\n').filter((l) => l.trim() !== '').slice(-6).join('\n')
      resolve({ command, exitCode: signal !== null ? null : code, ms: endedAt - startedAt, tail, ...(deps.outputs === undefined ? {} : { outputId: runId }) })
    }
    // ENOENT for /bin/sh cannot happen on macOS; a cwd that vanished can.
    child.once('error', (e) => { capture.push(`${e.message}\n`); finish(127, null) })
    child.once('close', (code, signal) => finish(code, signal))
  })

  return {
    async read(cwd) {
      if (typeof cwd !== 'string' || !cwd.startsWith('/')) return { kind: 'not-a-repo' }
      const root = await deps.mainRootOf(cwd)
      if (root === null) return { kind: 'not-a-repo' }
      const saved = await readSaved(root)
      return saved !== null ? { kind: 'saved', setup: saved } : { kind: 'draft', setup: await detect(root) }
    },
    async save(raw) {
      const parsed = parseRepoSetup(raw)
      if (parsed === null) return { ok: false, reason: 'a setup names the repository it is for' }
      // The root is re-resolved, never trusted: a record saved under a lane's
      // path would be one no other lane of the repository ever reads.
      const root = await deps.mainRootOf(parsed.root)
      if (root === null) return { ok: false, reason: `${parsed.root} is not inside a git repository` }
      const setup: RepoSetup = { ...parsed, root, updatedAt: now() }
      await fs.mkdir(deps.dir, { recursive: true })
      const file = fileOf(root)
      await fs.writeFile(`${file}.tmp`, JSON.stringify(setup, null, 2), 'utf8')
      await fs.rename(`${file}.tmp`, file)
      return { ok: true, setup }
    },
    async prepare(req) {
      const lane = req?.lane
      if (typeof lane !== 'string' || !lane.startsWith('/')) return { kind: 'unreadable', detail: 'a preparation names the lane it runs in' }
      const root = await deps.mainRootOf(lane)
      if (root === null) return { kind: 'unreadable', detail: `${lane} is not inside a git repository` }
      const setup = await readSaved(root)
      if (setup === null) return { kind: 'no-setup' }
      // Slot 0 is the main tree; a lane takes its place among the repository's lanes plus one.
      const at = deps.lanesOf(root).indexOf(lane)
      const slot = at === -1 ? 1 + deps.lanesOf(root).length : at + 1
      const taken = new Set<number>()
      const free = deps.isPortFree ?? portFree
      const span = Array.from({ length: setup.ports.span }, (_, i) => setup.ports.base + slot * setup.ports.span + i)
      for (const p of span) if (!(await free(p))) taken.add(p)
      const ports = allocatePorts(setup, slot, taken)
      const env = setupEnv(ports)
      const steps: PrepareStep[] = []
      for (const command of setup.install) {
        const step = await runStep(command, lane, env)
        steps.push(step)
        if (step.exitCode !== 0) return { kind: 'failed', steps, ports }
      }
      return { kind: 'prepared', steps, ports }
    }
  }
}
