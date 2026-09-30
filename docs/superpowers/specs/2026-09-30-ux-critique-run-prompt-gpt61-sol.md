# Run prompt — Make the daily loop feel obvious (for GPT 6.1 Sol)

> Paste everything below the line into a fresh GPT 6.1 Sol session (Codex CLI) at the repo root.
> Written 2026-09-30 from a live critique of HEAD `6362a94e`. Four critics drove the real app
> and two adversarial verifiers tried to disprove what they found. Every finding below survived
> that check, and the severities are the verifiers' corrected ones. The claims that were
> refuted are listed too, so you don't "fix" them.
> The driver used for the critique is in `docs/superpowers/specs/2026-09-30-ux-critique-drive/`.

---

You are the design lead and engineer for one run on **terminal-canvas**
(`/Users/alexnieves/Documents/terminal-canvas`). It is an Electron app for macOS: an infinite
canvas of agents, terminals, files, notes, previews and workflows. Its core job, in its own
words, is to *move a meaningful task from intention to reviewed result while the person keeps
control and understanding.*

The app works. A real task goes end to end: describe it → pick a repo → an agent works on its
own branch → review the diff → Accept → Merge. The problem is everything around that path.
Some surfaces are loud but rarely used, some are constantly needed but hard to find, and
overlays sit on top of the work. There are two different forms for the same verb, one Markdown
editor that is broken, and about 45 surfaces where a solo developer uses about 10. This run
makes the daily loop feel obvious and physical **without deleting capability**.

## Read these first — this repo punishes skipping them

1. `AGENTS.md` (short), then `CLAUDE.md`. CLAUDE.md is the index, and it wins any
   disagreement. Its rules exist because the obvious version fails **silently**.
2. `docs/product-rules.md`: the rest/face/path/metrics rules, density layers, the pill, and
   goldens with their critic. Every UI change in this run touches these.
3. `src/renderer/CLAUDE.md` (library doors) and `src/renderer/canvas/CLAUDE.md` (layering,
   hook order). Also `src/main/CLAUDE.md` if you touch main.
4. Before changing ANY module, run `npm run lb -- <module>`. It prints every load-bearing entry
   that names it. Entries are written from the cause, so search by module, never by symptom.
   Never read `docs/load-bearing.md` whole.
5. The newest ledger linked from CLAUDE.md (`docs/build-log/m388-m396-ledger.md`) and
   `docs/build-log/` for the latest milestone number. **M396 was the latest on 2026-09-30.**
   Start at the next free number and check again first, because parallel sessions have
   collided on milestone numbers before.

## Hard boundaries

- **Never push to `origin`, never create a remote object** (no PRs, releases or gists), and
  never modify anything outside this repository, except scratch under `/tmp` (app
  instances `/tmp/tcc-N`, `/tmp/tc-electron-lock`, a throwaway fixture repo) and the test
  app's own window position and size. Work on a branch or worktree named
  `m<N>-daily-loop`. Merge to local `main` only at the end, and only when (1)
  `npm run verify` shows no reds beyond the baseline recorded in the latest build log, (2)
  every golden you changed has its critic sentence in the ledger, and (3) the ledger's last
  section says what landed and what didn't. Otherwise leave the branch unmerged and say why.
- **Commit at the end of every milestone, and write the ledger before you start the next.**
  A previous GPT run in this repo hit its usage window mid-milestone with *nothing committed*,
  and the whole run was lost. Small, complete commits are your insurance.
  `feat(mNNN): …` / `fix(mNNN): …`. End each commit message with the trailer `Model: GPT 6.1 Sol`.
- **Demote, never delete.** The README is a roadmap contract: modules are shaped for
  milestones that have not landed. Hiding a surface from the default view is fine. Removing
  its *door* is not. Every verb must still be reachable by a canvas gesture, a palette row, an
  agent line and a workflow node (`V9_DOORS`, `verify:verbs closure.v9.1`).
- **Copy may be renamed. Code identifiers may not.** The vocabulary is a model: project,
  workspace and task stay distinct; teammate/chat/session stay distinct; a `note` is a
  Markdown FILE only. You may change what the UI *says*. You may not rename types, DOM aliases
  (`.panel__*`, `*-node__*`, about 200 checks select them) or persisted keys.
- **Persistence:** `src/shared/layout-schema/`. Old layouts must still load. An absent key is
  not a malformed one, and a malformed field costs only that field.
- **Scope override.** AGENTS.md asks for minimal, targeted changes. For this run, the finding
  IDs below ARE the scope: each fix may be as large as its finding needs, but nothing outside a
  listed ID (no unrelated cleanup, no drive-by refactors).
