# M43 — Attention beyond the window

**Status:** designed 2026-09-01.
**Backlog entries:** #17 (the OS notification and the dock badge M6d left),
#37 (sound, the bell half).

## What this milestone is for

M6d built every in-window surface for "an agent needs you": the border, the
edge pips, `Cmd+J`, the rail's Attention section. All of them require
looking at the canvas, and the actual situation is that the user went to do
something else precisely because the agent was going to take four minutes.
Nothing today works when this window is behind another one, and one thing
is wrong even inside it: after `Cmd+R` every waiting count reads zero until
the next real transition, because `agent:state` is sent only on a change
and nothing re-emits a snapshot to a fresh renderer. Pips made that
invisible; a badge would make it a number that is wrong.

## Decisions

1. **Main owns `wants-you` and keeps owning it; every new surface is a
   READER.** The detectors live in `PtyManager`; a new `attention()` method
   returns the ids in `wants-you`, and `applyEvent` calls one injected
   `AttentionSink` when the set of waiting ids CHANGES. Nothing here clears
   the state: focus (`agent:acknowledge`) and a `pty:write` remain the only
   two clearers, so a notification click that framed a panel would still
   leave it amber until the user clicks into it — the same "an arrow you can
   trust" rule `Cmd+J` records.
2. **The dock badge is main's count, set on every change.** `app.dock.
   setBadge(String(n))`, or `''` at zero. Derived in main from main's own
   detectors — never a renderer-side derivation of a number
   `rail-sections.ts`'s `waitingCount` already holds, which would be a
   second author of a fact main owns.
3. **An OS notification, only when the window is not focused, and it
   frames without acknowledging.** On a panel entering `wants-you` while
   `mainWindow.isFocused()` is false, main posts one `Notification` titled
   with the panel's label (the same honest chain the rail walks — main has
   `spec`/status only, so `title ?? command`) and a body naming the count.
   Its click focuses the window and sends the existing `attention:jump`-shaped
   request to frame that panel — through `goToPanel`'s never-wake path,
   like `Cmd+J`. It does not acknowledge; see 1.
4. **A sound, off by default, with no asset.** `shell.beep()` — the system
   alert sound — on the same transition, when `attention.sound` is on. It
   needs no bundled file, respects the user's own alert volume and choice
   of sound, and works when the window is behind another app, which is the
   one case the whole entry is about. Per-panel attribution rides the
   surfaces that already exist: the sound says WHEN, the pip and the badge
   say WHICH.
5. **A snapshot on every `did-finish-load`.** Main re-sends the current
   `agent:state` for every session to the fresh renderer, after the default
   preset push. This is the channel M6d declined twice and the badge is the
   customer that changes the answer: a renderer that reads zero after
   `Cmd+R` while the dock says 3 is a canvas that disagrees with its own
   icon. No new channel — it is the existing event, sent once more.
6. **Three settings, one category:** `attention.notify` (on),
   `attention.sound` (off), and the existing `agent.edgeIndicators` moves
   nowhere. The notifier, the badge and the beep are injected into
   `PtyManager` (`AttentionSink`), so `verify:pty-manager` drives a real
   bell through a fake window-focus answer and counts calls; the real
   `Notification`, `app.dock` and `shell.beep` are wired in `main/index.ts`
   and confirmed once by hand — they join the manual-only list, named.

## What it must not break

- **`registry.version()` carries nothing new**; the renderer changes only by
  receiving one more `agent:state` per session at load.
- **`agent:acknowledge` stays the renderer's one acknowledgement**; nothing
  main does clears a state.
- **`verify:ipc`'s count is unmoved** (no new invoke; the snapshot is an
  event).

## Verification

- `verify:pty-manager` `attention.1–.4`: a bell on an unfocused window calls
  the notifier once with the panel's label and sets the badge to `1`; the
  same bell on a focused window sets the badge and calls no notifier; the
  beep is called only when its setting answers true; acknowledge clears the
  badge to `''`; `resendStates()` sends one `agent:state` per live session.
- `verify:layout` `attention.1`: the two settings, their defaults.
- `verify:panels` `attention.1`: after a bell, `wc.reload()`, the rail's
  Attention row for that panel is present WITHOUT a second bell.
