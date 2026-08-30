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

// Strips `/* ... */` block comments (including doc comments, multiline) and
// `//` line comments out of TypeScript source, so a check can search CODE
// without matching a comment that mentions the same string. Checks 20 and 21
// below exist precisely because the real tree carries the string
// `credential:get`, the identifier fragment `.read(`, and the word `cipher`
// each exactly once — and all three occurrences are prose explaining why the
// thing they name must NOT appear in code. A bare substring search over the
// raw file would fail against the correct, current tree; stripping comments
// first is what lets the check match CODE syntax instead of English sentences
// that happen to contain the same characters.
//
// ONE alternation, not two chained `.replace()` calls, and the single pass is
// load-bearing rather than a style choice. A first cut ran block-stripping
// before line-stripping, on the reasoning that `/* // not a line comment */`
// would otherwise leave a dangling `*/` if line-stripping ran first. That
// reasoning is correct as far as it goes and misses the reachable case in the
// OTHER direction: a `/*` sitting inside an ordinary `//` comment (e.g.
// `// TODO: unwrap a /* block`) is invisible to a line-comment pass that
// hasn't run yet, so block-stripping-first opens a FAKE block there and
// consumes forward to the next real `*/` — and ipc.ts and ipc-contract.ts are
// dense with `/** ... */` doc comments, so that swallows a whole handler
// block, including real code, and the check reports a false PASS. A single
// alternated regex scans left to right and picks whichever comment form
// starts first at each position: reaching the `//` first consumes the rest of
// that physical line before any `/*` inside it is ever considered a
// delimiter, so the fake block can never open. Measured:
// `stripComments("// TODO: unwrap a /* block\ncredentialStore.read(x)\n/** next doc */\n")`
// now returns the real call intact, where the two-pass version returned only
// a blank line — the violation had vanished along with everything around it.
// What this does NOT close: a `//` or `/*` inside a STRING or template
// literal is still read as a real comment delimiter, because this is a
// regex stripper, not a tokenizer. None of the files these checks read
// contain such a literal today (verified by grepping for `http` in all of
// them and finding nothing) — recorded as the residual risk rather than
// something believed fixed.
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')

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

// 17. CONTRIBUTING exists and names the one thing a contributor must do, as a
// COMMAND rather than a passing mention. A substring test anywhere in the file
// is satisfied by a sentence that merely talks about verification; requiring
// the phrase to open a line is what tells a newcomer this is something they
// can actually run, not decoration — this repository has no test runner and
// no linter, so a newcomer has no way to guess that `npm run verify` is the
// entire gate.
{
  const contributing = read('CONTRIBUTING.md') ?? ''
  const commandLine = contributing
    .split('\n')
    .some((l) => l.trim().startsWith('npm run verify'))
  ok('17 CONTRIBUTING names the verify command',
    commandLine, contributing ? `${contributing.length} bytes` : 'absent')
}

// 18. SECURITY exists and is honest about what this app IS, AND names where to
// report. Terminal Canvas spawns arbitrary local commands with the user's own
// login environment — that is the product, not a vulnerability — and a
// security policy that does not say so invites reports about the feature
// while burying real ones. Length-plus-keyword alone is a file-exists check
// wearing a disguise: trim the reporting channel out of SECURITY.md later and
// it still passes on size and the word "arbitrary", leaving a reporter with
// nowhere to go and nothing red anywhere. The path fragment, not the whole
// URL, is what is asserted — a future move between `/new` and the advisories
// index should not fail this check for a reason that has nothing to do with
// whether a channel is named at all.
{
  const text = read('SECURITY.md') ?? ''
  ok('18 SECURITY exists and states the threat posture',
    text.length > 300 && /arbitrary/i.test(text) && /security\/advisories/.test(text),
    text ? `${text.length} bytes` : 'absent')
}

// 19. Every verify suite is WIRED INTO the chain. package.json's `verify`
// script is an enumerated list, which is the shape .github/workflows/verify.yml
// deliberately refuses for exactly this reason: a suite added as a script and
// never added to the chain runs nowhere, silently, forever — and the one
// green-or-not signal this repository has quietly stops covering it, with a
// green badge still on the README. Same stale-by-omission failure check 14
// guards for the IPC diagram, turned on the harness itself.
//
// verify:packaged is excluded deliberately, not overlooked: it rebuilds native
// modules, reaches electron-builder's cache and needs a network, so it is a
// hand-run pre-release gate rather than part of the chain.
{
  const chain = pkg.scripts.verify ?? ''
  const suites = Object.keys(pkg.scripts)
    .filter((k) => k.startsWith('verify:') && k !== 'verify:packaged')
  const unwired = suites.filter((k) => !chain.includes(`npm run ${k}`))
  ok('19 every verify suite is wired into the chain',
    suites.length > 10 && unwired.length === 0,
    unwired.length ? `unwired: ${unwired.join(', ')}` : `${suites.length} suites`)
}

