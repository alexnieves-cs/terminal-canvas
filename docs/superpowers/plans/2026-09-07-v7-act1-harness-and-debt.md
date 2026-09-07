# v7 Act I — the harness and the debt (M135–M139): plan

Spec: `docs/superpowers/specs/2026-09-07-v7-act1-harness-and-debt-design.md`. Each task is
red first (the check committed failing), then the implementation, then the fresh-context
critic and verifier over the diff, spec and checks only. One Electron-tier checkout at a time;
`TC_VERIFY_SUFFIX` is this checkout's own.

## M135 — the split

### Task 1 — red
`verify:meta panels-split.1` (the old file gone, every part requiring the harness with a
measured numeric watchdog and a place in the chain) and `panels-split.2` (the id SET of the
parts equals the old file's at `pre-v7-run`, read from git). Committed red.

### Task 2 — the mechanical move, by script, not by hand
The old file is one IIFE: module scope (lines 1–~410: the esbuild, the requires, `ok`,
`waitUntil`, `sessionMap` and the other free helpers), then `app.whenReady().then(async () =>
{` holding the fixtures and the window (lines ~410–1472), then `try {` at 1473 with the
checks to 19,778, then the catch/finally with the tally. The move is a node script over line
numbers, so nothing inside a check is retyped:

- `scripts/panels-harness.cjs` = module scope + the whenReady body up to the `try`, wrapped as
  `runPanelsSuite(name, WATCHDOG_MS, body)`; the `try` becomes `loadFile`, `wc`,
  `bootDefault`, the 35 function-valued helpers the old checks declared at indent 4
  (`clickPanelAt`, `clickPanelBody`, `panelCount`, `viewCentreInWorld`, `backgroundPoint`,
  `cardTexts`, `railPan`, `railAgentState`, `clickRail`, `activeWorkspaceId`, `dockTo`,
  `nodeCount`, `nodeBox`, …), then `const ctx = { …every name declared at indent 0 and 2…,
  state }` and `await body(ctx)`. The catch/finally is the old one, reading `state.tmuxBackend`.
- MUTABLE harness names (assigned inside checks) move onto ONE `state` object, rewritten by
  word-boundary substitution in every file: `backend`, `tmuxBackend`, `exportTarget`,
  `commitIndexSeq`, `pluginFixtureOn`, `trailFixture`, `toolboxRefusedCwd`, `harnessEnvReport`,
  `githubCredentialPresent`, `renamedId`, `attentionPanelId`, `GIT_OK`. A destructured `let`
  would be a copy, and a check's assignment to it would reach nothing — the failure would be a
  fixture that never turns on, with the check beneath it green against the wrong state.
- Five parts, by the old file's line ranges, named by their dominant subject:

| Part | Old lines | Holds |
|---|---|---|
| `core` | 1474–5259 | 24, 18, 1–63: tiering, input, undo, presets, palette, settings, attention |
| `shell` | 5260–9784 | 64–129, memo-stable.1, 122b/c, discard.1: workspaces, merged, rail, inspector, dock, groups, links (M13) |
| `kinds` | 9785–14041 | 131–177, frame.2a, jira-comment.1, link-draw.*, worktree.1, scrollback.1, broadcast.*: usage, file, review, toolbox, jira, link drawing |
| `agents` | 14042–17397 | handoff.*, search.1, attention.1, keyboard.*, theme.1, M46–M52 scoped, composer.*, template.1, run.1, graph.*, tools.*, approve.*, budget.1, memory.1–2, firstrun.1, type.1, snap.1, hover.1, drop.1, export.*, telemetry.4, detail.1, trail.1, flight.1, bookmark.1, recover.1, control.1, supervisor.1, frame.2b, group-keys.1, state-*, find.5, sheet.*, labels.*, context.*, front.*, overview.* |
| `product` | 17398–19778 | chat.*, memory.3, watch.*, vault.1, across.1, github.1, integrations.1, verbs.1, browser.1, header.1, flip.1, board.1, engines, sandbox, skills, workflow.* |

- Each part: `const WATCHDOG_MS = 600000 // provisional` for the first measuring run, then the
  measured figure (Task 4).

### Task 3 — make each part green alone
Run each part; a red from a missing prerequisite (a panel an earlier check minted, a
workspace an earlier check created, a `let` the old file set two thousand lines up) is fixed
by minting it IN THAT CHECK, with a comment naming the old dependency. A check whose
prerequisite cannot be rebuilt in its part moves to the part that has it (the move is a
cut-and-paste of the block; ids never change). The assertion of a check is never touched.

### Task 4 — measure and pin
Two green runs of each part, alone, on this machine; `WATCHDOG_MS` = ceil(1.25 × the slower
of the two / 5 s) × 5 s, with `// measured YYYY-MM-DD: Ns, Ns` beside it (the `panels-split.1`
comment shape). `package.json`: `verify:panels` = the five parts in order, and
`verify:panels:<part>` each. `docs/verify-suites.md`, `CLAUDE.md`'s table row and the
load-bearing entry ("`verify:panels` outgrew its watchdog") updated to describe the split.

### Task 5 — critic and verifier
Fresh-context, over the diff, the spec and `panels-split.1/.2`.

## M136 — `npm run handcheck`
1. Red: `verify:meta handcheck.1` (every HAND title in `scripts/handcheck-steps.cjs` appears in
   `docs/load-bearing.md`'s manual-only block; `package.json` has `handcheck`; the script is not
   in the `verify` chain).
2. `scripts/handcheck-steps.cjs`: the eleven, each `{ n, title, arm: 'auto' | 'hand', steps?,
   run? }`. `scripts/handcheck.cjs`: walks them, prints the three line shapes, exits non-zero on
   AUTO FAIL only. The Electron arm (5) is a child `ELECTRON_RUN_AS_NODE=1` process over a
   tiny `scripts/handcheck-trash.cjs`.
3. Automated arms: 2 (real `claude plugin list --json` through `parsePluginList`), 5, 7 (real
   `createSkill` under a temp `TC_TOOLBOX_HOME`), 8 (the real shelf rename over an occupied
   slot).
4. The seven HAND entries' steps replace the one-line bullets in `docs/load-bearing.md`'s
   M126–M133 manual-only block and are copied into the ledger.

## M137 — the sweep
One commit per file, in the log's order; each bullet's verdict in the commit body; a declined
one appended to `docs/ideas-backlog.md` under a `## Deferred from M126–M133` heading with the
reason. The two that gain checks: `verify:meta harness.1` (the panels harness refuses to start
without `TC_TOOLBOX_HOME`… — actually the harness SETS it, so the check is that the set
happens before the entry is required); `verify:rail workflow.fire.1` (Triggers disabled with
`workflowFireRefusal` on a blocked template).

## M138 — the Run caller
1. Red: `verify:agent-session pool.2a–d` (the caller over the fake runner: N workers minted
   through `agent:create`, the `pool` events on `agent:event`, `stop`, the budget interrupt),
   `verify:layout workflow.2` (`ChatSource.orchestrator` carried), `verify:panels` product
   `workflow.run.1` (Run on a pool template through the real panel).
2. `main/pool-caller.ts` (main's half: list read under the Places gate, the mint through the
   ordinary create+send, the handle map), `agent:pool-start` / `agent:pool-stop`, the `pool`
   arm on `agent:event`, the diagram in README and CLAUDE.md, `EXPECTED_CHANNELS` 122.
3. `workflowBlockRefusal` narrowed; `WorkflowNode` gains `Stop` and the Runs tab's per-item rows.
4. `carryChatMarks` carries `orchestrator`; `collect` through `joinAdvance`.

## M139 — CI and the audit
1. `verify:pty` 8 and 9: SKIP-shaped when `which` finds nothing, real path + version
   assertions when it does. Commit; the ledger records run 34101554825 and the push command.
2. The fourth dead-end audit: `docs/dead-end-audit.md` gains "## Walked again at 3.1 → 4.0
   (M139)" over every surface since M124; new `REASON_*` constants pinned by `audit.1`; a real
   Tab through the Skills pane and the workflow panel (`reach.3`).
