import type { AgentProcess, AgentRunner, AgentSpawn } from './agent-runner'
import type { AutoCheckResult } from '../shared/auto'
import { parseVmLaneSpec, VM_AUTH_ENV_KEYS, VM_DEFAULT_ALLOW, VM_READ_ONLY_NAMES, VM_RUNTIME_BINARY, type VmLaneInfo, type VmLaneSpec, type VmRuntimeId } from '../shared/vm-lane'
import { shellQuote, vmAgentArgv, vmRunArgs, vmStopArgs } from './vm-sandbox'

/**
 * M552 (lane J). THE VM LANES — which chat panels run their agent in a VM,
 * and the runner that puts them there.
 *
 * It WRAPS the manager's runner rather than living inside the manager: the
 * manager spawns exactly as it always has, and this wrapper turns a spawn
 * for a sandboxed panel into `container run … claude …` through the same
 * real runner, so the stream-json wire, the stderr tail, the identity guard
 * and the kill all stay the ones M71 measured. The panel is read from the
 * spawn's `TC_PANEL_ID` — the variable `envFor` already stamps on every
 * chat's processes (M102) — so no manager signature changes for this.
 *
 * THE CHECK RUNS IN THE VM TOO. A check is a command over files the agent
 * wrote with prompts off; running it on the Mac would hand the Mac exactly
 * the code the VM exists to keep off it. A sandboxed lane's check gets its
 * own fresh VM with the same spec and the same proxy.
 *
 * CLEAN UP ON EVERY WAY A LANE ENDS:
 * - the agent exits on its own → `--rm` removes its VM;
 * - the manager kills it (stop, interrupt, dispose) → the CLI client is
 *   signalled AND the VM is stopped by name, because signalling the client
 *   is not proven to stop the VM on every runtime;
 * - the lane is left (`leave`) or the app quits (`disposeAll`) → stop by
 *   name, then the lane's state folder is removed;
 * - a crash left one behind → `enter` stops a VM by the lane's name first.
 * Every stop is fire-and-forget and its exit code ignored: stopping a VM
 * that is already gone is the common case, not a failure.
 *
 * Pure over injected deps, so `verify:vm vm.run.*` drives every arm with a
 * fake runner and records every command.
 */

export interface VmLaneSettings {
  image: string
  cpus: number
  memoryMiB: number
  /** The hosts beyond the default ones, from `vm.allowHosts`. */
  allow: readonly string[]
}

export interface VmLanesDeps {
  /** The real runner (`claudeCliRunner`), or a fake. */
  inner: AgentRunner
  /** The real check runner (`runAutoCheck`), or a fake. */
  runCheck(spec: { command: string; cwd: string; env: Record<string, string>; timeoutMs: number; signal: AbortSignal }): Promise<AutoCheckResult>
  /** Runs one runtime command to completion; its result is never read. */
  exec(binary: string, args: string[], env: Record<string, string>): void
  mkdir(path: string): void
  rm(path: string): void
  /** The path with every symlink resolved (`realpathSync`); throws for a path that does not exist. */
  realpath(path: string): string
  exists(path: string): boolean
  home: string
  /** `userData/vm-lanes`; each lane's state folder is a child of it. */
  stateRoot: string
  /** The runtime the probe chose, or null when none is usable. */
  runtime(): VmRuntimeId | null
  settings(): VmLaneSettings
  /** Where a VM of this runtime reaches the app's allowlisting proxy, or null while it is not listening (M554). */
  proxy(runtime: VmRuntimeId): { host: string; port: number } | null
  /** A fresh per-lane proxy secret (16+ letters and digits). */
  newToken(): string
  loginEnv: Record<string, string>
  onChange?(lanes: VmLaneInfo[]): void
}

export type { VmLaneInfo }

