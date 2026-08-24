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
at the bottom of this file — alongside a second one that M4b's dormancy work introduced.

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

## 15. An annotation layer — ink, highlights, sticky notes on the canvas

Let the user write and draw directly on the canvas and on panels: freehand ink,
highlights, arrows, sticky notes, text labels. The point is to make the canvas feel like
an open creative workspace rather than a grid of terminals — somewhere thinking happens
alongside the work, not only in the terminals.

- **This is the entry that most argues the canvas is a canvas.** Every other idea in this
  file adds something *to* the surface; this one is about the surface itself. A sticky
  note reading "this one's the flaky test hunt — don't kill it" pinned beside a running
  agent is the sort of thing that only works when the workspace is spatial. It is also
  the cheapest idea here to make feel good, because none of it involves a process, an
  API, or a token.
- **Almost all of it is free from the architecture already in place.** Annotations are
  world-space objects; the `.world` layer already carries one transform, so ink drawn at
  world coordinates pans, zooms, and clips correctly with zero additional math. That is
  the same property that made panels cheap. `screenToWorld` converts the pointer to the
  coordinates a stroke should be stored in, and it is already tested.
- **Use SVG, not a bitmap `<canvas>`.** An SVG child of `.world` scales as vector — sharp
  at 400%, sharp at 10%. A 2D bitmap canvas would be rasterised once and then visibly
  blurred by the CSS transform at any scale above the one it was drawn at, and
  re-rasterising per zoom level defeats the point of the single transform. Related: a
  stroke's *width* should be chosen deliberately — `vector-effect="non-scaling-stroke"`
  keeps ink one screen pixel at every zoom, while a plain width makes ink a physical
  property of the world that gets thinner as you zoom out. The second is almost certainly
  the right feel for annotation, but it is a choice, not a default.
- **The hard part is input arbitration, not rendering.** Right now every pointer gesture
  on the canvas already means something: drag pans, drag on a panel chrome moves it, drag
  in a terminal selects text, wheel scrolls or zooms depending on focus. Drawing needs to
  claim the drag gesture without stealing any of those. Options:
  1. **An explicit mode** (a toolbar, `Cmd`-gated shortcut to enter/leave). Unambiguous,
     conventional, and it composes with #11's settings surface. Almost certainly correct
     for v1.
  2. **A modifier-held gesture** — draw only while a key is down. Cheap, but the modifier
     has to be `Cmd`-family, since bare keys belong to the agent TUI, and `Cmd`+drag is
     then unavailable for anything else.
  3. **Tool-by-target** — ink on the background, never over a panel. Simplest to reason
     about, but it gives up annotating *on* a panel, which is half the value.
- **Two kinds of annotation, and the difference matters for storage.**
  - **World-anchored** — a note that lives at a spot on the canvas. Stored in world
    coordinates. Simple.
  - **Panel-anchored** — a highlight or label attached to a specific panel, which must
    move when that panel is dragged and vanish when it is closed. Stored *relative to the
    panel*, with the panel's id. This is the one that makes the feature feel intelligent
    rather than like a transparency sheet taped over the screen, and it costs almost
    nothing extra if the coordinate space is chosen correctly the first time.
- **Constraint:** annotations must be cheap and outside `LIVE_BUDGET`. They are DOM/SVG,
  no PTY, no WebGL context, and no reason to participate in tiering — though very large
  ink collections will eventually want their own culling, and `viewport.ts`'s existing
  bounds math is the right tool when that day comes.
- **Constraint:** z-order. Panels stack by `Panel.z`, never by array order, because a
  React reorder would detach a live terminal's WebGL host. Annotations join the same
  ordering scheme rather than inventing a second one — and "always on top" vs "behind the
  panels" is worth being able to toggle, since both are legitimately useful.
- **Constraint:** persistence. Annotations are exactly the kind of thing a user would be
  upset to lose on relaunch, so they belong in M4b's saved layout — another reason that
  file format wants to be extensible rather than a fixed record of panels.
