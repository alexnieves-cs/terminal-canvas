/* Verifies M316: interrupted work is recoverable at the TASK level.
   Run with: npm run verify:jobs

   Plain node. The pool caller is driven with a fake agents seam and a fake
   mint (verify:agent-session pool.2 already proves the caller against the
   engine), the journal is the REAL file store against a tmpdir, and a
   "crash" is exactly what a crash leaves: the caller dropped mid-flight and
   a new store built from the same file, the way the next launch builds one.

   Every check here guards a failure that is SILENT in a running app: a
   finished item sent again, a mid-turn item retried as if nothing ran, a
   job that says `running` for a process that is gone, a closed window that
   interrupts turns already paid for. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')

const OUT = join(__dirname, '..', 'out', 'verify', 'jobs.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'jobs-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  alias: { '@shared': join(__dirname, '..', 'src', 'shared'), '@renderer': join(__dirname, '..', 'src', 'renderer') }
})
const M = require(OUT)
const { ok, results } = require('./lib/checks.cjs').createChecks()
const tick = (ms) => new Promise((r) => setTimeout(r, ms))

const poolNode = (width) => ({ kind: 'pool', width, list: '/fake/list.txt', prompt: 'do it', cwd: '/repo', dx: 0, dy: 0 })
const fakeAgents = () => {
  const subs = []
  const a = {
    sends: [], interrupts: [], sendWord: 'sent', onSend: null,
    send: (id, text) => { if (a.onSend) a.onSend(id); a.sends.push([id, text]); return a.sendWord },
    interrupt: (id) => { a.interrupts.push(id); return true },
    subscribe: (cb) => { subs.push(cb); return () => { subs.splice(subs.indexOf(cb), 1) } },
    emit: (e) => { for (const cb of [...subs]) cb(e) }
  }
  return a
}
let clock = 1000
const now = () => ++clock
const freshFile = () => join(mkdtempSync(join(tmpdir(), 'tc-jobs-')), 'jobs.json')
let ids = 0
const journalOver = (store, repo) => ({
  get: (id) => store.get(id), put: (j) => store.put(j), update: (id, f) => store.update(id, f),
  newId: () => `job-${++ids}`, now, ...(repo === undefined ? {} : { repoMark: async () => repo })
})
/** A caller with the journal, a fake agents seam and a counting mint. */
const callerOver = (store, opts = {}) => {
  const agents = fakeAgents(); const events = []; const mints = []; let n = opts.firstWorker ?? 0
  const caller = M.poolCaller.createPoolCaller({
    agents,
    mint: opts.mint ?? (async (req) => { mints.push(req.item); return { kind: 'ok', id: `w${++n}` } }),
    readList: () => ({ kind: 'ok', items: opts.items ?? ['a', 'b', 'c', 'd', 'e'] }),
    limits: () => ({ maxConcurrent: opts.max ?? 2, budgetUsd: 0 }), spend: () => 0,
    emit: (e) => events.push(e),
    journal: journalOver(store, opts.repo)
  })
  return { caller, agents, events, mints }
}
const doorsOver = (store, caller, transcripts = {}, repoNow = null) => M.recovery.createJobHandlers({
  store, pool: () => caller, transcript: (id) => transcripts[id] ?? null, repoNow: async () => repoNow, now
})

