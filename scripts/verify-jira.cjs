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

  // A requester that records EVERY call, so the zero-call assertions below
  // are about a probe that was demonstrably alive rather than about silence.
  const recorder = (reply) => {
    const calls = []
    return { calls, requester: async (r) => { calls.push(r); return reply(r) } }
  }

  const tRec = recorder(() => ({ status: 200, body: JSON.stringify({ transitions: [
    { id: '31', name: 'Done', to: { name: 'Done' } },
    { id: '21', name: 'In Progress', to: { name: 'In Progress' } },
    { id: 'skip-me' }
  ] }) }))
  const transitions = typeof J.listWorkItemTransitions === 'function'
    ? await J.listWorkItemTransitions({ store: store(BUNDLE), requester: tRec.requester }, 'TC-12')
    : null
  ok('8 transitions are read per issue and mapped to a neutral shape',
    transitions?.kind === 'transitions' && transitions.transitions.length === 2 &&
      transitions.transitions[0].id === '31' && transitions.transitions[0].name === 'Done' &&
      transitions.transitions[0].toState === 'Done' &&
      tRec.calls[0]?.method === 'GET' &&
      tRec.calls[0]?.url === 'https://acme.atlassian.net/rest/api/3/issue/TC-12/transitions')

  const cRec = recorder(() => ({ status: 201, body: '{}' }))
  const commented = typeof J.commentOnWorkItem === 'function'
    ? await J.commentOnWorkItem({ store: store(BUNDLE), requester: cRec.requester }, 'TC-12', 'Agent finished\nSecond line')
    : null
  const sentBody = (() => { try { return JSON.parse(cRec.calls[0]?.body ?? 'null') } catch { return null } })()
  ok('9 a comment POSTs ADF that flattens back to what was typed',
    commented?.kind === 'done' && cRec.calls[0]?.method === 'POST' &&
      cRec.calls[0]?.url === 'https://acme.atlassian.net/rest/api/3/issue/TC-12/comment' &&
      cRec.calls[0]?.headers['Content-Type'] === 'application/json' &&
      J.adfText(sentBody?.body).trim() === 'Agent finished\nSecond line')

  const xRec = recorder(() => ({ status: 204, body: '' }))
  const moved = typeof J.transitionWorkItem === 'function'
    ? await J.transitionWorkItem({ store: store(BUNDLE), requester: xRec.requester }, 'TC-12', '31')
    : null
  ok('10 a transition POSTs the chosen id and treats 204 as success',
    moved?.kind === 'done' && xRec.calls[0]?.method === 'POST' &&
      xRec.calls[0]?.url === 'https://acme.atlassian.net/rest/api/3/issue/TC-12/transitions' &&
      JSON.parse(xRec.calls[0]?.body ?? 'null')?.transition?.id === '31')

  // 11. The rule verify:jira 4 states for the read path, restated for all
  //     three new channels at once. A write attempted with no stored
  //     credential must not reach the network to find that out.
  const nRec = recorder(() => ({ status: 200, body: '{}' }))
  const noCred = typeof J.commentOnWorkItem === 'function' ? [
    await J.listWorkItemTransitions({ store: store(undefined), requester: nRec.requester }, 'TC-12'),
    await J.commentOnWorkItem({ store: store(undefined), requester: nRec.requester }, 'TC-12', 'hi'),
    await J.transitionWorkItem({ store: store(undefined), requester: nRec.requester }, 'TC-12', '31')
  ] : []
  ok('11 all three channels refuse a missing credential with zero requests',
    noCred.length === 3 && noCred.every((r) => r.kind === 'no-credential') && nRec.calls.length === 0)

  // 12. The split this milestone adds, and the reason it is two arms: a board
  //     declining a transition and Jira being unreachable have two different
  //     fixes. A check asserting only "not done" passes against the collapse.
  const refused = typeof J.transitionWorkItem === 'function'
    ? await J.transitionWorkItem({ store: store(BUNDLE), requester: async () => ({
      status: 400, body: JSON.stringify({ errorMessages: ['Transition is not valid for this issue.'] })
    }) }, 'TC-12', '31')
    : null
  const down = typeof J.transitionWorkItem === 'function'
    ? await J.transitionWorkItem({ store: store(BUNDLE), requester: async () => { throw new Error('ECONNREFUSED') } }, 'TC-12', '31')
    : null
  ok('12 a 400 is refused with Jira\'s own message; an unreachable Jira is not',
    refused?.kind === 'refused' && refused.reason === 'Transition is not valid for this issue.' &&
      down?.kind === 'unavailable')

  // 13. An empty comment is refused BEFORE the network, like a missing
  //     credential — the panel's Send is disabled for it, so reaching this
  //     branch at all means something upstream changed.
  const eRec = recorder(() => ({ status: 201, body: '{}' }))
  const empty = typeof J.commentOnWorkItem === 'function'
    ? await J.commentOnWorkItem({ store: store(BUNDLE), requester: eRec.requester }, 'TC-12', '   ')
    : null
  ok('13 an empty comment is refused with zero requests',
    empty?.kind === 'refused' && eRec.calls.length === 0)

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
