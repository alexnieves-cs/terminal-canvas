/**
 * M312. REPOSITORY SETUP, SAVED ONCE — how a repository installs, serves,
 * checks and previews, so a fresh lane inherits a working environment instead
 * of an agent's first ten minutes rediscovering it (and half the time getting
 * it wrong in a way nobody sees until the review).
 *
 * The record is per REPOSITORY (the main tree's root; every lane of it shares
 * one), stored by main under `userData/repo-setup/` — never written into the
 * repository, which is the person's and may not want an app's file in it.
 *
 * Three rules this module holds:
 *  - **Detection proposes, a person saves.** `detectSetup` reads the files a
 *    repository already has (lockfiles, manifests, scripts) and returns a
 *    DRAFT; nothing runs from a draft. A command that installs dependencies
 *    executes the repository's own scripts, and the first time that happens
 *    must be a person's decision (the "inert until a person looks" rule).
 *  - **Preparation fails before the agent starts.** the saved `install` list is what
 *    main runs in the lane between the worktree and the agent; a failed step
 *    stops the start and is reported with its output record, because an agent
 *    handed a broken environment "fixes" it — usually by editing the wrong
 *    thing.
 *  - **Ports are allocated, never assumed.** Two lanes of one app both
 *    starting `npm run dev` on :3000 is the parallel-work bug everybody hits;
 *    each lane gets its own span (`allocatePorts`), handed over as env.
 *
 * Imports nothing; plain-node tier (verify:review setup.*).
 */

export interface SetupService {
  /** Short and env-safe after `envName`: `web`, `api`, `db`. */
  name: string
  command: string
  /** Wants a port: the allocated one is handed over as `PORT` (first service) and `TC_PORT_<NAME>`. */
  port: boolean
}

export interface RepoSetup {
  v: 1
  /** The main tree's root — the record's key. */
  root: string
  /** Run in order in a fresh lane before the agent starts; any failure stops the start. */
  install: string[]
  /** Long-running processes a lane may start (as terminals), each with its own port when it wants one. */
  services: SetupService[]
  /** How the lane's checks run — what "Run checks" offers first, and what the agent is told. */
  checks: string[]
  /** Which service the preview opens, and the path on it. */
  previewAt?: { service: string; path: string }
  /** The first port lanes are allocated from, and how many each lane may take. */
  ports: { base: number; span: number }
  updatedAt: number
}

export const SETUP_PORT_BASE = 4100
export const SETUP_PORT_SPAN = 10
export const SETUP_COMMANDS_MAX = 12
export const SETUP_COMMAND_CHARS = 400

const clipCommand = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' || t.length > SETUP_COMMAND_CHARS || /[\n\r\0]/.test(t) ? null : t
}
const commands = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(clipCommand).filter((c): c is string => c !== null).slice(0, SETUP_COMMANDS_MAX) : []

/** A service name the env can carry. */
export function envName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'SERVICE'
}

/**
 * A record read back (from disk, or from the renderer's save). Field-level:
 * a malformed command costs that command, a malformed `ports` falls back to
 * the default span; only a missing `root` costs the record.
 */
export function parseRepoSetup(raw: unknown): RepoSetup | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.root !== 'string' || !r.root.startsWith('/')) return null
  const services: SetupService[] = []
  if (Array.isArray(r.services)) {
    for (const s of r.services) {
      if (typeof s !== 'object' || s === null) continue
      const o = s as Record<string, unknown>
      const command = clipCommand(o.command)
      const name = typeof o.name === 'string' ? o.name.trim().slice(0, 40) : ''
      if (command === null || name === '' || services.some((x) => x.name === name)) continue
      services.push({ name, command, port: o.port === true })
    }
  }
  const p = typeof r.ports === 'object' && r.ports !== null ? r.ports as Record<string, unknown> : {}
  const base = typeof p.base === 'number' && Number.isInteger(p.base) && p.base >= 1024 && p.base <= 65000 ? p.base : SETUP_PORT_BASE
  const span = typeof p.span === 'number' && Number.isInteger(p.span) && p.span >= 1 && p.span <= 100 ? p.span : SETUP_PORT_SPAN
  const pv = typeof r.previewAt === 'object' && r.previewAt !== null ? r.previewAt as Record<string, unknown> : null
  const preview = pv !== null && typeof pv.service === 'string' && services.some((s) => s.name === pv.service)
    ? { service: pv.service, path: typeof pv.path === 'string' && pv.path.startsWith('/') ? pv.path.slice(0, 200) : '/' }
    : undefined
  return {
    v: 1,
    root: r.root,
    install: commands(r.install),
    services: services.slice(0, SETUP_COMMANDS_MAX),
    checks: commands(r.checks),
    ...(preview === undefined ? {} : { previewAt: preview }),
    ports: { base, span },
    updatedAt: typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0
  }
}