// 20. RULE 1, AS SOURCE TEXT: there is no credential:get channel, and no
// credential channel of ANY name returns a cipher. Neither half has a
// runtime symptom when broken — the app keeps working exactly as before,
// just with a plaintext-returning channel nobody exercises yet, which is why
// this can only be pinned as prose-shaped code rather than as behaviour.
//
// The channel half is an ALLOWLIST, not two literal spellings. An earlier cut
// of this check tested for the string `credential:get` and the identifier
// `CREDENTIAL_GET` alone, which pins the SPELLING rather than the RULE —
// "no channel returns plaintext" — and a sibling added under any other name
// (`CREDENTIAL_REVEAL`, `CREDENTIAL_PEEK`, ...) sailed through unnoticed.
// Every `CREDENTIAL_*` key is parsed out of the `IPC` object (comment-
// stripped first, for the reason `stripComments` exists at all) and the set
// is asserted EXACTLY equal to the four channels this milestone actually
// grants: list, set, delete, verify. A fifth key of ANY name fails this,
// and so does one of the four going missing.
//
// The cipher half is scanned across BOTH `ipc.ts`, where a handler could
// return one directly, AND `credential-schema.ts`, where `CredentialMeta` —
// the shape `CREDENTIAL_LIST` actually returns — is declared; a plaintext or
// cipher field added to the type would never show up in ipc.ts at all, since
// the handler just returns `list()` and never repeats the field names.
{
  const contract = stripComments(read('src/shared/ipc-contract.ts') ?? '')
  const objMatch = contract.match(/export const IPC = \{([\s\S]*?)\n\} as const/)
  const body = objMatch ? objMatch[1] : ''
  const keys = [...body.matchAll(/\bCREDENTIAL_[A-Z_]+\b/g)].map((m) => m[0])
  const ALLOWED = ['CREDENTIAL_LIST', 'CREDENTIAL_SET', 'CREDENTIAL_DELETE', 'CREDENTIAL_VERIFY']
  const unexpected = keys.filter((k) => !ALLOWED.includes(k))
  const missing = ALLOWED.filter((k) => !keys.includes(k))
  const allowlisted = objMatch !== null && unexpected.length === 0 && missing.length === 0

  const ipc = stripComments(read('src/main/ipc.ts') ?? '')
  const schema = stripComments(read('src/shared/credential-schema.ts') ?? '')
  const noCipher = !/cipher/i.test(ipc) && !/cipher/i.test(schema)

  ok('20 the CREDENTIAL_* channel set is exactly {list,set,delete,verify}, and no cipher field exists',
    allowlisted && noCipher,
    `parsed=${objMatch !== null} unexpected=${JSON.stringify(unexpected)} missing=${JSON.stringify(missing)} noCipher=${noCipher}`)
}

