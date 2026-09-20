/**
 * M289. THE DEPENDENCY LENS, pure. Renders the relations that already exist —
 * the canvas's authored handoff links (`shared/handoff.ts`, `useHandoff.ts`)
 * — as directed dependencies with a readable trigger, and for one focused
 * object answers: what must happen first, what waits on it, what is blocked
 * and why, in the words the canvas itself recorded.
 *
 * READ-ONLY BY CONSTRUCTION. Nothing here writes a link, fires a handoff or
 * dispatches anything; the one table that decides a firing stays
 * `handoffFires`, and the one recorder of what happened stays `useHandoff`'s
 * `setResult` sentences. This module only reads those sentences back. A
 * blocker is never inferred: it is a handoff the canvas recorded as SKIPPED,
 * and its reason is that sentence — "skipped — exit 1 is not exit 0". A source
 * that exited with nothing recorded reads `unknown`, never blocked.
 *
 * NO SYNTHETIC CENTRE. Membership spokes to the hub are not dependencies and
 * never appear here; a lens over a canvas with no authored links is empty and
 * says so.
 */

export interface OrchDepEdgeInput {
  from: string
  to: string
  authored?: boolean
  /** The trigger in words ("on exit 0"); absent for a bare link with no handoff rule. */
  trigger?: string
}

export type OrchDepStatus = 'fired' | 'skipped' | 'queued' | 'waiting' | 'pending' | 'unknown'

export interface OrchDependencyEdge {
  from: string
  to: string
  fromTitle: string
  toTitle: string
  /** The trigger word, or "a bare link" when no rule is on it. */
  trigger: string
  /** The exact handoff condition, as a sentence a person can check. */
  condition: string
  status: OrchDepStatus
  /** What the canvas recorded for this edge, verbatim, when it recorded anything. */
  sentence?: string
}

export interface OrchDependencyFocus {
  id: string
  prerequisites: OrchDependencyEdge[]
  dependents: OrchDependencyEdge[]
  /** Prerequisites the canvas recorded as skipped: the named reason each. */
  blockers: { from: string; fromTitle: string; reason: string }[]
  /** Every object the focus depends on or feeds, transitively, plus itself — what stays lit. */
  lit: Set<string>
}

export const ORCH_DEP_READ_ONLY = 'Dependency editing is not available here yet — this lens is read-only. Draw or change a handoff on the canvas.'
export const ORCH_DEP_GROUPING = 'grouping only — not a supervisor'

const CONDITIONS: Readonly<Record<string, string>> = {
  'on exit': 'fires when the source process exits, with any code',
  'on exit 0': 'fires only when the source exits with code 0',
  'on a failing exit': 'fires only when the source exits with a code other than 0, or by signal',
  'after a turn': 'fires when the source agent finishes a turn',
  'always': 'fires on any exit and after every turn'
}

export function orchDepCondition(trigger: string | undefined): string {
  if (trigger === undefined) return 'a bare link — nothing crosses it on its own; it records a relation only'
  return CONDITIONS[trigger] ?? `fires ${trigger}`
}

/** A recorded sentence → the status word. The sentence stays beside it, verbatim. */
export function orchDepStatus(sentence: string | undefined, sourceState: string | undefined): OrchDepStatus {
  if (sentence !== undefined) {
    const s = sentence.startsWith('joined — ') ? sentence.slice('joined — '.length) : sentence
    if (s.startsWith('handed off') || s.startsWith('reloaded')) return 'fired'
    if (s.startsWith('skipped')) return 'skipped'
    if (s.startsWith('queued')) return 'queued'
    if (s.startsWith('waiting')) return 'waiting'
    return 'unknown'
  }
  // Nothing recorded. A source still to run has a pending edge; one that already
  // exited may have fired before this launch — that is unknown, never a verdict.
  return sourceState === 'exited' ? 'unknown' : 'pending'
}

export function orchDependencyEdges(input: {
  edges: readonly OrchDepEdgeInput[]
  results: ReadonlyMap<string, string>
  stateOf: (id: string) => string | undefined
  titleOf: (id: string) => string
}): OrchDependencyEdge[] {
  return input.edges.filter((e) => e.authored === true).map((e) => {
    const sentence = input.results.get(`${e.from}:${e.to}`)
    return {
      from: e.from, to: e.to,
      fromTitle: input.titleOf(e.from), toTitle: input.titleOf(e.to),
      trigger: e.trigger ?? 'a bare link',
      condition: orchDepCondition(e.trigger),
      status: orchDepStatus(sentence, input.stateOf(e.from)),
      ...(sentence === undefined ? {} : { sentence })
    }
  })
}

/**
 * The focus: direct prerequisites and dependents, the skipped prerequisites as
 * named blockers, and the transitive closure both ways as the lit set.
 */
export function orchDependencyFocus(id: string, edges: readonly OrchDependencyEdge[]): OrchDependencyFocus {
  const prerequisites = edges.filter((e) => e.to === id)
  const dependents = edges.filter((e) => e.from === id)
  const blockers = prerequisites.filter((e) => e.status === 'skipped').map((e) => ({ from: e.from, fromTitle: e.fromTitle, reason: e.sentence ?? 'skipped' }))
  const lit = new Set<string>([id])
  const walk = (start: string, dir: 'up' | 'down'): void => {
    const stack = [start]
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const e of edges) {
        const next = dir === 'up' ? (e.to === cur ? e.from : null) : (e.from === cur ? e.to : null)
        if (next !== null && !lit.has(next)) { lit.add(next); stack.push(next) }
      }
    }
  }
  walk(id, 'up')
  walk(id, 'down')
  return { id, prerequisites, dependents, blockers, lit }
}

/** The downstream object's one line: blocked by name, or nothing. */
export function orchBlockedLine(focus: OrchDependencyFocus): string | null {
  const b = focus.blockers[0]
  if (b === undefined) return null
  const more = focus.blockers.length > 1 ? ` (+${focus.blockers.length - 1} more)` : ''
  return `Blocked — ${b.fromTitle}: ${b.reason}${more}`
}
