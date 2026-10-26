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
  cpus: 4, memoryMiB: 4096, allow: ['api.anthropic.com', '*.npmjs.org'], proxy: { host: '192.168.64.1', port: 47801, token: 'fixtureToken0123456789' },
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
      envs.includes('HTTPS_PROXY') && envs.includes('http_proxy') && !args.some((a) => a.includes('fixtureToken')) && envs.includes('TC_VM_PROXY=192.168.64.1:47801') &&
      S.vmRunArgs(spec, { command: 'claude', args: [] }).env.HTTPS_PROXY === 'http://fix-login:fixtureToken0123456789@192.168.64.1:47801' &&
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
    realpath: (p) => p, exists: (p) => p.endsWith('/.git') || p.endsWith('/.claude'),
    home: HOME, stateRoot: '/Users/fixture/Library/Application Support/tc/vm-lanes',
    runtime: () => 'apple', settings: () => ({ image: 'terminal-canvas/lane:1', cpus: 2, memoryMiB: 2048, allow: ['registry.npmjs.org'] }),
    proxy: () => ({ host: '192.168.64.1', port: 47801 }), newToken: () => 'laneToken0123456789ab',
    loginEnv: { PATH: '/usr/bin', HOME, CLAUDE_CODE_OAUTH_TOKEN: 'sk-fixture', GITHUB_TOKEN: 'ghp-fixture' },
    ...over
  })
  return { lanes, spawns, execs, fsOps, checks, kills, procs }
}
const WT = '/Users/fixture/Library/Application Support/tc/worktrees/fix-login'
// The lane id carries a hash of the whole panel id; the names below are derived, not spelled.
const LID = (id) => lanesMod.mod.laneIdOf(id)
const VMN = (id) => `tc-lane-${LID(id)}`
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
      !vm.args.some((a) => a.includes('sk-fixture') || a.includes('laneToken')) && vm.env.HTTPS_PROXY === `http://${LID('chat-1')}:laneToken0123456789ab@192.168.64.1:47801` && r.lanes.list()[0].running === true,
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
  const state = `/Users/fixture/Library/Application Support/tc/vm-lanes/${LID('chat-1')}`
  return {
    pass: none.kind === 'refused' && /no VM runtime/.test(none.reason) && noProxy.kind === 'refused' && /proxy/.test(noProxy.reason) &&
      noToken.kind === 'refused' && /setup-token/.test(noToken.reason) && home.kind === 'refused' &&
      r.fsOps.join('|') === `rm ${state}|mkdir ${state}` && r.execs.join('|') === `container stop --time 5 ${VMN('chat-1')}|container delete --force ${VMN('chat-1')}`,
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
    pass: r.kills.length === 1 && afterKill.join('|') === `container stop --time 5 ${VMN('chat-1')}|container delete --force ${VMN('chat-1')}` && stopped &&
      second.join(' ').includes('--resume sess-1') && r.lanes.list().length === 0 && r.execs.length === 4 &&
      r.fsOps.filter((o) => o.startsWith('rm ')).length === 2 && r.lanes.leave('chat-1') === false,
    detail: { afterKill, execs: r.execs, fs: r.fsOps }
  }
})

