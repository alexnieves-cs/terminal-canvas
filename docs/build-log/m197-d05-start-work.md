# M197 — D05, one Start work action and every door a route into it

The guide's [D05](../product-development-guide-2026-09-08.md#d05--start-work-from-an-issue-or-intention),
first half. The spec is [2026-09-09-m197-start-work.md](../superpowers/specs/2026-09-09-m197-start-work.md)
and the plan is [its plan](../superpowers/plans/2026-09-09-m197-start-work.md). D05 is M197–M198:
this milestone is the FLOW (the guide's steps 1–4 and the reachable half of 6); **M198 is
idempotency and partial-failure recovery** (step 5), measured in §6 below and deliberately not
spent here.

Written under the ledger's evidence rule: every line is **read** (source at a line), **observed**
(a golden looked at), **run** (a command with its exit code and tally) or **inferred** (a
judgement, which is not evidence).

---

## 1. The measurement first: a dead argument, and two sources that could not start

**read** `src/renderer/canvas/Canvas.tsx:4281` at the parent commit —
`dispatchWorkItem(itemId, teammateId, root?)` takes a chosen repository root. **read** its four
callers: `TeammatesPane.tsx:82` → `Canvas.tsx:6570`, `Canvas.tsx:6068`, `WorkNode.tsx:161`, and
the agent's arm at `usePaletteActions.ts:470`. **Every one passes two arguments.** The third
parameter had no caller anywhere in the app.

**read** `src/main/board-lane.ts:52-55` — with neither `repo` nor `root` the lane refuses:

> this item names no repository — choose which place `<name>` should work it in

**A refusal naming a choice no surface offered.** And **read** `shared/work-items.ts:repoOfKey`,
which answers `null` for anything that is not `owner/repo#N`. Composed, those three facts mean:

| source | key | `repoOfKey` | could it start? |
|---|---|---|---|
| GitHub | `acme/canvas#7` | `acme/canvas` | only if a teammate's place holds a clone |
| Jira | `PROJ-12` | `null` | **no** |
| typed | *(none)* | — | **no** |

M113's own typed door (`New work item…`) minted a card that could never become work, and nothing
said so until a teammate was chosen and the refusal landed in the record's `note`.

**read** `usePaletteActions.ts:465-471` at the parent commit — the agent's `dispatch` arm called
the **void-returning** verb and returned `{ kind: 'ran' }` in the same expression. Everything that
can refuse — the Places gate, the missing clone, git, `agent:create`, M82's budget on the first
send — refuses *after* that return. **A verb that cannot fail in the caller's view is a verb that
fails silently.**

**read** `Canvas.tsx:4315` at the parent commit — `await …agentSession.send(…)`'s answer was
discarded. **read** `shared/agent-session.ts:155` — `SendResult` includes `refused-budget`, and
M82's own comment beside it says the message is **not stored**. So a dispatch over budget left a
chat panel, a worktree and a card reading `todo`, with no message anywhere and nothing on screen
saying why; the card's state machine then never reached `working`, because `working` is the
runtime's word from a turn that never started.

## 2. What the flow is

**One action, `beginStartWork`, and every door is a route into it.** A start is a TRIPLE — a
**task**, an **agent** (a teammate: the identity; its chat is the conversation and its session the
execution, D01's distinction unchanged) and a **repository**.

`src/renderer/palette/start-work.ts` (new, pure) answers which of the three the app cannot derive.
Two rules in it are load-bearing:

- **The order is a dependency, not a preference** — `task`, then `agent`, then `repository`. The
  repositories on offer are the ones under the CHOSEN teammate's places, so there is nothing to
  list until the agent is known. Asking for a repository first would offer a list belonging to
  nobody, and the Places gate would overrule the answer one question later.
- **An empty needs list is the dispatch-without-a-sheet signal.** M114's gesture — drag a GitHub
  card onto a teammate whose place holds its clone — still starts work in one drop. A flow that
  always opened a sheet would make the fast path slower to pay for the case it does not apply to.

`resolveRepository` has THREE arms: `auto`, `ambiguous` (two clones of one `owner/repo` under the
places) and `none` — three different fixes, *derive it*, *ask which*, *ask for any* — and an item
that names no repository at all is `none`, never `ambiguous`.

## 3. Where the repository comes from

**read** `src/main/board-repo.ts` — `findRepoUnderPlaces` already walks a place and its immediate
children (and no deeper: a place is typically `~/work` holding many clones, and a walk past one
level turns a dispatch into a filesystem crawl). `repositoriesUnderPlaces` is the SAME walk asked
for all of them rather than the first match, so the field can never offer a root the lane could not
reach.

`isRepoRoot` is a **second injected reader** rather than a widening of `originOf`, because
`originOf` answers `null` for two different facts — "not a repository" and "a repository with no
origin". The lister must tell them apart or a local-only checkout vanishes from the choice with
nothing on screen to say why; `findRepoUnderPlaces` never had to, and its contract is unchanged
byte for byte.

`repositoriesAnswer` (the door's arm decision) lives in `board-repo.ts` and **not inline in
`index.ts`, because no suite bundles `index.ts`** — M196's own lesson, reached again. Three arms:
an unknown teammate refused by name; `no-places`, whose fix is a folder; and `repos`, whose EMPTY
case means the places hold no repository, whose fix is a clone. Collapsing the last two tells the
user the wrong fix.

**One new channel**, `board:repositories`, read-only and privileged (only main may run
`git remote get-url`). **read** both IPC diagrams, edited together — `CLAUDE.md`'s copy and
`README.md`'s pinned one — and `verify:ipc`'s `EXPECTED_CHANNELS` re-derived to 134.

## 4. What the checks caught that no reading would have

- **run** `verify:panels:product start.door.2`, red on the first implementation: `no work item is
  called wi…`. **read** `Canvas.tsx:324-325` — `workItemsRef.current = workItems` is a
  **render-time** assignment, so the start flow's own submit (mint the typed task, then start it,
  in one tick) read a list the new item was not in yet. The mirror is now made current at the mint
  (`usePaletteActions.ts`), with the reason written beside it. **This is the defect that made the
  typed door reachable in principle and broken in practice**, and only the end-to-end check saw it.
- **run** `verify:verbs closure.1`, red: `unaccounted: ["beginStartWork","startWork"]`. The closure
  rule reads the `PaletteActions` interface as TEXT and fails for a member on neither the verb
  table nor the excluded list, so a new action must be CHOSEN. `beginStartWork` is excluded (a plan
  has no typist — `beginNewWorkItem`'s precedent); `startWork` is MAPPED onto the existing
  `dispatch` verb. One action, two doors, only the human's a form.
- **run** `verify:rail state.2`, red: `StartWorkSheet.tsx:'starting…'`. The state vocabulary belongs
  to `panel-state.ts`, and the drift that rule ended "arrived one word at a time, each file locally
  consistent". What the line is actually reporting is the lane, so it now says so.
- **observed** the first `start-work` capture: the `REPOSITORY` label CLIPPED to `REPOSITOR` at the
  spawn sheet's shared 5em column, and the palette's own footer printing `↵ start · esc cancel`
  directly beneath the sheet's `↵ start · esc close` — **two answers to one question, differing in
  the last word**. Both were invisible to every assertion over this surface, because all three read
  values and neither a clipped word nor a doubled line is a value. Fixed with a scoped
  `[data-start-sheet] .sheet__label { width: 7.5em }` and by extending `Palette.tsx`'s
  "a sheet owns its own foot" condition to the new kind.
- **observed** the first `palette-dark` capture after the new scene landed: **no palette in it**.
  The shot kit's `closePalette` presses Escape on `.palette__input`, and a sheet mode has no input
  at all — so the overlay was left standing and the next scene's Cmd+K toggled it shut. The scene
  now escapes on `[data-start-sheet]`, as the spawn-sheet scenes already do, and `palette-dark`
  is back at its original golden byte for byte (`git checkout` on it, then **run** `verify:visual`
  → `palette-dark — 0.012% differ`, PASS).

## 5. Evidence

- **run** `npm run verify` → **exit 0**, no `FAIL` lines.
- **run** `npm run verify:visual` → **60/60 passed**. **One golden added** (`start-work`); no
  existing golden changed, so no critic's sentence is owed under the golden-sentence rule.
- **observed** `out/shots/start-work.png` before the golden was written, twice — once to find the
  two defects above and once to confirm them fixed.
- New checks, each **watched failing** against the module it names before that module existed:
  `verify:palette start.1a–.1e`, `verify:file lane.repos.1` and `lane.repos.2`,
  `verify:panels:product start.door.1`, `start.door.2`, `start.answer.1`.

`start.answer.1` deserves a note on its own shape. Its first cut drove the agent door with
`dispatch <id> nobody-at-all`, which `buildPlan` refuses at BINDING — a refusal that predates this
milestone and would have passed against the old code. It now drives `dispatch <id> nell`, a
teammate the roster holds and who has no places, so the refusal happens inside the **awaited**
executor. That is the ground the verb used to answer `ran` over.

## 6. What M198 owes, measured here

- **read** `Canvas.tsx:4285` — the chat id is minted fresh (`c${nextIdRef.current++}`) on every
  attempt, and **read** `src/main/worktree-manager.ts:72-86` — `ensureForPanel` reuses a record
  **by panel id and root**. So a retry after any failure past the lane step creates a SECOND
  worktree and a SECOND branch. The item's `worktreeId` is written only after `agent:create`
  succeeds, so the first lane is orphaned with nothing naming it. That is D05's "without creating
  unexplained duplicates", and it is M198's.
- There is no in-flight guard on the start: two fast clicks are two starts.
- **read** `src/renderer/chat/ChatNode.tsx:435` — the composer reads only `SendAnswer`'s OBJECT
  arm, so M82's `refused-budget` (a STRING) shows nothing in the composer either. `sendRefusalSentence`
  (added in `shared/agent-session.ts` for the dispatch's first send) is the fix, and the right owner
  is **D06 — "make agent and run supervision honest"**, not a silent widening here.
