# Terminal Canvas — ordered product development guide

This is the follow-along plan for implementing **every recommendation** in [the product audit](product-audit-2026-09-08.md), including the four 10X opportunities and the P2/P3 work. Follow the numbered steps in order. The complete original audit is preserved at the end as a reference, including its evidence, feature inventory, scoring, strengths, constraints, and product thesis. The coverage tables connect that material to the execution sequence; no recommendation is silently dropped.

The implementation details below extend the original diagnosis into a plan. They are proposed designs, not claims that these features already exist or have been verified. Historical checkout observations in the audit remain historical. At document creation, HEAD had advanced to `3455c65`, an M188 spec commit, so re-read the ledger before assigning new milestones.

## How to follow this guide

Each numbered step is a development phase, not an already assigned repository milestone. Use `D01`–`D20` as stable guide IDs. During D01, map them to the next available milestone numbers and divide larger phases into small coherent milestones. Never reuse M180–M188 or other numbers already assigned in the ledger.

**D01 amendment, 2026-09-08 (M193).** The mapping is done and is in the Milestone(s) column
below; the reasoning, the splits and the reservations are in
[the v10 ledger](build-log/m193-m224-ledger.md). The baseline the numbering was assigned against
is `main` at `d785b7b`, tagged `v5.0.0`, working tree clean: M187–M192 have all shipped since this
guide was written, so **M193 is the first free number** and the audit's `4.1.0`/`85edd91`
observations are historical. 5.0.0 is spent — the guide's post-D10 checkpoint is a product
checkpoint and names no version.

All steps start unchecked. Existing implementations may satisfy part of a step; inspect and verify them, then record the evidence rather than rebuilding them. A phase can be complete only when its acceptance criteria and the repository's required verification are satisfied. Record status, actual milestone number, spec, plan, command results, critic findings, and remaining hand checks in the active build-log ledger.

“Do everything” makes the previously deferred opportunities part of the eventual sequence. It does not make them v5 release blockers or justify a large speculative implementation upfront. P3 capabilities get a bounded implementation and evaluation before expansion. If evidence argues against a proposed design, record the problem and replacement explicitly rather than silently omitting the capability.

### The order at a glance

| Order | Milestone(s) | Phase | Priority | Depends on | User-visible result |
|---|---|---|---|---|---|
| D01 | M193 ✅ | Reconcile baseline, roadmap, and product language | Foundation | — | One accurate development contract |
| D02 | M194 ✅ | Selected chat context in Files and Tools | P0 | D01 | An agent's directory works without a terminal proxy |
| D03 | M195 ✅ | Explicit preview ownership | P0 | D02 | Only the relevant project's changes reload its preview |
| D04 | M196 ✅ | Repository, worktree, and memory context policy | P0 | D02–D03 | Scope remains understandable across worktree lanes |
| D05 | M197–M198 ✅ | Start work from an issue or intention | P0 | D04 | One path into a task, agent, and lane |
| D06 | M199–M200 ✅ | Honest agent and run supervision | P0 | D05 | Blockers, queues, and completion have distinct meanings |
| D07 | M201–M202 ✅ | Review handoff and local review readiness | P0 | D06 | Task results are reviewable before a PR exists |
| D08 | M203–M204 ✅ | Task-oriented spatial navigation | P1 | D05–D07 | Show a task and its related objects without hunting |
| D09 | M205 | Intent-led onboarding | P1 | D05–D08 | A new user starts useful work through the same path |
| D10 | M206–M208 | Information hierarchy and contextual UI finish | P1 | D06–D09 | A calmer shell, inspector, graph, and far view |
| D11 | M209–M210 | Retained outcomes and return-to-work | P1 | D07–D10 | Tidying panels does not erase the meaning of the work |
| D12 | M211–M212 | Artifact provenance and decision capture | P2 | D07, D11 | Evidence and accepted knowledge retain their sources |
| D13 | M213–M214 | Honest, broader scoped search | P1 | D11–D12 | Find tasks, conversations, decisions, and artifacts |
| D14 | M215–M216 | Reusable task arrangements and workflows | P2 | D08, D12–D13 | Successful work becomes a reusable way of working |
| D15 | M217–M218 | Workflow nodes and integration depth | P2 | D14 | Concrete recurring jobs gain useful automation |
| D16 | M219 | Portable canvases and workflows | P2 | D12, D14–D15 | Another environment can open work with honest missing-resource states |
| D17 | M220 | Cross-workspace supervision | P3 | D06, D11, D13 | Understand and navigate work across workspaces |
| D18 | M221 | Semantic relationship suggestions | P3 | D08, D12–D13 | Suggested connections are explainable and optional |
| D19 | M222 | Extension ecosystem | P3 | D15–D16 | Extend validated seams without forking the application |
| D20 | M223–M224 | Multiplayer spatial work | P3 | D11–D12, D16–D19 | Shared work has explicit ownership and conflict handling |

Priority describes importance, not a strict topological sort. For example, the full P1 search experience follows the P2 provenance phase so it can search meaningful decisions and artifacts. Its existing error-reporting defect can be fixed in a small independent milestone earlier if it blocks an active journey.

## The product contract for every phase

The core user is an engineer or technically capable builder supervising agent-assisted work across repositories. The core job is moving a meaningful task from intention to reviewed result while maintaining control and understanding.

The mental model is: **a workspace holds your work; tasks connect agents, tools, and evidence; the canvas is where you see and act on those connections.** Keep project, workspace, task, teammate, conversation, and execution distinct.

Preserve the proven strengths: terminal durability, session/view separation, pure geometry, shared IPC, explicit permissions, backend capabilities, template revisions, truthful uncertainty, the existing verification infrastructure, and the dark/cyan visual identity. Do not turn normal conversations into mandatory graphs, build a second IDE, fill the screen with telemetry, or automatically rearrange or execute work based on inferred intent.

### Milestone workflow and completion gate

For every implementation milestone:

1. Read the current ledger and relevant source; search `docs/load-bearing.md` and `docs/load-bearing-recovered.md` by module name. Follow `CLAUDE.md` and read `docs/verify-suites.md` before changing checks.
2. Write the problem, evidence, intended experience, state ownership, IPC impact, risks, and acceptance criteria in the spec. Write a scoped implementation plan.
3. Add meaningful checks for new behavior using scoped IDs. Watch required red-first checks fail without aborting later checks. Do not add tests that merely mirror low-impact implementation details.
4. Implement the smallest coherent change. A user-facing verb needs canvas, palette, workflow, and agent doors, or a recorded omission with a reason.
5. Run appropriate checks, then `npm run verify`; every suite must print its tally and exit successfully before implementation is called complete. Do not silently skip or weaken suites.
6. Critique product usefulness, discoverability, interaction steps, visual quality, architectural complexity, integration, and failure states. Use fresh-context critic/verifier roles where repository milestone instructions require them. Fix or explicitly disposition findings.
7. Inspect affected visual scenes. Write the critic's sentence for each intended change before updating goldens. Preserve `.panel__*`, `*-node__*`, and `.pf__body` invariants.
8. At each act close, also run `npm run verify:visual` and `npm run verify:packaged`. Record command, exit code, tallies, and manual-only gaps. Update the ledger and relevant documentation.

Inspection is not permission. Context resolution must never broaden a teammate's places or service grants. Main continues to own processes, filesystem, git, and credentials. Terminal session lifetime remains in the registry outside React. No styling dependencies, remote objects, pushes, or modifications outside the repository are authorized by this guide.

## D01 — Reconcile the baseline and development contract

- [x] Complete and record D01. **M193** — the record is [docs/build-log/m193-m224-ledger.md](build-log/m193-m224-ledger.md).

**Why first:** The audit's M187 state has already aged. Starting from its historical snapshot could duplicate work or overwrite another milestone's intent.

**Do in order:**

1. Inspect status, branch, HEAD, current milestone specs/plans, and `docs/build-log/m180-m200-ledger.md`.
2. Reconcile M187/M188 and any later work with the audit. Finish or explicitly preserve the current milestone before beginning a different one.
3. Reproduce important findings in the current application: chat Files/Tools, preview reload scope, approvals on a workflow diagram, panel closure versus retained history, and search reader failure.
4. Walk the eight audit journeys. Record actual clicks/keystrokes, confusion, and observed recovery behavior; distinguish observation from inference.
5. Map D02–D20 to available milestone numbers and amend the existing roadmap explicitly. Preserve old decisions and their reasons in the ledger.
6. Establish the required verification baseline. Record existing failures separately from new work.
7. Adopt the audit's entity definitions and density model as the product contract. Resolve naming for Markdown notes, canvas sticky notes, free text, and frames without pretending they have the same storage model.

