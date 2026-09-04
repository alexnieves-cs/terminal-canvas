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
    ok('url.1 the URL door yields the same open request, decoded; a command, another verb and another scheme are refused',
      p !== null && u.kind === 'ok' && u.req.verb === 'open' && u.req.preset === 'claude' && u.req.cwd === '/Users/x/my repo' &&
        bare.kind === 'ok' && bare.req.preset === undefined && bare.req.cwd === undefined &&
        cmd.kind === 'bad' && other.kind === 'bad' && wrong.kind === 'bad',
      p ? JSON.stringify({ u, bare, cmd, other, wrong }) : 'parseControlUrl is not exported')
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

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length === 0 ? 0 : 1)
})()
