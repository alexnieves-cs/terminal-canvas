# Ideas backlog

Unscheduled ideas, captured 2026-08-24. **Nothing here is a commitment** — the
milestone table in `README.md` is still the roadmap contract. This file exists so an
idea doesn't have to be re-derived later, and so the constraint each one collides with
is recorded next to it while that constraint is still fresh.

Each entry notes the *load-bearing detail in `CLAUDE.md` it has to survive*. That is
the expensive part of every one of these — the canvas already has hard-won invariants
(one transform, two lifetimes, Cmd-gated shortcuts, capture-phase wheel ownership) and
a feature that ignores one of them fails silently rather than loudly.

---

## 1. Cmd-held navigation grid

Hold `Cmd` to summon a 3×3 grid at the centre of the screen; arrow keys or the mouse
pick a cell, release to jump. Cells address either canvas regions or whole projects.

- **Why it fits:** `Cmd` is *already* the required modifier for every canvas shortcut
  (`useViewport.ts`), precisely because agent TUIs claim every bare key. A hold-to-reveal
  overlay is the natural extension of a rule the codebase already enforces.
- **Constraint:** a *held* `Cmd` is not the same input as a `Cmd`+key chord. Watch for
  the overlay swallowing `Cmd+C`/`Cmd+V` (one Canvas-level subscription today) and
  `Cmd+wheel` zoom. The reveal probably needs a dwell threshold so a fast `Cmd+N` never
  flashes it.
- **Open question:** what does a cell *mean*? Nine viewport quadrants, nine saved
  bookmarks, and nine workspaces are three different features wearing the same UI.
- **Depends on:** nothing hard. Could land any time after M4b.

## 2. Named, saved canvases (workspaces)

Multiple named canvases — "startup", "school" — each with its own panels. Plus: a
merged all-in-one view, and rubber-band select several panels → right-click → *Move to
new workspace*.

- **Why it fits:** this is M4b (layout persistence) grown a dimension. If M4b's on-disk
  format is written as *one* record of panels, retrofitting N named records is a
  migration; if it's written as a keyed collection from the start, this is nearly free.
- **Constraint:** `LIVE_BUDGET` (8) is a global cap on live WebGL contexts, not a
  per-workspace one. An "all in one canvas" view is exactly the case that would try to
  exceed it — tiering must stay the thing that decides, and switching workspaces must
  demote, not dispose (`dispose` kills the PTY; a hidden workspace's agents should keep
  running).
- **Action for M4b:** even if only one workspace ships, give the persisted file a
  workspace id and a name field. Cheap now, a migration later.

## 3. File tree / codebase browser (IDE-style left rail)

A collapsible left sidebar showing files and structure for the project a panel is
working in.

- **Constraint:** the sidebar lives *outside* the transformed `.world` layer. That is
  the whole point of "one transform, not N layouts" — a chrome element inside the world
  would scale with zoom. It needs to be a sibling of the canvas host, and its width
  changes the canvas viewport size, which feeds `viewport.ts`'s math and every panel's
  culling decision.
- **Constraint:** file reads must happen in **main**, not the renderer. The renderer has
  no `process.env` and no fs; the contract in `shared/ipc-contract.ts` would need new
  channels (`fs:list`, `fs:read`, a watcher for `fs:changed`), and `verify:ipc` will fail
  until every one has a handler.
- **Open question:** which directory? Each panel is a shell that can `cd` anywhere. Either
  a workspace-level root, or track each session's cwd (obtainable from the PTY's pid).

## 4. Multiplayer / shared team canvas

Several people on one canvas, seeing what the others are working on, and whether their
changes have reached GitHub or are still local.

- **Honest assessment:** by far the largest item here, and it is really two features.
  *Presence* (cursors, who has which panel focused) is a modest CRDT-or-just-broadcast
  problem over the existing panel model. *Shared terminals* is a different animal — a
  PTY has one master; two people typing into one is a `tmux`-style multiplexing problem,
  which is exactly what M4c introduces the dependency for.
- **Path of least resistance:** M4c makes sessions tmux-backed. tmux already supports
  multiple clients attached to one session. Shared-canvas-over-SSH-plus-tmux may be a
  far shorter road than building a sync protocol.
