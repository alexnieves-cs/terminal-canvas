import type { PersistedRun } from './runs'

/**
 * M184. A RUN'S OUTCOME ON THE DIAGRAM, pure over the run's own record: one
 * word per node key of the run's DEFINITION (the template as it was at the
 * run's start), read from the run's entries through its MAPPING (node key →
 * panel id). Nothing here reads the live template — a later edit never moves
 * a finished run's words, because the words are drawn from the snapshot.
 *
 * The vocabulary is the recorder's own literal outcomes: `exit 0` and
 * `a turn` are finished, `skipped — …` (the word `useHandoff` writes onto a
 * target an `exit-ok`/`exit-fail` fork did NOT fire) is its own word, a
 * `stopped` seal is its own word, any other `exit …` (a signal included)
 * failed. `wants-you` is reserved for the day an entry records a pending
 * question; today no entry does, and `outcomeWord` answers for it so the
 * day it does the vocabulary is already there.
 *
 * M184 (the critic, findings 7, 8 and 11). Four facts that were one word are
 * now four. A key with NO MAPPING was never instantiated (`absent`), a key
 * mapped with no entry is waiting its turn (`queued`), an entry with no
 * outcome on an OPEN run is working, and the same entry on a SEALED run
 * (`endedAt` set) has no outcome and never will (`unknown`) — a block
 * painting `working` for ever on a run that ended hours ago is a confident
 * wrong answer, and `skipped` painted red said a node that never ran failed.
 * Pure: `verify:viewport run.outcome.1`.
 */

export type BlockOutcome =
  | 'absent' | 'queued' | 'working' | 'unknown'
  | 'finished' | 'failed' | 'skipped' | 'stopped' | 'wants-you'

export function classifyOutcome(outcome: string | undefined): BlockOutcome {
  if (outcome === undefined) return 'working'
  if (outcome === 'exit 0' || outcome === 'a turn' || outcome === 'passed') return 'finished'
  if (outcome.startsWith('handed off')) return 'finished'
  if (outcome.startsWith('skipped')) return 'skipped'
  if (outcome.startsWith('stopped')) return 'stopped'
  return 'failed'
}

export function blockOutcomes(run: PersistedRun): Record<string, BlockOutcome> {
  const out: Record<string, BlockOutcome> = {}
  if (run.definition === undefined) return out
  for (const node of run.definition.nodes) {
    const panelId = run.mapping?.[node.key]
    if (panelId === undefined) { out[node.key] = 'absent'; continue }
    // `recordRunEvent`'s own `find` keeps at most one entry per panel id, so
    // the first match IS the entry — a reversed copy looked for a last one
    // that cannot exist.
    const entry = run.entries.find((e) => e.panelId === panelId)
    if (entry === undefined) { out[node.key] = 'queued'; continue }
    if (entry.outcome === undefined) { out[node.key] = run.endedAt === undefined ? 'working' : 'unknown'; continue }
    out[node.key] = classifyOutcome(entry.outcome)
  }
  return out
}

/** The state vocabulary's word for the tone. */
export function outcomeWord(o: BlockOutcome): string {
  if (o === 'wants-you') return 'needs you'
  if (o === 'absent') return 'not run'
  if (o === 'unknown') return 'no outcome'
  return o
}

/**
 * The `data-tone` the block wears, so the diagram reads the ONE tone block in
 * `styles.css` rather than binding `--blue`/`--green`/`--red` itself (the
 * tone block's own rule: add a state there and every surface follows).
 */
export function outcomeTone(o: BlockOutcome): string {
  if (o === 'working') return 'working'
  if (o === 'finished') return 'idle'
  if (o === 'failed') return 'exited'
  if (o === 'wants-you') return 'needs-you'
  if (o === 'skipped' || o === 'stopped') return 'asleep'
  if (o === 'queued') return 'starting'
  return 'none'
}
