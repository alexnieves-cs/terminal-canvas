> **What this file is.** An engineering decisions log, kept alongside the code
> it explains. It is named `CLAUDE.md` because Claude Code loads it
> automatically, but nothing in it is addressed only to a machine: nearly every
> entry records a load-bearing invariant and the *silent* failure that would
> follow from undoing it — a panel that renders nothing with no error, an exit
> code of `0` printed as a failure, a diagram that quietly stopped matching the
> contract. If you are wondering why some line in this repository is written so
> strangely, the answer is almost certainly here, and it is almost always
> "because the obvious version fails without saying anything".
>
> New to the project? Start with [README.md](README.md); come here when you need
> to change something and want to know what it is holding up. The
> `## Load-bearing details` section is the heart of it.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Electron app for macOS: an infinite canvas where every node is a live terminal panel
running a coding-agent CLI. **This is 1.1 (M70).** The second run, M61 to M70, was a design
pass with a screenshot harness and a design brief behind it: one state vocabulary and a state
edge, panels found by name and state, a spawn sheet, every control named, a flat frame with no
resting shadow, the context pane finished, a far view for every kind and a minimap — each with a
spec, a plan, checks written first, a fresh-context critic and verifier, and a build log. The
run before it, M36 to M60, hardened the beta,
gave every panel a worktree, let agents outlive the app, made scrollback durable and
searchable, added attention, keyboard reach, a visual language with two themes, a
shell with a dock and a context pane, a first run, typography, placement, links, OSC 133
command boundaries and a run ledger, per-file discard, the `tc` CLI and URL scheme, orphan
recovery, camera flights with a trail and bookmarks, semantic zoom, export, and a dead-end
audit — each with its spec, plan, build log and checks. The three milestones that shaped the
architecture are still worth keeping in mind: M1 is the PTY layer, M2 is the canvas and its
coordinate math — deliberately built apart so that a blank panel had exactly one possible
cause in each. M3 merged them: `Canvas.tsx` renders real terminal panels with level-of-detail
tiering and viewport culling so the canvas can hold more panels than the browser can afford
live WebGL contexts for.

The milestone table in `README.md` is the roadmap contract — several modules are
deliberately shaped for a milestone that has not landed yet, and the code comments say so.
Don't "simplify" those away.

## Commands

```sh
npm run dev            # electron-vite dev (unsets ELECTRON_RUN_AS_NODE first)
npm run build          # typecheck + electron-vite build
npm run package         # electron-builder: the unsigned .app and .dmg, into release/
npm run typecheck      # both projects; or typecheck:node / typecheck:web individually
npm run verify         # every suite below, then a build, then the suites that need the build
```

There is no unit-test runner and no linter. `npm run verify` is the whole verification
story — it chains typecheck and build in the middle — and it must be green before claiming
work is done.
**A note on check numbering.** Check ids are not sequential across history —
independent branches each appended "the next global integer" and collided on merge.
New checks take a scoped string id (`kind-tail.1`), never the next integer; see
`## Conventions`.

