import { useEffect, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { ChatPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { BACKENDS, backendOf } from '@shared/agent-backends'
import { autoChipParts, autoChipWords } from '@shared/auto'
import { chatHeaderLine, SANDBOX_HEADER } from '@renderer/shell/rail-rows'
import { panelState, autoTone, TONE_WORKING } from '@renderer/panels/panel-state'
import { shellControl } from '@renderer/shell/shell-control'
import { useChat, dismissAuto, useApprovals, isAnswered } from './chat-store'
import { chatPhase, chatPhaseWord, chatStateInput, deliveredUserTurns, toolArgument, toolArgumentIsCode } from './chat-model'
import { ChatConversation, answerRequest } from './ChatConversation'
import { useConversationClaimed } from './conversation-host'

/**
 * M73. THE CHAT PANEL — a conversation with an agent, on the canvas, through
 * the one frame every kind renders through.
 *
 * Plain DOM: no xterm, no WebGL context, no PTY, never in LIVE_BUDGET —
 * `isTerminalPanel`'s sixth clause keeps Canvas.tsx's partition from ever
 * handing it to tiering. Its process is main's (AgentSessionManager, keyed
 * by this panel's id); this component reads the store's mirror and calls
 * the bridge, and owns nothing that outlives its mount.
 *
 * The body is the brief's principle 12: the transcript is a well and the
 * agent's own words are the loudest thing — no bubbles, the role a caps
 * label in the margin, tool calls one collapsed row each with the result
 * folded under, thinking dim and collapsed, the composer pinned below.
 *
 * The composer is the FIFTH text surface that takes DOM focus off xterm
 * (after the review draft, the file editor, the Jira comment and the
 * palette), and inherits the same two rules: `shellControl` on every
 * control so a click never moves focus, and Palette.tsx's shape for the
 * menu's Cmd+C/Cmd+V: those are the app menu's accelerators, so the browser
 * never delivers a native copy or paste to this textarea, and Canvas.tsx's
 * listener routes `edit:paste` to the focused TERMINAL — for a chat panel
 * that is nobody. The composer therefore subscribes itself and serves the
 * paste only while it holds DOM focus. Cmd+Z over the composer is the
 * textarea's own undo (canvas/draft-focus.ts), no longer applyHistory.
 *
 * M75. The composer resolves `@` references against the panel's directory,
 * offers the project's and the saved prompts as `/` commands (a saved
 * prompt's `{{holes}}` filled in the same popup; a project prompt inserted
 * verbatim, never expanded), and carries dropped or pasted images as
 * attachments the next send takes. The pure rules live in composer-model.ts.
 *
 * M324. The body — the well and the composer, everything above — now lives
 * in `ChatConversation.tsx` so a task's focus view hosts the SAME
 * conversation; this file is the frame, the header and the far-tier card.
 */

export interface ChatNodeProps {
  panel: ChatPanel
  selected: boolean
  onSelect(id: string, additive?: boolean): void
  onFocus(id: string): void
  onBeginDrag(state: DragState): void
  onClose(id: string): void
  readOnly?: boolean
  onBeginLink(panelId: string, event: ReactMouseEvent): void
  linkTarget: boolean
  /** Whether `claude` was found on the login PATH — the composer's named reason otherwise. */
  claudeAvailable: boolean
  /** M74. Continue this conversation in a terminal (`claude --resume`). */
  onOpenInTerminal(id: string): void
  /** M97. Open the palette on this chat's Auto rows. */
  onOpenAuto?: (id: string) => void
  /** M100. The teammate this chat speaks as, by name — absent for a plain chat. */
  teammateName?: string
  /** D12: the dispatched task is provenance for an accepted decision, not its scope. */
  taskId?: string
}

export function ChatNode(props: ChatNodeProps): JSX.Element {
  const { panel } = props
  const id = panel.rect.id
  const chat = useChat(id)
  const snapshot = chat.snapshot
  const claimed = useConversationClaimed(id)
  // M279. What the agent is doing while it works, beside the state word.
  const phaseWord = chatPhaseWord(chatPhase(chat.live))
  const hasHistory = chat.turns.length > 0
  const stateInput = chatStateInput(snapshot, hasHistory)
  const state = panelState({ kind: 'chat', status: undefined, dormant: false, ...(stateInput === undefined ? {} : { chat: stateInput }) }, undefined)
  // M90. The backend from the record (absent is claude); the snapshot's word
  // agrees once main answers. Every codex difference is a named reason.
  const backend = backendOf(props.panel.chat)
  const answer = (requestId: string, allow: boolean, scope?: 'session'): void => answerRequest(id, snapshot, props.teammateName ?? BACKENDS[backend].label, requestId, allow, scope)
  // Subscribed for the re-render a mark causes (the snapshot itself is not
  // replaced by one); the filter is what hides an answered request here.
  useApprovals()
  const openPending = snapshot === null ? [] : snapshot.pending.filter((p) => !isAnswered(id, p.requestId))
  const alive = snapshot !== null && snapshot.pid !== undefined && snapshot.status !== 'exited' && snapshot.status !== 'disposed'
  // Counted from the TRANSCRIPT, never the snapshot (the conversation's own rule, M322's delivered-only count).
  const turnCount = deliveredUserTurns(chat.turns)
  const title = panel.title ?? `chat · ${(panel.chat.cwd.replace(/\/+$/, '').split('/').pop() || panel.chat.cwd)}`
  // M107. The branch, from M86's git:status — asked once per directory.
  const [branch, setBranch] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void window.canvas.git.status(panel.chat.cwd).then((st) => { if (live) setBranch(st.kind === 'status' ? st.branch : null) }).catch(() => { if (live) setBranch(null) })
    return () => { live = false }
  }, [panel.chat.cwd])

  return (
    <PanelFrame
      owner={chat.owner}
      id={id}
      kind="chat"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={props.readOnly ?? false}
      className="chat-node"
      rootAttrs={{ 'data-chat-status': snapshot?.status ?? 'none', 'data-chat-pending': String(snapshot?.pending.length ?? 0), 'data-chat-turns': String(turnCount) }}
      title={title}
      state={state}
      // M76. The question at the SUMMARY tier too: the tool and its argument
      // in mono, Allow and Deny. The block tier is the tone alone — a
      // control smaller than a word is not a control.
      far={openPending.length > 0 ? (() => { const p = openPending[0]!; return (
        <div className="chat__far-approval" data-chat-far-approval={p.requestId} onMouseDown={(e) => e.stopPropagation()}>
          <span className={`chat__far-question${toolArgumentIsCode(p.input) ? ' chat__far-question--code' : ''}`}><span className="chat__tool-name">{p.toolName}</span> {toolArgument(p.input)}</span>
          <button type="button" className="chat__verb chat__verb--allow" data-chat-allow title={`Allow this one ${p.toolName} call`} {...shellControl(() => answer(p.requestId, true))}>Allow once</button>
          <button type="button" className="chat__verb chat__verb--allow" data-chat-allow-session title={`Allow ${p.toolName} for the rest of this session`} {...shellControl(() => answer(p.requestId, true, 'session'))}>Allow for session</button>
          <button type="button" className="chat__verb chat__verb--deny" data-chat-deny title={`Deny ${p.toolName}`} {...shellControl(() => answer(p.requestId, false))}>Deny</button>
        </div>) })() : undefined}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
      close={props.readOnly === true ? null : {
        // Armed while a process is alive, like a running terminal: a
        // mis-click on a conversation mid-answer is a killed agent.
        armed: alive,
        title: alive ? 'Close (ends this agent)' : 'Close',
        armedText: 'end?',
        onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(id) }
      }}
      // The terminal's own pill, byte for byte (`badge pf__word`), so the two
      // front-ends render one state one way (principle 11). The turn count
      // left the chrome after M73's critic — two facts in one slot — and lives
      // in the inspector's Detail and on the root as data.
      menuDetail={<span data-chat-header title={chatHeaderLine({ cwd: panel.chat.cwd, ...(branch === null ? {} : { branch }), backend, ...(snapshot?.model === undefined ? {} : { model: snapshot.model }), ...(panel.chat.sandbox === true ? { sandbox: true } : {}) })}>{[panel.chat.sandbox === true ? SANDBOX_HEADER : (panel.chat.cwd.replace(/\/+$/, '').split('/').filter((p) => p !== '').slice(-1)[0] ?? '/'), branch ?? undefined, snapshot?.model].filter((p): p is string => typeof p === 'string' && p !== '').join(' · ')}</span>}
      chrome={<>
        {/* M90. Which CLI this panel talks to — a KIND fact, before the state pill, like the github card's. */}
        {/* M100. The identity leads the kind word: `ada · claude`. */}
        {props.teammateName !== undefined && <span className="pf__kind chat__teammate" data-chat-teammate title={`speaking as ${props.teammateName}`}>{props.teammateName}</span>}
        {/* #13. The header is identity and state: who (the teammate), the
            title, the engine and the state pill. M107's folder · branch · model
            line is configuration a person looks up, not reads at rest — it
            moved to the ⋯ menu (`menuDetail`) and the pane's Detail, and the
            title it was crowding gets the width back. */}
        {/* M315. When the teammate's name already begins with the engine
            ("Claude · demo2" beside "claude") the word is an echo: kept in the
            DOM for the screen reader and the checks, not painted twice in a
            header that was clipping its own close control. */}
        <span className={`pf__kind chat__backend${props.teammateName !== undefined && props.teammateName.toLowerCase().startsWith(backend.toLowerCase()) ? ' chat__backend--echo' : ''}`} data-chat-backend={backend} title={`a conversation with ${backend}`}>{backend}</span>
        <span className="badge pf__word" data-tone={state.tone} data-state-word data-chat-state title={`${turnCount} completed turn${turnCount === 1 ? '' : 's'}`}>{state.word}</span>
        {/* M279. The phase, a SIBLING of the pill: the pill's text is the
            state word alone (the suites read it byte for byte), and the
            phase is the contextual layer beside it — present only while
            the tone is working, and only when there is a word worth saying. */}
        {phaseWord !== '' && state.tone === TONE_WORKING && <span className="pf__phase" data-chat-phase title={phaseWord}>{phaseWord}</span>}
        {/* M97. The auto chip: a PROJECTION of main's count, beside the pill.
            A ring while running; `done` / `stuck — why` / `stopped` resolved,
            with a labelled dismiss. Never a decision — main stops the run. */}
        {snapshot?.auto !== undefined && (() => {
          const a = snapshot.auto
          return <span className={`badge pf__word chat__auto${a.state === 'running' ? ' chat__auto--running' : ''}`} data-chat-auto={a.state} data-tone={autoTone(a.state)} title={autoChipWords(a)}>
            {a.state === 'running' && <span className="chat__auto-ring" aria-hidden="true" />}
            {/* M121. The WORDS are the flex item that gives: text-overflow lives on a block, not on an inline-flex row's anonymous text.
                M356. A resolved chip's head never clips; only its tail does. */}
            {(() => { const parts = autoChipParts(a); return <><span className="chat__auto-head">{parts.head}</span>{parts.tail !== '' && <span className="chat__auto-label">{parts.tail}</span>}</> })()}
            {a.state !== 'running' && props.readOnly !== true && <button type="button" className="pf__verb pf__verb--word chat__auto-dismiss" data-chat-auto-dismiss aria-label="Dismiss the auto result" title="Dismiss" {...shellControl(() => dismissAuto(id))}>dismiss</button>}
          </span>
        })()}
        {/* M97. The door to the Auto rows: opens the palette on them (the
            rename verb's idiom), so no second menu is grown. */}
        {/* M356. Hidden while ANY chip shows: a resolved chip already names the
            run in this slot, and a header with both pushed its controls past
            the frame. Dismissing the chip brings the door back; the palette's
            Auto rows are there throughout. */}
        {props.readOnly !== true && snapshot?.auto === undefined && (
          <button type="button" className="pf__verb pf__verb--word" data-chat-auto-open title="Run this chat on its own for a bounded number of turns — Complete, Harden, Review, or a task of yours" aria-label="Auto…"
            {...shellControl(() => props.onOpenAuto?.(id))}>auto</button>
        )}
        {/* M74. A LABELLED verb after the pill — the terminal's own row shape
            (`title · pill · controls`), and a word rather than the `>_` glyph
            the rail uses as a passive kind mark (M74's critic). Disabled by
            name while answering or empty, never hidden. */}
        {props.readOnly !== true && (() => {
          const busy = snapshot !== null && (snapshot.status === 'streaming' || snapshot.pending.length > 0)
          // M99. The door is the ROW's: a backend with no terminal door names why, from the registry.
          const reason = !BACKENDS[backend].terminalDoor ? BACKENDS[backend].reasons.noTerminal : busy ? 'the chat is still answering — interrupt it first' : turnCount === 0 ? 'send a message first — an empty chat has nothing to move' : null
          return <button type="button" className="pf__verb pf__verb--word" data-open-in-terminal disabled={reason !== null}
            title={reason ?? 'Open in a terminal — claude --resume this session'} aria-label="Open in terminal"
            {...shellControl(() => { if (reason === null) props.onOpenInTerminal(id) })}>Open terminal session</button>
        })()}
      </>}
    >
      {/* M324. One composer per chat: while a task's focus view holds this
          conversation, the panel says where it is instead of mounting a
          second composer behind the page. */}
      {claimed ? (
        <div className="pf__body chat__body" data-chat-claimed onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }}>
          <p className="pf__note chat__claimed">This conversation is open in its task's focus view — it continues there, and returns here when you go back.</p>
        </div>
      ) : <ChatConversation id={id} chat={panel.chat} backend={backend} claudeAvailable={props.claudeAvailable}
        {...(props.readOnly === undefined ? {} : { readOnly: props.readOnly })}
        {...(props.teammateName === undefined ? {} : { teammateName: props.teammateName })}
        {...(props.taskId === undefined ? {} : { taskId: props.taskId })}
        onFocus={props.onFocus} />}
    </PanelFrame>
  )
}
