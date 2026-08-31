import { useCallback, useEffect, useState, type JSX } from 'react'
import type { WorkPanel } from '@renderer/panels/panels'
import type { WorkItem, WorkListResult, WorkProvider } from '@shared/work-item'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { buildWorkNodeModel } from './work-node-model'

/**
 * A work panel: no PanelSession, no xterm, no process. It never reaches
 * `assignTiers` or `registry.ensure` at all — `Canvas.tsx` partitions on kind
 * before tiering, so the guarantee is STRUCTURAL rather than a guard somebody
 * has to remember at five separate sites.
 *
 * Every decision about WHAT to render lives in `work-node-model.ts`, which is
 * pure and checked in the plain-node tier. This file is the painting.
 */
export function WorkNode(props: {
  panel: WorkPanel
  selected: boolean
  onSelect(id: string): void
  onFocus(id: string): void
  onBeginDrag(state: DragState): void
  onClose(id: string): void
  onSpawn(item: WorkItem): void
  onConnect(provider: WorkProvider): void
}): JSX.Element {
  const { panel } = props
  const [result, setResult] = useState<WorkListResult | null>(null)

  // Cleared to null BEFORE the request, so a refresh renders the model's
  // in-flight note rather than leaving the previous answer on screen while a
  // new one is fetched — the stale-render failure verify:panels 100b records
  // for the review pane, reached through a refresh instead of a selection.
  const load = useCallback((): void => {
    setResult(null)
    void window.canvas.work
      .list(panel.provider)
      .then(setResult)
      .catch(() => setResult({ kind: 'unavailable', reason: 'The request could not be made.' }))
  }, [panel.provider])

  useEffect(() => { load() }, [load])

  const model = buildWorkNodeModel(panel.provider, result, panel.title)

  return (
    <div
      className={`panel work-node${props.selected ? ' panel--selected' : ''}`}
      data-panel-id={panel.rect.id}
      data-panel-kind="work"
      data-work-provider={panel.provider}
      style={{ left: panel.rect.x, top: panel.rect.y, width: panel.rect.w, height: panel.rect.h, zIndex: panel.z }}
    >
      <header
        className="panel__chrome"
        onMouseDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
          props.onSelect(panel.rect.id)
          props.onBeginDrag({ panelId: panel.rect.id, mode: { kind: 'move' }, originRect: panel.rect, originWorld: { x: e.clientX, y: e.clientY } })
        }}
      >
        <span className="panel__title">{model.heading}</span>
        <button
          type="button"
          className="file-node__refresh"
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); load() }}
        >⟳</button>
        <button
          type="button"
          className="panel__close"
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); props.onClose(panel.rect.id) }}
        >×</button>
      </header>
      {/* data-scroll-host is what shouldYieldWheel's rule 3 asks the DOM
          rather than the panel model — each kind renders the marker on the
          element that actually scrolls, or does not render it at all. */}
      <div
        className="file-node__body"
        data-scroll-host
        onMouseDown={(e) => { e.stopPropagation(); props.onFocus(panel.rect.id) }}
      >
        {model.note !== null ? <p className="file-node__note">{model.note}</p> : null}
        {model.connectable ? (
          <button
            type="button"
            className="work-node__connect"
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); props.onConnect(panel.provider) }}
          >Connect</button>
        ) : null}
        {model.groups.map((group) => (
          <section className="work-node__group" key={group.label}>
            <h3 className="work-node__group-label">{group.label}</h3>
            {group.rows.map((row) => (
              <article className="work-node__item" key={row.id}>
                <strong>{row.id}: {row.title}</strong>
                <small>{row.meta}</small>
                <p>{row.description || 'No description.'}</p>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    // Reconstructed from the ROW rather than the model holding
                    // a second copy of the adapter's own list: WorkNodeRow
                    // deliberately carries everything the spawn needs, so
                    // there is one list on screen and one list in memory.
                    props.onSpawn({ id: row.id, title: row.title, description: row.description, assignee: null, state: null, url: row.url })
                  }}
                >Start session</button>
              </article>
            ))}
            {group.note !== null ? <p className="file-node__note">{group.note}</p> : null}
          </section>
        ))}
      </div>
    </div>
  )
}