- **The git-status half is separable and much cheaper:** per-panel badge for
  ahead/behind/dirty, polled from the panel's cwd. Worth doing on its own regardless of
  multiplayer.

## 5. Agent-state border glow

For a panel running an AI CLI (`claude`, `codex`), a coloured border that says: working,
thinking, waiting for input, finished, errored.

- **Why this is the highest value-per-effort item on this list.** The canvas's whole
  premise is more agents than you can watch. State-at-a-glance is what makes twelve
  panels legible instead of overwhelming — and it is the feature that pays off *most*
  at card tier, where you cannot read the text anyway.
- **The hard part is detection, not rendering.** No CLI exposes a status API. Options,
  roughly in order of robustness:
  1. **PTY idleness** — no output for N ms after a burst = probably done. Crude, but free
     and CLI-agnostic; `pty-manager.ts` already batches every read at 16ms and knows
     exactly when data stops.
  2. **Scrollback pattern match** — look for the CLI's own prompt/spinner glyphs in the
     tail. `SessionHandle.tail(lines)` already exists. Brittle across CLI versions.
  3. **Child-process inspection** — the PTY's pid has children; a running tool call
     usually means a subprocess. Accurate, more plumbing.
  4. **Terminal bell / OSC sequences** — the correct answer if a CLI ever emits one.
     Worth checking whether Claude Code or Codex already do.
- **Constraint:** the glow must not bump `registry.version()`. That counter is what
  `memo` watches, and it deliberately ignores 16ms-batched PTY data so a chatty agent
  doesn't re-render the canvas at 60Hz. Agent state changes at human speed — give it its
  own subscription, or throttle it hard.
- **Constraint:** must render on the **card**, not just the live panel. Cards are the
  tier you're looking at when you have a lot of panels.

## 6. User-set panel header names

Let the user title a panel — "auth refactor", "flaky test hunt" — so a wall of shells is
distinguishable.

- **Smallest item here, and a prerequisite for several others.** Panel 4 in a 3×3 nav
  grid, an entry in a workspace list, and a name in a multiplayer presence list are all
  the same string.
- **Where it goes:** `Panel` in `panels/panels.ts` gets an optional `title`;
  `TerminalPanel.tsx` already falls back to `spec.command ?? 'login shell'`, so this
  becomes the first entry in that chain. Persisted by M4b.
- **Nice follow-on:** default it to something inferred (cwd basename, or the agent's
  first user message) so the value exists before anyone types one.

## 7. Visualise an agent's subagents on the canvas

When a terminal's AI CLI launches subagents, show them on the canvas — child nodes,
edges to the parent, live status.

- **Why it fits the product thesis:** this is the thing an infinite canvas can show that
  a tabbed terminal fundamentally cannot. It is arguably the most *differentiating* idea
  on this list.
- **Detection is the same unsolved problem as #5, harder.** Subagent launches are not
  announced on any channel we control. Most likely routes: parse the CLI's rendered
  output, or — much better — read a machine-readable side channel if one exists (Claude
  Code writes session transcripts as JSONL; a file watcher on that is a real option and
  needs no output parsing at all).
- **Constraint:** subagent nodes must be **cheap** — not terminal panels. They have no
  PTY and no xterm, so they must not consume `LIVE_BUDGET` or a WebGL context. A
  lightweight node type distinct from `Panel` is the right shape; `lod.ts` would need to
  learn that some nodes are never "live".
- **Open question:** ephemeral or persistent? A finished subagent that vanishes loses
  the history; one that lingers clutters the canvas. Probably: fades to a dim node,
  cleared with the parent.

---

## Rough sequencing, if these were ever scheduled

Ordered by (value × confidence) ÷ effort, not by preference:

1. **#6 panel names** — hours, unblocks others, no new invariants.
2. **#5 agent-state glow** — the feature the canvas premise most needs; start with
   PTY-idleness detection and improve from there.
3. **#2 workspaces** — mostly free *if* M4b's format anticipates it. Decide before M4b.
4. **#1 Cmd nav grid** — self-contained once #2 gives it destinations.
5. **#3 file tree** — real work (new IPC surface, viewport interaction), well understood.
6. **#7 subagent visualisation** — highest ceiling, gated on a detection spike.
7. **#4 multiplayer** — largest; revisit after M4c, when tmux may have done half of it.
