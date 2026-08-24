# M4c: tmux-Backed Sessions — Design

**Status:** approved, not yet implemented
**Predecessor:** `2026-08-24-m4b-layout-persistence-design.md`

## Goal

Make a running agent survive the renderer. `Cmd+R`, `Cmd+W`, and a renderer
crash currently destroy every process on the canvas, and `window-lifecycle.ts`
exists to make that destruction *orderly* rather than to prevent it — its own
comment says so: "Surviving a reload instead of dying is M4's job, once tmux
backs the session and there is something worth reattaching to." This is that
milestone.

M4b made the *canvas* durable. M4c makes the *processes on it* durable for the
lifetime of the app run.

## Scope

In:

- A private tmux server (`-L terminal-canvas`) owning one session per panel.
- Reattachment after renderer teardown: `Cmd+R` lands back in the running agent.
- `pty:list` reporting live tmux sessions rather than main's in-memory map.
- Boot reconciliation: a panel with a live session restores non-dormant.
- Exit-code fidelity preserved across the tmux client.
- A loud fallback to today's direct `node-pty` spawn when tmux is unusable.
- One new contract channel, `session:backend`, so the renderer can say so.

Out, and deliberately so:

- **Surviving a quit.** `before-quit` still tears everything down. Agents never
  outlive the app, so this milestone raises no question about processes burning
  tokens behind a closed window, and no question about what happens if the user
  never reopens it. Quit-survival is a separate decision with a real product
  cost, and it should be taken on its own merits rather than inherited from a
  reload fix.
- **Scrollback replay.** Reattaching repaints the visible screen and nothing
  more. Full-screen agent TUIs use the alternate screen and repaint entirely, so
  they come back looking untouched; a plain shell comes back with an empty
  scrollbar. History belongs to `docs/ideas-backlog.md` item 30 (durable
  scrollback), which the backlog already sequences as the thing item 16's search
  is really gated on — and which solves it for *dormant* panels too, not only
  reattached ones. A `capture-pane -p -e -S -<N>` replay is the obvious narrow
  version and is recorded here so it need not be rediscovered.
- **Multiple clients on one session.** tmux supports it and backlog items 4, 20
  and 40 all want it. M4c attaches exactly one client per session and takes no
  design position on the second.
- **Exposing tmux to the user.** No prefix key, no status line, no pane
  splitting, no tmux command surface. tmux is an implementation detail of "the
  process behind this panel", and a user who has never heard of it must not be
  able to tell.
- **Migration.** There is no persisted tmux state. A panel either has a live
  session on our socket or it does not.

## The central insight

`tmux new-session -A -s <id>` **attaches if the session exists and creates it
if it does not.** Create and reattach are therefore the same call, which means
`pty:create` keeps its exact current signature and semantics, and
`session-registry.ts` — the module that would otherwise have to learn a whole
new concept — needs no change at all.

The two halves fit together without either being bent. After a reload, main's
`sessions` map is empty because navigation killed the *clients*, while the tmux
*sessions* live on. So `pty:create` finds no conflict, hits the `-A` path, and
lands back inside the running agent. The `already has a live PTY` throw that
`window-lifecycle.ts` was written to prevent simply stops being reachable by
that route, without being removed — it still correctly guards a double create
within one renderer.

## The operation that becomes three

This is the most useful way to state what M4c changes. Today
`PtyManager.kill()` serves every teardown path, because under `node-pty` those
paths genuinely do mean the same thing. Under tmux they stop meaning the same
thing, and splitting the callers *is* the milestone.

| Trigger | Today | M4c |
|---|---|---|
| Renderer gone (`Cmd+R`, `Cmd+W`, crash) | `killAll()` — process dies | **`detachAll()`** — clients die, sessions live |
| User closes a panel (`registry.dispose(id)`) | `kill(id)` | **`kill(id)`** — `kill-session`, session dies |
| `app.on('before-quit')` | `killAll()` | **`shutdown()`** — `kill-server` on our socket |

