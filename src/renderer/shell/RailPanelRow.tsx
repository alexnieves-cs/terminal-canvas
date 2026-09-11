import { useLastLine } from '@renderer/session/last-line-store'
import { memo, type JSX } from 'react'
import { useAgentState } from '@renderer/session/agent-state-store'
import type { RailGroupId, RailRow } from './rail-rows'
import { shellControl } from './shell-control'
import { Close, KIND_GLYPH, Lock, Pin, KindTerminal } from '@renderer/icons'
import { panelState, toneIsAsleep, toneIsRunning, toneNeedsYou } from '@renderer/panels/panel-state'
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
  groupId: RailGroupId
  hidden?: boolean
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
  row, selected, onGoTo, onStart, onClose, merged = false, groupId, hidden = false
}: RailPanelRowProps): JSX.Element {
  const last = useLastLine(row.id)
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
  // M171. Every row leads with its kind's glyph in a soft tint — a terminal's
  // too (KindTerminal); the state is a DOT after the label with the word on
  // the row's title, and the tail keeps the word for the checks, clipped.
  const Glyph = row.state.kind === 'terminal' ? KindTerminal : KIND_GLYPH[row.state.kind]
  const stateful = shown.tone !== 'kind'
  const running = toneIsRunning(shown.tone)
  const needsYou = toneNeedsYou(shown.tone)
  const changed = last.unread || row.state.kind === 'review' || row.state.kind === 'github' || row.state.kind === 'jira'
  const asleep = toneIsAsleep(shown.tone) || row.dormant
  return (
    <li
      className={`rail-row${selected ? ' rail-row--selected' : ''}`}
      data-rail-row={row.id}
      data-rail-group-row={groupId}
      data-running={running}
      data-needs-you={needsYou}
      data-changed={changed}
      data-asleep={asleep}
      hidden={hidden}
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
        title={stateful ? `Go to ${row.label} — ${shown.word}` : `Go to ${row.label}`}
        {...shellControl(() => onGoTo(row.id))}
      >
        {/*
          The attribute, not only a class: a class is a styling decision a
          restyle may rename, while data-agent-state is this row's stated
          answer to "what is that agent doing" — the same split check 54
          already draws for the panel itself.
        */}
        <span className="rail-row__kind" aria-hidden="true"><Glyph /></span>
        {/* M105. Unread: the turn ended while the user was elsewhere; cleared on focus. */}
        {last.unread && <span className="rail-row__unread" data-rail-unread title="finished while you were elsewhere" aria-label="unread" />}
        <span className="rail-row__label">{row.label}</span>
        {/* M92. Lock and pin marks after the label, the same glyphs the frame paints. */}
        {row.locked === true && <span className="rail-row__mark" data-rail-locked title="locked">{Lock}</span>}
        {row.pinned === true && <span className="rail-row__mark" data-rail-pinned title="pinned live">{Pin}</span>}
        {/* M63. The kind already sits in the glyph column; the state column
            is for state, so a sessionless row leaves it empty rather than
            saying its kind a second time. */}
        {/* The dot a person reads — `.rail-row__dot` stays as its alias (shell 83 and the harness read it; restyle, never rename); the tail keeps the WORD for state-word.1 / 84, clipped. */}
        {stateful && <span className="rail-row__state-dot rail-row__dot status-dot" {...(row.state.kind === 'terminal' ? { 'data-agent-state': state ?? 'none' } : {})} data-tone={shown.tone} aria-hidden="true" />}
        {/* data-agent-state is the TERMINAL store's word (check 54's split); a chat row's state is its tone (the Act III critic). */}
        <span className="rail-row__tail" data-tone={shown.tone}>{shown.tone === 'kind' ? '' : shown.word}</span>
      </button>
      {/* M105. The agent's last line said — a second line on a chat's row, from
          the transcript's last complete text block, cut from the right. */}
      {last.line !== '' && <span className="rail-row__last" data-rail-last title={last.line}>{last.line}</span>}
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
      ) : <span className="rail-row__start rail-row__start--empty" aria-hidden="true" />}
      {/* M171 (the Act III critic): EVERY row keeps the start slot, so the dot column lines up across kinds. */}
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
