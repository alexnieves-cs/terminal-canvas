# Win the review bottleneck, not the super-app race

As of September 2026 the "agentic super app" is a **consolidation move by the three big Western model vendors**. OpenAI (July), Anthropic (September 16) and Microsoft (September 23) each folded chat, a coding agent, computer use and deliverable tools into one desktop app. None of them added a new capability. What comes next is not a bigger app. It is a **control plane for many budgeted, verifiable, partly off-device workers**, and the scarce resource in it is human review and attention rather than model capability. Frontier agents already clear 85% on OSWorld-Verified, and METR's 50% time horizons have hit the ceiling of its task suite. Meanwhile agent PRs wait 5.3x longer for review and parallel agents collide in 41.7% of cross-agent merges. terminal-canvas already has most of the rare assets this next layer needs: a spatial canvas, caps enforced by main outside the agent loop, a decision queue, a "finished ≠ verified" evidence model, Yjs multiplayer where agents sit on the roster, and a pty relay. It should not chase the vendors' breadth; its own 2026-09-14 review already says breadth is enough. The recommendations below are twelve ranked implementations in three horizons. The first four (holds become decisions, a collision radar, review built on verification, and a rules channel that survives compaction) are cheap because they extend seams the app has already shipped. Each one targets a gap the vendors have left open.

Citation note: web sources are linked inline. Codebase facts cite repo-relative paths in `code` form, from the internal inventory taken on 2026-09-26 at HEAD 4d3920c4, with M352 uncommitted in the working tree. Figures marked "aggregator" come from secondary sources that the notes could not check against a primary source.

## Three vendors merged their apps; nobody merged the review

