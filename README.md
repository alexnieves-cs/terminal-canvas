# Terminal Canvas

[![verify](https://github.com/alexnieves-cs/terminal-canvas/actions/workflows/verify.yml/badge.svg)](https://github.com/alexnieves-cs/terminal-canvas/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](#prerequisites)

An infinite canvas where every node is a live terminal running a coding-agent CLI.
Think Figma, but the objects are terminals — and the terminals are running `claude`,
`codex`, or anything else you would type into a shell.

> **Status: beta (`v0.1.0`).** macOS only, Apple Silicon by default. The app is
> unsigned, so Gatekeeper will object the first time you open it — see
> [Install](#install). It is used daily by its author and has not been used by
> anyone else, which is the entire reason it is now public.

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

## Install

### Download the beta

Grab the `.dmg` from [Releases](https://github.com/alexnieves-cs/terminal-canvas/releases),
open it, and drag **Terminal Canvas** to Applications.

The build is **unsigned** — signing requires a paid Apple Developer account, and
this is a beta. macOS will refuse the first launch with *"Terminal Canvas is
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
                       settings:list / settings:set
                       canvas:request-reset
                       agent:acknowledge
                       workspace:list / workspace:create / workspace:rename
                       workspace:delete / workspace:activate
                       workspace:merged / workspace:move-panels
                       review:panel / review:baseline / review:at
                       review:diff / review:commit
                       credential:list / credential:set / credential:delete
                       credential:verify
                       jira:list / jira:transitions
                       jira:comment / jira:transition
                       file:open / file:read / file:close / file:write
                       file:create
                       fs:list
                       toolbox:read / toolbox:permissions
                       diagnostics:sample / diagnostics:export
                       env:report
renderer  <--send---   pty:data (batched ~16ms) / pty:exit                         <--  main
                       agent:state / session:live / subagent:state
                       file:changed / usage:panel / attention:jump
                       settings:changed
main      --send-->    edit:copy / edit:paste / edit:undo / edit:redo              -->  renderer
                       canvas:counts / canvas:reset
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