;(async () => {
  const J = M.journal

  // ---- jobs.parse.1 — the reader drops a job whole rather than guess an attempt.
  {
    const good = J.newJob({ id: 'j', templateId: 't', key: 'p', node: { prompt: 'x', list: '/l', cwd: '/r', width: 2 }, items: ['a', 'b'], at: 1 })
    const withAttempt = J.attemptSending(J.attemptMinted(J.attemptMinting(good, 0, 2), 0, 'w1', 3), 0, 4)
    const round = J.parseJournal(JSON.parse(JSON.stringify({ version: 1, jobs: [withAttempt] })))
    const torn = JSON.parse(JSON.stringify({ version: 1, jobs: [withAttempt, good] }))
    torn.jobs[0].items[0].attempts[0].outcome = 'maybe'
    const afterTorn = J.parseJournal(torn)
    ok('jobs.parse.1 the journal reads whole: a round trip keeps the attempt (worker, sentAt, outcome), an attempt with an unknown outcome drops ITS job and only its job, and a wrong version is an empty journal',
      round.length === 1 && round[0].items[0].attempts[0].workerId === 'w1' && round[0].items[0].attempts[0].sentAt === 4 && round[0].items[0].attempts[0].outcome === 'running' &&
        afterTorn.length === 1 && afterTorn[0].id === 'j' && afterTorn[0].items[0].attempts.length === 0 &&
        J.parseJournal({ version: 2, jobs: [good] }).length === 0 && J.parseJournal(null).length === 0,
      JSON.stringify({ round, afterTorn }))
  }

  // ---- jobs.send-first.1 — the send is journalled BEFORE it is made.
  {
    const store = M.store.createJobStore({ file: freshFile(), now })
    const { caller, agents } = callerOver(store, { items: ['a'] })
    const seen = []
    agents.onSend = (id) => {
      const job = store.all()[0]
      const a = job.items[0].attempts[0]
      seen.push({ id, outcome: a.outcome, sent: a.sentAt !== undefined, worker: a.workerId })
    }
    const started = caller.start({ templateId: 't', key: 'p', node: poolNode(2) })
    await tick(10)
    ok('jobs.send-first.1 at the moment the manager is asked to send, the journal ON DISK already says the attempt is running with its worker and sentAt — a crash between the two can only over-report a send, never hide one',
      started.kind === 'started' && typeof started.jobId === 'string' && seen.length === 1 && seen[0].outcome === 'running' && seen[0].sent && seen[0].worker === 'w1',
      JSON.stringify({ started, seen }))
  }

  // ---- A crash mid-job: 5 items, 2 wide. a finishes; b is mid-turn; c is minted
  // and sent; d/e never started. The caller is dropped (the process died) and
  // the next launch builds its store from the same file.
  const crashFile = freshFile()
  let crashJobId
  {
    const store = M.store.createJobStore({ file: crashFile, now })
    const { caller, agents } = callerOver(store, { repo: { head: 'aaaaaaa1111', dirty: 0 } })
    const started = caller.start({ templateId: 't', key: 'pool', node: poolNode(2) })
    crashJobId = started.jobId
    await tick(10)
    agents.emit({ id: 'w1', type: 'status', status: 'ready' })
    await tick(10)
    const before = store.get(crashJobId)
    ok('jobs.journal.1 while it runs the record keeps every item in list order with its attempts: a finished (evidence: the manager\'s ready), b and c running with their workers, d and e never attempted, and the repository mark taken at the start',
      before.state === 'running' && before.items.map((i) => i.index).join() === '0,1,2,3,4' &&
        before.items[0].attempts[0].outcome === 'finished' && before.items[0].attempts[0].evidence?.source === 'event' &&
        before.items[1].attempts[0].outcome === 'running' && before.items[1].attempts[0].workerId === 'w2' &&
        before.items[2].attempts[0].outcome === 'running' && before.items[2].attempts[0].workerId === 'w3' &&
        before.items[3].attempts.length === 0 && before.items[4].attempts.length === 0 && before.repoAtStart?.head === 'aaaaaaa1111',
      JSON.stringify(before))
  }
  {
    const store = M.store.createJobStore({ file: crashFile, now })
    const job = store.get(crashJobId)
    const onDisk = J.parseJournal(JSON.parse(readFileSync(crashFile, 'utf8')))[0]
    ok('jobs.restart.1 the next launch converts the saved `running` at construction and writes it back: the job is interrupted by the restart, its open attempts end interrupted, the finished one stays finished',
      job.state === 'interrupted' && job.interruptedBy === 'restart' && onDisk.state === 'interrupted' &&
        job.items[0].attempts[0].outcome === 'finished' && job.items[1].attempts[0].outcome === 'interrupted' && job.items[1].attempts[0].sentAt !== undefined,
      JSON.stringify(job))
    const doors = doorsOver(store, M.poolCaller.createPoolCaller({ agents: fakeAgents(), mint: async () => ({ kind: 'refused', reason: 'x' }), readList: () => ({ kind: 'error', why: 'x' }), limits: () => ({ maxConcurrent: 0, budgetUsd: 0 }), spend: () => 0, emit: () => {} }), { w3: { turns: 1, costUsd: 0.2 } }, { head: 'bbbbbbb2222', dirty: 3 })
    const [account] = await doors.list()
    const statusOf = (item) => account.items.find((i) => i.item === item)?.status
    ok('jobs.reconcile.1 the account asks the transcripts before trusting the file: c\'s worker recorded a finished turn, so c is done (found in its transcript) and written back; b was sent and has no result, so it needs a person; d and e are pending; the repository line names HEAD moving and the uncommitted count',
      account !== undefined && statusOf('a') === 'done' && statusOf('c') === 'done' && /transcript/.test(account.items[2].note) &&
        statusOf('b') === 'needs-you' && statusOf('d') === 'pending' && statusOf('e') === 'pending' &&
        store.get(crashJobId).items[2].attempts[0].evidence?.source === 'transcript' &&
        account.lines.some((l) => /aaaaaaa → bbbbbbb/.test(l) && /3 uncommitted changes/.test(l)) &&
        account.lines.some((l) => /1 item was mid-turn and may have changed files/.test(l)) &&
        account.choices.join() === 'continue,retry,abandon' && !account.live,
      JSON.stringify(account))
    const plainRetry = await doors.recover({ jobId: crashJobId, choice: 'retry' })
    const namedFinished = await doors.recover({ jobId: crashJobId, choice: 'retry', items: [1, 0] })
    ok('jobs.no-repeat.1 a plain retry refuses when the only failed item was SENT (it may have changed files — name it), and naming a finished item refuses the WHOLE plan by name',
      plainRetry.kind === 'refused' && /name the ones/.test(plainRetry.reason) &&
        namedFinished.kind === 'refused' && /already finished/.test(namedFinished.reason),
      JSON.stringify({ plainRetry, namedFinished }))

    // Continue in the NEW process: only d and e are minted.
    const next = callerOver(store, { firstWorker: 10 })
    const nextDoors = doorsOver(store, next.caller, { w3: { turns: 1 } })
    const cont = await nextDoors.recover({ jobId: crashJobId, choice: 'continue' })
    await tick(10)
    const again = await nextDoors.recover({ jobId: crashJobId, choice: 'continue' })
    ok('jobs.continue.1 continue after the restart mints ONLY the items that never started (d, e) — never a, never c, never the mid-turn b — and a second continue while it runs is refused, not doubled',
      cont.kind === 'ok' && /continuing 2 items/.test(cont.sentence) && next.mints.join() === 'd,e' &&
        next.agents.sends.every(([, text]) => !/Item: (a|b|c)$/.test(text)) && again.kind === 'refused',
      JSON.stringify({ cont, again, mints: next.mints, sends: next.agents.sends }))
    next.agents.emit({ id: 'w11', type: 'status', status: 'ready' })
    next.agents.emit({ id: 'w12', type: 'status', status: 'ready' })
    await tick(10)
    const afterContinue = store.get(crashJobId)
    const named = await nextDoors.recover({ jobId: crashJobId, choice: 'retry', items: [1] })
    await tick(10)
    next.agents.emit({ id: 'w13', type: 'status', status: 'ready' })
    await tick(10)
    const settled = store.get(crashJobId)
    const listed = await nextDoors.list()
    ok('jobs.retry.1 a pool that ran out of the items it was GIVEN leaves the job incomplete while b is unresolved; retrying b BY NAME runs b alone as its second attempt, and the job is then done and leaves the list',
      afterContinue.state === 'incomplete' && named.kind === 'ok' && next.mints.join() === 'd,e,b' &&
        settled.state === 'done' && settled.items[1].attempts.length === 2 && settled.items[1].attempts[1].outcome === 'finished' &&
        settled.passes === 3 && listed.length === 0,
      JSON.stringify({ afterContinue: afterContinue.state, named, mints: next.mints, settled }))
  }

  // ---- jobs.mint-crash.1 — interrupted worker CREATION: the app dies while the
  // renderer is minting. Nothing was sent, so the item is safe to retry.
  {
    const file = freshFile()
    const store = M.store.createJobStore({ file, now })
    const { caller } = callerOver(store, { items: ['x', 'y'], mint: () => new Promise(() => {}) })
    const { jobId } = caller.start({ templateId: 't', key: 'mint', node: poolNode(2) })
    await tick(10)
    const mid = store.get(jobId).items[0].attempts[0]
    const reborn = M.store.createJobStore({ file, now })
    const doors = doorsOver(reborn, null)
    const [account] = await doors.list()
    const plan = J.recoveryPlan(reborn.get(jobId), false, 'retry')
    ok('jobs.mint-crash.1 a crash while a worker was being MADE leaves the attempt `minting` with no worker and no send; after the restart that item is safe to retry without naming it (the plain retry covers it alone), and y — never asked for, the engine mints one at a time — is pending for continue',
      mid.outcome === 'minting' && mid.workerId === undefined && account.counts['safe-retry'] === 1 && account.counts.pending === 1 &&
        account.choices.includes('retry') && account.choices.includes('continue') && plan.kind === 'ok' && plan.indices.join() === '0' && /never reached a worker/.test(account.lines.join(' ')),
      JSON.stringify({ mid, account, plan }))
  }

  // ---- jobs.window.1 — the window closes mid-job: the next mint cannot be
  // answered. Workers already in flight DRAIN — never interrupted — and the
  // job is live (reconnect) until they end; then continue picks up the rest.
  {
    const store = M.store.createJobStore({ file: freshFile(), now })
    let windowOpen = true; let n = 0; const mints = []
    const { caller, agents, events } = callerOver(store, {
      items: ['a', 'b', 'c', 'd'],
      mint: async (req) => (windowOpen ? (mints.push(req.item), { kind: 'ok', id: `w${++n}` }) : { kind: 'refused', reason: 'no window to mint the worker in' })
    })
    const { jobId } = caller.start({ templateId: 't', key: 'win', node: poolNode(2) })
    await tick(10)
    windowOpen = false
    agents.emit({ id: 'w1', type: 'status', status: 'ready' })
    await tick(10)
    const doors = doorsOver(store, caller)
    const [whileDraining] = await doors.list()
    const replayFrom = events.length
    const reconnect = await doors.recover({ jobId, choice: 'reconnect' })
    const replayed = events.slice(replayFrom).map((e) => `${e.event.kind}:${e.event.item ?? e.event.id}`)
    agents.emit({ id: 'w2', type: 'status', status: 'ready' })
    await tick(10)
    const [afterDrain] = await doors.list()
    const job = store.get(jobId)
    ok('jobs.window.1 a mint the closed window cannot answer ends the pool WITHOUT interrupting w2 (in flight): while it drains the job is live with reconnect only, reconnect replays the rows (and no `queued` for d, which a draining pool will not pull), w2\'s ready is still journalled as finished, and afterwards c (refused mint) is safe to retry and d is pending',
      agents.interrupts.length === 0 && whileDraining.live && whileDraining.choices.join() === 'reconnect' &&
        reconnect.kind === 'ok' && replayed.join() === 'started:a,finished:w1,started:b' &&
        job.items[1].attempts[0].outcome === 'finished' && job.state === 'refused' &&
        afterDrain.items.find((i) => i.item === 'c').status === 'safe-retry' && afterDrain.items.find((i) => i.item === 'd').status === 'pending' &&
        afterDrain.choices.includes('continue') && afterDrain.choices.includes('retry'),
      JSON.stringify({ interrupts: agents.interrupts, whileDraining, reconnect, replayed, job, afterDrain }))
  }

  // ---- jobs.abandon.1 / jobs.stop.1 / jobs.joined.1 / jobs.exit.1
  {
    const store = M.store.createJobStore({ file: freshFile(), now })
    const { caller, agents } = callerOver(store, { items: ['a', 'b', 'c'] })
    const { jobId } = caller.start({ templateId: 't', key: 'ab', node: poolNode(1) })
    await tick(10)
    agents.emit({ id: 'w1', type: 'status', status: 'exited' })
    await tick(10)
    const exited = store.get(jobId).items[0].attempts[0]
    ok('jobs.exit.1 a worker whose process exits without the ready that ends a turn is journalled `exited`, not finished — the pool still moves on (M138), but recovery asks a person about the item',
      exited.outcome === 'exited' && J.itemStatus(store.get(jobId).items[0], store.get(jobId), false) === 'needs-you',
      JSON.stringify(exited))
    caller.stop('t', 'ab')
    const byHand = store.get(jobId)
    const listedByHand = await doorsOver(store, caller).list()
    const b2 = M.store.createJobStore({ file: freshFile(), now })
    const budgetJob = J.jobEnded(J.newJob({ id: 'jb', templateId: 't', key: 'budget', node: { prompt: '', list: '/l', cwd: '/r', width: 1 }, items: ['a'], at: 1 }), { kind: 'stopped', why: 'budget' }, 2)
    b2.put(budgetJob)
    const listedBudget = await doorsOver(b2, null).list()
    ok('jobs.stop.1 a stop BY HAND is a decision already made and is not offered back on every launch; a BUDGET stop is listed, because raising the ceiling is when continuing makes sense',
      byHand.state === 'stopped' && listedByHand.length === 0 && listedBudget.length === 1 && /budget/.test(listedBudget[0].lines[0]),
      JSON.stringify({ byHand: byHand.state, listedByHand, listedBudget }))
    b2.put({ ...budgetJob, id: 'jb2' })
    const doors = doorsOver(b2, null)
    const abandoned = await doors.recover({ jobId: 'jb2', choice: 'abandon' })
    const after = await doors.recover({ jobId: 'jb2', choice: 'continue' })
    ok('jobs.abandon.1 abandon touches no process and keeps the record: the job is abandoned with its unfinished items marked, it leaves the list, and a later continue is refused by name',
      abandoned.kind === 'ok' && b2.get('jb2').state === 'abandoned' && b2.get('jb2').items[0].abandoned === true &&
        !(await doors.list()).some((a) => a.id === 'jb2') && after.kind === 'refused' && /abandoned/.test(after.reason),
      JSON.stringify({ abandoned, after, rec: b2.get('jb2') }))
    const joined = J.markInterrupted({ ...J.newJob({ id: 'jj', templateId: 't', key: 'fan', node: { prompt: '', list: '/l', cwd: '/r', width: 4 }, items: ['a', 'b'], joined: true, at: 1 }) }, 'restart', 2)
    const acc = J.jobAccount(joined, false, null)
    const plan = J.recoveryPlan(joined, false, 'continue')
    ok('jobs.joined.1 a pool that hands off into a collect records the dependency, offers no continue or retry (a partial pass cannot join a collect that waits on every item), and says why',
      joined.joined === true && acc.choices.join() === 'abandon' && plan.kind === 'refused' && /collect/.test(plan.reason) && acc.lines.some((l) => /collect/.test(l)),
      JSON.stringify({ acc, plan }))
  }

  // ---- jobs.trim.1 — past the cap, settled jobs go before unresolved ones.
  {
    const mk = (id, state) => ({ ...J.newJob({ id, templateId: 't', key: id, node: { prompt: '', list: '/l', cwd: '/r', width: 1 }, items: ['a'], at: 1 }), state })
    const jobs = [mk('new-done', 'done'), mk('mid', 'interrupted'), mk('old-done', 'done'), mk('oldest', 'interrupted')]
    const kept = M.store.trimJobs(jobs, 2).map((j) => j.id)
    ok('jobs.trim.1 trimming to the cap drops the oldest SETTLED jobs first and never an interrupted one to make room for a done one',
      kept.join() === 'mid,oldest', JSON.stringify(kept))
  }

  // ---- jobs.run.1 — a handoff run the relaunch cut off.
  {
    const R = M.runModel
    const open = { id: 'r1', name: 'Run 3', panelIds: ['a', 'b', 'c', 'd'], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }], startedAt: 1,
      entries: [{ panelId: 'a', startedAt: 1, endedAt: 2, outcome: 'exit 0' }, { panelId: 'b', startedAt: 2 }] }
    const [sealed] = R.sealAbandoned([open], 9)
    const acc = R.interruptedRunAccount(sealed, (id) => `panel ${id}`)
    const doneRun = R.interruptedRunAccount({ ...open, endedAt: 3, entries: [{ panelId: 'a', startedAt: 1, endedAt: 2, outcome: 'exit 0' }] }, (id) => id)
    ok('jobs.run.1 a handoff run the relaunch cut off is told as a job: a finished, b mid-step, c and d not started — continue restarts only b (the edges start the rest), and a run that ended on its own is not an interruption',
      acc !== null && acc.finished.join() === 'a' && acc.midStep.join() === 'b' && acc.notStarted.join() === 'c,d' &&
        /1 of 4 steps finished/.test(acc.line) && /panel b was mid-step/.test(acc.line) && doneRun === null,
      JSON.stringify({ acc, doneRun }))
  }

  // ---- jobs.store.1 — a torn write cannot happen, and an unreadable file is an empty journal.
  {
    const file = freshFile()
    writeFileSync(file, '{"version":1,"jobs":[{"id":')
    const s = M.store.createJobStore({ file, now })
    s.put(J.newJob({ id: 'z', templateId: 't', key: 'z', node: { prompt: '', list: '/l', cwd: '/r', width: 1 }, items: ['a'], at: 1 }))
    const reread = M.store.createJobStore({ file, now })
    ok('jobs.store.1 a torn journal is an empty journal at boot (never a throw), a put writes through temp-and-rename, and the next store reads it back',
      reread.get('z') !== undefined && reread.all().length === 1, JSON.stringify(reread.all()))
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
    process.exit(1)
  }
  process.exit(0)
})().catch((error) => {
  console.error('infrastructure failure', error)
  process.exit(1)
})
