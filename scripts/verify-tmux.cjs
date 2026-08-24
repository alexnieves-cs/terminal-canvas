/* Verifies the pure tmux core: argv construction, config text, version
   parsing, and list parsing.
   Run with: npm run verify:tmux

   Plain node, no tmux server, no Electron. Every check here guards a failure
   that is SILENT in a running app: a missing config line that degrades colour
   or steals Ctrl+B, or a list that reports a dead pane as live. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync } = require('node:fs')

const OUT = join(__dirname, '..', 'out', 'verify', 'tmux.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'tmux-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // node-pty joined this bundle's dependency graph once tmux-probe.ts pulled in
  // session-backend.ts (Task 4). It must stay external: node-pty resolves its
  // native binding by a path relative to ITS OWN file, and bundling that file
  // into out/verify/ moves it somewhere the relative lookup no longer finds
  // pty.node. External keeps the require pointed at the real node_modules
  // package, whose prebuilt binary this suite proved loads fine under plain
  // node (unlike the Electron-only suites, which externalize it for the
  // opposite reason: node-pty there is rebuilt against Electron's ABI).
  external: ['electron', 'node-pty'],
  // Same alias the other plain-node bundles gained in M4b. A value import from
  // @shared fails to resolve without it, and type-only imports hide the gap.
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
})
const T = require(OUT)

/* Deliberately contains a SPACE. The production exitDir is
   app.getPath('userData') + '/tmux-exits', i.e.
   ~/Library/Application Support/terminal-canvas/tmux-exits — a space is not an
   edge case there, it is the only shape that ever ships. Every fixture in this
   suite used '/tmp/exits' until a whole-branch review found the pane-died
   hook's redirect target unquoted: the shell split the path, the exit code
   landed in a junk file named ~/Library/Application, exitCodeFor() found
   nothing, and every panel reported "exited with code 1". A check that asserts
   the right property against an input that never resembles production is how
   that survived eight task reviews. */
const EXIT_DIR = '/tmp/tc verify/exits'

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

// 1. Version strings tmux actually emits, including suffixed and prefixed forms.
{
  const cases = [
    ['tmux 3.7c', 3, 7],
    ['tmux 3.0', 3, 0],
    ['tmux 2.9a', 2, 9],
    ['tmux next-3.4', 3, 4],
    ['tmux 3.5\n', 3, 5]
  ]
  let bad = null
  for (const [raw, major, minor] of cases) {
    const v = T.parseTmuxVersion(raw)
    if (!v || v.major !== major || v.minor !== minor) bad = `${raw} -> ${JSON.stringify(v)}`
  }
  ok('1 real tmux version strings parse', bad === null, bad ?? 'all 5 parsed')
}

// 2. Unparseable input yields null rather than a wrong number. A version we
// cannot read must send us to the fallback, never to an optimistic guess.
{
  const bad = ['', 'tmux', 'not a version', 'tmux abc'].filter((r) => T.parseTmuxVersion(r) !== null)
  ok('2 unreadable version output is null, not a guess', bad.length === 0, `leaked=${JSON.stringify(bad)}`)
}

// 3. The >= 3.0 gate, including the null case.
{
  const v = (major, minor) => ({ major, minor, raw: 'x' })
  const pass =
    T.isSupportedTmuxVersion(v(3, 0)) === true &&
    T.isSupportedTmuxVersion(v(3, 7)) === true &&
    T.isSupportedTmuxVersion(v(4, 0)) === true &&
    T.isSupportedTmuxVersion(v(2, 9)) === false &&
    T.isSupportedTmuxVersion(null) === false
  ok('3 the >= 3.0 gate accepts 3.0+ and rejects 2.9 and null', pass)
}

// 4. Every load-bearing config line is present. Each of these fails SILENTLY:
// a missing prefix line steals Ctrl+B from the agent, a missing :RGB line
// downsamples 24-bit colour, a missing hook hangs the panel on exit.
{
  const conf = T.buildTmuxConf(EXIT_DIR)
  const required = [
    'status off',
    'prefix None',
    'default-terminal "xterm-256color"',
    'terminal-features ",xterm-256color:RGB"',
    'remain-on-exit on',
    'pane-died'
  ]
  const missing = required.filter((line) => !conf.includes(line))
  ok('4 the generated config carries every load-bearing line', missing.length === 0,
    `missing=${JSON.stringify(missing)}`)
}

