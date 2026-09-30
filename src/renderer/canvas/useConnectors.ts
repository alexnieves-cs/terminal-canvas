import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import {
  CONNECTOR_LABEL_MAX, ENDS, ROUTES, SHAPE_SIZE, nextStepForm, SHAPE_STROKES, isEnds, isPort, isRoute, isShapeStroke,
  type Connector, type Port, type ShapeForm
} from '@shared/flowchart'
import { nearestPort, routeConnector } from '@shared/flowchart-geometry'
import { addConnector, findConnector, isShapePanel, makeShapePanel, nextZ, patchConnector, removeConnector, type Panel } from '@renderer/panels/panels'
import { buildConnectorViews, type ConnectorView, type RoutablePanel } from '@renderer/flowchart/connector-model'
import type { ConnectorGhost } from '@renderer/flowchart/ConnectorLayer'
import { screenToWorld, type Point, type Viewport, type WorldRect } from './viewport'
import { editNewShape, type VerbResult } from './useFlowchartVerbs'

/**
 * M389. CONNECTORS — the Canvas half: their drawable views, their selection,
 * the draw gesture from a shape's port, and the verbs (connect, restyle,
 * relabel, remove). A hook in the useBoardVerbs mould (canvas/CLAUDE.md).
 *
 * A connector is its own record held by its source (ledger D2). Every write
 * goes through setPanels with commitHistory inside the updater, so undo,
 * close-pruning and persistence are the panels' own.
 */

export interface ConnectorPatch {
  route?: string
  ends?: string
  stroke?: string
  dashed?: boolean
  label?: string
  from?: string | null
  toPort?: string | null
}

export interface ConnectorsDeps {
  setPanels: Dispatch<SetStateAction<Panel[]>>
  commitHistory: (next: Panel[]) => void
  panelsRef: RefObject<Panel[]>
  /** The panels as displayed (merged lanes included) — what the layer draws. */
  displayPanels: readonly Panel[]
  /**
   * M392. A shared canvas's placeholders as arrow ends (shared-shapes.ts):
   * a teammate's arrows draw read-only, and an arrow of theirs that points at
   * one of OUR panels lands on it. Never a target of OUR verbs — connect and
   * the draw gesture look only in `panelsRef`.
   */
  peers?: readonly RoutablePanel[]
  /** Z-sorted rects, the marquee's and the link draw's own target order. */
  hitOrderRef: RefObject<WorldRect[]>
  nextIdRef: MutableRefObject<number>
  hostRef: RefObject<HTMLElement | null>
  viewportRef: RefObject<Viewport>
  mergedRef: RefObject<boolean>
  selectedIds: ReadonlySet<string>
  selectOnly: (id: string | null) => void
  /** The selected connector — Canvas state beside the panel selection, which `selectOnly` clears (the M78 exclusivity). */
  selectedId: string | null
  setSelectedId: Dispatch<SetStateAction<string | null>>
  shouldIgnoreKeys: () => boolean
}

export interface Connectors {
  views: readonly ConnectorView[]
  selectedId: string | null
  editingId: string | null
  ghost: ConnectorGhost | null
  /** The panel a release right now would land on — the ShapeLayer lights it. */
  dropTargetId: string | null
  select: (id: string, event?: ReactMouseEvent) => void
  clear: () => void
  editLabel: (id: string) => void
  commitLabel: (id: string, label: string) => void
  beginDraw: (fromId: string, port: Port | null, event: { clientX: number; clientY: number }) => void
  connect: (from: string, to: string, opts?: { from?: Port; toPort?: Port; label?: string }) => VerbResult & { id?: string }
  patch: (id: string, patch: ConnectorPatch) => VerbResult
  remove: (id: string) => VerbResult
  /** A connector from `from` to a NEW shape placed off `port` at `at` — quick-connect into empty space. */
  extend: (from: string, port: Port | null, at: Point) => VerbResult & { id?: string }
}

interface DrawState { from: string; port: Port | null; cursor: Point; target: string | null; targetPort: Port | null }

const OPPOSITE: Record<Port, Port> = { n: 's', s: 'n', e: 'w', w: 'e' }
/** A port's outward direction — where the next shape goes when you pull from it. */
const NORMAL: Record<Port, Point> = { n: { x: 0, y: -1 }, s: { x: 0, y: 1 }, e: { x: 1, y: 0 }, w: { x: -1, y: 0 } }
/** Screen pixels: a drop this close to an object lands on it. Much tighter than a link's 90 — in a diagram the empty space between shapes is where the NEXT shape goes. */
const LAND_PX = 20

