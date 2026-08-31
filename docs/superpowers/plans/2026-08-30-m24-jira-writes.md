# M24: Jira writes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person comment on and transition a Jira ticket from the Jira panel, with every write performed by main behind an explicit human gesture.

**Architecture:** `jira-client.ts`'s injected-requester seam widens to carry `method` and `body`, which is what keeps every write assertable under plain node with no network call. Three new invokes (`jira:transitions`, `jira:comment`, `jira:transition`) each perform one named mutation in main. The renderer grows a per-ticket component that owns its own draft state, cloned from `ReviewNode`'s commit form including its three silent-failure obligations.

**Tech Stack:** TypeScript, Electron (main/preload/renderer split), `node:https`, React 18, esbuild-backed plain-node verify suites.

**Spec:** `docs/superpowers/specs/2026-08-30-m24-jira-writes-design.md`

## Global Constraints

- **`npm run verify` never reaches Jira.** Every check drives an injected requester. This is the repo's standing rule that its one green-or-not signal stays fast and offline.
- **No agent-reachable path triggers a Jira write.** Write functions are called only from `main/ipc.ts` handlers. Nothing that builds a process environment imports `jira-client`.
- **No secret crosses IPC.** The Jira credential bundle stays behind `jira-client.ts` exactly as it does on the read path. No new return type carries `site`, `email`, or `token`.
- **`method` on `JiraRequest` is REQUIRED, never optional-with-a-GET-default.** An optional field means a write function that forgot to set it silently performs a GET against a POST endpoint — a wrong answer shaped like a working one. Required makes `tsc` list every call site.
- **Every failure lands in a named arm.** A blank panel is never an error signal.
- **Run only the suite your task touches. `npm run verify` runs ONCE, in Task 6.** It chains a typecheck, a build and 25 suites; running it per task would cost minutes each time to re-prove work nothing has touched. Measured facts to spend that budget well:
  - `verify:jira`, `verify:meta`, `verify:styles` are **plain node and need no build** — seconds each. Run them freely.
  - **`verify:ipc` needs NO `npm run build`** — it bundles `main/ipc.ts` through its own `buildSync`. Verified in this worktree against an empty `out/`: `1/1 passed, count=45`. Do not prefix it with a build.
  - **`verify:panels` DOES need `npm run build`** — it loads `out/renderer/index.html`, so run it against a stale `out/` and you are testing the previous commit. It is also the slow one: ~3–4 minutes, with a 300s watchdog.
  - **Every Electron-tier run needs `TC_VERIFY_SUFFIX` set** (e.g. `TC_VERIFY_SUFFIX=m24jira npm run verify`). `verify:panels` and `verify:pty-manager` each end in a tmux `kill-server`, on a socket name that is a module constant shared by every checkout — so a concurrent run in ANOTHER worktree destroys this one's sessions mid-run and reds checks in a branch that is fine. `scripts/verify-socket.cjs`'s own header documents it. MEASURED in this worktree: unsuffixed gave 180/191 then 173/191 with DIFFERENT failing sets; `TC_VERIFY_SUFFIX=m24jira` gave 189/191 then 190/191. This was missing from the plan as first written and cost a fix round of misdiagnosis.
  - **Run `npm run typecheck` once per task that changed `.ts`/`.tsx`, at the end** — not after every edit, and never in the same task twice.
