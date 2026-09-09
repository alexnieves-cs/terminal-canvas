# Terminal Canvas v10 — ledger, M193 onward

The run that executes [the ordered product development guide](../product-development-guide-2026-09-08.md)
(`D01`–`D20`) over the audit at [docs/product-audit-2026-09-08.md](../product-audit-2026-09-08.md).
The v9 run's ledger is [m180-m200-ledger.md](m180-m200-ledger.md); it closed at M192 = 5.0.0 and
nothing here reuses a number it assigned.

**The rule this ledger is written under.** Every line below is marked with how it was learned:
**read** (source at HEAD, with a file and line), **observed** (a committed golden PNG at HEAD,
looked at), **run** (a command, with its exit code and tally), or **inferred** (a judgement, which
is not evidence). The guide's D01 asks for exactly this separation, and the audit it follows was
explicit that it "did not run the application interactively or verification suites". This
milestone did run them; it still did not drive the app by hand, and says so where that matters.

---

## The phases, and where each one stands

| Guide ID | Milestone(s) | Status | Record |
|---|---|---|---|
| D01 | M193 | ✅ done | [m193-d01-reconcile.md](m193-d01-reconcile.md) |
| D02 | M194 | ✅ done | [m194-d02-selected-chat-context.md](m194-d02-selected-chat-context.md) |
| D03 | M195 | ✅ done | [m195-d03-preview-ownership.md](m195-d03-preview-ownership.md) |
| D04 | M196 | ✅ done | [m196-d04-scope-policy.md](m196-d04-scope-policy.md) |
| D05 | M197–M198 | ✅ done | [M197](m197-d05-start-work.md), [M198](m198-d05-start-recovery.md) |
| D06 | M199–M200 | ✅ done | [m199-m200-d06-supervision.md](m199-m200-d06-supervision.md) |
| D07–D20 | M201–M224 | not started | — |

The full map, its splits and its reservations are below. A phase's evidence, critic disposition and
owed hand checks go in that phase's own build log, and its row here is updated when it lands.

## The phase → milestone map (D01 §5)

M193 is this milestone. D02–D20 are assigned the numbers below. Larger phases are split where the
guide asks for it, at the seam where the first half is independently useful and shippable. **These
numbers are reserved, not promised**: a phase whose evidence argues against its design records the
replacement here rather than silently dropping the capability, and a split that turns out wrong is
re-recorded before the work starts, never after.

| Guide ID | Milestone(s) | Split at | Status |
|---|---|---|---|
| D01 | **M193** | — | ✅ done |
| D02 | **M194** | — | ✅ done |
| D03 | **M195** | — | ✅ done |
| D04 | **M196** | — | ✅ done |
| D05 | **M197–M198** | **re-recorded at M197** — M197 the FLOW (the one entry door, the three inputs, and the executor made to answer); M198 idempotency and partial-failure recovery. *Was:* M197 the one entry door and the task record; M198 the assembly and its recovery. The seam moved because the assembly (`board:lane` → `agent:create` → the first send) is M114's and needed no rebuilding: what was missing was the *asking*, and what was broken was the *answering*. The task record needed no change at all — `work-items.ts` is untouched. **This was re-recorded during the milestone, not before it**, which is a departure from this table's own rule; it is written down rather than tidied away | ✅ done |
| D06 | **M199–M200** | M199 the run's own truth (a pending question as a run entry; a turn is not a task); M200 the supervision surface that reads it | ✅ done |
| D07 | **M201–M202** | M201 the review handoff record; M202 local review readiness and the PR/refusal path | not started |
| D08 | **M203–M204** | M203 `Show this task`; M204 `Show related` and the far view's work groups | not started |
| D09 | **M205** | — | not started |
| D10 | **M206–M208** | M206 shell, rail and the category labels; M207 the inspector and contextual controls; M208 the graph, the far view and the rest-layer sweep | not started |
| D11 | **M209–M210** | M209 outcomes that outlive canvas membership (§3.4); M210 Resume | not started |
| D12 | **M211–M212** | M211 artifact provenance; M212 decision capture | not started |
| D13 | **M213–M214** | M213 the reader-failure fix and honest coverage (§3.5); M214 the broader scopes | not started |
| D14 | **M215–M216** | M215 save an arrangement; M216 save a workflow from it | not started |
| D15 | **M217–M218** | M217 nodes; M218 integration depth | not started |
| D16 | **M219** | — | not started |
| D17 | **M220** | — | not started |
| D18 | **M221** | — | not started |
| D19 | **M222** | — | not started |
| D20 | **M223–M224** | M223 ownership and presence; M224 conflict handling | not started |

