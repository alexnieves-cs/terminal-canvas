import { useEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Annotation } from '@shared/annotations'
import { annotationPoint } from '@shared/annotations'
import type { Panel } from '@renderer/panels/panels'
import { smoothStrokePath } from './viewport'
import { fieldKeepsKey } from './draft-focus'

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
  /** M155. The stroke in progress, world coordinates; painted live, never stored. */
  draft?: Array<[number, number]> | null
  /** M155. In the merged view a stroke is not selectable: its hit path takes no pointer, so a click there reaches the ground. */
  merged?: boolean
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
  const { annotations, panels, selectedId, editingId, onSelect, onBeginEdit, onCommitEdit, onCancelEdit, draft, merged } = props
  if (annotations.length === 0 && !draft) return null
  return (
    <>
      <svg className="annotation-layer" aria-hidden="true">
        {draft && draft.length > 1 && <path className="annotation__ink annotation__ink--draft" d={smoothStrokePath(draft)} />}
        {annotations.map((a) => {
          const p = annotationPoint(a, panels)
          if (p === null) return null
          const anchor = a.anchor
          // M155. INK: the stroke's points are relative to the anchor point;
          // an SVG path with round caps and joins in the label's own colour, a
          // wider transparent HIT path beneath for selection (a 3px line is
          // not a target), the label's leader and editor never. M395: the
          // path is the smooth curve THROUGH the stored points (viewport.ts's
          // `smoothStrokePath`) — one `d` for the ink and its hit path, so a
          // click lands on what is painted; the points are not touched.
          if (a.ink !== undefined) {
            const d = smoothStrokePath(a.ink.points.map(([x, y]) => [p.x + x, p.y + y] as [number, number]))
            return (
              <g key={a.id} className={`annotation${selectedId === a.id ? ' annotation--selected' : ''}`} data-annotation={a.id} data-annotation-kind={a.anchor.kind} data-annotation-ink="true">
                <path className={`annotation__hit${merged ? ' annotation__hit--inert' : ''}`} data-annotation-hit d={d}
                  onMouseDown={(e) => { e.stopPropagation() }}
                  onClick={(e) => { e.stopPropagation(); onSelect?.(a.id) }} />
                <path className="annotation__ink" d={d} style={{ strokeWidth: a.ink.width }} />
              </g>
            )
          }
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

/**
 * M395. The editor SETTLES exactly once — Enter, Escape, a blur, or (new) its
 * own unmount. A press that opens the next label, or Done on the strip, runs
 * a discrete-event render that unmounts this editor BEFORE the browser moves
 * focus, so no blur ever fires: the first cut left each such label empty and
 * printed it as "…" (the live audit counted seven after Done). Unmounting now
 * commits what was typed, and an empty commit removes the label (Canvas's
 * commitAnnotation). `settled` keeps a commit or a cancel from being followed
 * by a second one on the way out.
 */
function NoteEditor({ initial, onCommit, onCancel }: { initial: string; onCommit: (text: string) => void; onCancel: () => void }): JSX.Element {
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const settled = useRef(false)
  const live = useRef({ text, onCommit })
  live.current = { text, onCommit }
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  useEffect(() => () => {
    if (settled.current) return
    settled.current = true
    live.current.onCommit(live.current.text.trim())
  }, [])
  const commit = (): void => {
    if (settled.current) return
    settled.current = true
    onCommit(text.trim())
  }
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    // M395. Bare keys stop here; a ⌘ chord that is not a text edit reaches the canvas.
    if (fieldKeepsKey(e)) e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { e.preventDefault(); settled.current = true; onCancel() }
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
      onBlur={commit}
      onMouseDown={(e) => e.stopPropagation()}
    />
  )
}
