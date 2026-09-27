# Architecture map

> Split out of CLAUDE.md. The module-by-module record of what each seam is and
> what a change to it silently breaks. CLAUDE.md keeps the short version.

## Architecture

Three processes, one shared contract. **The main process owns every PTY; the renderer never
spawns a process.**

```
renderer --invoke--> pty:create / pty:write / pty:resize / pty:kill / pty:list --> main
renderer --invoke--> layout:load / layout:save                                 --> main
renderer --invoke--> session:backend                                          --> main
renderer --invoke--> preset:list / preset:rename / preset:delete               --> main
renderer --invoke--> preset:set-default / preset:spawn-by-id                   --> main
renderer --invoke--> preset:save-panel / preset:set-worktree                  --> main
renderer --invoke--> worktree:list / worktree:remove / worktree:reveal         --> main
renderer --invoke--> scrollback:tail / scrollback:clear                        --> main
renderer --invoke--> scrollback:search                                         --> main
renderer --invoke--> prompt:list / prompt:save / prompt:delete                 --> main
renderer --invoke--> template:list / template:save / template:delete           --> main
renderer --invoke--> preset:template                                           --> main
renderer --invoke--> settings:list / settings:set                              --> main
renderer --invoke--> canvas:request-reset                                      --> main
renderer --invoke--> agent:acknowledge                                         --> main
renderer --invoke--> workspace:list / workspace:create / workspace:rename      --> main
renderer --invoke--> workspace:delete / workspace:activate                     --> main
renderer --invoke--> workspace:merged / workspace:move-panels                  --> main
renderer --invoke--> review:panel / review:baseline / review:at / review:diff  --> main
renderer --invoke--> review:commit / review:discard                            --> main
renderer --invoke--> review:across / git:status                                  --> main
renderer --invoke--> credential:list / credential:set / credential:delete      --> main
renderer --invoke--> credential:verify                                         --> main
renderer --invoke--> file:open / file:read / file:close / file:write          --> main
renderer --invoke--> file:create                                              --> main
renderer --invoke--> fs:list                                                  --> main
renderer --invoke--> toolbox:read / toolbox:permissions                       --> main
renderer --invoke--> skill:write / skill:create / skill:rename / skill:delete --> main
renderer --invoke--> skill:trail                                              --> main
renderer --invoke--> github:list / broker:audit                                   --> main
renderer --invoke--> jira:list / jira:transitions                             --> main
renderer --invoke--> jira:comment / jira:transition                           --> main
renderer --invoke--> machine:sample                                           --> main
renderer --invoke--> diagnostics:sample / diagnostics:export                  --> main
renderer --invoke--> export:panel-text / export:canvas-png                    --> main
renderer --invoke--> env:report                                                   --> main
renderer --invoke--> link:open                                                    --> main
renderer --invoke--> ledger:list / ledger:usage                                   --> main
renderer --invoke--> memory:list / memory:add / vault:read                        --> main
renderer --invoke--> watcher:create / watcher:run / watcher:stop                   --> main
renderer --invoke--> watcher:dispose / watcher:list                               --> main
renderer --invoke--> spawn:sheet / spawn:recent / spawn:recent-used                --> main
renderer --invoke--> agent:create / agent:send / agent:interrupt / agent:dispose  --> main
renderer --invoke--> agent:answer / agent:list / agent:transcript / agent:import  --> main
renderer --invoke--> agent:clipboard-image                                       --> main
renderer --invoke--> attachment:clipboard-file                                   --> main
renderer --invoke--> agent:auto-start / agent:auto-stop                          --> main
renderer --invoke--> agent:grants / agent:revoke-grants                          --> main
renderer --invoke--> agent:pool-start / agent:pool-stop                          --> main
renderer --invoke--> teammate:list / teammate:save / teammate:delete             --> main
renderer --invoke--> teammate:choose-place                                       --> main
renderer --invoke--> routine:list / routine:save / routine:delete / routine:run   --> main
renderer --invoke--> snapshot:list / snapshot:restore                            --> main
renderer --invoke--> browser:read                                                --> main
renderer --invoke--> preview:discover / preview:capture                          --> main
renderer --invoke--> asset:put / asset:choose                                    --> main
renderer --invoke--> node:fetch                                                  --> main
renderer --invoke--> portable:export / portable:import                           --> main
renderer --invoke--> pack:read / pack:add / pack:export / preset:mark-reviewed   --> main
renderer --invoke--> pack:sample / github:publish (main asks the person first)    --> main
renderer --invoke--> board:lane / board:lane-status                              --> main
renderer --invoke--> board:open-pr / board:comment-pr                            --> main
renderer --invoke--> board:repositories                                          --> main
renderer --invoke--> shelf:list / shelf:save                                     --> main
renderer --invoke--> plugin:details                                               --> main
renderer --invoke--> update:check                                                --> main
renderer --invoke--> image:read / starter:prepare                                --> main
renderer <--send---  pty:data (batched ~16ms) / pty:exit                       <-- main
main     --send-->   edit:copy / edit:paste / edit:undo / edit:redo            --> renderer
main     --send-->   canvas:counts / canvas:model / canvas:reset / canvas:plan                              --> renderer
main     --send-->   preset:spawn / preset:default / preset:capture            --> renderer
main     --send-->   agent:state                                               --> renderer
main     --send-->   session:live / session:recover                            --> renderer
main     --send-->   subagent:state                                             --> renderer
main     --send-->   file:changed                                              --> renderer
main     --send-->   usage:panel                                               --> renderer
main     --send-->   attention:jump                                            --> renderer
main     --send-->   settings:changed                                          --> renderer
main     --send-->   spawn:open-sheet                                          --> renderer
main     --send-->   agent:event (batched ~16ms)                                 --> renderer
main     --send-->   watcher:state / vault:changed                                --> renderer
main     --send-->   routine:fire                                                 --> renderer
main     --send-->   canvas:tidy / canvas:flip                                    --> renderer
main     --send-->   canvas:feedback                                              --> renderer
main     --send-->   board:add                                                    --> renderer
main     --send-->   pool:mint (ephemeral reply) / pool:event                     --> renderer
```

**This diagram is a COPY, and `verify:meta` 19 pins the one in `README.md`, not this
one.** It has drifted before, silently and for several milestones — nine channels
(`jira:*`, `fs:list`, `file:write`, `file:create`, `machine:sample`, `diagnostics:*`)
shipped, were checked against the README by the suite, and were still missing here.
When adding a channel, edit BOTH; `src/shared/ipc-contract.ts` is the only authority
either one answers to.

The nine invokes M5b added all point the same way, and the direction is the point: M5a's
preset channels are main -> renderer because the *menu* is main's, while the palette is the
renderer's, so its mutations are invokes. Two of them exist purely so the palette runs main's
code rather than a second copy — `preset:spawn-by-id`, because only main can resolve an
*absent* `command` into the user's login shell (see "An absent `command` must stay absent"
below), and `canvas:request-reset`, because main owns the confirmation dialog and the counts
request. A renderer-side reconstruction of either would drift from the menu path silently, and
the two paths would then disagree only in the cases nobody tests.

The four `credential:*` invokes M14 added are the only ones on that list defined as much by
what they do NOT carry, and the absence is the milestone: there is no `credential:get`.
`credential:list` returns metadata (service, label, timestamps), `credential:set` and
`credential:delete` return a result, and `credential:verify` sends the token to GitHub and
hands back what GitHub said — so the plaintext exists in exactly one process and crosses the
bridge in neither direction. See "There is no `credential:get`, and its absence is the design"
below for why that claim is pinned as source text rather than as behaviour.

`canvas:counts` reverses the usual direction: main sends it and the renderer replies, on an
ephemeral `canvas:counts:reply:<timestamp>` channel invented per call in `main/ipc.ts` and
never declared in `ipc-contract.ts` — which is why `verify:ipc`'s "every channel has a handler"
check does not, and should not, cover it.

- `src/shared/ipc-contract.ts` — single source of truth for channels and the
  `window.canvas` bridge type. Imported by all three processes; add a channel here first.
  `verify:ipc` fails if a channel there has no main-process handler.
- `src/main/pty-manager.ts` — owns the `Map<PanelId, Session>`. All PTY lifecycle.
- `src/main/window-lifecycle.ts` — detaches (not kills) a window's sessions when its renderer
  navigates or closes, so their tmux sessions survive; see "One operation became three" below.
- `src/main/credential-store.ts` — the encrypted-at-rest credential store, over its own
  `userData/credentials.json`. Takes its crypto and its file path as injected dependencies
  (`credential-crypto.ts` is the `safeStorage` adapter), so the whole store — the refusal path
  included — runs under plain node in `verify:credentials`. Its `read()` is the one function
  in the app that returns a plaintext token, is main-internal by construction, and has exactly
  one caller: `credential-verify.ts`.
- `src/main/worktree.ts` / `src/main/worktree-manager.ts` — M37. The pure half names a
  worktree (`tc/<panelId>-<stamp>`) and places it under `userData/worktrees`; the manager
  runs `git worktree add`/`remove` through the injected `GitRunner` and keeps records in
  `layout.json` beside baselines. `PtyManager.create()` consults it BEFORE the baseline
  capture, which is why the review engine needed no change. Records outlive their panel;
  see "A worktree record OUTLIVES its panel" in `docs/load-bearing.md`.
- `src/main/agent-session.ts` — M71. `AgentSessionManager`: a main-process CONVERSATION with
  the installed `claude` in headless mode (`-p --input-format stream-json`), not a PTY.
  Ids are the caller's; the CLI session UUID is minted here and pinned with `--session-id`,
  then named by `--resume` on every later spawn; the process is spawned on the first `send`,
  not on create; turns are assembled from the CLI's complete records and deltas are batched
  at 16ms for the screen; usage is summed per result and cost is the latest result's
  cumulative figure; every process callback is gated on session AND process identity (the
  M61 rule, second layer). `shared/transcript.ts` is its schema and line parser,
  `agent-runner.ts` the injected process seam, `claude-cli-runner.ts` the real one (never
  bundled into a suite). No IPC channel names it until M72.
- `src/renderer/chat/` — M73. The chat panel: `ChatNode.tsx` through `PanelFrame` (which
  gained a `state` prop so a process kind that is not a terminal paints its state), a
  per-panel store mirror (`chat-store.ts`, never `registry.version()`), a pure model
  (`chat-model.ts`: rows, the live-block merge, the composer's named arms), and
  `useChatSessions.ts` (create once per id; disposal explicit at the removing sites).
  `main/agent-transcript-log.ts` is its durable file. The three doors (palette row, launcher
  line, spawn sheet) share `claudeAvailable(presets)` and `REASON_NO_CLAUDE`.
- `src/renderer/chat/composer-model.ts` — M75. The composer's pure rules: a `@`/`/` trigger only
  at a token start with the caret inside it, completion application, `{{hole}}` names and fill
  (a hole with no value stays as typed; a project prompt is never expanded), attachment kinds,
  directory-first file completions. `main/attachments.ts` resolves a dropped image's path or a
  pasted image's bytes in MAIN, refusing by name (not an image → reference it by path; over the
  5 MB cap; missing); an image rides the wire as a base64 block and the transcript as a
  placeholder (`{ type: 'image', mediaType, size }`), never as bytes. `chat-store.ts`'s insert
  bus carries the palette's prompt row and a drop into the composer.
