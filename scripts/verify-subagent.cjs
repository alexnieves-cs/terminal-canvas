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

// ---------------------------------------------------------------------------
// 15-20. The watcher, against a FAKE filesystem. subagent-watch.ts takes its
// reads as injected deps for the reason review-engine.ts takes its GitRunner:
// the whole state machine is drivable with no real ~/.claude in earshot.

const fakeFs = (tree) => {
  // tree: { 'path': ['file', ...] } for listings, { 'path': 'text' } for files.
  const reads = []
  return {
    reads,
    listDirs: (p) => (tree.dirs[p] ?? null),
    listFiles: (p) => (tree.files[p] ?? null),
    readText: (p) => { reads.push(p); return tree.text[p] ?? null },
    readFrom: (p, from) => {
      const t = tree.text[p]
      if (t === undefined) return null
      reads.push(`${p}@${from}`)
      return { text: t.slice(from), end: t.length }
    },
    sizeOf: (p) => (tree.text[p] === undefined ? null : tree.text[p].length),
    projectsRoot: '/root',
    now: () => 1000
  }
}

const META = (id, tool) => JSON.stringify({
  agentType: 'general-purpose', description: `d-${id}`,
  toolUseId: tool, spawnDepth: 1, model: 'sonnet'
})

const tree1 = () => ({
  dirs: { '/root/-repo': [{ name: 'S1', createdAt: 500 }] },
  files: { '/root/-repo/S1/subagents': ['agent-a1.meta.json', 'agent-a1.jsonl'] },
  text: {
    '/root/-repo/S1/subagents/agent-a1.meta.json': META('a1', 'toolu_01A'),
    '/root/-repo/S1.jsonl': JSON.stringify({ type: 'user', cwd: '/repo' }) + '\n'
  }
})

{
  const w = new S.SubagentWatch(fakeFs(tree1()))
  const out = w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  ok('15 a meta file in subagents/ becomes one running record',
    out.length === 1 && out[0].panelId === 'n1' && out[0].records.length === 1 &&
      out[0].records[0].state === 'running' && out[0].records[0].description === 'd-a1',
    JSON.stringify(out))
}

// THE DEDUPE, and it is the design rather than an optimisation. Its failure
// changes no pixel — it shows up as heat — so the only thing that can ever
// notice it is a check that COUNTS. A second poll with nothing changed must
// report nothing at all.
{
  const w = new S.SubagentWatch(fakeFs(tree1()))
  w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  const again = w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  ok('16 an unchanged second poll reports NOTHING', again.length === 0, JSON.stringify(again))
}

// The confirmation read. A session whose own transcript records a DIFFERENT
// cwd is not this panel's, however well the slug matched — which is what makes
// slugFor safe to be wrong about.
{
  const t = tree1()
  t.text['/root/-repo/S1.jsonl'] = JSON.stringify({ type: 'user', cwd: '/somewhere/else' }) + '\n'
  const w = new S.SubagentWatch(fakeFs(t))
  const out = w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  ok('17 a session whose recorded cwd disagrees is not claimed',
    out.length === 0 || out[0].records.length === 0, JSON.stringify(out))
}

