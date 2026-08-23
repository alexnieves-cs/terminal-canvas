# Terminal Canvas

An infinite-canvas workspace for macOS where every node is a live terminal panel
running a coding-agent CLI (`claude`, `codex`, or any shell command).
Think Figma, but the objects are terminals.

## Stack

- **Electron + TypeScript + React + Vite** (via `electron-vite`)
- **node-pty** for PTYs — owned exclusively by the main process
- **xterm.js** (+ fit & WebGL addons) for rendering
- **electron-builder** for the `.app` (M5)

Electron rather than Tauri: `node-pty` + `xterm` is the only mature PTY path.
Tauri would mean `portable-pty` and hand-rolled plumbing.

## Prerequisites

- macOS, Node 20+, Xcode Command Line Tools (`node-pty` builds natively)
- `tmux` — required from M4 for session persistence: `brew install tmux`

## Getting started

```sh
npm install       # postinstall runs electron-rebuild for node-pty
npm run dev
npm run typecheck
npm run verify       # every check below
npm run verify:pty           # node-pty behaviour, under Electron's ABI
npm run verify:pty-manager   # the real PtyManager: session lifecycle, batching
npm run verify:window        # renderer teardown reaches the PTY layer
npm run verify:ipc           # every contract channel has a handler
```

`node-pty` is a native module built for Electron's ABI, so the checks run under
the Electron binary rather than plain `node`. They need no display: the two
that require a real Electron runtime open a window with `show: false`.

### If `npm run dev` misbehaves

**`Error: Electron uninstall`** — the `electron` package installed but its binary
download did not run. Fix: `node node_modules/electron/install.js`.

**`TypeError: Cannot read properties of undefined (reading 'whenReady')`** — you
are in a shell that exports `ELECTRON_RUN_AS_NODE=1`, which VS Code's extension
host does. That flag makes the Electron binary boot as plain Node, so
`require('electron')` has no `app`. The `dev` and `start` scripts already
`unset` it; you will only see this if you invoke `electron-vite` directly.

## Architecture

The main process owns every PTY; the renderer never spawns a process.

```
renderer  --invoke-->  pty:create / pty:write / pty:resize / pty:kill  -->  main
                       pty:list
renderer  <--send---   pty:data (batched ~16ms) / pty:exit             <--  main
```

`src/shared/ipc-contract.ts` is the single source of truth for that surface and
is imported by all three processes.

### Three things that are non-obvious

**Login-shell PATH.** macOS GUI apps are launched by launchd, so they inherit a
bare PATH and none of your dotfile exports — `claude` and `codex` work in
Terminal but come back "command not found" in the app. `src/main/shell-env.ts`
resolves the real environment once at startup via `$SHELL -ilc env` and uses it
for every PTY.

**Output batching.** `pty:data` is flushed on a ~16ms timer rather than per
read. An agent TUI repainting its frame emits thousands of reads per second;
unbatched, that floods the renderer's event loop and the UI locks up. Measured
on 16.4 MB of `find` output: 33,198 PTY reads collapse to 105 IPC messages, a
316x reduction.

**Sessions die with their renderer.** Cmd+R and Cmd+W destroy the page without
running React cleanup, so the renderer never sends `pty:kill`. Left alone, the
old PTY survives and the next `pty:create` throws "already has a live PTY" — a
dead panel with no recovery short of quitting. `src/main/window-lifecycle.ts`
kills a window's sessions on navigation or close. Surviving a reload instead of
dying is M4's job, once tmux backs the session; `pty:list` is the channel a
fresh renderer will reconcile against.

## Milestones

| | Scope | Status |
|---|---|---|
| M1 | Electron shell, one hardcoded xterm panel on a real PTY | ✅ reviewed |
| M2 | Infinite canvas: pan/zoom, dumb rectangles, coordinate math | |
| M3 | Merge M1+M2: real terminals as panels, LOD + viewport culling | |
| M4 | Multi-panel: spawn/close/drag/resize, persistence, tmux backing | |
| M5 | Presets, command palette, electron-builder packaging | |
