/* Verifies M54's control surface: the request parser both doors share, the
   `open` resolver, the Unix-socket server, and the CLI's exit codes.
   Run with: npm run verify:control

   Plain node. The server checks bind a REAL Unix socket in a temp dir —
   node's own net module, no Electron — because the failure that matters
   (a stale socket file refusing the bind, a world-readable socket) is a
   property of the filesystem, not of any argument list. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync, mkdtempSync, writeFileSync, statSync, existsSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const net = require('node:net')

const OUT = join(__dirname, '..', 'out', 'verify', 'control.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'control-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'node-pty'],
  alias: { '@shared': join(__dirname, '..', 'src', 'shared'), '@renderer': join(__dirname, '..', 'src', 'renderer') }
})
const C = require(OUT)

const results = []
const ok = (n, pass, detail = '') => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS ' : 'FAIL '} ${n}${pass ? '' : ` — ${detail}`}`)
}

;(async () => {
  const can = (name) => typeof C[name] === 'function'

  // protocol.1 — every verb parses from one JSON line; a `command` key is
  // refused at the parser, so neither door can ever carry one.
  {
    const p = can('parseControlLine') ? C.parseControlLine : null
    const open = p ? p('{"verb":"open","preset":"claude","cwd":"/tmp/x"}\n') : null
    const list = p ? p('{"verb":"list"}') : null
    const focus = p ? p('{"verb":"focus","id":"n7"}') : null
    const ping = p ? p('{"verb":"ping"}') : null
    const cmd = p ? p('{"verb":"open","command":"rm -rf /"}') : null
    const junk = p ? p('not json') : null
    const unknown = p ? p('{"verb":"dance"}') : null
    const noId = p ? p('{"verb":"focus"}') : null
    ok('protocol.1 every verb parses, and a command key, junk, an unknown verb and a focus without id are each refused by name',
      p !== null && open.kind === 'ok' && open.req.verb === 'open' && open.req.preset === 'claude' && open.req.cwd === '/tmp/x' &&
        list.kind === 'ok' && list.req.verb === 'list' && focus.kind === 'ok' && focus.req.id === 'n7' && ping.kind === 'ok' &&
        cmd.kind === 'bad' && /command/.test(cmd.error) && junk.kind === 'bad' && unknown.kind === 'bad' && /dance/.test(unknown.error) &&
        noId.kind === 'bad' && /id/.test(noId.error),
      p ? JSON.stringify({ open, list, focus, ping, cmd, junk, unknown, noId }) : 'parseControlLine is not exported')
  }
  // url.1 — the URL door parses to the SAME request shape, decodes its
  // query, refuses a command and any host other than `open`.
  {
    const p = can('parseControlUrl') ? C.parseControlUrl : null
    const u = p ? p('terminal-canvas://open?preset=claude&cwd=%2FUsers%2Fx%2Fmy%20repo') : null
    const bare = p ? p('terminal-canvas://open') : null
    const cmd = p ? p('terminal-canvas://open?command=rm') : null
    const other = p ? p('terminal-canvas://focus?id=n1') : null
    const wrong = p ? p('https://example.com/open?preset=x') : null
    // M83. The URL door is the one an ATTACKER can reach — a link in a page.
    // `memory` is the first verb that writes anything, so its refusal here is
    // load-bearing and was asserted nowhere until the milestone's verifier
    // said so. `status` is read-only and refused for the same reason: the
    // door opens panels, and nothing else.
    const mem = p ? p('terminal-canvas://memory?op=add&root=/repo&kind=note&text=x') : null
    const stat = p ? p('terminal-canvas://status') : null
    ok('url.1 the URL door yields the same open request, decoded; a command, another verb (memory and status included), and another scheme are refused',
      p !== null && u.kind === 'ok' && u.req.verb === 'open' && u.req.preset === 'claude' && u.req.cwd === '/Users/x/my repo' &&
        bare.kind === 'ok' && bare.req.preset === undefined && bare.req.cwd === undefined &&
        cmd.kind === 'bad' && other.kind === 'bad' && wrong.kind === 'bad' && mem.kind === 'bad' && stat.kind === 'bad',
      p ? JSON.stringify({ u, bare, cmd, other, wrong, mem, stat }) : 'parseControlUrl is not exported')
  }
  // open.1 — resolution by name, by id, by default; refusals for an unknown
  // preset, no default, and a cwd that is not on disk (the spawn would land
  // in $HOME silently — the wrong-directory case #57 calls worse than nothing).
  {
    const r = can('resolveOpen') ? C.resolveOpen : null
    const presets = [
      { id: 'p1', name: 'claude', cwd: '~/a' },
      { id: 'p2', name: 'codex', cwd: '~/b' }
    ]
    const exists = (p) => p !== '/nope'
    const byName = r ? r({ req: { verb: 'open', preset: 'codex' }, presets, defaultId: 'p1', exists }) : null
    const byId = r ? r({ req: { verb: 'open', preset: 'p1', cwd: '/tmp' }, presets, defaultId: null, exists }) : null
    const byDefault = r ? r({ req: { verb: 'open' }, presets, defaultId: 'p2', exists }) : null
    const unknown = r ? r({ req: { verb: 'open', preset: 'gemini' }, presets, defaultId: 'p1', exists }) : null
    const noDefault = r ? r({ req: { verb: 'open' }, presets, defaultId: null, exists }) : null
    const noCwd = r ? r({ req: { verb: 'open', preset: 'claude', cwd: '/nope' }, presets, defaultId: null, exists }) : null
    ok('open.1 a preset resolves by name, by id and by default, and unknown / no default / missing cwd are refused by name',
      r !== null && byName.kind === 'ok' && byName.preset.id === 'p2' && byName.cwd === undefined &&
        byId.kind === 'ok' && byId.preset.id === 'p1' && byId.cwd === '/tmp' &&
        byDefault.kind === 'ok' && byDefault.preset.id === 'p2' &&
        unknown.kind === 'refused' && /gemini/.test(unknown.error) &&
        noDefault.kind === 'refused' && /default/.test(noDefault.error) &&
        noCwd.kind === 'refused' && /\/nope/.test(noCwd.error),
      r ? JSON.stringify({ byName, byId, byDefault, unknown, noDefault, noCwd }) : 'resolveOpen is not exported')
  }
  // server.1 — a real Unix socket: a stale file is unlinked before listen,
  // the socket is 0600, a request round-trips through the injected handler,
  // a malformed line is answered and the server is still up for the next
  // client.
  {
    const dir = mkdtempSync(join(tmpdir(), 'tc-control-'))
    const path = join(dir, 'control.sock')
    writeFileSync(path, 'stale')
    const seen = []
    const server = can('createControlServer')
      ? await C.createControlServer({ path, handle: async (req) => { seen.push(req); return { ok: true, echo: req.verb } } })
      : null
    const mode = server ? statSync(path).mode & 0o777 : -1
    const ask = (line) => new Promise((resolve) => {
      const sock = net.createConnection(path)
      let buf = ''
      sock.on('data', (d) => { buf += d })
      sock.on('end', () => resolve(buf.trim()))
      sock.on('error', (e) => resolve(`ERR ${e.code}`))
      sock.write(line)
    })
    const first = server ? await ask('{"verb":"ping"}\n') : ''
    const bad = server ? await ask('{{{\n') : ''
    const second = server ? await ask('{"verb":"list"}\n') : ''
    if (server) await server.close()
    const goneAfterClose = !existsSync(path)
    ok('server.1 a stale socket file is replaced, the socket is 0600, requests round-trip, a bad line is answered and the server survives it',
      server !== null && mode === 0o600 && JSON.parse(first || '{}').echo === 'ping' &&
        JSON.parse(bad || '{}').ok === false && JSON.parse(second || '{}').echo === 'list' &&
        seen.length === 2 && goneAfterClose,
      server ? JSON.stringify({ mode: mode.toString(8), first, bad, second, seen: seen.length, goneAfterClose }) : 'createControlServer is not exported')
    rmSync(dir, { recursive: true, force: true })
  }
  // cli.1 — exit codes through an injected connect: 0 on ok, 1 on a refusal,
  // 2 when nothing is listening; the reply printed as JSON; the socket path
  // from TC_CONTROL_SOCKET first.
  {
    const run = can('runCli') ? C.runCli : null
    const mk = (reply, err) => {
      const calls = []
      const connect = (path, line) => { calls.push({ path, line }); return err ? Promise.reject(err) : Promise.resolve(reply) }
      return { calls, connect }
    }
    const out = []
    const io = { stdout: (s) => out.push(s), stderr: (s) => out.push(`E:${s}`) }
    const okc = mk('{"ok":true}')
    const code0 = run ? await run(['open', '--preset', 'claude', '--cwd', '/tmp'], { TC_CONTROL_SOCKET: '/s.sock' }, okc.connect, io) : -1
    const refused = mk('{"ok":false,"error":"no such preset"}')
    const code1 = run ? await run(['open', '--preset', 'x'], { TC_CONTROL_SOCKET: '/s.sock' }, refused.connect, io) : -1
    const down = mk(null, Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
    const code2 = run ? await run(['ping'], { TC_CONTROL_SOCKET: '/s.sock' }, down.connect, io) : -1
    const usage = run ? await run([], {}, okc.connect, io) : -1
    const sent = okc.calls[0] ? JSON.parse(okc.calls[0].line) : null
    ok('cli.1 exit 0 / 1 / 2 for ok / refused / not running, the reply printed as JSON, the request built from argv, the socket from TC_CONTROL_SOCKET',
      run !== null && code0 === 0 && code1 === 1 && code2 === 2 && usage === 1 &&
        okc.calls[0].path === '/s.sock' && sent.verb === 'open' && sent.preset === 'claude' && sent.cwd === '/tmp' &&
        out.some((s) => s.includes('"ok":true')),
      run ? JSON.stringify({ code0, code1, code2, usage, calls: okc.calls, out }) : 'runCli is not exported')
  }

  // handler.1 — ONE handler behind both doors, over injected verbs: `open`
  // resolves and calls spawn with the preset's template and the request's
  // cwd; `list` returns the injected rows with the dormant note; `focus`
  // answers by whether the id was known; a refusal never calls spawn.
  {
    const mk = can('createControlHandler') ? C.createControlHandler : null
    const spawned = []
    const focused = []
    const h = mk ? mk({
      presets: () => [{ id: 'p1', name: 'claude', cwd: '~/a', args: [] }],
      defaultId: () => 'p1',
      exists: (p) => p !== '/nope',
      spawn: (preset, cwd) => { spawned.push({ id: preset.id, cwd }) },
      list: () => [{ panelId: 'n1', pid: 4242, cwd: '/x', command: 'zsh' }],
      focus: (id) => { focused.push(id); return id === 'n1' }
    }) : null
    const open = h ? await h({ verb: 'open', preset: 'claude', cwd: '/tmp' }) : null
    const bad = h ? await h({ verb: 'open', preset: 'claude', cwd: '/nope' }) : null
    const list = h ? await h({ verb: 'list' }) : null
    const f1 = h ? await h({ verb: 'focus', id: 'n1' }) : null
    const f2 = h ? await h({ verb: 'focus', id: 'zz' }) : null
    const ping = h ? await h({ verb: 'ping' }) : null
    ok('handler.1 open spawns the resolved preset at the request cwd, a refused open spawns nothing, list carries rows and the dormant note, focus answers by id, ping is ok',
      h !== null && open.ok === true && spawned.length === 1 && spawned[0].id === 'p1' && spawned[0].cwd === '/tmp' &&
        bad.ok === false && /\/nope/.test(bad.error) && spawned.length === 1 &&
        list.ok === true && list.sessions.length === 1 && list.sessions[0].panelId === 'n1' && /dormant/.test(list.note) &&
        f1.ok === true && f2.ok === false && /zz/.test(f2.error) && ping.ok === true,
      h ? JSON.stringify({ open, bad, list, f1, f2, ping, spawned }) : 'createControlHandler is not exported')
  }
  // launcher.1 — the launcher script runs THIS binary as node over the
  // bundled CLI, both paths quoted (the packaged app lives under
  // "Terminal Canvas.app"), and hands argv through; writing it twice is one
  // write, since the content is compared first.
  {
    const script = can('launcherScript') ? C.launcherScript({ execPath: '/Applications/Terminal Canvas.app/Contents/MacOS/Terminal Canvas', cliPath: '/Applications/Terminal Canvas.app/Contents/Resources/app.asar/out/main/tc.js' }) : null
    const dir = mkdtempSync(join(tmpdir(), 'tc-launcher-'))
    const writes = []
    const w = can('writeLauncher') ? C.writeLauncher : null
    const first = w ? w({ dir, script: 'x\n', writeFile: (p, c) => { writes.push(p); writeFileSync(p, c, { mode: 0o755 }) } }) : null
    const second = w ? w({ dir, script: 'x\n', writeFile: (p, c) => { writes.push(p); writeFileSync(p, c, { mode: 0o755 }) } }) : null
    ok('launcher.1 the script execs this binary as node over the CLI with quoted paths and "$@", and a second identical write is skipped',
      script !== null && /^#!\/bin\/sh\n/.test(script) && /ELECTRON_RUN_AS_NODE=1/.test(script) &&
        script.includes('"/Applications/Terminal Canvas.app/Contents/MacOS/Terminal Canvas"') &&
        script.includes('"/Applications/Terminal Canvas.app/Contents/Resources/app.asar/out/main/tc.js"') && script.includes('"$@"') &&
        first === join(dir, 'tc') && second === join(dir, 'tc') && writes.length === 1 && (statSync(join(dir, 'tc')).mode & 0o111) !== 0,
      JSON.stringify({ script, first, second, writes }))
    rmSync(dir, { recursive: true, force: true })
  }

  // M81 — status.1 / status.2. `tc status`: a READ-ONLY fifth verb. status.1:
  //      it parses from both doors, refuses a command key like every other
  //      verb, and has no arm that spawns, focuses or writes. status.2: the
  //      handler answers with the canvas MODEL in the canvas's own words, and
  //      a renderer that does not answer yields an empty model WITH a note —
  //      three states, never two.
  {
    const parsed = C.parseControlLine(JSON.stringify({ verb: 'status' }))
    const withCommand = C.parseControlLine(JSON.stringify({ verb: 'status', command: 'rm -rf /' }))
    // The URL door is M54's `open` alone — a URL has nowhere to put a reply,
    // and `status` is a question. It is refused there BY NAME.
    const url = C.parseControlUrl('terminal-canvas://status')
    const spawns = []
    const focused = []
    const model = {
      panels: [{ id: 'n1', kind: 'terminal', title: 'api', state: 'working', cwd: '/r', cost: 0.5 }, { id: 'c1', kind: 'chat', state: 'needs you', cwd: '/r' }],
      edges: [{ from: 'n1', to: 'c1', trigger: 'on exit 0' }],
      runs: [{ id: 'run-1', name: 'run 1', outcome: 'idle', panels: 2, cost: 0.5 }]
    }
    const handler = C.createControlHandler({
      presets: () => [], defaultId: () => null, exists: () => true,
      spawn: (p) => spawns.push(p), list: () => [], focus: (id) => { focused.push(id); return true },
      canvas: async () => model
    })
    const quiet = C.createControlHandler({
      presets: () => [], defaultId: () => null, exists: () => true,
      spawn: (p) => spawns.push(p), list: () => [], focus: () => true,
      canvas: async () => null
    })
    const reply = parsed.kind === 'ok' ? await handler(parsed.req) : null
    const empty = await quiet({ verb: 'status' })
    ok('status.1 status parses from the socket line, is refused by name at the URL door (which can only open), refuses a command key, and its handler spawns and focuses nothing',
      parsed.kind === 'ok' && parsed.req.verb === 'status' && url.kind === 'bad' && /can only open/.test(url.error) &&
        withCommand.kind === 'bad' && /command/.test(withCommand.error) &&
        spawns.length === 0 && focused.length === 0,
      JSON.stringify({ parsed, url, withCommand, spawns, focused }))
    ok('status.2 the reply carries the canvas model in the canvas\'s own words; a renderer that does not answer yields an empty model WITH a note, never a silent empty one',
      reply !== null && reply.ok === true && reply.canvas.panels.length === 2 && reply.canvas.panels[0].state === 'working' &&
        reply.canvas.edges[0].trigger === 'on exit 0' && reply.canvas.runs[0].outcome === 'idle' &&
        empty.ok === true && empty.canvas.panels.length === 0 && typeof empty.note === 'string' && /answer/.test(empty.note),
      JSON.stringify({ reply, empty }))
  }

  // M81 — status.3. The words themselves, from the modules that make them:
  //      the handler passes the model through (status.2 proves that and no
  //      more), so drift would happen HERE — a state word outside the
  //      vocabulary, or a trigger phrased twice. Every word the model can
  //      carry is checked against panel-state's own closed set and
  //      trigger-words' own table.
  {
    const V = C
    const VOCAB = new Set(['not started', 'starting', 'working', 'needs you', 'idle', 'asleep', 'running'])
    const words = [
      V.panelState({ kind: 'terminal', status: undefined, dormant: false }, undefined).word,
      V.panelState({ kind: 'terminal', status: { kind: 'running', pid: 1, command: 'x', cwd: '/', reattached: false }, dormant: false }, 'busy').word,
      V.panelState({ kind: 'terminal', status: { kind: 'running', pid: 1, command: 'x', cwd: '/', reattached: false }, dormant: false }, 'wants-you').word,
      V.panelState({ kind: 'terminal', status: { kind: 'running', pid: 1, command: 'x', cwd: '/', reattached: false }, dormant: false }, 'idle').word,
      V.panelState({ kind: 'terminal', status: undefined, dormant: true }, undefined).word
    ]
    const exited = V.panelState({ kind: 'terminal', status: { kind: 'exited', code: 3 }, dormant: false }, 'exited').word
    const triggers = Object.values(V.TRIGGER_WORDS)
    ok('status.3 every word the model can carry comes from the vocabulary: each state word is in the closed set (or `exited N`), and each trigger phrase is trigger-words\' own',
      words.every((w) => VOCAB.has(w)) && /^exited \d+$/.test(exited) &&
        triggers.length === 5 && new Set(triggers).size === 5 && triggers.every((t) => typeof t === 'string' && t !== '') &&
        triggers.includes('on exit 0') && triggers.includes('after a turn'),
      JSON.stringify({ words, exited, triggers }))
  }

  // M87 — api.1. THE BROKER'S VERB at every door. `api` is the verb that can
  //      SPEND A CREDENTIAL, so its refusals are load-bearing: the URL door
  //      (a link in a page) refuses it outright; `command` is refused on it
  //      as everywhere; the parser demands a service, a method and a path and
  //      refuses a body that is not a string; the handler passes the broker's
  //      own answer through and can spawn nothing; the CLI builds the shape
  //      from `tc api <service> <method> <path> [body]` with the panel from
  //      TC_PANEL_ID.
  {
    const parsedOk = C.parseControlLine(JSON.stringify({ verb: 'api', service: 'github', method: 'GET', path: '/user' }))
    const parsedBody = C.parseControlLine(JSON.stringify({ verb: 'api', service: 'github', method: 'POST', path: '/repos/o/r/issues', body: '{"title":"x"}', panelId: 'n1' }))
    const noPath = C.parseControlLine(JSON.stringify({ verb: 'api', service: 'github', method: 'GET' }))
    const badBody = C.parseControlLine(JSON.stringify({ verb: 'api', service: 'github', method: 'POST', path: '/x', body: 42 }))
    const withCommand = C.parseControlLine(JSON.stringify({ verb: 'api', service: 'github', method: 'GET', path: '/user', command: 'rm' }))
    const url = C.parseControlUrl('terminal-canvas://api?service=github&method=GET&path=/user')
    const calls = []
    const spawns = []
    const handler = C.createControlHandler({
      presets: () => [], defaultId: () => null, exists: () => true,
      spawn: (p) => spawns.push(p), list: () => [], focus: () => true,
      broker: { call: async (req) => { calls.push(req); return req.service === 'nope' ? { ok: false, reason: 'unknown service nope' } : { ok: true, status: 200, body: '{"login":"octocat"}', truncated: false } } }
    })
    const answered = parsedOk.kind === 'ok' ? await handler(parsedOk.req) : null
    const refused = await handler({ verb: 'api', service: 'nope', method: 'GET', path: '/x' })
    const noBroker = await C.createControlHandler({ presets: () => [], defaultId: () => null, exists: () => true, spawn: () => {}, list: () => [], focus: () => true })({ verb: 'api', service: 'github', method: 'GET', path: '/user' })
    const build = typeof C.buildRequest === 'function' ? C.buildRequest : null
    const cli = build ? build(['api', 'github', 'POST', '/repos/o/r/issues', '{"title":"x"}'], { TC_PANEL_ID: 'n7' }) : null
    const cliLine = cli && cli.kind === 'ok' ? JSON.parse(cli.line) : cli
    const cliShort = build ? build(['api', 'github'], {}) : null
    // M87's verifier: the --panel flag the spec promised, a body that is not
    // JSON refused as a usage error, and a served 4xx exiting 1 so a script
    // testing $? does not read the service's refusal as success.
    const cliFlag = build ? build(['api', 'github', 'get', '/user', '--panel', 'n9'], { TC_PANEL_ID: 'n7' }) : null
    const cliFlagLine = cliFlag && cliFlag.kind === 'ok' ? JSON.parse(cliFlag.line) : cliFlag
    const cliBadJson = build ? build(['api', 'github', 'POST', '/x', '{not json'], {}) : null
    const out2 = []
    const io2 = { stdout: (s) => out2.push(s), stderr: (s) => out2.push(`E:${s}`) }
    const served404 = typeof C.runCli === 'function' ? await C.runCli(['api', 'github', 'GET', '/nope'], { TC_CONTROL_SOCKET: '/s.sock' }, async () => '{"ok":true,"status":404,"body":"{}","truncated":false}', io2) : -1
    const served200 = typeof C.runCli === 'function' ? await C.runCli(['api', 'github', 'GET', '/user'], { TC_CONTROL_SOCKET: '/s.sock' }, async () => '{"ok":true,"status":200,"body":"{}","truncated":false}', io2) : -1
    ok('api.1 the parser demands service, method and path and refuses a non-string body and a command key; the URL door refuses api; the handler passes the broker\'s answer and its refusal through and spawns nothing, and says so without a broker; the CLI builds the shape with the panel from TC_PANEL_ID',
      parsedOk.kind === 'ok' && parsedOk.req.verb === 'api' && parsedOk.req.service === 'github' && parsedOk.req.method === 'GET' && parsedOk.req.path === '/user' &&
        parsedBody.kind === 'ok' && parsedBody.req.body === '{"title":"x"}' && parsedBody.req.panelId === 'n1' &&
        noPath.kind === 'bad' && /path/.test(noPath.error) && badBody.kind === 'bad' && /body/.test(badBody.error) &&
        withCommand.kind === 'bad' && /command/.test(withCommand.error) && url.kind === 'bad' &&
        answered && answered.ok === true && answered.status === 200 && /octocat/.test(answered.body) && calls.length === 2 &&
        refused.ok === false && /unknown service/.test(refused.error) &&
        noBroker.ok === false && /broker/.test(noBroker.error) && spawns.length === 0 &&
        cliLine && cliLine.verb === 'api' && cliLine.service === 'github' && cliLine.method === 'POST' && cliLine.path === '/repos/o/r/issues' && cliLine.body === '{"title":"x"}' && cliLine.panelId === 'n7' &&
        cliShort && cliShort.kind === 'usage' &&
        cliFlagLine && cliFlagLine.panelId === 'n9' && cliFlagLine.method === 'GET' &&
        cliBadJson && cliBadJson.kind === 'usage' && /JSON/.test(cliBadJson.error) &&
        served404 === 1 && served200 === 0,
      JSON.stringify({ parsedOk, parsedBody, noPath, badBody, withCommand, url, answered, refused, noBroker, cliLine, cliShort, cliFlagLine, cliBadJson, served404, served200 }))
  }

  // M83 — memory.2. THE CLI's OWN MEMORY VERBS, and the limit refusal.
  //      `verify:control memory.1` drives the parser and the handler, so it
  //      is green over a CLI that never learned the verb — which is exactly
  //      what happened (M83's verifier: `buildRequest` had four cases and
  //      `tc memory add` fell through to a usage error). This drives
  //      `buildRequest` itself, including the panel-cwd default that lets an
  //      agent write a memory with no --root at all, and the non-positive
  //      limit that the handler refuses BY NAME rather than answering with an
  //      empty list that reads like a repository nobody has written about.
  {
    const build = can('buildRequest') ? C.buildRequest : null
    const line = (argv, env) => { const b = build ? build(argv, env ?? {}) : null; return b && b.kind === 'ok' ? JSON.parse(b.line) : b }
    const add = line(['memory', 'add', '--kind', 'decided', '--text', 'we use tmux'], { TC_PANEL_CWD: '/repo/sub' })
    const listed = line(['memory', 'list', '--limit', '5'], { TC_PANEL_CWD: '/repo' })
    const status = line(['status'], {})
    const noKind = line(['memory', 'add', '--text', 'x'], { TC_PANEL_CWD: '/repo' })
    const badLimit = line(['memory', 'list', '--limit', '0'], { TC_PANEL_CWD: '/repo' })
    const badOpCli = line(['memory', 'forget'], {})
    // M121. --teammate names a teammate's OWN memory: the root becomes the
    // `teammate:<id>` prefix main already sorts by, so the CLI and the pane
    // reach the same list. A --root beside it is refused (two subjects).
    const mate = line(['memory', 'add', '--kind', 'note', '--text', 'x', '--teammate', 't1'], { TC_PANEL_CWD: '/repo' })
    const mateList = line(['memory', 'list', '--teammate', 't1'], { TC_PANEL_CWD: '/repo' })
    const twoSubjects = line(['memory', 'list', '--teammate', 't1', '--root', '/repo'], {})
    const handler2 = C.createControlHandler({
      presets: () => [], defaultId: () => null, exists: () => true,
      spawn: () => {}, list: () => [], focus: () => true,
      memory: { list: async (root, limit) => ({ root, entries: [], skipped: 0, limit }), add: async () => ({ ok: true, entry: {} }) }
    })
    const zeroLimit = await handler2({ verb: 'memory', op: 'list', root: '/repo', limit: 0 })
    ok('memory.2 the CLI builds the memory and status verbs, defaults the root to the panel\'s own directory, refuses a missing --kind and a non-positive --limit by name, the handler refuses limit 0 rather than answering empty, and (M121) --teammate <id> makes the root teammate:<id> for add and list while --root beside it is refused',
      build !== null &&
        add && add.verb === 'memory' && add.op === 'add' && add.kind === 'decided' && add.text === 'we use tmux' && add.root === '/repo/sub' &&
        listed && listed.op === 'list' && listed.limit === 5 && listed.root === '/repo' &&
        status && status.verb === 'status' &&
        noKind && noKind.kind === 'usage' && /--kind/.test(noKind.error) &&
        badLimit && badLimit.kind === 'usage' && /limit/.test(badLimit.error) &&
        mate && mate.op === 'add' && mate.root === 'teammate:t1' && mateList && mateList.op === 'list' && mateList.root === 'teammate:t1' &&
        twoSubjects && twoSubjects.kind === 'usage' && /--teammate/.test(twoSubjects.error) &&
        badOpCli && badOpCli.kind === 'usage' && /list or add/.test(badOpCli.error) &&
        zeroLimit.ok === false && /limit/.test(zeroLimit.error),
      JSON.stringify({ add, listed, status, noKind, badLimit, badOpCli, zeroLimit }))
  }

  // M113 — board.1. THE BOARD VERB. `tc board add <title>` and `tc board done
  // <id>` are READ-WRITE, so the URL door refuses them the way it refuses
  // status (a URL can only open). Main does not write the store itself —
  // the renderer owns the workspace it is rendering and would overwrite a
  // main-side write on its next coalesced save — so the handler asks the
  // RENDERER over the ephemeral reply channel canvas:model already uses; a
  // window that does not answer is a named refusal, never a silent ok.
  {
    let add, done, empty, badOp, url, cliAdd, cliDone, cliNoTitle, answered, noWindow
    const spawns = []
    try {
      add = C.parseControlLine('{"verb":"board","op":"add","title":"Fix the thing"}')
      done = C.parseControlLine('{"verb":"board","op":"done","id":"wi1"}')
      empty = C.parseControlLine('{"verb":"board","op":"add","title":""}')
      badOp = C.parseControlLine('{"verb":"board","op":"drag","id":"wi1"}')
      url = C.parseControlUrl('terminal-canvas://board?op=add&title=x')
      const build = C.buildRequest
      const line = (argv) => { const b = build(argv, {}); return b.kind === 'ok' ? JSON.parse(b.line) : b }
      cliAdd = line(['board', 'add', 'Fix', 'the', 'thing'])
      cliDone = line(['board', 'done', 'wi1'])
      cliNoTitle = line(['board', 'add'])
      const handler = C.createControlHandler({ presets: () => [], defaultId: () => null, exists: () => true, spawn: (p) => spawns.push(p), list: () => [], focus: () => true, board: async (req) => ({ kind: 'ok', id: req.op === 'add' ? 'wi-new' : req.id }) })
      answered = await handler(add.req)
      const quiet = C.createControlHandler({ presets: () => [], defaultId: () => null, exists: () => true, spawn: (p) => spawns.push(p), list: () => [], focus: () => true, board: async () => null })
      noWindow = await quiet(done.req)
    } catch (e) { answered = { threw: String(e) } }
    ok('board.1 board add/done parse from the socket line (an empty title and an unknown op refused by name), the URL door refuses board, the CLI builds both from argv (add joins the title words; add with no title is a usage error), the handler answers the renderer\'s id and spawns nothing, and a window that does not answer is a named refusal',
      add && add.kind === 'ok' && add.req.verb === 'board' && add.req.op === 'add' && add.req.title === 'Fix the thing' &&
        done && done.kind === 'ok' && done.req.op === 'done' && done.req.id === 'wi1' &&
        empty && empty.kind === 'bad' && /title/.test(empty.error) && badOp && badOp.kind === 'bad' && /add or done/.test(badOp.error) &&
        url && url.kind === 'bad' && /can only open/.test(url.error) &&
        cliAdd && cliAdd.verb === 'board' && cliAdd.op === 'add' && cliAdd.title === 'Fix the thing' && cliDone && cliDone.op === 'done' && cliDone.id === 'wi1' &&
        cliNoTitle && cliNoTitle.kind === 'usage' && /title/.test(cliNoTitle.error) &&
        answered && answered.ok === true && answered.id === 'wi-new' && spawns.length === 0 &&
        noWindow && noWindow.ok === false && /no canvas/.test(noWindow.error),
      JSON.stringify({ add, done, empty, badOp, url, cliAdd, cliDone, cliNoTitle, answered, noWindow }))
  }

  // M313 — task.1. BRING A TASK INTO THE CANVAS. `tc task` and
  // `terminal-canvas://task` PROPOSE: the renderer opens Start work filled in
  // and a person presses Start. It is the one other verb the URL door may
  // carry, because it cannot act — the handler asks for a proposal (never an
  // add), spawns nothing, refuses a directory that is not there, and a
  // command key is refused here as everywhere.
  {
    let sock, url, bad, cmd, cli, cliEnv, cliNoTitle, answered, missingDir
    const asked = []
    const spawns = []
    try {
      sock = C.parseControlLine(JSON.stringify({ verb: 'task', title: 'Fix login', brief: 'SSO works', criteria: ['401 gone', ''], cwd: '/repo', recipe: 'recipe-fix-test' }))
      url = C.parseControlUrl('terminal-canvas://task?title=Fix%20login&criteria=a%0Ab&cwd=%2Frepo')
      bad = C.parseControlUrl('terminal-canvas://task?title=x&cwd=relative')
      cmd = C.parseControlLine(JSON.stringify({ verb: 'task', title: 'x', command: 'rm -rf /' }))
      const line = (argv, env = {}) => { const b = C.buildRequest(argv, env); return b.kind === 'ok' ? JSON.parse(b.line) : b }
      cli = line(['task', 'Fix', 'login', '--brief', 'SSO works', '--criterion', 'a', '--criterion', 'b', '--recipe', 'recipe-fix-test', '--cwd', '/repo'])
      cliEnv = line(['task', 'Fix', 'it'], { TC_PANEL_CWD: '/lane' })
      cliNoTitle = line(['task', '--brief', 'x'])
      const handler = C.createControlHandler({ presets: () => [], defaultId: () => null, exists: (p) => p === '/repo', spawn: (p) => spawns.push(p), list: () => [], focus: () => true, board: async (req) => { asked.push(req); return { kind: 'ok', id: 'start-work' } } })
      answered = await handler(sock.req)
      missingDir = await handler({ verb: 'task', title: 'x', cwd: '/nope' })
    } catch (e) { answered = { threw: String(e) } }
    ok('task.1 a task parses from the socket and from a task:// URL (criteria one per line there), a relative cwd and a command key are refused by name; the CLI builds it from argv, defaulting --cwd to the panel\'s own directory; the handler asks the renderer to PROPOSE (never add), spawns nothing, and refuses a cwd that does not exist',
      sock && sock.kind === 'ok' && sock.req.verb === 'task' && sock.req.criteria.join() === '401 gone' && sock.req.recipe === 'recipe-fix-test' &&
        url && url.kind === 'ok' && url.req.title === 'Fix login' && url.req.criteria.join() === 'a,b' && url.req.cwd === '/repo' &&
        bad && bad.kind === 'bad' && /absolute/.test(bad.error) && cmd && cmd.kind === 'bad' && /command is never accepted/.test(cmd.error) &&
        cli && cli.verb === 'task' && cli.title === 'Fix login' && cli.brief === 'SSO works' && cli.criteria.join() === 'a,b' && cli.recipe === 'recipe-fix-test' && cli.cwd === '/repo' &&
        cliEnv && cliEnv.cwd === '/lane' && cliNoTitle && cliNoTitle.kind === 'usage' &&
        answered && answered.ok === true && asked.length === 1 && asked[0].op === 'propose' && asked[0].title === 'Fix login' && spawns.length === 0 &&
        missingDir && missingDir.ok === false && /does not exist/.test(missingDir.error),
      JSON.stringify({ sock, url, bad, cmd, cli, cliEnv, cliNoTitle, answered, asked, missingDir }))
  }

  // M83 — memory.1. THE MEMORY VERBS. `list` reads and `add` writes — the
  //      first control verb that writes anything, and it writes ONLY into the
  //      store: a command key is refused here as everywhere, an unusable op
  //      and an unusable kind are refused BY NAME, and a root with no file
  //      reads empty rather than erroring.
  {
    const written = []
    const memory = {
      list: (root, limit) => ({ root, entries: root === '/repo' ? [{ kind: 'decided', text: 'we use tmux', at: 1 }] : [], skipped: 0, limit }),
      add: (req) => { if (req.kind === 'pondered') return { ok: false, reason: 'pondered is not a memory kind — use decided, tried, failed or note' }; written.push(req); return { ok: true, entry: { kind: req.kind, text: req.text, at: 2 } } }
    }
    const spawns = []
    const handler = C.createControlHandler({
      presets: () => [], defaultId: () => null, exists: () => true,
      spawn: (p) => spawns.push(p), list: () => [], focus: () => true, memory
    })
    const parsedList = C.parseControlLine(JSON.stringify({ verb: 'memory', op: 'list', root: '/repo' }))
    const parsedAdd = C.parseControlLine(JSON.stringify({ verb: 'memory', op: 'add', root: '/repo', kind: 'decided', text: 'we use tmux' }))
    const withCommand = C.parseControlLine(JSON.stringify({ verb: 'memory', op: 'list', command: 'rm -rf /' }))
    const badOp = C.parseControlLine(JSON.stringify({ verb: 'memory', op: 'forget' }))
    const listed = parsedList.kind === 'ok' ? await handler(parsedList.req) : null
    const added = parsedAdd.kind === 'ok' ? await handler(parsedAdd.req) : null
    const emptyRoot = await handler({ verb: 'memory', op: 'list', root: '/elsewhere' })
    const badKind = await handler({ verb: 'memory', op: 'add', root: '/repo', kind: 'pondered', text: 'x' })
    ok('memory.1 memory list reads and memory add writes, a command key and an unusable op are refused at the parser, an unusable kind is refused by name at the handler, an unknown root reads empty, and nothing is spawned',
      parsedList.kind === 'ok' && parsedAdd.kind === 'ok' && withCommand.kind === 'bad' && /command/.test(withCommand.error) &&
        badOp.kind === 'bad' && /op/.test(badOp.error) &&
        listed && listed.ok === true && listed.memory.entries.length === 1 &&
        added && added.ok === true && written.length === 1 && written[0].text === 'we use tmux' &&
        emptyRoot.ok === true && emptyRoot.memory.entries.length === 0 &&
        badKind.ok === false && /memory kind/.test(badKind.error) &&
        spawns.length === 0,
      JSON.stringify({ parsedList, parsedAdd, withCommand, badOp, listed, added, emptyRoot, badKind, written }))
  }

  // M102 — token.1. THE SESSION TOKEN NAMES THE PANEL. A chat's `tc api` carries
  // the token main minted into its environment; the handler maps it to the
  // panel that really asked and IGNORES a claimed panelId beside it; a token
  // this window never minted is refused by name; with no token the claimed
  // panelId stands (a terminal's own `--panel`), teammate-less unless records say.
  {
    const calls = []
    const broker = { call: async (req) => { calls.push(req); return { ok: true, status: 200, body: '{}', truncated: false } } }
    const deps = {
      presets: () => [], defaultId: () => null, exists: () => true, spawn: () => {}, list: () => [], focus: () => true,
      broker, teammateOf: (id) => (id === 'c-ada' ? 'ada' : undefined), panelOfToken: (t) => (t === 'tok-ada' ? 'c-ada' : undefined)
    }
    const has = typeof C.createControlHandler === 'function'
    const handler = has ? C.createControlHandler(deps) : null
    const parsed = C.parseControlLine(JSON.stringify({ verb: 'api', service: 'github', method: 'GET', path: '/user', panelId: 'c-other', token: 'tok-ada', cost: '1 call' }))
    const honest = handler && parsed.kind === 'ok' ? await handler(parsed.req) : null
    const forged = C.parseControlLine(JSON.stringify({ verb: 'api', service: 'github', method: 'GET', path: '/user', panelId: 'c-ada', token: 'tok-nope' }))
    const refused = handler && forged.kind === 'ok' ? await handler(forged.req) : null
    const callsAfterRefused = calls.length
    const bare = C.parseControlLine(JSON.stringify({ verb: 'api', service: 'github', method: 'GET', path: '/user', panelId: 'c-other' }))
    const plain = handler && bare.kind === 'ok' ? await handler(bare.req) : null
    ok('token.1 a token maps to the panel main minted it for and overrides the claimed panelId (the teammate follows the real panel, the cost rides); an unknown token is refused by name and reaches no broker; with no token the claimed panelId stands and names no teammate',
      has && parsed.kind === 'ok' && parsed.req.token === 'tok-ada' && honest && honest.ok === true && calls[0] && calls[0].panelId === 'c-ada' && calls[0].teammateId === 'ada' && calls[0].cost === '1 call' &&
        refused && refused.ok === false && /token/.test(refused.error) && callsAfterRefused === 1 &&
        plain && plain.ok === true && calls.length === 2 && calls[1].panelId === 'c-other' && calls[1].teammateId === undefined,
      JSON.stringify({ parsed: parsed.kind, tok: parsed.req && parsed.req.token, honest, refused, plain, calls, callsAfterRefused, c0: calls[0], c1: calls[1] }))
  }
  // M180. Admission is separate from execution: an agent supplies a bounded
  // line of data verbs, never a command or its own confirmation. Keep these
  // checks independent of parser success so a missing arm prints every red.
  {
    const parse = (fields) => C.parseControlLine(JSON.stringify(fields))
    const line = 'focus n1; type n1 Explain the café changes'
    const admitted = parse({ verb: 'plan', line, acknowledged: true })
    ok('plan.protocol.1 a plan line enters the socket as exactly verb and line, without an agent-supplied acknowledgement',
      admitted.kind === 'ok' && admitted.req.verb === 'plan' && admitted.req.line === line &&
        Object.keys(admitted.req).sort().join(',') === 'line,verb',
      JSON.stringify(admitted))

    const malformed = [{ verb: 'plan' }, ...[null, 7, [], '', '   '].map((line) => ({ verb: 'plan', line }))].map(parse)
    ok('plan.protocol.2 an absent, malformed or blank plan line is refused by name',
      malformed.every((r) => r.kind === 'bad' && /line/i.test(r.error)),
      JSON.stringify(malformed))

    // A character cap silently admits twice as many UTF-8 bytes here. The
    // boundary is measured in bytes, including the verb and its arguments.
    const prefix = 'type n1 '
    const exactLine = prefix + 'é'.repeat((8192 - Buffer.byteLength(prefix)) / 2)
    const exact = parse({ verb: 'plan', line: exactLine })
    const over = parse({ verb: 'plan', line: exactLine + 'x' })
    ok('plan.protocol.3 the 8192-byte UTF-8 plan boundary is admitted and one byte more is refused by name',
      exact.kind === 'ok' && exact.req.line === exactLine && over.kind === 'bad' && /8192|byte|long|limit/i.test(over.error),
      JSON.stringify({ exact: exact.kind, exactBytes: Buffer.byteLength(exactLine), over }))

    const sixteen = parse({ verb: 'plan', line: Array(16).fill('focus n1').join('; ') })
    const seventeen = parse({ verb: 'plan', line: Array(17).fill('focus n1').join('; ') })
    ok('plan.protocol.4 sixteen semicolon-separated operations are admitted and a seventeenth is refused by name',
      sixteen.kind === 'ok' && seventeen.kind === 'bad' && /16|step|operation|limit/i.test(seventeen.error),
      JSON.stringify({ sixteen: sixteen.kind, seventeen }))

    const controls = ['\n', '\r', '\0', '\x1b', '\x7f'].map((char) => parse({ verb: 'plan', line: `type n1 before${char}after` }))
    ok('plan.protocol.5 a plan line cannot carry newline, carriage return, NUL, escape or delete control bytes',
      controls.every((r) => r.kind === 'bad' && /line|control/i.test(r.error)),
      JSON.stringify(controls))

    const raw = [{ command: 'touch /tmp/not-a-plan' }, { args: [] }].map((field) => parse({ verb: 'plan', line, ...field }))
    ok('plan.protocol.6 command and args remain refused in the shared parser even beside a valid plan line',
      raw.every((r) => r.kind === 'bad' && /command|args/i.test(r.error)),
      JSON.stringify(raw))

    // The host check alone is insufficient: search params used to overwrite
    // fields.verb after it, turning an open URL into any socket-only verb.
    const direct = C.parseControlUrl(`terminal-canvas://plan?line=${encodeURIComponent(line)}`)
    const disguised = C.parseControlUrl(`terminal-canvas://open?verb=plan&line=${encodeURIComponent(line)}`)
    ok('plan.url.1 URLs refuse a plan host and a plan verb disguised as an open query',
      direct.kind === 'bad' && /can only open/i.test(direct.error) &&
        disguised.kind === 'bad' && /open/i.test(disguised.error),
      JSON.stringify({ direct, disguised }))
  }

  // Main forwards to the renderer's executor and returns its actual outcome.
  // No direct control-handler spawn/focus or success-before-answer is allowed;
  // an absent renderer and a refusing renderer are different named answers.
  {
    const sideEffects = []
    const deps = {
      presets: () => [], defaultId: () => null, exists: () => true,
      spawn: () => sideEffects.push('spawn'), list: () => [],
      focus: () => { sideEffects.push('focus'); return true }
    }
    const req = { verb: 'plan', line: 'focus n1' }
    const calls = []
    let release
    const answer = new Promise((resolve) => { release = resolve })
    const handler = C.createControlHandler({ ...deps, plan: (line) => { calls.push(line); return answer } })
    let settled = false
    const pending = handler(req).then((reply) => { settled = true; return reply }, (error) => ({ threw: String(error) }))
    await Promise.resolve()
    const settledBeforeAnswer = settled
    release({ kind: 'ran', summary: 'ran focus n1 · 1 step' })
    const ran = await pending
    ok('plan.handler.1 the handler awaits the renderer, passes the exact line once and returns its run summary without spawning or focusing itself',
      !settledBeforeAnswer && calls.length === 1 && calls[0] === req.line &&
        ran && ran.ok === true && ran.summary === 'ran focus n1 · 1 step' && sideEffects.length === 0,
      JSON.stringify({ calls, settledBeforeAnswer, ran, sideEffects }))

    const refusing = C.createControlHandler({ ...deps, plan: async () => ({ kind: 'refused', reason: 'close n1 needs a person to confirm it in the canvas' }) })
    const refused = await refusing({ verb: 'plan', line: 'close n1' }).catch((error) => ({ threw: String(error) }))
    ok('plan.handler.2 a renderer refusal reaches the caller as the same named error and never as success',
      refused && refused.ok === false && refused.error === 'close n1 needs a person to confirm it in the canvas' && sideEffects.length === 0,
      JSON.stringify({ refused, sideEffects }))

    const absent = await C.createControlHandler(deps)(req).catch((error) => ({ threw: String(error) }))
    const quiet = await C.createControlHandler({ ...deps, plan: async () => null })(req).catch((error) => ({ threw: String(error) }))
    const rejected = await C.createControlHandler({ ...deps, plan: async () => { throw new Error('renderer gone') } })(req).catch((error) => ({ threw: String(error) }))
    ok('plan.handler.3 an unavailable plan bridge, an unanswered renderer and a rejected request all return named refusals',
      [absent, quiet, rejected].every((r) => r && r.ok === false && typeof r.error === 'string' && /available|canvas|window|answer/i.test(r.error)) && sideEffects.length === 0,
      JSON.stringify({ absent, quiet, rejected, sideEffects }))

    // M180 (the critic's finding 2). The caller's identity, as the `api` arm
    // resolves it: a token this window never minted is refused before the
    // bridge is asked; a minted one hands the panel AND its teammate to the
    // renderer; no token is a plain caller. The parser carries the token.
    const parsedToken = C.parseControlLine(JSON.stringify({ verb: 'plan', line: 'focus n1', token: 'tok-ada' }))
    const callers = []
    const identified = C.createControlHandler({ ...deps, panelOfToken: (t) => (t === 'tok-ada' ? 'c9' : undefined), teammateOf: (id) => (id === 'c9' ? 'ada' : undefined), plan: async (_line, caller) => { callers.push(caller); return { kind: 'ran', summary: 'ok' } } })
    const unknown = await identified({ verb: 'plan', line: 'focus n1', token: 'tok-nobody' })
    const mate = await identified({ verb: 'plan', line: 'focus n1', token: 'tok-ada' })
    const plain = await identified({ verb: 'plan', line: 'focus n1' })
    ok('plan.handler.4 a token names the panel that really asked: unknown refused before the bridge, a minted one carries its teammate, none is a plain caller',
      parsedToken.kind === 'ok' && parsedToken.req.token === 'tok-ada' &&
        unknown.ok === false && /token/.test(unknown.error) && callers.length === 2 &&
        mate.ok === true && callers[0] && callers[0].panelId === 'c9' && callers[0].teammateId === 'ada' &&
        plain.ok === true && callers[1] === undefined,
      JSON.stringify({ parsedToken, unknown, mate, plain, callers }))
  }

  // M255 — control.gap.1. `tc api` CANNOT CLAIM A PERSON SAID YES. The
  //     broker lets a teammate-less write through only with
  //     `personConfirmed`, which main-side code sets after its own dialog.
  //     The control handler builds its broker request field by field, so a
  //     wire request that CLAIMS the flag reaches the broker without it —
  //     asserted on the key, since a spread would carry it straight through.
  {
    const calls = []
    const handler = C.createControlHandler({
      presets: () => [], defaultId: () => null, exists: () => true, spawn: () => {}, list: () => [], focus: () => true,
      broker: { call: async (req) => { calls.push(req); return { ok: false, reason: 'no one was asked', code: 'not-asked' } } }
    })
    const answered = await handler({ verb: 'api', service: 'github', method: 'POST', path: '/repos/o/r/releases', body: '{}', personConfirmed: true })
    ok('control.gap.1 a tc api request claiming personConfirmed reaches the broker WITHOUT the flag, and the broker\'s not-asked refusal comes back as the error',
      calls.length === 1 && !('personConfirmed' in calls[0]) && answered.ok === false && /no one was asked/.test(answered.error),
      JSON.stringify({ calls, answered }))
  }
  // M369 — audit.1. THE DECISION AUDIT keeps a PERSON's decisions only (an
  //     agent's rows never), scrubs each row's words on the way to disk with
  //     the count on the row, reads newest first skipping a torn line, and
  //     trims the oldest at its cap — never editing a row.
  {
    const dir = mkdtempSync(join(tmpdir(), 'tc audit '))
    const file = join(dir, 'decision-audit.jsonl')
    const a = C.createDecisionAudit({ file, max: 3 })
    const ev = (at, source, title, extra = {}) => ({ kind: 'event', runId: 'r', at, event: 'permission', source, title, ...extra })
    a.record(ev(1, 'agent', 'agent ran npm test'))
    a.record(ev(2, 'person', 'Allowed Bash — curl -H "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789" api', { itemId: 'T1', panelId: 'c1' }))
    a.record(ev(3, 'person', 'Reviewed 3 changed files', { event: 'check' }))
    require('node:fs').appendFileSync(file, 'not json\n')
    const read = a.list(10)
    for (let i = 4; i <= 205; i += 1) a.record(ev(i, 'person', `decision ${i}`))
    const trimmed = a.list(10)
    const onDisk = require('node:fs').readFileSync(file, 'utf8')
    rmSync(dir, { recursive: true, force: true })
    ok('audit.1 the decision audit keeps a person\'s decisions only, scrubs a token from a row\'s words with the count on the row, reads newest first skipping a torn line, and trims the oldest at its cap',
      read.rows.length === 2 && read.rows[0].title === 'Reviewed 3 changed files' && read.rows[1].itemId === 'T1' && read.rows[1].scrubbed === 1 &&
        !/ghp_abcdefghijklmnop/.test(read.rows[1].title) && read.skipped === 1 && !read.rows.some((r) => /agent ran/.test(r.title)) &&
        trimmed.rows[0].title === 'decision 205' && onDisk.split('\n').filter((l) => l.trim() !== '').length <= 8 && !/ghp_abcdefghijklmnop/.test(onDisk),
      JSON.stringify({ read, first: trimmed.rows.slice(0, 2) }))
  }

  // M369 — audit.2. `tc audit` is one read-only door: the CLI builds it (a
  //     bad limit refused by name), the protocol parses it, and the handler
  //     answers from main's store — or says this window keeps none.
  {
    const built = [C.buildRequest(['audit'], {}), C.buildRequest(['audit', '--limit', '5'], {}), C.buildRequest(['audit', '--limit', '0'], {}), C.buildRequest(['audit', 'x'], {})]
    const parsed = [C.parseControlLine('{"verb":"audit"}'), C.parseControlLine('{"verb":"audit","limit":5}'), C.parseControlLine('{"verb":"audit","limit":0}')]
    const base = { presets: () => [], defaultId: () => null, exists: () => true, spawn: () => {}, list: () => [], focus: () => true }
    let asked = 0
    const answered = await C.createControlHandler({ ...base, audit: (limit) => { asked = limit; return { rows: [{ at: 1, event: 'permission', title: 'Allowed Bash — ls' }], skipped: 0 } } })({ verb: 'audit', limit: 5 })
    const none = await C.createControlHandler(base)({ verb: 'audit' })
    ok('audit.2 tc audit builds and parses (a limit outside 1–1000 refused by name), answers from main\'s store with the limit asked, and a window with no audit says so',
      built[0].kind === 'ok' && JSON.parse(built[0].line).verb === 'audit' && JSON.parse(built[1].line).limit === 5 && built[2].kind === 'usage' && built[3].kind === 'usage' &&
        parsed[0].kind === 'ok' && parsed[1].kind === 'ok' && parsed[1].req.limit === 5 && parsed[2].kind === 'bad' &&
        answered.ok === true && answered.audit.rows[0].title === 'Allowed Bash — ls' && asked === 5 && none.ok === false && /no decision audit/.test(none.error),
      JSON.stringify({ built, parsed: parsed.map((p) => p.kind), answered, none }))
  }
  // M371 — audit.3. The two decisions that recorded nothing before are said
  //     one way everywhere: a cap a person set (an agent's own lowering is
  //     the agent's, and never reaches the person audit), and a proposal
  //     kept or discarded, naming whose it was and where.
  {
    const dir = mkdtempSync(join(tmpdir(), 'tc audit3 '))
    const a = C.createDecisionAudit({ file: join(dir, 'd.jsonl') })
    const row = (source, title, event) => ({ kind: 'event', runId: 'r', at: 5, event, source, title })
    const personCap = C.capDecisionTitle('claude — api', 'spend cap $4.10', true)
    const agentCap = C.capDecisionTitle('claude — api', 'spend cap $1.00', false)
    const kept = C.proposalDecisionTitle(true, 'review seat', 'src/a.ts:12')
    a.record(row('person', personCap, 'session'))
    a.record(row('agent', agentCap, 'session'))
    a.record(row('person', kept, 'artifact'))
    const read = a.list(10)
    rmSync(dir, { recursive: true, force: true })
    ok('audit.3 a person\'s cap and a kept proposal reach the audit in one set of words; an agent\'s own lowering is the agent\'s and stays out',
      personCap === "Set claude — api's own caps — spend cap $4.10" && agentCap.startsWith('An agent set') &&
        kept === "Kept review seat's proposed comment on src/a.ts:12" && C.proposalDecisionTitle(false, 'x', 'y:1').startsWith('Discarded') &&
        read.rows.map((r) => r.title).join('|') === `${kept}|${personCap}`,
      JSON.stringify(read.rows))
  }
  // M370 — task.swarm.1. `tc task --swarm review` proposes the task WITH its
  //     arrangement: the CLI carries the name, the protocol keeps one of the
  //     four arrangements and refuses anything else naming them, and the
  //     handler hands it to the canvas's proposal — still only a proposal.
  {
    const built = C.buildRequest(['task', 'fix', 'login', '--swarm', 'review'], { TC_PANEL_CWD: '/tmp' })
    const noValue = C.buildRequest(['task', 'fix', '--swarm'], {})
    const parsed = C.parseControlLine(JSON.stringify({ verb: 'task', title: 'fix login', swarm: 'review' }))
    const bad = C.parseControlLine(JSON.stringify({ verb: 'task', title: 'fix login', swarm: 'everything' }))
    let proposed = null
    const base = { presets: () => [], defaultId: () => null, exists: () => true, spawn: () => {}, list: () => [], focus: () => true }
    const answered = await C.createControlHandler({ ...base, board: async (r) => { proposed = r; return { kind: 'ok', id: 'start-work' } } })({ verb: 'task', title: 'fix login', swarm: 'review' })
    ok('task.swarm.1 tc task --swarm carries an arrangement to the canvas\'s proposal; an unknown arrangement is refused naming the four, and a flag with no value is a usage error',
      built.kind === 'ok' && JSON.parse(built.line).swarm === 'review' && noValue.kind === 'usage' &&
        parsed.kind === 'ok' && parsed.req.swarm === 'review' && bad.kind === 'bad' && /explore, implement, test, review/.test(bad.error) &&
        answered.ok === true && proposed.op === 'propose' && proposed.swarm === 'review',
      JSON.stringify({ built, parsed, bad, proposed }))
  }
  // M369 fix — cli.list.1. Every no-argument verb builds ITSELF. M369 first
  //     put `case 'audit'` between `case 'list':` and `case 'status':`, so
  //     `tc list` fell through and asked for the audit, and no check built
  //     `tc list` through the CLI to notice.
  {
    const built = ['list', 'status', 'ping', 'audit'].map((v) => C.buildRequest([v], {}))
    const extra = C.buildRequest(['list', 'x'], {})
    ok('cli.list.1 tc list, status, ping and audit each build their own verb, and a stray argument to list is a usage error',
      built.every((b, i) => b.kind === 'ok' && JSON.parse(b.line).verb === ['list', 'status', 'ping', 'audit'][i]) && extra.kind === 'usage',
      JSON.stringify({ built, extra }))
  }
  // M373 — share.audit.1. A workspace share decision, made in main behind a
  //     person's dialog, is a person's row in one set of words (the ids in
  //     the detail, the share's run id so one workspace reads back
  //     together), and `recordDecision` keeps M369's order: the ledger
  //     first, the audit only for a row the ledger took.
  {
    const dir = mkdtempSync(join(tmpdir(), 'tc share audit '))
    const ledger = C.createRunLedger({ file: join(dir, 'ledger.jsonl') })
    const audit = C.createDecisionAudit({ file: join(dir, 'd.jsonl') })
    const shared = C.shareDecisionRow({ kind: 'share', shareId: 's1', workspace: 'Canvas', org: 'Acme' }, 10)
    const opened = C.shareDecisionRow({ kind: 'open', shareId: 's1', workspace: 'Canvas', role: 'editor' }, 11)
    const made = C.shareDecisionRow({ kind: 'role', shareId: 's1', workspace: 'Canvas', who: 'octo', userId: 'u9', role: 'viewer' }, 12)
    const removed = C.shareDecisionRow({ kind: 'role', shareId: 's1', workspace: 'Canvas', who: 'user u9', userId: 'u9', role: null }, 13)
    const results = []
    for (const r of [shared, opened, made, removed]) results.push(await C.recordDecision(ledger, audit, r))
    let mirrored = 0
    const refused = await C.recordDecision({ append: async () => { throw new Error('disk full') } }, { record: () => { mirrored += 1 } }, shared)
    const read = audit.list(10)
    const timeline = await ledger.timeline({ runId: 'share-s1' }, 10)
    rmSync(dir, { recursive: true, force: true })
    ok('share.audit.1 a share, an open, a role set and a removal are person rows in their own words with the ids in the detail, on the ledger under the share\'s run id and mirrored to the audit; a row the ledger refused never reaches the audit',
      shared.title === 'Shared “Canvas” with Acme' && opened.title === 'Opened the shared workspace “Canvas” here, as editor' &&
        made.title === 'Made octo viewer of “Canvas”' && removed.title === 'Removed user u9 from “Canvas”' && made.detail === 'share s1 · user u9' &&
        [shared, opened, made, removed].every((r) => r.source === 'person' && r.event === 'permission' && r.runId === 'share-s1') &&
        results.every((r) => r === true) && read.rows.length === 4 && read.rows[0].title === removed.title &&
        timeline.entries.length === 4 && refused === false && mirrored === 0,
      JSON.stringify({ results, refused, mirrored, read: read.rows.map((r) => r.title), timeline: timeline.entries.length }))
  }
  // M374 — ledger.landed.1. The run ledger says whether a row reached its
  //     file, and never rejects: a row for a directory that is not there
  //     resolves false (and the queue keeps working for the next row), so
  //     `recordDecision` refuses it and the audit never mirrors a decision
  //     the ledger did not record.
  {
    const dir = mkdtempSync(join(tmpdir(), 'tc ledger landed '))
    const good = C.createRunLedger({ file: join(dir, 'ledger.jsonl') })
    const bad = C.createRunLedger({ file: join(dir, 'missing', 'ledger.jsonl') })
    const audit = C.createDecisionAudit({ file: join(dir, 'd.jsonl') })
    const row = C.shareDecisionRow({ kind: 'share', shareId: 's2', workspace: 'Canvas', org: 'Acme' }, 20)
    let rejected = false
    const badLanded = await bad.append(row).catch(() => { rejected = true; return null })
    const badAgain = await bad.append(row).catch(() => { rejected = true; return null })
    const goodLanded = await good.append(row)
    const refused = await C.recordDecision(bad, audit, row)
    const recorded = await C.recordDecision(good, audit, row)
    const read = audit.list(10)
    rmSync(dir, { recursive: true, force: true })
    ok('ledger.landed.1 the run ledger resolves whether a row reached its file and never rejects, and recordDecision mirrors only a row that landed',
      badLanded === false && badAgain === false && !rejected && goodLanded === true && refused === false && recorded === true && read.rows.length === 1,
      JSON.stringify({ badLanded, badAgain, rejected, goodLanded, refused, recorded, audit: read.rows.length }))
  }
  // M366 — toolbox.door.1. Main's toolbox read, lifted out of `toolbox:read`'s
  //     closure, answers the three refusals by their own sentences, reads a
  //     real project's skill, and asks plugins once for two readers of one
  //     directory (the cache's rule survives the lift).
  {
    const dir = mkdtempSync(join(tmpdir(), 'tc toolbox door '))
    const home = join(dir, 'home'); const proj = join(dir, 'proj')
    require('node:fs').mkdirSync(join(proj, '.claude', 'skills', 'review'), { recursive: true })
    require('node:fs').mkdirSync(home, { recursive: true })
    require('node:fs').writeFileSync(join(proj, '.claude', 'skills', 'review', 'SKILL.md'), '---\nname: review\ndescription: Reviews.\n---\n')
    require('node:fs').writeFileSync(join(dir, 'a-file'), 'x')
    let pluginAsks = 0
    const door = C.createToolboxDoor({ cache: new C.ToolboxCache(), home: () => home, stampsFor: () => undefined, listPlugins: async () => { pluginAsks += 1; return { kind: 'ok', plugins: [] } } })
    const none = await door({ panelId: 'p', cwd: '' })
    const relative = await door({ panelId: 'p', cwd: 'proj' })
    const file = await door({ panelId: 'p', cwd: join(dir, 'a-file') })
    const gone = await door({ panelId: 'p', cwd: join(dir, 'nope') })
    const first = await door({ panelId: 'p1', cwd: proj })
    const second = await door({ panelId: 'p2', cwd: proj })
    rmSync(dir, { recursive: true, force: true })
    const has = C.capabilityOf('/review', first)
    ok('toolbox.door.1 the lifted toolbox door refuses no directory, a relative path, a file and a missing folder by their own sentences, reads a real project skill, and asks plugins once for two readers of one directory',
      none.kind === 'no-cwd' && relative.kind === 'unavailable' && /not an absolute path/.test(relative.reason) &&
        file.kind === 'unavailable' && /a file, not a directory/.test(file.reason) && gone.kind === 'unavailable' && /no longer there/.test(gone.reason) &&
        has !== null && has.kind === 'has' && has.matches[0].scope === 'project' && second.kind === 'inventory' && pluginAsks === 1,
      JSON.stringify({ none, relative, file, gone, has, pluginAsks }))
  }
  // M398 — toolbox.fence.1. The shot harness fences the toolbox's USER arm
  //     (TC_TOOLBOX_HOME), but the starter's chat sits in `~`, and its
  //     PROJECT arm (`join(cwd, '.claude')`) read the developer's real
  //     ~/.claude straight into the `starter` golden: real skills, hooks and
  //     628 allow rules. Through the same door `toolbox:read` answers, with a
  //     fenced home: `~` (the starter's cwd) and the real home's own path both
  //     read ONLY under the fence, every source and permission file included,
  //     and a folder that is not home is left alone.
  {
    const fs = require('node:fs')
    const dir = mkdtempSync(join(tmpdir(), 'tc toolbox fence '))
    const fenced = join(dir, 'home'); const proj = join(dir, 'proj')
    fs.mkdirSync(join(fenced, '.claude', 'skills', 'fenced-only'), { recursive: true })
    fs.writeFileSync(join(fenced, '.claude', 'skills', 'fenced-only', 'SKILL.md'), '---\nname: fenced-only\ndescription: Planted.\n---\n')
    fs.writeFileSync(join(fenced, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }))
    fs.mkdirSync(proj, { recursive: true })
    const door = C.createToolboxDoor({ cache: new C.ToolboxCache(), home: () => fenced, stampsFor: () => undefined, listPlugins: async () => ({ kind: 'ok', plugins: [] }) })
    const under = (p) => typeof p === 'string' && (p === fenced || p.startsWith(fenced + '/'))
    const fencedOnly = (r) => r.kind === 'inventory' && under(r.inventory.cwd) &&
      r.inventory.sources.length > 0 && r.inventory.sources.every((x) => under(x.path)) &&
      r.inventory.permissions.every((x) => under(x.path)) &&
      r.inventory.entries.filter((e) => e.kind === 'skill').every((e) => e.name === 'fenced-only')
    const tilde = await door({ panelId: 'starter-chat', cwd: '~' })
    const realHome = await door({ panelId: 'starter-chat', cwd: require('node:os').homedir() })
    const other = await door({ panelId: 'p', cwd: proj })
    rmSync(dir, { recursive: true, force: true })
    const leak = (r) => r.kind !== 'inventory' ? r : { cwd: r.inventory.cwd, outside: [...r.inventory.sources, ...r.inventory.permissions].map((x) => x.path).filter((p) => !under(p)).length, skills: r.inventory.entries.filter((e) => e.kind === 'skill').length }
    ok('toolbox.fence.1 under a fenced toolbox home, a toolbox read of ~ (the starter chat\'s cwd) and of the real home\'s own path reads only under the fence, both arms, and a folder that is not home keeps its own project arm',
      fencedOnly(tilde) && fencedOnly(realHome) && C.capabilityOf('/fenced-only', tilde)?.kind === 'has' &&
        other.kind === 'inventory' && other.inventory.cwd === proj,
      JSON.stringify({ tilde: leak(tilde), realHome: leak(realHome), other: other.kind === 'inventory' ? other.inventory.cwd : other }))
  }
  // M366 — toolbox.1. `tc toolbox <name>` is the palette's "Which agents
  //     can…" from a shell: the CLI builds it, the protocol refuses an empty
  //     or multi-line name, and the handler reads each DISTINCT tools
  //     directory the canvas named once, answers every panel that has one
  //     in the palette's words, has-first, and refuses by name with no
  //     window or no toolbox door.
  {
    const built = C.buildRequest(['toolbox', 'review'], {})
    const two = C.buildRequest(['toolbox', 'git', 'review'], {})
    const bare = C.buildRequest(['toolbox'], {})
    const parsed = C.parseControlLine('{"verb":"toolbox","name":"/review"}')
    const empty = C.parseControlLine('{"verb":"toolbox","name":"/"}')
    const multi = C.parseControlLine(JSON.stringify({ verb: 'toolbox', name: 'a\nb' }))
    const inv = (names) => ({ kind: 'inventory', inventory: { entries: names.map((n) => ({ kind: 'skill', name: n, scope: 'project', active: { kind: 'active' } })), overflow: { skills: 0, commands: 0, agents: 0, mcp: 0, hooks: 0, total: 0 }, pluginsEnabled: [], freshness: { kind: 'unknown' } } })
    const reads = []
    const base = { presets: () => [], defaultId: () => null, exists: () => true, spawn: () => {}, list: () => [], focus: () => true }
    const canvas = async () => ({ panels: [
      { id: 'a1', kind: 'chat', state: 'idle', title: 'lint seat', toolsCwd: '/a' },
      { id: 'b1', kind: 'chat', state: 'idle', title: 'review seat', toolsCwd: '/b' },
      { id: 'a2', kind: 'terminal', state: 'idle', toolsCwd: '/a' },
      { id: 'n1', kind: 'note', state: 'not started' }
    ], edges: [], runs: [] })
    const toolbox = async (req) => { reads.push(req.cwd); return req.cwd === '/b' ? inv(['review']) : inv([]) }
    const answered = await C.createControlHandler({ ...base, canvas, toolbox })({ verb: 'toolbox', name: 'Review' })
    const noWindow = await C.createControlHandler({ ...base, canvas: async () => null, toolbox })({ verb: 'toolbox', name: 'review' })
    const noDoor = await C.createControlHandler({ ...base, canvas })({ verb: 'toolbox', name: 'review' })
    const empty2 = await C.createControlHandler({ ...base, canvas: async () => ({ panels: [], edges: [], runs: [] }), toolbox })({ verb: 'toolbox', name: 'review' })
    const rows = answered.panels ?? []
    ok('toolbox.1 tc toolbox <name> builds and parses (an empty or multi-line name refused), reads each distinct tools directory once, answers every panel with one in the palette\'s words has-first, and refuses by name with no window or no door',
      built.kind === 'ok' && JSON.parse(built.line).name === 'review' && JSON.parse(two.line).name === 'git review' && bare.kind === 'usage' &&
        parsed.kind === 'ok' && parsed.req.name === '/review' && empty.kind === 'bad' && multi.kind === 'bad' &&
        answered.ok === true && answered.name === 'review' && reads.sort().join(',') === '/a,/b' &&
        rows.map((r) => r.id).join(',') === 'b1,a1,a2' && rows[0].answer === 'has' && rows[0].words === 'has skill review · project' &&
        rows[1].words === 'no review' && rows[2].label === 'a2' && !rows.some((r) => r.id === 'n1') &&
        noWindow.ok === false && /did not answer/.test(noWindow.error) && noDoor.ok === false && /cannot read toolboxes/.test(noDoor.error) &&
        empty2.ok === true && /no panel/.test(empty2.note),
      JSON.stringify({ built, two, bare, parsed, empty, multi, answered, noWindow, noDoor, empty2, reads }))
  }
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length === 0 ? 0 : 1)
})()
