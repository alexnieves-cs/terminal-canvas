import type { AgentState } from '@shared/types'
import type { ReviewResult } from '@shared/review'
import { isFilePanel, isJiraPanel, isReviewPanel, linksOf, type Panel } from '@renderer/panels/panels'
import type { PanelStatus } from '@renderer/session/panel-session'
import type { LiveSession } from '@renderer/session/live-session-store'
import { railLabel } from './rail-rows'

/**
 * What the inspector renders, as plain data.
 *
 * Pure by construction — no React, no DOM, no registry reference — for the
 * same reason rail-rows.ts is, and it joins the same suite. The two pieces
 * most able to be subtly wrong live here: the link-by-link chain (whose whole
 * point is that it does NOT collapse) and the 60Hz signature.
 */

export interface InspectorField {
  /** Stable key. Also `data-inspector-field`, which is how a check finds it. */
  key: string
  label: string
  value: string
}

export interface InspectorModel {
  id: string
  /**
   * Which kind of panel this model describes. `'review'` is what gates
   * Inspector.tsx's Restart and Save-as-preset controls — an optional
   * `restartable`/reattached-only check would let a half-finished wiring
   * compile with those controls silently always-enabled.
   */
  kind: Panel['kind']
  /** The user's own name, if any. The rename control echoes it. */
  title?: string
  /** The COLLAPSED honest chain — the one answer the header and rail show. */
  heading: string
  fields: InspectorField[]
  reattached: boolean
  restartable: boolean
  /**
   * Every link touching this panel, in both directions. M13.
   *
   * REQUIRED rather than optional, the rule `restartable` already states: an
   * optional field lets a half-finished wiring compile with the section
   * silently always-empty, and tsc says nothing at all about it. A panel with
   * no links carries an empty array.
   *
   * It is part of the model, so inspectorSignature — which is JSON.stringify
   * over the whole model — covers it without an edit. That is not incidental:
   * Canvas freezes the model on that signature, so a link change the signature
   * missed would render once and then never update again. verify:rail 75.
   */
  links: InspectorLinkRow[]
}

export interface InspectorLinkRow {
  /** The panel at the OTHER end, whichever direction this link runs. */
  to: string
  /** 'out' is this panel -> other; 'in' is other -> this panel. */
  direction: 'out' | 'in'
  label?: string
  /** The other panel's name, by the honest chain. Never its bare id. */
  title: string
}

export interface InspectorSummary {
  panels: number
  running: number
  waiting: number
}

/** Rendered when the spec asked for nothing and main has not answered yet. */
const NO_SPEC_COMMAND = 'none — the login shell'

const AGENT_LABELS: Record<AgentState, string> = {
  starting: 'starting',
  busy: 'working',
  idle: 'idle',
  'wants-you': 'wants you',
  exited: 'exited'
}

/**
 * Undefined is an ordinary input, not an error: it is every panel that has
 * never spawned, which on a restored canvas is most of them. A bare index into
 * AGENT_LABELS would render "undefined" and a bare `.toUpperCase()` would
 * throw, both for the commonest case this function sees.
 */
export function agentStateLabel(state: AgentState | undefined): string {
  return state === undefined ? 'no signal' : AGENT_LABELS[state]
}

/**
 * The ONE definition of "this panel is running a process", shared by the
 * inspector's summary and Canvas.tsx's canvas:counts provider.
 *
 * `starting` counts. A panel whose pty:create has not resolved yet is
 * emphatically a process the user started, and main's reset confirm names this
 * number to the user before destroying it. Before M8c the predicate was
 * written inline in the counts provider only; the inspector reusing it rather
 * than writing a second one is the same rule "One map, and a typed view over
 * it" states for settings — two derivations agree the day they are written and
 * drift the first time one is wrong, and here the drift window is exactly the
 * moment a spawn is in flight, which no check would ever happen to sample.
 */
export function isRunning(status: PanelStatus | undefined): boolean {
  return status?.kind === 'running' || status?.kind === 'starting'
}

