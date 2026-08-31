/* Offline contract checks for the work adapters (M17's Jira, M24's GitHub).  The requester is injected:
   npm run verify is the repo's one green-or-not signal and must not call Jira. */
'use strict'
const { existsSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

const source = join(__dirname, '..', 'src', 'main', 'jira-client.ts')
const out = join(__dirname, '..', 'out', 'verify', 'work.cjs')
let J = {}
if (existsSync(source)) {
  execFileSync('npx', ['esbuild', source, '--bundle', '--platform=node', '--outfile=' + out], { stdio: 'inherit' })
  J = require(out)
}

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

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
