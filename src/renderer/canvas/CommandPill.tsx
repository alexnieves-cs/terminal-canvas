import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type MutableRefObject } from 'react'
import type { PaletteActions } from '@renderer/palette/commands'
import { isChatPanel, isTerminalPanel, type Panel } from '@renderer/panels/panels'
import { getChat, useChatsVersion } from '@renderer/chat/chat-store'
import { chatStateInput } from '@renderer/chat/chat-model'
import { getAgentState, onAgentTransition } from '@renderer/session/agent-state-store'
import { useAttentionQueue, type AttentionCensus } from '@renderer/session/useAttentionQueue'
import type { StateInput } from '@renderer/panels/panel-state'
import { shellControl } from '../shell/shell-control'
import { Bell, ChevronDown, Close, Grid, KindChat, Layers, Lanes, Link, Maximize, More, Send } from '@renderer/icons'
import { attentionPillLine, pillRestState, publishAttentionCensus, retiresJumpHint, runningAgents, showJumpHint, type OrchestratorCandidate } from './command-pill'
import { longAxisOf, runSelectionVerb, selectionVerbs, type SelectionFacts, type SelectionVerbKey } from './object-verbs'

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
 *
 * The expanded surface is three zones, top to bottom: Ask (the input, and
 * WHO it sends to — never a silent destination), Attention/Running (what is
 * waiting or in flight, as rows rather than a toggle button), and Actions
 * (at most `MAX_VISIBLE_ACTIONS`, the rest behind More — a pill that grows a
 * seventh button every milestone stops reading as "compact").
 */

export type PillActions = Pick<PaletteActions, 'zoomToFit' | 'goToPanel' | 'tidyPanels' | 'showRelated' | 'arrangeTask' | 'beginCreateGroup' | 'closePanel' | 'say' | 'alignObjects' | 'distributeObjects' | 'layoutFlowchart' | 'planFromChart' | 'beginStartWork'>

