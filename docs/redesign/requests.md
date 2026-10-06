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

### R-001 · Record D1 in product-rules.md
- Lane: F1
- File: docs/product-rules.md
- Why the contract or the owner cannot absorb it: D1 says the selection rule changes in this file in the same commit as the pixels. The file is not in F1's ownership list. The material bullet on disk still describes the pre-F1 split ("cyan accent" without saying cyan is also working, and without the lighter selection ring).
- Smallest change: In the material bullet, add that cyan is both the working state and the accent; selection is a 2px ring and a 6px halo in `--state-select` (`#A6F6FF` on dark), lighter than working, so a selected working panel is two facts; the M63 rule "selection is cyan; work is blue" ends; idle is slate and green means finished OK.
- Status: open

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
- Status: open

### R-004 · The terminal cursor is still the old iris
- Lane: F1
- File: src/renderer/terminal/themes.ts
- Why the contract or the owner cannot absorb it: the dark cursor is `#5ec4d4` and the light cursor is `#2f6bd8`. F1 does not own this file. `--well` stays `#0a0c10` on purpose so the slot matches this file's dark `background` (product-rules: `--well` stays the xterm background).
- Smallest change: dark `cursor` from `#5ec4d4` to `#5BE1E6`. Light `cursor` from `#2f6bd8` to `#348184`. Leave every ANSI entry, including the light `blue` that shares the old cursor hex — the file's own comment says those sixteen are the agent's palette. Do not change `background`.
- Status: open

### R-005 · Wire useAttentionQueue into the pill, the dock and the Sessions count
- Lane: F2
- File: `src/renderer/canvas/CommandPill.tsx`, `src/renderer/shell/Dock.tsx`, `src/renderer/canvas/Canvas.tsx` (the `attentionCount` prop), `src/renderer/sessions/SessionsHost.tsx` (F3 adds the host; L-D lands the count)
- Why the contract or the owner cannot absorb it: F2 owns the queue and the hook, and not those files. The pill and the dock still take a count computed beside the hook (`reachableQueue(...).length` in Canvas, `attention.filter(...).length` in the dock). A second count is the drift the queue exists to stop.
- Smallest change: import `useAttentionQueue` and use `items.length`. Delete the local waiting count. Canvas stops passing its own `attentionCount` when the hotspot owner next touches it.
- Status: open
- Filed on the F2 branch as R-001, before F1's list was on main.

### R-006 · Export a canvas-wide live-session subscription
- Lane: F2
- File: `src/renderer/session/live-session-store.ts`
- Why the contract or the owner cannot absorb it: the store notifies per panel id. `useAttentionQueue` cannot call `useLiveSession` in a loop whose length is the census. It already reads `getLiveSession` when an agent transition or an approval re-renders it, and it will call `subscribeLiveSessions` the moment that export exists.
- Smallest change: export `subscribeLiveSessions(listener: () => void): () => void` that fires when any panel's cwd or command changes.
- Status: open
- Filed on the F2 branch as R-002, before F1's list was on main.
