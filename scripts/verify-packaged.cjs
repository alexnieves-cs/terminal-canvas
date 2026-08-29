/* Packages the app for real and launches the produced binary for real.
   Run with: npm run verify:packaged

   NOT part of npm run verify, on purpose. It runs electron-builder, which
   rebuilds native modules and reaches its own download cache — minutes, and a
   network dependency. Making the repo's one green-or-not signal slow and
   flaky would cost more than this check is worth on every run. It is the
   PRE-RELEASE gate, and CLAUDE.md's suite table says so with that reason
   attached.

   It exists because two of this codebase's load-bearing workarounds are for
   conditions npm run dev CANNOT produce:

     - shell-env.ts opens with "macOS GUI apps are launched by launchd, so they
       inherit a bare PATH and no dotfile exports". Under npm run dev the app
       inherits the DEVELOPER'S terminal environment, where claude is already on
       PATH. That branch has never actually been taken.
     - node-pty is a native module and a .node binary cannot be required out of
       an asar archive. There is no asar under npm run dev.

   Three deliberate distortions, each guarding something:
     1. A stripped PATH, emulating launchd. Without it the check proves nothing.
     2. A throwaway --user-data-dir, so this can never read or write the real
        layout.json. Same rule as "the verify suites must never touch the
        production socket".
     3. TC_TMUX_SOCKET pointed at a scratch socket, so a smoke run cannot spawn
        sessions on — or kill-server — the socket a real packaged app uses. */
