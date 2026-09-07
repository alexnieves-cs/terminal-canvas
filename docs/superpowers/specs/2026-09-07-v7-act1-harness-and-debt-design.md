# v7 Act I — the harness and the debt (M135–M139): design

Written 2026-09-07 against `dff0f96` (3.1.0, `pre-v7-run` + the Act 0 commit). Unattended run;
the brief pre-answered every question, and this spec records the answers as decisions.

## What Act I is for

The M126–M133 act left five owed things, each named in its own build log rather than dropped:
`verify:panels` outgrew its watchdog while green (the split "is owed, not smuggled in"); eleven
hand checks a green `npm run verify` is silent on; a by-file list of deferred minors; a pool
engine with no production caller; and a CI workflow that has been red on `main` for three pushes
at a check about the runner rather than the code. Act I pays those five. Nothing here is a
feature; every milestone leaves the app doing what it did with the proof shorter, wider, or
honest about what it cannot see.

## M135 — split `verify:panels`

### The shape

`scripts/verify-panels.cjs` (19,813 lines, 357 checks, one serial IIFE) becomes one HARNESS
plus N PARTS:

- `scripts/panels-harness.cjs` — everything the file did before its first check: the esbuild of
  `panels-entry.cjs`, the fixtures, the fake `ipcMain` wiring, the window, the seed PTY, the
  socket, the watchdog, the teardown and the tally. It exports `runPanelsSuite(name, watchdogMs,
  body)`; `body(ctx)` receives every value the old file held at the IIFE's top level, plus the
  indent-4 helpers the checks shared (`clickPanelAt`, `panelCount`, `railPan`, `dockTo`,
  `nodeBox` and their siblings — 39 declarations, listed in the plan). The `let`s a check
  assigns and the teardown reads (`tmuxBackend`) live ON `ctx`, never destructured.
- `scripts/verify-panels-<part>.cjs`, one per part, each `runPanelsSuite('<part>', WATCHDOG_MS,
  async (ctx) => { …its checks, moved verbatim… })`. Check IDS DO NOT CHANGE — hundreds are cited
  in `CLAUDE.md`, `docs/load-bearing.md` and `docs/verify-suites.md`, and a renumber is the
  failure the scoped-id convention exists to prevent.
- `npm run verify:panels` becomes the chain of the parts, in order, so every existing document
  that says "run `verify:panels`" stays true; each part is also its own script.

### Parts, and why these cuts

Cut where the running app's state stops being assumed. The analysis in the plan found the true
cross-check state small (39 indent-4 declarations, four of them mutable), and the cost of a
split is not the lexical state but the RENDERER's: a check that assumes panels `n1…n27` from
earlier checks exist. Each part therefore boots a fresh renderer and mints what it needs, and a
check that read a sibling's panel is given its own — the fix is a spawn line in the check,
never a shared file. Five parts, named by subject:

