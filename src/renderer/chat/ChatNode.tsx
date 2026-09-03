import { memo, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { ChatPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { panelState } from '@renderer/panels/panel-state'
import { shellControl } from '@renderer/shell/shell-control'
import { useChat } from './chat-store'
import { chatRows, chatStateInput, composerState, toolArgument, type ChatRow } from './chat-model'

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
 * paste only while it holds DOM focus (M73's verifier caught the first cut
 * declining to, on exactly the argument the spec was guarding against).
 * Cmd+Z over the composer still reaches applyHistory — the known limit
 * CLAUDE.md records for the Jira draft, now the fifth text surface.
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
}

const shortInput = toolArgument

const ToolRow = memo(function ToolRow({ row }: { row: Extract<ChatRow, { kind: 'tool' }> }): JSX.Element {
  const [open, setOpen] = useState(false)
  const hasResult = row.result !== undefined
  return (
    <div className={`chat__row chat__row--tool${row.result?.isError ? ' chat__row--tool-error' : ''}`} data-chat-row="tool" data-chat-tool={row.name}>
      <span className="chat__tool-name">{row.name}</span>
      <span className="chat__tool-input">{shortInput(row.input)}</span>
      {row.live && !hasResult && <span className="chat__tool-running">running</span>}
      {hasResult && (
        <button type="button" className="chat__tool-toggle" data-chat-tool-toggle
          title={open ? 'Hide the result' : 'Show the result'} aria-label={open ? 'Hide the result' : 'Show the result'}
          aria-expanded={open} {...shellControl(() => setOpen((v) => !v))}>
          {open ? 'hide result' : 'show result'}
        </button>
      )}
      {open && row.result && <pre className="chat__tool-result" data-chat-tool-result>{row.result.content === '' ? '(no output)' : row.result.content}</pre>}
    </div>
  )
})

const ThinkingRow = memo(function ThinkingRow({ row }: { row: Extract<ChatRow, { kind: 'thinking' }> }): JSX.Element {
  const [open, setOpen] = useState(false)
  const has = row.text.trim() !== ''
  return (
    <div className="chat__row chat__row--thinking" data-chat-row="thinking">
      <button type="button" className="chat__thinking-toggle" title={has ? (open ? 'Hide the thinking' : 'Show the thinking') : 'The model thought; the text was not shared'}
        aria-label={open ? 'Hide the thinking' : 'Show the thinking'} aria-expanded={open} disabled={!has} {...shellControl(() => setOpen((v) => !v))}>
        {row.live ? 'thinking…' : 'thought'}{has ? (open ? ' · hide' : ' · show') : ''}
      </button>
      {open && has && <pre className="chat__thinking-text">{row.text}</pre>}
    </div>
  )
})

export function ChatNode(props: ChatNodeProps): JSX.Element {
  const { panel } = props
  const id = panel.rect.id
  const chat = useChat(id)
  const snapshot = chat.snapshot
  const rows = useMemo(() => chatRows(chat.turns, chat.live), [chat.turns, chat.live])
  const hasHistory = chat.turns.length > 0
  const stateInput = chatStateInput(snapshot, hasHistory)
  const state = panelState({ kind: 'chat', status: undefined, dormant: false, ...(stateInput === undefined ? {} : { chat: stateInput }) }, undefined)
  const composer = composerState(snapshot, props.claudeAvailable)
  const [draft, setDraft] = useState('')
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto-scroll to the newest row unless the user has scrolled away; the
  // decision is read from the scroll position BEFORE the rows change, so a
  // person reading an earlier turn is not dragged to the bottom by a token.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (stickRef.current) el.scrollTop = el.scrollHeight
  }, [rows])
  const onScroll = (): void => {
    const el = bodyRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  // The menu's paste and copy, served only while this textarea is focused.
  useEffect(() => {
    const offPaste = window.canvas.edit.onPaste((text) => {
      const ta = textareaRef.current
      if (!text || !ta || document.activeElement !== ta) return
      const start = ta.selectionStart ?? ta.value.length
      const end = ta.selectionEnd ?? start
      setDraft((d) => d.slice(0, start) + text + d.slice(end))
    })
    const offCopy = window.canvas.edit.onCopy(() => {
      const ta = textareaRef.current
      if (!ta || document.activeElement !== ta) return
      const start = ta.selectionStart ?? 0
      const end = ta.selectionEnd ?? 0
      if (end > start) void navigator.clipboard.writeText(ta.value.slice(start, end))
    })
    return () => { offPaste(); offCopy() }
  }, [])

  const send = (): void => {
    const text = draft.trim()
    if (text === '' || !composer.send.enabled) return
    setDraft('')
    stickRef.current = true
    void window.canvas.agentSession.send(id, text)
  }
  const interrupt = (): void => {
    if (!composer.interrupt.enabled) return
    void window.canvas.agentSession.interrupt(id)
  }
  const answer = (requestId: string, allow: boolean): void => {
    void window.canvas.agentSession.answer({ id, requestId, answer: allow ? { allow: true } : { allow: false, message: 'denied from the canvas' } })
  }

  const alive = snapshot !== null && snapshot.pid !== undefined && snapshot.status !== 'exited' && snapshot.status !== 'disposed'
  // Counted from the TRANSCRIPT, never the snapshot: a restored panel's fresh
  // session reports zero turns while the file holds yesterday's, and a
  // resumed session's count would start again at one. A turn is a message
  // the user sent — the same thing the runtime's result count measures.
  const turnCount = chat.turns.filter((t) => t.role === 'user' && t.blocks.some((b) => b.type === 'text')).length
  const title = panel.title ?? `chat · ${(panel.chat.cwd.replace(/\/+$/, '').split('/').pop() || panel.chat.cwd)}`

  return (
    <PanelFrame
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
      chrome={<span className="badge pf__word" data-tone={state.tone} data-state-word data-chat-state title={`${turnCount} completed turn${turnCount === 1 ? '' : 's'}`}>{state.word}</span>}
    >
      <div className="pf__body chat__body" onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }}>
        <div className="chat__transcript" data-chat-transcript data-scroll-host ref={bodyRef} onScroll={onScroll}>
          {rows.length === 0 && chat.refusal === null && (
            <p className="pf__note chat__empty" data-chat-empty>
              {props.claudeAvailable ? 'No turns yet. Send a message to start claude here.' : 'claude was not found on the login PATH, so this panel cannot start.'}
            </p>
          )}
          {rows.map((row) => {
            switch (row.kind) {
              case 'user':
                return <div key={row.id} className="chat__row chat__row--user" data-chat-row="user"><span className="chat__role">you</span><pre className="chat__text">{row.text}</pre></div>
              case 'text':
                return <div key={row.id} className={`chat__row chat__row--assistant${row.live ? ' chat__row--live' : ''}`} data-chat-row="assistant"><span className="chat__role">claude</span><pre className="chat__text" data-chat-assistant-text>{row.text}</pre></div>
              case 'thinking':
                return <ThinkingRow key={row.id} row={row} />
              case 'tool':
                return <ToolRow key={row.id} row={row} />
              default:
                return <div key={row.id} className="chat__row chat__row--unknown" data-chat-row="unknown"><span className="chat__role">claude</span><span className="pf__note">a {row.kindName} block this version cannot render</span></div>
            }
          })}
          {snapshot !== null && snapshot.queued > 0 && (
            <p className="pf__note chat__queued" data-chat-queued>{snapshot.queued} message{snapshot.queued === 1 ? '' : 's'} waiting for this turn to end</p>
          )}
          {snapshot?.status === 'exited' && (
            <p className="pf__note chat__exited" data-chat-exited>
              claude exited{typeof snapshot.exitCode === 'number' ? ` with ${snapshot.exitCode}` : ''}{snapshot.exitSignal ? ` (${snapshot.exitSignal})` : ''} — the next message resumes the conversation
            </p>
          )}
          {snapshot?.pending.map((p) => (
            <div key={p.requestId} className="chat__permission" data-chat-permission={p.requestId} role="group" aria-label={`${p.toolName} asks for permission`}>
              <span className="chat__permission-title">claude asks to run <span className="chat__tool-name">{p.toolName}</span></span>
              <pre className="chat__permission-input">{shortInput(p.input)}</pre>
              <div className="chat__permission-verbs">
                <button type="button" className="chat__verb chat__verb--allow" data-chat-allow title="Allow this tool call" {...shellControl(() => answer(p.requestId, true))}>Allow</button>
                <button type="button" className="chat__verb chat__verb--deny" data-chat-deny title="Deny this tool call" {...shellControl(() => answer(p.requestId, false))}>Deny</button>
              </div>
            </div>
          ))}
        </div>
        <div className="chat__composer" data-chat-composer>
          {chat.refusal !== null ? (
            <p className="pf__note chat__refusal" data-chat-refusal role="alert">{chat.refusal}</p>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                className="chat__input"
                data-chat-input
                value={draft}
                placeholder={composer.send.enabled ? 'Message claude… (⌘↩ sends)' : composer.send.reason}
                disabled={!composer.send.enabled}
                title={composer.send.enabled ? 'Your next message' : composer.send.reason}
                spellCheck={false}
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send() }
                  // Bare keys belong to this textarea while it has focus; the
                  // canvas's Cmd-gated shortcuts still apply above it.
                  e.stopPropagation()
                }}
              />
              <div className="chat__verbs">
                <button type="button" className="chat__verb chat__verb--send" data-chat-send disabled={!composer.send.enabled || draft.trim() === ''}
                  title={composer.send.enabled ? 'Send (⌘↩)' : composer.send.reason} aria-label="Send" {...shellControl(send)}>Send</button>
                <button type="button" className="chat__verb chat__verb--interrupt" data-chat-interrupt disabled={!composer.interrupt.enabled}
                  title={composer.interrupt.enabled ? 'Interrupt the answer in flight' : composer.interrupt.reason} aria-label="Interrupt" {...shellControl(interrupt)}>Interrupt</button>
              </div>
            </>
          )}
        </div>
      </div>
    </PanelFrame>
  )
}
