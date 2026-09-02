# M40 — Broadcast input: implementation plan

Spec: `../specs/2026-09-01-m40-broadcast-input-design.md`. Three tasks; the
first is the only one with a red-first check because the other two are
covered by it.

## Task 1 — The end-to-end check (`verify:panels`)

`broadcast.1`: spawn two small panels through `PRESET_SPAWN`, select both
(a real click, then a real shift-click on their chromes — 144b's fixture
shape), arm the mode through the palette action (`__m4aPaletteActions`?
no such hook exists — arm it by opening the palette with `Cmd+K`, typing
"broadcast", and pressing Enter, the way a user does), type a sentinel with
a real `sendInputEvent` keystroke sequence into the FOCUSED one, and assert
BOTH panels' `pty:data` echoes carry it; then press the banner's Stop
control (`.link-banner__stop`, a real click) and assert a second sentinel
reaches ONE. RED: no Stop control exists, the click lands nowhere, and the
second sentinel reaches both.

## Task 2 — The Stop control and the chord

`Canvas.tsx`'s banner gains a `shellControl()` button calling
`paletteActions.toggleBroadcastInput`; `Cmd+Shift+I` in a small
`useBroadcastChord` beside `useDiagnostics` (same shape: `event.code`,
`shouldIgnoreKeys`, `preventDefault` before the repeat bail, no repeat
toggling). GREEN.

## Task 3 — Close

README "What it does" bullet for broadcast (it has none); the Keyboard table
row; backlog #21 already gone; `docs/load-bearing.md` short entry on the two
exits; build log; `npm run verify`; merge.
