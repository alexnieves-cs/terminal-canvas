# Lens 2 — the daily-path read

**Written 2026-09-06 against terminal-canvas at `v2.3.0` / branch `m117-engines`.**
Every competitor claim below was searched on 2026-09-06 and is cited in the table at the
end. Nothing here is asserted from memory.

---

## 0. The headline you are not going to like

**The category you thought you invented shipped twice this year without you.**

- **Maestri** — a native macOS (Swift/SwiftUI/Metal) infinite canvas where each terminal is a
  node, you **drag a line between two agents and they talk to each other over PTY**, plus
  sticky notes agents write to, saved ensembles ("Partituras" — your templates), instant
  copy-on-write workspace clones ("Floors" — your worktrees), device portals (browser, iOS
  Simulator, a physical phone), and an on-device summarizer of what happened while you were
  away. Solo dev, Brazil. Product Hunt launch, ~156 upvotes. Free tier; Pro at $18 one-time
  (their site) or $19/mo (a July 2026 review — the two sources disagree, flag it).
- **TermCanvas** — MIT-licensed, free, macOS/Windows/Linux, v0.39: spatial pan/zoom terminal
  canvas, five agent CLIs side by side, **a worktree and a status readout per agent**, plus
  "Hydra" — an explicit lead-driven dispatch/watch/merge loop — and pins that push to
  Linear / Notion / GitHub Issues.
- **Ona Canvas** — an infinite canvas for orchestrating agents, cloud-sandboxed, 10+
  environments on one screen, voice dispatch. Waitlist.

Read the Maestri feature list against your README. Canvas, PTY nodes, wire-them-together,
notes, templates, worktree clones, a browser pane, engine-agnostic, macOS, zero telemetry,
solo author. That is not "adjacent." That is the same product, shipped, in Swift, for $18.

This does not mean the bet was wrong. It means **the canvas is no longer the differentiator
and must stop being the pitch.** Everything below follows from that.

---

## 1. The daily-path verdict

### The case that spatial multi-agent orchestration is DAILY

The strongest version: agent count per engineer went up all year, and every major tool
shipped a "many sessions at once" surface in the first half of 2026 — Claude Code's Agent
View (May 11), Cursor 3's Agents Window (Apr 2) and `/multitask` (Apr 24), Warp's universal
agent support (Apr 14) and tab groups, Zed's Threads sidebar. Four vendors do not
independently ship the same surface in one quarter for a monthly problem. If two or three
agents is the new floor, then "which of these needs me" is a question you ask forty times a
day, and a canvas answers it with peripheral vision instead of a list scan.

### The case that it is WEEKLY

The stronger version, and the one the evidence actually supports:

1. **Everyone who shipped that surface shipped a LIST, not a canvas.** Anthropic, Cursor,
   Warp and Zed all had a canvas available to them as a design choice and all four chose a
   sidebar of rows with status badges. A list is sufficient up to roughly a dozen items.
   Spatial layout starts to beat a list somewhere north of that — and it costs a persistent
   mental map, which a list does not.
2. **The published advice caps the useful parallelism at 2–3.** Cursor supports 8 parallel
   agents and the guidance around it says start with 2–3 because merge-conflict complexity
   scales non-linearly. That is the real ceiling — not screen real estate, not context
   switching. **Merge cost, not visibility cost, is what caps agent count**, and a canvas
   does not lower merge cost at all.
3. **The daily unit of work is one repo and one branch.** An engineer with a ticket opens
   one agent, watches it, reviews the diff, lands it. The canvas has nothing to offer that
   loop that a single terminal doesn't. The days that need twelve panels are the days you
   have twelve *independent* tasks queued — which for a working engineer on a team is a
   sprint-planning artifact, not a Tuesday.
4. **Your own README's best features are single-panel features.** Search across panels,
   the review node, durable scrollback, `Cmd+J`. Those work with one agent. The graph does
   not.

### The verdict

**Weekly. Possibly monthly for anyone employed on a team.** Spatial orchestration of 8+
agents is a real need for a real person, and that person is not the median engineer. The
median engineer's daily agent problem in September 2026 is already solved, adequately and
for free, inside the tool they already have open.

And this is the fatal arithmetic: **an app that is not open when the problem arrives does not
get used when the problem arrives.** Claude Code is open because it is where the work is.
Warp is open because it is the terminal. Cursor is open because it is the editor.
terminal-canvas is open only when you have already decided today is a canvas day — which
means it competes not with Warp but with *the decision to launch it*, and it loses that
competition on the 80% of days when two tabs would do.