**Architecture:** Read-only discovery plus documentation. No new project store or state framework.

**Acceptance:** One ledger identifies what is already implemented, what is still proposed, which milestone is next, and how every guide phase fits the roadmap. No historical statement is mistaken for current verification.

## D02 — Make selected agent context work in Files and Tools

- [x] Complete and record D02. **M194** — the record is [docs/build-log/m194-d02-selected-chat-context.md](build-log/m194-d02-selected-chat-context.md).

**Problem/evidence:** `ChatSource.cwd` exists in `src/shared/chat-panel.ts`, while the audited `useFileTree.ts` and `useInspectorDetail.ts` exclude chats from directory resolution. The starter golden exposes the contradiction.

**Do in order:**

1. Specify the existing selection-versus-focus contract. Selection chooses inspection context; the focused terminal remains the existing path-insertion target.
2. Add chat directory support to the two consumers, using a narrow pure resolver if sharing the rule actually reduces duplication.
3. Keep known, absent, and unavailable/ambiguous context distinguishable. A sandbox must not pretend to be a repository.
4. Clear stale data immediately when the inspected subject changes, and ignore late replies for an earlier subject.
5. Correct the explanatory copy and affected Files/Tools/starter scenes.

**Experience/IA:** Selecting a conversation opens its directory and applicable inventory in the existing Files pane and inspector. Folder identity is concise; full paths and diagnostics live in detail. No new panel or navigation place.

**Data/IPC:** Derive from existing panel/session facts. No layout migration; existing filesystem and toolbox invokes should suffice. Main keeps privileged reads.

**Verify:** Chat A/B selection, stale replies, sandbox/no-directory cases, unchanged terminal/review/toolbox behavior, selection/focus divergence, and zero spawning/disposal from inspection. Run the full milestone gate.

**Acceptance:** Start a repository chat and inspect its files and tools without creating a terminal to establish context.

## D03 — Bind previews to the work they preview

- [x] Complete and record D03. **M195** — the record is [docs/build-log/m195-d03-preview-ownership.md](build-log/m195-d03-preview-ownership.md).

**Problem/evidence:** The audited `BrowserNode.tsx` checks whether a URL is loopback but ignores the changed file's project. Two local projects can reload one another's previews.

**Do in order:**

1. Trace discovery through `preview-discover.ts`, the browser store, and Canvas's preview verbs. Distinguish the directory used for discovery from the guest being acted on.
2. Define an explicit preview source association: owning worktree/directory and, when available, source panel or work item. Treat this as provenance, not a permission grant.
3. Persist only the association that cannot be reconstructed reliably. Old unbound browser records remain valid and explain that no source is bound.
4. Filter file-change notifications against that association before applying the existing coalescing reload.
5. Provide Bind/Change source and recovery for a closed source panel or missing directory. Preserve a still-valid directory association when the view closes.
6. Keep discovery read-only. Start dev remains an explicit ordinary process-panel action.

**Experience/IA:** Source identity in contextual preview controls, with full provenance in the inspector. Navigation, device widths, and capture reuse the current browser guest.

**Data/IPC:** Optional association with absent/malformed/unknown parsing. First inspect whether the existing file event carries enough identity; extend the shared contract only if needed, updating both IPC diagrams.

**Verify:** Two repositories on loopback, nested changed paths, unrelated Markdown changes, remote pages, burst coalescing, source closure, restart, and guest identity preservation. Capture/URL failures must remain recoverable.

**Acceptance:** A project's changes reload its bound preview and no unrelated preview. Discovery never starts a second dev server implicitly.

## D04 — Resolve repository, worktree, and memory scope consistently

- [x] Complete and record D04. **M196** — the record is [docs/build-log/m196-d04-scope-policy.md](build-log/m196-d04-scope-policy.md).

**Problem/evidence:** Working directory, git root, app-created worktree root, and canonical repository identity serve different purposes. The audit flags `memoryRoot` versus existing worktree-parent translation as an investigation, not a proven defect.

**Do in order:**

1. Trace repository resolution, worktree records, Places checks, skills assignment, review subjects, and memory reads/writes.
2. Write a policy distinguishing actual working directory, lane/worktree identity, and repository identity. Define behavior for non-git folders, symlinks, unavailable paths, and externally created worktrees.
3. Decide deliberately which memories are repository-wide, teammate-specific, or task-specific. Do not silently merge previously separate histories.
4. Reuse a bounded shared context representation where multiple consumers need the same fact. Keep permission authority in main.
5. If a memory migration is necessary, specify compatibility, duplicate handling, and user-visible provenance before writing it.
6. Extend the policy to related file, review, skill, preview, and memory actions as coherent slices.

**Experience/IA:** A person can tell which task/lane they inspect and which knowledge an agent will receive. The composer states actual attached context; full scope appears in detail.

**Data/IPC:** Prefer derivation. Persist user-chosen associations only. Reuse existing memory stores and canonicalization seams; add no generic project database without a demonstrated need.

**Verify:** Same repository across lanes, different repositories with the same basename, realpath boundaries, missing worktrees, absent fields, stale async results, memory bounds, redaction, and unchanged grants.

**Acceptance:** Files, preview, review, skills, and memory agree about scope without confusing a lane with its parent repository or widening access.

## D05 — Start work from an issue or intention

- [x] **M197 — the flow.** The record is [docs/build-log/m197-d05-start-work.md](build-log/m197-d05-start-work.md).
  Steps 1–4 and the reachable half of 6: one `Start work` action every door routes into, asking only
  for what it cannot derive (task → agent → repository, an order that is a dependency), the same
  lane and agent creation rather than a second executor, and the executor made to ANSWER.
- [x] **M198 — step 5.** Idempotency and partial-failure recovery: a repeated start, a
  worktree created with the chat refused, a send failure, and the redispatch of an existing item.
  Measured in §6 of the M197 record — the chat id is minted fresh per attempt while `ensureForPanel`
  reuses by panel id and root, so a retry duplicates the lane.

**Problem/evidence:** The existing Board → teammate → worktree → chat → PR path is powerful, but setup and context are spread across surfaces. Reuse `work-items.ts`, board lane/repository resolution, teammate records, and the single dispatch path.

**Do in order:**

1. Add a single Start work flow from a GitHub/Jira item, a typed task, and a workspace creation entry point.
2. Collect only missing inputs: task, repository, and agent/teammate. Explain backend limitations through capability data.
3. Put first-assignment setup in context: select an existing teammate or explicitly configure the required place/service permissions. Do not turn a convenient default into implicit access.
4. Show the task and repository before dispatch; reuse existing lane creation and agent creation rather than a second executor.
5. Define idempotency and partial-failure recovery for repeated clicks, worktree-created/chat-refused, send failure, and redispatch of an existing item.
6. Associate supporting objects explicitly with the task, using existing records/links where possible. Create only the minimum needed initially; expose terminal, review, and preview contextually.

**Experience/IA:** Board owns task entry/state; the canvas owns active work. The flow ends on a useful conversation with its task identifiable. Retain all existing entry points as routes into the same action.

**Data/IPC:** Reuse work-item identity, lane/worktree records, and the broker. Add optional associations only where necessary. Preserve source-provider state separately from local state.

**Verify:** GitHub/Jira/typed cases, missing repo, no place, unsupported backend, duplicate dispatch, partial failure, existing PR, shared-repo attribution, and restart. Live provider writes remain explicit hand checks when credentials/tenants are required.

**Acceptance:** A user starts an actual task without navigating several configuration areas, and a failed start names the next recovery action without creating unexplained duplicates.

## D06 — Make agent and run supervision honest

- [x] Complete and record D06. See [the M199–M200 record](build-log/m199-m200-d06-supervision.md).

**Problem/evidence:** `run-outcome.ts` reserves `wants-you`, but audited run entries do not carry pending questions. Turn completion, run completion, and task completion must remain distinct.

**Do in order:**

1. Define a state table separating execution, queue reason, pending approval, stopped/failed/unknown outcome, and user task disposition.
2. Project existing live approval/session stores onto run nodes. Keep pending permission authority in main; do not create a second grant system.
3. Make attention, selected chat, run diagram, and task context agree about the same blocker and its subject.
4. Keep a completed turn labeled as an execution result. Do not derive task success from idle state or an agent's unverified claim.
5. Explain concurrency/budget blocks in contextual detail and preserve backend-specific inability to interrupt or approve.
6. Decide historical approval/outcome representation independently of the live overlay; later retention work must not persist an actionable stale permission request.

