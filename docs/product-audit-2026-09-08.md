# Terminal Canvas — product, UX, and engineering audit

Saved from the evidence-based diagnosis delivered on 2026-09-08. This preserves the audit's observations and recommendations as delivered; checkout details describe the time of that audit, not necessarily the current checkout. The execution sequence is in [the ordered development guide](product-development-guide-2026-09-08.md).

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
