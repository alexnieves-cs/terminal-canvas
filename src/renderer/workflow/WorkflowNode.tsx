import { useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import { applyDraftOp, select, useSelectedOf, useTemplateDraft } from './template-draft-store'
import { LIBRARY, defaultNodeOf, placementFor } from '@shared/template-library'
import { edgeWouldCycle } from '@shared/template-edit'
import { usePool, usePoolsLive } from './pool-store'
import { poolStoppedWord } from './pool-model'
import type { WorkflowPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { panelState } from '@renderer/panels/panel-state'
import { blockCount } from '@shared/workflow-nodes'
import { isBuiltInTemplate } from '@shared/templates'
import { capabilityLines, toolCapabilities } from '@shared/tool-spec'
import { projectRun, type RunLiveFact, type RunNodeSupervision } from '@shared/run-outcome'
import type { PersistedTemplate } from '@shared/templates'
import type { PersistedRun } from '@shared/runs'
import { buildDiagram, edgeWord, runsForTemplate, BLOCK_H, BLOCK_W, DIAGRAM_PAD } from './workflow-diagram'
import { autoLayout, completedWalk, diagramIssues, edgeGeometry, neighbourhood, runTimeline } from './workflow-graph'
import { AutoLayout, Check, History, More, Plus, Trigger, Warn, WORKFLOW_NODE_GLYPH } from '@renderer/icons'
import { WorkflowFlow, type WorkflowFlowApi } from './WorkflowFlow'

/** M183. Extra SVG room beyond the diagram's extent, for a drop or a wire past the last block. */
const DROP_ROOM = 220

/**
 * M133. THE WORKFLOW PANEL — the FOURTEENTH kind, sessionless like the work
 * card, and a VIEW of a template rather than a second editor of one.
 *
 * The graph is a React Flow island under the panel's own body. Its camera
 * and interaction state belong to this workflow only; template drafts remain
 * the truth and are still the only route that writes an authored node.
 *
 * The History drawer (M259; the Runs tab before it) is M79's records
 * filtered to this template — data that has existed since M79, needing no
 * store of its own — plus the selected run's timeline read back onto the
 * blocks (`workflow-graph.ts`).
 *
 * A panel whose template is GONE (deleted, or a layout restored from a
 * snapshot that never had it) renders one sentence and only Close, never a
 * blank body — the work card's own arm and for its reason.
 */
export interface WorkflowNodeProps {
  panel: WorkflowPanel
  /** The template, by the panel's id; undefined when no template answers to it any more. */
  template: PersistedTemplate | undefined
  /** The workspace's runs — filtered here to this template alone. */
  runs: readonly PersistedRun[]
  /** Main-owned live session and approval facts, projected onto the selected run only. */
  liveFacts: Readonly<Record<string, RunLiveFact>>
  onAnswer: (panelId: string, requestId: string, allow: boolean) => void
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  readOnly?: boolean
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  linkTarget: boolean
  /** Run it: M80's OWN instantiation, never a second copy of it. */
  onRun: (templateId: string) => void
  /** M184. Save the draft back to the record with the revision it was read at; `stale` answers with the standing record's reason. */
  onSave: (templateId: string) => Promise<{ kind: 'saved' } | { kind: 'stale'; reason: string } | { kind: 'refused'; reason: string }>
  /** M184. Save the draft as a NEW record (a built-in's only save, and the way out of a stale one). */
  onSaveCopy: (templateId: string) => Promise<{ kind: 'saved' } | { kind: 'refused'; reason: string }>
  /** M184. Discard the draft and take the record as it stands. */
  onReload: (templateId: string) => void
  /** Arm a trigger: a WATCHER on this template — `shared/watch-trigger.ts` unchanged. */
  onTrigger: (templateId: string) => void
  /** Delete the template; a built-in refuses, so the reason arrives as a prop. */
  onDelete: (templateId: string) => void
  /** Why Delete cannot act, or null. */
  deleteReason: string | null
  /** M138. Stop a live pool block; main interrupts its workers and kills none. */
  onStopRun: (templateId: string, runId?: string) => { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /**
   * Fix round 2. Why this shape cannot be run — `templateRefusal`'s sentence,
   * which since M132's blocks includes "<key> is a pool block, which cannot
   * run yet". Run is DISABLED with it, never removed and never half-run.
   */
  runReason: string | null
  /** Mint a chat pointed at this template's file and schema — §4.1's door, aimed at a template. */
  onBuildWithAi: (templateId: string) => void
  /**
   * M252. "I've read this" on an unread workflow (imported, or an agent's
   * answer) — a person's act with no verb behind it, so no agent can un-inert
   * its own output. Absent in a fixture, where the control is disabled.
   */
  onMarkRead?: (templateId: string) => void
}

export const REASON_MERGED_VIEW = 'leave merged view to act on this workflow'
export const TEMPLATE_GONE = 'that template is no longer saved'
/**
 * Save is DISABLED and says where the editor is, rather than being removed:
 * a row that disappears is indistinguishable from a feature never built.
 * There is no second editor here to save FROM — that is spec §9's whole
 * claim — so the sentence names the door that does work.
 */
export const REASON_NOTHING_TO_SAVE = 'nothing to save — the diagram matches the template'
/** M184. A stale save keeps the draft; these two verbs are the only ways out of it. */
/** M184. The Stop verb's subject is the run, not the pool — a chat mid-turn is running too. */
export const REASON_NOTHING_RUNNING = 'nothing of this workflow is running'
export const STALE_VERBS = 'Reload takes the record as it stands; Save a copy keeps your draft under a new name'
/**
 * M133, fix round 1. THREE STATES, NOT TWO, and this sentence is the third.
 *
 * A run learns its template from an origin map held in the renderer's own
 * ref (`useRuns.noteTemplate`), so a run of these panels in an EARLIER
 * session — or one the user wired by hand — records with no mark and cannot
 * be attributed. `Runs (0)` beside "no runs yet" would be a confident wrong
 * answer about work that really happened; the empty arm states the bound
 * instead, and the tab drops its count while nothing is attributable rather
 * than counting zero.
 */
export const RUNS_UNATTRIBUTED = 'no runs recorded since this app started - runs from earlier sessions are not attributed to a workflow'

/** M259. A block's kind in the strip's words — the library's own names, so the strip and the library never disagree. */
const KIND_NAME: Record<string, string> = Object.fromEntries(LIBRARY.map((e) => [e.kind, e.name]))
/**
 * M259. A kind's FAMILY decides its hue, never the kind itself: seven kinds
 * in seven saturated colours is the unrelated-colour failure the brief names.
 * Agents (a conversation leads, joins or answers) wear the accent; workers
 * over a list wear blue; the workflow's hands (a shell, a verb, a fetch) stay
 * neutral. The glyph and the strip's word carry the kind itself.
 */
const KIND_FAMILY: Record<string, 'agent' | 'worker' | 'hand'> = { chat: 'agent', orchestrator: 'agent', collect: 'agent', pool: 'worker', terminal: 'hand', action: 'hand', http: 'hand' }
/** What a refused wire says at the pointer — `addEdge`'s own three refusals, said before the release rather than after it. */
function wireRefusal(template: PersistedTemplate, from: string, over: string | null): string | null {
  if (over === null) return null
  if (over === from) return 'a block cannot hand off to itself'
  if (template.edges.some((x) => x.from === from && x.to === over)) return 'already connected'
  if (edgeWouldCycle(template.edges, from, over)) return 'would close a loop'
  return null
}
/** `+1.2s` — an offset on the run timeline; the rail's own arithmetic, shorter. */
function offsetWord(ms: number): string {
  const s = ms / 1000
  return s < 60 ? `+${s < 10 ? s.toFixed(1) : Math.round(s)}s` : `+${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`
}

const press = (fn: () => void) => (e: ReactMouseEvent): void => { e.stopPropagation(); e.preventDefault(); fn() }

/** `1m 04s`, `12s` — a run's duration, the rail's own arithmetic. */
function durationWord(run: PersistedRun): string {
  if (run.endedAt === undefined) return 'running'
  const total = Math.max(0, Math.round((run.endedAt - run.startedAt) / 1000))
  const m = Math.floor(total / 60)
  return m === 0 ? `${total}s` : `${m}m ${String(total % 60).padStart(2, '0')}s`
}

export function WorkflowNode(props: WorkflowNodeProps): JSX.Element {
  const { panel, template: saved } = props
  // M182. The DRAFT is what the diagram draws — the saved record until an
  // edit, then the edited copy, dirty until Save (M184) or a reload. Both
  // editors (this SVG's drag and the palette/agent verbs) go through the
  // store's one door, so the two views cannot disagree.
  const { template, dirty } = useTemplateDraft(panel.workflow.templateId, saved)
  // M259. History is a DRAWER beside the graph, not a tab over it: the run
  // timeline maps its events back onto the blocks, which it cannot do from
  // behind a tab that hides them.
  const [historyOpen, setHistoryOpen] = useState(false)
  // M259. A timeline row under the pointer lights its block.
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  // M182. A block DRAG on the diagram: a real pointer gesture on the SVG,
  // committed on release as ONE `moveNode` (one undo of the draft); the
  // offset during the gesture is view state. The panel's own drag is stopped
  // at the block, so the panel does not move with it.
  // M183. The selection is the draft store's fact (`select`/`useSelectedOf`):
  // a block key, or an edge as `from>to` — the inspector reads the same one.
  const selectedRaw = useSelectedOf(panel.workflow.templateId)
  const selectedBlock = selectedRaw !== null && !selectedRaw.includes('>') ? selectedRaw : null
  const selectedEdge = selectedRaw !== null && selectedRaw.includes('>') ? selectedRaw : null
  const setSelectedBlock = (key: string | null): void => select(panel.workflow.templateId, key)
  const [dragging, setDragging] = useState<{ key: string; dx: number; dy: number } | null>(null)
  // M183. The library drag (a ghost block under the pointer over the SVG)
  // and the port drag (a wire from a port to the pointer, the block under
  // it lit as allowed or refused). Both are real pointer gestures; both
  // commit ONE operation on release; a refusal shows for a moment.
  // M183 (the critic). The library OPENS: a 180 px column beside a 640 px panel
  // left half the diagram past the frame's edge at rest, and a block diagram
  // that cannot show its blocks is a worse resting state than the one before it.
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [ghost, setGhost] = useState<{ kind: string; x: number; y: number } | null>(null)
  const [wire, setWire] = useState<{ from: string; x1: number; y1: number; x2: number; y2: number; over: string | null; allowed: boolean; reason: string | null } | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  // M184. A stale save keeps the draft and offers the two verbs that can end it.
  const [stale, setStale] = useState<string | null>(null)
  // M184. The run whose outcome the diagram wears; null is the definition at rest.
  const [runId, setRunId] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  // The React Flow island's camera mapping — the live diagram's answer to toSvg.
  const flowApi = useRef<WorkflowFlowApi | null>(null)
  const say = (reason: string): void => { setRefusal(reason); window.setTimeout(() => setRefusal((r) => (r === reason ? null : r)), 4000) }
  /** A client point in the SVG's own units (the diagram's viewBox is 1:1 with its width). */
  const toSvg = (clientX: number, clientY: number): { x: number; y: number } | null => {
    if (flowApi.current !== null) return flowApi.current.toFlow(clientX, clientY)
    const svg = svgRef.current; if (svg === null) return null
    const ctm = svg.getScreenCTM(); if (ctm === null) return null
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }
  const blockAt = (x: number, y: number): string | null => {
    if (diagram === null) return null
    const hit = diagram.blocks.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
    return hit === undefined ? null : hit.key
  }
  const beginLibraryDrag = (kind: (typeof LIBRARY)[number]['kind'], e: ReactMouseEvent<HTMLLIElement>): void => {
    if (readOnly || template === undefined) return
    e.stopPropagation(); e.preventDefault()
    const from = { x: e.clientX, y: e.clientY }
    let moved = false
    const onMove = (ev: MouseEvent): void => { if (Math.abs(ev.clientX - from.x) > 3 || Math.abs(ev.clientY - from.y) > 3) moved = true; const p = toSvg(ev.clientX, ev.clientY); setGhost(p === null ? null : { kind, x: p.x, y: p.y }) }
    const onUp = (ev: MouseEvent): void => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      setGhost(null)
      // A press that never moved is not a drop: it does nothing and says
      // nothing (the entry's own Add control is the click door). Only a real
      // drag that landed off the diagram earns the sentence below.
      if (!moved) return
      const p = toSvg(ev.clientX, ev.clientY)
      if (p === null || diagram === null) return
      // Off the diagram is not a drop. The flow island answers by its own box
      // (its camera pans, so the diagram's extent no longer bounds a drop);
      // the legacy SVG by its viewBox plus the drop room.
      const inside = flowApi.current !== null
        ? flowApi.current.contains(ev.clientX, ev.clientY)
        : svgRef.current !== null && p.x >= 0 && p.y >= 0 && p.x <= diagram.width + DROP_ROOM && p.y <= diagram.height + DROP_ROOM
      if (!inside) { say('drop a node onto the diagram, or use its Add control'); return }
      // The diagram's own offset: its blocks sit at DIAGRAM_PAD + (dx - minX); invert it for the authored dx/dy.
      const minX = template.nodes.length === 0 ? 0 : Math.min(...template.nodes.map((n) => n.dx))
      const minY = template.nodes.length === 0 ? 0 : Math.min(...template.nodes.map((n) => n.dy))
      // The inverse of buildDiagram's own placement (x = PAD + dx - minX) for a block CENTRED on the pointer — in the diagram's exported constants, never literals: a changed pad would otherwise land every drop off its ghost with nothing on screen to say so.
      const dx = Math.round(p.x - DIAGRAM_PAD + minX - BLOCK_W / 2), dy = Math.round(p.y - DIAGRAM_PAD + minY - BLOCK_H / 2)
      const r = applyDraftOp(panel.workflow.templateId, saved, { type: 'add', node: { ...defaultNodeOf(kind), dx, dy } })
      // M259. The library COLLAPSES after a placement: it is a drawer you
      // reach into, and left open it keeps a third of the graph covered for
      // the rest of the edit. A refusal keeps it open for the second try.
      if (r.kind === 'refused') say(r.reason); else setLibraryOpen(false)
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }
  const addFromLibrary = (kind: (typeof LIBRARY)[number]['kind']): void => {
    if (readOnly || template === undefined) return
    const r = applyDraftOp(panel.workflow.templateId, saved, { type: 'add', node: { ...defaultNodeOf(kind), ...placementFor(template) } })
    if (r.kind === 'refused') say(r.reason); else setLibraryOpen(false)
  }
  /** M259. Auto layout: the proposal committed as ONE draft operation — one step, refused whole. */
  const arrange = (direction: 'horizontal' | 'vertical'): void => {
    if (readOnly || template === undefined) return
    const r = applyDraftOp(panel.workflow.templateId, saved, { type: 'arrange', moves: autoLayout(template, direction) })
    if (r.kind === 'refused') say(r.reason)
  }
  const beginWire = (from: string, e: ReactMouseEvent<SVGCircleElement>): void => {
    if (readOnly || template === undefined) return
    e.stopPropagation(); e.preventDefault()
    const start = toSvg(e.clientX, e.clientY); if (start === null) return
    const onMove = (ev: MouseEvent): void => {
      const p = toSvg(ev.clientX, ev.clientY); if (p === null) return
      const over = blockAt(p.x, p.y)
      // The preview answers with `addEdge`'s OWN rules — a cycle included: a
      // block lit as allowed and then refused on release is the preview failing
      // at the one job it has (the M183 critic).
      const reason = wireRefusal(template, from, over)
      setWire({ from, x1: start.x, y1: start.y, x2: p.x, y2: p.y, over, allowed: over !== null && reason === null, reason })
    }
    const onUp = (ev: MouseEvent): void => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      setWire(null)
      const p = toSvg(ev.clientX, ev.clientY); if (p === null) return
      const to = blockAt(p.x, p.y); if (to === null) return
      const r = applyDraftOp(panel.workflow.templateId, saved, { type: 'edge', from, to, trigger: 'exit' })
      if (r.kind === 'refused') say(r.reason)
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }
  const dragRef = useRef<{ key: string; startX: number; startY: number; scale: number; baseDx: number; baseDy: number } | null>(null)
  const beginBlockDrag = (key: string, e: ReactMouseEvent<SVGGElement>): void => {
    if (readOnly || template === undefined) return
    e.stopPropagation(); e.preventDefault()
    const node = template.nodes.find((n) => n.key === key)
    if (node === undefined) return
    // The SVG's own screen scale (the camera's scale times the viewBox's):
    // a screen delta divided by it is an authored-offset delta.
    const svg = (e.currentTarget as SVGGElement).ownerSVGElement
    const ctm = svg?.getScreenCTM()
    const scale = ctm === null || ctm === undefined || ctm.a === 0 ? 1 : ctm.a
    dragRef.current = { key, startX: e.clientX, startY: e.clientY, scale, baseDx: node.dx, baseDy: node.dy }
    setSelectedBlock(key)
    props.onFocus(panel.rect.id)
    const onMove = (ev: MouseEvent): void => {
      const d = dragRef.current; if (d === null) return
      setDragging({ key: d.key, dx: (ev.clientX - d.startX) / d.scale, dy: (ev.clientY - d.startY) / d.scale })
    }
    const onUp = (ev: MouseEvent): void => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      const d = dragRef.current; dragRef.current = null
      setDragging(null)
      if (d === null) return
      const ddx = (ev.clientX - d.startX) / d.scale, ddy = (ev.clientY - d.startY) / d.scale
      if (Math.abs(ddx) < 2 && Math.abs(ddy) < 2) return
      applyDraftOp(panel.workflow.templateId, saved, { type: 'move', key: d.key, dx: Math.round(d.baseDx + ddx), dy: Math.round(d.baseDy + ddy) })
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }
  // Delete on the selected block removes it from the draft — while THIS
  // panel is the selected one, in the capture phase so the canvas's own
  // Delete (a selected link or note) never sees it.
  // A stale selection is cleared: when the panel is deselected, and when the
  // key is no longer in the draft (removed through another door).
  useEffect(() => { if (!props.selected) setSelectedBlock(null) }, [props.selected])
  // The selection dies with the panel: a closed editor must not leave a block
  // highlighted for the next panel that opens this template.
  useEffect(() => () => select(panel.workflow.templateId, null), [panel.workflow.templateId])
  useEffect(() => { if (selectedBlock !== null && template !== undefined && !template.nodes.some((n) => n.key === selectedBlock)) setSelectedBlock(null) }, [template, selectedBlock])
  // A selected EDGE: Delete removes it (M183).
  useEffect(() => {
    if (!props.selected || selectedEdge === null) return
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
      const target = ev.target as HTMLElement | null
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      const [from, to] = selectedEdge.split('>') as [string, string]
      const r = applyDraftOp(panel.workflow.templateId, saved, { type: 'unedge', from, to })
      select(panel.workflow.templateId, null)
      if (r.kind === 'ok') { ev.preventDefault(); ev.stopPropagation() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [props.selected, selectedEdge, panel.workflow.templateId, saved])
  useEffect(() => {
    if (!props.selected || selectedBlock === null) return
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return
      const target = ev.target as HTMLElement | null
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      const r = applyDraftOp(panel.workflow.templateId, saved, { type: 'remove', key: selectedBlock })
      setSelectedBlock(null)
      // Only a remove that happened is this listener's to stop; otherwise the canvas's own Delete keeps its turn.
      if (r.kind === 'ok') { ev.preventDefault(); ev.stopPropagation() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [props.selected, selectedBlock, panel.workflow.templateId, saved])
  const readOnly = props.readOnly === true
  const state = panelState({ kind: 'workflow', status: undefined, dormant: false }, undefined)
  // M184 (the critic, 15d). A run selection outlives its run — a workspace
  // switch, a rebind, or the run ageing past RUNS_MAX leaves `runId` naming
  // nothing, and the diagram then wears no outcome with the Runs tab still
  // showing a selected row. Cleared where the list is known.
  const mine = useMemo(() => (template === undefined ? [] : runsForTemplate(props.runs, template.id)), [props.runs, template])
  // M184. The selected run's outcome per node key, from the run's OWN snapshot.
  const selectedRun = runId === null ? undefined : mine.find((r) => r.id === runId)
  const outcomes: Record<string, RunNodeSupervision> = selectedRun === undefined ? {} : projectRun(selectedRun, props.liveFacts)
  const blocker = Object.entries(outcomes).find(([, value]) => value.blocker !== undefined)
  const runNotice = blocker ?? Object.entries(outcomes).find(([, value]) => value.execution === 'queued')
  // M184 (the critic, finding 2). The BLOCKS come from the snapshot too, not
  // only the words: a node deleted after a run vanished from that run's view
  // and a node added rendered `queued` in a run that never held it. A run is
  // a picture of the shape that ran.
  const drawn = selectedRun?.definition === undefined || template === undefined
    ? template
    : { ...template, nodes: selectedRun.definition.nodes, edges: selectedRun.definition.edges }
  const diagram = useMemo(() => (drawn === undefined ? null : buildDiagram(drawn)), [drawn])
  useEffect(() => { if (runId !== null && !mine.some((r) => r.id === runId)) setRunId(null) }, [mine, runId])
  // M184 (the critic, 15e). The stale strip describes ONE refused save. Once
  // the draft moves under it, its reason describes an older attempt and its
  // Reload would discard edits the reason never mentioned.
  useEffect(() => { setStale(null) }, [template])
  // M138. The pool blocks of this template, and which are live — Stop is
  // PRESENT always and disabled by name while none runs, never absent.
  const poolKeys = useMemo(() => (template === undefined ? [] : template.nodes.filter((n) => n.kind === 'pool').map((n) => n.key)), [template])
  const livePools = usePoolsLive(panel.workflow.templateId, poolKeys)
  // M184 (the critic, finding 3). A workflow of three chats mid-turn IS
  // running: an open run of this template is the fact, and `no pool is
  // running` was a true sentence about the wrong subject.
  const stoppable = livePools.length > 0 || mine.some((r) => r.endedAt === undefined && (runId === null || r.id === runId))

  /**
   * M133 critic wave, re-homed by M259. A disabled verb's reason is reachable
   * ON SCREEN, not in `title` alone — but it no longer prints as a column of
   * prose between the toolbar and the graph. Every reason is a line in the
   * STATUS popover at the toolbar's end (revealed on hover or focus, the
   * chrome's own rule), and each disabled control still carries its reason in
   * its own `title`, which is what a pointer and a screen reader both reach.
   */
  const disabled: { label: string; why: string }[] = []
  const verb = (key: string, label: string, own: string | null, run: () => void, icon?: JSX.Element): JSX.Element => {
    const reason = readOnly ? REASON_MERGED_VIEW : own
    if (reason !== null) disabled.push({ label, why: reason })
    return (
      <button type="button" className={`pf__verb pf__verb--word${icon === undefined ? '' : ' workflow-node__tool'}`} data-workflow-verb={key} disabled={reason !== null}
        title={reason ?? label} onMouseDown={press(() => { if (reason === null) run() })}>{icon}<span>{label}</span></button>
    )
  }
  /** The arrowhead's id is per PANEL: two workflow panels on one canvas share a document. */
  const isBuiltIn = isBuiltInTemplate(panel.workflow.templateId)
  const arrowId = `wf-arrow-${panel.rect.id}`
  const arrowLitId = `wf-arrow-lit-${panel.rect.id}`
  const id = template?.id ?? panel.workflow.templateId

  // M259. What is incomplete, on the shape being DRAWN (a run's snapshot when one is selected).
  const issues = useMemo(() => (drawn === undefined ? {} : diagramIssues(drawn)), [drawn])
  const issueCount = Object.values(issues).reduce((n, list) => n + list.length, 0)
  // M259. A selected block lights its lineage and quiets everything else.
  const hood = useMemo(() => (selectedBlock === null || drawn === undefined ? null : neighbourhood(drawn.edges, selectedBlock)), [selectedBlock, drawn])
  // Memoised: the flow island derives its nodes from these, and a fresh Set every render would reset a block under a drag in flight.
  const litBlocks = useMemo(() => (hood === null ? null : new Set([...hood.up, ...hood.down, selectedBlock as string])), [hood, selectedBlock])
  const litEdges = useMemo(() => (hood === null ? null : new Set(hood.edges)), [hood])
  // M259. The traveling highlight: completed blocks, and the finished path
  // between them walked once in rank order. An edge animates the first time
  // it JOINS the walk for this run — a newly finished handoff during a live
  // run moves once, and a re-render never replays one that already moved.
  const done = useMemo(() => new Set(Object.entries(outcomes).filter(([, o]) => o.execution === 'ended' && (o.result === 'passed' || o.result === 'turn-complete')).map(([k]) => k)), [outcomes])
  const walk = useMemo(() => (drawn === undefined || runId === null ? [] : completedWalk(drawn.edges, done)), [drawn, done, runId])
  // The step each edge animates at is PINNED the first time it joins the
  // walk: the overlay stays mounted (its one animation ends on opacity 0), so
  // a later render neither replays it nor cuts it short. Idempotent, so a
  // double render writes the same pins.
  const walked = useRef<{ runId: string | null; step: Map<string, number> }>({ runId: null, step: new Map() })
  if (walked.current.runId !== runId) walked.current = { runId, step: new Map() }
  const fresh = walk.filter((w) => !walked.current.step.has(w.edge))
  const firstFresh = fresh.length === 0 ? 0 : Math.min(...fresh.map((w) => w.step))
  for (const w of fresh) walked.current.step.set(w.edge, w.step - firstFresh)
  const flowStep = walked.current.step
  // M259. The run timeline, read back onto the blocks.
  const timeline = useMemo(() => (selectedRun === undefined ? [] : runTimeline(selectedRun)), [selectedRun])
  const timelineTotal = selectedRun === undefined ? 1 : Math.max(1, (selectedRun.endedAt ?? Math.max(selectedRun.startedAt, ...timeline.map((r) => selectedRun.startedAt + r.offset + (r.span ?? 0)))) - selectedRun.startedAt)
  const labelOf = (key: string): string => diagram?.blocks.find((b) => b.key === key)?.label ?? key
  // The one status word the toolbar shows at rest: unsaved beats incomplete, and nothing is said when neither holds (the rest rule — never a zero-value statement).
  const statusWord = dirty ? 'Unsaved' : issueCount > 0 ? `${issueCount} to finish` : null

  // Every verb is BUILT here, before the JSX: `verb()` records its reason as
  // it runs, and the status popover renders ahead of the overflow menu in the
  // tree — built inline, Stop/Save/Delete would register after the popover
  // had already read the list, and their reasons would never reach it
  // (verify:panels workflow.save.1 caught exactly that).
  const runVerb = verb('run', 'Run', props.runReason, () => props.onRun(id))
  // M137. A trigger on a shape that cannot run would fire into a refusal every tick; it is disabled with Run's own sentence.
  const triggerVerb = verb('triggers', 'Edit trigger', props.runReason, () => props.onTrigger(id), <Trigger size={13} />)
  // M184. Stop is the SELECTED run's when one is selected, and every open run of this workflow otherwise. Present always, disabled by name.
  const stopVerb = verb('stop', 'Stop', stoppable ? null : REASON_NOTHING_RUNNING, () => { const r = props.onStopRun(id, runId ?? undefined); if (r.kind === 'refused') say(r.reason) })
  // M184. Save is enabled while the draft is dirty and says so otherwise; a built-in saves as a COPY (M80's rule), which is also the way out of a stale save.
  const saveVerb = isBuiltIn
    ? verb('save', 'Save a copy', null, () => { void props.onSaveCopy(id).then((r) => { if (r.kind === 'refused') say(r.reason) }) })
    : verb('save', 'Save', dirty ? null : REASON_NOTHING_TO_SAVE, () => { void props.onSave(id).then((r) => { if (r.kind === 'stale') setStale(r.reason); else if (r.kind === 'refused') say(r.reason); else setStale(null) }) })
  const deleteVerb = verb('delete', 'Delete', props.deleteReason, () => props.onDelete(id))
  const buildVerb = verb('build', 'Build with AI', null, () => props.onBuildWithAi(id))
  // Kept temporarily while the React Flow migration is reviewed; this branch
  // never renders, and all visible graph interaction is the Flow island.
  const renderLegacyDiagram: boolean = false

  return (
    <PanelFrame
      id={panel.rect.id}
      kind="workflow"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={readOnly}
      className="workflow-node"
      rootAttrs={{ 'data-workflow-node': '', 'data-workflow-template': panel.workflow.templateId, 'data-workflow-dirty': dirty ? 'true' : 'false', ...(selectedBlock === null ? {} : { 'data-workflow-selected': selectedBlock }) }}
      title={template?.name ?? panel.title ?? 'workflow'}
      state={state}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
      close={readOnly ? null : { armed: false, title: 'Close', armedText: '', onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(panel.rect.id) } }}
      chrome={template === undefined ? undefined : (
        // The block count is the header readout `blockCount()` answers —
        // NODES, not edges — and it is read from the record every render, so
        // it cannot disagree with the diagram beneath it.
        <span className="pf__summary workflow-node__count" data-workflow-count>{blockCount(template)} block{blockCount(template) === 1 ? '' : 's'}</span>
      )}
    >
      <div className="pf__body pf__body--text workflow-node__body" data-scroll-host onMouseDown={(e) => { e.stopPropagation(); props.onFocus(panel.rect.id) }}>
        {template === undefined || diagram === null ? (
          <p className="pf__note workflow-node__gone" data-workflow-arm="gone">{TEMPLATE_GONE}</p>
        ) : (
          <>
            {/* M252. An unread workflow says so ABOVE its verbs, with what it
                would run and reach — read off its blocks, never off what it
                says about itself — and the one control that allows runs. */}
            {template.reviewed === false && (() => {
              const lines = capabilityLines(toolCapabilities({ kind: 'workflow', nodes: template.nodes }))
              return (
                <div className="workflow-node__unread" data-workflow-unread role="status">
                  <p className="pf__note">Not read yet — this workflow came from outside this canvas (a file, or an agent's answer). Its action blocks are refused by name until you read them.</p>
                  <p className="pf__note" data-workflow-reach="commands">runs · {lines.commands}</p>
                  <p className="pf__note" data-workflow-reach="network">reaches · {lines.network}</p>
                  <p className="pf__note" data-workflow-reach="files">works in · {lines.files}</p>
                  <button type="button" className="pf__verb pf__verb--word" data-workflow-mark-read disabled={readOnly === true || props.onMarkRead === undefined}
                    title={readOnly === true ? REASON_MERGED_VIEW : 'You have read every block above — allow this workflow to run'}
                    onMouseDown={press(() => props.onMarkRead?.(id))}>I've read this — allow runs</button>
                </div>
              )
            })()}
            {/* M259. ONE toolbar: Run, Add node, Edit trigger, History — the
                four things a person does to a workflow — then the status and
                one overflow for the rest. It replaces two rows (verbs, then
                tabs) and the column of reasons that sat between them. */}
            <div className="workflow-node__verbs" data-workflow-verbs role="toolbar" aria-label="Workflow">
              {runVerb}
              {!readOnly && (
                <button type="button" className="pf__verb pf__verb--word workflow-node__tool workflow-node__library-toggle" data-workflow-library-toggle aria-expanded={libraryOpen} aria-pressed={libraryOpen}
                  title={libraryOpen ? 'Hide the node library' : 'Show the node library — drag a kind onto the diagram'}
                  onMouseDown={press(() => setLibraryOpen((v) => !v))}><Plus size={13} /><span>Add node</span></button>
              )}
              {triggerVerb}
              <button type="button" className="pf__verb pf__verb--word workflow-node__tool workflow-node__tab" data-workflow-tab="runs" aria-pressed={historyOpen} aria-expanded={historyOpen}
                title={historyOpen ? 'Hide the run history' : 'Show the run history and its timeline'}
                onMouseDown={press(() => setHistoryOpen((v) => !v))}><History size={13} /><span>{mine.length === 0 ? 'History' : `History (${mine.length})`}</span></button>
              <span className="workflow-node__spacer" />
              {/* M259. The status: one word at rest when there is one to say,
                  and the popover of every reason and every unfinished block
                  on hover or focus — the prose that used to sit above the graph. */}
              <span className="workflow-node__status" data-workflow-status={dirty ? 'unsaved' : issueCount > 0 ? 'incomplete' : 'clean'} tabIndex={0}
                aria-label={statusWord ?? 'Workflow status'}>
                {statusWord === null ? <span className="workflow-node__status-dot" /> : <span className="workflow-node__status-word">{statusWord}</span>}
                <span className="workflow-node__why" data-workflow-why role="note">
                  {Object.entries(issues).map(([key, list]) => list.map((s) => (
                    <span key={`${key}:${s}`} className="pf__note workflow-node__why-line workflow-node__why-line--issue" data-workflow-why-issue={key}>{`${labelOf(key)} — ${s}`}</span>
                  )))}
                  {disabled.map((d) => (
                    <span key={d.label} className="pf__note workflow-node__why-line" data-workflow-why-verb={d.label}>{`${d.label} — ${d.why}`}</span>
                  ))}
                  {issueCount === 0 && disabled.length === 0 && <span className="pf__note workflow-node__why-line">Every block is complete and every action can run.</span>}
                </span>
              </span>
              <button type="button" className="pf__verb workflow-node__more" data-workflow-more
                aria-expanded={actionsOpen} aria-label={actionsOpen ? 'Hide workflow actions' : 'More workflow actions'} title={actionsOpen ? 'Hide workflow actions' : 'Stop, save, delete and build actions'}
                // The opener acts on CLICK, not mousedown: Stop, Save, Delete and
                // Build live only behind it, and Enter/Space fire click, never
                // mousedown — a press()-only ⋯ left them unreachable by keyboard
                // (verify:panels product reach.3). Mousedown still swallows, so the
                // body's focus handler and a canvas drag never see the press.
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                onClick={(e) => { e.stopPropagation(); setActionsOpen((v) => !v) }}><More size={14} /></button>
              <div className="workflow-node__more-actions" data-workflow-more-actions hidden={!actionsOpen}>
              {stopVerb}
              {saveVerb}
              {deleteVerb}
              {buildVerb}
              </div>
            </div>
            {stale !== null && (
              <div className="workflow-node__stale" data-workflow-stale role="status">
                <p className="pf__note workflow-node__stale-line">{stale}</p>
                <p className="pf__note workflow-node__stale-line">{STALE_VERBS}</p>
                <button type="button" className="pf__verb pf__verb--word" data-workflow-verb="reload" onMouseDown={press(() => { props.onReload(id); setStale(null) })}>Reload</button>
                <button type="button" className="pf__verb pf__verb--word" data-workflow-verb="save-copy" onMouseDown={press(() => { void props.onSaveCopy(id).then((r) => { if (r.kind === 'refused') say(r.reason); else setStale(null) }) })}>Save a copy</button>
              </div>
            )}
            <div className="workflow-node__stage">
              {/* M183. THE LIBRARY: one entry per kind, dragged onto the diagram or
                  added at the placement point through its control (keyboard reach).
                  M259: a left drawer with each kind's glyph, closed again by a placement. */}
              {!readOnly && libraryOpen && (
                <ul className="workflow-node__library" data-workflow-library aria-label="Node library">
                  {LIBRARY.map((entry) => {
                    const Glyph = WORKFLOW_NODE_GLYPH[entry.kind]
                    return (
                      <li key={entry.kind} className="workflow-node__entry" data-workflow-library-kind={entry.kind} data-family={KIND_FAMILY[entry.kind]} title={`Drag onto the diagram, or Add — for example: ${entry.example}`}
                        onMouseDown={(e) => beginLibraryDrag(entry.kind, e)}>
                        <span className="workflow-node__entry-glyph"><Glyph size={14} /></span>
                        <span className="workflow-node__entry-text">
                          <span className="workflow-node__entry-name">{entry.name}</span>
                          <span className="workflow-node__entry-sentence">{entry.sentence}</span>
                        </span>
                        <button type="button" className="pf__verb workflow-node__entry-add" data-workflow-library-add aria-label={`Add a ${entry.name.toLowerCase()} node`} title={`Add a ${entry.name.toLowerCase()} node`} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }} onClick={(e) => { e.stopPropagation(); addFromLibrary(entry.kind) }}><Plus size={12} /></button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <section className="workflow-node__pane workflow-node__editor" data-workflow-panel="definition">
                {refusal !== null && <p className="pf__note workflow-node__refusal" data-workflow-refusal role="status">{refusal}</p>}
                {/* M259. Auto layout, floating in the graph's corner: the
                    contextual layer (revealed on hover), two directions. */}
                {!readOnly && (
                  <div className="workflow-node__layout" role="group" aria-label="Auto layout">
                    {(['horizontal', 'vertical'] as const).map((dir) => (
                      <button key={dir} type="button" className="pf__verb workflow-node__layout-btn" data-workflow-layout={dir} disabled={template.nodes.length < 2}
                        aria-label={`Arrange ${dir === 'horizontal' ? 'left to right' : 'top to bottom'}`}
                        title={template.nodes.length < 2 ? 'nothing to arrange — one block' : `Arrange ${dir === 'horizontal' ? 'left to right' : 'top to bottom'}`}
                        onMouseDown={press(() => arrange(dir))}><span className={`workflow-node__layout-glyph workflow-node__layout-glyph--${dir}`}><AutoLayout size={13} /></span></button>
                    ))}
                  </div>
                )}
                {/* This scroller hosts a self-contained React Flow camera. */}
                <div className="workflow-node__scroll" data-workflow-scroll>
                {renderLegacyDiagram && <svg ref={svgRef} className={`workflow-node__diagram${wire !== null ? ' workflow-node__diagram--wiring' : ''}${litBlocks !== null ? ' workflow-node__diagram--focus' : ''}`} data-workflow-diagram viewBox={`0 0 ${diagram.width + (readOnly ? 0 : DROP_ROOM)} ${diagram.height + (readOnly ? 0 : DROP_ROOM)}`}
                  width={diagram.width + (readOnly ? 0 : DROP_ROOM)} height={diagram.height + (readOnly ? 0 : DROP_ROOM)} role="img" aria-label={`${template.name}, ${blockCount(template)} blocks`}
                  onMouseDown={(e) => { if (e.target === e.currentTarget) select(panel.workflow.templateId, null) }}>
                  {/* An edge has a DIRECTION and the record knows it. One
                      marker at the TARGET end, and a lit twin for a path. */}
                  <defs>
                    <marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                      <path className="workflow-node__arrow" d="M 0 1 L 9 5 L 0 9 z" />
                    </marker>
                    <marker id={arrowLitId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                      <path className="workflow-node__arrow workflow-node__arrow--lit" d="M 0 1 L 9 5 L 0 9 z" />
                    </marker>
                  </defs>
                  {diagram.edges.map((e) => {
                    const from = diagram.blocks.find((b) => b.key === e.from)
                    const to = diagram.blocks.find((b) => b.key === e.to)
                    if (from === undefined || to === undefined) return null
                    // M259. Border to border on a CURVE out of the facing
                    // sides (workflow-graph's edgeGeometry), a dragged block's
                    // offset applied so its edges follow the pointer, and the
                    // trigger's word sitting ON the curve it names.
                    const shift = (b: typeof from): typeof from => (dragging !== null && dragging.key === b.key ? { ...b, x: b.x + dragging.dx, y: b.y + dragging.dy } : b)
                    const g = edgeGeometry(shift(from), shift(to))
                    const word = edgeWord(e)
                    // An SVG cannot measure its text before layout; the UI face's advance at --t-xs is ~5.9px.
                    const wordW = word.length * 5.9 + 14
                    const edgeKey = `${e.from}>${e.to}`
                    const lit = litEdges?.has(edgeKey) === true || selectedEdge === edgeKey
                    const isDone = walk.some((w) => w.edge === edgeKey)
                    const flow = flowStep.get(edgeKey)
                    return (
                      <g key={`${e.from}:${e.to}`} data-workflow-edge={edgeKey}
                        data-lit={lit ? 'true' : undefined} data-dim={litEdges !== null && !lit ? 'true' : undefined} data-done={isDone ? 'true' : undefined}
                        className={selectedEdge === edgeKey ? 'workflow-node__edgeg workflow-node__edgeg--selected' : 'workflow-node__edgeg'}
                        onMouseDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); select(panel.workflow.templateId, edgeKey); props.onFocus(panel.rect.id) }}>
                        {/* A wide invisible twin: a 2px curve is a hard thing to click. */}
                        <path className="workflow-node__hit" d={g.d} />
                        <path className="workflow-node__line" d={g.d} markerEnd={`url(#${lit || isDone ? arrowLitId : arrowId})`} />
                        {flow !== undefined && (
                          <path key={`${runId}:${edgeKey}`} className="workflow-node__flow" data-workflow-flow={edgeKey} d={g.d} pathLength={1}
                            style={{ ['--wf-step' as string]: String(flow) }} />
                        )}
                        <rect className="workflow-node__edge-ground" x={g.mx - wordW / 2} y={g.my - 9} width={wordW} height={18} rx={9} />
                        <text className="workflow-node__edge-word" x={g.mx} y={g.my + 3.5} textAnchor="middle">{word}</text>
                      </g>
                    )
                  })}
                  {diagram.blocks.map((b) => {
                    const off = dragging !== null && dragging.key === b.key ? dragging : { dx: 0, dy: 0 }
                    const node = drawn?.nodes.find((n) => n.key === b.key)
                    const kind = node?.kind ?? 'terminal'
                    const Glyph = WORKFLOW_NODE_GLYPH[kind]
                    const own = issues[b.key]
                    // The strip names the kind, so the sublabel's detail drops its own kind prefix rather than saying it twice.
                    const detail = b.sublabel.includes(' · ') ? b.sublabel.slice(b.sublabel.indexOf(' · ') + 3) : ''
                    const outcome = outcomes[b.key]
                    const blockClass = ['workflow-node__blockg',
                      selectedBlock === b.key ? 'workflow-node__blockg--selected' : '',
                      wire !== null && wire.over === b.key ? (wire.allowed ? 'workflow-node__blockg--target' : 'workflow-node__blockg--refused') : '',
                      hoverKey === b.key ? 'workflow-node__blockg--hover' : ''].filter((c) => c !== '').join(' ')
                    return (
                      <g key={b.key} data-workflow-block={b.key} data-workflow-block-selected={selectedBlock === b.key ? 'true' : undefined}
                        data-workflow-block-kind={kind} data-family={KIND_FAMILY[kind]}
                        data-workflow-outcome={outcome?.word}
                        data-tone={outcome?.tone}
                        data-workflow-done={done.has(b.key) ? 'true' : undefined}
                        data-workflow-issue={own === undefined ? undefined : 'true'}
                        data-lit={litBlocks?.has(b.key) === true ? 'true' : undefined} data-dim={litBlocks !== null && !litBlocks.has(b.key) ? 'true' : undefined}
                        className={blockClass}
                        transform={off.dx === 0 && off.dy === 0 ? undefined : `translate(${off.dx} ${off.dy})`}
                        onMouseDown={(e) => beginBlockDrag(b.key, e)}>
                        <rect className="workflow-node__block" x={b.x} y={b.y} width={b.w} height={b.h} rx={8} />
                        {/* M259. The title strip: glyph and kind, in the family's quiet tint. */}
                        <path className="workflow-node__strip" d={`M ${b.x} ${b.y + 18} V ${b.y + 8} a 8 8 0 0 1 8 -8 H ${b.x + b.w - 8} a 8 8 0 0 1 8 8 V ${b.y + 18} Z`} />
                        <g className="workflow-node__glyph" transform={`translate(${b.x + 9} ${b.y + 3})`}><Glyph size={12} /></g>
                        <text className="workflow-node__kind" x={b.x + 26} y={b.y + 13}>{KIND_NAME[kind] ?? kind}</text>
                        {done.has(b.key) && <g className="workflow-node__done" data-workflow-check transform={`translate(${b.x + b.w - 21} ${b.y + 3})`}><Check size={12} /></g>}
                        {own !== undefined && !done.has(b.key) && (
                          <g className="workflow-node__issue" data-workflow-block-issue={b.key} transform={`translate(${b.x + b.w - 21} ${b.y + 3})`}>
                            <title>{own.join('; ')}</title>
                            <Warn size={12} />
                          </g>
                        )}
                        <text className="workflow-node__block-label" x={b.x + 10} y={b.y + 37}>{b.label}</text>
                        {/* M184 (the critic, 12). The sublabel STAYS while a run
                            is selected, with the outcome word right-aligned beside it.
                            The full sublabel (kind first) rides a title for a reader
                            that never sees the strip. */}
                        <text className="workflow-node__block-sub" x={b.x + 10} y={b.y + 54}><title>{b.sublabel}</title>{detail === '' && own !== undefined ? own[0] : detail}</text>
                        {outcome !== undefined && (
                          <text className="workflow-node__block-outcome" x={b.x + b.w - 10} y={b.y + 54} textAnchor="end">{outcome.word}</text>
                        )}
                        {/* M183. The port on the right edge: a wire starts here.
                            M259: revealed on the block's hover and while wiring, never at rest. */}
                        {!readOnly && <circle className="workflow-node__port" data-workflow-port cx={b.x + b.w} cy={b.y + b.h / 2} r={5} onMouseDown={(e) => beginWire(b.key, e)} />}
                      </g>
                    )
                  })}
                  {wire !== null && (
                    <g className="workflow-node__wiring">
                      <line className={`workflow-node__wire${wire.reason !== null ? ' workflow-node__wire--refused' : ''}`} data-workflow-wire x1={wire.x1} y1={wire.y1} x2={wire.x2} y2={wire.y2} />
                      {/* M259. An invalid connection says so AT the pointer, before the release. */}
                      {wire.reason !== null && (
                        <g data-workflow-wire-reason>
                          <rect className="workflow-node__wire-ground" x={wire.x2 + 10} y={wire.y2 - 22} width={wire.reason.length * 5.9 + 14} height={18} rx={9} />
                          <text className="workflow-node__wire-word" x={wire.x2 + 17} y={wire.y2 - 9.5}>{wire.reason}</text>
                        </g>
                      )}
                    </g>
                  )}
                  {ghost !== null && <rect className="workflow-node__ghost" data-workflow-ghost x={ghost.x - BLOCK_W / 2} y={ghost.y - BLOCK_H / 2} width={BLOCK_W} height={BLOCK_H} rx={8} />}
                </svg>}
                <WorkflowFlow
                  panelId={panel.rect.id}
                  template={drawn ?? template}
                  readOnly={readOnly}
                  selected={selectedRaw}
                  issues={issues}
                  litBlocks={litBlocks}
                  litEdges={litEdges}
                  wireRefusal={(from, over) => (template === undefined ? null : wireRefusal(template, from, over))}
                  ghost={ghost === null ? null : { x: ghost.x, y: ghost.y }}
                  apiRef={flowApi}
                  onSelect={(key) => { select(panel.workflow.templateId, key); props.onFocus(panel.rect.id) }}
                  onMove={(key, dx, dy) => { const result = applyDraftOp(panel.workflow.templateId, saved, { type: 'move', key, dx, dy }); if (result.kind === 'refused') say(result.reason) }}
                  onConnect={(from, to) => { const result = applyDraftOp(panel.workflow.templateId, saved, { type: 'edge', from, to, trigger: 'exit' }); if (result.kind === 'refused') say(result.reason) }}
                />
                </div>
                {runNotice !== undefined && (() => {
                  const [key, supervision] = runNotice
                  const label = labelOf(key)
                  return (
                    <div className="workflow-node__blocker" data-workflow-run-state={key} data-workflow-run-blocker={supervision.blocker === undefined ? undefined : key} data-tone={supervision.tone} role="status">
                      <p className="pf__note"><strong>{label}</strong> — {supervision.detail}</p>
                      {supervision.approval !== undefined && supervision.panelId !== undefined && !readOnly && (
                        <div className="workflow-node__blocker-verbs">
                          <button type="button" className="pf__verb pf__verb--word" data-workflow-approval="allow" onMouseDown={press(() => props.onAnswer(supervision.panelId as string, supervision.approval?.requestId as string, true))}>Allow</button>
                          <button type="button" className="pf__verb pf__verb--word" data-workflow-approval="deny" onMouseDown={press(() => props.onAnswer(supervision.panelId as string, supervision.approval?.requestId as string, false))}>Deny</button>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </section>
              <section className="workflow-node__pane workflow-node__history" data-workflow-panel="runs" aria-label="Run history" hidden={!historyOpen}>
                {/* Three states, never two: nothing recorded yet is a SENTENCE,
                    not an empty box — an empty box reads as a drawer that broke. */}
                {/* M138. The pool blocks first: per item, what main said. */}
                {poolKeys.map((k) => <PoolRows key={k} templateId={id} blockKey={k} />)}
                {mine.length === 0 ? (
                  <p className="pf__note workflow-node__empty" data-workflow-runs-empty>{RUNS_UNATTRIBUTED}</p>
                ) : (
                  <ul className="workflow-node__runs" data-workflow-runs>
                    {mine.map((r) => (
                      <li key={r.id} className={`workflow-node__run${runId === r.id ? ' workflow-node__run--selected' : ''}`} data-workflow-run={r.id} data-workflow-run-selected={runId === r.id ? 'true' : undefined}
                        title={runId === r.id ? 'Show the definition again' : 'Show this run on the graph'}
                        onMouseDown={press(() => setRunId((v) => (v === r.id ? null : r.id)))}>
                        <span className="workflow-node__run-name">{r.name}{r.definition === undefined ? '' : ` · ${r.definition.revision < 0 ? 'unsaved' : `revision ${r.definition.revision}`}`}</span>
                        <span className="workflow-node__run-facts">{r.panelIds.length} panel{r.panelIds.length === 1 ? '' : 's'} - {durationWord(r)}{r.costUsd === undefined ? '' : ` - $${r.costUsd.toFixed(2)}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {/* M259. THE TIMELINE: the selected run's events, each row a
                    block — hover lights it on the graph, a press selects it. */}
                {selectedRun !== undefined && (
                  <div className="workflow-node__timeline" data-workflow-timeline={selectedRun.id}>
                    <h4 className="workflow-node__timeline-title">Timeline</h4>
                    {timeline.length === 0 ? (
                      <p className="pf__note workflow-node__empty" data-workflow-timeline-empty>this run was recorded before runs kept their blocks — its events cannot be placed on the graph</p>
                    ) : (
                      <ol className="workflow-node__events">
                        {timeline.map((row) => {
                          const o = outcomes[row.key]
                          const left = (row.offset / timelineTotal) * 100
                          const width = row.span === undefined ? 100 - left : Math.max(1.5, (row.span / timelineTotal) * 100)
                          return (
                            <li key={`${row.key}:${row.offset}`} className="workflow-node__event" data-workflow-event={row.key} data-tone={o?.tone}
                              data-open={row.span === undefined ? 'true' : undefined}
                              onMouseEnter={() => setHoverKey(row.key)} onMouseLeave={() => setHoverKey((k) => (k === row.key ? null : k))}
                              onMouseDown={press(() => { setSelectedBlock(row.key); props.onFocus(panel.rect.id) })}>
                              <span className="workflow-node__event-name">{labelOf(row.key)}</span>
                              <span className="workflow-node__event-word">{o?.word ?? row.outcome ?? 'running'}</span>
                              <span className="workflow-node__event-track"><span className="workflow-node__event-bar" style={{ left: `${left}%`, width: `${width}%` }} /></span>
                              <span className="workflow-node__event-when">{offsetWord(row.offset)}</span>
                            </li>
                          )
                        })}
                      </ol>
                    )}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </PanelFrame>
  )
}

/**
 * M138. One pool block's rows in the Runs tab — a projection of main's
 * events (`pool-model.ts`), never a count the renderer made up. Three arms:
 * nothing yet (one sentence, not an empty list), the items with their states,
 * and the closing row (done / stopped / refused) with main's reason.
 */
function PoolRows({ templateId, blockKey }: { templateId: string; blockKey: string }): JSX.Element {
  const pool = usePool(templateId, blockKey)
  return (
    <section className="workflow-node__pool" data-workflow-pool={blockKey}>
      <h4 className="workflow-node__pool-title">{blockKey} · pool</h4>
      {pool.items.length === 0 && pool.refused === undefined ? (
        <p className="pf__note workflow-node__empty" data-workflow-pool-empty>not run yet — Run starts the workers</p>
      ) : (
        <ul className="workflow-node__runs" data-workflow-pool-items>
          {pool.items.map((row) => (
            <li key={row.item} className="workflow-node__run" data-workflow-pool-item={row.item} data-workflow-pool-state={row.state}>
              <span className="workflow-node__run-name">{row.item}</span>
              <span className="workflow-node__run-facts">{row.state}{row.id === undefined ? '' : ` · ${row.id}`}</span>
            </li>
          ))}
        </ul>
      )}
      {pool.refused !== undefined && <p className="pf__note workflow-node__pool-refused" data-workflow-pool-refused>{`refused — ${pool.refused}`}</p>}
      {pool.stopped !== undefined && <p className="pf__note workflow-node__pool-stopped" data-workflow-pool-stopped>{poolStoppedWord(pool.stopped)}</p>}
    </section>
  )
}
