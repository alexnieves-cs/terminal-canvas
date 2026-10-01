import { useEffect, useMemo, useState, type JSX } from 'react'
import { outward } from '@shared/outward'
import type { TimelineEntry } from '@shared/run-ledger'
import {
  buildReturnBriefing, sinceWords,
  type BriefEvidence, type BriefLine, type BriefingDecision, type ReturnBriefing, type TaskBriefing
} from '@shared/return-briefing'
import type { PersistedWorkItem } from '@shared/work-items'
import { getChat } from '@renderer/chat/chat-store'
import { CheckRunOutput } from '@renderer/checks/CheckRunOutput'
import type { Inbox } from './decision-inbox'
import { dismissReturn } from './presence'
import { shellControl } from './shell-control'

/**
 * M309. "SINCE YOU LEFT" — the return briefing, one section per task that
 * moved, in the slot the Resume banner rests in (the head of the Panels
 * pane, or over the canvas when that pane is closed). It replaces that
 * banner while there is a return to brief: the banner is one task's resume;
 * this is every task's, measured from when the person was last here.
 *
 * Every line opens its evidence: a finished check opens ITS OWN output
 * record inline (M306), a decision opens the Needs-you inbox on it, a change
 * opens the task's review, anything else goes to its panel. "Got it" clears
 * the absence; nothing here changes a task.
 */
const TIMELINE_ROWS = 80
const TASKS_MAX = 12
const EXCERPT_MAX = 120

export interface BriefingDeps {
  since: number | null
  workItems: readonly PersistedWorkItem[]
  /** The task's member panels, by the canvas's one membership rule. */
  membersOf: (itemId: string) => readonly string[]
  handoffOf: (itemId: string) => { actionLabel: string; detail: string; state: string; changes?: { files: number } } | undefined
  inbox: Inbox
  labelOf: (panelId: string) => string
}

