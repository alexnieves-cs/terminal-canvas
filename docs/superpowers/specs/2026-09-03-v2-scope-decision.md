# Terminal Canvas 2.0 — the agentic super-app run: what it contains, and what it does not

> **What this document is.** The decision record for the third run: the milestones M71–M95 in
> order, each with a definition of done, and every open backlog entry decided — in, cut, or
> rewritten down — with the reason. It sits beside `2026-09-01-v1-scope-decision.md` and
> `2026-09-02-v1x-scope-decision.md` and revisits both: several of their cuts were made for a
> product that was a terminal multiplexer, and this run's thesis (see
> `2026-09-03-v2-product-thesis-and-design-brief.md`) is that it stops being one.

**Status:** decided 2026-09-03, after M71 shipped and before M72. Amended in place, dated, when
a milestone changes shape; the build log records the change first.

**The number this starts from is M71**, which is fixed by the brief and already built.

---

## 1. The argument

The author's brief: make it an agentic super app; five surfaces that make it a different
category of tool are worth more than twenty-five that make it a better multiplexer; the
sentence "every node on this canvas is a terminal" must be false at the end and the app
better for it. Four hard constraints: no network auth (injected clients, Connect verbs, named
reasons), no push/tag/publish, unsigned build, the load-bearing invariants.

The candidate spine (Part B) is adopted as the ORDER and mostly as the content, with the
changes §2 lists. The five surfaces this run bets on, in the order they land, are: **the chat
panel** (M73), **approvals as a canvas affordance** (M76), **the task graph with runs and
templates** (M78–M80), **the supervisor** (M81) and **the watcher** (M84). Everything else
either serves one of those or is a decision recorded in writing.

**On the count.** The brief names twenty-five milestones. This document keeps the numbers
M71–M95 because the README's table is the roadmap contract and a gap in it reads as work
undone, but three of them are documents or decisions rather than features (M72, M91, M94)
and the run is judged on the five surfaces, not the count. If the run stops early, §4's
"if the plan is wrong" says which numbers are missing and the version is called
accordingly.

## 2. Where this overrules the brief or the previous decisions, in writing

- **The third `AgentKind` becomes a second HEADLESS backend (M90).** The brief's Act I asks
  for a third TUI row to prove `AGENT_CAPABILITIES` is a table. Codex 0.151 is installed and
  has `codex exec` — a non-interactive mode with JSON output and `resume`. A second runner
  behind M71's seam proves a stronger thing than a third row: that the conversation runtime
  is not Claude-shaped. The absent-CLI case gets its named reason either way. Moved from Act
  I to Act III because it needs the chat panel to have a customer for the seam first.
- **"Same agent, two front-ends" moves BEFORE the composer (M74, then M75).** The brief lists
  the composer second. The round trip between a terminal running `claude` and a chat node is
  the strongest claim in Act I and the one most likely to be impossible in one direction; it
  should be found out before the composer is built for a panel kind whose relationship to the
  terminal is unknown.
- **The web panel is declined, and the decision retires backlog #9's tier 3 and #14's tier 3.**
  Recorded here rather than spent on a milestone (§5). The brief said a decision in writing
  is worth more than the wrong one shipped.
- **The broker (M87) lands BEFORE the second tier-2 integration (M88), not after.** M14's
  spec says it is strictly easier to build on a store that never leaked, and GitHub through
  the broker is the design in which an agent can use a credential this app holds without
  ever seeing it — which is the only version of "an agent can talk to GitHub" this
  application should ship. Under the no-network constraint the broker is fully verifiable
  with an injected upstream.
- **The connector seam (M89) is derived from Jira and GitHub as the brief says**, but its
  deliverable is narrowed to what two integrations demonstrably share: a Connect verb, a
  credential row, a status ("connected as X" / "not connected — how to"), and a named
  disabled reason on every verb that needs it. No plugin API.
