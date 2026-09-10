/* Verifies M100's Places — a teammate's authority over the filesystem as an
   explicit list of approved folders, checked in MAIN before any spawn
   resolves a cwd (the file verbs are the user's own and carry no teammate).
   Run with: npm run verify:teammates

   Plain node over a FAKE realpath. The three traversal cases are the whole
   milestone: `..` walking out, a symlink inside a place pointing out, and a
   relative path resolved against the wrong root. M87's broker learned the
   first one the hard way (`%2e%2e` under the Jira prefix) — every check
   here runs on the NORMALISED, REAL path, never the typed one. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync } = require('node:fs')

const OUT = join(__dirname, '..', 'out', 'verify', 'teammates.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'teammates-entry.cjs')],
  outfile: OUT, bundle: true, platform: 'node', format: 'cjs',
  external: ['electron', 'node-pty'],
  alias: { '@shared': join(__dirname, '..', 'src', 'shared'), '@renderer': join(__dirname, '..', 'src', 'renderer') }
})
const M = require(OUT)
const P = M.places, T = M.teammates, G = M.gate, S = M.skills, A = M.assign, W = M.scope
const { readFileSync } = require('node:fs')

const { ok, results } = require('./lib/checks.cjs').createChecks()

/* A fake filesystem: realpath resolves the one symlink and collapses `..`;
   anything under /nowhere does not exist. */
