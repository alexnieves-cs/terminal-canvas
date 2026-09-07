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
