/* Run with: node scripts/verify-borrow.cjs
   Lane G (M530–M539): the ideas a scan of similar apps found missing here
   (docs/streams/borrow.md). Plain node: each module is bundled with esbuild
   and driven with fixtures, so no Electron, shell, CLI or network is touched.
   Every check reports even when its module fails to load, so one missing
   export cannot hide the rest. */
const { buildSync } = require('esbuild')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '..')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ALIAS = { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }
function load(entry, name) {
  try {
    const outfile = join(ROOT, 'out/verify', `borrow-${name}.cjs`)
    buildSync({ entryPoints: [join(ROOT, entry)], outfile, bundle: true, platform: 'node', format: 'cjs', alias: ALIAS, logLevel: 'silent' })
    return { mod: require(outfile) }
  } catch (error) {
    return { error: error.message.split('\n')[0] }
  }
}
const check = (id, loaded, test) => {
  if (loaded.mod === undefined) { ok(id, false, loaded.error); return }
  try {
    const r = test(loaded.mod)
    ok(id, r.pass, JSON.stringify(r.detail).slice(0, 400))
  } catch (error) { ok(id, false, error.message) }
}

const presets = load('src/main/presets.ts', 'presets')
const env = load('src/main/env-report.ts', 'env')
const onboarding = load('src/shared/onboarding.ts', 'onboarding')
const rows = load('src/renderer/palette/commands/environment-rows.ts', 'env-rows')

const AGENTS = { gemini: 'gemini', opencode: 'opencode', 'cursor-agent': 'cursor-agent', amp: 'amp', kimi: 'kimi' }

const report = (found, extra = {}) => env.mod.buildEnvReport({
  env: { PATH: '/fixture/bin' },
  shell: { path: '/bin/zsh', ok: true },
  which: (name) => (found.includes(name) ? `/fixture/bin/${name}` : null),
  backend: { kind: 'direct', reason: 'fixture', tmuxPath: null },
  layoutPath: '/fixture/layout.json',
  backupWritten: false,
  now: 1,
  control: null,
  probe: { shells: ['/bin/zsh'], timedOut: false },
  ...extra
})

// G1 — borrow.agents.1. Each new agent is a built-in preset running its own
//      CLI, with no `agent` kind: AgentKind drives cost and transcript
//      parsing that none of these CLIs has been measured for, and a wrong
//      kind would parse their output as Claude's.
check('borrow.agents.1 Gemini CLI, OpenCode, Cursor Agent, Amp and Kimi are built-in presets that run their CLI and claim no agent kind', presets, (L) => {
  const all = L.allPresets([])
  const found = Object.entries(AGENTS).map(([id, command]) => all.find((p) => p.id === id && p.command === command))
  return { pass: found.every((p) => p !== undefined && p.agent === undefined && p.args.length === 0 && p.cwd === '~'), detail: found }
})

// borrow.agents.2. Built-ins stay ahead of user presets and the shell stays
//      the fallback default, so adding rows moved nothing a person relies on.
check('borrow.agents.2 the login shell is still the first built-in and ids stay unique', presets, (L) => {
  const ids = L.BUILT_IN_PRESETS.map((p) => p.id)
  return { pass: ids[0] === 'shell' && new Set(ids).size === ids.length && L.resolveDefault([], 'nope').id === 'shell', detail: ids }
})

// borrow.agents.3. The report probes the optional agents, but a missing one
//      is never told to install: probeOutcome stays `found` on a machine with
//      claude, codex and git and none of the five.
check('borrow.agents.3 the environment report lists the agent CLIs, and a missing optional agent never turns the outcome into not-found', env, (E) => {
  const base = report(['claude', 'codex', 'git'])
  const names = base.clis.map((c) => c.name)
  const outcome = E.probeOutcome(base)
  const missingRequired = E.probeOutcome(report(['claude', 'git', 'gemini']))
  return {
    pass: Object.keys(AGENTS).every((n) => names.includes(n)) && outcome.kind === 'found' && !/gemini|opencode|kimi|amp|cursor/.test(outcome.sentence) &&
      missingRequired.kind === 'not-found' && /codex/.test(missingRequired.sentence) && !/opencode/.test(missingRequired.sentence),
    detail: { names, outcome, missingRequired }
  }
})

