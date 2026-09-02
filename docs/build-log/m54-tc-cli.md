# M54 — `tc`: a CLI and a URL scheme

**Status:** finished 2026-09-02.
**Branch:** `m54-tc-cli`. **Spec:** `docs/superpowers/specs/2026-09-02-m54-tc-cli-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m54-tc-cli.md`. Backlog #57.

One line: a Unix socket main owns and a `terminal-canvas://` scheme, both parsed by one
module into one request and handled by one handler; a `tc` launcher main writes and puts on
every panel's PATH; no new IPC channel.

## What landed

- `main/control-protocol.ts` (pure): `parseControlLine`, `parseControlUrl`, `resolveOpen`;
  `command` refused in the shared parser.
- `main/control-server.ts`: Unix socket, stale file unlinked, 0600, one JSON line in, one
  out, malformed answered and survived.
- `main/control-handler.ts`: `open` / `list` / `focus` / `ping` over injected verbs; used by
  `index.ts` and the panels harness alike.
- `src/cli/tc.ts` (pure, exit 0/1/2) + `tc-main.ts`, bundled as a second main entry to
  `out/main/tc.js`, unpacked from the asar; `main/launcher.ts` writes `userData/bin/tc`.
- `PtyManager`: `RunsDeps.control` → `TC_CONTROL_SOCKET` and the bin dir first on PATH in
  every spawn.
- `index.ts`: listen after the lock, `open-url` at module scope, launcher write,
  `setAsDefaultProtocolClient` only when packaged, env report `control`; the Environment
  scope gains a `tc` row; builder config gains `protocols` and the unpack pattern.
- New suite `verify:control` (7); `verify:package protocol.1`, `cli.1`;
  `verify:pty-manager control.1`; `verify:panels control.1` (red by `FAULT_NO_SPAWN`, the
  handler answering ok while the canvas did not grow).

## Snags

- A first draft listed sessions with a `status` field the manager's rows do not have; the
  panels run showed `"status":"undefined"` in the reply and the row type was corrected to
  `pid`.

## Not proven

- `open-url` on a REAL packaged build with a real link click, and `setAsDefaultProtocolClient`
  registering the scheme with Launch Services: manual-only, like every packaged-app fact.
- The launcher under a packaged app (the `app.asar.unpacked` path): the smoke here ran the
  dev binary over `out/main/tc.js` (exit 2 with no app, exit 1 on usage).
