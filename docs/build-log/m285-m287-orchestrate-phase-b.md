# M285–M287 — Orchestrate Phase B (evidence workbench)

The state of this run lives here, not in any session's memory. Spec:
[docs/orchestrate-reference-plan.md](../orchestrate-reference-plan.md) (Phase B row of
"Ordered delivery plan"); run prompt:
[2026-09-19-orchestrate-phase-b-run-prompt.md](../superpowers/specs/2026-09-19-orchestrate-phase-b-run-prompt.md).
Phase A's ledger is [m283-m284-orchestrate-phase-a.md](m283-m284-orchestrate-phase-a.md).

- Branch `m285-orchestrate-phase-b`, worktree `../tc-orch-phase-b`, off main `ceb6851e`.
- Numbering: `M285`/`M286`/`M287` were free on 2026-09-19 — no hit in `docs/build-log`, none in
  `git log --all`; `docs/design/orchestrate-preview.html` says "M285" as sample text only.
- **The user's uncommitted `Canvas.tsx` / `shell/useShellChrome.ts` edits on main are NOT on
  this branch**, by the run prompt's rule: the worktree is off committed main. Phase B DOES
  change `Canvas.tsx` (the Orchestrate mount gains props, the workspace save gains a field), so
  the merge into main will meet the user's edits in that file — expected, and theirs to resolve.
- The spec, the run prompt and `docs/design/` are UNTRACKED in main's tree (the user's), so they
  are not on this branch; the links above resolve in main's checkout.

## Goal

Orchestrate gains an evidence workbench: a review is bound to the CONTENT it reviewed, a check
is bound to the revision it tested, and a resizable Changes · Checks · Output workbench shows
both beside the task's brief — with every unavailable fact said rather than left blank.

## Exit criterion (stop here)

From the plan: *a same-size edit invalidates the prior review; a changed revision makes check
evidence stale; unavailable data is explicit.* Shown by driving the real app, with what was seen
recorded below; then `npm run verify`, every red reported, and a fresh-context critic on each
changed scene and on M285's snapshot policy. No goldens written, no merge, no push.

## M285 — Review content identity

- [x] `ReviewIdentity` — base revision + content hash — defined in `shared/review-identity.ts`
      with the snapshot policy in its header (and below).
- [x] Computed in MAIN (`review-engine.ts`); every `clean`/`changes`/`shared` answer carries it.
      The renderer stores and compares, never recomputes.
- [x] Persisted `reviewed` gains `identity`, compatibly: old records parse, and one without an
      identity reads as freshness `unknown`, never `current`.
- [x] Commit and discard re-read the subject's identity immediately before writing and refuse by
      name (`subject-moved`) when it moved.
- Checks: `verify:review review-id.1–.4`, `verify:layout work.review-id.1`.

### Snapshot policy (what the identity covers)

`ReviewIdentity = { base, content }`. `base` is the commit the review compares against (a
session's baseline sha, or a lane's fork point). `content` is the first 32 hex characters of a
SHA-256 over, in order:

1. `git diff --binary --full-index --no-ext-diff --no-color <base>` run in the subject tree —
   every tracked file's uncommitted change against `base`, INCLUDING binary files (as binary
   patches), mode changes, renames and deletions. The index is not consulted separately: the
   working tree is what a reviewer sees, so it is what is hashed.
2. For each untracked, non-ignored file (`git ls-files --others --exclude-standard`, the same
   list the review's file rows come from), its path and its `git hash-object` blob id, one per
   line, in git's order.

Ignored files (`.gitignore`, build output) are excluded on purpose: they are not in the review
either. Submodule pointer changes appear in the diff as gitlink lines and are covered as bytes.
If either git call fails, the identity is ABSENT and never reads as "fresh": a mark with no
identity reads `unknown`, a mark judged against a current read with none reads `stale`, and the
workbench words the second as "could not be re-read", never as movement it did not see. A clean
tree's identity is `{ base, hash('', '') }` with no extra git call.

After the critic (see Gate): the diff bytes are read RAW (latin1, byte for byte — under utf8 two
Latin-1 edits hashed alike) and the diff's config is pinned with `-c` (`CONTENT_DIFF_CONFIG`:
renames, algorithm, context, prefixes, indent heuristic, submodule handling) so two machines hash
one tree alike. **Not covered**, and said on the type: a submodule's own dirty tree (only the
pointer is hashed), an untracked file's mode bit and a symlink's target, the index on its own,
anything past the runner's 64 MB stdout cap, and an untracked set past ARG_MAX, a dangling link
or a nested repository — each of those leaves the identity absent (unknown) while it lasts. A
lane whose HEAD advanced (the agent committed) reads stale by the two-part rule: a new base is a
new subject, not a bug.

