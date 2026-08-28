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
- `tmux` 3.0+ — **optional**, and only for session persistence: `brew install tmux`.
  Without it the app runs exactly as it did before M4c, says why in the HUD, and
  panels' processes simply do not survive `Cmd+R` / `Cmd+W`.

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
npm run verify:viewport      # canvas coordinate math + LOD tiering + drag/pointer math, plain node
npm run verify:registry      # session lifecycle against a fake bridge/terminal, plain node
npm run verify:layout        # on-disk layout format + the store that owns it, plain node
npm run verify:palette       # fuzzy match, palette filtering, command list, plain node
npm run verify:rail          # the rail's rows and the inspector's read model, plain node
npm run verify:tmux          # tmux argv, config and version parsing, plain node
npm run verify:agent-state   # bell/OSC scanner + idle state machine, plain node
npm run verify:canvas        # real input into the built renderer
npm run verify:xterm         # an xterm Terminal survives its host being detached
npm run verify:panels        # LOD tiering, pointer correction, drag, resize, wheel, close, z-order
npm run package              # the unsigned .app and .dmg, into release/
npm run verify:package       # the packaging config, as a value, plain node
npm run verify:packaged      # packages for real and launches it — NOT in verify
```

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

## Architecture

The main process owns every PTY; the renderer never spawns a process.

```
renderer  --invoke-->  pty:create / pty:write / pty:resize / pty:kill  -->  main
                       pty:list / layout:load / layout:save
                       session:backend
                       preset:list / preset:rename / preset:delete
                       preset:set-default / preset:spawn-by-id
                       prompt:list / prompt:save / prompt:delete
                       settings:list / settings:set
                       canvas:request-reset
                       agent:acknowledge
renderer  <--send---   pty:data (batched ~16ms) / pty:exit             <--  main
                       agent:state
main      --send-->    edit:copy / edit:paste / edit:undo / edit:redo  -->  renderer
                       canvas:counts / canvas:reset
                       preset:spawn / preset:default / preset:capture
