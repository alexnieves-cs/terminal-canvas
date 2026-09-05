# M88 — GitHub through the broker

**Status:** design, 2026-09-04. **Branch:** `m88-github`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 3 (identity leads), 7 (three states), 9 (a disabled
row names the fix); 2.0 principle 11 (the same fact in the same words everywhere); the run
prompt's constraint that a service is reached through an injected client with a Connect verb.
**Thesis sentence:** the work assigned to you on GitHub, as a node on the canvas that starts
an agent on any item — and the same API an agent in a panel reaches with `tc api github`.

## What this milestone is for

M24 gave the canvas a Jira panel: assigned tickets, a `Start session` per item, a Connect
verb when no credential exists. M87 gave every agent a door to GitHub. What is missing is the
person's own picture: the issues assigned to you and the pull requests waiting on you, as a
node beside the agents working on them. This is Jira's shape reached by a second service,
which is what M89's connector seam is derived from.

## Design

### The client (`main/github-client.ts`, plain node — `verify:github`)

- `GithubRequester = (req: { url; method; headers; body?; timeoutMs }) => Promise<{ status;
  body }>`, the Jira requester's shape; `createGithubRequester()` is the real one.
- `listAssignedWorkItems(deps)` → `{ kind: 'items'; items: WorkItem[] }` or one of
  `no-credential` (the SAME sentence the broker and the credential rows use), `rejected`
  (401/403), `unavailable` (unreachable, 5xx), `malformed` — each with a reason. Two
  requests, one answer: `GET /issues?filter=assigned&state=open&per_page=50` for the issues
  assigned to the user, and `GET /search/issues?q=is:pr+is:open+review-requested:@me` for
  the pull requests waiting on them; a PR is a `WorkItem` whose `state` is `review requested`
  and whose id is `owner/repo#N`. An issue's id is `owner/repo#N` too; `url` is GitHub's
  `html_url`; `description` is the body's first 2000 characters.
- Zero network calls with no credential (Jira's check 4, reached again). The token crosses
  in the requester's `Authorization` header and nowhere else.

### The kind (`github` — the ninth, and the second work panel)

- `kind: 'github'`, sessionless, `title` default `GitHub work`; `github:list` as its one
  invoke; `GithubNode.tsx` through `PanelFrame` with Jira's three states — loading, the list
  (or `Nothing assigned to you`), the reason with `Connect GitHub…` opening the palette's
  Credentials scope when the arm is `no-credential`.
- Each item: id, title, state, a `Start session` verb that spawns a panel with the item as
  opening context — Jira's `spawnJiraTicket`, reached by a second kind through ONE
  `spawnWorkItem(item, source)` verb rather than a copy.
- The palette's `Open GitHub work` row beside `Open Jira tickets`, present when a github
  credential exists and disabled with the Connect reason otherwise — never absent.
- `tc api github …` is the agent's door to the same API (M87); the node and the agent read
  one credential.

## What it must not break

- No token crosses to the renderer: `WorkItem` carries `html_url` and nothing else from the
  response; `verify:github` asserts the token appears in no result.
- `npm run verify` stays offline: the suite drives recorded responses through the requester.
- The Jira panel is untouched; `spawnWorkItem` replaces `spawnJiraTicket` in place.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A network call with no credential; the token in a result | `verify:github` 1–2 |
| A PR read as an issue, or an issue with a PR key; a malformed response crashing the list | `verify:github` 3–5 |
| The rail or inspector speaking a process word for the kind | `verify:rail kind-tail.1/.2` |
| The palette row absent rather than disabled without a credential | `verify:palette github.1` |
| The node's three states; `Start session` spawning with the item as context | `verify:panels github.1` |

## Manual-only, added

- A real token against api.github.com — every suite here is offline.