- **The previous decisions cut #27 placeholders, #13 clipboard images, #34 template sets,
  #48 lock/pin, #67 the time machine and #15 annotations.** Each comes back, narrowed, because
  the product changed: placeholders for SAVED prompts only (M75); images as base64 blocks in
  a chat message, which needs no temp file (M75); template sets as the parameterised
  workflow (M80); lock and pin because Acts I–III make the canvas too dense to fly casually
  (M92); the time machine and annotations because a canvas that is a workflow is a document
  (M93). The reasons those cuts gave are answered in each milestone's spec, not waved away.
- **The previous decision kept #55 ad-hoc task panels and #33 the minimap; both stand.**
  The watcher (M84) is #55's "a task rather than a shell" reached from the trigger side.

## 3. Every open backlog entry, decided

Read alongside `docs/ideas-backlog.md`. "Unchanged" means the previous cut stands for its
stated reason.

| # | Entry | Decision |
|---|---|---|
| 4 | Multiplayer | **Cut, unchanged.** One person, one machine. |
| 8 | Chat box; cross-vendor model | **In — M73 (the panel), M90 (a second headless backend).** The runtime is M71. Cross-vendor model choice in a chat panel is the backend choice, not a vendor table. |
| 9 | Integrations / super-app | **In, as the run.** Tier 1: the vault (M85), git (M86). Tier 2: GitHub through the broker (M87–M88), the seam derived (M89). Tier 3 (web): **declined, §5.** Tier 4: a no, unchanged. |
| 12 | Jira leftovers | **Partly in.** The Jira panel joins the connector seam (M89) — same Connect verb, same status row. Server/DC, OAuth 3LO, a second work-item provider: **cut, unchanged.** |
| 13 | Image drop / clipboard paste | **In, the chat half — M75.** A dropped or pasted image becomes a base64 image block in the message; main reads the file, nothing is written to a temp directory. The terminal half shipped in M59 (a path). |
| 14 | Panels that are other apps, tiers 2–4 | **Tier 2 (`.xlsx`) cut, unchanged** (a rendering library with one customer). **Tier 3 declined, §5. Tier 4 no.** |
| 15 | Annotation layer | **In, narrowed — M93.** World-anchored sticky labels and panel-anchored labels, as SVG in `.world`; an explicit mode from the palette; no ink. A canvas that is a saved workflow (M79) is a thing you annotate. |
| 19 | Accounting: history, second adapter, un-pinned panel | **History in — M79** (a run records its cost; runs are the retention store the entry asked for). Second adapter: M90 decides. Un-pinned panel: **cut, unchanged.** |
| 20 | Two windows | **Cut, unchanged.** |
| 23 | Focus mode (maximise) | **In — M92**, as "maximise": a layout mutation with a restore rect, commit on entry and exit. Its budget question is answered: it does not pin. |
| 24 | Links: selection, routing, port sides | **Selection in — M78** (a join and a condition need an edge to be selectable). Routing and persisted sides: cut, unchanged. |
| 26 | Toolbox: cross-panel query, editing | **Cut, unchanged.** The supervisor (M81) can answer "which panel can X" by reading toolboxes through `tc`; no fourth palette scope. |
| 27 | Prompt placeholders | **In, narrowed — M75.** `{{ }}` holes in SAVED prompts only, filled in a step before insertion; project prompts stay read-only and unexpanded, which keeps the previous decision's reason intact. |
| 28 | Accounts | **Cut, unchanged.** |
| 31 | Secrets rule | **Standing, and M83 (memory) and M87 (broker) each owe it an answer in their spec.** Memory entries pass through `redact.ts` on write; the broker holds the token in main and an agent never sees it. |
| 34 | Preset env overrides, template sets | **Template sets in — M80**, as the parameterised workflow grown out of presets. Env overrides: cut, unchanged. |
| 40 | Remote read-only view | **Cut, unchanged.** |
| 41 | Review's live-cwd resolution | **Cut, unchanged.** |
| 48 | Lock and pin | **In — M92.** Lock is one early return; pin is counted INSIDE `assignTiers`, capped with the focused panel at `LIVE_BUDGET`. |
| 53 | Live-tier cards | Shipped M63; unchanged. |
| 55 | Ad-hoc task panels | Shipped M65; the watcher (M84) is its triggered form. |
| 60 | Zoom-independent chrome | **Cut, unchanged**, with M92's maximise answering the far-zoom controls complaint. |
| 64 | Rationing terminal memory | **Cut, unchanged.** |
| 65 | Panes inside a panel | **Cut, unchanged.** |
| 66 | Images in the terminal | **Cut, unchanged.** A chat panel renders an image block; that is where an agent's picture lands. |
| 67 | Layout time machine | **In — M93.** Reset stays final: the snapshots are of SAVES, and reset's dialog says a snapshot exists. |
| 69 | HUD line | Shipped; unchanged. |
| 70, 72, 73 | Harness, hook namespace, flags | **Cut, unchanged.** |
| 74 | Updates | **Cut, unchanged.** |
| 77 | Link leftovers | **Cut, unchanged.** |

