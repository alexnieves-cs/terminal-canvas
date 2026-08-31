import { memo, type JSX } from 'react'
import { useAgentState } from '@renderer/session/agent-state-store'
import type { InspectorModel, InspectorSummary, ReviewFieldModel, ToolboxFieldModel } from './inspector-fields'
import { agentStateLabel } from './inspector-fields'
import { shellControl } from './shell-control'

export interface InspectorProps {
  onToggle: () => void
  /** True only where this width gives the context pane NO column of its own,
   *  so it floats over the canvas as a transient drawer. See NavigatorPane's
   *  identical prop: residency is a CSS fact read once in useShellChrome. */
  drawer: boolean
  /** null when nothing is selected — the launch state, and every background click. */
  model: InspectorModel | null
  summary: InspectorSummary
  onRename: (id: string, currentTitle: string) => void
  onClose: (id: string) => void
  onSavePreset: (id: string) => void
  onRestart: (id: string) => void
  onOpenReview: (id: string) => void
  onLink: (id: string) => void
  onRemoveLink: (from: string, to: string) => void
  onRelabelLink: (from: string, to: string, current: string) => void
  /**
   * null while nothing is selected or the review invoke has not resolved
   * yet — a distinct state from `hidden`, which is the engine's own answer
   * of "render nothing" for a panel outside a repository. Canvas freezes
   * this on reviewSignature(review) the same way it freezes `model` on
   * inspectorSignature: see this component's own doc comment below for why
   * an unfrozen prop here defeats the memo outright.
   */
  review: ReviewFieldModel | null
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
  onToggle, drawer, model, summary, onRename, onClose, onSavePreset, onRestart, onOpenReview,
  onLink, onRemoveLink, onRelabelLink, review, toolbox, onOpenToolbox
}: InspectorProps): JSX.Element {
  return (
    <aside
      /* See NavigatorPane's own note: `--drawer` is FLOATING, not merely
         open, and it is element-level so shouldYieldWheel's rule 1b can test
         it from the wheel event's target. */
      className={`shell__inspector${drawer ? ' shell__inspector--drawer' : ''}`}
      aria-label="Inspector"
    >
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
            toolbox={toolbox}
            onOpenToolbox={onOpenToolbox}
            onRename={onRename}
            onClose={onClose}
            onSavePreset={onSavePreset}
            onRestart={onRestart}
            onOpenReview={onOpenReview}
            onLink={onLink}
            onRemoveLink={onRemoveLink}
            onRelabelLink={onRelabelLink}
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
  model, review, toolbox, onOpenToolbox, onRename, onClose, onSavePreset, onRestart, onOpenReview,
  onLink, onRemoveLink, onRelabelLink
}: {
  model: InspectorModel
  review: ReviewFieldModel | null
  toolbox: ToolboxFieldModel | null
  onOpenToolbox: (id: string) => void
  onRename: (id: string, title: string) => void
  onClose: (id: string) => void
  onSavePreset: (id: string) => void
  onRestart: (id: string) => void
  onOpenReview: (id: string) => void
  onLink: (id: string) => void
  onRemoveLink: (from: string, to: string) => void
  onRelabelLink: (from: string, to: string, current: string) => void
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
                {/* Both controls go through shellControl, so neither takes DOM
                    focus off xterm — see CLAUDE.md's "A shell control never
                    takes DOM focus". */}
                <button
                  type="button"
                  className="inspector__link-action"
                  title="Label this link"
                  {...shellControl(() => onRelabelLink(from, to, link.label ?? ''))}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="inspector__link-action"
                  title="Remove this link"
                  {...shellControl(() => onRemoveLink(from, to))}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}
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
          disabled={model.kind !== 'terminal' || !model.restartable}
          title={model.kind === 'review'
            ? 'A review node has no process to restart'
            : model.kind === 'file'
              ? 'A file panel has no process to restart'
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
          disabled={model.kind !== 'terminal'}
          title={model.kind === 'review'
            ? 'A review node is not a spawnable panel'
            : model.kind === 'file'
              ? 'A file panel is not a spawnable panel'
              : `Save ${model.heading} as a preset`}
          {...shellControl(() => onSavePreset(model.id))}
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
          className="inspector__action"
          data-inspector-action="link"
          title={`Link ${model.heading} to another panel`}
          {...shellControl(() => onLink(model.id))}
        >
          Link to…
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
      {toolbox !== null && !toolbox.hidden && (
        /*
          Same hiding policy as Changes above, and the same reason: a section
          that renders an empty body on most panels most of the time teaches
          the user to stop reading this part of the pane. The IN-FLIGHT state
          is deliberately NOT hidden — it renders "reading…" — because an
          empty gap for the duration of every selection reads as broken.
        */
        <section className="inspector__section">
          <h3 className="inspector__section-heading">Toolbox</h3>
          <p className="inspector__review-summary" data-toolbox-summary>{toolbox.summary}</p>
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
          {/*
            Present and ENABLED whenever the section renders, because a
            toolbox needs only a DIRECTORY — unlike Open review beside it,
            which needs a baseline and so is disabled for a panel that never
            spawned. A row that vanished would read as a feature that was
            never built (verify:palette 31's rule).
          */}
          <button
            type="button"
            className="inspector__action"
            data-toolbox-open
            {...shellControl(() => { onOpenToolbox(model.id) })}
          >
            Open toolbox
          </button>
        </section>
      )}
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
      {!model.usage.hidden && (
        /*
          `hidden` is a panel whose preset declared no agent — a login shell,
          most panels — and it renders NOTHING, the same "$0.00 beside a
          working agent is a confident wrong answer" rule the Changes section
          above states for not-a-repo. Everything else (pinned) always
          renders the section, even with nothing to show yet, the same
          `clean` rule: a heading with an empty body would read as broken for
          the first seconds of every pinned panel's life.
        */
        <section className="inspector__section" data-usage-section>
          <h3 className="inspector__section-heading">Cost</h3>
          {model.usage.note !== undefined && (
            <p className="inspector__usage-note" data-usage-note>{model.usage.note}</p>
          )}
          {model.usage.rows.length > 0 && (
            <>
              {/*
                FOUR figures, never one sum: "the inspector shows the links,
                not the answer" applied to a third pair. A single total is
                unanswerable when the user asks why it is large, and cache
                reads are usually most of it.
              */}
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
                {model.usage.turns} turns
                {model.usage.subagentTurns > 0 ? `, ${model.usage.subagentTurns} by subagents` : ''}
              </p>
              {model.usage.cost !== undefined && (
                // `title` carries the disclaimer (never a bare figure — a Max
                // or Pro subscriber is charged nothing per token) AND a
                // visible suffix repeats it, so the caveat survives without a
                // hover.
                <p className="inspector__usage-cost" data-usage-cost title={model.usage.costLabel}>
                  ${model.usage.cost.toFixed(2)}{' '}
                  <span className="inspector__usage-cost-suffix">list price</span>
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
