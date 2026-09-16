import { memo, useEffect, useMemo, useRef, type JSX } from 'react'
import '@xyflow/react/dist/style.css'
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { useStore as useZustandStore } from 'zustand'
import { motion, useReducedMotion } from 'motion/react'
import type { StoreApi } from 'zustand/vanilla'
import type { PersistedTemplate } from '@shared/templates'
import { blockCount } from '@shared/workflow-nodes'
import { buildDiagram, DIAGRAM_PAD, edgeWord } from './workflow-diagram'
import { createWorkflowFlowStore, type WorkflowFlowState } from './workflow-flow-store'

type FlowBlock = { key: string; label: string; sublabel: string; kind: string; family: 'agent' | 'worker' | 'hand'; issue?: string[] }
const FAMILY: Record<string, FlowBlock['family']> = { chat: 'agent', orchestrator: 'agent', collect: 'agent', pool: 'worker', terminal: 'hand', action: 'hand', http: 'hand' }

function WorkflowBlock({ data, selected }: NodeProps<Node<FlowBlock>>): JSX.Element {
  const reduced = useReducedMotion()
  return <motion.div className={`workflow-flow__block${selected ? ' workflow-flow__block--selected' : ''}`} data-workflow-block={data.key} data-workflow-block-kind={data.kind} data-family={data.family} data-workflow-issue={data.issue?.length ? 'true' : undefined}
    initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: selected ? 1.025 : 1 }} whileHover={reduced ? undefined : { y: -2 }} whileTap={reduced ? undefined : { scale: 0.985 }}
    transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 30, mass: 0.45 }} layout>
    <Handle type="target" position={Position.Left} className="workflow-flow__handle" />
    <span className="workflow-flow__kind">{data.sublabel}</span>
    <strong className="workflow-flow__label">{data.label}</strong>
    {data.issue?.[0] !== undefined && <span className="workflow-flow__issue" title={data.issue.join('; ')}>!</span>}
    <Handle type="source" position={Position.Right} className="workflow-flow__handle" />
  </motion.div>
}
const nodeTypes = { workflow: memo(WorkflowBlock) }

export interface WorkflowFlowProps {
  panelId: string
  template: PersistedTemplate
  readOnly: boolean
  selected: string | null
  issues: Record<string, string[]>
  onSelect: (key: string | null) => void
  onMove: (key: string, x: number, y: number) => void
  onConnect: (from: string, to: string) => void
}

/** A self-contained React Flow island: it owns its camera and transient gestures only. */
export function WorkflowFlow(props: WorkflowFlowProps): JSX.Element {
  const store = useRef<StoreApi<WorkflowFlowState>>(createWorkflowFlowStore()).current
  const selected = useZustandStore(store, (state) => state.selected)
  const setSelected = useZustandStore(store, (state) => state.setSelected)
  const setDragging = useZustandStore(store, (state) => state.setDragging)
  const diagram = useMemo(() => buildDiagram(props.template), [props.template])
  const authoredOrigin = useMemo(() => ({ x: props.template.nodes.length === 0 ? 0 : Math.min(...props.template.nodes.map((node) => node.dx)), y: props.template.nodes.length === 0 ? 0 : Math.min(...props.template.nodes.map((node) => node.dy)) }), [props.template.nodes])
  const nodes = useMemo<Node<FlowBlock>[]>(() => diagram.blocks.map((block) => ({
    id: block.key, type: 'workflow', position: { x: block.x, y: block.y },
    selected: selected === block.key,
    data: (() => { const kind = props.template.nodes.find((node) => node.key === block.key)?.kind ?? 'terminal'; return { key: block.key, label: block.label, sublabel: block.sublabel, kind, family: FAMILY[kind], issue: props.issues[block.key] } })()
  })), [diagram.blocks, props.template.nodes, props.issues, selected])
  const edges = useMemo<Edge[]>(() => diagram.edges.map((edge) => ({ id: `${edge.from}>${edge.to}`, source: edge.from, target: edge.to, label: edgeWord(edge), type: 'smoothstep', animated: false })), [diagram.edges])

  useEffect(() => { setSelected(props.selected) }, [props.selected, setSelected])
  return <div className="workflow-flow" data-workflow-diagram data-workflow-canvas="react-flow" aria-label={`${props.template.name}, ${blockCount(props.template)} blocks`}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.25} maxZoom={2.5}
      nodesDraggable={!props.readOnly} nodesConnectable={!props.readOnly} elementsSelectable
      onPaneClick={() => { setSelected(null); props.onSelect(null) }}
      onNodeClick={(_, node) => { setSelected(node.id); props.onSelect(node.id) }}
      onEdgeClick={(_, edge) => { setSelected(edge.id); props.onSelect(edge.id) }}
      onNodeDragStart={(_, node) => setDragging(node.id)}
      onNodeDragStop={(_, node) => { setDragging(null); props.onMove(node.id, Math.round(node.position.x - DIAGRAM_PAD + authoredOrigin.x), Math.round(node.position.y - DIAGRAM_PAD + authoredOrigin.y)) }}
      onConnect={(connection) => { if (connection.source !== null && connection.target !== null) props.onConnect(connection.source, connection.target) }}>
      <Background gap={16} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
    </ReactFlow>
  </div>
}
