import { memo, useEffect, useState, type JSX } from 'react'
import { useAgentState } from '@renderer/session/agent-state-store'
import { formatCpu, formatMemory, useMachineCost } from '@renderer/session/machine-cost-store'
import type { InspectorModel, InspectorSummary, ReviewFieldModel, ToolboxFieldModel } from './inspector-fields'
import { agentStateLabel, handoffControl, historyWord, KIND_NOUN, visibleDetailFields } from './inspector-fields'
import type { Tone } from '@renderer/panels/panel-state'
import { panelState } from '@renderer/panels/panel-state'
import { nextHandoffState } from '@renderer/panels/panels'
import { type HandoffTrigger, type LinkAutomation } from '@shared/handoff'
import { TRIGGER_WORDS } from '@renderer/canvas/trigger-words'
import { pinRefusal } from '@renderer/canvas/lod'
import { shellControl } from './shell-control'
import { Close, Pencil, RotateCw } from '@renderer/icons'
import type { PersistedTemplate } from '@shared/templates'
import { applyDraftOp, select, useSelectedOf, useTemplateDraft } from '@renderer/workflow/template-draft-store'
import { fieldsOf } from '@shared/template-edit'
import { HANDOFF_TRIGGERS } from '@shared/handoff'
import type { ContextTab } from './useShellChrome'
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
  /** M76. Answer the chat's pending permission request. */
  onAnswer: (id: string, requestId: string, allow: boolean) => void
  /** M98. Drop every session grant for the chat; absent leaves the Revoke control disabled by name. */
  onRevokeGrants?: (id: string) => void
  onOpenReview: (id: string) => void
  onLink: (id: string) => void
  onRemoveLink: (from: string, to: string) => void
  onRelabelLink: (from: string, to: string, current: string) => void
  onSetRestartOnExit: (from: string, to: string, enabled: boolean) => void
  /** M41: set or replace the one rule on a link — the handoff control's verb, and the list toggle's. */
  onSetLinkAutomation: (from: string, to: string, automation: LinkAutomation) => void
  /** Ephemeral evidence of what a functional link most recently did. */
  automationResults: ReadonlyMap<string, string>
  automations: AutomationRow[]
  /** M78. The selected edge, when one is; the pane shows it with its rule as a select. */
  selectedEdge?: SelectedEdge | null
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
function InspectorImpl({
  onToggle: _onToggle, templateOf, tab, onSelectTab, model, summary, onRename, onClose, onSavePreset, onRestart, onFrontEnd, onAnswer, onRevokeGrants, onOpenReview, onLock, onUnlock, onPin, onUnpin, onMaximise, onRestore, pinnedCount,
  onLink, onRemoveLink, onRelabelLink, onSetRestartOnExit, onSetLinkAutomation, automationResults, automations, review, toolbox, onOpenToolbox, selectedEdge, panelRun, onRunAgain, branchLine, repository
}: InspectorProps): JSX.Element {
  // M46. The toggle lives in the top bar now (there is no pane to hold it
  // while the pane is hidden); the prop stays so the wiring reads the same.
  return (
    <aside className="shell__inspector" aria-label="Context">
      {model === null && selectedEdge != null
        ? <EdgePanel edge={selectedEdge} onSetLinkAutomation={onSetLinkAutomation} onRemoveLink={onRemoveLink} onRelabelLink={onRelabelLink} />
        : model === null
        ? <>
            <div className="shell__region-title">Canvas</div>
            <AutomationList rows={automations} results={automationResults} onSetLinkAutomation={onSetLinkAutomation} />
            <InspectorEmpty summary={summary} />
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
            onRename={onRename}
            onClose={onClose}
            onSavePreset={onSavePreset}
            onRestart={onRestart}
            onLock={onLock} onUnlock={onUnlock} onPin={onPin} onUnpin={onUnpin} onMaximise={onMaximise} onRestore={onRestore} pinnedCount={pinnedCount}
            onFrontEnd={onFrontEnd}
            onAnswer={onAnswer}
            onRevokeGrants={onRevokeGrants}
            panelRun={panelRun ?? null}
            onRunAgain={onRunAgain ?? (() => {})}
            onOpenReview={onOpenReview}
            onLink={onLink}
            onRemoveLink={onRemoveLink}
            onRelabelLink={onRelabelLink}
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
  // M68. The empty arm is a line, not an absent heading.
  if (rows.length === 0) {
    return (
      <section className="inspector__section" data-work-section="runs">
        {/* M79: `Commands`, since a RUN is now the graph's execution (its own section above). */}
        <h3 className="inspector__section-heading">Commands</h3>
        <p className="inspector__arm" data-work-arm="runs">no commands yet</p>
      </section>
    )
  }
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
function InspectorEmpty({ summary }: { summary: InspectorSummary }): JSX.Element {
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
        {/* M142 (#19's history half). This week's CLOSED sessions from the run
            ledger, three states: reading, nothing closed, a figure (or
            unpriced) with its count. The live totals above are what is on the
            canvas now; this is what already ended. */}
        <div className="inspector__field">
          <dt className="inspector__label">this week</dt>
          <dd className="inspector__value" data-summary="history">{historyWord(summary.history)}</dd>
        </div>
      </dl>
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
  model, review, toolbox, onOpenToolbox, onRename, onClose, onSavePreset, onRestart, onFrontEnd, onAnswer, onRevokeGrants, onOpenReview, onLock, onUnlock, onPin, onUnpin, onMaximise, onRestore, pinnedCount, panelRun, onRunAgain,
  onLink, onRemoveLink, onRelabelLink, onSetRestartOnExit, onSetLinkAutomation, automationResults, branchLine, repository
}: {
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
  onAnswer: (id: string, requestId: string, allow: boolean) => void
  onRevokeGrants?: (id: string) => void
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
  // M46. Close is DESTRUCTIVE and gated by the same one-click arming the
  // panel's own × uses (never a modal — this app has one modal-shaped surface
  // and keeps it that way). A button pinned at a fixed corner of the pane is
  // a mis-click target in a way a mid-scroll button was not, which is why
  // the M8b reasoning ("the user aimed at a labelled control") no longer
  // holds here. Disarms when the selection changes: an armed Close carried
  // to the NEXT panel would close a panel the user never armed.
  const [closeArmed, setCloseArmed] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  useEffect(() => { setCloseArmed(false); setActionsOpen(false) }, [model.id])
  const pid = model.fields.find((f) => f.key === 'pid')?.value
  const TABS: Array<{ id: ContextTab; label: string }> = [
    { id: 'detail', label: 'Detail' }, { id: 'work', label: 'Work' }, { id: 'tools', label: 'Tools' }
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
      <div className="context__tabs" role="tablist" aria-label="Context">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`context__tab${tab === t.id ? ' context__tab--on' : ''}`}
            data-context-tab={t.id}
            aria-selected={tab === t.id}
            {...shellControl(() => onSelectTab(t.id))}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="inspector__body context__body">
      <section className="context__panel" data-context-panel="detail" role="tabpanel" hidden={tab !== 'detail'}>
      {/* M183. THE NODE EDITOR: the selected block's fields from its kind's schema, committed through the draft store's one door. */}
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
          </section>
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
      {model.kind === 'terminal' ? <RunsSection panelId={model.id} active={tab === 'work'} /> : (
        <section className="inspector__section" data-work-section="runs">
          <h3 className="inspector__section-heading">Commands</h3>
          <p className="inspector__arm" data-work-arm="runs">{KIND_NOUN[model.kind]} runs nothing</p>
        </section>
      )}
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
            </>
          )}
        </section>
      )}
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
      {/* PINNED action bar, three ranks: primary (Restart), secondary
          (Rename, Save as preset, Link), destructive (Close, gated). Every
          verb stays VISIBLE and disabled-with-a-reason where it does not
          apply — a control that vanishes reads as a feature never built. */}
      <div className="inspector__actions context__actions">
        {/* M76. On a chat, Allow and Deny lead — the only two verbs whose delay
            costs something — enabled while a request is pending and disabled
            by name otherwise. Present only on the chat kind, the rule the
            front-end verb set. */}
        {model.kind === 'chat' && (['allow', 'deny'] as const).map((verb) => (
          <button
            key={verb}
            type="button"
            className="inspector__action"
            data-inspector-action={verb}
            disabled={model.approval === undefined}
            title={model.approval === undefined
              ? 'nothing is waiting for an answer'
              : `${verb === 'allow' ? 'Allow' : 'Deny'} ${model.approval.toolName} — ${model.approval.argument}`}
            {...shellControl(() => { if (model.approval !== undefined) onAnswer(model.id, model.approval.requestId, verb === 'allow') })}
          >
            {verb === 'allow' ? (model.approval === undefined ? 'Allow' : `Allow ${model.approval.toolName}`) : 'Deny'}
          </button>
        ))}
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
          className="inspector__action inspector__action--primary"
          data-inspector-action="restart"
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
        {/* M207. Layout/configuration verbs remain mounted (and therefore
            discoverable to checks and assistive technology) but no longer
            compete permanently with the selected kind's next action. */}
        <button type="button" className="inspector__action inspector__action--secondary" data-inspector-action="more"
          aria-expanded={actionsOpen} title={actionsOpen ? 'Hide panel actions' : 'Show layout, naming and linking actions'}
          {...shellControl(() => setActionsOpen((v) => !v))}>{actionsOpen ? 'Fewer actions' : 'More actions…'}</button>
        <div className="context__more-actions" data-inspector-more-actions hidden={!actionsOpen}>
        {/* M92. Three toggles, each reading the model's marks; the word says what the click DOES. */}
        <button type="button" className="inspector__action" data-inspector-action={model.marks?.locked ? 'unlock' : 'lock'}
          title={model.marks?.locked ? 'Unlock — drag and resize work again' : 'Lock — drag and resize refuse; close still works'}
          {...shellControl(() => (model.marks?.locked ? onUnlock : onLock)(model.id))}>{model.marks?.locked ? 'Unlock' : 'Lock'}</button>
        <button type="button" className="inspector__action" data-inspector-action={model.marks?.pinned ? 'unpin' : 'pin'}
          disabled={!model.marks?.pinned && pinRefusal(model.kind, false, pinnedCount ?? 0) !== undefined}
          title={model.marks?.pinned ? 'Unpin — tiering decides again' : (pinRefusal(model.kind, false, pinnedCount ?? 0) ?? 'Pin — kept live wherever the camera is, inside the live budget')}
          {...shellControl(() => (model.marks?.pinned ? onUnpin : onPin)(model.id))}>{model.marks?.pinned ? 'Unpin' : 'Pin'}</button>
        <button type="button" className="inspector__action" data-inspector-action={model.marks?.maximised ? 'restore' : 'maximise'}
          title={model.marks?.maximised ? 'Restore this panel to where it was' : 'Fill the window with this panel'}
          {...shellControl(() => (model.marks?.maximised ? onRestore : onMaximise)(model.id))}>{model.marks?.maximised ? 'Restore' : 'Fill'}</button>
        {/* M74. The front-end verb — present only on the two kinds that have
            a conversation, disabled by name when it cannot apply. */}
        {model.frontEnd !== undefined && (
          <button
            type="button"
            className="inspector__action"
            data-inspector-action="front-end"
            data-front-end={model.frontEnd.verb}
            disabled={!model.frontEnd.enabled}
            title={model.frontEnd.enabled
              ? (model.frontEnd.verb === 'open-as-chat' ? `Open ${model.heading} as a chat — the same session, rendered as a transcript` : `Open ${model.heading} in a terminal — claude --resume this session`)
              : (model.frontEnd.reason ?? '')}
            {...shellControl(() => onFrontEnd(model.id))}
          >
            {model.frontEnd.verb === 'open-as-chat' ? 'Open as chat' : 'Open in terminal'}
          </button>
        )}
        <button
          type="button"
          className="inspector__action inspector__action--secondary"
          data-inspector-action="rename"
          title={`Rename ${model.heading}`}
          {...shellControl(() => onRename(model.id, model.title ?? ''))}
        >
          Rename…
        </button>
        <button
          type="button"
          className="inspector__action inspector__action--secondary"
          data-inspector-action="save-preset"
          disabled={model.kind !== 'terminal'}
          title={model.kind === 'terminal'
            ? `Save ${model.heading} as a preset`
            : `${KIND_NOUN[model.kind]} is not a spawnable panel`}
          {...shellControl(() => onSavePreset(model.id))}
        >
          Save as preset
        </button>
        </div>
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
          data-inspector-action="link"
          title={`Link ${model.heading} to another panel`}
          {...shellControl(() => onLink(model.id))}
        >
          Link to…
        </button>
        <button
          type="button"
          className={`inspector__action inspector__action--destructive${closeArmed ? ' inspector__action--armed' : ''}`}
          data-inspector-action="close"
          {...(closeArmed ? { 'data-close-armed': '' } : {})}
          title={closeArmed ? `Click again to close ${model.heading}` : `Close ${model.heading} (click twice)`}
          {...shellControl(() => {
            if (closeArmed) { setCloseArmed(false); onClose(model.id) } else setCloseArmed(true)
          })}
        >
          {closeArmed ? 'close?' : 'Close'}
        </button>
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
/** M183. Words, not codes, for the node editor's labels; `w`/`h` are the minted panel's pixel geometry — the diagram's drag owns that, so they are not rendered (the agent verb keeps them). */
const NODE_FIELD_LABELS: Record<string, string> = { cwd: 'folder', title: 'title', command: 'command', args: 'arguments', presetId: 'preset', message: 'first message', width: 'workers', list: 'list file', prompt: 'prompt', target: 'target', line: 'verb line', url: 'address', method: 'method' }
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
  if (selected.includes('>')) {
    const [from, to] = selected.split('>') as [string, string]
    const edge = template.edges.find((e) => e.from === from && e.to === to)
    if (edge === undefined) return null
    return (
      <section className="inspector__section inspector__section--node" data-inspector-node="edge" data-inspector-node-edge={selected}>
        <h3 className="inspector__section-heading inspector__section-heading--node">Edge · {from} to {to}</h3>
        <div className="inspector__field" data-inspector-node-field-row="trigger">
          <label className="inspector__label" htmlFor={`edge-trigger-${templateId}`}>trigger</label>
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
  return (
    <section className="inspector__section inspector__section--node" data-inspector-node="block" data-inspector-node-key={node.key}>
      <h3 className="inspector__section-heading inspector__section-heading--node">{node.kind} · {'title' in node && typeof node.title === 'string' && node.title.trim() !== '' ? node.title : node.key}</h3>
      {fields.filter((f) => !HIDDEN_NODE_FIELDS.has(f.name)).map((f) => (
        <div className="inspector__field" key={f.name} data-inspector-node-field-row={f.name}>
          <label className="inspector__label" htmlFor={`node-${templateId}-${f.name}`}>{NODE_FIELD_LABELS[f.name] ?? f.name}</label>
          <input id={`node-${templateId}-${f.name}`} className={`inspector__input${f.name === 'cwd' || f.name === 'command' || f.name === 'args' || f.name === 'list' || f.name === 'target' ? ' inspector__value--mono' : ''}`}
            data-inspector-node-field={f.name} type={f.type === 'number' ? 'number' : 'text'}
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
          {reasons[f.name] !== undefined && <p className="inspector__arm inspector__reason" data-inspector-node-reason={f.name}>{reasons[f.name]}</p>}
        </div>
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
