import {
  APPLE_CONTAINER_MIN_MACOS, VM_RUNTIMES, VM_RUNTIME_BINARY,
  type VmLaneSpec, type VmProbe, type VmRuntimeId, type VmRuntimeProbe
} from '../shared/vm-lane'

/**
 * M550–M551 (lane J). The VM runtimes, probed, and the argv that starts and
 * stops a sandboxed lane in each. PURE: every fact (the platform, the macOS
 * version, `which`, whether a runtime's service answered) arrives as an
 * argument, so `verify:vm` drives each arm under plain node and nothing in
 * `npm run verify` ever starts a VM. The composition root owns the processes.
 */

export interface VmProbeFacts {
  platform: string
  arch: string
  /** macOS major version (26 for Tahoe); null off a Mac or when unread. */
  macosMajor: number | null
  which(name: string): string | null
  /**
   * Whether the runtime's service answered (`container system status`,
   * `docker info`). Undefined when it was not asked — then a found binary is
   * reported as found but not proven usable, never as usable.
   */
  alive?(id: VmRuntimeId): boolean | undefined
}

export function probeVmRuntimes(f: VmProbeFacts): VmProbe {
  const runtimes: VmRuntimeProbe[] = VM_RUNTIMES.map((id) => probeOne(id, f))
  return { runtimes, chosen: runtimes.find((r) => r.usable)?.id ?? null }
}

function probeOne(id: VmRuntimeId, f: VmProbeFacts): VmRuntimeProbe {
  if (f.platform !== 'darwin') return { id, path: null, usable: false, why: 'sandboxed lanes run on a Mac only' }
  if (id === 'apple') {
    if (f.arch !== 'arm64') return { id, path: null, usable: false, why: 'Apple container needs Apple silicon' }
    if (f.macosMajor === null || f.macosMajor < APPLE_CONTAINER_MIN_MACOS) {
      return { id, path: null, usable: false, why: `Apple container needs macOS ${APPLE_CONTAINER_MIN_MACOS} or later` }
    }
  }
  // OrbStack and Docker share the docker CLI; `orb` is what tells them apart.
  // Without it a docker CLI is Docker's (Desktop or Colima), and with it the
  // same CLI is OrbStack's — never both rows usable for one engine.
  const orb = f.which('orb')
  if (id === 'orbstack' && orb === null) return { id, path: null, usable: false, why: 'OrbStack is not installed' }
  if (id === 'docker' && orb !== null) return { id, path: f.which('docker'), usable: false, why: 'the docker CLI here is OrbStack\'s — listed under OrbStack' }
  const path = f.which(VM_RUNTIME_BINARY[id])
  if (path === null) return { id, path: null, usable: false, why: `${VM_RUNTIME_BINARY[id]} is not on the login PATH` }
  const alive = f.alive?.(id)
  if (alive === undefined) return { id, path, usable: false, why: 'installed; its service was not asked' }
  if (!alive) return { id, path, usable: false, why: id === 'apple' ? 'installed but not started — run `container system start`' : 'installed but its engine is not running' }
  return { id, path, usable: true, why: 'installed and answering' }
}

/** The command that asks a runtime's service whether it is up. Exit 0 is yes. */
export function vmAliveArgs(id: VmRuntimeId): string[] {
  return id === 'apple' ? ['system', 'status'] : ['info', '--format', '{{.ServerVersion}}']
}

/** The VM's name: one per lane, so a stale one is found and removed by name. */
export const vmName = (laneId: string): string => `tc-lane-${laneId}`

/** The image's network lock (docs/streams/vm-lane/tc-vm-entry.sh). */
export const VM_ENTRY = '/usr/local/bin/tc-vm-entry'

/** Inside the VM: where the worktree lands, and the agent's home. */
export const VM_WORK = '/work'
export const VM_HOME = '/home/agent'

/**
 * The argv that runs one command in a fresh VM for the lane. `--rm` so the
 * VM leaves nothing on exit; `-i` so stdin stays open for the stream-json
 * wire (no `-t`: a TTY would mangle JSON lines). Two mounts and only two.
 * The proxy rides as both the proxy variables and `TC_VM_PROXY`, which the
 * image's entry script reads to set its firewall before dropping to the
 * unprivileged user; NET_ADMIN is that script's, and it is gone by the time
 * the agent runs. Auth keys are `-e NAME`: the runtime inherits the value
 * from the spawn's env, so it never sits on an argv.
 */
/** The proxy variables, both spellings: curl reads only the lower-case http_proxy, node's agents the upper. */
export const VM_PROXY_KEYS: readonly string[] = ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']

/**
 * `env` is what the runtime's CLIENT process must hold for the `-e NAME`
 * entries to inherit: the proxy URL with the lane's secret. The caller adds
 * it to the client's env; it never appears on the argv.
 */
