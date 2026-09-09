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
| D03–D20 | M195–M224 | not started | — |

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
| D03 | **M195** | — | not started |
| D04 | **M196** | — | not started |
| D05 | **M197–M198** | M197 the one entry door and the task record; M198 the assembly (teammate, place, lane, chat) and its partial-failure recovery | not started |
| D06 | **M199–M200** | M199 the run's own truth (a pending question as a run entry; a turn is not a task); M200 the supervision surface that reads it | not started |
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
