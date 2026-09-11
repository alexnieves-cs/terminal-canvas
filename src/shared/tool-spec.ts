/**
 * M252. "Describe a tool" — what an agent's answer may become, and what the
 * result will be able to reach.
 *
 * A person describes a small tool; ONE headless run (main/tool-generate.ts,
 * given no tools of its own) answers with either a WORKFLOW built from the
 * node kinds this app already runs, or a MINI APP — files for a preview. This
 * module decides whether an answer is one of those, and nothing it accepts
 * is run: the renderer saves a workflow `reviewed: false` (so M190's refusal
 * names every action node until a person reads it) and opens an app's preview
 * without its page. What arrives from outside is inert until a person looks —
 * an agent's answer is from outside.
 *
 * The workflow arm goes through `parseTemplates`, the one template parser, so
 * a generated node is held to exactly the rules a saved one is: an unknown
 * kind costs THAT node and its edges, and is named in `dropped`, never the
 * tool. The app arm is all-or-nothing on its PATHS: a file that climbs out of
 * the tool's folder is not a file to skip, it is an answer not to trust.
 *
 * Pure; plain node in verify:tool.
 */
import { parseTemplates } from './layout-schema'
import type { PersistedTemplate, TemplateNode } from './templates'

export interface ToolGenerateRequest { description: string; folder: string }

/** What a tool will be able to reach — shown in the inspector BEFORE its first run. */
export interface ToolCapabilities { files: string[]; network: string[]; commands: string[] }

export type ToolGenerateResult =
  | { kind: 'workflow'; template: Omit<PersistedTemplate, 'id'> & { reviewed: false }; capabilities: ToolCapabilities; dropped: string[] }
  | { kind: 'app'; name: string; root: string; url: string; devScript: string; capabilities: ToolCapabilities; dropped: string[] }
  | { kind: 'refused'; reason: string }

export interface ToolFile { path: string; text: string }
export type ToolSpec =
  | { kind: 'workflow'; name: string; description?: string; nodes: TemplateNode[]; edges: PersistedTemplate['edges']; dropped: string[] }
  | { kind: 'app'; name: string; slug: string; port: number; devScript: string; files: ToolFile[]; dropped: string[] }
  | { kind: 'refused'; reason: string }

/** M252. Every door that would load or serve an unread tool's page says this — one sentence, so the pane, the palette and the agent line agree. */
export const REASON_TOOL_UNREAD = 'this preview is a generated tool nobody has read yet — read what it can reach on the pane, and choose "I\'ve read this" before anything of it runs'

export const TOOL_FILES_MAX = 20
export const TOOL_FILE_BYTES_MAX = 256 * 1024
export const TOOL_TOTAL_BYTES_MAX = 1024 * 1024

/** The shape `--json-schema` asks the CLI to validate. Loose on node fields: the template parser is the judge. */
export const TOOL_SCHEMA = {
  type: 'object',
  required: ['kind', 'name'],
  properties: {
    kind: { type: 'string', enum: ['workflow', 'app'] },
    name: { type: 'string' },
    description: { type: 'string' },
    nodes: { type: 'array', items: { type: 'object' } },
    edges: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, trigger: { type: 'string' } } } },
    port: { type: 'integer' },
    devScript: { type: 'string' },
    files: { type: 'array', items: { type: 'object', required: ['path', 'text'], properties: { path: { type: 'string' }, text: { type: 'string' } } } }
  }
} as const

