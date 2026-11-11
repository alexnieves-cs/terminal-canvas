# Agentic Super Apps and Agent-Orchestration Workspaces — Landscape as of September 2026

Source-quality legend: **[P]** primary (vendor blog, docs, paper, METR); **[T]** credible press (Fortune, CNBC, 9to5Mac, Nikkei, Caixin, TechCrunch); **[A]** aggregator / SEO blog / tutorial site — treat as unverified unless corroborated. Research done 2026-09-26 with ~20 tool calls; many product-level facts only surfaced via aggregators and are marked as such.

## 1. What does "agentic super app" mean in current usage?

### Takeaway
In 2026 "super app" has become the label the three largest Western AI vendors use for **collapsing chat, a coding agent, a browser/computer-use agent and document/deliverable tools into one desktop app where the assistant carries the task across tools** — OpenAI (announced March, shipped July), Anthropic (merged Chat + Cowork, Sept 16), Microsoft (Copilot super app, Sept 23). In China the term runs the other way: existing super apps (WeChat, Alipay/Taobao, Qwen) are adding agents that act across their mini-program/service ecosystems ("agentic commerce"). Manus/Genspark are the "general agent" startups that preceded the framing; Manus was bought by Meta.

### Cited Findings
**OpenAI**
- WSJ (Mar 19, 2026) reported an internal memo from Fidji Simo (CEO of Applications) to merge the ChatGPT desktop app, Codex and the Atlas browser into one desktop "super app"; Greg Brockman assisting; motive stated as reducing fragmentation that "had been slowing them down." [T] — [CNBC](https://www.cnbc.com/2026/03/19/openai-desktop-super-app-chatgpt-browser-codex.html)
- Claim that the move was driven by Anthropic capturing ~73% of first-time enterprise AI-tool spend and Claude becoming the most-downloaded US app in March 2026 [A, unverified] — [Trending Topics](https://www.trendingtopics.eu/openai-plans-to-chatgpt-codex-and-atlas-into-one-desktop-super-app/)
- July 9, 2026: OpenAI launched **ChatGPT Work** (a goal-to-finished-deliverable agent: sheets, slides, docs, sites) and a unified ChatGPT desktop app with three modes — Work (abstracts technical detail), Codex (technical, shows detail), Classic. Work and Codex share plugins. GPT-5.6 in three tiers: Sol ($5/$30 per M tokens), Terra ($2.50/$15), Luna ($1/$6); Free/Go get Terra only; "Sol Pro" for Pro/Enterprise. Features: "Ultra" mode coordinating multiple agents across parallel workstreams, faster computer use that inspects rendered results, beta multi-agent subagents. [T] — [9to5Mac](https://9to5mac.com/2026/07/09/openai-announcing-the-next-chapter-for-chatgpt-today-watch-here/)
- Codex app merged into the new ChatGPT desktop app, Chat/Work/Codex available on every plan including Free [A] — [Coursiv](https://coursiv.io/blog/codex-merged-with-chatgpt-app); OpenAI also agreed to acquire Astral (Python tooling: uv/ruff) for Codex [A] — [Trending Topics](https://www.trendingtopics.eu/openai-plans-to-chatgpt-codex-and-atlas-into-one-desktop-super-app/)
- OpenAI also pilots "agentic commerce" alongside the super app [A] — [AI Magazine](https://aimagazine.com/news/openai-piloting-a-super-app-and-agentic-commerce)

**Anthropic**
- Sept 16, 2026: Claude Chat and Claude **Cowork** (agentic product) merged into one assistant, framed by Fortune as "a push to build an AI superapp." New/expanded: **Claude Docs** (real-time multi-user docs with AI drafting/commenting, export to Google Docs/Word), **Claude Slides** (export PPTX/PDF), **Claude Design** now in all conversations. **Claude Code remains separate.** Rolled out to Pro/Max immediately on web/desktop/mobile; Team/Free later; admins control feature enablement. [T] — [Fortune](https://fortune.com/2026/09/16/anthropic-merges-its-claude-chat-and-agentic-cowork-products-into-a-single-ai-assistant-as-part-of-a-push-to-build-an-ai-superapp/)
- Same article cites a Stanford Digital Economy Lab study: agentic coding tasks consumed ~1,000x more tokens than simple chat reasoning tasks. [T, secondary citation] — [Fortune](https://fortune.com/2026/09/16/anthropic-merges-its-claude-chat-and-agentic-cowork-products-into-a-single-ai-assistant-as-part-of-a-push-to-build-an-ai-superapp/)

**Microsoft**
- Fortune exclusive (May 29, 2026): Microsoft building a super app combining coding, chat and Copilot tools. [T] — [Fortune](https://fortune.com/2026/05/29/microsoft-working-on-super-app/)
- Sept 23, 2026: Nadella unveiled the Copilot super app in Seattle. **Autopilot**: you name an agent, give it a role and goal, and deploy it (project updates, tracking decisions/deadlines, reminding colleagues, contacting partners). A coding tool for non-engineers (apps, dashboards) sharing tech with GitHub Copilot. Free tier + subscriptions; **usage-based billing for Autopilot and Code**. M365 Copilot passed 30M paid seats (July 2026), net seats doubled QoQ. Nadella: "Everything that you observe should be governable by policy... now I need to do that with every agent out there." Fortune also notes Meta's "Muse" app for personal agents. [T] — [Fortune](https://fortune.com/2026/09/25/microsoft-unveils-copilot-super-app-targeting-business-users-with-ai-agents/)

**China: super apps adding agents**
- Alibaba, Tencent, ByteDance racing into "agentic commerce" inside super apps (Taobao/Qwen, WeChat/Weixin, Doubao). [T] — [CNBC, Jan 21 2026](https://www.cnbc.com/2026/01/21/china-tech-ai-agentic-commerce-super-apps-alibaba-taobao-qwen-tencent-wechat-doubbao-weixin.html)
- Alibaba opened the Qwen app to third-party brand agents and "skills" (early testers KFC, Luckin, Mixue, China Eastern). [T] — [Caixin, Jun 4 2026](https://www.caixinglobal.com/2026-06-04/alibaba-opens-qwen-ai-to-third-party-services-in-push-for-agent-dominance-102450730.html); [Nikkei Asia](https://asia.nikkei.com/business/technology/artificial-intelligence/alibaba-opens-qwen-to-external-apps-as-china-s-ai-agent-race-intensifies)
- Qwen ~166M MAU after adding 126M in Q1 2026, behind Doubao (~345M); Tencent Yuanbao ~50–57M MAU; a WeChat agent grey-box test began Aug 2026 to select users (WeChat ~1.4B users). [A — figures not checked against primary] — [AI in China](https://www.ainchina.com/blog/tencent-wechat-ai-agent-1-billion-user-platform-shift-2026/); [Hello China Tech](https://hellochinatech.com/p/wechat-ai-gatekeeper)
- Analyst framing: China's agent market "is decided by access to services," not model quality. [A] — [Inside China AI](https://insidechinaai.substack.com/p/chinas-ai-agent-market-is-decided)

**General-agent startups**
- Meta acquired Manus (Singapore, ex-Butterfly Effect/Monica) announced Dec 30, 2025; Manus to keep operating separately while tech integrates into Meta AI. [T] — [CNBC](https://www.cnbc.com/2025/12/30/meta-acquires-singapore-ai-agent-firm-manus-china-butterfly-effect-monicai.html). Price reported ~$2B [T] — [TechRadar](https://www.techradar.com/pro/meta-buys-manus-for-usd2-billion-to-power-high-stakes-ai-agent-race); Manus reportedly ~$100M ARR within ~8–9 months of its March 2025 launch [A] — [Medium](https://medium.com/@sebuzdugan/meta-superintelligence-labs-acquires-manus-ai-for-2b-what-a-100m-arr-startup-tells-us-about-ai-51301f523a1b)
- Genspark positioned as the research-oriented general agent (cross-checked, cited reports) [A] — [usecarly](https://www.usecarly.com/blog/manus-vs-genspark/)

### Inferences
- The Western "super app" is a **consolidation move under competitive pressure**, not a new capability: each vendor already had the pieces and is merging surfaces so one task thread spans chat → code → browse → deliverable.
- Two distinct super-app shapes: **(a) vertical-integration desktop apps** (OpenAI/Anthropic/Microsoft: one model vendor, their own agents) and **(b) service-access super apps** (WeChat/Qwen: agents win by reaching third-party services). A third-party desktop app can be neither — its lever is being **model/agent-neutral** and hosting everyone's agents in one place (the Conductor/Warp/Superset pattern below).
- Anthropic keeping Claude Code separate from the merged app while OpenAI folded Codex in is a notable divergence worth watching.
- Governance language ("governable by policy", admin feature controls, usage-based billing) is now in the launch messaging — enterprise control is a first-class feature, not an afterthought.

### Gaps
- No primary OpenAI blog post fetched for the July launch (9to5Mac only); exact name/branding of the merged app and Atlas's status inside it not confirmed from OpenAI directly.
- No authoritative origin/coinage of the phrase "agentic super app" found; it appears to be press/analyst shorthand rather than a vendor-coined term.
- Genspark 2026 revenue/features and Meta's Muse app were not verified.

## 2. What do the leading agent workspaces ship now?

### Takeaway
The whole field converged in H1 2026 on the same shape: **an "agents window/manager" as the primary surface**, many agents in parallel each in an **isolated git worktree or cloud sandbox**, local↔cloud handoff, a diff/review step before merge, plus skills/plugins/MCP. The editor became secondary (Cursor 3, Antigravity 2.0, Claude Code desktop redesign, Windsurf→"Devin Desktop"). Canvas-based agent surfaces exist (tldraw, Flora, Replit Agent 4's canvas) but are mostly creative/design, not code-review-centric.

### Cited Findings
**Claude Code (Anthropic)**
- Desktop app redesign Apr 14, 2026: multi-session sidebar, parallel sessions, drag-and-drop pane layout, integrated terminal, in-app file editor; **Routines** (scheduled/automated runs) in research preview with daily run caps by plan; macOS/Windows only (no Linux desktop). [A — multiple tutorial sites, no Anthropic primary fetched] — [devtoolpicks](https://devtoolpicks.com/blog/claude-code-desktop-redesign-parallel-sessions-2026); [buildfastwithai](https://www.buildfastwithai.com/blogs/claude-code-desktop-redesign-2026)
- **Agent teams**: a lead session decomposes a task, teammates run in isolated contexts and message each other directly. [A] — [Kimi guide](https://www.kimi.ai/resources/agent-teams-in-claude-code); [community guide](https://github.com/FlorianBruniaux/claude-code-ultimate-guide/blob/main/guide/workflows/agent-teams.md)
- Usage limits: 5-hour rolling window + 7-day weekly ceiling; on May 6, 2026 Anthropic reportedly doubled 5-hour limits and removed peak-hour throttling. Since Apr 4, 2026 subscription OAuth tokens reportedly blocked in third-party tools (Cursor, Cline, Windsurf), forcing per-token API keys. [A] — [Build This Now](https://www.buildthisnow.com/blog/models/claude-code-usage-limits-2026); [TrueFoundry](https://www.truefoundry.com/blog/claude-code-limits-explained)

**OpenAI Codex / ChatGPT**
- See §1: Codex is now a mode of the unified ChatGPT desktop app; ChatGPT Work for non-coders; multi-agent "Ultra" mode and subagents beta (Jul 2026). [T] — [9to5Mac](https://9to5mac.com/2026/07/09/openai-announcing-the-next-chapter-for-chatgpt-today-watch-here/)

**Cursor**
- **Cursor 3** (Apr 2, 2026): interface rebuilt agent-first; **Agents Window** replaces Composer — a full-screen workspace listing every agent session (local, cloud, remote SSH, mobile) across repos; parallel agents each in isolated git worktrees; cloud handoff; 30+ plugins. Apr 24 update added `/multitask` (async subagents). [A] — [digitalapplied](https://www.digitalapplied.com/blog/cursor-3-agents-window-complete-guide); [agentpatterns.ai](https://www.agentpatterns.ai/tools/cursor/agents-window/)
- Reported cost incidents: a team's $7,000 annual subscription depleted in a day; bills "as high as $47,000" [A, anecdotal, unverified] — [morphllm](https://www.morphllm.com/ai-coding-costs)

**Google Antigravity / Jules**
- Antigravity (launched Nov 2025, older) introduced an agent-first "Manager" surface to spawn/orchestrate/observe agents asynchronously across workspaces, producing verifiable "artifacts." [P, 2025] — [Google Developers Blog](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/); [VentureBeat](https://venturebeat.com/ai/google-antigravity-introduces-agent-first-architecture-for-asynchronous)
- **Antigravity 2.0** (May 2026, I/O) — standalone desktop app shifting focus from the editor to managing teams of agents; Manager view reported to support up to 5 parallel agents. Jules integrated into IDEs, callable from CLI, runs async. Gemini API "Antigravity Agent 09-2026" replaces the 05-2026 preview (which shuts down Oct 5, 2026). [P/A mix] — [Antigravity I/O blog](https://antigravity.google/blog/google-io-2026); [changelog](https://antigravity.google/changelog/); [beginnersinai (5-agent figure, A)](https://beginnersinai.org/google-antigravity/)

**Cognition (Devin + Windsurf)**
- Cognition acquired Windsurf July 2025 [T] — [TechCrunch](https://www.techcrunch.com/2025/07/14/cognition-maker-of-the-ai-coding-agent-devin-acquires-windsurf/). Windsurf rebranded **Devin Desktop** June 2026 [P/A] — [Devin blog](https://devin.ai/blog/windsurfs-next-chapter); [digitalapplied](https://www.digitalapplied.com/blog/windsurf-becomes-devin-desktop-ide-migration-2026)
- Devin ARR $1M (Sep 2024) → $73M (Jun 2025); Windsurf added $82M ARR at acquisition; ~$26B valuation round closed May 27, 2026 at ~$492M run-rate [A — not verified against primary] — [idlen](https://www.idlen.io/news/cognition-devin-25-billion-valuation-windsurf-vibe-coding-april-2026/); [valueaddvc](https://valueaddvc.com/blog/how-does-cognition-make-money-devin-pricing-windsurf-enterprise-and-the-492m-arr-breakdown)

**Replit**
- **Agent 4** (Mar 11, 2026): design + build + deploy in one flow, an **infinite canvas** for design, parallel agents splitting a project (auth/DB/backend/frontend) with a dedicated sub-agent that resolves conflicts; pricing lists 2 parallel agents on Core, 10 on Pro. [P] — [Replit blog](https://replit.com/blog/introducing-agent-4-built-for-creativity); [Replit changelog](https://docs.replit.com/updates/2026/03/13/changelog)
- $150M ARR Sept 2025; $400M raise at $9B valuation; targeting $1B ARR by end of 2026 [A] — [aiforautomation](https://aiforautomation.io/news/2026-03-21-replit-agent-4-9-billion-valuation-400m-parallel-ai-agents)

**Warp, Conductor, Factory, Amp, Superset (orchestrator layer)**
- **Warp**: open source as of 2026; runs third-party agents (Claude Code, Codex, Gemini, OpenCode) side by side in panes, plus Warp Agent and a cloud orchestrator **"Oz"** for background/parallel agents. [P docs + A] — [Warp docs](https://docs.warp.dev/guides/agent-workflows/how-to-run-multiple-ai-coding-agents/); [Superset comparison](https://superset.sh/compare/warp-vs-conductor)
- **Conductor** (Melty Labs, $22M Series A): native macOS app running Claude Code / Codex / Cursor agents in parallel, each in an isolated worktree, with review-and-merge and PR flow. [A] — [rustman wiki](https://rustman.org/wiki/conductor-parallel-agents/)
- **Factory**: delegates tasks to "Droids"; missions, skills, agents; worktree parallelism. [A] — [Sid Bharath guide](https://sidbharath.com/blog/factory-ai-guide/); [digitalapplied](https://www.digitalapplied.com/blog/factory-ai-multi-agent-coding-platform-review)
- Open-source orchestrators treat agent CLIs as interchangeable "worker harnesses" — one lists 26 (Claude Code, Codex, Aider, OpenCode, Cursor, Copilot, Goose, Amp, Droid, Kimi…). [A] — [Augment Code](https://www.augmentcode.com/tools/open-source-agent-orchestrators); [Nimbalyst worktree tools](https://nimbalyst.com/blog/best-git-worktree-tools-ai-coding-2026/)

**Multi-agent canvases**
- **tldraw** "Spatial harness" (blog Sept 22, 2026): agents get viewport-scoped context (screenshot + detailed shapes in view, coarser outside) — "analogous to giving a coding agent an overview of a repo instead of all code"; letting agents **write code against the live Editor** beat discrete tool actions on reasoning, tokens and latency; "the canvas makes it so much easier to manage multiple agents working on one document at once, something that's incredibly difficult to do from chat. You can communicate agent state through animations or sprites." Failure: browser-only "Fairies" had no filesystem/web/tools and were "unable to do real work" → moved to local agents with full tool access, canvas as visualization layer. [P] — [tldraw blog](https://tldraw.dev/blog/harnessing-the-agents); talk: [Steve Ruiz, AI Native DevCon June 2026](https://www.youtube.com/watch?v=7Sy2gSoxu7o)
- **Flora**: infinite node canvas wiring 50+ image/video/text models, with built-in agent "Fauna." [A] — [tooldirectory](https://tooldirectory.ai/tools/flora)
- MindPal Canvas: infinite canvas for multi-agent systems [P marketing] — [mindpal](https://mindpal.space/canvas)

### Inferences
- **The "agents window" is now table stakes**; differentiation is moving to what happens *after* agents finish (review, integration, evidence) and *across* vendors (neutral hosting of Claude Code + Codex + Gemini agents).
- Model vendors are pulling users into their own first-party desktop apps and (per the OAuth block) making third-party subscription use harder — a real platform risk for neutral orchestrators, which must bring-your-own-API-key or drive the vendors' CLIs.
- tldraw's lessons directly validate a canvas-of-real-local-agents design: canvas as a **visualization/control layer over agents with full local tool access**, spatial state as the coordination UI, and scoped (viewport-like) context.
- Replit's "conflict-resolver sub-agent" and Cursor/Conductor worktrees are the two competing answers to parallel-write collisions: isolate-then-merge vs. an agent that reconciles.

### Gaps
- No primary Anthropic/Cursor changelog fetched; Claude Code desktop and Cursor 3 details come from third-party write-ups.
- Amp (Sourcegraph) 2026 specifics and Factory pricing/adoption not found in primary sources.
- "tldraw computer" (2024, older) status in 2026 not checked.
- GitHub Copilot coding agent / Agent HQ 2026 not covered in this pass.

## 3. Common patterns

### Takeaway
Convergent patterns: parallel agents in worktrees or cloud sandboxes; a manager/inbox view of all sessions; subagents/agent teams with a lead; local↔cloud handoff; scheduled/triggered runs (Routines); skills + plugins + MCP connectors shared across modes; deliverable-producing agents (docs/slides/sites) with generative outputs; admin/policy governance and usage-based billing.

### Cited Findings
- Worktree isolation per agent: Cursor 3 [A](https://www.agentpatterns.ai/tools/cursor/agents-window/), Conductor [A](https://rustman.org/wiki/conductor-parallel-agents/), Factory [A](https://sidbharath.com/blog/factory-ai-guide/), Warp panes [P](https://docs.warp.dev/guides/agent-workflows/how-to-run-multiple-ai-coding-agents/).
- Lead/teammate multi-agent: Claude Code agent teams [A](https://www.kimi.ai/resources/agent-teams-in-claude-code); OpenAI multi-agent beta + Ultra mode [T](https://9to5mac.com/2026/07/09/openai-announcing-the-next-chapter-for-chatgpt-today-watch-here/); Cursor `/multitask` [A](https://www.digitalapplied.com/blog/cursor-3-agents-window-complete-guide); Replit parallel agents + conflict sub-agent [P](https://replit.com/blog/introducing-agent-4-built-for-creativity).
- Manager surfaces: Antigravity Manager [P](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/); Cursor Agents Window; Claude Code multi-session sidebar [A](https://devtoolpicks.com/blog/claude-code-desktop-redesign-parallel-sessions-2026).
- Scheduled/background: Claude Code Routines [A](https://www.buildfastwithai.com/blogs/claude-code-desktop-redesign-2026); Warp Oz cloud orchestrator [A](https://superset.sh/compare/warp-vs-conductor); Microsoft Autopilot deployable role agents [T](https://fortune.com/2026/09/25/microsoft-unveils-copilot-super-app-targeting-business-users-with-ai-agents/).
- Skills/plugins as an ecosystem: Cursor 3 30+ plugins; ChatGPT Work & Codex share plugins [T](https://9to5mac.com/2026/07/09/openai-announcing-the-next-chapter-for-chatgpt-today-watch-here/); Qwen opens to third-party "skills" [T](https://www.caixinglobal.com/2026-06-04/alibaba-opens-qwen-ai-to-third-party-services-in-push-for-agent-dominance-102450730.html).
- Deliverable generation / generative UI: ChatGPT Work (sheets/slides/docs/sites), Claude Docs/Slides/Design [T](https://fortune.com/2026/09/16/anthropic-merges-its-claude-chat-and-agentic-cowork-products-into-a-single-ai-assistant-as-part-of-a-push-to-build-an-ai-superapp/); Antigravity "artifacts" as verifiable evidence [T](https://venturebeat.com/ai/google-antigravity-introduces-agent-first-architecture-for-asynchronous).
- Governance: Nadella "governable by policy" [T](https://fortune.com/2026/09/25/microsoft-unveils-copilot-super-app-targeting-business-users-with-ai-agents/); Anthropic admin feature controls [T](https://fortune.com/2026/09/16/anthropic-merges-its-claude-chat-and-agentic-cowork-products-into-a-single-ai-assistant-as-part-of-a-push-to-build-an-ai-superapp/).

### Inferences
- Memory and approval queues were not prominent in 2026 launch coverage found here — either commoditized or under-built; approval/"needs you" inboxes appear more in orchestrator tools than in vendor launch posts.
- Nobody found in this pass markets a spatial canvas as the primary surface for *coding* agents with review; closest are tldraw (non-code), Replit (design canvas), Warp (panes).

### Gaps
- No primary evidence gathered on memory implementations (ChatGPT memory, Claude memory) as of 2026.
- Approval-queue UX specifics per vendor not verified.

## 4. Repeatedly reported pain points

### Takeaway
The bottleneck has moved from generation to **verification**: review burden, trust gaps, merge conflicts between parallel agents, and cost/limit unpredictability dominate 2026 reporting.

### Cited Findings
- **Review burden**: agentic AI PRs have a pickup time 5.3x longer than unassisted PRs; developers and leaders both place the bottleneck in reviewing/validating agent output. [A/vendor report] — [Codacy](https://blog.codacy.com/ai-breaking-code-review-how-engineering-teams-survive-pr-bottleneck); Qodo 2026 report titled "Verification Is the New Bottleneck" [vendor] — [Qodo](https://www.qodo.ai/blog/state-of-ai-code-quality-report-2026/)
- **Trust vs behaviour gap**: 96% of developers don't fully trust AI code but only 48% consistently review it before committing (citing Sonar 2026); PRs merged without review up 31.3%, incidents-per-PR up 242.7%. [A, secondary citation of Sonar] — [Hyrax](https://hyrax.dev/blog/sonar-2026-ai-code-trust-behavior-gap)
- Academic: participatory design study on "trust-calibrated" review workflows for LLM multi-file changes. [P] — [arXiv 2606.01969](https://arxiv.org/html/2606.01969v1)
- **Merge conflicts among parallel agents**: 33,596 agent PRs across 2,807 repos (Dec 2024–Jul 2025; Codex 21,799, Copilot 4,970, Devin 4,827, Cursor 1,541, Claude Code 459). 40.2% of repos had temporally overlapping agent PRs; 79.4% of agent PRs overlapped others. Replaying 747 merges: **19.8% textual conflict rate intra-agent, 41.7% cross-agent**; 84.4% of conflicts in source files. Agents operate "without knowledge that other agents ... are simultaneously accessing and altering the same files." (Data predates 2026.) [P] — [arXiv 2607.04697](https://arxiv.org/html/2607.04697v2). A separate claim of 27.67% conflict rate across 142k+ agent PRs appeared only in a search snippet [unverified] — [Codex Knowledge Base](https://codex.danielvaughan.com/2026/07/28/agent-pr-merge-conflicts-concurrent-coding-agents-codex-cli-worktree-isolation-coordination-defence/)
- **Cost blowups / limits**: agentic tasks ~1,000x chat tokens (Stanford DEL via Fortune) [T](https://fortune.com/2026/09/16/anthropic-merges-its-claude-chat-and-agentic-cowork-products-into-a-single-ai-assistant-as-part-of-a-push-to-build-an-ai-superapp/); anecdotal $47k bills and a $7k annual Cursor budget gone in a day [A](https://www.morphllm.com/ai-coding-costs); Max 20x heavy users consuming $600–1,500/mo of API-equivalent tokens for $200 [A](https://www.buildthisnow.com/blog/models/claude-code-usage-limits-2026); Microsoft moving Autopilot/Code to usage-based billing [T](https://fortune.com/2026/09/25/microsoft-unveils-copilot-super-app-targeting-business-users-with-ai-agents/).
- **Context/tool fragmentation** is the stated rationale for super apps: users shouldn't have to "manually shuttle context between them" [T/A] — [Fortune via search](https://fortune.com/2026/09/16/anthropic-merges-its-claude-chat-and-agentic-cowork-products-into-a-single-ai-assistant-as-part-of-a-push-to-build-an-ai-superapp/); Simo on fragmentation slowing OpenAI [T](https://www.cnbc.com/2026/03/19/openai-desktop-super-app-chatgpt-browser-codex.html).
- **Coordination of many agents from chat is hard** — tldraw: managing multiple agents on one document "is incredibly difficult to do from chat." [P](https://tldraw.dev/blog/harnessing-the-agents)
- Productivity sentiment still positive: ~70% of agent users say agents reduced time on specific tasks; 69% say productivity rose; top complaints inaccurate suggestions (66%), longer debugging (45%). [A, underlying survey unnamed — likely Stack Overflow 2025, older] — [Raulji](https://www.rauljitechnologies.com/blog/ai-coding-agents-2026/)

### Inferences
- The frontier gap is **integration and verification of parallel agent output** — conflict-aware scheduling (who's touching which files), evidence-backed review, and cost attribution per agent/task. Worktrees solve write isolation but not the eventual merge (the 41.7% cross-agent conflict figure is the argument).
- Cost opacity is structural (subscription vs API vs usage-based, vendor OAuth restrictions); a per-agent meter and hard caps enforced outside the agent loop is a visible gap in vendor products.
- The trust/behaviour gap (distrust but don't review) suggests review UX must lower the cost of reviewing, not just add warnings.

### Gaps
- No HN thread-level evidence gathered; pain points here are from surveys/vendor reports, several with commercial interest (Qodo, Codacy, Sonar).
- No hard data on "context loss" across long sessions beyond vendor rationale.

## 5. Metrics: adoption, pricing, agent run-length

### Takeaway
METR 50% time horizons crossed ~14–16 hours by early-mid 2026, at/above the reliable ceiling of METR's task suite, with doubling ~every 105 days per one reading of METR's fit (vs the older ~7-month figure). Revenue: Cognition ~$0.5B run-rate, Replit targeting $1B ARR, M365 Copilot 30M paid seats.

### Cited Findings
- METR page (updated May 8, 2026) lists Claude Mythos Preview (early, May 8), Gemini 3.1 Pro (Apr 15), GPT-5.4 (Apr 10), Claude Opus 4.6 & GPT-5.3-Codex (Feb 20); **"Measurements above 16 hrs are unreliable with our current task suite."** [P] — [METR time horizons](https://metr.org/time-horizons/); methodology update [P] — [Time Horizon 1.1](https://metr.org/blog/2026-1-29-time-horizon-1-1/); METR also measured time horizon using Claude Code and Codex as scaffolds [P] — [METR note, Feb 13 2026](https://metr.org/notes/2026-02-13-measuring-time-horizon-using-claude-code-and-codex/)
- Claude Opus 4.6 ~14.5h 50% horizon; Claude Mythos Preview ≥16h (50%) and ~3h06m (80%) [secondary — search snippets; numeric values not visible on METR page fetch] — [LessWrong estimate](https://www.lesswrong.com/posts/WacuyurbABwNv8ziq/estimating-metr-time-horizons-for-claude-opus-4-6-and-gpt-5); [Wikipedia: METR](https://en.wikipedia.org/wiki/METR)
- "105 days" doubling per METR's fit through Feb 2026 data; GPT-4o ~4 min mid-2024 → Mythos 16h March 2026 [A, X post] — [Aakash Gupta on X](https://x.com/aakashgupta/status/2053207639107174452); contested — [Medium: still doubling every 7 months?](https://medium.com/@AIchats/are-ai-time-horizons-still-doubling-every-7-months-6262ed2bcc6a)
- Caveat: time horizon = human time for tasks the model succeeds at 50% of the time, **not** how long an agent runs continuously; "most misunderstood graph in AI." [T] — [MIT Technology Review, Feb 5 2026](https://www.technologyreview.com/2026/02/05/1132254/this-is-the-most-misunderstood-graph-in-ai/)
- Adoption/revenue: M365 Copilot 30M paid seats (Jul 2026) [T](https://fortune.com/2026/09/25/microsoft-unveils-copilot-super-app-targeting-business-users-with-ai-agents/); Cognition ~$492M run-rate, ~$26B valuation [A](https://valueaddvc.com/company/cognition); Replit $150M ARR (Sep 2025) → $1B target, $9B valuation [A](https://aiforautomation.io/news/2026-03-21-replit-agent-4-9-billion-valuation-400m-parallel-ai-agents); Manus ~$100M ARR pre-acquisition [A](https://medium.com/@sebuzdugan/meta-superintelligence-labs-acquires-manus-ai-for-2b-what-a-100m-arr-startup-tells-us-about-ai-51301f523a1b); Qwen 166M MAU, Doubao 345M [A](https://www.ainchina.com/blog/tencent-wechat-ai-agent-1-billion-user-platform-shift-2026/).
- Pricing: GPT-5.6 API Sol $5/$30, Terra $2.50/$15, Luna $1/$6 per M tokens [T](https://9to5mac.com/2026/07/09/openai-announcing-the-next-chapter-for-chatgpt-today-watch-here/); Claude Max tiers $100/$200 flat [A](https://www.buildthisnow.com/blog/models/claude-code-usage-limits-2026); Replit parallel-agent caps 2 (Core) / 10 (Pro) [A](https://www.developersdigest.tech/blog/replit-agent-4-design-to-app).

### Inferences
- With 50% horizons at the measurement ceiling, the practical limit on autonomous work is shifting from model capability to **harness, verification and human review throughput** — consistent with §4.
- Doubling-rate claims above 16h are not measurable by METR's current suite; any "32-hour tasks by Sept 2026" projection is extrapolation, not measurement.

### Gaps
- Could not extract METR's exact numeric table (interactive chart; raw YAML at `metr.org/assets/benchmark_results_1_1.yaml` not fetched).
- No verified 2026 ARR for Cursor (Anysphere), Anthropic Claude Code, or OpenAI Codex; no a16z/Sequoia 2026 agent report found in this pass.
- Real-world average agent run-length (wall-clock minutes per session) — no public data found.
