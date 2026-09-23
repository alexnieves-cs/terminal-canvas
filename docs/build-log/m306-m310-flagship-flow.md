# M306–M310 — the flagship flow: evidence, review, decisions, return

Five product asks, built 2026-09-22 on local `main`, uncommitted (the tree also holds other
sessions' work). Each milestone is pure model first (plain-node checks), then the surfaces.

| # | Ask | Milestone |
|---|---|---|
| 4 | Keep the exact output of each check | **M306** check-output records |
| 3 | An exceptional review experience | **M307** comments, follow-up, finished ≠ verified |
| 5 | "Needs you" as a decision inbox | **M308** decision inbox |
| 2 | Returning to work almost effortless | **M309** return briefing |
| 1 | One complete workflow, exceptionally easy | **M310** flagship joins + onboarding |

M306 went first because M307 and M309 read what it records.

## M306 — a check run keeps its own output

Phase E handed per-command output capture to "Phase F by name" (m300-m302 ledger, Found /
deferred). This takes it, keeping BOTH reasons the decision was made for: no second
scrollback (a record per RUN, written once whole, never appended) and nothing in the
pasteable ledger (the row carries a reference, `RunRow.outputId`). The load-bearing entry is
amended in place (`docs/load-bearing.md`, "A watcher's output tail is memory only…").

| Piece | Where | Check |
|---|---|---|
| Head+tail capture, closed-alphabet run id, record parse, display (ANSI stripped, `\r` redraws collapsed) | `shared/check-output.ts` | `verify:file check-output.1` |
| One file per run, queued, memory-first reads, id validated before it is a path, pruned by count | `main/check-output-store.ts` | `check-output.2` |
| Watcher runs: id minted at START, record + row land together after the one `tested` stamp | `main/watch-runner.ts`, `bootstrap/watch-handlers.ts` | `check-output.3` |
| Shell commands: bytes between OSC 133 C and D via `scanChunk`'s parallel `ends` | `main/pty-manager.ts`, `main/agent-state.ts` | `verify:agent-state osc133.ends.1` |
| `RunRow.outputId` read back; `parseEventRow` now keeps `tested` (it was dropped on read) | `run-ledger.ts` ×2 | `check-output.4` |
| `check:output`, appended LAST to `registerIpcHandlers`, mirrored in the panels harness | contract, preload, `ipc.ts`, `index.ts`, `panels-harness.cjs` | `verify:ipc` 1 (150), `verify:meta` 14 |
| One reader for every surface | `renderer/checks/CheckRunOutput.tsx` — Checks tab, watcher node's "Whole output", review, briefing | — |

**The honest limit, named:** a command an agent CLI runs inside its own process has no marks
and no record; it stays a `CheckClaim`. A check is witnessed when a watcher or a login-shell
terminal ran it — which is why M310 gives the review a "Run checks" that makes one.

## M307 — the review, together

`shared/review-comments.ts`: comments addressed by path, side and line (new
`DiffLine.oldNo/newNo` from `parseDiffLines`), quoting the line as it read; `composeFollowUp`
(numbered points, the failing checks' own last lines, unconfirmed criteria); `verificationOf`
— **verified** is a conjunction (review current, a witnessed check passed on this content, none
failed, every comment resolved, every criterion confirmed); anything short reads
**"agent finished — not verified"** with the missing parts listed. It trusts
`bindCheckFreshness`'s per-check binding rather than comparing to one identity (a watcher
stamps against HEAD, a lane against its fork point).

Comments and confirmed criteria ride the work item (`comments`, `criteriaMet`; field-level
parse, the `reviewed` rule). The review node's task section gains `TaskReviewPanel`: verdict,
outcome, criteria checklist, witnessed checks (failures first, each opening its own output),
comments with Resolve/Remove, and the follow-up SHOWN WHOLE with **Send to agent** (a hand-off,
like dispatch) and **Edit in conversation** (M80's insert). The diff gutter takes a comment on
any numbered line. Orchestrate's workbench shows the same verdict line under freshness.

Checks: `verify:review review-comment.1–.4`; `verify:rail state.2` forced `agentWorkingOf`.

## M308 — the decision inbox

`renderer/shell/decision-inbox.ts` over the SAME phantom-filtered queue: each item has a kind,
a blocker sentence, context (a directory; a terminal's last line or a chat's last words,
scrubbed by `outward` at the read), how long it waited, and what deciding it **unblocks**
(transitively over enabled hand-off links; a bare link blocks nothing). Order: most unblocked,
then longest waiting — with no hand-offs that IS the queue's arrival order, so every existing
order check keeps its meaning. Identical requests (tool, full action, directory) from several
agents are one decision with **Allow all N once / Deny all N** (each request still answered
individually; no bulk session grant). Snooze is a VIEW (15 min / 1 h / 4 h, pruned as items
leave, forgotten on relaunch): the badge counts what is not snoozed, the popover lists snoozed
decisions with Wake, and ⌘J / the pill walk `jumpOrder` (inbox rank, snoozed skipped).

Checks: `verify:rail inbox.1–.4`.

## M309 — the return briefing

`renderer/shell/presence.ts`: last-seen in localStorage (written each minute while focused, on
blur and unload); a relaunch or a refocus after ≥ 20 min sets `awaySince`. `shared/return-
briefing.ts`: per task, from the durable timeline since then — **finished** (runs, each opening
its own output record; the agent's reply), **changed** (events; the lane's diff as a fact now,
only when something happened), **needs your decision** (the inbox, including snoozed), and
**next** (a decision, else a failed check, else the handoff's action). A quiet task is counted,
not listed. `ReturnBriefing.tsx` takes the Resume banner's slot while there is a return.

Checks: `verify:review brief.1–.3`, `verify:rail presence.1`.

## M310 — the flagship joins

`shared/task-flow.ts`: `dispatchMessage` (the first message now carries the intended outcome
and every criterion — the dispatch dropped them), `suggestCheckCommand` (only what the lane
declares), `prBody` (outcome, criteria ticked by confirmations, witnessed checks with tested
revision, the verdict said plainly when NOT verified; no evidence section when none was
gathered). The PR body passes `outward` before it is POSTed.

Start work gains **From issue** (GitHub + Jira open issues; picking one names the task and,
for GitHub, the repository) and **Outcome / Done when**. The review gains **Run checks in the
lane…** (a watcher in the lane, created in main first, run once, left disarmed) and **Open
pull request**. The Inspector shows the task's chain — issue → conversation → preview → review
→ checks → PR — each step a place to go or the words for what makes it. The first-task hint is
the **flagship guide**: a five-step rail read off the task's real state, its one verb opening
the review.

Checks: `verify:review flow.1–.3`, `verify:first-run fr.flagship.1`, `verify:rail chain.1`.

## Gate

Plain tier: all 34 affected suites green after one fix (`verify:meta 14`, README channel).
Build green. Electron tier, serial under `/tmp/tc-electron-lock`: canvas, xterm, panels:core,
shell, kinds and orchestrate green. The reds are all attributed, none this run's:
`panels:product` — the eight recorded at `m277-libraries.md:78` (`workflow.*`, `reach.1`),
`starter.1` (red on main, recorded), `review.task.2` (its `contDisabled: null` is the
finish-work session's Continue → "Continue in a new conversation…" change); `panels:agents` —
`detail.1` (recorded at `m275-swarm-presets.md:107`) and `template.1` (red before this run,
noted by the attention-queue session).

Fresh-context critic (outward gate, the store's path handling and IPC door, capture races,
hooks, Allow-all, badge counts): nothing at its reporting bar. Two observations kept as named
limits: a login-shell command killed between C and D gets no record (as before M306 — the
watcher's `remove()` does record one), and Start work writes the outcome/criteria a second
time after `addWorkItem` because the dedupe keeps an existing card's own fields.

## Owed

- Goldens: attention popover, review node (task section), Orchestrate Changes tab, inspector,
  first-task hint, and a new briefing scene — none regenerated; a critic's sentence first.
- Electron checks for the new surfaces (comment gutter, Send, Run checks, inbox snooze,
  briefing evidence buttons) — the models are pinned in plain node, the DOM is not yet.
- Measuring M306's capture on a hot session (a chatty test runner through a login shell).
