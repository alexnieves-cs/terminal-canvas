/**
 * M55 — adopting recovered sessions into the canvas.
 *
 * A recovered panel takes THE SESSION'S OWN ID: the tmux session is named by
 * it, and `new-session -A` reattaching by that name is the entire mechanism.
 * The row's cwd and command become its spec, and it is cascaded from the
 * viewport centre exactly as a preset spawn is, one cascade step per panel,
 * so two recovered sessions do not land as one byte-identical rect.
 *
 * `seedAfter` is the id counter's ONE seeding rule. Canvas.tsx and
 * switchWorkspace used to carry the character class inline, twice, and the
 * comment on each warned that missing either reopened the duplicate-id
 * defect through the other door; a third copy for recovery would have been
 * a third door. All five prefixes draw from one counter, so an adopted n17
 * with the counter at 12 would otherwise mint a second n17 five spawns on.
 */
import type { OrphanRow } from '@shared/orphans'
import type { Point } from '@renderer/canvas/viewport'
import { cascadeCentre, makePanel, nextZ, type Panel, type TerminalPanel } from './panels'

export function recoverPanels(rows: readonly OrphanRow[], existing: readonly Panel[], centre: Point): TerminalPanel[] {
  const out: TerminalPanel[] = []
  let all: Panel[] = [...existing]
  for (const row of rows) {
    const at = cascadeCentre(centre, all)
    // Absent stays absent: a login shell's command is '' from tmux, and a
    // spec carrying `command: ''` would be resolved as a literal empty
    // program rather than as "main picks the shell".
    const spec = row.command === ''
      ? { cwd: row.cwd, args: [] }
      : { cwd: row.cwd, command: row.command, args: [] }
    const panel = makePanel(row.panelId, at, nextZ(all), spec)
    out.push(panel)
    all = [...all, panel]
  }
  return out
}

// M388. Every prefix this app mints from the one counter — widened from
// n/r/f/j/t, which left nt/img/im/sh/cx/c/w/wf/m/b/g/k ids invisible to seeding: a
// canvas holding only notes seeded the counter at 1 and minted `nt1` again,
// and load drops a duplicate id silently (lb :357). A FOREIGN id (an adopted
// tmux session's arbitrary name) still does not move the counter.
const ID_SEQUENCE = /^(?:n|r|f|j|t|c|w|wf|m|b|g|k|nt|sh|cx|img|im)(\d+)$/

/** The counter to use after these ids exist: past every one of ours, never backwards. */
export function seedAfter(ids: readonly string[], current: number): number {
  return ids.reduce((max, id) => {
    const match = ID_SEQUENCE.exec(id)
    return match ? Math.max(max, Number(match[1]) + 1) : max
  }, current)
}
