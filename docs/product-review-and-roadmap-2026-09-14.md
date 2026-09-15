# Terminal Canvas: product review and development order

Reviewed September 14, 2026. This is a proposed development sequence, not an implementation milestone or a claim that the application is release-ready. Existing roadmap reservations remain intact until explicitly reconciled.

## Product judgment

**Terminal Canvas has enough feature breadth. Its highest-value next release should make starting, supervising, reviewing, and returning to real coding work feel like one continuous experience.**

The strongest product positioning is **a spatial workspace for supervising agentic coding from intention to accepted result**. Its advantage is keeping the conversation, implementation, preview, evidence, and decisions together in an arrangement the user owns. Multiple terminals and multiple agents are useful infrastructure, but competitors already offer parallel agent execution and separate Git checkouts.

Today, this is a capable environment for an experienced user who knows its concepts and can bridge gaps manually. It is less convincing as a dependable orchestrator for someone who expects to describe a project, approve a plan, leave, and return to verified work. The gap is predominantly continuity, evidence, discoverability, and execution recovery—not the absence of an orchestration engine.

I recommend focusing on individual developers and small technical teams supervising several repository tasks. Keep freeform research and document work available, but make coding the default information hierarchy. Do not spend the next cycle expanding artifact types or building a general-purpose office suite.

## What this assessment actually examined

- Source at `c24ae677c27b8bec4dc73a5b143f4e9ab7d9e455`, including the existing uncommitted working tree. No application source was changed for this review.
- Repository rules, architecture, current ledgers, prior development guide, recent UI milestones, and the September 14 Agent Orchestrator integration proposal.
- Main/renderer paths for task dispatch, provider capabilities, review readiness, retained outcomes, search, approvals, workflow execution, and shell navigation.
- Fresh screenshots generated from the current built renderer through the repository's scripted Electron harness. These use fixture data and real UI routes; they are not a field study or proof of successful live provider execution.
- Current official documentation for comparable tools, linked below. Product recommendations are judgments derived from this evidence, not measured user outcomes.

Earlier screenshots and the September 8 audit are historical context. In particular, the permanent row of creation kinds has already been collapsed, selected-chat context has been addressed, task navigation exists, and provenance/retained-outcome code exists. Those should not be rebuilt from an outdated checklist.

Verification results and their limits are recorded at the end of this document.

## Capability inventory: what exists and how far it goes

| Area | Current implementation | Practical assessment and next gap |
|---|---|---|
| Spatial workspace | Pan/zoom, selection, groups, layout persistence, semantic tiers, snapping, bookmarks, task framing, related-task lens, merged workspaces | A strong foundation. Routine work still needs a predictable task composition; large canvases should not require remembering object locations. |
| Terminal execution | Main-owned PTYs, xterm rendering, durable output, command boundaries, search, optional tmux persistence, broadcast | Valuable for arbitrary CLIs. Terminal survival and structured-chat survival are different promises; explain them separately. Broadcast needs exceptionally clear recipients and scope. |
| Structured agent conversations | Claude, Codex, Copilot CLI and Copilot ACP registry entries; transcripts, attachments where supported, tools, context, memory | Provider choice is broader than workflow compatibility. Only Claude's current registry row supports the appended prompt required by supervisor/routine/dispatched-lane behavior. |
| Starting tasks | Typed/GitHub/Jira work items, teammate assignment, repository selection, worktree lane creation, initial send, partial-failure notes and retry guards | Reuse this path. Improve setup defaults and persist execution attempts before side effects; current in-memory guards are not a crash journal. |
| Supervision | Attention queue, approval answers, run-state projection, automatic modes, budgets/concurrency, pool execution | Substantial machinery exists. Unify the task's next action, distinguish stalls from waiting, and explain which controls apply to each backend. |
| Code review | Baseline/fork diffs, across-worktree review, file review, commit/discard, task review readiness, local review marks, PR path | Useful, but a local review mark fingerprints paths and line counts, not content. Evidence must become revision-specific before stronger automation depends on it. |
| Workflow authoring | Template graph, node editor, revisions, run snapshots, handoff edges, pools, orchestrator/collect/action/HTTP nodes | More than a diagram. Execution events still need stronger task acceptance semantics; joined pools currently refuse workloads that cannot run all workers at once. |
| Context and knowledge | Files, Markdown notes/vault, tools/skills, memory, explicit remember action, source references | Preserve the existing scope work. Make actual context sent to an agent visible and curate knowledge over time; do not imply every nearby object is automatically context. |
| Preview and artifacts | Browser/preview ownership, discovery/capture, image provenance, notes, checklists, sheets, decks, document import/export, draft review | Strong supporting capabilities. Improve their task association and review workflow; most do not need permanent top-level prominence for a coding user. |
| Retrieval and retention | Panel-log/transcript search; bounded retained task outcomes; source/task references | A starting point, not full return-to-work memory. Search catches reader failures as empty results, and retained outcomes hold little explanatory context. |
| Reuse and portability | Presets, prompts, templates, packs, portable canvas import/export and review gates | Existing assets should become easy to reuse from a successful task. Distinguish saving an arrangement from saving executable behavior. |
| Integrations | GitHub/Jira broker and credentials, scoped teammate places/services, proposed AO connection | Deepen revision/check/feedback integration before adding many services. AO interoperability is proposed, not implemented. |

