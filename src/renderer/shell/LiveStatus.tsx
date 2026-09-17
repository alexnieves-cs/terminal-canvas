import { memo, type JSX } from 'react'
import { agentWord, TONE_NEEDS_YOU, TONE_WORKING } from '@renderer/panels/panel-state'
import { StatusDot } from '@renderer/primitives'
import { shellControl } from './shell-control'

export interface LiveStatusProps {
  /** Panels with a live process in a working state. */
  running: number
  /** Panels waiting on a person. */
  waiting: number
  /** Jump to the longest-waiting panel — the same verb ⌘J takes. */
  onJumpWaiting: () => void
}

/**
 * M279. THE LIVE STATUS CLUSTER in the top bar: how many agents are working
 * and how many need you, from the summary the inspector already computes
 * (`buildInspectorSummary`, frozen on its own numbers so this re-renders only
 * when a count moves). It answers the question a person asks on returning to
 * the window — "is anything waiting on me?" — without opening a pane.
 *
 * REST RULE: a zero is not a fact worth a word, so an idle canvas shows
 * nothing here at all and the bar is as quiet as it was. The words come from
 * `panel-state.ts` through `agentWord`, never spelled here (`verify:rail
 * state.2`). Needs-you is a button because it has a verb; working is a
 * reading and stays a span.
 */
function LiveStatusImpl({ running, waiting, onJumpWaiting }: LiveStatusProps): JSX.Element | null {
  if (running === 0 && waiting === 0) return null
  const working = agentWord('busy').word
  const needsYou = agentWord('wants-you').word
  return (
    <div className="live-status" role="status" aria-label="Agents" data-live-status>
      {running > 0 && (
        <span className="live-status__item" data-tone={TONE_WORKING} title={`${running} ${working}`}>
          <StatusDot tone={TONE_WORKING} />
          <span className="live-status__count">{running}</span>
          <span className="live-status__word">{working}</span>
        </span>
      )}
      {waiting > 0 && (
        <button
          type="button"
          className="live-status__item live-status__item--verb"
          data-tone={TONE_NEEDS_YOU}
          title={`${waiting} ${needsYou} — jump to the longest-waiting (⌘J)`}
          {...shellControl(onJumpWaiting)}
        >
          <StatusDot tone={TONE_NEEDS_YOU} />
          <span className="live-status__count">{waiting}</span>
          <span className="live-status__word">{needsYou}</span>
        </button>
      )}
    </div>
  )
}

export const LiveStatus = memo(LiveStatusImpl)
