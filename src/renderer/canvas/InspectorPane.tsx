import type { Dispatch, MouseEvent as ReactMouseEvent, RefObject, SetStateAction, JSX } from 'react'
import type { LinkAutomation } from '@shared/handoff'
import type { Panel } from '@renderer/panels/panels'
import { type PersistedTemplate, allTemplates } from '@shared/templates'
import type { Tone } from '@renderer/panels/panel-state'
import { pinCount } from '@renderer/canvas/lod'
import { revokeChatGrants } from '@renderer/chat/useChatSessions'
import type { BoardVerbs } from './useBoardVerbs'
import type { Connectors } from './useConnectors'
import { Inspector } from '../shell/Inspector'

import type { AutomationRow } from '@renderer/shell/Inspector'
import type { Connector } from '@shared/flowchart'
import type { CriteriaRow } from '@renderer/panels/session-facts'
import type { FlowchartIO } from './useFlowchartIO'
import type { FlowchartVerbs } from './useFlowchartVerbs'
import type { InspectorContextBand } from '@renderer/shell/inspector-context'
import type { InspectorModel } from '@renderer/shell/inspector-fields'
import type { PaletteActions } from '@renderer/palette/commands'
import type { RateLimitState } from '@shared/rate-limit'
import type { ReviewFieldModel } from '@renderer/shell/inspector-fields'
import type { ShellChrome } from '@renderer/shell/useShellChrome'
import type { ToolboxFieldModel } from '@renderer/shell/inspector-fields'
import type { UsageHistory } from '@renderer/shell/inspector-fields'
import type { UsageSeries } from '@renderer/shell/usage-series'
/**
 * M507 (E4, the Canvas.tsx split). The inspector column: the selected object's
 * model, its context band, the summary, the automation rows, the review and
 * toolbox models, and the flowchart and connector doors it edits through.
 * Moved VERBATIM; it is a plain function Canvas calls in the same place in the
 * shell, never a component, and every value it reads arrives in one context
 * object named as Canvas names it.
 */
export interface RenderInspectorContext {
  automationResult: Map<string, string>
  automationRows: AutomationRow[]
  boardVerbsRef: RefObject<BoardVerbs>
  branchLine: string | null
  chrome: ShellChrome
  connectors: Connectors
  flowchart: FlowchartVerbs
  flowchartIO: FlowchartIO
  frameItem: (itemId: string) => { kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }
  inspectorContextBand: InspectorContextBand | undefined
  inspectorModel: InspectorModel | null
  inspectorSummary: { rateLimit: RateLimitState; panels: number; running: number; waiting: number; tokens: number; cost: number | undefined; history?: UsageHistory | null; usageSeries?: UsageSeries | null; }
  onFrontEnd: (id: string) => void
  onHandOffPanel: (id: string) => void
  onInspectorResizeDown: (event: ReactMouseEvent) => void
  onPausePanel: (id: string) => void
  onRunAgain: (id: string) => void
  onSetLinkAutomation: (from: string, to: string, automation: LinkAutomation) => void
  onSetRestartOnExit: (from: string, to: string, enabled: boolean) => void
  paletteActions: PaletteActions
  paletteActionsRef: RefObject<PaletteActions | null>
  panelRun: { id: string; name: string; facts: string; outcome: string; tone: Tone; runAgain: { enabled: true; } | { enabled: false; reason: string; }; } | null
  panels: Panel[]
  repository: string | null
  reviewModel: ReviewFieldModel | null
  selectedConnectorDetail: { connector: Connector; fromName: string; toName: string; } | null
  selectedEdge: { canHandoff: boolean; canRestart: boolean; sourceIsChat: boolean; result: string | undefined; automation?: LinkAutomation | undefined; label?: string | undefined; from: string; to: string; source: string; target: string; } | null
  selectedIdRef: RefObject<string | null>
  setRelatedItemId: Dispatch<SetStateAction<string | null>>
  taskCriteria: { label: string; rows: CriteriaRow[]; } | null
  templateRows: PersistedTemplate[]
  testNode: (templateId: string, key?: string) => Promise<{ kind: "ran"; note?: string; } | { kind: "refused"; reason: string; }>
  toolboxModel: ToolboxFieldModel | null
}