`window-lifecycle.ts` and the quit handler currently call the *same function*.
Nothing about the renderer changes to accommodate this: the renderer still has
exactly two callers of `pty.kill` (`dispose` and `disposeAll`, per `CLAUDE.md`'s
"Two lifetimes, not one"), and both still mean "this panel is going away". The
divergence is entirely main-side, which is where it belongs — only main knows
the difference between a page that navigated and an app that is quitting.

## Architecture

### The seam

`src/main/session-backend.ts` (new). One interface, two implementations,
injected into `PtyManager` the same way `session-registry.ts` injects its bridge
and terminal factory, and for the same reason: so the decision is assertable
without a real runtime.

```ts
export interface SessionBackend {
  readonly kind: 'tmux' | 'direct'
  /** Why we are on this backend. Surfaced to the user when kind is 'direct'. */
  readonly reason: string
  spawn(spec: PanelSpec, command: string, cwd: string, env: Record<string, string>): pty.IPty
  /**
   * Live sessions from the backend's OWN view of the world, or null when it has
   * none independent of PtyManager's map. Only the tmux backend can know about
   * sessions the map has forgotten — that is the whole point of it — so
   * DirectBackend returns null and PtyManager falls back to listing its map,
   * which is exactly today's behaviour.
   */
  list(): PtyCreateResult[] | null
  /** The command's real exit code, or null when the backend cannot know it. */
  exitCodeFor(panelId: PanelId): number | null
  /** Destroy one session for good. */
  destroy(panelId: PanelId): void
  /** Tear down everything this backend owns. */
  shutdown(): void
}
```

`PtyManager` keeps everything it owns today — the `Map<PanelId, Session>`, the
16ms batcher, the resize economy, and the `sessions.get(id) === session`
eviction guard that stops a slow exit from unhooking a recreated panel. Its
diff is three lines:

- `create()` calls `backend.spawn(...)` instead of `pty.spawn(...)`.
- `onExit` reports `backend.exitCodeFor(panelId) ?? exitCode`.
- `list()` returns `backend.list() ?? <today's map walk>`.

Both `null`s in the interface mean the same thing and are worth reading
together: *this backend cannot know, so fall back to what the app did before
M4c.* That is what makes `DirectBackend` a genuine restoration of today's
behaviour rather than a second implementation of it.

`DirectBackend` is today's `pty.spawn` call moved verbatim. The fallback path is
therefore the code that is already proven, not a reimplementation of it —
`exitCodeFor` returns `null` and `destroy`/`shutdown` reduce to the existing
kill, so `?? exitCode` collapses to today's exact behaviour.

### What the tmux invocation is

Every flag is load-bearing. Each one gets a comment naming its reason, in the
house style, because each fails quietly if dropped.

```
tmux -L terminal-canvas -f <bundled.conf> \
     new-session -A -s <panelId> -x <cols> -y <rows> \
     -- <command> <args...>
```

- **`-L terminal-canvas`** — a private socket. The app never sees, lists,
  resizes, or kills the user's own tmux sessions, and `shutdown()` can safely
  `kill-server` because that server is exclusively ours. Without it, quitting
  the app would kill the user's real work.
- **`-f <bundled.conf>`** — the app's own config. A user's `~/.tmux.conf`
  (custom prefix, status line, plugins, mouse mode) must not reshape a panel.
  This is the same class of decision as `shell-env.ts` probing the login shell:
  take the user's environment where it is the point, refuse it where it is not.
- **`new-session -A -s <panelId>`** — create-or-attach. This single flag is the
  reload survival.
- **`-x <cols> -y <rows>`** — preserves "fit before spawn". Only meaningful at
  creation; on reattach the client negotiates its own size, which is correct,
  because the renderer has re-fitted by then anyway.
- **`--`** before the command, so a command starting with `-` is not eaten as a
  tmux flag.

`panelId` is safe to interpolate by construction: `ID_PATTERN` in
`shared/layout-schema.ts` restricts it to `[A-Za-z0-9_-]+`, and the comment
there records that this was chosen *for* M4c while it was still free rather
than a migration of everyone's saved file. This spec is that debt being called
in.

### The bundled config

