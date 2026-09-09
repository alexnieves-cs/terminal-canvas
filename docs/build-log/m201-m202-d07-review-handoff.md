# M201–M202 — D07 the review handoff

The [D07 guide](../product-development-guide-2026-09-08.md#d07--build-the-review-handoff),
[M201 spec](../superpowers/specs/2026-09-09-m201-review-readiness.md) and
[M202 spec](../superpowers/specs/2026-09-09-m202-review-handoff.md) define this close.

## What the phase found

The board's `review` state is produced by exactly one line in the application — `Canvas.tsx`, on a
pull request opening — and the Board pane's own empty-column sentence says so: *"set when a lane
opens its pull request"*. Read at HEAD before any change: `src/shared/work-items.ts` contained the
word "review" in two places, its doc comment and the state literal, and nothing else. The card's
`Review` verb existed and was **navigation only** — it minted an across-worktrees review panel and
wrote nothing back, so it could not record that anybody had looked. There was no word at all for
the state a task is in for most of its life: the agent stopped, the lane holds changes, nobody has
read them.

D06 stopped deliberately short of that: `turn complete`, `exit 0` and `run ended` are neutral on
purpose and every ended detail ends *"the task disposition is unchanged"*. D07 is the phase that
turns those honest execution facts into an answer to "is this reviewable, and did I already
review it?"

## What shipped

**`shared/review-readiness.ts`** is one pure projection and invents no fact. It keeps **two axes
apart**: `ReviewHandoffState` is what is true of the task now (`no-lane`, `lane-missing`,
`unreadable`, `blocked`, `working`, `empty`, `ready`), and `ReviewStanding` is what the person
already did (`none`, `current`, `stale`). A task can be `working` **and** `stale` at once — the
agent went back to work after you reviewed — and a single word cannot say both. That is M199's
five-axis rule applied one level out, and `readiness.2` is what holds it open.

Execution outranks the diff, and `no-lane` outranks everything: an agent still writing means the
diff under it is a moving target, and calling that "ready to review" is the lie this milestone
removes. A clean lane is `empty` — *"nothing was written, which is not the same as nothing being
wrong"* — never a green completion.

**Evidence has two sources with different epistemic standing and they are never merged.** A
command in this app's run ledger was spawned by main, which read its exit code off the PTY —
`observed`. A command in a conversation's transcript is one this app watched the agent *request*;
the outcome is the agent's CLI's claim — `reported`, with no exit code, because there is none to
show. The attribution is on every row rather than once at the top. **No command is classified as a
"test" or a "check" by pattern**: a rule deciding `npm test` is a check while `make ci` is not
would hang a confident pass/fail badge on a guess, which is the failure D06 spent two milestones
removing. A block qualifies by NAMING a command, never by its tool being called `Bash` — a name
list goes wrong on the backend nobody tested.

**One persisted fact**: `PersistedWorkItem.reviewed` — `{ at, signature, files }`, absent until
somebody reviews. No diff and no path list enters the layout. It is the user's, so a provider
re-add keeps it: re-reading an issue from GitHub says nothing about whether anybody looked at the
lane.

**M202's surface.** The card gains a third line beside the disposition pill and the M200 execution
word, and a fifth verb, `resume` — an addition, never a rename, because the four existing DOM
aliases are what roughly two hundred checks select on. `Review` opens an across-worktrees review
carrying `subject.workItemId`, and the node grows a task section: the handoff word and its
sentence, what was run and who says so, `Mark reviewed`, and `Continue the conversation`, which
focuses the lane's chat and **inserts** — never sends — M80's rule for every message this app puts
in a composer.

The task review starts from the **worktree record**, not the subject panel: a record outlives its
panel (M37), so a review opens on a lane whose agent was dismissed hours ago — which is exactly
the case a person comes back to.

## Two decisions recorded rather than assumed

**`Mark reviewed` is a node control and has no verb, no palette row and no agent line.** Every
other user-facing verb takes the four-door rule; this one deliberately does not. An agent line
asserting *a person reviewed this* is the false claim this whole phase removes, and a workflow
node marking its own output reviewed would make the mark worthless. It sits beside `Commit`, which
is a node control with no palette row for the same family of reason.

**`Locate the lane…` routes to `Start work…` rather than rebinding to a chosen directory.** D07's
step 6 asks for locate/rebind for missing or moved **files**, and that is already honest: a rename
is carried as `renamedFrom` and a file whose diff cannot be read answers `unavailable` rather than
substituting another. A *lane* whose record is gone is different — re-pointing a task at an
arbitrary directory needs main to re-judge that root through the Places gate and mint a record for
it, which is a new grant-adjacent door. The existing honest recovery is one click away and the
action says what it will do. If a real need for rebinding appears it gets its own milestone and
its own gate checks.

## `ACROSS_BASELINE`, and why a name rather than a fake

An across node never sends `baselineSha` to git: `review:across` takes the root alone and each
section compares against its own fork (M86's choice, precisely because main drops a panel's
baseline on kill). For a task review opened on a closed lane the field has nothing true to hold.
The choice was between weakening the parser's "all four or drop the node" rule for every subject
and naming the absence once. It is named — never an empty string, which `isStr` would drop and
take the node with it, and never a plausible-looking fake sha, which would be shown to a person as
a commit they could go and look at. `across-baseline.1` reads `review-engine.ts` as TEXT to prove
`reviewAcross` builds no argv from a caller-supplied baseline: no fake runner can prove a call was
never made, the same argument `git.1` makes about the absence of a fetch.

## The signature's recorded bound

`reviewSignature` fingerprints the diff's SHAPE — sorted path, both counts, binary/untracked/
rename flags — and not its content. **A change leaving every path and both counts identical (one
line edited and another reverted in the same file) is NOT detected as stale.** Hashing content
would mean reading every hunk on every card render, on a surface that is drawn constantly. The
bound is in the module header and pinned by `readiness.3`, so a later attempt to "fix" it fails
the check that documents it first.

## Two real defects the checks caught

**`worktreeRows` loads only when the palette opens** (`Canvas.tsx`: `if (palette.open)
reloadWorktrees()`). That is the right rule for a palette row and the wrong one for a card that
has to be honest at rest: a card reading it would say `not started` about a task with a real lane
until the person happened to press ⌘K — a wrong answer shaped exactly like a right one.
`useTaskHandoffs` therefore owns its own read, with `null` as a real third state so a card that
NAMES a worktree says nothing until the read lands; treating "not read yet" as "record missing"
would flash `lane missing` on every launch. `work.action.1` caught this, red.

**`Continue the conversation` was enabled over a panel that merely existed.**
`insertIntoComposer` is a no-op for anything but a chat, so a lane that is a terminal left the
control enabled and doing nothing at all. It now requires a chat and refuses by name.
`review.task.2` caught this, red; nothing on screen would have.

## Evidence

Red-first, each watched failing before its implementation existed:

- `readiness.1`–`readiness.5` — watched failing against a stub module, with the 99 checks below
  them still running (each block is wrapped in its own try/catch, because a check that THROWS
  aborts the run and its red is not evidence).
- `readiness.6`, `across-baseline.1` — watched failing before `laneSection` and `ACROSS_BASELINE`.
- `work.readiness.1`, `review.task.1` — written after their implementation, then watched failing
  with the source stashed, and the stash restored.
- `closure.1`, `executor.1`, `closure.v9.1` — watched failing for the three unwired doors of
  `review-task` before the palette row, the executor arm and the action member existed.
- `work.action.1`, `review.task.2` — real Electron, a real git repository with a real linked
  worktree, presses in separate tasks (M195's rule).

Two existing checks changed deliberately, each with its reason recorded at the assertion:
`board.1`'s verb count 4 → 5 (the added `resume`), and `reach.2`'s enabled-verb floor 3 → 2
(`Review` is now enabled only when there is something settled to review; that check's subject is
the tab order, which is unchanged and still asserted in full).

`verify:panels:product`'s watchdog re-measured: 125 s green, set to 190000 with headroom above
1.25×, because a watchdog kill reads as a HANG and not as a red check.

## The critic round

A fresh-context critic read the guide's D07, both specs, the implementation and every check, and
found real defects. What it found and what was done:

**`shared` was folded into `changes` — fixed.** `filesOf` returned the files for both arms, so a
repository where two or more panels have run — where, by `review.ts`'s own definition, no
per-panel diff is attributable — read as `ready to review · N files` and let `Mark reviewed`
record a signature over other panels' work. D07 step 3 names "shared-repository changes" as one of
the four claims that must stay distinguishable, and this module's header spends forty lines
insisting `observed` and `reported` must never merge before merging the one the guide spelled out.
`shared` is now its own state with its own sentence, still reviewable — a person CAN read it — and
`readiness.1` covers it.

**The empty-evidence sentence overclaimed — fixed.** It said *"this canvas ran none in it, and the
conversation asked for none"* whenever the list came back empty, including when the lane's
conversation was closed (so its commands were never looked for — the primary case this milestone
exists for) and when the ledger read had FAILED. `reviewEvidence` now takes what was actually
looked at and has four distinct sentences; `readiness.5` asserts all four differ and that only the
both-were-read arm may claim nothing ran. The node keeps a failed ledger read apart from an empty
one.

**D07 step 2's "agent explanation" and "unresolved questions" were silently missing — added.** The
lane chat's last words now appear as the agent's ACCOUNT, labelled *"the agent's own account, not
evidence"* and set apart from the evidence list, because attributing a claim as a finding is the
collapse this phase exists to prevent. The pending question appears as `unresolved:` and is
deliberately NOT answerable here — a permission prompt is answered where the person can see what
they are agreeing to.

**`locate` was a dangling promise — removed.** Four arms produced `actionLabel: 'Locate the lane…'`
and a detail telling the person to locate the lane, and no surface in the product offers that;
`ReviewAction` no longer has the member, and a lost lane routes to `Start work again…`, which is a
door that exists. The card now marks the fact-chosen action with `data-work-next` instead of only
labelling `review`.

**`setRecords((r) => r ?? [])` did the opposite of its own comment — fixed.** The comment said a
failed read never becomes an empty list; on the FIRST read — the only one that matters, since
`records` starts `null` — `r` is `null`, so one failed IPC call turned every dispatched card into
`lane missing`, with no retry. A failed read now leaves the previous answer standing, so the cards
say nothing.

**Two authors of one diff — removed.** The node recomputed `laneSection` and `reviewSignature` from
its own fetch while `Mark reviewed` was gated on the hook's state, so the two reads refreshing on
different triggers could record a fingerprint for a diff the card never judged. The paths and the
signature now come from the hook's single read.

**The card's readiness had one trigger and `refresh` had no caller — fixed.** A lane driven by a
terminal produces no chat turns, so a card could sit on `reviewed` over a diff that had moved. The
review node's `Mark reviewed` now refreshes the card through `onRefresh`.

**Three checks were weak — fixed.** `readiness.3`'s headline assertion compared the same input
twice through a pure function and could not fail for any implementation, including the
content-hashing one it claimed to guard against; it now pins the bound by its CAUSE (the signature
reads five named fields and nothing else). `across-baseline.1` asserted the constant's absence from
`review-engine.ts` under a comment claiming it proved a single shared export; it now counts the
declarations. One comment in `readiness.1` said the opposite of the line it sat above.

**`review.task.2` now renders real evidence.** The first cut asserted only the honest-empty
sentence, so the evidence-row DOM — the exit-code labels, the per-row attribution — was never
rendered by any check and a broken list would have passed. The fixture now writes real run-ledger
rows for two commands run in the lane and one run outside it, and the check asserts the failure
sorts first, each row carries the code this app read, the words name who watched it exit, and the
outside command is absent.

**Recorded, not fixed.** `laneSection`'s precondition (the caller must pass a worktree root; a
strict-ancestor match is possible if a lane's own section is absent) is in the module header with
the reason an exact-match guard was rejected — git re-resolves record paths and macOS spells the
same directory two ways, so exact matching would make every task review read `lane missing`, a
worse and likelier wrong answer than the one it prevents. The per-panel ledger read is capped at 40
rows, so `more` understates for a very busy lane; the cap and its reason are at the constant. The
card carries three state words at rest — disposition, execution, review — which is a deliberate
reading of the density model for a card whose whole job is to answer "what now", and is called out
here rather than assumed.

## Owed by hand

No suite in this repository drives a real agent CLI, so the `reported` half of the evidence list
is proven by `readiness.4` over recorded transcript shapes and by nothing end to end: that a real
`claude` session's Bash tool calls appear in the task section, with the agent's own pass/fail and
labelled as the agent's claim, needs a person and a real conversation, once. The `observed` half
IS covered end to end after the critic round (`review.task.2` writes real ledger rows and asserts
the rendered attribution), so what remains owed is the agent side alone — plus the agent's
`account` line, which needs a real conversation for the same reason.
