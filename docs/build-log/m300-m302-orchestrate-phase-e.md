# M300–M302 — Orchestrate Phase E: recovery and reuse

Run prompt: [2026-09-20-orchestrate-phase-e-run-prompt.md](../superpowers/specs/2026-09-20-orchestrate-phase-e-run-prompt.md).
Plan: [orchestrate-reference-plan.md](../orchestrate-reference-plan.md), Phase E.
Branch `m300-orchestrate-phase-e`, worktree `.claude/worktrees/phase-e`, off `main` at `fbd523a9`
(Phase D merged at `2a1f0e56`; M294/M297/M298/M299 landed after it).

**This ledger is the state.** Nothing here is a claim about the app until its checklist line
says it was measured in the real app.

## The goal

Not lying after something goes wrong. A relaunch, a disconnect, a killed process, a rerun —
every failure mode in this phase is silent by nature: the app shows a confident **Running** for
a session that no longer exists, and nothing turns red. **Accuracy beats completeness at every
choice**; a fact the app cannot support is a sentence saying so, never an empty box.

## Exit criterion

From the plan: *disconnect and relaunch do not fabricate state; a rerun is a new execution;
old artifacts keep their provenance.* Plus this run's added condition: **Artifacts and Timeline
are tabs with something in them**, each subject-bound, each explicit about what it does not
have.

## Retention — as built

Written at the definition (`shared/run-ledger.ts`'s `EventRow` and `GapRow`, `main/run-ledger.ts`'s
`trim`) and here.

- **What is kept:** references only — what happened and where the evidence is. Command,
  execution context, tested revision, exit outcome, changed PATHS, permission decisions,
  handoffs. No output bytes and no artifact content, and the TYPE is the enforcement: `EventRow`
  has nowhere to put a body, the same trick `RunRow` uses. `orch-timeline.2` pins it.
- **What bounds it:** a ROW COUNT — `RUN_LEDGER_MAX_LINES`, 2000 — because the record rides the
  run ledger's existing count-tracked ring trim. Not bytes, because with no bodies a row is a
  few hundred bytes and a count is the honest bound.
- **What is dropped first:** the oldest lines, by the trim, which now keeps `max - 1` rows and
  spends the freed line on a gap marker.
- **What the drop costs the reader:** nothing silently. The gap row carries how many entries
  went and when; it passes every subject filter, because it is a fact about the FILE; a second
  trim merges into it rather than appending another, inheriting its count, so the markers
  cannot grow one per trim. `orch-timeline.4`.
- **What was NOT added, and why:** a per-event content identity. Phase B measured a
  `git diff --binary` per command end; a write of that shape per event is Phase F's question if
  it is ever wanted. Per-command output capture is handed to **Phase F by name** for the same
  reason — see Found / deferred.

## Why references only

Phase B measured that stamping a content identity costs a `git diff --binary` per command end
(`RunsDeps.identityOf`), invisible in the harness and unmeasured on a large repository with a
hot agent. A per-event write of that shape is not added here. The consequence is inherited and
named: a failed check's output is still the session's scrollback tail, and **per-command output
capture is handed to Phase F by name**, not silently dropped.

## M300 — Durable timeline

- [x] A durable event row rides the EXISTING ledger stream (`shared/run-ledger.ts`'s
      `LedgerRow` union), not a new store — inheriting the queue, the ring trim and the
      malformed-line rule, and costing `panels-harness.cjs` no new mirror.
- [x] The record links dispatch, tools, permission decisions, command outcomes, changed
      artifacts and handoffs, for a task and for a session.
- [x] Transient vs persisted is distinguished in the DATA and in the WORDS on screen.
- [x] Every entry carries source, timestamp and freshness.
- [x] A trim records what it dropped, so a gap reads as a gap and never as "nothing happened".
- [x] `WORKBENCH_TABS` goes three → five; `verify:orchestration workbench.1` re-pinned at five
      IN THE SAME COMMIT as the readers.
- [x] **Timeline** tab: read-only, subject-bound through `orch-subject-gate.ts`, live tail and
      durable record visibly different things.
