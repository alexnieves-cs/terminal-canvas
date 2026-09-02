# M44 — A keyboard-first canvas: implementation plan

Spec: `../specs/2026-09-01-m44-keyboard-first-canvas-design.md`. Six tasks,
check-first.

## Task 1 — The pure geometry (`verify:viewport`)

Checks `keyboard.1–.4` per the spec against a five-panel fixture. RED (no
`spatial-order.ts`). Then `canvas/spatial-order.ts`: `nearestInDirection`
and `orderPanels`; `viewport-entry.cjs` gains the spread.

## Task 2 — The fan-out (`verify:registry`)

Check `keyboard.1` with the fake terminal factory recording
`configure()` calls. RED. Then `SessionHandle.configure`, the real
`session-factory.ts` (`Object.assign(term.options, partial)`), and
`registry.applyTerminalOptions` which also stores the current options for
sessions created later.

## Task 3 — The setting (`verify:layout`)

`accessibility.screenReaderMode`, off, in a new `ACCESSIBILITY_CATEGORY`.
RED then green. `Canvas.tsx` applies it on the settings reload the frame
already re-reads (the same signal `useShellChrome` watches).

## Task 4 — The chords (`verify:panels`)

Checks `keyboard.1–.3` per the spec. RED. Then `useKeyboardNav` (M28's
hook shape) beside `useDiagnostics`: `Cmd+Arrow` → `nearestInDirection` →
`selectAndRaise`; `Cmd+Enter` → `onSelectPanel` + `registry.focus`;
`Cmd+Escape` → blur, `setFocusedId(null)`, focus the host. The canvas host
gains `tabIndex={0}`.

## Task 5 — The names (`verify:panels`)

Check `keyboard.4`. RED. Then the roles and labels on the host, every panel
kind, the Attention list's `aria-live`, `aria-pressed` on the two region
toggles, and the palette's listbox semantics.

## Task 6 — Close

`orderPanels` wired into `panelRows` (`verify:palette` `keyboard.1` first);
README: the Keyboard table rows and a short Accessibility section stating
the terminal's limits; `docs/load-bearing.md` (traversal moves selection,
never focus; the fan-out is the shared mechanism; `Cmd+Escape` is the
boundary); backlog #32 and #63 → gone; suite counts; build log; `npm run
verify`; merge.