- **Stop and ask the user** only if a change would (1) break the persistence format for
  existing layouts, (2) add a new outward (network or export) door, or (3) require deleting a
  door the four-doors rule protects. Everything else: decide, record the decision in the
  ledger, continue.

## How to see the app (do this before designing anything)

The critique drove the **real built app** over the Chrome DevTools Protocol. Do the same. The
static goldens are not enough, because several bugs below are invisible in them.

```sh
npm run build
D=docs/superpowers/specs/2026-09-30-ux-critique-drive
$D/launch.sh 1          # real app, fenced userData (/tmp/tcc-1) + own tmux socket, CDP :9210
node $D/drive.cjs 9210 ui            # every visible control: "x,y tag class | label"
node $D/drive.cjs 9210 shot /tmp/a.png   # PNG is 2x DPR — halve pixel coords to click
node $D/drive.cjs 9210 click 306 28  # real mouse; also: key Meta+k, type …, drag, wheel, eval, text
$D/stop.sh 1
```

Traps the critique hit, so you don't rediscover them:
- **HOME is not fenced.** A spawned `claude` reads the person's own `~/.claude/settings.json`,
  including a permission mode and allow rules. An agent that "never asked permission" may be
  obeying that file, not the app. The notes folder setting can also point into the real home.
  Check both before calling an agent's behaviour the app's.
- The window must stay frontmost. A covered window goes `hidden` and wheel events hang. Resize
  with `osascript` (System Events) by the pid in `/tmp/tcc-<slot>/pid`. Pinch through CDP can
  hang, so use the HUD zoom buttons.
- `⌘Z`/`⌘C`/`⌘V` arrive through the app **menu** as `edit:*` IPC, not keydown. Test undo with
  the app frontmost and the canvas focused (this was a false "undo is broken" in the critique).
- This machine has 16 GB of memory. Run **at most two** app instances at once, and only one
  Electron verify tier at a time (`pgrep` for strays; take `/tmp/tc-electron-lock`).
- Don't run real agent tasks except to verify the core loop, and keep those tiny, in a
  throwaway repo under `/tmp`.

**Reproduce each finding before you fix it**, and screenshot before and after. If you can't
reproduce one, record that in the ledger and skip it. Don't fix from this document alone.

## The findings (verified)

IDs are stable; use them in commits and the ledger. **P0** breaks a named object kind. **P1**
is hit in every session or blocks a first-timer. **P2** is friction. **P3** is polish.

### Wave A — Correctness (do first; each is small and independently landable)

- **A1 · P0 · Markdown notes have a 0px editor.** In every note (the starter note, ⌘K › New
  note, and a `.md` file panel in edit mode) `.file-node__editor` and its host measure 0px and
  Monaco 2.8px. Nothing paints and a click can't focus it; Rich mode still works. Cause:
  `.file-node__editor { flex: 1; min-height: 0 }` (`src/renderer/styles.css` ~4562) sits
  inside `.pf__body--text` (~3183), which is `display: block`, while the Monaco host is
  absolutely positioned. This is a **regression from M276 (d1dc93bd)**. The `starter` golden
  has been left red since M294–M299 as "the harness could not paint it", and that red was this
  bug. The verify checks type through helpers and never measure height, so they stay green.
  **Fix it, and add a check that measures the editor host height > 0 after a note opens**
  (scoped id, e.g. `note.editor.height.1`).
- **A2 · P1 · The `starter` golden publishes the developer's own `~/.claude`.** Its inspector
  shows the author's real skills, hooks and "628 allow" rules. `shot.cjs:45–53` fences the
  *home* arm (`TC_TOOLBOX_HOME`), but the starter's agent runs in `~`, so the *project* arm
  (`toolbox-read.ts` ~364, `join(cwd, '.claude')`) reads the real directory. Fence the project
  arm for that scene (give the starter agent a fixture cwd or point the project root at the
  shot home), then re-shoot `starter` and look at it before writing it. This golden is already
  pushed, so say so in the ledger and let the user decide on history. **Do not rewrite,
  amend or force anything on commits that are already pushed.**
- **A3 · P1 · The SUBAGENTS card appears on plain shells.** Every PTY is fed to the subagent
  watcher with no agent filter (`src/main/pty-manager.ts` ~1240–1251), and `~` counts as a
  shared "repository" (`subagent-watch.ts` ~233). Three login shells each get "3 panels share
  this repository…", drawn over neighbours' titles (`SubagentLayer.tsx` ~84–104). Watch only
  agent sessions, never treat `$HOME` as a repository, and keep the card from covering another
  panel's header.