/**
 * Can this panel be restarted? Every SPAWNED state — running, starting,
 * exited, and errored — and nothing else.
 *
 * Exported rather than inlined into buildInspectorModel because the palette's
 * Restart row needs the SAME answer: two copies of "can this be restarted"
 * would let the inspector offer the verb while the palette refused it for the
 * same panel, both on screen at the same time. That is the drift isRunning's
 * own comment describes, and here it would be visibly wrong rather than merely
 * wrong.
 *
 * `exited` is deliberately included — "run that again" is most of why the verb
 * exists — and so is `error`: a spawn that failed is the second most natural
 * target there is, and an implementation written to the phrase "running,
 * starting or exited" would exclude it while looking entirely correct. The
 * expression is written as "not idle, not absent" rather than as a list of
 * four kinds for exactly that reason: the two never-started cases are the
 * short half, and they are the half that has a rule behind it. `idle` and
 * `undefined` already have their own verb with its own affordance (M8b's
 * start control, and the card that says "click to start"); a second one here
 * would undo the separation M8b's rule 1 draws between navigating and waking.
 */
export function isRestartable(status: PanelStatus | undefined): boolean {
  return status !== undefined && status.kind !== 'idle'
}

/**
 * The read half.
 *
 * Every link of the chain gets its OWN field rather than the collapsed answer,
 * and that is this pane's stated reason to exist: "why does this say login
 * shell" is answerable only if the user can see both that the spec asked for
 * nothing and that main resolved /bin/zsh. Merging them into one `command`
 * row would look tidier, render the same string in the common case, and delete
 * the feature.
 *
 * `restartable` is isRestartable's answer, not a second copy of it — see that
 * function for why the gate is shared with the palette rather than written
 * twice.
 */
/**
 * Every link touching this panel, in both directions.
 *
 * BOTH directions, because a pane listing only outgoing links answers "what
 * does this feed" and leaves "what feeds this" answerable only by selecting
 * every other panel in turn. The direction is a FIELD rather than baked into
 * the title, so the view composes the arrow — the rule Command.waiting and
 * RailRow.waiting already keep, for the reason verify:palette 64 records: a
 * count or a glyph spliced into text reaches the fuzzy haystack and starts
 * matching queries it has no business matching.
 *
 * A link whose other end is not in `panels` contributes NO row, which is
 * buildLinkSegments' prune at the pane and is reachable the same two ways: a
 * hand-edited file, and a link naming a panel in another workspace, since
 * PanelId is global. A row for a panel the user cannot select is a dead entry.
 *
 * The name comes from railLabel — the same honest chain the panel header, the
 * rail row and the attention section walk — so this is a fourth READER of it
 * and never a fourth re-derivation. verify:rail 73, whose fixture is titled
 * for exactly that reason.
 *
 * O(n) over the panel list for the incoming half, which is the stated cost of
 * adjacency-on-source: answering "what points at me" is a scan rather than a
 * lookup. On a canvas LIVE_BUDGET already caps interaction with at eight live
 * panels, that is not worth an index.
 */
export function buildLinkRows(panel: Panel, panels: Panel[]): InspectorLinkRow[] {
  const byId = new Map(panels.map((p) => [p.rect.id, p]))
  const id = panel.rect.id
  const rows: InspectorLinkRow[] = []
  const push = (
    other: Panel | undefined,
    to: string,
    direction: 'out' | 'in',
    label: string | undefined
  ): void => {
    if (!other) return
    rows.push({
      to,
      direction,
      ...(label === undefined ? {} : { label }),
      title: railLabel(other, undefined)
    })
  }
  for (const link of linksOf(panel)) push(byId.get(link.to), link.to, 'out', link.label)
  for (const source of panels) {
    if (source.rect.id === id) continue
    for (const link of linksOf(source)) {
      if (link.to === id) push(source, source.rect.id, 'in', link.label)
    }
  }
  return rows
}

