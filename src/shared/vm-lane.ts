/**
 * M550–M551 (lane J). A SANDBOXED LANE — an agent run inside a throwaway
 * Linux VM, so it can run with prompts off without touching the Mac.
 *
 * This file is the shape both processes read: the runtimes, the probe's
 * answer, the sandbox spec and its parser, the egress rule and the label.
 * It imports nothing (shared's rule). The argv for each runtime is built in
 * `main/vm-sandbox.ts`; nothing here spawns.
 *
 * Not M120's `sandbox` (a chat with no place, `main/sandbox.ts`): that one is
 * a FOLDER on the Mac and still asks every permission. The words differ in
 * code on purpose — `vm` here, `sandbox` there — so a reader never takes one
 * for the other. The person-facing word is "sandboxed".
 *
 * THE SPEC'S FOUR PROMISES, each enforced by the parser or the argv builder
 * and each pinned by `verify:vm`:
 * 1. Only the lane's worktree is mounted read-write. No home folder, no
 *    `~/.ssh`, no keychain, no socket of the app's.
 * 2. No credentials but the one the agent needs to reach its model, and that
 *    one by NAME from the login environment (`-e NAME`), so its value is
 *    never on an argv a `ps` can read.
 * 3. Egress only through the app's allowlisting proxy (M554). The image's
 *    entry script drops every other packet before it hands the agent its
 *    unprivileged user.
 * 4. CPU and memory caps, always present: a lane with no cap is refused, not
 *    defaulted silently to the whole Mac.
 */

export type VmRuntimeId = 'apple' | 'orbstack' | 'docker'

/** Preference order when several are usable: Apple's own first (one VM per container), then OrbStack, then Docker. */
export const VM_RUNTIMES: readonly VmRuntimeId[] = ['apple', 'orbstack', 'docker']

/** The binary each runtime is driven through. OrbStack serves the docker CLI; `orb` is only what proves it is there. */
export const VM_RUNTIME_BINARY: Readonly<Record<VmRuntimeId, string>> = { apple: 'container', orbstack: 'docker', docker: 'docker' }

export const VM_RUNTIME_NAME: Readonly<Record<VmRuntimeId, string>> = { apple: 'Apple container', orbstack: 'OrbStack', docker: 'Docker' }

/** Apple's `container` runs on macOS 26 and later, on Apple silicon (bold.md, M550). */
export const APPLE_CONTAINER_MIN_MACOS = 26

export interface VmRuntimeProbe {
  id: VmRuntimeId
  /** The binary's path on the login PATH, or null. */
  path: string | null
  /** True when the runtime can start a VM here and now. */
  usable: boolean
  /** One sentence: why it is or is not usable. */
  why: string
}

export interface VmProbe {
  runtimes: VmRuntimeProbe[]
  /** The first usable runtime in `VM_RUNTIMES` order, or null when none is. */
  chosen: VmRuntimeId | null
}

/** For a caller with no probe behind it (a fixture, an older main). */
export const INERT_VM_PROBE: VmProbe = { runtimes: [], chosen: null }

/**
 * The hosts a sandboxed lane may reach by default: the model's API and the
 * CLI's own sign-in. Everything else — a package registry, GitHub — is a
 * host the person adds (`vm.allowHosts`), because an agent with prompts off
 * and an open network is exactly the lane this feature exists to prevent.
 */
export const VM_DEFAULT_ALLOW: readonly string[] = ['api.anthropic.com', 'statsig.anthropic.com', 'console.anthropic.com', 'claude.ai']

/**
 * The login-environment keys forwarded into the VM, by name, and only these.
 * A Mac's `claude` keeps its sign-in in the Keychain, which a VM cannot read
 * and must not: the person makes a token for it (`claude setup-token`).
 */
export const VM_AUTH_ENV_KEYS: readonly string[] = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY']

/** M552 (critic). What is re-mounted read-only when present in the worktree; see `VmLaneSpec.readOnly`. */
export const VM_READ_ONLY_NAMES: readonly string[] = ['.git', '.claude', '.mcp.json', '.gitmodules']

export const VM_DEFAULT_IMAGE = 'terminal-canvas/lane:1'
export const VM_DEFAULT_CPUS = 4
export const VM_DEFAULT_MEMORY_MIB = 4096
export const VM_MAX_CPUS = 64
export const VM_MAX_MEMORY_MIB = 262_144