const { execFileSync, spawn } = require('node:child_process')
const { mkdtempSync, rmSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { buildConfig } = require('../build/builder-config.cjs')

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const ROOT = join(__dirname, '..')
const config = buildConfig()

/* Deliberately contains a SPACE, like every real macOS userData path
   (~/Library/Application Support/...). The pane-died hook's redirect target
   shipped unquoted through eight task reviews because every fixture used a
   space-free path. */
const USER_DATA = mkdtempSync(join(tmpdir(), 'tc packaged '))
const SOCKET = 'terminal-canvas-verify-packaged'

let child = null
let child2 = null
let cleaned = false
function cleanup() {
  // finish() calls cleanup() explicitly and then process.exit()s, which fires
  // the 'exit' listener below and would otherwise run this a second time —
  // harmless (idempotent) but a wasted kill-server exec on every run.
  if (cleaned) return
  cleaned = true
  for (const c of [child, child2]) {
    if (c && c.exitCode === null) {
      try { c.kill('SIGKILL') } catch { /* already gone */ }
    }
  }
  // SIGKILL means before-quit never ran, so no shutdown() and no kill-server.
  // Tear the scratch server down by hand instead of leaving it running.
  try {
    execFileSync('tmux', ['-L', SOCKET, 'kill-server'], { stdio: 'ignore', timeout: 5000 })
  } catch { /* no tmux, or no server on that socket — both fine */ }
  rmSync(USER_DATA, { recursive: true, force: true })
}
process.on('exit', cleanup)

;(async () => {
  // ---- Build --------------------------------------------------------------
  console.log('building (this takes minutes) ...')
  let built = true
  let buildError = ''
  try {
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
    execFileSync(
      'npx',
      ['electron-builder', '--config', 'electron-builder.config.cjs', '--dir', '--mac'],
      { cwd: ROOT, stdio: 'inherit' }
    )
  } catch (error) {
    built = false
    buildError = String((error && error.message) || error)
  }
  ok('1 electron-builder produces a bundle', built, buildError)
  if (!built) return finish()

  // The output dir and productName are DERIVED from the same config the
  // builder used, so productName lives in exactly one place. macOS puts the
  // executable at Contents/MacOS/<productName>. The 'mac-arm64' arch segment
  // is NOT derived — it is electron-builder's own directory-naming convention
  // for a single-arch dir target, hardcoded here rather than computed from
  // config.mac.target, which this repo can do because Global Constraints
  // fixes it arm64-only; widening to universal would need this literal to
  // change too.
  const appPath = join(ROOT, config.directories.output, 'mac-arm64', `${config.productName}.app`)
  const binary = join(appPath, 'Contents', 'MacOS', config.productName)
  ok('2 the .app bundle is where the config says it is', existsSync(binary), binary)
  if (!existsSync(binary)) return finish()

  // ---- Launch -------------------------------------------------------------
  // A PATH with nothing on it that a login shell would have added. This is the
  // launchd condition, and the whole reason shell-env.ts exists.
  const STRIPPED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
  child = spawn(binary, [`--user-data-dir=${USER_DATA}`], {
    cwd: ROOT,
    env: {
      HOME: process.env.HOME,
      SHELL: process.env.SHELL,
      USER: process.env.USER,
      PATH: STRIPPED_PATH,
      TC_TMUX_SOCKET: SOCKET
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let out = ''
  child.stdout.on('data', (b) => { out += b.toString() })
  child.stderr.on('data', (b) => { out += b.toString() })

  let exitedEarly = null
  child.on('exit', (code) => { exitedEarly = code })

  // Wait for both signals, or 60s. A packaged first launch does real work —
  // resolveShellEnv runs $SHELL -ilc env, probeTmux starts a server, and the
  // renderer has to boot and put a panel live before anything spawns.
  const deadline = Date.now() + 60_000
  const seen = () => /\[startup\] /.test(out) && /\[pty\] spawned /.test(out)
  while (Date.now() < deadline && !seen() && exitedEarly === null) {
    await new Promise((r) => setTimeout(r, 500))
  }

  // 3. THE ASAR CHECK, in its bluntest form. session-backend.ts imports
  // node-pty at module scope, so a .node binary trapped inside the archive
  // throws during import and the app dies before it ever renders.
  ok('3 the packaged app stays up long enough to report',
    exitedEarly === null, `exited early with code ${exitedEarly}\n${out.slice(-2000)}`)

  // index.ts logs THREE [startup] lines before this one — one per probed
  // binary (claude/codex/git) — so a bare /\[startup\] .*/ grabs the first of
  // those instead of the summary line every check below actually needs.
  // Anchor on "packaged=", which only the summary line contains.
  const startup = (out.match(/\[startup\] packaged=.*/) || [''])[0]

  // 4. It knows it is packaged. A false here means the suite launched the dev
  // build or an unpackaged directory, and every check below would be measuring
  // the wrong app.
  ok('4 the launched app reports itself packaged', /packaged=true/.test(startup), startup)

  // 5. LAUNCHD'S BARE PATH, RECOVERED. The stripped PATH above contains only
  // system directories; a resolved PATH that adds nothing to it means
  // resolveShellEnv fell back rather than succeeding, and every agent CLI in
  // the app would be "command not found" — the exact defect that module was
  // written for, observable here for the first time.
  {
    const match = /PATH=(.*)$/.exec(startup)
    const resolved = match ? match[1].split(':').filter(Boolean) : []
    const stripped = new Set(STRIPPED_PATH.split(':'))
    const gained = resolved.filter((p) => !stripped.has(p))
    ok('5 the login-shell probe recovered a PATH launchd never gave it',
      gained.length > 0, `gained=${JSON.stringify(gained.slice(0, 5))} startup=${startup}`)
  }

  // 6. The socket override reached the resolver, which is what kept this run
  // off the real packaged app's server.
  ok('6 the packaged app used the scratch socket',
    startup.includes(`socket=${SOCKET}`), startup)

  // 7. THE THIRD DISTORTION, CHECKED. --user-data-dir is a throwaway directory
  // so this run can never read or write the real packaged app's layout.json —
  // same rule as "the verify suites must never touch the production socket".
  // If Electron silently ignored the flag, this run would be against the REAL
  // userData, and nothing else here would catch it. macOS resolves /tmp to
  // /private/tmp, so both spellings are accepted.
  ok('7 the throwaway --user-data-dir was actually used',
    startup.includes(`userData=${USER_DATA}`) ||
      startup.includes(`userData=/private${USER_DATA}`), startup)

  // 8. A backend was chosen and NAMED. Either kind is a pass — tmux is
  // optional and its absence is a documented degradation — but a missing
  // reason is the silent fallback the loud warning exists to prevent.
  {
    const match = /backend=(tmux|direct) \(([^)]+)\)/.exec(startup)
    ok('8 a backend was chosen and says why',
      match !== null && match[2].trim().length > 0, startup)
  }

  // 9. THE END-TO-END PROOF. A real PTY, spawned by a real packaged app, with
  // node-pty's native binding loaded out of the UNPACKED asar. Everything
  // above can pass with a broken pty layer; this cannot.
  // Greps PtyManager.create's OWN log line, which has existed since M1 rather
  // than being added for this suite — so a regression that stops PTYs spawning
  // fails here even if nobody remembers this check exists.
  {
    const match = /\[pty\] spawned .*pid=(\d+)/.exec(out)
    ok('9 a PTY spawned in the packaged app',
      match !== null && Number(match[1]) > 0,
      match ? match[0] : out.slice(-2000))
  }

  // ---- The second instance ---------------------------------------------
  // Two copies of one build sharing a userData directory and a tmux socket is
  // the destructive case: before-quit runs shutdown(), i.e. kill-server, so
  // quitting EITHER of them destroys the OTHER's agents, and flushSync writes
  // one store over the other. The lock is what makes that unreachable, and
  // this is the only tier that can see it — the lock needs two real app
  // PROCESSES, which every other suite in this repo runs exactly one of.
  //
  // --user-data-dir is what keeps this honest in both directions: Electron
  // keys the single-instance lock on that directory, so the second launch
  // below collides with THIS run's first child rather than with whatever the
  // developer happens to have open.
  {
    const before = child.exitCode === null
    child2 = spawn(binary, [`--user-data-dir=${USER_DATA}`], {
      cwd: ROOT,
      env: {
        HOME: process.env.HOME,
        SHELL: process.env.SHELL,
        USER: process.env.USER,
        PATH: STRIPPED_PATH,
        TC_TMUX_SOCKET: SOCKET
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out2 = ''
    child2.stdout.on('data', (b) => { out2 += b.toString() })
    child2.stderr.on('data', (b) => { out2 += b.toString() })
    let exit2 = null
    child2.on('exit', (code) => { exit2 = code })

    const stop = Date.now() + 30_000
    while (Date.now() < stop && exit2 === null) {
      await new Promise((r) => setTimeout(r, 500))
    }

    // 10. Both clauses are required and the second is the discriminating one.
    // "It exited" alone is satisfied by an instance that booted fully — ran
    // the shell probe, started a tmux client, wrote the store — and only THEN
    // quit, which has already done every destructive thing the lock exists to
    // prevent. The summary line is logged from inside whenReady's body, so its
    // ABSENCE is the evidence that the gate ran before any of that.
    ok('10 a second instance of the same build refuses to run',
      exit2 !== null && !/\[startup\] packaged=/.test(out2),
      `exit=${exit2} out=${out2.slice(-800)}`)

    // 11. THE OTHER DIRECTION, and it is not a formality: a gate written
    // backwards — the arriving instance takes over and quits the incumbent —
    // satisfies check 10 perfectly, because the second process does exit. What
    // separates them is who is left alive. The PTY clause is the one that
    // matters, since it is the running agent, not the window, that a user
    // loses. Read through the pid PtyManager itself logged rather than through
    // a fresh query, so a first child that survived with a dead session cannot
    // pass.
    const pidMatch = /\[pty\] spawned .*pid=(\d+)/.exec(out)
    const pid = pidMatch ? Number(pidMatch[1]) : 0
    let alive = false
    try { process.kill(pid, 0); alive = true } catch { alive = false }
    ok('11 the incumbent and its PTY survived the second launch',
      before && child.exitCode === null && pid > 0 && alive,
      `incumbentWasUp=${before} incumbentExit=${child.exitCode} pid=${pid} alive=${alive}`)
  }

  finish()
})()

function finish() {
  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  cleanup()
  process.exit(failed.length ? 1 : 0)
}
