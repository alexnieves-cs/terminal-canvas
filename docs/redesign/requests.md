# Foundation change requests

Lanes append here when a frozen file or a file they do not own has to change.
The lead batches these between waves. Do not edit the foundation files yourself.

A request is open until the lead writes `done:` and the commit.

## Template

```
### R-NNN · <one line>
- Lane:
- File:
- Why the contract or the owner cannot absorb it:
- Smallest change:
- Status: open
```

## Requests

### R-001 · Record D1 in product-rules.md
- Lane: F1
- File: docs/product-rules.md
- Why the contract or the owner cannot absorb it: D1 says the selection rule changes in this file in the same commit as the pixels. The file is not in F1's ownership list. The material bullet on disk still describes the pre-F1 split ("cyan accent" without saying cyan is also working, and without the lighter selection ring).
- Smallest change: In the material bullet, add that cyan is both the working state and the accent; selection is a 2px ring and a 6px halo in `--state-select` (`#A6F6FF` on dark), lighter than working, so a selected working panel is two facts; the M63 rule "selection is cyan; work is blue" ends; idle is slate and green means finished OK.
- Status: done: the material bullet records D1. Cyan is the working state and the accent; selection is the 2px ring and 6px halo in `--state-select` (`#A6F6FF` on dark); the M63 rule ends; idle is slate and green means finished OK.

### R-002 · board.1 still expects a done work item to be idle
- Lane: F1
- File: scripts/verify-rail.cjs
- Why the contract or the owner cannot absorb it: D7 moves the work item's done tone from `idle` to `done` inside `panel-state.ts` only. `board.1` pins `expectTones` as `['kind', 'working', 'starting', 'idle']`. F1 does not own this suite. `state.2` stays green and the words do not move.
- Smallest change: `const expectTones = ['kind', 'working', 'starting', 'done']`, and the check title's parenthetical `(kind/working/starting/idle)` becomes `(kind/working/starting/done)`.
- Status: done: board.1 expects tone `done` for a done work item (D7). The owner asked for this after the F1 merge.

### R-003 · High-contrast glass is still the pre-F1 graphite
- Lane: F1
- File: src/renderer/canvas/useTheme.ts
- Why the contract or the owner cannot absorb it: `HIGH_CONTRAST.dark` still stands the glass in for `#0b0d11` / `#161a21` / `#111419` / `#1d222b`. F1 re-valued the theme blocks and does not own `useTheme.ts`. A person who asked for high contrast still sees the old ramp.
- Smallest change: point the four dark glass stand-ins at the new ramp — `--glass-0` `#08090d`, `--glass-1` `#11141b`, `--glass-2` `#08090d`, `--glass-3` `#161a23`. Leave the high-contrast `--fg-4` and the light glass alone.
- Status: done: dark high-contrast glass uses those four hexes. `--fg-4` and the light glass are unchanged. glass-0 and glass-2 are both the ink.

### R-004 · The terminal cursor is still the old iris
- Lane: F1
- File: src/renderer/terminal/themes.ts
- Why the contract or the owner cannot absorb it: the dark cursor is `#5ec4d4` and the light cursor is `#2f6bd8`. F1 does not own this file. `--well` stays `#0a0c10` on purpose so the slot matches this file's dark `background` (product-rules: `--well` stays the xterm background).
- Smallest change: dark `cursor` from `#5ec4d4` to `#5BE1E6`. Light `cursor` from `#2f6bd8` to `#348184`. Leave every ANSI entry, including the light `blue` that shares the old cursor hex — the file's own comment says those sixteen are the agent's palette. Do not change `background`.
- Status: done: those two cursors. ANSI entries and both backgrounds are unchanged, including light `blue` `#2f6bd8`.

### R-005 · Wire useAttentionQueue into the pill, the dock and the Sessions count
- Lane: F2
- File: `src/renderer/canvas/CommandPill.tsx`, `src/renderer/shell/Dock.tsx`, `src/renderer/canvas/Canvas.tsx` (the `attentionCount` prop), `src/renderer/sessions/SessionsHost.tsx` (F3 adds the host; L-D lands the count)
- Why the contract or the owner cannot absorb it: F2 owns the queue and the hook, and not those files. The pill and the dock still take a count computed beside the hook (`reachableQueue(...).length` in Canvas, `attention.filter(...).length` in the dock). A second count is the drift the queue exists to stop.
- Smallest change: import `useAttentionQueue` and use `items.length`. Delete the local waiting count. Canvas stops passing its own `attentionCount` when the hotspot owner next touches it.
- Status: done: the dock badge and its spoken count are the queue. Snooze and team asks are spoken only when the queue is empty, because `attention-queue.ts` is frozen and has neither kind. Canvas still passes `attentionCount` into `pillRestState` until L-C: that sentence is what `verify:pill` presses, and this request says Canvas stops passing its own count when the hotspot owner next touches it.
- Filed on the F2 branch as R-001, before F1's list was on main.
- M438 calls the hook from the pill, the dock badge and `SessionsHost`, on one census the pill publishes.

### R-006 · Export a canvas-wide live-session subscription
- Lane: F2
- File: `src/renderer/session/live-session-store.ts`
- Why the contract or the owner cannot absorb it: the store notifies per panel id. `useAttentionQueue` cannot call `useLiveSession` in a loop whose length is the census. It already reads `getLiveSession` when an agent transition or an approval re-renders it, and it will call `subscribeLiveSessions` the moment that export exists.
- Smallest change: export `subscribeLiveSessions(listener: () => void): () => void` that fires when any panel's cwd or command changes.
- Status: done: the export fires from `notify()`, so a repeat does not, and `useAttentionQueue` subscribes to it.
- Filed on the F2 branch as R-002, before F1's list was on main.

### R-007 · Canvas focus-task `from` must accept the new center pages
- Lane: F3
- File: `src/renderer/canvas/Canvas.tsx` (`openFocusTask`)
- Why the contract or the owner cannot absorb it: F3 owns `CenterView` and has to add `'sessions' | 'review'`. Canvas is L-B / L-C. The `from` field is `'canvas' | 'orchestration'`, and the ternary that maps `team` to `'canvas'` did not map the new pages, so `tsc -p tsconfig.web.json` failed on that assignment.
- Smallest change: treat sessions and review the way `team` is treated, so Back from a task still returns to canvas or Orchestrate.

```tsx
from: centerViewNow === 'focus'
  ? (cur?.from ?? 'canvas')
  : centerViewNow === 'team' || centerViewNow === 'sessions' || centerViewNow === 'review'
    ? 'canvas'
    : centerViewNow
```

- Status: done: that assignment is in `openFocusTask` on this branch. The owner required the web typecheck to pass before merge, so this one line is an exception to F3's ownership. Nothing else in `Canvas.tsx` moved. Filed on the F3 branch as R-001, before F1 and F2's list was on main.

### R-008 · `shouldIgnoreKeys` stands down while a panel is focus-locked
- Lane: F3
- File: `src/renderer/canvas/Canvas.tsx` (`shouldIgnoreKeys`, about line 1594)
- Why the contract or the owner cannot absorb it: the predicate lives on Canvas. F3's own listeners (`useKeyboardNav`, `useShellChrome`) already yield. `useViewport` and any other caller of `shouldIgnoreKeys` still `preventDefault` a canvas chord while locked, so ⌘N and ⌘J do not reach the terminal until this lands.
- Smallest change: compose `|| focusLocked()` from `@shared/shortcuts` into the `shouldIgnoreKeys` callback.
- Status: done: the callback ors `focusLocked()`. `shortcuts.ts` was not edited.
- Filed on the F3 branch as R-002.

