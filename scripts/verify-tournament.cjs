/* Run with: node scripts/verify-tournament.cjs
   Lane I (M546–M549): tournament mode — one task, N agents, each in its own
   worktree, and the task's check decides (docs/streams/bold.md). Plain node:
   each module is bundled with esbuild and driven with fixtures, so no
   Electron, shell, CLI, git or network is touched. Every check reports even
   when its module fails to load, so one missing export cannot hide the rest. */
const { buildSync } = require('esbuild')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '..')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ALIAS = { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }
function load(entry, name) {
  try {
    const outfile = join(ROOT, 'out/verify', `tournament-${name}.cjs`)
    buildSync({ entryPoints: [join(ROOT, entry)], outfile, bundle: true, platform: 'node', format: 'cjs', alias: ALIAS, logLevel: 'silent' })
    return { mod: require(outfile) }
  } catch (error) {
    return { error: error.message.split('\n')[0] }
  }
}
const check = (id, loaded, test) => {
  if (loaded.mod === undefined) { ok(id, false, loaded.error); return }
  try {
    const r = test(loaded.mod)
    ok(id, r.pass, JSON.stringify(r.detail).slice(0, 400))
  } catch (error) { ok(id, false, error.message) }
}

const model = load('src/shared/tournament.ts', 'model')

const SPEC = {
  task: 'Make the date parser accept ISO weeks', root: '/repo',
  check: { command: 'npm test' },
  entrants: [{ id: 'a', backend: 'claude' }, { id: 'b', backend: 'claude', model: 'sonnet' }, { id: 'c', backend: 'codex' }]
}
const diff = (files, added, removed = 0) => ({ files, added, removed })
const out = (id, state, extra = {}) => ({ id, state, costUsd: 1, durationMs: 60_000, diff: diff(['src/date.ts'], 10), checkFailures: 0, ...extra })

// M546 — tournament.model.1. The spec parses, labels default from the
//      backend and model, and the title is the task's first line.
check('tournament.model.1 a spec of three entrants parses, each labelled by its agent and model', model, (T) => {
  const r = T.parseTournament(SPEC)
  return { pass: r.kind === 'ok' && r.spec.entrants.map((e) => e.label).join('|') === 'claude|claude · sonnet|codex' && r.spec.title === SPEC.task && r.spec.check.command === 'npm test', detail: r }
})

// tournament.model.2. "The check decides" is the idea: a spec without one is
//      refused by name, never run as N claimed dones ranked by who did least.
check('tournament.model.2 a tournament without a check is refused, and so is one entrant, seven, a repeated id or an unknown agent', model, (T) => {
  const no = (patch) => T.parseTournament({ ...SPEC, ...patch })
  const rs = [
    no({ check: undefined }), no({ entrants: [SPEC.entrants[0]] }),
    no({ entrants: Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, backend: 'claude' })) }),
    no({ entrants: [SPEC.entrants[0], SPEC.entrants[0]] }), no({ entrants: [SPEC.entrants[0], { id: 'x', backend: 'gpt' }] }),
    no({ root: 'relative/path' }), no({ task: '  ' }), no({ check: { command: 'a\nb' } })
  ]
  return { pass: rs.every((r) => r.kind === 'refused') && /check/.test(rs[0].reason), detail: rs.map((r) => r.reason) }
})

// tournament.model.3. A dollar budget is read from a spend meter; codex has
//      none, so a budget without a time limit would never stop it.
check('tournament.model.3 a dollar budget over an agent that reports no cost is refused unless a time limit holds it', model, (T) => {
  const budget = T.parseTournament({ ...SPEC, budgetUsd: 2 })
  const both = T.parseTournament({ ...SPEC, budgetUsd: 2, timeLimitMs: 30 * 60_000 })
  const claudeOnly = T.parseTournament({ ...SPEC, budgetUsd: 2, entrants: SPEC.entrants.slice(0, 2) })
  return { pass: budget.kind === 'refused' && /codex reports no cost/.test(budget.reason) && both.kind === 'ok' && claudeOnly.kind === 'ok', detail: [budget, both.kind, claudeOnly.kind] }
})

