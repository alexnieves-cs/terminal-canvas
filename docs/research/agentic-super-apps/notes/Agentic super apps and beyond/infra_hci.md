# Infrastructure and HCI Building Blocks for Next-Generation Agent Workspaces (as of September 2026)

Maturity legend used below: **Shipped/stable** (final spec or 1.0 release, multi-vendor production use), **Shipped/experimental** (released, but names or shapes still change), **Draft** (spec proposal, no final standard), **Research** (papers or prototypes only).

## Protocols: MCP, A2A, ACP, AG-UI, agent identity and auth

### Takeaway
The protocol stack settled in 2026 into layers. MCP handles agent-to-tool connections. Its 2026-07-28 spec went stateless, moved Tasks into an extension, and added a Multi Round-Trip Request pattern for elicitation. MCP Apps, which renders tool UIs in sandboxed iframes, shipped in January 2026. ACP handles agent-to-editor, A2A handles agent-to-agent, and AG-UI handles agent-to-app-frontend, and all three have 1.0-level adoption. Agent identity and delegated auth is the one layer with no finished standard: there are only expired or individual IETF drafts.

### Cited Findings
**MCP (Shipped/stable spec 2026-07-28; Tasks and Apps are official extensions)**
- The final 2026-07-28 MCP specification was published July 28, 2026, following a release candidate. It has a stateless core, an Extensions framework, Tasks, MCP Apps, authorization hardening and a formal deprecation policy — [MCP blog: RC](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/); [Spec](https://modelcontextprotocol.io/specification/2026-07-28)
- The protocol changes from a "bidirectional stateful protocol into a request/response stateless protocol". Every request carries its protocol version, client identity and capabilities in `_meta`, so servers can sit behind ordinary load balancers — [MCP blog: 2026-07-28 spec](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- **Elicitation / Multi Round-Trip Requests (SEP-2322).** These replace server-initiated requests that needed a held-open stream. The server returns `resultType: 'input_required'` with the questions it needs answered, and the client retries the original call with the answers attached — [MCP blog: 2026-07-28 spec](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- **Tasks (SEP-2663).** Tasks were an experimental core feature in the 2025-11-25 spec. They were redesigned after production feedback and moved into the `io.modelcontextprotocol/tasks` extension, with poll-based `tasks/get`, a new `tasks/update`, and a `subscriptions/listen` stream for change notifications — [MCP blog: RC](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/); [MCP blog: 2026-07-28 spec](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- Other changes:
  - `Mcp-Method` and `Mcp-Name` HTTP headers let gateways route and authorize without parsing request bodies (SEP-2243).
  - `ttlMs` and `cacheScope` make list and read results cacheable (SEP-2549).
  - Authorization hardening: RFC 9207 issuer validation (SEP-2468), and client credentials bound to the authorization server that issued them (SEP-2352).
  - Dynamic Client Registration is deprecated in favour of Client ID Metadata Documents (CIMD).
  - Enterprise Managed Authorization (EMA) is now an extension.
  - Deprecated features get a minimum 12-month window. This covers Roots, Sampling, Logging and the legacy HTTP+SSE transport.
  - [MCP blog: 2026-07-28 spec](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- **MCP Apps (Shipped, January 26, 2026, the first official extension).**
  - How it works: UI resources use the `ui://` scheme, and tools link to them through metadata. The host renders the UI in a sandboxed iframe, and the iframe talks to the host over MCP JSON-RPC. Templates are declared in advance, messages are auditable, and tool calls started from the UI need host-managed approval — [MCP blog: MCP Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/); [ext-apps spec](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
  - Hosts at launch: Claude (web and desktop), Goose, VS Code Insiders and ChatGPT. Later hosts include VS Code GitHub Copilot, M365 Copilot, Postman and MCPJam — [The Register](https://www.theregister.com/2026/01/26/claude_mcp_apps_arrives/); [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)

**ACP — Agent Client Protocol, Zed (Shipped; de facto standard for editor↔agent)**
- ACP was created in June 2025 and was the headline feature of Zed 1.0 (April 29, 2026). It has been built into JetBrains IDEs since December 2025. JetBrains and Zed launched a public agent registry together on January 28, 2026 — [Morph](https://www.morphllm.com/agent-client-protocol); [Zed: ACP Registry](https://zed.dev/blog/acp-registry)
- The registry listed more than 40 agents on April 20, 2026 and more than 50 by late June 2026. Neovim, Emacs and VS Code have community plugins. (Counts come from secondary sources.) — [Morph](https://www.morphllm.com/agent-client-protocol); [Zed ACP](https://zed.dev/acp)

**A2A — Agent2Agent (Shipped v1.0, Linux Foundation)**
- A2A v1.0 was released on April 9, 2026 under Linux Foundation governance. More than 150 supporting organisations are listed. It is integrated in Azure AI Foundry and Copilot Studio, and in AWS Bedrock AgentCore Runtime — [Linux Foundation press](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year); [Google OSS blog](https://opensource.googleblog.com/2026/04/a-year-of-open-collaboration-celebrating-the-anniversary-of-a2a.html)

**AG-UI — CopilotKit (Shipped; vendor-led, broad integration)**
- AG-UI is an event-based protocol between an agent and an app frontend, with roughly 16 event types. They cover streaming, shared state, thinking steps, frontend tool calls, human-in-the-loop interrupts and sub-agent composition — [CopilotKit docs](https://docs.copilotkit.ai/agentic-protocols/ag-ui); [CopilotKit intro](https://www.copilotkit.ai/blog/introducing-ag-ui-the-protocol-where-agents-meet-users)
- Amazon Bedrock AgentCore Runtime added native AG-UI support in March 2026. First-party integrations include Microsoft Agent Framework, Google ADK and AWS Strands, and LangGraph and CrewAI integrate through partnerships. CopilotKit raised a $27M Series A tied to AG-UI in May 2026 — [TechCrunch](https://techcrunch.com/2026/05/05/copilotkit-raises-27m-to-help-devs-deploy-app-native-ai-agents/); [Ry Walker research](https://rywalker.com/research/ag-ui)

**Agent identity and delegated auth (Draft — no finished standard)**
- `draft-oauth-ai-agents-on-behalf-of-user` adds two parameters:
  - `requested_actor`, so the consent screen names the specific agent;
  - `actor_token`, so the agent authenticates itself during the code exchange.
  - The resulting token records the whole chain: user → client → agent. Revision 02 expired on February 27, 2026 — [IETF datatracker](https://datatracker.ietf.org/doc/html/draft-oauth-ai-agents-on-behalf-of-user-02)
- Other individual drafts: `draft-klrc-aiagent-auth` (AI Agent Authentication and Authorization, now at -03) and `draft-mishra-oauth-agent-grants` (Delegated Agent Authorization Protocol, DAAP). Neither has a working group behind it — [klrc draft](https://datatracker.ietf.org/doc/draft-klrc-aiagent-auth/); [DAAP draft](https://datatracker.ietf.org/doc/draft-mishra-oauth-agent-grants/)
- Multi-hop delegation (agent → sub-agent → tool) is named as the unsolved problem — [WorkOS](https://workos.com/blog/oauth-multi-hop-delegation-ai-agents)

### Inferences
- In a desktop Electron workspace the four protocols do different jobs:
  - **ACP** is the natural adapter for running third-party coding agents (Claude Code, Codex, Gemini CLI and others) as panels. It is the "LSP for agents" layer and has a registry the app could install from.
  - **MCP 2026-07-28** is the tool layer. MRTR elicitation maps directly onto an in-app approval or question card. Tasks give a standard long-running handle the canvas can render as a live object.
  - **MCP Apps** means a tool's UI can render as a sandboxed canvas object with no custom integration. The app already uses `<webview>` because of its CSP, which fits the sandboxed-iframe model.
  - **AG-UI** matters mostly if the app wants to host agents written in LangGraph, ADK or similar frameworks that emit it.
  - **A2A** is lower priority for a desktop app unless it federates with remote enterprise agents.
- Because agent auth has no standard, a small team should keep credentials in the main process and hand out scoped, short-lived capabilities. It should record an explicit user → agent → tool chain in its audit log. That puts it in a position to adopt whichever draft wins without redesigning.

### Gaps
- I did not verify the exact current ACP spec version, or whether ACP added a formal "session fork/load" capability in 2026.
- I did not find whether the MCP Tasks extension is already implemented by the major hosts (Claude, ChatGPT, VS Code).
- AG-UI's governance (foundation or vendor) in 2026 is unconfirmed.

## Runtime: durable execution, sandboxes, checkpoint/replay/fork

### Takeaway
Durable execution became mainstream in late 2025 and 2026, driven by agents. Temporal, Inngest, Restate and DBOS each do it differently. For a local desktop app, per-task VM isolation is now available natively on macOS through Apple `container` 1.0 (June 2026, one micro-VM per container), and Docker also offers microVM isolation. Checkpoint, rewind and fork of agent sessions is standard practice: LangGraph checkpoints and Claude Code `/rewind` both ship it.

### Cited Findings
- AWS Durable Functions, Cloudflare Workflows GA and Vercel's Workflow DevKit all shipped around late 2025. AI agents are cited as the main driver — [Inngest blog](https://www.inngest.com/blog/durable-execution-key-to-harnessing-ai-agents); [Comuvia comparison](https://comuvia.ai/articles/durable-execution-for-ai-agents-temporal-vs-inngest-vs-restate-vs-prefect)
- How the engines differ (secondary comparison; the Temporal usage stats are vendor-reported):
  - **Temporal** records an event history and re-runs workflow code deterministically, skipping completed steps. It runs in production at OpenAI and Block.
  - **Inngest** memoizes steps rather than doing full deterministic replay.
  - **Restate** aims to make whole systems of interacting services durable.
  - [Comuvia](https://comuvia.ai/articles/durable-execution-for-ai-agents-temporal-vs-inngest-vs-restate-vs-prefect); [cloudrps](https://cloudrps.com/blog/durable-execution-restate-dbos-hatchet-beyond-temporal/)
- The core problem durable execution solves: a restarted agent that simply retries can duplicate side effects and waste tokens. Checkpointing plus replay of deterministic control flow avoids both — [Zylos Research](https://zylos.ai/research/2026-04-27-durable-execution-agent-runtimes/)
- **Apple `container` 1.0.0 (Shipped, June 9, 2026).** Its CLI and XPC APIs are now frozen. It starts a dedicated micro-VM for each container, with its own Linux kernel and network stack, on Apple silicon, and it works with OCI images — [Cloud Native Now](https://cloudnativenow.com/features/apple-ships-stable-1-0-of-its-native-container-tool-for-macos/); [Wikipedia](https://en.wikipedia.org/wiki/Apple_container)
- Docker launched microVM isolation on macOS and Windows on January 30, 2026 (per-session kernel and a private daemon) — [Medium, Hannecke](https://medium.com/@michael.hannecke/apple-container-moved-the-boundary-it-didnt-move-the-risk-98190346ce49) (secondary source)
- Cloud sandboxes:
  - **E2B** uses Firecracker microVMs; startup is under about 150 ms.
  - **Daytona** uses Docker containers with a shared kernel. It moved its production codebase to closed source in June 2026.
  - [Northflank](https://northflank.com/blog/daytona-vs-e2b-ai-code-execution-sandboxes); [amux](https://amux.io/guides/ai-agent-sandboxing/)
- **LangGraph checkpoints** snapshot the full state after every super-step, keyed by `thread_id`. To fork: rewind to a checkpoint, call `update_state`, and the next invoke continues on a new branch (same prefix, new tail) — [dev.to](https://dev.to/gabrielanhaia/time-travel-debugging-for-ai-agents-with-langgraphjs-checkpoints-42ie)
- **Claude Code checkpointing.** `/rewind`, or pressing Esc twice, opens a menu to restore earlier conversation and code state — [Claude Code docs](https://code.claude.com/docs/en/checkpointing)
- Third-party time-travel debuggers for agents exist, for example "Rewind" (research or early product) — [agentoptics.dev](https://agentoptics.dev/)

### Inferences
- A local-first Electron app does not need a hosted Temporal to get durability. An append-only job journal with idempotent step records (the "record step result, skip on replay" pattern) gives most of the value.
- "Fork this agent session from step N" is a strong canvas gesture. Draw the fork as a branch edge, and back it with the git worktree plus the agent's transcript up to step N.
- Apple `container` gives a first-party, per-task VM boundary on macOS with no Docker Desktop dependency. That makes "every agent task in its own microVM" feasible locally. It fits the app's existing rule that imported or remote work is inert until reviewed.

### Gaps
- I found no primary benchmark of Apple `container` cold-start times for agent-sized workloads.
- I did not verify Restate's or Inngest's 2026 agent-specific SDK features first-hand. The comparison articles are secondary.

## Oversight: approvals, budgets/caps, provenance/audit, observability, evals in the loop

### Takeaway
OpenTelemetry's GenAI semantic conventions are the de facto trace format for agents: `invoke_agent`, then `chat`, then `execute_tool` spans. They are still experimental, with no 1.0, and in June 2026 they moved to their own repository. HCI research warns that better trace UIs can raise users' *confidence* without raising their *accuracy*. Oversight design should be judged by verified error-catching, not by how reassured users feel.

### Cited Findings
- None of the GenAI semconv are stable. In v1.42.0 (June 12, 2026) they moved to a dedicated `semantic-conventions-genai` repository so they can iterate faster — [Dash0](https://www.dash0.com/knowledge/opentelemetry-genai-semantic-conventions-explained); [OTel semconv gen-ai](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- Agent span shape: a top-level `invoke_agent` span, with child `chat` spans for each LLM call and `execute_tool` spans for each tool call. MCP tool tracing is covered — [OTel blog 2026](https://opentelemetry.io/blog/2026/genai-observability/); [Greptime](https://greptime.com/blogs/2026-05-09-opentelemetry-genai-semantic-conventions)
- Datadog, Honeycomb and New Relic ingest these spans, and LangChain, CrewAI, AutoGen and AG2 emit them — [Dash0](https://www.dash0.com/knowledge/opentelemetry-genai-semantic-conventions-explained); MLflow maps to them as well — [MLflow docs](https://mlflow.org/docs/latest/genai/tracing/opentelemetry/genai-semconv/)
- **Grunde-McLaughlin, Mozannar, Murad, Chen, Amershi, Fourney (Microsoft Research), "Overseeing Agents Without Constant Oversight" (arXiv 2602.16844, Feb 2026).**
  - Standard trace interfaces were "cumbersome".
  - A new trace design sped up error detection, and participants reported higher confidence, but their final accuracy was not meaningfully better.
  - The paper names three challenges: assumptions built into the interface, subjective and shifting correctness, and the limits of communicating the agent's process.
  - [arXiv](https://arxiv.org/abs/2602.16844)
- **MCP's own oversight hooks.** Host-managed approval is required for tool calls started from an MCP App's UI. Elicitation via MRTR gives a standard "agent needs input" state — [MCP Apps blog](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/); [MCP 2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- **OrchVis (Zhou, arXiv 2510.24937, Oct 2025).** It parses intent into hierarchical goals, monitors through automated verification, and shows dependencies in an interactive plan. When agents conflict, the human explores alternatives the system proposes and selectively replans, instead of approving every step ("adaptive autonomy") — [arXiv](https://arxiv.org/abs/2510.24937)

### Inferences
- Emitting OTel GenAI spans (`invoke_agent` / `chat` / `execute_tool`) from the main process's agent runner is cheap to do. It makes the app's ledger exportable to any observability backend. Pin the semconv version, because names may still change.
- Approval design should favour **verification aids that change outcomes** (diffs, test results, automated checks, as in OrchVis) over richer narration. Grunde-McLaughlin et al. show narration raises confidence without raising accuracy.
- Budgets and caps, and evals in the loop: I found no standards. Current practice is enforcing per-agent caps outside the agent loop, plus automated verification gates (tests or checks) before a human review.

### Gaps
- There is no standard for agent budgets or caps. I found only vendor practices, and did not research them in depth.
- Provenance standards for agent-authored artifacts (C2PA-like for code or text) were not researched. I found no clear 2026 standard.
- I did not find a primary source on "evals in the loop" product patterns, such as continuous evals gating agent merges.

## Memory and context engineering

### Takeaway
Long-term memory products (Letta, Mem0, Zep/Graphiti) are shipped. They differ widely on temporal and multi-hop recall, and the benchmark numbers are mostly vendor-reported. The most actionable 2026 finding is the "compaction cliff" (CIKM 2026): generic summarization compaction silently drops safety rules. Rules and constraints must be stored and compacted separately from episodic logs.

### Cited Findings
- **Zerhoudi, Mitrović, Granitzer, "The Compaction Cliff in Long-Running AI Agent Memory" (arXiv 2608.22752, CIKM 2026).**
  - Claude Code's `/compact` on Sonnet 4.6 kept 53% of safety rules after one compaction round and 10% after five.
  - Their fix is type-aware triage with three operators: TypeCompact, TypeDecompose and TypeRetrieve. It preserved 2–4× more rules and reached 96% recall over five rounds.
  - [arXiv](https://arxiv.org/abs/2608.22752)
- The main memory systems:
  - **Letta** (MemGPT) has developer-defined memory blocks, automatic compaction, and experimental "sleep-time" agents that consolidate memory in the background.
  - **Zep** builds a temporal context graph with Graphiti.
  - **Mem0** extracts and consolidates facts; its April 2026 algorithm reports +29.6 points on temporal queries and +23.1 on multi-hop.
  - [Mem0 state of memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026) (vendor); [Atlan comparison](https://atlan.com/know/best-ai-agent-memory-frameworks-2026/)
- Zep plus Graphiti reportedly scores 71.2% on LongMemEval against Mem0's 49% — [dev.to comparison](https://dev.to/varun_pratapbhardwaj_b13/5-ai-agent-memory-systems-compared-mem0-zep-letta-supermemory-superlocalmemory-2026-benchmark-59p3). This is a secondary source, and it conflicts with Mem0's own favourable framing, so treat both as vendor-contested.
- "Agentic Context Management" (arXiv 2607.21503) treats agent memory and cost as a lifecycle and architecture problem — [arXiv PDF](https://arxiv.org/pdf/2607.21503) (not read in full)

### Inferences
- A workspace should store project rules and safety constraints (CLAUDE.md-style rules and caps) as a **separate typed channel** that is never summarised. Re-inject them verbatim after each compaction. The compaction-cliff numbers make this a concrete defect class rather than a theoretical one.
- Codebase knowledge graphs: this project already uses graphify, which fits the Graphiti and temporal-graph direction. The grounding it gives agents could be surfaced as a canvas lens.

### Gaps
- I did not find a primary 2026 source comparing codebase knowledge-graph tools (such as Sourcegraph, code-graph MCP servers or graphify-like tools) for agent grounding.
- I did not fetch Anthropic's or OpenAI's 2026 context-engineering engineering posts in this pass.

## HCI research on supervising many agents

### Takeaway
2025–2026 HCI work converges on four points:
- Ambient awareness plus fast resumption summaries beats chat-only feedback for parallel agents (Sidekick).
- Hierarchical plan and goal views beat step-by-step approval (OrchVis).
- Spatial, branching canvases suit exploratory multi-thread LLM work (CanvasConvo).
- Trace UIs can inflate trust without improving accuracy (Microsoft Research).

Nearly all of this is **research-stage**: prototypes and lab or field studies.

### Cited Findings
- **Sidekick (Chang, Xu, Li, Wang, Guo; arXiv 2607.17527, 2026).**
  - It designs communication across three phases of multitasking with computer-use agents:
    - ambient cues during background execution;
    - multimodal summaries when the user resumes;
    - verbalised and visualised reasoning in the foreground.
  - In a 30-participant study it significantly improved multitasking performance over baselines, and improved progress awareness and error traceability.
  - [arXiv](https://arxiv.org/abs/2607.17527)
- **CanvasConvo, "Conversations in Space" (arXiv 2605.15848, 2026).** Linear chat becomes a branching tree on a spatial canvas for what-if exploration. A 5–7 day field study with 24 participants found non-linear structure supports exploratory work — [arXiv](https://arxiv.org/abs/2605.15848)
- **Orca (arXiv 2505.22831).** Webpages are embedded on a canvas, and spatial arrangement is coupled with AI operations across them for parallel automation and synthesis — [arXiv](https://arxiv.org/pdf/2505.22831)
- **OrchVis** (above) — hierarchical goal views and selective replanning for multi-agent oversight — [arXiv](https://arxiv.org/abs/2510.24937)
- **"Overseeing Agents Without Constant Oversight"** (above) — the gap between confidence and accuracy — [arXiv](https://arxiv.org/abs/2602.16844)
- **"Human Control Is the Anchor, Not the Answer" (arXiv 2602.09286)** studies how oversight practices diverge in agentic AI communities — [arXiv](https://arxiv.org/pdf/2602.09286) (not read in full)
- **Plover (arXiv 2607.15193)** steers GUI agents through plan-centric interaction — [arXiv](https://arxiv.org/pdf/2607.15193) (not read in full)
- **CHI 2026 Workshop on Human-Agent Collaboration**, SURE framework (Microsoft Research) — [PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2026/03/CHI_2026__Social_Intelligence_for_Human_Agent_Collaboration-1.pdf)
- **"Multi-User Large Language Model Agents" (arXiv 2604.08567)** covers agents serving several humans at once — [arXiv](https://arxiv.org/abs/2604.08567) (not read in full)

### Inferences
- Sidekick's three phases (background → resume → foreground) map directly onto the workspace's density layers (rest / contextual / inspector / deep). They argue for a "while you were away" resumption summary per agent object, and for ambient rather than modal cues.
- CanvasConvo and Orca are academic evidence that branching on a spatial canvas is a real affordance, not decoration. Forking an agent session as a visible branch on the canvas is supported by both the runtime and the HCI literature.
- Treat "attention as a scarce resource" as a design goal. Batch approvals by task (OrchVis-style goal hierarchy) instead of per tool call, and measure caught-error rate rather than user confidence.

### Gaps
- I did not locate UIST 2025 or CSCW 2025–26 papers specifically on spatial multi-agent supervision. The search surfaced mostly arXiv preprints, whose venues I did not always confirm.
- I found no controlled study directly comparing canvas and list UIs for supervising N coding agents.
- Trust-calibration literature specific to coding agents was not reached within the tool budget.

## Local-first / CRDT multiplayer with agents as peers

### Takeaway
"Agent as an ordinary CRDT peer" is now a documented production pattern (Sim, August 2026). The agent diffs a private shadow replica and emits a minimal Yjs update. It never overwrites the document. Yjs remains the real-time default, Automerge 3 suits versioned documents, and Loro 1.0 adds movable trees.

### Cited Findings
- **Sim, "The Agent Is Just Another Peer" (August 3, 2026).**
  - The first approach set the document to the agent's text, which wiped out concurrent human edits.
  - The fix: snapshot the live document into a private shadow replica when streaming starts, reconcile the shadow toward the new text as a minimal diff, and apply the single resulting update through the normal sync channel.
  - No position anchoring is needed, because Yjs operations are relative to item identities.
  - Undo tracks only the user's operations. Converting Markdown to rich text was a source of bugs.
  - [Sim blog](https://www.sim.ai/blog/agent-as-yjs-peer)
- Library landscape:
  - **Automerge 3.0** (May 2025) cut memory use about 10× with a Rust core.
  - **Yjs** is the production default for real-time text, at about 920K weekly downloads.
  - **Loro 1.0** has rich-text and movable-tree CRDTs.
  - [PkgPulse](https://www.pkgpulse.com/guides/yjs-vs-automerge-vs-loro-crdt-libraries-2026); [velt](https://velt.dev/blog/best-crdt-libraries-real-time-data-sync)
- Cloudflare Agent Memory (April 2026) gives each agent a Durable Object identity with its own SQLite. Concurrent sub-agent edits are framed as a CRDT merge problem — [velt](https://velt.dev/blog/best-crdt-libraries-real-time-data-sync) (secondary source)

### Inferences
- This app already runs Yjs, Hocuspocus and y-monaco for shared canvases and text. An agent writing into a shared file or note should use Sim's shadow-replica-plus-minimal-diff pattern, never whole-text replacement.
  - Give the agent its own awareness entry (cursor and colour) and its own UndoManager origin. Humans can then undo their own edits without reverting the agent's, and the reverse.
- Agent edits arriving as CRDT updates attributed to the agent's client ID provide per-character provenance for free. That feeds the audit and review surface.

### Gaps
- I found no academic user study of humans and agents co-editing through CRDTs (trust, awareness, conflict perception).
- I did not verify Automerge or Loro agent-specific integrations first-hand.
