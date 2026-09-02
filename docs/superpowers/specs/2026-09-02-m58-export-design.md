# M58 — Export

**Status:** designed 2026-09-02. Backlog #39, narrowed by the scope decision
(§2, "M48 Export" row): a panel's output as text (from the log, scrubbed)
and the canvas as a PNG (main-side `capturePage`), each through a save
dialog; the diagnostics bundle is already scrubbed by the same module.

## What this milestone is for

Every path out of the app today is a manual selection and `Cmd+C` from one
panel. Work has to leave. Two doors, both main's: the text of what a panel
printed, and a picture of the canvas. Nothing else from #39 — no
canvas-native artifact, no region capture, no promotion of cards to make a
picture prettier.

## Shape

### Text: from the durable log, stripped and scrubbed, capped by the log

`export:panel-text` (invoke, panelId). Main reads the panel's WHOLE
scrollback file (`ScrollbackLog.readAll`, new — `tail` reads a 64KB window
and would truncate silently), strips ANSI with `shared/ansi.ts`, scrubs
with `shared/redact.ts` (the same module the diagnostics bundle uses),
asks for a path with a save dialog, and writes. The result says what
happened, in five arms: `written` (path, lines, `redacted` count — the
user is told how many secrets were replaced, because a file that quietly
differs from the screen is the failure #31 is about), `cancelled`,
`empty` (no log for that panel), `off` (`scrollback.persist` is off — the
xterm buffer is NOT used as a fallback: that would be a truncation the
user cannot see), `failed` (reason). The export is bounded by the log's
own cap, which is stated in the palette row's subtitle.

### Picture: main composites the frame

`export:canvas-png` (invoke). `webContents.capturePage()` on the window,
which composites the real frame — a DOM-to-image capture renders every
WebGL terminal blank, the "looks implemented, produces blank rectangles"
failure #39 names. Save dialog, PNG bytes written. Arms: `written` (path),
`cancelled`, `failed`. What is captured is what the canvas IS: cards stay
cards.

### The module, drivable under plain node

`main/export.ts`: `createExporters({ log, persistOn, askPath, capture,
write, now })`. The dialog and the capture are injected functions, so the
whole thing — the stripping, the scrubbing, the arms, the cancel path
writing nothing — runs in `verify:file` against a scratch log with a fake
dialog. The write is temp-and-rename like every other file this app writes.

### Palette

`Export panel output…` in the Panels section on the focused terminal
(reasons: no focus, not a terminal, "durable scrollback is off"); `Export
canvas as PNG…` in the Canvas section. Both row subtitles name the cap.

## What it must not break

- `verify:ipc` moves to 65; both diagrams gain `export:panel-text /
  export:canvas-png`.
- `registerIpcHandlers` gains one trailing `exporters` parameter with an
  inert default (every arm `failed: 'export is not wired'`).

## Verification

- `verify:file export.1` text: a scratch log with ANSI and a token → the
  written file is stripped and scrubbed, `lines` and `redacted` reported;
  `export.2` cancel writes nothing; `export.3` no log → `empty`, persist
  off → `off` and reads nothing; `export.4` PNG: the capture's bytes are
  what is written, cancel writes nothing.
- `verify:palette export.1` the two rows, with the three reasons.
- `verify:panels export.1` the palette row on a live panel writes a file
  containing a sentinel the panel printed, through a harness-injected path.
