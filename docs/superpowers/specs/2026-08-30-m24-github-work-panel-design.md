# M24 — GitHub work panel, and the work surface derived from two providers

> **What this document is.** A design spec for the second tier-2 integration and
> for the shared surface that two of them — and only two of them — make it
> honest to derive. It is one slice of [`docs/ideas-backlog.md`](../../ideas-backlog.md)
> #9, which is a category rather than a milestone; the decomposition is recorded
> in §1 so a later reader does not mistake this for all of #9.

**Status:** design approved 2026-08-30. Not yet planned.

---

## 1. Decision record

**#9 asks for two reference implementations before any surface is generalised**,
and names Obsidian (tier 1) and GitHub (tier 2). Jira arrived first instead, and
its own spec ([M17](2026-08-30-m17-jira-context-design.md)) says plainly why it
declined to claim the surface: *"We therefore do not invent provider selection, a
plugin API, or a general ticket-panel family for one customer. A second provider
can later prove what is common."* This milestone is that second provider, and it
takes the surface with it — because the abstraction now has exactly two
customers, which is the condition #11 sets and the condition Jira's spec
deferred to.

**Why GitHub rather than Obsidian.** Three reasons, in order of weight:

1. **The expensive half is already paid.** M14 declared `github` in `SERVICES`,
   and `credential-verify.ts` already exchanges a stored PAT for the account's
   own `login` through `GET /user`. This is the first integration in the app
   that **inherits** a trust boundary rather than inventing one — which is #9's
   own recorded consequence of
   [M14](2026-08-30-m14-credential-boundary-design.md) landing: *"the tier-1 and
   tier-2 reference implementations below are now unblocked, and each inherits a
   boundary rather than having to invent one."*
2. **It answers the same question Jira does.** "What work is assigned to me" is
   the only question two providers can both answer, and answering it twice is
   the only way to find out whether `WorkItem`'s six fields were a real
   abstraction or a guess that happened to fit one API. A provider answering a
   *different* question would prove nothing about the surface.
3. **Obsidian is mostly already shipped.** A vault is a folder of markdown, and
   M16 (file panels), M20 (file tree) and M22 (editable, atomically-watched
   files) already render, watch and write it. What Obsidian adds — markdown
   rendering, `[[wikilink]]` resolution, backlinks — is a rendering milestone on
   machinery that exists, and it teaches the surface nothing, because a vault
   has no adapter and no credential.

**What this milestone does NOT discharge.** #9's tier 1 (Obsidian), tier 3
(embedded web views, and the `BrowserView`-does-not-live-inside-`.world`
collision), and tier 4 (closed desktop apps) are all untouched. So is the
loopback broker M14 deferred. #9 stays open after this lands.

---

## 2. What already exists, so the true cost is legible

| Piece | State before M24 |
|---|---|
| `github` credential | **Declared and verified.** Stored encrypted, label comes back from GitHub, no secret crosses IPC |
| `WorkItem` | Six provider-neutral fields at the adapter boundary, with a comment saying a second provider decides any wider shape |
| Adapter shape | `jira-client.ts`: injected requester, 15s timeout, 1MB body bound, distinct failure arms |
| Sessionless panel kind | Four of them (`review`, `file`, `jira`, `toolbox`) already never reach `assignTiers` or `registry.ensure` |
| Spawn-from-an-item | `onSpawn` + `Panel.title` + bracketed `paste()`, shipped and checked |

**The consequence worth stating up front: this milestone adds no panel kind and
no IPC channel.** `jira` becomes `work`, so the count stays at five; `jira:list`
becomes `work:list`, so `verify:ipc` stays at 45. A sixth integration that
*reduces* structural pressure is unusual, and it is the direct dividend of doing
the consolidation now rather than after a third provider.

---

## 3. The surface, derived

### 3.1 What survived: `WorkItem`, unchanged

GitHub's payload maps onto all six fields without strain:

| `WorkItem` | Jira | GitHub |
|---|---|---|
| `id` | `PROJ-123` | `owner/repo#123` |
| `title` | `fields.summary` | `title` |
| `description` | ADF flattened to text | `body` (markdown, already text) |
| `assignee` | `fields.assignee.displayName` | `assignee.login` |
| `state` | `fields.status.name` | `state`, or `draft` for a draft PR |
| `url` | `<site>/browse/<key>` | `html_url` |

**That it survived is the finding**, and it is worth recording as a measured
result rather than a design intention: the shape was written for one customer and
did not have to change for the second.

### 3.2 What did not survive: the flat list

Jira answers one query. GitHub answers two — **assigned to you** and **awaiting
your review** — and those are different obligations: one is work you owe, the
other is an opinion you owe. A flat merged list is a wrong answer wearing a
plausible shape, because the user cannot tell which pile an item came from.

The tempting fix is a new field on `WorkItem` (`kind`, `isPr`, `category`), and
it is wrong for a reason that generalises: **the item does not know which pile it
is in — the query does.** An item found by `review-requested:@me` is identical, on
the wire, to the same item found by `assignee:@me`. Encoding it on the item means
the adapter stamping a value derived from which loop it happened to be in, which
is a coordinate wearing a name — the same mistake `toolbox-node-model.ts` already
refuses for a matcherless hook.

So the **result** carries the structure and the item stays neutral:

```ts
export type WorkProvider = 'jira' | 'github'

export interface WorkGroup {
  /** Names the QUERY that produced these items, never the items themselves. */
  label: string
  items: WorkItem[]
}

export type WorkListResult =
  | { kind: 'groups'; groups: WorkGroup[] }
  | { kind: 'no-credential' | 'invalid-credential' | 'rejected'
        | 'rate-limited' | 'unavailable' | 'malformed'; reason: string }
```

Jira returns one group (`Assigned to you`). GitHub returns two.

**An empty group is rendered, not dropped.** `verify:rail` 43 already states the
rule for the review pane's `clean` arm: a panel that genuinely has nothing and a
panel the feature is broken for must not look identical. A user with no review
requests should read "Awaiting your review — none", not an absence they cannot
distinguish from a query that silently failed.

### 3.3 What the second provider forced onto the requester: response headers

`JiraRequester` resolves `{ status, body }`. That is not enough for GitHub, and
the reason is a failure with two different fixes wearing one status code:
**GitHub answers `403` both for a rejected token and for an exhausted search rate
limit** (the search endpoint allows 30 requests/minute, and this panel spends two
per load). Rendering a rate limit as "GitHub rejected the credential" sends the
user to regenerate a token that was fine — the `not-a-repo`/`repo-unreadable`
mistake in a new place.

`x-ratelimit-remaining: 0` is what separates them, so the requester type gains
`headers: Record<string, string>` and the result gains a `rate-limited` arm.
Jira's requester carries headers too and ignores them; a single requester shape
is what keeps `verify:work` driving both adapters through one fake.

---

## 4. Main — `src/main/github-client.ts`

Mirrors `jira-client.ts` deliberately and closely: injected `requester` so every
automated check stays offline, the same `TIMEOUT_MS`/`MAX_BODY_BYTES` posture,
and one exported `createGithubRequester()` that is the only thing in the file
that touches `node:https`.

**The credential is a bare opaque string**, not Jira's three-line JSON bundle, so
there is no `parseGithubCredential` beyond rejecting an empty or whitespace-only
value. This asymmetry is what justifies keeping two adapter files rather than one
parameterised one: the credential shapes, the auth headers, the query languages
and the error vocabularies are all provider-specific, and the only things
genuinely common are the *result* type and the *requester* type — which are
exactly what §3 lifts into `shared/`.

**Two requests, capped, merged and deduped by `html_url`:**