**Invented, in no backlog entry, and where the idea came from:**

- **The supervisor reads the canvas through `tc`** (M81). The app already has an external
  control surface an agent inside a panel can call; giving the supervisor a `tc status` verb
  makes the canvas model a tool the agent already knows how to use, with no MCP server and
  no second protocol.
- **Approvals as the attention popover's first real verb** (M76). M43 built the badge and the
  popover for `wants-you`; a permission request is the first `wants-you` that can be
  ANSWERED from there rather than only flown to.
- **The watcher's pass/fail as the state vocabulary** (M84). From the brief's principle 1: a
  watcher that turned red would need a new hue; mapping pass to `idle` and fail to `exited N`
  makes it a process like any other.
- **Runs as the cost history** (M79). Backlog #19 asked for retention and the run ledger was
  the store it named; a run is the unit a person would ask "what did that cost" about.
- **A second headless backend instead of a third TUI row** (M90). From reading `codex exec
  --help` on this machine.

## 4. The milestones

Each on its own branch, merged when `npm run verify` is green, with a spec and a plan under
`docs/superpowers/`, a build log, a fresh-context verifier, and — for every surface milestone —
`npm run shot` extended, my own look, and a fresh-context critic holding both briefs.

### Act I — the panel stops being a terminal

| # | Milestone | Definition of done |
|---|---|---|
| **M71** | **The agent-session runtime** | Done. See its build log. |
| **M72** | **The two documents** | This file and the thesis/brief, committed. No code. |
| **M73** | **The chat panel** (feature + surface) | `kind: 'chat'` as the sixth arm (`isTerminalPanel` extended; `verify:viewport 90b` restated for six); on disk with `agentSessionId`, `cwd`, `agentOptions`, absent/malformed rules in `verify:layout`. IPC: `agent:create/send/interrupt/dispose/answer/list/transcript` invokes and an `agent:event` send, in the contract and both diagrams. A durable per-panel transcript file under `userData/agent-transcripts`, written from the manager's `turn` events and read at restore, so a restored panel renders yesterday's turns with no process; the CLI session id stored so the first send resumes. `ChatPanel.tsx` through `PanelFrame`: transcript per principle 12, streaming through a per-panel store (never `registry.version()`), tool rows collapsed, thinking dim, the composer pinned, Send and Interrupt labelled. State mapped onto the vocabulary (streaming → `working`, a pending permission → `needs you`, rest → the turn count, exited → `exited N`). Spawn sheet and palette gain `New chat` beside the terminal verbs, disabled by name when `claude` is not on the login PATH. Closing disposes through the one kind guard (a `pty.kill` is never sent for a chat id — the 103/110/111 shape). Cost in the context pane from the session's usage. Checks in `verify:layout`, `verify:rail`, `verify:palette`, `verify:panels` (`chat.1…`: a chat spawns no PTY, a send streams, a restore renders the file, close sends no kill). Shot (`chat` scene), critic, verifier. |
| **M74** | **Same agent, two front-ends** (feature + surface) | `Open as chat` on a terminal panel pinned to a Claude session (M17's `--session-id`): a chat panel created with `resume` = that id, its transcript rendered from the CLI's own JSONL under `~/.claude/projects` through a reader that shares `shared/transcript.ts`'s block parser; disabled by name while the terminal's process is live (`stop it, then open it as chat`), enabled once it has exited or is dormant. `Open in terminal` on a chat panel: the session disposed, a terminal panel spawned with `claude --resume <id>` through the ordinary create path. Whichever direction the CLI refuses is recorded with the measurement, not faked. Both verbs three ways (chrome, context pane, palette). Checks against a fixture transcript directory; a hand run against the real CLI in the build log. Shot, critic, verifier. |
| **M75** | **The composer** (feature + surface) | `@path` references resolving against the panel's cwd through `fs:list` with a completion list; a dropped or pasted image attached as a base64 image block (main reads it; size-capped by name); a dropped file's path inserted; `/` opens the slash-command list from the CLI's `initialize` response merged with the panel's project prompts and the saved library, each labelled with its source; saved prompts with `{{name}}` holes get a fill-in step before insertion, project prompts never expand. The drop handlers keep cancelling (`verify:canvas` 5/6). Checks in `verify:palette` (the merged list, the source labels, placeholder parsing and fill), `verify:agent-session` (the image block on the wire), `verify:panels` (a reference resolves; a drop attaches). Shot, critic, verifier. |
| **M76** | **Approvals as a canvas affordance** (feature + surface) | A pending `permission-request` puts the chat panel in `needs you`: the card renders the question (tool, input in mono, Allow/Deny) at the live and summary tiers; the context pane's action bar carries the same two verbs; the attention popover's row for that panel carries them; the palette's `needs you` rows offer `Allow … / Deny …` by name; the OS notification names the tool and its click frames the panel. Answering anywhere clears every surface (main owns pending; the renderer never derives a second copy). A terminal panel's `wants-you` stays "this panel is waiting" with a `jump` verb, stated in the spec as the honest limit. Checks in `verify:rail`, `verify:palette`, `verify:panels` (`approve.1…`: answer from the popover without moving the camera; the card clears). Shot, critic, verifier. |
| **M77** | **Tool calls as inspectable objects** (feature + surface) | A chat panel captures a review baseline at create (through `captureBaseline`, keyed by panel id as terminals are), so the context pane's Changes section answers for it. A `tool_use` block whose input names a file (`file_path`, `path`, `notebook_path`) is a row that links to that file's review entry (`review:diff` for the panel and path); a review row lists the turns that touched its file, from the durable transcript. A tool row's result is expandable in place. Checks in `verify:review` (the turn-to-file index, pure), `verify:rail` (the row model), `verify:panels` (a real edit through the runtime is impossible offline, so the index is driven from a fixture transcript and a real baseline). Shot, critic, verifier. |

### Act II — the canvas as a workflow

| # | Milestone | Definition of done |
|---|---|---|
| **M78** | **The task graph** (feature + surface) | Handoff generalised: a target with several incoming handoff edges is a JOIN and starts when ALL have fired, carrying each source's output in order; a condition on an edge (`exit 0`, `exit ≠ 0`, `on idle`, `always`) decides whether it fires; a chat panel is a valid source (a turn's end is `idle`) and target (a handoff is a `send`); edges are selectable (a click on the midpoint selects, Delete removes, one undo restores) so a condition can be set from the context pane. Edge labels per principle 13; a cycle still refused. `useHandoff.ts`'s rules extended with the join's wait set, pure and in `verify:viewport`/`verify:merged`'s tier. Checks in `verify:panels` (`graph.1…`: a join fires once after both sources; a failed condition records `skipped` in the automation list). Shot, critic, verifier. |
| **M79** | **Runs** (feature + surface) | A named, saved record of one execution of a subgraph: which panels, which edges, when each started and ended, its exit or outcome, its cost (from usage) — in a `runs` record in the layout with absent/malformed rules, the ledger rows attached by panel and time. `Run again` restarts the roots in order through the existing restart path and records a new run. The context pane's Work tab lists the run a panel belongs to; the Workspaces pane lists runs with their cost; a run's panels are a group frame with the run's name as its caps label. Checks in `verify:layout` (the record), `verify:rail` (the rows), `verify:panels` (`run.1`: a two-panel handoff becomes a run with two rows and a cost). Shot, critic, verifier. |
| **M80** | **Templates** (feature + surface) | A selection of panels and their edges saved as a template with parameters (`{{repository}}`, `{{branch}}`, a prompt's holes) — a record beside presets, absent/malformed rules; instantiated from the spawn sheet with the parameters asked one by one, landing through the ordinary create path with placement; built-in `review this repository` as the first. Checks in `verify:layout`, `verify:palette` (the sheet's template rows and their parameter steps), `verify:panels` (`template.1`: instantiate, count the panels and edges). Shot, critic, verifier. |
| **M81** | **The supervisor** (feature + surface) | `tc status` — a read-only control verb returning the canvas model (panels with kind, title, state, cwd, cost; edges; runs) as JSON, in `control-protocol.ts` with `verify:control` checks. A supervisor is a chat panel spawned with a system-prompt append (the runner gains `--append-system-prompt`) that tells it to answer from `tc status`, with Bash restricted to `tc`; its first turn is sent at spawn ("what is the canvas doing?") and it re-asks on a setting's interval. One per workspace, offered from the spawn sheet, its summary line mirrored into the status strip. Checks in `verify:control`, `verify:agent-session` (the append flag), `verify:panels` (`supervisor.1`: `tc status` answers over the real socket with the real model). Shot, critic, verifier. |
| **M82** | **Budgets and queues that stop work** (feature + surface) | `agents.maxConcurrent` (a ceiling on running agents: chat sends beyond it queue in the manager with a named reason; a terminal spawn beyond it is refused by the spawn sheet with the reason and a `start anyway`) and `agents.budgetUsd` per canvas (when the canvas total crosses it: every streaming chat session is interrupted and further sends refused by name until raised; terminal agents cannot be paused and get a loud strip naming the ceiling plus `needs you`). Both `SettingDef`s; both re-read on the settings reload. Checks in `verify:agent-session` (the ceiling arm), `verify:layout` (settings), `verify:panels` (`budget.1`: a send beyond the ceiling is refused with the reason). Shot, critic, verifier. |
| **M83** | **Memory** (feature + surface) | A project-scoped, append-only store keyed by repository root under `userData/memory/<slug>.jsonl` — entries with a kind (`decided`, `tried`, `failed`, `note`), text, the panel and time — written through `tc memory add` and read through `tc memory list`, so any agent in a panel can use it; every write passes `redact.ts` and the setting's description says so (#31). A chat panel's first send carries the repository's recent entries as context (bounded, stated). A memory node (a document kind, seventh arm) renders the store for a repository, editable; the navigator's Files pane gets a Memory door. Checks in `verify:file` (the store), `verify:control` (the verbs), `verify:rail`, `verify:panels`. Shot, critic, verifier. |
| **M84** | **The watcher** (feature + surface) | `kind: 'watcher'` — a process node that runs a command on a trigger: a file change under a path (`file-watch.ts`), a git ref change, a timer, or another panel's exit/idle (the graph's edge); reports the last run's exit as `idle` (pass) or `exited N` (fail) through the state vocabulary, keeps its ledger rows, shows the last run's output tail in its body. Runs through a headless PTY-less `child_process` in main (its own small runner, not `AgentSessionManager`), never a terminal, never in `LIVE_BUDGET`. A watcher is a valid handoff source. Checks in `verify:file` (the trigger arms with a fake clock), `verify:layout`, `verify:panels` (`watch.1`: a file write triggers a run; the state flips). Shot, critic, verifier. |

