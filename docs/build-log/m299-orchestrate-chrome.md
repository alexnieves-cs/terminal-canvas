# M299 — Orchestrate chrome pass: header, tiles, the two side cards, the workbench

The state of this pass lives here. Brief: the user's "Orchestrate chrome pass: header,
decisions, selected-agent card, workbench" (2026-09-20), pasted into the session, not a file in
the tree. The previous ledger is [M298](m298-orchestrate-fit.md), whose closing line named the
chrome as the dominant fact about the scene's size ("the panel is 224 px tall because of the
chrome around it … the chrome pass's, not the fit's"). The target is
`docs/design/orchestrate-preview.png`; `docs/design-reference.png` is the older art direction.

- Branch `m299-orchestrate-chrome`, worktree `.claude/worktrees/m299-orchestrate-chrome`, off
  local main `1d0de031` (M298's merge). Main's uncommitted edits are another session's and are
  not on this branch.
- Numbering: the Phase E run prompt reserves M294–M296, M297 is the critic reference, M298 the
  fit pass; `M299` was the next free number on 2026-09-20 (no hit in `docs/build-log`, none in
  branches).
- Chrome only: the frame around the scene. `orchestration-platforms.ts`, `orchestration-depth.ts`
  and the scene inside `.orch__graph-wrap` are untouched — what the scene gained, it gained
  from the room the chrome gave back.

## 0. Before

`npm run build` then `SHOT_DIR=<scratch> npm run shot` on `1d0de031`, scenes `orchestration`,
`orchestration-dark`, `orchestration-working`, read against the preview. The brief's diagnosis
held in every particular: ~80 px above the tiles with `LOCAL` and `VIEW OPEN` at the right;
uppercase tile labels with an underline bar and `0 idle` / `0 Clear` at rest; a right column
that read as a text dump (the shared-directory paragraph in amber, `RUN LIMITS`, `BRIEF &
ACCEPTANCE CRITERIA · NONE YET`, `NOT AVAILABLE HERE · INTERRUPT, RETRY, REASSIGN, STOP`); five
bottom tiles, Terminal saying `select an agent in the pool or graph to jump to it`, and the
workbench a one-line strip under them. Scene panel at the check's three windows (M298's
table): default 536×224, narrow 812×224, wide 1128×649.

## 1. What each change replaces, and why the recorded decision no longer holds

Read first: `npm run lb -- OrchestrationView` (two entries: hit order, quality tier — neither
about the chrome), `-- OrchWorkbench` (the ticketed read — kept whole), and the four ledgers.

