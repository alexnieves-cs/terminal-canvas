# Orchestrate — an engineer's agent control room

Revised 2026-09-18. This replaces the earlier reference-first proposal. The supplied image remains the art direction; engineering usefulness now determines the information architecture and implementation order. This is a product and implementation plan, not shipped functionality or a claim of user-tested fit.

## Product decision

Orchestrate should let an engineer delegate a well-defined task, understand parallel execution, intervene when needed, inspect the resulting changes, and deliver a verified result. The first screen answers:

1. What needs my decision now?
2. What is each task trying to achieve, and where is it running?
3. What is blocked, and what depends on it?
4. What changed, and what evidence supports reviewing or integrating it?
5. What can I safely do next, and what will that action affect?

The 3D scene is a working map of these relationships. The desired experience is visually rich, spatially stable, and precise enough for daily engineering. This should work for one agent and one repository before scaling to a fleet.

## Canvas and Orchestrate remain separate pages

Canvas retains its infinite workspace, authored objects, arranging tools, terminals, editors, navigator and inspector. Orchestrate is a separate page in the same application, reached through an explicit Canvas / Orchestrate navigation choice. Both use the same active workspace and underlying work; neither owns duplicate sessions or a second copy of files.

Reuse `centerView: 'canvas' | 'orchestration'`. Keep the Canvas host mounted while covered, with its controls out of keyboard focus. Preserve Canvas's layout, viewport, drafts, sessions and pane preferences. Ordinary Orchestrate selection stays on Orchestrate. **Open on canvas** explicitly changes page and focuses the existing object. Returning through Canvas restores its prior view. Orchestrate camera and layout preferences are independent.

Scope the redesign and density exceptions to Orchestrate. A shared navigation change is not permission to restyle Canvas.

## What changes from the previous proposal

| Earlier proposal | Revised decision | Engineering value |
|---|---|---|
| Permanent agent ring around an orchestrator | Task islands grouped by repository/worktree, with optional real supervisor and dependency paths | Shows deliverables and ownership; handles independent tasks without inventing central control |
| Greeting and activity-led right column | Workspace/task scope, action queue, selected-object inspector | Makes decisions and blockers immediately reachable |
| Active-agent/build counters as the main summary | Needs attention, ready to review, running, queued/blocked | Counts lead to actionable filtered views |
| Always-visible CPU/memory card | Run limits and usage in context; machine metrics on demand | Prioritizes execution constraints over decorative telemetry |
| Fixed Terminal / Code / Files / Workflows mosaic | Resizable workbench: Changes, Checks, Output, Artifacts, Timeline | Allocates enough room to actually review code and evidence |
| File path preview as the code destination | Real diff review with baseline, worktree and revision identity | Enables review without navigating away for every decision |
| Every station is a named role agent | Agents, checks and artifacts are distinct objects with explicit kinds | A test result is not presented as another reasoning agent |
| Brighter scene means more activity | Stable state vocabulary plus measured execution effects | Distinguishes useful work, waiting, failure and unknown state |

Deployment remains an optional connected capability, not a mandatory empty panel. A static screenshot's exact content is subordinate to a working engineering loop.

