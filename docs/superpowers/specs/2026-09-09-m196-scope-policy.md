# M196 — D04, one policy for repository, worktree lane and memory scope

The guide's [D04](../../product-development-guide-2026-09-08.md#d04--resolve-repository-worktree-and-memory-scope-consistently).
D02 named one thing D04 inherits by name (`skillsCwd`'s lane refusal), and the audit left one
investigation open (`memoryRoot` against the worktree translation every other door applies).

## 1. The problem, as five measured discrepancies

There are five notions of "root" in this app and they are deliberately not one thing:

| | Notion | Resolver today | Where it lives |
|---|---|---|---|
| A | the git repository of a directory | `reviewEngine.resolveRepo` (`rev-parse --show-toplevel`) | per call |
| B | the memory subject | `main/index.ts`'s `memoryRoot` | derived from A |
| C | an app lane's parent repository | `worktreeRootOf` (a RECORD lookup, not git) | `layout.json` |
| D | a places subject | `insidePlace` over realpaths | teammate `places[]` |
| E | the main tree of any worktree | `commonRootOf` (`--git-common-dir`) | per call |

The defect is not that there are five. It is that **three of them answer the lane question
differently, and one does not ask it at all**.

1. **`memoryRoot` does not translate a lane.** `rev-parse --show-toplevel` inside a linked
   worktree answers the LANE (measured: from the lane and from a subdirectory of it). So a
   dispatched teammate's `tc memory add`, its first-send memory context and a memory node opened
   on its folder all key a JSONL by the lane path — a file the repository's own doors never read,
   under a directory the app deletes with `worktree:remove`. Every door still shows a plausible,
   non-empty list, which is exactly the failure M83's own load-bearing entry says the single
   resolver exists to prevent — reached one level up, through a lane it did not consider.
   `placesGate` (`index.ts:646`) and `repoRootForBrief` (`index.ts:1466, 1738`) both translate.
   `memoryRoot` (`index.ts:723-727`) is the one door that does not.
2. **`worktreeRootOf` is exact-path equality** (`w.path === path`) at all three wiring sites,
   so a cwd *inside* a lane translates nowhere and is judged as its own repository. The renderer
   answers the same question with segment-prefix matching (`Canvas.tsx:5966`). Two authors of one
   fact, disagreeing only below a lane root.
3. **`memoryRoot` collapses `unreadable` into "use the path".** `resolveRepo` has three arms
   precisely so git-declined stays distinguishable from not-a-repository; this door spends that
   distinction and writes to a stray slug on a transient git failure, silently.
4. **An externally created worktree is invisible.** It has no record, so `worktreeRootOf` answers
   nothing and every consumer treats it as its own repository — while git can say otherwise
   through `--git-common-dir`, which this repo already builds and parses (M86,
   `buildCommonDirArgs`/`parseCommonRoot`) and already ships on `git:status` as `repository`.
5. **Nothing on screen states the scope.** `MemoryNode` labels itself from the panel's
   *unresolved* directory while main writes under the resolved one; the composer's disclosure
   says "from this repository" without naming which; the inspector's chat arm has a `directory`
   field and no repository or lane field at all.

## 2. The policy

Three facts, never merged, and each with a name a surface can say:

- **The working directory** — where a process actually runs. `inspectionDirectory` (M194) already
  answers this and is unchanged. A lane's files ARE the lane's files; Files is right today.
- **The lane** — a linked worktree the work happens in. It has an identity (its path, and its
  branch when the app minted it) and it is NOT a repository.
- **The repository** — the canonical identity every lane of it shares: the main worktree's root.

Rules, each of which a check binds:

- A lane is resolved through the app's own record FIRST (it is authoritative for the lanes the app
  made, and it is the only source of the branch), and through git's `--git-common-dir` SECOND,
  which is what makes an externally created worktree resolve at all.
- Containment is on **segment boundaries**, in ONE hand-written helper. `/w/api` does not hold
  `/w/apiary`.
- Three states, never two: `repository` (known), `no-repository` (git says this directory is not
  in one — the ordinary, quiet case), and `unavailable` (git declined, or could not be run). The
  third never silently wears the first two's costume.