- **A4 · P1 · The terminal header hides the prompt.** The chromeless terminal's chrome has an
  **opaque** well gradient (`styles.css` ~6870–6887) that hides about 3 rows, including row 0,
  where a fresh shell's prompt lives. New shells look dead. The rule's own comment claims it
  "never" hides the newest row, which is false after `clear` or on a fresh shell. Keep the
  M236 rule: chrome stays **absolutely positioned over the body, never a collapsing box**,
  because a collapsing box refits xterm and SIGWINCHes the agent. Read the comment at `styles.css` ~6875–6886 first:
  the scrim is `--well` because with glass the agent's output printed over the title
  unreadably. The terminal's **name is rest-layer content and must stay visible at rest**. Make
  its backing smaller or shorter at rest (behind the title text only, not a full-width band
  three rows tall) so row 0 shows. Change the scrim, not the box model; never fade the whole
  chrome.
- **A5 · P1 · The launcher card can't be wheel-scrolled, so the Starter canvas is
  unreachable.** At 1200×800 and 1000×700, "Starter canvas…" (which the amber tip tells
  first-timers to use) sits below the fold. The wheel pans the hidden canvas instead of
  scrolling the card. `shouldYieldWheel` (`src/renderer/canvas/Canvas.tsx` ~1270–1330) exempts
  the palette, HUD, minimap and pill but not `.launcher`. Add it, and make the tip's own button
  open the starter so the promise and the door are the same thing.
- **A6 · P1 · The palette re-sorts under the keyboard.** During the verification, ⌘K results
  reordered while arrowing, and Enter started a `claude` CLI the tester never chose. An Enter
  on a list that moves can start an agent. Freeze the result order once the person starts
  navigating (or until the query changes) and keep the selection pinned to the row, not the
  index.
- **A7 · P2 · Layers that won't dismiss.**
  - The **command-pill popover** ignores Esc and outside clicks: focus never enters on a
    pointer open, and Esc is handled only in the input (`CommandPill.tsx` ~364).
  - The **View menu** ignores Esc (an outside click works). The likely cause is that the
    `forceMount` Account menu's always-mounted DismissableLayer sits on top and eats Esc
    (look at `shell/AccountMenu.tsx` and `TopBar.tsx` ~172; the prop is documented in
    `primitives/Menu.tsx` ~123). Not taking focus on a *pointer* open is deliberate
    (`useOpenIntent.ts`), so keep that.
  - **Settings** opened from the dock gear: Esc lands on the root palette instead of closing.
  - Rule for all three: every layer closes on Esc and on an outside pointerdown, and returns
    focus to its trigger.
- **A8 · P2 · The minimap draws over the View menu.** `.minimap` z 940 beats
  `.shell__view-menu` 950 because the menu's 950 (`styles.css` ~962) is scoped inside
  `.shell__top`'s stacking context (z 920, ~951; `.minimap` is ~3796), so the theme rows become unclickable. Menus and popovers belong in a layer
  above all canvas HUD. The same menu renders the shortcut `⇧⌘\\` with a doubled backslash.
- **A9 · P2 · ⌘F search is broken at the edges.** The placeholder reads "Search search…", it
  says "No matching command" before any typing, the footer prints twice and counts 4 terminals
  when there is 1, and note *content* is searchable nowhere. (⌘K does find a note by title.)
- **A10 · P2 · Wrong disabled reasons in ⌘K.** "Copy last command's output" and "Next prompt"
  say "only a terminal panel has a font size". Rows say "click into a panel first" while the
  HUD says "1 selected": either let selection satisfy those rows or say the difference.
- **A11 · P2 · Text at the browser default size.** The Teammates pane's note (`.pf__note`, no
  font-size, `styles.css` ~3206) and its name input (`font: inherit`, ~5905, a grey
  browser-default box) render at 16px. So do some Skills leaves. Put them on the type scale
  and the shared input style.

### Wave B — The core loop (the reason this run exists)

- **B1 · P1 · One task form behind every door.** "+ New task" (the loudest button in the
  chrome) opens a "Start a task" sheet whose Repository field is disabled until you choose a
  *teammate*. On a fresh install there is none, so it shows red "no teammate yet". The
  launcher's Start task needs only a sentence and a folder, and it auto-creates the teammate
  on first use. Today there are six or more start doors under three nouns (task / work / work
  item): launcher, top bar, ⌘K "Start work…" plus four "Start work as a … swarm" rows, "New
  work item…", and the Board. Typing "new task" in ⌘K selects "Open review this repository as
  a workflow"; "Start work…" is row 13.
  → Every start door opens the same sheet, with fields in the launcher's order: **what →
  where → (who, defaulting to the local agent the launcher would use)**. Never gate the
  repository field on the agent field. "task" is the noun in copy. "New task" ranks first in
  ⌘K for "new", "task" and "start". Teammate stays a real concept (identity with scope), shown
  as an optional refinement. Keep the swarm/lineup doors, but put them behind the sheet's
  advanced options.