**Experience/IA:** Attention answers “what needs me”; run/task detail answers “what is happening and why.” Show purpose, evidence, and next action. Metrics remain in detail.

**Data/IPC:** Reuse agent state, approvals, run mapping, and immutable run definitions. Prefer a pure projection; widen event/record data only for facts missing from existing sources.

**Verify:** Approval arrival/answer/exit races, oldest pending request, queued versus active, stopped versus failed, sealed run with no outcome, missing mapping, backend differences, and every control targeting the intended session.

**Acceptance:** A blocked workflow visibly identifies the blocked node and actual question; no green completion state implies reviewed task success.

## D07 — Build the review handoff

- [x] Complete and record D07. **M201–M202** — the record is [docs/build-log/m201-m202-d07-review-handoff.md](build-log/m201-m202-d07-review-handoff.md).

**Problem/evidence:** The existing work-item `review` state means PR opened. Local review readiness needs its own explicit meaning. Review, tool attribution, git status, and run outcomes already supply much of the evidence.

**Do in order:**

1. Specify local review readiness separately from provider state and PR creation. Avoid silently changing existing state meanings.
2. Build a task-linked review view containing changed files, recorded check outcomes, agent explanation, and unresolved questions.
3. Attribute claims: actual observed check result, agent-reported result, unavailable evidence, and shared-repository changes must be distinguishable.
4. Provide contextual Open review, Request changes/continue conversation, and existing Open PR paths. Preserve broker approval and git write boundaries.
5. Define behavior when a lane is closed/missing, changes are empty, checks never ran, or a previously reviewed diff changes.
6. Add recovery for missing/moved files using an explicit locate/rebind action where appropriate; never silently substitute a different file.

**Experience/IA:** Work card offers Start, Resume, or Review based on facts. Review is beside the task and conversation. Detailed logs are expandable references.

**Data/IPC:** Reuse review subjects, baselines, tool index, and run records. Persist references or explicit readiness facts only as needed; do not copy full diffs into layout by default.

**Verify:** No PR yet, failed/not-run checks, stale diff, ambiguous attribution, missing lane, permission refusal, push failure, and successful continuation into the same conversation.

**Acceptance:** A person can decide what to do with a result before opening a PR, with honest evidence and a direct route back to the agent.

## D08 — Navigate tasks spatially

- [x] Complete and record D08. **M203–M204** — the record is [docs/build-log/m203-m204-d08-task-navigation.md](build-log/m203-m204-d08-task-navigation.md).

**Do in order:**

1. Derive task membership from explicit work-item, lane, template, artifact, and link associations. Do not infer membership from proximity.
2. Add Show this task using the existing fit/camera machinery.
3. Add Show related as highlighting/filtering/navigation; leave positions unchanged.
4. Introduce a task overview at an appropriate zoom/detail level: identity, blocker, review readiness, and key evidence instead of tiny transcripts.
5. Add optional Arrange this task using existing placement/group/history logic. Respect locks and pins; make the action undoable.
6. Preserve merged-view read-only geometry, camera history, keyboard reach, selection semantics, and session lifetimes.

**Experience/IA:** Contextual actions on the task and selected object, palette search, and agent/workflow doors. Keep Panels as the full inventory. Groups remain membership, not owners of panel sessions.

**Data/IPC:** Derived geometry stays pure. Persist only explicit membership that lacks an existing authority. Navigation should not need new privileged operations.

**Verify:** Multiple overlapping tasks, unrelated adjacent panels, missing members, locked panels, collapsed groups, far zoom, keyboard-only use, merged view, and no process death from navigation or hiding.

**Acceptance:** A large workspace can be understood by task; showing related work never unexpectedly moves or stops it.

## D09 — Make onboarding intent-led

- [ ] Complete and record D09. **M205** — built; the record is [docs/build-log/m205-d09-intent-led-onboarding.md](build-log/m205-d09-intent-led-onboarding.md). Left unticked on purpose: the gate is owed (§6 there — the shell/agents reds are shared by the base commit, and `verify:visual`/`verify:packaged` did not complete under load).

**Do in order:**

1. Reuse D05 for “work in a repository” and preserve a clearly distinct no-folder conversation path.
2. Ask for a folder and plain-language intention; show engine readiness only as needed to reach the first useful action.
3. Keep installed, missing, and discovery-unanswered separate. Installed still does not mean signed in.
4. Make captioned examples an optional learning path rather than the compulsory definition of a workspace.
5. Consolidate overlapping chat creation choices while keeping advanced capabilities accessible through the palette or an explicit advanced choice. Avoid process-per-turn jargon in onboarding.
6. Preserve starter idempotency: closed examples stay closed, and reopening an empty workspace does not recreate a tour unexpectedly.

**Experience/IA:** One primary action, one clear alternative, progressive disclosure. The resulting canvas reflects the user's task rather than an object catalog.

**Data/IPC:** Reuse readiness, starter records, existing spawn/dispatch paths, and recent directories. No new onboarding-only runtime.

**Verify:** Fresh install, no CLI, slow discovery, installed/not signed in, no repository, canceled setup, existing empty workspace, repeated starter application, and keyboard focus through the first message.

**Acceptance:** A new user can start meaningful work without terminal knowledge or learning every panel type first. Measure the journey with a person; do not assert a time target from automated checks alone.

## D10 — Finish hierarchy, navigation, and contextual controls

- [ ] Complete and record D10. **M206–M208** — built; the record is
  [docs/build-log/m206-m208-d10-hierarchy.md](build-log/m206-m208-d10-hierarchy.md). Left unticked:
  the inherited D09/base gate remains red and the audit reconciliation keeps backlog #86 and the
  harness-owned remainder of #88 explicitly open rather than claiming them from presentation work.

**Why here:** Finish the surfaces after the primary journey and state vocabulary stabilize. Apply these standards during earlier work as well; this phase is the comprehensive reconciliation.

**Do in order:**

1. Reconcile `docs/ux-audit-4.1.md` and backlog #86/#88 against current code. Retain evidence for already-fixed findings.
2. Use the audit's four density layers: identity at rest; next action and blocker contextually; configuration/provenance in inspector; metrics/logs/history in deep detail.
3. Reduce workflow control competition: keep primary Run clear, move secondary actions into contextual controls, retain disabled actions with named reasons, and keep explanation from unnecessarily displacing the graph.
4. Make inspector actions appropriate to the selected kind and task. Preserve unavailable capabilities as discoverable named refusals; use progressive disclosure rather than a permanent grid of generic verbs.
5. Reconsider rail labels that classify browser, watcher, and memory as Integrations. Keep object kind and task role understandable without adding another permanent navigation strip.
6. Consolidate Skills versus Toolbox conceptually: reusable capability inventory/assignment versus contextual inspection. Preserve the underlying distinct authorities and editing paths.
7. Move watcher/routine discovery toward relevant workflow/task context while retaining their existing doors. Do not duplicate the runner.
8. Reduce persistent empty skill-trail noise while keeping the capability reachable. Keep metrics in detail.
9. Unify language for vault Markdown notes, canvas notes, free text, and named frames. Resolve caption readability, small scaled secondary content, and graph labels.
10. Review both themes, compact/wide widths, hover, focus, reduced motion, loading, missing content, and errors. Preserve aliases and the existing material system.

**Data/IPC:** Primarily presentation and action routing; avoid state migrations unless separately specified. No styling dependency.

**Verify:** Reach and paint checks, keyboard ownership, tooltip/reason visibility, graph usability at supported sizes, reduced-motion behavior, and intentional goldens for affected scenes.

**Acceptance:** The important next action is easy to find, the underlying object identity remains clear, and capability discovery does not require permanent clutter.

## D11 — Retain outcomes and help the user return

- [ ] Complete and record D11.

**Problem/evidence:** Audited run parsing prunes missing panel references and drops runs with no surviving panels. Spatial cleanup can remove the context needed to resume or understand completed work.

**Do in order:**

1. Define the lifetime of historical work independently of open views: what survives closure, deletion, workspace removal, and explicit history cleanup.
2. Reuse durable logs and snapshots. Add the minimum retained outcome record/reference needed; do not copy complete transcripts into layout.
3. Preserve task identity, execution outcome, evidence references, and unresolved/next-action facts with source and time.
4. Represent missing panels/files/logs as unavailable references. Historical records must not spawn sessions just to render.
5. Add Resume work in the workspace/task context. Derive the first summary from facts; label any later model-written summary as such and link its sources.
6. Restore navigation/camera using existing mechanisms; reopening a conversation or restarting execution is an explicit action with backend limitations respected.
7. Specify retention bounds, explicit deletion, and migration from old records before changing parsing semantics.