export interface VmLanes {
  /** Mark a chat panel sandboxed. Refused by name when no runtime, no proxy or no token can make it safe. */
  enter(panelId: string, cwd: string): { kind: 'ok'; laneId: string; runtime: VmRuntimeId } | { kind: 'refused'; reason: string }
  /** Stop its VM, forget the panel, remove its state. True when it was a lane. */
  leave(panelId: string): boolean
  has(panelId: string): boolean
  list(): VmLaneInfo[]
  /** M554. The hosts a lane's proxy lets through, by lane id; empty for an unknown lane, so its traffic is refused. */
  allowOf(laneId: string): readonly string[]
  /** M554. The lane's proxy secret; undefined for an unknown lane. */
  tokenOf(laneId: string): string | undefined
  /** The manager's runner: sandboxed panels into a VM, everything else untouched. */
  runner: AgentRunner
  runCheck: VmLanesDeps['runCheck']
  disposeAll(): void
}

interface Lane {
  panelId: string
  spec: VmLaneSpec
  spawned: boolean
  running: boolean
}

/**
 * A plain name for the VM and its state folder, unique per panel id: the
 * cleaned prefix is for a person reading `container list`, the hash of the
 * WHOLE id is what keeps two panels whose ids clean to the same prefix from
 * sharing (and stopping) one VM.
 */
export function laneIdOf(panelId: string): string {
  const clean = panelId.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 30)
  let h = 0x811c9dc5
  for (let i = 0; i < panelId.length; i++) { h ^= panelId.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return `${clean === '' ? 'lane' : clean}-${h.toString(16).padStart(8, '0')}`
}

/** The VM's process gets the login env's PATH and HOME and the token by name — never the app's socket, panel token or anything else. */
function vmClientEnv(login: Record<string, string>, keys: readonly string[]): Record<string, string> {
  const env: Record<string, string> = {}
  for (const k of ['PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST', 'DOCKER_CONFIG', ...keys]) {
    const v = login[k]
    if (v !== undefined) env[k] = v
  }
  return env
}

/** A process that never ran: it exits on the next tick with the reason as its stderr, so the session reads `exited` with words. */
function refusedProcess(reason: string): AgentProcess {
  const exitCbs: Array<(info: { code: number | null; signal: string | null; stderr?: string }) => void> = []
  setTimeout(() => { for (const cb of exitCbs) cb({ code: null, signal: null, stderr: reason }) }, 0)
  return { pid: undefined, write() {}, onData() {}, onExit(cb) { exitCbs.push(cb) }, kill() {} }
}