- **B2 · P2 · A merged task never looks done.** After Merge, the review panel still offers a
  live "Accept…" and "Mark reviewed again". The navigator subtitle keeps the agent's stale
  line "It hasn't been pushed or merged". There is no "remove lane / close task" next step.
  The accepted state IS recorded (`src/shared/review-readiness.ts` ~259, `hints.ts` ~164), so
  this is a projection bug. ("Doing this" is a role group, not a status, and that part is
  fine.) → After merge: retire Accept, show "merged into main as <sha>" wherever the task's
  line shows, and offer the next verbs (remove the lane, close the task).
- **B3 · P1 · The review opens clipped.** Review changes opens a panel wider than a 1200px
  window: header controls sit off-screen, the diff is cut on the right, the minimap covers the
  heading, and a single-file list takes about 60% of the width. → Size and place the review
  to the visible canvas area. Give the diff the width (a narrow file column that collapses
  with one file). Keep the minimap out of a fly-to's first frame.
- **B4 · P1 · New objects land on top of existing ones, and the rule depends on the door.**
  Terminals (⌘N, `onSpawn` → `cascadeCentre`, `Canvas.tsx` ~749, `src/renderer/panels/panels.ts` ~718), opened
  files and ⌘K New note (`openFilePanel` → `cascadeCentre`, ~4216–4228) cascade onto whatever is there.
  A new chat landed inside the starter's group frame. Shapes, stickies and pictures already
  use a free-spot placer (`useFlowchartVerbs.ts` ~117, `safe-area.ts` ~99, `placement.ts`
  ~243), and "+ Create" free-spots a file while ⌘K cascades the same file. The ⌘N cascade was
  a documented decision, so read its load-bearing entry. If you change it, record why the old
  reason no longer holds. → One placement rule for every create door: a free spot near its
  parent (a review goes beside its agent), never inside a group it doesn't belong to, then fly
  to it at a readable zoom.
- **B5 · P2 · The inherited permission mode is invisible.** The app starts claude with
  `--permission-prompt-tool stdio` and no `--permission-mode` (`src/main/agent-session-args.ts`
  ~16–26), so the person's own settings decide whether the agent asks. Nothing in the app says
  which applies, while the start sheet promises "claude asks before a command runs". The "auto"
  in the chat header is a *button that starts a bounded auto run* (`ChatNode.tsx` ~184), not a
  mode indicator, and people read it as one. → Say the effective mode where the task starts,
  in one plain line. Don't promise asking when the settings say otherwise. Label the auto
  button as an action.
- **B6 · P2 · The progress coachmark covers the composer.** "Starting › Working › Ready to
  review › Checks › Accept" is the best orientation device in the app, but it's a popover that
  sits over the composer's Send/Answer buttons, the ones its own copy tells you to use. → A
  permanent, quiet strip inside the agent panel (or its header) instead of a popover.
- **B7 · P2 · The return experience covers only terminals.** By design the reopen notice
  covers only terminal PTYs, and the resume strip only board items (`ReopenNotice.tsx`
  ~48–110). A chat + review task gets nothing on relaunch. → Extend the existing notice (don't
  add a new surface) so a task-shaped piece of work also gets its one line: finished / needs
  you / asleep, plus "Show".
- **B8 · P2 · "Ask a question" disappears after first use.** It exists only on the launcher,
  which is gone once panels exist. In ⌘K it is "New chat (no folder) — claude", and the chat
  is named "c3". → A palette alias and a Create entry under the launcher's words. Name a chat
  after its first message.
- **B9 · P2 · Two notions of "reviewed".** "you reviewed 1 file here" sits beside "0 of 1
  marked seen this session", and "you reviewed these change" has a typo. The "not verified"
  banner persists though the agent ran the tests, and nothing says the canvas itself hasn't
  run checks. → One review state per file, and one line explaining "verified" with its verb.

### Wave C — Information architecture and prominence

Principle: **prominence follows frequency.** Estimated frequencies for a solo developer who
delegates coding tasks are in the appendix. Every constantly used surface should sit within
one click. Setup-once and rare surfaces move into Settings or ⌘K. Their doors stay.