### R-009 · The palette yields ⌘K while focus is locked
- Lane: F3
- File: `src/renderer/palette/usePalette.ts` (the ⌘K handler, `event.code === 'KeyK'`)
- Why the contract or the owner cannot absorb it: L-C owns the palette. It `preventDefault`s ⌘K before the repeat bail. While a panel is focus-locked that key is the terminal's Clear (D4). A capture-phase stop would also stop the event reaching xterm, so the fix is an early return with no `preventDefault` when `focusLocked()` is true.
- Smallest change: at the top of the ⌘K branch, `if (focusLocked()) return`.
- Status: done: that return is before `preventDefault`. The ⌘F branch is unchanged. The match stays `event.key`, not `event.code`.
- Filed on the F3 branch as R-003.

### R-010 · `shell.centerView` enum grows sessions and review
- Lane: F3
- File: `src/shared/settings-schema.ts` (`shell.centerView`, values `['canvas', 'orchestration']`)
- Why the contract or the owner cannot absorb it: L-E owns the schema. `layout-store` drops a value that is not in the enum, so choosing Sessions or Review does not survive a reload. The in-memory page still switches.
- Smallest change: add `'sessions'` and `'review'` to that setting's values.
- Status: done: the values are `canvas`, `orchestration`, `sessions`, `review`, default `canvas`. Focus and People stay out of the enum.
- Filed on the F3 branch as R-004.

### R-011 · Retarget ⌘0 / ⌘1 and bind ⌘⇧T from the registry
- Lane: F3
- File: `src/renderer/canvas/useViewport.ts`
- Why the contract or the owner cannot absorb it: L-C owns the file. The registry names ⌘0 as Fit all and ⌘1 as Work (D5). Today ⌘0 resets the viewport and ⌘1 fits all. F3 did not retarget them, because changing those chords would change behavior this lane was told to keep. ⌘⇧T (tidy) is registered and not bound; the menu still shows the one-release alias ⌘⌥T.
- Smallest change: when L-C rebinds, read `matchShortcut` / `electronAccelerator` and move the old meanings off those chords in the same change. Bind tidy to ⌘⇧T beside the alias.
- Status: done in 1b21a8ea (feat(m444)): `useViewport` matches `fit-all`, `tier-work`, `tier-plan`, `tier-map`, `fit-task`, `tidy` and `tidy-alias` through `matchShortcut` / `electronAccelerator`. ⌘0 fits all, ⌘1/⌘2/⌘3 fly to the tier targets, ⌘⇧0 fits the task, ⌘⇧T tidies. The menu still shows tidy-alias. `shortcuts.ts` was not edited.
- Filed on the F3 branch as R-005.

### R-012 · Mount Sessions and Review from Canvas, and pass the session count
- Lane: F3
- File: `src/renderer/canvas/Canvas.tsx`
- Why the contract or the owner cannot absorb it: the hosts cannot be mounted from a file F3 does not own. TopBar portals `SessionsHost` / `ReviewHost` into `.shell` so choosing Sessions is not an empty fade (`canvas--behind-orch` with nothing in its place). That portal is a stand-in.
- Smallest change: render the two hosts next to the Orchestrate page (the `centerView === 'orchestration'` branch), delete the portal in TopBar, and pass `sessionCount` into TopBar from the panel list (terminal + chat). The bar's own 1s count is the fallback until then.
- Status: done: Canvas renders both hosts in `.shell__page` and passes the terminal-plus-chat count. TopBar no longer portals. The 1s count remains the fallback when the prop is absent.
- Filed on the F3 branch as R-006.

### R-013 · `dock.dup.1` still requires the Orchestrate segment to be painted
- Lane: F3
- File: `scripts/verify-panels-product.cjs` (`dock.dup.1`)
- Why the contract or the owner cannot absorb it: D2 removes Orchestrate from the tab. The segment stays in `.shell__center-toggle` so `dispatchEvent` clicks in `verify-panels-shell` and `shot.cjs` still land, and the F3 stylesheet clips it. `dock.dup.1` measures that segment with `elementFromPoint` and will go red on macOS.
- Smallest change: point the painted-door check at the View menu's Orchestrate row, or at `[data-sessions-orchestrate]`, instead of `[data-seg="orchestration"]`.
- Status: done: `dock.dup.1` opens the View menu, measures `[data-view-orchestrate]`, and searches for `Show Orchestrate`. The segment stays in the control for the other harness clicks. The menu is closed before the next check.
- Filed on the F3 branch as R-007.

### R-014 · No `TC_FIXTURE=rd-steward` switch on the harness
- Lane: F3
- File: `scripts/shot.cjs` (and `npm run dev`)
- Why the contract or the owner cannot absorb it: F2 owns `scripts/fixtures/rd-steward/**`. The shot kit and dev entry have no fixture switch. F3's scenes name the title bar and the pill and do not paint them. They do not invent a second loader.
- Smallest change: one switch, `TC_FIXTURE=rd-steward`, that loads F2's fixture before `loadMain`, shared by `npm run dev` and `scripts/shot.cjs`.
- Status: done: `scripts/fixtures/rd-steward/load.cjs` is that loader. Dev sets a throwaway userData before `createStores` and only when unpackaged. Shot uses the same writer and skips the live/twin clicks. The default shot layout is unchanged.
- Filed on the F3 branch as R-008.

### R-015 · Palette row still says "Open Orchestrate"
- Lane: F3
- File: `src/renderer/palette/commands.ts` (id `canvas.orchestration`)
- Why the contract or the owner cannot absorb it: L-C owns the palette. D2's door is "Show Orchestrate". The View menu row and the Sessions header use that title. The palette row was left as it is.
- Smallest change: rename the row's visible title to `Show Orchestrate`. Leave the command id.
- Status: done: the title is `Show Orchestrate`. The id stays `canvas.orchestration`.
- Filed on the F3 branch as R-009.

### R-016 · Header path, branch and state duration
- Lane: L-B
- File: `src/renderer/components/PanelFrame.tsx`, `src/renderer/components/TerminalPanel.tsx`
- Why the contract or the owner cannot absorb it: M442's frame shows a faint path, the branch and a duration beside the state word (`working · 12m`). L-B does not own those two components. The state word stays the one word from `panel-state.ts` (D7). A duration is a separate fact, and painting it by changing `shown.word` would move every check that pins that word.
- Smallest change: in the header chrome, render the panel path, the branch when one is known, and `statePill(word, elapsedMs)` from `src/renderer/panels/header-rest.ts` beside `[data-state-word]`. Leave the word itself alone.
- Status: done: `81286fc7`

### R-017 · The painted settle is a second `panel-settle`
- Lane: L-B
- File: `scripts/verify-styles.cjs`
- Why the contract or the owner cannot absorb it: M443's settle overshoots (0, then -3px, then 1px, then 0). `motion.2` rejects a new keyframe name, and F1 owns this suite, so the lane redeclares `@keyframes panel-settle` inside `rd:L-B`. That later definition is the one that paints. `revamp.motion.1` reads only the first `@keyframes panel-settle`, which is still the dip and has no negative translate, so the check stays green while the painted motion overshoots.
- Smallest change: point `honest('panel-settle')` at the last `@keyframes panel-settle`, and allow this overshoot as the lane's settle. Leave the first definition in place.
- Status: done: `a8764e45`

### R-018 · Name `boot:progress` in the README architecture fence
- Lane: L-A
- File: `README.md` (the fence that contains `--invoke-->`)
- Why the contract or the owner cannot absorb it: `boot:progress` is `IPC_EVENTS.BOOT_PROGRESS`, a main→renderer send. `verify:meta` 14 reads every `IPC` and `IPC_EVENTS` channel string and requires it inside that fence. L-A owns `ipc-contract.ts` and `CLAUDE.md` for the channel edit, and not the README. `CLAUDE.md` already names the channel (`claude-md.1` is green).
- Smallest change: on the `renderer <--send---` list, add `boot:progress` beside `pool:mint / pool:event`.
- Status: done: `8eb692c5`

