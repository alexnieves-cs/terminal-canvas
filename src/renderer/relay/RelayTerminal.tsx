import { useEffect, useRef, useState, type JSX } from 'react'
import type { RelayView } from '@shared/ipc-contract'
import { relayActions, relayControlLine, type RelayAction } from './relay-gate'
import { createRelayTerminal, type RelayOpen, type RelayTerminal as Controller } from './relay-terminal'

/**
 * A relay terminal's body: the xterm, and a strip that says who is in control
 * and offers exactly the moves the relay would accept (relay-gate.ts).
 *
 * The controller outlives this component (relay-terminal.ts's header): the
 * registry below keeps one per panel id, and only `disposeRelayTerminal`
 * detaches from the relay — an unmount just takes the host away.
 */
const controllers = new Map<string, Controller>()

export function relayTerminalFor(panelId: string): Controller {
  let c = controllers.get(panelId)
  if (c === undefined) { c = createRelayTerminal(panelId); controllers.set(panelId, c) }
  return c
}

/** Closing the panel for good: detach from the relay and free the xterm. */
export function disposeRelayTerminal(panelId: string): void {
  controllers.get(panelId)?.dispose()
  controllers.delete(panelId)
}

const short = (userId: string): string => userId.slice(0, 8)

export function RelayTerminal(props: { panelId: string; open: RelayOpen; nameOf?: (userId: string) => string }): JSX.Element {
  const { panelId, open } = props
  const nameOf = props.nameOf ?? short
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState<RelayView | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)

  useEffect(() => {
    const c = relayTerminalFor(panelId)
    const off = c.onView(setView)
    setView(c.view())
    if (hostRef.current !== null) c.mount(hostRef.current)
    void c.open(open).then((r) => setRefusal(r.kind === 'refused' ? r.reason : null))
    return () => { off(); c.unmount() }
    // `open` is read once per panel: the controller ignores a second open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId])

  const act = (a: RelayAction): void => {
    const relay = window.canvas.relay
    switch (a.kind) {
      case 'request': case 'release': case 'revoke': void relay.control({ panelId, action: a.kind }); return
      case 'grant': case 'deny': void relay.control({ panelId, action: a.kind, userId: a.userId }); return
      case 'kill': void relay.kill(panelId); return
      case 'requested': return
    }
  }
  const label = (a: RelayAction): string => {
    switch (a.kind) {
      case 'request': return 'Request control'
      case 'requested': return 'Requested…'
      case 'release': return 'Release control'
      case 'revoke': return 'Take control back'
      case 'grant': return `Give control to ${nameOf(a.userId)}`
      case 'deny': return `Decline ${nameOf(a.userId)}`
      case 'kill': return 'End session'
    }
  }

  const line = refusal ?? relayControlLine(view, nameOf)
  const actions = relayActions(view)
  const watching = view !== null && view.connection === 'open' && !view.canType && !view.exited
  return (
    <div className="relay-term" data-relay-panel={panelId} data-can-type={view?.canType === true ? 'true' : 'false'}>
      <div className="relay-term__strip" role="status">
        <span className="relay-term__line">{line}</span>
        {view !== null && view.program !== null && <span className="relay-term__program">{view.program}</span>}
        <span className="relay-term__actions">
          {actions.map((a) => (
            <button
              key={`${a.kind}:${'userId' in a ? a.userId : ''}`}
              type="button"
              className={`relay-term__btn relay-term__btn--${a.kind}`}
              disabled={a.kind === 'requested'}
              onClick={() => act(a)}
            >{label(a)}</button>
          ))}
        </span>
      </div>
      <div className={`relay-term__screen${watching ? ' relay-term__screen--watching' : ''}`} ref={hostRef} />
    </div>
  )
}