### The daily hook it would have to grow — the important paragraph

**The hook must be true when exactly one agent is running, and it must be about state that
survives you closing the laptop.** That rules out everything graph-shaped. What terminal-canvas
uniquely has, and what none of Agent View / Agents Window / tab groups / Threads has, is
that **it is a place, not a session list.** Every competitor's multi-agent surface is
ephemeral: close it and the arrangement is gone; the sessions are rows that get archived.
This app persists a *canvas* — panel geometry, dormant panels that come back as cards showing
their last output, durable per-panel scrollback that survives a quit, a worktree per panel
that outlives the panel, a per-repo memory store, a review baseline that answers "what did
that agent change" after the agent is dead, and a work board of items in four states.

That is the daily hook, and it is not currently the pitch: **"the thing you come back to."**
The daily loop it would own is *resumption* — you open the app first thing and it tells you
what your agents did overnight, what is half-finished, which worktrees are dirty, which
branch never got pushed, what you asked for on Thursday and never reviewed. That is a
question every engineer has every single morning, it is a question no session list can
answer because session lists forget, and it is a question that is *more* valuable when you
only ran two agents yesterday, not less. If the app opened onto a "since you were last here"
surface instead of a canvas, it would have a reason to be open at 9am, and the canvas would
be there for the days that need it. Right now the app's front door is a spatial workspace,
which is an answer to a question the user only has on Thursdays.

Concretely: the pieces already exist (scrollback, snapshots, the run ledger, `review:across`,
worktree records, the board, routines). They are not assembled into a morning surface. **That
assembly is the single highest-leverage thing in this document.**

---

## 2. The one differentiator

Not the canvas — Maestri and TermCanvas have a canvas. Not worktree-per-agent — Conductor,
Crystal/Nimbalyst, Cursor, Claude Code itself (`isolation: "worktree"`, v2.1.49, Feb 2026)
and TermCanvas all have it; it is table stakes as of this February.

**The differentiator is the typed, triggered, joinable handoff edge — the graph as a
first-class recorded execution, not as plumbing.**

Precisely what no competitor has, checked:

- Maestri's connections are **PTY pipes**: one agent's output goes into another's input, and
  a human or an agent decides when. There is no trigger vocabulary. Yours is a closed table
  over five triggers (`exit`, `exit-ok`, `exit-fail`, `idle`, `always`) — **an edge that
  fires on exit code 0 and not on exit code 1 is a control-flow construct; a pipe is not.**
- Nobody has **joins**. `incomingHandoffs`/`joinAdvance` — a target with three enabled edges
  starting once, when the last source arrives, payloads in panel order — is a fan-in
  primitive. Cursor's `/multitask` fans out; nothing on the market fans back in.
- Nobody has **the run as a recorded object**: a connected subgraph frozen at start, its
  events recorded, sealed when every sink has an outcome, priced. That is a build system's
  idea applied to agents.
- Nobody has **the graph as a saveable shape** (templates with `{{parameters}}` sharing the
  composer's own hole syntax) plus **hard, main-enforced ceilings** (concurrency queues,
  budget refuses and interrupts every turn in flight). Anthropic's own `task_budget` is
  explicitly a soft hint, not a hard cap; AWS shipped hard ceilings at the gateway in August.
  You enforce it in-process, live, on every result. That is a genuinely scarce property.

**Is the app built around it? No.** It is one bullet among forty in the README, one milestone
(M78–M80) among a hundred and twenty, and it is reachable only by drawing a line between two
panels you already made. Twelve panel kinds — terminal, chat, review, file, note, memory,
toolbox, Jira, GitHub, watcher, browser, work — is not a product, it is a museum. The graph is
buried under all of them.

The single sentence the product should be able to say: *"describe a pipeline of agents once,
run it, watch it fan out and back in, and get a receipt with a dollar figure."* Nothing else on
the market can say that sentence. Almost nothing in the app's presentation says it either.

---

## 3. The parity trap

De-emphasize or freeze. None of these will win a user, and every one of them costs
maintenance and README surface that dilutes §2:

