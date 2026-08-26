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
function cleanup() {
  if (child && child.exitCode === null) {
    try { child.kill('SIGKILL') } catch { /* already gone */ }
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

  // The binary path is DERIVED from the same config the builder used, so
  // productName lives in exactly one place. macOS puts the executable at
  // Contents/MacOS/<productName>.
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

  // 7. A backend was chosen and NAMED. Either kind is a pass — tmux is
  // optional and its absence is a documented degradation — but a missing
  // reason is the silent fallback the loud warning exists to prevent.
  {
    const match = /backend=(tmux|direct) \(([^)]+)\)/.exec(startup)
    ok('7 a backend was chosen and says why',
      match !== null && match[2].trim().length > 0, startup)
  }

  // 8. THE END-TO-END PROOF. A real PTY, spawned by a real packaged app, with
  // node-pty's native binding loaded out of the UNPACKED asar. Everything
  // above can pass with a broken pty layer; this cannot.
  // Greps PtyManager.create's OWN log line, which has existed since M1 rather
  // than being added for this suite — so a regression that stops PTYs spawning
  // fails here even if nobody remembers this check exists.
  {
    const match = /\[pty\] spawned .*pid=(\d+)/.exec(out)
    ok('8 a PTY spawned in the packaged app',
      match !== null && Number(match[1]) > 0,
      match ? match[0] : out.slice(-2000))
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