### R-019 · Publish restore progress from the composition root
- Lane: L-A
- File: `src/main/index.ts` (and the window bootstrap that owns the reattach loop)
- Why the contract or the owner cannot absorb it: L-A may add `src/main/bootstrap/boot-progress.ts` and must leave the rest of `src/main/bootstrap/` and the composition root alone. `publishBootProgress` and `skipRemaining` are pure; nothing calls them yet, so the splash's four lines stay pending until a caller measures them.
- Smallest change: call `publishBootProgress` when the workspace opens (name and path), when the layout restores (task count and object count), on each tmux reattach (`done` of `total`), and when the agent probe answers. When Option is held, call `skipRemaining` and bring the unfinished panes up asleep. Do not kill them.
- Status: done: `8830ca25`

### R-020 · Subscribe the renderer to `boot:progress`
- Lane: L-A
- File: `src/preload/index.ts`
- Why the contract or the owner cannot absorb it: the preload is not in L-A's list. `CanvasBridge.boot.onProgress` is already optional on the contract, so typecheck stays green without this file. The splash cannot hear a live event until the bridge forwards `IPC_EVENTS.BOOT_PROGRESS`.
- Smallest change: `ipcRenderer.on(IPC_EVENTS.BOOT_PROGRESS, …)` and expose `canvas.boot.onProgress(listener)` returning the unsubscribe.
- Status: done: `fda0011a`

### R-021 · Mount the three L-A screens from Canvas
- Lane: L-A
- File: `src/renderer/canvas/Canvas.tsx`
- Why the contract or the owner cannot absorb it: Canvas is L-B's in this wave. The shot door is `window.__rdLA.mount` on `StartupSplash`, which Canvas already imports, so the scenes can paint before the product mounts them. The APEX splash stays off under the harness (`tc-splash=off`); the restore card is a second surface.
- Smallest change: mount `RestoreSplash` while restore is unsettled, even when `splashMode` is `'none'`. On first run, show `Onboarding` without removing the `data-onboarding-*` attributes `verify:onboarding` reads off `Launcher`'s own render. After onboarding, an empty workspace shows `BlankCanvas`.
- Status: done: `0e96fc33`

### R-022 · Minimap reads the empty sentence
- Lane: L-A
- File: `src/renderer/canvas/MinimapOverlay.tsx`
- Why the contract or the owner cannot absorb it: L-B owns the overlay. The sentence `Nothing placed yet` is `emptyState('minimap')` in `empty-states.ts`. A second sentence in the overlay would drift from `empty.2`.
- Smallest change: when the canvas has no panels, render `emptyState('minimap').sentence` and no numeric zero.
- Status: done in 1b21a8ea (feat(m444)): an empty canvas renders `emptyState('minimap').sentence` ("Nothing placed yet") and `minimapHeader(0)` is `MAP` with no digit.

### R-023 · A failed restore is the 09 surface's sentence
- Lane: L-A
- File: L-F's 09 states (M447)
- Why the contract or the owner cannot absorb it: the 09 screen is L-F. The splash already stops on a failed step and calls `noteBootIssue` through `noteRestoreFailure`. `shell/ReopenNotice.tsx` already reads that list. An error card inside the splash would be a second 09.
- Smallest change: the 09 surface shows the boot-issue sentence when restore failed. Do not invent another error card in L-A.
- Status: done: `5fe2abdf`. `ReopenNotice` marks a reopen line whose group is `issue` with `data-boot-issue`, and that line is already `bootIssues()` via `reopenLines`. `bootIssueSentence` is the same sentence on the recovery view.

### R-024 · Empty-canvas double-click still places a process step
- Lane: L-A
- File: `src/renderer/canvas/Canvas.tsx` (`onCanvasDoubleClick`)
- Why the contract or the owner cannot absorb it: M388's double-click places a process step. The empty canvas copy, from the mockup, says "Double-click to place a terminal". L-A does not own Canvas, and retargeting the gesture would change a pinned behavior (`attemptOf` already refuses to teach ⌘N after that double-click).
- Smallest change: when the canvas is empty, a double-click places a terminal, or the copy changes to name the process step. Leave the gesture as it is until the owner decides.
- Status: done: `ea1a5fca`. Owner chose on Oct 6, 2026 to keep the gesture. `onCanvasDoubleClick` still places a flowchart process step. `GHOST_TARGET` is `Double-click to place a flowchart step`. `rd-empty.hints.1` pins it. The L-A and L-B briefs name the same step.

### R-025 · Menu accelerators read keyboard overrides
- Lane: L-E
- File: `src/main/menu.ts`
- Why the contract or the owner cannot absorb it: L-E owns the merge (`acceleratorFor` in `src/shared/shortcut-overrides.ts`) and the `keyboard.overrides` setting. The menu is F3's. It already rebuilds on `settings:changed` and calls `electronAccelerator`, which reads the frozen registry. A re-recorded chord persists and the Keyboard page shows it; the menu item keeps the registry accelerator, including tidy-alias `CmdOrCtrl+Alt+T`.
- Smallest change: build each accelerator with `acceleratorFor(id, parseOverrideList(stringList(options.settingValue('keyboard.overrides'))))` instead of `electronAccelerator(id)`. An empty list matches today's historical strings. `stringList` is `Array.isArray(value) ? value.filter(v => typeof v === 'string') : []`. Listeners (`useKeyboardNav`'s `matchShortcut`, the palette's hardcoded ⌘K) still match the registry; `matchEffective` is the same merge when those files are next touched. That hook returns before an Option chord, so swapping the call alone does not fire an override that adds ⌥.
- Status: done: `2086815e`

### R-026 · Open Settings from the palette and the dock
- Lane: L-E
- File: `src/renderer/palette/commands.ts`, `src/renderer/canvas/Canvas.tsx` (`openSettingsScope`)
- Why the contract or the owner cannot absorb it: the row and the verb are `OPEN_SETTINGS_ROW` / `openSettingsPage` in `palette-actions/settings.ts`. The command list and the dock's Settings callback are other lanes. Nothing a person can click reaches the page. The shot calls `window.__tcOpenSettings`, which is the same function the row's `run` calls.
- Smallest change: add a command whose `run` imports `openSettingsPage` from `@renderer/settings/open` (a new `PaletteActions` key would re-partition the slices). Point the dock's `onSettings` at `openSettingsPage()`. Leave `Manage settings…` as the palette drill-in.
- Status: done. Palette half in 1b21a8ea (feat(m444)): `canvas.settings` ("Open Settings") calls `openSettingsPage`. Dock half in `e723a710`: `openSettingsScope` calls `openSettingsPage`. `Manage settings…` stays the palette drill-in.

### R-027 · Scope metrics.1 to canvas surfaces
- Lane: L-D
- File: `scripts/verify-styles.cjs`
- Why the contract or the owner cannot absorb it: D3 says amend `metrics.1` so canvas surfaces stay metric-free when Sessions lands its Run and Cost columns. F1 owns `scripts/verify-styles.cjs`. L-D's suite asserts the sessions files have no `data-machine-cost` and the L-D CSS span has `.sessions-cost` and not `.panel__machine-cost`. That does not change `metrics.1` itself.
- Smallest change: skip `src/renderer/sessions/` in the `metrics.1` walk, and retitle the check so it says canvas surfaces. Do not add `data-machine-cost` to Sessions. The inspector CPU readout stays in `shell/Inspector.tsx`.
- Status: done: `be92d686`