// tournament.model.4. Eligibility comes before every metric: the failed run
//      is the cheapest, smallest and fastest here, and still never wins.
check('tournament.model.4 a failed check never wins on cost, size or time', model, (T) => {
  const s = T.scoreTournament([
    out('cheap', 'stuck', { costUsd: 0.01, durationMs: 1000, diff: diff(['src/date.ts'], 1), checkFailures: 4 }),
    out('pricey', 'checked', { costUsd: 9, durationMs: 3_600_000, diff: diff(['src/date.ts', 'src/week.ts'], 400, 30) })
  ])
  const cheap = s.ranking.find((r) => r.id === 'cheap')
  return { pass: s.winner === 'pricey' && cheap.eligible === false && cheap.score === null && /check kept failing/.test(cheap.why), detail: s }
})

// tournament.model.5. A claimed done, an over-budget run and an empty pass
//      are each ineligible, each with its own reason.
check('tournament.model.5 a claimed done, an over-budget or out-of-time run and a pass that changed nothing cannot win', model, (T) => {
  const s = T.scoreTournament([
    out('claim', 'claimed'), out('broke', 'over-budget'), out('late', 'over-time'),
    out('empty', 'checked', { diff: diff([], 0) }), out('unread', 'checked', { diff: null })
  ])
  const why = Object.fromEntries(s.ranking.map((r) => [r.id, r.why]))
  return {
    pass: s.winner === null && s.ranking.every((r) => !r.eligible) && /no check confirmed/.test(why.claim) && /budget/.test(why.broke) &&
      /out of time/.test(why.late) && /changed nothing/.test(why.empty) && /could not be read/.test(why.unread) && /no entrant passed/.test(s.summary),
    detail: s
  }
})

// tournament.model.6. Among passes, the smaller diff wins when the rest is
//      equal, and an unknown cost is the middle of the field — never $0,
//      which would hand codex every cost comparison for free.
check('tournament.model.6 among passes the smaller change wins, and an unreported cost counts as the middle, never as free', model, (T) => {
  const size = T.scoreTournament([out('big', 'checked', { diff: diff(['a', 'b'], 300) }), out('small', 'checked', { diff: diff(['a'], 20) })])
  const cost = T.scoreTournament([
    out('paid', 'checked', { costUsd: 1 }), out('free', 'checked', { costUsd: null }), out('dear', 'checked', { costUsd: 3 })
  ])
  const free = cost.ranking.find((r) => r.id === 'free')
  return { pass: size.winner === 'small' && free.parts.cost === 0.5 && cost.winner === 'paid' && /not reported/.test(free.why), detail: { size: size.winner, cost } }
})

// tournament.model.7. Overlap is with lanes OUTSIDE the tournament only:
//      entrants solve one task, so they share files by construction.
check('tournament.model.7 a pass that touches another lane\'s files ranks below an equal one that does not, and entrants never count against each other', model, (T) => {
  const s = T.scoreTournament([
    out('meets', 'checked', { diff: diff(['src/date.ts', 'src/api.ts'], 10) }),
    out('clear', 'checked', { diff: diff(['src/date.ts', 'src/week.ts'], 10) })
  ], ['src/api.ts'])
  const meets = s.ranking.find((r) => r.id === 'meets')
  const alone = T.scoreTournament([out('x', 'checked'), out('y', 'checked')])
  return { pass: s.winner === 'clear' && meets.overlap.join() === 'src/api.ts' && alone.ranking.every((r) => r.overlap.length === 0), detail: s }
})

// tournament.model.8. Ties keep the given order, a field still running names
//      no winner yet, and the scores are deterministic.
check('tournament.model.8 equal passes keep the order given, and no winner is named while an entrant still runs', model, (T) => {
  const tie = T.scoreTournament([out('first', 'checked'), out('second', 'checked')])
  const live = T.scoreTournament([out('done', 'checked'), out('busy', 'running')])
  return { pass: tie.winner === 'first' && tie.ranking[0].score === 0 && live.winner === null && /1 of 2 still running/.test(live.summary), detail: { tie, live } }
})