export interface VmLaneSpec {
  runtime: VmRuntimeId
  /** A plain name; the VM is `tc-lane-<laneId>`. */
  laneId: string
  /** Absolute host path of the lane's worktree — the ONLY read-write mount. */
  worktree: string
  /** Absolute host path the agent's own state lives in (its `~/.claude` inside), owned by the app. */
  stateDir: string
  image: string
  cpus: number
  memoryMiB: number
  /**
   * Names under the worktree mounted again READ-ONLY over the read-write one
   * (only those that exist): `.git` and the agent configs. Written from the
   * VM, they run code on the Mac later — `core.fsmonitor` at the app's next
   * `git status`, a hook at a commit, a `.claude/settings.json` hook at the
   * Mac's next turn. Optional: absent is none (a fixture).
   */
  readOnly?: string[]
  /** Hosts the proxy lets through (M554). Never empty: the model's API is always one. */
  allow: string[]
  /**
   * Where the VM reaches the app's proxy, and the lane's own secret for it
   * (M554). The proxy reads the lane from the credentials, so one proxy
   * serves every lane with each lane's own allowlist, and nothing else on
   * the network can borrow it.
   */
  proxy: { host: string; port: number; token: string }
  /** Names from `VM_AUTH_ENV_KEYS` present in the login env. */
  authKeys: string[]
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/
const HOST = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
/** An image reference: registry/name:tag or name@sha256:…, no spaces, no leading dash (it would read as a flag). */
const IMAGE = /^[a-z0-9][a-z0-9._/:@-]*$/i

/**
 * Absolute and already NORMAL: no `.` or `..` segment, no `//`, no trailing
 * slash — `/Users/me/.` and `/Users//me` ARE the home folder and must not
 * slip past `covers` (the critic's finding). And no `,` `"` `=` or control
 * character: the path is spliced into `--mount type=bind,source=…`, a CSV
 * whose LAST `source=` wins, so `/x,source=/Users/me` would mount home.
 */
function isAbsoluteClean(p: string): boolean {
  if (!p.startsWith('/') || p.length > 1024) return false
  if (/[,"=\u0000-\u001f\u007f]/.test(p)) return false
  if (p === '/') return true
  const segs = p.split('/').slice(1)
  return segs.every((s) => s !== '' && s !== '.' && s !== '..')
}

/**
 * True when `a` is `b` or a folder above it. Case-folded: APFS ignores
 * case, so `/users/me` is the home folder too. A caller resolves symlinks
 * first (`realpath`); this compares what it is given.
 */
function covers(a: string, b: string): boolean {
  const x = (a.replace(/\/+$/, '') || '/').toLowerCase()
  const y = (b.replace(/\/+$/, '') || '/').toLowerCase()
  return x === y || x === '/' || y.startsWith(x + '/')
}

/**
 * A spec by name, or a refusal saying which promise it would break. The
 * worktree must be a folder the app made for the lane, never the home folder
 * nor anything above it — mounting `~` read-write is the one mistake that
 * makes the whole VM decorative.
 */
export function parseVmLaneSpec(raw: unknown, home: string): { kind: 'ok'; spec: VmLaneSpec } | { kind: 'refused'; reason: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { kind: 'refused', reason: 'the sandbox spec is not an object' }
  const r = raw as Record<string, unknown>
  if (!VM_RUNTIMES.includes(r.runtime as VmRuntimeId)) return { kind: 'refused', reason: 'no VM runtime is named' }
  if (typeof r.laneId !== 'string' || !SEGMENT.test(r.laneId)) return { kind: 'refused', reason: `a lane id must be a plain name — ${JSON.stringify(r.laneId)} is not` }
  for (const key of ['worktree', 'stateDir'] as const) {
    const p = r[key]
    if (typeof p !== 'string' || !isAbsoluteClean(p)) return { kind: 'refused', reason: `the ${key === 'worktree' ? 'worktree' : 'state folder'} must be a plain absolute path — no . or .. segments, no //, and no comma, quote or =` }
    if (covers(p, home)) return { kind: 'refused', reason: `${p} is your home folder or above it — a sandboxed lane mounts only its own worktree` }
  }
  const worktree = r.worktree as string
  const stateDir = r.stateDir as string
  if (covers(worktree, stateDir) || covers(stateDir, worktree)) return { kind: 'refused', reason: 'the worktree and the state folder must not hold each other' }
  if (typeof r.image !== 'string' || !IMAGE.test(r.image)) return { kind: 'refused', reason: 'the image is not an image reference' }
  if (typeof r.cpus !== 'number' || !Number.isInteger(r.cpus) || r.cpus < 1 || r.cpus > VM_MAX_CPUS) return { kind: 'refused', reason: `a lane needs a CPU cap between 1 and ${VM_MAX_CPUS}` }
  if (typeof r.memoryMiB !== 'number' || !Number.isInteger(r.memoryMiB) || r.memoryMiB < 256 || r.memoryMiB > VM_MAX_MEMORY_MIB) return { kind: 'refused', reason: 'a lane needs a memory cap of at least 256 MiB' }
  if (!Array.isArray(r.allow)) return { kind: 'refused', reason: 'the network allowlist is not a list' }
  const allow: string[] = []
  for (const h of r.allow) {
    if (typeof h !== 'string' || !HOST.test(h.toLowerCase())) return { kind: 'refused', reason: `${JSON.stringify(h)} is not a host name (a leading *. is the only wildcard)` }
    if (!allow.includes(h.toLowerCase())) allow.push(h.toLowerCase())
  }
  if (!allow.includes('api.anthropic.com')) return { kind: 'refused', reason: 'the allowlist must hold api.anthropic.com, or the agent cannot reach its model' }
  const proxy = r.proxy as Record<string, unknown> | null | undefined
  if (typeof proxy !== 'object' || proxy === null || typeof proxy.host !== 'string' || proxy.host === '' || /[\s/@]/.test(proxy.host) ||
    typeof proxy.port !== 'number' || !Number.isInteger(proxy.port) || proxy.port < 1 || proxy.port > 65535 ||
    typeof proxy.token !== 'string' || !/^[A-Za-z0-9]{16,128}$/.test(proxy.token)) {
    return { kind: 'refused', reason: 'a sandboxed lane has no network but its proxy, and the proxy is not named' }
  }
  if (!Array.isArray(r.authKeys) || r.authKeys.some((k) => !VM_AUTH_ENV_KEYS.includes(k as string))) {
    return { kind: 'refused', reason: `only ${VM_AUTH_ENV_KEYS.join(' or ')} may pass into the VM` }
  }
  if (r.authKeys.length === 0) return { kind: 'refused', reason: `the VM cannot read your Keychain — set ${VM_AUTH_ENV_KEYS[0]} (from \`claude setup-token\`) in your login shell` }
  return {
    kind: 'ok',
    spec: {
      runtime: r.runtime as VmRuntimeId, laneId: r.laneId, worktree, stateDir, image: r.image,
      cpus: r.cpus, memoryMiB: r.memoryMiB, allow, proxy: { host: proxy.host, port: proxy.port, token: proxy.token },
      authKeys: [...new Set(r.authKeys as string[])],
      ...(Array.isArray(r.readOnly) ? { readOnly: (r.readOnly as unknown[]).filter((n): n is string => typeof n === 'string' && VM_READ_ONLY_NAMES.includes(n)) } : {})
    }
  }
}

/**
 * M554. Whether one CONNECT may leave. Exact host, or `*.example.com` for a
 * strict subdomain (never the bare domain — that is its own entry). HTTPS
 * only: a lane's traffic is a CONNECT to 443, and a plain-HTTP request or
 * another port is refused so nothing travels in the clear or to a stray
 * service. An IP literal is refused outright: an allowlist of names says
 * nothing about a number.
 */
export function vmEgressAllowed(host: string, port: number, allow: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  if (port !== 443) return false
  if (/^[0-9.]+$/.test(h) || h.includes(':') || h === '') return false
  return allow.some((a) => a.startsWith('*.') ? h.endsWith(a.slice(1)) && h.length > a.length - 1 : h === a)
}

export interface VmEgressEntry {
  at: number
  laneId: string
  host: string
  port: number
  allowed: boolean
}

/** M552. One sandboxed lane, as main reports it to every surface. */
export interface VmLaneInfo {
  panelId: string
  laneId: string
  runtime: VmRuntimeId
  /** True while the agent's VM process is live. */
  running: boolean
}

/** M553. `vm:lanes`'s answer: the lanes now, and the egress log's newest entries (the deep-detail layer). */
export interface VmLanesView {
  lanes: VmLaneInfo[]
  egress: VmEgressEntry[]
}

/** The label a sandboxed lane wears everywhere it shows (chip, morning queue, Tonight row). */
export const VM_LANE_LABEL = 'sandboxed'

export function vmLaneWords(runtime: VmRuntimeId, promptsOff: boolean): string {
  return `${VM_LANE_LABEL} · ${VM_RUNTIME_NAME[runtime]}${promptsOff ? ' · prompts off' : ''}`
}