## M286 — Revision-bound check evidence

- [x] One evidence record per check (`shared/check-evidence.ts`): command, execution context,
      outcome (`passed | failed | running | not-run | unknown | stale`), timestamp, tested identity.
- [x] Sourced from the run ledger and watcher outcomes; the ledger row now records the identity
      the subject had when the command ended. Agent prose is never parsed; a transcript claim is a
      `CheckClaim`, shown as a claim, never a result.
- [x] `stale` when the subject's identity has moved past the one tested.
- [x] Generic commands: exit outcome plus raw output; no structured adapters (Phase F).
- Checks: `verify:review check-fresh.1–.4`.

## M287 — Workbench and brief

- [x] Resizable bottom workbench on Orchestrate: Changes · Checks · Output (no Artifacts/Timeline
      stubs). Bound to the selection; pinned, it names what it is pinned to. Height and tab saved
      PER WORKSPACE, which also persists Phase A's in-memory prefs.
- [x] Changes: changed-file tree + readable diff at usable width + M285 freshness.
- [x] Checks: M286 records; a failed check opens its command, context and output.
- [x] Brief and acceptance criteria on a task: persisted compatibly, editable in the inspector,
      shown beside Changes. Editing launches nothing.
- [x] Unavailable data explicit: non-Git folder, no baseline, no checks run, ledger unreadable.
- Checks: `verify:orchestration workbench.1–.3`, `verify:layout orchestrate.1`, `work.brief.1`,
  `verify:panels:agents orch-bench.1–.4` (the exit demo, read off the DOM and the layout on disk).
- Commit/discard stay on the review node ("Review on canvas"); the workbench's one write is the
  person's mark, through the board's `patchWorkItem`. Bringing commit/discard across through the
  same executor with the M285 re-check is logged under Found / deferred.

## Exit demo (what was seen driving the real app)

Driven 2026-09-19 through the real built renderer and the panels harness (real
`AgentSessionManager` under the recorded-turn fake CLI, real git, real review engine, real
worktree manager, real watch runner, real run ledger — the harness mirrors `stores.ts`'s
M285/M286 wiring). `verify:panels:agents orch-bench.1–.4`, green at 92/93 (the red is the
pre-existing `detail.1`), captured with `TC_DEMO_SHOTS=/tmp/tc-phase-b-demo` (nine PNGs,
`m287-1…9`). As in Phase A, a hidden window's `capturePage` can lag the DOM by a step
(`m287-7` shows the failed row before its detail opened); where a capture and a check
disagree, the check's DOM read is the fact.

1. **A task with a real lane.** A typed item `Make two loud` dispatched to teammate `bench` in a
   fresh repository minted a worktree lane and a chat (one spawn, one lane). The island read
   `Task · working · 1 session · … · own worktree`. Changes showed `1 changed file · +1 −1 since
   the lane forked from the main tree`, the tree row `app.txt +1 −1`, and the diff's `+two!` at a
   718 px wide pane. The freshness line read **Not reviewed yet**.
2. **Brief and criteria.** Typed in the inspector, they landed on the work item on disk
   (`brief: "Make the second line loud, nothing else."`, two criteria) and showed beside Changes.
   Spawn count and lane count were unchanged after editing: nothing launched.
3. **Same-size edit invalidates the review (exit criterion 1).** Mark reviewed → `Reviewed ·
   current — you read 1 file and the content has not moved since`; the mark on disk carried
   `identity { base: d6f31b5…, content: 7dbc2933… }`. Then `two!` → `two?` in the lane: the
   across read before and after had IDENTICAL rows (`app.txt +1 −1`, the same shape signature
   `b0082138`) and the same base, and a different content hash. After Refresh: `Reviewed · stale
   — the content has moved since you read 1 file`.
4. **A changed revision makes checks stale (exit criterion 2).** A watcher panel minted in the
   lane (`/bin/sh -c cat app.txt; exit $(cat code.txt)`), run by hand: its ledger row carried
   `exitCode 0` and a `tested` identity written by main as the exit landed. Checks read
   **`exit 0`** (no "tests passed" wording anywhere on the page). One more line added to the lane,
   Refresh: **`stale · exit 0 at an earlier revision`** with the note *tested an earlier version
   of the changes (exit 0) — the changes have moved since*. `code.txt` set to 3 and the watcher
   run again: **`exit 3`**, and opening the row showed the command, the context (`… · worktree
   tc/c1-…`), the outcome, the tested revision and the run's output (`one two? three four`).
