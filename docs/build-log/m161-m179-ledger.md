# The v8 run — ledger (M161 →, 4.0.0 → 4.1.0)

Started 2026-09-07 at `7049dab` (`v4.0.0`, the head of the M134–M160 run). Unattended, goal
mode, on Fable 5.1. The run prompt is
`docs/superpowers/specs/2026-09-07-v8-product-polish-prompt.md`; its "goal condition" block is
what this file answers to. This file is the run's resumable state: the milestone map, each
act's status, every declined item with its reason, the golden scenes touched with the critic's
sentence each, and the evidence lines (command + exit code) the final message is built from.
Appended to, never rewritten. A session that resumes mid-run reads the LAST section and
continues; it rebuilds its understanding from this file, `CLAUDE.md`, the brief
(`docs/superpowers/specs/2026-09-07-m162-product-polish-brief.md`) and README's table, in
that order.

## Method, per milestone (the prompt's fixed shape)

spec in `docs/superpowers/specs/` → plan in `docs/superpowers/plans/` → red checks committed
and WATCHED red (`check(mNNN)`) → the feature (`feat(mNNN)`) → goldens regenerated with
`npm run verify:visual`, every changed scene LOOKED at and given the critic's sentence here
before `UPDATE_GOLDENS=1` → a fresh-context critic and a fresh-context verifier (subagents
that see only the diff, the spec, the checks and the docs) → the fix wave (`fix(mNNN)`) → the
act's build log → merge to `main`. Never two Electron chains at once; `tmux -L
terminal-canvas-verify-panels kill-server` before every Electron run.

## Milestone map

M160 is the last number used before this run (`docs/build-log/m160-reconcile.md`). Numbers are
assigned in order and never reused; a milestone that is declined keeps its number and says so.

| # | Act | One line |
|---|---|---|
| M161 | 0 | Baseline: `npm run verify` and `verify:packaged` at `7049dab`, the goldens regenerated unchanged, every golden read |
| M162 | 0 | The brief: `2026-09-07-m162-product-polish-brief.md` — references measured, the findings with dispositions, the face / rest / path / metrics rules, the new tokens; `verify:styles` checks per mechanical rule |
| M163 | I | The quiet header: glyph · title · state dot at rest; verbs and marks on hover/focus; machine cost to the inspector |
| M164 | I | The body's material: the UI face for prose, 14px/1.5, the 20px inset, the path rule in every body |
| M165 | I | Diffs as cards |
| M166 | I | The far view as a status wall |
| M167 | II | Turns |
| M168 | II | Tool rows |
| M169 | II | The composer |
| M170 | II | The agent card when it is a terminal |
| M171 | III | The rail as places |
| M172 | III | The dock and top bar |
| M173 | III | The status bar at rest says nothing |
| M174 | III | The launcher as a welcome |
| M175 | III | Palette and sheets |
| M176 | IV | Motion with intent |
| M177 | IV | Empty states as places |
| M178 | IV | The second full audit |
| M179 | IV | Reconcile: 4.1.0, README, CLAUDE.md, the release body, the tag |

Branches: `m161-polish-brief` (Act 0), `m163-frame` (Act I), `m167-conversation` (Act II),
`m171-shell` (Act III), `m176-finish` (Act IV), each merged to `main` at the act's close.

## Act 0 — M161 (in progress)

- Tree at start: `7049dab` plus two uncommitted doc files (the run prompt, untracked, and
  `CLAUDE.md`'s "What it is supposed to be" section, modified) — both the prompt author's, both
  committed as the first commit of Act 0. No source file differs from `7049dab`.
- **Baseline `npm run verify`** over `7049dab`'s source (the tree differed only in the two doc
  files above), 2026-09-07: every plain-node and Electron suite green in chain order — meta
  38, styles 39, viewport 137, groups 6, merged 12, registry 38, layout 234, credentials 18,
  jira 15, github 7, palette 143, rail 183, review 98, subagent 27, file 83, toolbox 103,
  usage 26, machine-cost 7, tmux 35, agent-state 27, agent-session 141, verbs 14, teammates
  25, electron 4, control 15, package 13, pty 10, pty-manager 63, window 4, ipc 1, canvas 6,
  xterm 11, panels core 76 / shell 94 / kinds 48 / agents 77 — and **product 58/59, exit 1**:
  `browser.1` reported `live: false` (the `<webview>` guest had not navigated when the check
  read it). `npm run verify:panels:product` alone, immediately after: **59/59, exit 0**. Read
  as the load flake the memory notes and `docs/verify-suites.md` describe (an Electron part
  under the whole chain's load), recorded, not fixed; the act-closing chain is the evidence.
- **Baseline `npm run verify:packaged`**: 12/12, exit 0.
- **Baseline `npm run verify:visual`, nothing changed**: 57/57 PASS, 166.5 s wall, exit 0 —
  the harness is stable against its own goldens.
- Every golden opened and read (55 scenes); the walk's findings are the brief's table (the
  prompt's ten plus twelve of this walk's).

## Act 0 — M162

- Red: `check(m162)` — `verify:styles face.1` (33 mono-on-prose hits at 4.0) and `polish.1`
  (no tokens), 39/41.
- Green: the four tokens; the sweep over 30 rules (the mono ancestors `.chat__transcript`,
  `.diagnostics-overlay`, `.panel__card`, `.subagent-ambiguous` dropped their declaration
  and the code leaves `.chat__tool-input`, `.chat__tool-result`, `.panel__card-line`,
  `.skill-card__facts` opted in by name); `--bubble` joins check 11's grounds and clears 4.5
  for every text token in both themes. `verify:styles` 41/41.
- **A harness fact found by the first golden run after the sweep:** every 1440-wide scene
  failed as `the size changed — golden 1440x865, fresh 1440x864`. Not the CSS: the shot
  window is created 1440x900 and macOS clamps it to the display's WORK AREA at creation (a
  1512x982 panel leaves 896 under the menu bar and the Dock), so the content came out 864 or
  865 tall by whether the Dock was showing. `scripts/shot.cjs` now calls
  `win.setContentSize(1440, 865)` after creation, which is honoured past the work area; the
  scenes that `resize` (compact, wide) were never affected. Reproduced twice, measured with a
  probe (`workArea.height` 896, `getContentSize()` 864 → 865 after the call), fixed at the
  cause, no golden re-baselined for it.
- **The critic's walk of the 37 changed scenes** (a fresh-context critic over `out/visual/*.diff.png`
  against the goldens; the author re-judged four scenes after a recapture). Three findings
  acted on before any golden was written: (1) `.chat__tool-result` declared its family
  BEFORE `font: inherit`, so the shorthand reset it to the transcript's UI face and a diff
  hunk rendered proportional — fixed (the family after the shorthand); (2) the chat's tool
  diff reuses `.review-node__line`, which had inherited mono from the review body and set
  none of its own — `.review-node__line` now names mono; (3) prose still mono under
  `.pf__body--text`, the reading bodies' shared ancestor (the work card's body and
  `teammate:` line, the toolbox's skill descriptions, the review's `N panels share this
  repository…` and `2 files changed`, the GitHub item titles and the `assigned to you ·
  reviews requested of you` scope line, the file panel's missing-file sentence, the Jira
  card's not-connected sentence) — **OWED to M164**, the body's material, which is where
  that ancestor becomes the UI face and each kind's code leaves opt in; the goldens below
  are accepted as "the face sweep of M162's list", not as "the face rule everywhere".
  Recorded decision: the Files tree's names (`.file-row .rail-row__label`) and the vault's
  tag rows are set in the UI face — a file's NAME in a list is a name (the Finder's rule);
  a PATH is mono.
- **Golden sentences, M162** (the scene · what changed, in words a reader can check):
  - launcher · the five `> Start …` verb names and the environment sentence are in SF; the sentence fits one line so the card is ~6px shorter and the mono wordmark moves up with it (M174 owns the wordmark).
  - kinds · the rail's `start` verbs, the edge label `the api pair — worker b takes over on exit 0`, the annotation `flaky since the watchdog change`, the chat's turn and tool pills are in SF; the work card, toolbox and review bodies stay mono (owed, M164); the fixture id and browser port are jitter.
  - kinds-dark · the same set as `kinds` on the dark theme, the same owed bodies.
  - skills · the skill cards' notes, the column subtitles and the `placed only` filter are in SF and one card wraps to a second line; the search placeholder and `no bundled files` stay mono (M175 / M177).
  - chat · the transcript (the user's turn, `thought`, the assistant's answer), the tool pills, the composer's placeholder, the codex sheet's refusal sentence and the memory note are in SF; `…/src/server.ts` beside each tool pill stays mono.
  - integrations · the audit rows' meta, the refusal sentences and the token-rejected line are in SF; `GET /issues?filter=assigned`, `POST /repos/…` and `tc api jira <path>` stay mono.
  - github · each item's one-line body is in SF; the item titles and the scope line stay mono (owed, M164).
  - vault · the tag rows, the note's Backlinks entries and the chat behind are in SF; the `decisions/` prefix stays mono.
  - watcher · the header's trigger phrase `on a change in src` and the `idle` pill are in SF, shifting `⋯` a few px left; the command and its tail stay mono.
  - board · the edge label, annotation, backlinks and chat behind are in SF; the Board pane's rows were already SF and did not change; the work card's body stays mono (owed, M164).
  - chat-copilot · the backdrop only; the copilot sheet's reason line is unchanged.
  - memory · the three notes and the `decided ▾` select are in SF and rewrap; the `FAILED/TRIED/DECIDED` caps, the stamps and the root path stay mono.
  - supervisor · the backdrop only; the sheet is untouched.
  - templates · the backdrop only; the `review this repository` sheet is untouched.
  - graph · the inspector's RULE select `after a turn` is in SF; the subagent note reflows to three lines; the review-across counts change face.
  - composer · the user's turn, the tool pills, the `FILES IN REPO` completion row and the draft are in SF; the `shot.png` chip stays mono.
  - auto · the turns and `1 message waiting for this turn to end` are in SF; the expanded Edit diff hunk is mono (after the two fixes above — the first capture had it proportional).
  - subagents · the SUBAGENTS note reflows from four mono lines to three SF lines; the assistant's turn and the waiting line behind are in SF.
  - palette · the state column (`idle`, `not started`, `asleep`) is in SF; the cwd hint column is mono (the first capture had swept it; reverted, then recaptured); the review counts behind change face.
  - palette-query · only the fixture id in the two `Open review/toolbox` rows and the counts behind; the query rows are unchanged.
  - lineup · the backdrop only; the Workbench sheet is pixel-identical.
  - header · the backdrop only; the far-tier review card's menu rows are unchanged.
  - flip · the backdrop only; the flipped summary cards keep their mono tail lines by design.
  - spawn-sheet · only the fixture id in the WHERE rows and the backdrop.
  - palette-dark · as `palette`, on the dark theme.
  - search · the two hit rows' scrollback lines are mono (recaptured after the hint revert); only the backdrop and the fixture id differ.
  - search-empty · the `No matches` row is unchanged; the backdrop only.
  - inspector-detail · the backdrop and pid/fixture jitter; the Detail tab's command, cwd and font size stay mono.
  - inspector-work · the backdrop and the RAM figure; the Work tab is unchanged.
  - inspector-tools · the backdrop only.
  - navigator-panels · the rail's `start` verbs are in SF; the chat, notes and GitHub bodies behind.
  - navigator-workspaces · the backdrop only; the Workspaces pane is unchanged.
  - navigator-files · the Files tree's `src` and `README.md` rows are in SF (the recorded decision above).
  - attention · the `needs you` pill and `⋯` shift a few px; the status bar re-anchors on the RAM figure; the ATTENTION popover row is unchanged.
  - overview · the chat, notes, GitHub bodies and rail verbs are in SF; the status bar's RAM figure moved the bar.
  - compact · at 1000px the SUBAGENTS note, the edge label and the rail verbs are in SF; the review body stays mono (owed, M164).
  - file-missing · the note, annotation, backlinks and rail verbs are in SF; the missing-file sentence, the Jira sentence and the work card body stay mono (owed, M164).
  - Three more scenes crossed a budget on the `UPDATE_GOLDENS=1` run itself (each run re-mints
    the fixture's temp directory, and the review body prints that path in full — a jitter
    source the path rule removes in M164): approval · the review body's fixture id and the
    chat turns behind the far-tier card; verbs · the same backdrop under the verb line;
    tool-objects · the file card's `Read`/`Edit` rows and the hunk beneath them are mono
    (the `.review-node__line` fix), the fixture id.
- `UPDATE_GOLDENS=1 npm run verify:visual` — 56/56, exit 0; 40 goldens rewritten (the 37
  plus the three above), every one with its sentence above.
- **Reviews (Act 0).** A fresh-context critic (FIX-FIRST: 0 Critical, 4 Major, 8 Minor) and
  a fresh-context verifier (25 claims: 21 SUPPORTED, 3 OVERCLAIMED, 1 UNSUPPORTED) over the
  diff, the brief, the spec, the ledger and the logs. The fix wave, every item landed:
  - *Major 1* — the ledger's filename (`m161-m179-ledger.md`, the prompt's) matched
    `milestones.1`'s range regex, so seventeen `⏳` README rows were "logged" by a file with
    no section for them: `verify:meta` now excludes `*-ledger.md` from the logs (a ledger is
    the run's state, not a log), and the README carries rows only for M161–M162, whose log
    exists; each act adds its rows with its log.
  - *Major 2* — `face.1` matched ANY compound, so `.chat__text code { mono }` (the code leaf
    the brief prescribes) would have failed: it now reads the selector's SUBJECT (last
    compound, `:is`/`:where` unwrapped) and has a second ANCESTOR arm for the four containers.
    `.pf__body--text` is named in its comment as M164's red.
  - *Major 3* — `.chat__tool-input` had gone mono as a class, which put a Task's
    `description` and a search's `query` in mono: `toolArgumentIsCode` decides beside the
    text (path / command / pattern / url → code), the node stamps `--code`, `verify:rail
    chat-model.6` pins it (184/184).
  - *Major 4* — evidence: the M162 runs below carry their exit codes; the missing plain
    pass against the rewritten goldens was run (57/57, exit 0, below); the 57-vs-56 tally is
    the `goldens every golden names a scene` check, which runs only in comparison mode.
  - *Minors:* the brief's rule 5 names its check (the golden and the critic's sentence,
    M177); `CLAUDE.md` says a new NAME is both blocks' and a RE-VALUATION one theme's, and
    its credentials count is 18; `.diagnostics-overlay__export-result` (a path) is mono;
    `.sheet__preview`, `.lane-header__name`, `.edge-indicator__name`, `.inspector__run-name`
    (names and a sentence) joined the list and the sweep; the harness's `resize` pins the
    content to `h − 32` (the title bar; a `setSize` after creation is never clamped, and the
    resized goldens are 900 → 868, 760 → 728 — the first cut had guessed 35 from the clamped
    first window and moved every resized scene by three pixels, caught by the plain pass);
    the fixture directory is a FIXED name (`tc shot fixtures golden`, wiped first) because the
    review, file and toolbox bodies print it in full and a per-run suffix moved three scenes
    past the tile budget on some runs and not others; owed to M167 by name: a code fence in
    an assistant turn renders proportional until the markdown lands.
  - The verifier's three OVERCLAIMED: "thirty rules" is ~33 (the diff removes 32 mono lines
    and adds 6); "a minute later" was ~3 minutes; the M162 lines lacked exit codes — all
    corrected here. Its UNSUPPORTED (no completed update log) was the run it could not see
    finish; the log completed at 56/56, exit 0, and is quoted above.
- **Golden sentences, the fix wave** (nine scenes, `UPDATE_GOLDENS=1`, 56/56, exit 0):
  - workflow · the block sub-labels (`claude — api (2)` beneath each block), the edge words `on exit 0` / `after a turn` and the edge indicator `claude — api (2) · needs you` are in SF.
  - wide · the same workflow diagram words at 1800px; the inspector's pid is jitter.
  - merged · the lane headers' workspace names are in SF.
  - supervisor · the sheet's preview sentence beneath HOW is in SF; the WHERE field shows the fixed fixture name.
  - chat-copilot · the copilot sheet's preview sentence is in SF; the fixed fixture name.
  - tool-objects · the review body's root path reads the fixed fixture name (`…/tc shot fixtures golden/repo`).
  - approval · the same root path; nothing else.
  - verbs · the same root path; nothing else.
  - file-missing · the file panel's and the review body's root paths read the fixed name; the edge indicator's name is in SF.
- **Evidence (M162):** `node scripts/verify-styles.cjs` 41/41, exit 0. `npm run verify:meta`
  38/38, exit 0. `npm run verify:rail` 184/184, exit 0. `npm run typecheck` exit 0. `npm run
  build` exit 0. `npm run verify:visual` (plain, after every golden above) **57/57, exit 0**.

Act 0 closed 2026-09-07. **Evidence:** `npm run verify` over the fix-wave commit — exit 0;
tallies in chain order: meta 38, styles 41, viewport 137, groups 6, merged 12, registry 38,
layout 234, credentials 18, jira 15, github 7, palette 143, rail 184, review 98, subagent 27,
file 83, toolbox 103, usage 26, machine-cost 7, tmux 35, agent-state 27, agent-session 141,
verbs 14, teammates 25, electron 4, control 15, package 13, pty 10, pty-manager 63, window 4,
ipc 1, canvas 6, xterm 11, panels core 76 / shell 94 / kinds 48 / agents 77 / product 59.
Build log `docs/build-log/m161-m162-act0-brief.md`. Merged to `main`.

## Act I — M163–M166 (in progress)

Spec `docs/superpowers/specs/2026-09-07-v8-act1-frame-design.md`, plan
`docs/superpowers/plans/2026-09-07-v8-act1-frame.md`, branch `m163-frame`. Owed into this
act from Act 0: the prose under `.pf__body--text` (M164).
- **M163 — the quiet header.** Red: `check(m163)` — styles `rest.1`, `metrics.1` (41/43),
  core `rest.1` (76/77), shell `machine.1` (94/95). Feature: every chrome BUTTON and mark
  at opacity 0, revealed on `.pf:hover` / `:focus-within` / `.panel--selected` in `--dur-1`
  (the first cut listed `.pf__verb` and `.icon-button`; the review's `commit` and the file's
  pencil were neither and stayed on the first goldens — the rule is `.pf__chrome button`
  now); the CPU · RAM readout gone from the header and both card tiers, the inspector's
  `Machine` section with three arms (`reading` · `none` "no reading yet" · `not-running`);
  dark `--glass-1` .74 → .88, `--edge-light` .06 → .11, `--lift` wider (finding 8, a
  re-valuation, one theme's). **Decided against the spec:** the 3px tone edge stays 3px
  and its own colour — `verify:panels agents state-word.1` pins `borderLeftWidth === '3px'`
  and the tone's colour, and the glow already softens it; a 2px mixed edge would be a
  re-pin for no reading gain. Two harness lessons: the ⋯ is a `shellControl` that acts on
  CLICK with React's next render (menu.1's `waitUntil`), and a check appended at a part's
  END may find no valid rows or frames — `machine.1` moved to where the shell part already
  reads the inspector, `rest.1` takes any unselected frame. Green: core 77/77, shell 95/95,
  kinds 48/48, agents 77/77, product 59/59 (every existing header check held).
- **M164 — the body's material.** Red: rail `path.1` on a stub module (184/185); kinds
  `path.1` written beside the wiring (not watched red — the bodies had already changed;
  said so). Feature: `shared/display-path.ts` (`displayPath(path, root?, home?)`, four
  arms, `full` beside `short`); the review's root reads `repo`, the file/toolbox directory
  lines and the memory root read their last two segments (the file and toolbox panels know
  no repository root — only the review engine resolves one; **owed to a later milestone
  by name:** a `repoRoot` on the file and toolbox models so the line reads `repo/src`), the
  teammates' places likewise; `.pf__body--text` in the UI face at `--t-base` / `--lh-body`,
  `--inset`, `--fg-2`, the measure on the note-shaped leaves, `.file-node__pre` at the
  terminal's 13px mono, the directory lines mono; `face.1`'s ancestor arm gains the body;
  the trail card's name in the UI face (finding 14); the browser's Back/Forward/Reload as
  named icon controls (finding 19). **Declined:** finding 15's caps `SUBAGENTS` heading —
  small caps headings are the app's section idiom (`.inspector__section-heading`, the
  toolbox's groups), and the note's sentence is already the UI face; finding 18's verbs
  are already `.pf__verb--word` chips (nothing to restyle); finding 20's add line is the UI
  face since M162 and its empty state is M177's. Green: kinds 49/49, rail 185/185.
- **M165 — diffs as cards.** Red: styles `diff.1` (43/45). Feature: `.review-node__file` a
  card (`--r-md`, a hairline, `--s-1`), the header basename bold in the UI face with the
  directory quiet in mono, `+n −n` as two washed pills (`--green-dim`, `--red-dim`; `new`
  and `bin` on `--blue-dim`), `discard` at opacity 0 revealed on the card's hover/focus and
  held while armed (`review-node__discard--armed`). Every hook a check reads is kept.
- **M166 — the far view as a status wall.** Red: styles `far.2` (43/45); core `far.1`
  (written with the feature — it needs the glyph to exist to be anything but red on a
  selector). Feature: `.panel__card-summary[data-tone]` fills with the block tier's own
  `color-mix` (far.1 ties the minimap), a 32px kind glyph (the terminal's `KindTerminal`,
  every other kind's `KIND_GLYPH`), the title, the state — the last line of scrollback
  gone from the summary tier (the rail carries it, M105).
- **The critic's walk of Act I's 44 changed scenes** (a fresh-context critic over the diffs
  after M163–M166). Verdict: in every scene the selected panel alone shows its chrome; no
  unselected, unhovered frame showed a button. Its questions and the dispositions:
  (1) the trail cards' phase line was still caps — fixed (`.trail-card__column` is a
  sentence, finding 14); (2) the `SUBAGENTS` heading is caps — declined again by name:
  small caps headings are the app's section idiom (the inspector's, the toolbox groups');
  (3) the GitHub panel's `assigned to you · reviews requested of you` was mono — fixed (the
  UI face); the `issue · open` meta line is a caps state chip and stays; (4) the
  across-review's file rows had plain counts — fixed (the same card header and pills);
  (5) the review body's second card is clipped at the fixture's panel height — the body
  scrolls (`overflow: auto`), accepted; (6) the `↻ auto` chip at rest at 22 % — a STATE
  projection (M97's chip), which the rest rule keeps; (7) the palette's raw path rows —
  M175's, by the map. The core suite's check 8 had read the keystroke echo from a summary
  card that no longer carries a line: it reads the tail tier now (`zoomToScale(wc, 0.4)`),
  and the core watchdog is 63 s from two green runs (49.98 s, 49.83 s).
- **Golden sentences, Act I** (the critic's, one per scene; the three scenes the fix wave
  touched again — trail, github, across — are re-sentenced beneath):
  - kinds · every unselected header shows glyph, title and one state and no ⋯/lock/pin/pencil/fill/×; the CPU · RAM readout is gone; the review reads `repo` with `+2`/`−2` washed pills; server.ts reads `…/repo/src`; plan.md's prose is in the UI face; the review's second card is clipped by the frame and scrolls.
  - kinds-dark · the same on the dark theme; the panels lifted one clear step from the field.
  - trail · the selected panel shows its chrome; the trail cards' names are in the UI face.
  - skills · the selected `claude — api` shows its full chrome, the unselected review and server.ts none; `…/repo/src`; the review's cards.
  - chat · the selected chat shows ⋯ / auto / to terminal / fill / ×; the work card, watcher and plan.md behind lost their rest chrome; plan.md's path is its last two segments.
  - integrations · the pane unchanged; the canvas behind as `chat`.
  - github · the selected GitHub panel shows its chrome; its rows are in the UI face at 14px.
  - across · the selected across-review shows ⋯ / refresh / Commit / fill / ×; its rows are cards.
  - vault · the selected plan.md shows pencil / refresh / fill / ×; the note and its Backlinks are in the UI face; the unselected panels show no chrome.
  - board · the selected work card shows ⋯ / fill / ×; review, server.ts, toolbox and watcher at rest show glyph, title, summary and state only.
  - chat-copilot · the sheet unchanged but for the fixed fixture name in WHERE (the sheet is M175's); the canvas as `board`.
  - memory · the selected memory panel shows ⋯ / refresh / fill / ×; the root reads `…/tc shot fixtures golden/repo`; the notes in the UI face.
  - supervisor · the sheet unchanged; the memory panel behind is selected in the fixture.
  - templates · the sheet unchanged; the background as `supervisor`.
  - runs · the selected `claude — api (2)` shows ⋯ / idle / fill / ×; the across-review beneath shows glyph and title only; the GitHub header lost refresh / fill / ×.
  - graph · the unselected `claude — api (2)` shows only its idle pill; the GitHub header quiet; the edge inspector unchanged.
  - composer · the selected chat with chrome; plan.md's prose in the UI face and its short path; the unselected work and watcher headers quiet.
  - tool-objects · the unselected review-of-chat lost ⋯ / commit / fill / ×; the root reads `repo`; the rows are cards with `+2`/`−2` pills; `discard` hidden; the hunk mono.
  - approval · the same review restyle as `tool-objects`; the attention popover unchanged.
  - verbs · the same, under the verb line.
  - subagents · the selected `claude — api (2)` shows its chrome; the SUBAGENTS heading stays a caps section heading (declined, above).
  - palette · the rows show the fixed fixture name; the palette's own path rule is M175's.
  - palette-query · the two `Open review/toolbox of chat` rows still carry the raw path — M175's; nothing of Act I's.
  - lineup · the sheet unchanged; the background as `runs`.
  - header · the selected small review shows ⋯ / working / fill / × with its menu open; the unselected `claude — api (2)` shows the idle pill and no CPU figure; the across-review lost its verbs.
  - flip · the flipped `claude — api (2)` is a large `>_` glyph, the title and `idle` on a green wash — no `Waiting for input` line, no CPU · RAM; the small flipped review likewise.
  - spawn-sheet · the sheet unchanged (suggestions read the fixed name); the background as `runs`.
  - palette-dark · as `palette` on the dark theme.
  - search · the overlay unchanged; the background as `runs`.
  - search-empty · the overlay unchanged; the background as `runs`.
  - inspector-detail · the new MACHINE section reads `CPU 0% · RAM 2 MB` beside the other sections; CWD reads the fixed name.
  - inspector-work · the pane unchanged; the background as `runs`.
  - inspector-tools · the pane unchanged; the background as `runs`.
  - navigator-panels · the rail unchanged; the canvas as `runs`.
  - navigator-workspaces · the rail unchanged; the canvas as `runs`.
  - navigator-files · the rail unchanged; the canvas as `runs`.
  - attention · `claude — api (2)` shows the amber `needs you` pill alone; the popover unchanged.
  - overview · the same quiet headers; the blank bodies on the two live panels are the scene's state in the golden too.
  - merged · at 22 % every card is a glyph, a name and a state on a wash; the merged frame and lane labels unchanged.
  - zoomed-out · at 22 % the cards show glyph, name and state on a tone wash with no scrollback line and no CPU; the chat's header keeps its state and the auto chip.
  - zoomed-out-dark · as `zoomed-out` on the dark theme; the panels read opaque with a visible top edge.
  - compact · at 1000 px the same quiet headers, `…/repo/src`, the review's cards.
  - workflow · the unselected workflow panel lost ⋯ / fill / ×; its Run / Triggers toolbar is body and stays; the two hint lines in the UI face.
  - file-missing · the selected server.ts shows ⋯ / not found / pencil / refresh / fill / ×; the missing-file sentence is UI prose with `…/repo/src`; Jira's and the toolbox's lines in the UI face; the unselected headers quiet.
  - After the fix wave (the same 44 scenes rewritten, `UPDATE_GOLDENS=1` 56/56 exit 0; a
    plain `verify:visual` after it **57/57, exit 0**), the three scenes it changed again:
    trail · the four trail cards read the skill's name and its phase `starting a milestone`
    as a sentence, no caps; github · the panel's `assigned to you · reviews requested of
    you` line is in the UI face; across · the two worktree sections' file rows are cards
    with `+2` `−2` and `new` pills, like the single-repository review's.
- **Reviews (Act I).** A fresh-context critic (FIX-FIRST: 0 Critical, 5 Major, 8 Minor) and
  a fresh-context verifier (27 claims: 25 SUPPORTED, 1 OVERCLAIMED, 1 UNSUPPORTED). The
  wave, every item landed (`fix(m163–m166)`): the Machine section kind-gated with a fourth
  arm (`not-measured` — a chat's process is main's; the sampler walks terminal pids) and
  `running: boolean` on the model; `.pf__trail` and `.chat__auto-dismiss` exempt from the
  rest rule (a count and a pill's own control); the memory root `displayPath(root, root)`;
  `shortPath` moved into `shared/display-path.ts` (one shortening; `panel-name.ts`
  re-exports); `.review-node__base` at `--t-md`; `.work-node__facts` in the UI face with
  the key and remote mono; `.file-node__prose` at `--t-base`; the brief's row 15 struck;
  backlog #86 is the `repoRoot` item's home. The verifier's corrections: the rail red
  (184/185) was read off the terminal and no log holds it — recorded as such; M163's core
  green took four runs (rest.1 retargeted three times: the frame filter, the click, the
  wait). **Evidence per milestone (exit codes):** styles 45/45 exit 0 after M165/M166;
  core 78/78 exit 0 twice after M166 (m166-core.log); kinds 49/49 exit 0 after M164;
  shell 95/95, agents 77/77, product 59/59 exit 0 (act1-run.log); rail 185/185, palette
  143/143 exit 0 after the wave.
- **Golden sentences, the Act I wave** (33 scenes rewritten again after the reviews'
  wave; each looked at, the diffs of kinds, memory and board read line by line and the
  rest sharing one of four causes):
  - The note's prose at 14px (`.file-node__prose` from `--t-md` to `--t-base`): plan.md
    reflows in kinds, kinds-dark, chat, integrations, vault, board, chat-copilot, memory,
    supervisor, templates, graph, composer, subagents, palette, palette-query, lineup,
    header, flip, spawn-sheet, search, search-empty, inspector-detail, inspector-work,
    inspector-tools, navigator-panels, navigator-workspaces, navigator-files, attention,
    overview — the plan's heading, its two paragraphs and the `Open question` line wrap one
    line later each.
  - The review card's basename at 13px bold beside 14px prose: kinds, kinds-dark, across,
    tool-objects, approval, verbs (the `src/server.ts` and `src/health.ts` cards grow a
    few pixels and the pills move right with them).
  - The work card's `teammate: ada · lane: claude — api (chat)` facts in the UI face:
    kinds, kinds-dark, board, chat, composer.
  - The memory panel's root line reads `repo` (was `…/tc shot fixtures golden/repo`):
    memory, kinds, kinds-dark.
  - The trail scene did not change: its capsule `hide 4 skills` was already visible on the
    selected panel; the exemption shows on an unselected agent panel, which no scene
    frames at rest (recorded, not pinned).

Act I closed 2026-09-07. **Evidence:** after the wave, `UPDATE_GOLDENS=1 npm run
verify:visual` 56/56 exit 0 (33 goldens rewritten, sentenced above); a plain `npm run
verify:visual` **57/57, exit 0**; `npm run verify` — **exit 0**; tallies in chain order: meta
38, styles 45, viewport 137, groups 6, merged 12, registry 38, layout 234, credentials 18,
jira 15, github 7, palette 143, rail 185, review 98, subagent 27, file 83, toolbox 103,
usage 26, machine-cost 7, tmux 35, agent-state 27, agent-session 141, verbs 14, teammates
25, electron 4, control 15, package 13, pty 10, pty-manager 63, window 4, ipc 1, canvas 6,
xterm 11, panels core 78 / shell 95 / kinds 49 / agents 77 / product 59. Build log
`docs/build-log/m163-m166-act1-frame.md`. Merged to `main`.

## Act II — M167–M170 (in progress)

Spec `docs/superpowers/specs/2026-09-07-v8-act2-conversation-design.md`, plan
`docs/superpowers/plans/2026-09-07-v8-act2-conversation.md`, branch `m167-conversation`.
Owed into this act from Act 0: a code fence in an assistant turn renders proportional until
M167's markdown; from Act I: nothing (backlog #86 is its own).
- **M167 — turns.** Red: `check(m167)` — rail `md.1` on a stub module (185/186), styles
  `turns.1` (45/46). Feature: `shared/markdown.ts` (the closed grammar, a tree, `plainText`),
  `chat/Markdown.tsx` (React from the tree; a `Copy` verb per fence; a link as text with its
  URL on the title), the user's turn a bubble on `--bubble` at `--r-lg` ≤ 75% aligned right,
  the assistant's unboxed at the measure at `--t-base`, `.chat__role` clipped to the
  accessible name, `.chat__when` on hover from the turn's `at`, the caret a soft blink
  (`prefers-reduced-motion` stops it). Green: rail 186/186, styles 46/46, product 59/59,
  agents 77/77 (exit 0 each, m167-run.log). A harness slip: the rewritten `chat` scene intent
  broke `shot.cjs`'s syntax and the first visual run hit its watchdog with no scene painted —
  repaired, recorded.
- **M168 — tool rows.** Red: rail `chat-model.7` and styles `tools.1` (read 186/187 and
  46/47 on the working tree before M169's checks joined; at the commit `check(m168)` they
  read 186/188 and 46/48 because M169's `composer-rows.1` / `composer.1` were in the same
  files by then — the verifier reproduced both), agents `tools.3` (77/78 against the M167
  build). Feature: `toolGroups` / `toolVerb` / `toolState`
  / `toolGroupLabel` (the span is between the first and last STAMPED rows), five tool glyphs,
  one row per call (glyph · verb · target · pill), the well capped at twelve lines with `show
  all`, consecutive rows under one header collapsed by default with the rows in the DOM and
  any verb on them revealing the group. **A chain-ordering mistake, recorded:** the background
  job that committed `feat(m168)` ran `git add -A` after M169's node and stylesheet edits had
  reached the working tree, so those rode in `feat(m168)`'s commit; its `npm run build` then
  failed on a type error in that half-finished M169 code (the trail's union), and the job's
  agents / product / visual runs used the M167 build (so `tools.3` read red there a second
  time, not green). M169's two plain-node checks HAD been watched red before those edits.
  The split is recorded here rather than rewritten; M169's remainder and M170 follow as
  their own commits. **The verifier's corrections:** M169's two checks rode in `check(m168)`
  (not `check(m169,m170)`, whose message claims them) and were already green inside
  `feat(m168)`; `tools.3` was first watched GREEN in the wave's run (agents 79/79, exit 0,
  act2-run2.log — it read 77/79 once against the stale build in act2-run.log); M168's green
  in plain node: rail 187/187, styles 47/47 (reproduced at the commit).
- **M169 — the composer.** Red: styles `composer.1` (47/48), rail `composer-rows.1`
  (187/188), both before the code (read on the working tree; no log holds them — the
  verifier could not reproduce the single-red tallies from a commit, since the checks were
  committed with M168's). Feature: `.chat__composer` a rounded well (`--r-lg`, a
  hairline, `inset 0 1px 2px var(--bezel)`, the iris ring on `:focus-within`), the chips
  row (`model` · `N skills` from the trail's one door · `@ attach`, which drops an `@` into
  the draft and opens M75's file completions — the honest attach door this app has), the
  textarea's rows from `composerRows(draft)` (two to six), Send the one filled control and
  Interrupt shown in its place only while a turn runs (`.chat__composer--live`; the button
  stays in the DOM for `codex.1`), the approval moved into the well as a sentence (`claude
  wants to run Bash npm test — allow it?`) with its three verbs, the placeholder `Message
  claude…` and the chord on Send's title.
- **M170 — the agent card when it is a terminal.** Red: rail `header.3` (188/189) before
  `agentHeader`; agents `agent-card.1` written beside the code (said so in the check).
  Feature: `agentHeader(spec, branch?)` over `chatHeaderLine` (one builder; the engine word
  is the backend's, `claude-code` → `claude`; a plain shell → `null`), `PanelFrame`'s
  `agentGlyph` (the chat's glyph beside the state dot), the terminal's `.pf__summary
  [data-agent-header]`.
- **The critic's walk of Act II's 32 changed scenes** (the first draft of this line said 33 — the verifier counted) (a fresh-context critic over the
  diffs). Accepted the shape in every scene; its questions and the dispositions, each landed
  before any golden was written: (1) the `auto` scene showed Send while a turn was in flight
  — `--live` keyed on the Interrupt arm's enabled bit, which `starting` with a queue behind
  it does not set; it keys on the turn (`streaming` or `starting`) now, so Interrupt shows
  (disabled with its reason on a backend that cannot) whenever a turn runs; (2) the Edit
  row's glyph floated to the middle of its opened diff — the glyph is `align-self:
  flex-start` and the opened bodies take the whole line; (3) the `thought` toggle was centred
  as an orphan word — it is left-aligned like a row; (4) M170 was unwitnessed by a golden —
  the `.pf--kind-terminal .pf__state { display: none }` rule (M66's) had hidden the agent
  glyph too; the `tests` card in `kinds` now shows the chat's glyph beside `repo · claude`;
  the running-agent case is `agent-card.1`'s (79/79). Its minor: the placeholder reads
  `Message claude…` lower-case — the spec's line said `Claude`; the spec is corrected (the
  backend's word is lower-case everywhere in the app). The walk's own two: the chips had
  inherited M75's mono chip rule by source order (`.chat__chips .chat__chip--quiet`); the
  fixed chain-ordering slip above.
- **Golden sentences, Act II** (32 scenes; the critic's, amended for the four scenes the wave
  changed again):
  - chat · the caps labels are gone; the user's question is a right-aligned bubble; the two tool rows fold under `› 2 tools`; the reply is UI-face prose with `start` / `health` as mono chips; the composer is a well with `claude` / `@ attach` chips in the UI face, `Message claude…` and one Send (outlined while the draft is empty); `thought` is a left-aligned quiet toggle.
  - composer · the same restyle behind the file popover; the draft sits under the chips row and Send is the filled primary.
  - auto · the group expanded (Read `done`, Edit with its diff open BENEATH the row, each glyph on its row), the auto continuation a bubble, `Interrupt` in Send's place while the turn is in flight.
  - tool-objects · only the clock stamps beside the Read/Edit rows in the Tools detail (jitter).
  - supervisor · the chat behind the sheet lost its caps labels; the codex chat at the top shows Send alone.
  - chat-copilot · the chat at the right edge shows the bubble, prose, chips and well; the sheet unchanged.
  - attention · the auto chat's bubble, prose and well behind the `needs you` terminal.
  - subagents · the chat restyle behind `claude — api (2)`; pid jitter.
  - header · the chat behind the narrow frame restyled; the scene's own subject unchanged.
  - flip · the flipped cards unchanged; the chat behind and RAM jitter.
  - kinds · the dormant `tests` card's header reads the chat's glyph and `repo · claude` (M170); the chat at the bottom right shows the bubble and `› 2 tools`.
  - kinds-dark · the same on the dark theme.
  - integrations, vault, watcher, board, memory, templates, palette, palette-query, palette-dark, lineup, spawn-sheet, search, search-empty, inspector-detail, inspector-work, inspector-tools, navigator-panels, navigator-workspaces, navigator-files, overview · the chat restyle behind each pane or sheet, the pane or sheet itself unchanged; pid / RAM / port / clock jitter where the critic named it.
- **Reviews (Act II).** A fresh-context critic (FIX-FIRST: 2 Critical, 5 Major, 8 Minor) and a
  fresh-context verifier (20 claims: 15 SUPPORTED, 3 OVERCLAIMED, 1 UNSUPPORTED, 1 side
  finding — the README rows). The wave, every item landed (`fix(m167–m170)`, the second):
  - *Critical 1* — README rows M167–M170 (meta 38/38); the closing chain below.
  - *Critical 2* — Send was hidden while ENABLED: `--live` had keyed on `status` alone, and
    `composerState` counts `starting` as in flight only for a first spawn with nothing
    queued. `composerLive(snapshot)` is now the ONE predicate both read; `composer-live.1`
    pins a restored or queued `starting` as not live with Send enabled.
  - *Major 3* — `toolState` read `done` for a stored call with no result: a fourth word,
    `no result` (grey), `chat-model.7` extended.
  - *Major 4* — emphasis crossed a code span: the code span is found first and emphasis is
    searched only before it; the critic's two strings are in `md.1`; a link URL takes one
    level of balanced parentheses; a heading drops its trailing `#`; `***x***` recorded as
    a bound.
  - *Major 5* — `plainText`'s comment claimed the DOM's textContent; it says what it is (the
    tree's text for a plain-node check) and `md.1` pins the fence round-trip; the fence's
    `Copy` is an ICON with a name (`CopyIcon`), so no verb text sits inside
    `[data-chat-assistant-text]`.
  - *Major 6 / 7* — the evidence lines and the tools.3 story (corrected above).
  - *Minors:* the link is reachable (`tabIndex`, `aria-label` with the URL); `ToolGroup`'s
    `reveal` is `useCallback`'d and a LONE tool row renders through the group (no header),
    so a second tool's arrival no longer remounts the first row and loses its open diff; the
    approval sentence uses the backend's label; `.chat__permission` is a column (no 52px
    gutter) and `.chat__questions` no longer paints a box inside the well; the grid
    leftovers (`.chat__row:last-child`, `.chat__tool-running`, `grid-column`) and the
    input's own ring inside the well are gone; `tools.1`'s comment says why folded rows
    leave the tab order (the header reveals them, M44); the parse bound (152 ms on a 48 KB
    hostile paragraph, 30 ms on 55 KB of prose — re-run per delta on the live row) is
    recorded here, not fixed. **Spec deviations recorded:** Interrupt at rest is `display:
    none` (the attributes `codex.1` reads are unchanged); `field-sizing: content` is not
    used (rows only); `@ attach` is a text chip; `agentHeader`'s `branch` has no caller (the
    line is `folder · engine`); Copy goes through `navigator.clipboard` (the spec said
    `edit:copy`, which is main→renderer and cannot carry a fence's text — the spec is
    corrected).

- After the reviews' wave a plain `verify:visual` read **57/57** (exit 0): the wave's one
  visible change — the `auto` scene's well shows Send again (its turn is `starting` with a
  message queued, which `composerLive` reads as not in flight, so Interrupt yields), under
  the tile budget as a one-word swap — is forced on purpose by deleting `auto.png` and
  updating. Sentence: auto · the well shows a disabled Send and no Interrupt while the
  queued message waits (the Act II critic's own reading of the model), the group expanded
  above it as before.

Act II closed 2026-09-07. **Evidence:** `UPDATE_GOLDENS=1 npm run verify:visual` after the
critic's dispositions — 56/56, exit 0 (32 goldens, sentenced above); after the reviews' wave
the forced `auto` golden (56/56, exit 0) and a plain `npm run verify:visual` **57/57, exit
0**; `npm run verify` — **exit 0**; tallies in chain order: meta 38, styles 48, viewport
137, groups 6, merged 12, registry 38, layout 234, credentials 18, jira 15, github 7,
palette 143, rail 190, review 98, subagent 27, file 83, toolbox 103, usage 26, machine-cost
7, tmux 35, agent-state 27, agent-session 141, verbs 14, teammates 25, electron 4, control
15, package 13, pty 10, pty-manager 63, window 4, ipc 1, canvas 6, xterm 11, panels core 78 /
shell 95 / kinds 49 / agents 79 / product 59. Build log
`docs/build-log/m167-m170-act2-conversation.md`. Merged to `main`.

## Act III — M171–M175 (in progress)

Spec `docs/superpowers/specs/2026-09-07-v8-act3-shell-design.md`, plan
`docs/superpowers/plans/2026-09-07-v8-act3-shell.md`, branch `m171-shell`. Owed into this
act: the palette's raw path rows and the sheet's WHERE field (M175, by the map); the
markdown parse bound (recorded, not owed).
- **M171 — the rail as places.** Red: rail `groups.1` (190/191), styles `rail.1` (48/49),
  agents `reveal.1` rewritten to the rest rule and watched red (78/79). Feature:
  `railGroups` (agents · files · reviews · boards · integrations · workflows; a kind the
  table does not name lands with the integrations rather than vanishing), headings as
  `.rail-heading` `<li>`s with counts (never `.rail-row`, so `empty.1` holds), every row's
  kind glyph in a soft tint (`KindTerminal` for a terminal), the state a dot after the
  label (`.rail-row__state-dot`, keeping the `.rail-row__dot` alias shell 83 reads — the
  first run threw on that rename: "restyle, never rename") with the word on the row's title,
  the tail clipped but present (84, state-word.1), `start` at 0 revealed on hover /
  focus-within, the selected row a filled pill. Green: agents 79/79, shell 95/95, kinds
  49/49, product 59/59, core 78/78 (exit 0 each, m172-run.log / m173-run.log).
- **M172 — the dock and top bar.** Red: styles `dock.1` (49/50). Feature: each dock button's
  name as a `.dock__label` tag revealed on hover / focus-visible, the current place a filled
  pill, the `N live / N quiet` capsules gone from the dock and Canvas (`railCapsules` stays a
  pure export for `lastline.1`), the search a field-shaped button (`.shell__search` stays a
  button, shell 78). **Declined:** a separate appearance control in the bar — the settings
  door already opens M45's three-way chooser, and a second control for one setting is a
  control with no distinct name (`targets.1` pins `.shell__settings`).
- **M173 — the status bar at rest says nothing.** Red: rail `hints.1` on a stub (191/192),
  styles `hud.2` (50/51), `compact.1` rewritten without the strip's probe. Feature:
  `canvas/hints.ts` (four gestures and the tmux notice as one list of sentences;
  `hintsLeft`), the HUD a floating pill with the zoom controls and the update notice alone
  (`.canvas-hud__notice`; the coordinates, the selected name, the CPU · RAM total and the
  tmux sentence gone — `CanvasHud` no longer reads them), `HintStrip.tsx` deleted and the
  gestures rendered in the rail's empty state (`[data-hint]` there; `firstrun.3` rewritten
  to an EMPTY canvas — with a panel on the canvas there is no hint, on purpose), the tmux
  notice a dismissible amber banner in the launcher (`firstrun.4`, written beside the code,
  dismissed into `hints.seen` as `tmux`). Green: agents 80/80 (exit 0, m173-agents.log).
- **M174 — the launcher as a welcome.** Red: styles `launcher.1` (51/52). Feature: the
  wordmark in the UI face (the last mono prose), the three doors as cards (`--r-lg`, `--s-1`,
  the name at `--t-lg`), a recents row (`spawn:recent`, newest five, each chip opening the
  sheet whose WHERE lists them — the launcher mints nothing itself), the verb list in the
  UI face with the COMMAND alone in mono (`.launcher__verb-command`), no `>` prompt glyph,
  the environment line one sentence with the probe's `asked … · checked …` tail on its
  title. `launcher-codex.1` and `reach.1` untouched.
- **M175 — palette and sheets.** Red: styles `material.1` (52/53). Feature: the palette's
  state column a dot in its tone with the word clipped beside it (`data-state-word` kept).
  **Found and recorded:** the palette, the sheet and the context pane were ALREADY in the UI
  face at the brief's row size with mono only on path rows and `--mono` inputs — finding 11
  was the fixture's raw path in the mono rows (M162's revert kept a path mono, by the rule)
  and finding 12 the caps labels, which are UI-face caps, the section idiom. `material.1`
  pins that state. **Declined:** 14px for these surfaces — the brief's own ramp says 13px
  is a row or control and 14px is prose; a 260px pane at 14px is a narrower pane. Kind
  glyphs in palette rows — the section headings already say what a row is; a glyph per
  row needs a `kind` on every `Command`, its own milestone.
- **The critic's walk of Act III's 55 changed scenes** (M171–M173; M174 and M175 landed
  after the walk and are sentenced beneath). Its questions and the dispositions, each landed
  before any golden was written: (Q1, a defect) the tail clip was unscoped and hid a
  workspace row's `23 panels` and `1 waiting`, a teammate's facts, a routine's cadence and
  the dock badge's word — scoped to `.rail-list--panels` (and `rail.1` refuses an unscoped
  clip); (Q2) nine goldens predate Act I because their scenes' drift stayed under the budget
  through Acts I and II — their sentences below name that drift, never "rail and HUD only";
  (Q3) the dot column was ragged because only terminal rows kept the hidden `start` slot —
  every row keeps it; (Q4) the search field's rule lost to the bar's generic button rule
  (`.shell__top .shell__search`, `dock.1` pins the specificity); (Q5) the chrome and per-panel
  figures gone from unfocused panels in five scenes are Act I's rest rule reaching goldens
  that had not moved since — Q2's sentences. Its minor: a terminal-kind review sits under
  AGENTS by kind (correct; the heading says what a row is, not what it is about).
- **Golden sentences, Act III** (56 scenes after the wave; the critic's, amended):
  - navigator-panels · the Panels list grouped under `AGENTS · 10 / FILES · 2 / REVIEWS · 3 / BOARDS · 3 / INTEGRATIONS · 4`, tinted glyphs, a dot per stateful row in one column, `start` hidden, the selected row a pill; the HUD a pill; the capsules gone; the search a field.
  - navigator-workspaces · the rail, dock and HUD as above; the Workspaces pane keeps `23 panels` / `2 panels` and `all workspaces` (Q1's fix).
  - navigator-files · the dock capsules, the hint strip and the HUD changed; the tree column identical.
  - launcher · the rail's empty state carries the four hint sentences; the amber tmux banner with `Got it`; the wordmark in the UI face, the doors as cards, the recents row absent (the fixture has none), the verbs with the command chip, the env line one sentence (M174); the strip and status bar gone.
  - compact · the capsules gone, the badge on the bell, the HUD pill bottom-right, the grouped rail.
  - wide · the grouped rail with `WORKFLOWS · 1`, the dock and HUD; the workflow panel's `⋯ fill ×` chrome hidden at rest and its hint lines in the UI face — Act I and Act 0 drift this scene had carried under the budget until now.
  - merged · `AGENTS · 12`, the groups intact, the read-only chip unchanged, the HUD pill at 22 %.
  - attention · the badge on the bell, the popover painted above the dock; the amber dot on `claude — api (2)` agrees with its `needs you` pill.
  - zoomed-out, zoomed-out-dark · the rail, dock and HUD only; the far cards untouched.
  - kinds, kinds-dark · the rail, dock and HUD only (`REVIEWS · 2` in this fixture); the bodies identical.
  - group, group-collapsed, reduced-motion, ink · the rail, dock and HUD, and — carried under the budget since Act I — `worker a`'s `CPU 0% · RAM n MB` readout gone from its header and card, the unfocused neighbour's `⋯ fill ×` hidden at rest.
  - browser · the rail and HUD, and — since Act I — the browser's `Back Forward Reload` as icons, the asleep card's chrome hidden.
  - teammate, routine · the rail and HUD; the teammate rows keep `1 place · 1 svc · scheduled` and the routines their `every 10m` (Q1's fix); since Act I the place path reads its short form and the browser's nav is icons.
  - palette, palette-query, palette-dark · the rail, dock and HUD; the palette's state column a dot with the word clipped (M175).
  - chat, integrations, github, across, vault, watcher, memory, supervisor, templates, subagents, chat-copilot, board, trail, skills, workflow, overview, lineup, flip, spawn-sheet, search, search-empty, inspector-detail, inspector-work, inspector-tools, header, runs, graph, composer, tool-objects, approval, verbs, auto, file-missing · the rail grouped with dots and hidden `start`, the dock without capsules with the current place filled, the HUD a pill, the hint strip gone, the search a field; pid / port / clock jitter where the critic named it.