**One ordering amendment, made explicitly.** The guide notes that D13's reader-failure fix "can be
fixed in a small independent milestone earlier if it blocks an active journey". §3.5 shows it
depends on nothing in D11 or D12: it is a three-state result over a module whose readers are
already injected and already driven under plain node by `verify:file psearch.1`. **M213 is
therefore landable at any point after M193**, and only M214 (searching decisions and artifacts)
waits for D11–D12. It is not being pulled forward here, because no journey is currently blocked on
it; the permission to do so is recorded so a later session does not have to re-derive it.

**No version is claimed by this map.** The guide's post-D10 checkpoint is a product checkpoint.
5.0.0 is spent (§2), and the packaging, signing and distribution obligations recorded in the v9
ledger still stand unmet.


## The contract D01 adopted

Summarised in `CLAUDE.md` (`## The v10 product contract`) so it is resident in a session that has
not read this file; the reasoning is in
[m193-d01-reconcile.md](m193-d01-reconcile.md) §7.

- **The core job:** move a meaningful task from intention to reviewed result while the person keeps
  control and understanding. Project, workspace and task do not merge. A teammate is an identity, a
  chat is its conversation, a session is its execution.
- **Four density layers** decide where a fact goes: rest (name, kind, one state), contextual (next
  action, related work, blocker), inspector (configuration, provenance, outcomes), deep detail
  (logs, diagnostics, metrics, history).
- **A `note` is a Markdown file and nothing else is.** M187's sixteenth kind's three forms are a
  **sticky**, a **text** and a **frame** — canvas objects, never notes. Nothing is renamed in code.

## What this ledger inherits and does not restate

The v9 run's owed hand checks (`m180-m200-ledger.md` §"what a person still owes"), the manual-only
verifications at the end of `docs/load-bearing.md`, and the packaging, signing and distribution
obligations recorded at 5.0.0. None of them is closed by anything in this run so far.


---

## D02 = M194 — selected chat context in Files and Tools

**✅ done.** The full record is
[m194-d02-selected-chat-context.md](m194-d02-selected-chat-context.md); this is the row.

**run** `npm run verify` exit 0, 38 suite tallies, no FAIL line ·
**run** `npm run verify:visual` exit 0, 59/59 · **run** `npm run verify:packaged` exit 0, 12/12.
Sixteen checks, all scoped ids (`verify:rail` 194 → 201, `verify:panels:product` 77 → 86), each
watched RED against the exact regression it claims to catch. The twelve the interrupted session had
left written but unwitnessed were re-driven against a type-valid stub (195/197 and 75/85), chosen so
that nothing threw and every check below still ran; the four written later were driven red
afterwards, one reverted regression at a time.

**observed** `verify/visual/goldens/starter.png` — the one golden that changed, with its critic's
sentence recorded before the update. The Tools tab's *"A chat panel has no directory, so there is
no toolbox to read"* — the sentence D01 §3.1 said D02 must delete rather than soften — is replaced
by that conversation's real inventory. Nothing else in the frame moved.

**Three things a later milestone should know before it reads this as finished.**

- **`unavailable` is now a fourth arm of `ToolInventoryResult`, and it exists because a failed
  read had been wearing `no-cwd`'s costume at six sites.** `no-cwd` is a claim about the RECORD;
  a rejected read is a claim about the MOMENT. Anything that adds a reader to that union owes it
  the third rendering.
