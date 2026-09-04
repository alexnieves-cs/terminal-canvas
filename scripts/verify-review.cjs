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

// M37 — a git worktree per panel: the pure half. Scoped ids.
//
// worktree.1. The branch name carries the panel id (legible in `git branch`
//      beside the canvas) AND a minute stamp (a recycled panel id must not
//      collide with the branch a previous panel left behind).
{
  const name = typeof R.worktreeBranch === 'function'
    ? R.worktreeBranch('n12', new Date(2026, 8, 1, 14, 32, 7))
    : null
  ok('worktree.1 worktreeBranch is tc/<panelId>-<yyyymmdd-HHMM>',
    name === 'tc/n12-20260901-1432', String(name))
}

// worktree.2. The path lives under the app's own directory, never inside the
//      repository (where it would be untracked files in every review); its
//      LEAF has no slash (a branch name does); and two repositories that
//      share a basename get different parents, or one's worktree would land
//      inside the other's.
{
  const fn = typeof R.worktreePath === 'function' ? R.worktreePath : null
  const a = fn ? fn('/ud/worktrees', '/Users/x/proj', 'tc/n12-20260901-1432') : ''
  const b = fn ? fn('/ud/worktrees', '/Users/y/proj', 'tc/n12-20260901-1432') : ''
  const leaf = a.split('/').pop()
  const parentA = a.split('/').slice(0, -1).join('/')
  const parentB = b.split('/').slice(0, -1).join('/')
  ok('worktree.2 worktreePath: under the app dir, slash-free leaf, distinct parents for same-name repos',
    a.startsWith('/ud/worktrees/proj-') && leaf === 'tc-n12-20260901-1432' && !leaf.includes('/') &&
      parentA !== parentB && fn('/ud/worktrees', '/Users/x/proj', 'tc/z') .startsWith(parentA + '/'),
    JSON.stringify({ a, b }))
}

// worktree.11. The branch probe: `rev-parse --verify --quiet refs/heads/<b>`,
//      whose exit status is the whole answer.
ok('worktree.11 the branch-exists argv',
  typeof R.buildBranchExistsArgs === 'function' &&
    JSON.stringify(R.buildBranchExistsArgs('/r', 'tc/b')) === JSON.stringify(['-C', '/r', 'rev-parse', '--verify', '--quiet', 'refs/heads/tc/b']),
  typeof R.buildBranchExistsArgs === 'function' ? JSON.stringify(R.buildBranchExistsArgs('/r', 'tc/b')) : 'absent')