- `src/main/approvals.ts` — M76. Main owns pending: the tracker turns the agent runtime's
  permission events into `agent:state` `wants-you`/`idle` on the TERMINAL's own channel (so
  every attention surface lights with no code of its own) and drives the M43 sink on ENTRY
  only; `createAttentionUnion` gives PtyManager and the tracker one child sink each and the
  dock badge reads the SUM. `chat-store.ts`'s `useApprovals()` is the renderer's cached list
  of every pending request (membership change only); the popover, the pane, the palette and
  the card's summary tier all answer through the one `agentSession.answer` verb.
- `src/shared/tool-index.ts` — M77. The tool-call → file index, pure over transcript turns: a
  tool names a file only through `file_path`/`path`/`notebook_path` as a string (a Bash command
  mentioning a path names nothing); `matchReviewPath` maps a tool's path to a review row —
  relative under the root, else the longest row the path ends with, because git reports the
  root's REAL path and an agent's cwd is the logical one. `agent:create` fires the same
  `captureBaseline` PtyManager does, keyed by the chat's id, so `review:*` answers for a chat;
  a chat's baseline survives a relaunch (the conversation resumes). `reviewable` on the
  inspector model and the palette row is per kind, with the chat's own reason.
- `src/shared/handoff.ts` / `src/renderer/canvas/handoff-rules.ts` — M78. `handoffFires` is
  the ONE table over five triggers (`exit`, `idle`, `exit-ok`, `exit-fail`, `always`) and two
  events; nothing else decides whether an edge fires. `incomingHandoffs`/`joinAdvance` are the
  join: a target with several enabled edges starts once, when the last expected source arrives,
  payloads in panel order; `useHandoff.ts` holds arrivals in a ref beside M41's queue. A chat is
  a process kind at either end (its `result` is the source's `idle` through the chat store's
  `onChatTurnEnd`; a target receives through `agentSession.send`, which spawns an asleep chat).
  An edge is selected by a CLICK on its hit stroke (click, never mousedown — the background's
  mousedown clears every selection first and reads nothing from the target, M35's rule); the
  hover badge stays M35's remove; `Canvas.tsx` owns `selectedLink`, Delete/Escape, and
  `edgeLabels` (principle 13).
- `src/shared/runs.ts` / `src/renderer/canvas/run-model.ts` / `useRuns.ts` — M79. A RUN is one
  execution of a subgraph, recorded — `PersistedRun` on the workspace beside groups and
  bookmarks with the record rules (absent is every pre-M79 file; malformed dropped by name; an
  entry naming a missing panel dropped, the run kept; `RUNS_MAX` newest). `componentOf` is the
  connected subgraph over ENABLED handoff edges at the run's start, held in the recorder's ref
  so an edge changed mid-run does not move the goalposts; the reducer records the handoff
  hook's events (it observes, never decides) and seals when every sink has an outcome, pricing
  the panels' usage by the summary's rule. Run frames are DERIVED read-only group frames
  (`run:<id>`), never groups. `Run again` restarts the terminal roots through
  `restartWithSpec`; a chat root is skipped by name.
- `src/shared/templates.ts` / `src/renderer/palette/template-model.ts` — M80. A TEMPLATE is a
  shape of work: nodes (a terminal or a chat, with a directory, a title, a command or a preset,
  a chat's first message) and edges over M78's triggers, saved top level beside `presets` with
  the record rules — a dropped node takes its edges with it, and the template stays. The
  built-ins are code (`BUILT_IN_TEMPLATES`, `allTemplates`), and a built-in refuses deletion.
  `{{parameters}}` use the COMPOSER's own regex, imported: a template's parameters and a
  prompt's holes are one idea. Instantiation mints each node through the ordinary path — a
  preset node through main's `spawn:sheet` (only main resolves an absent command, M5b) and
  its panel learned from the array delta; a command node and a chat minted here — then the
  edges through `setLinkAutomation` (which is what refuses a cycle), all in ONE history entry.
  A chat's message is INSERTED into its composer, never sent.
- `tc status` (`control-protocol.ts`, `control-handler.ts`, `canvas:model`) — M81. A fifth
  control verb, READ-ONLY by construction: its arm has no spawn, focus, write or kill in it,
  and it is refused at the URL door (M54 restricted that to `open`; a URL has nowhere to put a
  reply). Its model comes from the RENDERER over the ephemeral reply channel `canvas:counts`
  already uses — the renderer is the only side that knows a panel's state WORD, its edges and
  its runs — and a window that does not answer yields an empty model WITH a note. Everything
  it reads comes from refs: the answer is installed once, and a captured `dormantIds` told a
  supervisor a woken panel was asleep while the pill beside it said `idle`. The supervisor
  itself is a chat created with `SUPERVISOR_PROMPT` through `--append-system-prompt`, which
  rides EVERY spawn (the CLI keeps no record of it, so a resumed supervisor without it would
  stop being one); `ChatSource.supervisor` is what a relaunch reads.
- **The two ceilings** (`agent-session.ts`'s `limits` dep, `agents.maxConcurrent` /
  `agents.budgetUsd`) — M82. Both read LIVE on every send and every result, both `0` for no
  ceiling (which is every caller that passes no `limits`). A send past the concurrency ceiling
  QUEUES — the same queue an in-flight turn uses, with `reason: 'concurrency'` so the panel can
  say which queue it is in. A send past the budget is REFUSED and stores nothing: a refused
  message is not a turn, and a transcript holding it would show the user a message the agent
  never received. A crossing INTERRUPTS every turn in flight (never kills — a killed agent
  loses its turn, and a budget is a stop) and says so once, latched until the ceiling is
  raised above the spend. The spend is the sum of the sessions' own `costUsd`, the CLI's
  cumulative figure; a session with no figure counts as nothing.
- `src/renderer/shell/integration-model.ts` / `IntegrationsPane.tsx` — M89. The seam
  DERIVED from Jira and GitHub: one row per DECLARED service (a service that vanished from
  the page would read as unsupported), three closed states where the durable `rejectedAt`
  mark — set by `credential:verify` on a 401/403 in both verify paths, cleared by omission
  on the next success, never written as `undefined` — outranks a verified date, one verb,
  and the broker audit's rows beneath (`broker:audit`, the FIRST reader of the audit,
  metadata by construction). `notConnectedReason` in `shared/credential-schema.ts` is the
  one sentence every door imports, and the broker's refusal carries `code: 'not-connected'`
  so a client sorts by the code and never by the text.
- `src/main/github-client.ts` / `src/renderer/github/GithubNode.tsx` — M88. "GitHub through
  the broker", literally: the client asks the broker for `GET /issues?filter=assigned` and
  `GET /search/issues?q=is:pr review-requested:@me` and NEVER reads the credential store, so
  the store keeps its three pinned readers and every read the panel makes is an audit row.
  Two lists become `WorkItem`s keyed `owner/repo#N` (a PR under the issues list is a PR
  once; a review request replaces its issue-list twin); the PR search failing alone leaves
  the issues standing with a `note`. `github:list` is its one invoke. The ninth kind is
  sessionless like Jira's; both work panels spawn through ONE `spawnWorkItem(item, source)`
  in `Canvas.tsx`; the palette's `Open GitHub work` row is PRESENT without a credential and
  disabled with `REASON_NO_GITHUB`, where the Jira door only exists once a credential does.
  `verify:github` runs under plain node over a fake broker with recorded bodies.
- `src/main/broker.ts` / `src/main/broker-audit.ts` — M87. The credential store's LAST
  reader (`verify:meta readers.1` pins the set as exactly `credential-verify.ts`,
  `jira-client.ts`, `broker.ts`): `tc api <service> <method> <path> [body]` reaches it through
  the control handler ONLY — no IPC channel names it, so the renderer can neither spend a
  credential nor see what an agent spent. The service table is closed (github: bearer at
  api.github.com; jira: basic auth at the credential's own site under `/rest/api/3`), the
  path is checked before the token is read, every call and every refusal is one audit row of
  metadata under `userData/broker-audit.jsonl`, and the token appears in no reply, row or
  refusal. The real fetcher (`createHttpsBrokerFetcher`) is never CALLED by a suite — it rides in the credentials bundle beside the verifier's fetcher, and every check drives a fake.
- `src/main/git-args.ts` (`buildAheadBehindArgs`, `parseAheadBehind`, `parseWorktreeList`,
  `buildMergeBaseArgs`) / `src/main/review-engine.ts` (`status`, `reviewAcross`) — M86. NO
  FETCH is built anywhere in `git-args.ts`, and `verify:review git.1` asserts that as text;
  ahead/behind is what the local tracking ref says and every surface says `against the last
  fetch` beside it. `reviewAcross` lists the main tree first, then one section per worktree
  record (the engine's optional `worktreesOf` dep), each worktree's diff being its diff
  since its FORK (`merge-base HEAD <root HEAD>` in the worktree) — never a panel's baseline,
  which main drops on kill. A review subject's `across: true` flag (absent means the ordinary
  node) is what makes `ReviewNode.tsx` ask it and render sections with commit and discard
  blocked by name.
- `src/shared/vault.ts` / `src/main/vault-read.ts` / `src/renderer/shell/VaultPane.tsx` — M85.
  A vault is NOT a panel kind: a note is a file panel in prose mode (M27) and a vault is many
  of them plus an index. `shared/vault.ts` is the `[[name]]` syntax (strict: a reference link
  and an unclosed `[[` are text) and `buildVaultIndex` (names by basename and by relative
  path, backlinks with lines, never a note against itself); `main/vault-read.ts` walks the
  root for `.md` in main with both caps REPORTED; `renderer/canvas/useVault.ts` reads on the
  `vault.root` setting and on every `file:changed`, freezes the rows on a signature and builds
  the index once per read. A note inside the vault opens to READ (its links are the point),
  and its links and Backlinks section come from the same index the pane lists from.
- `src/main/watch-runner.ts` — M84. The watcher's runner: one command per watcher, run
  when its trigger says so, with NO pty anywhere in it. The process seam is injected
  (`agent-runner.ts`'s shape), so the coalesce, the exit arms, the capped tail and the ledger
  row all run under plain node in `verify:file watch.1`. ARMING is `main/index.ts`'s — a
  recursive `fs.watch` for a directory, `FileWatchers` for a file (including a git trigger's
  `.git/HEAD`), an interval for a timer — and the `panel` trigger is the RENDERER's, fired
  from the same events and the same `handoffFires` table the graph's edges ask.
  `shared/watch-trigger.ts` is the union and the one phrase every surface says it with;
  `renderer/watcher/` holds the node, the per-panel store mirror and the palette's parse.
- `src/main/memory-store.ts` — M83. The project memory: ONE append-only JSONL per
  repository under `userData/memory`, named by the root's slug (the scrollback log's shape),
  every write scrubbed by `shared/redact.ts` and carrying its `redacted` count, ring-trimmed
  at `MEMORY_MAX` (500), a malformed line skipped and counted, a missing file EMPTY rather
  than an error. Its `dir` and `now` are injected, so `verify:file memory.1` drives the real
  store under plain node. `main/index.ts` resolves a directory to its REPOSITORY ROOT before
  every read and write (`memoryRoot`), which is the single reason the node, a chat's
  first-send context and `tc memory add` share one list. `renderer/memory/MemoryNode.tsx` is
  the seventh panel kind — sessionless, three states, an add line writing through the same
  store — and `renderer/chat/memory-context.ts` is the bound the chat's first message carries
  (`MEMORY_CONTEXT_MAX`, 4 KB) and states above the composer before it sends it.
- `src/shared/verb-table.ts` / `src/shared/plan.ts` / `src/shared/outward.ts` — M96. The
  closed verb table (each verb: args, `destructive`, the `PaletteActions` members it runs
  through) and `EXCLUDED_ACTIONS`, the members no plan may reach with a reason each;
  `verify:verbs closure.1` reads the interface as TEXT and fails for a member on neither list,
  so a verb appended later must be chosen. A plan is data: `buildPlan` binds and refuses by
  name (unknown verb, missing argument, a panel that is not an agent for `type` — decided by
  KIND through `acceptsTyping`, never a string check on the command; a setting without
  `planWritable`), and gives a destructive step its `confirm`, which `runPlan` will not skip.
  `outward` is the ONE gate pane content leaves through (`redactSecrets` + a note naming the
  source and the count). The executor is `usePaletteActions`' `beginRunVerb` — the only place
  a verb's meaning lives. There is no `kill` (two lifetimes; `pty.kill`'s two callers).
- `src/shared/auto.ts` and `AgentSessionManager.startAuto`/`stopAuto` — M97. A mode is a prompt
  vocabulary and a turn limit MAIN enforces on every result (the renderer's chip is a
  projection of the `auto` event and can never move the stop); `done` on `AUTO_DONE_MARKER`,
  `stuck` with a reason (`limit`, `permission` after a grace with the question still pending,
  `exit`, `budget`), `stopped` by hand. The opening prompt goes through the ordinary `send`, so
  M82's ceilings apply unchanged; the continuation is sent AFTER the queue. A mode validates as
  a plan (`validateAutoMode`), so a destructive verb without its confirmation is refused. The
  recorder (`useRuns.onAutoEvent`) opens a one-panel run and seals it with its cost.
- `src/main/approvals.ts`'s grants and `agent-session.ts`'s `preAnswer` — M98. `Allow for
  session` is a grant keyed by session AND tool, held in main beside pending (main owns
  pending, so main owns granted), cleared on `disposed` and kept across `exited`, and written
  NOWHERE (`verify:agent-session grant.2` reads the store, the schema and the transcript log
  as text). The manager asks `preAnswer` in its `permission-request` arm and answers `allow`
  to THIS process before the request is ever pending, emitting `permission-auto-allowed`, so no
  attention surface lights. `agent:answer` carries `scope?: 'session'` — one door; the card
  alone shows the third verb. The pane's `Session grants` field has four arms, codex's a
  named reason from the registry.
- `src/shared/agent-backends.ts` / `src/main/backend-adapters.ts` — M99. `BACKENDS` is the ONE
  table per backend (capabilities and every named reason); `AGENT_CAPABILITIES.headless` is
  derived from it and M90's `REASON_*` constants are aliases of its rows. **No consumer
  switches on the backend name**: `verify:agent-session registry.1` greps `src/` for
  `backend === '<member>'` and `case '<member>'` and requires the only hit to be the layout
  parser. The by-name copy sites use `carryBackend`; the sheet's rows come from `BACKEND_IDS`
  (`backendOptions`), disabled by name when a binary is absent. ACP is declined by name in the
  Act I spec — no ACP-speaking CLI on this machine to measure. M112 re-read that premise (an
  ACP agent is now one `npx` away) and diffed ACP's methods against the table in
  `docs/acp-registry-diff.md`; no field added.
- `src/shared/teammates.ts` / `src/shared/places.ts` / `src/main/places.ts` — M100. A teammate
  is a record saved top level with the record rules (`parseTeammates`; `carryTeammate` at every
  by-name copy); a chat carries `teammateId` and MAIN appends the brief from its own roster on
  every spawn. `insidePlace` decides on the REAL, normalised path with an injected `realpath`:
  `..` out, a symlink out, and a relative path (refused, never resolved against a root) are each
  a check (`verify:teammates places.1–.3`); no places is nothing. `createPlacesGate` is asked in
  `agent:create` and `spawn:sheet` BEFORE `resolveCwd` (whose home fallback would launder a
  refused folder). The gate bounds what the app does for a teammate; the CLI's own tool calls
  are the CLI's permission system's.
- `src/shared/routines.ts` / `src/main/routine-runner.ts` — M101. A routine is a scheduled
  fresh chat as a teammate. `routineRefusal` refuses at SAVE by name (a destructive verb in the
  plan line against M96's table, no `scheduling` permission, under a minute, no prompt). The
  runner arms one interval per unpaused routine in main over injected timers, marks a tick that
  fell while the app was closed as MISSED with the due time (never fires it), and `routine:fire`
  hands the tick to the renderer, which mints the chat, sends the prompt under `ROUTINE_PROMPT`
  and reports through `routine:save`.
- `src/main/broker.ts`'s `services`/`approve` deps and `AgentSessionManager.askExternal` — M102.
  A request naming a teammate is refused `not-granted` BEFORE `store.read` (three readers stay
  three); a WRITE (any method outside `READ_ONLY_METHODS`, data) asks on the teammate's chat
  through `askExternal` — a question on the session's pending set that resolves through the one
  `answerPermission` without writing to the process, honours M98's grants, and dies `false` with
  the session; `not-answered` refuses a write nobody could approve. The teammate is derived in
  main from the asking PANEL, never from a `tc api` field.
- `src/main/browser-read.ts` / `src/renderer/browser/BrowserNode.tsx` / `shared/browser-panel.ts` —
  M103. The browser pane is a `<webview>` GUEST — the one shape that pans, zooms, clips and
  z-orders with the world (M0 measured it; an iframe is refused by the renderer's CSP, which is
  NOT relaxed, and a `WebContentsView` does not follow the transform, M91). `webviewTag: true`
  is the setting Electron's docs discourage, and every property they warn about is closed by
  name in `main/index.ts` — `will-attach-webview` strips `preload` and forces nodeIntegration
  off / contextIsolation on and refuses a non-http(s) `src`; the `persist:tc-browser`
  partition's permission handler answers `false` to every ask; the attached guest's
  `setWindowOpenHandler` denies every new window — and `verify:meta browser.1` reads all five
  as text. The node creates the guest IMPERATIVELY, keyed on the panel id alone (an effect
  keyed on the record's url would rebuild the guest on every navigation), and the readout
  (`data-browser-url`) and the record's url are set from the guest's own `getURL()` on
  `did-navigate`/`did-navigate-in-page` and from nothing a page can write. Reading the pane
  is LEAVING THE APP: `browser:read` is main's — the guest resolved by the id the node
  registered and checked to be a webview, the scheme checked on the LIVE url (a navigation
  gate alone leaves `about:blank` and a `data:` redirect readable), the text capped inside
  the guest, then `outward(text, 'a remote page at <host>')`; `browser-read.ts` is the only
  file in `src/` that calls `executeJavaScript` (`verify:verbs gate.3`). `browser-store.ts`
  is the per-panel guest record (id and reload), cleared at the four panel-removing sites
  beside `disposeWatcher`; an `exit-ok` edge into the pane reloads it through it, with a
  named skip when no guest is live.
- `src/shared/lineups.ts` — M104. Four lineups as SEATS (`agent` / `shell` / `browser`);
  `lineupPlan` is pure: sessions, agents, which seats get a worktree lane (agent seats only,
  only when asked — a browser or shell in a worktree points at a directory its dev server was
  never started in), and against `agents.maxConcurrent` read live how many will queue, as a
  sentence shown in the sheet BEFORE Enter mints anything. The launch is seat by seat through
  the ordinary doors. `verify:palette lineup.1–.2`.
- `src/renderer/session/last-line-store.ts` / `rail-rows.ts`'s `lastLineOf`, `railCapsules` —
  M105. The agent's last line said (the transcript's last complete text block, cut from the
  right) and the unread mark, per panel by id, never on `registry.version()`; set on a chat's
  turn end, unread when the panel was not focused, cleared on focus and at every removing site
  beside `clearAgentState`. A terminal row carries no last line (its scrollback is not a
  conversation). The dock's `N live` / `N quiet` capsules read the rail's own rows.
- `PanelFrame.tsx`'s frame rule and `⋯` menu, `menu.ts`'s Workspace menu, `Canvas.tsx`'s
  `flipped` — M106. ONE rule for every kind: `.pf__title` gives (min-width 0, ellipsis) and
  every chrome control is `flex: 0 0 auto` (`verify:styles header.1`, `verify:panels
  header.1`); the full title rides the `title` attribute and the `⋯` menu. Flip hands
  `summary` to every terminal through a `flipped` PROP on `TerminalPanel` (never
  `CardDetailContext`, which only a CARDED panel reads — a live one renders the slot), so
  a running terminal turns over too; M57's far-view renderer reused, never a second one; a view state, never persisted
  (`verify:panels flip.1`). `canvas:tidy` / `canvas:flip` are main→renderer events.
- `shared/env-report.ts`'s `probe` and `probeOutcome`, `shell-env.ts`'s `shellProbeFacts` /
  `reprobeShellEnv` (a re-probe into a local; the cache is replaced only on success) — M107. Discovery explains itself: which shells were asked, which folders
  checked, and THREE states — `found`, `not-found`, and `no-answer` for a shell that timed out
  (a slow or prompting `~/.zshrc`), which says the `~/.zprofile` fix and is never read as not
  installed. `env:report` with `again` asks the login shell once more and reports; the app's
  environment applies on relaunch. `verify:file env.1`. Changes refresh on the selected chat's
  turn end; `chatHeaderLine` reads folder · branch · engine · model with every absent piece
  absent (`verify:rail header.1`).
- `src/renderer/styles.css`'s glass set / `docs/superpowers/specs/2026-09-05-design-brief-obsidian.md`
  — M109–M111 (2.3.0), the Obsidian redesign. The two theme blocks gained NINE names together
  (`--glass-1/2`, `--edge-light`, `--bezel`, `--lift`, `--aura-1/2`, `--on-iris`, `--blur`;
  `obsidian.1` pins the set, `theme.1` the parity) and every measured token stayed six-digit
  hex — `verify:panels` parses `--line-strong` with `toRgb` and check 11 skips an rgba, so a
  glass fill is a NEW name, never a re-spelling. `--panel-bg` aliases `--glass-1`, which is
  what keeps the card-ground check measuring the real fill. The ground is the SHELL's
  (`.shell__aura` at z-index -1 inside `isolation: isolate`; `.canvas` is transparent;
  `.canvas__aura` follows the camera at 0.12) — `ground.1` reads all three. ONE resting shadow,
  `--lift`, on the frame, its state rules, the wants-you keyframes and the launcher (`shadow.1`
  names the sites). Blur is paid at the near tiers only (`blur.1`). The state edge's glow is
  `.pf::before` reading `--tone-dim` — and that rule's existence is what turned on `tone.1`'s
  "after the tone block" arm, which had sliced at a string that occurred only in a comment. The
  pulse is finite (`pulse.1`); the primary control has five named sites and never Commit
  (`primary.1`); the block tier and the minimap share one `color-mix` (`far.1`).
- `src/main/layout-snapshots.ts` / `src/shared/annotations.ts` — M93. Snapshots are a side
  effect of a SUCCESSFUL layout write (`onWritten`, after the rename), a ring of twenty
  coalesced a minute apart; `restoreFromSnapshot` is pure, checks the JSON first (`parseLayout`
  never throws, which is wrong for a restore), mints a NEW workspace beside the current one
  with every panel id re-minted, and never overwrites. Annotations are layout on the workspace
  record (absent on disk when empty — the store deletes the key), world- or panel-anchored;
  `AnnotationLayer.tsx` is an SVG sibling of the link layer; annotate mode lays a transparent
  sheet over the world so a click on a panel reaches the host. `snapshot:list` / `snapshot:restore`.
- `src/renderer/canvas/lod.ts`'s `pinnedIds`/`PIN_MAX`/`pinRefusal`, `panels.ts`'s
  `maximiseRect`/`carryMarks` — M92. Lock, pin and maximise are LAYOUT facts on the panel
  record (`locked`, `pinned`, `maximised.restore`, each absent unless set and carried through
  every by-name rebuild by `carryMarks`). Lock is ONE early return at `onBeginDrag`, the gate
  every move and resize passes; a group drag skips locked members in `groupDragState`; Arrange
  skips them. Pins are promoted FIRST inside `assignTiers`, counted inside the budget; the
  verb refuses at `PIN_MAX` (one below the budget) and focus is never carded — it evicts the
  last pin if pins ever fill the budget. Maximise is a rect and a restore rect, one history
  entry each way, cleared by the first move. The marks reach every frame through ONE context
  (`PanelMarksContext`) beside the tier's.
- `src/shared/codex-transcript.ts` — M90. The second headless backend behind M71's seam:
  codex's JSONL to the SAME `TranscriptEvent` union (one line yields zero to two events — a
  completed command is claude's tool_use/tool_result pair), and `codexArgs` — the prompt is an
  ARGUMENT, so codex runs ONE PROCESS PER TURN with stdin CLOSED (`closeStdin` on `AgentSpawn`;
  an open pipe blocks it). In the manager a codex session's `result` marks the turn ended and
  the exit that follows is the turn's normal END (`ready`, never `exited`); the queue is served
  from `handleExit`, because a second process cannot resume a thread the first still holds.
  The thread id is codex's, adopted from `thread.started`; `backend` on the spec, the snapshot
  and `ChatSource` (absent is claude, carried through BOTH field-by-field copy sites). No cost
  is ever claimed; `interrupt` answers false and the composer names why.
- `src/main/claude-transcript-import.ts` — M74. The CLI's own transcript (M17's glob) read
  into a chat panel's file for `Open as chat`: sidechain and meta records skipped, assistant
  records merged by message id with usage counted once, a typed prompt's string content a
  text block. `agent:import` in main refuses BY NAME (not pinned; the process is live; no file
  yet) — one front-end at a time. The mirror, `Open in terminal`, spawns `claude --resume <id>`
  through the ordinary create path; `agentArgs` skips the `--session-id` pin beside a
  `--resume`, and `PtyManager.create` ADOPTS the resumed id as the panel's pin.
- `src/main/scrollback-log.ts` — M39. One append-only file per panel under `userData/scrollback`,
  written from `PtyManager.flush()` through a per-panel queue, ring-trimmed at 1.25× the cap.
  An append stream, deliberately not `layout-store.ts`'s temp-and-rename. Read by the dormant
  card (`session/scrollback-store.ts`), search and export. `shared/ansi.ts` and
  `shared/redact.ts` are its pure companions — the stripper the tail uses, and the scrubber
  export applies.
- `src/main/prompts.ts` — reads `.claude/commands/*.md` under a panel's cwd and merges them
  with the saved store. Read-only, capped, and plain-node testable; see "Project prompts are
  read, never written" below.
- `src/preload/index.ts` — `contextBridge` exposes `window.canvas`. Every `on*` subscribe
  returns its own unsubscribe so React effects can clean up without stacking listeners.
- `src/renderer/session/session-registry.ts` — owns every panel's **session** (its xterm
  `Terminal` and its PTY) for the lifetime of the renderer, in a module-level registry outside
  React. Created once, disposed once. `pty.kill` has exactly two callers in the renderer —
  `disposeAll` and `dispose(id)` (explicit panel close) — and a tier
  change must never reach either. Since M4c `disposeAll` has no production call site at all:
  renderer teardown is main's (see "No `beforeunload` teardown" below).
