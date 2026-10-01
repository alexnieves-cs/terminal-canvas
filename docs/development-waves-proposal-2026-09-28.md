# Proposed next development waves

2026-09-28. Proposal, not an approved run or a claim that milestones have shipped.
Milestone numbers should be assigned when work lands, following the repository's rule.

## Product direction

Make Terminal Canvas the place where a person can delegate a meaningful change, understand
what happened, and accept a result with evidence. The canvas is the spatial view of that
work; task focus is where a person does the work; Needs you is where they decide.

The next investment should connect the capabilities already built into an excellent daily
workflow. The ambitious extension is **approved plans that can advance within explicit
bounds, producing a result whose claims can be inspected**.

Prioritize an individual developer managing several tasks in one repository. Expand to a
small team once the same journey works across machines. These are proposed target users,
not conclusions from customer research.

## Evidence and limits

This proposal reads the repository's index, roadmap, recent milestone records, product
rules, and selected implementation modules. It does not include a fresh app walkthrough,
verification run, live service probe, or customer interviews. Historical audit findings
must be rechecked against the current tree before being turned into work.

The foundation is substantial:

- Tasks already have focus views, plans, checks, comments, acceptance and recovery
  ([M306–M310](build-log/m306-m310-flagship-flow.md),
  [M316](build-log/m316-job-recovery.md),
  [M325–M328](build-log/m325-m328-tasks-workspace-plan.md)).
- Parallel changes already have scratch integration, freshness checks and receipts;
  deliverables and portable recipes also exist
  ([M317–M318](build-log/m317-m318-integration-and-decisions.md),
  [M319–M321](build-log/m319-m321-backends-deliverables-recipes.md)).
- Plan approval, review proposals, persistent spending caps, team asks and replay have
  landed. These should be extended rather than recreated.
- The latest inspected full-run record reports baseline failures in agents/product
  suites; it is not a clean release result
  ([M387](build-log/m387-shared-action-trail.md)).
- Collaboration has local integration coverage, but live authenticated coverage and
  deployment were left outstanding
  ([M342](build-log/m342-supabase-live-probe.md),
  [M347](build-log/m347-collab-operations.md)).

## Wave 1 — Make the existing product dependable

**Outcome:** a new user can install, start a task, leave, return, review and accept it
without unexplained state or a developer's help. This is the immediate priority.

Implementation slices:

1. Reproduce and resolve the named `template.1`, `detail.1`, `starter.1` and `workflow.*`
   failures. Classify each as product defect, fixture drift or timing failure before
   changing it. Repair the cause; retain meaningful assertions.
2. Close visible truth gaps: carry unreadable transcript counts into chat and Replay;
   show “1 of 2 allowed — waiting for a teammate” after the owner's partial team approval;
   restore the reported model context window on relaunch. Those are explicitly owed in
   [M383](build-log/m383-replay-sheet.md),
   [M378](build-log/m378-team-asks-needs-you.md), and
   [M380](build-log/m380-cache-burn.md).
3. Exercise the primary journey with each supported backend's actual capabilities,
   including a Codex-only installation, missing tools, failed setup, stopped processes,
   app relaunch and stale checks. The old audit is input to this pass, not proof those
   defects still exist.
4. Reconcile the README's opening, release instructions and current-run index with the
   product now implemented. Keep historical milestone entries intact.
5. Prepare distribution validation: packaged install/upgrade, persisted sessions, and
   keychain behavior. Signed/notarized distribution is a release dependency requiring
   the relevant developer account and credentials; this proposal does not deploy or sign.

**Exit:** a clean `npm run verify`, inspected visual results for affected scenes,
`verify:packaged`, and a recorded fresh-install-to-accepted-change walkthrough. Record
what still requires manual or external verification explicitly.

## Wave 2 — Make accepting a result easy to judge

**Outcome:** task focus answers “What did I ask for, what proves it, and what remains?”

Build on the existing evidence model, not a second review system:

1. Give acceptance criteria stable identities and explicit evidence links. A criterion
   can cite a check output, a reviewed diff, a captured artifact or a person's judgment.
   Migrate the existing string criteria and confirmations without losing their meaning.
2. Distinguish agent claims, measured results and human acceptance. An agent may propose
   an evidence link; its assertion alone cannot satisfy a criterion.
3. Add a compact acceptance summary to task focus: unmet criteria, stale evidence,
   unresolved proposals and the exact next action. Expand an item into existing detail
   views. Keep numbers and logs out of resting canvas cards.
4. Consolidate the existing handoff export and integration receipts into a navigable
   result packet: request, accepted criteria, changed files, check outputs, decisions,
   accepted revision and remaining limitations. Export remains gated and scrubbed.
5. Treat evidence freshness consistently across task review and plan steps. Inspect the
   differences between `check-evidence.ts` and `task-plan.ts` before choosing a shared
   implementation; do not assume every green plan step already proves the current tree.

**Implementation homes:** `shared/task-flow.ts`, `shared/task-deliverables.ts`,
`shared/check-evidence.ts`, `shared/task-plan.ts`, the work-item parser,
`main/task-evidence.ts`, and the existing focus/review surfaces.

**Exit:** changing a previously checked file makes the relevant evidence stale; closing
the producing panel preserves the result; every accepted criterion has an inspectable
reason. A user can review a sample change without hunting through transcripts.

## Wave 3 — Execute an approved plan within bounds

**Outcome:** a person approves a concrete plan once and the app advances permitted steps,
stopping where a fresh decision is needed.

This is a deliberate new behavior. The current `shared/task-plan.ts` explicitly inserts
briefs for a person to send and does not automatically start ready steps. Preserve that
manual mode; an execution mode needs its own explicit contract.

