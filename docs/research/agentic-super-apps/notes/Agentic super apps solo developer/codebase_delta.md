# Terminal Canvas since M352: what shipped, what is owed, and which features matter to a solo developer

Scope: internal-source research on the local repo `/Users/alexnieves/Documents/terminal-canvas` (branch `main`, HEAD `de59ca43`, 2026-09-27). Sources are `git log`, the per-milestone ledgers in `docs/build-log/m3NN-*.md`, the README milestone table (lines ~1157–1191), the user's run memory note (`~/.claude/projects/-Users-alexnieves-Documents-terminal-canvas/memory/terminal-canvas-opus55-run.md`), the earlier inventory `research_notes/Agentic super apps and beyond/codebase.md` (written at HEAD 4d3920c4 = M351, M352 uncommitted), and the earlier report `reports/Agentic super apps and beyond.md`. Citations are repo-relative paths or commit hashes, not URLs. **There is no single Opus-run ledger file.** The run keeps one ledger per milestone, each ending in `## Owed` and `Next:`. `docs/milestone-history.md` has no entry past 5.0, so its tail is stale for this range.

---

## Q1. What shipped from M353 to M387?

### Takeaway
The Opus 5.5 autonomous run (started 2026-09-26, local commits only, not pushed) landed M339–M387 on `main`. Numbers M362, M368 and M386 were never used: each is an owed item. Since M352 the work falls into seven themes:
- per-agent spend/context holds became real decisions (M354–M357, M367);
- plan-before-execution (M358–M359);
- cross-agent review as proposals (M360–M361);
- a capability query across agents (M365–M366);
- a decision audit trail, with a scrubbed and honest run ledger (M369, M371–M374);
- a multi-human team approval queue (M375–M379);
- sealed conversation replay (M381–M383), plus cache and context burn-down (M380), the ACP seam (M384), a server-side audit of shared actions (M387), and harness fixes (M353, M356, M363, M364, M385).

### Cited Findings

**Caps and holds (Arc 2.3, end of the per-node caps arc M350–M357)**
- **M354** `90324cce`: an agent's meter survives an app relaunch.
  - The transcript meta now carries `spentUsd`, the figure carried across processes, and never `costUsd`, which covers one process only.
  - `carriedMeter()` seeds the meter at `create`. An agent already past its cap relaunches held.
  - Source: `docs/build-log/m354-meter-survives-relaunch.md`; `src/main/agent-transcript-log.ts`, `src/main/agent-session.ts`.
- **M355** `f2fe4d92`: a held agent is a needs-you.
  - Main's approval tracker (`src/main/approvals.ts`) keeps a held set beside the pending set.
  - A hold reaches the attention store, the dock badge, ⌘J, an OS notification ("claude is held at its $2.00 spend cap ($2.10 reported)"), and the decision queue as a `cap` kind.
  - It files under its task as `blocked`.
  - Source: `docs/build-log/m355-hold-needs-you.md`.
- **M357** `51475b9b`: the queue row answers the hold.
  - **`Allow $N more`** re-grants the same allowance, counted from what the agent has reached ($2.00 more at $2.10 gives a `4.10usd` cap). For a context cap it adds a quarter of the cap. It runs the `cap-agent` verb as a person.
  - **`Stop`** calls `agent:terminate` and keeps the conversation.
  - Source: `docs/build-log/m357-hold-answers.md`; `src/shared/agent-session.ts` `allowMore`; `src/renderer/shell/Dock.tsx`.
- **M367** `05ab2049`: every other needs-you surface now words a hold as a hold. M199's blocker vocabulary gained a `cap` kind, used by the Inspector, the resume card, the task card and the review node. Source: `docs/build-log/m367-hold-words-everywhere.md`; `src/shared/run-outcome.ts`.
- **M356** `406836ef`: a resolved auto chip no longer pushes the chat header's close control off the panel. This was a CSS specificity bug. Source: `docs/build-log/m356-chat-header-chip.md`.

