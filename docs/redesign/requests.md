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
- Status: open
- Lead note: left for L-C (M444). That lane owns `useViewport`, and its brief is the ⌘1/2/3 tier flights and ⌘0 fit-all. The registry already names Fit all and Work. Retargeting ⌘1 to Work now would call a flight that does not exist, and this request says the move happens when L-C rebinds, with ⌘⇧T bound from the registry in the same change. The menu still shows the tidy alias ⌘⌥T. `shortcuts.ts` is frozen and was not edited.
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

### R-016 · Menu accelerators read keyboard overrides
- Lane: L-E
- File: `src/main/menu.ts`
- Why the contract or the owner cannot absorb it: L-E owns the merge (`acceleratorFor` in `src/shared/shortcut-overrides.ts`) and the `keyboard.overrides` setting. The menu is F3's. It already rebuilds on `settings:changed` and calls `electronAccelerator`, which reads the frozen registry. A re-recorded chord persists and the Keyboard page shows it; the menu item keeps the registry accelerator, including tidy-alias `CmdOrCtrl+Alt+T`.
- Smallest change: build each accelerator with `acceleratorFor(id, parseOverrideList(stringList(options.settingValue('keyboard.overrides'))))` instead of `electronAccelerator(id)`. An empty list matches today's historical strings. `stringList` is `Array.isArray(value) ? value.filter(v => typeof v === 'string') : []`. Listeners (`useKeyboardNav`'s `matchShortcut`, the palette's hardcoded ⌘K) still match the registry; `matchEffective` is the same merge when those files are next touched. That hook returns before an Option chord, so swapping the call alone does not fire an override that adds ⌥.
- Status: open

### R-017 · Open Settings from the palette and the dock
- Lane: L-E
- File: `src/renderer/palette/commands.ts`, `src/renderer/canvas/Canvas.tsx` (`openSettingsScope`)
- Why the contract or the owner cannot absorb it: the row and the verb are `OPEN_SETTINGS_ROW` / `openSettingsPage` in `palette-actions/settings.ts`. The command list and the dock's Settings callback are other lanes. Nothing a person can click reaches the page. The shot calls `window.__tcOpenSettings`, which is the same function the row's `run` calls.
- Smallest change: add a command whose `run` imports `openSettingsPage` from `@renderer/settings/open` (a new `PaletteActions` key would re-partition the slices). Point the dock's `onSettings` at `openSettingsPage()`. Leave `Manage settings…` as the palette drill-in.
- Status: open