// borrow.agents.4. Onboarding has offered Gemini since M180 with no probe,
//      so the row always read as "discovery did not answer". Now it answers
//      installed or missing like the other two.
check('borrow.agents.4 onboarding\'s Gemini row reads the report: installed when gemini is on PATH, missing when not', onboarding, (O) => {
  if (env.mod === undefined) return { pass: false, detail: env.error }
  const withIt = O.probesFromReport(report(['claude', 'gemini'])).find((p) => p.id === 'gemini')
  const without = O.probesFromReport(report(['claude'])).find((p) => p.id === 'gemini')
  return { pass: withIt !== undefined && withIt.path === '/fixture/bin/gemini' && without !== undefined && without.path === null && without.timedOut !== true, detail: { withIt, without } }
})

// borrow.agents.5. The palette's Environment door counts required CLIs
//      apart from optional agents: "3 of 8 CLIs found" would read as five
//      faults on a machine set up exactly as it needs to be.
check('borrow.agents.5 the Environment door counts required CLIs apart and names the extra agents found', rows, (R) => {
  if (env.mod === undefined) return { pass: false, detail: env.error }
  const plain = R.environmentCount(report(['claude', 'codex', 'git']))
  const more = R.environmentCount(report(['claude', 'codex', 'git', 'gemini', 'amp']))
  const row = R.buildEnvironmentRows(report(['claude', 'codex', 'git'])).find((r) => r.id === 'env.cli.kimi')
  return { pass: plain === '3 of 3 CLIs found' && more === '3 of 3 CLIs found · 2 more agents' && row !== undefined && /optional/.test(row.subtitle), detail: { plain, more, row: row && row.subtitle } }
})

// G2 — phone.*. Answer from the phone (src/main/phone-answers.ts). Every arm
//      runs over a fake clock, code source, GET and pending list: no network.
const answersMod = load('src/main/phone-answers.ts', 'phone-answers')
const alertsMod = load('src/main/phone-alerts.ts', 'phone-alerts')
function rig(overrides = {}) {
  const state = {
    t: 1_000_000, n: 0, answers: true, topic: 'tc-k7Qx9vLm2RtY8wPz4N', gets: [], answered: [], recorded: [],
    pending: { p1: [{ requestId: 'r1', toolName: 'Bash' }], plan: [{ requestId: 'r9', toolName: 'ExitPlanMode' }], ext: [{ requestId: 'tc-ext-1', toolName: 'credential' }] },
    replies: []
  }
  Object.assign(state, overrides)
  const A = answersMod.mod.createPhoneAnswers({
    settings: () => ({ topic: state.topic, server: 'https://ntfy.example', idleMinutes: 0, answers: state.answers }),
    now: () => state.t,
    code: () => (state.n++).toString(16).padStart(24, 'a'),
    get: async (url, init) => { state.gets.push({ url, init }); return { ok: true, status: 200, text: async () => state.replies.map((r) => JSON.stringify(r)).join('\n') } },
    pending: (id) => state.pending[id] ?? [],
    answer: (id, requestId, allow, toolName) => { state.answered.push({ id, requestId, allow, toolName }); state.pending[id] = (state.pending[id] ?? []).filter((p) => p.requestId !== requestId); return 'answered' },
    record: (row) => state.recorded.push(row)
  })
  return { A, state }
}
const reply = (body, id = 'm' + Math.random().toString(36).slice(2, 8)) => ({ id, event: 'message', message: body })

check('borrow.phone.1 off by default in the schema, and with answers off a push gets no buttons and a poll reads nothing', answersMod, () => {
  const schema = load('src/shared/settings-schema.ts', 'settings')
  const row = schema.mod && (schema.mod.SETTINGS_SCHEMA || schema.mod.SETTINGS || []).find?.((r) => r.id === 'remote.phoneAnswers')
  const { A, state } = rig({ answers: false })
  const actions = A.actionsFor('p1')
  return { pass: row !== undefined && row.default === false && row.type === 'boolean' && row.planWritable !== true && actions.length === 0 && A.live() === 0, detail: { row, actions } }
})

