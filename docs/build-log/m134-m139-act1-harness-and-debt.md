# v7 Act 0 and Act I — the baseline, the harness and the debt (M134–M139): build log

`main`, 2026-09-07, from `pre-v7-run` (= `328e087`). Spec:
`docs/superpowers/specs/2026-09-07-v7-act1-harness-and-debt-design.md`. Plan:
`docs/superpowers/plans/2026-09-07-v7-act1-harness-and-debt.md`. Ledger:
`docs/build-log/RUN-v7-ledger.md` (the milestone map, every decline by number, the evidence
lines). One log for Act 0 and Act I, a section per milestone. Unattended run; every question
was pre-answered by the brief, and the deviations below are the places the answer and the
code disagreed.

## M134 — Act 0

- `pre-v7-run` tagged at `328e087`, clean.
- Baseline `npm run verify`: exit 0, 7:30, 33 suites, `verify:panels` 338/338 (the tallies are
  in the ledger). `verify:panels` alone, three times: 321.4 s, 321.9 s, 322.1 s.
- 3.1.0 (`dff0f96`): the M126–M133 act had shipped rows under no version.
- CI: the last three runs on `main` red at `verify:pty` 8 — `claude` absent on the runner —
  and 9 vacuously green (`/codex/` matches `codex not found`). Run id 34101554825.
- `pool-runner.ts` had no production caller (confirmed by grep; M138 gives it one).
- The eleven owed hand checks and the 32 deferred minors carried into M136 and M137.

## M135 — the split

### Red first

`verify:meta panels-split.1` (the old file gone; every part requires the harness, carries a
MEASURED numeric watchdog with its date and two figures, and is in the chain) and
`panels-split.2` (the parts' check-id set equals the old file's at `pre-v7-run`, read from
git — 222 literal ids; the `IDS[…]` blocks move with their arrays). `8d7b8d3`, red.

### The move

By a node script over the old file's line numbers, never by hand: the harness is the module
scope plus the whenReady body up to the `try`, wrapped as `runPanelsSuite(name, watchdogMs,
body)`; the fourteen function-valued helpers the old checks had declared at indent 4 are
hoisted beside `wc`; the twelve mutable harness names live on `ctx.state` as getters and
setters (a destructured `let` is a copy); the parts are five line ranges, each destructuring
the 191 ctx names. Boundaries were chosen where the old file's bracket depth returned to
zero — the first cut at 9785 sat one block deep (the `GIT_OK` else-arm) and moved to 10552.
The rewrite of mutable names had to be string-aware: the first pass turned `scrollback.1`'s
printed sentence into `direct state.backend`, and a second pass had to reach into `${…}`
holes of template literals, where the harness's own expressions live.

### What the parts were missing, and where each fix went

Every red after the move was a prerequisite an earlier check had provided, never an
assertion, and each fix says which check used to provide it:

| Part | Red | Cause | Fix |
|---|---|---|---|
| shell | 87 | the first pty:list key was a hidden workspace's | pick a session whose panel is live in the DOM |
| shell | 93 | no restored-dormant panel left (84 seeds one, 85 wakes it) | seed one the way 84 does when none is left; prefer `dormant === true` over `spawned === false` (a fresh mint waiting on its lazy spawn has an enabled restart) |
| shell | 106 | the coordinate click landed on 104/105's review node, which sat on top | select through the rail row (100b's own finding) |
| shell 114/115/124/156, kinds `scrollback.1`, agents `sheet.3/4`, `front.1/2`, product `editor.1d` | after a reload the panel was live, or a new `n1` attached to the old `n1`'s shell | check 26 had installed `attachPtyLifecycle(win, () => ptyManager.detachAll())`; every later part installs it at its start |
| kinds 91/107 arms, `scrollback.1`, the link block | `state.tmuxBackend` was null (check 26 created it) | every later part creates the tmux backend on `PANELS_SOCKET` at its start, current or not as the old file had it at that line |
| agents `handoff.2` | hC's card sat outside the canvas host once `showSentences` had opened the inspector | the rail row's start control when the card is not clickable |
| product `editor.1d` | a hidden window's page is unfocused: `sendInputEvent` moved `activeElement` but raised no focus event, so the editor's keyboard flag never armed (`flag: false` from a hook added for the purpose) | `wc.focus()` before the real click |

