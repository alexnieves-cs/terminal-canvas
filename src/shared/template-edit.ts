import type { PersistedTemplate, TemplateNode, TemplateEdge } from './templates'
import type { HandoffTrigger } from './handoff'
import { POOL_WIDTH_MAX } from './workflow-nodes'

/**
 * M182. ONE TEMPLATE, TWO EDITORS — the operations both apply. Every
 * mutation a template can undergo lives here, pure over the record: the
 * diagram's drag, the palette's text modes, the agent's verbs and the
 * canvas binding's Update all call these and nothing else, so the two views
 * cannot disagree about what an edit means. Each answers `ok` with a FRESH
 * record (the input is never mutated — a shared reference lets a later
 * mutation rewrite a draft already on screen) or `refused` BY NAME.
 *
 * Keys are minted once and never reused (`nextKey` on the record; absent on
 * a pre-M182 record and derived from the highest `n<N>` there): a run's
 * node mapping (M184) names keys, and a reused key would attach an old
 * outcome to a new node. Edges are validated the way the canvas validates
 * them — a cycle refused, never rate-limited (M78's rule from the record's
 * side). Pure: `verify:layout edit.1–.4`.
 */

export type EditResult = { kind: 'ok'; template: PersistedTemplate } | { kind: 'refused'; reason: string }

const copyOf = (t: PersistedTemplate): PersistedTemplate => ({
  ...t,
  nodes: t.nodes.map((n) => ({ ...n, ...('args' in n && Array.isArray(n.args) ? { args: [...n.args] } : {}) })) as TemplateNode[],
  edges: t.edges.map((e) => ({ ...e }))
})

const KEY_RE = /^n(\d+)$/

