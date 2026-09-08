import type { EnvReport } from './env-report'
import type { AgentBackend } from './agent-session'

export interface OnboardingEngine {
  backend: 'claude' | 'codex'
  discovery: 'installed' | 'missing' | 'unknown'
  authentication: 'unknown'
  sentence: string
  setupUrl: string
}

/** Discovery reports installation only. Authentication belongs to the first real turn. */
export function onboardingReadiness(report: EnvReport | null, preferred?: AgentBackend): {
  rows: OnboardingEngine[]; preferred?: 'claude' | 'codex'
} {
  const rows = (['claude', 'codex'] as const).map((backend): OnboardingEngine => {
    const cli = report?.clis.find((entry) => entry.name === backend)
    const answered = report !== null && report.shell.ok && report.probe?.timedOut !== true
    const discovery = !answered || cli === undefined ? 'unknown' : cli.path === null ? 'missing' : 'installed'
    const name = backend === 'claude' ? 'Claude Code' : 'Codex'
    return {
      backend, discovery, authentication: 'unknown',
      sentence: discovery === 'installed' ? `${name} is installed. Your first message checks sign-in.`
        : discovery === 'missing' ? `Install ${name} using its setup guide, then choose Check again.`
          : `${name} discovery has not answered. Choose Check again.`,
      setupUrl: backend === 'claude' ? 'https://code.claude.com/docs/en/setup' : 'https://developers.openai.com/codex/cli/'
    }
  })
  const selected = rows.find((row) => row.backend === preferred && row.discovery === 'installed')
    ?? rows.find((row) => row.discovery === 'installed')
  return { rows, ...(selected === undefined ? {} : { preferred: selected.backend }) }
}
