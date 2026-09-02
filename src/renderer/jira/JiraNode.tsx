import { useEffect, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { JiraPanel } from '@renderer/panels/panels'
import type { WorkItem } from '@shared/work-item'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { JiraTicket } from '@renderer/jira/JiraTicket'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { Refresh } from '@renderer/icons'

export function JiraNode(props: { panel: JiraPanel; selected: boolean; onSelect(id: string, additive?: boolean): void; onFocus(id: string): void; onBeginDrag(state: DragState): void; onClose(id: string): void; onSpawn(item: WorkItem): void; focusedId: string | null; restoreFocus(id: string): void; readOnly?: boolean; onBeginLink(panelId: string, event: ReactMouseEvent): void; linkTarget: boolean }): JSX.Element {
  const { panel } = props
  const [result, setResult] = useState<Awaited<ReturnType<typeof window.canvas.jira.list>> | null>(null)
  const load = (): void => { void window.canvas.jira.list().then(setResult).catch(() => setResult({ kind: 'unavailable', reason: 'Jira could not be reached.' })) }
  useEffect(() => { load() }, [])
  return (
    <PanelFrame
      id={panel.rect.id}
      kind="jira"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={props.readOnly ?? false}
      className="jira-node"
      title={panel.title ?? 'Jira tickets'}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
      close={props.readOnly === true ? null : { armed: false, title: 'Close', armedText: '', onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(panel.rect.id) } }}
      chrome={<button type="button" className="jira-node__refresh icon-button" title="Read Jira again" aria-label="Read Jira again" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); load() }}><Refresh /></button>}
    >
    <div className="pf__body pf__body--text jira-node__body" data-scroll-host onMouseDown={(e) => { e.stopPropagation(); props.onFocus(panel.rect.id) }}>
      {result === null ? <p>Loading Jira tickets…</p> : result.kind === 'items' ? result.items.length === 0 ? <p>No assigned tickets.</p> : result.items.map((item) => <JiraTicket
        key={item.id} item={item}
        focusedId={props.focusedId} restoreFocus={props.restoreFocus}
        onSpawn={props.onSpawn} onWritten={load}
      />) : <p className="pf__note jira-node__note">{result.reason}</p>}
    </div>
    </PanelFrame>
  )
}
