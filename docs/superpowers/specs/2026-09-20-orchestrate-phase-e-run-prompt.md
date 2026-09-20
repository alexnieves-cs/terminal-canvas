# Orchestrate Phase E — run prompt

Revised 2026-09-20. It executes **Phase E only** of
[docs/orchestrate-reference-plan.md](../../orchestrate-reference-plan.md).

**Base branch:** `main` at `a1dbb7eb`. Phase D merged at `2a1f0e56`; M294 (scene), M297
(critic reference), M298 (fit) and M299 (chrome) landed after it, and M299's goldens were
written at `a1dbb7eb`. Branch off `main`.

**What the earlier draft of this file got wrong**, recorded so it is not re-derived: it claimed
M294–M296 and told you to branch off `m291-orchestrate-phase-d`. Both were true when it was
written and both are now false — the numbers were taken by the scene/critic/fit/chrome passes,
and D has merged.

---

You are executing **Phase E — Recovery and reuse** of `docs/orchestrate-reference-plan.md`.
This phase is about not lying after something goes wrong: a relaunch, a disconnect, a killed
process, a rerun. Every failure mode here is silent by nature — the app shows a confident
"Running" for a session that no longer exists — so **accuracy beats completeness at every
choice**.

Read the plan whole, then the prior ledgers in order (A `m283-m284`, B `m285-m287`,
C `m288-m290`, D `m291-m293`, then the scene/fit/chrome passes `m294`, `m298`, `m299`),
including every **Found / deferred** section — three items in them are Phase E's to own, listed
below. Then `CLAUDE.md` and `npm run lb -- runs`, `npm run lb -- activity`,
`npm run lb -- session`.

## Numbering and state

- Milestones **M300** (durable timeline), **M301** (restart reconciliation), **M302**
  (reusable arrangements and saved views). Grep `docs/build-log` and `git log` for collisions
  and take the next free triple if any exist — concurrent sessions have reused a number here
  before.
- Ledger: **`docs/build-log/m300-m302-orchestrate-phase-e.md`**, created first with the goal,
  the exit criterion, a checklist per milestone, a **Retention** section (what is kept, for how
  long, what bounds it, what is dropped first) and a **Found / deferred** section. Link it from
  CLAUDE.md's build-log row after the M299 entry, in the same commit.

## Execution method

- **Serial, one worktree** (`m300-orchestrate-phase-e`). M301 reconciles against M300's record;
  M302's rerun writes into it.
- Subagents read-only, plus the critic. **Get a fresh-context critic on M301** specifically:
  reconciliation is a boundary, and "did not fabricate state" is exactly the kind of claim that
  is easy to self-review wrongly.
- Scoped check ids (`orch-timeline.1`, `orch-reconcile.1`, `orch-reuse.1`). Commits
  `feat(m300): …`.
