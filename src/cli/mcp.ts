/**
 * M487 — `tc mcp`: the canvas as an MCP server, over stdio.
 *
 * A fifth door, and deliberately a thin one. Every tool here becomes ONE
 * line on the control socket `tc` already speaks, so an MCP client gets
 * exactly the socket's caps and nothing beside them: no tool reaches main
 * by another road, and a verb the socket refuses is refused here in the
 * socket's own words. That is the whole security argument — a second
 * implementation of "what may an outside caller do" would drift from the
 * first one silently.
 *
 * Three rules this module keeps:
 *
 * - **Every answer leaves through `outward`.** An MCP client is another
 *   program (often a model that will quote what it read into a chat), so a
 *   reply is pane content leaving the app. The socket's own replies are not
 *   scrubbed (a `tc` in a person's shell is that person reading), which is
 *   why the gate is HERE, on the one way out of this door. Each STRING is
 *   scrubbed before the reply is serialised, never the JSON after: JSON
 *   writes a tab or newline before a token as `\t`/`\n`, the escape letter
 *   is a word character, and every redact pattern's leading `\b` then fails
 *   — a token after a newline in a title left whole (the critic's finding).
 * - **A message goes to a CHAT, never a terminal.** A terminal agent's
 *   permission prompt is a menu whose default is Yes, and the only guard on
 *   typing Enter into it is the `wants-you` word, which a bell sets and a
 *   click clears while the menu is still on screen; a line starting `!` is a
 *   shell command in Claude Code with no prompt at all. A chat's approvals
 *   are a queue a `send` cannot answer, so `send_to_agent` takes chats only.
 * - **Nothing is spliced into a plan line unchecked.** `send_to_agent`,
 *   `read_panel` and `open_review` run as `tc plan` lines, and a plan splits
 *   on `;` — a message carrying one would become a second step. Panel ids
 *   are matched against a closed pattern and text with a `;`, a control
 *   character or a direction override is refused by name. (The plan parser
 *   collapses whitespace runs to one space; the tool's description says so.)
 * - **The SDK is confined to this file.** Like every library here it has one
 *   door (`src/renderer/CLAUDE.md`'s table): the server is built from the
 *   low-level `Server` with plain JSON Schema, so no zod schema is minted
 *   outside `shared/workflow-graph-schema.ts`.
 *
 * Pure over an injected `connect`, like `tc.ts`, so `verify:mcp` drives it
 * with the SDK's own client against a fake control server under plain node.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { outward } from '../shared/outward'
import { ask, type Connect, type SocketAnswer } from './tc'

interface ToolCtx {
  env: Record<string, string | undefined>
  /** One request over the socket; the reply parsed, or why there was none. */
  send: (line: string) => Promise<SocketAnswer>
}


export interface McpToolDef {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false }
  /**
   * MCP's own hints, so a client can show a write as a write. They are
   * advice to the client and never the gate: the gate is the socket's.
   */
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint: false }
  run: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<SocketAnswer | { kind: 'refused'; error: string }>
}

/** A panel id as the renderer mints them; anything else never reaches a plan line. */
const PANEL_ID = /^[A-Za-z0-9._:-]{1,128}$/

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)

function panelArg(args: Record<string, unknown>): { ok: true; id: string } | { ok: false; error: string } {
  const id = str(args['panel'])
  if (id === undefined) return { ok: false, error: 'panel is required — canvas_status lists the ids' }
  if (!PANEL_ID.test(id)) return { ok: false, error: `${JSON.stringify(id.slice(0, 40))} is not a panel id — canvas_status lists the ids` }
  return { ok: true, id }
}

/**
 * A message that will ride a plan line. `;` separates plan steps and a plan
 * line is one line, so either would change what runs; refused by name with
 * the fix rather than rewritten, because a message silently altered on its
 * way to an agent is worse than one that was not sent.
 */
