import type { JSX } from 'react'
import {
  SHAPE_FILLS, SHAPE_FORMS, SHAPE_INKS, SHAPE_STROKES, shapeFormWord,
  type ShapeFill, type ShapeForm, type ShapeInk, type ShapeRecord, type ShapeStroke
} from '@shared/flowchart'
import { shapeDetail, shapeOutline } from '@shared/flowchart-geometry'
import type { ShapeStylePatch } from '@renderer/canvas/useFlowchartVerbs'

/**
 * M388. A shape's configuration, in the inspector — where the density layers
 * put configuration (never on the shape at rest, which is its label alone).
 * Four rows of swatches on ONE grid (form, fill, line, text), then the
 * chart's acts (arrange, export, work). Each swatch is a real button
 * with its name as its label and `aria-pressed` for the current value, and
 * each press is ONE `setShapeStyle` — one history entry, the same verb the
 * palette's `shape-style` and an agent's line reach.
 */
export type ShapeChartAct = 'layout-down' | 'layout-right' | 'export-mermaid' | 'export-svg' | 'plan'

export function ShapeInspector({ shape, onStyle, onChart }: { shape: ShapeRecord; onStyle: (patch: ShapeStylePatch) => void; onChart?: (act: ShapeChartAct) => void }): JSX.Element {
  const fill = shape.fill ?? 'plain'
  const stroke = shape.stroke ?? (shape.form === 'text' ? 'none' : 'line')
  const ink = shape.ink ?? 'fg'
  return (
    <div className="shape-inspector" data-shape-inspector>
      <Row label="Shape">
        {SHAPE_FORMS.map((form) => (
          <button key={form} type="button" className="shape-inspector__swatch shape-inspector__swatch--form" aria-pressed={shape.form === form} aria-label={shapeFormWord(form)} title={shapeFormWord(form)} data-shape-form-choice={form}
            onClick={() => { if (shape.form !== form) onStyle({ form }) }}>
            <FormGlyph form={form} />
          </button>
        ))}
      </Row>
      <Row label="Fill">
        {SHAPE_FILLS.map((f: ShapeFill) => (
          <button key={f} type="button" className="shape-inspector__swatch shape-inspector__swatch--fill" aria-pressed={fill === f} aria-label={`${f} fill`} title={f} data-shape-fill-choice={f}
            onClick={() => { if (fill !== f) onStyle({ fill: f }) }}>
            <span className="shape-inspector__chip" data-fill={f} />
          </button>
        ))}
      </Row>
      <Row label="Line">
        {SHAPE_STROKES.map((s: ShapeStroke) => (
          <button key={s} type="button" className="shape-inspector__swatch" aria-pressed={stroke === s} aria-label={`${s} line`} title={s} data-shape-stroke-choice={s}
            onClick={() => { if (stroke !== s) onStyle({ stroke: s }) }}>
            <span className="shape-inspector__chip shape-inspector__chip--line" data-stroke={s} />
          </button>
        ))}
      </Row>
      <Row label="Text">
        {SHAPE_INKS.map((i: ShapeInk) => (
          <button key={i} type="button" className="shape-inspector__swatch" aria-pressed={ink === i} aria-label={i === 'fg' ? 'strong text' : 'quiet text'} title={i === 'fg' ? 'strong' : 'quiet'} data-shape-ink-choice={i}
            onClick={() => { if (ink !== i) onStyle({ ink: i }) }}>
            <span className="shape-inspector__ink" data-ink={i}>Aa</span>
          </button>
        ))}
      </Row>
      {onChart !== undefined && (
        <>
          {/* M396 (the critic): Start work is a different KIND of act from
              arranging or exporting — it proposes real work — so it has its
              own row, never a button among the exports. */}
          <div className="shape-inspector__row" role="group" aria-label="Arrange">
            <span className="shape-inspector__label">Arrange</span>
            <div className="shape-inspector__acts">
              <button type="button" className="shape-inspector__act" data-shape-chart="layout-down" title="Lay out this chart, top to bottom" onClick={() => { onChart('layout-down') }}>Lay out ↓</button>
              <button type="button" className="shape-inspector__act" data-shape-chart="layout-right" title="Lay out this chart, left to right" onClick={() => { onChart('layout-right') }}>Lay out →</button>
            </div>
          </div>
          <div className="shape-inspector__row" role="group" aria-label="Export">
            <span className="shape-inspector__label">Export</span>
            <div className="shape-inspector__acts">
              <button type="button" className="shape-inspector__act" data-shape-chart="export-mermaid" title="Export the chart as Mermaid — secrets scrubbed" onClick={() => { onChart('export-mermaid') }}>Mermaid…</button>
              <button type="button" className="shape-inspector__act" data-shape-chart="export-svg" title="Export the chart as SVG — text only, secrets scrubbed" onClick={() => { onChart('export-svg') }}>SVG…</button>
            </div>
          </div>
          <div className="shape-inspector__row" role="group" aria-label="Work">
            <span className="shape-inspector__label">Work</span>
            <div className="shape-inspector__acts">
              <button type="button" className="shape-inspector__act" data-shape-chart="plan" title="New task from this chart — its steps become a task plan; nothing runs until you press Start" onClick={() => { onChart('plan') }}>New task from this chart…</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: JSX.Element[] }): JSX.Element {
  return (
    <div className="shape-inspector__row" role="group" aria-label={label}>
      <span className="shape-inspector__label">{label}</span>
      <div className="shape-inspector__swatches">{children}</div>
    </div>
  )
}

/** The form's own outline at swatch size — the same path the canvas draws, so the picker cannot drift from the shape. */
function FormGlyph({ form }: { form: ShapeForm }): JSX.Element {
  const w = 22
  const h = form === 'junction' ? 12 : 14
  const d = form === 'text' ? '' : shapeOutline(form, w, h)
  const detail = shapeDetail(form, w, h)
  return (
    <svg width={w + 2} height={16} viewBox={`-1 ${-(16 - h) / 2} ${w + 2} 16`} aria-hidden="true" className="shape-inspector__glyph">
      {d !== '' ? <path d={d} /> : <text x={w / 2} y={h / 2 + 4} textAnchor="middle">T</text>}
      {detail !== '' && <path d={detail} />}
    </svg>
  )
}