- `src/renderer/components/TerminalPanel.tsx` — the **view**: one panel's React component,
  mounted and unmounted freely by tiering, owning nothing. It renders whichever `SessionHandle`
  the registry hands it and calls back into the registry (`attachSlot`/`detachSlot`) around its
  own mount lifecycle.
- `src/renderer/canvas/lod.ts` — pure tier-assignment function; decides which panels' sessions
  are attached (`live`) vs. carded, based on viewport, focus, and budget.
- `src/renderer/components/PanelFrame.tsx` — M47. The one panel frame every kind renders
  through: a kind supplies title, chrome controls, body and its close arming rule; the frame owns
  the box, chrome row, close, resize handles and ports. Every frame element carries its `.pf__*`
  class AND the `.panel__*`/kind alias the checks select on; `.pf__body` is never transformed.
- `src/renderer/shell/useShellBreakpoint.ts` / `useShellChrome.ts` — M46. The breakpoint is a
  ResizeObserver on `.shell` (never the window) stamped as `data-bp`; the chrome hook turns
  the sparse map's PRESENCE into what a toggle means at this width (absent: the breakpoint
  decides; present: the user won). `Dock.tsx` chooses the ONE navigator pane
  (`Navigator.tsx`: Panels / Workspaces / Files, full height) and holds Attention as a badge
  plus a popover; `Inspector.tsx` is the context pane — pinned identity, three tabs, a pinned
  action bar with an armed Close.