- **Baseline at branch point, measured:** `verify:jira` 5/5, `verify:meta` 21/21, `verify:ipc` 1/1 (45 channels). Any suite red beyond your own new checks is yours to report, not to absorb.
- **Electron's binary needs `node node_modules/electron/install.js`** in a fresh worktree — `npm install` alone leaves it missing and every Electron-tier suite dies with "No such file or directory". Already done in this worktree.
- Commit format: `feat(m24): ...` / `test(m24): ...` / `docs(m24): ...`, ending with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/shared/work-item.ts` | Modify: add `WorkItemTransition`, the provider-neutral transition shape | 2 |
| `src/main/jira-client.ts` | Modify: widen the requester; add `textToAdf`, export `adfText`, add three verbs | 1, 2 |
| `scripts/verify-jira.cjs` | Modify: checks 6–13 | 1, 2 |
| `src/shared/ipc-contract.ts` | Modify: three channels, two result types, three bridge members | 3 |
| `src/main/ipc.ts` | Modify: three handlers | 3 |
| `src/preload/index.ts` | Modify: three bridge implementations | 3 |
| `scripts/verify-ipc-surface.cjs` | Modify: `EXPECTED_CHANNELS` 45 → 48 | 3 |
| `README.md` | Modify: IPC diagram, milestone row | 3, 6 |
| `scripts/verify-meta.cjs` | Modify: checks 22 and 23 | 4 |
| `src/renderer/jira/JiraTicket.tsx` | **Create**: one ticket row; owns its own draft, transition and in-flight state | 5 |
| `src/renderer/jira/JiraNode.tsx` | Modify: render `JiraTicket`, thread `restoreFocus`/`focusedId` | 5 |
| `src/renderer/canvas/Canvas.tsx` | Modify: pass `restoreFocus` and `focusedId` to `JiraNode` | 5 |
| `src/renderer/navgrid/useNavGrid.ts` | Modify: add `.jira-node__comment-form` to the target test | 5 |
| `src/renderer/styles.css` | Modify: write-control styles, tokens only | 5 |
| `scripts/verify-panels.cjs` | Modify: check 174 | 5 |
| `CLAUDE.md`, `docs/ideas-backlog.md` | Modify: record the mechanism; rewrite #12 down to what is still open | 6 |

**Why `JiraTicket.tsx` is a new file rather than more JSX in `JiraNode`:** each ticket row needs its *own* draft string, its own fetched transition list and its own in-flight flag. That is per-row state, and per-row state means per-row hooks, which means a component per row. There is no way to express it inside `JiraNode`'s `.map()` without hooks in a loop.

---

### Task 1: Widen the requester seam, and make ADF a round trip

**Files:**
- Modify: `src/main/jira-client.ts`
- Test: `scripts/verify-jira.cjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface JiraRequest { url: string; method: 'GET' | 'POST'; headers: Record<string, string>; timeoutMs: number; body?: string }`
  - `export function textToAdf(text: string): unknown`
  - `export function adfText(value: unknown): string` (was module-private)

- [ ] **Step 1: Write the failing checks**

Append inside the existing `void (async () => {` block in `scripts/verify-jira.cjs`, immediately before the `const failed = results.filter(...)` line:

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run verify:jira`
Expected: `6` FAILs (`request.method` is `undefined` — the record has no `method`), `7` FAILs (`J.textToAdf is not a function`). Checks 1–5 stay PASS. Report says `5/7 passed`.

- [ ] **Step 3: Widen the record and export the ADF pair**

In `src/main/jira-client.ts`, replace the `JiraRequest` interface:

```ts
/**
 * The injected seam. `method` is REQUIRED and not optional-with-a-default,
 * because an optional method means a write function that forgot to set it
 * performs a GET against a POST endpoint — a request that succeeds and does
 * nothing. Required makes tsc list every call site instead.
 */
export interface JiraRequest {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  timeoutMs: number
  /** JSON, already serialised. Absent on every GET. */
  body?: string
}
```

Change `function adfText` to `export function adfText`, and add its inverse directly beneath it:

```ts
/**
 * The inverse of adfText, and deliberately no more capable than it: Jira
 * Cloud's v3 comment endpoint requires Atlassian Document Format going in,
 * and this builds exactly the subset adfText can flatten back out. Reaching
 * for a Markdown-to-ADF converter here would invent a format the read half
 * cannot round-trip, so a comment would not read back as it was typed.
 */
export function textToAdf(text: string): unknown {
  return {
    type: 'doc',
    version: 1,
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      content: line === '' ? [] : [{ type: 'text', text: line }]
    }))
  }
}
```

Add `method: 'GET'` to both existing `deps.requester({...})` call sites (in `verifyJiraCredential` and `listAssignedWorkItems`). `tsc` will name them if either is missed.

Replace `createJiraRequester` so it honours the widened record:

```ts
export function createJiraRequester(): JiraRequester {
  return ({ url, method, headers, timeoutMs, body }) => new Promise((resolve, reject) => {
    // Content-Length is computed from the BYTE length, never the string
    // length: a ticket comment routinely contains non-ASCII, and a
    // character count there truncates the body Jira actually reads.
    const payload = body === undefined ? undefined : Buffer.from(body, 'utf8')
    const sent = payload === undefined
      ? headers
      : { ...headers, 'Content-Length': String(payload.byteLength) }
    const req = request(url, { method, headers: sent, timeout: timeoutMs }, (res) => {
      let received = ''; let bytes = 0
      res.setEncoding('utf8')
      res.on('data', (part: string) => {
        bytes += Buffer.byteLength(part)
        if (bytes > MAX_BODY_BYTES) res.destroy(new Error('response too large'))
        else received += part
      })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: received }))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm run verify:jira`
Expected: `7/7 passed`.

- [ ] **Step 5: Commit**

No typecheck here: Task 2 edits the same file and runs one at its end. A `tsc` failure naming a `deps.requester` call is the required-`method` change doing its job — add `method: 'GET'`.

```bash
git add src/main/jira-client.ts scripts/verify-jira.cjs
git commit -m "feat(m24): widen the Jira requester seam and make ADF a round trip"
```

---

### Task 2: The three client verbs

**Files:**
- Modify: `src/shared/work-item.ts`, `src/main/jira-client.ts`
- Test: `scripts/verify-jira.cjs`

**Interfaces:**
- Consumes: `JiraRequest` (with `method`/`body`), `textToAdf`, `adfText` from Task 1. `JiraDeps`, `credential()`, `auth()`, `TIMEOUT_MS` already exist.
- Produces:
  - `interface WorkItemTransition { id: string; name: string; toState: string | null }`
  - `type JiraTransitionsResult = { kind: 'transitions'; transitions: WorkItemTransition[] } | { kind: 'no-credential' | 'invalid-credential' | 'rejected' | 'unavailable' | 'malformed'; reason: string }`
  - `type JiraWriteResult = { kind: 'done' } | { kind: 'no-credential' | 'invalid-credential' | 'rejected' | 'refused' | 'unavailable' | 'malformed'; reason: string }`
  - `listWorkItemTransitions(deps: JiraDeps, itemId: string): Promise<JiraTransitionsResult>`
  - `commentOnWorkItem(deps: JiraDeps, itemId: string, text: string): Promise<JiraWriteResult>`
  - `transitionWorkItem(deps: JiraDeps, itemId: string, transitionId: string): Promise<JiraWriteResult>`

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-jira.cjs`, before the `const failed = ...` line:

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run verify:jira`
Expected: 8–13 FAIL (`J.listWorkItemTransitions is not a function` and siblings). 1–7 stay PASS. Report `7/13 passed`.

- [ ] **Step 3: Add the neutral transition shape**

Append to `src/shared/work-item.ts`:

```ts
/**
 * One legal next state for a work item. Provider-neutral like WorkItem, and
 * for the same reason: a second provider, not Jira alone, decides any wider
 * surface. `toState` is nullable because the state a transition leads to is
 * a display convenience, while the id is the fact the write needs.
 */
export interface WorkItemTransition {
  id: string
  name: string
  toState: string | null
}
```

- [ ] **Step 4: Add the verbs**

In `src/main/jira-client.ts`, import the new type (`import type { WorkItem, WorkItemTransition } from '../shared/work-item'`) and add, after `listAssignedWorkItems`:

```ts
export type JiraTransitionsResult =
  | { kind: 'transitions'; transitions: WorkItemTransition[] }
  | { kind: 'no-credential' | 'invalid-credential' | 'rejected' | 'unavailable' | 'malformed'; reason: string }

/**
 * `refused` is this milestone's one new arm and is NOT a flavour of
 * `unavailable`. It is review-commit.ts's refused/failed split: a workflow
 * declining a transition and Jira being unreachable are two situations with
 * two different fixes, and collapsing them sends a user to check their
 * network when their board is what said no. On a correctly configured,
 * fully reachable Jira, `refused` is the arm that happens routinely.
 */
export type JiraWriteResult =
  | { kind: 'done' }
  | { kind: 'no-credential' | 'invalid-credential' | 'rejected' | 'refused' | 'unavailable' | 'malformed'; reason: string }

function issueUrl(c: JiraCredential, itemId: string, suffix: string): string {
  return `${c.site}/rest/api/3/issue/${encodeURIComponent(itemId)}${suffix}`
}

function writeAuth(c: JiraCredential): Record<string, string> {
  return { ...auth(c), 'Content-Type': 'application/json' }
}

/**
 * Jira's own sentence, never a phrase this app invented. The user is the one
 * who can act on "Transition is not valid for this issue" and this app cannot
 * derive it — the same reason review-commit carries a hook's output verbatim.
 * This is work text, not credential material: it says nothing about the
 * token, only about the ticket.
 */
function jiraMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { errorMessages?: unknown; errors?: unknown }
    if (Array.isArray(parsed.errorMessages) && typeof parsed.errorMessages[0] === 'string') {
      return parsed.errorMessages[0]
    }
    if (parsed.errors !== null && typeof parsed.errors === 'object') {
      const first = Object.values(parsed.errors as Record<string, unknown>).find((v) => typeof v === 'string')
      if (typeof first === 'string') return first
    }
    return null
  } catch { return null }
}

/**
 * 400 and 404 are both `refused` rather than `unavailable`, and 404
 * deliberately so: Jira answers 404 for an issue the account may not browse,
 * to avoid disclosing that the issue exists. That is the board saying no,
 * not the network failing, so it takes the arm whose fix is "check your
 * permissions" rather than "check your connection".
 */
function writeFailure(
  response: { status: number; body: string },
  okStatuses: readonly number[]
): { kind: 'rejected' | 'refused' | 'unavailable'; reason: string } | null {
  if (okStatuses.includes(response.status)) return null
  if (response.status === 401 || response.status === 403) {
    return { kind: 'rejected', reason: 'Jira rejected the credential.' }
  }
  if (response.status === 400 || response.status === 404) {
    return { kind: 'refused', reason: jiraMessage(response.body) ?? 'Jira refused the change.' }
  }
  return { kind: 'unavailable', reason: `Jira answered ${response.status}.` }
}

/**
 * Read on demand, ONE issue at a time, and deliberately not folded into
 * listAssignedWorkItems: transitions are workflow-defined per issue, so
 * folding this in would fire one extra request per ticket on every panel
 * load, for tickets nobody is going to transition. review:diff's shape,
 * reached by the same arithmetic.
 */
export async function listWorkItemTransitions(deps: JiraDeps, itemId: string): Promise<JiraTransitionsResult> {
  const c = credential(deps.store)
  if (c === 'missing') return { kind: 'no-credential', reason: 'Connect Jira before loading transitions.' }
  if (c === 'invalid') return { kind: 'invalid-credential', reason: 'The stored Jira credential is malformed.' }
  let response: { status: number; body: string }
  try {
    response = await deps.requester({
      url: issueUrl(c, itemId, '/transitions'), method: 'GET', headers: auth(c), timeoutMs: TIMEOUT_MS
    })
  } catch { return { kind: 'unavailable', reason: 'Jira could not be reached.' } }
  if (response.status === 401 || response.status === 403) return { kind: 'rejected', reason: 'Jira rejected the credential.' }
  if (response.status !== 200) return { kind: 'unavailable', reason: `Jira answered ${response.status}.` }
  try {
    const raw = (JSON.parse(response.body) as { transitions?: unknown }).transitions
    if (!Array.isArray(raw)) return { kind: 'malformed', reason: 'Jira returned no transition list.' }
    const transitions: WorkItemTransition[] = []
    for (const entry of raw) {
      const record = entry as { id?: unknown; name?: unknown; to?: { name?: unknown } }
      // An entry missing either half is dropped INDIVIDUALLY, the same
      // per-entry tolerance parseLayout gives a malformed panel: one
      // unusable transition must not cost the user the whole list.
      if (typeof record.id !== 'string' || typeof record.name !== 'string') continue
      transitions.push({
        id: record.id,
        name: record.name,
        toState: typeof record.to?.name === 'string' ? record.to.name : null
      })
    }
    return { kind: 'transitions', transitions }
  } catch { return { kind: 'malformed', reason: 'Jira returned a response this app could not read.' } }
}

export async function commentOnWorkItem(deps: JiraDeps, itemId: string, text: string): Promise<JiraWriteResult> {
  const c = credential(deps.store)
  if (c === 'missing') return { kind: 'no-credential', reason: 'Connect Jira before commenting.' }
  if (c === 'invalid') return { kind: 'invalid-credential', reason: 'The stored Jira credential is malformed.' }
  const message = text.trim()
  // Refused BEFORE the network, like a missing credential. The panel's Send
  // is already disabled for an empty draft, so reaching this means something
  // upstream changed — it must still not post an empty comment.
  if (message === '') return { kind: 'refused', reason: 'A comment needs a body.' }
  let response: { status: number; body: string }
  try {
    response = await deps.requester({
      url: issueUrl(c, itemId, '/comment'), method: 'POST', headers: writeAuth(c),
      timeoutMs: TIMEOUT_MS, body: JSON.stringify({ body: textToAdf(message) })
    })
  } catch { return { kind: 'unavailable', reason: 'Jira could not be reached.' } }
  return writeFailure(response, [200, 201]) ?? { kind: 'done' }
}

export async function transitionWorkItem(deps: JiraDeps, itemId: string, transitionId: string): Promise<JiraWriteResult> {
  const c = credential(deps.store)
  if (c === 'missing') return { kind: 'no-credential', reason: 'Connect Jira before transitioning.' }
  if (c === 'invalid') return { kind: 'invalid-credential', reason: 'The stored Jira credential is malformed.' }
  let response: { status: number; body: string }
  try {
    response = await deps.requester({
      url: issueUrl(c, itemId, '/transitions'), method: 'POST', headers: writeAuth(c),
      timeoutMs: TIMEOUT_MS, body: JSON.stringify({ transition: { id: transitionId } })
    })
  } catch { return { kind: 'unavailable', reason: 'Jira could not be reached.' } }
  // 204 is Jira's success for this endpoint; 200 is accepted too rather than
  // treated as a failure, because a success status must never land in an
  // error arm and cost the user a second, duplicate transition attempt.
  return writeFailure(response, [200, 204]) ?? { kind: 'done' }
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm run verify:jira`
Expected: `13/13 passed`.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck` — expected clean.

```bash
git add src/shared/work-item.ts src/main/jira-client.ts scripts/verify-jira.cjs
git commit -m "feat(m24): comment, transition and per-issue transition reads"
```

---

### Task 3: The three IPC channels

**Files:**
- Modify: `src/shared/ipc-contract.ts`, `src/main/ipc.ts`, `src/preload/index.ts`
- Modify: `scripts/verify-ipc-surface.cjs:167`, `README.md:194`
- Test: `npm run verify:ipc` (needs a build first), `npm run verify:meta`

**Interfaces:**
- Consumes: `JiraTransitionsResult`, `JiraWriteResult`, `listWorkItemTransitions`, `commentOnWorkItem`, `transitionWorkItem` from Task 2.
- Produces: `window.canvas.jira.transitions(itemId)`, `.comment({ itemId, body })`, `.transition({ itemId, transitionId })`.

- [ ] **Step 1: Move the expected count first, so the check goes red**

In `scripts/verify-ipc-surface.cjs`, change `const EXPECTED_CHANNELS = 45` to `48`, and update the sum stated in its neighbouring comment to name M24's three.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run verify:ipc`
Expected: FAIL — 45 channels found, 48 expected.

**No `npm run build` here or anywhere in this task.** This suite bundles `main/ipc.ts` through its own `buildSync`; it was measured passing in this worktree against an empty `out/`.

- [ ] **Step 3: Declare the channels and the result types**

In `src/shared/ipc-contract.ts`, replace the `JIRA_LIST` line with:

```ts
  /** Main reads the authenticated user's assigned Jira work. */
  JIRA_LIST: 'jira:list',
  /**
   * The legal next states for ONE issue. Its own channel rather than a field
   * on jira:list, because transitions are workflow-defined per issue: folding
   * the read in would fire one request per ticket on every panel load, for
   * tickets nobody transitions. review:diff's pull-only shape, same arithmetic.
   */
  JIRA_TRANSITIONS: 'jira:transitions',
  /**
   * One named mutation, performed by main, behind an explicit human gesture.
   *
   * There are exactly two Jira writes and this is one of them. No agent-
   * reachable path may reach either: an agent lives in a PTY and has no
   * bridge, and nothing that builds a process environment imports the Jira
   * client. That rule has NO RUNTIME SYMPTOM when broken, so verify:meta 22
   * and 23 pin it as source text. See CLAUDE.md.
   */
  JIRA_COMMENT: 'jira:comment',
  /** The second, and last, Jira write. See JIRA_COMMENT. */
  JIRA_TRANSITION: 'jira:transition',
```

Add beneath `JiraListResult`:

```ts
export type JiraTransitionsResult =
  | { kind: 'transitions'; transitions: WorkItemTransition[] }
  | { kind: 'no-credential' | 'invalid-credential' | 'rejected' | 'unavailable' | 'malformed'; reason: string }

/** `refused` is the board saying no; `unavailable` is Jira being unreachable. Two fixes, two arms. */
export type JiraWriteResult =
  | { kind: 'done' }
  | { kind: 'no-credential' | 'invalid-credential' | 'rejected' | 'refused' | 'unavailable' | 'malformed'; reason: string }
```

Import `WorkItemTransition` alongside the existing `WorkItem` import in that file.

Replace the bridge member:

```ts
  jira: {
    list(): Promise<JiraListResult>
    transitions(itemId: string): Promise<JiraTransitionsResult>
    comment(req: { itemId: string; body: string }): Promise<JiraWriteResult>
    transition(req: { itemId: string; transitionId: string }): Promise<JiraWriteResult>
  }
```

- [ ] **Step 4: Handle them in main**

In `src/main/ipc.ts`, extend the existing import from `./jira-client` with `commentOnWorkItem, listWorkItemTransitions, transitionWorkItem`, and add after the `IPC.JIRA_LIST` handler:

```ts
  ipcMain.handle(IPC.JIRA_TRANSITIONS, (_event, itemId: string) =>
    listWorkItemTransitions({ store: credentialStore, requester: createJiraRequester() }, itemId))
  // The two writes. Each performs ONE named mutation and returns an arm —
  // never the credential bundle, never anything derived from it.
  ipcMain.handle(IPC.JIRA_COMMENT, (_event, req: { itemId: string; body: string }) =>
    commentOnWorkItem({ store: credentialStore, requester: createJiraRequester() }, req.itemId, req.body))
  ipcMain.handle(IPC.JIRA_TRANSITION, (_event, req: { itemId: string; transitionId: string }) =>
    transitionWorkItem({ store: credentialStore, requester: createJiraRequester() }, req.itemId, req.transitionId))
```

- [ ] **Step 5: Expose them in preload**

In `src/preload/index.ts`, replace line 140:

```ts
  jira: {
    list: () => ipcRenderer.invoke(IPC.JIRA_LIST),
    transitions: (itemId: string) => ipcRenderer.invoke(IPC.JIRA_TRANSITIONS, itemId),
    comment: (req: { itemId: string; body: string }) => ipcRenderer.invoke(IPC.JIRA_COMMENT, req),
    transition: (req: { itemId: string; transitionId: string }) => ipcRenderer.invoke(IPC.JIRA_TRANSITION, req)
  },
```

- [ ] **Step 6: Update the README diagram**

In `README.md`, replace the `jira:list` line inside the fenced diagram block with:

```
                       jira:list / jira:transitions
                       jira:comment / jira:transition
```

This is required, not cosmetic: `verify:meta` 14 asserts the diagram's own fenced block against the real contract, and it is the check that pays for that suite.

- [ ] **Step 7: Run to verify both pass**

Run: `npm run typecheck && npm run verify:ipc && npm run verify:meta`
Expected: `verify:ipc` `1/1` with `count=48`, `verify:meta` `21/21` (22 and 23 arrive in Task 4).

`verify:meta` matters here specifically because of its check 14, which asserts the README diagram's own fenced block against the real contract — it is the check that catches the Step 6 edit being skipped.

- [ ] **Step 8: Commit**

```bash
git add src/shared/ipc-contract.ts src/main/ipc.ts src/preload/index.ts scripts/verify-ipc-surface.cjs README.md
git commit -m "feat(m24): three Jira write channels, taking the invoke surface to 48"
```

---

### Task 4: Pin the agent boundary as source text

**Files:**
- Test: `scripts/verify-meta.cjs`

**Interfaces:**
- Consumes: the `JIRA_*` keys declared in Task 3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-meta.cjs`, after check 21's block:

```js
// 22-23. M24's rule: NO AGENT-REACHABLE PATH TRIGGERS A JIRA WRITE. Both
// checks read source text rather than behaviour, for check 20 and 21's own
// reason — a violation has NO RUNTIME SYMPTOM. Add a channel that let an
// agent's output drive a write and the app works exactly as it does now,
// plus one capability nobody asked for.
//
// Both reads are COMMENT-STRIPPED, because jira-client.ts and ipc-contract.ts
// each carry prose naming the very things that must not appear — a bare
// substring search fails against the correct tree.
//
// 22 is an ALLOWLIST, never a test for a forbidden spelling. Testing for
// `jira:delete` would pin THAT spelling and let a sibling named
// JIRA_DELETE_ISSUE sail through, which is exactly the trap check 20 records.
{
  const contract = stripComments(read('src/shared/ipc-contract.ts') ?? '')
  const objMatch = contract.match(/export const IPC = \{([\s\S]*?)\n\} as const/)
  const body = objMatch ? objMatch[1] : ''
  const keys = [...body.matchAll(/\bJIRA_[A-Z_]+\b/g)].map((m) => m[0])
  const ALLOWED = ['JIRA_LIST', 'JIRA_TRANSITIONS', 'JIRA_COMMENT', 'JIRA_TRANSITION']
  const unexpected = keys.filter((k) => !ALLOWED.includes(k))
  const missing = ALLOWED.filter((k) => !keys.includes(k))

  ok('22 the JIRA_* channel set is exactly {list,transitions,comment,transition}',
    objMatch !== null && unexpected.length === 0 && missing.length === 0,
    `parsed=${objMatch !== null} unexpected=${JSON.stringify(unexpected)} missing=${JSON.stringify(missing)}`)
}

// 23 carries the SAME two honest limits check 21 records, and they are stated
// here rather than left for a reader to discover: it greps each offender
// file's OWN source, so a second hop through some other, non-Jira module is
// unchecked; and the three-file offender list is a HARDCODED SNAPSHOT of "the
// modules that build a process environment" as of M24, so a fourth such
// module added later is unchecked by construction. A green run means these
// shapes hold. It is not proof the rule holds.
{
  const offenders = ['src/main/shell-env.ts', 'src/main/pty-manager.ts', 'src/main/session-backend.ts']
    .filter((f) => /jira-client/.test(stripComments(read(f) ?? '')))

  ok('23 no env-building module imports the Jira client',
    offenders.length === 0,
    offenders.length ? offenders.join(',') : 'none')
}
```

- [ ] **Step 2: Run to verify 22 and 23 both PASS immediately**

Run: `npm run verify:meta`
Expected: all PASS, 23 checks.

**These are CHARACTERISATION checks and the plan says so rather than pretending otherwise** — Task 3 already satisfies both, exactly as `verify:pty-manager` 20 passed on first write. They earn their place by fault injection, not by ever having failed on their own. Do the injection in Step 3; a check never watched failing is not evidence.

- [ ] **Step 3: Fault-inject both, and record the result**

```bash
# 22: add a forbidden sibling. Expect ONLY 22 red.
sed -i '' "s|  JIRA_LIST: 'jira:list',|  JIRA_DELETE: 'jira:delete',\n  JIRA_LIST: 'jira:list',|" src/shared/ipc-contract.ts
npm run verify:meta   # expect: FAIL 22, unexpected=["JIRA_DELETE"]
git checkout src/shared/ipc-contract.ts

# 23: make an env-building module import the client. Expect ONLY 23 red.
printf "\nimport './jira-client'\n" >> src/main/shell-env.ts
npm run verify:meta   # expect: FAIL 23, src/main/shell-env.ts
git checkout src/main/shell-env.ts
```

Confirm the tree is clean (`git status --porcelain` empty for those two files) before committing.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-meta.cjs
git commit -m "test(m24): pin the no-agent-write rule as source text"
```

---

### Task 5: The write controls

**Files:**
- Create: `src/renderer/jira/JiraTicket.tsx`
- Modify: `src/renderer/jira/JiraNode.tsx`, `src/renderer/canvas/Canvas.tsx:4632`, `src/renderer/navgrid/useNavGrid.ts:101`, `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs`

**Interfaces:**
- Consumes: `window.canvas.jira.transitions/comment/transition` from Task 3; `WorkItem`, `WorkItemTransition` from Task 2.
- Produces: DOM hooks `[data-jira-ticket="<id>"]`, `[data-jira-comment-input]`, `[data-jira-outcome]`, and the class `.jira-node__comment-form`.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify-panels.cjs`, at the end of the run (after check 173). The two helpers it uses are `ok(n, pass, detail)` and `waitUntil(fn, timeoutMs)` — note that **`waitUntil` takes a FUNCTION, not `(wc, jsString)`**; it polls `fn` and returns whatever the last call produced.

```js
  // 174. The comment draft end to end in a real renderer: the ONLY check that
  //      exercises the input, the send, and the outcome together. verify:jira
  //      proves the CLIENT and says nothing about whether a keystroke reaches
  //      it. The stub replaces window.canvas.jira wholesale so npm run verify
  //      stays offline — the standing rule, not an optimisation here.
  //
  //      Its non-vacuity clause is load-bearing: asserting only "no error
  //      appeared" passes before the feature exists at all, so it also demands
  //      the outcome element carry the SENT text back.
  {
    const opened = await wc.executeJavaScript(`(() => {
      window.__m24Sent = []
      window.canvas.jira = {
        list: async () => ({ kind: 'items', items: [{
          id: 'TC-12', title: 'Ship Jira writes', description: 'body',
          assignee: 'Ada Lovelace', state: 'In Progress',
          url: 'https://acme.atlassian.net/browse/TC-12'
        }] }),
        transitions: async () => ({ kind: 'transitions', transitions: [] }),
        comment: async (req) => { window.__m24Sent.push(req); return { kind: 'done' } },
        transition: async () => ({ kind: 'done' })
      }
      window.__m13Open === undefined
      return true
    })()`)

    // Mint the panel through the app's own gesture, never by hand-writing a
    // panel record: a check that bypasses the mint proves nothing about it.
    await wc.executeJavaScript(`window.__m24Jira && window.__m24Jira()`)
    const row = await waitUntil(
      () => wc.executeJavaScript(`document.querySelector('[data-jira-ticket="TC-12"]') !== null`), 8000)

    await wc.executeJavaScript(`(() => {
      const r = document.querySelector('[data-jira-ticket="TC-12"]')
      r.querySelector('[data-jira-comment-open]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      return true
    })()`)
    await waitUntil(
      () => wc.executeJavaScript(`document.querySelector('[data-jira-comment-input]') !== null`), 4000)

    // The native value setter plus an input event: assigning .value alone
    // leaves React's state untouched, and the send would go out empty. The
    // same trap verify:panels 113 records for the commit draft.
    await wc.executeJavaScript(`(() => {
      const input = document.querySelector('[data-jira-comment-input]')
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      set.call(input, 'agent finished the refactor')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      return true
    })()`)

    const outcome = await waitUntil(
      () => wc.executeJavaScript(`(document.querySelector('[data-jira-outcome]') || {}).textContent || ''`), 6000)
    const sent = await wc.executeJavaScript(`JSON.stringify(window.__m24Sent)`)
    const parsed = JSON.parse(sent)
    ok('174 a Jira comment typed into a real draft reaches the adapter',
      opened === true && row && parsed.length === 1 &&
        parsed[0].itemId === 'TC-12' && parsed[0].body === 'agent finished the refactor' &&
        /comment/i.test(String(outcome)),
      `sent=${sent} outcome=${outcome}`)
  }
```

Add the `__m24Jira` mint hook to `Canvas.tsx` beside the existing `__m4a*` hooks — one narrow, named hook, the rule that entry in CLAUDE.md states.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build && npm run verify:panels`
Expected: 174 FAILs (`sent=[] outcome=undefined` — no `[data-jira-ticket]` row exists). Every earlier check stays PASS. If the run instead ends in `infrastructure`, a throw aborted it — fix that first, because a throw takes every later check's result with it.

- [ ] **Step 3: Create the ticket row component**

Create `src/renderer/jira/JiraTicket.tsx`:

```tsx
import { useRef, useState, type JSX } from 'react'
import type { WorkItem, WorkItemTransition } from '@shared/work-item'

/**
 * One ticket, and the two writes aimed at it. It is its own component rather
 * than more JSX inside JiraNode's .map() for a structural reason: each row
 * needs its OWN draft, its OWN fetched transition list and its OWN in-flight
 * flag, and per-row state means per-row hooks, which cannot live in a loop.
 */
export function JiraTicket(props: {
  item: WorkItem
  focusedId: string | null
  restoreFocus: (id: string) => void
  onSpawn(item: WorkItem): void
  onWritten(): void
}): JSX.Element {
  const { item } = props
  const [draft, setDraft] = useState<string | null>(null)
  const [transitions, setTransitions] = useState<WorkItemTransition[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(null)

  /**
   * The panel that had the keyboard when the draft opened. Captured rather
   * than read at close time, for usePalette's reason: by the time the input
   * unmounts, focus has already left.
   */
  const capturedFocusRef = useRef<string | null>(null)

  /**
   * The one way the draft closes, so BOTH exits give the keyboard back.
   *
   * NO CHECK IN THIS REPO CAN OBSERVE THIS, and that is stated rather than
   * papered over: DOM focus after an unmount is a browser default action a
   * dispatched event never performs (verify:panels 47 and 75c record the same
   * limit from their own sides). Delete this and every suite stays green
   * while the user's next keystroke goes nowhere — usePalette's rule 4.
   */
  const closeDraft = (): void => {
    setDraft(null)
    const id = capturedFocusRef.current
    capturedFocusRef.current = null
    if (id !== null) props.restoreFocus(id)
  }

  const sendComment = (): void => {
    const body = draft?.trim() ?? ''
    // `busy` is the silent guard: the button already reads "sending…", so
    // there is nothing left to say. The empty case is reachable from the
    // primary path — press Enter on an empty field — and must say why, or
    // Enter becomes an inert key with no explanation.
    if (busy) return
    if (body === '') { setOutcome('a comment needs a body'); return }
    setBusy(true)
    void window.canvas.jira.comment({ itemId: item.id, body })
      .then((result) => {
        setOutcome(result.kind === 'done' ? 'comment added' : result.reason)
        if (result.kind === 'done') closeDraft()
      })
      // A rejected invoke must LAND IN AN ARM, never be swallowed: an
      // unresolved promise leaves the row reading "sending…" forever.
      .catch(() => setOutcome('the comment could not be sent'))
      .finally(() => setBusy(false))
  }

  /** The FETCH is the arm. It is also where "you cannot transition this" is
   *  discovered, before a button that would fail is ever offered. */
  const armTransition = (): void => {
    if (busy) return
    setBusy(true)
    void window.canvas.jira.transitions(item.id)
      .then((result) => {
        if (result.kind === 'transitions') {
          setTransitions(result.transitions)
          if (result.transitions.length === 0) setOutcome('no transitions available')
        } else setOutcome(result.reason)
      })
      .catch(() => setOutcome('transitions could not be read'))
      .finally(() => setBusy(false))
  }

  const runTransition = (transitionId: string): void => {
    if (busy) return
    setBusy(true)
    void window.canvas.jira.transition({ itemId: item.id, transitionId })
      .then((result) => {
        setOutcome(result.kind === 'done' ? 'ticket moved' : result.reason)
        setTransitions(null)
        // Re-read rather than patching the row in place: the rendered state
        // comes from Jira, so the screen cannot claim a state the server
        // never confirmed.
        if (result.kind === 'done') props.onWritten()
      })
      .catch(() => setOutcome('the transition could not be sent'))
      .finally(() => setBusy(false))
  }

  const stop = (event: { stopPropagation(): void; preventDefault(): void }): void => {
    event.stopPropagation(); event.preventDefault()
  }

  return <article className="jira-node__item" data-jira-ticket={item.id}>
    <strong>{item.id}: {item.title}</strong>
    <small>{item.state ?? 'No state'}{item.assignee ? ` · ${item.assignee}` : ''}</small>
    <p>{item.description || 'No description.'}</p>

    <div className="jira-node__actions">
      <button type="button" onMouseDown={(e) => { stop(e); props.onSpawn(item) }}>Start session</button>
      <button
        type="button"
        data-jira-comment-open
        disabled={busy}
        onMouseDown={(e) => {
          stop(e)
          if (draft === null) { capturedFocusRef.current = props.focusedId; setDraft('') }
          else closeDraft()
        }}
      >Comment</button>
      <button type="button" disabled={busy} onMouseDown={(e) => { stop(e); armTransition() }}>
        {busy && transitions === null ? 'Loading…' : 'Move…'}
      </button>
    </div>

    {transitions !== null && transitions.length > 0 && (
      <div className="jira-node__transitions">
        {transitions.map((t) => <button
          key={t.id} type="button" disabled={busy}
          onMouseDown={(e) => { stop(e); runTransition(t.id) }}
        >{t.name}{t.toState !== null && t.toState !== t.name ? ` → ${t.toState}` : ''}</button>)}
      </div>
    )}

    {draft !== null && (
      <div className="jira-node__comment-form">
        <textarea
          className="jira-node__comment-input"
          data-jira-comment-input
          autoFocus
          value={draft}
          placeholder="Comment on this ticket"
          onChange={(event) => setDraft(event.target.value)}
          // stopPropagation on EVERY key, not only the two handled below.
          // useViewport's keydown listener is on `window`, above this
          // component in the bubble path, so without this a Cmd+N typed
          // while composing spawns a panel behind the node and a Cmd+K
          // opens the palette over it.
          //
          // This is NOT enough on its own: useNavGrid's listener is
          // CAPTURE-phase on window and has already run by the time this
          // fires, which is why .jira-node__comment-form is named in that
          // hook's own target test.
          onKeyDown={(event) => {
            event.stopPropagation()
            // Enter sends; Shift+Enter is a newline, because a comment is
            // prose and a multi-paragraph one must be typeable.
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendComment() }
            if (event.key === 'Escape') { event.preventDefault(); closeDraft() }
          }}
          onMouseDown={(event) => event.stopPropagation()}
        />
        <button type="button" disabled={busy} onMouseDown={(e) => { stop(e); sendComment() }}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    )}

    {outcome !== null && <p className="jira-node__outcome" data-jira-outcome>{outcome}</p>}
  </article>
}
```

- [ ] **Step 4: Render it from `JiraNode`, and thread the two new props**

In `src/renderer/jira/JiraNode.tsx`: import `JiraTicket`, add `focusedId: string | null` and `restoreFocus: (id: string) => void` to the props type, and replace the inline `result.items.map(...)` expression with:

```tsx
result.items.map((item) => <JiraTicket
  key={item.id} item={item}
  focusedId={props.focusedId} restoreFocus={props.restoreFocus}
  onSpawn={props.onSpawn} onWritten={load}
/>)
```

In `src/renderer/canvas/Canvas.tsx:4632`, add `focusedId={focusedId} restoreFocus={restoreFocus}` to the `<JiraNode ... />` element — the same two props `ReviewNode` is already given three lines above it.

- [ ] **Step 5: Close the nav-grid door**

In `src/renderer/navgrid/useNavGrid.ts:101`, extend the selector and its comment:

```ts
        if (target?.closest?.('.review-node__commit-form, .file-node__editor, .jira-node__comment-form')) return
```

- [ ] **Step 6: Style it, tokens only**

Append to `src/renderer/styles.css` near the existing `.jira-node__item` rules. `verify:styles` 1 rejects any literal colour outside a theme block and 4–6 reject literal type/radius/spacing values, so every value here must be a `var(--…)`:

```css
.jira-node__actions { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
.jira-node__transitions { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); }
.jira-node__comment-form { display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-2); }
.jira-node__comment-input { width: 100%; min-height: var(--sp-6); resize: vertical; }
.jira-node__outcome { color: var(--fg-3); margin-top: var(--sp-2); }
```

Every token used above is already declared: the spacing scale runs `--sp-1` through `--sp-9`, and the foreground scale is `--fg-2`/`--fg-3`/`--fg-4`. Inventing a step (`--sp-10`) fails `verify:styles` 2, which asserts every `var(--token)` is declared.

- [ ] **Step 7: Run to verify it passes**

Run: `npm run typecheck && npm run build && npm run verify:panels && npm run verify:styles`
Expected: 174 PASS, `verify:styles` all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/jira src/renderer/canvas/Canvas.tsx src/renderer/navgrid/useNavGrid.ts src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m24): comment and transition controls on a Jira ticket"
```

---

### Task 6: Record the mechanism

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/ideas-backlog.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Add the milestone row**

In `README.md`'s milestone table, after the M23 row:

```
| M24 | Jira writes: comment on and transition a ticket, from the panel | ✅ done |
```

If another branch has claimed M24 by merge time, this row and the branch rename themselves — the table's own stated rule.

- [ ] **Step 2: Record the load-bearing details in `CLAUDE.md`**

Add to `## Load-bearing details`, in that file's established voice — each entry naming the SILENT failure that follows from undoing it:

- **"`method` is required on `JiraRequest`, and that is what makes a write checkable offline."** The injected seam is why `verify:jira` can assert a POST body with no network. Optional-with-a-GET-default means a write function that forgot it performs a GET against a POST endpoint — a request that succeeds and does nothing.
- **"`refused` is not a flavour of `unavailable`."** `review-commit.ts`'s split, reached by a second door. A board declining a transition and Jira being unreachable have two different fixes; `refused` is the arm a correctly configured Jira produces routinely. 404 is `refused` too, because Jira answers 404 for an issue the account may not browse.
- **"Transitions are read per issue, on demand."** Folding them into `jira:list` fires one request per ticket on every panel load, for tickets nobody transitions — `review:diff`'s arithmetic.
- **"No agent-reachable path triggers a Jira write, and it is pinned as source text."** With both limits `verify:meta` 23 carries, stated rather than hidden: no second hop of indirection, and a hardcoded three-file offender snapshot.
- **"`.jira-node__comment-form` is the THIRD entry in `useNavGrid`'s target test."** A fourth text surface will need the same line; the failure is a revealed nav grid swallowing every keystroke and a workspace switch unmounting the panel with the comment unsent.
- **"`textToAdf` is deliberately no more capable than `adfText`."** A richer converter invents a format the read half cannot round-trip, so a comment stops reading back as it was typed.

Also update the `verify:jira`, `verify:meta`, `verify:ipc` and `verify:panels` rows of the suite table with the new check numbers and what each one is for.

- [ ] **Step 3: Rewrite backlog #12 down to what is still open**

Per that file's own stated rule — entries are rewritten down to the part still open, keeping the recorded constraint attached to it. Remove the **Writes** bullet. Add a sentence recording that M24 made the decision the entry said had not been made, and what it settled: two verbs, human gesture only, the rule pinned as source text, and transition screens explicitly still open. The remaining bullets (Server/DC, OAuth 3LO, a second provider, the wall-of-tickets view) are unchanged.

- [ ] **Step 4: Full verify**

Run: `npm run verify`
Expected: every suite green. This is the gate — no claim of done before it.

- [ ] **Step 5: Refresh the knowledge graph**

Run: `graphify update .` (AST-only, no LLM cost), then a full `graphify .` since `CLAUDE.md` and the backlog changed substantially — the update subcommand never re-runs semantic extraction.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md docs/ideas-backlog.md
git commit -m "docs(m24): record the Jira write mechanism and its limits"
```

---

## Hand check, after the branch is green

No suite reaches Jira, so the following can only be produced against a real Cloud tenant, once, by a person:

1. A comment typed into a ticket row appears on that ticket in Jira.
2. `Move…` lists that issue's real workflow transitions, and picking one moves the ticket on the board.
3. The panel re-reads afterwards and shows the new state.

**Record what this does NOT prove**, in the same commit: it does not prove the `refused` arm, tenant permissions beyond that account, transition screens, or Server/Data Center behaviour. A single success on one tenant on one day is not a property of the code.
