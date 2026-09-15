/**
 * M268. Orchestration center view — denser HUD over live agent/board/workflow
 * data. Presentational: Canvas owns verbs (jump, answer, setCenterView).
 */
import { memo, useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import type { Panel } from '@renderer/panels/panels'
import {
  isChatPanel, isTerminalPanel, isWatcherPanel, isWorkflowPanel, isWorkPanel
} from '@renderer/panels/panels'
import { getAgentState, onAgentTransition } from '@renderer/session/agent-state-store'
import { formatCpu, formatMemory, useMachineCost, useMachineCostTotal } from '@renderer/session/machine-cost-store'
import { getLiveSession } from '@renderer/session/live-session-store'
import { getWatch } from '@renderer/watcher/watcher-store'
import type { PersistedWorkItem } from '@shared/work-items'
import { WORK_ITEM_STATES } from '@shared/work-items'
import { shellControl } from '@renderer/shell/shell-control'
import { panelLabel } from '@renderer/canvas/canvas-constants'
import { agentWord, TONE_WORKING } from '@renderer/panels/panel-state'
import {
  buildOrchestrationSnapshot,
  ORCH_GRAPH_SIZE,
  type OrchPanelInput,
  type OrchRosterRow
} from './orchestration-model'
import {
  agentTransitionActivity,
  orchActivityEvents,
  pushOrchActivity,
  subscribeOrchActivity
} from './orchestration-activity'

export interface OrchestrationViewProps {
  panels: readonly Panel[]
  workItems: readonly PersistedWorkItem[]
  displayName?: string
  onJumpPanel: (id: string) => void
  onJumpWorkItem: (id: string) => void
}

function panelsToInput(panels: readonly Panel[]): OrchPanelInput[] {
  return panels.map((p) => {
    const id = p.rect.id
    const title = panelLabel(p)
    if (isChatPanel(p)) {
      return {
        id, title, kind: 'chat' as const, agentic: true,
        agentState: getAgentState(id),
        supervisor: p.chat.supervisor === true,
        orchestrator: p.chat.orchestrator !== undefined
      }
    }
    if (isTerminalPanel(p)) {
      const live = getLiveSession(id)
      return {
        id, title, kind: 'terminal' as const,
        agentic: p.spec.agent !== undefined,
        agentState: getAgentState(id),
        ...(live?.currentCommand ? { currentCommand: live.currentCommand } : {})
      }
    }
    if (isWatcherPanel(p)) {
      return { id, title, kind: 'watcher' as const, agentic: false, watcherStatus: getWatch(id).status }
    }
    if (isWorkflowPanel(p)) {
      return { id, title, kind: 'workflow' as const, agentic: false, templateId: p.workflow.templateId, poolLive: false }
    }
    if (isWorkPanel(p)) {
      return { id, title, kind: 'work' as const, agentic: false, workItemId: p.work.itemId }
    }
    return { id, title, kind: 'other' as const, agentic: false }
  })
}

function Sparkline({ values, tone }: { values: number[]; tone?: string }): JSX.Element {
  const w = 120
  const h = 28
  if (values.length < 2) {
    return <svg className="orch__spark" width={w} height={h} aria-hidden="true" />
  }
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = Math.max(max - min, 1)
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / span) * (h - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg className="orch__spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline fill="none" stroke={tone ?? 'var(--iris)'} strokeWidth="1.5" points={pts} />
    </svg>
  )
}

function stateWord(row: OrchRosterRow): string {
  if (row.state === 'wants-you' || row.state === 'busy' || row.state === 'idle' || row.state === 'starting' || row.state === 'exited') {
    return agentWord(row.state).word
  }
  if (row.state === 'pool') return 'pool live'
  if (row.state === 'watching') return agentWord('busy').word
  if (row.state === 'passed') return agentWord('idle').word
  if (row.state === 'running') return agentWord('busy').word
  return agentWord('idle').word
}

function toneFromState(state: OrchRosterRow['state']): string {
  if (state === 'wants-you') return 'needs-you'
  if (state === 'busy' || state === 'watching' || state === 'pool') return TONE_WORKING
  if (state === 'starting') return 'starting'
  if (state === 'exited') return 'exited'
  return 'idle'
}

