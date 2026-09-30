import { memo, useEffect, useLayoutEffect, useMemo, useRef, type JSX, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { normaliseShapeText, shapeFormWord, type Port } from '@shared/flowchart'
import { portPoint, shapeDetail, shapeOutline } from '@shared/flowchart-geometry'
import type { ShapePanel } from '@renderer/panels/panels'
import type { ResizeEdge } from '@renderer/canvas/panel-interaction'
import { setEditingShape, useEditingShape } from './shape-edit-store'
import { useShownState } from '@renderer/panels/useShownState'
import type { StateInput } from '@renderer/panels/panel-state'

/**
 * M388. THE SHAPE LAYER — every flowchart shape on the canvas, in one memoised
 * component inside `.world` (docs/build-log/m388-m396-ledger.md, D1).
 *
 * WHY NOT PanelFrame. A frame is ~20 DOM nodes and ~6 store subscriptions per
 * object, is not memoised, reads computed style on every render, clamps to
 * 200x160 and swaps its body for a glyph card at far zoom. A shape at rest is
 * FOUR nodes here (the box, its svg, the outline, the label); handles and
 * ports exist only on the one selected shape. The world's transform is CSS on
 * `.world`, so a pan or a zoom re-renders nothing in this layer: its props are
 * the shape list (a new array only when a shape changed), the selection and
 * stable callbacks. Each shape is memoised on its own panel object, which
 * setPanelRect replaces only for the shape that moved.
 *
 * NO WRAPPER ELEMENT. The layer returns a fragment, so each shape's zIndex is
 * `Panel.z` in `.world`'s own stacking context — interleaved with panels by
 * the one stacking rule the canvas has (lb :243), never a layer on top.
 *
 * CHROMELESS, by M236's test: the shape IS its content, and removing chrome
 * hides nothing. The handles and ports are ABSOLUTELY positioned over the box
 * and never take its layout, so nothing refits under a hover.
 *
 * `data-panel-id` is kept on the box: the drag hook finds a gesture's element
 * by it, and the checks select on it as they do every other kind.
 */

export interface ShapeLayerProps {
  shapes: readonly ShapePanel[]
  selectedIds: ReadonlySet<string>
  /** The merged view: geometry is not this canvas's to write, and labels are not either. */
  readOnly: boolean
  /** A press on a shape's body: select it (additive with ⇧) and begin a move. */
  onPress: (id: string, event: ReactMouseEvent) => void
  /** A press on a resize handle. */
  onResize: (id: string, edge: ResizeEdge, event: ReactMouseEvent) => void
  /** M389. A press on a port: begin a connector from here. Absent → no ports drawn. */
  onPort?: (id: string, port: Port, event: ReactMouseEvent) => void
  /** The label's editor closed. `how` says why, so Tab can make the next step (M390). */
  onCommitText: (id: string, text: string, how: 'blur' | 'escape' | 'tab' | 'shift-tab') => void
  /** M389. The shape a connector being drawn would land on. */
  dropTargetId?: string | null
  /** M393. Each bound shape's live object: its id, its state input as the rail builds it, and its name. */
  live?: ReadonlyMap<string, LiveBinding>
}

/**
 * M393/M394. What a shape is live FOR: a live object it is joined to (Canvas
 * derives it from the connectors and the rail's own rows — the word comes
 * from the panel's own subscriptions), or the plan step it became (the word
 * and tone come from M327's planView, already derived).
 */
export type LiveBinding =
  | { kind: 'panel'; panelId: string; input: StateInput; name: string }
  | { kind: 'step'; word: string; tone: string; name: string }

/** The eight handles, clockwise from the top. A handle is counter-scaled in CSS (`--chrome-scale`), so it stays grabbable zoomed out. */
const HANDLES: readonly ResizeEdge[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

export const ShapeLayer = memo(function ShapeLayer(props: ShapeLayerProps): JSX.Element {
  const { shapes, selectedIds, readOnly, onPress, onResize, onPort, onCommitText, dropTargetId, live } = props
  const editing = useEditingShape()
  // Handles only when exactly one shape is the selection: two or more resize
  // nothing (a resize is a one-member gesture — Canvas's onBeginDrag).
  const soleSelected = selectedIds.size === 1 ? [...selectedIds][0] : null
  return (
    <>
      {shapes.map((panel) => (
        <ShapeNode
          key={panel.rect.id}
          panel={panel}
          selected={selectedIds.has(panel.rect.id)}
          handles={!readOnly && soleSelected === panel.rect.id && editing !== panel.rect.id}
          editing={!readOnly && editing === panel.rect.id}
          readOnly={readOnly}
          dropTarget={dropTargetId === panel.rect.id}
          live={live?.get(panel.rect.id)}
          onPress={onPress}
          onResize={onResize}
          onPort={onPort}
          onCommitText={onCommitText}
        />
      ))}
    </>
  )
})

interface ShapeNodeProps {
  panel: ShapePanel
  selected: boolean
  handles: boolean
  editing: boolean
  readOnly: boolean
  dropTarget: boolean
  live: LiveBinding | undefined
  onPress: ShapeLayerProps['onPress']
  onResize: ShapeLayerProps['onResize']
  onPort: ShapeLayerProps['onPort']
  onCommitText: ShapeLayerProps['onCommitText']
}

const ShapeNode = memo(function ShapeNode(props: ShapeNodeProps): JSX.Element {
  const { panel, selected, handles, editing, readOnly, dropTarget, live, onPress, onResize, onPort, onCommitText } = props
  const { rect, shape } = panel
  const id = rect.id
  const outline = useMemo(() => shapeOutline(shape.form, rect.w, rect.h), [shape.form, rect.w, rect.h])
  const detail = useMemo(() => shapeDetail(shape.form, rect.w, rect.h), [shape.form, rect.w, rect.h])
  // A form with no outline (free text) still needs something to press: the
  // box itself, painted nothing, hit as a fill.
  const hit = outline === '' ? `M0 0H${rect.w}V${rect.h}H0Z` : outline
  const style = { left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: panel.z, ...labelInset(shape.form, rect.w, rect.h) } as CSSProperties
  const press = (event: ReactMouseEvent): void => {
    if (event.button !== 0) return
    // The canvas must not read this as a background press (a deselect, or a
    // marquee), and the label must not start a native text drag.
    event.stopPropagation()
    event.preventDefault()
    onPress(id, event)
  }
  const edit = (event: ReactMouseEvent): void => {
    if (readOnly) return
    event.stopPropagation()
    setEditingShape(id)
  }
  return (
    <div
      className={`shape${selected ? ' shape--selected' : ''}${dropTarget ? ' shape--target' : ''}${editing ? ' shape--editing' : ''}`}
      data-panel-id={id}
      data-shape-form={shape.form}
      data-fill={shape.fill ?? 'plain'}
      data-stroke={shape.stroke ?? (shape.form === 'text' ? 'none' : 'line')}
      data-ink={shape.ink ?? 'fg'}
      style={style}
      role="group"
      aria-label={`${shapeFormWord(shape.form)}: ${shape.text === '' ? 'empty' : shape.text}`}
    >
      <svg className="shape__svg" width={rect.w} height={rect.h} viewBox={`0 0 ${rect.w} ${rect.h}`} aria-hidden="true">
        <path className="shape__outline" d={hit} data-empty-outline={outline === '' ? '' : undefined} onMouseDown={press} onDoubleClick={edit} />
        {detail !== '' && <path className="shape__detail" d={detail} />}
      </svg>
      {live !== undefined && outline !== '' && (live.kind === 'panel'
        ? <PanelLive binding={live} outline={outline} w={rect.w} h={rect.h} />
        : <LiveMark word={live.word} tone={live.tone} title={`${live.name} — ${live.word}`} outline={outline} w={rect.w} h={rect.h} mark="step" />)}
      {editing
        ? <ShapeEditor id={id} text={shape.text} onCommitText={onCommitText} />
        : shape.text !== '' && <div className="shape__label">{shape.text}</div>}
      {handles && HANDLES.map((edge) => (
        <div
          key={edge}
          className={`shape__handle shape__handle--${edge}`}
          data-shape-handle={edge}
          onMouseDown={(event) => {
            if (event.button !== 0) return
            event.stopPropagation()
            event.preventDefault()
            onResize(id, edge, event)
          }}
        />
      ))}
      {!readOnly && onPort !== undefined && shape.form !== 'text' && (['n', 'e', 's', 'w'] as const).map((port) => {
        const at = portPoint(shape.form, { x: 0, y: 0, w: rect.w, h: rect.h }, port)
        return (
          <button
            key={port}
            type="button"
            tabIndex={-1}
            className={`shape__port shape__port--${port}`}
            data-shape-port={port}
            aria-label={`Draw a connector from the ${port === 'n' ? 'top' : port === 's' ? 'bottom' : port === 'e' ? 'right' : 'left'}`}
            style={{ left: at.x, top: at.y }}
            onMouseDown={(event) => {
              if (event.button !== 0) return
              event.stopPropagation()
              event.preventDefault()
              onPort(id, port, event)
            }}
          />
        )
      })}
    </div>
  )
})

/**
 * M393. A bound shape's live state: its outline again, drawn in the state's
 * tone (`data-tone` — the tone block is the one place a state gets a hue,
 * verify:styles tone.1), and the one word, from the same derivation the rail
 * uses. Its own subscriptions, so an agent's state change re-renders this
 * badge and nothing else. A kind with no state (a file, a note) draws nothing.
 */
function PanelLive({ binding, outline, w, h }: { binding: Extract<LiveBinding, { kind: 'panel' }>; outline: string; w: number; h: number }): JSX.Element | null {
  const shown = useShownState(binding.panelId, binding.input)
  if (shown.tone === 'kind') return null
  return <LiveMark word={shown.word} tone={shown.tone} title={`${binding.name} — ${shown.word}`} outline={outline} w={w} h={h} mark={binding.panelId} />
}

/** The ring and the word — the one picture both bindings draw. */
function LiveMark({ word, tone, title, outline, w, h, mark }: { word: string; tone: string; title: string; outline: string; w: number; h: number; mark: string }): JSX.Element {
  return (
    <>
      <svg className="shape__live-ring" data-tone={tone} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><path d={outline} /></svg>
      <span className="shape__live" data-tone={tone} data-shape-live={mark} title={title}>{word}</span>
    </>
  )
}

/**
 * The label's editor. A textarea, not contenteditable: its value is plain
 * text by construction (a label is words, never markup an agent could smuggle
 * into the DOM), and draft-focus.ts already routes ⌘V/⌘C/⌘Z to a focused
 * textarea. Every key stops HERE — a bare Tab, Delete or arrow in a label is
 * typing, never a canvas verb (the ledger's D3).
 */
function ShapeEditor({ id, text, onCommitText }: { id: string; text: string; onCommitText: ShapeNodeProps['onCommitText'] }): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)
  const closedRef = useRef(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    // preventScroll: focus() inside .canvas would otherwise scroll the host,
    // which is a pan the camera never made (the M205 lesson).
    el.focus({ preventScroll: true })
    el.select()
  }, [])
  const fit = (): void => {
    const el = ref.current
    if (el === null) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }
  useLayoutEffect(fit, [])
  const close = (how: 'blur' | 'escape' | 'tab' | 'shift-tab'): void => {
    if (closedRef.current) return
    closedRef.current = true
    const value = normaliseShapeText(ref.current?.value ?? text)
    setEditingShape(null)
    onCommitText(id, value, how)
  }
  useEffect(() => () => {
    // Unmounted while open (the shape was deleted, or an undo removed it):
    // nothing to commit to, and the store must not keep naming it.
    if (!closedRef.current) setEditingShape(null)
  }, [])
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    event.stopPropagation()
    if (event.key === 'Escape' || (event.key === 'Enter' && event.metaKey)) {
      event.preventDefault()
      close('escape')
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      close(event.shiftKey ? 'shift-tab' : 'tab')
    }
  }
  return (
    <div className="shape__label shape__label--editing">
      <textarea
        ref={ref}
        className="shape__editor"
        defaultValue={text}
        rows={1}
        spellCheck={false}
        aria-label="Label"
        onInput={fit}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => { event.stopPropagation() }}
        onBlur={() => { close('blur') }}
      />
    </div>
  )
}