export function vmRunArgs(spec: VmLaneSpec, inner: { command: string; args: readonly string[] }, role: 'agent' | 'check' = 'agent'): { binary: string; args: string[]; env: Record<string, string> } {
  const proxy = `http://${spec.laneId}:${spec.proxy.token}@${spec.proxy.host}:${spec.proxy.port}`
  const mount = (source: string, target: string, readonly = false): string[] => ['--mount', `type=bind,source=${source},target=${target}${readonly ? ',readonly' : ''}`]
  const args = [
    ...(spec.runtime === 'orbstack' ? ['--context', 'orbstack'] : []),
    'run', '--rm', '-i',
    // A lane's check runs in a second, fresh VM beside the agent's (whose
    // stream-json process lives between turns), so the two never share a name.
    '--name', role === 'agent' ? vmName(spec.laneId) : `${vmName(spec.laneId)}-check`,
    // Apple's CLI spells it `-l, --label`; docker takes `--label`. Both take the long form.
    '--label', `tc.lane=${spec.laneId}`,
    '--cpus', String(spec.cpus),
    '--memory', `${spec.memoryMiB}M`,
    '--cap-add', 'NET_ADMIN',
    ...mount(spec.worktree, VM_WORK),
    ...mount(spec.stateDir, `${VM_HOME}/.claude`),
    // Over the read-write worktree, later mounts win for their path.
    ...(spec.readOnly ?? []).flatMap((name) => mount(`${spec.worktree}/${name}`, `${VM_WORK}/${name}`, true)),
    // The lock is the image's entry script, named here rather than trusted
    // to the image's own ENTRYPOINT: an image without it fails to start,
    // never runs an agent with no firewall.
    '--entrypoint', VM_ENTRY,
    '--workdir', VM_WORK,
    '-e', `TC_VM_LANE=${spec.laneId}`,
    '-e', `TC_VM_PROXY=${spec.proxy.host}:${spec.proxy.port}`,
    // By name, like the token: the lane's proxy secret is in the URL.
    ...VM_PROXY_KEYS.flatMap((k) => ['-e', k]),
    '-e', 'NO_PROXY=', '-e', 'no_proxy=',
    // claude refuses bypassPermissions as root unless told it is sandboxed;
    // the entry script runs it as `agent`, and this says what the box is.
    '-e', 'IS_SANDBOX=1',
    ...spec.authKeys.flatMap((k) => ['-e', k]),
    spec.image,
    inner.command, ...inner.args
  ]
  return { binary: VM_RUNTIME_BINARY[spec.runtime], args, env: Object.fromEntries(VM_PROXY_KEYS.map((k) => [k, proxy])) }
}

/** Stop then remove, by name. Both are safe on a VM that is already gone; the caller ignores their exit codes. */
export function vmStopArgs(runtime: VmRuntimeId, laneId: string, role: 'agent' | 'check' = 'agent'): string[][] {
  const ctx = runtime === 'orbstack' ? ['--context', 'orbstack'] : []
  const name = role === 'agent' ? vmName(laneId) : `${vmName(laneId)}-check`
  return runtime === 'apple'
    ? [['stop', '--time', '5', name], ['delete', '--force', name]]
    : [[...ctx, 'stop', '--time', '5', name], [...ctx, 'rm', '--force', name]]
}

/**
 * The headless claude argv, made fit for a VM with prompts off:
 * - `--permission-prompt-tool stdio` goes, and every `--permission-mode`
 *   pair, replaced by ONE `--permission-mode bypassPermissions` — two modes
 *   is an argv the CLI refuses.
 * - `--settings` goes: its hooks call `tc` over the app's socket, which is
 *   not in the VM by design, and a person's settings path is a Mac path.
 * - On the lane's FIRST spawn a `--resume <id>` becomes `--session-id <id>`:
 *   the transcript it names lives in the Mac's `~/.claude`, which the VM
 *   cannot see. Later spawns resume from the lane's own state folder.
 * - The binary is the image's `claude`, never the Mac's path to it.
 */
export function vmAgentArgv(command: string, args: readonly string[], firstSpawn: boolean): { kind: 'ok'; command: string; args: string[] } | { kind: 'refused'; reason: string } {
  const base = command.split('/').pop() ?? command
  if (base !== 'claude') return { kind: 'refused', reason: `a sandboxed lane runs Claude Code only — not ${base}` }
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--permission-prompt-tool' || a === '--permission-mode' || a === '--settings') { i++; continue }
    if (a.startsWith('--permission-mode=') || a.startsWith('--settings=') || a.startsWith('--permission-prompt-tool=')) continue
    if (a === '--resume' && firstSpawn) { out.push('--session-id', args[i + 1] ?? ''); i++; continue }
    out.push(a)
  }
  out.push('--permission-mode', 'bypassPermissions')
  return { kind: 'ok', command: 'claude', args: out }
}

/** One POSIX single-quoted word: the check's command line reaches the VM's `sh -c` as exactly the text the person wrote. */
export function shellQuote(word: string): string {
  return `'${word.replace(/'/g, `'\\''`)}'`
}