### Act III — integrations, credential-free

| # | Milestone | Definition of done |
|---|---|---|
| **M85** | **The vault** (feature + surface) | Decided in its spec: a vault is a NAVIGATOR pane (the Files pane rooted at a folder of markdown, with backlinks resolved from `[[name]]`) plus the existing file kind in prose mode — not a new kind, because a note already is a file panel and a vault is many of them. Backlinks as a section under the note; a `[[link]]` click opens the target as a note; an agent writing a `.md` in the folder appears within the watch's second. Checks in `verify:file` (the backlink index, pure), `verify:rail`, `verify:panels`. Shot, critic, verifier. |
| **M86** | **Git, deeply** (feature + surface) | Ahead/behind against the tracking remote from `git rev-list --left-right --count` (no network — a fetch is never run), a branch picture across every worktree this app created for one repository (the worktree records plus `git worktree list`), and a cross-worktree review: one review node over N worktrees of one repository, each worktree's diff a section. Through `git-runner.ts`/`git-args.ts` only. The context pane's identity line names the repository (one of the small things). Checks in `verify:review` against a real repository with two worktrees. Shot, critic, verifier. |
| **M87** | **The broker** (runtime) | A loopback verb on the existing control socket: `tc api <service> <method> <path> [body]` — main looks up the service's credential in the store (never returned), attaches it, performs the request through an injected fetcher, and hands back status and body; the socket file stays 0600; every call is a ledger-style row (`service`, `method`, `path`, status, panel) so an agent's use of a credential is auditable; a service with no credential answers a named reason. No UI beyond the row. Checks in `verify:control` and `verify:credentials` with a fake fetcher and a real socket; `verify:meta` pins as source text that the broker module is the credential store's second and last reader after `credential-verify.ts`. |
| **M88** | **GitHub through the broker** (feature + surface) | A `kind: 'github'` work panel listing the authenticated user's assigned issues and open PRs through `main/github-client.ts` (injected fetcher, `WorkItem` shape, `verify:github` under plain node with recorded responses), a `Start session` per item as Jira has, and a Connect verb naming the credential row when none exists. An agent in a panel reaches the same API through `tc api github …`. Checks in `verify:github`, `verify:rail`, `verify:palette`, `verify:panels`. Shot, critic, verifier. |
| **M89** | **The connector seam** (feature + surface) | Derived from Jira and GitHub: one `Integrations` page in settings (and the navigator) listing every service with its state — `connected as <login>`, `not connected — add a token`, `token rejected` — one Connect verb each, the broker's audit rows under each; every panel verb that needs a service disabled with the same named reason. What the two do NOT share is listed in the spec as deliberately uncovered. `docs/dead-end-audit.md` gains the page. Checks in `verify:palette`, `verify:rail`. Shot, critic, verifier. |
| **M90** | **A second headless backend** (runtime + surface) | `codex-cli-runner.ts` and a `codex` transcript adapter behind M71's seam, measured against `codex exec --json` on this machine and recorded like M71's facts; the chat panel's spawn sheet offers the backend, disabled by name when the CLI is absent; `AGENT_CAPABILITIES` gains what the headless contract needs. Whatever `codex exec` cannot do (an interrupt, a permission question, resume) is a named reason in the panel, not a missing control. Checks in `verify:agent-session` against recorded Codex streams. Shot, verifier. |
| **M91** | **Decisions and the small things** | The web panel declined (§5, with a measured spike recorded in the build log); the rail widened (a frame decision, taken); the identity line's repository (if M86 did not); the far view's hairlines at 22% in dark; the launcher's verbs as invitations; the load-bearing reconciliation: a cheap diff of the archived M24 draft against main, folded back where still true, the rest listed. `npm run shot`, looked at, critiqued for the rail and launcher. |

