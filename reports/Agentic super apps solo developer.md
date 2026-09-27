# Spend the solo developer's attention like money

As of September 2026 the agentic super app is a **vendor consolidation**: OpenAI, Anthropic and Microsoft each folded chat, a coding agent, computer use and document tools into one desktop app, and none of them solved what happens when the agents finish. For one developer running many agents, what comes next is not a bigger app. It is a **loop you sit on rather than in**. You dispatch at a transition such as the end of the day, the work runs unattended under limits, it returns as evidence rather than prose, and you spend a scarce morning hour deciding what lands. The binding constraint is no longer compute. It is **the one reviewer's attention**, followed closely by **opaque subscription rate-limit windows**. Practitioners converge on 3–5 parallel worktrees, an evening dispatch and a morning "review nightly agents" block. They also turn notifications off, keep plans on disk and let tests, not the agent, decide when work is done. terminal-canvas already ships the control half of this loop. Spend is enforced by main and a held agent is a decision (M354–M357). Plans need approval before execution (M358). Other agents' reviews arrive as proposals (M360). Replay is sealed (M381–M383). There is a decision audit (M369) and a rate-limit gauge. What it lacks is the **transitions**: planning a night's dispatch against the 5-hour and weekly windows, a definition of "done" that a check makes rather than the agent, and a morning queue ranked by review cost. It also lacks the cheap guards that keep an unattended night honest: rules re-asserted after compaction, trial merges between lanes, and a Mac that stays awake. The twelve ranked proposals below start there.

Citation note: web sources are linked inline. Codebase facts cite repo-relative paths, commit hashes and `docs/build-log/` ledgers from `main` at `de59ca43` (2026-09-27). The internal delta inventory is authoritative on what shipped in M353–M387. Claims marked "secondary" come from aggregators that the research could not check against a primary source.

## The solo day now runs on dispatch and return