Two runs of every part were green before the watchdogs were pinned.

### The numbers

| Part | Checks | Green runs (s) | Watchdog |
|---|---|---|---|
| core | 71 | 31.2, 31.0 | 40 s |
| shell | 92 | 75.8, 75.4 | 95 s |
| kinds | 47 | 44.6, 44.8 | 60 s |
| agents | 76 | 86.6, 86.8 | 110 s |
| product | 54 | 74.5, 74.7 | 95 s |

340 checks (338 moved, `workflow.run.1` and `reach.3` added by M138/M139); the five ceilings
sum to 400 s where one 600 s ceiling stood, and each fails a real hang inside two minutes.
`npm run verify:panels` is the chain of the five; `verify:meta` 19 reads the chain
transitively so a part is wired through it.

### Deviation from the spec

The spec's part table put attention (54–63) in `core` and the M61–M74 surfaces in `shell`;
the line-range cut put attention in `core` as planned and the scoped M41–M74 blocks in
`agents`, because that is where the old file held them and a check moves only when its
prerequisite is elsewhere. The names describe the dominant subject, not a curated set.

## M136 — `npm run handcheck`

Red: `verify:meta handcheck.1` (`7938f6a`). `scripts/handcheck-steps.cjs` is the one source;
`scripts/handcheck.cjs` walks it; `scripts/handcheck-trash.cjs` is the Electron arm. First run:
arm 5 failed because `require('electron').shell` is undefined under `ELECTRON_RUN_AS_NODE`
(the module is the binary's path there) — it is a real Electron process now, no window; arm 7
failed because `createSkill` answers `created`, not `written`. Second run: 4 automated
passed, 0 failed, 7 for a person, exit 0. The seven HAND steps replaced the one-line bullets
in `docs/load-bearing.md`'s manual-only block and are in the ledger.

## M137 — the sweep

Red: `ee6ab75`'s parent (`check(m137)`) — rail `workflow.trigger.1` / `workflow.fire.1` red,
layout `runs.templateId.1` red, toolbox `skill.sibling.1` and file `trail.stamp.1–.2` as pins.
The verdicts per item are in `docs/ideas-backlog.md` under "Deferred from M126–M133": nine
fixed, three pinned, six already fixed by the act's own final review wave, the rest declined
with a reason each. The one finding that was not minor: Triggers stayed enabled on a blocked
template and the fire path minted nothing without a word.

### Deviation from the plan

The plan said one commit per file; the sweep landed as one `check` commit and one `fix`
commit with the verdicts in the backlog, because most items were a line each and a per-file
commit would have been a commit per line.

## M138 — the Run caller

Red: `d92422a` (agent-session `pool.2a–d`, `verify:ipc` at 122, layout `chat.orchestrator.1`)
and `a7940b9` (palette `workflow.2a` rewritten to the new rule, product `workflow.panel.1e`'s
Run enabled and `workflow.run.1`). The first implementation threw from `createWorker` on a
refused mint; the suite showed the throw rejecting the engine's own pump, and the caller now
returns an empty id and mutes the pool. The panels harness's fake agent handlers lacked
`poolStart`, so the first end-to-end run refused with `agents.poolStart is not a function`;
the harness now wires the real caller over its real manager and fake runner, the way
`main/index.ts` does. `workflow.run.1` first asserted Stop mid-run; the fake runner answers
each worker in milliseconds, so no instant has a pool live to stop — the check asserts the
completed shape (`done — every item finished`, Stop present and disabled by name) and Stop's
live arm is `pool.2c`'s.

### Known gap, carried

A `collect` joined by workers minted after its first arrival joins an expected set that
grew under it (M78's `joinAdvance` counts the edges present at the moment). Hand check 10
owns it; `CLAUDE.md`'s M138 entry says so.

## M139 — CI and the audit

`verify:pty` 8/9 became machine facts with a SKIP arm (committed with `7938f6a`); a green CI
run needs `git push origin main`, which this run may not make — the ledger carries the
command. The fourth audit is `docs/dead-end-audit.md`'s "surfaces since M124" section;
`reach.3` is the real Tab through the workflow panel and the Skills pane.

## Owed at the act's close

- CI green: `git push origin main` then `gh run watch` — the first of the two next commands.
- The seven HAND checks (M136), unchanged.
- The `collect` join's growing expected set (M138), hand check 10.
