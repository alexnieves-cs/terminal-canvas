import type { ToolTouch } from './tool-index'

/**
 * M247. Which canvas objects an agent touched, and how — derived, never stored.
 *
 * The source is the transcript's tool calls, read through tool-index.ts (the
 * ONE place a path is taken out of a tool's input). Nothing here is persisted:
 * a restart re-derives every link from the chat store, like SubagentLayer's
 * nodes. Honest limits, recorded rather than faked: a terminal agent has no
 * turns, and Codex reports shell commands with no path, so neither links.
 *
 * ONE link per (agent, object), carrying the strongest fact: a draft pending
 * review beats a write, which beats a read. Paths with no object on the
 * canvas are ignored — the canvas draws what is on it.
 */
export type AgentLinkKind = 'read' | 'wrote' | 'draft'
export interface AgentLink { agent: string; object: string; kind: AgentLinkKind }
export interface LinkObject {
  id: string
  /** Absolute, as the file panel holds it. */
  path: string
  /** M246. The agent whose draft is pending on this sheet, when there is one. */
  draftBy?: string
}

// Lower-cased, so ACP's `edit` kind matches Claude's `Edit`. An UNKNOWN tool
// is a read: saying a tool wrote a file it only looked at sends a person to
// review a change that never happened.
const WROTE = new Set(['write', 'edit', 'multiedit', 'notebookedit'])
const RANK: Record<AgentLinkKind, number> = { read: 0, wrote: 1, draft: 2 }

/**
 * Absolute, `.`/`..` resolved, and with macOS's `/private` prefix dropped —
 * `/var`, `/tmp` and `/etc` are symlinks into it, so git and realpath spell a
 * path one way and an agent's logical cwd the other (tool-index.ts's own
 * note). A pure function cannot resolve symlinks; it can agree on a spelling.
 */
export function normalisePath(path: string, cwd: string): string {
  // `~/x` is its own root, never relative to the cwd; it stays a `~` spelling (see agentLinks).
  const abs = path.startsWith('/') || path.startsWith('~') ? path : `${cwd.replace(/\/+$/, '')}/${path}`
  const parts: string[] = []
  for (const seg of abs.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') { parts.pop(); continue }
    parts.push(seg)
  }
  const out = '/' + parts.join('/')
  return /^\/private\/(var|tmp|etc)(\/|$)/.test(out) ? out.slice('/private'.length) : out
}

export function agentLinks(input: { agent: string; cwd: string; touches: readonly ToolTouch[]; objects: readonly LinkObject[] }): AgentLink[] {
  // A path can be open in two panels at once; both are touched.
  const byPath = new Map<string, string[]>()
  for (const o of input.objects) {
    const key = normalisePath(o.path, '/')
    const list = byPath.get(key)
    if (list) list.push(o.id)
    else byPath.set(key, [o.id])
  }
  const best = new Map<string, AgentLinkKind>()
  const bump = (id: string, kind: AgentLinkKind): void => {
    const cur = best.get(id)
    if (cur === undefined || RANK[kind] > RANK[cur]) best.set(id, kind)
  }
  // M247 (critic, finding 1). A chat started with nothing focused keeps the
  // UNEXPANDED cwd `~` (chat-panel.ts: main expands it; the renderer cannot), so
  // a relative or `~/…` touch normalises to `/~/…` and would never match. It is
  // matched by path SUFFIX instead — but only when exactly ONE open object ends
  // with it; two candidates would be a guess, and a wrong edge is worse than none.
  const resolveTouch = (path: string): string[] | undefined => {
    const key = normalisePath(path, input.cwd)
    const exact = byPath.get(key)
    if (exact !== undefined || !key.startsWith('/~/')) return exact
    const tail = key.slice(2)
    const hits = [...byPath.keys()].filter((p) => p.endsWith(tail))
    return hits.length === 1 ? byPath.get(hits[0]) : undefined
  }
  for (const t of input.touches) {
    const ids = resolveTouch(t.path)
    if (!ids) continue
    const kind: AgentLinkKind = WROTE.has(t.toolName.toLowerCase()) ? 'wrote' : 'read'
    for (const id of ids) bump(id, kind)
  }
  // The draft IS a touch: an agent that proposed through the agent door has no Write tool call for it.
  for (const o of input.objects) if (o.draftBy === input.agent) bump(o.id, 'draft')
  // Sorted by object id so the same facts always produce the same array (and the store's
  // equality check does not see a reordering as a change).
  return [...best].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([object, kind]) => ({ agent: input.agent, object, kind }))
}

export interface PlannedLink extends AgentLink {
  /** The word on the edge — only at the nearest tier. */
  label?: string
  /** How many links this one stands for — only when bundled. */
  count?: number
}
const WORD: Record<AgentLinkKind, string> = { read: 'read', wrote: 'wrote', draft: 'draft · review' }

/**
 * What to draw at a card-detail tier. READ card-detail.ts: `tail` is the
 * NEAREST tier and `block` the FARTHEST — the names say what a card shows,
 * not how far away it is (LinkLayer records the inverted first cut).
 *   tail    → every link, each with its word
 *   summary → one link per (agent, kind), toward the nearest object, no words
 *   block   → nothing
 * A link whose endpoint has no centre (not on this canvas) is dropped at every tier.
 */
export function agentLinkPlan(links: readonly AgentLink[], detail: string | undefined, centreOf: (id: string) => { x: number; y: number } | undefined): PlannedLink[] {
  if (detail === 'block') return []
  const drawable = links.filter((l) => centreOf(l.agent) !== undefined && centreOf(l.object) !== undefined)
  if (detail !== 'summary') return drawable.map((l) => ({ ...l, label: WORD[l.kind] }))
  const groups = new Map<string, AgentLink[]>()
  for (const l of drawable) {
    const key = `${l.agent} ${l.kind}`
    const g = groups.get(key)
    if (g) g.push(l)
    else groups.set(key, [l])
  }
  const out: PlannedLink[] = []
  for (const g of groups.values()) {
    const a = centreOf(g[0].agent)!
    const dist = (l: AgentLink): number => { const o = centreOf(l.object)!; return Math.hypot(o.x - a.x, o.y - a.y) }
    const nearest = g.reduce((m, l) => (dist(l) < dist(m) ? l : m))
    out.push({ agent: nearest.agent, object: nearest.object, kind: nearest.kind, count: g.length })
  }
  return out
}
