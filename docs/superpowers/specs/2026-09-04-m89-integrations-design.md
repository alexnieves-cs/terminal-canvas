# M89 — The connector seam

**Status:** design, 2026-09-04. **Branch:** `m89-integrations`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 3 (identity leads), 6 (every control says what it
is), 7 (three states), 9 (a disabled row names the fix); 2.0 principle 11 (the same fact in
the same words everywhere).
**Thesis sentence:** every service this app can reach, on one page, each saying whether it is
connected, as whom, what to do when it is not — and what the agents did with it.

## What this milestone is for

Jira (M24) and GitHub (M88) each arrived with a credential row, a work panel, a Connect verb
and a broker door, and each spelled its states in its own place. The seam is what the two
share, derived rather than designed in advance: a service has a state (`connected as
<login>`, `not connected — add a token`, `token rejected`), one Connect verb, and an audit of
what was done with it. This milestone puts that on ONE page and makes every service-needing
verb in the app refuse with the same named reason. What the two do NOT share is listed
below as deliberately uncovered.

## Design

### The model (`renderer/shell/integration-model.ts`, pure — `verify:rail`)

- `buildIntegrationRows(services, metas, audit)` → one row per declared service: `{ id;
  label; state: 'connected' | 'not-connected' | 'rejected'; who?: string; sentence; verb:
  'connect' | 'verify' | 'reconnect'; rows: BrokerAuditRow[] }`.
- The state words are three and closed: `connected as octocat`, `not connected — add a
  token`, `token rejected — add a new one`. `rejected` comes from a durable mark the store
  gains: `credential:verify` records `rejectedAt` on a 401/403 and clears it on success, so
  the page says what the last verify said rather than what the user remembers.
- The audit rows under a service are the newest first, capped at `INTEGRATION_AUDIT_ROWS`
  (20), each `method path · status · panel · when`, with refusals (status 0) marked.

### The wire

- `broker:audit(limit)` → the audit's rows, newest first, with `skipped`. The FIRST channel
  that reads the audit; the broker itself still has none.
- `CredentialMeta` gains `rejectedAt?: string`, absent stays absent.

### The page

- The navigator's fifth pane, `Integrations`: one section per service — identity line
  (label, then the state sentence in the state's tone), one verb (`Connect…` opens the
  palette's Credentials scope at that service's row; `Verify` re-checks; `Reconnect…` for a
  rejected token), and the audit rows beneath with a named empty arm (`no calls yet`).
- The palette's `Manage integrations…` door enters the same Credentials scope; the settings
  scope gains no rows — the page is the surface.
- Every panel verb that needs a service is disabled with the SAME named reason
  (`notConnectedReason`): the GitHub row, the Jira rows, the work panels' arms, the broker's
  refusal. `verify:palette` asserts the sentence is one import, not a spelling.

### What the two services do NOT share, deliberately uncovered

- Jira's credential is a bundle (site, email, token); GitHub's is a token. The page shows
  `as <label>` for both and never the bundle.
- Jira has transitions and comments; GitHub has neither here. The page lists calls, not verbs.
- Jira is reached through its own requester by the Jira panel and through the broker by
  agents; GitHub is reached through the broker by both. The audit therefore shows every
  GitHub read the panel makes and none of Jira's panel reads. Said on the page, once.

## What it must not break

- No token crosses to the renderer; `broker:audit` rows are metadata (the M87 shape).
- The Credentials scope's rows are untouched; the page's verbs are its doors.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A rejected token reading as connected, or a connected one as rejected | `verify:rail integrations.1` |
| A service absent from the page because it has no credential | `verify:rail integrations.1` |
| The three sentences spelled differently in two places | `verify:palette integrations.1` |
| `rejectedAt` written as `undefined`, or not cleared on success | `verify:credentials rejected.1` |
| The page rendering an empty audit as nothing | `verify:panels integrations.1` |

## Amended after the reviews

- **A fourth state, `stored`.** A token added and never verified reads `not verified — token
  added, not verified yet` with `Verify`; the first version upgraded it to `connected as
  GitHub`, a login it did not have.
- **Only a 401 marks a rejection**, at verify time and — the new door — in the broker, the
  one place every service call passes, so a work panel and the page cannot show two states
  for one token. A 403 is a rate limit or an SSO organisation and marks nothing.
- **The audit's read projects fields** (an extra key on a line never crosses the bridge),
  **scrubs the recorded path of every derived form of the secret**, and takes a service
  filter, so each service's window is its own. The path is still the agent's own text; the
  "metadata" claim is about the columns.
- **The rejected sentence no longer names a second door**: the verb beneath it is the door.
- **Only the state word carries a tone**; the sentence is in the text colour and the UI face.
- **The Jira door is present and disabled by the same sentence**, and the Jira client's
  no-credential arm speaks it too.
- **`Manage integrations…` counts connected** (verified, not rejected), not stored.
- **Not built:** re-verifying from the page's `Reconnect…` (it opens the Credentials scope);
  a `connected` word for a rejection observed only by a panel's list (a 401 through the
  broker marks; a Jira panel's own 401 marks; a 403 anywhere does not).

## Manual-only, added

- A real rejection from a real service.
