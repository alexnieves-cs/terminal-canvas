import type { PersistedTemplate, TemplateNode, TerminalOrChatNode } from '@shared/templates'
import type { PersistedRun } from '@shared/runs'
import type { WatchTrigger } from '@shared/watch-trigger'
import { TRIGGER_WORDS } from '@renderer/canvas/trigger-words'
import type { HandoffTrigger } from '@shared/handoff'

/**
 * M133. The block diagram is a PROJECTION of the template record. It computes
 * geometry and returns it; it stores nothing and owns no camera. React Flow
 * consumes this projection in the workflow view, while the template remains
 * the truth for authored positions and edges.
 *
 * `dagre` stays declined for the same reason from the other side: template
 * nodes carry AUTHORED `dx`/`dy` (M80), so there is nothing to lay out. If
 * that ever changes, spec §11 records dagre as the candidate — pure, no DOM,
 * so it would fit the plain-node verify tier this module already sits in.
 *
 * Pure: no DOM, no React, no node. Bundled into `verify:layout`
 * (`workflow.panel.1a-d`) beside the schema it projects.
 */

export interface DiagramBlock {
  key: string
  label: string
  /** `POOL - 6 AT A TIME`, `SCRIPT - BASH`, `JUDGES EVERY RESULT`. */
  sublabel: string
  x: number
  y: number
  w: number
  h: number
}

export interface DiagramEdge {
  from: string
  to: string
  /** The edge's own word, from `trigger-words.ts` — the one vocabulary the canvas labels edges with. */
  trigger: string
}

export interface Diagram {
  blocks: DiagramBlock[]
  edges: DiagramEdge[]
  width: number
  height: number
}

export const BLOCK_W = 168
export const BLOCK_H = 64
/** Breathing room around the authored extent, so a block's stroke is never clipped by the viewBox. */
export const DIAGRAM_PAD = 28

/**
 * A hyphen, never `›`: `verify:styles icons.1` bans an entity or symbol glyph
 * in renderer text, and a sublabel is renderer text like any other.
 */
function sublabelOf(node: TemplateNode): string {
  switch (node.kind) {
    // M191 (the golden audit, second half, finding 2). SENTENCE CASE, not
    // upper case: the brief asks for "names and sentence-case metadata", and
    // `POOL - 6 AT A TIME` reads as a code even set in the UI face. The KIND
    // still comes first (M133's critic), and the strings stay short for the
    // same reason as before — an SVG text node neither wraps nor clips.
    case 'pool': return `Pool · ${node.width} at a time`
    // M133 critic wave. EVERY sublabel names the KIND first: `POOL` and
    // `SCRIPT` did and these two did not, so two of the four blocks stated a
    // behaviour with no vocabulary word behind it and the reader could not
    // tell which of M132's kinds they were looking at.
    // Short enough to fit `BLOCK_W`: the sublabel is drawn as SVG text and
    // an SVG text node does not wrap or clip, so a long one simply runs out
    // over the block's own edge — which is what the first pass showed.
    case 'orchestrator': return 'Orchestrator · leads'
    case 'collect': return 'Collect · joins results'
    case 'chat': return 'Chat'
    case 'action': return `Action · ${(node.line ?? '').split(' ')[0] || 'a verb'}`
    case 'http': return 'Fetch · a GET'
    default: {
      // A terminal node: its preset, else the binary it runs, else the login
      // shell — the same three-way answer the spawn sheet's preview gives,
      // and never `—`, which reads as a node that failed to load.
      const t = node as TerminalOrChatNode
      if (t.presetId !== undefined) return `Script · ${t.presetId}`
      const command = (t.command ?? '').trim()
      if (command === '') return 'Script · login shell'
      const tail = command.split('/').filter((p) => p !== '').slice(-1)[0] ?? command
      return `Script · ${tail}`
    }
  }
}

/**
 * The record's nodes, IN RECORD ORDER, at their authored offsets normalised
 * so the leftmost/topmost block sits at the pad. Order is load-bearing:
 * `workflow.panel.1a` compares the block keys against the template's node
 * keys position for position, which is what makes this a projection rather
 * than a second layout that happens to agree today.
 */
