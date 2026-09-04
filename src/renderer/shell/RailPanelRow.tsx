import { memo, type JSX } from 'react'
import { useAgentState } from '@renderer/session/agent-state-store'
import type { RailRow } from './rail-rows'
import { shellControl } from './shell-control'
import { Close, KIND_GLYPH } from '@renderer/icons'
import { panelState } from '@renderer/panels/panel-state'
import { useChat } from '@renderer/chat/chat-store'
import { useWatch } from '@renderer/watcher/watcher-store'
import { chatStateInput } from '@renderer/chat/chat-model'

/* M63. The rail's left column: a terminal's is its state dot, every other
   kind's is a glyph naming the kind — kind and state stop sharing a slot. */
export interface RailPanelRowProps {
  row: RailRow
  selected: boolean
  onGoTo: (id: string) => void
  onStart: (id: string) => void
  onClose: (id: string) => void
  /** M66. The merged view is read-only; its rows say so instead of starting. */
  merged?: boolean
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
  row, selected, onGoTo, onStart, onClose, merged = false
}: RailPanelRowProps): JSX.Element {
  const state = useAgentState(row.id)
  // M73. A chat row subscribes to its own session mirror for the same reason
  // it subscribes to its agent state: a delta for c3 re-renders c3's row and
  // nothing else, and none of it rides the rail's signature.
  const chat = useChat(row.id)
  // M84. A watcher row subscribes to its own runs for the chat row's reason:
  // a run's state change re-renders that row and nothing else, and none of it
  // rides the rail's signature — which is frozen against a drag's 60Hz churn
  // and would therefore report a watcher's pass whenever a rect next moved.
  const watch = useWatch(row.id)
  // M63. The word and the tone, from the one vocabulary, with the agent
  // state this row subscribes to applied — `row.tail` is the same answer
  // without it, kept for the signature and the plain-node checks.
  const chatInput = row.state.kind === 'chat' ? chatStateInput(chat.snapshot, chat.turns.length > 0) : undefined
  const liveState = row.state.kind === 'chat'
    ? { ...row.state, ...(chatInput === undefined ? {} : { chat: chatInput }) }
    : row.state.kind === 'watcher'
      ? { ...row.state, watch: { status: watch.status, ...(watch.exitCode === undefined ? {} : { exitCode: watch.exitCode }), ...(watch.signal === undefined ? {} : { signal: watch.signal }), ...(watch.disarmed === undefined ? {} : { disarmed: true }) } }
      : row.state
  const shown = panelState(liveState, state)
  // M84 (critic). A watcher is a PROCESS node, so it carries the state dot
  // every process row carries AND its kind glyph — scanning the rail's left
  // column, a row with only a glyph reads as a document.
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
        ) : row.state.kind === 'watcher' ? (
          // A process node's glyph carries the state's tone: the dot column
          // is where a person scans for pass and fail, and the watcher is the
          // one kind whose glyph sits in it while having a real state.
          <span className="rail-row__kind rail-row__kind--stateful" data-tone={shown.tone} aria-hidden="true"><Glyph /></span>
        ) : (
          <span className="rail-row__kind" aria-hidden="true"><Glyph /></span>
        )}
        <span className="rail-row__label">{row.label}</span>
        {/* M63. The kind already sits in the glyph column; the state column
            is for state, so a sessionless row leaves it empty rather than
            saying its kind a second time. */}
        <span className="rail-row__tail" data-tone={shown.tone}>{shown.tone === 'kind' ? '' : shown.word}</span>
      </button>
      {/* M66. The wake control is a WORD, and every terminal row keeps its
          slot so the state column lines up whether or not the row can be
          started: ▶ was the rail's only unlabelled control (M61's critic,
          finding 39) and rows without it ended at a different edge. */}
      {row.dormant ? (
        <button
          type="button"
          className="rail-row__start"
          disabled={merged}
          title={merged ? 'leave merged view to start' : `Start ${row.label}`}
          aria-label={merged ? `Start ${row.label} — leave merged view to start` : `Start ${row.label}`}
          {...shellControl(() => onStart(row.id))}
        >
          start
        </button>
      ) : (row.state.kind === 'terminal' ? <span className="rail-row__start rail-row__start--empty" aria-hidden="true" /> : null)}
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
