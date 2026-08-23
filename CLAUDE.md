# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Electron app for macOS: an infinite canvas where every node is a live terminal panel
running a coding-agent CLI. Currently at **M1** (one hardcoded panel, no canvas yet).
The milestone table in `README.md` is the roadmap contract — several modules are
deliberately shaped for a milestone that has not landed yet, and the code comments say so.
Don't "simplify" those away.

## Commands

```sh
npm run dev            # electron-vite dev (unsets ELECTRON_RUN_AS_NODE first)
npm run build          # typecheck + electron-vite build
npm run typecheck      # both projects; or typecheck:node / typecheck:web individually
npm run verify:pty     # headless PTY-layer test suite (see below)
```

There is no unit-test runner and no linter. `npm run typecheck` + `npm run verify:pty`
are the full verification story — run both before claiming work is done.

### verify:pty

`scripts/verify-pty.cjs` is the only automated test. It runs **under Electron's own binary
with `ELECTRON_RUN_AS_NODE=1`**, not plain `node` — `node-pty` is a native module compiled
against Electron's ABI by the `postinstall` `electron-rebuild`, so it will not load under
system Node. The suite covers everything about a panel except xterm's rendering: login-shell
PATH resolution, spawn/stdin/stdout, colour escapes, winsize at spawn, SIGWINCH on resize,
`claude`/`codex` resolving on the PTY PATH, and that the flush timer actually collapses IPC.
There is no test-name filter; it runs all 10 checks and exits non-zero on any failure.
To add a check, append an `ok(...)` assertion in the IIFE.

Note the script re-implements `shell-env.ts`'s probe and `pty-manager.ts`'s batching by hand
so it can test them without Electron's app lifecycle. If you change either module's
behaviour, mirror it there.

## Architecture

Three processes, one shared contract. **The main process owns every PTY; the renderer never
spawns a process.**

```
renderer --invoke--> pty:create / pty:write / pty:resize / pty:kill --> main
renderer <--send---  pty:data (batched ~16ms) / pty:exit            <-- main
main     --send-->   edit:copy / edit:paste                         --> renderer
```

- `src/shared/ipc-contract.ts` — single source of truth for channels and the
  `window.canvas` bridge type. Imported by all three processes; add a channel here first.
- `src/main/pty-manager.ts` — owns the `Map<PanelId, Session>`. All PTY lifecycle.
- `src/preload/index.ts` — `contextBridge` exposes `window.canvas`. Every `on*` subscribe
  returns its own unsubscribe so React effects can clean up without stacking listeners.
- `src/renderer/components/TerminalPanel.tsx` — one panel = one xterm + one PTY, wired in
  a single effect.
- `src/renderer/terminal/create-terminal.ts` — the only place a `Terminal` is constructed.
  Keep it that way: from M3 a panel swaps between a live terminal and a static preview and
  must not visibly change size when it does.

`@shared/*` and `@renderer/*` path aliases are declared in **both** `electron.vite.config.ts`
and the tsconfigs — adding one means editing both.

## Load-bearing details

Each of these exists because the naive version fails *silently*. Don't undo them.

**Login-shell PATH (`src/main/shell-env.ts`).** macOS GUI apps are launched by launchd, so
they inherit a bare PATH and no dotfile exports — `claude`/`codex` work in Terminal but are
"command not found" in the app. We probe `$SHELL -ilc env` once at startup (`-i` is what
makes zsh read `.zshrc`) and use that env for every PTY. A non-zero exit from the probe is
normal; success is judged by whether a `PATH` came back. The fallback logs loudly on purpose.

**Output batching (`pty-manager.ts`, `FLUSH_INTERVAL_MS = 16`).** One IPC message per PTY
read floods the renderer's event loop and locks the UI — an agent TUI repainting emits
thousands of reads/sec. Measured: 33,198 reads → 105 messages. The pending buffer is flushed
*before* `pty:exit` is announced, or the last lines (usually the error explaining the exit)
are dropped.

**Cmd+C / Cmd+V (`src/main/menu.ts`).** The stock `'copy'`/`'paste'` menu roles drive
`document.execCommand`, but xterm's selection under the WebGL renderer is not a DOM
selection — the role copies nothing or the wrong thing. We keep the accelerators but forward
to the renderer, which asks xterm directly. **Ctrl+C is deliberately untouched** and flows to
the PTY as SIGINT.

**No `StrictMode` (`src/renderer/main.tsx`).** Double-invoked effects would spawn a PTY, kill
it, and spawn it again on every mount. Intentional; leave it off while the PTY lifecycle is
still being proven.

**Fit before spawn (`TerminalPanel.tsx`).** `fitAddon.fit()` runs before `pty.create` and the
real `cols`/`rows` are passed in, so the shell's first `TIOCGWINSZ` is correct. Spawning at
80x24 and resizing after makes agent TUIs draw their frame twice and leave artifacts.

**`externalizeDepsPlugin` (`electron.vite.config.ts`).** Keeps `node-pty` out of the bundle
so its native `.node` binary is `require`d from `node_modules`. Anything with a native
binding belongs in `dependencies`, not `devDependencies`.

**Async-spawn teardown race.** `TerminalPanel`'s effect tracks a `disposed` flag; if cleanup
beats the awaited `pty.create`, it kills the process that just came back. Preserve this
pattern for any new async resource in a panel effect.

## Gotchas

- **`Cannot read properties of undefined (reading 'whenReady')`** — your shell exports
  `ELECTRON_RUN_AS_NODE=1` (VS Code's extension host does this), so the Electron binary boots
  as plain Node. `dev`/`start` already `unset` it; you only hit this invoking `electron-vite`
  directly.
- **`Error: Electron uninstall`** — the binary download didn't run:
  `node node_modules/electron/install.js`.
- The renderer has a strict CSP in `src/renderer/index.html` (`default-src 'self'`). No CDN
  scripts, no remote assets.
- `tsconfig.node.json` / `tsconfig.web.json` both set `noUnusedLocals` and
  `noUnusedParameters` — prefix intentionally-unused params with `_`.

## Conventions

- Commits: conventional format scoped by milestone, e.g. `feat(m1): ...`, `fix(m1): ...`.
- Comments in this codebase explain *why*, especially for the workarounds above. Match that
  density; a non-obvious line without a reason attached will be "fixed" by someone later.