/** Reads each task's durable record ONCE per return, then builds the briefing from it and the live inbox. */
export function useReturnBriefing(deps: BriefingDeps): ReturnBriefing | null {
  const { since, workItems, membersOf, handoffOf, inbox, labelOf } = deps
  const tasks = useMemo(() => workItems.filter((w) => w.state !== 'done').slice(0, TASKS_MAX), [workItems])
  const taskKey = tasks.map((t) => t.id).join(' ')
  const [timelines, setTimelines] = useState<{ since: number; rows: Map<string, TimelineEntry[]> } | null>(null)
  useEffect(() => {
    if (since === null) { setTimelines(null); return }
    const door = window.canvas?.ledger?.timeline
    if (typeof door !== 'function') { setTimelines({ since, rows: new Map() }); return }
    let live = true
    void Promise.all(tasks.map(async (t) => {
      const panelIds = [...membersOf(t.id)]
      try { return [t.id, (await door({ itemId: t.id, ...(panelIds.length === 0 ? {} : { panelIds }) }, TIMELINE_ROWS)).entries] as const } catch { return [t.id, [] as TimelineEntry[]] as const }
    })).then((pairs) => { if (live) setTimelines({ since, rows: new Map(pairs) }) })
    return () => { live = false }
  }, [since, taskKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => {
    if (since === null || timelines === null || timelines.since !== since) return null
    const decisions: BriefingDecision[] = [...inbox.items, ...inbox.snoozed].flatMap((item) => item.members.map((m) => ({
      panelId: m.panelId, label: m.label, blocker: item.blocker, ...(m.requestId === undefined ? {} : { requestId: m.requestId })
    })))
    return buildReturnBriefing(since, tasks.map((t) => {
      const handoff = handoffOf(t.id)
      const chat = t.panelId === undefined ? undefined : getChat(t.panelId)
      const reply = chat?.turns.filter((turn) => turn.role === 'assistant').pop()
      const text = reply?.blocks.map((b) => (b.type === 'text' ? b.text : '')).join(' ').replace(/\s+/g, ' ').trim() ?? ''
      return {
        itemId: t.id,
        title: t.title,
        panelIds: [...membersOf(t.id)],
        timeline: timelines.rows.get(t.id) ?? [],
        ...(handoff === undefined ? {} : { handoff: { actionLabel: handoff.actionLabel, detail: handoff.detail, state: handoff.state, ...(handoff.changes === undefined ? {} : { files: handoff.changes.files }) } }),
        ...(reply === undefined || t.panelId === undefined ? {} : { lastReply: { panelId: t.panelId, at: reply.at, excerpt: text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1)}…` : text } }),
        labelOf
      }
    }), decisions)
  }, [since, timelines, tasks, inbox, handoffOf, membersOf, labelOf])
}

export interface ReturnBriefingCardProps {
  briefing: ReturnBriefing
  onGoToPanel: (panelId: string) => void
  onReview: (itemId: string) => void
  onDecision: (panelId: string, requestId?: string) => void
}

export function ReturnBriefingCard({ briefing, onGoToPanel, onReview, onDecision }: ReturnBriefingCardProps): JSX.Element {
  const [openOutput, setOpenOutput] = useState<string | null>(null)
  const now = Date.now()
  const act = (e: BriefEvidence): void => {
    if (e.kind === 'output') setOpenOutput((cur) => (cur === e.outputId ? null : e.outputId))
    else if (e.kind === 'panel') onGoToPanel(e.panelId)
    else if (e.kind === 'review') onReview(e.itemId)
    else onDecision(e.panelId, e.requestId)
  }
  const verb = (e: BriefEvidence | undefined): string | null => (e === undefined ? null : e.kind === 'output' ? 'output' : e.kind === 'review' ? 'review' : e.kind === 'decision' ? 'decide' : 'go')
  const lines = (title: string, list: readonly BriefLine[], section: string): JSX.Element | null => (list.length === 0 ? null : (
    <div className="briefing__group" data-briefing-group={section}>
      <span className="briefing__group-title">{title}</span>
      <ul className="briefing__lines">
        {list.map((l, i) => (
          <li key={`${section}:${i}`} className="briefing__line" data-briefing-tone={l.tone ?? 'neutral'}>
            <span className="briefing__text">{outward(l.text, 'return briefing').text}</span>
            {l.evidence !== undefined && (
              <button type="button" className="rail-row__verb" data-briefing-evidence={l.evidence.kind}
                title={l.evidence.kind === 'output' ? 'Open this run\'s own output' : l.evidence.kind === 'review' ? 'Open the task\'s review' : l.evidence.kind === 'decision' ? 'Open this decision in Needs you' : 'Go to the panel'}
                {...shellControl(() => act(l.evidence as BriefEvidence))}>{verb(l.evidence)}</button>
            )}
            {l.evidence?.kind === 'output' && openOutput === l.evidence.outputId && (
              <div className="briefing__output"><CheckRunOutput outputId={l.evidence.outputId} subject={`panel ${l.evidence.panelId}`} /></div>
            )}
          </li>
        ))}
      </ul>
    </div>
  ))
  const task = (t: TaskBriefing): JSX.Element => (
    <section key={t.itemId} className="briefing__task" data-briefing-task={t.itemId}>
      <h4 className="briefing__task-title">{t.title}</h4>
      {lines('Needs your decision', t.decisions, 'decisions')}
      {lines('Finished', t.finished, 'finished')}
      {lines('Changed', t.changed, 'changed')}
      <p className="briefing__next" data-briefing-next>Next: {t.next}</p>
    </section>
  )
  return (
    <aside className="briefing" data-screen-control="" data-return-briefing role="status" aria-label="Since you left">
      <div className="briefing__head">
        <div className="resume-banner__kicker">Since you left · {sinceWords(briefing.since, now)}</div>
        <p className="briefing__headline" data-briefing-headline>{briefing.headline}</p>
      </div>
      {briefing.tasks.map(task)}
      {briefing.quietCount > 0 && <p className="briefing__quiet">{briefing.quietCount} other task{briefing.quietCount === 1 ? '' : 's'} had nothing new.</p>}
      <div className="briefing__verbs">
        <button type="button" className="resume-banner__go" data-briefing-dismiss {...shellControl(dismissReturn)}>Got it</button>
      </div>
    </aside>
  )
}