- `npm run affected` between steps. `pgrep` for stray Electron and take
  `/tmp/tc-electron-lock` before any Electron-tier suite. New Orchestrate checks go in
  `verify:panels:orchestrate` (Phase C's part); re-measure its watchdog when you're done, with
  a `// measured` comment.
- Carried traps: bind focus listeners on `document`; a hidden harness window needs
  `wc.focus()`, and its `capturePage` can lag the DOM by a step — where a capture and a check
  disagree, the check's DOM read is the fact; rerun a cold `verify:visual` warm before calling
  it red; **mirror any new `stores.ts` dependency into `panels-harness.cjs`**, which matters
  more here than anywhere, because a store this phase adds is exactly what the harness would
  silently lack.

## The frame is built; two tabs move into it

M299 gave Orchestrate a frame that can hold this: a title row, action tiles, two side cards and
a workbench that rests open at 200 px. Phase E is what fills the two tabs that frame was shaped
around.

`OrchWorkbench.tsx` says today, at its header, that it has **three tabs, not five**, because
"an empty tab is a promise the page cannot keep", and `verify:orchestration workbench.1` pins
the list at three so a tab cannot appear before its reader does. This phase turns that from a
restriction into the deliverable:

1. `WORKBENCH_TABS` becomes **Changes · Checks · Output · Artifacts · Timeline**, and
   `workbench.1` is re-pinned at five. **The same commit that adds a tab adds its reader** —
   that is what the check is for, and it is the gate on this whole section.
2. Both new tabs are **subject-bound through `orch-subject-gate.ts`** exactly as the other
   three are: a read is ticketed by the subject key it was asked for, lands only while that key
   is current, and the render checks the landed key again. A timeline can no more sit under
   another task's controls than a diff can.
3. Neither tab may render an empty box. Every unavailable fact is a sentence — a task that has
   not run, a history that predates the record, a gap where events were missed, a provenance
   the app cannot resolve. An empty box is a claim of "nothing happened" and this phase exists
   to stop the app making claims it cannot support.
4. Both are **read-only**. No row in either tab re-runs, retries or mutates anything.

## M300 — Durable timeline

1. A persisted run record linking dispatch, tools used, permission decisions, command outcomes,
   changed artifacts and handoffs, for a task and for a session. Build on `shared/runs.ts`,
   `canvas/useRuns.ts` and the activity store; **the current activity ring is not an audit log**
   and must not be presented as one.
2. **Distinguish transient activity from persisted history**, in the data and in the words on
   screen. A live tail and a durable record are different things, and the Timeline tab says
   which it is showing.
3. Every entry carries source, timestamp and freshness. **Missed events and unavailable history
   are shown explicitly** — a gap says it is a gap.
4. **Capture policy: REFERENCES ONLY.** The record stores what happened and where the evidence
   is — command, execution context, tested revision, exit outcome, changed paths, check ids,
   permission decisions, handoffs — and reads content live on demand. The **Artifacts** tab is
   a provenance list over those references: changed files, review bundles, previews and reports,
   each named with the execution that produced it. It does not snapshot file content, so an
   artifact whose content has moved on says so rather than showing a stale body.
   - Why: Phase B measured that stamping identities costs a `git diff --binary` per command
     end. A per-event write of that shape is not added here without measuring it on a hot
     session, and this phase does not need one.
   - Consequence, to be written down and not quietly skipped: the retention bound is a **row
     count**, not bytes. Name it at the definition and in the ledger's Retention section, with
     what is dropped first.
5. **Two inherited Phase B items, and their decisions are already made:**
   - *Fix here.* The Checks tab reads watchers off the canvas's watcher panels only, so a
     watcher armed in main from a template with no panel is invisible. The durable record is
     its right owner; make Checks read it.
   - *Hand to Phase F, with the reason in the ledger.* The ledger keeps no output bytes, so a
     failed check's "output" is the session's current scrollback tail. Per-command output
     capture is exactly the per-event write the references-only policy declines. Record it as
     deferred to F **by name**, so Phase F inherits a decision and not an oversight.

## M301 — Restart reconciliation

1. On launch and on reconnect, **reconcile against real sessions before displaying Running**.
   A stored session that no longer exists reads as ended or unknown, with when it was last
   seen — never as running.
2. Stopped, interrupted, disconnected, crashed and unknown stay **distinguishable** from each
   other and from completed. Silence is **No recent events**, never a confident deadlock
   diagnosis.
3. Pending permission requests survive correctly: one answered elsewhere, or auto-resolved
   while the app was closed, cannot be answered again. Re-check identity at the moment of the
   answer, not at render.
4. Phase B's review identity and Phase C's subject gate must hold across a relaunch: a review
   marked fresh before a restart is re-derived, not trusted from disk alone.
5. **Test this by actually killing things** — kill a session's process, quit mid-run, relaunch —
   not by simulating the flags you expect. This is the phase's one non-negotiable method rule.

## M302 — Reusable arrangements and saved views

1. Save a successful task arrangement as a template: brief, roles, dependencies, validation
   commands. Persisted compatibly with the existing schema.
2. **Rerun produces a new execution ID and names its base revision.** It does not rewrite
   history and does not blindly replay side effects — a command with an external effect is
   named as such before it runs.
3. Old artifacts keep their provenance: a rerun never re-attributes an earlier run's changes,
   checks or artifacts to itself. The Artifacts tab is where this is visible, so it is where it
   is demonstrated.
4. Saved views record **filters, camera and layout only** — never runtime mutations. Opening a
   saved view starts nothing. This also closes Phase A's deferred "Orchestrate prefs are in
   memory" item for the preferences a view owns.

Out of scope (log as deferred if tempted): CI/PR/deploy adapters and structured check adapters
(Phase F), per-command output capture (handed to F above), artifact content snapshots, durable
checkpoints, cross-provider continuation and rollback — the plan says these require explicit
new support and must not be implied as existing.

## Exit criterion (stop here)

From the plan: *disconnect and relaunch do not fabricate state; a rerun is a new execution; old
artifacts keep their provenance.* Demonstrate each in the real app with real kills and a real
relaunch, and record what you saw in the ledger. Add the tab condition: **Artifacts and Timeline
are tabs with something in them**, each bound to its subject, each explicit about what it does
not have.

Before you stop:

1. `npm run verify` plus the re-measured `verify:panels:orchestrate` watchdog. List new reds
   separately from the known pre-existing set named in the earlier ledgers; reproduce anything
   new on the base branch before calling it pre-existing.
2. `npm run shot`, then a **fresh-context critic** on each changed scene, plus the M301 review
   described above. A sentence per scene in the ledger.
3. **Don't write goldens** (`UPDATE_GOLDENS=1` also re-baselines `starter`), don't merge, don't
   push. List the accepted captures for the user to copy one at a time, and say which scenes
   **this** phase changed.
4. Report what landed, the commits, the verify result, the retention policy, the critic notes,
   the deferred list and any departure from the plan.