- [x] **Artifacts** tab: a provenance list over references; an artifact whose content has moved
      on says so rather than showing a stale body.
- [x] Inherited Phase B item FIXED: the Checks tab reads watchers off the canvas's watcher
      panels only, so a watcher armed in main from a template with no panel is invisible.
- [x] Inherited Phase B item HANDED TO F by name: per-command output capture, with the reason.

### M300 as built

| Piece | Where | Check |
|---|---|---|
| `EventRow`, `GapRow`, their parsers, the timeline types | `shared/run-ledger.ts` | `orch-timeline.1`, `.2` |
| The gap-writing, gap-merging trim and the merged `timeline()` reader | `main/run-ledger.ts` | `orch-timeline.3`, `.4`, `.5` |
| `ledger:timeline` and `ledger:event`, appended LAST to `registerIpcHandlers` | `shared/ipc-contract.ts`, `preload/`, `main/ipc.ts`, `main/index.ts` | `verify:ipc`, `verify:meta` 14 |
| The renderer's ONE write door and its importer set | `renderer/orchestration/orch-record.ts` | `orch-timeline.6` |
| Artifacts and Timeline, their words and their read | `OrchWorkbench.tsx`, `shared/orchestrate-prefs.ts` | `workbench.1`, `workbench.1b` |
| Panel-less watchers reach Checks through the record | `OrchWorkbench.tsx` | `orch-timeline.7` |

The four write points, each the moment the renderer owns a fact main cannot see:
a **dispatch** that completed (`useBoardVerbs.ts` — every refusal returns first), a
**permission** answer main accepted (`palette-actions/presets.ts`), a **handoff** outcome at the
funnel that also feeds Phase C's in-memory map (`Canvas.tsx`), and a **review mark**
(`useBoardVerbs.ts`'s `patchWorkItem`, which fires only for `reviewed` — every other patch
records nothing, because a row per keystroke is a log and not a history).

Main already wrote the fifth without knowing it: `main/watch-runner.ts` has appended a ledger
row per watcher run since M52, with the watcher's id as its panel id. That is why Phase B's
inherited item closed as a READ rather than a new store.

## M301 — Restart reconciliation

- [x] On launch and reconnect, reconcile against real sessions BEFORE displaying Running.
- [x] A stored session that no longer exists reads ended/unknown with when it was last seen.
- [x] Distinguishable standings, as DELIVERED (the critic's finding 8 — this says what was
      built, not what the plan's five words hoped for): `ended` by signal ("it was stopped by
      SIGKILL"), `ended` by code ("it ended on its own, exit 3"), `ended` by date alone,
      `unknown`, and `never-started`. No arm says crash, deadlock, stuck or hung. Silence is
      **No recent events**, one imported string.
- [x] A permission answered elsewhere or auto-resolved while the app was closed cannot be
      answered twice — READ, not built, and the reason is below.
- [x] Phase B's review identity and Phase C's subject gate hold across a relaunch: a review
      marked fresh is RE-DERIVED, not trusted from disk.
- [x] Phase C's deferred item: the dependency lens reads the in-memory `automationResult` map,
      so after a relaunch a handoff that fired reads unknown/pending. The durable record owns it.
- [x] Demonstrated by ACTUALLY killing things — `orch-reconcile.app.1/.2` kill every
      process the chat spawned through the runner's own exit path, then have the runtime
      forget the session, and read the WORDS off the DOM. **The honest limit:** this part's
      agent is the harness's fake runner, so the kill exercises the manager's real exit
      path and not an OS signal to a real CLI; and `dispose` stands in for what a relaunch
      does to the runtime's record, because main is not restarted inside a suite.
- [ ] Fresh-context critic on this milestone specifically.
- [x] `verify:panels:orchestrate` **32/32** after the critic's round, watchdog 210000 (137.8 s,
      66%). `orch-reconcile.app.3` is the critic's finding 1 answered: three ways to disprove a
      frozen page do not exist in this harness — `dispose` on a live chat is undone at once by
      the panel re-creating its session, a mid-turn kill is a race against a fixture runner
      that answers in ~200 ms, and the rail's start control needs a real pointer — so the check
      moves the DATA instead. A newer sighting appended to main's own ledger reaches the
      reconciled sentence after the person presses Refresh: measured `10:41 PM` → `10:42 PM`.
      A page that did not re-read keeps the old one.

