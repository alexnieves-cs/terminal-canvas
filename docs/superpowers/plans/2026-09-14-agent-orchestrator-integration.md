# Agent Orchestrator integration into Terminal Canvas

Date: 2026-09-14. Status: proposed implementation plan; no runtime integration implemented.

## Recommendation and intended result

Integrate AO through a narrow, optional connection to its local daemon, while adapting its strongest coordination patterns into Terminal Canvas's existing task system. Terminal Canvas remains the authored spatial workspace: tasks connect conversations, workers, changes, previews, decisions, and retained evidence. AO contributes an external work source and a useful reference implementation for supervision.

This is deliberately two deliverables: **real interoperability with existing AO work**, followed by **native coordination improvements that also work without AO installed**. A wholesale AO backend transplant would replace working Terminal Canvas machinery and introduce two owners for sessions, worktrees, credentials, and automation. Embedding AO's desktop UI would make the canvas a launcher for another product.

The complete target journey:

1. Connect a running AO installation and choose which repositories to expose.
2. Bring an existing AO worker onto the canvas as an explicitly external work reference. Inspect its activity, branch, PR evidence, freshness, and ownership alongside native work.
3. Develop a larger outcome in the existing Terminal Canvas supervisor conversation. Review its proposed tasks, dependencies, scope, and acceptance criteria.
4. Dispatch accepted native tasks through Start work, with one recorded execution owner and isolated lane per task. Coordinate dependencies through existing workflow machinery.
5. Gather local and PR evidence, route approved feedback to the owning native worker, review the actual revision, and retain the result after its panels close.
6. Reuse a successful arrangement as a reviewed template. External references survive export as inert provenance.

External AO worker execution remains managed by AO in the initial integration. Sending prompts, spawning, killing, switching interfaces, and merging through AO are a separately gated extension described below. The initial product must accurately say this rather than presenting remote workers as locally controlled chats.

## Evidence and review limits

Terminal Canvas inspected at `c24ae677c27b8bec4dc73a5b143f4e9ab7d9e455`, including local uncommitted state. Existing changes to `README.md` and the untracked `tc-arrival-base/` directory belong to other work and must be preserved. The repository already contains milestones beyond the ranges in the top-level ledger; do not assign new M numbers from an old table.

AO was reviewed through its public `main` documentation and selected Go sources. An immutable upstream commit could not be resolved through the available network paths. Sources have different crawl ages; this is an architectural review, not a reproducible build, protocol conformance test, or exhaustive security audit. Phase I0 makes pinning and live contract verification mandatory before implementation depends on these observations.