export function buildInspectorModel(
  panel: Panel,
  status: PanelStatus | undefined,
  /**
   * Where the panel IS, when anything knows. OPTIONAL and defaulted to
   * undefined, so every pre-M12 caller and every pre-M12 check keeps its exact
   * meaning — the trade review-engine.ts's `notARepo` dep already made, and for
   * the same reason: a required dep would change what a dozen existing checks
   * assert while looking like a widening.
   */
  live?: LiveSession | undefined,
  /**
   * Every panel on this canvas, so the link rows can name the other end and
   * drop a link whose other end is not here.
   *
   * OPTIONAL and defaulted to an empty list, so every pre-M13 caller and every
   * pre-M13 check keeps its exact meaning — the same trade `live` made in M12
   * and review-engine.ts's `notARepo` made in M9a. A required parameter would
   * change what a dozen existing checks assert while looking like a widening.
   */
  panels?: Panel[]
): InspectorModel {
  const links = buildLinkRows(panel, panels ?? [])
  if (isReviewPanel(panel)) {
    return {
      kind: 'review',
      id: panel.rect.id,
      heading: railLabel(panel, undefined),
      ...(panel.title !== undefined ? { title: panel.title } : {}),
      // A node has no process, so neither verb applies. FALSE rather than
      // absent, for the reason PanelRow.restartable is required: an optional
      // flag lets a half-finished wiring compile with the control silently
      // always-enabled, and tsc says nothing at all about it.
      restartable: false,
      reattached: false,
      links,
      fields: [
        { key: 'reviews', label: 'reviews', value: panel.subject.label },
        { key: 'subject', label: 'panel', value: panel.subject.subjectId },
        { key: 'repo', label: 'repo', value: panel.subject.repoRoot },
        // Short, because the pane is 260px and nobody reads forty hex
        // characters — but PRESENT, because it is the one field that says
        // which moment this node is measuring from.
        { key: 'baseline', label: 'since', value: panel.subject.baselineSha.slice(0, 8) }
      ]
    }
  }
  if (isFilePanel(panel)) {
    const path = panel.source.path
    const cut = path.lastIndexOf('/')
    return {
      kind: 'file',
      id: panel.rect.id,
      heading: railLabel(panel, undefined),
      ...(panel.title !== undefined ? { title: panel.title } : {}),
      // FALSE rather than absent, the reason the review arm gives: an optional
      // flag lets a half-finished wiring compile with the control silently
      // always-enabled, and tsc says nothing about it.
      restartable: false,
      reattached: false,
      links,
      fields: [
        { key: 'file', label: 'file', value: cut < 0 ? path : path.slice(cut + 1) },
        // The directory is its OWN field rather than folded into the one
        // above, which is the pane's whole stated job: show the links, not a
        // merged answer. The rail row shows the basename and nothing else, so
        // this is the one surface where the full path is legible.
        { key: 'directory', label: 'in', value: cut <= 0 ? '/' : path.slice(0, cut) }
      ]
    }
  }
  if (isJiraPanel(panel)) return { kind: 'file', id: panel.rect.id, heading: railLabel(panel, undefined), ...(panel.title === undefined ? {} : { title: panel.title }), restartable: false, reattached: false, links, fields: [{ key: 'jira', label: 'source', value: 'assigned Jira tickets' }] }
  const running = status?.kind === 'running' ? status : undefined
  const fields: InspectorField[] = [
    { key: 'command', label: 'command', value: running?.command ?? 'not started' },
    { key: 'spec-command', label: 'asked for', value: panel.spec.command ?? NO_SPEC_COMMAND },
    { key: 'cwd', label: 'cwd', value: running?.cwd ?? panel.spec.cwd },
    // String(), not a template with a fallback: pid is a number and 0 is not a
    // real pid, so there is no zero-trap here — but the exit field below has
    // one, and writing both the same way keeps the difference from reading as
    // an accident.
    { key: 'pid', label: 'pid', value: running === undefined ? '—' : String(running.pid) }
  ]
  // BESIDE, never instead of. See this function's own doc comment: the pane
  // renders the links rather than the answer, and a panel that has cd'd is
  // exactly the case where both halves are the point. Gated on isRunning, not
  // on `live !== undefined` alone: nothing clears the live store when a
  // process exits (see clearLiveSession's own call sites — every one of them
  // is a DISPOSE, not an exit), so an unguarded push renders "running: sh"
  // beside "status: exited 0" for the rest of that panel's life — the
  // milestone's own thesis, a present-tense label showing a stale value, failing
  // through the one path nobody looked at. A spawn cwd under a live label is
  // still indistinguishable from a correct one, so this is also why the field
  // is absent rather than merely stale-looking when there is no live answer at
  // all (the direct backend, or a process that has not been polled yet).
  //
  // Each half is ALSO skipped individually when empty: verify:tmux 28 exists
  // because parseListOutput tolerates a five-column line with
  // currentCommand: '' — a tmux server started by an older build, ignoring a
  // new client's format string. Pushing that through renders a labelled row
  // with nothing in it, on exactly the machine-mid-upgrade case the tolerance
  // was written to survive.
  if (live !== undefined && isRunning(status)) {
    if (live.cwd !== '') fields.push({ key: 'live-cwd', label: 'now in', value: live.cwd })
    if (live.currentCommand !== '') {
      fields.push({ key: 'live-command', label: 'running', value: live.currentCommand })
    }
  }
  if (status?.kind === 'exited') {
    // A TEMPLATE, never `code || …`: 0 is the commonest exit there is and the
    // falsy branch would print the wrong tail for exactly it. Same trap
    // railTail documents.
    fields.push({ key: 'exit', label: 'exit', value: `exited ${status.code}` })
  }
  if (status?.kind === 'error') {
    fields.push({ key: 'error', label: 'error', value: status.message })
  }
  return {
    kind: 'terminal',
    id: panel.rect.id,
    ...(panel.title !== undefined ? { title: panel.title } : {}),
    heading: railLabel(panel, status),
    links,
    fields,
    reattached: running?.reattached === true,
    restartable: isRestartable(status)
  }
}