Primary evidence: [provider registry](../src/shared/agent-backends.ts), [work items](../src/shared/work-items.ts), [dispatch implementation](../src/renderer/canvas/Canvas.tsx), [review readiness](../src/shared/review-readiness.ts), [retained outcomes](../src/shared/retained-outcomes.ts), [search](../src/main/panel-search.ts), [workflow nodes](../src/shared/workflow-nodes.ts), [pool caller](../src/main/pool-caller.ts), and [decision/provenance implementation record](build-log/m211-m212-d12-artifacts-decisions.md).

## The UX to build toward

The main journey should be:

**Describe work → choose repository and execution profile → start → answer blockers → inspect changes and checks → accept or request changes → retain the result.**

For larger work, insert **review proposed tasks and dependencies** before start. For a simple task, do not force a planning ceremony.

The user should be able to answer these questions at any point:

1. What am I trying to accomplish, and what counts as finished?
2. Which agent is acting, on which checkout, with what authority?
3. What needs my attention now?
4. What changed, and what evidence supports accepting it?
5. What will happen if I stop, close, restart, or run this again?

### Proposed placement of features

| Surface | Responsibility | Recommended change |
|---|---|---|
| Top bar | Workspace/task identity, start/create, global retrieval | Keep the existing shell. Give ordinary task creation a clearly named route; keep object creation in its shared sheet. Make search scope explicit. |
| Tasks navigator | Find, prioritize, resume and review work | Default to a compact task list grouped by actionable status; offer Board as a view. Keep source-provider state secondary. Add task filters for needs input, changes to review, active, and archived. |
| Canvas | Arrange related execution and evidence | On first task start, compose a compact task area. Use existing Fit task/Show related. Add an explicit reversible arrangement action; never continuously move authored objects. |
| Task card | Objective, one meaningful state, next action | Promote exactly one next action: Start, Answer, Review changes, Continue, or Inspect failure. Place remaining actions in contextual controls; disabled actions retain reasons when accessed. |
| Selected task inspector | Scope, acceptance criteria, owner, attempts, changes, checks and outcome | Prefer task-specific section names over generic Detail/Work/Tools where those labels obscure meaning. Do not change every object inspector to a task inspector. |
| Conversation composer | Send to an identified recipient with identifiable context | Show the active agent and checkout; let users inspect included files, instructions and accepted decisions. “Related on canvas” and “sent to agent” must remain distinct facts. |
| Attention | Decisions that unblock work | Retain the queue and jump behavior. Explain task, question, proposed action and scope; separate approvals, ordinary questions, failures and review-ready work. |
| Files and Notes | Navigate repository content and knowledge | Root from selected work as implemented. Show the source task/repository where relevant; offer attach/reference actions. |
| Teammates and Skills | Reusable execution profiles and capability configuration | Keep existing objects and routes. Make them accessible from task setup; users should not have to tour both panes before their first task. |
| Integrations and Settings | Connections and system configuration | De-emphasize during everyday work. Surface connection failures contextually when they actually block a task. |
| Workflow editor | Define repeatable execution | Use business-readable node names and guided fields; reserve raw verb syntax for advanced editing and the existing agent door. |