- **C1 · P1 · One name per place.** The dock label, pane title, palette row and tooltip must
  agree. Today: Tasks → pane "BOARD" (and Orchestrate has its own Tasks tab), Notes → "VAULT",
  Services → "CONNECTIONS" (inside a dock group also called "Connections"), Panels → "Hide the
  navigator", and "Team" (people) sits beside "Teammates" (agent identities). "Canvas" is
  simultaneously a mode, the breadcrumb, the default workspace name and a palette section. The
  breadcrumb is actually a workspace switcher that nobody will guess is clickable. → Choose
  names and apply them in copy only. Give the default workspace a non-mode name. Style the
  crumb as a switcher with a chevron.
- **C2 · P1 · Duplicate doors in prime chrome.** The dock's Orchestrate duplicates the top
  segment, and the dock's Workspaces duplicates the crumb. View "Merged view" duplicates the
  Workspaces pane row. Panels and "Hide the navigator" both claim ⌘\. → Remove the
  *duplicates* from the dock; the palette rows remain. Run `npm run lb -- Dock` first, keep the
  `.dock__*` aliases, and expect `dock.1` / rest checks to need a deliberate, recorded update.
- **C3 · P2 · Team is a top-level mode that is empty for most people.** Signed out, it is a
  full page saying "run `tc login`" with no button. → Show the Team segment only when signed
  in or on a shared workspace (the palette row stays). Its empty state gets a real Sign in
  button.
- **C4 · P2 · Setup-once panes occupy the dock.** Services/Connections, Teammates and Skills
  are set up once but sit beside Files and Needs you. Settings is a flat list of 36 rows in a
  palette sub-page, while theme lives in View and the inspector is controlled in three places
  under two names ("context pane" / "inspector"). → Grouped Settings (Agents & spend,
  Connections, Teammates, Skills, Layout, Appearance incl. theme). The dock keeps what is used
  every session: objects/navigator, Files, Notes, Board, Needs you, Settings. Stop the
  Workspaces History from growing a snapshot row every minute (collapse it to "N snapshots ›"
  and show only snapshots that differ).
- **C5 · P1 · ⌘K is the real map, and it is bloated.** A fresh profile shows 183 rows, 83 of
  them disabled at rest. Rows are written as CLI grammar ("deck-edit <panel> <slide>
  <markdown>", "cap-agent <panel> 5usd,200k"). There are near-duplicates (New Note / New
  note…; New Terminal / Login shell / New panel…; Zoom to fit / Fit task / Fit all), loose
  matching ("add a" returns 174 rows, "undo" returns 123 with no Undo row and selects a
  usage-window setting), and the list opens scrolled so its top row is half-clipped. → Cut the dead
  rows at rest **row by row with the existing `hiddenAtRest` mechanism** (`verify:palette`
  39/40 explain it: a row hidden at rest must still be found by search, because "hiding them
  from SEARCH would be the bug"). Do **not** filter all disabled rows in `filterCommands`:
  `verify:palette` 31 deliberately pins a disabled row (rename) visible at rest with its
  reason. A row that is shown keeps its reason. Rank prefix and word-start matches above
  subsequence, and cap weak matches. Move CLI-grammar verbs behind "Run a verb…". Merge the
  duplicates and add Undo/Redo rows. **The palette row is one of the four doors, so merging
  rows must keep every verb reachable. `verify:verbs` will tell you.**
- **C6 · P2 · The command pill mixes a rare, consequential action with arrangement.** It is
  labelled "Canvas actions" but leads with "no orchestrator yet — first send creates a
  supervisor chat" (`CommandPill.tsx` ~64). Its only arrange verb at rest (Fit) duplicates the
  HUD. Disabled buttons differ from enabled by a ~26-level grey step, and its icon is the
  Workspaces glyph. → Read
  `product-rules.md` §pill (~156–161) first: the pill's contextual layer IS the orchestrator
  input plus Fit/Jump/Running, it runs verbs through the palette executor, and a control that
  cannot run is **disabled with its reason, never hidden**. So keep the input present. Change
  its copy so a first-timer isn't offered "create a supervisor" as the first thing they read
  (say what sending does in plain words), make disabled visibly dim, and give it a distinct
  icon. If you conclude the pill should be split into "talk" and "arrange", that is a
  **product-rules change**: write the new rule into `product-rules.md` and the ledger with its
  reason, don't just diverge from it.
- **C7 · P2 · "+ Create" opens the expert panel sheet, not a chooser.** Flowchart shapes,
  stickies, regions and text are reachable only through ⌘K ("Add a process step"). The
  launcher's "Create…" and the HUD's "+ Create" differ. → "+ Create" is a kind picker
  (terminal, agent, note, sticky, shape, region, picture, workflow, file) that places on
  click, with the expert sheet one level down. The deck, relay, watcher and memory kinds stay
  reachable, just not first.
- **C8 · P1 · Orchestrate is three pages wearing one tab strip.** It has four tab rows
  (Tasks/Scene/Watch/List; Dev/Pipeline; Activity/Files;
  Changes/Checks/Output/Artifacts/Timeline/Combine). The view switcher jumps from the header
  into the centre pane when you change view. "Save View" is a link styled as a tab. "Review
  changes" is the primary action for an agent that has never run. The 3D Scene is the default
  lens of a top-level mode. → One fixed view switcher. A primary action derived from state
  (never "Review changes" without a diff). List/Tasks as the default lens, and the 3D lenses
  opt-in, since they're remembered per person. Fix the breadcrumb ("ORCHESTRATE / Canvas"
  under a top bar still saying "Canvas / …").
