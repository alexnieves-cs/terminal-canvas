import { fuzzyMatch } from './fuzzy'

/**
 * The palette's list model: what a row is, how a query narrows the list, and
 * how the selection moves. Pure — the React layer in Palette.tsx owns no
 * decisions this file can make.
 */

export type CommandGroup = 'Panel' | 'Preset' | 'Prompt' | 'Canvas'

export interface Command {
  id: string
  title: string
  /** Second line: a cwd, a preset's command, a prompt's source. */
  subtitle?: string
  group: CommandGroup
  /**
   * Present means unrunnable, and says WHY. The same rule menuLabel() states
   * for the preset submenu: a greyed-out row with no reason is a bug report.
   */
  disabledReason?: string
  run(): void
}

const haystack = (c: Command): string => (c.subtitle ? `${c.title} ${c.subtitle}` : c.title)

/**
 * Narrow by query, best first, ties in CONSTRUCTION order.
 *
 * Stability is load-bearing, not tidiness: construction order is what carries
 * the grouping (Panel, then Preset, then Prompt, then Canvas), and an unstable
 * sort would reshuffle equally-scoring rows on every keystroke.
 *
 * Disabled rows are kept. They exist to explain themselves.
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const scored: Array<{ command: Command; score: number; order: number }> = []
  commands.forEach((command, order) => {
    const match = fuzzyMatch(query, haystack(command))
    if (match) scored.push({ command, score: match.score, order })
  })
  scored.sort((a, b) => (b.score - a.score) || (a.order - b.order))
  return scored.map((s) => s.command)
}

const runnable = (c: Command | undefined): boolean => c !== undefined && c.disabledReason === undefined

/** The row Enter would run on a fresh list, or -1 when there is no such row. */
export function firstRunnable(commands: Command[]): number {
  const index = commands.findIndex((c) => runnable(c))
  return index
}

/**
 * The next runnable row in `delta`'s direction, wrapping.
 *
 * Returns -1 when nothing is runnable, which the view must tell apart from
 * "row 0": returning 0 there would let Enter run a disabled command. `from`
 * may be out of range — the list shrinks under the selection on every
 * keystroke — and is normalised rather than trusted.
 */
export function stepRunnable(commands: Command[], from: number, delta: 1 | -1): number {
  const n = commands.length
  if (n === 0) return -1
  const start = from >= 0 && from < n ? from : delta === 1 ? -1 : 0
  for (let step = 1; step <= n; step += 1) {
    const index = (((start + delta * step) % n) + n) % n
    if (runnable(commands[index])) return index
  }
  return -1
}