**Experience/IA:** The user sees what the work was for, what happened, what remains, and a concrete next action after reopening the app days later.

**Data/IPC:** Main-owned durable storage using existing store patterns. New history reads only if current APIs cannot address retained records. Review schemas and reminting/snapshot behavior carefully.

**Verify:** Close all panels, restart, missing log/file, deleted teammate/worktree, truncated record, unknown old outcome, retention trimming, and no unintended execution.

**Acceptance:** Tidying the canvas does not erase the work's meaning, and return summaries never invent an outcome.

## D12 — Preserve artifact provenance and capture decisions

- [ ] Complete and record D12.

**Do in order:**

1. Define a minimal artifact reference for existing files, images, captures, and relevant tool output. Identity and source are essential; a new artifact panel kind is not.
2. Associate artifacts with task/run/conversation and the source that produced them where known. Keep mutable titles separate from provenance.
3. For captures, retain originating preview/source URL and capture identity; preserve existing app-owned asset identity and redaction boundaries.
4. Add an explicit Accept as decision/Remember action to suitable conversation content. Show the proposed text and scope before saving into existing memory.
5. Store source conversation/turn/task references and acceptance time where supported. Distinguish accepted knowledge from generated suggestions.
6. Keep vault documents, repository memory, teammate memory, and task decisions legible as different scopes. Link rather than copy content unnecessarily.
7. Handle moved files, changed bytes, missing captures, and expired source logs with honest states.

**Experience/IA:** Task context and inspector show source and relation; memory remains the established knowledge surface. A captured image stays an ordinary spatial image object.

**Data/IPC:** Optional provenance fields and references; reuse asset and memory stores. Main owns reads/writes; outgoing text uses existing redaction rules. Specify behavior for old records with absent provenance.

**Verify:** Rename without losing origin, stale/missing source, same-name files in different repositories, repeated decision capture, intended scope, redaction, restart, and eventual export round-trip prerequisites.

**Acceptance:** A result or remembered decision can answer “where did this come from?” without relying on a renameable panel title.

## D13 — Expand search after making its coverage honest

- [ ] Complete and record D13.

**Do in order:**

1. Fix reader failures being presented as empty results in `panel-search.ts`. Return useful partial results plus named source failures.
2. State search scope, truncation/caps, redaction, and unavailable sources. Keep command search distinguishable from content search.
3. Add work items and retained conversations first, then decisions and artifact references from D11/D12.
4. Provide explicit active-workspace versus broader scope. Avoid silently searching private contexts not intended by the user.
5. Link results to an existing object, retained record, or missing-resource explanation. Opening a result must not implicitly execute a dormant session.
6. Consider bounded indexing only after measuring current reads. Reuse existing matchers where semantics are shared; do not add a search service by default.

**Experience/IA:** One accessible search entry with clear scopes and source attribution. A failed reader is visibly different from no matches.

**Data/IPC:** Extend existing result contracts deliberately. Keep privileged reads in main and apply outward/redaction policy to every new content source.

**Verify:** One/all readers failing, empty query, per-source and total caps, inaccessible sources, dormant/closed conversations, secrets, duplicates, old records, cancellation/stale replies, and navigation to results.

**Acceptance:** Search finds the work's meaning across its retained objects and accurately states what it could not search.

## D14 — Turn successful work into reusable arrangements and workflows

- [ ] Complete and record D14.

**This completes the fourth 10X opportunity.** It builds on the existing template editor rather than creating another graph format.

**Do in order:**

1. Offer Save as workflow/arrangement from a useful task outcome and from selected related objects.
2. Extract reusable roles, necessary tools, approved handoff semantics, and layout—not accidental panel IDs or historical outcomes.
3. Parameterize repository, task input, and appropriate file/list paths. Show parameters and intended actions before instantiation.
4. Preserve the distinction between an inert arrangement and executable automation. Ordinary chat drafts remain drafts unless the existing explicit run contract says otherwise.
5. Reuse template revisions, shared edit operations, run-definition snapshots, and stale-save handling.
6. Produce a small set of examples from the audited journeys: debugging environment, task implementation/review, and bounded parallel analysis/collection.
7. Keep teammate identity references honest on a machine/workspace where the referenced teammate or capability is absent.

**Experience/IA:** A contextual action on completed work; the existing workflow editor is the editing home. Templates should save repetitive setup without forcing graph editing for simple work.

**Data/IPC:** Reuse template union and store; extend schemas only for necessary roles/relationships the current format cannot express. Never persist credentials or transient session state.

**Verify:** Save/load, parameter substitution, absent capabilities, no automatic send from inert instantiation, two-editor consistency, stale save, changed templates after runs, and clean instantiation with fresh IDs.

**Acceptance:** A second task can reuse the useful structure of the first with substantially less setup, while showing exactly what will execute.

## D15 — Deepen workflow nodes and integrations around real work

- [ ] Complete and record D15.

**Why later:** The audit deferred breadth until it reinforces the core journey. The user now intends the full roadmap; implement this expansion after its context, supervision, and reuse foundations.

**Do in order:**

1. Reconcile M188 and any later node-registry work before adding anything. Reuse existing node schemas, executor seams, and four-door mappings.
2. Select a concrete recurring task for each added node. The audit does not prescribe an unlimited connector catalog; the existing roadmap's explicit node proposals must be reconciled by name.
3. Expose watcher/routine triggers in workflow context and reuse their runners, lifetime rules, and missed-run behavior.
4. Add or deepen shell, transform, HTTP, agent, and GitHub operations only where absent or inadequate. Route service operations through existing credential/broker/approval boundaries.
5. Give each operation schema-driven configuration, a meaningful example, and Test this node with explicit side-effect semantics.
6. Evaluate additional service/trigger proposals such as Slack, email, webhook, and cron against the current ledger's deferrals. If scheduled, implement bounded adapters and required setup/recovery; never claim live verification from fakes alone.
7. Ensure logs, failures, permission requests, and artifacts feed the same supervision and review surfaces.

**Data/IPC:** One node registry and existing template format; privileged execution in main. No second secret store or parallel action executor. Every dependency needs a written reason.

**Verify:** Validation/refusal, unknown node kinds, credential absence/rejection, write approval, cancellation, deadlines, retries with duplicate-side-effect risk, concurrency, app restart, and live-service hand checks where needed.

**Acceptance:** Every added node removes observed repeated work and produces understandable outcomes in the existing task/run experience.

## D16 — Make canvases and workflows portable

- [ ] Complete and record D16.

**Do in order:**

1. Reconcile existing export/import roadmap and implementation. Specify a versioned portable record over the now-stable task/template/artifact relationships.
2. Enumerate what travels: layout, definitions, selected retained facts, and app-owned assets as appropriate. Enumerate what does not: credentials, live processes, permissions/grants, and machine-specific assumptions.
3. Redact outgoing text using existing rules; define separately what exporting image pixels means because text redaction cannot scrub pixels.
4. Make import inert by default with freshly mapped identities. Surface missing repositories, assets, teammates, integrations, and unknown kinds individually.
5. Provide explicit rebinding before execution. Keep launcher/CLI and established export doors coherent.
6. Test round-trips and opening on a clean environment, not only reimporting into the same populated installation.

**Experience/IA:** Export from relevant workspace/workflow context; open/import through established entry points. The receiver gets a useful, explainable document, not a silently executable setup.

**Data/IPC:** Versioned parser with absent/malformed/unknown handling; bounded archive/assets if a container format is needed. Main owns file operations; no remote service is required.

**Verify:** Fresh IDs, relationships preserved, missing resources, malicious paths, size caps, unknown versions/kinds, redaction, explicit execution, and clean-machine/manual checks.

**Acceptance:** Another environment can inspect imported work and resolve missing requirements before running it.

## D17 — Supervise across workspaces

- [ ] Complete and record D17.

**Do in order:**

1. Build a read-only cross-workspace projection from existing task, attention, run, and retained-outcome facts.
2. Group by workspace/task and prioritize actual human blockers, then review-ready work, then ongoing work. Avoid a metrics wall.
3. Navigate through existing workspace activation and camera framing; retain merged view's display-only coordinate rules.
4. Distinguish live, last-known, and unavailable state. An inactive workspace is not automatically idle.
5. If adding a model-generated briefing, make sources visible and keep deterministic status facts authoritative.

