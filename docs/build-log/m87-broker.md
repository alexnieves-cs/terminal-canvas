# M87 — The broker

**Branch:** `m87-github-broker`. **Spec:** `docs/superpowers/specs/2026-09-04-m87-broker-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-04-m87-broker.md`. **Status:** finished 2026-09-04.

**Thesis sentence:** an agent in a panel can call a service this app holds a credential for,
without ever seeing the credential — and every such call is written down.

## What landed

- `main/broker.ts`: `createBroker({ store, fetcher, audit, now })`. A closed service table
  (github bearer; jira basic auth at the credential's own site), the path and method checked
  before the token is read, a body and a reply cap with `truncated` said out loud, one audit
  row per call including every refusal, the token in no reply, row or refusal.
  `main/broker-audit.ts`: an append-only JSONL beside the run ledger, read newest first with
  malformed lines counted. `verify:credentials broker.1` (16/16).
- The `api` verb: the parser's arm (service, method, path demanded; a non-string body
  refused; `command` refused as everywhere), the URL door's refusal, the handler's arm over
  the broker (spawns nothing; a window with no broker says so), and `tc api <service>
  <METHOD> </path> [body]` with the panel from `TC_PANEL_ID`. `verify:control api.1` (13/13).
- `verify:meta readers.1`: the credential store's readers pinned as a list of three (30/30).
- Main wires the broker to the control handler only; `createHttpsBrokerFetcher` lives beside
  the verifier's fetcher and is never bundled into a suite.

## Red first

- All three checks red before the module and the verb existed; `broker.1` then red once more
  on the harness's own fixture order (it ran after the temp directory was removed), and
  `api.1` once on my own miscount of broker calls.

## Decisions taken while building, and why

- **No IPC channel.** See the load-bearing entry: the renderer can neither spend nor see.
- **A refusal is a row.** An agent's attempt is what the audit is for.
- **Jira through the same door.** One way to reach a service, two credentials.

## What this milestone does not do, stated

- No surface: the audit rows are read by nothing yet (M89's page). No rate limit, no retry.
- A real call against a real API is on the manual-only list; every suite is offline.

## Verification

`npm run verify` run alone after the verify tmux server was killed; exit code recorded below.

## Triage: the verifier

Verdict: delivered with gaps, and the first gap was a bypass. **Accepted and fixed:**

- **`%2e%2e` walked out from under the Jira prefix with basic auth attached.** The URL
  parser reads encoded dots as `..`, and the string check on the input path never saw them.
  Encoded dots are refused by name, and the NORMALISED origin and pathname are checked
  against the service's prefix before anything is sent; the audit records the normalised
  path. `broker.1` sends `/%2e%2e/%2e%2e/rest/api/2/myself` and asserts the fetcher never
  sees it.
- **The error scrub replaced the first occurrence of one form.** Every derived form (the
  Jira token, `email:token`, the base64 blob), every occurrence. `broker.1` throws an error
  carrying each twice.
- **The audit was unbounded and a refused call was free to flood it.** Ring-trimmed at
  `BROKER_AUDIT_MAX` through a temp file, the path capped at 2048 characters, service and
  method names capped. `broker.1` appends 260 rows against a cap of 50.
- **No in-flight ceiling and a socket-inactivity timeout.** Eight calls in flight, the ninth
  refused by name; the fetcher's timeout is a deadline for the whole call and it stops
  reading past twice the cap.
- **The Jira site regex admitted `https://evil.test#x.atlassian.net`.** Parsed through the
  URL parser: the host must be the Atlassian one, with no path, query, hash or userinfo.
- **A colon in the first segment was refused as a scheme.** Only `://` is.
- **Truncation counted UTF-16 units and could split a surrogate.** Bytes, cut on a
  character boundary.
- **The CLI exited 0 on a served 404.** Exit 1 on 4xx/5xx; `--panel <id>`; a non-JSON body
  is a usage error — the spec's own table row that the first check did not test.
- **The build log claimed a green run it had not recorded**, and three documents said the
  real fetcher is "never bundled" when it rides in the credentials bundle uncalled. Both
  corrected.

**Declined, with reasons, the spec amended to say so.** *An allowlist, a confirmation or a
per-panel ceiling on what `tc api` may do:* the token's scope is the user's decision and the
socket's authority is the user's process boundary; `panelId` is attribution. *A rate limit
against the service's quota:* not built; the audit shows the spend. *`panelId` checked
against a live panel:* a chat panel has no session to check against, and a spoofed id is
still a row with a wrong name rather than a missing row.

## Verification

`npm run verify` run alone after the verify tmux server was killed: `verify:credentials`
16/16, `verify:control` 13/13, `verify:meta` 30/30, `verify:jira` 15/15, and the chain's
own exit code 0 — recorded from the run below, not claimed ahead of it.