/**
 * Where a label may sit inside its outline, as padding on the box. A
 * diamond's usable middle is its inscribed rectangle (half each way); an
 * input/output leaves room for the slant; a subprocess for its two bars.
 */
function labelInset(form: ShapePanel['shape']['form'], w: number, h: number): Record<string, string> {
  switch (form) {
    case 'decision': return { '--shape-pad-x': `${Math.round(w * 0.22)}px`, '--shape-pad-y': `${Math.round(h * 0.2)}px` }
    case 'io': return { '--shape-pad-x': `${Math.round(Math.min(h * 0.35, w * 0.18)) + 10}px`, '--shape-pad-y': '6px' }
    case 'subprocess': return { '--shape-pad-x': '18px', '--shape-pad-y': '6px' }
    case 'terminator': return { '--shape-pad-x': `${Math.round(Math.min(h, w) / 2.4)}px`, '--shape-pad-y': '4px' }
    case 'document': return { '--shape-pad-x': '12px', '--shape-pad-y': '6px', '--shape-pad-bottom': `${Math.round(h * 0.14)}px` }
    case 'junction': return { '--shape-pad-x': '0px', '--shape-pad-y': '0px' }
    default: return { '--shape-pad-x': '12px', '--shape-pad-y': '6px' }
  }
}