```

The last three invoke groups above — the preset mutations, the prompt library, and
`canvas:request-reset` — are the palette's nine new channels. They exist so the
palette runs code main already has rather than a renderer-side copy of it: only main
can resolve an absent `command` into the login shell, and only main owns the reset
confirmation dialog.

`canvas:counts` is the one event that runs the other way: main sends it and the renderer
replies on an ephemeral `canvas:counts:reply:<timestamp>` channel that is invented per call
and deliberately not part of the declared contract below.

`src/shared/ipc-contract.ts` is the single source of truth for that surface and
is imported by all three processes.

On the renderer side, a panel has two separate lifetimes. A **session** — the xterm
`Terminal` and the PTY behind it — is created once and disposed once, in a module-level
registry (`src/renderer/session/session-registry.ts`) that lives outside React. The React
**view** (`src/renderer/components/TerminalPanel.tsx`) is mounted and unmounted freely as
panels scroll on and off screen, and owns nothing. A pure function
(`src/renderer/canvas/lod.ts`) decides which panels are worth a live terminal versus a cheap
card, based on viewport, focus, and a fixed budget of live WebGL contexts — culling a panel
never kills its process; only the registry's `dispose(id)` (explicit panel
close) and `disposeAll` do that — and since M4c a renderer teardown does neither, because
it has to leave the tmux session running (see `Canvas.tsx`).

### Things that are non-obvious

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

**Sessions survive their renderer, but not the app.** `Cmd+R` and `Cmd+W`
destroy the page without running React cleanup, so the renderer never sends
`pty:kill`. Since M4c each panel's process lives in a tmux session on a private
socket (`-L terminal-canvas`) and what `node-pty` holds is a tmux *client*, so a
renderer teardown detaches rather than kills and the next page's `pty:create`
hits `new-session -A` and lands back in the running agent. Quitting the app
still tears everything down — agents never outlive the app. With no tmux
installed the app falls back to spawning directly, says so in the HUD, and
behaves exactly as it did before M4c.

**One transform, not N layouts.** The canvas is a single `.world` element
carrying `transform: translate(...) scale(...)`; panels are positioned once in
world coordinates and never recomputed. This is not only a performance choice.
A CSS `scale()` on an ancestor is invisible to `getComputedStyle` and
`ResizeObserver` — which are exactly what xterm's `FitAddon` consults — so
zooming cannot change a panel's cols/rows. The alternative, computing each
panel's pixel size per frame, would reflow the running shell on every zoom
gesture.

The same transform-blindness is why pointer coordinates are wrong under zoom:
`getBoundingClientRect()` is transform-aware while `dimensions.css.cell.width`
is not, so under `scale(k)` xterm hit-tests a column `k` times the true one.
M4a corrects this at the source: `src/renderer/components/xterm-pointer.ts`
intercepts mouse events on `document` in the capture phase and re-dispatches
them with `clientX`/`clientY` rewritten so the offset xterm computes is already
in CSS pixels. `getMouseReportCoords` shares that helper, so mouse-reporting
TUIs are corrected by the same change.

**Restored panels are dormant.** A relaunch reads `layout.json` and puts every
panel's geometry and stacking back, but a restored panel is a card reading
"click to start" until you click it — no PTY is spawned and no WebGL context
is created for it just because it is on screen. Panning across a fully
restored twelve-panel canvas spawns zero processes; clicking one card wakes
that panel and it behaves exactly like a fresh one from then on. This is what
stops a relaunch from re-launching every agent that happened to be open when
you quit.

**`Cmd+K` is the one surface that takes the keyboard away.** Everywhere else in
this app a bare keystroke belongs to the agent — canvas shortcuts all require
`Cmd` precisely so a TUI never loses a key. The palette inverts that: it opens a
text field, and while it is open bare keys are its own. It spawns from a preset,
renames/deletes/re-defaults one, jumps the camera to any panel by name, inserts a
saved or project prompt into the panel it captured, and saves the current terminal
selection as a new prompt. Two consequences are worth knowing. Jumping to a panel
frames it but never *wakes* it, so a keyboard tour of a restored canvas still
spawns nothing. And the panel the commands act on is the one that had focus when
the palette **opened** — DOM focus moves to the input, but the app's idea of the
focused panel deliberately does not, so the panel stays live and stays the target.
Rows that lead somewhere — `Manage presets…`, `Manage settings…` — open on `→` as
well as `Enter`, and `←` comes back out, alongside the `Escape` that already did.
Both arrows act only from the edges of what you have typed (right from the end,
left from the start), so they never take the caret away from an in-progress query.

**Prompts come from two places, and only one of them is writable.** Saved prompts
live in `layout.json` alongside the panels; project prompts are read live from
`.claude/commands/*.md` under the focused panel's cwd — the same files Claude Code
reads, so they version-control with the repository and work outside this app.
Nothing here ever writes into `.claude/`: authoring a file someone will commit is a
decision to ask for, not a side effect of "save". Two prompts with the same name
from the two sources stay two rows, each labelled with its source.

**A packaged build is a separate installation.** `productName` is `Terminal Canvas`, and
`app.getPath('userData')` derives from the app's name — so the packaged app has its own
`layout.json`, its own presets and prompts, and its own tmux socket
(`terminal-canvas-app`), none of which the `npm run dev` build can see. The first launch
therefore opens on one fresh panel rather than on your dev canvas; that is the two
installations being separate, not data loss. The socket half is not cosmetic:
`before-quit` calls `shutdown()`, which is `kill-server`, so a shared socket would mean
quitting either build destroyed the other build's running agents.

**A panel's border reports what its agent is doing, and the bell needs your CLI's
cooperation.** Every panel gets a colour from a small state machine — starting,
busy, idle after a quiet stretch, or "wants you" after a real terminal bell — fed
by the same PTY bytes the terminal already renders, so nothing new is spawned to
watch it. The bell precondition is honest, not automatic: it only rings if the
CLI running inside the panel is actually configured to emit one. Claude Code's
own notification channel defaults to `auto`, which does not always mean "ring a
bell" — so a panel that never rings may simply have a CLI that was never asked
to. Two things about the detector are worth knowing if you go looking for a
transcript reader or a title-based indicator instead: it never inspects the
agent's own output for meaning, only for a BEL byte and the absence of further
bytes, and under the bundled tmux backend the agent's window-title escape
sequence never reaches this app at all — tmux consumes it for its own pane
title before this app's PTY layer ever sees it, so it was never a candidate
signal on that path in the first place.

**A panel that wants you and is off screen gets an arrow, and `Cmd+J` visits
it.** A small arrow appears at the edge of the viewport, pointing toward any
panel that is both `wants-you` and out of view — a panel merely scrolled
half off screen gets no arrow, because a pip for something already visible
is noise. `Cmd+J` (`Shift+Cmd+J` to go backward) steps through the waiting
panels oldest-first and frames each one, the same `centreOn` the panel
switcher uses. It deliberately does not acknowledge what it lands you on:
focus is still the only thing that clears `wants-you`, so a panel you jumped
to keeps its amber border until you actually click into it, and the arrow
that brought you there is one you can trust. The design for this milestone
named five surfaces for getting a user's attention — the edge arrows, the
jump key, an OS notification, a dock badge, and a sound. Only the first two
shipped. The other three need main-process or asset-level plumbing this repo
has no automated way to exercise — nothing here can drive a real
`Notification`, read `app.dock`, or confirm a sound actually played — and
landing three surfaces this codebase cannot verify under the same green
`npm run verify` as the two it can would be coverage that reads as proof
and isn't. They remain unbuilt, not merely undocumented.

**Multiple named workspaces, switching without killing anything.** The
canvas is no longer one persisted set of panels but a keyed collection of
them — "startup", "school", whatever names fit — switched from the command
palette's `Workspaces` section. A switch is a second boot: the outgoing
canvas is written into the workspace being left, the incoming one is read
back exactly as it would be at launch, and every derived piece of renderer
state (the undo stack, the id counter, the camera, the selection) is
re-derived rather than carried across. What does NOT happen on a switch is
any process dying — a hidden workspace's panels lose their DOM and keep
their tmux sessions, the same "two lifetimes, not one" split M4c already
relies on for a reload, now paying out at the scale of a whole canvas
instead of one culled panel. A workspace's row in the palette shows how many
of its panels are currently waiting for you, even while it is hidden.

Three things this milestone's design considered and deliberately did not
build. **A merged, all-in-one view across every workspace** is the exact case
that would try to exceed `LIVE_BUDGET` — a cap on live WebGL contexts that is
global, not per-workspace, so a merged view has no natural budget of its own
to spend. **Moving a panel from one workspace to another** has an obvious
gesture — rubber-band select several panels, then reassign them — and that
gesture, rubber-band selection, does not exist yet (`docs/ideas-backlog.md` #52);
building the move without it would mean inventing a worse one-off
picker for a feature that already has a natural home waiting. **A keyboard
shortcut for switching workspaces** was left unassigned: `Cmd+0` and `Cmd+1`
are already spoken for, and picking a new chord now would be a guess dressed
up as a decision — nobody yet knows how often switching happens in practice,
and a wrong guess is a worse outcome than a palette-only path for one more
milestone.

**The chrome is a second view over the palette, not a second implementation.**
Until M8a the app was almost entirely chords and a hidden `Cmd+K`, and a first
launch showed a canvas with no visible way in. The shell — a top bar, a
collapsible rail, a collapsible inspector, with the canvas as the grid's middle
cell — added no verb of its own at first: the New panel button routes through
`preset:spawn-by-id` (only main can resolve an absent `command` into your real
login shell), the zoom cluster calls `useViewport`'s own named verbs so `+` and
`⌘=` are provably the same gesture, and Search and the gear open the palette,
the gear landing directly in its `Settings` scope because settings rows are
hidden at rest. Every control is deliberately **unfocusable**: each one
`preventDefault`s its own mousedown so DOM focus never leaves the terminal's
hidden textarea, which is what keeps the app's central promise — bare keys
reach the agent — true on the very first click. Both side regions collapse to a
sliver with `⌘\` (rail) and `⇧⌘\` (inspector), and the choice persists like any
other setting — through the same `preferences` map every other setting uses, so
each side also gets a palette row for free and toggling it there moves the frame
immediately rather than at the next launch. The collapse is a discrete width
change with no animation on purpose, though the reason is smaller than it first
looks: nothing in the renderer watches the canvas host's size, so an animated
collapse would not re-tier anything — it would re-render the edge-indicator
layer on every frame of the transition, which is a real but modest cost in the
one layer built to absorb it.

**The inspector explains a panel; restart is the one verb the shell adds.** The
right-hand pane answers "what is this panel, actually" — the resolved command
and cwd main really spawned, the pid, the exit code, the agent's state, and a
badge when the session survived a reload rather than being started fresh. It
deliberately shows the LINKS rather than the answer: the resolved command and
what the panel's own spec asked for are separate fields, because a panel
labelled `login shell` is only explicable if you can see both that the spec
asked for nothing and that your shell is `/bin/zsh`. With nothing selected it
summarises the canvas instead — how many panels, how many running, how many
waiting on you — using the same "running" predicate the reset dialog names, so
the two can never disagree. Its act half is four verbs — rename, save as preset,
close, restart — each aimed at the SELECTED panel rather than the focused one,
and each routed through the same actions the palette and the rail use rather
than reaching into the session registry itself.

**Restart is dispose-and-re-ensure at the same panel id** — the same rect, the
same spec, a fresh process. Under tmux that means the session is genuinely
destroyed and a new one started, not reattached to: `new-session -A` would
happily attach to the surviving session, so the destroy is awaited before the
respawn, and the pane's process id is the only observable that tells a real
restart from a reattach (`verify:pty-manager` 20 asserts exactly that). It
clears the panel's agent state first, so a restarted panel cannot inherit the
previous process's "needs you" glow, and it asks for no confirmation — the
process it ends is precisely the one you asked to replace. Restart is offered
for any panel that has started, including one that has already exited, which is
most of why the verb exists.

**A reattached panel now says so.** M6a made main probe `has-session` before
every spawn specifically to know whether a panel's session survived, then
carried that fact with nothing rendering it for two milestones. The inspector's
badge is the reader, and it closes M6a's one outstanding success criterion.

## Milestones

| | Scope | Status |
|---|---|---|
| M1 | Electron shell, one hardcoded xterm panel on a real PTY | ✅ done |
| M2 | Infinite canvas: pan/zoom, dumb rectangles, coordinate math | ✅ done |
| M3 | Merge M1+M2: real terminals as panels, LOD + viewport culling | ✅ done |
| M4a | Panel manipulation: drag, resize, close, pointer correction | ✅ done |
| M4b | Layout persistence: panels survive a relaunch | ✅ done |
| M4c | tmux backing: sessions survive the renderer | ✅ done |
| M5a | Panel presets: saved spawns, a menu, Cmd+N's default | ✅ done |
| M5b | Command palette: Cmd+K, preset management, panel switcher, prompts | ✅ done |
| M5c | electron-builder packaging | ✅ done |
| M6a | Panel identity: user titles, and chrome that says what main resolved | ✅ done |
| M6b | Settings: a declarative schema, searchable in the palette | ✅ done |
| M6c | Agent state: a border that says what each panel is doing | ✅ done |
| M6d | Attention routing: edge pips for off-screen panels, Cmd+J to jump | ✅ done |
| M7 | Workspaces: named canvases, switching without disposing | ✅ done |
| M8a | The app shell: a frame, collapsible rail and inspector, a visible toolbar | ✅ done |
| M8b | The panel outline: a rail row per panel, navigate without waking | ✅ done |
| M8c | The inspector: what a panel is, and restart in place | ✅ done |
| M8d | Workspaces and attention in the rail | ✅ done |

Unscheduled ideas — none of them a commitment — live in [`docs/ideas-backlog.md`](docs/ideas-backlog.md),
each recorded next to the load-bearing invariant it would have to survive.
