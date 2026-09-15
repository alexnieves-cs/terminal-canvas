import type { JSX } from 'react'
import type { ResumeSummary } from '@shared/resume-summary'
import { shellControl } from './shell-control'

/**
 * M273 (D11). Resume work — facts only, on reopen. Dismissed for the
 * session; workspace switch rebuilds it from the incoming board.
 */
export function ResumeBanner({
  summary,
  onContinue,
  onDismiss
}: {
  summary: ResumeSummary
  onContinue: (itemId: string) => void
  onDismiss: () => void
}): JSX.Element {
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
    </aside>
  )
}
