import { useEffect, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { JiraPanel } from '@renderer/panels/panels'
import type { WorkItem } from '@shared/work-item'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { JiraTicket } from '@renderer/jira/JiraTicket'
import { PanelPorts } from '@renderer/components/PanelPorts'

export function JiraNode(props: { panel: JiraPanel; selected: boolean; onSelect(id: string, additive?: boolean): void; onFocus(id: string): void; onBeginDrag(state: DragState): void; onClose(id: string): void; onSpawn(item: WorkItem): void; focusedId: string | null; restoreFocus(id: string): void; readOnly?: boolean; onBeginLink(panelId: string, event: ReactMouseEvent): void; linkTarget: boolean }): JSX.Element {
  const { panel } = props
  const [result, setResult] = useState<Awaited<ReturnType<typeof window.canvas.jira.list>> | null>(null)
  const load = (): void => { void window.canvas.jira.list().then(setResult).catch(() => setResult({ kind: 'unavailable', reason: 'Jira could not be reached.' })) }
  useEffect(() => { load() }, [])
  return <div className={`panel jira-node${props.selected ? ' panel--selected' : ''}`} data-panel-id={panel.rect.id} data-panel-kind="jira" data-link-target={props.linkTarget ? '' : undefined} style={{ left: panel.rect.x, top: panel.rect.y, width: panel.rect.w, height: panel.rect.h, zIndex: panel.z }}>
    <header className="panel__chrome" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); props.onSelect(panel.rect.id, e.shiftKey); props.onBeginDrag({ panelId: panel.rect.id, mode: { kind: 'move' }, originRect: panel.rect, originWorld: { x: e.clientX, y: e.clientY } }) }}>
      <span className="panel__title">{panel.title ?? 'Jira tickets'}</span><button type="button" className="jira-node__refresh" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); load() }}>⟳</button><button type="button" className="panel__close" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); props.onClose(panel.rect.id) }}>×</button>
    </header>
    <div className="jira-node__body" data-scroll-host onMouseDown={(e) => { e.stopPropagation(); props.onFocus(panel.rect.id) }}>
      {result === null ? <p>Loading Jira tickets…</p> : result.kind === 'items' ? result.items.length === 0 ? <p>No assigned tickets.</p> : result.items.map((item) => <JiraTicket
        key={item.id} item={item}
        focusedId={props.focusedId} restoreFocus={props.restoreFocus}
        onSpawn={props.onSpawn} onWritten={load}
      />) : <p className="jira-node__note">{result.reason}</p>}
    </div>
    {/* M24 (Task 7). The same block TerminalPanel carries, and for the
        same reasons: `links` lives on PanelBase, so this kind is already a
        valid endpoint and the gesture should reach it too. Suppressed
        under readOnly (the merged view). The PORT_MIN_SCALE cutoff is a
        canvas-host CLASS (`.canvas--ports-hidden`), not a `scale` prop —
        see PanelPorts.tsx's own comment. */}
    {!props.readOnly && (
      <PanelPorts panelId={panel.rect.id} onBeginLink={props.onBeginLink} />
    )}
  </div>
}