| Feature | Why it's a trap |
|---|---|
| **Jira panel + writes (M19/M24)** | A worse Jira than Jira, with a transition-screen gap you documented yourself. Linear/Jira MCP servers cover this for free, engine-side. Nobody chooses an orchestrator for its ticket panel. |
| **GitHub work panel (M88)** | Same. `gh` exists; the GitHub MCP server exists. |
| **Browser `<webview>` guest (M103)** | Beautiful engineering (the CSP/`will-attach-webview` hardening is genuinely good work) for a feature Maestri ships as "device portals" including an iOS Simulator and a real phone. You cannot win this and shouldn't try. |
| **File panels / notes / vault / annotations / snapshots (M16/M22/M27/M85/M93)** | This is Obsidian-on-a-canvas. Nimbalyst already does WYSIWYG markdown + mockups + diagrams around agents, MIT, three platforms, with a mobile app. Freeze. |
| **Toolbox panel, machine cost, diagnostics, minimap, PNG export, subagent nodes** | Craft, not value. Subagent nodes in particular only work for `claude` and read a private directory format that will break. |
| **The engine race (cursor/copilot/ACP — M117+)** | Warp wired four CLIs as first-class in April; Zed does N vendors over ACP; Nimbalyst has Claude+Codex+OpenCode+Copilot+Gemini. **You cannot out-adapter a funded team as a solo author.** Ship ACP once (it is the one adapter that buys you every future agent for free) and stop hand-writing per-vendor adapters. M99's "no consumer switches on the backend name" rule already makes this cheap — collect the dividend and stop. |
| **Signing/packaging polish** | Real, but it is a $99 line item, not a milestone. |

Blunt version: **roughly half the milestones since M83 are features that make the app broader
rather than better, and breadth is the exact axis on which a solo Electron app loses to a
funded native one.**

---

## 4. Positioning — the beachhead

Not "every engineer." Not even "engineers who use Claude Code."

**The person for whom this is already the best tool in the world today is the solo operator
running a long-horizon backlog of independent tasks across multiple repos, on a Max-tier or
API budget, whose actual job for most of the day is *supervising* rather than typing.**

Concretely, three named shapes of that person:

1. **The solo founder / indie shipper with a 40-item backlog and no code reviewer.** Runs
   6–15 agents. Needs isolation (worktrees), needs to know who is stuck, needs a diff per
   agent, needs a dollar ceiling because there is no employer absorbing it. Every one of
   those is shipped here today.
2. **The agent-harness builder** — the person whose work product *is* multi-agent pipelines
   (evals, migrations, codemod sweeps, nightly triage). They need the graph, the templates,
   the joins, the runs-with-receipts, and the `tc` control socket to drive it from a script
   or from inside an agent. Nobody serves this person well; Vibe Kanban's company shut down
   in April and left them a community project.
3. **The migration/sweep engineer** — "apply this change to 60 packages," "port this test
   suite," "triage 200 issues." Fan-out with per-unit isolation and fan-in review is
   literally the job description of §2's differentiator.

**What they have in common — and this is the marketing sentence:** their bottleneck is not
writing code, it is *dispatching and reconciling work they did not watch happen.* They are
paying real money per day for agent time, they have more independent tasks than attention,
and they need a receipt. The median employed engineer on a team has none of those three
properties, which is exactly why the daily-path verdict came out weekly for them.

If you have to pick one: **#2, the harness builder.** They are few, they are loud, they are
the only segment for which the graph is the point rather than a bonus, and they will use the
`tc` socket, which is the app's most under-marketed asset.

---

## 5. The competitive risk, and the hedge

**Most likely obsolescence path in 12 months, ranked:**

1. **Anthropic extends Agent View from a list into a dispatcher with dependencies.** They
   already have sessions, statuses, waiting-detection, background tasks, worktree isolation
   and a dispatch input at the bottom of the table. Adding "run B when A exits clean" is a
   small step for them and it takes §2 away entirely, for free, inside the tool everyone
   already has open. **This is the big one, and it is not speculative — every ingredient
   shipped between February and May 2026.**
2. **Maestri out-executes on the canvas.** Native Swift, Metal, Liquid Glass, $18, three
   platforms, an on-device summarizer, and a solo author who is already there. If the pitch
   stays "an infinite canvas of agent terminals," this app loses that comparison on feel
   alone, and Electron is not a fixable disadvantage.
3. **Merge cost, not visibility, turns out to be the real ceiling** — and the tool that wins
   is whoever makes reconciling 8 branches cheap, not whoever displays 8 agents nicely.