/**
 * The empty state: what the canvas holds when nothing is selected.
 *
 * `waitingIds` is filtered against the panels rather than counted, and that is
 * not defensiveness. Agent state SURVIVES a panel's closure — main sends the
 * transition and the renderer's store keeps it until something clears it — so
 * the attention set can legitimately name an id no panel answers to, the same
 * orphan reachableQueue drops at the head of the jump queue. Counting it says
 * "1 waiting" on a canvas with nothing to go to, and the user hunts for a
 * panel that does not exist.
 */
export function buildInspectorSummary(
  panels: readonly Panel[],
  statusOf: (id: string) => PanelStatus | undefined,
  waitingIds: readonly string[]
): InspectorSummary {
  const ids = new Set(panels.map((p) => p.rect.id))
  return {
    panels: panels.length,
    running: panels.filter((p) => isRunning(statusOf(p.rect.id))).length,
    waiting: waitingIds.filter((id) => ids.has(id)).length
  }
}

/**
 * The same defence railSignature provides, for the same reason and by the same
 * means. `panels` is a fresh array on every setPanelRect — every frame of a
 * drag — and the selected panel comes straight out of it, so without this the
 * inspector would rebuild and re-render sixty times a second for rect changes
 * it renders nothing about.
 *
 * JSON.stringify over the MODEL rather than a hand-rolled concatenation, for
 * both of railSignature's reasons: over the model, so "the signature covers
 * exactly what the pane renders" is structurally true rather than dependent on
 * someone remembering to add a field; and JSON rather than `a + '|' + b`,
 * because a title and a cwd are user text and an ordinary separator could be
 * forged inside one, freezing the pane on stale fields for the users whose
 * titles happen to contain that character and nobody else.
 *
 * Agent state is deliberately absent from the model and therefore from this
 * signature: the pane subscribes useAgentState(id) itself, the same split
 * RailPanelRow makes.
 */
export function inspectorSignature(model: InspectorModel | null): string {
  return JSON.stringify(model)
}

/** Ten, because the pane is 260px wide and this section is not a scroll host. */
export const REVIEW_FILE_CAP = 10

export interface ReviewFieldRow {
  path: string
  added: number
  removed: number
  binary: boolean
  untracked: boolean
}

export interface ReviewFieldModel {
  /** True when the section renders nothing at all. */
  hidden: boolean
  summary: string
  /** The honest arms' explanation. Absent when there is nothing to explain. */
  note?: string
  files: ReviewFieldRow[]
  /** Files beyond the cap. Zero when everything fits. */
  more: number
}

/**
 * The single hidden-state instance, returned by reference for BOTH `undefined`
 * and `not-a-repo` (see buildReviewFields below). Frozen, and its `files`
 * array frozen separately, because a shared instance is an aliasing hazard
 * the moment a caller treats the returned model as its own to mutate — Task 9
 * is the very next task and the one that actually renders this model, so a
 * consumer reaching in to tack on, say, a per-instance UI flag would corrupt
 * every OTHER call site's "hidden" result silently, since they are all the
 * same object. Freezing preserves the identity-sharing this instance exists
 * for (a consumer CAN compare by reference) while making that mutation throw
 * in strict mode instead of leaking across calls.
 */