- **Worth noting for #4:** annotations are the single best multiplayer feature in this
  file. Shared ink and sticky notes on a team canvas is a well-understood, genuinely
  useful collaboration primitive, and it needs none of the hard PTY-sharing work — it is
  small objects with ids, which is the easy case for sync.

## 16. Search across every panel

`Cmd+F` on the canvas: type a string, get every panel that contains it, jump the camera
to the match. The wall-of-shells problem stated as a retrieval problem — "which of these
twelve was the one that printed the stack trace?"

- **Why it fits:** the canvas's premise is more panels than you can read. Naming them
  (#6) tells you what a panel is *for*; search tells you what a panel has *said*, which
  is the question you actually have at the moment you go looking. A hit resolving to a
  camera move is also the first real consumer of `zoomAt`/`screenToWorld` for something
  other than a gesture.
- **Do not confuse it with #11's settings search.** That one searches a static schema of
  toggles. This one searches live, growing, per-session text. They share a keystroke
  convention and nothing else — resist the urge to build one surface for both.
- **The load-bearing problem is where the index comes from, and it is not xterm.** xterm
  ships a `SearchAddon`, and it searches exactly one `Terminal`'s buffer. That is fine
  for the focused panel and useless for the other eleven, because of what M4b just made
  true: a panel restored from disk is **dormant** — `lod.ts` never promotes it and
  `attachSlot` refuses to spawn it, so its `SessionHandle` has never been attached and
  its buffer is empty. `scrollPosition()` already documents the same fact for its own
  case ("0 for a session that has never been attached"). So on a freshly relaunched
  canvas, an xterm-backed search finds nothing anywhere, and it does so silently.
- **Which means this entry has a hard prerequisite it does not currently have:
  scrollback that outlives the process.** M4b persists *where the panels are*, not *what
  they said*. Until some record of a session's output exists on disk, canvas-wide search
  can only ever cover the handful of panels that happen to be live this run. That
  prerequisite is worth costing before this entry is scheduled, not during — and it is
  a bigger question than search itself (retention, size caps, and the fact that agent
  output routinely contains secrets that a plaintext history on disk would preserve).
- **Constraint:** results must render outside the `.world` transform. A result list is
  chrome, like #3's sidebar and #11's pane; put it inside the world layer and it scales
  with zoom.
- **Constraint:** the shortcut is `Cmd`-gated, and `Cmd+F` specifically is worth checking
  against the agent CLIs — a TUI that wants `Cmd+F` for its own search would be fighting
  the canvas for it, and the canvas should win only because bare keys already belong to
  the TUI.
- **Open question:** does a hit scroll the panel's terminal to the match, or only move
  the camera to the panel? Scrolling a live terminal to a scrollback offset is a real
  side effect on a running session, and `scrollPosition()` exists precisely because
  "did this terminal scroll when it shouldn't have" is already a property worth asserting.
- **Depends on:** durable scrollback. Everything else here is small.

## 17. Attention routing for agents you cannot see

An agent finishes, or asks a question, while its panel is off screen. Today nothing tells
you. This is edge-of-viewport indicators, a native notification, and a "jump to whatever
wants me" key.

- **Why it fits, and why it is the other half of #5.** The border glow answers "what is
  this panel doing" for a panel you are looking at. On an infinite canvas the common case
  is that you are not looking at it — the whole point of the surface is that it is bigger
  than the screen. A status colour nobody sees is not a status system. These two should be
  designed together and built in that order: detection (#5), then routing (this).
- **Three surfaces, increasing cost:** an arrow or pip on the viewport edge pointing at
  the off-screen panel that changed state; a queue of "N agents waiting" you can cycle
  with a `Cmd`-gated key that flies the camera to each; and an OS notification via
  Electron's `Notification` for the case where the app is not focused at all.
- **Constraint:** the edge indicators are chrome — outside `.world` — but their *positions*
  are world-space facts. Direction-to-an-off-screen-rect is exactly the kind of arithmetic
  `viewport.ts` exists to hold, and it belongs there (pure, plain-node testable) rather
  than in a component.
- **Constraint:** this cannot ride `registry.version()`. That counter deliberately ignores
  16ms-batched PTY data so a chatty agent does not re-render the canvas at 60Hz, and
  attention state changes at human speed. Same rule #5 records: its own subscription, or
  throttled hard.
- **Constraint:** a *dormant* panel has no PTY and cannot want anything. The indicator set
  must be derived from sessions that are actually running, or a restored canvas will draw
  twelve arrows for twelve processes that do not exist.
- **Open question:** what counts as "wants me"? "Finished" and "asked a question" deserve
  a notification; "printed some output" does not. That distinction is #5's detection
  problem again, and it is the reason this cannot be built first.
- **Worth pairing with:** a badge on the app's dock icon for the count. Cheap, and it is
  the one indicator that works when the window is behind something else.

## 18. What the canvas costs the machine

A per-panel readout of CPU and memory, and a canvas-wide total. Twelve agents is twelve
process trees, each of which may be running a compiler.

- **Why it fits:** `LIVE_BUDGET` is the only resource ceiling in the app, and it rations
  exactly one resource — WebGL contexts — because that is the one with a hard cliff near
  16 and a permanent failure mode (`create-terminal.ts` sets `webglDisabled` after a
  dropped context). Nothing rations, or even reports, the resource the user actually runs
  out of first. A canvas that invites twenty agents should be able to say what twenty
  agents cost.
- **The handle already exists.** `PanelStatus` carries `{ kind: 'running'; pid: number }`,
  so the renderer already knows every panel's process id. The work is main-side sampling
  of that pid *and its children* — an agent CLI's cost is mostly its subprocesses, not
  itself — on a slow timer, over a new IPC channel. Anything sampled per-frame here is
  a bug, not a feature.
- **Constraint:** a new channel means a new entry in `shared/ipc-contract.ts` and a
  handler in main, or `verify:ipc` fails. That is the intended pressure; do not route it
  through an existing channel to avoid the check.
- **Constraint:** the readout must not bump `registry.version()` — same rule as #5 and
  #17. A number that changes every two seconds must not be a reason to re-render every
  panel.
- **Constraint:** it must render on the **card**, not just the live panel, for the same
  reason #5's glow must: the tier you are looking at when you have many panels is the
  card tier.
- **Open question, and it is a product question:** does this stay a readout, or does it
  become a *governor*? "Do not promote a panel while the machine is already saturated"
  is a coherent rule and a genuinely different feature — it would make `assignTiers`
  depend on a runtime measurement, which today it deliberately does not (it is pure, and
  `verify:viewport` runs it under plain node). Keeping the measurement out of the tiering
  function and applying any governor at the `Canvas.tsx` apply step — where the budget
  re-check already lives — is the shape that preserves that.
- **Related:** #11 lists `LIVE_BUDGET`, `DEMOTE_DELAY_MS` and `CULL_MARGIN_PX` as
  tuning constants a settings pane might expose, and warns that a performance knob invites
  a user to break the app. A cost readout is the honest companion to any such knob: it is
  what makes a number the user is turning mean something.

## 19. Token and dollar accounting per panel

What each agent has spent — tokens, and the money they represent — per panel, per
workspace, and in total.

- **Why it fits:** this is the cost of the canvas in the currency the user actually cares
  about, and it is the one number that scales linearly with the thing the product
  encourages (more agents at once). "Twelve agents running" is a very different sentence
  depending on whether it is two dollars or two hundred.
- **The mechanism is a file watcher, not output parsing, and that is the whole point.**
  Agent CLIs write structured session transcripts to disk — Claude Code writes JSONL.
  Totalling usage from those files needs no scraping of rendered TUI output, survives a
  CLI's cosmetic redesign, and works for a panel at card tier that is not rendering
  anything. **This is the same side-channel #7 identifies for subagent detection**, and it
  is a strong argument for building that watcher once, deliberately, as shared machinery
  rather than twice for two features.
- **Constraint:** main-side, like every other filesystem access in this app (#3, #14). The
  renderer has no `fs` and should keep not having it.
- **Constraint:** correlating a transcript file to a *panel* is the unsolved part. The
  session file is keyed by the CLI's own session id, which the panel does not know. The
  honest routes are the panel's cwd plus start time, or launching the CLI with a flag that
  pins its session id where the panel can see it — the second is much more robust and is
  a per-vendor detail, so it belongs beside #8's per-model configuration.
- **Constraint:** vendor-specific by nature. Keep the accounting model neutral (panel id,
  tokens in, tokens out, model, cost) with a thin adapter per CLI, exactly as #12 argues
  for tickets — and do not build the abstraction until a second CLI actually wants it.
- **Open question:** is this a live readout, a history, or both? A number on a card is
  cheap; "what did this canvas cost me last week" is a data-retention feature with its own
  storage question, and it should share whatever #11 and M4b settle on rather than
  inventing a third store.

## 20. Two windows, one canvas

Open the canvas in more than one window — a second monitor showing a different region of
the same world, or a different workspace (#2) entirely.

- **Why it fits:** spatial workspaces and multiple monitors are a natural pair, and it is
  one of the few genuinely common desktop expectations this app currently has no answer
  for. It is listed here mostly because **the current architecture has a specific answer
  and it is not obvious**, so it should be written down before someone assumes otherwise.
- **What is true today, stated plainly.** The session registry is a **module-level
  singleton per renderer** — that is the "two lifetimes" design, and it is scoped to the
  page, not the app. `window-lifecycle.ts` kills a window's sessions when *its* renderer
  navigates or closes. So a second window is a second registry, a second set of PTYs, and
  a second independent `LIVE_BUDGET`. Two windows showing "the same" canvas would be two
  canvases that happen to have been loaded from the same file, and the second one to save
  would silently win.
- **Which makes this three separable features, in rising cost:**
  1. **A second window on a different workspace** — nearly free once #2 exists, because
     the two windows genuinely share nothing but the app.
  2. **A second window on the same workspace, read-only or panel-disjoint** — needs the
     layout store to stop being last-write-wins, and needs an owner for each panel's
     session so two windows do not both try to spawn `s01`.
  3. **A second view of the same live panel in both windows** — the hard one. A PTY has
     one master and an xterm `Terminal` has one host; showing it twice is the same
     multiplexing problem #4 identifies for multiplayer, and it has the same answer:
     wait for M4c, because tmux already solves attaching two clients to one session.
- **Constraint:** `LIVE_BUDGET` is per renderer, but the WebGL context limit is per
  *browser process*. Two windows at eight live panels each is sixteen contexts against a
  cliff at roughly sixteen. Whatever tier 2 or 3 becomes, the budget has to become an app
  fact rather than a page fact, and that is a main-process question.
- **Open question:** does the camera sync? Two windows on one workspace could show
  different regions (useful) or mirror each other (rarely). Different regions is almost
  certainly right, which means the viewport is per-window state and must *not* go in the
  shared saved layout as a single value — a detail M4b's format should be checked against
  now, while it is cheap.

## 21. Broadcast input to a selection

Select several panels and type once — the keystrokes go to all of them. `git pull` in six
repos; the same prompt to four agents to compare how they answer it.

- **Why it fits:** it is tmux's `synchronize-panes`, and it is one of the few features
  where the spatial layout is *the selection UI*. "These four, the ones in this cluster"
  is a gesture on a canvas and a config file anywhere else. Sending one prompt to four
  different models side by side is also the cheapest possible version of #8's
  multi-model ambition — no API, no key, no new panel kind, just four CLIs and one
  keystroke.
- **Almost all the machinery exists.** `pty:write` already takes a panel id, so broadcast
  is a loop, not a channel. What is missing is **multi-selection**, which the canvas does
  not have today: `Canvas.tsx` tracks a single `selectedId` and a single `focusedId`.
  #2 already wants a rubber-band select for "move these to a new workspace", so the
  selection model is shared work — build it once, for both.
- **Constraint, and it is the dangerous one:** input routing today is *unambiguous* —
  keystrokes go to the focused session, and exactly one panel is focused. Broadcast makes
  the destination of a keystroke a mode, and a mode you can forget you are in. Typing
  `rm -rf build` into six shells you did not mean to select is a real, unrecoverable
  outcome. This wants a loud, permanent indicator while it is active, an obvious exit, and
  probably a confirmation the first time — not a quiet toggle in a menu.
- **Constraint:** `Cmd`-gated to enter and leave, like every other canvas shortcut, since
  bare keys belong to the TUI.
- **Constraint:** broadcast must never wake a **dormant** panel. A dormant panel has no
  PTY; "send this to all six" where two of them are dormant either spawns two agents the
  user did not ask for — the exact decision dormancy exists to avoid making on their
  behalf — or silently drops the input. Skip-and-say is the honest answer.
- **Open question:** does broadcast go to the PTY (raw bytes, so a TUI sees keystrokes) or
  is it a higher-level "submit this prompt" action? For shells the first is right; for
  agent CLIs the second is what the user means, and the two differ by whether a trailing
  newline is sent. Probably per-panel, decided by whatever #8's per-model configuration
  knows about the CLI.

## 22. Semantic zoom — a card that changes with distance

A card at 45% zoom and a card at 8% zoom render the same thing today: a text tail. At 8%
that text is a grey smear. The card should become *less* as you zoom out — tail, then
title and status, then a coloured block.

- **Why it fits:** it is the missing half of an idea the codebase already committed to.
  `LIVE_MIN_SCALE` exists because "below this, terminal text is unreadable anyway and a
  card is honest" — the exact same argument applies one rung further down, where the
  card's own text is unreadable and a card is no longer honest. The zoomed-way-out view is
  the one where you are looking at the whole canvas at once, and it is currently the least
  informative view in the app rather than the most.
- **This is cheap and it is a rendering change, not an architecture change.** No new panel
  kind, no new IPC, no session lifecycle involvement. The tier a panel gets is already a
  pure function of the viewport; deciding *how* a card draws itself from the same scale is
  a component-level decision below tiering.
- **Constraint, and it is a real fork in the design:** do not conflate the **render tier**
  with the **session tier**. `assignTiers` decides who holds a WebGL context and a PTY,
  and it is deliberately pure and plain-node tested. "How does a card draw" has no
  resource consequence at all and must not become a fourth state in that function, or the
  file that rations contexts starts making typography decisions. Two separate questions
  reading the same `viewport.scale`.
- **Constraint:** whatever the far tier shows must be available for a **dormant** panel,
  which has never been attached and has no buffer to `tail()`. That points the far tier at
  facts the `Panel` itself holds — title (#6), agent state (#5), cost (#19) — rather than
  terminal output, which is probably the right answer anyway.
- **Related:** this is what makes #1's navigation grid and #17's attention arrows legible.
  All three are about the same view: the one where you can see everything and read nothing.
- **Open question:** where are the thresholds, and do they hysteresis? A card flipping
  between two renderings at a boundary while the user pinches is the same class of thrash
  `DEMOTE_DELAY_MS` and `CULL_MARGIN_PX` exist to prevent — cheaper here, since nothing is
  destroyed, but still visibly bad.

## 23. Focus mode — and the surprise underneath it

A `Cmd`-gated key that makes one panel fill the screen, and the same key to come back.
The universal "maximise this" gesture.

- **The surprise is worth the entry on its own, because the obvious implementation does
  not do what the user wants.** Because of "one transform, not N layouts", zooming the
  camera so a panel fills the viewport gives the shell **no additional columns**. A CSS
  `scale()` on an ancestor is invisible to `getComputedStyle` and `ResizeObserver`, which
  is exactly what xterm's `FitAddon` consults — that blindness is deliberate and it is
  what stops a zoom gesture from reflowing every running agent. So a camera-based focus
  mode produces the same 80×24 terminal, drawn large and soft. The user asked for more
  terminal; they got a magnifying glass.
- **Which makes this two different features that look identical in a screenshot:**
  1. **Zoom to fit** — a camera animation to the panel's rect. Pure `viewport.ts` work,
     costs nothing, changes no session state, and is genuinely useful for "let me look at
     this one". It just is not a maximise.
  2. **Actually maximise** — resize the `Panel`'s world rect to fill the viewport at the
     current scale, which fires the existing resize path: `refit()`, `pty:resize`, a
     SIGWINCH, and a full TUI repaint. Real more-columns. It is a layout mutation, so it
     is undoable (the history stack M4b built), persisted, and it has to remember the
     previous rect to restore.
  Build both, name them differently, and do not let one silently stand in for the other.
- **Constraint:** the maximise variant must commit on the way in and the way out, not
  continuously — the same reason resize commits on release rather than live. Two SIGWINCHes
  total, not sixty.
- **Constraint:** `Cmd`-gated. And the restore path needs to survive the panel having been
  dragged or resized while focused, which argues for storing the pre-focus rect on the
  panel rather than in ephemeral component state.
- **Open question:** does focus mode imply *only* this panel is live? Pinning the budget to
  one panel while focused would free seven contexts, but demoting seven running agents
  because the user zoomed in on one is exactly the kind of decision-on-their-behalf that
  dormancy exists to avoid. Probably not — but it should be a decision, not a default.

## 24. Edges between panels

Draw a line from one panel to another and have it mean something: this agent's output is
input to that one; these three are the same ticket; this shell is the server the panel
beside it is testing against.

- **Why it fits, and why it belongs on a canvas specifically.** Relationships between
  concurrent work are invisible in every tabbed terminal, because a tab list has one
  dimension and relationships need two. This is the second thing (after #7) that an
  infinite canvas can show which a multiplexer structurally cannot.
- **#7 already needs edges, for one specific case** — parent agent to its subagents. That
  is a good reason to build the edge *primitive* generally rather than as a private detail
  of subagent visualisation: same renderer, same z-order question, same persistence.
- **The rendering is nearly free and the reason is the same as #15's.** An edge is a world-
  space object; `.world` carries one transform, so an SVG path between two panel rects
  pans, zooms, and clips correctly with no additional math. Anchor points are a function of
  two rects, which is `panel-interaction.ts`-shaped arithmetic — pure, and testable under
  plain node.
- **Two flavours, and they should not be built at once:**
  1. **Decorative** — the edge means whatever the user says it means, like a line on a
     whiteboard. Costs a data model, a drag gesture, and persistence. Composes naturally
     with #15's annotation layer and is arguably a feature *of* it.
  2. **Functional** — the edge does something: pipe this panel's output into that one's
     input, or "restart this one when that one exits". Genuinely powerful and genuinely
     dangerous, because it means the canvas is now writing to PTYs on its own initiative.
     Everything #21 says about a mode you can forget you are in applies double to a rule
     that fires without you present.
- **Constraint:** edges join `Panel.z`'s ordering rather than inventing a second scheme —
  same rule #15 records — and they must not participate in `LIVE_BUDGET`. They are SVG.
- **Constraint:** an edge references two panel ids, so it needs a stance on a panel being
  closed. Dangling edges are the standard failure of every graph UI that stored ids without
  deciding this.
- **Open question:** if the functional flavour ever happens, is the edge the *only* place
  that behaviour is expressed? A rule you can only see by finding the line on the canvas is
  hard to audit. This may be the point at which the canvas needs a plain list view of its
  own automations.

## 25. Where a new panel goes — placement, snapping, and tidy

Today panel positions come from `SEED_PANELS`, a hand-authored grid. Once panels are
created and destroyed at will, something has to decide where a new one lands, and the
canvas should help keep the result legible: alignment guides while dragging, snapping,
and a "tidy" command.

- **Why it fits:** an infinite canvas's characteristic failure is entropy. Twenty panels
  placed by twenty individual decisions become an unnavigable sprawl, and the feature that
  prevents it is not a new capability but a small amount of arithmetic applied at the right
  moments. This is the difference between a canvas that feels designed and one that feels
  like a desktop full of overlapping windows.
- **Three separable pieces, all small, all in code that already exists:**
  1. **Spawn placement** — a new panel should appear somewhere sensible: in view, not
     overlapping an existing one, near the panel it was spawned from. A first-fit scan
     over the existing rects in world space; `viewport.ts` already knows what is in view.
  2. **Snapping and alignment guides** — while dragging, snap edges and centres to nearby
     panels and show the guide lines. `applyDrag` in `panel-interaction.ts` is already the
     single place a drag resolves to a rect, and it is already pure — snapping is a
     function applied to its output, which keeps it plain-node testable.
  3. **Tidy** — a command that arranges the selection (or everything) onto a grid. Pure
     rect math over `Panel[]`.
- **Constraint:** all of it is *world-space* arithmetic, and the snap threshold is the
  place that gets it wrong. A snap distance in world units becomes visually huge when
  zoomed out and invisible when zoomed in; it should be specified in **screen** pixels and
  divided by `viewport.scale` — the same 1/k relationship `applyDrag` already embodies and
  `verify:viewport` check 27 already pins.
- **Constraint:** snapping must not fight `MIN_PANEL_W`/`MIN_PANEL_H` during a resize, and
  tidy must not produce a rect smaller than them — the shared layout validator rejects such
  a panel outright, so a tidy that violated them would produce a canvas that cannot be
  saved.
- **Constraint:** tidy is a layout mutation across many panels at once, which makes it the
  best possible test of M4b's undo stack — and a strong argument that it must be a single
  undoable step rather than twenty.
- **Open question:** does tidy preserve spatial meaning? If a user has grouped panels by
  project, a tidy that sorts them into a grid by id destroys exactly the information the
  canvas was carrying. "Compact without reordering" is a harder algorithm and probably the
  correct one.

---

## Rough sequencing, if these were ever scheduled

Ordered by (value × confidence) ÷ effort, not by preference:

0. ~~**The file-drop guard from #13**~~ — **done.** It was never a feature, it was a
   latent bug: an unhandled file drop navigates the renderer and `window-lifecycle.ts`
   then kills every PTY in the window. `src/renderer/drop-guard.ts` now `preventDefault()`s
   `dragover`/`drop` at the document level, independently of whether the drag-and-drop
   feature is ever built.
1. **#6 panel names** — hours, unblocks others, no new invariants.
2. **#23, the zoom-to-fit half only** — a camera animation to a panel's rect. Pure
   `viewport.ts`, no session state touched. Cheapest useful thing on this list, and
   building it first is what surfaces the surprise the rest of #23 is about.
3. **#8, part 1 only** — effort/permission/model selectable at spawn for the CLI already
   running. Flags on a process the panel owns; no architecture at risk.
4. **#22 semantic zoom** — a rendering change below tiering, no new IPC, no lifecycle.
   It is what makes the zoomed-out view worth having, which #1 and #17 both assume.
5. **#5 agent-state glow** — the feature the canvas premise most needs; start with
   PTY-idleness detection and improve from there.
6. **#17 attention routing** — immediately after #5, because a status colour on a panel
   nobody is looking at is not a status system. Same detection, different surface.
7. **#25 placement, snapping, tidy** — three small pieces of world-space arithmetic in
   code that already exists (`applyDrag`, `viewport.ts`), and the best available test of
   M4b's undo stack.
8. **#2 workspaces** — mostly free *if* M4b's format anticipates it. Decide before M4b.
9. **#1 Cmd nav grid** — self-contained once #2 gives it destinations.
10. **#21 broadcast input** — the loop is trivial; the work is multi-selection (shared
   with #2, build it once) and the safety story around a mode you can forget you are in.
11. **#15 annotations — sticky notes and world-anchored ink first.** Unusually high
   feel-per-effort: SVG in the `.world` layer inherits pan/zoom for free, and no process,
   API, or token is involved. Ink and panel-anchored annotations follow once the mode
   arbitration is settled.
12. **#24 edges, decorative flavour only** — same SVG-in-`.world` machinery as #15 and
   arguably a feature of it. The functional flavour is much later and much more dangerous.
13. **#11 settings surface** — schedule it at the point there are three or four toggles,
   not before and not after. Built off a declarative schema, it makes every later toggle
   cheap and gives the search bar for almost nothing.
14. **#18 machine cost readout** — the pid is already in `PanelStatus`; the work is
   main-side sampling on a slow timer. Worth having before #11 exposes any WebGL-budget
   knob, since it is what makes such a knob mean something.
15. **#10 light/dark** — chrome is easy; the real work is xterm's `theme` option fanned
   across the registry plus a readable light ANSI palette.
16. **#13 image drop/paste, Finder + clipboard cases** — small now that the guard exists;
   the terminal path is "write a file path into the PTY", which needs no new channel.
17. **#23, the actually-maximise half** — a layout mutation with a restore rect, a
   SIGWINCH on entry and exit, and a decision about whether focus mode pins the budget.
18. **#19 token and dollar accounting** — gated on the transcript watcher, which is the
   same machinery #7 needs. Build the watcher once, deliberately, for whichever of the
   two is scheduled first.
19. **#14 tier 1 — a watched local-file panel kind.** The first non-terminal panel, and
   the one that forces the union below to exist. Markdown/CSV/JSON beside a live agent
   is most of this idea's value for a fraction of its cost.
20. **#3 file tree** — real work (new IPC surface, viewport interaction), well understood.
21. **#16 canvas-wide search** — the search itself is small; it is gated on durable
   scrollback, which is a bigger question than search (retention, size caps, and secrets
   in agent output) and should be costed on its own before this is scheduled.
22. **#9, one integration each from tier 1 and tier 2** — Obsidian and GitHub as the two
   reference implementations, after the trust-boundary design pass.
23. **#12 Jira, read-only** — after #9 establishes the auth-and-token surface it shares.
24. **#7 subagent visualisation** — highest ceiling, gated on a detection spike.
25. **#8, part 3 (native chat panels)** — after the panel-kind refactor exists.
26. **#20 two windows** — tier 1 (separate workspaces) is nearly free after #2; tier 3
   (one live panel in two windows) waits for M4c for the same reason #4 does.
27. **#4 multiplayer** — largest; revisit after M4c, when tmux may have done half of it.
28. **#14 tier 2 (`.xlsx` rendering)** — after tier 1 proves the panel kind.
29. **#24, the functional flavour** — an edge that writes to a PTY on its own initiative.
   Only after there is somewhere to audit automations that is not the canvas itself.
30. **#14 tier 3 (web panels)** — only with an answer to the transform collision.
    Tier 4 (embedding a native app's real window) is a **no**, not a later.

## The structural decision underneath all of this

Eight separate entries (#3 file tree, #7 subagent nodes, #8 chat box, #9 integrations,
#12 Jira boards, #14 live document panels, #15 annotations, #24 edges) all need the same
thing:
**a canvas node that is not a terminal.** Today `Panel` means
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

## The second one, newer: a panel's lifetime now has more than two states

"Two lifetimes, not one" — the session outlives the React component — is the split M3
established and `CLAUDE.md` documents at length. M4b's dormancy work splits it again, and
several entries above depend on the result without saying so.

Three facts about a panel that used to move together have come apart:

- **It has a `PanelSession`** — true for every panel, including one restored from disk.
- **Its `SessionHandle` has ever been attached** — false for a dormant panel, which means
  its xterm buffer is empty, `tail()` has nothing to return, and `scrollPosition()`
  already documents its own version of this ("0 for a session that has never been
  attached").
- **It has a live PTY** — false for a dormant panel and for an exited one.

Note what dormancy is *not*: it is not a third `Tier`. `Tier` is still `'live' | 'card'`.
Dormancy is a flag on `PanelSession` plus a set passed into `assignTiers`, and it
**outranks focus** — a restored focused panel comes back as a highlight and a `Cmd+C`
routing target, not as a spawned process.

The consequence for this file: **anything that reads a panel's terminal content is
reading nothing at all on a freshly relaunched canvas.** #16's search is the entry where
this is fatal rather than cosmetic — an xterm-backed index over a restored canvas finds
nothing, silently. #5's glow, #22's far-zoom card, and #17's attention arrows are all
better off derived from facts the `Panel` itself holds — title, status, cost — than from
terminal output, and that is a design constraint rather than a preference.

The general rule, worth applying to every entry above: **ask which of the three facts a
feature needs, and what it does when the answer is "none of them yet".** A feature that
assumes a buffer exists will work perfectly for the whole session in which it was written
and be blank the first time the app is relaunched.
