# M288–M290 — Orchestrate Phase C (parallel work)

The state of this run lives here, not in any session's memory. Spec:
[docs/orchestrate-reference-plan.md](../orchestrate-reference-plan.md) (Phase C row of
"Ordered delivery plan"); run prompt:
[2026-09-19-orchestrate-phase-c-run-prompt.md](../superpowers/specs/2026-09-19-orchestrate-phase-c-run-prompt.md).
Phase A's ledger is [m283-m284-orchestrate-phase-a.md](m283-m284-orchestrate-phase-a.md), Phase B's
[m285-m287-orchestrate-phase-b.md](m285-m287-orchestrate-phase-b.md).

- Branch `m288-orchestrate-phase-c`, worktree `../tc-orch-phase-c`, off main `69885a72` (Phase B's merge).
- Numbering: `M288`/`M289`/`M290` were free on 2026-09-19 — no hit in `docs/build-log`, none in
  `git log --all`, no branch or worktree carrying the number.
- **The user's uncommitted `Canvas.tsx` / `shell/useShellChrome.ts` edits on main are NOT on
  this branch**, by the run prompt's rule: the worktree is off committed main. This phase changes
  `Canvas.tsx` again (props to the Orchestrate mount), so the merge meets those edits — theirs to resolve.
- The spec, the run prompt and `docs/design/` are UNTRACKED in main's tree (the user's), so they
  are not on this branch; the links above resolve in main's checkout.
- Serial, one writer. Subagents read-only, plus the critic.

## Goal

Orchestrate shows parallel work honestly: one island per task or execution context, grouped by
the repository and worktree real paths and remotes derive; each island with its own review
subject that no other island's diff can be shown under; shared directories said, not guessed;
the typed handoff relations rendered as a read-only dependency lens with named blockers; and
controls and run limits that appear only where the runtime supports them and say what they cover.

## Exit criterion (stop here)

From the plan: *two isolated write tasks and a dependent check can be followed without mixing
diffs; shared-directory ambiguity is visible.* Shown by driving the real app with a real second
worktree, with what was seen recorded below — including the rapid-selection and out-of-order
cases; then `npm run verify` with every red reported, a fresh-context critic on each changed
scene and on M288's subject binding. No goldens written, no merge, no push.

## M288 — Many islands, honest review subjects