// Completion, through the tail read.
{
  const t = tree1()
  const w = new S.SubagentWatch(fakeFs(t))
  w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  t.text['/root/-repo/S1.jsonl'] +=
    JSON.stringify({ message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_01A' }] } }) + '\n'
  const out = w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  ok('18 a tool_result appended to the parent transcript moves the record to done',
    out.length === 1 && out[0].records[0].state === 'done', JSON.stringify(out))
}

// The offset. Re-reading a megabyte every 2s is invisible on screen and shows
// up only as heat, so this asserts the READ ARGUMENT rather than an outcome —
// the one place the cost is observable at all.
{
  const t = tree1()
  const fs = fakeFs(t)
  const w = new S.SubagentWatch(fs)
  w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  const before = t.text['/root/-repo/S1.jsonl'].length
  t.text['/root/-repo/S1.jsonl'] += 'x'
  fs.reads.length = 0
  w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  ok('19 the second read starts at the previous EOF, not at 0',
    fs.reads.some((r) => r === `/root/-repo/S1.jsonl@${before}`) &&
      !fs.reads.some((r) => r === '/root/-repo/S1.jsonl@0'),
    fs.reads.join(' '))
}

// The ambiguity refusal reaching the watcher, and reported as a FLAG rather
// than as silence: an absent feature must not look like a broken one.
{
  const w = new S.SubagentWatch(fakeFs(tree1()))
  const out = w.poll([
    { panelId: 'n1', cwd: '/repo', spawnedAt: 100 },
    { panelId: 'n2', cwd: '/repo', spawnedAt: 100 }
  ])
  ok('20 two panels in one repository each report ambiguous with no records',
    out.length === 2 && out.every((o) => o.ambiguous === true && o.records.length === 0),
    JSON.stringify(out))
}

// Ambiguity is a STEADY state, not a transient one — two panels sitting in
// one repository is an ordinary, long-lived configuration, so re-announcing
// it every 2s tick for the life of the app is precisely the failure the
// dedupe exists to prevent. Same argument as check 16, reached through the
// arm check 16 does not cover: an undeduped implementation would report both
// panels ambiguous on EVERY poll forever, and that failure has no pixel — it
// is only ever visible as heat.
{
  const w = new S.SubagentWatch(fakeFs(tree1()))
  const panels = [
    { panelId: 'n1', cwd: '/repo', spawnedAt: 100 },
    { panelId: 'n2', cwd: '/repo', spawnedAt: 100 }
  ]
  const first = w.poll(panels)
  const second = w.poll(panels)
  ok('21 an unbroken run of ambiguous ticks reports ONCE, not on every poll',
    first.length === 2 && first.every((o) => o.ambiguous === true) && second.length === 0,
    JSON.stringify({ first, second }))
}

// 22. clearDedupe() versus clear() -- the split R8 exists for. detachAll()'s
// Cmd+R path is a RE-SEND trigger, not a teardown: main's PtyManager and the
// tmux sessions it holds both survive a reload, only the renderer's store is
// empty, so it must forget the DEDUPE and nothing else. Dropping the CLAIM
// too (clear()'s job) would force the next poll to re-derive it from the
// REATTACHING create() call's new, later spawnedAt -- and chooseSession only
// accepts a session directory created ON OR AFTER spawnedAt, which the real
// one, predating the reload, no longer is. A panel's subagents would vanish
// at the first Cmd+R and never come back for the life of that panel, with
// nothing in any log -- the exact failure this milestone is supposed to be
// about, and a real defect this suite's own instructions once specified by
// mistake (a global clear() call where a clearDedupe() belonged).
//
// The second poll is deliberately given a LATER spawnedAt -- exactly what a
// reattach produces -- so a clear() mislabelled as clearDedupe() is caught
// rather than accidentally passing: with the claim gone, poll() would have
// to re-claim, chooseSession would reject the now-too-old session directory
// against the later spawnedAt, and the panel would report NOTHING. A correct
// clearDedupe() never re-claims at all -- the existing claim is reused
// untouched -- so the later spawnedAt changes nothing about its answer. Both
// halves are asserted in one condition, because either alone passes against
// the wrong implementation: a bare clear() satisfies "reports again" only by
// accident (it does not, here -- it reports nothing) but a check that only
// asked "did SOMETHING come back" would not say which behaviour it saw.
{
  const w = new S.SubagentWatch(fakeFs(tree1()))
  const first = w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 100 }])
  w.clearDedupe()
  const second = w.poll([{ panelId: 'n1', cwd: '/repo', spawnedAt: 600 }])
  ok('22 clearDedupe() forgets the dedupe (reports again) but keeps the claim (same record survives a later spawnedAt)',
    first.length === 1 && first[0].records.length === 1 &&
      second.length === 1 && second[0].records.length === 1 &&
      second[0].records[0].toolUseId === first[0].records[0].toolUseId,
    JSON.stringify({ first, second }))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
process.exit(failed.length ? 1 : 0)