export function useConnectors(deps: ConnectorsDeps): Connectors {
  const { setPanels, commitHistory, panelsRef, displayPanels, peers, hitOrderRef, nextIdRef, hostRef, viewportRef, mergedRef, selectedIds, selectOnly, selectedId, setSelectedId, shouldIgnoreKeys } = deps
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draw, setDraw] = useState<DrawState | null>(null)
  const drawRef = useRef<DrawState | null>(null)

  // The views, with last frame's routes reused where nothing that routes
  // them changed (connector-model.ts). The cache is replaced wholesale each
  // time, so a removed connector's route is never kept alive.
  const cacheRef = useRef<Map<string, ConnectorView>>(new Map())
  const views = useMemo(() => {
    const next = buildConnectorViews(peers === undefined || peers.length === 0 ? displayPanels : [...displayPanels, ...peers], cacheRef.current)
    cacheRef.current = next
    return [...next.values()]
  }, [displayPanels, peers])

  // Exclusive with the panel selection, the M78 edge rule: selecting a panel
  // clears the connector, and the merged view has no connector verbs.
  useEffect(() => { if (selectedIds.size > 0) setSelectedId(null) }, [selectedIds, setSelectedId])
  useEffect(() => { if (selectedId !== null && !views.some((v) => v.id === selectedId)) setSelectedId(null) }, [views, selectedId, setSelectedId])

  const select = useCallback((id: string) => {
    selectOnly(null)
    setSelectedId(id)
  }, [selectOnly, setSelectedId])
  const clear = useCallback(() => { setSelectedId(null) }, [setSelectedId])

  const connect = useCallback((from: string, to: string, opts?: { from?: Port; toPort?: Port; label?: string }): VerbResult & { id?: string } => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to connect' }
    if (from === to) return { kind: 'refused', reason: 'a connector needs two different objects' }
    const panels = panelsRef.current ?? []
    const a = panels.find((p) => p.rect.id === from)
    const b = panels.find((p) => p.rect.id === to)
    if (a === undefined || b === undefined) return { kind: 'refused', reason: `no object is called ${a === undefined ? from : to}` }
    const id = `cx${nextIdRef.current++}`
    const label = opts?.label?.trim().slice(0, CONNECTOR_LABEL_MAX)
    const connector: Connector = { id, to, ...(opts?.from === undefined ? {} : { from: opts.from }), ...(opts?.toPort === undefined ? {} : { toPort: opts.toPort }), ...(label === undefined || label === '' ? {} : { label }) }
    setPanels((current) => {
      const next = addConnector(current, from, connector)
      if (next !== current) commitHistory(next)
      return next
    })
    return { kind: 'ran', note: `connected ${from} → ${to}`, id }
  }, [commitHistory, mergedRef, nextIdRef, panelsRef, setPanels])

  const patch = useCallback((id: string, p: ConnectorPatch): VerbResult => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to change a connector' }
    const found = findConnector(panelsRef.current ?? [], id)
    if (found === null) return { kind: 'refused', reason: `no connector is called ${id}` }
    if (p.route !== undefined && !isRoute(p.route)) return { kind: 'refused', reason: `${p.route} is not a route — ${ROUTES.join(', ')}` }
    if (p.ends !== undefined && !isEnds(p.ends)) return { kind: 'refused', reason: `${p.ends} is not an arrow choice — ${ENDS.join(', ')}` }
    if (p.stroke !== undefined && !isShapeStroke(p.stroke)) return { kind: 'refused', reason: `${p.stroke} is not a line — ${SHAPE_STROKES.join(', ')}` }
    if (p.from !== undefined && p.from !== null && !isPort(p.from)) return { kind: 'refused', reason: `${p.from} is not a side — n, e, s or w` }
    if (p.toPort !== undefined && p.toPort !== null && !isPort(p.toPort)) return { kind: 'refused', reason: `${p.toPort} is not a side — n, e, s or w` }
    // The DEFAULT is absent: orthogonal, an arrow at the end, the line colour,
    // solid, no label, auto ports — a value equal to it clears the field.
    const change: Partial<Omit<Connector, 'id'>> = {}
    if (p.route !== undefined) change.route = p.route === 'orthogonal' ? undefined : p.route as Connector['route']
    if (p.ends !== undefined) change.ends = p.ends === 'end' ? undefined : p.ends as Connector['ends']
    if (p.stroke !== undefined) change.stroke = p.stroke === 'line' ? undefined : p.stroke as Connector['stroke']
    if (p.dashed !== undefined) change.dashed = p.dashed ? true : undefined
    if (p.label !== undefined) { const l = p.label.trim().slice(0, CONNECTOR_LABEL_MAX); change.label = l === '' ? undefined : l }
    if (p.from !== undefined) change.from = p.from === null ? undefined : p.from as Port
    if (p.toPort !== undefined) change.toPort = p.toPort === null ? undefined : p.toPort as Port
    setPanels((current) => {
      const next = patchConnector(current, id, change)
      if (next !== current) commitHistory(next)
      return next
    })
    return { kind: 'ran', note: 'connector updated' }
  }, [commitHistory, mergedRef, panelsRef, setPanels])

  const remove = useCallback((id: string): VerbResult => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to remove a connector' }
    if (findConnector(panelsRef.current ?? [], id) === null) return { kind: 'refused', reason: `no connector is called ${id}` }
    setPanels((current) => {
      const next = removeConnector(current, id)
      if (next !== current) commitHistory(next)
      return next
    })
    setSelectedId((s) => (s === id ? null : s))
    return { kind: 'ran', note: 'connector removed' }
  }, [commitHistory, mergedRef, panelsRef, setPanels, setSelectedId])

  const editLabel = useCallback((id: string) => {
    if (mergedRef.current === true) return
    setSelectedId(id)
    setEditingId(id)
  }, [mergedRef, setSelectedId])
  const commitLabel = useCallback((id: string, label: string) => {
    setEditingId(null)
    const found = findConnector(panelsRef.current ?? [], id)
    if (found === null || (found.connector.label ?? '') === label) return
    patch(id, { label })
  }, [panelsRef, patch])

  const extend = useCallback((from: string, port: Port | null, at: Point): VerbResult & { id?: string } => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to add a shape' }
    const source = (panelsRef.current ?? []).find((p) => p.rect.id === from)
    if (source === undefined) return { kind: 'refused', reason: `no object is called ${from}` }
    // The next step's form (nextStepForm): a process begets a process, a
    // decision a plain step; from a live object a process — "this agent does this".
    const form: ShapeForm = nextStepForm(isShapePanel(source) ? source.shape.form : null)
    const size = SHAPE_SIZE[form]
    // Placed so the port that FACES the source lands on the drop point: pulled
    // down from a south port, the new shape hangs below the cursor.
    const out = port === null ? { x: 0, y: 0 } : NORMAL[port]
    const centre = { x: at.x + out.x * size.w / 2, y: at.y + out.y * size.h / 2 }
    // The shape AND its connector in ONE updater, ONE history entry — a
    // second step (add, then connect) would look the new shape up before
    // React had it, refuse, and leave an unconnected box and two undos.
    // Ids minted out here: an updater must be pure.
    const shapeId = `sh${nextIdRef.current++}`
    const connector: Connector = { id: `cx${nextIdRef.current++}`, to: shapeId, ...(port === null ? {} : { from: port, toPort: OPPOSITE[port] }) }
    const shape = makeShapePanel(shapeId, centre, 0, form, '')
    setPanels((current) => {
      const withShape = [...current, { ...shape, z: nextZ(current) }]
      const next = addConnector(withShape, from, connector)
      commitHistory(next)
      return next
    })
    selectOnly(shapeId)
    editNewShape(shapeId)
    return { kind: 'ran', note: `a ${form} step`, id: shapeId }
  }, [commitHistory, mergedRef, nextIdRef, panelsRef, selectOnly, setPanels])

  // THE DRAW GESTURE, from a shape's port. The same document-level listener
  // discipline as useLinkDraw (a drag leaves the element it started on), and
  // the same target order (hitOrder, topmost first) — but a TIGHT landing
  // radius and a drop on nothing that MAKES the next shape.
  const toWorld = (event: { clientX: number; clientY: number }): Point | null => {
    const host = hostRef.current
    const vp = viewportRef.current
    if (host === null || vp === null) return null
    const b = host.getBoundingClientRect()
    return screenToWorld({ x: event.clientX - b.left, y: event.clientY - b.top }, vp)
  }
  const landing = (from: string, cursor: Point): { target: string | null; targetPort: Port | null } => {
    const rects = hitOrderRef.current ?? []
    const vp = viewportRef.current
    const radius = LAND_PX / (vp?.scale ?? 1)
    let best: { id: string; d: number } | null = null
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i]
      if (r.id === from) continue
      const dx = Math.max(r.x - cursor.x, 0, cursor.x - (r.x + r.w))
      const dy = Math.max(r.y - cursor.y, 0, cursor.y - (r.y + r.h))
      const d = Math.hypot(dx, dy)
      if (d === 0) { best = { id: r.id, d }; break }
      if (d <= radius && (best === null || d < best.d)) best = { id: r.id, d }
    }
    if (best === null) return { target: null, targetPort: null }
    const panel = (panelsRef.current ?? []).find((p) => p.rect.id === best!.id)
    const targetPort = panel !== undefined && isShapePanel(panel) ? nearestPort(panel.shape.form, panel.rect, cursor) : null
    return { target: best.id, targetPort }
  }
  const beginDraw = useCallback((fromId: string, port: Port | null, event: { clientX: number; clientY: number }) => {
    if (mergedRef.current === true) return
    const cursor = toWorld(event)
    if (cursor === null) return
    const next: DrawState = { from: fromId, port, cursor, target: null, targetPort: null }
    drawRef.current = next
    setDraw(next)
    setSelectedId(null)
  }, [mergedRef, setSelectedId])

  useEffect(() => {
    if (draw === null) return
    const onMove = (event: MouseEvent): void => {
      const cur = drawRef.current
      if (cur === null) return
      if ((event.buttons & 1) === 0) { drawRef.current = null; setDraw(null); return }
      const cursor = toWorld(event)
      if (cursor === null) return
      const next = { ...cur, cursor, ...landing(cur.from, cursor) }
      drawRef.current = next
      setDraw(next)
    }
    const onUp = (): void => {
      const cur = drawRef.current
      drawRef.current = null
      setDraw(null)
      if (cur === null) return
      // A press and release on the port itself is a click, not a drag: no
      // shape out of nowhere for a person who only wanted to look.
      const source = (panelsRef.current ?? []).find((p) => p.rect.id === cur.from)
      if (source === undefined) return
      const r = source.rect
      if (cur.target === null && cur.cursor.x >= r.x && cur.cursor.x <= r.x + r.w && cur.cursor.y >= r.y && cur.cursor.y <= r.y + r.h) return
      if (cur.target !== null) {
        connect(cur.from, cur.target, { ...(cur.port === null ? {} : { from: cur.port }), ...(cur.targetPort === null ? {} : { toPort: cur.targetPort }) })
        return
      }
      extend(cur.from, cur.port, cur.cursor)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      drawRef.current = null
      setDraw(null)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', onKey, { capture: true })
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', onKey, { capture: true })
    }
  }, [draw === null, connect, extend])

  // The ghost: the same router the finished connector will use, from the
  // source's port to the cursor — or, when a release would land, to the port
  // it would land on, so what you see is what you get.
  const ghost = useMemo<ConnectorGhost | null>(() => {
    if (draw === null) return null
    const panels = panelsRef.current ?? []
    const source = panels.find((p) => p.rect.id === draw.from)
    if (source === undefined) return null
    const fromForm = isShapePanel(source) ? source.shape.form : null
    const target = draw.target === null ? undefined : panels.find((p) => p.rect.id === draw.target)
    const fromPort: Port = draw.port ?? 's'
    const path = target !== undefined
      ? routeConnector({ from: { box: source.rect, form: fromForm, port: fromPort }, to: { box: target.rect, form: isShapePanel(target) ? target.shape.form : null, port: draw.targetPort ?? OPPOSITE[fromPort] }, route: 'orthogonal', obstacles: [], ends: 'end' })
      : routeConnector({ from: { box: source.rect, form: fromForm, port: fromPort }, to: { box: { x: draw.cursor.x, y: draw.cursor.y, w: 0, h: 0 }, form: null, port: OPPOSITE[fromPort] }, route: 'orthogonal', obstacles: [], ends: 'end' })
    return { path, landing: target !== undefined }
  }, [draw, panelsRef])

  // Delete removes the selected connector; Escape lets it go. Gated like every
  // canvas key, and never when a text field holds focus (its own Backspace).
  useEffect(() => {
    if (selectedId === null || editingId !== null) return
    const onKey = (event: KeyboardEvent): void => {
      if (shouldIgnoreKeys()) return
      const active = document.activeElement
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement || active instanceof HTMLSelectElement || (active instanceof HTMLElement && active.isContentEditable)) return
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(selectedId) }
      else if (event.key === 'Escape') { event.preventDefault(); setSelectedId(null) }
      else if (event.key === 'Enter') { event.preventDefault(); editLabel(selectedId) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selectedId, editingId, shouldIgnoreKeys, remove, editLabel])

  return useMemo(() => ({
    views, selectedId, editingId, ghost, dropTargetId: draw?.target ?? null,
    select, clear, editLabel, commitLabel, beginDraw, connect, patch, remove, extend
  }), [views, selectedId, editingId, ghost, draw, select, clear, editLabel, commitLabel, beginDraw, connect, patch, remove, extend])
}
