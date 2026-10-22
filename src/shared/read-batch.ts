/**
 * M533 (G3) — allow every pending read. tmuxcc approves or rejects every
 * waiting agent in one pass; with five agents each stopping to ask "may I
 * read this file", ⌘Y one at a time is most of a person's evening. A blanket
 * "allow all" would also wave through a write or a command nobody read, so
 * the batch takes only what cannot change anything and stays where the
 * agent was sent:
 *
 * - **Read-only tools only**: Read, Grep, Glob, LS and NotebookRead. Not
 *   WebFetch or WebSearch: a URL can carry what was read off the machine.
 * - **Inside the chat's own folder.** A read of `~/.ssh` or `/etc` is
 *   read-only and still not something to allow unseen, so every path the
 *   request names must resolve inside the chat's cwd. A cwd that is `/` or
 *   unknown answers nothing.
 * - **Allow once each.** No session grant: that stays a choice made at the
 *   card (M98).
 * - **Claude chats only.** An ACP agent's "tool name" is its own `kind`
 *   label (an MCP tool that sends data out can call itself `read`), its
 *   inputs use vendor keys this check cannot read, and its allow can fall
 *   back to allow-always (the critic's findings 1 and 4).
 * - **Known input keys only**, per tool: a request carrying a key the check
 *   does not understand is refused rather than assumed harmless.
 * - **Never home, never `~`.** A chat whose folder is `~`, unexpanded, or
 *   two segments or fewer (`/Users/me`) answers nothing: "inside the folder"
 *   would then include `~/.ssh`. A path written with `~` is refused.
 *
 * One limit, accepted and stated: the check is lexical. A repository that
 * holds a symlink to `~/.ssh` makes `link/id_rsa` look inside; resolving it
 * needs the disk, which the renderer does not have.
 *
 * Pure, and imports only a path helper, so `verify:borrow reads.*` runs it
 * under plain node.
 */
import { normalisePath } from './agent-links'

/** Tool names whose every effect is a read, in Claude's spelling; matched case-insensitively. */
export const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'] as const
/** The input keys each tool may carry; any other key refuses the request. */
const KEYS: Readonly<Record<string, readonly string[]>> = {
  read: ['file_path', 'offset', 'limit'],
  grep: ['pattern', 'path', 'glob', 'type', 'output_mode', '-i', '-n', '-A', '-B', '-C', 'context', 'head_limit', 'offset', 'multiline'],
  glob: ['pattern', 'path'],
  ls: ['path', 'ignore'],
  notebookread: ['notebook_path', 'cell_id']
}

/** Where a glob stops being a literal path: everything before the first wildcard. */
function literalPrefix(pattern: string): string {
  const at = pattern.search(/[*?[{]/)
  const head = at === -1 ? pattern : pattern.slice(0, at)
  return head.includes('/') ? head.slice(0, head.lastIndexOf('/') + 1) || '/' : ''
}

/** Every location a read-only request names, as written. An empty list means "the cwd". */
function namedPaths(toolName: string, input: Record<string, unknown>): string[] | null {
  const out: string[] = []
  for (const key of ['file_path', 'path', 'notebook_path']) {
    const v = input[key]
    if (v === undefined) continue
    if (typeof v !== 'string') return null
    out.push(v)
  }
  if (toolName.toLowerCase() === 'glob') {
    const p = input['pattern']
    if (p !== undefined) {
      if (typeof p !== 'string') return null
      const prefix = literalPrefix(p)
      if (prefix !== '') out.push(prefix)
    }
  }
  return out
}

/** A folder the batch may treat as a boundary: absolute, expanded, and deeper than a home folder. */
function boundary(cwd: string): string | null {
  if (!cwd.startsWith('/')) return null
  const root = normalisePath(cwd, '/')
  return root.split('/').filter((s) => s !== '').length <= 2 ? null : root
}

function inside(path: string, root: string): boolean {
  if (path.startsWith('~')) return false
  const p = normalisePath(path, root)
  return p === root || p.startsWith(`${root}/`)
}

/** Whether one pending request may be allowed by the batch. */
export function batchAllowable(ask: { toolName: string; input: Record<string, unknown> }, cwd: string | undefined, backend: string = 'claude'): boolean {
  if (backend !== 'claude') return false
  // Claude's own spelling, exactly: a lower-cased `read` is an ACP kind, never Claude's tool.
  if (!(READ_ONLY_TOOLS as readonly string[]).includes(ask.toolName)) return false
  const allowed = KEYS[ask.toolName.toLowerCase()] ?? []
  if (Object.keys(ask.input).some((k) => !allowed.includes(k))) return false
  const root = cwd === undefined ? null : boundary(cwd.trim())
  if (root === null) return false
  if (ask.toolName === 'Glob') {
    const pattern = ask.input['pattern']
    if (typeof pattern === 'string' && (/(^|\/)\.\.(\/|$)/.test(pattern) || /^[{~]/.test(pattern))) return false
  }
  const paths = namedPaths(ask.toolName, ask.input)
  if (paths === null) return false
  return paths.every((p) => p.trim() !== '' && inside(p, root))
}

export interface BatchChat {
  id: string
  cwd: string | undefined
  /** The chat's backend; only `claude` is ever batched. */
  backend: string | undefined
  pending: ReadonlyArray<{ requestId: string; toolName: string; input: Record<string, unknown> }>
}

/** The requests one press allows, across every chat, in the order given. */
export function readsToAllow(chats: readonly BatchChat[]): Array<{ panelId: string; requestId: string }> {
  return chats.flatMap((c) => c.pending.filter((p) => batchAllowable(p, c.cwd, c.backend ?? 'claude')).map((p) => ({ panelId: c.id, requestId: p.requestId })))
}
