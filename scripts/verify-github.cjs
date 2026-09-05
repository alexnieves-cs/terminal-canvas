/* M88. Offline contract checks for the GitHub client — "GitHub through the
   broker", literally: the client asks the broker (M87) and never touches the
   credential store, so the store keeps exactly its three readers. A fake
   broker with recorded bodies stands in for the API; npm run verify never
   calls api.github.com. */
'use strict'
const { existsSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')
const source = join(__dirname, '..', 'src', 'main', 'github-client.ts')
const out = join(__dirname, '..', 'out', 'verify', 'github.cjs')
let G = {}
if (existsSync(source)) {
  execFileSync('npx', ['esbuild', source, '--bundle', '--platform=node', '--outfile=' + out], { stdio: 'inherit' })
  G = require(out)
}
const results = []
const ok = (label, pass, detail) => {
  results.push({ label, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`)
}
const ISSUES = JSON.stringify([
  { number: 12, title: 'Flaky watchdog', body: 'The watchdog fires under load.\n\nSteps…', state: 'open', html_url: 'https://github.com/acme/canvas/issues/12', repository: { full_name: 'acme/canvas' }, assignee: { login: 'octocat' } },
  { number: 40, title: 'A PR listed under issues', body: 'x', state: 'open', html_url: 'https://github.com/acme/canvas/pull/40', repository: { full_name: 'acme/canvas' }, pull_request: { url: 'https://api.github.com/repos/acme/canvas/pulls/40' } },
  { number: 'nope', title: 7 }
])
const SEARCH = JSON.stringify({ total_count: 1, items: [
  { number: 77, title: 'Split the flush gate', body: 'Please review.', state: 'open', html_url: 'https://github.com/acme/canvas/pull/77', repository_url: 'https://api.github.com/repos/acme/canvas', pull_request: { url: 'x' }, user: { login: 'worker-a' } }
] })
const broker = (reply, calls = []) => ({ calls, call: async (q) => { calls.push(q); return reply(q) } })
const served = (q) => ({ ok: true, status: 200, truncated: false, body: q.path.includes('/search/') ? SEARCH : ISSUES })

;(async () => {
  const has = typeof G.listAssignedWorkItems === 'function'

  // 1. The broker's "not connected" is the panel's own no-credential arm, in the credential rows' words.
  // Sorted by CODE, not by the sentence: the sentence is the schema's and may be reworded.
  { const b = broker(() => ({ ok: false, code: 'not-connected', reason: 'not connected — add a github token in ⌘K › Credentials' }))
    const r = has ? await G.listAssignedWorkItems({ broker: b }) : null
    ok('1 the broker\'s not-connected refusal is the no-credential arm, in the same words the credential rows use',
      r && r.kind === 'no-credential' && /not connected/.test(r.reason) && /Credentials/.test(r.reason), JSON.stringify(r)) }

  // 2. Two GETs through the broker, for the github service, the panel id riding along; nothing else on the call.
  { const b = broker(served)
    const r = has ? await G.listAssignedWorkItems({ broker: b, panelId: 'g1' }) : null
    ok('2 two GET calls go through the broker for the github service with the panel id, one for assigned issues and one for review requests',
      r && r.kind === 'items' && b.calls.length === 2 && b.calls.every((c) => c.service === 'github' && c.method === 'GET' && c.panelId === 'g1' && !('headers' in c)) &&
        b.calls.some((c) => /^\/issues\?/.test(c.path) && /filter=assigned/.test(c.path)) && b.calls.some((c) => /^\/search\/issues\?/.test(c.path) && /review-requested/.test(c.path)),
      JSON.stringify(b.calls)) }

  // 3. Issues and PRs map to WorkItems with owner/repo#N ids; a PR in the issues list is a PR once; a malformed entry is dropped alone.
  { const r = has ? await G.listAssignedWorkItems({ broker: broker(served) }) : null
    const items = r && r.kind === 'items' ? r.items : []
    const issue = items.find((i) => i.id === 'acme/canvas#12')
    const pr = items.find((i) => i.id === 'acme/canvas#77')
    ok('3 issues and review-requested PRs become WorkItems keyed owner/repo#N, a PR in the issues list is a PR once, a malformed entry is dropped alone',
      items.length === 3 && issue && issue.title === 'Flaky watchdog' && issue.state === 'open' && issue.url === 'https://github.com/acme/canvas/issues/12' && issue.assignee === 'octocat' && /watchdog fires/.test(issue.description) &&
        pr && pr.state === 'review requested' && pr.url === 'https://github.com/acme/canvas/pull/77' && pr.assignee === null &&
        items.filter((i) => i.id === 'acme/canvas#40').length === 1 && items.find((i) => i.id === 'acme/canvas#40').state === 'pull request',
      JSON.stringify(items.map((i) => [i.id, i.state]))) }

  // 4. Rejected, unavailable and malformed are three arms, each with a reason.
  { const rej = has ? await G.listAssignedWorkItems({ broker: broker(() => ({ ok: true, status: 401, truncated: false, body: '{"message":"Bad credentials"}' })) }) : null
    const down = has ? await G.listAssignedWorkItems({ broker: broker(() => ({ ok: false, reason: 'the request failed — ENOTFOUND' })) }) : null
    const five = has ? await G.listAssignedWorkItems({ broker: broker(() => ({ ok: true, status: 502, truncated: false, body: '' })) }) : null
    const junk = has ? await G.listAssignedWorkItems({ broker: broker(() => ({ ok: true, status: 200, truncated: false, body: '<html>' })) }) : null
    ok('4 401 is rejected, a failed request and a 5xx are unavailable, and a body that is not JSON is malformed — each with a reason',
      rej && rej.kind === 'rejected' && down && down.kind === 'unavailable' && /ENOTFOUND/.test(down.reason) && five && five.kind === 'unavailable' && /502/.test(five.reason) && junk && junk.kind === 'malformed',
      JSON.stringify({ rej, down, five, junk })) }

  // 6. M88's verifier: 403 is NOT a bad credential (a rate limit, an SSO org) and says GitHub's own message; a truncated answer is a named
  //    reason rather than `malformed`; the 50-item page and a search total past the page each leave a note; control bytes in a body are
  //    stripped and CRLF is normalised before the body can reach a terminal.
  { const rate = has ? await G.listAssignedWorkItems({ broker: broker(() => ({ ok: true, status: 403, truncated: false, body: '{"message":"API rate limit exceeded for user"}' })) }) : null
    const cut = has ? await G.listAssignedWorkItems({ broker: broker(() => ({ ok: true, status: 200, truncated: true, body: '[{"number":1,' })) }) : null
    const fifty = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ number: i + 1, title: `t${i}`, body: '', state: 'open', html_url: `https://github.com/a/b/issues/${i + 1}`, repository: { full_name: 'a/b' } })))
    const many = has ? await G.listAssignedWorkItems({ broker: broker((q) => q.path.includes('/search/') ? ({ ok: true, status: 200, truncated: false, body: JSON.stringify({ total_count: 120, items: [{ number: 900, title: 'p', body: '', state: 'open', html_url: 'https://github.com/a/b/pull/900', repository_url: 'https://api.github.com/repos/a/b', pull_request: {} }] }) }) : ({ ok: true, status: 200, truncated: false, body: fifty })) }) : null
    const dirty = JSON.stringify([{ number: 2, title: 'x', body: 'line one\r\nline two \u001b[2J\u0007 end', state: 'open', html_url: 'https://github.com/a/b/issues/2', repository: { full_name: 'a/b' } }])
    const cleaned = has ? await G.listAssignedWorkItems({ broker: broker((q) => q.path.includes('/search/') ? ({ ok: true, status: 200, truncated: false, body: '{"total_count":0,"items":[]}' }) : ({ ok: true, status: 200, truncated: false, body: dirty })) }) : null
    const desc = cleaned && cleaned.kind === 'items' ? cleaned.items[0].description : ''
    ok('6 403 is unavailable with GitHub\'s own message rather than a rejected credential; a truncated answer is a named reason; a full page and a search total past the page each leave a note; ESC and BEL are stripped from a body and CRLF becomes LF',
      rate && rate.kind === 'unavailable' && /rate limit/.test(rate.reason) &&
        cut && cut.kind === 'unavailable' && /too large/.test(cut.reason) &&
        many && many.kind === 'items' && /first 50 issues/.test(many.note ?? '') && /first 1 of 120/.test(many.note ?? '') &&
        desc === 'line one\nline two  end',
      JSON.stringify({ rate, cut: cut && cut.reason, note: many && many.note, desc })) }

  // 5. The description is capped, and the search failing alone still lists the issues with a note.
  { const long = JSON.stringify([{ number: 1, title: 't', body: 'y'.repeat(5000), state: 'open', html_url: 'https://github.com/a/b/issues/1', repository: { full_name: 'a/b' } }])
    const r = has ? await G.listAssignedWorkItems({ broker: broker((q) => q.path.includes('/search/') ? ({ ok: true, status: 500, truncated: false, body: '' }) : ({ ok: true, status: 200, truncated: false, body: long })) }) : null
    ok('5 a description is capped at 2000 characters, and when only the PR search fails the issues still list with a note saying so',
      r && r.kind === 'items' && r.items.length === 1 && r.items[0].description.length === 2000 && typeof r.note === 'string' && /pull request/.test(r.note),
      JSON.stringify(r && { n: r.items && r.items.length, note: r.note })) }

  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length === 0 ? 0 : 1)
})()
