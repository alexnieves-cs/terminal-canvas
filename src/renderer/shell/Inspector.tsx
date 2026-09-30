import { ConnectorInspector } from '@renderer/flowchart/ConnectorInspector'
import type { ConnectorPatch } from '@renderer/canvas/useConnectors'
import type { Connector } from '@shared/flowchart'
import { ShapeInspector, type ShapeChartAct } from '@renderer/flowchart/ShapeInspector'
import type { ShapeStylePatch } from '@renderer/canvas/useFlowchartVerbs'
import { memo, useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import { PLAN_TOOL } from '@shared/transcript'
import { useAgentState } from '@renderer/session/agent-state-store'
import { formatCpu, formatMemory, useMachineCost, useMachineSeries } from '@renderer/session/machine-cost-store'
import { MachineChart } from './MachineChart'
import { UsageChart } from './UsageChart'
import type { CapsField, InspectorModel, InspectorSummary, ReviewFieldModel, ToolboxFieldModel } from './inspector-fields'
import type { InspectorContextBand, TaskChainStep } from './inspector-context'
import { agentStateLabel, formatRateLimitGauge, formatRateLimitReset, handoffControl, historyWord, KIND_NOUN, visibleDetailFields } from './inspector-fields'
import type { Tone } from '@renderer/panels/panel-state'
import { panelState } from '@renderer/panels/panel-state'
import { nextHandoffState } from '@renderer/panels/panels'
import { type HandoffTrigger, type LinkAutomation } from '@shared/handoff'
import { TRIGGER_WORDS } from '@renderer/canvas/trigger-words'
import { pinRefusal } from '@renderer/canvas/lod'
import { shellControl } from './shell-control'
import { openReplay } from '@renderer/replay/replay-store'
import { Popover, PopoverTrigger, PopoverContent, Tabs } from '@renderer/primitives'
import { Close, More, Pencil, RotateCw } from '@renderer/icons'
import type { PersistedTemplate } from '@shared/templates'
import { applyDraftOp, select, useSelectedOf, useTemplateDraft } from '@renderer/workflow/template-draft-store'
import { fieldsOf } from '@shared/template-edit'
import { LIBRARY } from '@shared/template-library'
import { HANDOFF_TRIGGERS } from '@shared/handoff'
import type { ContextTab } from './useShellChrome'
import { InspectorActivity } from './InspectorActivity'
import type { RunRow } from '@shared/run-ledger'

/**
 * M45. Fields whose value is a path, an argv or a pid take the mono face, so
 * the inspector and the terminal it describes resolve the same string to the
 * same glyphs. By KEY rather than a flag on InspectorField: the model is what
 * verify:rail asserts on, and a presentation choice does not belong in it.
 */
/** M68. Fields whose value is a path: shown left-truncated, full on hover. */
const PATH_FIELDS = new Set(['cwd', 'live-cwd', 'worktree-path', 'repo', 'directory', 'toolbox-cwd'])
const MONO_FIELDS = new Set(['command', 'spec-command', 'cwd', 'live-cwd', 'live-command', 'worktree-path', 'pid', 'repo', 'file', 'directory', 'toolbox-cwd'])

/** M78. The selected edge as the pane shows it. */
export interface SelectedEdge {
  from: string
  to: string
  source: string
  target: string
  label?: string
  automation?: LinkAutomation
  /** Both ends are process kinds; a document end can carry no rule. */
  canHandoff: boolean
  /** Both ends are terminals — the only edge a restart rule can live on. */
  canRestart: boolean
  /** A chat never exits: the exit-family triggers cannot fire from it. */
  sourceIsChat: boolean
  result?: string
}

/** M79. The run line the pane shows for a panel: the rail row's own facts, verbatim. */
export interface PanelRunLine {
  id: string
  name: string
  facts: string
  outcome: string
  tone: Tone
  runAgain: { enabled: true } | { enabled: false; reason: string }
}

export interface AutomationRow {
  from: string
  to: string
  source: string
  target: string
  enabled: boolean
  /** M41: the rule itself, so the list's toggle re-sets it with `enabled` flipped and nothing else changed. */
  automation: LinkAutomation
  /** describeAutomation's sentence, built where the rows are. */
  sentence: string
}

export interface InspectorProps {
  onToggle: () => void
  /** M183. The saved template by id — the node editor's record; absent (a fixture) hides the editor. */
  templateOf?: (id: string) => PersistedTemplate | undefined
  /** M188. Test one node — the same executor the workflow's own run takes. */
  onTestNode?: (templateId: string, key: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M46. The active tab of the context pane, persisted as shell.contextTab. */
  tab: ContextTab
  onSelectTab: (tab: ContextTab) => void
  /** null when nothing is selected — the launch state, and every background click. */
  model: InspectorModel | null
  summary: InspectorSummary
  onRename: (id: string, currentTitle: string) => void
  onClose: (id: string) => void
  onSavePreset: (id: string) => void
  onRestart: (id: string) => void
  /** M92. Lock, pin and maximise toggles beside Restart. */
  onLock: (id: string) => void
  onUnlock: (id: string) => void
  onPin: (id: string) => void
  onUnpin: (id: string) => void
  onMaximise: (id: string) => void
  onRestore: (id: string) => void
  /** M92. The canvas's pin count — the pane's Pin refuses by the same sentence the palette does. */
  pinnedCount?: number
  /** M74. The panel's front-end verb (open as chat / open in terminal). */
  onFrontEnd: (id: string) => void
  /**
   * #16. Open the Needs-you queue on the chat's pending request. The pane
   * NAVIGATES to the one surface that explains and resolves a request; it no
   * longer answers one itself (M76's Allow/Deny lived here, a third copy).
   */
  onReviewApproval: (requestId: string) => void
  /** M98. Drop every session grant for the chat; absent leaves the Revoke control disabled by name. */
  onRevokeGrants?: (id: string) => void
  /** M352. `cap-agent` from the Work tab's Caps fields (a person's door); absent leaves the fields read-only. */
  onCap?: CapVerb
  onOpenReview: (id: string) => void
  onLink: (id: string) => void
  onRemoveLink: (from: string, to: string) => void
  onRelabelLink: (from: string, to: string, current: string) => void
  /** M388. Restyle the inspected shape — one setShapeStyle per press. Absent leaves the Shape section out. */
  onStyleShape?: (id: string, patch: ShapeStylePatch) => void
  /** M391. Lay out or export the chart the inspected shape belongs to. */
  onShapeChart?: (id: string, act: ShapeChartAct) => void
  onSetRestartOnExit: (from: string, to: string, enabled: boolean) => void
  /** M41: set or replace the one rule on a link — the handoff control's verb, and the list toggle's. */
  onSetLinkAutomation: (from: string, to: string, automation: LinkAutomation) => void
  /** Ephemeral evidence of what a functional link most recently did. */
  automationResults: ReadonlyMap<string, string>
  automations: AutomationRow[]
  /** M78. The selected edge, when one is; the pane shows it with its rule as a select. */
  selectedEdge?: SelectedEdge | null
  /** M389. The selected connector, with its two ends' names — the inspector's Connector section. */
  selectedConnector?: { connector: Connector; fromName: string; toName: string } | null
  onPatchConnector?: (id: string, patch: ConnectorPatch) => void
  onRemoveConnector?: (id: string) => void
  /** M79. The newest run the selected panel belongs to, or null. */
  panelRun?: PanelRunLine | null
  onRunAgain?: (id: string) => void
  /**
   * null while nothing is selected or the review invoke has not resolved
   * yet — a distinct state from `hidden`, which is the engine's own answer
   * of "render nothing" for a panel outside a repository. Canvas freezes
   * this on reviewSignature(review) the same way it freezes `model` on
   * inspectorSignature: see this component's own doc comment below for why
   * an unfrozen prop here defeats the memo outright.
   */
  review: ReviewFieldModel | null
  /** M86. The selected panel's branch against its tracking ref, or null before asked, or '' when git could not say. */
  branchLine: string | null
  /** M86. The repository every worktree shares, once git named it. */
  repository: string | null
  /**
   * null when the selected panel has no directory at all (a review node, a
   * file panel, a Jira panel), and `hidden` when the inventory itself says
   * there is nothing to show. Two different facts, and the pane must not
   * collapse them — see buildToolboxFields' own three-state comment.
   *
   * Frozen by Canvas on `toolboxSignature`, exactly as `review` is on
   * `reviewSignature`: an unfrozen prop here defeats this component's memo
   * outright, and Canvas re-renders on every mousemove.
   */
  toolbox: ToolboxFieldModel | null
  onOpenToolbox: (id: string) => void
  /** M270. Contextual next / blocker / related — omitted when nothing applies. */
  contextBand?: InspectorContextBand
  onShowRelated?: (itemId: string) => void
  onShowTask?: (panelId: string) => void
  /** M310. A step of the task strip was pressed: go to it, open it, or go where it is made. */
  onChainStep?: (itemId: string, step: TaskChainStep) => void
  /** (this redesign) Mousedown on the pane's own left-edge handle; Canvas owns the drag itself (it holds `shellRef`), this only starts it. */
  onResizeHandleDown: (event: ReactMouseEvent) => void
  /** M279. The canvas-wide activity list's one verb: fly to the row's panel. */
  onGoToPanel?: (id: string) => void
}

/**
 * The right inspector: what the selected panel actually is, and what the
 * canvas holds when nothing is selected.
 *
 * memo'd, and ALL THREE of its data props are frozen by Canvas — `model` on
 * inspectorSignature, `summary` on its own three numbers, and (since M9a)
 * `review` on reviewSignature(review). Canvas re-renders on every mousemove
 * over the canvas (setCursor) and on every frame of a drag (setPanelRect);
 * without all three halves this pane would rebuild at 60Hz for rect changes
 * it displays nothing about, the same trap SideRail documents. `review` is
 * the sharper case of the three: buildReviewFields returns a FRESH object on
 * six of its eight arms, so an unfrozen prop here is not a hypothetical
 * regression — it is the DEFAULT outcome of wiring the query the obvious way,
 * and the failure is silent: nothing throws, nothing looks wrong in a
 * screenshot, the app just gets heavy while a panel is dragged.
 *
 * The toggle stays mounted when the inspector is collapsed, for the same
 * reason the rail's does: it is the only way back without ⇧⌘\.
 */
/** M352. The verb's own answer comes back to the fields: set, or refused by name. */
type CapVerb = (id: string, value: string) => { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }

/**
 * M352. An agent's meter against its caps, and `cap-agent`'s canvas door: two
 * fields a person fills (dollars, thousands of tokens) and one Set. A blank
 * field is "the Settings cap", and 0 is "no cap for this agent". Set sends ONE
 * verb value (one undo), and what comes back is the verb's own sentence. The
 * lines are main's figures, so the fields are never the only word on what is
 * enforced.
 */
function CapsSection({ id, caps, onCap }: { id: string; caps: CapsField; onCap?: CapVerb }): JSX.Element {
  const ownUsd = caps.own?.usd === undefined ? '' : String(caps.own.usd)
  const ownK = caps.own?.contextK === undefined ? '' : String(caps.own.contextK)
  const [usd, setUsd] = useState(ownUsd)
  const [k, setK] = useState(ownK)
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null)
  // Another panel, or its record changed under us (an undo, an agent's lower cap): start from the record.
  useEffect(() => { setUsd(ownUsd); setK(ownK) }, [id, ownUsd, ownK])
  useEffect(() => { setSaid(null) }, [id])
  const set = (): void => {
    if (onCap === undefined) return
    const u = usd.trim()
    const c = k.trim()
    const parts = [
      u === '' ? (caps.own?.usd === undefined ? null : 'default-usd') : `${u}usd`,
      c === '' ? (caps.own?.contextK === undefined ? null : 'default-k') : `${c}k`
    ].filter((x): x is string => x !== null)
    if (parts.length === 0) { setSaid({ ok: true, text: 'nothing to change — the Settings caps apply' }); return }
    const out = onCap(id, parts.join(','))
    setSaid(out.kind === 'ran' ? { ok: true, text: out.note ?? 'set' } : { ok: false, text: out.reason })
  }
  return (
    <section className="inspector__section" data-work-section="caps">
      <h3 className="inspector__section-heading">Caps</h3>
      <dl className="inspector__caps">
        <dt>Spend</dt><dd data-caps-line="spend">{caps.spend}</dd>
        <dt>Context</dt><dd data-caps-line="context">{caps.context}</dd>
        {/* M380. The burn-down: the window the CLI reported, and what is left of it. */}
        {caps.window !== undefined && <><dt>Window</dt><dd data-caps-line="window">{caps.window}</dd></>}
      </dl>
      {caps.held !== undefined && <p className="inspector__caps-held" role="status" data-caps-held>{caps.held}</p>}
      {/* Each field NAMED on screen, not only by its unit (the M352 critic): a
          blank field reads "Settings", which is what it means. */}
      <form className="inspector__caps-form" onSubmit={(e) => { e.preventDefault(); set() }}>
        <label className="inspector__caps-field">
          <span className="inspector__caps-name">Spend cap</span>
          <span className="inspector__caps-unit">$</span>
          <input className="inspector__input inspector__caps-input" inputMode="decimal" value={usd} placeholder="Settings" aria-label="This agent's spend cap in dollars" data-caps-input="usd" onChange={(e) => setUsd(e.target.value)} />
        </label>
        <label className="inspector__caps-field">
          <span className="inspector__caps-name">Context cap</span>
          {/* The same slot the dollar sign takes, empty, so the two fields line up. */}
          <span className="inspector__caps-unit" aria-hidden="true" />
          <input className="inspector__input inspector__caps-input" inputMode="numeric" value={k} placeholder="Settings" aria-label="This agent's context cap in thousands of tokens" data-caps-input="k" onChange={(e) => setK(e.target.value)} />
          <span>k tokens</span>
        </label>
        <button type="submit" className="inspector__action inspector__action--secondary inspector__caps-set" disabled={onCap === undefined} data-caps-set>Set</button>
      </form>
      {said !== null && <p className={said.ok ? 'inspector__arm' : 'inspector__arm inspector__arm--refused'} data-caps-said={said.ok ? 'ran' : 'refused'}>{said.text}</p>}
    </section>
  )
}

function InspectorImpl({
  onToggle: _onToggle, templateOf, tab, onSelectTab, model, summary, onRename, onClose, onSavePreset, onRestart, onFrontEnd, onReviewApproval, onRevokeGrants, onCap, onOpenReview, onLock, onUnlock, onPin, onUnpin, onMaximise, onRestore, pinnedCount,
  onLink, onRemoveLink, onRelabelLink, onSetRestartOnExit, onSetLinkAutomation, automationResults, automations, review, toolbox, onOpenToolbox, selectedEdge, selectedConnector, onPatchConnector, onRemoveConnector, panelRun, onRunAgain, branchLine, repository, onResizeHandleDown, onStyleShape, onShapeChart,
  contextBand, onShowRelated, onShowTask, onChainStep, onGoToPanel
}: InspectorProps): JSX.Element {
  // M46. The toggle lives in the top bar now (there is no pane to hold it
  // while the pane is hidden); the prop stays so the wiring reads the same.
  return (
    <aside className="shell__inspector" aria-label="Context">
      {/* (this redesign) Resize, from the pane's own left edge — the side that borders
          the canvas. Mousedown only; Canvas does the drag math on `shellRef`
          and commits the setting on mouseup. */}
      <div className="inspector__resize-handle" onMouseDown={onResizeHandleDown} title="Drag to resize the inspector" />
      {model === null && selectedConnector != null && onPatchConnector !== undefined && onRemoveConnector !== undefined
        ? <ConnectorInspector connector={selectedConnector.connector} fromName={selectedConnector.fromName} toName={selectedConnector.toName}
            onPatch={(patch) => { onPatchConnector(selectedConnector.connector.id, patch) }} onRemove={() => { onRemoveConnector(selectedConnector.connector.id) }} />
        : model === null && selectedEdge != null
        ? <EdgePanel edge={selectedEdge} onSetLinkAutomation={onSetLinkAutomation} onRemoveLink={onRemoveLink} onRelabelLink={onRelabelLink} />
        : model === null
        ? <>
            <div className="shell__region-title">Canvas</div>
            <AutomationList rows={automations} results={automationResults} onSetLinkAutomation={onSetLinkAutomation} />
            <InspectorEmpty summary={summary} onGoToPanel={onGoToPanel} />
          </>
        : <InspectorPanel
            templateOf={templateOf}
            branchLine={branchLine}
            repository={repository}
            tab={tab}
            onSelectTab={onSelectTab}
            automations={automations}
            model={model}
            review={review}
            toolbox={toolbox}
            onOpenToolbox={onOpenToolbox}
            contextBand={contextBand}
            onShowRelated={onShowRelated}
            onShowTask={onShowTask}
            onChainStep={onChainStep}
            onRename={onRename}
            onClose={onClose}
            onSavePreset={onSavePreset}
            onRestart={onRestart}
            onLock={onLock} onUnlock={onUnlock} onPin={onPin} onUnpin={onUnpin} onMaximise={onMaximise} onRestore={onRestore} pinnedCount={pinnedCount}
            onFrontEnd={onFrontEnd}
            onReviewApproval={onReviewApproval}
            onRevokeGrants={onRevokeGrants}
            onCap={onCap}
            panelRun={panelRun ?? null}
            onRunAgain={onRunAgain ?? (() => {})}
            onOpenReview={onOpenReview}
            onLink={onLink}
            onRemoveLink={onRemoveLink}
            onRelabelLink={onRelabelLink}
            onStyleShape={onStyleShape}
            onShapeChart={onShapeChart}
            onSetRestartOnExit={onSetRestartOnExit}
            automationResults={automationResults}
            onSetLinkAutomation={onSetLinkAutomation}
          />}
    </aside>
  )
}

export const Inspector = memo(InspectorImpl)

/**
 * M52. The run ledger's rows for this panel — what it ran and how each
 * ended, newest first. Re-read when the panel changes and whenever the Work
 * tab is switched to (a run that ends while you look is visible live in the
 * terminal's own gutter marks; the list catches up on the next switch).
 * Hidden entirely when there are none: an undecorated shell and an agent
 * panel are the same absence, and a heading over nothing reads as broken.
 */
function RunsSection({ panelId, active }: { panelId: string; active: boolean }): JSX.Element | null {
  const [rows, setRows] = useState<RunRow[]>([])
  useEffect(() => {
    let live = true
    void window.canvas.ledger.list(panelId, 20).then((r) => { if (live) setRows(r) }).catch(() => {})
    return () => { live = false }
  }, [panelId, active])
  // (this redesign) Absent, not a heading over "no commands yet": this doc comment
  // always claimed the empty arm was hidden entirely, but the arm below
  // rendered a heading regardless — the exact "empty section with nothing
  // actionable" #17's brief names. A panel that has never run a command has
  // nothing here to act on; the section simply is not part of the page.
  if (rows.length === 0) return null
  return (
    <section className="inspector__section" data-runs-section>
      <h3 className="inspector__section-heading">Commands</h3>
      <ul className="inspector__review-files">
        {rows.map((r, i) => (
          <li key={`${r.endedAt}-${i}`} className="inspector__review-file" data-run-row data-run-exit={r.exitCode ?? ''}>
            <span className="inspector__review-path inspector__value--mono">{r.command}</span>
            <span className="inspector__review-counts">
              {r.exitCode === 0 ? 'ok' : `exit ${r.exitCode ?? '?'}`} · {Math.max(0, Math.round((r.endedAt - r.startedAt) / 100) / 10)}s
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The audit surface #24 requires: rules are readable without tracing lines. */
/**
 * M78. THE EDGE, selected. Its rule is a labelled select over `off` and the
 * five triggers — the one place a condition is set — with the last result
 * beneath and the M35 verbs (relabel, remove). A document end disables the
 * select by name.
 */
function EdgePanel({ edge, onSetLinkAutomation, onRemoveLink, onRelabelLink }: {
  edge: SelectedEdge
  onSetLinkAutomation: (from: string, to: string, automation: LinkAutomation) => void
  onRemoveLink: (from: string, to: string) => void
  onRelabelLink: (from: string, to: string, current: string) => void
}): JSX.Element {
  const value = edge.automation?.kind === 'handoff' && edge.automation.enabled ? edge.automation.trigger : edge.automation?.kind === 'restart-on-exit' && edge.automation.enabled ? 'restart' : 'off'
  // The line's own words (TRIGGER_WORDS), verbatim: one phrasing per fact.
  const options: Array<{ value: string; label: string }> = [
    { value: 'off', label: 'off' },
    ...(['exit', 'exit-ok', 'exit-fail', 'idle', 'always'] as const).map((t) => ({ value: t, label: TRIGGER_WORDS[t] })),
    { value: 'restart', label: 'restart on exit' }
  ]
  return (
    <div className="inspector__body" data-inspector-edge={`${edge.from}:${edge.to}`}>
      <div className="shell__region-title">Edge</div>
      <p className="inspector__edge-ends" data-edge-ends>{edge.source} → {edge.target}</p>
      <dl className="inspector__fields">
        <div className="inspector__field">
          <dt className="inspector__label">label</dt>
          <dd className="inspector__value">{edge.label ?? (edge.automation !== undefined && edge.automation.enabled ? 'none — the rule is shown on the line' : 'none')}</dd>
        </div>
        <div className="inspector__field">
          <dt className="inspector__label">rule</dt>
          <dd className="inspector__value">
            <select
              className="inspector__select"
              data-edge-trigger
              value={value}
              disabled={!edge.canHandoff}
              title={edge.canHandoff ? 'What this edge does when the source ends' : 'A rule needs a terminal or a chat at both ends'}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'off') { if (edge.automation !== undefined) onSetLinkAutomation(edge.from, edge.to, { ...edge.automation, enabled: false }); return }
                if (v === 'restart') { onSetLinkAutomation(edge.from, edge.to, { kind: 'restart-on-exit', enabled: true }); return }
                onSetLinkAutomation(edge.from, edge.to, { kind: 'handoff', enabled: true, trigger: v as HandoffTrigger })
              }}
            >
              {options.map((o) => {
                const exitFamily = o.value === 'exit' || o.value === 'exit-ok' || o.value === 'exit-fail'
                const off = (o.value === 'restart' && !edge.canRestart) || (exitFamily && edge.sourceIsChat)
                return <option key={o.value} value={o.value} disabled={off}>{o.label}{off ? (o.value === 'restart' ? ' — terminals only' : ' — a chat never exits') : ''}</option>
              })}
            </select>
          </dd>
        </div>
        {/* Three states, never two: never fired, waiting, a real sentence. */}
        <div className="inspector__field">
          <dt className="inspector__label">last</dt>
          <dd className="inspector__value" data-edge-result>{edge.result ?? (edge.automation !== undefined && edge.automation.enabled ? 'never fired' : 'no rule')}</dd>
        </div>
      </dl>
      <div className="inspector__actions context__actions">
        <button type="button" className="inspector__action inspector__action--secondary" data-edge-action="relabel" title="Label this edge" {...shellControl(() => onRelabelLink(edge.from, edge.to, edge.label ?? ''))}>Label…</button>
        <button type="button" className="inspector__action inspector__action--secondary" data-edge-action="remove" title="Remove this edge (Delete)" {...shellControl(() => onRemoveLink(edge.from, edge.to))}>Remove</button>
      </div>
    </div>
  )
}

function AutomationList({
  rows, results, onSetLinkAutomation
}: {
  rows: AutomationRow[]
  results: ReadonlyMap<string, string>
  onSetLinkAutomation: (from: string, to: string, automation: LinkAutomation) => void
}): JSX.Element | null {
  if (rows.length === 0) return null
  return (
    <section className="inspector__links" data-automation-list>
      <div className="inspector__links-label">automations</div>
      {rows.map((row) => {
        const key = `${row.from}:${row.to}`
        return (
          <div className="inspector__link" key={key} data-automation={key}>
            <span className="inspector__link-title">{row.source} → {row.target}: {row.sentence}</span>
            <button
              type="button"
              className="inspector__link-action"
              title={row.enabled ? 'Disable this automation' : 'Enable this automation'}
              {...shellControl(() => onSetLinkAutomation(row.from, row.to, { ...row.automation, enabled: !row.enabled }))}
            >
              {row.enabled ? 'on' : 'off'}
            </button>
            {results.get(key) !== undefined && <span className="inspector__link-label" data-automation-result={key}>{results.get(key)}</span>}
          </div>
        )
      })}
    </section>
  )
}

/**
 * Nothing selected. Deliberately a summary rather than a blank pane or a
 * "select a panel" instruction: the counts are the one thing a user cannot get
 * by looking at the canvas once it is larger than the viewport, and M8d's
 * cross-workspace counts land here rather than needing a new surface.
 */
function InspectorEmpty({ summary, onGoToPanel }: { summary: InspectorSummary; onGoToPanel?: (id: string) => void }): JSX.Element {
  const gauge = formatRateLimitGauge(summary.rateLimit ?? { kind: 'none' })
  return (
    <div className="inspector__body" data-inspector-summary>
      {/* M48 (spec §5). The one line this pane owed: what selecting does. */}
      <p className="inspector__review-note" data-context-hint>select a panel to inspect it</p>
      <dl className="inspector__fields">
        <div className="inspector__field">
          <dt className="inspector__label">panels</dt>
          <dd className="inspector__value" data-summary="panels">{summary.panels}</dd>
        </div>
        <div className="inspector__field">
          <dt className="inspector__label">running</dt>
          <dd className="inspector__value" data-summary="running">{summary.running}</dd>
        </div>
        <div className="inspector__field">
          <dt className="inspector__label">waiting</dt>
          <dd className="inspector__value" data-summary="waiting">{summary.waiting}</dd>
        </div>
        {/* M46 (#19's aggregate half). Every panel's tokens and list price,
            summed — the two figures no single panel can answer. `cost`
            undefined is "a panel's model has no price", rendered as a dash
            rather than as a smaller number that looks complete. */}
        <div className="inspector__field">
          <dt className="inspector__label">tokens</dt>
          <dd className="inspector__value" data-summary="tokens">{summary.tokens.toLocaleString()}</dd>
        </div>
        <div className="inspector__field">
          <dt className="inspector__label">list price</dt>
          <dd className="inspector__value" data-summary="cost">{summary.cost === undefined ? '—' : `$${summary.cost.toFixed(2)}`}</dd>
        </div>
        {/* Account-level usage windows — the subscriber question "can I start
            a 6-wide pool right now?". Per-panel tokens stay above / in Work. */}
        <div className="inspector__field inspector__field--gauge" data-summary="rate-limit" data-rate-limit={gauge.kind}>
          <dt className="inspector__label">usage window</dt>
          <dd className="inspector__value">
            {gauge.kind === 'none' ? (
              <span data-rate-limit-none>no window data yet</span>
            ) : (
              <ul className="inspector__rate-limit">
                {gauge.kind === 'limited' && (
                  <li className="inspector__rate-limit-status" data-rate-limit-status="limited">
                    limited until {formatRateLimitReset(gauge.until ?? 0)}
                  </li>
                )}
                {gauge.fiveHour !== undefined && (
                  <li data-rate-limit-window="five_hour">
                    <span className="inspector__rate-limit-name">5-hour</span>
                    <span className="inspector__rate-limit-bar" aria-hidden="true">
                      <span className="inspector__rate-limit-fill" style={{ width: `${Math.min(100, gauge.fiveHour.percent)}%` }} />
                    </span>
                    <span className="inspector__rate-limit-pct">{gauge.fiveHour.percent}%</span>
                    <span className="inspector__rate-limit-reset">resets {formatRateLimitReset(gauge.fiveHour.resetsAt)}</span>
                  </li>
                )}
                {gauge.weekly !== undefined && (
                  <li data-rate-limit-window="seven_day">
                    <span className="inspector__rate-limit-name">weekly</span>
                    <span className="inspector__rate-limit-bar" aria-hidden="true">
                      <span className="inspector__rate-limit-fill" style={{ width: `${Math.min(100, gauge.weekly.percent)}%` }} />
                    </span>
                    <span className="inspector__rate-limit-pct">{gauge.weekly.percent}%</span>
                    <span className="inspector__rate-limit-reset">resets {formatRateLimitReset(gauge.weekly.resetsAt)}</span>
                  </li>
                )}
              </ul>
            )}
          </dd>
        </div>
        {/* M142 (#19's history half). This week's CLOSED sessions from the run
            ledger, three states: reading, nothing closed, a figure (or
            unpriced) with its count. The live totals above are what is on the
            canvas now; this is what already ended. */}
        <div className="inspector__field">
          <dt className="inspector__label">this week</dt>
          <dd className="inspector__value" data-summary="history">{historyWord(summary.history)}</dd>
        </div>
      </dl>
      {/* Round 7. The same week, by day. It sits UNDER the figure rather than
          replacing it, because the two answer different questions: the line
          says how much, the chart says when — one expensive afternoon and a
          steady week fold to the identical sentence, and that collapse is the
          thing this adds back. Absent while the ledger is unanswered or
          rejected (the line above names either), and absent when nothing
          closed, where a row of seven zeroes is a picture of nothing. */}
      {summary.usageSeries != null && <UsageChart series={summary.usageSeries} />}
      {/* M279. With nothing selected, the whole canvas's feed — each row jumps
          to its panel. INSIDE the scrolling body, after the figures: as a
          sibling it took the column's height and clipped the summary above it. */}
      <div className="shell__region-title inspector__activity-title">Activity</div>
      <InspectorActivity panelId={null} onGoToPanel={onGoToPanel} />
    </div>
  )
}

/**
 * Its OWN useAgentState subscription, for the reason RailPanelRow's comment
 * gives: agent-state-store subscribes per panel id precisely so a change for
 * n3 notifies only whatever asked about n3. Lifting this into Canvas and
 * passing the state down would make every agent transition in the app a
 * Canvas re-render.
 *
 * A separate component rather than a branch inside InspectorImpl, because a
 * hook cannot be called conditionally and `model` is legitimately null.
 */
function InspectorPanel({
  tab, onSelectTab, automations, templateOf, onTestNode,
  model, review, toolbox, onOpenToolbox, contextBand, onShowRelated, onShowTask, onChainStep, onRename, onClose, onSavePreset, onRestart, onFrontEnd, onReviewApproval, onRevokeGrants, onCap, onOpenReview, onLock, onUnlock, onPin, onUnpin, onMaximise, onRestore, pinnedCount, panelRun, onRunAgain,
  onLink, onRemoveLink, onRelabelLink, onStyleShape, onShapeChart, onSetRestartOnExit, onSetLinkAutomation, automationResults, branchLine, repository
}: {
  onStyleShape?: (id: string, patch: ShapeStylePatch) => void
  /** M391. Lay out or export the chart the inspected shape belongs to. */
  onShapeChart?: (id: string, act: ShapeChartAct) => void
  templateOf?: (id: string) => PersistedTemplate | undefined
  /** M188. Test one node — the same executor the workflow's own run takes. */
  onTestNode?: (templateId: string, key: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  tab: ContextTab
  onSelectTab: (tab: ContextTab) => void
  automations: AutomationRow[]
  model: InspectorModel
  review: ReviewFieldModel | null
  /** M86. See InspectorProps.branchLine. */
  branchLine: string | null
  repository: string | null
  toolbox: ToolboxFieldModel | null
  onOpenToolbox: (id: string) => void
  contextBand?: InspectorContextBand
  onShowRelated?: (itemId: string) => void
  onShowTask?: (panelId: string) => void
  onChainStep?: (itemId: string, step: TaskChainStep) => void
  onRename: (id: string, title: string) => void
  onClose: (id: string) => void
  onSavePreset: (id: string) => void
  onRestart: (id: string) => void
  /** M92. Lock, pin and maximise toggles beside Restart. */
  onLock: (id: string) => void
  onUnlock: (id: string) => void
  onPin: (id: string) => void
  onUnpin: (id: string) => void
  onMaximise: (id: string) => void
  onRestore: (id: string) => void
  /** M92. The canvas's pin count — the pane's Pin refuses by the same sentence the palette does. */
  pinnedCount?: number
  onFrontEnd: (id: string) => void
  onReviewApproval: (requestId: string) => void
  onRevokeGrants?: (id: string) => void
  onCap?: CapVerb
  panelRun: PanelRunLine | null
  onRunAgain: (id: string) => void
  onOpenReview: (id: string) => void
  onLink: (id: string) => void
  onRemoveLink: (from: string, to: string) => void
  onRelabelLink: (from: string, to: string, current: string) => void
  onSetRestartOnExit: (from: string, to: string, enabled: boolean) => void
  /** M41: set or replace the one rule on a link — the handoff control's verb, and the list toggle's. */
  onSetLinkAutomation: (from: string, to: string, automation: LinkAutomation) => void
  automationResults: ReadonlyMap<string, string>
}): JSX.Element {
  // M191. Is a BLOCK of this workflow selected? The Machine section is absent
  // then: the object the pane is about is the node, and the panel's process
  // metrics are not the node's.
  const nodeSelected = useSelectedOf(model.kind === 'workflow' && model.templateId !== undefined ? model.templateId : '') !== null
  const state = useAgentState(model.id)
  const machine = useMachineCost(model.id)
  // Round 7. Its own subscription, on the history's own listener set: this
  // moves every sample where `machine` above moves only on a CHANGE, and the
  // two are kept apart so a flat-lining panel still draws a flat line.
  const machineSeries = useMachineSeries(model.id)
  // M46. Close is DESTRUCTIVE and gated by the same one-click arming the
  // panel's own × uses (never a modal — this app has one modal-shaped surface
  // and keeps it that way). A button pinned at a fixed corner of the pane is
  // a mis-click target in a way a mid-scroll button was not, which is why
  // the M8b reasoning ("the user aimed at a labelled control") no longer
  // holds here. Disarms when the selection changes: an armed Close carried
  // to the NEXT panel would close a panel the user never armed.
  const [closeArmed, setCloseArmed] = useState(false)
  // (this redesign) THE ⋯ MENU, replacing the persistent two-column action matrix: one
  // primary button stays in the bar (Restart, or Allow/Deny on a pending
  // chat) and everything else — layout, naming, linking, and Close last and
  // visually separated — moves into a dropdown, the exact `pf__menu` pattern
  // PanelFrame.tsx already uses for its own ⋯. Outside click closes it via a
  // document-level, CAPTURE-phase listener (PanelFrame's own comment explains
  // why: a bubble-phase listener would still miss a mousedown a panel body
  // swallows, and capture sees every one regardless).
  const [menuOpen, setMenuOpen] = useState(false)
  const menuHostRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent): void => {
      const host = menuHostRef.current
      if (host !== null && event.target instanceof Node && host.contains(event.target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [menuOpen])
  useEffect(() => { setCloseArmed(false); setMenuOpen(false) }, [model.id])
  const pid = model.fields.find((f) => f.key === 'pid')?.value
  // M279. Activity: what the object has DONE — the fourth question.
  const TABS: Array<{ id: ContextTab; label: string }> = [
    { id: 'detail', label: 'Detail' }, { id: 'work', label: 'Work' }, { id: 'tools', label: 'Tools' }, { id: 'activity', label: 'Activity' }
  ]
  return (
    <div className="context">
      {/* PINNED, never scrolls: "which panel is this" is the question that
          qualifies every other section's answer, and the Cost figure must
          never be on screen without its subject (spec §4.2). */}
      <div className="context__header">
      <div className="inspector__heading" data-inspector-heading>
        {model.heading}
        {/* M86. The identity line names the REPOSITORY — the small thing the
            scope decision asked for: which project this panel is in, beside
            what it is called, before any section's answer. */}
        {repository !== null && (
          <span className="inspector__repository" data-inspector-repository title={repository}> · {repository.replace(/\/+$/, '').split('/').pop()}</span>
        )}
      </div>
      {(contextBand?.nextAction !== undefined || contextBand?.blocker !== undefined || contextBand?.related !== undefined) && (
        <div className="inspector__context" data-inspector-context>
          {contextBand.nextAction !== undefined && (
            <p className="inspector__context-next" data-inspector-next>{contextBand.nextAction}</p>
          )}
          {contextBand.blocker !== undefined && (
            <p className="inspector__context-blocker" data-inspector-blocker role="status">{contextBand.blocker}</p>
          )}
          {/* #16. The request is NAMED with its context, at the top of the
              pane, and the one verb here opens the Needs-you queue on it —
              where it is explained in full and answered. The pane used to
              answer too (a band here and a pair in the grid below), three
              copies of one decision with the queue; now it navigates. A
              second attribute, never `data-inspector-action`, so a selector
              for the grid's button still finds exactly one. */}
          {model.kind === 'chat' && model.approval !== undefined && (
            <div className="inspector__context-resolve" data-inspector-resolve>
              {/* M359. A plan is named as a plan, by its first line. */}
              <span className="inspector__context-request">Waiting on you: {model.approval.toolName === PLAN_TOOL ? 'plan' : model.approval.toolName} · <code>{model.approval.argument}</code></span>
              <button
                type="button"
                className="inspector__action"
                data-inspector-resolve-verb="review"
                title={`Open Needs you on ${model.approval.toolName} — ${model.approval.argument}`}
                {...shellControl(() => { if (model.approval !== undefined) onReviewApproval(model.approval.requestId) })}
              >
                Review request
              </button>
            </div>
          )}
          {contextBand.related !== undefined && (
            <div className="inspector__context-related" data-inspector-related>
              <span>{contextBand.related.title} · {contextBand.related.memberCount} related</span>
              {onShowRelated !== undefined && (
                <button
                  type="button"
                  className="inspector__action inspector__action--secondary"
                  title="Show related panels of this task"
                  {...shellControl(() => onShowRelated(contextBand.related!.itemId))}
                >
                  Show related
                </button>
              )}
              {onShowTask !== undefined && (
                <button
                  type="button"
                  className="inspector__action inspector__action--secondary"
                  title="Frame this task on the canvas"
                  {...shellControl(() => onShowTask(model.id))}
                >
                  Show this task
                </button>
              )}
            </div>
          )}
          {/* M310. The task's chain — issue → conversation → preview → review
              → checks → PR — each step a place to go, or the words for what
              would make it. The flagship flow, readable from any of its panels. */}
          {contextBand.related?.chain !== undefined && (
            <ol className="inspector__chain" data-inspector-chain aria-label="This task, step by step">
              {contextBand.related.chain.map((c) => (
                <li key={c.step} className="inspector__chain-step" data-chain-step={c.step} data-chain-present={c.present ? '' : undefined}>
                  <button type="button" className="inspector__chain-button"
                    disabled={onChainStep === undefined || (!c.present && c.step === 'issue')}
                    title={c.present ? (c.url ?? `Go to the ${c.step}`) : c.label}
                    {...shellControl(() => onChainStep?.(contextBand.related!.itemId, c))}>{c.label}</button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <div className="inspector__state">
        {/*
          The ATTRIBUTE, not only a class: a class is a styling decision a
          restyle may rename, while data-agent-state is this pane's stated
          answer to "what is that agent doing" — the same split check 54 draws
          for the panel itself and RailPanelRow draws for its dot.
        */}
        <span className="inspector__dot status-dot" data-agent-state={state ?? 'none'} data-tone={panelState(model.state, state).tone} aria-hidden="true" />
        <span className="inspector__state-label" data-state-word>{agentStateLabel(state, model.state)}</span>
        {model.reattached && (
          /*
            M6a carried PanelStatus.running.reattached with ZERO readers, and
            CLAUDE.md records the spec's "a reattached panel visibly says so"
            criterion as deliberately unmet by that milestone. This is the
            reader that meets it.
          */
          <span className="inspector__badge" data-inspector-badge="reattached">reattached</span>
        )}
        {pid !== undefined && pid !== '—' && <span className="inspector__pid inspector__value--mono">pid {pid}</span>}
      </div>
      </div>
      {/* Tabs, grouped by QUESTION rather than by feature: Detail (what is
          this panel), Work (what has it done and cost), Tools (what can it
          do). Inactive tabs stay RENDERED and hidden rather than unmounted:
          the model is frozen on the WHOLE inspectorSignature, so a hidden
          tab's figures are as current as the visible one's the instant it is
          switched to — narrowing the signature to the visible tab is the
          obvious optimisation and it freezes hidden tabs stale (§4.3). */}
      {/* M279: the Tabs primitive; `.context__tabs` / `.context__tab` and
          `data-context-tab` stay on the elements for the suites that read them. */}
      <Tabs<ContextTab>
        className="context__tabs"
        label="Context"
        value={tab}
        onSelect={onSelectTab}
        dataAttr="data-context-tab"
        tabs={TABS.map((t) => ({ id: t.id, label: t.label, className: 'context__tab' }))}
      />
      <div className="inspector__body context__body">
      <section className="context__panel" data-context-panel="detail" role="tabpanel" hidden={tab !== 'detail'}>
      {/* M183. THE NODE EDITOR: the selected block's fields from its kind's schema, committed through the draft store's one door. */}
      {/* M388. A shape's form, fill, line and text — its configuration, here and nowhere on the shape. */}
      {model.kind === 'shape' && model.shape !== undefined && onStyleShape !== undefined && <ShapeInspector shape={model.shape} onStyle={(patch) => { onStyleShape(model.id, patch) }} {...(onShapeChart === undefined ? {} : { onChart: (act: ShapeChartAct) => { onShapeChart(model.id, act) } })} />}
      {model.kind === 'workflow' && model.templateId !== undefined && templateOf !== undefined && <NodeFields templateId={model.templateId} templateOf={templateOf} onTestNode={onTestNode} />}
      <dl className="inspector__fields">
        {/* M68. Through the one filter: no pid (the header has it), no
            `asked for` that only repeats `command`. */}
        {visibleDetailFields(model.fields).map((field) => (
          <div className="inspector__field" key={field.key} data-inspector-field={field.key}>
            <dt className="inspector__label">{field.label}</dt>
            {/* M68. A path is left-truncated so its last segments survive the
                260px column, with the whole path on hover (brief, principle 3). */}
            <dd className={`inspector__value${MONO_FIELDS.has(field.key) ? ' inspector__value--mono' : ''}`} title={PATH_FIELDS.has(field.key) ? field.value : undefined}>{field.value}</dd>{/* M178 (F.6): the path rule's bargain — the FULL path lives here, wrapped (`overflow-wrap: anywhere`), never the short form */}
          </div>
        ))}
      {/* M98. The chat's session grants, a field with its own control: four
          arms (unknown / none / the tools / cannot), and Revoke DISABLED with
          the arm's reason rather than absent — a codex chat, which cannot be
          granted, still shows the field and says why. */}
      {model.grants !== undefined && (() => {
        const grants = model.grants
        const revoke = grants.kind === 'unknown' ? { enabled: false, reason: 'main has not answered yet' } : grants.revoke
        const value = grants.kind === 'unknown' ? 'asking…' : grants.kind === 'cannot' ? grants.reason : grants.kind === 'none' ? 'none' : grants.tools.join(', ')
        return (
          <div className="inspector__field inspector__field--grants" data-inspector-field="chat-grants" data-inspector-grants={grants.kind}>
            <dt className="inspector__label">session grants</dt>
            <dd className={`inspector__value${grants.kind === 'some' ? ' inspector__value--mono' : ''}`}>{value}</dd>
            <dd className="inspector__value">
              <button
                type="button"
                className="inspector__link-action"
                data-inspector-grants-action="revoke"
                disabled={!revoke.enabled}
                title={revoke.enabled ? 'Revoke every tool granted for this session — it asks again' : revoke.reason}
                {...shellControl(() => { if (revoke.enabled) onRevokeGrants?.(model.id) })}
              >
                Revoke
              </button>
            </dd>
          </div>
        )
      })()}
      </dl>
      {/* M163. THE MACHINE SECTION (the brief's metrics rule): the per-panel
          CPU · RAM figure's one home, moved here from every header and card
          tier. Three arms, never a blank: a reading; a live panel main has
          not sampled yet (`no reading yet` — never a confident 0%, which is
          the wrong answer costOf refuses too); a panel with no process. */}
      {/* M191 (the golden audit, second half, 6). A selected workflow NODE is
          the object the pane is about, and the enclosing panel's process
          metrics are not that object's — the 5.0 brief says so by name ("a
          workflow node's selection does not show the enclosing workflow
          panel's unrelated process metadata"). The section is absent then,
          rather than saying `not measured` about a block. */}
      {!(model.kind === 'workflow' && nodeSelected) && (() => {
        // A chat's process is main's (M71) and the sampler walks terminal pids
        // only (Canvas.tsx's isTerminalPanel targets): for every kind but a
        // terminal the honest arm is `not measured`, never `not running`.
        const arm = model.kind !== 'terminal' ? 'not-measured' : machine !== undefined ? 'reading' : model.running === true ? 'none' : 'not-running'
        return (
          <details className="inspector__deep" data-inspector-deep>
            <summary className="inspector__deep-summary">Process metrics</summary>
          <section className="inspector__section inspector__machine" data-inspector-machine={arm}>
            <h3 className="inspector__section-heading">Machine</h3>
            <div className="inspector__value" data-machine-cost>{arm === 'reading' && machine !== undefined
              // M191 (the golden audit, first half, 4). A sampled panel really
              // sitting at 0.0% says `under 1%`: the metrics rule's "never a
              // confident 0%" is about the READING, not only about the
              // unsampled arm, and `CPU 0%` beside a working agent is the
              // wrong answer whichever produced it.
              ? `CPU ${machine.cpuPercent < 0.05 ? 'under 1%' : formatCpu(machine.cpuPercent)} · RAM ${formatMemory(machine.memoryBytes)}`
              : arm === 'none' ? 'no reading yet — the process table is sampled every few seconds' : arm === 'not-measured' ? 'not measured — only a terminal\'s process tree is sampled' : 'not running — nothing to measure'}</div>
            {/* Round 7. The shape UNDER the figure, never instead of it. The
                line above is the metrics rule's one home for the readout and
                stays exactly as it was; the sparklines answer the question a
                single sample cannot — climbing, settling, or flat — and are
                absent until a second sample gives that question an answer. */}
            {arm === 'reading' && <MachineChart series={machineSeries} />}
          </section>
          </details>
        )
      })()}
      {model.links.length > 0 && (
        <div className="inspector__links" data-inspector-links>
          <div className="inspector__links-label">links</div>
          {model.links.map((link) => {
            // A link is stored on its SOURCE, so an INCOMING row has to
            // address the OTHER panel as `from`. Getting this inversion
            // backwards makes the controls on an incoming row silently do
            // nothing — the mutator would look for a link on a panel that
            // does not hold it, find none, and return the array unchanged.
            const from = link.direction === 'out' ? model.id : link.to
            const to = link.direction === 'out' ? link.to : model.id
            return (
              <div
                className="inspector__link"
                key={`${link.direction}-${link.to}`}
                data-inspector-link={`${from} ${to}`}
              >
                <span className="inspector__link-dir" aria-hidden="true">
                  {link.direction === 'out' ? '\u2192' : '\u2190'}
                </span>
                <span className="inspector__link-title">{link.title}</span>
                {link.label !== undefined && (
                  <span className="inspector__link-label">{link.label}</span>
                )}
                {link.direction === 'out' && (
                  <button
                    type="button"
                    className={`inspector__link-action${link.restartOnExit ? ' inspector__link-action--on' : ''}`}
                    data-link-automation={`${from}:${to}`}
                    disabled={!link.canRestartOnExit}
                    title={link.canRestartOnExit
                      ? (link.restartOnExit
                          ? 'Disable restart when this panel exits'
                          : 'Restart this terminal when this panel exits')
                      : 'Restart-on-exit requires two terminal panels'}
                    {...shellControl(() => onSetRestartOnExit(from, to, !link.restartOnExit))}
                  >
                    <RotateCw />{link.restartOnExit ? ' on' : ''}
                  </button>
                )}
                {/* M41. The handoff control: a three-state cycle beside the
                    restart toggle, its title naming the NEXT state. One rule
                    per link, so pressing it on a restart link converts the
                    rule — nextHandoffState's own comment. */}
                {link.direction === 'out' && (
                  <button
                    type="button"
                    className="inspector__link-action"
                    data-link-handoff={`${from}:${to}`}
                    disabled={!link.canRestartOnExit}
                    title={link.canRestartOnExit ? handoffControl(link.handoff).title : 'A handoff requires two terminal panels'}
                    {...shellControl(() => onSetLinkAutomation(from, to, nextHandoffState(link.automation)))}
                  >
                    {handoffControl(link.handoff).label}
                  </button>
                )}
                {link.direction === 'out' && link.automation?.enabled === true && automationResults.get(`${from}:${to}`) !== undefined && (
                  <span className="inspector__link-label" data-link-automation-result={`${from}:${to}`}>
                    {automationResults.get(`${from}:${to}`)}
                  </span>
                )}
                {/* Both controls go through shellControl, so neither takes DOM
                    focus off xterm — see CLAUDE.md's "A shell control never
                    takes DOM focus". */}
                <button
                  type="button"
                  className="inspector__link-action icon-button"
                  title="Label this link"
                  aria-label="Label this link"
                  {...shellControl(() => onRelabelLink(from, to, link.label ?? ''))}
                >
                  <Pencil />
                </button>
                <button
                  type="button"
                  className="inspector__link-action icon-button"
                  title="Remove this link"
                  aria-label="Remove this link"
                  {...shellControl(() => onRemoveLink(from, to))}
                >
                  <Close />
                </button>
              </div>
            )
          })}
        </div>
      )}
      </section>
      <section className="context__panel" data-context-panel="work" role="tabpanel" hidden={tab !== 'work'}>
      {/* M68. EVERY section renders, each with its first arm as a line: three
          absent headings read as a broken tab (brief, principle 7), where a
          heading whose line says WHY there is nothing is an answer. The
          earlier rule — hide Changes for not-a-repo so a placeholder does
          not teach the user to skip the tab — is overruled by that, and by
          the line saying what would change the answer. */}
      {(review === null || review.hidden) && (
        <section className="inspector__section" data-work-section="changes">
          <h3 className="inspector__section-heading">Changes</h3>
          <p className="inspector__arm" data-work-arm="changes">
            {model.kind === 'review' ? 'a review node reports its own changes in its body'
              : model.kind !== 'terminal' ? `${KIND_NOUN[model.kind]} changes nothing`
              /* null is asked-and-unanswered; hidden is answered not-a-repo.
                 Two arms, two lines (M68's verifier caught them as one). */
              : review === null ? 'reading…'
              : 'this directory is not a repository'}
          </p>
        </section>
      )}
      {review !== null && !review.hidden && (
        /*
          `hidden` (not-a-repo, or the invoke hasn't resolved yet) renders
          nothing at all rather than an empty section — see ReviewFieldModel's
          own doc comment in inspector-fields.ts: a permanent placeholder on
          most panels (most cwds are not repositories) teaches the user to
          stop reading this part of the pane.
        */
        <section className="inspector__section">
          <h3 className="inspector__section-heading">Changes</h3>
          {/* M86. The branch and where it stands, from the local tracking
              ref — never a fetch, and the phrase says so. Absent until asked,
              a phrase when git answered, nothing when it could not (the note
              below already says why). */}
          {branchLine !== null && branchLine !== '' && (
            <p className="inspector__branch-line inspector__value--mono" data-branch-line>{branchLine}</p>
          )}
          <p className="inspector__review-summary" data-review-summary>{review.summary}</p>
          {review.note !== undefined && (
            <p className="inspector__review-note" data-review-note>{review.note}</p>
          )}
          {/*
            Inside the section rather than beside Restart, so it sits with the
            thing it acts on — but the SECTION IS NOT THE GATE. `hidden`
            answers "is this panel in a repository", which is a different
            question from "is there anything to open": `never-started` is by
            far the commonest unopenable arm. So it gates on `restartable` —
            the SAME field the palette's panel.review row gates on — disabled
            with a reason rather than hidden (verify:palette 31's rule). A
            review NODE never reaches here: Canvas leaves `review` null for
            one (verify:panels 112).
          */}
          <button
            type="button"
            className="inspector__action"
            data-inspector-action="review"
            disabled={!model.reviewable}
            title={model.reviewable
              ? `Open a review node for ${model.heading}`
              : (model.reviewReason ?? `${model.heading} has not started yet, so there is no baseline to review against`)}
            {...shellControl(() => onOpenReview(model.id))}
          >
            Open review
          </button>
          <ul className="inspector__review-files">
            {review.files.map((f) => (
              <li key={f.path} className="inspector__review-file" data-review-file={f.path}>
                <span className="inspector__review-path">{f.path}</span>
                <span className="inspector__review-counts">
                  {f.untracked ? 'new' : f.binary ? 'bin' : `+${f.added} −${f.removed}`}
                </span>
              </li>
            ))}
          </ul>
          {review.more > 0 && <p className="inspector__review-more">+{review.more} more</p>}
        </section>
      )}
      {/* Runs before Cost: what it did, then what it cost (spec order). */}
      {/* M79. The run this panel belongs to: the rail row's facts verbatim and
          its verb, or the one sentence when it is not in one. Its own section,
          so the ledger's empty state never sits under a real answer. */}
      <section className="inspector__section" data-work-section="run">
        <h3 className="inspector__section-heading">Run</h3>
        {panelRun ? (
          <div className="inspector__run" data-work-run>
            <span className="inspector__run-name">{panelRun.name}</span>
            <span className="inspector__run-facts">{panelRun.facts} · <span data-tone={panelRun.tone}>{panelRun.outcome}</span></span>
            {/* M191 (the golden audit, 11). ONE filled primary per surface:
                the action bar's Restart is this pane's, so Run again is a
                quiet action beside it. Two filled controls on one pane make
                neither of them the next thing to do. */}
            <button type="button" className="inspector__action" data-work-run-again disabled={!panelRun.runAgain.enabled}
              title={panelRun.runAgain.enabled ? 'Restart this run\'s roots in order' : panelRun.runAgain.reason}
              {...shellControl(() => { if (panelRun.runAgain.enabled) onRunAgain(panelRun.id) })}>Run again</button>
          </div>
        ) : <p className="inspector__arm" data-work-run>not part of a run</p>}
      </section>
      {/* (this redesign) A kind that never runs a command (every non-terminal kind) gets
          no Commands section at all — it was permanently non-actionable
          rather than merely empty-for-now, which is the stronger case for
          #17's "avoid empty sections" rule. */}
      {model.kind === 'terminal' && <RunsSection panelId={model.id} active={tab === 'work'} />}
      {model.usage.hidden && (
        /*
          M68. `hidden` is a panel whose preset declared no agent — a login
          shell, most panels. It used to render NOTHING; it now renders the
          heading and the reason, which is still not a figure: "$0.00 beside
          a working agent is a confident wrong answer" holds, and "no agent
          pinned" is not a number.
        */
        <section className="inspector__section" data-work-section="cost">
          <h3 className="inspector__section-heading">Cost</h3>
          <p className="inspector__arm" data-work-arm="cost">{model.kind === 'terminal' ? 'no agent on this panel — nothing to cost' : `${KIND_NOUN[model.kind]} costs nothing`}</p>
        </section>
      )}
      {!model.usage.hidden && (
        <section className="inspector__section" data-usage-section>
          <h3 className="inspector__section-heading">Cost</h3>
          {model.usage.note !== undefined && (
            <p className="inspector__usage-note" data-usage-note>{model.usage.note}</p>
          )}
          {model.usage.rows.length > 0 && (
            <>
              {/* FOUR figures, never one sum: a single total is unanswerable
                  when the user asks why it is large. */}
              <ul className="inspector__usage-rows">
                {model.usage.rows.map((row) => (
                  <li key={row.label} className="inspector__usage-row" data-usage-row={row.label}>
                    <span className="inspector__usage-label">{row.label}</span>
                    <span
                      className="inspector__usage-tokens"
                      {...(row.label === 'output' ? { 'data-usage-output': true } : {})}
                    >
                      {row.tokens.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="inspector__usage-turns" data-usage-turns>
                {model.usage.turns} turn{model.usage.turns === 1 ? '' : 's'}
                {model.usage.subagentTurns > 0 ? `, ${model.usage.subagentTurns} by subagents` : ''}
              </p>
              {model.usage.cost !== undefined && (
                <p className="inspector__usage-cost" data-usage-cost title={model.usage.costLabel}>
                  ${model.usage.cost.toFixed(2)}{' '}
                  <span className="inspector__usage-cost-suffix">list price</span>
                </p>
              )}
              {/* M380. The cache's return, at the same list price. */}
              {model.usage.cacheReturn !== undefined && (
                <p className="inspector__usage-turns" data-usage-cache-return>{model.usage.cacheReturn}</p>
              )}
            </>
          )}
        </section>
      )}
      {model.caps !== undefined && <CapsSection id={model.id} caps={model.caps} onCap={onCap} />}
      </section>
      {/* M279. The object's feed — deep detail, so it is here and on no frame. */}
      <section className="context__panel" data-context-panel="activity" role="tabpanel" hidden={tab !== 'activity'}>
        {/* M383. What a conversation DID, as it stood at any turn: the replay's
            door beside the feed of what it did. A view — nothing runs. */}
        {model.kind === 'chat' && (
          <div className="inspector__replay">
            <button type="button" className="inspector__action" data-inspector-replay title="Scrub this conversation back to any turn and see its files as they stood then — and compare it with another"
              {...shellControl(() => openReplay(model.id))}>Replay this conversation…</button>
          </div>
        )}
        <InspectorActivity panelId={model.id} />
      </section>
      <section className="context__panel" data-context-panel="tools" role="tabpanel" hidden={tab !== 'tools'}>
      <AutomationList rows={automations} results={automationResults} onSetLinkAutomation={onSetLinkAutomation} />
      {toolbox !== null && !toolbox.hidden && (
        <section className="inspector__section">
          <h3 className="inspector__section-heading">Toolbox</h3>
          <p className="inspector__review-summary" data-toolbox-summary>{toolbox.summary}</p>
          {/* M68. Commands AND permissions: the rules by bucket, one line. */}
          {toolbox.permissions !== undefined && (
            <p className="inspector__arm" data-toolbox-permissions>permissions: {toolbox.permissions}</p>
          )}
          {toolbox.note !== undefined && (
            <p className="inspector__review-note" data-toolbox-note>{toolbox.note}</p>
          )}
          <ul className="inspector__toolbox-list">
            {toolbox.rows.map((row) => (
              <li className="inspector__toolbox-row" key={row.id} data-toolbox-row={row.name}>
                <span className="inspector__toolbox-name">{row.name}</span>
                <span className="inspector__toolbox-scope">{row.scope}</span>
                {row.state !== 'active' && (
                  <span className="inspector__toolbox-state">{row.state}</span>
                )}
              </li>
            ))}
          </ul>
          {toolbox.more > 0 && (
            <p className="inspector__review-more" data-toolbox-more>+{toolbox.more} more</p>
          )}
          {/* M256. The skills this selection has not used, counted — a
              person reading the list must not take "not here" for "not
              installed". The Skills view lists every one. */}
          {toolbox.elsewhere !== undefined && (
            <p className="inspector__review-note" data-toolbox-elsewhere={String(toolbox.elsewhere)}>
              {toolbox.elsewhere} user or plugin skill{toolbox.elsewhere === 1 ? '' : 's'} not used here - see Skills
            </p>
          )}
          {/* Present whenever the section renders, because a toolbox needs
              only a DIRECTORY — and, since M194, DISABLED WITH A REASON when
              that directory cannot be used, rather than a control that opens a
              panel with nothing in it. Removing it instead would make an
              unavailable directory indistinguishable from a door this app
              never built (the repository's standing rule for every
              administrative affordance). */}
          <button
            type="button"
            className="inspector__action"
            data-toolbox-open
            disabled={toolbox.openReason !== undefined}
            title={toolbox.openReason}
            {...shellControl(() => { onOpenToolbox(model.id) })}
          >
            Open toolbox
          </button>
        </section>
      )}
      {(toolbox === null || toolbox.hidden) && automations.length === 0 && (
        <p className="inspector__review-note" data-context-empty="tools">
          {toolbox === null
            ? `${model.kind === 'terminal' ? 'This panel' : KIND_NOUN[model.kind]} has no directory, so there is no toolbox to read.`
            : 'No skills, commands or MCP servers configured in this directory.'}
        </p>
      )}
      </section>
      </div>
      {/*
        (this redesign) ONE primary button plus a ⋯ menu, replacing the persistent
        two-column matrix: the single most relevant action stays in the bar
        (Review request on a pending chat, otherwise Restart), and every other
        verb — layout, naming, linking — lives in the dropdown, Close last
        and set off by a divider as its own destructive footer. Every verb
        still MOUNTS unconditionally and disables by name rather than
        vanishing (M207's rule, kept); the dropdown is reached by a real Tab
        too — the trigger opens it on focus, not only on click — so
        verify:panels `reach.1` still walks every action in DOM order.
      */}
      <div className="inspector__actions context__actions">
        {/* #16. On a chat, the pending request leads — as a NAVIGATION to the
            queue that resolves it, never a second Allow/Deny. It still MOUNTS
            unconditionally and disables by name (M207's rule). */}
        {model.kind === 'chat' && (
          <button
            type="button"
            className="inspector__action"
            data-inspector-action="review-request"
            hidden={model.approval === undefined}
            disabled={model.approval === undefined}
            title={model.approval === undefined
              ? 'nothing is waiting for an answer'
              : `Open Needs you on ${model.approval.toolName} — ${model.approval.argument}`}
            {...shellControl(() => { if (model.approval !== undefined) onReviewApproval(model.approval.requestId) })}
          >
            {model.approval === undefined ? 'Review request' : model.approval.toolName === PLAN_TOOL ? 'Read the plan' : `Review ${model.approval.toolName} request`}
          </button>
        )}
        {/*
          FIRST among the rest, and DISABLED rather than absent when the panel never started:
          a control that vanished would read as a feature that was never
          built, the rule verify:palette 31 states for rows.

          There is no confirm — decided, not deferred — so the `title` is
          where the whole warning lives. It has to say that this ENDS the
          running process, because the moment a user most wants to restart is
          the one where the agent is mid-question, and that is exactly the
          moment the loss is largest.
        */}
        <button
          type="button"
          className={`inspector__action${model.kind === 'terminal' ? ' inspector__action--primary' : ' inspector__action--quiet'}`}
          data-inspector-action="restart"
          hidden={model.kind !== 'terminal'}
          disabled={model.kind !== 'terminal' || !model.restartable}
          title={
            // Terminal is the SPECIAL case and every other kind is uniform,
            // which is the inverse of how this read until the M27 audit. The
            // old shape named 'review' and 'file' explicitly and let everything
            // else fall into the terminal branch — so a toolbox node, and then
            // a Jira panel, advertised "<name> has not started yet" on a
            // control disabled precisely because there is nothing to start.
            // KIND_NOUN is a total Record over the sessionless kinds, so a
            // sixth kind cannot reach this sentence without failing to compile.
            model.kind === 'terminal'
            ? model.restartable
              ? `Restart ${model.heading} — ends the running process and starts it again`
              : `${model.heading} has not started yet`
            : `${KIND_NOUN[model.kind]} has no process to restart`
          }
          {...shellControl(() => onRestart(model.id))}
        >
          Restart
        </button>
        <span className="inspector__menu-host" ref={menuHostRef} onBlur={(event) => {
          const host = menuHostRef.current
          if (host !== null && event.relatedTarget instanceof Node && host.contains(event.relatedTarget)) return
          setMenuOpen(false)
        }}>
          {/*
            reach.1. This carries `data-inspector-action="menu"` — the
            SAME attribute every sibling verb carries — for a reason that is
            not cosmetic: `verify:panels reach.1` finds "the bar's first
            enabled action" by querying `[data-inspector-action]` and calling
            `.focus()` on it directly (never a real Tab-in) to seed its walk.
            Restart is disabled until a panel has actually started, and this
            trigger — never disabled, and first in DOM order among what is
            left once Restart is out — is exactly what that seed must land
            on: a real, always-visible, always-focusable control. Land
            `.focus()` on anything inside the menu itself instead (Lock,
            Pin, …) and it fails outright, because those stay `display: none`
            until this button's own `onFocus` below opens them — which is
            what a `.focus()` aimed past this button skips.
          */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger
            className="inspector__action inspector__action--secondary inspector__menu-open"
            data-inspector-action="menu"
            title={menuOpen ? 'Hide panel actions' : 'Layout, naming and linking actions'}
            onFocus={() => setMenuOpen(true)}
          >
            <More size={14} />
          </PopoverTrigger>
          {/* A POPOVER, not a Menu — and the difference is this pane's
              keyboard contract, not a preference. The trigger's `onFocus`
              above opens the surface so that TAB WALKS EVERY ACTION, which is
              the M71–M93 promise verify:panels:product `reach.1` pins ("in the
              tab order, not click-only"). A Radix menu deliberately replaces
              that model: its roving focus group leaves exactly one tab stop
              and expects the arrow keys, so Tab would skip the whole menu.
              A popover's content is ordinary tabbable markup, so the contract
              survives untouched and the surface still gains Escape,
              outside-click dismissal, focus returned to the trigger and
              aria-expanded that cannot drift.

              `forceMount` keeps M207's own rule: every verb below stays
              MOUNTED (only `hidden` toggles), discoverable whether or not the
              surface has been opened. Radix would otherwise unmount it and
              take `[data-inspector-action="close"]` with it — which
              verify-panels-agents clicks WITHOUT opening this menu. The
              `.inspector__menu[hidden] { display: none }` rule that
              verify:styles m207.context.1 pins still does the hiding. */}
          <PopoverContent forceMount>
          <div
            className="inspector__menu"
            role="menu"
            data-inspector-menu
            hidden={!menuOpen}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenuOpen(false) } }}
          >
            {/* M92. Three toggles, each reading the model's marks; the word says what the click DOES. */}
            <button type="button" className="inspector__action" role="menuitem" data-inspector-action={model.marks?.locked ? 'unlock' : 'lock'}
              title={model.marks?.locked ? 'Unlock — drag and resize work again' : 'Lock — drag and resize refuse; close still works'}
              {...shellControl(() => { (model.marks?.locked ? onUnlock : onLock)(model.id); setMenuOpen(false) })}>{model.marks?.locked ? 'Unlock' : 'Lock'}</button>
            <button type="button" className="inspector__action" role="menuitem" data-inspector-action={model.marks?.pinned ? 'unpin' : 'pin'}
              disabled={!model.marks?.pinned && pinRefusal(model.kind, false, pinnedCount ?? 0) !== undefined}
              title={model.marks?.pinned ? 'Unpin — tiering decides again' : (pinRefusal(model.kind, false, pinnedCount ?? 0) ?? 'Pin — kept live wherever the camera is, inside the live budget')}
              {...shellControl(() => { (model.marks?.pinned ? onUnpin : onPin)(model.id); setMenuOpen(false) })}>{model.marks?.pinned ? 'Unpin' : 'Pin'}</button>
            <button type="button" className="inspector__action" role="menuitem" data-inspector-action={model.marks?.maximised ? 'restore' : 'maximise'}
              title={model.marks?.maximised ? 'Restore this panel to where it was' : 'Fill the window with this panel'}
              {...shellControl(() => { (model.marks?.maximised ? onRestore : onMaximise)(model.id); setMenuOpen(false) })}>{model.marks?.maximised ? 'Restore' : 'Fill'}</button>
            {/* M74. The front-end verb — present only on the two kinds that have
                a conversation, disabled by name when it cannot apply. */}
            {model.frontEnd !== undefined && (
              <button
                type="button"
                className="inspector__action"
                role="menuitem"
                data-inspector-action="front-end"
                data-front-end={model.frontEnd.verb}
                disabled={!model.frontEnd.enabled}
                title={model.frontEnd.enabled
                  ? (model.frontEnd.verb === 'open-as-chat' ? `Open ${model.heading} as a chat — the same session, rendered as a transcript` : `Open ${model.heading} in a terminal — claude --resume this session`)
                  : (model.frontEnd.reason ?? '')}
                {...shellControl(() => { onFrontEnd(model.id); setMenuOpen(false) })}
              >
                {model.frontEnd.verb === 'open-as-chat' ? 'Open as chat' : 'Open in terminal'}
              </button>
            )}
            <button
              type="button"
              className="inspector__action inspector__action--secondary"
              role="menuitem"
              data-inspector-action="rename"
              title={`Rename ${model.heading}`}
              {...shellControl(() => { onRename(model.id, model.title ?? ''); setMenuOpen(false) })}
            >
              Rename…
            </button>
            <button
              type="button"
              className="inspector__action inspector__action--secondary"
              role="menuitem"
              data-inspector-action="save-preset"
              hidden={model.kind !== 'terminal'}
              disabled={model.kind !== 'terminal'}
              title={model.kind === 'terminal'
                ? `Save ${model.heading} as a preset`
                : `${KIND_NOUN[model.kind]} is not a spawnable panel`}
              {...shellControl(() => { onSavePreset(model.id); setMenuOpen(false) })}
            >
              Save as preset
            </button>
            {/*
              M13. Arms the one-shot link mode with THIS panel as the source; the
              next click on the canvas completes or cancels it. Present for both
              kinds — a review node is an ordinary link endpoint, since `links`
              lives on PanelBase — so unlike Save-as-preset it carries no
              kind-based disable.
            */}
            <button
              type="button"
              className="inspector__action inspector__action--secondary"
              role="menuitem"
              data-inspector-action="link"
              title={`Link ${model.heading} to another panel`}
              {...shellControl(() => { onLink(model.id); setMenuOpen(false) })}
            >
              Link to…
            </button>
            {/* Item 7 of the anatomy: destructive actions, separated — a
                divider and its own footer role within the same menu. */}
            <div className="inspector__menu-divider" role="separator" />
            <button
              type="button"
              className={`inspector__action inspector__action--destructive${closeArmed ? ' inspector__action--armed' : ''}`}
              role="menuitem"
              data-inspector-action="close"
              {...(closeArmed ? { 'data-close-armed': '' } : {})}
              title={closeArmed ? `Click again to close ${model.heading}` : `Close ${model.heading} (click twice)`}
              {...shellControl(() => {
                if (closeArmed) { setCloseArmed(false); setMenuOpen(false); onClose(model.id) } else setCloseArmed(true)
              })}
            >
              {closeArmed ? 'close?' : 'Close'}
            </button>
          </div>
          </PopoverContent>
          </Popover>
        </span>
      </div>
    </div>
  )
}


/**
 * M183. THE NODE EDITOR. The selected block's fields, rendered from
 * `fieldsOf(kind)` — the same table the validator reads, so a field here is
 * a field the record has. Every commit (Enter, or blur) applies
 * `configureNode` through the draft store's one door; a refusal keeps the
 * typed value in the field and shows the reason beside it (`data-inspector-
 * node-reason`) — the draft is never lost to validation. A selected EDGE
 * shows its trigger as a select over the one vocabulary; changing it
 * re-adds the edge under the new trigger. Nothing selected: nothing here —
 * the panel's own fields below are M133's.
 */
/** M183. Words, not codes, for the node editor's labels; `w`/`h` are the minted panel's pixel geometry — the diagram's drag owns that, so they are not rendered (the agent verb keeps them).
 *  M259. Sentence-case LABELS a person would say, each with a one-line HINT, grouped by the question they answer — the flat run of lower-case codes read as a config file. */
const NODE_FIELD_LABELS: Record<string, string> = { cwd: 'Folder', title: 'Name', command: 'Command', args: 'Arguments', presetId: 'Preset', message: 'First message', width: 'Workers at once', list: 'List of items', prompt: 'Instructions', target: 'Write results to', line: 'Canvas verb', url: 'Address', method: 'Method' }
const NODE_FIELD_HINTS: Record<string, string> = {
  cwd: 'Where it works — its terminal or chat opens here.',
  title: 'What the block is called on the graph.',
  command: 'The program to run; empty is your login shell.',
  args: 'Words passed to the command, separated by spaces.',
  presetId: 'A saved launch preset to start from instead of a command.',
  message: 'Sent to the agent as soon as it starts.',
  width: 'How many items run in parallel.',
  list: 'A file with one item per line.',
  prompt: 'What every worker is told, with its item below it.',
  target: 'The file the collected results are written to.',
  line: 'One line, run through the same executor the palette uses.',
  url: 'Read with a GET when the block runs.',
  method: 'Only GET runs — a write is refused by name.'
}
/** The groups, in reading order; a field no group names falls into the last. */
const NODE_FIELD_GROUPS: ReadonlyArray<{ title: string; fields: readonly string[] }> = [
  { title: 'Basics', fields: ['title'] },
  { title: 'What it does', fields: ['command', 'args', 'presetId', 'message', 'prompt', 'line', 'url', 'method'] },
  { title: 'Where it works', fields: ['cwd', 'list', 'target'] },
  { title: 'Capacity', fields: ['width'] }
]
const HIDDEN_NODE_FIELDS = new Set(['dx', 'dy', 'w', 'h'])

function NodeFields({ templateId, templateOf, onTestNode }: { templateId: string; templateOf: (id: string) => PersistedTemplate | undefined; onTestNode?: (templateId: string, key: string) => Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }> }): JSX.Element | null {
  const saved = templateOf(templateId)
  const { template } = useTemplateDraft(templateId, saved)
  const selected = useSelectedOf(templateId)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [tested, setTested] = useState<string | null>(null)
  // Reset on the TEMPLATE, never on the selection: a blur that refuses sets the
  // reason and then the click that moved the selection wiped both, losing the
  // typed value the refusal promised to keep (the M183 critic).
  useEffect(() => { setDrafts({}); setReasons({}) }, [templateId])
  if (template === undefined || selected === null) return null
  // M259. A block by the name the graph shows, never its bare key.
  const nameOf = (key: string): string => { const n = template.nodes.find((x) => x.key === key); return n !== undefined && 'title' in n && typeof n.title === 'string' && n.title.trim() !== '' ? n.title : key }
  if (selected.includes('>')) {
    const [from, to] = selected.split('>') as [string, string]
    const edge = template.edges.find((e) => e.from === from && e.to === to)
    if (edge === undefined) return null
    return (
      <section className="inspector__section inspector__section--node" data-inspector-node="edge" data-inspector-node-edge={selected}>
        <h3 className="inspector__section-heading inspector__section-heading--node">Handoff · {nameOf(from)} to {nameOf(to)}</h3>
        <div className="inspector__field inspector__node-field" data-inspector-node-field-row="trigger">
          <label className="inspector__label" htmlFor={`edge-trigger-${templateId}`}>{`${nameOf(to)} starts`}</label>
          <span className="inspector__node-hint">{`When ${nameOf(from)} reaches this point, ${nameOf(to)} begins.`}</span>
          <select id={`edge-trigger-${templateId}`} className="inspector__input" data-inspector-node-field="trigger" value={edge.trigger}
            // ONE operation, in place: an unedge-then-re-add is two undo steps and loses the edge if the second refuses (the critic).
            onChange={(e) => { const r = applyDraftOp(templateId, saved, { type: 'retrigger', from, to, trigger: e.target.value as typeof edge.trigger }); if (r.kind === 'refused') setReasons({ trigger: r.reason }) }}>
            {HANDOFF_TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_WORDS[t]}</option>)}
          </select>
          {reasons.trigger !== undefined && <p className="inspector__arm inspector__reason" data-inspector-node-reason="trigger">{reasons.trigger}</p>}
        </div>
      </section>
    )
  }
  const node = template.nodes.find((n) => n.key === selected)
  if (node === undefined) return null
  const fields = fieldsOf(node.kind)
  const current = (name: string): string => {
    const v = (node as unknown as Record<string, unknown>)[name]
    return v === undefined ? '' : Array.isArray(v) ? (v as string[]).join(' ') : String(v)
  }
  const commit = (name: string, type: 'string' | 'number' | 'string[]'): void => {
    const raw = drafts[name]
    if (raw === undefined || raw === current(name)) return
    const value: unknown = type === 'number' ? Number(raw) : type === 'string[]' ? raw.split(/\s+/).filter((w) => w !== '') : raw
    const r = applyDraftOp(templateId, saved, { type: 'set', key: node.key, patch: { [name]: value } })
    if (r.kind === 'refused') setReasons((rs) => ({ ...rs, [name]: r.reason }))
    else { setReasons((rs) => { const { [name]: _gone, ...rest } = rs; return rest }); setDrafts((ds) => { const { [name]: _gone, ...rest } = ds; return rest }) }
  }
  const visible = fields.filter((f) => !HIDDEN_NODE_FIELDS.has(f.name))
  const grouped = NODE_FIELD_GROUPS.map((g) => ({ title: g.title, fields: visible.filter((f) => g.fields.includes(f.name)) }))
  const rest = visible.filter((f) => !NODE_FIELD_GROUPS.some((g) => g.fields.includes(f.name)))
  if (rest.length > 0) grouped.push({ title: 'More', fields: rest })
  const fieldRow = (f: (typeof fields)[number]): JSX.Element => (
    <div className="inspector__field inspector__node-field" key={f.name} data-inspector-node-field-row={f.name}>
      <label className="inspector__label" htmlFor={`node-${templateId}-${f.name}`}>{NODE_FIELD_LABELS[f.name] ?? f.name}</label>
      <input id={`node-${templateId}-${f.name}`} className={`inspector__input${f.name === 'cwd' || f.name === 'command' || f.name === 'args' || f.name === 'list' || f.name === 'target' ? ' inspector__value--mono' : ''}`}
        data-inspector-node-field={f.name} type={f.type === 'number' ? 'number' : 'text'}
        aria-describedby={NODE_FIELD_HINTS[f.name] === undefined ? undefined : `node-${templateId}-${f.name}-hint`}
        // The path rule: the field must hold the real value (it is editable), so the whole of it rides the title.
        title={drafts[f.name] ?? current(f.name)}
        value={drafts[f.name] ?? current(f.name)}
        onChange={(e) => { setDrafts((ds) => ({ ...ds, [f.name]: e.target.value })); setReasons((rs) => { const { [f.name]: _gone, ...rest } = rs; return rest }) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(f.name, f.type) } e.stopPropagation() }}
        onBlur={() => commit(f.name, f.type)}
        // Focus EXPLICITLY: the pane's own mousedown rule keeps focus on the canvas (shellControl), and an input that never takes it swallows the typing.
        onMouseDown={(e) => { e.stopPropagation(); e.currentTarget.focus() }}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); e.currentTarget.focus() }} />
      {NODE_FIELD_HINTS[f.name] !== undefined && <span className="inspector__node-hint" id={`node-${templateId}-${f.name}-hint`}>{NODE_FIELD_HINTS[f.name]}</span>}
      {reasons[f.name] !== undefined && <p className="inspector__arm inspector__reason" data-inspector-node-reason={f.name}>{reasons[f.name]}</p>}
    </div>
  )
  const kindName = LIBRARY.find((e) => e.kind === node.kind)?.name ?? node.kind
  return (
    <section className="inspector__section inspector__section--node" data-inspector-node="block" data-inspector-node-key={node.key}>
      <h3 className="inspector__section-heading inspector__section-heading--node">{kindName} · {nameOf(node.key)}</h3>
      {/* M259. GROUPED by the question each set answers, in the UI face,
          every field with a label a person would say and a one-line hint. */}
      {grouped.filter((g) => g.fields.length > 0).map((g) => (
        <fieldset key={g.title} className="inspector__node-group" data-inspector-node-group={g.title}>
          <legend className="inspector__node-legend">{g.title}</legend>
          {g.fields.map(fieldRow)}
        </fieldset>
      ))}
      {/* M188. Test this node: ONE block, on its own, with its duration and a
          named failure — its neighbours are not started. Present for every
          kind and refused BY NAME for the kinds that only run as part of the
          workflow, rather than hidden (this repo's rule). */}
      <button type="button" className="pf__verb pf__verb--word" data-inspector-node-test
        title="Run this block on its own and report what it answered"
        onClick={() => { void onTestNode?.(templateId, node.key).then((r) => setTested(r.kind === 'ran' ? (r.note ?? 'ran') : r.reason)) }}>Test this node</button>
      {tested !== null && <p className="inspector__arm" data-inspector-node-tested>{tested}</p>}
      <button type="button" className="pf__verb pf__verb--word" data-inspector-node-deselect onClick={() => select(templateId, null)}>Done</button>
    </section>
  )
}