export function renderInspector(ctx: RenderInspectorContext): JSX.Element {
  const {
    automationResult, automationRows, boardVerbsRef, branchLine, chrome, connectors, flowchart, flowchartIO, frameItem, inspectorContextBand, inspectorModel, inspectorSummary, onFrontEnd, onHandOffPanel, onInspectorResizeDown, onPausePanel, onRunAgain, onSetLinkAutomation, onSetRestartOnExit, paletteActions, paletteActionsRef, panelRun, panels, repository, reviewModel, selectedConnectorDetail, selectedEdge, selectedIdRef, setRelatedItemId, taskCriteria, templateRows, testNode, toolboxModel
  } = ctx
  return (
    <>
    <Inspector
      templateOf={(id) => allTemplates(templateRows).find((t) => t.id === id)}
      onTestNode={testNode}
      onToggle={chrome.toggleContext}
      tab={chrome.contextTab}
      onSelectTab={chrome.setContextTab}
      model={inspectorModel}
      summary={inspectorSummary}
      contextBand={inspectorContextBand}
      onShowRelated={(itemId) => { setRelatedItemId(itemId); const r = frameItem(itemId); if (r.kind === 'refused') paletteActionsRef.current?.say(r.reason) }}
      // M310. A step that exists is gone to (a panel) or opened (a link, by
      // main's own door); one that does not leads to where it is MADE — the
      // review for a review, checks or a PR, Start work for a conversation.
      onChainStep={(itemId, step) => {
        if (step.present && step.panelIds[0] !== undefined) { paletteActions.goToPanel(step.panelIds[0]); return }
        if (step.present && step.url !== undefined) { void window.canvas.links.open({ panelId: selectedIdRef.current ?? '', target: step.url }); return }
        if (step.step === 'conversation') { paletteActions.beginStartWork({ itemId }); return }
        if (step.step === 'review' || step.step === 'checks' || step.step === 'pr') {
          const r = boardVerbsRef.current.review?.(itemId)
          if (r !== undefined && r.kind === 'refused') paletteActionsRef.current?.say(r.reason)
        }
      }}
      onShowTask={(panelId) => { const r = boardVerbsRef.current.show?.(panelId); if (r !== undefined && (r.kind === 'refused' || r.partial === true)) paletteActionsRef.current?.say(r.kind === 'refused' ? r.reason : (r.note ?? '')) }}
      onRename={paletteActions.beginRenamePanel}
      onClose={paletteActions.closePanel}
      onSavePreset={paletteActions.savePanelAsPreset}
      onRestart={paletteActions.restartPanel}
      onLock={paletteActions.lockPanel} onUnlock={paletteActions.unlockPanel} onPin={paletteActions.pinPanel} onUnpin={paletteActions.unpinPanel} onMaximise={paletteActions.maximisePanel} onRestore={paletteActions.restorePanel} pinnedCount={pinCount(panels)}
      onFrontEnd={onFrontEnd}
      onReviewApproval={chrome.openAttentionAt}
      onRevokeGrants={revokeChatGrants}
      // M352. The Caps fields are a PERSON's door: raising a cap is theirs to do.
      onCap={(id, value) => paletteActions.capAgent(id, value, 'person')}
      onOpenReview={paletteActions.openReview}
      taskCriteria={taskCriteria}
      onPausePanel={onPausePanel}
      onHandOffPanel={onHandOffPanel}
      onLink={paletteActions.beginLink}
      onRemoveLink={paletteActions.removeLink}
      onRelabelLink={paletteActions.beginRelabelLink}
      selectedConnector={selectedConnectorDetail}
      onPatchConnector={(id, patch) => { const r = connectors.patch(id, patch); if (r.kind === 'refused') paletteActions.say(r.reason) }}
      onRemoveConnector={(id) => { connectors.remove(id) }}
      onStyleShape={(id, patch) => { const r = flowchart.setShapeStyle([id], patch); if (r.kind === 'refused') paletteActions.say(r.reason) }}
      onShapeChart={(id, act) => {
        const said = (r: { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }): void => { paletteActions.say(r.kind === 'ran' ? (r.note ?? 'done') : r.reason) }
        if (act === 'plan') said(paletteActions.planFromChart(id))
        else if (act === 'layout-down' || act === 'layout-right') said(flowchartIO.layout(act === 'layout-down' ? 'down' : 'right', [id]))
        else void flowchartIO.exportFlowchart(act === 'export-mermaid' ? 'mermaid' : 'svg').then(said)
      }}
      onSetRestartOnExit={onSetRestartOnExit}
      onSetLinkAutomation={onSetLinkAutomation}
      automationResults={automationResult}
      automations={automationRows}
      selectedEdge={selectedEdge}
      panelRun={panelRun}
      onRunAgain={onRunAgain}
      review={reviewModel}
      branchLine={branchLine}
      repository={repository}
      toolbox={toolboxModel}
      onOpenToolbox={paletteActions.openToolbox}
      onResizeHandleDown={onInspectorResizeDown}
      onGoToPanel={paletteActions.goToPanel}
    />
    </>
  )
}
