import { memo, useEffect, useLayoutEffect, useMemo, useRef, type JSX, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { normaliseShapeText, shapeFormWord, type Port } from '@shared/flowchart'
import { ioSkew, portPoint, shapeDetail, shapeOutline } from '@shared/flowchart-geometry'
import type { ShapePanel } from '@renderer/panels/panels'
import type { ResizeEdge } from '@renderer/canvas/panel-interaction'
import { setEditingShape, useEditingShape } from './shape-edit-store'
import { useShownState } from '@renderer/panels/useShownState'
import type { StateInput } from '@renderer/panels/panel-state'
import type { PeerShapeMark } from './shared-shapes'
import { Close } from '@renderer/icons'

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
 *
 * M392. A TEAMMATE'S SHAPE on a shared canvas is drawn here too (`peerShapes`,
 * made by shared-shapes.ts from its placeholder), so a diamond stays a
 * diamond on everyone's canvas. It is READ-ONLY: no handles, no ports, no
 * label editor — its words are its owner's, written by the machine that runs
 * it (the role table's panel-content row). An editor MOVES it by pressing it,
 * through the placeholder's own drag (`onPeerPress`); a viewer's press is the
 * ground's. It carries `data-shared-placeholder`, never `data-panel-id`: it is
 * not a panel here. Chromeless like every shape, so the frame rule's "whose is
 * it" rides an absolutely positioned owner mark (their colour, their name on
 * hover) that takes no layout.
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
  /** M392. Teammates' shapes on a shared canvas (shared-shapes.ts), drawn read-only. */
  peerShapes?: readonly ShapePanel[]
  /** M392. Each peer shape's owner — their colour and name — by placeholder id. */
  peerMarks?: ReadonlyMap<string, PeerShapeMark>
  /** M392. The peer shapes this person may take off the shared canvas (the role table's delete row). */
  peerRemovable?: ReadonlySet<string>
  /** M392. A press on a teammate's shape: an editor moves it. Absent (a viewer, the merged view): the press is the ground's. */
  onPeerPress?: (id: string, event: ReactMouseEvent) => void
  /** M392. Take a teammate's shape off the shared canvas — the placeholder's ×. */
  onPeerRemove?: (id: string) => void
}

/** M393. The live object a shape is joined to — Canvas derives it from the connectors and the rail's own rows. */
export interface LiveBinding {
  panelId: string
  input: StateInput
  name: string
}

