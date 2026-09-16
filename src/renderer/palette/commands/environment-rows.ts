import { updateSentence, type UpdateState } from '@renderer/session/update-store'
import type { EnvReport } from '@shared/env-report'
import type { Command } from '../palette-model'
import { withReason } from './with-reason'



/**
 * M48. The Environment scope: a door at rest, and one INFORMATION row per
 * fact of the report. Information rows run nothing — they exist so "why does
 * Claude not appear" has an answer one Cmd+K away, in the same surface every
 * other answer lives in. Exported so verify:palette drives it from a report
 * fixture; `null` (the invoke has not answered) yields the door alone,
 * disabled with a reason, never an absent door.
 */
export const REASON_NO_ENV_REPORT = 'the environment has not been read yet'

export function buildEnvironmentRows(report: EnvReport | null, update: UpdateState | null = null): Command[] {
  const rows: Command[] = []
  const info = (id: string, title: string, subtitle: string, searchText: string): Command => ({
    id, title, subtitle, group: 'manage', scope: 'environment', hiddenAtRest: true, searchText, run: () => {}
  })
  rows.push(
    withReason(
      {
        id: 'manage.environment',
        title: 'Environment…',
        subtitle: report === null
          ? 'what the app found at startup'
          : `${report.clis.filter((c) => c.path !== null).length} of ${report.clis.length} CLIs found · ${report.tmux.kind === 'tmux' ? 'tmux' : 'no tmux'}`,
        group: 'manage',
        entersScope: 'environment',
        searchText: 'environment path claude codex git tmux shell found not found install report',
        run: () => {}
      },
      report === null ? REASON_NO_ENV_REPORT : undefined
    )
  )
  if (report === null) return rows
  rows.push(info('env.shell',
    report.shell.ok ? `Login shell read: ${report.shell.path || 'default'}` : `Login shell could not be read: ${report.shell.path || 'default'}`,
    report.shell.ok
      ? `${report.pathEntries.length} PATH entries resolved from it`
      : `${report.shell.reason ?? 'the probe failed'} — CLIs installed through your shell's rc files may not be found`,
    'shell zsh bash login probe failed'))
  const INSTALL: Record<string, string> = {
    claude: 'install the Claude Code CLI so `claude` is on your PATH',
    codex: 'install the Codex CLI so `codex` is on your PATH',
    git: 'install git (Xcode command line tools, or Homebrew)'
  }
  for (const cli of report.clis) {
    rows.push(info(`env.cli.${cli.name}`,
      cli.path === null ? `${cli.name}: not found` : `${cli.name}: found`,
      cli.path ?? INSTALL[cli.name] ?? 'not on PATH',
      `${cli.name} cli found missing install path`))
  }
  rows.push(info('env.tmux',
    report.tmux.kind === 'tmux' ? 'tmux: in use' : 'tmux: not in use — sessions end with the window',
    report.tmux.path ? `${report.tmux.path} — ${report.tmux.reason}` : report.tmux.reason,
    'tmux backend session survive'))
  rows.push(info('env.path', `PATH: ${report.pathEntries.length} entries`, report.pathEntries.join(' · ') || '(empty)', 'path entries'))
  rows.push(info('env.layout',
    report.layout.backupWritten ? 'Layout file: a newer file was preserved as .bak' : 'Layout file',
    report.layout.path || '(not yet written)', 'layout file json bak'))
  // M54. The door. The launcher is on PATH inside every panel already; the
  // subtitle is the one line that puts it on PATH outside.
  // `?? null`: a report built by an older main (or a fixture) has no key at
  // all, and absent reads as null rather than as a crash.
  const control = report.control ?? null
  rows.push(info('env.tc',
    control === null ? 'tc: not available in this instance' : `tc: ${control.cliPath}`,
    control === null
      ? 'another instance of this build owns the control socket'
      : `on PATH inside every panel; outside, export PATH="${control.cliPath.replace(/\/tc$/, '')}:$PATH" — or open terminal-canvas://open?preset=…`,
    'tc cli command line socket url scheme'))
    rows.push(info('env.probed', `Read at ${new Date(report.probedAt).toLocaleTimeString()}`,
    'once, at launch — a CLI installed since is not seen until relaunch', 'probed at time relaunch'))
  // M123. FOUR sentences for the update notice — not checked, up to date,
  // newer, could not check — and `not checked` is the rest state: the
  // launch check is off by default, and "never asked" must not read as
  // "up to date". Never a fifth row for `newer` with a verb: the
  // information rows do nothing on Enter (their `run` is a no-op by the
  // scope's rule); the door with the verb is `Check for updates…`.
  const u = update ?? EMPTY_UPDATE
  rows.push(info('env.update',
    `Update: ${updateSentence(u)}`,
    u.result === null
      ? 'Check for updates… asks GitHub by hand; the launch check is a setting, off by default'
      : u.result.kind === 'newer'
        ? `${u.result.url} — nothing is downloaded or installed; download the release by hand`
        : u.result.kind === 'current'
          ? `read at ${new Date(u.at).toLocaleTimeString()} from the releases feed`
          : 'the releases feed was asked and did not answer usefully — try again later',
    'update release version newer github check'))
  return rows
}
const EMPTY_UPDATE: UpdateState = { result: null, checking: false, at: 0 }