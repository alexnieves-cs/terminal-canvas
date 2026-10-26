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

const lane = load('src/shared/cloud-lane.ts', 'lane')

const HOUR = 60 * 60 * 1000
const issue = (state = 'open') => ({ number: 12, state })
const pr = (over = {}) => ({ number: 40, state: 'open', merged: false, draft: false, body: 'Fixes #12', head: 'copilot/fix-12', createdAt: 5, ...over })
const run = (name, conclusion, status = 'completed') => ({ name, status, conclusion })
const facts = (over = {}) => ({ issue: issue(), pr: pr(), checks: [run('verify', 'success')], reviews: [], ...over })

// M541 — cloud.state.1. The whole walk from a handed-over issue to a merge,
//        one fact changing at a time, lands on the state word a person would
//        say for each, in order.
check('cloud.state.1 a lane walks dispatched → working → checks-running → ready → merged as the PR goes from absent to draft to open to green to merged', lane, (L) => {
  const at = { dispatchedAt: 0 }
  const walk = [
    L.cloudLaneState(at, facts({ pr: null, checks: [] }), HOUR),
    L.cloudLaneState(at, facts({ pr: pr({ draft: true }), checks: [] }), HOUR),
    L.cloudLaneState(at, facts({ checks: [run('verify', null, 'in_progress')] }), HOUR),
    L.cloudLaneState(at, facts(), HOUR),
    L.cloudLaneState(at, facts({ pr: pr({ merged: true, state: 'closed' }) }), HOUR)
  ].map((d) => d.state)
  return { pass: walk.join() === 'dispatched,working,checks-running,ready,merged', detail: walk }
})

// cloud.state.2. "Done means a check passed" holds for an agent we cannot see:
//        a PR with no checks is never ready, and a check whose conclusion this
//        module has never heard of fails rather than passes.
check('cloud.state.2 a PR with no checks is needs-you, not ready, and an unknown conclusion fails while skipped and neutral pass', lane, (L) => {
  const none = L.cloudLaneState({ dispatchedAt: 0 }, facts({ checks: [] }), 1)
  const odd = L.cloudLaneState({ dispatchedAt: 0 }, facts({ checks: [run('verify', 'stale')] }), 1)
  const soft = L.cloudLaneState({ dispatchedAt: 0 }, facts({ checks: [run('a', 'skipped'), run('b', 'neutral'), run('c', 'success')] }), 1)
  return { pass: none.state === 'needs-you' && odd.state === 'failed' && soft.state === 'ready', detail: { none, odd, soft } }
})

// cloud.state.3. A re-run is a second run under the same name, newest first.
//        Only the newest counts, both ways: a failure re-run green is ready,
//        a green run re-run red is failed.
check('cloud.state.3 only the newest run of each check counts: a red re-run green is ready, a green re-run red is failed', lane, (L) => {
  const fixed = L.cloudLaneState({ dispatchedAt: 0 }, facts({ checks: [run('verify', 'success'), run('verify', 'failure')] }), 1)
  const broke = L.cloudLaneState({ dispatchedAt: 0 }, facts({ checks: [run('verify', 'failure'), run('verify', 'success')] }), 1)
  return { pass: fixed.state === 'ready' && broke.state === 'failed' && /verify/.test(broke.reason), detail: { fixed, broke } }
})

// cloud.state.4. The ends and the stalls: a closed PR, a closed issue with no
//        PR, two hours with no PR, and the latest decisive review deciding
//        (a COMMENTED review after a change request does not clear it).
check('cloud.state.4 closed PR and closed issue are closed, two hours with no PR is needs-you, and changes requested holds until a later approval', lane, (L) => {
  const at = { dispatchedAt: 0 }
  const closedPr = L.cloudLaneState(at, facts({ pr: pr({ state: 'closed' }) }), 1).state
  const closedIssue = L.cloudLaneState(at, facts({ issue: issue('closed'), pr: null }), 1).state
  const stalled = L.cloudLaneState(at, facts({ pr: null }), 2 * HOUR + 1).state
  const asked = L.cloudLaneState(at, facts({ reviews: [{ state: 'CHANGES_REQUESTED', submittedAt: 1 }, { state: 'COMMENTED', submittedAt: 2 }] }), 1).state
  const cleared = L.cloudLaneState(at, facts({ reviews: [{ state: 'CHANGES_REQUESTED', submittedAt: 1 }, { state: 'APPROVED', submittedAt: 3 }] }), 1).state
  const got = { closedPr, closedIssue, stalled, asked, cleared }
  return { pass: closedPr === 'closed' && closedIssue === 'closed' && stalled === 'needs-you' && asked === 'working' && cleared === 'ready', detail: got }
})