| Part | Subject | Checks (by the old file's order) |
|---|---|---|
| `core` | tiering, culling, drag/zoom/spawn, keyboard, the palette over terminals | 1–60 and the numeric checks that only need terminals |
| `shell` | rail, dock, inspector, workspaces, merged view, groups, bookmarks, flights | the M2x–M6x shell checks |
| `kinds` | review, file, toolbox, jira, github, memory, vault, browser, export | the per-kind checks |
| `agents` | chat, approvals, handoff, runs, templates, supervisor, watchers, routines | M71–M101 |
| `product` | board, engines, sandbox, search, skills, workflow | M113–M133 |

The exact assignment of every check to a part is the plan's table; a check that fits two goes
where its FIRST prerequisite is minted.

### The watchdogs

Each part's `WATCHDOG_MS` is **1.25× its own measured green run**, rounded up to the next 5 s,
measured ALONE on this machine and recorded beside the constant with the date and the two
figures. This is the rule the M130 note asked for and could not meet for a 311 s suite whose
contended run reached 480 s; a 60 s part's 75 s ceiling sits under no observed flake because a
part that short is not on the machine long enough to be starved. The old 600 s constant is
deleted with the old file. Nothing is raised: five ceilings that sum to less than 600 s and each
fail a real hang in about a minute is the fix the note named.

### What is pinned

- `verify:meta panels-split.1` — `scripts/verify-panels.cjs` no longer exists; every
  `scripts/verify-panels-*.cjs` requires the harness and passes a numeric watchdog with a comment
  naming its two measured runs; `package.json`'s `verify:panels` names every part file and no
  other.
- `verify:meta panels-split.2` — the SET of check ids across the parts equals the set the old
  file held at `pre-v7-run` (read from `git show pre-v7-run:scripts/verify-panels.cjs`): nothing
  lost in the move, nothing added under an old id. Computed once in the check, not a stored
  list.
- The total across the parts is 338/338 at the split's own commit, then whatever later
  milestones add.

### Not in scope

Making any check faster; touching a check's assertion. A check that goes red in its new part
is fixed by minting its prerequisite, and if it cannot be made green in isolation the part's
log says why and the check moves to the part that has its prerequisite.

## M136 — `npm run handcheck`

### What it is

A plain-node script, `scripts/handcheck.cjs`, NOT in `npm run verify` (it reaches the real
machine: a real `claude`, the real Trash, a real `~/.claude`), gated the way `verify:packaged`
is. It walks the ELEVEN owed checks from `docs/build-log/m126-m133-act3-skills-and-workflows.md`
§Owed hand checks, in that order, and for each prints one of three lines:

- `AUTO PASS/FAIL <n> <name> — <evidence>` — the check is provable by a script on this machine,
  and was run.
- `SKIP <n> <name> — <what is missing>` — provable but the machine lacks the thing (no `claude`,
  no plugin, no network), named.
- `HAND <n> <name>` followed by the exact numbered steps a person performs and what they must
  see — the same text `docs/load-bearing.md`'s manual-only block carries, read from ONE source
  (`scripts/handcheck-steps.cjs` exports both the automated arms and the human steps, and
  `verify:meta handcheck.1` pins that every HAND step's title appears in the manual-only block).

Exit code: non-zero on any AUTO FAIL; HAND and SKIP never fail (a person has not done them, and
the script says so rather than pretending).

### The eleven, decided

| # | Owed | Arm | Why |
|---|---|---|---|
| 1 | The trail against a real agent | HAND | needs a logged-in `claude` invoking two skills interactively; a `-p` run may invoke none |
| 2 | `claude plugin list --json` on another machine/version | AUTO (SKIP without `claude`) | runs the real CLI, parses with the shipped `parsePluginList`, reports the version and the arm it took |
| 3 | A pool of N against a real budget, real `AgentSessionManager` | HAND | spends money by design; the steps set `agents.budgetUsd` low and watch the interrupt |
| 4 | A saved `SKILL.md` still loading in the CLI | HAND | no suite runs a skill; steps name the edit and the `/skill` to invoke |
| 5 | `shell.trashItem` on this machine | AUTO (Electron) | `handcheck` launches Electron as node for this one arm: trashes a temp file, asserts it left its dir; the Trash gains one file, named |
| 6 | The >40-skill truncation notice | HAND | a real session with 41 skills; the fixture arm is already `trail.more` |
| 7 | A first-ever skill with no `~/.claude/skills` | AUTO | the real `createSkill` under a fresh temp HOME through `TC_TOOLBOX_HOME`'s fence, asserting the `mkdir` arm |
| 8 | A rename into an OCCUPIED shelf slot | AUTO | pure: `renameOnShelf` (or its real name) over a shelf whose destination key is taken, asserting the column afterwards |
| 9 | `--append-system-prompt` surviving an orchestrator RESUME | HAND | M81's rule for this block kind needs a real resume |
| 10 | A `collect` join against real workers | HAND | needs M138's caller and real agents |
| 11 | A workflow watcher ARMED for real | HAND | an interval in the running app; steps name the ledger row |

Four automated, seven human. The seven go into the ledger and the manual-only block as exact
steps, replacing the current one-sentence bullets.

## M137 — the deferred-minors sweep

Every bullet under "Deferred minors, by file" in the M126–M133 log is either FIXED (with a
check where one is cheap) or DECLINED BY NAME into `docs/ideas-backlog.md` with the reason. The
list has 32 items across 16 files; the plan carries the verdict per item. Two are not minor and
get their own check: the `verify:panels` guard that `TC_TOOLBOX_HOME` is set at suite start
(after M135, the harness's — a suite that runs the real skill writers unfenced writes into the
user's `~/.claude`), and `WorkflowNode`'s Triggers staying enabled on a blocked workflow
(`workflowFireRefusal`). The rest are one-line fixes or a rewritten comment.

## M138 — a production Run caller for `pool` / `orchestrator` / `collect`

### The decision

The brief allows deleting the three block kinds only "if measured wrong". They are not: the
pool's checks are green against a fake and the refusal is honest. What is missing is the seam
between `instantiateTemplate` (the renderer's, M80) and `startPool` (main's, M132). The caller:

- `agent:pool-start` / `agent:pool-stop` — two invokes (the diagram in both files gains them;
  `EXPECTED_CHANNELS` goes to 122). `pool-start` takes the template id, the block key and the
  cwd; main reads the list file, mints each worker as an ordinary `agent:create` + `send`
  (the M100/M120 gates unchanged — a worker is a chat with a teammate or a sandbox like any
  other), and drives `startPool` with `createWorker` = that mint, `finished` = the session's
  `result`, `interrupt` = the manager's, `limits`/`spend` = M82's live reads. Main owns the
  handle; `agent:event` carries a `pool` event so the workflow panel's Runs tab shows
  `started / queued / finished / stopped(why)` per item.
- `orchestrator` — a chat minted with the block's prompt through `--append-system-prompt` on
  EVERY spawn (`ChatSource.orchestrator`, carried by `carryChatMarks`; the M81 rule, and the
  resume half is hand check 9).
- `collect` — M78's `joinAdvance` unchanged: the collect node is a chat whose incoming edges
  from the pool's workers are `exit`-triggered handoffs, so the join fires once, payloads in
  panel order; a `target` that is a file path is written by main under the run's own directory
  and named in the chat's first message.
- `workflowBlockRefusal` narrows to what is STILL refused: a pool whose `list` is not inside a
  place (the Places gate on the file, by name), and nothing else. `Run` on a blocked template
  becomes `Run` on a running one, with `Stop` beside it while a pool is live.

The renderer never spends: every mint goes through `agent:create`, and the budget stop is
main's. `verify:agent-session pool.2` drives the caller end to end over the fake runner;
`verify:panels` (part `product`) `workflow.run.1` drives Run on a pool template through the
real panel and asserts the Runs tab's rows.

## M139 — CI at its cause, and the fourth dead-end audit

- `verify:pty` 8 asserts `claude` is on the login shell's PATH and 9 that `codex` is — facts
  about the machine. On the runner neither is installed, and 9 PASSES anyway because
  `/codex/.test('codex not found')` is true: a vacuous check beside a red one. Both become the
  suite's existing SKIP shape (`verify:pty-manager` 11–15: a literal `true` with the reason and
  the install line) when `which` finds nothing, and REAL assertions (the resolved path and a
  version line) when it does. The tally on this machine stays 10/10; on the runner it reads
  10/10 with two SKIP lines instead of 9/10.
- The workflow itself stays one job (its own comment says why). The Node 20 deprecation
  warning is the actions' runtime, not ours, and is left.
- **A green run id cannot be produced by this run**: the brief forbids a push, and
  `workflow_dispatch` runs the branch as the remote has it. The ledger records the last run id,
  its cause, the commit that fixes it, and the command that produces the green run
  (`git push origin main`, then `gh run watch`) as the first of the two next commands.
- The fourth dead-end audit walks every surface added since M124 — the Skills pane, the skill
  panel, the editor, the trail lane, the workflow panel, Assignments, and Act I's own Runs tab
  and `Stop` — by the M94/M124 method (source, the palette suite's six contexts, a REAL Tab),
  appends to `docs/dead-end-audit.md`, and pins every new `REASON_*` in `verify:meta audit.1`.

## Order

M135 first (every later milestone's panels checks land in a part). M139's pty fix is one commit
and can land any time; the audit is last, after M138's surfaces exist.
