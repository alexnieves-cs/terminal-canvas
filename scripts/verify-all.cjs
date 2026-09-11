/* `npm run verify` — the whole verification story, as three waves.

   Run with: npm run verify   (or: node scripts/verify-all.cjs)

   WHY THIS FILE REPLACED AN ENUMERATED `&&` CHAIN.

   The chain was 35 `npm run` invocations, five more nested inside
   `verify:panels`, and two more inside `build` -> `typecheck`. Measured, each
   npm hop costs ~0.78s of pure process boot before any suite starts:

     npm run verify:electron            2.416s
     node scripts/verify-electron.cjs   1.643s   <- same suite, same result

   ~42 hops is ~32 seconds of a 4-minute run spent booting npm. The whole run
   measured 63s user + 32s system over 4:07 wall — 38% CPU, meaning roughly two
   and a half minutes of a four-minute gate were spent waiting on nothing.

   Three changes, and only the third alters what is checked:

   1. NO NPM HOP. Each suite is executed as `sh -c "<the exact command text
      package.json declares>"`. Not a parsed and rebuilt argv — the literal
      string, so `unset ELECTRON_RUN_AS_NODE && ...` and
      `ELECTRON_RUN_AS_NODE=1 ...` keep working because a shell is still the
      thing interpreting them. There is no parser here to get wrong, and a
      suite's command stays editable in package.json where people look for it.
      `sh -c` costs about 3ms against npm's 780ms.

   2. THE PLAIN TIER RUNS CONCURRENTLY. The plain-node suites are offline,
      need no display and share no state: every temp directory in them goes
      through `mkdtempSync` (which appends random characters, so two runs of
      the same suite could not collide either), and all 32 esbuild bundles
      under out/verify/ have distinct outfile names. Their combined REAL work
      is a few seconds — verify:viewport runs ~137 checks in 0.17s — so almost
      all of that tier's old wall clock was npm boot and node startup, paid 27
      times in a row.

      The Electron tier stays SERIAL, deliberately. Those suites each boot a
      real app, several drive tmux on a shared socket, and one of them
      (verify:panels' parts) drives a real renderer with pointer events;
      running two at once would be a new source of flakes in the exact place
      this repository can least afford one.

   3. THE SUITE LIST IS DERIVED, NOT ENUMERATED. This is the one behavioural
      change, and it removes a failure mode rather than adding one. The old
      `verify` script was a hand-written list, which is the shape
      .github/workflows/verify.yml deliberately refuses: a suite added to
      package.json and forgotten here would run nowhere, silently, forever,
      with a green badge still on the README. verify:meta 19 existed to catch
      exactly that by re-deriving the list and comparing. Here the runner
      derives the list itself, so the two can no longer disagree — a new
      `verify:*` script is picked up by writing it, and 19 now pins the
      derivation instead of policing a copy. `verify:packaged` and
      `verify:visual` remain NAMED exclusions (hand-run gates that reach
      outside the repository), the same two 19 already excluded by name.

   4. THE ELECTRON TIER CAN RUN N-WIDE, BUT ONLY WHEN ASKED
      (TC_VERIFY_ELECTRON_JOBS=N). The default is still one at a time, for
      the reason note 2 gives, and the gate CI runs is that default. What
      opting in costs was measured rather than assumed: the five panels
      parts shared one tmux socket (each kills its server at startup), one
      bundle under out/verify/ and one userData directory. So each job in
      flight gets its own TC_VERIFY_SUFFIX — the knob that already kept two
      checkouts apart — and the harness scopes all three by it. Contention
      stretches every part's clock, so each job also gets
      TC_WATCHDOG_SCALE=N: a watchdog measured alone would otherwise read a
      busy machine as a hang, and headroom.1 (the harness's drift alarm) skips
      rather than grade a clock that measures the machine. Pinned by
      verify:meta electron-jobs.1/.2.

      MEASURED, IT IS NOT YET A WORKING FAST PATH (2026-09-10). The tree that
      passed 39/39 serially in 514s went red 3-wide (237s; shell, agents)
      and 2-wide (304s; kinds, shell, agents, product), in a DIFFERENT set of
      checks each time, every one reading the renderer too early — a panel
      not yet framed, a paste not yet landed. The isolation holds; the waits
      do not. The panels parts pace themselves on fixed settle() windows
      (300ms, used hundreds of times), which two renderers side by side
      overrun. Condition waits in place of those windows are the real lever;
      until then this knob is for whoever does that work, never the gate.

   WAVE ORDER, AND WHY THE BUILD MOVED.

     wave 1  the plain tier, concurrently          ~seconds
     wave 2  npm run build (typecheck, then bundle)
     wave 3  the Electron tier, serially           the bulk of the time

   The build used to sit after ~30 suites, so a type error — the most common
   failure there is — was reported two and a half minutes in. It is now
   reported after the cheap wave, before any of the ~3 minutes of Electron
   work. What has NOT changed is the build's relationship to its consumers:
   verify:pty, verify:pty-manager, verify:window and verify:ipc bundle their
   own entry points and never read out/renderer, but verify:canvas,
   verify:xterm and verify:panels do — the build has to precede those, and in
   wave 2 it precedes all of them. Moving the build EARLIER is safe in a way
   moving it later would not be.

   `npm run build` is invoked as its own package.json string rather than
   reimplemented, so what "a build" means stays defined in one place and the
   typecheck inside it runs exactly once.

   THREE OUTCOMES PER SUITE, NEVER TWO: passed, failed (non-zero exit), or
   timed out. A suite that hangs is not a suite that failed — CLAUDE.md's own
   note that "the trap manifests as a HANG, not a red suite" is about this
   harness — so the backstop timeout reports itself by name, prints whatever
   the suite had produced before it stopped, and is generous (10 minutes
   against a slowest-observed suite of ~73 seconds) so that it can only ever
   catch a real hang, never a slow machine. */
