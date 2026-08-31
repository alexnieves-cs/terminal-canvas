import { useEffect, useState, type JSX } from 'react'
import type { WorkPanel } from '@renderer/panels/panels'
import { WORK_PROVIDER_LABEL } from '@shared/work-item'
import type { WorkItem } from '@shared/work-item'
import type { DragState } from '@renderer/canvas/panel-interaction'

export function WorkNode(props: { panel: WorkPanel; selected: boolean; onSelect(id: string): void; onFocus(id: string): void; onBeginDrag(state: DragState): void; onClose(id: string): void; onSpawn(item: WorkItem): void }): JSX.Element {
  const { panel } = props
  const [result, setResult] = useState<Awaited<ReturnType<typeof window.canvas.work.list>> | null>(null)
  const load = (): void => { void window.canvas.work.list(panel.provider).then(setResult).catch(() => setResult({ kind: 'unavailable', reason: 'Jira could not be reached.' })) }
  useEffect(() => { load() }, [])
  return <div className={`panel work-node${props.selected ? ' panel--selected' : ''}`} data-panel-id={panel.rect.id} data-panel-kind="work" style={{ left: panel.rect.x, top: panel.rect.y, width: panel.rect.w, height: panel.rect.h, zIndex: panel.z }}>
    <header className="panel__chrome" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); props.onSelect(panel.rect.id); props.onBeginDrag({ panelId: panel.rect.id, mode: { kind: 'move' }, originRect: panel.rect, originWorld: { x: e.clientX, y: e.clientY } }) }}>
      <span className="panel__title">{panel.title ?? WORK_PROVIDER_LABEL[panel.provider]}</span><button type="button" className="file-node__refresh" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); load() }}>⟳</button><button type="button" className="panel__close" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); props.onClose(panel.rect.id) }}>×</button>
    </header>
    <div className="file-node__body" data-scroll-host onMouseDown={(e) => { e.stopPropagation(); props.onFocus(panel.rect.id) }}>
      {result === null ? <p>Loading Jira tickets…</p> : result.kind === 'groups' ? result.groups.flatMap((g) => g.items).length === 0 ? <p>No assigned tickets.</p> : result.groups.flatMap((g) => g.items).map((item) => <article className="work-node__item" key={item.id}><strong>{item.id}: {item.title}</strong><small>{item.state ?? 'No state'}{item.assignee ? ` · ${item.assignee}` : ''}</small><p>{item.description || 'No description.'}</p><button type="button" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); props.onSpawn(item) }}>Start session</button></article>) : <p className="file-node__note">{result.reason}</p>}
    </div>
  </div>
}