## Proposed default layout

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Canvas / Orchestrate   Workspace · repository   Search     + Start task │
├─────────────┬───────────────────────────────────────┬──────────────────┤
│ Tasks       │ Attention 2 · Review 1 · Running 3    │ Needs attention  │
│             │ Scope / filters       Scene | List   │ Decision queue   │
│ Payment API ├───────────────────────────────────────┼──────────────────┤
│ Retry fix   │                                       │ Selected task /  │
│ Docs        │       3D TASK / AGENT WORKSPACE        │ agent / edge     │
│             │                                       │                  │
│ Saved views│ Repo/worktree islands · dependencies  │ Why / evidence   │
│             │ Agents · checks · resulting artifacts │ Next action      │
│             │                                       │ Scoped follow-up │
│ Workspace   │ Task brief      Fit · Focus · Map     │                  │
├─────────────┴───────────────────────────────────────┴──────────────────┤
│ Changes | Checks | Output | Artifacts | Timeline          Expand / Pin│
│ Selection-bound diff, validation evidence or output at readable width │
└────────────────────────────────────────────────────────────────────────┘
```

At 1536 × 1024: navigation/task rail approximately 180–210 px; context 320–360 px; workbench initially 230–280 px and draggable. The scene occupies the rest. Keep the header compact and allocate roughly half the window to the scene in overview mode. Review mode expands the workbench and retains a small scene for orientation. Focus mode temporarily expands the scene. These are adjustable layouts of the same page, not new workspaces.

At 1280 × 800 collapse the task rail if needed. Around 1024 px make the right context a drawer; keep an always-reachable attention button. Small heights scroll the inspector and workbench independently. Do not squeeze five tiny panels into an unreadable row. Persist panel sizes and saved views per workspace.

## The 3D interaction contract

### Spatial meaning

- **Island:** task execution context. Label its goal, repository and worktree/branch; tasks can span multiple execution contexts. Shared working directories must be visible. Repository grouping is derived from actual paths/remotes, not a new first-class project record.
- **Station:** agent execution, labeled with teammate identity, provider/runtime where known, task role and observable status. Keep teammate, conversation and session distinct in details.
- **Checkpoint:** a command/check result with running/passed/failed/unknown and its tested revision.
- **Artifact:** changed files, review bundle, preview or report, linked to its producing execution.
- **Connection:** a typed dependency or authored handoff, with direction and a readable trigger. Ordinary membership is visually quieter. Show synthetic workspace grouping explicitly; a central crystal must not imply a supervisor exists.
- **Height and glow:** small selection and state cues, never a hidden quantitative score. Cyan for execution/selection, amber for decisions, red for failure, violet for a secondary family distinction. Every state also has words and a shape/icon.

Begin with one task island and the existing graph projection, then add grouping. Keep a fixed, readable isometric camera by default; optional constrained orbit later. Names and controls remain screen-aligned and readable. Avoid transparent overlapping objects, free camera navigation that loses the workspace, and flying the camera on every event.

### Direct controls

Click selects; double-click focuses a task island; Enter inspects. **Open on canvas** is a separate labeled action. Pan, zoom, Fit all, Fit selected, camera Back, minimap and a visible selection breadcrumb keep orientation. Arrow-key/list navigation must reach every object without precision clicking in 3D.

Dependency focus dims unrelated work while showing prerequisites, dependents, blockers and exact handoff conditions. Filters include task, repository, agent, state and changed path. Saved views record filters/camera/layout, not runtime mutations. Selection synchronizes scene, list, inspector and workbench; a pinned workbench states what it is pinned to.

Dragging an agent onto a task proposes an assignment with the target and context visible; it must not silently dispatch a running agent or move its worktree. Moving a visual station changes presentation only, with undo. Drawing an execution edge enters explicit dependency-edit mode, previews the trigger and affected nodes, validates the graph, and commits through the existing execution model. Do not silently translate a visual line into permission to run commands.

### Scale and performance

With many sessions, group into task islands with honest counts and expand on focus. Semantic zoom changes from task summary to stations to evidence. Never hide blocked/needs-input objects behind an unexplained overflow node. Provide a synchronized sortable List with equivalent actions; it is also the fallback for keyboard use, reduced motion and unavailable WebGL.

Use instanced/reused geometry where practical, bounded labels, demand rendering when idle, and measured animation budgets. Target smooth interaction on the supported Mac baseline and measure frame time/memory with 1, 6, 25 and 100-session fixtures; these are validation targets, not current capacity claims. Decorative geometry is expendable before hit accuracy or legibility. Auto-layout preserves existing positions during live updates. A returning user should recognize where work is.

## The daily engineering loop

### 1. Delegate a task with a definition of done

**Start task** takes a natural-language goal and optionally a pasted issue. Show a concise editable brief: repository/base revision, acceptance criteria, relevant files/docs, exclusions, validation commands, and execution arrangement. Provide Single agent as the default; Explore / Implement / Test / Review presets propose parallel roles only where useful.

Choose an available runtime and model based on detected capabilities. Reuse existing credentials/settings; disclose tools and permission policy in the brief. Offer separate worktrees for independent write tasks and identify shared-directory execution. A worktree isolates files, not machine/network permissions. Non-Git folders can run tasks with a named limitation on branch/diff/integration capabilities.

Preview proposed tasks and dependencies before dispatch. Starting is an intentional action; editing a draft or rearranging the scene launches nothing. Concurrency, spending and time limits must say which are enforced by the backend and which are advisory. Start with existing global limits; per-task caps need a runtime extension, not just a slider.

### 2. Monitor meaningful progress

The scene and inspector show current tool/command, duration, last observed activity, produced artifacts, and next dependency. Keep run status, task stage, validation state and permission state separate: agent idle does not mean task done; command exit 0 does not mean all tests passed.

An agent summary may explain progress with links to its evidence, clearly identified as agent-authored. Never expose private reasoning text or turn an inferred checklist into recorded actions. Show source, timestamp and freshness. Silence becomes **No recent events**, not a confident deadlock diagnosis. Stale/disconnected states remain visible until refreshed.

### 3. Resolve the decision queue

Make a persistent **Needs attention** queue for permission requests, agent questions, failed checks, missing prerequisites, run limits and stale review evidence. Group repeated events by cause; retain task/agent, age, impact and one next action. Review-ready results occupy a separate queue, so completion does not compete with urgent blockers.

Selecting a queue row focuses its island and opens the relevant evidence. Approve/deny uses the existing permission request identity and source of truth. Responding on another page immediately removes/resolves it here. Auto-resolved and obsolete requests cannot be answered twice. Ordinary completed work should not trigger repeated modal interruptions.

Offer scoped follow-up, interrupt, retry, reassign and stop only when supported. Say exactly what is affected. **Interrupt** stops current generation; it does not promise rollback, process termination, or a resumable checkpoint. A future **Stop task** must report any surviving child processes and shared resources. Retry previews a new execution from known context; it cannot assume a failed command is safe to repeat. Prompt routing always names its target, and the composer must not send keystrokes to a hidden terminal.

### 4. Review with evidence

The default workbench for review-ready work is **Changes**, not a raw terminal feed. Show changed-file tree and readable diff beside acceptance criteria, agent summary and checks. Offer expand-to-review and precise navigation to hunks/files. Task selection chooses the task's review subject; agent selection chooses that session's supported review baseline. Shared-directory edits may have ambiguous authorship: show that instead of attributing all changes to the selected agent.

Every check records command, execution context, outcome, timestamp, and the revision/content identity it tested. Checks can be passed, failed, running, not run, unknown or stale. A result against an earlier revision must not authorize the latest diff. Agent-authored claims are not structured test results. Introduce adapters for structured reports incrementally; generic commands show exit outcome with raw logs.

Review acknowledgement must be bound to content. The current work-item review signature uses diff shape and can miss same-size edits; strengthen it before claiming exact revision/content freshness. Include uncommitted changes, binary files and relevant untracked inputs in a defined snapshot policy. Re-check subject identity immediately before applying a review mutation.

**Request changes** sends scoped feedback with selected file/hunk context. Existing review/commit actions can be brought into this page through the same executors. Hunk application, merge, PR publication and deployment are distinct later capabilities: show actual support and reuse established confirmation/permission behavior. Integrating independently passing branches requires validation of the combined revision. No default automatic merge just because agents stopped working.

### 5. Recover and reuse

A run timeline links dispatch, tools, permission decisions, command outcomes, changed artifacts and handoffs. Distinguish transient activity from persisted run history. After a restart, reconcile with real sessions before displaying Running. Show missed events and unavailable history explicitly.

Save a successful task arrangement as a reusable template with its brief, roles, dependencies and validation commands. Rerun produces a new execution ID and names the base revision; it does not rewrite history or blindly replay side effects. Event inspection is read-only. Durable checkpoints, cross-provider continuation and rollback require explicit new support and should not be marketed as existing features.

## Workbench and inspector

Workbench tabs are **Changes · Checks · Output · Artifacts · Timeline**. Files live inside Changes and Artifacts. Terminal output is a selectable, searchable read-only mirror unless deliberately opened in its existing live terminal. A generic code editor is secondary to a real diff and belongs on Canvas until safe shared editing is designed.

The inspector adapts to task, agent, edge, check or artifact. Lead with identity and state, then next action, then evidence and execution context. Secondary sections expose runtime/model, instructions/context sources, available tools, worktree/base revision, recorded spend and limits. Unknown costs are Unknown; partial usage totals include coverage and must not imply a universal hard cap across unsupported providers. Do not invent context-window percentages or turn latency into confidence.

Settings allow Overview, Focus and Review layouts, density, motion/quality, and saved filters. Avoid separate dashboards for every specialty. A backend engineer, frontend engineer and maintainer need the same dispatch→inspect→review loop, with different artifacts and check adapters.

## Implementation boundaries and existing seams

These are inspected repository foundations, not promises that the new surfaces already work.

| Capability | Reuse | New work / limitation |
|---|---|---|
| Page boundary | `Canvas.tsx`, `shell/useShellChrome.ts` | Keep mounted Canvas; test focus/session continuity |
| Scene and snapshots | `orchestration/OrchestrationView.tsx`, model/depth/cube/bloom modules | Task islands, semantic zoom, list parity, stable placement |
| Tasks | `shared/work-items.ts`, board dispatch/task membership | Brief/criteria and any additional execution relations need persisted schema design; preserve existing board states |
| Worktrees | `main/worktree-manager.ts`, existing dispatch | Expose isolation and branch context; overlap detection and integration preview are new |
| Permissions | `main/approvals.ts`, `chat-store.ts` approvals, `agentSession.answer` | Aggregate queue through the same request identity; do not create competing permission state |
| Actions/limits | `main/agent-session.ts`, existing verbs, usage store | Capability-aware controls; per-task quotas, pause semantics and descendant stop need runtime work |
| Review | `main/review-engine.ts`, review/readiness modules | In-page review plus stronger content identity; do not equate diff-shape signature with exact freshness |
| Dependencies | `shared/handoff.ts`, canvas handoff/run modules | Typed visual semantics, draft dependency editing, compatibility with existing triggers/joins |
| History | `shared/runs.ts`, `canvas/useRuns.ts`, activity store | Durable richer timeline and retention are new; current activity ring is not a complete audit log |
| Code/output previews | Existing file panels, output readers, lazy Monaco | Shared read-only file snapshots; no competing watch-arming reads or PTY resizes |
| Checks and artifacts | Command ledger, watcher outcomes, tool-file index | Revision-bound evidence model and structured adapters; no parsing arbitrary agent prose as authoritative results |
| CI/PR/deploy | Existing GitHub/integration boundaries where applicable | Provider-specific adapters and freshness; optional after the local review loop |

Maintain one normalized view model with durable task/run/session/artifact/decision identities and source/freshness metadata. It joins existing stores rather than forking their ownership into the renderer. Persist configuration and authored relationships; derive display state. Separate task lifecycle from a session's execution status and the state of its checks. Every new field/channel/verb follows the repository's compatibility and shared-executor conventions.

## Ordered delivery plan

| Phase | Deliverable | Exit criterion |
|---|---|---|
| A — Useful vertical slice | Separate page; one real task island; existing session selection, pending permission, output, review and explicit Canvas jump | Delegate or open one task, inspect live work, answer a real pending request, review changes and return to unchanged Canvas |
| B — Evidence workbench | Resizable Changes/Checks/Output; brief and acceptance criteria; exact review identity and freshness | Same-size edit invalidates prior review; changed revision makes check evidence stale; unavailable data is explicit |
| C — Parallel work | Multiple task/worktree islands, typed dependency lens, capability-aware controls and run limits | Two isolated write tasks and a dependent check can be followed without mixing diffs; shared-directory ambiguity is visible |
| D — Production 3D | Layered illuminated platforms, stable task grouping, minimap, semantic zoom, keyboard/List parity, adaptive quality | Legible across fixture sizes; correct hit targets; reduced motion and WebGL fallback work; no Canvas regression |
| E — Recovery and reuse | Durable timeline, restart reconciliation, reusable arrangements and saved views | Disconnect/relaunch does not fabricate state; rerun is a new execution; old artifacts keep their provenance |
| F — Optional integrations | Structured CI checks, PR review/publish, preview/deployment results | Each action uses its provider's real capability, authority and freshness; combined changes are revalidated |

Ship the 3D visual direction from Phase A, but finish useful interaction and evidence before expensive atmospheric polish. No new package is required for the core layout and procedural scene: React, Three.js/R3F, postprocessing, Motion, charts, icons and Monaco are already present. No external asset pack, hosted service or credentials are needed to begin. Provider credentials are needed only for selected integrations.

A renderer-only restyle cannot deliver the entire proposal. Strong review freshness, structured evidence, richer history and task-scoped controls are product/runtime work and must be scheduled as such.

## Verification and product acceptance

Use affected suites during implementation and `npm run verify` for the full repository check. Inspect and critique changed screenshots before updating goldens; run `verify:visual` and `verify:packaged` at close. Existing M282 failures must be reproduced and reported separately, not concealed by rebaselining.

Required scenarios:

- Canvas → Orchestrate → Canvas retains layout, pan/zoom, unsaved editor draft and running terminal dimensions; hidden Canvas cannot capture typing.
- Empty workspace offers Start task; disconnected/provider-unavailable/non-Git work remains understandable and navigable.
- A permission answered elsewhere cannot be answered again here; a stale selected node cannot target another session after filtering.
- Failed check opens its command, context and output; new edits invalidate previous evidence even when diff counts are unchanged.
- Concurrent tasks in separate worktrees have distinct review subjects; shared-directory edits are not falsely assigned to one agent.
- Dependency failure blocks downstream work with a named reason; changing a visual layout never dispatches a command.
- Unknown spend, partial telemetry, provider gaps, stopped sessions and interrupted runs remain distinguishable.
- Rapid selection and out-of-order events cannot put one task's diff under another task's controls.
- Keyboard-only, light/dark, reduced motion, narrow viewport, large graph and WebGL-unavailable paths preserve essential actions.

Evaluate with engineers on concrete tasks: find a blocker, answer a request, compare two agent changes, trace a dependency, recover an interrupted run, and review a deliverable. Record time-to-find, mistaken-target actions, evidence comprehension and frame time. The aspiration is broad usefulness; do not claim “dream workflow for almost everyone” without this validation.

## Art direction and preview status

Preserve the reference's blue-black material, cyan edges, violet accents, layered platforms, crystal focal point and readable glass. Replace decorative server blocks where they compete with task labels. Use brief selection lift, finite attention pulses and event-triggered path motion; avoid endless motion on every connector.

- [Interactive layout preview](design/orchestrate-preview.html)
- [Desktop capture](design/orchestrate-preview.png)

The revised prototype illustrates task focus, dependency/list lenses, a decision queue and an evidence workbench. It contains labeled sample data only. Its SVG scene demonstrates spatial composition, not production WebGL performance, real execution or implemented review semantics. Canvas navigation remains a placeholder into the existing application page. Prototype checks are recorded alongside the preview; full application suites are owed during application implementation.

## Rules and scope

Permit persistent decision counts, task context, evidence and execution limits on Orchestrate. Revise prior metrics/rest-density guidance narrowly where it would hide information needed to operate. Replace M282's preview-only restriction only when a shared snapshot/review reader handles the underlying ownership issue. Keep Canvas's existing product rules intact.

Preserve session lifetime, file-watch ownership, secret handling, import inertness, typed IPC, accurate state, accessibility and lazy-loading. Keep live mutation authority in existing executors. Do not delete broad rules or weaken unrelated tests to make the design easier. Existing uncommitted `Canvas.tsx` and `useShellChrome.ts` edits predate this proposal and must be preserved.

## External design cross-check

These references inform the proposal; they are not evidence of features in this repository or user validation of this design.

- [VS Code: Delegate two tasks without mixing their changes](https://code.visualstudio.com/docs/agents/guides/delegate-two-tasks) describes task briefs, file isolation, separate review and combined validation. This supports placing execution context and review evidence in the daily loop.
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) distinguishes orchestrated workflows from autonomous agents and emphasizes clear tool interfaces and feedback. The design inference here is to make delegation and dependencies explicit, while exposing observed results for intervention.