```
set -g status off
set -g prefix None
set -g escape-time 0
set -g default-terminal "xterm-256color"
set -as terminal-features ",xterm-256color:RGB"
set -g remain-on-exit on
set-hook -g pane-died 'run-shell "echo #{pane_dead_status} > <exitDir>/#{session_name}.exit; tmux kill-session -t #{session_name}"'
```

- **`status off`** — the canvas draws its own panel chrome. A tmux status line
  would eat a row and look like a bug.
- **`prefix None`** — **critical.** `Ctrl+B` must reach the agent untouched.
  This is the same split the codebase already draws twice: `Cmd+C` is the app's
  and `Ctrl+C` is the PTY's (`main/menu.ts`), `Cmd+Z` is the app's and `Ctrl+Z`
  is the PTY's. A tmux prefix would be the first bare control key the app
  steals, and `useViewport.ts`'s "Cmd is required for every canvas shortcut"
  rule exists precisely because agent TUIs claim every bare key.
- **`default-terminal "xterm-256color"`** — matches what `pty-manager.ts`
  already passes as `name`, so `TERM` is unchanged from the agent's point of
  view.
- **`terminal-features ... :RGB`** — agent CLIs emit 24-bit colour, and tmux
  downsamples to 256 without this. The panel still *works*; it just looks
  subtly wrong, with no error anywhere.
- **`mouse` is deliberately left off** (its default). `mouse on` makes *tmux*
  capture mouse reporting instead of passing it to the application, which would
  silently defeat all of M4a's pointer-correction work from one process further
  down. This is the mirror image of the `:RGB` line: two config settings,
  opposite directions, both invisible when wrong.
- **`remain-on-exit on` + the `pane-died` hook** — see below.

### Exit-code fidelity

Verified against tmux 3.7c during design:

- The tmux **client's** exit code carries no information at all. An inner
  command exiting `0` and one exiting `42` both produce client exit `1`. A naive
  port would turn the renderer's `[process exited with code N]` message into
  `[process exited with code 1]`, always — a message that is *present, plausible
  and wrong*, which is the failure class this codebase's comments exist to
  prevent.
- `remain-on-exit on` makes `#{pane_dead}` `1` and `#{pane_dead_status}` the
  real code (`7` for a command exiting 7).

The hook recovers it without any new machinery:

```
echo #{pane_dead_status} > <exitDir>/#{session_name}.exit ; tmux kill-session -t #{session_name}
```

Those run sequentially in one shell, so **the file is on disk before the
session is killed**. Killing the session is what makes the client exit, which is
what fires `node-pty`'s `onExit` — the callback `PtyManager` *already* uses to
send `pty:exit`. Main therefore reads the file inside the handler it already
has. No filesystem watcher, no polling, no new IPC, no change to the exit path's
shape.

`exitDir` is a per-run directory under `app.getPath('userData')`, cleared at
startup and at `shutdown()`. `exitCodeFor` reads and unlinks; a missing file
yields `null`, which falls back to the client's code via `?? exitCode`.

**The accepted risk this creates:** with `remain-on-exit on`, the hook is what
ends the session. If it fails to fire, the pane stays dead-but-present, the
client stays attached, `onExit` never fires, and the panel hangs instead of
reporting an exit. That is why exit fidelity gets its own check in
`verify:pty-manager` rather than riding along on another — it is testing the
hook's existence as much as its value.

### Boot reconciliation

`pty:list` changes what it reads. Today it returns main's in-memory map, which
after a reload is empty because navigation killed the clients. It must ask the
backend instead: `tmux -L terminal-canvas list-sessions -F ...`. This is
strictly richer than today — `#{pane_pid}`, `#{pane_start_command}` and
`#{pane_current_path}` fill in `PtyCreateResult` more accurately than the map
does, because they describe the process rather than what was requested.

`list()` must **filter on `#{pane_dead}`**. Under `remain-on-exit on` a session
whose command has exited still exists until the hook kills it, so an unfiltered
list would report a finished process as live — and boot reconciliation would
then restore that panel non-dormant, attach a client to a corpse, and show the
user a panel that can never produce another byte. This is the one place the
`remain-on-exit` decision leaks outside the exit path.

The renderer's boot gains two lines and no new concepts:

