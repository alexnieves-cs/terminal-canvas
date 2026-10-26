/* Run with: node scripts/verify-fork.cjs
   Lane K (M556–M560): fork from any turn (docs/streams/bold.md). Plain node:
   the pure half (src/shared/turn-fork.ts) is driven with fixtures, and the
   half that runs git (src/main/turn-forks.ts) against a REAL temporary
   repository — git's own answers are the point of a snapshot check — with a
   fake claude folder and fake transcripts. No Electron, no CLI, no network.
   Every check reports even when its module fails to load. */
const { buildSync } = require('esbuild')
const { execFile, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '..')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ALIAS = { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }
function load(entry, name) {
  try {
    const outfile = join(ROOT, 'out/verify', `fork-${name}.cjs`)
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
const read = (rel) => fs.readFileSync(join(ROOT, rel), 'utf8')

const pure = load('src/shared/turn-fork.ts', 'pure')
const forks = load('src/main/turn-forks.ts', 'main')
const backends = load('src/shared/agent-backends.ts', 'backends')
const settings = load('src/shared/settings-schema.ts', 'settings')

const SHA = 'a'.repeat(40)
const user = (id, text, at, extra = {}) => ({ id, role: 'user', blocks: [{ type: 'text', text }], at, ...extra })
const said = (id, text, at) => ({ id, role: 'assistant', blocks: [{ type: 'text', text }], at })
const toolResult = (id, at) => ({ id, role: 'user', blocks: [{ type: 'tool_result', toolUseId: 't', content: 'ok' }], at })

// fork.ref.1. A snapshot is a hidden ref named by panel and turn, and a panel
//      id that is not app-shaped is refused rather than escaped into a ref.
check('fork.ref.1 a snapshot is refs/tc/turns/<panel>/<n>, never under refs/heads, and an odd panel id is refused', pure, (P) => {
  const ref = P.turnRef('c12', 3)
  const odd = ['../x', 'a b', '', 'c1/2', 'x'.repeat(65)].map(P.refSafePanelId)
  return { pass: ref === 'refs/tc/turns/c12/3' && !ref.startsWith('refs/heads') && P.refSafePanelId('c12') && odd.every((v) => v === false), detail: { ref, odd } }
})

// fork.ref.2. for-each-ref's lines parse to rows in turn order; another
//      panel's refs, a non-number leaf and a bad sha each cost themselves.
check('fork.ref.2 parseTurnRefs reads this panel\'s refs in turn order and drops what is not one', pure, (P) => {
  const out = [
    `refs/tc/turns/c1/10 ${SHA} 1700000010`,
    `refs/tc/turns/c1/2 ${SHA} 1700000002`,
    `refs/tc/turns/c12/1 ${SHA} 1700000001`,
    `refs/tc/turns/c1/x ${SHA} 1`,
    'refs/tc/turns/c1/3 nothex 1',
    ''
  ].join('\n')
  const rows = P.parseTurnRefs(out, 'c1')
  return { pass: rows.length === 2 && rows[0].turn === 2 && rows[1].turn === 10 && rows[0].at === 1700000002000, detail: rows }
})

// fork.prune.1. M560: a capture drops every snapshot past the turn it wrote
//      (that future did not happen) and the oldest past the cap.
check('fork.prune.1 a capture of turn n prunes every turn past n and the oldest beyond the cap', pure, (P) => {
  const rows = (ns) => ns.map((turn) => ({ turn, commit: SHA, at: 0 }))
  const past = P.prunePlan(rows([1, 2, 3, 4, 5]), 3)
  const capped = P.prunePlan(rows([1, 2, 3, 4]), 5, 3)
  const quiet = P.prunePlan(rows([1, 2]), 3)
  return { pass: JSON.stringify(past) === '[4,5]' && JSON.stringify(capped) === '[1,2]' && quiet.length === 0 && P.TURN_SNAPSHOT_CAP === 50, detail: { past, capped, quiet } }
})

// fork.cut.1. A turn is a prompt a person typed and the agent was handed: a
//      tool result, a queued or undelivered message is never one, and the
//      cut keeps everything before the (n+1)th prompt.
check('fork.cut.1 promptCount and cutTurns count delivered typed prompts only, and cut before the next one', pure, (P) => {
  const turns = [user('u1', 'one', 1), said('a1', 'ok', 2), toolResult('tr', 3), said('a1b', 'done', 4), user('u2', 'two', 5), said('a2', 'ok', 6), user('q', 'later', 7, { delivery: 'queued' })]
  const cut = P.cutTurns(turns, 1).map((t) => t.id)
  const all = P.cutTurns(turns, 9).map((t) => t.id)
  return { pass: P.promptCount(turns) === 2 && JSON.stringify(cut) === '["u1","a1","tr","a1b"]' && !all.includes('q') && all.length === 6 && P.frameTurn(turns.slice(0, 5)) === 2, detail: { cut, all } }
})

// fork.cut.2. claude's own JSONL is cut before the (n+1)th prompt by the
//      import's rule, and every record is re-addressed to the fork.
const JSONL = [
  { type: 'user', sessionId: 'old', cwd: '/repo', uuid: '1', message: { role: 'user', content: 'first prompt' } },
  { type: 'assistant', sessionId: 'old', cwd: '/repo', uuid: '2', message: { id: 'm1', role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } },
  { type: 'user', sessionId: 'old', cwd: '/repo', uuid: '3', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x' }] } },
  { type: 'user', sessionId: 'old', cwd: '/repo', uuid: '3m', isMeta: true, message: { role: 'user', content: 'a note the CLI injected' } },
  { type: 'user', sessionId: 'old', cwd: '/repo', uuid: '3s', isSidechain: true, message: { role: 'user', content: 'a subagent prompt' } },
  { type: 'assistant', sessionId: 'old', cwd: '/repo', uuid: '4', message: { id: 'm2', role: 'assistant', content: [{ type: 'text', text: 'done one' }] } },
  { type: 'user', sessionId: 'old', cwd: '/repo', uuid: '5', message: { role: 'user', content: [{ type: 'text', text: 'second prompt' }] } },
  { type: 'assistant', sessionId: 'old', cwd: '/repo', uuid: '6', message: { id: 'm3', role: 'assistant', content: [{ type: 'text', text: 'done two' }] } }
].map((r) => JSON.stringify(r)).join('\n') + '\nnot json\n'
check('fork.cut.2 claude\'s transcript is cut before the next typed prompt, tool results, notes and subagents are not prompts, and every record names the fork', pure, (P) => {
  const one = P.cutClaudeTranscript(JSONL, 1, 'new-id', '/fork')
  const lines = one.text.trim().split('\n').map((l) => JSON.parse(l))
  const two = P.cutClaudeTranscript(JSONL, 2, 'new-id', '/fork')
  return {
    pass: one.prompts === 1 && lines.length === 6 && lines.every((r) => r.sessionId === 'new-id' && r.cwd === '/fork') && lines[5].uuid === '4' &&
      two.prompts === 2 && two.text.trim().split('\n').pop() === 'not json',
    detail: { one: { prompts: one.prompts, lines: lines.map((r) => r.uuid) }, two: two.prompts }
  }
})

check('fork.slug.1 claude\'s project folder for a cwd turns every non-alphanumeric into a dash', pure, (P) => ({
  pass: P.claudeProjectSlug('/Users/a/my.repo_x') === '-Users-a-my-repo-x', detail: P.claudeProjectSlug('/Users/a/my.repo_x')
}))

// fork.words.1. The words name MESSAGES (the sheet's own counter counts both
//      sides), and an inexact tree or a tree-only fork is said, never hidden.
check('fork.words.1 a fork says which message its files and its conversation come from, and says an earlier snapshot or a fresh conversation', pure, (P) => {
  const base = { kind: 'forked', cwd: '/w', branch: 'tc/fork-c1-t3-x', sessionId: 's', turns: 4 }
  const exact = P.forkWords({ ...base, fromTurn: 3, exactTree: true, conversation: 'resumed' }, 3)
  const near = P.forkWords({ ...base, fromTurn: 2, exactTree: false, conversation: 'tree-only' }, 3)
  const no = P.forkWords({ kind: 'refused', reason: 'why' }, 3)
  return {
    pass: /after message 3/.test(exact) && /continues from message 3/.test(exact) && /message 2, the nearest snapshot before message 3/.test(near) && /starts fresh/.test(near) && no === 'Could not branch: why',
    detail: { exact, near, no }
  }
})

check('fork.snap.1 snapshotFor picks the turn itself, else the latest before it, else nothing', pure, (P) => {
  const rows = [1, 2, 5].map((turn) => ({ turn, commit: SHA, at: 0 }))
  const a = P.snapshotFor(rows, 2); const b = P.snapshotFor(rows, 4); const c = P.snapshotFor(rows.slice(2), 3)
  return { pass: a.exact && a.row.turn === 2 && !b.exact && b.row.turn === 2 && c === null, detail: { a, b, c } }
})

// fork.backend.1. "A backend is a row": only a CLI whose transcript main can
//      cut and resume forks the conversation; the rest fork the files.
check('fork.backend.1 only claude\'s row forks the conversation; every other backend forks the files only', backends, (B) => {
  const rows = B.BACKEND_IDS.map((id) => [id, B.BACKENDS[id].forksTurns])
  return { pass: rows.every(([id, v]) => typeof v === 'boolean' && v === (id === 'claude')), detail: rows }
})

// fork.setting.1. Off by default: a snapshot writes into the person's repository.
check('fork.setting.1 "Snapshot each agent turn" exists and is off by default', settings, (S) => {
  const def = S.SETTINGS.find((s) => s.id === 'agents.turnSnapshots')
  return { pass: def !== undefined && def.type === 'boolean' && def.default === false, detail: def }
})

// fork.wire.*. The doors, read as text: one capture on each result, one drop
//      on each close, the bridge, and the sheet's button.
const runtimeSrc = read('src/main/bootstrap/agent-runtime.ts')
const handlersSrc = read('src/main/bootstrap/agent-handlers.ts')
const sheetSrc = read('src/renderer/replay/ReplaySheet.tsx')
const canvasSrc = read('src/renderer/canvas/Canvas.tsx')
ok('fork.wire.1 a result captures the turn, named by the transcript\'s prompts, only with the setting on',
  /event\.type === 'result'[\s\S]{0,900}getSetting\('agents\.turnSnapshots'\) === true[\s\S]{0,200}turnForks\.capture\(event\.id, expandTilde\(snap\.cwd\), promptCount\(agentTranscripts\.read\(event\.id\)\.turns\)\)/.test(runtimeSrc),
  'agent-runtime.ts no longer captures on result as the check expects')
ok('fork.wire.2 closing a chat (drop) removes its snapshots, reading the cwd before the dispose forgets it',
  /const cwd = state\.agents\?\.get\(id\)\?\.cwd\s*\n\s*if \(drop && cwd !== undefined\) void stores\.turnForks\.drop\(id, expandTilde\(cwd\)\)\s*\n\s*state\.agents\?\.dispose\(id\)/.test(handlersSrc),
  'agent-handlers.ts dispose no longer drops snapshots first')
ok('fork.wire.3 Replay has Branch from here, and the canvas registers the verb that places the fork',
  /Branch from here/.test(sheetSrc) && /branchFromHere\(props\.panelId, props\.turn\)/.test(sheetSrc) && /useForkVerb\(\{/.test(canvasSrc),
  'ReplaySheet.tsx or Canvas.tsx no longer carries the branch door')

// ── The git half, against a real repository ──────────────────────────────
const tmp = fs.mkdtempSync(join(os.tmpdir(), 'tc-fork-'))
const repo = join(tmp, 'repo')
const GIT_ENV = { ...process.env, HOME: tmp, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'f@x.invalid', GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'f@x.invalid' }
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { env: GIT_ENV, encoding: 'utf8' }).trim()
// The runner the app injects, shaped as review-engine.ts's GitRunner. The
// fixture identity is REMOVED from the env here, so commit-tree's own
// identity is what the snapshot check sees.
const runner = (args, opts) => new Promise((done) => {
  const env = { ...process.env, HOME: tmp, GIT_CONFIG_NOSYSTEM: '1', ...(opts && opts.env ? opts.env : {}) }
  execFile('git', args, { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
    done({ stdout: stdout || '', stderr: stderr || '', ok: error === null, notFound: error !== null && error.code === 'ENOENT', code: error === null ? 0 : typeof error.code === 'number' ? error.code : -1 })
  })
})

fs.mkdirSync(repo, { recursive: true })
git('init', '-q', '-b', 'main')
fs.writeFileSync(join(repo, 'a.txt'), 'one\n')
fs.writeFileSync(join(repo, '.gitignore'), 'secret.log\n')
git('add', '-A'); git('commit', '-q', '-m', 'base')

let enabled = true
let sessionFor = { c1: { cwd: repo, sessionId: 'sess-1', backend: 'claude' }, c2: { cwd: repo, sessionId: 'sess-2', backend: 'codex' } }
const transcripts = new Map()
transcripts.set('c1', [user('u1', 'first prompt', 1), said('a1', 'done one', 2), user('u2', 'second prompt', 3), said('a2', 'done two', 4)])
transcripts.set('c2', [user('u1', 'codex prompt', 1), said('a1', 'done', 2)])
const projects = join(tmp, 'claude-projects')
fs.mkdirSync(join(projects, 'old-slug'), { recursive: true })
fs.writeFileSync(join(projects, 'old-slug', 'sess-1.jsonl'), JSONL)
const worktreeRecords = []
let sid = 0
const deps = () => ({
  run: runner,
  enabled: () => enabled,
  worktreesDir: join(tmp, 'worktrees'),
  addWorktree: (r) => worktreeRecords.push(r),
  session: (id) => sessionFor[id],
  transcripts: {
    read: (id) => ({ turns: transcripts.get(id) || [] }),
    appendTurn: (id, t) => { transcripts.set(id, [...(transcripts.get(id) || []), t]) },
    drop: (id) => { transcripts.delete(id) }
  },
  claude: { find: (s) => { const p = join(projects, 'old-slug', `${s}.jsonl`); return fs.existsSync(p) ? p : undefined }, projectsDir: projects },
  fs: {
    readText: (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return undefined } },
    writeText: (p, t) => fs.writeFileSync(p, t, { flag: 'wx' }),
    copy: (a, b) => { try { fs.copyFileSync(a, b); return true } catch { return false } },
    remove: (p) => fs.rmSync(p, { force: true }),
    mkdirp: (p) => fs.mkdirSync(p, { recursive: true }),
    exists: (p) => fs.existsSync(p)
  },
  tmpDir: tmp,
  newSessionId: () => `fork-sess-${++sid}`,
  mintId: () => `wt-${sid}-${Math.random().toString(16).slice(2, 8)}`,
  now: () => new Date(2026, 9, 26, 9, 5)
})

const stateOf = () => ({
  head: git('rev-parse', 'HEAD'),
  branch: git('symbolic-ref', '--short', 'HEAD'),
  index: fs.readFileSync(join(repo, '.git', 'index')).toString('hex'),
  stash: git('stash', 'list'),
  status: git('status', '--porcelain'),
  branches: git('branch', '--list')
})

;(async () => {
  if (forks.mod === undefined) {
    for (const id of ['fork.capture.1', 'fork.capture.2', 'fork.capture.3', 'fork.capture.4', 'fork.fork.1', 'fork.fork.2', 'fork.fork.3', 'fork.drop.1']) ok(id, false, forks.error)
  } else {
    const T = forks.mod.createTurnForks(deps())
    try {
      // capture.1 — off writes nothing; on writes the ref.
      enabled = false
      await T.capture('c1', repo, 1)
      const offRefs = git('for-each-ref', 'refs/tc')
      enabled = true
      // An edit to a tracked file, a new untracked file and an ignored one.
      fs.writeFileSync(join(repo, 'a.txt'), 'one\nturn one\n')
      fs.writeFileSync(join(repo, 'new.txt'), 'made in turn one\n')
      fs.writeFileSync(join(repo, 'secret.log'), 'ignored\n')
      git('stash', 'list')
      const before = stateOf()
      await T.capture('c1', repo, 1)
      const after = stateOf()
      const snap1 = git('rev-parse', 'refs/tc/turns/c1/1')
      const files1 = git('ls-tree', '-r', '--name-only', snap1).split('\n')
      const author = git('log', '-1', '--format=%an <%ae>', snap1)
      ok('fork.capture.1 with the setting off a result writes nothing; on, the turn is a commit under refs/tc/turns, authored as the app, holding the edit and the new file but not the ignored one',
        offRefs === '' && files1.includes('new.txt') && !files1.includes('secret.log') && git('show', `${snap1}:a.txt`) === 'one\nturn one' && author === 'Terminal Canvas <turns@terminal-canvas.invalid>' && git('rev-parse', `${snap1}^`) === before.head,
        JSON.stringify({ offRefs, files1, author }))
      ok('fork.capture.2 a capture leaves the branch, HEAD, the index, the stash, the working tree and the branch list exactly as they were',
        JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before: { ...before, index: before.index.length }, after: { ...after, index: after.index.length } }))

      // capture.3 — an unchanged tree reuses the commit; a change chains on the last snapshot.
      await T.capture('c1', repo, 2)
      const snap2 = git('rev-parse', 'refs/tc/turns/c1/2')
      fs.writeFileSync(join(repo, 'a.txt'), 'one\nturn one\nturn three\n')
      await T.capture('c1', repo, 3)
      const snap3 = git('rev-parse', 'refs/tc/turns/c1/3')
      ok('fork.capture.3 a turn that changed nothing reuses the last snapshot\'s commit; a turn that did chains a new one on it',
        snap2 === snap1 && snap3 !== snap2 && git('rev-parse', `${snap3}^`) === snap2, JSON.stringify({ snap1, snap2, snap3 }))

      // capture.4 — concurrent captures serialise; a lower turn prunes the higher.
      await Promise.all([T.capture('c9', repo, 1), T.capture('c9', repo, 2), T.capture('c9', repo, 3)])
      const c9 = (await T.list('c9', repo)).map((r) => r.turn)
      await T.capture('c9', repo, 1)
      const c9After = (await T.list('c9', repo)).map((r) => r.turn)
      ok('fork.capture.4 three captures at once all land, and capturing turn 1 again (a recycled id) removes turns 2 and 3',
        JSON.stringify(c9) === '[1,2,3]' && JSON.stringify(c9After) === '[1]', JSON.stringify({ c9, c9After }))

      // fork.1 — a fork at turn 1: worktree at the snapshot, conversation cut, claude's copy written.
      const f = await T.fork({ fromPanelId: 'c1', toPanelId: 'c50', turn: 1 })
      const wtFile = f.kind === 'forked' ? fs.readFileSync(join(f.cwd, 'a.txt'), 'utf8') : ''
      const copied = f.kind === 'forked' ? join(projects, '-' + f.cwd.slice(1).replace(/[^A-Za-z0-9]/g, '-'), `${f.sessionId}.jsonl`) : ''
      const copy = copied !== '' && fs.existsSync(copied) ? fs.readFileSync(copied, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l) } catch { return l } }) : []
      const forkTurns = (transcripts.get('c50') || []).map((t) => t.id)
      const branchHead = f.kind === 'forked' ? git('rev-parse', f.branch) : ''
      ok('fork.fork.1 a fork at message 1 is a new worktree on its own branch at that snapshot, its panel holds the conversation to message 1, and claude\'s copy is cut there under a new id in the fork\'s folder',
        f.kind === 'forked' && f.exactTree && f.fromTurn === 1 && f.conversation === 'resumed' && wtFile === 'one\nturn one\n' && fs.existsSync(join(f.cwd, 'new.txt')) &&
          branchHead === snap1 && /^tc\/fork-c1-t1-20261026-0905$/.test(f.branch) && JSON.stringify(forkTurns) === '["u1","a1"]' &&
          copy.length === 6 && copy.every((r) => r.sessionId === f.sessionId && r.cwd === f.cwd) &&
          worktreeRecords.length === 1 && worktreeRecords[0].panelId === 'c50' && worktreeRecords[0].branch === f.branch &&
          git('symbolic-ref', '--short', 'HEAD') === 'main',
        JSON.stringify({ f, wtFile, forkTurns, copy: copy.length, rec: worktreeRecords[0] }))

      // fork.2 — a turn with no snapshot of its own builds on the nearest and says so; codex forks files only.
      await T.capture('c2', repo, 1)
      const near = await T.fork({ fromPanelId: 'c1', toPanelId: 'c51', turn: 5 })
      const codex = await T.fork({ fromPanelId: 'c2', toPanelId: 'c52', turn: 1 })
      ok('fork.fork.2 message 5 with no snapshot of its own branches from message 3 and says so; a codex chat forks its files and starts a fresh conversation',
        near.kind === 'forked' && !near.exactTree && near.fromTurn === 3 && codex.kind === 'forked' && codex.conversation === 'tree-only' && codex.exactTree,
        JSON.stringify({ near, codex }))

      // fork.3 — refusals by name.
      enabled = false
      const off = await T.fork({ fromPanelId: 'c7', toPanelId: 'c53', turn: 1 })
      sessionFor = { ...sessionFor, c7: { cwd: repo, sessionId: 's7', backend: 'claude' }, c8: { cwd: tmp, sessionId: 's8', backend: 'claude' } }
      const offSnap = await T.fork({ fromPanelId: 'c7', toPanelId: 'c53', turn: 1 })
      const notRepo = await T.fork({ fromPanelId: 'c8', toPanelId: 'c54', turn: 1 })
      const zero = await T.fork({ fromPanelId: 'c1', toPanelId: 'c55', turn: 0 })
      const bad = await T.fork({ fromPanelId: '../c1', toPanelId: 'c56', turn: 1 })
      enabled = true
      ok('fork.fork.3 a fork is refused by name: no live session, snapshots off, not a repository, no answered message, an odd panel id',
        off.kind === 'refused' && /not running/.test(off.reason) && offSnap.kind === 'refused' && /Snapshot each agent turn/.test(offSnap.reason) &&
          notRepo.kind === 'refused' && /not inside a git repository/.test(notRepo.reason) && zero.kind === 'refused' && bad.kind === 'refused',
        JSON.stringify({ off, offSnap, notRepo, zero, bad }))

      // drop.1 — M560: closing removes every snapshot of that panel, and only that panel's.
      const removed = await T.drop('c1', repo)
      ok('fork.drop.1 closing a chat removes all its snapshots and leaves another panel\'s',
        removed === 3 && (await T.list('c1', repo)).length === 0 && (await T.list('c2', repo)).length === 1, JSON.stringify({ removed }))
    } catch (error) {
      ok('fork.git harness', false, error.stack)
    }
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
  if (results.some((r) => !r.pass)) process.exitCode = 1
})()