// ── M547 — the runner, over fakes ──────────────────────────────────────────
const runnerMod = load('src/main/tournament-runner.ts', 'runner')
const gitMod = load('src/main/git-runner.ts', 'git')

/* A fake world: lanes, a create door, an auto door that records starts and
   stops, an event bus the test drives, a spend meter, timers by hand. */
function world(opts = {}) {
  const subs = new Set()
  const timers = []
  let clock = 1000
  const spend = new Map()
  const w = {
    created: [], started: [], stopped: [], statuses: [],
    emit: (id, state, extra = {}) => { for (const cb of [...subs]) cb({ type: 'auto', id, mode: 'custom', turn: 1, limit: 8, state, ...extra }) },
    setSpend: (id, v) => spend.set(id, v),
    tick: (ms) => { clock += ms },
    fire: () => { for (const t of timers.splice(0)) if (!t.cleared) t.fn() },
    subs, timers,
    deps: {
      lane: async (panelId, root) => (opts.refuseLane === panelId ? { kind: 'refused', reason: 'git said no' } : { kind: 'lane', path: `${root}-wt/${panelId}`, branch: `tc/${panelId}`, worktreeId: `wt-${panelId}` }),
      create: (spec) => { w.created.push(spec); return opts.refuseCreate === spec.id ? { kind: 'refused', reason: 'codex was not found' } : { kind: 'created', snapshot: {} } },
      startAuto: (id, o) => { w.started.push({ id, ...o }); return { kind: 'started', limit: 8 } },
      stopAuto: (id) => { w.stopped.push(id); return true },
      subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb) },
      spentOf: (id) => spend.get(id) ?? 0,
      diffOf: async (path) => (opts.diffs ?? {})[path.split('/').pop()] ?? { files: ['src/date.ts'], added: 10, removed: 0 },
      otherLaneFiles: async () => opts.others ?? [],
      mintSessionId: () => `s-${w.created.length}`,
      mintId: () => 'tn-1',
      now: () => clock,
      setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t },
      clearTimer: (t) => { t.cleared = true },
      onStatus: (st) => w.statuses.push(st)
    }
  }
  return w
}
const flush = () => new Promise((r) => setImmediate(r))
const spec = (patch = {}) => {
  const r = model.mod.parseTournament({ ...SPEC, entrants: SPEC.entrants.map((e, i) => ({ ...e, panelId: `c${i + 1}` })), ...patch })
  if (r.kind !== 'ok') throw new Error(r.reason)
  return r.spec
}
const runner = { mod: runnerMod.mod === undefined ? undefined : { ...runnerMod.mod, T: model.mod }, error: runnerMod.error ?? model.error }

