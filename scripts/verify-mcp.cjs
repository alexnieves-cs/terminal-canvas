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
  let writesOn = false
  let teamWaits = false
  let recordLands = true
  const votes = []
  const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const pending = [{ panelId: 'c1', requestId: 'r1', toolName: 'Bash', description: `run deploy with ${PLANTED}` }, { panelId: 'c1', requestId: 'r2', toolName: 'Edit' }, { panelId: 'c1', requestId: 'tc-ext-7', toolName: 'github write' }]
  const answered = []
  const merges = []
  const recorded = []
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
    // M488. The gated writes, over fakes that say what they were asked.
    remote: {
      writesAllowed: () => writesOn,
      // The real wiring filters the broker's `tc-ext-` asks; the fake does the
      // same, and gate.5 holds the HANDLER to refusing one it is not offered.
      approvals: () => pending.filter((p) => !p.requestId.startsWith('tc-ext-')).map((p) => ({ ...p })),
      answer: (panelId, requestId, allow, toolName) => {
        if (teamWaits) { votes.push({ requestId, allow }); return 'waiting' }
        const i = pending.findIndex((p) => p.panelId === panelId && p.requestId === requestId)
        if (i === -1) return 'gone'
        pending.splice(i, 1); answered.push({ panelId, requestId, allow, toolName }); return 'answered'
      },
      knownLane: (lane) => lane === '/repo/.worktrees/fix',
      laneMerge: async (req) => {
        merges.push(req)
        if (req.dryRun) return { kind: 'ready', branch: 'tc/fix', into: 'main', commits: 2, head: HEAD, root: '/repo' }
        return req.expectHead === HEAD ? { kind: 'merged', branch: 'tc/fix', into: 'main', commits: 2, sha: 'def5678' } : { kind: 'moved' }
      },
      record: async (row) => { recorded.push(row); return recordLands }
    },
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
    const expected = ['accept_review', 'answer_approval', 'attention_queue', 'canvas_status', 'decision_audit', 'focus_panel', 'list_approvals', 'list_sessions', 'open_review', 'propose_task', 'read_panel', 'send_to_agent']
    const reads = listed.filter((t) => t.annotations?.readOnlyHint === true).map((t) => t.name).sort()
    ok('mcp.tools.1 an SDK client lists every tool with an object schema, and exactly the read tools are marked read-only',
      JSON.stringify(names) === JSON.stringify(expected) && listed.every((t) => t.inputSchema?.type === 'object' && typeof t.description === 'string' && t.description.length > 20) &&
        JSON.stringify(reads) === JSON.stringify(['attention_queue', 'canvas_status', 'decision_audit', 'list_approvals', 'list_sessions', 'read_panel']),
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

  // gate.1 — every MCP write is refused BY NAME while the setting is off,
  // and nothing is answered, merged or recorded; the reads still answer
  // (scrubbed), and the merge's dry run, which only reads, is not gated.
  {
    writesOn = false
    const list = await call('list_approvals')
    const ans = await call('answer_approval', { panel: 'c1', request: 'r1', allow: true })
    const dry = await call('accept_review', { lane: '/repo/.worktrees/fix' })
    const acc = await call('accept_review', { lane: '/repo/.worktrees/fix', expect_head: HEAD })
    ok('gate.1 with MCP writes off, answer_approval and a real accept_review are refused naming the setting, and nothing is answered, merged or recorded; list_approvals and the dry run answer',
      !list.isError && /"r1"/.test(list.text) && !list.text.includes(PLANTED) &&
        ans.isError && /MCP writes are off/.test(ans.text) && /Settings/.test(ans.text) && acc.isError && /MCP writes are off/.test(acc.text) &&
        !dry.isError && dry.text.includes(HEAD) && answered.length === 0 && merges.every((m) => m.dryRun === true) && recorded.length === 0,
      JSON.stringify({ list, ans, dry, acc, answered, merges, recorded }))
  }

  // gate.2 — with the setting on, an answer reaches the chat once and lands
  // on the decision record as the person's, naming the MCP client; a request
  // that is not waiting is refused by name; an accept merges only at the head
  // the dry run named, and its row is recorded too.
  {
    writesOn = true
    const ans = await call('answer_approval', { panel: 'c1', request: 'r1', allow: false })
    const again = await call('answer_approval', { panel: 'c1', request: 'r1', allow: true })
    const moved = await call('accept_review', { lane: '/repo/.worktrees/fix', expect_head: 'ffffffffffffffffffffffffffffffffffffffff' })
    const acc = await call('accept_review', { lane: '/repo/.worktrees/fix', expect_head: HEAD, title: 'fix login' })
    const rows = recorded.map((r) => `${r.event}:${r.source}:${r.title}`)
    ok('gate.2 with MCP writes on, a deny reaches the chat once and is recorded as a permission row naming the MCP client; a repeat is refused; a moved lane is refused and merges nothing; a merge at the dry run\'s head is recorded',
      !ans.isError && /denied/.test(ans.text) && JSON.stringify(answered) === JSON.stringify([{ panelId: 'c1', requestId: 'r1', allow: false, toolName: 'Bash' }]) &&
        again.isError && /no permission request r1/.test(again.text) && moved.isError && /moved/.test(moved.text) &&
        !acc.isError && /def5678/.test(acc.text) && merges.filter((m) => !m.dryRun).map((m) => m.expectHead).join() === `ffffffffffffffffffffffffffffffffffffffff,${HEAD}` &&
        rows.length === 2 && rows[0] === 'permission:person:Denied Bash, through an MCP client' && /^check:person:Accepted tc\/fix into main, through an MCP client$/.test(rows[1]),
      JSON.stringify({ ans, again, moved, acc, rows }))
  }

  // gate.5 — the person's path, not a shortcut around it: the broker's
  // credential ask is never listed nor answerable; past the team's spend line
  // an MCP answer is one vote ('counted', nothing recorded as decided); only
  // a lane this canvas made can be accepted; a record that did not land is
  // SAID in the reply; a short sha is refused before any merge is tried.
  {
    writesOn = true
    const list = await call('list_approvals')
    const ext = await call('answer_approval', { panel: 'c1', request: 'tc-ext-7', allow: true })
    teamWaits = true
    const before = recorded.length
    const vote = await call('answer_approval', { panel: 'c1', request: 'r2', allow: true })
    teamWaits = false
    const stray = await call('accept_review', { lane: '/elsewhere/wt', expect_head: HEAD })
    const strayDry = await call('accept_review', { lane: '/elsewhere/wt' })
    const short = await call('accept_review', { lane: '/repo/.worktrees/fix', expect_head: 'abc1234' })
    recordLands = false
    const unrecorded = await call('answer_approval', { panel: 'c1', request: 'r2', allow: true })
    recordLands = true
    writesOn = false
    ok('gate.5 a credential ask is neither listed nor answerable; past the spend line an answer is a counted vote with nothing recorded; a lane the canvas did not make is refused, dry run included; a short sha is refused; a record that did not land is said',
      !list.text.includes('tc-ext-7') && ext.isError && /approvals lists them/.test(ext.text) &&
        !vote.isError && /counted/.test(vote.text) && votes.length === 1 && recorded.length === before + 1 &&
        stray.isError && /not a lane this canvas made/.test(stray.text) && strayDry.isError && /not a lane/.test(strayDry.text) &&
        short.isError && /full commit/.test(short.text) && !unrecorded.isError && /could not be written/.test(unrecorded.text),
      JSON.stringify({ list: list.text, ext, vote, votes, stray, strayDry, short, unrecorded }))
  }

  // gate.3 — an agent inside a panel never answers or accepts, setting on or
  // not: `tc mcp` run with a panel's token is refused by name at the handler.
  {
    writesOn = true
    const inPanel = M.createMcpServer({ env: { TC_CONTROL_SOCKET: path, TC_PANEL_TOKEN: 'tok-1' }, connect, version: 'test' })
    const [c3, s3] = InMemoryTransport.createLinkedPair()
    await inPanel.connect(s3)
    const cl = new Client({ name: 'verify-mcp-panel', version: '0' })
    await cl.connect(c3)
    const before = answered.length
    const a = await cl.callTool({ name: 'answer_approval', arguments: { panel: 'c1', request: 'r2', allow: true } })
    const m = await cl.callTool({ name: 'accept_review', arguments: { lane: '/repo/.worktrees/fix', expect_head: HEAD } })
    ok('gate.3 an MCP client running inside a panel (its token rides) is refused for both writes even with the setting on, and nothing is answered',
      a.isError === true && /inside a panel/.test(a.content[0].text) && m.isError === true && /inside a panel/.test(m.content[0].text) && answered.length === before,
      JSON.stringify({ a, m }))
    await cl.close()
    writesOn = false
  }

  // gate.4 — the gate cannot be opened from the agent side: the setting is
  // off by default and not plan-writable (a plan that set it would be an
  // agent granting itself its own approvals), and the URL door refuses the
  // write verbs; the parser refuses an answer that does not SAY allow or deny.
  {
    const def = M.settingDef('remote.mcpWrites')
    const viaPlan = M.buildPlan(M.parsePlanLine('set-setting remote.mcpWrites on'), { panels: [] })
    const url = M.parseControlUrl('terminal-canvas://answer?panelId=c1&requestId=r1&allow=true')
    const noAllow = M.parseControlLine(JSON.stringify({ verb: 'answer', panelId: 'c1', requestId: 'r1' }))
    const strAllow = M.parseControlLine(JSON.stringify({ verb: 'answer', panelId: 'c1', requestId: 'r1', allow: 'yes' }))
    const badHead = M.parseControlLine(JSON.stringify({ verb: 'accept', lane: '/x', expectHead: 'HEAD; rm' }))
    const relLane = M.parseControlLine(JSON.stringify({ verb: 'accept', lane: 'x' }))
    ok('gate.4 remote.mcpWrites defaults off and is not plan-writable (a plan setting it is refused), the URL door refuses answer, and the parser refuses an answer without a boolean allow, a non-sha head and a relative lane',
      def !== undefined && def.default === false && def.type === 'boolean' && def.planWritable === undefined && viaPlan.kind === 'refused' && /not a setting a plan may write/.test(viaPlan.reason) &&
        url.kind === 'bad' && noAllow.kind === 'bad' && strAllow.kind === 'bad' && badHead.kind === 'bad' && relLane.kind === 'bad',
      JSON.stringify({ def, viaPlan, url, noAllow, strAllow, badHead, relLane }))
  }

  // push.1 — what leaves for the phone passes outward and carries no path
  // and no token shape: a label that IS a path and holds a token comes out
  // as a basename and a placeholder, and a chat's question keeps its words.
  {
    const nasty = `~/Users/alex/work/secret-client/api ${PLANTED} C:\\Users\\alex\\proj ../rel/dir https://h.example/a/b`
    const term = M.phonePayload('tc-abc', nasty)
    const chat = M.phonePayload('tc-abc', 'claude asks to run Bash', `reviewer at /Users/alex/repo needs you ${PLANTED}`)
    // The critic's inputs: a credential in a path-less URL, a bearer token
    // glued by a control character the scrub's \s does not match, a path
    // with spaces, slash look-alikes, a zero-width split token, and a
    // terminal whose command line carries a connection string.
    const hard = [
      'psql postgres://admin:hunter2@db.internal:5432',
      'https://user:s3cret@example.com',
      'Bearer\x1fabcdefghijklmnopqrstuvwxyz0123',
      'reviewer at /Users/John Smith/acme-secret/repo',
      '/Users\u2215alice\u2215client-acme',
      `token ${PLANTED.slice(0, 10)}\u200b${PLANTED.slice(10)}`
    ].map((t) => M.phoneText(t).text)
    const psqlTerm = M.phonePayload('tc-abc', 'psql postgres://admin:hunter2@db.internal:5432/app')
    const flat = JSON.stringify([term, chat, hard, psqlTerm])
    const pathShape = /(^|[\s"])(~|\.{1,2})?[\/\\][^\s"]/
    const tokenLeft = M.redactSecrets(flat).count
    ok('push.1 a phone payload passes outward and carries no path or token shape — a path label becomes its basename, a token a placeholder — and keeps the vocabulary\'s sentence and the question',
      !flat.includes(PLANTED) && tokenLeft === 0 && !/hunter2|s3cret|admin:|abcdefghijklmnop|John|Smith|acme-secret|alice/.test(flat) && hard[4] === 'client-acme' &&
        hard[3] === 'reviewer at repo' && psqlTerm.message === 'psql needs you' && !pathShape.test(term.message) && !pathShape.test(chat.message) && !/alex|Users|work\b/.test(flat) &&
        /api/.test(term.message) && /needs you/.test(term.message) && term.title === 'Terminal Canvas' && chat.title === 'claude asks to run Bash' && /^reviewer at repo needs you/.test(chat.message) &&
        Object.keys(term).sort().join() === 'message,priority,tags,title,topic',
      JSON.stringify({ term, chat }))
  }

  // push.2 — the decision: off with no topic, refused for a topic outside the
  // closed pattern or a server that is not https, held while the Mac is in
  // use, and throttled per panel and per hour.
  {
    const base = { topic: 'tc-abc', server: 'https://ntfy.sh', idleMinutes: 3 }
    const d = (settings, extra = {}) => M.decide({ settings: { ...base, ...settings }, label: 'reviewer', panelId: 'p1', idleSeconds: 600, now: 10_000_000, sent: [], ...extra })
    const off = d({ topic: '' })
    const badTopic = d({ topic: 'a/b' })
    const http = d({ server: 'http://ntfy.sh' })
    const creds = d({ server: 'https://u:p@ntfy.sh' })
    const busy = d({}, { idleSeconds: 30 })
    const zero = d({ idleMinutes: 0 }, { idleSeconds: 0 })
    const recent = d({}, { sent: [{ panelId: 'p1', at: 10_000_000 - 60_000 }] })
    const other = d({}, { sent: [{ panelId: 'p2', at: 10_000_000 - 60_000 }] })
    const hourly = d({}, { sent: Array.from({ length: M.HOURLY_MAX }, (_, i) => ({ panelId: `q${i}`, at: 10_000_000 - 1000 * i })) })
    const send = d({ server: 'https://push.example.org/base' })
    const nan = d({ idleMinutes: NaN }, { idleSeconds: 30 })
    ok('push.2 off with no topic; refused for a bad topic, http or a server with credentials; held while the Mac is in use (0 minutes pushes at once); throttled per panel and per hour; the topic rides the body, never the URL',
      off.reason === 'off' && badTopic.reason === 'bad-topic' && http.reason === 'bad-server' && creds.reason === 'bad-server' && busy.reason === 'not-idle' &&
        zero.kind === 'send' && recent.reason === 'throttled' && other.kind === 'send' && hourly.reason === 'throttled' && nan.reason === 'not-idle' &&
        send.kind === 'send' && send.url === 'https://push.example.org/base/' && !send.url.includes('tc-abc') && send.payload.topic === 'tc-abc',
      JSON.stringify({ off, badTopic, http, creds, busy, zero, recent, other, hourly, send }))
  }

  // push.3 — the sender: one JSON POST per entry, throttled on the second
  // entry of the same panel, a failed network answered as 'failed' without a
  // throw, and the test push (past the idle rule) reaching the socket as
  // `tc phone-test`.
  {
    const posts = []
    let fail = false
    let idle = 600
    let clock = 50_000_000
    const settings = { topic: 'tc-abc', server: 'https://ntfy.sh', idleMinutes: 3 }
    const alerts = M.createPhoneAlerts({
      settings: () => settings, idleSeconds: () => idle, now: () => clock,
      post: async (url, init) => { if (fail) throw new Error('offline'); posts.push({ url, init }); return { ok: true, status: 200 } }
    })
    const first = await alerts.entered('p1', 'reviewer')
    const second = await alerts.entered('p1', 'reviewer')
    idle = 10
    const busy = await alerts.entered('p2', 'writer')
    idle = 600; fail = true
    const down = await alerts.entered('p3', 'tester')
    fail = false
    const test = await alerts.test()
    const testAgain = await alerts.test()
    clock += 61_000
    const testLater = await alerts.test()
    const body = posts[0] && JSON.parse(posts[0].init.body)
    // The socket door, over a handler whose test push is this sender's.
    const h = M.createControlHandler({ presets: () => [], defaultId: () => null, exists: () => true, spawn: () => {}, list: () => [], focus: () => false, phoneTest: () => alerts.test() })
    clock += 61_000
    const viaSocket = await h({ verb: 'phone-test' })
    const noTopic = await M.createPhoneAlerts({ settings: () => ({ ...settings, topic: '' }), idleSeconds: () => 600, post: async () => ({ ok: true, status: 200 }) }).test()
    const built = M.buildRequest(['phone-test'])
    ok('push.3 one JSON POST to the server root per entry; the same panel again is throttled; an in-use Mac holds it; a network failure answers failed without a throw; the test push sends past the idle rule and is reachable as tc phone-test, and refused by name with no topic',
      first === 'send' && second === 'throttled' && busy === 'not-idle' && down === 'failed' && test.ok === true &&
        testAgain.ok === false && /less than a minute/.test(testAgain.reason) && testLater.ok === true && posts[0].init.redirect === 'error' &&
        posts[0].url === 'https://ntfy.sh/' && posts[0].init.method === 'POST' && posts[0].init.headers['Content-Type'] === 'application/json' && body.topic === 'tc-abc' && /reviewer/.test(body.message) &&
        viaSocket.ok === true && noTopic.ok === false && /topic/.test(noTopic.reason) && built.kind === 'ok' && JSON.parse(built.line).verb === 'phone-test' &&
        M.parseControlUrl('terminal-canvas://phone-test').kind === 'bad',
      JSON.stringify({ first, second, busy, down, test, posts: posts.length, viaSocket, noTopic }))
  }

  // push.5 — the walked-away case: an item that entered while the window was
  // in front (no entry push) reaches the phone ONCE per waiting spell when
  // the Mac goes idle, as a count; not while in use, not twice, and again
  // only after the spell ends and a new one starts.
  {
    const posts = []
    let idle = 0
    const a = M.createPhoneAlerts({ settings: () => ({ topic: 'tc-abc', server: 'https://ntfy.sh', idleMinutes: 3 }), idleSeconds: () => idle, now: () => 1_000_000, post: async (url, init) => { posts.push(JSON.parse(init.body)); return { ok: true, status: 200 } } })
    const empty = await a.tick()
    a.waiting(2)
    const present = await a.tick()
    idle = 600
    const away = await a.tick()
    const again = await a.tick()
    a.waiting(0); a.waiting(1)
    const next = await a.tick()
    const b = M.createPhoneAlerts({ settings: () => ({ topic: 'tc-abc', server: 'https://ntfy.sh', idleMinutes: 0 }), idleSeconds: () => 0, post: async () => ({ ok: true, status: 200 }) })
    b.waiting(1)
    await b.entered('p1', 'claude')
    const afterNamed = await b.tick()
    ok('push.5 a waiting spell the entry push missed reaches the phone once, as a count, when the Mac goes idle — not while in use, not twice, again after a new spell, and not after a named push already went',
      empty === 'skip' && present === 'skip' && away === 'send' && again === 'skip' && next === 'send' && afterNamed === 'skip' &&
        posts.length === 2 && posts[0].message === '2 panels need you' && posts[1].message === '1 panel needs you',
      JSON.stringify({ empty, present, away, again, next, afterNamed, posts }))
  }

  // push.4 — the phone settings are the person's: off by default, none
  // writable by a plan (an agent never chooses where this app sends words).
  {
    const ids = ['remote.ntfyTopic', 'remote.ntfyServer', 'remote.alertIdleMinutes']
    const defs = ids.map((id) => M.settingDef(id))
    const plans = ids.map((id) => M.buildPlan(M.parsePlanLine(`set-setting ${id} x`), { panels: [] }))
    ok('push.4 the phone settings exist, the topic defaults empty (off) and the server to https://ntfy.sh, and a plan may write none of them',
      defs.every((d) => d !== undefined && d.planWritable === undefined) && defs[0].default === '' && defs[1].default === 'https://ntfy.sh' && defs[2].type === 'number' &&
        plans.every((p) => p.kind === 'refused'),
      JSON.stringify({ defs, plans }))
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
      pass = tools === 12 && r.isError !== true && /"t1"/.test(r.content[0].text)
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