- [x] Islands grouped by repository and worktree from real paths (worktree records' root and
      path, a member's cwd), never a project record. A task may span contexts; a shared directory
      is said as such, with the count of sessions writing it.
- [x] Every island carries an honest count and an execution context label (branch · own
      worktree, or shared directory · N sessions write here).
- [x] Each island has its own review subject; every workbench read is bound to the selection
      identity it was requested for, out-of-order and late answers dropped by name.
- [x] Shared-directory ambiguity shown, not guessed.
- [x] Placement stable: a new island appends, existing ones keep their place; the order is
      persisted per workspace.
- Checks: `verify:orchestration orch-islands.*`; `verify:panels:orchestrate orch-islands.app.*`.

## M289 — Typed dependency lens

- [x] Typed handoff relations drawn as directed connections with a readable trigger; membership
      spokes quieter.
- [x] Dependency focus dims unrelated work; prerequisites, dependents, blockers and the exact
      handoff condition listed; a blocked downstream task names its reason.
- [x] Read-only, said in the UI; a visual move changes presentation only, never dispatches, and
      is undoable.
- [x] No synthetic centre implying a supervisor; grouping labelled as grouping.
- Checks: `verify:orchestration orch-dep.*`; `verify:panels:orchestrate orch-dep.app.*`.

## M290 — Capability-aware controls and run limits

- [x] Interrupt / retry / reassign / stop only where supported, each saying what it affects, in
      the plan's words.
- [x] Concurrency, spend and time limits each labelled enforced or advisory with coverage;
      unknown spend reads Unknown; no universal cap implied.
- [x] Prompt routing names its target; the composer sends nothing to a hidden terminal.
- [x] Commit and discard brought into the workbench through the same executors with the M285
      `expect` re-check — or the reason recorded here.
- Checks: `verify:orchestration orch-limits.*`; `verify:panels:orchestrate orch-limits.app.*`.

## Also do

- [x] The Orchestrate Electron checks (Phase A's `orch-task.*`, Phase B's `orch-bench.*`) move
      into their own part, `verify:panels:orchestrate`, with a `// measured` watchdog; the
      `agents` part's watchdog re-measured after the move.

Commits: `34c0136a` feat(m288), `30d4f3eb` feat(m289), `ea5e1521` feat(m290), then the agents re-pin
(`chore(m288)`). The view, the workbench, the styles, the orchestration suite and the load-bearing
entries landed whole in the m288 commit (they carry the wiring for all three); the m289 and m290
commits add the modules that wiring calls. `verify:panels:orchestrate` took Phase A's `orch-task.*`
and Phase B's `orch-bench.*` verbatim (ids unchanged; `panels-split.2` still finds every id).

## Exit demo (what was seen driving the real app)

Driven 2026-09-19 through the real built renderer and the panels harness (real
`AgentSessionManager` under the recorded-turn fake CLI, real git, real worktree manager, real
review engine, committer and discarder, real handoff hook). `verify:panels:orchestrate`, green
at 22/22 in 81.9 s (load ~7), captured with `TC_DEMO_SHOTS=/tmp/tc-phase-c-demo` (thirty PNGs,
`m288-1…5`, `m289-1…3`, `m290-1…8`, plus Phase A/B's fourteen). As before, a hidden window's
`capturePage` can lag the DOM by a step; where a capture and a check disagree the check's DOM
read is the fact.

1. **Two isolated write tasks, two subjects (exit criterion, first half).** Typed items `Edit a`
   and `Edit b` dispatched to teammate `phase-c` in one fresh repository minted two REAL
   worktrees (`tc/c1-…`, `tc/c2-…`) and two chats. The island column read `2 ISLANDS`, one group
   labelled `<repo> · grouping only — not a supervisor`, each card `Task · working · 1 session`
   with its own branch `· own worktree`. Island A's Changes: subject `task:<A>:wt-46adaae6`,
   files `a.txt` only, the diff `+A changed`, and `data-orch-bench-subject`,
   `data-orch-controls-subject` and `data-orch-diff-subject` all the same key. Island B:
   `task:<B>:wt-f4b6d603`, files `b.txt` only, the diff pane reset (`Choose a file`), and no
   `A changed` anywhere in the strip.
2. **Rapid selection and out-of-order answers.** A → B → A dispatched in one tick; then a.txt's
   diff opened and B chosen in the same tick (the diff answer in flight when the subject moved);
   then Refresh twice in one tick. Thirty-two DOM samples taken through the flips at 25 ms: zero
   mismatches — at every sample the strip, the controls and the diff pane named one subject and
   any diff key started with it; after the in-flight case B showed `b.txt` with no diff and no
   trace of A. The pure gate (`orch-islands.4`) shows the same two arms in plain node: B's late
   answer and A's OLDER answer both dropped, and two answers for one key keep the newer.
3. **Shared-directory ambiguity (exit criterion, second half).** Two chats minted in one
   plain repository, each sent a turn, then a file edited there. One island
   `dir:<shared>`, card marked ambiguous, label `<shared> · shared directory · 2 sessions write
   here`; the inspector: *Shared directory — 2 sessions write in …; a change here cannot be
   attributed to this task alone*. Changes read the engine's `shared` arm — *1 changed file in a
   repository 2 sessions share — authorship is ambiguous, so none is attributed to this one* —
   with commit and discard BLOCKED BY NAME and no write buttons.
4. **A dependent check, followed without mixing (M289).** Two real terminals with an
   `exit-ok` handoff `dA → dB`; `dA` woken through the rail and driven to `exit 1` through its
   PTY. On `dB`: **`Blocked — /bin/sh: skipped — exit 1 is not exit 0`** (the canvas's own
   recorded sentence, quoted, not inferred); its prerequisite row `/bin/sh → on exit 0 ·
   skipped · fires only when the source exits with code 0`; the read-only sentence. On `dA` the
   dependent row read the same skip. Focus dependencies in the Scene: the edge labelled
   `on exit 0`, the synthetic centre labelled `grouping only — not a supervisor`, both hub
   spokes marked grouping and dashed, one unrelated cube lensed out.
5. **A visual move dispatches nothing, and is undoable.** Moving the second island up changed
   `data-orch-island-order` (`B A dir` → `A B dir`) and the workspace record's
   `orchestrate.islands`, with spawns 4→4, lanes 3→3, sent user lines 5→5, PTY sessions 0→0.
   Undo move restored the order. Dispatching `Edit c` appended it at the END with the three
   before it in their previous order. (First run found the undo LOST when the page was left
   inside the 250 ms write window — the mount re-seeded from the record; fixed: the unmount
   flushes the pending write.)
6. **Controls by capability (M290).** An idle claude chat: no control buttons, and *Not
   available here: interrupt — nothing is generating…; retry — the last turn ended normally…;
   reassign — no runtime here can move a running session…; stop — no runtime here stops a
   session while reporting its surviving child processes…*. Waiting on a permission: one
   button, Interrupt, titled *stops the current generation in Edit a only — the process stays
   up, nothing it wrote is rolled back, and no resumable checkpoint is kept*. Clicked: the fake
   CLI ignored the control line and main killed it after 200 ms; the standing read
   **`interrupted — the last turn was cut short (the CLI ignored the interrupt and main killed
   the process); the conversation resumes on the next message`**, not stopped. Retry… then
   appeared and PREVIEWED: *To Edit a on claude*, the prompt `ask: list it`, the note; *Open on
   canvas with this prompt* left the page and put exactly that text in the chat's composer with
   the fake's user-line count unchanged (7 → 7 → 7): nothing sent.
7. **Limits and the three answers.** Four rows — Concurrency, Spend, Usage window, Time —
   every one `advisory` with nothing set (Spend `$0.40 · 3 sessions unknown`; Usage window `46%
   used` from the fixture's rate-limit event; Time `no time limit`). `agents.maxConcurrent` set
   to 2 → Concurrency `enforced · 0 of 2 turns in flight`, coverage naming that terminals and
   watchers are not counted. A chat that never sent: `Spend: Unknown — claude has reported
   nothing yet this launch`; one that had: `Spend: $0.13 reported by claude`; a killed session:
   `stopped — the session exited`.
8. **Commit and discard through the executors (M290.4).** On island A with HEAD still at the
   fork: Discard → `restored 1, removed 0`, `a.txt` back to the committed `a`. Then
   `A changed` written and committed from the strip: `committed 6dcde67427`, `rev-list --count`
   1 → 2, log top `edit a from the workbench`. A second commit drafted, the file changed under
   it before Commit: **`the changes moved since you read them — nothing was committed`**, count
   still 2 (main's `expect` re-check). Then Discard…: refused by name — *HEAD has moved past the
   point this review compares against (b894914f1b) — a commit was made since; restoring to that
   point would undo committed work in the tree, so discard from the review node on the canvas
   instead*; the tree untouched. (The first run's discard silently restored to the FORK point
   and undid the commit's content — that is what the gate now refuses.)

## Critic (fresh context)

**Round 1 (on ea5e1521 + the agents re-pin) REJECTED all three scenes** for two shared causes, and
accepted the subject binding's core with five gaps. Scenes: (1) with the shot fixture's loose
sessions the new island column opened as `2 ISLANDS` at the top-right and COVERED the `tests`
cube, its label and — in `orchestration-working` — its amber needs-you beacon and the `Needs
input · tests · terminal` callout, "the one thing this scene exists to show"; (2) the Run limits
values were truncated to illegibility (`Concurrency ADVISORY 1.`, `Usage window` wrapped with its
value gone). Also named: placement lines ellipsized mid-count; a seven-line "Not available here"
paragraph at the rest layer, rendered for a terminal too; the task card not saying `needs you`
for a terminal waiting without a permission (pre-existing — Phase A's card did the same; left).
Binding: no path found by which task X's diff renders under task Y's controls; the gaps were
(1) `openDiscard`/`runWrite` compared the closure's own key to itself (vacuous), so a late
answer could wipe another subject's in-progress draft; (2) `benchSubjectKey` omitted `chatId`,
so a lane-less task re-pointed at another chat kept the old chat's rows; (3) the `no-lane` /
`lane-missing` / `loading` arms carried no key, so one frame of the previous subject's sentence
could show; (4) the Checks identity map was keyed by base alone, so two lanes forked from one
commit could answer each other's freshness; (5) the pin froze a `BenchSubject`, so a task pinned
before its lane existed never read the lane. Two nits left as they are (recorded under Found /
deferred): the HEAD gate's sentence names the base of the read that opened the draft, and a
`no-lane` answer's ticket is minted like a result's.

Every finding but the nits was fixed in the commit after: the scene's column RESTS FOLDED (the
focused island's card at Phase A's size plus a `N islands ▾` toggle; the List shows it whole;
`orch-islands.app.1` pins the folded rest state), the limits rows put the value on its own
line, column cards may wrap their context line, the absence caption is a folded `<details>`,
the key carries the chat, every read arm carries a key, the identity map is keyed by
`cwd\0base` (and `bindCheckFreshness`'s callback now receives the cwd), the pin is a
descriptor re-derived each render, and the async writes compare against a ref and update only
their own draft.

**Rounds 2–5 (scenes only, one fresh subagent each).** Round 2 (on the folded column) REJECTED all
three: the folded card WRAPPED its context line (the column's wrap rule reached it), grew ~40 px,
and with the toggle under it re-covered the `tests` cube. Fixed: the rest state renders EXACTLY
Phase A's card plus a separate pill to its left (`display: contents` wrapper), and the pure/app
checks pin the folded rest state. Round 3 REJECTED all three for two new regressions: the Run
limits block in the System card made the bottom row taller and the whole diorama shrank to ~55%;
and the rest card's line appended `· 3 sess` and hard-clipped. Fixed: Run limits fold into the
side column as one line (`▶ Run limits · 0 enforced · 4 advisory`) and the rest card keeps Phase
A's exact line (the writer count rides its title and the amber tint; the column and the List keep
the count). Round 4 ACCEPTED `orchestration` and `orchestration-dark` and REJECTED
`orchestration-working`: Phase B's strip lifts the stage ~16 px, and at M284's top the card's
bottom edge (y≈332) now covered the `tests` beacon (≈y338 in the golden). Fixed: card 6 px higher,
line height 1.25 → 1.15. Round 5 ACCEPTED the two and REJECTED working NARROWLY — the beacon's
first row (y=323) touched the card's border (y=322). Fixed: card at the stage top, padding tightened
2 px, ≈6 px clear. Round 6's sentences are below.

## Gate

`npm run verify` on `37df4557` (2026-09-19 23:07–23:17, load 2–6, `/tmp/tc-electron-lock` taken,
the user's own app running from the main checkout, no verify Electron): **53/55 suites in 624 s**.
Every red is pre-existing and attributed by id — the same nine Phase A and B list, none new:

- `verify:panels:agents` — `detail.1` (`docs/build-log/m275-swarm-presets.md:107`).
- `verify:panels:product` — `workflow.edit.1`, `workflow.edit.2`, `workflow.lib.1`,
  `workflow.wire.1`, `workflow.inspect.1`, `workflow.save.1`, `workflow.panel.1e`, `reach.1`
  (`docs/build-log/m277-libraries.md:78`).

New reds: **none.** The same nine and no other on the two earlier full runs (`95309a16`,
`ea5e1521`+re-pin) as well. Every new check passed inside the gate: `orch-islands.1–.5`,
`orch-dep.1–.3`, `orch-limits.1–.4` (verify:orchestration 81/81), `orch-islands.app.1–.3`,
`orch-dep.app.1–.2`, `orch-limits.app.1–.3` beside the moved `orch-task.1–.7` and
`orch-bench.1–.4` (verify:panels:orchestrate 22/22); `verify:meta` 50/50 (the new part in the
chain with a measured watchdog, the README rows, `panels-split.2` finding every moved id);
`verify:rail labels.1` green after the dependency rows took titles. Headroom: core 76%, shell 80%,
kinds 79%, agents 79% of 116 s, product 73%, orchestrate 62% of 116 s — all under the 90% line.

The two commits after that gate (`61e5a409` and its predecessor) change `styles.css` only (the
task card's top and padding); on them `verify:styles` 76/76, `verify:orchestration` 81/81 and
`verify:panels:orchestrate` 22/22 (80.8 s) were rerun, and `npm run shot` + `verify:visual`
(62/66 — the three intended scenes, `starter` pre-existing) are what round 6 judged. A full gate
was not rerun for a CSS-only delta; the suites `npm run affected` names for it are the ones above.

Watchdogs: `verify:panels:orchestrate` pinned **116000** (green runs 92.1 s at load 7–11 and
81.9 s at load 7; 1.25×; later runs 81–82 s). `verify:panels:agents` re-pinned 168000 → **116000**
(92.6 s with the blocks moved out, against 101.6 s when it still carried them).

`verify:visual` (hand-run, warm): 62/66 on every run after the first — `orchestration` 9.6%,
`orchestration-dark` 8.7%, `orchestration-working` 10.7% moved ON PURPOSE (the strip's rest bar
is Phase B's; this phase adds the pill, the amber context line, the folded Run limits and
Not-available lines and, on the working scene, the shared-directory paragraph); `starter` is the
pre-existing red (`m279-ui-evolution.md:176`) and its golden is left alone. One cold run after a
build tripped the 221 s watchdog (Phase A's trap; the warm rerun is the reading).

### Goldens — NOT written

Per the run prompt: no golden was written, `UPDATE_GOLDENS=1` never ran. The three accepted fresh
captures (see Critic, round 6), for the user to copy after looking — never `starter`:

- `out/visual/orchestration.fresh.png` → `verify/visual/goldens/orchestration.png`
- `out/visual/orchestration-dark.fresh.png` → `verify/visual/goldens/orchestration-dark.png`
- `out/visual/orchestration-working.fresh.png` → `verify/visual/goldens/orchestration-working.png`

### Critic, round 6 (on 61e5a409), the critic's sentences, verbatim

- **orchestration** — "ACCEPT: every difference from the golden is one of the listed intended
  ones; the task card sits at y 271–318, the '2 islands ▾' pill covers only empty stage, and
  nothing is clipped."
- **orchestration-dark** — "ACCEPT: identical geometry to the light scene (card 271–318, pill at
  x≈778–846 / y≈272–290 over empty stage), all deltas intended, no clipping."
- **orchestration-working** — "ACCEPT: the amber beacon is no longer flush with the card — it
  starts at y=323 with 4 clear rows (319–322) beneath the card's bottom border at y=318; the
  card's three lines read cleanly at the tighter padding."

Critic's notes, kept: the clear gap measured 4 px, not the 6 predicted; the card is ~4–6 px
shorter and ~9 px higher than the golden's; the working scene's Live activity list is pushed
~100 px down by the task block and still ends inside the panel; the context line's amber tint
is new and deliberate (an ambiguous directory).

**Departures from the plan / prompt.** (1) The view, workbench and styles landed whole in the
m288 commit rather than split per milestone (recorded above). (2) The closing full gate ran on
`37df4557`; the two CSS-only commits after it were covered by the suites `affected` names plus
the part, the shot and the visual run, not by a fourth full gate. (3) Interrupt's honoured path
was demonstrated in plain node only (the harness CLI ignores the control line; see deferred).

## Found / deferred

Out of scope for Phase C by the run prompt, logged here if the run is tempted: dependency
editing, the Start task dialog and presets, layered 3D platforms, minimap, semantic zoom,
list/keyboard parity beyond what exists, Artifacts and Timeline tabs, PR/CI/deploy adapters.

Deferred, found while building (not Phase C):
- The HEAD gate on a lane discard judges `atHead.content` against the identity of the read that
  OPENED the draft; a Refresh landing during the await can make the refusal name an older base
  sha. Main's `expect` re-check still refuses a moved tree, so this is a wording nit.
- A `no-lane` / `lane-missing` answer mints a ticket like a result; harmless, since both arms
  now carry a key and the render guard covers them.
- The task card's `needs you` reads pending PERMISSIONS only (Phase A); a terminal in `wants-you`
  with no permission does not light it. Phase A's behaviour, kept; the roster and the Needs
  attention list already show it.
- Interrupt on the fake runner: the harness CLI ignores the control line, so every harness
  interrupt ends in main's 200 ms kill (`turn-aborted: interrupt-timeout`); the `interrupted`
  standing was therefore demonstrated on that path, and the CLI-honoured path (a `result` with
  `interrupted: true`) only in plain node (`orch-limits.3`).
- Reassign and Stop are ABSENT with reasons; the plan's "Stop task that reports surviving
  child processes" is runtime work (Phase E or later).
- The dependency lens reads the canvas's `automationResult` map, which is in-memory: after a
  relaunch a handoff that fired or was skipped before reads `unknown`/`pending` until the next
  event — Phase E's durable timeline is the owner.
- `verify:panels:orchestrate` still shares the Orchestrate checks between Phase A/B/C blocks in
  one part; at 82–92 s it has room, but the next Orchestrate phase should measure before adding.

Inherited from Phase A/B's deferred lists and still open here: Orchestrate text fields cannot take
a menu paste; prefs other than the persisted record are in memory; the palette over Orchestrate
returns to Canvas; Checks reads watchers off the canvas's panels only; the ledger keeps no output
bytes; the identity's uncovered inputs are named on the type; the harness composes its own engines.