```
GET /search/issues?q=is:open assignee:@me&sort=updated&order=desc&per_page=50&advanced_search=true
GET /search/issues?q=is:open review-requested:@me&sort=updated&order=desc&per_page=50&advanced_search=true
```

Three details that each fail silently if dropped:

- **`User-Agent` is mandatory.** GitHub rejects a request without one with
  `403` and an administrative-rules message — which is, at our layer,
  indistinguishable from a rejected token. A missing header would therefore
  report "GitHub rejected the credential" for a perfectly good PAT, forever, on
  every machine. The header is set in the client, never left to the requester —
  and this is not a claim taken from documentation alone: `credential-verify.ts`
  already sends `'User-Agent': 'terminal-canvas'` on its own `GET /user`, so the
  app's one working GitHub call is the in-repo precedent.
- **`author:@me` is deliberately absent.** Your own open PR is either assigned to
  you — already covered by the first query — or it is waiting on someone else,
  which makes it their work item and not yours. Adding it would add a third
  request and a third failure path to restate a set we mostly already have.
- **Any failed request fails the whole load.** A partial answer rendered as a
  complete one is the confident-wrong-answer failure this repo refuses
  everywhere else; a user seeing one group where there should be two has no way
  to know the other query returned 500.

**An item in both piles is listed once, under `Assigned to you`.** A PR that is
assigned to you *and* awaiting your review is one obligation, not two, and the
assignment is the stronger of them — you owe the work, which subsumes owing the
opinion. Listing it twice would inflate both counts and make the panel disagree
with itself about how much is outstanding. The rule is stated as an ordering
(earlier group wins) rather than as a Jira/GitHub special case, so a third
provider's groups inherit it.

**Each query is capped at 50 and the remainder is reported, never swallowed.**
GitHub returns `total_count` beside the page, so a group holding 50 of 231 says
so — `REVIEW_FILE_CAP`'s `+N more` rule, which exists because a list that simply
stops is indistinguishable from a list that is complete. The merged panel is not
capped a second time; two capped groups is already a bound.

---

## 5. Persistence — one `work` kind, and the migration

`PersistedJiraPanel` becomes:

```ts
export interface PersistedWorkPanel extends PersistedPanelBase {
  kind: 'work'
  provider: WorkProvider
}
```

Four rules in `parsePanel`, each with a precedent in the file already:

1. **Legacy `kind: 'jira'` maps to `{ kind: 'work', provider: 'jira' }` and warns
   nothing.** It is every file written between M17 and M24, which is exactly the
   standing of an absent `kind` at M9b — a historical fact about earlier files,
   not a message from a later version.
2. **An unknown `provider` drops the panel with a warning.** A closed union that
   fails safe, the rule M20's `permissionMode` already obeys: a value written by
   a version that knows a provider this one does not is one we cannot render.
3. **`kind: 'work'` with an absent `provider` is dropped**, not defaulted to
   Jira. Defaulting would render one provider's panel under another's name.
4. **The writer always writes `kind: 'work'` and the provider.** `layout-adapt.ts`
   is the *other* door onto this format — `fromPanels`/`toPanels`, called on
   every save and every boot — and the repo has learned three times
   (`verify:layout` 108b, 117, 144) that a schema-only round trip cannot see it.

**Panel ids.** New work panels mint the `w` prefix; both id-seed regexes in
`Canvas.tsx` widen to `/^[nrfjtw](\d+)$/`. Legacy `j` ids must stay readable
regardless — a persisted `j4` the seed cannot see is a counter that hands out a
duplicate id, which is the quiet direction and the exact failure that entry in
`CLAUDE.md` already records twice.

`isJiraPanel` becomes `isWorkPanel`, and `isTerminalPanel`'s negation keeps the
same arity — five kinds in, five kinds out.

**A panel is bound to one provider when it is minted and cannot switch.** There
is no provider dropdown in the chrome: the panel *is* the answer to "what does
GitHub say I owe", and a control that repointed it at Jira would make its own
title a claim about a query it is no longer running. Two providers is two
panels, which is also what makes them independently placeable on a canvas whose
whole premise is spatial arrangement.