- **C9 · P2 · The navigator.** Rows regroup under the cursor as selection changes. Filter
  headings keep unfiltered counts, and "Needs you" with no hits shows no message. Terminals
  are filed under "Agents". A row click pans but keeps a 29–46% zoom and can leave the target
  under the drawer scrim. → Stable groups by kind (Agents, Terminals, Notes, Files,
  Workflows), with the selection shown by highlight, never by regrouping. Honest counts and an
  empty line. A jump frames the target at ≥ 80% zoom in the *unobscured* area.

### Wave D — Feel and visual system

- **D1 · P1 · Grab and resize.** A terminal drags only from its title text: a 66px target on
  a 407px header. Anywhere else on the header selects terminal text. No resize affordance is
  visible anywhere (E/S/SE handles are transparent; you find them by cursor). The only visible
  edge dots are *link ports*, sitting on the resize band at edge midpoints. There is no
  right-click menu anywhere (no `onContextMenu` in the renderer). → The whole chrome strip
  (minus buttons) is a drag handle and never passes pointerdown to xterm. Show visible
  corner/edge grips on a selected panel. Move ports off the resize band (or show them only
  when linking). Add one context menu per object **built from the same verb list as ⋯ and the
  pill**; a second verb list would drift. Respect the drag rules in CLAUDE.md
  (`screenToWorld(p₂) − screenToWorld(p₁)`, recompute from the origin rect every frame).
- **D2 · P1 · Every shell is titled `/bin/zsh`.** On the canvas and in the navigator, eight
  shells are eight identical rows. → Default a terminal's title to its cwd through
  `shared/display-path.ts` (the path rule: the full path goes on `title`, never in a body at
  rest) plus an ordinal, or its last command. Rename in place on the title.
- **D3 · P1 · Teaching overlays outrank the work.** Starter captions live in
  `.annotation-layer { z-index: 5000 }` (`styles.css` ~5835), deliberately above every panel.
  That's right for a person's margin note and wrong for starter teaching text that covers
  their new objects. At 16% zoom a caption is *larger* on screen than at 57%. → Starter
  captions sit under panels, fade in the far tier and retire when the starter is dismissed.
  The annotation rule for a person's own notes stays.
- **D4 · P1 · One fact, one home.** In `approval.png` one Bash request appears in 7 text
  places plus 4 count badges (some from the scene opening the popover and pinning the
  inspector, but about 3 plus badges remain at rest). `plan-approval.png` shows the whole plan
  twice. "N panels share this repository" appears in 4 places. The four density layers exist
  to prevent exactly this. → For each attention fact, pick its canonical place (the request
  where you answer it) and make every other place a *pointer* (a count or a jump), never a
  restatement.
- **D5 · P1 · The rest rule on the busiest objects.** The work card shows eight verbs at rest
  (Start work… / Resume / Open PR / Review / Show / Focus / Swarm… / Done). The chat header
  has six controls plus an always-red outlined `end?` and clips its own close button (the
  title "fix the off…" is truncated while the backend label keeps its room). → One header
  template for every **headed** kind (the M236 frame
  rule keeps terminal, note text/frame and shape chromeless, so they are out of scope here),
  and **never remove a fact a header carries** (a count, a path, an address). The title has
  priority and is never truncated before a verb, then
  one state word, with verbs revealed by opacity on hover/focus (never `display:none` — see
  §rest). Put a work card's one next action at rest and the rest in ⋯. A destructive control
  isn't red until it's the thing being confirmed.
- **D6 · P1 · Amber has stopped meaning "needs you".** It also colours review requests, the
  "shared by 3 sessions" warning, "not known whole", caps, "auto stuck", the launcher's tip and
  the resume strip. Several surfaces show more than one filled primary (the `palette` golden
  shows Continue, Run again and Restart filled). → Reserve amber for a person being needed,
  and one filled primary per surface.