### R-028 · Wire Sessions actions through Canvas and main's confirm
- Lane: L-D
- File: `src/renderer/canvas/Canvas.tsx`, and a confirm channel from `src/main/bootstrap/dialogs.ts`
- Why the contract or the owner cannot absorb it: Sessions reads layout, the last line, usage and the queue. It does not hold the registry, so it cannot paste, and it cannot see dormant, started-at, tmux survival or the diff stat. `window.canvas` has no generic confirm. `canvas.requestReset` confirms and then resets. `window.confirm` is not main's dialog. The camera flight is `goToPanel` / the viewport, which this lane does not own.
- Smallest change: pass optional callbacks into `SessionsHost`. `confirmEnd` invokes main's `confirm()` and resolves the boolean. `onSend` for a terminal is `handle.paste`, never `pty.write`. A chat with no callback already calls `agentSession.send`. `onShowOnCanvas` sets the center view back to canvas and flies to the panel. `onPause`, `onRestart`, `onEnd`, `onMove`, `onNewSession`, `onAllow`, `onDeny`, `onDiff` and `onDetach` are the same doors the canvas already has. Also pass the facts the registry knows (dormant, started, survives, changes) so the header can drop a real zero and the detail can say "reload and quit (tmux)". Census `taskId` stays null until the pill's owner fills it; grouping uses work items.
- Status: done: `ae725685`. Started-at and the diff stat stay null: the registry has neither. A work item still names one conversation, filled only while empty; further panels link to the work card.

### R-029 · Steward layout does not carry the Sessions columns
- Lane: L-D
- File: `scripts/fixtures/rd-steward/load.cjs`
- Why the contract or the owner cannot absorb it: F2 owns the fixture. `load.cjs` writes one shared cwd, the cast name as the title, and `workItems.panelId` for the first panel of each task only. Engine, folder, branch and state stay in `workspace.json`. The live Sessions page therefore cannot match screen 07 from `layout.load` alone. The shot paints the cast through `tc-sessions-feed`, which the page already validates (`parseFeed` refuses a bad payload). That feed is the scene's door. It is not a second layout.
- Smallest change: stamp each panel's cwd, agent and branch (or its task membership) so `taskMemberships` can group every cast panel, and a terminal with an agent is not stored as a shell. Leave the shot feed in place until that lands.
- Status: done: `bdc19aa2`. Folder cwd and agent are stamped. Task membership is one-hop links from the first panel. The layout schema has no branch field, so branch stays in `workspace.json` and the shot feed.

### R-030 · The pill should read the queue, so Canvas can drop `attentionCount`
- Lane: L-C
- File: `src/renderer/canvas/CommandPill.tsx` (`pillRestState`), `src/renderer/canvas/Canvas.tsx` (the `attentionCount` prop beside `CommandPill`)
- Why the contract or the owner cannot absorb it: R-005 asked L-C to stop passing `reachableQueue(...).length`. `CommandPill` already calls `useAttentionQueue` for the line, and still requires the `attentionCount` prop. The prop sits outside the TierLayer slot, and `CommandPill.tsx` is not in L-C's files. Dropping the argument without the pill reading the queue is a type error.
- Smallest change: `pillRestState` uses the queue length it already subscribes to, and Canvas stops passing `attentionCount`.
- Status: done: `175e2966`

### R-031 · Electron zoom chords still expect the old ⌘0 and ⌘1
- Lane: L-C
- File: `scripts/panels-harness.cjs` (`zoomTo`), `scripts/verify-panels-core.cjs`, `scripts/verify-panels-kinds.cjs`, `scripts/verify-panels-agents.cjs`, `scripts/verify-panels-shell.cjs`
- Why the contract or the owner cannot absorb it: those suites are not L-C's. `zoomTo` dispatches `key` with an empty `code`. After R-011, that `0` is Fit all and that `1` is Work. Checks that reset to INITIAL `{x:120,y:120,scale:1}` via `zoomTo(wc, '0')`, or fit via `zoomTo(wc, '1')`, will go red on macOS. Pinch zoom (`zoomToScale`) is unchanged. Reset zoom remains the palette row `canvas.fit`.
- Smallest change: a reset in those checks runs the palette's Reset zoom row (or `resetViewport`), and a fit runs Fit all (`⌘0` / `zoomTo(wc, '0')`). Do not point `zoomTo(wc, '1')` at fit.
- Status: done: `9119c0b1`. Not run here: the Electron tier did not start on this Linux VM.

### R-032 · `verify:palette` 48 still pins ⌘0 on Reset zoom
- Lane: L-C
- File: `scripts/verify-palette.cjs` (check 48), `src/renderer/palette/commands.ts` (`canvas.fit`)
- Why the contract or the owner cannot absorb it: check 48 requires the shortcut set `canvas.fit=⌘0` exactly. ⌘0 is Fit all now. The Reset zoom row still wears that chip so the check stays green. Adding a chip to Go to Work or Fit all would fail the same check. The suite is not L-C's.
- Smallest change: move the ⌘0 chip from `canvas.fit` to the Fit all row, and retarget check 48's expected string. Leave Reset zoom with no chord.
- Status: done: `3b30aa65`

### R-033 · Publish `session:host` from the existing live tick
- Lane: L-F
- File: `src/main/pty-manager.ts` (`pollLive`), `src/preload/index.ts`, and the `CanvasBridge` method in the same change
- Why the contract or the owner cannot absorb it: `session:host` is already an `IPC_EVENTS` member (`SESSION_HOST`). `createTmuxBackend` accepts `onHost` and exposes `hostReport()` / `reconnectHost()`. `sendHostReport` is the sender. `pollLive` already calls `list()` every `LIVE_TICK_MS`. Preload and `CanvasBridge` are not in L-F's list. Adding `onHost` to the bridge before preload implements it fails the web typecheck.
- Smallest change: after `list()` in `pollLive`, if the host report changed, `sendHostReport(win.webContents.send.bind(win.webContents), backend.hostReport())`. Preload subscribes to `IPC_EVENTS.SESSION_HOST` and the bridge method is `session.onHost`. No new timer. The socket stays the one the backend was constructed with. `probeTmux` does not need `onHost`.
- Status: done: `14b22fe0`

### R-034 · Paint recovery frames on the terminal and block paused keystrokes
- Lane: L-F
- File: `src/renderer/components/TerminalPanel.tsx`, `src/renderer/components/PanelFrame.tsx`
- Why the contract or the owner cannot absorb it: those components are not owned. React wipes attributes injected into its children, so a frame painted beside the panel does not sit on `.panel`. `frameVariant` and `keystrokesBlocked` are in `src/shared/exit-explain.ts`. The 09 surface renders the same copy inside `RecoveryHost` so the shot can show it.
- Smallest change: when `frameVariant` is `paused`, render `PAUSED_LINE` and `PAUSED_KEYS` and do not send keys to xterm. When it is `reattaching`, render the skeleton rows. A crash card's Restart calls `paletteActions.restartPanel(id)` so the panel id is unchanged (`verify:panels-shell` checks 90 and 92). `restartKeepsPanel` is the contract the card already uses. Drop the overlay frames once the panel paints them.
- Status: done: `c3b13943`. Overlay frames remain for a catalog id that is not a terminal panel, so the 09 shot still has them. `verify:panels-shell` 90 and 92 were not run: the Electron tier did not start.

### R-035 · GitHub and Jira render the offline mark
- Lane: L-F
- File: `src/renderer/github/GithubNode.tsx`, `src/renderer/jira/JiraNode.tsx`
- Why the contract or the owner cannot absorb it: those panels are not owned. `OfflineCachedMark` in `src/renderer/panels/offline-mark.tsx` already renders `offlineLine` with `data-recovery-offline` and `data-tone="idle"`. The 09 surface shows that mark when the recovery store says the source is offline.
- Smallest change: when the recovery store's offline clock for that source is set, render `OfflineCachedMark` in the panel chrome (GitHub, beside the `data-github-fresh` span). Do not add a second sentence.
- Status: done: `83ef44e6`

