import { memo, useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import { shellControl } from '@renderer/shell/shell-control'
import { panelState } from '@renderer/panels/panel-state'
import type { PanelSession } from '@renderer/session/panel-session'
import type { DragState } from '@renderer/canvas/panel-interaction'
import type { WorldRect } from '@renderer/canvas/viewport'
import { useAgentState } from '@renderer/session/agent-state-store'
import { useScrollbackTail } from '@renderer/session/scrollback-store'
import type { CardDetail } from '@renderer/canvas/card-detail'
import type { AgentState } from '@shared/types'
import { PanelFrame } from './PanelFrame'

export interface TerminalPanelProps {
  session: PanelSession
  /**
   * The registry's version counter, unused directly in this component's body.
   * It exists purely so `memo`'s shallow prop comparison can see that the
   * session changed: the registry mutates `session` (and everything it owns)
   * IN PLACE and `registry.get(id)` returns the same object reference
   * forever, so `session` alone is always "equal" to memo, no matter how
   * many times its tier/status/spawned flags flip underneath it. Passing the
   * version scalar down forces a re-render exactly when one of those fields
   * actually changed — and no more often, since version only bumps on
   * status/tier/focus/exit events (never on 16ms-batched PTY data, never on
   * pointer moves), which is what keeps the memo doing its job of blocking
   * the 60Hz pan/zoom cascade.
   */
  version: number
  rect: WorldRect
  /** Paint order, rendered as style.zIndex — see the note on Panel.z. */
  z: number
  /**
   * The user's name for this panel, if they set one. A prop rather than a
   * field on PanelSession because it is LAYOUT — it belongs to the id, it
   * survives a relaunch, and a panel that never spawned can have one.
   * Passing it as a prop also means memo sees it change; the session is
   * mutated in place and would not.
   */
  title?: string
  /** M57. How the card draws at this zoom; `tail` is the only tier with terminal text. */
  cardDetail?: CardDetail
  /**
   * M106. Flip Terminals: the far-view SUMMARY over the body whatever the tier.
   * A prop rather than `CardDetailContext`, which only reaches a CARDED panel
   * (`live` renders the slot, never the card) — the first flip.1 passed on two
   * dormant panels and a running terminal on screen did not turn over at all.
   * The slot detaching is what a tier change already does; the session is
   * untouched (two lifetimes, not one).
   */
  flipped?: boolean
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  onFocus: (id: string) => void
  /**
   * Starts a move or resize gesture. `originWorld` is handed up in CLIENT
   * coordinates: only the canvas knows the viewport, so it does the
   * conversion to world space before the gesture begins.
   */
  onBeginDrag: (state: DragState) => void
  /** Called once the retained host is in the document, so it can be opened. */
  onSlotMount: (id: string) => void
  /** Called before the host leaves the document, so its context can be freed. */
  onSlotUnmount: (id: string) => void
  /** Close this panel for good: the canvas disposes its session and drops it. */
  onClose: (id: string) => void
  /** M74. Open this claude session as a chat. Shown only when it can apply (an agent spec, no live process). */
  onOpenAsChat?: (id: string) => void
  /** True only for a newly created panel, never for an LOD remount. */
  entering: boolean
  /** Clears the one-shot entry marker once its wrapper animation finishes. */
  onEntryEnd: (id: string) => void
  /**
   * M14's merged view: this panel is being shown inside another workspace's
   * lane, so its geometry belongs to a record this canvas does not own.
   *
   * Suppresses the close button and the resize handles — the two affordances
   * that would otherwise promise a verb the canvas refuses (Canvas.tsx gates
   * onClosePanel and onBeginDrag on the same flag, which is the authority).
   * Rendering them inert would be worse than not rendering them: a × that
   * does nothing reads as the app being broken, where an absent one reads as
   * the read-only view it is. A prop rather than a read inside this component
   * for the reason `glow` and `version` are props — memo's shallow compare
   * has to SEE it change, or a panel would keep its × after the toggle.
   */
  readOnly?: boolean
  openingContext?: string
  onContextPasted?: (id: string) => void
  /**
   * Whether the agent.glow setting is on. A prop rather than a read inside
   * this component, because memo's shallow compare has to SEE it change —
   * the same reason `version` and `title` are props.
   */
  glow: boolean
  /**
   * Begins a link drag from one of this panel's four port handles (M35).
   * PORT_MIN_SCALE visibility is NOT gated here by a `scale` prop — see
   * PanelPorts.tsx's own comment and the `.canvas--ports-hidden` class in
   * styles.css. Threading `viewport.scale` through this memoized component
   * would make it a changed prop on every frame of a zoom (`zoomAt`),
   * defeating `memo` for every panel on every zoom frame — the same 60Hz
   * cascade `version`/`title`/`glow` are props specifically to survive.
   */
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  /**
   * Whether an in-flight link draw would land on THIS panel if released now
   * (M35). A prop, computed once in Canvas from `linkDraw.state?.target`,
   * for the same reason `glow`/`version`/`title` all are: memo's shallow
   * compare has to SEE it change, or the ring would stick to whichever panel
   * happened to be the target when this component last rendered for some
   * other reason.
   *
   * REQUIRED, not optional-with-default, on `onBeginLink`'s own precedent
   * one field up: that prop was added by this same milestone and is
   * required, so an optional sibling here is the inconsistency. Task 7
   * copies this shape onto ReviewNode/FileNode/JiraNode/ToolboxNode, and
   * optional there means a missed `linkTarget={...}` compiles clean and
   * yields "the ring never appears for review nodes" — a feature that reads
   * as unbuilt. Required makes a missed prop four compile errors at the one
   * place that builds those call sites, `PanelRow.agent`'s own lesson.
   */
  linkTarget: boolean
}

const CARD_LINES = 6

/** How long a close stays armed before it forgets it was ever asked. */
const CONFIRM_CLOSE_MS = 3000

function TerminalPanelImpl({
  session, rect, z, title, cardDetail, flipped = false, selected, onSelect, onFocus, onBeginDrag, onSlotMount, onSlotUnmount,
  onClose, glow, entering, onEntryEnd, readOnly = false, openingContext, onContextPasted,
  onBeginLink, linkTarget, onOpenAsChat
}: TerminalPanelProps): JSX.Element {
  const slotRef = useRef<HTMLDivElement>(null)
  const live = session.tier === 'live'
  // Per-panel subscription, not registry.version(): a CPU reading changes
  // independently and must never redraw the rest of the canvas.

  // Subscribed per id, so an agent's state change re-renders this panel and
  // no other. Deliberately NOT routed through registry.version(), which
  // ignores PTY data on purpose so a chatty agent cannot drive the canvas at
  // 60Hz — see agent-state-store.ts.
  const agentState = useAgentState(session.id)
  const agentClass = glow && agentState ? ` panel--agent-${agentState}` : ''
  // M63. The one state word for this panel, applied to the pill, the card's
  // state line, the summary tier, the block tier and the frame's edge.
  const shown = panelState({ kind: 'terminal', status: session.status, dormant: session.dormant }, agentState)
  useEffect(() => {
    if (openingContext === undefined || session.status.kind !== 'running') return
    session.handle.paste(openingContext)
    onContextPasted?.(session.id)
  }, [openingContext, onContextPasted, session])

  // Arming lives in the view, not the session, so a panel that arms and is
  // then demoted (scrolled off screen) unmounts and forgets. That is the
  // intended reading: the confirmation is about the click you just made, not a
  // state the panel carries around.
  const [arming, setArming] = useState(false)
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cleared on unmount, and this component unmounts on every demotion — a
  // timer left running would call setArming on a gone component.
  useEffect(() => () => {
    if (armTimerRef.current !== null) clearTimeout(armTimerRef.current)
  }, [])

  const running = session.status.kind === 'running' || session.status.kind === 'starting'

  const handleClose = (event: ReactMouseEvent): void => {
    event.stopPropagation()
    event.preventDefault()
    // Idle and exited panels have nothing to lose, so they close outright.
    // A live process asks once — but only once, and without a modal: a dialog
    // on every close trains you to click through the one that mattered.
    if (!running || arming) {
      if (armTimerRef.current !== null) clearTimeout(armTimerRef.current)
      armTimerRef.current = null
      onClose(session.id)
      return
    }
    setArming(true)
    armTimerRef.current = setTimeout(() => {
      armTimerRef.current = null
      setArming(false)
    }, CONFIRM_CLOSE_MS)
  }

  useEffect(() => {
    const slot = slotRef.current
    if (!slot || !live) return

    // Order matters: the host must be IN the document before the registry
    // opens a terminal against it, because open() measures a laid-out node.
    slot.appendChild(session.handle.host)
    onSlotMount(session.id)

    // Cleanup frees the WebGL context and removes the node. It does NOT kill
    // or dispose anything: this component unmounting means the panel scrolled
    // off screen, not that the panel is going away.
    return () => {
      onSlotUnmount(session.id)
      if (session.handle.host.parentNode === slot) slot.removeChild(session.handle.host)
    }
  }, [live, session.id, session.handle.host, onSlotMount, onSlotUnmount])

  // M44. The honest label, computed once and used for BOTH the title span
  // below and the panel's screen-reader name — same chain, one source.
  const panelLabel =
    title ??
    (session.status.kind === 'running' ? session.status.command : undefined) ??
    session.spec.command ??
    'login shell'

  return (
    <PanelFrame
      id={session.id}
      kind="terminal"
      rect={rect}
      z={z}
      selected={selected}
      linkTarget={linkTarget}
      readOnly={readOnly}
      className={agentClass.trim()}
      // M44. A named group for a screen reader; the kind rides the label so
      // "claude — terminal" reads as one thing rather than an anonymous div.
      rootAttrs={{ role: 'group', 'aria-label': `${panelLabel} — terminal`, 'data-agent-state': glow ? agentState : undefined, 'data-tone': shown.tone }}
      title={panelLabel}
      agentState={glow ? agentState : undefined}
      motion={{ entering, onEntryEnd }}
      onSelect={onSelect}
      onBeginDrag={onBeginDrag}
      onBeginLink={onBeginLink}
      // onMouseDown rather than onClick, so it runs in the same phase as
      // every other panel interaction and beats the chrome's own drag start.
      close={readOnly ? null : { armed: arming, onMouseDown: handleClose, title: arming ? 'Click again to kill this process' : 'Close panel', armedText: 'kill?' }}
      chrome={<>
        {/*
          M20. The permission mode the panel was STARTED in, and only ever
          that: read off the session's own spec, which is the spec that
          reached pty.create, never off the panel the canvas holds.

          Only permissionMode earns a place in the chrome. Effort and model are
          inspector rows because they change what an agent costs and how well
          it does; a permission mode changes what it is allowed to DO to the
          user's machine, and `bypassPermissions` on a panel scrolled off
          screen is the one fact this canvas must never make someone hunt for.
          Rendered only when set — a login shell has no mode, and a chip that
          said "default" on every panel would be noise on the one surface that
          has to stay scannable.
        */}
        {session.spec.agentOptions?.permissionMode !== undefined && (
          <span
            className="panel__mode"
            data-permission-mode={session.spec.agentOptions.permissionMode}
            title={`Started with --permission-mode ${session.spec.agentOptions.permissionMode}`}
          >
            {session.spec.agentOptions.permissionMode}
          </span>
        )}
        {session.spec.agentOptions?.sandbox !== undefined && (
          <span
            className="panel__mode"
            data-sandbox={session.spec.agentOptions.sandbox}
            title={`Started with --sandbox ${session.spec.agentOptions.sandbox}`}
          >
            {session.spec.agentOptions.sandbox}
          </span>
        )}
        <span className="badge pf__word" data-tone={shown.tone} data-state-word>{shown.word}</span>
        {/* M74. Never a control that cannot work: shown only for a claude
            session whose process is not live (one front-end at a time). A
            LABELLED word after the pill, the row's own control slot. */}
        {onOpenAsChat !== undefined && session.spec.agent === 'claude-code' && session.status.kind !== 'running' && !readOnly && (
          <button type="button" className="pf__verb pf__verb--word" data-open-as-chat title="Open as chat — the same session, rendered as a transcript" aria-label="Open as chat"
            {...shellControl(() => onOpenAsChat(session.id))}>to chat</button>
        )}
      </>}
    >


      {live && !flipped ? (
        <div
          className="pf__body panel__slot"
          // The marker shouldYieldWheel's rule 3 looks for. It is on the SLOT
          // rather than on .panel because a carded panel has no terminal to
          // hand a wheel to — the "requiring the slot" clause rule 3 already
          // documented, now expressed as a fact each kind states about itself.
          data-scroll-host
          ref={slotRef}
          onMouseDown={(event) => {
            // Chrome selects; body focuses and falls through to xterm. No
            // preventDefault: M3 needed it because pointer-events:none stopped
            // xterm from focusing itself, so the browser's default action
            // would have cleared focus to <body>. With correction, xterm
            // receives the (corrected) event and manages its own focus.
            event.stopPropagation()
            onFocus(session.id)
          }}
        />
      ) : (
        <PanelCard session={session} agentState={glow ? agentState : undefined} detail={flipped ? 'summary' : cardDetail ?? 'tail'} title={panelLabel} state={agentState} shown={shown} />
      )}

    </PanelFrame>
  )
}

function PanelCard({ session, agentState, detail, title, state, shown }: {
  session: PanelSession
  agentState?: AgentState
  detail: CardDetail
  title: string
  state?: AgentState
  /** M63. The one state word and tone. */
  shown: { word: string; tone: string }
}): JSX.Element {
  const lines = session.spawned ? session.handle.tail(CARD_LINES) : []
  // M39. A DORMANT panel has no buffer — that is every panel on the canvas the
  // moment the app relaunches — so its card asks main for the durable log's
  // tail, once, through a store that never bumps registry.version(). A
  // spawned panel keeps reading its own xterm buffer, the live truth.
  const recorded = useScrollbackTail(session.id, !session.spawned && session.dormant)
  return (
    <div
      // The card carries the state too. A glow that reached only live panels
      // would be invisible exactly when it matters: LIVE_BUDGET caps live
      // panels at eight, so on the twelve-panel canvas this feature exists
      // for, most of what wants you is a card.
      className={`pf__body panel__card${agentState ? ` panel__card--agent-${agentState}` : ''}${detail === 'tail' ? '' : ` panel__card--${detail}`}`}
      data-card-detail={detail}
    >
      {/* M57. Semantic zoom: the card becomes LESS as the camera pulls
          away. `summary` and `block` draw from facts the Panel holds (title,
          agent state, cost) plus at most one line, so a dormant panel with
          no buffer has the same three tiers as a live one. The `tail` markup
          below stays byte-identical: three checks read .panel__card-idle. */}
      {detail === 'block' ? (
        <div className={`panel__card-block${state ? ` panel__card-block--${state}` : ''}`} data-card-block data-tone={shown.tone}>
          <span className="panel__card-block-title">{title}</span>
        </div>
      ) : detail === 'summary' ? (
        <div className="panel__card-summary" data-card-summary>
          <div className="panel__card-summary-title">{title}</div>
          {/* The same affordance element the tail tier renders, with the same
              exact text: an unstarted panel's summary IS "not started", and
              three checks read this element wherever the camera is. */}
          <div className="panel__card-summary-state" data-tone={shown.tone}>{shown.word}</div>
          {!session.spawned && <div className="panel__card-idle">click to start</div>}
          {(() => {
            const last = session.spawned ? lines[lines.length - 1] : (recorded?.[recorded.length - 1])
            return last ? <div className="panel__card-summary-line">{last}</div> : null
          })()}
        </div>
      ) : session.spawned ? (
        lines.map((line, i) => (
          <div className="panel__card-line" key={i}>{line}</div>
        ))
      ) : (
        <>
          {/* What the panel showed before the app last quit, above the
              affordance rather than instead of it: the lines say what this
              panel was doing, the prompt says how to resume it. Nothing
              renders while the tail is unanswered or empty, so a card never
              flashes a blank block. */}
          {session.dormant && recorded !== undefined && recorded.length > 0 &&
            recorded.map((line, i) => (
              <div className="panel__card-line panel__card-line--recorded" key={`r${i}`} data-recorded>{line}</div>
            ))}
          {/* A dormant panel is a restored one waiting for permission, not an
              unvisited one waiting for the camera. Saying "not started" for
              both would hide the only affordance the restored canvas has. */}
          {/* M63. The state WORD, chrome-sized and tone-coloured, then the
              affordance — whose text stays byte-identical for the checks
              that read it. The 32px headline is gone: the loudest text on a
              card is the agent's own tail. */}
          {/* Every unspawned card wakes on click — a restored one and one
              the camera never reached alike — so the affordance is the same
              sentence for both; the pill in the chrome is what tells them
              apart. (A word line here said it a second time on one frame.) */}
          <div className="panel__card-idle" data-tone={shown.tone}>click to start</div>
        </>
      )}
    </div>
  )
}




// Memoized because Canvas re-renders far more often than a panel changes:
// it re-renders on every mousemove for the HUD cursor, and a 60Hz cascade
// into panels backed by WebGL contexts is a frame-rate cliff. The default shallow
// comparator is sound specifically because `version` is in the props object
// (see the doc comment on TerminalPanelProps.version above) even though the
// component body never reads it — without it every prop here is identity- or
// value-stable across a registry mutation, and memo would never let a tier
// or status change through.
export const TerminalPanel = memo(TerminalPanelImpl)
