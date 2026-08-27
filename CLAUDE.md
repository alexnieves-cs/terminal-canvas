# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Electron app for macOS: an infinite canvas where every node is a live terminal panel
running a coding-agent CLI. **M1 through M5c have landed** — the PTY layer, the canvas, their
merge, persistence and tmux-backed session survival (M4), presets (M5a), the Cmd+K command
palette (M5b), and electron-builder packaging into a real, launchable `.app` (M5c). The three that shaped the architecture are worth keeping in mind: M1 is the PTY layer, M2 is the
canvas and its coordinate math — deliberately built apart so that a blank panel had exactly
one possible cause in each. M3 merges them: `Canvas.tsx` now renders real terminal panels
instead of M2's placeholder rectangles, with level-of-detail tiering and viewport culling so
the canvas can hold more panels than the browser can afford live WebGL contexts for.

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
work is done. Individual suites:

| Script | Runtime | Covers |
|---|---|---|
| `verify:viewport` | plain node | 55 checks: `viewport.ts`'s pure canvas math (1–11b), `lod.ts`'s pure tiering (20–25), `panel-interaction.ts` + `panels.ts` drag/z math (26–34), `pointer-correct.ts` (35–39), the undo `history.ts` stack (40–45), dormancy outranking focus in `lod.ts` (46–47), `makePanel`'s spec/size arguments (48), and `centreOn` framing a rect without touching the scale (49–50). M6 adds `cascadeCentre`'s coincidence stepping (51–55) — including the half that is easiest to get subtly wrong: 51 pins that a merely OVERLAPPING panel does not move a spawn (centres, not rects), 53 walks the whole lattice rather than one step, and 54 asserts `CASCADE_EPSILON < CASCADE_STEP` as a relation, because inverting them makes every FIRST press run the lattice and land 384px off centre — a failure that surfaces in `verify:panels` 7 as a centring bug with nothing pointing at the epsilon |
| `verify:registry` | plain node | 25 assertions against `session-registry.ts`'s lifecycle, using a fake bridge and fake terminal factory — numbered 1–19 with lettered sub-checks (`3b`, `3c`, `7b`, `7c`, `7d`), including explicit close (13–15), dormant attach/wake (16–18), and closing a never-spawned panel (19). M6a adds check 20: `PanelStatus.running` widens to carry `command`/`cwd`/`reattached`, so the header chain has something besides the spec to read for a login-shell panel |
| `verify:layout` | plain node | 82 checks (the last check number is 80; see the lettered sub-checks below): `shared/layout-schema.ts`'s on-disk format validation and `layout-store.ts`'s coalescing, atomic write, and settings resolution, plus `shared/layout-schema.ts`'s preset parsing (27–34), `layout-store.ts`'s preset accessors (35), and `main/presets.ts`'s pure helpers (36–40), and a `presets` key that is present but not an array warning rather than vanishing (41). M5b adds the preset mutations the palette drives — rename, delete, and the default falling back when the default itself is deleted (42–46) — `parsePrompts` and the store's prompt members (47–52), and `main/prompts.ts`'s project-prompt reading, its two caps, and the never-deduping merge (53–57). M6a adds `Panel.title` round-tripping through `layout-adapt.ts` — parsed in on the way from disk (58), written back out on the way to disk (59), and an untitled panel writing no `title` key at all rather than a saved absent-marker (60). M6b adds `shared/settings-schema.ts` and its `preferences` map: the three restore ids and `settingsInCategory`'s query (61), an unset id resolving to the schema default (62), id uniqueness and every def carrying a label/description/keyword (63–64), `parsePreferences`'s absent-vs-malformed split — no key at all warns nothing (65), a non-object warns and is replaced (66) — an unknown id dropped with a warning rather than carried forward as a permanent typo (67), a wrong-typed value dropped and warned rather than coerced (68), the pre-M6b `settings`→`preferences` migration seeding only the three restore ids and only when a legacy key was actually present (69), a fresh store answering the schema defaults with an empty map (70), a preference surviving a write and a reopen (71), `setPreference` refusing an id the schema does not declare (72) and, now that `SettingDef['type']` is honest about what `typeof` returns, refusing a known id given a wrong-typed value too (72b), `settings()`/`setSetting()` proven a VIEW over the same map rather than a second store by writing through one accessor and reading through the other (73), and the Restore submenu's own query returning exactly the three restore ids (74) — see "One map, and a typed view over it" and "The Restore submenu is derived, not listed" below, including what check 74 does **not** prove. M6c adds the three `agent.*` settings: all three declared with the required label/description/keywords (75), `agent.idleAfterMs` typed as a `number` def rather than the schema's usual boolean (76), an unset threshold resolving to its schema default (77), a boolean value refused for a number setting (78), an out-of-range threshold refused on both ends while the bounds THEMSELVES are accepted (79), a number preference round-tripping through a write and a reopen (80), and a hand-edited, out-of-range `agent.idleAfterMs` loaded from disk dropped and warned rather than silently carried into the map (80b) — the load-path half of the same bound the write path already enforces; see "`agent.idleAfterMs` is bounded, and both ends fail silently" below. The count is 82 while the last number is 80, because of the lettered sub-checks `72b` and `80b` |
| `verify:palette` | plain node | 60 checks: `fuzzy.ts`'s matching and ranking (1–7), `palette-model.ts`'s filtering, tie stability and runnable-row selection (8–18), and `commands.ts`'s list construction (19–33) — including the disabled *reasons*, which is the half worth checking: a built-in refusing rename, an unavailable preset, a prompt insert with no captured panel, and a project prompt refusing deletion all stay VISIBLE with their reason rather than disappearing from the list. M6a added the `panel.rename` row (31–32) and a titled panel being findable by its title (33). M6p adds the structure: section-first sorting outranking a better score in a later section and score still deciding inside one (34–35), `bestMatchIndex` skipping disabled rows (36–38), `hiddenAtRest` in BOTH directions (39–40), `searchText` including the whole phrase (41, 41b), `splitHighlight` (42–43), the two retitles (44–45), what is hidden versus what is not (46), exactly-two-destructive (47), `⌘N` on the default preset alone (48), and the drill-in doors and what a scope shows (49–50). **Check 30 was rewritten**: it derives its expectation from `SECTIONS` and runs through `filterCommands`, because construction order stopped being the grouping the moment sorting became section-first — see "Sections are data" below. M6b adds the `setting` section and its drill-in: a boolean setting rendering as a runnable row carrying its label and description (51), a setting findable by a keyword the row never shows (52), running a setting row toggling it to the opposite value (53), and the row's title naming which way the toggle currently sits (54) — see "Settings are a drill-in, not a flat list" below. M6c adds the `agent.idleAfterMs` number row: it renders with its current value in the title (55, 56), and stepping it begins an EDIT rather than toggling it like a boolean row (57) — a number setting is a different `run()` shape, not a boolean with extra text — and the row is hidden at rest and lives in the `settings` scope like every other setting (58), with its id recovering the full `SettingRow` (carrying `min`/`max`) rather than a bare boolean (58b). The count is 60 while the last number is 58, because of the lettered sub-checks `41b` and `58b` |
| `verify:tmux` | plain node | 27 checks: `tmux-args.ts`'s argv, config text, version parsing and list parsing (1–13), `tmux-probe.ts`'s pure backend selection (14–17b), the quoting of the pane-died redirect target against a spaced `exitDir` (18), and the exact-match `=` on every kill-session target (19). M5c adds `resolveSocket`: dev and packaged landing on different sockets (20), the dev socket unchanged from its historic value (21), an explicit override beating both defaults (22), a blank or whitespace override falling back to the default rather than leaking through to tmux's own default socket (23), and `buildStartServerArgs` — the one tmux argv that used to be hand-rolled — defaulting to the private socket and threading an explicit one (24–25). M6a adds check 26: `buildHasSessionArgs`'s argv, including the same exact-match `=` on its target that every kill-session target already obeys, so panel `n1`'s probe doesn't read `n12` as its own surviving session. The count is 27 while the last number is 26, because of the lettered sub-check `17b` |
| `verify:agent-state` | plain node | 25 checks (the last check number is 24; see the lettered sub-check below): `scanForBell`'s scanner (1–10) and `nextState`'s state machine (11–24). The two that matter most: 2 and 3 pin that an OSC/DCS-terminating BEL rings zero bells — a bare `indexOf(0x07)` would fail both silently, painting a title change as an attention-worthy bell — and 6–8 pin the scanner across a SPLIT chunk (an OSC opened in one 16ms flush and terminated in the next, and a bare BEL split the same way), which is the whole reason `ScanState` is carried between calls rather than reset per call. 5/5b assert a DCS body swallows an embedded BEL and a REAL bell right after it still rings — the state machine doesn't just eat the trap, it recovers cleanly the instant real content resumes. 9 asserts a CSI (no BEL-swallowing string body) leaves a bell alone, guarding the boundary the other direction. 16–19 pin that `wants-you` is STICKY against further output, a second bell, and even an hour of idle ticks — nothing but `acknowledge` or `exit` moves it. 23–24 pin `exited` as terminal and unconditional: even a panel mid-`wants-you` goes straight to `exited` on a PTY exit, and nothing revives it after. See "A title is not a bell" below |
| `verify:package` | plain node | 10 checks against `build/builder-config.cjs`'s returned value: `node-pty` unpacked from the asar and the pattern depth-independent (1–2), `asar` actually on (3), the `files` globs (4–5), app identity and output dir (6–7), signing explicitly *decided* rather than unmentioned (8), targets and architecture (9), and the arch being a parameter rather than a constant (10) |
| `verify:packaged` | real Electron, **not in `npm run verify`** | 9 checks: packages with `electron-builder --dir` and launches the produced binary with a stripped `PATH`, a throwaway `--user-data-dir` and a scratch `TC_TMUX_SOCKET`. Asserts the app survives startup (3 — the asar/`node-pty` proof), reports itself packaged (4), recovered a PATH launchd never gave it (5 — the first time `shell-env.ts`'s reason for existing has ever been observed), used the scratch socket (6), actually used the throwaway `--user-data-dir` rather than silently falling back to the real one (7), named a backend and a reason (8), and actually spawned a PTY (9). Kept out of the default chain because it rebuilds native modules and reaches electron-builder's cache — minutes, plus a network dependency — and the repo's one green-or-not signal must stay fast and offline. It is the **pre-release gate**; run it before cutting a build |
| `verify:pty` | Electron as node | 10 checks: `node-pty` behaviour end to end |
| `verify:pty-manager` | Electron as node | 23 checks: the real `PtyManager` (1–10 on the direct backend), plus the real `TmuxBackend` end to end against a throwaway socket and a spaced `exitDir` — session creation, detach-and-reattach at the same pid (12), cross-manager list (13), exit-code fidelity (14–14b), destroying a session this manager never spawned (14c), a prefix-colliding kill target leaving the wrong session alone (14d), and destroy/shutdown (15). M6a adds 16/16b: a fresh session reports `reattached: false` and the same panel spawned again — after the first one is still alive — reports `reattached: true`, the two halves that only separate a `has-session` probe taken *before* the spawn from one taken after (see "`reattached` costs a probe" below). M6c adds 17–19, the wiring proof that `agent-state.ts`'s pure state machine actually reaches `IPC.AGENT_STATE` through the real manager rather than sitting unused beside it: plain output on a fresh session produces exactly one `busy` event (17), a real OSC window title produces no `wants-you` at all — this suite runs the direct backend, so it is the one place a tmux-free machine can see the OSC trap NOT fire (18), and a real bell followed by a real write moves the panel to `wants-you` and then back off it (19). Skipped loudly, never silently, when no tmux binary is found |
| `verify:window` | real Electron | 4 checks: renderer teardown reaches the PTY layer |
| `verify:ipc` | real Electron | 1 check: every contract channel has a handler — 20 channels as of M6c, the newest being `agent:acknowledge` |
| `verify:canvas` | real Electron | 6 checks: real input into the built renderer |
| `verify:xterm` | real Electron | 6 checks: an xterm `Terminal` survives its host being detached and reattached |
| `verify:panels` | real Electron | 61 checks: tiering, the pointer corrector, drag, resize, wheel ownership, close, z-order, id uniqueness, dormant restore/wake (18), layout persistence (19), undo/redo (20–22), reset (23), boot reconcile (24), one end-to-end invocation of `session:backend` through the real bridge (25), a real renderer reload leaving its tmux session running (26), and preset spawn, undo-disposes, the pushed default, capture, and the command-less case (27–31). Check 32 is the only preset check the harness does NOT drive by hand: it seeds `layout.json` with a non-shell `defaultPresetId`, installs the same `did-finish-load` push production installs, and reads the template back out of the renderer — see "The default preset is caught at module scope" below. M5b adds the palette: opening it and the focus rules (33–36), the undo guard (37), a rename reaching the store and the input mode clearing afterwards (38, 38b), the switcher framing a dormant panel without waking it (39), `preset:spawn-by-id` end to end (40a), a prompt insert arriving as a bracketed paste rather than a raw write (40), a mouse-picked row not releasing the focused panel (41), a click OUTSIDE the palette closing it and still focusing the panel it hit (42), and the project half of the prompt list end to end — a real `.claude/commands/*.md` under the captured panel's own cwd, listed with its source label and inserted into that panel (43). M6a adds the header chain end to end: a fresh spawn's header names what main actually resolved rather than a hardcoded stand-in (44), a rename typed into the palette reaching the panel's own header, not just the store (45), and one `Cmd+Z` undoing the whole rename in a single step, matching "one history entry per committed gesture" (46). Check 47 is the palette's wheel: a wheel over the open palette — plain and pinch alike — is left uncancelled and moves no camera, while the same wheel on the background is still cancelled and still pans. It asserts CANCELLATION rather than `scrollTop` on purpose; see "Scrolling the palette is a yield" below for why a `scrollTop` check would fail a correct implementation. Two sub-checks cover OS key auto-repeat, the one input this suite had never simulated: five `repeat: true` Cmd+N keydowns spawn nothing further (7b) and five `repeat: true` Cmd+K keydowns do not re-toggle the palette (33b) — see "Auto-repeat is one gesture, not fifteen" below, including what they deliberately cannot prove. M6p adds the palette's structure in a real renderer: section headers rendering once each in `SECTIONS` order (48), a drill-in narrowing to its own rows with Escape popping back **without closing** (49), and a destructive row that is marked, gated by a confirm, and left un-deleted by Escape — read back out of `preset.list()`, not off the overlay (50). Check 51 is the spawn cascade in a real renderer: two `Cmd+N` presses at one camera, in empty world space, must land exactly one `CASCADE_STEP` apart — and the second panel must still have an `.xterm` under it, which is the ONLY place the suite proves a cascaded panel is still inside the cull region and therefore still promoted, rather than merely arguing it. It reads the step out of `panels-entry.cjs` rather than restating 48, and reads each panel by `data-panel-id` rather than "the last `.panel`", since array order and paint order are deliberately different things here. M6b adds the settings row end to end in a real renderer: a setting reached by a keyword it does not display (52), and a toggle reaching `main`'s store — not just the row's own local state — read back out through `settings:list` (53); `scripts/verify-panels.cjs` passes `registerIpcHandlers` an explicit no-op `rebuildMenu`, because this harness is its own Electron entry point with no application menu for `settings:set`'s handler to call. M6c adds the agent-state seam end to end: a real bell reaches a real panel's `data-agent-state` (54); a real OSC window title moves nothing — this block deliberately swaps the harness onto the DIRECT backend first, because a tmux client never sees the title at all and check 55 would otherwise pass against a broken scanner for a reason that has nothing to do with the scanner, see "The OSC trap is unreachable under tmux" below (55); the state reaches a DEMOTED panel's card, not only a live panel's border, panning the culprit off screen first (56); and focus is what acknowledges it, with the value read back from main's own store rather than the panel's local class, proving main is the one that answered (57). The count is 61 while the last number is 57, because of the lettered sub-checks `7b`, `33b`, `38b` and `40a` |

None need a display; the real-Electron ones open a window with `show: false`. There is no
test-name filter in any of them — each runs everything and exits non-zero on any failure.
To add a check, append an `ok(...)` assertion in the IIFE.

**Why the Electron binary and not `node`.** `node-pty` is a native module compiled against
Electron's ABI by the `postinstall` `electron-rebuild`, so it will not load under system
Node. `verify:pty` and `verify:pty-manager` therefore run under Electron with
`ELECTRON_RUN_AS_NODE=1`; `verify:window`, `verify:ipc`, `verify:canvas`, `verify:xterm`, and
`verify:panels` need the real app lifecycle and `unset` it instead. `verify:viewport`,
`verify:registry`, `verify:layout`, `verify:palette`, `verify:tmux`, and `verify:agent-state` are plain node, because
`viewport.ts`, `lod.ts`, `session-registry.ts`, `shared/layout-schema.ts`,
`main/layout-store.ts`, `main/prompts.ts`, `main/tmux-args.ts`, `main/presets.ts`, and the
palette's `fuzzy.ts`/`palette-model.ts`/`commands.ts` have no native dependency, no DOM, and
no direct `window`/`document` use — `session-registry.ts` gets there by taking its IPC bridge
and its terminal factory as injected dependencies, so `verify:registry` can drive the whole
session lifecycle against fakes instead of a real PTY or a real xterm, `layout-store.ts` gets
there by taking the filesystem paths it reads and writes as constructor arguments instead of
resolving `app.getPath('userData')` itself, `tmux-args.ts` gets there by being pure
argv/config/parsing builders that never import `node-pty` — the module that actually spawns a
tmux client, `session-backend.ts`, deliberately stays out of this file's reach so `verify:tmux` can run
under plain node at all — and `main/presets.ts` gets there the same way `layout-store.ts`
does: `resolveAvailability` takes `which` as an injected parameter rather than importing
`shell-env.ts`, so a real PATH probe never has to run for `verify:layout`'s preset checks to
pass. `main/prompts.ts` needs no such treatment and is the reminder of where the line actually
is: it reads the filesystem directly with `node:fs` and still runs under plain node, because
what moves a module out of this tier is importing `electron` or `node-pty`, not touching disk.
The palette's three pure modules are the same story on the renderer side — `commands.ts`
builds the command list from plain data (preset rows, prompt rows, panel rows, a captured id)
and holds no reference to the registry, the viewport, or React, which is what lets
`verify:palette` assert on *disabled reasons* rather than on a rendered DOM. `verify:package`
belongs on this list too — and needs less justification than any of the above:
`build/builder-config.cjs` is plain CJS with zero imports at all, needing no esbuild entry
whatsoever, unlike every other suite in this list. `main/agent-state.ts` qualifies the same way
`tmux-args.ts` does: it imports neither `electron` nor `node-pty`, so `scanForBell` and
`nextState` — the two pieces of this milestone most able to be subtly wrong — sit in the
cheapest, fastest tier the repo has rather than needing a real PTY or a real Electron window to
exercise a byte-scanning state machine that never touches either.

**`verify:pty` duplicates production code on purpose.** It re-implements `shell-env.ts`'s
probe and `pty-manager.ts`'s batching by hand so it can test them without Electron's app
lifecycle. If you change either module's behaviour, mirror it there. (`verify:pty-manager`
drives the real module and does not duplicate anything.)