**The hedge you should take now, and it is one choice:** stop competing as *a canvas* and
compete as *a runtime with a UI*. The graph, the ceilings, the plan/verb table, the outward
gate, the broker, the control socket and the runs-with-receipts are a **headless
orchestration substrate that happens to have a spatial front end.** If Anthropic ships
dependencies into Agent View, a canvas app dies and a substrate survives as the thing that
drives Agent View. Practically:

- Make the graph runnable **without the canvas** — `tc run <template> --params …`, printing a
  run receipt. That is one CLI verb over `runPlan`/`useRuns` and it converts the app's most
  defensible asset into something usable from CI, a git hook, and from inside another agent.
- **Ship ACP and stop writing per-vendor adapters** (M112 already diffed the surface and
  found no field to add — that is your answer, take it).
- Build the morning/resumption surface from §1. That is the daily hook and it is also the
  answer to risk #3: reconciliation is the thing nobody has made cheap.
- Freeze §3's list. Every hour spent on a thirteenth panel kind is an hour not spent on the
  only two things here that are hard to copy.

**The honest one-line bet assessment:** the canvas was the wrong thing to be right about, and
you were right about it anyway — which no longer matters, because two other people were also
right about it and one of them wrote it in Swift. The *graph with triggers, joins, ceilings
and receipts* is still yours alone. Point the whole product at it.

---

## 6. Competitors examined

All checked **2026-09-06**.

