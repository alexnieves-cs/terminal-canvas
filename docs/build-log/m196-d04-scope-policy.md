# M196 — D04, one policy for repository, worktree lane and memory scope

The guide's [D04](../product-development-guide-2026-09-08.md#d04--resolve-repository-worktree-and-memory-scope-consistently).
The spec is [2026-09-09-m196-scope-policy.md](../superpowers/specs/2026-09-09-m196-scope-policy.md)
and the plan is [its plan](../superpowers/plans/2026-09-09-m196-scope-policy.md). It closes the
audit's one open **investigation** (`memoryRoot` against the worktree translation every other door
applies) and the one item D02 handed forward **by name** (`skillsCwd`'s project-skill refusal).

Written under the ledger's evidence rule: every line is **read** (source at a line), **observed**
(a golden looked at), **run** (a command with its exit code and tally) or **inferred** (a
judgement, which is not evidence).

---

## 1. The measurement first

**run** `git worktree add` against a scratch repository, then `rev-parse` from the lane and from a
subdirectory of it:

```
toplevel:    /private/tmp/d04probe/lane
common-dir:  /private/tmp/d04probe/repo/.git
sub toplevel:/private/tmp/d04probe/lane
```

That is the whole mechanism. `--show-toplevel` inside a linked worktree answers the **lane**, from
the lane and from below it alike, so any door that asks only that question treats a lane as a
repository of its own — and `--git-common-dir` is the answer, which this repository already builds
and parses (**read** `src/main/git-args.ts:186-200`, M86, whose own comment names this exact
situation) and already ships on `git:status` as a separate `repository` field
(**read** `src/main/review-engine.ts:347-356`).

## 2. The five discrepancies, as they were

1. **read** `src/main/index.ts:723-727` at the parent commit — `memoryRoot` was
   `resolveRepo(path)` and nothing else, while `placesGate` (**read** `:646`) and
   `repoRootForBrief` (**read** `:1466, :1738`) both translated a lane. One door of four did not
   ask the question.
2. **read** the same three lines — `worktreeRootOf` was `w.path === path`, **exact equality**, so
   a cwd one directory inside a lane translated nowhere; **read** `Canvas.tsx:5966`, which
   answered the identical question with a segment prefix. Two authors of one fact.
3. **read** `src/main/index.ts:726` — `answer.kind === 'root' ? answer.root : path` collapses
   `unreadable` into `not-a-repo`, spending the three arms `resolveRepo` was built with
   (**read** `review-engine.ts:118-138`, which says so in full).
4. An externally created worktree has no record, so nothing translated it at all.
5. **read** `MemoryNode.tsx:52` — the node labelled itself from `panel.source.root`, the
   *unresolved* directory, while main read under the resolved one.

## 3. The defect as the checks printed it

Every check below was written first and **watched failing against the exact regression it claims**,
with the production behaviour restored between each.

> **run** `node scripts/verify-file.cjs` with `memoryScope` reverted to the shipped `memoryRoot` —
> `memory.4` **FAIL**:
> `"files":["tmp-scratch-e549f2e8.jsonl","u-worktrees-api-ab12-tc-p1-39d51d2c.jsonl","w-api-6e379464.jsonl"]`
> and `"refused":{"ok":true}`

That filename is the audit's investigation, answered. A dispatched teammate's memories were landing
in a **second** JSONL keyed by the lane — beside the repository's, read by no door of it, and
orphaned the moment `worktree:remove` deleted the lane. `"refused":{"ok":true}` is the other half:
git *declining* reported as a successful write to a stray key.

> **run** `node scripts/verify-review.cjs` with the resolver reduced to the toplevel —
> `scope.resolve.1` **FAIL**:
> `"laneSub":{…,"repository":"/u/worktrees/api-ab12/tc-p1"}` and
> `"declined":{"kind":"no-repository","cwd":"/w/api"}`

A lane wearing a repository's name, and git's refusal wearing "this is not a repository".

> **run** `node scripts/verify-review.cjs` with the `--git-common-dir` arm removed —
> `scope.resolve.1` **FAIL**: `"external":{…,"repository":"/w/api-hotfix"}`

The externally created worktree collapsing back into its own repository. Both sources are
load-bearing and neither alone is enough: the record is the only thing that knows the **branch**,
git is the only thing that knows about a worktree the app never made.

> **run** `node scripts/verify-teammates.cjs` with `worktreeRootOf` back to exact equality —
> `dispatch.2` **FAIL**: `"below":{"ok":false,"reason":"/app/worktrees/lane/src/api is outside
> every place of ada — add /app/worktrees/lane/src/api to this teammate's places"}`

A refusal sending the user to add an app-internal directory to a teammate's places — the sentence
`dispatch.1`'s own comment says must never be produced, reached from one directory deeper.

> **run** the same suite with `insideDirectory` reduced to a bare `startsWith` —
> `dispatch.2` **FAIL**: `"decoy":{"ok":true}`

**This is the widening fence and it is why the check exists.** Under a prefix test, a directory the
app has **no record for** translates to the lane's repository, that repository *is* in the
teammate's places, and the Places gate answers **allowed** — a permission granted by a string
coincidence. The first draft of this arm carried a second record and the longest-match rule rescued
the wrong containment rule, so the fence never fired; a check that cannot go red for the reason it
names is a claim of coverage, not coverage. Removing the record made it discriminate.

> **run** `node scripts/verify-rail.cjs` with the two fields removed — `scope.fields.1` **FAIL**:
> `"inLane":["chat-cwd","chat-session","chat-model","chat-cost"]`, and with `startsWith`
> containment: `"decoy":["chat-cwd","chat-repository","chat-lane",…]`

## 4. What shipped

**A pure module, `src/shared/work-scope.ts`.** `WorkScope` (three arms), `LaneIdentity`,
`normaliseScopePath`, `insideDirectory`, `laneOfPath`. It imports nothing:
`@shared/places.ts` has `normalisePath` and reaches it through `node:path`, which the renderer
cannot bundle — the constraint that forced M195 to hand-write its normaliser, met again. The fix
for that duplication is **delegation**, not a third copy: `shared/preview.ts`'s
`normalisePreviewPath` and `pathInsidePreview` keep their names and now call this module, so
M195's checks are untouched and the reload rule and the scope rule cannot drift apart.

`laneOfPath` takes the **longest** matching record. Records nest in principle, and a
shortest-match win names a grandparent repository for work happening in a child — the same class
of plausible-but-wrong answer the segment rule closes.

**One resolver in main, `src/main/work-scope.ts`.** `createScopeResolver` over injected
`resolveRepo`, `commonRootOf` and `worktrees`, so `verify:review` drives every arm under plain
node against the fake `GitRunner` that suite already had. The record is asked **first** (it is
authoritative for the app's own lanes and the only source of a branch) and git **second**.
`commonRootOf` was promoted from a closure to an exported member of the review engine rather than
reimplemented. A record whose root **is** the toplevel is not treated as a lane — that would be a
stale record putting a lane line on an ordinary panel.

**`memoryScope` replaces `memoryRoot`,** and it lives in `main/work-scope.ts` rather than inline in
`index.ts` **because no suite bundles `index.ts`** — the extraction is what makes the door
checkable at all. A lane resolves to its repository; a directory git does not own keeps its own
path (M83's rule, unchanged); `unavailable` is **refused by name** and writes nothing.

**`laneRootOf` on the segment rule** at all three of main's wiring sites. Not a widening: the
subject is the lane record's own `root`, which `insidePlace` then judges exactly as it judges the
lane root today.

**The statements.** The memory node labels itself from the root the READ came back with and says
when a lane got it there; the composer's disclosure names the repository (`repo.root`, so the note
and the wire cannot disagree); the inspector's chat arm gains `chat-repository` and `chat-lane`,
both absent when there is no lane; and the skills door's refusal becomes a statement — main
translates the lane before deriving the project skill root, so a project skill written from a
dispatched conversation lands in the repository the person meant.

## 5. The memory decision, and the migration that deliberately is not one

D04 step 3 asks which memories are repository-wide, teammate-specific or task-specific, and step 5
asks for a migration's compatibility story before one is written.

**Repository memory is repository-wide.** A lane is a place work happens, not a subject that
remembers. Teammate memory already had its own store behind the `teammate:` prefix and is
untouched; D04 invents no third, task-scoped store.

**There is no migration, and that is the decision rather than an omission.** Changing the resolved
root changes the slug, so a JSONL written from a lane before M196 is no longer read. It is **not**
merged into the repository's, for two reasons: the guide's own rule is that previously separate
histories are not silently merged, and those entries were already unreachable from every
repository door and already orphaned by design the moment `worktree:remove` deleted the lane.
Nothing is rewritten and nothing is deleted; the provenance is on screen instead — the node names
the repository it actually read and says when a lane got it there.

## 5b. The gates

**run** `npm run verify` exit 0, 38 suite tallies, no FAIL line, on a tree that did not move under
it — the first attempt was invalidated by source edits made while it ran, and is recorded rather
than quietly replaced. **run** `npm run verify:visual` exit 0, 59/59, **no golden rewritten**: the
new statements live in the inspector's fields, the memory node's body and the composer's note
stack, none of which the harness's scenes frame. **run** `npm run verify:packaged` exit 0, 12/12.

Two gate failures on the way, both real signals rather than noise. `verify:meta milestones.1` —
the build log, the ledger row and the guide checkbox were all written and `README.md`'s milestone
table still had no M196 row; it is the FIRST check in the chain, so a missing row costs a full
re-run. And `verify:panels:core` 26 with `sessions=[]`, the documented leftover
`tmux -L terminal-canvas-verify-panels` server; 78/78 after clearing it, and confirmed by re-running
rather than assumed from the diff not touching PTY code.

## 6. The critic round, and what it found that three green suites did not

A fresh-context critic read the spec, the log and the diff and produced six substantiated
defects. Five were real and are fixed here; all five were invisible to the checks as first
written, which is the point of the exercise.

**The serious one: the Places gate had been widened, and the fence check could not see it.**
`PlacesGate.check` **replaces** the candidate with `worktreeRootOf`'s answer and never judges the
candidate again (**read** `src/main/places.ts:42-44`), so whatever the lane match consumes is what
the gate stops looking at. Exact equality was accidentally safe — only a lane root could take the
substitution, and a lane root has no symlink component by construction. Containment made the whole
subtree eligible, so a symlink an agent creates INSIDE its own lane (`ln -s /etc evil`) was
translated to the repository, found inside a place and **allowed** — re-opening the escape
`shared/places.ts`'s header and `verify:teammates places.2` exist to fence. `laneRootOf` now
matches on the REAL path, against records whose own paths are real too, and fails CLOSED for a
path that cannot be resolved. `dispatch.2` gained the arm, watched red: `"escape":{"ok":true}`.

The log's earlier "not a widening" argument was sound for the string-prefix case and **wrong** for
the realpath case, and the fence check could not observe it because its fake `realpath` returned
every lane path unchanged. **Widening what a substitution matches also widens what the check after
it never sees.**

**The skill door: one line closed three doors it was not about.** Wrapping `resolveCwd` also moved
`skillRoots`, the containment list EVERY verb is judged against, so `write`, `rename` and `remove`
were refused for a project skill opened from a lane — with a sentence claiming it was outside every
writable skills folder while it sat in the repository's own checkout, which a lane is. A door that
worked before the milestone, closed by it, mentioned in no spec, log or check. The translation is
now a `projectRootOf` dep that renames the CREATE target only, `skillRoots` keeps both project
roots, and `verify:toolbox skill.lane.1` asserts both halves — watched red against the first cut:
`"wrote":"refused","renamed":"refused","removed":"refused"`.

The same line also reached `resolveCwd`'s **home fallback**: a lane whose repository had been moved
or deleted (records outlive their panels by design) would have written a *project* skill into
`~/.claude/skills`, indistinguishable from a user one, silently. `projectRootOf` answers `undefined`
for a root that is not on disk.

**A nested repository inside a lane took the lane's parent.** The record was matched against the
cwd without checking that git's toplevel IS the lane, so a submodule or a dependency cloned into a
lane resolved to the lane's repository — while the identical nested repository under the main
worktree correctly got its own. Answering one question two ways depending on the lane is the
discrepancy this milestone exists to remove. `scope.resolve.1` gained the arm.

**`memory.4` could THROW on the regression it names.** `store.list(readAtRepo.root, …)` ran before
`readAtRepo.ok` was asserted, and `slugOf` throws on `undefined` — so a regression making scope
unresolved, which is *half* of what the check fences, would have aborted `verify:file` and skipped
every check below it, including `scope.1`. Guarded; the forced-unresolved regression now prints
`94/95` instead of a stack.

**The composer collapsed the third state.** `memory:list` gained `unresolved` and `MemoryNode`
renders it, but `ChatNode` read only `.entries` — so when git declined, the disclosure showed
**nothing**, which says "there is nothing to disclose". The one surface where a person could notice
was the one that stayed quiet. It now says so and carries no memories.

**One documentation defect:** §4 listed `scopeLine` among the module's exports; the spec records it
as struck during implementation. The two documents contradicted each other in the same commit, and
a stale comment in `scope.1` still described it. Both corrected — under the evidence rule that was
a **read** claim that was false.

## 7. Bounds the critic named that are recorded rather than fixed

- **`tc memory list` exits 0 for an unresolved read.** The field is in the printed JSON so an agent
  can see it, but `$?` cannot tell "unresolved" from "empty" — the distinction the CLI's own
  exit-code design exists for. Changing exit-code semantics is wider than D04 and is not smuggled
  in here.
- **The inspector's lane rows are RECORD-only,** so an externally created worktree shows no lane
  there even though the resolver would name it. Making them asynchronous for a display fact is the
  trade this milestone declined; it is written in the parameter's own comment.
- **Case-insensitive volumes.** `insideDirectory` is byte-exact, so a differently-cased path misses
  a record. Memory is rescued by the git arm; the Places gate fails CLOSED; only the inspector's
  lane identity is silently lost. Same behaviour as the exact equality it replaces, so not a
  regression — but it was unrecorded, and now is not.
- **One extra `git` fork per memory call** (`--git-common-dir` beside `--show-toplevel`). Below the
  noise floor, and new.