### Specific visual findings

The fresh launcher is materially better than the old screenshots: numbered steps, a prominent Start work action, and a smaller set of creation choices. Preserve that improvement. The left empty Panels pane still spends space telling a first-time user to start a panel while the main surface asks them to start work; align the instructions and consider collapsing the empty navigator on first run.

The current task fixture presents Start work, Resume, Open PR, Review, Show and Done together. Those are useful verbs, but equal visual weight makes the user interpret the state machine. The task card should do that work. The board calls a column “review” while its empty explanation means “a pull request exists”; local readiness is a separate implementation fact. Clarify the labels instead of silently changing persisted meanings.

The conversation design is readable and worth retaining: user bubbles, unboxed assistant prose, collapsed tool activity. Task/agent titles truncate quickly in busy scenes. Use the human objective as the primary title and put provider/session details in the existing contextual/inspector layers.

Current occupied scenes still demonstrate the spatial cost of unrelated panels around the active task. This is a fixture stress case, not proof that every user arranges work poorly. It does show why task framing, related-work filtering, and a stable focus mode are essential. Extend existing fill/fit behavior rather than invent a separate editor application.

Avoid another broad theme rewrite. Spend visual effort on readable hierarchy, predictable focus, action placement, and compact-width behavior. Audit hover-only controls for keyboard access and audit native menu copy/paste/undo across all editable surfaces; source currently guards several named editor kinds, so the old blanket clipboard warning should be reproduced per surface rather than assumed universally true.

The fresh workflow editor also already has structured inspector fields, node labels and a more compact toolbar. Preserve those improvements. Its captured graph is partly outside the available viewport, and compact mode places a floating canvas control cluster near the inspector's bottom action area. Treat these as concrete scenes for a visibility/occlusion check, not evidence that the workflow editor must be replaced.

Screenshots inspected for this assessment: [current launcher](../out/product-audit/shots/launcher.png), [dark occupied canvas](../out/product-audit/shots/kinds-dark.png), [task board](../out/product-audit/shots/board.png), [conversation](../out/product-audit/shots/chat.png), [workflow editing](../out/product-audit/shots/workflow-edit.png), and [compact layout](../out/product-audit/shots/compact.png). These are local generated evidence under `out/`, not committed golden baselines.

## Ordered development plan

The identifiers below are product-plan IDs, not reserved M numbers. Sizes are relative: **S** is a focused change, **M** spans a journey or several modules, **L** requires durable data/runtime work. They are not calendar estimates. Follow the order unless a specified dependency allows otherwise.

| Order | Deliverable | Why it comes here |
|---|---|---|
| R0 | Verified baseline and accurate roadmap | Prevent duplicate work and unreliable release claims. |
| R1 | Content-sensitive review evidence | Acceptance must refer to the actual changes. |
| R2 | One next action and a coherent task stage | Make the existing capabilities usable together. |
| R3 | Repeatable repository/lane setup | A new task needs a working environment. |
| R4 | One additional provider's complete task journey | Make provider choice meaningful before coordinating across providers. |
| R5 | Durable attempts and recovery | Prerequisite for trustworthy unattended execution. |
| R6 | Accepted plans and dependencies | Coordinate work on top of reliable task execution. |
| R7 | Revision-aware feedback and integration | Turn generated work into accepted changes. |
| R8 | Retained outcomes and scoped retrieval | Preserve understanding after panels close. |
| R9 | Guided workflow reuse | Package a proven journey rather than an incomplete one. |
| R10 | Packaged, accessible, scale-tested release | Validate the experience under real working conditions. |
| R11 | Optional external worker visibility | Expand only after the native loop stands on its own. |

