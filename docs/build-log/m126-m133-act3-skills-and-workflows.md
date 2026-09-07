# Act III — the shelf and the shape that runs (M126–M133): build log

Branch `m125-skills`, 2026-09-06 → 2026-09-07. Spec:
`docs/superpowers/specs/2026-09-06-m126-m133-skills-and-workflows-design.md`. Plan:
`docs/superpowers/plans/2026-09-06-m126-m133-skills-and-workflows.md`. One log for the act, a
section per milestone; two tracks (A: M126 → M131 in the main checkout, with M131 itself run in
a third worktree beside M130; B: M132 → M133 in a worktree subagent), integrated at the gate.

**The act was renumbered before this log was written.** The spec and plan were drafted as
M125–M132. While Act III was building, `main` shipped 3.0.0 and its README claimed M125 for the
reconcile — so two milestones held one number, which is the failure the scoped-check-id
convention exists to prevent, reached from the milestone side rather than the check side. Every
line that came from this act shifted one up (`9d96b37`), descending so nothing double-shifted,
and a line present verbatim in `main`'s version of the same file was left exactly where it was —
which is what kept Act II's M117–M124 references and main's own M125 rows pointing at what they
name. 347 lines across 70 files. Check ids are words (`shelf.1`, `editor.1d`), never numbers, so
none of them moved.

## M0, what was measured

- The CLI's `Skill` tool_use record, from a real `claude` transcript: a `tool_use` block named
  `Skill` whose `input.skill` is the bare name for a project or user skill and
  `<plugin>:<name>` for a plugin's. This is measurement 1 and the whole trail rests on it.
- `claude plugin list --json`: an array of objects with `id`, `installPath` and `enabled`. The
  `installPath` is what makes plugin skills affordable at all — `~/.claude/plugins` is 663 MB
  with ~700 `SKILL.md` files in it, and `docs/ideas-backlog.md` #26 had declined them for that
  reason. Bounded to the enabled plugins' own paths, the walk is ordinary.
- `verify:panels` on a green run of the merged HEAD: 311 s and 312 s (2026-09-06), against a
  480 s watchdog that had already killed a same-day green run under contention.

## M126 — the skill key and the shelf

### Red first

`verify:toolbox shelf.1`–`shelf.4` (the key, `placement`, the record rules) and
`verify:layout shelf.disk.1`–`.3` — all red at bundle time, no module. `ecc359f`, implemented
`621ca39`.

### Shape decisions worth recording

- **A skill's identity is `scope:name`, encoded `JSON.stringify([scope, name])`.** A bare name
  is ambiguous the moment the same skill exists in two scopes, and the pane's whole job is to
  show you that it does.
- **`placement` carries its WHY**, not just a column: `placed`, `by-plugin`, `by-scope`. A card
  that cannot say which authority put it there cannot be told apart from one the user arranged,
  and rearranging a derived column is a gesture with no effect.
- **The shelf is a top-level record beside `presets`/`teammates`/`templates`**, with the record
  rules — absent is every pre-M126 file, malformed is dropped by name, an empty shelf is ABSENT
  on disk rather than written as `{"columns":[]}`.

### Deviation from the plan

**`serialiseLayout` did not exist.** The plan named it as the place to decide "an empty record
is absent on disk"; `layout-schema.ts` had only `parseLayout`, and `layout-store.ts`'s `writeNow`
stringified the snapshot directly. It was added, and the store's single write routed through it —
which is now the one place that decision lives. Without the grep, `shelf.disk.3` would have been
written against a name that could never have been red for the right reason.

### Deviation from the spec

Spec §2.6 put the shelf's checks in `verify:palette`; they landed in `verify:toolbox`, beside
the inventory they place. Declared in the plan, accepted at the preflight scan.

## M127 — the Skills pane

### Red first

`verify:rail skills.1a`–`.1g` — the pane's columns, `Ungrouped` always present, a query matching
nothing saying so. `5c28dc8`, implemented `37eb2d0`.

### Shape decisions worth recording

- **The matcher is `palette/fuzzy.ts`'s, imported unchanged.** A second matcher would differ
  from the palette's exactly in the cases nobody tests.
- **Column order is: the user's placed columns, then the derived ones, then `Ungrouped` last and
  always.** A derived column with no cards after filtering is omitted (it is a projection, and an
  empty projection describes nothing); `Ungrouped` never is, because it is a real column that can
  be dropped into and cannot be deleted.
