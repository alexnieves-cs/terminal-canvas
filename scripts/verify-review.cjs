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

const { ok, results } = require('./lib/checks.cjs').createChecks()

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
const { mkdtempSync, writeFileSync, appendFileSync, readFileSync, readdirSync } = require('node:fs')
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

// M115 — lane.1. AHEAD OF THE ROOT. A dispatched lane's branch has no
//      upstream until it is pushed, so `status`'s ahead/behind (against @{u})
//      is null for exactly the branch the card asks about. The lane arm asks
//      `rev-list --left-right --count <base>...HEAD` in the lane, base being
//      the ROOT's branch — left is base, right is HEAD, so the parser's arms
//      are swapped on purpose. NO FETCH, still (git.1's text rule covers the
//      new builder by construction). Three arms, never two.
{
  const has = (n) => typeof R[n] === 'function'
  let args, parsed, laneOk, laneMissing, laneBad, laneNoRoot
  try {
    args = has('buildAheadOfArgs') ? R.buildAheadOfArgs('/app/wt/lane', 'main') : null
    parsed = has('parseAheadOf') ? { tab: R.parseAheadOf('1\t3\n'), junk: R.parseAheadOf('fatal: bad\n') } : null
    const mk = (answers) => R.createReviewEngine({ run: async (argv) => { const key = argv.join(' '); const a = answers.find(([re]) => re.test(key)); return a ? a[1] : { ok: false, stdout: '', stderr: 'unexpected ' + key, notFound: false, status: 1 } }, baselineOf: () => undefined, peersInRepo: () => 0, gitPath: () => '/usr/bin/git' })
    const good = mk([[/rev-parse --abbrev-ref HEAD/, { ok: true, stdout: 'main\n', stderr: '', notFound: false, status: 0 }], [/rev-list --left-right --count main\.\.\.HEAD/, { ok: true, stdout: '0\t2\n', stderr: '', notFound: false, status: 0 }]])
    laneOk = await good.laneStatus('/app/wt/lane', '/home/u/repo')
    const missing = R.createReviewEngine({ run: async () => ({ ok: false, stdout: '', stderr: '', notFound: true, status: -1 }), baselineOf: () => undefined, peersInRepo: () => 0, gitPath: () => null })
    laneMissing = await missing.laneStatus('/app/wt/lane', '/home/u/repo')
    const bad = mk([[/rev-parse --abbrev-ref HEAD/, { ok: true, stdout: 'main\n', stderr: '', notFound: false, status: 0 }], [/rev-list/, { ok: false, stdout: '', stderr: 'fatal: bad revision\n', notFound: false, status: 128 }]])
    laneBad = await bad.laneStatus('/app/wt/lane', '/home/u/repo')
    const noRoot = mk([[/rev-parse --abbrev-ref HEAD/, { ok: false, stdout: '', stderr: 'fatal: not a git repository\n', notFound: false, status: 128 }]])
    laneNoRoot = await noRoot.laneStatus('/app/wt/lane', '/home/u/repo')
  } catch (e) { laneOk = { threw: String(e) } }
  ok('lane.1 buildAheadOfArgs is rev-list --left-right --count <base>...HEAD in the LANE; parseAheadOf reads left as behind and right as ahead (junk is null); the engine answers lane with the root\'s branch as base, git-missing when git is absent, and unreadable with git\'s own line for a failed count or an unreadable root',
    args && args.join(' ') === '-C /app/wt/lane rev-list --left-right --count main...HEAD' &&
      parsed && parsed.tab && parsed.tab.ahead === 3 && parsed.tab.behind === 1 && parsed.junk === null &&
      laneOk && laneOk.kind === 'lane' && laneOk.base === 'main' && laneOk.ahead === 2 && laneOk.behind === 0 &&
      laneMissing && laneMissing.kind === 'git-missing' &&
      laneBad && laneBad.kind === 'unreadable' && /bad revision/.test(laneBad.detail) &&
      laneNoRoot && laneNoRoot.kind === 'unreadable' && /not a git repository/.test(laneNoRoot.detail),
    JSON.stringify({ args, parsed, laneOk, laneMissing, laneBad, laneNoRoot }))
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
  // M124. The bare origin's HEAD must NAME main: on a runner whose init.defaultBranch
  // is master, HEAD points at a branch that never exists, the second clone checks
  // out an unborn branch, its commit starts a second root, and `push HEAD:main`
  // is non-fast-forward — the CI red of Act 0, locally green because the
  // author's default branch is main. symbolic-ref works on every git.
  execFileSync('git', ['-C', bare, 'symbolic-ref', 'HEAD', 'refs/heads/main'])
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
  g(other, 'checkout', '-q', 'main')
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

// M196 (D04) — scope.resolve.1. THE SEVEN ARMS, and the two that were being
//      answered wrongly with no symptom.
//      `rev-parse --show-toplevel` inside a linked worktree answers the LANE
//      (measured against a real repository before this was written), so every
//      door that asked only that question has been treating a lane as a
//      repository of its own. Two sources fix it and BOTH are needed: the
//      app's record, which is the only thing that knows the branch, and
//      `--git-common-dir`, which is the only thing that knows about a worktree
//      the app did not make.
//      The arm with no visible symptom is `unavailable`: git declining is not
//      "this is its own subject", and collapsing them is what let a transient
//      git failure key a memory file by the wrong path, silently.
{
  const NAME = 'scope.resolve.1 the scope resolver answers a plain repository with NO lane, an app lane through its record (branch carried) from the lane root AND from a subdirectory of it, an externally created worktree through --git-common-dir with no record at all, a non-git folder as no-repository, git declining as unavailable carrying git\'s own line rather than as a repository, a relative path as unavailable rather than resolved against a guess, a common dir that parses to nothing (a submodule\'s shape) as the toplevel rather than an invented parent, and a repository NESTED inside a lane as its OWN repository rather than the lane\'s parent'
  const has = typeof R.createScopeResolver === 'function'
  if (!has) ok(NAME, false, 'main/work-scope.ts does not export createScopeResolver')
  else {
    const REPO = '/w/api'
    const LANE = '/u/worktrees/api-ab12/tc-p1'
    const EXT = '/w/api-hotfix'
    const records = [{ id: 'w1', path: LANE, root: REPO, branch: 'tc/p1' }]
    // The toplevel git reports for a directory, and the common dir it reports
    // for that toplevel. `commonRootOf` already answers its INPUT when git
    // cannot parse a `/.git` suffix, which is the submodule fall-through.
    // A repository NESTED inside the lane: an agent's cloned dependency, or a
    // submodule. git gives it its own toplevel, and `--git-common-dir` names
    // its own `.git`, so it is a repository of its own — the record covering
    // the lane must not claim it.
    const NESTED = `${LANE}/vendor/dep`
    const tops = { [REPO]: REPO, [`${REPO}/src`]: REPO, [LANE]: LANE, [`${LANE}/src`]: LANE, [EXT]: EXT, '/w/sub': '/w/sub', [NESTED]: NESTED, [`${NESTED}/lib`]: NESTED }
    const commons = { [REPO]: REPO, [LANE]: REPO, [EXT]: REPO, '/w/sub': '/w/sub', [NESTED]: NESTED }
    const make = (over) => R.createScopeResolver({
      resolveRepo: async (cwd) => (over && over.resolveRepo ? over.resolveRepo(cwd) : (tops[cwd] === undefined ? { kind: 'not-a-repo' } : { kind: 'root', root: tops[cwd] })),
      commonRootOf: async (root) => (over && over.commonRootOf ? over.commonRootOf(root) : (commons[root] ?? root)),
      worktrees: () => (over && over.worktrees ? over.worktrees : records)
    })
    const r = make()
    const plain = await r.resolve(REPO)
    const below = await r.resolve(`${REPO}/src`)
    const lane = await r.resolve(LANE)
    const laneSub = await r.resolve(`${LANE}/src`)
    // No record for it at all: only --git-common-dir can say it is a lane.
    const external = await make({ worktrees: [] }).resolve(EXT)
    const notRepo = await r.resolve('/tmp/scratch')
    const declined = await make({ resolveRepo: async () => ({ kind: 'unreadable', detail: 'dubious ownership in repository' }) }).resolve(REPO)
    const relative = await r.resolve('src')
    const empty = await r.resolve('')
    // A submodule: --git-common-dir is `.../.git/modules/sub`, which
    // parseCommonRoot declines, so commonRootOf answers its input. The
    // resolver must call it a repository of its own, never invent a parent.
    const submodule = await r.resolve('/w/sub')
    const nested = await r.resolve(`${NESTED}/lib`)
    ok(NAME,
      plain.kind === 'repository' && plain.repository === REPO && plain.lane === undefined &&
        below.kind === 'repository' && below.repository === REPO && below.lane === undefined && below.cwd === `${REPO}/src` &&
        lane.kind === 'repository' && lane.repository === REPO && lane.lane !== undefined && lane.lane.path === LANE && lane.lane.branch === 'tc/p1' && lane.lane.worktreeId === 'w1' &&
        // The regression main shipped: exact-path record matching left this one
        // resolving to the lane as its own repository.
        laneSub.kind === 'repository' && laneSub.repository === REPO && laneSub.lane !== undefined && laneSub.lane.branch === 'tc/p1' &&
        external.kind === 'repository' && external.repository === REPO && external.lane !== undefined && external.lane.path === EXT && external.lane.branch === undefined &&
        notRepo.kind === 'no-repository' && notRepo.cwd === '/tmp/scratch' &&
        declined.kind === 'unavailable' && /dubious ownership/.test(declined.reason) &&
        relative.kind === 'unavailable' && empty.kind === 'unavailable' && relative.reason !== empty.reason &&
        submodule.kind === 'repository' && submodule.repository === '/w/sub' && submodule.lane === undefined &&
        nested.kind === 'repository' && nested.repository === NESTED && nested.lane === undefined,
      JSON.stringify({ plain, below, lane, laneSub, external, notRepo, declined, relative, empty, submodule, nested }))
  }
}

/* ── M201 (D07). Local review readiness ──────────────────────────────────────
   Every check here guards a failure that is SILENT: a card that says "ready to
   review" while its agent is still writing, a review mark that never goes
   stale so a second look is never offered, or an agent's own claim about a
   command it ran shown beside an exit code this app actually read, with
   nothing to tell them apart. */
{
  const LANE = '/w/lanes/tc-p1'
  const file = (path, added, removed, extra) => ({ path, added, removed, binary: false, untracked: false, ...(extra || {}) })
  const section = (result) => ({ path: LANE, branch: 'tc/p1', label: 'lane', result })
  const changes = (files) => ({ kind: 'changes', root: LANE, files, added: files.reduce((n, f) => n + f.added, 0), removed: files.reduce((n, f) => n + f.removed, 0) })
  const item = (extra) => ({ id: 'w1', source: 'typed', title: 'a task', state: 'todo', createdAt: 1, updatedAt: 1, ...(extra || {}) })
  const laned = (extra) => item({ panelId: 'ch1', worktreeId: 'wt1', ...(extra || {}) })
  const ended = { execution: 'ended', result: 'turn-complete', word: 'turn complete', tone: 'idle', detail: 'a turn ended' }
  const running = { execution: 'running', result: 'none', word: 'working', tone: 'working', detail: 'streaming' }
  const queued = { execution: 'queued', result: 'none', word: 'queued', tone: 'idle', detail: 'behind the current turn', queueReason: 'in-flight' }
  const blocked = { execution: 'running', result: 'none', word: 'needs you', tone: 'needs-you', detail: 'asking about Bash', blocker: { kind: 'approval', subject: 'Bash' } }

  // M315. accepted.1 — a merged task reads as merged, whatever its lane's diff
  // says now: after a merge the lane is compared against a main tree that
  // already holds its commits, so the section reads clean and the mark stale.
  {
    const mark = { at: 1, signature: 'deadbeef', files: 2 }
    const merged = R.reviewHandoff({ item: laned({ reviewed: mark, merged: { into: 'main', sha: 'ef90985abcdef' } }), section: section({ kind: 'clean', root: LANE }), supervision: ended })
    const unmerged = R.reviewHandoff({ item: laned({ reviewed: mark }), section: section({ kind: 'clean', root: LANE }), supervision: ended })
    ok('accepted.1 a task the person merged is `accepted`, names the branch and the commit, and outranks the clean lane its merge produced; without the record the same lane is the ordinary clean arm',
      merged.state === 'accepted' && merged.word === 'merged into main' && /ef90985/.test(merged.detail) && !/ef90985a/.test(merged.detail) &&
        unmerged.state !== 'accepted',
      JSON.stringify({ merged, unmerged }))
  }

  // M401 (B2). accepted.lane.1 — the accepted sentence promises a lane only
  // while there is one: after the review's own Remove lane, the section is
  // gone and the detail says the lane was removed. mergedLine is the one
  // spelling of "merged into main as <sha7>" the navigator and the return
  // notice share with it.
  {
    const mark = { at: 1, signature: 'deadbeef', files: 2 }
    const kept = R.reviewHandoff({ item: laned({ reviewed: mark, merged: { into: 'main', sha: 'ef90985abcdef' } }), section: section({ kind: 'clean', root: LANE }), supervision: ended })
    const removed = R.reviewHandoff({ item: laned({ reviewed: mark, merged: { into: 'main', sha: 'ef90985abcdef' } }), section: undefined, supervision: ended })
    const line = R.mergedLine({ into: 'main', sha: 'ef90985abcdef' })
    ok('accepted.lane.1 an accepted task says its lane stays while the lane is listed and says it was removed once it is not — never `lane missing`, which offers Start work again for work that landed; mergedLine is the shared "merged into main as <sha7>"',
      kept.state === 'accepted' && /the lane stays until you remove it/.test(kept.detail) &&
        removed.state === 'accepted' && /its lane has been removed/.test(removed.detail) && !/stays/.test(removed.detail) &&
        line === 'merged into main as ef90985' && kept.detail.includes(line) && removed.detail.includes(line),
      JSON.stringify({ kept, removed, line }))
  }

  // M401 (B9). reviewed.copy.1 — "you reviewed these change" was the typo.
  {
    const ID = { base: 'b1', content: 'a'.repeat(32) }
    const current = (files) => R.reviewHandoff({
      item: laned({ reviewed: { at: 5, signature: R.reviewSignature(files), files: files.length, identity: ID } }),
      section: section({ ...changes(files), identity: ID }), supervision: ended
    })
    const one = current([file('a.ts', 1, 0)])
    const two = current([file('a.ts', 1, 0), file('b.ts', 2, 0)])
    ok('reviewed.copy.1 the current-review sentence agrees in number — "this change" for one file, "these changes" for more — and never says "these change"',
      one.standing === 'current' && two.standing === 'current' &&
        /you reviewed this change and/.test(one.detail) && /you reviewed these changes and/.test(two.detail) &&
        !/these change\b/.test(one.detail + two.detail),
      JSON.stringify({ one: one.detail, two: two.detail }))
  }


  {
    const NAME = 'readiness.1 the eight handoff states each come from their own input and the priority holds — no lane outranks everything, execution outranks the diff, a clean lane is `empty` rather than a green completion, a SHARED repository is its own state and is never called `ready to review`, and no arm names a door that does not exist'
    try {
      const noLane = R.reviewHandoff({ item: item(), section: section(changes([file('a.ts', 3, 1)])), supervision: ended })
      const missing = R.reviewHandoff({ item: laned(), section: undefined, supervision: ended })
      const gone = R.reviewHandoff({ item: laned(), section: { ...section({ kind: 'baseline-lost', root: LANE }), note: 'no longer a worktree — it was removed outside this app' }, supervision: ended })
      const noGit = R.reviewHandoff({ item: laned(), section: section({ kind: 'git-missing' }), supervision: ended })
      const unreadable = R.reviewHandoff({ item: laned(), section: section({ kind: 'repo-unreadable', detail: 'dubious ownership' }), supervision: ended })
      const isBlocked = R.reviewHandoff({ item: laned(), section: section(changes([file('a.ts', 3, 1)])), supervision: blocked })
      const isWorking = R.reviewHandoff({ item: laned(), section: section(changes([file('a.ts', 3, 1)])), supervision: running })
      const isQueued = R.reviewHandoff({ item: laned(), section: section(changes([file('a.ts', 3, 1)])), supervision: queued })
      const clean = R.reviewHandoff({ item: laned(), section: section({ kind: 'clean', root: LANE }), supervision: ended })
    // The fourth attribution D07 names: two panels have run here, so the diff
    // is not this task's alone and must not be worded as if it were.
    const shared = R.reviewHandoff({ item: laned(), section: section({ kind: 'shared', root: LANE, panelCount: 2, files: [file('a.ts', 3, 1)] }), supervision: ended })
      const ready = R.reviewHandoff({ item: laned(), section: section(changes([file('a.ts', 3, 1)])), supervision: ended })
      const neverRan = R.reviewHandoff({ item: laned(), section: section(changes([file('a.ts', 3, 1)])), supervision: undefined })
      ok(NAME,
        noLane.state === 'no-lane' && noLane.action === 'start' &&
          // Every recovery routes to a door that EXISTS. `locate` was removed
          // for exactly this: it told the person to locate a lane, and no
          // surface in the product offers that.
          missing.state === 'lane-missing' && missing.action === 'start' &&
          gone.state === 'lane-missing' && gone.action === 'start' &&
          noGit.state === 'unreadable' && noGit.action === 'start' &&
          unreadable.state === 'unreadable' && /dubious ownership/.test(unreadable.detail) &&
          isBlocked.state === 'blocked' && isBlocked.action === 'answer' &&
          isWorking.state === 'working' && isWorking.action === 'resume' &&
          isQueued.state === 'working' &&
          clean.state === 'empty' && clean.action === 'resume' && clean.changes === undefined &&
          ready.state === 'ready' && ready.action === 'review' && ready.changes !== undefined && ready.changes.files === 1 && ready.changes.shared === undefined &&
        // Shared: its own state, its own sentence, still reviewable — and the
        // words `ready to review` appear nowhere in it.
        shared.state === 'shared' && shared.action === 'review' && shared.changes !== undefined && shared.changes.shared === true &&
        !/ready to review/.test(shared.word) && /not attributable to this task alone/.test(shared.detail) &&
        // The blocker rides through unchanged, so this surface names the same
        // question M199's projection gave the card and the diagram.
        isBlocked.blocker !== undefined && isBlocked.blocker.kind === 'approval' && isBlocked.blocker.subject === 'Bash' &&
        ready.blocker === undefined &&
        // No arm anywhere offers an action the product does not have.
        [noLane, missing, gone, noGit, unreadable, isBlocked, isWorking, clean, shared, ready].every((h) => ['start', 'resume', 'answer', 'review'].includes(h.action)) &&
          // A conversation with no live session at all has nothing in flight,
          // so the diff under it is settled and `ready` is the right word.
          neverRan.state === 'ready' &&
          // Every arm says something; none is a bare word.
          [noLane, missing, gone, noGit, unreadable, isBlocked, isWorking, clean, shared, ready].every((h) => typeof h.word === 'string' && h.word.length > 2 && typeof h.detail === 'string' && h.detail.length > 10 && typeof h.tone === 'string'),
        JSON.stringify({ noLane, missing, gone, noGit, unreadable, isBlocked, isWorking, isQueued, clean, shared, ready, neverRan }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }

  {
    const NAME = 'readiness.2 standing is a SECOND axis and never folds into the state — a task can be working AND stale at once, and a review recorded against a different diff is `stale`, never silently `current`'
    try {
      const files = [file('a.ts', 3, 1), file('b.ts', 0, 2)]
      const sig = R.reviewSignature(files)
      const other = R.reviewSignature([file('a.ts', 4, 1)])
      // M285. The standing is decided by the CONTENT identity main sends with
      // the section; the signature stays the shape the mark describes.
      const ID = { base: 'b1', content: 'a'.repeat(32) }
      const OTHER_ID = { base: 'b1', content: 'b'.repeat(32) }
      const withId = (result, identity) => ({ ...result, identity })
      const readyCurrent = R.reviewHandoff({ item: laned({ reviewed: { at: 5, signature: sig, files: 2, identity: ID } }), section: section(withId(changes(files), ID)), supervision: ended })
      const readyStale = R.reviewHandoff({ item: laned({ reviewed: { at: 5, signature: other, files: 1, identity: OTHER_ID } }), section: section(withId(changes(files), ID)), supervision: ended })
      const workingStale = R.reviewHandoff({ item: laned({ reviewed: { at: 5, signature: other, files: 1, identity: OTHER_ID } }), section: section(withId(changes(files), ID)), supervision: running })
      const none = R.reviewHandoff({ item: laned(), section: section(withId(changes(files), ID)), supervision: ended })
      const cleanAfterReview = R.reviewHandoff({ item: laned({ reviewed: { at: 5, signature: other, files: 1, identity: OTHER_ID } }), section: section(withId({ kind: 'clean', root: LANE }, { base: 'b1', content: 'c'.repeat(32) })), supervision: ended })
      ok(NAME,
        readyCurrent.standing === 'current' && readyCurrent.state === 'ready' &&
          readyStale.standing === 'stale' && readyStale.state === 'ready' &&
          // The one this axis exists for: both facts survive.
          workingStale.standing === 'stale' && workingStale.state === 'working' &&
          none.standing === 'none' &&
          // A lane that went clean after a review is not "current": there is no diff to still be current about.
          cleanAfterReview.standing === 'stale' && cleanAfterReview.state === 'empty' &&
          R.reviewStanding(undefined, sig, ID) === 'none' &&
          R.reviewStanding({ at: 1, signature: sig, files: 2, identity: ID }, sig, ID) === 'current' &&
          R.reviewStanding({ at: 1, signature: other, files: 1, identity: OTHER_ID }, sig, ID) === 'stale' &&
          // The diff could not be read now: a recorded review is stale, not current.
          R.reviewStanding({ at: 1, signature: sig, files: 2, identity: ID }, undefined, undefined) === 'stale',
        JSON.stringify({ sig, other, readyCurrent, readyStale, workingStale, none, cleanAfterReview }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }

  {
    const NAME = 'readiness.3 the signature is order-independent and moves with a count, a path, a rename and an untracked flag — and its RECORDED BOUND holds: identical paths and counts are identical signatures, which is the limit written in the header, asserted so a later "fix" fails here first'
    try {
      const a = [file('a.ts', 3, 1), file('b.ts', 0, 2)]
      const reordered = [file('b.ts', 0, 2), file('a.ts', 3, 1)]
      const count = [file('a.ts', 4, 1), file('b.ts', 0, 2)]
      const path = [file('a.ts', 3, 1), file('c.ts', 0, 2)]
      const untracked = [file('a.ts', 3, 1), { ...file('b.ts', 0, 2), untracked: true }]
      const renamed = [file('a.ts', 3, 1), { ...file('b.ts', 0, 2), renamedFrom: 'old.ts' }]
      const sig = R.reviewSignature(a)
      ok(NAME,
        typeof sig === 'string' && /^[0-9a-f]{8}$/.test(sig) &&
          R.reviewSignature(reordered) === sig &&
          R.reviewSignature(count) !== sig &&
          R.reviewSignature(path) !== sig &&
          R.reviewSignature(untracked) !== sig &&
          R.reviewSignature(renamed) !== sig &&
          // An empty diff has a signature of its own and is not the same as
          // a one-file diff — a lane that went clean must go STALE against a
          // review recorded when it held files.
          R.reviewSignature([]) !== sig &&
          // THE BOUND, pinned by its CAUSE. The signature reads exactly five
          // named fields and NOTHING else, which is why one line edited and
          // another reverted in the same file — every path and both counts
          // unchanged — is not detected. Two rows carrying different content
          // under any other key are one signature. A content-hashing "fix"
          // would have to read outside those five fields and would fail this
          // line first. (Feeding the function the same input twice, which is
          // what this assertion was in its first cut, cannot fail for any
          // deterministic implementation and pinned nothing at all.)
          R.reviewSignature([Object.assign(file('a.ts', 3, 1), { hunks: ['-x', '+y'], blob: 'aaa' })]) ===
            R.reviewSignature([Object.assign(file('a.ts', 3, 1), { hunks: ['-p', '+q'], blob: 'zzz' })]) &&
          // …and the five that ARE read each move it, asserted above for
          // four of them and here for the fifth.
          R.reviewSignature([{ ...file('a.ts', 3, 1), binary: true }]) !== R.reviewSignature([file('a.ts', 3, 1)]),
        JSON.stringify({ sig, reordered: R.reviewSignature(reordered), count: R.reviewSignature(count), path: R.reviewSignature(path), untracked: R.reviewSignature(untracked), renamed: R.reviewSignature(renamed) }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }

  {
    const NAME = 'readiness.4 the two evidence sources stay apart — a command this app watched exit is `observed`, the same command in a transcript is `reported`, and the two are never merged into one row; a null exit code and an unanswered tool call are `unknown`, never passed'
    try {
      const rows = [
        { panelId: 'n1', command: 'npm test', cwd: `${LANE}/pkg`, startedAt: 10, endedAt: 20, exitCode: 0 },
        { panelId: 'n1', command: 'npm run lint', cwd: LANE, startedAt: 30, endedAt: 40, exitCode: 1 },
        { panelId: 'n2', command: 'npm test', cwd: '/w/elsewhere', startedAt: 50, endedAt: 60, exitCode: 0 },
        { panelId: 'n1', command: 'npm run dev', cwd: LANE, startedAt: 70, endedAt: 0, exitCode: null }
      ]
      const observed = R.observedCommands(rows, LANE)
      const turns = [
        { id: 't1', role: 'assistant', at: 100, blocks: [{ type: 'tool_use', id: 'u1', name: 'Bash', input: { command: 'npm test' } }] },
        { id: 't2', role: 'user', at: 101, blocks: [{ type: 'tool_result', toolUseId: 'u1', content: 'ok', isError: false }] },
        { id: 't3', role: 'assistant', at: 102, blocks: [{ type: 'tool_use', id: 'u2', name: 'Bash', input: { command: 'npm run build' } }] },
        { id: 't4', role: 'user', at: 103, blocks: [{ type: 'tool_result', toolUseId: 'u2', content: 'boom', isError: true }] },
        { id: 't5', role: 'assistant', at: 104, blocks: [{ type: 'tool_use', id: 'u3', name: 'Bash', input: { command: 'npm run slow' } }] },
        { id: 't6', role: 'assistant', at: 105, blocks: [{ type: 'tool_use', id: 'u4', name: 'Read', input: { file_path: '/w/a.ts' } }] }
      ]
      const reported = R.reportedCommands(turns)
      const merged = R.reviewEvidence(observed, reported, 10)
      const same = merged.commands.filter((c) => c.command === 'npm test')
      ok(NAME,
        // Outside the lane is excluded; a still-running row is unknown, not passed.
        observed.length === 3 && observed.every((c) => c.attribution === 'observed') &&
          observed.find((c) => c.command === 'npm test').outcome === 'passed' &&
          observed.find((c) => c.command === 'npm run lint').outcome === 'failed' &&
          observed.find((c) => c.command === 'npm run dev').outcome === 'unknown' &&
          observed.every((c) => c.command !== 'npm test' || c.exitCode === 0) &&
          // A Read tool names no command; an unanswered Bash is unknown.
          reported.length === 3 && reported.every((c) => c.attribution === 'reported') &&
          reported.every((c) => c.exitCode === undefined) &&
          reported.find((c) => c.command === 'npm test').outcome === 'passed' &&
          reported.find((c) => c.command === 'npm run build').outcome === 'failed' &&
          reported.find((c) => c.command === 'npm run slow').outcome === 'unknown' &&
          // The whole point: one command, two witnesses, two rows.
          same.length === 2 && same[0].attribution !== same[1].attribution &&
          // Failures first, so the fact a reviewer wants is not below a cap.
          merged.commands[0].outcome === 'failed' && merged.commands[1].outcome === 'failed' &&
          merged.none === undefined && merged.more === 0,
        JSON.stringify({ observed, reported, merged }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }

  {
    const NAME = 'readiness.5 no evidence is a SENTENCE naming WHICH kind of nothing it is — nothing ran, or nobody could look — because a closed lane and an unreadable ledger are not evidence that nothing ran; and the cap COUNTS its overflow rather than pre-slicing it, so `more` stays structurally reachable'
    try {
      const empty = R.reviewEvidence([], [], 10)
      // The two overclaims the first cut made. A closed conversation and a
      // ledger this app could not read both produced "the conversation asked
      // for none" — an assertion about something nobody had looked at.
      const noChat = R.reviewEvidence([], [], 10, { ledgerRead: true, transcriptRead: false })
      const noLedger = R.reviewEvidence([], [], 10, { ledgerRead: false, transcriptRead: true })
      const neither = R.reviewEvidence([], [], 10, { ledgerRead: false, transcriptRead: false })
      const many = R.reviewEvidence(
        Array.from({ length: 8 }, (_, i) => ({ attribution: 'observed', command: `c${i}`, outcome: 'passed', exitCode: 0, at: i, source: 'this canvas ran it' })),
        Array.from({ length: 8 }, (_, i) => ({ attribution: 'reported', command: `r${i}`, outcome: 'passed', at: i, source: 'the agent reported it' })),
        5
      )
      ok(NAME,
        typeof empty.none === 'string' && empty.none.length > 20 && empty.commands.length === 0 && empty.more === 0 &&
          // Only the arm where BOTH sources were read may say nothing ran.
          /asked for none/.test(empty.none) &&
          !/asked for none/.test(noChat.none) && /conversation is closed/.test(noChat.none) &&
          !/asked for none/.test(noLedger.none) && /read failed/.test(noLedger.none) &&
          /read failed/.test(neither.none) && /conversation is closed/.test(neither.none) &&
          // Different silences get different sentences.
          new Set([empty.none, noChat.none, noLedger.none, neither.none]).size === 4 &&
          many.commands.length === 5 && many.more === 11 && many.none === undefined,
        JSON.stringify({ empty, noChat, noLedger, neither, manyLen: many.commands.length, more: many.more }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }

  {
    const NAME = 'readiness.honest-empty.1 the four silences stay four: no diff is the handoff\'s `empty` state, and an empty evidence list names whether a reader FAILED, there was NO reader (no terminal on the canvas, or the conversation closed), or every source was read and nothing ran — `noneKind` says which, and only `never-ran` may claim nothing ran'
    try {
      const failed = R.reviewEvidence([], [], 10, { ledgerRead: false, ledgerPanels: 2, transcriptRead: true })
      const nowhere = R.reviewEvidence([], [], 10, { ledgerRead: true, ledgerPanels: 0, transcriptRead: true })
      const closed = R.reviewEvidence([], [], 10, { ledgerRead: true, ledgerPanels: 1, transcriptRead: false })
      const ran = R.reviewEvidence([], [], 10, { ledgerRead: true, ledgerPanels: 1, transcriptRead: true })
      const some = R.reviewEvidence([{ attribution: 'observed', command: 'x', outcome: 'passed', exitCode: 0, at: 1, source: 's' }], [], 10, { ledgerRead: true, ledgerPanels: 0, transcriptRead: false })
      ok(NAME,
        failed.noneKind === 'failed-reader' && /read failed/.test(failed.none) &&
          nowhere.noneKind === 'unread' && /nowhere to read/.test(nowhere.none) && !/failed/.test(nowhere.none) &&
          closed.noneKind === 'unread' && /conversation is closed/.test(closed.none) &&
          ran.noneKind === 'never-ran' && /asked for none/.test(ran.none) &&
          [failed, nowhere, closed].every((e) => !/asked for none/.test(e.none)) &&
          some.none === undefined && some.noneKind === undefined,
        JSON.stringify({ failed, nowhere, closed, ran, some }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }
}

{
    const NAME = 'readiness.6 the task\'s section is picked out of the across result by its lane path on segment boundaries and the LONGEST match wins — the main tree is never mistaken for the lane, a neighbouring lane sharing a prefix is never the task\'s, and no match at all is undefined so the handoff reads `lane missing` rather than reviewing the wrong diff'
    try {
      const clean = { kind: 'clean', root: '/x' }
      const across = { sections: [
        { path: '/w/repo', branch: 'main', label: 'main tree', result: clean },
        { path: '/w/lanes/tc-p1', branch: 'tc/p1', label: 'ada', result: clean },
        { path: '/w/lanes/tc-p1-old', branch: 'tc/p1-old', label: 'stale', result: clean },
        { path: '/w/lanes/tc-p1/nested', branch: 'tc/p1-nested', label: 'nested', result: clean }
      ] }
      const exact = R.laneSection(across.sections, '/w/lanes/tc-p1')
      const nested = R.laneSection(across.sections, '/w/lanes/tc-p1/nested')
      // The bare-startsWith failure this reuses insideDirectory to avoid.
      const neighbour = R.laneSection(across.sections, '/w/lanes/tc-p1-old')
      const belowLane = R.laneSection(across.sections, '/w/lanes/tc-p1/src')
      const gone = R.laneSection(across.sections, '/w/lanes/tc-p9')
      const noPath = R.laneSection(across.sections, undefined)
      ok(NAME,
        exact !== undefined && exact.branch === 'tc/p1' &&
          nested !== undefined && nested.branch === 'tc/p1-nested' &&
          neighbour !== undefined && neighbour.branch === 'tc/p1-old' &&
          // A path INSIDE the lane resolves to the lane, and to the longest
          // record holding it — never to the main tree that also holds it.
          belowLane !== undefined && belowLane.branch === 'tc/p1' &&
          gone === undefined && noPath === undefined &&
          R.laneSection([], '/w/lanes/tc-p1') === undefined,
        JSON.stringify({ exact, nested, neighbour, belowLane, gone, noPath }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }

{
    const NAME = 'across-baseline.1 the named across baseline is not a sha, is never passed to git, and every arm that could reach a git call with it is fenced — an across node asks review:across with its ROOT alone, and each section compares against its own fork'
    try {
      const marker = R.ACROSS_BASELINE
      // It must not look like an object name: a fake sha would be shown to a
      // person as a commit they could go and look at.
      const looksLikeSha = /^[0-9a-f]{7,40}$/.test(marker)
      // The two builders that take a baseline sha. Neither is reachable from
      // an across node (its body renders sections, and its commit and discard
      // are blocked by name) — asserted as TEXT because no fake runner can
      // prove a call was never made, the same argument `git.1` makes about
      // the absence of a fetch.
      const engineSrc = readFileSync(join(__dirname, '..', 'src', 'main', 'review-engine.ts'), 'utf8')
      // Counted over the WHOLE tree, not over the one file that declares it:
      // a count taken from `shared/review.ts` alone cannot detect a second
      // file spelling its own copy, which is the drift being guarded.
      const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') || e.name.endsWith('.tsx') ? [join(dir, e.name)] : [])
      const decls = walk(join(__dirname, '..', 'src'))
        .reduce((n, f) => n + (readFileSync(f, 'utf8').match(/(?:export )?const ACROSS_BASELINE\s*=/g) || []).length, 0)
      const acrossStart = engineSrc.indexOf('const reviewAcross = async')
      const acrossFn = acrossStart === -1 ? '' : engineSrc.slice(acrossStart, engineSrc.indexOf('\n  }', acrossStart))
      ok(NAME,
        typeof marker === 'string' && marker.length > 0 && !looksLikeSha &&
          // reviewAcross builds no argv from a caller-supplied baseline.
          acrossStart !== -1 && acrossFn.length > 200 && !acrossFn.includes('baselineSha') &&
          // A real export with ONE declaration anywhere in src/: two files
          // spelling their own copy is the drift this guards, and counting
          // over the whole tree is what makes that true — counting over the
          // one file that declares it could not fail. And the engine never
          // names it at all, which is the second half: the marker reaches no
          // git call because the module that builds git's argv has never
          // heard of it.
          decls === 1 && engineSrc.indexOf('ACROSS_BASELINE') === -1,
        JSON.stringify({ marker, looksLikeSha, decls, acrossMentionsBaseline: acrossFn.includes('baselineSha') }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }

// M285 — REVIEW CONTENT IDENTITY. The signature's recorded bound (readiness.3)
// is that a same-size edit is invisible to it; these checks are the other
// side of that bound: main hashes the diff's BYTES under the written policy
// (shared/review-identity.ts), the persisted mark carries what it read, an
// old mark reads `unknown`, and a mutation re-reads the tree before writing.
{
  const NUMSTAT = { '-C /r diff --numstat -z b1': { stdout: ['3\t1\ta.ts', ''].join('\0') } }
  const CFG = R.CONTENT_DIFF_CONFIG.flatMap((c) => ['-c', c]).join(' ')
  const DIFF_KEY = `-C /r ${CFG} diff --binary --full-index --no-ext-diff --no-color b1`
  const same = (a, b) => a !== undefined && b !== undefined && a.base === b.base && a.content === b.content
  {
    const NAME = 'review-id.1 a same-size edit moves the identity: two reads with IDENTICAL numstat rows and IDENTICAL signatures but different diff bytes are two identities; identical bytes are one; a different base is another; an untracked file is hashed by content, not by name; and the argv is the policy\'s (--binary --full-index --no-ext-diff --no-color; hash-object without -w)'
    try {
      const calls = []
      const eng = (diffBytes, untracked, blob) => R.createReviewEngine({
        run: async (args) => { calls.push(args.join(' ')); return fakeRunner({ ...EXISTS, ...NUMSTAT, '-C /r ls-files -z --others --exclude-standard': { stdout: untracked === undefined ? '' : `${untracked}\0` }, [DIFF_KEY]: { stdout: diffBytes }, [`-C /r hash-object -- ${untracked}`]: { stdout: `${blob}\n` } })(args) },
        baselineOf: () => ({ root: '/r', sha: 'b1' }), peersInRepo: () => 0
      })
      const a = await eng('@@ -1 +1 @@\n-x\n+y\n').review('p1')
      const b = await eng('@@ -1 +1 @@\n-p\n+q\n').review('p1')
      const a2 = await eng('@@ -1 +1 @@\n-x\n+y\n').review('p1')
      const u1 = await eng('@@ -1 +1 @@\n-x\n+y\n', 'new.txt', 'blob1').review('p1')
      const u2 = await eng('@@ -1 +1 @@\n-x\n+y\n', 'new.txt', 'blob2').review('p1')
      const otherBase = await R.createReviewEngine({ run: fakeRunner({ '-C /r cat-file -e b2': { stdout: '' }, '-C /r diff --numstat -z b2': NUMSTAT['-C /r diff --numstat -z b1'], ...NO_UNTRACKED, [`-C /r ${CFG} diff --binary --full-index --no-ext-diff --no-color b2`]: { stdout: '@@ -1 +1 @@\n-x\n+y\n' } }), baselineOf: () => ({ root: '/r', sha: 'b2' }), peersInRepo: () => 0 }).review('p1')
      ok(NAME,
        a.kind === 'changes' && b.kind === 'changes' && a2.kind === 'changes' && u1.kind === 'changes' && u2.kind === 'changes' && otherBase.kind === 'changes' &&
          // The shape is identical — the very bound readiness.3 pins…
          R.reviewSignature(a.files) === R.reviewSignature(b.files) &&
          // …and the identity is not.
          a.identity !== undefined && b.identity !== undefined && !same(a.identity, b.identity) &&
          same(a.identity, a2.identity) &&
          a.identity.base === 'b1' && /^[0-9a-f]{32}$/.test(a.identity.content) &&
          // The untracked file's CONTENT moves it; its name alone does not carry it.
          !same(u1.identity, a.identity) && !same(u1.identity, u2.identity) &&
          // Same bytes, different base: a different subject.
          otherBase.identity !== undefined && otherBase.identity.content === a.identity.content && !same(otherBase.identity, a.identity) &&
          calls.includes(DIFF_KEY) && calls.includes('-C /r hash-object -- new.txt') && !calls.some((c) => /hash-object.* -w/.test(c)) &&
          // The critic's gap: two diffs differing only in a non-UTF-8 byte (é vs è in Latin-1) are two identities.
          !same((await eng('-\xe9\n+x\n').review('p1')).identity, (await eng('-\xe8\n+x\n').review('p1')).identity) &&
          // Every pin is on the argv, and the config keys are the ones the critic named.
          /diff\.renames=true/.test(DIFF_KEY) && /diff\.algorithm=myers/.test(DIFF_KEY) && /diff\.noprefix=false/.test(DIFF_KEY) && /diff\.ignoreSubmodules=none/.test(DIFF_KEY),
        JSON.stringify({ a: a.identity, b: b.identity, a2: a2.identity, u1: u1.identity, u2: u2.identity, otherBase: otherBase.identity, calls: calls.slice(0, 8) }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }
  {
    const NAME = 'review-id.2 absence is unknown, never fresh: a mark written before M285 (no identity) is `unknown` even when its signature still matches; a failed diff or hash-object read sends NO identity and a mark judged against it is `stale`; a clean tree\'s shortcut identity equals a full identityOf read of the same tree; a malformed identity parses to nothing and costs only itself'
    try {
      const sig = R.reviewSignature([{ path: 'a.ts', added: 3, removed: 1, binary: false, untracked: false }])
      const ID = { base: 'b1', content: 'a'.repeat(32) }
      const oldMark = R.reviewStanding({ at: 1, signature: sig, files: 1 }, sig, ID)
      const noDiff = await engineWith({ ...EXISTS, ...NUMSTAT, ...NO_UNTRACKED, [DIFF_KEY]: { ok: false, code: 128, stderr: 'fatal' } }).review('p1')
      const noHash = await engineWith({ ...EXISTS, ...NUMSTAT, '-C /r ls-files -z --others --exclude-standard': { stdout: 'n.txt\0' }, [DIFF_KEY]: { stdout: 'd' }, '-C /r hash-object -- n.txt': { ok: false, code: 1 } }).review('p1')
      const halfHash = await engineWith({ ...EXISTS, ...NUMSTAT, '-C /r ls-files -z --others --exclude-standard': { stdout: 'n.txt\0m.txt\0' }, [DIFF_KEY]: { stdout: 'd' }, '-C /r hash-object -- n.txt m.txt': { stdout: 'onlyone\n' } }).review('p1')
      const judgedAgainstNone = R.reviewStanding({ at: 1, signature: sig, files: 1, identity: ID }, sig, noDiff.identity)
      const cleanShortcut = await engineWith({ ...EXISTS, '-C /r diff --numstat -z b1': { stdout: '' }, ...NO_UNTRACKED }).review('p1')
      const cleanFull = await engineWith({ ...EXISTS, ...NO_UNTRACKED, [DIFF_KEY]: { stdout: '' } }).identityOf('/r', 'b1')
      ok(NAME,
        oldMark === 'unknown' &&
          noDiff.kind === 'changes' && noDiff.identity === undefined &&
          noHash.kind === 'changes' && noHash.identity === undefined &&
          halfHash.kind === 'changes' && halfHash.identity === undefined &&
          judgedAgainstNone === 'stale' &&
          cleanShortcut.kind === 'clean' && cleanShortcut.identity !== undefined && cleanFull !== undefined && same(cleanShortcut.identity, cleanFull) && cleanShortcut.identity.content === R.EMPTY_REVIEW_CONTENT &&
          R.parseReviewIdentity({ base: 'b1', content: 'a'.repeat(32) }) !== undefined &&
          R.parseReviewIdentity({ base: 'b1', content: 'a'.repeat(31) }) === undefined &&
          R.parseReviewIdentity({ base: '', content: 'a'.repeat(32) }) === undefined &&
          R.parseReviewIdentity({ base: 'b1', content: 'A'.repeat(32) }) === undefined &&
          R.parseReviewIdentity('b1:aaaa') === undefined && R.parseReviewIdentity(undefined) === undefined,
        JSON.stringify({ oldMark, noDiff: noDiff.identity, noHash: noHash.identity, halfHash: halfHash.identity, judgedAgainstNone, cleanShortcut: cleanShortcut.identity, cleanFull }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }
  {
    const NAME = 'review-id.3 a mutation re-reads the subject IMMEDIATELY before writing: a commit whose `expect` no longer matches is `subject-moved` with nothing staged, a discard likewise with nothing restored or removed; a matching identity proceeds; an unreadable identity is REFUSED by name rather than run unchecked; a build with no identityOf refuses a request that asked for the guard; and a request with no `expect` runs exactly as before, calling identityOf never'
    try {
      const ID = { base: 'b1', content: 'a'.repeat(32) }
      const MOVED = { base: 'b1', content: 'b'.repeat(32) }
      const mk = (now) => { const g = fakeGit({ 'rev-parse': { stdout: 'h1\n' }, 'ls-tree': { stdout: 'kept.ts\0' } }); const ids = []; const identityOf = async (root, base) => { ids.push(`${root}@${base}`); return now }
        return { g, ids, commit: R.createReviewCommitter({ run: g.run, tempIndexPath: () => '/scratch/idx', removeTempIndex: () => {}, identityOf }), discard: R.createReviewDiscarder({ run: g.run, peersInRepo: () => 0, removeFile: (p) => g.calls.push({ args: ['fs', 'rm', p] }), isDirectory: () => false, identityOf }) } }
      const REQ = { root: '/r', paths: ['kept.ts'], message: 'm' }
      const DREQ = { root: '/r', baseline: 'b1', subjectId: 'p1', paths: ['kept.ts', 'new.ts'] }
      const moved = mk(MOVED); const cMoved = await moved.commit({ ...REQ, expect: ID }); const dMoved = await moved.discard({ ...DREQ, expect: ID })
      const still = mk(ID); const cStill = await still.commit({ ...REQ, expect: ID }); const dStill = await still.discard({ ...DREQ, expect: ID })
      const unread = mk(undefined); const cUnread = await unread.commit({ ...REQ, expect: ID }); const dUnread = await unread.discard({ ...DREQ, expect: ID })
      const noDep = fakeGit({ 'rev-parse': { stdout: 'h1\n' }, 'ls-tree': { stdout: 'kept.ts\0' } })
      const cNoDep = await R.createReviewCommitter({ run: noDep.run, tempIndexPath: () => '/scratch/idx', removeTempIndex: () => {} })({ ...REQ, expect: ID })
      const dNoDep = await R.createReviewDiscarder({ run: noDep.run, peersInRepo: () => 0, removeFile: () => {}, isDirectory: () => false })({ ...DREQ, expect: ID })
      const plain = mk(MOVED); const cPlain = await plain.commit(REQ); const dPlain = await plain.discard(DREQ)
      const subs = (g) => g.calls.map((c) => c.args[2] ?? c.args[1])
      ok(NAME,
        cMoved.kind === 'subject-moved' && !subs(moved.g).includes('update-index') && !subs(moved.g).includes('commit') &&
          dMoved.kind === 'subject-moved' && !subs(moved.g).includes('restore') && !moved.g.calls.some((c) => c.args[0] === 'fs') &&
          moved.ids.length === 2 && moved.ids.every((i) => i === '/r@b1') &&
          cStill.kind === 'committed' && dStill.kind === 'discarded' && dStill.restored.join() === 'kept.ts' &&
          // The re-check sits right before the stage, after read-tree.
          subs(still.g).indexOf('read-tree') < subs(still.g).indexOf('update-index') &&
          cUnread.kind === 'refused' && /re-read/.test(cUnread.detail) && dUnread.kind === 'refused' && /re-read/.test(dUnread.detail) &&
          cNoDep.kind === 'refused' && /content identity/.test(cNoDep.detail) && dNoDep.kind === 'refused' && /content identity/.test(dNoDep.detail) &&
          cPlain.kind === 'committed' && dPlain.kind === 'discarded' && plain.ids.length === 0,
        JSON.stringify({ cMoved, dMoved, movedIds: moved.ids, cStill, dStill, cUnread, dUnread, cNoDep, dNoDep, cPlain, dPlain, plainIds: plain.ids }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }
  {
    const NAME = 'review-id.4 the policy is WRITTEN where the identity is defined and pinned as text: the shared header names --binary, untracked files by hash-object, ignored files excluded, and absence as unknown; main is the one hasher (no sha256 or hashReviewContent call under src/renderer); and the identity rides in every `clean`/`changes`/`shared` answer as an optional field'
    try {
      const shared = readFileSync(join(__dirname, '..', 'src', 'shared', 'review-identity.ts'), 'utf8')
      const contract = readFileSync(join(__dirname, '..', 'src', 'shared', 'review.ts'), 'utf8')
      const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') || e.name.endsWith('.tsx') ? [join(dir, e.name)] : [])
      const rendererHashes = walk(join(__dirname, '..', 'src', 'renderer')).filter((f) => /createHash\(|hashReviewContent|reviewIdentityOf\(/.test(readFileSync(f, 'utf8')))
      ok(NAME,
        /--binary/.test(shared) && /hash-object/.test(shared) && /Ignored files/.test(shared) && /ABSENCE MEANS UNKNOWN, NEVER FRESH/.test(shared) && /ls-files --others\s*\n?\s*\*?\s*--exclude-standard/.test(shared) &&
          rendererHashes.length === 0 &&
          /kind: 'clean'; root: string; identity\?: ReviewIdentity/.test(contract) &&
          /kind: 'changes'; root: string; files: ReviewFile\[\]; added: number; removed: number; identity\?: ReviewIdentity/.test(contract) &&
          /kind: 'shared'; root: string; panelCount: number; files: ReviewFile\[\]; identity\?: ReviewIdentity/.test(contract),
        JSON.stringify({ rendererHashes }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }
}

// M286 — REVISION-BOUND CHECK EVIDENCE. A check records what it tested, and
// the outcome it shows is bound to whether that is still what stands.
{
  const LANE = '/w/lanes/tc-p1'
  const ID = { base: 'b1', content: 'a'.repeat(32) }
  const MOVED = { base: 'b1', content: 'b'.repeat(32) }
  const row = (extra) => ({ panelId: 'n1', command: 'npm test', cwd: LANE, startedAt: 10, endedAt: 20, exitCode: 0, ...(extra || {}) })
  {
    const NAME = 'check-fresh.1 a changed revision makes passing evidence STALE: an exit-0 row stamped with the identity it tested stands while the subject still has that identity, becomes `stale` (its exit code kept, a note saying why) once the identity moved, and a failed row goes stale the same way; running, not-run and unknown records are never stale, because there is no result to be'
    try {
      const checks = R.checksFromLedger([row({ tested: ID }), row({ startedAt: 30, endedAt: 40, exitCode: 1, tested: ID }), row({ startedAt: 50, endedAt: 0, exitCode: null })], LANE)
      const watchers = R.checksFromWatchers([
        { id: 'w1', cwd: LANE, command: 'npm', args: ['test'], status: 'not-started' },
        { id: 'w2', cwd: LANE, command: 'npm', args: ['test'], status: 'running', startedAt: 60 },
        { id: 'w3', cwd: LANE, command: 'npm', args: ['test'], status: 'passed', exitCode: 0, startedAt: 70, endedAt: 80, tested: ID },
        { id: 'w4', cwd: LANE, command: 'npm', args: ['test'], status: 'exited', exitCode: null, signal: 'SIGKILL', startedAt: 90, endedAt: 100, tested: ID }
      ], LANE)
      const all = [...checks, ...watchers]
      const fresh = R.bindCheckFreshness(all, () => ID)
      const stale = R.bindCheckFreshness(all, () => MOVED)
      const by = (list, key) => list.find((c) => c.key === key)
      ok(NAME,
        by(fresh, 'ledger:n1:10').outcome === 'passed' && by(fresh, 'ledger:n1:30').outcome === 'failed' && by(fresh, 'watcher:w3:70').outcome === 'passed' && by(fresh, 'watcher:w4:90').outcome === 'failed' &&
          by(stale, 'ledger:n1:10').outcome === 'stale' && by(stale, 'ledger:n1:10').exitCode === 0 && /earlier version/.test(by(stale, 'ledger:n1:10').note) && by(stale, 'ledger:n1:10').observed === 'passed' &&
          by(stale, 'ledger:n1:30').outcome === 'stale' && by(stale, 'ledger:n1:30').exitCode === 1 &&
          by(stale, 'watcher:w3:70').outcome === 'stale' &&
          // No result, no staleness.
          by(stale, 'ledger:n1:50').outcome === 'unknown' && by(stale, 'watcher:w1:0').outcome === 'not-run' && by(stale, 'watcher:w2:60').outcome === 'running' &&
          // Bound by BASE: currentOf is asked with the record's own base, never a global one.
          R.bindCheckFreshness([by(all, 'ledger:n1:10')], (base) => (base === 'b1' ? ID : MOVED))[0].outcome === 'passed',
        JSON.stringify({ fresh, stale }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }
  {
    const NAME = 'check-fresh.2 exit 0 never produces "tests passed" wording: checkWords says `exit 0`, `exit 1`, `running`, `not run`, `no result`, `ended by signal` and `stale · exit N at an earlier revision`, and the module\'s source never spells "tests passed" or "all tests"; a command\'s TEXT decides nothing (npm test and make ci with the same code get the same word)'
    try {
      const mk = (extra) => R.bindCheckFreshness(R.checksFromLedger([row(extra)], LANE), () => ID)[0]
      const words = {
        pass: R.checkWords(mk({ tested: ID })),
        fail: R.checkWords(mk({ exitCode: 1, tested: ID })),
        stale: R.checkWords(R.bindCheckFreshness(R.checksFromLedger([row({ tested: ID })], LANE), () => MOVED)[0]),
        lost: R.checkWords(mk({ exitCode: null })),
        unstamped: R.checkWords(mk({})),
        running: R.checkWords(R.checksFromWatchers([{ id: 'w', cwd: LANE, command: 'x', args: [], status: 'running', startedAt: 1 }], LANE)[0]),
        notRun: R.checkWords(R.checksFromWatchers([{ id: 'w', cwd: LANE, command: 'x', args: [], status: 'not-started' }], LANE)[0]),
        signalled: R.checkWords(R.bindCheckFreshness(R.checksFromWatchers([{ id: 'w', cwd: LANE, command: 'x', args: [], status: 'exited', exitCode: null, signal: 'SIGTERM', startedAt: 1, endedAt: 2, tested: ID }], LANE), () => ID)[0]),
        make: R.checkWords(mk({ command: 'make ci', tested: ID }))
      }
      const src = readFileSync(join(__dirname, '..', 'src', 'shared', 'check-evidence.ts'), 'utf8')
      ok(NAME,
        words.pass === 'exit 0' && words.fail === 'exit 1' && words.stale === 'stale · exit 0 at an earlier revision' && words.lost === 'no result' &&
          words.unstamped === 'exit 0 · revision unknown' && words.running === 'running' && words.notRun === 'not run' && words.signalled === 'ended by signal' &&
          words.make === words.pass &&
          !Object.values(words).some((w) => /passed|tests/i.test(w)) &&
          !/tests passed|all tests/i.test(src),
        JSON.stringify(words))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }
  {
    const NAME = 'check-fresh.3 a missing source reads UNKNOWN, never green: a row with no tested identity is `unknown` with a note even at exit 0; a subject whose identity cannot be re-read now makes every stamped result `unknown`; an unread freshness (null) keeps the outcome and SAYS it was not read; and the empty arm names which nothing it is — no ledger, nowhere to read, nothing ran, a closed conversation'
    try {
      const unstamped = R.bindCheckFreshness(R.checksFromLedger([row({})], LANE), () => ID)[0]
      const unreadable = R.bindCheckFreshness(R.checksFromLedger([row({ tested: ID })], LANE), () => undefined)[0]
      const unread = R.bindCheckFreshness(R.checksFromLedger([row({ tested: ID })], LANE), () => null)[0]
      const noLedger = R.checkEvidence([], [], { ledgerRead: false, ledgerPanels: 2, transcriptRead: true })
      const nowhere = R.checkEvidence([], [], { ledgerRead: true, ledgerPanels: 0, transcriptRead: true })
      const nothing = R.checkEvidence([], [], { ledgerRead: true, ledgerPanels: 2, transcriptRead: false })
      const some = R.checkEvidence(R.checksFromLedger([row({ tested: ID })], LANE), [], { ledgerRead: true, ledgerPanels: 1, transcriptRead: true })
      ok(NAME,
        unstamped.outcome === 'unknown' && unstamped.observed === 'passed' && /not recorded/.test(unstamped.note) &&
          unreadable.outcome === 'unknown' && /could not be re-read/.test(unreadable.note) &&
          unread.outcome === 'passed' && /not read yet/.test(unread.note) &&
          noLedger.unavailable.length === 1 && /could not read its own record/.test(noLedger.unavailable[0]) &&
          nowhere.unavailable.length === 1 && /nowhere to read/.test(nowhere.unavailable[0]) &&
          nothing.unavailable.length === 2 && /no checks have run/.test(nothing.unavailable[0]) && /conversation is closed/.test(nothing.unavailable[1]) &&
          some.unavailable === undefined && some.checks.length === 1,
        JSON.stringify({ unstamped, unreadable, unread, noLedger, nowhere, nothing }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }
  {
    const NAME = 'check-fresh.4 an agent-authored claim is a CLAIM and never a result: transcript commands come out as CheckClaim rows in their own list, with the word claim in their source, and none of them is a CheckRecord; the lane filter keeps a neighbouring lane out; a worktree branch rides in the context when the cwd is inside one; and the list sorts failures first, then stale, newest first within'
    try {
      const turns = [
        { id: 't1', role: 'assistant', at: 100, blocks: [{ type: 'tool_use', id: 'u1', name: 'Bash', input: { command: 'npm test' } }] },
        { id: 't2', role: 'user', at: 101, blocks: [{ type: 'tool_result', toolUseId: 'u1', content: 'ok', isError: false }] },
        { id: 't3', role: 'assistant', at: 102, blocks: [{ type: 'tool_use', id: 'u2', name: 'Bash', input: { command: 'npm run build' } }] }
      ]
      const claims = R.claimsFromTranscript(turns)
      const checks = R.bindCheckFreshness(R.checksFromLedger([
        row({ tested: ID }), row({ startedAt: 30, endedAt: 40, exitCode: 1, tested: ID }), row({ startedAt: 50, endedAt: 60, exitCode: 0, tested: MOVED }),
        row({ startedAt: 70, endedAt: 80, cwd: `${LANE}-old`, tested: ID })
      ], LANE, (cwd) => (cwd === LANE ? 'tc/p1' : undefined)), () => ID)
      const ev = R.checkEvidence(checks, claims, { ledgerRead: true, ledgerPanels: 1, transcriptRead: true })
      ok(NAME,
        claims.length === 2 && claims.every((c) => /claim/.test(c.source) && c.claimed !== undefined && c.outcome === undefined && c.source !== undefined) &&
          claims.find((c) => c.command === 'npm test').claimed === 'ok' && claims.find((c) => c.command === 'npm run build').claimed === 'unanswered' &&
          ev.claims.length === 2 && ev.checks.every((c) => c.source === 'ledger') &&
          // The neighbouring lane's row is out; three remain.
          ev.checks.length === 3 && ev.checks.every((c) => c.context.worktree === 'tc/p1') &&
          ev.checks.map((c) => c.outcome).join() === 'failed,stale,passed',
        JSON.stringify({ claims, checks: ev.checks.map((c) => [c.key, c.outcome, c.context]) }))
    } catch (cErr) { ok(NAME, false, 'threw: ' + String((cErr && cErr.message) || cErr)) }
  }
}

// M307 — review-comment.1–.4. A REVIEW A PERSON CAN ACT ON. Each property
//      fails silently: a diff line with no number cannot carry a comment, so
//      the gutter would pin every note to the wrong line; a comment that does
//      not survive the layout parse is a review that evaporates on relaunch;
//      a follow-up that paraphrases instead of quoting sends the agent to a
//      line number that may now mean something else; and a "verified" that an
//      agent's stop, a stale pass or an open comment can reach is the exact
//      claim this milestone exists to separate from "finished".
{
  const { lines } = R.parseDiffLines('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -10,4 +10,5 @@ fn\n ctx a\n-gone\n+new one\n+new two\n ctx b\n@@ -40 +41 @@\n-x\n+y\n')
  const byText = Object.fromEntries(lines.map((l) => [l.text, l]))
  const a = R.commentAnchorOf(byText['+new two'])
  const d = R.commentAnchorOf(byText['-gone'])
  ok('review-comment.1 diff lines carry their old/new numbers from each hunk header (context both, a deletion old only, an addition new only), a header or meta line none, and a comment anchors by side, number and the line\'s own text',
    byText[' ctx a'].oldNo === 10 && byText[' ctx a'].newNo === 10 &&
      byText['-gone'].oldNo === 11 && byText['-gone'].newNo === undefined &&
      byText['+new one'].newNo === 11 && byText['+new two'].newNo === 12 && byText['+new one'].oldNo === undefined &&
      byText[' ctx b'].oldNo === 12 && byText[' ctx b'].newNo === 13 &&
      byText['-x'].oldNo === 40 && byText['+y'].newNo === 41 &&
      byText['+++ b/x'].newNo === undefined && byText['@@ -40 +41 @@'].oldNo === undefined &&
      a && a.side === 'new' && a.line === 12 && a.quote === 'new two' &&
      d && d.side === 'old' && d.line === 11 && d.quote === 'gone' &&
      R.commentAnchorOf(byText['@@ -40 +41 @@']) === null,
    JSON.stringify(lines.map((l) => [l.kind, l.oldNo, l.newNo])))
}
{
  const good = { id: 'c1', path: 'src/a.ts', side: 'new', line: 12, quote: 'x()', body: 'rename this', at: 5, sentAt: 9 }
  const warnings = []
  const items = R.parseWorkItems([{
    id: 'w1', source: 'typed', title: 'T', state: 'working', createdAt: 1, updatedAt: 2,
    criteria: ['tests pass', 'docs updated'], criteriaMet: ['tests pass'],
    comments: [good, { id: 'bad', path: 'a', side: 'sideways', line: 1, quote: '', body: 'b', at: 1 }, { id: 'zero', path: 'a', side: 'new', line: 0, quote: '', body: 'b', at: 1 }]
  }, { id: 'w2', source: 'typed', title: 'U', state: 'todo', createdAt: 1, updatedAt: 1, comments: 'not a list' }], warnings)
  const w1 = items.find((i) => i.id === 'w1')
  const w2 = items.find((i) => i.id === 'w2')
  const carried = R.carryWorkItem({ ...w1, comments: [], criteriaMet: [] })
  ok('review-comment.2 comments and confirmed criteria survive the layout parse field by field — a malformed comment costs itself, a malformed list costs the list, never the card — and an empty list writes no key',
    w1 && w1.comments.length === 1 && w1.comments[0].id === 'c1' && w1.comments[0].sentAt === 9 &&
      JSON.stringify(w1.criteriaMet) === JSON.stringify(['tests pass']) &&
      w2 && w2.comments === undefined && !('comments' in carried) && !('criteriaMet' in carried) &&
      JSON.stringify(R.unmetCriteria(w1.criteria, w1.criteriaMet)) === JSON.stringify(['docs updated']),
    JSON.stringify({ w1, w2, carried, warnings }))
}
{
  const text = R.composeFollowUp({
    title: 'Fix login', brief: 'Users can log in with SSO',
    comments: [
      { id: 'a', path: 'src/auth.ts', side: 'new', line: 42, quote: '  return token', body: 'Validate the token first.', at: 1 },
      { id: 'b', path: 'src/old.ts', side: 'old', line: 7, quote: 'legacy()', body: 'Why remove this?', at: 2 },
      { id: 'r', path: 'src/x.ts', side: 'new', line: 1, quote: 'y', body: 'resolved already', at: 3, resolved: true }
    ],
    failing: [{ command: 'npm test', ended: 'exit 1', lastLines: ['FAIL auth.test.ts', 'expected 200, got 401'] }],
    unmet: ['docs updated']
  })
  const empty = R.composeFollowUp({ title: 'T', comments: [{ id: 'r', path: 'a', side: 'new', line: 1, quote: '', body: 'b', at: 1, resolved: true }], failing: [], unmet: ['x'] })
  ok('review-comment.3 the follow-up quotes each open comment at its place, numbers every point so the reply can be matched, carries the failing check\'s own last lines, lists the unconfirmed criteria, leaves a resolved comment out, and composes nothing when there is nothing to address',
    text.includes('1. src/auth.ts:42') && text.includes('   >   return token') && text.includes('Validate the token first.') &&
      text.includes('2. src/old.ts:7 (removed line)') && text.includes('3. `npm test` — exit 1') &&
      text.includes('   | expected 200, got 401') && text.includes('- docs updated') &&
      text.includes('The intended outcome: Users can log in with SSO') && !text.includes('resolved already') &&
      empty === '',
    text)
}
{
  const passed = { key: 'k1', source: 'watcher', panelId: 'w', command: 'npm test', context: { cwd: '/l' }, observed: 'passed', outcome: 'passed', exitCode: 0, at: 1 }
  const stale = { ...passed, key: 'k2', outcome: 'stale' }
  const failed = { ...passed, key: 'k3', observed: 'failed', outcome: 'failed', exitCode: 1 }
  const unknown = { ...passed, key: 'k4', outcome: 'unknown' }
  const resolved = [{ id: 'c', path: 'a', side: 'new', line: 1, quote: '', body: 'b', at: 1, resolved: true }]
  const base = { agentWorking: false, standing: 'current', checks: [passed], comments: resolved, criteria: ['a'], criteriaMet: ['a'] }
  const v = (over) => R.verificationOf({ ...base, ...over })
  const all = v({})
  const idleNothing = R.verificationOf({ agentWorking: false, standing: 'none', checks: [] })
  const staleOnly = v({ checks: [stale] })
  const unknownOnly = v({ checks: [unknown] })
  const withFail = v({ checks: [passed, failed] })
  const openComment = v({ comments: [{ id: 'o', path: 'a', side: 'new', line: 1, quote: '', body: 'b', at: 1 }] })
  const sentWorking = v({ agentWorking: true, comments: [{ id: 'o', path: 'a', side: 'new', line: 1, quote: '', body: 'b', at: 1, sentAt: 5 }] })
  const unmet = v({ criteriaMet: [] })
  const moved = v({ standing: 'stale' })
  ok('review-comment.4 VERIFIED only when the review is current, a witnessed check passed on this content, none failed, every comment is resolved and every criterion confirmed; an agent stopping with none of that reads "agent finished — not verified" and names what is missing; a stale or unplaceable pass, an open comment or an unticked criterion each keep it short; sent comments with the agent at work read "changes requested"',
    all.stage === 'verified' && all.missing.length === 0 &&
      idleNothing.stage === 'agent-finished' && idleNothing.word === 'agent finished — not verified' &&
      idleNothing.missing.includes('not reviewed') && idleNothing.missing.includes('no check has run on this revision') &&
      staleOnly.stage === 'agent-finished' && staleOnly.missing.some((m) => /earlier revision/.test(m)) &&
      unknownOnly.stage === 'agent-finished' &&
      withFail.stage === 'agent-finished' && withFail.missing.includes('1 check failed') &&
      openComment.stage === 'agent-finished' && openComment.missing.includes('1 comment not sent') &&
      sentWorking.stage === 'changes-requested' &&
      unmet.stage === 'agent-finished' && unmet.missing.includes('1 of 1 criteria not confirmed') &&
      moved.stage === 'stale' && !/verified/.test(moved.word.replace('not verified', '')),
    JSON.stringify({ all, idleNothing, staleOnly, withFail, openComment, sentWorking, unmet, moved }))

  // M360 — review-comment.proposed.1. CROSS-AGENT REVIEW. An agent's comment
  //     is a PROPOSAL: never the person's open comment, never in the
  //     follow-up, never "every comment resolved" — but unread, it holds
  //     `verified` back, so a second reviewer's point cannot pass unseen.
  //     Kept, it is the person's as written; discarded, it is gone. A
  //     malformed attribution costs the comment: dropping only the field
  //     would make an agent's words the person's.
  const prop = { id: 'p1', path: 'src/a.ts', side: 'new', line: 4, quote: 'x()', body: 'missing a test for 429', at: 2, proposedBy: { label: 'review seat', panelId: 'ch9' } }
  const mine = { id: 'm1', path: 'src/a.ts', side: 'new', line: 9, quote: 'y()', body: 'rename this', at: 1 }
  const withProp = v({ comments: [...resolved, prop] })
  const kept = R.answerProposal([mine, prop], 'p1', true)
  const dropped = R.answerProposal([mine, prop], 'p1', false)
  const parsed = R.parseReviewComments([prop, { ...prop, id: 'bad', proposedBy: { label: '' } }, { ...prop, id: 'bad2', proposedBy: 'agent' }, mine])
  const follow = R.composeFollowUp({ title: 'T', comments: [mine, prop], failing: [], unmet: [] })
  ok('review-comment.proposed.1 an agent\'s proposal is not an open comment and never rides the follow-up, holds verified back while unread ("1 proposed comment from an agent not read"), is the person\'s as written once kept and gone once discarded, and a malformed attribution costs the comment',
    R.openComments([mine, prop]).map((c) => c.id).join() === 'm1' && R.proposedComments([mine, prop]).map((c) => c.id).join() === 'p1' &&
      withProp.stage === 'agent-finished' && withProp.missing.includes('1 proposed comment from an agent not read') && withProp.holds.includes('every comment resolved') &&
      kept.length === 2 && kept[1].proposedBy === undefined && kept[1].body === 'missing a test for 429' && kept[1].at === 2 &&
      R.openComments(kept).length === 2 && dropped.map((c) => c.id).join() === 'm1' &&
      parsed.map((c) => c.id).join() === 'p1,m1' && parsed[0].proposedBy.label === 'review seat' && parsed[0].proposedBy.panelId === 'ch9' &&
      follow.includes('rename this') && !follow.includes('missing a test for 429'),
    JSON.stringify({ withProp, kept, dropped: dropped.map((c) => c.id), parsed: parsed.map((c) => [c.id, c.proposedBy]), follow }))

  // M361 — review-comment.door.1. The verb's place grammar and its ONE
  //     builder: `path:line` is a new-file line, `path:line:old` a removed
  //     one, the LAST `:<n>` is the line (a path may hold colons), and
  //     anything else writes nothing. A door's comment carries who proposed
  //     it and survives the parse as a proposal; a person's carries none.
  const places = ['src/a.ts:12', 'src/a.ts:3:old', 'C:/w/x.ts:7', 'src/a.ts', 'src/a.ts:0', ':4', 'a.ts:x'].map((x) => R.parseCommentPlace(x))
  const doorC = R.newReviewComment({ path: 'src/a.ts', side: 'new', line: 12, quote: '', body: '  no test for 429  ', at: 9, proposedBy: { label: 'r'.repeat(200), panelId: 'ch9' } })
  const personC = R.newReviewComment({ path: 'src/a.ts', side: 'old', line: 3, quote: 'x', body: 'y'.repeat(5000), at: 9 })
  const back = R.parseReviewComments([doorC, personC])
  ok('review-comment.door.1 the place grammar reads path:line and path:line:old (the last :n is the line) and refuses the rest; the one builder trims and cuts the body, attributes a door\'s comment (label cut), and a door\'s comment parses back as a proposal while a person\'s carries no author',
    JSON.stringify(places.slice(0, 3)) === JSON.stringify([{ path: 'src/a.ts', side: 'new', line: 12 }, { path: 'src/a.ts', side: 'old', line: 3 }, { path: 'C:/w/x.ts', side: 'new', line: 7 }]) &&
      places.slice(3).every((x) => x === null) &&
      doorC.body === 'no test for 429' && doorC.proposedBy.label.length === R.PROPOSED_BY_LABEL_MAX && doorC.proposedBy.panelId === 'ch9' && /^c-/.test(doorC.id) &&
      personC.proposedBy === undefined && personC.body.length === R.REVIEW_COMMENT_BODY_MAX &&
      back.length === 2 && back[0].proposedBy !== undefined && back[1].proposedBy === undefined,
    JSON.stringify({ places, doorC: { ...doorC, proposedBy: { ...doorC.proposedBy, label: doorC.proposedBy.label.length } }, back: back.map((c) => c.proposedBy !== undefined) }))
}

// M309 — brief.1–.3. THE RETURN BRIEFING SAYS ONLY WHAT A RECORD SAYS, FROM
//      WHEN THE PERSON LEFT. A briefing that replayed the whole history would
//      bury the one failure that happened while they were away; one that
//      reported another task's rows would send them to the wrong lane; one
//      whose failed check opened a panel instead of that run's own output
//      would be the scrollback hunt M306 exists to end; and a quiet task
//      padded with an old diff reads as news.
{
  const since = 10_000
  const cmd = (panelId, command, exitCode, endedAt, outputId) => ({ kind: 'command', row: { panelId, command, cwd: '/l', startedAt: endedAt - 5, endedAt, exitCode, ...(outputId ? { outputId } : {}) } })
  const ev = (event, title, at, extra = {}) => ({ kind: 'event', row: { kind: 'event', runId: 'r', at, event, source: 'person', title, itemId: 't1', ...extra } })
  const label = (id) => ({ w: 'tests watcher', c: 'agent chat' }[id] ?? id)
  const t1 = {
    itemId: 't1', title: 'Fix login', panelIds: ['w', 'c'], labelOf: label,
    timeline: [
      cmd('w', 'npm test', 1, 12_000, 'w-abc-1'),
      cmd('w', 'npm test', 0, 11_000),
      cmd('w', 'npm test', 1, 9_000, 'w-old-1'),
      cmd('elsewhere', 'rm x', 0, 12_500),
      ev('artifact', 'Review mark recorded', 11_500, { paths: ['a.ts', 'b.ts'] }),
      ev('dispatch', 'Dispatched', 5_000)
    ],
    handoff: { actionLabel: 'Review changes', detail: '', state: 'ready', files: 3 },
    lastReply: { panelId: 'c', at: 12_100, excerpt: 'I fixed the token check.' }
  }
  const quiet = { itemId: 't2', title: 'Docs', panelIds: ['d'], labelOf: label, timeline: [cmd('d', 'make', 0, 1_000)], handoff: { actionLabel: 'Review changes', detail: '', state: 'ready', files: 4 } }
  const b = R.buildReturnBriefing(since, [quiet, t1], [])
  const task = b.tasks[0]
  ok('brief.1 a task\'s briefing lists only what ended or happened AFTER the person left and only in its own panels — the failed run first and opening its OWN output record, a passed run without a record going to its panel, the agent\'s reply, the review mark as a change opening the review — and the lane\'s current diff is named as a fact now',
    b.tasks.length === 1 && task.itemId === 't1' &&
      task.finished.length === 3 && task.finished[0].tone === 'failed' &&
      JSON.stringify(task.finished[0].evidence) === JSON.stringify({ kind: 'output', outputId: 'w-abc-1', panelId: 'w' }) &&
      /`npm test` exited 1 in tests watcher/.test(task.finished[0].text) &&
      task.finished.some((l) => l.tone === 'passed' && l.evidence.kind === 'panel') &&
      task.finished.some((l) => /the agent replied — “I fixed the token check.”/.test(l.text)) &&
      !task.finished.some((l) => /rm x/.test(l.text)) && !task.changed.some((l) => /Dispatched/.test(l.text)) &&
      task.changed.some((l) => /Review mark recorded — 2 files/.test(l.text) && l.evidence.kind === 'review') &&
      task.changed.some((l) => /now holds 3 changed files/.test(l.text)),
    JSON.stringify(task))
  ok('brief.2 a task with nothing new since is quiet — counted, not listed, and not made loud by a diff that was already there — and the headline counts decisions, runs and failures over every task',
    b.quietCount === 1 && /(^|· )3 finished \(1 failed\)/.test(b.headline) && /1 task changed/.test(b.headline) &&
      R.buildReturnBriefing(since, [quiet], []).headline === 'Nothing happened on your tasks while you were away.',
    JSON.stringify({ headline: b.headline, quiet: b.quietCount }))
  const withDecision = R.buildReturnBriefing(since, [quiet, t1], [{ panelId: 'c', requestId: 'r9', label: 'agent chat', blocker: 'wants to use Bash — npm install' }, { panelId: 'zz', label: 'other', blocker: 'is waiting' }])
  const td = withDecision.tasks[0]
  ok('brief.3 a waiting decision in one of the task\'s panels is listed with its request and makes NEXT "answer the decision"; a failure without one makes NEXT "open the failed check"; a decision in another task\'s panel is not this task\'s',
    td.decisions.length === 1 && JSON.stringify(td.decisions[0].evidence) === JSON.stringify({ kind: 'decision', panelId: 'c', requestId: 'r9' }) &&
      /^Answer the decision/.test(td.next) && /^Open the failed check/.test(task.next) &&
      /1 decision waiting on you/.test(withDecision.headline),
    JSON.stringify({ decisions: td.decisions, next: td.next, before: task.next }))
}

// M310 — flow.1–.3. THE FLAGSHIP FLOW'S JOINS. The agent that is never told
//      the criteria cannot meet them; a "Run checks" that guessed a runner
//      would run a command the repository never declared; and a PR body that
//      called an unverified task verified — or claimed no check was witnessed
//      when nobody looked — puts this app's name on a false statement.
{
  const msg = R.dispatchMessage({ key: 'acme/app#12', title: 'Fix login', url: 'https://x/12', description: 'SSO fails', brief: 'SSO users can log in', criteria: ['401 is gone', 'a test covers it'] })
  const bare = R.dispatchMessage({ title: 'Typed' })
  ok('flow.1 the first message a lane\'s agent receives carries the issue, its description, the intended outcome and every acceptance criterion; a typed task with none sends only its title',
    msg.startsWith('Dispatched work item\nacme/app#12\nFix login\nhttps://x/12') && msg.includes('SSO fails') &&
      msg.includes('Intended outcome:\nSSO users can log in') && msg.includes('Done when:\n- 401 is gone\n- a test covers it') &&
      // M315: a typed task opens with its own words, not the tracker header.
      bare === 'Typed',
    msg)
  // M315. A typed title cut to fit the board is not sent beside the whole line.
  const cut = R.dispatchMessage({ title: 'Make slugify collapse…', description: 'Make slugify collapse repeated spaces and trim' })
  const whole = R.dispatchMessage({ title: 'Fix the login', description: 'SSO users see a 401' })
  ok('flow.cut.1 a typed task whose title was cut sends its whole sentence once — never the cut title above it — while an uncut title still leads its description',
    cut === 'Make slugify collapse repeated spaces and trim' && whole === 'Fix the login\n\nSSO users see a 401', JSON.stringify({ cut, whole }))
  const pkg = JSON.stringify({ scripts: { test: 'vitest', build: 'tsc' } })
  ok('flow.2 Run checks suggests only what the lane declares — its package.json test/check/verify script under the lockfile\'s runner, else Cargo, Go, Python or make — and nothing when it declares none',
    R.suggestCheckCommand(['package.json', 'pnpm-lock.yaml'], pkg) === 'pnpm test' &&
      R.suggestCheckCommand(['package.json'], pkg) === 'npm test' &&
      R.suggestCheckCommand(['package.json'], JSON.stringify({ scripts: { verify: 'node v.js' } })) === 'npm run verify' &&
      R.suggestCheckCommand(['package.json'], '{not json') === null &&
      R.suggestCheckCommand(['Cargo.toml']) === 'cargo test' && R.suggestCheckCommand(['go.mod']) === 'go test ./...' &&
      R.suggestCheckCommand(['pyproject.toml']) === 'pytest' && R.suggestCheckCommand(['README.md']) === null,
    'suggestions')
  const item = { url: 'https://x/12', brief: 'SSO users can log in', criteria: ['401 is gone', 'a test covers it'], criteriaMet: ['401 is gone'] }
  const verified = R.prBody(item, { verification: { word: 'verified', missing: [] }, checks: [{ command: 'npm test', words: 'exit 0', tested: 'abc1234567' }], reviewedFiles: 3, openComments: 0 })
  const short = R.prBody(item, { verification: { word: 'agent finished — not verified', missing: ['no check has run on this revision'] }, checks: [], openComments: 2 })
  const card = R.prBody(item)
  ok('flow.3 the PR body carries the outcome, the criteria ticked by what the person confirmed, the witnessed checks with the revision they tested and the verdict — saying plainly when it is NOT verified — and a PR opened without gathering evidence has no evidence section at all',
    verified.includes('Closes https://x/12') && verified.includes('## Intended outcome\n\nSSO users can log in') &&
      verified.includes('- [x] 401 is gone') && verified.includes('- [ ] a test covers it') &&
      verified.includes('**verified**') && verified.includes('`npm test` — exit 0 (tested abc1234567)') && verified.includes('Reviewed 3 files') &&
      verified.includes("not the agent's own report") &&
      short.includes('**agent finished — not verified** — no check has run on this revision.') && short.includes('No check was witnessed') && short.includes('2 review comments are still open') &&
      !card.includes('## Evidence') && !card.includes('No check was witnessed'),
    JSON.stringify({ verified, short, card }))
}

const { existsSync, realpathSync, rmSync } = require('node:fs')
// M311 — combine.1–.4. PARALLEL WORK, SAFE TO COMBINE. An overlap (one
//      path, separate checkouts) is not contention (one checkout, two
//      writers); the order honours authored links, then lanes that meet
//      nobody, then the smaller diff; and the combined tree is real — two
//      lanes that each apply alone conflict together, found BEFORE a merge.
{
  const lanes = [
    { id: '/w/a', label: 'A', branch: 'tc/a', files: ['src/api.ts', 'src/a.ts'], added: 40, removed: 2 },
    { id: '/w/b', label: 'B', branch: 'tc/b', files: ['src/api.ts'], added: 5, removed: 1 },
    { id: '/w/c', label: 'C', branch: 'tc/c', files: ['docs/c.md'], added: 90, removed: 0 },
    { id: '/w/d', label: 'D', branch: 'tc/d', files: [], added: 0, removed: 0 }
  ]
  const plan = R.planCombine(lanes)
  const linked = R.planCombine(lanes, [{ from: '/w/a', to: '/w/b' }])
  const loop = R.planCombine(lanes, [{ from: '/w/a', to: '/w/b' }, { from: '/w/b', to: '/w/a' }])
  ok('combine.1 overlaps are paths changed in more than one lane; a lane with no changes is not in the plan; a lane that meets nobody lands first, then the smaller overlapping lane — each step says why, and names where it meets the lanes before it',
    plan.lanes.length === 3 && plan.overlaps.length === 1 && plan.overlaps[0].path === 'src/api.ts' && plan.overlaps[0].lanes.join() === '/w/a,/w/b' &&
      plan.order.map((s) => s.label).join() === 'C,B,A' && /touches no file/.test(plan.order[0].reason) && /smallest/.test(plan.order[1].reason) &&
      plan.order[2].meets.join() === 'src/api.ts' && plan.order[1].meets.length === 0 && /1 file changed in more than one/.test(plan.summary),
    JSON.stringify(plan))
  ok('combine.2 an authored hand-off outranks size (A before B though A is larger), and a loop of links is SAID and still orders every lane rather than dropping them',
    linked.order.map((s) => s.label).join() === 'C,A,B' && /hand-off link/.test(linked.order[2].reason) &&
      loop.cycle.length === 2 && loop.order.length === 3 && loop.order.some((s) => /loop/.test(s.reason)),
    JSON.stringify({ linked: linked.order, loop: loop.order, cycle: loop.cycle }))
  const conflicts = R.parseApplyConflicts("error: patch failed: src/x.ts:12\nApplied patch to 'src/y.ts' with conflicts.\nU src/y.ts\nerror: could not build fake ancestor\n")
  ok('combine.3 relativeToCheckout keys a path by its checkout (and not a sibling that shares a prefix); git apply\'s conflict report yields paths, never its sentences',
    R.relativeToCheckout('/w/a/src/x.ts', '/w/a') === 'src/x.ts' && R.relativeToCheckout('/w/a2/src/x.ts', '/w/a') === '/w/a2/src/x.ts' &&
      R.relativeToCheckout('./src/x.ts', undefined) === 'src/x.ts' && R.relativeToCheckout('src/x.ts', '/w/a/') === 'src/x.ts' &&
      conflicts.join() === 'src/x.ts,src/y.ts',
    JSON.stringify(conflicts))
}
if (GIT) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'tc combine ')))
  const repo = join(base, 'repo')
  mkdirSync(repo)
  const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  git(repo, 'init', '-q', '.'); git(repo, 'config', 'user.email', 'v@example.com'); git(repo, 'config', 'user.name', 'v')
  writeFileSync(join(repo, 'f.txt'), 'one\ntwo\nthree\n')
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'init')
  const lane = (name) => { const p = join(base, name); git(repo, 'worktree', 'add', '-q', '-b', `tc/${name}`, p); return p }
  const a = lane('a'), b = lane('b'), c = lane('c')
  writeFileSync(join(a, 'f.txt'), 'ONE\ntwo\nthree\n')          // uncommitted edit
  writeFileSync(join(a, 'new-a.txt'), 'a\n')                    // untracked file
  writeFileSync(join(b, 'f.txt'), 'one\ntwo\nTHREE\n'); git(b, 'commit', '-qam', 'b')   // committed, a different hunk
  writeFileSync(join(c, 'f.txt'), 'uno\ntwo\nthree\n')          // the SAME line as a
  const runner = R.createGitRunner({ gitPath: () => 'git', env: () => process.env })
  const engine = R.createReviewEngine({ run: runner, baselineOf: () => undefined, peersInRepo: () => 0 })
  const combiner = R.createCombineRunner({ run: runner, commonRootOf: (p) => engine.commonRootOf(p), worktreesDir: join(base, 'wt') })
  const clean = await combiner.run({ root: a, lanes: [a, b] })
  const merged = clean.kind === 'combined' ? readFileSync(join(clean.path, 'f.txt'), 'utf8') : ''
  const clash = await combiner.run({ root: repo, lanes: [a, b, c] })
  ok('combine.4 a real combine: two lanes (one uncommitted with an untracked file, one committed) apply in order into a scratch checkout OUTSIDE the repository, from any lane\'s path; a third that edits the same line as the first is named as the conflict, with its path — and no lane, nor the main tree, was changed',
    clean.kind === 'combined' && clean.conflict === null && clean.applied.length === 2 && merged === 'ONE\ntwo\nTHREE\n' &&
      existsSync(join(clean.path, 'new-a.txt')) && !clean.path.startsWith(repo) &&
      clash.kind === 'combined' && clash.conflict !== null && clash.conflict.lane === c && clash.conflict.paths.includes('f.txt') && clash.applied.length === 2 &&
      readFileSync(join(a, 'f.txt'), 'utf8') === 'ONE\ntwo\nthree\n' && readFileSync(join(repo, 'f.txt'), 'utf8') === 'one\ntwo\nthree\n' &&
      git(repo, 'status', '--porcelain').trim() === '',
    JSON.stringify({ clean, clash, merged }))
  rmSync(base, { recursive: true, force: true })
}

// M312 — setup.1–.4. REPOSITORY SETUP. Detection reads the lockfile's own
//      tool; a record parses field-level; ports are a per-lane span that
//      skips taken ones; preparation runs only a SAVED record, stops at the
//      first failing step with its output kept, and the agent is told only
//      what the record says.
{
  const pkg = JSON.stringify({ scripts: { dev: 'vite', test: 'vitest', lint: 'eslint .' } })
  const pnpm = R.detectSetup('/r', ['package.json', 'pnpm-lock.yaml'], pkg)
  const npm = R.detectSetup('/r', ['package.json', 'package-lock.json'], pkg)
  const go = R.detectSetup('/r', ['go.mod'])
  ok('setup.1 detection proposes the lockfile\'s own installer (never npm in a pnpm repository), the declared checks, a dev service with a port, and a preview on it',
    pnpm.install.join() === 'pnpm install --frozen-lockfile' && pnpm.checks.join() === 'pnpm run lint,pnpm test' &&
      pnpm.services[0].name === 'web' && pnpm.services[0].command === 'pnpm run dev' && pnpm.services[0].port === true && pnpm.previewAt.service === 'web' &&
      npm.install.join() === 'npm ci' && npm.checks.join() === 'npm run lint,npm test' &&
      go.install.join() === 'go mod download' && go.checks.join() === 'go test ./...' && go.services.length === 0,
    JSON.stringify({ pnpm, npm, go }))
  const parsed = R.parseRepoSetup({ root: '/r', install: ['npm ci', 5, 'bad\nline', ''], services: [{ name: 'web', command: 'npm run dev', port: true }, { name: 'web', command: 'dup' }, { name: '', command: 'x' }], checks: 'npm test', ports: { base: 80, span: 5 }, previewAt: { service: 'nope' } })
  const ports = R.allocatePorts({ services: [{ name: 'web', command: 'a', port: true }, { name: 'api', command: 'b', port: true }, { name: 'db', command: 'c', port: false }], ports: { base: 4100, span: 3 } }, 2, new Set([4106]))
  const tight = R.allocatePorts({ services: [{ name: 'a', command: 'a', port: true }, { name: 'b', command: 'b', port: true }], ports: { base: 4100, span: 1 } }, 1, new Set())
  ok('setup.2 a record parses field-level (a bad command costs itself, a duplicate or nameless service costs itself, a list that is not a list is empty, bad ports fall back); a lane\'s ports are its own span, skipping taken ones, and a service that does not fit is null — never a port outside the span; the env names PORT and TC_PORT_<NAME>',
    parsed.install.join() === 'npm ci' && parsed.services.length === 1 && parsed.checks.length === 0 && parsed.ports.base === 4100 && parsed.previewAt === undefined &&
      R.parseRepoSetup({ install: [] }) === null &&
      ports.web === 4107 && ports.api === 4108 && !('db' in ports) && tight.a === 4101 && tight.b === null &&
      JSON.stringify(R.setupEnv({ web: 4107, api: 4108, x: null })) === JSON.stringify({ PORT: '4107', TC_PORT_WEB: '4107', TC_PORT_API: '4108' }) &&
      R.servicesFromText('web: npm run dev\napi : node api.js\nplain command').map((x) => x.name).join() === 'web,api,service3' &&
      R.watcherArgv('npm test').command === 'npm' && R.watcherArgv('npm run lint && npm test').command === '/bin/sh' && R.watcherArgv('  ') === null,
    JSON.stringify({ parsed, ports, tight }))
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'tc setup ')))
  const repo = join(dir, 'repo'); mkdirSync(repo)
  const lanePath = join(dir, 'lane'); mkdirSync(lanePath)
  writeFileSync(join(repo, 'package.json'), pkg)
  const puts = []
  const store = R.createRepoSetupStore({
    dir: join(dir, 'store'),
    mainRootOf: async (cwd) => (cwd === repo || cwd === lanePath ? repo : null),
    lanesOf: () => [lanePath],
    loginEnv: () => process.env,
    outputs: { put: (r) => puts.push(r) },
    isPortFree: async (p) => p !== 4110
  })
  const draft = await store.read(lanePath)
  const none = await store.prepare({ lane: lanePath })
  const saved = await store.save({ root: lanePath, install: ['echo installed > marker.txt', 'echo "$PORT $TC_PORT_WEB"; echo boom >&2; exit 3', 'echo never > never.txt'], services: [{ name: 'web', command: 'x', port: true }], checks: ['npm test'] })
  const again = await store.read(repo)
  const prep = await store.prepare({ lane: lanePath })
  ok('setup.3 an unsaved repository reads as a DRAFT and preparation refuses to run it; a save is keyed by the MAIN tree (saved from a lane, read from the root); preparation runs the steps in the lane in order, with the lane\'s ports in its env, stops at the first failure — the next step never runs — and keeps each step\'s whole output as a setup record',
    draft.kind === 'draft' && draft.setup.install.join() === 'npm install' && none.kind === 'no-setup' &&
      saved.ok === true && saved.setup.root === repo && again.kind === 'saved' &&
      prep.kind === 'failed' && prep.steps.length === 2 && prep.steps[0].exitCode === 0 && prep.steps[1].exitCode === 3 &&
      existsSync(join(lanePath, 'marker.txt')) && !existsSync(join(lanePath, 'never.txt')) &&
      prep.ports.web === 4111 && puts.length === 2 && puts[1].source === 'setup' && /4111 4111/.test(puts[1].head + puts[1].tail) && /boom/.test(puts[1].head + puts[1].tail) &&
      /exited 3 — boom/.test(R.prepareFailureLine(prep)),
    JSON.stringify({ draft: draft.kind, none, prep, line: R.prepareFailureLine(prep) }))
  rmSync(dir, { recursive: true, force: true })
  const s = R.parseRepoSetup({ root: '/r', install: ['npm ci'], services: [{ name: 'web', command: 'npm run dev', port: true }], checks: ['npm test'] })
  const brief = R.setupBrief(s, { kind: 'prepared', steps: [{ command: 'npm ci', exitCode: 0, ms: 1, tail: '' }], ports: { web: 4111 } })
  ok('setup.4 the agent is told what the record says — prepared steps not to repeat, each service with its port and env names, the checks that decide done — and nothing at all for a repository with no saved setup; Start work\'s line says a draft has not been saved',
    /Already prepared.*`npm ci`/.test(brief) && /\*\*web\*\*: `npm run dev` on port 4111 \(env PORT \/ TC_PORT_WEB\)/.test(brief) && /`npm test`\. Run them before/.test(brief) &&
      R.setupBrief(null, null) === '' &&
      /no setup saved/.test(R.setupLine({ kind: 'draft', setup: s })) && /prepares with `npm ci`/.test(R.setupLine({ kind: 'saved', setup: s })),
    brief)
}

// M314 — recipe.1–.3. RECIPES carry context, checks and deliverables; the
//      task keeps its own copy; the first message says them; a finished task
//      becomes a recipe with the checks that PASSED.
{
  const ids = R.BUILT_IN_RECIPES.map((r) => r.id).join()
  const fill = R.applyRecipe(R.BUILT_IN_RECIPES[0], 'auth › refresh')
  const impl = R.applyRecipe(R.BUILT_IN_RECIPES.find((r) => r.id === 'recipe-implement-issue'), 'owner/repo#9')
  ok('recipe.1 the four built-ins exist — fix a failing test, implement an issue, review a change, investigate a bug — each with criteria, deliverables and context, not only an arrangement; applying one aims it with the person\'s answer',
    ids === 'recipe-fix-test,recipe-implement-issue,recipe-review-change,recipe-investigate-bug' &&
      R.BUILT_IN_RECIPES.every((r) => r.criteria.length > 0 && r.deliverables.length > 0 && r.context.length > 0) &&
      fill.title === 'Fix a failing test: auth › refresh' && fill.brief.includes('"auth › refresh"') && !fill.brief.includes('{input}') && fill.swarm === undefined &&
      impl.swarm === 'implement' && fill.recipeId === 'recipe-fix-test',
    JSON.stringify({ fill, impl }))
  const msg = R.dispatchMessage({ title: 'T', brief: 'b' }, [R.recipeMessage({ recipeId: 'recipe-fix-test', checks: ['npm test'], deliverables: ['the fix'] }), ''])
  const plain = R.dispatchMessage({ title: 'T' }, [R.recipeMessage({}), R.setupBrief(null, null)])
  const mine = R.recipeFromTask({ id: 'wi1', title: 'login 401', brief: 'Fix login 401 for SSO', criteria: ['401 gone'], checks: ['npm test', 'npm run e2e'], deliverables: ['the fix'], recipeId: 'recipe-fix-test' }, { name: 'SSO login fix', passedChecks: ['npm test', 'npm test'], now: 1000 })
  ok('recipe.2 the first message gains how to gather context, the checks that must pass and what to hand back — and a task with none sends exactly the M310 message; a saved recipe keeps the checks that PASSED (deduped), templates the brief on the task\'s own title, keeps its recipe\'s ask and context, and records where it came from',
    /Before you start:\n- Run the failing check first/.test(msg) && /Checks that must pass:\n- `npm test`/.test(msg) && /Hand back:\n- the fix/.test(msg) &&
      plain === 'T' &&
      mine.checks.join() === 'npm test' && mine.brief === 'Fix {input} for SSO' && mine.ask.label === 'Which test is failing?' &&
      mine.context.includes('failing-output') && mine.savedFrom.taskId === 'wi1' && /^mine-sso-login-fix-/.test(mine.id),
    JSON.stringify({ msg, mine }))
  const dir = mkdtempSync(join(tmpdir(), 'tc recipes '))
  const store = R.createRecipeStore({ dir })
  const s1 = await store.save(mine)
  const s2 = await store.save({ ...R.BUILT_IN_RECIPES[0] })
  const s3 = await store.save({ id: 'mine-x', name: 'X', criteria: 'not a list', swarm: 'bogus' })
  const listed = await store.list()
  const gone = await store.remove(mine.id)
  const item = R.parseWorkItems([{ id: 'w', source: 'typed', title: 't', state: 'todo', createdAt: 1, updatedAt: 1, recipeId: 'recipe-fix-test', checks: ['npm test'], deliverables: 'nope' }], [])
  ok('recipe.3 the store keeps the person\'s recipes, refuses a built-in\'s id (a saved list cannot shadow one), parses field-level, and deletes by id; a work item keeps its recipe, checks and deliverables field-level',
    s1.ok === true && s2.ok === false && s3.ok === true && s3.recipe.criteria.length === 0 && s3.recipe.swarm === undefined &&
      listed.map((r) => r.id).join() === `mine-x,${mine.id}` && gone === true && R.allRecipes(listed).length === 6 &&
      item[0].recipeId === 'recipe-fix-test' && item[0].checks.join() === 'npm test' && item[0].deliverables === undefined,
    JSON.stringify({ s2, listed: listed.map((r) => r.id), item }))
  rmSync(dir, { recursive: true, force: true })
}

// M313 — editor.1–.2. OPEN IN THE PERSON'S EDITOR, AT THE LINE. The CLI on
//      the login PATH first, then an installed app's URL scheme, then the
//      default app SAYING it dropped the line; a named editor that is not
//      there is refused by name, never opened in something else.
{
  const which = (bins) => (b) => (bins.includes(b) ? `/usr/local/bin/${b}` : null)
  const t = { path: '/r/src/a.ts', line: 118, col: 4 }
  const code = R.planEditorOpen(t, 'auto', which(['code']), () => false)
  const cursorFirst = R.planEditorOpen(t, 'auto', which(['code', 'cursor']), () => false)
  const url = R.planEditorOpen(t, 'auto', which([]), (id) => id === 'vscode')
  const none = R.planEditorOpen(t, 'auto', which([]), () => false)
  const named = R.planEditorOpen(t, 'zed', which(['code']), () => false)
  const jb = R.planEditorOpen(t, 'idea', which(['idea']), () => false)
  const dir = R.planEditorOpen({ path: '/r/wt', dir: true }, 'vscode', which(['code']), () => false)
  ok('editor.1 a file at a line goes to the first editor CLI with that editor\'s own line syntax (code -g file:line:col; idea --line --column), then to an installed app\'s URL, then to the default app with a note naming the dropped line; a worktree opens as a folder; a named editor that is absent is refused by name',
    code.kind === 'cli' && code.args.join(' ') === '-g /r/src/a.ts:118:4' && cursorFirst.editor === 'cursor' &&
      url.kind === 'url' && url.url === 'vscode://file/r/src/a.ts:118:4' &&
      none.kind === 'default-app' && /line 118/.test(none.note) &&
      named.kind === 'refused' && /Zed is not installed/.test(named.reason) &&
      jb.args.join(' ') === '--line 118 --column 4 /r/src/a.ts' && dir.args.join() === '/r/wt' &&
      JSON.stringify(R.parseEditorTarget('src/a.ts:12:3')) === JSON.stringify({ path: 'src/a.ts', line: 12, col: 3 }),
    JSON.stringify({ code, url, none, named, jb, dir }))
  const launched = []
  const opener = R.createEditorOpener({ pref: () => 'auto', which: which(['code']), hasApp: () => false, exists: (p) => p === '/r/src/a.ts', launch: async (bin, args) => { launched.push([bin, ...args]); return null }, openUrl: async () => {}, openPath: async () => '' })
  const opened = await opener({ path: '/r/src/a.ts', line: 7 })
  const missing = await opener({ path: '/r/nope.ts', line: 7 })
  const relative = await opener({ path: 'src/a.ts' })
  const bogusLine = await opener({ path: '/r/src/a.ts', line: -3 })
  ok('editor.2 the opener launches exactly the planned argv, refuses a path that does not exist or is not absolute, and drops a line that is not a positive integer rather than passing it on',
    opened.kind === 'opened' && opened.editor === 'VS Code' && launched[0].join(' ') === '/usr/local/bin/code -g /r/src/a.ts:7' &&
      missing.kind === 'refused' && relative.kind === 'refused' && bogusLine.kind === 'opened' && launched[1].join(' ') === '/usr/local/bin/code /r/src/a.ts',
    JSON.stringify({ launched, missing, relative }))
}

// ── M315. ACCEPT: the lane's branch merged into the main tree ─────────────
// Against REAL git, in a spaced temp directory with a real worktree, because
// every refusal here is about repository state no fake runner can model
// honestly (a dirty main tree, an unmerged path, a MERGE_HEAD left behind).
{
  const { execFileSync } = require('node:child_process')
  const { mkdtempSync, writeFileSync: wf, rmSync: rm, existsSync: ex } = require('node:fs')
  const { tmpdir } = require('node:os')
  const base = mkdtempSync(join(tmpdir(), 'tc merge '))
  const root = join(base, 'repo')
  const lane = join(base, 'lane one')
  const g = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })
  try {
    mkdirSync(root)
    g(root, 'init', '-q', '-b', 'main')
    wf(join(root, 'a.txt'), 'one\n'); g(root, 'add', '-A'); g(root, 'commit', '-qm', 'init')
    g(root, 'worktree', 'add', '-q', '-b', 'tc/lane', lane)
    const runner = R.createGitRunner({ gitPath: () => 'git', env: () => ({ ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }), timeoutMs: () => 20000 })
    const engine = R.createReviewEngine({ run: runner, baselineOf: () => undefined })
    const merge = R.createLaneMerger({ run: runner, commonRootOf: (p) => engine.commonRootOf(p) })

    const empty = await merge({ lane, title: 't', dryRun: true })
    wf(join(lane, 'a.txt'), 'one\ntwo\n')
    const laneDirty = await merge({ lane, title: 't', dryRun: true })
    g(lane, 'commit', '-qam', 'agent: two')
    wf(join(root, 'a.txt'), 'mine\n')
    const mainDirty = await merge({ lane, title: 't', dryRun: true })
    g(root, 'checkout', '-q', '--', 'a.txt')
    const plan = await merge({ lane, title: 'Add two', dryRun: true })
    const headBefore = g(root, 'rev-parse', 'HEAD').trim()
    const moved = await merge({ lane, title: 'Add two', expectHead: '0'.repeat(40) })
    const unmoved = g(root, 'rev-parse', 'HEAD').trim() === headBefore
    const merged = await merge({ lane, title: 'Add two', expectHead: plan.head })
    const landed = g(root, 'show', 'HEAD:a.txt') === 'one\ntwo\n' && g(root, 'log', '-1', '--format=%s').trim() === 'Merge tc/lane: Add two'
    const again = await merge({ lane, title: 'Add two', dryRun: true })
    ok('merge.1 accept refuses BY NAME before any write — nothing ahead, uncommitted lane work, edits in the main tree — plans with both branch names and the count, refuses a lane that moved after the plan without touching the main tree, merges --no-ff with the task in the message, and then has nothing left to merge',
      empty.kind === 'refused' && /nothing to merge/.test(empty.reason) &&
        laneDirty.kind === 'refused' && /not committed/.test(laneDirty.reason) &&
        mainDirty.kind === 'refused' && /uncommitted edits in the main tree/.test(mainDirty.reason) &&
        plan.kind === 'ready' && plan.branch === 'tc/lane' && plan.into === 'main' && plan.commits === 1 &&
        /Merge 1 commit from tc\/lane into main/.test(R.laneMergePlanSentence(plan)) &&
        moved.kind === 'moved' && unmoved &&
        merged.kind === 'merged' && merged.commits === 1 && merged.sha.length === 40 && landed &&
        again.kind === 'refused' && /nothing to merge/.test(again.reason),
      JSON.stringify({ empty, laneDirty, mainDirty, plan, moved, merged, again }))

    // A conflict is ABORTED, never left half-done in the person's checkout.
    wf(join(lane, 'a.txt'), 'lane side\n'); g(lane, 'commit', '-qam', 'agent: lane side')
    wf(join(root, 'a.txt'), 'main side\n'); g(root, 'commit', '-qam', 'person: main side')
    const conflict = await merge({ lane, title: 'Clash' })
    const clean = g(root, 'status', '--porcelain').trim() === '' && !ex(join(root, '.git', 'MERGE_HEAD'))
    ok('merge.2 a conflicting accept is aborted — the main tree is clean with no MERGE_HEAD — and names the conflicting file and the branch it would have changed',
      conflict.kind === 'conflict' && conflict.files.includes('a.txt') && conflict.into === 'main' && clean &&
        /conflicted in a\.txt/.test(R.laneMergeOutcome(conflict)),
      JSON.stringify({ conflict, clean }))

    const detachedAt = g(root, 'rev-parse', 'HEAD').trim()
    g(root, 'checkout', '-q', detachedAt)
    const detached = await merge({ lane, title: 't', dryRun: true })
    const fromMain = await merge({ lane: root, title: 't', dryRun: true })
    ok('merge.3 a detached main tree and the main tree itself are refused by name',
      detached.kind === 'refused' && /detached/.test(detached.reason) && fromMain.kind === 'refused',
      JSON.stringify({ detached, fromMain }))
  } catch (e) {
    ok('merge.1 accept against real git', false, 'threw: ' + String(e && e.stack || e))
  } finally {
    try { rm(base, { recursive: true, force: true }) } catch { /* best effort */ }
  }
}

// ── M317. THE INTEGRATION FLOW ─────────────────────────────────────────────
// A combined result knows what it combined (content fingerprints, so a commit
// of the checked bytes keeps it and an edit does not); a failure is traced to
// the lanes and files that produced it, or SAYS it cannot be; the brief to the
// responsible agent is scoped to that interaction; nothing lands unless every
// witness is re-read; and the receipt says whether what landed IS what was checked.
{
  const lanes = [
    { id: '/w/a', label: 'A', branch: 'tc/a', files: ['src/api.ts', 'src/a.ts'], added: 40, removed: 2 },
    { id: '/w/b', label: 'B', branch: 'tc/b', files: ['src/api.ts', 'test/api.test.ts'], added: 5, removed: 1 },
    { id: '/w/c', label: 'C', branch: 'tc/c', files: ['docs/c.md'], added: 9, removed: 0 }
  ]
  const plan = R.planCombine(lanes)
  const conflict = R.attributeConflict(plan, { lane: '/w/a', paths: ['src/api.ts'] }, ['/w/c', '/w/b'])
  const output = 'FAIL /scratch/tc/test/api.test.ts\n  at Object.<anonymous> (/scratch/tc/src/api.ts:12:3)\n  see https://example.com/x.ts\n  node v20.1.0\n'
  const check = R.attributeCheckFailure(plan, ['/w/c', '/w/b', '/w/a'], output, '/scratch/tc')
  const none = R.attributeCheckFailure(plan, ['/w/c', '/w/b', '/w/a'], 'Error: expected 2 got 3\n', '/scratch/tc')
  const elsewhere = R.attributeCheckFailure(plan, ['/w/c', '/w/b'], 'FAIL src/other/untouched.ts:4\n', '/scratch/tc')
  ok('integrate.1 a conflict is the LATER lane\'s (it lands on top) and names the applied lanes that changed the path as met; a failed check is traced through the files its output names — scratch prefix stripped, URLs and versions ignored — to the lane with the most named files; an output naming no changed file says it is unattributed rather than guessing silently',
    conflict.responsible === '/w/a' && conflict.participants.find((p) => p.lane === '/w/b').role === 'met' && conflict.participants.find((p) => p.lane === '/w/c').role === 'present' &&
      R.outputPaths(output, '/scratch/tc').join() === 'test/api.test.ts,src/api.ts' &&
      check.responsible === '/w/b' && !check.unattributed && check.paths.includes('test/api.test.ts') && check.participants.find((p) => p.lane === '/w/a').role === 'met' &&
      none.unattributed && none.responsible === '/w/a' && /names no file/.test(none.summary) &&
      elsewhere.unattributed && /no lane changed/.test(elsewhere.summary),
    JSON.stringify({ conflict, check, none, elsewhere }))
  const brief = R.integrationFixBrief({ attribution: check, to: '/w/b', labelOf: (l) => l, command: 'npm test', exitCode: 1, tail: 'FAIL test/api.test.ts', base: 'abcdef1234' })
  ok('integrate.2 the brief to the responsible agent is scoped: what failed together and with whom, the files, where the other lane\'s copy is (read, never edit), the output\'s last lines, and the check to run again',
    /can each pass alone/.test(brief) && /npm test` exited 1/.test(brief) && /abcdef1/.test(brief) && /Files involved: src\/api\.ts, test\/api\.test\.ts/.test(brief) &&
      /A changed src\/api\.ts too — its copy: \/w\/a\/src\/api\.ts/.test(brief) && /do not edit that lane/.test(brief) && /```\nFAIL test\/api\.test\.ts\n```/.test(brief) && /run `npm test` in your lane/.test(brief),
    brief)
  const w = { base: 'b1', inputs: [{ lane: '/w/a', head: 'h1', digest: 'd1', dirty: true }, { lane: '/w/b', head: 'h2', digest: 'd2', dirty: false }] }
  const same = R.integrationStanding(w, { kind: 'inputs', root: '/r', base: 'b1', lanes: [{ lane: '/w/a', head: 'h9', digest: 'd1', dirty: false }, { lane: '/w/b', head: 'h2', digest: 'd2', dirty: false }] })
  const moved = R.integrationStanding(w, { kind: 'inputs', root: '/r', base: 'b2', lanes: [{ lane: '/w/a', head: 'h1', digest: 'dX', dirty: true }] })
  const gate = R.integrationGate({ combined: 'clean', check: 'passed', standing: same, lanes: [{ lane: '/w/a', label: 'A', review: 'current', dirty: false }, { lane: '/w/b', label: 'B', review: 'stale', dirty: true }] })
  const ready = R.integrationGate({ combined: 'clean', check: 'passed', standing: same, lanes: [{ lane: '/w/a', label: 'A', review: 'current', dirty: false }] })
  ok('integrate.3 staleness is CONTENT: a commit of the checked bytes (new head, same digest) is current, an edit or a moved main tree or a lane gone is stale and said; the gate lists each unmet condition by lane and is ready only when all hold',
    same.kind === 'current' && moved.kind === 'stale' && moved.changed.join() === '/w/a' && moved.missing.join() === '/w/b' && moved.mainMoved &&
      /A changed since the combine; B can no longer be read; the main tree has new commits/.test(R.staleWords(moved, (l) => l.slice(3).toUpperCase())) &&
      !gate.ready && gate.items.some((i) => !i.holds && /B changed since its review/.test(i.text)) && gate.items.some((i) => !i.holds && /B has uncommitted/.test(i.text)) &&
      ready.ready,
    JSON.stringify({ same, moved, gate }))
}
if (GIT) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'tc integrate ')))
  const repo = join(base, 'repo')
  mkdirSync(repo)
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
  const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env })
  try {
    git(repo, 'init', '-q', '-b', 'main')
    writeFileSync(join(repo, 'f.txt'), 'one\ntwo\nthree\n')
    git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'init')
    const lane = (name) => { const p = join(base, name); git(repo, 'worktree', 'add', '-q', '-b', `tc/${name}`, p); return p }
    const a = lane('a'), b = lane('b')
    writeFileSync(join(a, 'f.txt'), 'ONE\ntwo\nthree\n')                              // uncommitted at combine time
    writeFileSync(join(a, 'new-a.txt'), 'created\n')                                 // UNTRACKED at combine time
    writeFileSync(join(b, 'g.txt'), 'b\n'); git(b, 'add', '-A'); git(b, 'commit', '-qm', 'b')
    const runner = R.createGitRunner({ gitPath: () => 'git', env: () => env, timeoutMs: () => 20000 })
    const engine = R.createReviewEngine({ run: runner, baselineOf: () => undefined, peersInRepo: () => 0 })
    const wt = join(base, 'wt')
    const combiner = R.createCombineRunner({ run: runner, commonRootOf: (p) => engine.commonRootOf(p), worktreesDir: wt })
    const combined = await combiner.run({ root: repo, lanes: [a, b] })
    // Commit the SAME content the check saw — the fingerprint must hold, even
    // for a file that was untracked then and is a committed hunk now.
    git(a, 'add', '-A'); git(a, 'commit', '-qm', 'a')
    const after = await combiner.inputs({ root: repo, lanes: [a, b] })
    const standing = R.integrationStanding({ base: combined.base, inputs: combined.inputs }, after)
    const outputs = new Map()
    const scratch = R.combineScratchPath(wt, repo)
    outputs.set('ok-run', { kind: 'ok', record: { runId: 'ok-run', cwd: scratch, exitCode: 0, command: 'npm test', endedAt: 5 } })
    outputs.set('red-run', { kind: 'ok', record: { runId: 'red-run', cwd: scratch, exitCode: 1, command: 'npm test', endedAt: 5 } })
    outputs.set('elsewhere', { kind: 'ok', record: { runId: 'elsewhere', cwd: a, exitCode: 0, command: 'npm test', endedAt: 5 } })
    const receipts = R.createReceiptStore({ file: join(base, 'receipts.json') })
    const merge = R.createLaneMerger({ run: runner, commonRootOf: (p) => engine.commonRootOf(p) })
    const integrate = R.createIntegrator({ run: runner, commonRootOf: (p) => engine.commonRootOf(p), worktreesDir: wt, readOutput: async (id) => outputs.get(id) ?? { kind: 'missing' }, merge, receipts, now: () => 1000 })
    const req = (outputId) => ({
      root: repo, base: combined.base, tree: combined.tree, check: { command: 'npm test', outputId }, reviewed: [a, b],
      lanes: combined.inputs.map((i) => ({ lane: i.lane, label: i.lane === a ? 'A' : 'B', digest: i.digest, itemId: i.lane === a ? 'item-a' : 'item-b', title: i.lane === a ? 'Task A' : 'Task B' }))
    })
    const red = await integrate(req('red-run'))
    const wrongPlace = await integrate(req('elsewhere'))
    // An edit after the check makes it stale — and nothing merges.
    writeFileSync(join(b, 'g.txt'), 'b2\n')
    const staleRun = await integrate(req('ok-run'))
    const headBefore = git(repo, 'rev-parse', 'HEAD').trim()
    git(b, 'checkout', '--', 'g.txt')
    const done = await integrate(req('ok-run'))
    const listed = await receipts.list(repo)
    ok('integrate.4 real git: a combine records each lane\'s fingerprint and the combined tree; committing the checked content keeps it current; integrate refuses a failed check and a check that ran elsewhere, returns stale (merging nothing) after a lane is edited, and otherwise lands both lanes in order — the receipt names each merge, the witnessing check, and that the landed tree IS the checked tree',
      combined.kind === 'combined' && combined.conflict === null && typeof combined.tree === 'string' && combined.inputs.length === 2 &&
        standing.kind === 'current' &&
        red.kind === 'refused' && /did not pass/.test(red.reason) && wrongPlace.kind === 'refused' && /did not run on this repository/.test(wrongPlace.reason) &&
        staleRun.kind === 'stale' && staleRun.changed.join() === b && headBefore === combined.base &&
        done.kind === 'done' && done.receipt.complete && done.receipt.tree.identical && done.receipt.lanes.map((l) => l.outcome).join() === 'merged,merged' &&
        done.receipt.lanes[0].title === 'Task A' && done.receipt.lanes.every((l) => l.reviewed) && done.receipt.checks[0].outputId === 'ok-run' &&
        git(repo, 'show', 'HEAD:f.txt') === 'ONE\ntwo\nthree\n' && git(repo, 'show', 'HEAD:g.txt') === 'b\n' && git(repo, 'show', 'HEAD:new-a.txt') === 'created\n' &&
        listed.length === 1 && listed[0].id === done.receipt.id && /2 of 2 lanes landed in main .*byte-identical/.test(R.receiptHeadline(listed[0])),
      JSON.stringify({ combined, standing, red, wrongPlace, staleRun, done }))
  } catch (e) {
    ok('integrate.4 real git', false, 'threw: ' + String(e && e.stack || e))
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
}

// ── M320 — a task's deliverables, their status and provenance ──────────────
{
  const idAt = (base, content) => ({ base, content })
  const item = {
    id: 't1', source: 'typed', title: 'Fix the parser', state: 'review', createdAt: 1, updatedAt: 50, panelId: 'c9',
    brief: 'no crash on empty input', criteria: ['tests pass'], criteriaMet: ['tests pass'], deliverables: ['a test for empty input'],
    reviewed: { at: 40, signature: 'sig', files: 3, identity: idAt('b1', 'c'.repeat(32)) },
    merged: { into: 'main', sha: 'abcdef1234', at: 60 },
    comments: [{ id: 'k', path: 'src/p.ts', side: 'new', line: 3, quote: 'x', body: 'handle null too', at: 41 }]
  }
  const artifact = (at, paths, digests, extra = {}) => ({ kind: 'event', runId: 'r1', at, event: 'artifact', source: 'person', itemId: 't1', panelId: 'c9', title: 'Reviewed', paths, root: '/lane', ...(digests ? { digests } : {}), producer: { title: 'parser lane', kind: 'chat', backend: 'codex' }, ...extra })
  const events = [
    { kind: 'event', runId: 'r1', at: 10, event: 'dispatch', source: 'person', itemId: 't1', panelId: 'c9', title: 'Dispatched', producer: { title: 'parser lane', kind: 'chat', backend: 'codex' } },
    artifact(20, ['src/p.ts', 'src/old.ts'], { 'src/p.ts': 'aaaa1111aaaa1111', 'src/old.ts': 'bbbb2222bbbb2222' }),
    artifact(40, ['src/p.ts', 'src/new.ts', 'src/gone.ts'], { 'src/p.ts': 'cccc3333cccc3333', 'src/new.ts': 'dddd4444dddd4444', 'src/gone.ts': 'eeee5555eeee5555' }, { tested: idAt('b1', 'c'.repeat(32)) }),
    { kind: 'event', runId: 'r1', at: 45, event: 'artifact', source: 'person', itemId: 't1', panelId: 'b2', title: 'Captured localhost', detail: 'http://localhost:3000/', key: 'capture:shot-1.png', producer: { title: 'preview', kind: 'browser' } },
    { kind: 'event', runId: 'r1', at: 46, event: 'artifact', source: 'person', itemId: 't1', panelId: 'b2', title: 'Captured localhost', detail: 'http://localhost:3000/x', key: 'capture:shot-2.png', producer: { title: 'preview', kind: 'browser' } }
  ]
  const commands = [
    { panelId: 'w1', command: 'npm test', cwd: '/lane', startedAt: 30, endedAt: 31, exitCode: 1, outputId: 'o1', tested: idAt('b1', 'c'.repeat(32)) },
    { panelId: 'w1', command: 'npm test', cwd: '/lane', startedAt: 42, endedAt: 43, exitCode: 0, outputId: 'o2', tested: idAt('b1', 'c'.repeat(32)) },
    { panelId: 'w1', command: 'npm run lint', cwd: '/lane', startedAt: 44, endedAt: 44, exitCode: 0, outputId: 'o3', tested: idAt('b1', 'c'.repeat(32)) }
  ]
  const checks = { o1: { runId: 'o1', panelId: 'w1', command: 'npm test', exitCode: 1, endedAt: 31, tested: idAt('b1', 'c'.repeat(32)) }, o2: { runId: 'o2', panelId: 'w1', command: 'npm test', exitCode: 0, endedAt: 43, tested: idAt('b1', 'c'.repeat(32)) }, o3: null }
  const files = { 'src/p.ts': { exists: true, digest: 'cccc3333cccc3333' }, 'src/new.ts': { exists: true, digest: 'ffff0000ffff0000' }, 'src/gone.ts': { exists: false }, 'src/old.ts': { exists: true, digest: 'zzzz' } }
  const receipts = [{ v: 1, id: 'rc1', root: '/repo', into: 'main', at: 61, base: 'b', before: 'b', after: 'a', tree: { checked: 't', landed: 't', identical: true }, lanes: [{ lane: '/lane', label: 'A', branch: 'tc/a', itemId: 't1', digest: 'd', head: 'h', reviewed: true, outcome: 'merged', commits: 1, sha: 'abcdef1234' }], checks: [], complete: true }]
  const livePanels = [{ id: 'w1', kind: 'watcher', title: 'tests' }]
  const same = new Map([['b1', idAt('b1', 'c'.repeat(32))]])
  const moved = new Map([['b1', idAt('b1', 'd'.repeat(32))]])
  const list = R.collectDeliverables({ item, events, commands, checks, files, receipts, panels: livePanels, capturesOnDisk: new Set(['shot-1.png']), identities: same })
  const by = (id) => list.find((d) => d.id === id)
  const fileAt = (path, at) => list.find((d) => d.kind === 'file' && d.subject === path && d.at === at)
  ok('deliver.1 every kind of output is gathered under the task with its status: a reviewed file whose digest still matches is CURRENT and a CAPTURED version; one whose content moved is MODIFIED since review; a deleted one MISSING; an earlier review of the same path SUPERSEDED; a capture whose image file is gone MISSING; the newest run of a command current and the older SUPERSEDED; a check whose output record was pruned MISSING; the merge, the receipt, the conversation and each expected deliverable listed — and nothing unknown reads as current',
    fileAt('src/p.ts', 40).status === 'current' && fileAt('src/p.ts', 40).reference === 'captured' &&
      fileAt('src/new.ts', 40).status === 'modified' && /changed after it was reviewed/.test(fileAt('src/new.ts', 40).why) &&
      fileAt('src/gone.ts', 40).status === 'missing' && fileAt('src/p.ts', 20).status === 'superseded' &&
      fileAt('src/old.ts', 20).status === 'modified' &&
      by('capture:shot-1.png').status === 'current' && by('capture:shot-2.png').status === 'missing' &&
      by('check:o2').status === 'current' && /^Passed: npm test/.test(by('check:o2').title) && by('check:o1').status === 'superseded' && /^Failed \(exit 1\)/.test(by('check:o1').title) &&
      by('check:o3').status === 'missing' && by('review').status === 'current' &&
      by('merge:abcdef1234') !== undefined && by('receipt:rc1').status === 'current' &&
      by('expected:a test for empty input').status === 'pending' && list[list.length - 1].kind === 'expected' &&
      list.filter((d) => d.status !== 'current' && d.status !== 'pending').every((d) => d.why !== '' || d.kind === 'pr'),
    JSON.stringify(list.map((d) => [d.id, d.status, d.reference, d.why])))
  const stale = R.collectDeliverables({ item, events, commands, checks, files, receipts, panels: livePanels, identities: moved })
  const noLane = R.collectDeliverables({ item, events, commands, checks, files, receipts, panels: livePanels, identities: new Map([['b1', null]]) })
  const unread = R.collectDeliverables({ item, events, commands, checks, files: {}, receipts, panels: livePanels })
  const st = (l, id) => l.find((d) => d.id === id).status
  ok('deliver.2 evidence applies to a revision: when the lane moved, the check and the review read STALE (an older revision), with the lane gone or its identity unread they read UNKNOWN — never current; an unprobed file is unknown and an unprobed capture is unknown',
    st(stale, 'check:o2') === 'stale' && st(stale, 'review') === 'stale' && st(noLane, 'check:o2') === 'unknown' && /lane is gone/.test(noLane.find((d) => d.id === 'review').why) &&
      st(unread, 'review') === 'unknown' && unread.find((d) => d.kind === 'file' && d.at === 40 && d.subject === 'src/p.ts').status === 'unknown' && st(unread, 'capture:shot-1.png') === 'unknown',
    JSON.stringify({ stale: stale.map((d) => [d.id, d.status]), noLane: noLane.map((d) => [d.id, d.status]) }))
  const conv = by('conversation')
  ok('deliver.3 provenance outlives the panel: with the lane chat and the preview CLOSED, each deliverable still names who produced it from what its row recorded — "parser lane on codex (closed)", "preview (closed)" — the live watcher is named from the canvas, and the conversation says its transcript went with it',
    R.producerWord(fileAt('src/p.ts', 40).producedBy) === 'parser lane on codex (closed)' && R.producerWord(by('capture:shot-1.png').producedBy) === 'preview (closed)' &&
      R.producerWord(by('check:o2').producedBy) === 'tests' && conv.status === 'missing' && /transcript/.test(conv.why) && /parser lane on codex \(closed\)/.test(conv.title) &&
      R.producerWord({ panelId: 'x', closed: true }) === 'a closed panel',
    JSON.stringify({ file: fileAt('src/p.ts', 40).producedBy, conv }))
  const md = R.taskHandoffMarkdown({ ...item, backend: 'codex' }, list, Date.UTC(2026, 8, 23, 12, 0))
  const account = R.deliverablesAccount(list)
  ok('deliver.4 the hand-off states the ask (outcome, criteria with the confirmed one ticked), what landed, the verification with each item\'s status and why, the files, where it came from, what was expected back, and the open review comments; the account counts by status and ignores the expected rows',
    /^# Fix the parser/.test(md) && /backend: codex/.test(md) && /- \[x\] tests pass/.test(md) && /### Landed[\s\S]*Merged into main/.test(md) &&
      /### Verification[\s\S]*Passed: npm test @ b1 — current/.test(md) && /src\/new\.ts @ b1 — modified \(the file changed after it was reviewed/.test(md) &&
      /### Expected back\n- a test for empty input/.test(md) && /## Open review comments\n- src\/p\.ts:3 — handle null too/.test(md) &&
      account.total === list.length - 1 && /1 modified|2 modified/.test(account.line) && /missing/.test(account.line),
    md)

  // deliver.5 — main's half against a tmpdir: digests are main's, paths stay
  // inside their root, the evidence read joins the stores, the export is gated.
  const dir = mkdtempSync(join(tmpdir(), 'tc-deliver-'))
  try {
    writeFileSync(join(dir, 'kept.ts'), 'one\n')
    writeFileSync(join(dir, 'changes.ts'), 'before\n')
    const row = await R.withDigests({ kind: 'event', runId: 'r', at: 1, event: 'artifact', source: 'person', itemId: 't', title: 'Reviewed', root: dir, paths: ['kept.ts', 'changes.ts', '../../etc/hosts', 'absent.ts'] })
    const plain = await R.withDigests({ kind: 'event', runId: 'r', at: 1, event: 'dispatch', source: 'person', title: 'x', root: dir, paths: ['kept.ts'] })
    writeFileSync(join(dir, 'changes.ts'), 'after\n')
    const probe = await R.probeFiles(dir, ['kept.ts', 'changes.ts', 'absent.ts', '../outside'])
    const rows = [
      { kind: 'event', row: { ...row, itemId: 't' } },
      { kind: 'event', row: { kind: 'event', runId: 'r', at: 2, event: 'artifact', source: 'person', itemId: 't', title: 'Captured', key: 'capture:there.png' } },
      { kind: 'event', row: { kind: 'event', runId: 'r', at: 3, event: 'artifact', source: 'person', itemId: 't', title: 'Captured', key: 'capture:../../escape.png' } },
      { kind: 'command', row: { panelId: 'w', command: 'npm test', cwd: dir, startedAt: 1, endedAt: 2, exitCode: 0, outputId: 'o-ok' } },
      { kind: 'command', row: { panelId: 'w', command: 'npm test', cwd: dir, startedAt: 1, endedAt: 2, exitCode: 0, outputId: 'o-gone' } }
    ]
    mkdirSync(join(dir, 'captures'), { recursive: true })
    writeFileSync(join(dir, 'captures', 'there.png'), 'png')
    const asked = []
    const written = []
    const doors = R.createTaskEvidence({
      timeline: async (filter) => { asked.push(filter); return { entries: filter.itemId !== undefined ? rows.filter((e) => e.kind === 'event') : rows.filter((e) => e.kind === 'command'), reachedStart: true } },
      checkOutput: async (id) => (id === 'o-ok' ? { kind: 'ok', record: { v: 1, runId: 'o-ok', panelId: 'w', source: 'shell', command: 'npm test', cwd: dir, startedAt: 1, endedAt: 2, exitCode: 0, signal: null, chars: 3, head: 'SECRET OUTPUT', tail: '', elided: 0 } } : { kind: 'missing' }),
      receipts: async () => [{ ...receipts[0], lanes: [{ ...receipts[0].lanes[0], itemId: 't' }] }, { ...receipts[0], id: 'other', lanes: [{ ...receipts[0].lanes[0], itemId: 'someone-else' }] }],
      capturesDir: join(dir, 'captures'),
      askPath: async (s) => (s.includes('cancel') ? null : join(dir, s)),
      write: async (path, text) => { written.push([path, text]) }
    })
    const ev = await doors.evidence({ itemId: 't', panelIds: ['w'], root: dir })
    const token = 'ghp_' + 'A'.repeat(36)
    const out = await doors.exportHandoff({ itemId: 't', title: 'Fix: the parser', markdown: `# Fix\ntoken ${token}\n` })
    const cancelled = await doors.exportHandoff({ itemId: 't', title: 'cancel me', markdown: '# x' })
    ok('deliver.5 main computes an artifact row\'s digests itself at append (a path outside the root and an absent file get none; a non-artifact row passes through), the probe reports a file changed since as a different digest and an absent one as not existing, the evidence read asks by ITEM for events and by PANEL for check runs, carries each check\'s facts but never its output text, marks a pruned record null, keeps only this task\'s receipts and only captures still on disk (never a name with a separator), and the export goes through the outward gate with its count and a sanitised file name',
      Object.keys(row.digests ?? {}).join() === 'kept.ts,changes.ts' && plain.digests === undefined &&
        probe['kept.ts'].exists && probe['kept.ts'].digest === row.digests['kept.ts'] && probe['changes.ts'].digest !== row.digests['changes.ts'] && probe['absent.ts'].exists === false && probe['../outside'] === undefined &&
        asked.some((f) => f.itemId === 't' && f.panelIds === undefined) && asked.some((f) => f.itemId === undefined && f.panelIds.join() === 'w') &&
        ev.checks['o-ok'].command === 'npm test' && !JSON.stringify(ev.checks).includes('SECRET OUTPUT') && ev.checks['o-gone'] === null &&
        ev.receipts.length === 1 && ev.captures.join() === 'there.png' && ev.files['kept.ts'].exists &&
        out.kind === 'written' && out.redacted === 1 && /Fix-the-parser-handoff\.md$/.test(out.path) && !written[0][1].includes(token) && cancelled.kind === 'cancelled' && written.length === 1,
      JSON.stringify({ digests: row.digests, probe, asked, ev: { ...ev, events: ev.events.length }, out }))
  } catch (e) {
    ok('deliver.5 main\'s evidence doors', false, 'threw: ' + String(e && e.stack || e))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  const hits = (q, ev) => R.searchWork(q, [item], [], () => undefined, 30, ev).hits.map((h) => h.field)
  ok('deliver.6 search reaches what a task says and what its record holds: a review comment, a check that decides done, an expected deliverable, a check command it ran and a path its review covered each find the task, naming the field — one row per task',
    hits('handle null', []).join() === 'review comment' && hits('empty input', []).join() === 'brief' && hits('a test for', []).join() === 'deliverable' &&
      hits('vitest --run', [{ itemId: 't1', field: 'check', text: 'vitest --run parser' }]).join() === 'check run' &&
      hits('src/lexer', [{ itemId: 't1', field: 'deliverable', text: 'src/lexer.ts' }, { itemId: 'other', field: 'deliverable', text: 'src/lexer.ts' }]).join() === 'produced',
    JSON.stringify({ c: hits('handle null', []) }))
}

// ── M321 — a successful recipe, reproducible in another repository ────────
{
  const saved = R.recipeFromTask(
    { id: 'wi9', title: 'flaky auth', brief: 'Fix flaky auth in /Users/ada/work/api/src/auth.ts', criteria: ['no retries in /Users/ada/work/api/test'], checks: ['cd /Users/ada/work/api && npm test -- auth', 'node /Users/ada/tools/lint-auth.js'], deliverables: ['a note in /Users/ada/work/api/NOTES.md'], recipeId: 'recipe-fix-test' },
    { name: 'Auth fix', passedChecks: [], now: 5000 })
  const { recipe: portable, findings } = R.parameterizeRecipe(saved, ['/Users/ada/work/api', '/Users/ada/work/api-lane'])
  const again = R.parameterizeRecipe(portable, ['/Users/ada/work/api'])
  ok('portable.1 a recipe saved from a task has its paths lifted: under the repository it was saved from they become {repository}; any other absolute path becomes a named parameter whose default is the original — flagged, never silently kept; a URL is not a path; parameterising twice changes nothing',
    portable.checks[0] === 'cd {repository} && npm test -- auth' && /\{repository\}\/src\/auth\.ts/.test(portable.brief) && portable.criteria[0] === 'no retries in {repository}/test' &&
      portable.deliverables[0] === 'a note in {repository}/NOTES.md' &&
      portable.checks[1] === 'node {param:lint-auth-js}' && portable.params.length === 1 && portable.params[0].default === '/Users/ada/tools/lint-auth.js' &&
      findings.filter((f) => f.fix === 'repository').length === 4 && findings.filter((f) => f.fix === 'param').length === 1 &&
      R.portabilityScan({ brief: 'see https://example.com/a/b and /dev/null', criteria: [], checks: [], deliverables: [] }, []).length === 0 &&
      again.findings.length === 0 && JSON.stringify(again.recipe) === JSON.stringify(portable),
    JSON.stringify({ portable, findings }))

  const fill = R.applyRecipe(portable, 'token refresh', { repository: '/srv/other-repo', params: {} })
  const fillOver = R.applyRecipe(portable, 'x', { repository: '/srv/other-repo', params: { 'lint-auth-js': '/opt/lint/auth.js' } })
  const noRoot = R.applyRecipe(portable, 'x')
  const cwdPortable = R.portableCwd('/Users/ada/work/api-lane/packages/web', ['/Users/ada/work/api', '/Users/ada/work/api-lane'])
  ok('portable.2 taken to a second repository, every field renders against THAT repository: {repository} is its root, a parameter takes its value else its default, and with no repository chosen the placeholder stays — which the preflight refuses; a template member\'s cwd under the lane becomes the {{repository}} hole (the longest root wins)',
    fill.checks[0] === 'cd /srv/other-repo && npm test -- auth' && fill.checks[1] === 'node /Users/ada/tools/lint-auth.js' && /\/srv\/other-repo\/src\/auth\.ts/.test(fill.brief) &&
      fillOver.checks[1] === 'node /opt/lint/auth.js' && noRoot.checks[0] === 'cd {repository} && npm test -- auth' &&
      R.unfilled(noRoot.checks[0], {}).join() === '{repository}' && R.unfilled('{param:missing} {input}', { params: {} }).join() === '{param:missing}' &&
      cwdPortable === '{{repository}}/packages/web' && R.portableCwd('/elsewhere', ['/Users/ada/work/api']) === '/elsewhere',
    JSON.stringify({ fill: fill.checks, fillOver: fillOver.checks, cwdPortable }))

  const setup = R.parseRepoSetup({ root: '/srv/other-repo', install: ['pnpm install --frozen-lockfile'], services: [{ name: 'web', command: 'pnpm run dev', port: true }, { name: 'api', command: 'FOO=1 uvicorn app:api', port: true }], checks: ['pnpm test'] })
  const req = { ...portable, requires: { setup: true, tools: ['docker'], capabilities: ['interrupt'] } }
  const checks = ['cd /srv/other-repo && npm test -- auth', 'node ./scripts/x.js | jq .']
  const fitCodex = R.backendFit('codex', R.taskRequirements({ lane: true }))
  const fitClaude = R.backendFit('claude', R.taskRequirements({ lane: true }))
  const tools = R.preflightTools({ checks, recipe: req, setup: { kind: 'saved', setup } })
  const missing = R.recipePreflight({ checks, recipe: req, setup: { kind: 'saved', setup }, tools: { pnpm: true, uvicorn: false, npm: true, node: true, jq: true, docker: true }, ports: { web: 4110, api: null }, fit: fitClaude, texts: [{ field: 'checks', text: '{param:nope}' }], renderContext: { repository: '/srv/other-repo' } })
  const clear = R.recipePreflight({ checks, recipe: req, setup: { kind: 'saved', setup }, tools: Object.fromEntries(tools.map((t) => [t.tool, true])), ports: { web: 4110, api: 4111 }, fit: fitClaude })
  const noSetup = R.recipePreflight({ checks, recipe: req, setup: { kind: 'draft', setup }, tools: {}, ports: null, fit: fitCodex })
  const unprobed = R.recipePreflight({ checks, setup: null, tools: null, ports: null })
  const ids = (p) => p.items.filter((i) => !i.ok).map((i) => i.id).join()
  ok('portable.3 the preflight names every tool the setup, the services and the checks invoke (past VAR= and builtins, never a path-qualified script) and refuses BEFORE a worker exists on a tool missing from PATH (saying where it would have failed), an unfilled parameter, an unsaved setup the recipe needs, and a backend capability the recipe requires; a port that does not fit only warns; the preview says what will run; unprobed tools are "checking…", never passed',
    tools.map((t) => t.tool).join() === 'pnpm,uvicorn,npm,node,jq,docker' &&
      R.toolsOf('FOO=1 BAR=2 cargo test && cd x; ./gradlew check | tee out').join() === 'cargo,tee' &&
      missing.blocked !== undefined && /\{param:nope\}/.test(missing.blocked) && ids(missing) === 'placeholder:{param:nope},tool:uvicorn,port:api' &&
      /uvicorn is not on the login PATH — a service would fail/.test(missing.items.find((i) => i.id === 'tool:uvicorn').line) && missing.items.find((i) => i.id === 'port:api').severity === 'warn' &&
      clear.blocked === undefined && clear.plan.install.join() === 'pnpm install --frozen-lockfile' && clear.plan.services.map((sv) => `${sv.name}:${sv.port}`).join() === 'web:4110,api:4111' && clear.plan.checks.length === 2 &&
      noSetup.blocked !== undefined && /repository setup saved/.test(noSetup.blocked) && ids(noSetup).includes('capability:interrupt') &&
      unprobed.blocked === undefined && unprobed.items.some((i) => i.id === 'tools' && !i.ok && i.severity === 'warn'),
    JSON.stringify({ missing, clear: clear.plan, noSetup: noSetup.items }))

  // portable.4 — versions: the store assigns them, keeps what they replaced,
  // and a run keeps the exact definition it used.
  const dir = mkdtempSync(join(tmpdir(), 'tc recipe versions '))
  try {
    const store = R.createRecipeStore({ dir })
    const base = { ...portable, id: 'mine-auth' }
    const v1 = await store.save(base)
    const same = await store.save({ ...base, version: 99 })
    const v2 = await store.save({ ...base, checks: [...base.checks, 'npm run lint'] })
    const v3 = await store.save({ ...base, brief: 'rewritten' })
    const history = await store.history('mine-auth')
    const listed = await store.list()
    const use = R.recipeUse(v2.recipe, { at: 10, repository: '/srv/other-repo', params: { 'lint-auth-js': '/opt/l.js' } })
    const items = R.parseWorkItems([{ id: 'w', source: 'typed', title: 't', state: 'todo', createdAt: 1, updatedAt: 1, recipeId: 'mine-auth', recipeUsed: JSON.parse(JSON.stringify(use)) }, { id: 'w2', source: 'typed', title: 't2', state: 'todo', createdAt: 1, updatedAt: 1, recipeUsed: { ...JSON.parse(JSON.stringify(use)), definition: { brief: 'a definition with no name does not parse' } } }], [])
    const tampered = R.parseRecipeUse({ ...JSON.parse(JSON.stringify(use)), hash: 'ffffffff' })
    ok('portable.4 the STORE assigns versions: an unchanged definition keeps its number (a version the renderer claims is ignored), a changed one lands one past the newest, the replaced version moves to the history, and the list holds only the live one; a work item keeps the EXACT definition its run used — parsed whole, its hash recomputed rather than trusted — and a later edit of the recipe does not touch it',
      v1.ok && v1.recipe.version === 1 && same.recipe.version === 1 && v2.recipe.version === 2 && v3.recipe.version === 3 &&
        history.map((h) => h.version).join() === '3,2,1' && listed.filter((r) => r.id === 'mine-auth').length === 1 && listed[0].version === 3 &&
        R.recipeHash(v2.recipe) !== R.recipeHash(v3.recipe) && R.recipeHash(v1.recipe) === R.recipeHash({ ...v1.recipe, version: 7, savedFrom: { taskId: 'z', at: 1 } }) &&
        items[0].recipeUsed.version === 2 && items[0].recipeUsed.definition.checks.includes('npm run lint') && items[0].recipeUsed.definition.brief !== 'rewritten' &&
        items[0].recipeUsed.params['lint-auth-js'] === '/opt/l.js' && items[1].recipeUsed === undefined && tampered.hash === use.hash &&
        R.recipeChanges(v2.recipe, v3.recipe).join() === 'the brief changed,checks: 0 added, 1 removed',
      JSON.stringify({ versions: [v1.recipe.version, same.recipe.version, v2.recipe.version, v3.recipe.version], history: history.map((h) => h.version) }))
  } catch (e) {
    ok('portable.4 recipe versions', false, 'threw: ' + String(e && e.stack || e))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  // portable.6 — main's probe: tool NAMES looked up (never a path or a
  // command line), the NEXT lane's ports, nothing run.
  {
    const d = mkdtempSync(join(tmpdir(), 'tc preflight '))
    try {
      const repo = join(d, 'repo'); mkdirSync(repo)
      const looked = []
      const st = R.createRepoSetupStore({
        dir: join(d, 'store'), mainRootOf: async (cwd) => (cwd.startsWith(repo) ? repo : null), lanesOf: () => ['/lane-a'], loginEnv: () => ({}),
        isPortFree: async (p) => p !== 4120, which: (b) => { looked.push(b); return b === 'pnpm' }
      })
      const before = await st.preflight({ root: repo, tools: ['pnpm', 'uvicorn', '/bin/rm', 'rm -rf /', 'x'.repeat(80)] })
      await st.save({ root: repo, install: ['touch ran.txt'], services: [{ name: 'web', command: 'x', port: true }, { name: 'api', command: 'y', port: true }], checks: [] })
      const after = await st.preflight({ root: repo, tools: ['pnpm'] })
      const outside = await st.preflight({ root: '/nowhere', tools: [] })
      ok('portable.6 main\'s preflight looks up tool NAMES only (a path, a command line and an overlong name are never looked up), allocates the ports the NEXT lane would get (slot = lanes + 1, skipping a taken one), runs nothing, and answers no ports without a saved setup or a repository',
        looked.join() === 'pnpm,uvicorn,pnpm' && before.tools.pnpm === true && before.tools.uvicorn === false && before.ports === null &&
          after.ports.web === 4121 && after.ports.api === 4122 && !existsSync(join(repo, 'ran.txt')) && outside.ports === null,
        JSON.stringify({ looked, before, after }))
    } finally { rmSync(d, { recursive: true, force: true }) }
  }

  // portable.5 — a reuse beside the last success of the same recipe.
  const v1 = { ...portable, id: 'mine-auth', version: 1 }
  const v2 = { ...v1, version: 2, checks: [...v1.checks, 'npm run lint'] }
  const first = { id: 'a', source: 'typed', title: 'first', state: 'done', createdAt: 0, updatedAt: 100, recipeUsed: R.recipeUse(v1, { at: 0, repository: '/Users/ada/work/api' }), merged: { into: 'main', sha: 's', at: 30 * 60_000 }, reviewed: { at: 20 * 60_000, signature: 'x', files: 4 }, criteria: ['a', 'b'], criteriaMet: ['a', 'b'] }
  const older = { ...first, id: 'o', title: 'older', merged: { into: 'main', sha: 's0', at: 10 } }
  const unfinished = { ...first, id: 'u', state: 'review', merged: undefined }
  const second = { id: 'b', source: 'typed', title: 'second', state: 'review', createdAt: 0, updatedAt: 200, recipeUsed: R.recipeUse(v2, { at: 60 * 60_000, repository: '/srv/other-repo' }), reviewed: { at: 90 * 60_000, signature: 'y', files: 6 }, criteria: ['a', 'b'], criteriaMet: ['a'], comments: [{ id: 'c', path: 'x', side: 'new', line: 1, quote: '', body: 'b', at: 1 }] }
  const prev = R.lastSuccessfulRun([older, unfinished, first, second], second)
  const lines = R.compareRecipeRuns({ item: second, outcome: R.recipeOutcome(second, { passed: ['npm run lint'], failed: ['npm test'] }) }, { item: first, outcome: R.recipeOutcome(first, { passed: ['npm test'], failed: [] }) })
  const noEvidence = R.compareRecipeRuns({ item: second, outcome: R.recipeOutcome(second) }, { item: first, outcome: R.recipeOutcome(first) })
  ok('portable.5 a reuse is compared with the LAST SUCCESSFUL run of the same recipe (merged or done — never an unfinished one, never itself): the definition change leads, named (v1 → v2, a check added), then the other repository, the outcome, the time, files reviewed, criteria confirmed and each check that passed then and does not now; a side whose evidence was not read says so instead of comparing',
      prev !== undefined && prev.id === 'a' && R.lastSuccessfulRun([second], second) === undefined &&
        /^v1 → v2: checks: 1 added, 0 removed$/.test(lines[0]) && /another repository \(api → other-repo\)/.test(lines[1]) &&
        lines.some((l) => /^not finished \(last success: merged\)$/.test(l)) && lines.some((l) => /30 min to review \(last success: 30 min\)/.test(l)) &&
        lines.some((l) => /6 files reviewed \(last success: 4\)/.test(l)) && lines.some((l) => /1 of 2 criteria confirmed \(last success: 2 of 2\)/.test(l)) &&
        lines.some((l) => /not passing now: `npm test`/.test(l)) && lines.some((l) => /1 review comment still open/.test(l)) &&
        noEvidence.some((l) => /checks: not compared/.test(l)),
      JSON.stringify(lines))
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)

})()
