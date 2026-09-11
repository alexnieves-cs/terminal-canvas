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

  // M115 — pr.1. OPEN PR THROUGH THE BROKER, literally: one POST to
  //      /repos/{owner}/{repo}/pulls with the branch, base, title and body,
  //      the teammate and panel riding so the broker's OWN write gate asks
  //      M102's spend card; a 422 "already exists" is not a failure — one GET
  //      finds the open PR for that head and the card gets its number anyway;
  //      every other arm in the credential rows' words. The comment door is
  //      the same shape at /issues/{n}/comments.
  {
    const req = { repo: 'acme/canvas', head: 'tc/c9-2026', base: 'main', title: 'Fix the thing', body: 'Dispatched from the board.' }
    const has2 = typeof G.openPullRequest === 'function' && typeof G.commentIssue === 'function'
    let opened, calls = [], exists, existsCalls = [], noCred, rejected, down, junk, refused, commented, commentCalls = []
    try {
      const b1 = broker(() => ({ ok: true, status: 201, truncated: false, body: JSON.stringify({ number: 42, html_url: 'https://github.com/acme/canvas/pull/42' }) }), calls)
      opened = has2 ? await G.openPullRequest({ broker: b1, panelId: 'c9', teammateId: 'tm-ada' }, req) : null
      const b2 = broker((q) => q.method === 'POST'
        ? { ok: true, status: 422, truncated: false, body: JSON.stringify({ message: 'Validation Failed', errors: [{ message: 'A pull request already exists for acme:tc/c9-2026.' }] }) }
        : { ok: true, status: 200, truncated: false, body: JSON.stringify([{ number: 41, html_url: 'https://github.com/acme/canvas/pull/41' }]) }, existsCalls)
      exists = has2 ? await G.openPullRequest({ broker: b2 }, req) : null
      noCred = has2 ? await G.openPullRequest({ broker: broker(() => ({ ok: false, code: 'not-connected', reason: 'not connected — add a github token in ⌘K › Credentials' })) }, req) : null
      rejected = has2 ? await G.openPullRequest({ broker: broker(() => ({ ok: true, status: 401, truncated: false, body: '{}' })) }, req) : null
      down = has2 ? await G.openPullRequest({ broker: broker(() => ({ ok: false, reason: 'the request failed — ENOTFOUND' })) }, req) : null
      junk = has2 ? await G.openPullRequest({ broker: broker(() => ({ ok: true, status: 201, truncated: false, body: '<html>' })) }, req) : null
      refused = has2 ? await G.openPullRequest({ broker: broker(() => ({ ok: false, code: 'not-answered', reason: 'ada did not approve the write' })) }, req) : null
      const b3 = broker(() => ({ ok: true, status: 201, truncated: false, body: JSON.stringify({ id: 1, html_url: 'https://github.com/acme/canvas/issues/7#issuecomment-1' }) }), commentCalls)
      commented = has2 ? await G.commentIssue({ broker: b3, teammateId: 'tm-ada' }, { repo: 'acme/canvas', number: 7, body: 'PR: https://github.com/acme/canvas/pull/42' }) : null
    } catch (e) { opened = { threw: String(e) } }
    const post = calls[0]
    const postBody = post && post.body ? JSON.parse(post.body) : null
    ok('pr.1 openPullRequest POSTs /repos/{owner}/{repo}/pulls through the broker with title/head/base/body, teammate and panel riding; 201 is opened with number and url; a 422 already-exists is one GET by head and `exists` with the found PR; not-connected, 401, a failed request, an unreadable body and a teammate\'s unanswered write are each their own arm in the credential rows\' words; commentIssue POSTs /issues/{n}/comments',
      opened && opened.kind === 'opened' && opened.number === 42 && /pull\/42/.test(opened.url) &&
        post && post.service === 'github' && post.method === 'POST' && post.path === '/repos/acme/canvas/pulls' && post.teammateId === 'tm-ada' && post.panelId === 'c9' &&
        postBody && postBody.title === req.title && postBody.head === req.head && postBody.base === req.base && postBody.body === req.body &&
        exists && exists.kind === 'exists' && exists.number === 41 && existsCalls.length === 2 && existsCalls[1].method === 'GET' && /\/repos\/acme\/canvas\/pulls\?/.test(existsCalls[1].path) && /head=acme(%3A|:)tc/.test(existsCalls[1].path) &&
        noCred && noCred.kind === 'no-credential' && /add a github token/.test(noCred.reason) &&
        rejected && rejected.kind === 'rejected' && down && down.kind === 'unavailable' && junk && junk.kind === 'malformed' &&
        refused && refused.kind === 'refused' && /did not approve/.test(refused.reason) &&
        commented && commented.kind === 'commented' && commentCalls[0] && commentCalls[0].path === '/repos/acme/canvas/issues/7/comments' && commentCalls[0].method === 'POST' && JSON.parse(commentCalls[0].body).body === 'PR: https://github.com/acme/canvas/pull/42',
      JSON.stringify({ opened, post, exists, existsCalls: existsCalls.map((c) => [c.method, c.path]), noCred, rejected, down, junk, refused, commented }))
  }

  // M255 — publish.*. PUBLISHING IS A PERSON'S ACT, WITH THE TEXT IN FRONT OF
  //     THEM. main/github-publish.ts reads a DRAFT FILE, resolves the repo
  //     from the file's own origin remote, passes the body through outward(),
  //     asks `confirm` EVERY time (no memo) naming the repo, the target, the
  //     title, the opening lines and the redaction count — and only then
  //     calls the broker with personConfirmed. Driven over a fake broker, a
  //     fake confirm and a fake remote, with REAL temp files for the draft.
  {
    const { mkdtempSync, writeFileSync, mkdirSync } = require('node:fs')
    const { tmpdir } = require('node:os')
    const psource = join(__dirname, '..', 'src', 'main', 'github-publish.ts')
    const pout = join(__dirname, '..', 'out', 'verify', 'github-publish.cjs')
    let P = {}
    if (existsSync(psource)) {
      execFileSync('npx', ['esbuild', psource, '--bundle', '--platform=node', '--outfile=' + pout], { stdio: 'inherit' })
      P = require(pout)
    }
    const hasP = typeof P.publish === 'function' && typeof P.repoFromRemote === 'function'
    const need = (name) => { if (!hasP) ok(name, false, 'github-publish.ts does not export publish / repoFromRemote'); return hasP }
    const TOKEN = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const dir = mkdtempSync(join(tmpdir(), 'tc publish '))
    const draft = join(dir, 'RELEASE_NOTES.md')
    writeFileSync(draft, `# v1.2.0\n\nFaster canvas.\n\nDebug token: ${TOKEN}\n`)
    const asks = []
    let answer = true
    const confirm = async (ask) => { asks.push(ask); return answer }
    const origin = async () => 'git@github.com:acme/canvas.git'
    const pubBroker = (reply) => broker((q) => reply(q))
    const created = () => ({ ok: true, status: 201, truncated: false, body: JSON.stringify({ html_url: 'https://github.com/acme/canvas/releases/tag/v1.2.0' }) })

    if (need('publish.1 the draft passes outward() before it leaves: a planted token is scrubbed from the body the broker receives, and the confirm names the redaction count, the repo, the target and the title')) {
      asks.length = 0; answer = true
      const b = pubBroker(created)
      const r = await P.publish({ broker: b, confirm, remoteOf: origin }, { kind: 'release', path: draft, tag: 'v1.2.0' })
      const sent = b.calls[0] ? b.calls[0].body : ''
      ok('publish.1 the draft passes outward() before it leaves: a planted token is scrubbed from the body the broker receives, and the confirm names the redaction count, the repo, the target and the title',
        r.kind === 'published' && !sent.includes(TOKEN) && asks.length === 1 && asks[0].redacted === 1 &&
          /acme\/canvas/.test(asks[0].detail) && /1 secret/.test(asks[0].detail) && /release/i.test(asks[0].message) && /v1\.2\.0/.test(asks[0].message) &&
          asks[0].title === 'v1.2.0' && !JSON.stringify(asks[0]).includes(TOKEN),
        JSON.stringify({ r, asks, sent: sent.slice(0, 120) }))
    }

    if (need('publish.2 a cancelled confirm sends nothing: zero broker calls, and the answer is cancelled — never a refusal')) {
      asks.length = 0; answer = false
      const b = pubBroker(created)
      const r = await P.publish({ broker: b, confirm, remoteOf: origin }, { kind: 'comment', path: draft, number: 7 })
      ok('publish.2 a cancelled confirm sends nothing: zero broker calls, and the answer is cancelled — never a refusal',
        r.kind === 'cancelled' && b.calls.length === 0 && asks.length === 1,
        JSON.stringify({ r, calls: b.calls.length }))
    }

    if (need('publish.3 confirmed, each target is exactly ONE POST with personConfirmed: a release to /repos/{r}/releases with tag_name, name and body, and a comment to /repos/{r}/issues/{n}/comments')) {
      answer = true
      const rb = pubBroker(created)
      const rel = await P.publish({ broker: rb, confirm, remoteOf: origin }, { kind: 'release', path: draft, tag: 'v1.2.0' })
      const relBody = rb.calls[0] ? JSON.parse(rb.calls[0].body) : {}
      const cb = pubBroker(() => ({ ok: true, status: 201, truncated: false, body: JSON.stringify({ html_url: 'https://github.com/acme/canvas/pull/7#issuecomment-1' }) }))
      const com = await P.publish({ broker: cb, confirm, remoteOf: origin }, { kind: 'comment', path: draft, number: 7 })
      ok('publish.3 confirmed, each target is exactly ONE POST with personConfirmed: a release to /repos/{r}/releases with tag_name, name and body, and a comment to /repos/{r}/issues/{n}/comments',
        rb.calls.length === 1 && rb.calls[0].method === 'POST' && rb.calls[0].path === '/repos/acme/canvas/releases' && rb.calls[0].personConfirmed === true && rb.calls[0].service === 'github' &&
          relBody.tag_name === 'v1.2.0' && relBody.name === 'v1.2.0' && /Faster canvas/.test(relBody.body) &&
          rel.kind === 'published' && rel.url === 'https://github.com/acme/canvas/releases/tag/v1.2.0' &&
          cb.calls.length === 1 && cb.calls[0].path === '/repos/acme/canvas/issues/7/comments' && cb.calls[0].personConfirmed === true &&
          com.kind === 'published' && /issuecomment/.test(com.url),
        JSON.stringify({ rel, com, relCalls: rb.calls, comCalls: cb.calls.map((c) => c.path) }))
    }

    if (need('publish.4 the repo comes from the file\'s own origin (ssh, https and ssh:// forms); a non-GitHub remote, no remote, a missing file and a directory are each refused BY NAME before anyone is asked; a missing credential is its own arm')) {
      asks.length = 0; answer = true
      const forms = ['git@github.com:acme/canvas.git', 'https://github.com/acme/canvas.git', 'https://github.com/acme/canvas', 'ssh://git@github.com/acme/canvas.git'].map((u) => P.repoFromRemote(u))
      const gitlab = await P.publish({ broker: pubBroker(created), confirm, remoteOf: async () => 'https://gitlab.com/acme/canvas.git' }, { kind: 'release', path: draft, tag: 'v1' })
      const noRemote = await P.publish({ broker: pubBroker(created), confirm, remoteOf: async () => null }, { kind: 'release', path: draft, tag: 'v1' })
      const missing = await P.publish({ broker: pubBroker(created), confirm, remoteOf: origin }, { kind: 'release', path: join(dir, 'nope.md'), tag: 'v1' })
      const sub = join(dir, 'sub'); mkdirSync(sub)
      const directory = await P.publish({ broker: pubBroker(created), confirm, remoteOf: origin }, { kind: 'release', path: sub, tag: 'v1' })
      const askedBeforeCred = asks.length
      const noCred = await P.publish({ broker: pubBroker(() => ({ ok: false, code: 'not-connected', reason: 'not connected — add a GitHub token in ⌘K › Credentials' })), confirm, remoteOf: origin }, { kind: 'release', path: draft, tag: 'v1' })
      ok('publish.4 the repo comes from the file\'s own origin (ssh, https and ssh:// forms); a non-GitHub remote, no remote, a missing file and a directory are each refused BY NAME before anyone is asked; a missing credential is its own arm',
        forms.every((f) => f === 'acme/canvas') && P.repoFromRemote('https://gitlab.com/acme/canvas.git') === null &&
          gitlab.kind === 'refused' && /GitHub/.test(gitlab.reason) &&
          noRemote.kind === 'refused' && /remote/.test(noRemote.reason) &&
          missing.kind === 'refused' && /nope\.md/.test(missing.reason) &&
          directory.kind === 'refused' && /not a file/.test(directory.reason) &&
          askedBeforeCred === 0 &&
          noCred.kind === 'no-credential' && /Credentials/.test(noCred.reason),
        JSON.stringify({ forms, gitlab, noRemote, missing, directory, askedBeforeCred, noCred }))
    }

    if (need('publish.5 a Discussion asks FIRST, then looks up the repository and category; an unknown category is refused naming the ones that exist and NO mutation is sent; a known one sends createDiscussion with both ids')) {
      asks.length = 0; answer = true
      const graph = (q) => {
        const body = JSON.parse(q.body)
        if (/createDiscussion/.test(body.query)) return { ok: true, status: 200, truncated: false, body: JSON.stringify({ data: { createDiscussion: { discussion: { url: 'https://github.com/acme/canvas/discussions/9' } } } }) }
        return { ok: true, status: 200, truncated: false, body: JSON.stringify({ data: { repository: { id: 'R_1', discussionCategories: { nodes: [{ id: 'C_ann', name: 'Announcements' }, { id: 'C_q', name: 'Q&A' }] } } } }) }
      }
      const bad = pubBroker(graph)
      const unknown = await P.publish({ broker: bad, confirm, remoteOf: origin }, { kind: 'discussion', path: draft, category: 'Ideas' })
      const good = pubBroker(graph)
      const posted = await P.publish({ broker: good, confirm, remoteOf: origin }, { kind: 'discussion', path: draft, category: 'announcements' })
      const mutation = good.calls.find((c) => /createDiscussion/.test(JSON.parse(c.body).query))
      const vars = mutation ? JSON.parse(mutation.body).variables : {}
      ok('publish.5 a Discussion asks FIRST, then looks up the repository and category; an unknown category is refused naming the ones that exist and NO mutation is sent; a known one sends createDiscussion with both ids',
        asks.length === 2 &&
          unknown.kind === 'refused' && /Ideas/.test(unknown.reason) && /Announcements/.test(unknown.reason) &&
          !bad.calls.some((c) => /createDiscussion/.test(JSON.parse(c.body).query)) &&
          bad.calls.every((c) => c.path === '/graphql' && c.personConfirmed === true) &&
          posted.kind === 'published' && posted.url === 'https://github.com/acme/canvas/discussions/9' &&
          mutation !== undefined && vars.repositoryId === 'R_1' && vars.categoryId === 'C_ann' && vars.title === 'v1.2.0' && !JSON.stringify(vars).includes(TOKEN),
        JSON.stringify({ unknown, posted, calls: good.calls.map((c) => JSON.parse(c.body).query.slice(0, 30)), vars }))
    }

    if (need('publish.6 there is no memo: two publishes of the same draft to the same target ask twice')) {
      asks.length = 0; answer = true
      await P.publish({ broker: pubBroker(created), confirm, remoteOf: origin }, { kind: 'release', path: draft, tag: 'v1.2.0' })
      await P.publish({ broker: pubBroker(created), confirm, remoteOf: origin }, { kind: 'release', path: draft, tag: 'v1.2.0' })
      ok('publish.6 there is no memo: two publishes of the same draft to the same target ask twice', asks.length === 2, JSON.stringify({ asked: asks.length }))
    }

    // M255 (the critic's observation). The confirm shows the opening lines,
    // but the WHOLE body is sent — so a long draft's confirm says how many
    // lines it did not show and where to read them, rather than reading as
    // the entire post.
    if (need('publish.7 a long draft\'s confirm names how many lines it did not show and the file to read them in, while the whole body is sent')) {
      asks.length = 0; answer = true
      const long = join(dir, 'ANNOUNCEMENT.md')
      writeFileSync(long, ['# v2', ...Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)].join('\n'))
      const b = pubBroker(created)
      await P.publish({ broker: b, confirm, remoteOf: origin }, { kind: 'release', path: long, tag: 'v2' })
      const sentBody = b.calls[0] ? JSON.parse(b.calls[0].body).body : ''
      ok('publish.7 a long draft\'s confirm names how many lines it did not show and the file to read them in, while the whole body is sent',
        asks.length === 1 && /12 more lines not shown/.test(asks[0].detail) && /ANNOUNCEMENT\.md/.test(asks[0].detail) && !/line 20/.test(asks[0].detail) && /line 20/.test(sentBody),
        JSON.stringify({ detail: asks[0] && asks[0].detail }))
    }
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length === 0 ? 0 : 1)
})()
