/* Offline contract checks for M17's Jira adapter.  The requester is injected:
   npm run verify is the repo's one green-or-not signal and must not call Jira. */
'use strict'
const { existsSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

const source = join(__dirname, '..', 'src', 'main', 'jira-client.ts')
const out = join(__dirname, '..', 'out', 'verify', 'jira.cjs')
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
  const item = listed?.kind === 'items' ? listed.items[0] : undefined
  ok('5 assigned-ticket mapping is vendor-neutral and JQL is bounded',
    item?.id === 'TC-12' && item.title === 'Ship Jira context' && item.description === 'First line\nSecond line' &&
      item.assignee === 'Ada Lovelace' && item.state === 'In Progress' && item.url === 'https://acme.atlassian.net/browse/TC-12' &&
      request?.url.includes('/rest/api/3/search/jql') && request?.url.includes('maxResults=50'))

  // 6. The seam that keeps this suite offline. `method` is REQUIRED on the
  //    record rather than optional-with-a-GET-default: an optional field lets
  //    a write function that forgot to set it silently perform a GET against a
  //    POST endpoint, which returns something plausible instead of failing.
  ok('6 the requester contract carries an explicit method',
    request?.method === 'GET')

  // 7. textToAdf is the deliberate INVERSE of adfText, so the pair is asserted
  //    as a ROUND TRIP rather than as two independent guesses about a format
  //    this repo does not own. A blank line between paragraphs is included
  //    because that is the case a naive one-paragraph builder loses.
  const SOURCE = 'First line\nSecond line\n\nAfter a blank'
  ok('7 textToAdf and adfText are inverses over the text a comment can hold',
    typeof J.textToAdf === 'function' && typeof J.adfText === 'function' &&
      J.adfText(J.textToAdf(SOURCE)).trim() === SOURCE)

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