export function buildDiagram(template: PersistedTemplate): Diagram {
  const nodes = template.nodes
  const minX = nodes.length === 0 ? 0 : Math.min(...nodes.map((n) => n.dx))
  const minY = nodes.length === 0 ? 0 : Math.min(...nodes.map((n) => n.dy))
  const blocks: DiagramBlock[] = nodes.map((node) => ({
    key: node.key,
    // M182. A node's own title when the editor gave it one; the key otherwise.
    label: 'title' in node && typeof node.title === 'string' && node.title.trim() !== '' ? node.title : node.key,
    sublabel: sublabelOf(node),
    x: DIAGRAM_PAD + (node.dx - minX),
    y: DIAGRAM_PAD + (node.dy - minY),
    w: BLOCK_W,
    h: BLOCK_H
  }))
  // Only edges whose BOTH ends survive as blocks are drawn. The parser
  // already drops an edge naming a missing node, so this is the second
  // layer of the same rule rather than a new one — and a line drawn to
  // nowhere is the failure that would otherwise be silent.
  const keys = new Set(blocks.map((b) => b.key))
  const edges: DiagramEdge[] = template.edges
    .filter((e) => keys.has(e.from) && keys.has(e.to))
    .map((e) => ({ from: e.from, to: e.to, trigger: e.trigger }))
  const width = blocks.length === 0 ? BLOCK_W + DIAGRAM_PAD * 2 : Math.max(...blocks.map((b) => b.x + b.w)) + DIAGRAM_PAD
  const height = blocks.length === 0 ? BLOCK_H + DIAGRAM_PAD * 2 : Math.max(...blocks.map((b) => b.y + b.h)) + DIAGRAM_PAD
  return { blocks, edges, width, height }
}

/** The edge's label, in the canvas's own words — never a second phrasing of a trigger. */
export function edgeWord(edge: DiagramEdge): string {
  return TRIGGER_WORDS[edge.trigger as HandoffTrigger] ?? edge.trigger
}

/**
 * M79's records, filtered to this template. The data has existed since M79
 * and needs no store of its own; what M133 adds is the `templateId` mark the
 * recorder writes when a run's panels were minted by an instantiation.
 *
 * A run with NO mark is not this template's: every pre-M133 run, and every
 * run of panels the user built by hand, is absent from this list rather than
 * guessed into it.
 */
export function runsForTemplate(runs: readonly PersistedRun[], templateId: string): PersistedRun[] {
  return runs.filter((r) => r.templateId === templateId)
}

/**
 * A workflow trigger is a WATCHER — `shared/watch-trigger.ts` unchanged, and
 * main's existing arming — carrying the template it instantiates. Not a
 * second scheduler: M101's routine runner already recorded why one is a
 * mistake, and a second one here would arm the same four triggers twice.
 *
 * The command is `/usr/bin/true` because main's runner runs a command per
 * fire and the WORK is the instantiation, which is the renderer's (only the
 * renderer can mint panels). The fire is what this watcher exists to
 * produce; the exit is deliberately the trivial success.
 *
 * KNOWN COST, and it is deliberate rather than overlooked. Main is not
 * changed by M133, so main goes on treating this watcher as any other:
 *
 *  1. every fire SPAWNS `/usr/bin/true` — a real process, doing nothing;
 *  2. every fire appends a run ledger row naming `/usr/bin/true`, so the
 *     ledger reads as a command nobody typed rather than as a workflow.
 *
 * Both are main's, and closing either means teaching `watch-runner.ts` about
 * templates — a second place that knows what a workflow is. Every RENDERER
 * readout reads the mark instead (`workflowWatchWord`), so the only surface
 * still showing the binary is the ledger.
 */
export const WORKFLOW_WATCH_COMMAND = '/usr/bin/true'

/**
 * What a watcher RUNS, in the reader's words rather than the binary's.
 *
 * Three arms, not two, because "nobody asked" and "asked, and there is no
 * such template" are different facts and the sentences differ:
 *
 *  - `null`      — no resolver was passed (a caller or a check that has no
 *                  template list). The honest answer is the general one.
 *  - `undefined` — asked, and no template answers to the id: it was deleted
 *                  under the watcher, which is worth saying.
 *  - a name      — the ordinary case.
 */
export function workflowWatchWord(name: string | undefined | null): string {
  if (name === null) return 'runs a workflow'
  if (name === undefined) return 'runs a workflow that no longer exists'
  return `runs the workflow ${name}`
}

/** The same three arms as a short label — the rail's `watcher · <what>` tail. */
export function workflowWatchLabel(name: string | undefined | null): string {
  return name === null || name === undefined ? 'a workflow' : name
}

/**
 * M133, fix round 1. Why a TRIGGER cannot run this template — or undefined.
 *
 * A parameterised template is refused ON THE FIRE PATH and mints nothing: a
 * timer at 3am has nobody to answer the sheet, and opening one would leave a
 * modal over an empty canvas while the watcher recorded a success. The CLICK
 * path keeps the sheet, because a click has a person behind it.
 */
export function workflowFireRefusal(holes: readonly string[]): string | undefined {
  if (holes.length === 0) return undefined
  return `not run: this workflow has parameters (${holes.join(', ')}) and a trigger cannot fill them`
}

export function workflowWatch(
  templateId: string, cwd: string, trigger: WatchTrigger
): { cwd: string; command: string; args: string[]; trigger: WatchTrigger; templateId: string } {
  return { cwd, command: WORKFLOW_WATCH_COMMAND, args: [], trigger, templateId }
}
