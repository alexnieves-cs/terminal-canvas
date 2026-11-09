# Developing Terminal Canvas

Building from source, the stack, and how verification works. Moved here from the README in M632; [CONTRIBUTING.md](../CONTRIBUTING.md) says what a change needs.

## Stack

- **Electron + TypeScript + React + Vite** (via `electron-vite`)
- **node-pty** for PTYs — owned exclusively by the main process
- **xterm.js** (+ fit & WebGL addons) for rendering
- **electron-builder** for the `.app` (M5)

Electron rather than Tauri: `node-pty` + `xterm` is the only mature PTY path.
Tauri would mean `portable-pty` and hand-rolled plumbing.


## Prerequisites

- macOS, Node 20+, Xcode Command Line Tools (`node-pty` builds natively)
- `tmux` 3.0+ — **optional**, and only for session persistence: `brew install tmux`.
  Without it the app runs exactly as it did before M4c, says why in the HUD, and
  panels' processes simply do not survive `Cmd+R` / `Cmd+W`.


## Getting started

```sh
npm install       # postinstall runs electron-rebuild for node-pty
npm run dev
npm run typecheck
npm run verify       # every check below
npm run verify:meta          # licensing, README structure and drift, plain node
npm run verify:pty           # node-pty behaviour, under Electron's ABI
npm run verify:pty-manager   # the real PtyManager: session lifecycle, batching
npm run verify:window        # renderer teardown reaches the PTY layer
npm run verify:ipc           # every contract channel has a handler
npm run verify:viewport      # canvas coordinate math + LOD tiering + drag/pointer math, plain node
npm run verify:registry      # session lifecycle against a fake bridge/terminal, plain node
npm run verify:layout        # on-disk layout format + the store that owns it, plain node
npm run verify:palette       # fuzzy match, palette filtering, command list, plain node
npm run verify:merged        # the merged view's lane placement + the marquee's math, plain node
npm run verify:rail          # the rail's three sections and the inspector's read model, plain node
npm run verify:review        # git argv, the review engine's result arms, plain node
npm run verify:usage         # transcript JSONL parsing, the price table, the per-panel accumulator, plain node
npm run verify:tmux          # tmux argv, config and version parsing, plain node
npm run verify:agent-state   # bell/OSC scanner + idle state machine, plain node
npm run verify:agent-session # the agent-session runtime over a fake process runner and recorded CLI streams, plain node
npm run verify:verbs         # the verb table, plans, the outward gate and the auto modes, plain node
npm run verify:styles        # the stylesheet's own token rules + measured contrast, plain node
npm run verify:credentials   # the credential store, its schema and its refusal path, plain node
npm run verify:jira          # Jira's injected HTTP adapter, ticket mapping and the two writes, plain node
npm run verify:subagent      # the subagent scanner and its watcher, against a fake fs, plain node
npm run verify:file          # the file panel's five-arm read and its directory watch, plain node
npm run verify:canvas        # real input into the built renderer
npm run verify:xterm         # an xterm Terminal survives its host being detached
npm run verify:panels        # LOD tiering, pointer correction, drag, resize, wheel, close, z-order
npm run package              # the unsigned .app and .dmg, into release/
npm run verify:package       # the packaging config, as a value, plain node
npm run verify:packaged      # packages for real and launches it — NOT in verify
npm run shot                 # after a build: 25 PNGs of the real renderer into out/shots — asserts NOTHING
```

`npm run shot` is the visual loop (M61): it seeds a fixture canvas — every panel kind, a
group, two workspaces, a bell, a search hit — and paints each surface to a PNG, with a
`manifest.json` naming what each picture is meant to show. It is not a verify suite on
purpose: nothing in it can go red, it is slow, and it opens real shells. Its output is
judged by eyes, yours and a fresh-context critic's. No milestone that changes a visible
surface is finished until someone has looked at it.

`node-pty` is a native module built for Electron's ABI, so the checks that touch it run under
the Electron binary rather than plain `node`. None need a display: the ones that require a
real Electron runtime open a window with `show: false`.

### If `npm run dev` misbehaves

**`Error: Electron uninstall`** — the `electron` package installed but its binary
download did not run. Fix: `node node_modules/electron/install.js`.

**`TypeError: Cannot read properties of undefined (reading 'whenReady')`** — you
are in a shell that exports `ELECTRON_RUN_AS_NODE=1`, which VS Code's extension
host does. That flag makes the Electron binary boot as plain Node, so
`require('electron')` has no `app`. The `dev` and `start` scripts already
`unset` it; you will only see this if you invoke `electron-vite` directly.


## Verification

There is no unit-test runner and no linter here. `npm run verify` is the entire
quality signal: it chains every suite, runs a typecheck and a build in the
middle, and exits non-zero on any failure.

The suites are tiered by cost. Anything with no native dependency, no DOM and no
`electron` import runs under plain `node` in seconds — canvas math, the session
registry, the on-disk layout format, the palette's matching and ranking, the
tmux argv builders, the bell/idle state machine, the git review engine. That
tier is large on purpose, and it is why several modules take their dependencies
as parameters rather than importing them: `layout-store.ts` takes filesystem
paths instead of calling `app.getPath`, `presets.ts` takes `which` instead of
importing the login-shell probe, `review-engine.ts` takes a git runner instead
of spawning one. Everything that genuinely needs `node-pty` runs under the
Electron binary as Node; everything that needs real input against real pixels
opens a hidden Electron window.

To see the current suite list and check counts:

```sh
npm run verify
```

Individual suites are listed in [`package.json`](../package.json) and described
check-by-check in [`CLAUDE.md`](../CLAUDE.md).