/** `n<N>`: one past the highest ever minted — `nextKey` when the record carries it, else the highest `n<digits>` present + 1. */
export function nextNodeKey(t: PersistedTemplate): string {
  let highest = 0
  for (const n of t.nodes) { const m = KEY_RE.exec(n.key); if (m) highest = Math.max(highest, Number(m[1])) }
  // The larger of the record's counter and the scan: a hand-edited or badly
  // saved record with `nextKey` below a present key would mint a duplicate
  // that `parseTemplates` drops at the next launch (the M182 critic).
  const counter = typeof t.nextKey === 'number' && Number.isInteger(t.nextKey) && t.nextKey >= 1 ? t.nextKey : 1
  return `n${Math.max(counter, highest + 1)}`
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function widthRefusal(width: unknown): string | null {
  if (!isNum(width) || !Number.isInteger(width) || width < 1 || width > POOL_WIDTH_MAX) return `width must be a whole number from 1 to ${POOL_WIDTH_MAX}`
  return null
}

function validateNode(node: TemplateNode): string | null {
  if (node.kind === 'terminal' || node.kind === 'chat') { if (!isStr(node.cwd) || node.cwd.trim() === '') return 'a terminal or chat node needs a cwd' }
  if (node.kind === 'pool') { const w = widthRefusal(node.width); if (w !== null) return w; if (!isStr(node.list) || node.list.trim() === '') return 'a pool node needs a list (a file path)' }
  // The same three rules `parseWorkflowNode` applies on the way in from disk:
  // a draft the parser would drop at the next launch must be refused here.
  if (node.kind === 'orchestrator' && (!isStr(node.prompt) || node.prompt.trim() === '')) return 'an orchestrator node needs a prompt'
  if (node.kind === 'collect' && (!isStr(node.target) || node.target.trim() === '')) return 'a collect node needs a target (a file path or a node key)'
  return null
}

export function addNode(t: PersistedTemplate, node: Omit<TemplateNode, 'key'>): EditResult {
  const key = nextNodeKey(t)
  const full = { ...node, key } as TemplateNode
  const reason = validateNode(full)
  if (reason !== null) return { kind: 'refused', reason }
  const next = copyOf(t)
  next.nodes.push(full)
  next.nextKey = Number(key.slice(1)) + 1
  return { kind: 'ok', template: next }
}

export function moveNode(t: PersistedTemplate, key: string, dx: number, dy: number): EditResult {
  if (!t.nodes.some((n) => n.key === key)) return { kind: 'refused', reason: `no node is called ${key}` }
  if (!isNum(dx) || !isNum(dy)) return { kind: 'refused', reason: 'a move needs two finite numbers' }
  const next = copyOf(t)
  next.nodes = next.nodes.map((n) => (n.key === key ? { ...n, dx, dy } : n)) as TemplateNode[]
  return { kind: 'ok', template: next }
}

/** The fields a kind OWNS, with the type each takes. `kind` and `key` are identity and never patched. */
const FIELDS: Record<TemplateNode['kind'], Record<string, 'string' | 'number' | 'string[]'>> = {
  terminal: { cwd: 'string', title: 'string', command: 'string', args: 'string[]', presetId: 'string', message: 'string', w: 'number', h: 'number' },
  chat: { cwd: 'string', title: 'string', command: 'string', args: 'string[]', presetId: 'string', message: 'string', w: 'number', h: 'number' },
  pool: { width: 'number', list: 'string', prompt: 'string', cwd: 'string' },
  orchestrator: { prompt: 'string', cwd: 'string' },
  collect: { target: 'string', cwd: 'string' },
  // M188. The two EXECUTABLE kinds. `line` is a verb line bound at run time,
  // never at save; `method` is stored as written so the refusal can name it
  // rather than silently rewriting the node to GET.
  action: { line: 'string', cwd: 'string' },
  http: { url: 'string', method: 'string', cwd: 'string' }
}

/** The fields a kind's inspector renders, in order (M183 reads this; one registry for the editor and the validator). */
export function fieldsOf(kind: TemplateNode['kind']): ReadonlyArray<{ name: string; type: 'string' | 'number' | 'string[]' }> {
  return Object.entries(FIELDS[kind]).map(([name, type]) => ({ name, type }))
}

export function configureNode(t: PersistedTemplate, key: string, patch: Record<string, unknown>): EditResult {
  const node = t.nodes.find((n) => n.key === key)
  if (node === undefined) return { kind: 'refused', reason: `no node is called ${key}` }
  const fields = FIELDS[node.kind]
  const patched: Record<string, unknown> = { ...node }
  for (const [name, value] of Object.entries(patch)) {
    if (name === 'kind' || name === 'key') return { kind: 'refused', reason: `${name} is a node's identity and cannot be changed — remove the node and add another` }
    const type = fields[name]
    if (type === undefined) return { kind: 'refused', reason: `a ${node.kind} node has no field called ${name}` }
    const okType = type === 'string' ? isStr(value) : type === 'number' ? isNum(value) : Array.isArray(value) && value.every(isStr)
    if (!okType) return { kind: 'refused', reason: `${name} must be a ${type === 'string[]' ? 'list of strings' : type}` }
    patched[name] = type === 'string[]' ? [...(value as string[])] : value
  }
  const reason = validateNode(patched as unknown as TemplateNode)
  if (reason !== null) return { kind: 'refused', reason }
  const next = copyOf(t)
  next.nodes = next.nodes.map((n) => (n.key === key ? (patched as unknown as TemplateNode) : n))
  return { kind: 'ok', template: next }
}

export function removeNode(t: PersistedTemplate, key: string): EditResult {
  if (!t.nodes.some((n) => n.key === key)) return { kind: 'refused', reason: `no node is called ${key}` }
  const next = copyOf(t)
  next.nodes = next.nodes.filter((n) => n.key !== key)
  next.edges = next.edges.filter((e) => e.from !== key && e.to !== key)
  // The key is spent: the next mint steps past it even when it was the highest.
  next.nextKey = Math.max(Number(nextNodeKey(t).slice(1)), typeof t.nextKey === 'number' ? t.nextKey : 0)
  return { kind: 'ok', template: next }
}

/** Whether `from -> to` closes a directed cycle over the edges (the canvas's `wouldCycle`, over keys). */
export function edgeWouldCycle(edges: readonly TemplateEdge[], from: string, to: string): boolean {
  const seen = new Set<string>()
  const stack = [to]
  while (stack.length > 0) {
    const at = stack.pop() as string
    if (at === from) return true
    if (seen.has(at)) continue
    seen.add(at)
    for (const e of edges) if (e.from === at) stack.push(e.to)
  }
  return false
}

export function addEdge(t: PersistedTemplate, from: string, to: string, trigger: HandoffTrigger): EditResult {
  const keys = new Set(t.nodes.map((n) => n.key))
  if (!keys.has(from)) return { kind: 'refused', reason: `no node is called ${from}` }
  if (!keys.has(to)) return { kind: 'refused', reason: `no node is called ${to}` }
  if (from === to) return { kind: 'refused', reason: 'an edge cannot start and end on the same node' }
  if (t.edges.some((e) => e.from === from && e.to === to)) return { kind: 'refused', reason: `${from} already hands off to ${to}` }
  // `to`, never `→`: this reason reaches the screen (M183's refusal line) and `icons.1` bans a symbol glyph in renderer text.
  if (edgeWouldCycle(t.edges, from, to)) return { kind: 'refused', reason: `${from} to ${to} would close a cycle — a workflow runs forward` }
  const next = copyOf(t)
  next.edges.push({ from, to, trigger })
  return { kind: 'ok', template: next }
}

/** M183. An edge's trigger, changed IN PLACE: an unedge-then-re-add is two operations, reorders the list, and loses the edge if the re-add refuses. */
export function retriggerEdge(t: PersistedTemplate, from: string, to: string, trigger: HandoffTrigger): EditResult {
  if (!t.edges.some((e) => e.from === from && e.to === to)) return { kind: 'refused', reason: `${from} does not hand off to ${to}` }
  const next = copyOf(t)
  next.edges = next.edges.map((e) => (e.from === from && e.to === to ? { ...e, trigger } : e))
  return { kind: 'ok', template: next }
}

export function removeEdge(t: PersistedTemplate, from: string, to: string): EditResult {
  if (!t.edges.some((e) => e.from === from && e.to === to)) return { kind: 'refused', reason: `${from} does not hand off to ${to}` }
  const next = copyOf(t)
  next.edges = next.edges.filter((e) => !(e.from === from && e.to === to))
  return { kind: 'ok', template: next }
}