**Plan before execution (Arc 2)**
- **M358** `c64b427c`: claude's `ExitPlanMode` request is shown as a readable Markdown plan.
  - The answers are `Approve plan` and `Keep planning`.
  - Main refuses a session grant for `ExitPlanMode`, so no grant can pre-answer a later plan.
  - `Keep planning` tells the agent to revise the plan and present it again.
  - Source: `docs/build-log/m358-plan-before-execution.md`; `src/shared/transcript.ts` (`PLAN_TOOL`, `planOf`).
- **M359** `d0180468`: the queue row, task group, Inspector and resume card all say "has a plan to approve — <first line>", with a `Read plan` verb. Source: `docs/build-log/m359-queue-plan-words.md`.

**Cross-agent review (Arc 2)**
- **M360** `603c6205`: a review comment carrying `proposedBy` is an agent's proposal.
  - It is excluded from the person's open comments and from the follow-up.
  - While unread, it holds "verified" back.
  - The person keeps it (it becomes theirs) or discards it.
  - Source: `docs/build-log/m360-review-proposals.md`; `src/shared/review-comments.ts`.
- **M361** `0d85a35c`: `review-comment <panel> <path:line> <comment>` gets all four doors.
  - An agent's or workflow's door writes a proposal.
  - The Review swarm's review seat is now told to file each objection on its diff line.
  - Source: `docs/build-log/m361-review-comment-verb.md`; `src/shared/verb-table.ts`.

**Capability query (Arc 3)**
- **M365** `41035bf7`: "Which agents can…" is a palette `capability` scope.
  - The query is a skill, command, agent or MCP server name.
  - Every panel answers from its own toolbox: has, inactive, unknown or lacks.
  - Source: `docs/build-log/m365-capability-query.md`; `src/shared/toolbox-query.ts` (new).
- **M366** `d3cfe4c6`: `tc toolbox <name>` asks the same question from a shell. It is read-only and socket-only. Main's toolbox read was lifted into `src/main/toolbox-door.ts`. Source: `docs/build-log/m366-tc-toolbox.md`.
- **M370** `6f911437`: `tc task "…" --swarm <explore|implement|test|review>` opens Start work with an arrangement already chosen. It is still only a proposal that a person starts. Source: `docs/build-log/m370-tc-task-swarm.md`.

**Decision audit and run ledger (Arc 4)**
- **M369** `6592ca36` (+ fix `5b564df6`): the decision audit.
  - Main mirrors every person-sourced ledger row into `userData/decision-audit.jsonl`.
  - The file keeps 20,000 rows, ten times the ledger's 2000.
  - Each row is scrubbed by `redactSecrets`, with a count on the row.
  - It is read with `tc audit [--limit N]`.
  - Source: `docs/build-log/m369-decision-audit.md`; `src/shared/decision-audit.ts`, `src/main/decision-audit.ts`.
- **M371** `f7cf7b91`: two more decisions now reach the ledger and the audit: a cap set, and an agent proposal kept or discarded. An agent's lowering of a cap is recorded as the agent's, not the person's. Source: `docs/build-log/m371-decisions-on-record.md`.
- **M372** `143f708c`: the run ledger scrubs command lines and event titles at its one writer, with a `scrubbed` count, and `main/run-ledger.ts` joins `redactSecrets`' caller list. Source: `docs/build-log/m372-ledger-scrub.md`.
- **M373** `2ecf9505`: share, open-share and role changes are person rows on the record. Source: `docs/build-log/m373-share-decisions.md`.
- **M374** `6fcc31d5`: `RunLedger.append` now resolves true or false for whether the row landed, instead of swallowing a failed write. Source: `docs/build-log/m374-ledger-landed.md`.

**Team asks, a multi-human approval queue (Arc 2/4)**
- **M375** `167884d4`: a permission request can be recorded as a `SharedAsk` in the workspace Y.Doc (`canvas:asks`).
  - Each person answers allow-once or deny, in their own name.
  - Past a team spend line, two approvers are needed.
  - Source: `docs/build-log/m375-team-ask-record.md`; `src/shared/canvas-ops.ts`, `src/shared/canvas-doc.ts`.
- **M376** `63d5c9f0`: the owner's machine routes requests to the team.
  - It is controlled by `agents.teamAsks`, which is off by default.
  - `agents.teamEscalateUsd` sets the two-approver line.
  - Source: `docs/build-log/m376-team-ask-owner.md`; `src/main/team-ask-router.ts` (new).
