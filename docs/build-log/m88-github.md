# M88 — GitHub through the broker

**Branch:** `m88-github`. **Spec:** `docs/superpowers/specs/2026-09-04-m88-github-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-04-m88-github.md`. **Status:** finished 2026-09-04.

**Thesis sentence:** the work assigned to you on GitHub, as a node on the canvas that starts an
agent on any item — and the same API an agent in a panel reaches with `tc api github`.

## What landed

- `main/github-client.ts`: `listAssignedWorkItems({ broker, panelId? })` — through the BROKER,
  never the credential store (the spec said an injected requester; the build found that a
  fourth store reader failed `readers.1` and that the broker was the better door anyway).
  Issues assigned and review requests become `WorkItem`s keyed `owner/repo#N`; a PR is one
  item across both lists; the review search failing alone leaves the issues with a note.
  `verify:github` (5/5, a new plain-node suite in the chain).
- `github:list` in the contract and both diagrams; `verify:ipc` at 91.
- The ninth kind: `panels.ts`, the schema and adapt arms, `panel-state.ts`, the frame word,
  the icon, the rail and palette words, the inspector arm; `verify:rail kind-tail.1/.2` and
  the vocabulary lists carry it (158/158).
- `GithubNode.tsx`: three states, the count in the chrome, `Connect GitHub…` on the
  no-credential arm, one card per item with `Start session` and `open on GitHub`;
  `spawnWorkItem(item, source)` in Canvas serving both work panels. `verify:panels github.1`
  over a recorded broker (296/296).
- The palette's `Open GitHub work` row, present and disabled by name without a credential.
  `verify:palette github.1` (123/123).
- A `github` shot scene. Documents: README row, CLAUDE.md note and counts, load-bearing
  entries, the dead-end audit line.

## Red first

- `verify:github` red at module scope; `verify:rail` red on the unknown kind (its inspector
  probe guarded so the throw reads as a red row rather than an aborted suite);
  `verify:palette github.1` red on the absent row; `verify:panels github.1` red on the absent
  kind.

## Decisions taken while building, and why

- **Through the broker.** See the load-bearing entry: three readers stay three, and the
  panel's reads are audit rows.
- **One spawn verb for both work panels.** `spawnJiraTicket` became `spawnWorkItem(item,
  source)`, the source word leading the opening context so the agent knows which system an
  id belongs to.
- **A PR is one item.** The review request wins over its issue-list twin.

## The visual loop

See the triage below.

## Verification

`npm run verify` run alone after the verify tmux server was killed: `verify:github` 6/6,
`verify:rail` 158/158, `verify:palette` 123/123, `verify:layout` 194/194, `verify:panels`
296/296, `verify:ipc` 91 channels; the chain's exit code 0 recorded from the run, and the
`github` scene re-shot after both triages.

## Triage: the critic

**Accepted and fixed.** An issue and a pull request were told apart only by the luck of a
state word (the caps slot now leads with the kind: `ISSUE · OPEN`, `PULL REQUEST · REVIEW
REQUESTED`). `3 items` was the one generic noun on the screen (now `2 issues · 1 review`,
counted). The list had no provenance line (now the memory node's own dim line: `assigned to
you · reviews requested of you`). The two verbs used two cases (`Open on GitHub`, sentence
case, keeping the link idiom for a verb that navigates away). The dim body line clipped
mid-word at the frame edge (an inset matches the reference line's).

**Declined, with a reason.** *A state word on the rail row.* A work panel is a document kind;
the critic asked that it NOT gain one, and it has not.

## Triage: the verifier

Verdict: delivered with gaps. **Accepted and fixed:**

- **403 was reported as a bad credential.** GitHub answers 403 for a secondary rate limit
  and for an SSO-protected organisation with a token that is fine; the user was sent to the
  wrong door. Only 401 is `rejected`; 403 is `unavailable` with GitHub's own message.
- **The panel's audit rows carried no panel id.** `github:list(panelId)` forwards the node's
  id through the broker.
- **`truncated` was never read**, so an over-cap answer read as `malformed`. A named reason.
- **The 50-item page and the search's `total_count` were silent.** Each is a note.
- **One sentence in three hand-typed copies.** `notConnectedReason` lives in the shared
  schema; the broker's refusal carries `code: 'not-connected'` and the client sorts by the
  code, never the sentence.
- **A review request's `assignee` was its author.** The assignee only; the check pinned the
  wrong reading and was corrected.
- **`Start session` was hidden under the merged view.** Disabled with `leave merged view to
  start`. **A rejected credential offered no verb.** `Connect GitHub…` on that arm too.
- **A body's control bytes reached the terminal as opening context.** Escape sequences
  stripped whole through M39's stripper, CRLF normalised; a middle-click on the link is
  swallowed.

**Declined, with reasons.** *Following `Link` headers past the first page:* the note says
there is more, and a work panel is a picture of the next things, not an archive. *A cache
against refetch-on-mount:* Jira's node has the same shape; the cost is two reads per mount and
they are audit rows, which is the design. *`team-review-requested`:* not queried; recorded as
the scope of "waiting on you".

## One commit with M89

M89's seam was built in the same tree before M88 was committed, and the two share files a
commit cannot split without producing a revision that does not build (`Canvas.tsx`, the
palette's rows, the contract). They ship as one commit, named for both, with each build log
standing on its own. M88's own chain run had one red — `handoff.1`, a paste into a live
target the milestone never touched — and the suite passed it on the next run; recorded as a
load flake rather than as green.