---

## 6. Renderer

**`src/renderer/work/work-node-model.ts` — pure, and this is a correction.**
`review`, `file` and `toolbox` each have a pure `*-node-model.ts` covered by
plain-node checks in `verify:rail`; `JiraNode.tsx` builds its rendering inline
and has no model checks at all. The new kind follows the majority convention
rather than the one exception, so its arms are checkable in the cheapest tier the
repo has. Arms: no-credential, in-flight, groups (including empty ones), and each
failure reason distinct.

**The no-credential arm is actionable, not blank.** "Connect GitHub" with the
verb that opens the credential entry — `verify:palette` 31's rule that a missing
affordance is indistinguishable from a missing feature.

**`WorkNode.tsx`** replaces `JiraNode.tsx`, keeps its chrome, its `⟳` refresh, its
`data-scroll-host` (so `shouldYieldWheel`'s rule 3 is inherited by attribute
rather than by a kind test), and keeps the spawn path byte-for-byte: `onSpawn`,
`Panel.title` set to `id: title`, description inserted with bracketed `paste()`
and never `write()`.

**Palette — one row per provider, and a fix folded in.** `jira.open` renders only
when a Jira credential exists, which is the failure `verify:palette` 70's own
comment names for the credential Add row: the row a user without the integration
most needs to see is the one that is missing. Both rows become always-visible,
disabled with a reason naming the connection to make. This is a targeted
improvement to code the milestone is already rewriting, not unrelated
refactoring.

---

## 7. IPC and the boundary

`JIRA_LIST: 'jira:list'` becomes `WORK_LIST: 'work:list'`, taking a
`WorkProvider`. **A rename, not an addition** — `verify:ipc` stays at 45 channels,
and `README.md`'s diagram plus `scripts/verify-ipc-surface.cjs`'s own
`EXPECTED_CHANNELS` comment both need the arithmetic prose updated rather than
the number.

Both M14 rules survive untouched, and neither is weakened by a second provider:

- **Rule 1 — no return carries a secret.** `work:list` returns `WorkListResult`,
  which is `WorkItem`s and reasons. There is still no `credential:get`.
- **Rule 2 — no environment builder imports credential code.** `github-client.ts`
  is main-only and builds no process environment. `verify:meta` 21's hardcoded
  offender list (`shell-env.ts`, `pty-manager.ts`, `session-backend.ts`) is
  unchanged by this milestone, and its documented limit — that the list is a
  snapshot rather than a derived fact — is unchanged too.

Issue and PR text may reach a panel and may be pasted to an agent for the reason
Jira's spec gives: it is work text, not a credential.

---

## 8. Failure model

Six distinct answers, never collapsed, because each has a different fix:

| Arm | Cause | What the user does |
|---|---|---|
| `no-credential` | nothing stored | connect GitHub |
| `invalid-credential` | stored value empty or unparseable | re-enter it |
| `rejected` | `401`, or `403` with quota remaining | regenerate the token |
| `rate-limited` | `403` with `x-ratelimit-remaining: 0` | wait |
| `unavailable` | transport failure, timeout, other status | retry |
| `malformed` | `200` this app could not read | report it |

A blank panel is never an error signal, and an empty result is never rendered as
a failure.

---

## 9. Verification