export function createVmLanes(deps: VmLanesDeps): VmLanes {
  const lanes = new Map<string, Lane>()
  const changed = (): void => { deps.onChange?.(list()) }
  const list = (): VmLaneInfo[] => [...lanes.values()].map((l) => ({ panelId: l.panelId, laneId: l.spec.laneId, runtime: l.spec.runtime, running: l.running }))
  const clientEnv = (spec: VmLaneSpec): Record<string, string> => vmClientEnv(deps.loginEnv, spec.authKeys)
  const stop = (spec: VmLaneSpec, role: 'agent' | 'check' = 'agent'): void => {
    for (const args of vmStopArgs(spec.runtime, spec.laneId, role)) {
      try { deps.exec(VM_RUNTIME_BINARY[spec.runtime], args, clientEnv(spec)) } catch { /* already gone */ }
    }
  }
  const laneOf = (env: Record<string, string>): Lane | undefined => {
    const id = env['TC_PANEL_ID']
    return id === undefined ? undefined : lanes.get(id)
  }

  const runner: AgentRunner = (spawn: AgentSpawn): AgentProcess => {
    const lane = laneOf(spawn.env)
    if (lane === undefined) return deps.inner(spawn)
    const argv = vmAgentArgv(spawn.command, spawn.args, !lane.spawned)
    if (argv.kind === 'refused') return refusedProcess(argv.reason)
    const run = vmRunArgs(lane.spec, { command: argv.command, args: argv.args })
    lane.spawned = true
    lane.running = true
    changed()
    const proc = deps.inner({ command: run.binary, args: run.args, cwd: spawn.cwd, env: { ...clientEnv(lane.spec), ...run.env }, ...(spawn.closeStdin === true ? { closeStdin: true } : {}) })
    proc.onExit(() => {
      // Only the lane's CURRENT process clears the flag; a lane left meanwhile is gone from the map.
      if (lanes.get(lane.panelId) !== lane) return
      lane.running = false
      changed()
    })
    return {
      get pid() { return proc.pid },
      write: (line) => proc.write(line),
      onData: (cb) => proc.onData(cb),
      onExit: (cb) => proc.onExit(cb),
      kill: () => { proc.kill(); stop(lane.spec) }
    }
  }

  const runCheck: VmLanesDeps['runCheck'] = async (spec) => {
    const lane = laneOf(spec.env)
    if (lane === undefined) return deps.runCheck(spec)
    const run = vmRunArgs(lane.spec, { command: 'sh', args: ['-c', spec.command] }, 'check')
    // Through the same login-shell runner, so its timeout, abort and group kill
    // still apply; the VM itself is stopped by name after, however it ended.
    const line = [run.binary, ...run.args].map(shellQuote).join(' ')
    try {
      return await deps.runCheck({ ...spec, command: line, env: { ...clientEnv(lane.spec), ...run.env, SHELL: spec.env['SHELL'] ?? '/bin/sh' } })
    } finally {
      stop(lane.spec, 'check')
    }
  }

  return {
    enter(panelId, cwd) {
      const existing = lanes.get(panelId)
      if (existing !== undefined) return { kind: 'ok', laneId: existing.spec.laneId, runtime: existing.spec.runtime }
      const runtime = deps.runtime()
      if (runtime === null) return { kind: 'refused', reason: 'no VM runtime is usable on this Mac — see Environment… for why' }
      const proxy = deps.proxy(runtime)
      if (proxy === null) return { kind: 'refused', reason: 'the sandbox network proxy is not running, so a VM would have no allowlist' }
      const settings = deps.settings()
      const laneId = laneIdOf(panelId)
      // Symlinks resolved BEFORE the home check: a link to ~ is ~.
      let worktree: string
      try { worktree = deps.realpath(cwd) } catch { return { kind: 'refused', reason: `the chat's folder ${cwd} does not exist` } }
      const parsed = parseVmLaneSpec({
        runtime, laneId, worktree,
        readOnly: VM_READ_ONLY_NAMES.filter((n) => deps.exists(`${worktree.replace(/\/+$/, '')}/${n}`)), stateDir: `${deps.stateRoot.replace(/\/+$/, '')}/${laneId}`,
        image: settings.image, cpus: settings.cpus, memoryMiB: settings.memoryMiB,
        allow: [...VM_DEFAULT_ALLOW, ...settings.allow],
        proxy: { ...proxy, token: deps.newToken() }, authKeys: VM_AUTH_ENV_KEYS.filter((k) => (deps.loginEnv[k] ?? '') !== '')
      }, deps.home)
      if (parsed.kind === 'refused') return parsed
      // Fresh every time: a folder a crash left would hold a transcript at the
      // id the first spawn pins, and the CLI refuses to create one that exists.
      try { deps.rm(parsed.spec.stateDir) } catch { /* none */ }
      try { deps.mkdir(parsed.spec.stateDir) } catch (error) { return { kind: 'refused', reason: `could not make the lane's state folder: ${String(error)}` } }
      // A VM a crash left under this name would refuse the new one's --name.
      stop(parsed.spec)
      lanes.set(panelId, { panelId, spec: parsed.spec, spawned: false, running: false })
      changed()
      return { kind: 'ok', laneId, runtime }
    },
    leave(panelId) {
      const lane = lanes.get(panelId)
      if (lane === undefined) return false
      lanes.delete(panelId)
      stop(lane.spec)
      try { deps.rm(lane.spec.stateDir) } catch { /* already gone */ }
      changed()
      return true
    },
    has: (panelId) => lanes.has(panelId),
    list,
    allowOf: (laneId) => [...lanes.values()].find((l) => l.spec.laneId === laneId)?.spec.allow ?? [],
    tokenOf: (laneId) => [...lanes.values()].find((l) => l.spec.laneId === laneId)?.spec.proxy.token,
    runner,
    runCheck,
    disposeAll() {
      for (const id of [...lanes.keys()]) this.leave(id)
    }
  }
}