/** True when saving would record nothing a lane can use. */
export function isEmptySetup(s: Pick<RepoSetup, 'install' | 'services' | 'checks'>): boolean {
  return s.install.length === 0 && s.services.length === 0 && s.checks.length === 0
}

/**
 * A DRAFT from what the repository already declares. `files` is the root's
 * own listing (names only); `packageJson` its manifest text when there is one.
 * Every guess is the tool the repository's lockfile names — never `npm install`
 * in a pnpm repository, which rewrites the lock the team committed.
 */
export function detectSetup(root: string, files: readonly string[], packageJson?: string): RepoSetup {
  const has = (n: string): boolean => files.includes(n)
  const install: string[] = []
  const checks: string[] = []
  const services: SetupService[] = []
  let scripts: Record<string, string> = {}
  if (packageJson !== undefined) {
    try {
      const parsed = JSON.parse(packageJson) as { scripts?: unknown }
      if (typeof parsed.scripts === 'object' && parsed.scripts !== null) {
        scripts = Object.fromEntries(Object.entries(parsed.scripts as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
      }
    } catch { /* an unreadable manifest is no scripts, not a refusal */ }
  }
  if (packageJson !== undefined || has('package.json')) {
    const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') || has('bun.lock') ? 'bun' : 'npm'
    install.push(pm === 'npm' ? (has('package-lock.json') ? 'npm ci' : 'npm install') : pm === 'yarn' ? 'yarn install --frozen-lockfile' : pm === 'pnpm' ? 'pnpm install --frozen-lockfile' : 'bun install')
    const run = (s: string): string => (pm === 'npm' ? (s === 'test' ? 'npm test' : `npm run ${s}`) : `${pm} ${s === 'test' ? 'test' : `run ${s}`}`)
    for (const s of ['typecheck', 'lint', 'test']) if (scripts[s] !== undefined) checks.push(run(s))
    if (checks.length === 0 && scripts.check !== undefined) checks.push(run('check'))
    if (checks.length === 0 && scripts.verify !== undefined) checks.push(run('verify'))
    const dev = ['dev', 'start', 'serve'].find((s) => scripts[s] !== undefined)
    if (dev !== undefined) services.push({ name: 'web', command: run(dev), port: true })
  }
  if (has('Cargo.toml')) { install.push('cargo fetch'); checks.push('cargo test') }
  if (has('go.mod')) { install.push('go mod download'); checks.push('go test ./...') }
  if (has('requirements.txt')) install.push('python3 -m pip install -r requirements.txt')
  if (has('pyproject.toml') && has('uv.lock')) install.push('uv sync')
  if ((has('pyproject.toml') || has('requirements.txt')) && !checks.some((c) => c.includes('pytest'))) checks.push('python3 -m pytest')
  if (checks.length === 0 && has('Makefile')) checks.push('make test')
  return {
    v: 1,
    root,
    install,
    services,
    checks,
    ...(services.length > 0 ? { previewAt: { service: services[0].name, path: '/' } } : {}),
    ports: { base: SETUP_PORT_BASE, span: SETUP_PORT_SPAN },
    updatedAt: 0
  }
}

/**
 * Ports for one lane: the lane's slot is `base + slot * span`, and within it
 * each port-wanting service takes the next number that is not `taken` (a
 * port another process is already listening on, probed by main). A slot
 * that cannot fit every service answers null for the ones left over, and the
 * caller says so rather than handing out a port outside the span.
 */
export function allocatePorts(setup: Pick<RepoSetup, 'services' | 'ports'>, slot: number, taken: ReadonlySet<number>): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  const start = setup.ports.base + Math.max(0, slot) * setup.ports.span
  let next = start
  for (const s of setup.services) {
    if (!s.port) continue
    while (next < start + setup.ports.span && taken.has(next)) next++
    out[s.name] = next < start + setup.ports.span ? next : null
    if (out[s.name] !== null) next++
  }
  return out
}

/** The env a lane's processes take: `PORT` for the first service with a port, `TC_PORT_<NAME>` for each. */
export function setupEnv(ports: Record<string, number | null>): Record<string, string> {
  const env: Record<string, string> = {}
  let first = true
  for (const [name, port] of Object.entries(ports)) {
    if (port === null) continue
    if (first) { env.PORT = String(port); first = false }
    env[`TC_PORT_${envName(name)}`] = String(port)
  }
  return env
}

/** One preparation step as main reports it. `outputId` opens its whole output (M306's record). */
export interface PrepareStep {
  command: string
  exitCode: number | null
  ms: number
  /** The last few lines, ANSI-free, for the sentence — the record has the rest. */
  tail: string
  outputId?: string
}

export type PrepareResult =
  | { kind: 'prepared'; steps: PrepareStep[]; ports: Record<string, number | null> }
  | { kind: 'failed'; steps: PrepareStep[]; ports: Record<string, number | null> }
  | { kind: 'no-setup' }
  | { kind: 'unreadable'; detail: string }

/** The sentence a failed preparation leaves on the task card — the step, its exit, its own last line. */
export function prepareFailureLine(r: PrepareResult): string | null {
  if (r.kind === 'unreadable') return `Preparation could not run: ${r.detail}`
  if (r.kind !== 'failed') return null
  const bad = r.steps.find((s) => s.exitCode !== 0)
  if (bad === undefined) return 'Preparation failed.'
  const last = bad.tail.split('\n').map((l) => l.trim()).filter((l) => l !== '').pop()
  const how = bad.exitCode === null ? 'was stopped' : `exited ${bad.exitCode}`
  return `Preparation failed before the agent started: \`${bad.command}\` ${how}${last === undefined ? '' : ` — ${last.slice(0, 160)}`}`
}

/**
 * What the agent is told about its environment, appended to the first
 * message. Only what the record SAYS — a check the person never saved is not
 * invented here (task-flow.ts's `suggestCheckCommand` is the review's guess,
 * offered to a person, not stated to an agent as the repository's rule).
 */
export function setupBrief(setup: RepoSetup | null, prepared: PrepareResult | null): string {
  if (setup === null || isEmptySetup(setup)) return ''
  const lines: string[] = ['## Environment']
  if (prepared?.kind === 'prepared' && prepared.steps.length > 0) {
    lines.push(`Already prepared in this worktree: ${prepared.steps.map((s) => `\`${s.command}\``).join(', ')} — do not reinstall unless it breaks.`)
  }
  const ports = prepared !== null && 'ports' in prepared ? prepared.ports : {}
  for (const s of setup.services) {
    const port = ports[s.name]
    lines.push(`- Service **${s.name}**: \`${s.command}\`${s.port ? (typeof port === 'number' ? ` on port ${port} (env PORT / TC_PORT_${envName(s.name)})` : ' — no free port was allocated') : ''}`)
  }
  if (setup.checks.length > 0) lines.push(`Checks that decide whether the work is done: ${setup.checks.map((c) => `\`${c}\``).join(', ')}. Run them before you say you are finished.`)
  return lines.join('\n')
}

/**
 * The setup sheet's services field: one `name: command` per line. A line with
 * no name is named `web`, then `service2`…; every service gets a port — the
 * processes a lane starts are servers, and one without a listener simply
 * leaves its port unused.
 */
export function servicesFromText(text: string): SetupService[] {
  const out: SetupService[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    const m = /^([A-Za-z][\w-]{0,39})\s*:\s*(.+)$/.exec(line)
    const name = m !== null ? m[1] as string : out.length === 0 ? 'web' : `service${out.length + 1}`
    const command = (m !== null ? m[2] as string : line).trim()
    if (command === '' || out.some((s) => s.name === name)) continue
    out.push({ name, command, port: true })
  }
  return out
}

export function servicesText(services: readonly SetupService[]): string {
  return services.map((s) => `${s.name}: ${s.command}`).join('\n')
}

/** One line for Start work: what a new lane of this repository will get before its agent starts. */
export function setupLine(read: { kind: 'saved' | 'draft'; setup: RepoSetup } | { kind: 'not-a-repo' } | null): string {
  if (read === null) return 'reading the repository setup…'
  if (read.kind === 'not-a-repo') return 'not a repository — no setup applies'
  const s = read.setup
  if (read.kind === 'draft') return isEmptySetup(s) ? 'no setup saved — the agent starts in a bare worktree' : `no setup saved — detected ${[...s.install, ...s.checks].slice(0, 2).map((c) => `\`${c}\``).join(', ')}; save it to prepare every lane`
  if (isEmptySetup(s)) return 'the saved setup is empty — the agent starts in a bare worktree'
  const parts: string[] = []
  if (s.install.length > 0) parts.push(`prepares with ${s.install.map((c) => `\`${c}\``).join(' then ')}`)
  if (s.services.length > 0) parts.push(`${s.services.length} ${s.services.length === 1 ? 'service' : 'services'} with their own ports`)
  if (s.checks.length > 0) parts.push(`checks ${s.checks.map((c) => `\`${c}\``).join(', ')}`)
  return parts.join(' · ')
}