| Script | Runtime | Covers |
|---|---|---|
| `verify:meta` | plain node | 29 checks against the repo's own release hygiene, read as values off disk: LICENSE, `package.json`'s engine floor/repository/`private`, no tracked `.c |
| `verify:viewport` | plain node | ~129 checks over pure canvas/panel geometry: `viewport.ts` (pan/zoom/clamp), `lod.ts` (tiering), `panel-interaction.ts`/`panels.ts` (drag/z math), `poi |
| `verify:groups` | plain node | 5 checks against `renderer/groups/groups.ts` — a group is pure MEMBERSHIP plus derived geometry, and both of its failure modes look fine until a drag |
| `verify:merged` | plain node | 12 checks against two pure modules — `merged-layout.ts`'s lane placement and `marquee.ts`'s arithmetic — because every workspace lays its panels out i |
| `verify:registry` | plain node | 37 assertions against `session-registry.ts`'s lifecycle (create/attach/detach/dispose, dormant attach/wake, closing a never-spawned panel, restart-in- |
| `verify:layout` | plain node | ~189 checks (several lettered sub-checks) against `shared/layout-schema.ts`'s on-disk format and `layout-store.ts`'s coalescing/atomic-write/settings |
| `verify:credentials` | plain node | 15 checks against `shared/credential-schema.ts` and `main/credential-store.ts`, driven with a FAKE crypto and a temp file (the store takes crypto and |
| `verify:jira` | plain node | 15 checks against `main/jira-client.ts` |
| `verify:palette` | plain node | ~122 checks (lettered sub-checks) against `fuzzy.ts`'s matching, `palette-model.ts`'s section-first filter/sort/tie-stability, and `commands.ts`'s list |
| `verify:rail` | plain node | ~157 checks (lettered sub-checks) against `renderer/shell/rail-rows.ts`, `inspector-fields.ts`, `rail-sections.ts`, `review-node-model.ts`, `file-node |
| `verify:review` | plain node | ~96 checks: `git-args.ts` argv/parsing, `review-engine.ts`'s `resolveRepo`/`captureBaseline` against a fake `GitRunner`, the engine's eight result arm |
| `verify:subagent` | plain node | 27 checks (one lettered sub-check) against `subagent-scan.ts`'s pure functions and `subagent-watch.ts`'s state machine driven with a fake filesystem — |
| `verify:file` | plain node | ~38 checks (one lettered sub-check) against `main/file-read.ts`'s five-arm read and `main/file-watch.ts`'s directory watcher, in a fixture directory wi |
| `verify:toolbox` | plain node | 43 checks against `main/toolbox-scan.ts`'s pure parsers and `main/toolbox-read.ts`'s real-filesystem reader, in a fixture tree that is spaced AND synt |
| `verify:usage` | plain node | ~26 checks: `usage-parse.ts`'s JSONL parser, `pricing.ts`'s four-class price table, and `usage-accumulator.ts`'s per-panel accumulator |
| `verify:machine-cost` | plain node | 7 checks against `main/machine-cost.ts`'s `ps` parsing and process-tree aggregation, driven with a FAKE process lister and a hand-written table — so n |
| `verify:tmux` | plain node | 35 checks (one lettered sub-check): `tmux-args.ts` argv/config/version/list parsing, `tmux-probe.ts`'s backend selection, the quoting of the `pane-die |
| `verify:control` | plain node | 7 checks against M54's control surface: `control-protocol.ts`'s shared parser (both doors, `command` refused), `resolveOpen`, a REAL Unix socket under `control-server.ts` (stale file replaced, 0600, a bad line answered and survived), the CLI's exit codes over an injected connect, the one handler behind both doors, and the launcher script |
| `verify:agent-state` | plain node | 27 checks (one lettered sub-check): `scanChunk`'s escape-sequence scanner (bells and OSC 133 marks in one pass) and `nextState`'s state machine |
| `verify:agent-session` | plain node | 69 checks (M71, M73–M76): `shared/transcript.ts`'s line parser and stdin encoders against four streams recorded from `claude` 2.1.259, `agent-session-args.ts`'s headless argv, and `AgentSessionManager` over a FAKE process runner — spawn on first send, the 16ms delta batch, the queue, a truncated stream, a non-zero exit, `--resume`, an interrupt answered and one that times out, a permission request answered and one dropped by its process's exit, usage summed per turn against cost taken cumulative, and the M61 identity rule on both process doors; plus `quit.ts`'s optional `agents` arm |
| `verify:styles` | plain node | 22 checks against `src/renderer/styles.css`, read as TEXT rather than parsed (a CSS library would be the heaviest dependency in the cheapest tier this |
| `verify:package` | plain node | 13 checks against `build/builder-config.cjs`'s returned value (a *function*, not a static JSON blob, which is what lets a check assert properties of a |
| `shot` (`npm run shot`) | real Electron, **not in `npm run verify`**, asserts nothing | M61. 23 PNGs of the real renderer plus a `manifest.json` of intents, from a seeded fixture canvas — the visual loop. Read the images; hand them to a fresh-context critic. See `docs/build-log/m61-visual-loop.md` |
| `verify:packaged` | real Electron, **not in `npm run verify`** | 12 checks: packages with `electron-builder --dir` and launches the produced binary with a stripped PATH, a throwaway `--user-data-dir`, and a scratch |
| `verify:pty` | Electron as node | 10 checks: `node-pty` behaviour end to end |
| `verify:pty-manager` | Electron as node | 63 checks (several lettered sub-checks) against the real `PtyManager` on both the direct backend and a real `TmuxBackend` on a throwaway socket: sessi |
| `verify:window` | real Electron | 4 checks: renderer teardown reaches the PTY layer |
| `verify:ipc` | real Electron | 1 check: every INVOKE channel in `Object.values(IPC)` has a main-process handler — 80 channels as of the newest milestone that added one — re-derive i |
| `verify:canvas` | real Electron | 6 checks: real input into the built renderer |
| `verify:xterm` | real Electron | 7 checks: an xterm `Terminal` survives its host being detached and reattached — this is a spike proving the M3 eviction design's core assumption (a te |
| `verify:panels` | real Electron | ~285 checks (many lettered sub-checks): the single largest suite, driving a real renderer end to end against `out/renderer/index.html` through a hand- |

None need a display; the real-Electron ones open a window with `show: false`. There is no
test-name filter in any of them — each runs everything and exits non-zero on any failure.
To add a check, append an `ok(...)` assertion in the IIFE.

**Before adding or debugging a check, read [docs/verify-suites.md](docs/verify-suites.md).**
It carries the per-suite blow-by-blow (which individual checks teach something a future
engineer could get wrong, and why) plus five rules that fail silently if unknown: a check
that THROWS aborts the run so every check below it never executes and its RED is not
evidence; why the Electron binary and not `node`; why `verify:pty` duplicates production
code on purpose; why `verify:canvas`/`verify:panels` consume the build; and the
`@shared`/`@renderer` esbuild path-alias trap that manifests as a HANG rather than a red
suite.

whether a given bundle needs an alias is to delete it and build** — reading the imports and
reasoning about which are `import type` has been wrong repeatedly, because a re-export chain or
a value imported three hops down a bundle is easy to miss by eye.

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
renderer --invoke--> credential:list / credential:set / credential:delete      --> main
renderer --invoke--> credential:verify                                         --> main
renderer --invoke--> file:open / file:read / file:close / file:write          --> main
renderer --invoke--> file:create                                              --> main
renderer --invoke--> fs:list                                                  --> main
renderer --invoke--> toolbox:read / toolbox:permissions                       --> main
renderer --invoke--> jira:list / jira:transitions                             --> main
renderer --invoke--> jira:comment / jira:transition                           --> main
renderer --invoke--> machine:sample                                           --> main
renderer --invoke--> diagnostics:sample / diagnostics:export                  --> main
renderer --invoke--> export:panel-text / export:canvas-png                    --> main
renderer --invoke--> env:report                                                   --> main
renderer --invoke--> link:open                                                    --> main
renderer --invoke--> ledger:list                                                  --> main
renderer --invoke--> spawn:sheet / spawn:recent                                   --> main
renderer --invoke--> agent:create / agent:send / agent:interrupt / agent:dispose  --> main
renderer --invoke--> agent:answer / agent:list / agent:transcript / agent:import  --> main
renderer --invoke--> agent:clipboard-image                                       --> main
renderer <--send---  pty:data (batched ~16ms) / pty:exit                       <-- main
main     --send-->   edit:copy / edit:paste / edit:undo / edit:redo            --> renderer
main     --send-->   canvas:counts / canvas:reset                              --> renderer
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
                         share. ONE useMemo — splitting it breaks Palette's command memo
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
## Load-bearing details

Every entry in this section exists because the naive version fails *silently*. It lives in
**[docs/load-bearing.md](docs/load-bearing.md)** rather than here, so it is not resident in
every session's context — it is ~145KB of prose that is needed when you are about to change
one specific module, not on every turn.

**Read it before changing anything, and search it rather than scrolling it.** Nearly every
entry names its own module in backticks, so `grep -n 'pty-manager' docs/load-bearing.md` is
the reliable way in. The subsystem keyword clusters worth knowing are
`pty-manager`/`tmux`/`shell-env`, `Canvas.tsx`/`viewport`/`lod`, `panels.ts`/panel kinds,
`palette`, `layout-store`/`layout-schema`, `review-`/`git-`, `rail-`/`inspector-`,
`credential`, `file-`, `toolbox`, `usage`/`pricing`, `subagent`, `groups`, `handoff`/`useHandoff`, and `-store.ts`.
Searching the SYMPTOM ("panel is blank") mostly fails, because the entries are written from
the cause.

The handful of rules that generalise beyond one module, so you know they exist before you
go looking:

- **Two lifetimes, not one.** A panel's *session* (its xterm `Terminal` and PTY) is created
  once and disposed once in a module-level registry outside React; the React component is
  mounted and unmounted freely by tiering and owns nothing. Confusing the two kills a
  running agent with no error anywhere.
- **Absent vs. malformed vs. unknown, in every parser.** An ABSENT key is every pre-existing
  file and must warn nothing; a PRESENT-but-malformed value warns and is dropped, never
  coerced; a per-entry failure costs that entry, never the whole collection. An absent
  optional field must stay absent through every copy site — spreading writes
  `key: undefined`, which survives IPC and reads as present.
- **`registry.version()` carries tier/status/focus/exit and nothing higher-frequency.** Every
  module-level store added since is subscribed per panel id, caches its snapshot object, and
  is cleared at every panel-removing call site.
- **Three-state results, never two.** "Nothing to show", "asked but unanswered" and "a real
  answer" are three different renderings; collapsing any two tells the user the wrong fix.
- **A row that disappears is indistinguishable from a feature that was never built.** Every
  administrative affordance is disabled with a distinct, named reason rather than removed.
- **No renderer `process.env`, and the main process owns every PTY.** electron-vite compiles
  `process.env` in the renderer to a literal `{}`, so the fallback is the only branch that
  ever runs.
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


## Gotchas

- **Jira ticket context is `paste()`, never `write()` (`TerminalPanel.tsx`).** A ticket
  description is agent context, not a credential, so it may cross to a session; but it is
  usually multi-paragraph. Raw writes submit every newline separately, firing incomplete
  fragments into the agent before the description arrives. The terminal's `paste()` is the
  bracketed-paste path and is the only acceptable handoff.

- **`Cannot read properties of undefined (reading 'whenReady')`** — your shell exports
  `ELECTRON_RUN_AS_NODE=1` (VS Code's extension host does this), so the Electron binary boots
  as plain Node. `dev`/`start` already `unset` it; you only hit this invoking `electron-vite`
  directly.
- **`Error: Electron uninstall`** — the binary download didn't run:
  `node node_modules/electron/install.js`.
- The renderer has a strict CSP in `src/renderer/index.html` (`default-src 'self'`). No CDN
  scripts, no remote assets.
- `tsconfig.node.json` / `tsconfig.web.json` both set `noUnusedLocals` and
  `noUnusedParameters` — prefix intentionally-unused params with `_`.
- A trackpad pinch arrives as a wheel event with **`ctrlKey: true`** and no key held. It is a
  WebKit convention Chromium adopted, and it is the only signal separating pinch from scroll.
- `deltaMode` is not always pixels: trackpads report `0`, mouse wheels report lines (`1`) and
  need roughly a 16x multiplier before the deltas are comparable.
- **A drag delta is `screenToWorld(p₂) − screenToWorld(p₁)`, never
  `screenToWorld(p₂ − p₁)`.** `screenToWorld` subtracts the viewport translation before
  dividing by scale; applying it to a delta subtracts a translation that should have
  cancelled, so the panel drifts off the cursor as soon as the viewport isn't at the origin.
  `verify:viewport` check 27 exists for this.
- **`applyDrag` (`panel-interaction.ts`) recomputes from the gesture's origin rect every
  frame, never from the previous frame's result.** Accumulating per-frame deltas drifts (each
  frame rounds, and at `scale: 0.1` one rounding is worth ten world units) and breaks outright
  if the user zooms mid-drag, since earlier deltas were measured under a transform that no
  longer applies. `applyDrag` itself only ever receives two already-resolved *world* points,
  so neither bug is reachable from inside the function — both are caller-side mistakes.
  `verify:viewport` checks 27 and 28 pin real properties of `applyDrag` (drag distance scales
  as `1/k`; the function is stateless) but are not what would catch either regression; the
  actual discriminator is `verify:panels` check 10, which dispatches a zoom mid-drag
  specifically to separate a correct recompute-from-origin implementation from one that
  accumulates screen-space deltas. A variant that instead advances *both* the drag state's
  origin fields together every frame is mathematically identical to the origin-based
  implementation and cannot be told apart by any assertion on the final rect — check 10's own
  header records that limit; don't rediscover it by trying to tighten the check.
- **A dispatched event on `.panel__slot` never reaches xterm's listeners.** `.panel__slot`
  only wraps the terminal's host div; xterm binds both its selection mousedown
  (`addDisposableDomListener(this.element, "mousedown", ...)`) and its mouse-reporting
  handlers (`bindMouse()`: `const t = this.element`) on `.xterm` — one level *below* the slot,
  not on `.xterm-screen`, which supplies only the rect the coordinates are measured against.
  Capture-toward-target traversal does not visit a target's own descendants, so an
  `executeJavaScript` check that dispatches on `.panel__slot` to verify "does xterm see this"
  will pass or fail for the wrong reason no matter what the guard under test actually does.
  Dispatch on `.xterm-screen` — a descendant of `.xterm`, so `.xterm`'s listeners are on its
  propagation path, and the same node a real cursor over the rendered terminal would be over.
  This cost two fix rounds in `verify-panels.cjs` during M4a.

## Working on this repo

Milestones follow a fixed shape: a design spec in `docs/superpowers/specs/`, then an
implementation plan in `docs/superpowers/plans/`, then tasks executed test-first — failing
checks written and *watched failing* against a non-existent module before it is implemented.
M2 and M3 are both worked examples of this. Follow it when starting the next unscheduled
milestone — see `docs/ideas-backlog.md` for candidates.

## Conventions

- Commits: conventional format scoped by milestone, e.g. `feat(m3): ...`, `fix(m3): ...`.
- Comments in this codebase explain *why*, especially for the workarounds above. Match that
  density; a non-obvious line without a reason attached will be "fixed" by someone later.
- **A new verify check takes a SCOPED id, never the next global integer.** Write
  `ok('kind-tail.1 …')`, not `ok('186 …')`. `ok()`'s first argument is free text and
  nothing parses it (`results.push({ n, pass, detail })`), so this costs nothing at
  runtime and removes the one thing that has forced seven-plus `renumber` commits in
  this repository's history: two branches that never saw each other both appending
  from their own view of the last number, both correct, colliding on merge. "M13" was
  claimed four separate times. A scope name describes the SUBJECT, so two branches
  picking the same one are working on the same thing and would have conflicted anyway.
  Existing numeric ids stay exactly as they are — hundreds of them are cited above —
  and `verify:meta` 22 fails the build if two COMPUTED checks in one suite ever share
  an id. (A guard or skip branch reusing its own check's id is fine and is not
  flagged: only one of the two ever runs, and it is told apart by passing a literal
  `true`/`false` where a real assertion passes a computed expression.)
- **Don't restate a count in prose in more than one place.** `verify:meta` 23 exists
  because seven module-level stores each numbered themselves by hand and the numbers
  read third, FIFTH, FOURTH, FOURTH, —, SIXTH; two files claimed the same ordinal and
  this file repeated two of the wrong ones. Record the rule, not the tally. Where a
  count genuinely has to be written down, `verify:meta` is where it gets pinned so it
  cannot drift silently — that is what rules 19 and 22 already do.
