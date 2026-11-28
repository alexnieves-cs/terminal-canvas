import { useAgentState } from '@renderer/session/agent-state-store'
import { useLastLine } from '@renderer/session/last-line-store'
import { memo, useEffect, type JSX } from 'react'
import type { RailGroupId, RailRoleId, RailRow } from './rail-rows'
import { shellControl } from './shell-control'
import { Close, KIND_GLYPH, Lock, Pin, KindTerminal } from '@renderer/icons'
import { bayGroupOf, toneIsAsleep, toneIsRunning, toneNeedsYou, type BayGroupId } from '@renderer/panels/panel-state'
import { useShownState } from '@renderer/panels/useShownState'
import { approvalHeadline } from '@renderer/chat/chat-model'
import type { PendingApproval } from './rail-sections'
import { dropBayGroup, reportBayGroup } from './bay-groups'

/** M700 (Strip bay). The agent's shape mark: the kind is a SHAPE, never a colour (state owns colour). */
type StripMark = 'claude' | 'codex' | 'shell' | 'other'
const MARK_NAME: Record<StripMark, string> = { claude: 'Claude', codex: 'Codex', shell: 'Shell', other: 'Agent' }
function stripMark(row: RailRow): StripMark | undefined {
  if (row.state.kind === 'terminal') return row.agent ?? 'shell'
  if (row.state.kind === 'chat') return row.agent ?? 'claude'
  return undefined
}

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
  groupId: RailGroupId | RailRoleId | BayGroupId
  hidden?: boolean
  /**
   * M700 (Strip bay). This conversation's waiting permission request, for the
   * strip's ask band. Answered only ONCE from here (M308's rule for anything
   * outside the queue's own detail): a session grant needs the detail, so the
   * band never offers one, and a high-risk request offers Open instead of
   * Allow so its whole action is read before it is allowed.
   */
  /** M700. A task lens is lit and this panel is not in that task: the strip steps back. */
  outside?: boolean
  ask?: PendingApproval
  onAnswer?: (panelId: string, requestId: string, allow: boolean) => void
  /** M700. The selected strip's sheet: its folder, and the inspector's verbs. */
  folder?: string
  onPause?: (id: string) => void
  onHandOff?: (id: string) => void
  onRestart?: (id: string) => void
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
  row, selected, onGoTo, onStart, onClose, merged = false, groupId, hidden = false,
  outside = false, ask, onAnswer, folder, onPause, onHandOff, onRestart
}: RailPanelRowProps): JSX.Element {
  const last = useLastLine(row.id)
  // M63/M73/M84. The word and the tone, from the one vocabulary, with the
  // agent state, a chat's session and a watcher's runs this row subscribes
  // to applied — `row.tail` is the same answer without them, kept for the
  // signature and the plain-node checks. M393 moved the derivation into
  // useShownState so a flowchart shape wired to this panel says the same word.
  const shown = useShownState(row.id, row.state)
  // The terminal store's raw word, for `data-agent-state` (check 54's split).
  const state = useAgentState(row.id)
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
  const changed = last.unread || row.state.kind === 'review' || row.state.kind === 'github'
  const asleep = toneIsAsleep(shown.tone) || row.dormant
  // M700 (Strip bay). The bay groups by state, and this row is the only thing
  // that knows its live state: it reports its group, the list re-groups when
  // a group CHANGES (bay-groups.ts), and a bell that keeps it in place moves
  // nothing above it.
  const bay = bayGroupOf(shown.tone)
  useEffect(() => { reportBayGroup(row.id, bay) }, [row.id, bay])
  useEffect(() => () => { dropBayGroup(row.id) }, [row.id])
  const mark = stripMark(row)
  const doing = row.outcome ?? (last.line === '' ? undefined : last.line)
  const highRisk = ask?.risk === 'high'
  return (
    <li
      className={`rail-row${selected ? ' rail-row--selected' : ''}`}
      data-rail-row={row.id}
      data-rail-group-row={groupId}
      data-running={running}
      data-needs-you={needsYou}
      data-changed={changed}
      data-asleep={asleep}
      data-tone={shown.tone}
      data-strip-mark={mark}
      data-strip-ask={ask === undefined ? undefined : ''}
      data-strip-outside={outside ? '' : undefined}
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
        {mark === undefined
          ? <span className="rail-row__kind" aria-hidden="true"><Glyph /></span>
          : <span className="rail-row__kind strip__mark" data-mark={mark} aria-hidden="true" />}
        {/* The agent's name, unless the label already opens with it ("Claude — infra"): one name, never two. */}
        {mark !== undefined && !row.label.toLowerCase().startsWith(MARK_NAME[mark].toLowerCase()) && <span className="strip__agent">{MARK_NAME[mark]}</span>}
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
        {/* M645. A space for the accessible name ("vitest watch idle", not
            "vitest watchidle"); the row is a flex row, so it paints nothing. */}
        {' '}
        <span className="rail-row__tail" data-tone={shown.tone}>{shown.tone === 'kind' ? '' : shown.word}</span>
      </button>
      {/* M105. The agent's last line said — a second line on a chat's row, from
          the transcript's last complete text block, cut from the right. */}
      {/* M401 (B2). A settled task's outcome outranks the last line: after a
          merge the agent's own last words ("it hasn't been merged") are
          history, and the row is the place a person reads the task's state. */}
      {row.outcome !== undefined
        ? <span className="rail-row__last" data-rail-last data-rail-outcome title={row.outcome}>{row.outcome}</span>
        : last.line !== '' && <span className="rail-row__last" data-rail-last title={last.line}>{last.line}</span>}
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
      {/* M700 (Strip bay). THE ASK BAND: the question and its two answers on
          the strip, Deny first. Once only; a high-risk action is opened, read
          and then answered where its whole text is shown. */}
      {ask !== undefined && onAnswer !== undefined && (
        <div className="strip__ask" data-strip-ask-band={ask.requestId}>
          <span className="strip__ask-q" title={ask.action ?? ask.argument}>
            <span className="strip__ask-verb">Wants to {approvalHeadline(ask.toolName)}</span>
            {(ask.action ?? ask.argument) !== '' && <code className="strip__ask-arg">{ask.action ?? ask.argument}</code>}
          </span>
          <span className="strip__ask-verbs">
            <button type="button" className="strip__pill" data-strip-deny {...shellControl(() => onAnswer(row.id, ask.requestId, false))}>Deny</button>
            {highRisk
              ? <button type="button" className="strip__pill strip__pill--primary" data-strip-open title="Read the whole action before allowing it" {...shellControl(() => onGoTo(row.id))}>Open</button>
              : <button type="button" className="strip__pill strip__pill--primary" data-strip-allow {...shellControl(() => onAnswer(row.id, ask.requestId, true))}>Allow once</button>}
          </span>
        </div>
      )}
      {/* M700 (Strip bay). THE SHEET: the selected strip unfolds what the
          inspector used to say first, and its verbs. The inspector is still
          one toggle away for everything else. */}
      {selected && (
        <div className="strip__sheet" data-strip-sheet>
          <dl className="strip__facts">
            {doing !== undefined && <div><dt>Doing</dt><dd title={doing}>{doing}</dd></div>}
            {folder !== undefined && folder !== '' && <div><dt>Folder</dt><dd title={folder}>{folder}</dd></div>}
            {stateful && <div><dt>State</dt><dd>{shown.word}</dd></div>}
          </dl>
          {(onPause !== undefined || onHandOff !== undefined || onRestart !== undefined) && (
            <div className="strip__verbs">
              {onPause !== undefined && row.state.kind === 'chat' && running && (
                <button type="button" className="strip__pill" data-strip-pause {...shellControl(() => onPause(row.id))}>Pause</button>
              )}
              {onHandOff !== undefined && mark !== undefined && (
                <button type="button" className="strip__pill" data-strip-handoff {...shellControl(() => onHandOff(row.id))}>Hand off</button>
              )}
              {onRestart !== undefined && row.state.kind === 'terminal' && !row.dormant && !merged && (
                <button type="button" className="strip__pill" data-strip-restart {...shellControl(() => onRestart(row.id))}>Restart</button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export const RailPanelRow = memo(RailPanelRowImpl)