Implementation slices, in dependency order:

1. Persist an immutable approved plan revision: steps, dependencies, repositories,
   intended outputs, permitted checks, assigned capabilities and run limits. Validate
   cycles, unresolved dependencies and malformed steps before execution.
2. Add a main-owned executor over the existing job journal and agent manager. Give each
   dispatch an identity, persist the attempt before sending, and reconcile ambiguous
   sends after a crash instead of automatically repeating them.
3. Support dependency requirements such as “finished” versus “verified”. Recheck inputs
   immediately before dispatch. Edits outside the approved scope invalidate approval.
4. Add concurrency and retry limits, plus a run-level spend policy above existing agent
   caps. Unknown spend remains unknown; define whether that blocks automatic continuation
   before enabling it. Backend-reported cost cannot promise a perfectly hard dollar cap.
5. Provide Pause after this step, Stop, Revise remaining plan and Retry failed step in
   task focus. A pause must survive restart. Keep merge and external publishing outside
   the first execution mode.
6. Start with one recipe: reproduce a failing check → implement → rerun checks → request
   review. Reuse scratch integration for the later parallel version.

**Exit:** crash/relaunch never silently duplicates a dispatched step; budget holds and
permission requests stop progress correctly; failed checks cannot unlock acceptance;
editing the plan cannot reuse approval for different work. Show which actions are in
the approved scope before the first dispatch.

## Wave 4 — Let successful work improve the next task

**Outcome:** a repository develops a useful, inspectable memory and better recipes.

1. Offer “Save this learning” after accepted work. Save a short statement with its source
   task, supporting evidence, repository scope and freshness rule. Reuse the current
   memory/vault facilities where they fit; a new project record requires an explicit
   model decision, not an accidental merge of project, workspace and task.
2. Assemble a visible context manifest for a new task: selected files, decisions,
   relevant prior results and recipe inputs. Let the person remove anything and see
   what will be sent. Respect file changes and shared-workspace access boundaries.
3. Suggest recipe edits from a successful run as a reviewed diff. Keep each run pinned
   to its original recipe version, as it is today.
4. Compare recipe versions on a small maintained task set: accepted outcomes, failures,
   human interventions, elapsed time and reported cost. Separate backend, model and
   repository revision changes; do not label a tiny sample “best”.

**Exit:** every suggested learning opens its source; stale or inaccessible material is
identified; editing memory never rewrites a past task; recipe comparisons are repeatable.

**Creative experiment after this wave:** “Try another approach” forks a task from an
explicit captured Git checkpoint into a fresh lane, keeping the original result intact.
Compare both against the same criteria and use the existing integration path to accept
one. Transcript replay is not a full filesystem snapshot and must not become an implied
restore mechanism.

## Wave 5 — Make the team workflow real across machines

**Outcome:** two people can collaborate on a task, make decisions and recover from a
disconnect with a trustworthy shared record.

This track can begin after Wave 1 while Waves 2–4 advance. It needs its own environment
and release evidence; it should not block the local product.

1. Complete the existing collab/relay deployment and migrations in an authorized
   environment. This is future work: the repository's current boundary forbids remote
   changes during this proposal task.
2. Run authenticated tests with owner, editor, viewer and removed member, then a real
   two-machine journey covering offline edits, restart, shared text, relay control and
   team approval. Include role revocation during an active connection.
3. Add an owner-authorized audit reader over the existing server trail, with pagination
   and filters. Link its metadata to accessible objects without adding secret-bearing
   content to audit rows. This reader is explicitly owed by M387.
4. Add an explicit task handoff: source, target, scope, evidence, outstanding decisions
   and acceptance by the receiver. Keep ownership transfer separate from taking control
   of a remote terminal or transferring an execution session.
5. Measure backup restoration, membership changes, retained data and operating costs
   before widening the beta. Set an explicit audit retention/export policy rather than
   assuming an append-only table has no lifetime cost.

**Exit:** a shared task can be resumed after service restart, revoked users lose access,
team decisions have attributable receipts, and a restored deployment serves the expected
workspace. Local-only users can still complete their workflow while services are down.

## Priority, measurement and scope

Recommended order: **Wave 1 → Wave 2 → Wave 3 → Wave 4**, with **Wave 5 branching after
Wave 1** when its infrastructure is available. Wave 3 is the largest execution and
recovery change; slice it narrowly before estimating dates. Do not reserve a long run
of milestone numbers for the proposal.

Measure a small set of local, inspectable outcomes first:

| Question | Measure |
|---|---|
| Can a new user get value? | Completion and elapsed time from install to first accepted task |
| Is review easier? | Time from ready-for-review to accept/send-back, plus evidence lookups |
| Is delegation useful? | Human interventions per accepted task, with failure reasons |
| Does recovery work? | Lost instructions, ambiguous dispatches and duplicate execution in failure drills |
| Do recipes improve? | Acceptance rate and reported cost on the same maintained task set |

Collect a baseline before assigning numerical targets. Event collection should be local
by default and omit prompt/transcript content; any external analytics is a separate
product decision.

Defer a general connector marketplace, additional decorative 3D work, broad mobile
control, new panel kinds without a customer workflow, and automatic model selection based
only on price. Revisit remote ACP when a concrete compatible agent and transport can be
validated; M384's existing seam is sufficient preparation today.

The first implementation batch should be small: reproduce baseline failures, repair the
unreadable-replay and partial-approval states, restore context metadata, and prove one
complete task journey. Then build criterion-to-evidence links. That establishes the
trust needed for the more ambitious plan executor.