- **D7 · P2 · Copy is doing design's job.** Long operational sentences sit in chrome (the
  Orchestrate activity empty state, the approval help, the Copilot preview line, the cap
  sentence), and internal words leak: lane, island, station, roster, lens, verb, lineup,
  seat, pool, "known whole", "advisory". → A copy pass on what the default view shows: short,
  plain, one verb. Internal terms stay in code and in the deep-detail layer.
- **D8 · P2 · Microtype.** 585 of 684 `font-size` declarations are `--t-xs` (11px) or `--t-sm`
  (12px); `--t-base` is used 11 times. Orchestrate scene labels are about 7px. → Raise body
  text in the panels people read (chat prose, review lines, the start sheet) to `--t-base` by
  **re-valuing tokens and re-assigning roles**, not with literals. Watch the xterm cell
  metrics, which a restyle may not touch.
- **D9 · P3 · Theme gaps.** In light mode panels separate from the canvas by a hairline only.
  In dark mode flowchart outlines and connectors nearly vanish (`flowchart-dark`), and
  "Continue" switches to a different button language in dark. → Token re-valuations. A
  re-valuation is one theme's and is recorded in the ledger (product-rules §material). A new
  token NAME must be declared in both theme blocks (`verify:styles theme.1`).
- **D10 · P3 · Refit and orientation.** Resizing the window (e.g. to 1000×700) never refits a
  view that was a fit. The zoom readout is hidden within ±5% of 100% *by design*
  (`styles.css` ~7515); leave that, but make the readout a click-to-reset-100% target.
  Keyboard: Tab walks every button inside every panel in DOM order, and three invisible stops
  come first (the collapsed inspector, 0×0 spans). `inert` collapsed panes. A spatial roving
  focus over objects (Tab/arrows between objects, Enter into one, Esc out) is a **stretch**.

## Refuted in verification — do NOT "fix" these

- "The first task ran in auto without asking" is **not an app defect**. It was the tester's
  own `~/.claude/settings.json`. What remains is B5.
- "Undo doesn't reverse Tidy": it does, via the real Edit menu and ⌘Z. That was a driver
  artifact. Only the missing palette Undo row (C5) and the lack of a post-Tidy toast remain.
- "The zoom % is missing": deliberately hidden near 100%.
- "Sign in ignores Esc": it closes.
- "Relaunch restores an odd zoom": it restores exactly what was left.
- "The launcher textarea isn't autofocused": it is.
- "The command pill reorders by selection": one fixed priority list that shifts only when
  shapes are selected (P3 at most).
- "The View menu should take focus on click": not on a *pointer* open, by design
  (`useOpenIntent.ts`). Only its Esc is broken.

## Keep — the critics agreed these are good; don't regress them

- The launcher's three steps (what → where → how), its headline, and the step-3 sentence
  "Claude Code will work on its own branch of X, and may work only in X". This is the model
  for B1's single form.
- The progress rail vocabulary, the agent's final summary shape (file:line, branch, commit,
  "hasn't been pushed or merged"), the Merge confirm copy ("This changes main in your
  repository; the lane stays until you remove it"), and the gate order (Mark reviewed before
  Accept).
- The mechanics: pinch zoom anchored exactly under the cursor, drag 1:1, counter-scaled titles
  legible when far, marquee → "N selected", named groups, the task frame at Fit all, shape
  labelling in place, and the free-spot placer for shapes.
- Disabled rows that say why; visible 2px focus rings on the chrome; tooltips carrying
  shortcuts; navigator row → camera flight.
- The token system (8 space steps, 6 type steps, both themes, tone tokens) and the state
  vocabulary (dot + word). The approval model (Allow once / for session / Deny, with the whole
  command in mono). The light flowchart golden is the calmest screen in the app, so it's the
  target feel.

## How to run this

1. **Ground truth (short).** Build, launch, and reproduce A1–A5 and B1 yourself with
   screenshots. Read the load-bearing entries for every module you'll touch. Write the ledger
   (`docs/build-log/m<N>-m<M>-ledger.md`: it must be a RANGE name, because `verify:meta
   ledger.1` only matches `m<N>-m<M>-ledger.md`. Link it from CLAUDE.md's table or `ledger.1`
   goes red). It holds: the finding IDs you'll do, the order, and decisions as you
   make them. **The ledger is your state. If your context is compacted, reread it; don't
   trust memory.**
2. **Waves in order: A → B → C → D.** A and B are the run. C and D are where judgment matters:
   take the items with the most user impact per unit of risk, and write down what you
   skipped and why. **Three things that land completely beat eight half-built.** Group
   findings into milestones by the files they touch, so each milestone is one coherent
   commit. `Canvas.tsx` is about 9k lines and is the hotspot: if you need a seam, extract a
   *verb run* into a hook (the `useBoardVerbs` precedent), never a state cluster, and keep the
   hook's call position.
