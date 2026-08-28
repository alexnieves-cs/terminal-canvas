import { memo, type JSX } from 'react'
import { useAgentState } from '@renderer/session/agent-state-store'
import type { InspectorModel, InspectorSummary } from './inspector-fields'
import { agentStateLabel } from './inspector-fields'
import { shellControl } from './shell-control'

export interface InspectorProps {
  onToggle: () => void
  /** null when nothing is selected — the launch state, and every background click. */
  model: InspectorModel | null
  summary: InspectorSummary
  onRename: (id: string, currentTitle: string) => void
  onClose: (id: string) => void
}

/**
 * The right inspector: what the selected panel actually is, and what the
 * canvas holds when nothing is selected.
 *
 * memo'd, and both its data props are frozen by Canvas — `model` on
 * inspectorSignature, `summary` on its own three numbers. Canvas re-renders on
 * every mousemove over the canvas (setCursor) and on every frame of a drag
 * (setPanelRect); without both halves this pane would rebuild at 60Hz for
 * rect changes it displays nothing about, the same trap SideRail documents.
 *
 * The toggle stays mounted when the inspector is collapsed, for the same
 * reason the rail's does: it is the only way back without ⇧⌘\.
 */
function InspectorImpl({ onToggle, model, summary, onRename, onClose }: InspectorProps): JSX.Element {
  return (
    <aside className="shell__inspector" aria-label="Inspector">
      <button
        type="button"
        className="shell__inspector-toggle"
        title="Hide the inspector (⇧⌘\)"
        aria-label="Hide the inspector"
        {...shellControl(onToggle)}
      >
        ›
      </button>
      <div className="shell__region-title">Panel</div>
      {model === null
        ? <InspectorEmpty summary={summary} />
        : <InspectorPanel model={model} onRename={onRename} onClose={onClose} />}
    </aside>
  )
}

export const Inspector = memo(InspectorImpl)

/**
 * Nothing selected. Deliberately a summary rather than a blank pane or a
 * "select a panel" instruction: the counts are the one thing a user cannot get
 * by looking at the canvas once it is larger than the viewport, and M8d's
 * cross-workspace counts land here rather than needing a new surface.
 */
function InspectorEmpty({ summary }: { summary: InspectorSummary }): JSX.Element {
  return (
    <div className="inspector__body" data-inspector-summary>
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
  model, onRename, onClose
}: { model: InspectorModel; onRename: (id: string, title: string) => void; onClose: (id: string) => void }): JSX.Element {
  const state = useAgentState(model.id)
  return (
    <div className="inspector__body">
      <div className="inspector__heading" data-inspector-heading>{model.heading}</div>
      <div className="inspector__state">
        {/*
          The ATTRIBUTE, not only a class: a class is a styling decision a
          restyle may rename, while data-agent-state is this pane's stated
          answer to "what is that agent doing" — the same split check 54 draws
          for the panel itself and RailPanelRow draws for its dot.
        */}
        <span className="inspector__dot" data-agent-state={state ?? 'none'} aria-hidden="true" />
        <span className="inspector__state-label">{agentStateLabel(state)}</span>
        {model.reattached && (
          /*
            M6a carried PanelStatus.running.reattached with ZERO readers, and
            CLAUDE.md records the spec's "a reattached panel visibly says so"
            criterion as deliberately unmet by that milestone. This is the
            reader that meets it.
          */
          <span className="inspector__badge" data-inspector-badge="reattached">reattached</span>
        )}
      </div>
      <dl className="inspector__fields">
        {model.fields.map((field) => (
          <div className="inspector__field" key={field.key} data-inspector-field={field.key}>
            <dt className="inspector__label">{field.label}</dt>
            <dd className="inspector__value">{field.value}</dd>
          </div>
        ))}
      </dl>
      <div className="inspector__actions">
        <button
          type="button"
          className="inspector__action"
          data-inspector-action="rename"
          title={`Rename ${model.heading}`}
          {...shellControl(() => onRename(model.id, model.title ?? ''))}
        >
          Rename…
        </button>
        <button
          type="button"
          className="inspector__action"
          data-inspector-action="close"
          title={`Close ${model.heading}`}
          {...shellControl(() => onClose(model.id))}
        >
          Close panel
        </button>
      </div>
    </div>
  )
}
