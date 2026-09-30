import { memo, useLayoutEffect, useRef, type JSX, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { CONNECTOR_LABEL_MAX } from '@shared/flowchart'
import { arrowHead, type ConnectorPath } from '@shared/flowchart-geometry'
import type { ConnectorView } from './connector-model'

/**
 * M389. THE CONNECTOR LAYER — every diagram arrow, in one SVG inside `.world`
 * beneath the panels and shapes (z-index 0, the link layer's slot), plus the
 * labels in a sibling div so they are HTML text a person can edit in place.
 *
 * It inherits the link layer's three hard-won rules (docs/load-bearing.md):
 * - the SVG is 1px, never 0px — a zero-sized root under `.world`'s
 *   will-change layer paints none of its overflow (lb :3468);
 * - the layer is deaf to the pointer and only the hit strokes and labels opt
 *   back in, and they never stop propagation: the canvas's background
 *   mousedown reads no `event.target`, so a press on a line behaves like a
 *   press on the ground (lb :1143);
 * - a connector is selected on CLICK, never mousedown — the background's
 *   mousedown clears the selection a moment later (lb :3453).
 */

export interface ConnectorGhost {
  /** The routed path from the source port to the cursor (or to the target's port). */
  path: ConnectorPath
  /** Whether a release now lands on something. */
  landing: boolean
}

export interface ConnectorLayerProps {
  views: readonly ConnectorView[]
  selectedId: string | null
  editingId: string | null
  readOnly: boolean
  ghost: ConnectorGhost | null
  onSelect: (id: string, event: ReactMouseEvent) => void
  onEditLabel: (id: string) => void
  onCommitLabel: (id: string, label: string) => void
}

export const ConnectorLayer = memo(function ConnectorLayer(props: ConnectorLayerProps): JSX.Element {
  const { views, selectedId, editingId, readOnly, ghost, onSelect, onEditLabel, onCommitLabel } = props
  return (
    <>
      <svg className="connector-layer" width="1" height="1" aria-hidden="true">
        {views.map((v) => (
          <ConnectorLine key={v.id} view={v} selected={selectedId === v.id} readOnly={readOnly} onSelect={onSelect} onEditLabel={onEditLabel} />
        ))}
        {ghost !== null && (
          <g className={`connector connector--ghost${ghost.landing ? ' connector--landing' : ''}`}>
            <path className="connector__line" d={ghost.path.d} />
            <path className="connector__head" d={arrowHead(ghost.path.points[ghost.path.points.length - 1], ghost.path.endAngle)} />
          </g>
        )}
      </svg>
      <div className="connector-labels" aria-hidden={views.every((v) => v.connector.label === undefined) && editingId === null ? true : undefined}>
        {views.map((v) => (v.connector.label !== undefined || editingId === v.id) && (
          editingId === v.id && !readOnly
            ? <LabelEditor key={v.id} view={v} onCommit={onCommitLabel} />
            : (
              <div
                key={v.id}
                className={`connector-label${selectedId === v.id ? ' connector-label--selected' : ''}`}
                data-connector-label={v.id}
                style={{ left: v.path.labelAt.x, top: v.path.labelAt.y }}
                onClick={(event) => { onSelect(v.id, event) }}
                onDoubleClick={(event) => { if (!readOnly) { event.stopPropagation(); onEditLabel(v.id) } }}
              >
                {v.connector.label}
              </div>
            )
        ))}
      </div>
    </>
  )
})

const ConnectorLine = memo(function ConnectorLine({ view, selected, readOnly, onSelect, onEditLabel }: {
  view: ConnectorView
  selected: boolean
  readOnly: boolean
  onSelect: ConnectorLayerProps['onSelect']
  onEditLabel: ConnectorLayerProps['onEditLabel']
}): JSX.Element {
  const { path, connector } = view
  const ends = connector.ends ?? 'end'
  const pts = path.points
  return (
    <g
      className={`connector${selected ? ' connector--selected' : ''}`}
      data-connector-id={view.id}
      data-connector-from={view.from}
      data-connector-to={view.to}
      data-stroke={connector.stroke ?? 'line'}
      data-dashed={connector.dashed === true ? '' : undefined}
    >
      <path className="connector__line" d={path.d} />
      {(ends === 'end' || ends === 'both') && <path className="connector__head" d={arrowHead(pts[pts.length - 1], path.endAngle)} />}
      {(ends === 'start' || ends === 'both') && <path className="connector__head" d={arrowHead(pts[0], path.startAngle)} />}
      <path
        className="connector__hit"
        d={path.d}
        data-connector-hit={view.id}
        onClick={(event) => { onSelect(view.id, event) }}
        onDoubleClick={(event) => { if (!readOnly) { event.stopPropagation(); onEditLabel(view.id) } }}
      />
    </g>
  )
})

/**
 * A connector's label, typed where it sits. An input (one line: a label on a
 * line is a few words), stopping every key at the field, committed on Enter,
 * Escape or a click away — an empty value removes the label.
 */
function LabelEditor({ view, onCommit }: { view: ConnectorView; onCommit: ConnectorLayerProps['onCommitLabel'] }): JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true })
    ref.current?.select()
  }, [])
  const close = (): void => {
    if (done.current) return
    done.current = true
    onCommit(view.id, (ref.current?.value ?? '').trim().slice(0, CONNECTOR_LABEL_MAX))
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation()
    if (event.key === 'Enter' || event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); close() }
  }
  return (
    <div className="connector-label connector-label--editing" style={{ left: view.path.labelAt.x, top: view.path.labelAt.y }}>
      <input
        ref={ref}
        className="connector-label__input"
        defaultValue={view.connector.label ?? ''}
        maxLength={CONNECTOR_LABEL_MAX}
        aria-label="Connector label"
        spellCheck={false}
        size={Math.max(4, (view.connector.label ?? '').length + 1)}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => { event.stopPropagation() }}
        onBlur={close}
      />
    </div>
  )
}
