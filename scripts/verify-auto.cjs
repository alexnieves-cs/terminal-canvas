/* Verifies M475's check-gated done: an auto run's AUTO-DONE is the agent's
   CLAIM, and only a check's own exit code can make the run read as checked.
   Run with: npm run verify:auto

   Plain node, no Electron, no network, no real CLI. The manager is driven
   through the fake process runner verify:agent-session uses, replaying the
   recorded `turn.jsonl` with its text swapped; the check is an injected
   `runCheck` whose answer each check decides, so the gate's every branch is
   reached without a real test runner. The last block runs the PRODUCTION
   runner (`auto-check-runner.ts`) against /bin/sh, because a gate whose
   runner reads a timeout as a pass would be green here and wrong on a Mac.

   Every check guards a failure that is SILENT in a running app: a marker
   read as done when the check never ran, a failed check retried forever, a
   check whose late pass lands on a run somebody already stopped, a second
   check started over the first, a runner that times out to exit 0. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync, readFileSync } = require('node:fs')

const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'out', 'verify', 'auto.cjs')
mkdirSync(join(ROOT, 'out', 'verify'), { recursive: true })
buildSync({
  stdin: {
    contents: `module.exports = {
      auto: require('./src/shared/auto'),
      session: require('./src/main/agent-session'),
      runner: require('./src/main/auto-check-runner'),
      tonight: require('./src/shared/tonight'),
      tonightRunner: require('./src/main/tonight-runner')
    }`,
    resolveDir: ROOT,
    loader: 'js'
  },
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'node-pty'],
  // The manager's own import chain names @shared (agent-session-args); the
  // same load-bearing alias verify:agent-session carries.
  alias: { '@shared': join(ROOT, 'src', 'shared') }
})
const M = require(OUT)
const A = M.auto
const S = M.session
const R = M.runner
const TN = M.tonight
const TR = M.tonightRunner

const { ok, results } = require('./lib/checks.cjs').createChecks()

const FIX = join(__dirname, 'fixtures', 'agent-session')
const fixture = (name) => readFileSync(join(FIX, name), 'utf8').split('\n').filter((l) => l.trim() !== '')
const say = (text) => fixture('turn.jsonl').map((l) => l.split('"text":"pong"').join(`"text":${JSON.stringify(text)}`))
const sayError = (text) => say(text).map((l) => l.split('"subtype":"success"').join('"subtype":"error_during_execution"'))
const tick = (ms) => new Promise((r) => setTimeout(r, ms))
const MARK = A.AUTO_DONE_MARKER

function fakeProcess(pid) {
  const proc = {
    pid, stdin: [], killed: 0, dataCbs: [], exitCbs: [],
    write(line) { proc.stdin.push(line) },
    onData(cb) { proc.dataCbs.push(cb) },
    onExit(cb) { proc.exitCbs.push(cb) },
    kill() { proc.killed += 1 },
    emit(chunk) { for (const cb of proc.dataCbs) cb(chunk) },
    emitLines(lines) { proc.emit(lines.join('\n') + '\n') },
    exit(code, signal, stderr) { for (const cb of proc.exitCbs) cb({ code, signal, stderr }) }
  }
  return proc
}

/* A check whose every call waits for the test to answer it. */
function scriptedCheck() {
  const calls = []
  const runCheck = (spec) => new Promise((resolve) => { calls.push({ spec, resolve }) })
  return { calls, runCheck, answer: (r) => calls[calls.length - 1].resolve(r) }
}

function makeManager(overrides = {}) {
  const spawns = []
  let nextPid = 1000
  let nextId = 0
  const events = []
  const manager = new S.AgentSessionManager({
    runner: (spawn) => { const proc = fakeProcess(++nextPid); spawns.push({ ...spawn, proc }); return proc },
    command: '/fake/bin/claude',
    env: { PATH: '/fake/bin', HOME: '/fake/home' },
    newSessionId: () => `uuid-${++nextId}`,
    interruptGraceMs: 30,
    coalesceMs: 5,
    ...overrides
  })
  manager.subscribe((e) => events.push(e))
  const autos = (id) => events.filter((e) => e.id === id && e.type === 'auto')
  const lastAuto = (id) => { const a = autos(id); return a[a.length - 1] }
  return { manager, spawns, events, autos, lastAuto }
}

