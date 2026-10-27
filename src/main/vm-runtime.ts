import { execFile } from 'node:child_process'
import { release } from 'node:os'
import { probeVmRuntimes, vmAliveArgs } from './vm-sandbox'
import { VM_RUNTIMES, VM_RUNTIME_BINARY, type VmProbe, type VmRuntimeId } from '../shared/vm-lane'

/**
 * M550 (lane J). The only lines that touch a real VM runtime for the probe:
 * `which` is main's, each service is asked once with a short timeout, and a
 * runtime that does not answer in time reads as not answering — never as
 * usable. A suite loads it only for `macosMajorFromDarwin`; nothing it runs
 * spawns (`vm-sandbox.ts` is the tested half).
 */
const ALIVE_TIMEOUT_MS = 3000

/**
 * Darwin's major is not macOS's: Darwin 20–24 were macOS 11–15, and Apple
 * then jumped to the year, so Darwin 25 is macOS 26 (Tahoe).
 */
export function macosMajorFromDarwin(darwinRelease: string): number | null {
  const major = Number(darwinRelease.split('.')[0])
  if (!Number.isInteger(major) || major < 20) return null
  return major >= 25 ? major + 1 : major - 9
}

function answers(binary: string, args: string[], env: Record<string, string>): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      execFile(binary, args, { env, timeout: ALIVE_TIMEOUT_MS }, (error) => resolve(error === null))
    } catch {
      resolve(false)
    }
  })
}

export async function probeVmRuntimesLive(which: (name: string) => string | null, env: Record<string, string>): Promise<VmProbe> {
  const facts = { platform: process.platform, arch: process.arch, macosMajor: process.platform === 'darwin' ? macosMajorFromDarwin(release()) : null, which }
  // Ask only the runtimes the first pass could use; a missing binary is never spawned.
  const first = probeVmRuntimes(facts)
  const alive = new Map<VmRuntimeId, boolean>()
  await Promise.all(VM_RUNTIMES.map(async (id) => {
    const row = first.runtimes.find((r) => r.id === id)
    if (row === undefined || row.path === null || row.why !== 'installed; its service was not asked') return
    const ctx = id === 'orbstack' ? ['--context', 'orbstack'] : []
    alive.set(id, await answers(row.path ?? VM_RUNTIME_BINARY[id], [...ctx, ...vmAliveArgs(id)], env))
  }))
  return probeVmRuntimes({ ...facts, alive: (id) => alive.get(id) })
}

/**
 * M554. Where the proxy listens and where a VM reaches it, per runtime:
 * - Apple container: the host's side of the VM network (the `default`
 *   network is 192.168.64.0/24, the Mac at .1), bound THERE and nowhere
 *   else, so the LAN never sees it.
 * - Docker and OrbStack: loopback, reached as `host.docker.internal`, which
 *   both forward to the Mac's 127.0.0.1.
 * Null when the Apple network is not up; the lane is then refused by name.
 */
export function vmProxyPlace(runtime: VmRuntimeId, interfaces: Record<string, Array<{ address: string; family: string | number }> | undefined>): { bind: string; reach: string } | null {
  if (runtime !== 'apple') return { bind: '127.0.0.1', reach: 'host.docker.internal' }
  // vmnet's host side is a `bridge<N>` interface at the subnet's .1. The
  // documented default subnet is preferred; another bridge's .1 is the
  // fallback for a person who moved the network (the Mac check confirms).
  const found: string[] = []
  for (const [name, list] of Object.entries(interfaces)) {
    if (!/^bridge\d+$/.test(name)) continue
    for (const a of list ?? []) {
      if ((a.family === 'IPv4' || a.family === 4) && /^192\.168\.\d{1,3}\.1$/.test(a.address)) found.push(a.address)
    }
  }
  const at = found.includes('192.168.64.1') ? '192.168.64.1' : found[0]
  return at === undefined ? null : { bind: at, reach: at }
}
