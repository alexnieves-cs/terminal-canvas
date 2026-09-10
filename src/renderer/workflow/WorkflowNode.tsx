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

/** M183. Extra SVG room beyond the diagram's extent, for a drop or a wire past the last block. */
const DROP_ROOM = 220

/**
 * M133. THE WORKFLOW PANEL — the FOURTEENTH kind, sessionless like the work
 * card, and a VIEW of a template rather than a second editor of one.
 *
 * The Definition tab draws `buildDiagram`'s projection as an SVG sibling
 * layer, the way `AnnotationLayer.tsx` sits beside the link layer: one
 * `<svg>` under the tab's own body, with no camera, no selection and no
 * undo of its own. That absence is the design — spec §9 — and it is why
 * `@xyflow/react` is declined: **the live canvas is the editor and the
 * template is the truth.** Editing a workflow means editing the panels on
 * the canvas and saving them as a template again; this panel never writes
 * a node.
 *
 * The Runs tab is M79's records filtered to this template — data that has
 * existed since M79, needing no store of its own.
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
  const [tab, setTab] = useState<'definition' | 'runs'>('definition')
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
  const [wire, setWire] = useState<{ from: string; x1: number; y1: number; x2: number; y2: number; over: string | null; allowed: boolean } | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  // M184. A stale save keeps the draft and offers the two verbs that can end it.
  const [stale, setStale] = useState<string | null>(null)
  // M184. The run whose outcome the diagram wears; null is the definition at rest.
  const [runId, setRunId] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const say = (reason: string): void => { setRefusal(reason); window.setTimeout(() => setRefusal((r) => (r === reason ? null : r)), 4000) }
  /** A client point in the SVG's own units (the diagram's viewBox is 1:1 with its width). */
  const toSvg = (clientX: number, clientY: number): { x: number; y: number } | null => {
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
      const svg = svgRef.current
      if (p === null || svg === null || diagram === null) return
      if (p.x < 0 || p.y < 0 || p.x > diagram.width + DROP_ROOM || p.y > diagram.height + DROP_ROOM) { say('drop a node onto the diagram, or use its Add control'); return }
      // The diagram's own offset: its blocks sit at DIAGRAM_PAD + (dx - minX); invert it for the authored dx/dy.
      const minX = template.nodes.length === 0 ? 0 : Math.min(...template.nodes.map((n) => n.dx))
      const minY = template.nodes.length === 0 ? 0 : Math.min(...template.nodes.map((n) => n.dy))
      // The inverse of buildDiagram's own placement (x = PAD + dx - minX) for a block CENTRED on the pointer — in the diagram's exported constants, never literals: a changed pad would otherwise land every drop off its ghost with nothing on screen to say so.
      const dx = Math.round(p.x - DIAGRAM_PAD + minX - BLOCK_W / 2), dy = Math.round(p.y - DIAGRAM_PAD + minY - BLOCK_H / 2)
      const r = applyDraftOp(panel.workflow.templateId, saved, { type: 'add', node: { ...defaultNodeOf(kind), dx, dy } })
      if (r.kind === 'refused') say(r.reason)
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }
  const addFromLibrary = (kind: (typeof LIBRARY)[number]['kind']): void => {
    if (readOnly || template === undefined) return
    const r = applyDraftOp(panel.workflow.templateId, saved, { type: 'add', node: { ...defaultNodeOf(kind), ...placementFor(template) } })
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
      const allowed = over !== null && over !== from && !template.edges.some((x) => x.from === from && x.to === over) && !edgeWouldCycle(template.edges, from, over)
      setWire({ from, x1: start.x, y1: start.y, x2: p.x, y2: p.y, over, allowed })
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
   * M133 critic wave. A disabled verb's reason is ON SCREEN, not in `title`
   * alone: a tooltip needs a hover the reader must already suspect is worth
   * making, so a verb that simply looks grey reads as broken. Every disabled
   * verb contributes one dim sentence under the row; three states stay three
   * (a verb that can act says nothing, and the row is absent when none is
   * disabled rather than printing an empty box).
   */
  const disabled: { label: string; why: string }[] = []
  const verb = (key: string, label: string, own: string | null, run: () => void): JSX.Element => {
    const reason = readOnly ? REASON_MERGED_VIEW : own
    // M191 (the golden audit, 3). The reason rides the control's OWN title
    // and is announced there; it is no longer printed as a permanent line
    // above the diagram. The 5.0 brief forbids that shape by name ("avoid
    // duplicating a refusal as two permanent explanation lines above a
    // graph"), and it cost the diagram two rows at every rest — M133's own
    // "a reason must be on screen" idiom, applied to a surface where the
    // reasons are ordinary and permanent rather than surprising.
    if (reason !== null) disabled.push({ label, why: reason })
    return (
      <button type="button" className="pf__verb pf__verb--word" data-workflow-verb={key} disabled={reason !== null}
        title={reason ?? label} onMouseDown={press(() => { if (reason === null) run() })}>{label}</button>
    )
  }
  /** The arrowhead's id is per PANEL: two workflow panels on one canvas share a document. */
  const isBuiltIn = isBuiltInTemplate(panel.workflow.templateId)
  const arrowId = `wf-arrow-${panel.rect.id}`
  const id = template?.id ?? panel.workflow.templateId

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
            <div className="workflow-node__verbs" data-workflow-verbs>
              {verb('run', 'Run', props.runReason, () => props.onRun(id))}
              {/* M137. A trigger on a shape that cannot run would fire into a refusal every tick; it is disabled with Run's own sentence. */}
              {verb('triggers', 'Triggers', props.runReason, () => props.onTrigger(id))}
              {/* M184. Stop is the SELECTED run's when one is selected, and
                  every open run of this workflow otherwise: its pools and its
                  chats, interrupted. Present always, disabled by name. */}
              {verb('stop', 'Stop', stoppable ? null : REASON_NOTHING_RUNNING, () => { const r = props.onStopRun(id, runId ?? undefined); if (r.kind === 'refused') say(r.reason) })}
              {/* M184. Save is enabled while the draft is dirty and says so
                  otherwise; a built-in saves as a COPY (the built-ins are code,
                  M80's rule), which is also the way out of a stale save. */}
              {isBuiltIn
                ? verb('save', 'Save a copy', null, () => { void props.onSaveCopy(id).then((r) => { if (r.kind === 'refused') say(r.reason) }) })
                : verb('save', 'Save', dirty ? null : REASON_NOTHING_TO_SAVE, () => { void props.onSave(id).then((r) => { if (r.kind === 'stale') setStale(r.reason); else if (r.kind === 'refused') say(r.reason); else setStale(null) }) })}
              {verb('delete', 'Delete', props.deleteReason, () => props.onDelete(id))}
              {verb('build', 'Build with AI', null, () => props.onBuildWithAi(id))}
            </div>
            {stale !== null && (
              <div className="workflow-node__stale" data-workflow-stale role="status">
                <p className="pf__note workflow-node__why-line">{stale}</p>
                <p className="pf__note workflow-node__why-line">{STALE_VERBS}</p>
                <button type="button" className="pf__verb pf__verb--word" data-workflow-verb="reload" onMouseDown={press(() => { props.onReload(id); setStale(null) })}>Reload</button>
                <button type="button" className="pf__verb pf__verb--word" data-workflow-verb="save-copy" onMouseDown={press(() => { void props.onSaveCopy(id).then((r) => { if (r.kind === 'refused') say(r.reason); else setStale(null) }) })}>Save a copy</button>
              </div>
            )}
            {/* M191 (the golden audit, 3). The reasons are REVEALED, not
                permanent: they appear while the panel is hovered or focused,
                the same rule every other chrome verb follows, so a diagram at
                rest is a diagram. Each disabled control also carries its own
                reason in `title`, which is what a pointer and a screen reader
                both reach. */}
            {disabled.length > 0 && (
              <div className="workflow-node__why" data-workflow-why>
                {disabled.map((d) => (
                  <p key={d.label} className="pf__note workflow-node__why-line" data-workflow-why-verb={d.label}>{`${d.label} — ${d.why}`}</p>
                ))}
              </div>
            )}
            <div className="workflow-node__tabs" role="tablist">
              {!readOnly && (
                <button type="button" className="pf__verb pf__verb--word workflow-node__library-toggle" data-workflow-library-toggle aria-expanded={libraryOpen}
                  title={libraryOpen ? 'Hide the node library' : 'Show the node library — drag a kind onto the diagram'}
                  onMouseDown={press(() => setLibraryOpen((v) => !v))}>{libraryOpen ? 'Hide nodes' : 'Add node…'}</button>
              )}
              {(['definition', 'runs'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className="pf__verb pf__verb--word workflow-node__tab"
                  data-workflow-tab={t} onMouseDown={press(() => setTab(t))}>{t === 'definition' ? 'Definition' : (mine.length === 0 ? 'Runs' : `Runs (${mine.length})`)}</button>
              ))}
            </div>
            <section className="workflow-node__pane workflow-node__editor" data-workflow-panel="definition" role="tabpanel" hidden={tab !== 'definition'}>
              {/* M183. THE LIBRARY: one entry per kind, dragged onto the diagram or
                  added at the placement point through its control (keyboard reach). */}
              {!readOnly && libraryOpen && (
                <ul className="workflow-node__library" data-workflow-library aria-label="Node library">
                  {LIBRARY.map((entry) => {
                    // No glyph: `KIND_GLYPH` has no terminal key and one entry
                    // wearing another kind's mark is worse than none (the critic).
                    return (
                      <li key={entry.kind} className="workflow-node__entry" data-workflow-library-kind={entry.kind} title={`Drag onto the diagram, or Add: ${entry.example}`}
                        onMouseDown={(e) => beginLibraryDrag(entry.kind, e)}>
                        <div className="workflow-node__entry-head">
                          <span className="workflow-node__entry-name">{entry.name}</span>
                          <button type="button" className="pf__verb pf__verb--word" data-workflow-library-add title={`Add a ${entry.name.toLowerCase()} node`} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }} onClick={(e) => { e.stopPropagation(); addFromLibrary(entry.kind) }}>Add</button>
                        </div>
                        <span className="workflow-node__entry-sentence">{entry.sentence}</span>
                        <span className="workflow-node__entry-example">{entry.example}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {refusal !== null && <p className="pf__note workflow-node__refusal" data-workflow-refusal role="status">{refusal}</p>}
              {/* The SVG is a sibling LAYER, not a canvas: it has a viewBox
                  and nothing else — no pan, no zoom, no hit testing. */}
              {/* M183. ROOM to drop and wire into: the diagram's extent plus one
                  block and a gap on the right and below — the SVG was exactly its
                  content's size, so a drop to the right of the rightmost block
                  fell outside it. */}
              <svg ref={svgRef} className="workflow-node__diagram" data-workflow-diagram viewBox={`0 0 ${diagram.width + (readOnly ? 0 : DROP_ROOM)} ${diagram.height + (readOnly ? 0 : DROP_ROOM)}`}
                width={diagram.width + (readOnly ? 0 : DROP_ROOM)} height={diagram.height + (readOnly ? 0 : DROP_ROOM)} role="img" aria-label={`${template.name}, ${blockCount(template)} blocks`}
                onMouseDown={(e) => { if (e.target === e.currentTarget) select(panel.workflow.templateId, null) }}>
                {/* An edge has a DIRECTION and the record knows it; a plain
                    line does not say it, so the reader had to guess which
                    way `after a turn` ran. One marker, referenced by every
                    edge, at the TARGET end. */}
                <defs>
                  <marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path className="workflow-node__arrow" d="M 0 0 L 8 4 L 0 8 z" />
                  </marker>
                </defs>
                {diagram.edges.map((e) => {
                  const from = diagram.blocks.find((b) => b.key === e.from)
                  const to = diagram.blocks.find((b) => b.key === e.to)
                  if (from === undefined || to === undefined) return null
                  // Border to border, never centre to centre: a line drawn
                  // between centres passes UNDER both blocks and puts its
                  // word on top of one of them — which is what the first
                  // `workflow.png` showed.
                  const rightward = to.x >= from.x
                  const x1 = rightward ? from.x + from.w : from.x, y1 = from.y + from.h / 2
                  const x2 = rightward ? to.x : to.x + to.w, y2 = to.y + to.h / 2
                  // The label sits at the midpoint of ITS OWN segment, over a
                  // ground rectangle in the pane's surface colour: a word
                  // floating in open space between two diagonals belongs to
                  // neither of them, and the shot showed exactly that. The
                  // width is ESTIMATED from the character count — an SVG
                  // cannot measure its own text before it lays out, and the
                  // face is the mono one, so a per-character advance is the
                  // honest approximation rather than a measurement.
                  const word = edgeWord(e)
                  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
                  const wordW = word.length * 6.3 + 10
                  const edgeKey = `${e.from}>${e.to}`
                  return (
                    <g key={`${e.from}:${e.to}`} data-workflow-edge={edgeKey} className={selectedEdge === edgeKey ? 'workflow-node__edgeg workflow-node__edgeg--selected' : 'workflow-node__edgeg'}
                      onMouseDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); select(panel.workflow.templateId, edgeKey); props.onFocus(panel.rect.id) }}>
                      <line className="workflow-node__line" x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={`url(#${arrowId})`} />
                      <rect className="workflow-node__edge-ground" x={mx - wordW / 2} y={my - 9} width={wordW} height={16} rx={3} />
                      <text className="workflow-node__edge-word" x={mx} y={my + 3} textAnchor="middle">{word}</text>
                    </g>
                  )
                })}
                {diagram.blocks.map((b) => {
                  const off = dragging !== null && dragging.key === b.key ? dragging : { dx: 0, dy: 0 }
                  return (
                    <g key={b.key} data-workflow-block={b.key} data-workflow-block-selected={selectedBlock === b.key ? 'true' : undefined}
                      data-workflow-block-kind={template.nodes.find((n) => n.key === b.key)?.kind}
                      data-workflow-outcome={outcomes[b.key]?.word}
                      data-tone={outcomes[b.key]?.tone}
                      className={`workflow-node__blockg${selectedBlock === b.key ? ' workflow-node__blockg--selected' : ''}${wire !== null && wire.over === b.key ? (wire.allowed ? ' workflow-node__blockg--target' : ' workflow-node__blockg--refused') : ''}`}
                      transform={off.dx === 0 && off.dy === 0 ? undefined : `translate(${off.dx} ${off.dy})`}
                      onMouseDown={(e) => beginBlockDrag(b.key, e)}>
                      <rect className="workflow-node__block" x={b.x} y={b.y} width={b.w} height={b.h} rx={8} />
                      <text className="workflow-node__block-label" x={b.x + 12} y={b.y + 26}>{b.label}</text>
                      {/* M184 (the critic, 12). The sublabel STAYS while a run
                          is selected — the run view must not be less legible
                          about the shape than the rest view — and the outcome
                          word sits right-aligned beside it. */}
                      <text className="workflow-node__block-sub" x={b.x + 12} y={b.y + BLOCK_H - 18}>{b.sublabel}</text>
                      {outcomes[b.key] !== undefined && (
                        <text className="workflow-node__block-outcome" x={b.x + b.w - 12} y={b.y + BLOCK_H - 18} textAnchor="end">{outcomes[b.key].word}</text>
                      )}
                      {/* M183. The port on the right edge: a wire starts here. */}
                      {!readOnly && <circle className="workflow-node__port" data-workflow-port cx={b.x + b.w} cy={b.y + b.h / 2} r={5} onMouseDown={(e) => beginWire(b.key, e)} />}
                    </g>
                  )
                })}
                {wire !== null && <line className="workflow-node__wire" data-workflow-wire x1={wire.x1} y1={wire.y1} x2={wire.x2} y2={wire.y2} />}
                {ghost !== null && <rect className="workflow-node__ghost" data-workflow-ghost x={ghost.x - BLOCK_W / 2} y={ghost.y - BLOCK_H / 2} width={BLOCK_W} height={BLOCK_H} rx={8} />}
              </svg>
              {runNotice !== undefined && (() => {
                const [key, supervision] = runNotice
                const label = diagram.blocks.find((b) => b.key === key)?.label ?? key
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
            <section className="workflow-node__pane" data-workflow-panel="runs" role="tabpanel" hidden={tab !== 'runs'}>
              {/* Three states, never two: nothing recorded yet is a SENTENCE,
                  not an empty box — an empty box reads as a tab that broke. */}
              {/* M138. The pool blocks first: per item, what main said. */}
              {poolKeys.map((k) => <PoolRows key={k} templateId={id} blockKey={k} />)}
              {mine.length === 0 ? (
                <p className="pf__note workflow-node__empty" data-workflow-runs-empty>{RUNS_UNATTRIBUTED}</p>
              ) : (
                <ul className="workflow-node__runs" data-workflow-runs>
                  {mine.map((r) => (
                    <li key={r.id} className={`workflow-node__run${runId === r.id ? ' workflow-node__run--selected' : ''}`} data-workflow-run={r.id} data-workflow-run-selected={runId === r.id ? 'true' : undefined}
                      onMouseDown={press(() => { setRunId((v) => (v === r.id ? null : r.id)); setTab('definition') })}>
                      <span className="workflow-node__run-name">{r.name}{r.definition === undefined ? '' : ` · ${r.definition.revision < 0 ? 'unsaved' : `revision ${r.definition.revision}`}`}</span>
                      <span className="workflow-node__run-facts">{r.panelIds.length} panel{r.panelIds.length === 1 ? '' : 's'} - {durationWord(r)}{r.costUsd === undefined ? '' : ` - $${r.costUsd.toFixed(2)}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
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
