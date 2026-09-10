import { useEffect, useRef, useState, type JSX, type MutableRefObject } from 'react'
import { REASON_GROUP_NEEDS_TWO, type PaletteActions } from '@renderer/palette/commands'
import { isChatPanel, isTerminalPanel, type Panel } from '@renderer/panels/panels'
import { getChat, useChatsVersion } from '@renderer/chat/chat-store'
import { getAgentState, onAgentTransition } from '@renderer/session/agent-state-store'
import { shellControl } from '../shell/shell-control'
import { Bell, Close, Grid, KindChat, Layers, Lanes, Link, Maximize } from '@renderer/icons'
import { pillRestState, runningAgents, type OrchestratorCandidate } from './command-pill'

/**
 * M249. The bottom command pill: act on THIS canvas NOW. The palette is
 * "find anything" with an unbounded list; this has no search and no list of
 * commands. Every control runs an existing PaletteActions member — the same
 * executor the palette rows call — so nothing here is a second
 * implementation of a verb. See docs/superpowers/specs/2026-09-10-m249-command-pill.md.
 *
 * Focus is the whole design (load-bearing.md, "The command pill never takes
 * the keyboard it was not given"):
 *  - every button is a shellControl (mousedown preventDefault), so a Fit
 *    press leaves the keyboard in xterm's textarea;
 *  - a click on the rest pill EXPANDS without focusing — only a press on the
 *    input itself, or Cmd+Shift+Space, moves the keyboard here;
 *  - Escape and a send hand the keyboard back to whatever held it when the
 *    shortcut opened the pill;
 *  - the menu accelerators (Cmd+C/V/Z/Shift+Z) are served here, only while
 *    the input holds activeElement, and Canvas stands down through
 *    pillFocused() in shouldIgnoreKeys — the Palette.tsx precedent.
 */

export type PillActions = Pick<PaletteActions, 'zoomToFit' | 'goToPanel' | 'tidyPanels' | 'showRelated' | 'arrangeTask' | 'beginCreateGroup' | 'closePanel' | 'say'>

export interface CommandPillProps {
  actions: PillActions
  /** The active workspace's panels (the orchestrator and running agents live here). */
  panels: readonly Panel[]
  /** The REACHABLE attention queue's size — Cmd+J's. */
  attentionCount: number
  selectedIds: readonly string[]
  orchestratorId: string | null
  /** Set when no conversation engine is available: the input is disabled with it. */
  engineReason?: string
  /** Cmd+J's cycle, landing through the notification click's jumpToAttention. */
  onJump: () => void
  /** Resolves the sentence to show in place (a refusal, or what it did), or null for a plain delivery. */
  onSend: (text: string) => Promise<string | null>
  /** Filled with "expand and take the keyboard" for Cmd+Shift+Space. */
  openRef: MutableRefObject<() => void>
}

export function orchestratorCandidates(panels: readonly Panel[]): OrchestratorCandidate[] {
  return panels.map((p) => (isChatPanel(p)
    ? { id: p.rect.id, kind: 'chat', supervisor: p.chat.supervisor === true, orchestrator: p.chat.orchestrator !== undefined }
    : { id: p.rect.id, kind: p.kind }))
}

const NO_ORCHESTRATOR = 'no orchestrator yet — first send creates a supervisor chat'
const HISTORY_CAP = 50
const NOTE_MS = 8000