export interface CommandPillProps {
  actions: PillActions
  /** The active workspace's panels (the orchestrator and running agents live here). */
  panels: readonly Panel[]
  /** The REACHABLE attention queue's size — Cmd+J's. */
  attentionCount: number
  /** M264. Lit task's title when the related lens is on; absent means no task sentence. */
  taskTitle?: string
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

/** The pill's own face for each shared selection verb (object-verbs.ts holds the list). */
const PILL_ICON: Record<SelectionVerbKey, JSX.Element> = {
  fit: <Maximize />, plan: <Lanes />, layout: <Lanes />, tidy: <Grid />, align: <Grid />, space: <Grid />,
  arrange: <Lanes />, related: <Link />, group: <Layers />, close: <Close />
}
const NO_ORCHESTRATOR = 'no orchestrator yet — first send creates a supervisor chat'
const HISTORY_CAP = 50
const NOTE_MS = 8000
/** Never more than five contextual actions on screen at once; the rest live behind More. */
const MAX_VISIBLE_ACTIONS = 5
/** Rows shown in the Attention/Running zone before it switches to "+N more". */
const MAX_VISIBLE_RUNNING = 4
/** 4.3. A per-viewer convenience, like the dock's labels: localStorage, wrapped. */
const JUMP_TAUGHT_KEY = 'tc.pill.jumpTaught'
/** M403. How far a press may travel and still be a click (a marquee is a drag). */
const PILL_CLICK_SLOP = 4
/**
 * M403. Whether an Escape is another layer's to handle, not the expanded
 * pill's: an open dialog or menu anywhere (a force-mounted menu stays in the
 * DOM `hidden` while closed, so `:not([hidden])` is what "open" means), or a
 * key typed into an editable that is neither the pill's nor xterm's own
 * textarea (a rename input, Monaco's). Exported for the plain-node check.
 */
export function escapeBelongsElsewhere(target: EventTarget | null, pill: Element | null): boolean {
  const mine = (el: Element): boolean => pill !== null && pill.contains(el)
  for (const layer of Array.from(document.querySelectorAll('[role="dialog"]:not([hidden]), [role="alertdialog"]:not([hidden]), [role="menu"]:not([hidden]), [role="listbox"]:not([hidden])'))) {
    if (!mine(layer)) return true
  }
  if (!(target instanceof Element) || mine(target) || target.closest('.xterm') !== null) return false
  if (target.closest('.monaco-editor') !== null) return true
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
}
function readJumpTaught(): boolean {
  try { return window.localStorage.getItem(JUMP_TAUGHT_KEY) === 'true' } catch { return false }
}

/**
 * The census F2's queue reads. Membership and the clock live on Canvas, so
 * every row has a null task and one shared `since` (the id breaks the tie).
 * A terminal whose agent the store has heard is passed as running: that is
 * the only status on which the agent's own word is the sentence. Approvals
 * attach inside the hook, by panel id, so this list does not carry them.
 */
function attentionCensus(panels: readonly Panel[]): AttentionCensus[] {
  return panels.map((p): AttentionCensus => {
    const id = p.rect.id
    if (isChatPanel(p)) {
      const chat = getChat(id)
      const input = chatStateInput(chat.snapshot, chat.turns.length > 0)
      const state: StateInput = { kind: 'chat', status: undefined, dormant: false, ...(input === undefined ? {} : { chat: input }) }
      return { panelId: id, surface: 'chat', taskId: null, since: 0, state }
    }
    if (isTerminalPanel(p)) {
      const agent = getAgentState(id)
      const state: StateInput = {
        kind: 'terminal',
        dormant: false,
        status: agent === undefined ? undefined : { kind: 'running', pid: 0, command: '', cwd: '', reattached: false }
      }
      return { panelId: id, surface: 'terminal', taskId: null, since: 0, state }
    }
    return { panelId: id, surface: 'other', taskId: null, since: 0, state: { kind: p.kind, status: undefined, dormant: false } }
  })
}

export function CommandPill(props: CommandPillProps): JSX.Element {
  const { actions, panels, attentionCount, taskTitle, selectedIds, orchestratorId, engineReason, onJump, onSend, openRef } = props
  // M438. The redesign line reads F2's queue. The same census is published
  // for the dock and the Sessions host. Empty, the rest button below stays
  // the one the panels suite presses.
  const chatsVersion = useChatsVersion()
  const [agentTick, setAgentTick] = useState(0)
  const census = useMemo(() => attentionCensus(panels), [panels, chatsVersion, agentTick])
  useLayoutEffect(() => { publishAttentionCensus(census) }, [census])
  useLayoutEffect(() => () => { publishAttentionCensus([]) }, [])
  const attentionLine = attentionPillLine(useAttentionQueue(census))
  const [expanded, setExpanded] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
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
  useEffect(() => onAgentTransition(() => setAgentTick((n) => n + 1)), [])

  const running = runningAgents(panels.map((p) => (isChatPanel(p)
    ? { id: p.rect.id, kind: 'chat', chatStatus: getChat(p.rect.id).snapshot?.status }
    : isTerminalPanel(p)
      ? { id: p.rect.id, kind: 'terminal', agent: p.spec.agent !== undefined, agentState: getAgentState(p.rect.id) }
      : { id: p.rect.id, kind: p.kind })))
  const rest = pillRestState({ attention: attentionCount, running: running.length, selected: selectedIds.length, ...(taskTitle !== undefined ? { taskTitle } : {}) })

  // 4.3. Teach Cmd+J once, beside the first attention sentence; retire it when
  // that queue empties, so it is seen for a whole episode rather than a blink.
  const [jumpTaught, setJumpTaught] = useState(readJumpTaught)
  const jumpHintShownRef = useRef(false)
  const jumpHint = showJumpHint(jumpTaught, rest.kind)
  if (jumpHint) jumpHintShownRef.current = true
  useEffect(() => {
    if (!retiresJumpHint(jumpHintShownRef.current, rest.kind)) return
    jumpHintShownRef.current = false
    setJumpTaught(true)
    try { window.localStorage.setItem(JUMP_TAUGHT_KEY, 'true') } catch { /* this page keeps it */ }
  }, [rest.kind])

  const collapse = (restore: boolean): void => {
    setExpanded(false)
    setMoreOpen(false)
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
  // M390. What the arranging actions read off the selection: whether it holds
  // a flowchart shape, and which way it is long.
  const chosen = panels.filter((p) => selectedIds.includes(p.rect.id))
  const selection: SelectionFacts = { selectedIds, shape: chosen.some((p) => p.kind === 'shape'), longAxis: longAxisOf(chosen.map((p) => p.rect)) }
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

  // Every action, in the one priority order — Fit first (it never depends on
  // a selection), the selection-scoped ones after. Sliced below rather than
  // rendered inline: the cap has to see the WHOLE list to know what overflows.
  // M408 (D1). The list is `selectionVerbs` (object-verbs.ts), the one a
  // context menu on a selection renders too; only the icons are the pill's.
  const allActions: Array<{ key: string; label: string; icon: JSX.Element; run: () => void; reason?: string }> = selectionVerbs(selection)
    .map((v) => ({ key: v.key, label: v.label, icon: PILL_ICON[v.key], run: () => runSelectionVerb(v.key, selection, actions), ...(v.reason !== undefined ? { reason: v.reason } : {}) }))
  const visibleActions = allActions.slice(0, MAX_VISIBLE_ACTIONS)
  const overflowActions = allActions.slice(MAX_VISIBLE_ACTIONS)

  // The one panel a single selection puts "in focus" for the ask box's
  // placeholder — never the orchestrator's own name, which the destination
  // line below already carries.
  const activeTaskTitle = single !== undefined ? titleOf(single) : undefined
  const destinationLabel = orchestratorId === null ? 'Supervisor' : titleOf(orchestratorId)
  const placeholder = orchestratorId === null
    ? NO_ORCHESTRATOR
    : activeTaskTitle !== undefined
      ? `Ask about ${activeTaskTitle}…`
      : `Ask ${destinationLabel}…`

  // M396. THE PILL YIELDS TO THE HUD. Both float at the bottom of the host;
  // the pill is centred and the HUD pinned right, and once Create joined the
  // HUD the two met on an ordinary window ("1 session runnir" in the critic's
  // flip scene). Measured, never assumed: when the rest button's right edge
  // would pass the HUD's left (less a gap), the pill steps left by exactly
  // that — never past the host's own left gutter — and back to its centre
  // when there is room. Only the bottom row is judged; an expanded panel sits
  // above the HUD. Observed on the pill, the HUD and the host (a resize, a
  // drawer, the HUD's own label changing).
  const rootRef = useRef<HTMLDivElement>(null)

  // M399 (A7). THE EXPANDED PILL IS A LAYER, AND A LAYER LEAVES ON ESCAPE AND
  // ON A PRESS OUTSIDE IT. Opened by a click it never takes the keyboard (the
  // rule above), so its input's own Escape handler never heard the key: Esc
  // went to the terminal and the pill stayed up; an outside click left it up
  // too. Both listeners are document-level and live only while expanded.
  //  - Escape is taken in the CAPTURE phase, before xterm's textarea handler
  //    (which cancels the key it consumes), so the first Esc closes the
  //    topmost layer and never reaches the agent. Collapsing hands the
  //    keyboard back exactly as the input's Escape does (collapse(true)):
  //    to the element the input was entered from, else it stays where it is
  //    — the pill's trigger never took focus, so that IS its trigger's
  //    keyboard. The palette, when open, is above the pill and owns its Esc.
  //  - An outside pointerdown collapses WITHOUT restoring: the press is the
  //    focus gesture (the palette's dismissPalette rule). The draft survives.
  //    It supersedes M249's "stays open across outside clicks": a person who
  //    moves to terminal B now closes the pill there, so the hand-back it
  //    guarded (to B, never A) is reached through Escape alone.
  //  M403 (the M399 critic). Both listeners are window-level and run FIRST,
  //  so each must know when a key or a press is somebody else's:
  //  - Escape belongs to any OTHER open layer (a dialog, an open menu), to an
  //    IME composition, and to an editable outside the pill and xterm (a
  //    rename input, Monaco): each has its own Escape, and a capture-phase
  //    stopPropagation here ate it. Only then is the pill the topmost layer.
  //  - A MODIFIED press on a PANEL (Shift/Cmd), or one that becomes a drag
  //    on bare canvas (a marquee), is the selection the expanded pill's own
  //    verbs (Tidy, Line up, Space, Group) act on, so it keeps the pill up.
  //    A plain press on a panel collapses it at once (the boundary critic:
  //    a terminal's Escape was eaten). Bare canvas is
  //    judged on the RELEASE: a press that did not move is a click, and a
  //    click outside still dismisses (pill.dismiss.1).
  useEffect(() => {
    if (!expanded) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || document.querySelector('.palette') !== null) return
      if (escapeBelongsElsewhere(event.target, rootRef.current)) return
      event.preventDefault()
      event.stopPropagation()
      collapse(true)
    }
    let down: { x: number; y: number } | null = null
    const outside = (target: EventTarget | null): boolean => {
      const root = rootRef.current
      return !(root !== null && target instanceof Node && root.contains(target))
    }
    const onPointer = (event: PointerEvent): void => {
      down = null
      if (!outside(event.target)) return
      if (event.target instanceof Element && event.target.closest('.panel, [data-panel-id]') !== null) {
        // M403 (the boundary critic). Only a MODIFIED press (Shift or Cmd,
        // the gestures that add to a selection) keeps the pill up. A plain
        // press on a panel is the person going to work in it, and a pill
        // left open there took that terminal's next Escape in the capture
        // phase — the agent never saw it (pill.esc.1).
        if (!event.shiftKey && !event.metaKey) collapse(false)
        return
      }
      down = { x: event.clientX, y: event.clientY }
    }
    const onRelease = (event: PointerEvent): void => {
      const from = down
      down = null
      if (from === null) return
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > PILL_CLICK_SLOP) return
      collapse(false)
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('pointerup', onRelease, true)
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onPointer, true); document.removeEventListener('pointerup', onRelease, true) }
    // collapse closes over refs and setters only, so this render's copy is
    // equivalent to any later one's: `expanded` is the only dependency.
  }, [expanded])
  useLayoutEffect(() => {
    const pill = rootRef.current
    const host = pill?.parentElement
    if (pill === null || pill === undefined || host === null || host === undefined || typeof ResizeObserver === 'undefined') return
    const GAP = 12
    const place = (): void => {
      const rest = pill.querySelector<HTMLElement>(':scope > .command-pill__rest') ?? pill
      const hud = host.querySelector<HTMLElement>(':scope > .canvas-hud')
      pill.style.setProperty('--pill-shift', '0px')
      if (hud === null || hud.offsetWidth === 0) return
      const r = rest.getBoundingClientRect(), h = hud.getBoundingClientRect(), hb = host.getBoundingClientRect()
      const over = r.right - (h.left - GAP)
      if (over <= 0 || r.bottom < h.top) return
      // Never under a left drawer either (the navigator at compact): its width
      // is the shell's --drawer-l, which the pill inherits.
      const drawerL = parseFloat(getComputedStyle(pill).getPropertyValue('--drawer-l')) || 0
      const room = Math.max(0, r.left - hb.left - drawerL - GAP)
      pill.style.setProperty('--pill-shift', `${-Math.min(over, room)}px`)
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(pill)
    ro.observe(host)
    const hud = host.querySelector<HTMLElement>(':scope > .canvas-hud')
    if (hud !== null) ro.observe(hud)
    // A compact DRAWER moves the pill and the HUD by a class on the shell
    // (`.shell--ctx-drawer`), and nothing changes size — the confirm critic's
    // compact scene, "1 panel need" under the HUD. So a class change on the
    // shell re-places too, and so does the end of any transition that slides
    // either one.
    const shell = host.closest('.shell')
    const mo = new MutationObserver(() => { requestAnimationFrame(place) })
    if (shell !== null) mo.observe(shell, { attributes: true, attributeFilter: ['class', 'data-bp'] })
    const onEnd = (event: TransitionEvent): void => { if (event.target === hud || event.target === pill) place() }
    host.addEventListener('transitionend', onEnd)
    return () => { ro.disconnect(); mo.disconnect(); host.removeEventListener('transitionend', onEnd) }
  }, [])

  return (
    <div ref={rootRef} className="command-pill" data-screen-control="" data-command-pill="" data-pill-expanded={expanded ? '' : undefined}
      onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      {expanded && (
        <div className="command-pill__panel" role="group" aria-label="Act on this canvas">
          {/* Zone 1 — Ask the workspace. The destination is stated, never
              implied: a person about to hand text to an agent gets to see
              which one before it leaves the box. */}
          <div className="command-pill__zone command-pill__zone--ask">
            <div className="command-pill__ask-row">
              <input ref={inputRef} className="command-pill__input" data-command-pill-input="" type="text" value={draft}
                // NEVER disabled on the readiness report: an existing orchestrator
                // needs no engine lookup, and with none the supervisor path refuses
                // BY NAME (the pill says it). A disabled input also cannot take
                // Cmd+Shift+Space's focus — the first pill.paste.1 run found both.
                title={orchestratorId === null ? engineReason ?? NO_ORCHESTRATOR : undefined}
                placeholder={placeholder}
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
              <button type="button" className="command-pill__send" data-pill-send="" aria-label={`Send to ${destinationLabel}`}
                title={`Send to ${destinationLabel}`} disabled={draft.trim() === ''} {...shellControl(send)}>
                <Send />
              </button>
            </div>
            <span className="command-pill__destination">Send to <strong>{destinationLabel}</strong></span>
          </div>

          {/* Zone 2 — attention/running. Rows, not a toggle: what is waiting or
              in flight is worth seeing without an extra click, and a zero of
              either simply removes the zone rather than saying so. */}
          {(attentionCount > 0 || running.length > 0) && (
            <div className="command-pill__zone command-pill__zone--status">
              {/* attentionCount > 0 always puts pillRestState into its 'attention'
                  arm first (see command-pill.ts's priority order), so rest.text
                  is always the right sentence here. */}
              {attentionCount > 0 && (
                <button type="button" className="command-pill__status-row command-pill__status-row--attention" data-pill-action="jump"
                  aria-label={rest.text} {...shellControl(onJump)}>
                  <Bell /><span>{rest.text}</span>
                </button>
              )}
              {running.length > 0 && (
                <ul className="command-pill__running" aria-label="Running sessions">
                  {running.slice(0, MAX_VISIBLE_RUNNING).map((id) => (
                    <li key={id}>
                      <button type="button" className="command-pill__row" data-pill-running-row={id} aria-label={`Go to ${titleOf(id)}`}
                        {...shellControl(() => actions.goToPanel(id))}><KindChat />{titleOf(id)}</button>
                    </li>
                  ))}
                </ul>
              )}
              {running.length > MAX_VISIBLE_RUNNING && (
                <span className="command-pill__more-note">+{running.length - MAX_VISIBLE_RUNNING} more running</span>
              )}
            </div>
          )}

          {/* Zone 3 — contextual actions, capped at MAX_VISIBLE_ACTIONS with
              the remainder behind More. */}
          <div className="command-pill__zone command-pill__zone--actions">
            <div className="command-pill__actions">
              {visibleActions.map((a) => button(a.key, a.label, a.icon, a.run, a.reason))}
              {overflowActions.length > 0 && (
                <button type="button" className="command-pill__action command-pill__more-toggle" data-pill-action="more"
                  aria-expanded={moreOpen} aria-label="More actions" title="More actions"
                  {...shellControl(() => setMoreOpen((v) => !v))}>
                  <More /><span>More</span><ChevronDown />
                </button>
              )}
            </div>
            {moreOpen && overflowActions.length > 0 && (
              <div className="command-pill__more-panel" role="group" aria-label="More actions">
                {overflowActions.map((a) => button(a.key, a.label, a.icon, a.run, a.reason))}
              </div>
            )}
          </div>
        </div>
      )}
      {attentionLine !== '' && note === null && !expanded ? (
        <div className="command-pill__rest command-pill__rest--line" data-pill-rest="" data-pill-state="attention" role="group" aria-label={attentionLine}>
          <button type="button" className="command-pill__line-main" aria-label={attentionLine} {...shellControl(() => { focusOnOpenRef.current = false; setNote(null); setExpanded(true) })}>
            <Bell /><span className="command-pill__text">{attentionLine.split(' · ').slice(0, -2).join(' · ')}</span>
          </button>
          <button type="button" data-pill-go="" {...shellControl(onJump)}>Go <kbd>⌘J</kbd></button>
          <button type="button" data-pill-new="" {...shellControl(() => actions.beginStartWork())}>+ New <kbd>⌘N</kbd></button>
        </div>
      ) : (
      <button type="button" className="command-pill__rest" data-pill-rest="" data-pill-state={note !== null && !expanded ? 'result' : rest.kind}
        aria-expanded={expanded} aria-label={note !== null && !expanded ? note : rest.text === '' ? 'Canvas actions' : `Canvas actions — ${rest.text}`}
        {...shellControl(() => { if (expanded) collapse(true); else { focusOnOpenRef.current = false; setNote(null); setExpanded(true) } })}>
        {/* A completed send briefly REPLACES the pill's own content with its
            outcome, in place, rather than opening a second, detached surface
            to say the same thing. */}
        {note !== null && !expanded
          ? <span className="command-pill__text" role="status" data-pill-note="">{note}</span>
          : (
            <>
              {rest.kind === 'attention' ? <Bell /> : <Layers />}
              {rest.text !== '' && <span className="command-pill__text">{rest.text}</span>}
              {jumpHint && <span className="command-pill__hint" data-pill-jump-hint=""><kbd>⌘J</kbd> to jump</span>}
            </>
          )}
      </button>
      )}
    </div>
  )
}
