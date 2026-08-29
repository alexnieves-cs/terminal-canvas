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

// 7. .claude/settings.json was tracked until this check existed, carrying the
// author's absolute home path (/Users/<name>/.claude/plugins/cache/...) and
// nine ad-hoc permission grants from development sessions — including perl
// one-liners that rewrite Palette.tsx in place. It is local tool
// configuration, not source: it means nothing to a contributor, and the home
// path is personal information a public repository has no reason to carry.
// Asserted against `git ls-files` rather than the filesystem, because the file
// SHOULD still exist locally; what must not happen is it being tracked again.
{
  const { execFileSync } = require('node:child_process')
  let tracked = ''
  try {
    tracked = execFileSync('git', ['ls-files', '.claude/'], { cwd: ROOT, encoding: 'utf8' })
  } catch {
    // Not a git checkout (a downloaded tarball). Nothing to assert.
    tracked = ''
  }
  ok('7 no .claude/ file is tracked', tracked.trim() === '', tracked.trim() || 'none')
}

// 8–13. The README's STRUCTURE, asserted as a set of required headings.
//
// The failure this guards is not a typo — it is drift. Every milestone in this
// repository has added a feature and left the README's visitor-facing half
// alone, because the author already knows what the app does and the file that
// gets updated is the one that hurts when it is wrong. Nothing hurts when a
// README is missing a features list, so nothing ever fixed it. A check is the
// only thing that makes an absent section as loud as a failing build.
const README = read('README.md') ?? ''
const REQUIRED_HEADINGS = [
  '## What it does',
  '## Install',
  '## Keyboard',
  '## Verification',
  '## Contributing',
  '## License'
]
// Headings are matched against the README with fenced code blocks REMOVED.
// `includes('\n## X\n')` on the raw file is satisfied by the heading string
// sitting inside a ``` example or a table cell, so a future edit could delete
// a real section, leave its name in a code sample, and keep this suite green —
// the exact drift this file exists to make loud. README itself must stay RAW:
// check 14 asserts the IPC channels appear, and those live inside the
// architecture fence.
const README_PROSE = README.replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, '')
for (const [i, heading] of REQUIRED_HEADINGS.entries()) {
  ok(`${8 + i} README has "${heading}"`, README_PROSE.includes('\n' + heading + '\n'))
}

// 14. The README's architecture diagram versus the ACTUAL contract.
//
// This is the check that pays for the suite. Every milestone since M7 has added
// channels and left the diagram alone, so it documented ~20 of 43 by the time
// anyone looked. A stale architecture diagram is worse than an absent one: it
// is the first technical claim a reader checks, and it fails by omission, which
// nothing else in this repository can see. Parsed out of ipc-contract.ts rather
// than restated here, so this check cannot itself go stale.
//
// Scoped to the architecture diagram's OWN fenced block, not the whole README.
// `README.includes(c)` would pass if a channel name appeared anywhere in the
// file — `pty:create`, for instance, also appears in ordinary prose — so a
// future edit could drop a channel from the diagram, mention it in a
// paragraph, and this check would stay green: the exact failure it advertises
// catching. All 43 channels (both invoke direction and event directions) live
// in the single fence containing `--invoke-->` as of this writing. If a future
// editor ever splits the diagram across two fences, this check FAILS loudly —
// the fix then is to widen the selector to find every relevant fence, never to
// fall back to matching the whole README: a false FAILURE gets noticed and
// fixed, a false PASS never does, and that asymmetry is why this stays scoped
// tightly rather than generously.
const CONTRACT = read('src/shared/ipc-contract.ts') ?? ''
const channels = [...CONTRACT.matchAll(/^\s+[A-Z_]+: '([a-z]+:[a-z-]+)'/gm)].map((m) => m[1])
const fences = README.match(/^```[\s\S]*?^```/gm) ?? []
const DIAGRAM = fences.find((f) => f.includes('--invoke-->')) ?? ''
{
  const missing = channels.filter((c) => !DIAGRAM.includes(c))
  ok('14 every IPC channel appears in the README',
    channels.length > 20 && missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${channels.length} channels`)
}

// 15. Non-vacuity guard for 14. If the regex above ever stops matching — a
// reformat of ipc-contract.ts, a rename, a prettier pass that moves the quotes
// — `channels` becomes an empty array and check 14 passes triumphantly while
// asserting nothing at all. This is the same shape as the `othersAreReal`
// clause in verify:panels 83: prove the input was real before trusting the
// conclusion drawn from it.
//
// The two named-channel clauses catch a TOTAL regex failure (an empty array)
// but not a PARTIAL one: a future channel whose name contains a digit or a
// camelCase segment could silently fall out of `channels` while `pty:create`
// and `review:panel` still match, and check 14 would then assert presence
// only for the channels it happened to find — passing while the README is
// genuinely incomplete for the one it missed. `declared` counts channel
// declarations with a LOOSER, independent regex (any quoted value after an
// `A-Z_` key, not just the channel-shaped `[a-z]+:[a-z-]+` pattern), so a
// declaration the channel-shaped regex could not read still gets counted here
// — and the two counts disagreeing is what catches a partial miss the two
// named clauses cannot see.
{
  const declared = [...CONTRACT.matchAll(/^\s+[A-Z_]+: '[^']*'/gm)].length
  ok('15 the contract parse found the channels it should',
    channels.includes('pty:create') && channels.includes('review:panel') && channels.length === declared,
    `${channels.length} parsed, ${declared} declared`)
}

// 16. CI exists, and the README says so.
//
// Both halves matter and neither implies the other. A workflow nobody can see
// is a workflow nobody trusts — the badge IS the deliverable for a reader — and
// a badge with no workflow behind it is a broken image making a false claim.
//
// The /npm run verify/ test runs against COMMENT-STRIPPED text, the same
// shape README_PROSE already uses: the workflow's own explanatory comments
// mention "npm run verify" too, so testing the raw file cannot tell a real
// `run:` step apart from a comment describing one that used to exist. Strip
// lines rather than parse YAML — a `#` inside a quoted string would drop that
// line too, but the failure direction is safe: it fails loudly instead of
// passing on a step that isn't really there.
{
  const workflow = read('.github/workflows/verify.yml')
  const workflowCode = (workflow ?? '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n')
  const badged = README.includes('workflows/verify.yml/badge.svg')
  ok('16 CI runs verify, and the README carries its badge',
    workflow !== null && /npm run verify/.test(workflowCode) && badged,
    `workflow=${workflow !== null} badge=${badged}`)
}

// 17. CONTRIBUTING exists and names the one thing a contributor must do.
// A CONTRIBUTING that does not name the verification command is decoration:
// this repository has no test runner and no linter, so a newcomer has no way
// to guess that `npm run verify` is the entire gate.
{
  const text = read('CONTRIBUTING.md') ?? ''
  ok('17 CONTRIBUTING names the verify command',
    text.includes('npm run verify'), text ? `${text.length} bytes` : 'absent')
}

// 18. SECURITY exists and is honest about what this app IS. Terminal Canvas
// spawns arbitrary local commands with the user's own login environment —
// that is the product, not a vulnerability — and a security policy that does
// not say so invites reports about the feature while burying real ones.
{
  const text = read('SECURITY.md') ?? ''
  ok('18 SECURITY exists and states the threat posture',
    text.length > 300 && /arbitrary/i.test(text), text ? `${text.length} bytes` : 'absent')
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