### R0 — Establish a trustworthy product baseline · P0 · S–M

Reconcile the ledgers against source, not just their summary rows. D11 is still labeled not started in the old map although retained-outcome implementation exists; D12 also has a separate completed record. Record shipped, implemented-but-unverified, proposed, and manual-check-owed separately. Keep one current index.

Update misleading public descriptions: README still leads with every node being a terminal and its limitations section denies portable canvas export that source implements. Finish the active UI run's verification and inspect fresh scenes before accepting goldens. Resolve test infrastructure failures without calling them application defects.

**Where:** README, CLAUDE index, current ledgers, screenshot/verification harnesses. Preserve the user's existing changes.

**Acceptance:** One reproducible build and full green verification gate on a fixed tree; correct feature claims; visual and packaged gates at act close; live-provider checks explicitly listed.

### R1 — Make review evidence describe the actual revision · P0 · M

Replace or augment `reviewSignature` with content-sensitive evidence captured in main. Include canonical repository, lane/attempt, base/head and an identity for relevant uncommitted content. Revalidate before an action relying on that review. Keep local code review, check results, PR status and user acceptance separate.

Start with “Review changes” and a clear current/stale/unavailable state. Add named checks tied to the same revision; a process exit or an agent's claim that tests passed is not a trusted check result. An optional agent reviewer can contribute findings but does not replace the person's acceptance.

**Where:** `review-readiness.ts`, review engine/IPC, `ReviewNode`, task card and inspector.

**Acceptance:** Change code while preserving filenames and added/removed counts; the old review becomes stale. Editing after tests invalidates their relevance. Shared-checkout diffs never imply exclusive agent authorship.

### R2 — Give every task one obvious next action · P0 · M

Use the current supervision and review projections to derive a shared task action model. Show objective, blocker/result, and one primary action on the task card, task list and command pill. Keep PR existence distinct from “ready for local review.” Retain current persisted state semantics initially and change their presentation deliberately.

Improve the existing task stage: frame related work after starting, preserve authored positions, and offer compact conversation/change/preview composition when those objects exist. Related-work membership remains derived wherever possible.

**Where:** `WorkNode`, `BoardPane`, task membership, pill model, inspector, `run-outcome.ts` and review projection.

**Acceptance:** With three simultaneous tasks, a user can locate a blocked task, answer it, and review another task without opening a configuration pane or interpreting competing status words. Switching view never restarts execution.

### R3 — Make repository setup repeatable · P0 · M

Add a small reusable repository setup profile: approved setup command, verification commands, preview command/port policy, and default execution choice. Associate it with canonical repository identity; it need not introduce a new top-level project entity. An existing worktree alone does not provide dependencies, ignored environment files, databases or a running preview.

Start work should choose an existing teammate/profile or offer a simple inline setup path. Explain separate-checkout versus shared-checkout work before starting. Show Preparing, Ready, or Setup failed with a retry action and logs. Do not silently copy secrets or execute newly discovered repository scripts.

**Where:** existing Start work flow, teammate selection, `board-lane.ts`, worktree manager and preview discovery. Add narrowly scoped setup records only where missing.

**Acceptance:** A fresh lane becomes usable through a reproducible setup flow. A failed setup can retry without another lane. Two tasks run previews without port collisions. Ordinary task creation requires no manual trip through Teammates and Integrations.

### R4 — Make provider support match the product promise · P0 for multi-provider positioning · M–L

Audit installed provider versions and current supported protocols. The current Codex/Copilot restrictions are facts of these adapters, not proof that the vendors cannot support richer behavior. Establish an explicit compatibility matrix for plain chat, task dispatch, instructions, approvals, cancellation, resume, attachments and usage.

Deliver one additional backend through the complete task-to-review loop before adding more provider names. Decouple the product concept “task instructions” from the specific Claude appended-prompt flag where a supported protocol can express it safely. Never flip a capability boolean without recorded streams and runtime tests.