| Suite | What it gains |
|---|---|
| `verify:work` (replaces `verify:jira`) | Both adapters against one injected requester: GitHub auth header construction including `User-Agent`, the two-query merge and its dedupe, the `403` split between `rejected` and `rate-limited`, the no-credential early return **with no requester call at all**, malformed refusal, and Jira's five existing checks carried over into the grouped result |
| `verify:layout` | The `jira` → `work` migration warning nothing; an unknown provider dropped with a warning while its neighbour survives; an absent provider dropped rather than defaulted; the round trip through `layout-adapt` with no top-level `cwd` written |
| `verify:viewport` | The kind partition restated for `work` — five panels in one read, since a helper that got any one backwards still looks correct against the other four |
| `verify:rail` | `work-node-model`'s arms, the empty-group clause, and the rail/inspector arms (never dormant, process verbs refused) — the last of which closes a **pre-existing gap this milestone surfaced**: `rail-rows.ts` has tail arms for `file` and `toolbox`, both placed before the dormant test with the same comment, and has never had one for `jira`, so a work panel falls through to `'not started'` — a sentence about a process it does not have, above a start control nothing can honour |
| `verify:palette` | Both provider rows present and **disabled with distinct reasons** when unconnected — the clause that fails against today's disappearing row |
| `verify:panels` | The panel end to end through a stubbed requester: renders real items, holds no `PanelSession`, sends no `pty.kill` on close (against a shadowed recorder, with a real terminal panel closed in the same window as the positive half), and spawns a terminal whose title and pasted description are the item's |
| `verify:ipc` / `verify:meta` | The channel rename, the README diagram, and the verify chain wiring |

**The `403` split is the check worth knowing by number once it is written**: it is
the only assertion in the milestone that separates two failures GitHub reports
identically, and without it the app tells a rate-limited user their token is bad.

---

## 10. What no suite can prove

**No suite reaches GitHub**, deliberately — `npm run verify` is this repo's one
green-or-not signal and must stay fast and offline, the same rule that keeps
`verify:packaged` out of the chain and that made `verify:panels` 130 probe the
credential verb's refusal *before* storing a token.

So three facts have the standing of M17's `--session-id` filename rule and
`verify:panels` 32's default-preset push — verified by a hand on a real
invocation once, or not at all:

1. `advanced_search=true` and the `/search/issues` contract are current. GitHub
   has moved this endpoint before; if it moves again every suite here stays green
   and the panel reports `malformed` forever.
2. The `403` / `x-ratelimit-remaining` split behaves as documented against a real
   exhausted quota.
3. A PAT with insufficient scope returns public results rather than an error — an
   empty list is a legitimate answer, so an under-scoped token is
   indistinguishable from having no assigned work.

The hand-check records what only a real account can show: the panel listing an
issue whose key and title match github.com, and the two groups populated
independently. It does **not** prove rejected-token behaviour, rate limiting, or
enterprise tenants.

---

## 11. Out of scope

All GitHub **writes** (no comments, no assignment, no merges) — a write needs an
explicit user gesture performing one named mutation, exactly as Jira's spec
reasons, and this panel needs none. Also out: pagination beyond the first 50 per
query, GitHub Enterprise Server, OAuth (a PAT is sufficient for a private
read-only client, Jira's own argument), the notifications feed, and PR diffs —
that last one belongs to the review layer, not here.

---

## 12. Sequencing

Five phases. Phases 1–3 are independently shippable and leave Jira working
throughout; the panel lands in Phase 4.

1. **The work types and the migration** — `shared/work-item.ts` widened,
   `layout-schema`, `layout-adapt`, the kind partition, the id regexes. No
   behaviour change: Jira panels persist and render through the new kind.
   *Checks:* `verify:layout`, `verify:viewport`.
2. **The channel and the grouped result** — `work:list`, Jira's adapter returning
   one group, requester headers. *Checks:* `verify:work`, `verify:ipc`,
   `verify:meta`.
3. **The GitHub adapter** — `github-client.ts`, inert until Phase 4.
   *Checks:* `verify:work`.
4. **The renderer** — `work-node-model.ts`, `WorkNode.tsx`, palette rows, rail and
   inspector arms. *Checks:* `verify:rail`, `verify:palette`, `verify:panels`.
5. **Docs and the hand-check** — `CLAUDE.md`'s verify table, channel arithmetic,
   partition and id-prefix entries; `README.md`'s diagram; the recorded hand-check
   with what it could not prove.