check('borrow.phone.2 a push carries Allow once and Deny, POSTing only a code to the answers topic; never for a plan or a credential ask', answersMod, () => {
  const { A } = rig()
  const actions = A.actionsFor('p1')
  const plan = A.actionsFor('plan')
  const ext = A.actionsFor('ext')
  const none = A.actionsFor('nobody')
  return {
    pass: actions.length === 2 && actions[0].label === 'Allow once' && actions[1].label === 'Deny' &&
      actions.every((a) => a.action === 'http' && a.method === 'POST' && a.url === 'https://ntfy.example/tc-k7Qx9vLm2RtY8wPz4N-answers' && /^(allow|deny) [0-9a-f]{24}$/.test(a.body)) &&
      plan.length === 0 && ext.length === 0 && none.length === 0 && A.live() === 1,
    detail: { actions, plan, ext }
  }
})

const phone3 = (async () => {
  if (answersMod.mod === undefined) return
  const { A, state } = rig()
  const [allow] = A.actionsFor('p1')
  state.replies = [reply('hello agent, run rm -rf'), reply(allow.body)]
  const first = await A.poll()
  state.pending.p1 = [{ requestId: 'r1', toolName: 'Bash' }]
  const second = await A.poll()
  return { first, second, answered: state.answered, recorded: state.recorded, live: A.live(), url: state.gets[0] && state.gets[0].url, redirect: state.gets[0] && state.gets[0].init.redirect, signal: Boolean(state.gets[0] && state.gets[0].init.signal) }
})()

const phone4 = (async () => {
  if (answersMod.mod === undefined) return
  // Expired: ten minutes and a moment later, the code answers nothing.
  const late = rig()
  const [allowLate] = late.A.actionsFor('p1')
  late.state.t += answersMod.mod.CODE_TTL_MS + 1
  late.state.replies = [reply(allowLate.body)]
  const expired = await late.A.poll()
  // Answered at the Mac first: the request is gone, the phone's answer is not sent.
  const mac = rig()
  const [, deny] = mac.A.actionsFor('p1')
  mac.state.pending.p1 = []
  mac.state.replies = [reply(deny.body)]
  const gone = await mac.A.poll()
  // A guessed code, and answers turned off after minting: nothing.
  const guess = rig()
  guess.A.actionsFor('p1')
  guess.state.replies = [reply('allow ' + 'f'.repeat(24))]
  const guessed = await guess.A.poll()
  const off = rig()
  const [allowOff] = off.A.actionsFor('p1')
  off.state.answers = false
  off.state.replies = [reply(allowOff.body)]
  const switchedOff = await off.A.poll()
  // The critic's first finding: an ACP agent restarts and its new request reuses the id for another tool.
  const reuse = rig()
  const [allowReuse] = reuse.A.actionsFor('p1')
  reuse.state.pending.p1 = [{ requestId: 'r1', toolName: 'Bash', input: { command: 'rm -rf ~' } }]
  reuse.state.replies = [reply(allowReuse.body)]
  const reused = await reuse.A.poll()
  // A short topic is guessable, and with answers on it mints nothing.
  const short = rig({ topic: 'tc-short' })
  const shortActions = short.A.actionsFor('p1')
  return { expired, lateAnswered: late.state.answered, gone, macAnswered: mac.state.answered, guessed, guessAnswered: guess.state.answered, switchedOff, offAnswered: off.state.answered, offGets: off.state.gets.length, reused, reuseAnswered: reuse.state.answered, shortActions }
})()

const phone5 = (async () => {
  if (alertsMod.mod === undefined) return
  const posts = []
  let minted = 0
  const mk = (idle) => alertsMod.mod.createPhoneAlerts({
    settings: () => ({ topic: 'tc-secret-topic', server: 'https://ntfy.example', idleMinutes: 1 }),
    idleSeconds: () => idle, now: () => 5_000_000,
    post: async (url, init) => { posts.push(JSON.parse(init.body)); return { ok: true, status: 200 } },
    actions: () => { minted++; return [{ action: 'http', label: 'Allow once', url: 'https://ntfy.example/x', method: 'POST', body: 'allow ' + 'a'.repeat(24), clear: true }] }
  })
  const away = await mk(600).entered('p1', 'api', 'claude asks to run Bash')
  const here = await mk(0).entered('p1', 'api', 'claude asks to run Bash')
  return { away, here, minted, posts }
})()