Keep interrupting a turn, stopping a process, and closing a view distinct. Report unknown cost rather than zero or a fabricated estimate.

**Where:** backend registry/adapters, session args/manager, dispatch and setup choices.

**Acceptance:** The same small task can run through Claude and one other provider, including stop/failure/resume behavior, with differences visible before start. Unsupported workflows are disabled with a useful route.

### R5 — Make execution attempts survive interruption · P0 before autonomous plans · L

Introduce a durable task-attempt journal at the privileged execution boundary. Persist reservation, lane identity, session identity, first-send state and result references around side effects. Current renderer promise guards and recovery notes are useful but insufficient to prove crash recovery.

Model ambiguous delivery explicitly. A timeout after sending must not automatically repeat the prompt. On restart, reconcile running processes, conversations and lanes before allowing retry. A task owns a sequence of attempts; a panel is one view into it.

**Where:** existing dispatch path, main session/worktree ownership, layout or separate bounded attempt store, retained outcomes. Preserve the two existing lifetimes.

**Acceptance:** Restart after each phase of creation/send and obtain no duplicate task, lane, conversation or input. Stop during creation prevents later dispatch. Closing a view preserves the explanation of what happened.

### R6 — Turn a large intention into an accepted task plan · P1 · L

Extend the existing supervisor conversation with a reviewable plan containing bounded tasks, acceptance criteria, assigned profiles, repository/lane scope and dependencies. Keep draft revision and accepted revision distinct. Accepting a plan and starting it are explicit actions. Most small tasks bypass this feature.

Schedule through existing execution ceilings. Dependencies should normally release on an accepted result; a user may choose a named verified-check policy. A finished turn does not mean the implementation is ready for its dependent task. Define how prerequisite code reaches the next checkout: explicit integration/base revision first, sophisticated stacked branches later.

Detect overlapping write scopes as coordination conflicts; path claims are not filesystem sandboxes. Separate result messages from authority to send new work. Defer arbitrary inter-agent chat until structured handoffs prove insufficient.

**Where:** existing supervisor, work-item/plan schema, workflow graph/action execution, pool/session limits and R5 attempts. This is not another coordinator panel type.

**Acceptance:** A three-task plan with one dependency survives a blocked worker and a restart, respects the shared budget, and never begins dependent implementation against missing prerequisite code.

**Dependency:** R1, R2, R3, R5; R4 before claiming provider-independent coordination.

### R7 — Close the feedback and integration loop · P1 · M–L

Present changes, current checks, review findings and PR state together for the owning attempt. Offer “Send these findings” as an editable feedback draft. Bind feedback to revision and recipient, redact outbound content through the existing path, and prevent duplicate delivery.

Support one integration path well: review → request changes → new revision → re-review → explicit commit/PR/integration action. Explain merge conflicts and dirty-worktree blockers at the action. Defer automatic merge until evidence freshness and permission checks are proven.

**Where:** review engine, GitHub broker/board PR functions, task inspector and native session send.

**Acceptance:** A failing check produces feedback to the correct worker once; its fix invalidates old review state; repeated provider events do not create a feedback loop. Actual remote writes remain outside this repository review's authorization.

**Dependency:** R1 and R5. Can precede R6 if single-agent use dominates.

### R8 — Make returning to work a first-class journey · P1 · M

Extend retained outcomes with a bounded objective/result summary, acceptance evidence references, decisions, remaining blockers and attempt identity. Preserve pointers to durable logs rather than copying transcripts into layout JSON. Display unavailable evidence honestly.

Distinguish three operations: return to an existing conversation, continue a completed task with a new attempt, and retry a failed attempt. “Start work again” should explain which one will happen. Add an archive/history view under Tasks, independent of whether its original panels remain.

Fix search reader failures first: return partial/unavailable status and coverage. Then search task titles/outcomes, accepted decisions and artifact metadata across chosen workspaces. Keep command finding and content searching discoverably related but explicitly scoped. Full repository code search can continue to use established external tools until its need is demonstrated.