**Experience/IA:** A workspace overview or contextual supervisory view; preserve one clear primary navigation model. Actions still route to their owning sessions and tasks.

**Data/IPC:** Aggregate existing read models. Do not duplicate session ownership or persist synthetic merged coordinates.

**Verify:** Multiple workspaces, late state events, closed panels, stale membership, inactive workspace approvals, unavailable renderer/source, and navigation without execution.

**Acceptance:** A user can determine what needs attention across workspaces without opening every canvas or trusting stale state as live.

## D18 — Suggest semantic relationships carefully

- [ ] Complete and record D18.

**Do in order:**

1. Start with explainable candidates from explicit facts: task IDs, file/tool references, artifact provenance, workflow origin, and canonical repository identity.
2. Present “Suggested relation” with its reason and source; keep it separate from confirmed membership.
3. Allow accept, dismiss, and undo. Never automatically move panels, send messages, change permissions, or start execution.
4. Introduce semantic/model inference only if deterministic candidates demonstrably miss useful relationships. Treat retrieved content as data and preserve provider disclosure/redaction rules.
5. Measure whether accepted suggestions reduce hunting and whether false positives increase cognitive load.

**Experience/IA:** Contextual suggestions in related-work detail, not permanent decorative edges across every panel.

**Data/IPC:** Persist confirmed relations and dismissals only as necessary. Model-generated text is not authoritative state. Keep inference out of pure geometry modules.

**Verify:** Same filenames in different repos, unrelated nearby panels, stale/missing evidence, dismiss/reopen behavior, undo, private content boundaries, and zero autonomous mutations.

**Acceptance:** Suggestions help users discover a useful connection and make their uncertainty and reason clear.

## D19 — Build a bounded extension ecosystem

- [ ] Complete and record D19.

**Do in order:**

1. Reconcile any existing extension surface. Define a versioned manifest against proven panel/node/action seams instead of exposing arbitrary internal objects.
2. Document declarations, lifecycle, permissions, compatibility, failure isolation, and what extensions may never access.
3. Ship one small example extension with its source and installation/removal guide before broadening the API.
4. Preserve main-process execution and broker mediation. Reuse browser guest hardening where applicable; do not grant renderer process or credential access.
5. Define missing/disabled/unknown extension behavior on saved layouts, workflows, and imported files. Keep user objects recoverable.
6. Add compatibility tests and measured resource limits. Expand the ecosystem only after the example survives normal updates and failures.

**Experience/IA:** Discover/manage extensions in configuration; extension-provided capabilities appear through the ordinary library/palette/context flows with named availability states.

**Data/IPC:** Versioned declarations, capability registration, and narrowly scoped IPC where justified. No unrestricted access to the session registry or private stores.

**Verify:** Malformed manifests, incompatible versions, permission refusal, crashed/unavailable extension, disable/uninstall with saved objects, import, resource limits, and security checks.

**Acceptance:** A developer can add a bounded useful capability without editing the repository or weakening core boundaries.

## D20 — Implement multiplayer spatial work last

- [ ] Complete and record D20.

**Why last:** Local session ownership, retained history, portable identity, and explicit relationships must be settled before adding distributed ownership. This was an experiment in the audit, not an existing capability.

**Do in order:**

1. Write a separate collaboration design around the concrete job: two people reviewing and coordinating the same task canvas.
2. Define the shared document versus machine-local runtime boundary. Local PTYs, credentials, and live sessions do not become shared implicitly.
3. Implement a bounded first slice: shared task/canvas document, participant presence, and explicit object editing with conflict handling. Choose the transport/storage only after the threat, offline, and ownership model is concrete.
4. Define operation IDs, revisions/conflicts, reconnect, participant permissions, deletion, and imported resource rebinding.
5. Make agent execution ownership explicit. A collaborator's pointer or document edit must not silently run commands on another machine.
6. Add remote supervision/control only as a separately specified capability with explicit authorization and auditability.
7. Test with two real clients, then offline/reconnect and concurrent editing. Do not call a single-client simulation proof of multiplayer usability.

**Experience/IA:** Participant identity and edit ownership appear contextually; avoid persistent collaboration clutter when working alone.

**Data/IPC:** Shared document synchronization separate from local process and credential stores. This phase may need infrastructure and dependencies, justified in its own plan; writing this guide does not deploy a service or create remote objects.

**Verify:** Simultaneous edits, conflicting moves/deletes, offline edits, reconnect duplicates, unavailable resources, permission changes, participant departure, old clients, and no unintended remote execution.

**Acceptance:** Two people can coordinate a task spatially, understand conflicts and ownership, and recover from disconnection without corrupting work or exposing local execution implicitly.

## Where the four 10X opportunities are implemented

“10X” is strategic potential, not measured performance. These are outcomes composed from the numbered phases, not four additional platforms.

| Opportunity | Foundation | First useful version | Complete planned experience | How to evaluate |
|---|---|---|---|---|
| Issue to reviewable work in one environment | D02–D04 context | D05 task start + D07 review | D08 navigation + D12 evidence + D14 reuse | Follow a real issue through implementation and review; record repeated setup and context loss |
| Supervise outcomes spatially | D05 task identity + D06 state truth | D07 evidence + D08 task overview | D10 hierarchy + D17 cross-workspace view | Find the actual blocker and decide next action across parallel work without opening every chat |
| Return without reconstructing context | D07 meaningful outcomes | D11 retention and Resume | D12 decisions/provenance + D13 search | Close task panels, restart after a gap, explain what happened and resume from sources |
| Turn successful work into a reusable workflow | D08 relationships + D12 source identity | D14 save useful roles/handoffs/arrangement | D15 useful nodes + D16 portability + D19 extensions | Run the pattern on a different task/repository without hidden old paths or accidental execution |

## Coverage of the original audit

### Every original section

| Original section | Where it affects development |
|---|---|
| 1. Executive diagnosis | D01 baseline; D02–D08 context and continuity |
| 2. Product strengths | Product contract and every milestone gate; preserve rather than rebuild |
| 3. Feature audit | Feature coverage table below; all classifications retained in the source reference |
| 4. UX audit | D01 observed journeys; D05, D07–D09, D11, D14 |
| 5. Information architecture | D01 terminology; D04 context; D05 task; D10 shell; D11 return |
| 6. Visual/UI audit | D09 launcher; D08 far view; D10 comprehensive finish; D07 recovery |
| 7. Canvas audit | D08 spatial task work; D17 overview; D18 suggestions; D20 collaboration |
| 8. Agent-native audit | D06 supervision; D07 review; D11 retained history |
| 9. Missing product layer | D02–D04 derivation; D03/D05/D12 explicit relationships |
| 10. New feature opportunities | D02–D05, D07–D08, D11–D13 |
| 11. 10X opportunities | Four-outcome implementation table above |
| 12. V5 product thesis | Product contract; D01 acceptance and all later critique |
| 13. P0–P3 roadmap | Ordered phase table; original scoring preserved below |
| 14. First implementation milestone | D02, with D01 required reconciliation first |

### Every feature disposition and later experiment

| Feature/recommendation | Implementation or preservation point |
|---|---|
| Terminals and durable sessions — KEEP | Every milestone gate, especially D02/D08/D20 |
| Conversations — IMPROVE | D02, D05–D07, D09 |
| Workspaces — IMPROVE | D05, D11, D17 |
| Board/dispatch — EXPAND | D05–D07 |
| Files/review — IMPROVE | D02, D04, D07 |
| Teammates — KEEP/simplify assignment | D05; preserve Places/service grants everywhere |
| Workflow editor — IMPROVE | D06, D10, D14 |
| Pools/orchestrators/collect — KEEP/contextualize | D06, D14–D15 |
| Browser/preview — IMPROVE | D03, D05, D12 |
| Memory — EXPAND | D04, D12–D13 |
| Vault — KEEP/distinguish | D10, D12 |
| Skills/toolbox — CONSOLIDATE presentation | D02, D04, D10 |
| Search — EXPAND | D13, with reader-failure fix eligible earlier |
| Watchers/routines — MOVE into context | D10, D15; preserve existing runners |
| Images — KEEP | D12 provenance; D16 portability |
| Notes/text/frames — REWORK language | D01, D08, D10; reconcile existing media milestone |
| Groups/bookmarks/tidy — IMPROVE | D08, D14 |
| Metrics/diagnostics — KEEP in detail | D06, D10; no new telemetry dashboard |
| Redundant explanatory chrome — remove/consolidate | D09–D10; retain discoverability and named refusals |
| More nodes/integrations — originally DEFER | D15 after primary workflow is coherent |
| Portable work | D16 |
| Cross-workspace supervisory summaries | D17 |
| Semantic relationship suggestions | D18 |
| Rich extension ecosystem | D19 |
| Multiplayer spatial work | D20 |

