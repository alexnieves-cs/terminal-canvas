/* Verifies M252: "Describe a tool" — the reply parser, what a tool can do,
   and the one-shot generator.
   Run with: npm run verify:tool

   Plain node. The generator runs over a FAKE AgentRunner that records every
   spawn and every kill, so the facts that matter are countable: the agent is
   given no tools, exactly one process is started, the app's files land only
   under tools/<slug>/, and a workflow writes nothing to disk at all. What a
   tool does once it exists is the renderer's (verify:panels:product tool.*);
   this suite proves what arrives, and that it arrives describable. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const root = join(__dirname, '..')
const OUT = join(root, 'out', 'verify', 'tool.cjs')
mkdirSync(join(root, 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'tool-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias: { '@shared': join(root, 'src', 'shared') }
})
const T = require(OUT)

// The CLI's --output-format json envelope, in both shapes the parser accepts:
// the schema-validated object beside the text, or the object AS the text.
const envelope = (obj, asText = false) => JSON.stringify(asText
  ? { type: 'result', subtype: 'success', is_error: false, result: '```json\n' + JSON.stringify(obj) + '\n```' }
  : { type: 'result', subtype: 'success', is_error: false, result: 'done', structured_output: obj })

const WORKFLOW = {
  kind: 'workflow', name: 'Nightly check', description: 'fetch the status page, then run the tests and leave a note',
  nodes: [
    { key: 'n1', kind: 'http', url: 'https://status.example.com/api', method: 'GET', dx: 0, dy: 0 },
    { key: 'n2', kind: 'terminal', command: 'npm', args: ['test'], dx: 320, dy: 0 },
    { key: 'n3', kind: 'action', line: 'note-add sticky tests ran', dx: 640, dy: 0 },
    { key: 'n4', kind: 'teleport', dx: 0, dy: 200 }
  ],
  edges: [{ from: 'n1', to: 'n2', trigger: 'exit' }, { from: 'n2', to: 'n3', trigger: 'exit' }, { from: 'n3', to: 'n4', trigger: 'exit' }]
}
const APP = {
  kind: 'app', name: 'Stop Watch!', description: 'a stopwatch in the browser', port: 4173, devScript: 'python3 -m http.server 4173',
  files: [
    { path: 'index.html', text: '<!doctype html><script src="app.js"></script><link href="https://fonts.example.org/x.css">' },
    { path: 'app.js', text: 'fetch("https://time.example.net/now")' }
  ]
}

// A fake AgentRunner: one recorded spawn, stdout in one chunk, then an exit —
// or, for the timeout arm, no exit until killed.
function fakeRunner(stdout, opts = {}) {
  const spawns = []
  const kills = []
  const runner = (spawn) => {
    spawns.push(spawn)
    let onData = () => {}, onExit = () => {}
    const proc = {
      pid: 4242,
      write: () => {},
      onData: (cb) => { onData = cb },
      onExit: (cb) => { onExit = cb },
      kill: () => { kills.push(spawn); setTimeout(() => onExit({ code: null, signal: 'SIGTERM' }), 0) }
    }
    if (!opts.hang) setTimeout(() => { onData(stdout); onExit({ code: opts.code ?? 0, signal: null, ...(opts.stderr ? { stderr: opts.stderr } : {}) }) }, 0)
    return proc
  }
  return { runner, spawns, kills }
}

;(async () => {
  const folder = mkdtempSync(join(tmpdir(), 'tc tool '))
  try {
    // --- the reply ---------------------------------------------------------
    const wf = T.parseToolReply?.(envelope(WORKFLOW), folder)
    const wfText = T.parseToolReply?.(envelope(WORKFLOW, true), folder)
    ok('tool.parse.1 a workflow reply parses from the schema object AND from a fenced JSON result, through the real template parser, with every node given the tool\'s folder as its cwd',
      wf?.kind === 'workflow' && wfText?.kind === 'workflow' && wf.name === 'Nightly check' &&
        JSON.stringify(wf.nodes.map((n) => n.kind)) === JSON.stringify(['http', 'terminal', 'action']) &&
        wf.nodes.every((n) => n.cwd === folder),
      JSON.stringify({ wf, wfText: wfText?.kind }))
    ok('tool.parse.2 a node of an unknown kind costs THAT node and its edges, never the tool, and is named in `dropped`',
      wf?.kind === 'workflow' && !wf.nodes.some((n) => n.key === 'n4') && wf.edges.length === 2 &&
        wf.dropped.some((d) => /n4/.test(d) && /kind/.test(d)),
      JSON.stringify({ dropped: wf?.dropped, edges: wf?.edges }))
    const app = T.parseToolReply?.(envelope(APP), folder)
    const escape = T.parseToolReply?.(envelope({ ...APP, files: [...APP.files, { path: '../../.zshrc', text: 'rm -rf ~' }] }), folder)
    const absolute = T.parseToolReply?.(envelope({ ...APP, files: [...APP.files, { path: '/etc/hosts', text: 'x' }] }), folder)
    const noIndex = T.parseToolReply?.(envelope({ ...APP, files: [{ path: 'app.js', text: '1' }] }), folder)
    ok('tool.parse.3 an app reply is its files under a slug of its name; a path that climbs out, an absolute path, or no index.html refuses the WHOLE app by name',
      app?.kind === 'app' && app.slug === 'stop-watch' && app.files.length === 2 && app.port === 4173 &&
        escape?.kind === 'refused' && /\.\.\/\.\.\/\.zshrc/.test(escape.reason) &&
        absolute?.kind === 'refused' && /\/etc\/hosts/.test(absolute.reason) &&
        noIndex?.kind === 'refused' && /index\.html/.test(noIndex.reason),
      JSON.stringify({ app: app && { kind: app.kind, slug: app.slug }, escape, absolute, noIndex }))
    const junk = T.parseToolReply?.('I would build a nice tool for you!', folder)
    const errorEnv = T.parseToolReply?.(JSON.stringify({ type: 'result', is_error: true, result: 'Credit balance is too low' }), folder)
    ok('tool.parse.4 an answer that is not a tool, and an error envelope, are refusals that say which',
      junk?.kind === 'refused' && /not a tool/.test(junk.reason) && errorEnv?.kind === 'refused' && /Credit balance is too low/.test(errorEnv.reason),
      JSON.stringify({ junk, errorEnv }))

    // --- what it can do ------------------------------------------------------
    const wfCaps = wf?.kind === 'workflow' ? T.toolCapabilities?.({ kind: 'workflow', nodes: wf.nodes }) : undefined
    ok('tool.caps.1 a workflow\'s reach is read off its nodes: the http node\'s host is its network, the terminal command and the action line are its commands',
      JSON.stringify(wfCaps?.network) === JSON.stringify(['status.example.com']) &&
        JSON.stringify(wfCaps?.commands) === JSON.stringify(['npm test', 'note-add sticky tests ran']) &&
        JSON.stringify(wfCaps?.files) === JSON.stringify([folder]),
      JSON.stringify(wfCaps))
    const appCaps = app?.kind === 'app' ? T.toolCapabilities?.({ kind: 'app', root: join(folder, 'tools', 'stop-watch'), devScript: app.devScript, files: app.files }) : undefined
    ok('tool.caps.2 an app\'s reach: the folder it lives in, every address named in its files, and the dev script it asks to run',
      JSON.stringify(appCaps?.files) === JSON.stringify([join(folder, 'tools', 'stop-watch')]) &&
        JSON.stringify(appCaps?.network) === JSON.stringify(['fonts.example.org', 'time.example.net']) &&
        JSON.stringify(appCaps?.commands) === JSON.stringify(['python3 -m http.server 4173']),
      JSON.stringify(appCaps))

    // --- the generator -------------------------------------------------------
    const can = typeof T.createToolGenerator === 'function'
    const gen = (fake, timeoutMs) => T.createToolGenerator({ runner: fake.runner, command: () => '/usr/local/bin/claude', env: () => ({ PATH: '/usr/bin' }), ...(timeoutMs ? { timeoutMs } : {}) })
    const f1 = fakeRunner(envelope(APP))
    const r1 = can ? await gen(f1).generate({ description: 'a stopwatch', folder }) : null
    const args = f1.spawns[0]?.args ?? []
    const toolsAt = args.indexOf('--tools')
    ok('tool.gen.1 ONE process, given NO tools (`--tools ""`), a JSON schema and print mode, stdin closed, in the tool\'s folder, with the description as its prompt',
      can && f1.spawns.length === 1 && f1.spawns[0].command === '/usr/local/bin/claude' && args[0] === '-p' &&
        toolsAt >= 0 && args[toolsAt + 1] === '' && args.includes('--json-schema') &&
        args[args.indexOf('--output-format') + 1] === 'json' && args[args.length - 1] === 'a stopwatch' &&
        f1.spawns[0].closeStdin === true && f1.spawns[0].cwd === folder,
      can ? JSON.stringify({ spawns: f1.spawns.length, args: args.map((a) => a.length > 40 ? a.slice(0, 40) + '…' : a) }) : 'createToolGenerator is not exported')
    const appRoot = join(folder, 'tools', 'stop-watch')
    const written = existsSync(appRoot) ? readdirSync(appRoot).sort() : []
    const pkg = existsSync(join(appRoot, 'package.json')) ? JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')) : null
    ok('tool.gen.2 an app\'s files are written ONLY under tools/<slug>/, with a package.json whose dev script is the one the inspector will show, and the result carries its capabilities',
      r1?.kind === 'app' && r1.root === appRoot && JSON.stringify(written) === JSON.stringify(['app.js', 'index.html', 'package.json']) &&
        pkg?.scripts?.dev === 'python3 -m http.server 4173' && r1.url === 'http://localhost:4173' &&
        existsSync(folder) && JSON.stringify(readdirSync(folder)) === JSON.stringify(['tools']) &&
        JSON.stringify(r1.capabilities?.commands) === JSON.stringify(['python3 -m http.server 4173']),
      JSON.stringify({ r1, written, pkg }))
    const f2 = fakeRunner(envelope(APP))
    const r2 = can ? await gen(f2).generate({ description: 'a stopwatch', folder }) : null
    ok('tool.gen.3 a second app of the same name gets its own folder and never overwrites the first',
      r2?.kind === 'app' && r2.root === join(folder, 'tools', 'stop-watch-2') && readFileSync(join(appRoot, 'app.js'), 'utf8') === APP.files[1].text,
      JSON.stringify({ r2: r2 && r2.root }))
    // Guarded: with the generator absent there is no tools/ folder, and a
    // throw here would end the suite before its tally — a red nobody can read.
    const toolsDir = () => existsSync(join(folder, 'tools')) ? readdirSync(join(folder, 'tools')).sort().join(',') : '(none)'
    const before = toolsDir()
    const f3 = fakeRunner(envelope(WORKFLOW))
    const r3 = can ? await gen(f3).generate({ description: 'a nightly check', folder }) : null
    ok('tool.gen.4 a workflow writes NOTHING to disk and arrives as a template marked reviewed: false, with its reach and its dropped node named',
      r3?.kind === 'workflow' && r3.template.reviewed === false && r3.template.name === 'Nightly check' &&
        // Two named omissions, not one: the unknown node AND the edge that
        // named it — a dropped edge is still something the answer said.
        r3.template.nodes.length === 3 && r3.dropped.length === 2 && r3.dropped.some((d) => /n4/.test(d)) && r3.dropped.some((d) => /edge/.test(d)) &&
        toolsDir() === before &&
        JSON.stringify(r3.capabilities?.network) === JSON.stringify(['status.example.com']),
      JSON.stringify({ r3: r3 && { kind: r3.kind, reviewed: r3.template?.reviewed, dropped: r3.dropped } }))
    const f4 = fakeRunner('', { code: 1, stderr: 'Error: not logged in' })
    const r4 = can ? await gen(f4).generate({ description: 'x', folder }) : null
    const f5 = fakeRunner('', { hang: true })
    const r5 = can ? await gen(f5, 30).generate({ description: 'x', folder }) : null
    const f6 = fakeRunner(envelope(APP))
    const r6 = can ? await gen(f6).generate({ description: '   ', folder }) : null
    const r7 = can ? await gen(f6).generate({ description: 'x', folder: join(folder, 'nope') }) : null
    ok('tool.gen.5 a failed run says the CLI\'s own words; a run that hangs is killed and says how long it waited; an empty description or a missing folder is refused WITHOUT starting anything',
      r4?.kind === 'refused' && /not logged in/.test(r4.reason) &&
        r5?.kind === 'refused' && /longer than/.test(r5.reason) && f5.kills.length === 1 &&
        r6?.kind === 'refused' && /describe/.test(r6.reason) && r7?.kind === 'refused' && /nope/.test(r7.reason) && f6.spawns.length === 0,
      JSON.stringify({ r4, r5, kills: f5.kills.length, r6, r7, f6: f6.spawns.length }))
  } finally { rmSync(folder, { recursive: true, force: true }) }
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length === 0 ? 0 : 1)
})().catch((error) => { console.error(error); process.exit(1) })
