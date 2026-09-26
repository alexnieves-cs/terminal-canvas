/* The Terminal Canvas account: config, PKCE, the loopback callback, the
   session in the credential store, invite and join, and the four `tc` verbs.
   Run with: npm run verify:account

   Plain node, against the REAL credential store (over a fake crypto in a temp
   dir) and a recorded fetch. The callback server binds a real 127.0.0.1 port,
   because "the favicon request ended the sign-in" and "it listened on every
   interface" are properties of a socket, not of an argument list.

   What this cannot see: Supabase itself. The migration's RLS is exercised
   separately against Postgres (see supabase/migrations' header); GitHub's
   consent screen and GoTrue's real token answer are verified by hand. */
'use strict'
const { buildSync } = require('esbuild')
const { mkdirSync, mkdtempSync, rmSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { createHash } = require('node:crypto')
const http = require('node:http')
const net = require('node:net')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const root = join(__dirname, '..')
mkdirSync(join(root, 'out/verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'account-entry.cjs')], outfile: join(root, 'out/verify/account.cjs'),
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'error', external: ['electron', 'node-pty'],
  alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') }
})
const A = require('../out/verify/account.cjs')

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const get = (port, path, host = '127.0.0.1') => new Promise((res) => {
  const req = http.get({ host, port, path }, (r) => { let b = ''; r.on('data', (d) => { b += d }); r.on('end', () => res({ status: r.statusCode, body: b })) })
  req.on('error', (e) => res({ error: e.code }))
})

const SECRET_ACCESS = 'ACCESS-SECRET-eyJ'
const SECRET_REFRESH = 'REFRESH-SECRET-r1'
const CFG = { TC_SUPABASE_URL: 'https://proj.supabase.co', TC_SUPABASE_ANON_KEY: 'anon-key' }

/** A GoTrue/PostgREST stand-in: records every call, answers by path. */
function fakeServer(overrides = {}) {
  const calls = []
  const session = (n = 1) => ({
    access_token: `${SECRET_ACCESS}${n}`, refresh_token: `${SECRET_REFRESH}${n}`, expires_in: 3600, token_type: 'bearer',
    user: { id: 'uuid-alice', user_metadata: { user_name: 'alice-meta' }, identities: [{ provider: 'github', identity_data: { provider_id: '101', user_name: 'alice' } }] }
  })
  const routes = {
    'POST /auth/v1/token?grant_type=pkce': () => [200, session(1)],
    'POST /auth/v1/token?grant_type=refresh_token': () => [200, session(2)],
    'POST /auth/v1/logout?scope=local': () => [204, ''],
    'POST /rest/v1/rpc/ensure_personal_org': () => [200, { id: 'org-a', name: 'alice' }],
    'GET /rest/v1/organization_members': () => [200, [{ org_id: '11111111-1111-1111-1111-111111111111', role: 'owner', organizations: { name: 'alice' } }]],
    'POST /rest/v1/invites': () => [201, ''],
    'POST /rest/v1/rpc/invite_preview': () => [200, { org_name: 'alice', role: 'member' }],
    'POST /rest/v1/rpc/accept_invite': () => [200, { org_id: '11111111-1111-1111-1111-111111111111', org_name: 'alice', role: 'member' }],
    ...overrides
  }
  const fetch = async (url, init) => {
    const u = new URL(url)
    const key = `${init.method} ${u.pathname}${u.pathname.startsWith('/auth') ? u.search : ''}`
    calls.push({ key, url, init })
    const route = routes[key]
    if (route === undefined) return { status: 404, text: async () => '{"message":"no route"}' }
    const [status, body] = route(init)
    if (status === 'throw') throw new Error(`boom ${url} ${init.body}`)
    return { status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }
  }
  return { calls, fetch }
}

function harness(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tc-account-'))
  const store = A.createCredentialStore({
    filePath: join(dir, 'credentials.json'),
    crypto: { available: () => true, encrypt: (s) => Buffer.from(`enc:${s}`), decrypt: (b) => b.toString().slice(4) }
  })
  const server = opts.server ?? fakeServer()
  const opened = []
  const asked = []
  let clock = opts.now ?? 1_800_000_000_000
  const svc = A.createAccountService({
    store,
    config: () => A.readAccountConfig(opts.env ?? CFG),
    fetch: server.fetch,
    openExternal: async (url) => { opened.push(url); if (opts.openThrows) throw new Error('no browser') },
    confirm: async (ask) => { asked.push(ask); return opts.confirm ?? true },
    now: () => clock,
    // A callback that "arrives" as soon as it is listened for.
    listen: opts.listen ?? (async () => ({ result: Promise.resolve(opts.callback ?? { kind: 'code', code: 'the-code' }), close: () => {} })),
    loginTimeoutMs: 200
  })
  return { svc, store, server, opened, asked, dir, tick: (ms) => { clock += ms }, file: () => readFileSync(join(dir, 'credentials.json'), 'utf8') }
}

void (async () => {
  // ── config ────────────────────────────────────────────────────────────────
  ok('account.config.1 no URL or key is a named refusal', A.readAccountConfig({}).kind === 'missing')
  ok('account.config.2 plain http to a remote host is refused; http to 127.0.0.1 is allowed',
    A.readAccountConfig({ ...CFG, TC_SUPABASE_URL: 'http://proj.supabase.co' }).kind === 'missing' &&
    A.readAccountConfig({ ...CFG, TC_SUPABASE_URL: 'http://127.0.0.1:54321' }).kind === 'ok')
  ok('account.config.3 the login-shell env is read when process env lacks it (packaged app from Finder)',
    A.readAccountConfig({}, CFG).kind === 'ok')
  ok('account.config.4 a bad callback port is refused; the default is 47823',
    A.readAccountConfig({ ...CFG, TC_AUTH_CALLBACK_PORT: '80' }).kind === 'missing' && A.readAccountConfig(CFG).config.callbackPort === 47823)

  // ── PKCE + authorize URL ──────────────────────────────────────────────────
  const pkce = A.createPkce()
  ok('account.pkce.1 S256: the challenge is base64url(sha256(verifier)), the verifier 43 chars',
    pkce.verifier.length === 43 && pkce.challenge === createHash('sha256').update(pkce.verifier).digest('base64url'))
  const au = new URL(A.authorizeUrl(A.readAccountConfig(CFG).config, pkce))
  ok('account.pkce.2 the authorize URL names github, the challenge, s256 and the loopback — and never the verifier',
    au.pathname === '/auth/v1/authorize' && au.searchParams.get('provider') === 'github' &&
    au.searchParams.get('code_challenge') === pkce.challenge && au.searchParams.get('code_challenge_method') === 's256' &&
    au.searchParams.get('redirect_to') === 'http://127.0.0.1:47823/auth/callback' && !au.toString().includes(pkce.verifier))

  // ── the loopback ──────────────────────────────────────────────────────────
  {
    const port = await freePort()
    const cb = await A.startCallbackServer(port, 5000)
    const fav = await get(port, '/favicon.ico')
    const hit = await get(port, '/auth/callback?code=abc123')
    const r = await cb.result
    ok('account.loop.1 a stray path is a 404 and does NOT end the sign-in; the callback path delivers the code',
      fav.status === 404 && hit.status === 200 && r.kind === 'code' && r.code === 'abc123', JSON.stringify(r))
    await new Promise((res) => setTimeout(res, 50))
    const after = await get(port, '/auth/callback?code=second')
    ok('account.loop.2 the server is one-shot: closed after the first callback', after.error === 'ECONNREFUSED', JSON.stringify(after))
  }
  {
    const port = await freePort()
    const cb = await A.startCallbackServer(port, 5000)
    await get(port, '/auth/callback?error=access_denied&error_description=The+user+denied')
    const r = await cb.result
    ok('account.loop.3 a denied consent resolves as an error with GitHub\'s words', r.kind === 'error' && r.reason === 'The user denied')
  }
  {
    const port = await freePort()
    const cb = await A.startCallbackServer(port, 80)
    ok('account.loop.4 no callback in time is a timeout', (await cb.result).kind === 'timeout')
  }
  {
    const port = await freePort()
    const blocker = net.createServer().listen(port, '127.0.0.1')
    await new Promise((res) => blocker.once('listening', res))
    let rejected = false
    try { await A.startCallbackServer(port, 100) } catch { rejected = true }
    blocker.close()
    ok('account.loop.5 a busy port rejects (so login can name it), never resolves a dead server', rejected)
  }

  // ── parseSession ──────────────────────────────────────────────────────────
  {
    const now = () => 1_000_000
    const s = A.parseSession({ access_token: 'a', refresh_token: 'r', expires_at: 99, user: { id: 'u', identities: [{ provider: 'github', identity_data: { provider_id: '42', user_name: 'x' } }] } }, now)
    const none = A.parseSession({ access_token: 'a', refresh_token: 'r', user: { id: 'u', user_metadata: {} } }, now)
    const junk = A.parseSession({ access_token: 'a', refresh_token: 'r', user: { id: 'u', user_metadata: { provider_id: '../jira' } } }, now)
    ok('account.parse.1 the GitHub id comes from the github identity; a session with none, or a non-numeric one, is refused',
      s?.githubId === '42' && s.githubLogin === 'x' && s.expiresAt === 99 && none === undefined && junk === undefined)
  }

  // ── the credential key ────────────────────────────────────────────────────
  {
    const h = harness()
    ok('account.key.1 the store takes supabase:github:<digits> and refuses any other shape',
      h.store.set('supabase:github:101', 'x').ok === true && h.store.set('supabase:github:abc', 'x').ok === false &&
      h.store.set('supabase:github:', 'x').ok === false && h.store.set('supabase', 'x').ok === false)
    ok('account.key.2 an account key is not a SERVICES row (the Credentials palette never offers to paste one)',
      !A.SERVICES.some((s) => s.id.startsWith('supabase')))
    rmSync(h.dir, { recursive: true, force: true })
  }

  // ── login ─────────────────────────────────────────────────────────────────
  {
    const h = harness()
    const r = await h.svc.login()
    const key = 'supabase:github:101'
    ok('account.login.1 a sign-in exchanges the code with the verifier and stores the session under supabase:github:<id>',
      r.kind === 'signed-in' && r.session.githubId === '101' && r.session.githubLogin === 'alice' &&
      h.store.list().some((m) => m.service === key && m.label === 'alice'), JSON.stringify(r))
    const ex = h.server.calls.find((c) => c.key === 'POST /auth/v1/token?grant_type=pkce')
    const exBody = JSON.parse(ex?.init.body ?? '{}')
    const opened = new URL(h.opened[0])
    ok('account.login.2 the verifier redeemed is the one whose challenge was in the opened URL',
      exBody.auth_code === 'the-code' && createHash('sha256').update(exBody.code_verifier).digest('base64url') === opened.searchParams.get('code_challenge'))
    ok('account.login.3 the result carries no token, and the file on disk holds no plaintext token',
      !JSON.stringify(r).includes('SECRET') && !JSON.stringify(h.svc.sessions()).includes('SECRET') && !h.file().includes('SECRET') && /"cipher": "[A-Za-z0-9+/=]{40,}"/.test(h.file()))
    ok('account.login.4 a first sign-in ensures the personal org and reports it', r.org?.id === 'org-a')
    ok('account.login.5 a click in the app asks nothing (askFirst false)', h.asked.length === 0)
    rmSync(h.dir, { recursive: true, force: true })
  }
  {
    const h = harness({ confirm: false })
    const r = await h.svc.login({ askFirst: true })
    ok('account.login.6 from a terminal (askFirst), a declined dialog opens NO browser and stores nothing',
      r.kind === 'declined' && h.asked.length === 1 && h.opened.length === 0 && h.store.list().length === 0)
    rmSync(h.dir, { recursive: true, force: true })
  }
  {
    const h = harness({ listen: async () => { throw Object.assign(new Error('in use'), { code: 'EADDRINUSE' }) } })
    const r = await h.svc.login()
    ok('account.login.7 a busy callback port is refused by name, before any browser opens',
      r.kind === 'refused' && r.reason.includes('47823') && r.reason.includes('TC_AUTH_CALLBACK_PORT') && h.opened.length === 0, r.reason)
    rmSync(h.dir, { recursive: true, force: true })
  }
  {
    let release
    const h = harness({ listen: async () => ({ result: new Promise((res) => { release = res }), close: () => {} }) })
    const first = h.svc.login()
    await new Promise((res) => setTimeout(res, 10))
    const second = await h.svc.login()
    release({ kind: 'timeout' })
    const firstR = await first
    ok('account.login.8 one sign-in at a time; a timeout is a named failure and stores nothing',
      second.kind === 'refused' && firstR.kind === 'failed' && h.store.list().length === 0)
    rmSync(h.dir, { recursive: true, force: true })
  }
  {
    const h = harness({ server: fakeServer({ 'POST /auth/v1/token?grant_type=pkce': () => ['throw'] }) })
    const r = await h.svc.login()
    ok('account.login.9 a network error never echoes the request (which carries the verifier)',
      r.kind === 'failed' && !r.reason.includes('boom') && !r.reason.includes('code_verifier'), r.reason)
    rmSync(h.dir, { recursive: true, force: true })
  }
  {
    const h = harness({ env: {} })
    const r = await h.svc.login()
    ok('account.login.10 unconfigured is a refusal naming both env vars', r.kind === 'refused' && r.reason.includes('TC_SUPABASE_URL') && r.reason.includes('TC_SUPABASE_ANON_KEY'))
    rmSync(h.dir, { recursive: true, force: true })
  }

  // ── refresh ───────────────────────────────────────────────────────────────
  {
    const h = harness()
    await h.svc.login()
    h.tick(3600 * 1000)
    const r = await h.svc.invite({ role: 'member' })
    const refreshed = h.server.calls.some((c) => c.key === 'POST /auth/v1/token?grant_type=refresh_token')
    const inviteAuth = h.server.calls.find((c) => c.key === 'POST /rest/v1/invites')?.init.headers.authorization
    ok('account.refresh.1 an expired access token is refreshed before use, and the new one is what is sent',
      r.kind === 'invited' && refreshed && inviteAuth === `Bearer ${SECRET_ACCESS}2`)
    rmSync(h.dir, { recursive: true, force: true })
  }
  {
    const h = harness({ server: fakeServer({ 'POST /auth/v1/token?grant_type=refresh_token': () => [400, { error_description: 'Invalid Refresh Token' }] }) })
    await h.svc.login()
    h.tick(3600 * 1000)
    const r = await h.svc.invite({ role: 'member' })
    ok('account.refresh.2 a rejected refresh drops the session and says so', r.kind === 'refused' && h.svc.sessions().length === 0, JSON.stringify(r))
    rmSync(h.dir, { recursive: true, force: true })
  }

  // ── invite ────────────────────────────────────────────────────────────────
  {
    const h = harness()
    ok('account.invite.0 inviting while signed out is the one not-signed-in sentence', (await h.svc.invite({ role: 'member' })).reason === A.NOT_SIGNED_IN)
    await h.svc.login()
    const r = await h.svc.invite({ role: 'member' })
    const post = h.server.calls.find((c) => c.key === 'POST /rest/v1/invites')
    const body = JSON.parse(post?.init.body ?? '{}')
    ok('account.invite.1 the code is tcinv_ + 27 base64url chars and only its sha256 is sent',
      r.kind === 'invited' && A.INVITE_CODE.test(r.code) && body.code_hash === createHash('sha256').update(r.code).digest('hex') &&
      !post.init.body.includes(r.code) && body.role === 'member', JSON.stringify(body))
    const r2 = await h.svc.invite({ role: 'member' })
    ok('account.invite.2 two invites never share a code (CSPRNG)', r2.kind === 'invited' && r2.code !== r.code)
    ok('account.invite.3 an invite expires in seven days', r.kind === 'invited' && Date.parse(r.expiresAt) - 1_800_000_000_000 === 7 * 86400_000)
    ok('account.invite.4 an unknown role is refused before any request', (await h.svc.invite({ role: 'owner' })).kind === 'refused')
    rmSync(h.dir, { recursive: true, force: true })
  }
  {
    const two = [
      { org_id: '11111111-1111-1111-1111-111111111111', role: 'admin', organizations: { name: 'one' } },
      { org_id: '22222222-2222-2222-2222-222222222222', role: 'owner', organizations: { name: 'two' } }
    ]
    const h = harness({ server: fakeServer({ 'GET /rest/v1/organization_members': () => [200, two] }) })
    await h.svc.login()
    const ambiguous = await h.svc.invite({ role: 'member' })
    const adminAsAdmin = await h.svc.invite({ role: 'admin', orgId: two[0].org_id })
    const notMine = await h.svc.invite({ role: 'member', orgId: '33333333-3333-3333-3333-333333333333' })
    ok('account.invite.5 two orgs ask for --org; an admin cannot invite an admin; a foreign org is refused',
      ambiguous.kind === 'refused' && ambiguous.reason.includes('--org') && adminAsAdmin.kind === 'refused' && notMine.kind === 'refused' &&
      !h.server.calls.some((c) => c.key === 'POST /rest/v1/invites'))
    rmSync(h.dir, { recursive: true, force: true })
  }

  // ── join ──────────────────────────────────────────────────────────────────
  const CODE = 'tcinv_' + 'A'.repeat(27)
  {
    const h = harness()
    await h.svc.login()
    const r = await h.svc.join({ code: CODE, askFirst: true })
    const sent = h.server.calls.filter((c) => c.key.startsWith('POST /rest/v1/rpc/') && c.key !== 'POST /rest/v1/rpc/ensure_personal_org')
    ok('account.join.1 join previews, asks, accepts — and only the hash ever leaves the machine',
      r.kind === 'joined' && r.orgName === 'alice' && h.asked.length === 1 && h.asked[0].message.includes('alice') &&
      sent.length === 2 && sent.every((c) => !c.init.body.includes(CODE) && c.init.body.includes(createHash('sha256').update(CODE).digest('hex'))), JSON.stringify(r))
    rmSync(h.dir, { recursive: true, force: true })
  }
  {
    const h = harness({ confirm: false })
    await h.svc.login()
    const r = await h.svc.join({ code: CODE, askFirst: true })
    ok('account.join.2 a declined dialog never calls accept_invite', r.kind === 'declined' && !h.server.calls.some((c) => c.key === 'POST /rest/v1/rpc/accept_invite'))
    rmSync(h.dir, { recursive: true, force: true })
  }
  {
    const h = harness({ server: fakeServer({ 'POST /rest/v1/rpc/invite_preview': () => [200, 'null'] }) })
    await h.svc.login()
    const bad = await h.svc.join({ code: 'not-a-code' })
    const unknown = await h.svc.join({ code: CODE, askFirst: true })
    ok('account.join.3 a malformed code is refused before any request; an unknown one is refused before any dialog',
      bad.kind === 'refused' && unknown.kind === 'refused' && h.asked.length === 0)
    rmSync(h.dir, { recursive: true, force: true })
  }

  // ── logout ────────────────────────────────────────────────────────────────
  {
    const h = harness({ server: fakeServer({ 'POST /auth/v1/logout?scope=local': () => ['throw'] }) })
    await h.svc.login()
    const r = await h.svc.logout()
    ok('account.logout.1 sign-out deletes locally even when the server cannot be reached',
      r.kind === 'signed-out' && r.githubIds[0] === '101' && h.svc.sessions().length === 0 && h.store.list().length === 0)
    ok('account.logout.2 signing out an account that is not signed in is refused by name', (await h.svc.logout('999')).kind === 'refused')
    rmSync(h.dir, { recursive: true, force: true })
  }

  // ── the control doors ─────────────────────────────────────────────────────
  const P = (o) => A.parseControlLine(JSON.stringify(o))
  ok('account.control.1 the socket parses login, logout, invite and join',
    P({ verb: 'login' }).kind === 'ok' && P({ verb: 'logout', githubId: '101' }).kind === 'ok' &&
    P({ verb: 'invite', role: 'member' }).kind === 'ok' && P({ verb: 'join', code: CODE }).kind === 'ok')
  ok('account.control.2 invite needs a role; logout takes only a numeric id',
    P({ verb: 'invite' }).kind === 'bad' && P({ verb: 'invite', role: 'owner' }).kind === 'bad' && P({ verb: 'logout', githubId: 'x' }).kind === 'bad')
  ok('account.control.3 the URL door refuses every account verb',
    ['login', 'logout', 'invite?role=member', `join?code=${CODE}`].every((h) => A.parseControlUrl(`terminal-canvas://${h}`).kind === 'bad'))
  {
    const seen = []
    const handler = A.createControlHandler({
      presets: () => [], defaultId: () => null, spawn: () => {}, list: () => [], focus: () => false,
      account: {
        login: async (o) => { seen.push(['login', o]); return { kind: 'declined', reason: 'no' } },
        logout: async (id) => { seen.push(['logout', id]); return { kind: 'signed-out', githubIds: [] } },
        invite: async (r) => { seen.push(['invite', r]); return { kind: 'invited', code: CODE, orgId: 'o', orgName: 'n', role: 'member', expiresAt: 'x' } },
        join: async (r) => { seen.push(['join', r]); return { kind: 'joined', orgId: 'o', orgName: 'n', role: 'member' } }
      }
    })
    const login = await handler({ verb: 'login' })
    await handler({ verb: 'join', code: CODE })
    const inv = await handler({ verb: 'invite', role: 'member' })
    ok('account.control.4 from the socket, login and join are ALWAYS askFirst; a decline is ok:false',
      seen[0][1]?.askFirst === true && seen[1][1]?.askFirst === true && login.ok === false && login.kind === 'declined')
    ok('account.control.5 invite answers ok with the code for the person to share', inv.ok === true && inv.code === CODE)
    const bare = A.createControlHandler({ presets: () => [], defaultId: () => null, spawn: () => {}, list: () => [], focus: () => false })
    ok('account.control.6 no account wired is a named refusal', (await bare({ verb: 'login' })).ok === false)
  }
  const B = (argv) => A.buildRequest(argv, {})
  ok('account.cli.1 tc invite requires --role; tc join takes exactly one code; tc logout --user passes the id',
    B(['invite']).kind === 'usage' && JSON.parse(B(['invite', '--role', 'member']).line).role === 'member' &&
    B(['join']).kind === 'usage' && B(['join', 'a', 'b']).kind === 'usage' &&
    JSON.parse(B(['logout', '--user', '101']).line).githubId === '101' && B(['login', 'x']).kind === 'usage')

  // ── M336. the account picker ──────────────────────────────────────────────
  {
    const h = harness()
    await h.svc.login()
    // A second account, signed in LATER — newest-first alone would make it active.
    await new Promise((res) => setTimeout(res, 5))
    h.store.set('supabase:github:202', JSON.stringify({ v: 1, accessToken: 'ACCESS-SECRET-eyJ-bob', refreshToken: 'REFRESH-SECRET-bob', expiresAt: 1_800_000_000 + 3600, userId: 'uuid-bob', githubId: '202', githubLogin: 'bob' }))
    h.store.setLabel('supabase:github:202', 'bob')
    const order = () => h.svc.sessions().map((m) => m.githubId).join(',')
    ok('picker.1 the account a person signed in with is ACTIVE until they choose another, even when a newer one exists',
      order() === '101,202' && h.svc.currentUserId() === 'uuid-alice', order())
    const used = h.svc.use('202')
    ok('picker.2 use() makes an account active: first in sessions(), and the user every event is stamped with',
      used.kind === 'ok' && used.session.githubLogin === 'bob' && order() === '202,101' && h.svc.currentUserId() === 'uuid-bob', order())
    const bad = h.svc.use('999')
    ok('picker.3 an account not signed in here is refused by name and changes nothing', bad.kind === 'refused' && order() === '202,101')
    await h.svc.logout('202')
    ok('picker.4 signing out the active account hands "active" to the next (the choice goes with the account)',
      order() === '101' && h.svc.currentUserId() === 'uuid-alice', order())
    const leaked = JSON.stringify([used, bad, h.svc.sessions(), h.svc.status()])
    ok('picker.5 status says configured (or names the missing variables), and no picker answer carries a token',
      h.svc.status().configured === true && harness({ env: {} }).svc.status().configured === false &&
      !leaked.includes('SECRET'), leaked.slice(0, 200))
  }
  // ── M337. the share's people ─────────────────────────────────────────────
  {
    const SHARE = '22222222-2222-2222-2222-222222222222'
    const server = fakeServer({
      'GET /rest/v1/workspace_shares': () => [200, [{ org_id: '11111111-1111-1111-1111-111111111111' }]],
      'GET /rest/v1/organization_members': () => [200, [{ user_id: 'uuid-carol', users: { github_login: 'carol' } }, { user_id: 'uuid-alice', users: { github_login: 'alice' } }, { user_id: 'uuid-bob', users: { github_login: 'bob' } }]],
      'GET /rest/v1/workspace_members': () => [200, [{ user_id: 'uuid-alice', role: 'owner' }, { user_id: 'uuid-bob', role: 'viewer' }]]
    })
    const h = harness({ server })
    await h.svc.login()
    const m = await h.svc.shareMembers(SHARE)
    ok('share.members.1 every person in the share\'s org, owner first, then who is in, then who could be; me marked; no token',
      m.kind === 'ok' && m.members.map((r) => `${r.login}:${r.role}${r.me ? '*' : ''}`).join(',') === 'alice:owner*,bob:viewer,carol:null' &&
      !JSON.stringify(m).includes('SECRET'), JSON.stringify(m))
  }
  // ── M336–M337. the `tc` picker and sharing verbs ─────────────────────────
  {
    const SHARE = '22222222-2222-2222-2222-222222222222'
    const calls = []
    let answer = false
    const asked = []
    const sessions = [{ githubId: '101', githubLogin: 'alice', userId: 'uuid-alice' }, { githubId: '202', githubLogin: 'bob', userId: 'uuid-bob' }]
    const sc = A.createShareControl({
      account: {
        sessions: () => sessions,
        use: (id) => { calls.push(['use', id]); return { kind: 'ok', session: sessions.find((s) => s.githubId === id) } },
        shareMembers: async () => ({ kind: 'ok', orgId: 'o', members: [{ userId: 'uuid-bob', login: 'bob', role: 'viewer', me: false }] }),
        team: async (orgId) => (orgId === undefined || orgId === 'o' ? { kind: 'ok', me: 'uuid-alice', org: { id: 'o', name: 'Acme' }, orgs: [{ id: 'o', name: 'Acme' }], members: [], presence: [], activity: [] } : { kind: 'refused', reason: `you are not a member of organization ${orgId}` })
      },
      doors: {
        share: async (r) => { calls.push(['share', r]); return { kind: 'ok', share: { id: SHARE, orgId: 'o', name: 'W', role: 'owner' } } },
        shares: async () => ({ kind: 'ok', shares: [{ id: SHARE, orgId: 'o', name: 'Team canvas', role: 'editor' }] }),
        openShare: async (id) => { calls.push(['open', id]); return { kind: 'ok', workspaceId: 'w9' } },
        setShareMember: async (r) => { calls.push(['role', r]); return { kind: 'ok' } }
      },
      activeWorkspaceName: () => 'W',
      confirm: async (ask) => { asked.push(ask.message); return answer }
    })
    const declined = [await sc.use('bob'), await sc.share(), await sc.openShare(SHARE), await sc.shareRole({ shareId: SHARE, who: 'bob', role: 'editor' })]
    ok('share.control.1 from the socket, use/share/open-share/share-role each ASK first, and a decline changes nothing',
      declined.every((r) => r.ok === false && r.kind === 'declined') && calls.length === 0 && asked.length === 4, JSON.stringify({ calls, asked }))
    answer = true
    const done = [await sc.use('BOB'), await sc.share(), await sc.openShare(SHARE), await sc.shareRole({ shareId: SHARE, who: 'bob', role: null })]
    ok('share.control.2 confirmed, each acts once — a login resolves case-insensitively to its id, a member\'s login to their user id',
      done.every((r) => r.ok === true) && JSON.stringify(calls) === JSON.stringify([['use', '202'], ['share', { orgId: 'o' }], ['open', SHARE], ['role', { shareId: SHARE, userId: 'uuid-bob', role: null }]]), JSON.stringify(calls))
    ok('share.control.7 the dialogs NAME what they act on: the organization a share goes into, and the shared workspace a role changes in',
      asked.some((m) => m === 'Share “W” with Acme?') && asked.some((m) => m === 'Remove bob from “Team canvas”?'), JSON.stringify(asked))
    const before = asked.length
    const unknown = [await sc.use('mallory'), await sc.openShare('33333333-3333-3333-3333-333333333333'), await sc.shareRole({ shareId: SHARE, who: 'mallory', role: 'viewer' }),
      await sc.share('44444444-4444-4444-4444-444444444444'), await sc.shareRole({ shareId: '33333333-3333-3333-3333-333333333333', who: 'bob', role: 'viewer' })]
    ok('share.control.3 an unknown account, share, person or organization is refused by name WITHOUT a dialog', unknown.every((r) => r.ok === false && r.kind === 'refused') && asked.length === before)
    const listed = sc.accounts()
    ok('share.control.4 tc accounts lists the active one first, ids and logins only', listed.ok && listed.active === 'alice' && listed.accounts.length === 2 && !('userId' in listed.accounts[0]))
  }
  {
    const SHARE = '22222222-2222-2222-2222-222222222222'
    const P = (o) => A.parseControlLine(JSON.stringify(o))
    ok('share.control.5 the socket parses the six verbs and refuses a bad id or role; the URL door refuses all six',
      ['accounts', 'shares'].every((v) => P({ verb: v }).kind === 'ok') && P({ verb: 'use', who: 'bob' }).kind === 'ok' &&
      P({ verb: 'share', orgId: SHARE }).kind === 'ok' && P({ verb: 'share', orgId: 'x' }).kind === 'bad' &&
      P({ verb: 'open-share', shareId: SHARE }).kind === 'ok' && P({ verb: 'open-share', shareId: 'x' }).kind === 'bad' &&
      P({ verb: 'share-role', shareId: SHARE, who: 'bob', role: 'none' }).req?.role === null && P({ verb: 'share-role', shareId: SHARE, who: 'bob', role: 'owner' }).kind === 'bad' &&
      ['accounts', 'use?who=bob', 'shares', 'share', `open-share?shareId=${SHARE}`, `share-role?shareId=${SHARE}&who=bob&role=viewer`].every((h) => A.parseControlUrl(`terminal-canvas://${h}`).kind === 'bad'))
    const B = (argv) => A.buildRequest(argv, {})
    ok('share.cli.1 tc builds the six verbs; share takes only --org; share-role takes exactly three arguments',
      JSON.parse(B(['use', 'bob']).line).who === 'bob' && JSON.parse(B(['share', '--org', SHARE]).line).orgId === SHARE &&
      B(['share', 'x']).kind === 'usage' && JSON.parse(B(['open-share', SHARE]).line).shareId === SHARE &&
      JSON.parse(B(['share-role', SHARE, 'bob', 'viewer']).line).role === 'viewer' && B(['share-role', SHARE, 'bob']).kind === 'usage' &&
      B(['accounts', 'x']).kind === 'usage')
    const bare = A.createControlHandler({ presets: () => [], defaultId: () => null, spawn: () => {}, list: () => [], focus: () => false })
    ok('share.control.6 no sharing wired is a named refusal', (await bare({ verb: 'shares' })).ok === false)
  }
  // ── M336–M337. what the menu and dialog say ──────────────────────────────
  {
    const s = (id, login) => ({ githubId: id, githubLogin: login, userId: `u-${id}`, expiresAt: '', addedAt: '' })
    ok('menu.1 the trigger is absent unconfigured-and-signed-out, "Sign in" configured, and initials once signed in (with a count of the others)',
      A.accountTrigger(null, []).kind === 'hidden' && A.accountTrigger({ configured: false, reason: 'x' }, []).kind === 'hidden' &&
      A.accountTrigger({ configured: true }, []).kind === 'sign-in' &&
      JSON.stringify(A.accountTrigger({ configured: false, reason: 'x' }, [s('1', 'ada-lovelace'), s('2', 'octocat')])) === JSON.stringify({ kind: 'account', login: 'ada-lovelace', initials: 'AL', others: 1 }) &&
      A.initialsOf('octocat') === 'OC')
    const row = (role, me = false) => ({ userId: 'u', login: 'x', role, me })
    ok('menu.2 only an owner is offered choices, never for themself or the owner, and never "owner" itself',
      JSON.stringify(A.roleChoices('owner', row('viewer'))) === JSON.stringify(['editor', 'viewer', null]) &&
      JSON.stringify(A.roleChoices('owner', row(null))) === JSON.stringify(['editor', 'viewer', null]) &&
      A.roleChoices('owner', row('owner')).length === 0 && A.roleChoices('owner', row('editor', true)).length === 0 &&
      A.roleChoices('editor', row('viewer')).length === 0)
    ok('menu.3 the dialog\'s promise names what crosses and what does not', /card/.test(A.SHARE_SENDS) && /No command, folder or transcript leaves/.test(A.SHARE_SENDS))
  }

  const failures = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
  process.exitCode = failures.length ? 1 : 0
})().catch((e) => { console.log(`verify-account threw: ${e && e.stack}`); process.exitCode = 1 })