**`verify:canvas` and `verify:panels` are the suites that consume the build.** Both load
`out/renderer/index.html` in a hidden window, which is why `npm run verify` runs `build`
before them — run either alone against a stale `out/` and you are testing the previous
commit. `verify:panels` is also its own Electron entry point (not `out/main/index.js`), so
nothing has registered `ipcMain` handlers for it the way `main/index.ts` does at real
startup; `scripts/panels-entry.cjs` hand-wires `resolveShellEnv` + `registerIpcHandlers` + a
`PtyManager` (and, for check 26, `attachPtyLifecycle` and a real tmux backend on its own
socket) to fix that, the same pattern `verify-ipc-surface.cjs` and
`verify-window-lifecycle.cjs` use. The other Electron suites esbuild their own entry from
source into `out/verify/`, so they are always current without a build step.

**`verify:panels` reaches the registry through eight narrow `window.__m4a*` hooks
(`__m4aScale`, `__m4aWrite`, `__m4aSelection`, `__m4aCellToScreen`, `__m4aGrid`,
`__m4aViewport`, `__m4aScrollY`, `__m4aSessions`) installed by `Canvas.tsx`.** The registry is a module-level
closure by design (see "Two lifetimes, not one" below), and `executeJavaScript` has no other
route into it. Keep the set narrow and named by what each one answers — the alternative is
exposing the registry itself and letting the suite drift into testing internals instead of
behaviour.

**`verify:xterm` is a spike, not a regression suite for a module.** It exists to prove the
assumption the whole M3 eviction design rests on: that an xterm `Terminal` keeps accepting
writes while its host `div` is out of the document, and repaints once the host returns. It
runs a DOM-renderer control terminal alongside the WebGL one under test, because under WebGL
`.xterm-rows` stays empty even when the terminal is healthy — DOM text content is not a valid
repaint signal for a WebGL-backed terminal, so the control terminal is what the check actually
reads to confirm a repaint happened.

## Architecture

Three processes, one shared contract. **The main process owns every PTY; the renderer never
spawns a process.**

```
renderer --invoke--> pty:create / pty:write / pty:resize / pty:kill / pty:list --> main
renderer --invoke--> layout:load / layout:save                                 --> main
renderer --invoke--> session:backend                                          --> main
renderer --invoke--> preset:list / preset:rename / preset:delete               --> main
renderer --invoke--> preset:set-default / preset:spawn-by-id                   --> main
renderer --invoke--> prompt:list / prompt:save / prompt:delete                 --> main
renderer --invoke--> settings:list / settings:set                              --> main
renderer --invoke--> canvas:request-reset                                      --> main
renderer <--send---  pty:data (batched ~16ms) / pty:exit                       <-- main
main     --send-->   edit:copy / edit:paste / edit:undo / edit:redo            --> renderer
main     --send-->   canvas:counts / canvas:reset                              --> renderer
main     --send-->   preset:spawn / preset:default / preset:capture            --> renderer
```

The nine invokes M5b added all point the same way, and the direction is the point: M5a's
preset channels are main -> renderer because the *menu* is main's, while the palette is the
renderer's, so its mutations are invokes. Two of them exist purely so the palette runs main's
code rather than a second copy — `preset:spawn-by-id`, because only main can resolve an
*absent* `command` into the user's login shell (see "An absent `command` must stay absent"
below), and `canvas:request-reset`, because main owns the confirmation dialog and the counts
request. A renderer-side reconstruction of either would drift from the menu path silently, and
the two paths would then disagree only in the cases nobody tests.

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

src/renderer/session/
  panel-session.ts      the PanelSession/SessionHandle/SessionFactory interfaces — what the
                        registry needs from a terminal, with nothing xterm-specific in it
  session-registry.ts   the registry itself (see above)
  useRegistry.ts        useSyncExternalStore glue so React re-renders on registry.version()