;(async () => {
  /* ---------------------------------------------------------------------- */
  /* The model, pure                                                         */
  /* ---------------------------------------------------------------------- */
  {
    const absent = A.parseAutoCheck(undefined)
    const good = A.parseAutoCheck({ command: '  npm test  ', retries: 2 })
    const refused = [
      A.parseAutoCheck(null), A.parseAutoCheck('npm test'), A.parseAutoCheck({}), A.parseAutoCheck({ command: '   ' }),
      A.parseAutoCheck({ command: 'npm test\nrm -rf /' }), A.parseAutoCheck({ command: 'x', retries: -1 }),
      A.parseAutoCheck({ command: 'x', retries: 1.5 }), A.parseAutoCheck({ command: 'x', retries: A.AUTO_CHECK_RETRIES_MAX + 1 }),
      A.parseAutoCheck({ command: 'x', timeoutMs: 0 }), A.parseAutoCheck({ command: 'x', timeoutMs: 'soon' })
    ]
    ok('auto.check.1 a check is parsed by name: absent is no check, a well-formed one is trimmed and kept, and every malformed one is REFUSED with a reason — never read as "no check", which would silently downgrade a gated run to a claimed one',
      absent.kind === 'ok' && absent.check === undefined &&
        good.kind === 'ok' && good.check.command === 'npm test' && good.check.retries === 2 &&
        refused.every((r) => r.kind === 'refused' && typeof r.reason === 'string' && r.reason !== ''),
      JSON.stringify({ absent, good, refused: refused.map((r) => r.kind) }))
  }
  {
    const P = A.autoCheckPassed
    ok('auto.check.2 only exit 0 passes: a non-zero exit, a signal (null), a timeout — even one that reports exit 0 — and a runner error all fail',
      P({ exitCode: 0, output: '' }) === true &&
        P({ exitCode: 1, output: 'all good' }) === false && P({ exitCode: null, output: '' }) === false &&
        P({ exitCode: 0, output: '', timedOut: true }) === false && P({ exitCode: 0, output: '', error: 'ENOENT' }) === false)
  }
  {
    const check = { command: 'npm test', retries: 2 }
    const fail = { exitCode: 1, output: 'FAIL one.test' }
    const pass = A.autoAfterCheck(check, { exitCode: 0, output: '' }, 0, 1, 8)
    const retry = A.autoAfterCheck(check, fail, 1, 1, 8)
    const lastRetry = A.autoAfterCheck(check, fail, 2, 3, 8)
    const out = A.autoAfterCheck(check, fail, 3, 4, 8)
    const noTurns = A.autoAfterCheck(check, fail, 1, 8, 8)
    const long = A.autoCheckFeedback('npm test', { exitCode: 1, output: 'x'.repeat(A.AUTO_CHECK_FEEDBACK_CHARS) + 'THE END' }, 1, 2)
    ok('auto.check.3 after a check: a pass is done-checked; a failure with retries and turns left goes back with the command, the exit and the output; past the retries it is stuck: check; out of turns it is stuck: limit; and the output sent back keeps its TAIL, where a runner says why',
      pass.kind === 'done' && pass.verdict === 'checked' &&
        retry.kind === 'retry' && retry.prompt.includes('npm test') && retry.prompt.includes('exited 1') && retry.prompt.includes('FAIL one.test') && retry.prompt.includes(MARK) &&
        lastRetry.kind === 'retry' && out.kind === 'stuck' && out.reason === 'check' && noTurns.kind === 'stuck' && noTurns.reason === 'limit' &&
        long.includes('THE END') && long.length < A.AUTO_CHECK_FEEDBACK_CHARS + 1000 && /earlier characters not shown/.test(long),
      JSON.stringify({ pass, retry: retry.kind, lastRetry: lastRetry.kind, out, noTurns, longLen: long.length }))
  }
  {
    const gated = A.autoPlanOf('custom', 'p1', 'fix the bug', { command: 'npm test' })
    const plain = A.autoPlanOf('custom', 'p1', 'fix the bug')
    ok('auto.check.4 a gated run tells the agent which check follows the marker, in the opening and every continuation; an ungated run\'s prompts are unchanged',
      gated.opening.includes('`npm test`') && gated.continuation.includes('`npm test`') && gated.opening.includes(MARK) &&
        !plain.opening.includes('npm test') && plain.opening === A.AUTO_MODES.custom.opening.split('{{task}}').join('fix the bug'))
  }
  {
    const base = { mode: 'complete', turn: 2, limit: 8 }
    ok('auto.check.5 the words: a checked done says checked, a claimed one says "agent says done" (M476), a pre-M475 done keeps "done", a running check says checking; autoVerdictOf reads an absent verdict as claimed and is undefined off done',
      A.autoChipWords({ ...base, state: 'done', verdict: 'checked' }) === 'auto · complete · checked' &&
        A.autoChipParts({ ...base, state: 'done', verdict: 'checked' }).head === 'auto checked' &&
        A.autoChipWords({ ...base, state: 'done', verdict: 'claimed' }) === 'auto · complete · agent says done' &&
        A.autoChipParts({ ...base, state: 'done', verdict: 'claimed' }).head === 'agent says done' &&
        A.autoChipWords({ ...base, state: 'done' }) === 'auto · complete · done' &&
        A.autoChipWords({ ...base, state: 'running', checking: true }) === 'auto · complete · checking' &&
        A.autoChipWords({ ...base, state: 'stuck', reason: 'check' }) === 'auto · complete · stuck — the check kept failing' &&
        A.autoVerdictOf({ ...base, state: 'done' }) === 'claimed' && A.autoVerdictOf({ ...base, state: 'done', verdict: 'checked' }) === 'checked' &&
        A.autoVerdictOf({ ...base, state: 'running' }) === undefined)
  }

  /* ---------------------------------------------------------------------- */
  /* The manager                                                             */
  /* ---------------------------------------------------------------------- */
  {
    // No check named: the marker still ends the run, and it ends CLAIMED.
    const m = makeManager()
    m.manager.create({ id: 'c0', cwd: '/repo' })
    m.manager.startAuto('c0', { mode: 'complete', limit: 4 })
    m.spawns[0].proc.emitLines(say(`done. ${MARK}`))
    await tick(10)
    const last = m.lastAuto('c0')
    ok('auto.check.6 a run with no check ends on the marker as done with verdict claimed — never checked — and the snapshot keeps the verdict',
      last.state === 'done' && last.verdict === 'claimed' && A.autoVerdictOf(last) === 'claimed' &&
        m.manager.get('c0').auto.verdict === 'claimed' && m.spawns[0].proc.stdin.length === 1,
      JSON.stringify(last))
  }
  {
    // The headline: the marker without a passing check never reads as done.
    const c = scriptedCheck()
    const m = makeManager({ runCheck: c.runCheck })
    m.manager.create({ id: 'c1', cwd: '/repo/work' })
    const started = m.manager.startAuto('c1', { mode: 'complete', limit: 6, check: { command: 'npm test', retries: 2 } })
    const proc = m.spawns[0].proc
    proc.emitLines(say(`all fixed. ${MARK}`))
    await tick(10)
    const whileChecking = m.lastAuto('c1')
    const snapChecking = m.manager.get('c1').auto
    const sentBefore = proc.stdin.length
    c.answer({ exitCode: 1, output: 'FAIL widget.test.ts: expected 2, got 3' })
    await tick(10)
    const afterFail = m.lastAuto('c1')
    const feedback = proc.stdin[proc.stdin.length - 1]
    const doneEver = m.autos('c1').some((e) => e.state === 'done')
    proc.emitLines(say(`fixed for real. ${MARK}`))
    await tick(10)
    c.answer({ exitCode: 0, output: 'ok 12 tests' })
    await tick(10)
    const final = m.lastAuto('c1')
    ok('auto.check.7 a gated run: the marker starts the check (running, checking, nothing sent) in the session\'s folder; a failing check is NOT done — its output goes back as the next turn and the run keeps running; only the second check\'s exit 0 ends it done with verdict checked',
      started.kind === 'started' && c.calls.length === 2 && c.calls[0].spec.command === 'npm test' && c.calls[0].spec.cwd === '/repo/work' &&
        typeof c.calls[0].spec.timeoutMs === 'number' && c.calls[0].spec.signal !== undefined &&
        whileChecking.state === 'running' && whileChecking.checking === true && whileChecking.check === 'npm test' && snapChecking.checking === true &&
        sentBefore === 1 && !doneEver && afterFail.state === 'running' && afterFail.checking === undefined && afterFail.checkFailures === 1 &&
        proc.stdin.length === 2 && /expected 2, got 3/.test(feedback) && /exited 1/.test(feedback) &&
        final.state === 'done' && final.verdict === 'checked' && final.checkFailures === 1 && m.manager.get('c1').auto.verdict === 'checked',
      JSON.stringify({ started, calls: c.calls.length, whileChecking, afterFail, final, stdin: proc.stdin.length }))
  }
  {
    // A check that keeps failing: stuck, by name, after exactly retries + 1 checks.
    const c = scriptedCheck()
    const m = makeManager({ runCheck: c.runCheck })
    m.manager.create({ id: 'c2', cwd: '/repo' })
    m.manager.startAuto('c2', { mode: 'complete', limit: 8, check: { command: 'make check', retries: 1 } })
    const proc = m.spawns[0].proc
    for (let i = 0; i < 3; i++) {
      proc.emitLines(say(`done ${i}. ${MARK}`))
      await tick(10)
      if (c.calls.length === i + 1) { c.answer({ exitCode: 2, output: `still broken ${i}` }); await tick(10) }
    }
    const last = m.lastAuto('c2')
    ok('auto.check.8 a check failing past its retries resolves stuck: check after exactly retries + 1 checks; the run is never done, and nothing more is sent once it is stuck',
      c.calls.length === 2 && last.state === 'stuck' && last.reason === 'check' && last.checkFailures === 2 &&
        !m.autos('c2').some((e) => e.state === 'done') && proc.stdin.length === 2,
      JSON.stringify({ calls: c.calls.length, last, stdin: proc.stdin.length }))
  }
  {
    const m = makeManager()
    m.manager.create({ id: 'c3', cwd: '/repo' })
    const r = m.manager.startAuto('c3', { mode: 'complete', check: { command: 'npm test' } })
    ok('auto.check.9 a start that names a check where no check runner exists is REFUSED by name and sends nothing — never started as a claimed run that looks gated',
      r.kind === 'refused' && /check/.test(r.reason) && m.spawns.length === 0 && m.autos('c3').length === 0 && m.manager.get('c3').auto === undefined,
      JSON.stringify({ r, spawns: m.spawns.length }))
  }
  {
    // Stopped mid-check: the command is aborted, and its late pass decides nothing.
    const c = scriptedCheck()
    const m = makeManager({ runCheck: c.runCheck })
    m.manager.create({ id: 'c4', cwd: '/repo' })
    m.manager.startAuto('c4', { mode: 'complete', check: { command: 'npm test' } })
    m.spawns[0].proc.emitLines(say(MARK))
    await tick(10)
    const stopped = m.manager.stopAuto('c4')
    const aborted = c.calls[0].spec.signal.aborted
    c.answer({ exitCode: 0, output: 'late pass' })
    await tick(10)
    const last = m.lastAuto('c4')
    // Disposed mid-check: aborted too.
    const d = scriptedCheck()
    const n = makeManager({ runCheck: d.runCheck })
    n.manager.create({ id: 'c5', cwd: '/repo' })
    n.manager.startAuto('c5', { mode: 'complete', check: { command: 'npm test' } })
    n.spawns[0].proc.emitLines(say(MARK))
    await tick(10)
    n.manager.dispose('c5')
    const disposedAborted = d.calls[0].spec.signal.aborted
    d.answer({ exitCode: 0, output: '' })
    await tick(10)
    ok('auto.check.10 a run stopped while its check runs resolves stopped and ABORTS the check; the check\'s late pass lands on nothing (no done, no verdict); a dispose mid-check aborts it the same way',
      stopped === true && aborted === true && last.state === 'stopped' && last.verdict === undefined &&
        !m.autos('c4').some((e) => e.state === 'done') && disposedAborted === true && !n.events.some((e) => e.type === 'auto' && e.state === 'done'),
      JSON.stringify({ stopped, aborted, last, disposedAborted }))
  }
  {
    // A turn the person sends while the check runs is theirs: no second check, no count.
    const c = scriptedCheck()
    const m = makeManager({ runCheck: c.runCheck })
    m.manager.create({ id: 'c6', cwd: '/repo' })
    m.manager.startAuto('c6', { mode: 'complete', limit: 5, check: { command: 'npm test' } })
    const proc = m.spawns[0].proc
    proc.emitLines(say(MARK))
    await tick(10)
    const turnAtCheck = m.lastAuto('c6').turn
    m.manager.send('c6', 'quick question while it checks')
    proc.emitLines(say(`answer. ${MARK}`))
    await tick(10)
    const callsAfter = c.calls.length
    const turnAfter = m.manager.get('c6').auto.turn
    c.answer({ exitCode: 0, output: '' })
    await tick(10)
    ok('auto.check.11 while a check runs, a turn the person sent decides nothing: a marker in its answer starts no second check and the run\'s turn count does not move; the one check still ends the run',
      callsAfter === 1 && turnAfter === turnAtCheck && m.lastAuto('c6').state === 'done' && m.lastAuto('c6').verdict === 'checked',
      JSON.stringify({ callsAfter, turnAtCheck, turnAfter, last: m.lastAuto('c6') }))
  }
  {
    // A runner that throws or rejects is a FAILED check, never a pass and never a hang.
    const m = makeManager({ runCheck: () => { throw new Error('spawn EACCES') } })
    m.manager.create({ id: 'c7', cwd: '/repo' })
    m.manager.startAuto('c7', { mode: 'complete', check: { command: 'npm test', retries: 0 } })
    m.spawns[0].proc.emitLines(say(MARK))
    await tick(10)
    const n = makeManager({ runCheck: () => Promise.reject(new Error('boom')) })
    n.manager.create({ id: 'c8', cwd: '/repo' })
    n.manager.startAuto('c8', { mode: 'complete', check: { command: 'npm test', retries: 1 } })
    n.spawns[0].proc.emitLines(say(MARK))
    await tick(10)
    const fed = n.spawns[0].proc.stdin[n.spawns[0].proc.stdin.length - 1]
    ok('auto.check.12 a runner that throws resolves the run stuck: check (zero retries), and one that rejects sends "could not run" back as the next turn — neither ever reads as done',
      m.lastAuto('c7').state === 'stuck' && m.lastAuto('c7').reason === 'check' &&
        n.lastAuto('c8').state === 'running' && /could not run: boom/.test(fed) && !n.autos('c8').some((e) => e.state === 'done'),
      JSON.stringify({ c7: m.lastAuto('c7'), c8: n.lastAuto('c8') }))
  }
  {
    // Surfaces that already read `done` must not upgrade a claim.
    const runs = readFileSync(join(ROOT, 'src', 'renderer', 'canvas', 'useRuns.ts'), 'utf8')
    const store = readFileSync(join(ROOT, 'src', 'renderer', 'chat', 'chat-store.ts'), 'utf8')
    const retained = readFileSync(join(ROOT, 'src', 'shared', 'retained-outcomes.ts'), 'utf8')
    ok('auto.check.13 the run record writes `passed` only for a checked verdict (a claim is "done · unchecked", which retained outcomes counts as completed, not failed), and the chat store carries the verdict by name — a dropped field would read every checked run as claimed',
      /autoVerdictOf\(status\) === 'checked' \? 'passed' : AUTO_CLAIMED_OUTCOME/.test(runs) && !/status\.state === 'done' \? 'passed'/.test(runs) &&
        /event\.verdict === undefined \? \{\} : \{ verdict: event\.verdict \}/.test(store) && /AUTO_CLAIMED_OUTCOME/.test(retained) &&
        A.AUTO_CLAIMED_OUTCOME !== 'passed')
  }

  /* ---------------------------------------------------------------------- */
  /* The production runner, against a real shell                             */
  /* ---------------------------------------------------------------------- */
  {
    const env = { PATH: process.env.PATH || '/usr/bin:/bin', SHELL: '/bin/sh' }
    const run = (command, timeoutMs = 5000, signal = new AbortController().signal) => R.runAutoCheck({ command, cwd: ROOT, env, timeoutMs, signal })
    const pass = await run('echo ready; exit 0')
    const fail = await run('echo out; echo err 1>&2; exit 3')
    const t0 = Date.now()
    const slow = await run('sleep 5; exit 0', 200)
    const slowMs = Date.now() - t0
    const ac = new AbortController()
    const t1 = Date.now()
    const aborting = run('sleep 5; exit 0', 5000, ac.signal)
    setTimeout(() => ac.abort(), 100)
    const aborted = await aborting
    const abortMs = Date.now() - t1
    const noDir = await R.runAutoCheck({ command: 'exit 0', cwd: join(ROOT, 'no-such-folder-m475'), env, timeoutMs: 5000, signal: new AbortController().signal })
    ok('auto.check.14 the production runner: exit 0 passes with its output; a non-zero exit fails with stdout AND stderr; a check past its timeout is killed and FAILS even though the command would exit 0; an abort kills it promptly; a missing folder is a failure with an error, never a throw',
      A.autoCheckPassed(pass) && /ready/.test(pass.output) &&
        !A.autoCheckPassed(fail) && fail.exitCode === 3 && /out/.test(fail.output) && /err/.test(fail.output) &&
        !A.autoCheckPassed(slow) && slow.timedOut === true && slow.exitCode === null && slowMs < 3000 &&
        !A.autoCheckPassed(aborted) && abortMs < 3000 &&
        !A.autoCheckPassed(noDir),
      JSON.stringify({ pass, fail, slow, slowMs, aborted, abortMs, noDir }))
  }


  /* ---------------------------------------------------------------------- */
  /* Tonight (M477): a batch of auto runs, one at a time, through the night  */
  /* ---------------------------------------------------------------------- */

  /* A harness: the REAL manager (fake processes, scripted check), a rate
     limit the check sets by hand, a blocker that counts, and timers fired by
     hand — a night is minutes of fake clock. */
  function night(opts = {}) {
    const c = scriptedCheck()
    const m = makeManager({ runCheck: c.runCheck })
    let rate = { kind: 'none' }
    let clock = 1_000_000
    const timers = []
    const blocker = { started: 0, stopped: [], start() { this.started += 1; return 7 }, stop(id) { this.stopped.push(id) } }
    const spent = new Map()
    const statuses = []
    const runner = TR.createTonightRunner({
      startAuto: (id, o) => m.manager.startAuto(id, o),
      stopAuto: (id) => m.manager.stopAuto(id),
      hasSession: (id) => m.manager.get(id) !== undefined,
      subscribe: (cb) => m.manager.subscribe(cb),
      rateLimit: () => rate,
      spentOf: opts.spentOf ?? ((id) => spent.get(id) ?? 0),
      blocker,
      now: () => clock,
      setTimer: (fn, ms) => { const t = { fn, at: clock + ms, live: true }; timers.push(t); return t },
      clearTimer: (t) => { t.live = false },
      onStatus: (s) => statuses.push(s)
    })
    const fire = () => { const t = timers.filter((x) => x.live).sort((a, b) => a.at - b.at)[0]; if (!t) return false; t.live = false; clock = Math.max(clock, t.at); t.fn(); return true }
    return { c, m, runner, blocker, spent, statuses, fire, timers, setRate: (r) => { rate = r }, advance: (ms) => { clock += ms }, proc: (i) => m.spawns[i].proc, clockNow: () => clock }
  }

  {
    const parsed = TN.parseTonightBatch({ tasks: [{ id: 't1', panelId: 'p1', task: '  fix the login bug\nand test it ', check: { command: 'npm test' }, budgetUsd: 2 }], notBefore: 5 })
    const refused = [
      TN.parseTonightBatch(null), TN.parseTonightBatch({ tasks: [] }), TN.parseTonightBatch({ tasks: [{ id: 'a', panelId: 'p', task: '' }] }),
      TN.parseTonightBatch({ tasks: [{ id: 'a', panelId: 'p', task: 'x' }, { id: 'a', panelId: 'q', task: 'y' }] }),
      TN.parseTonightBatch({ tasks: [{ id: 'a', panelId: 'p', task: 'x', check: { command: '' } }] }),
      TN.parseTonightBatch({ tasks: [{ id: 'a', panelId: 'p', task: 'x', budgetUsd: -1 }] }),
      TN.parseTonightBatch({ tasks: [{ id: 'a', panelId: 'p', task: 'x', mode: 'yolo' }] }),
      TN.parseTonightBatch({ tasks: [{ id: 'a', panelId: 'p', task: 'x' }], notBefore: 'tonight' })
    ]
    const limited = TN.tonightResumeAt({ kind: 'limited', until: 2000, overage: false, windows: {}, at: 0 }, 1_000_000)
    const stale = TN.tonightResumeAt({ kind: 'limited', until: 1, overage: false, windows: {}, at: 0 }, 1_000_000)
    ok('tonight.1 a batch is parsed by name — a missing task, a repeated id, a bad check, budget, mode or start time is refused with a reason, never trimmed into a smaller batch; a limit resumes after its reset plus a margin, and a stale reset still waits a minimum rather than retrying at once',
      parsed.kind === 'ok' && parsed.batch.tasks[0].title === 'fix the login bug' && parsed.batch.tasks[0].check.command === 'npm test' && parsed.batch.tasks[0].budgetUsd === 2 && parsed.batch.notBefore === 5 &&
        refused.every((r) => r.kind === 'refused' && r.reason !== '') &&
        limited === 2000 * 1000 + TN.TONIGHT_RESUME_MARGIN_MS && stale === 1_000_000 + TN.TONIGHT_MIN_PAUSE_MS &&
        TN.tonightResumeAt({ kind: 'allowed', overage: false, windows: {}, at: 0 }, 0) === undefined && TN.tonightResumeAt({ kind: 'none' }, 0) === undefined,
      JSON.stringify({ parsed, refused: refused.map((r) => r.reason), limited, stale }))
  }
  {
    // The roadmap's done check: three tasks unattended. One fails its check
    // and is retried with the output; one hits a usage limit and resumes;
    // the batch ends with the blocker released and the outcomes in order.
    const n = night()
    for (const id of ['n1', 'n2', 'n3']) n.m.manager.create({ id, cwd: `/repo/${id}` })
    const started = n.runner.start({ tasks: [
      { id: 'fix', panelId: 'n1', title: 'Fix the parser', task: 'fix the parser', check: { command: 'npm test', retries: 2 } },
      { id: 'docs', panelId: 'n2', title: 'Write the docs', task: 'write the docs' },
      { id: 'lint', panelId: 'n3', title: 'Clean lint', task: 'clean lint', check: { command: 'npm run lint' } }
    ] })
    const awakeAtStart = n.blocker.started === 1 && n.runner.status().awake === true
    const onlyFirst = n.m.spawns.length === 1 && n.m.spawns[0].cwd === '/repo/n1'
    // Task 1: claims done, the check fails, the output goes back, then it passes.
    n.proc(0).emitLines(say(`done. ${MARK}`)); await tick(10)
    n.c.answer({ exitCode: 1, output: 'FAIL parser.test.ts' }); await tick(10)
    const fedBack = /FAIL parser\.test\.ts/.test(n.proc(0).stdin[n.proc(0).stdin.length - 1])
    n.proc(0).emitLines(say(`really done. ${MARK}`)); await tick(10)
    n.c.answer({ exitCode: 0, output: 'ok' }); await tick(10)
    const t1 = n.runner.status().tasks[0]
    // Task 2: the account runs out mid-run — the turn errors while limited.
    const secondStarted = n.m.spawns.length === 2
    n.setRate({ kind: 'limited', until: Math.floor(n.clockNow() / 1000) + 3600, overage: false, windows: {}, at: n.clockNow() })
    n.proc(1).emitLines(sayError('rate limited')); await tick(10)
    const paused = n.runner.status()
    const t2Paused = paused.tasks[1].state === 'paused' && paused.state === 'paused' && paused.resumesAt !== undefined
    const thirdNotYet = n.m.spawns.length === 2
    // The window resets; the timer resumes the SAME task with a continue turn.
    n.setRate({ kind: 'allowed', overage: false, windows: {}, at: n.clockNow() })
    n.fire(); await tick(10)
    const resumeTurn = n.proc(1).stdin[n.proc(1).stdin.length - 1]
    const resumed = /paused by a usage limit/.test(resumeTurn) && /write the docs/.test(resumeTurn) && n.runner.status().tasks[1].attempts === 2
    n.proc(1).emitLines(say(`docs written. ${MARK}`)); await tick(10)
    // Task 3: checked first time.
    n.proc(2).emitLines(say(MARK)); await tick(10)
    n.c.answer({ exitCode: 0, output: '' }); await tick(10)
    const end = n.runner.status()
    ok('tonight.2 three tasks run unattended one at a time: a failed check goes back with its output and the task ends checked; a usage limit PAUSES the batch (nothing else starts) and the window\'s reset resumes the same task with a continue turn; the batch ends done with the blocker released',
      started.kind === 'started' && awakeAtStart && onlyFirst && fedBack &&
        t1.state === 'checked' && t1.checkFailures === 1 && secondStarted && t2Paused && thirdNotYet && resumed &&
        end.state === 'done' && end.tasks.map((t) => t.state).join(',') === 'checked,claimed,checked' &&
        !end.tasks.some((t) => t.state === 'stuck' || t.state === 'stopped') &&
        end.awake === false && n.blocker.stopped.length === 1 && n.blocker.stopped[0] === 7,
      JSON.stringify({ started, tasks: end.tasks.map((t) => [t.id, t.state, t.attempts, t.reason]), state: end.state, blocker: n.blocker, t2Paused, resumed }))
  }
  {
    // The blocker is released on EVERY way out, exactly once.
    const exits = {}
    {
      const n = night()
      n.m.manager.create({ id: 's1', cwd: '/r' }); n.m.manager.create({ id: 's2', cwd: '/r' })
      n.runner.start({ tasks: [{ id: 'a', panelId: 's1', title: 'A', task: 'a' }, { id: 'b', panelId: 's2', title: 'B', task: 'b' }] })
      const stopped = n.runner.stop()
      const st = n.runner.status()
      exits.stop = stopped && st.state === 'stopped' && st.tasks.every((t) => t.state === 'stopped') && n.m.manager.get('s1').auto.state === 'stopped' && n.blocker.stopped.length === 1 && n.runner.stop() === false
    }
    {
      const n = night()
      n.m.manager.create({ id: 'q1', cwd: '/r' })
      n.runner.start({ tasks: [{ id: 'a', panelId: 'q1', title: 'A', task: 'a' }] })
      n.runner.dispose()
      exits.quit = n.blocker.stopped.length === 1 && n.runner.status().tasks[0].reason === 'the app quit' && n.runner.start({ tasks: [{ id: 'a', panelId: 'q1', title: 'A', task: 'a' }] }).kind === 'refused'
    }
    {
      let calls = 0
      const n = night({ spentOf: () => { calls += 1; if (calls > 1) throw new Error('meter gone'); return 0 } })
      n.m.manager.create({ id: 'e1', cwd: '/r' })
      n.runner.start({ tasks: [{ id: 'a', panelId: 'e1', title: 'A', task: 'a' }] })
      n.proc(0).emitLines(say('working')); await tick(10)
      const st = n.runner.status()
      exits.error = st.state === 'stopped' && /meter gone/.test(st.tasks[0].reason ?? '') && n.blocker.stopped.length === 1
    }
    {
      const n = night()
      n.m.manager.create({ id: 'w1', cwd: '/r' })
      n.runner.start({ tasks: [{ id: 'a', panelId: 'w1', title: 'A', task: 'a' }], notBefore: n.clockNow() + 3_600_000 })
      const waiting = n.runner.status().state === 'waiting' && n.m.spawns.length === 0 && n.blocker.started === 1
      n.runner.stop()
      exits.waiting = waiting && n.blocker.stopped.length === 1 && n.timers.every((t) => !t.live)
    }
    ok('tonight.3 the power blocker is held while a batch runs and released exactly once on every way out — the last task ending (tonight.2), a stop, the app quitting, a dep throwing mid-run, and a stop while still waiting for its start time (whose timer is cleared)',
      exits.stop === true && exits.quit === true && exits.error === true && exits.waiting === true, JSON.stringify(exits))
  }
  {
    // A limit at the START pauses before anything runs; a limit never stops a task.
    const n = night()
    n.m.manager.create({ id: 'l1', cwd: '/r' })
    n.setRate({ kind: 'limited', until: Math.floor(n.clockNow() / 1000) + 600, overage: false, windows: {}, at: 0 })
    n.runner.start({ tasks: [{ id: 'a', panelId: 'l1', title: 'A', task: 'a' }] })
    const pausedFirst = n.runner.status().state === 'paused' && n.m.spawns.length === 0
    // Still limited when the timer fires: it pauses again, never gives up.
    n.fire(); await tick(10)
    const pausedAgain = n.runner.status().state === 'paused' && n.m.spawns.length === 0 && n.runner.status().tasks[0].state === 'paused'
    n.setRate({ kind: 'allowed', overage: false, windows: {}, at: 0 })
    n.fire(); await tick(10)
    const ran = n.m.spawns.length === 1 && n.runner.status().tasks[0].state === 'running' && n.runner.status().tasks[0].attempts === 1
    ok('tonight.4 a limit when the batch starts pauses before anything is sent; a limit still in force at the resume pauses again — a limit pauses and resumes, it never stops a task',
      pausedFirst && pausedAgain && ran, JSON.stringify(n.runner.status()))
    n.runner.stop()
  }
  {
    // A task's own failures are its own: the batch moves on and says why.
    const n = night()
    n.m.manager.create({ id: 'f1', cwd: '/r' }); n.m.manager.create({ id: 'f2', cwd: '/r' }); n.m.manager.create({ id: 'f3', cwd: '/r' })
    n.spent.set('f2', 0)
    n.runner.start({ tasks: [
      { id: 'a', panelId: 'f1', title: 'A', task: 'a', check: { command: 'make', retries: 0 } },
      { id: 'b', panelId: 'f2', title: 'B', task: 'b', budgetUsd: 1 },
      { id: 'c', panelId: 'f3', title: 'C', task: 'c' }
    ] })
    n.proc(0).emitLines(say(MARK)); await tick(10)
    n.c.answer({ exitCode: 2, output: 'nope' }); await tick(10)
    n.spent.set('f2', 1.5)
    n.proc(1).emitLines(say('spent a lot')); await tick(10)
    const afterBudget = n.runner.status().tasks.map((t) => t.state).join(',')
    n.proc(2).emitLines(say(`ok ${MARK}`)); await tick(10)
    const end = n.runner.status()
    ok('tonight.5 a task whose check keeps failing ends stuck with the reason; a task past its own budget is stopped as over-budget; the batch goes on to the next task each time and ends done — no task\'s failure is read as a limit, and none stops the night',
      end.state === 'done' && end.tasks[0].state === 'stuck' && /check kept failing/.test(end.tasks[0].reason) &&
        end.tasks[1].state === 'over-budget' && /\$1\.00 budget/.test(end.tasks[1].reason) && n.m.manager.get('f2').auto.state === 'stopped' &&
        end.tasks[2].state === 'claimed' && /^stuck,over-budget,running$/.test(afterBudget) && n.blocker.stopped.length === 1,
      JSON.stringify({ afterBudget, tasks: end.tasks.map((t) => [t.state, t.reason]) }))
  }
  {
    const n = night()
    const noChat = n.runner.start({ tasks: [{ id: 'a', panelId: 'ghost', title: 'Ghost', task: 'a' }] })
    n.m.manager.create({ id: 'd1', cwd: '/r' })
    n.runner.start({ tasks: [{ id: 'a', panelId: 'd1', title: 'A', task: 'a' }] })
    const twice = n.runner.start({ tasks: [{ id: 'a', panelId: 'd1', title: 'A', task: 'a' }] })
    ok('tonight.6 a batch naming a chat that does not exist is refused by name before the Mac is kept awake; a second batch while one runs is refused',
      noChat.kind === 'refused' && /Ghost/.test(noChat.reason) && twice.kind === 'refused' && n.blocker.started === 1,
      JSON.stringify({ noChat, twice, started: n.blocker.started }))
    n.runner.stop()
  }

  // M480 (C2b) — tonight.batch.1. What the door hands main: the board's open
  // tasks with a live conversation, in board order, each left-out one named.
  {
    const recipe = (checks) => ({ id: 'r', version: 1, hash: 'h', at: 0, definition: { id: 'r', name: 'r', checks } })
    const items = [
      { id: 'w1', title: 'Fix login', state: 'working', panelId: 'c1', brief: 'the 500 on bad passwords', criteria: ['returns 401', ' '], recipeUsed: recipe(['npm test', ' npm run lint ']) },
      { id: 'w2', title: 'Docs', state: 'todo', panelId: 'c2' },
      { id: 'w3', title: 'Ready', state: 'review', panelId: 'c3' },
      { id: 'w4', title: 'Closed chat', state: 'working', panelId: 'gone' },
      { id: 'w5', title: 'Never started', state: 'todo' },
      { id: 'w6', title: 'Shipped', state: 'done', panelId: 'c6' },
      { id: 'w7', title: 'Merged', state: 'working', panelId: 'c7', merged: { into: 'main', sha: 's', at: 1 } }
    ]
    const open = new Set(['c1', 'c2', 'c3', 'c6', 'c7'])
    const r = TN.tonightBatchFrom(items, (id) => open.has(id))
    const parsed = TN.parseTonightBatch({ tasks: r.tasks })
    const words = TN.tonightWords({ kind: 'started', tasks: 2, checked: 1, skipped: 3 })
    ok('tonight.batch.1 Run tonight takes the open tasks with a live conversation in board order — the brief and criteria as the task, the recipe\'s checks joined as its gate — names each one it leaves out (in review, chat closed, never started), drops done and merged silently, and what it builds passes main\'s own parse',
      r.tasks.map((t) => t.id).join() === 'w1,w2' && r.tasks[0].task === 'Fix login\n\nthe 500 on bad passwords\n\nDone when:\n- returns 401' &&
        r.tasks[0].check?.command === 'npm test && npm run lint' && r.tasks[1].check === undefined && r.tasks[1].task === 'Docs' &&
        JSON.stringify(r.skipped.map((x) => x.title)) === '["Ready","Closed chat","Never started"]' && /review/.test(r.skipped[0].reason) && /closed/.test(r.skipped[1].reason) && /start/.test(r.skipped[2].reason) &&
        parsed.kind === 'ok' && /^2 tasks queued for tonight.*1 gated by a check.*awake.*3 left out$/.test(words),
      JSON.stringify({ r, parsed: parsed.kind, words }))
  }

  const failed = results.filter((x) => !x.pass)
  console.log(`verify:auto ${results.length - failed.length}/${results.length}`)
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.n}${f.detail ? ` — ${f.detail}` : ''}`)
    process.exit(1)
  }
})().catch((err) => { console.error(err); process.exit(1) })
