/* Run with: node scripts/verify-vm.cjs
   Lane J (M550–M555): sandboxed lanes in a micro-VM (docs/streams/bold.md).
   Plain node: each module is bundled with esbuild and driven with fixtures.
   No VM runtime, CLI, network or Electron is touched — CI's macOS runners
   cannot run nested VMs, so the real-Mac check is manual-only and listed in
   docs/load-bearing.md. Every check reports even when its module fails to
   load, so one missing export cannot hide the rest. */
const { buildSync } = require('esbuild')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '..')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ALIAS = { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }
function load(entry, name) {
  try {
    const outfile = join(ROOT, 'out/verify', `vm-${name}.cjs`)
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

const lane = load('src/shared/vm-lane.ts', 'lane')
const sandbox = load('src/main/vm-sandbox.ts', 'sandbox')
const env = load('src/main/env-report.ts', 'env')
const rows = load('src/renderer/palette/commands/environment-rows.ts', 'env-rows')

const HOME = '/Users/fixture'
const SPEC = {
  runtime: 'apple', laneId: 'fix-login', worktree: '/Users/fixture/Library/Application Support/tc/worktrees/fix-login',
  stateDir: '/Users/fixture/Library/Application Support/tc/vm-lanes/fix-login', image: 'terminal-canvas/lane:1',
  cpus: 4, memoryMiB: 4096, allow: ['api.anthropic.com', '*.npmjs.org'], proxy: { host: '192.168.64.1', port: 47801 },
  authKeys: ['CLAUDE_CODE_OAUTH_TOKEN']
}
const facts = (over = {}) => ({
  platform: 'darwin', arch: 'arm64', macosMajor: 26,
  which: (n) => ({ container: '/usr/local/bin/container', docker: '/usr/local/bin/docker' })[n] ?? null,
  alive: () => true,
  ...over
})

// M550 — vm.probe.1. Apple's container is chosen first when it can run; a
// Mac below macOS 26 or an Intel Mac falls through to Docker, with the
// reason on Apple's row, never a silent skip.
check('vm.probe.1 Apple container is chosen on macOS 26 Apple silicon; macOS 15 or Intel falls through to Docker and says why', sandbox, (S) => {
  const a = S.probeVmRuntimes(facts())
  const old = S.probeVmRuntimes(facts({ macosMajor: 15 }))
  const intel = S.probeVmRuntimes(facts({ arch: 'x64' }))
  const apple = (p) => p.runtimes.find((r) => r.id === 'apple')
  return {
    pass: a.chosen === 'apple' && old.chosen === 'docker' && /macOS 26/.test(apple(old).why) && intel.chosen === 'docker' && /Apple silicon/.test(apple(intel).why),
    detail: { a: a.chosen, old: [old.chosen, apple(old).why], intel: [intel.chosen, apple(intel).why] }
  }
})

// vm.probe.2. Three states, never two: a binary whose service was not
// asked, or did not answer, is never usable; nothing found is chosen null.
check('vm.probe.2 a runtime not asked or not answering is never usable; no runtime is chosen null; off a Mac nothing is', sandbox, (S) => {
  const unasked = S.probeVmRuntimes(facts({ alive: undefined }))
  const down = S.probeVmRuntimes(facts({ alive: () => false }))
  const none = S.probeVmRuntimes(facts({ which: () => null }))
  const linux = S.probeVmRuntimes(facts({ platform: 'linux' }))
  return {
    pass: unasked.chosen === null && unasked.runtimes.every((r) => !r.usable) && down.chosen === null &&
      /container system start/.test(down.runtimes.find((r) => r.id === 'apple').why) &&
      none.chosen === null && linux.chosen === null && linux.runtimes.every((r) => r.path === null),
    detail: { unasked: unasked.runtimes, down: down.runtimes.map((r) => r.why) }
  }
})

// vm.probe.3. OrbStack and Docker share one CLI: with `orb` present the
// docker CLI is OrbStack's, and only the OrbStack row can be usable.
check('vm.probe.3 with orb installed the docker CLI is OrbStack\'s — one engine, one usable row', sandbox, (S) => {
  const p = S.probeVmRuntimes(facts({ macosMajor: 15, which: (n) => ({ docker: '/usr/local/bin/docker', orb: '/usr/local/bin/orb' })[n] ?? null }))
  return { pass: p.chosen === 'orbstack' && p.runtimes.filter((r) => r.usable).length === 1, detail: p }
})

// vm.probe.4. The probe reaches the environment report and its row, and an
// older main's report (no `vm` key) renders no row rather than crashing.
check('vm.probe.4 the report carries the probe and the Environment scope shows one sandboxed-lanes row; absent is no row', { mod: env.mod && rows.mod && sandbox.mod ? { E: env.mod, R: rows.mod, S: sandbox.mod } : undefined, error: env.error || rows.error || sandbox.error }, ({ E, R, S }) => {
  const base = { env: { PATH: '/fixture/bin' }, shell: { path: '/bin/zsh', ok: true }, which: () => null, backend: { kind: 'direct', reason: 'fixture', tmuxPath: null }, layoutPath: '/fixture/layout.json', backupWritten: false, now: 1, control: null }
  const withVm = E.buildEnvReport({ ...base, vm: S.probeVmRuntimes(facts()) })
  const without = E.buildEnvReport(base)
  const row = R.buildEnvironmentRows(withVm).find((r) => r.id === 'env.vm')
  return {
    pass: withVm.vm.chosen === 'apple' && !('vm' in without) && row !== undefined && /Apple container/.test(row.title) &&
      R.buildEnvironmentRows(without).every((r) => r.id !== 'env.vm'),
    detail: { row: row && [row.title, row.subtitle] }
  }
})

// vm.probe.5. Darwin's release number is not macOS's version.
check('vm.probe.5 Darwin 25 reads as macOS 26 and Darwin 24 as macOS 15', load('src/main/vm-runtime.ts', 'runtime'), (R) => ({
  pass: R.macosMajorFromDarwin('25.0.0') === 26 && R.macosMajorFromDarwin('24.6.0') === 15 && R.macosMajorFromDarwin('nonsense') === null,
  detail: [R.macosMajorFromDarwin('25.0.0'), R.macosMajorFromDarwin('24.6.0')]
}))

// M551 — vm.spec.1. The fixture spec parses, and each promise refuses by name.
check('vm.spec.1 a sound spec parses; home, /, a .. path, no cap, no proxy and no auth key are each refused by name', lane, (L) => {
  const good = L.parseVmLaneSpec(SPEC, HOME)
  const refused = {
    home: L.parseVmLaneSpec({ ...SPEC, worktree: HOME }, HOME),
    root: L.parseVmLaneSpec({ ...SPEC, worktree: '/' }, HOME),
    above: L.parseVmLaneSpec({ ...SPEC, worktree: '/Users' }, HOME),
    dots: L.parseVmLaneSpec({ ...SPEC, worktree: '/Users/fixture/x/../../other' }, HOME),
    relative: L.parseVmLaneSpec({ ...SPEC, worktree: 'work' }, HOME),
    nested: L.parseVmLaneSpec({ ...SPEC, stateDir: SPEC.worktree + '/.state' }, HOME),
    cpus: L.parseVmLaneSpec({ ...SPEC, cpus: 0 }, HOME),
    memory: L.parseVmLaneSpec({ ...SPEC, memoryMiB: undefined }, HOME),
    proxy: L.parseVmLaneSpec({ ...SPEC, proxy: null }, HOME),
    noAuth: L.parseVmLaneSpec({ ...SPEC, authKeys: [] }, HOME),
    foreignKey: L.parseVmLaneSpec({ ...SPEC, authKeys: ['GITHUB_TOKEN'] }, HOME),
    noModel: L.parseVmLaneSpec({ ...SPEC, allow: ['registry.npmjs.org'] }, HOME),
    badHost: L.parseVmLaneSpec({ ...SPEC, allow: ['api.anthropic.com', 'evil.com/path'] }, HOME),
    flagImage: L.parseVmLaneSpec({ ...SPEC, image: '--privileged' }, HOME)
  }
  const bad = Object.entries(refused).filter(([, r]) => r.kind !== 'refused' || typeof r.reason !== 'string').map(([k]) => k)
  return { pass: good.kind === 'ok' && bad.length === 0 && /Keychain/.test(refused.noAuth.reason) && /home folder/.test(refused.home.reason), detail: { good: good.kind, bad, noAuth: refused.noAuth.reason } }
})

// vm.spec.2. The argv: exactly two bind mounts (the worktree read-write and
// the lane's state folder), never the home folder; caps present; the auth
// key by NAME only; --rm and -i, never -t.
check('vm.spec.2 the run argv mounts only the worktree and the lane state, caps CPU and memory, passes the token by name, and is --rm -i without -t', { mod: lane.mod && sandbox.mod ? { L: lane.mod, S: sandbox.mod } : undefined, error: lane.error || sandbox.error }, ({ L, S }) => {
  const spec = L.parseVmLaneSpec(SPEC, HOME).spec
  const { binary, args } = S.vmRunArgs(spec, { command: 'claude', args: ['-p'] })
  const mounts = args.flatMap((a, i) => (args[i - 1] === '--mount' || args[i - 1] === '-v' || args[i - 1] === '--volume') ? [a] : [])
  const envs = args.flatMap((a, i) => args[i - 1] === '-e' ? [a] : [])
  const imageAt = args.indexOf(spec.image)
  return {
    pass: binary === 'container' && args[0] === 'run' && args.includes('--rm') && args.includes('-i') && !args.includes('-t') && !args.includes('--tty') &&
      mounts.length === 2 && mounts[0] === `type=bind,source=${spec.worktree},target=/work` && mounts[1].includes(spec.stateDir) &&
      !mounts.some((m) => m.includes(`source=${HOME},`) || m.endsWith(`source=${HOME}`)) && !args.includes('--privileged') &&
      args[args.indexOf('--cpus') + 1] === '4' && args[args.indexOf('--memory') + 1] === '4096M' &&
      envs.includes('CLAUDE_CODE_OAUTH_TOKEN') && !envs.some((e) => e.startsWith('CLAUDE_CODE_OAUTH_TOKEN=')) &&
      envs.includes('HTTPS_PROXY=http://192.168.64.1:47801') && envs.includes('TC_VM_PROXY=192.168.64.1:47801') &&
      args.slice(imageAt + 1).join(' ') === 'claude -p',
    detail: { binary, mounts, envs }
  }
})

// vm.spec.3. Docker and OrbStack take the same argv through the docker CLI,
// OrbStack with its context; stop is stop-then-remove by name in all three.
check('vm.spec.3 docker and OrbStack argv go through the docker CLI (OrbStack with --context orbstack); stop then remove by the lane\'s name', { mod: lane.mod && sandbox.mod ? { L: lane.mod, S: sandbox.mod } : undefined, error: lane.error || sandbox.error }, ({ L, S }) => {
  const spec = L.parseVmLaneSpec(SPEC, HOME).spec
  const d = S.vmRunArgs({ ...spec, runtime: 'docker' }, { command: 'claude', args: [] })
  const o = S.vmRunArgs({ ...spec, runtime: 'orbstack' }, { command: 'claude', args: [] })
  const stopA = S.vmStopArgs('apple', 'fix-login')
  const stopO = S.vmStopArgs('orbstack', 'fix-login')
  return {
    pass: d.binary === 'docker' && d.args[0] === 'run' && o.binary === 'docker' && o.args.slice(0, 3).join(' ') === '--context orbstack run' &&
      JSON.stringify(stopA) === JSON.stringify([['stop', '--time', '5', 'tc-lane-fix-login'], ['delete', '--force', 'tc-lane-fix-login']]) &&
      stopO[1].join(' ') === '--context orbstack rm --force tc-lane-fix-login',
    detail: { stopA, stopO }
  }
})

// vm.spec.4. The claude argv, made fit for a VM: prompts off as ONE
// permission mode, no stdio prompt tool, no host hooks, the image's claude,
// and a first spawn's --resume pinned as --session-id.
check('vm.spec.4 inside the VM claude runs bypassPermissions once, without the stdio prompt tool or host --settings; a first spawn\'s --resume becomes --session-id', sandbox, (S) => {
  const host = ['-p', '--output-format', 'stream-json', '--permission-prompt-tool', 'stdio', '--permission-mode', 'plan', '--resume', 'abc', '--settings', '{"hooks":{}}', '--model', 'opus']
  const first = S.vmAgentArgv('/opt/homebrew/bin/claude', host, true)
  const later = S.vmAgentArgv('/opt/homebrew/bin/claude', host, false)
  const codex = S.vmAgentArgv('/usr/local/bin/codex', ['exec'], true)
  const modes = first.args.filter((a) => a === '--permission-mode').length
  return {
    pass: first.kind === 'ok' && first.command === 'claude' && modes === 1 && first.args.slice(-2).join(' ') === '--permission-mode bypassPermissions' &&
      !first.args.includes('--permission-prompt-tool') && !first.args.includes('stdio') && !first.args.includes('--settings') && !first.args.includes('plan') &&
      first.args.join(' ').includes('--session-id abc') && !first.args.includes('--resume') && later.args.join(' ').includes('--resume abc') &&
      first.args.join(' ').includes('--model opus') && codex.kind === 'refused',
    detail: { first: first.args, codex }
  }
})

// M554 — vm.egress.1 (the decision only; the proxy lands with M554).
check('vm.egress.1 HTTPS to a listed host or a strict subdomain of a *. entry passes; another host, port 80, an IP or the bare wildcard domain does not', lane, (L) => {
  const allow = ['api.anthropic.com', '*.npmjs.org']
  const yes = [['api.anthropic.com', 443], ['API.Anthropic.com.', 443], ['registry.npmjs.org', 443]]
  const no = [['evil.com', 443], ['api.anthropic.com', 80], ['160.79.104.10', 443], ['npmjs.org', 443], ['api.anthropic.com.evil.com', 443], ['xnpmjs.org', 443]]
  const wrongYes = yes.filter(([h, p]) => !L.vmEgressAllowed(h, p, allow))
  const wrongNo = no.filter(([h, p]) => L.vmEgressAllowed(h, p, allow))
  return { pass: wrongYes.length === 0 && wrongNo.length === 0, detail: { wrongYes, wrongNo } }
})

// M552 — the lane registry and its runner, over a fake runner and fake exec.
const lanesMod = load('src/main/vm-lanes.ts', 'lanes')
function rig(over = {}) {
  const spawns = [], execs = [], fsOps = [], checks = [], kills = []
  const procs = []
  const inner = (spawn) => {
    spawns.push(spawn)
    const exitCbs = []
    const p = { pid: 7, write() {}, onData() {}, onExit(cb) { exitCbs.push(cb) }, kill() { kills.push(spawn.command) }, exit: () => exitCbs.forEach((cb) => cb({ code: 0, signal: null })) }
    procs.push(p)
    return p
  }
  const lanes = lanesMod.mod.createVmLanes({
    inner,
    runCheck: async (spec) => { checks.push(spec); return { exitCode: 0, output: 'ok' } },
    exec: (binary, args) => execs.push([binary, ...args].join(' ')),
    mkdir: (p) => fsOps.push(`mkdir ${p}`), rm: (p) => fsOps.push(`rm ${p}`),
    home: HOME, stateRoot: '/Users/fixture/Library/Application Support/tc/vm-lanes',
    runtime: () => 'apple', settings: () => ({ image: 'terminal-canvas/lane:1', cpus: 2, memoryMiB: 2048, allow: ['registry.npmjs.org'] }),
    proxy: () => ({ host: '192.168.64.1', port: 47801 }),
    loginEnv: { PATH: '/usr/bin', HOME, CLAUDE_CODE_OAUTH_TOKEN: 'sk-fixture', GITHUB_TOKEN: 'ghp-fixture' },
    ...over
  })
  return { lanes, spawns, execs, fsOps, checks, kills, procs }
}
const WT = '/Users/fixture/Library/Application Support/tc/worktrees/fix-login'
const chatEnv = (id) => ({ PATH: '/usr/bin', TC_PANEL_ID: id, TC_PANEL_TOKEN: 'tok', TC_CONTROL_SOCKET: '/tmp/tc.sock', CLAUDE_CODE_OAUTH_TOKEN: 'sk-fixture', GITHUB_TOKEN: 'ghp-fixture' })
const HOST_ARGS = ['-p', '--output-format', 'stream-json', '--permission-prompt-tool', 'stdio', '--resume', 'sess-1']

check('vm.run.1 a panel not in a lane spawns exactly as before; a lane\'s spawn is `container run` with the image\'s claude, prompts off, and an env holding no app socket, panel token or other credential', lanesMod, () => {
  const r = rig()
  r.lanes.runner({ command: '/opt/homebrew/bin/claude', args: HOST_ARGS, cwd: WT, env: chatEnv('plain') })
  const plain = r.spawns[0]
  const entered = r.lanes.enter('chat-1', WT)
  r.lanes.runner({ command: '/opt/homebrew/bin/claude', args: HOST_ARGS, cwd: WT, env: chatEnv('chat-1') })
  const vm = r.spawns[1]
  const afterImage = vm.args.slice(vm.args.indexOf('terminal-canvas/lane:1') + 1)
  return {
    pass: plain.command === '/opt/homebrew/bin/claude' && plain.args === HOST_ARGS && entered.kind === 'ok' &&
      vm.command === 'container' && vm.args[0] === 'run' && afterImage[0] === 'claude' && afterImage.join(' ').includes('--session-id sess-1') &&
      afterImage.slice(-2).join(' ') === '--permission-mode bypassPermissions' &&
      vm.env.CLAUDE_CODE_OAUTH_TOKEN === 'sk-fixture' && !('GITHUB_TOKEN' in vm.env) && !('TC_PANEL_TOKEN' in vm.env) && !('TC_CONTROL_SOCKET' in vm.env) &&
      !vm.args.some((a) => a.includes('sk-fixture')) && r.lanes.list()[0].running === true,
    detail: { entered, env: Object.keys(vm.env), tail: afterImage }
  }
})

check('vm.run.2 enter is refused by name with no runtime, no proxy or no token; it clears a stale VM by name and starts from a fresh state folder', lanesMod, () => {
  const none = rig({ runtime: () => null }).lanes.enter('a', WT)
  const noProxy = rig({ proxy: () => null }).lanes.enter('a', WT)
  const noToken = rig({ loginEnv: { PATH: '/usr/bin', HOME } }).lanes.enter('a', WT)
  const home = rig().lanes.enter('a', HOME)
  const r = rig()
  r.lanes.enter('chat-1', WT)
  const state = '/Users/fixture/Library/Application Support/tc/vm-lanes/chat-1'
  return {
    pass: none.kind === 'refused' && /no VM runtime/.test(none.reason) && noProxy.kind === 'refused' && /proxy/.test(noProxy.reason) &&
      noToken.kind === 'refused' && /setup-token/.test(noToken.reason) && home.kind === 'refused' &&
      r.fsOps.join('|') === `rm ${state}|mkdir ${state}` && r.execs.join('|') === 'container stop --time 5 tc-lane-chat-1|container delete --force tc-lane-chat-1',
    detail: { none, noProxy, noToken, fs: r.fsOps, execs: r.execs }
  }
})

check('vm.run.3 a kill stops the VM by name as well as the client; a later spawn resumes; leave and disposeAll stop every lane and remove its state', lanesMod, () => {
  const r = rig()
  r.lanes.enter('chat-1', WT)
  r.lanes.enter('chat-2', WT + '-2')
  r.execs.length = 0
  const p = r.lanes.runner({ command: 'claude', args: HOST_ARGS, cwd: WT, env: chatEnv('chat-1') })
  p.kill()
  const afterKill = [...r.execs]
  r.procs[0].exit()
  const stopped = r.lanes.list().find((l) => l.panelId === 'chat-1').running === false
  r.lanes.runner({ command: 'claude', args: HOST_ARGS, cwd: WT, env: chatEnv('chat-1') })
  const second = r.spawns[1].args
  r.execs.length = 0; r.fsOps.length = 0
  r.lanes.disposeAll()
  return {
    pass: r.kills.length === 1 && afterKill.join('|') === 'container stop --time 5 tc-lane-chat-1|container delete --force tc-lane-chat-1' && stopped &&
      second.join(' ').includes('--resume sess-1') && r.lanes.list().length === 0 && r.execs.length === 4 &&
      r.fsOps.filter((o) => o.startsWith('rm ')).length === 2 && r.lanes.leave('chat-1') === false,
    detail: { afterKill, execs: r.execs, fs: r.fsOps }
  }
})

// A command with a quote in it: the VM's sh must receive exactly this text.
const CHECK_LINE = "npm test -- --grep \"it's\""
const quote = (w) => `'${w.replace(/'/g, `'\\''`)}'`
const asyncChecks = (async () => {
  if (lanesMod.mod !== undefined) {
    const r = rig()
    r.lanes.enter('chat-1', WT)
    r.execs.length = 0
    await r.lanes.runCheck({ command: CHECK_LINE, cwd: WT, env: chatEnv('chat-1'), timeoutMs: 1000, signal: new AbortController().signal })
    await r.lanes.runCheck({ command: 'npm test', cwd: WT, env: chatEnv('other'), timeoutMs: 1000, signal: new AbortController().signal })
    const [inVm, onMac] = r.checks
    ok('vm.run.4 the lane\'s check line is a quoted container run named -check ending in sh -c and the exact command; its VM is stopped after; the other panel\'s check is untouched',
      inVm.command.startsWith("'container' 'run'") && inVm.command.includes("'tc-lane-chat-1-check'") && inVm.command.endsWith(` 'sh' '-c' ${quote(CHECK_LINE)}`) && quote("it's") === `'it'\\''s'` &&
        !('TC_PANEL_TOKEN' in inVm.env) && r.execs.join('|') === 'container stop --time 5 tc-lane-chat-1-check|container delete --force tc-lane-chat-1-check' &&
        onMac.command === 'npm test' && onMac.env.TC_PANEL_ID === 'other', inVm.command.slice(-80))
    const r2 = rig()
    r2.lanes.enter('chat-1', WT)
    const p = r2.lanes.runner({ command: '/usr/local/bin/codex', args: ['exec'], cwd: WT, env: chatEnv('chat-1') })
    const info = await new Promise((res) => p.onExit(res))
    ok('vm.run.5 a lane refuses a backend other than claude: process exits with a null code and the reason as its stderr', info.code === null && /Claude Code only/.test(info.stderr), info)
  } else {
    ok('vm.run.4', false, lanesMod.error); ok('vm.run.5', false, lanesMod.error)
  }
})()

asyncChecks.then(() => {
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
  if (results.some((r) => !r.pass)) process.exitCode = 1
})

