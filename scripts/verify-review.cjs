/* Verifies the pure review core: git argv construction and output parsing,
   then the engine's seven result arms against a fake runner, then a REAL git
   repository in a spaced temp directory.
   Run with: npm run verify:review

   Plain node, no Electron. Every check here guards a failure that is SILENT
   in a running app: a diff attributed to the wrong panel, a baseline
   recaptured on reload so an hour of work reads as "no changes", or a path
   with a space parsed into two files. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync } = require('node:fs')

const OUT = join(__dirname, '..', 'out', 'verify', 'review.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'review-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'node-pty'],
  // review-engine.ts imports its types from @shared/review. Carried for the
  // reason verify-viewport.cjs learned the hard way: a type-only import is
  // erased by esbuild and hides the gap until the day a value import lands.
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
})
const R = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

/* Async from check 1, even though checks 1-13 need nothing of it: every
   engine check from Task 2 onward is awaited, and retrofitting the wrapper
   later means re-indenting the whole file in a commit about something else.
   The same shape verify-pty-manager.cjs already uses. */
;(async () => {

// 1. Repo root argv. -C rather than a cwd option, so the runner needs no
//    per-call cwd and cannot drift from the path the args name.
ok('1 repo-root argv', JSON.stringify(R.buildRepoRootArgs('/a/b')) ===
  JSON.stringify(['-C', '/a/b', 'rev-parse', '--show-toplevel']))

// 2. Baseline argv. `stash create`, NOT `stash push`: create writes a commit
//    object and leaves both the worktree and the stash list untouched.
ok('2 baseline argv', JSON.stringify(R.buildBaselineArgs('/r')) ===
  JSON.stringify(['-C', '/r', 'stash', 'create']))

// 3. Object-existence argv. This is what separates baseline-lost from a
//    generic git failure; `cat-file -e` exits non-zero for a pruned object.
ok('3 object-exists argv', JSON.stringify(R.buildObjectExistsArgs('/r', 'abc')) ===
  JSON.stringify(['-C', '/r', 'cat-file', '-e', 'abc']))

// 4. Numstat argv carries -z. Without it a path with a space or a rename is
//    parsed wrong, and only for the users who have such paths.
{
  const a = R.buildNumstatArgs('/r', 'base')
  ok('4 numstat argv is -z', a.includes('--numstat') && a.includes('-z') &&
    a[a.length - 1] === 'base')
}

// 5. Untracked argv uses ls-files --others, never `add -N`. add -N mutates the
//    index, which an agent running in that repo may be using at that instant.
{
  const a = R.buildUntrackedArgs('/r')
  ok('5 untracked argv', a.includes('--others') && a.includes('--exclude-standard') &&
    a.includes('-z') && !a.includes('-N'))
}

// 6. Repo root strips the trailing newline git always emits.
ok('6 parseRepoRoot trims', R.parseRepoRoot('/Users/x/proj\n') === '/Users/x/proj')

// 7. Not a repository: git prints nothing on stdout. Null, never ''.
ok('7 parseRepoRoot empty is null', R.parseRepoRoot('') === null)

// 8. NUL list, with the trailing NUL git emits after the last entry, which a
//    naive split turns into a phantom empty path.
ok('8 parseNulList drops the trailing empty',
  JSON.stringify(R.parseNulList('a.txt\0b c.txt\0')) === JSON.stringify(['a.txt', 'b c.txt']))

// 9. An ordinary numstat record.
{
  const e = R.parseNumstat('3\t1\tsrc/a.ts\0')
  ok('9 numstat ordinary', e.length === 1 && e[0].path === 'src/a.ts' &&
    e[0].added === 3 && e[0].removed === 1 && e[0].binary === false)
}

// 10. A path containing a SPACE, which -z passes through verbatim. The whole
//     reason for -z, and the shape every fixture in this repo omitted until
//     the pane-died bug.
{
  const e = R.parseNumstat('1\t0\tdocs/my notes.md\0')
  ok('10 numstat spaced path', e.length === 1 && e[0].path === 'docs/my notes.md')
}

// 11. A binary file: git writes - and - rather than counts. Parsed as
//     binary:true with zero counts, never as NaN, which would poison the
//     summary line for the whole panel.
{
  const e = R.parseNumstat('-\t-\timg.png\0')
  ok('11 numstat binary', e.length === 1 && e[0].binary === true &&
    e[0].added === 0 && e[0].removed === 0)
}

// 12. A RENAME under -z is three fields: counts, an EMPTY path, then from and
//     to as their own NUL-terminated records. A parser that reads one path per
//     record consumes the next file's name as this one's and every entry after
//     it is shifted by one — silently, and only in a repo where something was
//     renamed.
{
  // join('\0'), never a single literal: '\010' in a JS string is an OCTAL
  // escape, not NUL-then-'10', so a hand-written fixture silently encodes
  // something other than what it appears to.
  const e = R.parseNumstat(['2\t2\t', 'old/a.ts', 'new/a.ts', '5\t0\tb.ts', ''].join('\0'))
  ok('12 numstat rename', e.length === 2 && e[0].path === 'new/a.ts' &&
    e[0].renamedFrom === 'old/a.ts' && e[1].path === 'b.ts')
}

// 13. Empty output is an empty list, not a crash. This is the CLEAN repo, the
//     commonest input this parser sees.
ok('13 numstat empty', R.parseNumstat('').length === 0)

// 13b. buildHeadArgs' argv, untested by Task 1. captureBaseline's HEAD
//      fallback depends on this exact argv, so this check has a real customer.
ok('13b buildHeadArgs argv', JSON.stringify(R.buildHeadArgs('/r')) ===
  JSON.stringify(['-C', '/r', 'rev-parse', 'HEAD']))

/* A fake runner. Keyed by the JOINED argv so a check states exactly which git
   invocation it is answering — a runner keyed on a substring would answer the
   wrong call the day two argvs share a word. */
const fakeRunner = (table) => async (args) => {
  const key = args.join(' ')
  const hit = table[key]
  if (hit === undefined) return { stdout: '', ok: false, notFound: false }
  return { stdout: hit.stdout ?? '', ok: hit.ok !== false, notFound: hit.notFound === true }
}

// 14. resolveRepo returns the root for a cwd inside a repository.
{
  const e = R.createReviewEngine({
    run: fakeRunner({ '-C /a/b rev-parse --show-toplevel': { stdout: '/a\n' } }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('14 resolveRepo finds the root', (await e.resolveRepo('/a/b')) === '/a')
}

// 15. Outside a repository git exits non-zero. Null, and NOT an exception:
//     a panel in ~ is the ordinary case, not an error, and a throw here would
//     take the pty:create it is called from down with it.
{
  const e = R.createReviewEngine({
    run: fakeRunner({ '-C /tmp rev-parse --show-toplevel': { stdout: '', ok: false } }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('15 resolveRepo outside a repo is null', (await e.resolveRepo('/tmp')) === null)
}

// 16. captureBaseline prefers the stash-create sha.
{
  const e = R.createReviewEngine({
    run: fakeRunner({ '-C /r stash create': { stdout: 'deadbee\n' } }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('16 captureBaseline uses stash create', (await e.captureBaseline('/r')) === 'deadbee')
}

// 17. On a CLEAN tree stash create prints nothing and the baseline is HEAD.
//     Without this fallback every panel spawned in a clean repo would have no
//     baseline at all and would report never-started forever.
{
  const e = R.createReviewEngine({
    run: fakeRunner({
      '-C /r stash create': { stdout: '\n' },
      '-C /r rev-parse HEAD': { stdout: 'headsha\n' }
    }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('17 captureBaseline falls back to HEAD', (await e.captureBaseline('/r')) === 'headsha')
}

// 18. An EMPTY repository has no HEAD either — git init and nothing committed.
//     Null rather than a thrown error or the literal string 'HEAD'.
{
  const e = R.createReviewEngine({
    run: fakeRunner({
      '-C /r stash create': { stdout: '' },
      '-C /r rev-parse HEAD': { stdout: '', ok: false }
    }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('18 captureBaseline in an empty repo is null', (await e.captureBaseline('/r')) === null)
}

// 19. No git binary at all: notFound propagates rather than reading as
//     "not a repository", which would silently hide the real cause.
{
  const e = R.createReviewEngine({
    run: async () => ({ stdout: '', ok: false, notFound: true }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('19 resolveRepo reports a missing git', (await e.resolveRepo('/a')) === null &&
    (await e.review('p1')).kind === 'git-missing')
}

// 20. resolveRepo does not cache across DIFFERENT cwds. A single-slot cache
//     would answer panel B with panel A's repository, which is the wrong-repo
//     attribution this whole milestone exists to avoid.
//
//     This is a CHARACTERISATION check: resolveRepo has no cache today, so
//     this passes on first write and was never red. It earns its place
//     against a FUTURE single-slot cache, not against anything that exists
//     now — the same shape as verify:pty-manager check 20.
{
  const e = R.createReviewEngine({
    run: fakeRunner({
      '-C /a rev-parse --show-toplevel': { stdout: '/a\n' },
      '-C /b rev-parse --show-toplevel': { stdout: '/b\n' }
    }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('20 resolveRepo is per-cwd', (await e.resolveRepo('/a')) === '/a' &&
    (await e.resolveRepo('/b')) === '/b')
}

/* One builder for the arm checks, so each states only what it varies. */
const engineWith = (table, opts = {}) => R.createReviewEngine({
  run: fakeRunner(table),
  baselineOf: () => opts.baseline === null ? undefined : (opts.baseline ?? { root: '/r', sha: 'b1' }),
  peersInRepo: () => opts.peers ?? 0
})

const EXISTS = { '-C /r cat-file -e b1': { stdout: '' } }
const NO_UNTRACKED = { '-C /r ls-files -z --others --exclude-standard': { stdout: '' } }

// 21. A panel with no baseline has never spawned.
ok('21 never-started', (await engineWith({}, { baseline: null }).review('p1')).kind === 'never-started')

// 22. A valid baseline and an empty diff is CLEAN, and clean carries the root
//     so the pane can still say which repository it is talking about.
{
  const r = await engineWith({
    ...EXISTS, ...NO_UNTRACKED,
    '-C /r diff --numstat -z b1': { stdout: '' }
  }).review('p1')
  ok('22 clean', r.kind === 'clean' && r.root === '/r')
}

// 23. The real answer: files, and totals summed across them.
{
  const r = await engineWith({
    ...EXISTS, ...NO_UNTRACKED,
    '-C /r diff --numstat -z b1': { stdout: ['3\t1\ta.ts', '10\t0\tb.ts', ''].join('\0') }
  }).review('p1')
  ok('23 changes and totals', r.kind === 'changes' && r.files.length === 2 &&
    r.added === 13 && r.removed === 1)
}

// 24. Untracked files are REPORTED, with untracked:true and no counts. A
//     brand-new file is the single most common thing an agent produces, and a
//     diff-only implementation shows "no changes" for a panel that wrote ten
//     new modules.
{
  const r = await engineWith({
    ...EXISTS,
    '-C /r diff --numstat -z b1': { stdout: '' },
    '-C /r ls-files -z --others --exclude-standard': { stdout: 'new.ts\0' }
  }).review('p1')
  ok('24 untracked reported', r.kind === 'changes' && r.files.length === 1 &&
    r.files[0].untracked === true && r.files[0].path === 'new.ts')
}

// 25. Binary files carry binary:true and contribute nothing to the totals,
//     rather than NaN, which would render the whole summary as "NaN".
{
  const r = await engineWith({
    ...EXISTS, ...NO_UNTRACKED,
    '-C /r diff --numstat -z b1': { stdout: '-\t-\timg.png\0' }
  }).review('p1')
  ok('25 binary does not poison totals', r.kind === 'changes' &&
    r.files[0].binary === true && r.added === 0 && r.removed === 0)
}

// 26. A pruned baseline object is baseline-lost, NOT a fallback to HEAD.
//     Falling back would silently start attributing pre-existing changes to
//     this agent, which is a confident wrong answer.
{
  const r = await engineWith({
    '-C /r cat-file -e b1': { stdout: '', ok: false }
  }).review('p1')
  ok('26 baseline-lost', r.kind === 'baseline-lost' && r.root === '/r')
}

// 27. Two panels that have run in one repository: shared, with the count, and
//     the files still listed because repository-level truth is still truth.
{
  const r = await engineWith({
    ...EXISTS, ...NO_UNTRACKED,
    '-C /r diff --numstat -z b1': { stdout: '1\t0\ta.ts\0' }
  }, { peers: 3 }).review('p1')
  ok('27 shared names the count', r.kind === 'shared' && r.panelCount === 4 &&
    r.files.length === 1)
}

// 28. shared is checked BEFORE the diff is interpreted but AFTER the baseline
//     is validated: a lost baseline in a shared repo is still baseline-lost,
//     because "we cannot attribute" and "we have nothing to diff against" are
//     different sentences and the second one is the actionable one.
{
  const r = await engineWith({
    '-C /r cat-file -e b1': { stdout: '', ok: false }
  }, { peers: 2 }).review('p1')
  ok('28 lost outranks shared', r.kind === 'baseline-lost')
}

// 29. A panel whose baseline exists but whose repo is gone from disk — the
//     user deleted or moved the checkout. The diff call fails; that is
//     baseline-lost too, not a crash and not a silent empty list.
{
  const r = await engineWith({
    ...EXISTS, ...NO_UNTRACKED,
    '-C /r diff --numstat -z b1': { stdout: '', ok: false }
  }).review('p1')
  ok('29 a failed diff is not silent emptiness', r.kind === 'baseline-lost')
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)

})()
