import { useEffect, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { RelayView } from '@shared/ipc-contract'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { shellControl } from '@renderer/shell/shell-control'
import type { DragState } from '@renderer/canvas/panel-interaction'
import type { RelayPanel } from '@renderer/panels/panels'
import { RelayTerminal, disposeRelayTerminal, relayTerminalFor } from './RelayTerminal'
import { relayMayRestart, relayOpenOf } from './relay-gate'

/**
 * M338. The relay terminal as a canvas object: PanelFrame for selection, drag,
 * resize, marks, grouping and undo; RelayTerminal (M335) for the body.
 *
 * It KEEPS its header (the frame rule, CLAUDE.md): the header says the one
 * fact the body cannot — that this terminal runs on the relay, not this Mac —
 * and holds the only verb the body does not, starting a new session once the
 * old one has ended. A chromeless frame would read as a local terminal.
 *
 * The record is the re-attach: the first session id the relay mints is
 * written back (`onSession`), so a relaunch ATTACHES rather than starting a
 * second process. A merged (read-only) view never opens anything — a lane is
 * a picture of another workspace, and starting a remote shell because a
 * person glanced at one is exactly what "inert until a person looks" forbids.
 */
export interface RelayNodeProps {
  panel: RelayPanel
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  readOnly?: boolean
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  linkTarget: boolean
  /** The relay minted (or, with undefined, forgot) this panel's session: write it to the record. */
  onSession: (panelId: string, sessionId: string | undefined) => void
  /** A person's name for a user id, from presence when it knows one. */
  nameOf?: (userId: string) => string
}

export function RelayNode(props: RelayNodeProps): JSX.Element {
  const { panel } = props
  const id = panel.rect.id
  const [view, setView] = useState<RelayView | null>(null)
  // A new generation remounts the body onto a fresh controller: the old one
  // is disposed (detached) first, and `open` runs once per controller.
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (props.readOnly === true) return
    const c = relayTerminalFor(id)
    setView(c.view())
    return c.onView((v) => {
      setView(v)
      if (v !== null && v.sessionId !== null && v.sessionId !== panel.relay.sessionId) props.onSession(id, v.sessionId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, generation, props.readOnly, panel.relay.sessionId])

  const restart = (): void => {
    disposeRelayTerminal(id)
    props.onSession(id, undefined)
    setView(null)
    setGeneration((g) => g + 1)
  }

  const title = panel.title ?? `relay · ${panel.relay.program}`
  return (
    <PanelFrame
      id={id}
      kind="relay"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={props.readOnly === true}
      className="relay-node"
      rootAttrs={{ 'data-relay-node': '', 'data-relay-program': panel.relay.program, 'data-relay-shared': panel.relay.shareId === undefined ? 'false' : 'true', title: `${panel.relay.program} on the relay${panel.relay.shareId === undefined ? '' : ' · shared with this workspace'}` }}
      title={title}
      chrome={props.readOnly === true || !relayMayRestart(view) ? undefined : (
        <button type="button" className="pf__verb pf__verb--word" data-relay-restart
          title={`Start a new ${panel.relay.program} session on the relay`}
          {...shellControl(restart)}>New session</button>
      )}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
      close={props.readOnly === true ? null : { armed: false, title: 'Close', armedText: '', onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(id) } }}
    >
      <div className="pf__body relay-node__body" onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }}>
        {props.readOnly === true
          ? <p className="pf__note">A relay terminal. Leave the merged view to attach to it.</p>
          : <RelayTerminal key={generation} panelId={id} open={relayOpenOf(panel)} {...(props.nameOf === undefined ? {} : { nameOf: props.nameOf })} />}
      </div>
    </PanelFrame>
  )
}