'use strict'
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { spawn } = require('node:child_process')
const { cpus } = require('node:os')

const ROOT = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/* The two hand-run gates, excluded BY NAME so the exclusion is a decision
   somebody made rather than a suite that quietly fell out of a pattern.
   verify:packaged rebuilds native modules, reaches electron-builder's cache
   and needs a network; verify:visual consumes a build and paints every scene
   of the shot harness. Both are pre-release gates a person runs. */
const HAND_RUN = ['verify:packaged', 'verify:visual']

/* A suite that only chains other suites (`verify:panels`) is not itself a
   suite — running it would run its parts a second time. Its parts are
   discovered on their own, and verify:meta panels-split.1 still pins that
   every part is named in the aggregate. */
const isAggregate = (body) => {
  const parts = String(body).split('&&').map((s) => s.trim()).filter(Boolean)
  return parts.length > 0 && parts.every((p) => /^npm run verify:[\w:-]+$/.test(p))
}

/* Tiering is read off the command text, so a new suite lands in the right
   wave by being written normally. The fallback is SERIAL, not concurrent: a
   command shape nobody anticipated is the last thing to run eight of at once,
   and `unclassified` is reported so it is visible rather than assumed. */
const tierOf = (body) => {
  if (/ELECTRON_RUN_AS_NODE=1/.test(body)) return 'electron'
  if (/Contents\/MacOS\/Electron/.test(body)) return 'electron'
  if (/^node\s+scripts\/[\w.-]+\.cjs$/.test(String(body).trim())) return 'plain'
  return 'unclassified'
}

/* The derived list, exported so verify:meta 19 can pin it against
   package.json rather than against a copy of it. */
const suites = () => Object.keys(pkg.scripts)
  .filter((k) => k.startsWith('verify:') && !HAND_RUN.includes(k))
  .filter((k) => !isAggregate(pkg.scripts[k]))
  .map((name) => ({ name, body: pkg.scripts[name], tier: tierOf(pkg.scripts[name]) }))

/* Note 4's width. Absent or blank is 1 — serial, every run that existed
   before the knob. A whole number of at least 1 is that many; anything else
   is 1, and main() says so rather than guessing (malformed is dropped, never
   coerced: '2.5' is not "about two"). */
