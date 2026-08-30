/* Verifies the pure half of M13's subagent detection.
   Run with: npm run verify:subagent

   Plain node: subagent-scan.ts imports nothing at all, so the milestone's
   most easily-wrong piece — a slug mapping inferred from directory names, and
   a refusal that must not refuse everything — sits in the fastest tier. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'out', 'verify', 'subagent.cjs')
buildSync({
  entryPoints: [join(__dirname, 'subagent-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Nothing in this bundle imports from @shared today. Carried pre-emptively
  // for the reason CLAUDE.md records about verify-palette.cjs: needing no
  // alias YET is exactly the state verify-viewport.cjs was in until it broke.
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const S = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

// 1-3. The slug. Every expectation here is a REAL directory name observed
// under ~/.claude/projects, not a guess about the rule — the rule was inferred
// from them, so restating them is what keeps the inference honest.
ok('1 a plain path slugs to its dashed form',
  S.slugFor('/Users/me/Documents/terminal-canvas') === '-Users-me-Documents-terminal-canvas',
  S.slugFor('/Users/me/Documents/terminal-canvas'))

// A dot becomes a dash, which is why a worktree path yields a DOUBLE dash at
// `/.claude`. This is the case a naive `split('/').join('-')` gets wrong, and
// it is the common one in this repo: every worktree lives under `.claude`.
ok('2 a dot becomes a dash, so /.claude yields a double dash',
  S.slugFor('/Users/me/tc/.claude/worktrees/m13') === '-Users-me-tc--claude-worktrees-m13',
  S.slugFor('/Users/me/tc/.claude/worktrees/m13'))

ok('3 digits survive, so a numbered path is not mangled',
  S.slugFor('/private/tmp/claude-501/x') === '-private-tmp-claude-501-x',
  S.slugFor('/private/tmp/claude-501/x'))

// 4-6. parseMeta. The format belongs to Claude Code, not to this repo, so
// tolerance is the requirement and not defensiveness.
{
  const good = JSON.stringify({
    agentType: 'general-purpose', description: 'Review Task 5',
    toolUseId: 'toolu_01A', spawnDepth: 1, model: 'sonnet'
  })
  const m = S.parseMeta(good)
  ok('4 a well-formed meta parses to every field',
    m !== null && m.agentType === 'general-purpose' && m.description === 'Review Task 5' &&
      m.toolUseId === 'toolu_01A' && m.spawnDepth === 1 && m.model === 'sonnet',
    JSON.stringify(m))
}

// An UNKNOWN extra field must be ignored rather than rejected. This is the
// forward-compatibility half: Claude Code will add fields, and a parser that
// refused an unfamiliar one would turn every future release into "the feature
// stopped working" with nothing saying why.
{
  const m = S.parseMeta(JSON.stringify({
    agentType: 'explore', description: 'd', toolUseId: 't', spawnDepth: 2,
    model: 'haiku', somethingNew: { nested: true }
  }))
  ok('5 an unknown extra field is ignored, not rejected',
    m !== null && m.agentType === 'explore' && m.spawnDepth === 2, JSON.stringify(m))
}

// The other direction, and the one that matters on disk: a meta MISSING the
// toolUseId cannot ever be completed, so it is dropped rather than carried as
// a node that would say `running` forever. Non-JSON is dropped for the same
// reason. Neither may throw — this runs per file per tick.
ok('6 a meta with no toolUseId is dropped, and malformed JSON is dropped, without throwing',
  S.parseMeta(JSON.stringify({ agentType: 'a', description: 'd' })) === null &&
    S.parseMeta('{not json') === null && S.parseMeta('') === null)

// 7. cwdOf — the confirmation read. The slug is a HINT derived from an
// undocumented mapping; this is what makes being wrong about it harmless.
ok('7 cwdOf reads the cwd off a transcript line, and answers null for a line without one',
  S.cwdOf(JSON.stringify({ type: 'user', cwd: '/repo/x', sessionId: 's' })) === '/repo/x' &&
    S.cwdOf(JSON.stringify({ type: 'summary' })) === null &&
    S.cwdOf('garbage') === null)

// 8-10. chooseSession.
{
  const dirs = [
    { name: 'old-session', createdAt: 100 },
    { name: 'new-session', createdAt: 300 },
    { name: 'newest-session', createdAt: 400 }
  ]
  ok('8 the most recent session that post-dates the spawn wins',
    S.chooseSession(dirs, 200) === 'newest-session', S.chooseSession(dirs, 200))

  // The pre-spawn exclusion is the half that stops a panel adopting the
  // session of whatever ran in that directory yesterday — which would attach
  // a stranger's finished subagents to a panel that has spawned nothing.
  ok('9 a session created BEFORE the panel spawned is never claimed',
    S.chooseSession([{ name: 'old-session', createdAt: 100 }], 200) === null)

  ok('10 no directories at all is null, not a throw',
    S.chooseSession([], 200) === null)
}

// 11-12. attributable — the refusal, and the guard against over-correcting.
// The map is panelId -> slug; a null slug is a panel with no directory to
// resolve (a plain shell), which must not make its neighbours ambiguous.
{
  const two = new Map([['n1', '-repo'], ['n2', '-repo'], ['n3', '-other']])
  const allowed = S.attributable(two)
  ok('11 two panels in one repository attribute to NEITHER, while a third elsewhere is unaffected',
    !allowed.has('n1') && !allowed.has('n2') && allowed.has('n3'),
    [...allowed].join(','))
}

// THE OVER-CORRECTION GUARD, and the reason 11 is not enough on its own: an
// implementation that refuses everything satisfies 11 perfectly and ships a
// feature that never once produces a node. Same shape as verify:review 37b.
{
  const one = new Map([['n1', '-repo'], ['n2', null], ['n3', null]])
  const allowed = S.attributable(one)
  ok('12 a single panel in a repository IS attributed — the refusal must not refuse everything',
    allowed.has('n1') && allowed.size === 1, [...allowed].join(','))
}

// 13-14. scanForResults. The discriminating clause is that a tool_use is NOT
// a completion: the same toolUseId appears twice in a parent transcript, once
// when the subagent is spawned and once when it ends, so a scanner matching
// the bare id would mark every subagent done the instant it started — a node
// that is never once seen running, which is the whole feature.
{
  const ids = new Set(['toolu_01A', 'toolu_01B'])
  const spawnLine = JSON.stringify({
    message: { content: [{ type: 'tool_use', id: 'toolu_01A', name: 'Task' }] }
  })
  ok('13 a tool_use carrying the id is NOT a completion',
    S.scanForResults(spawnLine, ids).size === 0)

  const resultLine = JSON.stringify({
    message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_01A' }] }
  })
  const found = S.scanForResults(spawnLine + '\n' + resultLine, ids)
  ok('14 a tool_result completes exactly its own id and no other',
    found.has('toolu_01A') && !found.has('toolu_01B'), [...found].join(','))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
