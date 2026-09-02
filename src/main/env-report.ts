
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
import { REPORTED_CLIS, type CliName, type EnvReport } from '../shared/env-report'
export { INERT_ENV_REPORT, REPORTED_CLIS, type CliName, type EnvReport } from '../shared/env-report'

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
    control: f.control
  }
}