// `as ReviewFieldRow[]`/`as ReviewFieldModel` rather than typing HIDDEN's
// fields as readonly: ReviewFieldModel is the PUBLIC shape every branch below
// returns, and widening it to `readonly ReviewFieldRow[]` for this one shared
// instance would force every fresh-object branch to satisfy a readonly type
// too, for no reason of its own. Object.freeze still enforces the real
// immutability at runtime regardless of what the static type says.
const HIDDEN: ReviewFieldModel = Object.freeze({
  hidden: true,
  summary: '',
  files: Object.freeze([] as ReviewFieldRow[]) as ReviewFieldRow[],
  more: 0
}) as ReviewFieldModel

/**
 * The Changes section, as plain data.
 *
 * `undefined` is an ordinary input, not an error: every selection change
 * passes through it while the invoke is in flight, and so does every panel
 * before the first query. `not-a-repo` is hidden for a sharper reason — it is
 * the answer for a panel in the home directory, i.e. most panels, and a
 * permanent error row on most panels teaches the user to stop reading the
 * section.
 *
 * `clean` is deliberately NOT hidden. A panel that genuinely changed nothing
 * and a panel the feature is broken for must not look the same.
 */
export function buildReviewFields(result: ReviewResult | undefined): ReviewFieldModel {
  if (result === undefined || result.kind === 'not-a-repo') return HIDDEN

  if (result.kind === 'never-started') {
    return { hidden: false, summary: 'not started', note: 'this panel has no session yet', files: [], more: 0 }
  }
  if (result.kind === 'git-missing') {
    return { hidden: false, summary: 'unavailable', note: 'no git binary was found', files: [], more: 0 }
  }
  if (result.kind === 'repo-unreadable') {
    // The detail is git's own words, and it is the whole value of this arm:
    // "unavailable" alone is what M9a rendered for git-missing, and a user
    // who has git installed would have no idea why this panel says it.
    return {
      hidden: false,
      summary: 'unavailable',
      note: `git could not open this repository — ${result.detail}`,
      files: [],
      more: 0
    }
  }
  if (result.kind === 'baseline-lost') {
    // A DIFFERENT note from never-started: two situations, two fixes. Telling
    // a user whose agent has run for an hour that it "has not started" sends
    // them to the wrong control.
    //
    // NOT "the baseline commit is gone" — that was this arm's ORIGINAL,
    // narrower meaning, and the text below is deliberately wider than it.
    // review-engine.ts now reports baseline-lost for a failed `ls-files` too
    // (see its comment on the untracked-files read), so this arm now means
    // "this repository cannot be read against its baseline" — its realistic
    // cause is the repository becoming unreadable or vanishing mid-review,
    // not only the baseline commit itself disappearing. Naming the baseline
    // as the sole cause would misdescribe the untracked-files failure case.
    return {
      hidden: false,
      summary: 'unattributable',
      note: 'this repository could not be read against its baseline — restart the panel to start a new one',
      files: [],
      more: 0
    }
  }
  if (result.kind === 'clean') {
    return { hidden: false, summary: 'no changes', files: [], more: 0 }
  }

  const rows = result.files.slice(0, REVIEW_FILE_CAP).map((f) => ({
    path: f.path,
    added: f.added,
    removed: f.removed,
    binary: f.binary,
    untracked: f.untracked
  }))
  const more = Math.max(0, result.files.length - REVIEW_FILE_CAP)

  if (result.kind === 'shared') {
    return {
      hidden: false,
      summary: `${plural(result.files.length, 'file')} changed`,
      note: `${result.panelCount} panels share this repo — changes can't be attributed`,
      files: rows,
      more
    }
  }

  return {
    hidden: false,
    summary: `${plural(result.files.length, 'file')} changed · +${result.added} −${result.removed}`,
    files: rows,
    more
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * The same 60Hz defence inspectorSignature gives the pane's other half, kept
 * as its OWN function rather than a second parameter on that one: the review
 * result arrives asynchronously and changes on a different clock from the
 * panel model, and widening the existing signature would mean revisiting
 * verify:rail 26/27, whose subject is a different fact.
 */
export function reviewSignature(model: ReviewFieldModel | null): string {
  return JSON.stringify(model)
}
