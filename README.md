# Terminal Canvas

[![verify](https://github.com/alexnieves-cs/terminal-canvas/actions/workflows/verify.yml/badge.svg)](https://github.com/alexnieves-cs/terminal-canvas/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](#prerequisites)

An infinite canvas where every node is a live terminal running a coding-agent CLI.
Think Figma, but the objects are terminals — and the terminals are running `claude`,
`codex`, or anything else you would type into a shell.

> **Status: `v5.0.0`.** macOS only, Apple Silicon by default. The app is
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
                       session:backend / session:last-exit
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
                       review:across / review:identity / git:status
                       git:root
                       credential:list / credential:set / credential:delete
                       credential:verify
                       auth:login / auth:logout / auth:sessions
                       auth:use / auth:status
                       presence:local / presence:rosters
                       team:list / team:observe
                       canvas:op / canvas:shared-view
                       workspace:share / workspace:shares
                       workspace:open-share / workspace:share-member
                       workspace:share-members
                       text:open / text:close / text:update
                       relay:spawn / relay:attach / relay:detach / relay:input
                       relay:resize / relay:control / relay:kill / relay:list / relay:view
                       github:list / broker:audit
                       jira:list / jira:transitions
                       jira:comment / jira:transition
                       file:open / file:read / file:close / file:write
                       file:create
                       fs:list
                       toolbox:read / toolbox:permissions
                       diagnostics:sample / diagnostics:export
                       export:panel-text / export:canvas-png
                       export:deck-pdf / deck:export-pptx / tool:generate
                       memory:list / memory:add / vault:read
                       watcher:create / watcher:run / watcher:stop
                       watcher:dispose / watcher:list
                       env:report / link:open / ledger:list / ledger:usage / ledger:timeline / ledger:event
                       check:output / combine:run / lane:merge
                       combine:inputs / combine:integrate / combine:receipts
                       job:list / job:recover
                       agent:cancel-queued / agent:terminate
                       agent:queue-edit / agent:send-correction
                       task:evidence / task:evidence-index / task:export-handoff
                       setup:preflight / recipe:history
                       setup:read / setup:save / setup:prepare
                       editor:open / recipe:list / recipe:save / recipe:delete
                       spawn:sheet / spawn:recent / spawn:recent-used
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
                       preview:discover / preview:capture
                       asset:put / asset:choose
                       node:fetch
                       portable:export / portable:import
                       pack:read / pack:add / pack:export / preset:mark-reviewed
                       pack:sample / github:publish
                       board:lane / board:lane-status
                       board:open-pr / board:comment-pr
                       board:repositories
                       shelf:list / shelf:save
                       plugin:details
                       skill:write / skill:create / skill:rename / skill:delete
                       skill:trail
                       agent:pool-start / agent:pool-stop
                       update:check
                       image:read / starter:prepare
                       docx:import
renderer  <--send---   pty:data (batched ~16ms) / pty:exit                         <--  main
                       agent:state / session:live / subagent:state
                       file:changed / usage:panel / attention:jump
                       session:recover
                       settings:changed / spawn:open-sheet
                       agent:event (batched ~16ms) / watcher:state / vault:changed
                       presence:remote / team:observed / canvas:shared
                       auth:changed
                       text:remote
                       relay:data / relay:state
                       routine:fire
                       canvas:tidy / canvas:flip
                       canvas:feedback
                       board:add
                       pool:mint / pool:event
main      --send-->    edit:copy / edit:paste / edit:undo / edit:redo              -->  renderer
                       canvas:counts / canvas:model / canvas:reset / canvas:plan
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

The three `auth:*` channels follow the same rule for the Terminal Canvas account (a
Supabase session signed in through GitHub; setup in [docs/accounts.md](docs/accounts.md)):
the session lives in the same encrypted store under `supabase:github:<id>`, and the
channels answer with who is signed in, never with a token.

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
| M163 | v8 Act I — the quiet header: at rest a frame is its kind glyph, its title and one state; every chrome button and mark at opacity 0 until the frame is hovered, focused or selected (`--dur-1`; reduced motion drops it); the CPU · RAM readout moved to the inspector's Machine section (three arms); the dark theme's glass, edge-light and lift re-valued — `verify:styles rest.1` / `metrics.1`, core `rest.1`, shell `machine.1` | ✅ done |
| M164 | v8 Act I — the body's material: the reading kinds in the UI face at 14px/1.5 with a 20px inset and a 72ch measure, the code leaves opting into mono by name; `shared/display-path.ts` and the path rule in the review, file, toolbox, memory and teammates bodies (`verify:rail path.1`, kinds `path.1`); the browser's icon controls | ✅ done |
| M165 | v8 Act I — diffs as cards: a review file row is a card with the basename bold, the directory quiet, `+n −n` as washed pills and `discard` revealed on hover — `verify:styles diff.1` | ✅ done |
| M166 | v8 Act I — the far view as a status wall: the summary tier is the kind's glyph, the name and the state on the block tier's own tone wash, the last scrollback line gone — `verify:styles far.2`, core `far.1`; check 8 reads the tail tier, the core watchdog 63 s | ✅ done |
| M167 | v8 Act II — turns: `shared/markdown.ts` (a closed grammar, a tree, never innerHTML), the user's turn a bubble on `--bubble`, the assistant's unboxed prose at the measure, the caps role labels clipped, the time on hover, a soft caret — `verify:rail md.1`, `verify:styles turns.1` | ✅ done |
| M168 | v8 Act II — tool rows: one row per call (glyph · verb · target · state pill), the result well capped at twelve lines, consecutive rows under one header collapsed by default with the rows kept in the DOM — `chat-model.7`, `tools.1`, agents `tools.3` | ✅ done |
| M169 | v8 Act II — the composer: a rounded well, the chips row, the textarea growing two to six rows, Send the one filled control with Interrupt in its place while a turn runs, the approval as a sentence — `composer.1`, `composer-rows.1` | ✅ done |
| M170 | v8 Act II — the agent card when it is a terminal: `agentHeader` over `chatHeaderLine`, the chat's glyph beside the state dot — `header.3`, agents `agent-card.1` | ✅ done |
| M171 | v8 Act III — the rail as places: rows grouped under quiet headings with counts (`railGroups`), every row's kind glyph in a soft tint, the state a dot with the word on the row's title, start revealed on hover, the selected row a pill — `groups.1`, `rail.1`, agents `reveal.1` rewritten | ✅ done |
| M172 | v8 Act III — the dock and top bar: each dock button's name a tag revealed on hover or focus, the current place a filled pill, the live/quiet capsules gone, the search a field-shaped button — `dock.1` | ✅ done |
| M173 | v8 Act III — the status bar at rest says nothing: the HUD a floating pill with the zoom controls and the update notice alone; the hint strip removed, its gestures the rail's empty-state sentences (`canvas/hints.ts`), the tmux notice a dismissible first-run banner in the launcher — `hints.1`, `hud.2`, agents `firstrun.3` rewritten, `firstrun.4` | ✅ done |
| M174 | v8 Act III — the launcher as a welcome: the wordmark in the UI face, three soft doors, a recents row, the verbs with the command alone in mono, the environment line one sentence — `launcher.1` | ✅ done |
| M175 | v8 Act III — palette and sheets: the palette's state a dot with the word clipped; the material the surfaces already had pinned — `material.1` | ✅ done |
| M176 | v8 Act IV — motion with intent: every duration a token (`--dur-1`, `--dur-2`, `--dur-breath`), the auto chip's spinner gone, the arrival a rise (the brief's scale declined — a scale above `.pf__body` broke the annotation stage) — `motion.2` | ✅ done |
| M177 | v8 Act IV — empty states as places: `shared/empty-states.ts` and `shell/EmptyState.tsx` (glyph · sentence · one verb) across the panes, the vault, the palette, the chat and the attention popover — `empty.1`, `empty.2` | ✅ done |
| M178 | v8 Act IV — the second full audit (`docs/ux-audit-4.1.md`): 26 findings, 12 fixed (the enabled Restart painted white on white since M46 — `restart.paint.1`; `displayLabel`; the hunk from the first `@@`; the fences stripped; the Files heading's root, `tree.1`), 3 declined by rule, 11 owed to #88 and #86; twelve scene intents rewritten | ✅ done |
| M179 | v8 Act IV — 4.1.0: the version, the local tag `v4.1.0`, README / `CLAUDE.md` (the five rules as pinned entries) / the brief's finished pass, the release body as `docs/release-notes/4.1.0.md`, `npm run verify` and `npm run verify:packaged` green and pasted in the run's ledger; nothing pushed, no GitHub release | ✅ done |
| M180 | v9 Act I — the first conversation: one primary `Start a conversation` over `shared/onboarding.ts`'s readiness rows (installed is never signed in), the bounded `plan` control verb (`tc plan` → `canvas:plan` → the palette's one executor; no destructive step, no human answer, a teammate caller bounded, the URL door closed), `V9_DOORS`, `paste.image.1` read from the PTY log — `verify:onboarding`, `plan.*`, `agent-door.1–.6`, `closure.v9.1`, `onboarding.start.1`, `onboarding.agent.1` | ✅ done |
| M181 | v9 Act I — the captioned starter canvas: `shared/starter.ts`'s manifest and idempotent workspace record, the fifteenth kind (`image`, an absolute path read by main by magic number through `image:read`), `starter:prepare`'s two files written once, `applyStarter` through the ordinary mint paths with nothing spawned, the launcher's first-run primary and `Starter canvas…` line, the `starter.open` row and `starter` verb — `starter.1–.3`, `image.record.1`, `starter.plan.1`, `image.kind.1`, `image.1`, `starter.prepare.1`, product `starter.1`, `image.1` | ✅ done |
| M182 | v9 Act II — one template, two editors: `shared/template-edit.ts`'s six operations, the record's revision and the stale save, the canvas binding (Update through the operations), the diagram's drag and Delete, six `workflow-*` verbs and rows — `edit.1–.6`, `store.edit.1`, product `workflow.edit.1–.3` | ✅ done |
| M183 | v9 Act II — the library, the wire and the inspector: `shared/template-library.ts`'s table (an entry, a default node and the placement per kind), a real drag from the library onto the diagram, a port drag that wires an edge and refuses a cycle by name, edge selection and Delete, and the context pane's node editor rendering the selected block's fields from its kind's schema — `library.1–.2`, product `workflow.lib.1`, `workflow.wire.1`, `workflow.inspect.1` | ✅ done |
| M184 | v9 Act II — Save, Run and Stop on the diagram: the draft saved back with the revision it was read at (stale keeps the draft and offers Reload or Save a copy), Run over the DRAFT, the run's immutable `definition` snapshot and node→panel `mapping`, `shared/run-outcome.ts`'s per-block words on the selected run, and the `workflow-save`/`-run`/`-stop` verbs — `run.def.1`, `run.outcome.1`, product `workflow.save.1` | ✅ done |
| M185 | v9 Act III — the preview reads as the app beside its code: `shared/preview.ts`'s named device widths and four discovery states, `main/preview-discover.ts` asking ONE `lsof` over the panel's process TREE and reading one `package.json` while running nothing, `main/preview-capture.ts` (the scheme on the guest's live url, an empty image and a failed write each refused by name, one PNG under `userData/captures`), `device` on the browser record laid out (never transformed), a capture as an ordinary image object, a loopback-only coalesced reload, Retry on a failed page, and four verbs/rows/doors — `preview.1`, `preview.capture.1`, `preview.device.1`, product `preview.1` | ✅ done |
| M186 | v9 Act IV — durable images: `main/asset-store.ts` content-addressed by sha-256 (the same picture twice is one file, the extension from the magic number, both caps reported, the oldest pruned), `image.asset` on the record, `asset:put`/`asset:choose`, a drop or paste that lands on NOTHING becoming a picture with every agent target unchanged, and Replace on every arm through the system's own chooser — `asset.1`, `image.asset.1`, product `image.2` | ✅ done |
| M187 | v9 Act IV — notes, free text and named frames: the sixteenth kind as ONE record with three forms, `shared/notes.ts`'s summary and caps, the four tints declared in both theme blocks, an in-place editor that stops the canvas's keys and serves its own paste, a frame minted behind what it encloses whose interior takes no gesture, and three verbs with five rows — `note.kind.1`, `note.1`, product `note.1` | ✅ done |
| M188 | v9 Act V — node schemas and a bounded executor: `action` (a canvas verb line through the SAME `runAgentPlan` the agent door takes — the workflow door every v9 verb had owed) and `http` (a GET, and every other method refused by name because a write belongs on the broker's approval path), the response capped and passed through `outward`, `node:fetch` in main with the real fetcher called by no suite, and `Test this node` in the inspector, the palette and `node-test` — one block, its duration and a named failure, no neighbour started and no run recorded — `node.http.1`, `closure.v9.1` (the workflow door asserted, not owed), product `node.1` | ✅ done |
| M189 | v9 Act VI — one portable file: `shared/portable.ts` built FIELD BY FIELD (no environment, session id, transcript or pid can travel), every string scrubbed with the count on the record, every kind that cannot travel omitted BY NAME with what it would do on the other machine, pictures omitted unless a person asks (never called "redacted"), three parse answers including a future version naming both numbers, and `remapPortable` moving each reference with its target; import makes a SEPARATE workspace with every panel dormant so nothing starts — `portable.1`, `gate.2` (the fifth redactSecrets caller, by name), product `portable.1` | ✅ done |
| M190 | v9 Act VII — the feedback door and the guide: `shared/feedback.ts` builds an issue draft from facts chosen BY TYPE (version, platform, engine words, panel counts — no path, command or transcript can reach the shape), scrubs it and states the count IN the draft, cuts an over-long body with a line saying so, and opens the repository's `issues/new` through the ONE `link:open` door — this app submits nothing and reads no credential; `docs/getting-started.md` written from the shipped behaviour and checked as a file — `feedback.1`, `guide.1`, `gate.2` (the sixth redactSecrets caller, by name), product `feedback.1` | ✅ done |
| M191 | v9 Act VIII — the third UX audit: two fresh-context critics walked all 57 goldens against the 5.0 brief and the 4.1 rules and returned 34 findings; thirteen fixed at their surface (sentence-case node metadata, the two permanent refusal lines above the diagram now revealed with the chrome, the clipped diagram, the Machine section shown for a selected node, a confident `CPU 0%`, a second filled primary, `1 turns`, `svc`, the granted/not-connected contradiction, a raw temp path, the squeezed starter workflow, the new kinds' labels and sublabels) and twenty-one declined BY NAME in the ledger with the rule and the consequence — including `palette-dark`'s light chrome, owed with a hand check | ✅ done |
| M192 | v9 Act VIII — 5.0.0: the version, the local tag `v5.0.0`, `docs/release-notes/5.0.0.md`, README and `CLAUDE.md` reconciled (the 5.0 destination as four pinned rules), `docs/getting-started.md`, and the three verification commands green with their tallies in the ledger; nothing pushed, no GitHub release, no remote object | ✅ done |
| M193 | v10 D01 — the reconcile: the baseline read at `v5.0.0` (the product audit's `4.1.0`/`85edd91` snapshot is historical), the five audit findings reproduced at HEAD with a file and a line each — a chat's `cwd` denied by `useFileTree`/`useInspectorDetail` while `review:*` answers for it, a preview reload that reads no part of the file event, `wants-you` reserved and unreachable, a run dropped when its last panel closes, two `catch {}`s that report a reader failure as no matches — plus a sixth found in the reconcile (`RailTailKind`'s `note` now carries M27's file AND M187's kind in one literal); the eight journeys walked from source and goldens with confusion claimed nowhere; D02–D20 mapped to M194–M224; the entity, density and note/sticky/text/frame contract adopted — `docs/build-log/m193-m224-ledger.md` | ✅ done |
| M194 | v10 D02 — selected chat context in Files and Tools: one pure `inspectionDirectory` policy the Files pane, the inspector's Tools section, the Open toolbox verb and the Skills pane all ASK (four hand-written copies had drifted; `context.policy.4` reads the call sites as text so a fifth cannot land green), with four arms rather than three — a kind with no directory carries NO sentence so each surface keeps the specific one it already had, a sandboxed conversation and an unusable directory each get their own, and both surfaces refuse a relative cwd identically; a fourth `ToolInventoryResult` arm (`unavailable`) so a FAILED read stops wearing `no directory`'s costume at six sites; main's `toolbox:read` validating without the spawn resolver's fallback to `$HOME`; subject-keyed Files and Tools reads an obsolete reply cannot repopulate; and the file rows the pane gained for a chat wired to its composer rather than to a session that does not exist — `docs/build-log/m194-d02-selected-chat-context.md` | ✅ done |
| M195 | v10 D03 — previews bound to the work they preview: a `preview: { root, sourcePanelId? }` association on the browser record (absent on every earlier pane and meaning bound to nothing; malformed costs the FIELD, never the panel), and a pure five-arm reload rule — `unbound`, `not-local` (M186's loopback finding, now named), `no-path`, `outside`, reload — replacing an effect whose callback took NO PARAMETER, so every loopback pane reloaded on every open file panel's change and two local projects reloaded one another (three real servers count the loads: 2/2/2 before, 2/1/1 after); ONE subscription for the canvas over the ON-SCREEN panels with a 300 ms coalesce PER PANE, reaching each guest through the store's own reload door; segment-boundary containment (`/a/b` does not hold `/a/bc`) hand-written because the renderer cannot bundle `node:path`; the binding taken from the same subject rule discovery reads, with `preview-bind` as its fifth verb and four doors; and no IPC change, because the event's `panelId` plus the panel array already name the changed file — `docs/build-log/m195-d03-preview-ownership.md` | ✅ done |
| M196 | v10 D04 — one policy for repository, worktree lane and memory scope: `rev-parse --show-toplevel` inside a linked worktree answers the LANE (measured, from the lane and from a subdirectory of it), so every door that asked only that question treated a lane as a repository of its own — silently, because each then returned a plausible non-empty answer. `shared/work-scope.ts` is the pure half (`WorkScope`'s three arms, segment-boundary containment `preview.ts` now DELEGATES to, `laneOfPath` taking the LONGEST record) and `main/work-scope.ts` the one resolver, asking the app's worktree RECORD first (the only source of a branch) and `--git-common-dir` second (the only thing that knows an EXTERNALLY created worktree); `memoryRoot` becomes `memoryScope`, so a dispatched teammate's memories key the REPOSITORY instead of a second JSONL under the app's worktrees directory, and git DECLINING is refused by name rather than written to a stray slug; `laneRootOf` replaces exact-path matching at main's three `worktreeRootOf` sites with no widening (the subject stays the record's own root, and the fence check proves a bare `startsWith` would have ALLOWED an unrecorded directory through the lane's repository); and four surfaces state the scope — the memory node's resolved root and lane line, the composer's disclosure naming the repository, the inspector's `chat-repository`/`chat-lane` rows, and the skills door's lane REFUSAL (D02's inherited item) becoming a translation plus a statement — `docs/build-log/m196-d04-scope-policy.md` | ✅ done |
| M197 | v10 D05 (first half) — one Start work action, and every door a route into it: `dispatchWorkItem`'s `root` argument had NO caller in the whole app (four call sites, all passing two arguments), so `board-lane.ts` refused a typed or Jira item with a sentence naming a choice no surface offered — only a GitHub item whose clone already sat under a teammate's place could start at all. `renderer/palette/start-work.ts` is the pure model: a start is a TRIPLE (task, agent, repository) asked in that order because it is a DEPENDENCY — the repositories on offer are the chosen teammate's places' clones — and an EMPTY needs list is the dispatch-without-a-sheet signal, so M114's one-gesture drop stays one gesture; `resolveRepository` has three arms (`auto`, `ambiguous`, `none`) because *derive it*, *ask which* and *ask for any* are three fixes. `board-repo.ts` gains `repositoriesUnderPlaces` (the SAME bounded one-level walk the lane makes, asked for all of them, with `isRepoRoot` as a SECOND reader rather than a widening of `originOf`, which answers null for two different facts) behind one new read-only invoke, `board:repositories`, whose three arms keep `no-places` (fix: a folder) apart from an empty `repos` (fix: a clone). `StartWorkSheet.tsx` states the triple before anything is minted, offers a placeless teammate DISABLED by name and routes to the Teammates pane rather than widening a grant from inside a start; and the verb ANSWERS — the agent's `dispatch` arm awaits it instead of returning `ran` before the work could fail, and the first send's refusal (M82's budget stores nothing) becomes a note through `sendRefusalSentence` — `docs/build-log/m197-d05-start-work.md` | ✅ done |
| M198 | v10 D05 close — Start work is idempotent and recoverable: simultaneous starts join one promise; the lane's conversation/worktree association is persisted before agent creation; refused create and refused first-send retries reuse the same lane and conversation; a repeat revalidates teammate/place authority through main before returning the standing result — `docs/build-log/m198-d05-start-recovery.md` | ✅ done |
| M199 | v10 D06 run truth — `shared/run-outcome.ts` projects immutable run definitions and mappings with live session, queue, attention and ordered approval facts into distinct execution, queue reason, blocker and result fields. A turn, exit 0, failure, stop, skip and missing outcome remain distinct; live request ids are never persisted — `docs/build-log/m199-m200-d06-supervision.md` | ✅ done |
| M200 | v10 D06 supervision surfaces — selected workflow runs and linked work cards consume M199's projection, name the exact blocking node/tool/argument, answer through the existing approval authority, distinguish in-flight and concurrency queues, and keep `turn complete`, `exit 0`, and `run ended` neutral and separate from the work item's user-set disposition — `docs/build-log/m199-m200-d06-supervision.md` | ✅ done |
| M201 | v10 D07 review readiness — local review readiness becomes a fact of its own, and the board's `review` state keeps meaning a pull request exists. `shared/review-readiness.ts` keeps two axes apart: what is true of the task now (no lane, lane missing, unreadable, blocked, working, empty, shared, ready) and what the person already did (none, current, stale), so a task can be working AND stale at once. Command evidence is attributed by who watched the exit — this canvas read the code, or the agent's CLI reported it — and nothing is classified as a check by pattern. One persisted fact: the review's timestamp, its diff-shape signature and its file count — `docs/build-log/m201-m202-d07-review-handoff.md` | ✅ done |
| M202 | v10 D07 review handoff — the card offers Start, Resume, Answer or Review from the facts, beside an unchanged board disposition; `review-task` opens the lane's review with the task on it, showing the handoff word, what was run and who says so, the agent's account labelled as an account, any unresolved question, `Mark reviewed` (a person's act, deliberately with no verb, palette row or agent line) and a route back that inserts into the lane's conversation and never sends — `docs/build-log/m201-m202-d07-review-handoff.md` | ✅ done |
| M203 | v10 D08 show this task — a task's members are DERIVED from facts that already have an authority (the card, its conversation, the lane's record and directory, reviews opened for it, one-hop links, shared runs) and never from position or storage; `show-task` frames them through the camera trail from the card or any member, refuses by name for a panel in no task or in two, and moves, selects, wakes and stops nothing; four doors — `docs/build-log/m203-m204-d08-task-navigation.md` |
| M204 | v10 D08 show related, the far overview and arrange — a task lens rings the members and veils the rest with a declared token (paint only, no box moves), with a bar naming the task and what is missing; a work card's far view carries the execution word, the pending question, the readiness word and the files changed; `arrange-task` compacts the task clear of every other panel as one undo, keeps locked, maximised and folded members in place, carries an anchored card with its conversation, and frames the result — `docs/build-log/m203-m204-d08-task-navigation.md` |
| M205 | v10 D09 intent-led onboarding — the launcher asks what you want to work on and in which repository, and its primary is D05's Start work: a teammate reused by path-segment containment or minted with exactly the typed folder (the grant stated before it is made), a typed task, a lane and a conversation whose first message is the sentence; the repository question is asked before any mint, a subfolder, a missing path and a plain folder each refuse by name; one alternative (a conversation with no folder); every other door behind `More ways to start`, the starter optional and never laid out by the primary — `docs/build-log/m205-d09-intent-led-onboarding.md` |
| M206 | v10 D10 shell language — Connections for service credentials; object/task panel groups for Files, Work, Workflows and Capabilities — `docs/build-log/m206-m208-d10-hierarchy.md` |
| M207 | v10 D10 contextual inspector — the selected kind's next action stays visible while generic layout/configuration verbs remain reachable through disclosure — `docs/build-log/m206-m208-d10-hierarchy.md` |
| M208 | v10 D10 workflow hierarchy — one primary Run, disclosed secondary actions, sentence-case GitHub state metadata and recorded audit reconciliation — `docs/build-log/m206-m208-d10-hierarchy.md` |
| M211 | v10 D12 artifact provenance — ordinary images keep optional immutable capture/file/tool provenance separate from their mutable titles; capture URL and identity survive a rename and are visible in the inspector — `docs/build-log/m211-m212-d12-artifacts-decisions.md` | ✅ done |
| M212 | v10 D12 decision capture — an assistant answer is previewed with its repository-memory scope and saved only on explicit confirmation through the existing redacted memory store, retaining conversation, turn, task and acceptance-time references — `docs/build-log/m211-m212-d12-artifacts-decisions.md` | ✅ done |

| M225 | v11 Act 0 — the baseline: `verify` exit 0 across 38 suites and `verify:packaged` 12/12 pasted before a line changed; all 58 goldens walked by four fresh-context critics with one sentence each on what is flat; and the zero-diff proof, which caught two goldens M202 had left stale on `main` (rebaselined through the full gate, attributed to M202) and an ephemeral port the shot fixture baked into every capture under both budgets — `docs/build-log/m225-m229-act0-act1-material.md` | ✅ done |
| M226 | v11 Act 0 — the Obsidian-amplified brief: the four-level elevation scale in both themes, the rim recipe, the edge-flow state table with the EXISTING source of each of its six signals, the chromeless frame rule with its per-kind exception list, the motion budget and its reduced-motion arm, and the aura's activity term with its budget; every M225 finding carrying FIX-in-act-N or DECLINE-with-a-reason — `docs/superpowers/specs/2026-09-09-m226-obsidian-amplified-brief.md` | ✅ done |
| M227 | v11 Act I — the depth tokens, landed ALONE so their inertness is provable: `--glass-0`, `--glass-3`, `--rim-inner` in both blocks with `--glass-1`/`--glass-2` untouched, `depth.1` (elevation is monotonic — a surface sits on `--glass-N` only inside a surface below N, a containment test over selector text whose prefix arm requires a combinator or `.pf` would "contain" its own BEM sibling), `obsidian.1`'s floor extended; `UPDATE_GOLDENS=1 verify:visual` kept 56 goldens byte for byte — `docs/build-log/m227-pure-red-evidence.md` | ✅ done |
| M228 | v11 Act I — the rim pair applied, and three findings no text check could produce: `box-shadow: inset` on `.panel__slot` painted NOTHING (xterm's canvases are the slot's content) so the recess moved to `::after` at z-index 11; `--rim` was a second name for `--edge-light` and is STRUCK with the measurement; and both paint checks were VACUOUS until rewritten as differentials with `elementFromPoint`-validated sample points. `verify:visual` reported 60/60 with the pair on every panel — a hairline is under both budgets by arithmetic, so the scenes it answers were forced through the gate by hand — `docs/build-log/m228-pure-red-evidence.md` | ✅ done |
| M229 | v11 Act I — light that responds: the aura answers `wants-you` (amber) and an open run (blue) through ONE registered custom property on the ONE element already there, with an idle canvas byte-identical to before; `@property` because a gradient cannot be transitioned and an unregistered custom property cannot either — a plain `transition: background` here does nothing, silently; `aura.1` carries a BUDGET arm (no activity state may buy a layer, a filter or an animation) and `aura.paint.1` drives the state and reads the compositor at the aura's centre — `docs/build-log/m225-m229-act0-act1-material.md` | ✅ done |
| M230 | v11 Act II — `shared/edge-activity.ts`, the pure model: six states keyed `from:to`, each PROJECTED from a signal the app already computes (`componentOf`'s run component, `useHandoff`'s fired/arrived records, `joinAdvance`'s owed sources, `panelState`'s `needs you`) — nothing here subscribes to anything new. `blocked` outranks a live fire deliberately, because a packet crossing into a panel that is asking a person a question is a lie about what the app is doing; a fire EXPIRES so a canvas left open all day is not still animating breakfast; a malformed timestamp costs that edge and never the collection; and `edgesAnimate` is the predicate that lets the layer run no rAF at all while nothing moves. The brief's "unarrived edges stay at rest" was ambiguous against a state also called `rest`, and is resolved as "stay STILL" with the reason recorded — keeping three readings apart (breathing, lifted-static, quiet) where the literal one offered two — `docs/build-log/m230-pure-red-evidence.md` | ✅ done |
| M231 | v11 Act II — the edge store: module-level, subscribed PER EDGE, snapshot objects cached, cleared at all four panel-removing call sites and on a workspace switch (which closes nothing, so the per-panel path would never fire). It must NOT ride `registry.version()` — that counter carries tier/status/focus/exit and deliberately nothing higher-frequency, and edge activity is the high-frequency thing that rule exists to keep off it. The store holds the STATE and the layer owns the ANIMATION: a firing packet's `t` changes every frame, so `same()` deliberately does not compare it, or every frame would notify every subscriber — `docs/build-log/m231-m233-act2-edges.md` | ✅ done |
| M232 | v11 Act II — the layer: one shared rAF for the whole layer and NONE while nothing moves, five of six states pure CSS on the line that already existed, the packet placed by the same analytic Bézier the label uses. Three defects found by LOOKING at the new scene and none by a check — the far-tier cull was INVERTED (`tail` is the nearest tier; taken literally the grammar was disabled at 100% and left running across a hundred cards at 8%, silently, because a feature that never animates looks exactly like one that is idle), the arrowhead stayed grey on a lit line (a marker does not inherit its path's stroke), and the packet was painted, correct and invisible twice — once under three panels, once behind the navigator rail — `docs/build-log/m231-m233-act2-edges.md` | ✅ done |
| M233 | v11 Act II — arrival, blocking and reduced motion: the flash reuses `.pf::before` (M109's state edge) so it inherits that element's clipping and inertness rather than growing a second mechanism; the waiting breath is FINITE and rests on a static stroke of its own, because `motion.2` caught the first cut breathing forever and M111's `pulse.1` settled that question already; and reduced motion removes the TRAVEL, not the REPORT — the packet is hidden rather than frozen (a dot parked mid-edge says "something is stuck here", a different and wrong statement) while every state's stroke survives, which is the whole argument for a discrete flow grammar over a continuous tint. Two new scenes, `edge-firing` and `edge-waiting`, because a state with no golden is a state no critic ever sees — `docs/build-log/m231-m233-act2-edges.md` | ✅ done |
| M234 | v11 Act III — the SIGWINCH check, red first: a terminal's chrome is ABSOLUTE over the body, never a box that collapses. The naive version was built deliberately and `chromeless.resize.1` measured what it does — the body went 458→422→458px across one mouse-over, and every one of those is an xterm refit and a SIGWINCH into the running agent, with no error and no other suite red. The check was vacuous twice before it measured anything (it hovered a SELECTED panel, whose chrome shows at rest anyway) and threw once (a helper needs the `wc`, and a check that throws takes every check below it). It now asserts both the MECHANISM and the EFFECT — `docs/build-log/m234-pure-red-evidence.md` | ✅ done |
| M235 | v11 Act III — the frame at rest: a rounded glass rim, a state dot, the name at low emphasis over the first row, content to the edge, controls on hover. The scrim is the TERMINAL'S OWN GROUND (`--well`), not `--chrome-bg`: the first cut used the translucent chrome glass and the agent's first line printed straight through the title so neither could be read. Starting from the colour the terminal is already painting means the band reads as empty terminal rather than an overlay, and text scrolls out from under the name the way a large title works everywhere else. `rim.paint.1` went red the moment the chrome was lifted (0.79 where it had been 15.72) — exactly what M228 wrote it for — and `well.paint.1` is retired with its reason: a chromeless terminal has no housing to sink below | ✅ done |
| M236 | v11 Act III — the frame rule, written down: a kind is chromeless when the object IS its content (terminal; note in text and frame form) and keeps its header when the header carries a fact the body does not repeat — a state word, a count, a path, an address. The test is not how much chrome there is, it is whether removing it hides information. The full per-kind list sits beside the rules it governs in `styles.css`, and the rule plus the absolute-chrome hazard are in `CLAUDE.md`: a rule that is silently per-kind is how the frame drifted before M47 unified it | ✅ done |
| M244 | object creation and the file-backed checklist — `CREATABLE_OBJECTS` is the one creatable-kind list, and the pill row, the palette, the agent line and the action node are each derived from it; a checklist is a Markdown note's VIEW (`source.checklist`), editing recognised task lines and never reserialising the rest, writing through main's compare-and-swap, and treating a change made outside it as a draft to review before editing resumes; an imported checklist writes nothing until read — `docs/build-log/m244-object-creation-checklist.md` |
| M245 | the `sheet` object — a file panel's spreadsheet view (`source.sheet`) over a real .csv/.tsv/.xlsx: a lossless RFC 4180 round trip (BOM, line ending, needless quotes kept), formulas STORED as formulas with a closed grammar (anything else is `#NAME?` and does nothing), a virtualized grid, bytes through an optional `encoding: 'base64'` on the existing file channels, its own Cmd+C/V/Z subscriptions plus `sheetFocused()` in `shouldIgnoreKeys`, and xlsx through SheetJS with every dropped part NAMED from the zip's own entry list before the first save — `docs/build-log/m245-sheet.md` |
| M246 | per-cell draft review — an agent's `sheet-edit` (the agent door carries `caller.panelId`) PROPOSES instead of writing: a draft of old → new items in `SheetView.draft`, persisted with the layout, over an untouched file; a person keeps or discards a cell, a range or all, a keep being one compare-and-swap write of only the kept cells and a discard writing nothing; a change underneath is a conflict named by file and cell, with Rebase; `shared/draft-review.ts` is generic (ids + old/new) so slides can reuse it — `docs/build-log/m246-draft-review.md` |
| M247 | agent → object links — each conversation's tool calls (read through `tool-index.ts`) become one edge per agent and object on the canvas, carrying the strongest fact (a draft pending review, then a write, then a read); derived, never stored, held in a per-agent store off the registry's version counter and forgotten at every panel-removing site; drawn on `link-geometry`'s curve beside `LinkLayer`, bundled at `summary` and hidden at `block`; a draft badge opens the review; a `canvas.agentLinks` toggle through all four doors — `docs/build-log/m247-agent-links.md` |
| M248 | Deck: a Markdown file read as slides (`source.deck`, the checklist's shape, never a new kind). Slides split on `---` outside fences tracked by length; untouched slides are never re-serialised; an agent's or workflow's edit is a per-slide proposal aligned by an LCS on slide hashes and kept or discarded by a person, a moved file being a named conflict, never a merge. The generic `draft-review.ts` is M246's API built first. PDF through a hidden, sandboxed, script-less window, every slide through `outward()` — `docs/build-log/m248-deck.md` | ✅ done |
| M249 | bottom command pill — one input to the orchestrator plus pills to jump to what wants you, zoom to fit and act on the selection; rest shows one meaningful state, focus (Cmd+Shift+Space) records and restores its return target, its own paste/undo subscriptions keep a paste from reaching a focused terminal, and its chrome is absolutely positioned so no panel beneath is resized — `docs/build-log/m249-command-pill.md` | ✅ done |
| M250 | rich note editing and .docx import — a Rich/Source toggle over the same Markdown file that says what it cannot round-trip rather than rewriting it; a .docx converted in main through mammoth into a NEW note beside it (the .docx is only read), pictures through the asset store, every dropped construct named and counted, and the import inert until read — `docs/build-log/m250-notes-docx.md` | ✅ done |
| M251 | a Markdown deck exported to .pptx — built on M248's deck (`splitDeck` + `parseMarkdown`), never a second deck model; `deck-export-pptx` runs in main over the real pptxgenjs, headings to titles, lists to bullets, pictures (decided by magic number) embedded, `<!-- notes -->` to speaker notes; every string scrubbed field by field and counted, `main/deck-export.ts` the seventh named `redactSecrets` caller, and every construct a slide cannot hold named with its slide in the sentence; four doors — `docs/build-log/m251-deck-pptx-export.md` | ✅ done |
| M252 | describe a tool — a description becomes a workflow of existing node kinds or a preview-backed mini app through ONE headless run given no tools (`--tools ""`, a JSON schema), whose answer is only data; what arrives is INERT — a workflow saved `reviewed: false` with its action blocks refused by name, an app's pane with no guest and its Open and dev server refused — until a person presses "I've read this", which has no verb, row, agent line or node; its reach (folder, addresses, commands) is shown on the object and in the inspector before the first run; four doors through one creatable kind — `docs/build-log/m252-describe-a-tool.md` | ✅ done |
| M253 | Packs, Phase A — one discipline's workflows, saved prompts and presets in one `.tcpack` file, READ before anything is added. `pack:read` holds the parse under a token and `pack:add` takes only the token, so what is added is exactly what was shown; every workflow and preset arrives unread, and an unread preset is refused by name at every spawn door in main. The manifest names each credential by service and FIELD (never a value) and the preview says what is missing per field; an unknown service is kept, not dropped. Phase B (a dev-relations pack on the existing GitHub credential) is sketched, not built. |
| M255 | Packs, Phase B — the dev-relations sample pack (`docs/packs/dev-relations.tcpack`, from `shared/devrel-pack.ts`): four workflows that DRAFT release notes, changelog entries, announcements and PR comments into files, four prompts, two read-only presets. Publishing is a person's act: `github:publish` resolves the repo from the draft's own origin, passes the body through `outward()`, and the system's own dialog asks every time before one broker call with `personConfirmed`. And the broker gap it exposed is closed: a write with no teammate's per-request card and no person's confirmation is refused `not-asked` before the token is read. |
| M256 | documents and the Skills workspace — document focus, reading mode / Escape leave-draft, and skill surfaces — `docs/build-log/m256-documents-and-skills.md` |
| M257 | shell and navigator clarity — `+ Create`, active workspace/task breadcrumb, retrieval-oriented global search and a single View menu; a grouped dock that expands to a labeled rail at Wide; live navigator filters, remembered collapsible sections, contextual row marks and an amber needs-you wash — `docs/build-log/m257-shell-navigation-clarity.md` |
| M258 | Navigation and object identity — the minimap on an opaque raised backing with a hover-only legend, a camera rectangle you grab and drag to pan (pure `minimapPanViewport`), one navigation cluster above the zoom pill on wide windows, a zoom readout shown only while zooming or away from 100%, and a `fit-task` verb on all four doors that frames the active task. Frames get a keyboard-reachable ⋯ menu with Fill view, an icon for the old `fill` word, a fixed glyph column, header drag slop, per-kind interiors, dashed compact dormant cards, and a `paused 3m` signal from an observed transition. |
| M259 | the workflow editor and the work surfaces, reshaped — one toolbar (Run, Add node, Edit trigger, History) with reasons in a status popover; a left node library that closes after a placement; blocks with a glyph, a kind strip and a family tint; 2px curved edges with their trigger on the curve; lineage lit on select; incomplete blocks and refused wires shown on the graph; auto layout (both directions) as ONE draft step; ports on hover; a grouped, sentence-case node inspector; a History drawer whose run timeline maps back to blocks; one traveling highlight over a finished path, then quiet checks. The board widens with real cards and visible drop targets; GitHub, Jira, the board and the canvas share one state vocabulary (`providerState`); failures are one contained banner with a primary recovery; Connections reads as activity with HTTP behind a disclosure; lists and card copies say how fresh they are; board and Jira moves are optimistic with success or rollback — `docs/build-log/m259-workflow-board.md` | 🔨 built, gate owed |
| M262 | the first run as a sequence and one creation surface — the launcher asks what you are working on, which repository (picked, dropped, or from a dated recent list), an agent only when Claude Code cannot be used, then a filled Start task beside Start a general chat; notices under the action; examples about the chosen repository; the first start framed as a card-and-agent cluster; gesture hints taught one at a time after an attempt. Start work and New panel share a Task \| Panel header (task first), plain labels, per-kind explanations, the runtime's defaults said, environment under Advanced, Cancel beside a filled primary — `docs/build-log/m262-first-run-and-creation-forms.md` | ✅ done |
| M263 | feel reshape beat 1 — create collapse: occupied canvas is one Create + into the shared sheet; empty canvas is Start work · Ask · Create…; no permanent creatable-kind pill band — `docs/build-log/m263-create-collapse.md` | ✅ done |
| M264 | feel reshape beat 2 — Fit task lights the sticky related lens; Fit task is the primary HUD zoom control; pill rest gains a task sentence when the lens is on — `docs/build-log/m264-task-stage.md` | ✅ done |
| M265 | feel reshape beat 3 — one attention story: pill says chats need you; suppress duplicate in-app queue-count toasts when the pill already owns that sentence — `docs/build-log/m265-attention-story.md` | ✅ done |
| M266 | feel reshape beat 4 — teammate · chat · session silhouettes: chat leads as Teammate · place; pill running copy says sessions — `docs/build-log/m266-silhouettes.md` | ✅ done |
| M267 | motion and material — drag weight and settle, a travelling current on firing edges, the summoned command pill, aura depth, a living working signal; a new chat spawns clear of the navigation cluster — `docs/build-log/m267-motion-material.md` | ✅ done |
| M268 | Orchestration center view — dock / TopBar / palette swap the center column between Canvas and Orchestration; canvas stays mounted; HUD aggregates live agents, board tasks, watchers, workflows, machine cost and an activity ring — `docs/build-log/m268-orchestration.md` | ✅ done |
| M269 | Orchestration HUD — denser glass ops view over the M268 page: isometric agent graph with pan/zoom, filterable pool, Dev/Pipeline stages from the board, live/historical activity, PTY/chat tail, real process metrics; selection drives the other panes; jump still returns to the canvas — `docs/build-log/m269-orchestration-hud.md` | ✅ done |
| M270 | Calm task-first shell — contextual inspector, quiet dense chrome, far-view task clusters, rail labels by job in the lit task — `docs/build-log/m270-calm-shell.md` | ✅ done |
| M271 | Orchestration HUD v2 — selection-driven verbs, shared empty states, isometric depth on live/needs-you, orchestration shot scene — `docs/build-log/m271-orchestration-hud-v2.md` | ✅ done |
| M272 | Motion — canvas stays mounted behind Orchestrate, paint-only spawn/demote/wake, finite attention pip, sheet enter matching M267 — `docs/build-log/m272-motion.md` | ✅ done |
| M273 | Resume and navigation — facts-only reopen summary, Show this task / Show related, intent-led empty canvas, search scope honesty — `docs/build-log/m273-resume-nav.md` | ✅ done |
| M274 | Orchestration deepen O1–O4 — roster keyboard, transition-only edge current, task frame, blocker strip, metric lens, honest hub, stale samples; O5/AO held — `docs/build-log/m274-orchestration-deepen.md` | ✅ done |
| M275 | Swarm start-work presets — Explore / Implement / Test / Review as reviewed arrangements on one Start work: a supervisor hub, workers with roles, authored handoff edges, worktrees only where isolation is called for, named refusals — `docs/build-log/m275-swarm-presets.md` | ✅ done |
| M276 | Monaco in the file panel — the draft surface stops being a textarea, worker bundled locally, CSP untouched; the checks drive the real editor rather than a mirror textarea — `docs/build-log/m276-monaco-file-editor.md` | ✅ done |
| M277 | zod at the two boundaries that had no reader, charts that required inventing the history first, one-shot toasts for outcomes with nowhere to go — each library confined to a named door, none displacing a working reader — `docs/build-log/m277-libraries.md` | ✅ done |
| M279 | The UI evolution — a navy dark material with cyan and electric-blue illumination and a violet family accent, styled primitives (pill, status dot, segmented control, tabs), live agent status in the top bar, a chat's phase word beside its state, a resizable navigator, a windowed file tree, and an inspector Activity tab fed from the canvas level — no new dependency; planned in `docs/ui-evolution-plan.md`, ledger `docs/build-log/m279-ui-evolution.md` | ✅ done |
| M280 | The Orchestrate diorama's bloom pass — real HDR post-processing on the agent cubes behind a confined `postprocessing` door that costs the first chunk nothing, additive light pools on the floor under working agents, a hub crystal, edge ribbons and stage atmosphere, and a card that says the kind the satellite plates stopped repeating; plus `orchestration-working`, the first scene in which any of it is visible — `docs/build-log/m280-orchestration-bloom.md` | ✅ done |
| M281 | Orchestrate dark HUD glass over the blooming diorama, a task stage fill measured from real stage position rather than estimated completion, and (C1) `orchPhase` as the one reader of a chat's phase — `Thinking…` / `Using · <tool>` / `Last tool:`, whose input type carries no `text` so a thinking block's contents cannot reach the HUD — [log](docs/build-log/m281-orchestration-hud.md) | ✅ done |
| M282 | Orchestrate jump cards — the bottom strip gains Terminal, Code and Files previews that select and jump to canvas panels, with no embedded xterm or Monaco and no `file:read`; Deployments declined for want of a provider. Its closeout carries the goldens and the gate for the whole reference track — [log](docs/build-log/m282-orchestration-jump-cards.md) | ✅ done |
| M283 | Orchestrate Phase A — the Canvas / Orchestrate page boundary: the covered canvas stays mounted, inert and deaf to typing and the edit chords, and returns unchanged — [log](docs/build-log/m283-m284-orchestrate-phase-a.md) | ✅ done |
| M284 | Orchestrate Phase A — one real task island: goal, repository and branch; inspector, Needs attention with real permission answers, output mirror, review, Open on canvas, keyboard list — [log](docs/build-log/m283-m284-orchestrate-phase-a.md) | ✅ done |
| M285 | Orchestrate Phase B — review content identity: base revision plus a hash of the diff's bytes under a written snapshot policy, computed in main, persisted on the mark compatibly (an old mark reads freshness unknown), re-checked before every commit and discard — [log](docs/build-log/m285-m287-orchestrate-phase-b.md) | ✅ done |
| M286 | Orchestrate Phase B — revision-bound check evidence: one record per check with its command, context, outcome, timestamp and the identity it tested, from the run ledger and watcher outcomes; stale when the subject moved; a transcript claim is a claim, never a result — [log](docs/build-log/m285-m287-orchestrate-phase-b.md) | ✅ done |
| M287 | Orchestrate Phase B — the resizable Changes · Checks · Output workbench, bound to the selection or pinned by name, sized and tabbed per workspace; brief and acceptance criteria on a task; unavailable data said — [log](docs/build-log/m285-m287-orchestrate-phase-b.md) | ✅ done |
| M288 | Orchestrate Phase C — many islands with honest review subjects: one island per task or execution context, grouped by the repository and worktree real paths derive; every workbench read bound to the subject it was asked for, late and out-of-order answers dropped; a shared directory said with its writer count; placement append-only and persisted — [log](docs/build-log/m288-m290-orchestrate-phase-c.md) | ✅ done |
| M289 | Orchestrate Phase C — the typed dependency lens: authored handoffs as directed connections with their trigger; a focus that dims unrelated work and lists prerequisites, dependents and blockers with the canvas's recorded reason; read-only, said in the UI; a presentation move dispatches nothing and is undoable — [log](docs/build-log/m288-m290-orchestrate-phase-c.md) | ✅ done |
| M290 | Orchestrate Phase C — capability-aware controls and run limits: Interrupt and Retry only where the runtime supports them, each saying what it affects; reassign and stop absent by name; concurrency, spend, usage-window and time limits labelled enforced or advisory with their coverage, unknown spend reading Unknown; commit and discard in the workbench through the review executors with the `expect` re-check — [log](docs/build-log/m288-m290-orchestrate-phase-c.md) | ✅ done |
| M291 | Orchestrate Phase D — layered platforms and stable grouping: one illuminated platform per island in the reference's blue-black material with cyan edges (violet a family distinction only); stations, checkpoints and artifacts three shapes and three words; a fixed cell grid over Phase C's append-only order so a new island moves nothing; hit-targets cut to the plate's footprint and checked with `elementFromPoint` at three zooms — [log](docs/build-log/m291-m293-orchestrate-phase-d.md) | ✅ done |
| M292 | Orchestrate Phase D — semantic zoom (task summary → stations → evidence, a waiting station never hidden), a minimap, a breadcrumb, Fit all / Fit selected / Back; fixtures of 1, 6, 25 and 100 sessions measured for frame time and memory; adaptive quality from the measured frame (shared geometry, bounded labels, a bloom that degrades before it stalls); `three`'s importer set pinned and the chunk read from a real build — [log](docs/build-log/m291-m293-orchestrate-phase-d.md) | ✅ done |
| M293 | Orchestrate Phase D — parity and fallback: a sortable List of every scene object with the scene's actions; arrow keys walk the platforms, Enter inspects, double-click focuses an island; WebGL denied for real and reduced motion both keep every essential action; narrow and dark checked — [log](docs/build-log/m291-m293-orchestrate-phase-d.md) | ✅ done |
| M294 | Orchestrate scene pass — the platform scene looks like the reference again: isometric diamond platforms in three emissive-rimmed tiers, a polygon hit rule cut to the mesh's silhouette, names on stations at rest by density tier, grouping connectors (no hub, finite motion), a zig-zag lattice that fills the stage's height, and a selection lift that can be seen — [log](docs/build-log/m294-orchestrate-scene.md) | ✅ done |
| M298 | Orchestrate fit pass — the composition fills the real scene panel at every count and window size: the stage follows the panel's aspect (no letterbox), label margins in pixels, Fit all's own zoom floor, a pyramid lattice past the first band, the camera tools in a rail beside the scene, a lone platform fitted on first paint; measured at 1–100 platforms across three window sizes and pinned (`orch-fit.*`, `orch-fit.app.1`). |
| M299 | Orchestrate chrome pass — the frame around the scene matches the reference: a title row (`Orchestrate / <workspace>` and the focused task's context line) replaces M269's greeting and clocks; mixed-case metric tiles that each carry their one next action and go quiet at zero; the side column is two cards — Needs attention (dot, title, reason, action) and the selected-agent card (role line, Selected chip, task, status box, acceptance criteria as rows, the M290 controls, a follow-up composer on the chat's own send door); Run limits and the absence fold are one quiet row each; M282's five bottom tiles are gone and the workbench rests OPEN at its height — the scene panel grew, measured. [Ledger](docs/build-log/m299-orchestrate-chrome.md). |
| M300 | Orchestrate Phase E, the durable record — an `EventRow` and a trim-written `GapRow` riding run-ledger.ts's own append stream (one queue, one ring trim), references only and enforced by the type; `ledger:timeline` merges command rows, events and gaps newest-first and says whether it reached the start; `ledger:event` is main's append-only write door, its `kind` main's own. The workbench's tab list goes three → five: **Artifacts** (references grouped by execution, opened live on the canvas) and **Timeline** (the durable record, distinguished in words from the in-memory activity ring), each subject-bound, read-only, and explicit about a gap, an unwired door or a record with nothing in it. The renderer writes through ONE door (`orch-record.ts`, importer set pinned) at the four moments it owns a fact main cannot see. [Ledger](docs/build-log/m300-m302-orchestrate-phase-e.md). |
| M301 | Orchestrate Phase E, restart reconciliation. [Ledger](docs/build-log/m300-m302-orchestrate-phase-e.md). |
| M302 | Orchestrate Phase E, reusable arrangements and saved views. [Ledger](docs/build-log/m300-m302-orchestrate-phase-e.md). |
| M304 | Orchestrate **Watch** — a third lens: a perspective, orbitable three.js scene of what the sessions are DOING, read from their tool calls (`orchestration-live.ts`, pure): each file a session read or wrote is a tower of written lines (green added, red removed, labelled), a write flies its first line — scrubbed through `outward()` — from the session to the tower, a command rises from its station and resolves green or red from its `tool_result`, and a file two sessions wrote wears an amber ring. History stands and never replays; lazy chunk, demand frameloop, the one bloom door. [Ledger](docs/build-log/m304-m305-orchestrate-watch.md). |
| M305 | Orchestrate task chrome — a task header (the goal as the title in the display serif, placement and blocker on one line, the board's four words as a stage rail, Review changes as the one primary) replaces M299's title row, count tiles, blocker strip and command row; the roster is grouped by state with each count as its group's header (and the metric lens's door); Needs you is a card only when something does; the Changes tab opens its first diff. [Ledger](docs/build-log/m304-m305-orchestrate-watch.md). |
| M306 | A check run keeps its EXACT output — one record per run in `check-output/` (head and tail kept, the elided middle counted), referenced from the ledger row by `outputId` so `runs.jsonl` stays metadata; watcher runs and login-shell commands (between OSC 133 C and D) both captured; `check:output` opens a run's command, directory, time, exit and tested revision wherever a check is shown. [Ledger](docs/build-log/m306-m310-flagship-flow.md). |
| M307 | The review, together — line comments on the diff (numbered `DiffLine`s), saved on the task; a follow-up composed from open comments, failing checks' own last lines and unconfirmed criteria, shown whole before Send; acceptance criteria as a checklist; and **finished ≠ verified** — `verificationOf` names what is missing. [Ledger](docs/build-log/m306-m310-flagship-flow.md). |
| M308 | Needs you as a decision inbox — each item's blocker, context and wait, ranked by what deciding it unblocks over hand-offs, identical requests grouped with Allow all once, snooze as a view (badge counts the unsnoozed; ⌘J follows the inbox). [Ledger](docs/build-log/m306-m310-flagship-flow.md). |
| M309 | The return briefing — last seen kept per viewer; after an absence, per task: what finished (each run opening its own output), what changed, what needs a decision, and next — in the Resume banner's slot. [Ledger](docs/build-log/m306-m310-flagship-flow.md). |
| M310 | The flagship joins — Start work from an open issue with an outcome and criteria the agent is sent; Run checks and Open pull request (its body carrying the evidence, through `outward`) from the review; the task's chain in the Inspector; the first-task hint grown into a five-step guide. [Ledger](docs/build-log/m306-m310-flagship-flow.md). |
| M311 | Parallel work, safe to combine — Orchestrate's Combine tab names files changed in more than one lane (separate checkouts, a review path) apart from sessions sharing one checkout (contention, a hazard now), proposes an integration order that honours hand-offs, and applies every lane in that order into a scratch checkout (`combine:run`, no lane touched) to run checks on the combined tree; Watch keys files by checkout and lists shared writes with their verb. [Ledger](docs/build-log/m311-m314-workflow-kit.md). |
| M312 | Repository setup, saved once — install, services, checks, ports and preview per repository (`setup:*`), detected as a draft nothing runs, and run in each new lane BEFORE its agent starts; a failed step stops the start with its output kept, each lane gets its own port span, and the agent is told its environment. [Ledger](docs/build-log/m311-m314-workflow-kit.md). |
| M313 | Meet the editor and the shell — a file at a line or a worktree in the person's editor (`editor:open`, Settings ▸ Open files in; ⌘⇧E; a double-clicked diff line; a Cmd-clicked `path:line`), and `tc task` / `terminal-canvas://task` open Start work filled in, starting nothing. [Ledger](docs/build-log/m311-m314-workflow-kit.md). |
| M314 | Workflow recipes — Fix a failing test, Implement an issue, Review a change, Investigate a bug, each carrying context, checks and deliverables onto the task and into the first message; a task is saved as the person's own recipe with the checks that passed (`recipe:*`). [Ledger](docs/build-log/m311-m314-workflow-kit.md). |
| M315 | Shippable pass on the primary journey — delegate, steer, review, accept: a task's review is the lane's own diff (file list beside the diff, line comments) and opens in view; Accept merges the lane into the main tree's branch after a plan naming both branches, refusing by name on dirty trees and aborting on conflicts (`lane:merge`). [Ledger](docs/build-log/m315-shippable-pass.md). |
| M316 | Task-level recovery: the pool's job journal (per-item attempts, queue position, dependencies, completion evidence) written through to disk, reconciled at reopen against live workers, transcripts and git, with reconnect / continue / retry / abandon that never re-run a finished item or a sent one unasked; handoff runs cut off by a relaunch continue from the mid-step panels (`job:list`, `job:recover`). [Ledger](docs/build-log/m316-job-recovery.md). |
| M317 | Finishing parallel work — a combined result records each lane's content fingerprint and goes out of date when any input moves; a conflict or a failed combined check is traced to the tasks and files involved and sent back, scoped, to the responsible agent; **Integrate** re-reads every witness and lands the checked lanes in order, keeping a receipt that says what landed, which check witnessed it, and whether the landed tree is the checked one (`combine:inputs`, `combine:integrate`, `combine:receipts`). [Ledger](docs/build-log/m317-m318-integration-and-decisions.md). |
| M318 | A task-centered decision queue — Needs you grouped by task, each saying why it is stopped, its next step, what happens after and which tasks wait on it; failed checks, unreviewed changes and decisions a restart lost join permissions and questions; ↑↓/↩ walk from a decision to its evidence and ⌥⌘J comes back; activity feeds mark what needs a person apart from information. [Ledger](docs/build-log/m317-m318-integration-and-decisions.md). |
| M319 | Backend fit before work starts: Start work offers a backend and lists only the capabilities THIS task touches (appended prompt, enforced no-push, interrupt, resume, images, known cost, read-only), refusing a required one it lacks; interrupt, cancel queued and end process are three separate acts (`agent:cancel-queued`, `agent:terminate`); a reviewed text hand-off continues a chat on another backend; a failed resume is recognised from each CLI's recorded output and the next message starts fresh; a run holding a chat has an unknown cost. [Ledger](docs/build-log/m319-m321-backends-deliverables-recipes.md). |
| M320 | A task's deliverables: files as live references or captured versions (main-side digests at review), captures, check runs, review, merge, receipts and the conversation, each current / modified / missing / superseded / stale / unknown with why and a producer that outlives the panel; search across comments, checks and the record; a hand-off export through the outward gate (`task:evidence`, `task:evidence-index`, `task:export-handoff`). [Ledger](docs/build-log/m319-m321-backends-deliverables-recipes.md). |
| M321 | Portable recipes: embedded paths lifted to `{repository}` and named parameters, versions assigned by the store with history, the exact definition kept on each run, a preflight of tools, setup, capabilities and ports before any worker (`setup:preflight`, `recipe:history`), and a reuse compared with the last successful run. [Ledger](docs/build-log/m319-m321-backends-deliverables-recipes.md). |
| M322 | Queued messages are instructions a person controls: each waiting message listed with its images, editable and removable until sent; Send after this turn vs Stop and send (first in line, then the interrupt, where the backend has one); a dropped queue marks each message not delivered with why, with Send again / Discard; the unsent draft survives navigation and relaunch (`agent:queue-edit`, `agent:send-correction`). [Ledger](docs/build-log/m322-m324-queue-startwork-focus.md). |
| M323 | Start work opens on project + request: teammate and backend preselected from configuration with a visible Change, criteria/checks/deliverables/arrangements under Options, issue search as the alternate route, the draft kept while setting up a repository or teammate. [Ledger](docs/build-log/m322-m324-queue-startwork-focus.md). |
| M324 | A task's focus view: its conversation beside its changes, checks, review and bound preview, the title, repository, blocker and next action in view; diff-line comments and failed-check follow-ups land in the same conversation; split, side, file and scroll remembered per task; Back returns to the untouched canvas. Opened from the board, the card, the ⋯ menu, the palette and Needs you. [Ledger](docs/build-log/m322-m324-queue-startwork-focus.md). |
| M325 | Orchestrate opens on its tasks: Needs attention, Running, Ready for review and Completed, each row the task, its working agents (idle ones counted), one concrete status sentence, its check results and one action — a permission or a question answered in the row; the scene, Watch and the List become an optional visualisation. [Ledger](docs/build-log/m325-m328-tasks-workspace-plan.md). |
| M326 | The focus view is where a task is worked on: a person's new task and Orchestrate's rows open there; a task switcher, a live activity line, an agent switcher for multi-agent tasks, and Mark reviewed then Accept in the page. [Ledger](docs/build-log/m325-m328-tasks-workspace-plan.md). |
| M327 | A task's execution plan: steps with owner, dependencies, directory, expected output and actual result, derived from the sessions and witnessed checks — stopped responding, finished and verified kept apart — with Start, Assign, Cancel, Retry, Verify and Run beside each step; one implement-and-verify workflow. [Ledger](docs/build-log/m325-m328-tasks-workspace-plan.md). |
| M328 | A restrained visual system: tighter radii, no glow, a neutral ground, sans-serif task headings, one filled action per context. [Ledger](docs/build-log/m325-m328-tasks-workspace-plan.md). |
| M329 | One decision queue: every "needs you" indicator lands on the specific request — a permission opens in the queue, a question's turn scrolls into view, a failed check opens at its output — each decision says what its action affects, and a task keeps the decisions it already had answered. [Ledger](docs/build-log/m329-one-decision-queue.md). |
| M330 | Accounts: GitHub sign-in through Supabase-managed PKCE on a loopback callback, the session in the encrypted credential store and never across the bridge, personal and shared organizations, one-time invites stored as a hash (`auth:*`, `tc login` / `logout` / `invite` / `join`, each socket verb confirmed by the person). [Ledger](docs/build-log/m330-m335-collaboration.md). |
| M331 | Presence: one Yjs doc per workspace on a Hocuspocus server, awareness with a 30 s heartbeat plus live cursor, viewport, selection and agent status at up to 15 Hz, idle and offline judged on the receiver's clock; a roster strip and one cursor-layer canvas (`presence:*`). [Ledger](docs/build-log/m330-m335-collaboration.md). |
| M332 | The Team view: a tile per organization member with health, task and agents; a read-only look at a member's canvas from a scrubbed snapshot carried in the workspace doc while someone watches, and F to follow their viewport (`team:*`). [Ledger](docs/build-log/m330-m335-collaboration.md). |
| M333 | The shared canvas: a workspace shared into an organization with owner / editor / viewer roles, its panels and groups as per-field last-writer-wins maps with tombstones, gestures written through as they happen, teammates' panels as inert placeholders, agent activity in its owner's colour, roles enforced in the renderer, main and `server/collab` (`canvas:op`, `workspace:share*`). [Ledger](docs/build-log/m330-m335-collaboration.md). |
| M334 | Shared text: one Y.Text per shared file panel, bound through y-monaco on a renderer replica whose every update main re-judges, teammates' carets from presence, the disk still the owner's (`text:*`). [Ledger](docs/build-log/m330-m335-collaboration.md). |
| M335 | The pty relay: a terminal on the team's VM that several people attach to and one controls at a time, the token in main and in the subprotocol list, spawning by allowlist, attaching by the share's role, a replay ring with per-viewer backpressure, every hand-off audited (`relay:*`); not yet deployed and not yet a panel kind. [Ledger](docs/build-log/m330-m335-collaboration.md). |
| M336 | The account picker: the top bar's account menu (initials, or Sign in), every account on this Mac as a radio set whose checked one is the account every door acts as, kept in `userData/account-active`; a sign-in or switch restarts presence and tells the renderer (`auth:use`, `auth:status`, `auth:changed`); `tc accounts`, `tc use`. [Ledger](docs/build-log/m336-m338-account-share-relay.md). |
| M337 | Sharing in the app: the share dialog (share into an org, the owner's role picker, open a share here) behind four doors that only open it, and `tc shares/share/open-share/share-role` behind dialogs that name what they act on (`workspace:share-members`). [Ledger](docs/build-log/m336-m338-account-share-relay.md). |
| M338 | The relay terminal as a panel kind: persisted by program, session and share, re-attaching on relaunch rather than spawning twice, off the terminal partition, created through the four creation doors, with its header, New session, clipboard and theme. [Ledger](docs/build-log/m336-m338-account-share-relay.md). |
| M339 | Shared text, both gaps closed: a note in Rich mode is live-bound to its shared Y.Text (a block commit written through as one minimal edit, rebased when a teammate's change landed first; theirs arriving as the whole draft), the owner's draft wins at bind time only for typing no binding carried, and Reload (discard mine) puts the shared text back to the disk's for everyone. [Ledger](docs/build-log/m339-shared-text-rich-and-reload.md). |
| M340 | `verify:visual` is a signal again: `shot.cjs` passes the run ledger at `registerIpcHandlers`' ledger positions (it fed `preview`/`assets` since M300), and the 62 scenes red at HEAD (goldens stale since M315, three written at 2x) were each judged by a fresh-context critic, verbatim in the ledger, before `UPDATE_GOLDENS=1`; the new defects they found are M341's. [Ledger](docs/build-log/m340-visual-gate-and-golden-debt.md). |
| M341 | The defects M340's critics found, fixed and re-judged: the work card's verbs wrap (Done was clipped), a queued message is its tag line with Edit/Remove plus two lines in a box never shorter than one row, `1 other needs nothing`, the ACTIVITY need word in its own grid cell, the shot harness reads the real repository setup, and a panel's ⋯ menu is capped at the visible canvas below it, followed frame by frame while open (`menu.room.1`). [Ledger](docs/build-log/m341-critic-defects.md). |
| M342 | The live Supabase project probed from outside (`npm run supabase:probe`): all eight tables and six RPCs of the three migrations exist, the shipped anon key reads, writes and calls none of them (`42501`, told apart from "not in the schema cache"), GitHub sign-in is on — 37/37 live; the authenticated checks wait on a person's sign-in. [Ledger](docs/build-log/m342-supabase-live-probe.md). |
| M343 | A teammate's relay placeholder offers Attach: a shared relay panel's session id and program name cross the doc as two flat fields only its owner may bind (`relay-bind`, enforced in main and on the collab server), the placeholder says the terminal runs on the team relay, and Attach opens a relay panel beside it joined to that session — the relay still admits by the share's role. [Ledger](docs/build-log/m343-relay-attach-from-placeholder.md). |
| M344 | The relay strip names people from the workspace's presence roster ("sam is in control", "Give control to sam") through the same `useRosterNames` hook the shared placeholders use, falling back to eight characters of the id only for someone outside the roster. [Ledger](docs/build-log/m344-relay-strip-names.md). |
| M345 | A shared workspace in both harnesses (a Members-view golden; sam's placeholders, cursor and relay Attach) and the first REAL click through the account menu, which found that no force-mounted Radix menu row could be selected by a mouse (MotionSurface dropped the slot's ref, so every press inside read as outside), that the share dialog opened unclickable, unfocused and deaf to Escape — all fixed; `reach.1`, red since M277, now passes (`account.click.1`, `share.click.1`). [Ledger](docs/build-log/m345-shared-harness-and-real-clicks.md). |
| M346 | The collab server keeps its rooms: a shared workspace's Y.Doc is stored in Postgres as it changes (a `collab` schema the app's anon key cannot see), loaded before anyone syncs, snapshotted with a bounded history, and served to a teammate after a restart with the owner offline; `GET /healthz`, one JSON log line per event, and `npm run collab` — which could not start since M333 (import.meta.url in a CJS bundle) — runs again. [Ledger](docs/build-log/m346-collab-persistence.md). |
| M347 | Collab operations, built and checked (not deployed — no VM on this Mac): Caddy's automatic TLS on `/collab` in the VM's one Caddyfile, a `Restart=always` hardened unit, a daily node backup with retention and a restore that refuses to clobber a live room, a once-a-minute health step that alerts a webhook on DOWN (after three misses), recovery and error events (at most every 30 min), and `docs/collab.md`; `ops.bundle.1` builds and LOADS the bundles. [Ledger](docs/build-log/m347-collab-operations.md). |
| M348 | Local-first, measured and said: a shared doc's offline edit is kept by main as it happens, survives the app crashing and relaunching, and reaches the teammate and the server's store when it returns (`offline.1/.2`, real providers over a persisted server) — y-indexeddb would be the wrong layer (the doc lives in main); and a shared workspace now SAYS so, a chip under the roster (`Offline — 3 changes waiting to sync`, `Reconnecting…`, `Syncing 2 changes…`, nothing at rest) from the provider's own count. [Ledger](docs/build-log/m348-local-first-sync.md). |
| M349 | Agents as roster citizens: each of a teammate's agents rides their presence payload (a scrubbed title and its state, never a command or transcript) and stands on the roster strip beside them, a tile ringed in the owner's colour, named in full ("claude — tests — sam's agent, working"); an away teammate's agents are not drawn, because their state cannot be known. [Ledger](docs/build-log/m349-agents-roster-citizens.md). |
| M350 | Each agent's own meter and caps, enforced by main outside the agent loop: spend carried across every process it runs (the CLI's figure restarts in a new one, and M82's canvas budget now sums the carried figure), context measured on every message; `agents.nodeCapUsd` and `agents.nodeCapContextK` hold an agent that crosses either (a context crossing interrupts its own turn), refuse its sends in its own figures, keep what it queued, and release at the next send once raised, the held messages first. [Ledger](docs/build-log/m350-node-caps.md). |
| M351 | An agent's own caps on its chat's record (`ChatSource.caps`, figure by figure over the Settings defaults, 0 meaning no cap for that agent), read by main from its SAVED layout, never a renderer's claim, and re-read on every save and cap setting: a raised cap releases a held agent at once with its held messages first, a lowered one holds an idle agent or interrupts a turn in flight; the meter now carries the caps in force and whose they are. [Ledger](docs/build-log/m351-agent-caps-record.md). |
| M352 | `cap-agent <panel> <cap>`, an agent's own caps through all four doors (the Caps fields on the Inspector's Work tab, `Cap this agent…`, `tc plan cap-agent ch1 5usd`, a workflow node), where an agent or a workflow may only LOWER a cap, judged against main's cap in force: raising, removing or resetting one is a person's; the Work tab shows main's meter against the caps and whose each is, and a hold under an agent's own cap names its own fix. [Ledger](docs/build-log/m352-cap-agent-verb.md). |
| M353 | Every Orchestrate shot waits out its Changes pane's `Reading changes…` caption and throws if it never resolves, so a golden written under load can no longer pin a loading caption; the orchestration goldens were re-judged against it. [Ledger](docs/build-log/m353-orchestration-scenes-wait.md). |
| M354 | An agent's meter survives an app relaunch: the transcript meta carries the spend the runtime CARRIED across processes (`spentUsd`, never `costUsd`, which is one process's figure and what an import writes for spend made outside the app), and a re-created chat seeds its spend and its last message's context from it, held at rest when already past its cap, so quitting the app no longer releases a held agent or re-spends a canvas budget. [Ledger](docs/build-log/m354-meter-survives-relaunch.md). |
| M355 | A held agent is a needs-you: main's approval tracker keeps a held set beside pending (entry says `wants-you` and notifies once in the hold's words, an exit or release says `idle`, a relaunch's carried hold is said at create), and the decision queue has a `cap` kind in the hold's own words ("is held at its $2.00 spend cap ($2.10 reported)") read from a holds subscription of its own, because `wants-you` reaches the renderer before the meter that explains it; Orchestrate's row jumps to the agent. [Ledger](docs/build-log/m355-hold-needs-you.md). |
| M356 | A chat's resolved auto chip no longer pushes the header's controls past the panel's clipped edge: the chip shrinks first (`.pf__chrome .pf__word`'s `flex: 0 0 auto` had out-specified it since M121), a resolved chip reads what the run came to (`auto stuck`), which never clips, while its reason gives first, and the `Auto…` door hides while a chip shows; the `inspector-caps` scene keeps the chip and hit-tests every header control inside the frame. [Ledger](docs/build-log/m356-chat-header-chip.md). |
| M363 | The `routine` scene's times are pinned to a clock (`clockAt(6, 6)`, `clockAt(6, 16)`, the most recent such moment) instead of `Date.now()` minus an hour, so its golden no longer pins the hour it was painted; the committed golden is unchanged. [Ledger](docs/build-log/m363-routine-clock.md). |
| M364 | `verify:panels:shell`'s review-node Discard check waits for its restored file without reading it mid-replace: `git checkout` replaces the file, and a bare `readFileSync` in the wait predicate threw ENOENT and ended the part as an infrastructure error under load. [Ledger](docs/build-log/m364-discard-restore-race.md). |
| M357 | A held agent is answered in the decision queue: `Allow $2.00 more` grants the same allowance again from what it reached, through the `cap-agent` verb as a person (`allowMore`), so main releases it and serves what it kept first, and `Stop` ends its process with the conversation and main's hold kept; the `queue-hold` scene clicks Allow and asserts main's answer. [Ledger](docs/build-log/m357-hold-answers.md). |
| M367 | A hold's words wherever a needs-you is said: M199's blocker vocabulary gains a `cap` kind, projected from the hold that now rides each chat's live fact, so the Inspector's next action and blocker line, the resume card and a lane's review node say the agent is held at its cap and how to answer it, never "needs you at its keyboard". [Ledger](docs/build-log/m367-hold-words-everywhere.md). |
| M358 | Plan before execution: claude's `ExitPlanMode` request is read as its plan (Markdown, in its own scroll, in the chat's composer and the queue's detail) and answered `Approve plan` or `Keep planning`, which tells the agent to revise and present it again; no session grant is offered for it, and main refuses one, because a grant would approve every later plan unread. [Ledger](docs/build-log/m358-plan-before-execution.md). |

### What's next — the v10 run (D01–D20)

The roadmap for the work after 5.0.0 is
[the ordered product development guide](docs/product-development-guide-2026-09-08.md), which
executes every recommendation in [the product audit](docs/product-audit-2026-09-08.md). Its twenty
phases are mapped to milestone numbers M193–M224 in
[the v10 ledger](docs/build-log/m193-m224-ledger.md) §5; that ledger, not this table, is where a
phase's status, evidence and disposition live. Rows arrive here as they land, which is why this
table holds no planned work: it is a record, and the guide is the plan.

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
