
/**
 * M48. The environment report: the facts main already resolves at startup
 * and used to print to stdout, where nobody looking at "command not found"
 * in every panel could see them.
 *
 * PURE, and plain-node tested (verify:tmux env.1): every fact arrives as an
 * argument. Key NAMES only for the login environment — never values — which
 * is #31's rule for that environment and the credential boundary's rule for
 * everything else: a report is exactly the artifact that gets pasted into an
 * issue. `probedAt` is load-bearing rather than decorative: the probe runs
 * ONCE, so a `brew install` mid-session is invisible until relaunch, and a
 * report that did not say when it looked would turn that limit into a lie.
 */
import { BINARY_PROBE_TIMEOUT_MS, REPORTED_CLIS, probeWithin, type CliName, type EnvReport } from '../shared/env-report'
export { BINARY_PROBE_TIMEOUT_MS, INERT_ENV_REPORT, REPORTED_CLIS, classifyBinaryProbe, probeOutcome, probeWithin, versionWords, type BinaryProbeClass, type CliName, type EnvReport, type ProbeOutcome } from '../shared/env-report'

export interface EnvReportFacts {
  env: Record<string, string>
  shell: { path: string; ok: boolean; reason?: string }
  which: (name: CliName) => string | null
  /** Structurally the probe's BackendChoice, so this file imports nothing from main. */
  backend: { kind: 'tmux' | 'direct'; reason: string; tmuxPath: string | null }
  layoutPath: string
  backupWritten: boolean
  now: number
  control: { socket: string; cliPath: string } | null
  /** M107. Absent for a caller that does not know (a fixture). */
  probe?: { shells: string[]; timedOut: boolean }
}

export function buildEnvReport(f: EnvReportFacts): EnvReport {
  const path = f.env['PATH'] ?? ''
  return {
    probedAt: f.now,
    shell: f.shell.reason === undefined
      ? { path: f.shell.path, ok: f.shell.ok }
      : { path: f.shell.path, ok: f.shell.ok, reason: f.shell.reason },
    pathEntries: path === '' ? [] : path.split(':').filter((p) => p !== ''),
    clis: REPORTED_CLIS.map((name) => ({ name, path: f.which(name) })),
    tmux: { kind: f.backend.kind, reason: f.backend.reason, path: f.backend.tmuxPath },
    layout: { path: f.layoutPath, backupWritten: f.backupWritten },
    envKeys: Object.keys(f.env).sort(),
    control: f.control,
    ...(f.probe === undefined ? {} : { probe: { shells: [...f.probe.shells], folders: path === '' ? [] : path.split(':').filter((p) => p !== ''), timedOut: f.probe.timedOut } })
  }
}

/**
 * M440. One binary on the login PATH main already resolved. `which` and
 * `versionOf` are injected so this module never spawns: the composition root
 * owns the process, and a check can answer without one. A timeout is returned
 * as `timedOut`, not as a missing path.
 */
export async function discoverBinary(
  name: string,
  which: (name: string) => Promise<string | null> | string | null,
  versionOf: (path: string) => Promise<string | null> | string | null,
  timeoutMs = BINARY_PROBE_TIMEOUT_MS,
  timer: { set(fn: () => void, ms: number): unknown; clear(id: unknown): void } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>)
  }
): Promise<{ name: string; path: string | null; version: string | null; timedOut: boolean }> {
  const located = await probeWithin(Promise.resolve().then(() => which(name)), timeoutMs, timer)
  if (typeof located === 'object' && located !== null && 'timedOut' in located) {
    return { name, path: null, version: null, timedOut: true }
  }
  const path = typeof located === 'string' && located !== '' ? located : null
  if (path === null) return { name, path: null, version: null, timedOut: false }
  const printed = await probeWithin(Promise.resolve().then(() => versionOf(path)), timeoutMs, timer)
  if (typeof printed === 'object' && printed !== null && 'timedOut' in printed) {
    return { name, path, version: null, timedOut: true }
  }
  const version = typeof printed === 'string' && printed.trim() !== '' ? printed.trim() : null
  return { name, path, version, timedOut: false }
}