// worktree.3. The two argv builders. `add -b <branch> <path> HEAD` branches
//      from the current commit; `remove` carries NO --force, for the reason
//      review-commit carries no --no-verify: a tool that quietly discarded an
//      agent's uncommitted work is worth less than one that refuses.
{
  const add = typeof R.buildWorktreeAddArgs === 'function' ? R.buildWorktreeAddArgs('/r', 'tc/b', '/p') : null
  const rm = typeof R.buildWorktreeRemoveArgs === 'function' ? R.buildWorktreeRemoveArgs('/r', '/p') : null
  ok('worktree.3 worktree add/remove argv, and remove never forces',
    JSON.stringify(add) === JSON.stringify(['-C', '/r', 'worktree', 'add', '-b', 'tc/b', '/p', 'HEAD']) &&
      JSON.stringify(rm) === JSON.stringify(['-C', '/r', 'worktree', 'remove', '/p']),
    JSON.stringify({ add, rm }))
}

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

  // M37 — the worktree manager against REAL git, in the same spaced fixture
  // repository. Scoped ids. The records live in an in-memory list standing in
  // for layout-store's, so nothing here touches a real layout.json.
  {
    const records = []
    const store = {
      forPanel: (panelId, root) => records.find((w) => w.panelId === panelId && w.root === root),
      add: (rec) => { records.push(rec) },
      drop: (id) => { const i = records.findIndex((w) => w.id === id); if (i < 0) return false; records.splice(i, 1); return true },
      list: () => records.slice()
    }
    const worktreesDir = join(mkdtempSync(join(tmpdir(), 'tc worktrees ')), 'worktrees')
    const mgr = typeof R.createWorktreeManager === 'function'
      ? R.createWorktreeManager({
          run: engine.runner, resolveRepo: (cwd) => engine.e.resolveRepo(cwd), worktreesDir, records: store,
          now: () => new Date(2026, 8, 1, 14, 32), mintId: (() => { let n = 0; return () => `wt${++n}` })()
        })
      : null
    const listWorktrees = () => git('worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length
    const treesBefore = listWorktrees()

    // worktree.4. Creation: a directory on a NEW branch at HEAD, recorded.
    const made = mgr ? await mgr.ensureForPanel('p1', repo) : null
    const branchExists = made && made.kind === 'active'
      ? git('branch', '--list', made.branch).trim() !== '' : false
    ok('worktree.4 ensureForPanel creates a worktree on a tc/ branch at HEAD and records it',
      made !== null && made.kind === 'active' && made.branch === 'tc/p1-20260901-1432' &&
        require('node:fs').existsSync(made.path) && made.path.startsWith(worktreesDir) &&
        branchExists && listWorktrees() === treesBefore + 1 &&
        records.length === 1 && records[0].panelId === 'p1' && records[0].root === root,
      JSON.stringify({ made, records, trees: listWorktrees() - treesBefore }))

    // worktree.5. Reuse: a second call for the SAME panel in the SAME root
    //      (a reload, a restart, an undone close) creates nothing and answers
    //      the same record; the same panel id in a DIFFERENT root does not
    //      reuse it — a recycled id must never land in a stranger's branch.
    const again = mgr ? await mgr.ensureForPanel('p1', repo) : null
    const otherRepo = mkdtempSync(join(tmpdir(), 'tc other repo '))
    const gitOther = (...args) => execFileSync('git', ['-C', otherRepo, ...args], { encoding: 'utf8' })
    gitOther('init', '-q', '.'); gitOther('config', 'user.email', 'v@e.com'); gitOther('config', 'user.name', 'v')
    writeFileSync(join(otherRepo, 'o.txt'), 'o\n'); gitOther('add', '-A'); gitOther('commit', '-qm', 'o')
    const elsewhere = mgr ? await mgr.ensureForPanel('p1', otherRepo) : null
    ok('worktree.5 the same panel in the same root reuses its worktree; in another root it gets its own',
      again !== null && again.kind === 'active' && made && again.path === made.path && listWorktrees() === treesBefore + 1 &&
        elsewhere !== null && elsewhere.kind === 'active' && elsewhere.path !== made.path && records.length === 2,
      JSON.stringify({ again, elsewhere, records: records.length }))

    // worktree.6. The review engine needs no change: resolveRepo of the
    //      worktree path answers the WORKTREE's root, and a baseline captured
    //      there plus one edit there reports exactly that edit — the main
    //      checkout's own dirt (a.txt has uncommitted lines above) is absent.
    let wtReview = null
    if (made && made.kind === 'active') {
      const wtRoot = await engine.e.resolveRepo(made.path)
      const wtSha = wtRoot.kind === 'root' ? await engine.e.captureBaseline(wtRoot.root) : null
      writeFileSync(join(made.path, 'wt file.txt'), 'made in the worktree\n')
      const engine2 = R.createReviewEngine({ run: engine.runner, baselineOf: () => ({ root: wtRoot.root, sha: wtSha }), peersInRepo: () => 0 })
      const r = await engine2.review('p1')
      wtReview = { rootKind: wtRoot.kind, sameAsRepo: wtRoot.kind === 'root' && wtRoot.root === root, kind: r.kind, files: r.files && r.files.map((f) => f.path) }
    }
    ok('worktree.6 a review inside the worktree sees the worktree\'s root and only the worktree\'s edits',
      wtReview !== null && wtReview.rootKind === 'root' && wtReview.sameAsRepo === false &&
        wtReview.kind === 'changes' && JSON.stringify(wtReview.files) === JSON.stringify(['wt file.txt']),
      JSON.stringify(wtReview))

    // worktree.7. Not a repository: the refused arm, with a reason, and no
    //      record — the caller spawns in place and SAYS so.
    const plain = mkdtempSync(join(tmpdir(), 'tc not a repo '))
    const refused = mgr ? await mgr.ensureForPanel('p9', plain) : null
    ok('worktree.7 a cwd outside any repository is refused with a reason and no record',
      refused !== null && refused.kind === 'refused' && typeof refused.reason === 'string' && refused.reason.length > 0 &&
        !records.some((w) => w.panelId === 'p9'),
      JSON.stringify(refused))

    // worktree.8. A DIRTY worktree's removal is refused with git's own
    //      sentence, and the directory survives — no --force, ever.
    const dirtyResult = mgr && made && made.kind === 'active' ? await mgr.remove(records[0].id) : null
    ok('worktree.8 removing a dirty worktree is refused verbatim and the directory survives',
      dirtyResult !== null && dirtyResult.kind === 'refused' && /modified|untracked|contains|dirty/i.test(dirtyResult.reason) &&
        made && require('node:fs').existsSync(made.path) && records.length === 2,
      JSON.stringify(dirtyResult))

    // worktree.9. A CLEAN worktree is removed, its record dropped, and its
    //      branch KEPT: deleting an unmerged branch is the one irreversible
    //      act here and it is the user's, in git, once they have merged.
    let cleanResult = null
    if (mgr && made && made.kind === 'active') {
      require('node:fs').rmSync(join(made.path, 'wt file.txt'))
      cleanResult = await mgr.remove(records[0].id)
    }
    ok('worktree.9 a clean worktree is removed, its record dropped, and its branch kept',
      cleanResult !== null && cleanResult.kind === 'removed' && made && !require('node:fs').existsSync(made.path) &&
        records.length === 1 && git('branch', '--list', made.branch).trim() !== '' && listWorktrees() === treesBefore,
      JSON.stringify({ cleanResult, records: records.length, trees: listWorktrees() - treesBefore }))
    // worktree.10. The directory deleted by hand (the M37 verifier's one
    //      untested branch): the record is stale, so ensureForPanel drops it
    //      and mints a FRESH worktree rather than answering a path that is
    //      not there — a stale `active` would spawn the panel in a cwd
    //      resolveCwd falls back from to $HOME, silently.
    let recovered = null
    if (mgr && elsewhere && elsewhere.kind === 'active') {
      require('node:fs').rmSync(elsewhere.path, { recursive: true, force: true })
      const before = records.length
      recovered = await mgr.ensureForPanel('p1', otherRepo)
      recovered = { ...recovered, sameRecordCount: records.length === before, staleGone: !records.some((w) => w.path === elsewhere.path) }
    }
    // The clock here is FIXED, so the stale branch and the fresh one would
    // share a name; the manager probes and suffixes, which is exactly the
    // same-minute recycle case in production. `-2` is the observable.
    ok('worktree.10 a hand-deleted worktree directory yields a fresh, suffixed worktree and drops the stale record',
      recovered !== null && recovered.kind === 'active' && recovered.path !== elsewhere.path &&
        recovered.branch === elsewhere.branch + '-2' &&
        require('node:fs').existsSync(recovered.path) && recovered.sameRecordCount && recovered.staleGone,
      JSON.stringify(recovered))
    try { require('node:fs').rmSync(worktreesDir, { recursive: true, force: true }) } catch { /* best effort */ }
    try { require('node:fs').rmSync(otherRepo, { recursive: true, force: true }) } catch { /* best effort */ }
  }

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

// 56. The happy path, and the ORDER is the check. The HEAD guard (checks 65
//     and 66) added two rev-parse reads to this sequence, so the count that
//     used to be in this check's title has moved; what it pins has not.
//     read-tree must precede
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
  ok('56 the calls run in order, scoped to the scratch index, and the reconcile is not',
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

// 64. A COMMITTED DELETION, reconciled. `ls-files --stage` returns NOTHING
//     for a path the commit deleted, so the absent-from-the-read-back set is
//     exactly the deleted set — and leaving those entries alone in the real
//     index is the precise phantom the reconcile exists to remove, wearing
//     the opposite sign. Measured against real git: the index still holds the
//     pre-commit entry for a path HEAD no longer has, so `git status` reads
//     `AD a.txt` — the file staged as NEW in a repository that just deleted
//     it. An agent reading that re-adds the file it meant to remove, which is
//     strictly worse than the `D`/`MM` case, because it is a wrong answer the
//     agent will act on rather than merely a confusing one.
//
//     Both halves matter. The force-remove must NOT carry the scratch env —
//     it is a real-index write, like the --cacheinfo reconcile beside it —
//     and it must name only the deleted path, or a surviving file is removed
//     from the index it was just committed into. And a FAILING force-remove
//     still reports `committed`, for check 60's reason: the commit has
//     landed, and telling the user otherwise invites a second one.
{
  const g = fakeGit({
    // Only the surviving path comes back; `gone.txt` was deleted by the
    // commit, so git prints no entry for it at all.
    'ls-files': { stdout: '100644 aaa 0\tkept.txt\0' },
    'rev-parse': { stdout: 'newsha\n' }
  })
  const out = await committerOn(g.run)({
    root: '/r', paths: ['kept.txt', 'gone.txt'], message: 'm'
  })
  const forced = g.calls.find((c) => c.args.includes('--force-remove'))
  // Same shape, with the force-remove refusing. `--cacheinfo` is what tells
  // the two update-index reconciles apart in the table.
  const h = fakeGit({
    'ls-files': { stdout: '100644 aaa 0\tkept.txt\0' },
    'rev-parse': { stdout: 'newsha\n' },
    'update-index': (args) => args.includes('--force-remove')
      ? { ok: false, code: 1, stderr: 'index.lock exists' }
      : {}
  })
  const survived = await committerOn(h.run)({
    root: '/r', paths: ['kept.txt', 'gone.txt'], message: 'm'
  })
  ok('64 a path absent from the read-back is force-removed, off the scratch index',
    out.kind === 'committed' && forced !== undefined &&
      forced.env === undefined &&
      forced.args.includes('gone.txt') && !forced.args.includes('kept.txt') &&
      survived.kind === 'committed' && survived.sha === 'newsha',
    `forced=${JSON.stringify(forced && forced.args)} survived=${JSON.stringify(survived)}`)
}


// 65. THE GUARD'S TWO READS, and their POSITIONS are the whole check. The
//     scratch index is seeded from HEAD by read-tree and the commit parents on
//     HEAD, so anything committed in that window is silently reverted for
//     every file outside our path set — an ordinary-looking commit that rolls
//     its predecessor back, with no conflict and no warning. This app's whole
//     premise is an autonomous agent working in the same checkout, so the
//     other committer is not hypothetical, and the window is not milliseconds:
//     it is the entire duration of the pre-commit hook.
//
//     The second read has to sit immediately BEFORE the commit rather than
//     just after read-tree, or it closes almost none of that window — which is
//     the implementation this check exists to reject, and which check 66's
//     fake (answering both reads from one table entry) cannot tell apart. The
//     unchanged-HEAD clause is the over-correction guard: a comparison written
//     backwards refuses every commit there is, which is a feature that never
//     works rather than one that works and is unsafe.
{
  const g = fakeGit({
    'ls-files': { stdout: '100644 aaa 0\tx\0' },
    'rev-parse': { stdout: 'samesha\n' }
  })
  const out = await committerOn(g.run)({ root: '/r', paths: ['x'], message: 'm' })
  const sub = g.calls.map((c) => c.args[2])
  const heads = sub.reduce((acc, name, i) => name === 'rev-parse' ? [...acc, i] : acc, [])
  ok('65 HEAD is read before read-tree and again immediately before the commit',
    out.kind === 'committed' &&
      heads.length >= 2 &&
      heads[0] < sub.indexOf('read-tree') &&
      heads[1] === sub.indexOf('commit') - 1)
}

// 66. HEAD MOVED, so nothing is committed. `head-moved` is its own arm rather
//     than a `failed` with a sentence in it, for the reason refused/failed and
//     not-a-repo/repo-unreadable are each two arms: "someone committed
//     underneath you, re-read and try again" and "this did not run" have two
//     different fixes, and the first one's fix is a button the node already
//     has. The discriminating clause is that `commit` was never called — an
//     implementation that detected the move AFTER committing has detected
//     nothing, since the damage is the commit.
//
//     The fake answers the two HEAD reads in call order, which is the only
//     way to express a repository that moved underneath a running
//     transaction.
{
  const shas = ['before\n', 'after\n']
  let nth = 0
  const g = fakeGit({ 'rev-parse': () => ({ stdout: shas[Math.min(nth++, 1)] }) })
  const out = await committerOn(g.run)({ root: '/r', paths: ['x'], message: 'm' })
  ok('66 a HEAD that moved refuses, and never reaches git commit',
    out.kind === 'head-moved' && !g.calls.some((c) => c.args[2] === 'commit'))
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
    ok('61-63, 67 SKIPPED — no git binary found', true, 'skipped, not passed')
  } else {
    const root = mkdtempSync(join(tmpdir(), 'tc m9c commit '))
    const g = (...args) => execFileSync(git, ['-C', root, ...args], { encoding: 'utf8' })
    g('init', '-q', '.')
    g('config', 'user.email', 't@t')
    g('config', 'user.name', 'T')
    writeFileSync(join(root, 'a.txt'), 'base\n')
    // Committed now so the agent can DELETE it below — the third shape a
    // numstat reports, and the one whose reconcile has no ls-files entry to
    // work from. See check 63's deletion clause.
    writeFileSync(join(root, 'gone.txt'), 'doomed\n')
    g('add', 'a.txt', 'gone.txt')
    g('commit', '-qm', 'first')

    // The agent's work: one modified file, one brand-new one, one deleted.
    writeFileSync(join(root, 'a.txt'), 'base\nagent\n')
    writeFileSync(join(root, 'new file.txt'), 'agent\n')
    rmSync(join(root, 'gone.txt'))
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
      root, paths: ['a.txt', 'new file.txt', 'gone.txt'], message: 'agent work'
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
    //
    //     The DELETED path is the clause the --cacheinfo half cannot reach:
    //     `ls-files --stage` prints nothing for it, so there is no entry to
    //     restage and the real index keeps the one it had — measured, that
    //     is `AD gone.txt`, the file staged as NEW in a repository whose HEAD
    //     just deleted it. It is asserted through the SAME `git status` read
    //     as its neighbours rather than as a second mechanism, because what
    //     is wrong in every one of these cases is what git derives from the
    //     index, not the bytes in it.
    const status = g('status', '--porcelain')
    const committedFiles = g('show', '--stat', '--name-only', '--format=', 'HEAD')
    ok('63 the reconcile leaves no phantom staged change, and the user\'s own staging survives',
      committedFiles.includes('a.txt') && committedFiles.includes('new file.txt') &&
        committedFiles.includes('gone.txt') &&
        !/^[ADM]M? +(a\.txt|new file\.txt)/m.test(status) &&
        // A correctly reconciled deletion leaves NO status line for that path
        // at all, so this is an absence rather than a shape — the index-state
        // regex above cannot express it, because the wrong answer here is
        // `AD`, whose second column is a D the pattern's ` +` never reaches.
        !/gone\.txt/.test(status) &&
        /^A  mine\.txt/m.test(status),
      `status=${JSON.stringify(status)}`)

    rmSync(root, { recursive: true, force: true })
    rmSync(scratchDir, { recursive: true, force: true })
    try { rmSync(hookLog) } catch { /* best effort */ }

    // 67. THE RACE, RUN. Checks 65 and 66 pin the guard's shape against a
    //     fake; this is the repository actually moving underneath a
    //     transaction in flight, which is the only form of evidence that says
    //     the two HEAD reads are pointed at the right thing. The concurrent
    //     commit is fired from inside the runner the instant `read-tree`
    //     resolves — precisely the window the guard exists to cover, and the
    //     window a real pre-commit hook holds open for as long as it runs.
    //
    //     The clause worth having is the LAST one. Refusing is only half the
    //     answer: what makes the refusal correct is that the other committer's
    //     work is still HEAD afterwards, which is exactly what the unguarded
    //     sequencer destroyed — it seeds from HEAD at T0 and parents on HEAD at
    //     T2, so it reverts everything the intervening commit touched outside
    //     its own path set, silently, in a commit that looks ordinary.
    const root2 = mkdtempSync(join(tmpdir(), 'tc m9c race '))
    const g2 = (...args) => execFileSync(git, ['-C', root2, ...args], { encoding: 'utf8' })
    g2('init', '-q', '.')
    g2('config', 'user.email', 't@t')
    g2('config', 'user.name', 'T')
    writeFileSync(join(root2, 'ours.txt'), 'base\n')
    writeFileSync(join(root2, 'theirs.txt'), 'base\n')
    g2('add', 'ours.txt', 'theirs.txt')
    g2('commit', '-qm', 'first')
    // The work this node is reporting, and an unrelated file the OTHER
    // committer owns — unrelated is the point, since it is the files outside
    // our path set that an unguarded commit reverts.
    writeFileSync(join(root2, 'ours.txt'), 'base\nagent\n')

    const scratchDir2 = mkdtempSync(join(tmpdir(), 'tc m9c raceidx '))
    const runner2 = R.createGitRunner({ gitPath: () => git, env: () => ({}), timeoutMs: () => 20000 })
    let raced = false
    const racingRun = async (args, opts) => {
      const result = await runner2(args, opts)
      if (args[2] === 'read-tree' && !raced) {
        raced = true
        writeFileSync(join(root2, 'theirs.txt'), 'base\nsomeone else\n')
        g2('add', 'theirs.txt')
        g2('commit', '-qm', 'concurrent')
      }
      return result
    }
    const commit2 = R.createReviewCommitter({
      run: racingRun,
      tempIndexPath: () => join(scratchDir2, 'index'),
      removeTempIndex: (p) => { try { rmSync(p) } catch { /* best effort */ } }
    })
    const raceOut = await commit2({ root: root2, paths: ['ours.txt'], message: 'agent work' })
    const head2 = g2('log', '-1', '--format=%s').trim()
    // Read out of the COMMITTED TREE, never the working tree. Our commit
    // never writes theirs.txt on disk, so a working-tree read says
    // "someone else" under the broken sequencer too and asserts nothing at
    // all. The revert this guards is a TREE fact: the scratch index was
    // seeded from the old HEAD, so the new commit's tree carries the
    // PRE-concurrent content for every path outside our own set.
    const theirsInHead = g2('show', 'HEAD:theirs.txt')
    ok('67 a commit landing mid-transaction is refused, and survives',
      raceOut.kind === 'head-moved' && raced &&
        head2 === 'concurrent' && theirsInHead.includes('someone else'),
      `kind=${raceOut.kind} raced=${raced} head=${head2} theirsInHead=${JSON.stringify(theirsInHead)}`)

    rmSync(root2, { recursive: true, force: true })
    rmSync(scratchDir2, { recursive: true, force: true })
  }
}

// M53 — Discard. A NEW module beside the committer, driven with the same fake
// runner. Every check here is a refusal or an ordering, because the operation
// is the one this app has that destroys work.
{
  const can = typeof R.createReviewDiscarder === 'function'
  const fakeFs = () => {
    const removed = []
    const dirs = new Set()
    return { removed, dirs, removeFile: (p) => { removed.push(p) }, isDirectory: (p) => dirs.has(p) }
  }
  const discarderOn = (run, fs, shared = () => 0) =>
    can ? R.createReviewDiscarder({ run, peersInRepo: shared, removeFile: fs.removeFile, isDirectory: fs.isDirectory }) : null
  const REQ = { root: '/r', baseline: 'base1', subjectId: 'p1', paths: ['kept.ts', 'sub/new.ts'] }

  // discard.1 — argv and order: exists, ls-tree (exact, NUL, over the request's
  // paths), ONE restore over exactly the held paths with --worktree and never
  // --staged, then the fs removal for the path the baseline never held.
  {
    const fs = fakeFs()
    const g = fakeGit({ 'ls-tree': { stdout: 'kept.ts\0' } })
    const out = can ? await discarderOn(g.run, fs)(REQ) : null
    const sub = g.calls.map((c) => c.args[2])
    const restore = g.calls.find((c) => c.args[2] === 'restore')
    const lsTree = g.calls.find((c) => c.args[2] === 'ls-tree')
    ok('discard.1 ls-tree then ONE worktree-only restore over the held paths, and removal for the rest',
      can && out.kind === 'discarded' && out.restored.join() === 'kept.ts' && out.removed.join() === '/r/sub/new.ts' &&
        out.failed.length === 0 &&
        sub.indexOf('cat-file') < sub.indexOf('ls-tree') && sub.indexOf('ls-tree') < sub.indexOf('restore') &&
        sub.filter((n) => n === 'restore').length === 1 &&
        lsTree.args.includes('-z') && lsTree.args.includes('--name-only') && lsTree.args.includes('base1') &&
        lsTree.args.slice(lsTree.args.indexOf('--') + 1).join() === 'kept.ts,sub/new.ts' &&
        restore.args.includes('--source=base1') && restore.args.includes('--worktree') && !restore.args.includes('--staged') &&
        restore.args.slice(restore.args.indexOf('--') + 1).join() === 'kept.ts' &&
        fs.removed.join() === '/r/sub/new.ts',
      can ? JSON.stringify({ out, sub, removed: fs.removed }) : 'createReviewDiscarder is not exported')
  }
  // discard.2 — a path absent at baseline is removed through the injected fs
  // and NEVER through git: no `rm`, no `update-index`, and no restore at all
  // when nothing is held.
  {
    const fs = fakeFs()
    const g = fakeGit({ 'ls-tree': { stdout: '' } })
    const out = can ? await discarderOn(g.run, fs)({ ...REQ, paths: ['only-new.ts'] }) : null
    const sub = g.calls.map((c) => c.args[2])
    ok('discard.2 an absent-at-baseline path is removed by the fs, never by a git write',
      can && out.kind === 'discarded' && out.removed.join() === '/r/only-new.ts' && out.restored.length === 0 &&
        !sub.includes('rm') && !sub.includes('update-index') && !sub.includes('restore'),
      can ? JSON.stringify({ out, sub }) : 'absent')
  }
  // discard.3 — shared refuses BEFORE any git call. The node model blocks the
  // control too, but the node's result can be stale; main's own count is the
  // refusal that cannot be forgotten by a later UI.
  {
    const fs = fakeFs()
    const g = fakeGit({})
    const out = can ? await discarderOn(g.run, fs, () => 1)(REQ) : null
    ok('discard.3 a shared checkout refuses before any git call and removes nothing',
      can && out.kind === 'refused' && /share/.test(out.detail) && g.calls.length === 0 && fs.removed.length === 0,
      can ? JSON.stringify({ out, calls: g.calls.length }) : 'absent')
  }
  // discard.4 — a lost baseline refuses: there is nothing to restore TO, and
  // removing the added files while restoring nothing would be half a discard
  // presented as one.
  {
    const fs = fakeFs()
    const g = fakeGit({ 'cat-file': { ok: false, code: 1, stderr: '' } })
    const out = can ? await discarderOn(g.run, fs)(REQ) : null
    const sub = g.calls.map((c) => c.args[2])
    ok('discard.4 a lost baseline refuses, and neither restores nor removes',
      can && out.kind === 'refused' && /baseline/.test(out.detail) && !sub.includes('restore') && fs.removed.length === 0,
      can ? JSON.stringify({ out, sub }) : 'absent')
  }
  // discard.5 — a restore that exits non-zero is `failed` per held path, and
  // the removals still happen and are still reported: a half-done discard
  // that said only "failed" would have the user retry what already happened.
  {
    const fs = fakeFs()
    const g = fakeGit({ 'ls-tree': { stdout: 'kept.ts\0' }, restore: { ok: false, code: 1, stderr: 'error: unable to write kept.ts' } })
    const out = can ? await discarderOn(g.run, fs)(REQ) : null
    ok('discard.5 a failing restore is reported per path beside the removals that happened',
      can && out.kind === 'discarded' && out.restored.length === 0 && out.removed.join() === '/r/sub/new.ts' &&
        out.failed.length === 1 && out.failed[0].path === 'kept.ts' && /unable to write/.test(out.failed[0].detail),
      can ? JSON.stringify(out) : 'absent')
  }
  // discard.6 — a path that is a DIRECTORY in the worktree is refused per
  // path: ls-tree with a directory pathspec lists its children, never itself,
  // so it would be "absent" and the fs removal would take a tree.
  {
    const fs = fakeFs()
    fs.dirs.add('/r/build')
    const g = fakeGit({ 'ls-tree': { stdout: '' } })
    const out = can ? await discarderOn(g.run, fs)({ ...REQ, paths: ['build', 'gone.ts'] }) : null
    ok('discard.6 a directory path is refused per path and never removed; the file beside it still is',
      can && out.kind === 'discarded' && out.removed.join() === '/r/gone.ts' && fs.removed.join() === '/r/gone.ts' &&
        out.failed.length === 1 && out.failed[0].path === 'build' && /director/.test(out.failed[0].detail),
      can ? JSON.stringify({ out, removed: fs.removed }) : 'absent')
  }
  // discard.7 — no paths is its own arm, before any call.
  {
    const fs = fakeFs()
    const g = fakeGit({})
    const out = can ? await discarderOn(g.run, fs)({ ...REQ, paths: [] }) : null
    ok('discard.7 no paths is nothing-to-discard, before any git call',
      can && out.kind === 'nothing-to-discard' && g.calls.length === 0, can ? JSON.stringify(out) : 'absent')
  }
}

// M77 — tools.1. THE TOOL-CALL → FILE INDEX. A tool names a file only through
//     file_path / path / notebook_path as a STRING; a Bash command that
//     mentions a path names nothing (indexing it would attribute a `cat` to
//     an edit). Touches keep transcript order; grouping is by the path
//     RELATIVE to the repository root, which is how a review row spells it;
//     a path outside the root stays as typed.
{
  const turns = [
    { id: 'u1', role: 'user', blocks: [{ type: 'text', text: 'go' }], at: 1 },
    { id: 'm1', role: 'assistant', blocks: [
      { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/repo/src/a.ts' } },
      { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'cat /repo/src/b.ts' } },
      { type: 'tool_use', id: 't3', name: 'Edit', input: { file_path: '/repo/src/a.ts', old_string: 'x', new_string: 'y' } }
    ], at: 2 },
    { id: 'u2', role: 'user', blocks: [{ type: 'tool_result', toolUseId: 't1', content: '', isError: false }], at: 3 },
    { id: 'm2', role: 'assistant', blocks: [
      { type: 'tool_use', id: 't4', name: 'NotebookEdit', input: { notebook_path: '/repo/nb.ipynb' } },
      { type: 'tool_use', id: 't5', name: 'Glob', input: { path: '/elsewhere/x', pattern: '*' } },
      { type: 'tool_use', id: 't6', name: 'Write', input: { file_path: 42 } }
    ], at: 4 }
  ]
  const touches = R.indexToolFiles(turns)
  const byPath = R.touchesByPath(touches, '/repo')
  // The symlinked root: git says /private/var/x, the agent says /var/x.
  const viaRows = R.touchesByPath([{ path: '/var/x/src/a.ts', turnId: 'm', toolUseId: 't', toolName: 'Edit', at: 1 }], '/private/var/x', ['src/a.ts', 'a.ts'])
  const noRow = R.matchReviewPath('/var/x/src/a.ts', '/private/var/x', ['b.ts'])
  // Another repository with the same row path is NOT a match: the directory
  // the row hangs from must end with the root's own last segment.
  const otherRepo = R.matchReviewPath('/home/u/other/src/a.ts', '/private/var/x', ['src/a.ts'])
  const sameTail = R.matchReviewPath('/var/x/src/a.ts', '/private/var/x', ['a.ts', 'src/a.ts'])
  ok('tools.1 the index lists every tool_use naming a file (file_path/path/notebook_path as a string), in order, never a Bash command; grouped by the root-relative path, by the longest known row a symlinked path ends with, else as typed',
    R.toolFilePath({ file_path: '/x' }) === '/x' && R.toolFilePath({ command: 'cat /x' }) === null && R.toolFilePath({ file_path: 7 }) === null &&
      touches.length === 4 && touches.map((t) => t.toolUseId).join(',') === 't1,t3,t4,t5' && touches[1].toolName === 'Edit' && touches[1].turnId === 'm1' && touches[1].at === 2 &&
      byPath instanceof Map && byPath.get('src/a.ts')?.length === 2 && byPath.get('nb.ipynb')?.length === 1 && byPath.get('/elsewhere/x')?.length === 1 && byPath.size === 3 &&
      viaRows.get('src/a.ts')?.length === 1 && noRow === null && otherRepo === null && sameTail === 'src/a.ts',
    JSON.stringify({ touches, keys: byPath instanceof Map ? [...byPath.keys()] : byPath }))
}

// M86 — git.1. THE BUILDERS AND PARSERS, pure, and the ONE RULE this
//      milestone rests on: NO FETCH. Ahead/behind is what the local tracking
//      ref says; a builder that fetched would put a network call behind a
//      pane that reads as passive. Asserted as TEXT over git-args.ts, because
//      no fake runner can prove an absence. `rev-list --left-right --count`
//      prints `A<TAB>B` — a parser splitting on spaces reads it as one field
//      and answers null for every real answer. A detached worktree's porcelain
//      has `detached` and no `branch` line: `null`, never a branch called HEAD.
{
  const has = (n) => typeof R[n] === 'function'
  const src = require('node:fs').readFileSync(join(__dirname, '..', 'src', 'main', 'git-args.ts'), 'utf8')
  const noFetch = !/'fetch'|'pull'|'ls-remote'|"fetch"|"pull"/.test(src)
  const ab = has('buildAheadBehindArgs') ? R.buildAheadBehindArgs('/r') : null
  const up = has('buildUpstreamArgs') ? R.buildUpstreamArgs('/r') : null
  const wl = has('buildWorktreeListArgs') ? R.buildWorktreeListArgs('/r') : null
  const mb = has('buildMergeBaseArgs') ? R.buildMergeBaseArgs('/r/wt', 'abc') : null
  const parsed = has('parseAheadBehind') ? {
    tab: R.parseAheadBehind('2\t1\n'), zero: R.parseAheadBehind('0\t0\n'),
    junk: R.parseAheadBehind('fatal: no upstream\n'), empty: R.parseAheadBehind(''), one: R.parseAheadBehind('3\n')
  } : null
  const trees = has('parseWorktreeList') ? R.parseWorktreeList([
    'worktree /r', 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '',
    'worktree /r/../wt one', 'HEAD 2222222222222222222222222222222222222222', 'branch refs/heads/tc/p1-x', '',
    'worktree /det', 'HEAD 3333333333333333333333333333333333333333', 'detached', ''
  ].join('\n')) : null
  ok('git.1 no fetch/pull/ls-remote is built anywhere; ahead/behind args are rev-list --left-right --count HEAD...@{u} and its TAB output parses to two integers (junk, empty and one field are null); worktree list --porcelain parses paths, heads and branches with a detached tree as branch null',
    noFetch && ab && ab.join(' ') === '-C /r rev-list --left-right --count HEAD...@{u}' &&
      up && up.join(' ') === '-C /r rev-parse --abbrev-ref --symbolic-full-name @{u}' &&
      wl && wl.join(' ') === '-C /r worktree list --porcelain' &&
      mb && mb.join(' ') === '-C /r/wt merge-base HEAD abc' &&
      parsed && parsed.tab && parsed.tab.ahead === 2 && parsed.tab.behind === 1 && parsed.zero && parsed.zero.ahead === 0 &&
      parsed.junk === null && parsed.empty === null && parsed.one === null &&
      Array.isArray(trees) && trees.length === 3 && trees[0].path === '/r' && trees[0].branch === 'main' && trees[0].head.startsWith('1111') &&
      trees[1].path === '/r/../wt one' && trees[1].branch === 'tc/p1-x' && trees[2].branch === null,
    JSON.stringify({ noFetch, ab, up, wl, mb, parsed, trees }))
}

// M86 — git.2. AGAINST REAL GIT: a bare remote, a clone with a tracking
//      branch, commits on both sides, and two worktrees the app "created".
//      (a) `status` reads ahead 1 / behind 1 from the LOCAL tracking ref after
//          a fetch this check performs itself — the app never fetches; the
//          numbers are only as fresh as the user's last fetch and the pane
//          says so. (b) A branch with no upstream is `upstream: null`, a real
//          answer, never 0/0. (c) `reviewAcross` lists the main tree first and
//          one section per worktree record, each worktree's files being its
//          diff since its FORK from the main tree — a section for a worktree
//          whose panel was never spawned or was killed, because the fork is
//          what the diff is against, never a panel's baseline.
if (GIT) {
  const fs = require('node:fs')
  const base = mkdtempSync(join(tmpdir(), 'tc review across '))
  const bare = join(base, 'origin.git')
  const clone = join(base, 'clone here')
  const g = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
  execFileSync('git', ['init', '-q', '--bare', bare])
  execFileSync('git', ['clone', '-q', bare, clone])
  g(clone, 'config', 'user.email', 'v@e.com'); g(clone, 'config', 'user.name', 'v')
  g(clone, 'checkout', '-q', '-b', 'main')
  fs.writeFileSync(join(clone, 'a.txt'), 'base\n'); g(clone, 'add', '-A'); g(clone, 'commit', '-qm', 'init')
  g(clone, 'push', '-q', '-u', 'origin', 'main')
  // One commit here (ahead 1), one on the remote through a second clone (behind 1).
  fs.writeFileSync(join(clone, 'b.txt'), 'local\n'); g(clone, 'add', '-A'); g(clone, 'commit', '-qm', 'local')
  const other = join(base, 'other')
  execFileSync('git', ['clone', '-q', bare, other])
  g(other, 'config', 'user.email', 'v@e.com'); g(other, 'config', 'user.name', 'v')
  fs.writeFileSync(join(other, 'c.txt'), 'remote\n'); g(other, 'add', '-A'); g(other, 'commit', '-qm', 'remote'); g(other, 'push', '-q', 'origin', 'HEAD:main')
  g(clone, 'fetch', '-q')
  const runner = R.createGitRunner({ gitPath: () => 'git', env: () => process.env, timeoutMs: () => 20000 })
  const wtDir = join(base, 'worktrees')
  fs.mkdirSync(wtDir)
  const records = []
  const engine = R.createReviewEngine({
    run: runner, baselineOf: () => undefined, peersInRepo: () => 0,
    worktreesOf: (root) => records.filter((r) => r.root === root)
  })
  const rootAnswer = await engine.resolveRepo(clone)
  const root = rootAnswer.kind === 'root' ? rootAnswer.root : clone
  // Two worktrees on tc/ branches, as the manager would make them; one gets a change.
  const wt1 = join(wtDir, 'one'); const wt2 = join(wtDir, 'two')
  g(clone, 'worktree', 'add', '-q', '-b', 'tc/p1-x', wt1, 'HEAD')
  g(clone, 'worktree', 'add', '-q', '-b', 'tc/p2-x', wt2, 'HEAD')
  fs.writeFileSync(join(wt1, 'a.txt'), 'changed in one\n')
  g(wt1, 'config', 'user.email', 'v@e.com'); g(wt1, 'config', 'user.name', 'v')
  g(wt1, 'commit', '-qam', 'work in one')
  fs.writeFileSync(join(wt1, 'd.txt'), 'uncommitted in one\n')
  records.push({ id: 'w1', root, path: wt1, branch: 'tc/p1-x', createdAt: 1, panelId: 'p1' })
  records.push({ id: 'w2', root, path: wt2, branch: 'tc/p2-x', createdAt: 2, panelId: 'p2' })
  const status = typeof engine.status === 'function' ? await engine.status(root) : null
  const noUp = typeof engine.status === 'function' ? await engine.status(wt1) : null
  const across = typeof engine.reviewAcross === 'function' ? await engine.reviewAcross(root) : null
  const sec = (i) => (across && across.kind === 'across' ? across.sections[i] : undefined)
  // (d) Asked from INSIDE a worktree, the answer is the repository's — the
  //     same three sections — because a panel spawned into a worktree
  //     resolves its root to the worktree (M86's verifier). And the status
  //     asked there names the REPOSITORY, never the worktree's leaf.
  const fromInside = typeof engine.reviewAcross === 'function' ? await engine.reviewAcross(wt2) : null
  // (e) A worktree with NO COMMON HISTORY is a readable tree whose section
  //     says so, not "could not be read"; a record whose directory was
  //     removed outside the app says that.
  const wt3 = join(wtDir, 'three')
  g(clone, 'worktree', 'add', '-q', '--detach', wt3, 'HEAD')
  g(wt3, 'checkout', '-q', '--orphan', 'tc/orphan'); g(wt3, 'config', 'user.email', 'v@e.com'); g(wt3, 'config', 'user.name', 'v')
  fs.writeFileSync(join(wt3, 'z.txt'), 'orphan\n'); g(wt3, 'add', '-A'); g(wt3, 'commit', '-qm', 'orphan')
  records.push({ id: 'w3', root, path: wt3, branch: 'tc/orphan', createdAt: 3, panelId: 'p3' })
  g(clone, 'worktree', 'remove', '--force', wt2)
  const afterChanges = typeof engine.reviewAcross === 'function' ? await engine.reviewAcross(root) : null
  const secOf = (branch) => (afterChanges && afterChanges.kind === 'across' ? afterChanges.sections.find((x) => x.branch === branch) : undefined)
  ok('git.2 status reads ahead 1 / behind 1 from the tracking ref after a fetch the CHECK ran and names the repository even from a worktree; a branch with no upstream answers null; reviewAcross lists the main tree first then one section per worktree record — a worktree\'s files being its diff since its fork, an untouched worktree clean — and answers the SAME from inside a worktree; an orphan branch says no common history and a removed worktree says so',
    status && status.kind === 'status' && status.branch === 'main' && status.upstream && status.upstream.ahead === 1 && status.upstream.behind === 1 &&
      noUp && noUp.kind === 'status' && noUp.branch === 'tc/p1-x' && noUp.upstream === null &&
      across && across.kind === 'across' && across.sections.length === 3 &&
      sec(0).path === root && sec(0).branch === 'main' &&
      sec(1).branch === 'tc/p1-x' && sec(1).panelId === 'p1' && sec(1).result.kind === 'changes' &&
      sec(1).result.files.some((f) => f.path === 'a.txt' && !f.untracked) && sec(1).result.files.some((f) => f.path === 'd.txt' && f.untracked) &&
      sec(2).branch === 'tc/p2-x' && sec(2).result.kind === 'clean' &&
      status.repository === root && noUp.repository === root &&
      fromInside && fromInside.kind === 'across' && fromInside.root === root && fromInside.sections.length === 3 && fromInside.sections[0].branch === 'main' &&
      secOf('tc/orphan') && secOf('tc/orphan').result.kind === 'baseline-lost' && /no common history/.test(secOf('tc/orphan').note ?? '') &&
      secOf('tc/p2-x') && /no longer a worktree/.test(secOf('tc/p2-x').note ?? ''),
    JSON.stringify({ status, noUp, across, fromInside: fromInside && { root: fromInside.root, n: fromInside.sections && fromInside.sections.length }, orphan: secOf('tc/orphan'), removed: secOf('tc/p2-x') }))
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)

})()