| Change | The recorded decision it replaces | Why it no longer holds |
|---|---|---|
| **Header: title row** (`Orchestrate / <workspace>` + the focused island's goal · repository · branch · placement) replaces the greeting and the two clocks. | M269's HUD put a wall clock and a view-open timer at the right, and the page "opens on the one line that is about NOW" (the greeting, with its task count). | The menu bar has the clock; how long the page has been open is not a fact about the work; the greeting's task count is the second tile's. The title row carries what the preview's does — the page, its scope, the task's context — from the real island (`orchPlacementLine`), and nothing when there is no island. The shot mask that hid the three live values (`shot-orch-mask`) now hides nothing and says so. |
| **Tiles: mixed case, one action each, quiet at zero.** | M269's tiles: uppercase label, count, a state word (`working` / `idle` / `Clear`), an underline bar; the click applies the lens (`applyMetric`). | `Watchers 0 idle` is a zero-value statement at rest (product rule). Each tile keeps its count and its lens click and gains its action word: `View agents`, `Review changes` (when a review subject exists — the click also opens the workbench on Changes) else `View tasks`, `View watchers`, `Inspect` (the click also selects the first waiting row). At zero: `data-empty`, a dimmed count, no action, no state word. The four counts stay the model's (`Ready to review · Running · Queued` is the preview's sample vocabulary, not copied — `docs/product-rules.md`). |
| **Side column: Needs attention** — a dot, the title, the reason, the action. | M284's rows (title, `wants to use <tool>` / `is waiting on you`, Allow / Deny / Open on canvas), answered here through the one executor. | Kept whole — the identity, the sent-set, the double-answer guard, every `data-orch-needs-*` hook. The row gains the dot and the head says `N decisions`. |
| **Run limits: one quiet row.** | M288 (critic round 3): "Run limits fold into the side column as one line (`▶ Run limits · 0 enforced · 4 advisory`)". | Kept as a folded `<details>` with the same words and `data-orch-limits`; only the summary's face changes (mixed case, `--quiet`). The M290 facts inside — enforced vs advisory, coverage, Unknown spend — are unchanged. |
| **The selected-agent card**: glyph tile, name, role line (state · kind · backend), `Selected` chip; the task it is in (goal + placement); a status box (Next, the chat's phase, standing, spend, dependency block); acceptance criteria as rows; `Inspect checks · Open on canvas · Review changes` + the M290 controls; the follow-up composer. | M284's inspector (identity, state, next action), M290's standing/spend/controls/absence fold, M289's dependency section. | Re-shaped, not re-decided: every `data-orch-inspector*`, `data-orch-next`, `data-orch-standing`, `data-orch-spend`, `data-orch-controls`, `data-orch-control-absent`, `data-orch-dep-*` hook keeps its element and its text; the absence fold keeps its words and loses its capitals. The backend on the role line is the registry's id (`backendOf`), never a display name invented here. The criteria rows carry a neutral ring, not a tick — no criterion has a verdict (the preview's ticks are not copied). |
| **Acceptance criteria as rows; the brief editor FOLDED at rest.** | M287: the brief editor "open only when something is written: two textareas at rest pushed the inspector's Activity feed out of frame (the critic)". | The rows now show what is written, so the open textareas would repeat it; the editor folds always and its summary says `Brief & acceptance criteria · none yet` or `Edit brief & acceptance criteria`. `workbench.2`'s rules (patch door only, save on blur, named inputs) are unchanged — the check's slice of the editor still reads only the editor, which is why the two new components sit ABOVE it in the file. |
| **The shared-directory line is one line**, the whole sentence on its `title`. | M288: the ambiguity paragraph in amber under the island card. | The critic's "long amber paragraph". The count and `cannot be attributed to this task alone` stay in the text (`orch-islands.app.*` reads both); the path and the island count are on the title. |
| **Mark done** on the island card. | M282: the Current task tile's `Mark done`. | The tile is gone; the verb moves to the island's actions with the same `USER_SET_STATES` guard. |
| **The follow-up composer** (`OrchFollowUp`): one line to the selected CHAT through `onSend`, which the canvas wires to the chat composer's own send door and reads with the one sentence-maker (`sendRefusalSentence`). | M290: "Nothing on this page sends a message" (the retry exit inserts, unsent). | The brief asks for a composer on the real send path. Retry still never sends; the page's one send is this prop, and the VIEW spells no send of its own (`orch-limits.4` pins `agentSession.send` absent from the view — the door is the canvas's). Rendered only for a chat and only when the prop is given: a dead input is a promise the page cannot keep. The menu's Paste reaches it by `edit:paste` while it has focus, as `Palette.tsx` does (CLAUDE.md's gotcha). The draft clears only on an accepted send; a refusal is shown beside the field in main's sentence. |
| **No bottom row.** M282's five tiles (System, Current task, Terminal, Code, Files) are gone. | M282: jump cards under the scene; M269's System card with CPU/memory sparklines and the per-panel compute bars. | Where each fact lives now, by layer — CPU/memory (deep detail): the shell's machine chart (`shell/MachineChart.tsx`), `orchMachineReadout` stays a pure model function under `verify:orchestration`; the per-panel compute bars: gone (deep detail with no reader — a selected session's cost was the inspector's, and it is not a rest fact). Current task (rest + contextual): the island card in the scene and the inspector's task block; its stage buttons: the Dev/Pipeline toggle and the List. Terminal (deep detail): the workbench's Output tab, the same `useOrchOutput` tail; the chat's phase line moved to the card's status box. Code (inspector): the artifact arm of the inspector (M291) and the Files side tab; Files: the Files side tab and `Open files`. `SelectedChatPhase` stays (its `found.label` is read through `outward`, `orch.phase.3`). |
| **The workbench rests OPEN, at 200 px.** | M287 (critic): "the strip rests closed" — `open` absent in the persisted record meant closed, and the renderer's default was closed. | That critic saw the strip under five tiles; the tiles are gone. Absent now reads OPEN and only a collapse is written (`open: false`); a pre-M299 `open: true` still parses. `verify:layout orchestrate.1` re-pinned (a `closed` case added; `notOpened` and `full` still absent), `orch-bench.1` re-pinned (open at rest, ≥ 180 px, the record carries no `open` key after a resize). The height is 200, not M287's 240, because of the wide window (section 2). Nothing is read while collapsed, as before. |
| **A `never-started` read is asked again.** | M288: one ticketed read per subject per refresh. | New consequence of the open rest: a session is read the moment it is selected, often before main has captured its baseline, and `never-started` then stayed on screen until a Refresh (`orch-bench.4` measured it: the plain-folder chat read `never-started` where `not-a-repo` was expected). `useChanges` re-asks a `never-started` answer up to six times, 1.5 s apart, each with its own ticket under the same subject rule. |

## 2. The scene's room — measured before and after

The instrument is M298's own `orch-fit.app.1` (five fixtures × three windows, Fit all, the
scene panel's box and the composition's share of it), unchanged except for its predicate
(below). The scene panel, CSS px:

| window | before (M298) | after, workbench 240 | after, workbench 200 |
|---|---|---|---|
| default 1200×800 | 536×224 | 536×314 (first paint 330) | 536×354 (first paint 370) |
| narrow 1100×720 | 812×224 | 812×224 | 812×224 |
| wide 1900×1100 | 1128×649 | 1128×614 | 1128×654 (first paint 670) |

At 200 the default panel is 130 px taller than under the tiles (+58%); the narrow one is still
`.orch__graph-wrap`'s `min-height: 14rem`, now because of the header and the open strip rather
than the tiles; and the wide one is 5 px taller. At 240 the wide panel had LOST 35 px against
M298's tiles-plus-closed-strip — the brief's "without shrinking the scene" — which is why the
resting height is 200 and not M287's 240. (The first-paint rows are 16 px taller still: the
`blocker` line under the tiles is not yet painted.)

**Fill** (run at 200, `orch-fit.app.1`'s rows). With a taller default panel the composition of
four or more platforms is bound by the scene's WIDTH (the 400 px left of the 8.5rem rail)
before its height: at 4 platforms `compW` is 0.70 of the wrap = 0.94 of the scene, and `compH`
0.505 of the 354 px panel = 179 px — the same 179 px the height-bound fit gave in the 224 px
panel (0.80). Two platforms use the height: compH 0.76 of 354 = 269 px against M298's 0.90 of
224 = 202. A lone platform reaches the wheel's zoom ceiling first: compH 0.567 of 370 = 210 px
against 179 before, on neither axis. So `orch-fit.app.1` pins the fit's own rule where it
pinned the height alone — bound on ONE axis (≥ 60% of the panel's height or ≥ 90% of the
scene's width), or, for a lone platform, no fewer pixels than M298 measured (179); nothing
clips and no tool covers a plate at any of the fifteen cells. Label clearance is the fit's
pixel margins (M298), unchanged.

`orch-zoom.app.1` zooms out 30 notches from the rest camera instead of 14: the rest camera fits
a taller panel (2 platforms at k about a third larger), so 14 notches no longer reached the
far level; the floor clamps the rest.

## 3. Checks

- `verify:orchestration` 94/94 — `orch.phase.3`, `workbench.2` and `orch-limits.4` went red
  during the pass and each was a real signal: the phase line had been deleted with the Terminal
  tile (restored into the card), the two new components sat inside `workbench.2`'s slice of the
  editor (moved above it), and a comment spelled `agentSession.send` in the view (reworded; the
  door is the canvas's).
- `verify:layout` 271/271 (`orchestrate.1` re-pinned), `verify:styles` 76/76 (two of its rules
  caught a `2px` literal and a state-named tone selector in the new CSS — both fixed to tokens),
  `verify:meta` 51/51.
- `verify:panels:orchestrate` — first run with the chrome in: 24/29, the five reds all this
  pass's: `orch-bench.1` (the rest-state pin), `orch-bench.4` (the `never-started` read),
  `orch-fit.app.1` (the height-only fill pin), `orch-zoom.app.1` (14 notches), and
  `orch-parity.app.3` (transitions seen under reduced motion). Second run, with the re-ask, the
  200 px rest and the `orch-bench.1` re-pin: 27/29 — `orch-bench.4` and `orch-parity.app.3`
  green (the latter unchanged: a timing flake of that run), `orch-zoom.app.1` reached the far
  level but its mid step, eight notches in from the FLOOR, no longer reached `stations`, and
  `orch-fit.app.1`'s lone platform met neither axis (the zoom ceiling). Third run, with mid and
  near measured from the rest camera and the lone platform's pixel floor: **29/29 in 119.2 s of
  the 180 s watchdog (66%)** — no re-pin needed.

## Gate

`npm run affected` on the closing tree (2026-09-20, load ~5, `/tmp/tc-electron-lock` taken):
**42/44 suites in 674.9 s** — plain tier green whole (`verify:rail` went red once for the two
empty-state ids the tiles had rendered: `orch-selected` is dropped, `orch-task` is now the
inspector's own no-selection sentence, and `orch.empty.1` still finds it), then
`verify:panels:orchestrate` 29/29, and the two reds are the known nine by id, none new:
`verify:panels:agents` — `detail.1`; `verify:panels:product` — the seven `workflow.*` and
`reach.1`. `npm run affected` says on every run that it is not the gate.

## 4. Goldens — NOT written

`UPDATE_GOLDENS=1` never ran. The three fresh captures and their `.vs-reference.png` composites
are in the session's scratch directory; the critic's round and the goldens are owed per scene,
after a person looks — the `orchestration*` goldens were already owed by M294, M297 and M298.

## Found / deferred

- The `2 islands ▾` pill (M288's folded column toggle) sits under the rail's `All work` crumb at
  the default window in every capture, before and after this pass — the rail is M298's and the
  toggle M288's; neither moved here.
- The narrow window's 224 px is now the header's and the open strip's, not the tiles'; a person
  who collapses the strip there gets the room back, and the collapse is the one state the
  record writes.
- The Files side tab and the Output tab now carry what the Code/Files/Terminal tiles showed; the
  side column's Activity feed scrolls under the card at the default window (it did under the
  tiles' row too).
