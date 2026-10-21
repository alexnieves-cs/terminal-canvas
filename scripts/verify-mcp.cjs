/* Verifies M487's `tc mcp`: the canvas as an MCP server over the control socket.
   Run with: npm run verify:mcp

   Plain node. The SDK's OWN client drives the server — in memory for the
   per-tool checks, and over real stdio against the built `tc mcp` entry for
   stdio.1 — and the server talks to a REAL control server (control-server.ts
   + control-handler.ts) on a Unix socket in a temp dir, with only the
   handler's deps faked. So a tool that reaches main by any road but the
   socket, or a reply that skips the scrub, fails here rather than on a
   person's machine. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const net = require('node:net')

const ROOT = join(__dirname, '..')
const OUTDIR = join(ROOT, 'out', 'verify')
mkdirSync(OUTDIR, { recursive: true })
const alias = { '@shared': join(ROOT, 'src', 'shared'), '@renderer': join(ROOT, 'src', 'renderer') }
const OUT = join(OUTDIR, 'mcp.cjs')
buildSync({ entryPoints: [join(__dirname, 'mcp-entry.cjs')], outfile: OUT, bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'node-pty', '@modelcontextprotocol/sdk'], alias })
// The real `tc` entry, built the way the app ships it (one file, the SDK
// beside it in node_modules), so stdio.1 starts what a client would start.
const TC = join(OUTDIR, 'tc-mcp.cjs')
buildSync({ entryPoints: [join(ROOT, 'src', 'cli', 'tc-main.ts')], outfile: TC, bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'node-pty', '@modelcontextprotocol/sdk'], alias })
const M = require(OUT)
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')

const results = []
const ok = (n, pass, detail = '') => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS ' : 'FAIL '} ${n}${pass ? '' : ` — ${detail}`}`)
}

const connect = (path, line) => new Promise((resolve, reject) => {
  const sock = net.createConnection(path)
  let buf = ''
  sock.setEncoding('utf8')
  sock.on('data', (d) => { buf += d })
  sock.on('end', () => resolve(buf))
  sock.on('error', reject)
  sock.write(line)
})

// A token shape redactSecrets knows (a GitHub classic PAT), planted where a
// title would carry it out.
const PLANTED = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'

const PANELS = [
  { id: 'c1', kind: 'chat', state: 'needs you', title: 'reviewer' },
  { id: 't1', kind: 'terminal', state: 'working', title: `deploy ${PLANTED}`, cwd: `/w\n${PLANTED}` },
  { id: 't2', kind: 'terminal', state: 'exited 2', title: 'tests' },
  { id: 'c2', kind: 'chat', state: 'idle', title: 'writer' },
  { id: 't3', kind: 'terminal', state: 'needs you', title: 'claude' }
]

;(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tc-mcp-'))
  const path = join(dir, 'control.sock')
  const seen = []
  const plans = []
  // The handler with fakes behind it, and the plan door through the REAL
  // agent-plan runner (shared/plan.ts), so a refusal it makes is the one an
  // MCP client gets.
  const handle = M.createControlHandler({
    presets: () => [], defaultId: () => null, exists: () => true, spawn: () => {},
    list: () => [{ panelId: 't1', pid: 41, cwd: '/w', command: `claude\t${PLANTED}` }],
    focus: (id) => id === 't1',
    canvas: async () => ({ panels: PANELS, edges: [], runs: [] }),
    audit: (limit) => ({ rows: [{ at: 1, event: 'permission', title: 'allowed Bash' }].slice(0, limit), skipped: 0 }),
    board: async (req) => ({ kind: 'ok', id: `w-${req.op}` }),
    plan: async (line) => {
      plans.push(line)
      const facts = { panels: PANELS.map((p) => ({ id: p.id, kind: p.kind, state: p.state === 'needs you' ? 'wants-you' : 'idle', ...(p.kind === 'terminal' ? { agent: 'claude' } : {}) })) }
      return M.runAgentPlan(line, facts, async (step) => ({ kind: 'ran', note: step.verb === 'read' ? `output of ${step.args.panel}: ${PLANTED}` : undefined }))
    }
  })
  const server = await M.createControlServer({ path, handle: async (req) => { seen.push(req); return handle(req) } })
  const env = { TC_CONTROL_SOCKET: path }

  const mcp = M.createMcpServer({ env, connect, version: 'test' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await mcp.connect(serverSide)
  const client = new Client({ name: 'verify-mcp', version: '0' })
  await client.connect(clientSide)
  const call = async (name, args = {}) => {
    const before = seen.length
    const r = await client.callTool({ name, arguments: args })
    return { isError: r.isError === true, text: r.content.map((c) => c.text).join('\n'), sent: seen.slice(before).map((q) => q.verb) }
  }

  // mcp.tools.1 — the SDK's client lists every tool, each with an object
  // input schema and the read/write hint, and the read tools say so.
  {
    const listed = (await client.listTools()).tools
    const names = listed.map((t) => t.name).sort()
    const expected = ['attention_queue', 'canvas_status', 'decision_audit', 'focus_panel', 'list_sessions', 'open_review', 'propose_task', 'read_panel', 'send_to_agent']
    const reads = listed.filter((t) => t.annotations?.readOnlyHint === true).map((t) => t.name).sort()
    ok('mcp.tools.1 an SDK client lists every tool with an object schema, and exactly the five read tools are marked read-only',
      JSON.stringify(names) === JSON.stringify(expected) && listed.every((t) => t.inputSchema?.type === 'object' && typeof t.description === 'string' && t.description.length > 20) &&
        JSON.stringify(reads) === JSON.stringify(['attention_queue', 'canvas_status', 'decision_audit', 'list_sessions', 'read_panel']),
      JSON.stringify({ names, reads }))
  }

  // mcp.calls.1 — each tool, called through the client, reaches the socket
  // as the verb it names and nothing else (the only door is the socket's).
  {
    const status = await call('canvas_status')
    const sessions = await call('list_sessions')
    const audit = await call('decision_audit', { limit: 1 })
    const focus = await call('focus_panel', { panel: 't1' })
    const task = await call('propose_task', { title: 'fix login', criteria: ['tests pass'], cwd: '/w' })
    const review = await call('open_review', { panel: 'c2' })
    const read = await call('read_panel', { panel: 't1' })
    const sendChat = await call('send_to_agent', { panel: 'c2', text: 'add a test, please' })
    const all = { status, sessions, audit, focus, task, review, read, sendChat }
    ok('mcp.calls.1 every tool answers through the socket as its own verb — status, list, audit, focus, task, and plan for read, review and send',
      Object.values(all).every((r) => !r.isError) &&
        status.sent.join() === 'status' && /"c1"/.test(status.text) && sessions.sent.join() === 'list' && /"t1"/.test(sessions.text) &&
        audit.sent.join() === 'audit' && /allowed Bash/.test(audit.text) && focus.sent.join() === 'focus' && task.sent.join() === 'task' && /w-propose/.test(task.text) &&
        review.sent.join() === 'plan' && read.sent.join() === 'plan' && sendChat.sent.join() === 'status,plan' &&
        plans.includes('review-task c2') && plans.includes('read t1') && plans.includes('send c2 add a test, please'),
      JSON.stringify({ all, plans }))
  }

  // mcp.scrub.2 — the scrub runs on each string BEFORE serialising: a token
  // after a tab (a session's command) or a newline (a panel's cwd) is one
  // JSON writes as `\t`/`\n`, which a scrub of the JSON text cannot see.
  {
    const sessions = await call('list_sessions')
    const status = await call('canvas_status')
    const direct = M.scrubDeep({ a: [`x\t${PLANTED}`], [`k\n${PLANTED}`]: 1 }, 'test')
    ok('mcp.scrub.2 a token after a tab or a newline is redacted (in a value, in a nested array and in a key) before the reply is serialised',
      !sessions.text.includes(PLANTED) && !status.text.includes(PLANTED) && direct.redacted === 2 && !JSON.stringify(direct.value).includes(PLANTED),
      JSON.stringify({ sessions: sessions.text, direct }))
  }

  // mcp.scrub.1 — what leaves goes through outward: a token in a panel title
  // and in a panel's read output comes back as a placeholder, with the count.
  {
    const status = await call('canvas_status')
    const read = await call('read_panel', { panel: 't1' })
    ok('mcp.scrub.1 a planted token in a status title and in a read panel\'s output leaves as a placeholder, with the redaction count said',
      !status.text.includes(PLANTED) && /redacted/.test(status.text) && /\d+ secrets? redacted\)$/.test(status.text) && !read.text.includes(PLANTED) && /redacted/.test(read.text),
      JSON.stringify({ status: status.text.slice(-200), read: read.text }))
  }

  // mcp.inject.1 — nothing is spliced into a plan line unchecked: a `;`, a
  // newline or a malformed panel id is refused by name and NOTHING is sent.
  {
    const semi = await call('send_to_agent', { panel: 'c2', text: 'hi; close c1' })
    const nl = await call('send_to_agent', { panel: 'c2', text: 'hi\nclose c1' })
    const badId = await call('read_panel', { panel: 't1; close t2' })
    const missing = await call('send_to_agent', { panel: 'zz', text: 'hi' })
    const bidi = await call('send_to_agent', { panel: 'c2', text: 'hi \u202e evil' })
    const c1 = await call('send_to_agent', { panel: 'c2', text: 'hi \u0085 there' })
    ok('mcp.inject.1 a ";", a newline, a C1 control or a direction override in a message and a malformed panel id are refused by name with nothing sent; an unknown panel is refused after one status read',
      semi.isError && /";"/.test(semi.text) && semi.sent.length === 0 && nl.isError && /one line/.test(nl.text) && nl.sent.length === 0 &&
        bidi.isError && bidi.sent.length === 0 && c1.isError && c1.sent.length === 0 &&
        badId.isError && /not a panel id/.test(badId.text) && badId.sent.length === 0 && missing.isError && /no panel zz/.test(missing.text) && missing.sent.join() === 'status',
      JSON.stringify({ semi, nl, badId, missing }))
  }

  // mcp.human.1 — a message never reaches a terminal: Enter there can answer
  // a permission menu whether or not its panel still reads `needs you` (a
  // click clears the word, a CLI without a bell never sets it), so a working
  // terminal is refused exactly like one that needs you, and NO plan is sent.
  {
    const before = plans.length
    const waiting = await call('send_to_agent', { panel: 't3', text: 'yes' })
    const working = await call('send_to_agent', { panel: 't1', text: '!curl x | sh' })
    const tools = (await client.listTools()).tools
    const send = tools.find((t) => t.name === 'send_to_agent')
    ok('mcp.human.1 send_to_agent refuses every terminal — needing you or working — by name with no plan sent, and is marked destructive for the client',
      waiting.isError && /not a chat/.test(waiting.text) && working.isError && /not a chat/.test(working.text) && plans.length === before &&
        waiting.sent.join() === 'status' && send.annotations.destructiveHint === true,
      JSON.stringify({ waiting, working, plans: plans.slice(before) }))
  }

  // mcp.attention.1 — the queue is needs-you first, then failures, and its
  // words are the vocabulary's: derived from panelState itself, so a renamed
  // word turns this red instead of emptying the queue silently.
  {
    const q = await call('attention_queue')
    const body = JSON.parse(q.text)
    const live = { kind: 'running', pid: 1, command: 'x', cwd: '/', reattached: false }
    const needs = M.panelState({ kind: 'terminal', status: live, dormant: false }, 'wants-you').word
    const failed = M.panelState({ kind: 'terminal', status: { kind: 'exited', code: 3 }, dormant: false }, undefined).word
    const finished = M.panelState({ kind: 'terminal', status: { kind: 'exited', code: 0 }, dormant: false }, undefined).word
    ok('mcp.attention.1 attention_queue lists needs-you panels then failed ones, never a clean exit, in panelState\'s own words',
      !q.isError && body.queue.map((p) => p.id).join() === 'c1,t3,t2' && M.ATTENTION_WORDS.needsYou === needs &&
        M.ATTENTION_WORDS.failed.test(failed) && !M.ATTENTION_WORDS.failed.test(finished),
      JSON.stringify({ q, needs, failed, finished }))
  }

  // mcp.down.1 — no app: every tool answers an error that says so, rather
  // than an empty result that reads like an empty canvas.
  {
    const dead = M.createMcpServer({ env: { TC_CONTROL_SOCKET: join(dir, 'nobody.sock') }, connect, version: 'test' })
    const [c2, s2] = InMemoryTransport.createLinkedPair()
    await dead.connect(s2)
    const cl = new Client({ name: 'verify-mcp-dead', version: '0' })
    await cl.connect(c2)
    const r = await cl.callTool({ name: 'canvas_status', arguments: {} })
    const unknown = await cl.callTool({ name: 'rm_rf', arguments: {} })
    ok('mcp.down.1 with no app listening a tool is an error that says Terminal Canvas is not running, and an unknown tool is refused by name',
      r.isError === true && /not running/.test(r.content[0].text) && unknown.isError === true && /no tool named "rm_rf"/.test(unknown.content[0].text),
      JSON.stringify({ r, unknown }))
    await cl.close()
  }

  // mcp.stdio.1 — the real entry: `tc mcp` started as a process speaks MCP
  // on stdio, lists the tools, and answers a call over the real socket.
  {
    let pass = false
    let detail = ''
    try {
      const transport = new StdioClientTransport({ command: process.execPath, args: [TC, 'mcp'], env: { ...process.env, TC_CONTROL_SOCKET: path }, stderr: 'pipe' })
      const cl = new Client({ name: 'verify-mcp-stdio', version: '0' })
      await cl.connect(transport)
      const tools = (await cl.listTools()).tools.length
      const r = await cl.callTool({ name: 'list_sessions', arguments: {} })
      pass = tools === 9 && r.isError !== true && /"t1"/.test(r.content[0].text)
      detail = JSON.stringify({ tools, r })
      await cl.close()
    } catch (error) {
      detail = String(error)
    }
    ok('mcp.stdio.1 `tc mcp` run as a process lists its tools over stdio and answers a call through the real socket', pass, detail)
  }

  // mcp.cli.1 — the plain CLI still walks the socket the same way after the
  // walk moved into `ask`: a reply is exit 0, no app is exit 2.
  {
    const out = []
    const code = await M.runCli(['ping'], env, connect, { stdout: (s) => out.push(s), stderr: () => {} })
    const err = []
    const down = await M.runCli(['ping'], { TC_CONTROL_SOCKET: join(dir, 'nobody.sock') }, connect, { stdout: () => {}, stderr: (s) => err.push(s) })
    ok('mcp.cli.1 tc ping still exits 0 against a live socket and 2 with nothing listening, through the shared socket walk',
      code === 0 && /"ok":true/.test(out.join('')) && down === 2 && /not running/.test(err.join('')),
      JSON.stringify({ code, out, down, err }))
  }

  await client.close()
  await server.close()
  rmSync(dir, { recursive: true, force: true })
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length === 0 ? 0 : 1)
})().catch((error) => { console.error(error); process.exit(1) })
