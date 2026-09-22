# M205 — D09, intent-led onboarding

The guide's [D09](../product-development-guide-2026-09-08.md#d09--make-onboarding-intent-led). Spec:
[2026-09-10-m205-intent-led-onboarding.md](../superpowers/specs/2026-09-10-m205-intent-led-onboarding.md);
plan: [its plan](../superpowers/plans/2026-09-10-m205-intent-led-onboarding.md). Built on branch
`d09-intent-onboarding` in its own worktree, from local `main` at `aa51910a`.

Written under the ledger's evidence rule: **read**, **observed**, **run**, **inferred**.

---

## 1. The measurement first

- **observed** `launcher.png` at `aa51910a`: one primary (`Start a conversation`), two cards, seven
  prompt lines, five of them different ways to start a chat or a shell — and no step asking what
  the person wants to do, or where (D01 §4, journey 1).
- **read** `Canvas.tsx` `onStart` at the parent: on a first run the primary called `openStarter`,
  so the only door a new person had into a conversation also minted five objects. The tour was the
  compulsory definition of a workspace (guide step 4).
- **read** `start-work.ts:startWorkRefusal`: D05's Start work refuses *"no teammate yet"* on an
  empty roster — always the case on a fresh install. **The one path into a task could not be
  reached by a new user** without visiting the Teammates pane first. That is the gap D09's result
  column names, and closing it is most of this milestone.
- **read** `shared/teammates.ts`: a teammate carries **no backend**, so D05's dispatch always
  creates a Claude conversation. A Codex-only machine cannot start a lane, whatever onboarding says.

## 2. What was built

**The launcher asks two things** — *what do you want to work on?* and *in which repository?* — and
offers one primary (**Start work**) and one alternative (**Ask without a folder**). Everything
else — New panel, Open a file, Import, the starter, the presets, a chat with each engine, a note —
is inside one closed native `<details>`, **More ways to start**, every row still present and
disabled by name where it cannot run. Recent chips now FILL the folder field rather than opening
the spawn sheet. The codex hint's `one process per turn` is gone.

**Start work is D05's executor**, reached through `startFirstWork` (`Canvas.tsx`): the pure plan
(`firstWorkPlan`), then `git:status` on the folder, and only then any mint — a teammate reused when
a standing one's place contains the folder by path segment, otherwise one minted whose ONLY place
is exactly that folder; a typed work item; `startWork` → `dispatchWorkItem` (lane, conversation,
first message sent). The grant is stated in the form's summary line before the press.

