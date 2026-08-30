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

rmSync(dir, { recursive: true, force: true })

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