- **M377** `cd12a091`: a teammate's side of the queue, over the `team:asks`, `team:ask-answer` and `team:asks-changed` channels. Source: `docs/build-log/m377-team-ask-doors.md`.
- **M378** `6d38262f`: Needs you gains a "Your team is asking · N" section. Source: `docs/build-log/m378-team-asks-needs-you.md`.
- **M379** `64593b5f`: palette rows for Allow once and Deny. These are a person's doors only: a plan or workflow node may never answer. Source: `docs/build-log/m379-team-ask-palette.md`.

**Cost visibility**
- **M380** `26ea7cb2`: the Work tab now shows two new figures.
  - **Cache return**: "caching saved $1.75 — $1.80 not paid as fresh input, less $0.05 more for writing it".
  - **A Window line**: "76k of 200k left — 62% used", using the context window the CLI reports.
  - Source: `docs/build-log/m380-cache-burn.md`; `src/shared/pricing.ts` `cacheReturnOf`; `src/shared/transcript.ts` `conversationWindow`.

**Replay (Arc 2's "encrypted session replay per node")**
- **M381** `fa802074`: `replayAt(turns, t)` rebuilds a conversation as it stood at any moment from the durable transcript.
  - It returns the turns up to then and each changed file, marked `exact` or `partial` with the reason.
  - A change counts only from its result: denied or failed edits change nothing.
  - `compareFrames` compares two nodes' frames.
  - Source: `docs/build-log/m381-node-replay.md`; `src/shared/replay.ts` (new).
- **M382** `35bbaf49`: every agent transcript line is sealed at rest (`enc1:` prefix) under the keychain key, through Electron `safeStorage`.
  - Older plaintext transcripts are rewritten sealed on first write.
  - A line this Mac cannot open is counted, never dropped.
  - Source: `docs/build-log/m382-replay-sealed.md`; `src/main/agent-transcript-log.ts`.
- **M383** `caad63f5`: the Replay sheet.
  - `Replay this conversation…` is on a chat's Activity tab and in the palette.
  - A scrubber over turns shows the files as they stood; opening one shows its content or its ordered edits.
  - It warns when shell commands had run, since they may have changed files the replay cannot see.
  - **Compare with** puts a second conversation beside the first.
  - Source: `docs/build-log/m383-replay-sheet.md`; `src/renderer/replay/ReplaySheet.tsx`.

**Seams and server**
- **M384** `9d77b21b`: the ACP remote-transport swap point is documented and pinned by checks.
  - The codec, adapters and manager reach an ACP agent only through `AgentProcess`, and only `main/agent-runner.ts` spawns.
  - A remote transport would therefore be one more `AgentRunner`.
  - **No remote transport was built** ("no stable spec to build to"). Hosting ACP stays declined (#81).
  - Source: `docs/build-log/m384-acp-seam.md`; `docs/architecture-map.md`.
- **M387** `dd91ad6b`: the collab server writes one `collab.audit` row per discrete shared action, keyed to the authenticated user.
  - Covered actions: panel create, retitle and remove; group; file share; relay bind; ask open, answer and close.
  - Moves and typing are summarised per connection.
  - The migration is `supabase/migrations/20260927120000_collab_audit.sql`, and the store is `createPgAuditStore` (`server/collab/persistence.ts`).
  - Neither is deployed.
  - Source: `docs/build-log/m387-shared-action-trail.md`.

**Harness and test fixes (no user-facing value)**
- M353 `a168a26d`: shots wait for "Reading changes…" to resolve.
- M363 `b6c8abe7`: the routine scene uses a pinned clock.
- M364 `84cd4d5e`: a discard-restore race in the harness.
- M385 `8c27ee31`: the panels harness clears composer drafts from localStorage.
- Sources are the matching `docs/build-log/` files.

### Inferences
- Almost everything added in this range strengthens **one person's control over their own agents**: holds, plans, proposals, replay, the audit and cost visibility. Only M375–M379 and M387 need a second human.
- The "Arc 3 super app" theme gained capability discovery, not new object kinds.

### Gaps
- The run's prompt and its "final report" are not in the repo. `m379`/`m384` say "Next: … the final report", but none was found under `docs/`. Arc status comes from the user's memory note, not a repo file.
- Neither `git show --stat` line counts nor the gate results of each milestone were checked in detail. Verdict lines in the ledgers were taken as stated.

---

## Q2. What is owed, deferred or blocked at the end of the run?

### Takeaway
Three milestone numbers were reserved and left unbuilt: M362, M368 and M386. Most other owed items are small UI debts. The large items are blocked on a person:
- the VM and DNS for collab and relay;
- a second machine;
- a real GitHub sign-in;
- a paid ExitPlanMode recording;
- phone hosting;
- Stripe.

### Cited Findings
- **M362 (owed): a golden of an agent proposal.** It needs a laned fixture task, one proposal written through the `canvas:plan` door, and a critic. — `docs/build-log/m360-review-proposals.md` "Owed"; `m366`/`m373`/`m374` "Next:" lines.
- **M368 (owed): the narrow chat header.** Beside the wider `needs you` pill, a resolved chip clips to `auto stuck di…` in a 560px chat. — `docs/build-log/m358-plan-before-execution.md` "Owed".
- **M386 (owed): panels-harness hermeticity.** `panels:shell` checks `98b` and `106` depend on localStorage state that earlier parts left behind. — `docs/build-log/m385-panels-fresh-storage.md` "Owed".
- **The hold is still not shown at rest.** A held chat's header still says `idle`. The chip "held — $2.10 of $2.00" has been owed since M352. — `m352`, `m355`, `m357` and `m367` "Owed".
- **A manual measurement is owed.** Someone must check by hand whether `total_cost_usd` is cumulative across `--resume`; if it is, the M350/M354 carry double-counts. — `m350-node-caps.md`, `m354-meter-survives-relaunch.md` "Owed".
- **A real ExitPlanMode request must be recorded.** It needs a paid plan-mode turn, to confirm `input.plan` is the whole input. — `m358` "Owed".
- **Cross-agent review has three gaps.**
  - A door's comment carries no quote or revision.
  - The canvas gesture does not use `newReviewComment`.
  - No panels check drives the verb end to end.
  - Source: `m361` "Owed".
- **The audit has no person-facing view.** `tc audit` is the only door; a palette scope or Orchestrate page is its own milestone. An account switch records nothing. — `m369` and `m373` "Owed".
- **The ledger's `scrubbed` count is not shown on screen.** — `m372` "Owed".
- **The team ask misreports a pending allow.** When the owner's allow is one of two needed, the owner's permission row still records "Allowed". — `m376`/`m378` "Owed".
- **The live two-machine team-ask run** needs a second machine and the collab VM. — `m376` "Owed".
- **The window figure is not carried across a relaunch.** Also, a 1-hour cache write is billed at 1.25× where it should be 2×. — `m380` "Owed".
- **Replay has three open items.**
  - The `unreadable` count is not shown in the sheet or the chat.
  - A terminal's replay (scrollback over time) is its own milestone.
  - Scrollback and check outputs are not yet sealed at rest.
  - Source: `m382`/`m383` "Owed".
- **The ACP remote runner itself** waits on a stable ACP remote-transport spec. — `m384` "Owed".
- **The M387 migration is not applied** to the live project, because no server is deployed. There is no owner-facing reader: the trail is read with SQL on the VM. — `m387` "Owed".
- **Blockers only a person can clear**, per the run memory note:
  - a real GitHub sign-in (`TC_PROBE_ACCESS_TOKEN`);
  - a VM and DNS for the relay and collab deploy (`TC_RELAY_SSH`, `TC_RELAY_DOMAIN`);
  - a second machine;
  - `TC_ALERT_WEBHOOK`;
  - a paid ExitPlanMode recording;
  - phone hosting;
  - a Stripe account, keys and webhook.

  The same note gives arc status: "Arc 3 complete except the phone companion (blocked: hosting); Arc 4: team up (M370), audit trail (…), Stripe blocked, sharding deferred". — `~/.claude/projects/-Users-alexnieves-Documents-terminal-canvas/memory/terminal-canvas-opus55-run.md`.
- **Baseline Electron reds carried by the run:**
  - `panels:agents template.1`, `detail.1`;
  - `panels:product starter.1` and `workflow.*`;
  - visual `starter`.

  Sources: the same memory note, and the `m363`/`m364` "Gate" sections.

### Inferences
- **Every hard blocker is team or infrastructure work**: deploy, second machine, Stripe, phone hosting. Solo-facing owed items (M362, M368, the rest-layer hold chip, the audit view, replay's `unreadable`, the cache-write rate) are all small and unblocked.

### Gaps
- The "phone companion" in Arc 3 is known only from the memory note. No spec or ledger in `docs/` describes what was designed or attempted for it. Backlog #40 (`docs/ideas-backlog.md` line 1087) is still the only written design.

---

## Q3. Which capabilities are solo-relevant, team-only, or both?

### Takeaway
Most of the app is single-user: it runs locally with main enforcing everything. The team-only layer is contained:
- accounts and orgs;
- presence;
- the Team view;
- the shared canvas CRDT and shared text;
- relay terminals;
- team asks;
- share decisions and roles;
- the collab server and its audit.

Several "both" features (the decision audit, capability query, swarms, the local-first sync chip) are fully useful to one person.

### Cited Findings (classification; sources are the files and ledgers named)

**Solo-relevant (fully useful to one developer, no account needed)**
| Capability | Where |
|---|---|
| Multi-backend chat runtime (claude, codex, copilot, ACP client), backend fit | `src/main/agent-session.ts`, `src/shared/agent-backends.ts`, `src/shared/backend-fit.ts` |
| Terminals with tmux survival, durable and searchable scrollback, OSC 133 | M38/M39/M52 build logs |
| Worktree per panel and lanes; review engine; lane merge; Combine; Integrate receipts | `src/main/worktree-manager.ts`, `review-engine.ts`, `lane-merge.ts`, `combine-runner.ts`, `integrator.ts` |
| Review comments, finished ≠ verified, check-output records, evidence and deliverables | `src/shared/review-comments.ts`, `review-readiness.ts`, `check-evidence.ts`, `src/main/task-evidence.ts` |
| Cross-agent review proposals (M360–M361): a second agent reviews and the person keeps or discards | `src/shared/review-comments.ts` `proposedBy` |
| Per-agent caps and meters (M350–M352), relaunch carry (M354), hold as a decision with Allow $N more or Stop (M355/M357/M367) | `src/main/approvals.ts`, `src/shared/agent-session.ts` |
| Plan before execution (M358–M359) | `src/shared/transcript.ts` `PLAN_TOOL` |
| Decision queue / Needs you / ⌘J / return briefing | `src/renderer/shell/decision-inbox.ts`, `src/shared/return-briefing.ts` |
| Cache return and context window burn-down (M380) | `src/shared/pricing.ts`, Work tab |
| Replay a conversation, files at any turn, compare two, sealed at rest (M381–M383) | `src/shared/replay.ts`, `src/renderer/replay/ReplaySheet.tsx` |
| Run ledger (scrubbed, honest about landing) and decision audit with `tc audit` (M369–M374) | `src/main/run-ledger.ts`, `src/main/decision-audit.ts` |
| Capability query: palette and `tc toolbox` (M365–M366) | `src/shared/toolbox-query.ts`, `src/main/toolbox-door.ts` |
| Routines (only while the app is open), watchers, auto modes, supervisors, pool runner, swarm presets, `tc task --swarm` (M370) | `src/shared/routines.ts` (`ROUTINE_LIMIT_WORD` = "runs while the app is open — not while it is closed"), `watch-trigger.ts`, `auto.ts`, `swarm.ts` |
| Workflows, recipes, packs, portable canvas, job journal and recovery | `src/shared/workflow-nodes.ts`, `recipes.ts`, `pack.ts`, `job-journal.ts` |
| Teammates as scoped agent identities (not humans), skills shelf, memory, vault | `src/shared/teammates.ts`, `skills.ts`, `src/main/memory-store.ts` |
| `tc` CLI and URL scheme; agent-line door (`tc plan`) | `src/cli/tc.ts`, `src/main/control-server.ts` |
| Credential broker, spend card, GitHub/Jira clients | `src/main/broker.ts`, `credential-store.ts` |
| Orchestrate view, Watch lens, focus view, task list, execution plan | `src/renderer/orchestration/`, `src/renderer/focus/` |
| Previews and browser, decks, sheets, notes, docx import, canvas PNG export | per the earlier inventory Q2 |
| Phone view (backlog #40, unbuilt): a solo user away from the desk is its primary audience | `docs/ideas-backlog.md` #40 |

**Team-only (needs a second human and, for most, the undeployed server)**
| Capability | Where |
|---|---|
| Accounts, orgs, invites, account picker | `src/main/account-auth.ts`, `docs/accounts.md` |
| Presence roster and cursors; teammate's agents on the roster (M349) | `src/shared/presence.ts`, `src/main/presence/presence-hub.ts` |
| Team view (observe or follow a teammate) | `src/renderer/team/TeamView.tsx` |
| Shared canvas CRDT, roles (owner/editor/viewer), shared text | `src/shared/canvas-ops.ts`, `canvas-doc.ts`, `src/renderer/shared-text/` |
| Share dialog and `tc share`/`open-share`/`share-role`; share decisions on record (M373) | `src/main/share-control.ts`, `bootstrap/presence-wiring.ts` |
| Team asks, a multi-human approval with a two-approver spend line (M375–M379) | `src/main/team-ask-router.ts`, `src/shared/team-asks.ts` |
| Collab server persistence and ops, and the server-side shared-action audit (M346–M347, M387) | `server/collab/`, `supabase/migrations/20260927120000_collab_audit.sql` |
| Local-first sync chip (M348): only meaningful for a shared workspace | `src/renderer/presence/SyncChip.tsx` |

**Both (built for teams, but with a solo use)**
| Capability | Solo angle |
|---|---|
| Pty relay (a terminal on a VM, one controller) | A solo developer could run a long job on their own VM and attach from anywhere. Not deployed. `server/relay/`, `docs/relay.md` |
| Collab server / Supabase | The only remote infrastructure. It would host any solo phone view or off-device run. |
| Decision audit (`tc audit`) | Framed as compliance, but "what did I approve yesterday" is a solo need. |
| ACP seam (M384) | Future remote agents, solo or team. |

### Inferences
- A solo-focused roadmap can ignore roughly the M330–M349 and M375–M379 and M387 layers. Its natural seams are the decision queue, caps, replay, lanes and review, routines and watchers, and the `tc` socket.
- Two items stand out as solo-needed but team-shaped infrastructure: the phone view and off-device runs both depend on the undeployed collab/relay server. A solo design might want a lighter path, such as a personal tunnel or push relay, instead of the org or Supabase stack. This is my assessment, not a repo statement.

### Gaps
- No usage data exists on how many users are solo versus team. The repo has no telemetry by design.

---

## Q4. Which earlier-report proposals are now done or partly done?

### Takeaway
- **Mostly done:** #1 (per-agent hold as a decision). What remains is the task-level budget envelope, the rest-layer "held" word and the forecast.
- **Partly done:** #9 (a decision/authority record exists, with no delegation chain and no OTel).
- **Adjacent work, not the proposal:** #3 (cross-agent review proposals exist, but no coverage-by-check) and #6 (replay and compare exist, but no fork).
- **Not started:** #2, #4, #5, #7, #10, #11.

### Cited Findings
- **(1) Held-at-cap → decision + task budget: mostly DONE for per-agent holds.**
  - Done: M355 `f2fe4d92` (hold as a `cap` needs-you, grouped under its task as `blocked`), M357 `51475b9b` (`Allow $N more` as a person's `cap-agent`, and `Stop`), M367 `05ab2049` (hold wording everywhere), M354 `90324cce` (carry across relaunch).
  - Also done: agent and workflow doors may only lower a cap (M352 `cf66bc08`), and a cap change is on the record (M371 `f7cf7b91`).
  - **Not done: a task-level budget envelope split across lanes.** No such type exists; a grep for task budget or envelope in `src/shared` finds none.
  - **Not done: a "held" chip at rest.** It is owed, and the chat header still says `idle` (`m367` "Owed").
  - **Not done: a spend forecast.**
- **(2) Collision radar between lanes: NOT STARTED.** No `git merge-tree` use anywhere in `src/` (grep). No ledger M353–M387 touches it.
- **(3) Verification-first review of uncovered code: ADJACENT, not the proposal.**
  - Shipped: an independent reviewer lane that files findings as proposals, never a verdict, and unread proposals hold "verified" back (M360 `603c6205`, M361 `0d85a35c`). This matches the report's "findings as review comments, never as a verdict" clause.
  - **Not built:** a per-hunk coverage map, a review that opens on unexercised hunks, and a caught-error log.
- **(4) A never-compacted rules channel: NOT STARTED.** `src/shared/transcript.ts` lists `'compact_boundary'` among `IGNORED_SYSTEM` subtypes (lines ~255–263), so the parser already recognises claude's compaction event and discards it. That partly answers the report's "measure first" condition: the stream-json event exists by name. There is still no rules set and no re-injection.
- **(5) The canvas as a local MCP server: NOT STARTED, and agent-facing reads grew instead.**
  - Grep finds no MCP server SDK in `src`/`server`; "mcp" appears only as an inventory kind (`tc toolbox <…|mcp-server>`).
  - Adjacent: `tc toolbox` (M366 `d3cfe4c6`) and `tc audit` (M369) are new read-only verbs on the local socket, and `tc task --swarm` (M370) is a new proposal verb. So the `tc` socket is still the proto-MCP.
- **(6) Fork an agent from a step: NOT STARTED.**
  - Grep finds no `fork` session code.
  - Adjacent: M381–M383 give a read-only rewind to any turn and a side-by-side compare of two conversations (`src/shared/replay.ts` `compareFrames`, `ReplaySheet.tsx`). That is the "compare" half of the proposal's UX, without branching or a worktree cut at a turn.
- **(7) Phone view: NOT STARTED, and BLOCKED.** The run memory note lists the "phone companion" as blocked on hosting. Backlog #40 is still open (`docs/ideas-backlog.md` line 1087). "phone" in `src/` means only preview device widths.
- **(9) Provenance/authority record + OTel export: PARTLY DONE (the record, not the chain or the export).**
  - Done: the decision audit (M369 `6592ca36`) with scrubbed rows and `tc audit`; cap and proposal decisions (M371); share decisions (M373 `2ecf9505`); honest landing (M374 `6fcc31d5`); a scrubbed ledger (M372 `143f708c`); a teammate's decision recorded "by a teammate on the team" (M376 `63d5c9f0`); a server-side authenticated trail of shared actions (M387 `dd91ad6b`, undeployed).
  - **Not done: the user → teammate scope → agent → tool → cap chain on each action.**
  - **Not done: OpenTelemetry export.** Grep finds no `opentelemetry` in `src`.
- **(10) Skills learned from accepted work: NOT STARTED.** No ledger M353–M387 touches skills or memory distillation, and grep finds nothing.
- **(11) Off-device runs: NOT STARTED; the seam was prepared.**
  - M384 `9d77b21b` documents the swap point for a remote ACP `AgentRunner`, with no runner built.
  - The relay and collab servers are still undeployed (the VM blocker).
  - `ROUTINE_LIMIT_WORD` still says routines do not run while the app is closed (`src/shared/routines.ts` line 40).

### Inferences
- **For solo-focused proposals, treat as shipped (do not re-propose):**
  - per-agent caps with Allow/Stop in the queue;
  - plan approval;
  - agent-review proposals;
  - replay and compare;
  - cache and context burn-down;
  - the decision audit via `tc audit`;
  - the capability query.
- **Open solo-relevant ground:**
  - a task-level budget envelope and forecast;
  - a rest-layer hold chip;
  - the collision radar;
  - coverage-first review;
  - a compaction-proof rules channel (the event is already parsed and dropped);
  - fork-from-turn, building on replay;
  - an MCP transport over `tc`;
  - a personal phone view;
  - learned skills;
  - a person-facing audit view;
  - terminal-scrollback replay and sealing.

### Gaps
- I did not run the app or the checks. "Done" means the ledger's verdict line says shipped and the commit is on `main`. Several goldens and hand checks are recorded as owed.
- Proposals #8 and #12 were outside the requested list, but neither appears in M353–M387.