### Act IV — the interface, and the ship

| # | Milestone | Definition of done |
|---|---|---|
| **M92** | **Lock, pin and maximise** (feature + surface) | Lock (drag and resize refuse, close still arms), pin (counted inside `assignTiers`, N pins plus focus capped at `LIVE_BUDGET`, named refusal beyond), maximise (the rect fills the viewport at the current scale, one SIGWINCH in and one out, the restore rect on the panel, undoable). Three ways each. Checks in `verify:viewport` (pins in the budget arithmetic), `verify:panels`. Shot, critic, verifier. |
| **M93** | **The canvas as a document** (feature + surface) | The layout time machine: the last N saves kept as snapshots beside `layout.json`, listed by time in the Workspaces pane, restored as a new workspace (never over the current one, so reset stays final and built-ins are never resurrected). Annotations: world-anchored and panel-anchored labels as SVG in `.world`, an explicit `Annotate` mode from the palette with a loud exit, persisted with absent/malformed rules, drawn on the minimap. Checks in `verify:layout` (snapshots, annotation records), `verify:viewport` (anchoring math), `verify:panels`. Shot, critic, verifier. |
| **M94** | **The second dead-end audit** | Every surface this run added walked; every row finished or disabled by name; keyboard reach for every new control checked by a real `sendInputEvent` where a click check exists; the manual-only list re-read entire — struck where honestly automated, extended where this run added a native surface. `docs/dead-end-audit.md` rewritten. |
| **M95** | **Ship 2.0.0 (or 1.2.0)** | The version; the README's milestone table and pictures-in-words; both IPC diagrams reconciled against the contract; CLAUDE.md and `docs/load-bearing.md` in agreement; both packaging gates run with the numbers; `graphify update .` and a full run if a key exists; the final report. **2.0.0 only if M73, M76, M78–M80, M81 and M84 all shipped** — the five surfaces §1 names. Otherwise 1.2.0, said plainly. |

