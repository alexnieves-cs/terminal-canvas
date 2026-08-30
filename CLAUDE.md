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
running a coding-agent CLI. **M1 through M9c have landed** — the PTY layer, the canvas, their
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
| `verify:viewport` | plain node | 78 checks: `viewport.ts`'s pure canvas math (1–11b), `lod.ts`'s pure tiering (20–25), `panel-interaction.ts` + `panels.ts` drag/z math (26–34), `pointer-correct.ts` (35–39), the undo `history.ts` stack (40–45), dormancy outranking focus in `lod.ts` (46–47), `makePanel`'s spec/size arguments (48), and `centreOn` framing a rect without touching the scale (49–50). M6 adds `cascadeCentre`'s coincidence stepping (51–55) — including the half that is easiest to get subtly wrong: 51 pins that a merely OVERLAPPING panel does not move a spawn (centres, not rects), 53 walks the whole lattice rather than one step, and 54 asserts `CASCADE_EPSILON < CASCADE_STEP` as a relation, because inverting them makes every FIRST press run the lattice and land 384px off centre — a failure that surfaces in `verify:panels` 7 as a centring bug with nothing pointing at the epsilon. M6d adds `edgeIndicator` (56–65), `nextAttentionId` (66–70), and `reachableQueue` (71–72). Two of the ten are worth knowing by number: 57 pins that a PARTIALLY visible panel gets no pip — "off screen" means fully, not "mostly" — and 65 is the only check that separates a screen-space visibility test from a world-space one, a mistake that emits no pips at all once the user has zoomed in, because a rect that reads as off screen in world units can be squarely on screen once scale is applied. Check 71 drops an id absent from the known set while preserving order, and 72 asserts that a phantom at the queue head (a closed panel whose agent state survived the closure, now orphaned) does not disable the jump. M7 adds check 73: `restoreCamera` reproduces a stored `x`/`y` AND `scale` exactly — the one camera verb that DOES touch the scale, unlike `centreOn`, because a workspace's saved zoom level is part of what it means to come back to it. M9b adds the panel union's pure half (74–78). 74 is the ABSENT-kind case, and it is the one that matters on disk: `isReviewPanel` must answer false for a panel with no `kind` at all, because every panel written before this milestone is exactly that shape and a predicate that guessed the other way would render a whole saved canvas as review nodes — a canvas of terminals that never spawn, with no error anywhere. **76 is the one worth knowing by number**: `makeReviewPanel` must NOT rewrite `subject.subjectId` to the id it is minting. Every other constructor in `panels.ts` takes an id and stamps it into the object, so the copy-paste is one line and reads as consistency; it produces a node whose subject is ITSELF, which asks main to diff a panel that never spawned and renders `never-started` forever, on a node that looks entirely correct beside a panel that plainly has changes. 77 pins `reviewCentre` clearing the subject's RIGHT EDGE rather than centring on the subject — a node placed on top of the panel it reviews hides the thing being reviewed — and 78 is `cascadeCentre` inherited: a second review of one panel must not land byte-identically on the first, which is a canvas that looks like it holds one node while holding two |
| `verify:registry` | plain node | 30 assertions (the last check number is 25; see the lettered sub-checks below) against `session-registry.ts`'s lifecycle, using a fake bridge and fake terminal factory — numbered 1–25 with lettered sub-checks (`3b`, `3c`, `7b`, `7c`, `7d`), including explicit close (13–15), dormant attach/wake (16–18), and closing a never-spawned panel (19). M6a adds check 20: `PanelStatus.running` widens to carry `command`/`cwd`/`reattached`, so the header chain has something besides the spec to read for a login-shell panel. M8c adds restart in place (21–25), and the file order of those blocks is the check order — it was 21, 22, 24, 23 until the final review, which reads as a missing check to anyone scanning for 23. 21 drives the whole sequence with no renderer in sight — dispose, then `ensure` at the SAME id — and the clauses that carry weight are the ones about IDENTITY: a different `PanelSession` object with a different `SessionHandle`, because `term.open()` runs at most once ever and a reused `Terminal` is a panel that renders nothing with no error anywhere, and `dormant: false`, because an inherited dormancy leaves a restarted panel refusing to spawn, which on screen is indistinguishable from a restart that did nothing at all. 23 pins that the disposed handle is never written to again AND that the new one IS: `pty:data` arrives on ONE subscription for the whole canvas, keyed by panel id, so a restart that left the old handle reachable routes the NEW process's output into a disposed terminal — a restarted panel that stays blank while its agent runs perfectly well. The positive half is why the old handle's state is captured BEFORE the second `ensure`: the fake factory keys `made` by panel id and overwrites the entry on a second `create(id)`, so the two are only distinguishable if the first is held across the restart. It was added at the final review, which found the check closing on `registry.get('p1').handle !== undefined` — a clause that asserts nothing, since `ensure` cannot return a session without one, while the title promised a positive that was never checked. 24 is `bumpVersion`, and its "and nothing else" half is the whole check — see "`bumpVersion()` exists because `ensure()` deliberately does not bump" below. **22 is the one worth knowing by number**: `dispose` must RESOLVE only after main has confirmed the kill, and it is the only thing in the repo that would ever notice. 21 and 23 both pass today against a `dispose` that fires the kill and returns immediately, because `await undefined` resolves at once and truthfully; 22 makes the fake `kill` deliberately SLOW and flips a flag inside it, which is what separates "the promise resolved" from "the kill finished". See "`dispose(id)` returns its kill" below for the hazard that ordering exists against. **25 is the one the final review added**, and it is 24's shape guarding the other half of the same trap: `touch` advances `version()`, notifies once, RAISES `lastFocusedAt` — and leaves the handle's `focused` flag alone. `assignTiers` fills its `LIVE_BUDGET` slots in `lastFocusedAt` order and `ensure` mints a session at 0, so without the stamp a restarted panel joins at the back of the eviction queue and, on a canvas already at budget, is killed and never respawned. The clause that discriminates is `focused` staying false while the panel is LIVE: `focus(id)` would satisfy every other clause, and it moves the keyboard — so the check asserts on a live session, since `focus()` moves nothing on a card and the clause would be vacuous there. Fault-injected both ways (a `touch` that focuses, and a `touch` that only bumps) |
| `verify:layout` | plain node | 112 checks (the last check number is 108; see the lettered sub-checks below): `shared/layout-schema.ts`'s on-disk format validation and `layout-store.ts`'s coalescing, atomic write, and settings resolution, plus `shared/layout-schema.ts`'s preset parsing (27–34), `layout-store.ts`'s preset accessors (35), and `main/presets.ts`'s pure helpers (36–40), and a `presets` key that is present but not an array warning rather than vanishing (41). M5b adds the preset mutations the palette drives — rename, delete, and the default falling back when the default itself is deleted (42–46) — `parsePrompts` and the store's prompt members (47–52), and `main/prompts.ts`'s project-prompt reading, its two caps, and the never-deduping merge (53–57). M6a adds `Panel.title` round-tripping through `layout-adapt.ts` — parsed in on the way from disk (58), written back out on the way to disk (59), and an untitled panel writing no `title` key at all rather than a saved absent-marker (60). M6b adds `shared/settings-schema.ts` and its `preferences` map: the three restore ids and `settingsInCategory`'s query (61), an unset id resolving to the schema default (62), id uniqueness and every def carrying a label/description/keyword (63–64), `parsePreferences`'s absent-vs-malformed split — no key at all warns nothing (65), a non-object warns and is replaced (66) — an unknown id dropped with a warning rather than carried forward as a permanent typo (67), a wrong-typed value dropped and warned rather than coerced (68), the pre-M6b `settings`→`preferences` migration seeding only the three restore ids and only when a legacy key was actually present (69), a fresh store answering the schema defaults with an empty map (70), a preference surviving a write and a reopen (71), `setPreference` refusing an id the schema does not declare (72) and, now that `SettingDef['type']` is honest about what `typeof` returns, refusing a known id given a wrong-typed value too (72b), `settings()`/`setSetting()` proven a VIEW over the same map rather than a second store by writing through one accessor and reading through the other (73), and the Restore submenu's own query returning exactly the three restore ids (74) — see "One map, and a typed view over it" and "The Restore submenu is derived, not listed" below, including what check 74 does **not** prove. M6c adds the three `agent.*` settings: all three declared with the required label/description/keywords (75), `agent.idleAfterMs` typed as a `number` def rather than the schema's usual boolean (76), an unset threshold resolving to its schema default (77), a boolean value refused for a number setting (78), an out-of-range threshold refused on both ends while the bounds THEMSELVES are accepted (79), a number preference round-tripping through a write and a reopen (80), and a hand-edited, out-of-range `agent.idleAfterMs` loaded from disk dropped and warned rather than silently carried into the map (80b) — the load-path half of the same bound the write path already enforces; see "`agent.idleAfterMs` is bounded, and both ends fail silently" below. M6d adds check 81: `agent.edgeIndicators` is declared with the required label/description/keywords and round-trips through a write and a reopen — the fourth `agent.*` setting, and the only one of the four that is a plain boolean with nothing else to pin. M7 adds workspace CRUD and the switch transaction (82–93): a fresh store has exactly one active workspace (82), `createWorkspace` mints a valid id without activating it (83), `panelIds` reports only that workspace's own panels (84), rename round-trips and an unknown id is `false` (85), deleting a non-active workspace leaves the active one alone (86), deleting the ACTIVE workspace activates a neighbour (87), and 88 is never-zero as a WRITE-path guarantee: `parseLayout` promises at least one workspace only on load, and `deleteWorkspace` is the write path that has to promise it again — delete the last workspace and a fresh one is installed rather than leaving the array empty for `activeWorkspace()`'s "unreachable from a parsed file" repair branch to paper over silently. 89 is the save race: `activate` writes the OUTGOING canvas into the OLD record before flipping `activeWorkspaceId`, and the ordering is the entire mechanism — flip first and a switch that merely changed the id would write workspace A's panels into workspace B's file record, well-formed and wrong, with nothing in any log until a later launch shows the wrong panels. 90 asserts the returned state is the INCOMING workspace's own, not the one just written. 91 asserts `allPanelIds` spans every workspace, not just the active one — `PanelId` doubles as a tmux session name (see "Panel ids are global, not per-workspace" below), so a partial view lets two panels claim one session. 92 is activating an unknown id: null, and nothing written. 93 is the whole transaction surviving a reopen. 94 is the final-review fix: a switch must not obey `restore.layout` — that preference answers "what should the app show at launch", not "at a switch" — so with it OFF, a workspace switched away from and back to still hands its panels back rather than reading empty while they sit un-recorded on disk; see "A workspace switch is a second boot, but not in preference semantics" below. M8a adds the two shell chrome settings (95–96): `shell.railOpen` declared like every other def and round-tripping through a write and a reopen (95) — its keywords are the half that carries weight there, because a user who wants the sidebar back has no vocabulary for "rail", so `sidebar` has to be in the haystack or the switch is reachable only by someone who already knows its name — and `shell.inspectorOpen` declared, round-tripping, and **independent of the rail** (96). Independence is the only part of 96 that is not a copy of 95, and it is the part worth having: one sparse `preferences` map holds both ids, so a shared key or a def whose `id` was pasted from its neighbour produces two switches that move together — which reads as a rendering bug and is a schema one. M8c adds check 97, the shared mint: `presetFromCapture` is the ONE function both save surfaces reach — the menu's focused-panel capture and the new `preset:save-panel` invoke — so the two cannot disagree about what a saved preset is called or what id it gets, and a user cannot end up with two differently-named presets for one panel depending on which surface saved it. Its absent-command clause is asserted with `in`, never with a truthiness test: `command: undefined` is a DIFFERENT fact from the key being absent, and it is the one that survives an IPC structured clone (see "An absent `command` must stay absent" below), so a mint that spread its input would make every command-less preset spawn a hardcoded shell. The count was 99 while the last number was 97, because of the lettered sub-checks `72b` and `80b`. M9a adds `parseLayout`'s `baselines` map and `LayoutStore`'s baseline accessors (98–103), and these six are worth flagging by number rather than by name: they were written with a bare numeric label (`ok(98, …)`) instead of the descriptive string every other check in this file uses, so the console output for them prints no title at all — a style gap from whoever wrote them, left as-is here rather than renamed in a task that did not touch that file for its own reasons. 98 is the absent-vs-malformed line `parsePresets` already draws, applied to `baselines`: no key at all warns nothing and resolves to an empty map, because it is every file that predates M9a. 99 is the other half — a present but malformed `baselines` WARNS rather than silently vanishing, the same rule 41 states for `presets` — a silently dropped map is a user's whole review history gone with nothing said. 100 drops a malformed ENTRY individually (missing `sha`) while its neighbour survives, the same per-entry tolerance `parseLayout` already gives a malformed panel. 101 is a baseline surviving a write and a reopen through the real coalesced store. **102 is `baselinePeers`, and it is the check the `shared` arm's whole correctness rests on**: it must count OTHER panels sharing a root and explicitly EXCLUDE the asking panel — counting itself would make every single-panel repository read as shared, and the feature would never once produce an attributed answer, which is the opposite of quiet: it would be loudly wrong on the common case. 103 is `dropBaseline`, and it closes the same recycled-id hazard `capturedBaselineIds`/`isNotARepo` close on the `PtyManager` side one layer up: without it the map grows for the life of the install, and a panel that reuses a dead one's id inherits a repository snapshot from weeks ago rather than starting its own review history. See "The baseline is captured once, and `reattached` is why" below. M9a's final fix wave adds 103b, `baselineIds`: every panel id holding a baseline, across EVERY workspace. Its customer is the startup sweep that drops the baselines of panels whose session did not survive a quit, and the reason it spans workspaces is check 91's reason — `PanelId` is global, so a view narrowed to the active workspace would leave a hidden workspace's panel diffed against a snapshot from a previous day, which is the exact failure that sweep exists to remove. That wave also gave 98–103 descriptive labels: they carried bare numeric ones, so a failure printed `FAIL 101` and pointed nowhere while every neighbour from 92 named itself. M9b puts the panel union on disk (104–108, plus 108b). 104 is the compatibility clause and the reason `kind` is OPTIONAL rather than required: a panel with no `kind` key parses as a terminal panel, because that is what every file written before this milestone contains and a required discriminator would drop every one of them — a user's whole canvas gone, with a warning per panel and nothing recoverable. 105 round-trips a review panel with its WHOLE subject (`subjectId`, `repoRoot`, `baselineSha`, `label`), and the sha is the field that carries the milestone: a subject that came back without it is a node that can never ask its question again. 106 drops a review panel whose subject is malformed ALONE, the individual-drop rule `parseLayout` already obeys everywhere else. **107 is the asymmetry worth knowing by number**: an UNKNOWN kind is dropped with a warning, never defaulted to terminal — absent means terminal because absent is the pre-M9b file, while a present `"kind": "whiteboard"` was written by a version that knew something this one does not, and guessing terminal there spawns a PROCESS for a panel whose author never asked for one. 108 pins the two shapes' differing requirements in one read (a review panel needs no `cwd`; a terminal panel still does), and 108b pins the same union surviving `layout-adapt.ts`'s `fromPanels`/`toPanels` round trip, which is the OTHER door onto the same format and the one a schema-only check cannot see. The count is 112 while the last number is 108, because of the lettered sub-checks `72b`, `80b`, `103b` and `108b` |
| `verify:palette` | plain node | 74 checks (the last check number is 69; see the lettered sub-checks below): `fuzzy.ts`'s matching and ranking (1–7), `palette-model.ts`'s filtering, tie stability and runnable-row selection (8–18), and `commands.ts`'s list construction (19–33) — including the disabled *reasons*, which is the half worth checking: a built-in refusing rename, an unavailable preset, a prompt insert with no captured panel, and a project prompt refusing deletion all stay VISIBLE with their reason rather than disappearing from the list. M6a added the `panel.rename` row (31–32) and a titled panel being findable by its title (33). M6p adds the structure: section-first sorting outranking a better score in a later section and score still deciding inside one (34–35), `bestMatchIndex` skipping disabled rows (36–38), `hiddenAtRest` in BOTH directions (39–40), `searchText` including the whole phrase (41, 41b), `splitHighlight` (42–43), the two retitles (44–45), what is hidden versus what is not (46), exactly-two-destructive (47), `⌘N` on the default preset alone (48), and the drill-in doors and what a scope shows (49–50). **Check 30 was rewritten**: it derives its expectation from `SECTIONS` and runs through `filterCommands`, because construction order stopped being the grouping the moment sorting became section-first — see "Sections are data" below. M6b adds the `setting` section and its drill-in: a boolean setting rendering as a runnable row carrying its label and description (51), a setting findable by a keyword the row never shows (52), running a setting row toggling it to the opposite value (53), and the row's title naming which way the toggle currently sits (54) — see "Settings are a drill-in, not a flat list" below. M6c adds the `agent.idleAfterMs` number row: it renders with its current value in the title (55, 56), and stepping it begins an EDIT rather than toggling it like a boolean row (57) — a number setting is a different `run()` shape, not a boolean with extra text — and the row is hidden at rest and lives in the `settings` scope like every other setting (58), with its id recovering the full `SettingRow` (carrying `min`/`max`) rather than a bare boolean (58b). The count was 60 while the last number was 58, because of the lettered sub-checks `41b` and `58b`. **M6d added `agent.edgeIndicators` to the schema and touched nothing here** — stayed 60/60. Every setting row in the palette is generated from `SETTINGS` by main's `settings:list`, so a new boolean def needs no palette code at all, and a fixture-built check in this plain-node suite would only be re-proving that generic machinery for the Nth time, not saying anything about the new setting itself; `verify:panels` 60 is where `agent.edgeIndicators` is actually exercised, findable by keyword and toggled through to main's store. M7 adds the `workspaces` section and its drill-in (59–64): the section exists and sorts ahead of `manage` (59), the active workspace's own row is disabled with a reason rather than absent (60), workspace admin rows are hidden at rest and findable by query, the same rule every `hiddenAtRest` row already obeys (61), the workspace delete row is destructive (62), and the drill-in has a visible door plus its own rows (63). **64 is the one worth knowing by number**: a workspace's waiting count lives in `Command.waiting`, a typed field the VIEW composes into the row's title — never spliced into `searchText` or the haystack `fuzzyMatch` scans. Putting the count in the haystack would have been the easy version, and it fails silently: typing "3" to narrow down to "3 waiting" workspaces would instead match every row whose title, keywords or id happens to contain the digit, since a `Command` earns no privilege by being a count rather than a label. M8a's final fix adds `doorIndex` (65–65c), the lookup that returns a scope's DOOR row so the selection can land back on it when the user pops out of a drill-in — see "Popping a drill-in returns to its door" below. 65 asserts by ID rather than by index, for the same reason check 30 was rewritten: an index here would restate `SECTIONS`' order in a second place. **65c is the one worth knowing by number**: it pins that a door which is present but DISABLED is not returned, and it asserts both halves in one condition — the row is in the list AND `doorIndex` still answers -1 — because asserting only the -1 passes against an implementation that finds nothing merely because the row is missing, which says nothing at all about the disabled check. That case is reachable rather than hypothetical: `prompt:list` re-fires while the palette is open, so the prompts door can go disabled under a user already inside its scope. M8c adds the Restart row (66, 66b). 66 pins it present, enabled, and aimed at the CAPTURED panel rather than the focused one — the rule `panel.rename` already obeys, since opening the palette moves DOM focus to the input and deliberately leaves `focusedId` alone. 66b is the half worth having: restart is DISABLED with two DISTINCT reasons rather than absent — `REASON_NOT_STARTED` when the captured panel never spawned, `REASON_NO_FOCUS` when there is no captured panel at all. Those are two situations with two different fixes ("start this panel" versus "click a panel"), and collapsing them tells a user who HAS focused a panel to focus a panel; the third clause asserts the two constants are not the same string, and both are compared against the EXPORTED constants rather than string literals, which would keep passing while the text the user actually reads said something else entirely. Check 66 also guards `row.run()` on the row existing rather than calling it bare, which is not fussiness — see "A check that THROWS aborts the run" below: an absent row would have thrown, ended the process, and taken 66b's RED with it. M9b adds the review row and the node's own rows (67–69). 67 pins `panel.review` aimed at the CAPTURED panel rather than the focused one — the rule `panel.rename` and Restart already obey, since opening the palette moves DOM focus to the input and deliberately leaves `focusedId` alone. 68 is Restart's shape inherited: review is DISABLED with two DISTINCT reasons rather than absent, because "that panel has not started" and "no focused panel" are two situations with two different fixes, and both constants are compared as EXPORTED constants rather than as string literals. 69 is the row for a review NODE, and it is the one that says the union reached the palette: a node is navigable like any other panel — the switcher must be able to frame it — while every process verb aimed at it (restart, save as preset, review) is disabled, because a node has no process and a palette that offered to restart one would be offering a verb with no meaning. The count is 74 while the last number is 69, because of the lettered sub-checks `41b`, `58b`, `65b`, `65c` and `66b` |
| `verify:rail` | plain node | 67 checks (the last check number is 64; see the lettered sub-checks below) against `renderer/shell/rail-rows.ts`, `renderer/shell/inspector-fields.ts` and `renderer/shell/rail-sections.ts`: the honest chain's four links (1–4), the status tail (5–9), and the signature (10–15). Three are worth knowing by number. **7** pins that an exit code of 0 renders as `exited 0` — a truthiness test on `code` prints the wrong tail for the single most common exit there is, and no other check in the repo can see it. **10** is the check the module exists for: moving every rect must leave the signature byte-identical, which is what lets `Canvas.tsx` freeze the rows array on it; `SideRail` is rendered unconditionally and collapsing it is only a CSS class, so the rows stay mounted even when nobody can see them and the escape hatch `panelRows` uses (key the memo on `palette.open`, read `panelsRef`) has no equivalent here. 11–13 are the other direction — a title change, a status change and a wake must each MOVE the signature, or a frozen array would render stale text forever with nothing throwing. **14** pins that a user's own title cannot forge a field boundary and freeze the rail on stale rows, which is why the signature is `JSON.stringify` over the rows rather than a concatenation with a separator a label is free to contain; its fixture reaches the collision through `railTail`'s `error` case, the one tail value that returns user text (`status.message`) verbatim and so lets the separator itself slide between fields. 15 pins one row per panel in ARRAY order, never `Panel.z`. M8c's inspector model joined this suite rather than getting its own, as that sentence expected (16–27b). 16 pins that every agent state has a label AND that the ABSENT state has one too — `undefined` is the ordinary case for a panel that never spawned, not an error, so a bare `state.toUpperCase()` throws on the most common input the pane ever sees. 17 is `isRunning`, including the `starting` clause — see "One predicate for 'running'" below. 18–19 are the empty state's summary, and **19 is the phantom filter**: an id in the attention set whose panel is gone must not be counted, because agent state survives a panel's closure by design (the same orphan `reachableQueue` drops at the head of the jump queue), and a pane reading "1 waiting" on a canvas with nothing to go to sends the user hunting for a panel that does not exist. 20 pins the heading walking the same honest chain the rail row and the panel header walk, rather than inventing a second label that differs only in the common case. **21 is the check this pane exists for**: the resolved command and the SPEC's own answer are separate fields, never one merged `command`. A merged model satisfies 20 and leaves "why does this say login shell" unanswerable, which is the read half's entire stated purpose — confirmed by fault injection, since collapsing the two fields turns 21 red while 20 stays green. See "The inspector shows the links, not the answer" below. 22 is `cwd`: the resolved one while running, the spec's otherwise — a status-only implementation renders an empty cwd for every panel that has not spawned, which is every panel on a restored canvas. 23 is exit code 0 RENDERING rather than being swallowed by `code || '—'`, the same lesson check 7 records one screenful up, and it is asserted with 0 explicitly because a fixture written with a non-zero code passes either way. 24 is the `reattached` badge — the first reader `PanelStatus.running.reattached` has ever had (see "`reattached` costs a probe" below). 25/25b are the restart gate: offered for every SPAWNED state — running, starting, exited and errored — and refused for `idle` and absent, which have their own verb with its own affordance (M8b's start control). 25b asserts the exported `isRestartable`, and it is the one that pins `error`: an implementation written to the phrase "running, starting or exited" excludes it while looking entirely correct, and two copies of "can this be restarted" would let the inspector offer the verb while the palette refused it for the same panel, both on screen at once. 26–27b are the inspector's own signature, the same 60Hz defence 10–14 give the rail: 26 pins a rect change (every frame of a drag) leaving it byte-identical, 27 pins a title, a pid AND a status change each MOVING it — three separate movers, because an implementation that hashed only the id passes 26 — and 27b pins the empty selection as a first-class state rather than a crash, which is every launch before the first click and every background click after one. M8d's workspace and attention rows joined this suite too rather than getting one of their own (28–36b), bringing a third pure module — `rail-sections.ts` — alongside `rail-rows.ts` and `inspector-fields.ts`. **28–29 are the pair worth knowing**: `waitingCount` is now the ONE derivation of "how many of this workspace's panels are waiting" — `palette/commands.ts` computed it inline until M8d and now calls this, the same trade `isRunning` made in M8c — and 29 is the no-overlap boundary that says what the INTERSECTION is for: an attention id this workspace does not own contributes NOTHING, which covers a panel waiting in some other canvas and a phantom alike — the same orphan `reachableQueue` drops. It is not the trap for a plain `attentionIds.length`, which is caught earlier and louder by 28, 30 and 31 together; what 29 adds that nothing else covers is its second clause, an EMPTY workspace reading 0 however many agents are waiting elsewhere — the row a just-created workspace renders. 30 pins that `waiting` stays a NUMBER on the row rather than composed text, the rule `Command.waiting` already obeys in the palette. 31 states 29's fault from the other side: a waiting panel in Main must not inflate Scratch's count, which is what a global count produces and which reads as "every workspace is waiting for you". 32/33 are the 60Hz pair in the shape this section needs them — there is no rect to move here, so the volatile input is IDENTITY (`reloadWorkspaces()` hands `Canvas` a fresh array of fresh objects on every palette open), and 33's three separate movers are what stop an implementation that hashed only the ids passing 32 and then freezing a stale count forever. **34–35 are the pair that justify `buildAttentionRows`' signature**: it takes the already-built `RailRow[]` rather than the panel list, so filtering the queue to ids that have a row IS `reachableQueue`'s phantom filter and reading the label off that row is what stops the two sections naming one panel differently — one lookup, both guarantees. 34 also pins that the builder iterates the QUEUE and looks rows up rather than the reverse, which is the half that preserves entry order; the reverse renders the canvas's order and looks entirely correct until two agents ring in the wrong sequence. 35's fixture is a TITLED panel for the same reason — a builder that re-derived from `spec.command` would say `/bin/zsh` in Attention while the Panels row three lines up said `auth refactor`. 36 pins that the signature moves on an ORDER change, which a set-shaped implementation loses silently, and 36b pins the empty queue as a first-class state, which is what this section is in nearly all the time and so the one an implementation is least likely to have looked at. The count was 39 while the last number was 36, because of the lettered sub-checks `25b`, `27b` and `36b`. M9a's `buildReviewFields`/`reviewSignature` join this suite too, rather than getting one of their own, for the identical reason M8c's inspector model and M8d's rail sections already did: they are pure functions over plain data with no DOM and no native dependency (37–45). **37 and 38 are the pair the Changes section's whole hiding policy rests on**: `not-a-repo` renders NOTHING — the ordinary answer for a panel in the home directory, i.e. most panels, and a red field on most panels most of the time trains a user to stop reading the section — while `undefined` (the query has not answered yet, true for every selection change and every panel before the first query) is ALSO hidden and must not throw. 39 is the real answer: files named and both totals present as the numbers they are, not pre-formatted text the check would have to parse back apart. 40 is `REVIEW_FILE_CAP`: ten files render, the eleventh through Nth collapse into a `+N more` line, because the pane is 260px wide and was never meant to scroll. 41 is `shared`, and the discriminating clause is that the FILES still render — repository-level truth is still truth even when per-panel attribution is not, so a check asserting only "files is empty" would pin the wrong design entirely. **42 is the pair of notes that must differ**: `baseline-lost` and `never-started` read as the same sentence to a bare `.hidden` check but are two different situations with two different fixes — "restart this panel" versus "start it" — and collapsing them tells a user whose agent has been running for an hour that it has not started. 43 is `clean`, and it is deliberately VISIBLE — "no changes" is not `hidden: true`, because a panel that genuinely changed nothing and a panel the feature is broken for must not look identical. 44 is `reviewSignature`'s own 60Hz defence, the same shape `inspectorSignature` already earns a check for. **45 is the one worth knowing by number**: `git-missing` is the one arm 37–44 leave uncovered, and it asserts the arm's actual rendered content rather than merely "differs from some other arm" — a regression that swapped its model with `baseline-lost`'s, or hid it like `not-a-repo`, would still satisfy a bare inequality and would read on screen as the Changes section silently rendering nothing for every panel on a machine with no git — a missing feature, not a visible bug. M9b adds the eighth arm's rendering and the review NODE's own model (46–56), which is where a third pure module — `review/review-node-model.ts` — joins `rail-rows.ts`, `inspector-fields.ts` and `rail-sections.ts`. 46 pins `repo-unreadable` rendering a NOTE rather than nothing: it is the arm for a repository git declined to open, and rendering it like `not-a-repo` would make the ordinary macOS Command Line Tools stub indistinguishable from "this panel is not in a repository". 47 pins that `not-a-repo` is still HIDDEN in the pane, which is what makes 46 a distinction rather than a rewrite. 48 pins an in-flight query still rendering a heading and a summary, because a pane that renders nothing while it waits reads as a broken section on every selection. **49 is the check the node's own model exists for**, and it is the only one that separates it from "just call `buildReviewFields`": `not-a-repo` is HIDDEN in the pane and RENDERED in the node. The pane is a section inside a 260px column that must disappear when it has nothing to say; a node is a panel the user deliberately opened and dragged, and a panel that renders nothing at all is indistinguishable from a broken one. Fault-injected by pointing the node at the pane's builder — 49 goes red while every other rail check stays green. 50 pins exactly the NAMED row expanded and no other, 51 pins the node's own LARGER cap with the remainder reported rather than silently dropped (a node has a whole panel to fill, unlike the pane), and 52 is the purity/60Hz pair in the shape this module needs it: the build is a pure function of its four inputs, and the RESULT, the expanded path and the title each MOVE it — three separate movers, because a builder that ignored two of them passes on the third. The whole-branch review found the third of those was a `diff` literal, which is not an input to `buildReviewNodeModel` at all, so the clause was true of every implementation including a constant-returning one; the `diff` is now held IDENTICAL across all four paintings as fixture bookkeeping — it is what the node paints BENEATH the model, so painting the pair is what the component actually renders — and a differing `ReviewResult` supplies the real third mover. The check's argument about why the rail needs a signature and this module does not is unchanged, and is the part worth reading. 53–56 are the node as seen by the surfaces that list panels: a rail row that names its subject and says `review` (53), a TITLED node using its own title (54, the honest chain's rule reaching a second kind), a review row that is never DORMANT (55 — a node has nothing to start, and a "click to start" affordance on one is a promise nothing can keep), and an inspector model that refuses the process verbs (56). M9c adds the commit affordance to that same node model (57–59), which is where an irreversible verb first becomes data rather than a button's own decision. **57 is the one worth knowing by number**: the commit's `paths` come from the RESULT's full file list, never from the node's display-capped rows. The cap is a rendering bound — a node has a panel to fill, not a scrollback — and deriving a WRITE from what happens to be on screen drops every file past the cap out of a commit that looks complete, silently, with the node then reporting the survivors as still-uncommitted work. Its fixture is deliberately over the cap in both numbers, so the two lists cannot coincide. 58 pins `shared` BLOCKING with a reason that names the sharing rather than offering nothing: a commit there would bundle another agent's work under this node's message, and an absent control makes "not supported here" indistinguishable from "not built yet" — the rule `verify:palette` 31 already states for a disabled row. 59 is the other side of the same boundary: every arm with nothing to commit offers no control at all, an IN-FLIGHT query included, because a node that renders a live commit button while it still does not know what it is looking at is offering to write a set it cannot name. **The whole-branch review adds 60, and it is the only check in the branch that knows renames exist**: `git diff --numstat` does rename detection by default, so `git mv old new` is ONE entry carrying `path: new` and `renamedFrom: old` — and a commit set built from `path` alone stages the addition while HEAD's own `old`, seeded into the scratch index by `read-tree`, survives into the new tree. Verified against real git: the commit contains BOTH names and RESURRECTS a file the agent deleted, while the node says “1 file changed”. Nothing is lost and the next review self-corrects, but it is content the user did not intend, on this app's one irreversible write. The check asserts both halves in one read — two paths in the commit set, ONE row in the list — because it is check 57's display-versus-commit split from the other side: a fix that widened the rendered list too would report “2 files changed” for one `git mv`. M12 adds the live cwd and the live command to the same model (61–63). 61 is BOTH rows, never one merged field — check 21's argument applied to a second pair: “why is this not where I started it” is answerable only when the user can see the spawn-time `cwd` and the live one at once, and a merged field renders something entirely plausible while deleting the feature. It asserts the SPAWN row is still present for exactly that reason; a check that only looked for the live value passes against the merge. **62 is worth knowing for what it CANNOT do**: it asserts an ABSENCE — no live rows, and no backfill — so it was green before the feature existed and can never be watched failing. It is a regression guard, and 61 and 63 are what carry the milestone. What it guards is the ordinary state rather than an error: the direct backend has no live answer and never will, and a tmux-backed panel has none until its first tick lands, and a spawn cwd under a present-tense label is indistinguishable from a correct answer — while a CONSUMER, which needs a directory rather than making a claim, falls back happily. 63 is `inspectorSignature`'s own 60Hz defence in this milestone's shape, and it is the check that stops the pane freezing: `Canvas` freezes the model on that signature, so a live value the signature does not cover renders once and then never updates again, stuck at whatever it was when the panel was selected, with nothing throwing. The cwd and the command are asserted as SEPARATE movers, because an implementation that folded in only the cwd passes a cwd-only check. **64 is the exit path's own version of the milestone's thesis**: for an `exited` status neither live row renders while the spawn `cwd` row stays — the live store is a cache of main's last answer and nothing clears it when a process dies, so before the gate an exited panel showed “running sh” two rows above “status exited 0”, permanently, for the life of that panel: a present-tense label reading as current when the process it describes is gone, the same failure 61 exists to prevent reached through the process ending rather than the cwd changing. The gate is `isRunning(status)`, the one shared predicate for that question rather than a second copy of the judgment beside it |
| `verify:review` | plain node | 76 checks: `git-args.ts`'s argv/parsing (1–13b), `review-engine.ts`'s `resolveRepo`/`captureBaseline` against a fake runner (14–20), and the engine's seven result arms (21–29b), then a REAL git repository in a spaced temp directory (30–34), `baseline-capture.ts`'s once-only guard (35–35b), and the cross-relaunch sweep (37–37b). M9a's whole design fits in one sentence — a baseline captured once at spawn, diffed on demand — and this suite is where that sentence is pinned as sixteen separate small facts rather than argued as one big one. **21** is the arm the pane's whole "no session yet" story rests on: no stored baseline reads as `never-started`, the state that renders visibly rather than hiding, because a panel that has not spawned is not the ordinary case the way a non-repo cwd is (see 36 below). **24** is untracked reporting: a brand-new file never appears in `git diff` at all, so `buildUntrackedArgs`' `ls-files --others` is a SECOND read merged into the same result, not a detail of the first — this is the one arm whose files array can be non-empty from a source `numstat` never touched. **31** is the check the whole baseline-capture design answers to: `stash create` must leave the WORKING TREE and the stash list untouched, because this milestone stashes nothing on purpose — the captured sha is a snapshot object, never checked out, never popped — and a regression here means the app is silently modifying a running agent's own uncommitted work, the worst failure this milestone could produce. **32** is the pre-existing-dirt exclusion that makes 31 worth having: a file dirty BEFORE the baseline was taken must report zero added lines for that dirt, because the baseline commit already contains it — a numstat taken against the wrong reference would double-count the agent's own edits with the user's. M9a's final review adds 36/36b, closing a gap check 100 in `verify:panels` found: `baselineOf` alone cannot tell "spawned into a non-repo directory" apart from "never spawned" — a non-repo capture finds nothing to store, so `baselineOf` stays undefined FOREVER either way, and without the `notARepo` dep every panel outside a repository would read `never-started` — "not started" — for the rest of its life the instant it spawned, which is backwards from review.ts's own comment calling `not-a-repo` "the ordinary answer... i.e. most panels". 36 pins the real capture-then-review round trip producing `not-a-repo`; 36b is the regression guard for every check ABOVE it (19–34), all of which build an engine with no `notARepo` dep at all and must keep reading `never-started` exactly as before — an optional dep silently changing their meaning would be indistinguishable from a suite that stopped testing what its title says. See "The baseline is captured once, and `reattached` is why" below. M9a's final fix wave adds four more, and **16b is the one worth knowing by number**: a FAILED `git stash create` must store NO baseline, where it previously fell through to HEAD alongside the clean-tree case the fallback was written for. `stash create` needs the index lock and refuses outright during an unresolved merge or against a corrupt index — reachable here specifically, because a panel spawns into a repository whose OTHER panels' agents are running git constantly — and a HEAD baseline taken there excludes nothing, so the pane attributes every pre-existing uncommitted change in the working tree to that agent, confidently, for the whole life of the panel id. The fake defaults `ok` to true (`ok: hit.ok !== false`), which is why nothing drove this branch before: 17 and 18 both exercise a SUCCESSFUL create, so the bug and its fix were indistinguishable to the whole suite. **17 is now named as 16b's companion** and must stay: it is the direction a fix can over-correct into, since a clean tree and a failed create both produce no sha. 19b is `git-missing`'s first PRODUCTION reachability — the runner refuses to spawn when git could not be resolved on the login PATH and reports `notFound` before launching a process, where it previously spawned the bare name `git` against launchd's bare PATH and a homebrew-only git silently produced no section at all. 19c pins that a hung git is TIMED OUT rather than left pending forever, and its LOWER time bound is the half that discriminates: the pre-fix runner ignored its deps and ran `git 30`, which exits in milliseconds, so an `ok === false` assertion alone was green against a runner with no timeout at all. **37/37b are the cross-relaunch pair**: `staleBaselineIds` names the baselines whose SESSION did not survive, so main can drop them at startup from knowledge it already has (`ptyManager.list()` asks the backend). 37b is the guard against over-correcting — a drop-everything implementation satisfies 37 perfectly and deletes the baseline of every panel whose tmux session outlived a crash, recapturing against a tree the agent has already rewritten, which is the single failure this milestone turns on. The `Cmd+R` guarantee is untouched and lives one layer up, in `PtyManager`'s in-memory `capturedBaselineIds`. M9b adds the eighth arm, the baseline-addressed query and the diff parser (38–48). 38/39 are the arm's two halves and both conditions are required: exit 128 AND a message saying "not a git repository" is not-a-repo (38), while ANY other non-zero exit is a repository git DECLINED to open, carried with a detail (39) — the macOS Command Line Tools stub, which exists and spawns and exits non-zero on everything, is the ORDINARY instance of this rather than an exotic one, and M9a answered null for it exactly as for a plain directory, so the Changes section rendered nothing and the failure had the same shape as the ordinary case. 40 pins that `never-started`, `not-a-repo` and `repo-unreadable` are three answers and not two collapsed. 41 pins the unreadable verdict being recorded and cleared by `drop`, the same lifecycle the baseline itself has. 42–44 are `parseDiffLines`: file headers are META rather than additions (42 — counting `+++ b/x` as an added line inflates every file's count by one and is wrong in the direction nobody checks), the preamble and the no-newline marker are meta too (43), and the line cap TRUNCATES and reports the remainder (44) rather than silently ending. **45 is the one worth knowing by number**: `reviewAt` answers from the baseline ALONE and never consults `baselineOf`, which is what lets a review node outlive its subject — main drops a panel's baseline on kill, so a query that took a panel id would go blank at exactly the moment a review of finished work is most useful. 46 is its companion: `reviewAt` excludes its own subject from the peer count, or every single-agent repository reports itself as shared. 47 pins `fileDiff`'s three answers — including the clause the whole-branch review added, an EMPTY stdout on a git that exited 0 answering `unavailable` rather than an empty `diff`: git saying nothing is a SUCCESS, so it flows past the failure test, and it is reachable whenever a file is reverted between the numstat that listed it and the click that expanded it. An empty `diff` renders as an empty box with no note — "this file did not change", stated confidently about a file the list beside it says did — and it is also what lets `ReviewNode`'s `Hunks` say an empty diff is unrenderable. 48 pins the untracked case, and 48 pins the untracked case — diffed against `/dev/null` with `--no-index`, whose exit 1 means DIFFERENCES FOUND rather than failure, so an implementation treating non-zero as an error renders "this diff could not be read" for every new file an agent writes, which is most of what an agent writes. M9c adds the write verb (49–63). 49–54 are the argv builders and `parseStagedEntries`, and **51 carries the milestone's first measurement**: the commit is porcelain `git commit -m`, never the `write-tree`/`commit-tree`/`update-ref` recipe the spec named, because `commit-tree` runs NO HOOKS AT ALL and would therefore have delivered the `--no-verify` behaviour the same spec forbids one paragraph later — so the check pins the argv shape and the absence of any flag that could become one. 55 is the `GitRunner`'s per-call env overlay, which is what makes a scratch `GIT_INDEX_FILE` expressible at all. 56–60 drive the sequencer against a fake runner: 56 pins the calls in ORDER with the scratch-index ones scoped and the reconcile deliberately NOT, because it is the one call that is supposed to write the real index; 57 and 58 pin the POSITIONAL `refused`/`failed` split, a non-zero exit from `git commit` itself carrying the hook's own output verbatim versus a non-zero exit from a call before the commit was attempted, which are two situations with two different fixes ("your repository said no" versus "this did not run"); and 59 pins the scratch index removed after a success AND after a refusal. **60 is the one worth knowing by number**: a failed reconcile must still report `committed`. The reconcile runs after the irreversible half, so downgrading the result there tells a user their work was not committed while it demonstrably was — and the next thing they do is commit it again. 61–63 are real git in a spaced temp directory. 61 is the porcelain decision's evidence rather than its argument: a real `pre-commit` hook RAN, and saw exactly the reviewed paths. **62 is the one worth knowing by number**: the user's own `.git/index` is compared as BYTES either side of the staging, never read through `git status` — a status read is a claim about what git DERIVES from an index and a working tree, while this is a claim about the FILE, which is the thing an agent in that repository may be mid-write against, and only the file can answer it. Its measurement window closes the instant the porcelain `commit` call resolves, deliberately: the reconcile is the fifth call and writing that file is its whole job. **63 is the reconcile's two directions in one read** — no phantom staged change for the committed paths, and the user's own unrelated staged file still staged. Never touching the real index sounds like the safe answer and is its own silent failure: once HEAD moves and the index does not, the index still describes the previous tree, so the agent's own `git status` reports a `D` for every file added and `MM` for every file modified, and an agent reading that will try to "fix" a repository that is fine. The second half is what the per-path `--cacheinfo` buys over a wholesale restage. **61–63 SKIP LOUDLY when no git binary is found**, the same rule `verify:panels` 99–101 obeys and for the same reason: a machine with no git must not turn `npm run verify` red for something that has nothing to do with the code under test, and a skip that prints nothing is a check that stops existing the day CI loses the binary. The whole-branch review adds 64, and it is the reconcile's OTHER direction: `ls-files --stage` prints nothing for a path the commit DELETED, so the requested paths ABSENT from that read-back are exactly the deleted set — and with no entry to restage, `--cacheinfo` leaves the real index's stale entry alone. Measured, that is `AD <path>` in the agent's own `git status`: the file staged as NEW in a repository whose HEAD just deleted it, which is the `D`/`MM` phantom wearing the opposite sign and worse in one respect — an agent reading it re-adds the file it just deleted, rather than merely being confused. 64 pins the second `update-index --force-remove` naming ONLY the absent path, carrying NO scratch env (it is a real-index write, like the `--cacheinfo` call beside it), and still reporting `committed` when it fails, which is check 60's rule inherited. Check 63's fixture grew a DELETED file for the same finding, and its new clause is an ABSENCE — no `git status` line for that path at all — because the wrong answer is `AD`, whose second column the index-state regex beside it never reaches. The HEAD-moved guard adds 65–67, and they are the only checks in the suite about a SECOND committer. 65 pins the guard's two reads by POSITION — the first before `read-tree` (the scratch index is seeded from that same HEAD, so the two must describe one commit or the comparison is against the wrong reference) and the second IMMEDIATELY before the commit, which is the clause that matters: a second read taken just after `read-tree` closes almost none of the window and looks exactly as correct, since the window is the whole duration of the pre-commit hook. Its unchanged-HEAD clause is the over-correction guard — a comparison written backwards refuses every commit there is, which is a feature that never works rather than one that works and is unsafe. 66 is the fake-runner arm: `head-moved` is its own result, not a `failed` with a sentence, and the discriminating clause is that `commit` was NEVER CALLED, because an implementation that noticed the move after committing has noticed nothing. **67 is the one worth knowing by number**: it runs the race against real git, firing a real concurrent commit from inside the runner the instant `read-tree` resolves — the exact window — and its last clause is the one with teeth. Refusing is only half the answer; what makes the refusal correct is that the other committer's work is still HEAD afterwards, and that is read out of the COMMITTED TREE (`git show HEAD:theirs.txt`) rather than the working tree, which our commit never writes and which therefore says "someone else" under the broken sequencer too. Watched RED against the unguarded code and it reported the defect exactly: `kind=committed head="agent work" theirsInHead="base\n"` — an ordinary-looking commit that erased a commit made 200ms earlier. It joins 61–63's LOUD SKIP on a machine with no git. The count is 76 while the last number is 67, because of the lettered sub-checks `13b`, `16b`, `19b`, `19c`, `27b`, `29b`, `35b`, `36b` and `37b` |
| `verify:subagent` | plain node | 27 checks (the last check number is 26; see the lettered sub-check below): `subagent-scan.ts`'s pure functions (1–14, plus 12b) and `subagent-watch.ts`'s state machine against a fake filesystem (15–26), the identical `review-engine.ts`/`GitRunner` split — the watcher takes its reads as injected dependencies, so the whole thing is drivable with no real `~/.claude` anywhere in earshot. 1–3 restate `slugFor`'s mapping against REAL directory names observed under `~/.claude/projects`, not a guess about the rule — the rule was inferred from them, so restating them is what keeps the inference honest; 2 is the case a naive `split('/').join('-')` gets wrong (a dot becomes a dash too, so `/.claude` yields a DOUBLE dash, the common case in this repo since every worktree lives under `.claude`). 4–6 are `parseMeta`'s tolerance, the individual-drop rule applied to a format this repo does not own: an unknown extra field is ignored rather than rejected (5, the forward-compatibility half — Claude Code will add fields, and a parser that refused an unfamiliar one turns every future release into "the feature stopped working" with nothing saying why), while a meta with no `toolUseId` is dropped outright (6, since a record that can never be completed would say `running` forever). 7 is `cwdOf`, the confirmation read that is the entire reason a wrong slug is harmless rather than dangerous. 8–10 are `chooseSession`'s post-spawn filter: the most recent directory that POST-DATES the panel's spawn wins, and a directory created BEFORE the spawn is never claimed (9) — the guard that stops a panel adopting the session of whatever ran in that cwd yesterday. **12 is the over-correction guard, and 11 is not enough without it**: an `attributable` that refuses every ambiguous panel (11) is trivially satisfied by an implementation that refuses EVERYTHING, so 12 asserts the positive directly — a single panel in a repository IS attributed — the same shape `verify:review` 37b already states for the baseline sweep. **Its fixture is three DISTINCT NON-NULL slugs, and it was rewritten to be**: it used to give its two neighbours a null slug, which made it the ONLY exerciser of `attributable`'s null arm — and no production caller passes a null slug at all, since `poll` always calls `slugFor`, which never answers null for any string. A branch reachable only from a check is one a later editor reads as dead code and deletes, so the check stopped resting on it and the arm's own comment now states plainly that it is there for a future caller. The claim under test did not change. 12b is the count that arm's sibling produces: `slugSharing` counts the panel ITSELF, so `1` IS the attributable case, and `attributable` is written in terms of it rather than beside it — the renderer's ambiguity line names that number to the user ("3 panels share this repository"), and a second count computed for the message would drift from the refusal the first time one of them was wrong. **13/14 are the completion scanner's one load-bearing distinction**: a `tool_use` carrying a `toolUseId` is NOT a completion (13), because the identical id appears TWICE in a real parent transcript — once spawning the subagent, once ending it — so a scanner matching the bare id marks every subagent finished the instant it starts, and a node is never once seen running, which is the whole feature reduced to nothing. 14 is the positive: a `tool_result` completes exactly its own id and no other. 15 is the watcher's happy path end to end against the fake fs. **16 and 21 are the dedupe, in the two arms that can each hide a regression the other cannot see**: 16 is an unchanged CLAIMED session reporting nothing on a second poll, and 21 is an unbroken run of an AMBIGUOUS pair reporting ONCE rather than on every tick — ambiguity is a STEADY state (two panels sharing a repository is an ordinary, long-lived configuration), so an undeduped implementation would re-announce it forever, and that failure has no pixel: it is only ever visible as heat, the identical argument `verify:pty-manager` 23 makes for `session:live`. 17 is the confirmation read reaching the watcher: a session whose own recorded cwd disagrees is not claimed however well the slug matched. 18 is completion through the real tail-read path. **19 is the offset, and it asserts the READ ARGUMENT rather than an outcome** — re-reading a megabyte parent transcript every 2s is invisible on screen and shows up only as heat, so the only place this cost is observable at all is the literal byte offset the second read is asked for; it asserts the read starts at the previous EOF and explicitly asserts it does NOT start at 0. 20 is the ambiguity refusal reaching the watcher as a FLAG rather than as silence, because an absent feature must not look like a broken one. **22 is `clearDedupe()` versus `clear()`, both halves in one condition** — a `clear()` mislabelled as `clearDedupe()` would satisfy "reports again" only by accident, so the check drives the second poll with a LATER `spawnedAt`, exactly what a tmux reattach produces: a real `clearDedupe()` reuses the existing claim untouched and the later `spawnedAt` changes nothing about its answer, while a bare `clear()` would force a re-claim that `chooseSession`'s post-spawn filter then rejects against the newer timestamp, reporting NOTHING — the exact failure this milestone exists to prevent, and a real defect this suite's own instructions once specified by mistake. M13's final fix wave adds 23–26. **23 is the re-claim, and the failure it removes is a CONFIDENT WRONG answer rather than an absent one** — the direction this whole module refuses to be wrong in: a claim was made ONCE (`poll` calls `claim()` only for a panel it holds no state for) and nothing re-derived it, so a panel that `cd`s into another repository went on rendering the FIRST repository's subagents beside a panel no longer in it, past a confirmation read that had been correct when it ran. The check drives it end to end — poll in repo A, move the panel to repo B, poll again — and the discriminating clause is that B's own record comes back, not merely that something did; fault-injected red with the slug comparison disabled, reporting `second:[]`. 24 is the CAP and the overflow it reports rather than swallows: nothing here removes a record once added (a finished subagent stays as a `done` node), so the list only grows for the life of the panel, and all three costs riding on its length are invisible — a 6,400px node column painted over whatever is beside the panel, the whole list re-serialised into the dedupe key every 2s, and the whole list crossing IPC on every change. The remainder is asserted as well as the cap, because a list that silently stops is indistinguishable from an agent that stopped spawning, which is the `+N more` rule `REVIEW_FILE_CAP` already states. 25 is the same bound on `description`, applied at the PARSE boundary so every consumer inherits it rather than the one that remembered. **26 is three clauses about one story, and the third is the one that stops the fix being worse than the bug**: a confirmation failure stored no state, so `claim` re-derived the same session directory and re-read the same parent transcript — the file that grows to megabytes — on every 2s tick forever, reachable because `slugFor` maps `/` and `-` alike to `-` and so `/Users/me/my-repo` and `/Users/me/my/repo` share a slug. It asserts the failed read is BOUNDED (`readHead`, not `readText`), that two further ticks read nothing at all, and that a genuinely NEW session directory is still claimable afterwards — because a fix that remembered the PANEL rather than the DIRECTORY satisfies the first two perfectly and leaves the feature silently dead for the rest of that panel's life. The count is 27 while the last number is 26, because of the lettered sub-check `12b`. All 27 checks run against a fake, in-memory filesystem — `subagent-scan.ts` imports nothing and `SubagentWatch` takes its reads as injected functions — so there is no real directory here and the spaced-temp-directory rule the `pane-died` bug established does not apply to this suite; it is `verify:pty-manager` 25–27, below, that reach real disk, and their fixtures are spaced |
| `verify:tmux` | plain node | 29 checks: `tmux-args.ts`'s argv, config text, version parsing and list parsing (1–13), `tmux-probe.ts`'s pure backend selection (14–17b), the quoting of the pane-died redirect target against a spaced `exitDir` (18), and the exact-match `=` on every kill-session target (19). M5c adds `resolveSocket`: dev and packaged landing on different sockets (20), the dev socket unchanged from its historic value (21), an explicit override beating both defaults (22), a blank or whitespace override falling back to the default rather than leaking through to tmux's own default socket (23), and `buildStartServerArgs` — the one tmux argv that used to be hand-rolled — defaulting to the private socket and threading an explicit one (24–25). M6a adds check 26: `buildHasSessionArgs`'s argv, including the same exact-match `=` on its target that every kill-session target already obeys, so panel `n1`'s probe doesn't read `n12` as its own surviving session. M12 adds the sixth column (27–28). 27 pins `#{pane_current_command}` in `LIST_FORMAT` beside the `#{pane_start_command}` already there, and `parseListOutput` landing both — the pair is worth having only because the two DISAGREE for a panel doing work, so a check asserting one of them alone says nothing about the other. **28 is the one worth knowing by number**: an older FIVE-column line still yields an entry, with `currentCommand: ''`, rather than being dropped. That is not defensiveness about a shape this repo controls, it is the same fact `-f <conf>` already turns on — a running tmux server ignores a new client's arguments, so a server left alive by a build that predates this column answers the OLD shape to a NEW client, and dropping the entry there turns a cosmetic gap into a panel boot reconciliation reads as dead. It re-asserts the `#{pane_dead}` filter WITH the new column present, so the widening cannot have quietly shifted the field position that filter reads. The count is 29 while the last number is 28, because of the lettered sub-check `17b` |
| `verify:agent-state` | plain node | 25 checks (the last check number is 24; see the lettered sub-check below): `scanForBell`'s scanner (1–10) and `nextState`'s state machine (11–24). The two that matter most: 2 pins that a BEL-terminated OSC window title rings zero bells, and 3 pins the same for the ST-terminated form of the same title — a bare `indexOf(0x07)` would fail check 2 silently, painting a title change as an attention-worthy bell — and 6–8 pin the scanner across a SPLIT chunk (an OSC opened in one 16ms flush and terminated in the next, and a bare BEL split the same way), which is the whole reason `ScanState` is carried between calls rather than reset per call. 5/5b assert a DCS body swallows an embedded BEL and a REAL bell right after it still rings — the state machine doesn't just eat the trap, it recovers cleanly the instant real content resumes. 9 asserts a CSI (no BEL-swallowing string body) leaves a bell alone, guarding the boundary the other direction. 16–17 pin ENTRY into `wants-you` — a bell from busy and a bell from idle both land there — and 18–19 pin that it is STICKY once there: further output does not clear it (18), and neither does an hour of idle ticks (19) — nothing but `acknowledge` or `exit` moves it. 23–24 pin `exited` as terminal and unconditional: even a panel mid-`wants-you` goes straight to `exited` on a PTY exit, and nothing revives it after. See "A title is not a bell" below |
| `verify:styles` | plain node | 11 checks against `src/renderer/styles.css`, read as TEXT rather than parsed — a CSS library here would drag a dependency into the cheapest tier the repo has, and the facts M10 asserts (how many distinct font sizes exist, is there a colour outside the theme block) are LEXICAL facts, not cascade facts. 1 is no hardcoded colour outside a theme block, in any notation — hex, `rgb()`, `rgba()`, `hsl()` — with a two-entry EXPLICIT allowlist rather than a relaxed regex, because both exempt values are translucent WHITES that model light on a surface (the canvas dot grid, the palette's top-edge highlight) and must composite over whatever ground the active theme sets; tokenising either would freeze it to one theme. The hex-only first version of this check passed green with eight surviving `rgba()` literals, three of which re-mixed `--amber`/`--green`/`--red` by hand at their own alphas (`.10`/`.22` for the pulse, `.08` for the diff rows) one screenful from the `--*-dim` tokens that already declared those colours at `.14` and `.12` — near-duplicates rather than exact ones, which is the harder case to spot and the reason the check greps notation rather than value. 2 is every `var(--token)` declared — the check that would have caught M10's own `--fg`-was-never-defined defect. 3 is no fractional `opacity`, which compounds against an already-muted token and is invisible to any audit that reads declared colours. 4–6 are the type, radius and spacing scales, each asserting ZERO literals; 5 exempts `50%` and `999px` as SHAPES rather than scale steps. 7 and 8 are the structure/colour split from both sides: bare `:root` declares no colour, and no structural token hides inside a `[data-theme]` block where every future theme would have to remember to repeat it. 9 and 10 are a `prefers-reduced-motion` block and at least one `:focus-visible` rule — both were zero before M10, and 9 became load-bearing the moment the first animation landed. **11 is the only check that COMPUTES rather than greps**: it recovers every `--fg*` and `--s-*` hex from the theme block and measures real WCAG contrast for every text token against every surface it can land on, so the contrast table in M10's commit messages cannot go stale silently the way a pasted table can. `--s-5` is deliberately not a ground — it is a pressed state, transient, and no text is ever read against it. **What it cannot see is stated per check in its own header comment and should be read before trusting a green run**: it never renders anything, so it can say the stylesheet obeys M10's rules and nothing at all about whether the app looks right; check 4 only sees `px`; check 6 sees only `padding`/`margin`/`gap`, so `.canvas-hud`'s `right`/`bottom: 12px` is invisible to it and every `1px` is exempt outright; check 8's regex lists `sp|r|dur|t|lh|ease`, so `--e-*`, `--font-mono` and `--titlebar-h` could all move into a theme block without failing anything; and a colour written as a NORMAL property on bare `:root` escapes checks 1 and 7 together, since 1 filters `:root` out as a theme block before it looks and 7 only inspects `--`-prefixed declarations. There is no visual regression test in this repo, and that IS a position rather than an omission — see the spec's "Verification" section, which now distinguishes the two claims |
| `verify:package` | plain node | 10 checks against `build/builder-config.cjs`'s returned value: `node-pty` unpacked from the asar and the pattern depth-independent (1–2), `asar` actually on (3), the `files` globs (4–5), app identity and output dir (6–7), signing explicitly *decided* rather than unmentioned (8), targets and architecture (9), and the arch being a parameter rather than a constant (10) |
| `verify:packaged` | real Electron, **not in `npm run verify`** | 11 checks: packages with `electron-builder --dir` and launches the produced binary with a stripped `PATH`, a throwaway `--user-data-dir` and a scratch `TC_TMUX_SOCKET`. Asserts the app survives startup (3 — the asar/`node-pty` proof), reports itself packaged (4), recovered a PATH launchd never gave it (5 — the first time `shell-env.ts`'s reason for existing has ever been observed), used the scratch socket (6), actually used the throwaway `--user-data-dir` rather than silently falling back to the real one (7), named a backend and a reason (8), and actually spawned a PTY (9). **10 and 11 are the single-instance pair, and this is the only tier that can hold them**: the lock needs two real app PROCESSES, and every other suite in this repo runs exactly one. They are cheap here only because the harness already launches the real binary with a throwaway `--user-data-dir` — Electron keys the lock on that directory, so a second launch collides with this run's own first child rather than with whatever the developer has open. **10 is the one worth knowing by number**, and its discriminating clause is the ABSENCE of a `[startup] packaged=` line, not the exit: an instance that booted fully — ran the shell probe, started a tmux client on the shared socket, wrote the shared store — and only THEN quit satisfies "it exited" perfectly while having already done every destructive thing the lock is taken to prevent. Watched RED before the fix, and it failed the honest way: the second copy printed its own `packaged=true` summary and never exited at all. 11 is the other direction, and it is not a formality — a gate written backwards, where the ARRIVING instance takes over and quits the incumbent, satisfies 10 completely, because the second process does exit. What separates them is who is left alive, and the clause that carries it is the incumbent's PTY pid (read from the line `PtyManager.create` logged, so a first child that survived with a dead session cannot pass), since it is the running agent rather than the window that a user loses. Kept out of the default chain because it rebuilds native modules and reaches electron-builder's cache — minutes, plus a network dependency — and the repo's one green-or-not signal must stay fast and offline. It is the **pre-release gate**; run it before cutting a build |
| `verify:pty` | Electron as node | 10 checks: `node-pty` behaviour end to end |
| `verify:pty-manager` | Electron as node | 33 checks (the last check number is 27; see the lettered sub-checks below): the real `PtyManager` (1–10 on the direct backend), plus the real `TmuxBackend` end to end against a throwaway socket and a spaced `exitDir` — session creation, detach-and-reattach at the same pid (12), cross-manager list (13), exit-code fidelity (14–14b), destroying a session this manager never spawned (14c), a prefix-colliding kill target leaving the wrong session alone (14d), and destroy/shutdown (15). M6a adds 16/16b: a fresh session reports `reattached: false` and the same panel spawned again — after the first one is still alive — reports `reattached: true`, the two halves that only separate a `has-session` probe taken *before* the spawn from one taken after (see "`reattached` costs a probe" below). M6c adds 3b and 17–19. Check 3b is the guard half: a kill()'d session emits no agent-state `exited`, which it did until a whole-branch review — see "`starting` is sent directly, and the killed exit is not sent at all" below for the recycled-id failure that produced. 17–19 are the wiring proof that `agent-state.ts`'s pure state machine actually reaches `IPC.AGENT_STATE` through the real manager rather than sitting unused beside it: plain output on a fresh session produces exactly one `busy` event, COUNTED after the stream has demonstrably settled — the check waits for the idle transition, which only a tick that observed the ABSENCE of output can produce, then waits one further tick before counting — which is what separates the emit-only-on-change dedupe from an implementation emitting on every 16ms flush and every 500ms tick, the 60Hz cascade the design exists to prevent. The FIXTURE is what makes that count mean anything, and a future editor must not shrink it: it prints forty lines with a gap between each — comfortably more than one per 16ms flush — because the obvious single `printf` produces ONE PTY read, so a de-duped and a non-de-duped implementation emit the same one `busy` and 17 stays green with the dedupe deleted (confirmed by deleting it and watching 17 pass). Against the burst the two separate 1 vs 42. The relationship that keeps the count honest is between two numbers in that check and nothing else: the inter-line gap (20ms) must stay well under the seeded `idleAfterMs` (200ms), or an idle transition lands mid-burst, the next line legitimately re-enters `busy`, and the count is >1 for a reason that has nothing to do with the dedupe (17), a real OSC window title produces no `wants-you` at all — this suite runs the direct backend, so it is the one place a tmux-free machine can see the OSC trap NOT fire, and its first clause is a NON-VACUITY guard that must keep naming `busy`: "no wants-you" is satisfied just as well by bytes that never reached main, and `busy` is the one state in that fixture only `enqueue` can produce, so a bare `some(panelId === 'a2')` stopped meaning anything the moment `create` began sending `starting` directly at spawn (18), and a real bell followed by a real write moves the panel to `wants-you` and then back off it (19). M8c adds check 20, and **it is worth knowing by number as the MIRROR of check 12**: 12 pins that detach-then-create returns the SAME pane pid, which is the whole of M4c's reload survival, and 20 is the opposite claim about the same two calls with `kill()` in the middle instead of `detachAll()`. The pane pid is the only observable that separates them — the session name is identical, the client count returns to 1, and `list()` reports one session either way — so without this check a restart that forgot `backend.destroy` would have `new-session -A` reattach to the surviving session, the user's agent would keep running, and nothing anywhere would say the verb did not happen. It is a CHARACTERISATION check and says so in its own comment: `PtyManager.kill` has reached `backend.destroy` since M4c, so it passed on first write and was never red in normal development — it earns its place by fault injection (comment that `destroy()` out and 20 goes red, with the pid unchanged and the session still listed in the between-state read), not by ever having failed on its own. Whoever appends check 21 inherits an obligation this check had to restore; see "Every check appended to `verify:pty-manager`'s tmux block" below. Skipped loudly, never silently, when no tmux binary is found. The count was 25 while the last number was 20, because of the lettered sub-checks `3b`, `14b`, `14c`, `14d` and `16b`. M9a adds 21, 22 and 22b, and moves check 20's own inherited obligation — this block must end in a definite `kill-server`, never a session kill that leaves a stale server for the next run — one further down, to 22b's own final action; see check 20's comment for why that ordering matters and check 22b's for where the obligation landed next. **21 is the check the whole once-only capture guard exists for**: a SECOND `create()` at the same panel id — exactly what a `Cmd+R` reload does for every restored panel, and which under tmux REATTACHES to a session that may have been working for an hour — must not recapture, asserted by counting real `captureBaseline` calls through a real manager rather than by inspecting `capturedBaselineIds` directly. Recapturing there would reset the baseline to "now" and the pane would report "no changes" for an agent that had rewritten the repository — a wrong answer shaped exactly like a right one, with nothing in any log. 22 is the mirror on the way out: `kill()` drops the panel's baseline, so the map does not grow for the life of the install and a recycled id cannot inherit a dead panel's snapshot. **22b is the one worth knowing by number**: it proves `kill()` drops the baseline on the NO-LOCAL-SESSION branch too — the same branch `verify:pty-manager` 14c already proves reaches `backend.destroy()` for an id this manager never spawned (a hidden workspace's panel, reattachable after a reload but never promoted; see "`dispose(id)` sends `pty.kill` even when this renderer holds no local session for that id" below). Before this check that branch's baseline half was defended by prose alone — the identical gap 14c itself was written to close for `backend.destroy()` — and a branch asserted by nothing is one a later editor reads as dead code and deletes. Like `verify:layout`'s new 98/99/100/102/103, 21 and 22 (not 22b) carry a bare numeric label rather than a descriptive string, so their console output prints no title — left as written rather than renamed here. See "The baseline is captured once, and `reattached` is why" below. **M12 adds check 23, and it is the only thing anywhere that would notice this milestone's cost story going wrong**: the dedupe's failure changes no pixel — it shows up as heat — so the check COUNTS messages, asserting that a settled session has produced exactly ONE `session:live`, that a real `cd` written through the PTY produces exactly one more, and that nothing else arrives. **Its window is what makes the count mean anything, and a future editor must not shrink it**: an implementation with no dedupe at all emits once per `LIVE_TICK_MS` tick, so a sample spanning a single tick sees one message either way and stays green against the defect — the fixture waits seven seconds on each side, comfortably more than three ticks. That is check 17's trap in reverse: there the danger was a fixture with too little OUTPUT to separate two implementations, here it is a WINDOW too short. Its cwd is a `mkdtemp` directory and its shell a plain non-login `/bin/sh` for the reason every fixture in this repo is fenced: a login shell sources the running developer's own dotfiles, and one that `cd`s on startup would move the settled value on one machine and not another. It also inherits check 20's standing obligation and discharges it — the block's final `shutdown()` moved below it, so check 23 is no longer the last thing in the block. **24 is `detachAll()`'s own half of the same clear**: `kill()` drops a panel's `lastLive` entry, but `detachAll()` — the `Cmd+R` reload path, which leaves this manager's own map intact because the *tmux session* survives the reload even though the local client does not — left it standing, so a reattach at an unchanged cwd compared against its own stale pre-detach value and never sent again: a real, live, reattached session whose inspector goes on showing wherever it was a run ago, indefinitely, which is check 23's cost story failing silently through the one door check 23 itself never opens (it never reloads). Its assertion needs a SECOND emitted value at an UNCHANGED cwd, because only that proves the dedupe was cleared rather than merely never having fired; a fixture that changed the cwd across the detach could not tell the two apart. It inherits check 20's obligation via 22b and 23 and discharges it again — the block's final `shutdown()` moved below IT — and whoever appends check 25 inherits it next, exactly as `scripts/verify-pty-manager.cjs`'s own closing comment said before M13 added three more. M13 adds 25–27, the subagent poll wired to a REAL filesystem through a REAL `PtyManager`, where `verify:subagent` (below) is a fake one. **25 is silence, and its own comment states plainly what it cannot prove**: a panel with no Claude Code session directory produces zero `subagent:state` messages across a 7s window — success criterion 6 — but with nothing ever claimed there is nothing that could change between ticks either, so this check cannot exercise the dedupe; it is a CHARACTERISATION check in check 20's own sense, earning its place by fault injection (point the watcher at a nonexistent root and confirm nothing throws) rather than by ever having failed on its own. 26 is the positive path, and the only place in either suite the dedupe is proven against a REAL disk through a REAL manager rather than a fake one: a seeded session directory plus its parent transcript produces exactly ONE `subagent:state`, then nothing further across the same window — `verify:subagent` 16 and 21 pin the dedupe's logic against a fake filesystem; this is what proves `createFsWatchDeps` doesn't silently break that guarantee on the way from a fake dependency to a real one. Its own comment records a trap worth knowing: this manager is on the tmux backend, so by the first tick `pollLive`'s live-cwd half has already handed the subagent half the RESOLVED cwd spelling (`/private/var/folders/…`), and seeding the slug or the transcript's confirmation line from the unresolved `mkdtempSync` spelling would make the confirmation read fail against the cwd tmux actually reports — the panel would never be claimed at all, the same two-spelling trap `verify:panels`' prompt fence exists to close, reached through a new door. **27 is the one worth knowing by number**: a REATTACHED session must reuse its ORIGINAL `spawnedAt`, and the fixture seeds the session directory, waits for the panel to settle, then detaches and reattaches to the SAME id with no poll landing in between — isolating the exact window where a fresh `Date.now()` taken at the reattach moment would make `chooseSession`'s post-spawn filter reject the panel's own, already-existing session directory, permanently, since nothing ever re-derives `spawnedAt` again for a session this manager keeps alive. Fault-injected red with the reuse removed: `seen=[]`. It is the sibling door check 26 does not open — a panel reloaded BEFORE its first successful poll, so `detachAll()`'s `clearDedupe()` has nothing yet to preserve, and the property rests entirely on `firstSpawnedAt` surviving in `PtyManager` itself. Check 27 now carries the block's standing `shutdown()` obligation and hands it to whoever writes check 28. **M13's final fix wave moved this suite's `TC_CLAUDE_PROJECTS` fence to MODULE SCOPE**, where it belonged from the start: 26 and 27 set their own roots and restored them, and everything else in the file — including 25, whose whole subject is "this panel has NO Claude Code session" — fell back to `homedir()/.claude/projects`, which is exactly where this suite's default `spec()` points every fixture panel's cwd. A real session directory created DURING a run (this repo is developed with `claude` open in that very directory) post-dates the spawn, so `chooseSession` accepts it and the confirmation genuinely matches — check 25 goes red reporting the developer's own conversation, for a reason nothing in the suite explains and which does not reproduce on a machine without one. Quietly and always, it was a per-tick read into a directory this repo does not own: the rule M9a's git fence and the prompt fence each cost a fix round to learn |
| `verify:window` | real Electron | 4 checks: renderer teardown reaches the PTY layer |
| `verify:ipc` | real Electron | 1 check: every contract channel has a handler — still 31 channels after M13, which adds no invoke at all: `subagent:state`, like `session:live` before it, is an `IPC_EVENTS` send, handled by nobody and counted by nothing — the third time this exact wrong number has been reachable (M6d hit it first and correctly added no channel; a draft of M12's own spec said "31 to 32" and would have failed this suite by fixing a correct count). Still 31 after M12 too, for the identical reason: `session:live` is an `IPC_EVENTS` send, handled by nobody and counted by nothing (see "Live cwd is a poll, a dedupe, and a third store" below for why that is the correct answer rather than an omission). It reached 31 at M9c, whose one new invoke is `review:commit`: a node turns the work it is reporting into a commit, addressed by repository ROOT rather than by a panel id, for the reason `review:at` is (a node outlives its subject). That is up from 30 at M9b, whose three new invokes are `review:baseline`, `review:at` and `review:diff`: a review node is minted from the subject's stored baseline (`review:baseline`), asks its question addressed by THAT baseline rather than by a panel id (`review:at` — see "A review node asks by baseline" below), and fetches one file's hunks on demand (`review:diff`). That is up from 27 at M9a, whose one new invoke was `review:panel`: the inspector's Changes section asks main to diff a panel against its captured baseline, and only main can reach a real git binary. That is up from 26 at M8c (`preset:save-panel`: the inspector saves the SELECTED panel, and main's pre-existing `preset:capture` path answers off `focusedIdRef`, so the renderer needs a channel that can NAME which panel to save — see `verify:panels` 90), 25 at M7 (five workspace invokes: `workspace:list`, `workspace:create`, `workspace:rename`, `workspace:delete`, `workspace:activate`) and 20 at M6c's `agent:acknowledge`. Note the wording: this suite is a single check reporting `1/1`, not "31 checks" — it covers 31 channels |
| `verify:canvas` | real Electron | 6 checks: real input into the built renderer |
| `verify:xterm` | real Electron | 6 checks: an xterm `Terminal` survives its host being detached and reattached |
| `verify:panels` | real Electron | 138 checks: tiering, the pointer corrector, drag, resize, wheel ownership, close, z-order, id uniqueness, dormant restore/wake (18), layout persistence (19), undo/redo (20–22), reset (23), boot reconcile (24), one end-to-end invocation of `session:backend` through the real bridge (25), a real renderer reload leaving its tmux session running (26), and preset spawn, undo-disposes, the pushed default, capture, and the command-less case (27–31). Check 32 is the only preset check the harness does NOT drive by hand: it seeds `layout.json` with a non-shell `defaultPresetId`, installs the same `did-finish-load` push production installs, and reads the template back out of the renderer — see "The default preset is caught at module scope" below. M5b adds the palette: opening it and the focus rules (33–36), the undo guard (37), a rename reaching the store and the input mode clearing afterwards (38, 38b), the switcher framing a dormant panel without waking it (39), `preset:spawn-by-id` end to end (40a), a prompt insert arriving as a bracketed paste rather than a raw write (40), a mouse-picked row not releasing the focused panel (41), a click OUTSIDE the palette closing it and still focusing the panel it hit (42), and the project half of the prompt list end to end — a real `.claude/commands/*.md` under the captured panel's own cwd, listed with its source label and inserted into that panel (43). M6a adds the header chain end to end: a fresh spawn's header names what main actually resolved rather than a hardcoded stand-in (44), a rename typed into the palette reaching the panel's own header, not just the store (45), and one `Cmd+Z` undoing the whole rename in a single step, matching "one history entry per committed gesture" (46). Check 47 is the palette's wheel: a wheel over the open palette — plain and pinch alike — is left uncancelled and moves no camera, while the same wheel on the background is still cancelled and still pans. It asserts CANCELLATION rather than `scrollTop` on purpose; see "Scrolling the palette is a yield" below for why a `scrollTop` check would fail a correct implementation. Two sub-checks cover OS key auto-repeat, the one input this suite had never simulated: five `repeat: true` Cmd+N keydowns spawn nothing further (7b) and five `repeat: true` Cmd+K keydowns do not re-toggle the palette (33b) — see "Auto-repeat is one gesture, not fifteen" below, including what they deliberately cannot prove. M6p adds the palette's structure in a real renderer: section headers rendering once each in `SECTIONS` order (48), a drill-in narrowing to its own rows with Escape popping back **without closing** (49), and a destructive row that is marked, gated by a confirm, and left un-deleted by Escape — read back out of `preset.list()`, not off the overlay (50). Check 51 is the spawn cascade in a real renderer: two `Cmd+N` presses at one camera, in empty world space, must land exactly one `CASCADE_STEP` apart — and the second panel must still have an `.xterm` under it, which is the ONLY place the suite proves a cascaded panel is still inside the cull region and therefore still promoted, rather than merely arguing it. It reads the step out of `panels-entry.cjs` rather than restating 48, and reads each panel by `data-panel-id` rather than "the last `.panel`", since array order and paint order are deliberately different things here. M6b adds the settings row end to end in a real renderer: a setting reached by a keyword it does not display (52), and a toggle reaching `main`'s store — not just the row's own local state — read back out through `settings:list` (53); `scripts/verify-panels.cjs` passes `registerIpcHandlers` an explicit no-op `rebuildMenu`, because this harness is its own Electron entry point with no application menu for `settings:set`'s handler to call. M6c adds the agent-state seam end to end: a real bell reaches a real panel's `data-agent-state` (54); a real OSC window title moves nothing — this block deliberately swaps the harness onto the DIRECT backend first, because a tmux client never sees the title at all and check 55 would otherwise pass against a broken scanner for a reason that has nothing to do with the scanner, see "Under tmux, `PtyManager` never sees the agent's own OSC title, and the trap is unreachable there" below (55); the state reaches a DEMOTED panel's card, not only a live panel's border, panning the culprit off screen first (56); and focus is what acknowledges it, with the value read back from main's own store rather than the panel's local class, proving main is the one that answered (57). M6d adds the attention-routing seam end to end: an off-screen `wants-you` panel gets a pip at the exact point `edgeIndicator` computes (58) — this checks WHERE the pip lands, not merely that one exists, because a per-axis clamp (see "`edgeIndicator` clips a ray" below) corners every diagonal and still renders *a* pip, so a check that only asked "does a pip element exist" would pass against that exact regression; a pip disappears the moment its panel scrolls back into view with the underlying state unchanged (59); the `agent.edgeIndicators` setting is findable by keyword in the palette and actually hides the pips when toggled off, through main's real store (60); `Cmd+J` frames the waiting panel at the same scale, spawning nothing (61); the jump does NOT acknowledge — the panel stays selected and stays `wants-you`, and the check reads the rendered border COLOUR, not the state, because the failure this guards is purely visual (62); and focus is still what acknowledges a panel reached by the jump key, with its pip leaving as the state clears (63). M7 adds workspace switching end to end (64–71, plus 70b): **64 is the one to know by number**: a switch away and back keeps the SAME pid for every session — every other check in this milestone stays green against an implementation that quietly disposes and respawns on switch instead of demoting, because a respawned agent looks identical to a reattached one in every check that only reads panel/session COUNTS; only the pid survives to tell them apart. 65 is "demote, not dispose" stated as two facts that must both hold in the same read: a hidden workspace's panel is out of the DOM (`panelsInDom === 0`) while its session is still in the registry (`sessionsInRegistry > 0`) — the DOM half alone passes against a dispose, the registry half alone passes against a switch that never rendered. 66 is the id-collision guard: a spawn in one workspace mints no id any OTHER workspace's `allPanelIds` already claims, because `PanelId` doubles as the tmux session name (see "Panel ids are global, not per-workspace" below). 67 asserts `Cmd+Z` immediately after a switch is INERT — an uncleared undo stack would let it apply the OTHER workspace's panel array here and dispose sessions this workspace still wants running. **68 is the mass-spawn check**, and it is deliberately built against a workspace this renderer has never rendered before, seeded on disk with a persisted `focusedId` — `assignTiers` pins a focused panel live unconditionally, so if `dormantIds` were ever wrong on the switch's first render (committing `next` before `pty.list()` resolves — see "A workspace switch is a second boot" below) this fixture forces it into a spawn rather than merely hoping a camera/cull coincidence produces one; checks 64–67 all reuse an already-rendered workspace and would stay green against that exact regression. 69–70 drive the real gated delete action, not a bypass — `deleteWorkspace` disposes every session and the record only after a real Enter answers the confirm (69), and a real Escape leaves the workspace undeleted, read back from `workspace.list()` rather than off the overlay (70), the same "a confirm step that confirms unconditionally is invisible" reasoning check 50 already established for presets. 70b is M6d's premise at its strongest: a `wants-you` panel whose whole CANVAS is hidden, not merely off screen, still shows a waiting count on its workspace row in a real rendered palette, through main's real store. **71 is the only-workspace case**, reachable solely by deleting every other workspace first: deleting the LAST one must not resurrect its just-disposed panel ids in the fresh replacement workspace main installs — the same resurrection bug the "outgoing write" ordering note (below) exists to prevent, caught here on the read side instead of the write side. Two sub-checks cover the drill-in arrows: 49b is ArrowRight opening the door under the selection and ArrowLeft popping back out, asserting the same three facts about WHICH scope opened that 49 does, so an arrow that opened the wrong drill-in still fails. **49c is the one worth knowing by number**: the arrows are caret-gated (ArrowRight only from the end of the query, ArrowLeft only from position 0), and 49b passes against an implementation with no gate at all — which would leave `.palette__input`, the one text field in this app the user cannot tab out of, permanently uneditable once anything is typed into it, since no key would be left that moves the caret back in. 49c presses each arrow from the wrong caret position and asserts nothing happened, then from the right one and asserts it did. Hover adds 72/72b/72c: a mousemove over a runnable row makes it the SELECTED row — the same class the arrow keys drive, because hover moves the one `index` rather than painting a second highlight (72); a mousemove over a DISABLED row leaves the selection alone, the rule `stepRunnable` already states for the arrow keys (72b); and **72c is the one worth knowing by number**: a second mousemove at coordinates IDENTICAL to the previous one, on a different row, must move nothing. Blink re-dispatches a mousemove at the unchanged cursor position after a scroll to refresh `:hover`, so without the coordinate guard an ArrowDown that scrolls the list hovers whichever row slid under a stationary cursor and drags the selection straight back — the arrow keys become unusable whenever the pointer happens to rest over the list. No synthetic `WheelEvent` can produce a real scroll here (the limit check 47 records), so 72c reproduces the SIGNAL instead of the gesture. All three live in this suite and not `verify:palette` for one reason: the plain-node tier has no DOM and cannot dispatch a mouse event at all. M8a adds the shell frame end to end (73–78, plus 75b and 75c). **73 is the one to know by number**: it asserts the EXACT inset — `canvasWidth === windowWidth - railWidth - inspectorWidth`, ±1 for fractional device pixels — and it has to, because every looser bound it also carries survives the one CSS failure the frame's own comment names. Drop `min-width: 0` from the canvas grid cell and the item refuses to shrink below its content, so the canvas overflows and shoves the inspector off screen; `getBoundingClientRect().width` reports a width for an element pushed out of view exactly as it does for a visible one, so the rail is still 240, the inspector still 260, and an overflowing canvas is still comfortably under `windowWidth - 80`. Only the identity fails, because an overflowing middle cell is precisely a canvas WIDER than the space the other two leave it. 73's second half is the `.xterm` probe — a panel is still PROMOTED on the narrower host — which is not tautological the way "the canvas got narrower" is: a smaller canvas is a smaller cull region, and a frame that quietly demoted the panel the user was looking at renders a card with no error anywhere. 74 is the palette's outside-click exit reached from a shell click, an ADDITIONAL door rather than a replacement — 42 still pins the canvas case and must stay green. 75 collapses the rail, reads the result back out of main's store through `settings:list` — not off the shell's own class, for the reason check 53 already established: a toggle that only flips a local boolean looks identical on screen and is gone at the next launch — and asserts nothing was DEMOTED by the collapse, which is the spec's own conjunction and until the final review shipped as two checks that never met (73 asserts `.xterm` but collapses nothing; 75 collapsed but never looked at promotion, leaving success criterion 3 asserted nowhere). That last clause is near-tautological today and its comment says so: nothing in the renderer observes the canvas host's SIZE, so a collapse re-runs no tiering at all — see "Two second-order effects" below. It is there for the future change that makes a width change re-tier. 75b is the auto-repeat guard on `Cmd+\`, and like 7b and 33b it supplies `repeat: true` BY HAND — it proves the guard READS the flag and says nothing about who sets it. **75c is the transferable one**: a shell control takes neither DOM focus nor the app's `focusedId`, driven by a REAL `sendInputEvent` rather than a dispatched `MouseEvent` — see "A dispatched `MouseEvent` cannot test focus behaviour" below, and note what its own comment says it cannot distinguish (a control that swapped `focusedId` to a DIFFERENT live panel while DOM focus stayed put would satisfy both halves; M8b's rail start control is such a button — it DOES call `onSelectPanel` — and the claim survives it anyway for a narrower reason: `onSelectPanel` (`Canvas.tsx`) is `selectAndRaise` + clear-dormant + `registry.wake` and never touches `focusedId` at all; only `onFocusPanel` calls `setFocusedId`, and no shell control calls `onFocusPanel`). 76 is the New panel button spawning EXACTLY one panel, through main — exactly-one is half the check, since a button whose click also reached the canvas background would spawn once and select something else, and a double fire looks identical to a slow machine. 77 is the zoom cluster, and its Fit half needed three ANDed clauses before it could fail at all: not-where-the-steppers-left-it kills a Fit wired to nothing, a FIXED-POINT clause (clicking Fit twice lands the same scale) is what separates a fit from a stepper — `ZOOM_STEP` is 1.2 and this fixture's real fit is ~1.194, so a "the scale changed" bound cannot tell a copy-pasted zoom-in handler from the real thing — and not-equal-to-1 kills `resetViewport` deliberately rather than by coincidence. The fixed-point form was chosen over recomputing the fit in the harness precisely so the harness never grows a second copy of arithmetic `verify:viewport` already pins purely; clause (c) is fixture-dependent and its own comment says the response to it going red is to change the fixture, never to widen the bound. 78 is search opening the palette and settings opening it IN the settings scope — the scope half is the one that matters, because a setting row is `hiddenAtRest`, so a button that merely opened the palette would land the user on a list with no settings visible at all, a feature that reads as missing. M8a's final review adds 79 and 80. **79 is the palette -> SCREEN direction, and it is the only check that covers it**: `shell.railOpen` is an ordinary boolean `SettingDef`, so main's `settings:list` AUTO-GENERATES a runnable palette row nobody wrote, and running it must move the rail rather than only persisting — check 53 is palette -> store and check 75 is button -> store, and both stayed green while a palette toggle wrote to main and left the frame exactly where it was, with the row's own title then reading "Off" beside a visibly open rail. 80 dispatches the INSPECTOR chord the way macOS actually delivers it — `{ key: '|', code: 'Backslash', metaKey: true, shiftKey: true }` — and asserts `shell--inspector-collapsed` flips while `shell--rail-collapsed` does not. One check, three regressions, two confirmed by fault injection, the third unreachable by construction since 80 reads the class name directly: reverting `useShellChrome`'s `event.code` test to `event.key` (75b stays green because it supplies a matching `key` AND `code`), `toggleRail()` written into BOTH chord branches, and a mistyped `shell--inspector-collapsed`. M8a's final fix adds 49d and 49e, the two halves of "popping a drill-in returns the selection to its door" (see that entry below). **49d is where the bug was actually reproduced**, and its shape is the transferable part: it ANDs five clauses, of which 1–3 exist purely to stop it passing for the wrong reason — the door was the selected row BEFORE the arrow, the scope chip really did read `Settings` after it, and the overlay really did pop and survive. Without those, an `ArrowRight` that silently failed to enter leaves the query reading `manage settings` with the door still selected, and a check asserting only "the door is selected at the end" goes green against a completely broken drill-in. Clause 4 (`.palette__row--selected` exists at all) is the other easy miss: index `-1` renders no selected row, which satisfies any assertion phrased as a negative. **49e is the only check that distinguishes the shipped design from the obvious alternative**: it pops a scope the top-bar gear opened, where no door was ever traversed, so an implementation that remembered the entered row's id in a ref satisfies 49d and cannot satisfy this at all. It is deliberately not folded into check 78, whose subject is that the button opens IN the scope and which must keep failing for its own reason. M8b adds the panel outline end to end (81–86). 81 is one row per panel with a REAL pid in its tail — the pid half is what makes it more than a count, since a row rendering the panel id, or a hardcoded stand-in, satisfies "there are N rows" while telling the user nothing main actually resolved; an empty label is rejected explicitly, because a blank row is indistinguishable from a styling bug at a glance. 82 is a rename typed into the palette reaching the rail row, and it is a live hazard here and nowhere else: `railRows` is deliberately frozen on a signature, so getting that signature's fields wrong freezes the rows forever with nothing throwing and the panel's own header still correct beside a stale one. **83 is the one to know by number, and it is worth knowing as much for what it does NOT prove**. What it establishes: a real bell through a real PTY moves the TARGET row's dot to `wants-you`; no other row's dot moves with it; and at least one non-target dot is carrying a REAL agent state rather than a degenerate stand-in (`othersAreReal`). That last, non-vacuity clause is what catches a dot derived only from the attention set — which knows only "is this panel waiting" and so collapses every non-waiting state to nothing — but it does not catch every list-level implementation: one that read the full per-id state map and passed real values down would still paint `starting` on the other rows and pass. **83 therefore does not establish that each row subscribes individually**, which was the plan going in and which fault injection found unprovable from the DOM — see "Agent state reaches a rail row by the row's own subscription, and no check proves it stays that way" below. Its fixture is the other transferable part: it spawns its OWN `/bin/sh` through `PRESET_SPAWN` rather than ringing the bell at 82's `Cmd+N` panel, because `Cmd+N`'s default here is `/bin/cat -v` and `cat` merely ECHOES the bytes it is handed rather than interpreting them, so `printf '\007'` never becomes a real bell byte and the check could never pass, on correct rail code or broken — the same substitution checks 54–63 and 70b already make, and the trap 70b's own comment documents. 84 and 85 are the dormancy pair, on a fixture seeded for it (`rail-dormant`, parked at world 60000,60000 by the same disk-append-and-reload route check 39's `never-woken` uses, because M7's check 71 deletes the last workspace and 39's fixture does not survive it). Both of 84's clauses are load-bearing and neither restates the other: the CAMERA clause is what rejects a row wired to nothing at all, since the no-spawn clause alone passes there — a panel nobody touched really is still dormant — while the DORMANCY clause is the only one that would catch a row wired to CENTRE AND WAKE, the genuinely dangerous shape, because the camera moves exactly as expected and the row looks completely correct on screen while quietly launching a process. A row wired to `onSelectPanel` as this codebase actually defines it (`selectAndRaise` + clear-dormant + `registry.wake`, with no `centreOn` anywhere in it) fails BOTH clauses at once — it never frames — but that is a coincidence of what `onSelectPanel` happens to do today, not a property either half relies on. 85 is the other side: "never wakes" is satisfied just as well by a rail that CANNOT wake, an arrow rendered and inert beside a dormant panel it can never start. 86 reads three facts in one wait — the row is gone, the `.panel` is gone, and `__m4aSessions` no longer holds it — because each alone passes against a different wrong close; note that its session clause is weaker under the DIRECT backend, where the 84/85 reload leaves that panel dormant with no session to lose, and the weight there is carried by the row and the `.panel` both going. M8c adds the inspector and restart in place (87–94). 87 is the read half end to end: the pane shows what MAIN RESOLVED — asserted as an absolute path, because "non-empty" is satisfied by the spec's own `login shell` stand-in — with the spec link rendered SEPARATELY beside it and the pid read back out of `pty:list`. 88 is the empty state, whose panel and waiting numbers are DERIVED from the live canvas rather than hardcoded: checks 54/57/63 ring and acknowledge real bells earlier in the same run, so a hardcoded `0` fails as "0 !== 1" and points nowhere. 89 is an inspector rename reaching all three views — panel header, rail row and inspector heading — through the palette's own input mode, so there is still exactly one rename. 91 is M6a's outstanding success criterion finally OBSERVED: a real tmux-backed session survives a real renderer reload and the inspector says so, with the same pane pid either side. It reads the SELECTED panel alongside the badge, because a badge count of 1 on its own is satisfied by a stale selection left over from check 90 — the badge would be real and about a different panel entirely. Two things it had to learn are recorded in its own comment: it must put the manager back on the TMUX backend (the M6c block deliberately swaps to the direct one, whose `hasSession` answers `false` unconditionally by design, so reattachment is not merely unlikely there but unreachable), and it must click the panel's rail row first, because the restored panel lands off screen, is never promoted, and therefore never reattaches until something frames it — which is also the honest user story. 93 pins Restart present and DISABLED for a panel that never started, rather than absent. **90 is the first of the two worth knowing by number**: it is the only check in this suite driven with `selectedId` and `focusedId` DELIBERATELY DIFFERENT, and that is the whole check — taken with them equal it passes against the very defect `preset:save-panel` exists to remove, main's own `preset:capture` path answering off `focusedIdRef`, which would have saved the wrong panel every time the user reached the inspector by clicking a rail row (the one gesture that selects without focusing). It spawns its own second panel at a distinct, SPACED cwd, because every panel still alive at that point shares one and a same-cwd pair cannot discriminate the selected preset's subtitle from the focused one's; both ids are read out of production markup rather than through a test hook, since `.panel--selected` IS the selection and DOM focus living inside a panel IS that panel being focused. **92 is the second**: restart replaces the process AND does not inherit the old `wants-you`, read in one go because each half alone passes against a real bug — the pid alone is satisfied by a fresh agent wearing a dead one's amber border, and the cleared state alone by a "restart" that only calls `clearAgentState` and never touches the process. Its IMMEDIATE-state clause is the discriminating half, and it was added only after fault injection: the SETTLED state is identical either way, because main's `create` re-seeds `starting` a moment later (see "`starting` is sent directly" below), so deleting `clearAgentState` left the first draft green. The third clause — an `.xterm` back under the panel — is what `bumpVersion` earns, and the pid clause cannot see its absence, because the pid changes whether or not anyone rendered. **94 pins two SOURCE-TEXT counts**: `pty.kill` still has exactly two callers in `session-registry.ts`, and `Canvas.tsx` has exactly five `dispose` sites. It reads the source deliberately rather than as a shortcut — no runtime behaviour can observe how many callers a function has, and prose alone has already lost this number once (see "Undo removing a panel must dispose its session" below). When a later milestone legitimately adds a dispose call site it goes red, and the number is then updated DELIBERATELY with the reason in the commit message; note that it regex-counts the literal call over the whole file, comments included, so a comment that spells the call with its parentheses breaks it. M8d adds the rail's other two sections (95–98b). **95 is the one to know by number**, and it is check 64's argument inherited by a second door: the pid is the only observable that separates a real demote-and-switch from a dispose-and-respawn, so a rail switch that quietly disposed would satisfy every count, every layout read and the file on disk, and only the pid would say otherwise — which is the spec's "the shell adds no second switching path" written as something a check can fail. Its workspace ids are CAPTURED rather than hardcoded, because `nextWorkspaceId()` mints over whatever already exists and this suite has created and deleted several by the time it runs, so a literal would be a guess. A wrong guess fails LOUDLY rather than quietly — `clickRail` finds no row, returns false, and the `clicked === true` clause goes red — so the capture is what keeps the check runnable, not what keeps it honest. 95b pins the ACTIVE workspace's row present and DISABLED rather than absent — `verify:palette` 60's rule — with its rename and delete controls still there. PRESENCE is exactly what it tests for those two (`disabled` is asserted on the row's main button alone), and they have to be present because deleting the workspace you are in is a supported path that switches away first. **95c is the one the final review added**, and it is the only check that any workspace-row verb besides the switch actually DOES something: 95b tests that the `✎` and `×` elements exist, and a missing `{...shellControl(...)}` spread on either leaves it — and every other check in the milestone — green while the spec's central claim goes unproven for that door. It clicks the rename control and asserts the palette opened in TEXT INPUT mode carrying that workspace's own name, and the name clause is the whole check: asserting only that the palette opened passes against a row handing over a hardcoded id, or the ACTIVE workspace's id instead of its own, both of which open a perfectly real prompt aimed at the wrong canvas. So its target is deliberately a NON-active row, read out of `workspace.list()` rather than named literally — against the active row the id-swap would be indistinguishable from correct. It stops at the door rather than driving the rename home, and it Escapes back out, because 96–98b run after it and spawn panels against the fixture as it stands. `+` and `×` stay unchecked deliberately: create is reachable only through the same input mode 95c already opens, and delete would destroy a workspace those later checks need. 96 is 70b's fixture reached from the rail, and the strongest form of M6d's premise: an agent waiting in a workspace whose whole CANVAS is hidden still says so, on that workspace's rail tail. It asserts that count and nothing more. The other half of the division — that Attention cannot name a panel absent from this canvas — is true by CONSTRUCTION rather than pinned here, since `buildAttentionRows` is handed the active workspace's own rows and has nothing else to draw from; no check asserts the omission, and a later reader should not take 96 for one that does. **97 is the check the attention section exists for**, and TWO of its three clauses do the discriminating: the camera moving rejects a row wired to nothing, and the amber SURVIVING is the one that pins "the shell never acknowledges". The row merely EXISTING rejects nothing on its own — a section that listed every panel satisfies it trivially, which the check's own comment says in as many words — and the clause that actually rejects that rail lives in 98, not here. 97 reads the rendered border COLOUR rather than the state for check 62's reason, and it was confirmed by fault injection: making the row also call `agent.acknowledge` turns it red on the colour clause alone, with the row, the click and the camera all still correct. It also pans the panel away BEFORE the click, so "the click framed it" is a claim the camera can falsify — clicking a row for an already-centred panel moves nothing and passes against a dead handler. 98 is the other half: focus clears the state AND the row, which is what makes the section a VIEW over the attention set rather than a list with a life of its own — a row that outlived the state would navigate to a panel with nothing to say and the queue would only ever grow. Its `row === false` clause is doing double duty and is not redundant with 97: it is the ONLY assertion in the milestone that a list-everything section fails, because such a section keeps the row after the state clears. It reports a missing `.panel__slot` as a FAILURE rather than throwing, precisely so a red 97 cannot abort the run and take 98b's RED with it. 98b pins the empty state, which is what this section shows nearly all the time. The count was 114 while the last number was 98, because of the lettered sub-checks `7b`, `33b`, `38b`, `40a`, `49b`, `49c`, `49d`, `49e`, `70b`, `72b`, `72c`, `75b`, `75c`, `95b`, `95c` and `98b`. M9a adds the Changes section end to end (99–101), sharing one fixture repository across all three — the only place in the milestone where a real panel, in a real renderer, is driven against a real git repository, rather than argued through a fake runner. **99 is the check the whole section exists for**: it writes a file through the panel's OWN PTY (`printf > agent.txt`, not a file main wrote itself from node), because a node-written file would prove the engine works and say nothing about whether the PANEL'S cwd is what got reviewed. Both of its own races are guarded explicitly rather than papered over with a fixed sleep: `sessionMap` waits for the PTY to exist before the write lands (a write issued right after `PRESET_SPAWN` can land before there is a session, do nothing, and leave the repository clean — a failure that looks exactly like a broken engine and points nowhere near the racing fixture that caused it), the same wait check 83 already uses for the identical reason. 100 is the negative — no section at all for a panel outside a repository, asserted as the element being ABSENT rather than as empty text, because an empty-but-present section is a visible blank gap in a 260px pane — and it is explicitly weak on its own: it passes vacuously before the section exists at all, so it is only evidence once 99 has been watched red first. It also needed its own wait: Canvas's review query is an async IPC round trip, so the OUTGOING panel's section is still on screen for a moment after the click lands, and a bare read right after `selectPanel` can catch that stale state and fail for a reason that has nothing to do with whether the new panel's own answer is correctly hidden. **101 is the only place the mixed-checkout rule is proven against a real store, a real engine and real git rather than a fake** — two panels sharing one repository read `shared`, never a confident wrong attribution to either — and it carries the same two-races-stacked shape 99 does: `sessionMap` proves the PTY exists, but `captureBaseline` is ITSELF fire-and-forget on top of that (a spawn must never be delayed by a git process), so the check also polls `review:panel` directly until its `kind` leaves `never-started` before selecting — sessionMap alone cannot see a baseline that has not landed yet. Getting check 100 actually green surfaced a real gap in `review-engine.ts`, not a fixture bug: see "The baseline is captured once, and `reattached` is why" below for what `notARepo` closes and why it is optional. M9a's final fix wave adds **100b, the check that reproduced the stale-render defect**: selecting panel B rendered panel A's file list — a real list, with real counts — under B's heading, because the review effect cleared its state only when the selection went to NULL. The `live` flag prevented the stale WRITE; nothing prevented the stale RENDER, and the window is an IPC round trip plus up to four git subprocesses, i.e. plainly visible on a real repository. Its SHAPE is the transferable part, and two earlier drafts of it were green against the unfixed renderer. It asserts POSITIVELY — one consistent DOM read pairing "which panel is selected" with "is a summary on screen", since the two commit together — because "the summary is absent" is satisfied before React has even processed the click. It skips `settle()`, which is long enough for the invoke to resolve and therefore closes the window entirely. And it selects through the RAIL ROW rather than a coordinate click: cascaded spawns overlap and selecting A raises it, so a click aimed at B's header lands on A, and the check went green while the selection never moved at all. The same wave makes 99–101 SKIP loudly when no git binary is found — they hard-failed the whole suite as an `infrastructure` error before, the rule `verify:review` already obeyed — gives check 100 its OWN non-repo temp directory instead of assuming `~` is not a repository (dotfiles-in-`$HOME` is a common setup, and it is what this repo's own developer has), removes both fixture repositories on the way out, and FENCES the harness's git runner to its own `tc panels ` temp prefixes. That fence is not tidiness: `captureBaseline` fires on every `pty:create` and most fixture panels are pointed at `~`, so on a machine whose home directory is a git checkout the suite ran `git stash create` against the whole home repository once per spawn — minutes of real work in a repository this repo does not own, the same rule as "the verify suites must never touch the production socket", and it took the suite past its own 120s watchdog, which is how it was found. The fence carries TWO prefixes, because macOS `tmpdir()` is `/var/folders/…` while `rev-parse --show-toplevel` answers `/private/var/folders/…`: a single-prefix fence blocks the capture's second call, and 99/101 then report `never-started` for a repository that is right there. M9b adds the review node end to end (102–111, plus 111b). 102 asserts BOTH halves in one read — the node renders its subject's real files AND has no `.panel__slot` and no `.xterm` under it — because the empty terminal host is precisely what a copy-pasted `TerminalPanel` gives. **103 is the one to know by number**, and it is success criterion 4's teeth: the node holds no `PanelSession` (read from `__m4aSessions`, the RENDERER's registry, not `pty:list`) and the xterm count is unchanged from BEFORE the node existed — because "the node has no xterm" is satisfied by an implementation that quietly demoted some other panel to pay for it. 104 pins it as a child of `.world` by a real camera move rather than by a CSS ancestor, 105 is check 47's wheel pair on a second surface (cancellation, never `scrollTop`), 106 is the inspector's creation gesture, 107 is the id collision (see the row above and the check's own comment), and 108 is the rail row navigating. **109–111b are the survival half.** 109 is a REAL reload — the node comes back and still ANSWERS, which needs its own `subject` record to have survived and needs nothing of its subject's session. **110 is the milestone's headline claim**: the subject panel is closed, which drops its baseline in main, and the node keeps reporting its files — re-QUERIED through its refresh control, not merely still painted. It cannot be watched failing against correct code and was proven by fault injection: pointing the node at `review:panel(subjectId)` turns 110 RED while 102 — the same node, rendering the same files, with its subject alive — stays GREEN, and that contrast is what shows 110 tests the OUTLIVING rather than the rendering. Two things had to be learned to make it fail at all, and both are recorded in the check: the harness's own `dropBaseline` hook has to mirror main's and drop the PERSISTED record too (it dropped only the in-flight capture, so the injected node kept getting answers), and the final assertion has to be a SUSTAINED hold rather than a `waitUntil` — the node does not clear its result while a refresh is in flight, so a `waitUntil` is satisfied instantly by rows painted before the close and the injected defect slipped past it about half the time. 111 and 111b are the close and the UNDO, and their discriminating clause is neither the DOM nor the pids: a kill aimed at an id that names no session is swallowed at every layer below the IPC door (the direct backend's `destroy` is a no-op, tmux's `cli` eats a non-zero exit, `dropBaseline` for an unknown id drops nothing), so with both kind guards deleted every renderer-visible fact is unchanged and both checks stayed green. The harness therefore records every id main is ASKED to kill, by shadowing `PtyManager.kill` before `registerIpcHandlers`, and the checks assert the node's id is not among them — with the guards removed, both go red naming the exact stray kill. That assertion is a NEGATIVE against a recording mechanism, which is the vacuity trap `verify:pty-manager` 18's first clause exists for, so each check also closes a REAL terminal panel inside its OWN window and asserts that id IS present: 111 closes check 100's outside-a-repository panel, 111b closes the subject it spawned itself, and neither borrows the other's positive, because a positive recorded in an earlier window proves only that the probe was alive earlier. Both halves were confirmed by injection — remove the shadow and both go red with `kills=[]`; remove the kind guards and both go red with the stray kill listed beside the real one. **112 is the whole-branch review's one coverage gap closed**: a selected review NODE renders no Changes section and therefore no review button. The section was fed by an effect that fired `review:panel(selectedId)` for whatever was selected, and main holds no baseline for a node's own id — so the engine answered `never-started`, which is a perfectly correct answer to a question nobody should be asking, and the pane rendered the note "this panel has no session yet" under a heading for a panel that will never have a session, above an "Open review" button whose handler refuses a node as a subject and returns. Both halves are ONE wrong query rather than two bugs, which is why one clause removes both. Its non-vacuity clause is what lets it fail honestly: the two assertions it cares about are NEGATIVES, and the inspector's empty state — exactly what a selection that never landed produces — satisfies both, so the same read also demands the node's own `reviews` field, which only `buildInspectorModel`'s review arm emits. It selects through the RAIL ROW rather than by clicking the node, because `goToPanel` centres before it selects and this block has panned the camera several times by then. Watched RED before the fix, reporting `reviews:true, reviewButton:true, note:true` — the node genuinely selected, both defects on screen. M9c adds the write verb end to end (113–115), on its own repository rather than check 99's, because by 112 that fixture's subject panel has been closed and its node closed and undone. **113 is the headline**, and its three ANDed clauses each reject a different real bug: HEAD advancing by one is satisfied by a commit carrying the wrong paths; the committed path being right is satisfied by a node that never advanced its own baseline and would re-commit the same content on the next press; and the node then reading clean is satisfied by a node that lost its result entirely and renders nothing. It drives the node's OWN control and OWN input — a real `sendInputEvent` click for check 75c's reason, then the native value setter plus an `input` event, since assigning `.value` alone leaves React's state untouched and the commit would go out with an empty message — rather than calling `review.commit` from `executeJavaScript`, which would exercise none of the three things this milestone added. It waits on the node's own summary rather than sleeping, because a `pre-commit` hook is legitimately slow and a fixed sleep is a flake rather than a bound. 114 is Escape cancelling, read back out of `git log` rather than off the overlay — check 50's rule for the palette's confirm, that a cancel which cancels unconditionally is invisible and so is one that does not — and it writes new work first, since 113 left the node clean. 115 reaches the BLOCKED arm honestly rather than by a fixture flag, by spawning a second panel into the same repository, and asserts present AND disabled in one condition: asserting only `disabled` passes against a control that is missing entirely, and asserting only presence passes against one that would happily commit another agent's work. Two limits are worth knowing before reading these greens as more than they are, the shape this file already records for checks 32 and 47: the Enter and Escape presses are DISPATCHED `KeyboardEvent`s, so they prove the node's own `onKeyDown` does the right thing and say nothing about what the browser would have done on its own; and 113's clean clause matches on rendered summary TEXT, so a rewording of `buildReviewNodeModel`'s clean summary turns it red for a copy reason rather than a behavioural one — the fix then is to update the regex, not to widen it. All three skip loudly with the rest of 99–101 on a machine with no git binary. M12 adds the two consumers end to end (116–117) and rewrites check 90. The
final fix wave also rewrites check 30, once review found it was the check that
actually needed to change for the menu's `onCapture` path — see "Display
renders nothing without a live answer" below for why 90 alone left that
surface uncovered. Both new checks need tmux — `pollLive` calls `backend.list()`, which answers `null` on the direct backend BY CONTRACT, so there is no live answer to observe there at all — and both skip LOUDLY, gated before anything is spawned so a skip leaves no half-built fixture behind for whatever is appended next. 116 is the display half in a real renderer, and it is the first thing to exercise the hook, the one canvas-wide subscription and the store together: `verify:rail` 61 proves the MODEL carries both rows, and nothing between that builder and a painted pane is covered by it — the hook could be reading the wrong id, the subscription could be missing, the store could be empty. Its SPAWN clause is the discriminating half, because a merged implementation shows the new directory and looks completely correct; and it WAITS on a 2s tick rather than sleeping, since a fixed sleep against a poll is a flake and not a bound. **117 is the only proof the consumer half is WIRED rather than merely present**: a panel spawns in one directory, `cd`s into a second that has its own `.claude/commands`, and the palette must list THAT project's prompts — and it cannot pass off the spawn directory, because the harness's prompt fence answers `[]` for every cwd but its own fixtures. The failure it catches is a row that never appears, indistinguishable from “this project has no commands”, the same silent shape check 43 exists for. **Check 90 was rewritten and now DISCRIMINATES where it used to pass by coincidence**: it asserts the saved preset's subtitle against a live directory deliberately DIFFERENT from the spawn one, sent by hand at that point in the run because the manager is still on the DIRECT backend there and no real `session:live` would ever arrive — which is what turns “the saved cwd happens to equal the spawn cwd” into a claim about which one `savePanelAsPreset` actually reaches for. A consumer reverted to `panel.spec.cwd` alone now fails it, and it is the only coverage the preset consumer has. The harness's prompt fence also became a SET carrying BOTH spellings of each fixture directory, for the reason its git fence already carries two prefixes: macOS `tmpdir()` is `/var/folders/…` while tmux's own `pane_current_path` answers the resolved `/private/var/folders/…`, so a single-spelling fence turns check 43 — which predates M12 and asserts nothing about a live cwd — red the instant ANY panel's first live tick lands. The count was 135 while the last number was 117, because of the lettered sub-checks `7b`, `33b`, `38b`, `40a`, `49b`, `49c`, `49d`, `49e`, `70b`, `72b`, `72c`, `75b`, `75c`, `95b`, `95c`, `98b`, `100b` and `111b`. M13 adds the fan-out end to end (118–120), fenced to its own `TC_CLAUDE_PROJECTS` root — set at module load in `panels-entry.cjs`, before the `PtyManager` above is constructed, so this suite can never read the running developer's real transcripts, the same rule M9a's git fence and the prompt fence both learned the expensive way. All three are deliberately OUTSIDE the git-gated block: subagent detection is filesystem-only and needs no git binary, so gating it there would skip real coverage on a machine that has git but transiently fails the version probe, for a reason unconnected to this feature. 118 seeds one session directory holding two subagents — one still running, one completed by a `tool_result` in the parent transcript — and asserts both rendered STATES, not merely a count: a layer that painted every record as `running` would satisfy a bare count perfectly, and `done` is half the feature. **119 is the milestone's central claim, and a whole-branch review found the first draft's own comment overclaimed what it proves**: it carries two INDEPENDENT clauses rather than one restated twice. `heldByRegistry` checks whether a subagent record's id (`agent-a1`, a `.meta.json` filename) collides with a `PanelId` key in `__m4aSessions()` — those are DISJOINT namespaces by construction, since nothing threads a record id into `registry.ensure`, so this clause can only ever catch one narrow regression (literally reusing a record id as a panel id) and does NOT establish "no node holds a `PanelSession`" the way the identically-shaped clause genuinely does for a review node in check 103, whose id IS a `PanelId` minted from the same `nextIdRef` counter every terminal panel's is. The clause that actually proves the claim is the registry's session COUNT, read before any subagent fixture file exists and again after the fan-out renders, unchanged — what cancels out is the subject panel's own session, and what is left is "the nodes arrived and minted nothing," independent of what a node happens to be keyed by. The live `.xterm` count is asserted as an EXACT expected value (`before + (subjectLive ? 1 : 0)`), never a bare "unchanged or +1": by check 119 roughly 117 checks' worth of panels have already spawned across this long-running suite and `LIVE_BUDGET` is a real constraint none of them clear away, so whether the SUBJECT panel itself wins a live slot is genuinely undetermined, and a looser bound would pass against an implementation that quietly demoted one panel to promote another while a node added a WebGL context of its own — two changes cancelling out where only one is allowed. A non-vacuity guard (`nodeIds.length > 0`) is required for the same reason checks 102/103 carry one for a review node: without it, a feature that silently rendered no nodes at all satisfies every other clause here trivially. 120 drags the parent through its own chrome — the same route check 9 uses, not a camera move, which would translate the whole `.world` and pass against a node welded to the wrong panel — and reads the child's box before and after, asserting it followed by the drag distance exactly. The parent id is read back OUT OF THE DOM, a node's own `data-panel-id` attribute, rather than assumed to be the spawned panel's id, because the DOM is the fact a real drag has to act on. **What 120 does NOT cover is the other half of its own success criterion**: "nodes follow a dragged parent at 60Hz *without re-rendering any panel*". The FOLLOWING is what it measures; the no-re-render half is argued from `memo` on `SubagentGroup` plus `setPanelRect`'s `{ ...p, rect }` preserving every other panel's object identity, and is asserted NOWHERE — a render count would mean a side effect during render in production code whose only consumer is a check, the same trade declined for `RailPanelRow`'s per-id subscription (see "Agent state reaches a rail row by the row's own subscription" below). Do not read a green 120 as proof of both |

None need a display; the real-Electron ones open a window with `show: false`. There is no
test-name filter in any of them — each runs everything and exits non-zero on any failure.
To add a check, append an `ok(...)` assertion in the IIFE.

**A check that THROWS aborts the run, so every check written after it never executes — and
its RED is therefore not evidence.** These are single scripts with no per-check isolation:
`ok(...)` records a failure and carries on, but an uncaught exception — calling an export the
module does not have yet, indexing a `querySelector` that returned `null` — ends the process
where it stands, and every assertion below it is simply never reached. `verify:panels` softens
that only at the reporting end — its body is wrapped in a `try` that records an
`infrastructure` failure and still prints a summary — and everything after the throw is lost
there too. This cost a fix
round in M8c: a test-first RED threw a `TypeError` from a function the task was about to
write, the run stopped there, and the report claimed a later check had been watched failing
when it had never run at all. Two habits follow. When writing checks test-first, note which
checks a throw prevented from running and confirm their RED **separately** — a suite total
that drops by four proves nothing about which four. And prefer guarding a call that may not
exist (`if (row) row.run()`) over making it bare, which is exactly why `verify:palette` 66 is
written the way it is: an absent row would otherwise have taken 66b's RED down with it.

**Why the Electron binary and not `node`.** `node-pty` is a native module compiled against
Electron's ABI by the `postinstall` `electron-rebuild`, so it will not load under system
Node. `verify:pty` and `verify:pty-manager` therefore run under Electron with
`ELECTRON_RUN_AS_NODE=1`; `verify:window`, `verify:ipc`, `verify:canvas`, `verify:xterm`, and
`verify:panels` need the real app lifecycle and `unset` it instead. `verify:viewport`,
`verify:registry`, `verify:layout`, `verify:palette`, `verify:rail`, `verify:review`,
`verify:tmux`, `verify:agent-state`, `verify:subagent` and
`verify:styles` are plain node, because
`viewport.ts`, `lod.ts`, `session-registry.ts`, `shared/layout-schema.ts`,
`main/layout-store.ts`, `main/prompts.ts`, `main/tmux-args.ts`, `main/presets.ts`,
`main/subagent-scan.ts`, `main/subagent-watch.ts`, and the
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
which esbuild erases before the bundle is ever built. `renderer/shell/rail-sections.ts`
qualifies on the same three counts and is the sharper case, because unlike `rail-rows.ts`
— whose two imports are both `@renderer/*` — it genuinely names `@shared`, and stays in
this tier only because that import is a type one and is erased with the rest. `main/agent-state.ts` qualifies the same way
`tmux-args.ts` does: it imports neither `electron` nor `node-pty`, so `scanForBell` and
`nextState` — the two pieces of this milestone most able to be subtly wrong — sit in the
cheapest, fastest tier the repo has rather than needing a real PTY or a real Electron window to
exercise a byte-scanning state machine that never touches either. `main/git-args.ts` earns its
place the way `build/builder-config.cjs` does — it imports nothing at all, not even a type —
and `main/review-engine.ts` earns it the way `session-registry.ts` does: `resolveRepo`,
`captureBaseline` and `review` all take their `run: GitRunner` as an injected parameter rather
than importing one, so `verify:review`'s fake-runner checks (14–29b) can drive the whole seven-arm
result machine — including a missing git binary and a vanished repository — without a real git
process anywhere in earshot. `main/git-runner.ts`, the module that actually shells out to
`execFile('git', …)`, stays out of `review-engine.ts`'s own reach the same deliberate way
`session-backend.ts` stays out of `tmux-args.ts`'s: `verify:review`'s later checks (30–34) still
reach a REAL git binary, in a real spaced temp directory, but they construct `createGitRunner()`
themselves rather than the engine ever importing it.

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
renderer --invoke--> preset:save-panel                                         --> main
renderer --invoke--> prompt:list / prompt:save / prompt:delete                 --> main
renderer --invoke--> settings:list / settings:set                              --> main
renderer --invoke--> canvas:request-reset                                      --> main
renderer --invoke--> agent:acknowledge                                         --> main
renderer --invoke--> workspace:list / workspace:create / workspace:rename      --> main
renderer --invoke--> workspace:delete / workspace:activate                     --> main
renderer --invoke--> review:panel / review:baseline / review:at / review:diff  --> main
renderer --invoke--> review:commit                                             --> main
renderer <--send---  pty:data (batched ~16ms) / pty:exit                       <-- main
main     --send-->   edit:copy / edit:paste / edit:undo / edit:redo            --> renderer
main     --send-->   canvas:counts / canvas:reset                              --> renderer
main     --send-->   preset:spawn / preset:default / preset:capture            --> renderer
main     --send-->   agent:state                                               --> renderer
main     --send-->   session:live                                              --> renderer
main     --send-->   subagent:state                                             --> renderer
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
`lod.ts`. `dispose(id)` itself now has five call sites in `Canvas.tsx` — the close
button, undo/redo removing a panel, the reset handler, workspace delete since M7, and restart
in place since M8c — and every one of them keeps the `pty.kill` count at two precisely because
it routes through `dispose(id)` instead of calling `pty.kill` directly; see "Undo removing a
panel must dispose its session" below for the call-site history. M7 also widened WHEN
`dispose(id)` sends that `pty.kill` — see "`dispose(id)` sends `pty.kill` even when this
renderer holds no local session for that id" below, the same shape as this section's own
`session.spawned` story, one hop further out.

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

**Undo removing a panel must dispose its session.** `registry.dispose` has **five call sites
in `Canvas.tsx`** — the close button (`onClosePanel`), undo/redo removing a panel
(`applyHistory`), the reset handler (`onReset`, dropping every panel at once), workspace
delete since M7 (dropping one doomed workspace's panels), and restart in place since M8c
(`restartPanel`, ending one panel's session so a fresh one can take its id). This is a
count worth re-deriving from the code rather than trusting a stale number: it was two until
the reset handler arrived in a later task and this line did not get updated alongside it — the
exact failure this note exists to prevent happening again. None of the five adds a caller of
`pty.kill`: `dispose(id)` and `disposeAll()` remain the only two inside `session-registry.ts`,
and routing all five through `dispose()` rather than calling `pty.kill` directly is exactly
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
file. Re-derived again for M8c (same grep — and this time **without** quoting the line
numbers, because the M8c re-derivation above went stale inside the very commit that recorded
it: a comment grew by three lines above them before the commit closed. The grep is the durable
half; the numbers were never anything but a snapshot, in the one paragraph in this file whose
entire subject is a number going stale): now
**five**, and the fifth is restart in place. It is deliberately not a third `pty.kill` caller,
for the reason that makes restart work at all: restart is dispose-then-`ensure` at ONE id, so
it needs precisely what `dispose(id)` already does — end the process, tear down the local
handle and delete the map entry, and hand back the kill's promise so the respawn can be
ordered behind it (see "`dispose(id)` returns its kill" below). Reaching `pty.kill` directly
would skip the local teardown, leave a disposed `SessionHandle` in the map for the new session
to collide with, and make the two-caller count re-derivable from two places instead of one.
`verify:panels` 94 now pins BOTH numbers by reading the source text, precisely because this
line is the one that has already gone stale once.

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
`verify-rail.cjs`, `verify-subagent.cjs`).**
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
until the day it broke. `verify-rail.cjs` and `verify-subagent.cjs` are the SECOND and THIRD bundles in
that state, and `verify-rail.cjs` is since M8d the closer case of the three: `rail-rows.ts` never names `@shared` at all (both its imports are
`@renderer/*`), while `inspector-fields.ts` and `rail-sections.ts` DO — and every one of
those imports is an `import type`, erased before bundling, so nothing in the bundle
resolves `@shared` today either — and `scripts/verify-rail.cjs` cites this
very entry as its reason for carrying the alias anyway, which is why the entry has to
keep naming it back. `verify-subagent.cjs` (M13) is the plainest instance yet and
cites the same paragraph: `subagent-scan.ts` imports NOTHING at all and
`subagent-watch.ts` imports only its sibling, so its bundle resolves no alias
today either — which is exactly the state the first two were in on the day they
were written.

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

**...and two concurrent verify runs must not touch each other's
(`scripts/verify-socket.cjs`, `TC_VERIFY_SUFFIX`).** The rule below keeps the
suites off the app's socket; nothing kept them off EACH OTHER's. `VERIFY_SOCKET`
and `PANELS_SOCKET` were module constants with no override, and both suites end
in `shutdown()` — `kill-server` — so two checkouts running `npm run verify` at
the same moment kill each other's sessions mid-run. That is #49 one layer down,
and CLAUDE.md already named the cause in the app's own case: "`TMUX_SOCKET`
being a module constant is what makes both true."

It went unnoticed because two simultaneous runs were implausible until git
worktrees made them ordinary — the same reason M4c could not see the app-level
version of this bug. `verifySocket(base)` appends a sanitised `TC_VERIFY_SUFFIX`
to each suite's own base name, and each suite prints the socket it resolved,
because "which socket am I on" is exactly the question a collision raises.

Three details. It is a **suffix, never a whole socket name**: each suite owns a
DIFFERENT socket deliberately (`verify-panels.cjs`'s own comment says
"verify:pty-manager owns 'terminal-canvas-verify'"), and one full-name override
set for a whole run would collapse them onto one server — reintroducing between
two SUITES the collision it was set to prevent between two CHECKOUTS. A blank or
whitespace value falls back to the base, the `TC_TMUX_SOCKET=` trap
`resolveSocket` already documents. And the suffix is filtered to
`[A-Za-z0-9_-]`, because a socket name is a FILENAME and a suffix containing a
slash escapes the directory tmux derived for it.

**Measured, both directions.** A canary session was left on the default socket
and the suite run twice: with `TC_VERIFY_SUFFIX` set it survived and the suite
was 28/28; without, it was destroyed. That control run also failed CHECK 14
(`reported=0` instead of 7), which is the OTHER hazard this file records under
check 20's obligation, reproduced by accident: `-f <conf>` applies only when a
client STARTS a server and is ignored against one already running, so the
canary's config-less server had no `pane-died` hook and the exit code fell
through to the client's. A stale server does not merely cost you sessions — it
makes one specific check lie.

**The verify suites must never touch the production socket.** Every argv
builder in `tmux-args.ts` takes the socket as a *defaulted* parameter for this
reason alone; `TMUX_SOCKET` stays the production value and `verify:tmux` 9 still
pins that default. `verify:pty-manager` runs on `terminal-canvas-verify`,
because its check 15 calls `shutdown()` — `kill-server` — and running
`npm run verify` with the app open used to destroy every agent in the live
instance.

**Every check appended to `verify:pty-manager`'s tmux block inherits the
obligation to leave that block ending in a definite `kill-server`.** Check 15
calls `shutdown()`, and from M4c until M8c it was the block's LAST action — so
it was providing that invariant purely by being last, which is not a property
anything states. M8c appended check 20 after it and silently removed it:
`kill('r1')` ends the SESSION, not the server, and `buildTmuxConf` never sets
`exit-empty` (tmux defaults it on), so the leftover server *usually* exits on
its own — but `kill()`'s `execFileSync` returns as soon as `kill-session` does,
not once the server's own exit-empty shutdown finishes, which makes that a race
rather than a guarantee. The failure does not surface in the run that causes
it. `-f <conf>` is applied only when a client STARTS a server and is silently
ignored against one already running, so a LATER run beginning before the stale
server exits attaches to a server still wired to the PREVIOUS run's `pane-died`
hook and its now-deleted `exitDir` — and check 14, the one tmux check whose
assertion is sourced from a file that hook writes, falls through to the
client's own exit code and reports the wrong number. Re-running hides it,
because check 15's `shutdown()` closes the window again. This is the same
`pane-died`/`exitDir` path this file already records as its most expensive
silent bug (see "The `pane-died` hook's redirect target must stay quoted"),
reached through a door that entry could not see: there the quoting was wrong,
here the hook is perfectly correct and belongs to a run that ended minutes ago.
Check 20 therefore ends with its own `shutdown()`, and its comment hands the
obligation on to whoever appends check 21.

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

**...and two copies of ONE build must not either — one instance owns the socket and
the store (`main/index.ts`'s `hasInstanceLock`).** `resolveSocket` separates dev from
packaged; nothing separated a build from ITSELF until this fix. Two copies share one
`userData` directory, so one store's coalesced write lands on top of the other's, and
they resolve the same socket, so `before-quit`'s `shutdown()` — `kill-server` — destroys
the OTHER instance's running agents with nothing said anywhere. It is the hazard "the
verify suites must never touch the production socket" already records, with the fix
applied on the harness's side and not on the app's, and it was reachable by
double-clicking the dock icon: `window-all-closed` deliberately does not quit on darwin,
so an instance whose window is closed is still an instance and still holds the socket.

`app.requestSingleInstanceLock()` at module scope, and **the two early returns are the
load-bearing half.** `app.quit()` still runs the ready and quit handlers, so a losing
instance that reached even the first line of `whenReady`'s body would start a tmux client
on the winner's socket and flush its own empty store over the winner's `layout.json` on
the way back out — the fix causing the very damage it was taken to prevent. This is the
same shape as the `before-quit` teardown-then-flush ordering three entries down: the
right operations in the wrong order are worse than neither. Both gates are early returns
INSIDE the existing handlers rather than a conditional registration, which is a
readability trade and not a semantic one — re-indenting two hundred lines to express the
same guard would bury the change.

The pair this does NOT block is dev-plus-packaged, and that is not luck: `app.getName()`
differs between them (`terminal-canvas` from `package.json` versus the packaged
`productName` `Terminal Canvas`), so they already have separate `userData` paths and
therefore separate locks, separate stores, and — via `resolveSocket` — separate sockets.
What is left is two copies of the same build, which is exactly the destructive case.
`TC_ALLOW_MULTI=1` is a developer escape hatch with no UI, the same shape as
`TC_TMUX_SOCKET`, and it is only safe in combination with that override, since a shared
socket is the whole hazard. `second-instance` restores and shows the window rather than
only calling `focus()`, because the window may be CLOSED — which is the state a user
relaunches from the dock to escape, and where a focus-only handler makes the relaunch
look like it did nothing at all. `verify:packaged` 10 and 11.

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
running. **M6a carried the fact and stopped there; M8c is where it is finally
read.** For two milestones `PanelStatus.running.reattached` and `.cwd` were live
fields on every running panel with ZERO readers in the chrome — `TerminalPanel.tsx`
reads only `status.command`, and still does — and M6a's own success criterion, a
reattached panel visibly "saying so", was recorded here as deliberately unmet.
The inspector meets it: `buildInspectorModel` carries `reattached` onto the model
(`verify:rail` 24) and `Inspector.tsx` renders a badge from it, with the resolved
`cwd` beside it as its own field. `verify:panels` 91 is the end-to-end proof — a
real tmux session surviving a real renderer reload, the same pane pid either
side, the badge on screen beside the panel that owns it — and it is the only
place the criterion is observed rather than argued. It needs tmux to run at all,
so on a machine with no tmux binary this criterion is still unproven there,
skipped loudly rather than silently.

**The baseline is captured once, and `reattached` is why (`pty-manager.ts`'s
`create`, `main/baseline-capture.ts`).** `captureBaseline` fires from inside
`create()`, gated on `capturedBaselineIds` — an in-memory `Set` that survives a
`Cmd+R` reload but not an app relaunch — for the identical reason
`buildHasSessionArgs` has to ask `has-session` *before* the spawn: `-A` makes
create and reattach the same call, so `create()` runs again for every panel on
a reload whether or not anything actually respawned. Under tmux, that second
call REATTACHES to a session that may have been working for an hour, and an
ungated `captureBaseline` there would reset the baseline to "now" — the pane
would then report "no changes" for an agent that had rewritten half the
repository, silently, with the only evidence being a diff that never shows up.
The in-memory guard is deliberately not the only one: `baseline-capture.ts`'s
own `deps.baselineOf(panelId) !== undefined` check is a SECOND, independent
door that answers a different question (a persisted record already exists,
regardless of which `PtyManager` instance is asking), which is what makes the
baseline survive an app relaunch even though `capturedBaselineIds` itself does
not.

`baselineOf(panelId) === undefined` was, until M9a's final review, read as one
fact — "this panel has never spawned" — and rendered as `never-started`,
"this panel has no session yet". It is actually two DIFFERENT facts wearing
one signal: a panel that has genuinely never spawned, and a panel that spawned
into a cwd `resolveRepo` could not find a repository root for — a non-repo
capture stores nothing, so `baselineOf` stays undefined FOREVER either way,
with nothing distinguishing "not yet" from "not ever". Since most panels in
this app are not pointed at a repository (`review.ts`'s own comment on the
`not-a-repo` arm calls it "the ordinary answer... i.e. most panels"), the
unfixed version meant the Changes section would confidently claim "no session
yet" about a panel that had been running an agent for an hour, for the entire
rest of that panel's life — a permanent misdiagnosis, not a transient one,
and `verify:panels` check 100 is what caught it: a genuinely spawned panel
outside a repository kept `[data-review-summary]` on screen instead of
rendering nothing. `baseline-capture.ts`'s `isNotARepo(panelId)` closes the
gap with the same shape `capturedBaselineIds` already uses — a membership-only
`Set`, cleared by `drop()` alongside the epoch bump so a recycled id does not
inherit a stranger's "not a repo" verdict — and `review-engine.ts`'s `notARepo`
dep is what lets `review()` tell the two undefined-baseline cases apart.
It is deliberately **optional and defaulted to `false`** (`deps.notARepo?.(panelId)
=== true`), the same trade `PtyManager`'s `captureBaseline`/`dropBaseline`
constructor arguments already make: every fixture in `verify:review.cjs` built
before this fix constructs an engine with no `notARepo` dep at all, and an
engine that suddenly required one would break every one of those checks rather
than leaving their `never-started` reading exactly as it was.
`verify:review` 36 pins the real capture-then-review round trip producing
`not-a-repo`; 36b is the regression guard the paragraph above states —
`never-started` unchanged for every engine built without the dep.

**...but "once" means once per SESSION, and a relaunch is a new session
(`main/index.ts`'s startup sweep, `baseline-capture.ts`'s `staleBaselineIds`).**
The two guards above answer "has this panel already been captured", and until
M9a's final fix wave the persistent half answered it for too long. Quitting
runs `shutdown()` — `kill-server` on the private socket — so at the next launch
NOTHING survives and the user's first click starts a genuinely new agent, while
`layout.json` still holds the baseline from the previous run. `capture()`
early-returned on it, and the panel was diffed against a snapshot from a
previous day: every edit the user made by hand in between attributed to the
agent, which is success criterion 1 failing for the second and every later
session of a panel, and makes `review.ts`'s "a panel's *session-start*
snapshot" and `IPC.REVIEW_PANEL`'s "since its session started" both untrue
after the first quit. The sweep runs once at `whenReady`, alongside the orphan
reconcile that already calls `ptyManager.list()` — which asks the BACKEND, so
it reports sessions this run never spawned — and drops the baseline of every
panel with no surviving session. **The `Cmd+R` guarantee is untouched, and
must stay so**: that is `capturedBaselineIds`, in memory, in a process the
reload does not restart; the sweep runs in a fresh main process whose copy of
that set is empty by construction, so the two cannot collide. Both directions
are pinned (`verify:review` 37/37b), because a sweep that dropped too much
would delete the baseline of every panel whose tmux session outlived a crash —
recapturing against a tree the agent has already rewritten, which is the exact
"no changes" failure this whole milestone turns on.

The sweep also depends on a second, easily-reversed fact: **`before-quit` now
tears down BEFORE it flushes.** `killAll()` -> `kill(id)` -> `dropBaseline(id)`
-> `layoutStore.dropBaseline` -> `scheduleWrite()`, a 500ms debounce on a
process that is quitting, so flushing first lost every one of those writes
silently — memory said the baselines were gone, `layout.json` said they were
not, and `layout.json` wins at the next launch. There is nothing to race:
`kill()` is synchronous all the way down to the backend's `execFileSync`. The
teardown is wrapped in a `try` so the flush still runs if it throws — an
exception in `before-quit` can wedge the quit before the window is allowed to
close, and losing the flush would ALSO be the bug the reordering fixes.

**git is resolved by absolute path from the login env, exactly like tmux
(`main/index.ts`'s `gitPath`, `git-runner.ts`).** `createGitRunner` spawned the
bare name `git` until M9a's final fix wave, against whatever PATH launchd
handed the app — the identical defect `shell-env.ts` and `tmux-probe.ts` exist
to prevent, and the app already computed the right answer for its startup
diagnostic (`whichFromEnv('git', env)`) and threw it away. The consequence was
the worst available one for this milestone: on a machine whose git lives only
under `/opt/homebrew/bin`, the spawn ENOENT'd or resolved a different binary,
`resolveRepo` returned null, and the Changes section **silently rendered
nothing** for a genuine repository — the same shape as the ordinary
`not-a-repo` case and therefore invisible as a bug, while `git-missing`, the
arm designed for exactly "no git on the resolved PATH", never fired at all in
production. It was asserted only against fakes handing back `notFound: true`;
`verify:review` 19b is its first production-path evidence. The runner takes
`gitPath` and `env` as GETTERS for the reason `PtyManager`'s `getBackend` is
one — it is constructed at module scope, long before `resolveShellEnv()` runs
at `whenReady` — and it must never import `shell-env.ts` itself, which would
drag a real login-shell probe into the plain-node verify tier. When git cannot
be resolved it logs ONCE, loudly, the `tmux-probe.ts` treatment the spec asked
for and which did not exist anywhere in the feature.

**Every git call has a timeout, and the review fires on `idle` alone
(`git-runner.ts`'s `GIT_TIMEOUT_MS`, `Canvas.tsx`'s `idleArrivals`).** Two
halves of one bound. The effect depended on `selectedAgentState` wholesale, so
`starting`, `busy`, `idle`, `wants-you` and `exited` each re-fired it at up to
four git spawns apiece, with no cache and no debounce, while the spec and
`IPC.REVIEW_PANEL`'s own comment both name exactly one useful signal: the
transition TO `idle`, i.e. "this agent stopped producing output". It is a
COUNTER of idle arrivals rather than a derived `state === 'idle'` boolean,
because a boolean changes on the way OUT of idle too — a firing with nothing
new to read — and the counter only advances within one panel's own selection,
since a selection change has already re-fired the effect by id.
`GIT_TIMEOUT_MS` is 30s: far above any real `git diff --numstat` this app will
ask for, and far below "forever", which is what the calls had. A ceiling that
could fire on a legitimately slow diff would report `baseline-lost` for a
repository that is perfectly fine — a confident wrong answer produced by a
stopwatch. Neither caller has anyone to time it out on its behalf: the capture
is fire-and-forget and the read is an invoke whose reply simply never arrives.
`verify:review` 19c, whose LOWER time bound is the half that discriminates.

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
is the check that fails if the widening is reverted. Since M8b the rail row
walks the identical chain (`railLabel`), and since M8c the inspector's heading
is a THIRD reader of the same `PanelStatus`, bound by the same never-copy-back
rule — and for a sharper reason than the other two: the inspector also renders
the SPEC's own answer as a separate field beside the resolved one (see "The
inspector shows the links, not the answer" below), so a backfill would make
those two fields agree, and the pane would confidently report "the spec asked
for /bin/zsh" about a panel whose spec asked for nothing at all. The one
surface built to explain the chain would become the one that misrepresents
it.

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

**M6d added no IPC channel (`agent-state-store.ts`).** `verify:ipc` stayed at
20 for that milestone (M7 and M8c have taken it to 26 since; what matters
here is that M6d added none). The attention set — which panels are `wants-you`
right now — is derived entirely on the renderer side from `agent:state` messages that were already
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

**Live cwd is a poll, a dedupe, and a third store (`pty-manager.ts`'s
`LIVE_TICK_MS`/`pollLive`, `renderer/session/live-session-store.ts`).**
`PanelSpec.cwd` is where a panel was TOLD to spawn and `PtyCreateResult.cwd` is
what main resolved that to at spawn time. Both freeze the instant the process
starts, and the first thing anyone does in a shell is `cd` — so the inspector's
`cwd` was a spawn-time value under a present-tense label, confidently wrong for
any panel that moved, for the rest of that panel's life, with nothing anywhere
saying so. M12 makes the statement true by polling tmux, which was already
answering it: `buildListArgs` asks once for EVERY session at a time, so a poll
costs one subprocess per tick whether the canvas holds two panels or forty, and
`LIST_FORMAT`'s new `#{pane_current_command}` rides back in an answer that was
already coming. The renderer half inherits the entry above wholesale —
`live-session-store.ts` is module-level, subscribed PER PANEL ID, over a cached
snapshot, and it must never bump `registry.version()`, one scale worse than
agent state because a fact that changes every two seconds riding that counter
would re-render every panel on every OTHER panel's `cd`. Four entries now record
that rule; this is the fourth. What is new is below, each with what breaks if it
is undone.

**The two ticks stay separate timers.** `IDLE_TICK_MS` is 500 and
`LIVE_TICK_MS` is 2000; they share a lifetime (armed on the first session,
stopped at every site that empties the map) and an `unref()`, and they look
enough alike that merging them reads as a tidy-up. It is not one. The idle tick
is the only thing that can observe the ABSENCE of output — it is what turns
`busy` into `idle` — so its period IS the resolution of M6c's threshold: merged
onto a 2s interval, idleness detection becomes four times coarser everywhere,
silently, while `agent.idleAfterMs` goes on reading whatever the user set.

**The dedupe is the design, not an optimisation.** Main holds the last
`cwd`/`currentCommand` pair per panel and sends `session:live` only on a change
— the rule `applyEvent` already follows for agent state, for the reason stated
there. Undeduped, this is thirty messages a minute per panel describing a fact
that changes when a human types `cd`. Its failure is INVISIBLE: no pixel is
wrong, it shows up as heat. `verify:pty-manager` 23 is the only thing that would
ever notice, and its window deliberately spans several ticks, because an
undeduped implementation emits once per tick and a single-tick sample sees one
message either way. The dedupe key is joined with a NUL rather than a space: a
path may contain a space, so `('/a b', 'sh')` and `('/a', 'b sh')` would collide
into one key and silently suppress a panel's updates — for the users whose
directories contain the delimiter and nobody else, the same collision
`railSignature` avoids with `JSON.stringify`.

**`detachAll()` clears `lastLive` too, and that is the subtle half.** `kill()`
clearing it is obvious — the panel is gone. `detachAll()` is the `Cmd+R` reload
path, where main's `PtyManager` SURVIVES and so do the tmux sessions: without
the clear, every reattached panel is deduped against a value from before the
reload while the renderer's store is empty because the page is new, so
`pollLive` never sends. The result is every unmoved panel showing its spawn-time
cwd after a reload — DURABLY, not for a tick, because the next send waits on a
change that may never come. `lastLive` is supposed to be cleared alongside the
session and both teardown paths have to do it. Found in review, not in writing.

**Display renders nothing without a live answer; consumers fall back to the
spawn cwd.** The two rules disagree on purpose, and both halves are
load-bearing. A spawn value under a live label is indistinguishable from a
correct one, which is worse than an absent row — #41's own constraint — so
`buildInspectorModel` pushes the `live-cwd`/`live-command` fields only when it
has an answer, and pushes them BESIDE the spawn `cwd` rather than over it, which
is "the inspector shows the links, not the answer" applied to a second pair. A
consumer is asking a different question: project-prompt reading and preset
capture each need A directory, neither makes a claim about it, and the spawn cwd
is exactly what they used before this milestone — so the fallback is never worse
than not shipping. **Both preset save surfaces read it**, the menu's `onCapture`
and the inspector's `savePanelAsPreset`, for the reason `presetFromCapture`
already exists one layer down: a user must not end up with two
differently-directoried presets for one panel depending on which surface saved
it. Only one of the two was changed in the first cut and review caught it. The
final fix wave found the coverage claim itself was wrong: `verify:panels` 90
drives `preset:save-panel`, the INSPECTOR's own save action, and says nothing
about the MENU's `onCapture` — the surface the first cut actually missed,
reached through `IPC_EVENTS.PRESET_CAPTURE` and exercised by check 30, which
drove that channel with no live answer forced to exist and so would have
passed identically against a reverted line. Check 30 now sends a synthetic
`session:live` for the panel about to be captured — the same route 90 uses
for the inspector path — before reading `PRESET_CAPTURE` back, so the two
checks together are what the sentence above claims: `verify:panels` 90 for
`savePanelAsPreset`, `verify:panels` 30 for `onCapture`.

One consumer is DELIBERATELY not on that list: `Canvas.tsx`'s `panelLabel`,
the switcher's own row text, still reads `spec.cwd` and always will. It
carries no present-tense claim — "where this panel started" cannot go
stale the way "where this panel is now" can, unlike an inspector field
labelled "now in" — so there is nothing in the row for a live answer to
make wrong, and pulling one in would only add a claim the row was never
making before. (`verify:panels` check 39 finds this row by the panel's own
id, not by its cwd text, and its fixture panel is dormant and has no live
answer to substitute in any case — the row's stability has nothing to do
with why the cwd stays.) A future reader seeing a moved panel's switcher row
still name its old directory should read this as the fourth rule stated
above, not as an oversight this milestone forgot to close.

**`session:live` is an `IPC_EVENTS` member, so `verify:ipc` stays at 31.** That
suite asserts over `Object.values(IPC)` — the INVOKE channels, each of which
must have an `ipcMain.handle` — and a main-to-renderer send is handled by nobody
and counted by nothing. This is the SECOND time the same wrong number has been
reachable: M6d hit the identical boundary, added no invoke, and its own entry
above records the count staying at 20. An earlier draft of M12's spec said "31
to 32", and a task written from it would have failed the suite by "fixing" a
correct count.

**The poller is armed off the session map, and that is a limit rather than a
bug.** `pollLive` skips any entry whose panel this manager holds no local
session for, and the tick itself starts with the first session and stops at
every site that empties the map — the idle tick's lifetime exactly. So a panel
whose tmux session survived a reload but which this renderer never promoted has
no live answer even though tmux could give one. Widening the arming condition is
the fix and it is deliberately not taken, because the map is also what stops a
subprocess spawning every two seconds for the life of an app whose canvas is
empty. Between ticks the answer is up to two seconds stale, which is fine for a
label and would not be for anything that navigates or writes — a second reason
review stays out of this milestone.

**A stated cost, accepted rather than fixed: `pollLive` blocks main's event
loop.** `getBackend().list()` is an `execFileSync` on the tmux backend, so this
is a SYNCHRONOUS subprocess on the main thread every two seconds for the life of
the app. The spec framed the cost as "one subprocess per tick" and never
addressed the synchronicity; it was accepted, for two reasons.
`SessionBackend.list()` is synchronous by contract, and the app ALREADY calls it
synchronously on every `pty:list` invoke — at boot and at every reload — so this
adds a periodic instance of an existing operation rather than a new class of
one; and making it asynchronous ripples out through `PtyManager.list()`, the
`pty:list` handler and boot reconciliation. If that judgment is wrong the cost
is real and is worth naming: a few milliseconds of main-thread stall every two
seconds, and against a WEDGED tmux server up to the backend's timeout,
repeatedly — during which main can neither flush PTY data nor answer an IPC
call. If it is ever observed, the fix is an asynchronous `list()`, and that is a
milestone of its own rather than a patch here.

**One cosmetic consequence, worth knowing before it is read as a bug.** A preset
saved from a panel now carries whatever tmux reports, which on macOS temp paths
is the RESOLVED spelling (`/private/var/…`) even for a panel that never moved.
Production prompt reading follows symlinks, so nothing behaves differently and
real-world cwds are already canonical — but a FIXTURE comparing an unresolved
path against a saved one will disagree for this reason and no other, which is
why `verify:panels`' prompt fence carries both spellings of each directory.

The same fact has a second, non-fixture consequence the paragraph above
should not be read as covering: a panel spawned at `~` now saves a preset
carrying the EXPANDED home path, not `~` itself. `resolveCwd` already
expands `~` before spawning (see its own comment above), so this is not a
new expansion — but the SAVED preset previously carried whatever the
renderer's own `panel.spec.cwd` held, which for a panel opened without an
explicit cwd could still be the literal tilde, and a live-cwd-aware capture
now overwrites that with tmux's resolved answer instead. A preset that used
to follow the user's home directory across machines or accounts stops
doing so once it is re-saved this way. Arguably the more correct answer —
the expanded path is where the panel genuinely is — but it is a BEHAVIOUR
CHANGE, not purely cosmetic, and should not be filed under the paragraph
above without that qualification.

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
resting list to roughly eight rows on purpose. `savePanelAsPreset` joined them in
M8c on the same terms — the Presets menu already covers the focused-panel case —
while `restartPanel` is the verb that DOES earn a row, because it has no other
gesture anywhere at all.

**One waiting count, and the rail is a view over it (`shell/rail-sections.ts`'s
`waitingCount`).** `palette/commands.ts` computed a workspace's waiting count
inline until M8d. The rail renders the same number, and a second copy of that
expression would agree the day it was written and drift the first time one of
them was wrong — with the drift landing as a count on screen that no log
explains. It is one exported function both views call, which is the trade
`isRunning` made in M8c for a different derived number and the rule "One map,
and a typed view over it" states for a stored one. The INTERSECTION is what
does the work rather than the length: an attention id this workspace does not
own contributes nothing, which covers a panel waiting in some other canvas and
a phantom alike (`verify:rail` 29), and a global count instead reads as "every
workspace is waiting for you" (31). `waiting` stays a NUMBER on the row and the
view composes the text: the palette already learned that a count baked into a
title reaches the fuzzy haystack (`verify:palette` 64), and a count is
transient state rather than a name. One honest limit is recorded in the
function's own comment, and the first draft of both that comment and this entry
named the wrong mechanism. It is NOT the store's 500ms write debounce:
`doSave` mutates `w.panels` synchronously and `workspaces()` reads that same
in-memory snapshot, so main's answer is already fresh when the invoke lands.
The staleness is on the RENDERER's side — `panelIds` reaches the count from
`Canvas.tsx`'s `workspaceRows`, a copy only as current as its last
`reloadWorkspaces()`. That loader ran on every workspace mutation and every
workspace switch, plus mount and every palette open — a phrase deliberately
chosen over enumerating the call sites, because the first draft of this
paragraph enumerated them, said "five", and omitted `switchWorkspace`'s, which
is a count going stale inside the paragraph about a count going stale. What
matters is what was NOT on the list: **a panel spawn or close was none of
them**, which is not a lag but a permanent wrong number: click New panel three times and the
row reads "1 panel" two lines above a Panels list showing four, until the user
happens to open the palette — which a mouse-only user may never do, and
mouse-only reachability is the section's whole point. A sixth reload keyed on
`panels.length` closes it, and the key is `length` rather than the array
because `panels` is a fresh identity on every `setPanelRect`, i.e. every frame
of a drag, which would put an IPC round trip on the 60Hz path the whole
`railSignature`/memo architecture exists to keep the shell off. It sees main's
post-save state by DECLARATION ORDER: the `layout.save` effect is declared
earlier in the component, React runs a commit's effects in declaration order,
and both `ipcMain` handlers are synchronous and processed in arrival order —
so the correct window is one IPC round trip, not a debounce. That is acceptable
for a count and would not be for a navigation target, which is exactly why
`buildAttentionRows` filters against the rendered rows instead. One exception
qualifies "main is fresh", and it is not closed by any of this: `doSave` writes
`w.panels` only inside `if (layout)`, i.e. only while `restore.layout` is ON,
because a restore setting that is off means "start fresh each launch" and
`initial()` already hands the renderer `panels: []` (see "A workspace switch is
a second boot, but not in preference semantics" below for the same flag's other
half). With it off, main's `panelIds` never advances on a spawn at all, so the
reload returns an unchanged count and the row reads whatever was stored while
the setting was last on — a freeze rather than a lag, pre-existing store
behaviour, and deliberately left alone. The one thing that moves it is a
workspace switch, whose `doSave(outgoing, false)` bypasses restore settings
entirely.

**The attention section takes the built rows, not the panels
(`shell/rail-sections.ts`'s `buildAttentionRows`).** Filtering the queue down
to ids that have a `RailRow` IS `reachableQueue`'s phantom filter, and reading
the label off that same row is what stops the Panels and Attention sections
rendering two different names for one panel. One lookup, both guarantees. The
alternative — take `panels`, re-derive the label — would make this a FOURTH
reader of M6a's honest chain, beside the panel header, `railLabel` and
`inspector-fields.ts`'s deliberately identical copy, and `verify:rail` 35 pins
what that costs with a TITLED fixture: a re-derivation from `spec.command`
says `/bin/zsh` in Attention while the Panels row says `auth refactor`. It
iterates the QUEUE and looks rows up, never the reverse: the reverse renders
the canvas's order instead of entry order and looks entirely correct until two
agents ring in the wrong sequence, which is a bug that never reproduces on
demand. Every row is `wants-you` by construction, so no row carries agent
state and none subscribes — `RailPanelRow`'s per-id subscription answers a
question this section already knows the answer to.

**The attention section is scoped to the ACTIVE workspace, deliberately
(`Canvas.tsx`'s `railAttention`).** A row's whole job is to navigate, and
`centreOn` can only frame a rect on this canvas — a row for a hidden
workspace's panel would either go nowhere or smuggle in a second switching
path, and the spec rejects both. The scoping is structural rather than a
filter: `buildAttentionRows` is handed `railBuilt`, which is built from
`panels`, which is only ever the active workspace's own. A waiting panel in a
hidden workspace surfaces as the waiting COUNT on its workspace row instead.
The two sections divide one question between them — *who is waiting here* and
*where else is anyone waiting* — and the obvious "fix", one flat
cross-workspace queue, breaks the click. `verify:panels` 96 is the check that
pins the hidden half.

**The inspector shows the links, not the answer (`shell/inspector-fields.ts`,
`shell/Inspector.tsx`).** The panel header and the rail row each render ONE
label — `title ?? status.command ?? spec.command ?? 'login shell'` — because a
panel's chrome has room for one. The inspector deliberately does NOT collapse
that chain: the resolved `command` and the spec's own answer (`asked for`) are
two separate fields. This is the pane's stated reason to exist. "Why does this
panel say login shell" is answerable only when the user can see both halves at
once — that the spec asked for nothing, and
that main resolved `/bin/zsh` — and a merged single `command` field renders
something entirely plausible while leaving the question unanswerable. It is not
redundancy: absent-versus-resolved is exactly the distinction M5a's "An absent
`command` must stay absent" rule turns on, and the inspector is the only surface
in the app where a user can see which side of it a panel sits on. `cwd` is
deliberately NOT split the same way and is one field with a fallback, because
`PanelSpec.cwd` is always present — there is no absent case to explain, and a
second field that merely repeated the first would be the noise this pane is
supposed to be free of. `verify:rail` 22 pins the fallback in both directions;
a status-only `cwd` renders empty for every panel that has not spawned, which
is every panel on a restored canvas. `verify:rail` 21 is the check for the
command pair, and it was verified by fault injection rather than by argument:
merging the two fields turns 21 red while 20 — the heading walking the honest
chain — stays green, which is the split that says 21 is testing the separation
and not merely the resolution.

**One predicate for "running" (`shell/inspector-fields.ts`'s `isRunning`).**
`starting` counts. A panel whose `pty:create` has not resolved yet is
emphatically a process the user started, and this number is not only the
inspector's: `canvas:counts` — the count main's reset dialog NAMES to the user
before destroying everything — is the same question asked from a different
surface. It was written inline in the counts provider until M8c, and the
summary now reads the same exported function rather than deriving its own.
Two derivations of "how many agents are running" agree the day they are
written and drift the first time one is wrong, and the drift window here is
exactly the moment a spawn is in flight — which no check would ever happen to
sample, so the first observer of the disagreement would be a user reading
"3 running" in the pane while answering a dialog that said 2. This is the rule
"One map, and a typed view over it" states for stored settings, applied to a
DERIVED number. `verify:rail` 17 pins the predicate, `starting` clause
included; 19 pins the summary's other trap, a waiting id no panel answers to.

**`dispose(id)` returns its kill, and restart is the only caller that cares
(`session-registry.ts`, `Canvas.tsx`'s `restartPanel`).** `dispose` is `async`
and returns the promise `bridge.pty.kill(id)` handed it rather than discarding
it, so `restartPanel` can await the DESTROY before it re-`ensure`s. Under tmux
that ordering is the entire verb: `new-session -A` attaches if the session
exists and creates it only if it does not, so a `create` that overtakes its
`kill` reattaches to the very session the restart meant to replace — the panel
blinks, the same process comes back, and nothing in any log says the verb did
not happen. It is the same `-A` ambiguity "`reattached` costs a probe" above
describes, met from the other side of the flag.

The ordering holds TODAY only by accident, and that is the half worth writing
down. `ipcMain.handle(PTY_KILL)` is a synchronous handler; `PtyManager.kill` is
synchronous; `TmuxBackend.destroy` is an `execFileSync`. Every link is
incidental — not one of them is synchronous because anyone reasoned about this
race — so main has already destroyed the session by the time the reply
crosses back, and the respawn cannot overtake it even with the `await` removed.
That was confirmed by injection during M8c: unawaiting the dispose left
`verify:panels` 92 green, with a different pid. The moment any one of those
links becomes asynchronous — a queued kill, a promisified `execFile`, an IPC
handler that awaits anything at all — the race is live, and no end-to-end check
in this repo would see it. `verify:registry` 22 is the pin, and it is
deliberately a fact about the REGISTRY rather than about main: it makes the fake
`kill` slow and flips a flag inside it, so a `dispose` that fired the kill and
returned goes red. `await undefined` resolves immediately and truthfully, which
is precisely why checks 21 and 23 stay green against that implementation.

**`bumpVersion()` exists because `ensure()` deliberately does not bump
(`session-registry.ts`, `Canvas.tsx`'s `restartPanel`).** `ensure` is normally
called from the tiering memo — during render — where notifying a
`useSyncExternalStore` subscriber makes React warn, so it creates the session
and stays silent; every pre-M8c caller is already inside a render that is about
to commit anyway. `restartPanel` calls it from an EVENT HANDLER, a tick after
its own `await`, where nothing else re-renders: the new `SessionHandle`'s host
is never mounted into a slot, the tiering effect never re-runs, and the panel
shows literally nothing, with no error anywhere. `dispose` does bump, but that
bump is a tick stale by the time the kill resolves. The obvious alternative,
`focus(id)`, also bumps — and is the wrong answer for a reason nothing about
rendering would reveal: it moves the keyboard, which a shell control must never
do (see "A shell control never takes DOM focus"). `verify:registry` 24 asserts
both halves in one read — the version advanced and exactly one listener fired,
AND the session's focused flag and its focus timestamp are untouched — because
a `bumpVersion` implemented as `focus()` satisfies the first half perfectly.
M8c's final review added a THIRD member of the same family, `touch(id)` — see
the restart entry immediately below for what separates the three, and
`verify:registry` 25 for the check that pins its own "and nothing else".

**Restart kills unconditionally and respawns only on PROMOTION, and
`registry.touch` closes half of that gap (`Canvas.tsx`'s `restartPanel`,
`session-registry.ts`'s `touch`).** This is the most surprising fact about the
verb, so it goes first rather than buried in the `clearAgentState` argument
below. `attachSlot` is the ONLY caller of `spawn()`, and it runs from
`TerminalPanel`'s slot effect, which is gated on the panel being `live`. Nothing
in `restartPanel` puts it there. So the kill always lands and the respawn is
conditional on tiering — and when tiering says no, the user sees the agent die,
no new one start, the panel become a card, and the Restart control immediately
grey out reading "*X* has not started yet": the button denying that the thing
they just did ever happened. It is recoverable by clicking the panel, and
nothing on screen says so.

**The budget half is fixed.** `assignTiers` fills its `LIVE_BUDGET` slots in
`lastFocusedAt` order and `ensure` mints the new session at `0`, so a restarted
panel joined at the BACK of the eviction queue — the first candidate denied a
slot. `registry.touch(id)` stamps `lastFocusedAt` and bumps, and **does nothing
else**; `restartPanel` calls it after the re-`ensure` so the new session wins a
slot instead of losing one. It is deliberately not `focus(id)`, which also bumps
and stamps but additionally calls `handle.focus()` — a shell control must never
move the keyboard (see "A shell control never takes DOM focus"), and that
failure is silent. Three near-identical registry members now sit side by side
and the distinction is the point: `bumpVersion` says "re-render", `touch` says
"this session is recently WANTED", `focus` says "the keyboard is here now".
Restart needs the first two and must not have the third. `verify:registry` 25.

**The off-screen half is a known limitation, not an oversight.** `assignTiers`
also culls by viewport, so restarting a panel the camera has left still kills
without respawning until the user pans back. `touch` cannot reach it and should
not try: fixing it means either restart moving the camera — a verb about a
process silently becoming a verb about the viewport — or the registry spawning
outside `attachSlot`, which breaks "fit before spawn" (there is no laid-out node
to measure) and "lazy spawn" together. Left as-is, deliberately.

**A third residue, unfixed: palette-driven restart leaves DOM focus on
`<body>`.** `runRow` closes the palette before running a command, which calls
`restoreFocus(capturedId)` -> `handle.focus()` on the very handle restart is
about to dispose; `attachSlot` does not focus on the way back in. So after
restarting the focused panel from the palette, the next keystroke goes nowhere
until the user clicks the panel — the same silent failure `usePalette`'s rule 4
exists to prevent. This is not a `shellControl` violation; `shellControl` is
correct here. It also **cannot be fixed at the call site**: the session is
re-`ensure`d at tier `card`, and `focus(id)` only calls `handle.focus()` on a
LIVE session, so a call there would stamp, bump and move no keyboard at all — a
line that reads as a fix and is not one. The new handle cannot take focus until
React mounts its slot and `attachSlot` opens it, which is at minimum a render
away and (per the paragraph above) not guaranteed to happen at all. Landing it
needs the REGISTRY to own a one-shot "focus on next attach" consumed inside
`attachSlot`, which is a design decision for a later milestone.

**Restart is dispose-then-ensure at one id, and `clearAgentState` comes FIRST
(`Canvas.tsx`'s `restartPanel`).** Six steps, and every one of them is
load-bearing:

```
clearAgentState(id)  ->  await registry.dispose(id)  ->  (re-check the panel still exists)
  ->  registry.ensure(id, panel.spec, { dormant: false })  ->  registry.touch(id)
  ->  registry.bumpVersion()
```

`touch` bumps too, so `bumpVersion` is nominally redundant — it is kept because
the re-render is a separate requirement with its own reason, and leaning on a
member named for the eviction queue to also supply it would make a silently
blank panel the cost of ever reordering those two lines.

**`clearAgentState` first.** Agent state survives a panel's closure by design —
main sends the transition and the renderer's store keeps it until something
clears it — so a panel restarted out of `wants-you` would otherwise keep its
amber border: a fresh agent wearing a dead one's question, which neither focus
nor a write will clear, because acknowledgement says nothing about the PREVIOUS
process. What makes this worth recording is the shape of its failure, which two
people found from opposite ends, and neither half alone is the interesting
answer. The review's version: deleting the line leaves the SETTLED state
identical, because main's `create` sends `starting` directly at spawn (see
"`starting` is sent directly") and re-seeds the store entry a moment later — so
`verify:panels` 92 stayed green under injection and had to grow a clause reading
`data-agent-state` IMMEDIATELY after the click, with nothing awaited in between.
The implementer's version goes further, and it is why the line is not merely
cosmetic: `ensure(dormant: false)` does not GUARANTEE a spawn. A restarted panel
over `LIVE_BUDGET`, or one panned off screen, is tiered to a card and never
promoted — so `starting` never arrives at all, and the stale `wants-you`
persists **indefinitely** rather than for a transient window, on exactly the
panels the attention routing exists for.

**The panel is RE-CHECKED after the await, never captured across it.** The gap
is a real IPC round trip and the panel can be closed inside it — the `×` and the
rail's close control are both one click away — and re-`ensure`ing a closed panel
mints a session no UI can ever reach or stop again, the orphan `dispose`'s own
comment exists to prevent, arriving through a new door.

**`dormant: false` explicitly, never inherited**: a dormant re-ensure leaves the
panel refusing to spawn, which on screen is indistinguishable from a restart
that did nothing. The `await` and the `bumpVersion` each have their own entry
above. Restart pushes NO history entry — the panel array does not change, so
there is no gesture to undo — and asks for NO confirm: the process it ends is
precisely the one the user asked to replace, so a confirm would be a question
about the thing they just said; the control's `title` carries the warning
instead. Double-firing is safe by construction rather than by a guard: a second
call finds `registry.get(id)` undefined after the first dispose, fails the
`isRestartable` gate and returns.

**Three surfaces close a panel and only one of them arms, and that asymmetry is
deliberate (`TerminalPanel.tsx`'s `handleClose`, the rail's close control, the
inspector's "Close panel").** The panel's own `×` asks once for a running
process — `kill?`, forgotten after `CONFIRM_CLOSE_MS` — while the rail row and
the inspector button close outright, because the `×` sits on the panel itself
where a mis-click while dragging, resizing or reaching for the chrome is easy,
whereas the rail and inspector rows act on a panel the user has already
deliberately selected and then aimed at a labelled control. Recorded because
one verb with two behaviours across three surfaces reads as an oversight later;
it is not one, and changing it is a design decision rather than a tidy-up.

**`kind` is optional on disk, absent means terminal, and a present unknown kind
is DROPPED (`shared/layout-schema.ts`, `renderer/panels/panels.ts`'s
`isReviewPanel`).** The two halves look inconsistent and are not, because they
answer different questions. Absent is every `layout.json` written before M9b, so
a required discriminator would drop every panel in every existing file — a
user's whole canvas gone at one launch, with a warning per panel and nothing
recoverable — which is why absent parses as `terminal`. A PRESENT
`"kind": "whiteboard"` is the opposite situation: it was written by a version
that knew something this one does not, and there is no reading of it that makes
it a terminal panel. Guessing there is not a cosmetic mistake, because a
terminal panel is the kind that OWNS A PROCESS: `registry.ensure` mints a
session for it, `assignTiers` will promote it, and `attachSlot` spawns — so a
mis-guessed kind starts an agent in a cwd its author never chose, and every
guessed panel does it at once on the launch after a downgrade. Dropped with a
warning is the individual-drop rule `parseLayout` already obeys everywhere else,
and it costs one panel rather than the file. The runtime test is POSITIVE
everywhere — `isReviewPanel(p)`, never `!isTerminalPanel(p)` — so a third kind
added later inherits the terminal path only where that is genuinely harmless and
is otherwise a compile error at every `switch`. `verify:layout` 104, 107 and
108b; `verify:viewport` 74.

**A review node never reaches `assignTiers` or `registry.ensure`, and that is
structural rather than a rule (`Canvas.tsx`'s partition).** The obvious
implementation is a guard — teach `assignTiers` to skip a kind, teach `ensure`
to refuse one — and it fails the way every "everyone remembers to check"
invariant fails: the tiering memo, the dormancy effect, the `pty.list`
reconcile, the eviction pass and `restartPanel` would each need the same clause,
and the one that got missed would mint a `PanelSession` for a panel with no
terminal in it. Instead `Canvas.tsx` partitions `panels` ONCE, and everything
downstream of tiering is handed the terminal-only array; a review node is simply
not in the input. There is therefore no code path from a node to a WebGL
context, a PTY, or a `LIVE_BUDGET` slot, and the claim is checkable rather than
argued: `verify:panels` 103 reads `__m4aSessions` for the node's id and compares
the `.xterm` count against the count from BEFORE the node existed — the second
clause is what rejects an implementation that quietly demoted some other panel
to pay for the node. The cost of the partition is that anything genuinely
common to both kinds must be written against `Panel`, not against the terminal
array; that is the trade, and it is the right way round, because forgetting a
kind check is silent while a type error is not.

**A review node asks by BASELINE, not by panel id, and that single decision is
what the node is for (`shared/review.ts`'s `ReviewSubject`, `IPC.REVIEW_AT`,
`ReviewNode.tsx`).** Main drops a panel's baseline the instant its session is
killed — `PtyManager.kill` calls `dropBaseline`, deliberately, so a recycled id
can never inherit a dead panel's snapshot. A node that asked
`review:panel(subjectId)` would therefore work perfectly for as long as its
subject was open and go blank the moment the subject was closed: at exactly the
moment a review of FINISHED work is most useful, and with no error anywhere,
because `never-started` is a legitimate answer that renders as an ordinary
empty state. So the node stores the repository root, the baseline sha and a
snapshotted label, and `reviewAt(baseline, subjectId)` never consults
`baselineOf` at all (`verify:review` 45). The subject id survives only for the
things that are still about the panel — excluding it from the shared-repo peer
count (46), and re-reading when its agent goes idle — never for the lookup.

`verify:panels` 110 is the end-to-end proof, and it is the one check in this
milestone that could not be watched failing against correct code. It was proven
by FAULT INJECTION instead: swapping the node's query to
`review.panel(subject.subjectId)` turns 110 RED while 102 — the same node,
rendering the same files, with its subject still alive — stays GREEN. That
contrast is the whole argument, because a check that goes red for both is
testing the rendering rather than the outliving. Two things had to be fixed
before the injection could fail at all, and both are worth knowing: the
harness's own `dropBaseline` hook mirrored only half of main's (it poisoned the
in-flight capture and left the PERSISTED record alone), so the injected node
kept getting answers from a store main would really have cleared; and the final
assertion had to become a SUSTAINED hold rather than a `waitUntil`, because the
node does not clear its result while a refresh is in flight — there is no DOM
state meaning "re-querying" — so a `waitUntil` was satisfied instantly by rows
painted before the close and the defect slipped past it roughly half the time.

**`commit-tree` runs no hooks, and never touching the index is its own silent
failure (`main/review-commit.ts`, `main/git-args.ts`).** M9c turns a node's
answer into a commit, and both halves of how it does that are corrections to
the obvious version, each measured against real git rather than reasoned about.

The spec's own recipe was plumbing: `write-tree`, `commit-tree`, `update-ref`.
**`commit-tree` runs no hooks at all**, so that recipe silently delivers the
`--no-verify` behaviour the spec's very next paragraph forbids — a review tool
skipping a repository's own checks without saying so, which is the worst
direction for a verb whose whole promise is that the commit is an ordinary one.
Porcelain `git commit` honours `GIT_INDEX_FILE`, which was MEASURED rather than
assumed: the `pre-commit` hook ran, and it saw exactly the scratch index, and
the user's own `.git/index` was byte-identical across the commit itself — the
reconcile below is the only call that ever writes it, and it does so on purpose. So the transaction is
a scratch index minted per commit under `userData/git-index/` and five calls —
`read-tree HEAD`, `update-index --add --remove`, a real `git commit -m`,
`ls-files --stage -z` read back, and an `update-index --cacheinfo` reconcile.
The first four carry the scratch env; **the fifth deliberately does not**,
because it is the one call that is supposed to write the real index. The scratch
file is removed in a `finally` on every path — it must live OUTSIDE the tree, or
it is an untracked file inside the very review being committed.

**The reconcile is the second correction, and "never touch the user's index" is
what it corrects.** Leaving the real index alone sounds like the safe answer and
is a silent failure of its own: once HEAD moves and the index does not, the
index still describes the previous tree, so the agent's own `git status` reports
a phantom `D` for every file added and `MM` for every file modified — and an
agent reading that will set about "fixing" a repository that is fine. The
reconcile stages **by blob sha** (`--cacheinfo`, from the entries read back
AFTER the commit, since a hook is allowed to have changed them) rather than by
re-reading the working tree, so an agent editing the file in the interval cannot
have its newer content staged behind its back; and **per path** rather than
wholesale, so the user's own unrelated staged entries survive. `verify:review`
62 and 63 are the two measurements, and 62 compares the index as BYTES rather
than through `git status` for the reason stated in the table above.

**The reconcile has TWO calls, and the second one is the deletions.** `ls-files
--stage` prints nothing at all for a path the commit removed, so the requested
paths ABSENT from that read-back are exactly the deleted set — and `--cacheinfo`
has no entry to stage for them, leaving the real index's pre-commit entry
untouched. Measured, that reads as `AD <path>`: the file staged as NEW in a
repository whose HEAD just deleted it. It is the same phantom the paragraph
above describes, wearing the opposite sign, and worse in one respect — an agent
reading `AD` does not merely get confused, it re-adds the file it just deleted.
So a second `update-index --force-remove -- <deleted>` runs against the REAL
index (no scratch env, like its neighbour), with the same non-fatal treatment:
a failure logs once and the result stays `committed`. **The trade it accepts,
chosen rather than missed:** if the user had independently staged one of those
paths, `--force-remove` discards that staging — and unlike the `--cacheinfo`
half there is no per-path blob to restore it to, because the commit is the
reason the path has none. The `AD` state is strictly worse than a lost `git
add`, so the removal wins; `buildForceRemoveArgs`' own comment records the same
ruling beside the code. `verify:review` 64, and check 63's fixture now deletes
a file for it.

**A failure after the commit lands is not a failed commit.** The sha read-back
and the reconcile both run after the irreversible half, and neither can
downgrade the result: a `failed` reported there tells a user their work was not
committed while it demonstrably was, and the next thing they do is commit it
again. A reconcile that fails is logged loudly, once, naming `git reset` as the
fix, and swallowed. `verify:review` 60.

**`refused` and `failed` split POSITIONALLY, not by reading git's text.** The
spec named a `hook-failed` arm; git exposes no machine-readable marker
separating a hook rejection from any other commit-time refusal, and a stderr
heuristic would be a guess presented to the user as a fact. So `refused` is a
non-zero exit from `git commit` itself — carrying the hook's own output
verbatim, which is what the spec actually wanted surfaced — and `failed` is a
non-zero exit from a call BEFORE the commit was attempted. Two situations with
two different fixes, the same standard `not-a-repo` and `repo-unreadable`
already draw.

**`review:commit` is addressed by repository ROOT, never by panel id**, for the
reason `review:at` is: a node outlives its subject, and main drops a panel's
baseline the moment its session is killed. The verb is offered BY ARM — enabled
for `changes`, **present-but-disabled with its reason on screen** for `shared`
(a commit there would bundle another agent's work under this node's message,
and a hidden control makes "not supported here" indistinguishable from "not
built yet"), and absent for every arm with nothing to commit. The `paths` come
from the RESULT's full file list, never from the node's display-capped rows —
`verify:rail` 57, and the failure it prevents is a commit that looks complete
and is not. They also carry **both sides of a rename**: numstat does rename
detection by default, so `git mv old new` is one entry with `path: new` and
`renamedFrom: old`, and a set built from `path` alone stages the addition while
HEAD's own `old` — seeded into the scratch index by `read-tree` — survives into
the new tree. Verified against real git: the commit resurrects a file the agent
deleted while the node says "1 file changed". `buildStageArgs`' `--remove`
already stages the deletion once the path is in the set; the missing half was
the path. The RENDERED list deliberately does not grow the same way — one
`git mv` is one row and two committed paths, which is the display-versus-commit
split stated from the other side. `verify:rail` 60.

**On success the node's own baseline advances (`Canvas.tsx`'s
`onReviewCommitted`).** A node diffs the working tree against
`subject.baselineSha`, and committing does not change the working tree — so
without the advance the node reports the same files after a commit as before
it, permanently, and a second press re-commits content already in history. It
pushes NO undo entry: `Cmd+Z` cannot undo a commit, and an undo that restored
the old baseline would put the node back to reporting work that is now in
history, which is an undo stack lying about what it can reverse. The panel array
still changes, so the existing `layout.save` effect persists the new sha with no
extra plumbing. The SUBJECT panel's baseline in main is deliberately left alone
— a node can outlive its subject, so reaching into that panel's state is only
sometimes possible at all.

**The message input `stopPropagation()`s on EVERY key, not only the two it
handles (`ReviewNode.tsx`).** `useViewport`'s keydown listener is on `window`,
above the component's root container in the bubble path, so without it a `Cmd+N`
typed into a commit message spawns a panel behind the node and a `Cmd+K` opens
the palette over it — this is rule 3 of "Who owns the keyboard" reached by
containment instead of by a flag. Enter commits, Escape cancels, and every
REFUSED Enter sets a visible outcome: an empty message, and a `model.commit.kind`
that flipped underneath an open input (the node re-read and the changes are gone)
both say why. Only an IN-FLIGHT press returns silently, because the button is
already disabled and reads "committing…", so the screen has already answered.

**Both exits restore focus, and no check can observe that.** The input is
`autoFocus`ed, so it is the second surface in this app that takes DOM focus off
xterm — which makes it heir to rule 4 of "Who owns the keyboard": an unmounting
input's blur leaves focus on `<body>`, where every subsequent keystroke goes
nowhere at all. It is worse here than in the palette, because the commit
button's `preventDefault` correctly leaves `focusedId` alone, so the app goes on
believing a terminal panel is focused while the keyboard reaches nothing. Escape
and a successful commit therefore both close through one `closeDraft`, which
calls `Canvas`'s own `restoreFocus` on the id captured when the draft OPENED —
captured rather than read at close time, for the reason `usePalette` captures
rather than clears. **Nothing in `npm run verify` can see this**: the panels
suite drives the input with a dispatched `KeyboardEvent`, and DOM focus after an
unmount is a browser default action an untrusted event never performs — the same
limit `verify:panels` 47 and 75c each record from their own side. Delete the
`restoreFocus` call and every suite stays green. Re-pressing the control while a
draft is open also no longer wipes it (`setDraft((d) => d ?? '')`): the press is
far more plausibly a mis-aim than a request to start over, on the one verb in
this app where the typed text is the point.

**What M9c did NOT solve, kept honest.** Three things, each a deliberate stop
— a fourth, the concurrent-commit race, WAS since solved and its entry below
now records the fix rather than the gap.

**Paste into the commit input is not wired.** `Cmd+V` is a main-process menu
accelerator (`main/menu.ts`) reaching `Canvas`'s `edit:paste` subscription, which
acts on the FOCUSED PANEL's `SessionHandle` — and a review node has none, so the
event lands nowhere at all. This is the identical gap `Palette.tsx` closed with
its own `edit:copy`/`edit:paste` subscriptions (see "`edit:paste` is guarded,
`edit:copy` is redirected"); M9c does not, because a commit message is short and
typed. The fix, if it is ever wanted, is the palette's, and it is a copy of a
solution that already exists rather than a new one.

**No amend, no branch, no remote, and no per-file selection.** The commit stages
every file the result reports, onto the current HEAD of the repository the node
already names.

**A concurrent agent commit is refused, not reverted — and this entry used to
say the opposite (`review-commit.ts`'s two HEAD reads).** The scratch index is
seeded from HEAD at T0 and the commit parents on HEAD at T2, so anything
committed in between was undone for every file outside our path set: no
conflict, no warning, an ordinary-looking commit that rolled its predecessor
back. Git has that race for any two committers, but this app's premise is an
autonomous agent working in the same checkout, so the other committer is the
ordinary case here rather than an exotic one — and the window is not
milliseconds, it is the entire duration of the `pre-commit` hook, legitimately
thirty seconds on a real project.

HEAD is now read twice, and **the second read's POSITION is the guard**:
immediately before `git commit`, not just after `read-tree`. The earlier
position leaves nearly the whole window open while looking exactly as correct,
which is why `verify:review` 65 asserts where the reads SIT rather than merely
that two happened. A move returns `head-moved`, its own arm rather than a
`failed` carrying a sentence, because its fix is a button the node already has
— refresh and look again — where `failed` sends the user to their git and
`refused` to their hooks. A failed HEAD read is deliberately NOT a move: "we
could not check" and "it moved" are different facts, and refusing on the first
would make an unreadable HEAD a permanently dead commit button.

The measurement is `verify:review` 67, which fires a real concurrent commit
from inside the runner at the exact window and reads the other committer's file
out of the COMMITTED TREE. Against the unguarded sequencer it reported
`kind=committed head="agent work" theirsInHead="base\n"` — the erasure, in one
line. What is still NOT solved is anything beyond refusing: there is no
re-read-and-retry, and the user does the refresh.

**Unborn repositories are unreachable rather than handled.** `read-tree HEAD`
fails in a repository with no commits — but `captureBaseline` cannot store a
baseline there either, so a node in one never reaches the `changes` arm and
never offers the verb. The arm is unreachable by construction, not defended, and
a future change that gave such a repository a baseline would reach it.

**`onClosePanel` branches on the kind before it disposes, and so do the three
loops (`Canvas.tsx`).** A review node owns no `PanelSession`, and
`registry.dispose(id)` sends `pty.kill` even for an id this renderer holds no
local session for — see "`dispose(id)` sends `pty.kill` even when this renderer
holds no local session for that id" above, which is the entry this one inherits.
So routing a node through dispose sends a `tmux kill-session` named after a
panel that never had one and calls `dropBaseline` on that id, which is harmless
only until an id is recycled. Four surfaces remove a panel and all four now
branch: `onClosePanel` early-returns into a drop-and-commit, and `applyHistory`,
`resetCanvas` and `deleteWorkspace` skip a node in their dispose loops. The
guards are on the loop's ITERATION rather than on the call, which is not
stylistic: `verify:panels` 94 counts `registry.dispose` occurrences in this file
(five) and `pty.kill` callers in `session-registry.ts` (two) by regex over the
source, comments included, so a guard written as a second call site would move a
number that is deliberately hard to move. `deleteWorkspace`'s guard is the one
with a stated limit: main's workspace rows carry ids and no kind, so it can only
recognise nodes in the ACTIVE workspace, whose panel objects this renderer
holds; deleting a HIDDEN workspace containing a node still sends that stray
kill, and closing it means teaching `WORKSPACE_LIST` to carry a kind, which this
milestone did not scope.

`verify:panels` 111 and 111b are what fail if any of it is removed — but only
because the harness was taught to look in the one place the mistake exists. A
kill aimed at an id that names no session is swallowed at every layer below the
IPC door: the direct backend's `destroy` is a no-op, tmux's `cli` eats a
non-zero exit, and `dropBaseline` for an unknown id drops nothing. With both
guards deleted, the node still leaves the DOM and every pid is still preserved,
and both checks stayed green — observed, not predicted. The harness therefore
shadows `PtyManager.kill` before `registerIpcHandlers` and records every id main
is ASKED to kill; the checks assert the node's id is not among them, and with
the guards removed they go red naming the exact stray kill. This is the same
shape as `verify:panels` 94: some claims can only be checked at the door, never
at the outcome.

**Rule 3 of `shouldYieldWheel` is attribute-driven (`Canvas.tsx`,
`[data-scroll-host]`).** The rule used to be "a wheel over the FOCUSED panel
scrolls that terminal", and the terminal was implicit — the only thing a panel
could contain. With two kinds it has to be a question, and the tempting spelling
is a branch in the predicate: `if (isReviewPanel(panel)) …`. That makes the
predicate a place that must be edited every time a kind is added, and it makes
it consult the panel MODEL to answer a question about the DOM — which is wrong
even today, since the scrollable region inside a node is one element among
several, and a wheel over the node's header is not a wheel over its diff.
Instead each kind RENDERS the marker or does not, on the element that actually
scrolls: a live terminal's slot carries it, a review node's diff body carries
it, and `shouldYieldWheel` asks `panel.querySelector('[data-scroll-host]')`. The
old test was `.panel__slot`, which is this same question asked in terminal-only
vocabulary — and it was already subtly wrong for a reason that has nothing to do
with review nodes: a restored `focusedId` can name a panel `lod.ts` still
refuses to promote (dormancy outranks focus), and a CARD has no xterm to hand
the event to, so yielding there meant the wheel reached nothing at all and the
app read as frozen. A kind that owns no scrollable region says so by rendering
no marker, which is the right default: the wheel goes to the camera, which is
what every part of the canvas that is not scrollable already does. `verify:panels` 105 pins both halves on the node —
uncancelled over its body, and the camera unmoved — the same pair check 47
already pins for the palette.

**The node's model is a second reader of `ReviewResult`, deliberately, and it
differs on exactly one decision (`renderer/review/review-node-model.ts` versus
`shell/inspector-fields.ts`'s `buildReviewFields`).** This repo's usual rule is
the opposite one — see "One predicate for 'running'" and "One waiting count, and
the rail is a view over it" — so the divergence needs a reason, and it is
`hidden`. The inspector's Changes section is a strip inside a 260px column that
must VANISH when it has nothing worth saying: `not-a-repo` is the answer for
most panels, and rendering "this is not a repository" for every one of them is a
permanent blank gap in the one pane that is supposed to be free of noise. A
review node is a panel the user deliberately opened, placed and dragged; a panel
that renders nothing at all is indistinguishable from a broken one, and the user
has no way to ask why. So the node always renders something — a heading, a
summary, and a note for the arms the pane hides — and it makes the same call for
an in-flight query, where the pane shows nothing and the node says it is
reading. `verify:rail` 49 is the check that separates the two, and it is the
only one that could: it asserts `not-a-repo` HIDDEN in the pane and RENDERED in
the node, so an implementation that "simplified" the node into a call to
`buildReviewFields` turns it red while every other rail check stays green
(confirmed by injection). The rest of the two models genuinely agrees, and where
it agrees it agrees by calling the same things — the honest chain for the
heading, `parseDiffLines` for the hunks — so the divergence is one decision
rather than a second implementation.

**`makeReviewPanel` must not force the minted id into `subject.subjectId`
(`panels/panels.ts`).** Every other constructor in this module takes an id and
stamps it into the object it builds, so writing `subject: { ...subject,
subjectId: id }` here is one line, reads as consistency, and is catastrophic in
the quietest possible way: the node's subject becomes ITSELF. It then asks main
to diff a panel that never spawned, gets `never-started` forever, and renders a
perfectly well-formed empty state beside a panel that plainly has changes —
which reads as "the review feature does not work" rather than as a wrong id, and
points nowhere near this line. `subjectId` is the id of the panel being
reviewed and the minted id is the id of the node doing the reviewing; they are
two different things that happen to have the same type, which is exactly the
condition under which a copy-paste is invisible. `verify:viewport` 76 exists for
this one line and for nothing else.

**Panel ids are one sequence with two prefixes, seeded in TWO places
(`Canvas.tsx`'s `nextIdRef`, `openReview`).** A review node's id is minted from
the SAME counter a terminal panel's is — `r${nextIdRef.current++}` beside
`n${nextIdRef.current++}` — because `PanelId` doubles as a tmux session name and
"Panel ids are global, not per-workspace" (above) already turns on nothing else
being able to mint a colliding one. The prefix is not decoration: it is what
tells a reader of `layout.json`, or of a `tmux list-sessions`, which panels can
possibly own a session at all. The hazard is not `n` versus `r` — `n6` and `r6`
are different strings and cannot collide as session names — it is **r versus r
after a reseed**. Both seeding sites (boot, and every `switchWorkspace`) recover
the counter by scanning existing ids, and a regex that reads only `^n(\d+)$` is
blind to every persisted node: it recomputes an n-max that a saved `r7` had no
part in, and the next review gesture mints `r7` a SECOND time — a literal
duplicate panel id, which React keys collide on today and which `parseLayout`
drops silently at the next load. So both seeds read `^[nr](\d+)$`, and both have
to, because a workspace switch is where a reseed most plausibly gets forgotten.
`verify:panels` 107 is built exactly against this: it seeds a node whose number
is the very id a narrow reseed would hand out next, reloads so the reseed
actually runs, then opens a review through the real gesture and asserts the
minted id collides with nothing any workspace already holds. Its own comment
records that its first form — comparing bare numbers across prefixes — flagged
`n34`/`r34` as a defect and passed identically under either regex. **It is
tmux-gated**, and skipped LOUDLY where there is no tmux binary: the check needs
the seeded node's SUBJECT to survive `wc.reload()` so the real gesture has
something to open a review on, and session survival across a reload is a tmux
property — the direct backend kills the process outright. So on a tmux-free
machine the r-versus-r collision claim above is argued rather than proven, the
same honesty this file already applies to M6a's `reattached` criterion at
`verify:panels` 91 and to every check in `verify:pty-manager`'s tmux block.

**The eighth arm: `repo-unreadable`, and the Command Line Tools stub is the
ORDINARY case (`main/review-engine.ts`'s `RepoAnswer`).** `rev-parse
--show-toplevel` outside a repository exits 128 and says "not a git repository",
and M9a treated every failure of that call as that answer. Both halves of the
test are required and the wrong one to drop is the message: git exits 128 for
plenty of other fatals, so status alone folds "there is no repository here" —
which must stay quiet, because it is the answer for most panels — together with
"there IS a repository and git declined to open it", which must not. The second
class is not exotic. The macOS Command Line Tools stub at `/usr/bin/git` exists,
spawns, and exits non-zero on everything until the tools are actually installed;
`safe.directory` refuses an unowned checkout; a `.git` can be unreadable; a cwd
can vanish under a running panel. Under M9a every one of them rendered as
silence — the same shape as the ordinary case — so the Changes section simply
was not there, and a missing feature is the hardest failure to report, because
nothing looks wrong. The arm carries a DETAIL (git's own first line) rather than
a generic phrase, since the four causes have four different fixes and only git
knows which one happened. `verify:review` 38–41; `verify:rail` 46 pins that the
node renders a note for it and 47 pins that `not-a-repo` is still hidden, which
is what makes the distinction a distinction rather than a rewrite.

**A review node needs no signature; the rail does (`ReviewNode.tsx`'s `useMemo`,
versus `railSignature`).** Both modules face the same-looking problem — a
60Hz-changing input feeding something expensive to rebuild — and they need
opposite answers, which is why an earlier draft of the node copied the rail's
solution and made things worse. `buildRailRows` is fed `panels.map(...)`: a
freshly-allocated array of freshly-allocated objects on every render, so NO
identity there is stable and only the CONTENT can be compared, which is what
`railSignature` is for. The node's inputs are already identity-stable across the
volatile change: `setPanelRect` rebuilds a panel as `{ ...p, rect }`, so
`subject` and `panel.title` are carried by reference, and `result`/`expandedPath`
are the component's own state, which a drag does not touch. React's dependency
comparison therefore answers the question for free. The draft that froze the
node on a `JSON.stringify` signature over its model AND its diff serialised up
to `DIFF_MAX_LINES` (600) line objects on every frame of a drag — imposing the
exact 60Hz cost the memo existed to prevent, to avoid one object allocation.
Recorded because the two modules will keep looking like the same problem to
whoever reads them next.

**`openReview` re-reads its subject after the await, and the reachable failure
is not the obvious one (`Canvas.tsx`).** `window.canvas.review.baseline(id)` is
a real IPC round trip, and the obvious hazard — the panel was closed in the gap
— is already covered by the null check, because closing a panel drops its
baseline in main and the reply comes back null. The one that gets through is a
WORKSPACE SWITCH landing in the same gap. A switch DEMOTES rather than disposes
(see "A workspace switch is a second boot"), so the subject's session is
untouched, its baseline is untouched, and the reply is a perfectly valid
non-null baseline — for a panel that is no longer in this canvas. Minting from
the captured `subject` would then place a node by a rect that only meant
something in the workspace the user just left, carrying a `subjectId` nothing
here answers to, into the workspace they just arrived in. So the panel is looked
up AGAIN after the await and the mint is abandoned if it is gone. This is the
same shape as `restartPanel`'s re-check across its own await, and the same
lesson: the null reply is the failure that occurs to you, and it is not the one
left over.

**What M9b did NOT solve, kept honest.** Four things, each a deliberate stop
rather than an oversight.

**There is no file watcher, and adding one is declined rather than pending.**
The node re-reads on two signals — its subject's agent going idle, and its own
refresh control — and on nothing else. Pull, not push: the spec declines the
watcher explicitly (`docs/ideas-backlog.md` #19), and the reason is that the
signal worth reacting to is "an agent finished a turn", not "a byte changed on
disk". A watcher over a repository this app does not own would fire on every
build artifact, every editor save and every `git` command run in a terminal
elsewhere, and each firing is up to four git subprocesses per open node. A
change made outside a panel needs the refresh click, and that is the intended
behaviour.

**An untracked file's diff costs a second git call.** `git diff` against the
baseline does not describe a file git has never seen, so `fileDiff` falls back
to `--no-index` against `/dev/null` for a row flagged `untracked`. The trap
there is the exit status: `--no-index` exits **1 when it finds differences**,
which is success and is the only outcome that matters, so an implementation
treating non-zero as failure renders "this diff could not be read" for every new
file an agent writes — which is most of what an agent writes. `verify:review`
48.

**`#41`'s live-cwd limitation is unchanged.** A panel's repository is resolved
from the cwd it was SPAWNED in, so a panel that `cd`s out of that repository
mid-session is still reviewed against the first one. The baseline is a sha in
the first repository and nothing re-resolves it, so the answer is stale rather
than wrong-looking. Fixing it means reading a running process's live cwd, which
is the backlog item's whole subject.

**Survival across a full app QUIT is unproven.** `verify:panels` 109 proves a
node survives a renderer RELOAD, which is a different event. On a real quit and
relaunch, main's startup sweep drops the baselines of panels whose session did
not survive — including the node's SUBJECT — so `review:panel` would answer
`never-started` for that panel, while the node keeps working because it holds
its own root and sha and asks `review:at`. That is the design working as
intended, and it rests on one fact nothing here checks: the `git stash create`
object the sha names is unreferenced, so it survives until `git gc` decides
otherwise. Nothing in this repo observes that boundary, and a node whose object
has been collected renders the `baseline-lost` arm — the summary a user reads
as "unattributable" — rather than a wrong one. No
check covers it; do not read 109 as though one did.

**Subagent nodes are derived, not a `Panel` kind (`subagent-scan.ts`,
`subagent-watch.ts`, `renderer/canvas/SubagentLayer.tsx`).** `Panel` is the
PERSISTED type in this codebase, and that is a contract with four separate
signatures, not a description: being in the `panels` array means `parseLayout`
needs an arm for you, `layout.save` writes you, `nextIdRef` must mint you
without collision, and each of `Canvas.tsx`'s four panel-removing surfaces —
`onClosePanel`, `applyHistory`, `resetCanvas`, `deleteWorkspace` — must learn a
guard to skip you, the same four M9b already taught to skip a review node. A
third kind fighting that contract would need a fifth signature nowhere near
those four: `assignTiers` and `registry.ensure` would each need to learn a node
holds no PTY, or a subagent's synthetic id would compete for a `LIVE_BUDGET`
slot and a WebGL context it can never use. Subagent nodes instead never enter
`panels` at all — they are a sibling layer inside `.world`, rebuilt every
launch from the watcher, with no `layout-schema` arm and no id prefix of their
own. That is not a guard someone has to remember; it is the absence of a code
path. There is no route from a subagent record to `registry.ensure`, so there
is nothing to forget to guard. `verify:panels` 119 is the check that makes this
a claim rather than an architecture diagram: it reads the registry's own
session COUNT before any subagent fixture exists and again after the fan-out
renders, unchanged. The cost, stated rather than buried: a node cannot be
dragged, closed or selected on its own, and it does not appear in the rail — it
follows its parent and is cleared with it. That is judged correct, not a
compromise, but it is the first thing to revisit if a later milestone makes
nodes individually openable, because an openable node probably does want its
own selection.

**The slug is a hint; `cwdOf` is what makes it safe (`subagent-scan.ts`'s
`slugFor`/`cwdOf`).** `slugFor` maps a cwd to the project directory name Claude
Code derives for it under `~/.claude/projects` by replacing every character
outside `[A-Za-z0-9]` with `-`. That mapping is UNDOCUMENTED — a private format
this repo does not own, observed on one Claude Code version — and it was
inferred from 31 real directory names, none of which contained an underscore
or a space. Those two characters are a genuine unknown, and a slug built from a
path containing either could easily point at the wrong session directory, or
at none. Nothing in this milestone trusts the guess: a session directory the
slug claims is CONFIRMED by reading its own transcript's first line and
comparing the `cwd` it records against the panel's actual cwd, and a session
whose recorded cwd disagrees is not claimed however well the slug matched
(`verify:subagent` 17). That one read is what converts an undocumented mapping
from a CORRECTNESS risk — a wrong slug drawing an edge to a stranger's
subagents, a confident claim about the wrong repository — into an AVAILABILITY
one: a wrong slug degrades to no nodes, which is indistinguishable on screen
from a session Claude Code has not created yet. No nodes is the safe direction
here for the identical reason it is everywhere else in this file.

**The subagent poll rides the live tick, and sits outside its backend gate
(`pty-manager.ts`'s `pollLive`).** Not a third timer. `CLAUDE.md`'s rule that
the idle tick and the live tick stay separate is about the 500ms idle tick's
RESOLUTION — merging it into the 2s live tick would coarsen `agent.idleAfterMs`
by four times, silently, for every panel. Nothing like that is at stake for
subagent detection: it is the same cadence class as the live cwd poll, and its
per-tick cost is a `readdir` of a directory that is usually empty, beside the
`execFileSync` the live tick already pays. So `pollLive`'s old shape —
`if (!entries) return` wrapping the whole method — became `if (entries) { …
live loop … }` around only the live-cwd half, with the subagent poll running
UNCONDITIONALLY after it, never inside that guard. The reason is the same
"safe direction" argument reworded for a gate instead of a mapping: the
subagent half reads the filesystem, not tmux, so a direct-backend panel has a
real Claude Code session running just the same as a tmux-backed one, and gating
it on `backend.list()` — which answers `null` on the direct backend BY
CONTRACT — would silently disable this entire milestone on a real, supported,
production configuration (see "The probe checks that the SERVER starts").
`verify:pty-manager` 25 is the check that a panel with no Claude Code session
directory produces nothing across several ticks; nothing in that check or
`verify:subagent` requires tmux, which is the point being pinned. Also not a
file watcher: `subagents/` does not exist until the first subagent spawns, so
`fs.watch` would mean watching the PARENT directory and re-arming the watch
every time — machinery built to catch a signal a 2s poll already delivers on
the scale a human reads a node appearing at all.

**A fifth store, and the fifth time the `registry.version()` rule is recorded
(`renderer/session/subagent-store.ts`).** Module-level, subscribed PER PANEL
ID, over a CACHED snapshot — cloned from `live-session-store.ts` on all three
counts. It must never bump `registry.version()`, which deliberately moves only
on tier/status/focus/exit: a fact that changes when a model decides to fan out
would re-render every panel on every OTHER panel's fan-out, the identical 60Hz
cascade `agent-state-store.ts` and `live-session-store.ts` already exist to
keep off `TerminalPanel`'s `memo`. The cached snapshot is not an optimisation
either — `useSyncExternalStore` compares snapshots by reference, so a getter
that built `{ records, ambiguous }` fresh on every call would make React
believe the store changes on every render, and it loops. The store's own
dedupe (`applySubagents`, comparing serialized records before replacing the
stored object) is a SECOND dedupe layered on main's: main's stops the message
crossing the process boundary at all; this one stops a re-render if a message
ever arrives unchanged anyway — a reload, a future snapshot-on-load, a second
sender — which is what lets the hook hand React a stable reference across a
no-op update. And it needs the same clear every prior store needed: cleared
alongside `clearAgentState`/`clearLiveSession` at all four of `Canvas.tsx`'s
panel-removing sites, or the map grows for the life of the renderer and a
RECYCLED panel id inherits a dead panel's subagents — and again at RESTART IN
PLACE, which is a fifth call site and not a fifth panel-removing one. The
reason there is different and worth keeping distinct: the panel survives a
restart, so nothing is leaking, but the process it describes does not, and a
fresh agent must not inherit the dead one's node list — a column of `done`
nodes belonging to a conversation that no longer exists, beside an agent that
has spawned nothing. Counted from the source rather than from memory: five
`clearSubagents` calls, four of them panel-removing (`applyHistory`,
`resetCanvas`, `onClosePanel`, `deleteWorkspace`).

**`spawnedAt` is the session's, not the client's (`pty-manager.ts`'s
`firstSpawnedAt`).** `create()` stamps `Date.now()` as a session's `spawnedAt`
only when the session is genuinely NEW; a REATTACHED one reuses the value this
manager already recorded, via a `firstSpawnedAt` map keyed by panel id that
survives `detachAll()` and is cleared in `kill()` and in the natural-exit
branch of `create()`'s `onExit` handler (`pty-manager.ts:437`) — the latter
guarded by `sessions.get(spec.panelId) === session`, the same identity check
that already protects `lastLive`, so it fires only when the process ended on
its own (the panel's own shell typed `exit`) and not on either teardown path:
`detachAll()` and `kill()` both delete the map entry synchronously, before
`onExit` ever runs, so the guard is false there and the natural-exit branch
never touches an entry either of them was responsible for — which is what
keeps `detachAll()`'s deliberate preservation of the value intact. The reason
the value is preserved at all through a reattach is the same
ambiguity M6a's `reattached` flag already exists to name one layer down:
`new-session -A` makes "this client just attached" and "this process just
started" the same tmux call, so a reattached session's Claude Code session
directory was NECESSARILY created before this attach — the agent has been
running since before we reconnected to it. `chooseSession`'s post-spawn filter
(`createdAt >= spawnedAt`) is written for the opposite case, a fresh spawn
whose session directory cannot predate it, and applied to a reattach it rejects
the panel's own, perfectly valid session directory — permanently, since nothing
ever re-derives `spawnedAt` again for a session this manager keeps alive.
Without the reuse, a panel's subagent nodes vanish at the first `Cmd+R` and
never come back for the rest of that panel's life, with nothing in any log.
`verify:pty-manager` 27 is the check, fault-injected red with the reuse
removed (`seen=[]`), and it deliberately does not overlap check 26: it detaches
and reattaches with NO poll landing in between, isolating the window where
`detachAll()`'s own fix (below) has nothing yet to protect. **The deliberate
limit, stated rather than hidden**: after a full app RELAUNCH — not a reload —
this manager holds no prior value for any panel, so a reattached session there
falls back to `Date.now()` at the reattach moment, and a session directory that
predates the relaunch becomes permanently unclaimable for that panel's
lifetime. Fixing that needs the tmux session's own start time, which is not a
value `tmux list-panes` currently reports to this app — it would mean a
SEVENTH `LIST_FORMAT` column and a `verify:tmux` count change, deliberately out
of scope here. The safe direction is unchanged either way: no nodes rather than
wrong ones.

**A claim follows the panel's slug, and nothing else re-derives it
(`subagent-watch.ts`'s `PanelState.slug`).** `attributable` recomputes from
the LIVE cwd on every tick, but the claim underneath it — session directory,
byte offset, records — is made once, in the one branch `poll` takes for a
panel it holds no state for. So a panel that `cd`s into a different repository
kept rendering the FIRST repository's subagents beside a panel that is no
longer in it: a confident WRONG attribution, arriving AFTER the confirmation
read rather than being caught by it, which is the one direction this module is
built never to be wrong in. `PanelState` therefore carries the slug it was
claimed from, `poll` compares it against `slugFor(cwd)` each tick, and a
mismatch drops the claim so the next line re-claims. It costs one string
comparison per panel per tick, against a value `pollLive` already has in hand.
`verify:subagent` 23, fault-injected red with the comparison disabled.

**The limit that leaves, stated rather than hidden: a SECOND `claude` in one
panel is never claimed.** The re-claim above keys on the slug, so a panel that
stays in the same repository is not re-examined — and the ordinary way that
happens is a user whose `claude` exits and who simply runs `claude` again in
the same shell. The PTY never died, so no `drop()` ran; the claim is still the
old session's; and the new session's directory is never looked for. On screen
the panel's nodes sit there `done` forever while a live agent fans out beside
them, with nothing saying why. It is left because the fix is not a patch: it
needs a periodic re-`chooseSession` for an already-claimed panel, which means
deciding when a NEWER session directory outranks a confirmed claim — and
getting that wrong in the other direction is worse, since a claim that keeps
jumping to whatever directory is newest is exactly how a panel adopts a
neighbour's conversation. The safe direction is unchanged meanwhile: stale
nodes rather than someone else's. Closing a panel, restarting it, or moving it
to another repository all re-claim correctly today; only "run `claude` twice in
one shell" does not.

**The record list is capped, and the remainder is NAMED (`SUBAGENT_CAP`,
`DESCRIPTION_MAX`).** Nothing removes a record once added — a finished
subagent stays on the canvas as a `done` node — so the list only ever grows,
for the life of the panel, and its length is not this app's to choose: it is
however wide a model decided to fan out. Three costs ride on it and every one
is invisible on screen: `SubagentLayer` stacks the nodes in one column at
`NODE_H + NODE_GAP` each (100 subagents is a 6,400px ribbon painted over
whatever the user placed to the right of that panel), the whole list is
re-serialised into the poll's dedupe key on EVERY 2s tick, and the whole list
crosses IPC on every change. This repo caps everywhere it reads something it
does not own for exactly this reason — `REVIEW_FILE_CAP`, prompts at 100 files
and 64KB — and the same rule applies to the remainder: it is COUNTED and
reported as `+N more`, never silently dropped, because a column that just
stops is indistinguishable from an agent that stopped spawning, which is a
wrong answer where a cap is only a bounded one. `DESCRIPTION_MAX` is the same
bound on the one free-text field, applied in `parseMeta` — at the PARSE
boundary, so every consumer inherits it rather than the one that remembered
to. The overflow count rides INSIDE the dedupe key rather than beside it: on
the tick a panel crosses the cap the records array is already full and
byte-identical, so a key that ignored the count would freeze `+N more` at the
first number it ever showed. `verify:subagent` 24 and 25.

**The ambiguity line's count is derived, never the literal `2`
(`subagent-scan.ts`'s `slugSharing`, `SubagentUpdate.sharing`).** Three panels
in one repository is reachable and `attributable` handles it correctly — all
three are refused — but the rendered sentence said "2 panels share this
repository" regardless, which is the one place this feature speaks to the user
in words and the one claim they can check against the canvas in front of them.
`slugSharing` is the ONE derivation of that number and `attributable` is
written in terms of it (`sharing === 1` IS attributable), so the refusal and
the sentence cannot drift apart — the trade `waitingCount` already made for
the rail's own count, and the reason it rides the wire rather than being
recomputed in the renderer is simply that the renderer cannot see the other
panels' slugs at all. It is part of the ambiguous dedupe key for the same
reason the overflow is part of the other one: a third panel joining an already
ambiguous pair changes nothing else, and a key that ignored it would leave the
line reading 2 permanently.

**A failed confirmation is remembered; a malformed `.meta.json` deliberately
is not (`subagent-watch.ts`'s `failedClaims`, `ingestMeta`).** Two repeated
reads that look identical and are opposites. The claim's confirmation stored
no state when it failed, so it re-derived the same session directory and
re-read the same parent transcript — the file that grows to megabytes — every
2s for the life of the panel, getting nowhere; that is reachable rather than
theoretical, because `slugFor` maps `/` and `-` alike to `-`, so
`/Users/me/my-repo` and `/Users/me/my/repo` share a slug and a panel in one
keeps resolving the other's session. It is now remembered, keyed on the
session DIRECTORY and the cwd it was judged against rather than on the panel,
so a genuinely new session is still claimable and a moved panel is judged
afresh — poisoning the panel itself would trade a repeated read for a feature
silently dead for the rest of that panel's life. Only a DEFINITE disagreement
is remembered: an unreadable or half-written first line is a transient and is
retried. The read itself is `readHead`, a bounded first-8KiB read added beside
`readText` for this one caller, because `cwdOf` wants the first LINE of a file
whose size is unbounded. The `.meta.json` retry is the mirror image and must
stay: Claude Code writes those sidecars while we are listing the directory, so
a file caught MID-WRITE parses as malformed, and marking it known would drop
that subagent's node permanently for a race rather than for anything wrong
with the file. The retry IS the defence, and it is bounded by the cap above
and by the file being a small sidecar. `verify:subagent` 26.

**`detachAll()` forgets the dedupe, not the claim
(`pty-manager.ts`'s `detachAll`, `subagent-watch.ts`'s
`SubagentWatch.clearDedupe`/`clear`).** `detachAll()` calls
`subagentWatch.clearDedupe()`, never `.clear()`. It is the `Cmd+R` reload
path, where main's `PtyManager` and the tmux sessions it holds both SURVIVE —
only the renderer's store is empty, because the page is new — so what needs
forgetting is exactly what `lastLive.clear()` two lines up already forgets for
`session:live`: the dedupe key that would otherwise compare the next real poll
against a pre-reload value and stay silent forever. A full `.clear()` here
would go further and drop the CLAIM too — the session directory this panel has
already confirmed, and the byte offset into its parent transcript — forcing
the next poll to re-derive both from scratch against the reattaching
`create()` call's new, later `spawnedAt`. `chooseSession` only accepts a
session directory created ON OR AFTER `spawnedAt`, so the real one, predating
the reload, would no longer qualify — the panel's subagents would vanish at
the first `Cmd+R` and never return, the identical failure `firstSpawnedAt`
(above) exists to prevent, reached through the sibling function instead.
`verify:subagent` 22 is the check, and it is deliberately not satisfied by a
bare "did something come back": it drives the second poll with a LATER
`spawnedAt`, exactly what a reattach produces, so a `clear()` mislabelled as
`clearDedupe()` is caught rather than accidentally passing — with the claim
gone, `chooseSession` rejects the now-too-old directory against the newer
timestamp and the panel reports NOTHING, while a real `clearDedupe()` reuses
the untouched claim and the later `spawnedAt` changes nothing about its
answer. This was a real defect once, not a hypothetical: this suite's own
task instructions specified a plain `clear()` here by mistake, and check 22 is
what would have caught it.

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
