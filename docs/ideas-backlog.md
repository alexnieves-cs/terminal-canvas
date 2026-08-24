# Ideas backlog

Unscheduled ideas, captured 2026-08-24. **Nothing here is a commitment** — the
milestone table in `README.md` is still the roadmap contract. This file exists so an
idea doesn't have to be re-derived later, and so the constraint each one collides with
is recorded next to it while that constraint is still fresh.

Each entry notes the *load-bearing detail in `CLAUDE.md` it has to survive*. That is
the expensive part of every one of these — the canvas already has hard-won invariants
(one transform, two lifetimes, Cmd-gated shortcuts, capture-phase wheel ownership) and
a feature that ignores one of them fails silently rather than loudly.

**The north star these are pointing at (#9): an agentic super app** — a canvas where the
unit is "a thing an agent can work in", not "a terminal". That reframing is what connects
otherwise-unrelated entries here, and it has one concrete structural consequence, recorded
at the bottom of this file.

**A standing rule for everything below (#11): anything a user can toggle goes in one
organised settings surface, with a search bar** — not scattered across menus, context
menus, and undiscoverable shortcuts. Whichever of these ships first, its on/off switch
should be built as a settings entry rather than a bespoke home of its own.

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

## 8. Chat-box mode, model choice, and effort/permission modes

Let a panel be either a **CLI terminal** or a **chat box**, against whichever model the
user picks (Claude, Grok, Codex, …), with first-class controls for the knobs each model
exposes: effort tier (low / medium / high / …) and operating mode (plan, auto,
dangerously-skip-permissions, and so on).

- **This is three features wearing one coat.** Worth separating before any of it is
  scheduled, because they have wildly different costs:
  1. **Mode/effort controls for the CLI you already run** — cheapest by far. These are
     just flags and slash-commands on a process the panel already owns. A dropdown that
     spawns `claude --permission-mode plan` instead of `claude`, or types `/model` into
     the running session, needs no new architecture at all. `PanelSpec.command` is
     already optional and already resolved in main; this is one more field beside it.
  2. **Model choice across vendors** — still mostly (1), as long as each vendor ships a
     CLI. It becomes a *presets* problem, which is already M5's scope: a preset is a
     command, its args, its env, and a label.
  3. **A native chat box that is not a terminal** — the expensive one. See below.
- **Why the chat box is a different animal.** Every invariant in this codebase assumes a
  panel is a PTY behind an xterm: the two-lifetimes registry, `fit()`-before-spawn,
  cols/rows, the pointer correction, `LIVE_BUDGET`'s WebGL accounting, the capture-phase
  wheel ownership. A chat panel has none of that — it is plain DOM, cheap to render,
  needs no WebGL context, and does not belong in the live budget at all. That is not an
  obstacle so much as a signal: **`Panel` needs to become a discriminated union of panel
  *kinds* before this lands**, with `TerminalPanel` as one variant. The same refactor
  that #7's subagent nodes need.
- **Constraint:** a chat panel talks to an API, which means an **API key**, which means
  secrets storage and a main-process HTTP path. The renderer's CSP is `default-src
  'self'` (`src/renderer/index.html`) and it must stay that way — the request goes
  through main over a new IPC channel, never `fetch` from the renderer.
- **Worth doing first, cheaply:** (1) alone. Effort and permission mode selectable at
  spawn, per panel, surfaced in the panel header. Small, useful immediately, and it makes
  the header-name feature (#6) earn its keep.
- **Open question:** does the chat box share history with the CLI session, or are they
  separate conversations? "Same agent, two front-ends" is a much stronger product claim
  than "two unrelated panel types" — and much harder.

## 9. App and service integrations — the Agentic Super App

Bring other tools onto the canvas: GitHub (the way VS Code does it), Obsidian, Google
Docs, Excel / Word, Xcode, Instagram, and so on. **The framing that ties this whole file
together: the canvas as an agentic super app, not a terminal multiplexer.**

- **The thesis is worth stating plainly**, because it reframes several other entries.
  If the unit on the canvas is "a thing an agent can work in" rather than "a terminal",
  then #3's file tree, #7's subagent nodes, and #8's chat box all stop being separate
  features and start being *panel kinds*. That is the single most important structural
  consequence in this document.
- **The integrations are not one category, they are four**, and the difference is what
  determines whether each is a week or a quarter:
  1. **Local files with an open format** — Obsidian (markdown on disk), Excel/Word
     (files), Xcode (a project directory). The agent can already edit these; the
     integration is *rendering and watching*, not access. Cheapest tier, and Obsidian is
     the cheapest of all: it's a folder of markdown.
  2. **APIs with real auth** — GitHub, Google Docs. Genuine work: OAuth, token storage,
     rate limits, a main-process client. GitHub is the highest-value one and also the
     one with the clearest precedent to copy.
  3. **Embedded web views** — anything without an API worth using. Electron has
     `<webview>`/`BrowserView`, but they are separate rendering contexts that **do not
     live inside the `.world` transform**. A `BrowserView` is positioned in window
     coordinates and would not pan, zoom, or clip with the canvas. This is a real
     architectural collision, not a detail — solving it means either accepting
     non-transforming overlays or rendering off-screen and compositing.
  4. **Closed desktop apps** — Instagram, and Xcode if you want more than its files.
     Automation only (AppleScript / Accessibility APIs), fragile, and the least likely
     to be worth it.
- **Constraint, and it is the big one:** every integration is a new trust boundary in an
  app whose entire security posture today is "the renderer has no network and no fs, and
  main owns everything." Tokens for N services, stored somewhere, reachable by agents
  that run arbitrary commands. That deserves its own design pass before the *first*
  integration ships, not the fifth.
- **Sequencing advice:** pick **one** from tier 1 and **one** from tier 2 — Obsidian and
  GitHub — and build them as the two reference implementations. What they have in common
  becomes the integration surface; what they don't becomes the list of things that
  surface deliberately doesn't cover. Building a general plugin API before two concrete
  integrations exist is the classic way to get an abstraction that fits neither.

## 10. Light mode / dark mode

A theme the user picks — light or dark — plus, presumably, "follow the system".

- **The app half is ordinary.** Chrome, panel frames, the HUD, cards: CSS custom
  properties on `:root`, swapped by a `data-theme` attribute, with
  `prefers-color-scheme` as the default. Electron exposes `nativeTheme` in main and
  `matchMedia('(prefers-color-scheme: dark)')` in the renderer, so "follow the system"
  including live switching is genuinely cheap.
- **The terminal half is not, and this is the whole item.** An xterm `Terminal`'s colours
  are a `theme` option on the instance, not CSS — a stylesheet swap will not touch a
  single character of terminal output. So theming means calling `term.options.theme = …`
  on **every session in the registry**, live, including the ones currently detached at
  card tier. `create-terminal.ts` is the one place a `Terminal` is constructed and is
  therefore where the palette belongs; the registry is what has to fan the change out.
- **Constraint:** a detached session must be re-themed too, and it will not repaint on
  its own — the same fact `verify:xterm` established for re-attach applies here. The
  theme change needs the same `refresh(0, rows - 1)` treatment, or a themed-but-stale
  terminal shows the old palette until something else forces a redraw.
- **Constraint:** cards render a *text preview* of the terminal (`tail()`), not the
  terminal itself. They read app CSS, not xterm's theme — so the two palettes have to be
  defined together or a card will visibly disagree with the panel it represents.
- **Watch out:** agent CLIs emit their own ANSI colours chosen for a dark background.
  A light theme with an unadjusted 16-colour ANSI palette produces genuinely unreadable
  output (bright yellow on white). Shipping light mode means shipping a light ANSI
  palette, not just a light chrome.
- **Do it before there are many surfaces to retrofit.** Hardcoded hex values spread; a
  token layer added now costs little and saves a sweep later.

## 11. A real settings surface — and a search bar in it

**Cross-cutting, and it applies to most of this file.** Any idea here that resolves to
something the user can turn on or off belongs in one organised settings area rather than
scattered across menus, panel context menus, and keyboard shortcuts nobody discovers.
That settings area should have a **search bar**, because a preferences pane stops being
usable at roughly the point it becomes worth having.

- **Why this is listed as its own item rather than assumed:** settings are the surface
  every other feature quietly leaks into. If each feature invents its own home for its
  toggle, the tenth one arrives to find nine inconsistent precedents. One structure
  decided once — categories, a schema, persistence, search — is what keeps toggle number
  ten cheap. This is the same argument as the panel-kind union at the bottom of this
  file, applied to configuration instead of canvas nodes.
- **What is already toggle-shaped in this document:** theme (#10), effort/permission/mode
  defaults and model choice (#8), agent-state glow on/off and its detection strategy
  (#5), whether subagent nodes persist or fade (#7), which integrations are enabled and
  their accounts (#9), workspace defaults (#2), sidebar visibility (#3), and the tuning
  constants that are compile-time today — `LIVE_BUDGET`, `DEMOTE_DELAY_MS`,
  `CULL_MARGIN_PX`. That last group deserves care: exposing a performance knob invites
  a user to set it somewhere the app misbehaves, so anything WebGL-budget-related wants
  a hard ceiling and a plain explanation, or should stay internal.
- **Search is not a nice-to-have, it is the reason the pane stays organised.** Given
  search, categories can be *logical* rather than a compromise shaped around
  discoverability. Make it match on setting name, description, **and synonyms** — a user
  looking for "theme" may type "dark", and one looking for the glow may type "status".
  Build the pane off a **declarative schema** (id, label, description, keywords, type,
  default, category) and search comes almost free, as does persistence and a future
  "reset to defaults".
- **Constraint:** settings live in main (they are written to disk), and M4b is already
  building the first "state that survives a relaunch" mechanism in this app. Those two
  should share a storage approach rather than inventing a second one — decide that when
  M4b lands, not after settings ships.
- **Constraint:** the settings surface is chrome, so like #3's sidebar it lives *outside*
  the `.world` transform. And its shortcut, if it gets one, must be `Cmd`-gated like
  every other canvas shortcut, since a bare key belongs to the agent TUI.

## 12. Jira connection — tickets as first-class canvas context

Connect to Jira so the user can see tickets assigned to them or to the team, without
leaving the canvas.

- **Formally this is #9 tier 2** (an API with real auth), and it should reuse whatever
  that tier's integration surface turns out to be. It is listed separately because its
  *value* is different from a generic integration: a ticket is a **unit of work**, and
  this app's unit is also a unit of work. That overlap is the interesting part.
- **The obvious version is a panel that lists tickets.** Useful, modest, and it is what
  most tools stop at.
- **The version worth building is a ticket that becomes a session.** Drag a ticket onto
  the canvas → it spawns a panel, named after the ticket (#6 already gives the header),
  in the right repo, with the ticket's description handed to the agent as its opening
  context. Ticket → branch → panel → PR is a real workflow and the canvas is an unusually
  good place to see several of them running at once. Combined with #5's status glow, a
  wall of tickets-in-progress is legible at a glance in a way a Jira board is not.
- **Constraint:** Jira Cloud is OAuth 2.0 (3LO) with refresh tokens; Server/Data Center
  is a different auth story entirely. Assume Cloud first and say so, rather than
  discovering the split mid-build.
- **Constraint:** read-only first. Writing to Jira — transitioning a ticket, commenting —
  from an app where agents run arbitrary commands is a meaningfully different risk
  posture than reading. Ship reads, then decide about writes deliberately.
- **Note:** the same shape generalises to Linear and GitHub Issues. If the ticket model
  is kept vendor-neutral (id, title, description, assignee, state, url) with a thin
  Jira adapter, the second provider is cheap. Do not build the abstraction until the
  second provider is actually wanted — but do keep the Jira types from leaking into the
  panel-spawning code.

## 13. Drag and drop images into a session (terminal or chat)

Drop an image onto a panel and have the AI in it receive the image — whether that panel
is a terminal running an agent CLI or a native chat box (#8).

- **Read this constraint before anything else: an unhandled file drop can kill every
  session in the app.** Dropping a file onto an Electron renderer makes the page navigate
  to `file://…` by default, and `window-lifecycle.ts` kills a window's PTYs when its
  renderer navigates — by design, for Cmd+R. So the failure mode is not "the drop does
  nothing", it is *every running agent dies and the canvas reloads into a blank grid*.
  `preventDefault()` on both `dragover` and `drop`, at the document level, is mandatory
  and should arguably be added **now** as a standalone guard, before this feature is ever
  scheduled. This is the highest-value line in this entry.
- **The chat-box half is the straightforward one.** A chat panel talks to an API that
  takes images as base64 parts. Read the file in main, attach it to the request. Ordinary.
- **The terminal half is the interesting one, and it has a real answer.** A PTY is a byte
  stream — you cannot hand it an image. But the agent CLIs already solved this: they
  accept **file paths** in their input and read the image themselves. So the drop
  handler's job is to produce a path and type it into the terminal. Two cases:
  1. **A file dragged from Finder** — already has a path. In Electron 32+, `File.path` is
     gone; use `webUtils.getPathForFile(file)` from the preload. Write the path into the
     PTY via the existing `pty:write` channel and the feature is essentially done.
  2. **An image dragged from a browser or pasted from the clipboard** — bytes, no path.
     Main writes them to a temp file and the same path-typing path applies. Needs a
     cleanup policy so the temp directory does not grow without bound.
- **Constraint:** the drop target must be resolved through the same transform-aware
  arithmetic as every other pointer interaction. A drop lands at screen coordinates; the
  panel under it is found in world coordinates. `screenToWorld` plus the existing
  `hitTest` (sorted by `z`) is exactly the right machinery — do not reinvent it, and do
  not use `elementFromPoint` and assume the answer agrees at `scale ≠ 1`.
- **Constraint:** not every CLI reads image paths, and none of them advertise it. This is
  per-agent behaviour, so it belongs beside #8's per-model configuration rather than
  being assumed globally true.
- **Worth pairing with paste.** `Cmd+V` is already a single Canvas-level subscription
  routed to the focused session (`getSelection()`/`paste()` on `SessionHandle`). Pasting
  an image from the clipboard is the same feature as dropping one, arriving through a
  handler that already exists — likely the cheaper half to build first.

## 14. Panels that *are* other apps — a live document beside a live agent

Not a link to another app, and not a preview of one: the app itself, running in a panel
on the canvas. `claude` in a terminal panel, and immediately beside it a **live Excel
sheet from the local machine** — open, editable, updating. Same for a Word document, an
Obsidian note, an Xcode file, a browser tab.

- **This is the sharpest statement of the super-app thesis in this file**, and it is why
  #9 is not just "add some integrations". The point of putting the sheet *next to* the
  agent is that the agent is working on that sheet, and you watch it change. Side-by-side
  is not a layout preference — it is the feature. A canvas is the only UI shape where
  "twelve of these at once" is coherent.
- **The killer property is liveness in both directions.** The agent edits the file on
  disk; the panel reflects it within a second. The user edits in the panel; the agent
  sees the new bytes on its next read. That is a **file watcher plus a renderer**, which
  is a far smaller problem than "embed Excel". Most of the value here needs no vendor
  integration at all — only the local file and a watch.
- **Which is why the first one to build is a local-file panel kind, not an app embed.**
  Ranked by honest cost:
  1. **Text-ish local files** — markdown, CSV, JSON, source files. A watcher plus a
     viewer/editor. Genuinely achievable, and it already covers Obsidian notes and a CSV
     export of a spreadsheet. **Start here.**
  2. **Real spreadsheets (`.xlsx`)** — a rendering library (SheetJS to parse, a grid
     component to display) over a watched file. Read-only rendering is very doable;
     round-tripping edits back into `.xlsx` without destroying formatting is where the
     effort actually is.
  3. **A web app in a panel** — Google Docs, a browser. Electron can do this, but see
     the transform collision below; this is the architecturally expensive tier.
  4. **A native desktop app's real window in a panel** — Excel proper, Xcode proper.
     Effectively out of reach on macOS. Not a "later" item, a "no" item. Say so now so
     nobody re-litigates it. The answer for these apps is tier 1 or 2 on their files.
- **The transform collision, restated because it decides tier 3.** An Electron
  `WebContentsView`/`BrowserView` is positioned in **window** coordinates and composited
  outside the page — it will not pan, zoom, clip, or z-order with the `.world` layer. So
  a web panel either (a) does not really live on the canvas, just floats over it and gets
  repositioned per frame, which fights every gesture and looks wrong at any scale ≠ 1, or
  (b) needs off-screen rendering and compositing, which is a project. An `<iframe>` *does*
  transform correctly and is the honest first attempt — but most interesting sites refuse
  to frame (`X-Frame-Options`, CSP `frame-ancestors`), and the renderer's own CSP is
  `default-src 'self'` today and should stay strict.
- **Constraint:** these panels must be **cheap and outside `LIVE_BUDGET`**. That budget
  exists to ration WebGL contexts for xterm; a spreadsheet grid is ordinary DOM and must
  not consume a slot. Equally, a *web* panel is its own renderer process with its own
  memory and GPU cost, so it needs a budget of its own rather than borrowing the
  terminal's.
- **Constraint:** file access is main-side. Same rule as #3 — new IPC channels for read,
  write, and a watch subscription; nothing in the renderer touches `fs`, and every new
  channel needs a handler or `verify:ipc` fails.
- **Open question worth deciding early:** when the agent and the user edit the same file
  at the same moment, who wins? A watcher that blindly reloads will discard whatever the
  user was typing. Even the simplest version needs a stance — "reload unless the panel is
  dirty, then warn" is a fine one, but it has to be chosen rather than defaulted into.

---

## Rough sequencing, if these were ever scheduled

Ordered by (value × confidence) ÷ effort, not by preference:

0. **The file-drop guard from #13** — not a feature, a latent bug. An unhandled file
   drop navigates the renderer and `window-lifecycle.ts` then kills every PTY in the
   window. Worth a `preventDefault()` on `dragover`/`drop` regardless of whether the
   drag-and-drop feature is ever built.
1. **#6 panel names** — hours, unblocks others, no new invariants.
2. **#8, part 1 only** — effort/permission/model selectable at spawn for the CLI already
   running. Flags on a process the panel owns; no architecture at risk.
3. **#5 agent-state glow** — the feature the canvas premise most needs; start with
   PTY-idleness detection and improve from there.
4. **#2 workspaces** — mostly free *if* M4b's format anticipates it. Decide before M4b.
5. **#1 Cmd nav grid** — self-contained once #2 gives it destinations.
6. **#11 settings surface** — schedule it at the point there are three or four toggles,
   not before and not after. Built off a declarative schema, it makes every later toggle
   cheap and gives the search bar for almost nothing.
7. **#10 light/dark** — chrome is easy; the real work is xterm's `theme` option fanned
   across the registry plus a readable light ANSI palette.
8. **#13 image drop/paste, Finder + clipboard cases** — small once the guard exists;
   the terminal path is "write a file path into the PTY", which needs no new channel.
9. **#14 tier 1 — a watched local-file panel kind.** The first non-terminal panel, and
   the one that forces the union below to exist. Markdown/CSV/JSON beside a live agent
   is most of this idea's value for a fraction of its cost.
10. **#3 file tree** — real work (new IPC surface, viewport interaction), well understood.
11. **#9, one integration each from tier 1 and tier 2** — Obsidian and GitHub as the two
   reference implementations, after the trust-boundary design pass.
12. **#12 Jira, read-only** — after #9 establishes the auth-and-token surface it shares.
13. **#7 subagent visualisation** — highest ceiling, gated on a detection spike.
14. **#8, part 3 (native chat panels)** — after the panel-kind refactor exists.
15. **#4 multiplayer** — largest; revisit after M4c, when tmux may have done half of it.
16. **#14 tier 2 (`.xlsx` rendering)** — after tier 1 proves the panel kind.
17. **#14 tier 3 (web panels)** — only with an answer to the transform collision.
    Tier 4 (embedding a native app's real window) is a **no**, not a later.

## The one structural decision underneath all of this

Six separate entries (#3 file tree, #7 subagent nodes, #8 chat box, #9 integrations,
#12 Jira boards, #14 live document panels) all need the same thing: **a canvas node that
is not a terminal.** Today `Panel` means
"a PTY behind an xterm", and `LIVE_BUDGET`, `fit()`-before-spawn, the pointer
correction, and the WebGL accounting all assume it.

Turning `Panel` into a discriminated union of kinds — with the terminal as one variant
and cheap DOM nodes as another that never touch the live budget — is the unlock for the
super-app direction. It is not urgent, and it should *not* be done speculatively. But it
is the thing to build deliberately the first time a second panel kind is genuinely
needed, rather than bolting a special case onto the terminal path and discovering the
union three features later.

**#14 is the entry most likely to force the decision, and the cleanest place to make it.**
A watched local-file panel is small, obviously useful, and shares almost nothing with the
terminal path — so it is a good first variant precisely because it cannot be faked as a
special case of one. If the union gets built for anything, build it for that.
