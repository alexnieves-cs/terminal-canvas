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
- Status: open

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
