# M43 — Attention beyond the window

**Status:** finished 2026-09-02.
**Branch:** `m43-attention`. **Spec:** `docs/superpowers/specs/2026-09-01-m43-attention-beyond-the-window-design.md`.

One line: the out-of-window half of "an agent needs you" — a dock badge, an OS notification,
and an optional beep, off M6d's own detectors.

## What landed

- Two settings (`attention.notify` on, `attention.sound` off) in the Agent state category.
- An injected `AttentionSink` on `PtyManager` (`notify/badge/beep/windowFocused/notifyEnabled/
  soundEnabled`), driven from `applyEvent` on a change of the waiting set: badge on every
  change; a notification only for a panel newly entering wants-you WHILE the window is
  unfocused; a beep on that transition when the sound setting is on. `attention()` returns the
  waiting ids. The whole decision path runs under plain node.
- The real surfaces in `main/index.ts`: `new Notification(...).show()` whose click focuses the
  window and sends the new `attention:jump` EVENT; `app.dock?.setBadge`; `shell.beep`;
  `mainWindow.isFocused()`. The renderer subscribes to `attention:jump` and frames the panel
  through `goToPanel` (never wakes).
- Checks: `verify:layout` attention.1 (the two settings), `verify:pty-manager` attention.1–.4
  (the sink's decisions and `resendStates`), `verify:panels` attention.1 (the notification-click
  jump path).

## Overruled in writing (decision 5, the snapshot)

The spec intended `resendStates()` on `did-finish-load` to restore the waiting count after a
`Cmd+R`. It cannot: `window-lifecycle.ts` runs `PtyManager.detachAll()` on reload, which empties
main's session map (and the wants-you detectors), so there is nothing to re-emit at
`did-finish-load` and the reattaching sessions get fresh `starting` detectors. `resendStates()`
is kept (cheap, correct shape) and called for fidelity, but it restores no attention across a
reload; a check would only pass because the harness does not wire `window-lifecycle`. See the
load-bearing entry and the spec's amended decision 5. Attention after a reload is governed by
the reattach path instead.

## Manual-only (named on the load-bearing list)

The real `Notification`, `app.dock.setBadge` and `shell.beep` are confirmed once by hand against
a real dock, notification and speaker — no suite reaches them (the sink is faked in
`verify:pty-manager`).