```

`@shared/*` and `@renderer/*` path aliases are declared in **both** `electron.vite.config.ts`
and the tsconfigs — adding one means editing both.

## Load-bearing details

Each of these exists because the naive version fails *silently*. Don't undo them.

**Login-shell PATH (`src/main/shell-env.ts`).** macOS GUI apps are launched by launchd, so
they inherit a bare PATH and no dotfile exports — `claude`/`codex` work in Terminal but are
"command not found" in the app. We probe `$SHELL -ilc env` once at startup (`-i` is what
makes zsh read `.zshrc`) and use that env for every PTY. A non-zero exit from the probe is
normal; success is judged by whether a `PATH` came back. The fallback logs loudly on purpose.

**The renderer has no `process.env` (`shared/types.ts`, `main/pty-manager.ts`,
`renderer/panels/panels.ts`).** electron-vite compiles `process.env` in the renderer bundle
down to a literal `{}`, so `process.env.SHELL ?? '/bin/zsh'` there is not a lookup with a
fallback — the fallback is the *only* branch that ever runs, and a bash or fish user silently
gets zsh while the code reads as though it asked. `PanelSpec.command` is therefore **optional**:
absent means "the user's login shell", and main resolves it from the env it already probed
(`resolveCommand`, same fallback chain as `shell-env.ts`). `panels.ts` omits it; anything in
the renderer that displays `spec.command` needs a label for the absent case, because only main
knows the answer. Never reintroduce a `process.env` read on the renderer side.

**Output batching (`pty-manager.ts`, `FLUSH_INTERVAL_MS = 16`).** One IPC message per PTY
read floods the renderer's event loop and locks the UI — an agent TUI repainting emits
thousands of reads/sec. Measured: 33,198 reads → 105 messages. The pending buffer is flushed
*before* `pty:exit` is announced, or the last lines (usually the error explaining the exit)
are dropped.

**Renderers die; sessions do not (`window-lifecycle.ts`).** Cmd+R and Cmd+W destroy the page
without running React cleanup, so the renderer never sends `pty:kill`. Something main-side
still has to act, or the abandoned handle survives and the next `pty:create` throws "already
has a live PTY" — a dead panel with no recovery short of quitting. Since M4c that action is
`detachAll()`, not `killAll()`: the local handle (a tmux *client*) dies and the tmux
*session* keeps running the agent. `pty:list` is the channel the fresh renderer reconciles
against — it asks the backend first, so it sees sessions this run has never spawned and
restores those panels non-dormant. Without tmux the app degrades to the old behaviour and the
processes really do die; see "One operation became three".

**Cmd+C / Cmd+V (`src/main/menu.ts`).** The stock `'copy'`/`'paste'` menu roles drive
`document.execCommand`, but xterm's selection under the WebGL renderer is not a DOM
selection — the role copies nothing or the wrong thing. We keep the accelerators but forward
to the renderer, which asks xterm directly. **Ctrl+C is deliberately untouched** and flows to
the PTY as SIGINT. As of M3 this is **one subscription in `Canvas.tsx`**, not a per-panel one:
it reads whichever session is currently focused (via a ref mirroring `focusedId`, the same
pattern `useViewport` uses) and calls `getSelection()`/`paste()` on that session's
`SessionHandle`. A per-panel subscription would mean every panel but the focused one receives
and discards the event — twenty times the work to deliver the same copy/paste with twenty
panels open.

**Two lifetimes, not one (`session/session-registry.ts`).** A panel's session — its
`Terminal` and its PTY — is created once and disposed once, in a module-level registry outside
React. The React panel (`TerminalPanel.tsx`) is mounted and unmounted freely by tiering and
owns nothing. In M1 "this component is unmounting" and "this panel is going away" were the
same statement; culling makes them different, and confusing them kills a running agent with no
error anywhere. `pty.kill` has exactly two callers, both inside `session-registry.ts` —
`disposeAll` (no production caller since M4c) and `dispose(id)` — but **a tier change must never reach
either one.** Four checks exist for exactly that property: `verify:registry` 5 and 15, and
`verify:panels` 4 and 15. Neither caller is guarded on `session.spawned` any more, and the
guard that used to be there is worth knowing about: it skipped `pty.kill` for a panel that had
never spawned, which was free under `node-pty` and a leak under tmux, where a never-spawned
panel can still own a surviving session (reattachable after a reload but never promoted,
because it was off-screen or over `LIVE_BUDGET`). Main's `PtyManager.kill` matches — it reaches
`backend.destroy(panelId)` even for an id it has no local session for. `verify:registry` 19 and
`verify:pty-manager` 14c are the two halves. This is the ONE change M4c made to
`session-registry.ts`, against a spec that claimed it needed none; the claim held for
`lod.ts`. `dispose(id)` itself now has three call sites in `Canvas.tsx` — the
close button, undo/redo removing a panel, and the reset handler — and every one of them keeps
the `pty.kill` count at two precisely because it routes through `dispose(id)` instead of
calling `pty.kill` directly; see "Undo removing a panel must dispose its session" below for the
call-site history.

**Lazy spawn (`session-registry.ts`).** A PTY is created when its panel first goes live, not
at startup. "Fit before spawn" (below) needs real cols/rows, which needs an attached, laid-out
node — so a panel that has never been on screen has no size to spawn at. It also stops a
twelve-panel canvas launching twelve agents on boot: `LIVE_BUDGET` (8) caps how many are live
at once, whatever the panel count. As of M4b, a fresh install's actual boot data is
`firstRunPanels()` — one centred placeholder — not `SEED_PANELS`; `SEED_PANELS`'
twelve scattered entries in `panels/panels.ts` stay put purely as `verify:panels` fixture
data, which is what they were always actually exercising. The cap is
enforced in two places and holds at every moment, not just when the canvas is at rest:
`assignTiers` never promotes more than the budget, and `Canvas.tsx` re-checks it when it
applies the map, because a held-back demotion (below) is a live panel `assignTiers` did not
count. Without the second check, panning past twelve panels left all twelve live for the
duration of the gesture — twelve WebGL contexts against a browser cap near sixteen, and a
dropped context is permanent for the run (`create-terminal.ts` sets `webglDisabled`).

**Promote now, demote later (`Canvas.tsx`, `DEMOTE_DELAY_MS = 250`).** Promotion to `live` is
applied immediately; a demotion to `card` is held for `DEMOTE_DELAY_MS` and re-applied only if
still true after the delay. Together with `lod.ts`'s `CULL_MARGIN_PX` this makes promotion and
demotion happen at different boundaries. Without it, a panel sitting at the viewport edge
destroys and recreates a WebGL context every frame while you pan, and the symptom only shows
up mid-gesture, not in a static screenshot. Two details keep the hold from becoming the bug it
prevents. The release timer is armed against a **ref**, never re-armed in an effect cleanup:
the tiering effect depends on `viewport`, which changes on every wheel event, so a cleanup
that cleared the timer let a continuous trackpad pan restart the 250ms clock forever and
nothing ever demoted. And the hold yields to the budget — when live-plus-held would exceed
`LIVE_BUDGET`, the oldest holds are released immediately, since they have already had most of
the grace period they exist to provide.

**Focus is released on a background click (`Canvas.tsx`).** `assignTiers` pins the focused
panel live unconditionally, so `focusedId` is not just a highlight: an id that is never
cleared holds a WebGL context and a budget slot for the rest of the run, and keeps routing
`Cmd+C` to a panel whose textarea the browser blurred long ago. Background `onMouseDown`
clears `focusedId` alongside `selectedId`. This is also what lets a panel the user typed into
ever demote — `verify:panels` check 8 depends on it to read the terminal's buffer back out of
its card.

**Pointer coordinates are corrected, not gated (`components/xterm-pointer.ts`,
`canvas/pointer-correct.ts`).** xterm computes a cell as
`(clientX - rect.left) / dimensions.css.cell.width`. `rect.left` is transform-aware and in
screen pixels; `cell.width` is transform-blind and in CSS pixels, so under `scale(k)` xterm
reports a column `k` times the true one. M3's answer was to gate body clicks to
`[0.9, 1.1]` and leave the error uncorrected everywhere else; M4a removes the gate and
rewrites the event instead. `installPointerCorrection` is a **capture-phase listener on
`document`**, not on the panel — xterm binds its own drag listeners
(`mousemove`/`mouseup`) to the document once a gesture starts, so a panel-scoped listener
would correct the mousedown and then miss every move that follows, and drag-selection would
stop partway through. It pins the target slot at mousedown and holds that pin until mouseup,
because mid-drag the cursor spends most of the gesture outside the slot's DOM bounds. Three
fields on the synthetic `MouseEvent` are load-bearing and each fails silently if dropped:
`detail` (click count — drop it and double/triple-click word/line select stop working),
`buttons` (drop it and every corrected move reads as a hover, so selection never extends),
and the modifier flags. A `WeakSet` marks synthetic events; without it the clone re-enters
the same capture listener and recurses until the stack overflows. At `scale === 1` the
interceptor returns before doing any work, so the common case pays nothing. **Known limit,
not yet covered:** correction is anchored to the slot pinned at mousedown, so a hover
`mousemove` with no prior in-slot mousedown returns early uncorrected — a mouse-reporting TUI
still sees `k`-times-wrong coordinates via `getMouseReportCoords` on hover. That is recorded
in `xterm-pointer.ts` itself and left to a later milestone; do not read the file as though
hover were already handled.

**`version` exists only so `memo` can see a mutation (`TerminalPanel.tsx`,
`session-registry.ts`).** `TerminalPanel` is wrapped in `memo`, and the registry mutates a
`PanelSession` **in place** — `registry.get(id)` returns the same object reference forever, so
`session` alone is always "equal" by `memo`'s shallow comparison no matter how many times its
tier/status/spawned fields flip underneath it. `Canvas.tsx` passes `registry.version()` down as
its own prop purely so the shallow compare has something that actually changes: without it,
promoting a panel never re-renders it, no slot is ever mounted, and no PTY is ever spawned.
`version` bumps only on tier/status/focus/exit — never on 16ms-batched PTY data, never on
pointer moves — which is what keeps the memo doing its actual job of blocking the 60Hz
pan/zoom cascade from reaching every panel.

**One transform, not N layouts (`Canvas.tsx`).** A single `.world` element carries
`translate(...) scale(...)`; panels are positioned once in world coordinates and never
recomputed. This is not only about performance. A CSS `scale()` on an ancestor is invisible
to `getComputedStyle` and `ResizeObserver` — exactly what xterm's `FitAddon` consults — so
zooming *cannot* change a panel's cols/rows. The rejected alternative, sizing each panel in
screen pixels per frame, would reflow the running shell on every zoom gesture.

**...which is why pointer coordinates needed correcting, not just gating.** The same
blindness means `getBoundingClientRect()` is transform-aware while
`dimensions.css.cell.width` is not, so under `scale(k)` every click lands on a cell off by a
factor of `k`. M3 gated body clicks to a band near 1:1 rather than fix the arithmetic; M4a
fixes it instead (see "Pointer coordinates are corrected, not gated" above) by intercepting
and re-dispatching mouse events with rewritten `clientX`/`clientY` before they reach xterm.

**`passive: false` on the wheel listener (`useViewport.ts`).** Chromium treats ctrl+wheel as
its own page-zoom gesture; without `preventDefault()` a pinch zooms the whole UI and every
coordinate the canvas computes silently becomes wrong. React's `onWheel` prop may be attached
passively, where `preventDefault()` does not throw — it just does nothing. Hence
`addEventListener('wheel', handler, { passive: false })` in an effect, never a JSX prop, plus
`setVisualZoomLevelLimits(1, 1)` in `src/main/index.ts` as a second line of defence.

**Clamp scale before deriving translation (`zoomAt`).** Deriving the translation from a
*requested* scale while applying a *clamped* one makes the canvas drift sideways while
appearing frozen — visible only while holding a pinch at the limit. `verify:viewport`
check 3 exists solely for this.

**Cmd is required for every canvas shortcut (`useViewport.ts`).** Agent TUIs claim
essentially every bare key, so from M3 a bare keystroke must always reach the PTY. Trackpad
gestures are safe to claim because terminals do not use them.

**No `StrictMode` (`src/renderer/main.tsx`).** Double-invoked effects would spawn a PTY, kill
it, and spawn it again on every mount. Intentional; leave it off while the PTY lifecycle is
still being proven.

**Fit before spawn (`session-registry.ts`'s `attachSlot`/`spawn`).** `attachSlot` calls
`session.handle.attach()` — which opens the terminal against its now-mounted host and fits it
— before `spawn()` reads `session.handle.size()` and passes those real `cols`/`rows` to
`pty:create`. Spawning at 80x24 and resizing after makes agent TUIs draw their frame twice and
leave artifacts.

**`externalizeDepsPlugin` (`electron.vite.config.ts`).** Keeps `node-pty` out of the bundle
so its native `.node` binary is `require`d from `node_modules`. Anything with a native
binding belongs in `dependencies`, not `devDependencies`.

**`term.open()` runs at most once, ever (`create-terminal.ts`).** `TerminalHandles.opened`
guards it: xterm's `open()` is not repeatable, and everything a terminal has drawn lives inside
the `Terminal` instance, not the host `div`. `detachTerminal` disposes the WebGL addon and
removes the host from the document but never touches the `Terminal`; `attachTerminal` on
re-attach loads a fresh `WebglAddon`, fits, and calls `term.refresh(0, rows - 1)` — `verify:xterm`
proved a fresh WebGL context does not repaint on its own after re-attach, so that refresh call
is load-bearing, not a defensive extra.

**Resize commits on release, not live (`Canvas.tsx`'s `onCommit`, `registry.refit`).** The
panel's box follows the cursor every frame during a resize drag, but `refit()` — which fits
the terminal and fires `pty:resize` — runs exactly once, on mouseup. A full-screen agent TUI
repaints its entire frame on every SIGWINCH; resizing live would mean roughly sixty full
repaints a second, through a 16ms-batched channel, at intermediate sizes the user never meant
to keep. `verify:panels` check 11 asserts the grid (`__m4aGrid()`) is unchanged mid-drag and
only changes after mouseup.

**Stacking is `Panel.z`, never array order (`panels/panels.ts`, `Canvas.tsx`).** React
reconciles a reordered keyed list by moving DOM nodes, and a move is remove-then-insert —
which would momentarily detach the subtree holding a live terminal's host and its WebGL
context. M3's eviction proves a *deliberate* detach is survivable (dispose the addon,
`refresh()` on the way back); an incidental one triggered by clicking an unrelated panel does
none of that. `raisePanel` (`panels.ts`) only ever changes `z`; `Panel.z` renders as
`zIndex`, and `Canvas.tsx` sorts by `z` before calling `hitTest`, which returns the last
match — so paint order and pick order still agree. `verify:panels` check 16 asserts DOM order
is stable across a raise.

**Wheel ownership is decided in one predicate, in the capture phase (`useViewport.ts`,
`Canvas.tsx`'s `shouldYieldWheel`).** `shouldYieldWheel` is the SOLE authority — `useViewport`
consults it unconditionally and holds no rule of its own, which is forced rather than tidy: the
hook used to post-filter the answer as `!isZoomGesture && shouldYieldWheel(event)`, and an AND
can only ever *narrow* what the predicate says, never widen it, so no palette rule written in
`Canvas.tsx` could have outranked zoom while that AND stood. Three rules, in this order.
**(1) The palette owns every wheel over `.palette`, zoom gestures included** — see "Scrolling the
palette" below. **(2) Otherwise a zoom gesture is always the camera's**, covering the focused
panel too (a `ctrlKey` trackpad pinch or a `metaKey` mouse wheel, the two spellings
`canvas-input.ts` reads as zoom): `Cmd` is the modifier every other canvas shortcut requires, so
it cannot be the one input where the canvas defers, and without the `metaKey` half a mouse user
who had clicked into a panel could not zoom while the cursor was over it. **(3) Otherwise a
wheel over the *focused* panel scrolls that terminal**, and everything else — background, an
unfocused panel — pans the camera. The listener is installed on the canvas host with `{ capture: true, passive: false }`,
not the bubble phase, and that is forced rather than chosen: xterm's own wheel handler is
bound on a descendant and runs first in the target phase, so by the time a bubble-phase
listener saw the event xterm had already scrolled. The first M4a implementation used bubble
phase and returned early without `preventDefault`, which fixed the easy case but not the real
one — a wheel over an *unfocused* panel still reached xterm on the way up and scrolled it
while the canvas also panned underneath, the same double-handling bug merely narrowed to a
smaller trigger. The shipped capture-phase listener asks the opposite question at the right
time: over the focused panel it returns with no `preventDefault`/`stopPropagation`, so the
event is untouched by the time it reaches xterm in the target phase; for everything else it
calls `stopPropagation()` first so xterm's target-phase listener never runs at all, then
`preventDefault()` and handles the pan/zoom itself. `verify:panels` check 12 asserts all three
halves: the focused terminal scrolls and the camera does not move, a `metaKey` wheel over that
same focused panel *does* move the camera, and an unfocused terminal does not scroll while the
camera does. Reverting this to a bubble-phase listener reintroduces
the double-handling defect it was written to fix.

**Dormancy outranks focus (`lod.ts`).** `assignTiers` pins the focused panel live
unconditionally, so restoring focus onto a restored panel would spawn a process at boot and
contradict "dormant until clicked" before the user ever touches the canvas. `attachSlot`
carries a second, deliberate dormancy guard on top of the tiering rule, so "no process starts
by itself" does not rest entirely on one pure function being right — `verify:viewport` 46–47
and `verify:registry` 16 cover the two layers separately.

**The store is main's because the quit flush cannot ask a dead renderer
(`main/layout-store.ts`).** `app.on('before-quit')` is main-side; if the renderer owned the
debounce, main would have to ask a renderer that `Cmd+R`/`Cmd+W` may already have destroyed —
the same failure `window-lifecycle.ts` exists to handle. `flushSync` must never throw, because
an exception there can wedge the quit before the window is allowed to close.

**`parseLayout` never throws and drops entries individually (`shared/layout-schema.ts`).** One
malformed panel costs that panel, not the whole file — a canvas that was mostly fine on disk
still opens mostly fine. **Duplicate ids are the one failure with no visible symptom**:
`registry.ensure` returns the existing session for a repeated id, so two panels in `layout.json`
silently render as one, because `handle.host` can live in exactly one DOM slot. `parsePresets`
draws the same line between ABSENT and MALFORMED that the rest of the file draws: no `presets`
key at all is every pre-M5a file and warns nothing (`verify:layout` 32), while a present
`"presets": {}` warns (41) — silently coercing that to `[]` loses every saved preset with the
Presets menu getting shorter as the user's only evidence.

**`nextIdRef` seeds from the restored ids (`Canvas.tsx`).** Initialising it to `1` collides
with a restored `n5` after five `Cmd+N` presses on the previous run — the same id-collision
defect M4a fixed by replacing length-derived ids, resurrected through a different door if the
counter doesn't take the restored state into account.

**One history entry per committed gesture (`Canvas.tsx`).** A drag calls `setPanels` roughly
sixty times as the pointer moves; pushing an undo entry there makes one drag take sixty
`Cmd+Z` presses to unwind, while every check that only asserts final state still passes.
History is pushed once, on commit, not per intermediate update.

**Undo removing a panel must dispose its session.** `registry.dispose` has **three call sites
in `Canvas.tsx`** — the close button (`onClosePanel`), undo/redo removing a panel
(`applyHistory`), and the reset handler (`onReset`, dropping every panel at once). This is a
count worth re-deriving from the code rather than trusting a stale number: it was two until
the reset handler arrived in a later task and this line did not get updated alongside it — the
exact failure this note exists to prevent happening again. None of the three adds a caller of
`pty.kill`: `dispose(id)` and `disposeAll()` remain the only two inside `session-registry.ts`,
and routing all three through `dispose()` rather than calling `pty.kill` directly is exactly
what keeps that count true. Without the undo/redo call site, `Cmd+N` then `Cmd+Z` leaked a live
process with no panel left to close it. Re-derived again at the end of M5b (`grep -n
"registry.dispose" src/renderer/canvas/Canvas.tsx`): still three. The palette's "Reset canvas…"
row adds no fourth — it invokes `canvas:request-reset` and main answers with the same
`canvas:reset` event the menu item sends, so it lands in `onReset`, the call site that already
existed.

**No `beforeunload` teardown (`Canvas.tsx`).** The renderer deliberately does NOT dispose its
sessions on unload, and re-adding that listener silently deletes M4c's headline feature. It was
correct until M4c, when "the renderer is going away" and "these processes should die" were the
same statement; now a teardown must DETACH the tmux client and leave the session running.
`disposeAll()` sends `pty:kill` for every panel, which is `tmux kill-session` — and it WINS the
race: `beforeunload` runs before the navigation starts, so main receives every kill before
`window-lifecycle.ts`'s `did-start-navigation` `detachAll()` runs, which then walks an empty
map. Every unit-level check stayed green while Cmd+R destroyed the user's agents.
`window-lifecycle.ts` covers all three teardown shapes and `before-quit` covers quitting, so
nothing is left unhandled; what is given up is freeing xterm/WebGL from the renderer on an
orderly reload, which the browser reclaims anyway as it destroys the page. `verify:panels` 26
is the check that fails if the listener returns — and it has to be that suite, because a real
renderer teardown must reach a real `PtyManager`: `verify:pty-manager` 12 calls `detachAll()`
directly with no renderer in sight, and `verify:window` 4 installs its own lambda.

**`Cmd+Z` is claimed, `Ctrl+Z` is not (`src/main/menu.ts`).** The same split the file already
draws between `Cmd+C` (copy) and `Ctrl+C` (SIGINT). The stock `'undo'`/`'redo'` menu roles are
unusable for the same reason `'copy'`/`'paste'` are: they drive `document.execCommand` against
whatever DOM element happens to be focused, not the canvas's own history stack. `Ctrl+Z`
reaches the PTY untouched and still suspends the foreground process as SIGTSTP.

**The plain-node verify bundles now configure a `@shared` alias
(`verify-viewport.cjs`, `verify-registry.cjs`, `verify-layout.cjs`, `verify-palette.cjs`).**
Before M4b they resolved no path aliases and got away with it because every cross-boundary
import from `@shared` was `import type`, which esbuild erases before bundling — nothing was
ever actually resolved. `panel-interaction.ts` now imports a real *value* from `@shared`, and
that fails to resolve without the alias wired into each esbuild config, the same one
`electron.vite.config.ts` and the tsconfigs already carry. The real-Electron suites
(`verify:canvas`, `verify:panels`) need no such alias — they load the already-built
`out/renderer/index.html`, where electron-vite resolved it long before esbuild ever runs.
`verify-palette.cjs` carries the alias pre-emptively even though **nothing in its bundle imports
from `@shared` at all** — `commands.ts`'s only import is its sibling `palette-model.ts`. That is
the point: needing no alias *yet* is exactly the state `verify-viewport.cjs` was in right up
until the day it broke.

**`RestoreSettings` lives in `layout.json`, not a second store.** The renderer never learns the
settings exist as a distinct concept; main applies them in `LayoutStore.initial()` and hands
the renderer an already-resolved starting state. A future settings surface should reach for
the same mechanism — one file, behind `LayoutStore` — rather than inventing a second store for
a fourth toggle.

**One operation became three (`window-lifecycle.ts`, `pty-manager.ts`,
`main/index.ts`).** Before M4c a single `killAll()` served every teardown path,
because under `node-pty` those paths genuinely meant the same thing. Under tmux
they do not: a renderer teardown calls **`detachAll()`** (local handles die, tmux
sessions live), closing a panel calls **`kill(id)`** which also calls
`backend.destroy(id)` (the session dies), and `before-quit` calls
**`shutdown()`** (`kill-server` on our private socket). Reverting
`attachPtyLifecycle`'s callback to `killAll` keeps every check in
`verify:window` green while silently restoring the M3 behaviour M4c exists to
remove — which is why `verify:pty-manager` check 12 asserts the reattached pid
is the *same* pid.

**The tmux client's exit code is always 1 (`session-backend.ts`,
`tmux-args.ts`).** Measured: an inner command exiting 0 and one exiting 42 both
produce client exit 1. `remain-on-exit on` plus a `pane-died` hook recovers the
real `#{pane_dead_status}`; the hook writes the file *before* `kill-session`, and
killing the session is what makes the client exit, so by the time `node-pty`'s
`onExit` fires the file is already on disk and main reads it in the handler it
already had. No watcher, no polling, no new IPC. Reversing those two hook
commands is a race that reports the wrong code intermittently.

**`parseListOutput` must filter `#{pane_dead}`.** The one place `remain-on-exit
on` leaks outside the exit path: a session whose command has exited still
*exists* until the hook kills it, so an unfiltered list reports a finished
process as live, boot reconciliation restores that panel non-dormant, and the
user gets a panel attached to a corpse that can never produce another byte.

**tmux is resolved by absolute path from the login env (`tmux-probe.ts`).** The
same defect `shell-env.ts` exists for: launchd gives a GUI app a bare PATH, so
`/opt/homebrew/bin/tmux` is not on it and spawning `tmux` by name fails exactly
the way `claude` does. `whichFromEnv('tmux', env)` is the fix, and it must run
*after* `resolveShellEnv()`.

**Dormancy is about spawning, not attaching (`renderer/main.tsx`).** A panel
with a live tmux session has nothing to spawn, so M4b's "restored panels are
dormant" rule does not apply to it — it reattaches like any M3 panel and
`LIVE_BUDGET` still caps how many at once. A panel with no live session still
restores dormant. `lod.ts` is untouched: a reattachable panel is not dormant and
never consults "dormancy outranks focus". A failed `pty:list` degrades to the
empty set, which restores everything dormant — the safe direction, because it
spawns nothing.

**The bundled tmux config is generated, not shipped (`tmux-args.ts`'s
`buildTmuxConf`).** The `pane-died` hook embeds `exitDir`, a per-run path under
`userData` that is unknowable until the app is running. Every line in it fails
*silently*: `prefix None` is what keeps `Ctrl+B` reaching the agent (the same
split as `Ctrl+C` and `Ctrl+Z`), `terminal-features ",xterm-256color:RGB"` is
what stops 24-bit agent output being downsampled to 256, and `mouse` must stay
**off** — `mouse on` makes tmux capture mouse reporting instead of passing it
through, silently defeating all of M4a's pointer correction from one process
further down.

**The `pane-died` hook's redirect target must stay quoted (`buildTmuxConf`).**
`exitDir` is `app.getPath('userData') + '/tmux-exits'`, i.e. `~/Library/
Application Support/terminal-canvas/tmux-exits` — **it always contains a space
on macOS.** Unquoted, the shell splits it: the exit code lands in a junk file
named `~/Library/Application`, `exitCodeFor()` finds nothing, `?? exitCode`
falls through, and *every* panel reports `[process exited with code 1]`
regardless of what the process returned. The `; tmux kill-session` half still
runs, so the session dies and the panel looks entirely normal — the failure is
completely silent. It shipped through eight task reviews because every fixture
used a space-free path (`/tmp/exits`, `mkdtemp` under `/var/folders`). Both
suites now use a spaced `exitDir` on purpose (`verify:tmux`'s `EXIT_DIR`,
`verify:pty-manager`'s `mkdtempSync(join(tmpdir(), 'tc verify '))`), and
`verify:tmux` 18 plus `verify:pty-manager` 14 are the two that catch it.

**The probe checks that the SERVER starts, not just that a binary exists
(`tmux-probe.ts`).** `tmux -V` proves a version, not a working server. A
present, modern tmux whose server cannot come up — unwritable `TMUX_TMPDIR`,
socket-directory permissions, a stale socket owned by someone else — would leave
`kind` at `'tmux'`, give every panel a client that dies instantly, and say
nothing in the HUD, which is exactly the silent degradation the loud fallback
exists to prevent. `probeTmux` therefore writes the config and then runs
`start-server -f <conf>` on the private socket; a failure falls back to
`DirectBackend` with a reason naming the cause. One extra exec at startup, and
starting the server early is free: `shutdown()` kill-servers it anyway.

**The verify suites must never touch the production socket.** Every argv
builder in `tmux-args.ts` takes the socket as a *defaulted* parameter for this
reason alone; `TMUX_SOCKET` stays the production value and `verify:tmux` 9 still
pins that default. `verify:pty-manager` runs on `terminal-canvas-verify`,
because its check 15 calls `shutdown()` — `kill-server` — and running
`npm run verify` with the app open used to destroy every agent in the live
instance.

**An absent `command` must stay absent through four layers (`shared/layout-schema.ts`'s
`parsePresets`, `main/presets.ts`'s `templateOf`, the `PRESET_SPAWN`/`PRESET_DEFAULT` payloads,
and `Canvas.tsx`'s `onSpawn`/`onCapture`).** Each of the four rebuilds its object field by
field rather than spreading, because spreading a preset would carry `command: undefined`
across the IPC structured clone, where `'command' in template` then reads **true** — the
field exists, it just holds `undefined`, and that is a different fact than the field being
absent. The failure is total and silent: every command-less preset (the built-in login shell,
and any user preset saved from a login-shell panel) would spawn a hardcoded shell instead of
resolving the user's actual login shell the way `resolveCommand` does. `verify:layout` 34 and
`verify:panels` 31 are the two halves — one on the parse side, one end-to-end through a real
spawn. The module-scope cache in `renderer/main.tsx` is deliberately NOT a fifth rebuild: it
stores and passes the received template BY REFERENCE, so there is nothing there to get wrong.
Writing `{...defaultTemplate}` at that hop would make it a fifth place that can lose absence.

**`Cmd+N` stays a renderer keybinding, not a menu accelerator.** Moving it to
`main/menu.ts` would be architecturally tidier — every other shortcut in this app is either a
menu accelerator or a renderer listener, not both — but it would break every `verify:panels`
check that drives it: `zoomTo(wc, 'n')` dispatches a synthetic `KeyboardEvent` on `window`,
which a main-process accelerator never receives, only a real OS keydown does. That is checks
7, 17, 22, 26, 29 and 51 — worth re-deriving with `grep -n "zoomTo(wc, 'n')" scripts/verify-panels.cjs`
rather than trusting this list, the same caution this file already gives the `dispose(id)`
call-site count. Main instead pushes the default template over `PRESET_DEFAULT`, at
every `did-finish-load` — including the one a `Cmd+R` reload produces, which is what stops the
reload silently reverting `Cmd+N` to a login shell after it wipes `defaultTemplateRef`.

**The default preset is caught at module scope, not in an effect (`renderer/main.tsx`).**
Main sends `PRESET_DEFAULT` from `did-finish-load`, which fires at the page's load event.
`boot()` awaits TWO IPC round trips (`layout.load`, then `pty.list`) before the first
`render()`, so a subscription made inside `Canvas.tsx`'s effect is at least two macrotask hops
too late: the push landed with no listener, was dropped, and nothing re-pushed it. The
subscription therefore runs at module scope, ahead of `boot()`'s first `await` — module script
evaluation completes before the load event, so this is an ORDERING GUARANTEE, not a narrower
race — and the template it caches reaches `Canvas` as a prop beside `initial` and
`liveSessionIds`, which seeds `defaultTemplateRef` from it. `Canvas` keeps its own `onDefault`
subscription for the re-push case; the two are not redundant, they cover different moments.
The failure this prevents is completely silent, and that is why it survived a whole milestone:
`defaultTemplateRef` stayed `undefined`, `makePanel` fell through to `shell(id)`, and
`shell(id)` is byte-identical to the shipped `BUILT_IN_PRESETS[0]` — so the out-of-the-box
canvas looked right and only a user who set `"defaultPresetId": "claude"` ever saw `Cmd+N`
ignore it, with nothing in any log. `verify:panels` 32 is the check that fails if the
subscription moves back into a component, and it is deliberately the ONE preset check that
sends nothing itself: every other one drives the channel by hand, which is precisely how the
feature stayed inert while the suite was green.

**Built-in presets are code, not data (`main/presets.ts`'s `BUILT_IN_PRESETS`).** Persisting
them into `layout.json` alongside user presets means deleting one resurrects it on the next
launch — a bug with no good explanation, because nothing the user did caused it — and it grows
a file `layout-store.ts` rewrites in full on every coalesced save for no benefit, since the
three built-ins never change at runtime.

**Who owns the keyboard (`palette/usePalette.ts`, `Canvas.tsx`).** The palette is the first
surface in this app that must *swallow* bare keys, which is the exact inverse of the rule
everything else obeys ("a bare keystroke must always reach the PTY" — see "Cmd is required for
every canvas shortcut"). Four rules make that work, and each one fails silently on its own:

1. **Opening focuses the input** (`Palette.tsx`, on mount). xterm reads its own hidden
   textarea and nothing else, so moving DOM focus is what stops typing reaching the agent.
   Without it the user types a query into a running agent while watching an empty field.
2. **DOM focus is not app focus: `focusedId` is CAPTURED, never cleared.** Clearing it would
   demote the panel — `assignTiers` pins the focused panel live — lose the `Cmd+C` target, and
   drop the very panel the commands are about to act on. `capturedId` is what every
   panel-scoped row (prompt insert, save-selection) is aimed at.
3. **Canvas shortcuts stand down**, via `isOpen()`, which `useViewport`'s keydown listener and
   the `edit:paste` listener both consult. `useViewport`'s listener is on `window`, so it sees
   every key regardless of where DOM focus is — rule 1 alone does not stop `Cmd+Z` undoing a
   drag behind an open palette (`verify:panels` 37) or `Cmd+N` spawning a panel the user cannot
   see (34). `isOpen` is a `useCallback` reading a ref, not state, precisely so it can sit in
   those dep arrays without tearing the listeners down on every open and close.
   The *wheel* stands down too, but by a different route: `palette.isOpen` is passed to
   `useViewport` as `shouldIgnoreKeys` and covers only the keyboard, so the pointer
   half of this rule was missing for two milestones and a scroll over the overlay panned the canvas. It is
   `shouldYieldWheel`'s rule 1 that closes it — see "Scrolling the palette is a yield" below.
4. **Closing calls `restoreFocus(capturedId)`**, i.e. `SessionHandle.focus()`. Nothing else
   gives the keyboard back: the input is unmounting, and an unmounted element's blur leaves
   focus on `<body>`, where every subsequent keystroke goes nowhere at all
   (`verify:panels` 36). The one exit that must NOT restore is the outside click — see "Three
   ways out of the palette" below.

There are exactly **three ways out**: `Escape`, `Enter` on a row that runs, and a click outside.
`Tab` is a fourth key that would otherwise be an *un-audited* exit — `role="dialog"` with a
single focusable element means the browser's default `Tab` walks DOM focus onward, plausibly
into xterm's tabbable helper textarea, leaving the overlay up with the keyboard back on the
agent — so it is handled in the same `switch` as `Escape` and closes. `Cmd+K` itself is
Cmd-gated with `ctrlKey`, `altKey` **and `shiftKey`** all excluded: `Cmd+Shift+K` is a distinct
shortcut in every editor the user also has open, and it arrives with `key === 'K'`, which the
key check accepts on its own — so without the `shiftKey` exclusion it is silently the same chord.

**`edit:paste` is guarded, `edit:copy` is redirected, and the palette owns its own
subscriptions (`Palette.tsx`, `Canvas.tsx`).** `Cmd+C`/`Cmd+V` are main-process menu
accelerators (`main/menu.ts`), which means the browser never delivers a *native* copy or paste
to the palette's `<input>` — the accelerator takes it first. So a guard alone is not enough:
`Canvas.tsx` standing down while the palette is open (which it must, or the text lands
invisibly in a running agent — `verify:panels` 35) would leave `Cmd+V` in the palette a silent
no-op, with nobody serving the text field. `Palette.tsx` therefore subscribes to the same two
events itself and inserts at the caret. The copy half is not symmetric and cannot be: a
selection inside an `<input>` is **not** part of `window.getSelection()` in Chromium, so the
canvas's `getSelection()`-based path reads empty there — the palette reads
`selectionStart`/`selectionEnd` off the input instead. Delete either half and the failure is
"my clipboard shortcuts do nothing here", with no error anywhere.

**A prompt insert is `paste()`, never `write()` (`Canvas.tsx`'s `insertPrompt`).**
`session-factory.ts` spells out why: `term.paste` wraps the payload in bracketed-paste markers
when the application has enabled mode 2004, and normalises LF to CR, so a multi-line prompt
arrives as ONE input. A raw write submits every newline separately — pasting a five-line prompt
into `claude` fires four incomplete fragments and then the tail. Every prompt worth saving is
multi-line, so every use of the feature depends on this one call. `verify:panels` 40 is the only
check that can tell the two apart, and only because its fixture panel enables bracketed paste
itself (`printf '\033[?2004h'`) and echoes with `cat -v`: against a plain shell, `paste()` and
`write()` put byte-identical data on the PTY, and a check written against one would pass either
implementation.

**Navigating must not wake (`Canvas.tsx`'s `goToPanel`).** Waking hangs off *selection* —
`onSelectPanel` clears the dormant id and calls `registry.wake` — so the obvious implementation,
reuse `onSelectPanel`, would spawn an agent as a side effect of NAVIGATING. On a restored
twelve-panel canvas that is twelve CLIs launched by a keyboard tour, the exact failure M4b's
dormancy rule exists to prevent. `goToPanel` calls `centreOn` and then `selectAndRaise` — the
select-and-raise half of `onSelectPanel`, factored out precisely so the switcher can have it
without `registry.wake`. Raising is deliberate and is not a wake: a raise is a `z` change and
nothing more, and without it a framed panel can land *underneath* an overlapping one, showing
none of the selection ring this command's only feedback consists of. Dormancy is left alone, and
the card still says "click to start" and still means it. `verify:panels` 39, which asserts WHERE
the camera landed (recomputed from `centreOn`'s own arithmetic), not merely that it moved — a
switcher that framed the wrong panel also moves the camera.

**The palette swallows its own mousedowns (`Palette.tsx`).** The overlay mounts INSIDE
`.canvas`, whose `onMouseDown` is the background handler — so without `stopPropagation` on the
`.palette` root, every mousedown in the overlay, including a click into its own text field to
place a caret, reads as a click on the canvas background. That handler then does three things,
all wrong from here: it clears `focusedId` (unpinning the live panel, leaving the menu's
`Cmd+C`/`Cmd+V` with no target, and disabling every `capturedId`-gated row on the *next*
`Cmd+K`), it hit-tests the click's **world** point and selects whatever panel happens to lie
under the overlay, and through `onSelectPanel` it **wakes** that panel — spawning a process
from a palette click, which is the one thing the dormancy rule exists to prevent. The guard is
bubble phase (so the rows' own handlers still run) with no `preventDefault` (so the input still
places its caret). `verify:panels` 41 is the check that fails if it is removed.

**Scrolling the palette is a yield, not a scroll handler (`Canvas.tsx`'s `shouldYieldWheel`
rule 1).** `.palette__list` has been `max-height: 46vh; overflow-y: auto` since M5b and could
always have scrolled natively — what stopped it was one layer up. The overlay mounts INSIDE
`.canvas`, so `useViewport`'s capture-phase wheel listener saw every wheel over the palette
first, decided it was the camera's (no `.panel` ancestor, so the focus rule said no), and called
`preventDefault()` — which is exactly what suppresses the browser's default scrolling. The
symptom was that a two-finger scroll over the open palette **panned the canvas** while the list
sat still, and the arrow keys were the only way through a list that is long by construction.
The fix is subtractive: rule 1 returns `true`, `useViewport` returns without touching the event,
and the browser scrolls the list. **No `onWheel` handler exists anywhere in `Palette.tsx`, and
adding one would not help** — a bubble-phase handler there runs long after the ancestor's
capture listener has already cancelled the event, the same asymmetry `onMouseDownCapture`
documents. The containment test is an explicit `closest('.palette')` for that same reason.
Rule 1 outranks the zoom rule deliberately: it is rule 3 of "who owns the keyboard" applied to
the pointer — while the palette is open, every other canvas gesture stands down, and it would be
strange for `Cmd+N` to be swallowed while a pinch over the same overlay zoomed the world behind
it. Scrolling deliberately does NOT move the selected row (see "The palette's selection moves
only when the user moves it"); `scrollIntoView`'s `block: 'nearest'` is what stops a
user-scrolled view being yanked back. `verify:panels` 47 is the check, and **it asserts
cancellation, not `scrollTop`**: a synthetic `WheelEvent` is untrusted and Chromium performs no
default action for one, so the list would not scroll there even against a correct
implementation, and a `scrollTop` assertion would fail the very fix it exists to prove.
`dispatchEvent()` returns `false` iff something called `preventDefault()`, which is precisely
the bit this change flips.

**Three ways out of the palette, and the third one must not restore focus (`Canvas.tsx`'s
`onMouseDownCapture`, `usePalette.ts`'s `dismissPalette`).** A click outside the overlay closes
it. Without that, one click reaches the state rule 1 exists to prevent: `.palette` is a 680px
box at `top: 12%`, not a full-viewport scrim, so the click lands on a panel or the background,
the input is blurred, xterm's textarea has DOM focus — and the overlay is still on screen
looking ready to take a query while every bare key goes to the agent. `Escape` cannot even undo
it, because the key now reaches the PTY rather than the palette's `onKeyDown`. Two details are
load-bearing. It is a **capture-phase** listener on the canvas host, not the background
`onMouseDown`: every panel handler `stopPropagation`s its own mousedown, so a close written into
the background handler would fire for background clicks *only* and leave the panel case — the
common one — broken; the containment test is an explicit `closest('.palette')`, because the
`.palette` root's own bubble-phase `stopPropagation` (see the note above) cannot stop a listener
on an ancestor that has already run. And it calls `dismissPalette()`, which closes **without**
`restoreFocus(capturedId)`: the click itself is the focus gesture — it is about to focus the
panel it hit, or release focus entirely on the background — so restoring would either yank the
keyboard back to the panel the user just clicked away from, or leave xterm focused while
`focusedId` is null. Nothing prevented, nothing stopped: the click still selects and focuses
what it landed on. `verify:panels` 42 asserts both halves.

**The palette's selection moves only when the user moves it (`Palette.tsx`, `Canvas.tsx`'s
`panelRows`).** Three separate routes re-seated it silently, and all three look identical from
a screenshot — the highlight is simply somewhere else than the user believes, and `Enter` runs
the wrong command. (1) The `[rows]` effect re-seated on every identity change of `rows`, and
`preset:list`/`prompt:list` are invokes that RESOLVE AFTER the palette opens — on a cold
`.claude/commands` read the user can have arrowed down first. It now re-seats only when the
QUERY changed; on any other change the selection follows its command by **id** (an arriving list
can grow rows above it) and falls back to `firstRunnable` only when that command is gone or has
become unrunnable. (2) `panelRows` tracked `panels`, which is a fresh array on every
`setPanelRect` — i.e. every frame of a drag — so a drag behind an open palette re-seated the
selection at 60Hz; it is keyed on `palette.open` and read out of `panelsRef` instead, the same
mirror-into-a-ref move `focusedIdRef` makes. (3) `resetViewport` and `centreOn` must stay
`useCallback`s for the same reason, which has its own note above. Separately, the selected `<li>`
carries a ref and `scrollIntoView({ block: 'nearest' })` runs when the index moves: `.palette__list`
is `max-height: 46vh; overflow-y: auto` and the list is long by construction — four rows per
preset, one per panel, two per prompt — so without it `stepRunnable` walks happily past the
visible window and `Enter` runs a command the user cannot see.

**Project prompts are read, never written (`main/prompts.ts`).** `.claude/commands/*.md` under
a panel's cwd belongs to the *repository*: it version-controls with the project and works in a
plain terminal outside this app, which is the whole argument for reading Claude Code's format
rather than inventing a private one. Writing it is deliberately out of scope — authoring a file
someone will commit is a decision to ask for, not to acquire as a side effect of "save", so
`prompt:save` always writes the saved store and `prompt:delete` returns false for every project
id. `verify:panels` 43 is the only check that exercises the read end to end — the harness's
`listPrompts` is main's own `readProjectPrompts(resolveCwd(cwd))` against a fixture
`.claude/commands/*.md` in a spaced temp directory that one fixture panel is pointed at — and it
exists because a regression here removes ROWS, which is indistinguishable from "this project has
no commands". The harness **fences that read to its own fixture directory** and answers `[]` for
every other cwd: several fixture panels are still `cwd: '~'`, and without the fence the suite
would read the running developer's `~/.claude/commands`, i.e. depend on state the repo does not
own — the same rule as "The verify suites must never touch the production socket". The fence
costs no coverage, because check 43's panel is the only one pointed at that directory. Four limits, each protecting against a directory this app does not control: at most 100
files, at most 64KB each (**skipped**, never truncated — half a prompt pasted into an agent
reads as a complete instruction), one level deep (Claude Code namespaces commands in
subdirectories; following that means a recursive walk over arbitrary user directories), and a
missing or unreadable directory is the empty list rather than an error — most cwds have no
`.claude/commands`, and throwing would take the saved prompts down with it, since both halves
share one `prompt:list` call. Same-named prompts from the two sources are **never deduped**:
they stay two rows, each labelled with its source, because pasting the wrong project's context
into an agent is silent and expensive. `verify:layout` 53–57.

**`centreOn` is the third narrow camera verb (`useViewport.ts`).** The `setViewport` setter
stays private — nothing outside should move the camera — so anything that needs to asks by
name: `resetViewport` (Cmd+0's INITIAL), `worldCentre` (a read, for menu-driven spawns), and
now `centreOn(rect)` for the panel switcher. Exposing the setter instead would make every
future caller a camera owner, and the coordinate math would stop being something
`verify:viewport` can pin. `centreOn` deliberately does not change the scale (`verify:viewport`
49–50): zooming to frame a panel would reflow nothing (the world transform is scale-blind to
xterm — see "One transform, not N layouts") but would throw away the zoom level the user chose,
and `Cmd+1` already exists for "fit everything".

**`resetViewport` must stay a `useCallback` (`useViewport.ts`).** Referential stability here is
load-bearing, not tidiness. A fresh arrow per render propagates straight through `Canvas.tsx`'s
`useMemo([resetViewport, ...])` for `paletteActions`, into `Palette.tsx`'s `commands` memo,
whose `[rows]` effect **re-seats the selected row**. `Canvas` re-renders on every mousemove over
`.canvas` (`setCursor`), so an unstable identity means: arrow down three times, nudge the mouse,
press Enter — and the wrong command runs. Nothing throws, nothing logs, and the selection looks
correct in a screenshot. `centreOn` sits in the same dep array for the same reason.

**`verify:panels` check 39 seeds its own dormant panel with its own reload, deliberately
outside the `if (!TMUX)` branch.** It needs a never-spawned, still-dormant panel alive at the
end of the run, and nothing in the boot layout can be it (check 23's reset collapses the canvas
to one fresh panel). The obvious economy — reuse check 26's reload — makes check 39 hard-fail on
every machine with no tmux binary, because check 26 and its reload skip together there, for a
reason that has nothing to do with the command palette. A panel with no live session restores
dormant under either backend ("Dormancy is about spawning, not attaching"), so check 39's reload
needs nothing check 26 set up and is run unconditionally.

**The packaging config is a function, not a blob (`build/builder-config.cjs`).** A `"build"`
key in `package.json` or an `electron-builder.yml` has no *function* in it, so any check
written against one reads JSON and compares it to itself. `buildConfig(opts)` returns the
config, which is what lets `verify:package` assert "`node-pty` is unpacked" as a property of a
computation in the cheapest tier the repo has. It is plain CJS in a TypeScript-first repo on
purpose: electron-builder loads it itself, at build time, in a process nothing here can put
esbuild in front of — and the payoff is that `verify-package.cjs` is the one plain-node suite
needing no esbuild entry, because the module is import-free. Keep it import-free; requiring
anything from `src/` drags the TypeScript build into the config load.

**`asarUnpack` is the difference between an app and a demo (`build/builder-config.cjs`).**
`node-pty` is a native module, and a `.node` binary cannot be `require`d out of an asar
archive. Get it wrong and the app launches, renders the canvas, shows its first panel, and
dies at the first `pty:create` — the latest and quietest failure this codebase can produce.
The pattern is anchored `**/node_modules/node-pty/**` rather than at the root so it keeps
matching if npm hoists `node-pty` to a nested depth; a root-anchored pattern stops matching
silently, months later, with no code change to blame. `verify:package` 1–2 pin both halves and
`verify:packaged` 9 is the end-to-end proof.

**A packaged build must not share a tmux server with a dev build (`tmux-args.ts`'s
`resolveSocket`, `main/index.ts`).** `before-quit` calls `shutdown()`, which is `kill-server`
on the private socket, so a shared socket means quitting either build destroys the other's
running agents — the exact outcome M4c exists to prevent, arriving through a door M4c could
not see, because nothing before M5c made two simultaneous instances plausible. `TMUX_SOCKET`
stays `'terminal-canvas'` and stays every builder's default, so `verify:tmux` check 9 is
untouched; packaged resolves to `'terminal-canvas-app'`. The `TC_TMUX_SOCKET` override is a
developer flag with no UI, and `verify:packaged` is why it exists. **A blank override must be
treated as unset** (`verify:tmux` 23): `TC_TMUX_SOCKET=` in a shell is `''`, and tmux given an
empty `-L` does not error — it falls back to the *default* socket, i.e. the user's own tmux
server, which `shutdown()` would then `kill-server`. M5c also moved `start-server`'s argv out
of `tmux-probe.ts` and into `buildStartServerArgs`: it was the one tmux argv in the codebase
built by hand, which is exactly why check 9's list of socket-targeting argvs never mentioned
it.

**`reattached` costs a probe because `-A` erased the question
(`tmux-args.ts`'s `buildHasSessionArgs`, `pty-manager.ts`'s `create`).** M4c's
entire reload-survival feature is one flag: `new-session -A` attaches if the
session exists and creates it if it does not, so create and reattach are the
same call and `session-backend.ts` says outright that "the renderer never
learns reattachment exists". M6a wants to say so in the chrome, which means
asking `has-session` **before** the spawn — after it, `-A` has already created
the session and the answer is `true` for every panel including a cold start,
so the chrome would claim a reattach that never happened, on every launch,
with nothing in any log. `verify:pty-manager` 16/16b are the two halves, and
they only separate the two implementations because 16 runs on a *fresh*
session. The `=` on the target is the same exact-match rule every kill target
obeys; without it panel `n1` reports a surviving session whenever `n12` is
running. **M6a carries the fact and stops there — nothing renders it yet.**
`PanelStatus.running.reattached` and `.cwd` are both live fields on every
running panel with zero readers in the chrome; `TerminalPanel.tsx` reads only
`status.command`. The spec's success criterion — a reattached panel visibly
"saying so" — is deliberately NOT met by this milestone; that is a later
sub-milestone's UI work, not a gap in this one.

**Auto-repeat is one gesture, not fifteen (`useViewport.ts`'s `REPEATABLE_KEYS`,
`usePalette.ts`).** Holding a key does not produce one keydown; the OS emits the real
press and then an auto-repeat stream at roughly 15/sec, and every one of them arrives
as an ordinary `keydown`. Nothing in this codebase consulted `event.repeat` until this
fix, so holding `Cmd+N` spawned a panel — and, once it went live, a PTY — per repeat:
two seconds of a held chord was thirty agents and a canvas well past `LIVE_BUDGET`,
i.e. a WebGL context count against a browser cap near sixteen, which
`create-terminal.ts`'s `webglDisabled` makes permanent for the run. `Cmd+K` had the
same gap with a louder symptom, because it TOGGLES: a held chord flickered the overlay
at the repeat rate and re-ran `openPalette`'s `setCapturedId(focusedIdRef.current)` on
every flip, so which panel the palette's rows acted on depended on whether the user
released on an odd or an even repeat.

Three things about the fix are worth not undoing. **The zoom steppers are exempt on
purpose** — for `=`/`+`/`-` the repeat stream IS the feature, and `REPEATABLE_KEYS` is
an allow-list rather than three scattered per-case guards precisely so the exemption is
written down instead of merely absent, which is the form the next reader "fixes".
**It is `event.repeat`, never a keyup latch**: AppKit does not reliably deliver `keyUp`
for a key pressed while `Cmd` is held, so a flag set on keydown and cleared on keyup
would stick "down" after the first `Cmd+N` and kill the shortcut for the rest of the
run — a silently dead key traded for a loud bug, the worse of the two. And
`usePalette.ts` calls `preventDefault()` **before** the repeat bail, unlike its modifier
checks above it: those reject chords that are not ours, while this one rejects a chord
that IS ours and we are declining to act on, so the tail of a held `Cmd+K` must still be
swallowed rather than leaking to the browser and the focused agent's PTY.

`verify:panels` 7b and 33b are the checks, and **neither proves the fix works** on its
own: both construct a `KeyboardEvent` with `repeat: true` supplied by hand, so they
assert the guard READS the flag and say nothing about who SETS it. That second link was
checked separately and once, with a throwaway Electron script driving
`webContents.sendInputEvent({ type: 'keyDown', keyCode: 'n', modifiers: ['meta',
'isAutoRepeat'] })` — which enters through blink's real key handling rather than the
DOM — and observing `KeyboardEvent.repeat` arrive `[false, true, true, true, true]`
across one press plus four repeats on Electron 43.4.1. Note the spelling: `isAutoRepeat`
is a **modifier string**, because Chromium carries auto-repeat as a bit in the modifier
bitfield; passing it as a top-level field on `sendInputEvent` is silently ignored and
reports the guard as inert when it is fine. The remaining unverified link — that macOS
sets that bit for a physically held `Cmd`-modified key — is the one a future change can
break with the whole suite still green, the same shape as `verify:panels` 32 and the
`pane-died` quoting bug, and the one that needs a hand on the keyboard.

The rest of the suite is a useful accomplice here, and worth knowing about before
"fixing" an unrelated-looking failure: with the guard removed, 7b's five stray panels
also fail check 8, and 33b's odd toggle count takes 34, 35, 36, 45 and 46 down with it.

**Sections are data, and section-first sorting is why the grouping is real
(`palette-model.ts`'s `SECTIONS` and `filterCommands`).** Until M6p the palette
sorted `(b.score - a.score) || (a.order - b.order)`, and `commands.ts`'s header
comment called construction order "the grouping" on the strength of that stable
tiebreak. It was not. Score won OUTRIGHT, so construction order survived only
for the EMPTY query — one keystroke interleaved the groups, and "Delete preset
Claude" could sit directly above "New panel from Claude" with nothing but a
repeated 68px uppercase chip to tell them apart. `filterCommands` now sorts by
`SECTIONS` index first, then score, then construction order, which is what lets
the rendered headers be true while the user types and makes a destructive row
structurally incapable of leapfrogging its benign sibling. Two consequences
worth not undoing. **`SECTIONS` is an ordered array rather than a union**: the
old closed `CommandGroup` hardcoded its order in the type AND in `verify:palette`
check 30, which is why M6b's plan needed a written section explaining that adding
one section meant editing both — appending an object literal is the whole
operation now, and check 30 derives its expectation from `SECTIONS` rather than
restating it. And **the selection seeds from `bestMatchIndex`, not
`firstRunnable`**: with rows ordered by section, "the first runnable row" is the
top of Panels no matter what was typed, so `Enter` would run something unrelated
to the query. `bestMatchIndex` ignores sections and picks the best-scoring
RUNNABLE row — runnable being the half that matters, since a best match parked on
a disabled row makes `Enter` a silent no-op. For an empty query every score ties
at 0 and it degenerates to exactly `firstRunnable`, so one function serves both
states.

**Hidden at rest is two rules, and shipping one is the bug
(`Command.hiddenAtRest`).** Every preset emits four rows and there are three
built-ins, so the resting list was twelve preset rows before the user added
anything — about seventeen rows total, of which three were verbs. The four
administration row kinds (preset rename/delete/make-default, prompt delete) now
carry `hiddenAtRest` and are dropped when the query is empty AND no scope is
active. **They are not hidden from search**: type "delete" and they are back, in
the `Manage` section. The rule `verify:palette` check 31 states in its own
comment applies here — *a row that disappears is indistinguishable from a feature
that is missing* — so an implementation that only hides is one that quietly
deleted four commands from the app. `verify:palette` 39 and 40 are the two halves
and neither is redundant. The two always-visible `Manage presets…` /
`Manage prompts…` rows are the door for anyone not guessing a query.

**`searchText` leads the haystack, and the order is load-bearing
(`palette-model.ts`'s `haystack`).** M6p retitled two row kinds to the bare noun
the section header no longer needs repeated — `New panel from Claude` became
`Claude`, `Insert prompt: review` became `review` — and `searchText` is where the
dropped words went so the old phrasing still finds them. It must come **first**.
`fuzzyMatch` is a single ordered subsequence over one concatenated string, so
with the title spliced in front, typing "new panel from claude" consumes "new
panel from" out of the trailing terms and then has to find "claude" AFTER it,
which is not there — the row stays in the list and silently stops answering the
query `searchText` exists to answer. This was caught by `verify:panels` 40a going
red, not by reasoning, and `verify:palette` 41b is the check that pins it. The
cost is a few points of `fuzzy.ts`'s earliness bonus on the title, which only
reorders rows within a section.

**Escape is two-stage, and the drill-in is declarative (`Palette.tsx`).** Inside
a scope, `Escape` pops back to the top level and the palette STAYS OPEN; only at
the top level does it close. Escape always closing would make the drill-in a trap
the user leaves only by reopening the palette — losing `capturedId` — and would
make going back and giving up the same key. `Backspace` on an empty query pops
too. Input mode is deliberately not a third stage: closing clears it
(`Canvas.tsx`'s `if (!palette.open) setInputMode(null)`), which is what makes
Escape a real cancel for a rename and a delete alike. Separately, a door row
announces itself with the FIELD `Command.entersScope`, never by calling back
during `run()`: `runRow` closes the palette BEFORE running a command (a command
may focus a panel or open a dialog, and restoring focus afterwards would steal it
straight back), so a row that wants the overlay to stay up has to be readable
before it is run.

**A destructive row is marked AND gated, and the gate is `InputMode`
(`commands.ts`'s `destructive`, `Canvas.tsx`'s `deletePreset`/`deletePrompt`).**
Neither half replaces the other: a red row still runs on one `Enter`, and an
unmarked confirm is a question the user did not expect to be asked. The gate
reuses input mode rather than adding a dialog, and that is not a shortcut — M5a
deferred preset editing entirely because "building a preset-manager dialog now
would be the first modal in this app, and it would collide with xterm's keyboard
focus". Input mode is that problem already solved, so a confirm inherits all four
of `usePalette`'s focus rules. It follows `beginRenamePreset`'s two-step shape
including the reopen that looks redundant and is not. `verify:panels` 50 asserts
the cancel by reading `preset.list()` back, not by reading the overlay: a confirm
step that confirms unconditionally is invisible.

**Sticky headers oblige `scroll-margin-top` (`styles.css`).**
`.palette__section` is `position: sticky`, and `.palette__row` carries
`scroll-margin-top: 28px` to match its rendered height. The two MUST agree.
`scrollIntoView({ block: 'nearest' })` considers a row visible when it is inside
the scrollport — including when a sticky header is painted on top of it — so
without the margin, arrowing into a new section parks the selected row
UNDERNEATH its own header, which looks exactly like the selection jumping off
screen. No check can catch this: a synthetic `WheelEvent` performs no default
scroll in Chromium, the same limit `verify:panels` 47 documents. It was verified
by hand.

**Confirm mode keeps an invisible input, and it must stay focusable
(`Palette.tsx`, `.palette__input--ghost`).** There is no text to edit, but the
field is still what holds DOM focus away from xterm — the same job xterm's own
hidden textarea does. So it is positioned off-view at `opacity: 0` rather than
removed: `display: none` or `visibility: hidden` would make it unfocusable and
hand the keyboard straight back to the agent with a destructive question on
screen and no key able to answer it.

**Cmd+N cascades, and the test is CENTRES, not overlap (`panels/panels.ts`'s
`cascadeCentre`, `Canvas.tsx`'s `onSpawn`).** Every path that makes a panel — `Cmd+N`, the
Presets menu, the palette's `preset:spawn-by-id` — funnels through `onSpawn`, which handed
the camera's world centre straight to `makePanel`. So N presses at an unmoved camera produced
N **byte-identical rects**, and the failure is total and silent: the canvas looks like it
holds one panel, the buried ones cannot be closed because their close buttons are underneath,
and each still holds a WebGL context and a `LIVE_BUDGET` slot. The HUD count is the only
evidence they exist. `cascadeCentre` returns the requested centre unless a panel is ALREADY
centred there, and otherwise steps down-and-right until it finds a free slot.

Five things about it are load-bearing rather than incidental:

- **It is in `panels.ts`, not in `makePanel`.** `makePanel` has no panel list and no business
  gaining one, and `verify:viewport` 48 pins `custom.rect.x === centre.x - 200` — exact
  centring — as its contract.
- **The test compares panel CENTRES, never rect overlap.** This fixes *indistinguishability*,
  not overlap. Overlap is the normal state of a working canvas — two 720×460 panels can barely
  both be on screen in a 1400×900 window without touching — so an overlap rule would step
  nearly every press away from where the user is looking, contradicting the explicit spec item
  `verify:panels` 7 exists to pin, and would exhaust the cascade constantly. Perfect
  coincidence is the only state with no visual evidence at all. `verify:viewport` 51 is the
  check that fails if this is "simplified" to an overlap test.
- **`CASCADE_EPSILON` is half a pixel, deliberately not a "looks stacked" radius.** Every
  coincidence this app can produce is EXACT — two presses at an unmoved camera both come from
  the same `screenToWorld(centre, viewportRef.current)` — so the epsilon only has to survive
  recovering a centre as `rect.x + w/2` from a rect built as `centre.x - w/2`. Widening it
  re-introduces the overlap rule through the back door.
- **The step is world units, never `step / viewport.scale`.** Panels scale with the zoom, so a
  world-fixed step keeps the cascade constant *relative to the panels* at every zoom — always
  one chrome-height of each card showing. `onSpawn` and `worldCentre()` also carry no camera
  state on purpose (the setter stays private), so threading a scale through would push camera
  state into the panel model.
- **It runs inside the `setPanels` updater on `current`, never on a ref.** React applies queued
  updaters sequentially, so two spawns batched into one tick each see the previous one's array;
  a ref read (written a render later) hands both presses the same array and both pick the same
  slot — the stacking bug resurrected through a door that only opens under batching. Its purity
  is also what keeps it clear of the StrictMode hazard the `commitHistory`-in-an-updater note in
  `Canvas.tsx` describes.

It is collision-based rather than a spawn counter, which is what makes it self-resetting (pan
somewhere empty and the next panel is centred again), gap-filling (close the middle of a cascade
and the next spawn lands back in that hole), and correct against panels restored from disk. And
it **wraps** at `CASCADE_MAX_STEPS` instead of marching: a panel walked outside the cull region
is never promoted, so it never spawns a PTY, and `Cmd+N` appears to do nothing at all — a
quieter failure than the stacking it replaced. `verify:panels` 51's live assertion is the only
place that property is proven rather than argued.

**The header's honest chain, and the backfill that must never happen
(`TerminalPanel.tsx`).** The label is
`title ?? status.command ?? spec.command ?? 'login shell'`. The second link is
the one that took two milestones to connect: `pty:create` has returned the
resolved command and cwd since M4 — its doc comment says "so the renderer can
show what actually got spawned" — and `session-registry.ts` stored only the
pid, so the header had nothing but the SPEC's command, which is absent for
every login-shell panel. The resolved value lives on `PanelStatus` and is
**never copied back into `PanelSpec`**: doing so would make it a fifth place
M5a's absent-`command` rule can be lost, and every command-less preset would
spawn a hardcoded shell instead of the user's real one. `verify:registry` 20
is the check that fails if the widening is reverted.

**One map, and a typed view over it (`shared/settings-schema.ts`,
`main/layout-store.ts`).** Settings live in ONE sparse `preferences` map in
`layout.json`, keyed by `SettingDef.id`. `LayoutStore.settings()` and
`setSetting()` survive with their old `RestoreSettings` signatures — six
`verify:layout` checks and all of `initial()`'s restore logic are written in
terms of them — but they are a **view**, not a second storage: both go through
the same map, which is what `verify:layout` 73 asserts by writing through one
API and reading through the other. Two storages that agree the day they are
written and drift later is the failure this arrangement removes. `settings` is
still READ by `parseLayout` (a pre-M6b file migrates on first load) and is no
longer WRITTEN.

**Sparse, and that is what lets a default change later.** An id absent from
`preferences` means "still at the schema default", not "unset". A full map
written on every save would freeze every default at whatever it was the first
time a user launched the app, so changing one later would reach nobody.
`resolveSetting` is the only way to read a value, and `parsePreferences` drops
an unknown id or a wrong-typed value with a WARNING rather than coercing it —
a silently-coerced toggle is a preference the user set that stopped applying,
with nothing anywhere saying why (`verify:layout` 67-68).

**Settings are a drill-in, not a flat list (`palette/palette-model.ts`'s
`SECTIONS`/`PaletteScope`, `palette/commands.ts`).** M6b landed after M6p had
already replaced the closed `CommandGroup` union with `SECTIONS` as ordered
data, so a setting is not a fifth flat group bolted on beside `Setting` — it is
`{ id: 'setting', label: 'Settings' }` inserted into `SECTIONS` ahead of
`manage`, and `PaletteScope`/`SCOPE_LABEL` both grew a `'settings'` member the
same way they already carry `'presets'` and `'prompts'`. Every boolean setting
row carries `scope: 'settings'` and `hiddenAtRest: true`; the always-visible
`manage.settings` door (`entersScope: 'settings'`) is the only way in at rest.
This is not optional polish: M6p sized the resting list to roughly eight rows
specifically so it would stay scannable, and three more settings rows sitting
there un-hidden the day M6c and M6d add theirs is the same "silently missing
feature" failure `hiddenAtRest` already exists to prevent for presets and
prompts — a row that disappears reads as a feature that was never built.
`hiddenAtRest` hides only AT REST: typing a setting's keyword still surfaces it
in the top-level list (`verify:palette` 52), which is what makes the hiding
honest rather than a second way to lose a row.

**The Restore submenu is derived, not listed (`main/menu.ts`) — and no check in
`npm run verify` proves it stays that way.** The submenu maps over
`settingsInCategory(RESTORE_CATEGORY)` rather than a hand-written list —
`RESTORE_CATEGORY` is one exported constant in `settings-schema.ts`, used as
every `SettingDef`'s own `category`, as the menu's query argument, and as the
submenu's rendered `label`, so the four copies of `'Restore on launch'` cannot
drift apart by a typo — and `SETTINGS_SET`'s handler calls `rebuildMenu()` so a
palette toggle redraws the checkbox instead of the two surfaces disagreeing
until the next unrelated rebuild. `verify:layout` 74 asserts
`settingsInCategory(RESTORE_CATEGORY)` returns the three `restore.*` ids — a
fact about the pure schema function ALONE. It never touches `menu.ts`, and
**nothing in `npm run verify` calls `buildAppMenu` at all**, because `menu.ts`
imports `electron` and no Electron-tier suite drives it:
`verify:panels`' own harness (`scripts/verify-panels.cjs`) builds no menu and
passes `rebuildMenu` as a no-op precisely because this harness has none to
rebuild. So 74/74 would pass identically against a `menu.ts` that reverted to
a hand-written list of the same three settings and never called the query at
all — the exact drift this entry's first paragraph claims is prevented. That
claim is true of the code as written today; it is **unverified by any
automated check**, and closing the gap needs a new Electron-tier suite that
actually constructs a menu and reads its items, which M6b did not scope. Do
not read `74/74` as proof the menu is still derived — see `verify:panels` 32's
note on what it deliberately sends nothing to prove, and the auto-repeat note
on what its checks cannot show, for the same shape of gap elsewhere in this
file.

**`SettingDef['type']` tracks only what `typeof` can actually return
(`shared/settings-schema.ts`).** An earlier draft added `'enum'` to the union
with no enum-typed setting to back it; it was removed rather than given a
type-mapping layer, since a customer-free abstraction is exactly what
`ideas-backlog.md` #11 warns against.

**A title is not a bell (`main/agent-state.ts`'s `scanForBell`).** Claude Code
sets its window title with `ESC ] 0 ; <title> BEL` — the terminator is a literal
BEL byte, not a distinct one — so a naive `chunk.indexOf(0x07)` reports a bell on
every title change: the panel's border flashes on a rhythm that tracks the
agent's UI state, not its need for attention, and nothing in any log explains
why. `scanForBell` is a small state machine over the escape grammar instead —
`text`/`esc`/`osc`/`osc-esc`/`dcs`/`dcs-esc` — so a BEL is only counted while the
scanner is in `text`; one reached from inside an OSC or DCS body is consumed as
that string's terminator. The state has to be **carried between calls**, not
reset per chunk: output is flushed roughly every 16ms, so an OSC body routinely
straddles two `enqueue` calls, and a per-chunk scanner would re-enter the tail of
a split title as ordinary text and ring a bell on it — intermittently, and only
under load, which is the worst shape a bug can have because it never reproduces
on demand. The trap is checked at three tiers on purpose — `verify:agent-state`
(the pure scanner and state machine, split-chunk cases included),
`verify:pty-manager` (the real manager wired to a real PTY), and `verify:panels`
(a real renderer, real pixels) — because a regression at any ONE of them is
silent at the other two: the pure check cannot see whether the detector is wired
to `enqueue` at all, the manager check cannot see whether the state ever reaches
a border, and neither can see whether the *bytes reaching the scanner* are the
agent's own — see the tmux entry immediately below for why that last question
has its own answer.

**Under tmux, `PtyManager` never sees the agent's own OSC title — measured, not
assumed (`main/agent-state.ts`, `main/tmux-args.ts`'s `buildTmuxConf`).** Under
the tmux backend, `node-pty` spawns a tmux **client**, not the agent — so the
bytes `enqueue` scans are tmux's REDRAW of the pane, not the agent's output
stream verbatim. No escape sequence the agent emits reaches the scanner
unchanged; tmux has already parsed and re-rendered it. tmux itself consumes
`ESC ] 0 ; <title> BEL` / `ESC ] 2 ; …` to set its own pane and window titles, and
`buildTmuxConf` sets no `set-titles` — tmux's default there is off — so it does
not re-emit a title to the client either. The consequence is exact: **the
agent's OSC window title never reaches this app under tmux, in dev or in
production**, and the OSC-title trap `scanForBell` exists to defuse is
unreachable on that path. A pane **bell**, by contrast, *is* forwarded — this
config leaves `bell-action`/`visual-bell` at tmux's own defaults, which pass it
through — and that asymmetry (bell forwarded, title consumed) is exactly why
`verify:panels` 54 passed under either backend while 55 would have silently
passed against a **deliberately broken** scanner had its fixture not been pinned
to the direct backend: with the scanner changed to count an OSC terminator as a
bell, `verify:agent-state` went red (correctly) while a tmux-backed 55 stayed
green, the shape of a check that reads as coverage and proves nothing. The
direct backend is where the trap **is** reachable, and it is a real, supported,
production configuration — taken whenever tmux is absent, too old, or its own
server fails to start (see "The probe checks that the SERVER starts" above) —
so the scanner earns its place on three separate grounds even though tmux
absorbs the one escape sequence it was originally written to defang: the direct
backend is real and shipped; the stream under tmux still carries OSC and DCS
that **tmux itself** emits (more on this below); and it is a small, pure module
that costs the cheapest verify tier the repo has.

What this does **not** establish, so a later note does not overclaim it: "tmux
absorbs OSC" is not a general fact, only a fact about the two sequences named
above. tmux emits OSC of its **own** to the client under options this repo never
pins — `set-clipboard` (default `external`, i.e. OSC 52 on copy) and OSC 8
hyperlinks (tmux ≥ 3.4) — and which byte terminates *those* (BEL or ST) is
**unmeasured** here. Separately, an agent's own DCS passthrough needs
`allow-passthrough`, which `buildTmuxConf` does not set and which defaults to
off, so an agent's DCS body is discarded by tmux — but tmux may still emit DCS
sequences of its own that the scanner would see. The experiment that would
settle both: one instrumented run under the tmux backend, logging raw bytes at
`enqueue`, while an inner `/bin/sh` runs `printf '\033]52;c;aGk=\007'`, then
`printf '\033]8;;https://x\033\\text\033]8;;\033\\'`, then
`printf '\033Ptmux;hello\033\\'`. Nobody has run it; do not write down an answer
to it as though somebody had.

**`wants-you` is sticky, and who clears it is asymmetric (`main/agent-state.ts`'s
`nextState`, `IPC.AGENT_ACKNOWLEDGE`).** A TUI typically rings its bell and THEN
prints its question, so a naive "output clears wants-you" rule would clear the
state milliseconds after setting it — the feature would exist in the code and
never once be seen. `wants-you` therefore survives further output and is
cleared only by `acknowledge`. What triggers acknowledge is where the asymmetry
is: typing into the panel is a fact **main** already holds, via the same
`pty:write` handler that reaches the PTY, so main clears it there for free.
Focus is a **renderer** fact main cannot see on its own — the registry, not
main, knows which panel is focused — so the renderer has to tell main, which is
the entire reason `agent:acknowledge` exists as an invoke rather than the
renderer clearing its own local copy of the state. A renderer-side clear would
make the renderer a second author of a state main owns, the same shape of bug
"One map, and a typed view over it" exists to prevent for settings: two places
that agree on the day they are written and drift apart the first time one of
them is wrong. `verify:panels` 57 is the check that proves main answers the
acknowledge — but it does **not** distinguish a correct implementation from one
that also clears the state locally in the renderer and merely happens to agree
with main's answer: no fault-injection seam exists in that harness to make main
disagree on purpose and see which value wins. Same limit this file already
records for check 32 (the default-preset push) and the auto-repeat checks (what
`repeat: true` proves versus what actually sets the flag) — a note for whoever
next touches this path, not a defect in the check as it stands.

**The idleness tick is a second timer on purpose (`pty-manager.ts`'s
`IDLE_TICK_MS`, `startIdleTick`).** The existing flush timer only runs while
there is pending PTY data to flush, so it can observe output but never the
ABSENCE of it — an agent that goes quiet produces no event on the flush timer
at all, because there is nothing to flush. A single 500ms interval per manager,
independent of any panel's own traffic, is what lets `nextState`'s `tick` event
exist: it walks every live session and asks the state machine whether enough
time has passed since `lastOutputAt`, which is the only way "busy" ever becomes
"idle" without a human intervening. The timer is `unref`'d so it cannot hold a
plain-node verify process open on its own.

**The agent-state channel must never bump `registry.version()`
(`renderer/session/agent-state-store.ts`).** `TerminalPanel.tsx`'s `memo` is
gated on `registry.version()`, which bumps on tier/status/focus/exit and
nothing higher-frequency than that — see "`version` exists only so `memo` can
see a mutation" above. Agent state changes on its own scale entirely: a bell can
land while nothing else about the panel changed, and riding `version()` would
mean every panel in the app re-renders on every OTHER panel's bell, the exact
60Hz-cascade shape `version()` was built to block. `agent-state-store.ts` is
therefore a separate module-level store, subscribed **per panel id** rather than
globally, so a state change for panel `n3` notifies only whatever component
asked about `n3`. And on the main side, `applyEvent`'s dedupe — sending
`IPC.AGENT_STATE` only when `nextState` actually changed the state, never on
every byte — is not an optimisation bolted on afterward; it IS the throttle the
design asks for, the same way "sections are data" and "the promote/demote hold"
are each one mechanism serving double duty rather than two.

**The glow reaches the card, not just the border (`styles.css`'s
`.panel__card--agent-*`).** `LIVE_BUDGET` caps live panels at 8 regardless of how
many exist on the canvas — see "Lazy spawn" above — so on the canvas this
feature exists for, MOST of what a user might want to know about is sitting in
a card, not a live terminal. A glow that only painted `.panel`'s border would be
invisible for exactly the panels a "what needs me" scan is for: the ones off
budget, demoted, or never promoted. `TerminalPanel.tsx` renders the card variant
from the same `data-agent-state` the live variant reads, so a bell on a
carded panel is exactly as visible as a bell on a live one — `verify:panels` 56
is the check that pans the panel off budget FIRST and only then rings its bell,
so it fails if the card path is ever dropped in favour of the simpler
border-only one.

**`exited` here is not an exit code (`main/agent-state.ts`'s `Detector`,
`PanelStatus.exited`).** The detector's `exited` state exists for exactly one
reason: to stop emitting further `busy`/`idle`/`wants-you` transitions once a
process is gone, because a dying process's last bytes arrive AFTER `onExit` is
already known — the same ordering `pty-manager.ts`'s flush-before-exit comment
already documents — and a detector that revived on those trailing bytes would
leave a dead panel glowing `busy` for the rest of the run. It carries no number
and answers no question about SUCCESS or FAILURE; `PanelStatus.exited` (the
real exit code, surfaced through `pty:exit`) stays the sole authority on that,
unchanged by this milestone. Treating the detector's `exited` as a substitute
for the real exit code would be reading a boolean where a number belongs.

**`agent.idleAfterMs` is bounded, and both ends fail silently
(`shared/settings-schema.ts`, `LayoutStore`/`parsePreferences`).** The bound
(`min: 250, max: 60000`) is enforced on **two** independent doors into the same
map, not one: the write path (`setSetting`/`setPreference`, which refuses an
out-of-range number the same way it refuses a wrong-typed one — see "One map,
and a typed view over it" above) and the load path (`parsePreferences`, which
drops an out-of-range value read from a hand-edited `layout.json` with a
warning rather than silently clamping or carrying it into the map). Only
enforcing the write path leaves the load path as a second, unguarded door: a
value edited directly into the file bypasses `setSetting` entirely, and without
the load-side check it would sit in the resolved map as a value the schema
itself says is invalid, changing timing behaviour with nothing in any log to
explain why panels are suddenly idle after 3 seconds or never idle at all. Both
failure directions are silent on their own — a rejected write just looks like
nothing happened, and a silently-clamped load looks like the user's own number
took effect when a different one did — which is why `verify:layout` pins both
ends separately (78–79 on the write path, 80b on the load path) rather than
trusting one to imply the other.

Separately, and worth being honest about rather than implying otherwise: the
shipped **default** of 1500ms is a **provisional stand-in**, not a measured
value. The plan for this milestone called for measuring the within-turn gap
distribution of a real `claude` session — p50, p99, and the shortest genuine
turn-boundary gap — via `scripts/measure-idleness.cjs`, and setting the default
above the p99 of within-turn silence and below the shortest gap worth calling
"done". **That measurement has not been run.** 1500 exists so this milestone's
settings surface has something concrete to show and to let `verify:agent-state`
and `verify:layout` exercise a real number; it is not evidence that 1500 sits
where the design intends, and a future task replacing it with the measured
value is expected, not a regression.

## Gotchas

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
