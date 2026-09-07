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
  // M135: "wired into the chain" is TRANSITIVE. `verify:panels` is itself a
  // chain of `npm run verify:panels:<part>` since the split, so a part is
  // wired when some script the chain reaches names it — the same rule,
  // followed one hop further. A part named by no reachable script is still
  // unwired, and reads as such.
  const reachable = new Set()
  const walk = (text) => {
    for (const m of String(text || '').matchAll(/npm run (verify:[\w:-]+)/g)) {
      if (reachable.has(m[1])) continue
      reachable.add(m[1])
      walk(pkg.scripts[m[1]])
    }
  }
  walk(pkg.scripts.verify ?? '')
  // M148: verify:visual is the second named exclusion — it consumes a build
  // and paints every scene of the shot harness (about two minutes of real
  // Electron), a hand-run gate like verify:packaged, and it is pinned as one
  // by visual.1 below.
  const suites = Object.keys(pkg.scripts)
    .filter((k) => k.startsWith('verify:') && k !== 'verify:packaged' && k !== 'verify:visual')
  const unwired = suites.filter((k) => !reachable.has(k))
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
// M87 — readers.1. THE READERS OF A CREDENTIAL'S PLAINTEXT, pinned as a LIST.
//      `read(` on a credential store is the one call that yields a token,
//      and the set of modules that make it is exactly three: the verifier
//      (M14), the Jira client (M24) and the broker (M87) — the store's LAST
//      reader. A fourth would be a new place a token can leak from, and it
//      fails the build with its own name rather than joining quietly.
{
  const { readdirSync } = require('node:fs')
  const dir = 'src/main'
  const readers = readdirSync(dir).filter((f) => f.endsWith('.ts'))
    .filter((f) => /\bstore\s*\.\s*read\s*\(|credentialStore\s*\.\s*read\s*\(|deps\.store\.read\s*\(/.test(stripComments(read(`${dir}/${f}`) ?? '')))
    .sort()
  const expected = ['broker.ts', 'credential-verify.ts', 'jira-client.ts']
  ok('readers.1 exactly three modules read a credential\'s plaintext — credential-verify, jira-client and the broker, the last reader',
    JSON.stringify(readers) === JSON.stringify(expected),
    JSON.stringify(readers))
}

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

// 22. NO TWO CHECKS IN ONE SUITE SHARE AN ID. This is the rule that stops the
//     renumbering tax, and like 20 and 21 it is asserted as SOURCE TEXT because
//     it has no runtime symptom: the suite still runs, still counts, and prints
//     two different `133`s twenty lines apart. A report naming "check 133" is
//     then ambiguous rather than wrong, and nothing anywhere fails — which is
//     exactly how it shipped once already.
//
//     The cause is that check ids were a hand-maintained GLOBAL INTEGER
//     sequence, so two branches that never saw each other both appended from
//     their own view of the last number and both were right. There are 7+
//     `renumber` commits in this repository's history, and "M13" was claimed
//     four separate times. The convention that removes it is recorded in
//     CLAUDE.md: a NEW check takes a SCOPED id (`kind-tail.1`), never the next
//     global integer. Existing numbers stay — hundreds of them are cited in
//     CLAUDE.md — so this check guards the future rather than rewriting the
//     past.
//
//     THE DISCRIMINATOR IS THE PASS ARGUMENT, and getting it wrong makes this
//     check useless in one direction or unusable in the other. A guard or skip
//     branch legitimately REUSES its check's id:
//
//         if (!TMUX) ok('26 tmux reload survival (SKIPPED …)', true, …)
//         else       ok('26 a renderer reload detaches the client …', computed)
//
//     Only one of those ever runs, so it is not a collision. A first cut of
//     this rule flagged all ten such pairs in verify-panels.cjs and would have
//     had to be silenced with an allowlist — i.e. a second hand-maintained
//     list, which is the thing being removed. What separates the two cases is
//     that a guard passes a LITERAL `true`/`false` while a real assertion
//     passes a computed expression, so only ids carrying more than one COMPUTED
//     assertion are flagged. Measured against all 29 suites and 1,089 ids:
//     zero false positives. Fault-injected by adding a second computed `109` to
//     verify-rail.cjs, which this flags and nothing else in the repo does.
//
//     Comment-stripped, for the reason 20 and 21 are: these files are dense
//     with prose that quotes check ids.
{
  const { readdirSync } = require('node:fs')
  const dir = join(ROOT, 'scripts')
  // id, then the pass argument — the first 24 chars are plenty to see whether
  // it opens with a bare `true`/`false`.
  const re = /\bok\(\s*(?:(\d+[a-z]*)\s*,|(['"`])((?:[^'"`\\]|\\.)*)\2\s*,)\s*([^,]{0,24})/g
  const collisions = []
  let scanned = 0
  for (const f of readdirSync(dir).filter((n) => /^verify-.*\.cjs$/.test(n))) {
    const src = stripComments(read(join('scripts', f)) ?? '')
    const byId = new Map()
    let m
    while ((m = re.exec(src)) !== null) {
      const id = m[1] !== undefined ? m[1] : String(m[3]).trim().split(/\s+/)[0]
      const isLiteral = /^(true|false)\b/.test(m[4].trim())
      byId.set(id, (byId.get(id) ?? 0) + (isLiteral ? 0 : 1))
      scanned++
    }
    for (const [id, computed] of byId) {
      if (computed > 1) collisions.push(`${f}:${id}×${computed}`)
    }
  }
  // M48 — claude-md.1. CLAUDE.md is a COPY of the IPC diagram and of every
  //       load-bearing pointer, and it is edited by scripts. A script that
  //       opened it for writing before reading it emptied the whole file in
  //       the M47 commit, and nothing here noticed: 19 pins README's diagram,
  //       not this one. So: every invoke channel in the contract appears in
  //       CLAUDE.md's diagram too, which is only true of a file that exists.
  {
    const claudeMd = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8')
    const missing = channels.filter((ch) => !claudeMd.includes(ch))
    ok('claude-md.1 CLAUDE.md carries every invoke channel in its copy of the IPC diagram',
      claudeMd.length > 10000 && missing.length === 0,
      `length=${claudeMd.length} missing: ${missing.slice(0, 6).join(' ')}`)
  }

  ok('22 no two computed checks in one suite share an id',
    collisions.length === 0 && scanned > 900,
    collisions.length ? collisions.join(' ') : `${scanned} ids scanned, none collide`)
}

// 23. NO MODULE-LEVEL STORE CLAIMS AN ORDINAL. Same class as 22 and the same
//     reason it is source text: a number restated by hand in N files has no
//     runtime symptom when it drifts, and this one had drifted badly. As found
//     by the M27 audit, src/renderer/session/ held SEVEN stores whose own
//     comments called themselves, in file order: third, FIFTH, FOURTH, FOURTH,
//     (none), SIXTH — for what should have been second through seventh. Two
//     different files both claimed FOURTH, and CLAUDE.md repeated two of the
//     wrong numbers.
//
//     The fix was to delete the tally rather than correct it, because a
//     corrected tally is wrong again the day an eighth store lands and nobody
//     renumbers six comments. What each file records now is the RULE — never
//     bump registry.version() — which is the part that was always load-bearing.
//     This check keeps the ordinals from growing back.
{
  const { readdirSync } = require('node:fs')
  const dir = join(ROOT, 'src', 'renderer', 'session')
  const ordinal = /\b(a|the)\s+(second|third|fourth|fifth|sixth|seventh|eighth)\s+module-level\s+store/i
  const offenders = readdirSync(dir)
    .filter((f) => f.endsWith('-store.ts'))
    .filter((f) => ordinal.test(read(join('src', 'renderer', 'session', f)) ?? ''))
  const stores = readdirSync(dir).filter((f) => f.endsWith('-store.ts')).length
  ok('23 no module-level store comment claims an ordinal',
    offenders.length === 0 && stores >= 7,
    offenders.length ? offenders.join(',') : `${stores} stores, none numbered`)
}

// The two checks below arrived from the M24 Jira-writes branch numbered 22 and
// 23 — the same integers main had independently just used above. That is the
// exact collision check 22 exists to catch, and it would have flagged itself
// here. Renumbered to scoped ids on merge, per CLAUDE.md's convention: a NEW
// check takes a SCOPED id, never the next global integer.
// jira-write.1 / jira-write.2. M24's rule: NO AGENT-REACHABLE PATH TRIGGERS A JIRA WRITE. Both
// checks read source text rather than behaviour, for check 20 and 21's own
// reason — a violation has NO RUNTIME SYMPTOM. Add a channel that let an
// agent's output drive a write and the app works exactly as it does now,
// plus one capability nobody asked for.
//
// Both reads are COMMENT-STRIPPED, because jira-client.ts and ipc-contract.ts
// each carry prose naming the very things that must not appear — a bare
// substring search fails against the correct tree.
//
// jira-write.1 is an ALLOWLIST, never a test for a forbidden spelling. Testing for
// `jira:delete` would pin THAT spelling and let a sibling named
// JIRA_DELETE_ISSUE sail through, which is exactly the trap check 20 records.
//
// jira-write.1 CARRIES A THIRD LIMIT OF ITS OWN, beside the two 23 records below, and it
// is stated here so a green run is not over-read: this is a PREFIX-KEYED
// allowlist. It matches /JIRA_[A-Z_]+/ inside the `IPC` object alone, so a
// write channel named without that prefix — WORKITEM_DELETE, TICKET_UPDATE —
// is invisible to it, as is anything added to IPC_EVENTS. That is inherent to
// keying on a prefix and is the right trade (the alternative, an allowlist
// over EVERY channel, goes red on every unrelated milestone and is therefore
// the kind that gets widened until it means nothing), but it means a green jira-write.1
// says "no unexpected JIRA_* invoke exists", never "no write channel exists".
{
  const contract = stripComments(read('src/shared/ipc-contract.ts') ?? '')
  const objMatch = contract.match(/export const IPC = \{([\s\S]*?)\n\} as const/)
  const body = objMatch ? objMatch[1] : ''
  const keys = [...body.matchAll(/\bJIRA_[A-Z_]+\b/g)].map((m) => m[0])
  const ALLOWED = ['JIRA_LIST', 'JIRA_TRANSITIONS', 'JIRA_COMMENT', 'JIRA_TRANSITION']
  const unexpected = keys.filter((k) => !ALLOWED.includes(k))
  const missing = ALLOWED.filter((k) => !keys.includes(k))

  ok('jira-write.1 the JIRA_* channel set is exactly {list,transitions,comment,transition}',
    objMatch !== null && unexpected.length === 0 && missing.length === 0,
    `parsed=${objMatch !== null} unexpected=${JSON.stringify(unexpected)} missing=${JSON.stringify(missing)}`)
}

// jira-write.2 carries the SAME two honest limits check 21 records, and they are stated
// here rather than left for a reader to discover: it greps each offender
// file's OWN source, so a second hop through some other, non-Jira module is
// unchecked; and the three-file offender list is a HARDCODED SNAPSHOT of "the
// modules that build a process environment" as of M24, so a fourth such
// module added later is unchecked by construction. A green run means these
// shapes hold. It is not proof the rule holds.
{
  const offenders = ['src/main/shell-env.ts', 'src/main/pty-manager.ts', 'src/main/session-backend.ts']
    .filter((f) => /jira-client/.test(stripComments(read(f) ?? '')))

  ok('jira-write.2 no env-building module imports the Jira client',
    offenders.length === 0,
    offenders.length ? offenders.join(',') : 'none')
}

console.log('\n' + '='.repeat(60))
// audit.1 (M59). Every REASON_* constant in the palette is NAMED in the
// audit document: a reason nobody wrote down is a reason nobody reviewed,
// and the next row added with a fresh constant turns this red until the
// audit says what the user does about it.
{
  const src = readFileSync(join(__dirname, '..', 'src', 'renderer', 'palette', 'commands.ts'), 'utf8')
  const auditPath = join(__dirname, '..', 'docs', 'dead-end-audit.md')
  const audit = existsSync(auditPath) ? readFileSync(auditPath, 'utf8') : ''
  const names = [...new Set([...src.matchAll(/export const (REASON_[A-Z_]+) =/g)].map((m) => m[1]))]
  const missing = names.filter((n) => !audit.includes(`\`${n}\``))
  ok('audit.1 every palette REASON_* constant is named in docs/dead-end-audit.md', names.length >= 20 && missing.length === 0, JSON.stringify({ names: names.length, missing }))
}

// version.1 (M60; 1.1.0 at M70; 2.0.0 at M95; 2.2.0 at M108; 2.3.0 at M111; 3.0.0 at M125; 3.1.0 at M134 — the M126–M133 act shipped its rows unversioned and the v7 run's Act 0 paid that debt). package.json says 3.1.0 and the README's status line
// agrees — the one number that must not drift between the two files that
// name it.
{
  const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8')
  const statusLine = (readme.match(/^> \*\*Status:[^\n]*/m) || [''])[0]
  ok('version.1 package.json is 3.1.0 and the README status line names the same version',
    pkg.version === '3.1.0' && statusLine.includes('v3.1.0') && !/beta/i.test(statusLine),
    JSON.stringify({ version: pkg.version, statusLine }))
}

// M61 — milestones.1. THE ROADMAP CONTRACT, PINNED. README.md's milestone
// table is described in two places as "the roadmap contract", and it ended
// at M35 for twenty-five milestones while check 14 kept the IPC diagram
// honest three sections above it. Nothing read the table, so nothing noticed.
// Every build log under docs/build-log/mNN-*.md must have a `| MNN |` row,
// and — the direction that stops a row being invented ahead of the work —
// every row at or above M36 must have a build log. M1–M35 predate the
// build-log directory and are pinned only in the first direction.
{
  const { readdirSync } = require('node:fs')
  const logs = readdirSync(join(ROOT, 'docs', 'build-log'))
    // M96: a log may cover an ACT — `m96-m99-act1-control.md` names a range,
    // and every number in it counts as logged (the v5 run keeps one log per
    // act, a section per milestone; a per-milestone stub would be ceremony
    // that says nothing).
    .map((f) => /^m(\d+)(?:-m(\d+))?[a-z]?-.*\.md$/.exec(f)).filter(Boolean)
    .flatMap((m) => { const a = Number(m[1]); const b = m[2] === undefined ? a : Number(m[2]); const out = []; for (let n = a; n <= b; n += 1) out.push(n); return out })
  const readme = read('README.md') ?? ''
  const rows = [...readme.matchAll(/^\| M(\d+)[a-z]? \|/gm)].map((m) => Number(m[1]))
  const rowSet = new Set(rows)
  const logSet = new Set(logs)
  const missingRows = [...logSet].filter((n) => !rowSet.has(n))
  const missingLogs = [...rowSet].filter((n) => n >= 36 && !logSet.has(n))
  ok('milestones.1 every build log has a README milestone row, and every row from M36 on has a build log',
    logs.length >= 25 && missingRows.length === 0 && missingLogs.length === 0,
    JSON.stringify({ logs: logs.length, rows: rowSet.size, missingRows, missingLogs }))
}

// M103 — browser.1. THE GUEST'S FIVE PROPERTIES, AS TEXT. `webviewTag: true`
// is the one setting Electron's own docs discourage, and the argument for it
// is that every property the docs warn about is closed by name in
// main/index.ts: the tag itself; `will-attach-webview` stripping any
// `preload` a page could set and forcing nodeIntegration OFF and
// contextIsolation ON; the browser partition's permission handler answering
// `false` (camera, mic, geolocation, notifications — every ask); the guest's
// own `setWindowOpenHandler` denying every new window; and the http(s) gate
// on the guest's `src`. None of these has a runtime symptom when removed —
// a page that reaches node prints nothing — so the source text is the check.
{
  const src = stripComments(read('src/main/index.ts') ?? '')
  const at = src.indexOf("'will-attach-webview'")
  const attach = at < 0 ? '' : src.slice(at, at + 900)
  const webviewTag = /webviewTag:\s*true/.test(src)
  const stripsPreload = /delete\s+webPreferences\.preload/.test(attach)
  const noNode = /webPreferences\.nodeIntegration\s*=\s*false/.test(attach) && /webPreferences\.contextIsolation\s*=\s*true/.test(attach)
  const srcGate = /\^https\?:/.test(attach) && /event\.preventDefault\(\)/.test(attach)
  const permission = /fromPartition\(\s*'persist:tc-browser'\s*\)[\s\S]{0,80}setPermissionRequestHandler\(\s*\([^)]*\)\s*=>\s*\w+\(false\)\s*\)/.test(src)
  const da = src.indexOf("'did-attach-webview'")
  const guestDeny = da >= 0 && /setWindowOpenHandler\(\s*\(\)\s*=>\s*\(\{\s*action:\s*'deny'\s*\}\)\s*\)/.test(src.slice(da, da + 600))
  ok('browser.1 main/index.ts turns the webview tag on and closes every property the docs warn about by name: will-attach-webview strips preload and forces nodeIntegration false / contextIsolation true, the guest src is gated to http(s), the persist:tc-browser partition denies every permission ask, and the attached guest denies every new window',
    webviewTag && stripsPreload && noNode && srcGate && permission && guestDeny,
    JSON.stringify({ webviewTag, stripsPreload, noNode, srcGate, permission, guestDeny }))
}

// M112 — telemetry.3. THE MODULES THAT HOLD BYTES NEVER MEET THE SDK. A
// Sentry import in the env builder, the PTY manager, the credential store or
// the scrollback log is a second exit for exactly the data the scrubber
// exists to withhold; the boundary is the import graph, pinned as text, the
// shape check 21 uses. And the credential store's reader list (readers.1)
// stays exactly three — telemetry.ts is not one of them.
//
// Same honest limit as 20/21's own disclaimer, restated for this offender
// list: this greps each offender file's OWN source for the literal
// `@sentry/`, so a module that reaches the SDK through a one-hop wrapper
// (say `./telemetry-sink.ts`, which itself imports `@sentry/electron`)
// evades this check completely — the wrapper's name contains none of the
// strings this regex looks for. The five-file offender list is a HARDCODED
// SNAPSHOT of "the modules that hold raw bytes" as of M112, not a derived
// fact: a sixth such module added later is UNCHECKED by construction until
// someone adds it here. `telemetryReadsStore` has the identical limit —
// a bare substring match against `telemetry.ts`'s own source, so a
// destructured or aliased read routed through an intermediate module is
// invisible to it too. A green telemetry.3 is a guard on a rule, not a
// proof that no module can reach the SDK.
{
  const offenders = ['src/main/shell-env.ts', 'src/main/pty-manager.ts', 'src/main/credential-store.ts', 'src/main/scrollback-log.ts', 'src/main/telemetry.ts']
    .filter((f) => /@sentry\//.test(stripComments(read(f) ?? '')))
  const telemetryReadsStore = /credential-(store|verify|crypto)/.test(stripComments(read('src/main/telemetry.ts') ?? ''))
  ok('telemetry.3 no byte-holding module and not telemetry.ts itself imports @sentry; telemetry.ts never imports the credential store',
    offenders.length === 0 && !telemetryReadsStore,
    offenders.join(', ') || 'clean')
}

// M112 — telemetry.5 (fix round 1, CRITICAL). THE TRANSPORT'S WIRING, PINNED
// AS TEXT. The end-to-end hand check is owed (no DSN at hand — see the
// owed item in docs/load-bearing.md), so nothing in this repo's suites
// drives a real Sentry envelope across the IPC boundary. What IS cheaply
// and honestly reachable from plain node is the SHAPE that boundary
// depends on, so a later edit cannot silently reintroduce the exact
// failure fix round 1 found: Classic IPC mode with nothing exposing
// `window.__SENTRY_IPC__` in the main world, which sends the renderer's
// SDK fetching `sentry-ipc://…` instead — refused by the CSP with no
// error at all.
//
// Three textual facts, each one a thing that was WRONG before fix round 1
// and is checked here so it cannot quietly become wrong again:
//   1. `src/preload/index.ts` imports `hookupIpc` from the NON-side-effecting
//      `@sentry/electron/preload-namespaced` entry (never the plain
//      `/preload`, which runs it unconditionally at module load and cannot
//      be gated) and calls it INSIDE the `if (telemetryEnabled)` gate.
//   2. That file never re-imports `@sentry/electron/renderer` — the dead
//      `sentryRendererInit()` path fix round 1 removed, which ran in an
//      isolated world, captured nothing, and used the same doomed fetch.
//   3. `src/renderer/main.tsx` passes an explicit `integrations` array
//      naming `globalHandlersIntegration` to its own `init()` — with
//      `defaultIntegrations: false` and no explicit list, that init call
//      would install nothing at all, and the owed hand check would have
//      failed even if the transport worked.
//
// This is a guard on a SHAPE, not a proof the transport works: it cannot
// see whether `hookupIpc()` actually resolves before the renderer's own
// `init()` runs, or whether main's real `ipcMain` listeners receive a
// real envelope. That residual is recorded explicitly in the owed hand
// check (docs/load-bearing.md).
{
  const preloadSrc = stripComments(read('src/preload/index.ts') ?? '')
  const rendererSrc = stripComments(read('src/renderer/main.tsx') ?? '')
  const importsNamespacedHookup = /from ['"]@sentry\/electron\/preload-namespaced['"]/.test(preloadSrc) && /\bhookupIpc\b/.test(preloadSrc)
  const hookupInsideGate = /if\s*\(telemetryEnabled\)\s*\{\s*hookupIpc\(\)\s*\}/.test(preloadSrc)
  const noDeadRendererImport = !/@sentry\/electron\/renderer/.test(preloadSrc)
  const rendererHasGlobalHandlers = /@sentry\/electron\/renderer/.test(rendererSrc) && /globalHandlersIntegration/.test(rendererSrc)
  ok('telemetry.5 the preload exposes window.__SENTRY_IPC__ via the non-side-effecting hookupIpc(), gated and never paired with the dead renderer-SDK import; the renderer\'s own init() names globalHandlersIntegration rather than relying on defaultIntegrations',
    importsNamespacedHookup && hookupInsideGate && noDeadRendererImport && rendererHasGlobalHandlers,
    JSON.stringify({ importsNamespacedHookup, hookupInsideGate, noDeadRendererImport, rendererHasGlobalHandlers }))
}

// M123 — update.1. THE UPDATE CHECK NEVER REACHES THE NETWORK FROM A SUITE,
// AND NO PLAN MAY SWITCH IT ON. Three facts pinned as text, each with a
// silent failure behind it. (a) The setting `update.checkOnLaunch` exists,
// is a boolean, defaults to false and is NOT `planWritable`: a plan that
// could turn on a launch-time network call has the shape of exfiltration,
// the same reason telemetry's keys carry no flag. (b) `main/update-check.ts`
// imports no `https` — the fetcher is injected and the real one lives in
// `main/index.ts`, which no suite bundles — so the module runs under plain
// node in verify:file. (c) No suite script holds a real fetcher: `https.get(`,
// an `https` module import, or a TEMPLATED `api.github.com/repos/${…}` url
// (a recorded fixture body carries the literal host — verify-panels and
// shot do — and is not a call). Same honest limit as telemetry.3: a
// wrapper module one hop away evades a substring grep.
{
  const { readdirSync } = require('node:fs')
  // Comments stripped FIRST: the entry's own comment says "never planWritable",
  // and a text check that read it would fail on the sentence explaining it.
  const schema = stripComments(read('src/shared/settings-schema.ts') ?? '')
  const start = schema.indexOf("id: 'update.checkOnLaunch'")
  const entry = start === -1 ? '' : schema.slice(schema.lastIndexOf('{', start), schema.indexOf('}', start))
  const settingOk = entry !== '' && /type: 'boolean'/.test(entry) && /default: false/.test(entry) && !/planWritable/.test(entry)
  const moduleSrc = stripComments(read('src/main/update-check.ts') ?? '')
  const moduleOk = moduleSrc !== '' && !/['"](node:)?https['"]/.test(moduleSrc) && /export (async )?function checkForUpdate/.test(moduleSrc)
  const offenders = readdirSync(join(ROOT, 'scripts')).filter((n) => /\.cjs$/.test(n))
    .filter((f) => /https\.get\(|['"](node:)?https['"]|api\.github\.com\/repos\/\$\{/.test(stripComments(read(join('scripts', f)) ?? '')))
  ok('update.1 update.checkOnLaunch is a boolean, default false, not planWritable; main/update-check.ts imports no https (the fetcher is injected); no script under scripts/ holds https.get, an https import or a templated api.github.com url',
    settingOk && moduleOk && offenders.length === 0,
    JSON.stringify({ settingOk, moduleOk, offenders }))
}

// panels-split.1 / panels-split.2 (M135). `verify:panels` was one 19,813-line
// file with 357 checks and a 600 s watchdog it had outgrown three times; the
// M130 note said the fourth raise must be a split. The split is a HARNESS
// (`scripts/panels-harness.cjs`) plus parts (`scripts/verify-panels-*.cjs`),
// and two facts about it fail silently: a part whose watchdog is a number
// nobody measured (the old constant, copied) is the un-split file's problem
// wearing five names; and a check id that fell out in the move is a check
// that stopped running with no red anywhere — its citations in CLAUDE.md and
// docs/load-bearing.md keep reading as evidence. So the parts' id SET is
// compared against the old file's at `pre-v7-run`, read from git, never from
// a stored list that would itself go stale.
{
  const { readdirSync } = require('node:fs')
  const { execFileSync } = require('node:child_process')
  const scripts = readdirSync(join(ROOT, 'scripts'))
  const parts = scripts.filter((f) => /^verify-panels-[a-z]+\.cjs$/.test(f)).sort()
  const oldFileGone = !existsSync(join(ROOT, 'scripts', 'verify-panels.cjs'))
  const harnessExists = existsSync(join(ROOT, 'scripts', 'panels-harness.cjs'))
  const chain = String((pkg.scripts || {})['verify:panels'] || '')
  const partProblems = []
  for (const f of parts) {
    const text = read(join('scripts', f))
    if (!/require\('\.\/panels-harness\.cjs'\)/.test(text)) partProblems.push(`${f}: does not require the harness`)
    const wd = text.match(/const WATCHDOG_MS = (\d+)\s*\/\/ measured ([^\n]+)/)
    if (!wd) partProblems.push(`${f}: no numeric WATCHDOG_MS with a "// measured" comment`)
    else if (!/\d{4}-\d{2}-\d{2}/.test(wd[2]) || !/\d+\s*s.*\d+\s*s/.test(wd[2])) partProblems.push(`${f}: the measured comment lacks a date and two figures`)
    if (!chain.includes('npm run verify:panels:' + f.replace(/^verify-panels-|\.cjs$/g, ''))) partProblems.push(`${f}: not in the verify:panels chain`)
  }
  ok('panels-split.1 verify-panels.cjs is gone, every scripts/verify-panels-*.cjs requires the harness, carries a measured numeric watchdog, and is in the verify:panels chain',
    oldFileGone && harnessExists && parts.length >= 2 && partProblems.length === 0,
    JSON.stringify({ oldFileGone, harnessExists, parts, partProblems }))

  const idsOf = (text) => {
    const out = new Set()
    const re = /^\s*ok\((?:'((?:[^'\\]|\\.)*)'|`([^`]*)`)/gm
    let m
    while ((m = re.exec(text))) {
      const label = (m[1] !== undefined ? m[1] : m[2]).replace(/\\'/g, "'")
      out.add(label.split(' ')[0])
    }
    return out
  }
  let oldIds = new Set()
  let gitErr = null
  try {
    oldIds = idsOf(execFileSync('git', ['show', 'pre-v7-run:scripts/verify-panels.cjs'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
  } catch (e) { gitErr = String(e && e.message || e).split('\n')[0] }
  const newIds = new Set()
  for (const f of parts) for (const id of idsOf(read(join('scripts', f)) || '')) newIds.add(id)
  const lost = [...oldIds].filter((id) => !newIds.has(id))
  // The parser sees a literal first argument only (222 of the 357 `ok(` calls
  // at pre-v7-run; the rest take a variable, `IDS[0]` and its siblings, whose
  // ids are pinned by those blocks' own `IDS` arrays moving with them). The
  // same parser reads both sides, so the comparison is exact for what it sees.
  ok('panels-split.2 the parts hold every check id the old file held at pre-v7-run — nothing lost in the move',
    gitErr === null && oldIds.size > 200 && lost.length === 0,
    JSON.stringify({ gitErr, old: oldIds.size, now: newIds.size, lost: lost.slice(0, 20) }))
}

// handcheck.1 (M136). The eleven owed hand checks from the M126–M133 act live in
// ONE source, `scripts/handcheck-steps.cjs`: the automated arms `npm run
// handcheck` runs, and the human steps it prints. The manual-only block at the
// end of docs/load-bearing.md must carry every HAND step's title verbatim, so
// the list a person reads and the list the script prints cannot drift apart —
// two lists of "what a green verify is silent on" that disagree are the same
// silence wearing two faces. And `handcheck` is NOT in the verify chain: it
// reaches the real machine (a real `claude`, the real Trash, a real ~/.claude
// under a fence), the same reason verify:packaged stays out.
{
  let steps = null
  let loadErr = null
  try { steps = require(join(ROOT, 'scripts', 'handcheck-steps.cjs')).STEPS } catch (e) { loadErr = String(e && e.message || e).split('\n')[0] }
  const lb = read('docs/load-bearing.md') || ''
  const manualBlock = lb.slice(lb.lastIndexOf('**The manual-only list, re-read entire'))
  const hand = Array.isArray(steps) ? steps.filter((s) => s.arm === 'hand') : []
  const auto = Array.isArray(steps) ? steps.filter((s) => s.arm === 'auto') : []
  const missing = hand.filter((s) => !manualBlock.includes(s.title)).map((s) => s.n)
  const chain = String(pkg.scripts.verify || '')
  ok('handcheck.1 scripts/handcheck-steps.cjs holds the eleven owed checks, every HAND title is in the manual-only block, every step has an arm, and handcheck is a script outside the verify chain',
    loadErr === null && Array.isArray(steps) && steps.length === 11 && hand.length + auto.length === 11 &&
      hand.every((s) => Array.isArray(s.steps) && s.steps.length >= 2) && auto.every((s) => typeof s.run === 'function') &&
      missing.length === 0 && typeof pkg.scripts.handcheck === 'string' && !chain.includes('handcheck'),
    JSON.stringify({ loadErr, count: Array.isArray(steps) ? steps.length : null, hand: hand.length, auto: auto.length, missing, script: pkg.scripts.handcheck ?? null }))
}

// visual.1 (M148). The visual-regression suite over the shot harness: the
// script exists and is its own Electron entry, `package.json` names it OUTSIDE
// the chain (it is a hand-run gate, like verify:packaged), the goldens hold
// one PNG per scene the harness DECLARES (read from scripts/shot.cjs as text —
// a scene added to the harness without a golden is a scene the suite cannot
// see, silently), and the two tolerance constants are numbers with a sentence
// each, because the constant that turns the suite off is one nobody explained.
{
  const { readdirSync } = require('node:fs')
  const script = read('scripts/verify-visual.cjs')
  const shot = read('scripts/shot.cjs') || ''
  const declared = [...shot.matchAll(/\{ name: '([a-z0-9-]+)'/g)].map((m) => m[1])
  const goldensDir = join(ROOT, 'verify', 'visual', 'goldens')
  const goldens = existsSync(goldensDir) ? readdirSync(goldensDir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, '')) : []
  const missing = declared.filter((n) => !goldens.includes(n))
  const stray = goldens.filter((n) => !declared.includes(n))
  const chain = String(pkg.scripts.verify || '')
  const channel = script ? script.match(/const CHANNEL_TOLERANCE = (\d+)\s*\/\/ [^\n]{20,}/) : null
  const budget = script ? script.match(/const PIXEL_BUDGET = ([\d.]+)\s*\/\/ [^\n]{20,}/) : null
  ok('visual.1 verify:visual exists as an Electron entry outside the chain, holds one golden per scene the shot harness declares, and states its two tolerance constants with a sentence each',
    script !== null && /require\('electron'\)/.test(script) && typeof pkg.scripts['verify:visual'] === 'string' && !chain.includes('verify:visual') &&
      declared.length >= 50 && missing.length === 0 && stray.length === 0 && channel !== null && budget !== null,
    JSON.stringify({ script: script !== null, declared: declared.length, goldens: goldens.length, missing: missing.slice(0, 8), stray: stray.slice(0, 8), channel: channel && channel[1], budget: budget && budget[1] }))
}

const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