- **Repository memory is repository-wide.** A lane is a place work happens, not a subject that
  remembers. Teammate memory stays separate (`teammate:` already routes to its own store); there
  is no task-scoped memory and D04 does not invent one.
- **Resolution is inspection, and inspection is not permission.** The scope resolver reaches no
  credential, spawns nothing and grants nothing. Main keeps every authority it has.

## 3. What changes

**A pure module, `src/shared/work-scope.ts`.** `WorkScope` (the three arms above), `LaneIdentity`,
`normaliseScopePath`, `insideDirectory` (the segment rule) and `laneOfPath`.

**Struck during implementation.** The spec's `scopeLine`/`scopeRepository` — "the one sentence every
surface says a scope with" — were written, checked and then removed: the three surfaces that state
scope each needed different words in different places (a node's label, a composer's disclosure, two
inspector fields), so the shared sentence had no production caller. An exported helper with no
caller is a claim of a shared vocabulary that does not exist, which is this repository's own
"a row that disappears is indistinguishable from a feature that was never built" read from the
other side. If a fourth surface wants one, it is three lines.
`shared/preview.ts` DELEGATES its `normalisePreviewPath`/`pathInsidePreview` to it rather than
keeping a second copy — the exported names stay, so M195's checks are untouched.

**One resolver in main, `src/main/work-scope.ts`.** `createScopeResolver({ resolveRepo,
commonRootOf, worktrees })` answers a `WorkScope` for any directory, over injected deps so
`verify:review` drives every arm under plain node against a fake `GitRunner`. `commonRootOf` is
promoted from a closure to an exported member of the review engine — it is already the right
function and was reachable from one place.

**`memoryRoot` asks the resolver.** A lane resolves to its repository; `no-repository` keeps the
directory as its own subject (unchanged, and it is the answer for most panels); `unavailable` is
now **refused by name** rather than written to a stray slug.

**`worktreeRootOf` uses the segment rule** at its three wiring sites, so a cwd below a lane
translates the way the lane root already does. This is a deliberate behaviour change at the Places
gate and it is not a widening: the subject it translates to is the lane record's own `root`, which
`insidePlace` then judges exactly as it judges the lane root today. A teammate with no place
holding that repository is refused before and after.

**The four statements.** `MemoryNode` labels itself from the root the READ came back with, and
says when it reached the repository through a lane. The composer's first-send note names the
repository. The inspector's chat arm gains `repository` and, when there is one, `lane`. The
skills door's project refusal (D02's inherited item) is replaced by the translation, so a project
skill written from a dispatched chat lands in the repository the person meant.

## 4. Data, IPC and migration

No new store, no project database. `memory.list`'s answer gains an optional `scope` — derivation,
carried on a reply that already exists — and no channel is added, so both IPC diagrams stand.

**Memory migration: none, deliberately.** Changing the resolved root changes the slug, so a JSONL
written from a lane before M196 is no longer read. It is not merged into the repository's, because
the guide's own rule is that previously separate histories are not silently merged, and because
those entries were ALREADY unreachable from every repository door and already orphaned by design
the moment `worktree:remove` deleted the lane. The compatibility statement is therefore: nothing
is rewritten, nothing is deleted, and the provenance is on screen — the node names the repository
it is actually reading and says when a lane got it there.

## 5. Risks

- The Places gate changes shape. Mitigated by keeping the SUBJECT the record's own root and by a
  check that a teammate without the repository in their places is still refused below a lane.
- `commonRootOf` becomes load-bearing for scope, not only for `reviewAcross`. `parseCommonRoot`
  answers `null` for anything not ending in `/.git`, which correctly declines a submodule
  (`.git/modules/x`) instead of inventing a parent; the resolver falls back to the toplevel there.
- Statements touch rendered surfaces, so goldens may move. Each gets the critic's sentence first.

## 6. Acceptance

Files, preview, review, skills and memory agree about scope. A lane is never confused with its
parent repository, no grant is widened, and a person can see which repository an agent's memories
came from and which lane the work is in.
