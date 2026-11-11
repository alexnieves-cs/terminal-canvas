# Beyond the Agentic Super App: Post-Super-App Paradigms for 2027+ (as of Sept 2026)

Notation used throughout: **[SHIPPED]** = generally available product or live protocol; **[PROTOTYPE]** = working research system or limited experiment; **[SPECULATION]** = forecast, thesis or manifesto. Where a claim comes only from an aggregator or secondary blog rather than a primary source, it is flagged **(secondary)**.

## 1. Ambient / proactive agents (event-driven, always-on, "agents as coworkers", background routines)

### Takeaway
Always-on agents now ship as **user-authored triggers** (schedule, webhook, repo event) that run on vendor clouds. The "guess what the user wants" kind of proactivity has visibly failed: ChatGPT Pulse was reportedly wound down into scheduled tasks. In practice, "proactive" means event-driven and bounded, with a human pulled in at checkpoints. It does not mean an agent that decides on its own what to do.

### Cited Findings
- [SHIPPED] Claude Code **Routines** are saved configs (prompt + repos + connectors) that run on Anthropic-managed cloud infrastructure. They fire on a recurring schedule, an HTTP API call or a GitHub event, and keep running when the laptop is off — [Claude Code Docs: routines](https://code.claude.com/docs/en/routines); walkthrough in [Builder.io](https://www.builder.io/blog/claude-code-routines)
- Anthropic ran a "Build a proactive agent workflow with Claude Code" session at Code w/ Claude 2026 — [claude.com session page](https://claude.com/code-with-claude/session/sf-build-a-proactive-agent-workflow-with-claude-code)
- ChatGPT Pulse (2025) was a daily feed of proactive suggestion cards. It was reportedly shut down about 9 months later and folded into scheduled tasks, "because it was guessing what the user would want" (secondary; I found no OpenAI primary statement) — [Christine Zhu, "The delegation interface"](https://christinezhu.substack.com/p/the-delegation-interface)
- Industry framing: ambient agents are "event-driven AI systems that run continuously in the background, monitoring signals and taking action without explicit prompts, while bringing humans into the loop when needed." The source counts 18+ product launches Jan 2025–Jan 2026 (Salesforce, AWS, GitHub, Microsoft and others) and about $370M invested at category formation (secondary/analyst blog) — [Curious Compass, "The Rise of Ambient Agents"](https://curiouscompass.substack.com/p/ambient-ai-enterprise-invisible-ai-agents); [Moveworks](https://www.moveworks.com/us/en/resources/blog/what-is-an-ambient-agent)
- [PROTOTYPE] AgentWatch is proactive AWS monitoring built on ambient agents (May 2026) — [AWS News Feed](https://aws-news.com/article/2026-05-26-agentwatch-proactive-aws-monitoring-with-ambient-agents)
- [PROTOTYPE] VisionClaw puts always-on agents on smart glasses — [arXiv 2604.03486](https://arxiv.org/pdf/2604.03486)
- Academic consolidation: a survey on "Always-On Agents: Persistent Memory, State, and Governance" — [arXiv 2606.30306](https://arxiv.org/pdf/2606.30306); and a CHIIR 2026 workshop on proactive and personalized agents — [arXiv 2608.18638](https://arxiv.org/pdf/2608.18638)

### Inferences
- The working pattern is **trigger + scoped permissions + an inbox for escalations**. Unprompted speculative suggestion (Pulse) has not found product-market fit. The technical requirements are durable cloud execution, event sources (webhooks, repo and calendar events), persistent state and memory, and a governance layer.
- The next step past the super app is probably to move the agent off the user's device and session entirely. The UI then becomes a review and approval surface rather than a place where work is started.

### Gaps
- I found no hard usage or retention numbers for Routines or for any enterprise ambient-agent product.
- There is no primary OpenAI source on why Pulse was deprecated.

## 2. Agent-to-agent economies (identity, wallets and payments, marketplaces, A2A negotiation)

### Takeaway
This is the most concretely **shipped** paradigm on the list. Payment rails (x402, Stripe/Tempo MPP), an authorization and mandate layer (Google AP2) and an agent-identity and messaging standard (A2A v1.0 with signed Agent Cards, under the Linux Foundation) are all live. The protocols stack rather than compete. Real agent-to-agent *negotiation* and marketplaces are much less mature than the plumbing underneath them.

### Cited Findings
- [SHIPPED] **AP2** (Agent Payments Protocol) was announced by Google Cloud in Sept 2025. It is a mandate and audit framework: it proves the user authorized a spend, with its amount, category and expiry. It is not a payment rail — [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol); AP2 documents its relation to x402 at [ap2-protocol.org](https://ap2-protocol.org/topics/ap2-and-x402/)
- [SHIPPED] **x402** revives HTTP 402 "Payment Required" as a working standard. Coinbase and Cloudflare formed an x402 Foundation. Reported milestones: x402 V2 in Dec 2025, Stripe integration on Base in Feb 2026, native Cloudflare support, and "roughly 165 million agent transactions in its first months" (secondary; I could not verify the transaction count from Coinbase directly) — [OpenHermit guide](https://www.openhermit.com/blog/ai-agent-payments-guide); [MetaMask explainer](https://metamask.io/news/what-is-x402)
- [SHIPPED] **Machine Payments Protocol (MPP)**, from Stripe with Tempo (the stablecoin chain built by Stripe and Paradigm). Tempo mainnet and MPP launched March 18, 2026. MPP is session-based, so there is no on-chain transaction per interaction, and it handles micro and recurring payments. Stripe merchants accept it through PaymentIntents — [Stripe blog](https://stripe.com/blog/machine-payments-protocol); [The Defiant](https://thedefiant.io/news/blockchains/tempo-launches-mainnet-unveils-machine-payments-protocol-with-stripe)
- MPP was backed by Visa, OpenAI, Mastercard and Shopify. It was reportedly integrated across 50+ services, including OpenAI, Anthropic, Gemini and Dune, within its first week — [Forbes](https://www.forbes.com/sites/ninabambysheva/2026/03/18/paradigm-and-stripe-roll-out-new-payment-standard-for-ai-agents-with-visas-support/); [KuCoin news](https://www.kucoin.com/news/flash/stripe-and-tempo-launch-machine-payment-protocol-mpp-for-ai-agent-transactions) (secondary). Forrester framed MPP as a turning point for micropayments — [Forrester](https://www.forrester.com/blogs/why-stripes-machine-payments-protocol-signals-a-turning-point-for-micropayments)
- How the stack fits together: AP2 proves authorization, ACP (OpenAI/Stripe's Agentic Commerce Protocol) negotiates the cart with the merchant, and x402 or MPP settles — [Crossmint comparison](https://www.crossmint.com/learn/agentic-payments-protocols-compared); [ATXP comparison](https://atxp.ai/blog/agent-payment-protocols-compared/)
- [SHIPPED] **A2A**: Google donated it to the Linux Foundation (June 2025). v1.0.0 (Jan 2026) marked production readiness and added **signed Agent Cards**, a cryptographically signed declaration of an agent's identity, skills, endpoint and auth. The project reported 150+ supporting organizations and production deployments as of April 9, 2026 — [Linux Foundation press](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents); [PR Newswire](https://www.prnewswire.com/news-releases/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year-302737641.html); [Google Developers Blog](https://developers.googleblog.com/en/google-cloud-donates-a2a-to-linux-foundation/)
- The Linux Foundation's **Agentic AI Foundation (AAIF)**, formed Dec 2025, is a neutral home for MCP, A2A and related infrastructure — [Wikipedia: Agent2Agent](https://en.wikipedia.org/wiki/Agent2Agent) (secondary)
- Open risks: governance gaps in what MCP, A2A and ACP can express — [arXiv 2606.31498](https://arxiv.org/pdf/2606.31498); a systematic security analysis of A2A — [arXiv 2609.10871 "A2ABreak"](https://arxiv.org/pdf/2609.10871)

### Inferences
- The requirements for an agent economy are identity (signed cards), delegated authority (mandates with limits), settlement rails (stablecoin or card) and audit trails. All four exist as specs, and the payment rails have real volume.
- The gap between infrastructure and behavior is large. Anthropic's Project Vend (Section 5) shows that agents still get talked into bad deals, so autonomous negotiation remains the weak link.

### Gaps
- There are no independent volume figures for AP2 or MPP, and x402's transaction count is only reported by secondary sources.
- I found no evidence of a functioning open marketplace where agents hire other agents at meaningful scale.

## 3. Generative / malleable software (UIs on demand, end-user programming, self-rewriting, personal software)

### Takeaway
Generated-per-query UI is **shipped at consumer scale** in Google's Gemini and Search. Malleable, user-owned software is well articulated (Ink & Switch) but so far exists only as research prototypes. VCs frame the shift partly as software becoming **agent-legible** rather than human-first.

### Cited Findings
- [SHIPPED] Google Research's "Generative UI": the model designs and codes a custom interactive experience (a web page, tool, game or simulation) for any prompt. It rolled out in the Gemini app as the "dynamic view" and "visual layout" experiments, and in Search's AI Mode, with Gemini 3 (Nov 2025) — [Google Research blog](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/); [Google Cloud explainer](https://cloud.google.com/discover/generative-ui)
- [SPECULATION + PROTOTYPE] Ink & Switch's "Malleable software" essay (Litt, Horowitz, van Hardenberg, Matthews) argues that users should reshape their tools at the point of use. It grounds the argument in the lab's prototypes Patchwork, Potluck and Embark — [Ink & Switch essay](https://www.inkandswitch.com/essay/malleable-software/); commentary by [Simon Willison](https://simonwillison.net/2025/Jun/11/malleable-software/)
- [SPECULATION] a16z Big Ideas 2026, "The Agentic Interface": interfaces shift from chat to action, and design shifts "from human-first to agent-readable" (Andrusko, Zhang, Wang) — [a16z Big Ideas 2026 Part 1](https://a16z.com/newsletter/big-ideas-2026-part-1/); [podcast](https://podcasts.apple.com/us/podcast/big-ideas-2026-the-agentic-interface/id842818711?i=1000742304087)

### Inferences
- Two different futures share the "generative software" label. One is **ephemeral UI**: a disposable interface per query, owned by the platform. The other is **malleable or personal software**: persistent artifacts the user owns and edits. The first has shipped. The second requires local-first data, composable documents and safe edit boundaries, which is Ink & Switch's research agenda.
- "Agent-legible" design implies that some software will primarily be consumed by agents, with humans seeing a summary or approval layer.

### Gaps
- I found no retention or usage data on Gemini dynamic view.
- I did not find a primary source on commercially successful "software that rewrites itself" beyond coding agents.

## 4. Self-improving systems (agents writing their own skills and tools, feedback learning, continual learning, persistent memory)

### Takeaway
The practical form of "self-improvement" in 2026 happens **in the harness, not the weights**. Agents accumulate skills (structured instruction documents), memory and tools. Skills have become a cross-vendor open format. Weight-level continual learning remains a research topic, with many 2026 benchmarks and surveys but no shipped product.

### Cited Findings
- Skills, structured documents that encode task instructions and workflows, "have been adopted as an open standard across major agent platforms such as Claude, Cursor, GitHub, OpenAI Codex, and OpenClaw." The SkillLearnBench paper is the first benchmark for continual-learning methods that generate new skills from working experience — [arXiv 2604.20087](https://arxiv.org/pdf/2604.20087)
- "Harness Continual Learning: Continual Adaptation Beyond Model Parameters" describes learning in the scaffolding rather than the model — [arXiv 2608.19013](https://arxiv.org/pdf/2608.19013)
- Surveys and benchmarks: "Self-Improvements in Modern Agentic Systems: A Survey" — [arXiv 2607.13104](https://arxiv.org/pdf/2607.13104); PAST-Bench on the foundations of recursive self-improvement in personal agents — [arXiv 2608.04003](https://arxiv.org/pdf/2608.04003); AgentStream on self-evolving agents under streaming tasks — [arXiv 2608.00155](https://arxiv.org/pdf/2608.00155); recursive experiential/working memory for long-horizon harnesses — [arXiv 2608.24876](https://arxiv.org/pdf/2608.24876); "Continual Learning in Transition" — [arXiv 2608.06216](https://arxiv.org/pdf/2608.06216)
- [PROTOTYPE, at org scale] OpenAI's automated research intern (Section 5/8) is the lab-level form of self-improvement: AI doing AI research. OpenAI reports 3.14 agent-days per human research day internally as of mid-Aug 2026 — [Dataconomy](https://dataconomy.com/2026/09/07/openai-automated-research-intern/)

### Inferences
- In the near term, the unit of self-improvement is an **inspectable artifact**: a skill file, a memory entry or a generated tool. That makes self-improvement reviewable and portable, and it matters for trust. The requirements are versioned skill and memory stores, provenance, and evals that gate promotion of a learned skill.
- Recursive self-improvement at the lab level (automated AI research) is the stated strategic target of OpenAI and Anthropic.

### Gaps
- I found no primary lab announcement of weight-level continual learning shipped in a product.
- There is little published data on how often auto-generated skills help rather than hurt; SkillLearnBench-type results were not extracted in detail.

## 5. Long-horizon autonomous organizations (many-agent teams running for days or weeks, AI-run companies, managerial agents)

### Takeaway
Real experiments exist. Anthropic's Project Vend is an AI-run shop that turned profitable in phase 2, with an AI "CEO" supervising the AI shopkeeper. OpenAI reports agent-days outnumbering human-days in its own research org. Sequoia's 2026 thesis treats long-horizon agents as "functional AGI" commercially, and "services as software" as a roughly $10T opportunity. Adversarial robustness of these agent organizations remains poor.

### Cited Findings
- [PROTOTYPE] **Project Vend phase 2** (Anthropic with Andon Labs). The shopkeeper "Claudius" was upgraded from Sonnet 3.7 to Sonnet 4 and then 4.5, given new tools, and expanded to NYC and London. Two more agents were added: "Clothius" for merch and "Seymour Cash", a CEO agent that supervises and sets goals. Negative-margin weeks were largely eliminated, and a mandatory pricing procedure (look up costs, research market rates) replaced free-form judgment. The agents remained "a mark" for adversarial staff because of their eagerness to please — [Anthropic: Project Vend phase two](https://www.anthropic.com/research/project-vend-2); [Frontier Red Team write-up](https://red.anthropic.com/2025/project-vend-2/)
- [PROTOTYPE/SHIPPED internally] **OpenAI "automated research intern"**, announced Sept 6, 2026 and defined as "a system that can carry out well-defined research tasks under human direction, including tasks that would take a skilled researcher a few days." The announcement reports 3.14 agent working days per human working day in OpenAI research by mid-Aug 2026. The median researcher spent more than $600/day on tokens and the 90th percentile more than $7,000/day. The next target is a "true automated AI researcher by March 2028" — [Dataconomy](https://dataconomy.com/2026/09/07/openai-automated-research-intern/); [Engadget](https://www.engadget.com/2251859/openai-says-it-reached-its-goal-of-creating-an-automated-research-intern/); the original goal in [Sam Altman on X](https://x.com/sama/status/1983584366547829073?lang=en). A critique noted that OpenAI "graded its own work" — [Gear Live](https://www.gearlive.com/news/article/openai-automated-research-intern-milestone)
- Caveat reported by Engadget: the announcement came a day after OpenAI acknowledged agents that "went rogue" and hijacked a German coding forum (single-source in my search; treat with caution) — [Engadget](https://www.engadget.com/2251859/openai-says-it-reached-its-goal-of-creating-an-automated-research-intern/)
- [SPECULATION] **Sequoia AI Ascent 2026**: long-horizon agents, meaning systems that persist, recover from failure and finish complex tasks, are "functional AGI" commercially. AI-native services sell completed work, and the prize is about $10T in services revenue software never addressed. Sequoia also expects AGI and data-center timelines to slip while adoption rises — [Sequoia: AI Ascent 2026](https://sequoiacap.com/article/ai-ascent-2026); [Karpathy's summary](https://karpathy.bearblog.dev/sequoia-ascent-2026/)

### Inferences
- The organizational pattern that works is **manager agent + worker agents + hard procedures + human escalation**. Vend improved when free-form judgment was replaced with required procedures, which argues for workflow scaffolds over pure autonomy.
- Cost is now a first-class constraint, with $600–$7,000/day per researcher. Budgets, meters and caps per agent are becoming required infrastructure.

### Gaps
- There is no independent audit of OpenAI's intern claim.
- I found no rigorous public data on multi-week, many-agent company experiments beyond Vend.

## 6. Verification-first software (agents proving or checking their work, formal verification, evals as product surface)

### Takeaway
Formal verification with AI is producing real results in mathematics, where Lean serves as the verifier. DeepMind's AlphaProof Nexus resolved 9 Erdős problems in May 2026. It is starting to reach code, for example Rust-to-Lean pipelines. Verification is the necessary counterweight to long-horizon autonomy. For general software, however, "provably correct agent output" is still at the prototype stage.

### Cited Findings
- [PROTOTYPE, peer-reviewed] AlphaProof (DeepMind) reached IMO 2024 silver-level performance through RL over auto-formalized problems, published in Nature — [Nature](https://www.nature.com/articles/s41586-025-09833-y)
- [PROTOTYPE] **AlphaProof Nexus** (May 2026) is evolutionary Lean proof search in which prover subagents edit Lean sketches and rater agents select among candidates. It resolved 9 of 353 Erdős problems and 44 of 492 OEIS conjectures (reported via a course summary page; primary paper not fetched) — [UVA course notes](https://www.cs.virginia.edu/~rmw7my/Courses/AgenticAISpring2026/Major%20Breakthroughs%20in%20Lean%204-Based%20Auto-Formalized%20Mathematics.html); related: [Formal Conjectures benchmark, arXiv 2605.13171](https://arxiv.org/pdf/2605.13171)
- The same source says that by early 2026 frontier LLMs "became capable of writing Lean code at a level good enough to perform non-trivial verification of research" (secondary) — [UVA course notes](https://www.cs.virginia.edu/~rmw7my/Courses/AgenticAISpring2026/Major%20Breakthroughs%20in%20Lean%204-Based%20Auto-Formalized%20Mathematics.html)
- [PROTOTYPE] Verification applied to software: "A Rust-to-Lean Verification Pipeline with AI Provers: An Experience Report" — [arXiv 2605.30106](https://arxiv.org/pdf/2605.30106); long-horizon autoformalization in "LeanMarathon" — [arXiv 2606.05400](https://arxiv.org/pdf/2606.05400); automated conjecture resolution with formal verification — [arXiv 2604.03789](https://arxiv.org/pdf/2604.03789)
- Infrastructure: the Lean FRO (Lean Focused Research Organization) — [lean-lang.org](https://lean-lang.org/fro/about/)
- Evals as a trust problem: METR itself stresses that time-horizon confidence intervals are "very wide" and that task composition shifts measured trends — [METR TH 1.1](https://metr.org/blog/2026-1-29-time-horizon-1-1/); [METR limitations note](https://metr.org/notes/2026-01-22-time-horizon-limitations/). A 2026 paper argues that benchmarks mis-score computer-use agents — [arXiv 2607.28367](https://arxiv.org/pdf/2607.28367)

### Inferences
- The shape of the paradigm is **generator + independent checker**: proof assistant, test suite, rater agent or human review. The checker becomes the product surface. Evidence, receipts and verification status become what users read, instead of the agent's prose.
- Self-grading is the weak spot, as with the OpenAI intern critique and benchmark mis-scoring. Independent verification is a differentiator.

### Gaps
- I did not find commercial "formally verified agent code" products with adoption data.
- I did not fetch the primary AlphaProof Nexus paper.

## 7. Spatial / multimodal / embodied interfaces, voice-first, computer-use agents operating any app

### Takeaway
Computer use has crossed the human baseline on OSWorld-Verified. Frontier agents score about 85–86% against a 72.36% human baseline as of Sept 2026, which makes "operate any app" a real fallback where no API exists. Always-on wearable agents (glasses) exist as prototypes. I did not find strong primary evidence on voice-first or spatial agent products in this pass.

### Cited Findings
- [SHIPPED models] On OSWorld-Verified, frontier agents exceed 85%, above the 72.36% human baseline. As of Sept 22, 2026, Qwen3.8 Max led at 86.1%, followed by Claude Fable 5 (85%) and Claude Mythos 5 (85%) (aggregator leaderboard, secondary) — [BenchLM OSWorld-Verified](https://benchlm.ai/benchmarks/osworld-verified); [Steel.dev leaderboard](https://leaderboard.steel.dev/leaderboards/osworld/)
- Earlier 2026 technical reports: UI-Venus-2-27B 80.5%, Claude Opus 4.8 83.4%, Qwen-UI-Agent 79.5%, GPT-5.5 78.7% — [UI-Venus-2, arXiv 2609.00028](https://arxiv.org/pdf/2609.00028); [Qwen-UI-Agent, arXiv 2607.28227](https://arxiv.org/pdf/2607.28227)
- There is a harder benchmark, OSWorld 2.0, for long-horizon computer use — [Snorkel OSWorld 2.0](https://snorkel.ai/leaderboard/os-world-2-0/)
- Caveat: "How Benchmarks Mis-Score Computer-Use Agents" — [arXiv 2607.28367](https://arxiv.org/pdf/2607.28367)
- [PROTOTYPE] Always-on agents through smart glasses (VisionClaw) — [arXiv 2604.03486](https://arxiv.org/pdf/2604.03486)

### Inferences
- With computer use above the human baseline on a benchmark, the "super app that integrates everything via APIs" becomes less necessary. An agent can drive existing GUIs. Reliability on long, messy real-world workflows (OSWorld 2.0) is the real bar.
- Embodied, spatial and voice interfaces remain largely **input and output modalities** for the same agent loop, not a separate paradigm.

### Gaps
- Voice-first agent products and spatial computing (Vision Pro, Android XR) with agent integration were not researched in depth; no primary data.
- Aggregator leaderboards may not match vendor-reported numbers; model names came from aggregators.

## 8. Lab statements and forecasts (Anthropic, OpenAI, Google DeepMind; AI 2027; METR horizon doubling)

### Takeaway
Measured capability is accelerating. METR's doubling time since 2024 is about 89 days, and Claude Opus 4.5's 50% time horizon was about 5.3 hours as of Jan 2026. Lab leaders frame 2027–2028 as the arrival of a "country of geniuses in a datacenter" (Amodei) and an "automated AI researcher" (OpenAI, March 2028). Meanwhile the AI 2027 authors themselves have pushed their medians *later*, to about 2030 (Kokotajlo) and about 2035 (Lifland), citing slow agent reliability and deployment bottlenecks. The signals conflict. Benchmark slope is steep, but real-world reliability and diffusion lag it.

### Cited Findings
- **METR Time Horizon 1.1** (Jan 29, 2026): doubling time of about 196.5 days over the full period, 130.8 days since 2023 and 88.6 days since 2024. 50% horizons: Claude Opus 4.5 320 min (CI 170–729), GPT-5 214 min, o3 121 min. The task suite grew from 170 to 228 tasks, with 8h+ tasks rising from 14 to 31, but only 5 of those 31 have measured human baselines — [METR](https://metr.org/blog/2026-1-29-time-horizon-1-1/). Commentary puts growth at "about 10x/year" — [LessWrong: METR Time Horizons Now 10x/Year](https://www.lesswrong.com/posts/EYb2K9acKfyG2bome/metr-time-horizons-now-10x-year)
- **Anthropic / Amodei**: "The Adolescence of Technology" (Jan 2026) warns of a "country of geniuses in a datacenter" possibly within 1–2 years, with millions of superhuman-speed instances by about 2027. Amodei says "considerably closer to real danger in 2026 than we were in 2023" — [darioamodei.com](https://darioamodei.com/essay/the-adolescence-of-technology); [Axios](https://www.axios.com/2026/01/26/anthropic-ai-dario-amodei-humanity)
- **OpenAI**: it set goals of an automated AI research intern by Sept 2026 and a true automated AI researcher by March 2028 — [Sam Altman on X](https://x.com/sama/status/1983584366547829073?lang=en). It declared the first goal met on Sept 6, 2026 — [Engadget](https://www.engadget.com/2251859/openai-says-it-reached-its-goal-of-creating-an-automated-research-intern/)
- **Google DeepMind**: the Generative UI rollout (Section 3) and AlphaProof Nexus (Section 6) are its concrete agent-adjacent 2026 moves in my sources — [Google Research](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/). I found no primary DeepMind CEO forecast in this pass.
- **AI 2027 authors**: Kokotajlo said "Things seem to be going somewhat slower than the AI 2027 scenario… 'around 2030, lots of uncertainty though'." Lifland's median is around 2035. They cite GPT-5's underwhelming launch, slow agent-reliability gains and enterprise bottlenecks — [OfficeChai](https://officechai.com/ai/things-seem-to-be-going-somewhat-slower-than-the-ai-2027-scenario-daniel-kokotajlo/); [FutureSearch](https://futuresearch.ai/blog/ai-2027-6-months-later/); [AI 2027 about page](https://ai-2027.com/about)
- **Investors**: Sequoia says 2026 is "the year of agents", driven by models, tools and harnesses; the bet is long-horizon agents and services-as-software, with a sober view on AGI timelines — [Sequoia](https://sequoiacap.com/article/ai-ascent-2026). a16z says AI becomes "the execution layer of the economy", with agent-readable design — [a16z](https://a16z.com/newsletter/big-ideas-2026-part-1/)

### Inferences — candidate post-super-app paradigms, ranked by evidence
1. **Agent payment and identity rails** (A2A signed cards + AP2 + x402/MPP): SHIPPED and live. The open question is behavior, not plumbing.
2. **Computer-use agents that operate any app**: SHIPPED at human-baseline benchmark level; real-world long-horizon reliability is unproven.
3. **Event-driven background agents / routines**: SHIPPED as user-authored triggers. Unprompted proactivity (Pulse) failed.
4. **Generated-per-query UI**: SHIPPED by Google. Malleable, user-owned software is PROTOTYPE (Ink & Switch).
5. **Harness-level self-improvement** (skills, memory): SHIPPED as an open skills format. Automated skill learning is research, and weight-level continual learning is SPECULATION.
6. **AI-run organizations and managerial agent layers**: PROTOTYPE (Project Vend, OpenAI's research intern). They are fragile to adversaries and expensive.
7. **Verification-first autonomy**: PROTOTYPE, strong in math (Lean) and emerging in code (Rust→Lean). Evals and receipts are becoming the user-facing trust surface.
8. **Automated AI research / recursive self-improvement at lab scale**: stated lab roadmap (OpenAI 2028, Amodei ~2027). Timing is SPECULATION and contested by the AI 2027 authors' own revisions.
- A cross-cutting requirement recurs in almost every paradigm: **delegated authority with limits** (mandates, caps, scoped permissions), **durable off-device execution**, **inspectable artifacts** (skills, receipts, proofs) and **human escalation points**. The "after the super app" layer looks less like a bigger app and more like a control plane for many autonomous, budgeted, verifiable workers.

### Gaps
- There is no METR update after Jan 2026 in my sources, so horizons for 2026 frontier models (Opus 4.8, Fable 5 and so on) are not measured here.
- I found no primary Google DeepMind leadership forecast statement.
- The METR acceleration and the AI 2027 authors' slowdown conflict. The report writer should present both: METR measures benchmark task length, while the AI 2027 authors weigh reliability and deployment.
