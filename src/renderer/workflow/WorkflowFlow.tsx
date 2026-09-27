import { memo, useEffect, useMemo, useRef, useState, type JSX, type MutableRefObject } from 'react'
import '@xyflow/react/dist/style.css'
import { applyNodeChanges, Background, Controls, Handle, MiniMap, Position, ReactFlow, useReactFlow, ViewportPortal, type Edge, type Node, type NodeChange, type NodeProps } from '@xyflow/react'
import { useStore as useZustandStore } from 'zustand'
import { motion, useReducedMotion } from 'motion/react'
import type { StoreApi } from 'zustand/vanilla'
import type { PersistedTemplate } from '@shared/templates'
import { blockCount } from '@shared/workflow-nodes'
import { BLOCK_H, BLOCK_W, buildDiagram, DIAGRAM_PAD, edgeWord } from './workflow-diagram'
import { createWorkflowFlowStore, type WorkflowFlowState } from './workflow-flow-store'

type FlowBlock = { key: string; label: string; sublabel: string; kind: string; family: 'agent' | 'worker' | 'hand'; issue?: string[]; lit: boolean; dim: boolean; dragging: boolean }
const FAMILY: Record<string, FlowBlock['family']> = { chat: 'agent', orchestrator: 'agent', collect: 'agent', pool: 'worker', terminal: 'hand', action: 'hand', http: 'hand' }

/** Above this many blocks `fitView` stops being legible and the map starts paying. */
const MINIMAP_FROM = 12

/*
 * Brief #21. NO `layout` on the block. React Flow moves a node by writing
 * its wrapper's transform on every pointer move; Motion's layout projection
 * reads any position change it sees on a re-render as something to spring
 * TOWARDS, so a drag that re-rendered the block (a selection landing
 * mid-drag, an issue badge appearing) trailed the pointer instead of sitting
 * under it. Dragging tracks input directly; only the block's own states
 * (arrival, selection, hover, press) animate.
 */
function WorkflowBlock({ data, selected }: NodeProps<Node<FlowBlock>>): JSX.Element {
  const reduced = useReducedMotion()
  return <motion.div className={`workflow-flow__block${selected ? ' workflow-flow__block--selected' : ''}`} data-workflow-block={data.key} data-workflow-block-kind={data.kind} data-family={data.family} data-workflow-issue={data.issue?.length ? 'true' : undefined}
    data-lit={data.lit ? 'true' : undefined} data-dim={data.dim ? 'true' : undefined}
    initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: selected ? 1.025 : 1 }} whileHover={reduced ? undefined : { y: -2 }} whileTap={reduced ? undefined : { scale: 0.985 }}
    transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 30, mass: 0.45 }}>
    <Handle type="target" position={Position.Left} className="workflow-flow__handle" />
    <span className="workflow-flow__kind">{data.sublabel}</span>
    <strong className="workflow-flow__label">{data.label}</strong>
    {data.issue?.[0] !== undefined && <span className="workflow-flow__issue" title={data.issue.join('; ')}>!</span>}
    {/* M183's port, kept by name: a wire starts here (verify:panels:product wire.1 drags from it). */}
    <Handle type="source" position={Position.Right} className="workflow-flow__handle" data-workflow-port />
  </motion.div>
}
const nodeTypes = { workflow: memo(WorkflowBlock) }

/**
 * The owner's door into this island's camera. The legacy SVG answered a
 * client point with its screen CTM; here the flow's own coordinates ARE the
 * diagram's (each node sits at buildDiagram's x/y), so a library drop keeps
 * the owner's arithmetic and only this mapping changes.
 */
export interface WorkflowFlowApi {
  /** A client point in flow (= diagram) units, or null before the flow has mounted. */
  toFlow: (clientX: number, clientY: number) => { x: number; y: number } | null
  /** Whether a client point is over this flow's own box — a drop outside it is not a drop. */
  contains: (clientX: number, clientY: number) => boolean
}