// G3 — reads.*. Allow every pending read (src/shared/read-batch.ts).
const batch = load('src/shared/read-batch.ts', 'read-batch')
check('borrow.reads.1 only Claude\'s read-only tools with known keys, inside a chat folder deeper than home, are in the batch; a write, a command, a web fetch, an ACP kind, an unknown key, a ~ path, a home or ~ folder, a read outside the folder or a ../ escape never is', batch, (B) => {
  const cwd = '/Users/me/api'
  const yes = [
    { toolName: 'Read', input: { file_path: '/Users/me/api/src/a.ts' } },
    { toolName: 'Read', input: { file_path: 'src/b.ts' } },
    { toolName: 'Grep', input: { pattern: 'TODO' } },
    { toolName: 'Grep', input: { pattern: 'x', path: 'src' } },
    { toolName: 'Glob', input: { pattern: '**/*.ts' } },
    { toolName: 'LS', input: { path: '/Users/me/api' } },
    { toolName: 'Read', input: { file_path: 'README.md', offset: 10, limit: 50 } }
  ]
  const no = [
    { toolName: 'Write', input: { file_path: 'src/a.ts' } },
    { toolName: 'Edit', input: { file_path: 'src/a.ts' } },
    { toolName: 'Bash', input: { command: 'cat src/a.ts' } },
    { toolName: 'WebFetch', input: { url: 'https://x.example/?q=secret' } },
    { toolName: 'Read', input: { file_path: '/Users/me/.ssh/id_ed25519' } },
    { toolName: 'Read', input: { file_path: '../other/secret.env' } },
    { toolName: 'Read', input: { file_path: '/Users/me/api-keys/x' } },
    { toolName: 'Glob', input: { pattern: '/etc/**' } },
    { toolName: 'Glob', input: { pattern: '../**/*.env' } },
    { toolName: 'Grep', input: { pattern: 'x', path: '/' } },
    { toolName: 'Read', input: { file_path: 42 } },
    { toolName: 'Read', input: { file_path: '' } },
    { toolName: 'read', input: { file_path: 'README.md' } },
    { toolName: 'Read', input: { file_path: 'README.md', absolute_path: '/Users/me/.ssh/id_rsa' } },
    { toolName: 'Read', input: { file_path: '~/.aws/credentials' } },
    { toolName: 'Glob', input: { pattern: '{/etc,x}/*' } },
    { toolName: 'Glob', input: { pattern: 'src/**/../../x' } }
  ]
  const yesOk = yes.map((a) => B.batchAllowable(a, cwd))
  const noOk = no.map((a) => B.batchAllowable(a, cwd))
  const rootCwd = B.batchAllowable({ toolName: 'Read', input: { file_path: '/etc/hosts' } }, '/')
  const noCwd = B.batchAllowable({ toolName: 'Grep', input: { pattern: 'x' } }, undefined)
  const tildeCwd = B.batchAllowable({ toolName: 'Read', input: { file_path: '.ssh/id_rsa' } }, '~')
  const homeCwd = B.batchAllowable({ toolName: 'Read', input: { file_path: '.ssh/id_rsa' } }, '/Users/me')
  const acp = B.batchAllowable({ toolName: 'Read', input: { file_path: 'a.ts' } }, cwd, 'acp')
  return { pass: yesOk.every(Boolean) && noOk.every((v) => !v) && !rootCwd && !noCwd && !tildeCwd && !homeCwd && !acp, detail: { yesOk, noOk, rootCwd, noCwd, tildeCwd, homeCwd, acp } }
})
check('borrow.reads.2 readsToAllow lists every allowable request across chats, in order, and nothing else', batch, (B) => {
  const out = B.readsToAllow([
    { id: 'a', cwd: '/w/x/a', backend: 'claude', pending: [{ requestId: '1', toolName: 'Read', input: { file_path: 'x' } }, { requestId: '2', toolName: 'Bash', input: { command: 'ls' } }] },
    { id: 'b', cwd: '/w/x/b', backend: 'claude', pending: [{ requestId: '3', toolName: 'Glob', input: { pattern: '*.md' } }] },
    { id: 'c', cwd: undefined, backend: 'claude', pending: [{ requestId: '4', toolName: 'Read', input: { file_path: 'x' } }] },
    { id: 'd', cwd: '/w/x/d', backend: 'acp', pending: [{ requestId: '5', toolName: 'Read', input: { file_path: 'x' } }] }
  ])
  return { pass: JSON.stringify(out) === JSON.stringify([{ panelId: 'a', requestId: '1' }, { panelId: 'b', requestId: '3' }]), detail: out }
})
const shortcuts = load('src/shared/shortcuts.ts', 'shortcuts')
check('borrow.reads.3 ⌘⌥Y is the registry\'s allow-reads chord with a handler, no other row claims it, and the key handler and palette row call the batch', shortcuts, (S) => {
  const { readFileSync } = require('node:fs')
  const row = S.SHORTCUTS.find((r) => r.id === 'allow-reads')
  const clash = S.SHORTCUTS.filter((r) => r.chord === '⌘⌥Y')
  const tail = readFileSync(join(ROOT, 'src/renderer/canvas/useShellTail.ts'), 'utf8')
  const palette = readFileSync(join(ROOT, 'src/renderer/palette/commands.ts'), 'utf8')
  const pass = row !== undefined && row.chord === '⌘⌥Y' && clash.length === 1 && S.SHORTCUT_HANDLERS['allow-reads'] === 'allowPendingReads' &&
    /hit\?\.id === 'allow-reads'[\s\S]{0,400}pendingReadBatch\(/.test(tail) && /'approval\.allow-reads'[\s\S]{0,600}run: \(\) => \{ for \(const r of pendingReadBatch\(/.test(palette) &&
    !/scope: 'session'/.test(tail.slice(tail.indexOf("'allow-reads'"), tail.indexOf("'allow-reads'") + 600))
  return { pass, detail: { row, clash: clash.length } }
})

;(async () => {
  const p3 = await phone3.catch((e) => ({ error: e.message }))
  if (p3) {
    const pass = !p3.error && p3.first.length === 1 && p3.first[0].allow === true && p3.first[0].outcome === 'answered' &&
      p3.answered.length === 1 && p3.answered[0].requestId === 'r1' && p3.recorded.length === 1 &&
      p3.second.length === 0 && p3.live === 0 && p3.recorded[0].outcome === 'answered' && p3.signal === true && /\/tc-k7Qx9vLm2RtY8wPz4N-answers\/json\?poll=1&since=/.test(p3.url) && p3.redirect === 'error'
    ok("borrow.phone.3 a matching reply answers allow-once through the person's path, is recorded, and the code is spent: a replay does nothing", pass, JSON.stringify(p3).slice(0, 400))
  } else ok("borrow.phone.3 a matching reply answers allow-once through the person's path, is recorded, and the code is spent: a replay does nothing", false, answersMod.error)
  const p4 = await phone4.catch((e) => ({ error: e.message }))
  if (p4) {
    const pass = !p4.error && p4.expired.length === 0 && p4.lateAnswered.length === 0 &&
      p4.gone.length === 1 && p4.gone[0].outcome === 'gone' && p4.macAnswered.length === 0 &&
      p4.guessed.length === 0 && p4.guessAnswered.length === 0 &&
      p4.switchedOff.length === 0 && p4.offAnswered.length === 0 && p4.offGets === 0 &&
      p4.reused.length === 1 && p4.reused[0].outcome === 'gone' && p4.reuseAnswered.length === 0 && p4.shortActions.length === 0
    ok('borrow.phone.4 an expired code, a request already answered at the Mac, a guessed code, answers switched off after minting, a reused request id naming another tool and a short topic each answer nothing', pass, JSON.stringify(p4).slice(0, 400))
  } else ok('borrow.phone.4 an expired code, a request already answered at the Mac, a guessed code, answers switched off after minting, a reused request id naming another tool and a short topic each answer nothing', false, answersMod.error)
  const p5 = await phone5.catch((e) => ({ error: e.message }))
  if (p5) {
    const pass = !p5.error && p5.away === 'send' && p5.here === 'not-idle' && p5.minted === 1 && p5.posts.length === 1 &&
      Array.isArray(p5.posts[0].actions) && p5.posts[0].actions.length === 1
    ok('borrow.phone.5 the alert carries the buttons only when actions are given, minted only for a push that is really sent', pass, JSON.stringify(p5).slice(0, 400))
  } else ok('borrow.phone.5 the alert carries the buttons only when actions are given, minted only for a push that is really sent', false, alertsMod.error)
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
  if (results.some((r) => !r.pass)) process.exitCode = 1
})()
