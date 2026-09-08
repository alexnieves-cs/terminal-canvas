import type { PersistedTemplate, TemplateNode } from './templates'

/**
 * M183. THE LIBRARY — one entry per node kind, the table the library column,
 * the `Add` control and the palette's `workflow-add` all read. A kind's
 * default node is what `addNode` accepts; its placement is to the right of
 * the rightmost block, one gap over, so a keyboard Add lands where a drop
 * would have. Act V adds its kinds here and nowhere else. Pure:
 * `verify:layout library.1–.2`.
 */

export interface LibraryEntry {
  kind: TemplateNode['kind']
  name: string
  sentence: string
  example: string
}

export const LIBRARY: readonly LibraryEntry[] = [
  { kind: 'terminal', name: 'Terminal', sentence: 'A shell or an agent CLI in a directory; hands off on exit.', example: 'npm test' },
  { kind: 'chat', name: 'Chat', sentence: 'A conversation with claude or codex; hands off after a turn.', example: 'review the diff' },
  { kind: 'pool', name: 'Pool', sentence: 'Workers over a shared list, bounded by the concurrency ceiling.', example: 'items.txt' },
  { kind: 'orchestrator', name: 'Orchestrator', sentence: 'A chat that leads the others with a prompt on every spawn.', example: 'lead the workers' },
  { kind: 'collect', name: 'Collect', sentence: 'A chat that joins every result the pool hands it.', example: 'results.md' },
  // M188. The two executable kinds: the workflow's own hands.
  { kind: 'action', name: 'Action', sentence: 'Runs one canvas verb line, through the same executor the palette uses.', example: 'note-add sticky' },
  { kind: 'http', name: 'Fetch', sentence: 'Reads a web page or an API with a GET; a write is refused by name.', example: 'https://example.com/api' }
]

export const LIBRARY_GAP = 40
const BLOCK_W = 168
const BLOCK_H = 64

export function defaultNodeOf(kind: TemplateNode['kind']): Omit<TemplateNode, 'key'> {
  // Built as a keyed node and the key dropped: `Omit` over the union loses
  // the discriminant, and a literal per arm would not type-check against it.
  const keyed = ((): TemplateNode => {
    switch (kind) {
      case 'terminal': return { key: 'n', kind: 'terminal', cwd: '~', dx: 0, dy: 0 }
      case 'chat': return { key: 'n', kind: 'chat', cwd: '~', dx: 0, dy: 0 }
      // Placeholders the parser accepts (an empty list, prompt or target is dropped at the next launch); the inspector is where they are filled in.
      case 'pool': return { key: 'n', kind: 'pool', width: 2, list: 'items.txt', prompt: 'work on the item below', cwd: '~', dx: 0, dy: 0 }
      case 'orchestrator': return { key: 'n', kind: 'orchestrator', prompt: 'lead the workers and keep the plan', cwd: '~', dx: 0, dy: 0 }
      case 'collect': return { key: 'n', kind: 'collect', target: 'results.md', cwd: '~', dx: 0, dy: 0 }
      case 'action': return { key: 'n', kind: 'action', line: 'note-add sticky', cwd: '~', dx: 0, dy: 0 }
      case 'http': return { key: 'n', kind: 'http', url: 'https://example.com/', method: 'GET', cwd: '~', dx: 0, dy: 0 }
      default: throw new TypeError(`${String(kind)} is not a node kind`)
    }
  })()
  const { key: _key, ...rest } = keyed
  return rest
}

/** To the right of the rightmost block, one gap over, on the topmost row; never over an existing block. */
export function placementFor(t: PersistedTemplate): { dx: number; dy: number } {
  if (t.nodes.length === 0) return { dx: 0, dy: 0 }
  const maxRight = Math.max(...t.nodes.map((n) => n.dx + BLOCK_W))
  const dy = Math.min(...t.nodes.map((n) => n.dy))
  let dx = maxRight + LIBRARY_GAP
  const overlaps = (x: number, y: number): boolean => t.nodes.some((n) => x < n.dx + BLOCK_W && n.dx < x + BLOCK_W && y < n.dy + BLOCK_H && n.dy < y + BLOCK_H)
  while (overlaps(dx, dy)) dx += LIBRARY_GAP
  return { dx, dy }
}
