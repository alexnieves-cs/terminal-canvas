# Verify suite table

> Split out of CLAUDE.md: what each `npm run verify:*` script covers. The
> per-suite blow-by-blow and the five silent-failure rules are in
> [verify-suites.md](verify-suites.md).

## Commands

```sh
npm run dev            # electron-vite dev (unsets ELECTRON_RUN_AS_NODE first)
npm run build          # typecheck + electron-vite build
npm run package         # electron-builder: the unsigned .app and .dmg, into release/
npm run typecheck      # both projects; or typecheck:node / typecheck:web individually
npm run verify         # the plain tier concurrently, then the build, then the Electron tier
```

There is no unit-test runner and no linter. `npm run verify` is the whole verification
story — `scripts/verify-all.cjs`, deriving its suite list from package.json rather than
enumerating one — and it must be green before claiming work is done.
**A note on check numbering.** Check ids are not sequential across history —
independent branches each appended "the next global integer" and collided on merge.
New checks take a scoped string id (`kind-tail.1`), never the next integer; see
`## Conventions`.

| Script | Runtime | Covers |
|---|---|---|
| `verify:meta` | plain node | 38 checks against the repo's own release hygiene, read as values off disk: LICENSE, `package.json`'s engine floor/repository/`private`, no tracked `.c |
| `verify:viewport` | plain node | ~137 checks over pure canvas/panel geometry: `viewport.ts` (pan/zoom/clamp), `lod.ts` (tiering), `panel-interaction.ts`/`panels.ts` (drag/z math), `poi |
| `verify:groups` | plain node | Checks against `renderer/groups/groups.ts` — a group is pure MEMBERSHIP plus derived geometry, and both of its failure modes look fine until a drag — and, from M203/M204 (D08), `renderer/canvas/task-members.ts`: a task's membership derived from facts (`task.members.*`), `show-task`'s decision (`task.show.target.1`) and Arrange's plan (`arrange.1–.3`) |
| `verify:merged` | plain node | 12 checks against two pure modules — `merged-layout.ts`'s lane placement and `marquee.ts`'s arithmetic — because every workspace lays its panels out i |
| `verify:registry` | plain node | 38 assertions against `session-registry.ts`'s lifecycle (create/attach/detach/dispose, dormant attach/wake, closing a never-spawned panel, restart-in- |
| `verify:layout` | plain node | 234 checks (several lettered sub-checks) against `shared/layout-schema.ts`'s on-disk format and `layout-store.ts`'s coalescing/atomic-write/settings |
| `verify:credentials` | plain node | 18 checks against `shared/credential-schema.ts` and `main/credential-store.ts`, driven with a FAKE crypto and a temp file (the store takes crypto and |
| `verify:jira` | plain node | 15 checks against `main/jira-client.ts` |
| `verify:github` | plain node | 7 checks against `main/github-client.ts` over a fake broker with recorded GitHub bodies: the no-credential arm in the credential rows' words, two GET calls through the broker, the `owner/repo#N` mapping with a PR deduped across both lists, the four failure arms, the description cap and the half-answer note |
| `verify:palette` | plain node | 140 checks (lettered sub-checks) against `fuzzy.ts`'s matching, `palette-model.ts`'s section-first filter/sort/tie-stability, and `commands.ts`'s list |
| `verify:rail` | plain node | ~183 checks (lettered sub-checks) against `renderer/shell/rail-rows.ts`, `inspector-fields.ts`, `rail-sections.ts`, `review-node-model.ts`, `file-node |
| `verify:review` | plain node | ~98 checks: `git-args.ts` argv/parsing, `review-engine.ts`'s `resolveRepo`/`captureBaseline` against a fake `GitRunner`, the engine's eight result arm |
| `verify:subagent` | plain node | 27 checks (one lettered sub-check) against `subagent-scan.ts`'s pure functions and `subagent-watch.ts`'s state machine driven with a fake filesystem — |
| `verify:file` | plain node | 83 checks (several lettered sub-checks) against `main/file-read.ts`'s five-arm read and `main/file-watch.ts`'s directory watcher, in a fixture directory wi |
| `verify:toolbox` | plain node | 101 checks (many lettered sub-checks) against `main/toolbox-scan.ts`'s pure parsers and `main/toolbox-read.ts`'s real-filesystem reader, in a fixture tree that is spaced AND synt |
| `verify:usage` | plain node | ~26 checks: `usage-parse.ts`'s JSONL parser, `pricing.ts`'s four-class price table, and `usage-accumulator.ts`'s per-panel accumulator |
| `verify:machine-cost` | plain node | 7 checks against `main/machine-cost.ts`'s `ps` parsing and process-tree aggregation, driven with a FAKE process lister and a hand-written table — so n |
| `verify:tmux` | plain node | 35 checks (one lettered sub-check): `tmux-args.ts` argv/config/version/list parsing, `tmux-probe.ts`'s backend selection, the quoting of the `pane-die |
| `verify:control` | plain node | 15 checks against M54's control surface: `control-protocol.ts`'s shared parser (both doors, `command` refused), `resolveOpen`, a REAL Unix socket under `control-server.ts` (stale file replaced, 0600, a bad line answered and survived), the CLI's exit codes over an injected connect, the one handler behind both doors, and the launcher script |
| `verify:agent-state` | plain node | 27 checks (one lettered sub-check): `scanChunk`'s escape-sequence scanner (bells and OSC 133 marks in one pass) and `nextState`'s state machine |
| `verify:agent-session` | plain node | ~134 checks (M71, M73–M76, M81, M82, M90, M132): `shared/transcript.ts`'s line parser and stdin encoders against four streams recorded from `claude` 2.1.259, `agent-session-args.ts`'s headless argv, and `AgentSessionManager` over a FAKE process runner — spawn on first send, the 16ms delta batch, the queue, a truncated stream, a non-zero exit, `--resume`, an interrupt answered and one that times out, a permission request answered and one dropped by its process's exit, usage summed per turn against cost taken cumulative, and the M61 identity rule on both process doors; plus `quit.ts`'s optional `agents` arm; M90's codex adapter over three recorded codex streams and the manager's one-process-per-turn arm (the lingering-process queue, the adopted thread id, the budget kill, the image refusal) |
| `verify:teammates` | plain node | 25 checks (M100, M114, M120, M131) against `shared/places.ts` and `main/places.ts` over a FAKE realpath: `..` walking out of a typed prefix, a symlink inside a place pointing out, a relative/`~`/`./` path refused outright, no places = nothing, a missing path outside, and the gate's named refusal with the fix (and an unknown teammate refused, a request with no teammate untouched); `carryTeammate`/`emptyTeammate` |
| `verify:electron` | plain node | 4 checks (M112): Electronegativity over `src/` with the installed Electron version pinned (`eneg.1` — without `-e` the tool assumes v0.1.0 defaults, silently), a closed `ACCEPTED` list of seven deliberate findings where a NEW finding fails (`eneg.2`) and a row that stopped firing fails too (`eneg.3` — the sentence beside it now describes nothing), and the webview guest's hardening pinned as text because the tool cannot see the tag (`eneg.4`) |
| `verify:verbs` | plain node | 14 checks (M96–M97, M103, M149): the verb table's closure over `PaletteActions` (read as text), the destructive flag as data with no `kill`, `buildPlan`'s named refusals and the confirmation step, `runPlan` refusing an unacknowledged destructive step, C0 stripped from `type` with `submit` separate, typing gated by panel KIND, the `planWritable` list refusing both ceilings and the vault root, a token planted in a REAL scrollback log never returning through `outward`, and the auto modes validating as plans with the chip's words |
| `verify:styles` | plain node | 39 checks against `src/renderer/styles.css`, read as TEXT rather than parsed (a CSS library would be the heaviest dependency in the cheapest tier this |
| `verify:package` | plain node | 13 checks against `build/builder-config.cjs`'s returned value (a *function*, not a static JSON blob, which is what lets a check assert properties of a |
| `shot` (`npm run shot`) | real Electron, **not in `npm run verify`**, asserts nothing | M61. 23 PNGs of the real renderer plus a `manifest.json` of intents, from a seeded fixture canvas — the visual loop. Read the images; hand them to a fresh-context critic. See `docs/build-log/m61-visual-loop.md` |
| `verify:visual` | real Electron, **not in `npm run verify`** | M148. Every scene of the shot harness against a committed golden (`verify/visual/goldens/`), decoded with `nativeImage`, a pixel differing over `CHANNEL_TOLERANCE` (24/255), a scene failing over `PIXEL_BUDGET` (0.5 %) with a diff image under `out/visual/`; `UPDATE_GOLDENS=1` rewrites the goldens — only after looking. `verify:meta visual.1` pins one golden per declared scene |
| `verify:packaged` | real Electron, **not in `npm run verify`** | 12 checks: packages with `electron-builder --dir` and launches the produced binary with a stripped PATH, a throwaway `--user-data-dir`, and a scratch |
| `verify:pty` | Electron as node | 10 checks: `node-pty` behaviour end to end |
| `verify:pty-manager` | Electron as node | 63 checks (several lettered sub-checks) against the real `PtyManager` on both the direct backend and a real `TmuxBackend` on a throwaway socket: sessi |
| `verify:window` | real Electron | 4 checks: renderer teardown reaches the PTY layer |
| `verify:ipc` | real Electron | 1 check: every INVOKE channel in `Object.values(IPC)` has a main-process handler — 120 channels as of M133 — re-derive `EXPECTED_CHANNELS` in the suite when a milestone adds one (the pin is deliberate: a channel added to the contract without a handler reads as a hang, not an error) |
| `verify:canvas` | real Electron | 6 checks: real input into the built renderer |
| `verify:xterm` | real Electron | 11 checks: an xterm `Terminal` survives its host being detached and reattached — this is a spike proving the M3 eviction design's core assumption (a te |
| `verify:panels` | real Electron | M135: FIVE parts over one harness (`scripts/panels-harness.cjs`), each `verify:panels:<part>` its own script with a watchdog pinned at 1.25× its own measured green run — `core` (tiering, input, undo, presets, palette, settings, attention), `shell` (workspaces, merged, rail, inspector, dock, groups, links), `kinds` (usage, file, review, toolbox, jira, link drawing, worktrees, scrollback, broadcast), `agents` (handoff, search, keyboard, theme, the M46–M52 shell, composer, templates, runs, graph, tools, approvals, budget, memory, the M61–M74 surfaces), `product` (chat, watchers, vault, github, integrations, verbs, browser, header, board, engines, sandbox, skills, workflow). Every check id the un-split file held is still here (`verify:meta panels-split.2` compares the set against `pre-v7-run`); `npm run verify:panels` is the chain of the five |

None need a display; the real-Electron ones open a window with `show: false`. Each runs
everything and exits non-zero on any failure. `TC_ONLY`, `TC_VERIFY_ELECTRON_JOBS` and the
panels parts' `headroom.1` are described once, in [verify-suites.md](verify-suites.md).
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

