import type { AgentState } from '@shared/types'
import type { Panel } from '@renderer/panels/panels'
import type { PanelStatus } from '@renderer/session/panel-session'

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
  /** The user's own name, if any. The rename control echoes it. */
  title?: string
  /** The COLLAPSED honest chain — the one answer the header and rail show. */
  heading: string
  fields: InspectorField[]
  reattached: boolean
  restartable: boolean
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
 * The collapsed chain — identical to railLabel's, deliberately. Two labels for
 * one panel that differ only in the common case is the defect railLabel's own
 * comment describes, and the inspector sits directly beside the rail on
 * screen, where a disagreement is not merely wrong but visibly wrong.
 */
function heading(panel: Panel, status: PanelStatus | undefined): string {
  return panel.title
    ?? (status?.kind === 'running' ? status.command : undefined)
    ?? panel.spec.command
    ?? 'login shell'
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
 * `restartable` is spawned-only — running, starting or exited. Exited is the
 * most natural target the verb has; a never-started panel already has its own
 * verb with its own affordance (M8b's start control, and the card that says
 * "click to start"), and offering a second one here would undo the separation
 * M8b's rule 1 draws between navigating and waking.
 */
export function buildInspectorModel(
  panel: Panel,
  status: PanelStatus | undefined
): InspectorModel {
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
    id: panel.rect.id,
    ...(panel.title !== undefined ? { title: panel.title } : {}),
    heading: heading(panel, status),
    fields,
    reattached: running?.reattached === true,
    restartable: status !== undefined && status.kind !== 'idle'
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