export const TOOL_SYSTEM_PROMPT = [
  'You design ONE small tool for a person, from their description. You cannot run anything; answer only with the JSON object.',
  'Choose kind "workflow" when the tool is a sequence of steps, or kind "app" when it is something the person looks at and clicks.',
  'A workflow has nodes and edges. Every node has a unique "key", a "kind", and "dx"/"dy" (its offset in pixels, ~320 apart). Node kinds:',
  '- "terminal": { command, args? } — a command run in a terminal the person can see.',
  '- "action": { line } — one of this app\'s verb lines, e.g. "note-add sticky <text>".',
  '- "http": { url, method: "GET" } — one GET request; nothing else is allowed.',
  'Edges are { from, to, trigger: "exit" } — the next node starts when the previous one ends.',
  'An app has "files" (relative paths inside its own folder; must include index.html), a "devScript" that serves the folder, and the "port" that script listens on.',
  'Keep it small. Name every address the tool contacts in its files or nodes: a person reads them before anything runs.'
].join('\n')

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The object inside an answer: the schema-validated one, or JSON in the text (fenced or bare). */
function extractObject(raw: string): { kind: 'object'; value: Record<string, unknown> } | { kind: 'refused'; reason: string } {
  let envelope: unknown
  try { envelope = JSON.parse(raw) } catch { envelope = undefined }
  if (isRecord(envelope) && envelope.type === 'result') {
    if (envelope.is_error === true) return { kind: 'refused', reason: `the agent could not answer: ${typeof envelope.result === 'string' ? envelope.result : 'an error with no message'}` }
    if (isRecord(envelope.structured_output)) return { kind: 'object', value: envelope.structured_output }
    raw = typeof envelope.result === 'string' ? envelope.result : ''
  } else if (isRecord(envelope)) {
    return { kind: 'object', value: envelope }
  }
  const text = raw.replace(/```(?:json)?\s*([\s\S]*?)```/i, '$1')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const value: unknown = JSON.parse(text.slice(start, end + 1))
      if (isRecord(value)) return { kind: 'object', value }
    } catch { /* falls through to the refusal */ }
  }
  return { kind: 'refused', reason: 'the agent answered with something that is not a tool — try describing it again, in one or two sentences' }
}

export function toolSlug(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
  return slug === '' ? 'tool' : slug
}

/** A path the app may write: relative, every segment a real name, never `..` and never hidden. */
function unsafePath(path: string): boolean {
  if (path === '' || path.startsWith('/') || path.startsWith('~') || /^[A-Za-z]:/.test(path) || path.includes('\\') || path.includes('\0')) return true
  return path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..' || seg.startsWith('.'))
}

export function parseToolReply(raw: unknown, cwd: string): ToolSpec {
  if (typeof raw !== 'string' || raw.trim() === '') return { kind: 'refused', reason: 'the agent answered nothing — try again' }
  const extracted = extractObject(raw)
  if (extracted.kind === 'refused') return extracted
  const obj = extracted.value
  if (obj.kind !== 'workflow' && obj.kind !== 'app') return { kind: 'refused', reason: 'the agent answered with something that is not a tool — it must be a workflow or an app' }
  const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, 80) : ''
  if (name === '') return { kind: 'refused', reason: 'the agent\'s tool has no name — try again' }
  const description = typeof obj.description === 'string' && obj.description.trim() !== '' ? obj.description.trim().slice(0, 400) : undefined

  if (obj.kind === 'workflow') {
    // Every node works in the tool's folder, whatever the answer said: the
    // agent does not get to choose where a command runs.
    const nodes = Array.isArray(obj.nodes) ? obj.nodes.map((n) => (isRecord(n) ? { ...n, cwd } : n)) : []
    const dropped: string[] = []
    const [template] = parseTemplates([{ id: 'generated', name, nodes, edges: Array.isArray(obj.edges) ? obj.edges : [] }], dropped)
    if (template === undefined || template.nodes.length === 0) return { kind: 'refused', reason: `none of the tool's blocks could be read${dropped.length > 0 ? ` — ${dropped[0]}` : ''}` }
    return { kind: 'workflow', name, ...(description === undefined ? {} : { description }), nodes: template.nodes, edges: template.edges, dropped }
  }

  const port = obj.port
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535) return { kind: 'refused', reason: `the app's port ${JSON.stringify(port)} is not one it can serve on (1024–65535)` }
  const devScript = typeof obj.devScript === 'string' ? obj.devScript.trim() : ''
  if (devScript === '' || devScript.length > 300 || /[\r\n]/.test(devScript)) return { kind: 'refused', reason: 'the app has no single-line dev script to serve it' }
  if (!Array.isArray(obj.files) || obj.files.length === 0) return { kind: 'refused', reason: 'the app has no files' }
  if (obj.files.length > TOOL_FILES_MAX) return { kind: 'refused', reason: `the app has ${obj.files.length} files — a tool is at most ${TOOL_FILES_MAX}` }
  const files: ToolFile[] = []
  const dropped: string[] = []
  let total = 0
  for (const f of obj.files) {
    if (!isRecord(f) || typeof f.path !== 'string' || typeof f.text !== 'string') return { kind: 'refused', reason: 'one of the app\'s files is not a path and a text' }
    if (unsafePath(f.path)) return { kind: 'refused', reason: `the app wants to write ${f.path}, outside its own folder — nothing was made` }
    // The app writes its own package.json from `devScript`, so the script
    // the inspector shows is the one `npm run dev` runs. A second one is named.
    if (f.path === 'package.json') { dropped.push('package.json (written from the dev script instead)'); continue }
    if (files.some((x) => x.path === f.path)) return { kind: 'refused', reason: `the app names ${f.path} twice` }
    const bytes = new TextEncoder().encode(f.text).length
    if (bytes > TOOL_FILE_BYTES_MAX) return { kind: 'refused', reason: `${f.path} is ${bytes} bytes — a tool's file is at most ${TOOL_FILE_BYTES_MAX}` }
    total += bytes
    files.push({ path: f.path, text: f.text })
  }
  if (total > TOOL_TOTAL_BYTES_MAX) return { kind: 'refused', reason: `the app is ${total} bytes — a tool is at most ${TOOL_TOTAL_BYTES_MAX}` }
  if (!files.some((f) => f.path === 'index.html')) return { kind: 'refused', reason: 'the app has no index.html to open' }
  return { kind: 'app', name, slug: toolSlug(name), port, devScript, files, dropped }
}