function formatAgo(at: number): string {
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}

function OrchestrationViewImpl(props: OrchestrationViewProps): JSX.Element {
  const { panels, workItems, displayName, onJumpPanel, onJumpWorkItem } = props
  const [tick, setTick] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'activity' | 'terminal' | 'workflows'>('activity')
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [memHistory, setMemHistory] = useState<number[]>([])
  const total = useMachineCostTotal()
  const selectedCost = useMachineCost(selectedId ?? '')

  useEffect(() => onAgentTransition((panelId, state, prev) => {
    const panel = panels.find((p) => p.rect.id === panelId)
    const title = panel ? panelLabel(panel) : panelId
    pushOrchActivity(agentTransitionActivity(panelId, title, state, prev, Date.now()))
    setTick((n) => n + 1)
  }), [panels])

  useEffect(() => {
    setCpuHistory((h) => [...h, total.cpuPercent].slice(-24))
    setMemHistory((h) => [...h, total.memoryBytes / (1024 * 1024)].slice(-24))
  }, [total.cpuPercent, total.memoryBytes])

  // Identity-stable getSnapshot (orchActivityEvents / listOrchActivity with
  // no filter) — a fresh array every call loops React forever.
  const activity = useSyncExternalStore(
    subscribeOrchActivity,
    orchActivityEvents,
    orchActivityEvents
  )

  const liveSnap = useMemo(() => buildOrchestrationSnapshot({
    panels: panelsToInput(panels),
    workItems: workItems.map((w) => ({
      id: w.id, title: w.title, state: w.state,
      ...(w.panelId !== undefined ? { panelId: w.panelId } : {}),
      ...(w.note !== undefined ? { note: w.note } : {})
    })),
    machine: { cpuPercent: total.cpuPercent, memoryBytes: total.memoryBytes },
    hour: new Date().getHours(),
    ...(displayName !== undefined ? { displayName } : {})
  }), [panels, workItems, total.cpuPercent, total.memoryBytes, displayName, tick])

  const filteredActivity = useMemo(
    () => (selectedId === null ? activity : activity.filter((e) => e.panelId === selectedId)),
    [activity, selectedId]
  )

  const jump = (id: string): void => { onJumpPanel(id) }

  return (
    <div className="orch" role="region" aria-label="Orchestration">
      <header className="orch__header">
        <p className="orch__greeting">{liveSnap.greeting}</p>
        <div className="orch__metrics">
          <div className="orch__metric" data-tone={liveSnap.counts.activeAgents > 0 ? TONE_WORKING : 'idle'}>
            <span className="orch__metric-label">Active agents</span>
            <span className="orch__metric-value">{liveSnap.counts.activeAgents}</span>
            <span className="orch__metric-sub">{liveSnap.counts.activeAgents > 0 ? 'Running' : 'Idle'}</span>
          </div>
          <div className="orch__metric" data-tone={liveSnap.counts.tasksInProgress > 0 ? TONE_WORKING : 'idle'}>
            <span className="orch__metric-label">Tasks in progress</span>
            <span className="orch__metric-value">{liveSnap.counts.tasksInProgress}</span>
            <span className="orch__metric-sub">{liveSnap.counts.tasksInProgress > 0 ? 'In progress' : 'Clear'}</span>
          </div>
          <div className="orch__metric" data-tone={liveSnap.counts.watchersRunning > 0 ? TONE_WORKING : 'idle'}>
            <span className="orch__metric-label">Watchers</span>
            <span className="orch__metric-value">{liveSnap.counts.watchersRunning}</span>
            <span className="orch__metric-sub">{liveSnap.counts.watchersRunning > 0 ? 'Running' : 'Idle'}</span>
          </div>
          <div className="orch__metric" data-tone={liveSnap.counts.waiting > 0 ? 'needs-you' : 'idle'}>
            <span className="orch__metric-label">Waiting on you</span>
            <span className="orch__metric-value">{liveSnap.counts.waiting}</span>
            <span className="orch__metric-sub">{liveSnap.counts.waiting > 0 ? 'Attention' : 'Clear'}</span>
          </div>
        </div>
      </header>

      <div className="orch__body">
        <aside className="orch__roster" aria-label="Agents">
          <div className="orch__section-title">Agents</div>
          {liveSnap.roster.length === 0 ? (
            <p className="orch__empty">No agents or watchers on this canvas yet. Create a chat or terminal from the canvas.</p>
          ) : (
            <ul className="orch__roster-list">
              {liveSnap.roster.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`orch__roster-row${selectedId === row.id ? ' orch__roster-row--on' : ''}`}
                    data-tone={row.tone}
                    aria-pressed={selectedId === row.id}
                    {...shellControl(() => setSelectedId((cur) => cur === row.id ? null : row.id))}
                    onDoubleClick={() => jump(row.id)}
                  >
                    <span className="orch__dot status-dot" data-tone={row.tone} aria-hidden="true" />
                    <span className="orch__roster-label">{row.title}</span>
                    <span className="orch__roster-state">{stateWord(row)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="orch__main">
          <div className="orch__graph-wrap">
            <svg
              className="orch__graph"
              viewBox={`0 0 ${ORCH_GRAPH_SIZE.w} ${ORCH_GRAPH_SIZE.h}`}
              role="img"
              aria-label="Agent graph"
            >
              {liveSnap.graph.edges.map((e) => {
                const from = liveSnap.graph.nodes.find((n) => n.id === e.from)
                const to = liveSnap.graph.nodes.find((n) => n.id === e.to)
                if (!from || !to) return null
                return (
                  <line
                    key={`${e.from}-${e.to}`}
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    className="orch__edge"
                  />
                )
              })}
              {liveSnap.graph.nodes.map((n) => (
                <g
                  key={n.id}
                  className={`orch__node${n.hub ? ' orch__node--hub' : ''}${selectedId === n.id ? ' orch__node--on' : ''}`}
                  transform={`translate(${n.x}, ${n.y})`}
                  style={{ cursor: n.id === '__hub__' ? 'default' : 'pointer' }}
                  onClick={() => { if (n.id !== '__hub__') setSelectedId(n.id) }}
                  onDoubleClick={() => { if (n.id !== '__hub__') jump(n.id) }}
                >
                  <circle r={n.hub ? 28 : 18} className="orch__node-circle" data-tone={toneFromState(n.state)} />
                  <text y={n.hub ? 44 : 32} textAnchor="middle" className="orch__node-label">{n.title}</text>
                </g>
              ))}
            </svg>

            {liveSnap.terminalSnippet && (
              <button
                type="button"
                className="orch__float orch__float--term"
                title="Jump to terminal"
                {...shellControl(() => jump(liveSnap.terminalSnippet!.panelId))}
              >
                <span className="orch__float-title">{liveSnap.terminalSnippet.title}</span>
                <code className="orch__float-code">{liveSnap.terminalSnippet.command}</code>
              </button>
            )}

            {liveSnap.task && (
              <button
                type="button"
                className="orch__float orch__float--task"
                title="Open task on canvas"
                {...shellControl(() => onJumpWorkItem(liveSnap.task!.id))}
              >
                <span className="orch__float-title">{liveSnap.task.title}</span>
                <span className="orch__float-state">{liveSnap.task.state}</span>
                <div className="orch__steps" aria-hidden="true">
                  {WORK_ITEM_STATES.map((s, i) => (
                    <span
                      key={s}
                      className={`orch__step${i <= liveSnap.task!.stepIndex ? ' orch__step--on' : ''}`}
                    />
                  ))}
                </div>
              </button>
            )}
          </div>

          <div className="orch__bottom">
            <div className="orch__perf" aria-label="System performance">
              <div className="orch__section-title">System</div>
              <div className="orch__perf-grid">
                <div className="orch__perf-card">
                  <span className="orch__perf-label">CPU</span>
                  <span className="orch__perf-value">{formatCpu(total.cpuPercent)}</span>
                  <Sparkline values={cpuHistory} />
                </div>
                <div className="orch__perf-card">
                  <span className="orch__perf-label">Memory</span>
                  <span className="orch__perf-value">{formatMemory(total.memoryBytes)}</span>
                  <Sparkline values={memHistory} tone="var(--green)" />
                </div>
                {selectedId !== null && selectedCost !== undefined && (
                  <div className="orch__perf-card">
                    <span className="orch__perf-label">Selected</span>
                    <span className="orch__perf-value">{formatCpu(selectedCost.cpuPercent)} · {formatMemory(selectedCost.memoryBytes)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="orch__task-panel">
              <div className="orch__section-title">Current task</div>
              {liveSnap.task === null ? (
                <p className="orch__empty">No task is working or in review. Start work from the board or palette.</p>
              ) : (
                <button
                  type="button"
                  className="orch__task-card"
                  {...shellControl(() => onJumpWorkItem(liveSnap.task!.id))}
                >
                  <span className="orch__task-title">{liveSnap.task.title}</span>
                  <span className="orch__task-state" data-tone={TONE_WORKING}>{liveSnap.task.state}</span>
                  {liveSnap.task.note !== undefined && <span className="orch__task-note">{liveSnap.task.note}</span>}
                  <div className="orch__steps">
                    {WORK_ITEM_STATES.map((s, i) => (
                      <span key={s} className={`orch__step${i <= liveSnap.task!.stepIndex ? ' orch__step--on' : ''}`} title={s} />
                    ))}
                  </div>
                  <span className="orch__task-jump">Open on canvas</span>
                </button>
              )}
            </div>
          </div>
        </main>

        <aside className="orch__side" aria-label="Activity">
          <div className="orch__tabs" role="tablist">
            {(['activity', 'terminal', 'workflows'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={`orch__tab${tab === t ? ' orch__tab--on' : ''}`}
                {...shellControl(() => setTab(t))}
              >{t === 'activity' ? 'Activity' : t === 'terminal' ? 'Terminal' : 'Workflows'}</button>
            ))}
          </div>
          {tab === 'activity' && (
            <ul className="orch__activity" aria-label="Activity feed">
              {filteredActivity.length === 0 ? (
                <li className="orch__empty">Agent state changes will appear here.</li>
              ) : filteredActivity.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="orch__activity-row"
                    data-tone={e.tone}
                    disabled={e.panelId === undefined}
                    {...shellControl(() => { if (e.panelId) jump(e.panelId) })}
                  >
                    <span className="orch__dot status-dot" data-tone={e.tone} aria-hidden="true" />
                    <span className="orch__activity-title">{e.title}</span>
                    <span className="orch__activity-detail">{e.detail}</span>
                    <time className="orch__activity-time">{formatAgo(e.at)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tab === 'terminal' && (
            <div className="orch__term-tab">
              {liveSnap.terminalSnippet === null ? (
                <p className="orch__empty">No live command reported yet (tmux sessions publish cwd and command).</p>
              ) : (
                <button
                  type="button"
                  className="orch__term-card"
                  {...shellControl(() => jump(liveSnap.terminalSnippet!.panelId))}
                >
                  <span className="orch__float-title">{liveSnap.terminalSnippet.title}</span>
                  <code className="orch__float-code">{liveSnap.terminalSnippet.command}</code>
                  <span className="orch__task-jump">Jump to panel</span>
                </button>
              )}
            </div>
          )}
          {tab === 'workflows' && (
            <ul className="orch__activity">
              {liveSnap.workflows.length === 0 ? (
                <li className="orch__empty">No workflow panels on this canvas.</li>
              ) : liveSnap.workflows.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className="orch__activity-row"
                    data-tone={w.live ? TONE_WORKING : 'idle'}
                    {...shellControl(() => jump(w.id))}
                  >
                    <span className="orch__dot status-dot" data-tone={w.live ? TONE_WORKING : 'idle'} aria-hidden="true" />
                    <span className="orch__activity-title">{w.title}</span>
                    <span className="orch__activity-detail">{w.live ? 'pool live' : 'idle'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}

export const OrchestrationView = memo(OrchestrationViewImpl)
