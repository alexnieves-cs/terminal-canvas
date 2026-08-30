# M17: Jira context — Design

**Status:** designed and ready to implement.
**Backlog entries:** #12 (Jira connection), #9 (service integrations).

## Decision record

Jira is the first tier-2 integration. #9 proposed Obsidian and GitHub as the
two reference implementations from which to derive a shared surface; neither
exists. M14 supplied a credential *boundary*, not an integration API — its
credential schema says so explicitly. We therefore do **not** invent provider
selection, a plugin API, or a general ticket-panel family for one customer.
M17 ships a Jira-specific panel kind and one vendor-neutral `WorkItem` at the
Jira-to-renderer boundary. A second provider can later prove what is common.

Jira Cloud API tokens are sufficient for this feature. Atlassian documents
Basic authentication using an account email and an API token for personal
scripts, bots, and ad-hoc REST calls; it supports direct calls to a tenant's
`/rest/api/3` endpoints. OAuth 3LO is Atlassian's recommended route for a
distributable integration, but it requires a redirect listener, client
registration, access/refresh token expiry and rotation. This private,
read-only client neither needs nor has those pieces. The rejected OAuth option
is therefore a separate milestone if Terminal Canvas becomes a distributable
Atlassian integration, not a prerequisite for M17.

The current store remains unchanged: it stores one encrypted opaque string per
declared service. Jira's opaque string is JSON containing `site`, `email`, and
`token`; all three are entered through the secret input and are encrypted
together. `CredentialMeta` stays exactly metadata. A three-line entry format is
used in the palette (site URL, Atlassian email, API token), so no secret is
rendered in the canvas or stored in a second file.

## Scope

1. Add Jira to `SERVICES`, verify a stored Jira credential through
   `GET /rest/api/3/myself`, and list assigned issues with the current Jira
   v3 JQL search endpoint. Main alone decrypts the opaque credential and makes
   requests. The client takes an injected requester, so all automated checks
   stay offline.
2. Add a sessionless, persisted `jira` panel that lists the authenticated
   user's assigned issues. Jira is represented at its boundary by the neutral
   `WorkItem { id, title, description, assignee, state, url }`; Jira response
   parsing and ADF-to-text conversion stay behind the adapter.
3. A ticket action creates a normal terminal through Canvas's existing
   `onSpawn` funnel. It sets `Panel.title` to `KEY: summary`, then inserts the
   description with bracketed `paste()`, never raw `write()`. It does not add a
   second spawn path or encode a ticket name in `spec.command`.

Out of scope: Jira Server/Data Center, projects/team filtering, pagination,
OAuth, another provider, and all Jira writes.

## Boundary and writes

M14 rule 1 remains intact: no Jira IPC return carries the stored bundle or a
token. Rule 2 remains intact: no env-building module imports credential code;
the Jira client is main-only and is not a process-environment builder. Jira
read responses may enter a panel and ticket descriptions may be pasted to an
agent because they are work text, not credentials.

Jira writes are deliberately absent. A future write milestone should use an
explicit user gesture that has main perform one named mutation; that preserves
the M14 boundary and gives the user a confirmable action. A loopback broker is
the alternative only when an agent must initiate a write, because it is the
only agent-initiated design that can avoid revealing a credential. This feature
needs neither.

## API and failure model

`credential:verify('jira')` calls `/rest/api/3/myself` with an eager `Basic`
header and stores the remote `displayName` as the label. `jira:list` calls
`/rest/api/3/search/jql` with `assignee = currentUser() ORDER BY updated DESC`,
the five fields it displays, and a bounded result count. Every request has the
same timeout/body bound posture as M14. Invalid bundle, missing credential,
network, rejected-auth, malformed response, and no-items are distinct answers;
a blank Jira panel is never used as an error signal.

The panel itself is a persisted sessionless `Panel` kind. Like file and review
panels it never enters `assignTiers` or the registry. A missing Jira credential
renders an actionable "Connect Jira" state, not a process or a fake ticket.

## Verification

`verify:jira` is plain Node, builds the adapter with injected responses, and
proves parsing, Basic-auth construction, the no-credential early return (with
no requester call), malformed data refusal, assigned-work query, and ADF text
flattening. `verify:viewport` and `verify:layout` extend the third-kind
partition/persistence checks for a fourth panel kind. `verify:ipc` covers the
new invoke. `verify:panels` drives the panel through its real adapter response
and proves that ticket spawn travels through `onSpawn`, preserves a title, and
uses paste for the multi-line description.

No suite reaches Jira. After implementation, a human must connect a real Jira
Cloud tenant and record evidence that could not be produced locally: the label
changed from `Jira` to the server-provided display name and an assigned ticket
key/summary appeared. That hand check does not prove rejected-token behavior,
tenant permissions beyond that account, or any write capability.