const uniq = (xs: string[]): string[] => [...new Set(xs)]
function hostOf(url: string): string | null {
  try { return new URL(url).host || null } catch { return null }
}

/**
 * What a tool can reach, read off what it IS — never off what it says about
 * itself. A workflow's reach is its nodes; an app's is its folder, every
 * address written in its files, and the dev script it will ask to run.
 */
export function toolCapabilities(input: { kind: 'workflow'; nodes: readonly TemplateNode[] } | { kind: 'app'; root: string; devScript: string; files: readonly ToolFile[] }): ToolCapabilities {
  if (input.kind === 'app') {
    const hosts = input.files.flatMap((f) => [...f.text.matchAll(/https?:\/\/[^\s"'`)<>]+/g)].map((m) => hostOf(m[0])).filter((h): h is string => h !== null))
    return { files: [input.root], network: uniq(hosts), commands: [input.devScript] }
  }
  const files: string[] = []
  const network: string[] = []
  const commands: string[] = []
  for (const node of input.nodes) {
    const n = node as unknown as Record<string, unknown>
    if (typeof n.cwd === 'string') files.push(n.cwd)
    if (n.kind === 'http' && typeof n.url === 'string') { const h = hostOf(n.url); if (h !== null) network.push(h) }
    if (n.kind === 'action' && typeof n.line === 'string') commands.push(n.line)
    if ((n.kind === 'terminal' || n.kind === undefined) && typeof n.command === 'string') commands.push([n.command, ...(Array.isArray(n.args) ? n.args.map(String) : [])].join(' '))
    if (n.kind === 'chat') commands.push('a conversation with an agent')
  }
  return { files: uniq(files), network: uniq(network), commands: uniq(commands) }
}

/** The three inspector lines, each saying `none` rather than disappearing — the inspector layer states zeros. */
export function capabilityLines(c: ToolCapabilities): { files: string; network: string; commands: string } {
  const line = (xs: string[]): string => (xs.length === 0 ? 'none' : xs.join(', '))
  return { files: line(c.files), network: line(c.network), commands: line(c.commands) }
}
