import { useEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Annotation } from '@shared/annotations'
import { annotationPoint } from '@shared/annotations'
import type { Panel } from '@renderer/panels/panels'

/**
 * M93. THE ANNOTATION LAYER — labels in the margins, as SVG inside `.world`
 * beside `LinkLayer`, so they pan, zoom and clip with the canvas and cost the
 * hit test above them one node each.
 *
 * A world note sits at its point; a panel note sits at its panel's rect plus
 * an offset and draws a hairline leader to the panel's edge, so it reads as
 * "about this panel" and moves when the panel moves. Pointer events only on
 * the label: a click selects (the canvas owns Delete/Escape, as it does for a
 * selected edge), a double-click edits in place with a plain input — the
 * composer's Cmd+Z limit applies here too and is recorded, not solved.
 */

export interface AnnotationLayerProps {
  annotations: readonly Annotation[]
  panels: readonly Panel[]
  selectedId: string | null
  /** The note whose editor is open; the canvas sets it on placement and on double-click. */
  editingId: string | null
  onSelect?: (id: string | null) => void
  onBeginEdit?: (id: string) => void
  onCommitEdit: (id: string, text: string) => void
  onCancelEdit: (id: string) => void
}

const LEADER = 12

export function AnnotationLayer(props: AnnotationLayerProps): JSX.Element | null {
  const { annotations, panels, selectedId, editingId, onSelect, onBeginEdit, onCommitEdit, onCancelEdit } = props
  if (annotations.length === 0) return null
  return (
    <>
      <svg className="annotation-layer" aria-hidden="true">
        {annotations.map((a) => {
          const p = annotationPoint(a, panels)
          if (p === null) return null
          const anchor = a.anchor
          const panel = anchor.kind === 'panel' ? panels.find((x) => x.rect.id === anchor.panelId) : undefined
          // The leader runs from the label's own near edge (its vertical middle,
          // at the anchor's x) to the nearest point on the panel's edge, so a
          // note above a panel points down at it and one below points up — and
          // it never crosses the label it belongs to (the critic saw none).
          const mid = { x: p.x, y: p.y - LEADER }
          const leader = panel === undefined ? null : {
            x2: Math.max(panel.rect.x, Math.min(mid.x, panel.rect.x + panel.rect.w)),
            y2: Math.max(panel.rect.y, Math.min(mid.y, panel.rect.y + panel.rect.h))
          }
          return (
            <g key={a.id} className={`annotation${selectedId === a.id ? ' annotation--selected' : ''}`} data-annotation={a.id} data-annotation-kind={a.anchor.kind}>
              {leader !== null && <line className="annotation__leader" x1={mid.x} y1={mid.y} x2={leader.x2} y2={leader.y2} />}
              <foreignObject x={p.x} y={p.y - 22} width="1" height="1" className="annotation__host" style={{ overflow: 'visible' }}>
                {editingId === a.id
                  ? <NoteEditor initial={a.text} onCommit={(text) => onCommitEdit(a.id, text)} onCancel={() => onCancelEdit(a.id)} />
                  : (
                    <button
                      type="button"
                      className="annotation__label"
                      data-annotation-label
                      title={a.anchor.kind === 'panel' ? 'a note on this panel — click to select, double-click to edit' : 'a note on the canvas — click to select, double-click to edit'}
                      onMouseDown={(e) => { e.stopPropagation() }}
                      onClick={(e) => { e.stopPropagation(); onSelect?.(a.id) }}
                      onDoubleClick={(e) => { e.stopPropagation(); onBeginEdit?.(a.id) }}
                    >{a.text === '' ? '…' : a.text}</button>
                  )}
              </foreignObject>
            </g>
          )
        })}
      </svg>
    </>
  )
}

function NoteEditor({ initial, onCommit, onCancel }: { initial: string; onCommit: (text: string) => void; onCancel: () => void }): JSX.Element {
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); onCommit(text.trim()) }
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }
  return (
    <input
      ref={ref}
      className="annotation__editor"
      data-annotation-editor
      value={text}
      placeholder="a note…"
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKey}
      onBlur={() => onCommit(text.trim())}
      onMouseDown={(e) => e.stopPropagation()}
    />
  )
}
