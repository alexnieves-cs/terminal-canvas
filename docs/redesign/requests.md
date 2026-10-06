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

## Open

### R-001 · Canvas focus-task `from` must accept the new center pages
- Lane: F3
- File: `src/renderer/canvas/Canvas.tsx` (about line 4074, `openFocusTask`)
- Why the contract or the owner cannot absorb it: F3 owns `CenterView` and has to add `'sessions' | 'review'`. Canvas is L-B / L-C. The `from` field is `'canvas' | 'orchestration'`, and the ternary `centerViewNow === 'team' ? 'canvas' : centerViewNow` now includes the new pages, so `tsc -p tsconfig.web.json` fails on that assignment.
- Smallest change: treat sessions and review the way `team` is treated, so Back from a task still returns to canvas or Orchestrate.

```tsx
from: centerViewNow === 'focus'
  ? (cur?.from ?? 'canvas')
  : centerViewNow === 'team' || centerViewNow === 'sessions' || centerViewNow === 'review'
    ? 'canvas'
    : centerViewNow
```

- Status: open

### R-002 · `shouldIgnoreKeys` stands down while a panel is focus-locked
- Lane: F3
- File: `src/renderer/canvas/Canvas.tsx` (`shouldIgnoreKeys`, about line 1594)
- Why the contract or the owner cannot absorb it: the predicate lives on Canvas. F3's own listeners (`useKeyboardNav`, `useShellChrome`) already yield. `useViewport` and any other caller of `shouldIgnoreKeys` still `preventDefault` a canvas chord while locked, so ⌘N and ⌘J do not reach the terminal until this lands.
- Smallest change: compose `|| focusLocked()` from `@shared/shortcuts` into the `shouldIgnoreKeys` callback.
- Status: open

### R-003 · The palette yields ⌘K while focus is locked
- Lane: F3
- File: `src/renderer/palette/usePalette.ts` (the ⌘K handler, `event.code === 'KeyK'`)
- Why the contract or the owner cannot absorb it: L-C owns the palette. It `preventDefault`s ⌘K before the repeat bail. While a panel is focus-locked that key is the terminal's Clear (D4). A capture-phase stop would also stop the event reaching xterm, so the fix is an early return with no `preventDefault` when `focusLocked()` is true.
- Smallest change: at the top of the ⌘K branch, `if (focusLocked()) return`.
- Status: open

### R-004 · `shell.centerView` enum grows sessions and review
- Lane: F3
- File: `src/shared/settings-schema.ts` (`shell.centerView`, values `['canvas', 'orchestration']`)
- Why the contract or the owner cannot absorb it: L-E owns the schema. `layout-store` drops a value that is not in the enum, so choosing Sessions or Review does not survive a reload. The in-memory page still switches.
- Smallest change: add `'sessions'` and `'review'` to that setting's values.
- Status: open

### R-005 · Retarget ⌘0 / ⌘1 and bind ⌘⇧T from the registry
- Lane: F3
- File: `src/renderer/canvas/useViewport.ts`
- Why the contract or the owner cannot absorb it: L-C owns the file. The registry names ⌘0 as Fit all and ⌘1 as Work (D5). Today ⌘0 resets the viewport and ⌘1 fits all. F3 did not retarget them, because changing those chords would change behavior this lane was told to keep. ⌘⇧T (tidy) is registered and not bound; the menu still shows the one-release alias ⌘⌥T.
- Smallest change: when L-C rebinds, read `matchShortcut` / `electronAccelerator` and move the old meanings off those chords in the same change. Bind tidy to ⌘⇧T beside the alias.
- Status: open

### R-006 · Mount Sessions and Review from Canvas, and pass the session count
- Lane: F3
- File: `src/renderer/canvas/Canvas.tsx`
- Why the contract or the owner cannot absorb it: the hosts cannot be mounted from a file F3 does not own. TopBar portals `SessionsHost` / `ReviewHost` into `.shell` so choosing Sessions is not an empty fade (`canvas--behind-orch` with nothing in its place). That portal is a stand-in.
- Smallest change: render the two hosts next to the Orchestrate page (the `centerView === 'orchestration'` branch), delete the portal in TopBar, and pass `sessionCount` into TopBar from the panel list (terminal + chat). The bar's own 1s count is the fallback until then.
- Status: open

### R-007 · `dock.dup.1` still requires the Orchestrate segment to be painted
- Lane: F3
- File: `scripts/verify-panels-product.cjs` (`dock.dup.1`)
- Why the contract or the owner cannot absorb it: D2 removes Orchestrate from the tab. The segment stays in `.shell__center-toggle` so `dispatchEvent` clicks in `verify-panels-shell` and `shot.cjs` still land, and the F3 stylesheet clips it. `dock.dup.1` measures that segment with `elementFromPoint` and will go red on macOS.
- Smallest change: point the painted-door check at the View menu's Orchestrate row, or at `[data-sessions-orchestrate]`, instead of `[data-seg="orchestration"]`.
- Status: open

### R-008 · No `TC_FIXTURE=rd-steward` switch on the harness
- Lane: F3
- File: `scripts/shot.cjs` (and `npm run dev`)
- Why the contract or the owner cannot absorb it: F2 owns `scripts/fixtures/rd-steward/**`. The shot kit and dev entry have no fixture switch. F3's scenes call `loadMain()` and capture the live shell. They do not invent a second loader.
- Smallest change: one switch, `TC_FIXTURE=rd-steward`, that loads F2's fixture before `loadMain`, shared by `npm run dev` and `scripts/shot.cjs`.
- Status: open

### R-009 · Palette row still says "Open Orchestrate"
- Lane: F3
- File: `src/renderer/palette/commands.ts` (id `canvas.orchestration`)
- Why the contract or the owner cannot absorb it: L-C owns the palette. D2's door is "Show Orchestrate". The View menu row and the Sessions header use that title. The palette row was left as it is.
- Smallest change: rename the row's visible title to `Show Orchestrate`. Leave the command id.
- Status: open
