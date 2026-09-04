import type { TranscriptTurn } from './transcript'

/**
 * M77. THE TOOL-CALL → FILE INDEX, pure over transcript turns.
 *
 * A tool names a file only through `file_path`, `path` or `notebook_path`
 * as a STRING. A Bash command that mentions a path names nothing: indexing
 * it would attribute a `cat` to an edit, and the review row that carried
 * that count would be confidently wrong. Touches keep transcript order.
 * Grouping is by the path RELATIVE to the repository root — how a review
 * row spells it — with a path outside the root kept as typed.
 *
 * Shared, not main-only: the renderer's review node reads it from the chat
 * store's turns, and `verify:review` runs it under plain node.
 */

export interface ToolTouch {
  path: string
  turnId: string
  toolUseId: string
  toolName: string
  at: number
}

export function toolFilePath(input: Record<string, unknown>): string | null {
  const candidate = input.file_path ?? input.path ?? input.notebook_path
  return typeof candidate === 'string' && candidate !== '' ? candidate : null
}

export function indexToolFiles(turns: readonly TranscriptTurn[]): ToolTouch[] {
  const out: ToolTouch[] = []
  for (const turn of turns) {
    for (const block of turn.blocks) {
      if (block.type !== 'tool_use') continue
      const path = toolFilePath(block.input)
      if (path === null) continue
      out.push({ path, turnId: turn.id, toolUseId: block.id, toolName: block.name, at: turn.at })
    }
  }
  return out
}

/** The path a review row would show for `path` under `root`: relative inside the root, as typed outside it. */
export function relativeToRoot(path: string, root: string): string {
  const base = root.replace(/\/+$/, '')
  if (path === base) return '.'
  return path.startsWith(base + '/') ? path.slice(base.length + 1) : path
}

/**
 * The review row a tool's path names. Relative to the root when the path is
 * under it; otherwise the LONGEST known row path the tool's path ends with —
 * git reports the root's REAL path (`/private/var/…` on macOS) while an
 * agent's cwd is the logical one (`/var/…`), and a pure function cannot
 * resolve a symlink. Null when nothing matches: never a guess.
 */
export function matchReviewPath(path: string, repoRoot: string, rows: readonly string[]): string | null {
  const rel = relativeToRoot(path, repoRoot)
  if (rel !== path) return rel
  // The suffix rule is gated on the DIRECTORY the row hangs from ending
  // with the root's own last segment: `/var/x/repo` for a root of
  // `/private/var/x/repo`. Without that gate `/home/u/other/src/a.ts`
  // counts as a touch of THIS repo's `src/a.ts` (M77's verifier).
  const base = repoRoot.replace(/\/+$/, '')
  const rootTail = '/' + (base.split('/').pop() ?? '')
  let best: string | null = null
  for (const row of rows) {
    if (!path.endsWith('/' + row)) continue
    const prefix = path.slice(0, path.length - row.length - 1)
    if (!prefix.endsWith(rootTail)) continue
    if (best === null || row.length > best.length) best = row
  }
  return best
}

export function touchesByPath(touches: readonly ToolTouch[], repoRoot: string, rows: readonly string[] = []): Map<string, ToolTouch[]> {
  const out = new Map<string, ToolTouch[]>()
  for (const t of touches) {
    const key = matchReviewPath(t.path, repoRoot, rows) ?? t.path
    const list = out.get(key)
    if (list) list.push(t)
    else out.set(key, [t])
  }
  return out
}