## Journey and failure coverage at release checkpoints

Repeat these at coherent release/act boundaries, not only at the phase that introduced them.

| Journey | Required evidence |
|---|---|
| New user | Fresh state → readiness → chosen folder/intention → useful first conversation; missing/unknown engine and auth failure recovery |
| Starting work | GitHub, Jira, and typed task → correctly scoped lane/agent; duplicate and partial-failure recovery |
| Agent work | Files/Tools/Memory/Review reflect the agent's actual context; selection and focus remain correct |
| Multi-agent work | Parallel execution, queue, approval, failure, collection, and outcome do not collapse into one state |
| Debugging | Task-linked terminal/files/browser/chat/review stay oriented; unrelated preview does not reload |
| Review | Changed files, observed versus claimed checks, unresolved items, local review, PR/refusal path |
| Returning user | Close views → restart → retained outcome/source → explicit resume; no fabricated status |
| Complex workspace | Keyboard navigation, task framing, explicit relations, far view, groups, locks, pins, and merged view |

Exercise PTY exit, API/network/auth failure, git failure/conflict, missing/moved files, stale saves, long operations, interrupted runs, malformed/unknown data, and application restart in the phases they affect. Keep manual-only checks explicit. Green automation is not evidence of real-provider writes, real-user comprehension, native density/motion quality, clean-machine installation, or two-client collaboration unless those were actually exercised.

## Release checkpoints and progress tracking

A strong-v5 product checkpoint follows D10: P0 context, task start/review, and supervision are implemented, and onboarding/spatial/UI follow-through is coherent. Existing packaging/signing/distribution obligations still apply. Do not claim a version merely because this guide's phases are complete; reconcile the repository's release plan and required verification.

A continuity/reuse checkpoint follows D16. The later P3 work D17–D20 belongs to subsequent releases and is still included in the intended full program. Give each experiment a bounded spec and measurable acceptance before expanding it.

For each phase, record:

| Guide ID | Assigned milestone(s) | Status | Spec/plan | Verification evidence | Critic disposition | Manual checks |
|---|---|---|---|---|---|---|
| D01–D20, one row per phase in the active ledger | Assigned in [the v10 ledger](build-log/m193-m224-ledger.md) §5 | Not started / in progress / verified | Repository links | Commands, tallies, exit codes | Fixed or reasoned disposition | Owed or actually exercised |

No phase is marked implemented by the creation of this document. Do not automatically execute the product roadmap while handling a documentation-only request.

---

# Complete source audit reference

The material below preserves all fourteen original sections, including the original priority scores and rationale. The numbered D01–D20 sequence above determines implementation order; this reference explains why the work was proposed. Its checkout observations and verification limitations describe the original audit date.

## 1. EXECUTIVE DIAGNOSIS

**Terminal Canvas already has much of the machinery of an agent super app. Its biggest weakness is that the user still has to assemble and remember the work context.**

The highest-leverage direction is to make existing capabilities agree about **what work is happening, where it belongs, and what needs attention next**.

The repository is also ahead of the prompt’s baseline:

- `package.json` still identifies **4.1.0**.
- The checkout is on `v9-act4-media`, with HEAD at `85edd91`.
- Onboarding, workflow editing, preview, and durable image work exist through M186.
- M187 note/frame work has uncommitted changes.

Consequently, “build onboarding,” “make workflows editable,” and “add previews” would be stale recommendations.

This diagnosis comes from source, architectural records, milestone ledgers, and inspection of ten committed golden scenes, including dark, overview, onboarding, workflow, approval, and failure states. **I did not run the application interactively or verification suites.** Visual observations concern those goldens; usability judgments are hypotheses grounded in the implementation, not measured user research. No files were changed during the audit.

The central finding has concrete examples:

1. **Chat context is inconsistently recognized.** Chats persist a directory, but the Files pane’s root resolver and the inspector’s Toolbox resolver exclude them.
2. **Preview knows locality, not ownership.** Every loopback browser reloads on any watched file change.
3. **Task state, agent state, and run state describe different things without a sufficiently clear combined view.**
4. **Returning users recover objects more readily than the meaning of their work.**
5. **The product’s navigation emphasizes object categories more strongly than user intentions.**

These are integration problems with substantial architectural reuse available.

## 2. PRODUCT STRENGTHS

**The issue-to-agent path is real.** Board dispatch already connects a work item, teammate, repository, isolated worktree, conversation, and PR. This is the best candidate for the product’s primary workflow—not an idea that needs an entirely new foundation. See [dispatch implementation](../src/renderer/canvas/Canvas.tsx) and [work-item records](../src/shared/work-items.ts).

**The lifecycle architecture supports spatial work.** Session ownership outside React makes view culling compatible with continuing terminal work. Pure geometry, viewport math, and tier assignment are valuable product infrastructure, not merely implementation details.

**Agent supervision already crosses surfaces.** Pending approvals reach conversation, inspector, palette, and attention surfaces through shared runtime state. Concurrency limits, queues, automatic continuation, and pool execution already exist.

**Workflows have a credible shared model.** Templates, pure edit operations, revision checks, and run-definition snapshots provide a much stronger base than a diagram disconnected from execution.

**The product can explain uncertainty.** Named refusals, absent/malformed distinctions, stale-write protection, and unpriced usage states demonstrate unusual care.

**The visual foundation is worth preserving.** Dark materials, restrained cyan, prose typography, conversation bubbles, diff cards, and state edges establish a coherent identity.

**Verification captures difficult failures.** The suites cover lifecycle preservation, real input, paint behavior, persistence, and cross-door consistency. That investment should support deeper workflows.

## 3. FEATURE AUDIT

Ratings below are product judgments, not usage analytics. “Find” describes apparent discoverability; frequency assumes an engineer supervising agent-assisted repository work.

| Capability | Can it do it? | Can users find it? | Is it useful? / frequency | Decision |
|---|---|---|---|---|
| Live terminals | Deep implementation, durable output, worktrees | Strong primary entry points | Essential; daily | **KEEP** |
| Agent conversations | Multiple backend adapters, tools, approvals, resume | Strong; several competing creation doors | Essential; daily | **IMPROVE** context integration |
| Workspaces | Named persisted canvases, switching, merged overview | Explicit navigation | Valuable; daily | **IMPROVE** meaning and return experience |
| Board and dispatch | Issue → teammate → lane → conversation → PR | Requires learning Board and Teammates | Strategically central; frequent | **EXPAND** into primary work journey |
| Files and review | Editing, conflict protection, git baselines, tool attribution | Present, but selection-dependent | Essential; daily | **IMPROVE** chat/task context |
| Teammates | Persistent identity, brief, places, services, skills, memory | Separate pane and setup vocabulary | Valuable for repeated delegation | **KEEP**, simplify first assignment |
| Workflow editor | Library, wiring, inspector, save, run snapshots | Dedicated panel; specialized vocabulary | Deep capability; periodic | **IMPROVE** supervision before adding breadth |
| Pools/orchestrators/collect | Production execution and joins exist | Expert feature | Valuable for bounded parallel work | **KEEP**, contextualize |
| Browser/preview | Guest browsing, discovery, widths, capture | Context-sensitive and partly command-driven | High value for web work | **IMPROVE** explicit project binding |
| Memory | Repository and teammate stores; first-message injection | Separate node and commands | Useful but easy to overlook | **EXPAND** decision capture and provenance |
| Vault | Markdown index, links, backlinks, tags | Dedicated navigation | Useful for knowledge-heavy work | **KEEP**, distinguish from task memory |
| Skills/toolbox | Inventory, editing, assignment, transcript trail | Several related surfaces | Useful, mostly contextual | **CONSOLIDATE** conceptual presentation |
| Search | Durable terminal/chat content; palette commands and objects | Search is prominent | Daily, but scope narrower than expectation | **EXPAND** incrementally |
| Watchers/routines | Triggers and scheduled teammate chats | Specialized surfaces | Periodic/power-user | **MOVE** toward workflow context |
| Images | App-owned assets, drop/paste/capture, replacement | Direct manipulation | Useful supporting evidence | **KEEP** |
| Notes, text, frames | M187 work in progress | Not yet a settled release experience | Supporting spatial explanation | **REWORK** terminology across note types |
| Groups/bookmarks/tidy | Membership, navigation, arrangement | Requires discovery | Valuable on larger canvases | **IMPROVE** task-oriented use |
| Metrics and diagnostics | Detailed technical surfaces | Appropriately secondary | Occasional | **KEEP** in detail |
| More integrations/plugin breadth | Mostly roadmap beyond existing seams | Would enlarge the product vocabulary | Unproven before core journey improves | **DEFER** |

