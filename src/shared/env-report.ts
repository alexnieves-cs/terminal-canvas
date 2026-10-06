/**
 * M48. The environment report's SHAPE, shared by main (which builds it) and
 * the renderer (which renders it). The builder stays in main/env-report.ts;
 * this file imports nothing, like every other shared contract, so the web
 * project can name the type without reaching into main.
 */
export type CliName = 'claude' | 'codex' | 'git'
export const REPORTED_CLIS: readonly CliName[] = ['claude', 'codex', 'git']

export interface EnvReport {
  probedAt: number
  shell: { path: string; ok: boolean; reason?: string }
  pathEntries: string[]
  clis: Array<{ name: CliName; path: string | null }>
  tmux: { kind: 'tmux' | 'direct'; reason: string; path: string | null }
  layout: { path: string; backupWritten: boolean }
  /** Sorted key names of the resolved login environment. Names, never values. */
  envKeys: string[]
  /** M54. The control socket and the `tc` launcher; null when this instance owns no door. */
  control: { socket: string; cliPath: string } | null
  /**
   * M107. What discovery DID: which shells were asked and which folders were
   * checked, and whether the shell answered at all. Absent on a report built
   * by an older main (a fixture); `probeOutcome` then reads the shell as
   * reported — and a shell that did not answer is never `not-found`.
   */
  probe?: { shells: string[]; folders: string[]; timedOut: boolean }
}

export type ProbeOutcome =
  | { kind: 'found'; sentence: string }
  | { kind: 'not-found'; sentence: string }
  | { kind: 'no-answer'; sentence: string }

/**
 * M107. THREE STATES, NEVER TWO. A shell that timed out or never answered is
 * `no-answer` — a slow or prompting `~/.zshrc` — and says the `~/.zprofile`
 * fix; only a shell that ANSWERED and still had no CLI is `not-found`.
 * Collapsing the two sends a user to reinstall a CLI that is installed.
 */
export function probeOutcome(report: EnvReport): ProbeOutcome {
  const found = report.clis.filter((c) => c.path !== null).map((c) => c.name)
  const missing = report.clis.filter((c) => c.path === null).map((c) => c.name)
  const shells = report.probe?.shells ?? (report.shell.path === '' ? [] : [report.shell.path])
  const folders = report.probe?.folders ?? report.pathEntries
  const asked = `asked ${shells.length === 0 ? 'no shell' : shells.join(', ')} · checked ${folders.length} folder${folders.length === 1 ? '' : 's'}`
  if (!report.shell.ok || report.probe?.timedOut === true) {
    return { kind: 'no-answer', sentence: `the shell didn't answer (${report.shell.reason ?? 'no reply'}) — a slow or prompting ~/.zshrc; put PATH edits in ~/.zprofile, then Check again · ${asked}` }
  }
  if (missing.length === 0) return { kind: 'found', sentence: `${found.join(', ')} found · ${asked}` }
  return { kind: 'not-found', sentence: `${missing.join(', ')} not found — install ${missing.length === 1 ? 'it' : 'them'} so ${missing.length === 1 ? 'it is' : 'they are'} on the login PATH · ${asked}` }
}

/** For harnesses that register the handler without a real probe behind it. */
/**
 * M440. One binary, three answers. A timeout is `unknown` — discovery did not
 * answer — and is never reported as missing. `versionWords` says so when the
 * binary was found and printed no version.
 */
export const BINARY_PROBE_TIMEOUT_MS = 5000

export type BinaryProbeClass = 'found' | 'missing' | 'unknown'

export function classifyBinaryProbe(probe: { path: string | null; timedOut?: boolean }): BinaryProbeClass {
  if (probe.timedOut === true) return 'unknown'
  if (probe.path === null || probe.path === '') return 'missing'
  return 'found'
}

export function versionWords(version: string | null | undefined): string {
  if (version === undefined || version === null || version.trim() === '') return 'version unknown'
  return version.trim()
}

export function probeWithin<T>(
  work: Promise<T>,
  ms: number,
  timer: { set(fn: () => void, ms: number): unknown; clear(id: unknown): void }
): Promise<T | { timedOut: true }> {
  return new Promise((resolve) => {
    let settled = false
    const id = timer.set(() => {
      if (settled) return
      settled = true
      resolve({ timedOut: true })
    }, ms)
    work.then((value) => {
      if (settled) return
      settled = true
      timer.clear(id)
      resolve(value)
    }, () => {
      if (settled) return
      settled = true
      timer.clear(id)
      resolve({ timedOut: true })
    })
  })
}

export const INERT_ENV_REPORT: EnvReport = {
  probedAt: 0,
  shell: { path: '', ok: true },
  pathEntries: [],
  clis: REPORTED_CLIS.map((name) => ({ name, path: null })),
  tmux: { kind: 'direct', reason: 'not probed', path: null },
  layout: { path: '', backupWritten: false },
  envKeys: [],
  control: null
}
