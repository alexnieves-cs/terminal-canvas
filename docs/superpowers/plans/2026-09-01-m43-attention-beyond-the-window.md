# M43 — Attention beyond the window: implementation plan

Spec: `../specs/2026-09-01-m43-attention-beyond-the-window-design.md`.
Four tasks, check-first.

## Task 1 — The settings (`verify:layout`)

Check `attention.1`: `attention.notify` (boolean, on) and
`attention.sound` (boolean, off), both in `AGENT_CATEGORY`. RED, then the
two `SettingDef`s.

## Task 2 — The sink (`verify:pty-manager`)

Checks `attention.1–.4` per the spec, with an injected `AttentionSink`
(`{ notify(panelId, label, count), badge(count), beep(), windowFocused(),
notifyEnabled(), soundEnabled() }`) recorded by the harness. RED. Then
`PtyManager`: `attention()` (ids in `wants-you`), the sink call in
`applyEvent` on a change of the waiting SET (entering and leaving),
`resendStates()`.

## Task 3 — The wiring (`main/index.ts`)

The real sink: `new Notification({ title, body }).show()` with a click
handler that focuses the window and sends the existing attention-jump
request to the renderer (the `Cmd+J` path — find its verb in
`useViewport`'s `onJumpAttention` and expose a `jumpTo(panelId)` over the
existing `agent:state`-adjacent event surface, or add ONE event
`attention:jump` to `IPC_EVENTS`, which does not move `verify:ipc`'s
count); `app.dock?.setBadge`; `shell.beep`; `mainWindow.isFocused()`.
`did-finish-load` calls `ptyManager.resendStates()` after
`pushDefaultPreset`. `npm run typecheck`.

## Task 4 — The snapshot, end to end (`verify:panels`)

Check `attention.1` per the spec. RED (the rail's Attention section reads
"nothing waiting" after a reload today). GREEN after Task 3. Then the
README ("who needs you" bullet), `docs/load-bearing.md` (main owns
`wants-you`; the snapshot is the badge's customer; the three real surfaces
are manual-only and NAMED in that list), backlog #17 and #37 → gone, suite
counts, build log, `npm run verify`, merge.
