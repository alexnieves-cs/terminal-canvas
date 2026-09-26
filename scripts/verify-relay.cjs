/* The pty relay (server/relay) and main's client for it (main/relay).
   Run with: npm run verify:relay

   Plain node. The REAL relay — its ws server on a loopback port, its upgrade
   auth, its registry — driven over REAL sockets, with a fake pty (so bytes and
   pauses are observable) and ES256/HS256 keys minted here (so no Supabase).
   Cadences are shrunk: a 150ms heartbeat, a 400ms grace.

   What this cannot see: node-pty itself (built on the VM, for its arch), the
   Caddy TLS in front, Supabase's real JWKS and RLS answer, and the renderer's
   xterm — the last is a DOM fact no Electron suite pins yet. */
'use strict'
const { buildSync } = require('esbuild')
const { mkdirSync } = require('node:fs')
const { join } = require('node:path')
const crypto = require('node:crypto')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const root = join(__dirname, '..')
mkdirSync(join(root, 'out/verify'), { recursive: true })
buildSync({
  stdin: {
    contents: [
      "module.exports = {",
      "  ...require('./server/relay/relay.ts'), ...require('./server/relay/jwt.ts'), ...require('./server/relay/ring-buffer.ts'),",
      "  ...require('./server/relay/config.ts'), ...require('./src/shared/relay-protocol.ts'),",
      "  client: require('./src/main/relay/relay-client.ts'), gate: require('./src/renderer/relay/relay-gate.ts')",
      "}"
    ].join('\n'),
    resolveDir: root, loader: 'js'
  },
  outfile: join(root, 'out/verify/relay.cjs'),
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'error', external: ['ws', 'node-pty'],
  alias: { '@shared': join(root, 'src/shared') }
})
const R = require('../out/verify/relay.cjs')
const WS = require('ws')

const OWNER = '11111111-1111-4111-8111-111111111111'
const GUEST = '22222222-2222-4222-8222-222222222222'
const VIEWER = '33333333-3333-4333-8333-333333333333'
const STRANGER = '44444444-4444-4444-8444-444444444444'
const SHARE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const URL_BASE = 'https://proj.supabase.co'

// ── keys and tokens ─────────────────────────────────────────────────────────
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
const rotated = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
const jwk = (pub, kid) => ({ ...pub.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' })
let jwks = { keys: [jwk(ec.publicKey, 'k1')] }
let jwksFetches = 0
const HS = 'legacy-secret-for-verify'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = () => Math.floor(Date.now() / 1000)
function token(sub, { alg = 'ES256', kid = 'k1', key = ec.privateKey, exp = now() + 3600, aud = 'authenticated', iss = `${URL_BASE}/auth/v1` } = {}) {
  const head = b64({ alg, kid, typ: 'JWT' })
  const body = b64({ sub, exp, aud, iss, role: 'authenticated' })
  const data = Buffer.from(`${head}.${body}`)
  let sig
  if (alg === 'HS256') sig = crypto.createHmac('sha256', key).update(data).digest()
  else if (alg === 'none') sig = Buffer.alloc(0)
  else sig = crypto.sign('sha256', data, { key, dsaEncoding: 'ieee-p1363' })
  return `${head}.${body}.${sig.toString('base64url')}`
}
const subOf = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).sub

// ── the relay under test ────────────────────────────────────────────────────
const ptys = []
function fakePty(spec, size) {
  const p = {
    spec, size, written: [], data: [], exits: [], resizes: [], paused: false, pauses: 0, resumes: 0, killed: false,
    onData(cb) { p.data.push(cb) }, onExit(cb) { p.exits.push(cb) },
    write(d) { p.written.push(Buffer.from(d)) }, resize(c, r) { p.resizes.push([c, r]) },
    kill() { if (p.killed) return; p.killed = true; setImmediate(() => p.exits.forEach((cb) => cb({ exitCode: 0 }))) },
    pause() { p.paused = true; p.pauses++ }, resume() { p.paused = false; p.resumes++ },
    emit(d) { const b = Buffer.from(d); p.data.forEach((cb) => cb(b)) },
    input() { return Buffer.concat(p.written).toString() }
  }
  ptys.push(p)
  return p
}
const ROLES = { [GUEST]: 'editor', [VIEWER]: 'viewer', [OWNER]: 'owner' }
function makeRelay(extra = {}) {
  const audit = []
  const relay = R.createRelay({
    verify: R.createJwtVerifier({ supabaseUrl: URL_BASE, hsSecret: extra.hs, fetchJwks: async () => { jwksFetches++; return jwks } }),
    shareRole: async (tok, shareId) => (shareId === SHARE ? ROLES[subOf(tok)] ?? null : null),
    programs: { shell: { file: '/bin/bash', args: ['-l'], cwd: '/work' } },
    maySpawn: (u) => u !== STRANGER,
    spawn: fakePty,
    audit: (row) => audit.push(row),
    heartbeatMs: 150, graceMs: 400, drainCheckMs: 20, ringBytes: 64 * 1024,
    ...extra.deps
  })
  return { relay, audit }
}

// ── a raw test client ───────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(pred, ms = 2000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (pred()) return true; await sleep(5) }
  return pred()
}
function connect(port, tok, opts = {}) {
  return new Promise((resolve) => {
    const protocols = tok === undefined ? ['tc-relay.v1'] : ['tc-relay.v1', 'bearer.' + tok]
    const ws = new WS(`ws://127.0.0.1:${port}/relay`, protocols, opts)
    const c = { ws, log: [], closed: null, status: null, protocol: null }
    c.json = (t) => c.log.filter((e) => e.m && e.m.t === t).map((e) => e.m)
    c.last = (t) => c.json(t).at(-1)
    c.bytes = () => Buffer.concat(c.log.filter((e) => e.b).map((e) => e.b))
    c.send = (m) => ws.send(JSON.stringify(m))
    c.type = (s) => ws.send(Buffer.from(s), { binary: true })
    ws.on('unexpected-response', (_req, res) => { c.status = res.statusCode; let body = ''; res.on('data', (d) => { body += d }); res.on('end', () => { c.reason = body; resolve(c) }) })
    ws.on('message', (d, isBinary) => { c.log.push(isBinary ? { b: Buffer.from(d) } : { m: JSON.parse(d.toString()) }) })
    ws.on('close', (code) => { c.closed = code })
    ws.on('error', () => {})
    ws.on('open', () => { c.protocol = ws.protocol; until(() => c.json('hello').length > 0).then(() => resolve(c)) })
  })
}

