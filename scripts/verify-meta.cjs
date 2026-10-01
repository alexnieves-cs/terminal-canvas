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

const { ok, results } = require('./lib/checks.cjs').createChecks()

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

// 19. Every verify suite RUNS.
//
// This check used to re-derive the suite list and compare it against
// package.json's hand-written `verify` chain, because a suite added as a
// script and never added to that chain ran nowhere, silently, forever — the
// same stale-by-omission failure check 14 guards for the IPC diagram, and the
// shape .github/workflows/verify.yml deliberately refuses.
//
// M237 removed the copy rather than keep policing it: scripts/verify-all.cjs
// DERIVES the list off package.json, so there is no second list left to drift
// out of step. Three things still need pinning, and each of them fails
// silently:
//
//   - HAND_RUN is EXACTLY those two names. It is now the only way a suite can
//     be excluded from the gate, which makes it the place the old
//     stale-by-omission failure would reappear: a third name added here to
//     quiet a red suite would remove it from the gate permanently, and every
//     other check in this file would still pass. Pinned by name, so growing it
//     is a decision somebody has to come here and make.
//   - every part an AGGREGATE names is itself derived. `verify:panels` is a
//     chain of `npm run verify:panels:<part>`; a part named there but never
//     declared as a script, or renamed on one side only, runs nowhere.
//   - nothing sits in the fallback tier unnoticed. `tierOf` sends an
//     unrecognised command shape to the SERIAL tier so it still runs; that is
//     the safe default, and it is also how a suite could silently stop being
//     parallel — or, worse, how a genuinely broken script line could look fine.
//   - `verify` still points AT the runner. Edited back to anything else, the
//     whole harness goes with it and every other check here would still pass.
//
// verify:packaged and verify:visual stay excluded BY NAME (in the runner's
// HAND_RUN, read from there rather than restated here — they rebuild native
// modules or paint every scene of the shot harness, and are pre-release gates
// a person runs). Requiring a sibling script is the pattern handcheck.1
// below already uses.
{
  const runner = require(join(ROOT, 'scripts', 'verify-all.cjs'))
  const derived = runner.suites()
  const run = new Set(derived.map((s) => s.name))
  const declared = Object.keys(pkg.scripts).filter((k) => k.startsWith('verify:'))
  const aggregates = declared.filter((k) => runner.isAggregate(pkg.scripts[k]))
  // Not "is every declared suite derived" — tierOf's fallback means every one
  // of them is, so such a clause could never go red and would be decoration.
  const handRunDrift = runner.HAND_RUN.slice().sort().join(',') !== 'verify:packaged,verify:visual'
  const aggregateParts = aggregates.flatMap((k) =>
    [...String(pkg.scripts[k]).matchAll(/npm run (verify:[\w:-]+)/g)].map((m) => m[1]))
  const orphanParts = aggregateParts.filter((k) => !run.has(k))
  const unclassified = derived.filter((s) => s.tier === 'unclassified').map((s) => s.name)
  const wired = /node scripts\/verify-all\.cjs/.test(String(pkg.scripts.verify || ''))
  ok('19 every verify suite is run by the derived runner, the hand-run exclusions are exactly two, and every aggregate part is declared',
    derived.length > 10 && !handRunDrift && orphanParts.length === 0 &&
      unclassified.length === 0 && wired,
    JSON.stringify({ derived: derived.length, handRunDrift, orphanParts, unclassified,
      wired, handRun: runner.HAND_RUN, aggregates }))
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
  // account-session.ts is the fourth: the Terminal Canvas account's session
  // (supabase:github:<id>) is attached to requests to the account server and
  // returned by no function there — verify:account login.3 pins that.
  const expected = ['account-session.ts', 'broker.ts', 'credential-verify.ts', 'jira-client.ts']
  ok('readers.1 exactly four modules read a credential\'s plaintext — credential-verify, jira-client, the broker and the account session',
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

// M195 (D03) — preview-readers.1. A PREVIEW BINDING IS PROVENANCE, AND THE
//      READER SET IS PINNED AS A LIST — `readers.1`'s shape for a different
//      kind of leak. `PreviewBinding.root` decides ONE thing (does this file
//      change belong to this pane) and explains itself; it is not an authority
//      over the filesystem, and nothing may ask it whether something is
//      allowed. Two claims, each of which fails the build by name:
//      (a) MAIN never sees it. Main owns the Places gate, the spawn resolver,
//          the credential store and every filesystem read, so a binding
//          reaching `src/main` is the shape of the failure this pins: a folder
//          the renderer derived being used to widen what main will do.
//      (b) In the renderer it has a CLOSED consumer list. A new one is a new
//          meaning for the field and must be chosen deliberately rather than
//          joining quietly — which is what let `no-cwd` wear a failed read's
//          costume at six sites one milestone ago.
{
  const { readdirSync } = require('node:fs')
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : (/\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []))
  // The pattern must catch a FIELD ACCESS, not only the type's name: the leak
  // this pins is a folder the renderer derived being handed to something that
  // decides, and `(p as { preview?: { root: string } }).preview?.root` names
  // neither `PreviewBinding` nor the rule. `\.preview\b` is what closes that,
  // and it is why the renderer list below holds the two rendering files too.
  const names = (root) => walk(root)
    .filter((f) => /\.preview\b|\bPreviewBinding\b|previewReloadDecision|pathInsidePreview|normalisePreviewPath|previewSourceLine/.test(stripComments(read(f) ?? '')))
    .map((f) => f.slice(root.length + 1))
    .sort()
  const inMain = names('src/main')
  // ONE main file may name it, and only to REWRITE it: a snapshot restore
  // re-mints every panel id, so every reference to a panel id must follow or
  // the restored canvas holds a preview pointing at a panel id that no longer
  // exists (or, in the merged view, at the original workspace's panel). It
  // reads the field to rename it and never to decide anything.
  const expectedMain = ['layout-snapshots.ts']
  const inShared = names('src/shared')
  const inRenderer = names('src/renderer')
  // shared: the rule itself, the RECORD that declares the field (M278 split the
  // schema's shapes out of its readers), and the parser that reads one off disk.
  // The barrel is not here and must not be: it re-exports and decides nothing.
  const expectedShared = ['layout-schema/panels.ts', 'layout-schema/types.ts', 'preview.ts']
  // renderer: the record and its two copy sites, the two doors that WRITE one,
  // the rule's caller, and the two surfaces that RENDER one.
  const expectedRenderer = [
    'browser/BrowserNode.tsx',
    'browser/usePreviewReload.ts',
    'canvas/Canvas.tsx',
    // Was `canvas/usePaletteActions.ts` until that hook was split by domain.
    // The SAME two consumers, at their new paths and no others: the spawn
    // sheet's lineup seat, which mints a pane already bound to the lineup's
    // folder, and the deps interface that declares the door it calls to do it.
    'canvas/palette-actions/presets.ts',
    'canvas/palette-actions/types.ts',
    'panels/layout-adapt.ts',
    'panels/panels.ts',
    'shell/inspector-fields.ts'
  ]
  ok('preview-readers.1 a preview binding reaches ONE file in src/main — the snapshot restore, which re-mints panel ids and rewrites it, never a gate, a spawn resolver or a filesystem read — and elsewhere its consumers are a closed list: the rule and the parser in shared, the record, the two doors that write one and the rule\'s caller in the renderer. It is provenance, and a new consumer is a new meaning that must be chosen by name',
    JSON.stringify(inMain) === JSON.stringify(expectedMain) && JSON.stringify(inShared) === JSON.stringify(expectedShared) && JSON.stringify(inRenderer) === JSON.stringify(expectedRenderer),
    JSON.stringify({ inMain, inShared, inRenderer }))
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
//
// M278: walks the palette DIRECTORY rather than naming commands.ts. The rule
// was always "every REASON_* constant in the palette", but pinning it to one
// filename made it go red when commands.ts was split and — far worse — left
// it silent on a real violation: with no names found, `missing` is vacuously
// empty, so only the `>= 20` floor said anything was wrong. Walking the
// directory is the rule as written, and it now also catches a reason added to
// any other palette module, which the filename pin never could.
{
  const { readdirSync } = require('node:fs')
  const dir = join(__dirname, '..', 'src', 'renderer', 'palette')
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : [])
  const src = walk(dir).map((f) => readFileSync(f, 'utf8')).join('\n')
  const auditPath = join(__dirname, '..', 'docs', 'dead-end-audit.md')
  const audit = existsSync(auditPath) ? readFileSync(auditPath, 'utf8') : ''
  const names = [...new Set([...src.matchAll(/export const (REASON_[A-Z_]+) =/g)].map((m) => m[1]))]
  const missing = names.filter((n) => !audit.includes(`\`${n}\``))
  ok('audit.1 every palette REASON_* constant is named in docs/dead-end-audit.md', names.length >= 20 && missing.length === 0, JSON.stringify({ names: names.length, missing }))
}

// version.1 (4.1.0 at M179; M60; 1.1.0 at M70; 2.0.0 at M95; 2.2.0 at M108; 2.3.0 at M111; 3.0.0 at M125; 3.1.0 at M134 — the M126–M133 act shipped its rows unversioned and the v7 run's Act 0 paid that debt). package.json says 4.1.0 and the README's status line v4.1.0 at M179
// 4.0.0 at M160, the v7 run's reconcile; 5.0.0 at M192, the v9 run's.
// agrees — the one number that must not drift between the two files that
// name it.
{
  const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8')
  const statusLine = (readme.match(/^> \*\*Status:[^\n]*/m) || [''])[0]
  ok('version.1 package.json is 5.0.0 and the README status line names the same version',
    pkg.version === '5.0.0' && statusLine.includes('v5.0.0') && !/beta/i.test(statusLine),
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
    // M162: a run's LEDGER (`m161-m179-ledger.md`, the resumable state the v8
    // prompt names) spans the whole run and has no section per milestone, so it
    // is not a log — counting its range would satisfy the second direction for
    // seventeen rows invented ahead of the work (the Act 0 critic).
    .filter((f) => !/-ledger\.md$/.test(f))
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
// main/bootstrap/window.ts: the tag itself; `will-attach-webview` stripping any
// `preload` a page could set and forcing nodeIntegration OFF and
// contextIsolation ON; the browser partition's permission handler answering
// `false` (camera, mic, geolocation, notifications — every ask); the guest's
// own `setWindowOpenHandler` denying every new window; and the http(s) gate
// on the guest's `src`. None of these has a runtime symptom when removed —
// a page that reaches node prints nothing — so the source text is the check.
{
  const src = stripComments(read('src/main/bootstrap/window.ts') ?? '')
  const at = src.indexOf("'will-attach-webview'")
  const attach = at < 0 ? '' : src.slice(at, at + 900)
  const webviewTag = /webviewTag:\s*true/.test(src)
  const stripsPreload = /delete\s+webPreferences\.preload/.test(attach)
  const noNode = /webPreferences\.nodeIntegration\s*=\s*false/.test(attach) && /webPreferences\.contextIsolation\s*=\s*true/.test(attach)
  const srcGate = /\^https\?:/.test(attach) && /event\.preventDefault\(\)/.test(attach)
  const permission = /fromPartition\(\s*'persist:tc-browser'\s*\)[\s\S]{0,80}setPermissionRequestHandler\(\s*\([^)]*\)\s*=>\s*\w+\(false\)\s*\)/.test(src)
  const da = src.indexOf("'did-attach-webview'")
  const guestDeny = da >= 0 && /setWindowOpenHandler\(\s*\(\)\s*=>\s*\(\{\s*action:\s*'deny'\s*\}\)\s*\)/.test(src.slice(da, da + 600))
  ok('browser.1 main/bootstrap/window.ts turns the webview tag on and closes every property the docs warn about by name: will-attach-webview strips preload and forces nodeIntegration false / contextIsolation true, the guest src is gated to http(s), the persist:tc-browser partition denies every permission ask, and the attached guest denies every new window',
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
// `main/bootstrap/workspace-handlers.ts`, which no suite bundles — so it runs under plain
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
  ok('handcheck.1 scripts/handcheck-steps.cjs holds the twelve owed checks, every HAND title is in the manual-only block, every step has an arm, and handcheck is a script outside the verify chain',
    loadErr === null && Array.isArray(steps) && steps.length === 12 && hand.length + auto.length === 12 &&
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
  // A SCENE is `{ name: '…', intent:` — the bare `{ name: '…'` form also
  // matched a DevTools media feature (`{ name: 'prefers-reduced-motion', value:`)
  // inside the reduced-motion scene and counted it as a scene with no golden.
  // M297: a scene may carry `reference: [...]` between its name and intent.
  const declared = [...shot.matchAll(/\{ name: '([a-z0-9-]+)', (?:reference: \[[^\]]*\], )?intent:/g)].map((m) => m[1])
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

// M297 — critic.reference.1. Every Orchestrate scene the shot harness
// declares names the reference image it is meant to read as, the file
// exists AND is tracked, the harness reaches the composite helper, and the
// critic brief the ledger rule sends a restyle to is in product-rules.md.
// Why: Phase D's fresh-context critic was handed the previous golden and the
// legibility rules, never the reference, and accepted the loss of the hub,
// the connectors and the station names as "the stated design". A reference
// that is a habit is a reference a fresh context does not have; a reference
// that is an untracked path (docs/design/ was, for two days) is one a clone
// cannot have. Tracked is asked of git's index, not the filesystem, so a
// path that exists only on the author's machine is red here and not on
// their screen. The scene count is pinned here, not in prose.
{
  const { execFileSync } = require('node:child_process')
  const shot = read('scripts/shot.cjs') || ''
  const rules = read('docs/product-rules.md') || ''
  const composite = read('scripts/shot-composite.cjs')
  // Each scene is one object literal starting `{ name: '…', ` and running to
  // the next scene or the end of SCENES; `reference: [...]` must sit inside
  // the orchestration ones. Text, like visual.1, because requiring shot.cjs
  // needs Electron.
  const heads = [...shot.matchAll(/\{ name: '([a-z0-9-]+)', (?:reference: \[([^\]]*)\], )?intent:/g)]
  const orch = heads.filter((m) => m[1].startsWith('orchestration'))
  const refsOf = (m) => (m[2] ? [...m[2].matchAll(/'([^']+)'/g)].map((r) => r[1]) : [])
  let tracked = []
  try { tracked = execFileSync('git', ['ls-files', 'docs/'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean) } catch { tracked = null }
  const problems = []
  for (const m of orch) {
    const refs = refsOf(m)
    if (refs.length === 0) problems.push(`${m[1]}: no reference`)
    for (const r of refs) {
      if (!existsSync(join(ROOT, r))) problems.push(`${m[1]}: ${r} does not exist`)
      else if (tracked && !tracked.includes(r)) problems.push(`${m[1]}: ${r} is not tracked`)
    }
  }
  const brief = /^## The critic and the reference/m.test(rules) && /deliberately (NOT|not) copied/.test(rules) && /vs-reference\.png/.test(rules)
  ok('critic.reference.1 every orchestration* shot scene names a reference PNG that exists and is tracked, the harness writes the composite, and product-rules.md carries the critic brief with its excluded features',
    // Four since M304: the Watch lens is its own Orchestrate scene (orchestration-watch).
    orch.length === 4 && problems.length === 0 && tracked !== null && composite !== null &&
      /require\('\.\/shot-composite\.cjs'\)/.test(shot) && /composeManifest\(OUT, manifest\)/.test(shot) && brief,
    JSON.stringify({ orchestration: orch.map((m) => m[1]), problems, git: tracked !== null, composite: composite !== null, brief }))
}

// M190 — guide.1. THE GUIDE IS CHECKED AS A FILE, and the check is about the
//      two ways a guide goes wrong. It must name the GATEKEEPER step (this
//      build is unsigned, and without the right-click Open a person's first
//      experience is a refusal from macOS with no explanation in it), and
//      every `npm run <script>` it mentions must be one `package.json`
//      actually has — a guide that names a script that does not exist is
//      worse than no guide, because it sends a person to a dead end and makes
//      them doubt the parts that are true.
{
  const guidePath = join(__dirname, '..', 'docs', 'getting-started.md')
  const exists = existsSync(guidePath)
  const guide = exists ? readFileSync(guidePath, 'utf8') : ''
  const pkgScripts = Object.keys(JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).scripts ?? {})
  const named = [...guide.matchAll(/npm run ([a-z:_-]+)/g)].map((m) => m[1])
  const unknown = [...new Set(named)].filter((n) => !pkgScripts.includes(n))
  ok('guide.1 docs/getting-started.md exists, names the Gatekeeper right-click step for this unsigned build, and every npm run script it mentions is one package.json has',
    exists && /right-click/i.test(guide) && /unsigned/i.test(guide) && named.length > 0 && unknown.length === 0,
    JSON.stringify({ exists, named: [...new Set(named)], unknown }))
}

// only.1. TC_ONLY, the filter every migrated suite shares through
// scripts/lib/checks.cjs. Two halves, and the second is the one that matters:
// a filter that matches NOTHING must be red. A typo'd id that silently
// reported 0/0 passed would read as a green gate for a check that never ran —
// the three-state rule, applied to the harness itself. Driven against
// verify:viewport because it is plain node, offline and ~0.3s, and its check
// 27 has lettered neighbours to prove the prefix rule keeps `27b` and drops
// `270`.
{
  const { spawnSync } = require('node:child_process')
  const run = (only) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'verify-viewport.cjs')],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, TC_ONLY: only } })
  const idsOf = (r) => String(r.stdout || '').split('\n')
    .filter((l) => /^(PASS|FAIL) {2}/.test(l)).map((l) => l.slice(6).split(/\s+/)[0])
  const hit = run('27')
  const none = run('no-such-check-id')
  const hitIds = idsOf(hit)
  const noneIds = idsOf(none)
  ok('only.1 TC_ONLY narrows a suite to the ids it names (lettered sub-checks kept, longer numbers not), and a filter matching nothing is RED rather than an empty green',
    hit.status === 0 && hitIds.length >= 1 && hitIds.every((id) => /^27(?![0-9])/.test(id)) &&
      none.status !== 0 && noneIds.length === 0,
    JSON.stringify({ hit: { status: hit.status, ids: hitIds.slice(0, 8) }, none: { status: none.status, ids: noneIds.slice(0, 4) } }))
}

// electron-jobs.1. The Electron tier can run N-wide ONLY when asked to, and
// each job in flight is isolated by the one knob that already isolates
// checkouts (TC_VERIFY_SUFFIX, see scripts/verify-socket.cjs). Pinned through
// the runner's exported pure functions, so the default staying SERIAL is a
// fact checked here and not a comment somebody can outlive. Serial must add
// NOTHING to the child's env — an absent key stays absent, never `undefined`,
// which a spread would write and a child would read as present.
{
  const runner = require(join(ROOT, 'scripts', 'verify-all.cjs'))
  const electron = runner.suites().filter((s) => s.tier === 'electron').map((s) => s.name)
  let pass = false
  let detail
  try {
    const J = (v) => runner.electronJobs(v === undefined ? {} : { TC_VERIFY_ELECTRON_JOBS: v })
    const jobs = { absent: J(), blank: J(''), three: J('3'), zero: J('0'), word: J('lots'), frac: J('2.5') }
    const jobsOk = jobs.absent === 1 && jobs.blank === 1 && jobs.three === 3 && jobs.zero === 1 && jobs.word === 1 && jobs.frac === 1
    const serial = runner.jobEnv('verify:panels:core', { A: '1' }, 1)
    const serialKept = runner.jobEnv('verify:panels:core', { TC_VERIFY_SUFFIX: 'wt2' }, 1)
    const serialOk = !('TC_VERIFY_SUFFIX' in serial) && !('TC_WATCHDOG_SCALE' in serial) && serialKept.TC_VERIFY_SUFFIX === 'wt2'
    const suffixes = electron.map((n) => runner.jobEnv(n, { TC_VERIFY_SUFFIX: 'wt2' }, 3).TC_VERIFY_SUFFIX)
    const distinct = new Set(suffixes).size === suffixes.length
    const keepsOuter = suffixes.every((s) => typeof s === 'string' && s.startsWith('wt2-'))
    const scaled = runner.jobEnv('verify:panels:core', {}, 3).TC_WATCHDOG_SCALE === '3'
    pass = electron.length >= 5 && jobsOk && serialOk && distinct && keepsOuter && scaled
    detail = JSON.stringify({ jobs, serialOk, distinct, keepsOuter, scaled, suffixes })
  } catch (error) {
    detail = String(error)
  }
  ok('electron-jobs.1 the Electron tier is serial unless TC_VERIFY_ELECTRON_JOBS asks otherwise, and every job in flight gets its own suffix and a scaled watchdog',
    pass, detail)
}

// electron-jobs.2 / headroom.2. Source text, because neither fact is observable
// from a serial run: the five panels parts all bundled to ONE out/verify file
// and wrote ONE userData/assets directory (product clears and counts it), so
// two parts in flight race on both with no error and a red check in whichever
// part lost. And headroom.1 is the harness's own drift alarm; deleting it would
// leave every part green right up until a watchdog reads as a hang again.
{
  const harness = stripComments(read(join('scripts', 'panels-harness.cjs')) ?? '')
  const entryScoped = /const ENTRY_OUT = [^\n]*verifySocket\('panels-entry'\)/.test(harness)
  const userDataScoped = /app\.setPath\('userData'/.test(harness)
  ok('electron-jobs.2 a suffixed panels part bundles to its own entry file and keeps its own userData',
    entryScoped && userDataScoped, JSON.stringify({ entryScoped, userDataScoped }))
  ok('headroom.2 the panels harness still asserts headroom.1, the red that arrives before a watchdog reads as a hang',
    /\bok\(\s*`headroom\.1 |\bok\(\s*'headroom\.1 /.test(harness), '')
}

// load-bearing.recovered.1. docs/load-bearing-recovered.md was admitted in M91
// on SYMBOL PRESENCE alone — every code name it cites still existed — and not
// re-verified line by line, which is why it was never merged into the main
// file. That admission test is re-run here, every verify: a code-shaped name in
// backticks (a source file, `Type.member`, a camelCase or snake identifier)
// must still occur in src/, scripts/ or build/. A name that has left the code
// means its entry can no longer be trusted even as a pointer; the fix is to
// delete or re-verify the entry, never to add the name to KNOWN_STALE. That
// list holds the two found when the check was written, named so they are not
// silently absorbed: `verify-panels.cjs` (split into parts) and
// `configStampedAt`. TC_META_RECOVERED points the check at a fixture so it can
// be watched red.
{
  const { readdirSync, statSync } = require('node:fs')
  const KNOWN_STALE = ['verify-panels.cjs', 'scripts/verify-panels.cjs', 'configStampedAt']
  const walk = (d) => readdirSync(d).flatMap((e) => {
    const p = join(d, e)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
  const files = ['src', 'scripts', 'build'].filter((d) => existsSync(join(ROOT, d))).flatMap((d) => walk(join(ROOT, d)))
  const names = new Set(files.map((f) => f.split('/').pop()))
  const hay = files.map((f) => readFileSync(f, 'utf8')).join('\n')
  const text = (process.env.TC_META_RECOVERED ? readFileSync(process.env.TC_META_RECOVERED, 'utf8') : read('docs/load-bearing-recovered.md')) ?? ''
  const cited = [...new Set([...text.matchAll(/`([^`\n]{3,80})`/g)].map((m) => m[1].replace(/\(\)$/, '')))]
    // Code-shaped only: prose in backticks, doc paths, JSON files and paths
    // outside the source tree (out/, origin/…) are not claims about the code.
    .filter((s) => /^[A-Za-z_$][\w$./-]*$/.test(s) && (/[._/]/.test(s) || /[a-z][A-Z]/.test(s)))
    .filter((s) => !/\.(md|json)$/.test(s) && !/^(out|origin|commands|docs)\//.test(s))
  const live = (s) => /\.(tsx?|cjs|js|css)$/.test(s) ? names.has(s.split('/').pop())
    : /^\w+\.\w+$/.test(s) ? s.split('.').every((p) => hay.includes(p)) : hay.includes(s)
  const stale = cited.filter((s) => !live(s) && !KNOWN_STALE.includes(s))
  ok('load-bearing.recovered.1 every code name docs/load-bearing-recovered.md cites still exists in src/, scripts/ or build/',
    cited.length > 100 && stale.length === 0, JSON.stringify({ cited: cited.length, stale }))
}

// ledger.1. CLAUDE.md's table is where a fresh session learns which run is
// live, and it pointed at the M193–M224 ledger for a whole run after
// m225-m243-ledger.md existed — a session following it planned against the
// wrong state, with nothing red. Two runs can be live at once, so the check is
// not "exactly one link" but: the ledger whose range starts highest is linked,
// and no ledger link is broken.
{
  const { readdirSync } = require('node:fs')
  const ledgers = readdirSync(join(ROOT, 'docs', 'build-log'))
    .map((f) => /^m(\d+)-m(\d+)-ledger\.md$/.exec(f)).filter(Boolean)
    .map((m) => ({ file: `docs/build-log/${m[0]}`, start: Number(m[1]) }))
    .sort((a, b) => b.start - a.start)
  const claudeMd = read('CLAUDE.md') ?? ''
  const linked = [...claudeMd.matchAll(/\]\((docs\/build-log\/[^)\s]+-ledger\.md)\)/g)].map((m) => m[1])
  const broken = linked.filter((p) => !existsSync(join(ROOT, p)))
  const newest = ledgers[0]
  ok('ledger.1 CLAUDE.md links the newest run ledger, and every ledger it links exists',
    Boolean(newest) && linked.includes(newest.file) && broken.length === 0,
    JSON.stringify({ newest: newest && newest.file, linked, broken }))
}

// lb.1 / lb.2. `npm run lb` (scripts/lb.cjs) is how CLAUDE.md now says to
// search the load-bearing files. A parse that silently orphans text shrinks
// every search with no error — an unmatched ``` did that to all of
// load-bearing.md — so every line after the preamble must land in an entry,
// and a module the files are known to cite must come back named in a lead.
{
  const lb = require('./lb.cjs')
  const per = lb.FILES.map((f) => {
    const text = read(f) ?? ''
    const lost = lb.unowned(text, f)
    return { f, entries: lb.parseEntries(text, f).entries.length, lost: lost.length, first: lost.slice(0, 5) }
  })
  ok('lb.1 both load-bearing files parse into entries, and no line after a preamble belongs to none',
    per.every((p) => p.entries >= 150 && p.lost === 0), JSON.stringify(per))
  const hits = lb.search(lb.loadAll(), ['pty-manager'])
  ok('lb.2 a module the load-bearing files cite comes back as entries naming it in the lead',
    hits.some((h) => h.inLead), `${hits.length} entries`)
}

// affected.1 / affected.2. `npm run affected` derives each suite's sources
// (script -> entries -> the src import graph) instead of reading a table. Its
// failure is silent in the WORST direction — a suite it cannot see is never
// selected, and the narrowed run is green for a change it never tested. So:
// every suite resolves to something beyond its own script and the shared
// ok(), except a named exemption that must itself still resolve to nothing
// (so the sentence explaining it can never describe a suite that changed);
// and three known answers, including the three-state one.
{
  const affected = require('./affected.cjs')
  const runnerMod = require('./verify-all.cjs')
  // verify:pty drives node-pty from node_modules; it imports no module of ours.
  const NO_REPO_SOURCES = ['verify:pty']
  const blind = []
  const staleExempt = []
  for (const s of runnerMod.suites()) {
    const { files, dirs } = affected.sourcesOf(s.body)
    const own = [...files].filter((f) => !/^scripts\/(verify-[\w.-]+|lib\/checks)\.cjs$/.test(f))
    const sees = own.length + dirs.size > 0
    if (NO_REPO_SOURCES.includes(s.name)) { if (sees) staleExempt.push(s.name) } else if (!sees) blind.push(s.name)
  }
  ok('affected.1 every verify suite resolves to a repository source beyond its own script, and the exemption still resolves to none',
    blind.length === 0 && staleExempt.length === 0, JSON.stringify({ blind, staleExempt }))
  const pick = (files) => affected.select(files).picked.map((p) => p.suite.name)
  const vp = pick(['src/renderer/canvas/viewport.ts'])
  const lib = pick(['scripts/lib/checks.cjs'])
  const users = runnerMod.suites().filter((s) => affected.sourcesOf(s.body).files.has('scripts/lib/checks.cjs')).length
  const none = affected.select(['docs/no-such-file.md'])
  ok('affected.2 a canvas module selects its suite and the build consumers but no main-process-only suite; the shared ok() selects every suite requiring it; an unread file is UNMAPPED',
    vp.includes('verify:viewport') && vp.includes('verify:panels:core') && !vp.includes('verify:jira') &&
      users >= 30 && lib.length === users && none.picked.length === 0 && none.unmapped.length === 1,
    JSON.stringify({ viewport: vp, lib: lib.length, users, unmapped: none.unmapped }))
}

// affected.glb.1. A model under src/renderer/public is bytes, not a text read, so
// a changed .glb must not ride in on a suite that walks the whole directory — and
// is reported UNMAPPED rather than silently covered.
{
  const affected = require('./affected.cjs')
  const glb = affected.select(['src/renderer/public/models/some-model.glb'])
  const css = affected.select(['src/renderer/styles.css'])
  ok('affected.glb.1 a changed .glb selects no suite and is UNMAPPED, while a changed stylesheet in the same tree still selects the suites that walk it',
    glb.picked.length === 0 && glb.unmapped.length === 1 && css.picked.some((p) => p.suite.name === 'verify:styles'),
    JSON.stringify({ glb: glb.picked.map((p) => p.suite.name), unmapped: glb.unmapped }))
}

const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