// 5. mouse must stay OFF. `mouse on` makes tmux capture mouse reporting
// instead of passing it to the application, which would silently defeat all of
// M4a's pointer correction from one process further down.
{
  const conf = T.buildTmuxConf(EXIT_DIR)
  ok('5 the config never enables tmux mouse capture', !/mouse\s+on/.test(conf),
    JSON.stringify(conf.match(/.*mouse.*/g) ?? []))
}

// 6. The hook writes the exit file BEFORE killing the session. That ordering is
// what lets main read the real exit code inside the onExit handler it already
// has, with no watcher and no polling. Reverse them and the file is racing.
{
  const conf = T.buildTmuxConf(EXIT_DIR)
  const hook = (conf.match(/set-hook -g pane-died .*/) ?? [''])[0]
  const writeAt = hook.indexOf('pane_dead_status')
  const killAt = hook.indexOf('kill-session')
  ok('6 the pane-died hook writes the exit file before killing the session',
    writeAt !== -1 && killAt !== -1 && writeAt < killAt,
    `write@${writeAt} kill@${killAt}`)
}

// 7. The spawn argv: private socket, create-or-attach, explicit size, and the
// command after `--`.
{
  const args = T.buildTmuxArgs({
    confPath: '/tmp/tc.conf', panelId: 'n5', cols: 100, rows: 30,
    command: '/bin/zsh', args: ['-l']
  })
  const j = args.join(' ')
  const pass =
    j.includes('-L terminal-canvas') &&
    j.includes('-f /tmp/tc.conf') &&
    j.includes('new-session -A -s n5') &&
    j.includes('-x 100') && j.includes('-y 30') &&
    args[args.indexOf('--') + 1] === '/bin/zsh' &&
    args[args.indexOf('--') + 2] === '-l'
  ok('7 the spawn argv creates-or-attaches on the private socket at a real size', pass, j)
}

// 8. `--` must precede the command, or a command starting with `-` is eaten as
// a tmux flag rather than run.
{
  const args = T.buildTmuxArgs({
    confPath: '/tmp/tc.conf', panelId: 'p1', cols: 80, rows: 24,
    command: '-weird', args: []
  })
  ok('8 a command starting with a dash survives as the command', args[args.indexOf('--') + 1] === '-weird',
    args.join(' '))
}

// 9. Every subcommand targets the private socket. A missing -L here reaches
// the user's real tmux server, and kill-server would destroy their work.
// This includes the embedded tmux invocation in the pane-died hook.
{
  const all = [T.buildListArgs(), T.buildKillSessionArgs('p1'), T.buildKillServerArgs()]
  const bad = all.filter((a) => !(a[0] === '-L' && a[1] === T.TMUX_SOCKET))
  const conf = T.buildTmuxConf(EXIT_DIR)
  const hookHasSocket = conf.includes(`tmux -L ${T.TMUX_SOCKET} kill-session`)
  ok('9 list, kill-session, kill-server, and the hook all target the private socket',
    bad.length === 0 && hookHasSocket, `${bad.length ? 'offenders=' + JSON.stringify(bad) : ''} ${hookHasSocket ? 'hook-ok' : 'hook-missing-L'}`)
}

// 10. list parsing keeps live panes and DROPS dead ones. Under
// remain-on-exit on, a session whose command has exited still EXISTS until the
// hook kills it; reporting it live would restore that panel non-dormant and
// attach a client to a corpse.
{
  const stdout = [
    'alpha\t0\t111\t/bin/zsh\t/Users/x',
    'beta\t1\t222\t/bin/zsh\t/Users/y',
    'gamma\t0\t333\tclaude\t/Users/z'
  ].join('\n')
  const entries = T.parseListOutput(stdout)
  const ids = entries.map((e) => e.panelId)
  ok('10 a dead pane is not reported as a live session',
    ids.length === 2 && ids.includes('alpha') && ids.includes('gamma') && !ids.includes('beta'),
    JSON.stringify(ids))
}