I would not remove a major capability from this evidence alone. I would remove redundant explanatory chrome, consolidate creation choices, and defer expansion that does not strengthen the primary journey.

## 4. UX AUDIT

### Journey findings

| Journey | Existing path | Main friction | Concrete improvement |
|---|---|---|---|
| New user | Readiness → conversation → captioned starter | Teaches object inventory before establishing a useful job | Ask for a folder and intention; make examples optional |
| Starting a task | GitHub/Jira → Board → teammate → dispatch | Repository, identity, and permission setup are distributed | One “Start work” flow that assembles existing inputs |
| Agent implementation | Create chat → send request → tools/review | Selecting chat does not consistently expose its directory | Make Files, Tools, and related actions resolve chat context |
| Multi-agent work | Templates, pools, orchestrator, handoffs | Panel activity does not clearly describe overall outcome | Task/run supervision with blockers and evidence |
| Debugging | Manually assemble terminal, files, browser, agent, review | Repeated directory selection and spatial organization | Reusable task arrangement with explicitly related objects |
| Review | Open Changes/review, inspect tool-linked files | Agent turn completion and review readiness are separate | A review handoff containing changes, checks, and unresolved items |
| Returning user | Restore layout, transcripts, camera, sessions | Must reconstruct purpose and next action | “Resume work” summary derived from retained facts |
| Large workspace | Rail, attention, minimap, fit, groups | Can find objects, but must infer relationships | “Show this task” and “Show related” navigation |

A particularly strong defect is visible in source: [useFileTree](../src/renderer/canvas/useFileTree.ts) recognizes terminal and review roots, then returns no root for other kinds. [useInspectorDetail](../src/renderer/canvas/useInspectorDetail.ts) similarly excludes chats from Toolbox directory resolution.

The starter golden even says a chat has no directory. Its [persisted model](../src/shared/chat-panel.ts) says otherwise.

**This is a historical terminal-first assumption expressed as present-day product behavior.**

## 5. INFORMATION ARCHITECTURE AUDIT

### Actual product map

| Entity | Current meaning |
|---|---|
| Workspace | Named persisted canvas containing panels, camera, groups, runs, work items, annotations, bookmarks |
| Canvas | Spatial presentation and interaction surface; merged mode projects multiple workspaces |
| Project | Distributed repository/directory context; no first-class project record in `LayoutSnapshot` |
| Panel | Spatial object with a kind and persistent identity |
| Session | Runtime/conversation lifetime associated with a process-capable panel |
| Teammate | Persistent agent identity with brief and explicitly granted scope |
| Work item | Workspace record connected to a source issue, lane, teammate, chat, and optional PR |
| Workflow/template | Reusable graph definition; editable and executable |
| Run | Recorded graph execution, optionally carrying a definition snapshot |
| Memory | Repository or teammate knowledge, separate from layout |
| Vault | Configured Markdown collection, not a panel kind |
| Artifact | Several concrete representations—file, image, tool output, capture—without one common provenance model |

The workspace is currently **a named canvas, not an established project abstraction**. An agent identity is a teammate; its conversation is a chat; its execution is a session. Those distinctions are sound but insufficiently legible in the UI.

### Recommended placement

- **Workspaces:** substantial bodies of work and their return points.
- **Board:** task entry and task state.
- **Canvas:** the active task’s working objects and evidence.
- **Inspector:** context and actions for the selected object.
- **Attention:** interruptions requiring a human.
- **Teammates, Skills, Integrations:** reusable capabilities and configuration.
- **Search:** commands and retrievable work, with explicit scopes.

Keep the full panel inventory available, but stop making it carry the entire mental model.

Do not merge “project,” “workspace,” and “task.” A workspace may contain several tasks or repositories. First introduce a reliable context resolution policy; add durable project records only when a specific workflow requires them.

## 6. VISUAL/UI AUDIT

The product does not need another global restyle.

The inspected goldens show several more specific weaknesses:

- **The launcher remains choice-heavy.** A clear primary action is followed by multiple subtly different chat and terminal choices.
- **Selected surfaces expose dense control bands.** Workflow controls, explanatory refusal lines, tabs, and library controls compete above the actual graph.
- **The inspector retains generic actions even when they contribute little to the selected object’s task.**
- **Some secondary content becomes too small under canvas scaling.** The starter’s captions and workflow content demonstrate this clearly.
- **The far view shows miniature objects more clearly than meaningful work groups.**
- **Persistent empty skill-trail statements add noise around unrelated work.**
- **Category labels can mislead.** The panel rail groups browser, watcher, and memory under Integrations; that does not explain their role in the current task.
- **Some failure messages explain absence but offer weak recovery.** The missing-file scene explains recreation, but does not establish a strong next action for a moved file.

Preserve the material system and aliases. Improve hierarchy by changing what is shown at each level:

| Layer | Recommended content |
|---|---|
| Rest | Name, kind, meaningful state |
| Contextual | Next action, related work, current blocker |
| Inspector | Configuration, provenance, detailed outcomes |
| Deep detail | Logs, diagnostics, metrics, historical execution records |

Existing [4.1 audit findings](ux-audit-4.1.md) should remain traceable. Do not reopen already-fixed findings merely because their historical descriptions still exist.

## 7. CANVAS AUDIT

The canvas already supports much more than arbitrary placement:

- Pure pan/zoom mathematics and coordinate correction.
- Selection, marquee, movement, resizing, groups, and arrangement.
- Focus navigation, camera history, bookmarks, fit, minimap, and attention jumps.
- Links with executable handoff semantics.
- Session-preserving culling and bounded live terminal rendering.
- Read-only merged workspace projection.
- Annotation and media layers.

These are strong foundations.

The limitation is **semantic navigation**. Geometry answers “where is it?” more reliably than “what belongs together?”

The most valuable canvas-specific capability would be:

> **Let a person see a task’s agents, changes, evidence, dependencies, and decisions together, then move between overview and detailed work without losing that relationship.**

Concrete next behaviors:

1. “Show this task” frames its known objects.
2. “Show related” highlights explicit relationships without moving anything.
3. A task overview reports a blocker or review handoff rather than a grid of miniature transcripts.
4. Arrangement remains opt-in and undoable.
5. Closing or hiding a view never becomes an implicit instruction to stop work.

A proximity-based automatic grouping algorithm would be the wrong first step. Nearby objects are not necessarily related.

## 8. AGENT-NATIVE AUDIT

The system already has meaningful agent infrastructure: backend capabilities, teammate identity, permission requests, grants, concurrency queues, budgets, supervision, handoffs, pools, and durable transcripts.

The weak point is **the translation from runtime events to human understanding**.

### Specific gaps

**Run diagrams cannot currently express actual pending approvals through their persisted outcome model.** `wants-you` is reserved, but no run entry records the pending question. See [run-outcome.ts](../src/shared/run-outcome.ts).

**A finished turn is not a completed task.** The run classifier treats `a turn` as finished. That is reasonable for an execution node; the UI must not let it imply that the requested work passed review.

**Review state means a PR was opened.** That is a specific runtime fact, not the same as “changes ready for local review.”

**History remains tied to canvas membership.** [Run parsing](../src/shared/layout-schema.ts) drops runs with no surviving panels. Tidying a canvas can therefore undermine the retained execution story.

**Backend support differs.** Capability-driven controls are correct. Product language should explain consequences without presenting process mechanics as onboarding copy.

The supervisory question should be:

> What is this agent trying to accomplish, what evidence has it produced, and what does it need from me?

Keep raw machine and cost metrics out of that answer unless the user opens detail.

## 9. MISSING PRODUCT LAYER

**The missing layer is reliable work context—not a new orchestration engine.**

It has two stages.

### Stage one: resolve existing context consistently

Use the facts already available:

- Chat directory.
- Terminal live directory and intended directory.
- Review subject.
- Work-item lane and worktree.
- Template binding.
- Explicit links.
- Repository memory.
- Preview source, once explicitly bound.

The resolver must distinguish:

- Known context.
- No context.
- Unresolved or ambiguous context.