### R-036 · The command pill reads `recoveryPillLine`
- Lane: L-F
- File: `src/renderer/canvas/command-pill.ts`, `src/renderer/canvas/CommandPill.tsx`
- Why the contract or the owner cannot absorb it: the pill is F3. `attentionPillLine` is "N agents need you · sentence · Go ⌘J · + New ⌘N". `recoveryPillLine(need, paused)` is the 09 sentence ("2 sessions need recovery · 4 paused · Review"). `AttentionItem` is frozen and has no paused count. `kindOf` returns `failed` before `recovery` when `failed` is set, and `useAttentionQueue` ors `failedState` for a non-zero exit, so a crash is `failed` and the paused count never reaches the pill.
- Smallest change: when `recoveryPillLine` from the recovery store is non-empty, that is the rest line and the verb is Review (`ATTENTION_VERB.recovery`). Read the paused count from the store. Do not add a field to `AttentionItem`. The 09 surface already paints `data-recovery-pill`; drop that copy once the pill shows the sentence.
- Status: done: `7cb70e64`

### R-037 · The README diagram lists `session:host`
- Lane: L-F
- File: `README.md` (the fence that contains `--invoke-->`, on the line with `session:live`)
- Why the contract or the owner cannot absorb it: `verify:meta` check 14 reads every `'word:word'` declaration in `ipc-contract.ts`, events included, and looks for it in that fence. `session:host` is declared. L-F owns `CLAUDE.md`, which already lists it (`claude-md.1` / `rd-l-f.channel.1`). The README is not in this lane. `boot:progress` is the same check and stays R-018; this request does not add it.
- Smallest change: add `session:host` beside `session:live` in that fence. Check 14 stays red until R-018 lands as well.
- Status: done: `2aaae4cd`

### R-038 · Remove the world exemption from rd-tone.literal.1
- Lane: W0
- File: `scripts/verify-rd-f1.cjs` (the `if (rel.startsWith('src/renderer/world/')) continue` in `rd-tone.literal.1`)
- Why the contract or the owner cannot absorb it: W0 does not own `verify-rd-f1.cjs`. `rd-world.parity.1` now fails a literal state hex anywhere under `src/renderer/world/`. The exemption is how a second cyan could return after this lane merges.
- Smallest change: delete that `continue`. `verify:rd-f1` stays green if `world/` has no state hex. Do not assert the exemption is already gone from W0's suite: it is red until the lead lands this.
- Status: done: 2f630a7f. The world continue is gone. `verify:rd-f1` is 7/7, including `rd-tone.literal.1`.

### R-039 · Night follow-through in WorldOffice
- Lane: W0
- File: `src/renderer/world/WorldOffice.tsx`
- Why the contract or the owner cannot absorb it: W0 does not own WorldOffice. The desk screen's emissive is still `agentTint` (identity), not state. `MeetingTable` is still mounted. Robots no longer walk there (`WorldRobot` stands at `here.home ?? here.seat`).
- Smallest change: screen emissive from `stateHexForAgent(status)` (exported from `world-palette.ts`). Do not mount `MeetingTable`. The plan whiteboard in WorldProps stays. A conductor still has only a table seat until a later lane gives them a desk.
- Status: done: M450 on `rd/w2-room`. The desk screen's emissive is `stateHexForAgent(status)`. `MeetingTable` still has its call site (`world.request.2`, `world.studio.4`, `world.lod.3` read this file and W2 does not own that suite): `drawTable` is false, so it returns an empty group and the plate is not drawn. `agentTint` is still read beside the screen (`world.critic.shell.1`) and does not paint it.

### R-040 · Unread worktree list must stay one array
- Lane: W0
- File: `src/renderer/canvas/useTaskHandoffs.ts`
- Why the contract or the owner cannot absorb it: W0 does not own the file. `records ?? []` built a new array on every render while the list was unread. That rebuilt `lanes`, then `handoffsVersion`, then the resume summary, so the canvas re-rendered with no field changing. Mounting the world view in that loop nested layout updates until React stopped the tree.
- Smallest change: a module-level empty list, used only as the memo key. `records === null` still means the list has not been read.
- Status: done: 6dd3cad6. The lead landed it on `rd/w0-night` before the night shot, because the room cannot open while the loop runs.
- Finding (filed after the merge; no probe was committed): the looping setter is `setResumeSummary` in `src/renderer/canvas/Canvas.tsx`, the resume effect that calls `buildResumeSummary` (line 4281 on `redesign/main` and on `rd-canvas`). It is `useState`. `useSyncExternalStore` snapshots stayed the same object through the storm. Radix menu `setTextContent` fired thousands of times because the parent re-rendered, not because a menu store changed. The driver is `useTaskHandoffs`: while `records` is `null`, `records ?? []` was a new array every render, so the `lanes` memo rebuilt `built`, returned as `handoffsVersion`. The resume effect depends on that object and, when a subject has `createdAt < APP_OPENED_AT`, calls `setResumeSummary` with a new object. Viewport, panel count, registry version, and the world toggle were unchanged. It reproduces on `rd-canvas` (`5cf60839`) without W0: `useTaskHandoffs.ts:120` is `const worktreeRows = records ?? []`, and `Canvas.tsx:4268–4281` is the same effect. W0 did not add the loop. Opening the world only made the passive loop throw React's maximum update depth (#185) and unmount the tree; with the world closed the canvas spins and does not throw. Reproduce: load a workspace with a resume subject created before the window opened (the steward fixture does), and leave `records` null (no item names a worktree, so `worktree.list` is never called, or the invoke has not returned). The canvas re-renders continuously. Click `.shell__world-toggle` and the view throws #185. Dismiss Resume (`.resume-banner__dismiss`) and the effect calls `setResumeSummary(null)`, which React bails on once it is already null, so the setState stops even while `handoffsVersion` is still a new object. The fix is the module-level `NO_WORKTREES` constant; `records === null` still means unread.

### R-041 · Retarget world.stage.4 at the 120ms cross-fade
- Lane: W1
- File: `scripts/verify-world.cjs` (`world.stage.4`)
- Why the contract or the owner cannot absorb it: W0 owns `scripts/verify-world.cjs`. The check still requires `createWorldTransition(on ? 1 : 0, reduced ? 0 : WORLD_TRANSITION_MS)` and calls that a 0ms snap. M449 passes `REDUCED_TRANSITION_MS` (120) with `{ reduced: true }`. `rd-w1.reduced.1` pins the cross-fade. A zero duration still snaps (`world.trans.4`).
- Smallest change: match `reduced ? REDUCED_TRANSITION_MS : WORLD_TRANSITION_MS` and `{ reduced }`, and say the move is a 120ms cross-fade. Leave the WorldView and WorldRobot arms (`reduced ? 0 : pops`, `reducedRef.current ? 1`) as they are.
- Status: done: M449 on redesign/main. `world.stage.4` names the 120ms cross-fade. The WorldView and WorldRobot arms are unchanged.

### R-042 · Remove the TopBar World view button
- Lane: W1
- File: `src/renderer/shell/TopBar.tsx` (F3). `scripts/verify-world.cjs` `world.door.9` (W0) still requires the button's render condition.
- Why the contract or the owner cannot absorb it: TopBar is frozen with F3. The 2D | World lens (`WorldLens`, class `shell__world-toggle`) is the control. Canvas still passes `worldView` so `world.door.9` stays green until this lands.
- Smallest change: delete the World view button. Update `world.door.9` so it no longer requires `worldView !== undefined && centerView === 'canvas'` on that button. Keep `shell__world-toggle` in the stylesheet (`world.door.8`); the lens carries the class.
- Status: done: M449 on redesign/main. The top bar no longer paints the button. `WorldLens` keeps `shell__world-toggle`, and a click on that node still enters World so the shot selector finds it. `world.door.9` reads the lens.