The Western super app is a response to fragmentation, not a breakthrough. Fidji Simo's March memo merged the ChatGPT desktop app, Codex and the Atlas browser because fragmentation "had been slowing them down" ([CNBC](https://www.cnbc.com/2026/03/19/openai-desktop-super-app-chatgpt-browser-codex.html)). The July launch shipped **ChatGPT Work**, a unified app with Work, Codex and Classic modes, an "Ultra" mode that coordinates agents across parallel workstreams, and three GPT-5.6 price tiers from $1/$6 to $5/$30 per million tokens ([9to5Mac](https://9to5mac.com/2026/07/09/openai-announcing-the-next-chapter-for-chatgpt-today-watch-here/)). On September 16 Anthropic merged Chat and Cowork and added Claude Docs, Slides and Design. **Claude Code stayed a separate product**, a notable divergence from OpenAI's choice to fold Codex in ([Fortune](https://fortune.com/2026/09/16/anthropic-merges-its-claude-chat-and-agentic-cowork-products-into-a-single-ai-assistant-as-part-of-a-push-to-build-an-ai-superapp/)). A week later Microsoft shipped the Copilot super app with **Autopilot**, a named agent with a role and goal that you deploy. Autopilot and Code are billed by usage, and Nadella's line was "Everything that you observe should be governable by policy… now I need to do that with every agent out there" ([Fortune](https://fortune.com/2026/09/25/microsoft-unveils-copilot-super-app-targeting-business-users-with-ai-agents/)).

China uses the term in the opposite direction. There, existing super apps add agents that act on their service ecosystems: Qwen opened to third-party brand agents and "skills" ([Caixin](https://www.caixinglobal.com/2026-06-04/alibaba-opens-qwen-ai-to-third-party-services-in-push-for-agent-dominance-102450730.html)), and WeChat, Taobao and Doubao are racing into agentic commerce ([CNBC](https://www.cnbc.com/2026/01/21/china-tech-ai-agentic-commerce-super-apps-alibaba-taobao-qwen-tencent-wechat-doubbao-weixin.html)). terminal-canvas is neither shape. It does not own a model, and it does not own a service ecosystem. Its lever is the third position the landscape notes identify: **a neutral host for everyone's agents**, alongside Warp, which runs Claude Code, Codex and Gemini side by side ([Warp docs](https://docs.warp.dev/guides/agent-workflows/how-to-run-multiple-ai-coding-agents/)), and Conductor.

The coding-workspace field converged on one shape in H1 2026. **An agents window is the primary surface**, each parallel agent runs in its own worktree or cloud sandbox, work hands off between local and cloud, there is a diff step before merge, and skills, plugins and MCP sit underneath. Cursor 3 replaced Composer with an Agents Window ([agentpatterns.ai](https://www.agentpatterns.ai/tools/cursor/agents-window/), aggregator). Antigravity 2.0 became a standalone app for managing teams of agents ([Antigravity I/O blog](https://antigravity.google/blog/google-io-2026)). Windsurf became Devin Desktop ([Devin blog](https://devin.ai/blog/windsurfs-next-chapter)). Replit Agent 4 put design on an infinite canvas and added **a dedicated sub-agent that resolves conflicts between parallel agents** ([Replit blog](https://replit.com/blog/introducing-agent-4-built-for-creativity)).

So the agents window is now table stakes. The open question is what happens after the agents finish. terminal-canvas reached this shape earlier than most. The v3 run (M71–M95) already called it an "agentic super app", and M300–M352 added the Orchestrate record, a decision inbox, Integrate with receipts, job recovery, multiplayer and per-agent caps (`docs/milestone-history.md`; `README.md` milestone table).

There is also a platform risk. Anthropic reportedly blocked subscription OAuth tokens in third-party tools from April 2026 (aggregator, [TrueFoundry](https://www.truefoundry.com/blog/claude-code-limits-explained)). terminal-canvas avoids most of that risk by construction. `main/agent-session.ts` drives the *installed, already-authenticated CLI* in stream-json mode (`src/main/agent-session.ts`), so it never holds a vendor token. That is a real structural advantage over orchestrators that call vendor APIs directly, and it should be protected.

## Verification, collisions and cost are where the gaps are

Every pain point the notes found sits downstream of generation. Agentic PRs have a **pickup time 5.3x longer** than unassisted ones ([Codacy](https://blog.codacy.com/ai-breaking-code-review-how-engineering-teams-survive-pr-bottleneck)), and Qodo titled its 2026 report "Verification Is the New Bottleneck" ([Qodo](https://www.qodo.ai/blog/state-of-ai-code-quality-report-2026/)); both are vendors with a commercial interest. Citing Sonar, one analysis reports that **96% of developers don't fully trust AI code but only 48% consistently review it**, alongside a 31.3% rise in PRs merged without review ([Hyrax](https://hyrax.dev/blog/sonar-2026-ai-code-trust-behavior-gap), secondary). The trust gap is a behaviour gap. Adding more warnings will not close it. Only making review cheaper will.

The most important HCI result points the same way, and it is sobering. In Microsoft Research's study, a better trace UI sped up error detection and **raised users' confidence without meaningfully improving their accuracy** ([Grunde-McLaughlin et al., arXiv 2602.16844](https://arxiv.org/abs/2602.16844)). Richer narration of what an agent did is the wrong investment. Verification aids that change outcomes, such as checks, diffs and hierarchical goal views with selective replanning ([OrchVis, arXiv 2510.24937](https://arxiv.org/abs/2510.24937)), are the right one.

Parallelism has a measured price. Across 33,596 agent PRs in 2,807 repos, 79.4% overlapped in time with other agent PRs. Replaying 747 merges gave a **19.8% textual conflict rate between PRs from the same agent and 41.7% between different agents**, with 84.4% of conflicts in source files ([arXiv 2607.04697](https://arxiv.org/html/2607.04697v2)). This data predates 2026 and comes from public repos, not a single user's canvas. The paper's key observation still transfers: agents work "without knowledge that other agents … are simultaneously accessing and altering the same files." Worktrees solve write isolation. They do not solve the eventual merge. That is why Replit built a resolver agent and Cursor, Conductor and Factory built isolate-then-merge.

Cost is the third gap, and it is structural. Agentic coding tasks use **about 1,000x the tokens of simple chat reasoning** (a Stanford Digital Economy Lab figure, via [Fortune](https://fortune.com/2026/09/16/anthropic-merges-its-claude-chat-and-agentic-cowork-products-into-a-single-ai-assistant-as-part-of-a-push-to-build-an-ai-superapp/)). OpenAI's own researchers spend a **median of over $600 a day on tokens, and the 90th percentile over $7,000** ([Dataconomy](https://dataconomy.com/2026/09/07/openai-automated-research-intern/)). Microsoft moved agents to usage billing ([Fortune](https://fortune.com/2026/09/25/microsoft-unveils-copilot-super-app-targeting-business-users-with-ai-agents/)). The infrastructure survey found **no standard at all for agent budgets or caps**; current practice is "enforcing per-agent caps outside the agent loop" (infra notes, oversight section). terminal-canvas shipped exactly that in M350–M352. Main enforces each agent's own meter and caps, reads caps from the saved layout rather than from the renderer, and allows an agent or workflow to lower a cap but never raise one (`docs/build-log/m350-node-caps.md`, `docs/build-log/m351-agent-caps-record.md`, `docs/build-log/m352-cap-agent-verb.md`). This is the app's most defensible asset relative to the vendors, and the roadmap below builds heavily on it.

Supervising many agents from chat is the fourth gap. tldraw says the canvas "makes it so much easier to manage multiple agents working on one document at once, something that's incredibly difficult to do from chat" ([tldraw blog](https://tldraw.dev/blog/harnessing-the-agents)). The same post records a failure: browser-only agents with no filesystem or tools "were unable to do real work", so tldraw moved to **local agents with full tool access, with the canvas as the visualisation layer**. That is terminal-canvas's architecture. The landscape pass found **nobody marketing a spatial canvas as the primary surface for supervising and reviewing coding agents**. The positioning space is open.

## After the super app comes a control plane for budgeted, verifiable workers

The "beyond" research ranks the post-super-app paradigms by how much evidence supports them. One requirement recurs in almost all of them: **delegated authority with limits, durable execution off the device, inspectable artifacts and human escalation points**.

Ambient agents shipped as user-authored triggers. Claude Code Routines run on Anthropic's cloud from a schedule, an API call or a GitHub event, and they keep running when the laptop is off ([Claude Code docs](https://code.claude.com/docs/en/routines)). Unprompted proactivity failed: ChatGPT Pulse was reportedly folded back into scheduled tasks "because it was guessing what the user would want" ([Christine Zhu](https://christinezhu.substack.com/p/the-delegation-interface), secondary).

Self-improvement happens **in the harness, not the weights**. Skills are now an open format across Claude, Cursor, GitHub and Codex ([arXiv 2604.20087](https://arxiv.org/pdf/2604.20087)), and "harness continual learning" is an explicit research line ([arXiv 2608.19013](https://arxiv.org/pdf/2608.19013)).

Verification-first autonomy is real in mathematics. AlphaProof reached IMO silver ([Nature](https://www.nature.com/articles/s41586-025-09833-y)), and Rust-to-Lean pipelines are emerging for code ([arXiv 2605.30106](https://arxiv.org/pdf/2605.30106)). For general software, "provably correct agent output" is still a prototype. The lesson that transfers is the **generator-plus-independent-checker** shape. Self-grading is the weak spot, as critics noted about OpenAI's research-intern claim ([Gear Live](https://www.gearlive.com/news/article/openai-automated-research-intern-milestone)).

AI-run organisations exist as experiments. In phase two of Project Vend, negative-margin weeks were largely eliminated once **free-form judgment was replaced with a mandatory pricing procedure** and a supervising CEO agent was added. The agents remained "a mark" for adversarial staff ([Anthropic](https://www.anthropic.com/research/project-vend-2)). Procedures plus human escalation beat pure autonomy.

Agent payments and identity have shipped as plumbing:

- Stripe/Tempo's MPP launched March 18, 2026 ([Stripe](https://stripe.com/blog/machine-payments-protocol)).
- AP2 mandates prove that a user authorised a spend, with amount, category and expiry ([Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol)).
- A2A v1.0 has signed Agent Cards and more than 150 supporting organisations ([Linux Foundation](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year)).

Behaviour is the open problem, not the rails. Computer use cleared the human baseline on OSWorld-Verified: about 85–86% against 72.36% ([BenchLM](https://benchlm.ai/benchmarks/osworld-verified), aggregator). That makes "operate any app" a real fallback where no API exists.

The protocol layer that a desktop workspace would plug into has settled:

- **MCP 2026-07-28** went stateless. It added Multi Round-Trip Requests, where a server returns `input_required` with its questions, and moved Tasks into an extension with polling and subscriptions ([MCP blog](https://blog.modelcontextprotocol.io/posts/2026-07-28/)).
- **MCP Apps** renders a tool's UI in a sandboxed iframe, and tool calls started from that UI need host-managed approval ([MCP blog](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)).
- **ACP** is the de facto editor-to-agent standard, with a registry of more than 50 agents ([Zed](https://zed.dev/blog/acp-registry)).
- **Agent identity and delegated auth has no finished standard.** `draft-oauth-ai-agents-on-behalf-of-user` expired in February 2026 ([IETF](https://datatracker.ietf.org/doc/html/draft-oauth-ai-agents-on-behalf-of-user-02)), and multi-hop delegation is called unsolved ([WorkOS](https://workos.com/blog/oauth-multi-hop-delegation-ai-agents)).

Three HCI and runtime findings have direct design consequences:

- **The compaction cliff.** Claude Code's `/compact` kept **53% of safety rules after one round and 10% after five**. Type-aware compaction reached 96% recall ([arXiv 2608.22752](https://arxiv.org/abs/2608.22752)).
- **Sidekick.** Ambient cues during background execution, plus multimodal summaries when the user resumes, significantly improved multitasking with agents ([arXiv 2607.17527](https://arxiv.org/abs/2607.17527)). CanvasConvo's field study found that branching conversations on a spatial canvas support exploratory work ([arXiv 2605.15848](https://arxiv.org/abs/2605.15848)).
- **Agent as a CRDT peer.** Sim documented the production pattern: the agent diffs a private shadow replica and emits one minimal Yjs update, instead of overwriting text and wiping out concurrent human edits ([Sim](https://www.sim.ai/blog/agent-as-yjs-peer)).

Put together, "after the super app" looks like this. The work runs somewhere else, bounded by mandates and caps. It comes back as evidence, not prose. It escalates to a person through a queue. Past the input stage, the UI is mostly a supervision and review surface.

## Two forecasts disagree, and the roadmap should hold under both

The capability curve is steep but contested.

**METR's side.** METR's Time Horizon 1.1 (January 2026) puts the doubling time at **about 88.6 days since 2024**, with Claude Opus 4.5 at a 320-minute 50% horizon (CI 170–729) ([METR](https://metr.org/blog/2026-1-29-time-horizon-1-1/)). By mid-2026, readings put frontier models at 14–16 hours. METR itself says that "measurements above 16 hrs are unreliable with our current task suite" ([METR](https://metr.org/time-horizons/)), and the per-model figures come from secondary estimates. MIT Technology Review calls this "the most misunderstood graph in AI". A time horizon is the length of a *human* task the model succeeds at half the time. It is not how long an agent runs ([MIT TR](https://www.technologyreview.com/2026/02/05/1132254/this-is-the-most-misunderstood-graph-in-ai/)).

**The AI 2027 authors' side.** They have moved their own medians later. Kokotajlo now says "around 2030, lots of uncertainty", and Lifland says about 2035. They cite slow gains in agent reliability and enterprise deployment bottlenecks ([OfficeChai](https://officechai.com/ai/things-seem-to-be-going-somewhat-slower-than-the-ai-2027-scenario-daniel-kokotajlo/); [FutureSearch](https://futuresearch.ai/blog/ai-2027-6-months-later/)). Sequoia also expects AGI timelines to slip while adoption rises ([Sequoia](https://sequoiacap.com/article/ai-ascent-2026)). Lab leaders sit at the fast end: Amodei's "country of geniuses in a datacenter" within 1–2 years ([darioamodei.com](https://darioamodei.com/essay/the-adolescence-of-technology)), and OpenAI's automated AI researcher by March 2028 ([Engadget](https://www.engadget.com/2251859/openai-says-it-reached-its-goal-of-creating-an-automated-research-intern/)).

These views measure different things. METR measures benchmark task length. The AI 2027 authors weigh reliability and diffusion. **Both readings make human review throughput the binding constraint**. The fast reading gives more agent output per reviewer-hour. The slow reading gives unreliable output that needs checking. The proposals below are chosen to pay off either way. The Now horizon depends on neither forecast. The Beyond horizon hedges by setting trigger conditions rather than dates.

## Twelve implementations, ranked, in three horizons

The ranking weighs four things: leverage on the four named gaps (review, collisions, cost, supervision), reuse of existing seams, cost of being wrong, and distance ahead of the vendors. Every proposal must fit the product's rules:

- **Four doors**: every verb reaches a canvas gesture, a palette row, an agent line and a workflow node (`V9_DOORS`).
- **Inert imports**: anything imported starts no process until a person reviews it.
- **Outward gate**: everything that leaves passes `outward` and `redactSecrets`.
- **Main enforces**: caps and gates are enforced in main, the renderer only projects them, and an agent or workflow may only tighten a cap, never raise one.
- **Density layers**: at rest, a single state word; no dollar or token figures in headers, cards, the rail or the status bar.

Sizes are rough: S is under one milestone, M is 1–3 milestones, L is 4–8, XL is a run.

### Now (0–3 months): deepen the four assets nobody else has

**1. The hold becomes a decision, and a task gets a budget envelope.**

*Thesis.* Cost is unpredictable and structural: agentic tasks use 1,000x chat tokens ([Fortune](https://fortune.com/2026/09/16/anthropic-merges-its-claude-chat-and-agentic-cowork-products-into-a-single-ai-assistant-as-part-of-a-push-to-build-an-ai-superapp/)), and research-org spend reaches $600–$7,000 a day ([Dataconomy](https://dataconomy.com/2026/09/07/openai-automated-research-intern/)). The winning organisational pattern is escalation to a human, not free-running autonomy ([Project Vend](https://www.anthropic.com/research/project-vend-2)). No vendor product found in the notes exposes per-agent hard caps enforced outside the loop.

*What the user experiences.* An agent that crosses its cap lands in the Needs-you queue, grouped under its task, with two answers: "Allow $N more", which only a person may press, and "Stop". A task-level envelope splits one budget across its lanes. At rest the lane shows the single word "held". The spend-to-date and the forecast ("at this rate, 2 more turns") live in the inspector.

*Seams.* This completes M355, already proposed in `docs/build-log/m352-cap-agent-verb.md`. It builds on `src/renderer/shell/decision-inbox.ts`, `useDecisionInbox.ts`, `ApprovalDetail.tsx`, `src/main/approvals.ts`, `src/main/usage-accumulator.ts`, `src/shared/cost.ts` and `src/shared/pricing.ts`, the `cap-agent` verb in `src/shared/verb-table.ts`, and the M354 work on spend surviving a relaunch.

*Rules.* Main enforces. The raise door exists only for a person, so the agent and workflow doors can only offer "Stop" or a lower cap, following M352's precedent. Density: no dollar figures at rest.

*Size.* S–M.

*Falsified if* caps are rarely hit or users switch them off, or if subscription-billed CLIs leave "known cost" unknown for most lanes (backend-fit already tracks "known cost" as a capability, `src/shared/backend-fit.ts`). Measure hold frequency before building the forecast.

**2. The collision radar: predict conflicts across lanes before Combine.**

*Thesis.* Cross-agent merges conflict **41.7%** of the time, and agents do not know about each other's edits ([arXiv 2607.04697](https://arxiv.org/html/2607.04697v2)). Worktrees isolate writes but not the merge. Replit answers with a resolver agent ([Replit](https://replit.com/blog/introducing-agent-4-built-for-creativity)); nobody visualises the problem spatially before it happens.

*What the user experiences.* When two lanes touch the same file or hunk region, a thin edge appears between their objects on the canvas, and the Orchestrate dependency lens shows the overlap. A continuous trial merge (`git merge-tree`, which changes no worktree) turns the edge amber when the lanes would textually conflict. That is a contextual-layer cue. The file list and the conflicting hunks sit in the inspector. The verb "Sequence these" makes the second lane wait for the first to integrate.

*Seams.* `src/main/worktree-manager.ts`, `src/main/combine-runner.ts`, `src/main/lane-merge.ts`, `src/main/review-engine.ts`, the `git:status`/`review:across` channels, `src/renderer/orchestration/`, and handoff edges (`src/shared/handoff.ts`).

*Rules.* The radar is read-only and never auto-merges. "Integrate" keeps its witnessed-receipt invariant, "what landed is byte-for-byte what the check passed on" (`src/main/integrator.ts`). The sequencing verb goes through all four doors.

*Size.* M.

*Falsified if* real single-user canvases show collision rates in the low single digits (the study's population was public multi-agent repos), or if trial merges prove too slow on large repos. Log the rate for a month before building the sequencing verb.

**3. Review built on verification: show which checks cover each hunk, and measure caught errors.**

*Thesis.* Trace UIs raise confidence, not accuracy ([arXiv 2602.16844](https://arxiv.org/abs/2602.16844)). The trust/behaviour gap is 96% versus 48% ([Hyrax](https://hyrax.dev/blog/sonar-2026-ai-code-trust-behavior-gap)). Generator plus independent checker is the pattern that works ([beyond notes; Nature](https://www.nature.com/articles/s41586-025-09833-y)), and goal-level oversight beats per-step approval ([OrchVis](https://arxiv.org/abs/2510.24937)).

*What the user experiences.* Review opens on the diff hunks that **no check exercised**, not on the agent's summary. Each hunk shows which recorded check output touched it: a test that ran the changed lines, a build, or a lint. An independent reviewer lane (a different backend from the author where backend-fit allows) contributes findings as review comments, never as a verdict. The app logs locally, with no telemetry, which review surface a caught defect came from.

*Seams.* `src/main/check-output-store.ts`, `src/shared/check-evidence.ts`, `src/shared/review-readiness.ts`, `src/shared/review-comments.ts`, `src/main/task-evidence.ts`, `src/shared/backend-fit.ts`, and the M307 finished ≠ verified distinction.

*Rules.* Verified stays a fact derived from checks, never from agent prose; D18 says model text is not authoritative state (`docs/product-development-guide-2026-09-08.md`). Evidence export goes through `outward`. Density: the coverage map is inspector-level, and at rest the only state is "unverified" or "verified".

*Size.* M. Coverage mapping needs per-language test-to-line data, so start with changed-file granularity.

*Falsified if* caught-error rate, measured on seeded defects, does not beat the plain diff. The Microsoft result says this must be measured, not assumed.

**4. A rules channel that is never summarised.**

*Thesis.* Compaction silently drops constraints: 53% survive one round and 10% survive five ([arXiv 2608.22752](https://arxiv.org/abs/2608.22752)). terminal-canvas runs long-lived agents under supervisor briefs and teammate scopes, so it is exposed to exactly this failure.

*What the user experiences.* A teammate's brief, the project's hard rules and the task's no-push/no-outward constraints are stored as a typed rules set. After the app observes a compaction event in an agent's stream, it re-injects the set verbatim. The agent's inspector shows "rules: re-asserted after compaction ×3".

*Seams.* `src/main/agent-session-args.ts` (the appended system prompt, Claude only), `src/main/agent-session.ts` (stream parsing), `src/shared/teammates.ts`, `src/main/memory-store.ts` (add a `rule` kind beside `decided`/`tried`/`failed`/`note`), and `src/shared/backend-fit.ts`, which gains a "keeps rules" capability.

*Rules.* Rules pass `redactSecrets` like every memory write. The capability is declared per backend, and backends without it are refused honestly, not faked.

*Size.* S.

*Falsified if* the CLIs do not surface a compaction event in stream-json. Measure first, following the #80 discipline that "a row written from the help text alone would be a guess dressed as a fact" (`docs/ideas-backlog-closed.md`). It is also falsified if the vendors ship type-aware compaction themselves.

### Next (3–9 months): make the canvas legible to agents and reachable away from the desk

**5. The canvas as an MCP server over the verb table: local, stateless, with elicitation routed to the decision queue.**

*Thesis.* MCP 2026-07-28 is stateless. Its Multi Round-Trip Requests ("input required") and Tasks extension map directly onto an approval card and a long-running handle ([MCP blog](https://blog.modelcontextprotocol.io/posts/2026-07-28/)). tldraw found that letting agents act against the live editor beat discrete tool actions on reasoning, tokens and latency ([tldraw](https://tldraw.dev/blog/harnessing-the-agents)). a16z frames the shift as design becoming "agent-readable" ([a16z](https://a16z.com/newsletter/big-ideas-2026-part-1/)).

*What the user experiences.* Any agent running in a panel (Claude Code, Codex, a Gemini CLI) can query the canvas: "which lanes touch auth/?", "what's blocked?". It can also propose verbs such as "open a review of lane B" or "cap my sibling at $2". Destructive verbs come back as `input_required` and land in the Needs-you queue. Long jobs appear as MCP Tasks backed by the job journal.

*Seams.* `src/shared/verb-table.ts` (the `destructive` column), `src/main/control-server.ts`, `control-handler.ts` and `control-protocol.ts`, the `tc plan` executor, `src/shared/job-journal.ts`, and `src/main/approvals.ts`.

*Rules.* MCP is a second transport for the existing **agent-line door**, not a fifth door, so `verify:verbs closure.v9.1` still governs it. Agents may only tighten. The server is stdio or Unix socket only, because the control server's rule is "No network, ever: there is no `port` here." Every string returned goes through `outward`.

*Codebase tension.* Backlog #9 says not to "build a general plugin API before two concrete integrations exist", and D19 requires one small example extension first. The consumers already exist, since every supported engine is an MCP client, but exposure should start read-only.

*Size.* M–L.

*Falsified if* agents in panels use it no more than they already use `tc plan`.

**6. Fork an agent from step N as a visible branch, then pick the winner.**

*Thesis.* Checkpoint, rewind and fork are standard in runtimes (LangGraph checkpoints, [dev.to](https://dev.to/gabrielanhaia/time-travel-debugging-for-ai-agents-with-langgraphjs-checkpoints-42ie); Claude Code `/rewind`, [docs](https://code.claude.com/docs/en/checkpointing)). Branching on a spatial canvas is backed by field evidence ([CanvasConvo](https://arxiv.org/abs/2605.15848); [Orca](https://arxiv.org/pdf/2505.22831)). No agents-window product draws branches.

*What the user experiences.* The user drags off a transcript turn to spawn a sibling chat with a new worktree cut at that turn's commit and a changed instruction. Branches sit side by side joined by a fork edge. "Compare" runs the same checks on both, and Combine takes one branch or parts of each.

*Seams.* `src/main/agent-session.ts` (`--resume`), `src/main/worktree-manager.ts`, `src/shared/transcript.ts`, `src/main/combine-runner.ts`, `src/shared/handoff.ts`, and `src/shared/job-journal.ts`.

*Rules.* A fork is an authored object with undo and tiering. **A child's cap is at most the parent's remaining budget** (only tighten). Fork is a verb in all four doors.

*Size.* M–L.

*Falsified if* the CLIs cannot resume from a mid-transcript point (measure per backend and declare it in backend-fit), or if doubled cost outweighs the choice. Watch whether users actually pick between branches or just abandon them.

**7. Needs-you on the phone: read-only first, then the one write (backlog #40).**

*Thesis.* As agents move off the device, the UI becomes a review and approval surface (beyond notes; Routines run with the laptop off, [Claude Code docs](https://code.claude.com/docs/en/routines)). Ambient cues and resumption summaries beat modal interruption ([Sidekick](https://arxiv.org/abs/2607.17527)).

*What the user experiences.* A notification links to a list sorted by "wants me", showing held lanes, pending approvals and finished-but-unverified work, each with its return-briefing summary. Phase two, specified separately, adds approve or deny on a decision, and never on a raise-cap above a limit set on the desktop.

*Seams.* The decision queue (M308/M318/M329), `src/shared/return-briefing.ts`, `src/main/account-session.ts`, `src/main/presence/presence-hub.ts`, and `server/collab/`.

*Rules.* #40's own constraints apply: report from `Panel` facts, never from a buffer; "read-only is a design position"; the list, not the canvas, travels. Everything leaving passes `outward` (standing rule #31: terminal bytes are a disclosure surface). D20 requires explicit authorisation and audit for any remote write.

*Size.* M, plus the deploy blocker. The collab server is "built and checked (not deployed — no VM on this Mac)" (`docs/collab.md`).

*Falsified if* users do not leave their desks with agents running, or if the vendors' own mobile apps cover it for single-vendor users.

**8. Agents as honest CRDT peers: shadow-replica writes and authorship per character.**

*Thesis.* The Sim pattern is to diff a private shadow and emit one minimal update, with separate undo origins ([Sim](https://www.sim.ai/blog/agent-as-yjs-peer)). tldraw lets agents' state be communicated spatially ([tldraw](https://tldraw.dev/blog/harnessing-the-agents)).

*What the user experiences.* An agent editing a shared note, deck or file shows its own cursor in awareness. A person's Cmd+Z undoes only their own edits. Review can colour text by author, human or which agent, straight from the CRDT's client IDs.

*Seams.* `src/renderer/shared-text/`, `src/shared/canvas-doc.ts`, `src/shared/canvas-ops.ts`, `src/shared/presence.ts`, and M349's agents-as-roster-citizens.

*Rules.* Remote awareness stays untrusted input. D20 applies: "a collaborator's pointer or document edit must not silently run commands on another machine." Authorship data rides `outward` on export.

*Size.* M.

*Falsified if* the multiplayer stack never runs between two real machines (the run's blocker), or if code stays in worktrees and co-editing is limited to notes. In that case the value is narrow, and this drops below #9.

**9. A delegation chain on every action, exportable as OpenTelemetry GenAI spans.**

*Thesis.* Nadella's "governable by policy" is now launch messaging ([Fortune](https://fortune.com/2026/09/25/microsoft-unveils-copilot-super-app-targeting-business-users-with-ai-agents/)). Agent auth has no standard ([IETF](https://datatracker.ietf.org/doc/html/draft-oauth-ai-agents-on-behalf-of-user-02)), so the robust move is to hold credentials centrally and record the user → agent → tool chain explicitly. OTel's `invoke_agent`/`chat`/`execute_tool` spans are the de facto trace shape, though still experimental ([OTel](https://opentelemetry.io/docs/specs/semconv/gen-ai/)).

*What the user experiences.* The inspector of any action answers "who authorised this, through which teammate scope, which agent, which tool, under which cap". A team lead can export the ledger to Datadog or Honeycomb.

*Seams.* `src/main/broker-audit.ts`, `src/main/run-ledger.ts`, `src/shared/teammates.ts`, `src/main/credential-store.ts`, and `src/shared/outward.ts`.

*Rules.* Spans carry text, so every attribute is scrubbed field by field with a count. There is no `credential:get`. Pin the semconv version.

*Size.* M.

*Falsified if* no team customer asks for it within two quarters. It is enterprise hygiene, not differentiation, and ranks accordingly.

### Beyond (9–24 months): take work off the device, with triggers instead of dates

**10. Skills learned from accepted work, promoted only through a replayed check.**

*Thesis.* Self-improvement happens in the harness, and skills are an open format ([arXiv 2604.20087](https://arxiv.org/pdf/2604.20087); [arXiv 2608.19013](https://arxiv.org/pdf/2608.19013)). The unit must be an inspectable artifact.

*What the user experiences.* After an accepted task, the app proposes a skill or memory entry distilled from what worked, and what failed goes in as a `tried`/`failed` memory. The proposal arrives as a draft marked `reviewed: false`. It is promoted only if re-running the task's recorded checks with the skill loaded passes at least as well.

*Seams.* `src/main/skill-write.ts`, `src/shared/skills.ts`, `src/main/memory-store.ts`, `src/shared/retained-outcomes.ts`, `src/shared/draft-review.ts`, `src/shared/recipes.ts`, and `src/main/check-output-store.ts`.

*Rules.* Inert until reviewed. `redactSecrets` on every write. D18: never apply a skill automatically.

*Size.* M–L.

*Falsified if* promoted skills do not lift check pass rates. The notes found **little data on whether auto-generated skills help rather than hurt**, which is why the eval gate is the feature.

**11. Lanes that keep working with the laptop closed: relay VM plus a microVM per task.**

*Thesis.* Durable, off-device execution is the common thread of every post-super-app paradigm (beyond notes). Apple `container` 1.0 gives each container its own micro-VM on macOS ([Cloud Native Now](https://cloudnativenow.com/features/apple-ships-stable-1-0-of-its-native-container-tool-for-macos/)). Durable execution avoids repeated side effects on restart ([Zylos](https://zylos.ai/research/2026-04-27-durable-execution-agent-runtimes/)).

*What the user experiences.* "Continue off-device" moves a lane to the team's relay VM, or keeps it local in a microVM, which finally answers the README's admission that "a worktree … is not a sandbox: every agent runs as your user". The canvas object stays and shows "remote" at rest. Caps travel with the lane as a lease.

*Seams.* `server/relay/`, `src/shared/relay-protocol.ts` (program allowlist, 1 MB replay ring), `src/main/relay/relay-client.ts`, `src/shared/job-journal.ts`, `src/main/job-recovery.ts`, `src/main/sandbox.ts`, and `src/shared/routines.ts`, whose `ROUTINE_LIMIT_WORD` "runs while the app is open" would finally change.

*Rules.* The hard problem is that **main enforces caps and main is on the laptop**. An off-device lane needs a server-side enforcer that holds only a lease issued by main, which can only shrink. Credentials must still never enter the VM's environment; broker calls go back through main or stay refused.

*Codebase tension.* The 2026-09-14 review lists "cloud workers" as a separate investment, and the 2026-09-20 audit makes signing and notarisation P0 ahead of anything remote (`docs/canvas-opportunity-audit-2026-09-20.md`).

*Size.* XL.

*Trigger.* Start when relay and collab are deployed and a signed build exists.

*Falsified if* vendor cloud routines satisfy users who are single-vendor anyway.

**12. Paid calls through the spend card, as mandates (watch, don't build yet).**

*Thesis.* MPP, x402 and AP2 are live rails ([Stripe](https://stripe.com/blog/machine-payments-protocol); [Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol)). The weak link is agent judgment ([Project Vend](https://www.anthropic.com/research/project-vend-2)).

*What the user experiences.* An agent that needs a paid API raises a spend card in the queue carrying an AP2-shaped mandate (amount, category, expiry). The person signs it, and the broker settles it.

*Seams.* `src/main/broker.ts` (the M102 spend card), per-agent caps, and the decision queue.

*Rules.* Routines are told never to "pay" (`src/shared/routines.ts`). A person raises; an agent only lowers.

*Size.* L.

*Codebase tension.* The notes found **no seam and no backlog entry** for payments, and the customer-free-abstraction rule applies.

*Trigger.* Build only when a concrete paid service the user already needs speaks MPP or x402.

### What not to build

**More artifact kinds or an office suite.** Claude Docs/Slides and ChatGPT Work already own deliverables. The internal review said explicitly: "Do not spend the next cycle expanding artifact types or building a general-purpose office suite" (`docs/product-review-and-roadmap-2026-09-14.md`).

**A general plugin API or extension registry before a concrete consumer.** Backlog #9 and D19 forbid it.

**Hosting ACP file-system and terminal requests.** The measured decline of #81 stands until an agent actually asks for `fs/read_text_file`. Terminal hosting "needs its own design" because of the two-lifetimes rule.

**A cursor-agent or other engine row written from help text** (#80). Record a real stream first. The half-day recipe exists.

**A proactive suggestion feed.** Pulse's reported fate says guessing fails, while triggers plus an inbox work ([Christine Zhu](https://christinezhu.substack.com/p/the-delegation-interface)).

**Generated-per-query ephemeral UI.** Google owns that at consumer scale ([Google Research](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)). It also conflicts with the authored-object rule.

**Richer narration or trace theatre** that raises confidence without accuracy ([arXiv 2602.16844](https://arxiv.org/abs/2602.16844)).

**A2A federation or agent-to-agent negotiation** until there is a remote enterprise agent to talk to.

**An "Ultra"-style race for parallel-agent counts.** The collision data says more lanes means more merges to review, not more finished work.

**Anything remote before signing, notarisation and one real two-machine run.** Those are the P0/P1 gates the app's own audit names.

## Conclusion

The super app settled the question of **where** agents run for single-vendor users: inside each vendor's own merged app. It left open **how a person stays in control** of many of them across vendors. The notes converge on four gaps: review throughput, cross-agent collisions, cost predictability, and supervision at scale. Each already has a partial, main-enforced answer in terminal-canvas that no vendor product in the notes matches: caps enforced outside the loop, witnessed integration receipts, a task-grouped decision queue, and agents as roster peers.

The strategic risk is not falling behind on features. It is spending the next cycle on breadth the vendors will always out-ship, or on remote infrastructure before the app can be signed and run between two machines. The bet that stays several steps ahead under both the fast METR reading and the slower AI 2027 revision is to make **the canvas the cheapest place in the industry to verify, sequence and budget agent work**. The Now horizon does that on seams already built. Items 1, 2 and 4 each begin with a measurement (hold frequency, the local collision rate, the compaction event), and that measurement is what would falsify them. Item 3 carries its falsifier in its own caught-error metric.
