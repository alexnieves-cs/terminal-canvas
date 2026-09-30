import { useEffect, useState, type JSX } from 'react'
import { CONNECTOR_LABEL_MAX, SHAPE_STROKES, type Connector, type Ends, type Route, type ShapeStroke } from '@shared/flowchart'
import type { ConnectorPatch } from '@renderer/canvas/useConnectors'

/**
 * M389. A selected connector's configuration, in the inspector: its route,
 * its arrowheads, its line and its label — and Remove. Every control is one
 * `patch` (one history entry); the same verb the palette's `connector-style`
 * and an agent's line reach.
 */
export interface ConnectorInspectorProps {
  connector: Connector
  /** "decision: Is it valid? → process: Build" — both ends by their own names. */
  fromName: string
  toName: string
  onPatch: (patch: ConnectorPatch) => void
  onRemove: () => void
}

const ROUTE_WORDS: Record<Route, string> = { orthogonal: 'Elbow', straight: 'Straight', curved: 'Curve' }
const ENDS_WORDS: Record<Ends, string> = { none: 'None', end: 'To', start: 'From', both: 'Both' }

export function ConnectorInspector({ connector, fromName, toName, onPatch, onRemove }: ConnectorInspectorProps): JSX.Element {
  const route = connector.route ?? 'orthogonal'
  const ends = connector.ends ?? 'end'
  const stroke = connector.stroke ?? 'line'
  const [label, setLabel] = useState(connector.label ?? '')
  // A label changed elsewhere (in place on the canvas, an undo) replaces the
  // draft — the field shows the record, not a stale copy of it.
  useEffect(() => { setLabel(connector.label ?? '') }, [connector.label])
  const commit = (): void => { if ((connector.label ?? '') !== label.trim()) onPatch({ label }) }
  return (
    <div className="shape-inspector connector-inspector" data-connector-inspector={connector.id}>
      <div className="shell__region-title">Connector</div>
      <p className="connector-inspector__ends"><span>{fromName}</span> → <span>{toName}</span></p>
      <div className="shape-inspector__row" role="group" aria-label="Route">
        <span className="shape-inspector__label">Route</span>
        <div className="shape-inspector__swatches">
          {(['orthogonal', 'straight', 'curved'] as const).map((r) => (
            <button key={r} type="button" className="shape-inspector__swatch" aria-pressed={route === r} aria-label={`${ROUTE_WORDS[r]} route`} data-connector-route={r} onClick={() => { if (route !== r) onPatch({ route: r }) }}>{ROUTE_WORDS[r]}</button>
          ))}
        </div>
      </div>
      <div className="shape-inspector__row" role="group" aria-label="Arrows">
        <span className="shape-inspector__label">Arrows</span>
        <div className="shape-inspector__swatches">
          {(['end', 'start', 'both', 'none'] as const).map((e) => (
            <button key={e} type="button" className="shape-inspector__swatch" aria-pressed={ends === e} aria-label={`arrows: ${ENDS_WORDS[e]}`} data-connector-ends={e} onClick={() => { if (ends !== e) onPatch({ ends: e }) }}>{ENDS_WORDS[e]}</button>
          ))}
        </div>
      </div>
      <div className="shape-inspector__row" role="group" aria-label="Line">
        <span className="shape-inspector__label">Line</span>
        <div className="shape-inspector__swatches">
          {SHAPE_STROKES.filter((s) => s !== 'none').map((s: ShapeStroke) => (
            <button key={s} type="button" className="shape-inspector__swatch" aria-pressed={stroke === s} aria-label={`${s} line`} title={s} data-connector-stroke={s} onClick={() => { if (stroke !== s) onPatch({ stroke: s }) }}>
              <span className="shape-inspector__chip shape-inspector__chip--line" data-stroke={s} />
            </button>
          ))}
          <button type="button" className="shape-inspector__swatch" aria-pressed={connector.dashed === true} data-connector-dashed onClick={() => { onPatch({ dashed: connector.dashed !== true }) }}>Dashed</button>
        </div>
      </div>
      <label className="shape-inspector__row">
        <span className="shape-inspector__label">Label</span>
        <input
          className="connector-inspector__label"
          value={label}
          maxLength={CONNECTOR_LABEL_MAX}
          placeholder="none — double-click the line to add one"
          onChange={(e) => { setLabel(e.target.value) }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        />
      </label>
      <div className="connector-inspector__actions">
        <button type="button" className="inspector__action inspector__action--quiet" data-connector-remove onClick={onRemove}>Remove connector</button>
      </div>
    </div>
  )
}