### M301 as built, and the measurement that changed it

**The lie was quieter than the prompt's headline.** A panel restored from `layout.json`
whose agent is gone did not claim *Running* — `rosterState`'s fallback handed it **`idle`**,
the word a LIVE agent waiting for you wears. Nothing was red.

**The design changed THREE times, every time in the Electron part, and that is the
milestone's real story: none of these could go red in plain node.** The first
version read liveness off the session's `status`. Measured: a chat's PROCESS exits between
turns and `--resume` brings it back, so `status: 'exited'` is the ordinary state of an idle
chat — and every idle agent on the page started reading `no session`. `orch-task.2` caught
it. Liveness is therefore MEMBERSHIP (does the runtime hold a session record at all), which
is the fact a relaunch destroys; the status is still read, but for WORDS: a live session
whose process is down says *the conversation resumes on your next message*, and a gone one
says how its last process ended.

**Second: `dispose` does not leave the runtime's record absent from `list()`** in a way the
page can observe while the panel is still on the canvas, so dispose could not stand in for a
relaunch either.

**Third, and it moved the milestone's target: a restored CHAT auto-creates its runtime
session.** A conversation is therefore never "gone" — it resumes — so a chat's
reconciliation is only ever about whether a PROCESS is up. The state "this panel had a
session and has none now" is real on the object that has no `--resume`: an agentic
**TERMINAL**. Main has a PTY for it or it has none, and until M301 it read `idle` either
way. That is where the lie actually lived, and the page now reads the terminal's liveness
from `pty.list()` with the record's own sighting as the evidence it ever ran.

The Electron checks prove the two halves a person needs the page to get right: a killed
process must NOT read `no session` (the conversation resumes), and a restored agentic
terminal with no session MUST, with when the record last saw it.

| Piece | Where |
|---|---|
| The one place that decides what the app may say | `shared/session-standing.ts` |
| The reconciled arm, ABOVE the `agentState` fallthrough, and out of the active count | `orchestration-model.ts` |
| Main's two answers — `agentSession.list`, one `ledger.timeline` read | `OrchestrationView.tsx` |
| The lens seeded from the durable record | `Canvas.tsx` |

Both reads are **null, not empty**, while outstanding or after a failure: an unreconciled
page keeps pre-M301 behaviour rather than flashing a wall of `unknown`, and an unreconciled
CALLER (every pre-M301 fixture) is unchanged.