3. **Critique → one fix batch → confirm.** When A and B are in, get a fresh-context review
   (a subagent with no prior context if your harness has one; otherwise a deliberate fresh
   pass of your own from the screenshots and this document alone). Fix everything material in
   one batch, confirm with at most one more round, and stop. Open-ended polish loops are
   waste.
4. **Gate** (below), then merge to local `main` and stop.

Where a finding's "→" direction conflicts with a product rule, the rule wins. Say so in the
ledger and do the closest thing the rule allows. If you have evidence that a direction here is
wrong for users, do the better thing and write down why. Push back with evidence rather than
executing literally.

## Verification

- `npm run affected` between steps (it says on every run that it is not the gate).
  `npm run verify` before calling a wave done. Report **your reds and the pre-existing
  baseline reds separately**; the baseline is in the latest build log. Never call something a
  flake without measuring it (re-run it alone).
- New checks take **scoped ids** (`ok('launcher.wheel.1 …')`), never the next integer. Every
  P0/P1 fix gets a check that would have caught it, preferably one that **measures** (a
  height, a z-order via `elementFromPoint`, a placement overlap), because the checks here that
  only call helpers are why A1 stayed green.
- **Goldens change on purpose or not at all.** `npm run shot` then `npm run verify:visual`.
  Before `UPDATE_GOLDENS=1`, each changed scene gets one sentence in the ledger from a
  fresh-context look at the image, saying what changed and that it is intended. Several
  scene intents in `scripts/shot.cjs` no longer match their images (`orchestration*` still
  describes the retired command deck; `chat`, `palette`, `workflow`, `integrations`, `group`,
  `trail`, `zoomed-out`, `spawn-sheet`). When you touch a scene, make its intent true.
  `starter` is expected to change (A1, A2).
- Don't restate a count in prose in more than one place (`verify:meta 23`).
- Don't add a suite to the `verify` script. The runner derives suites from `verify:*` keys.
- If `graphify-out/graph.json` exists, run `graphify update .` at the end.

## What I want back

A short, honest report:
1. Which finding IDs landed, with before/after screenshots for each visible one.
2. The decisions you made that this document left open (names chosen in C1, placement rule in
   B4, the ⌘N cascade decision, what moved into Settings), each with its reason.
3. What you skipped or couldn't reproduce, by ID, and why.
4. Commits (hashes and one-liners).
5. Verify: your reds vs. baseline reds, listed separately. Goldens changed, each with its
   critic sentence.
6. What's still owed: hand checks on a real Mac, the A2 history decision, stretch items.

Anything you didn't verify, say so plainly.

---

## Appendix — prominence vs. frequency (solo developer delegating coding tasks)

| Surface | Real frequency | Prominence today | Direction |
|---|---|---|---|
| Start a task | every session, several times | loudest button, but wrong form (B1) | one form behind every door |
| Agent/chat panel + composer | every session | panel, header overloaded | header down to title + state (D5) |
| Review + Accept/Merge | every task | opens clipped (B3) | fit to view, give the diff width |
| Needs you (bell, queue) | every session while agents run | bell + badge + pill + strip, 7× restated | one home, pointers elsewhere (D4) |
| Navigator (objects) | constant at 8+ objects | dock + pane, regroups | stable groups, readable jump (C9) |
| ⌘K palette | daily | top-bar field + hotkey | trim, rank, dedupe (C5) |
| Files | frequent | dock + ⌘B | keep |
| Zoom/fit HUD | frequent | compact, bottom right | keep |
| Right-click menu | habitual on macOS | absent | add, from the shared verb list (D1) |
| Orchestrate | daily for multi-agent users, else weekly | top segment + dock duplicate | one door, one tab row, list default (C2, C8) |
| Board (GitHub/Jira) | weekly, needs a connection | dock, mislabelled "Tasks" | rename (C1) |
| Workspaces | occasional | dock + crumb + View | crumb only, styled as switcher (C1, C2) |
| Settings | rare | dock gear → flat palette list | grouped, holds setup-once panes (C4) |
| Services/Connections, Teammates, Skills | setup once | dock icons | into Settings (C4) |
| Team view | only when signed in/shared | top segment | conditional (C3) |
| Command pill: orchestrator | rare, consequential | centre-bottom, first slot | separate from arrange (C6) |
| Minimap | passive | pops over content and menus | below menus (A8) |
| Starter canvas | once | promised in amber, unreachable | reachable from the tip (A5) |
| 3D Scene / Watch lens | rare as a tool | default lens of a top-level mode | opt-in (C8) |
| Flowchart / deck / ink / replay / flip / routines / relay | rare for this user | Create, palette | reachable, not first (C7) |
