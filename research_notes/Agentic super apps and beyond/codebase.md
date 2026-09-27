# Terminal Canvas codebase: what it ships, its seams, its rules and its stated next steps

Scope: an internal-source inventory of the local repo `/Users/alexnieves/Documents/terminal-canvas` (branch `main`, HEAD 4d3920c4 plus another session's uncommitted M352 work), researched on 2026-09-26. Every citation is a repo-relative file path, not a URL. The README's status line still says `v5.0.0`, but the milestone table runs to **M352**. Commits after M339 are local and unpushed (per the run's memory notes). Several docs are stale compared with the code, and each case is flagged below.

---

## Q1. What does the app do today?

### Takeaway
It is a macOS Electron app. On an infinite canvas of "authored objects" (terminals, structured agent chats, files and notes, previews, workflows, pictures, boards, and more), a person starts, supervises, reviews and accepts coding-agent work. The positioning has moved from "every node is a live terminal" (1.0) to "move a meaningful task from intention to reviewed result while the person keeps control" (v10 contract). Since M330 it has also been a multiplayer team product (accounts, presence, shared canvas, shared text, relay terminals).

### Cited Findings
- The self-description is "An Electron app for macOS: an infinite canvas of authored objects — agents, terminals, files, previews, workflows, pictures and notes… A terminal is ONE thing a panel can be." — [CLAUDE.md](CLAUDE.md); [docs/product-rules.md](docs/product-rules.md) "What it is".
- Core job: "Move a meaningful task from intention to reviewed result while the person keeps control and understanding. A workspace holds your work; tasks connect agents, tools and evidence; the canvas is where you see and act on those connections." — [docs/product-rules.md](docs/product-rules.md) "The v10 product contract (M193, D01)".
- README capability list (older, terminal-centric): real PTYs on a pan/zoom canvas; LOD cards with a fixed live-WebGL budget; tmux-backed agents that survive reload and, opt-in, quit; attention states, edge pips and `Cmd+J`; workspaces; broadcast input; a `Cmd+K` palette; a per-panel review/diff/commit layer; hand-off edges; durable scrollback (2 MB per panel); `tc` CLI plus the `terminal-canvas://` URL scheme over a 0600 Unix socket; OSC 133 command boundaries and a run ledger; cross-panel search; snapping and tidy; a worktree per panel; project prompts from `.claude/commands`; subagent nodes (Claude only). — [README.md](README.md) "What it does" (lines 18–144).
- Stated non-goals and limits: no isolation between agents (a worktree is not a sandbox: "every agent runs as your user"), unsigned builds, macOS only, terminals not screen-reader accessible, and no canvas export that another instance can open. That last limit is stale, because M189 "portable" import/export exists. — [README.md](README.md) "What it does not do"; [src/shared/portable.ts](src/shared/portable.ts).
- Milestone arc (run by run): v3 (M71–M95) made it an "agentic super app": `AgentSessionManager`, chat panel, approvals, a task graph with joins, runs and templates, supervisor and ceilings, memory, watcher, vault, git across worktrees, a broker with GitHub. v5 (M96–M108) added the verb table, auto modes, teammates, routines and the spend card. v6 (M113–M125) added the dispatching board, copilot JSONL and ACP engines, chat mode and search. Act III (M126–M133) added skills, the shelf, pool/orchestrator/collect nodes and the workflow panel. v9 (M180–M192) made objects authored (templates, preview, asset store, notes/frames, action/HTTP nodes, portable file). — [docs/milestone-history.md](docs/milestone-history.md).
- Recent milestones M300–M352: Orchestrate durable record and timeline (M300–M302); a 3D "Watch" lens (M304); check-output records (M306); review comments and "finished ≠ verified" (M307); a decision inbox (M308); a return briefing (M309); issue→PR (M310); Combine for parallel lanes (M311); repository setup (M312); editor/shell hand-off and `tc task` (M313); recipes (M314); delegate→review→Accept merge (M315); job-journal recovery (M316); Integrate with receipts (M317); a task-grouped decision queue (M318); backend fit (M319); deliverables and evidence export (M320); portable recipes (M321); an editable message queue (M322); project-first Start work (M323); a task focus view (M324–M326); an execution plan (M327); accounts through collab (M330–M338); shared text Rich (M339); a live Supabase probe (M342); relay attach (M343–M344); collab persistence and ops (M346–M347); a local-first sync chip (M348); agents as roster citizens (M349); per-agent meters and caps (M350–M352). — [README.md](README.md) milestone table, lines ~1106–1157.
- The 2026-09-14 product review judged: "Terminal Canvas has enough feature breadth. Its highest-value next release should make starting, supervising, reviewing, and returning to real coding work feel like one continuous experience". Recommended positioning: "a spatial workspace for supervising agentic coding from intention to accepted result". It warned: "Do not spend the next cycle expanding artifact types or building a general-purpose office suite." — [docs/product-review-and-roadmap-2026-09-14.md](docs/product-review-and-roadmap-2026-09-14.md).
- The same review has a capability-inventory table (spatial workspace, terminal execution, structured conversations, starting tasks, supervision, code review, workflow authoring, context/knowledge, preview/artifacts, retrieval, reuse/portability, integrations), each row with a "next gap". — [docs/product-review-and-roadmap-2026-09-14.md](docs/product-review-and-roadmap-2026-09-14.md) "Capability inventory".
- Stack and process model: main owns every PTY and process. The renderer has CSP `default-src 'self'` (no remote assets; a browser pane is a `<webview>`). `src/shared/ipc-contract.ts` declares the channels (roughly 250 are listed in CLAUDE.md). — [CLAUDE.md](CLAUDE.md) "Architecture", "Gotchas".

### Inferences
- The product has already become an "agentic super app" in the sense its own backlog #9 meant (the unit is "a thing an agent can work in"). Future-direction proposals should therefore be framed as depth, trust or reach on existing seams, not as new breadth. The internal review explicitly warns against more artifact kinds.
- Code and ledgers are the source of truth. README prose is partially stale (the version line, "what it does not do").

### Gaps
- No usage or telemetry data about which features real users use. Sentry telemetry is opt-in with a DSN ([src/main/telemetry.ts](src/main/telemetry.ts)), and no field study exists. The 2026-09-20 audit lists real-user acceptance testing as P1 owed ([docs/canvas-opportunity-audit-2026-09-20.md](docs/canvas-opportunity-audit-2026-09-20.md)).

---

## Q2. Engines, orchestration, workflows, routines/watchers, packs, teammates, decisions, caps, multiplayer and accounts: what exists and where?

### Takeaway
Nearly every "agentic" subsystem one might propose already has a named seam in `src/`:
- a multi-backend conversation runtime
- a closed verb table with four doors
- supervisors, pools and auto modes under main-enforced ceilings
- teammates as scoped identities
- routines, watchers, packs, recipes and portable files
- a credential broker
- memory
- a decision queue
- per-agent caps
- a Yjs/Hocuspocus multiplayer stack plus a pty relay server

### Cited Findings

**Agent engines and runtime**
- Registry rows `claude`, `codex`, `copilot`, `acp` ("copilot (acp)"). Codex has no interrupt, copilot asks no permission, and only claude takes an appended prompt. — [src/shared/agent-backends.ts](src/shared/agent-backends.ts) (ids at lines ~104–205); [src/shared/backend-fit.ts](src/shared/backend-fit.ts) header.
- `main/agent-session.ts` (M71, about 1,467 lines) is a main-process CONVERSATION runtime over the installed CLI in headless stream-json mode. It spawns on first send, `--resume` works across exits, permission requests are first-class, and the whole thing runs under plain node against a fake runner. The installed CLI is already authenticated, so the chat panel "needs no credential". — [src/main/agent-session.ts](src/main/agent-session.ts); [docs/ideas-backlog.md](docs/ideas-backlog.md) #8.
- Adapters and parsers: [src/main/backend-adapters.ts](src/main/backend-adapters.ts), [src/shared/codex-transcript.ts](src/shared/codex-transcript.ts), [src/shared/copilot-transcript.ts](src/shared/copilot-transcript.ts), [src/shared/acp-transcript.ts](src/shared/acp-transcript.ts), [src/shared/transcript.ts](src/shared/transcript.ts).
- Backend fit (M319): Start work offers a backend and refuses one that lacks a required capability (appended prompt, enforced no-push, interrupt, resume, images, known cost, read-only). — [src/shared/backend-fit.ts](src/shared/backend-fit.ts); [README.md](README.md) M319 row.
- Chats with no place live in `userData/sandbox/<id>` (M120). — [src/main/sandbox.ts](src/main/sandbox.ts).
- A one-shot headless "describe a tool" run (`claude -p --tools "" --json-schema …`) is the app's only structured-output generation door (M252). — [src/main/tool-generate.ts](src/main/tool-generate.ts).
- Subagent nodes come from Claude's `~/.claude/projects` files. — [src/main/subagent-scan.ts](src/main/subagent-scan.ts), [src/main/subagent-watch.ts](src/main/subagent-watch.ts), [src/renderer/canvas/SubagentLayer.tsx](src/renderer/canvas/SubagentLayer.tsx).

**Verbs, doors, automation**
- The closed verb table (M96) has about 84 verbs, each with `destructive`, `actions` and `target`. `verify:verbs closure.1` fails the build if a PaletteActions member appears on neither list. Auto modes (M97), routines (M101) and the spend card (M102) all read `destructive` from it. — [src/shared/verb-table.ts](src/shared/verb-table.ts).
- AUTO is "a bounded autonomous run, as data". Modes are `complete`, `harden`, `review` and `custom`, each with a turn limit that main enforces alongside M82's ceilings. The renderer chip is only a projection. — [src/shared/auto.ts](src/shared/auto.ts).
- Supervisor (M81): a job description is appended to the system prompt on every spawn, and it is claude-only because of the appended prompt. — [src/main/agent-session-args.ts](src/main/agent-session-args.ts), [src/main/backend-adapters.ts](src/main/backend-adapters.ts).
- Pool runner (M132): N workers over a shared list. It obeys `agents.maxConcurrent` and the budget, which are read live, and a budget crossing interrupts workers rather than killing them. — [src/main/pool-runner.ts](src/main/pool-runner.ts), [src/main/pool-caller.ts](src/main/pool-caller.ts).
- Swarm presets (M275): Explore/Implement/Test/Review arrangements with a hub, worker roles and real hand-off triggers, run through the existing `dispatchWorkItem`. — [src/shared/swarm.ts](src/shared/swarm.ts).
- Workflows: template graph, node editor, revisions, run snapshots, `pool`/`orchestrator`/`collect` nodes (M132), `action` nodes that run verb lines through the palette's executor (M188), and `http` GET nodes that refuse writes. — [src/shared/workflow-nodes.ts](src/shared/workflow-nodes.ts), [src/shared/workflow-graph-schema.ts](src/shared/workflow-graph-schema.ts), [src/renderer/workflow/](src/renderer/workflow/), [src/main/node-run.ts](src/main/node-run.ts).
- Routines (M101) are scheduled agent prompts. `ROUTINE_PROMPT`: "You are running as a scheduled routine with nobody watching… do not delete, force-push, publish, pay, or send anything outward". `ROUTINE_LIMIT_WORD`: "runs while the app is open — not while it is closed". The minimum interval is 60 s and the maximum count is 50. — [src/shared/routines.ts](src/shared/routines.ts), [src/main/routine-runner.ts](src/main/routine-runner.ts).
- Watchers: trigger kinds `path`, `git-ref`, `timer` (min 10 s) and `panel`. They run a command and keep an 8 KB tail. — [src/shared/watch-trigger.ts](src/shared/watch-trigger.ts), [src/main/watch-runner.ts](src/main/watch-runner.ts), [src/renderer/watcher/](src/renderer/watcher/).
- Hand-off edges and restart-on-exit links. — [src/shared/handoff.ts](src/shared/handoff.ts), [src/renderer/canvas/useHandoff.ts](src/renderer/canvas/useHandoff.ts), [src/renderer/canvas/handoff-rules.ts](src/renderer/canvas/handoff-rules.ts).
- `tc` CLI verbs: `open`, `list`, `focus`, `ping`, `plan`, `task`, `board`, `memory`, `usage`, `login`/`logout`/`accounts`/`use`, `invite`/`join`, `share`/`shares`/`open-share`/`share-role`, and others. Agents inside panels have `tc` on PATH and can drive the canvas through `tc plan` (the "agent line" door). — [src/cli/tc.ts](src/cli/tc.ts), [src/cli/tc-main.ts](src/cli/tc-main.ts), [src/main/control-server.ts](src/main/control-server.ts), [src/main/control-handler.ts](src/main/control-handler.ts), [src/main/control-protocol.ts](src/main/control-protocol.ts).

**Teammates, skills, memory, context**
- A teammate (M100) is "a persistent identity with a scope, not a spawned process". It has a name, a brief (system prompt), its own memory, readable skills, PLACES it may touch, services it may spend, and whether it may message or be scheduled. The three permissions are separate lists by design. — [src/shared/teammates.ts](src/shared/teammates.ts); UI in [src/renderer/shell/TeammatesPane.tsx](src/renderer/shell/TeammatesPane.tsx).
- Project memory (M83) is an append-only JSONL per repo under `userData/memory/<slug>.jsonl`, with kinds `decided`/`tried`/`failed`/`note`. Every write passes `redactSecrets`. — [src/main/memory-store.ts](src/main/memory-store.ts); [src/renderer/memory/MemoryNode.tsx](src/renderer/memory/MemoryNode.tsx); [src/renderer/chat/memory-context.ts](src/renderer/chat/memory-context.ts).
- Skills (M126–M131): the shelf, the Skills pane, a skill editor, the skill trail, and assignment to teammates. — [src/shared/skills.ts](src/shared/skills.ts), [src/main/skill-write.ts](src/main/skill-write.ts), [src/main/skill-assign.ts](src/main/skill-assign.ts), [src/renderer/skills/](src/renderer/skills/).
- The toolbox reads skills, commands, agents, **MCP servers** (from `~/.claude.json` / `.mcp.json`) and hooks, but only as a read-only inventory. — [src/shared/toolbox.ts](src/shared/toolbox.ts) (`ToolKind = 'skill' | 'command' | 'agent' | 'mcp' | 'hook'`), [src/main/toolbox-scan.ts](src/main/toolbox-scan.ts).
- Vault (Markdown notes with `[[links]]`, backlinks and `#tags`): [src/shared/vault.ts](src/shared/vault.ts), [src/main/vault-read.ts](src/main/vault-read.ts).

**Tasks, review, decisions, evidence**
- Work items and dispatch (M113–M116; Start work M197/M323). — [src/shared/work-items.ts](src/shared/work-items.ts), [src/shared/work-item.ts](src/shared/work-item.ts), [src/renderer/palette/start-work.ts](src/renderer/palette/start-work.ts), [src/main/worktree-manager.ts](src/main/worktree-manager.ts).
- Review, merge and integration: [src/main/review-engine.ts](src/main/review-engine.ts), [src/shared/review-readiness.ts](src/shared/review-readiness.ts), [src/shared/review-comments.ts](src/shared/review-comments.ts), [src/main/lane-merge.ts](src/main/lane-merge.ts), [src/main/combine-runner.ts](src/main/combine-runner.ts), [src/main/integrator.ts](src/main/integrator.ts) (M317: "what landed is byte-for-byte what the check passed on"), [src/main/check-output-store.ts](src/main/check-output-store.ts).
- Decision queue and inbox (M308, M318, M329): [src/renderer/shell/decision-inbox.ts](src/renderer/shell/decision-inbox.ts), [src/renderer/shell/useDecisionInbox.ts](src/renderer/shell/useDecisionInbox.ts), [src/renderer/shell/ApprovalDetail.tsx](src/renderer/shell/ApprovalDetail.tsx), [src/main/approvals.ts](src/main/approvals.ts).
- Return briefing and retention: [src/shared/return-briefing.ts](src/shared/return-briefing.ts), [src/shared/retained-outcomes.ts](src/shared/retained-outcomes.ts), [src/renderer/shell/ReturnBriefing.tsx](src/renderer/shell/ReturnBriefing.tsx).
- Task deliverables and evidence (M320): [src/shared/task-deliverables.ts](src/shared/task-deliverables.ts), [src/main/task-evidence.ts](src/main/task-evidence.ts).
- Execution plan (M327): [src/shared/task-plan.ts](src/shared/task-plan.ts), [src/renderer/focus/FocusPlan.tsx](src/renderer/focus/FocusPlan.tsx).
- Job journal and recovery (M316): [src/shared/job-journal.ts](src/shared/job-journal.ts), [src/main/job-store.ts](src/main/job-store.ts), [src/main/job-recovery.ts](src/main/job-recovery.ts).
- Orchestrate view (3D scene, Watch, task board, workbench): [src/renderer/orchestration/](src/renderer/orchestration/).
- Run ledger and timeline (M52, M300): [src/main/run-ledger.ts](src/main/run-ledger.ts), [src/shared/run-ledger.ts](src/shared/run-ledger.ts).

**Caps and meters (M350–M352)**
- M350: each agent has its own meter and caps, enforced by main outside the agent loop. Spend is carried across every process the agent runs. `agents.nodeCapUsd` and `agents.nodeCapContextK` hold an agent that crosses either cap: a context crossing interrupts the turn, a spend crossing holds at the result, and the refusal reads `refused-cap`. — [docs/build-log/m350-node-caps.md](docs/build-log/m350-node-caps.md); [README.md](README.md) M350 row.
- M351: per-agent caps live on the chat record (`ChatSource.caps`), are read by main from the SAVED layout ("never a renderer's claim") and are re-read on every save. — [docs/build-log/m351-agent-caps-record.md](docs/build-log/m351-agent-caps-record.md).
- M352 (uncommitted in the working tree): the `cap-agent` verb through all four doors. "An agent or a workflow may only LOWER a cap… raising, removing or resetting one is a person's." — [docs/build-log/m352-cap-agent-verb.md](docs/build-log/m352-cap-agent-verb.md); [src/shared/verb-table.ts](src/shared/verb-table.ts) `cap-agent`; new file `src/renderer/canvas/palette-actions/caps.ts`.
- Older ceilings: M82 canvas budget and `agents.maxConcurrent`; M102 spend card for broker calls. — [src/main/pool-runner.ts](src/main/pool-runner.ts) header; [src/main/broker.ts](src/main/broker.ts); cost and pricing in [src/shared/cost.ts](src/shared/cost.ts), [src/shared/pricing.ts](src/shared/pricing.ts), [src/main/usage-accumulator.ts](src/main/usage-accumulator.ts).

**Integrations and credentials**
- Broker (M87): "an agent in a panel calls a service this app holds a credential for, without ever seeing the credential". The service table is closed, and every call (refusals included) writes an audit row. — [src/main/broker.ts](src/main/broker.ts), [src/main/broker-audit.ts](src/main/broker-audit.ts).
- Credential store (M14): `safeStorage`-encrypted, with no `credential:get` by design. — [src/main/credential-store.ts](src/main/credential-store.ts); [CLAUDE.md](CLAUDE.md).
- GitHub and Jira clients and nodes; GitHub publish (release, PR comment, Discussion) needs a person. — [src/main/github-client.ts](src/main/github-client.ts), [src/main/github-publish.ts](src/main/github-publish.ts), [src/main/jira-client.ts](src/main/jira-client.ts), [src/renderer/github/](src/renderer/github/), [src/renderer/jira/](src/renderer/jira/).
- Preview/browser: `<webview>` panes, discovery, capture, and `browser:read` through `outward`. — [src/main/preview-discover.ts](src/main/preview-discover.ts), [src/main/preview-capture.ts](src/main/preview-capture.ts), [src/main/browser-read.ts](src/main/browser-read.ts).
- Office-like objects: deck (PDF/PPTX export), sheet (xlsx), checklist, and `.docx` import. — [src/shared/deck.ts](src/shared/deck.ts), [src/shared/sheet-xlsx.ts](src/shared/sheet-xlsx.ts), [src/main/docx-import.ts](src/main/docx-import.ts).
- Packs (M253/M255): one discipline's workflows, prompts and presets plus the credentials and tools they need, in a file "a person was given and reads before anything is added". There is a sample dev-relations pack. — [src/shared/pack.ts](src/shared/pack.ts), [src/shared/devrel-pack.ts](src/shared/devrel-pack.ts), [src/main/pack-handlers.ts](src/main/pack-handlers.ts), [docs/packs/](docs/packs/).
- Portable canvas (M189) and portable recipes (M321): [src/shared/portable.ts](src/shared/portable.ts), [src/shared/recipes.ts](src/shared/recipes.ts), [src/shared/recipe-portability.ts](src/shared/recipe-portability.ts), [src/main/recipe-store.ts](src/main/recipe-store.ts).

**Multiplayer and accounts (M330–M349)**
- Accounts (M330, M336): GitHub sign-in through Supabase PKCE on a loopback callback. The session lives in the encrypted credential store and never crosses the bridge. Includes orgs, hashed one-time invites and an account picker. — [src/main/account-auth.ts](src/main/account-auth.ts), [src/main/account-session.ts](src/main/account-session.ts), [src/shared/account.ts](src/shared/account.ts), [src/renderer/account/](src/renderer/account/), [docs/accounts.md](docs/accounts.md).
- Presence (M331): "one Yjs doc per workspace on a Hocuspocus server". Awareness carries cursor, viewport, selection and agent status at ≤15 Hz, and remote awareness is parsed as untrusted. — [src/shared/presence.ts](src/shared/presence.ts), [src/main/presence/presence-hub.ts](src/main/presence/presence-hub.ts), [src/renderer/presence/](src/renderer/presence/).
- Team view (M332): tiles per member, a read-only scrubbed snapshot of a member's canvas, and F to follow. — [src/renderer/team/TeamView.tsx](src/renderer/team/TeamView.tsx), [src/main/presence/team-reporter.ts](src/main/presence/team-reporter.ts), [src/shared/team.ts](src/shared/team.ts).
- Shared canvas CRDT (M333): per-field last-writer-wins maps with tombstones. Teammates' panels are inert placeholders. Roles (owner/editor/viewer) are enforced in three places (renderer, main and `server/collab`) from ONE table. — [src/shared/canvas-ops.ts](src/shared/canvas-ops.ts), [src/shared/canvas-doc.ts](src/shared/canvas-doc.ts), [src/main/presence/canvas-sync.ts](src/main/presence/canvas-sync.ts), [src/renderer/shared-canvas/](src/renderer/shared-canvas/).
- Shared text (M334, M339): a Y.Text per shared file panel via y-monaco on a main-gated replica; the disk stays the owner's. — [src/renderer/shared-text/](src/renderer/shared-text/).
- Pty relay (M335, M338, M343–M344): "a terminal on the team's VM that several people attach to and one controls at a time", with roles owner/controller/viewer, a program allowlist, a 1 MB replay ring and audited hand-offs. It is "not yet deployed". — [src/shared/relay-protocol.ts](src/shared/relay-protocol.ts), [server/relay/](server/relay/), [src/main/relay/relay-client.ts](src/main/relay/relay-client.ts), [src/renderer/relay/](src/renderer/relay/), [docs/relay.md](docs/relay.md).
- Collab server persistence and ops (M346–M347): Postgres `collab` schema, snapshots, `/healthz`, backup/restore and a webhook alert. Built and checked but not deployed ("no VM on this Mac"). — [server/collab/](server/collab/), [docs/collab.md](docs/collab.md).
- Local-first (M348): offline edits kept by main, surviving a crash, with a "N changes waiting to sync" chip. — [docs/build-log/m348-local-first-sync.md](docs/build-log/m348-local-first-sync.md), [src/renderer/presence/SyncChip.tsx](src/renderer/presence/SyncChip.tsx).
- Agents as roster citizens (M349): a teammate's agents ride their presence payload as a scrubbed title and state ("never a command or transcript"). — [docs/build-log/m349-agents-roster-citizens.md](docs/build-log/m349-agents-roster-citizens.md).

### Inferences
- Main is the enforcement point for every stop, cap, gate and credential, and the renderer only projects. Any new autonomy feature (ambient agents, agent-to-agent calls, payments) would plug into the same main-side ceilings and the `destructive` column of the verb table rather than add its own limits. The pool-runner comment says why: "Every subsystem here that invented its own limit eventually disagreed with the shipped one."
- `tc plan` plus the verb table already works as a local, agent-callable API over the canvas (a proto-MCP). It is reachable only from a Unix socket on the same machine.

### Gaps
- I did not read `docs/architecture-map.md` (1,169 lines) or `docs/load-bearing.md` in full. Per CLAUDE.md they are meant to be searched, not read, so per-module invariants beyond the file headers are not captured here.
- I could not confirm the exact current count of panel kinds. Layout-schema kinds seen include browser, chat, file, github, image, jira, memory, note, relay, review, skill, terminal, toolbox, watcher, work, workflow (plus non-panel kinds).

---

## Q3. Ideas backlog: open vs closed/declined

### Takeaway
`docs/ideas-backlog.md` was captured 2026-08-24 and much of it is now stale: entries #4 (multiplayer), #8 (chat panel), #9 (integrations) and #28 (accounts) have largely shipped without being rewritten down. The clearly open items relevant to "beyond" work are:
- #40, a read-only phone view
- #14 tiers 2–4, other apps as panels
- #20, two windows on one canvas
- #64, terminal memory rationing
- #65, tmux panes inside a panel
- #66, images in the terminal
- #67, a layout time machine
- #72, one versioned automation surface
- #73, a flag registry

Two items are explicitly declined: #80 (cursor-agent) and #81 (the canvas as an ACP host).

### Cited Findings
- Backlog rule: "Nothing here is a commitment". Entries are deleted as they ship and numbers are never reused. The north star (#9) is "a canvas where the unit is 'a thing an agent can work in', not 'a terminal'". — [docs/ideas-backlog.md](docs/ideas-backlog.md) header.
- Standing rule #31: "any feature that moves terminal bytes out of the panel — to disk, to an index, to an export, to a server — is a disclosure surface, because agents print secrets." Standing rule #11: anything toggleable goes in `shared/settings-schema.ts`. — [docs/ideas-backlog.md](docs/ideas-backlog.md).
- #4 Multiplayer is still listed as open, noting presence as "a modest CRDT-or-just-broadcast problem" and the ahead/behind git badge as the open half. This is stale: M330–M349 built presence, a CRDT canvas, shared text and a relay. — [docs/ideas-backlog.md](docs/ideas-backlog.md) #4; [README.md](README.md) M330–M349.
- #9 lists four integration tiers (local open-format files, APIs with auth, embedded web views, closed desktop apps via AppleScript/Accessibility). It warns that every integration is a new trust boundary and that one should not "build a general plugin API before two concrete integrations exist". — [docs/ideas-backlog.md](docs/ideas-backlog.md) #9.
- #40 "The canvas from somewhere else — a read-only view on a phone" is OPEN. Its constraints:
  - "report from `Panel` facts, not from a buffer";
  - "read-only is a design position, not a v1 shortcut";
  - "Approving a permission prompt remotely is the one write worth considering, and it should be considered separately and later";
  - "The value is a list, sorted by 'wants me', with a notification. The canvas is a desktop idea and does not need to travel."
  - It depends on #28 accounts, which now exist in GitHub/Supabase form.
  — [docs/ideas-backlog.md](docs/ideas-backlog.md) #40.
- #28 Accounts (Google or email-code sign-in plus data sync) is still listed. What shipped instead is GitHub via Supabase PKCE (M330). Cross-machine sync of layouts and settings is not described as shipped. — [docs/ideas-backlog.md](docs/ideas-backlog.md) #28; [README.md](README.md) M330.
- #14 "Panels that *are* other apps": tier 1 (read-only live file panel, M16) and editing (M22) landed; "Tiers 2–4 remain open and unstarted". — [docs/ideas-backlog.md](docs/ideas-backlog.md) #14.
- #20 "Two windows, one canvas": the session registry is a per-renderer singleton, so a second window is a second set of PTYs. It is described as three separable features of rising cost. — [docs/ideas-backlog.md](docs/ideas-backlog.md) #20.
- Other open headings: #12 Jira Server/DC, OAuth and a second provider; #13 the drop-image hand-off into the PTY; #15 annotations; #16 search; #19 cost history, a second adapter and the un-pinned panel; #23 focus mode; #24 edges; #26 toolbox write half; #27 prompt placeholders; #31 secrets; #34 preset environment; #48 lock/pin; #53 cards with the last real screen; #55 ad-hoc task panels; #60 zoom-independent chrome; #64–#67, #69, #70, #72–#74, #76, #77; #82–#90 (audit leftovers). Several of these were partly shipped in v7 (M140–M147) and not all were rewritten. — [docs/ideas-backlog.md](docs/ideas-backlog.md) heading index.
- Closed as DONE, in [docs/ideas-backlog-closed.md](docs/ideas-backlog-closed.md):
  - #10 light/dark (M45)
  - #17 OS attention (M43)
  - #22 semantic zoom (M57)
  - #25 placement (M50)
  - #32 keyboard-first (M44)
  - #36 typography (M49)
  - #37 sound (M43)
  - #38 first run (M48)
  - #39 export (M58, narrowed)
  - #42 and #45 camera bookmarks and undo (M56)
  - #46 run ledger (M52)
  - #47 env report (M48)
  - #51 discard (M53)
  - #54 Cmd-click (M51)
  - #57 `tc` CLI (M54)
  - #59 OSC 133 (M52)
  - #61 orphan recovery (M55)
  - #62 camera animation (M56)
  - #63 spatial ordering (M44)
- **Declined #80**, `cursor-agent` as a fifth engine (M117): it was not logged in, so there is no recorded stream, and "a row written from the help text alone would be a guess dressed as a fact". The recipe for adding it once recorded is "half a day". — [docs/ideas-backlog-closed.md](docs/ideas-backlog-closed.md) #80.
- **Declined #81**, the canvas as an ACP HOST for fs and terminal (M119): copilot's agent "NEVER asked" for `fs/read_text_file` or `terminal/create`, so `initialize` declares `fs: {readTextFile:false, writeTextFile:false}, terminal: false` (pinned by `verify:agent-session acp.4`). When an agent that asks arrives: answer `fs` from main under the Places gate; `terminal` "needs its own design" because of the two-lifetimes rule. — [docs/ideas-backlog-closed.md](docs/ideas-backlog-closed.md) #81.
- The v7 M137 decline list (32 deferred minors from M126–M133) is mostly small correctness items. — [docs/ideas-backlog.md](docs/ideas-backlog.md) "Deferred from M126–M133".
- Agent Orchestrator (AO) integration is PROPOSED, not implemented. It would be an optional connection to AO's local daemon, bringing external AO workers onto the canvas as "explicitly external work references". Send, spawn and merge through AO are gated separately, and the plan says "No second controller silently owns the same worker". — [docs/superpowers/plans/2026-09-14-agent-orchestrator-integration.md](docs/superpowers/plans/2026-09-14-agent-orchestrator-integration.md); [docs/product-review-and-roadmap-2026-09-14.md](docs/product-review-and-roadmap-2026-09-14.md) R11.

### Inferences
- The backlog numbering is a reliable id space, but its "open" status is unreliable after v7. Any proposal that cites a backlog entry should check the README milestone table first.
- #81 is the codebase's closest recorded position on the agent-hosting side of agent protocols: the app is an ACP *client*, not a host, and the choice was "declined by measurement", not on principle.

### Gaps
- There is no backlog entry for A2A, for MCP *server exposure* (the canvas as an MCP server), for agent payments, for voice, or for generative UI. Searches of `src/` and `docs/` for "A2A", "agent-to-agent", "stripe", "payment" and "x402" returned nothing relevant; "payment" matched only styles.css.

---

## Q4. The product rules and density layers: constraints any new feature must respect

### Takeaway
A new feature must be an authored object that obeys shared selection, undo and tiering. Every verb must reach all four doors (canvas gesture, palette row, agent line, workflow node). Anything imported must be inert until reviewed. All outbound text must pass `outward`/`redactSecrets`. Facts must go in the right density layer. Credentials never reach agent processes. Main enforces, and the renderer projects.

### Cited Findings
- **Authored objects**: "A note, picture, workflow or region takes the same selection, drag, marks, undo, tiering and export rules as everything else, and joins `isTerminalPanel`'s exclusion list rather than getting a partition of its own." — [CLAUDE.md](CLAUDE.md); [docs/product-rules.md](docs/product-rules.md).
- **Four doors**: "Every verb reaches a canvas gesture, a palette row, an agent line AND a workflow node (`V9_DOORS`, `verify:verbs closure.v9.1`). A door that is only declared is not a door." M352's `cap-agent` is a worked example, and it adds that agent and workflow doors may only tighten. — [CLAUDE.md](CLAUDE.md); [docs/build-log/m352-cap-agent-verb.md](docs/build-log/m352-cap-agent-verb.md).
- **Inert imports**: "An imported canvas starts no process; imported action nodes are refused by name until read (`reviewed: false`)." A fetch node only does GETs. — [CLAUDE.md](CLAUDE.md); [docs/product-rules.md](docs/product-rules.md). Remote presence and awareness are "untrusted input, exactly like an imported canvas". — [src/shared/presence.ts](src/shared/presence.ts).
- **Outward gate**: "`outward` and `redactSecrets` have a named, checked caller list; an export scrubs field by field and reports its count." The canvas PNG is the one ungated binary door, and that "does not generalise to a second binary export". — [CLAUDE.md](CLAUDE.md); [src/shared/outward.ts](src/shared/outward.ts); [src/shared/redact.ts](src/shared/redact.ts).
- **Credential boundary**: "a stored credential never reaches an agent's process — not in the environment, not in argv, not in a file"; the broker is the credential store's last reader (`verify:meta readers.1`). — [docs/ideas-backlog.md](docs/ideas-backlog.md) #9; [src/main/broker.ts](src/main/broker.ts).
- **Density layers**: rest (name, kind, one meaningful state, never a zero-value statement), contextual (next action and blocker, opacity 0→1), inspector (configuration, provenance, outcomes), deep detail (logs, metrics, history). The metrics rule: no CPU, RAM, token or dollar figure in headers, cards, the rail or the status bar. — [docs/product-rules.md](docs/product-rules.md); [CLAUDE.md](CLAUDE.md).
- **Frame rule (M236)**: chromeless only for terminal and note text/frame. Chromeless chrome must be absolutely positioned, because a collapsing box causes a SIGWINCH. — [CLAUDE.md](CLAUDE.md).
- **Separation of concepts**: "Project, workspace and task do not merge"; "a teammate is an identity, a chat is its conversation, a session is its execution"; "A `note` is a Markdown FILE and nothing else is". — [docs/product-rules.md](docs/product-rules.md).
- **Command pill**: "The palette finds anything; the command pill acts on this canvas now". It has no search, and a disabled control shows its reason and is never hidden. — [docs/product-rules.md](docs/product-rules.md).
- **No dead ends**: every control that cannot work is present, disabled, with a reason naming the fix. — [README.md](README.md); [docs/dead-end-audit.md](docs/dead-end-audit.md).
- **Library confinement**: each third-party library is reached through a named module set (monaco, zod, sonner, recharts, Radix, xyflow/zustand, three/R3F, motion, postprocessing). There is no styling dependency such as Tailwind. — [CLAUDE.md](CLAUDE.md); [src/renderer/CLAUDE.md](src/renderer/CLAUDE.md); [docs/product-rules.md](docs/product-rules.md).
- **The customer-free-abstraction rule** recurs in the docs: do not build a host, plugin API or seam before a real consumer exists. It is invoked for #81 and #9, and D19 requires "one small example extension" before broadening. — [docs/ideas-backlog-closed.md](docs/ideas-backlog-closed.md) #81; [docs/product-development-guide-2026-09-08.md](docs/product-development-guide-2026-09-08.md) D19.
- **Local-only control surface**: the control socket has "No network, ever: there is no `port` here". — [src/main/control-server.ts](src/main/control-server.ts).
- **Routines' self-limit**: "irreversible actions stay behind confirmation — do not delete, force-push, publish, pay, or send anything outward". A routine may not carry a destructive verb. — [src/shared/routines.ts](src/shared/routines.ts); [src/shared/verb-table.ts](src/shared/verb-table.ts).
- **Process rules**: scoped verify-check ids; goldens change only with a critic sentence; comments explain *why*; conventional commits scoped by milestone. — [CLAUDE.md](CLAUDE.md).

### Inferences
- **Ambient or proactive agents** would be routines and watchers under the routine prompt's "no outward, no pay" rule, and would surface through the decision queue rather than notifications of their own.
- **Payment features** collide directly with the routine rule and the spend card. Any payment would need the M102 spend-card and broker path, and a person's confirmation.
- **An MCP server or agent-to-agent endpoint** would have to expose the verb table (not raw IPC). It would inherit the four-doors closure, `destructive` flags and the "agents may only tighten" precedent. Because the control socket is local-only by construction, network exposure is a deliberate module change.
- **Generative UI** would have to be an authored object (undo, tiering, export) and follow density layers. Model output is "not authoritative state" (D18).

### Gaps
- `docs/load-bearing.md` was not searched per module. Per-module constraints for any specific proposal should be pulled with `npm run lb -- <module>`, which I was told not to run.

---

## Q5. Latest ledgers: what is in flight and what is deferred

### Takeaway
The live run is the "Opus 5.5 run from M339", with arcs 0–4: owed lists, then production-grade collab, then agent-native, then super app, then team product. It is in Arc 2.x, on per-agent caps. M352 is gating uncommitted on main. The queued items are M353 (orchestration scenes race "Reading changes…"), M354 (spend survives relaunch; WIP in a worktree), M355 (a held agent becomes a decision in the queue) and M356 (chat header overflow). The blockers need a person: a real GitHub sign-in, a VM to deploy the relay and collab servers, and a second machine.

### Cited Findings
- Newest ledgers: m352, m351, m350, m349, m348, m347, m346, m345, m344, m343, m342, m341, m340, m339, m336–m338. — [docs/build-log/](docs/build-log/) (by mtime).
- M352's owed list, verbatim:
  - "M355 (proposed): the hold as a decision. A held agent should reach the decision queue with 'Allow $N more' (the verb, as a person) and 'Stop'."
  - "The composer does not show a hold until a send is refused."
  - "M356 (proposed): a resolved auto chip crowds the chat header past its frame… The close button becomes unreachable."
  - "`selectRail` fails silently".
  - "The panels harness has no chat with a live meter".
  - "Next: M353 … then M354 (a node's spend survives an app relaunch)."
  — [docs/build-log/m352-cap-agent-verb.md](docs/build-log/m352-cap-agent-verb.md) lines 162–188.
- M349 owed: M353, the orchestration scenes race the Changes pane. "Local agents on one's own roster. The strip shows OTHER people." A fleet view on the Team view is "the next piece of this arc". M349's Next line was M350 ("Arc 2.3 — per-node spend and context telemetry with hard caps enforced outside the agent loop"). — [docs/build-log/m349-agents-roster-citizens.md](docs/build-log/m349-agents-roster-citizens.md).
- M348 owed: an Electron check of the sync chip in a real renderer. Next was M349 ("Arc 2.1 — agents as roster citizens"). — [docs/build-log/m348-local-first-sync.md](docs/build-log/m348-local-first-sync.md).
- M347: collab ops are "built and checked (not deployed — no VM on this Mac)". M335: the relay is "not yet deployed". — [README.md](README.md) M335 and M347 rows; [docs/relay.md](docs/relay.md); [docs/collab.md](docs/collab.md).
- M342: a live Supabase probe passes 37/37 for anon; "the authenticated checks wait on a person's sign-in". — [README.md](README.md) M342 row.
- The run's own memory note gives the arc names ("arcs 0–4: owed lists → collab production-grade → agent-native → super app → team product") and the blockers ("a real GitHub sign-in…, a VM for relay/collab deploy…, a second machine for the live two-machine run"). — `~/.claude/projects/-Users-alexnieves-Documents-terminal-canvas/memory/terminal-canvas-opus55-run.md` (outside the repo; the arc plan itself was a pasted prompt, and I found no copy in `docs/`).
- The v10 guide's status (per its ledger): D11 (outcomes and Resume), D13 (search coverage), D14 (save arrangement or workflow), D15 (nodes and integration depth), D16 (portability), D17 (supervise across workspaces), D18 (suggested semantic relations), D19 (bounded extension ecosystem) and D20 (multiplayer) are marked "not started". Much of this has since been built under other numbers: M309 return briefing, M316 recovery, M321 portable recipes and M330–M349 multiplayer. The ledger's status column is therefore stale. — [docs/build-log/m193-m224-ledger.md](docs/build-log/m193-m224-ledger.md) lines 44–65; [docs/product-development-guide-2026-09-08.md](docs/product-development-guide-2026-09-08.md).
- D19 requirements, verbatim in substance: a versioned manifest against proven panel/node/action seams; "Ship one small example extension… before broadening"; "Preserve main-process execution and broker mediation… do not grant renderer process or credential access". — [docs/product-development-guide-2026-09-08.md](docs/product-development-guide-2026-09-08.md) D19.
- D18 requirements: explainable deterministic candidates first; "Never automatically move panels, send messages, change permissions, or start execution"; "Model-generated text is not authoritative state." — [docs/product-development-guide-2026-09-08.md](docs/product-development-guide-2026-09-08.md) D18.
- D20 said: "Add remote supervision/control only as a separately specified capability with explicit authorization and auditability", and "A collaborator's pointer or document edit must not silently run commands on another machine." — [docs/product-development-guide-2026-09-08.md](docs/product-development-guide-2026-09-08.md) D20.
- The 2026-09-20 release-readiness audit lists these P0 items:
  - "Signed and notarized distribution is absent";
  - no clean verification result;
  - visual regressions.

  P1 items: real-user acceptance testing; "Codex-only users cannot start the primary folder-based workflow"; security- and integration-critical paths "only faked or manually checked once". It says multi-user sharing, service-node breadth and an extension registry are "not required for this release". — [docs/canvas-opportunity-audit-2026-09-20.md](docs/canvas-opportunity-audit-2026-09-20.md).
- The 2026-09-14 review's plan R0–R11 has release cuts: first release R0–R5, second R6–R10, optional R11 (AO). It says "Cloud workers, multiplayer editing, automatic merge, cross-platform support, broad connector coverage and additional artifact kinds remain separate investments." — [docs/product-review-and-roadmap-2026-09-14.md](docs/product-review-and-roadmap-2026-09-14.md).
- Baseline Electron reds, which are not regressions: panels:agents template.1 and detail.1; panels:product starter.1, workflow.edit.1/.2 and others; visual starter. — run memory note (outside the repo); [docs/build-log/](docs/build-log/).

### Inferences
- Per the run's arc plan, the next arcs after caps are "super app" and "team product". Future-direction research therefore lands exactly where Arc 3 and Arc 4 would begin. The recorded owed items (M355 hold-as-decision, a fleet view on the Team view, deploy) are the natural bridge.
- Deployment (relay and collab VM), signing and notarization, and real-user testing are the practical constraints on any "remote" or "team" direction. The multiplayer code exists but has never run between two real machines.

### Gaps
- The Arc 3 ("super app") and Arc 4 ("team product") contents are not written in any repo doc I found. I searched for "Arc 3" and "agent-native" and found only older audit uses.

---

## Q6. Obvious gaps (proactive agents, A2A/MCP exposure, payments, verification, memory, generative UI, mobile/remote)

### Takeaway
The codebase has strong partial seams for:
- proactive agents (routines and watchers, which only run while the app is open)
- verification (checks, witnessed integration, finished ≠ verified)
- memory (a per-repo JSONL plus the vault)
- remote collaboration (relay and presence, undeployed)

It has no seam at all for:
- exposing the canvas as an MCP or A2A server to external agents
- agent payments
- mobile or phone access
- cloud or background execution while the app is closed
- semantic or vector memory
- model-generated UI

### Cited Findings
- **Proactive/ambient**: routines "run while the app is open — not while it is closed". Watchers run commands on path, git-ref, timer or panel triggers. Auto modes are bounded by turn limits. Nothing runs when the app is closed apart from tmux-surviving processes, which are opt-in. — [src/shared/routines.ts](src/shared/routines.ts); [src/shared/watch-trigger.ts](src/shared/watch-trigger.ts); [src/shared/auto.ts](src/shared/auto.ts); [README.md](README.md) "Agents survive the window".
- **MCP/A2A**: MCP appears only as a toolbox *inventory* row read from Claude config (`McpToolEntry`, transports stdio/http/sse). There is no MCP server exposing canvas verbs and no A2A implementation. ACP is a client only, and hosting was declined (#81). The external control surface is the local `tc` socket. — [src/shared/toolbox.ts](src/shared/toolbox.ts); [docs/ideas-backlog-closed.md](docs/ideas-backlog-closed.md) #81; [src/main/control-server.ts](src/main/control-server.ts).
- **Agent-to-agent inside the app**: hand-off edges, supervisors, pool/orchestrator/collect nodes, swarm arrangements, a teammate "may message" permission, a `checklist-hand` verb and agent links. — [src/shared/swarm.ts](src/shared/swarm.ts); [src/shared/teammates.ts](src/shared/teammates.ts); [src/shared/agent-links.ts](src/shared/agent-links.ts); [src/shared/verb-table.ts](src/shared/verb-table.ts).
- **Payments**: none. Money appears only as cost accounting, caps and the broker "spend card", which names service, account, action, target and cost. Routines are told not to "pay". — [src/main/broker.ts](src/main/broker.ts) (M102 comment); [src/shared/routines.ts](src/shared/routines.ts); [docs/build-log/m350-node-caps.md](docs/build-log/m350-node-caps.md).
- **Verification**: check-output records (M306), `verificationOf` / finished ≠ verified (M307), combined checks and Integrate receipts (M317), and review readiness (M201–M202). — [README.md](README.md) M306–M317 rows; [src/main/integrator.ts](src/main/integrator.ts); [src/shared/check-evidence.ts](src/shared/check-evidence.ts).
- **Memory**: per-repo append-only memory with four kinds, a vault with links and tags, a teammate's "own memory", retained outcomes and the return briefing. There are no embeddings. The only "vector" hits in `src/` are geometry. The 2026-09-14 review says retention is "a starting point, not full return-to-work memory". — [src/main/memory-store.ts](src/main/memory-store.ts); [docs/product-review-and-roadmap-2026-09-14.md](docs/product-review-and-roadmap-2026-09-14.md).
- **Generative UI**: nothing is model-rendered. The closest things are "describe a tool", which generates tool files plus a `reviewed: false` workflow and an app preview without its page, and agent-proposed deck slides and sheet cells, which a person keeps or discards. — [src/main/tool-generate.ts](src/main/tool-generate.ts); [docs/product-rules.md](docs/product-rules.md) (deck proposals); [src/shared/draft-review.ts](src/shared/draft-review.ts).
- **Mobile/remote**: backlog #40 (a read-only phone list sorted by "wants me", with remote approval "considered separately and later") is open and unbuilt. "phone" in `src/` refers to preview device widths only. The relay offers remote *terminal* sharing between desktop clients. The Team view offers a read-only look at a teammate's canvas. — [docs/ideas-backlog.md](docs/ideas-backlog.md) #40; [src/shared/preview.ts](src/shared/preview.ts); [docs/relay.md](docs/relay.md).
- **Cloud execution**: none. The 2026-09-14 review lists "Cloud workers" as a separate investment. The AO integration plan would bring external workers in as references only. — [docs/product-review-and-roadmap-2026-09-14.md](docs/product-review-and-roadmap-2026-09-14.md); [docs/superpowers/plans/2026-09-14-agent-orchestrator-integration.md](docs/superpowers/plans/2026-09-14-agent-orchestrator-integration.md).
- **Isolation**: "A worktree per panel is… not a sandbox: every agent runs as your user". — [README.md](README.md) "What it does not do".
- **Engine breadth**: cursor-agent was declined as unmeasured. Gemini and other CLIs are absent from the registry. Codex-only users cannot run Start work in folders (P1). — [docs/ideas-backlog-closed.md](docs/ideas-backlog-closed.md) #80; [docs/canvas-opportunity-audit-2026-09-20.md](docs/canvas-opportunity-audit-2026-09-20.md).
- **Voice**: no voice input or output seam found. Grep hits were icons, styles and settings text only, not a feature.

### Inferences
Each gap has a natural host seam. These are my assessment, not stated in the repo:
- **Remote approval from a phone**: decision queue (M308/M318/M329), presence and account (M330–M331), relay auth (JWT via Supabase), and #40's constraints.
- **An MCP server exposing the canvas**: verb table, `tc plan` executor, control-server, four-doors closure, and M352's "agents may only lower" rule.
- **Ambient agents**: routines, watchers and auto modes, under the job journal (M316) and caps (M350–M352), surfaced in the decision queue.
- **Agent payments**: broker, spend card, per-agent caps, and the "a person raises, an agent only lowers" rule.
- **Memory upgrades**: memory-store and vault, under `redactSecrets` and D18's "model output is not authoritative".
- **Background execution while closed**: the relay VM (server/relay) and collab server are the only remote runtime infrastructure. Neither is deployed.

### Gaps
- Whether the author wants the product to stay coding-first (the 2026-09-14 review) or broaden into a general "super app" (the backlog #9 north star and the run's "Arc 3: super app"). The docs pull in both directions, and the Arc 3 brief is not in the repo.
- No competitor or market data is in scope here. The 2026-09-14 review cites Cursor worktrees, Conductor and Claude Code agent teams as the only comparables.
