import { memo, useEffect, useMemo, useState, useSyncExternalStore, type ComponentType, type JSX } from 'react'
import { orchActivityEvents, subscribeOrchActivity, type OrchActivityEvent } from '@renderer/orchestration/orchestration-activity'
import { StatusDot } from '@renderer/primitives'
import { KIND_GLYPH, KindTerminal } from '@renderer/icons'
import { EmptyState } from './EmptyState'
import { formatAgo } from './format-ago'
import { classifyActivity } from './task-queue'
import { agentWord } from '@renderer/panels/panel-state'

export interface InspectorActivityProps {
  /** The selected panel, or null for the whole canvas's feed. */
  panelId: string | null
  /** Jump the camera to the row's panel — the canvas-wide list's one verb. */
  onGoToPanel?: (id: string) => void
}

/** Rows the pane shows at most; the buffer itself holds ORCH_ACTIVITY_CAP. */
const ROWS_MAX = 30

/**
 * M279. THE ACTIVITY TAB: what this object (or, with nothing selected, this
 * canvas) has DONE, newest first — state transitions and finished turns from
 * the one ring buffer the orchestration page reads. Deep detail by the
 * density rule: it lives in the inspector, never on a frame or a rail row.
 *
 * The filter runs in a memo over the store's cached snapshot rather than
 * through `listOrchActivity(id)`, whose filtered arm returns a fresh array
 * per call — the exact shape `useSyncExternalStore` treats as a change on
 * every render (the store's own comment records the blank-window it caused).
 *
 * Ages re-render on a one-second tick only while the tab is on screen; the
 * component unmounts its timer with itself, so a hidden tab costs nothing.
 */
function InspectorActivityImpl({ panelId, onGoToPanel }: InspectorActivityProps): JSX.Element {
  const all = useSyncExternalStore(subscribeOrchActivity, orchActivityEvents, orchActivityEvents)
  const rows = useMemo<readonly OrchActivityEvent[]>(
    () => (panelId === null ? all : all.filter((e) => e.panelId === panelId)).slice(0, ROWS_MAX),
    [all, panelId]
  )
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (rows.length === 0) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [rows.length])
  if (rows.length === 0) return <div className="activity activity--empty" data-activity-feed={panelId ?? 'canvas'}><EmptyState id="activity" /></div>
  return (
    <ol className="activity" aria-label="Activity" data-activity-feed={panelId ?? 'canvas'}>
      {rows.map((e) => {
        const jump = panelId === null && onGoToPanel !== undefined && e.panelId !== undefined
        // M279 (the reference pass). The panel's kind glyph in a tone tile when
        // the producer knew the panel; the dot otherwise. KIND_GLYPH has no
        // terminal entry (the rail draws one apart), so it is named here.
        const Glyph: ComponentType | undefined = e.panelKind === undefined ? undefined
          : e.panelKind === 'terminal' ? KindTerminal
          : (KIND_GLYPH as Partial<Record<string, ComponentType>>)[e.panelKind]
        const body = (
          <>
            {Glyph !== undefined
              ? <span className="activity-row__glyph" data-tone={e.tone} aria-hidden="true"><Glyph /></span>
              : <StatusDot tone={e.tone} className="activity-row__dot" />}
            <span className="activity-row__title">{e.title}</span>
            <time className="activity-row__time" dateTime={new Date(e.at).toISOString()}>{formatAgo(e.at, now)}</time>
            <span className="activity-row__detail">{e.detail}</span>
            {classifyActivity(e) === 'intervene' && <span className="activity-row__need" data-activity-need>{agentWord('wants-you').word}</span>}
          </>
        )
        return (
          <li key={e.id} className="activity-row" data-tone={e.tone} data-activity-kind={e.kind} data-activity-weight={classifyActivity(e)}>
            {jump
              ? <button type="button" className="activity-row__main activity-row__main--verb" title={`Go to ${e.title}`} onMouseDown={(ev) => ev.preventDefault()} onClick={() => onGoToPanel(e.panelId!)}>{body}</button>
              : <div className="activity-row__main">{body}</div>}
          </li>
        )
      })}
    </ol>
  )
}

export const InspectorActivity = memo(InspectorActivityImpl)