| Tool | What it does better | What it cannot do | Difference in KIND or DEGREE vs terminal-canvas | Source |
|---|---|---|---|---|
| **Claude Code** (v2.1.139+, Agent View May 11 2026; worktrees v2.1.49 Feb 2026) | Already open; free with the plan; subagents with own context/tools/permissions; background tasks + `/tasks`; `isolation: "worktree"`; `claude agents` dashboard showing status + who is waiting, with dispatch | No spatial layout, no cross-engine, no cross-panel graph with triggers/joins, no hard dollar cap (task_budget is advisory), no persistent workspace | **Degree** on everything except the graph. This is the app's real competitor and it is bundled. | [Agent View](https://claude.com/blog/agent-view-in-claude-code), [worktrees](https://www.claudedirectory.org/blog/claude-code-worktrees-guide), [subagents](https://www.tembo.io/blog/claude-code-subagents) |
| **Maestri** (macOS native, PH 2026) | Native Swift/Metal feel; agent↔agent PTY wiring by dragging a line; sticky notes agents write to; Partituras (templates); Floors (APFS CoW clones); device portals incl. iOS Simulator + real phone; on-device Ombro summarizer; $18 one-time; Win/Linux/Remote | Triggers/joins/runs/receipts; hard budget ceilings; a scriptable control socket; git review + commit in-app; per-panel durable scrollback | **Degree** on the canvas (they're ahead), **kind** on the trigger graph (you're ahead) | [themaestri.app](https://www.themaestri.app/en), [review](https://agent-finder.co/reviews/maestri), [PH](https://www.producthunt.com/products/maestri) |
| **TermCanvas** (v0.39, MIT) | Free and open; 3 platforms; 5 engines; worktree + status per agent; Hydra dispatch/watch/merge loop; pins → Linear/Notion/GitHub Issues | Trigger vocabulary, joins, priced runs, ceilings, review/commit node | **Degree**; it is the free version of the same pitch | [termcanvas.com](https://www.termcanvas.com/en/) |
| **Conductor** (v0.84.2, macOS) | Polished dispatch→isolate→review→merge loop; Claude Code + Codex + Cursor; free local, Pro $50/mo, Teams $60/user; cloud workspaces keep agents running after the app closes | Spatial canvas, graph, ceilings, terminals-as-nodes | **Kind** — different shape (list/review flow), and it is better at *merging*, which is the real ceiling | [conductor.build](https://www.conductor.build/), [overview](https://www.developersdigest.tech/tools/conductor) |
| **Crystal → Nimbalyst** (Crystal deprecated Feb 2026) | Nimbalyst: MIT, free for individuals, mac/Win/Linux **+ iOS/Android companion**; parallel worktree sessions; session kanban; WYSIWYG markdown/mockups/diagrams; MCP; Claude+Codex+OpenCode+Copilot+Gemini; Teams tier w/ realtime collab | Graph triggers, spatial canvas, budget ceilings | **Degree** — and it directly obsoletes the file/note/vault/annotation half of this app | [crystal](https://github.com/stravu/crystal), [nimbalyst](https://nimbalyst.com/), [pricing](https://nimbalyst.com/pricing/) |
| **Cursor 3.0 / 3.2** (Apr 2 / Apr 24 2026) | Agents Window across all repos, local+cloud; worktree isolation since 2.0; up to 8 parallel; `/multitask` auto-decomposes into async subagents; multi-root workspaces; it is the editor, so it's already open | Cross-engine, canvas, triggers/joins, hard cost ceilings | **Degree**, but with distribution you cannot match. Note the published guidance: start at 2–3, not 8. | [changelog](https://cursor.com/changelog/04-24-26), [agents window](https://www.agentpatterns.ai/tools/cursor/agents-window/) |
| **Warp** (universal agent support Apr 14 2026) | Terminal you already live in; arbitrary pane splits; vertical tabs + **tab groups**; per-tab git branch, cwd, diff stats, PR badges, live agent status badges across all tabs; Claude Code + Codex + Gemini CLI + OpenCode first-class | Spatial world/zoom, graph, worktree-per-panel automation, ceilings, priced runs | **Degree**. Warp's status badges are your state pills, in the tool that's open all day. This is the most dangerous "good enough". | [best terminal](https://www.warp.dev/articles/best-terminal-for-ai-coding-agents), [tab groups](https://alphasignal.ai/news/warp-ships-tab-groups-to-tame-chaotic-multi-agent-terminal-sessions) |
| **cmux** (free, macOS, Ghostty-based) | Multi-agent-aware terminal; pane alerts/notifications; built-in browser; **composable primitives over a Unix socket** (create workspace, split pane, notify, progress bar) so agents orchestrate themselves; people run 10 agents in it | Canvas, worktrees-as-product, graph, review layer | **Degree** — and its socket primitives are the same idea as `tc`, done more openly | [cmux guides](https://cmux.com/guides), [review](https://akmatori.com/blog/cmux-terminal-for-ai-agents) |
| **Zed 1.0** | Threads sidebar with parallel agent + terminal threads; **ACP** so any vendor's agent runs in-editor; multiplayer — humans and agents in one buffer/channel; Rust speed | Canvas, triggers, worktree-per-panel, ceilings | **Kind** (editor-centric, collaborative). Its ACP bet is the one you should copy. | [parallel agents](https://zed.dev/docs/ai/parallel-agents), [ACP threads](https://github.com/zed-industries/zed/discussions/48304) |
| **Claude Squad** (OSS TUI) | tmux + worktrees under the hood, one TUI, Claude/Codex/Gemini/Aider/OpenCode/Amp via configurable launch commands; free | No GUI, no graph, no review layer | **Degree** — this is the baseline with a nicer face | [review](https://vibecodinghub.org/tools/claude-squad), [list](https://github.com/andyrewlee/awesome-agent-orchestrators) |
| **Vibe Kanban** (Apache-2.0; Bloop shut down Apr 10 2026, community-maintained, now fully local) | Kanban card → worktree + branch per task; the "doomscrolling gap" framing | Abandoned by its company; no canvas, no graph | **Kind** (board-first). Its board is your M113–M116 board, two years earlier and free. | [orchestrators](https://www.augmentcode.com/tools/open-source-agent-orchestrators) |
| **Ona Canvas** | Infinite canvas over **cloud sandboxed** environments; 10+ in parallel; voice dispatch; governance/guardrails | Waitlist; cloud-only; not your local machine | **Kind** (cloud). The enterprise version of the same idea. | [ona.com/canvas](https://ona.com/canvas) |
| **tmux + git worktrees + N tabs** (the free baseline) | Zero install, zero learning, infinitely scriptable, already on the machine, survives everything | No awareness (who is waiting), no per-agent diff, no cost, no graph | **Kind** — and your app's honest advantage over it is *awareness + attribution*, not layout | [worktree guide](https://developer.upsun.com/posts/ai/git-worktrees-for-parallel-ai-coding-agents) |
| **Budget/ceiling landscape** | AWS Bedrock AgentCore spend ceilings (Aug 6 2026); Anthropic hard dollar cap on a Managed Agents session (Aug 7 2026); `task_budget` on Messages API is **advisory only**; LiteLLM/Helicone/Portkey for per-key budgets | None of these are per-panel, live, in a desktop orchestrator | **Kind** — your M82 in-process ceiling is genuinely scarce on the desktop | [gateways](https://www.getmaxim.ai/articles/top-ai-gateways-for-tracking-coding-agent-spend-in-2026/), [enforcement](https://waxell.ai/blog/ai-agent-token-budget-enforcement) |
