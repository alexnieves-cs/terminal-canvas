# M194 — D02, selected chat context in Files and Tools

The guide's [D02](../product-development-guide-2026-09-08.md). The problem it closes is
[D01's finding 3.1](m193-d01-reconcile.md#31-chat-context-is-not-recognised-by-files-or-tools--confirmed-and-visible-on-screen),
recorded there in its precise shape: **not that a chat has no context, but that two of three
inspection consumers disagreed with the third.** `review:*` already answered for a chat (M77's
`captureBaseline` keyed by the chat's id), so the inspector's **Changes** section worked for a
selected conversation while **Files** and **Tools** said it had no directory.

This entry is written under the ledger's evidence rule: every line is **read** (source at a
line), **observed** (a golden looked at), **run** (a command with its exit code and tally), or
**inferred** (a judgement, which is not evidence).

---

## 1. What shipped

**The seam.** `src/renderer/canvas/inspection-directory.ts` — a pure `inspectionDirectory(panel,
surface, liveCwd?)` answering one of three arms: `known` with a cwd, `absent` with a reason, or
`unavailable` with a reason. It is not a repository-identity function and grants nothing; D04 owns
repository and worktree identity, and this module must not grow into it.

Each consumer's existing policy is preserved verbatim inside it, which is the reason it takes a
`surface` discriminator rather than being one rule:

| Kind | `files` | `tools` |
|---|---|---|
| terminal | the LIVE cwd, else `spec.cwd` (M28's rule) | `spec.cwd`, the configured one |
| chat | `chat.cwd` | `chat.cwd` |
| chat, sandboxed | `absent` — no project directory | `absent` |
| review | `subject.repoRoot` | `absent` (unchanged) |
| toolbox | `absent` (unchanged) | `source.cwd` |
| every other kind | `absent` | `absent` |

**A sandbox is `absent`, not `known`.** M120's sandbox chat lives in `userData/sandbox/<id>` and
that folder is a real path on disk. Answering it here would make an app-owned scratch directory
present itself as the user's project in the Files tree, the Tools inventory and — through
`skillsCwd` — the `skill:create` and teammate-assign doors. The disk path is deliberately never
named on screen, which is the same decision `chatHeaderLine` already made (`sandboxed · no
folder`, M120).

**Four consumers, not two.** The spec named Files, Tools and the Open-toolbox action. A third and
fourth hand-written copy of the same rule were found while resuming and are now folded in:

- **read** `src/renderer/canvas/Canvas.tsx` — `skillsCwd` was a fourth copy, still terminal- and
  toolbox-only. Left alone it would have contradicted the inspector one dock row away: the Tools
  section listing a conversation's commands while the Skills pane said `no directory — select a
  panel with one` about the same folder. It now asks the policy.
- **read** `src/renderer/canvas/usePaletteActions.ts` — `openToolbox` likewise.

**A fourth `ToolInventoryResult` arm.** `unavailable` with a reason
(`src/shared/toolbox.ts`). The union was two arms — `inventory` and `no-cwd` — and every place a
read could FAIL had to launder that failure into one of them. `no-cwd` is a claim about the
record ("this object has no directory"); a rejected read is a claim about the moment. Printing
the first for the second is the same class of lie as the sentence D01 caught in the golden. The
arm was threaded to every reader the compiler named: `inspector-fields.ts`, `toolbox-node-model.ts`,
`ToolboxNode.tsx`, `SkillTrailLane.tsx`, `SkillsPane.tsx` and `Canvas.tsx`.

**Main stops falling back to `$HOME`.** **read** `src/main/ipc.ts` — `TOOLBOX_READ` used
`resolveCwd`, the SPAWN resolver, whose home fallback is correct for spawning (a terminal must
open somewhere) and wrong for inspecting (a deleted project would have displayed `$HOME`'s tools
as its own, with a confident inventory and nothing saying the directory was gone). It now expands
`~` and `statSync`s the result, answering `unavailable` when the folder is missing or not a
directory. `''` still answers `no-cwd`; that is a record fact and did not change.

**Subject-bound reads.** Both hooks now tag their STORED data with the subject it belongs to, not
only their in-flight writers:

- `useFileTree.ts` — `subject` is `[selectedId, treeRoot, showHidden]`, plus a `generation` ref
  the refresh bumps. The stored `treeState` carries its subject and is masked on the render where
  they disagree. **The `live`-flag pattern alone is not enough here**, and the hook's own new
  comment says why: an effect runs AFTER a render, so a flag that only cancels the stale WRITE
  still paints panel A's files under panel B's name for one frame.
- `useInspectorDetail.ts` — the same shape, keyed `[selectedId, selectedToolboxCwd]`.

## 2. The checks, and the red they were watched at

Sixteen checks, all scoped ids (`## Conventions`): `context.policy.1–.4` and `context.tools.1–.3`
in `verify:rail`, `context.chat.1–.9` in `verify:panels:product`. `verify:rail` goes 194 → 201 and
`verify:panels:product` 77 → 86.

Twelve of them arrived from the interrupted session already written, with no recorded red. They
were re-driven against a deliberately unimplemented, type-valid stub of `inspectionDirectory`
(always `absent`), chosen so that nothing THREW and every check below it still ran —
`docs/verify-suites.md`'s first rule.

| Suite | Red (stub) | Green |
|---|---|---|
| `npm run verify:rail` | **195/197** — `context.policy.1`, `.2` failed | 201/201 |
| `npm run verify:panels:product` | **75/85** — `context.chat.1,.2,.3,.4,.6,.7,.8` failed | 86/86 |

(The red column's totals are that run's, before the last four checks existed.)

The four added later were written AFTER the code they pin, so each was driven red afterwards by
reverting exactly the regression it claims to catch — one at a time, each with the suite completing:

| Check | The regression put back | Result |
|---|---|---|
| `context.policy.3` | the sandbox sentence collapsed into the unrecorded-directory one | **199/201** (`.2` caught it too) |
| `context.policy.4` | the hand-written `skillsCwd` copy restored in the Skills pane | **200/201** — `missing: ["the Skills pane's cwd"]` |
| `context.tools.2` | the positive `kind === 'inventory'` guard deleted | **200/201**, reported as `{"threw":"TypeError: … reading 'entries'"}` — CAUGHT and failed rather than aborting, which is the whole point of wrapping it |
| `context.tools.3` | the node's `unavailable` arm deleted | **200/201**; `context.chat.7` stayed green beside `context.chat.9`'s **85/86**, so the terminal and chat arms of `insertPath` are pinned independently |

**A harness fact this cost a run.** The first attempt at `context.chat.9`'s red left the unused
`insertIntoComposer` import behind, so `npm run build` failed its typecheck — and
`verify:panels:product` then ran happily against the PREVIOUS bundle still sitting in `out/` and
printed a green 86/86. A red-first that never rebuilt is not evidence, and nothing in the output
says so: the suite does not consume the build's exit code. **Always read the build's own line
before believing the suite that follows it.**

**`context.chat.5` passes against the stub, and is recorded as non-discriminating on its own.** It
is a negative check — inspecting spawns and disposes nothing — and a stub spawns nothing either.
It is worth keeping (it would catch a future consumer that reached for a session to resolve a
directory) but it is not evidence that the feature works.

**The stub's red also took `editor.2a`, `.2b` and `.2c` with it** — the Skills pane's create,
rename and delete doors. That is the evidence that routing `skillsCwd` through the policy sits
under existing coverage rather than beside it.

### One check could not be made to fail honestly, and that was an implementation defect

`context.tools.1` drives `buildToolboxFields` with the new `unavailable` arm. Deleting that arm
from the implementation did not turn the check RED — it made the suite ABORT:

> **run** `npm run verify:rail` — `TypeError: Cannot read properties of undefined (reading
> 'entries')`, the process dead, every check below it never executed.

`buildToolboxFields` reached its inventory branch by FALL-THROUGH, so any kind it had no arm for
became `result.inventory` = `undefined`. That is a throw inside a React render for a renderer
running against an older or newer main, and by `docs/verify-suites.md`'s first rule it also meant
the check's red was not evidence. Fixed at the cause: the function now tests POSITIVELY for
`kind === 'inventory'` and names an unknown shape in `SkillTrailLane.resolve`'s own words
(*the inventory came back in a shape this version does not know*, M130). `context.tools.2` pins
it, and with the fix in place `context.tools.1` fails RED (197/198, the suite completing) when
its arm is removed.

## 3. Doors

No new verb, so no fourth-door debt is owed (`V9_DOORS` is unchanged and `closure.v9.1` still
binds). Two EXISTING doors were widened to the kinds they already should have accepted: the Files
pane and the inspector's `Open toolbox`. `Open toolbox` is now present-and-disabled-with-a-reason
where it does not apply rather than a silently inert control — the repository's standing rule that
a row which disappears is indistinguishable from a feature never built.

## 4. What this milestone did NOT do

- **No repository or worktree identity.** A chat dispatched into an M113 lane resolves its lane
  directory, not the repository it forked from. Main already translates a lane through
  `worktreeRootOf` for the skills brief (M131); doing it for inspection is **D04's** subject and
  is deliberately not started here.
- **No preview ownership.** D03.
- **`SkillPanelSighting.sees` is still a boolean** (`src/renderer/skills/SkillNode.tsx`), so a
  panel whose inventory read FAILED is drawn identically to one that genuinely cannot see the
  skill. That is the same two-state defect this milestone fixed elsewhere, in a surface D02 does
  not own; it needs a third state on a shared type and its own checks. **Recorded, not fixed.**
- **No persistence, migration, IPC channel, permission or styling dependency.** The channel list
  is unchanged.

## 5. Commands

| Command | Exit | Tally | Note |
|---|---|---|---|
| `npm run typecheck` | 0 | both projects | — |
| `npm run verify:rail` | 0 | 201/201 | 194 before this milestone |
| `npm run verify:panels:product` | 0 | 86/86 | 77 before this milestone |
| `npm run verify` | 0 | 38 suite tallies, no FAIL line | — |
| `npm run verify:visual` | 0 | 59/59 after the one intended golden | 58/59 before, `starter` alone |
| `npm run verify:packaged` | 0 | 12/12 | — |

**One harness fact this milestone re-learned, and it cost a full visual run.** The first
`verify:visual` failed 55/59 — `starter` plus `chat-copilot`, `supervisor` and
`inspector-detail` — and the three extra scenes were entirely an artefact of running the suite
under `TMPDIR=/private/tmp`. Every one of their diffs is a PAINTED temp path
(`/private/var/folders/…/T/tc shot fixtures golden/repo` against `/private/tmp/…`), a pid, a
port or a CPU/RAM reading. The v9 run recorded the opposite direction of the same trap in
`CLAUDE.md` ("real-Electron suites run under the SYSTEM `TMPDIR`") and it is worth stating as a
rule with no direction: **`verify:visual` must run under whatever `TMPDIR` the goldens were
baked under, which is the system one.** Re-run with no override: 58/59, `starter` alone.

## 6. The one golden that changed, and the critic's sentence

**`starter`** — the only scene past either budget (1.053 % of pixels, budget 0.5 %).

> With the starter canvas's conversation selected, the inspector's Tools tab no longer asserts
> *"A chat panel has no directory, so there is no toolbox to read"* about a panel that carries a
> `cwd`. In its place is that directory's real inventory — `14 skills · 1 command · 20 hooks`,
> `permissions: 628 allow in 1 file`, the skill rows with their scope, `+25 more`, and an
> ENABLED `Open toolbox`. Nothing else in the frame moved: the canvas, the group, the four
> captions, the rail and the action bar are pixel-identical. This is the sentence D01's finding
> 3.1 said D02 must delete rather than soften, and the golden is the evidence it is gone.

The other three scenes were NOT re-baselined: they never changed. Re-running them under the
correct `TMPDIR` returns them to green byte for byte, which is the whole reason this entry
records the cause rather than a golden update.

## 7. The fresh-context critic and verifier

Two fresh-context agents were run against the working tree, one on the implementation and one on
the CHECKS. Both were asked for findings, not approval, and every finding below was re-verified
against the source before it was accepted or declined — several were, and are marked.

### Accepted and fixed

| # | Finding | What it was |
|---|---|---|
| C1 | `insertPath` was a dead control for a chat | **The most serious.** The tree can now root on a chat, so the FOCUSED panel can be one — and `registry.get(<chat id>)` is `undefined`, so `?.handle.paste` was a silent no-op and every row in the pane did nothing. It lands on D02's own acceptance sentence. Fixed with the composer arm a DROP has taken since M75 (`@` reference, relative to the chat's cwd); pinned by `context.chat.9`. |
| C2 | `unavailable` was collapsed back into "no directory" for every kind but chat | `useInspectorDetail` gated the reason on `isChatPanel`, so a terminal, review or toolbox panel with an unusable directory printed the same false claim about the record, one kind over. Now keyed on the policy's arm. |
| C3 | The policy invented sentences that were worse than the ones it replaced | Three findings, one cause. The generic `'This object has no directory to inspect.'` overwrote `FileTree`'s M48 §5 line that NAMES the panel, told a terminal to "select a conversation", and claimed a toolbox panel — whose whole identity is a directory — had none. Fixed with the fourth arm: `no-directory` carries NO sentence. |
| C4 | Files accepted a relative cwd that Tools refused | `fs:list` resolved it against MAIN's own working directory and painted a plausible basename over whatever that hit. The absolute/`~` test now lives in the pure policy, so both surfaces refuse the same string identically. |
| C5 | Register break | Five new sentences were Sentence-case with full stops beside a pane whose every other line is lowercase and unpunctuated. All normalised. |
| C6 | Main had three facts and two sentences | `statSync` THROWS on a missing path, so the arm reading "select an existing absolute folder" was the one that never saw a deleted project. Split into three. |
| C7 | A stale comment saying the opposite of its code | `Inspector.tsx`'s "Present and ENABLED whenever the section renders" sat directly above the `disabled` this milestone added. |
| V1 | **A regression this milestone introduced in its own check** | `context.chat.2` held `held.splice(0, 2)`. Routing `skillsCwd` through the policy added a THIRD consumer read per selection, so the splice resolved the Skills pane's obsolete reply instead of the inspector's — leaving the inspector's held and the Tools half of the check true by construction. Now counted from the first selection, and the count is asserted. |
| V2 | The product block's `finally` was not throw-safe | An `executeJavaScript` rejection inside the block ran a cleanup that emptied `held` by RE-RUNNING the real handler first: one rejection there lost the rest, left the renderer's promises pending for ever, and skipped the restore — leaving the swapped IPC handlers and the fixture workspace installed for **every later check in the part**. Restore now goes first and touches nothing that can throw; each awaited step is guarded on its own. |
| V3 | `context.tools.2` could throw rather than go red | The check that exists for the missing-guard regression would abort the suite on that very regression. Wrapped. |
| V4 | `context.chat.5` was racy | `before` was captured a fixed sleep after a reload, while `useChatSessions` was still firing `agent:create` on mount. Now waits for the mount's sessions; pty ids sorted. |
| V5 | "Distinct explanations" was unchecked | The spec's clause was satisfied by arm names alone; collapsing two sentences into one passed. `context.policy.3` compares the sentences. |
| V6 | Nothing pinned that the policy is SHARED | The structural claim the milestone exists for. `context.policy.4` reads the four consumers as TEXT (`verify:agent-session registry.1`'s shape) so a fifth hand-written copy cannot land green. |
| V7 | Uncovered new arms | `context.tools.3` covers the toolbox NODE's `unavailable` arm. |
| V8 | A comment recording a premise that had become false | `verify-rail.cjs` said "every `@shared` import reachable from here is an `import type`". `inspection-directory.ts` → `panels.ts` → `carryChatMarks`/`carryBackend` are value imports. Corrected — this is exactly the re-export chain `docs/verify-suites.md` warns is invisible by eye. |
| C8 | **A write hazard this milestone opened** | `skillsCwd` now answers for chats, and a DISPATCHED chat's cwd is an M113 worktree lane. `skill-write.ts` derives the project root from the cwd it is handed, so `New skill` at project scope would have written into `userData/worktrees/…` and gone with the lane. REFUSED by name, naming the repository; translating it is D04's. |

### Declined, with the reason

- **`SkillPanelSighting.sees` is still a boolean** (`SkillNode.tsx`), so a panel whose read FAILED
  is drawn as one that cannot see the skill. Correct, and the same two-state defect fixed
  elsewhere here — but it needs a third state on a SHARED type plus its own checks, in a surface
  D02 does not own. Recorded, not fixed.
- **`skillSources` still hand-derives a cwd and lists a sandboxed chat.** Deliberate and left
  alone: it answers "which open panels can SEE this skill", which is a question about execution
  reach, and a sandboxed chat genuinely runs in its sandbox. `SkillTrailLane` passes the real
  sandbox path for the same reason. It is not an inspection consumer, so `context.policy.4` does
  not claim it.
- **Dead-code and redundant-dependency nits** (`toolboxSubject` in an effect's deps, `treeRoot`
  beside `subject`): no behaviour, no fix, no churn.
- **`toolbox-cache.ts`'s `!== 'inventory'` widening is unreachable** (main answers before the
  cache is consulted). It is the correct generalisation and is kept.

## 8. What is owed, and is not closed by a green run

These are gaps in the EVIDENCE, named so a later milestone does not read green as proof of them.

1. **The render-gap masks have no check.** The milestone's own headline mechanism — a changed
   subject masking the old answer *before effects run* — is unobservable through the harness,
   because `settle()` is a 300 ms sleep and React has long since flushed. Deleting both masks
   passes the whole suite. The behaviour they prevent is real and the comments explain it; the
   proof is owed, and would need either sub-frame observation or the mask extracted as a pure
   function.
2. **`showHidden` and the refresh generation are in the subject key and unchecked.** Removing
   either passes everything.
3. **Main's two other validation arms are unchecked** — the non-absolute refusal and "exists but
   is a file". The renderer now refuses a relative cwd before main sees one, which is defence in
   depth and also why no check reaches main's arm.
4. **`context.chat.8`'s retry may be a `ToolboxCache` hit** rather than a fresh read; it proves
   the section recovers, not that the read ran again.
5. **`context.chat.5` covers create/dispose/pty/kill only.** The spec also says inspection sends
   and interrupts nothing and grants no permissions; no check reads turn counts or grants.
6. **No product check selects a terminal, review or toolbox panel** and reads the Files/Tools DOM
   after the rewrite. Their compatibility is proven at the pure-function level only
   (`context.policy.1`).
7. **Every hand check the v9 run left owed is still owed.** Nothing here closes one.