```ts
const state = await window.canvas.layout.load()
const live = new Set((await window.canvas.pty.list()).map((r) => r.panelId))
// ...
registry.ensure(id, spec, { dormant: !live.has(id) })
```

**The rule this settles: dormancy is about spawning, not attaching.** A panel
with a live tmux session has nothing to spawn, so the dormancy rule does not
apply to it — it reattaches when tiering makes it live, exactly as an M3 panel
does, and `LIVE_BUDGET` keeps capping how many at once. A panel with no live
session still restores dormant exactly as M4b made it. The two states are
named by the question each answers:

- **dormant** — has no process yet; a click is what creates one.
- **reattachable** — has a process; it only needs a client.

This does *not* disturb `lod.ts`'s "dormancy outranks focus" rule, because a
reattachable panel is not dormant and never consults that precedence. The
`assignTiers` signature is unchanged.

**Orphans.** A tmux session with no matching panel — possible if a crash lands
between a spawn and M4b's coalesced layout save. M4c **kills them at boot and
logs loudly**. A session the user has no panel to reach is worse than no
session: it holds a process and a shell with no route to either. Adopting it
instead would need placement rules that belong to backlog item 25, and would
mint geometry the user never chose. This is a deliberate trade, not an
oversight.

### The probe and the fallback

Probe once at startup, alongside `resolveShellEnv()` and cached the same way:
run `tmux -V`, parse the version, require **>= 3.0**. `set-hook` and
`pane_dead_status` both predate it comfortably, and 3.0 is old enough to be
everywhere in practice. Absent, unparseable, too old, or a server that will not
start → `DirectBackend`, with a `console.warn` in the same voice `shell-env.ts`
uses for its own fallback ("logs loudly on purpose").

The renderer learns via one new channel on `ipc-contract.ts`:

```ts
SESSION_BACKEND: 'session:backend'   // -> { kind: 'tmux' | 'direct', reason: string }
```

Declaring it there means `verify:ipc`'s "every channel has a handler" check
covers it with no new test code.

The indicator lives in **`CanvasHud.tsx`** — a small, non-blocking chip reading
something like "no tmux — sessions end on reload". It is a *status*, not a
toggle, so backlog item 11's "anything a user can toggle goes in one organised
settings surface" rule does not claim it. It shows only when `kind` is
`'direct'`; on the tmux path the HUD is unchanged.

## Failure modes

| Failure | Behaviour |
|---|---|
| tmux absent / < 3.0 / server won't start | `DirectBackend`, warned in the console and shown in the HUD. Everything works; sessions just end on reload, as they do today. |
| `kill-server` fails at quit | Logged, quit proceeds. Never throw here — the same rule `layout-store.ts`'s `flushSync` follows, because an exception can wedge the quit before the window is allowed to close. |
| `pane-died` hook never fires | The panel hangs rather than reporting an exit. Explicitly covered by its own check; see Testing. |
| Exit file missing or unparseable | `exitCodeFor` returns `null`, `?? exitCode` falls back to the client's code. Degrades to a wrong-but-present number rather than a crash. |
| tmux session exists but the pane is dead | Treated as not-live by `list()`, so the panel restores dormant. |
| Orphan session at boot | Killed, logged. |
| `pty:create` on a panelId main already has | Still throws. `-A` removes the *reload* route to this error, not the double-create route. |

## Testing

New and changed checks, with the runtime chosen by what the module actually
needs — the same rule `CLAUDE.md` already applies.

**`verify:tmux` (new, plain node).** This imposes a design requirement: argv and
config construction must be **pure functions** (`buildTmuxArgs`,
`buildTmuxConf`, `parseTmuxVersion`, `chooseBackend`) separate from the spawn
call, exactly as `viewport.ts` and `layout-schema.ts` are separated from their
callers. Covers: flag construction including `--` placement and `-x`/`-y`;
socket name; exit-file path derivation; version parsing and the >= 3.0 gate;
backend selection given a probe result; and that the generated config contains
`prefix None`, `status off`, `:RGB`, and no `mouse on`.

This suite needs the same `@shared` esbuild alias the other plain-node bundles
gained in M4b.