// tournament.runner.1. Every entrant gets a lane, a chat in it through the
//      create door, and a checked custom run of the SAME task — and the
//      runner is subscribed before the first run starts.
const runnerChecks = (async () => {
  if (runner.mod === undefined) { ok('tournament.runner.1 the runner module loads', false, runner.error); return }
  const R = runner.mod
  {
    const w = world()
    const r = await R.createTournamentRunner(w.deps).start(spec())
    const codex = w.started.find((s) => s.id === 'c3')
    const claude = w.created.find((c) => c.id === 'c2')
    const pass = r.kind === 'started' && r.status.state === 'running' && w.created.length === 3 && w.started.length === 3 &&
      w.created.every((c) => c.cwd === `/repo-wt/${c.id}`) && w.started.every((s) => s.mode === 'custom' && s.check.command === 'npm test') &&
      claude.backend === 'claude' && claude.agentOptions.model === 'sonnet' && typeof claude.appendSystemPrompt === 'string' &&
      w.created.find((c) => c.id === 'c3').appendSystemPrompt === undefined && codex.task.startsWith(R.T.TOURNAMENT_PROMPT) && codex.task.endsWith(SPEC.task) &&
      r.status.entrants.every((e) => e.state === 'running' && e.path !== undefined && e.sessionId !== undefined) && w.subs.size === 1
    ok('tournament.runner.1 each entrant gets its own worktree, a chat there and a checked run of the same task; codex gets the lane rules in its task', pass, JSON.stringify({ r, created: w.created, started: w.started }).slice(0, 400))
  }
  // tournament.runner.2. The runner reads the auto run's verdict, scores once
  //      every entrant is done, and the passing entrant wins.
  {
    const w = world()
    const run = R.createTournamentRunner(w.deps)
    await run.start(spec())
    w.emit('c1', 'running', { checking: true })
    const checking = run.status().entrants[0].state
    w.emit('c1', 'stuck', { reason: 'check', checkFailures: 4 })
    w.emit('c2', 'done', { verdict: 'checked' })
    const before = run.status().state
    w.emit('c3', 'done', { verdict: 'claimed' })
    await flush(); await flush()
    const st = run.status()
    const pass = checking === 'checking' && before === 'running' && st.state === 'done' && st.score.winner === 'b' &&
      st.entrants.map((e) => e.state).join() === 'stuck,checked,claimed' && st.entrants[1].diff.files[0] === 'src/date.ts' && w.subs.size === 0
    ok('tournament.runner.2 the field is scored once every entrant is done, from the runs\' own verdicts: the one whose check passed wins', pass, JSON.stringify(st).slice(0, 400))
  }
  // tournament.runner.3. A budget crossing STOPS the run (never kills it) and
  //      the stop that lands reads as over-budget; codex's null cost is never
  //      compared with the budget.
  {
    const w = world()
    const run = R.createTournamentRunner(w.deps)
    await run.start(spec({ budgetUsd: 2, timeLimitMs: 60_000 }))
    w.setSpend('c1', 2.5); w.setSpend('c3', 99)
    w.emit('c1', 'running'); w.emit('c3', 'running')
    const stoppedEarly = [...w.stopped]
    w.emit('c1', 'stopped')
    const st = run.status()
    const pass = stoppedEarly.join() === 'c1' && st.entrants[0].state === 'over-budget' && /\$2\.00 budget/.test(st.entrants[0].reason) && st.entrants[2].costUsd === null && st.entrants[2].state === 'running'
    ok('tournament.runner.3 an entrant over its budget is stopped and marked over budget; one that reports no cost is never judged by dollars', pass, JSON.stringify({ stoppedEarly, st }).slice(0, 400))
  }
  // tournament.runner.4. The time limit stops a run that is still going.
  {
    const w = world()
    const run = R.createTournamentRunner(w.deps)
    await run.start(spec({ timeLimitMs: 1000 }))
    w.emit('c2', 'done', { verdict: 'checked' })
    w.fire()
    const stopped = [...w.stopped].sort().join()
    w.emit('c1', 'stopped'); w.emit('c3', 'stopped')
    await flush(); await flush()
    const st = run.status()
    const pass = stopped === 'c1,c3' && st.entrants[0].state === 'over-time' && st.entrants[1].state === 'checked' && st.score.winner === 'b'
    ok('tournament.runner.4 an entrant still running at its time limit is stopped and marked out of time; a finished one is left alone', pass, JSON.stringify({ stopped, st }).slice(0, 400))
  }
  // tournament.runner.5. One entrant's refusal is its own: the rest run.
  {
    const w = world({ refuseLane: 'c1', refuseCreate: 'c3' })
    const run = R.createTournamentRunner(w.deps)
    const r = await run.start(spec())
    const pass = r.kind === 'started' && r.status.entrants[0].state === 'stuck' && /no worktree: git said no/.test(r.status.entrants[0].reason) &&
      r.status.entrants[2].state === 'stuck' && /no chat: codex was not found/.test(r.status.entrants[2].reason) && r.status.entrants[1].state === 'running' && w.started.length === 1
    ok('tournament.runner.5 an entrant whose worktree or chat is refused is out, named, and the others still run', pass, JSON.stringify(r).slice(0, 400))
  }
  // tournament.runner.6. Stop scores the field as it stands; a second start
  //      is refused while one is live; an entrant with no panel is refused.
  {
    const w = world()
    const run = R.createTournamentRunner(w.deps)
    await run.start(spec())
    const second = await run.start(spec())
    w.emit('c2', 'done', { verdict: 'checked' })
    const stopped = run.stop()
    await flush(); await flush()
    const st = run.status()
    const noPanel = await R.createTournamentRunner(world().deps).start(model.mod.parseTournament(SPEC).spec)
    const pass = second.kind === 'refused' && /already running/.test(second.reason) && stopped && st.state === 'stopped' && st.score.winner === 'b' &&
      st.entrants[0].state === 'stopped' && w.stopped.sort().join() === 'c1,c3' && noPanel.kind === 'refused' && /no panel/.test(noPanel.reason)
    ok('tournament.runner.6 stopping scores the field as it stands, a second tournament is refused while one runs, and an entrant needs a panel', pass, JSON.stringify({ second, st, noPanel }).slice(0, 400))
  }
  // tournament.runner.7. Dispose (the app quitting) stops every run, scores
  //      nothing and refuses every later start.
  {
    const w = world()
    const run = R.createTournamentRunner(w.deps)
    await run.start(spec())
    run.dispose()
    const after = await run.start(spec())
    const st = run.status()
    const pass = st.state === 'stopped' && st.score === undefined && st.entrants.every((e) => e.reason === 'the app quit') && w.stopped.length === 3 && after.kind === 'refused' && w.subs.size === 0
    ok('tournament.runner.7 quitting stops every entrant, scores nothing, and no tournament starts after', pass, JSON.stringify({ st, after }).slice(0, 400))
  }
})()