**The alternative is M120's no-folder conversation** on whichever engine readiness found, the
sentence inserted into its composer (M80's rule: inserted, never sent). A folder that is not a
repository refuses by name with **Chat in this folder instead** — a conversation there, the
sentence inserted.

**Readiness appears only as needed**: with Claude found, one row; with nothing found, every row and
Check again. Installed / missing / unanswered remain three states in the model.

**No IPC and no schema change.** `teammate:save`, `teammate:choose-place`, `git:status`,
`board:lane`, `agent:create`, `agent:send` all existed. `startFirstWork` is **not** a palette
action — a plan must never mint a place grant — and the palette's `Start work…` row is already
the keyboard door to the same executor.

## 3. Load-bearing decisions

- **The grant is exactly the typed folder** — never its parent, never git's reported root.
  Widening what a person chose is M196's substitution-widening class, reached from the other side.
- **Reuse is containment by path SEGMENT** (`placeContains`): `/code/app2` is not inside
  `/code/app`. `onboarding.intent.3` pins the sibling case.
- **The repository question is asked before any mint**: a plain folder or a machine with no git
  refuses having created no teammate and no card (`onboarding.intent.e2e.2`, `mintedNothing`).
- **The engine is refused FIRST** — no sentence fixes a missing CLI; the first static render asked a
  Codex-only machine to "say what you want to work on" (`onboarding.markup.1`, red on first run).
- **The lane engine is named once** (`LANE_ENGINE`): the Launcher's first cut compared
  `row.backend === 'claude'` and `verify:agent-session registry.1` (M99's rule) caught it.
- **A retry of the same sentence in the same folder resumes the same item** (`firstWorkItemRef`),
  so the launcher — still up after a refused lane — never mints a twin card; M198's recovery
  journal lives on that item.

## 4. What the checks caught that no reading would have

- **run** `onboarding.intent.e2e.1`, red twice on `caret: false`. The diagnostic added to the check
  measured `active: BODY, inputDisabled: true`. Two causes, both real:
  1. `ChatNode.placeCaret` focused only inside `requestAnimationFrame`, which never runs in a window
     that is not painting. It now focuses immediately and sets the caret in the frame — the same
     end state for every insert caller (the palette's prompt row included), reached without one.
  2. A composer is **disabled while its turn is pending or streaming**, and the first start's
     insert lands exactly while its first message is in flight — focus on a disabled textarea is a
     no-op. `placeCaret` now remembers the request and an effect honours it when sending
     re-enables, **only while the keyboard is on nothing** (a person who clicked elsewhere
     meanwhile keeps their focus).
  The last eight seconds of the second red were a HARNESS fact — the composer reads availability
  from the preset rows, not the report, so the check needed `onboarding.start.1`'s claude-code
  fixture preset. It is written beside the preset so the next check does not rediscover it.
- **run** `reach.1`, red: the Tab walk started at `[data-launcher-sheet]`, now inside the closed
  disclosure; then at the alternative, disabled when the harness's report finds no engine. It opens
  the disclosure and starts at `New panel…`, the one door enabled on every machine.

## 5. Changed checks, each named

| check | change | why |
|---|---|---|
| `onboarding.markup.1` | rewritten | the primary is Start work; legacy doors asserted INSIDE the closed disclosure |
| `onboarding.markup.3/.4` | new | readiness only as needed; no process jargon; primary names what is missing; starter optional |
| `onboarding.intent.1–.5` | new, **watched red** (5 FAIL, export absent) before `firstWorkPlan` existed | the pure decision |
| `onboarding.start.1` | door moved to `[data-onboarding-ask]` | same property: a composer and a reply with no terminal |
| `onboarding.intent.e2e.1/.2` | new | real input, real temp repository; written after the implementation — not watched red against the parent |
| `starter.1` | reached through the disclosure line | the primary no longer lays the starter out |
| `reach.1` | opens the disclosure before the walk | a closed `<details>` keeps its rows out of the tab order by design |
| `shot.cjs` `starter` | through the disclosure line | same |

## 6. Evidence

**The gate is NOT green, and the part of it that is red is red on the base commit too.** Stated
plainly, because a green-looking summary would be the claim this ledger's rule exists to prevent.

- **run** plain-node tier after the critic's fixes, each exit 0: `verify:onboarding` 21/21,
  `verify:agent-session` 141/141, `verify:styles` 60/60, `verify:verbs` 23/23, `verify:meta` 45/45
  (after M205's README row — `milestones.1` was red without it), `verify:palette` 148/148,
  `verify:layout` 255/255, `verify:viewport` 148/148. `npm run build` (typecheck included) exit 0.
- **run** `verify:panels:product` whole, alone, after the fixes → **exit 0, 103/103**, `headroom.1`
  green — every check this milestone added or changed lives here.
- **run** `verify:panels:agents TC_ONLY=firstrun` → 4/4 (the presets clicked inside the closed
  disclosure).
- **run** full `npm run verify` (before the critic's fixes) → **exit 1, 36/39 suites**: red in
  `verify:panels:shell` (`98`, `98b`, `106`), `verify:panels:agents` (`search.1`, `attention.1`,
  `headroom.1` 112 s of 113 s) and `verify:panels:product` (`work.action.1`, `review.task.2`, a
  watchdog kill). **The product reds were mine**, and are fixed: see below.
- **run, the discriminator**: the BASE commit `aa51910a` (`git archive` into a scratch directory,
  this worktree's `node_modules` linked, `npm run build`, `TC_VERIFY_SUFFIX=base`) on the same
  machine minutes later → `verify:panels:shell` **93/97 with the identical four** (`98`, `98b`,
  `106`, `127`), and `verify:panels:agents` red on `search.1` and `attention.1` too, worse than
  this branch (a watchdog kill cascading to `Object has been destroyed`). D08 recorded this commit
  at 39/39 earlier the same day, so these are **this machine today**, not M205 — and they are
  **not proven flakes either**: `attention.1` passed alone and failed in its part on both trees.
  Load averages during these runs were 40–100, and 430–760 at the end (dozens of VS Code `rg`
  scans and an Xcode build, none of them this session's).
- **not run to completion**: `verify:visual` (two watchdog kills at 221 s, before any scene was
  compared, at load 430+) and `verify:packaged`. Both are owed.

**The regression the gate DID find, and fixed.** `ChatNode.placeCaret`'s new immediate `focus()`
scrolled `.canvas` — the clipping host — to reveal the composer; a scrolled host offsets every
screen↔world conversion after it, which is what turned `work.action.1` and `review.task.2` red and
pushed the product part to its watchdog. `focus({ preventScroll: true })` at all three new focus
sites (the immediate one, the deferred one, the launcher's autofocus); the product part then ran
103/103. **The rAF-only focus that preceded this milestone never ran in a hidden window, so the
harness had never once seen a composer focus scroll the canvas** — a later milestone adding a
focus inside `.world` must pass `preventScroll`, and this is written beside the line.

**observed** `out/shots/launcher.png` and `out/shots/starter.png` (`npm run shot`, exit 0, 60
scenes). The critic's sentence for the one golden this milestone changes on purpose, written
BEFORE any re-baseline: *`launcher` — the empty canvas now asks what you want to work on and in
which repository, with Start work (disabled, naming the sentence as the one missing thing) beside
the one alternative, a single readiness line, and every other door folded under More ways to
start; the seven-row list is gone from rest by design.* `starter` is reached through the
disclosure and paints the same five kinds; whether it moved under the budget is what the owed
`verify:visual` run answers. **No golden was rewritten**: `UPDATE_GOLDENS=1` runs the same visual
suite that could not finish, and a blind re-baseline is the regression the golden rule names.

## 7. Critic

A fresh-context critic read the diff (no suites run) and returned fifteen findings. Disposition:

| # | finding | disposition |
|---|---|---|
| 1 | Enter on ANY button in the form (Ask, Choose…, a chip) ran Start work — minting a grant for a person who asked for the no-folder door | **fixed** — Enter starts only from the sentence or folder field |
| 2 | teammate and card are minted before `board:lane`/`agent:create`/send, so a later refusal leaves them | **kept, and the spec corrected**: after the lane step they ARE M198's recovery journal — a retry resumes the same item, lane and conversation. The spec's "nothing minted on any refusal" now says *before the lane step* |
| 3 | a SUBFOLDER of a repository passes `git:status`, then the lane (made from git's top level) is refused by the gate after a teammate, card and worktree exist | **fixed** — `firstWorkRepoAnswer` refuses by name before any mint (*"… is inside the repository …"*); the grant is never widened to the root; `onboarding.intent.5` |
| 4 | unanswered discovery read as "install Claude Code" — the wrong fix | **fixed** — a third arm, *"discovery has not answered yet — choose Check again"*; `onboarding.intent.2` |
| 5 | the first-work item ref was never cleared, so a later identical start folded into the old task | **fixed** — cleared on `started` |
| 6 | the deferred focus armed for EVERY insert, so a review's Continue took the keyboard when its turn ended | **fixed** — an explicit `focus` flag on the store's insert; only the first start asks |
| 7 | reuse compared strings; `/var/…` vs `/private/var/…` minted a twin teammate | **fixed for the macOS `/private` case** (`comparable`); a folder through another symlink is recorded in §8 |
| 8 | a missing path read as "not a git repository", offering the wrong door | **fixed** — *"… does not exist"*; `onboarding.intent.5` |
| 9 | a multi-line sentence repeated its first line to the agent | **fixed** — the description is the remainder; `onboarding.intent.4` |
| 10 | paste left the caret at the end; ⌘Z dead in both fields | caret **fixed**; undo **declined** — it is CLAUDE.md's documented `edit:undo` gotcha, shared by every text surface |
| 11 | no check for Enter-on-Ask, a subfolder, or a refused lane | subfolder and missing path now pure checks; Enter-on-Ask and refused-lane-leftovers **owed** (§8) |
| 12 | `teammate.save` might normalise places | **checked** — `onboarding.intent.e2e.1` reads the saved record: places exactly `[repo]` |
| 13 | merged view | **checked** — `beginNewChat` refuses on `mergedRef`; the launcher never renders merged |
| 14 | Codex-only has no launcher door to a conversation IN a folder | **owed** (§8) |
| 15 | a fresh install no longer sees the starter unless it opens the disclosure | **intended** — guide step 4; named here as a discoverability change, and in `getting-started.md` |

## 8. Owed

- **Measured by a person** — the guide's own acceptance: a new user starting meaningful work
  without terminal knowledge. Not asserted from automated checks.
- A folder that is a **subfolder** of a repository: the lane is made from git's answer and the
  Places gate judges it; any refusal is passed through by name, not pre-empted.
- A folder typed through a **symlink**: the grant is the typed path; main's gate realpaths. Not
  exercised by a check.
- **Codex-only** machines cannot Start work (no teammate backend); refused by name, pointing at the
  alternative. A teammate backend is a later milestone's, not a widening here. They also have no
  launcher door to a conversation IN a folder (critic 14) — `Chat with Codex…` opens in home.
  **Closed 2026-09-21:** `firstWorkPlan` now resolves the start from readiness — with the lane
  engine missing and Codex installed it returns a `chat` arm, and Start work opens a Codex
  conversation IN the folder (sentence inserted, never sent; no teammate, grant or branch),
  saying so in the summary before it happens. Sentence/folder refusals stay named and come first;
  an UNANSWERED Claude is still refused, not routed. Pinned by `onboarding.intent.2` and `markup.1`.
- **Not checked end to end**: Enter on a focused button inside the form (critic 1's fix is read,
  not driven).
  **Closed 2026-09-21** (a later critic pass, 2.4/2.5): a refusal AFTER the lane step already left
  `dispatchWorkItemAttempt`'s own reason on the item's `note` (critic 2's disposition above), but
  with no panel minted for it neither the teammate nor the item was ON the canvas — invisible
  orphans if the launcher was later put away or a relaunch reset it. `startFirstWork` now puts the
  item's card on the canvas the moment `startWork` itself fails post-mint (guarded so a second
  failed retry of the same item never mints a twin), so the note and `Start work again…` — the
  SAME dispatch path every other work item already retries through — are where a person can find
  them, rather than a launcher-only special case. Separately, critic 15's "intended" stays intended
  — the starter is still never laid out beside the primary — but a one-time line now names exactly
  where it is ("under More ways to start"), dismissed and remembered the same way the tmux notice
  is (`hints.ts`'s `starter` id). Both `onboarding.intent.e2e.1/.2` still pass; the new card path
  has no automated check (still nothing drives a post-mint `startWork` failure end to end).
- **`verify:visual` and `verify:packaged`**, and the `launcher` golden's re-baseline after a person
  looks — §6. Then the full `npm run verify` on a machine that is not under the load §6 records,
  for the shell and agents reds the base commit shares.
- The disabled primary reads as an outlined box beside the alternative at rest — the app-wide
  `.is-primary:disabled` rule (`styles.css`), unchanged here; D10 owns the hierarchy pass.
- Every hand check the v9 run left owed is still owed.