- **A shelf key with no file behind it KEEPS its slot** and renders `not installed — the shelf
  kept its slot`. A `git pull` that removed a skill does not get to edit the user's arrangement,
  and a slot that silently emptied would read as a column the app rearranged by itself.
- **Three states for the shelf, kept apart from the inventory's three.** An unread shelf and an
  empty shelf paint the same columns and need different sentences.

### Deviation from the plan

**`shelf:list` / `shelf:save` are their own channels** (EXPECTED_CHANNELS 111 → 113 at the time),
rather than riding `layout:save` the way per-workspace geometry does. Confirmed at review as the
established precedent: every other top-level record — templates, teammates, routines — owns its
invokes, because `layout:save` is per-workspace and a library is not.

Two one-line additions to the IPC diagrams in `README.md` and `CLAUDE.md` were made inside the
task rather than at the gate, because `verify:meta` 19 pins the README's diagram to the contract
and the chain cannot be green without them.

## M128 — the skill panel

### Red first

`verify:panels skill.panel.1a`–`.1e` and `verify:layout skill.panel.disk.1`. `4ce6f4d`,
implemented `a99cccc`.

### Shape decisions worth recording

- **The thirteenth kind holds `{scope, name}` and NOTHING else.** No copied description, body,
  resource count or token figure: the file is the authority, and a panel carrying a copy would
  show a description that stopped being true at the next `git pull`, with no way to tell.
- **A name defined in two scopes states the link and picks NO winner.** The app does not know
  which one the CLI would choose, and inventing a winner is worse than naming the ambiguity.
- **A plugin skill renders `claude plugin details` VERBATIM**, with a `readAt` and a refresh —
  parsed nowhere.

### Deviation from the plan

**`Open folder` goes through `link:open` on the skill's DIRECTORY (`shell.openPath`)**, not
`showItemInFolder` on the `SKILL.md`. There is no arbitrary-path reveal channel in this app and
adding one was outside the brief; the cost is Finder's file pre-selection, and the fix is one
channel later if it is ever wanted. Confirmed at review.

`openSkillPanel` stays on `EXCLUDED_ACTIONS` — it takes a world point, and a plan has no cursor.

## M129 — the editor

### Red first

`verify:toolbox edit.1`–`edit.5` (the frontmatter round-trip, containment, the atomic write, the
stale refusal) and `verify:panels editor.1a`–`.1d`. `642d0bc`, implemented `9d82bbe`.

### Shape decisions worth recording

- **Save never re-serialises frontmatter.** The metadata block is spliced, not rewritten, so a
  key this app's grammar does not know survives a save it had no business touching.
- **The stale write REFUSES and keeps your text.** A file changed under the editor is answered
  with a refusal naming it, never a silent overwrite and never a discarded draft.