// cloud.find.1. A lane finds its PR by the issue: a closing reference first,
//        then the branch naming the number as a whole segment, newest among
//        several. #120 and fix-121 are not #12.
check('cloud.find.1 a closing reference beats a branch name, the newest of several wins, and #120 or fix-121 never match issue 12', lane, (L) => {
  const byBody = pr({ number: 1, body: 'This closes #12.', head: 'x', createdAt: 1 })
  const byBranch = pr({ number: 2, body: '', head: 'claude/issue-12-fix', createdAt: 9 })
  const newer = pr({ number: 3, body: 'Resolves alexnieves-cs/terminal-canvas#12', head: 'y', createdAt: 5 })
  const near = [pr({ number: 4, body: 'Fixes #120', head: 'copilot/fix-121', createdAt: 20 })]
  const a = L.findLanePr(12, [byBranch, byBody], 'alexnieves-cs/terminal-canvas')
  const b = L.findLanePr(12, [byBody, newer, byBranch], 'alexnieves-cs/terminal-canvas')
  const c = L.findLanePr(12, [byBranch])
  const d = L.findLanePr(12, near)
  return { pass: a?.number === 1 && b?.number === 3 && c?.number === 2 && d === null, detail: { a: a?.number, b: b?.number, c: c?.number, d } }
})

// cloud.dispatch.1. A provider is a row: assign posts the assignee, comment
//        posts the mention before the task, and the issue carries the marker
//        that finds the lane again.
check('cloud.dispatch.1 each provider is one write — an assignee or a mention — and the lane issue carries its marker', lane, (L) => {
  const copilot = L.dispatchRequest(L.providerById('copilot'), 'o/r', 12, 'add a test')
  const claude = L.dispatchRequest(L.providerById('claude-action'), 'o/r', 12, 'add a test')
  const made = L.issueRequest('o/r', 'lane-1', 'Add a test', 'add a test')
  const pass = copilot.path === '/repos/o/r/issues/12/assignees' && JSON.parse(copilot.body).assignees.length === 1 &&
    claude.path === '/repos/o/r/issues/12/comments' && JSON.parse(claude.body).body.startsWith('@claude add a test') &&
    made.path === '/repos/o/r/issues' && JSON.parse(made.body).body.includes(L.LANE_MARKER('lane-1')) &&
    L.PROVIDERS.every((p) => (p.dispatch === 'assign') === (p.assignee !== undefined) && (p.dispatch === 'comment') === (p.mention !== undefined))
  return { pass, detail: { copilot, claude, made } }
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
//        wrong-typed one is malformed by name, never coerced.
check('cloud.parse.1 a stored lane parses with or without its PR, and a string PR, a bad repo or an unknown provider is malformed by name', lane, (L) => {
  const base = { id: 'l1', repo: 'o/r', issue: 12, provider: 'copilot', title: 't', dispatchedAt: 1, state: 'working' }
  const plain = L.parseCloudLane(base)
  const withPr = L.parseCloudLane({ ...base, pr: 40 })
  const bad = [
    L.parseCloudLane({ ...base, pr: '40' }),
    L.parseCloudLane({ ...base, repo: 'o/..' }),
    L.parseCloudLane({ ...base, provider: 'jules' }),
    L.parseCloudLane({ ...base, state: 'done' })
  ]
  const pass = plain.kind === 'lane' && plain.lane.pr === undefined && withPr.kind === 'lane' && withPr.lane.pr === 40 &&
    bad.map((b) => b.kind === 'malformed' && b.reason).join() === 'pr,repo,provider,state'
  return { pass, detail: { plain, withPr, bad } }
})

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
if (results.some((r) => !r.pass)) process.exitCode = 1