// 21. RULE 2, AS SOURCE TEXT: a stored credential must never reach a PTY, so
// the three modules that build a process environment must not import the
// credential store, and no IPC handler may call or alias the store's read() —
// the one function that returns plaintext,
// main-internal, and callable only from credential-verify.ts. Prose alone
// has already lost this kind of invariant in this repo once: CLAUDE.md's
// `dispose` call-site count went stale inside the very commit that recorded
// it. All reads are COMMENT-STRIPPED (see `stripComments`'s own comment for
// why the two-pass version of that was itself a false-negative risk here):
// the raw ipc.ts contains the substring `.read(` inside a comment explaining
// that no handler here may call it, which a bare substring test would
// misreport as the violation itself.
//
// The import half matches `credential-(store|verify|crypto)`, not the
// literal `credential-store` alone. `credential-verify.ts` is the ONE module
// allowed to import the store, precisely because it is the one place
// `read()` may legitimately run — so an env-building module reaching the
// store BY WAY OF credential-verify (or credential-crypto, which the store
// itself is built on) is the identical violation wearing an extra hop, and a
// check that only named the store's own filename would miss it entirely.
// The three-file offender list is a HARDCODED SNAPSHOT of "the modules that
// build a process environment" as of this milestone, not a derived fact —
// a fourth one added later (a new module that also touches `env` before a
// spawn) is UNCHECKED by construction until someone adds it here. Writing
// that down is the honest version of a limit that would otherwise be
// discovered the hard way.
//
// The import half also does NOT follow a genuine second hop: it greps each
// offender file's OWN source for the credential-adjacent filenames, so it
// catches shell-env.ts (etc.) importing credential-store.ts directly, or by
// way of credential-verify.ts / credential-crypto.ts — but a future offender
// -> some OTHER, non-credential module -> credential-store chain contains
// none of those three names in the offender file itself and is invisible to
// this regex. This is the same class of honest limit the read half's alias
// check states below, not a claim that the import half is exhaustive.
//
// The read half must catch an ALIAS, not just the literal call spelling
// `credentialStore.read(`. A destructured, renamed binding —
// `const { read: peek } = credentialStore`, then calling `peek(...)` — never
// contains the substring `credentialStore.read(` anywhere, so it is checked
// by SHAPE: any destructuring assignment sourced from `credentialStore`
// (`{ ...props... } = credentialStore`) whose property list names `read`,
// aliased or not, is the same violation as the direct call. This still does
// not follow a SECOND hop of indirection — reassigning `credentialStore` to
// a new identifier and destructuring or calling through THAT is unchecked —
// which is the same class of honest limit as the hardcoded offender list
// above, not a claim of exhaustiveness.
{
  const offenders = ['src/main/shell-env.ts', 'src/main/pty-manager.ts', 'src/main/session-backend.ts']
    .filter((f) => /credential-(store|verify|crypto)/.test(stripComments(read(f) ?? '')))

  const ipc = stripComments(read('src/main/ipc.ts') ?? '')
  const directCall = /credentialStore\s*\.\s*read\s*\(/.test(ipc)
  const destructures = [...ipc.matchAll(/\{\s*([^{}]*?)\s*\}\s*=\s*credentialStore\b/g)]
  const aliasedRead = destructures.some((m) => /\bread\b/.test(m[1]))
  const readsPlaintext = directCall || aliasedRead

  ok('21 no env-building module directly imports the credential store, and no handler calls or aliases read()',
    offenders.length === 0 && !readsPlaintext,
    offenders.length
      ? offenders.join(',')
      : `directCall=${directCall} aliasedRead=${aliasedRead}`)
}

// 22-23. M24's rule: NO AGENT-REACHABLE PATH TRIGGERS A JIRA WRITE. Both
// checks read source text rather than behaviour, for check 20 and 21's own
// reason — a violation has NO RUNTIME SYMPTOM. Add a channel that let an
// agent's output drive a write and the app works exactly as it does now,
// plus one capability nobody asked for.
//
// Both reads are COMMENT-STRIPPED, because jira-client.ts and ipc-contract.ts
// each carry prose naming the very things that must not appear — a bare
// substring search fails against the correct tree.
//
// 22 is an ALLOWLIST, never a test for a forbidden spelling. Testing for
// `jira:delete` would pin THAT spelling and let a sibling named
// JIRA_DELETE_ISSUE sail through, which is exactly the trap check 20 records.
{
  const contract = stripComments(read('src/shared/ipc-contract.ts') ?? '')
  const objMatch = contract.match(/export const IPC = \{([\s\S]*?)\n\} as const/)
  const body = objMatch ? objMatch[1] : ''
  const keys = [...body.matchAll(/\bJIRA_[A-Z_]+\b/g)].map((m) => m[0])
  const ALLOWED = ['JIRA_LIST', 'JIRA_TRANSITIONS', 'JIRA_COMMENT', 'JIRA_TRANSITION']
  const unexpected = keys.filter((k) => !ALLOWED.includes(k))
  const missing = ALLOWED.filter((k) => !keys.includes(k))

  ok('22 the JIRA_* channel set is exactly {list,transitions,comment,transition}',
    objMatch !== null && unexpected.length === 0 && missing.length === 0,
    `parsed=${objMatch !== null} unexpected=${JSON.stringify(unexpected)} missing=${JSON.stringify(missing)}`)
}

// 23 carries the SAME two honest limits check 21 records, and they are stated
// here rather than left for a reader to discover: it greps each offender
// file's OWN source, so a second hop through some other, non-Jira module is
// unchecked; and the three-file offender list is a HARDCODED SNAPSHOT of "the
// modules that build a process environment" as of M24, so a fourth such
// module added later is unchecked by construction. A green run means these
// shapes hold. It is not proof the rule holds.
{
  const offenders = ['src/main/shell-env.ts', 'src/main/pty-manager.ts', 'src/main/session-backend.ts']
    .filter((f) => /jira-client/.test(stripComments(read(f) ?? '')))

  ok('23 no env-building module imports the Jira client',
    offenders.length === 0,
    offenders.length ? offenders.join(',') : 'none')
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