- **The red-first exercise found a defect the implementation had and the checks could not
  express.** `buildToolboxFields` reached its inventory branch by fall-through, so the check
  written for the missing-arm regression ABORTED the suite on a `TypeError` instead of going red
  — `docs/verify-suites.md`'s first rule, arriving as a design signal rather than a process one.
  Fixed with a positive test for `kind === 'inventory'`; `context.tools.2` pins it.
- **D04 inherits one thing by name.** `skillsCwd` answers for chats now, and a DISPATCHED chat's
  cwd is an M113 worktree lane, so a project skill written from one would land in
  `userData/worktrees/…` and go with the lane. It is REFUSED by name, naming the repository.
  Translating a lane to its repository for inspection and for writes is D04's subject
  (M131 already does it for the skills brief through main's `worktreeRootOf`), and the refusal is
  deliberately not in that design's way.

**Owed, and not closed by three green gates:** the render-gap masks, `showHidden` and the refresh
generation, main's two other validation arms, and terminal/review/toolbox Files/Tools compatibility
at the DOM level are each unchecked; they are listed with their reasons in §8 of the build log.
Every hand check the v9 run left owed is still owed.

---

## D06 = M199–M200 — honest run and task supervision

**✅ done.** The full record is
[m199-m200-d06-supervision.md](m199-m200-d06-supervision.md). M199 introduced the pure state table;
M200 projected the existing live stores onto workflow and task surfaces. No IPC or persisted schema
changed. Completed turns, successful exits and ended runs are neutral execution results; only the
work item's user-set state says `done`. The exact live approval is temporary and all answer controls
reuse main's standing authority.

**red** `verify:viewport run.supervision.1` with `projectRun does not exist` · **red** `verify:rail
run.1` on the former `idle`/`exited N` aggregate words · **green** `verify:viewport` 142/142 ·
**green** `verify:rail` 204/204 · **green** `verify:panels:product` 94/94 · **green** `npm run
verify` exit 0 with every suite tally · **green** `verify:visual` 60/60, no golden rewritten — the
critic expected no resting scene to move because the new detail is conditional · **green**
`verify:packaged` 12/12.

---

## D05 = M198 — repeated starts and partial failures recover in place

**✅ done.** The full record is [m198-d05-start-recovery.md](m198-d05-start-recovery.md).
`start.recovery.1–.3` were each watched red against duplicate lanes/chats or missing recovery
associations, then green through the real Electron and Git path. The retry still revalidates Places
authority in main; the existing D05 `start.answer.1` fences that boundary.

---

## D05 = M197 — one Start work action, and every door a route into it

**◐ M197 done; M198 (idempotency and partial-failure recovery) open.** The full record is
[m197-d05-start-work.md](m197-d05-start-work.md); this is the row.

**run** `npm run verify` exit 0, no FAIL line · **run** `npm run verify:visual` 60/60 with ONE
golden ADDED (`start-work`) and none rewritten — `palette-dark` was written once by mistake, the
capture was looked at, found to hold **no palette at all**, restored with `git checkout`, and now
passes at `0.012% differ` against its original. Six checks, all scoped ids, each watched failing
first: `verify:palette start.1a–.1e`, `verify:file lane.repos.1`/`.2`, `verify:panels:product`
`start.door.1`, `start.door.2`, `start.answer.1`. One channel added (`board:repositories`, 134),
both IPC diagrams edited together.

**The defect, in one line.** `dispatchWorkItem`'s third argument — the chosen repository root —
had **no caller in the app**: four call sites, all passing two. `board-lane.ts` therefore refused a
typed or Jira item with *"choose which place `<name>` should work it in"*, a sentence naming a door
that did not exist, and only a GitHub item whose clone already sat under a teammate's place could
start work at all. M113's own typed door minted cards that could never become work.

**What the flow does not do.** It does not always open a sheet: `startWorkNeeds` returning EMPTY
is the dispatch-without-a-sheet signal, so M114's drag-onto-a-teammate still starts in one gesture.
It does not widen a grant: a placeless teammate is disabled by name and the Teammates pane is a
NAMED ROUTE. It does not add a second executor: the sheet's submit runs the same
`board:lane` → `agent:create` → `send` M114 built, and `work-items.ts` is untouched.

**Three checks caught what reading did not.** `start.door.2` was red on the first implementation
with `no work item is called wi…` — `workItemsRef.current = workItems` is a **render-time**
assignment, so a flow that mints a task and starts it in one tick reads a list without it.
`closure.1` refused both new `PaletteActions` members until each was CHOSEN (one excluded as a
typist's door, one mapped onto the existing `dispatch` verb). `state.2` refused `'starting…'` in
the sheet's foot, because that word belongs to `panel-state.ts`.

**Two defects only the golden saw**, both invisible to every assertion over this surface because
all three read values: the `REPOSITORY` label CLIPPED to `REPOSITOR` at the spawn sheet's shared
5em column, and the palette's own footer printing `↵ start · esc cancel` directly beneath the
sheet's `↵ start · esc close` — two answers to one question, differing in the last word.

**What M198 owes, measured now rather than discovered later.** The chat id is minted fresh on every
attempt while `ensureForPanel` reuses **by panel id and root**, so a retry after any post-lane
failure creates a second worktree and a second branch, with the first orphaned because
`worktreeId` is written only after `agent:create` succeeds. There is no in-flight guard: two fast
clicks are two starts. Separately, **read** `ChatNode.tsx:435` — the composer reads only
`SendAnswer`'s object arm, so M82's `refused-budget` shows nothing there either;
`sendRefusalSentence` is the fix and **D06 is its owner**, not a silent widening here.

---

## D04 = M196 — one policy for repository, worktree lane and memory scope

**✅ done.** The full record is
[m196-d04-scope-policy.md](m196-d04-scope-policy.md); this is the row.

**run** `npm run verify` exit 0, 38 suite tallies, no FAIL line ·
**run** `npm run verify:visual` exit 0, 59/59 with NO golden rewritten — the milestone's new
statements are all in the inspector, the memory node's body and the composer's note stack, none of
which the shot harness's scenes frame · **run** `npm run verify:packaged` exit 0, 12/12.
Six checks, all scoped ids (`verify:file` 93 → 95, `verify:review` 98 → 99, `verify:teammates`
25 → 26, `verify:toolbox` 103 → 104, `verify:rail` 202 → 203), each watched RED against the exact
production behaviour it replaces, with that behaviour restored between each.

**The first green gate was invalid and is recorded as such**: source files were edited while it
ran, so the tree moved under it. A verification run only means something if it did not. The gate
also failed once on `verify:meta milestones.1` — the build log, the ledger row and the guide
checkbox were all written and `README.md`'s milestone table still had no M196 row, which is the
roadmap contract; and once on `verify:panels:core` 26 with `sessions=[]`, the documented leftover
`tmux -L terminal-canvas-verify-panels` server, 78/78 after clearing it.

**The mechanism, measured before anything was written.** `git worktree add` against a scratch
repository, then `rev-parse` from the lane and from a subdirectory of it: `--show-toplevel` answers
the **lane** both times, and `--git-common-dir` answers the parent's `.git`. Every door that asked
only the first question was treating a lane as a repository of its own — and each then returned a
plausible, non-empty answer, which is why none of this was visible.

**The defect as the checks printed it.** With `memoryScope` reverted to the shipped `memoryRoot`,
`memory.4` printed
`"files":["tmp-scratch-…","u-worktrees-api-ab12-tc-p1-39d51d2c.jsonl","w-api-6e379464.jsonl"]` —
the audit's open investigation answered as a filename: a dispatched teammate's memories in a second
JSONL keyed by the lane, beside the repository's, read by no door of it, orphaned the moment
`worktree:remove` deleted the lane. Beside it, `"refused":{"ok":true}` — git *declining* reported
as a successful write to a stray key. With the resolver reduced to the toplevel,
`scope.resolve.1` printed `"repository":"/u/worktrees/api-ab12/tc-p1"`, a lane wearing a
repository's name.

**A fresh-context critic found five real defects that three green suites did not, and every one
was second-order** — not the thing built, but something it moved. The full round is §6 of the build
log; the two that generalise:

- **The Places gate HAD been widened, and the fence check could not see it.** `PlacesGate.check`
  REPLACES the candidate with `worktreeRootOf`'s answer and never judges the candidate again, so
  whatever the lane match consumes is what the gate stops looking at. Exact equality was
  accidentally safe — a lane root has no symlink component by construction — and containment made
  the whole subtree eligible, so a symlink an agent creates inside its own lane (`ln -s /etc evil`)
  was translated to the repository, found inside a place, and ALLOWED. `laneRootOf` now matches on
  the real path and fails closed. **Widening what a substitution matches also widens what the check
  after it never sees**, and the fence could not observe it because its own fake `realpath`
  returned every lane path unchanged.
- **One line closed three doors it was not about.** Wrapping `resolveCwd` for the skill door also
  moved `skillRoots`, the containment list EVERY verb is judged against, so `write`, `rename` and
  `remove` were refused for a project skill opened from a lane — claiming it was outside every
  writable skills folder while it sat in the repository's own checkout. Red-first testing proves
  the thing you set out to build works; it says nothing about what else you moved.

**Four things a later milestone should know before it reads this as finished.**

- **The widening fence is the check that nearly did not work.** `dispatch.2`'s third arm proves
  that segment containment did not loosen the Places gate: under a bare `startsWith`, a directory
  the app has NO record for translates to the lane's repository, that repository is in the
  teammate's places, and the gate answers `ok: true` — a permission granted by a string
  coincidence. The first draft carried a second worktree record, and the longest-match rule then
  rescued the wrong containment rule so the arm stayed green under the very implementation it
  names. **A check that cannot go red for the reason in its own title is a claim of coverage, and
  it looks identical to a passing one.**
- **`memoryScope` had to be EXTRACTED before it could be checked.** No suite bundles
  `main/index.ts`, so the memory door's root resolution — four call sites, and this milestone's
  whole subject — had never been reachable by a check in its own right. Moving it into an injected
  module was not tidying; it is the difference between a claim and evidence. Anything else in
  `index.ts` that decides something is in the same position right now.
- **There is no memory migration, and that is the decision.** A JSONL written from a lane before
  M196 is no longer read. It is not merged into the repository's: the guide forbids silently
  merging previously separate histories, and those entries were already unreachable from every
  repository door and already orphaned by design. Nothing is rewritten and nothing is deleted; the
  provenance is on screen instead.
- **The delegation is the anti-drift move and it should be repeated.** `shared/preview.ts`'s two
  path helpers now call `work-scope.ts` rather than keeping the twin M195 wrote. A preview's root
  and a repository's root are one question about one kind of string, and the second copy would have
  differed exactly in the arm nobody tests.

**Owed, and not closed by a green gate:** nothing realpaths a scope, so a symlinked repository
alias and its real path are one place to the Places gate and two subjects to the memory store
(M195 recorded the same bound for a preview binding); the inspector's lane rows are RECORD-only, so
an externally created worktree shows no lane there even though the resolver would name it; the
skills door's translated write and the composer's repository-named disclosure are covered by no
real-renderer check; and `verify:visual` / `verify:packaged` are recorded below rather than
assumed. Every hand check the v9 run left owed is still owed.

---

## D03 = M195 — previews bound to the work they preview

**✅ done.** The full record is
[m195-d03-preview-ownership.md](m195-d03-preview-ownership.md); this is the row.

**run** `npm run verify` exit 0, 38 suite tallies, no FAIL line ·
**run** `npm run verify:visual` exit 0, 59/59 with one golden rewritten ·
**run** `npm run verify:packaged` exit 0, 12/12.
Seven checks, all scoped ids (`verify:file` 91 → 93, `verify:layout` 252 → 253, `verify:rail`
201 → 202, `verify:meta` 39 → 40, `verify:panels:product` 86 → 88), each watched RED against the
exact regression it claims to catch. `verify:verbs` stayed 23/23 with no edit to `closure.v9.1` —
the fifth preview verb's four doors bound themselves, which is the door check doing its job.

**The defect, measured rather than described.** The first run of the product check printed
`afterA: {A:2, B:2, U:2}` — a change under project A's root reloaded all three loopback panes —
and `afterOut: {A:3, B:3, U:3}`, an unrelated Markdown note reloading them again (that second one
was not in the audit). After the fix, and after the verifier's fences: `A+1, B+0, U+0` for a
burst under A, `A+1, B+1` for two projects changing in one window, and nothing at all for the
stray note.

**observed** `verify/visual/goldens/browser.png` — rewritten with the critic's sentence recorded
first. It differed by 0.139 % against a 0.5 % budget, so the suite PASSED it: a change under the
budgets that matters is forced by deleting the golden, and this is the milestone's only visible
surface.

**A fresh-context critic found five real defects that three green suites did not, and every one
was second-order** — not the thing built, but something it moved. The full round is §6 of the build
log; the two that generalise:

- **The Places gate HAD been widened, and the fence check could not see it.** `PlacesGate.check`
  REPLACES the candidate with `worktreeRootOf`'s answer and never judges the candidate again, so
  whatever the lane match consumes is what the gate stops looking at. Exact equality was
  accidentally safe — a lane root has no symlink component by construction — and containment made
  the whole subtree eligible, so a symlink an agent creates inside its own lane (`ln -s /etc evil`)
  was translated to the repository, found inside a place, and ALLOWED. `laneRootOf` now matches on
  the real path and fails closed. **Widening what a substitution matches also widens what the check
  after it never sees**, and the fence could not observe it because its own fake `realpath`
  returned every lane path unchanged.
- **One line closed three doors it was not about.** Wrapping `resolveCwd` for the skill door also
  moved `skillRoots`, the containment list EVERY verb is judged against, so `write`, `rename` and
  `remove` were refused for a project skill opened from a lane — claiming it was outside every
  writable skills folder while it sat in the repository's own checkout. Red-first testing proves
  the thing you set out to build works; it says nothing about what else you moved.

**Four things a later milestone should know before it reads this as finished.**

- **The canvas door was DEAD, and not only this milestone's.** `shellControl` does not
  stopPropagation on mousedown, and the pane's body focuses on mousedown, so every verb on the
  preview pane that reads the SUBJECT panel — `Find the project` and `Start dev` since **M185**,
  plus a candidate in the discovery list — focused the pane and then refused, because a browser
  pane is neither a terminal nor a chat. One line fixes all four
  (`if (e.defaultPrevented) return`, keyed on the `preventDefault` `shellControl` already calls
  "to protect `focusedId`"). **A check that dispatches mousedown and click from one
  `executeJavaScript` cannot see this class of defect** — both handlers run before React flushes,
  so the eagerly-assigned selection ref and the render-assigned focus ref both read correctly.
  Press in two tasks. Any later milestone adding a control inside a panel body that reads focus
  inherits this.
- **An unbound pane no longer auto-reloads. That is the one intended regression**, and it is the
  point: the old rule IS the defect. It is carried by the control reading `Bind source`, never by
  a `not bound` label — a zero-value statement in an always-visible row is what D01's density
  contract names.
- **The trigger is still narrow and D03 did not widen it.** `FILE_CHANGED` is sent from exactly
  one place, the watch `FILE_READ` registers per open FILE PANEL, so a repository an agent edits
  with no file panel open on the edited file reloads nothing — before this milestone and after
  it. The binding is exactly what a repository watch would need; adding one is a later
  milestone's, not a gap in this one.
- **No IPC change was needed, and the reason generalises.** The event carries no path but it
  carries `panelId`, and the renderer already holds that file panel's `source.path`. Before
  extending a shared contract, check whether the renderer can already resolve the fact
  transitively.

**Owed, and not closed by three green gates:** the merged view and the hook's teardown are
unchecked; `bindPreview`'s three refusals, `openPreview`'s binding behaviour, the lineup seat's
binding, undo and a workspace move are covered at no level; a binding is not realpath-resolved, so
a root taken from a live session's cwd and a file panel's own path can disagree through a symlink;
and a `SKILL.md` under a bound root does not reload the preview (`unknown-source`, by name). They
are listed with their reasons in §9 of the build log. Every hand check the v9 run left owed is
still owed.
