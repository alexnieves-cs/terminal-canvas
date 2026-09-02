# M44 — A keyboard-first canvas, and the accessibility that comes with it

**Status:** finished 2026-09-02.
**Branch:** `m44-keyboard`. **Spec:** `docs/superpowers/specs/2026-09-01-m44-keyboard-first-canvas-design.md`.

One line: move between panels, step into one, and get back out — all Cmd-gated because the
terminal claims every bare key — plus the screen-reader names that come with it.

## What landed

- `spatial-order.ts` (pure): `nearestInDirection` (half-plane ahead, scored along + 2*perp) and
  `orderPanels` (on-screen by camera distance, then by focus recency). Bundled into verify:viewport.
- `registry.applyTerminalOptions` + `SessionHandle.configure`: one fan-out of xterm options
  across every session, live and detached, and inherited by sessions created later; configure
  defers terminal creation for a carded panel.
- `accessibility.screenReaderMode` (off) in a new Accessibility category, fanned out on the
  settings reload.
- `useKeyboardNav`: Cmd+Arrow traverses selection through goToPanel (never wakes), Cmd+Enter
  focuses+wakes, Cmd+Escape leaves the terminal (blur, release focus, focus the host). The host
  gains tabIndex, role=application, aria-label, aria-roledescription.
- Names: every panel is role=group with an honest aria-label; the Attention list is aria-live;
  panelRows are ordered through orderPanels.
- Checks: verify:viewport keyboard.1-.4, verify:registry keyboard.1, verify:layout keyboard.1,
  verify:palette keyboard.1, verify:panels keyboard.1-.4.

## Snag (a load-bearing lesson)

Making the host focusable (tabIndex) meant a background click now focuses it, so
`document.activeElement` is the host, not `<body>`. useSpaceHeld's space-pan arm tested
`activeElement === body` and broke (verify:panels 176). Fixed by treating the host
(role=application) as canvas focus; recorded in load-bearing so the next such guard knows.

## Folded in (M43 verifier notes)

- attention.4 strengthened to a two-session fixture with an exact per-session count.
- detachAll() now recomputes the waiting set, so a reload does not leave the dock badge stale.
