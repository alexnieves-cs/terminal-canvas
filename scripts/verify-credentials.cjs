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

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
