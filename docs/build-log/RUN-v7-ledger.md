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
| M150 | IV.1 | The Obsidian panel on the M16/M22/M27 file lineage: wikilinks, tags, backlinks |
| M151 | IV.2 | A conditional / loop workflow block on the live Run caller |
| M152 | IV.3 | #55 — ad-hoc task panels |
| M153 | IV.4 | #73 + #72 — the flag registry and one versioned automation surface |
| M154 | IV.5 | #64 — rationing terminal memory |
| M155 | V.1 | #15 — the annotation layer per its entry (ink, highlights, draw mode over M93's notes) |
| M156 | V.2 | #66 — images in the terminal |
| M157 | V.3 | The vibe-coding starter as a #34 template set (chat + dev shell + browser, #13 briefing) |
| M158 | V.4 | #14 — xlsx, read-only |
| M159 | V.5 | #33 — the minimap, against what M70 already shipped |
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

## Act II — M140–M147 (closing; the Electron tier's tallies follow)

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
