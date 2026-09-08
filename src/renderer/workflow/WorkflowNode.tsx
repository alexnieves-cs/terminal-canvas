import { useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import { applyDraftOp, useTemplateDraft } from './template-draft-store'
import { usePool, usePoolsLive } from './pool-store'
import { poolStoppedWord, REASON_NO_POOL_LIVE } from './pool-model'
import type { WorkflowPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { panelState } from '@renderer/panels/panel-state'
import { blockCount } from '@shared/workflow-nodes'
import type { PersistedTemplate } from '@shared/templates'
import type { PersistedRun } from '@shared/runs'
import { buildDiagram, edgeWord, runsForTemplate, BLOCK_H } from './workflow-diagram'

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
  /** Arm a trigger: a WATCHER on this template — `shared/watch-trigger.ts` unchanged. */
  onTrigger: (templateId: string) => void
  /** Delete the template; a built-in refuses, so the reason arrives as a prop. */
  onDelete: (templateId: string) => void
  /** Why Delete cannot act, or null. */
  deleteReason: string | null
  /** M138. Stop a live pool block; main interrupts its workers and kills none. */
  onStop: (templateId: string, key: string) => void
  /**
   * Fix round 2. Why this shape cannot be run — `templateRefusal`'s sentence,
   * which since M132's blocks includes "<key> is a pool block, which cannot
   * run yet". Run is DISABLED with it, never removed and never half-run.
   */
  runReason: string | null
  /** Mint a chat pointed at this template's file and schema — §4.1's door, aimed at a template. */
  onBuildWithAi: (templateId: string) => void
}

export const REASON_MERGED_VIEW = 'leave merged view to act on this workflow'
export const TEMPLATE_GONE = 'that template is no longer saved'
/**
 * Save is DISABLED and says where the editor is, rather than being removed:
 * a row that disappears is indistinguishable from a feature never built.
 * There is no second editor here to save FROM — that is spec §9's whole
 * claim — so the sentence names the door that does work.
 */
export const REASON_NO_EDITOR = 'the draft is kept on this panel; Save on the diagram arrives with M184 — until then, Save selection as template from the bound panels'
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
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ key: string; dx: number; dy: number } | null>(null)
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
  useEffect(() => { if (selectedBlock !== null && template !== undefined && !template.nodes.some((n) => n.key === selectedBlock)) setSelectedBlock(null) }, [template, selectedBlock])
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
  const diagram = useMemo(() => (template === undefined ? null : buildDiagram(template)), [template])
  const mine = useMemo(() => (template === undefined ? [] : runsForTemplate(props.runs, template.id)), [props.runs, template])
  // M138. The pool blocks of this template, and which are live — Stop is
  // PRESENT always and disabled by name while none runs, never absent.
  const poolKeys = useMemo(() => (template === undefined ? [] : template.nodes.filter((n) => n.kind === 'pool').map((n) => n.key)), [template])
  const livePools = usePoolsLive(panel.workflow.templateId, poolKeys)

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
    if (reason !== null) disabled.push({ label, why: reason })
    return (
      <button type="button" className="pf__verb pf__verb--word" data-workflow-verb={key} disabled={reason !== null}
        title={reason ?? label} onMouseDown={press(() => { if (reason === null) run() })}>{label}</button>
    )
  }
  /** The arrowhead's id is per PANEL: two workflow panels on one canvas share a document. */
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
            <div className="workflow-node__verbs" data-workflow-verbs>
              {verb('run', 'Run', props.runReason, () => props.onRun(id))}
              {/* M137. A trigger on a shape that cannot run would fire into a refusal every tick; it is disabled with Run's own sentence. */}
              {verb('triggers', 'Triggers', props.runReason, () => props.onTrigger(id))}
              {verb('stop', 'Stop', livePools.length === 0 ? REASON_NO_POOL_LIVE : null, () => { for (const k of livePools) props.onStop(id, k) })}
              {verb('save', 'Save', REASON_NO_EDITOR, () => {})}
              {verb('delete', 'Delete', props.deleteReason, () => props.onDelete(id))}
              {verb('build', 'Build with AI', null, () => props.onBuildWithAi(id))}
            </div>
            {disabled.length > 0 && (
              <div className="workflow-node__why" data-workflow-why>
                {disabled.map((d) => (
                  <p key={d.label} className="pf__note workflow-node__why-line" data-workflow-why-verb={d.label}>{`${d.label} — ${d.why}`}</p>
                ))}
              </div>
            )}
            <div className="workflow-node__tabs" role="tablist">
              {(['definition', 'runs'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className="pf__verb pf__verb--word workflow-node__tab"
                  data-workflow-tab={t} onMouseDown={press(() => setTab(t))}>{t === 'definition' ? 'Definition' : (mine.length === 0 ? 'Runs' : `Runs (${mine.length})`)}</button>
              ))}
            </div>
            <section className="workflow-node__pane" data-workflow-panel="definition" role="tabpanel" hidden={tab !== 'definition'}>
              {/* The SVG is a sibling LAYER, not a canvas: it has a viewBox
                  and nothing else — no pan, no zoom, no hit testing. */}
              <svg className="workflow-node__diagram" data-workflow-diagram viewBox={`0 0 ${diagram.width} ${diagram.height}`}
                width={diagram.width} height={diagram.height} role="img" aria-label={`${template.name}, ${blockCount(template)} blocks`}>
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
                  return (
                    <g key={`${e.from}:${e.to}`} data-workflow-edge={`${e.from}>${e.to}`}>
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
                      className={selectedBlock === b.key ? 'workflow-node__blockg workflow-node__blockg--selected' : 'workflow-node__blockg'}
                      transform={off.dx === 0 && off.dy === 0 ? undefined : `translate(${off.dx} ${off.dy})`}
                      onMouseDown={(e) => beginBlockDrag(b.key, e)}>
                      <rect className="workflow-node__block" x={b.x} y={b.y} width={b.w} height={b.h} rx={8} />
                      <text className="workflow-node__block-label" x={b.x + 12} y={b.y + 26}>{b.label}</text>
                      <text className="workflow-node__block-sub" x={b.x + 12} y={b.y + BLOCK_H - 18}>{b.sublabel}</text>
                    </g>
                  )
                })}
              </svg>
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
                    <li key={r.id} className="workflow-node__run" data-workflow-run={r.id}>
                      <span className="workflow-node__run-name">{r.name}</span>
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