const LINKS = { '/home/u/work/api/link': '/etc', '/home/u/work/api/inner': '/home/u/work/api/src' }
const realpath = (p) => {
  const { posix } = require('node:path')
  const norm = posix.normalize(p)
  for (const [from, to] of Object.entries(LINKS)) if (norm === from || norm.startsWith(from + '/')) return to + norm.slice(from.length)
  if (norm.startsWith('/nowhere')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  return norm
}
const PLACES = ['/home/u/work/api', '/home/u/notes/']

;(async () => {
  // places.1 — `..` walks out. The typed path looks like it is under the
  // place; the normalised one is not.
  {
    const inside = P.insidePlace('/home/u/work/api/src/index.ts', PLACES, realpath)
    const dotdot = P.insidePlace('/home/u/work/api/../../.ssh/id_rsa', PLACES, realpath)
    const sneaky = P.insidePlace('/home/u/work/api/src/../../api2/x', PLACES, realpath)
    const prefix = P.insidePlace('/home/u/work/api2/x', PLACES, realpath)
    const exact = P.insidePlace('/home/u/work/api', PLACES, realpath)
    const trailing = P.insidePlace('/home/u/notes/plan.md', PLACES, realpath)
    ok('places.1 a path under a place is inside; `..` walking out is not, even when the typed prefix matches; a sibling sharing the place\'s prefix as a string (api2) is not; the place itself is; a place written with a trailing slash still holds its files',
      inside === true && dotdot === false && sneaky === false && prefix === false && exact === true && trailing === true,
      JSON.stringify({ inside, dotdot, sneaky, prefix, exact, trailing }))
  }
  // places.2 — a symlink inside the place pointing OUT resolves out; one
  // pointing within stays within.
  {
    const out = P.insidePlace('/home/u/work/api/link/passwd', PLACES, realpath)
    const within = P.insidePlace('/home/u/work/api/inner/a.ts', PLACES, realpath)
    ok('places.2 a symlink inside a place that points outside it is OUTSIDE (the real path decides); one that points within is inside',
      out === false && within === true, JSON.stringify({ out, within }))
  }
  // places.3 — a relative path is REFUSED, never resolved against any root.
  {
    const rel = P.insidePlace('api/src', PLACES, realpath)
    const tilde = P.insidePlace('~/work/api/src', PLACES, realpath)
    const dot = P.insidePlace('./src', PLACES, realpath)
    ok('places.3 a relative path, a `~` path and a `./` path are outside every place — never resolved against cwd, home or the place',
      rel === false && tilde === false && dot === false, JSON.stringify({ rel, tilde, dot }))
  }
  // places.4 — no places is NO filesystem, never everything; a path that does
  // not exist is outside (nothing to grant).
  {
    const none = P.insidePlace('/home/u/work/api/src', [], realpath)
    const missing = P.insidePlace('/nowhere/x', PLACES, realpath)
    ok('places.4 a teammate with no places may touch nothing; a path that does not exist is outside',
      none === false && missing === false, JSON.stringify({ none, missing }))
  }
  // gate.1 — the gate answers by NAME with the fix, and is what main asks
  // BEFORE resolving a cwd: a refusal carries the place to add.
  {
    const ada = { id: 't1', name: 'ada', brief: 'x', places: ['/home/u/work/api'], services: [], skills: [], memory: 'ada', chats: [], messaging: false, scheduling: false }
    const gate = G.createPlacesGate({ realpath, teammate: (id) => (id === 't1' ? ada : undefined) })
    const okAns = gate.check('t1', '/home/u/work/api/src')
    const bad = gate.check('t1', '/home/u/.ssh')
    const unknown = gate.check('t9', '/home/u/work/api')
    const noId = gate.check(undefined, '/anywhere')
    ok('gate.1 the gate allows a path inside, refuses one outside naming the teammate, the path and the fix (add <folder> to this teammate\'s places), refuses an unknown teammate by name, and lets a request with NO teammate through untouched (a plain panel is the user\'s own hands)',
      okAns.ok === true && bad.ok === false && /ada/.test(bad.reason) && /\.ssh/.test(bad.reason) && /add .*places/.test(bad.reason) &&
        unknown.ok === false && /t9/.test(unknown.reason) && noId.ok === true,
      JSON.stringify({ okAns, bad, unknown, noId }))
  }
  // M114 — dispatch.1. THE LANE RULE. A worktree lane lives under
  // userData/worktrees, outside every place BY CONSTRUCTION; the place that
  // matters is the repository the lane forks. The gate judges a known lane
  // by its record's ROOT and names the root, never the lane path, in a
  // refusal — a sentence about /Library/Application Support/… would send the
  // user to add a folder no teammate should ever have.
  {
    const ada = { id: 't1', name: 'ada', brief: 'x', places: ['/home/u/work'], services: [], skills: [], memory: 'ada', chats: [], messaging: false, scheduling: false }
    const bo = { id: 't2', name: 'bo', brief: 'x', places: ['/elsewhere'], services: [], skills: [], memory: 'bo', chats: [], messaging: false, scheduling: false }
    const lanes = { '/app/worktrees/lane': '/home/u/work/api' }
    const rp = (p) => { if (p.startsWith('/app/worktrees/lane') || p.startsWith('/home/u/work') || p.startsWith('/elsewhere')) return p; return realpath(p) }
    let inside, outside, plain
    try {
      const gate = G.createPlacesGate({ realpath: rp, teammate: (id) => (id === 't1' ? ada : id === 't2' ? bo : undefined), worktreeRootOf: (p) => lanes[p] })
      inside = gate.check('t1', '/app/worktrees/lane')
      outside = gate.check('t2', '/app/worktrees/lane')
      plain = gate.check('t1', '/app/worktrees/other')
    } catch (e) { inside = { ok: false, reason: String(e) } }
    ok('dispatch.1 a lane whose repository root is inside a place passes; one whose root is not is refused naming the ROOT and never the lane path; a path that is no known lane is judged as itself',
      inside && inside.ok === true && outside && outside.ok === false && /\/home\/u\/work\/api/.test(outside.reason) && !/worktrees/.test(outside.reason) && plain && plain.ok === false && /worktrees\/other/.test(plain.reason),
      JSON.stringify({ inside, outside, plain }))
  }
  // M196 (D04) — dispatch.2. THE GATE ON THE SEGMENT RULE, AND THE FENCE THAT
  //      PROVES IT DID NOT LOOSEN.
  //      `worktreeRootOf` was exact path equality at all three of main's
  //      wiring sites, so an agent whose shell had stepped one directory into
  //      its own lane was judged as standing in its own repository — the lane
  //      translated for its root and for nothing below it, while the renderer
  //      answered the same question with a segment prefix.
  //      The widening fence is the second arm and it is the reason this check
  //      exists at all: translating a subdirectory must reach the RECORD's
  //      root and no further, so a teammate whose places do not hold that
  //      repository is refused below a lane exactly as they are at it. The
  //      third arm is the prefix decoy: `<lane>x` is NOT in `<lane>`, and a
  //      bare startsWith would translate an unrecorded directory to the lane's
  //      repository and then ALLOW it, because that repository is in the
  //      teammate's places. That is the widening this rule must not have.
  {
    const ada = { id: 't1', name: 'ada', brief: 'x', places: ['/home/u/work'], services: [], skills: [], memory: 'ada', chats: [], messaging: false, scheduling: false }
    const bo = { id: 't2', name: 'bo', brief: 'x', places: ['/elsewhere'], services: [], skills: [], memory: 'bo', chats: [], messaging: false, scheduling: false }
    // ONE record on purpose. `/app/worktrees/lanex` is a directory this app
    // knows nothing about whose path shares a prefix with the lane's; under a
    // bare startsWith it translates to the lane's repository, which IS in
    // ada's places, so the gate would answer ok for a folder no record covers.
    // A second record for it would let the longest match rescue the wrong rule.
    const records = [{ id: 'w1', path: '/app/worktrees/lane', root: '/home/u/work/api', branch: 'tc/p1' }]
    // A symlink an agent working IN the lane can create. `/etc` is outside
    // every place, and the gate must see that — the lane translation must not
    // reach it first.
    const ESCAPE = '/app/worktrees/lane/evil'
    const rp = (p) => {
      if (p === ESCAPE || p.startsWith(`${ESCAPE}/`)) return p.replace(ESCAPE, '/etc')
      if (p.startsWith('/app/worktrees/') || p.startsWith('/home/u/work') || p.startsWith('/elsewhere')) return p
      return realpath(p)
    }
    let below, belowRefused, decoy, escape, threw = null
    try {
      // main's own wiring, verbatim: laneOfPath over the records.
      // main's own wiring, verbatim: the REAL path, matched against records
      // whose own paths are real too.
      const laneRootOf = (path) => {
        const real = (q) => { try { return rp(q) } catch { return q } }
        const r = W.laneOfPath(real(path), records.map((x) => ({ ...x, path: real(x.path) })))
        return r === undefined ? undefined : r.root
      }
      const gate = G.createPlacesGate({ realpath: rp, teammate: (id) => (id === 't1' ? ada : id === 't2' ? bo : undefined), worktreeRootOf: laneRootOf })
      below = gate.check('t1', '/app/worktrees/lane/src/api')
      belowRefused = gate.check('t2', '/app/worktrees/lane/src/api')
      decoy = gate.check('t1', '/app/worktrees/lanex/src')
      escape = gate.check('t1', ESCAPE)
    } catch (e) { threw = String(e) }
    ok('dispatch.2 a cwd BELOW a lane translates to the lane record\'s repository and passes for a teammate whose places hold it; the SAME cwd is refused for a teammate whose places do not, naming the repository and never the lane path (the no-widening fence); an unrecorded directory sharing a path prefix with the lane translates to NOTHING and is judged as itself; and a SYMLINK inside the lane pointing OUT of every place is refused, because the translation matches on the real path and never on the string the caller wrote',
      threw === null &&
        below && below.ok === true &&
        belowRefused && belowRefused.ok === false && /\/home\/u\/work\/api/.test(belowRefused.reason) && !/worktrees/.test(belowRefused.reason) &&
        decoy && decoy.ok === false && /worktrees\/lanex/.test(decoy.reason) &&
        escape && escape.ok === false,
      JSON.stringify({ threw, below, belowRefused, decoy, escape }))
  }
  // M120 — sandbox.1. A teammate has places; a chat with no folder has none.
  // The refusal is ONE sentence in one place (`sandboxTeammateRefusal`), asked
  // by agent:create before anything is made.
  {
    let both, alone, threw = null
    try { both = G.sandboxTeammateRefusal({ sandbox: true, teammateId: 't1' }); alone = G.sandboxTeammateRefusal({ sandbox: true }) } catch (e) { threw = String(e) }
    ok('sandbox.1 a sandboxed chat under a teammate is refused with the sentence naming both; a sandboxed chat alone is not',
      threw === null && typeof both === 'string' && /places/.test(both) && /no folder/.test(both) && alone === null, JSON.stringify({ threw, both, alone }))
  }
  // record.1 — the copy helper: an absent optional stays absent; the
  // required lists are always arrays.
  {
    const t = T.carryTeammate({ id: 't1', name: 'ada', brief: '', places: ['/a'], services: [], skills: [], memory: 'ada', chats: [], messaging: false, scheduling: true })
    const empty = T.emptyTeammate('t2', 'bo')
    ok('record.1 carryTeammate copies every list by value and writes no undefined key; emptyTeammate has no places, no services, no schedule, and its memory slug is its id',
      t.places.join() === '/a' && t.scheduling === true && Object.values(t).every((v) => v !== undefined) &&
        empty.places.length === 0 && empty.services.length === 0 && empty.scheduling === false && empty.memory === 't2' && T.TEAMMATES_MAX > 0,
      JSON.stringify({ t, empty }))
  }
  // M131 — assign.1. The brief append happens ONCE and in main; a
  // project-scoped skill outside the teammate's places is dropped from the
  // brief and refused BY NAME at the assign door, naming the REPOSITORY
  // (the actionable fix) and never a worktree path; an unknown teammate is
  // refused; carryTeammate writes no undefined skills key.
  {
    const src = readFileSync(join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8')
    const mainAppendCount = (src.match(/skillsBriefLine\(skillsForBrief\(/g) ?? []).length
    ok('assign.1a the brief append happens ONCE and in main', mainAppendCount === 1,
      'M100: main appends the brief from its own roster on every spawn — never a renderer copy')

    const key = S.skillKey('project', 'plan')
    const worktreePath = '/Users/u/Library/Application Support/tc/userData/worktrees/lane-1'
    const repoRoot = '/home/u/work/api'
    const ada = { id: 't1', name: 'ada', brief: '', places: ['/home/u/notes'], services: [], memory: 'ada', chats: [], messaging: false, scheduling: false, skills: [key] }

    const brief = A.skillsForBrief(ada, repoRoot, realpath)
    ok('assign.1f a project-scoped skill outside the teammate\'s places is dropped from the brief, never named to the agent',
      brief.named.length === 0 && brief.refused.length === 1 && brief.refused[0].name === 'plan' && brief.refused[0].repoRoot === repoRoot,
      JSON.stringify(brief))

    const refusal = A.assignRefusal('project', repoRoot, ada, realpath)
    ok('assign.1b a project-scoped skill outside the teammate places refuses BY NAME',
      typeof refusal === 'string' && refusal.includes(repoRoot) && !refusal.includes(worktreePath) && refusal.includes('ada'),
      'M114: a refusal must not name a path nobody should add')
    ok('assign.1c the refusal names the REPOSITORY, which is the actionable fix', refusal.includes(repoRoot), refusal)

    // Inside the teammate's places: named, not refused.
    const bo = { ...ada, id: 't2', name: 'bo', places: [repoRoot] }
    const briefBo = A.skillsForBrief(bo, repoRoot, realpath)
    ok('assign.1g a project-scoped skill INSIDE the teammate\'s places is named to the agent',
      briefBo.named.length === 1 && briefBo.named[0] === 'plan' && briefBo.refused.length === 0, JSON.stringify(briefBo))
    ok('assign.1h no refusal when the repository is inside the teammate\'s places',
      A.assignRefusal('project', repoRoot, bo, realpath) === null, '')

    const assignTo = (id) => A.assignSkillsToTeammate([ada, bo], id, [key])
    ok('assign.1d an unknown teammate is refused', assignTo('ghost').ok === false, '')
    const assigned = assignTo('t2')
    ok('assign.1i assigning to a known teammate returns the whole next record with the key present',
      assigned.ok === true && assigned.teammate.skills.includes(key), JSON.stringify(assigned))

    const carried = T.carryTeammate({ id: 'a', name: 'ada', brief: '', places: [], services: [], memory: 'a', chats: [], messaging: false, scheduling: false })
    ok('assign.1e carryTeammate writes no undefined skills key',
      !('skills' in carried), 'an absent optional field stays absent through every copy site')
    const carriedWith = T.carryTeammate({ ...carried, skills: [key] })
    ok('assign.1j a PRESENT skills list is carried by value', Array.isArray(carriedWith.skills) && carriedWith.skills[0] === key, JSON.stringify(carriedWith))

    // fix round 1 — assign.1k. A teammate chat's cwd is often a worktree
    // LANE (M113's board dispatch), never the repository; `repoRootForBrief`
    // must translate it through the SAME `worktreeRootOf` shape
    // `placesGate` uses, or a project skill whose repository IS in the
    // teammate's places is dropped from the brief for a reason nobody could
    // see — and WITHOUT the translation it is dropped.
    const lanePath = '/Users/u/Library/Application Support/tc/userData/worktrees/lane-1'
    const worktreeRootOf = (p) => (p === lanePath ? repoRoot : undefined)
    const translated = A.repoRootForBrief(lanePath, worktreeRootOf)
    ok('assign.1k1 repoRootForBrief translates a worktree lane to its repository root', translated === repoRoot, translated)
    const briefViaLane = A.skillsForBrief(bo, translated, realpath)
    ok('assign.1k2 a project-scoped skill IS named when the lane\'s repository is inside the teammate\'s places',
      briefViaLane.named.length === 1 && briefViaLane.named[0] === 'plan', JSON.stringify(briefViaLane))
    const briefWithoutTranslation = A.skillsForBrief(bo, lanePath, realpath)
    ok('assign.1k3 WITHOUT the translation the same skill is dropped — the lane path is outside every place by construction',
      briefWithoutTranslation.named.length === 0 && briefWithoutTranslation.refused.length === 1, JSON.stringify(briefWithoutTranslation))

    // fix round 2 — assign.1l. `teammate:save`'s response carries
    // `notVisible` for a refused key and NO key at all otherwise (absent,
    // never an empty array written for its own sake).
    const notVisible = A.notVisibleFor(ada, repoRoot, realpath)
    ok('assign.1l1 notVisibleFor reports a refused project-scoped key', notVisible.length === 1 && notVisible[0].name === 'plan' && notVisible[0].repoRoot === repoRoot, JSON.stringify(notVisible))
    const noneVisible = A.notVisibleFor(bo, repoRoot, realpath)
    ok('assign.1l2 notVisibleFor reports nothing when every key is visible', noneVisible.length === 0, JSON.stringify(noneVisible))
    const saveResponse = (t, root) => { const nv = A.notVisibleFor(t, root, realpath); return nv.length > 0 ? { teammate: t, notVisible: nv } : { teammate: t } }
    ok('assign.1l3 the save response carries notVisible for a refused key', 'notVisible' in saveResponse(ada, repoRoot), '')
    ok('assign.1l4 the save response carries NO notVisible key at all when nothing is hidden', !('notVisible' in saveResponse(bo, repoRoot)), '')
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
