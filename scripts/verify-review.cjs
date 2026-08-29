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
  if (hit === undefined) return { stdout: '', ok: false, notFound: false, code: -1, stderr: '' }
  const ok = hit.ok !== false
  return {
    stdout: hit.stdout ?? '',
    ok,
    notFound: hit.notFound === true,
    code: hit.code ?? (ok ? 0 : -1),
    stderr: hit.stderr ?? ''
  }
}

// 14. resolveRepo returns the root for a cwd inside a repository.
{
  const e = R.createReviewEngine({
    run: fakeRunner({ '-C /a/b rev-parse --show-toplevel': { stdout: '/a\n' } }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  const answer = await e.resolveRepo('/a/b')
  ok('14 resolveRepo finds the root', answer.kind === 'root' && answer.root === '/a')
}

// 15. Outside a repository git exits non-zero, saying so on stderr with its
//     own "fatal:" status. not-a-repo, and NOT an exception: a panel in ~ is
//     the ordinary case, not an error, and a throw here would take the
//     pty:create it is called from down with it.
{
  const e = R.createReviewEngine({
    run: fakeRunner({
      '-C /tmp rev-parse --show-toplevel': {
        ok: false,
        code: 128,
        stderr: 'fatal: not a git repository (or any of the parent directories): .git\n'
      }
    }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('15 resolveRepo outside a repo is not-a-repo', (await e.resolveRepo('/tmp')).kind === 'not-a-repo')
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

// 16b. A FAILED `stash create` is not a clean tree, and must NOT fall through
//      to HEAD. `stash create` needs the index lock and refuses outright
//      during an unresolved merge or against a corrupt index — both reachable
//      in this app specifically, where a panel spawns into a repository other
//      panels' agents are running git in constantly. A HEAD baseline taken
//      there permanently attributes every pre-existing uncommitted change in
//      the working tree to this agent, for the whole life of the panel id,
//      because the baseline is persisted and never recaptured within a run.
//      That is the spec's named worst option. No baseline at all is the
//      honest answer: the panel reports never-started until its next spawn.
//
//      The fake defaults `ok` to true (`ok: hit.ok !== false`), which is why
//      no pre-existing check drives this branch — 17 and 18 both exercise a
//      SUCCESSFUL stash create, so the bug and its fix are indistinguishable
//      to them. Check 17 is this check's companion in the other direction:
//      without it a fix could over-correct into refusing the clean tree too.
{
  const e = R.createReviewEngine({
    run: fakeRunner({
      '-C /r stash create': { ok: false },
      '-C /r rev-parse HEAD': { stdout: 'headsha\n' }
    }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('16b a FAILED stash create stores no baseline', (await e.captureBaseline('/r')) === null)
}

// 17. On a CLEAN tree stash create prints nothing and the baseline is HEAD.
//     Without this fallback every panel spawned in a clean repo would have no
//     baseline at all and would report never-started forever. The companion
//     to 16b: this is the direction a fix for a failed stash create can
//     over-correct and break, since both inputs produce no sha.
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
    run: async () => ({ stdout: '', ok: false, notFound: true, code: -1, stderr: '' }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('19 resolveRepo reports a missing git', (await e.resolveRepo('/a')).kind === 'unreadable' &&
    (await e.review('p1')).kind === 'git-missing')
}

// 19b. The runner refuses to spawn when git could not be resolved on the
//      LOGIN PATH, and says so as `notFound` — the same fact an ENOENT would
//      have produced, reached before a process is ever launched.
//
//      This is the production reachability of `git-missing`, and until this
//      fix it did not exist: the runner spawned the bare name `git` against
//      whatever PATH launchd handed the app, which on macOS is a bare one
//      with no /opt/homebrew/bin on it — the exact defect shell-env.ts and
//      tmux-probe.ts exist to prevent, and which main/index.ts already
//      resolved correctly for its startup diagnostic and then threw away.
//      On such a machine `git-missing` never fired at all; the section
//      silently rendered nothing instead, which is the ordinary
//      `not-a-repo` shape and therefore invisible as a bug.
{
  const runner = R.createGitRunner({ gitPath: () => null, env: () => ({}) })
  const r = await runner(['--version'])
  ok('19b an unresolved git is notFound, without spawning',
    r.notFound === true && r.ok === false && r.stdout === '',
    JSON.stringify(r))
}

// 19c. A hung git does not hold the promise open forever. `index.lock`
//      contention, a credential prompt on a private remote, or a stalled
//      network filesystem all block indefinitely, and the review path is
//      fire-and-forget on capture and an un-replied invoke on read — neither
//      has anyone to time it out. The production ceiling is
//      GIT_TIMEOUT_MS; this drives a deliberately tiny one against a
//      genuinely hanging process, because the real value cannot be waited
//      out in a suite. A timeout reads as ok:false, i.e. baseline-lost,
//      which is the honest "cannot be read" answer rather than a confident
//      empty diff.
{
  const runner = R.createGitRunner({
    gitPath: () => '/bin/sleep',
    env: () => ({}),
    timeoutMs: () => 100
  })
  const started = Date.now()
  const r = await runner(['30'])
  const elapsed = Date.now() - started
  // The LOWER bound is the half that discriminates. Before this fix the
  // runner ignored its deps entirely and spawned the bare name `git` with
  // these args, which exits in milliseconds — so `ok === false` alone was
  // satisfied by a runner with no timeout at all, and 19c was green against
  // the very defect it exists to catch. The upper bound is what proves the
  // process did not simply run to completion.
  ok('19c a hung git is timed out rather than pending forever',
    r.ok === false && r.notFound === false && elapsed >= 90 && elapsed < 5000,
    `${JSON.stringify(r)} after ${elapsed}ms`)
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
  const a = await e.resolveRepo('/a')
  const b = await e.resolveRepo('/b')
  ok('20 resolveRepo is per-cwd', a.kind === 'root' && a.root === '/a' &&
    b.kind === 'root' && b.root === '/b')
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

// 27b. A repository where nothing has changed is unambiguously clean, however
//      many panels share it — there is nothing to fail to attribute, so the
//      honest arms exist to explain a real ambiguity, not to decorate an
//      empty result. This is the ONLY check that separates the two possible
//      orderings of the clean/shared branches: 22 has no peers, and 27 has
//      files, so neither can fail against a `shared`-before-`clean`
//      implementation the way this one does.
{
  const r = await engineWith({
    ...EXISTS, ...NO_UNTRACKED,
    '-C /r diff --numstat -z b1': { stdout: '' }
  }, { peers: 3 }).review('p1')
  ok('27b clean outranks shared when nothing changed', r.kind === 'clean')
}

// 28. shared is checked AFTER the baseline is validated AND after both reads
//     that build the file list have already succeeded: a lost baseline in a
//     shared repo is still baseline-lost, because "we cannot attribute" and
//     "we have nothing to diff against" are different sentences and the
//     second one is the actionable one.
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

// 29b. Check 29's rule, applied to the SECOND read: the numstat call can
//      succeed while the ls-files call fails a moment later, because a
//      repository can vanish between them. Treating that failure like a
//      successful empty list would report "no changes" for an agent that
//      just created files — the same confident wrong answer 29 forbids one
//      call earlier, reached through the other read.
{
  const r = await engineWith({
    ...EXISTS,
    '-C /r diff --numstat -z b1': { stdout: '' },
    '-C /r ls-files -z --others --exclude-standard': { stdout: '', ok: false }
  }).review('p1')
  ok('29b a failed ls-files is not silent emptiness', r.kind === 'baseline-lost')
}

/* The real-git block. Pure parsers can be perfectly correct while the actual
   invocation is wrong, and this is the only thing in the repo that can see it.

   The temp directory contains a SPACE on purpose. Production baselines are
   taken in whatever directory a user keeps code in, and this repo has already
   shipped one total, silent failure from a space-free fixture. */
const { execFileSync } = require('node:child_process')
const { mkdtempSync, writeFileSync, appendFileSync } = require('node:fs')
const { tmpdir } = require('node:os')

let GIT = true
try { execFileSync('git', ['--version'], { stdio: 'ignore' }) } catch { GIT = false }

if (!GIT) {
  console.log('SKIP  30-34 — no git binary found (loudly, not silently)')
} else {
  const repo = mkdtempSync(join(tmpdir(), 'tc review '))
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 'verify@example.com')
  git('config', 'user.name', 'verify')
  writeFileSync(join(repo, 'a.txt'), 'base\n')
  git('add', '-A')
  git('commit', '-qm', 'init')
  // Dirt that exists BEFORE the panel spawns. The agent must not be blamed
  // for it, and this is the only check that can prove it is not.
  appendFileSync(join(repo, 'a.txt'), 'pre-existing\n')

  const engine = (() => {
    let baseline
    // Plain node, with the developer's own PATH: `git` by name is the right
    // resolution here, and this suite is not the launchd-PATH case 19b covers.
    const runner = R.createGitRunner({ gitPath: () => 'git', env: () => process.env })
    const e = R.createReviewEngine({
      run: runner,
      baselineOf: () => baseline,
      peersInRepo: () => 0
    })
    return { e, set: (b) => { baseline = b }, runner }
  })()

  // 30. resolveRepo against a real repository in a spaced path.
  const repoAnswer = await engine.e.resolveRepo(repo)
  ok('30 real resolveRepo', repoAnswer.kind === 'root' && repoAnswer.root.endsWith(repo.split('/').pop()))
  const root = repoAnswer.root

  // 31. stash create leaves the worktree and the stash list ALONE. If this
  //     ever fails, the app is stashing a working agent's edits out from
  //     under it, which is the worst thing in this milestone.
  const sha = await engine.e.captureBaseline(root)
  ok('31 baseline does not disturb the tree',
    typeof sha === 'string' && sha.length > 0 &&
    git('stash', 'list').trim() === '' &&
    require('node:fs').readFileSync(join(repo, 'a.txt'), 'utf8') === 'base\npre-existing\n')

  engine.set({ root, sha })

  // 32. The agent's edits, and ONLY the agent's edits. a.txt must report ONE
  //     added line, not two: the pre-existing dirty line was in the baseline.
  appendFileSync(join(repo, 'a.txt'), 'agent\n')
  writeFileSync(join(repo, 'new file.txt'), 'made by the agent\n')
  const r = await engine.e.review('p1')
  const a = r.files && r.files.find((f) => f.path === 'a.txt')
  ok('32 pre-existing dirt is excluded', r.kind === 'changes' && a && a.added === 1)

  // 33. The untracked file — with a SPACE in its name — is reported.
  ok('33 untracked spaced file reported',
    r.kind === 'changes' && r.files.some((f) => f.path === 'new file.txt' && f.untracked))

  // 34. A pruned baseline really does produce baseline-lost against real git,
  //     not merely against the fake. gc --prune=now is what a user's own
  //     maintenance run does.
  git('gc', '--prune=now', '-q')
  const lost = await engine.e.review('p1')
  ok('34 real gc produces baseline-lost', lost.kind === 'baseline-lost')

  // The fixture repository is not free: one per run accumulated in $TMPDIR
  // for the life of the machine. Best-effort — a failure to clean up must
  // never turn a green suite red.
  try { require('node:fs').rmSync(repo, { recursive: true, force: true }) } catch { /* best effort */ }
}

/* A tick-flushing helper: createBaselineCapture's write sits behind TWO
   awaited promises (resolveRepo, then captureBaseline), so a single
   setImmediate is not enough to observe the write settle. Looping a handful
   of macrotasks is cheaper and more honest than a fixed sleep — the fixture
   below resolves its fakes synchronously, so there is no real I/O latency to
   wait out, only the promise chain's own hops. */
const flush = async (times = 5) => {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0))
}

// 35. Finding 1 (task-6 review): an in-flight capture must not write after
//     its panel is killed. Create a panel, close it faster than the
//     underlying git calls resolve, and the fire-and-forget closure was
//     resolving AFTER the kill and writing a baseline for a dead panel id —
//     reachable, not hypothetical, because onReset() always mints the SAME
//     recycled id (FIRST_RUN_ID), so the next panel to take that id would
//     inherit a stranger's baseline and report "no changes" for a
//     repository its own agent rewrote. drop() must poison the in-flight
//     capture so its write never lands.
{
  let releaseResolveRepo
  const baselines = new Map()
  const bc = R.createBaselineCapture({
    baselineOf: (id) => baselines.get(id),
    setBaseline: (id, b) => baselines.set(id, b),
    // Deliberately slow and controlled by hand: capture() must have started
    // and returned (fire-and-forget) BEFORE drop() runs, so this promise
    // stays pending until the test releases it — exactly the window a real
    // git subprocess occupies between spawn and exit.
    resolveRepo: () => new Promise((res) => { releaseResolveRepo = res }),
    captureBaseline: async () => 'deadbeef'
  })
  bc.capture('p1', '/repo')
  bc.drop('p1') // the kill, arriving before resolveRepo has even settled
  releaseResolveRepo({ kind: 'root', root: '/repo' })
  await flush()
  ok('35 a killed panel drops its in-flight capture', baselines.get('p1') === undefined,
    `baselines=${JSON.stringify([...baselines])}`)
}

// 35b. The companion positive: a capture with NO kill in between still
// writes. 35 alone would also pass against a guard that poisoned every
// capture unconditionally — a `drop` that always won regardless of timing —
// which would silently disable the feature this whole milestone exists to
// ship. This is the check that would catch it.
{
  const baselines = new Map()
  const bc = R.createBaselineCapture({
    baselineOf: (id) => baselines.get(id),
    setBaseline: (id, b) => baselines.set(id, b),
    resolveRepo: async () => ({ kind: 'root', root: '/repo' }),
    captureBaseline: async () => 'deadbeef'
  })
  bc.capture('p1', '/repo')
  await flush()
  ok('35b an un-killed capture still writes', JSON.stringify(baselines.get('p1')) ===
    JSON.stringify({ root: '/repo', sha: 'deadbeef' }))
}

// 36. baselineOf alone cannot tell "spawned into a non-repo directory" apart
//     from "never spawned" — a non-repo capture finds nothing to store, so
//     baselineOf stays undefined FOREVER either way. notARepo is the second
//     fact the engine needs to answer correctly, and this pins that a real
//     capture()-then-review() round trip (not a hand-set stub) produces it:
//     a panel whose capture resolved no repository reports not-a-repo, not
//     never-started, which is the ordinary case for most panels per
//     review.ts's own comment on that arm.
{
  const baselines = new Map()
  const bc = R.createBaselineCapture({
    baselineOf: (id) => baselines.get(id),
    setBaseline: (id, b) => baselines.set(id, b),
    resolveRepo: async () => ({ kind: 'not-a-repo' }),
    captureBaseline: async () => 'unreached'
  })
  bc.capture('p1', '/home/nobody')
  await flush()
  const e = R.createReviewEngine({
    run: async () => ({ stdout: '', ok: true, notFound: false }),
    baselineOf: (id) => baselines.get(id),
    peersInRepo: () => 0,
    notARepo: (id) => bc.isNotARepo(id)
  })
  ok('36 a capture that found no repository reports not-a-repo', (await e.review('p1')).kind === 'not-a-repo')
}

// 36b. The companion negative, and the one that guards the OPTIONAL default:
//      every fixture in this file built before this task constructs an
//      engine with no notARepo dep at all (checks 19-34 above), and every
//      one of them must keep reading never-started exactly as before — a
//      dep that silently changed their meaning would be indistinguishable
//      from a passing suite that stopped testing what its title says. It
//      also covers a genuinely never-spawned panel (no capture call at all,
//      so isNotARepo is false too), which is the ordinary "no session yet"
//      case check 21 already pins with a hand-set baselineOf.
ok('36b a panel with no baseline and no notARepo dep is still never-started',
  (await R.createReviewEngine({
    run: async () => ({ stdout: '', ok: true, notFound: false }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  }).review('p1')).kind === 'never-started')

// 37. A baseline outlives the SESSION it describes, and that is only correct
//     for as long as the session is still there. Quitting the app runs
//     shutdown() — kill-server on the private socket — so at the next launch
//     nothing survives and every panel spawns a genuinely new agent; the
//     persisted baseline is then a snapshot from a previous day, and every
//     edit the user made by hand in between is attributed to that agent. The
//     in-memory guard (PtyManager's capturedBaselineIds) is the one that
//     covers Cmd+R WITHIN a run, where the sessions really do survive and
//     recapture really would be wrong — that half must not be weakened, and
//     is untouched: this drop runs once at startup, in a fresh main process
//     whose in-memory set is empty by construction.
//
//     `staleBaselineIds` is the pure half of that, so main/index.ts can wire
//     it to knowledge it ALREADY has — ptyManager.list() asks the backend and
//     therefore reports sessions this run never spawned — rather than
//     inventing a probe.
//
//     Guarded on `typeof` rather than calling it bare: before the export
//     exists a bare call THROWS, which aborts the whole run and takes 37b's
//     RED down with it (CLAUDE.md's rule, and the same reason verify:layout
//     98 is written the way it is).
ok('37 baselines whose session did not survive are stale',
  typeof R.staleBaselineIds === 'function' &&
    JSON.stringify(R.staleBaselineIds(['p1', 'p2', 'p3'], ['p2'])) ===
      JSON.stringify(['p1', 'p3']))

// 37b. The companion that stops it over-correcting: a session that DID
//      survive keeps its baseline. A drop-everything implementation satisfies
//      37 perfectly and silently deletes the baseline of every panel whose
//      tmux session outlived a crash — recapturing against a tree the agent
//      has already rewritten, which reports "no changes" for an hour of work.
//      That is the single failure this milestone turns on, so both directions
//      are pinned rather than one.
ok('37b a surviving session keeps its baseline',
  typeof R.staleBaselineIds === 'function' &&
    R.staleBaselineIds(['p1', 'p2'], ['p1', 'p2']).length === 0)

const gitOk = (stdout) => ({ stdout, ok: true, notFound: false, code: 0, stderr: '' })
const gitFail = (code, stderr) => ({ stdout: '', ok: false, notFound: false, code, stderr })

// 38. The ordinary "this is not a repository" answer, which must stay
//     exactly what it was: git exits 128 and says so on stderr. This arm is
//     the answer for a panel in the home directory — i.e. most panels — and
//     turning it into an error would put a red field on nearly every panel.
{
  const engine = R.createReviewEngine({
    run: async () => gitFail(128, 'fatal: not a git repository (or any of the parent directories): .git\n'),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  const answer = await engine.resolveRepo('/home/u')
  ok('38 exit 128 + "not a git repository" is not-a-repo', answer.kind === 'not-a-repo')
}

// 39. THE CASE THIS TASK EXISTS FOR. The Command Line Tools stub exits 1 and
//     prints its own error; git's own fatals exit 128. Anything that is not
//     the 128-and-says-so pair is a repository git DECLINED to open, and the
//     detail is carried so the user is told which. Conflating it with 38 is
//     what M9a shipped, and it renders as nothing at all on screen.
{
  const engine = R.createReviewEngine({
    run: async () => gitFail(1, 'xcrun: error: invalid active developer path\n'),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  const answer = await engine.resolveRepo('/home/u/proj')
  ok('39 a non-128 git failure is unreadable, with a detail',
    answer.kind === 'unreadable' && answer.detail.includes('xcrun'))
}

// 40. The three-way split at the panel level, asserted in ONE check because
//     each pair is individually satisfiable by the wrong implementation:
//     "no baseline" alone is never-started, "no baseline + not a repo" is
//     not-a-repo, and "no baseline + git refused" is now its own arm. An
//     implementation that folded the third into either of the first two
//     passes any two of these three clauses.
{
  const mk = (extra) => R.createReviewEngine({
    run: async () => gitOk(''),
    baselineOf: () => undefined,
    peersInRepo: () => 0,
    ...extra
  })
  const plain = await mk({}).review('p1')
  const notRepo = await mk({ notARepo: () => true }).review('p1')
  const unreadable = await mk({ repoUnreadable: () => 'xcrun: error' }).review('p1')
  ok('40 never-started / not-a-repo / repo-unreadable are three answers',
    plain.kind === 'never-started' && notRepo.kind === 'not-a-repo' &&
      unreadable.kind === 'repo-unreadable' && unreadable.detail === 'xcrun: error')
}

// 41. The capture records WHICH failure it saw, and drop() clears it — the
//     rule isNotARepo already obeys, extended to the second verdict. Without
//     the clear, onReset()'s recycled FIRST_RUN_ID inherits a stranger's
//     "git refused" verdict and reports it against a perfectly good repo.
{
  const capture = R.createBaselineCapture({
    baselineOf: () => undefined,
    setBaseline: () => {},
    resolveRepo: async () => ({ kind: 'unreadable', detail: 'xcrun: error' }),
    captureBaseline: async () => null
  })
  capture.capture('p1', '/home/u/proj')
  await new Promise((r) => setImmediate(r))
  const before = capture.unreadableDetail('p1')
  capture.drop('p1')
  ok('41 an unreadable verdict is recorded and cleared by drop',
    before === 'xcrun: error' && capture.unreadableDetail('p1') === undefined &&
      capture.isNotARepo('p1') === false)
}

// 42. THE ONE TO KNOW BY NUMBER. A unified diff's file headers begin '---'
//     and '+++', so a parser that tests '+' before '+++' paints the header
//     of every file as an ADDED line — a green "+++ b/src/app.ts" at the top
//     of every hunk, which looks like a rendering quirk and is a
//     classification bug. Order of tests, asserted directly.
{
  const { lines } = R.parseDiffLines('--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n ctx\n')
  ok('42 file headers are meta, not additions',
    lines[0].kind === 'meta' && lines[1].kind === 'meta' && lines[2].kind === 'hunk' &&
      lines[3].kind === 'del' && lines[4].kind === 'add' && lines[5].kind === 'context')
}

// 43. The preamble git prints before the first hunk is meta too, and the
//     "\ No newline at end of file" marker is meta rather than context — it
//     is a note ABOUT the diff, and rendering it as an unchanged source line
//     puts text on screen that is not in the file.
{
  const { lines } = R.parseDiffLines(
    'diff --git a/x b/x\nindex 1..2 100644\nnew file mode 100644\n@@ -0,0 +1 @@\n+hi\n\\ No newline at end of file\n')
  ok('43 the preamble and the no-newline marker are meta',
    lines.slice(0, 3).every((l) => l.kind === 'meta') &&
      lines[lines.length - 1].kind === 'meta')
}

// 44. The cap TRUNCATES and SAYS SO. A node that silently rendered the first
//     600 lines of a 5000-line diff is a review tool that lies by omission,
//     which is the one thing this milestone's honest-degradation rule
//     forbids; the count is what the view renders as "+N more lines".
{
  const patch = Array.from({ length: 50 }, (_, i) => `+line ${i}`).join('\n')
  const out = R.parseDiffLines(patch, 10)
  ok('44 the line cap truncates and reports the remainder',
    out.lines.length === 10 && out.truncated === 40)
}

// 45. THE OUTLIVES-THE-SUBJECT PROPERTY, and the only place it is provable
//     cheaply. reviewAt takes a BASELINE, so it must never consult
//     baselineOf — main drops a panel's stored baseline the moment its
//     session is killed, so an implementation that looked the subject up
//     would go blank exactly when the agent is dismissed, which is when a
//     review of finished work is most useful. The fake throws rather than
//     returning undefined, so a lookup fails loudly instead of degrading
//     into a plausible never-started.
{
  const engine = R.createReviewEngine({
    run: async (args) => args.includes('--numstat')
      ? gitOk('3\t1\tsrc/app.ts\0')
      : gitOk(''),
    baselineOf: () => { throw new Error('reviewAt must not look up a panel') },
    peersInRepo: () => 0
  })
  const result = await engine.reviewAt({ root: '/r', sha: 'abc' }, 'n4')
  ok('45 reviewAt answers from the baseline alone',
    result.kind === 'changes' && result.files[0].path === 'src/app.ts' &&
      result.added === 3 && result.removed === 1)
}

// 46. …and it still reports `shared` rather than a confident wrong
//     attribution, excluding its own subject from the peer count. A node
//     that dropped the exclusion would report every single-panel repository
//     as shared with itself.
{
  const engine = R.createReviewEngine({
    run: async (args) => args.includes('--numstat') ? gitOk('1\t0\tx\0') : gitOk(''),
    baselineOf: () => undefined,
    peersInRepo: (root, except) => (except === 'n4' ? 1 : 99)
  })
  const result = await engine.reviewAt({ root: '/r', sha: 'abc' }, 'n4')
  ok('46 reviewAt excludes its own subject from the peer count',
    result.kind === 'shared' && result.panelCount === 2)
}

// 47. fileDiff's three answers. `binary` is git's own report and must not be
//     parsed as source; a failed diff is `unavailable`, never an EMPTY diff
//     — "this file did not change" for a file the numstat just said changed
//     is the confident wrong answer this whole feature is built to refuse.
//
//     The EMPTY-stdout clause is the second half of that same sentence, and
//     it is the one a reader is likeliest to think is covered by the failure
//     clause above when it is not: git exiting 0 with nothing to say is a
//     SUCCESS, so it flows straight past the `acceptable` test. It is
//     reachable — the file was reverted between the numstat that listed it
//     and the click that expanded it — and without this clause the node
//     renders an empty expanded box with no note at all.
{
  const mk = (result) => R.createReviewEngine({
    run: async () => result, baselineOf: () => undefined, peersInRepo: () => 0
  })
  const text = await mk(gitOk('@@ -1 +1 @@\n-a\n+b\n')).fileDiff(
    { repoRoot: '/r', baselineSha: 'abc', path: 'x.ts', untracked: false })
  const bin = await mk(gitOk('Binary files a/x.png and b/x.png differ\n')).fileDiff(
    { repoRoot: '/r', baselineSha: 'abc', path: 'x.png', untracked: false })
  const bad = await mk(gitFail(128, 'fatal: bad object')).fileDiff(
    { repoRoot: '/r', baselineSha: 'abc', path: 'x.ts', untracked: false })
  const empty = await mk(gitOk('')).fileDiff(
    { repoRoot: '/r', baselineSha: 'abc', path: 'x.ts', untracked: false })
  ok('47 fileDiff answers diff / binary / unavailable, and an empty diff is unavailable',
    text.kind === 'diff' && text.lines.length === 3 &&
      bin.kind === 'binary' && bad.kind === 'unavailable' &&
      empty.kind === 'unavailable')
}

// 48. An UNTRACKED file — the commonest thing an agent produces — has no
//     entry in `git diff <baseline>` at all, so it needs --no-index against
//     /dev/null. That call EXITS 1 whenever it finds differences, which is
//     every successful call; treating exit 1 as failure here means every new
//     file a user opens reads "unavailable", i.e. the feature is broken for
//     its most common input while looking correct on modified files.
{
  const engine = R.createReviewEngine({
    run: async (args) => args.includes('--no-index')
      ? { stdout: '@@ -0,0 +1 @@\n+hello\n', ok: false, notFound: false, code: 1, stderr: '' }
      : gitOk(''),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  const out = await engine.fileDiff({ repoRoot: '/r', baselineSha: 'abc', path: 'new.txt', untracked: true })
  ok('48 an untracked file diffs against /dev/null, and exit 1 is success',
    out.kind === 'diff' && out.lines.some((l) => l.kind === 'add' && l.text.includes('hello')))
}

// 49. The scratch-index read. `read-tree HEAD` seeds the temporary index with
//     the current commit's tree so `update-index` adds ON TOP of HEAD rather
//     than producing a commit containing only the paths we staged — which
//     would delete every other file in the repository, in a commit, on disk,
//     as the app's first irreversible write.
ok('49 read-tree argv seeds the scratch index from HEAD',
  JSON.stringify(R.buildReadTreeArgs('/r')) ===
    JSON.stringify(['-C', '/r', 'read-tree', 'HEAD']))

// 50. --add AND --remove, and the pair is the check. `git diff --numstat`
//     reports a DELETED file exactly as it reports a modified one, so a
//     builder carrying only --add fails on the path git names but cannot
//     find — and `update-index` treats a missing file as an error, so the
//     whole commit fails rather than the deletion being dropped. --remove is
//     what makes "the files the node reports" and "the files we can stage"
//     the same set. `--` terminates options, or a file named `-f` is a flag.
{
  const args = R.buildStageArgs('/r', ['a b.txt', '-f.txt'])
  ok('50 stage argv carries --add AND --remove, and terminates options',
    JSON.stringify(args) === JSON.stringify(
      ['-C', '/r', 'update-index', '--add', '--remove', '--', 'a b.txt', '-f.txt']))
}

// 51. A real `git commit`, not `commit-tree`. commit-tree runs NO HOOKS AT
//     ALL, so the plumbing recipe that looks safest silently delivers the
//     --no-verify behaviour the spec forbids. There is no --no-verify here
//     and there is no flag that could become one by accident; the message
//     goes through -m rather than stdin so the runner needs no stdin.
{
  const args = R.buildCommitArgs('/r', 'agent work')
  ok('51 commit argv is porcelain with a -m message and no --no-verify',
    JSON.stringify(args) === JSON.stringify(['-C', '/r', 'commit', '-m', 'agent work']) &&
      !args.includes('--no-verify') && !args.includes('commit-tree'))
}

// 52. Reading the entries BACK, -z. This is what the reconcile stages by, and
//     it is read AFTER the commit rather than before deliberately: a
//     pre-commit hook is allowed to change the index (a formatter that runs
//     `git add` is the ordinary case), so the entries read before the commit
//     are not necessarily the entries that got committed, and reconciling
//     with those would stage content that is in no commit.
ok('52 staged-entries argv is -z and scoped to the paths',
  JSON.stringify(R.buildStagedEntriesArgs('/r', ['a b.txt'])) ===
    JSON.stringify(['-C', '/r', 'ls-files', '--stage', '-z', '--', 'a b.txt']))

// 53. `<mode> <sha> <stage>\t<path>\0`. The separator between the metadata
//     and the path is a TAB and the record separator is a NUL, so a path
//     containing either a space or a tab-looking sequence still parses — the
//     -z rule this file states for every other read. A trailing NUL must not
//     produce an empty final entry.
{
  const raw = '100644 9ad2eb 0\ta b.txt\u0000100755 587be6 0\trun.sh\u0000'
  const parsed = R.parseStagedEntries(raw)
  ok('53 staged entries parse mode/sha/path across a spaced path',
    parsed.length === 2 &&
      parsed[0].mode === '100644' && parsed[0].sha === '9ad2eb' && parsed[0].path === 'a b.txt' &&
      parsed[1].mode === '100755' && parsed[1].path === 'run.sh')
}

// 54. The reconcile, BY SHA. --cacheinfo takes the blob the commit actually
//     contains, so an agent that edited the file between our commit and this
//     call cannot have its newer content staged behind its back — which is
//     what a plain `update-index --add -- <paths>` (a working-tree read)
//     would do. One call for every path rather than one call per path,
//     because each is a separate lock acquisition on the index of a
//     repository an agent is working in.
{
  const args = R.buildReconcileArgs('/r', [
    { mode: '100644', sha: 'aaa', path: 'a b.txt' },
    { mode: '100755', sha: 'bbb', path: 'run.sh' }
  ])
  ok('54 reconcile argv stages the committed blobs by sha, in one call',
    JSON.stringify(args) === JSON.stringify([
      '-C', '/r', 'update-index', '--add', '--replace',
      '--cacheinfo', '100644,aaa,a b.txt',
      '--cacheinfo', '100755,bbb,run.sh'
    ]))
}

// 55. A per-call env OVERLAY, never a replacement. The scratch index is passed
//     as GIT_INDEX_FILE, and an implementation that passed `opts.env` alone
//     would strip HOME, PATH and git's own config from the call — the exact
//     failure git-runner.ts's existing "an empty object would STRIP the
//     environment" comment already records, reached through a new door. The
//     overlay must WIN on a key both hold, or the scratch index is silently
//     ignored and the commit writes the user's real index: the one thing this
//     milestone exists to prevent, with no error anywhere.
{
  const seen = []
  const run = R.createGitRunner({
    gitPath: () => '/usr/bin/env',
    env: () => ({ HOME: '/h', GIT_INDEX_FILE: '/should/be/overridden' }),
    timeoutMs: () => 5000
  })
  // `env` with no arguments prints its own environment, so the call reports
  // back exactly what it was given — a real process, not an inspected object.
  const out = await run([], { env: { GIT_INDEX_FILE: '/scratch/idx' } })
  const lines = out.stdout.split('\n')
  seen.push(lines.includes('HOME=/h'), lines.includes('GIT_INDEX_FILE=/scratch/idx'),
    !lines.includes('GIT_INDEX_FILE=/should/be/overridden'))
  ok('55 a per-call env overlays the login env and wins on a shared key',
    out.ok && seen.every(Boolean))
}

// A fake runner that records every call and answers from a table keyed on the
// first git SUBCOMMAND. `-C <root>` occupies args[0..1], so the subcommand is
// args[2]. Defaults to success, so a check names only the call it cares about.
const fakeGit = (table) => {
  const calls = []
  const run = async (args, opts) => {
    calls.push({ args, env: opts?.env })
    const hit = table[args[2]]
    const answer = typeof hit === 'function' ? hit(args) : hit
    return { stdout: '', ok: true, notFound: false, code: 0, stderr: '', ...(answer ?? {}) }
  }
  return { run, calls }
}
const committerOn = (run, removed = []) => R.createReviewCommitter({
  run,
  tempIndexPath: () => '/scratch/idx',
  removeTempIndex: (p) => removed.push(p)
})

// 56. The happy path, and the ORDER is the check. read-tree must precede
//     update-index (or the commit contains only the staged paths and DELETES
//     the rest of the repository), and ls-files must FOLLOW commit (a
//     pre-commit hook may rewrite the index, and reconciling from entries read
//     before it stages content that is in no commit). Every one of the four
//     scratch-index calls must carry GIT_INDEX_FILE; the reconcile must NOT,
//     since it is the one call that is supposed to write the real index.
{
  const g = fakeGit({
    'ls-files': { stdout: '100644 aaa 0\ta b.txt\0' },
    'rev-parse': { stdout: 'newsha\n' }
  })
  const out = await committerOn(g.run)({
    root: '/r', paths: ['a b.txt'], message: 'agent work'
  })
  const sub = g.calls.map((c) => c.args[2])
  const scratch = (name) => g.calls.find((c) => c.args[2] === name)?.env?.GIT_INDEX_FILE
  const reconcile = g.calls.filter((c) => c.args[2] === 'update-index').pop()
  // The first 'update-index' is the STAGE call; the reconcile is the LAST one
  // (found via .pop() above). indexOf alone finds the stage call's position,
  // which is also what the scratch('update-index') read below resolves to.
  const stage = sub.indexOf('update-index')
  ok('56 the five calls run in order, scoped to the scratch index, and the reconcile is not',
    out.kind === 'committed' && out.sha === 'newsha' &&
      sub.indexOf('read-tree') < stage && stage < sub.indexOf('commit') &&
      sub.indexOf('commit') < sub.indexOf('ls-files') &&
      scratch('read-tree') === '/scratch/idx' && scratch('update-index') === '/scratch/idx' &&
      scratch('commit') === '/scratch/idx' && scratch('ls-files') === '/scratch/idx' &&
      reconcile.env === undefined)
}

// 57. A rejecting pre-commit hook. Its own output is what the user has to
//     read — the hook is the only thing that knows what it objected to — and
//     it arrives on stderr with a non-zero exit and nothing else marking it.
//     `refused`, not `failed`: the repository said no, which is a different
//     situation with a different fix from "this did not run".
{
  const g = fakeGit({ commit: { ok: false, code: 1, stderr: 'eslint: 3 problems\n' } })
  const out = await committerOn(g.run)({ root: '/r', paths: ['a.ts'], message: 'm' })
  ok('57 a non-zero commit is refused, carrying the hook output verbatim',
    out.kind === 'refused' && out.detail.includes('eslint: 3 problems'))
}

// 58. A failure BEFORE the commit is a different arm, and the discriminating
//     clause is that `commit` was never called at all. Collapsing the two
//     would tell a user whose git is broken that their repository refused the
//     change, which sends them to look at hooks that never ran.
{
  const g = fakeGit({ 'read-tree': { ok: false, code: 128, stderr: 'fatal: bad object' } })
  const out = await committerOn(g.run)({ root: '/r', paths: ['a.ts'], message: 'm' })
  ok('58 a pre-commit-call failure is failed, and never reaches git commit',
    out.kind === 'failed' && out.detail.includes('fatal: bad object') &&
      !g.calls.some((c) => c.args[2] === 'commit'))
}

// 59. The scratch index is removed on EVERY path, including the failing ones.
//     It is a file per commit under userData, so a leak is unbounded growth
//     for the life of the install — and the failing paths are exactly the
//     ones a naive `await`-then-cleanup implementation skips.
{
  const removedOk = []
  const removedBad = []
  await committerOn(fakeGit({ 'ls-files': { stdout: '100644 a 0\tx\0' } }).run, removedOk)(
    { root: '/r', paths: ['x'], message: 'm' })
  await committerOn(fakeGit({ commit: { ok: false, code: 1, stderr: 'no' } }).run, removedBad)(
    { root: '/r', paths: ['x'], message: 'm' })
  ok('59 the scratch index is removed after success AND after a refusal',
    removedOk.length === 1 && removedOk[0] === '/scratch/idx' &&
      removedBad.length === 1 && removedBad[0] === '/scratch/idx')
}

// 60. A FAILED RECONCILE MUST NOT UNDO A SUCCESSFUL COMMIT. The commit is on
//     disk and in history by then; reporting `failed` there would tell the
//     user their work was not committed while it demonstrably was, and the
//     obvious next thing they do is commit it again. The reconcile is a
//     tidiness step for the agent's `git status`, not part of the
//     transaction — so it is reported and swallowed. Its inverse is also
//     pinned: an EMPTY path set never reaches git at all, because
//     `update-index --add` with no paths is a call with nothing to do and
//     `git commit` on an empty scratch index is a confusing refusal rather
//     than the honest answer.
{
  const g = fakeGit({
    'ls-files': { stdout: '100644 aaa 0\tx\0' },
    'rev-parse': { stdout: 'newsha\n' },
    'update-index': (args) => args.includes('--cacheinfo')
      ? { ok: false, code: 1, stderr: 'index.lock exists' }
      : {}
  })
  const out = await committerOn(g.run)({ root: '/r', paths: ['x'], message: 'm' })
  const empty = fakeGit({})
  const none = await committerOn(empty.run)({ root: '/r', paths: [], message: 'm' })
  ok('60 a failed reconcile still reports committed, and no paths never calls git',
    out.kind === 'committed' && out.sha === 'newsha' &&
      none.kind === 'nothing-to-commit' && empty.calls.length === 0)
}

// 61-63. Real git, a real repository, in a SPACED temp directory — the
//        directory shape that made the pane-died redirect bug survive eight
//        reviews. Everything above this line drives a fake runner and would
//        pass identically against a sequencer that wrote the user's own index,
//        because a fake has no index to write.
{
  const { execFileSync } = require('node:child_process')
  const { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, chmodSync } = require('node:fs')
  const { tmpdir } = require('node:os')

  let git = null
  try { git = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim() } catch { git = null }

  if (git === null || git === '') {
    // LOUD, never silent. A skipped check that prints nothing is a check that
    // stops existing the day the binary goes missing on CI.
    ok('61-63 SKIPPED — no git binary found', true, 'skipped, not passed')
  } else {
    const root = mkdtempSync(join(tmpdir(), 'tc m9c commit '))
    const g = (...args) => execFileSync(git, ['-C', root, ...args], { encoding: 'utf8' })
    g('init', '-q', '.')
    g('config', 'user.email', 't@t')
    g('config', 'user.name', 'T')
    writeFileSync(join(root, 'a.txt'), 'base\n')
    g('add', 'a.txt')
    g('commit', '-qm', 'first')

    // The agent's work: one modified file and one brand-new one.
    writeFileSync(join(root, 'a.txt'), 'base\nagent\n')
    writeFileSync(join(root, 'new file.txt'), 'agent\n')
    // The USER's own unrelated staging, which must survive untouched.
    writeFileSync(join(root, 'mine.txt'), 'user\n')
    g('add', 'mine.txt')

    // A pre-commit hook that leaves EVIDENCE it ran, and records which index
    // it was shown — the two facts check 61 turns on.
    const hooks = join(root, '.git', 'hooks')
    mkdirSync(hooks, { recursive: true })
    const hookLog = join(root, '..', 'hook-log.txt')
    writeFileSync(join(hooks, 'pre-commit'),
      `#!/bin/sh\ngit diff --cached --name-only > '${hookLog}'\nexit 0\n`)
    chmodSync(join(hooks, 'pre-commit'), 0o755)

    const indexBefore = readFileSync(join(root, '.git', 'index'))
    const scratchDir = mkdtempSync(join(tmpdir(), 'tc m9c idx '))
    const scratch = join(scratchDir, 'index')

    // 62's claim is about the four scratch-scoped calls (read-tree, stage,
    // commit, staged-entries), never about the reconcile — the reconcile is
    // the fifth call and deliberately DOES write the real index (that write
    // is what check 63 depends on). `commit()` resolves only after the
    // reconcile has already run, so a before/after snapshot taken around the
    // WHOLE call cannot separate "untouched by the four scratch-scoped
    // calls" from "touched by the deliberate reconcile" — a correct
    // implementation legitimately rewrites the real index by the time the
    // promise settles, purely because the reconcile ran, so a whole-call
    // comparison cannot discriminate a correct implementation from a broken
    // one (confirmed empirically: with GIT_INDEX_FILE scoped to the scratch
    // index, the real .git/index is byte-identical across the commit call
    // itself — the reconcile is the ONLY real-index write in this
    // transaction, which is precisely why the window has to close before
    // it). The runner is therefore wrapped to snapshot the real index the
    // instant the porcelain `commit` call resolves — the last of the four
    // scratch-scoped calls, and the point before which nothing should have
    // touched the real file at all.
    let indexAfterCommitCall = null
    const runner = R.createGitRunner({ gitPath: () => git, env: () => ({}), timeoutMs: () => 20000 })
    const spyingRun = async (args, opts) => {
      const result = await runner(args, opts)
      if (args[2] === 'commit') indexAfterCommitCall = readFileSync(join(root, '.git', 'index'))
      return result
    }

    const commit = R.createReviewCommitter({
      run: spyingRun,
      tempIndexPath: () => scratch,
      removeTempIndex: (p) => { try { rmSync(p) } catch { /* best effort */ } }
    })
    const out = await commit({
      root, paths: ['a.txt', 'new file.txt'], message: 'agent work'
    })

    // 61. Hooks run, and they see OUR staging. A commit-tree implementation
    //     runs no hook at all and writes no log; an implementation that
    //     forgot GIT_INDEX_FILE on the commit call runs the hook against the
    //     user's index and the log names mine.txt instead.
    let hookSaw = ''
    try { hookSaw = readFileSync(hookLog, 'utf8') } catch { hookSaw = '' }
    ok('61 the pre-commit hook ran, and saw exactly the reviewed paths',
      out.kind === 'committed' &&
        hookSaw.includes('a.txt') && hookSaw.includes('new file.txt') &&
        !hookSaw.includes('mine.txt'))

    // 62. THE MILESTONE'S CENTRAL CLAIM: the user's index is byte-identical.
    //     Compared as BYTES rather than by `git status` output, because a
    //     status read is a claim about what git derives and this is a claim
    //     about the file an agent may be mid-write against.
    ok('62 the repository index was not written while the commit was staged',
      indexAfterCommitCall !== null && Buffer.compare(indexBefore, indexAfterCommitCall) === 0)

    // 63. ...and then it IS brought back in step, deliberately. Without the
    //     reconcile, `git status` reports `D  new file.txt` and `MM a.txt` —
    //     phantom staged deletions of files that were just committed, which an
    //     agent reading its own status will try to "fix". The user's own
    //     staged mine.txt must survive that, or the reconcile has become the
    //     wholesale index write it exists to avoid.
    const status = g('status', '--porcelain')
    const committedFiles = g('show', '--stat', '--name-only', '--format=', 'HEAD')
    ok('63 the reconcile leaves no phantom staged change, and the user\'s own staging survives',
      committedFiles.includes('a.txt') && committedFiles.includes('new file.txt') &&
        !/^[ADM]M? +(a\.txt|new file\.txt)/m.test(status) &&
        /^A  mine\.txt/m.test(status))

    rmSync(root, { recursive: true, force: true })
    rmSync(scratchDir, { recursive: true, force: true })
    try { rmSync(hookLog) } catch { /* best effort */ }
  }
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)

})()