function planText(v: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const text = str(v)
  if (text === undefined) return { ok: false, error: 'text is required' }
  if (text.includes(';')) return { ok: false, error: 'text may not contain ";" — it separates plan steps; use a comma or send it in two messages' }
  // C0 and C1 controls, the line and paragraph separators, and the bidi
  // overrides that make a line read differently from what it sends.
  if (/[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(text)) return { ok: false, error: 'text must be one line with no control or direction-override characters' }
  if (Buffer.byteLength(text, 'utf8') > 4000) return { ok: false, error: 'text is longer than 4000 bytes' }
  return { ok: true, text }
}

const line = (fields: Record<string, unknown>): string => JSON.stringify(fields)

/** The plan door carries the panel's token when `tc mcp` itself runs inside a panel (M180's rule). */
const planLine = (plan: string, env: Record<string, string | undefined>): string => {
  const token = env['TC_PANEL_TOKEN']
  return line({ verb: 'plan', line: plan, ...(token === undefined || token === '' ? {} : { token }) })
}

const refused = (error: string): { kind: 'refused'; error: string } => ({ kind: 'refused', error })

const READ = { readOnlyHint: true, openWorldHint: false } as const

/**
 * The status model's attention words. Copied from the vocabulary rather
 * than spelled here: `verify:mcp mcp.attention.1` derives both from
 * `panelState` itself, so a renamed word turns that check red instead of
 * emptying this queue with no symptom.
 */
export const ATTENTION_WORDS = { needsYou: 'needs you', failed: /^exited [1-9][0-9]*$/ } as const

export const MCP_TOOLS: readonly McpToolDef[] = [
  {
    name: 'canvas_status',
    description: 'Every panel on the Terminal Canvas with its kind, title and state word (needs you, working, idle, exited N…), plus the edges between panels and the workflow runs. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
    run: (_args, ctx) => ctx.send(line({ verb: 'status' }))
  },
  {
    name: 'list_sessions',
    description: 'The running terminal sessions (panel id, pid, command, directory). A sleeping card has no session and is not listed. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
    run: (_args, ctx) => ctx.send(line({ verb: 'list' }))
  },
  {
    name: 'attention_queue',
    description: 'What is waiting on a person: panels that need you (a question or a permission prompt) first, then panels whose process failed. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
    run: async (_args, ctx) => {
      const answer = await ctx.send(line({ verb: 'status' }))
      if (answer.kind !== 'reply' || answer.reply['ok'] !== true) return answer
      const raw = (answer.reply['canvas'] as { panels?: unknown } | undefined)?.panels
      const panels = Array.isArray(raw) ? (raw as Array<{ id: string; kind: string; title?: string; state: string }>) : []
      const needs = panels.filter((p) => p.state === ATTENTION_WORDS.needsYou)
      const failed = panels.filter((p) => ATTENTION_WORDS.failed.test(p.state))
      const queue = [...needs, ...failed].map((p) => ({ id: p.id, kind: p.kind, ...(p.title === undefined ? {} : { title: p.title }), state: p.state }))
      return { kind: 'reply', reply: { ok: true, queue, ...(typeof answer.reply['note'] === 'string' ? { note: answer.reply['note'] } : {}), ...(queue.length === 0 ? { empty: 'nothing is waiting on a person' } : {}) } }
    }
  },
  {
    name: 'decision_audit',
    description: 'What a person decided, newest first: permissions allowed or denied, plans approved, reviews marked. Read-only.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'How many rows; default 50.' } }, additionalProperties: false },
    annotations: READ,
    run: async (args, ctx) => {
      const limit = args['limit']
      if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 1000)) return refused('limit must be a whole number from 1 to 1000')
      return ctx.send(line({ verb: 'audit', ...(limit === undefined ? {} : { limit }) }))
    }
  },
  {
    name: 'read_panel',
    description: 'A panel\'s recent output (a browser panel\'s page text), secrets redacted. Read-only.',
    inputSchema: { type: 'object', properties: { panel: { type: 'string', description: 'The panel id, from canvas_status.' } }, required: ['panel'], additionalProperties: false },
    annotations: READ,
    run: async (args, ctx) => {
      const p = panelArg(args)
      if (!p.ok) return refused(p.error)
      return ctx.send(planLine(`read ${p.id}`, ctx.env))
    }
  },
  {
    name: 'focus_panel',
    description: 'Fly the canvas to a running panel so the person at the screen sees it. Changes only the view.',
    inputSchema: { type: 'object', properties: { panel: { type: 'string', description: 'The panel id, from list_sessions.' } }, required: ['panel'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: async (args, ctx) => {
      const p = panelArg(args)
      if (!p.ok) return refused(p.error)
      return ctx.send(line({ verb: 'focus', id: p.id }))
    }
  },
  {
    name: 'propose_task',
    description: 'Bring a task to the canvas: the Start work sheet opens filled in, and a person presses Start. Nothing is started by this call.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'One line.' },
        brief: { type: 'string', description: 'What the work is, in prose.' },
        criteria: { type: 'array', items: { type: 'string' }, description: 'How a person will know it is done, one per item.' },
        cwd: { type: 'string', description: 'The absolute path of the repository to work in.' },
        swarm: { type: 'string', enum: ['explore', 'implement', 'test', 'review'], description: 'An arrangement to propose with it.' }
      },
      required: ['title'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: async (args, ctx) => {
      const title = str(args['title'])
      if (title === undefined) return refused('a task needs a title')
      const fields: Record<string, unknown> = { verb: 'task', title }
      for (const k of ['brief', 'cwd', 'swarm'] as const) if (str(args[k]) !== undefined) fields[k] = args[k]
      // A list, or one-per-line text — the two forms the protocol takes.
      const criteria = args['criteria']
      if (Array.isArray(criteria)) fields['criteria'] = criteria.filter((c): c is string => typeof c === 'string')
      else if (typeof criteria === 'string') fields['criteria'] = criteria.split('\n')
      return ctx.send(line(fields))
    }
  },
  {
    name: 'send_to_agent',
    description: 'Send a message to a chat agent on the canvas; it queues behind a turn in flight. Chats only: a terminal is refused, because typing Enter into one can answer its permission prompt. Runs of whitespace are sent as one space.',
    inputSchema: {
      type: 'object',
      properties: { panel: { type: 'string', description: 'The agent panel id, from canvas_status.' }, text: { type: 'string', description: 'One line, without ";".' } },
      required: ['panel', 'text'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    run: async (args, ctx) => {
      const p = panelArg(args)
      if (!p.ok) return refused(p.error)
      const t = planText(args['text'])
      if (!t.ok) return refused(t.error)
      // Only the canvas knows the kind, and the plan door would refuse a
      // `send` to a terminal anyway; asking first names the reason here.
      const status = await ctx.send(line({ verb: 'status' }))
      if (status.kind !== 'reply' || status.reply['ok'] !== true) return status
      const raw = (status.reply['canvas'] as { panels?: unknown } | undefined)?.panels
      const panels = Array.isArray(raw) ? (raw as Array<{ id: string; kind: string }>) : []
      const panel = panels.find((x) => x.id === p.id)
      if (panel === undefined) return refused(`no panel ${p.id} on the canvas — canvas_status lists the ids`)
      if (panel.kind !== 'chat') return refused(`${p.id} is a ${panel.kind}, not a chat — a message is typed into a terminal by the person at the screen, because Enter there can answer a permission prompt`)
      return ctx.send(planLine(`send ${p.id} ${t.text}`, ctx.env))
    }
  },
  {
    name: 'open_review',
    description: 'Open the review for a work card\'s lane beside its task, for the person to read. Opens it only; nothing is accepted.',
    inputSchema: { type: 'object', properties: { panel: { type: 'string', description: 'The work card or any panel of the task.' } }, required: ['panel'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    run: async (args, ctx) => {
      const p = panelArg(args)
      if (!p.ok) return refused(p.error)
      return ctx.send(planLine(`review-task ${p.id}`, ctx.env))
    }
  }
]

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError: boolean
}

/**
 * One call, start to finish: validate, ask the socket, scrub. Exported apart
 * from the server so the check can hold the scrub to account without a
 * transport, and so a refusal before the socket is provably a refusal that
 * sent nothing.
 */
/**
 * Every string in a reply through `outward`, BEFORE it is serialised (the
 * header's `\b` reason), keys included; the count summed across them.
 */
export function scrubDeep(value: unknown, source: string): { value: unknown; redacted: number } {
  let redacted = 0
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') { const g = outward(v, source); redacted += g.redacted; return g.text }
    if (Array.isArray(v)) return v.map(walk)
    if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [walk(k) as string, walk(x)]))
    return v
  }
  return { value: walk(value), redacted }
}

export async function callTool(name: string, args: Record<string, unknown>, deps: { env: Record<string, string | undefined>; connect: Connect }): Promise<ToolResult> {
  const SOURCE = 'terminal canvas'
  const say = (value: unknown, isError: boolean): ToolResult => {
    const deep = scrubDeep(value, SOURCE)
    const text = typeof deep.value === 'string' ? deep.value : JSON.stringify(deep.value, null, 2)
    // A backstop over the serialised text too; the count rides the answer,
    // as every other outward reader says it.
    const gate = outward(text, SOURCE)
    const n = deep.redacted + gate.redacted
    const body = n === 0 ? gate.text : `${gate.text}\n(from ${SOURCE} · ${n} secret${n === 1 ? '' : 's'} redacted)`
    return { content: [{ type: 'text', text: body }], isError }
  }
  const tool = MCP_TOOLS.find((t) => t.name === name)
  if (tool === undefined) return say(`no tool named ${JSON.stringify(name)}`, true)
  const ctx: ToolCtx = { env: deps.env, send: (l) => ask(l, deps.env, deps.connect) }
  // A throw leaves through the same gate, never as the SDK's raw error.
  let answer: Awaited<ReturnType<McpToolDef['run']>>
  try {
    answer = await tool.run(args, ctx)
  } catch (error: unknown) {
    return say(`${name} failed: ${String(error)}`, true)
  }
  if (answer.kind === 'refused') return say(answer.error, true)
  if (answer.kind === 'down') return say(answer.error, true)
  const reply = answer.reply
  if (reply['ok'] !== true) return say(typeof reply['error'] === 'string' ? reply['error'] : reply, true)
  const { ok: _ok, ...rest } = reply
  return say(rest, false)
}

export const MCP_INSTRUCTIONS = [
  'Terminal Canvas: a canvas of agents, terminals, notes and reviews that a person arranges.',
  'Start with canvas_status or attention_queue. Panel ids come from canvas_status.',
  'propose_task and open_review put something in front of the person; they never start or accept work themselves.',
  'send_to_agent reaches chats only. A panel that needs you is waiting on a person.'
].join(' ')

export function createMcpServer(deps: { env: Record<string, string | undefined>; connect: Connect; version: string }): Server {
  const server = new Server({ name: 'terminal-canvas', version: deps.version }, { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations }))
  }))
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = (req.params.arguments ?? {}) as Record<string, unknown>
    return callTool(req.params.name, args, deps) as unknown as Record<string, unknown>
  })
  return server
}