5. **Unavailable data is explicit (exit criterion 3).** A chat minted in a plain temp folder,
   selected in the List: Changes read `Not in a git repository — there is no diff to review, and
   no revision to bind a check to`; Checks read `no checks have run here — this canvas recorded no
   command and no watcher run for this subject`. A task with no lane reads `This task has no lane
   yet`; a lane git no longer lists reads `not listed by git any more`.
6. **The strip.** Exactly `Changes, Checks, Output`; `Bound to the selection · Make two loud`;
   selecting the plain chat re-bound it by name; Pin read `Pinned to <chat>` and held through a
   click on the island; Unpin returned it to the selection. Dragging the top edge 100 px grew it
   240 → 340, and the workspace on disk then held `orchestrate: { workbench: { height: 340,
   tab: 'checks' }, lens: 'list', mode: 'dev', sideTab: 'activity', camera }`.

## Gate

`npm run verify` on 2af5e621 (2026-09-19 18:53–19:02, load 3–5, `/tmp/tc-electron-lock` taken,
no app Electron running): **52/54 suites in 562 s**. Every red is pre-existing and attributed by
id — the same nine the Phase A ledger lists, none new:

- `verify:panels:agents` 92/93 — `detail.1` (recorded at `docs/build-log/m275-swarm-presets.md:107`).
- `verify:panels:product` 109/117 — `workflow.edit.1`, `workflow.edit.2`, `workflow.lib.1`,
  `workflow.wire.1`, `workflow.inspect.1`, `workflow.save.1`, `workflow.panel.1e`, `reach.1`
  (the identical tally and ids at `docs/build-log/m277-libraries.md:78`).

New reds: **none.** Every new check passed inside that run: `review-id.1–.4`, `check-fresh.1–.4`,
`work.review-id.1`, `work.brief.1`, `orchestrate.1`, `workbench.1–.3`, `orch-bench.1–.4`;
`verify:ipc` at 146 channels (`review:identity`), `verify:meta` 50/50 with the README rows and the
CLAUDE.md link. Headroom: agents 96.7 s of 168 s (58%) after the re-pin, product 168.0 s of 230 s
(73%), shell 81%, kinds 83%, core 76% — all under the 90% line.

`verify:panels:agents` WATCHDOG_MS re-pinned 135000 → 168000: measured green runs 101.2, 105.3,
113.0 s (load 3–7) and 133.7 s (load 7–9); 1.25× the slower quiet run. Under load 11–18 with
~60 MB free and 6.7 GB of 8 GB swap in use (a dozen MCP node processes from other sessions), the
part ran 223.7 s and, twice, stalled in EARLIER blocks (`run.1`, after `supervisor.1`) past even a
420 s measurement watchdog — the load flake `docs/load-bearing.md` names, not this pin's. The
green runs were taken by waiting for the load average to fall under 6 first.

`npm run shot`: 64 scenes; only `starter` failed to paint ("the arrangement is not on screen"),
pre-existing (`m279-ui-evolution.md:176`). `verify:visual` (hand-run, warm): **62/66** —
`orchestration` 13.8%, `orchestration-dark` 10.2%, `orchestration-working` 11.8% moved ON PURPOSE
(the workbench strip, the two-tab side column, the brief editors); `starter` is the pre-existing
red and its golden is left alone. The second warm rerun tripped the 221 s watchdog under load
(the same cold/loaded trap Phase A measured); the first warm run is the honest reading.

### Goldens — NOT written

Per the run prompt: no golden was written, `UPDATE_GOLDENS=1` never ran. The three accepted
fresh captures, for the user to copy over their goldens after looking (never a blind
re-baseline, and never `starter`):

- `out/visual/orchestration.fresh.png` → `verify/visual/goldens/orchestration.png`
- `out/visual/orchestration-dark.fresh.png` → `verify/visual/goldens/orchestration-dark.png`
- `out/visual/orchestration-working.fresh.png` → `verify/visual/goldens/orchestration-working.png`

### Critic (fresh context)

_(the critic's sentence per scene and on the snapshot policy — filled below)_

## Found / deferred

Out of scope for Phase B by the run prompt, logged here if the run is tempted: the Start task
dialog, multiple islands, dependency lens, run limits, Artifacts/Timeline tabs, PR/CI adapters,
hunk application, 3D platform work.