;(async () => {
  // ── pure pieces ───────────────────────────────────────────────────────────
  {
    const ring = new R.RingBuffer(8)
    ring.write(Buffer.from('abcdef'))
    const a = ring.read(2)
    ring.write(Buffer.from('ghijk'))
    const b = ring.read(2), c = ring.read(5), d = ring.read()
    ok('relay.ring.1 a gap inside the ring is served without reset; one overwritten is a reset from the ring start',
      a.bytes.toString() === 'cdef' && !a.reset && b.reset && b.offset === 3 && b.bytes.toString() === 'defghijk' &&
      !c.reset && c.bytes.toString() === 'fghijk' && d.reset && d.bytes.length === 8 && ring.end === 11)
    const u = new R.RingBuffer(4)
    u.write(Buffer.from('a€')) // 61 e2 82 ac
    u.write(Buffer.from('b'))  // ring holds e2 82 ac 62 after dropping 'a'... then wrap cuts mid-char below
    u.write(Buffer.from('c'))  // 82 ac 62 63
    const r = u.read()
    ok('relay.ring.2 a replay that starts mid-UTF-8 skips the orphan continuation bytes', r.reset && r.bytes.toString() === 'bc' && r.offset === 4)
    const big = new R.RingBuffer(4)
    big.write(Buffer.from('0123456789'))
    ok('relay.ring.3 a chunk larger than the ring keeps its tail and the stream offset', big.read().bytes.toString() === '6789' && big.end === 10)
  }
  {
    const c = R.parseRelayClientMessage
    ok('relay.parse.1 the server parser refuses paths, argv, bad sizes and oversize text by returning nothing',
      c('{"t":"spawn","program":"/bin/sh","cols":80,"rows":24}') === undefined &&
      c('{"t":"spawn","program":"shell","cols":80,"rows":24,"args":["-c","x"]}')?.args === undefined &&
      c('{"t":"spawn","program":"shell","cols":0,"rows":24}') === undefined &&
      c('{"t":"grant","userId":"../x"}') === undefined &&
      c('{"t":"attach","sessionId":"short"}') === undefined &&
      c(JSON.stringify({ t: 'list', pad: 'x'.repeat(5000) })) === undefined &&
      c('not json') === undefined &&
      c('{"t":"spawn","program":"shell","cols":80,"rows":24}')?.program === 'shell')
    const bad = R.parsePrograms('{"shell":{"file":"bash"}}'), bad2 = R.parsePrograms('{"Sh ell":{"file":"/bin/sh"}}'), bad3 = R.parsePrograms('{"sh":{"file":"/bin/sh","env":{"lower":"x"}}}')
    const good = R.parsePrograms('{"shell":{"file":"/bin/bash","args":["-l"],"cwd":"/home/w","env":{"EDITOR":"vi"}}}')
    ok('relay.config.1 programs.json: absolute file, named programs, NAME env keys — each refusal names its program',
      /absolute/.test(bad.error) && /program name/.test(bad2.error) && /env/.test(bad3.error) && good.shell.file === '/bin/bash' && R.parsePrograms('{}').error !== undefined)
    process.env.TC_RELAY_JWT_SECRET_FOR_LEAK_CHECK = 'x'
    const env = R.ptyEnv(good.shell)
    ok('relay.config.2 a pty env is the fixed base plus the program\'s — nothing of the relay\'s own',
      env.TERM === 'xterm-256color' && env.EDITOR === 'vi' && env.HOME === '/home/w' && Object.keys(env).every((k) => !k.startsWith('TC_')) && Object.keys(env).length === 6)
    ok('relay.config.3 the relay refuses to start with nothing to verify tokens against, or a plain-http Supabase',
      /TC_SUPABASE_URL/.test(R.readRelayConfig({}).error) && /https/.test(R.readRelayConfig({ TC_SUPABASE_URL: 'http://x.co' }).error) &&
      R.readRelayConfig({ TC_SUPABASE_URL: URL_BASE }).address === '127.0.0.1')
    ok('relay.config.4 the app side takes wss, or ws only to this machine', R.client.readRelayConfig({ TC_RELAY_URL: 'wss://r.example/relay' }).kind === 'ok' &&
      R.client.readRelayConfig({ TC_RELAY_URL: 'ws://127.0.0.1:7681/relay' }).kind === 'ok' && R.client.readRelayConfig({ TC_RELAY_URL: 'ws://r.example/relay' }).kind === 'missing' &&
      /TC_RELAY_URL/.test(R.client.readRelayConfig({}).reason))
  }

  {
    const G = R.gate
    const control = { sessionId: 's', ownerId: OWNER, controllerId: GUEST, requests: [VIEWER], peers: [], cols: 120, rows: 40 }
    const v = (userId, extra = {}) => ({ panelId: 'p', sessionId: 's', connection: 'open', userId, role: null, control, canType: control.controllerId === userId, canRequest: true, program: 'shell', exited: false, reason: null, ...extra })
    ok('relay.gate.1 the renderer may type only as the controller on an open socket',
      G.relayMayType(v(GUEST)) && !G.relayMayType(v(OWNER)) && !G.relayMayType(null) && !G.relayMayType(v(VIEWER)))
    const ctl = G.relayGrid(v(GUEST), { cols: 90, rows: 30 }), watch = G.relayGrid(v(OWNER), { cols: 90, rows: 30 })
    ok('relay.gate.2 the controller fits and tells the pty; everyone else renders at the controller\'s grid and tells nothing',
      ctl.cols === 90 && ctl.tellPty === true && watch.cols === 120 && watch.rows === 40 && watch.tellPty === false)
    const kinds = (userId, extra) => G.relayActions(v(userId, extra)).map((a) => a.kind + (a.userId ? ':' + (a.userId === VIEWER ? 'V' : '?') : '')).join(' ')
    ok('relay.gate.3 the strip offers only what the relay would accept, per role',
      kinds(OWNER) === 'grant:V deny:V revoke kill' && kinds(GUEST) === 'grant:V deny:V release' && kinds(VIEWER) === 'requested' &&
      kinds(STRANGER) === 'request' && kinds(STRANGER, { canRequest: false }) === '' && kinds(OWNER, { exited: true }) === '' &&
      kinds(OWNER, { connection: 'reconnecting' }) === '')
    ok('relay.gate.4 the control line names the controller, or says why there is none',
      G.relayControlLine(v(OWNER), (u) => u === GUEST ? 'sam' : '?') === 'sam is in control' &&
      G.relayControlLine(v(GUEST), () => '') === 'You are in control' &&
      G.relayControlLine(v(GUEST, { connection: 'closed', reason: 'the token has expired' }), () => '') === 'the token has expired')
  }

  // ── JWT at the upgrade ────────────────────────────────────────────────────
  const { relay, audit } = makeRelay()
  const port = await relay.listen(0, '127.0.0.1')
  {
    const none = await connect(port, undefined)
    const forged = await connect(port, token(OWNER, { key: rotated.privateKey }))
    const expired = await connect(port, token(OWNER, { exp: now() - 120 }))
    const hs = await connect(port, token(OWNER, { alg: 'HS256', key: HS }))
    const algNone = await connect(port, token(OWNER, { alg: 'none' }))
    const aud = await connect(port, token(OWNER, { aud: 'anon' }))
    const iss = await connect(port, token(OWNER, { iss: 'https://other.supabase.co/auth/v1' }))
    ok('relay.auth.1 the upgrade is refused 401 — by name — with no token, a forged, expired, HS256-without-secret, alg:none, wrong-aud or wrong-issuer token',
      [none, forged, expired, hs, algNone, aud, iss].every((c) => c.status === 401) &&
      /sign in/.test(none.reason) && /signature|unknown key/.test(forged.reason) && /expired/.test(expired.reason) &&
      /HS256/.test(hs.reason) && /algorithm/.test(algNone.reason) && /signed-in/.test(aud.reason) && /another project/.test(iss.reason))
    const good = await connect(port, token(OWNER))
    ok('relay.auth.2 a valid ES256 token is let in as its sub, and the bearer is never echoed as the chosen protocol',
      good.status === null && good.last('hello')?.userId === OWNER && good.protocol === 'tc-relay.v1')
    good.ws.close()
    let clock = Date.now()
    const v = R.createJwtVerifier({ supabaseUrl: URL_BASE, now: () => clock, fetchJwks: async () => { jwksFetches++; return jwks } })
    const f0 = jwksFetches
    const first = await v(token(OWNER))
    jwks = { keys: [...jwks.keys, jwk(rotated.publicKey, 'k2')] }
    const early = await v(token(OWNER, { kid: 'k2', key: rotated.privateKey }))
    const sprayed = await v(token(OWNER, { kid: 'nope', key: rotated.privateKey }))
    clock += 61_000
    const later = await v(token(OWNER, { kid: 'k2', key: rotated.privateKey }))
    ok('relay.auth.3 an unknown kid refetches the JWKS at most once a minute — a rotation is picked up, a kid spray costs no fetches',
      first.ok && !early.ok && !sprayed.ok && later.ok && later.token.userId === OWNER && jwksFetches === f0 + 2)
    const confuse = await connect(port, token(OWNER, { alg: 'RS256', kid: 'k1' }))
    ok('relay.auth.4 a header cannot move a token onto another algorithm than its key\'s', confuse.status === 401)
    const { relay: hsRelay } = makeRelay({ hs: HS })
    const hp = await hsRelay.listen(0, '127.0.0.1')
    const hsOk = await connect(hp, token(OWNER, { alg: 'HS256', key: HS }))
    const hsBad = await connect(hp, token(OWNER, { alg: 'HS256', key: 'wrong' }))
    ok('relay.auth.5 with the legacy secret configured, HS256 is checked in constant time against it', hsOk.last('hello')?.userId === OWNER && hsBad.status === 401)
    hsOk.ws.close()
    await hsRelay.close()
    const wrongPath = await new Promise((resolve) => {
      const ws = new WS(`ws://127.0.0.1:${port}/other`, ['tc-relay.v1', 'bearer.' + token(OWNER)])
      ws.on('unexpected-response', (_q, res) => resolve(res.statusCode)); ws.on('error', () => {})
    })
    ok('relay.auth.6 only /relay upgrades', wrongPath === 404)
    const soon = await connect(port, token(OWNER, { exp: now() + 1 }))
    await until(() => soon.closed !== null, 2500)
    ok('relay.auth.7 a socket is closed at its token\'s exp (4401), since a signed-out token is otherwise valid to then', soon.closed === 4401)
  }

  // ── spawn, allowlist, attach, replay ──────────────────────────────────────
  const owner = await connect(port, token(OWNER))
  owner.send({ t: 'spawn', program: 'bash', cols: 80, rows: 24 })
  await until(() => owner.json('error').length > 0)
  ok('relay.spawn.1 a program not in programs.json is refused by name, and nothing is spawned', /"bash" is not a program/.test(owner.last('error')?.reason) && ptys.length === 0)
  owner.send({ t: 'spawn', program: 'shell', cols: 100, rows: 30, shareId: SHARE })
  await until(() => owner.json('attached').length > 0)
  const pty = ptys[0]
  const sid = owner.last('attached').session.sessionId
  ok('relay.spawn.2 an allowlisted name spawns THE CONFIG\'s file/argv at the asked size; the spawner is owner and controller',
    pty.spec.file === '/bin/bash' && pty.spec.args.join(' ') === '-l' && pty.size.cols === 100 && owner.last('attached').role === 'owner' &&
    (await until(() => owner.last('control')?.state.controllerId === OWNER)) && audit.some((r) => r.event === 'spawn' && r.actor === OWNER))
  {
    const s = await connect(port, token(STRANGER))
    s.send({ t: 'spawn', program: 'shell', cols: 80, rows: 24 })
    await until(() => s.json('error').length > 0)
    ok('relay.spawn.3 a signed-in person NOT on the spawner list cannot start anything — a sign-in is not a shell', /not allowed to start/.test(s.last('error')?.reason) && ptys.length === 1)
    s.ws.close()
    const v = await connect(port, token(VIEWER))
    v.send({ t: 'spawn', program: 'shell', cols: 80, rows: 24, shareId: SHARE })
    await until(() => v.json('error').length > 0)
    ok('relay.spawn.4 binding a session to a share needs owner/editor on that share', /owner or editor/.test(v.last('error')?.reason) && ptys.length === 1)
    v.ws.close()
    ok('relay.config.5 TC_RELAY_SPAWNERS: user ids only, and absent means nobody',
      R.readRelayConfig({ TC_SUPABASE_URL: URL_BASE }).spawners.size === 0 &&
      [...R.readRelayConfig({ TC_SUPABASE_URL: URL_BASE, TC_RELAY_SPAWNERS: `${OWNER}, not-an-id ,${GUEST.toUpperCase()}` }).spawners].join() === `${OWNER},${GUEST}`)
  }

  pty.emit('hello from the vm\r\n')
  await until(() => owner.bytes().toString().includes('hello from the vm'))
  const guest = await connect(port, token(GUEST))
  guest.send({ t: 'attach', sessionId: sid })
  await until(() => guest.json('attached').length > 0 && guest.bytes().length > 0)
  ok('relay.attach.1 a share member attaches as a viewer and is replayed the ring', guest.last('attached').role === 'viewer' &&
    guest.last('attached').canRequest === true && guest.bytes().toString() === 'hello from the vm\r\n' && guest.last('attached').reset === true)
  const stranger = await connect(port, token(STRANGER))
  stranger.send({ t: 'attach', sessionId: sid })
  await until(() => stranger.json('error').length > 0)
  ok('relay.attach.2 a non-member of the share is refused', /not a member/.test(stranger.last('error')?.reason) && stranger.json('attached').length === 0)
  const viewer = await connect(port, token(VIEWER))
  viewer.send({ t: 'attach', sessionId: sid })
  await until(() => viewer.json('attached').length > 0)
  viewer.send({ t: 'request' })
  await until(() => viewer.json('error').length > 0)
  ok('relay.attach.3 a share VIEWER watches and cannot even ask for control', viewer.last('attached').canRequest === false && /cannot ask/.test(viewer.last('error')?.reason))
  owner.send({ t: 'list' })
  guest.send({ t: 'list' })
  await until(() => owner.json('sessions').length > 0 && guest.json('sessions').length > 0)
  ok('relay.list.1 list names only the sessions you own', owner.last('sessions').sessions.length === 1 && guest.last('sessions').sessions.length === 0)

  // ── input gate and control hand-off ───────────────────────────────────────
  guest.type('rm -rf /\r')
  viewer.type('whoami\r')
  owner.type('ls\r')
  await until(() => pty.input().includes('ls'))
  await sleep(50)
  ok('relay.input.1 only the controller\'s bytes reach the pty — viewers\' are dropped at the relay', pty.input() === 'ls\r')
  guest.send({ t: 'resize', cols: 10, rows: 5 })
  await until(() => guest.json('error').length > 0)
  owner.send({ t: 'resize', cols: 120, rows: 40 })
  await until(() => guest.last('control')?.state.cols === 120)
  ok('relay.input.2 only the controller resizes; everyone is told the size', pty.resizes.length === 1 && pty.resizes[0][0] === 120 && /resize/.test(guest.last('error').reason))

  const ownerErrors = owner.json('error').length
  owner.send({ t: 'grant', userId: GUEST })
  await until(() => owner.json('error').length > ownerErrors)
  ok('relay.control.1 control is never pushed onto someone who did not ask', /has not asked/.test(owner.last('error')?.reason))
  guest.send({ t: 'request' })
  await until(() => owner.last('control')?.state.requests.includes(GUEST))
  owner.send({ t: 'grant', userId: GUEST })
  await until(() => guest.last('control')?.state.controllerId === GUEST)
  guest.type('echo guest\r')
  owner.type('echo owner\r')
  await until(() => pty.input().includes('echo guest'))
  await sleep(50)
  ok('relay.control.2 request → grant hands the keyboard over: the guest types, the owner no longer does',
    pty.input().endsWith('echo guest\r') && !pty.input().includes('echo owner') && guest.last('control').state.requests.length === 0)
  guest.send({ t: 'release' })
  await until(() => owner.last('control')?.state.controllerId === OWNER)
  ok('relay.control.3 a guest releasing returns control to the owner', owner.last('control').state.controllerId === OWNER)
  guest.send({ t: 'request' })
  await until(() => owner.last('control')?.state.requests.includes(GUEST))
  owner.send({ t: 'deny', userId: GUEST })
  await until(() => owner.last('control')?.state.requests.length === 0)
  guest.send({ t: 'request' })
  await until(() => owner.last('control')?.state.requests.includes(GUEST))
  owner.send({ t: 'grant', userId: GUEST })
  await until(() => owner.last('control')?.state.controllerId === GUEST)
  guest.send({ t: 'revoke' })
  guest.send({ t: 'kill' })
  await until(() => guest.json('error').length >= 3)
  owner.send({ t: 'revoke' })
  await until(() => guest.last('control')?.state.controllerId === OWNER)
  ok('relay.control.4 deny drops a request; only the owner revokes or kills, and a revoke takes control back at once',
    guest.json('error').slice(-2).every((e) => /only the owner/.test(e.reason)) && !pty.killed && guest.last('control').state.controllerId === OWNER)
  const transfers = audit.filter((r) => ['request', 'grant', 'deny', 'release', 'revoke'].includes(r.event)).map((r) => `${r.event}:${r.actor === OWNER ? 'O' : 'G'}>${r.to === OWNER ? 'O' : r.to === GUEST ? 'G' : '-'}`)
  ok('relay.audit.1 every control transfer is in the audit log, in order, with actor, from and to',
    transfers.join(' ') === 'request:G>G grant:O>G release:G>O request:G>G deny:O>G request:G>G grant:O>G revoke:O>O' &&
    audit.every((r) => typeof r.ts === 'string' && r.sessionId === sid))

  // ── heartbeat, grace, reattach ────────────────────────────────────────────
  {
    const mute = await connect(port, token(STRANGER), { autoPong: false })
    await until(() => mute.closed !== null, 1500)
    ok('relay.heartbeat.1 a socket that stops answering pings is terminated within two beats', mute.closed !== null)
  }
  guest.send({ t: 'request' })
  await until(() => owner.last('control')?.state.requests.includes(GUEST))
  owner.send({ t: 'grant', userId: GUEST })
  await until(() => owner.last('control')?.state.controllerId === GUEST)
  const heldOffset = guest.bytes().length
  guest.ws.terminate()
  await until(() => owner.last('control')?.state.peers.some((p) => p.userId === GUEST && p.sockets === 0))
  const inGrace = owner.last('control').state
  pty.emit('while you were away\r\n')
  const back = await connect(port, token(GUEST))
  back.send({ t: 'attach', sessionId: sid, since: heldOffset })
  await until(() => back.json('attached').length > 0 && back.bytes().length > 0)
  ok('relay.grace.1 a dropped controller keeps control through the grace, and a reattach resumes from its offset with no reset',
    inGrace.controllerId === GUEST && typeof inGrace.peers.find((p) => p.userId === GUEST).graceUntil === 'number' &&
    back.last('attached').reset === false && back.bytes().toString() === 'while you were away\r\n' &&
    (await until(() => back.last('control')?.state.controllerId === GUEST)))
  back.ws.terminate()
  await until(() => owner.last('control')?.state.controllerId === OWNER, 1500)
  ok('relay.grace.2 when the grace lapses, a guest\'s control returns to the owner — audited as a lapse',
    owner.last('control').state.controllerId === OWNER && owner.last('control').state.peers.every((p) => p.userId !== GUEST) &&
    audit.some((r) => r.event === 'lapse' && r.from === GUEST && r.to === OWNER))

  // ── main's client against the same relay ──────────────────────────────────
  {
    const views = { o: [], g: [] }, data = { o: [], g: [] }
    const sockets = []
    const mk = (who, sub) => R.client.createRelayClient({
      config: () => ({ kind: 'ok', url: `ws://127.0.0.1:${port}/relay` }),
      identity: async () => ({ kind: 'ok', userId: sub, token: async () => token(sub) }),
      WebSocket: class extends WebSocket { constructor(u, p) { super(u, p); sockets.push({ who, ws: this }) } },
      emitView: (v) => views[who].push(v), emitData: (d) => data[who].push(d),
      backoffMs: [50], pingMs: 100, pongDeadlineMs: 500
    })
    const co = mk('o', OWNER), cg = mk('g', GUEST)
    const sp = await co.spawn('p1', { program: 'shell', cols: 80, rows: 24, shareId: SHARE })
    const p2 = ptys.at(-1)
    await until(() => co.view('p1')?.canType === true)
    ok('relay.client.1 main spawns through the relay; the owner\'s view may type', sp.kind === 'ok' && co.view('p1').role === 'owner' && co.view('p1').canType === true)
    const refused = await co.spawn('p9', { program: 'rootshell', cols: 80, rows: 24 })
    ok('relay.client.2 a refused spawn settles as a refusal by name, and does not retry', refused.kind === 'refused' && /not a program/.test(refused.reason) && co.view('p9').connection === 'closed')
    p2.emit('prompt$ ')
    const at = await cg.attach('p1', sp.sessionId)
    await until(() => data.g.some((d) => Buffer.from(d.data).toString() === 'prompt$ '))
    ok('relay.client.3 an attach clears the terminal first, then replays', at.kind === 'ok' && data.g[0].reset === true && data.g[0].data.length === 0)
    ok('relay.client.4 a viewer\'s input is gated in main: refused, and nothing reaches the pty',
      cg.input('p1', 'nope') === false && cg.view('p1').canType === false && (await sleep(50), !p2.input().includes('nope')))
    co.input('p1', 'pwd\r')
    await until(() => p2.input() === 'pwd\r')
    cg.control('p1', 'request')
    await until(() => co.view('p1')?.control?.requests.includes(GUEST))
    co.control('p1', 'grant', GUEST)
    await until(() => cg.view('p1')?.canType === true)
    ok('relay.client.5 request/grant through main flips both views: the guest may type, the owner may not',
      cg.view('p1').role === 'controller' && co.view('p1').canType === false && co.input('p1', 'x') === false)
    const resetsBefore = data.g.filter((d) => d.reset).length
    const gws = sockets.filter((s) => s.who === 'g').at(-1).ws
    gws.close(4000, 'network blip')
    await until(() => cg.view('p1')?.connection === 'reconnecting', 1000)
    p2.emit('missed-bytes')
    await until(() => cg.view('p1')?.connection === 'open' && data.g.some((d) => Buffer.from(d.data).toString().includes('missed-bytes')), 3000)
    ok('relay.client.6 a dropped socket reconnects inside the grace: still in control, only the missed bytes, no reset',
      cg.view('p1').canType === true && data.g.filter((d) => d.reset).length === resetsBefore)
    cg.input('p1', 'after-reconnect')
    await until(() => p2.input().includes('after-reconnect'))
    ok('relay.client.7 input after the reconnect reaches the pty', p2.input().endsWith('after-reconnect'))
    const listed = await co.list()
    ok('relay.client.8 list over a transient socket', listed.kind === 'ok' && listed.sessions.some((s) => s.sessionId === sp.sessionId))
    co.kill('p1')
    await until(() => cg.view('p1')?.exited === true && co.view('p1')?.exited === true)
    ok('relay.client.9 the owner ends the session; every view says exited and may not type',
      cg.view('p1').canType === false && audit.some((r) => r.event === 'kill' && r.actor === OWNER) && audit.some((r) => r.event === 'exit' && r.sessionId === sp.sessionId))
    const noCfg = R.client.createRelayClient({
      config: () => ({ kind: 'missing', reason: 'the relay is not configured' }), identity: async () => ({ kind: 'refused', reason: 'x' }),
      WebSocket, emitView: () => {}, emitData: () => {}
    })
    const nr = await noCfg.spawn('p', { program: 'shell', cols: 80, rows: 24 })
    ok('relay.client.10 unconfigured: refused by name, no socket', nr.kind === 'refused' && /not configured/.test(nr.reason))
    co.dispose(); cg.dispose()
  }

  // ── backpressure ──────────────────────────────────────────────────────────
  {
    const { relay: bpRelay } = makeRelay({ deps: { backpressure: { high: 256 * 1024, low: 64 * 1024, cut: 256 * 1024 * 1024 }, ringBytes: 1024 * 1024 } })
    const bp = await bpRelay.listen(0, '127.0.0.1')
    const fast = await connect(bp, token(OWNER))
    fast.send({ t: 'spawn', program: 'shell', cols: 80, rows: 24, shareId: SHARE })
    await until(() => fast.json('attached').length > 0)
    const p = ptys.at(-1)
    const slow = await connect(bp, token(GUEST))
    slow.send({ t: 'attach', sessionId: fast.last('attached').session.sessionId })
    await until(() => slow.json('attached').length > 0)
    await sleep(30)
    const count = (c) => c.log.reduce((n, e) => n + (e.b ? e.b.length : 0), 0)
    const chunk = 16 * 1024, n = 320
    const stream = Buffer.alloc(chunk * n)
    for (let i = 0; i < stream.length; i++) stream[i] = 97 + ((i * 7 + (i >> 10)) % 26)
    // Like a real pty: one read per loop turn, and a paused pty produces nothing until resumed.
    const pump = async () => {
      for (let i = 0; i < n; i++) {
        while (p.paused) await sleep(5)
        p.emit(stream.subarray(i * chunk, (i + 1) * chunk))
        await new Promise((r) => setImmediate(r))
      }
    }
    slow.ws._socket.pause()
    await pump()
    await until(() => count(fast) === stream.length, 5000)
    // Whether the reader ALSO lagged for a moment (it shares this event loop
    // with the server) is not the property; getting every byte, in order,
    // while the other viewer is stalled, is.
    ok('relay.bp.1 a stalled viewer does not hold up the others: the reading client got every byte, in order, with no resync',
      fast.bytes().equals(stream) && fast.json('resync').length === 0 && count(slow) === 0)
    slow.ws._socket.resume()
    await until(() => slow.json('resync').length > 0 && count(slow) > 0, 5000)
    await sleep(300)
    const lastResync = slow.log.findLastIndex((e) => e.m && e.m.t === 'resync')
    const after = Buffer.concat(slow.log.slice(lastResync + 1).filter((e) => e.b).map((e) => e.b))
    const from = lastResync >= 0 ? slow.log[lastResync].m.offset : -1
    ok('relay.bp.2 once drained, the lagging viewer is resynced from the ring: a reset, then the stream from its offset to the end',
      lastResync >= 0 && after.equals(stream.subarray(from)) && stream.length - from <= 1024 * 1024)
    const fastMark = fast.log.length, slowMark = slow.log.length
    fast.ws._socket.pause(); slow.ws._socket.pause()
    // Pump until the kernel's socket buffers are full and the relay's own
    // queues pass HIGH for both — how much that takes is the OS's business.
    let emitted = 0, stop = false
    const second = (async () => {
      for (let i = 0; !stop && emitted < 256 * 1024 * 1024; i++) {
        while (p.paused && !stop) await sleep(5)
        if (stop) break
        p.emit(stream.subarray((i % n) * chunk, (i % n + 1) * chunk))
        emitted += chunk
        await new Promise((r) => setImmediate(r))
      }
    })()
    await until(() => p.paused, 30000)
    ok('relay.bp.3 when EVERY client is lagging the pty itself is paused, so the ring does not overwrite what all of them need', p.paused === true && p.pauses >= 1)
    fast.ws._socket.resume(); slow.ws._socket.resume()
    await until(() => !p.paused, 5000)
    stop = true
    await second
    // Stream byte k is stream[k % stream.length] (the second pump cycles from 0).
    // A client's screen is what followed its last resync; it must be exactly
    // the stream from that offset to the end — a resync is allowed (one
    // client can fall behind by more than the ring before the other does),
    // a wrong or missing byte is not.
    const total = stream.length + emitted
    const screen = (c, fromIndex, startOffset) => {
      let pos = startOffset, bytes = []
      for (const e of c.log.slice(fromIndex)) {
        if (e.m && e.m.t === 'resync') { pos = e.m.offset; bytes = [] } else if (e.b) bytes.push(e.b)
      }
      return { pos, data: Buffer.concat(bytes) }
    }
    const matches = ({ pos, data }) => pos + data.length === total && data.every((x, i) => x === stream[(pos + i) % stream.length])
    await until(() => matches(screen(fast, fastMark, stream.length)) && matches(screen(slow, slowMark, stream.length)), 15000)
    ok('relay.bp.4 …resumed once they drain; each client ends on exactly the stream\'s tail (the gap, or a resync from the ring)',
      p.resumes >= 1 && !p.paused && matches(screen(fast, fastMark, stream.length)) && matches(screen(slow, slowMark, stream.length)))
    fast.ws.terminate(); slow.ws.terminate()
    await bpRelay.close()
  }

  owner.ws.close(); viewer.ws.close(); stranger.ws.close()
  await relay.close()
  const failures = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
  process.exitCode = failures.length ? 1 : 0
})().catch((e) => { console.log(`verify-relay threw: ${e && e.stack}`); process.exitCode = 1 })
