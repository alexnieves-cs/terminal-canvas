/* Run with: node scripts/verify-cloud.cjs
   Lane H (M540–M545): cloud lanes — a lane whose agent runs in the cloud and
   comes back as a pull request (docs/streams/bold.md). Plain node: each module
   is bundled with esbuild and driven with fixtures, so GitHub is never called.
   Every check reports even when its module fails to load, so one missing
   export cannot hide the rest. */
const { buildSync } = require('esbuild')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '..')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ALIAS = { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }
function load(entry, name) {
  try {
    const outfile = join(ROOT, 'out/verify', `cloud-${name}.cjs`)
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
const checkAsync = async (id, loaded, test) => {
  if (loaded.mod === undefined) { ok(id, false, loaded.error); return }
  try {
    const r = await test(loaded.mod)
    ok(id, r.pass, JSON.stringify(r.detail).slice(0, 400))
  } catch (error) { ok(id, false, error.message) }
}

const lane = load('src/shared/cloud-lane.ts', 'lane')
const main = load('src/main/cloud-lanes.ts', 'main')

const HOUR = 60 * 60 * 1000
const AT = { dispatchedAt: 0, provider: 'copilot' }
const issue = (state = 'open') => ({ number: 12, state })
const pr = (over = {}) => ({ number: 40, state: 'open', merged: false, draft: false, body: 'Fixes #12', head: 'copilot/fix-12', createdAt: 5, ...over })
const run = (name, conclusion, status = 'completed', app) => ({ name, status, conclusion, ...(app === undefined ? {} : { app }) })
const facts = (over = {}) => ({ issue: issue(), pr: pr(), checks: [run('verify', 'success')], reviews: [], ...over })
const derive = (L, f, now = 1, at = AT) => L.cloudLaneState(at, f, now)

// M541 — cloud.state.1. The whole walk from a handed-over issue to a merge,
//        one fact changing at a time, lands on the state word a person would
//        say for each, in order.
check('cloud.state.1 a lane walks dispatched → working → checks-running → ready → merged as the PR goes from absent to draft to open to green to merged', lane, (L) => {
  const walk = [
    derive(L, facts({ pr: null, checks: [] }), HOUR),
    derive(L, facts({ pr: pr({ draft: true }), checks: [] }), HOUR),
    derive(L, facts({ checks: [run('verify', null, 'in_progress')] }), HOUR),
    derive(L, facts(), HOUR),
    derive(L, facts({ pr: pr({ merged: true, state: 'closed' }) }), HOUR)
  ].map((d) => d.state)
  return { pass: walk.join() === 'dispatched,working,checks-running,ready,merged', detail: walk }
})

// cloud.state.2. "Done means a check passed" holds for an agent we cannot see:
//        a PR with no checks is never ready, a conclusion this module has never
//        heard of fails, and checks it could not read in full never pass.
check('cloud.state.2 no checks is needs-you, an unknown conclusion fails, skipped and neutral pass, and an incomplete read is not ready', lane, (L) => {
  const none = derive(L, facts({ checks: [] }))
  const odd = derive(L, facts({ checks: [run('verify', 'stale')] }))
  const soft = derive(L, facts({ checks: [run('a', 'skipped'), run('b', 'neutral'), run('c', 'success')] }))
  const partial = derive(L, facts({ checksIncomplete: true }))
  return { pass: none.state === 'needs-you' && odd.state === 'failed' && soft.state === 'ready' && partial.state === 'checks-running', detail: { none, odd, soft, partial } }
})

// cloud.state.3. A re-run is a second run under the same name, newest first.
//        Only the newest counts, both ways — but per app: another app's newer
//        green "build" does not hide this app's red one.
check('cloud.state.3 only the newest run of each check counts, per app: a red re-run green is ready, a green re-run red fails, and two apps\' "build" stay apart', lane, (L) => {
  const fixed = derive(L, facts({ checks: [run('verify', 'success'), run('verify', 'failure')] }))
  const broke = derive(L, facts({ checks: [run('verify', 'failure'), run('verify', 'success')] }))
  const apps = derive(L, facts({ checks: [run('build', 'success', 'completed', 'actions'), run('build', 'failure', 'completed', 'circleci')] }))
  return { pass: fixed.state === 'ready' && broke.state === 'failed' && apps.state === 'failed', detail: { fixed, broke, apps } }
})

// cloud.state.4. The ends and the stalls: a closed PR, a closed issue with no
//        PR, two hours with no PR (in the provider's own words), a failed
//        hand-off that no GitHub fact records, and a draft left for two hours.
check('cloud.state.4 closed PR and issue are closed; no PR for two hours, a failed hand-off and a two-hour draft are needs-you, each said in its own words', lane, (L) => {
  const closedPr = derive(L, facts({ pr: pr({ state: 'closed' }) })).state
  const closedIssue = derive(L, facts({ issue: issue('closed'), pr: null })).state
  const stalled = derive(L, facts({ pr: null }), 2 * HOUR + 1, { dispatchedAt: 0, provider: 'claude-action' })
  const handoff = derive(L, facts({ pr: null }), 1, { ...AT, handoff: 'failed' })
  const draft = derive(L, facts({ pr: pr({ draft: true }) }), 2 * HOUR + 10)
  const pass = closedPr === 'closed' && closedIssue === 'closed' && stalled.state === 'needs-you' && /Create PR/.test(stalled.reason) &&
    handoff.state === 'needs-you' && /never handed/.test(handoff.reason) && draft.state === 'needs-you' && /draft/.test(draft.reason)
  return { pass, detail: { closedPr, closedIssue, stalled, handoff, draft } }
})

// cloud.state.5. Reviews are read per reviewer: one person's approval does
//        not answer another's change request, a COMMENTED review decides
//        nothing, and the same reviewer approving later clears their own.
check('cloud.state.5 a change request holds until THAT reviewer approves; another reviewer\'s approval or a comment does not clear it', lane, (L) => {
  const r = (state, at, user) => ({ state, submittedAt: at, user })
  const other = derive(L, facts({ reviews: [r('CHANGES_REQUESTED', 1, 'ada'), r('APPROVED', 2, 'bob')] })).state
  const comment = derive(L, facts({ reviews: [r('CHANGES_REQUESTED', 1, 'ada'), r('COMMENTED', 2, 'ada')] })).state
  const cleared = derive(L, facts({ reviews: [r('CHANGES_REQUESTED', 1, 'ada'), r('APPROVED', 3, 'ada')] })).state
  return { pass: other === 'working' && comment === 'working' && cleared === 'ready', detail: { other, comment, cleared } }
})

// cloud.state.6. A workflow waiting for a person's approval (GitHub's rule
//        for a bot's first PR) is the person's move, not a failure — but a
//        real failure beside it still reads failed.
check('cloud.state.6 action_required is needs-you, not failed, unless another check really failed', lane, (L) => {
  const wait = derive(L, facts({ checks: [run('verify', 'action_required')] }))
  const both = derive(L, facts({ checks: [run('verify', 'action_required'), run('lint', 'failure')] }))
  return { pass: wait.state === 'needs-you' && /approve/.test(wait.reason) && both.state === 'failed', detail: { wait, both } }
})

// cloud.find.1. A lane finds its PR by the issue: a closing reference first,
//        then the branch naming the number as a whole segment, newest among
//        several, and never a PR opened before the hand-off. #120 and fix-121
//        are not #12.
check('cloud.find.1 a closing reference beats a branch name, the newest wins, a PR older than the dispatch is never adopted, and #120 or fix-121 never match 12', lane, (L) => {
  const D = 10 * 60 * 1000
  const byBody = pr({ number: 1, body: 'This closes #12.', head: 'x', createdAt: D + 1 })
  const byBranch = pr({ number: 2, body: '', head: 'claude/issue-12-fix', createdAt: D + 9 })
  const newer = pr({ number: 3, body: 'Resolves alexnieves-cs/terminal-canvas#12', head: 'y', createdAt: D + 5 })
  const old = pr({ number: 5, body: 'Fixes #12', head: 'bump-12-x', createdAt: 0 })
  const near = [pr({ number: 4, body: 'Fixes #120', head: 'copilot/fix-121', createdAt: D + 20 })]
  const R = 'alexnieves-cs/terminal-canvas'
  const a = L.findLanePr(12, [byBranch, byBody], R, D)
  const b = L.findLanePr(12, [byBody, newer, byBranch], R, D)
  const c = L.findLanePr(12, [byBranch], undefined, D)
  const d = L.findLanePr(12, near, undefined, D)
  const e = L.findLanePr(12, [old], R, D)
  return { pass: a?.number === 1 && b?.number === 3 && c?.number === 2 && d === null && e === null, detail: { a: a?.number, b: b?.number, c: c?.number, d, e } }
})

// cloud.dispatch.1. A provider is a row: assign posts the assignee, comment
//        posts the mention before the task, and the issue carries the marker
//        that finds the lane again — refusing an id that could close the
//        HTML comment around it.
check('cloud.dispatch.1 each provider is one write, the issue carries its marker, and an id with --> in it is refused', lane, (L) => {
  const copilot = L.dispatchRequest(L.providerById('copilot'), 'o/r', 12, 'add a test')
  const claude = L.dispatchRequest(L.providerById('claude-action'), 'o/r', 12, 'add a test')
  const made = L.issueRequest('o/r', 'lane-1', 'Add a test', 'add a test')
  let threw = false
  try { L.issueRequest('o/r', 'x --> @everyone', 't', 't') } catch { threw = true }
  const pass = copilot.path === '/repos/o/r/issues/12/assignees' && JSON.parse(copilot.body).assignees.length === 1 &&
    claude.path === '/repos/o/r/issues/12/comments' && JSON.parse(claude.body).body.startsWith('@claude add a test') &&
    made.path === '/repos/o/r/issues' && JSON.parse(made.body).body.includes(L.LANE_MARKER('lane-1')) && threw &&
    L.PROVIDERS.every((p) => (p.dispatch === 'assign') === (p.assignee !== undefined && p.assigneeMatch !== undefined) && (p.dispatch === 'comment') === (p.mention !== undefined))
  return { pass, detail: { copilot, claude, made, threw } }
})

// cloud.dispatch.2. GitHub answers 201 to an assignment it silently dropped,
//        so the hand-off is read from the answer's assignee list.
check('cloud.dispatch.2 an assignment counts only when the answer lists the provider among the assignees', lane, (L) => {
  const p = L.providerById('copilot')
  const took = L.handoffTook(p, 201, JSON.stringify({ assignees: [{ login: 'Copilot' }] }))
  const dropped = L.handoffTook(p, 201, JSON.stringify({ assignees: [] }))
  const junk = L.handoffTook(p, 201, 'not json')
  const comment = L.handoffTook(L.providerById('claude-action'), 201, '{}')
  return { pass: took && !dropped && !junk && comment, detail: { took, dropped, junk, comment } }
})

// cloud.inert.1. Text sent to GitHub pings nobody and fires nothing: @names,
//        @org/team and @claude are broken with a joiner, so are lines that
//        start with /, and an email address is left alone.
check('cloud.inert.1 @mentions and leading /commands are made inert with the count; an email address is untouched', lane, (L) => {
  const r = L.inertForGithub('ask @octocat and @org/team, then @claude\n/approve\n  /lgtm\nmail a@b.com')
  const pass = r.neutralised === 5 && !/(^|[^\w])@[A-Za-z]/.test(r.text) && !/^\s*\//m.test(r.text) && r.text.includes('a@b.com')
  return { pass, detail: r }
})

// cloud.poll.1. Polling backs off, stops when settled, and a hidden window
//        polls at the ceiling — the token's rate limit is shared.
check('cloud.poll.1 polling is fastest while checks run, doubles when nothing changes up to a ceiling, sits at the ceiling when hidden, and stops when settled', lane, (L) => {
  const running = L.nextPollMs('checks-running', 0, false)
  const working = L.nextPollMs('working', 0, false)
  const backed = L.nextPollMs('working', 1, false)
  const capped = L.nextPollMs('working', 50, false)
  const hidden = L.nextPollMs('checks-running', 0, true)
  const done = [L.nextPollMs('merged', 0, false), L.nextPollMs('closed', 0, true)]
  const pass = running === L.POLL_MIN_MS && working > running && backed === working * 2 && capped === L.POLL_MAX_MS && hidden === L.POLL_MAX_MS && done.every((d) => d === null)
  return { pass, detail: { running, working, backed, capped, hidden, done } }
})

// cloud.parse.1. A lane read back from disk: absent optional keys are fine, a
//        wrong-typed one is malformed by name, never coerced, and a dispatch
//        time in the future is malformed (it would hold off needs-you).
check('cloud.parse.1 a stored lane parses with or without its PR; a string PR, a .. repo, an unknown provider, a bad state, a bad id and a future time are malformed by name', lane, (L) => {
  const base = { id: 'l1', repo: 'o/r', issue: 12, provider: 'copilot', title: 't', dispatchedAt: 1, state: 'working' }
  const plain = L.parseCloudLane(base, 100)
  const withPr = L.parseCloudLane({ ...base, pr: 40, handoff: 'failed', workItemId: 'wi1' }, 100)
  const bad = [
    L.parseCloudLane({ ...base, pr: '40' }, 100),
    L.parseCloudLane({ ...base, repo: 'o/..' }, 100),
    L.parseCloudLane({ ...base, provider: 'jules' }, 100),
    L.parseCloudLane({ ...base, state: 'done' }, 100),
    L.parseCloudLane({ ...base, id: 'a-->b' }, 100),
    L.parseCloudLane({ ...base, dispatchedAt: 100 + 60 * HOUR }, 100)
  ]
  const pass = plain.kind === 'lane' && plain.lane.pr === undefined && withPr.kind === 'lane' && withPr.lane.pr === 40 && withPr.lane.handoff === 'failed' &&
    bad.map((b) => b.kind === 'malformed' && b.reason).join() === 'pr,repo,provider,state,id,dispatchedAt'
  return { pass, detail: { plain, withPr, bad } }
})

// A broker that answers by "METHOD path" and records every call.
function fakeBroker(routes) {
  const calls = []
  return {
    calls,
    call: async (req) => {
      calls.push(req)
      const hit = routes[`${req.method} ${req.path}`]
      if (hit === undefined) return { ok: true, status: 404, body: '{"message":"Not Found"}', truncated: false }
      if (hit.ok === false) return hit
      return { ok: true, status: hit.status ?? 200, body: typeof hit.body === 'string' ? hit.body : JSON.stringify(hit.body), truncated: false }
    }
  }
}
const REQ = { id: 'lane-1', repo: 'o/r', provider: 'copilot', title: 'Add a test', task: 'add a test for parse(), cc @octocat\ntoken ghp_abcdefghijklmnopqrstuvwxyz0123456789' }
const ASSIGNED = { status: 201, body: { assignees: [{ login: 'Copilot' }] } }
const SHA = 'a'.repeat(40)
const LANE = { id: 'l', repo: 'o/r', issue: 12, provider: 'copilot', title: 't', dispatchedAt: 0, state: 'dispatched' }

;(async () => {
  // M542 — cloud.main.1. Nothing leaves before the person says yes: a
  //        cancelled confirm makes no call at all, and the ask shows the task
  //        scrubbed with the count and says a mention went out as plain text.
  await checkAsync('cloud.main.1 a cancelled confirm sends nothing, and what it asked showed the task scrubbed and inert, with both counts', main, async (M) => {
    const broker = fakeBroker({})
    let asked = null
    const r = await M.dispatchCloudLane({ broker, confirm: async (a) => { asked = a; return false }, now: () => 7 }, REQ)
    const pass = r.kind === 'cancelled' && broker.calls.length === 0 && asked !== null && !asked.detail.includes('ghp_') && asked.redacted === 1 &&
      /@mention/.test(asked.detail) && !/@octocat/.test(asked.detail) && /o\/r/.test(asked.message)
    return { pass, detail: { r, calls: broker.calls.length, asked } }
  })

  // cloud.main.2. A yes is two writes, both personConfirmed, the issue first,
  //        the scrubbed and inert text in both, and the lane comes back dispatched.
  await checkAsync('cloud.main.2 a confirmed dispatch opens the issue then hands it over, both writes confirmed, scrubbed and pinging nobody', main, async (M) => {
    const broker = fakeBroker({ 'POST /repos/o/r/issues': { status: 201, body: { number: 12 } }, 'POST /repos/o/r/issues/12/assignees': ASSIGNED })
    const r = await M.dispatchCloudLane({ broker, confirm: async () => true, now: () => 7 }, REQ)
    const pass = r.kind === 'dispatched' && r.lane.issue === 12 && r.lane.dispatchedAt === 7 && r.redacted === 1 &&
      broker.calls.map((c) => c.path).join() === '/repos/o/r/issues,/repos/o/r/issues/12/assignees' &&
      broker.calls.every((c) => c.personConfirmed === true && !(c.body ?? '').includes('ghp_') && !(c.body ?? '').includes('@octocat'))
    return { pass, detail: { r, calls: broker.calls } }
  })

  // cloud.main.3. The second write failing after the first landed is said and
  //        kept: needs-you with handoff failed, naming the issue and the step
  //        to do by hand — including a 201 that silently dropped the assignee.
  //        A malformed request is refused before anyone is asked.
  await checkAsync('cloud.main.3 a failed or silently dropped hand-off keeps the lane as needs-you with handoff failed; a malformed request is refused before asking', main, async (M) => {
    const failed = await M.dispatchCloudLane({ broker: fakeBroker({ 'POST /repos/o/r/issues': { status: 201, body: { number: 12 } }, 'POST /repos/o/r/issues/12/assignees': { status: 422, body: { message: 'Validation Failed' } } }), confirm: async () => true, now: () => 7 }, REQ)
    const dropped = await M.dispatchCloudLane({ broker: fakeBroker({ 'POST /repos/o/r/issues': { status: 201, body: { number: 12 } }, 'POST /repos/o/r/issues/12/assignees': { status: 201, body: { assignees: [] } } }), confirm: async () => true, now: () => 7 }, REQ)
    let asks = 0
    const confirm = async () => { asks += 1; return true }
    const bad = await Promise.all([{ ...REQ, repo: 'o/..' }, { ...REQ, provider: 'jules' }, { ...REQ, title: 42 }, { ...REQ, id: 'a-->b' }, null]
      .map((q) => M.dispatchCloudLane({ broker: fakeBroker({}), confirm, now: () => 7 }, q)))
    const pass = [failed, dropped].every((r) => r.kind === 'handoff-failed' && r.lane.state === 'needs-you' && r.lane.handoff === 'failed' && /#12/.test(r.reason) && /by hand/.test(r.reason)) &&
      /not among the assignees/.test(dropped.reason) && bad.every((b) => b.kind === 'refused') && asks === 0
    return { pass, detail: { failed, dropped, bad, asks } }
  })

  // cloud.main.4. An issue that already exists (a task added from GitHub)
  //        gets only the hand-off — no second issue — and a failed hand-off
  //        on it keeps nothing, since nothing was opened.
  await checkAsync('cloud.main.4 a task from a GitHub issue hands THAT issue over with one write, and keeps nothing when the hand-off fails', main, async (M) => {
    const broker = fakeBroker({ 'POST /repos/o/r/issues/7/assignees': ASSIGNED })
    let asked = null
    const r = await M.dispatchCloudLane({ broker, confirm: async (a) => { asked = a; return true }, now: () => 7 }, { ...REQ, issue: 7, workItemId: 'wi1' })
    const nope = await M.dispatchCloudLane({ broker: fakeBroker({}), confirm: async () => true, now: () => 7 }, { ...REQ, issue: 7 })
    const pass = r.kind === 'dispatched' && r.lane.issue === 7 && r.lane.workItemId === 'wi1' && broker.calls.length === 1 && /issue #7/.test(asked.detail) && nope.kind === 'unavailable'
    return { pass, detail: { r, calls: broker.calls.map((c) => c.path), nope } }
  })

  // cloud.main.5. Reading is GETs only, finds the PR through the issue, reads
  //        check runs page by page and the legacy commit statuses, orders the
  //        runs itself, and a failing status keeps the lane from ready.
  await checkAsync('cloud.main.5 reading is GETs only, finds the lane\'s PR, pages the check runs, reads commit statuses, and newest-run-wins holds with GitHub\'s order unknown', main, async (M) => {
    const routes = (status) => fakeBroker({
      'GET /repos/o/r/issues/12': { body: { state: 'open' } },
      'GET /repos/o/r/pulls?state=all&sort=created&direction=desc&per_page=50': { body: [{ number: 39, state: 'open', body: 'Fixes #120', head: { ref: 'a', sha: SHA } }, { number: 40, state: 'open', draft: false, body: 'Fixes #12', head: { ref: 'copilot/fix-12', sha: SHA }, created_at: '2026-10-26T01:00:00Z' }] },
      'GET /repos/o/r/pulls/40': { body: { number: 40, state: 'open', draft: false, body: 'Fixes #12', head: { ref: 'copilot/fix-12', sha: SHA }, additions: 30, deletions: 2, changed_files: 3, created_at: '2026-10-26T01:00:00Z' } },
      [`GET /repos/o/r/commits/${SHA}/check-runs?per_page=100&page=1`]: { body: { total_count: 2, check_runs: [{ id: 1, name: 'verify', status: 'completed', conclusion: 'failure' }, { id: 2, name: 'verify', status: 'completed', conclusion: 'success' }] } },
      [`GET /repos/o/r/commits/${SHA}/status`]: { body: { statuses: status } },
      'GET /repos/o/r/pulls/40/reviews?per_page=100': { body: [] }
    })
    const green = routes([{ context: 'ci/circleci', state: 'success' }])
    const read = await M.readCloudFacts(green, LANE)
    const ready = read.kind === 'facts' ? lane.mod.cloudLaneState(LANE, read.facts, 1).state : null
    const redRead = await M.readCloudFacts(routes([{ context: 'vercel', state: 'failure' }]), LANE)
    const red = redRead.kind === 'facts' ? lane.mod.cloudLaneState(LANE, redRead.facts, 1).state : null
    const pass = read.kind === 'facts' && read.facts.pr.number === 40 && read.facts.pr.additions === 30 && ready === 'ready' && red === 'failed' &&
      green.calls.every((c) => c.method === 'GET' && c.personConfirmed === undefined)
    return { pass, detail: { ready, red, paths: green.calls.map((c) => c.path) } }
  })

  // cloud.main.6. More check runs than were read is incomplete, never ready;
  //        a pinned PR that closed unmerged is looked past for a newer one;
  //        a gone issue settles; a sha that is not a sha never enters a path.
  await checkAsync('cloud.main.6 a truncated check list is incomplete, a closed pinned PR yields to a newer one, a gone issue is gone, and a bad sha never reaches a path', main, async (M) => {
    const base = {
      'GET /repos/o/r/issues/12': { body: { state: 'open' } },
      'GET /repos/o/r/pulls/40/reviews?per_page=100': { body: [] },
      'GET /repos/o/r/pulls/41/reviews?per_page=100': { body: [] },
      [`GET /repos/o/r/commits/${SHA}/status`]: { body: { statuses: [] } }
    }
    const many = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `c${i}`, status: 'completed', conclusion: 'success' }))
    const pages = {}
    for (let p = 1; p <= M.CHECK_PAGES; p += 1) pages[`GET /repos/o/r/commits/${SHA}/check-runs?per_page=100&page=${p}`] = { body: { total_count: 500, check_runs: many } }
    const truncated = await M.readCloudFacts(fakeBroker({ ...base, ...pages, 'GET /repos/o/r/pulls/40': { body: { number: 40, state: 'open', head: { ref: 'x', sha: SHA } } } }), { ...LANE, pr: 40 })
    const restarted = await M.readCloudFacts(fakeBroker({
      ...base, ...pages,
      'GET /repos/o/r/pulls/40': { body: { number: 40, state: 'closed', head: { ref: 'x', sha: SHA }, body: 'Fixes #12' } },
      'GET /repos/o/r/pulls?state=all&sort=created&direction=desc&per_page=50': { body: [{ number: 41, state: 'open', body: 'Fixes #12', head: { ref: 'copilot/fix-12-again', sha: SHA }, created_at: '2026-10-26T02:00:00Z' }] },
      'GET /repos/o/r/pulls/41': { body: { number: 41, state: 'open', body: 'Fixes #12', head: { ref: 'copilot/fix-12-again', sha: SHA }, created_at: '2026-10-26T02:00:00Z' } }
    }), { ...LANE, pr: 40 })
    const gone = await M.readCloudFacts(fakeBroker({}), LANE)
    const evil = fakeBroker({ ...base, 'GET /repos/o/r/pulls/40': { body: { number: 40, state: 'open', head: { ref: 'x', sha: '../../x' } } } })
    const shaRead = await M.readCloudFacts(evil, { ...LANE, pr: 40 })
    const pass = truncated.kind === 'facts' && truncated.facts.checksIncomplete === true &&
      lane.mod.cloudLaneState(LANE, truncated.facts, 1).state === 'checks-running' &&
      restarted.kind === 'facts' && restarted.facts.pr.number === 41 &&
      gone.kind === 'gone' &&
      shaRead.kind === 'facts' && shaRead.facts.checksIncomplete === true && !evil.calls.some((c) => c.path.includes('..'))
    return { pass, detail: { truncated: truncated.facts?.checksIncomplete, restarted: restarted.facts?.pr?.number, gone: gone.kind, sha: shaRead.facts?.checksIncomplete } }
  })

  // cloud.main.7. The poller: a lane is re-derived on watch, `changed` fires
  //        only when something moved, an unreadable poll keeps the state and
  //        backs off, a gone lane settles closed, and a settled lane arms no timer.
  await checkAsync('cloud.main.7 the poller re-derives on watch, reports only moves, keeps the state when GitHub is unreadable, settles a gone lane, and stops at a settled one', main, async (M) => {
    const timers = []
    let answer = { kind: 'facts', facts: { issue: { number: 12, state: 'open' }, pr: null, checks: [], reviews: [] } }
    const changes = []
    const deps = {
      read: async () => answer, now: () => 1, hidden: () => false,
      setTimer: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1 },
      clearTimer: (h) => { timers[h].live = false },
      changed: (l, d) => changes.push(d.state)
    }
    const poller = M.createCloudLanePoller(deps)
    poller.watch({ ...LANE, state: 'working' })
    await new Promise((r) => setImmediate(r))
    const first = timers.filter((t) => t.live).map((t) => t.ms)
    await poller.pollNow('l')
    const quiet = timers.filter((t) => t.live).map((t) => t.ms)
    answer = { kind: 'unavailable', reason: 'offline' }
    await poller.pollNow('l')
    const offline = poller.lanes()[0].state
    answer = { kind: 'facts', facts: { issue: { number: 12, state: 'open' }, pr: { number: 40, state: 'closed', merged: true, draft: false, body: '', head: '', createdAt: 0 }, checks: [], reviews: [] } }
    await poller.pollNow('l')
    const settledTimers = timers.filter((t) => t.live).length
    const gonePoller = M.createCloudLanePoller({ ...deps, read: async () => ({ kind: 'gone', reason: 'issue gone' }), changed: (l, d) => changes.push(`gone:${d.state}`) })
    gonePoller.watch({ ...LANE, id: 'g' })
    await new Promise((r) => setImmediate(r))
    poller.stop()
    gonePoller.stop()
    const pass = changes.join() === 'dispatched,merged,gone:closed' && first.length === 1 && quiet[0] === first[0] * 2 && offline === 'dispatched' && settledTimers === 0 && poller.lanes().length === 0
    return { pass, detail: { changes, first, quiet, offline, settledTimers } }
  })

  // cloud.main.8. A second `watch` of the same id replaces the entry: the old
  //        poll still in flight reports nothing and does not re-arm a timer;
  //        `wake` re-arms a lane left on the hidden ceiling.
  await checkAsync('cloud.main.8 a re-watch while a poll is in flight drops the old poll\'s answer and timer, and wake re-arms from the hidden ceiling', main, async (M) => {
    const timers = []
    let release
    let calls = 0
    let hidden = true
    const changes = []
    const poller = M.createCloudLanePoller({
      read: () => { calls += 1; if (calls === 1) return new Promise((r) => { release = r }); return Promise.resolve({ kind: 'facts', facts: { issue: { number: 12, state: 'open' }, pr: null, checks: [], reviews: [] } }) },
      now: () => 1, hidden: () => hidden,
      setTimer: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1 },
      clearTimer: (h) => { timers[h].live = false },
      changed: (l, d) => changes.push(`${l.title}:${d.state}`)
    })
    poller.watch({ ...LANE, title: 'old', state: 'working' })
    poller.watch({ ...LANE, title: 'new', state: 'working' })
    await new Promise((r) => setImmediate(r))
    release({ kind: 'facts', facts: { issue: { number: 12, state: 'closed' }, pr: null, checks: [], reviews: [] } })
    await new Promise((r) => setImmediate(r))
    const live = timers.filter((t) => t.live)
    hidden = false
    poller.wake()
    const woken = timers.filter((t) => t.live)
    poller.stop()
    const pass = changes.join() === 'new:dispatched' && live.length === 1 && live[0].ms === lane.mod.POLL_MAX_MS && woken.length === 1 && woken[0].ms < lane.mod.POLL_MAX_MS
    return { pass, detail: { changes, live: live.map((t) => t.ms), woken: woken.map((t) => t.ms) } }
  })

  // cloud.main.9. The lanes file: one bad row is dropped by name and the rest
  //        stand; a file that is not JSON or not version 1 is empty, never a throw.
  await checkAsync('cloud.main.9 the lanes file round-trips, drops one bad row by name, and reads junk as empty without throwing', main, async (M) => {
    const good = { id: 'l1', repo: 'o/r', issue: 12, provider: 'copilot', title: 't', dispatchedAt: 1, state: 'working' }
    const round = M.parseLanesFile(M.serializeLanes([good]), 10)
    const mixed = M.parseLanesFile(JSON.stringify({ version: 1, lanes: [good, { ...good, issue: -1 }] }), 10)
    const junk = [M.parseLanesFile('{', 10), M.parseLanesFile('{"version":2,"lanes":[]}', 10), M.parseLanesFile(null, 10)]
    const pass = round.lanes.length === 1 && mixed.lanes.length === 1 && mixed.dropped.join() === 'lane 1: issue' &&
      junk.every((j) => j.lanes.length === 0) && junk[2].dropped.length === 0 && junk[0].dropped.length === 1
    return { pass, detail: { round, mixed, junk } }
  })

  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
  if (results.some((r) => !r.pass)) process.exitCode = 1
})()