Among practitioners the pattern has settled. **Three to five parallel sessions, each in its own worktree or checkout**, is the mainstream setting. Boris Cherny reportedly called 3–5 worktrees "the single biggest productivity unlock", and Claude Code shipped a native `--worktree` flag in February 2026 ([Developers Digest](https://www.developersdigest.tech/blog/git-worktrees-claude-code-parallel-agents-guide), secondary). Conductor, a macOS app built around the same idea, recommends 3–5 workspaces and admits that its **local workspaces are not sandboxed** ([continuumcode.ai](https://continuumcode.ai/guides/conductor-review/), secondary). Simon Willison runs Claude Code, Codex CLI, Codex Cloud, Copilot's agent and Jules at once, in separate directories. He sends risky work to a cloud sandbox so that "the worst that can happen is my source code getting leaked" ([simonwillison.net](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/)).

The rhythm matters more than the agent count. Mitchell Hashimoto blocks **the last 30 minutes of each workday** to launch research, exploratory and triage agents, which gives him a "warm start" the next morning ([mitchellh.com](https://mitchellh.com/writing/my-ai-adoption-journey)). His posted schedule opens with "600 **review nightly agents, start new**" ([X/@mitchellh](https://x.com/mitchellh/status/2087227139154448436)). His stated rule is "If I'm coding, I want an agent planning. If they're coding, I want to be reviewing" ([paddo.dev](https://paddo.dev/blog/always-have-an-agent-running/), secondary). Every solo developer now has two fixed moments. **Dispatch happens at a transition, and review happens on return.** Most tooling designs for neither; it designs for the live session in between.

A braver minority runs loops. Geoffrey Huntley's **Ralph** is a bash loop that feeds a prompt to the agent. Each pass reads `IMPLEMENTATION_PLAN.md` from disk, does one task, commits and exits, so the next pass starts with fresh context. It cannot commit until tests, types and lint pass. "Your job is now to sit on the loop, not in it" ([ghuntley/how-to-ralph-wiggum](https://github.com/ghuntley/how-to-ralph-wiggum)). Armin Ronacher describes the same shift from the other side: an outer harness loop "continues the same session, injects another message, starts a fresh session with modified context" ([lucumr.pocoo.org](https://lucumr.pocoo.org/2026/6/23/the-coming-loop/)). At the extreme, Steve Yegge's **Gas Town** orchestrates 20–30 Claude Code agents over tmux. It has explicit roles, including a merge-queue agent called Refinery ([GitHub](https://github.com/steveyegge/gastown)), and reportedly costs about **$100 an hour** at that scale ([ASCII News](https://ascii.co.uk/news/article/news-20260102-190a5f9f/steve-yegge-releases-gas-town-multi-agent-orchestrator-for-c), secondary). Yegge says it needs users at "Stage 7" of his adoption scale. It is a frontier, not a norm.

Vendors are absorbing the unattended half. **Claude Code Routines** (research preview, 14 April 2026) run saved sessions on Anthropic's cloud from a schedule, an API call or a GitHub event, and keep running with the laptop closed ([Claude Code docs](https://code.claude.com/docs/en/routines)). The September super-app merges went further. Anthropic folded Chat and Cowork together but **kept Claude Code a separate product** ([Fortune](https://fortune.com/2026/09/16/anthropic-merges-its-claude-chat-and-agentic-cowork-products-into-a-single-ai-assistant-as-part-of-a-push-to-build-an-ai-superapp/)). OpenAI folded Codex into ChatGPT Work, along with an "Ultra" mode that coordinates parallel workstreams ([9to5Mac](https://9to5mac.com/2026/07/09/openai-announcing-the-next-chapter-for-chatgpt-today-watch-here/)). Each vendor's version runs only that vendor's agents. A solo developer who uses Claude Code for one thing and Codex for another still has no neutral place to dispatch, bound and review both. Claude Code is the **#1 most-used and most-loved AI coding tool** among experienced developers (46% most-loved, against Cursor's 19%), which makes it the anchor any such tool must drive well ([Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/ai-tooling-2026)).

## One reviewer is the binding constraint, and the rate-limit window is the second

For one person, every agent-hour becomes a human review-minute. Willison says so plainly: "I can only focus on reviewing and landing one significant change at a time." He adds that work started from a detailed spec needs far less review than a surprise PR ([simonwillison.net](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/)). An HN commenter put it as "you can't saw faster than the wood arrives" ([HN](https://news.ycombinator.com/item?id=46933223)). Industry figures point the same way, with vendor bias. Faros measures review time **up 441.5%**, and Sonar finds **96% of developers don't fully trust AI code but only 48% consistently verify it** ([paddo.dev](https://paddo.dev/blog/the-half-life-of-knowing-how), citing vendor data). The Stack Overflow blog calls the result **decision fatigue**. Automation intensity is up 55% with hours flat, and it proposes "guardrails at the beginning, validation gates at completion" in place of commit-level micro-review ([stackoverflow.blog](https://stackoverflow.blog/2026/05/21/coding-agents-are-giving-everyone-decision-fatigue/)).

Two consequences follow for tool design. First, **interruptions cost more than they save**. Hashimoto turns agent desktop notifications off entirely and checks on his own schedule ([mitchellh.com](https://mitchellh.com/writing/my-ai-adoption-journey)). The Sidekick study found that ambient cues during background work, plus summaries on resume, improved multitasking with agents ([arXiv 2607.17527](https://arxiv.org/abs/2607.17527)). Second, **richer narration does not buy accuracy**. In Microsoft Research's study, a better agent-trace UI raised users' confidence without meaningfully improving their error detection ([arXiv 2602.16844](https://arxiv.org/abs/2602.16844)). For someone with no second human reviewer, the substitute has to be **evidence that changes outcomes**, such as checks, diffs and gates, not a better story about what the agent did.

The second constraint is peculiar to solo developers on subscriptions. A heavy user's API-equivalent consumption dwarfs the plan price. One Indie Hackers post reports **$30,983 of tokens in a month on a $200 plan**, and its author built a public leaderboard because developers "lack visibility into actual token consumption" ([Indie Hackers](https://www.indiehackers.com/post/i-used-30-983-of-ai-tokens-last-month-in-claude-code-on-200-mo-plan-3337a369a6)). Another reports $1,588 of API-equivalent use on the same plan ([morphllm.com](https://www.morphllm.com/ai-coding-costs), secondary). The real currency is therefore **the 5-hour and weekly windows, not dollars**, and those windows are volatile. In March, Max subscribers reported 5-hour windows draining in one to two hours ([MacRumors](https://www.macrumors.com/2026/03/26/claude-code-users-rapid-rate-limit-drain-bug/)). Anthropic reportedly doubled 5-hour limits on 6 May and made a 25% weekly boost permanent on 14 September ([explainx.ai](https://explainx.ai/blog/claude-usage-limits-2026-timeline-explained), secondary). A night's dispatch that exhausts the window at 2 a.m. wastes the next five hours of the night. So does a dispatch that stops dead when the window closes rather than waiting for it to reset.

Three failure modes make unattended runs worse than supervised ones. Ronacher observes that loop-written code "avoid[s] strong invariants. They add fallbacks instead of making bad states impossible", and that he has "not had much success with this way of working for code I deeply care about" ([lucumr.pocoo.org](https://lucumr.pocoo.org/2026/6/23/the-coming-loop/)). This is the legibility cost. The second is compaction. Claude Code's `/compact` kept **53% of safety rules after one round and 10% after five**, while type-aware compaction kept 96% ([arXiv 2608.22752](https://arxiv.org/abs/2608.22752)). An overnight agent compacts several times while nobody watches. The third is collision. Across 747 replayed merges of agent PRs, **19.8% conflicted between PRs from the same agent and 41.7% between PRs from different agents** ([arXiv 2607.04697](https://arxiv.org/html/2607.04697v2)). Those are public multi-agent repos, not one person's canvas. Still, five lanes dispatched at 6 p.m. against one repository resemble that population more than a single session does.

## After the super app comes a loop you sit on, with a substitute team made of gates

The research on what follows the super app converges on one requirement: **delegated authority with limits, durable execution, inspectable artifacts and human escalation points**. For a solo developer, each has a concrete shape.

Ambient agents won as **user-authored triggers**, not as proactivity. ChatGPT Pulse was reportedly folded back into scheduled tasks "because it was guessing what the user would want" ([Christine Zhu](https://christinezhu.substack.com/p/the-delegation-interface), secondary), while Routines succeed as cron, API and GitHub triggers ([Claude Code docs](https://code.claude.com/docs/en/routines)). Self-improvement happens **in the harness, not the weights**. Skills are an open format across the major tools ([arXiv 2604.20087](https://arxiv.org/pdf/2604.20087)), "harness continual learning" is a named research line ([arXiv 2608.19013](https://arxiv.org/pdf/2608.19013)), and Hashimoto's "harness engineering" is the manual version: "anytime you find an agent makes a mistake, you take the time to engineer a solution such that the agent never makes that mistake again" ([mitchellh.com](https://mitchellh.com/writing/my-ai-adoption-journey)). Verification-first autonomy works where an independent checker exists. The pattern that transfers from AlphaProof's IMO result is **generator plus checker, never self-grading** ([Nature](https://www.nature.com/articles/s41586-025-09833-y)). Anthropic's Project Vend showed the organisational version: losses largely stopped once free-form judgment was replaced by **a mandatory procedure and a supervising agent** ([Anthropic](https://www.anthropic.com/research/project-vend-2)).

Put together, a solo developer's substitute for a team is **verification infrastructure plus persistent written intent**. The chain runs spec, then plan, then gates, then receipt. Ralph's plan file, Gas Town's git-backed state and Hashimoto's AGENTS.md of past mistakes are hand-built versions of that chain. The tool that stays ahead makes each link first-class. It holds the written intent where compaction cannot reach it, lets gates rather than the agent decide "done", sequences lanes so they do not collide, and ranks what returns so the one reviewer's hour goes to the work that most needs a human.

Off-device execution is the long-run direction and the one with the weakest solo case today. Routines already run with the laptop closed. Apple `container` 1.0 (June 2026) gives each container its own micro-VM on macOS ([Cloud Native Now](https://cloudnativenow.com/features/apple-ships-stable-1-0-of-its-native-container-tool-for-macos/)), and that answers Willison's wish to run local agents in a box that "limit[s] the blast radius" ([simonwillison.net](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/)). Yet the solo developer's first overnight problem is mundane. A local app has to stay running, and the Mac has to stay awake.

## terminal-canvas already owns the control half; the gaps sit at the transitions

The M353–M387 run overwhelmingly strengthened **one person's control of their own agents**. The table below maps the solo developer's key moments to what has shipped and what is still missing. Everything in the "shipped" column is off-limits as a proposal.

| Moment | Shipped (do not re-propose) | Missing |
|---|---|---|
| **Dispatch at a transition** | Start work with swarm presets and `tc task --swarm` (M370 `6f911437`); plan approval before execution (M358–M359); routines and watchers; the pool runner with a window-percent stop (`budgetCrossing` in `src/shared/rate-limit.ts`, used by `src/main/pool-runner.ts`) | Planning a dispatch against the windows; parking rather than stopping at a crossing; a task-level budget envelope (no such type in `src/shared`); keeping the Mac awake (no `powerSaveBlocker` anywhere in `src/`) |
| **Unattended run** | Per-agent caps enforced by main, carried across relaunch (M354 `90324cce`); a hold becomes a Needs-you with `Allow $N more`/`Stop` (M355 `f2fe4d92`, M357 `51475b9b`, M367 `05ab2049`); job journal and recovery (M316); a sealed transcript (M382 `35bbaf49`) | `compact_boundary` is recognised and **thrown away** (`src/shared/transcript.ts`, line 263, in `IGNORED_SYSTEM`); auto modes end on the agent's own `AUTO-DONE` marker (`src/main/agent-session.ts` line 790), which is self-grading; no trial merge between lanes (no `merge-tree` in `src/`); routines run only "while the app is open" (`src/shared/routines.ts` line 40) |
| **Morning return** | Per-task return briefing (M309, `src/shared/return-briefing.ts`); a task-grouped decision queue with ⌘J; cache return and a context window line on the Work tab (M380 `26ea7cb2`); the `tc audit` decision audit (M369 `6592ca36`) | A cross-task digest ranked by review cost; a single digest in place of per-event pings (`attention.notify` in `src/shared/settings-schema.ts` is on/off only); a person-facing audit view ("what did I approve yesterday"); the "held" word at rest (the header still says `idle`) |
| **Only reviewer** | Finished ≠ verified (M307); check-output records (M306); agent reviews as proposals that hold back "verified" (M360 `603c6205`, M361 `0d85a35c`); replay and compare (M381–M383) | A per-hunk coverage map, with unexercised hunks shown first; a caught-defect log; fork-from-turn (replay is read-only); comments from a door carry no quote or revision (M361 owed) |
| **Budget and windows** | An account-level 5-hour and weekly gauge folded from `rate_limit_event` (`src/shared/rate-limit.ts`, shown in `src/renderer/shell/Inspector.tsx`); per-agent USD and context caps | A forecast; "what can I still afford tonight"; the window figure lost across relaunch; 1-hour cache writes billed at 1.25× instead of 2× (M380 owed); an unmeasured risk that `total_cost_usd` is cumulative across `--resume`, which would make M354's carry double-count |

The pattern is clear. terminal-canvas can bound, hold, review and replay any single agent better than the vendors' apps can. What it does not yet do is treat **the night as a unit of work**, meaning a planned dispatch against a finite window, unattended under guards, and returned as a ranked queue. That unit is the solo developer's actual day, and no vendor product in the research models it across vendors.

### Set aside: the team layer

Presence, the Team view, the shared canvas CRDT and roles, shared text buffers, team asks (M375–M379), share decisions, the collab server and its server-side audit (M387), and agents as CRDT peers alongside humans all require a second human, so this report drops them. Two pieces of that infrastructure survive in solo form. One is the **pty relay on your own VM**. The other is the **decision audit** read as personal memory rather than compliance.

## The forecasts disagree; the solo roadmap should hold under both

METR's Time Horizon 1.1 puts the capability doubling time at about **88.6 days** ([METR](https://metr.org/blog/2026-1-29-time-horizon-1-1/)). METR also warns that measurements above 16 hours are unreliable with its current task suite ([METR](https://metr.org/time-horizons/)), and a time horizon measures human task length, not how long an agent runs ([MIT Technology Review](https://www.technologyreview.com/2026/02/05/1132254/this-is-the-most-misunderstood-graph-in-ai/)). The AI 2027 authors have moved their own medians out to roughly 2030–2035, citing slow gains in reliability ([FutureSearch](https://futuresearch.ai/blog/ai-2027-6-months-later/)). The solo-specific forecast is also contested. Amodei predicted a one-employee billion-dollar company in 2026, but the cited examples are a telehealth firm and small teams, and even enthusiast sources call it "a prediction, not an established fact" ([Founder Institute](https://fi.co/insight/the-one-person-unicorn-how-solo-founders-are-building-billion-dollar-companies-with-ai-in-2026)). No verified solo software unicorn built with agents was found.

These readings disagree on speed but agree on the constraint. A fast curve produces more output per reviewer-hour, and a slow one produces unreliable output that needs checking. **Either way the one reviewer's attention binds.** Two further uncertainties are specific to solo use. **Subscription terms change every few months**, so window-aware features must read the CLI's own `rate_limit_event` rather than hard-code limits. **Vendors may absorb pieces** of this, as Routines already did for cloud scheduling. The proposals below favour cross-vendor, local, main-enforced features that a single-vendor app is structurally unlikely to ship.

## Twelve implementations, ranked, in three horizons

The ranking weighs four things: how many solo review-minutes a feature saves or protects; its reuse of shipped seams; the cost of being wrong; and its distance from what vendors ship. Every proposal must respect the product's rules. **Four doors**: every verb reaches a canvas gesture, a palette row, an agent line and a workflow node (`V9_DOORS`, `verify:verbs closure.v9.1`). **Inert imports**: anything arriving from outside starts no process until a person looks at it. **The outward gate**: text that leaves passes `outward` and `redactSecrets`, with a count. **Main enforces caps**: an agent or workflow may lower a cap but never raise one. **Density layers**: one state word at rest, and no dollar or token figure in a header, card, rail or status bar. Sizes are rough: S is under one milestone, M is 1–3 milestones, L is 4–8 and XL is a run.

### Clear first: small, unblocked solo debts

These are owed items from the ledgers. Each is small, and several are preconditions for the proposals below.

| Debt | Why it matters to one person | Source |
|---|---|---|
| The "held" word at rest (chip "held — $2.10 of $2.00", owed since M352) | A morning scan of the canvas misreads a held lane as `idle` | `m352`/`m355`/`m357`/`m367` Owed |
| Measure whether `total_cost_usd` is cumulative across `--resume` | If it is, M354's carry double-counts, and every envelope in #1 is wrong | `m350`, `m354` Owed |
| Carry the window figure across a relaunch; bill 1-hour cache writes at 2× | The morning numbers must survive the night's relaunches | `m380` Owed |
| Record one real ExitPlanMode request | Confirms `input.plan` is the whole input before plans become the night's contract | `m358` Owed |
| M368 narrow chat header clipping `auto stuck di…` | The one state word at rest must be readable | `m358` Owed |
| M361 comment quote and revision, a canvas gesture through `newReviewComment`, one end-to-end panels check | Agent review proposals must point at a line that still exists in the morning | `m361` Owed |
| Show replay's `unreadable` count and the ledger's `scrubbed` count | Honest counts on the records the morning review relies on | `m382`/`m383`, `m372` Owed |
| M362 proposal golden; M386 panels-harness hermeticity | Keeps the gate trustworthy while the work below lands | `m360`, `m385` Owed |

### Now (0–3 months): make the night a unit of work

**1. "Tonight": dispatch against the windows, park at a crossing, keep the Mac awake, and give each task a budget envelope.**

*Thesis.* For a subscriber the scarce currency is the 5-hour and weekly window, not dollars ([Indie Hackers](https://www.indiehackers.com/post/i-used-30-983-of-ai-tokens-last-month-in-claude-code-on-200-mo-plan-3337a369a6); [MacRumors](https://www.macrumors.com/2026/03/26/claude-code-users-rapid-rate-limit-drain-bug/)). Practitioners dispatch at transitions ([mitchellh.com](https://mitchellh.com/writing/my-ai-adoption-journey)), and limit opacity is a named pain point in its own right.

*What the solo developer experiences.* At 6 p.m. they select three tasks and choose "Run tonight". A sheet shows each lane, its backend, its cap, and one plain sentence: "the 5-hour window resets at 11:40 p.m.; at the current weekly use, about two windows are left before Friday." They set one envelope per task, "$6 or 40% of a window, split across its lanes." Overnight, when a lane crosses the window arm, it **parks** with the reason "waiting for the window" rather than stopping, and resumes itself after `resetsAt`. The Mac stays awake while any lane is live, and only then. At rest each lane shows one word: running, parked or held. The figures live in the inspector.

*Builds on.* `budgetCrossing` and `RateLimitWindows` in `src/shared/rate-limit.ts`; `src/main/pool-runner.ts`, which today clears live workers on a crossing; the M354 carry (`src/main/agent-transcript-log.ts`); the M355/M357 hold and `allowMore` in `src/shared/agent-session.ts`; `src/main/approvals.ts`; the `cap-agent` verb; and M370's `tc task --swarm`. The task envelope is **new**: no task budget type exists in `src/shared`. Keeping the Mac awake needs Electron's `powerSaveBlocker`, which appears nowhere in `src/`.

*Rules.* Main enforces the envelope and resumes after a park, and the renderer only projects it. A lane's cap is at most its share of the envelope, and a sibling can only lower another's share. Resuming after a window reset is not a raise, because the envelope is unchanged. Only a person raises an envelope. "Run tonight" is a verb with four doors, and its workflow-node door can only schedule within an envelope that a person set. No figures appear at rest.

*Size.* M.

*Falsified if* windows rarely bind overnight for real users. Log crossings for a month from the existing `rate_limit_event` fold before building the forecast sentence. It is also falsified if non-Claude backends emit no window event (backend-fit should declare that, not fake it), or if the `--resume` double-count measurement in "Clear first" shows the dollar arm cannot be trusted.

**2. Backpressure: "done" means a check passed, not the agent's word.**

*Thesis.* Ralph's core rule is that work is rejected until "tests, typechecks, lints, builds" pass ([ghuntley](https://github.com/ghuntley/how-to-ralph-wiggum)). Self-grading is the documented weak spot of autonomy claims, and generator-plus-checker is the pattern that works ([Nature](https://www.nature.com/articles/s41586-025-09833-y)). The Stack Overflow blog's prescription is "validation gates at completion" ([stackoverflow.blog](https://stackoverflow.blog/2026/05/21/coding-agents-are-giving-everyone-decision-fatigue/)).

*What the solo developer experiences.* An auto run names a gate when it starts ("npm test", or the task's recorded check). When the agent prints `AUTO-DONE`, that is now a **claim**. Main runs the gate. If the gate fails, the exact failing output goes back to the agent as the continuation, within the turn limit and the caps. If it passes, the lane rests as "gate passed", which is still not "verified", because M307 keeps that judgment for the person. An optional "fresh each pass" setting restarts the agent from the plan file on disk rather than from a compacted context, which is Ralph's exact shape. In the morning, every finished lane either passed its gate or says which gate it failed and how many times.

*Builds on.* `src/shared/auto.ts` (`AUTO_DONE_MARKER`, turn limits); `src/main/agent-session.ts` line 790, where the marker currently resolves the run as `done`; the M306 check-output records (`src/shared/check-output.ts`, `src/shared/check-evidence.ts`); `src/shared/review-readiness.ts`; and the M358 plan approval, whose approved plan can be the file a fresh pass reads.

*Rules.* The gate command is a verb step validated as a plan, the same way M97 validates an auto mode, so a destructive gate needs its confirmation. Gate output that is fed back is local and never crosses `outward`. The turn limit and caps still bind, so a failing gate cannot loop forever.

*Size.* S–M.

*Falsified if* gate-fed continuations do not lift the morning pass rate over the plain marker on a set of seeded tasks, or if they burn the envelope in fail-retry spirals. Log retries per gate.

**3. The morning queue: one digest, ranked by what the reviewer's hour buys.**

*Thesis.* The morning "review nightly agents" block is the moment practitioners build their day around ([X/@mitchellh](https://x.com/mitchellh/status/2087227139154448436)). They turn per-event notifications off ([mitchellh.com](https://mitchellh.com/writing/my-ai-adoption-journey)), and resumption summaries beat interruption ([Sidekick, arXiv 2607.17527](https://arxiv.org/abs/2607.17527)). Willison can land "one significant change at a time" ([simonwillison.net](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/)).

*What the solo developer experiences.* On opening the app, or at a time they choose, one ordered list covers every task from the night. It lists what can land now: gate passed, a small diff, no open proposals. It lists what needs a decision: holds, plans to approve, parked lanes. It lists what failed and why, and what collided (see #6). Each row carries its review cost in words ("12 lines, 1 file, gate passed") and links to its evidence. A single digest notification ("3 ready · 2 need you · 1 failed") replaces per-event pings for anyone who chooses it. A "Yesterday's decisions" view reads the decision audit, answering "what did I approve at 11 p.m.?" without opening a shell.

*Builds on.* `src/shared/return-briefing.ts` (M309, per task, built only from records); `resume-summary.ts`; the decision queue (`src/renderer/shell/decision-inbox.ts`, M318/M329); the `attention.notify` setting in `src/shared/settings-schema.ts`, which is on/off only; `src/main/decision-audit.ts` and `tc audit` (M369), whose person-facing view is owed; and the M380 figures, which stay at inspector depth.

*Rules.* No sentence may be written that a record did not produce. That is the briefing's existing rule, and D18 says model text is not state. The ranking is derived from evidence (gate, size, open proposals) and never from an agent's self-assessment. The digest view is a palette scope and a canvas surface, and "open next" is a verb with four doors. No figures appear at rest.

*Size.* M.

*Falsified if* time from opening the app to the first landed change does not drop, measured locally with no telemetry, or if users ignore the ordering and review in canvas order anyway.

**4. Review that opens on unexercised hunks, and a log of where defects were caught.**

*Thesis.* Trace UIs raise confidence without raising accuracy ([arXiv 2602.16844](https://arxiv.org/abs/2602.16844)). The trust gap is behavioural: 96% distrust AI code, but only 48% verify it ([paddo.dev](https://paddo.dev/blog/the-half-life-of-knowing-how)). With no second human, the reviewer must spend minutes where no check looked.

*What the solo developer experiences.* The review opens on the diff hunks that **no recorded check exercised**. It starts at changed-file granularity and moves to line granularity where coverage data exists. Each hunk names the check runs that touched it. The M360 agent-review proposals attach to their hunks with a quote and a revision. A local log records which surface caught each defect the person fixed: the gate, an agent proposal, the coverage map or plain reading.

*Builds on.* Shipped: the M360/M361 proposals (`src/shared/review-comments.ts` `proposedBy`), check outputs, `src/main/task-evidence.ts` and `review-readiness.ts`. Missing, and this proposal's scope: the coverage map, the caught-defect log, and M361's owed quote/revision and `newReviewComment` gesture.

*Rules.* "Verified" stays a person's judgment built on checks. A proposal never counts as a verdict. Evidence export passes `outward`. The coverage map sits at inspector depth, and at rest the state is "unverified" or "verified".

*Size.* M.

*Falsified if* the caught-defect rate on seeded defects does not beat the plain diff. The Microsoft result means this has to be measured, not assumed.

**5. A rules channel that survives compaction, triggered by the event the parser already drops.**

*Thesis.* Compaction kept 53% of safety rules after one round and 10% after five ([arXiv 2608.22752](https://arxiv.org/abs/2608.22752)). An overnight agent compacts repeatedly while nobody watches.

*What the solo developer experiences.* A project's hard rules, a teammate's brief and a task's constraints (no push, stay in this worktree) are kept as a typed rules set. When main sees `compact_boundary` in the agent's stream, it re-sends the set verbatim. The morning inspector shows "rules re-asserted after compaction ×4".

*Builds on.* `src/shared/transcript.ts` (lines ~255–263), which already names `compact_boundary` in `IGNORED_SYSTEM`; the fix is to route it to main instead of discarding it. Also `src/main/agent-session-args.ts`, `src/shared/teammates.ts`, `src/main/memory-store.ts` (a new `rule` kind) and `src/shared/backend-fit.ts` (a "keeps rules" capability).

*Rules.* Rules pass `redactSecrets` like every memory write. A backend that emits no compaction event is declared as lacking the capability and is never faked (#80's discipline). An agent may propose a rule but never delete one.

*Size.* S.

*Falsified if* the vendors ship type-aware compaction, or if a controlled run shows no rule loss across real compactions in these CLIs.

**6. A collision radar between tonight's lanes, and a verb that sequences them.**

*Thesis.* Cross-agent merges conflicted 41.7% of the time, and agents edit "without knowledge that other agents … are simultaneously accessing and altering the same files" ([arXiv 2607.04697](https://arxiv.org/html/2607.04697v2)). Gas Town needs a dedicated merge-queue role for the same reason ([GitHub](https://github.com/steveyegge/gastown)).

*What the solo developer experiences.* While lanes run, main performs a trial merge on each lane's head with `git merge-tree`, which touches no worktree. Two lanes that would conflict get a thin amber edge on the canvas and an entry in the morning digest ("B and D both rewrote `auth/session.ts`"). The verb "Sequence these" makes the second lane wait for the first to integrate, then rebase and re-run its gate from #2.

*Builds on.* `src/main/worktree-manager.ts`, `src/main/lane-merge.ts`, `src/main/combine-runner.ts`, `src/main/integrator.ts`, `src/main/review-engine.ts`, the Orchestrate dependency lens and `src/shared/handoff.ts`. Nothing in `src/` uses `merge-tree` today.

*Rules.* The radar is read-only and never merges on its own. Integrate keeps its witnessed-receipt invariant, "what landed is byte-for-byte what the check passed on". Sequencing is a verb with four doors, and the conflict edge is a contextual-layer cue.

*Size.* M.

*Falsified if* a month of logged trial merges on real solo canvases shows collisions in the low single digits, or if `merge-tree` is too slow on large repositories.

### Next (3–9 months): branch, expose and reach

**7. Fork from a turn, building on replay.**

*Thesis.* Checkpoint, rewind and fork are standard in agent runtimes ([Claude Code checkpointing](https://code.claude.com/docs/en/checkpointing)). Branching on a spatial canvas has field support ([CanvasConvo, arXiv 2605.15848](https://arxiv.org/abs/2605.15848)). For a solo developer, a fork turns a bad night into a partial loss rather than a total one.

*What the solo developer experiences.* In the Replay sheet, at the turn before a lane went wrong, they choose "Fork from here" and change the instruction. A sibling lane starts on a new worktree cut at that turn's files, joined to the original by a fork edge. **Compare with**, which has already shipped, puts the two side by side, and the gate from #2 runs on both.

*Builds on.* `replayAt` and `compareFrames` in `src/shared/replay.ts` and `src/renderer/replay/ReplaySheet.tsx` (M381–M383, read-only today). The missing parts are the branch itself, a worktree cut at a turn (`src/main/worktree-manager.ts`) and a mid-transcript `--resume` point per backend (`src/main/agent-session.ts`). Replay marks files `exact` or `partial` and warns when shell commands ran, so a fork from a `partial` frame must say so.

*Rules.* A fork is an authored object with undo and tiering. **A child's cap is at most the parent's remaining envelope**, which only tightens. Fork is a verb with four doors.

*Size.* M–L.

*Falsified if* the CLIs cannot resume from a mid-transcript point (measure this per backend and declare it in backend-fit), or if users abandon forks rather than choosing between them.

**8. The canvas as a local MCP server over the `tc` socket, so a lead agent can run the night for you.**

*Thesis.* MCP 2026-07-28 is stateless. Its "input required" round trips map onto an approval card, and its Tasks extension maps onto a long-running handle ([MCP blog](https://blog.modelcontextprotocol.io/posts/2026-07-28/)). Ronacher's outer harness loop, and Gas Town's Mayor role, are an agent orchestrating agents ([lucumr.pocoo.org](https://lucumr.pocoo.org/2026/6/23/the-coming-loop/); [GitHub](https://github.com/steveyegge/gastown)).

*What the solo developer experiences.* A lead agent in one panel can ask the canvas "which lanes are parked, which failed their gate, which collide?" It can propose "sequence B after D", "fork C from turn 14" or "lower E's cap". Anything that needs a person, such as a raise or a destructive step, comes back as `input_required` and waits in the morning queue.

*Builds on.* `src/shared/verb-table.ts` (the `destructive` column), `src/main/control-server.ts`, `control-handler.ts` and `control-protocol.ts`, and the proto-MCP verbs already on the socket: `tc toolbox` (M366 `d3cfe4c6`), `tc audit` (M369) and `tc task --swarm` (M370). Also `src/shared/job-journal.ts` and `src/main/approvals.ts`. No MCP server exists in `src/` today.

*Rules.* MCP is a second transport for the existing **agent-line door**, not a fifth door. The socket stays local-only, because the control server's rule is "No network, ever." Agents may only tighten. Every returned string passes `outward`. Backlog #9 and D19 argue for starting read-only.

*Size.* M–L.

*Falsified if* agents use it no more than they already use `tc plan`.

**9. Needs-you on your phone, over your own tunnel rather than the org stack.**

*Thesis.* The unattended half of the day happens away from the desk, and the delegation interface is becoming a review-and-approve surface (Routines run with the laptop off, [Claude Code docs](https://code.claude.com/docs/en/routines); [Sidekick](https://arxiv.org/abs/2607.17527)).

*What the solo developer experiences.* On the phone, the morning digest from #3 is read-only: held, parked, failed and ready. A later phase adds exactly one write, answering a pending plan or permission. It never raises a cap or an envelope above what the desktop set.

*Builds on.* Backlog #40 and its own constraints (report from `Panel` facts, never a buffer; "read-only is a design position"), `src/shared/return-briefing.ts` and the decision queue. The only remote infrastructure in the repo is the undeployed collab and relay stack, which is blocked on a VM. A solo design should take the lighter path: a personal tunnel or push relay that carries the digest, with no org, Supabase or account machinery.

*Rules.* Everything leaving passes `outward` (standing rule #31: terminal bytes are a disclosure surface). D20 requires explicit authorisation and an audit row for any remote write. The list travels, not the canvas.

*Size.* M, plus a hosting decision only the user can make.

*Falsified if* solo users do not leave agents running while away, or if vendor mobile apps cover single-vendor users well enough.

**10. A box per lane: a microVM sandbox by default for unattended work.**

*Thesis.* Willison wants local agents contained to "limit the blast radius" ([simonwillison.net](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/)). Conductor's local workspaces are not sandboxed ([continuumcode.ai](https://continuumcode.ai/guides/conductor-review/)). Apple `container` 1.0 gives each container its own micro-VM on macOS ([Cloud Native Now](https://cloudnativenow.com/features/apple-ships-stable-1-0-of-its-native-container-tool-for-macos/)).

*What the solo developer experiences.* "Run tonight" defaults unattended lanes into a per-lane micro-VM with only that lane's worktree mounted. This makes YOLO-style permissions safe to grant at night. The lane rests with the word "boxed".

*Builds on.* The README's admission that "a worktree … is not a sandbox: every agent runs as your user"; `src/main/agent-runner.ts`, the one place that spawns (M384 pinned it, so a boxed runner is one more `AgentRunner`); `src/main/worktree-manager.ts`; and `src/shared/backend-fit.ts` for which CLIs run inside a box.

*Rules.* Credentials never enter the box's environment. Broker calls go back through main or are refused, and there is no `credential:get`. Caps stay in main.

*Size.* L.

*Falsified if* CLI authentication cannot work inside the box without exporting tokens, or if cold starts make short lanes impractical. No primary cold-start benchmark was found, so measure it first.

### Beyond (9–24 months): triggers, not dates

**11. Lanes that keep working with the laptop closed, on your own VM, holding a lease issued by main.**

*Thesis.* Durable off-device execution is the common thread of post-super-app work, and Routines already do this for a single vendor ([Claude Code docs](https://code.claude.com/docs/en/routines)).

*What the solo developer experiences.* "Continue off-device" moves a lane to the developer's own VM through the pty relay. The canvas object stays and shows "remote". The morning digest reads it like any other lane.

*Builds on.* `server/relay/`, `src/shared/relay-protocol.ts`, `src/main/relay/relay-client.ts`, the M384 ACP seam (a remote runner is one more `AgentRunner`), `src/shared/job-journal.ts`, `src/main/job-recovery.ts`, and `ROUTINE_LIMIT_WORD`, which would finally change.

*Rules.* The hard problem is that **main enforces caps, and main is on the laptop**. The VM holds only a lease that main issued and that can only shrink. Credentials never enter it.

*Size.* XL.

*Trigger.* Start when the relay is deployed to the user's own VM, a signed build exists, and #1's logs show nights cut short by a closed lid.

*Falsified if* vendor cloud routines satisfy solo developers who use a single vendor anyway.

**12. A learned harness: every caught mistake becomes a rule or skill proposal, promoted only through replayed checks.**

*Thesis.* Harness engineering is what the best solo practitioners do by hand ([mitchellh.com](https://mitchellh.com/writing/my-ai-adoption-journey)), and harness learning is an explicit research line ([arXiv 2608.19013](https://arxiv.org/pdf/2608.19013)).

*What the solo developer experiences.* When the person discards an agent's work or fixes a defect caught in #4's log, the app drafts a rule for the #5 channel, or a skill, marked `reviewed: false`. It is promoted only if re-running the task's recorded gate with the rule loaded passes at least as well.

*Builds on.* `src/main/skill-write.ts`, `src/shared/skills.ts`, `src/main/memory-store.ts`, `src/shared/draft-review.ts`, the check-output store, and the caught-defect log and rules channel from #4 and #5.

*Rules.* Inert until reviewed. `redactSecrets` runs on every write. D18 applies: nothing is applied automatically.

*Size.* M–L.

*Trigger.* Start once #4's log has a few months of data.

*Falsified if* promoted rules do not lift gate pass rates. The research found little evidence that auto-generated skills help rather than hurt, which is why the eval gate is the feature.

### What not to build

**The team layer**, as set aside above. **A race on agent count** in the style of "Ultra" or Gas Town: at 20–30 lanes, the collision and review data say the solo developer drowns, and Gas Town's own author gates it to "Stage 7" users. **Per-event notifications as the default**, since the best practitioners switch them off. **Trace theatre or richer narration**, which raises confidence without raising accuracy ([arXiv 2602.16844](https://arxiv.org/abs/2602.16844)). **A proactive suggestion feed**, given Pulse's reported fate. **Dollar or token figures at rest**. **More artifact kinds or an office suite**, since `docs/product-review-and-roadmap-2026-09-14.md` already says not to. **A general plugin API before a concrete consumer** (#9, D19). **Hosting ACP file-system and terminal requests** (#81 stays declined). **Engine rows written from help text** (#80). **Agent payments**, until a paid service the user already needs speaks MPP or x402. **Anything remote before signing, notarisation and one real run of the relay on the user's own VM.**

## Conclusion

The super app answered where one vendor's agents live. For one developer it left open the question that matters: **how to spend a single human's scarce review hour on the output of a night's worth of agents from several vendors**. The research shows the best solo practitioners already run a rhythm of evening dispatch and morning review, and they substitute gates and written intent for the colleague they do not have. They build it by hand, from bash loops, AGENTS.md files and notification switches. terminal-canvas is unusually close to productising that rhythm, because its hardest parts have already shipped: spend enforced outside the loop, holds as decisions, plans before execution, sealed replay, and a record of every decision.

The move that puts a solo developer several steps ahead is therefore not more agents or more surfaces. It is **treating the night as the unit of work**: dispatched against the real window, guarded while unattended, judged by checks rather than by the agent, and returned as a queue ranked by what the reviewer's hour buys. Items 1–3 build that loop on seams that already exist, and items 5 and 6 are cheap insurance on it. Each begins with a local measurement: window crossings, gate retries, time to the first landed change, rule loss after compaction, and the collision rate. Those measurements, not forecasts about capability, should decide what comes after.