/** The eight handles, clockwise from the top. A handle is counter-scaled in CSS (`--chrome-scale`), so it stays grabbable zoomed out. */
const HANDLES: readonly ResizeEdge[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

export const ShapeLayer = memo(function ShapeLayer(props: ShapeLayerProps): JSX.Element {
  const { shapes, selectedIds, readOnly, onPress, onResize, onPort, onCommitText, dropTargetId, live, peerShapes, peerMarks, peerRemovable, onPeerPress, onPeerRemove } = props
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
      {peerShapes?.map((panel) => {
        const mark = peerMarks?.get(panel.rect.id)
        return (
          // Keyed apart from ours: a doc key and a local id are two namespaces.
          <ShapeNode
            key={`peer:${panel.rect.id}`}
            panel={panel}
            selected={false}
            handles={false}
            editing={false}
            readOnly
            dropTarget={false}
            live={undefined}
            onPress={onPress}
            onResize={onResize}
            onPort={undefined}
            onCommitText={onCommitText}
            peerColour={mark?.colour ?? ''}
            peerWho={mark?.who ?? 'a teammate'}
            peerRemovable={peerRemovable?.has(panel.rect.id) === true}
            onPeerPress={onPeerPress}
            onPeerRemove={onPeerRemove}
          />
        )
      })}
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
  /** M392. Set on a TEAMMATE'S shape only: their colour (colorOf). Primitives, so the memo holds. */
  peerColour?: string
  peerWho?: string
  peerRemovable?: boolean
  onPeerPress?: ShapeLayerProps['onPeerPress']
  onPeerRemove?: ShapeLayerProps['onPeerRemove']
}

const ShapeNode = memo(function ShapeNode(props: ShapeNodeProps): JSX.Element {
  const { panel, selected, handles, editing, readOnly, dropTarget, live, onPress, onResize, onPort, onCommitText, peerColour, peerWho, peerRemovable, onPeerPress, onPeerRemove } = props
  const { rect, shape } = panel
  const id = rect.id
  const peer = peerColour !== undefined
  const outline = useMemo(() => shapeOutline(shape.form, rect.w, rect.h), [shape.form, rect.w, rect.h])
  const detail = useMemo(() => shapeDetail(shape.form, rect.w, rect.h), [shape.form, rect.w, rect.h])
  // A form with no outline (free text) still needs something to press: the
  // box itself, painted nothing, hit as a fill.
  const hit = outline === '' ? `M0 0H${rect.w}V${rect.h}H0Z` : outline
  const style = {
    left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: panel.z, ...labelInset(shape.form, rect.w, rect.h),
    ...(peer && peerColour !== '' ? { '--owner': peerColour } : {})
  } as CSSProperties
  const press = (event: ReactMouseEvent): void => {
    if (event.button !== 0) return
    // M392. A teammate's shape: an editor's press moves it (the placeholder
    // drag); with no mover — a viewer — the press is left to the ground, as
    // a press on a viewer's placeholder card is.
    if (peer) {
      if (onPeerPress === undefined) return
      event.stopPropagation()
      event.preventDefault()
      onPeerPress(id, event)
      return
    }
    // The canvas must not read this as a background press (a deselect, or a
    // marquee), and the label must not start a native text drag.
    event.stopPropagation()
    event.preventDefault()
    onPress(id, event)
  }
  const edit = (event: ReactMouseEvent): void => {
    if (readOnly || peer) return
    event.stopPropagation()
    setEditingShape(id)
  }
  return (
    <div
      className={`shape${selected ? ' shape--selected' : ''}${dropTarget ? ' shape--target' : ''}${editing ? ' shape--editing' : ''}${peer ? ' shape--peer' : ''}`}
      data-panel-id={peer ? undefined : id}
      data-shared-placeholder={peer ? id : undefined}
      data-arrange={peer && onPeerPress !== undefined ? '' : undefined}
      data-shape-form={shape.form}
      data-fill={shape.fill ?? 'plain'}
      data-stroke={shape.stroke ?? (shape.form === 'text' ? 'none' : 'line')}
      data-ink={shape.ink ?? 'fg'}
      style={style}
      role="group"
      aria-label={`${peer ? `${peerWho ?? 'a teammate'}’s ` : ''}${shapeFormWord(shape.form)}: ${shape.text === '' ? 'empty' : shape.text}`}
    >
      <svg className="shape__svg" width={rect.w} height={rect.h} viewBox={`0 0 ${rect.w} ${rect.h}`} aria-hidden="true">
        <path className="shape__outline" d={hit} data-empty-outline={outline === '' ? '' : undefined} onMouseDown={press} onDoubleClick={edit} />
        {detail !== '' && <path className="shape__detail" d={detail} />}
      </svg>
      {live !== undefined && outline !== '' && <ShapeLive binding={live} outline={outline} w={rect.w} h={rect.h} />}
      {peer && (
        // Whose it is, in their colour — the one fact a placeholder's header
        // carried, kept without a header (the frame rule's test: removing it
        // would hide information). Absolutely positioned, so it takes no layout.
        <span className="shape__owner" data-shape-owner={id} style={outlineCorner(shape.form, rect.w, rect.h, 'left')} title={`${peerWho ?? 'a teammate'}’s — only they change its words`} aria-hidden="true" />
      )}
      {peer && peerRemovable === true && onPeerRemove !== undefined && (
        <button type="button" className="shape__remove" data-shape-remove={id} tabIndex={-1} style={outlineCorner(shape.form, rect.w, rect.h, 'right')}
          aria-label={`Remove ${peerWho ?? 'a teammate'}’s ${shapeFormWord(shape.form)} from the shared canvas`}
          onMouseDown={(event) => { event.stopPropagation() }} onClick={() => { onPeerRemove(id) }}><Close /></button>
      )}
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
function ShapeLive({ binding, outline, w, h }: { binding: LiveBinding; outline: string; w: number; h: number }): JSX.Element | null {
  const shown = useShownState(binding.panelId, binding.input)
  if (shown.tone === 'kind') return null
  return (
    <>
      <svg className="shape__live-ring" data-tone={shown.tone} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><path d={outline} /></svg>
      <span className="shape__live" data-tone={shown.tone} data-shape-live={binding.panelId} title={`${binding.name} — ${shown.word}`}>{shown.word}</span>
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
 * M392. Where a teammate's shape wears its two marks — the owner's on the
 * upper-LEFT, the × on the upper-RIGHT: ON the outline, never on a port (an
 * arrow lands there) and never in an empty corner of the box. A diamond's box
 * corner is ground, and a mark there read as belonging to nothing (seen in the
 * real renderer, not guessed).
 */
function outlineCorner(form: ShapePanel['shape']['form'], w: number, h: number, side: 'left' | 'right'): { left: number; top: number } {
  const diag = 1 - Math.SQRT1_2
  const mirror = (p: { left: number; top: number }): { left: number; top: number } => (side === 'left' ? p : { left: w - p.left, top: p.top })
  switch (form) {
    case 'decision': return mirror({ left: w / 4, top: h / 4 })
    // The slant leans right: its top-left vertex is inset, its top-right is the box's corner.
    case 'io': return side === 'left' ? { left: ioSkew(w, h), top: 0 } : { left: w, top: 0 }
    case 'terminator': { const r = Math.min(w, h) / 2; return mirror({ left: r * diag, top: r * diag }) }
    case 'junction': { const m = Math.min(w, h) / 2; return mirror({ left: w / 2 - m * Math.SQRT1_2, top: h / 2 - m * Math.SQRT1_2 }) }
    default: return mirror({ left: 0, top: 0 })
  }
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
