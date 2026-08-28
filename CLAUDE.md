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
| `verify:viewport` | plain node | 73 checks: `viewport.ts`'s pure canvas math (1–11b), `lod.ts`'s pure tiering (20–25), `panel-interaction.ts` + `panels.ts` drag/z math (26–34), `pointer-correct.ts` (35–39), the undo `history.ts` stack (40–45), dormancy outranking focus in `lod.ts` (46–47), `makePanel`'s spec/size arguments (48), and `centreOn` framing a rect without touching the scale (49–50). M6 adds `cascadeCentre`'s coincidence stepping (51–55) — including the half that is easiest to get subtly wrong: 51 pins that a merely OVERLAPPING panel does not move a spawn (centres, not rects), 53 walks the whole lattice rather than one step, and 54 asserts `CASCADE_EPSILON < CASCADE_STEP` as a relation, because inverting them makes every FIRST press run the lattice and land 384px off centre — a failure that surfaces in `verify:panels` 7 as a centring bug with nothing pointing at the epsilon. M6d adds `edgeIndicator` (56–65), `nextAttentionId` (66–70), and `reachableQueue` (71–72). Two of the ten are worth knowing by number: 57 pins that a PARTIALLY visible panel gets no pip — "off screen" means fully, not "mostly" — and 65 is the only check that separates a screen-space visibility test from a world-space one, a mistake that emits no pips at all once the user has zoomed in, because a rect that reads as off screen in world units can be squarely on screen once scale is applied. Check 71 drops an id absent from the known set while preserving order, and 72 asserts that a phantom at the queue head (a closed panel whose agent state survived the closure, now orphaned) does not disable the jump. M7 adds check 73: `restoreCamera` reproduces a stored `x`/`y` AND `scale` exactly — the one camera verb that DOES touch the scale, unlike `centreOn`, because a workspace's saved zoom level is part of what it means to come back to it |
| `verify:registry` | plain node | 25 assertions against `session-registry.ts`'s lifecycle, using a fake bridge and fake terminal factory — numbered 1–19 with lettered sub-checks (`3b`, `3c`, `7b`, `7c`, `7d`), including explicit close (13–15), dormant attach/wake (16–18), and closing a never-spawned panel (19). M6a adds check 20: `PanelStatus.running` widens to carry `command`/`cwd`/`reattached`, so the header chain has something besides the spec to read for a login-shell panel |
| `verify:layout` | plain node | 98 checks (the last check number is 96; see the lettered sub-checks below): `shared/layout-schema.ts`'s on-disk format validation and `layout-store.ts`'s coalescing, atomic write, and settings resolution, plus `shared/layout-schema.ts`'s preset parsing (27–34), `layout-store.ts`'s preset accessors (35), and `main/presets.ts`'s pure helpers (36–40), and a `presets` key that is present but not an array warning rather than vanishing (41). M5b adds the preset mutations the palette drives — rename, delete, and the default falling back when the default itself is deleted (42–46) — `parsePrompts` and the store's prompt members (47–52), and `main/prompts.ts`'s project-prompt reading, its two caps, and the never-deduping merge (53–57). M6a adds `Panel.title` round-tripping through `layout-adapt.ts` — parsed in on the way from disk (58), written back out on the way to disk (59), and an untitled panel writing no `title` key at all rather than a saved absent-marker (60). M6b adds `shared/settings-schema.ts` and its `preferences` map: the three restore ids and `settingsInCategory`'s query (61), an unset id resolving to the schema default (62), id uniqueness and every def carrying a label/description/keyword (63–64), `parsePreferences`'s absent-vs-malformed split — no key at all warns nothing (65), a non-object warns and is replaced (66) — an unknown id dropped with a warning rather than carried forward as a permanent typo (67), a wrong-typed value dropped and warned rather than coerced (68), the pre-M6b `settings`→`preferences` migration seeding only the three restore ids and only when a legacy key was actually present (69), a fresh store answering the schema defaults with an empty map (70), a preference surviving a write and a reopen (71), `setPreference` refusing an id the schema does not declare (72) and, now that `SettingDef['type']` is honest about what `typeof` returns, refusing a known id given a wrong-typed value too (72b), `settings()`/`setSetting()` proven a VIEW over the same map rather than a second store by writing through one accessor and reading through the other (73), and the Restore submenu's own query returning exactly the three restore ids (74) — see "One map, and a typed view over it" and "The Restore submenu is derived, not listed" below, including what check 74 does **not** prove. M6c adds the three `agent.*` settings: all three declared with the required label/description/keywords (75), `agent.idleAfterMs` typed as a `number` def rather than the schema's usual boolean (76), an unset threshold resolving to its schema default (77), a boolean value refused for a number setting (78), an out-of-range threshold refused on both ends while the bounds THEMSELVES are accepted (79), a number preference round-tripping through a write and a reopen (80), and a hand-edited, out-of-range `agent.idleAfterMs` loaded from disk dropped and warned rather than silently carried into the map (80b) — the load-path half of the same bound the write path already enforces; see "`agent.idleAfterMs` is bounded, and both ends fail silently" below. M6d adds check 81: `agent.edgeIndicators` is declared with the required label/description/keywords and round-trips through a write and a reopen — the fourth `agent.*` setting, and the only one of the four that is a plain boolean with nothing else to pin. M7 adds workspace CRUD and the switch transaction (82–93): a fresh store has exactly one active workspace (82), `createWorkspace` mints a valid id without activating it (83), `panelIds` reports only that workspace's own panels (84), rename round-trips and an unknown id is `false` (85), deleting a non-active workspace leaves the active one alone (86), deleting the ACTIVE workspace activates a neighbour (87), and 88 is never-zero as a WRITE-path guarantee: `parseLayout` promises at least one workspace only on load, and `deleteWorkspace` is the write path that has to promise it again — delete the last workspace and a fresh one is installed rather than leaving the array empty for `activeWorkspace()`'s "unreachable from a parsed file" repair branch to paper over silently. 89 is the save race: `activate` writes the OUTGOING canvas into the OLD record before flipping `activeWorkspaceId`, and the ordering is the entire mechanism — flip first and a switch that merely changed the id would write workspace A's panels into workspace B's file record, well-formed and wrong, with nothing in any log until a later launch shows the wrong panels. 90 asserts the returned state is the INCOMING workspace's own, not the one just written. 91 asserts `allPanelIds` spans every workspace, not just the active one — `PanelId` doubles as a tmux session name (see "Panel ids are global, not per-workspace" below), so a partial view lets two panels claim one session. 92 is activating an unknown id: null, and nothing written. 93 is the whole transaction surviving a reopen. 94 is the final-review fix: a switch must not obey `restore.layout` — that preference answers "what should the app show at launch", not "at a switch" — so with it OFF, a workspace switched away from and back to still hands its panels back rather than reading empty while they sit un-recorded on disk; see "A workspace switch is a second boot, but not in preference semantics" below. M8a adds the two shell chrome settings (95–96): `shell.railOpen` declared like every other def and round-tripping through a write and a reopen (95) — its keywords are the half that carries weight there, because a user who wants the sidebar back has no vocabulary for "rail", so `sidebar` has to be in the haystack or the switch is reachable only by someone who already knows its name — and `shell.inspectorOpen` declared, round-tripping, and **independent of the rail** (96). Independence is the only part of 96 that is not a copy of 95, and it is the part worth having: one sparse `preferences` map holds both ids, so a shared key or a def whose `id` was pasted from its neighbour produces two switches that move together — which reads as a rendering bug and is a schema one. The count is 98 while the last number is 96, because of the lettered sub-checks `72b` and `80b` |
| `verify:palette` | plain node | 69 checks: `fuzzy.ts`'s matching and ranking (1–7), `palette-model.ts`'s filtering, tie stability and runnable-row selection (8–18), and `commands.ts`'s list construction (19–33) — including the disabled *reasons*, which is the half worth checking: a built-in refusing rename, an unavailable preset, a prompt insert with no captured panel, and a project prompt refusing deletion all stay VISIBLE with their reason rather than disappearing from the list. M6a added the `panel.rename` row (31–32) and a titled panel being findable by its title (33). M6p adds the structure: section-first sorting outranking a better score in a later section and score still deciding inside one (34–35), `bestMatchIndex` skipping disabled rows (36–38), `hiddenAtRest` in BOTH directions (39–40), `searchText` including the whole phrase (41, 41b), `splitHighlight` (42–43), the two retitles (44–45), what is hidden versus what is not (46), exactly-two-destructive (47), `⌘N` on the default preset alone (48), and the drill-in doors and what a scope shows (49–50). **Check 30 was rewritten**: it derives its expectation from `SECTIONS` and runs through `filterCommands`, because construction order stopped being the grouping the moment sorting became section-first — see "Sections are data" below. M6b adds the `setting` section and its drill-in: a boolean setting rendering as a runnable row carrying its label and description (51), a setting findable by a keyword the row never shows (52), running a setting row toggling it to the opposite value (53), and the row's title naming which way the toggle currently sits (54) — see "Settings are a drill-in, not a flat list" below. M6c adds the `agent.idleAfterMs` number row: it renders with its current value in the title (55, 56), and stepping it begins an EDIT rather than toggling it like a boolean row (57) — a number setting is a different `run()` shape, not a boolean with extra text — and the row is hidden at rest and lives in the `settings` scope like every other setting (58), with its id recovering the full `SettingRow` (carrying `min`/`max`) rather than a bare boolean (58b). The count was 60 while the last number was 58, because of the lettered sub-checks `41b` and `58b`. **M6d added `agent.edgeIndicators` to the schema and touched nothing here** — stayed 60/60. Every setting row in the palette is generated from `SETTINGS` by main's `settings:list`, so a new boolean def needs no palette code at all, and a fixture-built check in this plain-node suite would only be re-proving that generic machinery for the Nth time, not saying anything about the new setting itself; `verify:panels` 60 is where `agent.edgeIndicators` is actually exercised, findable by keyword and toggled through to main's store. M7 adds the `workspaces` section and its drill-in (59–64): the section exists and sorts ahead of `manage` (59), the active workspace's own row is disabled with a reason rather than absent (60), workspace admin rows are hidden at rest and findable by query, the same rule every `hiddenAtRest` row already obeys (61), the workspace delete row is destructive (62), and the drill-in has a visible door plus its own rows (63). **64 is the one worth knowing by number**: a workspace's waiting count lives in `Command.waiting`, a typed field the VIEW composes into the row's title — never spliced into `searchText` or the haystack `fuzzyMatch` scans. Putting the count in the haystack would have been the easy version, and it fails silently: typing "3" to narrow down to "3 waiting" workspaces would instead match every row whose title, keywords or id happens to contain the digit, since a `Command` earns no privilege by being a count rather than a label. M8a's final fix adds `doorIndex` (65–65c), the lookup that returns a scope's DOOR row so the selection can land back on it when the user pops out of a drill-in — see "Popping a drill-in returns to its door" below. 65 asserts by ID rather than by index, for the same reason check 30 was rewritten: an index here would restate `SECTIONS`' order in a second place. **65c is the one worth knowing by number**: it pins that a door which is present but DISABLED is not returned, and it asserts both halves in one condition — the row is in the list AND `doorIndex` still answers -1 — because asserting only the -1 passes against an implementation that finds nothing merely because the row is missing, which says nothing at all about the disabled check. That case is reachable rather than hypothetical: `prompt:list` re-fires while the palette is open, so the prompts door can go disabled under a user already inside its scope. The count is 69 while the last number is 65, because of the lettered sub-checks `41b`, `58b`, `65b` and `65c` |
| `verify:rail` | plain node | 15 checks against `renderer/shell/rail-rows.ts`: the honest chain's four links (1–4), the status tail (5–9), and the signature (10–15). Three are worth knowing by number. **7** pins that an exit code of 0 renders as `exited 0` — a truthiness test on `code` prints the wrong tail for the single most common exit there is, and no other check in the repo can see it. **10** is the check the module exists for: moving every rect must leave the signature byte-identical, which is what lets `Canvas.tsx` freeze the rows array on it; `SideRail` is rendered unconditionally and collapsing it is only a CSS class, so the rows stay mounted even when nobody can see them and the escape hatch `panelRows` uses (key the memo on `palette.open`, read `panelsRef`) has no equivalent here. 11–13 are the other direction — a title change, a status change and a wake must each MOVE the signature, or a frozen array would render stale text forever with nothing throwing. **14** pins that a user's own title cannot forge a field boundary and freeze the rail on stale rows, which is why the signature is `JSON.stringify` over the rows rather than a concatenation with a separator a label is free to contain; its fixture reaches the collision through `railTail`'s `error` case, the one tail value that returns user text (`status.message`) verbatim and so lets the separator itself slide between fields. 15 pins one row per panel in ARRAY order, never `Panel.z`. M8c's inspector rows and M8d's workspace and attention rows are expected to join this suite rather than get their own |
| `verify:tmux` | plain node | 27 checks: `tmux-args.ts`'s argv, config text, version parsing and list parsing (1–13), `tmux-probe.ts`'s pure backend selection (14–17b), the quoting of the pane-died redirect target against a spaced `exitDir` (18), and the exact-match `=` on every kill-session target (19). M5c adds `resolveSocket`: dev and packaged landing on different sockets (20), the dev socket unchanged from its historic value (21), an explicit override beating both defaults (22), a blank or whitespace override falling back to the default rather than leaking through to tmux's own default socket (23), and `buildStartServerArgs` — the one tmux argv that used to be hand-rolled — defaulting to the private socket and threading an explicit one (24–25). M6a adds check 26: `buildHasSessionArgs`'s argv, including the same exact-match `=` on its target that every kill-session target already obeys, so panel `n1`'s probe doesn't read `n12` as its own surviving session. The count is 27 while the last number is 26, because of the lettered sub-check `17b` |
| `verify:agent-state` | plain node | 25 checks (the last check number is 24; see the lettered sub-check below): `scanForBell`'s scanner (1–10) and `nextState`'s state machine (11–24). The two that matter most: 2 pins that a BEL-terminated OSC window title rings zero bells, and 3 pins the same for the ST-terminated form of the same title — a bare `indexOf(0x07)` would fail check 2 silently, painting a title change as an attention-worthy bell — and 6–8 pin the scanner across a SPLIT chunk (an OSC opened in one 16ms flush and terminated in the next, and a bare BEL split the same way), which is the whole reason `ScanState` is carried between calls rather than reset per call. 5/5b assert a DCS body swallows an embedded BEL and a REAL bell right after it still rings — the state machine doesn't just eat the trap, it recovers cleanly the instant real content resumes. 9 asserts a CSI (no BEL-swallowing string body) leaves a bell alone, guarding the boundary the other direction. 16–17 pin ENTRY into `wants-you` — a bell from busy and a bell from idle both land there — and 18–19 pin that it is STICKY once there: further output does not clear it (18), and neither does an hour of idle ticks (19) — nothing but `acknowledge` or `exit` moves it. 23–24 pin `exited` as terminal and unconditional: even a panel mid-`wants-you` goes straight to `exited` on a PTY exit, and nothing revives it after. See "A title is not a bell" below |
| `verify:package` | plain node | 10 checks against `build/builder-config.cjs`'s returned value: `node-pty` unpacked from the asar and the pattern depth-independent (1–2), `asar` actually on (3), the `files` globs (4–5), app identity and output dir (6–7), signing explicitly *decided* rather than unmentioned (8), targets and architecture (9), and the arch being a parameter rather than a constant (10) |
| `verify:packaged` | real Electron, **not in `npm run verify`** | 9 checks: packages with `electron-builder --dir` and launches the produced binary with a stripped `PATH`, a throwaway `--user-data-dir` and a scratch `TC_TMUX_SOCKET`. Asserts the app survives startup (3 — the asar/`node-pty` proof), reports itself packaged (4), recovered a PATH launchd never gave it (5 — the first time `shell-env.ts`'s reason for existing has ever been observed), used the scratch socket (6), actually used the throwaway `--user-data-dir` rather than silently falling back to the real one (7), named a backend and a reason (8), and actually spawned a PTY (9). Kept out of the default chain because it rebuilds native modules and reaches electron-builder's cache — minutes, plus a network dependency — and the repo's one green-or-not signal must stay fast and offline. It is the **pre-release gate**; run it before cutting a build |
| `verify:pty` | Electron as node | 10 checks: `node-pty` behaviour end to end |
| `verify:pty-manager` | Electron as node | 24 checks (the last check number is 19; see the lettered sub-checks below): the real `PtyManager` (1–10 on the direct backend), plus the real `TmuxBackend` end to end against a throwaway socket and a spaced `exitDir` — session creation, detach-and-reattach at the same pid (12), cross-manager list (13), exit-code fidelity (14–14b), destroying a session this manager never spawned (14c), a prefix-colliding kill target leaving the wrong session alone (14d), and destroy/shutdown (15). M6a adds 16/16b: a fresh session reports `reattached: false` and the same panel spawned again — after the first one is still alive — reports `reattached: true`, the two halves that only separate a `has-session` probe taken *before* the spawn from one taken after (see "`reattached` costs a probe" below). M6c adds 3b and 17–19. Check 3b is the guard half: a kill()'d session emits no agent-state `exited`, which it did until a whole-branch review — see "`starting` is sent directly, and the killed exit is not sent at all" below for the recycled-id failure that produced. 17–19 are the wiring proof that `agent-state.ts`'s pure state machine actually reaches `IPC.AGENT_STATE` through the real manager rather than sitting unused beside it: plain output on a fresh session produces exactly one `busy` event, COUNTED after the stream has demonstrably settled — the check waits for the idle transition, which only a tick that observed the ABSENCE of output can produce, then waits one further tick before counting — which is what separates the emit-only-on-change dedupe from an implementation emitting on every 16ms flush and every 500ms tick, the 60Hz cascade the design exists to prevent. The FIXTURE is what makes that count mean anything, and a future editor must not shrink it: it prints forty lines with a gap between each — comfortably more than one per 16ms flush — because the obvious single `printf` produces ONE PTY read, so a de-duped and a non-de-duped implementation emit the same one `busy` and 17 stays green with the dedupe deleted (confirmed by deleting it and watching 17 pass). Against the burst the two separate 1 vs 42. The relationship that keeps the count honest is between two numbers in that check and nothing else: the inter-line gap (20ms) must stay well under the seeded `idleAfterMs` (200ms), or an idle transition lands mid-burst, the next line legitimately re-enters `busy`, and the count is >1 for a reason that has nothing to do with the dedupe (17), a real OSC window title produces no `wants-you` at all — this suite runs the direct backend, so it is the one place a tmux-free machine can see the OSC trap NOT fire, and its first clause is a NON-VACUITY guard that must keep naming `busy`: "no wants-you" is satisfied just as well by bytes that never reached main, and `busy` is the one state in that fixture only `enqueue` can produce, so a bare `some(panelId === 'a2')` stopped meaning anything the moment `create` began sending `starting` directly at spawn (18), and a real bell followed by a real write moves the panel to `wants-you` and then back off it (19). Skipped loudly, never silently, when no tmux binary is found. The count is 24 while the last number is 19, because of the lettered sub-checks `3b`, `14b`, `14c`, `14d` and `16b` |
| `verify:window` | real Electron | 4 checks: renderer teardown reaches the PTY layer |
| `verify:ipc` | real Electron | 1 check: every contract channel has a handler — 25 channels as of M7 (five workspace invokes: `workspace:list`, `workspace:create`, `workspace:rename`, `workspace:delete`, `workspace:activate`), up from 20 at M6c's `agent:acknowledge`. Note the wording: this suite is a single check reporting `1/1`, not "25 checks" — it covers 25 channels |
| `verify:canvas` | real Electron | 6 checks: real input into the built renderer |
| `verify:xterm` | real Electron | 6 checks: an xterm `Terminal` survives its host being detached and reattached |
| `verify:panels` | real Electron | 99 checks: tiering, the pointer corrector, drag, resize, wheel ownership, close, z-order, id uniqueness, dormant restore/wake (18), layout persistence (19), undo/redo (20–22), reset (23), boot reconcile (24), one end-to-end invocation of `session:backend` through the real bridge (25), a real renderer reload leaving its tmux session running (26), and preset spawn, undo-disposes, the pushed default, capture, and the command-less case (27–31). Check 32 is the only preset check the harness does NOT drive by hand: it seeds `layout.json` with a non-shell `defaultPresetId`, installs the same `did-finish-load` push production installs, and reads the template back out of the renderer — see "The default preset is caught at module scope" below. M5b adds the palette: opening it and the focus rules (33–36), the undo guard (37), a rename reaching the store and the input mode clearing afterwards (38, 38b), the switcher framing a dormant panel without waking it (39), `preset:spawn-by-id` end to end (40a), a prompt insert arriving as a bracketed paste rather than a raw write (40), a mouse-picked row not releasing the focused panel (41), a click OUTSIDE the palette closing it and still focusing the panel it hit (42), and the project half of the prompt list end to end — a real `.claude/commands/*.md` under the captured panel's own cwd, listed with its source label and inserted into that panel (43). M6a adds the header chain end to end: a fresh spawn's header names what main actually resolved rather than a hardcoded stand-in (44), a rename typed into the palette reaching the panel's own header, not just the store (45), and one `Cmd+Z` undoing the whole rename in a single step, matching "one history entry per committed gesture" (46). Check 47 is the palette's wheel: a wheel over the open palette — plain and pinch alike — is left uncancelled and moves no camera, while the same wheel on the background is still cancelled and still pans. It asserts CANCELLATION rather than `scrollTop` on purpose; see "Scrolling the palette is a yield" below for why a `scrollTop` check would fail a correct implementation. Two sub-checks cover OS key auto-repeat, the one input this suite had never simulated: five `repeat: true` Cmd+N keydowns spawn nothing further (7b) and five `repeat: true` Cmd+K keydowns do not re-toggle the palette (33b) — see "Auto-repeat is one gesture, not fifteen" below, including what they deliberately cannot prove. M6p adds the palette's structure in a real renderer: section headers rendering once each in `SECTIONS` order (48), a drill-in narrowing to its own rows with Escape popping back **without closing** (49), and a destructive row that is marked, gated by a confirm, and left un-deleted by Escape — read back out of `preset.list()`, not off the overlay (50). Check 51 is the spawn cascade in a real renderer: two `Cmd+N` presses at one camera, in empty world space, must land exactly one `CASCADE_STEP` apart — and the second panel must still have an `.xterm` under it, which is the ONLY place the suite proves a cascaded panel is still inside the cull region and therefore still promoted, rather than merely arguing it. It reads the step out of `panels-entry.cjs` rather than restating 48, and reads each panel by `data-panel-id` rather than "the last `.panel`", since array order and paint order are deliberately different things here. M6b adds the settings row end to end in a real renderer: a setting reached by a keyword it does not display (52), and a toggle reaching `main`'s store — not just the row's own local state — read back out through `settings:list` (53); `scripts/verify-panels.cjs` passes `registerIpcHandlers` an explicit no-op `rebuildMenu`, because this harness is its own Electron entry point with no application menu for `settings:set`'s handler to call. M6c adds the agent-state seam end to end: a real bell reaches a real panel's `data-agent-state` (54); a real OSC window title moves nothing — this block deliberately swaps the harness onto the DIRECT backend first, because a tmux client never sees the title at all and check 55 would otherwise pass against a broken scanner for a reason that has nothing to do with the scanner, see "Under tmux, `PtyManager` never sees the agent's own OSC title, and the trap is unreachable there" below (55); the state reaches a DEMOTED panel's card, not only a live panel's border, panning the culprit off screen first (56); and focus is what acknowledges it, with the value read back from main's own store rather than the panel's local class, proving main is the one that answered (57). M6d adds the attention-routing seam end to end: an off-screen `wants-you` panel gets a pip at the exact point `edgeIndicator` computes (58) — this checks WHERE the pip lands, not merely that one exists, because a per-axis clamp (see "`edgeIndicator` clips a ray" below) corners every diagonal and still renders *a* pip, so a check that only asked "does a pip element exist" would pass against that exact regression; a pip disappears the moment its panel scrolls back into view with the underlying state unchanged (59); the `agent.edgeIndicators` setting is findable by keyword in the palette and actually hides the pips when toggled off, through main's real store (60); `Cmd+J` frames the waiting panel at the same scale, spawning nothing (61); the jump does NOT acknowledge — the panel stays selected and stays `wants-you`, and the check reads the rendered border COLOUR, not the state, because the failure this guards is purely visual (62); and focus is still what acknowledges a panel reached by the jump key, with its pip leaving as the state clears (63). M7 adds workspace switching end to end (64–71, plus 70b): **64 is the one to know by number**: a switch away and back keeps the SAME pid for every session — every other check in this milestone stays green against an implementation that quietly disposes and respawns on switch instead of demoting, because a respawned agent looks identical to a reattached one in every check that only reads panel/session COUNTS; only the pid survives to tell them apart. 65 is "demote, not dispose" stated as two facts that must both hold in the same read: a hidden workspace's panel is out of the DOM (`panelsInDom === 0`) while its session is still in the registry (`sessionsInRegistry > 0`) — the DOM half alone passes against a dispose, the registry half alone passes against a switch that never rendered. 66 is the id-collision guard: a spawn in one workspace mints no id any OTHER workspace's `allPanelIds` already claims, because `PanelId` doubles as the tmux session name (see "Panel ids are global, not per-workspace" below). 67 asserts `Cmd+Z` immediately after a switch is INERT — an uncleared undo stack would let it apply the OTHER workspace's panel array here and dispose sessions this workspace still wants running. **68 is the mass-spawn check**, and it is deliberately built against a workspace this renderer has never rendered before, seeded on disk with a persisted `focusedId` — `assignTiers` pins a focused panel live unconditionally, so if `dormantIds` were ever wrong on the switch's first render (committing `next` before `pty.list()` resolves — see "A workspace switch is a second boot" below) this fixture forces it into a spawn rather than merely hoping a camera/cull coincidence produces one; checks 64–67 all reuse an already-rendered workspace and would stay green against that exact regression. 69–70 drive the real gated delete action, not a bypass — `deleteWorkspace` disposes every session and the record only after a real Enter answers the confirm (69), and a real Escape leaves the workspace undeleted, read back from `workspace.list()` rather than off the overlay (70), the same "a confirm step that confirms unconditionally is invisible" reasoning check 50 already established for presets. 70b is M6d's premise at its strongest: a `wants-you` panel whose whole CANVAS is hidden, not merely off screen, still shows a waiting count on its workspace row in a real rendered palette, through main's real store. **71 is the only-workspace case**, reachable solely by deleting every other workspace first: deleting the LAST one must not resurrect its just-disposed panel ids in the fresh replacement workspace main installs — the same resurrection bug the "outgoing write" ordering note (below) exists to prevent, caught here on the read side instead of the write side. Two sub-checks cover the drill-in arrows: 49b is ArrowRight opening the door under the selection and ArrowLeft popping back out, asserting the same three facts about WHICH scope opened that 49 does, so an arrow that opened the wrong drill-in still fails. **49c is the one worth knowing by number**: the arrows are caret-gated (ArrowRight only from the end of the query, ArrowLeft only from position 0), and 49b passes against an implementation with no gate at all — which would leave `.palette__input`, the one text field in this app the user cannot tab out of, permanently uneditable once anything is typed into it, since no key would be left that moves the caret back in. 49c presses each arrow from the wrong caret position and asserts nothing happened, then from the right one and asserts it did. Hover adds 72/72b/72c: a mousemove over a runnable row makes it the SELECTED row — the same class the arrow keys drive, because hover moves the one `index` rather than painting a second highlight (72); a mousemove over a DISABLED row leaves the selection alone, the rule `stepRunnable` already states for the arrow keys (72b); and **72c is the one worth knowing by number**: a second mousemove at coordinates IDENTICAL to the previous one, on a different row, must move nothing. Blink re-dispatches a mousemove at the unchanged cursor position after a scroll to refresh `:hover`, so without the coordinate guard an ArrowDown that scrolls the list hovers whichever row slid under a stationary cursor and drags the selection straight back — the arrow keys become unusable whenever the pointer happens to rest over the list. No synthetic `WheelEvent` can produce a real scroll here (the limit check 47 records), so 72c reproduces the SIGNAL instead of the gesture. All three live in this suite and not `verify:palette` for one reason: the plain-node tier has no DOM and cannot dispatch a mouse event at all. M8a adds the shell frame end to end (73–78, plus 75b and 75c). **73 is the one to know by number**: it asserts the EXACT inset — `canvasWidth === windowWidth - railWidth - inspectorWidth`, ±1 for fractional device pixels — and it has to, because every looser bound it also carries survives the one CSS failure the frame's own comment names. Drop `min-width: 0` from the canvas grid cell and the item refuses to shrink below its content, so the canvas overflows and shoves the inspector off screen; `getBoundingClientRect().width` reports a width for an element pushed out of view exactly as it does for a visible one, so the rail is still 240, the inspector still 260, and an overflowing canvas is still comfortably under `windowWidth - 80`. Only the identity fails, because an overflowing middle cell is precisely a canvas WIDER than the space the other two leave it. 73's second half is the `.xterm` probe — a panel is still PROMOTED on the narrower host — which is not tautological the way "the canvas got narrower" is: a smaller canvas is a smaller cull region, and a frame that quietly demoted the panel the user was looking at renders a card with no error anywhere. 74 is the palette's outside-click exit reached from a shell click, an ADDITIONAL door rather than a replacement — 42 still pins the canvas case and must stay green. 75 collapses the rail, reads the result back out of main's store through `settings:list` — not off the shell's own class, for the reason check 53 already established: a toggle that only flips a local boolean looks identical on screen and is gone at the next launch — and asserts nothing was DEMOTED by the collapse, which is the spec's own conjunction and until the final review shipped as two checks that never met (73 asserts `.xterm` but collapses nothing; 75 collapsed but never looked at promotion, leaving success criterion 3 asserted nowhere). That last clause is near-tautological today and its comment says so: nothing in the renderer observes the canvas host's SIZE, so a collapse re-runs no tiering at all — see "Two second-order effects" below. It is there for the future change that makes a width change re-tier. 75b is the auto-repeat guard on `Cmd+\`, and like 7b and 33b it supplies `repeat: true` BY HAND — it proves the guard READS the flag and says nothing about who sets it. **75c is the transferable one**: a shell control takes neither DOM focus nor the app's `focusedId`, driven by a REAL `sendInputEvent` rather than a dispatched `MouseEvent` — see "A dispatched `MouseEvent` cannot test focus behaviour" below, and note what its own comment says it cannot distinguish (a control that swapped `focusedId` to a DIFFERENT live panel while DOM focus stayed put would satisfy both halves; M8b's rail start control is such a button — it DOES call `onSelectPanel` — and the claim survives it anyway for a narrower reason: `onSelectPanel` (`Canvas.tsx`) is `selectAndRaise` + clear-dormant + `registry.wake` and never touches `focusedId` at all; only `onFocusPanel` calls `setFocusedId`, and no shell control calls `onFocusPanel`). 76 is the New panel button spawning EXACTLY one panel, through main — exactly-one is half the check, since a button whose click also reached the canvas background would spawn once and select something else, and a double fire looks identical to a slow machine. 77 is the zoom cluster, and its Fit half needed three ANDed clauses before it could fail at all: not-where-the-steppers-left-it kills a Fit wired to nothing, a FIXED-POINT clause (clicking Fit twice lands the same scale) is what separates a fit from a stepper — `ZOOM_STEP` is 1.2 and this fixture's real fit is ~1.194, so a "the scale changed" bound cannot tell a copy-pasted zoom-in handler from the real thing — and not-equal-to-1 kills `resetViewport` deliberately rather than by coincidence. The fixed-point form was chosen over recomputing the fit in the harness precisely so the harness never grows a second copy of arithmetic `verify:viewport` already pins purely; clause (c) is fixture-dependent and its own comment says the response to it going red is to change the fixture, never to widen the bound. 78 is search opening the palette and settings opening it IN the settings scope — the scope half is the one that matters, because a setting row is `hiddenAtRest`, so a button that merely opened the palette would land the user on a list with no settings visible at all, a feature that reads as missing. M8a's final review adds 79 and 80. **79 is the palette -> SCREEN direction, and it is the only check that covers it**: `shell.railOpen` is an ordinary boolean `SettingDef`, so main's `settings:list` AUTO-GENERATES a runnable palette row nobody wrote, and running it must move the rail rather than only persisting — check 53 is palette -> store and check 75 is button -> store, and both stayed green while a palette toggle wrote to main and left the frame exactly where it was, with the row's own title then reading "Off" beside a visibly open rail. 80 dispatches the INSPECTOR chord the way macOS actually delivers it — `{ key: '|', code: 'Backslash', metaKey: true, shiftKey: true }` — and asserts `shell--inspector-collapsed` flips while `shell--rail-collapsed` does not. One check, three regressions, two confirmed by fault injection, the third unreachable by construction since 80 reads the class name directly: reverting `useShellChrome`'s `event.code` test to `event.key` (75b stays green because it supplies a matching `key` AND `code`), `toggleRail()` written into BOTH chord branches, and a mistyped `shell--inspector-collapsed`. M8a's final fix adds 49d and 49e, the two halves of "popping a drill-in returns the selection to its door" (see that entry below). **49d is where the bug was actually reproduced**, and its shape is the transferable part: it ANDs five clauses, of which 1–3 exist purely to stop it passing for the wrong reason — the door was the selected row BEFORE the arrow, the scope chip really did read `Settings` after it, and the overlay really did pop and survive. Without those, an `ArrowRight` that silently failed to enter leaves the query reading `manage settings` with the door still selected, and a check asserting only "the door is selected at the end" goes green against a completely broken drill-in. Clause 4 (`.palette__row--selected` exists at all) is the other easy miss: index `-1` renders no selected row, which satisfies any assertion phrased as a negative. **49e is the only check that distinguishes the shipped design from the obvious alternative**: it pops a scope the top-bar gear opened, where no door was ever traversed, so an implementation that remembered the entered row's id in a ref satisfies 49d and cannot satisfy this at all. It is deliberately not folded into check 78, whose subject is that the button opens IN the scope and which must keep failing for its own reason. M8b adds the panel outline end to end (81–86). 81 is one row per panel with a REAL pid in its tail — the pid half is what makes it more than a count, since a row rendering the panel id, or a hardcoded stand-in, satisfies "there are N rows" while telling the user nothing main actually resolved; an empty label is rejected explicitly, because a blank row is indistinguishable from a styling bug at a glance. 82 is a rename typed into the palette reaching the rail row, and it is a live hazard here and nowhere else: `railRows` is deliberately frozen on a signature, so getting that signature's fields wrong freezes the rows forever with nothing throwing and the panel's own header still correct beside a stale one. **83 is the one to know by number, and it is worth knowing as much for what it does NOT prove**. What it establishes: a real bell through a real PTY moves the TARGET row's dot to `wants-you`; no other row's dot moves with it; and at least one non-target dot is carrying a REAL agent state rather than a degenerate stand-in (`othersAreReal`). That last, non-vacuity clause is what catches a dot derived only from the attention set — which knows only "is this panel waiting" and so collapses every non-waiting state to nothing — but it does not catch every list-level implementation: one that read the full per-id state map and passed real values down would still paint `starting` on the other rows and pass. **83 therefore does not establish that each row subscribes individually**, which was the plan going in and which fault injection found unprovable from the DOM — see "Agent state reaches a rail row by the row's own subscription, and no check proves it stays that way" below. Its fixture is the other transferable part: it spawns its OWN `/bin/sh` through `PRESET_SPAWN` rather than ringing the bell at 82's `Cmd+N` panel, because `Cmd+N`'s default here is `/bin/cat -v` and `cat` merely ECHOES the bytes it is handed rather than interpreting them, so `printf '\007'` never becomes a real bell byte and the check could never pass, on correct rail code or broken — the same substitution checks 54–63 and 70b already make, and the trap 70b's own comment documents. 84 and 85 are the dormancy pair, on a fixture seeded for it (`rail-dormant`, parked at world 60000,60000 by the same disk-append-and-reload route check 39's `never-woken` uses, because M7's check 71 deletes the last workspace and 39's fixture does not survive it). Both of 84's clauses are load-bearing and neither restates the other: the CAMERA clause is what rejects a row wired to nothing at all, since the no-spawn clause alone passes there — a panel nobody touched really is still dormant — while the DORMANCY clause is the only one that would catch a row wired to CENTRE AND WAKE, the genuinely dangerous shape, because the camera moves exactly as expected and the row looks completely correct on screen while quietly launching a process. A row wired to `onSelectPanel` as this codebase actually defines it (`selectAndRaise` + clear-dormant + `registry.wake`, with no `centreOn` anywhere in it) fails BOTH clauses at once — it never frames — but that is a coincidence of what `onSelectPanel` happens to do today, not a property either half relies on. 85 is the other side: "never wakes" is satisfied just as well by a rail that CANNOT wake, an arrow rendered and inert beside a dormant panel it can never start. 86 reads three facts in one wait — the row is gone, the `.panel` is gone, and `__m4aSessions` no longer holds it — because each alone passes against a different wrong close; note that its session clause is weaker under the DIRECT backend, where the 84/85 reload leaves that panel dormant with no session to lose, and the weight there is carried by the row and the `.panel` both going. The count is 99 while the last number is 86, because of the lettered sub-checks `7b`, `33b`, `38b`, `40a`, `49b`, `49c`, `49d`, `49e`, `70b`, `72b`, `72c`, `75b` and `75c` |

None need a display; the real-Electron ones open a window with `show: false`. There is no
test-name filter in any of them — each runs everything and exits non-zero on any failure.
To add a check, append an `ok(...)` assertion in the IIFE.

**Why the Electron binary and not `node`.** `node-pty` is a native module compiled against
Electron's ABI by the `postinstall` `electron-rebuild`, so it will not load under system
Node. `verify:pty` and `verify:pty-manager` therefore run under Electron with
`ELECTRON_RUN_AS_NODE=1`; `verify:window`, `verify:ipc`, `verify:canvas`, `verify:xterm`, and
`verify:panels` need the real app lifecycle and `unset` it instead. `verify:viewport`,
`verify:registry`, `verify:layout`, `verify:palette`, `verify:rail`, `verify:tmux`, and
`verify:agent-state` are plain node, because
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
whatsoever, unlike every other suite in this list. `renderer/shell/rail-rows.ts` qualifies
the same way, and is the cheapest case on this list to state: it imports neither
`electron` nor `node-pty`, touches no DOM, and its only two imports are `import type`,
which esbuild erases before the bundle is ever built. `main/agent-state.ts` qualifies the same way
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
renderer --invoke--> agent:acknowledge                                         --> main
renderer --invoke--> workspace:list / workspace:create / workspace:rename      --> main
renderer --invoke--> workspace:delete / workspace:activate                     --> main
renderer <--send---  pty:data (batched ~16ms) / pty:exit                       <-- main
main     --send-->   edit:copy / edit:paste / edit:undo / edit:redo            --> renderer
main     --send-->   canvas:counts / canvas:reset                              --> renderer
main     --send-->   preset:spawn / preset:default / preset:capture            --> renderer
main     --send-->   agent:state                                               --> renderer
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
`lod.ts`. `dispose(id)` itself now has four call sites in `Canvas.tsx` — the
close button, undo/redo removing a panel, the reset handler, and, since M7, workspace delete —
and every one of them keeps the `pty.kill` count at two precisely because it routes through
`dispose(id)` instead of calling `pty.kill` directly; see "Undo removing a panel must dispose
its session" below for the call-site history. M7 also widened WHEN `dispose(id)` sends that
`pty.kill` — see "`dispose(id)` sends `pty.kill` even when this renderer holds no local session
for that id" below, the same shape as this section's own `session.spawned` story, one hop
further out.

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

**Undo removing a panel must dispose its session.** `registry.dispose` has **four call sites
in `Canvas.tsx`** — the close button (`onClosePanel`), undo/redo removing a panel
(`applyHistory`), the reset handler (`onReset`, dropping every panel at once), and, since M7,
workspace delete (dropping one doomed workspace's panels). This is a
count worth re-deriving from the code rather than trusting a stale number: it was two until
the reset handler arrived in a later task and this line did not get updated alongside it — the
exact failure this note exists to prevent happening again. None of the four adds a caller of
`pty.kill`: `dispose(id)` and `disposeAll()` remain the only two inside `session-registry.ts`,
and routing all four through `dispose()` rather than calling `pty.kill` directly is exactly
what keeps that count true. Without the undo/redo call site, `Cmd+N` then `Cmd+Z` leaked a live
process with no panel left to close it. Re-derived again at the end of M5b (`grep -n
"registry.dispose" src/renderer/canvas/Canvas.tsx`): still three at the time. The palette's "Reset canvas…"
row added no fourth — it invokes `canvas:request-reset` and main answers with the same
`canvas:reset` event the menu item sends, so it lands in `onReset`, the call site that already
existed. Re-derived again for M7 (same grep, current lines 330, 602, 997, 1825): now four, and
the fourth one is deliberately not a fifth `pty.kill` caller either, for a reason worth stating
plainly because it is easy to get backwards — a workspace's record is about to be deleted
entirely, so a surviving session there is one no UI can ever reach or stop again (there is no
"recover an orphan session" feature — `docs/ideas-backlog.md` #61 — to fall back on), which
makes disposing the RIGHT call even though "demote, not dispose" is the rule for every other
workspace-switch path in this milestone. Re-derived again for M8b (same grep, current lines
340, 614, 1031, 1904): still four, unmoved in count — the panel outline reads panels and status
through `railRows`/`useAgentState`, never through the registry, so it added no fifth call site
of its own; only the LINE NUMBERS drifted, from earlier tasks' insertions above them in the
file.

**`dispose(id)` sends `pty.kill` even when this renderer holds no local session for that id
(`session-registry.ts`).** This is the same class of hazard as the `session.spawned` guard
described in "Two lifetimes, not one" above, one hop further out. That guard used to skip
`pty.kill` for a panel that had never spawned — free under `node-pty`, a leak under tmux, where
a never-spawned panel can still own a surviving session. M7 hits the identical shape from a new
direction: after a `Cmd+R` reload, boot reconciles only the ACTIVE workspace's panels (see
"Dormancy is about spawning, not attaching"), so a HIDDEN workspace's panel ids are simply
absent from the fresh registry — `sessions.get(id)` returns `undefined` for every one of them.
The old `if (!session) return` fired there, and deleting that hidden workspace disposed nothing:
its tmux sessions all survived with no record left pointing at them, burning tokens with no UI
able to reach them ever again. The fix mirrors main's own `PtyManager.kill`, which already
reaches `backend.destroy(panelId)` for an id it holds no local session for (`verify:pty-manager`
14c) — this is the renderer-side half of that same rule, not a second one. The cost when there
genuinely is nothing on either side is one wasted IPC round trip; `dispose(id)`'s local half
(disposing the xterm handle, deleting the map entry) still only runs `if (session)`, so a call
with nothing local to clean up does not throw.

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
(`verify-viewport.cjs`, `verify-registry.cjs`, `verify-layout.cjs`, `verify-palette.cjs`,
`verify-rail.cjs`).**
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
until the day it broke. `verify-rail.cjs` is the SECOND bundle in that state:
`rail-rows.ts`'s two imports are both `import type` and are erased before bundling, so
nothing in it resolves `@shared` today either — and `scripts/verify-rail.cjs` cites this
very entry as its reason for carrying the alias anyway, which is why the entry has to
keep naming it back.

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
QUERY or the SCOPE changed; on any other change the selection follows its command by **id** (an
arriving list can grow rows above it) and falls back only when that command is gone or has
become unrunnable. **The fallback is `bestMatchIndex`, not `firstRunnable`** — M6p made rows
section-ordered, so "the first runnable row" is the top of Panels regardless of what was typed;
see "Sections are data" below, whose last paragraph is the authority on this. (This paragraph
said "only when the QUERY changed" and named `firstRunnable` for two milestones after both
stopped being true, which is worth knowing as a caution about the rest of this file: the
counts in the verify table are re-derived from real output, but the prose is not.) (2)
`panelRows` tracked `panels`, which is a fresh array on every
`setPanelRect` — i.e. every frame of a drag — so a drag behind an open palette re-seated the
selection at 60Hz; it is keyed on `palette.open` and read out of `panelsRef` instead, the same
mirror-into-a-ref move `focusedIdRef` makes. (3) `resetViewport` and `centreOn` must stay
`useCallback`s for the same reason, which has its own note above. Separately, the selected `<li>`
carries a ref and `scrollIntoView({ block: 'nearest' })` runs when the index moves: `.palette__list`
is `max-height: 46vh; overflow-y: auto` and the list is long by construction — four rows per
preset, one per panel, two per prompt — so without it `stepRunnable` walks happily past the
visible window and `Enter` runs a command the user cannot see.

**Hover is the fourth way the selection moves, and it needs two guards to keep
the sentence above true (`Palette.tsx`'s `lastPointerRef`/`pointerSelectRef`).**
Hovering a row sets the same `index` the arrow keys set, rather than painting a
parallel `--hover` class: `.palette__row--selected` is the only thing telling
the user what `Enter` will run, and two highlights on screen at once is a
question rather than an answer. That makes the pointer a first-class way to move
the selection — which is fine, a hover IS the user moving it — but it closes a
loop with `scrollIntoView` that fails in both directions and is silent in both:

1. **Hover → scroll.** A partly-visible row at the list edge, hovered, would
   scroll itself fully into view and shift every other row out from under a
   cursor that never moved. `pointerSelectRef` suppresses exactly one
   `scrollIntoView` after a pointer-driven index change — a row under the cursor
   is by definition already on screen, so there is nothing to scroll toward.
2. **Scroll → hover.** Blink re-dispatches a `mousemove` at the **unchanged**
   cursor position after a scroll, to refresh `:hover` state. So a keyboard
   ArrowDown that scrolls the list "hovers" whichever row slid under a
   stationary cursor and drags the selection straight back — the arrow keys stop
   working whenever the pointer happens to be resting over the list, which is
   most of the time. `lastPointerRef` compares `clientX`/`clientY` against the
   previous move and ignores an identical pair; that comparison is the ONLY
   thing separating the synthetic from a real one, which is why the handler is
   `onMouseMove` and not `onMouseEnter` (the synthetic fires for either).

Disabled rows do not take the hover, for the same reason `stepRunnable` skips
them for the arrow keys: a selection `Enter` cannot act on is a dead key.
`.palette__row` also moved from `cursor: default` to `cursor: pointer`, with
`.palette__row--disabled` putting it back — a pointer cursor over a row that
takes neither the hover nor a click promises both. `verify:panels` 72/72b/72c,
and 72c is the one that has ever caught anything: 72 and 72b both stay green
against an implementation with no coordinate guard at all.

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
and `Cmd+1` already exists for "fit everything". M7 adds a **fourth** narrow verb,
`restoreCamera(camera)`, for a workspace switch — and it is the one exception to "deliberately
does not change the scale": a workspace's saved zoom level is part of what it means to come back
to it, so `restoreCamera` sets `x`, `y` AND `scale` exactly (`verify:viewport` 73). Like
`resetViewport` and `centreOn`, it must stay a `useCallback` for the identical reason the next
entry gives.

**`resetViewport` must stay a `useCallback` (`useViewport.ts`).** Referential stability here is
load-bearing, not tidiness. A fresh arrow per render propagates straight through `Canvas.tsx`'s
`useMemo([resetViewport, ...])` for `paletteActions`, into `Palette.tsx`'s `commands` memo,
whose `[rows]` effect **re-seats the selected row**. `Canvas` re-renders on every mousemove over
`.canvas` (`setCursor`), so an unstable identity means: arrow down three times, nudge the mouse,
press Enter — and the wrong command runs. Nothing throws, nothing logs, and the selection looks
correct in a screenshot. `centreOn` and, since M7, `restoreCamera` both sit in the same dep
arrays for the same reason — `restoreCamera` is one of `switchWorkspace`'s own dependencies.

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

**Changing `SECTIONS` means running `verify:panels` too, not just
`verify:palette`.** `verify:panels` check 48 restates `SECTIONS`' order as its
own hardcoded `ORDER` array, in the same fixed-list-that-must-move-with-the-
source-of-truth shape check 30 above was rewritten to stop doing — kept
restated rather than importing `palette-model.ts` because this suite loads
the BUILT renderer rather than bundling it, and reaching the real `SECTIONS`
value here would mean adding plumbing. M7's Task 4 added `'workspace'` to
`SECTIONS` and ran only `verify:palette`, which is a plain-node suite with no
`ORDER` array to go stale — it stayed green while `verify:panels` 48 sat red
for two whole tasks with nobody noticing, because nothing prompted running
the Electron tier for a change that "was just a palette thing." The
staleness compounded: `'Settings'` had ALSO been missing from `ORDER` since
M6b, silently harmless until then only because every settings row is
`hiddenAtRest` and nothing unconditional renders that header at rest — M7's
new always-visible "New workspace…" row (no `hiddenAtRest`) was what finally
made a missing header observable. **The rule going forward: a task that edits
`SECTIONS` runs `verify:panels`, not only `verify:palette`, before calling
itself done** — the two suites check the same fact from different processes
and only one of them can see the DOM.

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

**The drill-in arrows are caret-gated, and the gate is the load-bearing half
(`Palette.tsx`'s `ArrowRight`/`ArrowLeft` cases).** They are the horizontal
spelling of the two moves above — right opens the door under the selection
(through `runRow`, so there is still exactly one place that decides what
opening a door means), left pops back — and both act only from the boundary of
the query: right from the caret at the END, left from position 0, and neither
from a non-collapsed selection, which is a user selecting text rather than
navigating. Removing the gate looks like a simplification and is not:
`.palette__input` is the only text field in this app the user cannot tab out
of (`Tab` is an exit, see "Who owns the keyboard"), so arrows that always
navigated would leave a typed query permanently uneditable, with no key left
that can move the caret back into it. It is the same boundary rule `Backspace`
already obeys one line up, expressed as a caret position instead of an empty
string because — unlike Backspace — there IS a sensible mid-query press to
defer to. ArrowRight also never RUNS a row, only opens a door: `Enter` stays
the single key that runs things, so a stray arrow can neither spawn a panel
nor reach a destructive row's confirm. `verify:panels` 49b and 49c, and 49b
alone would pass against the ungated version.

**Popping a drill-in returns the selection to its door
(`palette-model.ts`'s `doorIndex`, `Palette.tsx`'s re-seat effect).** Coming
back out of a scope was a one-way trip: the re-seat effect treats a scope
change as a reason to re-seed from `bestMatchIndex`, and it cannot tell
entering from leaving, because both are `prevScopeRef.current !== scope`. A
pop leaves an EMPTY query behind — `runRow` cleared it on the way in — so
every fuzzy score ties at 0, `bestMatchIndex` degenerates to `firstRunnable`,
and the highlight lands on the first row of the first section. The user walks
through `Manage settings…`, presses `ArrowLeft`, and is somewhere in Panels
with `Enter` pointed at a command they never chose: the exact defect "The
palette's selection moves only when the user moves it" exists to prevent,
arriving through a fourth door that entry did not list.

The effect's own follow-by-id arm cannot cover it, and that is the part worth
knowing before "simplifying" the fix away. Even with the scope clause removed
from the re-seat condition, the row selected INSIDE the scope is a setting row
carrying `hiddenAtRest`, so `filterCommands` drops it from the resting list,
`findIndex` returns -1, and the fallback runs anyway. **The fix has to anchor
on the door actively, not merely stop discarding the selection.**

`doorIndex` derives that anchor from `entersScope` rather than remembering the
entered row's id in a ref, and the difference is observable rather than
stylistic: M8a's top-bar gear opens the palette straight into the settings
scope with no door ever traversed, so a ref has nothing to restore and the
same pop lands wrong again. One rule covers both. `verify:panels` 49e is the
only check that separates the two implementations — 49d passes against either.

Three things about the branch read as bugs unless the comment is left alone.
`scope === null` in its guard is technically redundant (doors carry no `scope`,
so a scope-to-scope move finds nothing anyway) and states the direction. A pop
with a LIVE query is deliberately a no-op: `Escape` and `ArrowLeft` both leave
the query alone, so `del` typed inside Presets finds no door and correctly
falls through — a query the user is still holding outranks the door they left,
and `Backspace` is gated on an empty query so it always gets the door. And the
branch fires inertly on the input-mode round trip, where `closePalette()` then
`openPalette()` batch to "still open, scope now null" with no unmount; nothing
reads the index there, because the list is not rendered while `inputMode` is
set. The `disabledReason` filter inside `doorIndex` is load-bearing for a
reason of its own: `prompt:list` re-fires while the palette is open, so the
prompts door can go disabled UNDER a user already inside its scope, and
seeding the selection onto it makes `Enter` a dead key.

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

**Under tmux, `PtyManager` never sees the agent's own OSC title, and the trap is
unreachable there (`main/agent-state.ts`, `main/tmux-args.ts`'s `buildTmuxConf`).** Under
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
backend is real and shipped; the stream under tmux **may** still carry OSC and
DCS that **tmux itself** emits (more on this below — and it is the weakest of
the three grounds, deliberately hedged: `buildTmuxConf` sets `prefix None` and
leaves `mouse` off, so tmux's own copy path — the thing that would emit OSC 52
under `set-clipboard external` — is not reachable from inside this app at all,
which leaves OSC 8 hyperlink forwarding on tmux ≥ 3.4 as the only likely
instance, and that too is unmeasured); and it is a small, pure module that
costs the cheapest verify tier the repo has.

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

**The jump key does not acknowledge, and `wants-you` outranks selection
(`Canvas.tsx`'s `onJumpAttention`, `styles.css`).** `Cmd+J` is `centreOn` +
`selectAndRaise` and nothing else — no wake, no focus, no `agent:acknowledge`
— so focus stays the renderer's single acknowledgement trigger and main stays
the only author of the state (see "`wants-you` is sticky, and who clears it is
asymmetric" above). That leaves a landed-on panel still in `wants-you`, which
collides with the rule `.panel--selected` used to obey unconditionally:
before M6d it was declared AFTER every `.panel--agent-*` rule and always won,
because selection is where the user is — so jumping to a waiting panel would
have hidden its amber border the instant it arrived, with nothing telling the
user why they were sent there, and the panel staying in the attention set for
the next press to land on again. `.panel--selected.panel--agent-wants-you` now
paints amber instead of blue, and it is the ONLY one of the five agent states
that outranks selection this way — the other four are not asking for
anything, so selection still wins there. `verify:panels` 62 reads the rendered
border COLOUR for this, not the underlying state, because the failure this
guards against is purely visual: main can hold `wants-you` correctly while the
screen shows blue, and a check that only asked "is the state still
`wants-you`" would pass against that regression. This entry used to be a
hazard flagged for whoever built the jump key; M6d is that milestone, and this
is the answer it landed on.

**`starting` is sent directly, and the killed exit is not sent at all
(`pty-manager.ts`'s `create` and `onExit`).** Two exceptions to "applyEvent
sends on a change", and each exists because the general rule gets that one case
exactly backwards. `initialDetector` is BORN in `starting`, so nothing ever
*enters* it and a change-gated send would never emit it — the state would be
designed, styled (`.panel--agent-starting`, `.panel__card--agent-starting`),
documented in the README, and unreachable on the wire, which is the whole
window that matters: a real `claude` takes seconds to boot and that silence is
exactly when a user wants to see something happening. `create` therefore sends
it directly, once, after the session is in the map. At the other end, the
`exit` event's SEND obeys the same `session.killed` guard `PTY_EXIT` does: an
exit we asked for lands milliseconds after `kill()` returned, by which time the
renderer has already run `clearAgentState(id)` at its dispose site, so an
unguarded `'exited'` RE-ADDS the entry after the cleanup — the map then grows
for the life of the renderer and a recycled id inherits a dead panel's border,
the failure `clearAgentState`'s own comment claims to prevent. The recycled id
is reachable: `onReset` disposes everything and installs `firstRunPanels()`,
whose id is the constant `FIRST_RUN_ID`. Only the send is guarded — the
TRANSITION still runs (`applyEvent`'s `mute` parameter, whose one caller this
is), because `onExit`'s closure keeps the session object alive after the map
entry is gone and a detector stranded in `busy` there could still emit for a
panel nobody can see; `'exited'` being terminal is what makes that safe.

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

**M6d added no IPC channel (`agent-state-store.ts`).** `verify:ipc` stays at
20. The attention set — which panels are `wants-you` right now — is derived
entirely on the renderer side from `agent:state` messages that were already
arriving for M6c's border colour; nothing new crosses the process boundary to
compute it. This is worth writing down because it is exactly the kind of fact
a later reader reinvents a channel for: "which panels want attention" sounds
like a main-owned query, and main genuinely does own the underlying state
(see "`wants-you` is sticky, and who clears it is asymmetric" above) — but the
renderer already receives every transition that matters, and a second channel
asking main to recompute a set it could instead fold from messages already in
hand would be a second author of a fact one side already derives correctly.
M7 hits the identical door and declines it again, for the same reason spelled
out at `WORKSPACE_LIST`'s own doc comment in `ipc-contract.ts`: a workspace row
carrying a waiting COUNT (`verify:palette` 64) sounds like it needs main to
intersect "this workspace's panelIds" against "the wants-you set" itself, but
`WORKSPACE_LIST` already returns `panelIds` and the renderer already holds the
attention set from the mechanism above — `commands.ts` intersects the two
locally. Five workspace channels were added this milestone and every one of
them is a CRUD invoke; none is an attention query, on purpose. One consequence
of deriving the set entirely from messages already in hand, pre-existing since
M6c and not an M7 regression: waiting counts do not survive a renderer
reload. `applyEvent` sends `agent:state` only on a CHANGE, and nothing
re-emits the current state of every session to a freshly loaded renderer, so
after `Cmd+R` every workspace row reads zero waiting until the next real
transition happens to occur. This belongs beside the paragraph above
precisely because the obvious fix — an `agent:state-snapshot` channel sent on
load — is the kind of thing that paragraph's own reasoning argues against
adding without first checking whether the renderer can derive the answer some
other way.

**The attention set is a second subscription, not a second store
(`agent-state-store.ts`).** `useAgentState(id)` already answers "what is this
one panel doing"; a naive "who wants me" implementation would have every panel
subscribe to every other panel's state just to filter for `wants-you`, the
same fan-out `version()` exists to keep off the per-panel subscriptions in the
first place. `syncAttention` instead maintains one membership-only `Set` and
notifies only when a panel enters or leaves it — a busy/idle transition on a
chatty agent runs through `applyAgentState` constantly and must never reach
here, or the pip layer would re-render at flush rate for pips that didn't
move. `useAttentionIds` and `attentionIds()` both read a **cached array**
(`attentionSnapshot`), never rebuilt per call: `useSyncExternalStore` compares
snapshots by identity, so returning `[...wanting]` fresh on every read would
make React believe the store changes every render and loop. The array is
rebuilt exactly once, inside `syncAttention`, the same instant membership
actually changes.

**The pips are outside `.world`, and measure themselves
(`EdgeIndicators.tsx`).** "One transform, not N layouts" (above) already
established why panels never reflow under zoom; the same transform would be
exactly wrong for an edge indicator, whose entire job is to stay pinned to the
viewport's physical edge regardless of pan or zoom. Mounting `EdgeIndicators`
inside `.world` would make every pip zoom and pan away with the panel it
points at — the opposite of an off-screen indicator. It is chrome, a sibling
of `.world`, and it owns its own `ResizeObserver` rather than reading a size
out of `Canvas` state: `Canvas` holds no window size today because every
existing consumer measures at event time, and adding one to satisfy this layer
would re-render every panel on every resize frame — the 60Hz cascade
`TerminalPanel`'s `memo` and `version()` both exist to block. The observer
therefore lives in the layer that alone needs the number, and a resize
re-renders only the pips.

**`edgeIndicator` clips a ray, it does not clamp two axes (`viewport.ts`).**
The shorthand that looks equivalent — clamp `dx` to the box's half-width and
`dy` to its half-height independently — corners every diagonal: a panel
anywhere in the upper-right quadrant clamps to the same top-right corner
regardless of whether it is barely northeast or almost due east, so direction
stops carrying information while every pip still renders and still looks
functional. The actual computation finds the smaller of the two per-axis
parametric crossings (`tx`, `ty`) and scales the whole ray by that one `t`,
which is what keeps the pip's angle equal to the true bearing at every point
except the corners themselves. `verify:viewport` 62 is the check that fails
against the clamp shorthand; `verify:panels` 58 is the same property end to
end, and it asserts the pip's exact position for the same reason — a check
that only asked "does a pip render" cannot distinguish the two
implementations, since the clamp shorthand still renders one.

**Partially visible counts as visible (`viewport.ts`'s `edgeIndicator`).** The
overlap test that gates the whole function returns `null` — no pip — the
moment any part of the panel's rect intersects the viewport, not only when the
whole rect fits inside it. A pip aimed at a panel the user can already see,
even at its edge, is a false alarm on the one surface in this app whose entire
value proposition is being believed on sight; a user who learns the arrows lie
stops glancing at them. `verify:viewport` 57 pins a panel straddling the
boundary getting no pip, distinct from 56's fully-on-screen case and from the
fully-off-screen cases 58–61 pin the geometry of.

**`Cmd+J` is not in `REPEATABLE_KEYS`.** See "Auto-repeat is one gesture, not
fifteen" above — the same reasoning applies here: a held `Cmd+J` would step the
attention cursor through the whole waiting queue at the OS repeat rate rather
than moving once per press, landing wherever the repeat stream happened to
stop rather than where the user meant to look.

**A workspace switch is a second boot (`Canvas.tsx`'s `switchWorkspace`).**
Everything derived from the starting state is RE-DERIVED, never carried: the
id counter (seeded from `ActivateResult.allPanelIds`, which spans every
workspace — see "Panel ids are global, not per-workspace" below), the undo
stack (cleared outright — see below), the camera, and the selection. What is
deliberately NOT touched is the registry — unmounting the outgoing panels
calls `detachSlot`, which disposes the WebGL addon and pulls the host out of
the DOM while the `PanelSession`, its PTY and its tmux session stay exactly
where they are. This is "two lifetimes, not one" (above) paying out at the
scale of a whole canvas instead of one culled panel, and it is why
`switchWorkspace` contains no `registry.dispose` call anywhere — `verify:panels`
64 is the check that fails first if one creeps in, and it is the one no
cheaper tier can catch, because only a real registry holding a real pid can
tell a demoted session apart from a respawned one that merely looks the same.

The ordering inside the function is the other load-bearing half, and it is
easy to get backwards in a way that fails completely silently. `pty.list()`
must be AWAITED **before** the incoming panels are committed, with
`dormantIds` computed and set in the *same synchronous batch* as `setPanels` —
mirroring the reason `renderer/main.tsx`'s `boot()` awaits `pty:list` before
its first `render()` at all (see "Dormancy is about spawning, not attaching").
An earlier draft committed the incoming panels first and corrected
`dormantIds` afterward, once a second, independent `pty:list` promise
resolved. That is wrong even though it looks like the same rule applied a
moment later: the tiering memo's `registry.ensure(id, spec, { dormant:
dormantIds.has(id) })` runs on the FIRST render of the incoming panels, and
`ensure` early-returns for a session that already exists — so a `dormantIds`
correction arriving even one render late can never repair a session that was
already created non-dormant. `lod.ts` then promotes the panel because
`dormantIds` does not (yet) contain it, and the registry's own dormancy guard
passes because `session.dormant` is already `false` — both dormancy layers
agree, for the wrong reason, and `attachSlot` spawns. Restoring `focusedId`
makes it worse, since `assignTiers` pins the focused panel live
unconditionally. The result was up to `LIVE_BUDGET` agent CLIs launched by a
workspace switch with no user gesture — exactly what "dormant until clicked"
exists to prevent, and it happened silently because every check that only
switches between ALREADY-rendered workspaces (this milestone has several) has
a settled session for every panel involved before the switch even starts, so
`dormantIds` being briefly wrong on the wrong render is invisible against that
fixture. `verify:panels` 68 is built specifically against a workspace this
renderer has never rendered before, seeded on disk with a persisted
`focusedId`, for exactly that reason.

**`activateWorkspace` takes the outgoing canvas, and that parameter IS the
mechanism (`main/layout-store.ts`).** `save()` merges into whichever workspace
is active *when it runs*, on a 500ms coalescing debounce — so a switch that
merely flipped `activeWorkspaceId` and let the next coalesced save land
wherever it landed would write workspace A's panels into workspace B's
on-disk record. The file stays perfectly well-formed; only the CONTENTS are
wrong, discovered launches later with nothing in any log pointing at the
switch that caused it. `activateWorkspace(id, outgoing)` closes that gap by
making the switch itself the last save: it writes `outgoing` into
`activeWorkspace()` — still the OLD workspace at that point in the function —
*before* flipping `snapshot.activeWorkspaceId`, so there is no window in which
a stray debounced write can land on the wrong record. `verify:layout` 89 pins
the ordering directly: activate writes the outgoing state into the OLD
record, not the new one. The same hazard resurfaces one layer up, in
`Canvas.tsx`'s workspace delete: deleting the ACTIVE workspace must call
`switchWorkspace` *before* `workspace.remove`, never after, because main's own
`remove()` reassigns `activeWorkspaceId` to a neighbour the instant the record
is gone — an `activate()` issued afterward would write the just-deleted
workspace's own stale, already-disposed panels into whatever main just made
active, resurrecting them there. `verify:panels` 71 is the only-workspace
variant of the same check: the replacement workspace is created and switched
to *before* the dispose loop runs, for the identical reason.

**A workspace switch is a second boot, but not in preference semantics
(`main/layout-store.ts`'s `doSave`/`doInitial`, `activateWorkspace`).** "A
workspace switch is a second boot" (above) is true of ORDERING — awaiting
`pty.list()` before committing panels mirrors `boot()` exactly — but it does
not extend to the three `restore.*` preferences. Those answer "what should
the app show me when it STARTS" (`restore.layout`'s own schema description
says so), and a switch is not a start. The first cut of `activateWorkspace`
called the same `doSave`/`doInitial` the launch path calls, restore settings
and all, which meant `restore.layout` set to OFF turned Cmd+K workspace
switching into a silent canvas shredder: `doSave` skipped `w.panels = …` on
the way OUT, so the workspace being left never recorded the panels it had —
their tmux sessions kept running, reachable from no workspace, the exact
orphan outcome the delete design rejects — and `doInitial` returned
`panels: []` on the way IN, so the workspace being entered read empty
regardless of what it held on disk. Both functions now take an
`applyRestoreSettings` flag, defaulting to `true` so the public `save()`/
`initial()` members and every existing caller are unaffected; `activateWorkspace`
passes `false` to both, so the write and the read agree — passing it to only
one would either lose data on the way out or land on an empty canvas whose
panels are sitting untouched on disk. `verify:layout` 94 is the check: with
`restore.layout` off, a workspace switched away from and back to still hands
its panels back.

**Panel ids are global, not per-workspace (`Canvas.tsx`'s `nextIdRef`,
`main/layout-store.ts`'s `allPanelIds`).** `PanelId` doubles as the tmux
session name (see "`reattached` costs a probe" above and `ActivateResult`'s
own doc comment in `ipc-contract.ts`), so two panels in two different
workspaces cannot be allowed to mint the same id — the second one to go live
would attach to the FIRST one's tmux session instead of starting its own, and
neither panel would show anything visibly wrong; the user would simply be
looking at one agent's output through two panels. `nextIdRef` is therefore
seeded from `allPanelIds()`, which flat-maps every workspace's panels rather
than only the active one's, both at boot and on every `switchWorkspace` (from
`ActivateResult.allPanelIds`, re-derived rather than computed locally from
`next` alone — a workspace can be switched TO while some OTHER, hidden
workspace holds a higher id, and minting from this workspace's own panels
alone would let `Cmd+N` here collide with an id that hidden workspace already
owns). This is the M4a id-collision defect (see "`nextIdRef` seeds from the
restored ids" above) reachable again through a door M4a could not see, because
nothing before M7 made two disjoint sets of panel ids coexist in one running
app. `verify:layout` 91 asserts `allPanelIds` spans every workspace as a fact
about the pure store function; `verify:panels` 66 is the same property end to
end — a spawn in one workspace mints no id any OTHER workspace's rows already
claim.

**Deleting a workspace must switch away BEFORE it removes (`Canvas.tsx`'s
`deleteWorkspace`).** See "`activateWorkspace` takes the outgoing canvas"
above for the mechanism this collides with if the order is reversed: main's
`remove()` reassigns `activeWorkspaceId` to a neighbour the moment the doomed
record is gone, so an `activate()` call issued after `remove()` would write
the doomed workspace's own stale panels — captured before its sessions were
even disposed — into whatever main just made active, resurrecting a disposed
panel's id on a workspace the user never touched. The only-workspace case gets
the identical treatment rather than a special one: a fresh replacement
workspace is minted and switched to FIRST, exactly as though it were a
neighbour that already existed, rather than letting main's own `remove()`
install its fresh default and switching to that afterward — which is the same
mistake with the neighbour missing instead of merely stale. `verify:panels` 71
is the check that drives this branch, and it is only reachable by first
deleting every OTHER workspace through the same gated action — there is no
shortcut into "exactly one workspace left" that does not also exercise checks
69/70's confirm gate along the way.

**The shell insets the canvas, and that is only safe because nothing measures
the window (`Canvas.tsx`, `styles.css`'s `.shell`).** `useViewport`,
`Canvas.tsx` and `EdgeIndicators` all read `getBoundingClientRect()` on the
`.canvas` host at event time, and the pip layer carries its own
`ResizeObserver` precisely so `Canvas` need hold no size at all — which is why
making the canvas a grid cell several hundred pixels narrower than the window
required no coordinate change anywhere. A future `window.innerWidth` read
breaks that silently and in the direction hardest to notice: pips would aim at
the window's edge while the canvas ended 240px earlier, and every world point
the HUD reported would be off by the rail's width, with nothing throwing.
`verify:panels` 72 is the check, and the clause that discriminates is the exact
inset identity, not the loose bounds beside it — see the verify table above for
why every looser clause survives the `min-width: auto` regression.

**Two second-order effects, and the M8a review found the first draft of this
entry wrong about BOTH of them, in opposite directions.** Correcting the
record, because the wrong versions each invite a different bad "fix".

The first draft said a narrower host is a smaller cull region, so opening the
rail "legitimately demotes panels near the edge — `assignTiers` doing its
job". **It does not.** Nothing in the renderer observes the canvas host's
size: the tiering effect depends on `[rects, viewport, focusedId, version,
dormantIds]` and reads `getBoundingClientRect()` only when one of those
changes. So a collapse re-runs no tiering at all, and the tiers go **stale** —
a panel that has just been pushed outside the narrower cull region stays
`live`, and one that has just been revealed stays a card, until the next pan,
zoom, focus change or panel edit re-runs the effect. This staleness is
**pre-existing**: a window resize has always had exactly this effect. What M8a
changes is that it puts a button on it, so a user can now reach the stale
state in one click rather than by dragging a window edge. **It is deliberately
not fixed here** — that is a scope decision for a later milestone, not
something to add a `ResizeObserver` for on the way past. `verify:panels` 74
asserts nothing was demoted by a collapse, and its own comment says plainly
that the clause is near-tautological for exactly this reason and exists to
catch the future change that makes a collapse re-tier.

The first draft also said the collapse must stay a **discrete** width change
because an animated one "fires `ResizeObserver` on every frame and re-runs
tier assignment at 60Hz". Also false, and by the same mechanism: tiering
observes nothing. The renderer's ONE `ResizeObserver` is `EdgeIndicators`'s,
which observes itself and re-renders the pip layer alone. The true cost of an
animated collapse is therefore a **pip-layer re-render per frame** — real, but
far smaller, and landing in the one layer built to absorb it. That is a
weaker argument for keeping the collapse discrete, and it is the one the CSS
comment now states; the collapse stays discrete on it plus the plain fact that
a sliding frame buys nothing.

**A shell control never takes DOM focus (`shell/shell-control.ts`).** Every
control on the bar and both region toggles mount `shellControl()`, whose
`onMouseDown` calls `preventDefault()` — and that is the whole mechanism: it
stops the browser moving DOM focus to the button at all, so focus never leaves
xterm's hidden textarea and there is nothing to restore afterwards. The
alternative shape — let focus move, then blur back — has a window between the
two where a keystroke goes nowhere, and it fails exactly as silently as an
unrestored palette close (rule 4 of "Who owns the keyboard"): the button works,
and the next thing the user types vanishes. `focusedId` is the other half, and
it is **not a highlight**: `assignTiers` pins the focused panel live
unconditionally, and `focusedId` is what `Cmd+C`/`Cmd+V` and every
`capturedId`-gated palette row act on — so a shell button that cleared it would
demote the panel the user was working in and strand the clipboard, from a click
on a zoom stepper. `stopPropagation` is deliberately NOT called on mousedown:
the palette's outside-click dismissal is a capture listener on `.shell` and has
already run by then, and a shell click SHOULD dismiss an open palette.
`verify:panels` 74c asserts both halves, and its own comment records the one
thing the pair cannot distinguish — a control that swapped `focusedId` to a
different live panel while DOM focus stayed put would satisfy it.

**A boolean `SettingDef` mints a palette row nobody wrote, so whatever renders
it must re-read (`shell/useShellChrome.ts`).** Declaring `shell.railOpen` and
`shell.inspectorOpen` as ordinary booleans buys persistence, schema validation
and a palette row for free — that is the whole argument for putting them in the
`preferences` map. The free row is also the trap: main's `settings:list`
GENERATES it, so running it writes through `settings:set` and reloads
`settingRows` without touching the shell at all. A renderer that reads its copy
once at mount therefore persists the change and never moves, and because a
setting row's title renders which way the toggle currently sits, the row then
reads "Off" beside a visibly open rail — main and the renderer disagreeing,
which is exactly what "One map, and a typed view over it" exists to prevent.
`useShellChrome` takes a `settingsSignal` and re-reads on it, the same shape
`glowEnabled` and `pipsEnabled` already use. The rule generalises: **anything
that renders a setting needs a dependency on the settings reload, not just an
initial read** — M8b–M8d will add more. `verify:panels` 78 is the check, and it
is the only one covering the palette→SCREEN direction: 53 is palette→store, 74
is button→store, and both stay green against this defect.

Separately, `useShellChrome`'s two `settings.set` calls sit OUTSIDE their
`setState` updaters. An updater must be pure — StrictMode invokes it twice, and
a side effect inside one fires twice too, the hazard `Canvas.tsx`'s
`commitHistory` comment flags. `main.tsx` omits StrictMode (see "No
`StrictMode`" above), so the updater form was never actually broken; it was one
`<StrictMode>` away from writing every toggle to the store twice.

**The palette's outside-click exit is mounted on `.shell`, not `.canvas`
(`Canvas.tsx`'s `onMouseDownCapture`).** M8a made the top bar, the rail and the
inspector SIBLINGS of `.canvas`, so a listener on the canvas host never sees a
click on a shell control — the overlay would stay up, looking ready to take a
query, with DOM focus on a button and every bare key reaching the agent, and
`Escape` could not undo it because the key no longer reaches the palette's own
`onKeyDown`. That is precisely the fourth, un-audited exit "Three ways out of
the palette" exists to remove, reopened by a layout change rather than by a
keyboard one. The capture phase and the explicit `closest('.palette')`
containment test are unchanged and still load-bearing for the same reasons
recorded there — `.palette`'s own bubble-phase `stopPropagation` cannot stop an
ancestor's capture listener that has already run. `verify:panels` 42 pins the
canvas case; 73 pins the shell one, and both must stay green.

**A dispatched `MouseEvent` cannot test focus behaviour.** A synthetic event is
`isTrusted: false`, and Blink runs no default action for one — so it moves no
DOM focus whether or not a handler calls `preventDefault()`, which means the
obvious synthetic-click version of a focus check passes identically against the
regression it exists to catch (confirmed by deleting `shellControl`'s
`preventDefault` and watching the dispatched form stay green). `verify:panels`
74c therefore drives a real `webContents.sendInputEvent` mouseDown/mouseUp
pair. This is the same untrusted-event limit `verify:panels` 47 already records
from the other side: there, a synthetic `WheelEvent` performs no default
scroll, which is why 47 asserts CANCELLATION rather than `scrollTop`. One rule,
two shapes — a dispatched event can prove what a handler DID, never what the
browser would have done on its own.

**The rail is always MOUNTED, so its rows are frozen on a signature
(`shell/rail-rows.ts`, `Canvas.tsx`'s `railRows`).** `panels` is a fresh array
on every `setPanelRect` — i.e. every frame of a drag — and the palette solved
that by keying `panelRows` on `palette.open` and reading `panelsRef`, which
works only because the palette is a surface with a real closed state: when it
is shut, `Palette.tsx` is not in the tree and there is nothing to feed. The
rail has no such state to key on, and "the rail is always open" is NOT the
reason — `shell.railOpen`, `Cmd+\` and the 22px collapsed strip are all real,
and the M8a entries above describe them. The reason is that collapsing is a
CSS class: `Canvas.tsx` renders `<SideRail>` UNCONDITIONALLY, and
`.shell--rail-collapsed` narrows the region and `display: none`s `.rail-list`,
so every row stays mounted and reconciled while the user cannot see one. A
memo keyed on `chrome.railOpen` would therefore be keyed on a value that
changes nothing about what React has to build. So the rows are rebuilt on
EVERY render (cheap: N panels, no IO) and their ARRAY IDENTITY is frozen on
`railSignature`. A drag moves
rects, the signature is byte-identical, `railRows` keeps its identity, and
`memo`'d `SideRail` and `RailPanelRow` re-render nothing. The `useMemo` dep is
deliberately the signature and not `railBuilt`: when the signature is equal,
`railBuilt` is equal by construction, so returning the previous array is the
mechanism rather than a stale read. Two details fail silently if undone. The
signature is taken over the ROWS rather than their inputs, which is what makes
"covers exactly what a row renders" structurally true instead of dependent on
someone remembering to add a field. And it is `JSON.stringify` rather than a
concatenation, because a label is USER TEXT: with an ordinary separator a title
containing it could forge a field boundary, make two different lists produce
one string, and freeze the rail on stale rows — for the users whose titles
happen to contain that character and nobody else. `verify:rail` 10 and 14. One
consequence worth not reshuffling: `buildRailRows`' object literal has a
load-bearing KEY ORDER, since `JSON.stringify` preserves insertion order and
rebuilding the fields in a different order would change every signature at once.

**Agent state reaches a rail row by the row's own subscription, and no check in
`npm run verify` proves it stays that way (`shell/RailPanelRow.tsx`).** Each row
calls `useAgentState(row.id)` itself. `agent-state-store.ts` subscribes PER
PANEL ID precisely so a change for `n3` notifies only whatever asked about `n3`;
a list that subscribed once and passed each state down as a prop would re-render
every row on every panel's bell — the fan-out that module exists to refuse,
arriving through a door it could not see. It is also why agent state is
deliberately ABSENT from `RailRow` and therefore from `railSignature`: putting
it there would rebuild the whole rows array on a bell instead of re-rendering
one row.

That is the design. It is **unverified by any automated check**, and that was
established by fault injection during M8b rather than assumed. Rerouting
`RailPanelRow` to take `state` as a prop and having `SideRail` derive it from
one list-level read paints byte-identical DOM: both shapes are reactive, both
recompute on the relevant change, and no DOM snapshot can tell "one subscription
drives N re-renders" apart from "N subscriptions drive one re-render each" when
the painted values agree. `verify:panels` 83 is the closest thing and is
narrower than it reads — its `othersAreReal` clause catches an
attention-set-only derivation, which knows only "is this panel waiting" and so
collapses every non-waiting row to a single placeholder, but a list-level
subscription reading the full per-id map and passing real values down would pass
it too. The only thing that could discriminate is a render counter inside
`RailPanelRowImpl` — a side effect during render, the exact impurity
`Canvas.tsx`'s `commitHistory` comment warns against, added to production code
whose only consumer would be a check. That trade was declined. Do not read a
green 83 as proof of subscription shape; this is the same shape of gap this file
already records for the Restore submenu and for the auto-repeat checks.

**The rail navigates; only the start control wakes (`shell/RailPanelRow.tsx`,
`PaletteActions.startPanel`).** A row's body calls `goToPanel(id)` — frame,
select, raise — and never `onSelectPanel`, which clears the dormant id and calls
`registry.wake`. The obvious implementation, reuse `onSelectPanel` because it is
the app's existing "the user picked this panel" verb, spawns an agent as a side
effect of clicking a list entry; on a restored twelve-panel canvas that is
twelve CLIs launched by browsing. This is M5b's `goToPanel` rule ("Navigating
must not wake") reaching a second surface, not a new one. Note what
`onSelectPanel` is NOT, because the checks below are easy to misread otherwise:
it is `selectAndRaise` + clear-dormant + `registry.wake` and contains no
`centreOn` anywhere, so it does not frame at all — a row wired to it fails
`verify:panels` 84's CAMERA clause on its own, independently of the wake. That
is a coincidence of what `onSelectPanel` happens to do today, not a reason
either clause is redundant: the shape 84's DORMANCY clause exists for is a row
wired to CENTRE AND WAKE, which moves the camera exactly as the check expects
and looks entirely correct on screen while quietly launching a process. The wake
is still reachable, through an explicit control on dormant rows only —
`verify:panels` 85 exists because "never wakes" is satisfied just as well by a
rail that CANNOT wake, an arrow rendered and inert beside a dormant panel it can
never start.

**`closePanel` and `startPanel` are actions members with no palette rows
(`palette/commands.ts`).** The shell reaches the app only through the actions
object (the spec's rule 1), so a rail that closed over `registry.dispose` or
`registry.wake` directly would be a second implementation of a verb that
already has an authority — and `pty.kill`'s two-caller count inside
`session-registry.ts` would stop being re-derivable from one place.
`closePanel` is the `onClosePanel` the panel's own `×` already uses, which is
why M8b added no fifth `registry.dispose` call site. They deliberately emit no
`Command` rows, which is the one place M8b declines something the shell/palette
symmetry would hand it for free: both verbs already have a gesture (the panel's
own `×`; clicking the card that says "click to start"), and M6p sized the
resting list to roughly eight rows on purpose. `restartPanel` in M8c is the
verb that DOES earn a row, because it has no other gesture at all.

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
