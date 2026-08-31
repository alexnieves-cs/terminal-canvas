/* Offline contract checks for the work adapters (M17's Jira, M24's GitHub).  The requester is injected:
   npm run verify is the repo's one green-or-not signal and must not call Jira. */
'use strict'
const { existsSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

// Each adapter is bundled behind its own existsSync guard, so a module that
// does not exist yet leaves its checks reporting individually rather than
// throwing at module scope and taking every OTHER check's result with it —
// the rule CLAUDE.md states for a check that throws.
const bundle = (name) => {
  const source = join(__dirname, '..', 'src', 'main', `${name}.ts`)
  const out = join(__dirname, '..', 'out', 'verify', `${name}.cjs`)
  if (!existsSync(source)) return {}
  execFileSync('npx', ['esbuild', source, '--bundle', '--platform=node', '--outfile=' + out], { stdio: 'inherit' })
  return require(out)
}
const J = bundle('jira-client')
const G = bundle('github-client')

const results = []
const ok = (label, pass, detail) => {
  results.push({ label, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`)
}

const BUNDLE = JSON.stringify({ site: 'https://acme.atlassian.net', email: 'dev@acme.test', token: 'jira_test_token' })
const store = (value) => {
  let label = 'Jira'
  return {
    read: () => value,
    setLabel: (_service, next) => { label = next },
    list: () => value === undefined ? [] : [{ service: 'jira', label, addedAt: 'now', verifiedAt: 'now' }]
  }
}

// Each assertion deliberately reports independently even before jira-client.ts
// exists. A throwing require would hide which contracts were still red.
ok('1 Jira credentials parse one encrypted opaque bundle',
  typeof J.parseJiraCredential === 'function' && J.parseJiraCredential(BUNDLE)?.site === 'https://acme.atlassian.net')
ok('2 malformed Jira credentials are refused before a request',
  typeof J.parseJiraCredential === 'function' && J.parseJiraCredential('{bad') === null)

void (async () => {
  let request
  const verify = typeof J.verifyJiraCredential === 'function'
    ? await J.verifyJiraCredential({ store: store(BUNDLE), requester: async (r) => {
      request = r
      return { status: 200, body: JSON.stringify({ displayName: 'Ada Lovelace' }) }
    } })
    : null
  ok('3 verification uses Basic auth and records Jira display name',
    verify?.ok === true && request?.url.endsWith('/rest/api/3/myself') &&
      request?.headers.Authorization === `Basic ${Buffer.from('dev@acme.test:jira_test_token').toString('base64')}`)

  let called = false
  const absent = typeof J.listAssignedWorkItems === 'function'
    ? await J.listAssignedWorkItems({ store: store(undefined), requester: async () => { called = true; return { status: 200, body: '{}' } } })
    : null
  ok('4 no stored credential refuses with zero network calls', absent?.kind === 'no-credential' && called === false)

  const issue = { key: 'TC-12', fields: {
    summary: 'Ship Jira context',
    description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First line' }, { type: 'hardBreak' }, { type: 'text', text: 'Second line' }] }] },
    assignee: { displayName: 'Ada Lovelace' }, status: { name: 'In Progress' }
  } }
  const listed = typeof J.listAssignedWorkItems === 'function'
    ? await J.listAssignedWorkItems({ store: store(BUNDLE), requester: async (r) => {
      request = r
      return { status: 200, body: JSON.stringify({ issues: [issue] }) }
    } })
    : null
  const item = listed?.kind === 'groups' ? listed.groups[0]?.items[0] : undefined
  ok('5 assigned-ticket mapping is vendor-neutral and JQL is bounded',
    item?.id === 'TC-12' && item.title === 'Ship Jira context' && item.description === 'First line\nSecond line' &&
      item.assignee === 'Ada Lovelace' && item.state === 'In Progress' && item.url === 'https://acme.atlassian.net/browse/TC-12' &&
      request?.url.includes('/rest/api/3/search/jql') && request?.url.includes('maxResults=50'))

  // 6. The result is GROUPED, and Jira returns exactly one group whose label
  // names the QUERY. A flat list was the shape one customer could support; the
  // second one cannot, and the group carries the service's own total so a
  // capped list can say so rather than simply stopping.
  const grouped = typeof J.listAssignedWorkItems === 'function'
    ? await J.listAssignedWorkItems({ store: store(BUNDLE), requester: async () => ({
      status: 200,
      headers: {},
      body: JSON.stringify({ total: 137, issues: [{ key: 'ENG-1', fields: { summary: 'Fix the thing' } }] })
    }) })
    : null
  ok('6 Jira returns one labelled group carrying the service total',
    grouped?.kind === 'groups' && grouped.groups.length === 1 &&
      grouped.groups[0].label === 'Assigned to you' &&
      grouped.groups[0].total === 137 &&
      grouped.groups[0].items[0]?.id === 'ENG-1',
    JSON.stringify(grouped))

  // --- GitHub -----------------------------------------------------------
  const ghStore = (value) => ({
    read: () => value,
    setLabel: () => {},
    list: () => (value === undefined ? [] : [{ service: 'github', label: 'octocat', addedAt: 'now', verifiedAt: 'now' }])
  })
  const ghItem = (n, url) => ({
    number: n,
    title: `Item ${n}`,
    body: 'body text',
    html_url: url,
    state: 'open',
    assignee: { login: 'octocat' },
    repository_url: 'https://api.github.com/repos/acme/web'
  })
  const gh = typeof G.listGithubWorkItems === 'function'
    ? G.listGithubWorkItems
    : async () => ({ kind: 'malformed', reason: 'listGithubWorkItems does not exist' })

  // 7. Every request carries Bearer auth AND a User-Agent. The User-Agent is
  // the one with teeth: GitHub rejects a request without one with 403 and an
  // administrative-rules message, which is indistinguishable at this layer
  // from a rejected token — so a missing header would report "GitHub rejected
  // the credential" for a perfectly good PAT, forever, on every machine.
  {
    const seen = []
    await gh({ store: ghStore('ghp_token'), requester: async (req) => { seen.push(req); return { status: 200, body: JSON.stringify({ total_count: 0, items: [] }), headers: {} } } })
    ok('7 every GitHub request carries Bearer auth and a User-Agent',
      seen.length === 2 &&
        seen.every((r) => r.headers.Authorization === 'Bearer ghp_token') &&
        seen.every((r) => typeof r.headers['User-Agent'] === 'string' && r.headers['User-Agent'] !== '') &&
        seen.every((r) => r.headers.Accept === 'application/vnd.github+json'),
      JSON.stringify(seen.map((r) => r.headers)))
  }

  // 8. Two queries become two labelled groups in a FIXED order, and an item
  // found by BOTH is listed ONCE, under the earlier one. A PR assigned to you
  // and awaiting your review is one obligation, not two, and the assignment is
  // the stronger of them — listing it twice inflates both counts and makes the
  // panel disagree with itself about how much is outstanding.
  {
    const both = ghItem(7, 'https://github.com/acme/web/pull/7')
    const bodies = [
      JSON.stringify({ total_count: 2, items: [ghItem(1, 'https://github.com/acme/web/issues/1'), both] }),
      JSON.stringify({ total_count: 1, items: [both] })
    ]
    let call = 0
    const res = await gh({ store: ghStore('ghp_token'), requester: async () => ({ status: 200, body: bodies[call++], headers: {} }) })
    ok('8 two groups in order, with an item in both listed once under the first',
      res.kind === 'groups' && res.groups.length === 2 &&
        res.groups[0].label === 'Assigned to you' && res.groups[1].label === 'Awaiting your review' &&
        res.groups[0].items.length === 2 && res.groups[1].items.length === 0 &&
        res.groups[0].items[1].id === 'acme/web#7',
      JSON.stringify(res.kind === 'groups' ? res.groups.map((g) => [g.label, g.items.map((i) => i.id)]) : res))
  }

  // 9. THE CHECK THIS MILESTONE TURNS ON. GitHub answers 403 for a rejected
  // token AND for an exhausted search rate limit, and only
  // x-ratelimit-remaining separates them. Without the split the app tells a
  // rate-limited user their token is bad, and the user goes and regenerates a
  // perfectly good credential. BOTH directions are asserted, because a split
  // written backwards reports every rejection as a rate limit and is equally
  // wrong — the over-correction guard verify:review 37b already states.
  {
    const a = await gh({ store: ghStore('ghp_token'), requester: async () => ({ status: 403, body: '{}', headers: { 'x-ratelimit-remaining': '0' } }) })
    const b = await gh({ store: ghStore('ghp_token'), requester: async () => ({ status: 403, body: '{}', headers: { 'x-ratelimit-remaining': '27' } }) })
    const c = await gh({ store: ghStore('ghp_token'), requester: async () => ({ status: 401, body: '{}', headers: {} }) })
    ok('9 a 403 splits into rate-limited and rejected on the remaining header',
      a.kind === 'rate-limited' && b.kind === 'rejected' && c.kind === 'rejected' && a.reason !== b.reason,
      `limited=${a.kind} rejected=${b.kind} unauthorised=${c.kind}`)
  }

  // 10. No stored credential refuses with ZERO network calls. The clause that
  // carries this is `called === false`: an implementation that asked GitHub
  // and then mapped the 401 answers "no credential" too, while having put an
  // empty Bearer header on the wire.
  {
    let called = false
    const res = await gh({ store: ghStore(undefined), requester: async () => { called = true; return { status: 200, body: '{}', headers: {} } } })
    ok('10 no stored credential refuses before any request is made',
      res.kind === 'no-credential' && called === false, `kind=${res.kind} called=${called}`)
  }

  // 11. A malformed 200 is its own answer, and a FAILED SECOND request fails
  // the WHOLE load rather than rendering one group as if it were the answer.
  // A partial answer shown as a complete one is the confident-wrong-answer
  // failure this repo refuses everywhere: a user seeing one group has no way
  // to know the other query returned 500.
  {
    let call = 0
    const a = await gh({ store: ghStore('ghp_token'), requester: async () => ({ status: 200, body: 'not json', headers: {} }) })
    const b = await gh({ store: ghStore('ghp_token'), requester: async () => (call++ === 0
      ? { status: 200, body: JSON.stringify({ total_count: 0, items: [] }), headers: {} }
      : { status: 500, body: '', headers: {} }) })
    ok('11 a malformed body and a failed second query each fail the whole load',
      a.kind === 'malformed' && b.kind === 'unavailable', `a=${a.kind} b=${b.kind}`)
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