const electronJobs = (env) => {
  const raw = env.TC_VERIFY_ELECTRON_JOBS
  if (raw === undefined || String(raw).trim() === '') return 1
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/* A job's environment. SERIAL RETURNS THE PARENT'S OWN OBJECT: an absent key
   must stay absent, and a spread that wrote `TC_VERIFY_SUFFIX: undefined`
   would reach the child as present. N-wide, the suite's name becomes a
   suffix APPENDED to any the caller already set, so two checkouts running
   N-wide at once stay apart from each other as well as from themselves. */
const jobEnv = (name, env, jobs) => {
  if (jobs <= 1) return env
  const slug = name.replace(/^verify:/, '').replace(/[^A-Za-z0-9_-]/g, '-')
  const outer = String(env.TC_VERIFY_SUFFIX || '').trim()
  return { ...env, TC_VERIFY_SUFFIX: outer ? `${outer}-${slug}` : slug, TC_WATCHDOG_SCALE: String(jobs) }
}

const SUITE_TIMEOUT_MS = 10 * 60 * 1000

const runOne = (name, body, timeoutMs = SUITE_TIMEOUT_MS, env = process.env) => new Promise((resolve) => {
  const startedAt = Date.now()
  // The literal package.json text, interpreted by a shell — see note 1 above.
  const child = spawn('sh', ['-c', body], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  const take = (buf) => { out += buf }
  child.stdout.on('data', take)
  child.stderr.on('data', take)
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
  timer.unref?.()
  child.on('error', (error) => {
    clearTimeout(timer)
    resolve({ name, status: 'failed', code: null, ms: Date.now() - startedAt, out: String(error && error.message || error) })
  })
  child.on('close', (code) => {
    clearTimeout(timer)
    resolve({
      name,
      status: timedOut ? 'timedout' : (code === 0 ? 'passed' : 'failed'),
      code,
      ms: Date.now() - startedAt,
      out,
    })
  })
})

/* Prints a finished suite as ONE attributable block. The old chain's
   legibility came from running one thing at a time; concurrency would destroy
   that if output were streamed and interleaved, so it is buffered per suite
   and flushed whole. .github/workflows/verify.yml relies on this: a failure
   in CI still names its suite. */
const report = (r) => {
  const mark = r.status === 'passed' ? 'ok' : r.status === 'timedout' ? 'TIMED OUT' : 'FAILED'
  console.log(`\n=== ${r.name} — ${mark} (${(r.ms / 1000).toFixed(1)}s)`)
  const body = r.out.replace(/\s+$/, '')
  if (body) console.log(body)
  if (r.status === 'timedout') {
    console.log(`--- ${r.name} produced no further output and was killed after ${(SUITE_TIMEOUT_MS / 1000)}s; this is a HANG, not a failed check`)
  }
}

const runConcurrently = async (list, limit, envFor = null) => {
  const queue = list.slice()
  const done = []
  const worker = async () => {
    for (;;) {
      const next = queue.shift()
      if (!next) return
      const r = await runOne(next.name, next.body, SUITE_TIMEOUT_MS, envFor ? envFor(next) : process.env)
      report(r)
      done.push(r)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
  return done
}

const main = async () => {
  const started = Date.now()
  const all = suites()
  const plain = all.filter((s) => s.tier === 'plain')
  const serial = all.filter((s) => s.tier !== 'plain')
  const unclassified = all.filter((s) => s.tier === 'unclassified')
  // Concurrency tracks the machine, capped: past ~8 the plain tier is already
  // bounded by esbuild and node startup, and a bigger number mostly makes the
  // output arrive in a less useful order.
  const limit = Math.max(2, Math.min(8, cpus().length))
  const results = []
  const jobs = electronJobs(process.env)
  const rawJobs = String(process.env.TC_VERIFY_ELECTRON_JOBS ?? '').trim()
  if (rawJobs !== '' && jobs === 1 && rawJobs !== '1') {
    console.log(`note: ignoring TC_VERIFY_ELECTRON_JOBS=${JSON.stringify(rawJobs)} — not a whole number of at least 1; the Electron tier runs serially`)
  }

  console.log(`verify: ${all.length} suites — ${plain.length} plain (concurrently, ${limit} at a time), ` +
    `${serial.length} under Electron (${jobs > 1 ? `${jobs} at a time — TC_VERIFY_ELECTRON_JOBS` : 'serially'}), then the build between them`)
  if (unclassified.length) {
    console.log(`note: ${unclassified.map((s) => s.name).join(', ')} did not match a known command shape ` +
      `and will run serially — classify them in scripts/verify-all.cjs if that is wrong`)
  }

  // WAVE 1 — the cheap tier. Named up front so a hang here still says which
  // suites were in flight.
  console.log(`\n--- wave 1: ${plain.map((s) => s.name).join(' ')}`)
  results.push(...await runConcurrently(plain, limit))

  const failedEarly = results.filter((r) => r.status !== 'passed')
  if (failedEarly.length) {
    // Fail before the build and the Electron tier. This is the whole point of
    // the reorder: nothing expensive runs on a tree the cheap tier already
    // rejected.
    return finish(results, started, 'stopped after wave 1')
  }

  // WAVE 2 — typecheck and bundle, as package.json defines them.
  console.log('\n--- wave 2: npm run build')
  const build = await runOne('build', pkg.scripts.build)
  report(build)
  results.push(build)
  if (build.status !== 'passed') return finish(results, started, 'stopped after the build')

  // WAVE 3 — the real-Electron tier: one at a time, unless note 4's knob asks
  // for more. The serial branch is the loop it always was, untouched.
  console.log(`\n--- wave 3${jobs > 1 ? ` (${jobs} at a time)` : ''}: ${serial.map((s) => s.name).join(' ')}`)
  if (jobs > 1) {
    results.push(...await runConcurrently(serial, jobs, (s) => jobEnv(s.name, process.env, jobs)))
  } else {
    for (const s of serial) {
      const r = await runOne(s.name, s.body)
      report(r)
      results.push(r)
    }
  }
  return finish(results, started, null)
}

const finish = (results, started, note) => {
  const failed = results.filter((r) => r.status !== 'passed')
  console.log('\n' + '='.repeat(60))
  // Slowest first: the summary is also the only place the cost of the gate is
  // visible, and the two panels parts being most of it is worth seeing.
  for (const r of results.slice().sort((a, b) => b.ms - a.ms)) {
    console.log(`  ${(r.ms / 1000).toFixed(1).padStart(6)}s  ${r.status.padEnd(9)} ${r.name}`)
  }
  console.log('='.repeat(60))
  console.log(`${results.length - failed.length}/${results.length} suites passed in ${((Date.now() - started) / 1000).toFixed(1)}s${note ? ` (${note})` : ''}`)
  if (failed.length) console.log('FAILED: ' + failed.map((r) => `${r.name} (${r.status})`).join(', '))
  // NOT `process.exit(code)`. Every suite's output is buffered and flushed
  // here, and when stdout is a pipe — a CI log, a `> run.log`, the exact cases
  // that matter — console.log is asynchronous, so exiting immediately can
  // truncate the summary that says whether the gate passed. Setting exitCode
  // lets the process end on its own once stdout has drained. The timer is the
  // backstop for the opposite failure: an unref'd timer cannot hold the
  // process open by itself, so it only ever fires if something else already
  // is, which is the one case where a forced exit is right.
  process.exitCode = failed.length ? 1 : 0
  setTimeout(() => process.exit(failed.length ? 1 : 0), 5000).unref()
}

// runOne/report/runConcurrently/finish are exported for scripts/affected.cjs,
// so a narrowed run executes, prints and summarises suites exactly as the gate
// does rather than through a second copy that could drift from it.
module.exports = { suites, HAND_RUN, isAggregate, tierOf, electronJobs, jobEnv, runOne, report, runConcurrently, finish }

if (require.main === module) {
  main().catch((error) => {
    // The runner itself throwing must not read as a passing gate.
    console.log(`verify-all.cjs threw: ${(error && error.stack) || error}`)
    process.exit(1)
  })
}
