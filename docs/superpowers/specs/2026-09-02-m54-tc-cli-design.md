# M54 — `tc`: a CLI and a URL scheme

**Status:** designed 2026-09-02. Backlog #57, reinstated by the scope
amendment (§7): "Panel ids stay renderer-minted; the CLI asks the running
app over a local socket main owns, and the URL scheme is a second door onto
the same verb."

## What this milestone is for

The canvas is arranged by a human. After this milestone it is also drivable
from a shell, a script, a git hook, a launcher — and from an agent INSIDE a
panel, which makes the canvas something agents extend. Everything the verb
needs already lives in main (`templateOf`, a `PRESET_SPAWN` send,
`ptyManager.list()`, `ATTENTION_JUMP`); what is missing is a door.

## Shape

### One verb set, two doors, one handler

```
tc open [--preset <name|id>] [--cwd <dir>]     spawn a panel from a preset
tc list                                         the running sessions, as JSON
tc focus <panel-id>                             fly the camera to a panel
tc ping                                         is the app up
terminal-canvas://open?preset=claude&cwd=/path  the same `open`, from a URL
```

Both doors parse into ONE `ControlRequest` and reach ONE handler in main.
`open` takes a PRESET and a cwd and nothing else — **no `command`, at either
door.** A URL can arrive from a web page or another app; a socket client is
an agent running arbitrary commands anyway, but the two doors share a parser
on purpose, and a parser that accepted a command from the socket would be
one edit away from accepting it from the URL. The preset system already
answers "what to run"; the doors only answer "where, and which".

### The socket main owns

`userData/control.sock`, a Unix domain socket, created with mode `0600`
and unlinked before listen (a stale socket from a crashed instance would
otherwise refuse the bind). Only the instance holding the single-instance
lock listens — the losing instance quits and must never bind. Protocol: one
JSON request per connection, newline-terminated; one JSON reply; the server
closes. A malformed line is answered `{ ok: false, error }` and the server
goes on listening. No network, ever.

### The launcher main writes, and the env every panel gets

Main writes `userData/bin/tc` at startup, idempotently: a two-line shell
script that runs THIS Electron binary as node (`ELECTRON_RUN_AS_NODE=1`)
over the bundled `out/cli/tc.cjs`, so no separate node is needed. Every
spawned panel gets `TC_CONTROL_SOCKET=<socket path>` and `userData/bin`
PREPENDED to PATH — so an agent inside a panel can type `tc open` with
nothing installed. Outside the app, `tc` resolves the socket from
`TC_CONTROL_SOCKET`, then the packaged and dev default paths in that order.
The Environment scope (`⌘K`) gains two rows: the launcher's path (with a
"copy the PATH line" action) and the socket. Nothing writes outside
userData; a `/usr/local/bin` symlink is the user's own line.

### The URL scheme

`terminal-canvas://` is declared in the builder config (`protocols`) and,
at runtime, `app.on('open-url')` on darwin hands the URL to the same parser.
`app.setAsDefaultProtocolClient` is called only in the packaged build (the
dev binary would otherwise register `Electron` itself as the handler). The
URL never reaches the renderer: `will-navigate` and `setWindowOpenHandler`
stay as they are, and `open-url` is not a navigation.

### Refusals, each named

`open`: unknown preset; no presets and no default; cwd absent on disk (the
spawn would otherwise land in `$HOME` silently, the wrong-directory case
#57 calls worse than nothing); the window is gone (recreated first, then
the send). `focus`: unknown id. Every reply carries `ok` and, on refusal, an
`error` sentence. The CLI exits 0 on ok, 1 on a refusal, 2 when the app is
not running (`ECONNREFUSED`/`ENOENT`), and prints the reply as JSON so a
script can read it.

### Panel ids stay renderer-minted

`open` answers `{ ok: true }` meaning "the request reached the canvas" —
never an id, because main does not have one to give. `list` reads
`ptyManager.list()` (ids, cwd, command, status), which is the running
sessions and not the layout; a dormant card has no session and is not
listed, which the reply says in a `note`.

## What it must not break

- **No new IPC channel.** Both diagrams and `verify:ipc` stay at 63; the
  socket is main-internal and the renderer sees `PRESET_SPAWN` and
  `ATTENTION_JUMP` exactly as it does today.
- **The instance lock's losing branch** never listens or writes the
  launcher.
- **No renderer `process.env`**: the CLI is a main-side artifact.
- `verify:package` 1–10 unchanged; `protocols` is additive.

## Verification

- `verify:control` (new, plain node): `protocol.1` every verb parses and a
  `command` key is refused; `url.1` the URL door parses the same request
  and refuses a command; `open.1` resolution by name, by id, by default,
  and the three refusals with an injected `exists`; `server.1` a real Unix
  socket in a temp dir: mode 0600, a round trip, a malformed line answered
  and the server still up, a stale socket file unlinked; `cli.1` the CLI's
  exit codes and output through an injected connect.
- `verify:package protocol.1` the scheme is declared.
- `verify:pty-manager control.1` a spawned session's env carries the
  socket and the bin dir first on PATH.
- `verify:panels control.1` `open` over the real socket adds a panel to
  the canvas; `focus` moves the camera; a bad preset adds nothing.
