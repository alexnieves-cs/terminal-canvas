# Everything Terminal Canvas does

The long list. The [README](../README.md) is the short version and the [user guide](guide/README.md) is the how-to; this page is the reference, moved here from the README in M632.

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
- **Approvals that know what is risky.** A request to run a command that deletes,
  force-pushes, publishes or pipes a download into a shell is labelled high risk
  and asks every time: there is no "Allow for session" for it, and the app will not
  let an earlier session grant answer it. `A`, `Shift+A` and `D` answer a focused
  request.
- **A Run tab on every task.** The task view shows what the agent did, step by step:
  each message you sent, the tool calls under it with their state and how long
  they took, and the picked call's input and result in full.
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
  walked every surface is [docs/dead-end-audit.md](dead-end-audit.md),
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
- **An MCP server.** `tc mcp` speaks the Model Context Protocol on stdio, so
  Claude Code or any MCP client can read the canvas and drive it:
  `claude mcp add terminal-canvas -- "$HOME/Library/Application Support/Terminal Canvas/bin/tc" mcp`.
  Its tools read the canvas, the attention queue and the decision audit,
  propose a task, open a review and send a message to a chat agent. Each is a line on
  the same socket, with the same caps, and every answer is scrubbed on its way
  out. Answering a chat's permission request and accepting a lane are refused
  unless you turn on *Let MCP clients answer approvals and accept work* in
  Settings ▸ Privacy & export; an agent inside a panel is refused either way,
  and each answer goes on the decision record.
- **Your phone buzzes when an agent asks you something.** Set an ntfy topic in
  Settings ▸ Privacy & export and subscribe to it in the free
  [ntfy](https://ntfy.sh) app. When an agent starts waiting on you and the Mac
  has been idle a few minutes, the phone gets its name and question, scrubbed
  and with every path cut to a basename. `tc phone-test` sends one test push.
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
  permissions. Since 2.3.0 the ground is lit by an aura, the frames are glass with one low lift, and the state edge glows.
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
- **Sign its own builds.** See [Install](guide/install.md) for what Gatekeeper says.
- **Run anywhere but macOS.** `tmux` is optional but is what makes agents
  survive a reload or a quit; without it, sessions end with the window.
- **Make the terminals themselves accessible to a screen reader.** The chrome
  is; what an agent CLI draws is that CLI's own — see [Accessibility](features.md#accessibility).
- **Rename a bookmark's saved camera, region-capture the canvas, or export a
  canvas another instance can open.** Export is a panel's text and a PNG of
  the window; the rest is in [docs/ideas-backlog.md](ideas-backlog.md).


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