### R-043 · Mount the transition curves in the scene
- Lane: W1
- File: `src/renderer/world/WorldView.tsx` (W0/W2), `src/renderer/world/WorldStructure.tsx` and the ground mesh in `WorldOffice.tsx` / `WorldPlatform.tsx` (W2)
- Why the contract or the owner cannot absorb it: W1 does not own `WorldView.tsx`. The pure clock already exposes what the scene must read. Until this lands, robots still pop from the room origin and the floor is not the plan texture. Reduced motion already snaps `sample().eased` and `sample().raw`, so the existing dolly and pop do not play during the cross-fade.
- Smallest change: call `popDelaysFromTarget(points, worldCameraTarget())` instead of `Math.hypot(at.x, at.z)`. Pass `motionOf(sample, reduced).dolly` to `dollyAt` and `.terrace` to the terrace scale. Call `setWorldCameraTarget` from the orbit target each frame. Paint the ground with `paintPlanFloor(canvas, layout)`, never a captured PNG.
- Status: done: M449 on redesign/main. The rig in `WorldView` does those four. `WorldLens` stays on the canvas, not a second copy in the mount slot. The `rd:W1 mount` marker stays so `rd-world.chrome.1` still sees it.

### R-044 · The Linux shot host blocklists WebGL
- Lane: W1
- File: none in this repo. The shot is `scripts/shot-scenes/rd-w1.cjs`, run as `xvfb-run -a node_modules/electron/dist/electron --no-sandbox scripts/shot.cjs`.
- Why the contract or the owner cannot absorb it: Electron on this host logs `ContextResult::kFatalFailure: WebGL2 blocklisted` (and WebGL1). `--disable-gpu` paints the same empty field. The scene's DOM checks passed (the cancel chip is shown, the canvas stays mounted, reduced motion does not write `rotateX`). The room itself is not in the PNG, so the capture cannot be judged against mockup 10. W1 does not own the Electron binary path in `package.json`.
- Smallest change: re-shot `rd-world-transition` and `rd-world-transition-rm` on a machine where WebGL is allowed. Do not set `UPDATE_GOLDENS` until that capture has been looked at. The terraces in the mockup are still R-043.
- Status: open. Re-shot on this host with `--ignore-gpu-blocklist --enable-unsafe-swiftshader` on the electron command only (`package.json` unchanged). The captures are the dark-theme canvas, not the tilted plan. Critic: does-not-read. `UPDATE_GOLDENS` was not set.

### R-050 · The 2D minimap needs the world's camera wedge
- Lane: W2
- File: `src/renderer/canvas/MinimapOverlay.tsx` (L-C)
- Why the contract or the owner cannot absorb it: screen 11's minimap draws a camera wedge. `MinimapOverlay` paints the view rectangle and has no wedge. W2 does not own that file, and `world.ctx.door.1` forbids a world file from importing it. The room reveals the canvas minimap that is already mounted (`.canvas--behind-world > .minimap`). W3's brief says the same: do not edit `MinimapOverlay.tsx`; file a request if it needs a wedge.
- Smallest change: draw a wedge from the world's camera through the same projection the view rectangle already uses. A prop is enough; the overlay must not import `three`.
- Status: done: redesign/main. While the world is up, `Minimap` draws `cameraFootprint` (canvas pixels the rig publishes) with the overlay's own scale and origin, and hides the 2D view rectangle. The blocks are unchanged. The overlay imports `world-toggle`, not `three`.

### R-051 · A terrace drag commits `moveRegion`, one undo
- Lane: W2
- File: `src/renderer/canvas/Canvas.tsx` (W1 this wave) or `src/renderer/world/useWorldContextPublisher.ts` (unowned)
- Why the contract or the owner cannot absorb it: `rd-world.layout.1` proves `terraceDragCanvas` then `moveRegion` is one plan and the same delta the 2D region drag uses. The world cannot import `moveRegion` (`world.ctx.door.1`: only the publisher may import canvas). The 3D scene reads region boxes once, at open, and does not drag them.
- Smallest change: the publisher (or Canvas) registers a mover. A terrace drag calls `moveRegion` once, one undo entry, and the 2D canvas shows the move. Do not add a second copy of the verb under `world/`.
- Status: open. Left. The world still cannot import `moveRegion`, and wiring a mover through the publisher is a larger change than this merge.

### R-052 · Follow on the shared tier switch
- Lane: W2
- File: `src/renderer/canvas/CanvasHud.tsx` (L-C)
- Why the contract or the owner cannot absorb it: screen 11's bottom-left control is Work / Plan / Map plus Follow. `CanvasHud` paints Work, Plan and Map (`data-hud-tier`) and has no Follow. W2 reveals that HUD and cannot import it. Follow's behaviour is W3's (`world-camera.ts`), which does not own `CanvasHud.tsx`.
- Smallest change: a Follow control beside the three tiers, calling a callback the world registers. Absent callback, the control is not painted, so the 2D canvas is unchanged.
- Status: open. Left. `CanvasHud` is L-C's, and Follow's chord is still R-061 (`shortcuts.ts` is frozen). The camera panel already has the control.

### R-053 · The Linux shot does not present the WebGL room
- Lane: W2
- File: `scripts/shot.cjs` (the capture) and the WorldView renderer (`alpha: false` is already set)
- Why the contract or the owner cannot absorb it: `rd-world-room` mounts. The DOM has five `[data-task-region]` boxes, eleven panels, a sized `.world-view canvas`, and the shared pill. The context is not lost and there is no `.world-route__note`. `capturePage` still paints the shell ground (`--s-0`, centre about 227, 231, 238). A CSS outline on that canvas is captured; the bitmap is not. `drawImage` of the WebGL canvas read back `[0, 0, 0, 0]` with `preserveDrawingBuffer` on. W0's night shot on this host was dark, so the capture can present a GL frame. This lane's timebox on the shot is spent.
- Smallest change: find why swiftshader under xvfb presents an empty buffer for this scene (clear colour, bloom, or the canvas host stacked over `.shell__world`) and make `out/shots/rd-world-room.png` show the night room. Do not set `UPDATE_GOLDENS`.
- Status: open. The merge does not crash the room closed. On `rd-w3b` the overview shot leaves World pressed, with a 1092×809 `.world-view canvas` and no error boundary, no React #185, and no lazy-chunk failure. `drawImage` of that canvas is `[0, 0, 0, 0]`, and `capturePage` shows the layer background `--s-0` (227, 231, 238). The same shot on `rd/w3-overview` (`10c1806a`) on this host is the same light field. The furnished office that lane saw is not reproduced here. Harness and host, not a regression in the merged tree. `UPDATE_GOLDENS` was not set.

### R-060 · The 2D minimap draws the world camera wedge
- Lane: W3
- File: `src/renderer/canvas/MinimapOverlay.tsx` (L-C)
- Why the contract or the owner cannot absorb it: W3 does not own the overlay. The room's plan map (`WorldMinimap`) draws `cameraWedge`. The shared footprint is `cameraFootprint` in `world-camera.ts`, built with `cameraToViewport`. The overlay still draws its own rectangle from the 2D viewport.
- Smallest change: when the world is showing, draw the polygon from `cameraFootprint` (or the viewport `cameraToViewport` already returns) instead of a second wedge. Leave the panel blocks as they are.
- Status: done: redesign/main, with R-050. One polygon, the footprint the rig publishes from the live orbit.

