# M24: Jira writes — Design

**Status:** designed and ready to implement.
**Backlog entries:** #12 (Jira connection — the writes half), #9 (service integrations).

**On the number.** This is claimed as M24 because M23 is the highest row in
`README.md`'s table at the time of writing. That table's own rule governs if
another branch lands first: the number belongs to whichever milestone reaches
`main` first, and the branch arriving later renames itself.

## Decision record

M19 shipped the Jira Cloud read path and closed its own spec with a sentence
this milestone is the direct answer to: *"A future write milestone should use
an explicit user gesture that has main perform one named mutation; that
preserves the M14 boundary and gives the user a confirmable action."* That is
exactly the shape below. Nothing here reopens the credential decision, the
Cloud-versus-Server decision, or the OAuth deferral — those remain open lines
in backlog #12.

The decision M19 explicitly left unmade was whether to write at all. Its words:
*"writing to Jira from an app where agents run arbitrary commands is a
meaningfully different risk posture than reading. Ship reads, then decide about
writes deliberately — that decision has not been made."* **This milestone makes
it, and makes it narrowly.** Writes are added, and the risk posture is answered
by a rule rather than by hope: no agent-reachable path may trigger a Jira
write. A write originates only in a human gesture inside a Jira panel.

That rule is close to free today — an agent lives in a PTY and has no bridge
access, so nothing about the current code violates it. It is written down and
pinned anyway, for `verify:meta` 20/21's stated reason: **a violation of it
would have no runtime symptom.** Add a channel or a call that let an agent's
output drive a Jira write and the app works exactly as it does now, plus one
capability nobody asked for. Prose has already lost an invariant of this shape
in this repository once.

Two verbs ship: comment on a ticket, and transition a ticket. Both are the
verbs a person reaches for while an agent is working the ticket beside them,
which is the only reason this feature belongs on this canvas rather than in a
browser tab.

## Scope

1. **The requester seam widens.** `JiraRequest` gains `method` and an optional
   `body`; `createJiraRequester` honours both. This is not a detail — the
   injected requester is the whole reason `verify:jira` can assert a write
   contract under plain node without a network call, which is the repo's
   standing rule that `npm run verify` is fast and offline.
2. **Three channels**, taking `verify:ipc` from 45 to 48: `jira:transitions`
   (a read), `jira:comment` and `jira:transition` (the two writes). Each is one
   named mutation performed by main, per M19's own recommendation.
3. **`textToAdf`**, the deliberate inverse of the existing `adfText`. Jira
   Cloud's v3 comment endpoint requires Atlassian Document Format going in.
4. **Write controls on a ticket row** in `JiraNode`: a comment draft, and a
   two-step transition control.
5. **The agent boundary, pinned as source text** in `verify:meta`.