// tournament.diff.1. readEntrantDiff against a real repository and a real
//      worktree: committed, uncommitted and untracked changes all count, and
//      the main tree moving on after the fork does not.
const diffCheck = (async () => {
  const id = 'tournament.diff.1 a lane\'s diff counts its commits, its uncommitted edits and its new files since the fork, and nothing the main branch did after'
  if (runner.mod === undefined || gitMod.mod === undefined) { ok(id, false, runner.error ?? gitMod.error); return }
  const { execFileSync } = require('node:child_process')
  const { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync } = require('node:fs')
  const { tmpdir } = require('node:os')
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'tc-tournament-')))
  try {
    const g = (cwd, ...a) => execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' })
    const main = join(dir, 'main')
    execFileSync('git', ['init', '-q', '-b', 'main', main])
    writeFileSync(join(main, 'a.txt'), 'one\ntwo\n'); writeFileSync(join(main, 'b.txt'), 'keep\n')
    g(main, 'add', '.'); g(main, 'commit', '-qm', 'base')
    const lane = join(dir, 'lane')
    g(main, 'worktree', 'add', '-q', '-b', 'tc/lane', lane)
    writeFileSync(join(lane, 'a.txt'), 'one\nTWO\nthree\n'); g(lane, 'commit', '-qam', 'lane')
    writeFileSync(join(lane, 'b.txt'), '')
    writeFileSync(join(lane, 'new.txt'), 'x\ny\n')
    writeFileSync(join(main, 'later.txt'), 'main moved on\n'); g(main, 'add', '.'); g(main, 'commit', '-qm', 'later')
    const git = gitMod.mod.createGitRunner({ gitPath: () => execFileSync('which', ['git'], { encoding: 'utf8' }).trim(), env: () => ({ PATH: process.env.PATH, HOME: process.env.HOME ?? dir }) })
    const d = await runner.mod.readEntrantDiff(git, lane, (p) => { try { return readFileSync(p, 'utf8') } catch { return null } })
    const none = await runner.mod.readEntrantDiff(git, join(dir, 'nowhere'), () => null)
    ok(id, d !== null && d.files.join() === 'a.txt,b.txt,new.txt' && d.added === 4 && d.removed === 2 && none === null, JSON.stringify({ d, none }))
  } catch (error) {
    ok(id, false, error.message)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})()

;(async () => {
  await runnerChecks
  await diffCheck
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length > 0) process.exit(1)
})()