- `src/renderer/terminal/themes.ts` — M45. The two xterm `ITheme`s, one per `data-theme`; the
  dark one is the pre-M45 palette byte for byte, the light one is RE-TUNED for a light ground
  (bright yellow on white is the whole reason #10 called this "the whole item"). Its
  `background` must equal the stylesheet's `--well` for the same theme.
- `src/renderer/canvas/useTheme.ts` — M45. Resolves `appearance.theme` (following
  `prefers-color-scheme` live for `system`), stamps `data-theme` on `<html>`, and re-reads on
  `settings:changed` — the event that lets the MENU's radio group apply without a palette
  open. `Canvas.tsx` fans the matching xterm theme through `registry.applyTerminalOptions`.
- `src/renderer/icons.tsx` — M45. The inline SVG icon set, `stroke="currentColor"` on a 16px
  grid, `aria-hidden` on every one. `verify:styles` `icons.1` fails the build if an entity or
  symbol glyph comes back as a control's text.
- `src/renderer/terminal/create-terminal.ts` — the only place a `Terminal` is constructed, and
  it returns one **detached**. `src/renderer/terminal/session-factory.ts` implements
  `SessionHandle` over `attachTerminal`/`detachTerminal` from the same module, and is what the
  registry's session-factory dependency actually is at runtime.

- `src/shared/work-items.ts` / `src/main/board-lane.ts` / `src/main/board-repo.ts` — M113–M115.
  The board's record: four states as DATA, two of them the RUNTIME's (`working` from the lane
  chat's first message start, `review` from a PR opened) and two the user's (`USER_SET_STATES`
  drives every drop target and verb); the dedupe by key (`upsertWorkItem` keeps what the
  runtime set); `carryWorkItem` at every by-name copy; `prRefusal` as the ONE list of the PR
  door's refusals. The record lives on the workspace beside annotations and is absent on disk
  when empty; it is NOT in history (records like runs and bookmarks, not layout). `tc board`
  writes nothing in main: the renderer owns the workspace it renders, so main asks it over the
  ephemeral reply channel `canvas:model` uses (`board:add`, `requestFromRendererWith`).
  `board-lane.ts` is the dispatch's main half in order — teammate, repository under the
  places (`board-repo.ts`: a place or its immediate children, by origin), the Places gate on
  the ROOT (a lane under `userData/worktrees` is outside every place by construction, so the
  gate's `worktreeRootOf` dep judges it by its record's root and names the root in a refusal),
  then M37's `ensureForPanel` for the chat's id. `DISPATCH_PROMPT` rides every spawn from
  `ChatSource.dispatch` (`carryChatMarks` at both copy sites). The edge card → chat is a plain
  M78 edge labelled `dispatched` with NO automation. `Open PR` is two outward things behind
  one spend card: `git push -u origin <branch>` in the lane with the user's own credentials
  (the app holds none for git; `buildPushArgs` is the one push built), then the POST through
  the broker, never the credential store (`openPullRequest` in `github-client.ts`; 422
  already-exists → one GET → `exists`). Every outward half is on the manual-only list.
- `src/renderer/work/WorkNode.tsx` / `src/renderer/shell/BoardPane.tsx` — M116. The twelfth
  kind (`work`, sessionless, `work: { itemId }` its only identity — the record lives on the
  workspace, never on the panel) and the Board pane. A dispatched card FOLLOWS its lane: the
  world layer re-derives its rect from the chat's every render (`anchoredPanels`) and never
  writes it back; a move of the card drops the anchor. Drop targets exist on the two
  `USER_SET_STATES` columns only.

- `src/shared/skills.ts` — M126. The skill KEY and the shelf. A skill's identity is
  `skillKey(scope, name)` = `JSON.stringify([scope, name])`, because a bare name is ambiguous
  the moment two scopes hold it and the pane's job is to show you that they do; `placement`
  answers with a column AND its `why` (`placed` · `by-plugin` · `by-scope`), so a card the user
  arranged can be told from one the app derived — without the why, rearranging a derived column
  is a gesture with no effect and no explanation. `pluginPrefixOf` reads only the FIRST colon.
  The shelf is a top-level record beside `presets` with the record rules, carried by
  `carryShelf` at every by-name copy and ABSENT on disk when empty — a decision that now lives
  in `layout-schema.ts`'s `serialiseLayout`, which did not exist before this milestone (the
  store stringified its snapshot directly, so there was no one place to put it).
- `src/main/plugin-list.ts` — M128. The enabled plugins, from the CLI's own answer.
  `~/.claude/plugins` is 663 MB with ~700 `SKILL.md` files, which is why `docs/ideas-backlog.md`
  #26 declined plugin skills; `claude plugin list --json` names each plugin's own `installPath`,
  and that is the whole affordability argument — the walk is bounded to the enabled ones rather
  than a recursive descent from the cache root. `enabled` is the CLI's answer, never this app's
  inference from `enabledPlugins`: a disabled plugin's skills are available to no agent, and
  listing them answers "what can this agent do" with a lie. An absent CLI, a non-zero exit,
  unparseable output or a timeout is `unknown` with a reason, **never `[]`** — `[]` reads as "no
  plugins installed", which is a different fact and leads to a different fix. Its timeout timer
  is deliberately NOT unref'd: an unref'd timer is defeated the instant it is the last handle on
  the loop, and a suite whose fake never resolves then exits 0 without printing its tally.
- `src/renderer/shell/SkillsPane.tsx` / `skills-pane-model.ts` — M127. The Skills pane and the
  whole of its model: an inventory plus the shelf plus three filters in, columns of cards out,
  pure by construction (the component owns the tabs, the search box and the drag handlers and
  NOTHING that decides where a card sits). The matcher is `palette/fuzzy.ts`'s, imported — a
  second matcher would differ from the palette's exactly in the cases nobody tests. Three
  ordering rules, each silent if undone: the user's placed columns first, then the derived ones,
  then `Ungrouped` LAST and always (a real column that can be dropped into and cannot be
  deleted); a derived column with no cards after filtering is OMITTED, because it is a
  projection and an empty projection describes nothing; a query matching nothing yields `[]` so
  the component can say so, rather than a rack of empty columns. A shelf key whose file is gone
  KEEPS its slot and says `not installed` — a `git pull` does not get to edit the user's
  arrangement, and a slot that silently emptied would read as a column the app rearranged by
  itself. The shelf's three states are kept apart from the inventory's: an unread shelf and an
  empty shelf paint the same columns and need different sentences.
- `src/renderer/skills/` — M128–M130. The thirteenth kind and its lane. `SkillNode.tsx` holds
  `{scope, name}` and NOTHING else — no copied description, body, resource count or token
  figure, because the file is the authority and a copy stops being true at the next `git pull`
  with nothing on screen to say so; it names which OPEN panels can see this skill, states a
  two-scope collision and picks NO winner (the app does not know which the CLI would choose),
  and renders `claude plugin details` verbatim, parsed nowhere. `SkillEditor.tsx` is M129's
  fields, and it subscribes to `edit:copy`/`edit:paste` and serves its own input — the shape
  `Palette.tsx` established and the fix for the fourth text surface `docs/load-bearing.md`
  predicted would inherit the Cmd+V-reaches-the-agent failure. `SkillTrailLane.tsx` +
  `skill-trail-store.ts` are M130's lane: DERIVED and anchored beside its host, so no trail
  entry enters the panel array, costs LOD budget or writes a record; the collapse is the only
  stored fact, the `hide N skills` capsule never disappears, and the lane is culled on the
  scale-derived `cardDetail === 'tail'` rather than `assignTiers`' card tier — a dormant or
  restored panel is carded at NEAR scale, and its trail is exactly what is left to read there.
- `src/shared/skill-edit.ts` / `src/main/skill-write.ts` — M129. The write half, narrowed to
  skills. Save SPLICES the frontmatter block and never re-serialises it, so a key this app's
  grammar does not know survives a save it had no business touching; a file changed underneath
  is REFUSED by name with your text kept, never silently overwritten and never discarded; an
  ungrammatical block makes the metadata fields read-only WITH the reason on screen and leaves
  the body editable — three-state editability, never all-or-nothing. Containment is M100's
  `insidePlace` reused on the real, symlink-resolved path, and the write is atomic. Recorded
  bound: `parseFrontmatter` does not UNESCAPE quoted values, so a description holding a literal
  `"` reads back with its backslashes intact.
- `src/shared/skill-trail.ts` / `src/main/skill-trail-read.ts` — M130. The trail is the CLI's
  OWN transcript, tailed from a byte offset — never a second log this app writes. The offset
  RESETS when the file shrinks (`pty-manager.ts`'s `resetIfShrunk` is the precedent; without it
  a rotated transcript is never read again), the decode survives a multibyte split, and the cap
  COUNTS its overflow rather than pre-slicing it — a pre-slice makes `more` structurally
  unreachable, which is what it was for two milestones. codex and an unresolvable session are
  refused BY NAME before any other dependency is touched, which is what lets a check drive a
  partial fake.
- `src/main/skill-assign.ts` — M131. A shelf column onto a teammate's brief, through M100's ONE
  append site. A project-scoped skill is refused by name and the refusal NAMES the repository it
  belongs to. The load-bearing line is the root: `main/index.ts` translates a chat's cwd through
  the same `worktreeRootOf` the Places gate uses before asking `skillsForBrief`, because an
  M113-dispatched chat's cwd is a `userData/worktrees` LANE and not the repository — without the
  translation every dispatched teammate silently lost its project skills. `teammate:save`
  returns main's REAL `insidePlace` verdict so the pane renders `not visible to <teammate>`;
  the renderer's own check is advisory and is never the authority.
- `src/shared/workflow-nodes.ts` — M132. `pool`, `orchestrator` and `collect` as ARMS on the
  existing template-node union, never a second graph format: a pre-M132 template loads
  untouched, and an unknown kind drops its edges with it rather than leaving an edge pointing at
  nothing.
- `src/main/pool-runner.ts` — M132. The pool: a shared list as a file, M82's two ceilings read
  LIVE on every send with M82's own queue and its `reason`, and a budget crossing that
  INTERRUPTS every worker and kills none — a killed agent loses its turn, and a budget is a
  stop. A worker minted into a stopped pool is interrupted, and a pump guarded off is DEFERRED
  rather than dropped (dropping it starves a worker). **No production caller yet**: Run over a
  template holding a block is refused by name, so nothing in the app spends through this module.
- `src/renderer/workflow/` — M133. The fourteenth kind: a template drawn as a block diagram,
  a PROJECTION of the saved record — the live canvas is still the editor, and the diagram draws
  what is stored and nothing it invented. Runs come from M79 filtered to this template, and the
  tab is three-state about what it cannot ATTRIBUTE (a run it cannot attribute and no runs at
  all are different facts). A trigger is a WATCHER whose command is `/usr/bin/true`, because
  main's watch runner needs a command and the instantiation is the RENDERER's (M80's rule): the
  no-op spawn and the ledger row naming the binary are the recorded cost, every readout reads
  the `templateId` mark and says the workflow's name instead, and this is the line to remove if
  main ever grows a fire-only watcher arm. A fire on a parameterised template is refused by name
  rather than opening the spawn sheet at 3 a.m.

- `src/shared/copilot-transcript.ts` / `src/main/backend-adapters.ts`'s `ParseContext` — M118.
  The third row. Copilot's JSONL stream states NO session id (`parentId` chains the previous
  event), so the HOST pins one with `--session-id` and names `--resume=` from the second turn
  on — the manager marks `everSpawned` on the first `session` event for a per-turn row that
  does not adopt, and the parser is TOLD the id (`parseChunk`'s third argument; claude's and
  codex's ignore it). `assistant.turn_end` is per MODEL CALL (`message-end`); `result` is the
  turn's end. `--allow-all-tools` is required headless (`asksPermission: false` with the
  sentence); `--no-auto-update` because the CLI replaced itself mid-recording. Four row
  fields landed for EVERY row in one commit — `appendsPrompt` (the three prompt doors refuse
  by name through `beginNewChat`'s guard), `handshake`, `sandboxArgs`, `models` — and the
  sheet's `SheetWhat` chat arm is ONE arm keyed by `backend` (M90's `codex` kind folded in),
  so a fourth row needs no new member anywhere (`registry.1`'s rule reached for the sheet).
- `src/shared/acp-transcript.ts` / the adapter's optional encoders — M119. The fourth row and
  the first ACP client this app has been: a codec over the resident-process line seam, three
  optional encoders (`encodeUser`, `encodeInterrupt`, `encodePermission`) plus a `handshake`
  the manager PREFERS when a row has them; the first send is HELD until `session/new` (or
  `session/load`) answers; `session/request_permission` becomes the one `permission-request`
  event with the option ids riding in `input.__options`, answered through the ONE
  `answerPermission` (allow → `allow_once`, deny → `reject_once`, M98's grant →
  `allow_always`). `clientCapabilities` declines `fs/*` and `terminal/*` BY MEASUREMENT
  (copilot's agent never asked; backlog #81; `acp.4` pins the line). The row's capabilities
  are the promise; `initialize`'s answer is the fact (`negotiated` on the snapshot outranks
  the row, `acp.2`).
  **The transport seam (M384).** The codec, the adapters and the manager reach an ACP agent
  ONLY through `AgentProcess` — write one JSON line, `onData`, `onExit`, `kill` — and only
  `main/agent-runner.ts` spawns. ACP's remote transport, when it stabilizes, is therefore
  one more `AgentRunner` that returns an `AgentProcess` over a socket (lines out as
  messages, messages in as data, a close as the exit), chosen per backend row where the
  runner is built; nothing in `acp-transcript.ts`, `backend-adapters.ts` or
  `agent-session.ts` changes. `acp.transport.1` pins the half a refactor could break
  quietly (no transport import on the protocol path); `acp.3` drives a whole session over
  a runner that is not a process. The canvas stays a CLIENT: `clientCapabilities` still
  declines `fs/*` and `terminal/*` (backlog #81, declined by measurement).
- `src/main/sandbox.ts` / `sandboxTeammateRefusal` — M120. A chat with NO place lives in
  `userData/sandbox/<id>` — never a place, never home; the Places gate is bypassed BY
  CONSTRUCTION (the folder is the app's) and a teammate beside `sandbox` is refused first.
  The row's `sandboxArgs` (claude `--permission-mode plan`, codex `--sandbox read-only`,
  copilot `--deny-tool shell --deny-tool write`) ride every spawn through the adapter's
  `sandbox` input; a row without them refuses the SEND by name (`refused-sandbox` →
  `reasons.noSandbox`). Deleted on dispose with `drop`, never on exit. `ChatSource.sandbox`
  is carried by `carryChatMarks` beside `dispatch`; the header reads `sandboxed · no folder`.

- `src/main/pool-caller.ts` / `src/renderer/workflow/pool-model.ts` / `pool-store.ts` — M138.
  The pool's PRODUCTION CALLER: M132's `startPool` had no caller (its "known gap"). Main's
  half reads the list file (one item per non-empty, non-`#` line; a relative path refused),
  asks the RENDERER to mint each worker over `pool:mint` (an ephemeral reply, `board:add`'s
  shape, with a 20 s wait because a chat is created over IPC before it has an id — the
  renderer owns the workspace it renders, so main writes no panel), sends the block's prompt
  with the item through the ordinary `AgentSessionManager.send` (M82's queue and budget
  unchanged), drives `finished` from the manager's OWN events (a worker's `ready` after its
  turn, or its exit — never a timer) and `tick` from every budget event, and emits every
  engine event addressed by template and block on `pool:event`. ONE live pool per
  (template, block): a second Run is refused by name; `stop` interrupts and kills none. The
  renderer's mint is an ordinary chat through `agent:create` (the M100/M120 gates
  unchanged), placed beside the template's workflow panel, titled `<block> · <item>`, and
  wired by an `idle`-triggered handoff edge to every target the template's edges name from
  the pool block, so a `collect` joins the workers M78's way (a worker minted after the
  first finish joins an expected set that grew under it — hand check 10 owns that). An
  `orchestrator` is a chat whose prompt rides every spawn through `--append-system-prompt`,
  carried on its record as `orchestrator: string` (M81's rule; `chat.orchestrator.1`). The
  Runs tab's pool rows are `reducePool`'s projection of main's events and nothing else
  (`verify:rail pool.model.1`); `Stop` is present always and disabled with
  `REASON_NO_POOL_LIVE`. `workflowBlockRefusal` now refuses only a pool that names no list.
  `verify:agent-session pool.2a–d` drives the caller over a fake agents seam and a fake mint;
  `verify:panels` product `workflow.run.1` drives Run on a pool template through the real
  panel and the harness's real manager over its fake runner.

- Act II of the v7 run (M140–M147), eight backlog entries: `src/main/clipboard-file.ts` — M145,
  a clipboard image as a `.png` under `userData/attachments` for a TERMINAL (a PTY cannot take
  bytes; the agent CLIs read a path), pruned to `ATTACHMENTS_KEEP` by the file's own stamp
  (two files in one millisecond share an mtime), the `empty` arm when the clipboard holds no
  image; the renderer's ONE `edit:paste` subscription pastes the shell-quoted path into a
  spawned terminal when the clipboard has no text, and a chat attaches it instead.
  `composer-model.ts`'s `BUILT_IN_HOLES` / `fillBuiltIns` / `askableHoles` — M141, the four
  placeholders filled from the target before any question (the live cwd through the
  live-session store, never `spec.cwd`; `git:status`'s branch; the selection; the title),
  a project prompt never expanded. `layout-schema.ts`'s `parseEnvMap`, `Preset.env` and a
  terminal panel's `env` — M147, a malformed map dropped WHOLE (one bad value beside good ones
  is an environment nobody wrote); `spawn-sheet.ts`'s `parseEnvLines`; `spawn-request.ts`
  merging the sheet's overrides over the preset's; `presetFromCapture` never saving a running
  panel's environment (#31). `usePaletteActions`' `workspaceFromTemplate` — M147, three
  existing doors in order (`workspace:create` named after the template, the switch, M80's
  instantiation; the sheet first when the template has holes), `self` naming the actions
  object for the one verb that opens another verb's door. `useViewport`'s `fitSelection` and
  the `resetZoom`/`zoomToFit` pair — M146, two verbs and two rows (backlog #23's rule).
  `styles.css`'s `--chrome-scale` — M144, a TRANSFORM on `.pf__chrome` and `.panel__resize`
  only (no layout box moves, so no refit and no SIGWINCH on a zoom), `.pf__body` never
  transformed (`frame.2`/`frame.3`). `shared/run-ledger.ts`'s `UsageRow` and `parseUsageRow`,
  `PtyManager.recordUsage` at every site that calls `dropUsage`, `RunLedger.usage(since)`,
  `inspector-fields.ts`'s `foldUsageHistory`/`historyWord` — M142, history on #46's ledger
  with the price computed in the RENDERER by the summary's own rule (main holds no price
  table). `toolbox-node-model.ts`'s `sourcePath` on every row and `ToolboxNode`'s Open door
  — M140, the file panel (M22's editor) as the write half beyond skills.

- Act III of the v7 run (M148–M149): `scripts/verify-visual.cjs` and `verify/visual/goldens/`
  — M148, the shot harness given teeth (goldens at half scale, a per-channel tolerance and a
  pixel budget with a sentence each, three outcomes per scene, `UPDATE_GOLDENS=1` only after
  looking). `docs/ux-audit-4.0.md` — M149, every golden walked; what the walk found in the
  CODE: `useInspectorDetail.ts` now READS `ledger:usage` (M142 had shipped every other piece and
  never the call — `historyWord` has a fourth arm for a rejected read); `usePaletteActions`'
  `intoNewWorkspace` runs the three `New workspace from` doors on the sheet's Enter, never
  before it (`beginSpawnSheet`'s `into` seam — an Escape used to strand the user in an empty
  workspace); `.pf__chrome { z-index: 2 }` with `.pf__body { isolation: isolate }` — M144's
  transform had made the chrome a stacking context that painted UNDER the slot, so the `⋯`
  menu was open in the DOM and invisible (`menu.stack.1`, `menu.paint.1`), and at a zoom where
  the chrome overhangs the body's top rows those rows are the chrome's; `verify:xterm repaint.1`
  counts ink through the real attach path (the spike page injects xterm's stylesheet — without
  it nothing lays out, and the first capture was a cursor box); `.shell__dock { z-index: 910;
  overflow: visible }` — M109's blur had made the dock a stacking context AND the containing
  block of its fixed attention popover, which the shell-wide `overflow: hidden` clipped to
  48 px: open in the DOM and invisible since 2.3.0 (`popover.stack.1`, `popover.paint.1`).
  A paint check is `elementFromPoint`; a DOM read stayed green through both. Scenes added: `reduced-motion`
  (the real media feature through the DevTools protocol), `file-missing`; `scale-100` tried and
  dropped because `capturePage` ignores the device-scale override.

- `src/shared/vault.ts`'s `parseTags` and `VaultIndex.tags` — M150 (Act IV.1). `#tag` at a
  token start, Unicode-aware, NOT a heading or a bare number, excluded inside the SAME code
  spans the wikilink parser excludes (one exclusion for both syntaxes — a second would drift
  in the arm nobody tests); the index's tag map is filled in the backlinks' pass, once per
  note with the first line. The Vault pane's TAGS section filters through its own search
  field (`#name` filters by tag through the index; any other text by title or path); a
  note's chip asks through `onFilterTag`, which lands in that same field as data (tag +
  nonce) and opens the pane. Nothing is written: tags are read from bodies, never stored.

- `shared/annotations.ts`'s `ink`, `viewport.ts`'s `simplifyStroke`, `useCanvasPointer.ts`'s
  draw gesture — M155 (Act V.1). A stroke is an annotation with `ink` (points RELATIVE to the
  anchor point, so a panel-anchored stroke follows its panel through `annotationPoint`
  unchanged; a world width, never `non-scaling-stroke`); absent is every M93 label, malformed
  drops that record by name. The gesture commits a drag that MOVED (end ≥ 4 world px from
  start) — never a point count: moves coalesce into two points that are still a line a
  person drew — and ends on a buttons-up move only after a move that HAD the button (a
  synthetic move reports 0 while the press is down). The layer paints a path plus a wide
  transparent hit twin; the draft is dimmer by token (styles check 3 forbids opacity).

- `src/shared/onboarding.ts` / `src/shared/plan.ts`'s `runAgentPlan` and `agentDoorRefusal` /
  `control-protocol.ts`'s `plan` verb — M180 (v9 Act I). Readiness is a TABLE
  (`FIRST_LAUNCH_ENGINES`, M99's rule: no consumer compares `backend` to a literal) over the
  M107 env report: installed, missing or unanswered per engine, and installed NEVER means
  signed in — the first message is what checks it. The launcher's one filled start is an
  `.is-primary` site (`primary.1`); its hint says what the click does. The agent door: `tc
  plan "<verb line>"` → the socket (the URL door refuses it, and a query can no longer
  replace the verb) → `canvas:plan` with the caller main resolved from `TC_PANEL_TOKEN` →
  the palette's ONE executor. A destructive step, a `submit`/`type`/`interrupt` against a
  panel in `wants-you` (a TUI's permission menu defaults to Yes) and a teammate caller's
  session-opening verbs are each refused BEFORE any step runs; every outgoing string passes
  `outward`. `V9_DOORS` records each v9 verb's four doors, and `closure.v9.1` binds the
  palette id to a real row and the agent line through `buildPlan` — a declaration alone is
  not a door. Real-Electron suites run under the SYSTEM `TMPDIR`: a long repository-local
  path wraps in a 78-column terminal and moves goldens' painted fixture paths past the tile
  budget (three false reds in M180).
- `src/shared/starter.ts` / `src/main/image-read.ts` / `src/main/starter-prepare.ts` /
  `src/renderer/image/ImageNode.tsx` — M181. The starter canvas is DATA: a manifest of four
  captioned examples placed relative to the agent (`STARTER_OBJECTS`, no two rects
  overlapping — `starter.plan.1`) and a workspace record of the keys EVER applied
  (`starter`, absent on every pre-M181 file and on a canvas the starter never touched; a
  reset clears it), which is what makes applying it idempotent — a closed example stays
  closed, and a later act that adds an object adds a key. `applyStarter` in `Canvas.tsx`
  mints through the ORDINARY paths and spawns nothing: the chat through `beginNewChat`
  (spawns on its first send), the terminal a dormant login-shell card, the workflow M133's
  projection, the note a prose file panel and the image the fifteenth kind over two files
  main writes once under `userData/starter` (`starter:prepare` never overwrites the person's
  note). The image kind holds an ABSOLUTE path and nothing else; main reads the bytes by
  MAGIC NUMBER under `IMAGE_MAX_BYTES` (`image:read`, four arms, never a throw) and the
  renderer paints a data URL under the CSP's `img-src data:` — never a `file:` url.
  `isImagePanel` joins `isTerminalPanel`'s exclusion list (a picture must never reach
  `assignTiers` with no spec). The preview object is M185's; drop, paste and Replace are
  M187's.
- `src/shared/template-edit.ts` / `src/renderer/workflow/template-draft-store.ts` — M182 (v9
  Act II). ONE TEMPLATE, TWO EDITORS: every mutation a template undergoes is a pure function
  answering a fresh record or a refusal by name (keys minted from `nextKey`, never reused; a
  cycle refused with the word — M78's rule from the record's side); the draft store's
  `applyDraftOp` is the one door every editor takes (the diagram's drag and Delete, the
  palette's text modes, the agent's `workflow-*` verbs, and the canvas binding's Update), so
  the two views cannot disagree. The record's `revision` is the STORE's: a save with a matching
  expectation writes revision + 1, a mismatch writes nothing and answers `stale` with the
  standing record; absent on every pre-M182 file and never normalised in. `templateBinding`
  on a panel an instantiation minted is the fifth mark `carryMarks` carries; `Save selection
  as template` over panels bound to one template, under its own name, updates that record.
  M133's "the diagram is only a projection" is struck (the 5.0 brief); `workflow.panel.1a–d`
  still compare the diagram against the record it draws, now the draft when one exists.
- `src/main/panel-search.ts` / `src/main/update-check.ts` — M122/M123. Search is ONE
  answer over both durable logs, built in main over injected readers, every line through
  `redactSecrets` (the outward gate's fourth named caller in `verify:verbs gate.2`), the cap
  and the redaction count STATED on the result and shown first; the existing
  `scrollback:search` invoke was widened, never doubled. The update check is a pure module
  over an injected fetcher (the real `https.get` lives in `index.ts` and is called by no
  suite — `verify:meta update.1`), one GET of the releases LIST so a prerelease is skipped
  by name, a small semver compare, three states; auto-swap is declined by name because the
  build is unsigned, and `update.checkOnLaunch` is off by default and never `planWritable`.

The session/view split is the milestone's whole point: in M1, "this component is unmounting"
and "this panel is going away" were the same statement. Culling makes them different
statements, and `session-registry.ts` is where that difference lives.

The canvas is layered so that the math is testable without a browser, and each layer may
only import downward:

```
src/renderer/canvas/
  viewport.ts       pure math — no DOM, no React imports. Enforced by review and by the
                    fact that verify:viewport runs it under plain node.
  canvas-input.ts   platform events -> pan/zoom intents — no React. Takes a plain
                    {deltaX, deltaY, deltaMode, ctrlKey, metaKey, shiftKey}, not a
                    WheelEvent, so it stays a pure function.
  lod.ts            pure tier assignment — no DOM, no React. Bundled alongside viewport.ts
                    into the plain-node verify:viewport target.
  useViewport.ts    React state + listener wiring — the only place the two meet. The
                    setter stays private on purpose: nothing outside should move the camera.
  Canvas.tsx        clipping host + the single transformed world layer; owns the registry,
                    the tier-assignment effect, and the one Cmd+C/Cmd+V subscription
  CanvasHud.tsx     zoom % and world-space cursor — the fastest way to see the math misbehave

  The seven below were split out of Canvas.tsx (M28) with no behaviour change.
  Each replaces a CONTIGUOUS run of hook calls at exactly the position it used
  to occupy: several refs in this component are created above a block and
  assigned below it, so moving a call re-orders a create-then-assign pair and
  the ref reads null for the life of the effect, silently. Each takes one
  `Deps` object, destructures it on entry, and names the DESTRUCTURED members
  in its dependency arrays — never `deps`, which the caller rebuilds every
  render.
  canvas-constants.ts    module-scope constants + retainSelection/panelLabel. Must stay
                         module scope: a fresh [] or Set() per render is re-render churn
  usePaletteActions.ts   the one `actions` object the palette, top bar, rail and inspector
                         share. ONE useMemo — splitting the MEMO breaks Palette's command
                         memo, so the file is a composition root holding no verb of its own
  palette-actions/       the 150 verbs, split by domain: executor (the one place a verb's
                         meaning lives), presets, prompts, arrangement, workspaces,
                         settings, board, objects. Each is a plain factory returning a
                         `Pick<PaletteActions, …>`; the root creates ONE empty object, puts
                         it on the ctx as `self`, and Object.assigns every slice onto it —
                         which is what lets a verb call a sibling through `self.x(…)` as it
                         always did. types.ts holds the deps and that contract.
                         Two checks fence it: `EveryVerbIsCovered` (a compile error if a
                         verb is covered by no slice) and `verify:verbs slices.1` (a red
                         suite if two slices declare one, which Object.assign hides)
  useWorkspaceVerbs.ts   switch / merged view / move-panels. Holds the await-before-commit
                         orderings; also owns deleteWorkspaceRef and reloadWorkspacesRef
  useCanvasPointer.ts    the host's mouse gestures. Four handlers stay PLAIN functions —
                         memoizing them would be a behaviour change, not a cleanup
  useRailModels.ts       the built/signature/useMemo triples that freeze rail and inspector
                         row identity against a drag's 60Hz rect churn
  useFileTree.ts         the tree column. Roots on SELECTED, pastes into FOCUSED
  useInspectorDetail.ts  the inspector's async Changes/Toolbox/summary sections, each a
                         three-state result
  useCanvasTestHooks.ts  the window.__m4a* surface verify:panels drives the renderer through

src/renderer/palette/
  fuzzy.ts          pure subsequence match + score + match positions — no DOM, no React
  palette-model.ts  SECTIONS (ordered data, not a union), the Command shape, section-first
                    filter/sort, bestMatchIndex, splitHighlight, runnable-row stepping
  commands.ts       pure list construction: rows in, Command[] with disabled reasons out.
                    Takes preset/prompt/panel rows and a captured id as plain data, so the
                    whole command surface is testable without mounting anything.
  usePalette.ts     open/close state, the Cmd+K toggle, and the captured focus id — the
                    hook that decides who owns the keyboard (see below)
  Palette.tsx       the overlay: the input, the scope chip, the sectioned rows, the footer,
                    confirm mode, its own edit:copy/edit:paste subscriptions, and the
                    mousedown guard that keeps the canvas out

src/renderer/groups/
  groups.ts             pure membership + derived geometry: groupRect/groupDragState/
                        applyGroupDrag/raiseGroup/pruneGroups/toggleGroup. No DOM, no
                        React — the plain-node verify:groups target
  useGroupDrag.ts       the document-level drag wiring, usePanelDrag's shape one level up

## Recent milestones (M195–M200)


- `src/shared/preview.ts`'s `PreviewBinding` / `previewReloadDecision` /
  `src/renderer/browser/usePreviewReload.ts` — M195 (D03). A browser pane is a preview OF
  something, and the association is on the RECORD (`preview: { root, sourcePanelId? }`, absent
  on every pre-M195 pane, malformed costing the field and never the panel). The reload rule is
  pure and has five arms with a `why` each — `unbound`, `not-local` (M186's loopback finding,
  now named), `no-path`, `outside`, reload — because a preview that stopped reloading for a
  reason nobody can name is the defect this closes: the effect it replaces subscribed with a
  callback that took NO PARAMETER, so every loopback pane reloaded on every open file panel's
  change and two local projects reloaded one another (`verify:panels:product preview.bind.1`
  counts the loads at four real servers, one of them a SENTINEL that fences every negative).
  An UNBOUND pane reloads for nothing at all — the milestone's one intended regression, carried
  by the control reading `Bind source` and never by a `not bound` label, which would be a
  zero-value statement in a row that is always visible.
  **A control inside the pane's body must not take focus** (`if (e.defaultPrevented) return` on
  `.browser-node__body`'s handler): `shellControl` does not stopPropagation, so every verb here
  that reads the SUBJECT panel — `Find the project` and `Start dev` since M185, and this
  milestone's `Bind source` — focused the pane on mousedown and then refused, because a browser
  pane is neither a terminal nor a chat. A check that dispatches mousedown and click in ONE task
  cannot see it; `preview.bind.2` presses in two. **No IPC change**: `FileChangedEvent` carries no
  path, but it carries `panelId` and the renderer already holds that file panel's
  `source.path`. The subscription is ONE for the canvas, reads `displayPanelsRef` (a reload
  acts on what is on SCREEN, so a merged-view preview still reloads) and reaches the guest
  through the store's `reloadBrowser`; the coalesce is 300 ms PER PANE, because one shared
  timer would let two projects reloading at once cancel each other. `normalisePreviewPath` is
  hand-written and must stay so — `@shared/places.ts`'s copy imports `node:path`, which the
  renderer cannot bundle — and containment is on SEGMENT boundaries (`/a/b` does not hold
  `/a/bc`). The binding is provenance and **grants nothing**: `preview-bind` (the fifth preview
  verb, four doors) takes NO argument and binds to the same subject rule discovery reads.

- `src/renderer/palette/start-work.ts` / `StartWorkSheet.tsx` / `src/main/board-repo.ts`'s
  `repositoriesUnderPlaces` — M197 (D05, first half). **ONE Start work action, and every door is a
  route into it** (the palette row, the card's menu, the Teammates-pane drop, the agent's
  `dispatch` verb). A start is a TRIPLE — task, agent, repository — and the flow asks only for what
  it cannot derive. `dispatchWorkItem`'s `root` argument had **no caller in the whole app** (four
  call sites, all passing two), so `board-lane.ts` refused a typed or Jira item with a sentence
  naming a choice no surface offered: **only a GitHub item whose clone already sat under a
  teammate's place could start work at all**. Two rules are load-bearing. **The order is a
  DEPENDENCY, not a preference** — task, then agent, then repository, because the repositories on
  offer are the CHOSEN teammate's places' clones and there is nothing to list until the agent is
  known; asking first would offer a list belonging to nobody, which the Places gate would overrule
  one question later. **An EMPTY `startWorkNeeds` is the dispatch-without-a-sheet signal**, so
  M114's drag-onto-a-teammate still starts in one gesture. `resolveRepository` has THREE arms
  (`auto`, `ambiguous`, `none`) because *derive it*, *ask which* and *ask for any* are three fixes,
  and an item naming no repository is `none`, never `ambiguous`. `repositoriesUnderPlaces` is the
  SAME bounded one-level walk `findRepoUnderPlaces` makes, asked for all of them, so the field can
  never offer a root the lane could not reach; **`isRepoRoot` is a SECOND injected reader rather
  than a widening of `originOf`**, which answers `null` for two different facts (not a repository /
  a repository with no origin) — a lister that cannot tell them apart drops a local-only checkout
  with nothing on screen to say why. `repositoriesAnswer` holds the door's three arms in
  `board-repo.ts` and not inline in `index.ts`, because **no suite bundles `index.ts`** (M196's own
  lesson); `no-places` (fix: a folder) stays apart from an empty `repos` (fix: a clone). Nothing
  here widens a grant: a placeless teammate is offered DISABLED by name and the Teammates pane is a
  named route. **The verb ANSWERS** — `dispatchWorkItem` returns a `StartWorkOutcome` and the
  agent's `dispatch` arm AWAITS it, where it used to return `{ kind: 'ran' }` before any refusal
  could exist; and the first send's refusal reaches the record through
  `sendRefusalSentence` (`shared/agent-session.ts`), which reads BOTH of `SendAnswer`'s refusing
  shapes — the object arm and the four STRING arms, of which M82's `refused-budget` stores nothing.
  `addWorkItem` now makes `workItemsRef.current` current AT THE MINT: the ref is a render-time
  assignment, so a flow that mints a task and starts it in one tick read a list without it
  (`verify:panels:product start.door.2` caught this, red). **M198 owes idempotency**: the chat id is
  minted fresh per attempt while `ensureForPanel` reuses by panel id AND root, so a retry past the
  lane step mints a second worktree and orphans the first.

- `src/renderer/canvas/Canvas.tsx`'s `dispatchAttemptsRef` — M198 (D05 close). A start reserves the
  chat id and writes `panelId` + `worktreeId` immediately after `board:lane`, BEFORE `agent:create`.
  That item record is the recovery journal: refused create and refused first send retry the missing
  stage through the same id, while concurrent clicks join one promise. A standing conversation is
  never accepted merely by renderer identity: the retry asks `board:lane` again first, so main's
  teammate Places gate still rejects a changed teammate or root.

- `src/shared/review-readiness.ts` / `useTaskHandoffs.ts` / `ReviewNode.tsx`'s task section — M201–M202
  (D07). **The board's `review` state keeps meaning A PULL REQUEST EXISTS** — one line in the app
  sets it, `USER_SET_STATES` still excludes it, `emptyColumnWord` is untouched — and local review
  readiness is a SEPARATE fact, D04's rule from the other side. **Two axes, never one word**:
  `ReviewHandoffState` (no-lane · lane-missing · unreadable · blocked · working · empty · shared ·
  ready) is what is true now, `ReviewStanding` (none · current · stale) is what the person already did, and a
  task can be `working` AND `stale` at once — fold them together and the agent going back to work
  silently erases the fact that your review is out of date. Execution outranks the diff (an agent
  still writing means the diff under it is a moving target); a clean lane is `empty`, never a green
  completion, and **`shared` is its own state**: `review.ts` defines it as two or more panels having
  run in the repository, so no per-panel diff is attributable, and folding it into `changes` — the
  first cut did — let a review be recorded over work the task cannot claim. It is the fourth claim
  D07 asks to keep apart, beside observed, reported and unavailable. **Evidence is attributed by WHO
  WATCHED THE EXIT, and the two are never merged**: a run
  ledger row main read off the PTY is `observed`; a transcript tool call is `reported` and carries no
  exit code, because there is none; and the EMPTY arm names which kind of nothing it is — nothing
  ran, the lane's conversation is closed so nobody looked, or this app could not read its own
  ledger, which are three facts and were one sentence in the first cut. **Nothing is classified as a "test" by pattern** — a rule saying
  `npm test` is a check and `make ci` is not puts a confident badge on a guess — and a block
  qualifies by NAMING a command, never by its tool being `Bash` (M99's no-literal rule reached from
  the other side). One persisted fact, `PersistedWorkItem.reviewed = { at, signature, files }`,
  absent until somebody reviews and KEPT through a provider re-add (re-reading an issue says nothing
  about whether anybody looked at the lane); `reviewSignature`'s recorded bound is that identical
  paths and counts give an identical signature, and `readiness.3` pins the LIMIT so a later "fix"
  fails the check that documents it first. `ACROSS_BASELINE` is the NAMED absence an across node
  carries when its lane's chat is gone — never an empty string (`isStr` drops it, taking the node)
  and never a fake sha (a person would go looking for that commit); `across-baseline.1` reads
  `reviewAcross` as TEXT, `git.1`'s argument. The task review starts from the WORKTREE RECORD and not
  the subject panel, because a record outlives its panel (M37) and reviewing a dismissed agent's lane
  is the whole point. `useTaskHandoffs` reads git ONCE PER REPOSITORY on a turn ending — never per
  card, never on a timer — and owns its own `worktree:list` read, because the canvas's list loads
  only when ⌘K opens and a card reading it said `not started` about a real lane until somebody
  pressed it; `null` is a real third state there, or every launch flashes `lane missing` — and a
  FAILED read must leave it `null` rather than `[]`, which turned one bad IPC call into `lane
  missing` on every card with no retry. The signature and the changed paths come from that ONE read
  and are handed to the review node, never recomputed there: two reads refreshing on different
  triggers would let `Mark reviewed` record a fingerprint for a diff the card never judged.
  **There is no `locate` action** — the first cut had one whose sentences named an affordance the
  product does not have; a lost lane routes to `Start work again…`.
  **`Mark reviewed` has no verb, no palette row and no agent line, on purpose** — an agent line
  asserting a person reviewed something is the false claim this phase removes; it sits beside
  `Commit`. **M252's `I've read this` is the same shape for the same reason** — on the workflow
  panel and on an unread tool's preview pane, reachable only through each node's `onMarkRead`
  prop (`Canvas.tsx`'s `markTemplateRead` / `markPreviewRead`); an agent that could clear
  `reviewed` would un-inert its own answer. `verify:verbs tool.door.1` reads the door files. `Continue the conversation` INSERTS and never sends (M80), and requires a CHAT:
  `insertIntoComposer` is a no-op for anything else, so over a terminal lane the control was enabled
  and silently did nothing. `resume` is a FIFTH card verb ADDED beside the four, never a rename — the
  aliases are what two hundred checks select on.
- `src/shared/run-outcome.ts` / `WorkflowNode.tsx` / `WorkNode.tsx` — M199–M200 (D06). The run
  definition and entries are immutable history; session status, queue reason, attention and the
  oldest pending approval are a LIVE overlay. Never put an approval request id in a run or work
  item record: after answer or exit it would look actionable while main no longer holds it. The
  projection separates execution, queue reason, blocker, execution result and task disposition.
  `a turn`, `exit 0` and the aggregate `run ended` use neutral tone and never advance the task.
  Workflow and work-card Allow/Deny call `answerApproval`, the same main-owned door used by chat
  and Attention. A backend with only keyboard attention keeps that distinct arm and offers no
  invented approval control.

- `src/shared/work-scope.ts` / `src/main/work-scope.ts` — M196 (D04). **Working directory, lane
  and repository are three facts and stay three.** `rev-parse --show-toplevel` inside a linked
  worktree answers the LANE (measured, from the lane and from a subdirectory of it), so every door
  that asked only that question treated a lane as a repository of its own — silently, because each
  one then returned a plausible non-empty answer. `WorkScope` has THREE arms (`repository`,
  `no-repository`, `unavailable`), and the third is the one `memoryRoot` used to spend: git
  DECLINING is not "this directory is its own subject", and collapsing them wrote a transient git
  failure's memories to a stray slug. The resolver asks the app's worktree RECORD first (it is the
  only source of a branch) and `--git-common-dir` second (it is the only thing that knows about an
  EXTERNALLY created worktree); `commonRootOf` is M86's, promoted from a closure rather than
  rewritten. Containment is `insideDirectory`, on SEGMENT boundaries, and `shared/preview.ts`
  DELEGATES its two path helpers to it — the reload rule and the scope rule are one question about
  one kind of string, and two copies would differ in the arm nobody tests. `laneOfPath` takes the
  LONGEST matching record (records nest; the shortest match names a grandparent for work in a
  child). **`memoryScope` lives in `main/work-scope.ts` and not inline in `index.ts` because no
  suite bundles `index.ts`** — the extraction is what makes the door checkable. **Repository memory
  is repository-wide**: a lane is a place work happens, not a subject that remembers; teammate
  memory keeps its own store behind `teammate:`, there is no task-scoped store, and pre-M196
  lane-keyed JSONLs are NOT merged (the guide's no-silent-merge rule, and they were already
  orphaned by `worktree:remove`). `laneRootOf` replaces the exact-path `w.path === path` at main's
  three `worktreeRootOf` sites; this is **not a widening** — the subject is the record's own
  `root`, judged by `insidePlace` exactly as the lane root already was, and `verify:teammates
  dispatch.2`'s decoy arm is the fence: under a bare `startsWith` an unrecorded directory sharing
  the lane's prefix translated to the lane's repository and the gate answered ALLOWED.

## Cross-module invariants (moved from CLAUDE.md's load-bearing section)

- **Known manual-only verifications.** A green `npm run verify` is silent on roughly a dozen
  facts confirmed once by hand against a real machine, keyboard, CLI or signed build — they
  are listed at the end of [docs/load-bearing.md](docs/load-bearing.md). Treat green as
  green, not as proof of those.

**and nothing else**; an open text draft is neither. Each draft's own control
`preventDefault()`s its mousedown (correct — `shellControl`'s rule), so
`focusedId` still names whatever terminal panel the user was last in.

Concretely, and this is the same failure on `ReviewNode`'s commit draft
(M9c), `FileNode`'s editor (M22) and now `JiraTicket`'s comment draft (M24): the
user clicks into a panel, opens a draft, types, presses `Cmd+V` to paste a stack
trace — and the clipboard goes to `registry.get(focusedId).handle.paste(text)`,
i.e. **into the running agent**, while they watch an unchanged text field.
`Canvas.tsx`'s own comment on that line names the failure verbatim. `Cmd+C` is
the mirror, copying the terminal's selection rather than the draft's. **`Cmd+Z`
is the destructive one**: it runs `applyHistory`, which can remove a panel and
`registry.dispose` a session — killing a running agent from a keystroke aimed at
a text field, with nothing on screen explaining it. A comment box is where this
matters most of the three, because pasting is the natural action there.

**It is DOCUMENTED rather than fixed, and the two obvious fixes are each blocked
by something this repo has already declined:** widening `shouldIgnoreKeys` (or
adding a sibling "a text draft is open" flag) means lifting per-node draft state
into a Canvas-level flag, which `useNavGrid`'s own entry refuses by name — it
would re-render the canvas on every keystroke of a comment message; and there is
no event target to test, because these arrive as IPC with no `KeyboardEvent` at
all, so the target-based rule `useNavGrid` uses has nothing to read, and the
`document.activeElement` alternative is the trap that entry also names (xterm's
own helper is a `<textarea>`, so guarding on it kills `Cmd+Z` over every
terminal panel). The shape that WOULD work is `Palette.tsx`'s — each draft
subscribing to `edit:copy`/`edit:paste` and serving its own input — and it is a
copy of a solution that already exists; it does not cover the `edit:undo` half,
which needs the guard. **A FOURTH text surface inherits this too**, and nothing
will remind whoever adds it.

**What M24 does NOT prove, and the hand check that is still owed.** No suite in
this repo reaches a real Jira, by design — `npm run verify` must stay fast and
offline, the same rule that keeps `verify:packaged` out of the chain and the
verify suites off the production tmux socket — so every check here drives an
injected requester or a faked `ipcMain` handler. What that leaves unproven is
the whole outward half: that a comment typed into a row actually appears on the
ticket, that `Move…` lists that issue's real workflow transitions and picking
one moves it on the board, and that the panel's re-read shows the new state.
Those need a real Cloud tenant and a person, once. **And a single success on one
tenant on one day is not a property of the code**: it would not prove the
`refused` arm (which needs a transition the board declines), tenant permissions
beyond that one account, TRANSITION SCREENS — a Jira workflow can require fields
at transition time, which this app neither collects nor renders and which is
recorded as still open rather than handled — or Server/Data Center behaviour,
which is a different auth story entirely and was never in scope. This has the
same standing as M17's `--session-id` filename rule and M23's flag spellings:
until somebody has done it, it must not be read as checked.

**A group owns panel IDS, never panel records, and a collapse is a presentation
request rather than a lifecycle command (`shared/groups.ts`, `renderer/groups/groups.ts`,
`Canvas.tsx`'s `collapsedPanelIds`).** This is `Panel`'s own "subagent nodes are derived, not a
kind" ruling reached from the other side: a group could have owned its members, and then a
panel would have had two possible homes in the array every consumer walks. Owning ids leaves the
panel array exactly as flat as it was, so tiering, the registry, the rail, undo and persistence
each need zero code of their own — the same property `merged-layout.ts` buys by synthesising only
`rect.x`/`rect.y`. Three consequences are load-bearing and each fails silently if undone.
**`groupRect` is DERIVED from the members every render and never persisted** — a stored rect is a
second author of a geometry the panels already own, and it goes wrong only after a drag, in a
saved file, later. **A collapse routes through `assignTiers`' `cardIds`, never through
`registry.dispose`** — it cards every member including a FOCUSED one (the one case tiering
otherwise pins live unconditionally) and removes nothing, so a folded-away group is a canvas
that still has its agents running; a collapse that disposed would read to the user as tidying up
and would kill work, which is precisely the "two lifetimes, not one" confusion this repo's
registry exists to make unrepresentable. **A group drag builds one `DragState` per member and
runs each through `applyDrag`** rather than translating a group rect and re-deriving members from
it — inheriting the recompute-from-origin rule the Gotchas section states in full, whose failure
here is not drift but SHEAR, the members sliding apart from each other mid-gesture. `pruneGroups`
repairs a group around a closed or moved-away panel and discards only an EMPTY one, the same
rule `verify:merged` 4 states for an empty workspace: something that silently vanishes reads as
something that was deleted. The layer renders NO groups while merged (`GroupLayer` is handed
`[]`), for the reason the merged view refuses every other geometry write: a group frame drawn
around lane-shifted panels would describe a spatial relationship that exists only in that one
render, and its drag handle would be an affordance for a move the view cannot perform.

**`machine:sample` is polled by the RENDERER against pids the renderer already holds, and main
reads ONE process table for the whole list (`main/machine-cost.ts`, `Canvas.tsx`).** Two
scheduling decisions, each with a quiet failure. The renderer owns the timer — unlike
`agent:state`, `session:live` and `usage:panel`, which are main's own ticks — because closing,
switching or merging a canvas must stop the work IMMEDIATELY, and neither the registry nor a
module-level main timer can know that fact; a main-side poll would go on shelling out to `ps`
for a canvas nobody is looking at, visible only as heat, which is this repo's recurring
signature for a missing dedupe. And main aggregates every target from ONE `ps` snapshot rather
than one call per panel, so the cost is a single subprocess per tick regardless of canvas size —
the same arithmetic `pollLive` already makes by riding tmux's one-call list. The aggregation
itself is recursive over the process tree (a panel's pid is a shell or a tmux CLIENT; the agent
burning the CPU is its descendant, so a non-recursive sum reports ~0% beside a spinning fan) and
totals the UNION of pids rather than the sum of panel figures, so nested targets cannot be
counted twice. A `ps` failure resolves to an empty snapshot rather than rejecting the invoke,
and the renderer KEEPS its previous reading rather than rendering zero — a process-table race is
the ordinary case here, and a confident `0.0%` beside a working agent is the same wrong answer
`costOf`'s `undefined` refuses to give.

**The diagnostics bundle is scrubbed by its TYPE, not by a runtime filter, and the renderer —
not main — decides its shape (`renderer/canvas/diagnostics-model.ts`,
`main/diagnostics-export.ts`).** This is the credential boundary's structural trick reaching a
third data source, after `credential-store.ts`'s `list()` and `toolbox-scan.ts`'s projector: a
maintainer bundle is exactly the artifact that gets pasted into an issue, and this app's panels
hold terminal bytes, an agent's cwd, a resolved command and a full login environment — every one
of which a naive "serialise the session for support" implementation carries out with it, with no
symptom at all, since the bundle looks helpful either way. `DiagnosticsSessionRow` therefore has
NOWHERE to put one: id, tier, dormant, spawned, status kind, and a pid when running. A field
added to `PanelSession` later cannot leak through a field-by-field build the way it would
through a spread. The split of labour matters as much: the renderer assembles and scrubs, and
`main/diagnostics-export.ts` writes that shape to disk with NO further filtering and never
re-reads session state to build its own — one place decides what is safe, which is the same
division `credential-store.ts` draws between deciding and writing. The write is atomic (temp
file in the same directory, then `renameSync`), matching `layout-store.ts` and
`credential-store.ts`, and `dir`/`now` are injected so the whole module is drivable under plain
node.