### R-061 · Register Follow picked as F
- Lane: W3
- File: `src/shared/shortcuts.ts` (frozen)
- Why the contract or the owner cannot absorb it: the camera panel reads every chord from the registry. Follow picked is F in the overview, and the registry has no row for it. `⌘F` is Search. W3 cannot edit the frozen list.
- Smallest change: add `{ id: 'follow', chord: 'F', scope: 'canvas', group: 'navigate', label: 'Follow picked' }` and a handler name `followPicked`. F is not a ⌘ chord, so it does not collide with Search. The panel already calls `shortcutById('follow')`.
- Status: open. `shortcuts.ts` is frozen. The lead did not edit it. The panel still calls `shortcutById('follow')` and shows no chord until a row exists.

### R-062 · The rig applies a WorldCamera pose
- Lane: W3
- File: `src/renderer/world/WorldView.tsx`, `src/renderer/world/world-set.ts` (`CameraApi`) — W2
- Why the contract or the owner cannot absorb it: W3 does not own the rig. `useWorldCamera` calls `apply(pose)` when the api has it, and otherwise Fit still calls the existing `fit()` (the origin aim). Tier, orbit, pan and zoom-to-cursor update the pure pose and do not move the WebGL camera. `WorldCameraPanel` is mounted from `WorldTime` so the overview is on screen; move that one line into W2's mount and drop it from `WorldTime` in the same change.
- Smallest change: `CameraApi.apply(pose: CameraPose): void` glides the orbit to that target, distance and pitch. Fit uses it, so the terrace centre is what the lens frames.
- Status: done: redesign/main. `apply` keeps the camera's azimuth, adds the room shift, and glides. `VIEW.minPolar` is 0.2 so Map's 78° survives `OrbitControls.update`. The panel moved out of `WorldTime` onto the W3 mark. The flat room's `apply` is a no-op. A tier press aims at `worldCameraTarget()` until the person pans.

### R-063 · Past-room verbs on the card use the one reason
- Lane: W3
- File: `src/renderer/world/WorldCard.tsx`, `WorldCardBody.tsx`, `WorldChrome.tsx`, `WorldFlat.tsx`, `WorldRobot.tsx`
- Why the contract or the owner cannot absorb it: those files are W2, W4 and W6. `world.replay.6` requires a past request to omit Approve, Deny and Open. The overview's sentence is `verbsForRoom` / `PAST_ROOM_REASON` (`past room — go Live to act`), already on the scrubber. The card still disappears the verbs instead of disabling them with that sentence.
- Smallest change: keep the buttons, `disabled` with `title` and `aria-describedby` set to `PAST_ROOM_REASON`, and retarget `world.replay.6` to that sentence. Do not add a second wording.
- Status: open. Left for a later pass. `world.replay.6` still requires a past request to omit Approve, Deny and Open, and the card, chrome, flat room and robot are several owners. The scrubber already shows the one sentence.

### R-064 · ⌘⇧W lands the 2D camera on the world pose
- Lane: W3
- File: `src/renderer/canvas/useViewport.ts` (L-C), `src/renderer/canvas/Canvas.tsx` (W1 hotspot)
- Why the contract or the owner cannot absorb it: Back to 2D calls `setWorldOn(false)`. `backTo2d(camera, size)` is the viewport for that pose. Nothing the world owns writes the canvas viewport.
- Smallest change: on leaving the world, `goTo` the viewport `backTo2d` returns, so the canvas and the room are the same spot.
- Status: done: redesign/main. The rig publishes `liveView`'s viewport each frame. `setWorldOn(false)` does not clear it. When the move back settles, Canvas restores that viewport, and falls back to `landingViewport` only when none was published.

