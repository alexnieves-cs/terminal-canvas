import type { EnvReport } from './env-report'
import type { AgentBackend } from './agent-session'

/**
 * M180. The first-launch engines as a TABLE keyed by backend (M99's rule:
 * no consumer compares `backend` to a literal; `verify:agent-session
 * registry.1` greps for it). A third row here is a third first-launch door.
 */
export const FIRST_LAUNCH_ENGINES: Readonly<Record<'claude' | 'codex', { name: string; setupUrl: string }>> = {
  claude: { name: 'Claude Code', setupUrl: 'https://code.claude.com/docs/en/setup' },
  codex: { name: 'Codex', setupUrl: 'https://developers.openai.com/codex/cli/' }
}
export const FIRST_LAUNCH_BACKENDS = Object.keys(FIRST_LAUNCH_ENGINES) as ReadonlyArray<keyof typeof FIRST_LAUNCH_ENGINES>
export function isFirstLaunchBackend(backend: string): backend is keyof typeof FIRST_LAUNCH_ENGINES {
  return Object.prototype.hasOwnProperty.call(FIRST_LAUNCH_ENGINES, backend)
}

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
  const rows = FIRST_LAUNCH_BACKENDS.map((backend): OnboardingEngine => {
    const cli = report?.clis.find((entry) => entry.name === backend)
    const answered = report !== null && report.shell.ok && report.probe?.timedOut !== true
    const discovery = !answered || cli === undefined ? 'unknown' : cli.path === null ? 'missing' : 'installed'
    const { name, setupUrl } = FIRST_LAUNCH_ENGINES[backend]
    return {
      backend, discovery, authentication: 'unknown',
      sentence: discovery === 'installed' ? `${name} is installed. Your first message checks sign-in.`
        : discovery === 'missing' ? `Install ${name} using its setup guide, then choose Check again.`
          : `${name} discovery has not answered. Choose Check again.`,
      setupUrl
    }
  })
  const selected = rows.find((row) => row.backend === preferred && row.discovery === 'installed')
    ?? rows.find((row) => row.discovery === 'installed')
  return { rows, ...(selected === undefined ? {} : { preferred: selected.backend }) }
}