| Finding | Evidence | Consequence |
|---|---|---|
| AO is an independently managed desktop/daemon system with isolated workers and a project coordinator | [AO README](https://github.com/Untrivial-ai/agent-orchestrator) | Use an optional integration boundary; keep the canvas as the primary authored environment. |
| Its service, lifecycle, storage, runtime and adapter layers have distinct owners | [Backend ownership](https://github.com/Untrivial-ai/agent-orchestrator/blob/main/docs/backend-code-structure.md) | Do not import Go internal packages or access its SQLite database from Terminal Canvas. |
| CLI commands use daemon HTTP routes; discovery uses a run-file handshake | [CLI contract](https://github.com/Untrivial-ai/agent-orchestrator/blob/main/docs/cli/README.md) | Verify discovery, identity and route contracts, then connect from Electron main. |
| Lifecycle facts and interface-controller generations are separate from UI presentation | [Architecture](https://github.com/Untrivial-ai/agent-orchestrator/blob/main/docs/architecture.md) | Treat recovery and stale observations explicitly; preserve a single execution owner. |
| Status derivation distinguishes lost signals from idle | [status.go](https://github.com/Untrivial-ai/agent-orchestrator/blob/main/backend/internal/service/session/status.go) | A disconnected worker must not become “finished.” |
| Kanban presentation consumes PR and review facts | [kanban.go](https://github.com/Untrivial-ai/agent-orchestrator/blob/main/backend/internal/service/session/kanban.go) | Add evidence to existing work presentation rather than replacing Terminal Canvas's task states. |
| Delegation starts a worker and can asynchronously resume/create a coordinator for title refinement | [delegation.go](https://github.com/Untrivial-ai/agent-orchestrator/blob/main/backend/internal/service/session/delegation.go) | A spawn operation can imply more work than its visible worker. Do not assume Terminal Canvas budgets constrain it. |
| CLI DTOs distinguish missing unresolved-review counts from zero | [CLI session source](https://github.com/Untrivial-ai/agent-orchestrator/blob/main/backend/internal/cli/session.go) | Preserve absent/unknown values when adapting responses. |
| Upstream includes Apache-2.0 licensing | [LICENSE](https://github.com/Untrivial-ai/agent-orchestrator/blob/main/LICENSE) | Record provenance and review applicable license/notice obligations before copying or distributing upstream material. |

No claim is made that every advertised agent has identical chat, approval, cancellation, or resume capabilities. Capability support must be measured per operation and version.

## Fit with your roadmap

The product-development guide's durable goal is intention → reviewed result with human control. This integration reinforces D05–D08 (dispatch, supervision, review, spatial navigation), D11–D12 (retained outcomes and provenance), D14–D15 (reuse and workflows), D17 (cross-workspace supervision), and D19 (bounded extension seams). It does not require D20 multiplayer, cloud hosting, a new IDE, a mandatory task graph, or replacing the Electron runtime.

| Existing Terminal Canvas seam | Reuse or extend |
|---|---|
| `src/shared/work-items.ts` | Keep task identity and current state meanings. `review` continues to mean a PR exists. |
| `src/renderer/palette/start-work.ts`, `src/main/board-lane.ts`, `src/main/board-repo.ts` | Keep the task → teammate → repository → lane dispatch path and refusal handling. |
| `src/main/worktree-manager.ts`, `src/main/work-scope.ts` | Keep worktree ownership and repository/working-directory distinctions. |
| `src/main/agent-session.ts` | Keep native send, queue, interrupt, budget and concurrency authority. |
| `src/main/pool-runner.ts`, `src/main/pool-caller.ts` | Reuse the existing pool engine; never add an independent concurrency queue. |
| `src/shared/run-outcome.ts`, `src/shared/review-readiness.ts` | Extend factual supervision and review evidence without collapsing independent axes. |
| `src/shared/retained-outcomes.ts` | Retain evidence independently of canvas membership; inspect current implementation before extending. |
| Existing supervisor flag, spawn sheet and `tc status` | Improve the existing supervisor rather than create a second coordinator panel type. |
| `src/shared/verb-table.ts`, `src/shared/workflow-nodes.ts`, `src/shared/ipc-contract.ts` | Every new action uses the common executor and four real doors. |
| `src/shared/outward.ts`, Places and service grants | Keep permission and outbound-data authority in main. |

## Architecture and data ownership

Proposed flow (names of new modules below are proposals):

```text
AO local daemon ── bounded reads ──> main/ao-client.ts
                                        │ validated facts
                                        ▼
                               main/ao-connection.ts
                                        │ typed IPC
                                        ▼
                         existing work cards / inspector
                                        │ explicit association
                                        ▼
                         native task / evidence / supervisor
                                        │ accepted native actions
                                        ▼
                  existing dispatch / AgentSessionManager / workflow
```

AO owns AO sessions, native conversations, branches, worktrees and their execution. Terminal Canvas owns native tasks, authored placement, local sessions, grants, and its own retained evidence. External links are associations, never worktree registrations or authority to inspect arbitrary returned paths.

Use an external reference keyed by `(connectionId, projectId, sessionId)`, separate from a Terminal Canvas `panelId`. A connection ID is a user-approved local installation identity, not merely a port number. Project association points to a canonical repository reference; it does not introduce a project entity into `LayoutSnapshot` or turn a workspace into a repository.

Proposed minimal records:

- `ExternalWorkRef`: stable identity tuple, optional explicitly bound native task ID, authored display name/placement association.
- `ExternalObservation`: reference, observed time, last successful refresh, source version, activity facts, PR references, optional revision identity, and `fresh | stale | unavailable | unsupported` availability. Provider activity and connectivity are separate fields.
- `TaskPlan`: ID/revision, parent intention, child task references, dependency policy, acceptance text and approval of that exact revision. Keep evidence as references with provenance.
- `TaskAttempt`: task ID, attempt ID, owner, dispatch key, lane/session references, phase and failure reason. This is an operational record; don't relocate all workspace state into main.
- `FeedbackDelivery`: owner/attempt, source event ID, revision, payload digest, approval/grant reference, delivery state and retry history.

Persist only associations, attempts and decisions that cannot be safely derived. Keep volatile status caches outside layout snapshots. Specify atomic writes and recovery at the existing persistence seam; introduce no database merely because AO has one. Each parser preserves absent optional fields, drops malformed entries by name and retains unknown provider statuses as unknown. Audit every copy/export/import site.

## Ordered implementation

Use I0–I8 as plan IDs, then map them to unoccupied milestones after reconciling the ledgers. Each phase needs a scoped spec and implementation checklist. Start the next phase only when its dependencies and acceptance gate pass.

### I0 — Freeze the contract and establish a baseline

1. Read `CLAUDE.md`, current ledgers and the relevant architecture entries. Search load-bearing entries for every module to be changed using `npm run lb -- <module>`.
2. Resolve an immutable AO revision. Record source URL, commit, build/version, applicable licenses/notices and supported OS/runtime requirements in `docs/integrations/agent-orchestrator.md`.
3. Inspect the pinned route registration, discovery/identity validation, authentication middleware, session schemas, error envelopes, pagination, PR summaries and event transport. Record actual request/response fixtures; never invent routes from product labels.
4. In a repository-contained development fixture, test a running AO daemon without using real project secrets or invoking workers. Check whether ordinary reads cause provider probes, writes or background execution. Honor the repository's prohibition on changes outside this checkout.
5. Reconcile completed roadmap work against source and per-milestone logs. Establish `npm run verify` baseline and record pre-existing failures separately.

**Acceptance:** A pinned, testable compatibility matrix identifies supported reads and their side effects. If safe discovery/read contracts cannot be demonstrated, keep the connection unavailable with a specific reason and resolve that contract before I1; native I4 design can proceed independently.

### I1 — Build the read-only AO adapter

Depends on I0.

1. Add proposed `src/shared/external-work.ts`, `src/main/ao-client.ts`, and `src/main/ao-connection.ts`. Use narrow transport injection and a fake daemon fixture.
2. Discover only the selected local installation. Validate handshake identity, version and loopback endpoint; reject redirects and non-loopback destinations. A process listening on the expected port is insufficient identity proof. If the protocol lacks adequate authentication, document the remaining local trust boundary and limit the feature to explicitly trusted installations.
3. Implement an allowlist for project/session reads and verified PR summaries. Candidate documented paths include `GET /api/v1/projects`, `GET /api/v1/sessions`, and `GET /api/v1/sessions/{id}`; I0 must confirm their pinned schemas.
4. Bound payload size, pagination, request duration and polling. Suggested starting policy: refresh active selected work every 15 seconds, background connections every 60 seconds, back off failures to 5 minutes, allow manual refresh, and mark snapshots stale after missed refreshes. Tune using measurements; do not poll once per mounted card.
5. Use monotonic request generations to discard late responses. Key cache entries by full external identity. On disconnect retain the last snapshot with its age; never clear it into a confident empty list.
6. Add typed IPC first, then handlers and preload exposure. Proposed operations: list connections, connect/disconnect, list external work, refresh. Update both pinned IPC documentation locations.

**Tests:** malformed/oversized responses, missing fields, unknown enums, two installations reusing IDs, partial pagination failure, daemon restart, wrong identity, redirected response, late reply, and connection loss. Assert no spawn/send/kill/write endpoint is reachable.

**Acceptance:** A supported daemon's work can be listed with trustworthy freshness; Terminal Canvas functions normally without AO.

### I2 — Make external work useful on the canvas

Depends on I1.

1. Add Connect AO in existing integration/settings surfaces, with selected repository mappings and clear availability reasons.
2. Extend existing work-card presentation with an external-reference variant. Do not represent it as a native terminal/chat or silently create an agent. Keep existing authored selection, marks, placement, undo, tiering and export behavior.
3. Add “Add external work,” “Refresh,” “Link to task” and “Remove reference” through canvas, palette, agent and workflow doors. An imported workflow action remains unreviewed and inert.
4. At rest show title and one meaningful state. Contextual controls expose the next action. Inspector holds AO identity, branch, PR links, freshness, capability limits and task associations. Deep detail holds raw diagnostics.
5. Resolve external file/preview links only through existing gates. An AO-supplied absolute path grants nothing. A verified app deep link may be offered if I0 proves it; otherwise offer supported PR links and an honest instruction to inspect execution in AO.
6. Closing/removing a reference only removes the view. Disconnecting only stops reads. Neither stops AO or removes its worktrees.

**Tests:** same-title workers, duplicate add, undo/redo, close/reopen, offscreen tiering, workspace switch, stale and missing sessions, malicious paths/URLs, export/import. Add visual scenes for normal, disconnected and unsupported states.

**Acceptance:** Place AO and native work together, inspect them, navigate away and restart without spawning or terminating anything.

### I3 — Unify evidence and attention without rewriting task states

Depends on I2.

1. Add a pure adapter from external observations to the existing supervision/readiness vocabulary. Preserve provider-reported evidence as reported; it is not a locally observed command exit.
2. Keep task progress, execution activity, approval blocker, connectivity, local review standing and PR checks separate. Derive the one resting word and next action from these facts.
3. Do not equate idle, exit zero, merged PR, or exhausted pool with accepted task completion. Keep the user's completion decision separate.
4. Extend existing attention navigation with explicitly external work only if it can lead to a real next action. Deduplicate notifications by event transition; acknowledge a warning until facts materially change.
5. Preserve the local-only journey when no GitHub credentials or PR exist. For native PR observation reuse the existing broker and grants; AO data does not authorize additional GitHub reads.

**Tests:** active with stale review, missing CI, failed versus pending checks, lost signal, closed unmerged PR, simultaneous native/AO references to the same PR, and unchanged-state notification suppression.

**Acceptance:** Every displayed blocker has provenance and a reachable action; unavailable evidence never looks like a pass.

### I4 — Upgrade the existing supervisor to produce reviewable task plans

Depends on I0; consumes I3 when external context is enabled.

1. Extend the existing supervisor's context projection with selected task/outcome references, repository scope and relevant fresh observations. Do not ship whole transcripts or all connected repositories by default.
2. Add structured plan proposals with goal, task boundaries, dependency reasons, acceptance criteria and proposed teammate. Repository-scoped history should be an explicit association on existing conversations/decisions, not a parallel global project database.
3. A proposal creates inert task data. Accepting a plan revision authorizes only its named operations within existing grants. Editing execution scope invalidates the affected acceptance.
4. Use `Start work` to dispatch accepted tasks. Drafting a title or reorganizing a plan must never invoke an agent in the background.
5. Surface the plan in the existing conversation and task inspector; create spatial grouping only on request and preserve authored positions. Ordinary conversations remain ordinary conversations.

**Tests:** invalid/cyclic dependencies, stale revision acceptance, deleted teammate, denied place, duplicate acceptance, interrupted drafting, imported plan, and no execution from mere inspection.

**Acceptance:** A user can turn an intention into a comprehensible accepted plan and dispatch its first native task through the existing path.

### I5 — Make coordinated dispatch durable and bounded

Depends on I4.

1. Trace M198's dispatch reservation through all callers. Its in-renderer attempt tracking must not be assumed to survive app restart. Introduce durable attempt identity only where current behavior lacks it.
2. Journal reservation → lane ready → session ready → send accepted → running → result available. Commit enough identity before each side effect to reconcile a crash. A retry first looks up the attempt and existing resources.
3. Schedule eligible dependencies through existing workflow/action and pool seams. Main enforces budgets and concurrency through `AgentSessionManager`; the scheduler stores dependency eligibility, not a competing send queue.
4. Default dependencies to explicit accepted-result release. Allow an explicitly chosen successful-check policy only with named evidence. Turn completion alone never releases downstream implementation as success.
5. Detect overlapping repository/path claims and warn or serialize. Path claims coordinate workers; they are not filesystem sandboxes. For initial dependent tasks, require an explicit base revision after integration of prerequisite work. Do not silently stack branches or assume a sibling worktree contains another worker's changes.
6. Stop prevents new dispatch and interrupts in-flight native workers. Check cancellation again after awaited creation. Preserve worktrees and evidence for inspection. Recovery reconciles owners before resuming; uncertain sends remain uncertain and are not blindly repeated.
7. Preserve existing pool/collect constraints: its caller currently refuses joined pools whose items cannot all run at once. Do not bypass that refusal with a new dependency layer; use explicit task dependencies or design a separate tested join revision.

**Tests:** crash after every journal phase; duplicate start; ambiguous send; stop during create; lowered live budget/concurrency; revoked permission; one worker failure; app/window restart; missing lane; branch conflicts; late result from an earlier attempt.

**Acceptance:** Dispatch a three-task native plan, restart mid-run and finish it without duplicate agents, duplicated input, orphaned worktrees or false downstream completion.

### I6 — Close the review and feedback loop

Depends on I3 and I5.

1. Extend evidence with repository identity, attempt, base/head commit, and a content-sensitive identity for dirty working changes. Compute/capture in main at review time; invalidate on relevant change and recheck before an action. Do not hash entire diffs on every canvas render.
2. Explicitly replace or augment the current shape-only review signature. It can miss edits with identical paths/counts, so it cannot authorize an automatic feedback/merge decision tied to content.
3. Create a bounded feedback draft from selected CI failure/review evidence, tied to the owning native attempt and revision. Scrub outbound text through the existing gate and retain provenance.
4. Default to explicit Send feedback. Automatic sending requires an existing scoped grant, a maximum cycle count and the live shared budget. Use durable delivery identity keyed by source event/revision/owner; if the backend cannot prove delivery after a timeout, show “delivery uncertain” and require reconciliation before resend.
5. PR publishing/commenting continues through the existing outward path. This repository's no-push/no-remote-object rule means development tests use fixtures; this plan does not authorize a real push, comment or merge.
6. Keep merge manual in this release. At eventual merge time, current head, checks, review and permissions must be revalidated. A local review mark alone is insufficient.

**Tests:** same-shape different-content edits, force-pushed head, stale CI, duplicate events, feedback echo loops, changed owner, exhausted budget, revoked grants, redaction and ambiguous delivery.

**Acceptance:** A native worker receives approved feedback once, produces a new reviewable revision, and old approval becomes visibly stale.

### I7 — Retain outcomes and turn successful plans into reusable work

Depends on I6.

1. Extend existing retained outcomes with bounded plan/attempt/evidence references and accepted decisions. Closing a panel preserves meaning without duplicating complete transcripts into layout JSON.
2. Add return-to-work context: objective, last accepted result, remaining blocker and available evidence. Resuming execution remains explicit.
3. Save an accepted arrangement through existing template revision machinery. Parameterize repository, teammate and task inputs; clear execution IDs and delivery state.
4. On import clear local connection authority and grants; external references are unresolved provenance until rebound. Previewing or importing never connects to a daemon, starts an agent or sends feedback.
5. Reuse existing search scopes and cross-workspace navigation for retained tasks. Do not manufacture a second global dashboard.

**Tests:** panel deletion, missing evidence, cap/retention behavior, layout round trip, older layouts, malformed references, template revision and import on a machine with no AO.

**Acceptance:** Close a completed task's panels, return later and understand its outcome; instantiate its template without accidentally executing it.

### I8 — Compatibility, release and handoff

Depends on I1–I7.

1. Keep AO integration opt-in. Verify application startup, native agents and all authored object kinds with AO absent, stopped or incompatible.
2. Test at least the pinned supported AO build and a deliberately incompatible fixture. Update compatibility fixtures before expanding the supported range; never automatically download and run arbitrary upstream code.
3. Bound retained snapshots and event history. Measure polling request counts, main-process responsiveness and large-canvas behavior. Tiering must not change external execution or multiply subscriptions.
4. Document setup, ownership, supported operations, privacy/data flow, failure recovery, version support and disable/disconnect behavior.
5. Run all repository gates, inspect changed visual scenes, complete the required fresh-context critic review, and record evidence in the assigned milestone ledger. Resolve critic findings before declaring the implementation done.
6. Rollback disables the adapter and new scheduling actions while preserving inert references and attempt history. It must not kill native/AO work, remove branches, or downgrade persisted data destructively.

**Acceptance:** The full target journey passes on the packaged macOS app, and disabling AO leaves normal Terminal Canvas work usable.

## Optional extension: controlling AO workers from Terminal Canvas

This is outside the initial I0–I8 release, not an implied part of Connect AO. It requires a separate ownership/grants spec because AO execution bypasses native `AgentSessionManager` ceilings.

Implement one explicit send to an existing AO worker first, only after verifying send acknowledgement, identity, approval modes, cancellation semantics and uncertain-delivery behavior in the pinned protocol. Display external budget/control limits truthfully. Keep automated AO send/spawn disabled unless AO can enforce equivalent scoped grants and ceilings or the user explicitly adopts a separately defined external execution policy.

Then, if justified, add AO spawn as a distinct external executor: AO alone creates its session/worktree; Terminal Canvas records the external reference and never creates a matching native lane. Enumerate secondary coordinator starts and all background automation. Model an adoption/handoff as a transaction requiring the previous controller to relinquish ownership before another starts. Do not attach a native PTY controller to the same conversation concurrently. Cloud execution, terminal streaming, interface switching and remote merge each need independent contract tests and product justification.

This boundary keeps the initial integration genuinely useful and implementable without pretending two independent orchestration engines share one enforcement system.

## Verification and milestone discipline

Before changing checks, read `docs/verify-suites.md`; search it by suite/module rather than reading it whole. Add scoped failing checks before new implementation, then run the relevant suites and `npm run affected` between milestones. Appropriate existing suites include layout, IPC, verbs, agent-session, review and the affected Electron panel suites; confirm current script names in `package.json`.

At each milestone close, `npm run verify` must print all suite tallies and exit zero. At every act close additionally run `npm run verify:visual` and `npm run verify:packaged`. Inspect intended visual changes before updating goldens and record a critic sentence for each changed scene. Do not substitute mocks for the final real-daemon/manual recovery journey or claim green suites prove provider behavior they do not exercise.

Suggested acts: A = I0–I3, external visibility; B = I4–I6, native coordination and review; C = I7–I8, retention and release. Each is independently useful. Use conventional commits scoped to newly assigned milestones, preserve unrelated work, and never push or create remote objects as part of this implementation run.

Implementation starts with I0. The final release is complete only when I8 passes and the remaining unsupported AO controls are explicitly documented as such.

## Verification observed while preparing this plan

`npm run verify` exited 1 on 2026-09-14. All 37 initial suites passed; the build then failed at `src/renderer/canvas/usePaletteActions.ts:1475` with TS2304: `Cannot find name 'forgetAgentLinksFor'`. The subsequent Electron tier did not run. No runtime source was changed for this plan, so this is a baseline blocker, not an integration regression. Resolve it in I0 before claiming a green implementation baseline. Visual and packaged gates were not run for this planning-only change; they remain required at implementation act closes.
