import { memo, type JSX } from 'react'
import { useAgentState } from '@renderer/session/agent-state-store'
import type { RailRow } from './rail-rows'
import { shellControl } from './shell-control'
import { Close, Play } from '@renderer/icons'

export interface RailPanelRowProps {
  row: RailRow
  selected: boolean
  onGoTo: (id: string) => void
  onStart: (id: string) => void
  onClose: (id: string) => void
}

/**
 * One row of the panel outline.
 *
 * It is a `memo` component AND it owns its own useAgentState subscription, and
 * the pairing is the point. agent-state-store.ts subscribes PER PANEL ID
 * precisely so a change for n3 notifies only whatever asked about n3; if this
 * list subscribed once and passed each state down, a bell on any panel would
 * re-render every row — the fan-out that module exists to refuse, arriving
 * through a door it could not see. With the subscription here, a bell
 * re-renders exactly one row, and the memo blocks everything else Canvas's
 * 60Hz render churn would otherwise push through.
 *
 * Three sibling controls rather than one clickable row with buttons inside it:
 * nested interactive elements are invalid HTML and give the browser no
 * defensible answer about which one a click meant.
 */
function RailPanelRowImpl({
  row, selected, onGoTo, onStart, onClose
}: RailPanelRowProps): JSX.Element {
  const state = useAgentState(row.id)
  return (
    <li
      className={`rail-row${selected ? ' rail-row--selected' : ''}`}
      data-rail-row={row.id}
    >
      {/*
        goToPanel — frame, select, raise — and NEVER onSelectPanel. Waking
        hangs off select, so reusing it here would spawn an agent as a side
        effect of clicking a list entry (spec rule 1). The start control below
        is the only thing in this row that wakes anything.
      */}
      <button
        type="button"
        className="rail-row__main"
        title={`Go to ${row.label}`}
        {...shellControl(() => onGoTo(row.id))}
      >
        {/*
          The attribute, not only a class: a class is a styling decision a
          restyle may rename, while data-agent-state is this row's stated
          answer to "what is that agent doing" — the same split check 54
          already draws for the panel itself.
        */}
        <span
          className="rail-row__dot"
          data-agent-state={state ?? 'none'}
          aria-hidden="true"
        />
        <span className="rail-row__label">{row.label}</span>
        <span className="rail-row__tail">{row.tail}</span>
      </button>
      {row.dormant && (
        <button
          type="button"
          className="rail-row__start icon-button"
          title={`Start ${row.label}`}
          aria-label={`Start ${row.label}`}
          {...shellControl(() => onStart(row.id))}
        >
          <Play />
        </button>
      )}
      <button
        type="button"
        className="rail-row__close icon-button"
        title={`Close ${row.label}`}
        aria-label={`Close ${row.label}`}
        {...shellControl(() => onClose(row.id))}
      >
        <Close />
      </button>
    </li>
  )
}

export const RailPanelRow = memo(RailPanelRowImpl)