// 11. Parsed fields land in the right place, and pid is a number rather than a
// string — PtyCreateResult.pid is typed number and the renderer prints it.
{
  const entries = T.parseListOutput('alpha\t0\t4242\tclaude\t/Users/x/proj')
  const e = entries[0]
  ok('11 list fields map to PtyCreateResult shape with a numeric pid',
    e.panelId === 'alpha' && e.pid === 4242 && e.command === 'claude' && e.cwd === '/Users/x/proj',
    JSON.stringify(e))
}

// 12. Empty and ragged output never throws. tmux prints nothing at all when no
// server is running, and that is the NORMAL first-run case, not an error.
{
  let threw = null
  for (const raw of ['', '\n', 'garbage', 'a\tb']) {
    try { T.parseListOutput(raw) } catch (e) { threw = `${raw}: ${e.message}` }
  }
  ok('12 empty or ragged list output yields no sessions and never throws',
    threw === null && T.parseListOutput('').length === 0, threw ?? 'ok')
}

// 13. The exit-file path is derived from the panel id, which ID_PATTERN
// already constrains to [A-Za-z0-9_-]+ — so it can never escape exitDir.
{
  const p = T.exitFilePath(EXIT_DIR, 'n5')
  ok('13 the exit file lives under exitDir, named by panel id',
    p === `${EXIT_DIR}/n5.exit`, p)
}

// 14. No tmux on the resolved PATH -> direct, with a reason that names the
// cause. The reason string is shown to the user, so "unknown" is a bug.
{
  const c = T.chooseBackend({ tmuxPath: null, versionOutput: null })
  ok('14 a missing tmux chooses the direct backend and says why',
    c.kind === 'direct' && /not found/i.test(c.reason), JSON.stringify(c))
}

// 15. Too old -> direct. 2.9 is below the floor even though it is a real,
// working tmux, because we never tested the hook behaviour there.
{
  const c = T.chooseBackend({ tmuxPath: '/usr/bin/tmux', versionOutput: 'tmux 2.9a' })
  ok('15 a tmux below 3.0 chooses the direct backend and names the version',
    c.kind === 'direct' && c.reason.includes('2.9'), JSON.stringify(c))
}

// 16. A version we cannot read is treated as unusable, NOT as good enough.
{
  const c = T.chooseBackend({ tmuxPath: '/usr/bin/tmux', versionOutput: 'weird output' })
  ok('16 an unreadable version falls back rather than guessing',
    c.kind === 'direct', JSON.stringify(c))
}

// 17. A supported tmux is chosen, and the ABSOLUTE path is carried forward.
// A GUI app launched by launchd has a bare PATH; spawning "tmux" by name would
// fail exactly the way `claude` does, which is the defect shell-env.ts exists
// for.
{
  const c = T.chooseBackend({ tmuxPath: '/opt/homebrew/bin/tmux', versionOutput: 'tmux 3.7c' })
  ok('17 a supported tmux is chosen by absolute path',
    c.kind === 'tmux' && c.tmuxPath === '/opt/homebrew/bin/tmux', JSON.stringify(c))

  // 17b. `-V` output already begins with "tmux ", so a reason built as
  // `tmux ${version.raw}` rendered "tmux tmux 3.7c" in the HUD. The reason
  // string is user-facing; nothing else would have caught this.
  ok('17b the success reason names the version once, not twice',
    c.reason === 'tmux 3.7c', JSON.stringify(c.reason))
}

// 18. THE REDIRECT TARGET IS QUOTED. This is the one line in the config whose
// correctness depends on the SHAPE of exitDir rather than on the line itself,
// and the production shape always has a space in it (see EXIT_DIR above).
// Unquoted, `echo N > /a b/p1.exit` writes to "/a" and passes "b/p1.exit" as a
// second argument to echo, so no exit file is ever written — while the
// `; tmux kill-session` half still runs, so the session dies and the panel
// looks completely normal while reporting the wrong code forever.
{
  const conf = T.buildTmuxConf(EXIT_DIR)
  const hook = (conf.match(/set-hook -g pane-died .*/) ?? [''])[0]
  ok('18 the pane-died redirect target is quoted, so a spaced exitDir survives',
    hook.includes(`> \\"${EXIT_DIR}/#{session_name}.exit\\"`), hook)
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