**Where:** retained outcomes, task history, panel search and palette result model, memory and provenance references.

**Acceptance:** Close the panels, restart, and find why a decision was made and which revision was accepted. An unreadable log never produces a confident “no matches.”

**Dependency:** R5 for full attempt-aware resume; the search failure fix can land immediately after R0.

### R9 — Make successful workflows reusable without becoming a workflow engineer · P1 · M

Extend existing selection/template capture into a guided “Save as workflow” action from a completed task. Separate an arrangement of objects from executable steps. Parameterize repository, instructions and teammate choices; strip session IDs, pending approvals and execution state.

In the existing workflow editor, prioritize steps, inputs, release conditions and results. Include preflight validation showing what will run and why a node cannot run. Explain the current collect/pool restriction before execution. Add durable multi-wave collection only as a separately tested engine change.

Ship a small curated set: investigate → propose → implement → verify → review; independent issue fanout; and review-only second opinion. Keep imported workflows inert until reviewed.

**Where:** template library/edit/capture, `WorkflowNode`, pool/collect validation, packs and import path.

**Acceptance:** A user saves one completed workflow and instantiates it in another repository without editing verb syntax, leaking prior authority, or automatically starting agents.

**Dependency:** R6–R8 for outcome-aware workflows; basic editor clarity can follow R2.

### R10 — Make the product dependable at working scale · P1 · M

Carry performance/accessibility checks throughout development, then close with a realistic workload: several active agents, many retained objects, previews, background output and long transcripts. Measure input latency, navigation, memory, file watchers, recovery and disk retention. Establish budgets from a reproducible machine baseline rather than invented universal numbers.

Exercise keyboard-only creation, task switching, approvals, review and text editing. Test native menu actions, multiple panes, compact widths, Reduce Motion and unreadable/unsupported backend states. The new startup animation must never delay useful interaction or obscure a critical decision; test pass-through input carefully.

Complete signing/notarization, clean-machine installation and packaged recovery before promoting the app broadly. Preserve dirty/unmerged work during cleanup.

**Acceptance:** The full task-to-accepted-result journey passes in the packaged app, alongside the repository's full, visual and packaged gates. Observed provider limitations remain documented.

### R11 — Add external execution visibility where users actually need it · P2 · M–L

Use the existing AO proposal for optional, bounded external visibility: explicitly external worker identity, repository association, freshness and provenance. Native execution remains useful with AO absent. Avoid making external visibility a dependency for native planning, evidence or recovery.

The current proposal orders AO visibility ahead of native coordination. For the broad product goal in this review, I recommend doing native R1–R8 first, unless active users already have AO work they cannot supervise. Reuse its I4–I7 design constraints within R5–R9 rather than implement them twice. Keep AO send/spawn/merge as separately specified control features with one owner per execution.

**Acceptance:** Disconnecting AO leaves the native app intact and its external references accurately stale. No second controller silently owns the same worker.

## Release cuts and deferrals

**First useful release:** R0–R5. The promise is reliable individual tasks, understandable review and honest provider support. Do not wait for multi-agent planning to ship that improvement.

**Second useful release:** R6–R10. The promise is accepted plans, durable coordination, feedback and return-to-work context. R7 may move ahead of R6 for a mostly single-agent audience.

**Optional expansion:** R11. Cloud workers, multiplayer editing, automatic merge, cross-platform support, broad connector coverage and additional artifact kinds remain separate investments. Do not fold them into this sequence by default.

Avoid a generic “project database” until saved repository configuration demonstrably requires one. Workspace, repository and task already have different meanings. Also avoid a second global dashboard, another command surface, or a replacement session engine; improve the existing ones.

**The next implementation specification should be R0, followed by the smallest R1 slice:** invalidate a local review when content changes even if paths and line counts do not. Keep repository setup, backend expansion and plan scheduling out of that first review change. Each later phase gets its own spec, scoped checks, critic evidence and ledger entry under the repository's existing milestone discipline.

## How to know the product is improving

