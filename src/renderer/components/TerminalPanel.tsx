import { memo, useEffect, useRef, type JSX } from 'react'
import type { PanelSession, PanelStatus } from '@renderer/session/panel-session'
import type { WorldRect } from '@renderer/canvas/viewport'

export interface TerminalPanelProps {
  session: PanelSession
  rect: WorldRect
  selected: boolean
  interactive: boolean
  onSelect: (id: string) => void
  onFocus: (id: string) => void
  /** Called once the retained host is in the document, so it can be opened. */
  onSlotMount: (id: string) => void
  /** Called before the host leaves the document, so its context can be freed. */
  onSlotUnmount: (id: string) => void
}

const CARD_LINES = 6

function TerminalPanelImpl({
  session, rect, selected, interactive, onSelect, onFocus, onSlotMount, onSlotUnmount
}: TerminalPanelProps): JSX.Element {
  const slotRef = useRef<HTMLDivElement>(null)
  const live = session.tier === 'live'

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
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <header
        className="panel__chrome"
        onMouseDown={(event) => {
          // Chrome selects; body passes through. stopPropagation keeps the
          // canvas from reading this as a background click and deselecting.
          event.stopPropagation()
          onSelect(session.id)
        }}
      >
        <span className="panel__title">{session.spec.command}</span>
        <StatusBadge status={session.status} />
      </header>

      {live ? (
        <div
          className="panel__slot"
          ref={slotRef}
          onMouseDown={(event) => {
            event.stopPropagation()
            onFocus(session.id)
            // Outside the interaction band xterm's own coordinate math is off
            // by a factor of the zoom, so the click would land on the wrong
            // cell. Focus the panel and stop; typing still works, and the
            // correction lands in M4 with drag and resize.
            if (!interactive) event.preventDefault()
          }}
        />
      ) : (
        <PanelCard session={session} />
      )}
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

// Memoized for the reason PlaceholderPanel already documented: Canvas
// re-renders on every mousemove for the HUD cursor, and a 60Hz cascade into
// panels backed by WebGL contexts is a frame-rate cliff.
export const TerminalPanel = memo(TerminalPanelImpl)
