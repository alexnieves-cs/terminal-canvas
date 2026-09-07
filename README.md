# Terminal Canvas

[![verify](https://github.com/alexnieves-cs/terminal-canvas/actions/workflows/verify.yml/badge.svg)](https://github.com/alexnieves-cs/terminal-canvas/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](#prerequisites)

An infinite canvas where every node is a live terminal running a coding-agent CLI.
Think Figma, but the objects are terminals — and the terminals are running `claude`,
`codex`, or anything else you would type into a shell.

> **Status: `v4.0.0`.** macOS only, Apple Silicon by default. The app is
> unsigned — signing needs a paid Apple Developer account — so Gatekeeper will
> object the first time you open it; [Install](#install) says exactly what it
> will say and what to do. `npm run verify` is the whole verification story and
> is green at this version; what it cannot prove is listed, by item, at the end
> of [docs/load-bearing.md](docs/load-bearing.md).

## What it does

- **An infinite canvas of real terminals.** Pan, zoom, drag and resize panels in
  world space. Every panel is a genuine PTY — not a re-implementation, not a
  wrapper — so any TUI that works in Terminal works here.
- **More panels than a browser can afford.** Off-screen and over-budget panels
  demote to cheap cards while their processes keep running. A fixed budget of
  live WebGL terminals is what stops the twentieth panel taking down the
  nineteen before it.
- **Agents survive the window — and, if you ask, the app.** With `tmux`
  installed, panel processes outlive a `Cmd+R` reload and a closed window —
  you come back to the agent mid-sentence rather than to a dead pane.
  Quitting ends them by default; turn on *Keep agents running after quit*
  (in the palette's settings) and quitting detaches instead, so the next
  launch reattaches to agents still working.
- **A canvas that says who needs you.** Each panel's border reports what its
  agent is doing — starting, working, idle, or waiting on you. Panels that want
  attention while off screen get an edge pip pointing at them, and `Cmd+J`
  flies to the next one. When this window is behind another, a panel that
  needs you posts an OS notification (click it to fly here) and a dock-badge
  count; an optional sound is one setting away.

- **Workspaces.** Named canvases you switch between without killing anything;
  the agents in the canvas you left keep working. `Cmd+Shift+A` shows all of
  them at once, side by side, and a rubber-band selection can be refiled from
  one canvas into another without a single process restarting.
- **Type once into many.** Select two or more running terminals and arm
  broadcast (`Cmd+Shift+I`, or the palette): every keystroke into the focused
  one reaches all of them, so the same instruction goes to four agents in one
  go. A banner says how many are listening and carries the Stop.
- **A command palette.** `Cmd+K` for panels, presets, saved prompts, settings
  and workspaces, with drill-in scopes and fuzzy matching.
- **A review layer.** Each panel is diffed against the snapshot taken when its
  agent started, so you can see what that agent — specifically that one —
  changed, and commit it without leaving the canvas.
- **Edges that hand off work.** Draw a link from one panel to another and set
  it to hand off: when the source finishes — its process exits, or its agent's
  turn ends — the target is started with the source's last output pasted in as
  context. A dormant target is woken for it; the inspector says what happened,
  in a sentence, every time.
- **Output that survives a relaunch.** Each panel's recent output is kept on
  disk (2 MB per panel, on by default, one setting to turn off), so a restored
  panel's card shows what it was doing before you quit instead of a blank
  "click to start" — and search has something to read.
- **No dead ends.** Every row and control that cannot work right now is
  present and disabled with a reason that names the fix; the audit that
  walked every surface is [docs/dead-end-audit.md](docs/dead-end-audit.md),
  and a check keeps every reason written down there. A file dropped on an
  agent's terminal is handed to the agent; dropped on the canvas it opens.
- **Work that can leave.** `Export panel output…` writes everything a
  panel's durable log holds, ANSI stripped and secrets scrubbed, to a file
  you choose — and tells you how many secrets it replaced. `Export canvas as
  PNG…` writes the window as it is, live terminals and cards alike,
  composited by the main process (a DOM capture would draw every terminal
  blank).
- **Cards that become less as you pull away.** Above a third zoom a card is
  a terminal tail; between that and a tenth it is a summary — the panel's
  name, its agent's state, one last line, the cost; below a tenth it is a
  block coloured by state with the name across it. The thresholds have
  hysteresis, so a pinch hovering on one never flickers the whole canvas.
- **A camera that flies, remembers, and keeps places.** Every discrete jump —
  a rail row, a search hit, a notification, `⌘1`, `⌘0`, a bookmark — is a
  short eased flight instead of a teleport, unless the system asks for
  reduced motion, in which case it is one frame. `⌘[` and `⌘]` walk the
  camera's own trail, separate from `⌘Z`, which never touches it.
  `Bookmark this view` in `⌘K` names where you are; `Go to` flies back.
- **Nothing recovered is thrown away unasked.** A session the app finds at
  launch with no panel in any canvas — the agent that was mid-run when the
  machine died between a spawn and the save — is offered back by name:
  restore it as a panel where it keeps running, or discard it. A dead pane is
  never offered, and a panel in a hidden canvas is never mistaken for one.
- **Drivable from outside.** `tc open --preset claude --cwd ~/repo` spawns a
  panel on the running canvas from a shell, a script, a git hook — or from an
  agent inside a panel, where `tc` is already on PATH with nothing installed.
  `tc list`, `tc focus <id>`, `tc ping`; `terminal-canvas://open?preset=…` is
  the same verb from a link. A local socket main owns, mode 0600, no network;
  a preset and a directory are all either door accepts, never a command.
  `Environment…` in `⌘K` shows the launcher's path and the one line that puts
  it on your PATH outside the app.
- **Command boundaries the app can see.** A login shell is decorated at spawn
  with OSC 133 marks (zsh through a `ZDOTDIR` shim that sources your own
  files first, bash through `--rcfile`), so every command gets a gutter mark
  coloured by its exit status, `Previous prompt` / `Next prompt` in `⌘K` jump
  between commands, `Copy last output` copies exactly one command's output,
  and the Work tab lists what the panel ran and how it ended — a run ledger
  main keeps as an append-only file, holding commands and exit codes and
  never a byte of output.
- **Search across every panel.** `Cmd+F` and a string: every panel whose
  output contains it, newest match first, each a row that flies the camera to
  that panel. The wall-of-terminals answered as a retrieval question — which
  of these twelve printed the stack trace.
- **Panels that line up.** Drag a panel near another and its edges and
  centre snap, with a guide line, at a distance that stays the same on screen
  whatever the zoom; `Tidy` in the palette compacts the selection (or
  everything) without reordering it, as one undo.
- **Terminal type you can read from across the room.** A global font size
  (9–24) and a per-panel override from the palette — three commit rows, no
  slider, because a size change is a resize and a resize is a SIGWINCH to the
  agent. Zoom stays zoom.
- **A first run that teaches by doing.** An empty canvas shows a launcher made
  of the real verbs — your presets (a missing CLI is named, with what to
  install), open a file, a note — and four gesture hints that each fade for
  good once used. `Environment…` in `⌘K` says what the app found at startup:
  PATH, each CLI, tmux, the layout file, and when it looked. If your login
  shell could not be read, a banner says so.
- **A shell that gives the canvas the window.** A 48px dock, ONE navigator pane
  (Panels, Workspaces or Files — the whole column tall), the canvas, and a
  context pane for the selected panel with a pinned identity header and three
  tabs (Detail, Work, Tools). Under 1100px both panes become drawers; over
  1600px both are resident; between, the navigator is and the context pane is
  once you have asked for it. Attention is a count on the dock, and a popover.
- **A git worktree per panel.** A preset can spawn its agent in a fresh
  worktree of the repository on its own `tc/` branch, so four agents on one
  codebase are four working trees, merged deliberately. The built-in *Claude in
  a fresh worktree* preset is the door; the inspector names the branch; closing
  the panel keeps the worktree and its branch until you remove it from the
  palette, which refuses while the tree is dirty.
- **Project prompts.** `.claude/commands/*.md` in a panel's working directory
  are read and offered as insertable prompts, in Claude Code's own format, so
  they version-control with the project rather than with this app.
- **Subagent nodes.** A `claude` panel that fans out to subagents shows a small
  node per subagent beside it, labelled with the model's own description,
  dimming when the subagent finishes. This reads Claude Code's own per-session
  files under `~/.claude/projects` and is therefore **absent for other agent
  CLIs** — `codex` and the rest write no such directory, so a panel running one
  of them shows no nodes, which is a CLI this feature does not support rather
  than a bug.

## What it looks like

`npm run shot` renders thirty-nine scenes of the real renderer into `out/shots/` (after a
build; nothing is asserted — the images are for eyes). Six of them, described:

- **`kinds.png`** — one of every panel kind on the light ground, the same hairline frame on
  each: a live terminal with a green left edge and its `idle` pill; a dormant card with its
  recorded tail and a dashed grey edge, `click to start`; a review node listing two changed
  files with `discard` beside each and `commit` in the chrome; a file panel and a note with
  `editing` and `Save` in the chrome row; `toolbox · repo` with its slash commands and
  permissions; the Jira panel with `Connect Jira…`. Since 2.3.0 the ground is lit by an aura, the frames are glass with one low lift, and the state edge glows.
- **`overview.png`** — the same canvas at 100% with the minimap in the top-right corner: one
  block per panel in its state colour, the waiting panel amber, asleep panels dashed, the
  camera an iris rectangle. The dock badge says `1`; the rail says `needs you` on the same
  row; the status strip says the same word. One vocabulary, four places.
- **`palette-query.png`** — the palette filtered by `group`: the matching letters lit in the
  titles, every disabled row present with its reason (`click into a panel first`, `select at
  least two panels to make a group`), the destructive row red, the settings rows with their
  hints wrapped in one voice.
- **`chat.png`** — a chat panel beside the live terminal: `claude` in the chrome, the state
  pill, `to terminal` as a labelled verb; in the transcript a user turn, a collapsed tool
  row (`Edit …/src/server.ts` with its `diff` verb), the agent's answer in mono, and the
  composer pinned beneath with `Send` and `Interrupt`. Beside it the codex chat with `codex`
  in its chrome and the same words — one vocabulary whoever answered.
- **`graph.png`** — two ruled edges into the second terminal, one from the chat (after a
  turn) and one from a worker (on exit 0), each with its trigger word on the line; the
  context pane's Automations section listing them with `on`; a run frame around the three
  with the run's name as its caps label and its cost.
- **`wide.png`** — the shell at 1800px with a note in the margin (`the api pair — worker b
  takes over on exit 0`) sitting on the ground in the well colour with a hairline, and a
  second note hanging beneath the `tests` panel on a dashed leader; a lock mark and `fill`
  in one panel's chrome, a pin on another; the context pane's action bar with Lock, Pin and
  Fill beside Restart.

## What it does not do

- **Isolate agents from each other or from you.** A worktree per panel is a
  separate checkout on its own branch, not a sandbox: every agent runs as your
  user, with your home directory, your keychain, your network and your other
  agents' processes all reachable. The app runs whatever commands you give it.
- **Sign its own builds.** See [Install](#install) for what Gatekeeper says.
- **Run anywhere but macOS.** `tmux` is optional but is what makes agents
  survive a reload or a quit; without it, sessions end with the window.
- **Make the terminals themselves accessible to a screen reader.** The chrome
  is; what an agent CLI draws is that CLI's own — see [Accessibility](#accessibility).
- **Rename a bookmark's saved camera, region-capture the canvas, or export a
  canvas another instance can open.** Export is a panel's text and a PNG of
  the window; the rest is in [docs/ideas-backlog.md](docs/ideas-backlog.md).

## Install

### Download

Grab the `.dmg` from [Releases](https://github.com/alexnieves-cs/terminal-canvas/releases),
open it, and drag **Terminal Canvas** to Applications.

The build is **unsigned** — signing requires a paid Apple Developer account,
which this project does not have. macOS will refuse the first launch with *"Terminal Canvas is
damaged"* or *"cannot be opened because the developer cannot be verified"*. To
get past it, either:

- open **System Settings → Privacy & Security**, scroll to the blocked-app
  notice and choose **Open Anyway** (on macOS 14 and earlier, right-clicking
  the app and choosing **Open** does the same job); or
- clear the quarantine flag:

  ```sh
  xattr -dr com.apple.quarantine /Applications/Terminal\ Canvas.app
  ```

Only do this because you have read the source or trust its author. That warning
exists for a reason and this app, by design, runs whatever commands you give it.

### Build from source

See [Getting started](#getting-started) below. It is three commands and needs no
Apple Developer account.

## Keyboard

Every canvas shortcut requires **Cmd**. That is deliberate: agent TUIs claim
essentially every bare key, so a bare keystroke always belongs to the terminal.

| Chord | Action |
|---|---|
| `Cmd+N` | New panel, from the default preset |
| `Cmd+K` | Command palette |
| `Cmd+J` | Jump to the next panel waiting on you |
| `Cmd+0` | Reset the camera |
| `Cmd+1` | Fit every panel on screen |
| `Cmd+=` / `Cmd+-` | Zoom in / out |
| `Cmd+\` | Toggle the navigator pane (Panels, Workspaces or Files — the dock chooses which) |
| `Cmd+Shift+\` | Toggle the context pane |
| `Cmd+B` | The Files pane, in the navigator |
| `Escape` | Close a Compact-width drawer or the Attention popover |
| `Cmd+Shift+[` / `Cmd+Shift+]` | Previous / next workspace |
| `Cmd+Shift+A` | Every workspace at once, side by side |
| `Cmd+Shift+I` | Broadcast keystrokes to every selected terminal (again to stop) |
| `Cmd+F` | Search every panel's output; Enter flies to the match |
| `Cmd+←/→/↑/↓` | Move the selection to the nearest panel that way (never wakes it) |
| `Cmd+Enter` | Focus — and wake — the selected panel |
| `Cmd+Escape` | Leave the focused terminal; `Tab` from there walks the chrome |
| `Cmd+click` | Open a path or URL printed in a terminal (paths in their default app, http(s) in the browser) |
| `Cmd+C` / `Cmd+V` | Copy / paste in the focused terminal |
| `Cmd+Z` / `Cmd+Shift+Z` | Undo / redo a canvas gesture |
| **`Ctrl+C`, `Ctrl+Z`, `Ctrl+B`** | **Untouched — these reach the agent**: `Ctrl+C` as SIGINT, `Ctrl+Z` as SIGTSTP, and `Ctrl+B` because tmux's own prefix is deliberately disabled |

Trackpad: two-finger drag pans, pinch zooms. A wheel over the focused panel
scrolls that terminal instead of the camera.

## Accessibility

Every canvas shortcut is `Cmd`-gated, because an agent's terminal claims every
bare key — `Tab` autocompletes, `Escape` interrupts. So `Cmd+←/→/↑/↓` move a
selection between panels, `Cmd+Enter` steps into one, and `Cmd+Escape` is the
one way back out of a terminal to the chrome. The canvas is a labelled
application region, each panel a named group, and the Attention list announces
a panel that starts waiting. A screen-reader mode (off by default) keeps a text
mirror of each live terminal so a reader can read it. Its limits are real and
worth stating: a carded or off-screen panel has no terminal on screen and so
nothing to mirror, the mirror announces output only as it arrives, and a
full-screen TUI is read as lines, not as a layout.

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

## Architecture

The main process owns every PTY; the renderer never spawns a process.

```
renderer  --invoke-->  pty:create / pty:write / pty:resize / pty:kill / pty:list   -->  main
                       machine:sample
                       layout:load / layout:save
                       session:backend
                       preset:list / preset:rename / preset:delete
                       preset:set-default / preset:spawn-by-id / preset:save-panel
                       preset:set-worktree
                       worktree:list / worktree:remove / worktree:reveal
                       scrollback:tail / scrollback:clear / scrollback:search
                       prompt:list / prompt:save / prompt:delete
                       template:list / template:save / template:delete
                       preset:template
                       settings:list / settings:set
                       canvas:request-reset
                       agent:acknowledge
                       workspace:list / workspace:create / workspace:rename
                       workspace:delete / workspace:activate
                       workspace:merged / workspace:move-panels
                       review:panel / review:baseline / review:at
                       review:diff / review:commit / review:discard
                       review:across / git:status
                       credential:list / credential:set / credential:delete
                       credential:verify
                       github:list / broker:audit
                       jira:list / jira:transitions
                       jira:comment / jira:transition
                       file:open / file:read / file:close / file:write
                       file:create
                       fs:list
                       toolbox:read / toolbox:permissions
                       diagnostics:sample / diagnostics:export
                       export:panel-text / export:canvas-png
                       memory:list / memory:add / vault:read
                       watcher:create / watcher:run / watcher:stop
                       watcher:dispose / watcher:list
                       env:report / link:open / ledger:list / ledger:usage
                       spawn:sheet / spawn:recent
                       agent:create / agent:send / agent:interrupt / agent:dispose
                       agent:answer / agent:list / agent:transcript / agent:import
                       agent:clipboard-image
                       attachment:clipboard-file
                       agent:grants / agent:revoke-grants
                       snapshot:list / snapshot:restore
                       agent:auto-start / agent:auto-stop
                       teammate:list / teammate:save / teammate:delete
                       teammate:choose-place
                       routine:list / routine:save / routine:delete / routine:run
                       browser:read
                       board:lane / board:lane-status
                       board:open-pr / board:comment-pr
                       shelf:list / shelf:save
                       plugin:details
                       skill:write / skill:create / skill:rename / skill:delete
                       skill:trail
                       agent:pool-start / agent:pool-stop
                       update:check
renderer  <--send---   pty:data (batched ~16ms) / pty:exit                         <--  main
                       agent:state / session:live / subagent:state
                       file:changed / usage:panel / attention:jump
                       session:recover
                       settings:changed / spawn:open-sheet
                       agent:event (batched ~16ms) / watcher:state / vault:changed
                       routine:fire
                       canvas:tidy / canvas:flip
                       board:add
                       pool:mint / pool:event
main      --send-->    edit:copy / edit:paste / edit:undo / edit:redo              -->  renderer
                       canvas:counts / canvas:model / canvas:reset
                       preset:spawn / preset:default / preset:capture
```

The invoke direction is the load-bearing part. Preset and prompt mutations, the
workspace verbs and the review reads are all renderer→main because main is the
only process that can answer them: only main can resolve an absent `command`
into the user's real login shell, only main owns the reset confirmation dialog,
and only main can reach a git binary. The four `credential:*` channels are that
argument at its strongest and are the only ones on this list defined as much by
what they do **not** carry: main holds the encrypted store, and none of the four
ever returns a stored secret — there is deliberately no `credential:get`, and
`credential:verify` sends the token to the service and hands back only what the
service said. A renderer-side reconstruction of any of
them would drift from main's answer silently, and the two would then disagree
only in the cases nobody tests.

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

A fuller version of this list — every load-bearing invariant in the codebase,
each recorded next to the silent failure that follows from undoing it — lives in
[`CLAUDE.md`](CLAUDE.md), which is the project's engineering decisions log
rather than tool configuration.

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
tears everything down by default; with the `session.keepOnQuit` setting on
it detaches instead of killing, and the next launch's reconciliation — which
already reattaches every session whose panel the layout knows — brings the
agents back. With no tmux installed the app falls back to spawning directly,
says so in the HUD, and behaves exactly as it did before M4c.

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
build. All three landed in M18, and one of the three reasons recorded here was
simply wrong — which is worth stating plainly, because a reason written down
and never corrected is exactly what a file like this one exists to prevent.
**A merged, all-in-one view across every workspace** was recorded as the case
that would try to exceed `LIVE_BUDGET` — a cap on live WebGL contexts that is
global, not per-workspace. That is not the obstacle. The global cap is the
*answer*: tiering keeps deciding which panels are live, and a merged view with
four hundred panels in it spends exactly the eight slots a single canvas
does. The real obstacle was **coordinates**: every workspace lays its panels
out in the same world space, clustered wherever that canvas's own camera has
been, so two workspaces' panels overlap by construction, and `cascadeCentre`
cannot help because it separates panels within one array. M18's answer is
lanes — a per-workspace translation applied for display only. **Moving a panel
from one workspace to another** was blocked on rubber-band selection not
existing; M18 built the marquee first and then the move on top of it, in that
order. M26 completed #52 with additive shift-click and origin-based group
drag. **A keyboard shortcut for switching
workspaces** was left unassigned on the grounds that picking a chord then would
be a guess dressed up as a decision. That reason was sound and it expired: a
milestone of using workspaces is the evidence it was waiting for, and
`Cmd+Shift+[` / `Cmd+Shift+]` are now the chords — matched on `event.code` and
not on `event.key`, because Shift rewrites the printed character and a `'}'`
test works perfectly for whoever has a US layout and does nothing at all for
everyone else.

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

**A review node is a panel that is not a terminal.** M9a taught main to answer
"what has this agent changed" — a `git stash create` snapshot taken the first
time a panel spawns in a repository, and a diff against it on demand — and put
the answer in the inspector's Changes section. M9b makes that answer a thing on
the canvas. `Panel` is now a discriminated union: a terminal panel and a review
node are two kinds of the same shape, sharing a rect, a z, a title and every
gesture that acts on one (drag, resize, close, select, the rail row, the panel
switcher), and differing in exactly what they render and what they own. You
open one from the inspector's Changes heading, or from the palette's
`Open review of <panel>` row (findable by typing "review changes"), on a panel
that has started inside a repository.

**It costs no `LIVE_BUDGET` slot and no WebGL context.** `Canvas.tsx` partitions
the panel array before tiering, so a node never reaches `assignTiers` or the
session registry at all — it holds no `PanelSession`, spawns no PTY, opens no
xterm, and cannot evict a running agent to make room for itself. That is
structural rather than a rule something obeys: there is no code path from a
review node to `registry.ensure`, so the eight live terminals you had before
opening a review are the eight you still have after. Opening five reviews of
five panels costs five DOM subtrees and nothing else.

**It outlives the panel it reviews.** A node stores its subject — the repository
root, the baseline sha, and a label snapshotted from the panel's own chrome —
and asks main a question addressed by that baseline rather than by a panel id.
Main drops a panel's baseline the moment its session is killed, so a node that
asked "review panel n7" would go blank at exactly the moment a review of
finished work is most useful: you close the agent, and the record of what it
did closes with it. Ask by baseline and the node keeps answering — after the
panel is closed, and after a relaunch.

**What a node shows.** A summary line (how many files, how many lines added and
removed), the repository root, a note when the answer cannot be attributed to
one agent (two panels sharing a checkout) or when git declined to open the
repository at all, and the list of changed files. Click a file and its hunks
expand in place, one file at a time — fetching every file's diff up front is
megabytes of text inside the world layer for a node you may only glance at.
Hunks are added, removed and context lines only: file headers, the `diff --git`
preamble and the no-newline marker are meta and never rendered as changes. A
node re-reads on its own when its subject's agent goes idle, and on the refresh
control in its header; it does not watch the filesystem (pull, not push), so a
change made outside a panel needs that click.

**A review node can now commit what it is showing.** M9c adds one verb to the
node: type a message, press Enter, and the files the node lists become a real
commit in that repository. It is an ordinary commit — your `pre-commit` hook
runs, and there is no `--no-verify` and no flag that could become one, because a
tool that quietly skipped a repository's own checks would be worth less than one
that refused. A hook that rejects the commit is reported as a refusal carrying
the hook's own output verbatim, which is a different answer from "this did not
run at all": the two have different fixes, and the split is by which call failed
rather than by guessing at git's wording.

**Your own index is never written while the commit is assembled.** The files are
staged into a scratch index outside the repository, the commit is made against
that, and your `.git/index` is byte-identical the whole way through — so an
agent running `git add` in that repository at the same moment cannot collide
with a commit it did not ask for. What the commit does have to touch is the index
afterwards, and that is the half that is easy to get wrong by leaving it alone:
once HEAD moves and the index does not, the index still describes the previous
tree, and the agent's own `git status` reports phantom deletions for files that
were just committed. So the committed paths are brought back in step by their
exact blob shas — never by re-reading the working tree, which would stage an
edit the agent made in the interval behind its back — and only those paths, so
anything you had staged yourself survives.

**Afterwards the node reads clean, because its baseline advances.** A node diffs
the working tree against the snapshot it holds, and committing does not change
the working tree — so without the advance the node would report the same files
forever and a second press would commit them again. Committing moves its
baseline to the commit it just made. It is not undoable, and it deliberately does
not pretend to be: `Cmd+Z` leaves it alone rather than restoring a baseline that
would make the node report work already in history.

**Where a commit cannot be attributed, the button is visible and refuses.** Two
panels sharing one checkout produce a `shared` reading, and committing there
would put another agent's work under this node's message — so the control stays
on screen, disabled, saying exactly that. Hiding it would make "not supported
here" look identical to "not built yet". There is no amend, no branch, no remote
and no per-file selection: the commit takes every file the node's answer
contains, not only the ones that fit on screen.

**Every workspace at once, and panels that can move between them.** M18 is the
three things M7's design named and deliberately left. `Cmd+Shift+A` merges every
workspace into one canvas, each in its own labelled lane, with every terminal
still live and every session untouched. Getting there needed one correction:
M7 recorded the obstacle as `LIVE_BUDGET`, the global cap on live WebGL
contexts, and that was the wrong reason. The cap is the answer, not the problem
— tiering goes on deciding which panels are worth a live terminal, and a merged
view of four hundred panels spends the same eight slots a single canvas does.
The real obstacle was coordinates: every workspace stores its panels in the
same world space, clustered wherever its own camera has been, so two workspaces
overlap by construction and nothing had ever kept them apart. Lanes are a
per-workspace translation computed on the way to the screen and never written
back, which is why the merged view is read-only geometry: you can read a foreign
panel, scroll it, click into it and type at its agent, but you cannot drag,
resize or close it, because a lane offset saved into `layout.json` is a
well-formed file with wrong coordinates in it.

**A rubber-band selection, and moving it somewhere else.** Dragging from empty
canvas sweeps a marquee — starting only where the hit test found nothing, so
clicking a card still selects that card rather than rubber-banding past it — and
the resulting selection is what the palette's *Move to workspace* rows act on,
into an existing canvas or a brand-new one you name. A move is a records
operation: no process is disposed, no session restarted, and the moved panel's
pid on the other side is the same pid it had before. It costs one thing, stated
rather than hidden — the undo stack is cleared, exactly as a workspace switch
already clears it, because leaving it standing meant one `Cmd+Z` could step back
to a state predating the move and dispose an agent that by then belonged to
another canvas. Earlier gestures stop being undoable after a move; that is the
price of not killing something.

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
| M7 | Workspaces: named canvases, switching without disposing; M11 later supplied Cmd+G navigation | ✅ done |
| M8a | The app shell: a frame, collapsible rail and inspector, a visible toolbar | ✅ done |
| M8b | The panel outline: a rail row per panel, navigate without waking | ✅ done |
| M8c | The inspector: what a panel is, and restart in place | ✅ done |
| M8d | Workspaces and attention in the rail | ✅ done |
| M9a | The review engine: what each agent changed, in the inspector | ✅ done |
| M9b | The panel kind: a review node on the canvas | ✅ done |
| M9c | Commit: a review node's work becomes a commit | ✅ done |
| M10 | The visual system: a token layer split into structure and theme, later repainted as the "soft machine" | ✅ done |
| M11 | The navigation grid: Cmd+G, a workspace per cell, release to jump | ✅ done |
| M12 | Live cwd and live command: a panel says where it actually is | ✅ done |
| M13 | Links between panels: a directed, labelled line that means something | ✅ done |
| M14 | The credential boundary: a store main owns, and no secret reaches an agent | ✅ done |
| M15 | Subagent nodes: an agent's fan-out, on the canvas | ✅ done |
| M16 | File panels: a local file on the canvas, watched | ✅ done |
| M17 | Token and dollar accounting: what each panel's agent has spent | ✅ done |
| M18 | Workspace extras: a merged view, a marquee, moving panels between canvases | ✅ done |
| M19 | Jira context: assigned tickets and ticket-to-session handoff (built as "M17") | ✅ done |
| M20 | The file tree: a codebase browser rooted on the selected panel | ✅ done |
| M21 | The agent's toolbox: what each panel's agent can actually do, read-only | ✅ done |
| M22 | Editable file panels: a save that refuses when the disk has moved (built as "M17") | ✅ done |
| M23 | Agent modes: permission mode, effort and model, per panel (built as "M18") | ✅ done |
| M24 | Jira writes: comment on and transition a ticket, from the panel | ✅ done |
| M25 | Functional links: restart a terminal when a linked one exits, listed in the inspector | ✅ done |
| M26 | Complete multi-select: additive shift-click and origin-based group drag | ✅ done |
| M27 | Notes: a place on the canvas to write a sentence, backed by a real `.md` | ✅ done |
| M28 | `Canvas.tsx` split into seven hooks, with no behaviour change | ✅ done |
| M29 | Machine cost: per-panel CPU and memory, and a canvas total (backlog #18) | ✅ done |
| M30 | Groups: a named, coloured region that owns panel ids (backlog #35) | ✅ done |
| M31 | Broadcast input: type once into every selected panel (backlog #21) | ✅ done |
| M32 | Diagnostics overlay, and a scrubbed bundle to hand a maintainer (backlog #75) | ✅ done |
| M33 | Codex agent launch: a second `AgentKind`, with its own flags | ✅ done |
| M34 | Space-drag and middle-drag pan (backlog #68; built as "M26") | ✅ done |
| M35 | Drawing links: port handles, snapping, and bezier edges (built as "M24") | ✅ done |
| M36 | Hardening for 1.0: the red baseline made green, Unicode 11 widths, a flush byte cap that keeps the tail | ✅ done |
| M37 | A git worktree per panel: `tc/<panelId>-<stamp>` under `userData/worktrees`, records that outlive the panel | ✅ done |
| M38 | Agents that outlive the app: `session.keepOnQuit` detaches instead of killing, boot reattaches | ✅ done |
| M39 | Durable scrollback: one append-only log per panel, ring-trimmed; a dormant card shows its tail | ✅ done |
| M40 | Broadcast input finished: the audit that found one exit and no chord, and added both | ✅ done |
| M41 | Handoff edges: a link that starts its target with the source's recorded output as context (backlog #24) | ✅ done |
| M42 | Search across every panel over the durable log: `Cmd+F`, camera to the match | ✅ done |
| M43 | Attention beyond the window: a dock badge, an OS notification, an optional beep | ✅ done |
| M44 | A keyboard-first canvas: Cmd-gated panel navigation, step in and out, screen-reader names | ✅ done |
| M45 | The visual language: flat surfaces, hairlines, one accent, two themes from one token set, the terminal follows | ✅ done |
| M46 | The interface architecture: dock, one navigator pane, the canvas, a context pane; three breakpoints | ✅ done |
| M47 | One panel frame: `PanelFrame` behind every kind, the checks' DOM contract kept as aliases | ✅ done |
| M48 | First run and every empty state: a launcher of real verbs, fading gesture hints, an environment report | ✅ done |
| M49 | Panel typography: a global terminal font size and a per-panel override, one refit per commit | ✅ done |
| M50 | Placement: edge and centre snapping with guides, and Tidy as one undo | ✅ done |
| M51 | Cmd-click a path or URL: a link provider over the terminal, opened through main | ✅ done |
| M52 | OSC 133 shell integration and a run ledger: command boundaries painted and navigable, what each panel ran | ✅ done |
| M53 | Discard, per file: a review row's armed discard that restores from the baseline into the worktree only | ✅ done |
| M54 | `tc`: a CLI over a Unix socket and a `terminal-canvas://` scheme, one parser, one handler | ✅ done |
| M55 | Recover an orphan session: a boot dialog that adopts or ends a session in no layout | ✅ done |
| M56 | The camera: eased flights with tiering held, a trail on `⌘[`/`⌘]`, named bookmarks per workspace | ✅ done |
| M57 | Semantic zoom: a card is a tail, a summary, then a coloured block as the camera pulls away | ✅ done |
| M58 | Export: a panel's output as scrubbed text from the log, the canvas as a PNG | ✅ done |
| M59 | The dead-end audit: every surface walked in `docs/dead-end-audit.md`, three dead ends fixed, two guards | ✅ done |
| M60 | Ship 1.0.0: the icon as code, both packaging gates run and recorded, the documents reconciled | ✅ done |
| M61 | The visual loop: `npm run shot`, a fresh-context critic, and three post-1.0 defects fixed with checks | ✅ done |
| M62 | The design brief and the 1.x scope decision — documents only | ✅ done |
| M63 | The state vocabulary: one word and one tone per panel, the state edge, iris selection | ✅ done |
| M64 | Finding a panel: rows lead with the name, `state:` queries, contiguous path matching, the empty search names its term | ✅ done |
| M65 | Starting a panel: the spawn sheet (where, what, how), one-off task panels, recent directories, the launcher as a panel | ✅ done |
| M66 | Every control says what it is: the merged view named, lane headers at chrome size, a labelled `start`, the pip's chip, the action-bar grid, the hint strip's rule, settings hints in one voice | ✅ done |
| M67 | The frame, second pass: flat ground, no resting shadow, dark hairlines, asleep dashed, Save in the chrome, `remove` labelled, `toolbox · repo`, the notice's leader line, notes in ink | ✅ done |
| M68 | The context pane finished: Detail repeats nothing, Work's three headings each answer, Tools shows permissions, the Jira panel's Connect verb, the navigator names its root panel and carries the merged door | ✅ done |
| M69 | The overview: summary and block tiers for every kind, and the minimap — every panel a block in its tone, the camera a rectangle, click or drag to move | ✅ done |
| M70 | Ship 1.1.0: the version, the README's pictures in words, CLAUDE.md and `docs/load-bearing.md` reconciled, the manual-only list re-read, both packaging gates run with numbers, the graph refreshed | ✅ done |
| M71 | The agent-session runtime: a main-process conversation with the installed `claude` in headless mode — transcript schema, streaming deltas, interrupt, permission requests, resume — over an injected process runner; no UI by design | ✅ done |
| M72 | The two documents: the 2.0 product thesis and design brief (extending the 1.x brief), and the M71–M95 scope decision with every backlog entry decided and the web panel declined | ✅ done |
| M73 | The chat panel: the sixth `Panel` kind — a conversation with the installed `claude` over M71's runtime, streaming, interruptible, its permission questions answered inline, its transcript a file that survives a relaunch, in the one state vocabulary | ✅ done |
| M74 | Same agent, two front-ends: a claude terminal opens as a chat with its session's own transcript rendered and continued, a chat opens in a terminal with `claude --resume`; one front-end at a time, refused by name otherwise | ✅ done |
| M75 | The composer: `@` references completed from the panel's directory, dropped or pasted images as image blocks (never a temp file), dropped files as references, `/` project and saved prompts, and `{{ }}` placeholders filled before insertion for saved prompts on both front-ends | ✅ done |
| M76 | Approvals as a canvas affordance: a pending permission puts the chat in `needs you` on every attention surface (main decides, on the terminal's own channel), and the question is answered from the card at every tier, the context pane, the attention popover, the palette, or after the OS notification's click — one badge summed across both natures | ✅ done |
| M77 | Tool calls as inspectable objects: a chat panel captures a review baseline at create, so the context pane's Changes and a review node answer for it; a review node of a chat counts and lists the tool calls that touched each file; a tool row naming a file opens that file's diff against the baseline in place (unchanged, no baseline, or the hunks) | ✅ done |
| M78 | The task graph: a handoff edge carries a condition (`exit`, `exit 0`, `a failing exit`, `after a turn`, `always`) decided by one shared table; a target with several incoming edges is a join that starts once when all have fired, payloads in edge order; a chat is a valid source (its turn's end) and target (a send); an edge is selected by a click, removed by Delete, restored by one undo, and set from the context pane; every ruled edge says what it does on the canvas | ✅ done |
| M79 | Runs: one execution of a subgraph recorded as a run — its panels, edges, each entry's start, end and outcome, its cost — kept in the layout beside groups and bookmarks; listed in the Workspaces pane with `Run again` (the terminal roots restarted in order, a new run recorded); a read-only frame with the run's name on the canvas; named on a member's Work tab | ✅ done |
| M80 | Templates: a shape of work — panels, their directories, their first messages and the edges between them — saved as a record beside presets with `{{parameters}}`; instantiated from the spawn sheet with one field per parameter, minting every node and edge in one history entry; a built-in `review this repository`; a selection saved as a template of your own | ✅ done |
| M81 | The supervisor: `tc status`, a read-only control verb answering with the canvas model — every panel's state word, the edges' triggers, the runs and their cost — in the canvas's own vocabulary; and a supervisor panel, a chat created with a system prompt that tells it to read the canvas with `tc status` and answer in those words, one per canvas, its first question left unsent in its composer | ✅ done |
| M82 | Budgets and queues that stop work: `agents.maxConcurrent` queues a send past the ceiling with its own reason, and `agents.budgetUsd` refuses a send past the budget by name with the fix, interrupting every turn in flight once per crossing — never killing, and never storing a refused message as a turn | ✅ done |
| M83 | Memory: what a repository has decided, tried and failed, as one append-only per-repository store that people and agents write to through the same door — a `memory` control verb and `tc memory add`, a seventh panel kind that lists it and adds to it, and a chat's first message carrying the recent entries with a line above the composer saying how many, so nothing is sent that was not shown | ✅ done |
| M84 | The watcher: a node that runs a command when something happens — a change under a path, a branch that moves, a timer, or another node ending through the same handoff table — reporting the last run's pass or fail in the app's one state vocabulary, keeping its run-ledger rows, showing that run's output tail, and never taking a PTY or a live-budget slot | ✅ done |
| M85 | The vault: a folder of markdown notes as the navigator's fourth pane, listed by title and newest first; `[[links]]` inside a note painted as links — a resolved one opens the note it names, an unresolved one is marked and offers to be created — and a Backlinks section under every note naming what points at it and the line; a note is still a file panel, and a vault is many of them plus one index | ✅ done |
| M86 | Git, deeply: where a branch stands against its tracking ref (`rev-list --left-right --count`, from the local ref — a fetch is never run, and the phrase says so), the branch picture across every worktree this app created for a repository, a review node over every worktree at once with each tree's diff since its fork a section and commit blocked by name, and the context pane's identity line naming the repository | ✅ done |
| M87 | The broker: `tc api <service> <method> <path> [body]` on the control socket — main reads the credential, attaches it, performs the request through an injected fetcher and hands back status and body; the token is never returned and every call, refusals included, is one audit row of metadata; a service with no credential answers the same named reason the panel rows use; the URL door refuses it | ✅ done |
| M88 | GitHub through the broker: a `github` work panel listing the issues assigned to you and the pull requests waiting on your review, each with `Start session` (an agent with the item as its opening context) and `open on GitHub`; the client asks the broker rather than the credential store, so the panel's reads sit in the same audit as the agents' calls; the palette door is present without a credential and disabled with the Connect reason | ✅ done |
| M89 | The connector seam: an Integrations page in the navigator listing every service with one of three closed sentences (`connected as <login>`, `not connected — add a token`, `token rejected`), one verb each, and the broker's audit rows beneath; a durable rejection mark recorded by every verify; one not-connected sentence imported by every door that names a missing service; what Jira and GitHub do not share, said on the page | ✅ done |
| M90 | A second headless backend: `chat with codex` beside claude in the spawn sheet, disabled by name when the CLI is absent; `codex exec --json` behind M71's seam — one process per turn with the prompt as its argument, `exec resume <thread>` after the first, the thread id adopted from the stream, a completed command rendered as the same tool rows claude's are, tokens counted and no cost claimed; the chrome names the backend; what codex cannot do (interrupt, images, the terminal door) is a named reason on the control, never a missing control | ✅ done |
| M91 | Decisions and the small things: the web panel declined with the spike measured (an `<iframe>` in the world is refused by the shipped CSP; a `WebContentsView` does not move with the world); the rail widened to 300px; the far view's hairlines thickened in world units so they stay one device pixel at 22% in dark; the launcher's verbs as invitations (`Start Claude…`) with the codex door beside claude's; ~190 load-bearing entries the M24 draft carried and the main file had dropped recovered into `docs/load-bearing-recovered.md`, symbol-checked, the 27 whose symbols are gone listed | ✅ done |
| M92 | Lock, pin and maximise: lock is one early return at the gate every move and resize passes (handles stay, titled with the fix; a group drag moves around a locked member and the frame says `N locked`); pin is counted INSIDE `assignTiers` — pins first, off-screen included, the ninth refused by count; maximise fills the visible viewport at the current scale with a restore rect, one history entry each way, cleared by the first move; three ways each — six palette rows every one present, the frame's marks and `fill`/`restore` control, the rail's marks; all three absent-unless-set on disk | ✅ done |
| M93 | The canvas as a document: the layout time machine — snapshots of saves kept beside `layout.json` (twenty, a minute apart), listed under History in the Workspaces pane and restored as a NEW workspace with re-minted ids so the current one is never overwritten and reset stays final; annotations — world-anchored and panel-anchored notes as SVG in the world, placed in an explicit `Annotate…` mode with a loud strip and its exit on it, edited in place, following their panel, dying with it, drawn on the minimap, absent on disk when none | ✅ done |
| M94 | The second dead-end audit: every surface M71–M93 added walked and written into `docs/dead-end-audit.md` beside the 1.0 walk; keyboard reach checked by a real Tab (`verify:panels reach.1`) across the context pane's action bar and the launcher; the manual-only list re-read entire — nothing struck, five entries added | ✅ done |
| M95 | Ship 2.0.0: the version; the README's milestone table put back in sequence and its pictures in words extended with this run's scenes; both IPC diagrams reconciled against the contract (94 invokes); CLAUDE.md and `docs/load-bearing.md` in agreement; both packaging gates run with the numbers; the graph refreshed; the final report — 2.0.0 because M73, M76, M78–M80, M81 and M84 all shipped | ✅ done |
| M96 | The verb table and its guardrails: a closed data table of every verb a plan may run (`shared/verb-table.ts`) with a destructive flag, and the closure check that fails the build for a palette action on neither the table nor the excluded list; a plan is data — built and refused by name against the live canvas (`shared/plan.ts`), a destructive step given the confirmation the runtime will not skip; the five guardrails each a check — a closed `planWritable` list of settings (never a ceiling), one outward gate every reader passes (`shared/outward.ts`, the token planted in a real log never comes back), control bytes stripped from `type` with Enter its own verb, typing only into an agent by KIND, destructive asks first; one palette row `Run a verb…`; no natural-language resolver and no voice, by name | ✅ done |
| M97 | Auto — a bounded autonomous run: `Complete`, `Harden`, `Review`, `Custom task…` as prompt vocabularies with a turn limit MAIN enforces beside M82's ceilings (the renderer's chip is a projection; the stop lands whatever the screen says); `Done` on the marker, `Stuck` with a reason (limit, an unanswered permission, an exit, a budget refusal), `stopped` by hand; a run in M79's sense, recorded and priced; a mode validates as a plan so a destructive verb without its confirmation is refused; the chip with its ring and dismiss, the chat's `auto` door, five palette rows | ✅ done |
| M98 | Approvals grow up: `Allow for session` — a grant keyed by session AND tool, held in main beside pending, answered before the renderer ever sees the request, cleared on dispose, never persisted; the card's third verb through the one answer door; the pane's `Session grants` field with `Revoke`, and codex's named reason (its sandbox policy decides) on a disabled control | ✅ done |
| M99 | The backend registry: one table declaring, per backend, what it can do and every named reason; every consumer reads the table and a check greps `src/` so no consumer switches on the backend name (the layout parser alone keeps its literal); the spawn sheet's conversation rows from the registry, disabled by name when a CLI is absent; ACP declined by name — no ACP-speaking CLI on this machine to measure, and what it would take written down | ✅ done |
| M100 | Teammates, and Places: a persistent identity — name, brief, its own memory, skills, PLACES (explicit folders, chosen in the OS dialog, never typed), services, chats, messaging and scheduling as three separate permissions because they fail differently — saved top level with the record rules; the Places gate in MAIN before any spawn resolves a cwd (`..`, a symlink pointing out and a relative path each refused on the real path), a path outside every place refused with the fix; a Teammates pane; `chat as <name>` in the sheet with the brief appended by main on every spawn; a teammate's memory beside the repository's, both bounds stated above the composer | ✅ done |
| M101 | Routines: a scheduled fresh chat as a teammate — main arms the intervals, the renderer mints the chat and sends the prompt under a system prompt that says the rule (gather, analyze, draft, prepare; irreversible actions stay behind confirmation); `Run now` / `Pause` / `Resume` / `Open last` with the last run's error on the row; in-app only, said on the row; a tick that fell while the app was closed is marked missed with the time, never skipped silently; a destructive verb in a routine's plan line refused at save against M96's table | ✅ done |
| M102 | Service scope per teammate and the spend card: a service is granted per teammate and checked BY CODE before the credential is read (the store's three readers unchanged); read-only methods (data, not a path heuristic) run uninterrupted, a write raises a card on the teammate's chat naming service, connected account, action, target and stated cost, answered through the one approval door with `Allow for session`; the audit row names the teammate; the Integrations pane says who may spend each service; OAuth declined by name | ✅ done |
| M103 | The browser pane: an eleventh kind, a `<webview>` guest in the one frame with the app's chrome above it — the address readout set only from the guest's own `getURL()` (never a page's title), Back/Forward/Reload/Open in browser as labelled verbs, `persist:tc-browser` as its own partition; `browser:read` in MAIN with the scheme checked on the live url (`file:`, `data:`, `about:`, `chrome:` refused by name), the text capped inside the guest and passed through the outward gate so a plan's `read` says the content is a remote page's; the five guest properties Electron's docs warn about closed by name in `main/index.ts` and pinned as text; an `exit-ok` edge into the pane reloads it (M78's table, no new trigger); `Open a page…` always present in the palette | ✅ done |
| M104 | Before you commit resources: four lineups (`Solo`, `Pair`, `Workbench`, `Swarm`) as seats in the spawn sheet, previewed BEFORE anything is minted — every seat's role and kind, how many sessions will open, and against `agents.maxConcurrent` read live how many agents will queue; seats that are not agents (a shell with a command, a browser at `localhost:3000`); launched into worktrees only agent seats get a lane, browser and shell seats stay in the checkout (a check) | ✅ done |
| M105 | The rail says what is happening: a chat row's second line carries the agent's last line said, from the transcript's last complete text block (the same content in both front-ends; a terminal's scrollback is not a conversation), an unread dot on a thread that finished while you were elsewhere, cleared on focus, per-panel state in its own store subscribed by id and cleared at every removing site; the dock's `N live` / `N quiet` capsules | ✅ done |
| M106 | Header discipline and the workspace's two verbs: one frame rule for every kind — the title gives (whole words, then an ellipsis) and the verbs never shrink, the full title in the title attribute and at the top of the frame's `⋯` menu; a `Workspace` menu holding Tidy Panes and Flip Terminals — flip is M57's far view invoked deliberately through the same context and renderer, a view state never persisted, respecting lock and maximise | ✅ done |
| M107 | The app explains itself: Changes refresh when the selected chat's turn ends; the thread header reads folder · branch · engine · model with every absent piece absent; discovery that explains itself — which shells were asked and which folders checked, `Check again` asking the login shell once more, and the distinction that matters: a shell that did not answer reads `the shell didn't answer` with the `~/.zprofile` fix, never `not installed` — three states, the repository's own rule broken by a surface it shipped, fixed as a defect | ✅ done |
| M108 | Ship 2.2.0: the version; the README's milestone table in sequence; both IPC diagrams reconciled against the contract (107 invokes); CLAUDE.md and `docs/load-bearing.md` in agreement; this run's surfaces walked in `docs/dead-end-audit.md`; the manual-only list re-read and extended; both packaging gates run with the numbers; the graph refreshed; the final report — 2.2.0 rather than 2.1.0 because Act II shipped BOTH teammates (M100) and the browser pane (M103), the prompt's own threshold | ✅ done |
| M109 | Obsidian, the material: two theme blocks re-derived for a deeper ground, the glass set (`--glass-1/2`, `--edge-light`, `--bezel`, `--lift`, the two auras, `--on-iris`, `--blur`) in both, the aura under every region and a second light that follows the camera, glass on the panel frame and the four chrome regions with the far tiers off the blur, the state edge's glow through `.pf::before` (which turned on `verify:styles tone.1`'s second arm), the wants-you pulse made one breath, the bezel on the chrome row, corners one step rounder, the well and `themes.ts` moved together — `ground.1` and `shadow.1` amended to the new rule, `obsidian.1`, `blur.1`, `pulse.1` | ✅ done |
| M110 | The signals: one filled control per surface (`.is-primary` on New panel, Send, Restart, Run again, Connect — never Commit), the far view and the minimap as one status wall (one `color-mix` of the tone, `far.1`), the summary tier's state word in its capsule, the palette's arrival with a scale (`motion.1`), the pressed dock item a filled tile | ✅ done |
| M111 | The two surfaces, and ship 2.3.0: the launcher's moment (a wordmark over the aura's light, three doors as cards, the quiet list, the environment footer — every `data-launcher-*` kept), the chat's rhythm (a user turn as a band, the tool name a chip, the composer a raised field with the filled Send); the shot harness re-run and read; the brief amended in `2026-09-05-design-brief-obsidian.md`; the version, this table, CLAUDE.md and `docs/load-bearing.md` in agreement | ✅ done |
| M112 | The outside libraries: Electronegativity as `verify:electron` (a closed list of seven accepted findings — a new one fails, a stale one fails, the Electron version pinned, the webview blind spot recorded); `@xterm/addon-serialize` evaluated and declined by name after it leaked half a secret across a reconstructed line wrap, replaced by `SessionHandle.serialize()` reading the buffer directly (`isWrapped` or a full-width row) behind the export door so a panel exports from its live buffer with persistence off (the log first, then the buffer, `source` on the result), the canvas addon declined as abandoned upstream; Sentry opt-in behind a DSN setting neither a plan may write, the event an allowlist copy, minidumps on their own setting, the renderer told by an argv flag and a bridge field lifted through the preload's `hookupIpc()` — no channel, the CSP untouched; ACP read against `BACKENDS` with the expired premise and an `acp` row re-costed, no field added; tldraw's camera API against `viewport.ts`, two backlog ideas | ✅ done |
| M113 | The work item record and its doors: `shared/work-items.ts` — four states as DATA (`todo | working | review | done`; `working` and `review` set by the runtime from events, never by a drag), the dedupe by key (`Add to board` twice updates, never duplicates, never resets a working item), `carryWorkItem` at every by-name copy, `WORK_ITEMS_MAX` newest, absent on disk when empty; `Add to board` on a GitHub or Jira row, `New work item…` in the palette, `tc board add <title>` / `tc board done <id>` at the control socket — read-write, refused at the URL door, answered by the RENDERER over an ephemeral reply channel because main writes no record the renderer would overwrite | ✅ done |
| M114 | Dispatch, the one verb: `board:lane` finds the item's repository under the teammate's places (a place or its immediate children, by origin), asks the Places gate on the ROOT before any worktree exists — the gate judges a lane under `userData/worktrees` by its record's root, never its path — then mints M37's worktree for the chat's id; the chat is minted through the ordinary `agent:create` as the teammate under `DISPATCH_PROMPT` (`ChatSource.dispatch` rides every spawn, M81's rule), the first message SENT, a plain M78 edge card → chat labelled `dispatched` with no trigger; `working` from the chat's first message start, never the click; the card anchored to its lane and dropped by a move of the card; closing the lane leaves `working` with the note `lane closed`, never silently back to `todo`; a drop onto a Teammates-pane row and `Assign to…` on the card | ✅ done |
| M115 | The return path: `board:lane-status` (`rev-list <base>...HEAD` in the lane, no fetch) says ahead of the root's branch by N; `Open PR` refuses by name through `prRefusal` (no lane, nothing ahead, not a GitHub item, not connected, the teammate without the `github` service), then main pushes the lane's branch with the user's own git credentials and POSTs `/repos/{owner}/{repo}/pulls` through the broker — whose write gate asks M102's spend card on the teammate's chat — with GitHub's 422 already-exists answered by one GET; `opened` and `exists` alike give the card its `pr` and the state `review`; `done` is the user's, offering the PR comment on the issue as a second card; every outward half unproven until M124's one hand check | ✅ done |
| M116 | The Board pane and the card in the world: a `board` navigator pane with four columns over the same records (rows by `updatedAt`, teammate and lane named, a click flies with `goToViewport` only), drop targets on `todo` and `done` ONLY (driven by `USER_SET_STATES`, read off the DOM by a check); the twelfth panel kind, `work` — sessionless like Jira's, through `PanelFrame`, its state word from `panel-state.ts`'s one appended arm and its tone mapped onto existing `--tone-*` names, one appended arm per fan-out file; a shot scene `board` | ✅ done |
| M117 | `cursor-agent` as the third engine — **declined by name, unmeasured**: the CLI is installed and not logged in (`agent login` opens a browser; only a person can), so no stream exists to parse and a row from the help text would be a guess; the three steps that would land it are `docs/ideas-backlog.md` #80. 3.0.0 stands: the board landed and copilot is the third engine | ⛔ declined |
| M118 | `copilot`, the third row (plain headless): measured against GitHub Copilot CLI 1.0.83 — one process per turn with the prompt as `-p`; the stream states NO session id (`parentId` chains the previous event), so the HOST pins one with `--session-id` and resumes with `--resume=` (claude's shape behind codex's process model; the parser is told the id); `assistant.turn_end` is per model call and `result` the turn's end; tool pairs under one call id; credits, never dollars; `--allow-all-tools` required headless so no permission reaches the host; `--no-auto-update` because the CLI replaced itself mid-run; four row fields for every backend (`appendsPrompt`, `handshake`, `sandboxArgs`, `models`) and the sheet's one chat arm keyed by backend; an appended prompt refused by name where the row cannot carry one | ✅ done |
| M119 | The canvas as an ACP client, the fourth row (`copilot --acp`): a resident process speaking JSON-RPC over the line seam — the codec in `shared/acp-transcript.ts`, three optional encoders on the adapter the manager prefers, the handshake (`initialize` → `session/new` or `session/load`) holding the first send, `session/cancel` as interrupt, `session/request_permission` through the ONE `answerPermission` with `allow_once` / `reject_once` and M98's grant as `allow_always`; the row's capabilities are the promise and the handshake's answer the fact (`negotiated` outranks the row); `fs/*` and `terminal/*` declined by measurement (backlog #81) | ✅ done |
| M120 | Chat mode, and the model word: `New chat (no folder)` — the app's own `userData/sandbox/<id>`, never a place, never home, the Places gate bypassed by construction and a teammate beside it refused; the row's tool-denying argv (claude plan mode, codex read-only, copilot's denied shell and write) appended, a row without one refusing by name; the header reads `sandboxed · no folder`; deleted on dispose, not exit; the row's closed model list as a select where the CLI has one | ✅ done |
| M121 | The deferred seven as defects, one commit each with its check: the routine chat's rule prompt across a relaunch; `tc memory add --teammate`; the ⋯ menu's outside click; `flipped` reset on a workspace switch; the ceiling preview counting the queue; a stale seeded run beside an idle panel — RESTATED: the pure seal is pinned but inert at load, and the row comes through `useRuns.onAutoEvent` from a seeded running auto status, carried to M124 by name; the auto chip giving before the verbs clip | ✅ done |
| M122 | Search across every panel: `Find in panels…` reads BOTH durable logs — the scrollback logs and the chat transcript logs — of the active workspace in MAIN (`main/panel-search.ts`, pure over injected readers), every line through `redactSecrets` (the outward gate's fourth named caller) with the count on the result, the cap STATED on the result and shown first; a transcript hit flies to its chat and its turn; a dormant panel's log answers like a live one; persistence off says `chats still answer` | ✅ done |
| M123 | The update notice, reshaped for an unsigned build: auto-swap declined by name (no `Developer ID Application` identity; `electron-updater` refuses an unsigned update); one GET of the releases feed through an injected fetcher (`main/update-check.ts`, called by no suite), the newest non-prerelease compared by a small semver, three states (`current`, `newer <version>` with `Open release`, `could not check` with the reason) on the palette's `Check for updates…`, the launcher footer and the environment rows; `update.checkOnLaunch` off by default and never `planWritable` | ✅ done |
| M124 | The third dead-end audit (every surface M113–M123 added, walked), `reach.2` (a real Tab through the Board pane and the card), the CI red of Act 0 fixed at its cause (the across fixture's bare origin names `main` in HEAD), the manual-only list re-read entire — and the owed hand checks RESTATED as owed with their steps, none done in this run (each needs a person at the app or an account's outward action); CI unread until the push | ✅ done |
| M125 | Reconcile and ship 3.0.0: the version, this table, both IPC diagrams against the contract, `CLAUDE.md` and `docs/load-bearing.md` in agreement, `verify:ipc` re-derived, both packaging gates run with their numbers, `graphify update .`, the tag and the push, a GitHub release carrying the unsigned `.dmg` with the Gatekeeper sentence | ✅ done |
| M126 | The skill key and the shelf: a skill's identity is `scope:name` (`JSON.stringify([scope, name])` — a bare name is ambiguous the moment two scopes hold it), and `placement` answers with a column AND its WHY (`placed` · `by-plugin` · `by-scope`), so a card the user arranged can be told from one the app derived; the shelf is a top-level record beside `presets` with the record rules and is ABSENT on disk when empty, decided in `serialiseLayout` — added here, because the store had no serialiser and wrote its snapshot straight out (`verify:toolbox shelf.1`–`shelf.4`, `verify:layout shelf.disk.1`–`.3`) | ✅ done |
| M127 | The Skills pane: the navigator's eighth pane, columns of cards over the SELECTED panel's own inventory — the user's placed columns first, the derived ones next, `Ungrouped` last and always as a real column that can be dropped into and cannot be deleted; a derived column with no cards after filtering is omitted (an empty projection describes nothing) and a query matching nothing says so rather than racking up empty columns; a shelf key whose file is gone KEEPS its slot, because a `git pull` does not get to edit the user's arrangement; three kind tabs over one inventory and `palette/fuzzy.ts` reused unchanged; `shelf:list`/`shelf:save` as their own invokes, the precedent every top-level record already sets (`verify:rail skills.1a`–`.1g`) | ✅ done |
| M128 | Plugin skills, and the skill panel: `claude plugin list --json` names each enabled plugin's own `installPath`, which is what bounds the walk and makes the 663 MB plugin cache affordable — `enabled` is the CLI's answer, never this app's inference, and an absent or unparseable CLI is `unknown`, NEVER `[]`; the thirteenth panel kind holds `{scope, name}` and nothing else (the file is the authority; a copied description stops being true at the next pull with no way to tell), names which OPEN panels can see this skill, states a two-scope collision and picks NO winner, and renders `claude plugin details` verbatim for a plugin's; `Open folder` through `link:open` on the directory, no reveal channel invented (`verify:file plugins.1`, `verify:toolbox skill.1`–`skill.2`, `verify:panels skill.panel.1a`–`.1e`, `verify:layout skill.panel.disk.1`) | ✅ done |
| M129 | The editor — the write half, narrowed to skills: Save SPLICES the frontmatter and never re-serialises it, so a key this app's grammar does not know survives a save it had no business touching; a file changed underneath REFUSES and keeps your text, never a silent overwrite and never a discarded draft; an ungrammatical block makes the metadata read-only WITH the reason on screen and leaves the body editable (three-state, never all-or-nothing); containment is M100's `insidePlace` reused on the real path, the write is atomic, and the editor serves its own `edit:paste` so `Cmd+V` no longer reaches the focused terminal's agent as well — the fourth text surface `docs/load-bearing.md` predicted would inherit that, and the first fixed; New, Rename (carrying the shelf slot) and Delete wired as real doors (`verify:toolbox edit.1`–`edit.5`, `verify:panels editor.1a`–`.1d`, `editor.2a`–`.2c`) | ✅ done |
| M130 | The live skill trail: the CLI's OWN transcript tailed from a byte offset — never a second log this app writes — reset when the file shrinks (`resetIfShrunk`'s precedent), decoded across multibyte splits, capped with the overflow COUNTED; codex and an unresolvable session refused by name before any other dependency is touched; the lane is DERIVED and anchored beside its host, so no trail entry enters the panel array, costs LOD budget or writes a record — the collapse is the only stored fact and the `hide N skills` capsule never disappears; culled on the scale-derived `tail` detail rather than the LOD card tier, because a dormant panel's trail is exactly what is left to read (`verify:file trail.1a`–`.1j`, `trail.chat.1a`–`.1d`, `verify:panels trail.lane.1a`–`.1h`, `verify:layout trail.mark.1`) | ✅ done |
| M131 | Assignments: a shelf column onto a teammate's brief through M100's ONE append site, with a project-scoped skill refused by name and the refusal NAMING the repository it belongs to; main translates a chat's worktree lane to its repository root through the same `worktreeRootOf` the Places gate uses before asking `skillsForBrief` — without it every M113-dispatched teammate silently lost its project skills — and `teammate:save` returns main's REAL `insidePlace` verdict so the pane renders `not visible to <teammate>` on the card instead of the renderer's advisory guess (`verify:teammates assign.1a`–`.1l4`) | ✅ done |
| M132 | Three template node kinds and the pool: `pool`, `orchestrator` and `collect` as ARMS on the existing template-node union rather than a second graph format, so a pre-M132 template loads untouched and an unknown kind drops its edges with it; the pool is a shared list as a file, M82's two ceilings read LIVE on every send with M82's own queue and its `reason`, and a budget crossing INTERRUPTS every worker and kills none — a killed agent loses its turn, and a budget is a stop; a worker minted into a stopped pool is interrupted, and a pump guarded off is deferred rather than dropped. No production caller yet: Run over a template holding a block is refused by name (`verify:layout workflow.1a`–`.1f`, `verify:agent-session pool.1a`–`.1h`) | ✅ done |
| M133 | The workflow panel: the fourteenth kind, a template drawn as a block diagram — a PROJECTION of the saved record, the live canvas still the editor — with the header counting the blocks, the verbs above the Definition and Runs tabs, Runs from M79 filtered to this template and three-state about what it cannot attribute, and Run reaching M80's one instantiation; a trigger is a WATCHER whose command is `/usr/bin/true`, because main's runner needs a command and the instantiation is the renderer's — every readout reads the `templateId` mark and says the workflow's name, and the ledger row naming the binary is the recorded cost; a fire on a parameterised template is refused rather than opening the spawn sheet at 3 a.m. (`verify:layout workflow.panel.1a`–`.1d`, `verify:palette workflow.2a`–`.2b`, `verify:panels workflow.panel.1f`) | ✅ done |
| M134 | v7 Act 0, the baseline: `pre-v7-run` at `328e087`; the tallies (33 suites, `verify:panels` 338/338, 7:30); `verify:panels` timed three times alone (321.4 s, 321.9 s, 322.1 s); 3.1.0 for the M126–M133 act's unversioned rows; CI's last run 34101554825 red at `verify:pty` 8 (a machine fact); the inventories carried into Act I | ✅ done |
| M135 | `verify:panels` split into FIVE parts over one harness (`scripts/panels-harness.cjs`; `core` 71, `shell` 92, `kinds` 47, `agents` 76, `product` 54), every check id kept (`verify:meta panels-split.2` reads the old file from git), each watchdog 1.25× its own two measured green runs (40 s, 95 s, 60 s, 110 s, 95 s) where one 600 s ceiling had been raised three times; three preambles every later part needed (the window lifecycle, the tmux backend, a seeded dormant panel) and two harness facts (a hidden page is unfocused until told; a coordinate click lands on what is on top) | ✅ done |
| M136 | `npm run handcheck`: the eleven owed hand checks as ONE source (`scripts/handcheck-steps.cjs`) — four automated against the real machine (`claude plugin list --json` through the shipped parser, `shell.trashItem` from a real Electron process, `createSkill` under a fresh temp HOME, `renameInShelf` over an occupied slot), seven printed as exact human steps and carried verbatim in the manual-only block (`verify:meta handcheck.1`) | ✅ done |
| M137 | The deferred-minors sweep over the M126–M133 log's 32 items: nine fixed (a fired trigger returns the template's refusal and Triggers is disabled with it — the audit's one real finding; a run's malformed `templateId` warns; two skill-panel sentences; `saveShelf` says what it dropped; one `KEY_LINE`; the trail lane's no-directory arm; Canvas's constants), three pinned, six already fixed by the act's own review wave, the rest declined by name in `docs/ideas-backlog.md` | ✅ done |
| M138 | A production Run caller for `pool` / `orchestrator` / `collect` (M132's "known gap"): `main/pool-caller.ts` reads the list and drives the engine, the RENDERER mints each worker on request (`pool:mint`, `board:add`'s ephemeral shape) as an ordinary chat and wires it by `idle` handoff to the collect the template's edges name; `finished` from the manager's own `ready`/`exited`; one live pool per block, Stop interrupts and kills none; an orchestrator's prompt on its record (`orchestrator: string`, M81's rule); the Runs tab's rows a projection of main's events; `agent:pool-start` / `agent:pool-stop`, `verify:ipc` at 122 | ✅ done |
| M139 | CI at its cause (`verify:pty` 8/9 are machine facts — SKIP by name on a runner without the binary, a real path-and-version assertion with it; 9 had been vacuously green) — the green run itself needs the push this run may not make; and the fourth dead-end audit over every surface since M124, with `reach.3`'s real Tab through the workflow panel and the Skills pane | ✅ done |
| M140 | #26's write half beyond skills: every toolbox row carries the file it came from and an Open door opens it in the file panel (M22's editor, the one write door every `.claude` file already had — a command, a subagent, a hook's settings, an MCP server's config); a deliberate edit, never a toggle; `toolbox.open.1`, `editor.cmd.1` | ✅ done |
| M141 | #27's placeholders: `{{cwd}}`, `{{branch}}`, `{{selection}}`, `{{panel}}` as built-in holes filled from the target (the live cwd, main's git status, the selection, the title) before any question and never asked; an unfilled one stays as typed; a project prompt untouched; `holes.builtin.1–.3`, `prompt.builtin.1` | ✅ done |
| M142 | #19's history half on #46's ledger: one usage row at every site that drops a panel's usage, read back through `ledger:usage` (124 channels) and priced in the renderer by the summary's rule; the summary's `this week` line with three states; the second adapter and the un-pinned panel declined again; `ledger.usage.1`, `summary.history.1`, `cost.history.1` | ✅ done |
| M143 | #53's live-tier half was M63's already (rows as rows) and M112 had declined the serialize addon by measurement; the check it lacked — `verify:xterm card.rows.1`, attached and detached | ✅ done (a pin) |
| M144 | #60 zoom-independent chrome: `.pf__chrome` and the resize handles counter-scale by `--chrome-scale` (1/scale in [1, 2.5], one variable on `.world`) as a transform — no layout box moves, no agent reflowed; `.pf__body` never transformed; `chrome.scale.1`, `frame.3` | ✅ done |
| M145 | #13's bytes case: a clipboard image pasted into a spawned terminal becomes a `.png` under `attachments/` (newest 20 kept) and the terminal is handed its shell-quoted path, bracketed; `attachment:clipboard-file` (123); every backend row's `pastesImagePath`; `clipboard.1–.3`, `paste.image.1` | ✅ done |
| M146 | #23's zoom to fit, named apart from reset and from maximise: `Zoom to fit` frames the selection when any and every panel otherwise, as a flight; `Reset zoom` keeps ⌘0's initial camera on its own row; `zoom.fit.1`, `fit.sel.1`, `fit.1` | ✅ done |
| M147 | #34's two halves: `Preset.env` and a panel's `env` (malformed dropped whole), the sheet's `KEY=value` field merged in main over the preset's own and the login env, a captured panel's environment never saved; `New workspace from <template>` — a fresh workspace named after the shape, switched to, the shape minted there; `preset.env.1–.2`, `workspace.template.1` ×2 | ✅ done |
| M148 | `verify:visual`: the shot harness given teeth — every scene painted into a scratch dir by a child Electron and compared with a committed golden at half scale under a per-channel tolerance and a pixel budget, three outcomes per scene, a diff image per red, a stray golden red, `UPDATE_GOLDENS=1` with the rule for using it; outside the chain like `verify:packaged` (`verify:meta visual.1`) | ✅ done |
| M149 | The 4.0 UX audit (`docs/ux-audit-4.0.md`): every golden walked against its intent through six lenses; found and fixed M142's unwired ledger read (four arms now) and M147's workspace minted before its sheet (the sheet asks first), the toolbox Open door's placement, the board's empty-column sentences, the routine line's wrap; declined F.1, F.3–F.6, F.9, F.11 by name; two scenes added — `reduced-motion` and `file-missing`; a `scale-100` scene tried and dropped by measurement (`capturePage` ignores the device-scale override); `workspace.template.2`, `summary.history.2`, `toolbox.open.1`, `board.empty.1`, `routine.last.1` | ✅ done |
| M150 | Act IV.1 — tags on the vault's file lineage (wikilinks and backlinks were M85's): `#tag` parsed beside the links with one code-span exclusion, the index's tag map from the same pass, a TAGS section in the Vault pane that filters through the search field, a chip in the note that filters from the other side; nothing written; `tags.1–.2`, `tags.1` (styles), `vault.tags.1` | ✅ done |
| M155 | Act V.1 — ink on M93's annotation layer (#15's first slice past labels): a draw tool on the annotate strip, a drag becomes one stroke anchored by its first point (world, or a panel it then follows), points relative to the anchor and RDP-simplified, one world width that thins with the camera, an SVG path with a hit twin, selected and deleted like a label, persisted with the absent-vs-malformed rule; `ink.1–.3`; the `ink` scene | ✅ done |
| M160 | Act VI — 4.0.0: the version, the local tag `v4.0.0`, README / `CLAUDE.md` / the manual-only list / the dead-end audit current, `npm run verify` and `npm run verify:packaged` green and pasted in the run's ledger, the release body as `docs/release-notes/4.0.0.md`; nothing pushed, no GitHub release | ✅ done |
| M161 | v8 Act 0 — the baseline: `npm run verify`, `verify:packaged` and an unchanged `verify:visual` over `7049dab`, the tallies in `docs/build-log/m161-m179-ledger.md`, every golden read; the shot window's content size pinned to the goldens' 1440x865 (a display work-area clamp had moved it) | ✅ done |
| M162 | v8 Act 0 — the brief (`docs/superpowers/specs/2026-09-07-m162-product-polish-brief.md`): the three references measured, twenty-two findings with dispositions, the face / rest / path / metrics rules, four tokens; `verify:styles face.1` and the sweep that makes it green, `polish.1` | ✅ done |
| M163 | v8 Act I — the quiet header: glyph · title · state at rest, the verbs and marks on hover/focus, the machine cost to the inspector, the dark lift | ⏳ this run |
| M164 | v8 Act I — the body's material: the UI face for prose, the reading inset, `displayPath` and the path rule in every body | ⏳ this run |
| M165 | v8 Act I — diffs as cards | ⏳ this run |
| M166 | v8 Act I — the far view as a status wall | ⏳ this run |
| M167 | v8 Act II — turns | ⏳ this run |
| M168 | v8 Act II — tool rows | ⏳ this run |
| M169 | v8 Act II — the composer | ⏳ this run |
| M170 | v8 Act II — the agent card when it is a terminal | ⏳ this run |
| M171 | v8 Act III — the rail as places | ⏳ this run |
| M172 | v8 Act III — the dock and top bar | ⏳ this run |
| M173 | v8 Act III — the status bar at rest says nothing | ⏳ this run |
| M174 | v8 Act III — the launcher as a welcome | ⏳ this run |
| M175 | v8 Act III — palette and sheets | ⏳ this run |
| M176 | v8 Act IV — motion with intent | ⏳ this run |
| M177 | v8 Act IV — empty states as places | ⏳ this run |
| M178 | v8 Act IV — the second full audit | ⏳ this run |
| M179 | v8 Act IV — reconcile: 4.1.0, README, `CLAUDE.md`, the release body, the tag | ⏳ this run |

The table's order is CLAIM order, not build order. Several rows carry a number
nobody used while the work was being done, and the reason is the same one
every time: the work was built and reviewed on a branch as "the next number",
main claimed that number through some other merge while it was in flight, and
the branch renamed itself on merge. **The number belongs to whichever milestone
reaches `main` first**, and the branch that arrives later renames itself —
never the row that is already here, which other documents are already citing.
M15, M16, M17 and M18 were each renumbered at least once on the way in (M18
four times); M19, M22 and M23 were built as "M17", "M17" and "M18"; M34 was
built as "M26" after M26 (multi-select) had already landed; and M35 was built
as "M24" and merged eleven hours after M24 (Jira writes) had taken that number.

The table was repaired on 2026-09-01 from the git history, and the repair is
recorded here so nobody re-derives it. Before the repair, M24 appeared on two
rows (Jira writes and drawing links), and eight shipped milestones had no row
at all: M10, M22, M25 and M28 were described in `CLAUDE.md` and never listed,
and five features had merged with no number of any kind — machine cost,
groups, broadcast input, the diagnostics overlay and the Codex launch — which
are M29 through M33 here, numbered in the order they reached `main`. One
milestone-shaped design document, the interface-architecture spec in
`docs/superpowers/specs/`, still calls itself "M23"; it was written after M23
(agent modes) had merged and has not been built, so it holds no number in this
table and takes the next free one if it ever does. Two branches remain
unmerged in local worktrees (`worktree-m23-interface-architecture`,
`worktree-m24-github-work-panel`); neither has a row because neither has
reached `main`.

Unscheduled ideas — none of them a commitment — live in [`docs/ideas-backlog.md`](docs/ideas-backlog.md),
each recorded next to the load-bearing invariant it would have to survive.

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

Individual suites are listed in [`package.json`](package.json) and described
check-by-check in [`CLAUDE.md`](CLAUDE.md).

## Contributing

Issues and pull requests are welcome. The one hard requirement is that
`npm run verify` is green — see [CONTRIBUTING.md](CONTRIBUTING.md) for what a
check is expected to look like and why nearly every one of them carries a
comment explaining the failure it guards.

## License

[MIT](LICENSE) © 2026 Alex Nieves