Run formative sessions with developers unfamiliar with the implementation. Use actual small repositories and keep a record of intervention points. Suggested initial product targets—not current measured results—are:

| Journey | Initial success criterion |
|---|---|
| First task | At least 4 of 5 participants start a task unaided; setup failures identify a recoverable next step. |
| Supervision | Participants identify the blocked task and correct next action within 10 seconds in a three-task workspace. |
| Review | Every participant can distinguish agent completion, passing checks and human acceptance. |
| Return | Participants recover objective, last accepted result and next step within 30 seconds after reopening. |
| Reliability | Crash/retry tests produce zero duplicate sends or lanes; uncertainty is visible. |
| Workflow reuse | Participants reuse a saved workflow in another repository without knowing internal node/verb syntax. |

Track accepted outcomes and time spent reconstructing context, not the number of agents spawned. Small formative samples identify friction; they are not statistical proof of market demand.

## Comparable-product lessons

Cursor's worktree documentation covers setup configuration, separate task checkouts and bringing reviewed work back. That makes environment preparation and result integration part of the competitive baseline. Terminal Canvas should meet that baseline while adding persistent spatial evidence. [Cursor worktrees](https://cursor.com/docs/configuration/worktrees)

Conductor explicitly distinguishes independent workspaces from multiple agents sharing a branch. Adopt that clarity in task setup: users should understand whether work is independent or shares current files. [Conductor parallel agents](https://www.conductor.build/docs/concepts/parallel-agents)

Claude Code documents shared tasks, inter-agent messaging and centralized management for agent teams. Task dependencies and coordination are therefore valuable expectations, but Terminal Canvas should add reviewable plans, durable ownership and visible acceptance rather than expose raw messaging as its main interface. [Claude Code agent teams](https://code.claude.com/docs/en/agent-teams)

These are feature-level reference points, not a comprehensive market ranking. The recommended differentiation is **seeing and retaining why a result deserves acceptance**, with execution and evidence connected on a workspace the person controls.

## Verification record

- **Build:** `npm run build` exited 0, including both TypeScript checks. The earlier AO proposal's missing-import build blocker is therefore not reproduced in the current working tree. [Build log](../out/product-audit/build.log)
- **Full verification attempted, not green:** the initial sandbox run stopped on watcher/socket access errors. A rerun with local access exposed a fixture-discovery problem: scratch directories kept inside this repository inherited its Git root. Those failures are not attributed to application behavior. The temporary worktree registration and branch created by that attempt were removed.
- **Corrected verification:** with `TMPDIR` inside `out/product-audit/tmp` and `GIT_CEILING_DIRECTORIES` bounded there, all initial suites passed and the build passed. The Electron tier progressed through PTY, PTY manager, window lifecycle, IPC, canvas and xterm checks, then stalled in `verify:panels:core`. A separate verification run belonging to other ongoing work was also active in this repository. This review's runner and its stalled panel child were stopped; the other run was left untouched. This is an incomplete, potentially contended gate, not evidence establishing an application root cause. Re-run in isolation under R0. [Corrected verification log](../out/product-audit/verify-final.log)
- **Fresh scripted screenshots:** `npm run shot` exited 0, but its manifest records 59 successful scenes and one failed optional `starter` scene: “the arrangement is not on screen.” The harness's successful process exit must not conceal that scene failure. Screenshots were generated with isolated fixtures; several key scenes were visually inspected as linked above. [Manifest](../out/product-audit/shots/manifest.json), [capture log](../out/product-audit/shot.log)
- **Not run:** `verify:visual`, `verify:packaged`, live paid-agent tasks, real remote writes, and manual clean-machine/recovery checks. This was a review and planning task, not an implementation act close.
- **Change scope:** the only authored deliverable from this review is this report; application source and existing user edits were preserved. Generated evidence is under `out/product-audit/`. Local report links were checked for existence. No goldens were rewritten and nothing was pushed.

The visual and packaged release gates remain owed for implementation act closes; fixture screenshots do not replace those gates or live-provider/manual checks. The roadmap is ready to use, but this review does not certify the current app as release-ready.
