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
    diffBases: [], rechecked: [],
    dispose: (id) => { for (const cb of [...subs]) cb({ type: 'status', id, status: 'disposed' }) },
    emit: (id, state, extra = {}) => { for (const cb of [...subs]) cb({ type: 'auto', id, mode: 'custom', turn: 1, limit: 8, state, ...extra }) },
    setSpend: (id, v) => spend.set(id, v),
    tick: (ms) => { clock += ms },
    fire: () => { for (const t of timers.splice(0)) if (!t.cleared) t.fn() },
    subs, timers,
    deps: {
      lane: async (panelId, root) => (opts.refuseLane === panelId ? { kind: 'refused', reason: 'git said no' } : { kind: 'lane', path: `${root}-wt/${panelId}`, branch: `tc/${panelId}`, worktreeId: `wt-${panelId}`, head: `fork-${panelId}` }),
      create: (spec) => { w.created.push(spec); return opts.refuseCreate === spec.id ? { kind: 'refused', reason: 'codex was not found' } : { kind: 'created', snapshot: { cwd: opts.elsewhere === spec.id ? '/somewhere/else' : spec.cwd } } },
      startAuto: (id, o) => { w.started.push({ id, ...o }); return { kind: 'started', limit: 8 } },
      stopAuto: (id) => { w.stopped.push(id); return opts.gone !== id },
      subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb) },
      spentOf: (id) => spend.get(id) ?? 0,
      diffOf: async (path, base) => (w.diffBases.push(base), (opts.diffs ?? {})[path.split('/').pop()] ?? { files: ['src/date.ts'], added: 10, removed: 0 }),
      ...(opts.recheck === undefined ? {} : { recheck: async (path) => { w.rechecked.push(path); return opts.recheck(path) } }),
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
  // tournament.runner.8. A run that ends with no auto event still ends: a
  //      closed chat settles stopped, and a limit whose stop finds no run
  //      settles at once — or the field would never be scored.
  {
    const w = world({ gone: 'c3' })
    const run = R.createTournamentRunner(w.deps)
    await run.start(spec({ timeLimitMs: 1000 }))
    w.emit('c2', 'done', { verdict: 'checked' })
    w.dispose('c1')
    w.dispose('c9')
    const afterClose = run.status().entrants[0]
    w.fire()
    await flush(); await flush()
    const st = run.status()
    const pass = afterClose.state === 'stopped' && afterClose.reason === 'its chat was closed' && st.entrants[2].state === 'over-time' && st.state === 'done' && st.score.winner === 'b'
    ok('tournament.runner.8 a closed entrant chat ends that entrant, and a limit whose stop finds no run settles it, so the field is still scored', pass, JSON.stringify(st).slice(0, 400))
  }
  // tournament.runner.9. The budget never aborts a check: the spend is
  //      already made, and the check decides whether it was worth it.
  {
    const w = world()
    const run = R.createTournamentRunner(w.deps)
    await run.start(spec({ budgetUsd: 2, timeLimitMs: 60_000 }))
    w.setSpend('c1', 2.5)
    w.emit('c1', 'running', { checking: true })
    const during = [...w.stopped]
    w.emit('c1', 'running')
    const pass = during.length === 0 && w.stopped.join() === 'c1'
    ok('tournament.runner.9 an entrant over budget while its check runs is not stopped until the check is over', pass, JSON.stringify({ during, after: w.stopped }))
  }
  // tournament.runner.10. At scoring every pass is re-run on the tree as it
  //      stands, one that now fails cannot win; the diff is read from each
  //      lane's own fork point; a change to what the check runs is named.
  {
    const w = world({ recheck: (path) => !path.endsWith('/c2'), diffs: { c1: { files: ['package.json', 'src/date.ts'], added: 1, removed: 1 } } })
    const run = R.createTournamentRunner(w.deps)
    await run.start(spec())
    w.emit('c1', 'done', { verdict: 'checked' })
    w.emit('c2', 'done', { verdict: 'checked' })
    w.emit('c3', 'done', { verdict: 'claimed' })
    await flush(); await flush(); await flush()
    const st = run.status()
    const pass = st.state === 'done' && w.rechecked.join() === '/repo-wt/c1,/repo-wt/c2' && st.entrants[1].state === 'claimed' && /run again at scoring/.test(st.entrants[1].reason) &&
      st.score.winner === 'a' && w.diffBases.join() === 'fork-c1,fork-c2,fork-c3' && (st.entrants[0].checkTouched ?? []).join() === 'package.json' && st.entrants[1].checkTouched === undefined
    ok('tournament.runner.10 every pass is checked again at scoring, the diff is read from the lane\'s fork point, and a change to what the check runs is named', pass, JSON.stringify({ st, rechecked: w.rechecked, bases: w.diffBases }).slice(0, 500))
  }
  // tournament.runner.11. A panel id that already runs a chat in another
  //      folder is not the entrant's lane: create is idempotent by id.
  {
    const w = world({ elsewhere: 'c2' })
    const r = await R.createTournamentRunner(w.deps).start(spec())
    const pass = r.status.entrants[1].state === 'stuck' && /another folder/.test(r.status.entrants[1].reason) && w.started.every((s) => s.id !== 'c2')
    ok('tournament.runner.11 an entrant whose panel already runs a chat elsewhere is out, never run outside its lane', pass, JSON.stringify(r).slice(0, 400))
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

// ── M548 — the doors, the field and the bracket's words ───────────────────
const plan = load('src/shared/plan.ts', 'plan')
const verbs = load('src/shared/verb-table.ts', 'verbs')
const tones = load('src/renderer/panels/panel-state.ts', 'tones')
const { readFileSync } = require('node:fs')
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8')

const ITEM = { id: 'wk1', key: 'ENG-7', title: 'ISO weeks', brief: 'Parse 2026-W43.', criteria: ['round-trips'], state: 'working', panelId: 'c1', checks: ['npm test', 'npm run lint'], createdAt: 1, updatedAt: 1 }
const has = (list) => (b) => list.includes(b)

// tournament.field.1. The default field is two claude models and every
//      other agent found, up to four; a typed field is refused by name for an
//      unknown agent or a missing CLI, never trimmed.
check('tournament.field.1 the default field is claude opus and sonnet plus every other agent found, and a typed field names what it refuses', model, (T) => {
  const all = T.defaultField(has(['claude', 'codex', 'copilot']))
  const claudeOnly = T.defaultField(has(['claude']))
  const none = T.defaultField(has([]))
  const typed = T.parseField('claude:opus, codex', has(['claude', 'codex']))
  const unknown = T.parseField('claude gpt', has(['claude']))
  const missing = T.parseField('claude codex', has(['claude']))
  const one = T.parseField('claude', has(['claude']))
  return {
    pass: all.map((f) => f.backend + (f.model ?? '')).join() === 'claudeopus,claudesonnet,codex,copilot' && claudeOnly.length === 2 && none.length === 0 &&
      typed.kind === 'ok' && typed.field[0].model === 'opus' && typed.field[1].backend === 'codex' &&
      unknown.kind === 'refused' && /gpt is not an agent/.test(unknown.reason) && missing.kind === 'refused' && /codex was not found/.test(missing.reason) && one.kind === 'refused',
    detail: { all, typed, unknown, missing }
  }
})

// tournament.field.2. A card's task becomes the spec: its text with the
//      criteria, its checks joined, the main tree it works in; a task with no
//      check or a done one is refused at the door.
check('tournament.field.2 a task card becomes a spec with its text, criteria and checks, and a task with no check is refused by name', model, (T) => {
  const built = T.tournamentFromItem(ITEM, '/repo/lane', T.defaultField(has(['claude', 'codex'])))
  const parsed = built.kind === 'ok' ? T.parseTournament({ ...built.spec, itemId: 'wk1' }) : null
  const noCheck = T.tournamentFromItem({ ...ITEM, checks: [] }, '/repo', [])
  const recipe = T.tournamentFromItem({ ...ITEM, checks: [], recipeUsed: { definition: { checks: ['make check'] } } }, '/repo', T.defaultField(has(['claude'])))
  const done = T.tournamentFromItem({ ...ITEM, state: 'done' }, '/repo', [])
  return {
    pass: built.kind === 'ok' && parsed.kind === 'ok' && parsed.spec.check.command === 'npm test && npm run lint' && /Parse 2026-W43/.test(parsed.spec.task) && /- round-trips/.test(parsed.spec.task) &&
      parsed.spec.title === 'ENG-7' && parsed.spec.itemId === 'wk1' && parsed.spec.entrants.map((e) => e.id).join() === 'a,b,c' &&
      noCheck.kind === 'refused' && /no check/.test(noCheck.reason) && recipe.kind === 'ok' && recipe.spec.check.command === 'make check' && done.kind === 'refused',
    detail: { built, noCheck, done }
  }
})

// tournament.bracket.1. Pick takes only a scored, eligible entrant; the
//      columns' tones are all in panel-state's closed set (colour comes only
//      from there); the facts line says an unreported cost rather than $0.
check('tournament.bracket.1 Pick refuses an unscored field and an ineligible entrant, every column tone is panel-state\'s, and an unreported cost is said', model, (T) => {
  const base = { id: 'tn', title: 't', task: 't', root: '/r', check: 'npm test', startedAt: 0, entrants: [
    { id: 'a', label: 'claude', backend: 'claude', panelId: 'c1', state: 'checked', costUsd: 1.5, checkFailures: 0, startedAt: 0, endedAt: 120_000, diff: { files: ['x'], added: 3, removed: 1 } },
    { id: 'b', label: 'codex', backend: 'codex', panelId: 'c2', state: 'stuck', costUsd: null, checkFailures: 2, startedAt: 0, endedAt: 60_000, diff: null }] }
  const scored = { ...base, state: 'done', score: T.scoreTournament(base.entrants.map(T.outcomeOf)) }
  const running = { ...base, state: 'running' }
  const toneOk = tones.mod !== undefined && Object.values(T.ENTRANT_TONES).every((t) => tones.mod.TONES.includes(t))
  return {
    pass: T.pickRefusal(null, undefined) !== null && /still running/.test(T.pickRefusal(running, 'a')) && T.pickRefusal(scored, undefined) === null && T.pickRefusal(scored, 'a') === null &&
      /cannot be picked/.test(T.pickRefusal(scored, 'b')) && toneOk && T.entrantFacts(base.entrants[0], 0) === '+3 −1 in 1 file · $1.50 · 2m' &&
      /cost not reported/.test(T.entrantFacts(base.entrants[1], 0)) && /changes unread/.test(T.entrantFacts(base.entrants[1], 0)),
    detail: { toneOk, facts: base.entrants.map((e) => T.entrantFacts(e, 0)) }
  }
})

// tournament.doors.1. The fourth door is real: `tournament` is a verb whose
//      action is `runTournament`, its agent line and its action-node line
//      bind, a teammate's plan is refused it, its palette rows exist, the
//      card's Swarm… menu carries it, and the canvas mounts the bracket.
const doorsLoaded = { mod: plan.mod !== undefined && verbs.mod !== undefined ? { P: plan.mod, V: verbs.mod } : undefined, error: plan.error ?? verbs.error }
check('tournament.doors.1 tournament is a verb with a card gesture, three palette rows, an agent line and an action-node line that bind, refused to a teammate', doorsLoaded, ({ P, V }) => {
  const facts = { panels: [{ id: 'wk1', kind: 'work' }] }
  const verb = V.VERBS.find((v) => v.id === 'tournament')
  const door = V.V9_DOORS.tournament
  const start = P.buildPlan(P.parsePlanLine('tournament wk1 claude:opus codex'), facts)
  const stop = P.buildPlan(P.parsePlanLine('tournament stop'), facts)
  const pick = P.buildPlan(P.parsePlanLine('tournament pick b'), facts)
  const mate = start.kind === 'plan' ? P.agentDoorRefusal(start.plan.steps[0], facts, { teammateId: 'tm1' }) : null
  const commands = require('./lib/palette-src.cjs').paletteSource()
  const card = src('src/renderer/work/WorkNode.tsx')
  const node = src('src/renderer/canvas/PanelNode.tsx')
  const canvas = src('src/renderer/canvas/Canvas.tsx')
  const exec = src('src/renderer/canvas/palette-actions/executor.ts')
  const pass = verb !== undefined && verb.actions.join() === 'runTournament' && verb.destructive === false && door !== undefined && door.palette === 'task.tournament' &&
    start.kind === 'plan' && start.plan.steps[0].args.op === 'wk1' && start.plan.steps[0].args.value === 'claude:opus codex' &&
    stop.kind === 'plan' && stop.plan.steps[0].args.op === 'stop' && pick.kind === 'plan' && pick.plan.steps[0].args.value === 'b' && typeof mate === 'string' &&
    ["id: 'task.tournament'", "id: 'task.tournament-stop'", "id: 'task.tournament-pick'", "id: 'task.tournament-judge'", "id: 'task.tournament-combine'"].every((id) => commands.includes(id)) &&
    card.includes('data-work-tournament') && /onTournament=\{\(itemId\) => \{ void paletteActionsRef\.current\?\.runTournament\(itemId\)/.test(node) &&
    canvas.includes('<TournamentBracket run={paletteActions.runTournament}') && exec.includes("case 'tournament': return self.runTournament(")
  return { pass, detail: { verb, door, start: start.kind, stop: stop.kind, pick: pick.kind, mate } }
})

// tournament.verb.1. The renderer's half over fakes: a start mints a panel
//      per entrant, hands main the card's spec with those ids, and places
//      each entrant's chat linked from the card; Pick closes the others and
//      makes the winner the task's lane; a never-started task is refused.
const verbMod = load('src/renderer/canvas/tournament-verb.ts', 'verb')
const panelsMod = load('src/renderer/panels/panels.ts', 'panels')
const verbCheck = (async () => {
  const id = 'tournament.verb.1 a start mints and places one linked chat per entrant from the card\'s spec; Pick closes the rest and makes the winner the task\'s lane'
  if (verbMod.mod === undefined || panelsMod.mod === undefined || model.mod === undefined) { ok(id, false, verbMod.error ?? panelsMod.error); return }
  const Pn = panelsMod.mod
  const T = model.mod
  try {
    const sent = []
    const closed = []
    let status = null
    globalThis.window = { canvas: { tournament: {
      start: async (raw) => {
        sent.push(raw)
        const parsed = T.parseTournament(raw)
        if (parsed.kind !== 'ok') return parsed
        status = { id: 'tn-1', title: parsed.spec.title, task: parsed.spec.task, root: '/repo', check: parsed.spec.check.command, itemId: parsed.spec.itemId, state: 'running', startedAt: 0,
          entrants: parsed.spec.entrants.map((e) => ({ id: e.id, label: e.label, backend: e.backend, ...(e.model ? { model: e.model } : {}), panelId: e.panelId, sessionId: `s-${e.id}`, path: `/wt/${e.panelId}`, worktreeId: `wt-${e.id}`, state: 'running', costUsd: 0, checkFailures: 0 })) }
        return { kind: 'started', status }
      },
      stop: async () => true,
      status: async () => status
    } } }
    let items = [{ ...ITEM, panelId: 'c1' }]
    let panels = [Pn.makeWorkPanel('w1', { x: 0, y: 0 }, 1, 'wk1', 'ISO weeks'), Pn.makeChatPanel('c1', { x: 600, y: 0 }, 2, { cwd: '/repo/lane', sessionId: 's0' })]
    const deps = {
      panelsRef: { get current() { return panels }, set current(v) { panels = v } },
      setPanels: (fn) => { panels = typeof fn === 'function' ? fn(panels) : fn },
      commitHistory: () => {},
      workItemsRef: { get current() { return items }, set current(v) { items = v } },
      setWorkItems: (v) => { items = v },
      nextIdRef: { current: 10 }, mergedRef: { current: false },
      placer: () => (_cur, made) => made,
      hostRef: { current: null }, viewportRef: { current: { x: 0, y: 0, scale: 1 } },
      presetRowsRef: { current: [{ agent: 'claude-code', available: true }, { agent: 'codex', available: true }] },
      closePanel: (pid) => { closed.push(pid); panels = panels.filter((p) => p.rect.id !== pid) }
    }
    const run = verbMod.mod.tournamentVerb(deps)
    const started = await run('w1')
    const chats = panels.filter((p) => p.kind === 'chat' && p.rect.id !== 'c1')
    const cardLinks = panels.find((p) => p.rect.id === 'w1').links ?? []
    const linked = chats.every((c) => cardLinks.some((l) => l.to === c.rect.id && l.label === 'entrant'))
    status = { ...status, state: 'done', entrants: status.entrants.map((e) => ({ ...e, state: e.id === 'b' ? 'checked' : 'stuck', endedAt: 1, diff: { files: ['x'], added: 1, removed: 0 } })) }
    status.score = T.scoreTournament(status.entrants.map(T.outcomeOf))
    const loser = await run('pick', 'a')
    const picked = await run('pick')
    const item = items.find((i) => i.id === 'wk1')
    const fresh = await (verbMod.mod.tournamentVerb({ ...deps, workItemsRef: { current: [{ ...ITEM, panelId: undefined }] } }))('wk1')
    const pass = started.kind === 'ran' && sent[0].itemId === 'wk1' && sent[0].root === '/repo/lane' && sent[0].entrants.map((e) => e.panelId).join() === 'c10,c11,c12' &&
      chats.length === 3 && chats.every((c) => c.chat.dispatch === true && c.chat.cwd.startsWith('/wt/')) && chats[0].chat.agentOptions.model === 'opus' && chats[2].chat.backend === 'codex' && linked &&
      loser.kind === 'refused' && picked.kind === 'ran' && closed.sort().join() === 'c10,c12' && item.panelId === 'c11' && item.worktreeId === 'wt-b' &&
      fresh.kind === 'refused' && /start this task once/.test(fresh.reason)
    ok(id, pass, JSON.stringify({ started, loser, picked, closed, item: { panelId: item.panelId, worktreeId: item.worktreeId }, fresh }).slice(0, 400))
  } catch (error) {
    ok(id, false, error.stack)
  } finally {
    delete globalThis.window
  }
})()

// ── M549 — the judge and combine ──────────────────────────────────────────
const JUDGED = () => {
  const T = model.mod
  const entrants = [
    { id: 'a', label: 'claude · opus', backend: 'claude', panelId: 'c1', branch: 'tc/a', path: '/wt/a', state: 'checked', costUsd: 1, checkFailures: 0, startedAt: 0, endedAt: 1, diff: { files: ['x'], added: 5, removed: 0 } },
    { id: 'b', label: 'codex', backend: 'codex', panelId: 'c2', branch: 'tc/b', path: '/wt/b', state: 'checked', costUsd: null, checkFailures: 0, startedAt: 0, endedAt: 1, diff: { files: ['x', 'y'], added: 9, removed: 2 } },
    { id: 'c', label: 'claude · sonnet', backend: 'claude', panelId: 'c3', branch: 'tc/c', path: '/wt/c', state: 'stuck', costUsd: 1, checkFailures: 3, startedAt: 0, endedAt: 1, diff: { files: ['z'], added: 1, removed: 0 } }]
  return { id: 'tn', title: 'ENG-7', task: 'Parse ISO weeks', root: '/repo', check: 'npm test', itemId: 'wk1', state: 'done', startedAt: 0, entrants, score: T.scoreTournament(entrants.map(T.outcomeOf)) }
}

// tournament.judge.1. The judge runs only over a scored field with two or
//      more passes; its message lists the PASSING entrants only (a failed
//      run's code is not a candidate), names the check, and says to change
//      nothing.
check('tournament.judge.1 the judge needs two passing entrants, and its message lists only those, names the check and forbids any change', model, (T) => {
  const st = JUDGED()
  const prompt = T.judgePrompt(st)
  const one = { ...st, score: T.scoreTournament(st.entrants.slice(0, 1).concat(st.entrants[2]).map(T.outcomeOf)) }
  return {
    pass: T.judgeRefusal(st) === null && /only one entrant passed/.test(T.judgeRefusal(one)) && /still running/.test(T.judgeRefusal({ ...st, score: undefined, state: 'running' })) &&
      prompt.includes('/wt/a') && prompt.includes('/wt/b') && !prompt.includes('/wt/c') && !prompt.includes('sonnet') && prompt.includes('`npm test`') && /Change nothing/.test(prompt) && /Combine/.test(prompt),
    detail: prompt.slice(0, 300)
  }
})

// tournament.judge.2. The judge's chat is read-only (plan mode) at the main
//      tree, linked from the card, and is sent the prompt; combine opens the
//      task's focus view rather than a second merge path.
const judgeCheck = async () => {
  const id = 'tournament.judge.2 the judge is a plan-mode chat at the main tree, linked from the card and sent the comparison; combine opens the task\'s focus view'
  if (verbMod.mod === undefined || panelsMod.mod === undefined || model.mod === undefined) { ok(id, false, verbMod.error ?? panelsMod.error); return }
  const Pn = panelsMod.mod
  try {
    const created = []
    const sentMsgs = []
    const focused = []
    const st = JUDGED()
    globalThis.window = { canvas: {
      tournament: { status: async () => st, start: async () => ({ kind: 'refused', reason: 'x' }), stop: async () => false },
      agentSession: { create: async (spec) => { created.push(spec); return { kind: 'created', snapshot: {} } }, send: async (pid, text) => { sentMsgs.push({ pid, text }); return 'sent' } }
    } }
    globalThis.crypto ??= require('node:crypto').webcrypto
    let panels = [Pn.makeWorkPanel('w1', { x: 0, y: 0 }, 1, 'wk1', 'ISO weeks')]
    const run = verbMod.mod.tournamentVerb({
      panelsRef: { get current() { return panels }, set current(v) { panels = v } },
      setPanels: (fn) => { panels = typeof fn === 'function' ? fn(panels) : fn }, commitHistory: () => {},
      workItemsRef: { current: [ITEM] }, setWorkItems: () => {}, nextIdRef: { current: 20 }, mergedRef: { current: false },
      placer: () => (_cur, made) => made, hostRef: { current: null }, viewportRef: { current: { x: 0, y: 0, scale: 1 } },
      presetRowsRef: { current: [{ agent: 'claude-code', available: true }] }, closePanel: () => {}, focusItem: (iid) => focused.push(iid)
    })
    const judged = await run('judge')
    const chat = panels.find((p) => p.rect.id === 'c20')
    const combined = await run('combine')
    const link = (panels.find((p) => p.rect.id === 'w1').links ?? []).find((l) => l.to === 'c20')
    const pass = judged.kind === 'ran' && created.length === 1 && created[0].cwd === '/repo' && created[0].agentOptions.permissionMode === 'plan' &&
      chat !== undefined && chat.chat.agentOptions.permissionMode === 'plan' && link?.label === 'judge' && sentMsgs.length === 1 && sentMsgs[0].pid === 'c20' && sentMsgs[0].text === model.mod.judgePrompt(st) &&
      combined.kind === 'ran' && focused.join() === 'wk1'
    ok(id, pass, JSON.stringify({ judged, created, combined, focused }).slice(0, 400))
  } catch (error) {
    ok(id, false, error.stack)
  } finally {
    delete globalThis.window
  }
}

;(async () => {
  await runnerChecks
  await diffCheck
  await verbCheck
  await judgeCheck()
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length > 0) process.exit(1)
})()