**The permission item is a READ, not a build, and the reason is the design's.**
`main/approvals.ts` keeps pending requests and grants IN MEMORY and says why a grant must
not survive a relaunch ("a grant that survived a relaunch would answer a question the user
was never shown"). After a relaunch there are no pending requests to answer twice, so the
double-answer risk does not exist across one; within a run it is M76's — main clears every
surface through its permission-answered event, which Phase A's `orch-task.4` already
measures. Nothing was added, and nothing should be.

**Review identity across a relaunch is re-derived, not trusted.** The workbench reads
`review.panel`/`review.across` live on every selection and compares the item's stored mark
against that read; the mark on disk is an input to the comparison, never the answer.

## M302 — Reusable arrangements and saved views

- [x] A successful arrangement saves as a template: brief, roles, dependencies, validation
      commands, persisted compatibly with the existing schema.
- [x] Rerun mints a NEW execution id and names its base revision; a command with an external
      effect is named as such before it runs.
- [x] Old artifacts keep their provenance: a rerun never re-attributes an earlier run's
      changes, checks or artifacts to itself. Demonstrated in the Artifacts tab.
- [x] Saved views record filters, camera and layout ONLY. Opening one starts nothing.
- [x] Closes Phase A's deferred "Orchestrate prefs are in memory" for the prefs a view owns.

## Gate

`npm run verify` twice. The first, on `b051e6b0`, 52/55 in 695.9 s — `verify:ipc` red on a
PINNED channel count (146 → 148) that this phase's two doors moved, which is the check doing
its job, fixed in the commit after. The second, AFTER the critic's round, on `7071ad71`
(2026-09-20, `/tmp/tc-electron-lock` taken, no stray Electron): **53/55 suites in 698.6 s**,
and the only two red suites are the pre-existing nine.

- **New reds: none.** `verify:panels:agents` and `verify:panels:product` fail on **exactly the
  nine this track has carried since Phase A, by id**: `detail.1`
  (`m275-swarm-presets.md:107`) and `workflow.edit.1/.2`, `workflow.lib.1`, `workflow.wire.1`,
  `workflow.inspect.1`, `workflow.save.1`, `workflow.panel.1e`, `reach.1`
  (`m277-libraries.md:78`). Same ids, same count, same two suites Phase D's gate names.
- Every new check passed inside the gate: `orch-timeline.1–.7`, `orch-reconcile.1–.5`,
  `orch-reuse.1–.4`, `workbench.1`/`1b` (verify:orchestration **111/111**);
  `orch-reconcile.app.1–.3` beside Phase A–D's (verify:panels:orchestrate **32/32**, 137.8 s);
  `verify:layout` 271/271, `verify:meta` 51/51, `verify:ipc` 1/1 at 148 channels.

- [x] `npm run affected` between steps.
- [x] `npm run verify` — above; reds attributed by id to the documented nine, none new.
- [x] `verify:panels:orchestrate` watchdog re-measured (180000 → **210000**) with the
      `// measured` comment: 163.9 s against the old pin put `headroom.1` red at 91%; the green
      runs since are 136–145 s, 65–69%.
- [x] `npm run shot` — 64 scenes. `verify:visual` names **exactly three changed scenes**, all
      Orchestrate, and the pre-existing `starter` red:
      - **`orchestration`** (light, 0.525%) and **`orchestration-dark`** (0.605%) — the
        workbench tab row is five tabs, `Save view` has joined the Scene/List row, and the
        activity feed's empty sentence is the new one. Nothing else in either frame moved:
        the diff image is three small regions and no scene geometry at all.
      - **`orchestration-working`** (one 32 px tile, 50%) — the island card's action row gained
        `Save arrangement`, which is the tile that differs; the rest of the frame is identical.
      - **`starter`** — pre-existing (`m279-ui-evolution.md:176`) and left red ON PURPOSE. It
        failed differently in the two runs (once "the harness could not paint it", once 24.1%
        of pixels), which is its own known instability. **Never blind-update it**:
        `UPDATE_GOLDENS=1` re-baselines it along with everything else.
      The author's own read of the captures: the five-tab row still fits its strip at every
      window size in the scenes; `Save view` reads as a control rather than a heading because
      it sits in the lens group; `Save arrangement` is the fourth action on the island card,
      which is the most that row has carried.
- [x] A fresh-context critic on M301 specifically, as the prompt requires — its round is below.
- [ ] Goldens NOT written, no merge, no push. **This phase changed `orchestration`,
      `orchestration-dark` and `orchestration-working`** — those three and no others.

## The fresh-context critic's round (M301)

The prompt requires a critic on M301 specifically, "because reconciliation is a boundary and
'did not fabricate state' is exactly the kind of claim that is easy to self-review wrongly."
It was, twice over. Ten findings; seven were real, three of them undermined the milestone's
own thesis, and one showed its headline check could not fail.

| # | Finding | Verdict | What was done |
|---|---|---|---|
| 1 | **`orch-reconcile.app.1`'s "after the kill" read was PRE-KILL data.** The workbench's Refresh bumps the strip's own counter; `benchRefresh`, which the liveness reads keyed off, has one writer — `onChatTurnEnd`. The check would have passed against a page that never re-read main after a kill. | **Real, and the worst of the ten** | The reads have their own tick, moved by an agent transition and by the person's Refresh as well as a finished turn. The check now asserts a fact only a post-kill read can carry: the page names the signal that stopped the process. |
| 2 | **The same wiring makes a FALSE `no session` stick.** Restored chats create their sessions asynchronously; a launch straight onto this page can read the list first, mark every restored conversation `no session`, and never re-ask until somebody sends a message. | **Real, and worse than the bug it replaced** — a confident, dated sentence about a live conversation | Closed by the same tick. An agent transition is what a session starting actually emits. |
| 3 | **`hadSession` for a terminal was "a sighting in the newest 200 rows"**, so a terminal that ran before the window, or under a shell that emits no OSC 133 marks, read "not started — this has not been run yet". | **Real** | A terminal with no sighting is now left UNRECONCILED — the page keeps its old word rather than swapping one confident wrong answer for another. Absence of a sighting means three different things and only one would justify that sentence. |
| 4 | **`lastSeen === null` did not gate reconciliation**, so between the two reads (or after a failed one) every agentic terminal was reconciled with a fabricated `hadSession: false`. | **Real** | Same fix as 3; the gate is now on the sighting itself, in both the scene's input and the card's. |
| 5 | **A permission answer main REFUSED was written into the record as having happened.** `answer` resolves false for a requestId no longer pending; the `.then` ignored the value. Two surfaces answering one request put two "Allowed a request" rows in the record for one decision. | **Real.** Main's enforcement was never wrong; the RECORD of it was, and the record is what this phase asks a person to trust | `.then((accepted) => { if (accepted === false) return … })`. |
| 6 | **A relaunch restored `waiting for …` and `queued — …` into the dependency lens**, drawing a `· waiting` edge for a join that can never complete — fabricated state arriving through the mechanism built to prevent it. Secondarily, the restart-on-exit arm bypassed the funnel and was never recorded at all. | **Real** | Only SETTLED outcomes are written, and only settled ones seeded back (belt and braces, for rows an older build may have left). The restart arm takes the funnel. A history records what happened; "it is waiting" is not something that happened, and this record has no way to say it stopped being true. |
| 7 | `countsAsRunning` had no caller (the count goes through `isActiveAgent`, which implements the rule itself) and `NO_RECENT_EVENTS` had none either, with the real sentence a duplicate literal. | **Real, and the right kind of nit** | `countsAsRunning` deleted — a second, unenforced copy of a rule is worse than none. `NO_RECENT_EVENTS` is now imported by the surface that says it. |
| 9 | **The invented `starting`.** A live session the runtime had not spoken for read "starting — the session is live and has not reported yet"; under the tmux backend that is a detached shell idle since before the app launched, described as spinning up. | **Real** | There is no invented `starting`. With no runtime word the page makes NO claim; the runtime's own `starting` still arrives through `agentState`. |
| 8 | A failed liveness read reverts to pre-M301 behaviour and says nothing, so "disconnected" has no representation; the checklist should say what was delivered, not tick the plan's five words. | **Fair** | The standings delivered are `ended` (by signal, by code, or by date), `unknown` and `never-started`. Recorded as that, below, instead of as the plan's five. |
| 10 | A NON-agentic terminal is excluded from reconciliation entirely, so a restored plain shell still reads `idle`. | **Fair, and deliberate** | Kept, and named in Found / deferred. |

**Claims the critic verified and let stand:** review identity IS re-derived across a relaunch
(`useTaskHandoffs` builds only from a live `review.across` read and `reviewStanding` compares
the disk mark against it — the mark is an input, never the answer, and the workbench reads the
same `taskHandoffOf`, so the two surfaces cannot disagree); the permission double-answer cannot
take EFFECT (main's pending map is the guard); no arm diagnoses a crash, a deadlock or a hang;
and the ordering rule — liveness asked before the runtime's last word — is the load-bearing
half and is pinned.

## The harness trap, in its positional form

The prompt's carried trap — *mirror any new `stores.ts` dependency into
`panels-harness.cjs`* — has a second shape, and this run walked into it: **`panels-harness.cjs`
and `shot.cjs` construct their OWN `registerIpcHandlers` calls.** `registerIpcHandlers` appends
new collaborators LAST with inert defaults, so `ledger:timeline` and `ledger:event` were
silently INERT in both harnesses. The inert read answers "no entries", the page believes the
record is empty, and the Electron tier proves a different app with nothing red — it cost a red
`orch-reconcile.app.2` to find, and `npm run shot` would have photographed every Artifacts and
Timeline tab as an unwired build.

Both are wired now, each with a comment at the argument saying why. Any future collaborator
appended to `registerIpcHandlers` has to be added in three places, not one.

## A fourth measurement: one rule, two copies

`selectedStandingOf` applied the CHAT rule to every object, so a reconciled terminal read
`no session` in the scene and `never-started` on its card — two answers to one question from
two copies of one rule. Found by making the red check report what the page and the record
actually held instead of `false`: the record had the row, the DOM said `no session`, and the
card's attribute said `never-started`. A check that reports only `false` sends the next
reader back to the beginning.

(`waitUntil` RESOLVES with the last falsy value rather than throwing, so `!== null` is not the
test for "it timed out" — that cost one run of its own.)

## Found / deferred

Out of scope for Phase E by the run prompt, logged here if the run is tempted: CI/PR/deploy
adapters and structured check adapters (Phase F), per-command output capture (handed to F
above), artifact content snapshots, durable checkpoints, cross-provider continuation, rollback.

**Handed to Phase F, by name and with the reason:**

- **Per-command output capture.** The ledger keeps no output bytes, so a failed check's
  "output" is still the session's scrollback tail. The references-only policy declines the
  per-event write; Phase B measured a `git diff --binary` per command end, and a per-event
  write of that shape needs measuring on a hot session before it is added. Phase F inherits a
  DECISION, not an oversight.
- The identity's uncovered inputs (index, a submodule's dirty tree, mode bits, symlink
  targets), inherited from Phase B and still named on the type.

**Found while building, not this phase's:**

- **`registerIpcHandlers` has THREE call sites, not one** — `main/index.ts`,
  `scripts/panels-harness.cjs` and `scripts/shot.cjs` — and the two harnesses construct their
  own. A collaborator appended in main is INERT in both until it is added there too, with
  nothing red. This run hit it; the next one will. A `createStores`-shaped harness would
  remove the class, exactly as Phase B said of the engines.
- **A restored chat auto-creates its runtime session**, so `agentSession.list()` membership is
  not a test of whether a conversation has been resumed. It is the right test of whether the
  RUNTIME still holds a session (a relaunch, a dispose), which is what reconciliation needs,
  but a future "is this conversation actually attached" question needs a different fact.
- **Terminals are reconciled from `pty.list()` and the record's sighting; chats from the
  runtime's list.** The two objects genuinely differ (one resumes, one does not), and the
  asymmetry is deliberate — but it means a terminal that ran before the record's oldest kept
  row reads `never-started` rather than `unknown`. A gap row is present in that case and the
  Timeline tab says so; the ROSTER word does not. Small, and worth closing if it is ever seen.
- **A non-agentic terminal is not reconciled at all** (the critic's finding 10): a restored
  plain shell panel with no PTY still reads `idle`, exactly as before M301. Deliberate — the
  phase's claim is about work that RUNS — but the plan's sentence is broader than what was
  built, and this is the gap.
- **A terminal the record cannot speak for is left unreconciled**, so a terminal that ran
  before the newest 200 rows, or under a shell that emits no OSC 133 marks, keeps its pre-M301
  word. Honest, and the alternative (asserting "not started") is worse; closing it properly
  needs a per-panel sighting that does not depend on a shared window.
- **The activity ring and the durable record are two stores with overlapping content.** M300
  did not merge them, on purpose (one is a live tail, one is history), but nothing yet stops a
  future event being written to one and not the other.
- `verify:panels:orchestrate` is at 136 s of a 210 s watchdog; there is room, but Phase F
  should measure before adding, as Phase C's note says.
- `orch-parity.app.3` (WebGL denied + reduced motion) went red once in this run's second
  Electron pass and green in every other, including on the same build. A FLAKE, recorded here
  so the next red is not mistaken for a regression.
