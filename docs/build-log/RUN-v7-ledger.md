# The v7 run — ledger (M134 →, 3.1.0 → 4.0.0)

Started 2026-09-07 at `pre-v7-run` (= `328e087`, the head of the M126–M133 act). Unattended,
goal mode. This file is the run's resumable state: the milestone map, each act's status, every
declined item by backlog number with its reason, and the evidence lines (command + exit code)
the final message is built from. It is appended to, never rewritten, so a session that resumes
mid-run reads the last section and continues.

## Milestone map

M133 is the last number used before this run (`docs/build-log/m126-m133-act3-skills-and-workflows.md`,
renumbered one up in `9d96b37` because Act II's 3.0.0 ship had claimed M125). `grep -rn M134`
over `docs src scripts README.md CLAUDE.md` finds nothing, so M134 is free. Numbers below are
assigned in order and never reused; a milestone that is declined keeps its number and says so.

| # | Act | One line |
|---|---|---|
| M134 | 0 | Baseline: the tag, the tallies, 3.1.0 for the unversioned M126–M133 debt, CI status, `verify:panels` timed three times, the inventories |
| M135 | I | Split `verify:panels` into suites, each watchdog 1.25× its own measured green |
| M136 | I | `npm run handcheck`: the eleven owed hand checks — automated where provable, the rest as exact human steps |
| M137 | I | The deferred-minors sweep (the by-file list from the M126–M133 log) |
| M138 | I | A production Run caller for `pool` / `orchestrator` / `collect` |
| M139 | I | CI at its cause, and the fourth dead-end audit (every surface since M124) |
| M140 | II | #26 — the toolbox's write half beyond skills |
| M141 | II | #27 — prompt placeholders (`{{cwd}}`, `{{branch}}`, `{{selection}}`, `{{panel}}`) |
| M142 | II | #19 — cost history and per-workspace / canvas totals |
| M143 | II | #53 — the live tier's card from a serialised screen |
| M144 | II | #60 — zoom-independent chrome, chrome and handles only |
| M145 | II | #13 — the image handoff into a terminal's agent (needed by Act V) |
| M146 | II | #23 — zoom to fit, a camera flight, named apart from maximise |
| M147 | II | #34 — per-preset environment overrides and template sets (needed by Act V) |
| M148 | III | The visual-regression suite over the shot harness (goldens, tolerant diff, gated like `verify:packaged`) |
| M149 | III | `docs/ux-audit-4.0.md`: every scene viewed, findings fixed; empty/loading/error states; motion, reduced motion, focus order; chrome a11y; density |
| M150 | IV.1 | Tags on the vault's file lineage (wikilinks and backlinks were M85's): `#tag` parsed beside the links, a TAGS section that filters, a chip in the note — spec `2026-09-07-v7-act4-tags-design.md` |
| M151 | IV.2 | A conditional / loop workflow block on the live Run caller — **not started: the ranking was truncated from the bottom after IV.1 / V.1 (the brief's rule)** |
| M152 | IV.3 | #55 — ad-hoc task panels — **not started: the ranking was truncated from the bottom after IV.1 / V.1 (the brief's rule)** |
| M153 | IV.4 | #73 + #72 — the flag registry and one versioned automation surface — **not started: the ranking was truncated from the bottom after IV.1 / V.1 (the brief's rule)** |
| M154 | IV.5 | #64 — rationing terminal memory — **not started: the ranking was truncated from the bottom after IV.1 / V.1 (the brief's rule)** |
| M155 | V.1 | #15 — ink on M93's annotation layer: a draw tool, strokes as world- or panel-anchored annotations — spec `2026-09-07-v7-act5-ink-design.md` |
| M156 | V.2 | #66 — images in the terminal — **not started: the ranking was truncated from the bottom after IV.1 / V.1 (the brief's rule)** |
| M157 | V.3 | The vibe-coding starter as a #34 template set (chat + dev shell + browser, #13 briefing) — **not started: the ranking was truncated from the bottom after IV.1 / V.1 (the brief's rule)** |
| M158 | V.4 | #14 — xlsx, read-only — **not started: the ranking was truncated from the bottom after IV.1 / V.1 (the brief's rule)** |
| M159 | V.5 | #33 — the minimap, against what M70 already shipped — **not started: the ranking was truncated from the bottom after IV.1 / V.1 (the brief's rule)** |
| M160 | VI | 4.0.0: the version, the tag, README / CLAUDE.md / manual-only list / dead-end audit current, the release body as a repo file |

Out by the brief: #4, #28, #40, #20, signing.

## Act 0 — M134

- `git tag pre-v7-run` at `328e087` (clean tree, `main`). Done.
- pool-runner.ts has no production caller: `grep -rn pool-runner src` finds only the module
  itself; the only importers are `scripts/verify-agent-session.cjs` and its entry. Confirmed.
- CI: the `verify` workflow's last run on `main` is **34101554825** (2026-09-07T08:37Z), status
  `failure`, at `verify:pty` check 8 `claude on PTY PATH — claude not found`: the runner has no
  `claude` binary, and the check asserts a fact about the machine rather than the code. The two
  runs before it (34060199326, 34048553964) failed the same way. Fixed at its cause in M139;
  a green run id needs a push, which this run is forbidden to make — see M139.
- Baseline `npm run verify` at `pre-v7-run` (2026-09-07, this machine, the user's own app also
  running): exit 0, 7:30 wall. Tallies, in chain order: meta 34/34 · styles 33/33 · viewport
  134/134 · groups 6/6 · merged 12/12 · registry 37/37 · layout 228/228 · credentials 18/18 ·
  jira 15/15 · github 7/7 · palette 140/140 · rail 173/173 · review 98/98 · subagent 27/27 ·
  file 75/75 · toolbox 101/101 · usage 26/26 · machine-cost 7/7 · tmux 35/35 · agent-state
  27/27 · agent-session 134/134 · verbs 13/13 · teammates 25/25 · electron 4/4 · control 15/15 ·
  package 13/13 · pty 10/10 · pty-manager 63/63 · window 4/4 · ipc 1/1 · canvas 6/6 · xterm 9/9 ·
  panels 338/338.
- `npm run verify:panels` alone, three times in isolation at `pre-v7-run`: 338/338 each, wall
  **321.4 s, 321.9 s, 322.1 s** (`/usr/bin/time -p`, exit 0 each). 1.25× the slowest is 403 s;
  the 600 s watchdog it ran under is what M135 replaces with per-part figures.
- 3.1.0: `dff0f96` — `package.json`, the lockfile, the README status line, `verify:meta
  version.1`'s pin and `CLAUDE.md`'s preamble.
- Inventory carried into Act I, from `docs/build-log/m126-m133-act3-skills-and-workflows.md`:
  the ELEVEN owed hand checks (§Owed hand checks; the same eleven are the last block of
  `docs/load-bearing.md`'s manual-only list) → M136; the 32 deferred minors across 16 files
  (§Deferred minors, by file) → M137.
- A peer session (`m125-skills-ae`, given the same goal) asked who owns the run and stood down
  on "f2 owns v7"; it noted the merged `m130-assign` / `m131-workflow` worktrees are deletable.

Act 0 closed at `8d7b8d3` (spec, plan and the red `panels-split.1/.2`).

## Act I — M135 (in progress)

## Act I — M135–M139, closed 2026-09-07

Build log: `docs/build-log/m134-m139-act1-harness-and-debt.md`. Commits: `8d7b8d3` (red
`panels-split.1/.2`), `43bbd2b`, `7938f6a` (red `handcheck.1` + the `verify:pty` fix), the
`check(m137)` / `ee6ab75` pair, `d92422a` / `a7940b9` (M138 red), then the four `feat`/`docs`
commits that close the act (see `git log`).

- **M135**: `verify:panels` → `core` 71 / `shell` 92 / `kinds` 47 / `agents` 76 / `product` 54
  (340), watchdogs 40 / 95 / 60 / 110 / 95 s from two green runs each (the figures beside
  each constant). Nothing lost: `panels-split.2` reads the old file from `pre-v7-run`.
- **M136**: `npm run handcheck` → `4 automated passed, 0 failed, 0 skipped, 7 for a person`,
  exit 0 (second run; the first found the Electron arm run in node mode and the `created`
  result word). The seven HAND checks, verbatim from `scripts/handcheck-steps.cjs`, are the
  last block of `docs/load-bearing.md`'s manual-only list:
  1. The trail against a real agent (M130). 3. A pool of N against a real budget, and a real
  AgentSessionManager (M132). 4. A saved SKILL.md still loading in the CLI (M129). 6. The
  >40-skill truncation notice (M130). 9. `--append-system-prompt` surviving an orchestrator
  RESUME (M132). 10. A `collect` join against real workers (M132). 11. A workflow watcher
  ARMED for real (M133).
- **M137**: 32 items — 9 fixed, 3 pinned, 6 already fixed, 14 declined by name (the
  "Deferred from M126–M133" section of `docs/ideas-backlog.md`).
- **M138**: `pool-caller.ts` + `pool:mint`/`pool:event` + `agent:pool-start`/`agent:pool-stop`;
  `verify:ipc` 1/1 at 122; `verify:agent-session` 138/138; product `workflow.run.1` green
  (three workers minted, each sent `work an item\n\nItem: <x>`, rows finished, `done — every
  item finished`).
- **M139**: `verify:pty` 8/9 fixed at the cause. **CI green is NOT achieved and cannot be by
  this run**: the brief forbids a push, and `workflow_dispatch` runs the remote's `main`. The
  next command is `git push origin main && gh run watch`. The fourth audit and `reach.3`
  landed. Declined in this act: none by backlog number (the sweep's declines are M137's, by
  item, above).

## Act II — M140–M147, closed 2026-09-07

Build log: `docs/build-log/m140-m147-act2-backlog-eight.md`. Built in a worktree and merged at
`d78018c`; the merge carried a committed `node_modules` symlink that emptied `main`'s
dependencies (`138d323` untracked it, fixed the ignore pattern, `npm ci` re-ran — the lesson is
in `docs/load-bearing.md`).

- Every one of the eight entries was read whole and rewritten down in `docs/ideas-backlog.md`
  with what the milestone left.
- **M143 (#53)** and most of **M140 (#26)** were already built (M63's rows-as-rows; M22's file
  editor as the write door): the milestones are the pins and the door they lacked, said so.
- Declined by name in this act: #19's second adapter (codex reports no cost — M90; copilot
  unmeasured) and its un-pinned panel (a guess is worse than nothing); #19's per-workspace
  totals (one workspace on screen; the canvas-wide figure is the one that changes what a
  person does); #26's cross-panel palette scope, the three resolution unknowns, managed
  settings and a second vendor (each its own milestone); #13's per-CLI capability beyond a
  named sentence on the row; #53's `capture-pane` (the entry's own words). An edge INTO a pool
  block stays drawn and not acted on (the pool starts with the run; gating its start on the
  edge is backlog work) — the Act I critic had asked for a refusal there, and the M133 fixture
  is that very shape, so the refusal was reverted.
- The Act I critic's fix wave (one Critical, six Majors) landed before Act II's code —
  `docs/build-log/m140-m147-act2-backlog-eight.md` lists each.
- **The Electron tier over the merged tree** (after `138d323`): every part green — core
  75/75, shell 94/94, kinds 48/48, agents 77/77, product 57/57 — once the walk's fixes landed
  (the two M142/M147 defects the audit found are recorded under Act III; three harness
  mistakes of Act II's own — a doubly quoted selector that threw and aborted the core part,
  `cat` spawned with the agent flag, a newline inside an injected script — are in the build
  log). Watchdogs pinned from two green runs each in the Electron tier: shell 96 s (76.5,
  76.7), kinds 60 s (47.1, 47.4), agents 109 s (86.2, 86.7), product 95 s (74.7, 75.2), core
  from its own two runs after check 9 moved below the chrome's overhang (38.5, 37.6 → 49 s).

## Act III — M148–M149, closed 2026-09-07

Build log: `docs/build-log/m148-m149-act3-visual.md`. Spec and plan:
`docs/superpowers/specs/2026-09-07-v7-act3-visual-design.md`, `docs/superpowers/plans/2026-09-07-v7-act3-visual.md`.

- **M148 `verify:visual`**: red `visual.1` at `720798e`; the suite at `41fabf6`; goldens at
  half scale (54 scenes); watchdog 200 s from two runs of 159.2 s. Outside the chain beside
  `verify:packaged` (`verify:meta` 19's second exclusion).
- **M149 the audit** (`docs/ux-audit-4.0.md`): every golden walked. Found in the CODE and
  fixed with a red first: M142's ledger read never wired (F.8); M147's workspace minted before
  its sheet (F.8); the `⋯` menu invisible over a live terminal since M144 (F.12); the
  attention popover invisible since 2.3.0 (F.14); the toolbox Open door's line (F.2); the
  board's empty columns (F.7); the routine line's wrap (F.10). Declined by name: F.1 (the
  minimap yields on hover — Act V's #33), F.3 (the appearance control is a chooser, not a
  toggle), F.4/F.5 (the containers already scroll), F.6 (M127's "words, not ellipses"), F.9
  (M80's parameter label rule), F.11 (M62's section-first order and M73's full directory).
  Owed and named: F.13, a live terminal that painted blank once — backlog #82; the 100 %
  density — manual-only (a `scale-100` scene was tried and dropped: `capturePage` ignores the
  device-scale override). Scenes added: `reduced-motion`, `file-missing`.
- The two pixel checks the act adds — `menu.paint.1`, `popover.paint.1` — and the rule they
  teach: a surface that opens is proven by `elementFromPoint`, never by a DOM read.
- Reviews: the fresh-context critic and verifier over Acts II and III ran after the goldens
  landed (`64ff1a1`); their findings and the fix wave (`8ce16b1`) are in the Act III build
  log under *Reviews*. The wave's Critical was Act II's: a preset's env never reached the
  process (two copy sites; `env.spawn.1`, registry `env.1`, watched red without the copy).
- **Evidence:** `npm run verify` over `8ce16b1` — every suite green, exit 0 (the tallies:
  meta 38, styles 38, viewport 136, groups 6, merged 12, registry 38, layout 233,
  credentials 18, jira 15, github 7, palette 143, rail 183, review 98, subagent 27, file 81,
  toolbox 103, usage 26, machine-cost 7, tmux 35, agent-state 27, agent-session 141, verbs
  14, teammates 25, electron 4, control 15, package 13, pty 10, pty-manager 63, window 4,
  ipc 1, canvas 6, xterm 11, panels core 76 / shell 94 / kinds 48 / agents 77 / product
  57). `npm run verify:visual` 56/56 twice (160.0 s, 160.0 s).

## Act IV — M150, closed 2026-09-07

Build log `docs/build-log/m150-tags.md`. Tags on the vault's lineage by the repo method: red
(`d7d72c4`), feat (`285c4ea`), the critic's wave (`7210ad6`). Declined by name into #85: a
note outside a vault, front-matter tags, tag rename, a tag graph. **Where the ranking
stopped:** IV.2 (a conditional / loop workflow block), IV.3 (#55), IV.4 (#73 + #72), IV.5
(#64) were not started — the brief's "truncate from the bottom".

## Act V — M155, closed 2026-09-07

Build log `docs/build-log/m155-ink.md`. Ink on M93's annotation layer by the repo method: red
(`4c2f5b3`), then the feature. Declined by name into #15's note: highlights, arrows, widths, a
colour, an eraser, behind-the-panels. **Where the ranking stopped:** V.2 (#66), V.3 (the
vibe-coding starter template set), V.4 (#14 xlsx), V.5 (#33 minimap yields — now #83), and the
stretch #14 iframe were not started.

## Act VI — M160, closed 2026-09-07

`package.json` 4.0.0; README status and rows M148–M160; `CLAUDE.md`'s preamble; the
manual-only list (the 100 % density, the blank terminal observation) and the dead-end audit's
fifth walk (M140–M155) current; `docs/release-notes/4.0.0.md` is the release body as a repo
file. The evidence lines (the chain, `verify:packaged`, the tag) follow.

**Evidence (M160):**
- `npm run verify` over `2fdd5b1` — exit 0. Tallies: meta 38, styles 39, viewport 137, groups
  6, merged 12, registry 38, layout 234, credentials 18, jira 15, github 7, palette 143, rail
  183, review 98, subagent 27, file 83, toolbox 103, usage 26, machine-cost 7, tmux 35,
  agent-state 27, agent-session 141, verbs 14, teammates 25, electron 4, control 15, package
  13, pty 10, pty-manager 63, window 4, ipc 1, canvas 6, xterm 11, panels core 76 / shell 94 /
  kinds 48 / agents 77 / product 59.
- `npm run verify:packaged` over the same tree — 12/12, exit 0.
- `npm run verify:visual` — 57/57 twice (166.5 s, 166.2 s), 55 scenes, watchdog 209 s.
- Watchdogs as pinned: core 49 s, shell 96 s, kinds 60 s, agents 109 s, product 98 s.
- The tag `v4.0.0` is on the commit that records this section; the code it tags is
  `2fdd5b1`'s, unchanged by that commit. Nothing pushed.