export interface WorkflowFlowProps {
  panelId: string
  template: PersistedTemplate
  readOnly: boolean
  selected: string | null
  issues: Record<string, string[]>
  /** M259. The selected block's lineage (lit) — every other block and edge is quieted; null when nothing is selected. */
  litBlocks: ReadonlySet<string> | null
  litEdges: ReadonlySet<string> | null
  /** M259. What a wire from `from` held over `over` would be refused with — addEdge's own rules, said BEFORE the release. */
  wireRefusal: (from: string, over: string | null) => string | null
  /** M183. The library drag's ghost, in flow units; null when no drag is in flight. */
  ghost: { x: number; y: number } | null
  apiRef: MutableRefObject<WorkflowFlowApi | null>
  onSelect: (key: string | null) => void
  onMove: (key: string, x: number, y: number) => void
  onConnect: (from: string, to: string) => void
  /** Brief #19. Changes when the panel is expanded or restored: the diagram refits to the new size. */
  fitKey?: number
}

/**
 * Refit when `fitKey` changes — never on mount (ReactFlow's own `fitView`
 * does that) and after the frame has taken its new size, which lands a
 * render or two after the maximise that changed it.
 */
function RefitOn({ fitKey }: { fitKey: number }): null {
  const flow = useReactFlow()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = window.setTimeout(() => { void flow.fitView({ padding: 0.12 }) }, 90)
    return () => window.clearTimeout(t)
  }, [fitKey, flow])
  return null
}

/**
 * The legacy SVG drew blocks 1:1 and always showed the whole diagram with
 * room to drop beside it. A flow's `fitView` fits ONCE, on mount, and up to
 * maxZoom — so a two-block flow ballooned to ~1.9x and, when the library
 * opened beside it, the flow narrowed under an unchanged camera and pushed
 * its blocks past the edge, leaving no diagram to drop onto (lib.1). Fit at
 * most 1:1, and fit again whenever the flow's own box changes size.
 */
const FIT = { maxZoom: 1 } as const

/** Lives INSIDE <ReactFlow> so useReactFlow has its store; publishes the camera mapping to the owner and keeps the diagram in view. */
function FlowApiBridge({ host, apiRef, userMoved }: { host: MutableRefObject<HTMLDivElement | null>; apiRef: MutableRefObject<WorkflowFlowApi | null>; userMoved: MutableRefObject<boolean> }): null {
  const flow = useReactFlow()
  useEffect(() => {
    apiRef.current = {
      toFlow: (clientX, clientY) => {
        const el = host.current; if (el === null || el.offsetWidth === 0) return null
        // The panel sits inside the canvas's transformed world, which xyflow's
        // own screenToFlowPosition does not know about: divide the CANVAS
        // scale out first (rendered width over layout width), then the flow's.
        const r = el.getBoundingClientRect()
        const k = r.width / el.offsetWidth
        const vp = flow.getViewport()
        return { x: ((clientX - r.left) / k - vp.x) / vp.zoom, y: ((clientY - r.top) / k - vp.y) / vp.zoom }
      },
      contains: (clientX, clientY) => {
        const el = host.current; if (el === null) return false
        const r = el.getBoundingClientRect()
        return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
      }
    }
    return () => { apiRef.current = null }
  }, [flow, host, apiRef])
  useEffect(() => {
    const el = host.current; if (el === null) return
    let last: { w: number; h: number } | null = null
    let frame = 0
    const observer = new ResizeObserver(() => {
      const size = { w: el.offsetWidth, h: el.offsetHeight }
      // The first report is the mount, which the `fitView` prop already covers.
      // A camera the PERSON moved (a pan or a zoom inside the flow) is theirs:
      // a resize then leaves it alone rather than throwing their view away.
      if (last !== null && !userMoved.current && (size.w !== last.w || size.h !== last.h)) { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { void flow.fitView(FIT) }) }
      last = size
    })
    observer.observe(el)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [flow, host, userMoved])
  return null
}

