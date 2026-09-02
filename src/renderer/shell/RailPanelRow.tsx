import { memo, type JSX } from 'react'
import { useAgentState } from '@renderer/session/agent-state-store'
import type { RailRow } from './rail-rows'
import { shellControl } from './shell-control'
import { Close, KindFile, KindJira, KindNote, KindReview, KindToolbox, Play } from '@renderer/icons'
import { panelState } from '@renderer/panels/panel-state'

/* M63. The rail's left column: a terminal's is its state dot, every other
   kind's is a glyph naming the kind — kind and state stop sharing a slot. */
const KIND_GLYPH = { review: KindReview, file: KindFile, note: KindNote, toolbox: KindToolbox, jira: KindJira } as const

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
  // M63. The word and the tone, from the one vocabulary, with the agent
  // state this row subscribes to applied — `row.tail` is the same answer
  // without it, kept for the signature and the plain-node checks.
  const shown = panelState(row.state, state)
  const Glyph = row.state.kind === 'terminal' ? null : KIND_GLYPH[row.state.kind]
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
        {Glyph === null ? (
          <span
            className="rail-row__dot status-dot"
            data-agent-state={state ?? 'none'}
            data-tone={shown.tone}
            aria-hidden="true"
          />
        ) : (
          <span className="rail-row__kind" aria-hidden="true"><Glyph /></span>
        )}
        <span className="rail-row__label">{row.label}</span>
        <span className="rail-row__tail" data-tone={shown.tone}>{shown.word}</span>
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