### Sequencing rationale

- **Act I in this order** because the chat panel is the customer for everything after it;
  the round trip is found out before the composer invests in the kind; approvals need the
  panel and the popover; tool-call inspection needs a baseline the panel captures.
- **Act II after Act I** because a task graph with one node kind is the handoff M41 already
  built; it becomes a workflow when a conversation, a watcher and a supervisor are nodes.
- **The broker before GitHub** for M14's stated reason; the seam after both.
- **M90 late** so the seam has a customer before its second instance.
- **M92–M93 after Act III** because they answer a density the earlier acts create.
- **M94 and M95 last** by definition.

### If the plan is wrong

A milestone that stops being believed changes here, dated, with the reason; the build log
records it first. If the run must stop early, the milestones missing from the table are
named in M95's report and the version follows §4's rule.

## 5. The web panel, declined

Backlog #9 tier 3 and #14 tier 3. Three honest answers were named; this is the decision.

- **An `<iframe>` inside `.world`** transforms correctly and is the only version that would
  live on the canvas. It needs `frame-src` in the renderer's CSP, which is `default-src
  'self'` and stays so — a constraint this run does not relax — and most pages worth
  embedding refuse to frame. Declined.
- **A `WebContentsView` overlay** is positioned in window coordinates, does not pan, zoom,
  clip or z-order with the world, and would be repositioned per frame against every gesture
  the canvas has. It is a second application drawn over this one. Designing the seam "so it
  reads as intentional" is designing around a fact the product's whole spatial claim
  contradicts. Declined.
- **Off-screen rendering and compositing** (`offscreen: true` painting into a texture the
  world layer draws) is a project of its own with its own input-forwarding problem, and this
  application refuses to be a browser (thesis, "what it refuses to be"). Declined.

The decision retires both entries. What the thesis wants from a web page — a document beside
the agent that is working on it — is answered for local formats by file panels and for
services by the broker and a work panel. A page that is neither is opened in the user's
browser through `link:open`, which exists.

## 6. What this plan will still not prove

- No suite spawns a real `claude` or `codex`, reaches a real GitHub, or opens a real
  notification. Each is injected in a suite and confirmed by hand once; the manual-only list
  names them.
- The screenshot harness renders one machine's Chromium; a critic's report is evidence about
  a rendering.
- The broker's security claim is structural (source-text checks and an audit row), not a
  penetration test.