- **Containment is `insidePlace` reused** (M100's), on the real, symlink-resolved path.
- **Three-state editability, never all-or-nothing:** an ungrammatical frontmatter block makes the
  metadata fields read-only WITH the reason on screen, and leaves the body editable underneath.

### What the checks caught

- **Quoted frontmatter values lost their quotes on every save** — the milestone's own failure
  mode, through a line the grammar DID read. Caught at review, fixed in round 1 (`3046ed7`).
- **The editor's `edit:paste` subscription served its own input without suppressing
  `Canvas.tsx`'s**, so `Cmd+V` pasted into the editor AND into the focused terminal's agent.
  This is the fourth text surface the `Cmd+C`/`Cmd+V`/`Cmd+Z` entry in `docs/load-bearing.md`
  predicted would inherit the problem, and the first to be fixed rather than documented.
- **A first-ever skill could not be created**: `realpath` threw on a missing `~/.claude/skills`
  and the door answered with the wrong refusal sentence. Upgraded from Minor to Important at the
  gate — §5.3's create door must work on a fresh machine — and fixed with one `mkdir` arm.

### Recorded bound

`parseFrontmatter` does not unescape quoted values. A description containing a literal `"` is
written escaped (correct for the CLI's YAML) and read back by this app with the backslashes
intact. Pre-existing, and load-bearing now that the editor round-trips through it.

## M130 — the trail

### Red first

`verify:file trail.1a`–`.1j` (the recorded fixture, the byte-offset resume, codex refused by
name) and `verify:panels trail.lane.1a`–`.1h`. `5dfe6ef` / `4e4aa5c`, implemented `291b0cf` /
`d2f1849`.

### Shape decisions worth recording

- **The trail is the CLI's own transcript, tailed from a byte offset** — never a second log this
  app writes. codex and an unresolvable session are refused BY NAME, before any other dependency
  is touched, which is what lets the checks drive partial fakes.
- **The lane is DERIVED and anchored.** No trail entry is in the panel array: the cards cost no
  LOD budget, write no record, and the only stored fact is the collapse.
- **The capsule never disappears.** `hide N skills` is always in the chrome once a trail exists,
  so a folded lane is visibly folded rather than gone.

### Deviations from the plan

- **The lane is culled on the scale-derived `cardDetail === 'tail'`, not on `assignTiers`' card
  tier.** Spec §6.2 said "far tier". A dormant or restored panel is CARDED at near scale, and its
  trail is exactly what the user wants to see there — culling on the LOD card tier would have
  hidden the trail on precisely the panels whose trail is the only thing left to read.
- **`WATCHDOG_MS` in `verify:panels` was raised 480 → 900 s, then settled at 600 s.** The review
  asked for a measured figure at ~1.25× a green run; the measured runs were 311 s and 312 s, and
  1.25× of those (390 s) sits UNDER an observed same-day flake that was killed at 480 s. 600 s
  was taken instead, with both figures and the reasoning in the comment. Splitting the suite
  stays owed.

### What the checks caught

- `readDelta` discarded `readFrom`'s size, so a shrunk or rotated transcript never reset the
  offset (`pty-manager.ts`'s `resetIfShrunk` is the precedent). Fixed.
- The `StringDecoder` multibyte-split path was untested — the fixture was ASCII, where a
  character split and a byte split are the same event. A multibyte record and a byte-level split
  check were added.
- `trail.1e` asserted only the cap and never `more`; then the gate review found `more` was wrong
  on EVERY read (see the fix wave, below).

## M131 — assignments

### Red first

`verify:teammates assign.1a`–`.1l4` — the brief append in main, the project-scope refusal naming
the repository. `f9f5dec`, implemented `789094e`, in a third worktree (`m130-assign`) run in
parallel with M130 because both touch `main/index.ts` and one worktree cannot hold two
implementers. Merged back at `31a0ff0`.

### Shape decisions worth recording

- **A shelf column reaches a teammate's brief through M100's ONE append site.** No second
  brief-writing path.
- **A project-scoped skill is refused by name, naming the repository** it belongs to.

### What the checks caught

**The Critical of the act.** `main/index.ts` passed the raw cwd to `skillsForBrief` as the
repo root — and for a chat dispatched by M113's board, that cwd is a `userData/worktrees` LANE,
not the repository. Project skills were therefore dropped silently for every dispatched
teammate, and no check exercised a lane cwd. Fixed by translating through the same
`worktreeRootOf` the Places gate uses (`137784a`).

Alongside it: the renderer's advisory `roughlyInside` could allow what main's `insidePlace`
refuses, and the drop at spawn was silent. `teammate:save` now computes the real verdict with
`insidePlace` and the pane renders `not visible to <teammate>` on the card — main's answer, never
the renderer's guess, and no new channel.

## M132 — workflow blocks and the pool

### Red first

`verify:layout workflow.1a`–`.1f` (three node kinds, a pre-M132 template untouched, an unknown
kind dropping its edges) and `verify:agent-session pool.1a`–`.1h`. `800f142` / `9c088fe`,
implemented `833cec7` / `04277a1`.

### Shape decisions worth recording

- **`pool`, `orchestrator` and `collect` are ARMS on the existing template-node union**, not a
  second graph format. A pre-M132 template loads untouched.
- **The pool reads M82's ceilings LIVE on every send**, uses M82's own queue with its own
  `reason`, and a budget crossing INTERRUPTS every worker and kills none — a killed agent loses
  its turn, and a budget is a stop.

### What the checks caught

- A re-entrancy window in the pump: a pump guarded off was DROPPED rather than deferred, so a
  worker could starve. Fixed by deferring it (`aba8963`).
- `pool.1f`'s kill claim was vacuous — it asserted against a literal rather than the run. Made
  real.
- At the gate: `stop()` or a budget crossing during an in-flight `createWorker` orphaned that
  worker. A worker minted into a stopped pool is now interrupted (`e458fbc`).
- `workflow.1b` compared the new parser against itself, with no pre-M132 literal. It could not be
  made red for the right reason afterwards either — the literal matches the current parser, which
  is exactly the point of pinning it.

### Known gap

**The pool has no production caller yet.** `pool-runner.ts` is reachable from the workflow
panel's Run only through a template that carries a `pool` block, and Run over such a template is
currently refused by name (below). The module is checked end to end against a fake runner and
nothing in the app spends money through it.

## M133 — the workflow panel

### Red first

`verify:layout workflow.panel.1a`–`.1d` and `verify:palette workflow.2a`–`.2b` — the diagram as a
projection, Runs filtered, a trigger round-tripping, Run reaching M80's instantiation. `bc0d0dd`,
implemented `25b38f0`.

### Shape decisions worth recording

- **The panel is a PROJECTION of the saved template record.** The live canvas is still the
  editor; the diagram draws what is stored and nothing it invented.
- **Runs come from M79 unchanged**, filtered to this template.
- **Run reaches M80's instantiation** — the one place a template becomes panels.

### Deviation, recorded as a cost

**A workflow trigger is a watcher whose command is `/usr/bin/true`.** Main's watch runner needs
a command, and the instantiation is the RENDERER's (M80's rule). So the watcher spawns a no-op
per fire and appends a ledger row naming `/usr/bin/true` with an exit code. Every renderer
readout reads the `templateId` mark instead and says the workflow's name; the ledger cost stays.
If a later milestone gives main a fire-only watcher arm, this is the line to remove.

### What the checks caught

- The Runs tab claimed "no runs" when it could not ATTRIBUTE runs — two different facts collapsed
  into one sentence. Now three-state.
- The fire path had no check at all; `workflow.panel.1f` now drives it end to end.
- A trigger fire on a PARAMETERISED template opened the spawn sheet — a scheduled fire asking a
  human for a parameter at 3 a.m. It is refused by name.
- At the gate: Run over a template holding workflow blocks minted a PARTIAL shape and said
  nothing (`templateRefusal` inspected terminal nodes only). Run is now disabled with
  `<key> is a pool block, which cannot run yet`.

## The gate: two final reviews and two fix waves

Each track got a fresh-context review of its whole diff, and each needed one fix wave.

**Track A** (`7cad2f9`, `0f77c0f`) — six findings:

- **`more` was wrong on every trail read.** `scanTrailChunk` pre-sliced at `TRAIL_MAX`, so the
  overflow was never counted, and the per-panel state stored only the capped entries, so `more`
  reset to 0 on the next poll. A session using more than 40 skills got no truncation notice at
  all.
- **`skill:create` / `skill:rename` / `skill:delete` had NO renderer door**, so `renameInShelf`
  had no production caller. Spec §5.3 describes all three as user-facing; the plan's Task 6 named
  only the writers. Ruled: WIRE the doors rather than declare a deferral — New on the pane per
  scope root, Rename and Delete on the skill panel with the confirm naming the resource count,
  and a rename carrying its shelf slot (`editor.2a`–`.2c`).
- `deleteSkill` accepted a skills ROOT itself; it now refuses one.
- `shelf.list` / `shelf.save` had no `.catch`, and the `verify:panels` harness palette lacked
  `shelf`/`saveShelf` — so every harness boot logged `palette.shelf is not a function` and every
  check that ran with an "empty" shelf was passing against a shelf that had FAILED TO LOAD.
- The `EXPECTED_CHANNELS` ledger comment did not name the new channels.
- `plugin:details` did not check its id against the enabled list. It now does — except when
  `listPlugins` is `unknown`, where the id passes through, because refusing every id on a
  CLI-less machine would be worse.

Then `0f77c0f`, which was not a code fix at all: `editor.2` was driving synthesised controls. See
the harness facts below.

**Track B** (`e458fbc`) — four Important plus two fix-before-merge minors, listed under M132 and
M133 above.

Both re-reviews came back with no new Critical or Important.

## The merges

Two, both into `m125-skills`, both recorded in full in
`.superpowers/sdd/2026-09-06-m125-m132-skills-and-workflows/merge-report.md`.

`247172c` — `main` at 7ae607a (Act II's M117–M124 plus the 3.0.0 ship). Fifteen conflicted
files, every one a keep-both of two independently appended blocks. `EXPECTED_CHANNELS` became
**120** (main's 112 plus this act's 8).

`c219126` — `m131-workflow` at e458fbc. Seventeen conflicted files, all the predicted same-line
collisions between the thirteenth kind (`skill`) and the fourteenth (`workflow`).

**Seven closers were lost at keep-both markers across the two merges** — Act I's lesson, twice
more — each silent until `tsc` or `node --check`: `main/index.ts`, `scripts/verify-layout.cjs`
(twice), `src/shared/layout-schema.ts` (twice), `src/renderer/panels/panels.ts` (twice),
`src/renderer/shell/inspector-fields.ts`, `src/renderer/canvas/Canvas.tsx`,
`scripts/verify-agent-session.cjs`. All fixed inside the merge commits.

One behaviour question was answered without a code change: Act II added copilot and ACP
backends, and `trailFor` already refuses a non-claude backend by name, while `BACKENDS` still
gives `terminalDoor: true` to claude alone. No terminal in this app can run copilot or ACP today,
and if one ever can the refusal is already written.

## The shot scenes

Spec §9 asked for `skills`, `trail` and `workflow`. Track A produced `trail`, Track B produced
`workflow`, and the plan's Task 4 never asked for a `skills` scene — the gap was recorded at the
gate and closed there (`781b8e7`). Adding it needed three harness facts, each a silent failure on
its own: `TC_TOOLBOX_HOME` fenced by `shot.cjs` itself rather than by the entry's throwaway temp
dir (unfenced, the scene paints the running developer's own `~/.claude`); `shelf`/`saveShelf` on
the harness palette (the same omission the Track A fix wave found in `verify:panels`); and a
plugin list answering for a fixture plugin, whose skill directories are named `documents:docx`
the way the CLI names them, because a plugin column derives from the NAME and never from the
`pluginId` stamp.

The scene records what it cannot show: the navigator is a fixed 300px, `.skills-pane__column`
asks for 14rem, and the heading's `Assign to teammate…` select and `Delete` do not shrink, so a
column renders ~326px — wider than the pane it scrolls inside. No frame holds two columns.

## The numbers

Full `TC_VERIFY_SUFFIX=m125 npm run verify`, exit 0, on the merged HEAD:

meta 34/34 · styles 32/32 · viewport 134/134 · groups 6/6 · merged 12/12 · registry 37/37 ·
layout 228/228 · credentials 18/18 · jira 15/15 · github 7/7 · palette 140/140 · rail 172/172 ·
review 98/98 · subagent 27/27 · file 75/75 · toolbox 101/101 · usage 26/26 · machine-cost 7/7 ·
tmux 35/35 · agent-state 27/27 · agent-session 134/134 · verbs 13/13 · teammates 25/25 ·
electron 4/4 · control 15/15 · package 13/13 · pty 10/10 · pty-manager 63/63 · window 4/4 ·
ipc 1/1 · canvas 6/6 · xterm 9/9 · panels 338/338.

`EXPECTED_CHANNELS` is **120**. The eight this act added: `shelf:list`, `shelf:save`,
`plugin:details`, `skill:create`, `skill:rename`, `skill:delete`, `skill:write`, `skill:trail`.
Track B added none.

## Owed hand checks

Spec §12's five, unchanged:

1. **The trail against a real agent.** Run a real `claude` in a terminal panel, invoke two
   skills, confirm the lane shows both in order. Every check drives a recorded fixture, and a
   change to how the CLI writes a `Skill` tool_use reads as an empty trail, not an error.
2. **`claude plugin list --json` on another machine and another version.** Measured once. The
   `unknown` arm is what protects the pane; the shape is pinned by nothing but §2.6's fixture.
3. **A pool of N against a real budget**, with `agents.budgetUsd` set deliberately low.
4. **A saved `SKILL.md` still loading in the CLI.** `edit.1` proves the bytes round-trip; no
   suite in this repository runs a skill.
5. **`shell.trashItem` on this machine.** Electron's, unreachable from plain node;
   `verify:toolbox` drives an injected `trash` dep.

The two final reviews added seven more:

6. **The >40-skill truncation notice**, on a real session that used more than `TRAIL_MAX` skills.
   The `more` bug means no run before the fix wave ever produced one.
7. **A first-ever skill created on a machine with no `~/.claude/skills`** — the `mkdir` arm, on a
   genuinely fresh home rather than a fixture.
8. **A rename into an OCCUPIED shelf slot**, and what the column looks like afterwards.
9. **The pool against a real `AgentSessionManager`** — `pool.1` drives a fake runner and a fake
   limits dep, and the module has no production caller (see M132's known gap).
10. **`--append-system-prompt` surviving an orchestrator RESUME.** The CLI keeps no record of it,
    so a resumed orchestrator without it stops being one — M81's supervisor rule, unverified for
    this block kind.
11. **A `collect` join against real workers**, rather than the recorded shape.
12. **A workflow watcher ARMED for real**, firing on its own schedule, including what the ledger
    row naming `/usr/bin/true` looks like beside it.

Add these to the manual-only list at the end of `docs/load-bearing.md`; a green
`npm run verify` is silent on all twelve.

## Deferred minors, by file

Real, reviewed, and parked with nothing downstream of them.

- `src/shared/workflow-nodes.ts` — coerces a non-string `cwd` with `String()` where its siblings
  use `typeof` checks.
- `src/renderer/shell/skills-pane-model.ts` — `NOT_A_SKILL`'s sentence is false for a skill entry
  that has no resources figure; the reason should split.
- `src/main/index.ts` — `saveShelf` discards `parseShelf`'s warnings, where `saveTeammate` throws
  with them.
- `src/renderer/canvas/Canvas.tsx` — `EMPTY_SHELF`/`carryOneColumn` are declared mid-import-block;
  `onDrop`'s deps are still `[dropPath]` while the body reads `palette.isOpen()` (a stable ref
  today); `skillSources` consults terminal/chat/toolbox only, so a watcher's cwd is absent from
  "Available in" and the comment should say so; `Start a chat` seeds only the bare name; one
  `toolbox.read` per distinct cwd per skill panel on every panel-array change (unmeasured).
- `src/shared/layout-schema.ts` — warns `skill.name was not a string` when the whole skill record
  is absent.
- `src/main/skill-write.ts` — `deleteSkill`/`renameSkill` accept a skills root itself
  (`insidePlace` is true for `real === place`; no UI door reaches it and the trash is
  recoverable); requiring `dirname(dir) ∈ skillRoots` is the real fix.
- `src/main/file-read.ts` — `ReadStamp` pairs a pre-read size with a post-read mtime
  (pre-existing shape); `mtimeMs === 0` on a vanished file reads as stale rather than missing.
- `src/renderer/skills/SkillEditor.tsx` — `splitDraft` is a third copy of `KEY_LINE`.
- `src/renderer/skills/SkillTrailLane.tsx` — `cwd === null` leaves cards at `reading the
  inventory…` forever; the idle subscription fires for chat panels too (a wasted main read);
  `trailAskedRef` is never pruned after `restartWithSpec`; a fixed 44px card-height assumption
  for the open point; `aria-hidden` on the note lane only.
- `src/renderer/shell/SkillsPane.tsx` — `ShelfState`'s `pending` and `loaded` arms render
  identically; `deleteConfirmText` treats `resources === undefined` like `none` (the door is
  already blocked by `REASON_NO_SOURCE`).
- `src/shared/teammates.ts` — `parseTeammates` drops the whole `skills` array when one entry is
  not a string (matching `services`/`chats`' pre-existing whole-field pattern, not `places`'
  per-entry one).
- `src/shared/runs.ts` — `parseRuns` drops a malformed `templateId` silently, where `parseWatch`
  warns.
- `src/renderer/workflow/WorkflowNode.tsx` — `originRef` is cleared only in `forgetOpen`, not at
  the panel-removing sites; `openWorkflowPanel` returns silently when merged and the palette row
  has no named reason; `instantiateCountRef` counts entries rather than instantiations, and
  `__m133Instantiations` counts attempts rather than mints; the watcher FIRE path on a template
  holding a block fires and `instantiateTemplate` refuses silently, so Triggers stays enabled on
  a blocked workflow (`workflowFireRefusal`'s slot is the fix).
- `scripts/verify-toolbox.cjs` — `skill.1c`'s locked fixture fails loudly if the suite runs as
  root, and a comment would say so; a bare sibling FILE beside `SKILL.md` contributes 1 through
  `listDir`'s `ENOTDIR` arm, exercised by no fixture.
- `scripts/verify-file.cjs` — the `at` fallback for a timestamp-less trail record is untested;
  `TrailUnreadable` is an open string (the spec allows it).
- `scripts/verify-panels.cjs` — it now runs the REAL skill writers, fenced by `TC_TOOLBOX_HOME`;
  a guard at suite start asserting that the variable is SET is owed. The suite is ~338 checks and
  its split remains owed (see M130's watchdog note).
