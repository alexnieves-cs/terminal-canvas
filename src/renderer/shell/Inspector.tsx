import { memo, type JSX } from 'react'
import { useAgentState } from '@renderer/session/agent-state-store'
import type { InspectorModel, InspectorSummary, ReviewFieldModel } from './inspector-fields'
import { agentStateLabel } from './inspector-fields'
import { shellControl } from './shell-control'

export interface InspectorProps {
  onToggle: () => void
  /** null when nothing is selected — the launch state, and every background click. */
  model: InspectorModel | null
  summary: InspectorSummary
  onRename: (id: string, currentTitle: string) => void
  onClose: (id: string) => void
  onSavePreset: (id: string) => void
  onRestart: (id: string) => void
  onOpenReview: (id: string) => void
  /**
   * null while nothing is selected or the review invoke has not resolved
   * yet — a distinct state from `hidden`, which is the engine's own answer
   * of "render nothing" for a panel outside a repository. Canvas freezes
   * this on reviewSignature(review) the same way it freezes `model` on
   * inspectorSignature: see this component's own doc comment below for why
   * an unfrozen prop here defeats the memo outright.
   */
  review: ReviewFieldModel | null
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
  onToggle, model, summary, onRename, onClose, onSavePreset, onRestart, onOpenReview, review
}: InspectorProps): JSX.Element {
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
        : <InspectorPanel
            model={model}
            review={review}
            onRename={onRename}
            onClose={onClose}
            onSavePreset={onSavePreset}
            onRestart={onRestart}
            onOpenReview={onOpenReview}
          />}
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
  model, review, onRename, onClose, onSavePreset, onRestart, onOpenReview
}: {
  model: InspectorModel
  review: ReviewFieldModel | null
  onRename: (id: string, title: string) => void
  onClose: (id: string) => void
  onSavePreset: (id: string) => void
  onRestart: (id: string) => void
  onOpenReview: (id: string) => void
}): JSX.Element {
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
        {/*
          FIRST, and DISABLED rather than absent when the panel never started:
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
          className="inspector__action"
          data-inspector-action="restart"
          disabled={model.kind === 'review' || !model.restartable}
          title={model.kind === 'review'
            ? 'A review node has no process to restart'
            : model.restartable
              ? `Restart ${model.heading} — ends the running process and starts it again`
              : `${model.heading} has not started yet`}
          {...shellControl(() => onRestart(model.id))}
        >
          Restart
        </button>
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
          data-inspector-action="save-preset"
          disabled={model.kind === 'review'}
          title={model.kind === 'review'
            ? 'A review node is not a spawnable panel'
            : `Save ${model.heading} as a preset`}
          {...shellControl(() => onSavePreset(model.id))}
        >
          Save as preset
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
      {review !== null && !review.hidden && (
        /*
          `hidden` (not-a-repo, or the invoke hasn't resolved yet) renders
          nothing at all rather than an empty section — see ReviewFieldModel's
          own doc comment in inspector-fields.ts: an empty-but-present section
          is a visible blank gap in a 260px pane, and a permanent placeholder
          on most panels (most cwds are not repositories) teaches the user to
          stop reading this part of the pane.
        */
        <section className="inspector__section">
          <h3 className="inspector__section-heading">Changes</h3>
          <p className="inspector__review-summary" data-review-summary>{review.summary}</p>
          {review.note !== undefined && (
            <p className="inspector__review-note" data-review-note>{review.note}</p>
          )}
          {/*
            Inside the section rather than beside Restart, so it sits with the
            thing it acts on — but the SECTION IS NOT THE GATE, and reading it
            as one is what shipped a dead button. `hidden` answers "is this
            panel in a repository", which is a different question from "is
            there anything to open": several of ReviewResult's visible arms
            are unopenable, and `never-started` is by far the commonest of
            them — a panel with no session has no baseline, so openReview
            correctly returns on the null and the button does nothing, ever.

            So it gates on `restartable` — the SAME field the palette's
            panel.review row gates on, and the same one Restart above gates
            on, deliberately not a second boolean. "Has this panel ever
            spawned" is one fact, and it is exactly the question both verbs
            ask. Disabled with a reason rather than hidden, the rule
            verify:palette 31 states for rows: a control that vanishes reads
            as a feature that was never built, and this one sits where a user
            has just been told there are changes.

            A review NODE never reaches here at all — Canvas leaves `review`
            null for one, so the section does not render (verify:panels 112).
          */}
          <button
            type="button"
            className="inspector__action"
            data-inspector-action="review"
            disabled={!model.restartable}
            title={model.restartable
              ? `Open a review node for ${model.heading}`
              : `${model.heading} has not started yet, so there is no baseline to review against`}
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
    </div>
  )
}