**`verify:pty-manager` (Electron as node).** The real thing, against a real
tmux server on a throwaway socket: spawn through `TmuxBackend`; kill the client
and reattach to the same session; **exit-code fidelity** (a command exiting 7
surfaces as 7, not 1); `destroy(id)` ending the session; `shutdown()` killing
the server; and that `list()` reports sessions the in-memory map does not know
about.

**`verify:window` (real Electron).** The headline regression test: renderer
teardown **detaches** and the tmux session survives — the inverse of the
assertion that suite makes today. `CLAUDE.md` already names `verify:window` as
the suite that grows to cover main-side wiring.

**`verify:ipc`.** Covers `session:backend` automatically once it is declared.

**`verify:panels` (real Electron).** Boot reconcile: a panel with a live session
comes back non-dormant and attached, while a panel without one comes back
dormant — the two states asserted against each other in one check, since it is
their *distinction* that is new.

**Both backends run the lifecycle checks.** A loud fallback is only honest if
the fallback keeps working, so `DirectBackend` is not exempt.

Note for the implementer: `CLAUDE.md` records that `verify:pty` duplicates
`shell-env.ts` and `pty-manager.ts` behaviour by hand and must be mirrored when
either changes. M4c does not touch the probe or the batcher, so that duplication
should need no edit — confirm rather than assume.

## Files

New:

- `src/main/session-backend.ts` — the interface, `TmuxBackend`, `DirectBackend`,
  and the pure builders.
- `src/main/tmux-probe.ts` — version probe and backend selection. Separate from
  the backend for the same reason `shell-env.ts` is separate from
  `pty-manager.ts`: a cached startup probe is its own concern.
- The bundled config, **generated at startup, not shipped as a static file** —
  the `pane-died` hook embeds `exitDir`, which is a per-run path under
  `app.getPath('userData')` and therefore unknowable until the app is running.
  `buildTmuxConf(exitDir)` is the pure function; writing its output next to
  `exitDir` is the impure part.
- `scripts/verify-tmux.cjs` — the new plain-node suite.

Changed:

- `src/main/pty-manager.ts` — takes the backend; three lines as described.
- `src/main/window-lifecycle.ts` — detach, not kill. Its comment is rewritten:
  it currently describes M4c in the future tense.
- `src/main/index.ts` — probe at startup, wire the backend, `shutdown()` on
  `before-quit`, boot orphan reconciliation.
- `src/main/ipc.ts` — the `session:backend` handler.
- `src/shared/ipc-contract.ts` — the channel and its bridge type.
- `src/preload/index.ts` — expose it.
- `src/renderer/main.tsx` — `pty.list()` at boot, feeding `dormant`.
- `src/renderer/canvas/CanvasHud.tsx` — the direct-backend indicator.
- `package.json` — the `verify:tmux` script, added to `verify`.
- `README.md`, `CLAUDE.md` — the milestone table, and the invariants above.

Unchanged, and worth stating because it is the design's main claim:

- `src/renderer/session/session-registry.ts` — no change. `-A` makes create and
  reattach the same call, so the registry never learns reattachment exists.
- `src/renderer/canvas/lod.ts` — no change. Reattachable panels are not dormant,
  so the precedence rule is untouched.

## Success criteria

1. Start a long-running command in a panel, press `Cmd+R`, and land back in it
   with the process still running and still producing output.
2. `Cmd+W` then reopen — same.
3. Kill the renderer process outright — same.
4. Close a panel with the close button; its tmux session is gone from
   `tmux -L terminal-canvas ls`.
5. Quit the app; no tmux server remains on our socket, and the user's own tmux
   sessions on the default socket are untouched.
6. A command exiting 7 reports `[process exited with code 7]`, not 1.
7. `Ctrl+B` reaches the agent; no tmux status line is visible anywhere.
8. 24-bit colour output renders as 24-bit colour.
9. Mouse-reporting TUIs still respond to clicks at every zoom level (M4a's
   correction is not defeated by tmux).
10. With tmux uninstalled: the app opens, panels work, the HUD says sessions
    will not survive a reload, and a reload confirms it — no crash, no silence.
11. A relaunch (not a reload) still restores every panel dormant, spawning
    nothing, exactly as M4b specified.
