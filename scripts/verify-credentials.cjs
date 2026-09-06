/* Verifies the credential store and its schema. Run: npm run verify:credentials

   Plain node. src/shared/credential-schema.ts imports nothing at all and
   src/main/credential-store.ts takes its crypto and its file path as injected
   dependencies, so the whole store — including the refusal path that must
   never write plaintext — is driven here against fakes, with no Electron and
   no OS keychain anywhere in earshot. This is the same trade layout-store.ts
   makes with `filePath`/`schedule` and review-engine.ts makes with GitRunner. */
'use strict'
const { execFileSync } = require('node:child_process')
const { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const OUT = join(__dirname, '..', 'out', 'verify', 'credentials.cjs')
execFileSync('npx', ['esbuild', join(__dirname, 'credentials-entry.cjs'),
  '--bundle', '--platform=node', '--outfile=' + OUT,
  '--alias:@shared=' + join(__dirname, '..', 'src', 'shared')],
  { stdio: 'inherit' })

const mod = require(OUT)

const results = []
const ok = (label, pass, detail) => {
  results.push({ label, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`)
}

// Everything from here through the summary and the rmSync runs inside one
// async IIFE — checks 11–14 need `await`, and wrapping only the new block
// would let the synchronous summary/exit run BEFORE they report, printing a
// stale "11/11 passed" and exiting 0 while checks 11–14 never ran at all.
void (async () => {

// 1. One declared service, and it is github. SERVICES is what lets set()
// reject an id the schema never declared, and what the palette builds its
// rows from — the same three payoffs SETTINGS already buys in
// settings-schema.ts. A free-form key would make a typo a permanent, silent
// second credential nobody can see.
ok('1 SERVICES declares github with a label and help text', (() => {
  const s = mod.findService('github')
  return !!s && s.id === 'github' && !!s.label && !!s.help
})())

// 2. An id the schema does not declare is not found. This is the check
// set()'s rejection rests on.
ok('2 an undeclared service id is not found', mod.findService('gitlab') === undefined)

// A fake crypto. Reversible and obviously not encryption — the point is that
// the store CALLS it, not that this suite tests cryptography.
const fakeCrypto = (available = true) => ({
  available: () => available,
  encrypt: (s) => Buffer.from('enc:' + s, 'utf8'),
  decrypt: (b) => b.toString('utf8').replace(/^enc:/, '')
})

const dir = mkdtempSync(join(tmpdir(), 'tc credentials '))
const filePath = join(dir, 'credentials.json')
const TOKEN = 'ghp_supersecrettokenvalue123456'

// 3. Round trip: a set is listed back as metadata.
{
  const store = mod.createCredentialStore({ filePath, crypto: fakeCrypto() })
  const res = store.set('github', TOKEN)
  const list = store.list()
  ok('3 a stored credential is listed back as metadata',
    res.ok === true && list.length === 1 && list[0].service === 'github' && !!list[0].addedAt)
}

// 4. THE CHECK RULE 1 RESTS ON. list() must not carry the ciphertext, asserted
// on the object's own KEYS rather than on a value — a spread that carried
// `cipher` through would satisfy any assertion phrased about the token itself,
// since the token is encrypted and would not match anyway.
{
  const store = mod.createCredentialStore({ filePath, crypto: fakeCrypto() })
  const keys = Object.keys(store.list()[0])
  ok('4 list() exposes no cipher and no token key',
    !keys.includes('cipher') && !keys.includes('token'), keys.join(','))
}

// 5. The plaintext is genuinely on disk only in encrypted form.
{
  const raw = readFileSync(filePath, 'utf8')
  ok('5 the raw file does not contain the plaintext token', !raw.includes(TOKEN))
}

// 6. REFUSES, NEVER FALLS BACK. With the keychain unavailable, set() fails and
// writes NOTHING. A plaintext fallback is indistinguishable from success at
// every surface — the credential lists, the label appears — so the user learns
// their token was in the clear from somebody else.
{
  const p2 = join(dir, 'unavailable.json')
  const store = mod.createCredentialStore({ filePath: p2, crypto: fakeCrypto(false) })
  const res = store.set('github', TOKEN)
  ok('6 unavailable crypto refuses and writes no file',
    res.ok === false && !existsSync(p2), res.ok === false ? res.reason : 'stored anyway')
}

// 7. The refusal must not quote the token back. A reason string interpolating
// the plaintext puts it in a log, which is the one place #31 says a secret
// must never reach. Checked on BOTH the refusal above and a warning.
{
  const p3 = join(dir, 'noleak.json')
  const warnings = []
  const store = mod.createCredentialStore({
    filePath: p3, crypto: fakeCrypto(false), onWarning: (m) => warnings.push(m)
  })
  const res = store.set('github', TOKEN)
  const leaked = (res.ok === false && res.reason.includes(TOKEN)) ||
    warnings.some((w) => w.includes(TOKEN))
  ok('7 no refusal reason or warning contains the token', !leaked)
}

// 7b. An encrypt that THROWS while holding the plaintext must become a
// scrubbed refusal, not a propagating exception. This is the only way to
// reach the encrypt call at all — 6/7 use available()===false, which
// short-circuits before encrypt is ever called, so this path was previously
// completely untested.
{
  const p3b = join(dir, 'noleak2.json')
  const warnings = []
  const throwingCrypto = {
    available: () => true,
    encrypt: () => { throw new Error('keychain died holding ' + TOKEN) },
    decrypt: (b) => b.toString('utf8')
  }
  let threw = false
  let res
  try {
    const store = mod.createCredentialStore({
      filePath: p3b, crypto: throwingCrypto, onWarning: (m) => warnings.push(m)
    })
    res = store.set('github', TOKEN)
  } catch {
    threw = true
  }
  const leaked = threw || !res || res.ok !== false ||
    (res.reason && res.reason.includes(TOKEN)) ||
    warnings.some((w) => w.includes(TOKEN))
  ok('7b an encrypt that throws is a refusal, and the thrown message never reaches the reason',
    !threw && res && res.ok === false && !existsSync(p3b) && !leaked)
}

// 8. An undeclared service is rejected rather than stored — Task 1 check 2's
// fact, reached through the write path.
{
  const p4 = join(dir, 'unknown.json')
  const store = mod.createCredentialStore({ filePath: p4, crypto: fakeCrypto() })
  const res = store.set('gitlab', TOKEN)
  ok('8 an undeclared service id is refused', res.ok === false && store.list().length === 0)
}

// 9. A malformed file warns and resolves to EMPTY rather than throwing — the
// absent-vs-malformed line parseLayout already draws everywhere else. Throwing
// here would take the whole app's startup down for one bad file.
{
  const p5 = join(dir, 'malformed.json')
  writeFileSync(p5, '{ not json at all', 'utf8')
  const warnings = []
  const store = mod.createCredentialStore({
    filePath: p5, crypto: fakeCrypto(), onWarning: (m) => warnings.push(m)
  })
  ok('9 a malformed file warns and reads as empty',
    store.list().length === 0 && warnings.length === 1)
}

// 10. Delete REMOVES the entry rather than blanking it. Writing cipher:"" would
// leave the previous ciphertext in whatever backup or editor history touched
// the file.
//
// PRE-FLIGHT RULING: the store's flush() unlinks the file when the last entry
// is removed — an empty credentials.json implies a credential that is not
// there — so a bare readFileSync after the delete throws ENOENT and aborts the
// whole suite, taking every check after this one down with it silently. Guard
// the read instead of asserting the file still exists.
{
  const store = mod.createCredentialStore({ filePath, crypto: fakeCrypto() })
  const gone = store.delete('github')
  const reread = mod.createCredentialStore({ filePath, crypto: fakeCrypto() })
  const raw = existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
  ok('10 delete removes the entry entirely',
    gone === true && reread.list().length === 0 && !raw.includes('cipher'))
}

// 11. The happy path: the login GitHub reports becomes the stored label, and
// the token is never returned. The fetcher is fake — the real request is
// checked by hand, and the spec says so.
{
  const p = join(dir, 'verify.json')
  const store = mod.createCredentialStore({ filePath: p, crypto: fakeCrypto() })
  store.set('github', TOKEN)
  let sawToken = null
  const fetcher = async (_url, token) => {
    sawToken = token
    return { status: 200, body: JSON.stringify({ login: 'octocat', email: 'o@example.com' }) }
  }
  const res = await mod.verifyCredential({ store, fetcher }, 'github')
  const keys = res.ok ? Object.keys(res.meta) : []
  ok('11 a successful verify stores the login as the label and returns no token',
    res.ok === true && res.meta.label === 'octocat' && !!res.meta.verifiedAt &&
    !keys.includes('token') && !keys.includes('cipher') && sawToken === TOKEN)
}

// 12. Only `login` is read out. GET /user returns email and profile data this
// app has no use for; storing the body wholesale would put personal data in a
// file whose stated purpose is one token.
{
  const p = join(dir, 'verify2.json')
  const store = mod.createCredentialStore({ filePath: p, crypto: fakeCrypto() })
  store.set('github', TOKEN)
  const fetcher = async () => ({
    status: 200, body: JSON.stringify({ login: 'octocat', email: 'o@example.com' })
  })
  await mod.verifyCredential({ store, fetcher }, 'github')
  ok('12 the verify response is not stored wholesale',
    !readFileSync(p, 'utf8').includes('o@example.com'))
}

// 13. A 401 is a REFUSAL with a stated reason, not a throw and not a silent
// failure. A revoked token is the ordinary case here, not an exotic one.
{
  const p = join(dir, 'verify3.json')
  const store = mod.createCredentialStore({ filePath: p, crypto: fakeCrypto() })
  store.set('github', TOKEN)
  const fetcher = async () => ({ status: 401, body: '{"message":"Bad credentials"}' })
  const res = await mod.verifyCredential({ store, fetcher }, 'github')
  ok('13 a rejected token reports why and does not throw',
    res.ok === false && res.reason.length > 0 && !res.reason.includes(TOKEN))
}

// 14. Verifying a service with nothing stored is a refusal, not a request.
// Without this the app issues an outbound call carrying `undefined`.
{
  const p = join(dir, 'verify4.json')
  const store = mod.createCredentialStore({ filePath: p, crypto: fakeCrypto() })
  let called = false
  const fetcher = async () => { called = true; return { status: 200, body: '{}' } }
  const res = await mod.verifyCredential({ store, fetcher }, 'github')
  ok('14 verifying an absent credential makes no request', res.ok === false && called === false)
}

// M87 — broker.1. THE BROKER over a fake fetcher, in the plain-node tier the
//      store already sits in. Six properties, each a silent failure:
//      (a) The token is ATTACHED to the request and appears NOWHERE else —
//          not in the reply, not in the audit row, not in a refusal's text.
//      (b) A service with no credential answers the NAMED reason the panel
//          rows use, never an empty 401 the agent would retry forever.
//      (c) `..`, a scheme and `//` in the path never reach the fetcher; an
//          unknown method and an unknown service are refused by name.
//      (d) Every call — a refusal included — appends one audit row carrying
//          metadata only: an agent's ATTEMPT is what the audit is for.
//      (e) A response over the cap is truncated and SAYS so.
//      (f) Jira attaches basic auth for email:token at the credential's own
//          site, under /rest/api/3 — the same one-way door as GitHub's bearer.
{
  const p = join(dir, 'broker.json')
  const store = mod.createCredentialStore({ filePath: p, crypto: fakeCrypto() })
  store.set('github', TOKEN)
  store.set('jira', JSON.stringify({ site: 'https://acme.atlassian.net', email: 'me@acme.test', token: 'jira-secret-token' }))
  const seen = []
  const rows = []
  const big = 'x'.repeat(2 * 1024 * 1024)
  const fetcher = async (req) => { seen.push(req); return req.url.endsWith('/big') ? { status: 200, body: big } : { status: 200, body: JSON.stringify({ login: 'octocat' }) } }
  const broker = typeof mod.createBroker === 'function'
    ? mod.createBroker({ store, fetcher, audit: { append: (row) => rows.push(row) }, now: () => 1234 })
    : null
  const call = async (req) => (broker ? broker.call(req) : { ok: false, reason: 'no broker' })
  const user = await call({ service: 'github', method: 'GET', path: '/user', panelId: 'n1' })
  const jira = await call({ service: 'jira', method: 'GET', path: '/search?jql=x' })
  const none = await call({ service: 'github', method: 'GET', path: '/user' }).then(async (first) => { store.delete('github'); const r = await call({ service: 'github', method: 'GET', path: '/user' }); store.set('github', TOKEN); return r })
  const dots = await call({ service: 'github', method: 'GET', path: '/repos/../secrets' })
  const scheme = await call({ service: 'github', method: 'GET', path: 'https://evil.test/' })
  const slashes = await call({ service: 'github', method: 'GET', path: '//evil.test/x' })
  const method = await call({ service: 'github', method: 'TRACE', path: '/user' })
  const unknown = await call({ service: 'gitlab', method: 'GET', path: '/user' })
  const bigReply = await call({ service: 'github', method: 'GET', path: '/big' })
  // M87's verifier: the escapes and leaks a green first version had.
  const encodedDots = await call({ service: 'jira', method: 'GET', path: '/%2e%2e/%2e%2e/%2e%2e/rest/api/2/myself' })
  const upperDots = await call({ service: 'github', method: 'GET', path: '/repos/%2E%2E/x' })
  const longPath = await call({ service: 'github', method: 'GET', path: '/' + 'a'.repeat(3000) })
  const colonOk = await call({ service: 'github', method: 'GET', path: '/search/issues?q=repo:o/r' })
  const seenBefore = seen.length
  const throwing = typeof mod.createBroker === 'function'
    ? mod.createBroker({ store, fetcher: async (req) => { throw new Error(req.url.includes('github') ? `boom ${TOKEN} and again ${TOKEN}` : `boom basic ${Buffer.from('me@acme.test:jira-secret-token').toString('base64')} raw jira-secret-token`) }, audit: { append: (row) => rows.push(row) }, now: () => 1 })
    : null
  const thrown = throwing ? await throwing.call({ service: 'github', method: 'GET', path: '/user' }) : null
  const thrownJira = throwing ? await throwing.call({ service: 'jira', method: 'GET', path: '/myself' }) : null
  // The in-flight ceiling: a fetcher that never answers, nine calls at once.
  let release = () => {}
  const hanging = typeof mod.createBroker === 'function'
    ? mod.createBroker({ store, fetcher: () => new Promise((resolve) => { release = () => resolve({ status: 200, body: '{}' }) }), audit: { append: () => {} }, now: () => 1 })
    : null
  const inFlight = hanging ? Array.from({ length: mod.BROKER_IN_FLIGHT_MAX + 1 }, () => hanging.call({ service: 'github', method: 'GET', path: '/user' })) : []
  const ceiling = hanging ? await Promise.race([inFlight[inFlight.length - 1], new Promise((r) => setTimeout(() => r('hung'), 200))]) : null
  release()
  // The audit's ring trim, through the real writer with a small cap.
  const auditFile = join(dir, 'audit', 'broker-audit.jsonl')
  const audit = typeof mod.createBrokerAudit === 'function' ? mod.createBrokerAudit({ file: auditFile, max: 50 }) : null
  if (audit) for (let i = 0; i < 260; i += 1) audit.append({ at: i, service: 's', method: 'GET', path: '/p', status: 0, bytes: 0 })
  const auditLines = audit ? readFileSync(auditFile, 'utf8').split('\n').filter((l) => l !== '').length : -1
  const auditNewest = audit ? audit.list(1).rows[0] : null
  // The Jira site as the URL parser reads it.
  const evilSite = typeof mod.parseJiraCredential === 'function' ? mod.parseJiraCredential(JSON.stringify({ site: 'https://evil.test#x.atlassian.net', email: 'a@b.c', token: 't' })) : 'absent'
  const goodSite = typeof mod.parseJiraCredential === 'function' ? mod.parseJiraCredential(JSON.stringify({ site: 'https://acme.atlassian.net', email: 'a@b.c', token: 't' })) : 'absent'
  const everything = JSON.stringify({ user, jira, none, dots, scheme, slashes, method, unknown, rows, big: bigReply && bigReply.ok, encodedDots, upperDots, longPath, thrown, thrownJira })
  const ghReq = seen.find((r) => r.url === 'https://api.github.com/user')
  const jiraReq = seen.find((r) => r.url.startsWith('https://acme.atlassian.net/rest/api/3/search'))
  ok('broker.1 the token is attached to the request and appears nowhere in a reply, an audit row or a refusal; no credential answers the named reason; .. a scheme // an unknown method and an unknown service are refused before the fetcher; every call and every refusal is one audit row of metadata; an over-cap reply is truncated and says so; jira uses basic auth at its own site',
    broker !== null &&
      user && user.ok === true && user.status === 200 && ghReq && ghReq.headers.authorization === `Bearer ${TOKEN}` &&
      jira && jira.ok === true && jiraReq && /^Basic /.test(jiraReq.headers.authorization) && Buffer.from(jiraReq.headers.authorization.slice(6), 'base64').toString() === 'me@acme.test:jira-secret-token' &&
      none && none.ok === false && /not connected/.test(none.reason) && /Credentials/.test(none.reason) &&
      dots.ok === false && scheme.ok === false && slashes.ok === false && method.ok === false && unknown.ok === false &&
      seen.length === 5 &&
      !everything.includes(TOKEN) && !everything.includes('jira-secret-token') &&
      rows.length === 16 && rows.every((r) => (r.at === 1234 || r.at === 1) && typeof r.service === 'string' && typeof r.method === 'string' && typeof r.path === 'string' && typeof r.status === 'number' && !('body' in r)) &&
      rows[0].panelId === 'n1' && rows.some((r) => r.status === 0 && typeof r.reason === 'string') &&
      bigReply && bigReply.ok === true && bigReply.truncated === true && bigReply.body.length <= mod.BROKER_BODY_MAX &&
      encodedDots.ok === false && /encoded dots/.test(encodedDots.reason) && upperDots.ok === false && longPath.ok === false && /characters/.test(longPath.reason) &&
      colonOk.ok === true && seen.length === seenBefore &&
      thrown && thrown.ok === false && /\[redacted\]/.test(thrown.reason) && thrownJira && thrownJira.ok === false && !/jira-secret-token/.test(thrownJira.reason) && !/bWVAYWNtZS50ZXN0/.test(thrownJira.reason) &&
      ceiling && ceiling.ok === false && /in flight/.test(ceiling.reason) &&
      auditLines > 0 && auditLines <= 150 && auditNewest && auditNewest.at === 259 &&
      evilSite === null && goodSite !== null && goodSite.site === 'https://acme.atlassian.net' &&
      // The audit records the path as the WIRE sees it, prefix included.
      rows.some((r) => r.path === '/rest/api/3/search?jql=x'),
    JSON.stringify({ encodedDots, upperDots, longPath: longPath && longPath.reason, thrown, thrownJira, colonOk: colonOk.ok, seenGrew: seen.length - seenBefore, ceiling, auditLines, auditNewest, evilSite: evilSite === null, goodSite: goodSite && goodSite.site, paths: rows.map((r) => r.path).slice(0, 6), leak: everything.includes(TOKEN) || everything.includes("jira-secret-token"), rows: rows.length, seen: seen.length }))
}

// M89 — rejected.1. THE DURABLE REJECTION MARK. `credential:verify` records
//      a 401/403 as `rejectedAt` and a success CLEARS it: the Integrations
//      page says what the last verify said, not what the user remembers.
//      ABSENT stays absent — a spread that wrote `rejectedAt: undefined`
//      would read as present at every `'rejectedAt' in meta` site — and the
//      mark never carries the token or the response.
{
  const p = join(dir, 'rejected.json')
  const store = mod.createCredentialStore({ filePath: p, crypto: fakeCrypto() })
  store.set('github', TOKEN)
  const before = store.list()[0]
  const rejectedVerify = typeof mod.verifyCredential === 'function'
    ? await mod.verifyCredential({ store, fetcher: async () => ({ status: 401, body: '{"message":"Bad credentials"}' }) }, 'github')
    : null
  const afterReject = store.list()[0]
  const okVerify = typeof mod.verifyCredential === 'function'
    ? await mod.verifyCredential({ store, fetcher: async () => ({ status: 200, body: JSON.stringify({ login: 'octocat' }) }) }, 'github')
    : null
  const afterOk = store.list()[0]
  const reread = mod.createCredentialStore({ filePath: p, crypto: fakeCrypto() }).list()[0]
  // M89's verifier: a 403 is NOT a rejection (a rate limit, an SSO org); a
  // 401 seen by the BROKER marks too, from the one place every call passes;
  // and the audit's read projects fields, so an extra key on a line never
  // crosses the bridge.
  const forbidden = typeof mod.verifyCredential === 'function'
    ? await mod.verifyCredential({ store, fetcher: async () => ({ status: 403, body: '{"message":"rate limited"}' }) }, 'github')
    : null
  const after403 = store.list()[0]
  const seeing401 = typeof mod.createBroker === 'function'
    ? mod.createBroker({ store, fetcher: async () => ({ status: 401, body: '{}' }), audit: { append: () => {} }, now: () => 1 })
    : null
  if (seeing401) await seeing401.call({ service: 'github', method: 'GET', path: '/user' })
  const afterBroker401 = store.list()[0]
  const auditFile2 = join(dir, 'audit2', 'broker-audit.jsonl')
  const audit2 = typeof mod.createBrokerAudit === 'function' ? mod.createBrokerAudit({ file: auditFile2 }) : null
  if (audit2) {
    require('node:fs').mkdirSync(join(dir, 'audit2'), { recursive: true })
    require('node:fs').appendFileSync(auditFile2, JSON.stringify({ at: 1, service: 'github', method: 'GET', path: '/x', status: 200, bytes: 1, token: 'leaked', extra: { deep: true } }) + '\n')
  }
  const projected = audit2 ? audit2.list(10).rows[0] : null
  const filtered = audit2 ? audit2.list(10, 'jira').rows.length : -1
  ok('rejected.1 a 401 verify records rejectedAt (and nothing else), a success clears it, absent stays absent, the mark survives a re-read, a 403 marks nothing, a 401 seen by the broker marks, and the audit read projects fields and filters by service',
    before && !('rejectedAt' in before) &&
      rejectedVerify && rejectedVerify.ok === false &&
      afterReject && typeof afterReject.rejectedAt === 'string' && !JSON.stringify(afterReject).includes(TOKEN) &&
      okVerify && okVerify.ok === true && afterOk && !('rejectedAt' in afterOk) && afterOk.label === 'octocat' &&
      reread && !('rejectedAt' in reread) &&
      forbidden && forbidden.ok === false && after403 && !('rejectedAt' in after403) &&
      afterBroker401 && typeof afterBroker401.rejectedAt === 'string' &&
      projected && !('token' in projected) && !('extra' in projected) && projected.path === '/x' && filtered === 0,
    JSON.stringify({ before, afterReject, afterOk, reread, after403, afterBroker401, projected, filtered }))
}

rmSync(dir, { recursive: true, force: true })


// M102 — scope.1. SERVICE SCOPE PER TEAMMATE, and the spend card. A teammate
// without the grant is refused by CODE before the store is read (the three
// readers stay three, and no token is behind the audit row); a granted GET
// runs uninterrupted; a granted POST asks first with service, account,
// action, target and cost, and a `false` is refused by code, never performed;
// the audit row carries the teammate; a request with no teammate is
// exactly the pre-M102 broker.
{
  // Its own directory: the suite's shared one is cleaned by an earlier check.
  const scopeDir = require('node:fs').mkdtempSync(join(require('node:os').tmpdir(), 'tc scope '))
  const p = join(scopeDir, 'scope.json')
  const store = mod.createCredentialStore({ filePath: p, crypto: fakeCrypto() })
  store.set('github', TOKEN)
  const reads = []
  const readOnce = store.read.bind(store)
  const countingStore = { read: (svc) => { reads.push(svc); return readOnce(svc) }, markRejected: () => {} }
  const seen = [], rows = [], asked = []
  let answer = true
  const has = typeof mod.createBroker === 'function' && typeof mod.READ_ONLY_METHODS === 'object'
  const broker = has ? mod.createBroker({
    store: countingStore, fetcher: async (req) => { seen.push(req); return { status: 200, body: '{}' } }, audit: { append: (r) => rows.push(r) }, now: () => 7,
    services: (id) => (id === 'ada' ? ['github'] : id === 'bo' ? [] : undefined),
    account: () => 'octocat',
    approve: async (ask) => { asked.push(ask); return answer }
  }) : null
  const call = async (req) => (broker ? broker.call(req) : { ok: false, reason: 'no broker' })
  const ungranted = await call({ service: 'github', method: 'GET', path: '/user', teammateId: 'bo' })
  const readsAfterUngranted = reads.length
  const unknown = await call({ service: 'github', method: 'GET', path: '/user', teammateId: 'zed' })
  const get = await call({ service: 'github', method: 'GET', path: '/user', teammateId: 'ada', panelId: 'c1' })
  const askedAfterGet = asked.length
  const post = await call({ service: 'github', method: 'POST', path: '/repos/o/r/issues', body: '{}', teammateId: 'ada', cost: '1 issue' })
  const askedAfterPost = asked.length
  answer = false
  const seenBeforeDenied = seen.length
  const denied = await call({ service: 'github', method: 'DELETE', path: '/repos/o/r/issues/1', teammateId: 'ada' })
  const seenBeforePlain = seen.length
  const plain = await call({ service: 'github', method: 'POST', path: '/repos/o/r/issues', body: '{}' })
  ok('scope.1 an ungranted teammate is refused by code not-granted BEFORE the store is read; an unknown teammate likewise; a granted GET runs with no question; a granted POST asks with service, account, action, target and cost and runs on true; a false is refused by code not-answered and never fetched; every row names the teammate; no teammate is the old broker',
    has && ungranted.ok === false && ungranted.code === mod.NOT_GRANTED_CODE && /grant github/.test(ungranted.reason) && readsAfterUngranted === 0 &&
      unknown.ok === false && unknown.code === mod.NOT_GRANTED_CODE &&
      get.ok === true && askedAfterGet === 0 &&
      post.ok === true && askedAfterPost === 1 && asked[0].service === 'github' && asked[0].account === 'octocat' && asked[0].method === 'POST' && asked[0].path === '/repos/o/r/issues' && asked[0].cost === '1 issue' && asked[0].teammateId === 'ada' &&
      denied.ok === false && denied.code === mod.NOT_ANSWERED_CODE && seenBeforePlain === seenBeforeDenied && !seen.some((r) => r.method === 'DELETE') &&
      plain.ok === true && seen.length === seenBeforePlain + 1 &&
      rows.filter((r) => r.teammateId === 'ada').length === 3 && rows.filter((r) => r.teammateId === 'bo').length === 1 && !rows.some((r) => JSON.stringify(r).includes(TOKEN)),
    JSON.stringify({ has, ungranted, unknown, get: get.ok, post: post.ok, asked, denied, plain: plain.ok, rows: rows.map((r) => [r.method, r.teammateId, r.status]) }))
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)

})()
