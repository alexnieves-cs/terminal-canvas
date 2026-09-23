import type { JSX } from 'react'
import type { ResumeSummary } from '@shared/resume-summary'
import { shellControl } from './shell-control'

/**
 * M273 (D11). Resume work — facts only, on reopen. Dismissed for the
 * session; workspace switch rebuilds it from the incoming board.
 *
 * Two shapes, one set of facts. `card` is the navigator's inbox row (the
 * Panels pane's head, where there is room for every line). `strip` is the
 * shape everywhere else: ONE line in its own row above the center column,
 * never over it — the floating card it replaced sat on the panels it named.
 * The strip keeps the title and the next action (what Continue does) and
 * puts purpose, outcome and blocker on its title, except a blocker, which
 * is the one line that changes what a person does next and so stays visible.
 */
export function ResumeBanner({
  summary,
  onContinue,
  onDismiss,
  shape = 'card'
}: {
  summary: ResumeSummary
  onContinue: (itemId: string) => void
  onDismiss: () => void
  shape?: 'card' | 'strip'
}): JSX.Element {
  const verbs = (
    <div className="resume-banner__verbs">
      <button
        type="button"
        className="resume-banner__go"
        title={`Continue ${summary.title}`}
        {...shellControl(() => onContinue(summary.itemId))}
      >
        Continue
      </button>
      <button
        type="button"
        className="resume-banner__dismiss"
        title="Dismiss this summary"
        {...shellControl(onDismiss)}
      >
        Dismiss
      </button>
    </div>
  )
  if (shape === 'strip') {
    const detail = [
      summary.purpose,
      summary.lastOutcome === undefined ? undefined : `last outcome — ${summary.lastOutcome}`,
      summary.blocker === undefined ? undefined : `open blocker — ${summary.blocker}`,
      summary.nextAction
    ].filter((line): line is string => line !== undefined).join('\n')
    return (
      <aside className="resume-strip" data-resume-banner data-resume-shape="strip" role="status" title={`${summary.title}\n${detail}`}>
        <span className="resume-banner__kicker">Resume</span>
        <span className="resume-strip__title">{summary.title}</span>
        {summary.blocker !== undefined
          ? <span className="resume-strip__line resume-strip__line--blocker" data-resume-blocker>open blocker — {summary.blocker}</span>
          : <span className="resume-strip__line" data-resume-next>{summary.nextAction}</span>}
        {verbs}
      </aside>
    )
  }
  return (
    <aside className="resume-banner" data-resume-banner role="status">
      <div className="resume-banner__copy">
        <div className="resume-banner__kicker">Resume work</div>
        <div className="resume-banner__title">{summary.title}</div>
        {summary.purpose !== undefined && (
          <p className="resume-banner__line" data-resume-purpose>{summary.purpose}</p>
        )}
        {summary.lastOutcome !== undefined && (
          <p className="resume-banner__line" data-resume-outcome>last outcome — {summary.lastOutcome}</p>
        )}
        {summary.blocker !== undefined && (
          <p className="resume-banner__line" data-resume-blocker>open blocker — {summary.blocker}</p>
        )}
        <p className="resume-banner__next" data-resume-next>{summary.nextAction}</p>
      </div>
      {verbs}
    </aside>
  )
}