It must also distinguish **working directory**, **worktree root**, and **canonical repository identity**. They are not interchangeable.

### Stage two: persist only relationships that cannot be derived

Examples:

- A preview belongs to this worktree.
- A capture came from this preview.
- A decision was accepted for this task.
- An artifact belongs to this completed work item.

Do not introduce a second database of panels, copied transcripts, or speculative AI-generated relationships.

One additional investigation is warranted: `memoryRoot` resolves a git top-level, while other paths explicitly map app-owned worktrees back to their parent repository. Whether repository memory should cross those lanes must be decided and verified, not assumed.

## 10. NEW FEATURE OPPORTUNITIES

A short, ordered backlog:

1. **Consistent context for agent work.** Files and Tools work from the selected chat; preview and memory follow explicit scope.
2. **Start work from an issue.** One flow reuses Board, teammate, repository resolution, and dispatch.
3. **Review handoff.** Gather changed files, actual check outcomes, agent explanation, and unresolved questions beside the task.
4. **Resume work.** On return, show retained facts and the next available action for a task.
5. **Search beyond current panel logs.** Start with work items, retained conversations, decisions, and artifacts; label scope and partial failures.
6. **Decision capture.** Accept a conversation conclusion into existing memory with its source attached.
7. **Related-object navigation.** Frame or highlight existing relationships without rearranging the canvas.

A useful reliability finding belongs with search: [panel-search.ts](../src/main/panel-search.ts) catches reader failures and substitutes empty results. That can make an unreadable source look like “no matches.” Search needs partial-result honesty before broader indexing.

## 11. 10X OPPORTUNITIES

“10X” here means strategic upside, not a measured claim.

**1. Issue to reviewable work in one environment.**
Deepen the existing dispatch path until repository, agent, files, terminal, preview, review, and evidence stay connected.

**2. Supervise outcomes spatially.**
Show parallel work as task progress, blockers, and reviewable results. The canvas becomes an operational overview rather than a process display.

**3. Return without reconstructing context.**
Preserve the reason for the work, accepted decisions, evidence, and next action independently of whether its panels remain open.

**4. Turn successful work into a reusable workflow.**
Reuse the existing template editor, but retain useful roles and handoffs rather than merely saving a geometric arrangement.

These opportunities compound. More integration adapters do not create the same effect by themselves.

## 12. V5 PRODUCT THESIS

**Core user:** An engineer or technically capable builder supervising agent-assisted work across one or more repositories.

**Core job:** Move a meaningful task from intention to reviewed result while maintaining control and understanding.

**Unique advantage:** Persistent spatial relationships between live execution, conversation, code, evidence, and decisions.

**Primary workflow:** Choose a task and repository → start an agent → inspect related work → address blockers → review evidence → retain the result and context.

**Product primitives:** Workspace, work item, panel, teammate, session, workflow, run, artifact reference, decision.

**Mental model:**
*A workspace holds your work. Tasks connect the people, agents, tools, and evidence involved. The canvas is where you see and act on those connections.*

**What it should not become:**

- A mandatory graph editor for ordinary agent conversations.
- A second full IDE.
- A universal enterprise automation platform.
- A dashboard dominated by telemetry.
- A system that automatically rearranges or executes work based on guessed intent.

## 13. P0–P3 ROADMAP

Scores are directional judgments, 1–5. Cost 5 means expensive. They are not presented as quantitative research.

| Opportunity | Value | Frequency | Friction reduction | Differentiation | Coherence | Architectural reuse | Cost | Strategic importance |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Consistent work context | 5 | 5 | 5 | 3 | 5 | 5 | 2 | 5 |
| Task → review journey | 5 | 5 | 5 | 5 | 5 | 5 | 3 | 5 |
| Honest supervision states | 5 | 5 | 4 | 4 | 5 | 5 | 3 | 5 |
| Resume and retained outcomes | 5 | 4 | 5 | 5 | 5 | 4 | 4 | 5 |
| Broader scoped search | 4 | 5 | 4 | 3 | 4 | 4 | 3 | 4 |
| More node/integration kinds | 3 | 2 | 2 | 2 | 3 | 3 | 5 | 3 |

### P0 — required for a strong v5

**A. Consistent context across existing surfaces.**
Fix chat directory recognition first; follow with explicit preview ownership and repository/worktree policy.

**B. One coherent task-to-review journey.**
Use the existing Board and dispatch model. Add local review readiness without pretending it is PR state.

**C. Honest supervision.**
Show pending approval, queued work, execution completion, task completion, and unknown outcomes distinctly.

### P1 — major improvements

- Intent-led onboarding using the same task-start path.
- Resume summary and retained outcomes.
- Scoped search with visible coverage and read failures.
- Workflow editor hierarchy and task-oriented canvas navigation.
- Resolve the highest-impact remaining 4.1 visual findings.

### P2 — valuable expansion

- Artifact provenance and accepted decision capture.
- Reusable task arrangements.
- Portable workflows/canvases with explicit missing-resource handling.
- Additional workflow nodes tied to demonstrated workflows.

### P3 — experiments

- Semantic relationship suggestions.
- Cross-workspace supervisory summaries.
- Rich extension ecosystem.
- Multiplayer spatial work.

### High-priority implementation constraints

| Item | Experience and placement | Architecture/data/IPC | Verification and risks |
|---|---|---|---|
| Context consistency | Files/Tools reflect selected chat; unavailable context explains why | Reuse current records and invokes; pure resolution policy; no new persistence for first slice | Selection/focus divergence, stale reads, sandbox behavior, no process creation |
| Task-to-review | Work card offers Start, Resume, Review based on facts | Reuse work item, lane, review, tool index; persist only necessary associations | Duplicate dispatch, partial failure, closed lane, shared-repo attribution, GitHub/Jira differences |
| Supervision | Attention and run diagram agree on blockers; completion names its scope | Derive live approval from existing stores; decide historical representation separately | Permission arrival/answer, exit races, queued work, stopped runs, unsupported backend controls |
| Resume | Workspace/task shows prior outcome and next action | Reuse logs and snapshots; retained history needs an explicit lifetime decision | Panel deletion, restart, missing files, bounded retention, no fabricated summaries |

M180–M187 already have assigned meaning. These recommendations should amend the existing roadmap deliberately; they should not silently reuse milestone numbers or override the current media work.

## 14. FIRST IMPLEMENTATION MILESTONE

**Build first: “Selected agent context works everywhere it already should.”**

This is the smallest coherent improvement with immediate daily value.

**Problem:** A chat has a working directory, but selecting it does not make Files and Toolbox behave as though it does.

**Evidence:** `ChatSource.cwd` exists; `useFileTree` and `useInspectorDetail` omit chat handling. The starter golden exposes the contradictory explanation.

**User impact:** The user must create or select a terminal to access context the agent already has. That makes conversations feel like an attachment to a terminal application.

**Proposed experience:** Select an agent conversation. Files shows its working folder. Tools shows the applicable inventory. An unavailable context remains visible with an accurate reason.

**Information architecture:** Existing Files pane and inspector. No new pane or top-level navigation.

**Interaction model:** Selection determines inspection context. The focused terminal remains the existing path-insertion target. Preserve that distinction explicitly.

**Visual hierarchy:** Folder identity at rest; contextual actions in the existing pane; full path and diagnostic explanation in detail.

**Architecture:** Introduce a narrowly scoped pure directory resolver if needed, then reuse it in these two consumers. Keep filesystem and inventory reads in main.

**Data/state:** Derive from current panel/session facts. No layout migration.

**IPC:** Existing calls should suffice.

**Verification:**

- A selected repository chat resolves Files and Tools.
- Selecting chat B cannot briefly show chat A’s inventory.
- Selecting a chat does not redirect insertion intended for a focused terminal.
- Sandboxed, unavailable, and non-directory objects have honest behavior.
- Inspection does not spawn or dispose a session.
- Existing directory behavior for terminals, reviews, and toolbox panels survives.

**Visual regression:** Update only affected Files, Tools, and starter scenes, with a critic’s sentence before any golden changes.

**Risks:** Confusing inspection with permission, collapsing selection into focus, stale asynchronous results, or introducing broader repository identity changes unnecessarily.

**Milestone placement:** The first new product-context milestone after reconciling the current M187 work; formally amend the scheduled roadmap before assigning its number.

**Acceptance bar:** A person can start a repository conversation and immediately inspect its files and tools without creating another panel to establish context.

After that slice is green and critiqued, extend the same reasoning to preview ownership and the task-to-review journey. That is the highest-leverage path toward a coherent v5.