// A command with a quote in it: the VM's sh must receive exactly this text.
const CHECK_LINE = "npm test -- --grep \"it's\""
const quote = (w) => `'${w.replace(/'/g, `'\\''`)}'`
// The critic's findings (M552 hardening): each pinned.
check('vm.spec.5 the home check cannot be dodged by /., //, a trailing slash or case; a comma, quote or = in a path (a --mount injection) is refused', lane, (L) => {
  const tries = ['/Users/fixture/.', '/Users//fixture', '/users/fixture', '/Users/fixture/', '/USERS/FIXTURE/../fixture',
    '/Users/fixture/x,source=/Users/fixture', '/Users/fixture/a"b', '/Users/fixture/a=b', '/Users/fixture/a\nb']
  const accepted = tries.filter((w) => L.parseVmLaneSpec({ ...SPEC, worktree: w }, HOME).kind !== 'refused')
  const spaces = L.parseVmLaneSpec({ ...SPEC, worktree: '/Users/fixture/My Projects/app' }, HOME)
  return { pass: accepted.length === 0 && spaces.kind === 'ok', detail: { accepted } }
})

check('vm.spec.6 .git and the agent configs are re-mounted read-only over the worktree, and the image\'s network lock is named as the entrypoint', { mod: lane.mod && sandbox.mod ? { L: lane.mod, S: sandbox.mod } : undefined, error: lane.error || sandbox.error }, ({ L, S }) => {
  const spec = L.parseVmLaneSpec({ ...SPEC, readOnly: ['.git', '.claude', '../etc', 'src'] }, HOME).spec
  const { args } = S.vmRunArgs(spec, { command: 'claude', args: [] })
  const mounts = args.flatMap((a, i) => args[i - 1] === '--mount' ? [a] : [])
  const ep = args[args.indexOf('--entrypoint') + 1]
  return {
    pass: JSON.stringify(spec.readOnly) === JSON.stringify(['.git', '.claude']) && mounts.length === 4 &&
      mounts[2] === `type=bind,source=${SPEC.worktree}/.git,target=/work/.git,readonly` && mounts[3].endsWith('target=/work/.claude,readonly') &&
      ep === '/usr/local/bin/tc-vm-entry' && args.indexOf('--entrypoint') < args.indexOf(spec.image),
    detail: { mounts, ep }
  }
})

check('vm.run.6 two panel ids that clean to the same name get different lanes; a lane id is always a plain name', lanesMod, (M) => {
  const a = M.laneIdOf('chat/1'), b = M.laneIdOf('chat:1'), c = M.laneIdOf('x'.repeat(200)), d = M.laneIdOf('///')
  return { pass: a !== b && /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(c) && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(d) && a.startsWith('chat-1-'), detail: [a, b, c.length, d] }
})

check('vm.run.7 a lane mounts the chat folder with its symlinks resolved, so a link to home is refused; a missing folder is refused', lanesMod, () => {
  const linked = rig({ realpath: (p) => p === '/Users/fixture/link' ? HOME : p }).lanes.enter('a', '/Users/fixture/link')
  const gone = rig({ realpath: () => { throw new Error('ENOENT') } }).lanes.enter('a', WT)
  return { pass: linked.kind === 'refused' && /home folder/.test(linked.reason) && gone.kind === 'refused' && /does not exist/.test(gone.reason), detail: { linked, gone } }
})

// M553 — the doors. A fake manager: get/terminate/subscribe, status events on demand.
const doorsMod = load('src/main/vm-doors.ts', 'doors')
const tonightMod = load('src/shared/tonight.ts', 'tonight')
const placeMod = load('src/main/vm-runtime.ts', 'place')
const proxyMod = load('src/main/vm-proxy.ts', 'proxy')
function doorRig(over = {}) {
  const events = new Set()
  const terminated = [], entered = [], left = []
  const snaps = new Map([['chat-1', { id: 'chat-1', backend: 'claude', cwd: WT, status: 'ready' }], ['chat-2', { id: 'chat-2', backend: 'claude', cwd: WT + '-2', status: 'exited' }], ['codex-1', { id: 'codex-1', backend: 'codex', cwd: WT, status: 'ready' }]])
  const inLane = new Set()
  const emit = (e) => { for (const cb of [...events]) cb(e) }
  const doors = doorsMod.mod.createVmDoors({
    lanes: {
      enter: (id) => { entered.push(id); if (over.refuseEnter === id) return { kind: 'refused', reason: 'nope' }; inLane.add(id); return { kind: 'ok', laneId: id, runtime: 'apple' } },
      leave: (id) => { left.push(id); return inLane.delete(id) },
      has: (id) => inLane.has(id)
    },
    agents: {
      get: (id) => snaps.get(id),
      // A real terminate's exit arrives later: the fake answers on the next tick.
      terminate: (id) => { terminated.push(id); const s = snaps.get(id); if (!s || s.status === 'exited') return false; setTimeout(() => { if (over.hang) return; s.status = 'exited'; emit({ id, type: 'status', status: 'exited' }) }, 0); return true },
      subscribe: (cb) => { events.add(cb); return () => events.delete(cb) }
    },
    enabled: () => over.enabled ?? true,
    exitWaitMs: 20,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (t) => clearTimeout(t)
  })
  return { doors, emit, terminated, entered, left, inLane, snaps }
}

check('vm.tonight.1 a batch task may ask sandboxed: true (anything else but false is refused by name); the runner copies the label onto its row; tonight sandboxed marks every task and the words say so', { mod: tonightMod.mod, error: tonightMod.error }, (T) => {
  const ok1 = T.parseTonightBatch({ tasks: [{ id: 'a', panelId: 'p', task: 'do it', sandboxed: true }, { id: 'b', panelId: 'q', task: 'and this' }] })
  const bad = T.parseTonightBatch({ tasks: [{ id: 'a', panelId: 'p', task: 'do it', sandboxed: 'yes' }] })
  const items = [{ id: 'w1', title: 'Fix login', state: 'doing', panelId: 'p' }]
  const all = T.tonightBatchFrom(items, () => true, { sandboxed: true })
  const plain = T.tonightBatchFrom(items, () => true)
  const words = T.tonightWords({ kind: 'started', tasks: 2, checked: 1, skipped: 0, sandboxed: 2 })
  const none = T.tonightWords({ kind: 'started', tasks: 2, checked: 1, skipped: 0 })
  return {
    pass: ok1.kind === 'ok' && ok1.batch.tasks[0].sandboxed === true && !('sandboxed' in ok1.batch.tasks[1]) && bad.kind === 'refused' &&
      all.tasks[0].sandboxed === true && !('sandboxed' in plain.tasks[0]) && /all sandboxed with prompts off/.test(words) && !/sandboxed/.test(none),
    detail: { words, bad }
  }
})

check('vm.place.1 Apple container\'s proxy binds the vmnet bridge\'s .1 (192.168.64.1 first) and nowhere else; docker and OrbStack bind loopback and reach it as host.docker.internal; no bridge is null', placeMod, (R) => {
  const ifs = { lo0: [{ address: '127.0.0.1', family: 'IPv4' }], en0: [{ address: '192.168.1.1', family: 'IPv4' }], bridge100: [{ address: '192.168.64.1', family: 'IPv4' }], bridge101: [{ address: '192.168.65.1', family: 'IPv4' }] }
  const apple = R.vmProxyPlace('apple', ifs)
  const moved = R.vmProxyPlace('apple', { bridge102: [{ address: '192.168.70.1', family: 4 }], en0: [{ address: '192.168.1.1', family: 'IPv4' }] })
  const none = R.vmProxyPlace('apple', { en0: [{ address: '192.168.1.1', family: 'IPv4' }] })
  const docker = R.vmProxyPlace('docker', ifs)
  return {
    pass: apple.bind === '192.168.64.1' && apple.reach === '192.168.64.1' && moved.bind === '192.168.70.1' && none === null &&
      docker.bind === '127.0.0.1' && docker.reach === 'host.docker.internal',
    detail: { apple, moved, none, docker }
  }
})

check('vm.proxy.0 decideConnect reads the lane from the proxy credentials and refuses a malformed target, a missing or wrong secret and a host off the lane\'s own list', proxyMod, (P) => {
  const lanes = { allowOf: (id) => id === 'a' ? ['api.anthropic.com'] : ['evil.com'], tokenOf: (id) => ({ a: 'tokA0123456789abcdef', b: 'tokB0123456789abcdef' })[id] }
  const auth = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64')
  const r = {
    ok: P.decideConnect('api.anthropic.com:443', auth('a', 'tokA0123456789abcdef'), lanes),
    otherLanesList: P.decideConnect('evil.com:443', auth('a', 'tokA0123456789abcdef'), lanes),
    crossSecret: P.decideConnect('evil.com:443', auth('b', 'tokA0123456789abcdef'), lanes),
    malformed: P.decideConnect('api.anthropic.com', auth('a', 'tokA0123456789abcdef'), lanes),
    none: P.decideConnect('api.anthropic.com:443', undefined, lanes)
  }
  return {
    pass: r.ok.kind === 'allow' && r.ok.laneId === 'a' && r.otherLanesList.status === 403 && r.crossSecret.status === 407 && r.malformed.status === 400 && r.none.status === 407,
    detail: r
  }
})

const asyncChecks = (async () => {
  if (lanesMod.mod !== undefined) {
    const r = rig()
    r.lanes.enter('chat-1', WT)
    r.execs.length = 0
    await r.lanes.runCheck({ command: CHECK_LINE, cwd: WT, env: chatEnv('chat-1'), timeoutMs: 1000, signal: new AbortController().signal })
    await r.lanes.runCheck({ command: 'npm test', cwd: WT, env: chatEnv('other'), timeoutMs: 1000, signal: new AbortController().signal })
    const [inVm, onMac] = r.checks
    ok('vm.run.4 the lane\'s check line is a quoted container run named -check ending in sh -c and the exact command; its VM is stopped after; the other panel\'s check is untouched',
      inVm.command.startsWith("'container' 'run'") && inVm.command.includes(`'${VMN('chat-1')}-check'`) && inVm.command.endsWith(` 'sh' '-c' ${quote(CHECK_LINE)}`) && quote("it's") === `'it'\\''s'` &&
        !('TC_PANEL_TOKEN' in inVm.env) && r.execs.join('|') === `container stop --time 5 ${VMN('chat-1')}-check|container delete --force ${VMN('chat-1')}-check` &&
        onMac.command === 'npm test' && onMac.env.TC_PANEL_ID === 'other', inVm.command.slice(-80))
    const r2 = rig()
    r2.lanes.enter('chat-1', WT)
    const p = r2.lanes.runner({ command: '/usr/local/bin/codex', args: ['exec'], cwd: WT, env: chatEnv('chat-1') })
    const info = await new Promise((res) => p.onExit(res))
    ok('vm.run.5 a lane refuses a backend other than claude: process exits with a null code and the reason as its stderr', info.code === null && /Claude Code only/.test(info.stderr), JSON.stringify(info))
  } else {
    ok('vm.run.4', false, lanesMod.error); ok('vm.run.5', false, lanesMod.error)
  }

  if (doorsMod.mod !== undefined) {
    const off = await doorRig({ enabled: false }).doors.enterForAuto('chat-1')
    const r = doorRig()
    const auto = await r.doors.enterForAuto('chat-1')
    const killedFirst = r.terminated[0] === 'chat-1' && r.snaps.get('chat-1').status === 'exited'
    r.emit({ id: 'chat-1', type: 'auto', state: 'running' })
    const stillIn = r.inLane.has('chat-1')
    r.emit({ id: 'chat-1', type: 'auto', state: 'done', verdict: 'checked' })
    ok('vm.doors.1 off by default refuses by name; on, an auto run kills the Mac process and waits for its exit before the lane is used, and leaves the VM when the run resolves',
      off.kind === 'refused' && /Sandboxed lanes/.test(off.reason) && auto.kind === 'ok' && killedFirst && stillIn && !r.inLane.has('chat-1') && r.left.includes('chat-1'),
      JSON.stringify({ off, auto, terminated: r.terminated, left: r.left }))

    const t = doorRig()
    const night = await t.doors.enterForTonight(['chat-1', 'chat-2'])
    t.emit({ id: 'chat-1', type: 'auto', state: 'stuck', reason: 'limit' })
    const heldThroughPause = t.inLane.has('chat-1') && t.inLane.has('chat-2')
    t.doors.tonightStatus({ state: 'running', tasks: [], startedAt: 0, awake: true })
    const heldWhileRunning = t.inLane.size === 2
    t.doors.tonightStatus({ state: 'done', tasks: [], startedAt: 0, awake: false })
    ok('vm.doors.2 a Tonight batch holds its lanes through an auto run that ends on a limit (its resume must start in the same VM) and releases every one when the batch ends',
      night.kind === 'ok' && heldThroughPause && heldWhileRunning && t.inLane.size === 0, JSON.stringify({ night, left: t.left }))

    const bad = doorRig({ refuseEnter: 'chat-2' })
    const partial = await bad.doors.enterForTonight(['chat-1', 'chat-2'])
    const codex = await doorRig().doors.enterForAuto('codex-1')
    const hang = doorRig({ hang: true })
    const hung = await hang.doors.enterForAuto('chat-1')
    const busy = doorRig()
    busy.snaps.get('chat-1').auto = { mode: 'complete', state: 'running', turn: 1, limit: 5 }
    const live = await busy.doors.enterForAuto('chat-1')
    ok('vm.doors.4 a chat with an auto run already live on the Mac is refused before anything is entered or killed',
      live.kind === 'refused' && /already running/.test(live.reason) && busy.entered.length === 0 && busy.terminated.length === 0, JSON.stringify(live))
    ok('vm.doors.3 all or none: one refused lane takes back the ones entered before it; a codex chat is refused; a Mac process that will not exit leaves the lane and refuses',
      partial.kind === 'refused' && bad.inLane.size === 0 && codex.kind === 'refused' && /Claude Code only/.test(codex.reason) &&
        hung.kind === 'refused' && /did not stop/.test(hung.reason) && hang.inLane.size === 0,
      JSON.stringify({ partial, codex, hung, bad: [...bad.inLane], hang: [...hang.inLane] }))
  } else {
    for (const id of ['vm.doors.1', 'vm.doors.2', 'vm.doors.3']) ok(id, false, doorsMod.error)
  }

  // M554 — the proxy, on loopback, with a loopback "upstream" standing in for the internet.
  if (proxyMod.mod !== undefined) {
    const net = require('node:net')
    const upstream = net.createServer((sock) => sock.on('data', (d) => sock.write('echo:' + d)))
    await new Promise((res) => upstream.listen(0, '127.0.0.1', res))
    const upPort = upstream.address().port
    const log = proxyMod.mod.createEgressLog()
    const dialed = []
    const lanesFake = { allowOf: (id) => id === 'chat-1' ? ['api.anthropic.com'] : [], tokenOf: (id) => id === 'chat-1' ? 'laneToken0123456789ab' : undefined }
    const proxy = proxyMod.mod.createVmProxy({ lanes: lanesFake, dial: (host, port) => { dialed.push(`${host}:${port}`); return net.connect(upPort, '127.0.0.1') }, log: (e) => log.add(e), now: () => 1 })
    const port = await proxy.listen('127.0.0.1')
    const basic = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64')
    const connect = (target, auth, payload) => new Promise((res) => {
      const sock = net.connect(port, '127.0.0.1', () => sock.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${auth === undefined ? '' : `Proxy-Authorization: ${auth}\r\n`}\r\n`))
      let buf = ''
      sock.on('data', (d) => {
        buf += d
        if (/^HTTP\/1\.1 200/.test(buf) && payload !== undefined && !buf.includes('echo:')) { if (!sock._sent) { sock._sent = true; sock.write(payload) } }
        if (buf.includes('echo:') || /^HTTP\/1\.1 (4|5)\d\d/.test(buf)) { sock.destroy(); res(buf) }
      })
      sock.on('close', () => res(buf))
      setTimeout(() => { sock.destroy(); res(buf) }, 1500)
    })
    const allowed = await connect('api.anthropic.com:443', basic('chat-1', 'laneToken0123456789ab'), 'hello')
    const offList = await connect('evil.example.com:443', basic('chat-1', 'laneToken0123456789ab'))
    const noAuth = await connect('api.anthropic.com:443')
    const wrong = await connect('api.anthropic.com:443', basic('chat-1', 'wrongToken0123456789'))
    const port80 = await connect('api.anthropic.com:80', basic('chat-1', 'laneToken0123456789ab'))
    const plain = await new Promise((res) => {
      const sock = net.connect(port, '127.0.0.1', () => sock.write('GET http://api.anthropic.com/ HTTP/1.1\r\nHost: api.anthropic.com\r\n\r\n'))
      let b = ''; sock.on('data', (d) => { b += d; if (b.includes('\r\n\r\n')) { sock.destroy(); res(b) } }); setTimeout(() => res(b), 1500)
    })
    await proxy.close(); upstream.close()
    const entries = log.list()
    ok('vm.proxy.1 a lane\'s CONNECT to a listed host on 443 is tunnelled; another host is 403, no or wrong credentials 407, port 80 403, and a plain-HTTP request 403 — only the allowed one was ever dialed',
      /^HTTP\/1\.1 200/.test(allowed) && allowed.includes('echo:hello') && /^HTTP\/1\.1 403/.test(offList) && /^HTTP\/1\.1 407/.test(noAuth) &&
        /^HTTP\/1\.1 407/.test(wrong) && /^HTTP\/1\.1 403/.test(port80) && /^HTTP\/1\.1 403/.test(plain) && JSON.stringify(dialed) === JSON.stringify(['api.anthropic.com:443']),
      JSON.stringify({ allowed: allowed.slice(0, 40), offList: offList.slice(0, 30), noAuth: noAuth.slice(0, 30), dialed }))
    ok('vm.proxy.2 every CONNECT is in the egress log, allowed or refused, by host and port and lane — and no entry holds a credential',
      entries.length === 5 && entries.filter((e) => e.allowed).length === 1 && entries[0].laneId === 'chat-1' && entries[0].host === 'api.anthropic.com' &&
        entries.find((e) => e.host === 'evil.example.com').allowed === false && !JSON.stringify(entries).includes('laneToken') && !JSON.stringify(entries).includes('wrongToken'),
      JSON.stringify(entries).slice(0, 300))
    const bounded = proxyMod.mod.createEgressLog()
    for (let i = 0; i < proxyMod.mod.VM_EGRESS_KEEP + 5; i++) bounded.add({ at: i, laneId: 'x', host: 'h', port: 443, allowed: true })
    ok('vm.proxy.3 the egress log keeps a bounded number of the newest entries', bounded.list().length === proxyMod.mod.VM_EGRESS_KEEP && bounded.list()[0].at === 5, String(bounded.list().length))
  } else {
    for (const id of ['vm.proxy.1', 'vm.proxy.2', 'vm.proxy.3']) ok(id, false, proxyMod.error)
  }
})()

asyncChecks.then(() => {
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
  if (results.some((r) => !r.pass)) process.exitCode = 1
})