/** A self-contained React Flow island: it owns its camera and transient gestures only. */
export function WorkflowFlow(props: WorkflowFlowProps): JSX.Element {
  const store = useRef<StoreApi<WorkflowFlowState>>(createWorkflowFlowStore()).current
  const selected = useZustandStore(store, (state) => state.selected)
  const dragging = useZustandStore(store, (state) => state.dragging)
  const setSelected = useZustandStore(store, (state) => state.setSelected)
  const setDragging = useZustandStore(store, (state) => state.setDragging)
  const host = useRef<HTMLDivElement | null>(null)
  // Set by a pan or zoom that came from an input event; programmatic fits carry no event.
  const userMoved = useRef(false)
  const diagram = useMemo(() => buildDiagram(props.template), [props.template])
  const authoredOrigin = useMemo(() => ({ x: props.template.nodes.length === 0 ? 0 : Math.min(...props.template.nodes.map((node) => node.dx)), y: props.template.nodes.length === 0 ? 0 : Math.min(...props.template.nodes.map((node) => node.dy)) }), [props.template.nodes])
  const { litBlocks, litEdges } = props
  const nodes = useMemo<Node<FlowBlock>[]>(() => diagram.blocks.map((block) => ({
    id: block.key, type: 'workflow', position: { x: block.x, y: block.y },
    selected: selected === block.key,
    data: (() => {
      const kind = props.template.nodes.find((node) => node.key === block.key)?.kind ?? 'terminal'
      return { key: block.key, label: block.label, sublabel: block.sublabel, kind, family: FAMILY[kind], issue: props.issues[block.key],
        lit: litBlocks?.has(block.key) === true, dim: litBlocks !== null && !litBlocks.has(block.key), dragging: dragging === block.key }
    })()
  })), [diagram.blocks, props.template.nodes, props.issues, selected, litBlocks, dragging])
  // The draft is the record and these nodes are its picture — but a drag must
  // be SEEN while it happens, and a controlled flow with no onNodesChange
  // never moves a node under the pointer. So the picture takes position and
  // measurement changes locally and is replaced whole whenever the draft
  // changes; the move itself is still committed once, on release.
  const [shown, setShown] = useState(nodes)
  useEffect(() => { setShown(nodes) }, [nodes])
  const onNodesChange = (changes: NodeChange<Node<FlowBlock>>[]): void => {
    const kept = changes.filter((c) => c.type === 'position' || c.type === 'dimensions')
    if (kept.length > 0) setShown((current) => applyNodeChanges(kept, current))
  }
  // The edge's own <g> carries the hooks the legacy SVG's did — its key as
  // `from>to` and the lineage — through xyflow's domAttributes, so the edge
  // keeps xyflow's default path and label (no custom edge to drift from it).
  const edges = useMemo<Edge[]>(() => diagram.edges.map((edge) => {
    const id = `${edge.from}>${edge.to}`
    const lit = litEdges?.has(id) === true
    const domAttributes = { 'data-workflow-edge': id, 'data-lit': lit ? 'true' : undefined, 'data-dim': litEdges !== null && !lit ? 'true' : undefined } as Edge['domAttributes']
    return { id, source: edge.from, target: edge.to, label: edgeWord(edge), type: 'smoothstep', animated: false, domAttributes }
  }), [diagram.edges, litEdges])

  // M259. A wire is refused AT THE POINTER while it is still held. xyflow
  // colours a handle it will not accept, but says nothing, and only answers
  // over a HANDLE — M183's gesture ends on the block's body. So the owner's
  // refusal is asked about whatever block is under the pointer, every move.
  const refusalRef = useRef(props.wireRefusal)
  refusalRef.current = props.wireRefusal
  const [wiring, setWiring] = useState<string | null>(null)
  const wiringRef = useRef<string | null>(null)
  wiringRef.current = wiring
  const [held, setHeld] = useState<{ x: number; y: number; reason: string } | null>(null)
  const blockAt = (clientX: number, clientY: number): string | null => {
    const hit = document.elementFromPoint(clientX, clientY)?.closest('[data-workflow-block]')
    return hit !== null && hit !== undefined && host.current?.contains(hit) === true ? hit.getAttribute('data-workflow-block') : null
  }
  useEffect(() => {
    if (wiring === null) return
    const onMove = (ev: MouseEvent): void => {
      const reason = refusalRef.current(wiring, blockAt(ev.clientX, ev.clientY))
      const el = host.current
      if (reason === null || el === null) { setHeld(null); return }
      const r = el.getBoundingClientRect(), k = el.offsetWidth === 0 ? 1 : r.width / el.offsetWidth
      setHeld({ x: (ev.clientX - r.left) / k, y: (ev.clientY - r.top) / k, reason })
    }
    window.addEventListener('mousemove', onMove)
    return () => { window.removeEventListener('mousemove', onMove); setHeld(null) }
  }, [wiring])

  useEffect(() => { setSelected(props.selected) }, [props.selected, setSelected])
  return <div ref={host} className="workflow-flow" data-workflow-diagram data-workflow-canvas="react-flow" aria-label={`${props.template.name}, ${blockCount(props.template)} blocks`}>
    <ReactFlow nodes={shown} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={FIT} minZoom={0.25} maxZoom={2.5}
      nodesDraggable={!props.readOnly} nodesConnectable={!props.readOnly} elementsSelectable
      // Delete belongs to the owner: it removes the SELECTED block from the draft through the one door (WorkflowNode's capture listener).
      deleteKeyCode={null}
      onMoveStart={(event) => { if (event !== null) userMoved.current = true }}
      onNodesChange={onNodesChange}
      onPaneClick={() => { setSelected(null); props.onSelect(null) }}
      onNodeClick={(_, node) => { setSelected(node.id); props.onSelect(node.id) }}
      onEdgeClick={(_, edge) => { setSelected(edge.id); props.onSelect(edge.id) }}
      // A drag SELECTS its block, as the SVG's did — Delete right after acts on it.
      onNodeDragStart={(_, node) => { setDragging(node.id); setSelected(node.id); props.onSelect(node.id) }}
      onNodeDragStop={(_, node) => { setDragging(null); props.onMove(node.id, Math.round(node.position.x - DIAGRAM_PAD + authoredOrigin.x), Math.round(node.position.y - DIAGRAM_PAD + authoredOrigin.y)) }}
      isValidConnection={(c) => refusalRef.current(c.source, c.target) === null}
      onConnect={(connection) => { if (connection.source !== null && connection.target !== null) props.onConnect(connection.source, connection.target) }}
      onConnectStart={(_, { nodeId, handleType }) => { if (handleType === 'source' && nodeId !== null) { wiringRef.current = nodeId; setWiring(nodeId) } }}
      // A wire released on a block's BODY (or refused over a handle) never
      // reaches onConnect; it is sent through the owner's edge op here, whose
      // refusal is said by name — a cycle is refused, never silently dropped.
      onConnectEnd={(event, state) => {
        const from = wiringRef.current
        setWiring(null)
        if (from === null || state.isValid === true) return
        const point = 'changedTouches' in event ? event.changedTouches[0] : event
        const to = (point === undefined ? null : blockAt(point.clientX, point.clientY)) ?? state.toNode?.id ?? null
        if (to !== null) props.onConnect(from, to)
      }}>
      <FlowApiBridge host={host} apiRef={props.apiRef} userMoved={userMoved} />
      <Background gap={16} size={1} />
      <Controls showInteractive={false} />
      <RefitOn fitKey={props.fitKey ?? 0} />
      {/* M279 (polish). A map earns its corner only when the flow cannot be seen
          whole: on a four-block flow it covered the fourth block, inside a panel
          that already sits on a canvas with a map of its own. */}
      {nodes.length > MINIMAP_FROM && <MiniMap pannable zoomable />}
      {props.ghost !== null && (
        <ViewportPortal>
          <div className="workflow-flow__ghost" data-workflow-ghost
            style={{ transform: `translate(${props.ghost.x - BLOCK_W / 2}px, ${props.ghost.y - BLOCK_H / 2}px)`, width: BLOCK_W, height: BLOCK_H }} />
        </ViewportPortal>
      )}
    </ReactFlow>
    {held !== null && (
      <div className="workflow-flow__wire-reason" data-workflow-wire-reason role="status" style={{ left: held.x + 12, top: held.y - 26 }}>{held.reason}</div>
    )}
  </div>
}
