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

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length > 0) process.exit(1)