export function CommandPill(props: CommandPillProps): JSX.Element {
  const { actions, panels, attentionCount, selectedIds, orchestratorId, engineReason, onJump, onSend, openRef } = props
  const [expanded, setExpanded] = useState(false)
  const [runningOpen, setRunningOpen] = useState(false)
  const [draft, setDraft] = useState('')
  // The send's outcome, shown IN the pill (role=status) rather than through
  // the palette, which would take the keyboard; cleared on the next open or
  // after NOTE_MS.
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    if (note === null) return
    const timer = window.setTimeout(() => setNote(null), NOTE_MS)
    return () => window.clearTimeout(timer)
  }, [note])
  const inputRef = useRef<HTMLInputElement | null>(null)
  // What held the keyboard when the shortcut opened the pill; null after a
  // click-open, which never took it.
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const focusOnOpenRef = useRef(false)
  // The input's own undo: the menu's Cmd+Z never reaches a native undo here
  // (it is an accelerator), so the pill keeps its drafts itself.
  const historyRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] })

  // Re-read chat status and agent state: chats through the store's version,
  // terminal agents through the transition fan-out (one bump per change).
  useChatsVersion()
  const [, setTick] = useState(0)
  useEffect(() => onAgentTransition(() => setTick((n) => n + 1)), [])

  const running = runningAgents(panels.map((p) => (isChatPanel(p)
    ? { id: p.rect.id, kind: 'chat', chatStatus: getChat(p.rect.id).snapshot?.status }
    : isTerminalPanel(p)
      ? { id: p.rect.id, kind: 'terminal', agent: p.spec.agent !== undefined, agentState: getAgentState(p.rect.id) }
      : { id: p.rect.id, kind: p.kind })))
  const rest = pillRestState({ attention: attentionCount, running: running.length, selected: selectedIds.length })

  const collapse = (restore: boolean): void => {
    setExpanded(false)
    setRunningOpen(false)
    const back = returnFocusRef.current
    returnFocusRef.current = null
    if (document.activeElement === inputRef.current) inputRef.current?.blur()
    if (restore && back !== null && back.isConnected) back.focus()
  }

  // Cmd+Shift+Space: the one keyboard path in. Remember the keyboard's owner
  // BEFORE moving it, so Escape can hand it back.
  useEffect(() => {
    openRef.current = () => {
      const active = document.activeElement
      returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null
      focusOnOpenRef.current = true
      setExpanded(true)
    }
    return () => { openRef.current = () => {} }
  }, [openRef])
  useEffect(() => {
    if (expanded && focusOnOpenRef.current) {
      focusOnOpenRef.current = false
      inputRef.current?.focus()
    }
  }, [expanded])

  const setDraftTracked = (next: string): void => {
    setDraft((current) => {
      if (current !== next) {
        const h = historyRef.current
        h.past = [...h.past, current].slice(-HISTORY_CAP)
        h.future = []
      }
      return next
    })
  }

  // The four menu accelerators, served only while the input has the keyboard.
  useEffect(() => {
    const mine = (): HTMLInputElement | null => (inputRef.current !== null && document.activeElement === inputRef.current ? inputRef.current : null)
    const offPaste = window.canvas.edit.onPaste((text) => {
      const input = mine()
      if (input === null || !text) return
      const start = input.selectionStart, end = input.selectionEnd
      const value = input.value
      setDraftTracked(start === null || end === null ? value + text : value.slice(0, start) + text + value.slice(end))
    })
    const offCopy = window.canvas.edit.onCopy(() => {
      const input = mine()
      if (input === null) return
      // NOT window.getSelection(): an <input>'s selection is not the document's (Palette.tsx).
      const { selectionStart: start, selectionEnd: end } = input
      if (start === null || end === null || start === end) return
      void navigator.clipboard.writeText(input.value.slice(start, end))
    })
    const offUndo = window.canvas.edit.onUndo(() => {
      if (mine() === null) return
      setDraft((current) => {
        const h = historyRef.current
        const prev = h.past.pop()
        if (prev === undefined) return current
        h.future = [current, ...h.future]
        return prev
      })
    })
    const offRedo = window.canvas.edit.onRedo(() => {
      if (mine() === null) return
      setDraft((current) => {
        const h = historyRef.current
        const [next, ...rest] = h.future
        if (next === undefined) return current
        h.future = rest
        h.past = [...h.past, current]
        return next
      })
    })
    return () => { offPaste(); offCopy(); offUndo(); offRedo() }
  }, [])

  const send = (): void => {
    // The input's LIVE value, not the `draft` state: an Enter that lands in
    // the same task as the last change (a paste then Enter, a fast typist)
    // runs this closure before React re-renders, and the stale state read
    // '' — the send silently did nothing (pill.send.1's first green run).
    const text = (inputRef.current?.value ?? draft).trim()
    if (text === '') return
    setDraft('')
    historyRef.current = { past: [], future: [] }
    collapse(true)
    void onSend(text).then(setNote)
  }

  const single = selectedIds.length === 1 ? selectedIds[0] : undefined
  const refusedSaid = (r: { kind: 'ran' } | { kind: 'refused'; reason: string } | { kind: 'ran'; note?: string }): void => {
    if (r.kind === 'refused') actions.say(r.reason)
  }
  const titleOf = (id: string): string => {
    const p = panels.find((x) => x.rect.id === id)
    return p === undefined ? id : (p.title ?? (isChatPanel(p) ? 'chat' : p.kind))
  }

  // A control that cannot run is DISABLED with its reason, never removed.
  const button = (action: string, label: string, icon: JSX.Element, run: () => void, reason?: string): JSX.Element => (
    <button type="button" key={action} className="command-pill__action" data-pill-action={action}
      disabled={reason !== undefined} title={reason ?? label} aria-label={label} {...shellControl(run)}>
      {icon}<span>{label}</span>
    </button>
  )

  return (
    <div className="command-pill" data-command-pill="" data-pill-expanded={expanded ? '' : undefined}
      onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      {expanded && (
        <div className="command-pill__panel" role="group" aria-label="Act on this canvas">
          {runningOpen && running.length > 0 && (
            <ul className="command-pill__running" aria-label="Running agents">
              {running.map((id) => (
                <li key={id}>
                  <button type="button" className="command-pill__row" data-pill-running-row={id} aria-label={`Go to ${titleOf(id)}`}
                    {...shellControl(() => { setRunningOpen(false); actions.goToPanel(id) })}>{titleOf(id)}</button>
                </li>
              ))}
            </ul>
          )}
          <input ref={inputRef} className="command-pill__input" data-command-pill-input="" type="text" value={draft}
            // NEVER disabled on the readiness report: an existing orchestrator
            // needs no engine lookup, and with none the supervisor path refuses
            // BY NAME (the pill says it). A disabled input also cannot take
            // Cmd+Shift+Space's focus — the first pill.paste.1 run found both.
            title={orchestratorId === null ? engineReason ?? NO_ORCHESTRATOR : undefined}
            placeholder={orchestratorId === null ? NO_ORCHESTRATOR : `Ask ${titleOf(orchestratorId)}…`}
            aria-label="Message the orchestrator"
            // WHERE THE KEYBOARD GOES BACK TO is decided by focus events, not
            // by the moment the pill opened (the critic's finding 1 and 5):
            // entering the input from outside the pill records that element
            // (a terminal's textarea, on a click-open too), and leaving it for
            // somewhere outside forgets it — so a person who clicked terminal
            // B between opening and Escape is handed back to B, never to A.
            onFocus={(e) => {
              const from = e.relatedTarget
              if (from instanceof HTMLElement && from.closest('[data-command-pill]') === null) returnFocusRef.current = from
            }}
            onBlur={(e) => {
              const to = e.relatedTarget
              if (to instanceof HTMLElement && to.closest('[data-command-pill]') === null) returnFocusRef.current = null
            }}
            onChange={(e) => setDraftTracked(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); send() }
              else if (e.key === 'Escape') { e.preventDefault(); collapse(true) }
            }} />
          <div className="command-pill__actions">
            {button('fit', 'Fit', <Maximize />, () => actions.zoomToFit())}
            {button('jump', 'Jump', <Bell />, onJump, attentionCount > 0 ? undefined : 'nothing is waiting for you')}
            {button('running', 'Running', <KindChat />, () => setRunningOpen((v) => !v), running.length > 0 ? undefined : 'no agent is running')}
            {selectedIds.length > 0 && (
              <>
                {button('tidy', 'Tidy', <Grid />, () => actions.tidyPanels([...selectedIds]), selectedIds.length >= 2 ? undefined : 'select at least two panels to tidy')}
                {button('arrange', 'Arrange task', <Lanes />, () => { if (single !== undefined) refusedSaid(actions.arrangeTask(single)) }, single !== undefined ? undefined : 'select one panel of a task')}
                {button('related', 'Related', <Link />, () => { if (single !== undefined) refusedSaid(actions.showRelated(single)) }, single !== undefined ? undefined : 'select one panel of a task')}
                {button('group', 'Group', <Layers />, () => actions.beginCreateGroup([...selectedIds]), selectedIds.length >= 2 ? undefined : REASON_GROUP_NEEDS_TWO)}
                {button('close', 'Close', <Close />, () => { if (single !== undefined) actions.closePanel(single) }, single !== undefined ? undefined : 'select one panel to close — the pill never closes several at once')}
              </>
            )}
          </div>
        </div>
      )}
      {note !== null && !expanded && <span className="command-pill__note" role="status" data-pill-note="">{note}</span>}
      <button type="button" className="command-pill__rest" data-pill-rest="" data-pill-state={rest.kind}
        aria-expanded={expanded} aria-label={rest.text === '' ? 'Canvas actions' : `Canvas actions — ${rest.text}`}
        {...shellControl(() => { if (expanded) collapse(true); else { focusOnOpenRef.current = false; setNote(null); setExpanded(true) } })}>
        {rest.kind === 'attention' ? <Bell /> : <Layers />}
        {rest.text !== '' && <span className="command-pill__text">{rest.text}</span>}
      </button>
    </div>
  )
}
