import { useState } from 'react'
import type { JSX } from 'react'
import { panelState } from '../panels/panel-state'
import type { AgentState } from '@shared/types'
import {
  AGENTS_STEP_LEAD, AGENTS_STEP_TITLE, CUSTOM_COMMAND, FIRST_TASK_HANDOFF, ONBOARDING_FOOTER, ONBOARDING_RAIL,
  STATE_PREVIEW_CAPTION, agentRows, installCommand, sessionsPersistence, stepWords,
  type AgentProbe, type OnboardingStepId
} from '@shared/onboarding'

/**
 * M440. The first-run card. Toggles record which agents become presets.
 * Copy puts an install command on the clipboard and does not run it.
 * The last step names the existing new-task sheet (`FIRST_TASK_HANDOFF`)
 * and spawns nothing — the sheet is the door that starts work.
 */
export interface OnboardingProps {
  initialStep?: OnboardingStepId
  workspaceName?: string
  probes?: readonly AgentProbe[]
  enabled?: readonly string[]
  tmux?: { path: string | null; timedOut?: boolean }
  onCopy?: (command: string) => void
  onCustom?: () => void
  onHandoff?: (handoff: typeof FIRST_TASK_HANDOFF) => void
}

const PREVIEW: ReadonlyArray<{ agent: AgentState; title: string }> = [
  { agent: 'busy', title: 'Claude Code' },
  { agent: 'wants-you', title: 'Codex CLI' },
  { agent: 'idle', title: 'Plain shell' }
]

/** Enough of a running status for `panelState` to speak. The frame does not start a process; the pid is not a measurement. */
const RUNNING = { kind: 'running' as const, pid: 1, command: 'preview', cwd: '', reattached: false }

export function Onboarding({
  initialStep = 'workspace', workspaceName = '', probes = [], enabled = [], tmux, onCopy, onCustom, onHandoff
}: OnboardingProps): JSX.Element {
  const [step, setStep] = useState<OnboardingStepId>(initialStep)
  const [name, setName] = useState(workspaceName)
  const [chosen, setChosen] = useState<string[]>([...enabled])
  const view = agentRows(probes, chosen)
  const sessions = sessionsPersistence(tmux)
  const index = ONBOARDING_RAIL.findIndex((row) => row.id === step)

  const copy = (id: string): void => {
    const command = installCommand(id)
    if (command === null) return
    onCopy?.(command)
    const clipboard = navigator.clipboard
    if (clipboard !== undefined) void clipboard.writeText(command)
  }

  const advance = (): void => {
    if (step === 'task') {
      onHandoff?.(FIRST_TASK_HANDOFF)
      return
    }
    const next = ONBOARDING_RAIL[index + 1]
    if (next !== undefined) setStep(next.id)
  }

  const canAdvance = step === 'workspace' ? name.trim() !== '' : step === 'agents' ? view.canContinue : true

  return (
    <div className="rd-onboard" data-rd-onboarding="" data-step={step}>
      <div className="rd-onboard__card">
        <div className="rd-onboard__main">
          <div className="rd-onboard__brand">
            <span className="rd-splash__grid" aria-hidden="true" />
            <span>Terminal Canvas</span>
          </div>
          <div className="rd-onboard__body">
            <ol className="rd-onboard__rail">
              {ONBOARDING_RAIL.map((row, i) => (
                <li key={row.id} data-rail={row.id} data-current={row.id === step ? 'true' : 'false'} data-done={i < index ? 'true' : 'false'}>
                  <span className="rd-onboard__rail-index">{i + 1}</span>
                  {row.label}
                </li>
              ))}
            </ol>
            <div className="rd-onboard__step">
              <p className="rd-onboard__count">{stepWords(step)}</p>
              {step === 'workspace' && (
                <>
                  <h1 className="rd-onboard__title">Name the workspace</h1>
                  <label className="rd-onboard__field">
                    <span>Workspace</span>
                    <input data-edit-owner="" value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                </>
              )}
              {step === 'agents' && (
                <>
                  <h1 className="rd-onboard__title">{AGENTS_STEP_TITLE}</h1>
                  <p className="rd-onboard__lead">{AGENTS_STEP_LEAD}</p>
                  <ul className="rd-onboard__rows">
                    {view.rows.map((row) => (
                      <li key={row.id} data-agent={row.id} data-phase={row.phase}>
                        <div>
                          <span className="rd-onboard__agent">{row.label}</span>
                          <span className="rd-onboard__status">{row.status}</span>
                          {row.path !== undefined && <span className="rd-onboard__mono">{row.path}{row.version !== undefined ? ` · ${row.version}` : ' · version unknown'}</span>}
                        </div>
                        {row.phase === 'found' && (
                          <button type="button" aria-pressed={row.enabled} onClick={() => setChosen((cur) => cur.includes(row.id) ? cur.filter((id) => id !== row.id) : [...cur, row.id])}>
                            {row.enabled ? 'On' : 'Off'}
                          </button>
                        )}
                        {row.phase === 'missing' && row.install !== undefined && (
                          <button type="button" data-copy-install={row.id} onClick={() => copy(row.id)}>Copy install command</button>
                        )}
                      </li>
                    ))}
                    <li data-agent={view.shell.id} data-locked="true">
                      <div>
                        <span className="rd-onboard__agent">{view.shell.label}</span>
                        <span className="rd-onboard__status">{view.shell.status}</span>
                      </div>
                    </li>
                  </ul>
                  <button type="button" className="rd-onboard__custom" onClick={() => onCustom?.()}>{CUSTOM_COMMAND.label}</button>
                  <p className="rd-onboard__ready" data-ready={view.ready}>{view.label}</p>
                </>
              )}
              {step === 'sessions' && (
                <>
                  <h1 className="rd-onboard__title">Sessions</h1>
                  <p className="rd-onboard__lead" data-persist={sessions.persist ? 'true' : 'false'} data-known={sessions.known ? 'true' : 'false'}>{sessions.sentence}</p>
                </>
              )}
              {step === 'task' && (
                <>
                  <h1 className="rd-onboard__title">First task</h1>
                  <p className="rd-onboard__lead">Describe the first task in the new-task sheet. Nothing starts until you send it.</p>
                  <p className="rd-onboard__mono" data-handoff={FIRST_TASK_HANDOFF.sheet} data-spawns={FIRST_TASK_HANDOFF.spawns ? 'true' : 'false'}>{FIRST_TASK_HANDOFF.sheet}</p>
                </>
              )}
            </div>
          </div>
          <footer className="rd-onboard__foot">
            <p>{ONBOARDING_FOOTER}</p>
            <button type="button" className="rd-onboard__continue" disabled={!canAdvance} onClick={advance}>Continue</button>
          </footer>
        </div>
        <aside className="rd-onboard__preview" aria-label="State colours">
          {PREVIEW.map((frame) => {
            const state = panelState({ kind: 'terminal', status: RUNNING, dormant: false }, frame.agent)
            return (
              <article key={frame.title} className="rd-onboard__frame" data-tone={state.tone}>
                <span className="rd-onboard__frame-kicker">{frame.title}</span>
                <span className="rd-onboard__frame-word">{state.word}</span>
              </article>
            )
          })}
          <p className="rd-onboard__caption">{STATE_PREVIEW_CAPTION}</p>
        </aside>
      </div>
    </div>
  )
}