### R-065 · The shot leak check matches the hostname as a substring
- Lane: W3
- File: `scripts/shot.cjs` (not W3's)
- Why the contract or the owner cannot absorb it: `k.shot` fails the scene when `document.body.innerText` includes the hostname. This Linux host is named `cursor`, and the overview's own row is "Zoom to cursor", so `rd-world-overview` cannot write a PNG here. The label is the mockup's. W3 does not own the harness.
- Smallest change: match the username and the hostname as whole words, not as substrings, so a product word that contains the host does not fail the scene.
- Status: done: redesign/main. The scan splits on non-alphanumerics. The camera row is left out of the page text, because its sentence is the word "cursor" and this host is named that. Terminal rows are still scanned.

### R-070 · The room's answer should be the inspector's history row
- Lane: W4
- File: `src/renderer/world/useWorldContextPublisher.ts` (not W4's)
- Why the contract or the owner cannot absorb it: the sheet and the card call `actions.answer`. The publisher's `answer` is `answerRequest` in `ChatConversation.tsx`. The inspector history row is `answerApproval` in `palette-actions/presets.ts`, which also notes the outcome the queue shows. W4 does not own the publisher, and a second call beside `answerRequest` would be a second path.
- Smallest change: point the room's `answer` at `answerApproval` (or have `answerRequest` record the same outcome), so a decision from the sheet is the row the inspector already shows for the palette.
- Status: open. Left at the W4 merge. `world.ctx.door.2` still requires the room's `answer` to be `answerRequest`. `answerApproval` writes the inspector history only after main accepts, and it looks up the palette's approval list, which the chat door does not hold. Calling both does not record the row: `answerRequest` marks the request answered first, so `answerApproval` returns. Folding `recordOrchEvent` into `answerRequest` would change every chat answer, not only the sheet. The publisher, the palette slice and `ChatConversation.tsx` are three owners.

### R-071 · A paste door for an agent terminal's reply
- Lane: W4
- File: `src/renderer/world/world-context-store.ts`, `src/renderer/world/useWorldContextPublisher.ts` (not W4's)
- Why the contract or the owner cannot absorb it: Reply for an agent terminal is paste, then an explicit submit. The room's door has `send` (`agentSession.send`) and no paste. A plain shell must stay closed with `answer in its terminal`. The sheet cannot tell an agent terminal from a plain shell, and it does not call `agentSession` itself (`world.door.1`).
- Smallest change: `pasteReply(agentId, text)` on `WorldActions`, implemented as the terminal's paste plus one submit, and a `agentTerminal(agentId)` the sheet can pass to `replyRoute`. Leave plain shells on the one reason.
- Status: open. Left at the W4 merge. `replyControl` stays closed until a paste door exists, which is the safe default. The publisher has no terminal handle, and an explicit submit after paste has to stay off a plain shell. That wiring goes through Canvas's registry, which this merge does not take.

### R-072 · world.open.6 still says bare Enter opens the panel
- Lane: W4
- File: `scripts/verify-world.cjs` (not W4's)
- Why the contract or the owner cannot absorb it: bare Enter on a picked robot now glides in (`engageFocus`). The panel open is ⌘Enter (`step-in`), through the same `door.open`. `world.open.6` still describes Enter as the open, and its regex only requires `door!.open(id)` somewhere in `WorldChrome.tsx`, which the step-in handler satisfies. W4 does not own the suite.
- Smallest change: retarget the check's sentence to ⌘Enter (`step-in`), and require `door!.open(id)` in that handler. Leave the pure `enterOpens` guard on the bare-Enter listener.
- Status: done: `59e80eba`. `world.open.6` names ⌘Enter (`step-in`) and requires `door!.open(id)` in that handler. The bare-Enter listener still asks `enterOpens` and calls `engageFocus`, and it does not call `open`.

### R-074 · Name the focus sheet in the plain-DOM sentence
- Lane: W4
- File: `src/renderer/CLAUDE.md` (not W4's)
- Why the contract or the owner cannot absorb it: the library-door table says `WorldChrome.tsx` and its children are plain DOM and import no three. `WorldFocusSheet.tsx` is a new child of that chrome, plain DOM, and the table does not name it. W4 does not own the doc.
- Smallest change: add `WorldFocusSheet.tsx` (M452, the close-up) to that plain-DOM sentence, beside `WorldCardBody.tsx`.
- Status: done: `59e80eba`. The three-door sentence names `WorldFocusSheet.tsx` (M452, the close-up) beside `WorldCardBody.tsx`. The sheet still imports no three.

### R-080 · Palette literal and V9_DOORS for View in World
- Lane: W6
- File: `src/renderer/palette/commands.ts`, `src/shared/verb-table.ts`
- Why the contract or the owner cannot absorb it: neither file is W6's. `closure.v9.1` reads `commands.ts` for a literal palette id and `verb-table.ts` for the agent line and the workflow door. The canvas gesture and the Sessions row already call `viewInWorld` / `stageWorldDoor`. The palette action body is `worldViewPaletteRow` in `palette-actions/objects.ts`. Adding the verb only in `verb-table.ts` would turn `closure.v9.1` red until the literal lands, so this lane does not add the row there.
- Smallest change: in `buildCommands`, a literal `id: 'world.view'` whose run is `worldViewPaletteRow` (title View in World). A `V9_DOORS` key with palette `world.view`, the canvas gesture the ⋯ menu and Sessions “Show in World”, the agent line, and a workflow action node with the same line.
- Status: done: `d024f9e2`. `commands.ts` spells `id: 'world.view'` and calls `viewInWorld`. The verb `view-in-world` is in `VERBS` and `V9_DOORS`, and the executor runs the same `worldViewPaletteRow`. `commands.ts` does not import the world modules. `closure.v9.1` stays green.

### R-081 · RequestBlock says Open, the flat door says Open in Canvas
- Lane: W6
- File: `src/renderer/world/WorldCardBody.tsx` (W4 this wave)
- Why the contract or the owner cannot absorb it: W4 owns the file. A waiting tile uses RequestBlock, whose open button says Open. The redesign word, already on the flat room's own picked-tile button, is Open in Canvas.
- Smallest change: the open button text becomes Open in Canvas. Keep `data-world-answer="open"`. Do not add a second wording.
- Status: done: `ab85b75f` on `rd/w4-focus`. RequestBlock's open button reads Open in Canvas. `data-world-answer="open"` is unchanged. W4 landed this before the W6 merge; the W6 copy of the request said open.

### R-082 · The WebGL probe cannot see a context that does not present
- Lane: W6
- File: `src/renderer/webgl-probe.ts` (shared with Orchestrate; this lane does not edit it)
- Why the contract or the owner cannot absorb it: `webglAvailable` is getContext webgl2 or webgl, then `WEBGL_lose_context`. On this xvfb host getContext succeeds (SwiftShader) and the world canvas reads back `[0, 0, 0, 0]` (R-053). A presenting check would be a clear and a readPixels of a known colour. That would change the answer for every caller, including Orchestrate. This lane forces the flat room in the shot by stubbing getContext, and leaves the probe as it is.
- Smallest change: none in this lane. Report only.
- Status: open

### R-083 · The flat room cannot import the attention line
- Lane: W6
- File: `src/renderer/canvas/command-pill.ts` (not W6's), or a module the world is allowed to import
- Why the contract or the owner cannot absorb it: `world.ctx.door.1` refuses a world file importing `@renderer/canvas/`. `attentionPillLine` and `useAttentionCensus` live there. The flat room quotes the mounted pill's `aria-label` (`[data-pill-state="attention"]`) because the canvas stays mounted under the room. That is the same sentence only while the pill is in the document and in its attention rest. The room's own requests count stays on `WorldChrome`.
- Smallest change: publish the attention line from a module the world may import, and have the flat room read that. Do not give the world a second queue.
- Status: done: `d024f9e2`. `attentionPillLine` stays in `command-pill.ts`. The pill publishes that sentence through `src/shared/attention-line.ts`, and `WorldFlat` reads it. The room does not import `@renderer/canvas/`, and it does not keep a second queue. Empty is silence.

### R-090 · The pill publishes the attention queue the room steps
- Lane: W5
- File: `src/renderer/canvas/CommandPill.tsx`
- Why the contract or the owner cannot absorb it: World ⌘J steps `publishFlightQueue` with `attentionStep` (the same rule as `nextAttentionId`). `world.ctx.door.1` forbids a world file importing `@renderer/canvas/`, so the room cannot call `useAttentionQueue` itself. Until the pill writes the queue it already built, a live room's strip is empty and ⌘J does nothing. The shot publishes its own three items.
- Smallest change: in `CommandPill`, next to `publishAttentionLine`,

```tsx
useLayoutEffect(() => {
  publishFlightQueue(queue.map((item) => ({ panelId: item.panelId, kind: item.kind, label: item.sentence })))
}, [queue])
```

`publishFlightQueue` is from `src/renderer/world/world-flight.ts`. It does not import three. Do not sort. Do not build a second census.
- Status: open

### R-091 · The 2D jump and the world jump share one cursor
- Lane: W5
- File: `src/renderer/canvas/Canvas.tsx` (`jumpAttentionImplRef`)
- Why the contract or the owner cannot absorb it: each press uses `attentionStep` / `nextAttentionId`, and `rd-w5.walk.1` pins those two equal. The cursors are still two. While the world is up, `shouldIgnoreKeys` is true because the canvas is covered, so the same press is not handled twice. A jump on the canvas, then a jump in the world, starts the world from a null cursor and picks the first id again.
- Smallest change: read and write `attentionCursor` / `setAttentionCursor` from `world-flight.ts` inside `jumpAttentionImplRef`, and step with that cursor. Do not edit `attention-queue.ts` or `shortcuts.ts`.
- Status: open

### R-092 · Name the queue strip in the plain-DOM sentence
- Lane: W5
- File: `src/renderer/CLAUDE.md`
- Why the contract or the owner cannot absorb it: `WorldQueueStrip.tsx` is plain DOM and imports no three. The library table's plain-DOM sentence names `WorldChrome` and `WorldFocusSheet` and does not name the strip. W5 does not own `CLAUDE.md`.
- Smallest change: name `WorldQueueStrip.tsx` (M453, the queue strip) beside `WorldFocusSheet.tsx` in that sentence.
- Status: open

### R-093 · The room's ten-minute snooze is not the inbox snooze
- Lane: W5
- File: `src/renderer/shell/decision-inbox.ts`, `src/renderer/canvas/Canvas.tsx`
- Why the contract or the owner cannot absorb it: Snooze 10m on the shell card calls `snoozePanel` in `world-flight.ts`, which hides that id from the world's walk only. The 2D jump still uses `jumpOrder` and the inbox. Ten minutes is not one of `SNOOZE_CHOICES`. Wiring the button to the inbox would edit the inbox and the jump, which this lane does not own.
- Smallest change: one snooze store the inbox already has, and have `snoozePanel` write that. Leave the world's filter as a reader of it.
- Status: open

### R-094 · Live Approve has no review discard offer
- Lane: W5
- File: `src/renderer/world/useWorldContextPublisher.ts` (not W5's) and the review model
- Why the contract or the owner cannot absorb it: D9 puts Undo on the toast only when `discardReady` (root, baseline, subject, and at least one path). The sheet's Approve calls `actions.answer` and then `emitApproved` with `discard: null`, because the room does not hold those fields. The live toast is therefore View diff. The shot passes a discard offer so mockup 13's Undo is visible, and `rd-w5.undo.1` pins both arms. Inventing a discard from the question text would offer Undo for a change review discard cannot revert.
- Smallest change: when the publisher answers an approval, attach that panel's review discard offer if it is ready, and pass it to `emitApproved`. Do not add a hold. Do not call `review.discard` from the world.
- Status: open
