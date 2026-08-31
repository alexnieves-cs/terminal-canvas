import type { InspectorModel, ReviewFieldModel, ToolboxFieldModel } from './inspector-fields'

/**
 * The context pane's tabs, grouped by QUESTION rather than by feature.
 *
 * Detail answers "what is this panel", Work answers "what has it done and
 * what did it cost", Tools answers "what can it do". Three tabs absorb the
 * four sections the backlog has queued (#46 a run ledger, #47 an environment
 * report, #19 usage history, #51 discard, #26 the toolbox write half) with no
 * fourth needed — which keeps the set under the five-to-six ceiling above
 * which a tab strip stops being scannable at a glance.
 *
 * Tabs rather than an accordion, deliberately: these are equally-important
 * views the user switches BETWEEN, which is the job tabs do. An accordion
 * serves "control what is visible upfront", a different job, and it would
 * restore the interleaving of four unrelated rhythms in one scroll that this
 * milestone exists to remove.
 *
 * Pure — no DOM, no React, no native dependency, and its only import is a
 * type — so it rides the plain-node verify:rail bundle beside every other
 * view model since M8c rather than needing a suite of its own.
 */
export type TabId = 'detail' | 'work' | 'tools'

/**
 * The rendered order, and the ONE place it is written down. Every consumer
 * derives from this rather than restating it — the rule verify:palette 30 was
 * rewritten to follow after construction order stopped being the grouping: an
 * order written down twice is an order that drifts, and the copy nobody is
 * looking at is the one that goes stale.
 */
export const TAB_ORDER: readonly TabId[] = ['detail', 'work', 'tools']

const TAB_LABELS: Record<TabId, string> = {
  detail: 'Detail',
  work: 'Work',
  tools: 'Tools'
}

export interface TabDef {
  id: TabId
  label: string
  /**
   * True when this tab's sections would render nothing at all.
   *
   * The tab is still RETURNED — verify:palette 31's rule reaching a fourth
   * surface: a tab that disappears is indistinguishable from a feature that
   * was never built, and Work is empty for every panel that has not started,
   * which is every panel on a restored canvas. So an empty tab is MARKED and
   * the view mutes it; it is never dropped, and the strip never changes width
   * under a user who selected a panel.
   */
  empty: boolean
}

/**
 * `null` and `hidden` are different facts that agree on one thing.
 *
 * `null` is "nobody has asked yet" — the review invoke has not resolved, or
 * this panel has no directory for a toolbox read to have been aimed at.
 * `hidden` is "the engine answered, and the answer is that there is nothing
 * to show" — a panel outside a repository, an inventory with no entries. They
 * have different causes and different fixes, which is why the two producers
 * keep them apart (M9a's not-a-repo versus never-started, and M17's three
 * usage states say the same thing a third time).
 *
 * For a TAB they mean the same thing and only here: either way the tab draws
 * nothing, so either way it is empty. An implementation testing only for null
 * marks the tab non-empty and then renders a section that paints nothing —
 * a heading over a blank, which reads as broken rather than as honest.
 */
function hasContent(m: ReviewFieldModel | ToolboxFieldModel | null | undefined): boolean {
  return m !== null && m !== undefined && !m.hidden
}

/**
 * `review` and `toolbox` are OPTIONAL and defaulted to null, which is the
 * trade `buildInspectorModel` already makes four times over for `live`,
 * `panels`, `usage` and `agent`, and which `review-engine.ts` made for
 * `notARepo` before any of them: a required parameter would change what every
 * existing caller MEANS while looking like a widening.
 *
 * They have to be here at all because Work's Changes half and the whole of
 * Tools are separate PROPS of Inspector.tsx rather than fields of
 * InspectorModel. A builder holding only the model would have to infer Tools
 * from the panel's KIND, which is a confident wrong answer for the ordinary
 * case — a terminal panel with a cwd and a real toolbox behind it.
 */
export function buildTabs(
  model: InspectorModel,
  review: ReviewFieldModel | null = null,
  toolbox: ToolboxFieldModel | null = null
): TabDef[] {
  const empty: Record<TabId, boolean> = {
    // Identity is PINNED above the strip and is deliberately not counted here:
    // it is on screen whichever tab is active, so counting it would make
    // Detail permanently non-empty and the flag would stop meaning anything.
    detail: model.fields.length === 0 && model.links.length === 0,
    // `usage.hidden` rather than `usage.rows.length`: a pinned panel with no
    // answer yet is NOT empty — it has a note to render, and the first
    // seconds of every pinned panel are exactly that state.
    work: !hasContent(review) && model.usage.hidden,
    tools: !hasContent(toolbox)
  }
  return TAB_ORDER.map((id) => ({ id, label: TAB_LABELS[id], empty: empty[id] }))
}

/**
 * Which tab the pane opens on: the first in TAB_ORDER with anything in it.
 *
 * Opening onto an empty tab reads as a broken pane, and it is the ordinary
 * case rather than an edge one — Detail is the only tab with content for a
 * panel that has not started. The fallback is the floor for a model with
 * nothing anywhere: the pane must open on SOME tab, and a `find` that
 * answered undefined would leave it open on none.
 *
 * It reads TAB_ORDER[0] rather than the built array's own first element, and
 * that is not interchangeable: TAB_ORDER is a constant, so the floor holds
 * whatever buildTabs returns, where `tabs[0]` inherits buildTabs' length and
 * throws the moment that array is empty. Not hypothetical — it is exactly
 * what the "hide the empty ones" implementation produces for a model with
 * nothing anywhere, and a throw there ends the whole verify run rather than
 * failing one check, which is the trap CLAUDE.md records for that suite.
 */
export function defaultTab(
  model: InspectorModel,
  review: ReviewFieldModel | null = null,
  toolbox: ToolboxFieldModel | null = null
): TabId {
  const tabs = buildTabs(model, review, toolbox)
  return tabs.find((t) => !t.empty)?.id ?? TAB_ORDER[0]
}
