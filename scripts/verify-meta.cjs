/* Verifies the repository's RELEASE HYGIENE as values read off disk.
   Run with: npm run verify:meta

   Plain node, import-free beyond built-ins, no esbuild entry, no electron, no
   build — the same tier as verify:package, and first in the chain because it
   is the cheapest thing here that can be wrong.

   Everything this suite guards fails SILENTLY and LATE. A missing LICENSE does
   not break a build; it makes the work legally unusable, and the only symptom
   is a GitHub sidebar nobody on this side of the repository ever reads. A
   README that has drifted from the IPC contract does not fail a typecheck; it
   misleads the first engineer who trusts it. Prose has no compiler, so these
   are the compiler. */
'use strict'
const { readFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
const read = (rel) => {
  const p = join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const pkg = JSON.parse(read('package.json'))

// 1. THE ONE THAT MATTERS MOST. package.json has declared "license": "MIT"
// since the first commit, with no LICENSE file anywhere in the tree. A license
// FIELD is metadata; a license FILE is the grant. Without the file GitHub
// reports no license, and "no license" means all rights reserved — a public
// repository nobody may legally copy, build on, or contribute to.
{
  const text = read('LICENSE')
  ok('1 a LICENSE file exists and is not empty', text !== null && text.trim().length > 200,
    text === null ? 'absent' : `${text.length} bytes`)
}

// 2. The file and the field must AGREE. Two declarations of one fact drift the
// first time one of them is wrong, and a package.json saying MIT beside an
// Apache LICENSE is a question no downstream user can answer for themselves.
{
  const text = read('LICENSE') ?? ''
  ok('2 the LICENSE text matches the declared license',
    pkg.license === 'MIT' && /MIT License/i.test(text), `field=${pkg.license}`)
}

// 3. A licence with no copyright holder grants nothing to anyone. The year and
// the name are the operative clause, not the boilerplate around them.
{
  const text = read('LICENSE') ?? ''
  ok('3 the LICENSE names a holder and a year',
    /Alex Nieves/.test(text) && /20\d\d/.test(text))
}

// 4. The README says Node 20+ and nothing enforces it. node-pty is compiled
// natively against the local ABI at postinstall, so an unsupported Node does
// not fail with a version message — it fails inside node-gyp, several hundred
// lines deep, and reads as a broken repository rather than a wrong toolchain.
{
  const engines = pkg.engines ?? {}
  ok('4 package.json declares a Node engine floor',
    typeof engines.node === 'string' && /\d\d/.test(engines.node), JSON.stringify(engines))
}

// 5. `repository` is what makes `npm ls`, security advisories and every
// third-party mirror able to point back here. Absent, a published artifact is
// an orphan with no route home.
{
  const r = pkg.repository
  const url = typeof r === 'string' ? r : (r && r.url) || ''
  ok('5 package.json points at the repository',
    /github\.com[/:]alexnieves-cs\/terminal-canvas/.test(url), url || 'absent')
}

// 6. `private: true` stays. It is NOT a statement about the licence and must
// not be removed as though it were one: it is npm's guard against `npm
// publish`, and this is a desktop application that must never be published as
// a package. Asserted so a future reader does not "fix" it on the way past.
{
  ok('6 private stays true — an app, never an npm package', pkg.private === true)
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