Out of scope, unchanged from #12: Jira Server/Data Center, OAuth 3LO, a second
provider, and the wall-of-tickets view (#35's territory). Also out of scope and
new to this milestone: transition screens (see "What this deliberately does not
do").

## The rule, and what pins it

**No agent-reachable path triggers a Jira write.** Concretely: the write
functions in `jira-client.ts` are called only from `main/ipc.ts`'s handlers,
and those handlers answer only an invoke, which only the renderer can make.
Nothing that builds a process environment, and nothing on a PTY data path,
reaches the Jira client.

Two `verify:meta` checks, both reading COMMENT-STRIPPED source, because
`jira-client.ts` will carry prose naming the very things that must not appear:

- The `JIRA_*` key set parsed out of `IPC` is asserted **exactly** equal to
  `{JIRA_LIST, JIRA_TRANSITIONS, JIRA_COMMENT, JIRA_TRANSITION}`. An
  **allowlist**, never a test for a forbidden spelling — check 20's own lesson,
  where testing for `credential:get` would have pinned the spelling and let a
  sibling named `CREDENTIAL_REVEAL` through. A future `JIRA_DELETE_ISSUE` fails
  this check by existing.
- `shell-env.ts`, `pty-manager.ts` and `session-backend.ts` do not import
  `jira-client`.

**Both checks are narrower than the rule, and that is recorded rather than
hidden**, exactly as check 21 records its own limits. The import half greps
each offender file's own source, so a second hop through a non-Jira
intermediate module is unchecked. The three-file offender list is a hardcoded
snapshot of "the modules that build a process environment" as of M24, so a
fourth such module added later is unchecked by construction. A green run means
the checked shapes hold; it is not proof the rule holds.

## API and failure model

| Verb | Request |
|---|---|
| `jira:transitions` | `GET /rest/api/3/issue/{key}/transitions` |
| `jira:comment` | `POST /rest/api/3/issue/{key}/comment`, body `{ body: <ADF doc> }` |
| `jira:transition` | `POST /rest/api/3/issue/{key}/transitions`, body `{ transition: { id } }` |

All three inherit the read path's timeout and body bounds.

**Transitions are fetched on demand, one issue at a time, and are deliberately
not folded into `jira:list`.** Jira transitions are workflow-defined per issue,
so the legal set is only knowable from the server. Folding the read into the
list would fire one extra request per ticket on every panel load, for tickets
nobody is going to transition — `review:diff`'s and `toolbox:permissions`'
shape, reached by the same arithmetic.

**Failure arms.** The read path's five arms — `no-credential`,
`invalid-credential`, `rejected`, `unavailable`, `malformed` — carry over
unchanged. Writes add a sixth:

**`refused`**, for a 400, carrying Jira's own message. This is
`review-commit.ts`'s `refused`/`failed` split and exists for its reason: a
workflow declining a transition and Jira being unreachable are two situations
with two different fixes, and collapsing them sends a user to check their
network when their board is what said no. `refused` is the arm a correctly
configured, fully reachable Jira produces routinely; `unavailable` is not.

A missing credential refuses **before any request is made**, on every one of
the three channels — the shape `verify:jira` 4 already pins for the read path,
and the reason `verify:panels` 130 can probe a verify path with zero network
traffic.

## Gates

**Neither verb takes a modal.** This app has exactly one modal-shaped surface,
the palette's confirm mode, and a dialog on every write trains a user to click
through the one that mattered.

**Comment: the draft is the gate.** A comment needs a typed body, so the draft
plus an explicit Send *is* the confirmation — M9c's commit form exactly. Cloning
that form means inheriting three obligations, each of which fails silently:

- It `stopPropagation`s on **every** key, not only the two it handles.
  `useViewport`'s keydown listener is on `window`, so an ungated `Cmd+N` typed
  into a comment spawns a panel behind the node and `Cmd+K` opens the palette
  over it.
- `.jira-node__comment-form` joins `.review-node__commit-form` and
  `.file-node__editor` in `useNavGrid`'s target test. That listener is
  **capture-phase on `window`** and has already run by the time the field's own
  bubble-phase guard could help — so unguarded, `Cmd+G` typed into a comment
  reveals the nav grid, the open branch's `default:` arm swallows every further
  keystroke, and releasing `Cmd` switches workspace and unmounts the panel with
  the comment unsent. The test is the event's TARGET and never
  `document.activeElement`, because xterm's own helper is a `<textarea>` and an
  activeElement test would disable `Cmd+G` over every terminal panel.
- Both exits restore focus to the captured panel id. An unmounting input's blur
  leaves focus on `<body>`, where every subsequent keystroke goes nowhere —
  rule 4 of "who owns the keyboard".

**Transition: the fetch is the arm.** First press fetches the legal set and
renders it; picking one fires. That is one gesture with a real second step
rather than a confirm bolted onto a list that was already on screen — and the
fetch is also where "you cannot transition this ticket" is discovered, before a
button that would fail is ever offered.

An in-flight write disables its own control and says so, so a double press
cannot send twice.

## Verification

**`verify:jira`** (plain node, injected requester, no network) gains checks
for: the widened requester contract carrying `method` and `body`; `textToAdf`
producing a document `adfText` flattens back to the input, which is what makes
the pair a round trip rather than two independent guesses; the transitions
mapping; each of the three channels refusing with **zero requester calls** when
no credential is stored; and the `refused`-versus-`unavailable` split asserted
on a 400 and on a thrown request separately, since a check that only asserted
"not ok" would pass against the collapse this arm exists to prevent.

**`verify:meta`** gains the two source-text checks above.

**`verify:ipc`** moves 45 → 48. `README.md`'s diagram and the count stated in
`scripts/verify-ipc-surface.cjs`' own comment both move with it — the number is
stated in two places on purpose.

**`verify:panels`** drives a comment end to end in a real renderer: type into
the real draft, send through a stubbed adapter, and assert the panel reports
the send. Its non-vacuity clause matters — a check asserting only "no error
appeared" passes before the feature exists.

**No suite reaches Jira.** After implementation a human must connect a real
tenant once and record what could not be produced locally: a comment appearing
on a real ticket, and a real transition moving a real board column. That hand
check will not prove the `refused` arm, tenant permissions beyond that account,
or Server/Data Center behaviour — it must not be read as proving them.

## What this deliberately does not do

- **Transition screens.** Some Jira workflows require a field — a resolution, a
  comment — before a transition is legal. This milestone ships the
  no-required-fields case and reports `refused` with Jira's own message
  otherwise. Building a dynamic form from a transition's `fields` payload is a
  milestone of its own; guessing at required fields is worse than refusing.
- **Editing or deleting a comment.** Only creation. Every additional verb is
  another line on the allowlist above, and each should be argued for
  separately.
- **Any agent-initiated write.** M19's spec named the design that would be
  needed if an agent ever must initiate one — a loopback broker, the only
  agent-initiated shape that avoids revealing a credential. That remains
  unbuilt, and the rule above is what keeps its absence honest.
- **Optimistic local state.** A ticket's rendered state comes from Jira. After
  a successful transition the panel re-reads rather than patching the row it
  has, so the screen cannot claim a state the server did not confirm.
