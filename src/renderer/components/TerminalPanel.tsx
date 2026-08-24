import { memo, useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { PanelSession, PanelStatus } from '@renderer/session/panel-session'
import type { DragState } from '@renderer/canvas/panel-interaction'
import type { WorldRect } from '@renderer/canvas/viewport'

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
  selected: boolean
  onSelect: (id: string) => void
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
}

const CARD_LINES = 6

/** How long a close stays armed before it forgets it was ever asked. */
const CONFIRM_CLOSE_MS = 3000

function TerminalPanelImpl({
  session, rect, selected, onSelect, onFocus, onBeginDrag, onSlotMount, onSlotUnmount, onClose
}: TerminalPanelProps): JSX.Element {
  const slotRef = useRef<HTMLDivElement>(null)
  const live = session.tier === 'live'

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

  return (
    <div
      className={`panel${selected ? ' panel--selected' : ''}`}
      data-panel-id={session.id}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <header
        className="panel__chrome"
        onMouseDown={(event) => {
          // Chrome selects, and starts a move. stopPropagation keeps the
          // canvas from reading this as a background click and deselecting.
          event.stopPropagation()
          event.preventDefault() // suppress the native text-drag of the title
          onSelect(session.id)
          onBeginDrag({
            panelId: session.id,
            mode: { kind: 'move' },
            originRect: rect,
            originWorld: { x: event.clientX, y: event.clientY }
          })
        }}
      >
        {/* A spec with no command runs the login shell, which only main can
            name — rendering the raw value would print "undefined" for every
            default panel. Once main reports what it actually spawned (M4 can
            surface result.command here), this label is the honest stand-in. */}
        <span className="panel__title">{session.spec.command ?? 'login shell'}</span>
        <StatusBadge status={session.status} />
        {/* onMouseDown rather than onClick, so it runs in the same phase as
            every other panel interaction and beats the chrome's own drag
            start — a mousedown on the chrome begins a move, and a close that
            waited for mouseup would fire after a gesture had already begun. */}
        <button
          type="button"
          className={`panel__close${arming ? ' panel__close--arming' : ''}`}
          onMouseDown={handleClose}
          title={arming ? 'Click again to kill this process' : 'Close panel'}
        >
          {arming ? 'kill?' : '×'}
        </button>
      </header>

      {live ? (
        <div
          className="panel__slot"
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
        <PanelCard session={session} />
      )}

      {/* East, south and south-east only — see ResizeEdge. Each handle is a
          child of .panel, so it rides .world's transform with the rest of the
          panel instead of sitting in screen pixels and drifting on zoom. */}
      {(['e', 's', 'se'] as const).map((edge) => (
        <div
          key={edge}
          className={`panel__resize panel__resize--${edge}`}
          onMouseDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onSelect(session.id)
            onBeginDrag({
              panelId: session.id,
              mode: { kind: 'resize', edge },
              originRect: rect,
              originWorld: { x: event.clientX, y: event.clientY }
            })
          }}
        />
      ))}
    </div>
  )
}

function PanelCard({ session }: { session: PanelSession }): JSX.Element {
  const lines = session.spawned ? session.handle.tail(CARD_LINES) : []
  return (
    <div className="panel__card">
      {session.spawned ? (
        lines.map((line, i) => (
          <div className="panel__card-line" key={i}>{line}</div>
        ))
      ) : (
        <div className="panel__card-idle">not started</div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: PanelStatus }): JSX.Element {
  switch (status.kind) {
    case 'idle':
      return <span className="badge badge--pending">idle</span>
    case 'starting':
      return <span className="badge badge--pending">starting…</span>
    case 'running':
      return <span className="badge badge--running">pid {status.pid}</span>
    case 'exited':
      return <span className="badge badge--exited">exited {status.code}</span>
    case 'error':
      return <span className="badge badge--error">{status.message}</span>
  }
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
