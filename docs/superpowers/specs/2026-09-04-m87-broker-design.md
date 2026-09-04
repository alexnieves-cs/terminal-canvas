# M87 — The broker

**Status:** design, 2026-09-04. **Branch:** `m87-github-broker`. **Kind:** runtime.
**Briefs built against:** the run prompt's constraint that every service is reached through
an injected client with a Connect verb and a named reason; 1.x principle 9 (a disabled row
names the fix); the M14 rule that a token exists in exactly one process.
**Thesis sentence:** an agent in a panel can call a service this app holds a credential for,
without ever seeing the credential — and every such call is written down.

## What this milestone is for

M14 put credentials in an encrypted store with no `credential:get`; M24 let the app talk to
Jira through an injected requester; M54 gave every panel a control socket. What no agent can
do is use those credentials: an agent that needs GitHub reads the user's token out of the
environment or asks for it in chat. The broker is the loopback verb that closes that gap:
`tc api <service> <method> <path> [body]` — main attaches the credential, performs the
request through an injected fetcher, hands back status and body, and appends one audit row.
No UI beyond the row; M88 builds GitHub on it and M89 shows the rows.

## Design

### The module (`main/broker.ts`, plain node — `verify:credentials broker.1`)

- `createBroker({ store, fetcher, audit, now })`. `call(req)` with `{ service, method,
  path, body?, panelId? }` → `{ ok: true; status; body; truncated }` or `{ ok: false;
  reason }`. The token is read here, attached to the request, and NEVER returned or logged.
- **The service table is closed**: `github` → `https://api.github.com` with a bearer token;
  `jira` → the credential's own site with basic auth (`email:token`) under `/rest/api/3`.
  An unknown service is refused by name; a service with no credential answers `not connected
  — add a github token in ⌘K › Credentials` (the SAME reason the panel rows use).
- **The path is checked before the token is touched**: it must start with `/`, carry no
  scheme, no `//`, no `..` segment; the method is one of GET, POST, PUT, PATCH, DELETE. A
  body is capped at `BROKER_BODY_MAX` (1 MB) and the response at the same, with `truncated`
  said rather than silently cut.
- **Every call appends an audit row** `{ at, service, method, path, status, panelId?,
  bytes }` — metadata only, never a body and never a token — through the injected `audit`,
  an append stream under `userData/broker-audit.jsonl` like the run ledger. A refused call is
  a row too, with `status: 0` and its reason, because an agent's ATTEMPT is what the audit is
  for.
- The fetcher is `(req: { url, method, headers, body? }) => Promise<{ status, body }>`;
  `createHttpsBrokerFetcher()` is the real one and is never called by a suite.

### The verb (`control-protocol.ts`, `control-handler.ts`, the CLI)

- `{ verb: 'api', service, method, path, body?, panelId? }`, parsed with the same refusals
  (`command` refused everywhere; the URL door refuses `api` — a link must never be able to
  spend a credential). `tc api github GET /user`, `tc api github POST /repos/o/r/issues
  '{"title":"x"}'`, with `--panel` defaulting to `TC_PANEL_ID`.
- The handler's arm calls the broker and returns its answer verbatim; it can spawn, focus
  and write nothing else.

### The readers, pinned

`verify:meta` pins the set of modules that call a credential store's `read(` as exactly
`credential-verify.ts`, `jira-client.ts` and `broker.ts` — the broker is the store's LAST
reader, and a fourth would fail the build with its name.

## What it must not break

- No `credential:get`; no bridge member returns a token; `verify:credentials` keeps asserting
  that a token never crosses to the renderer.
- The socket stays 0600; the URL door stays `open` only.
- `npm run verify` stays offline: every suite drives a fake fetcher.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| The token in the reply, the audit row or a refusal's text | `verify:credentials broker.1` |
| A service with no credential answering an empty 401 rather than the named reason | `verify:credentials broker.1` |
| `..`, a scheme or `//` in the path reaching the fetcher | `verify:credentials broker.1` |
| A refused attempt leaving no audit row | `verify:credentials broker.1` |
| `api` accepted at the URL door; `command` accepted on the verb | `verify:control api.1` |
| The CLI building the wrong shape, or a body that is not JSON | `verify:control api.1` |
| A fourth reader of the credential store | `verify:meta readers.1` |

## Amended after the verifier

- **The scope is the credential's whole scope, and that is a decision.** `tc api` performs
  any method on any path of the service with the user's token; there is no allowlist and no
  confirmation. The socket's authority is the user's own process boundary (0600 to the user,
  not to a panel), and a `panelId` is ATTRIBUTION for the audit, not authorization — any
  process the user runs can set `TC_PANEL_ID`. A user who wants a narrower blast radius
  gives the app a narrower token; M89's page is where that is said in the UI.
- **The path is checked as the WIRE sees it.** `%2e%2e` is `..` to the URL parser, so the
  input-string check is only the first door: encoded dots are refused by name, and the
  normalised origin and pathname are checked against the service's prefix (`/rest/api/3/`
  for Jira, whose credential names the site) before anything is sent. The audit records the
  normalised path.
- **Every derived form of a secret is scrubbed from an error, every occurrence** — the Jira
  token, `email:token`, its base64 — never `replace`, which takes the first.
- **Caps and ceilings:** a path over 2048 characters, a body over 1 MB, more than eight calls
  in flight, and the audit ring-trimmed at 2000 rows; the fetcher's timeout is a DEADLINE for
  the whole call, not socket inactivity, and it stops reading past twice the cap.
- **The CLI exits 1 on a served 4xx/5xx**, takes `--panel <id>`, and refuses a body that is
  not JSON as a usage error.
- **The Jira site is validated through the URL parser**, not a regex alone.
- **Not built:** a rate limit against the service's own quota (a compromised agent can spend
  it; the audit shows that it did) and a per-panel ceiling.

## Manual-only, added

- A real call against api.github.com with a real token — every suite here is offline.
