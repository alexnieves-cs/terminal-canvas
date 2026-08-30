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

**Entries are deleted as they ship, and the numbers are never reused.** A gap in the
numbering means that idea is in the app — `README.md`'s milestone table says which
milestone put it there, and `CLAUDE.md` records what it cost. The numbers are stable ids
cross-referenced from other entries and from `CLAUDE.md`, so renumbering is never the
answer. Where a milestone shipped most of an entry and deliberately left part of it, the
entry stays but is **rewritten down to the part that is still open**, keeping the recorded
constraint attached to the half that still has to survive it.

**The numbers that are gone, and what took them.** Every one of these is still cited from
other entries in this file *and from comments in the source* (`settings-schema.ts` and
`commands.ts` both argue from #11; `layout-schema.ts` cites #6), which is why the numbers
have to stay legible after the entry is deleted. Read a reference to one as a reference to
shipped behaviour, documented in `CLAUDE.md` under the heading named here:

| Gone | What shipped it | Where the mechanism is written down |
|---|---|---|
| #5 agent-state glow | M6c | "A title is not a bell", "`wants-you` is sticky", "The glow reaches the card" |
| #6 user-set panel names | M6a | "The header's honest chain, and the backfill that must never happen" |
| #11 a settings surface with search | M6b | "One map, and a typed view over it", "Settings are a drill-in, not a flat list" |
| #29 restart a panel in place | M8c | "Restart is dispose-then-ensure at one id", "`bumpVersion()` exists because `ensure()` deliberately does not bump" |
| #44 honest chrome | M6a | "`reattached` costs a probe because `-A` erased the question" |
| #49 two copies of the app eating each other | M5c fix | "...and two copies of ONE build must not either" |
| #71 CI on a macOS runner | oss-beta | `.github/workflows/verify.yml`, and `verify:meta` 16 |
| #1 Cmd-held navigation grid | M11 | "The nav grid is the first held-modifier state in this app" |

Seven more entries were rewritten rather than removed, because a milestone shipped most of
each and stopped somewhere deliberate: **#2** (M7 left the merged view), **#17**
(M6d left the OS notification), **#27** (M5b left placeholders), **#34** (M5a left
per-preset environment), **#51** (M9a–c left discard), **#25** (M6 left snapping and
tidy), and **#41** (M12 left review's cwd resolution).

**A standing rule for everything below (this was #11, and it shipped in M6b): anything a
user can toggle goes in the one declarative settings schema** — a `SettingDef` in
`shared/settings-schema.ts` with an id, label, description, keywords, type and default —
never a bespoke home of its own. Declaring one there buys persistence, validation, a
searchable palette row and a menu item for free, and `CLAUDE.md`'s "A boolean `SettingDef`
mints a palette row nobody wrote" records the one obligation that comes with it: whatever
renders a setting must re-read on the settings reload, not only at mount.

**A second standing rule (#31): any feature that moves terminal bytes out of the panel —
to disk, to an index, to an export, to a server — is a disclosure surface, because agents
print secrets.** Six entries here do exactly that. Each of them owes an answer before it
ships, not after.

---

## 2. The workspace extras M7 did not ship

M7 shipped named canvases with create/rename/delete from the palette and the rail, switching
that demotes rather than disposes (a hidden workspace keeps its tmux sessions and loses only
its DOM), a per-workspace waiting count, and panel ids kept globally unique across every
workspace because `PanelId` doubles as a tmux session name. See `CLAUDE.md`'s "A workspace
switch is a second boot", "`activateWorkspace` takes the outgoing canvas, and that parameter
IS the mechanism", and "Panel ids are global, not per-workspace".

Three pieces of the original entry are still open, and each is blocked on something specific:

- **The merged all-in-one view** — still the exact `LIVE_BUDGET` collision this entry was
  written around. Nothing about M7 changed that constraint; it only made switching between
  separate canvases cheap. A view that shows every workspace at once is precisely the case
  that would try to exceed a global cap on live WebGL contexts, so tiering has to stay the
  thing that decides which ones are live.
- **Rubber-band select → *Move to new workspace*** — there is no gesture to hang it on until
  #52 (multi-select) exists.
- **A workspace-switching keyboard shortcut**, deliberately left unassigned; see `README.md`'s
  M7 paragraph for why.

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
- **The design pass that constraint asks for has LANDED, and the answer is written down.**
  M14 — `docs/superpowers/specs/2026-08-30-m14-credential-boundary-design.md` — is that
  pass, plus the smallest store and consumer that keep it from being a customer-free
  abstraction (the failure #11 warns about, and a credential store with nothing storing
  credentials is its purest instance). **The decision: a stored credential never reaches an
  agent's process** — not in the environment, not in argv, not in a file the agent can read.
  It ships as `main/credential-store.ts` over its own `userData/credentials.json`, encrypted
  through `safeStorage`, four `credential:*` invokes of which **none returns a secret**, and
  two source-text checks (`verify:meta` 20/21) rather than behavioural ones, because neither
  rule has a runtime symptom when broken. The reasoning is stricter than the app's existing
  posture on purpose and the spec says why at length: `shell-env.ts` already pours the user's
  whole login environment into every PTY and must, since that is how `claude` finds its API
  key — the axis is not the secrets' sensitivity but **whose decision it was**, and a token
  this app obtained through UI this app built is one the app would be handing over
  gratuitously. **A broker was considered and deliberately deferred**: agents reaching a
  loopback socket that holds no secret and proxies authorised calls is genuinely the
  strongest design, and the only one that survives an agent pasting its own environment into
  a log — but it is a milestone of its own, and it is strictly easier to build later on top
  of a store that never leaked than to retrofit onto one that did. The practical consequence
  for this entry: **the tier-1 and tier-2 reference implementations below are now
  unblocked**, and each inherits a boundary rather than having to invent one.
- **Sequencing advice:** pick **one** from tier 1 and **one** from tier 2 — Obsidian and
  GitHub — and build them as the two reference implementations. What they have in common
  becomes the integration surface; what they don't becomes the list of things that
  surface deliberately doesn't cover. Building a general plugin API before two concrete
  integrations exist is the classic way to get an abstraction that fits neither.

## 10. Light mode / dark mode

A theme the user picks — light or dark — plus, presumably, "follow the system".

- **The app half is now half-built, and M10 did the expensive half.** Every colour in
  `styles.css` is a token in a single `:root[data-theme="dark"]` block, structural tokens
  are declared on bare `:root` where a theme cannot reach them, and `verify:styles` 1, 7
  and 8 police that split from both sides — so a second theme is a second block rather
  than a sweep, which is exactly what this bullet asked for. What is missing is the
  switch: nothing sets `data-theme`, nothing reads `prefers-color-scheme`, and no light
  palette exists. Electron exposes `nativeTheme` in main and `matchMedia` in the renderer,
  so "follow the system" including live switching is still genuinely cheap.
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
- **`verify:styles` 11 is what makes a light theme checkable rather than argued.** It
  recovers every `--fg*` and `--s-*` hex from the theme block and computes real WCAG
  contrast for every text token against every surface it can land on, so a second block
  gets the same measurement for free. Read its header comment first: it renders nothing,
  so it can say the stylesheet obeys the rules and nothing at all about whether the app
  looks right. There is no visual regression test in this repo, deliberately.

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

## 17. Attention that reaches you outside the window

M6d shipped the in-app half: edge pips for off-screen `wants-you` panels (`edgeIndicator` in
`viewport.ts`, which clips a ray rather than clamping two axes, and treats partially visible
as visible), `Cmd+J` to fly to the next waiting panel *without* acknowledging it, a settings
toggle, and — in M8d — an Attention section in the rail. What is still missing is every
surface that works when this app is not the thing you are looking at.

- **An OS notification via Electron's `Notification`**, for the case where the window is
  behind something else. Nothing in `src/main` constructs one today.
- **A dock badge for the waiting count.** Cheap, and it is the one indicator that works when
  the app is not focused at all.
- **Constraint: main owns `wants-you` and must keep owning it.** The state is sticky, and
  focus (via `agent:acknowledge`) and a `pty:write` are the only two things that clear it. A
  notification that cleared it on click would be a third author of a fact main owns — the
  same shape of bug "One map, and a typed view over it" exists to prevent — and a badge count
  derived renderer-side would be a second derivation of a number `rail-sections.ts`'s
  `waitingCount` already holds.
- **Constraint: the waiting count does not survive a renderer reload.** `applyEvent` sends
  `agent:state` only on a change and nothing re-emits a snapshot to a fresh renderer, so
  after `Cmd+R` every count reads zero until the next real transition. Pips made that
  invisible; a dock badge makes it a number on screen that is wrong. See `CLAUDE.md`'s "M6d
  added no IPC channel" for why the obvious snapshot channel was declined twice — and note
  that a badge is the first customer that might genuinely change the answer.

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
- **Related:** this is what makes the nav grid (shipped in M11) and #17's attention arrows
  legible. All three are about the same view: the one where you can see everything and
  read nothing.
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

## 24. Edges between panels — the FUNCTIONAL half is what is left

**The decorative half shipped in M13**, as *links*. A user draws a directed,
optionally labelled line from one panel to another; it persists, it survives a
reload, and closing either endpoint removes it in the same undoable step. See
`CLAUDE.md`'s "The code says `link`, and `edge` already means something else"
and the eleven entries after it, and
[`docs/superpowers/specs/2026-08-30-m13-panel-links-design.md`](superpowers/specs/2026-08-30-m13-panel-links-design.md).

The entry stays because #24 named **two flavours and said they should not be
built at once**. One was built. This is the other.

- **Functional edges — the open half.** An edge that *does* something: pipe
  this panel's output into that one's input, or "restart this one when that one
  exits". Genuinely powerful and genuinely dangerous, because it means the
  canvas is writing to PTYs on its own initiative. Everything #21 says about a
  mode you can forget you are in applies double to a rule that fires while you
  are not present.
- **Open question, unchanged and now the blocking one:** if the functional
  flavour happens, is the edge the *only* place that behaviour is expressed? A
  rule you can only see by finding a line on the canvas is hard to audit. This
  may be the point at which the canvas needs a plain list view of its own
  automations — and that list, not the edge, is probably the real feature.
- **What M13 leaves ready.** The primitive is built generally rather than as a
  private detail of #7's subagent visualisation, which is what #24 asked for:
  same renderer, same z-order answer, same persistence. #7's parent-to-subagent
  edges can render on `LinkLayer` without inventing a second scheme.
- **Constraint, now discharged:** edges join `Panel.z`'s ordering rather than
  inventing a second scheme — the layer sits at `z-index: 0`, beneath every
  panel, since `nextZ` mints `z >= 1` — and they take no `LIVE_BUDGET` slot and
  no WebGL context.
- **Constraint, now discharged:** the dangling-edge question has an answer in
  two places, and it needs both. `removePanel` prunes incoming links in memory,
  in the same committed gesture as the close, so one `Cmd+Z` restores the panel
  and its links together; `parseWorkspace` drops a link naming a panel that did
  not survive validation, because a file can be hand-edited between launches.
- **Constraint the functional half inherits:** a functional edge would have to
  survive the same rule the decorative one does — the completing gesture must
  never wake a dormant panel (`verify:panels` 126). A rule that *fires* on a
  dormant panel is a harder version of the same question, and M13 does not
  answer it.
- **Deliberately still absent, and each is a decision rather than an
  oversight:** link selection on the canvas (the inspector is the only surface
  that acts on a link, because a hairline at `MIN_SCALE` is a sub-pixel target
  and hit-testing one would cost `pointer-events: none`); routing (a link is a
  straight segment and passes under intervening panels); culling and any bound
  on link count; and cross-workspace links, which are representable — `PanelId`
  is global — and render as nothing.

## 25. Where a new panel goes — placement, snapping, and tidy

Spawn placement landed in M6 (below); what is still missing is everything that keeps the
result legible once panels are created and destroyed at will — alignment guides while
dragging, snapping, and a "tidy" command.

- **Why it fits:** an infinite canvas's characteristic failure is entropy. Twenty panels
  placed by twenty individual decisions become an unnavigable sprawl, and the feature that
  prevents it is not a new capability but a small amount of arithmetic applied at the right
  moments. This is the difference between a canvas that feels designed and one that feels
  like a desktop full of overlapping windows.
- **Three separable pieces, all small, all in code that already exists:**
  1. ~~**Spawn placement**~~ — **done, and the answer was narrower than this bullet.**
     `cascadeCentre` (`panels/panels.ts`) steps a spawn down-and-right only when a panel is
     already centred at the requested point, tests panel **centres** rather than rect
     overlap, and wraps rather than marching a panel outside the cull region where it would
     never spawn at all. The first-fit-over-rects version proposed here is the overlap rule
     `verify:viewport` 51 now exists to reject: overlap is the normal state of a working
     canvas, so a non-overlap spawn rule steps nearly every press away from where the user
     is looking. See `CLAUDE.md`'s "Cmd+N cascades, and the test is CENTRES, not overlap".
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

## 26. The agent's toolbox — skills, MCP servers, plugins, subagents, hooks

One surface to see, manage, add, and update everything that extends the agent CLIs the
canvas runs: skills, MCP servers, plugins, custom subagents, slash commands, hooks, and
permission settings. Which of them exist, which are active *here*, what each one does, and
an obvious way to change any of it.

- **Why the canvas is an unusually good home for this, and it is not "because it's a nice
  UI".** These extensions resolve **per project**. The same `claude` binary in two panels
  has two different sets of skills and MCP servers active, because one panel's cwd has a
  `.claude/` and the other's does not. Every existing tool for managing this shows you
  *one* scope at a time — you are in a directory, you see that directory's config. A
  canvas holds twelve panels in twelve directories at once, **and each panel already knows
  its cwd**, so it is the only place where "which of these agents can actually do X" is a
  question the UI can answer. That is the differentiating claim, and it is worth building
  toward rather than shipping a generic config editor that happens to live in this app.
- **The cost is far lower than it looks, and this is the important estimate.** This reads
  like a big integration feature — five subsystems, several vendors — and it is not. All
  of it is **files on disk in known locations**, in two scopes:
  - user-global: `~/.claude/skills/`, `~/.claude/commands/`, `~/.claude/hooks/`,
    `~/.claude/plugins/`, `~/.claude/settings.json`, and `~/.claude.json` for MCP servers;
    `~/.codex/` for the other vendor.
  - project-local: the `.claude/` directory beside the panel's cwd, which is also where
    `CLAUDE.md`, `.mcp.json`, and project settings live.
  So this is **#9's tier 1** — "local files with an open format" — not tier 2. No OAuth, no
  token storage, no HTTP client, no new trust boundary. It is a watched directory, a
  schema per file type, and a renderer. That is the same machinery as #3's file tree and
  #14's watched local-file panel, which is a strong argument for building it *after* one
  of those exists rather than in parallel with it.
- **Read first, write second, and the line between them is sharper here than usual.**
  Listing what is installed and what is active is inert. Editing it is not: hooks are
  arbitrary code that runs on tool calls, permission settings decide what an agent may do
  without asking, and an MCP server is a process with its own reach. The app is not
  introducing that risk — an agent with shell access can already rewrite any of these files
  — but a one-click toggle in a UI is a very different affordance from a file an agent had
  to deliberately edit. Ship the browser, then decide about the editor.
- **Constraint: an MCP server is a process, and #18 should count it.** MCP servers are
  spawned by the CLI, not by `PtyManager`, so they are grandchildren of the panel's PTY
  rather than anything main owns. A per-panel cost readout that samples only the pid and
  misses its children will under-report a panel running four MCP servers by most of its
  actual cost — which is exactly why #18 specifies sampling *the pid and its children*.
  A toolbox that shows "this panel has 4 MCP servers active" alongside "this panel is
  using 2.1 GB" is the pairing that makes both entries worth more than either alone.
- **Constraint: config is read at CLI startup, so changing it mid-session mostly does
  nothing.** A UI that lets a user enable a skill and then silently fails to apply it to
  the running agent is worse than no UI. This needs an honest stance — show which panels
  are running with stale config, and offer to restart them — and **the app has no
  restart-in-place path today**: `dispose(id)` is the only way out of a session and it
  burns the panel id. Adding one means a third legitimate caller into `pty.kill`, which is
  precisely what "two lifetimes, not one" exists to police. Do not let a config UI be the
  feature that quietly introduces it.
- **Constraint: model the concepts vendor-neutrally.** A skill, an MCP server, and a plugin
  are different things, but the *inventory* is the same shape: id, kind, scope
  (user/project), source path, enabled, description. Keep that neutral with a thin adapter
  per vendor — the same argument #12 makes for tickets and #19 makes for usage — and do not
  build the abstraction until Codex or another CLI actually wants it.
- **Constraint: chrome or panel kind, and it is worth deciding rather than drifting.** A
  global inventory is chrome, like #3's sidebar and #11's pane, and lives outside the
  `.world` transform. But "the toolbox for *this* panel" is panel-scoped information and
  is much more natural as a panel kind sitting next to the agent it describes — which makes
  it a good second consumer of #14's union rather than a reason to invent a third pattern.
  Probably both, sharing one inventory model.
- **Open question: does this overlap #11 or is it separate?** Both are "a searchable
  surface for configuration". The honest split is that #11 owns *the canvas app's own*
  settings, and this owns *the agents' capabilities* — different data, different owner,
  different blast radius. They should share the search behaviour and the schema-driven
  rendering approach, and share nothing else. Deciding otherwise means one pane where
  turning something off changes a window colour and turning the next thing off grants an
  agent filesystem write access, which is a bad pane.
- **Open question: does the canvas ever *author* these, or only manage them?** "Turn this
  panel's last hour into a skill" is a genuinely interesting feature and a much larger one.
  Note it and move on.

## 27. Prompt placeholders — the half of the prompt library that did not ship

M5b shipped the library itself: a saved-prompt store, project `.claude/commands/*.md` read
per panel cwd and merged with it (never deduped, each row labelled with its source, capped
and read-only), and insertion into the captured panel as a bracketed `paste()` rather than a
raw `write()` — the distinction this entry called load-bearing, and which `verify:panels` 40
is the only check in the repo able to tell apart. The fork this entry raised was decided in
favour of interop: project prompts are read, never written, because authoring a file someone
will commit is a decision to ask for rather than acquire as a side effect of "save".

What is still missing is expansion. `{{cwd}}`, `{{branch}}`, `{{selection}}`, `{{panel}}` —
a prompt that expands "review {{selection}} in {{cwd}}" is a meaningfully different tool from
one that pastes fixed text, and `layout-schema.ts`'s `Prompt` comment says outright that
placeholders are deliberately not part of that type yet.

- **Constraint: `{{cwd}}` needs the machinery #41 owns.** A panel's `spec.cwd` is where it
  was *spawned*, not where its shell is now, so an expansion built on it is confidently wrong
  for exactly the panel a user has `cd`'d somewhere on purpose. `{{branch}}` is a git read,
  which is main's.
- **Constraint: the values do not all live on one side.** `{{selection}}` is `getSelection()`
  on a renderer-side `SessionHandle`; `{{cwd}}` and `{{branch}}` are main's. Whichever side
  composes the final string, the other has to ship it a value rather than a guess.
- **Constraint: a project prompt is a file this app does not own.** Expanding a placeholder
  the CLI's own format does not define makes the same file behave differently inside the app
  than in a plain terminal, which is the whole thing the read-only decision bought.
- **Worth resisting, unchanged:** automatic capture ("you have typed this five times — save
  it?"). It requires retaining everything the user types in order to notice, and the user's
  typing includes credentials (#31).

## 28. Accounts — sign in with Google or an emailed code, and data that follows the user

Sign in with a Google account, *or* type an email address → receive a six-digit code →
set a password. From then on the user's data — layouts, workspaces, settings, prompt
library — is associated with the account and restored on any machine they sign in on.

- **The cost review, because it was the condition on capturing this at all: yes, the
  whole flow can be built and run for $0**, at hobby-to-small-team scale. Every piece has
  a free tier that covers it, and none of them require a card on file:
  - **Google sign-in is free, with no paid tier at all.** For a desktop app you register a
    "Desktop app" OAuth client and use the **loopback + PKCE** flow through the system
    browser (Google has long refused the embedded-webview flow). No client secret ships in
    the app. The `openid email profile` scopes are *non-sensitive*, so this avoids both the
    OAuth verification queue and the third-party security assessment that only *restricted*
    scopes (Gmail/Drive contents) trigger — that assessment is the one real five-figure
    line item in this space, and this idea never goes near it.
  - **The identity backend is free.** Supabase's free plan includes social OAuth providers,
    email OTP, and custom SMTP; Firebase Auth's free tier covers the same at a far higher
    MAU ceiling than this app will see. Either gives "email → six-digit code → set a
    password" as two existing calls rather than a system to build.
  - **The email that carries the code is the only place a cost can sneak in.** Supabase's
    *built-in* SMTP is capped at **2 auth emails per hour** — fine for development, useless
    the moment two people sign up in the same hour — so a real deployment must attach an
    SMTP provider. Resend's free tier is 3,000/month but its one free custom domain implies
    **owning a domain (~$12/yr)**. The genuinely-zero routes are a provider that allows
    single-sender verification instead of domain verification, or plain Gmail SMTP with an
    app password. **This is the detail to decide before starting, not after** — it is the
    difference between $0 and a recurring bill, and it is invisible until the first hour
    two users sign up.
  - **Storing the data is free.** A layout file is kilobytes; the free database and object
    tiers are sized in hundreds of megabytes. What *isn't* free is the free plan's dormancy
    behaviour — Supabase pauses inactive free projects — so the app has to treat "the
    backend didn't answer" as an ordinary state, not an error.
  - **Explicitly excluded as costed:** *Sign in with Apple* requires a $99/yr Apple
    Developer membership. It is the natural third button on macOS and it is the one that
    is not free. Leave it out, and note that the same $99 is already implied by signing
    and notarising the app for distribution — so if that bill ever exists for other
    reasons, this becomes free too.
- **The honest architectural cost, which is larger than the dollar cost.** Today this
  app's entire security posture is "the renderer has no network and no fs, and main owns
  everything." Accounts break that in the same way #9's integrations do: a token exists,
  it lives somewhere on disk, and every panel on the canvas is an agent that can run
  arbitrary commands and read arbitrary files. **This shares #9's trust-boundary design
  pass and should not get its own** — a session token in `~/.config` next to a canvas full
  of coding agents is exactly the case that pass exists to think about. macOS Keychain via
  Electron's `safeStorage` is the obvious floor, not the ceiling.
- **Constraint — the OAuth callback must not touch the window (`window-lifecycle.ts`).**
  Sessions die with their renderer on purpose: a navigation or reload kills every PTY. An
  OAuth flow that navigates the main window, or that returns by redirecting it, would
  therefore destroy every running agent to sign someone in. The loopback flow avoids this
  by construction — main opens the system browser and listens on `127.0.0.1`, and the
  renderer never navigates — but this is the failure mode to watch for, and it fails
  loudly enough to be found immediately, which is the good case.
- **Constraint — what "their data" actually means depends on M4b's format.** The thing
  worth syncing is the persisted layout, and #2 already argues that file should be a keyed
  collection of named workspaces rather than one record. Accounts is the second reason for
  that same decision: syncing one implicit blob per machine is not a feature, and "which
  canvas do I get on my laptop" is unanswerable without names. **This does not add a new
  requirement to M4b — it adds weight to #2's existing one.**
- **The question that decides whether this is worth building at all: what is sync's
  conflict story?** A layout edited on two machines is a merge problem, and a panel is not
  a document — its position and size merge fine, but "this panel is running `claude` in
  `~/work/api`" does not, because the process only exists on one machine. The defensible
  first version is **the account owns layouts and settings; the machine owns processes**.
  A restored panel on a second machine is a dormant panel (which M4b already built), not a
  spawned one. Anything more than that is M4c's tmux question wearing different clothes.
- **Sign-in must be skippable, and the local path must stay first-class.** This is a
  terminal on a canvas; requiring an account to open one would be a strictly worse product
  for the person it is being built for. Accounts are for carrying data between machines,
  which is a thing some users want sometimes — the app has to work fully having never
  seen a network. That also keeps the free tier free: nobody signed in is nobody's MAU.
- **Where the UI goes:** the standing rule (#11) applies — this is a settings entry with
  an account section, not a launch-time modal and not a new home of its own.

## 30. Durable scrollback — the thing #16 is actually gated on

Terminal output that survives the panel being restarted, the app being relaunched, and the
renderer being reloaded. A per-panel log on disk, and a way to look back through it.

- **#16 already says search is "gated on durable scrollback, a bigger question than search
  itself". This is that question, costed on its own** — which is what that entry asked for
  and what nothing here currently provides.
- **The problem is sharper than "we would like history", because of dormancy.** The
  closing section of this file states it: a restored panel's xterm buffer is empty, so
  `tail()` returns nothing and anything reading terminal content reads nothing at all on a
  freshly relaunched canvas. Every panel on the canvas is in that state the moment the app
  starts. Durable scrollback is the only thing that makes a restored canvas show what it
  showed yesterday, and without it #22's far-zoom card, #16's index, and #39's export are
  all blank on exactly the run where the user most wants them.
- **Where it gets written is already decided, and it is not the renderer.** `pty-manager.ts`
  already coalesces thousands of reads/sec into a flush every `FLUSH_INTERVAL_MS`. The log
  write belongs *in that flush* — one append per flush, main-side, next to the IPC send.
  Writing per read is the same flood the batching exists to prevent, and writing from the
  renderer means the bytes cross IPC before being written back down to the same disk.
- **Constraint: this is an append stream, not `layout-store.ts`'s pattern.** The layout
  store's write-temp-then-`renameSync` is exactly right for a few kilobytes of state
  written twice a minute, and exactly wrong for a byte stream from twelve processes. Copying
  it here rewrites the whole log every 16ms. Different data, different mechanism — and this
  is the third "state that survives a relaunch" in the app, so #27's warning about three
  independent implementations of atomic writes applies in reverse: **this one is
  legitimately different and should say so where someone will read it.**
- **Constraint: retention and caps are the feature, not a footnote.** An agent building a
  project can emit hundreds of megabytes in an afternoon, and twelve panels do it in
  parallel. A ring buffer per panel with a byte cap, plus an age cap, plus a visible total
  in #18's cost readout, is the shippable shape. Unbounded is not a v1 with a to-do; it is
  a disk-full bug with a delay fuse.
- **Constraint: this is where #31 stops being theoretical.** Everything an agent prints,
  including whatever it echoed from a `.env`, becomes a file on disk that outlives the
  session. Redaction and an explicit retention setting are part of shipping this, not a
  follow-up.
- **Two different logs are being conflated across this file, and it is worth separating
  them now.** Raw PTY bytes (this entry) are what a terminal showed. The agent CLI's own
  transcript — the JSON the vendors already write — is what the agent *did*, and it is what
  #7's subagent visualisation and #19's token accounting actually want. They are different
  sources with different fidelity and different vendor coupling. Build the byte log for
  display and search; build the transcript watcher, once, for structure.
- **Open question: is there a timeline UI, or only search?** Scrubbing a panel back through
  its own history — "show me this panel twenty minutes ago" — is the thing an infinite
  canvas could do that a terminal cannot. It is also much more than a log file, since
  replaying bytes into a terminal to reconstruct a past frame is a real emulator problem.
  Note the ceiling; ship the log.

## 31. Secrets in agent output — a standing rule, like the settings one

**Cross-cutting.** Agents print API keys. They `cat` a `.env` to check it, echo a token in
a curl command, or paste an error containing a session cookie. Today that text lives in one
xterm buffer in one process and dies with the window. Six entries in this file move it
somewhere else, and each does so silently.

- **The rule, stated once so every entry inherits it: any feature that takes terminal bytes
  out of the panel is a disclosure surface and must say what it does about it.** #30 writes
  them to disk, #16 indexes them, #39 exports them, #28 syncs them to a server, #19 and #7
  read a vendor's transcript, and a crash report would attach whatever was on screen. None
  of those is wrong; all of them need an answer, and the answer must exist before the
  feature ships rather than after the first user pastes a log into a bug report.
- **Why it belongs in this file rather than in a security doc:** the app's current posture
  is genuinely narrow — the renderer has no fs and no network, main owns every process, and
  the CSP forbids remote anything. That narrowness is doing a lot of work, and it makes the
  first feature that widens it disproportionately expensive. Recording the rule beside the
  ideas is what stops it being rediscovered by the one that widens it.
- **The precedent already set, and worth generalising:** #27 refuses automatic prompt
  capture specifically because "the user's typing includes credentials". That is this rule
  applied to input. This entry is the same rule applied to output, where the volume is
  thousands of times larger and the user never chose to type any of it.
- **Constraint: detection is heuristic and must fail toward the user, not toward silence.**
  Regexes for the well-known key shapes catch a lot and will never catch everything.
  Redaction that silently drops a line an agent needed is its own failure. The honest
  shapes are: redact in anything that *leaves the machine*, mark-and-warn in anything that
  stays local, and never redact the live terminal itself, which is the user's own screen.
- **Constraint: the login-shell probe is a second copy of the same problem.**
  `shell-env.ts` captures the user's entire environment once at startup so every PTY
  inherits it — which is correct, and means the app holds a process-wide object full of
  exported tokens. Anything that serialises app state for diagnostics must know not to
  include it.
- **Where the UI goes:** a settings entry under #11 with three honest states — off, warn,
  redact-on-export — and a plain-language sentence about what each does. Not a security
  dashboard.

## 32. A keyboard-first canvas — and the accessibility that comes with it

Move between panels, place them, and drive the camera without the mouse — and make the
result usable by someone who cannot use a trackpad, cannot see the glow in #5, or needs the
motion in #23 to stop.

- **Why this is not the same idea as the nav grid (shipped in M11).** The nav grid is a
  hold-to-reveal jump to a *workspace*. This is the ordinary case: the focused panel is
  here, the next one is to its right, `Cmd`+arrow should go there. The math is pure
  `viewport.ts` work over rects the app already holds — pick the nearest panel in a
  direction cone — and belongs in the plain-node verify bundle beside the rest of it.
- **The trap, and it is a good one: keyboard traversal must move *selection*, not focus.**
  `assignTiers` pins the focused panel live unconditionally. So arrowing across a
  twelve-panel canvas with focus attached to the cursor promotes twelve panels, spawns
  twelve PTYs on a restored canvas, and blows through `LIVE_BUDGET` on the way. This is the
  exact argument M4b's dormancy makes — "spawning because the camera drifted over it is a
  decision the app would be making on the user's behalf" — restated for the keyboard.
  Traversal highlights; a second, deliberate key focuses.
- **Constraint: bare keys belong to the TUI, and that constrains this more than anything
  else.** Every canvas shortcut is `Cmd`-gated because agent TUIs claim every bare key —
  including `Tab`, which is autocomplete in every one of them, and `Escape`, which is how
  you interrupt an agent. So the conventional accessibility answer (tab through the
  controls) is unavailable *inside* a focused panel, and the app has to be honest about
  where the boundary is: chrome is tabbable, a focused terminal is not, and there must be
  one obvious `Cmd`-gated key that gets you out.
- **Constraint: screen readers and xterm are a real cost, not a checkbox.** xterm has an
  accessibility mode that maintains a live DOM mirror of the buffer, and it is expensive
  precisely because everything else in this app avoids DOM text under WebGL. It should be
  a setting (#11), off by default, on for people who need it — and it interacts with
  tiering, since a carded panel has no mirror to read.
- **Constraint: `prefers-reduced-motion` applies to the camera, and nothing else in this
  file has claimed it.** #23's zoom-to-fit animation, #17's attention jumps, and any future
  tidy transition (#25) all move the entire world. For a motion-sensitive user that is the
  worst possible thing to animate. Honour the media query by cutting rather than easing.
- **Cheap and immediately worth it:** every panel's own zoom-to-fit already being planned
  in #23 means "focus the next panel and frame it" is two existing pieces, not a new one.

## 33. A minimap — knowing where you are without zooming out

A small always-visible map of the whole world in a **top corner** — left or right, the
user's choice — showing every panel as a rectangle and the current viewport as a moving
frame, with click or drag to go there. **Toggleable on and off in settings**, like
everything else the user can turn on.

- **Why it fits:** the canvas is infinite and there is currently exactly one way to find
  out what is on it, which is to fly around looking. `CanvasHud.tsx` already establishes
  that a small piece of chrome telling you where the camera is earns its space.
- **It is close to free, because the data is already state.** Panel rects, `z`, and the
  viewport are the whole input. The map is a second projection of the same world with its
  own scale — `viewport.ts`'s math with a different `k` — so it is pure, testable under
  plain node, and needs no IPC, no process, and no WebGL budget.
- **The corner is a top corner because the bottom-right is taken.** `.canvas-hud` is
  `position: absolute; right: 12px; bottom: 12px`, so top-left and top-right are the two
  free corners and either works. Making it a preference rather than a hardcoded corner is
  cheap — it is one CSS class swap on an absolutely-positioned box — and it matters more
  than it sounds, because #3's file tree is a **left** rail and #11's settings pane is a
  panel of chrome that has to live somewhere too. Whichever corner the minimap claims, it
  claims against those, so let the user resolve the collision rather than guessing.
- **The toggle is a settings entry, per the standing rule (#11), and this is a good early
  test of it.** It is the ordinary shape that rule was written for: a boolean, a default,
  a label, and a place in a searchable list — no bespoke menu item, no undiscoverable
  shortcut as its only home. Its persisted value goes where M4b's layout state goes, not
  into a new store (same argument as #27 and #34). **Default it off**: a new user has a
  handful of panels and no navigation problem yet, and the minimap costs screen area from
  the moment it exists.
- **Constraint: it is the first chrome that competes for the pointer, and the wheel
  listener is the thing to get right.** The HUD is `pointer-events: none`, so it has never
  had to think about this; a minimap you can click and drag emphatically cannot be. The
  wheel handler is installed on the canvas host in the **capture** phase with
  `passive: false`, which means a wheel over the minimap reaches the camera *before* the
  minimap sees it — so scrolling over the map pans the world underneath, which is not what
  the user meant. Whatever `shouldYieldWheel` grows into has to know about chrome as well
  as panels, and this is the entry that forces the question.
- **Constraint: dragging the viewport frame is camera movement, and the camera setter is
  private on purpose.** `useViewport.ts` keeps its setter private precisely so nothing
  outside can move the camera. A minimap is a legitimate second driver of the camera and
  therefore needs an intentional, named intent (`panTo`/`centerOn`) alongside the existing
  ones — not an exported setter, which is the shortcut that would quietly end that rule.
- **Constraint: it is chrome and lives outside `.world`.** Same rule #3's sidebar and #11's
  pane follow. A minimap inside the transformed layer would scale with the camera, which is
  the one thing a minimap must never do.
- **Constraint: render it from `Panel` facts, never from terminal content.** The closing
  dormancy rule in this file, applied directly: a thumbnail of what a panel is *showing* is
  blank for every panel on a freshly relaunched canvas. Title (#6), status, and colour (#5)
  are facts the `Panel` holds and survive a restart; the buffer is not and does not.
- **The honest question, worth asking before building it: does #22 make this redundant?**
  Semantic zoom exists to make the zoomed-out view legible. If it succeeds, "zoom out" *is*
  the overview and a minimap is a second, smaller copy of it. The counter-argument is that
  a minimap is visible *while you work*, at working zoom, which zooming out is not — and
  that is the version of this worth building: a persistent locator, not an overview mode.
- **Open question: does it show groups (#35) and annotations (#15), or only panels?** A map
  that shows only terminals on a canvas that has become an agentic workspace is a map of
  the wrong thing.

## 34. What a preset still cannot carry — environment, and template sets

M5a shipped presets: a named `cwd`/`command`/`args`/default box, persisted beside the layout,
spawnable from the Presets menu, from the palette, and as `Cmd+N`'s default; M8c added "save
the *selected* panel as a preset" through one shared mint so the two save surfaces cannot
disagree. The prediction in this entry held exactly — a form wants a default value, and the
absent-`command` rule is now the most expensive invariant in the app (`CLAUDE.md`, "An absent
`command` must stay absent through four layers"). Two pieces are still open, and they are the
two that were never about naming a spawn:

- **Per-template environment overrides.** `shell-env.ts` resolves one environment at startup
  for every PTY; per-preset overrides are a merge on top of it, computed main-side at
  `pty:create`, with the renderer shipping only the overrides — which is also what keeps
  #31's "main holds the environment" boundary intact.
- **"New workspace from a template set"** — three panels, three directories, three agents,
  one gesture. This is the version of the idea that changes how the app is used rather than
  saving keystrokes, and now that #2 has landed there is somewhere for it to land. A preset
  is one panel; a set is a new record, and it belongs beside `presets` in the layout format
  rather than in a fourth store.
- **Open question, unchanged: does capturing a running panel capture its environment?** M8c
  proved the spec half is free, because it is already on the session. The env is not free,
  because capturing a running panel's env captures its secrets — #31.

## 35. Groups — a labelled region that owns what is inside it

Draw a box around several panels, name it, and have it behave as one thing: drag the group
and its panels come with it, collapse it and they card, colour it and the canvas gets
regions that mean something.

- **Why it fits:** this is the middle scale the app is missing. A panel is one process; a
  workspace (#2) is a whole canvas. "These four panels are the auth refactor" is neither,
  and it is the unit people actually think in. It is also the cheapest way to make a
  twelve-panel canvas legible, because the labelling is spatial rather than a list.
- **Constraint: dragging a group is `applyDrag` N times, and the caller-side rule applies N
  times.** The gotcha is already written down — recompute every frame from the gesture's
  **origin** rects, never from the previous frame's result, or the group shears apart at
  low zoom and breaks outright if the user zooms mid-drag. One panel makes that mistake
  survivable; four make it visible.
- **Constraint: a group must not touch array order.** Stacking is `Panel.z`, never array
  order, because React reconciles a reordered keyed list by moving DOM nodes and a move
  detaches a live terminal's host. "Bring group to front" is therefore a `z` rewrite across
  its members, exactly like `raisePanel`, and the temptation to model a group as a nested
  array of panels is the temptation to reintroduce that bug structurally.
- **Constraint: collapsing is a tier hint, never a kill.** A collapsed group should card its
  members — which is what tiering already does, and is free — and must not reach `dispose`.
  This is "two lifetimes" again, arriving through a new door. The interesting variant is
  whether a collapsed group should be allowed to *hold* panels below the live budget
  deliberately, as a user-facing way to say "these are running but I am not watching them".
- **This is the second-cleanest candidate for the panel-kind union**, after #14: a group is
  a canvas node that is not a terminal, costs nothing against `LIVE_BUDGET`, and has no
  session at all. If #14 is not scheduled first, this is the entry that will otherwise get
  faked as a special case.
- **Open question: is a group a workspace you can see?** If groups exist, #2's "move
  selection to a new workspace" becomes "promote this group", and the two features start
  looking like one feature at two zoom levels. Worth deciding rather than discovering.

## 36. Panel typography — font size, and why it is a resize wearing a hat

Let the user set the terminal font size and family, per panel or globally. The most
requested setting in the history of terminal emulators, and in this app it is not a
cosmetic one.

- **The load-bearing fact: changing font size changes `cols`/`rows`.** The `FitAddon`
  divides the host box by the cell metrics; bigger cells mean fewer columns, which means a
  `pty:resize`, which means a SIGWINCH, which means a full-screen agent TUI repaints its
  entire frame. So this is governed by the same rule as dragging a resize handle: **commit
  on release, not live.** A slider that refits on every tick is sixty full repaints a second
  through a 16ms-batched channel, which is precisely what `onCommit`/`registry.refit` exist
  to avoid.
- **The invariant most likely to be broken by this feature: zoom is not font size.** "One
  transform, not N layouts" means a CSS `scale()` is invisible to `getComputedStyle` and
  `ResizeObserver`, so zooming *cannot* change a panel's grid — deliberately, because the
  alternative reflows every running shell on every pinch. An implementation of "make the
  text bigger" that reaches for the camera, or that makes zoom adjust font size to
  compensate, converts a working invariant into a reflow storm. They are different
  operations that happen to look similar on screen, and the comment explaining that belongs
  in the code the first time someone adds this.
- **Constraint: `cellSize()` feeds the pointer corrector.** `pointer-correct.ts` divides by
  transform-blind cell metrics to rewrite click coordinates. It reads them live, so a font
  change is safe *as long as nothing caches them* — and a per-panel font setting is a strong
  incentive to cache. `verify:panels`' `__m4aCellToScreen` hook is the check that would
  catch a stale cache, and it should be run against a resized font before this ships.
- **Constraint: persisted, and the format already shows how.** `PersistedPanel.title` is
  reserved as an optional field with a note that readers must tolerate its absence. A font
  override is the same move: one optional field now, no migration later.
- **Open question: global default with per-panel override, or per-panel only?** Global is
  what people expect; per-panel is what a canvas is *for* — a panel you are watching from
  across the room at 12pt is legitimately different from the one you are typing in. Both,
  with the global as the fallback, is probably right and costs one extra resolution step.
- **Related and nearly free:** the same plumbing carries #10's theme into xterm, since both
  are `Terminal` options fanned across every session in the registry. Whichever ships first
  should build the fan-out, not a one-off.

## 37. Sound — the channel that works when you are not looking

Short distinct sounds for the state changes #5 detects: an agent finished, an agent is
asking a question, a command failed. Optional, off by default, and immediately the highest
value-per-byte feature in this file for the one case that matters most.

- **Why it fits, and why it is not a gimmick:** #17 exists because an agent finishing while
  its panel is off screen tells you nothing. Sound is the only channel that also works when
  the *window* is behind another app — which is the actual situation, since the user went to
  do something else precisely because the agent was going to take four minutes. Edge
  indicators require looking at the canvas; a notification requires the OS to be in the
  mood; a sound does not.
- **It is nearly free once #5 exists**, and it is genuinely free before that, because
  **the bell is already arriving.** Agent CLIs ring the terminal bell when they want
  attention, xterm surfaces that as an event, and nothing in the app listens today. That is
  a real completion signal, emitted by the vendor, needing no heuristics and no transcript
  watching — the cheapest honest version of #5's detection, available now, and worth wiring
  before any inference-based approach.
- **Constraint: it must be per-panel-attributable, or it is noise.** "Something finished"
  across twelve panels is worse than silence. The sound has to arrive with a visual — the
  panel flashing, an edge indicator pointing at it (#17) — so the ear says *when* and the
  eye says *which*.
- **Constraint: mute, do-not-disturb, and a per-panel opt-out are part of v1.** A panel
  running a build that rings twelve times is a feature the user turns off permanently after
  one afternoon. Under #11, with a global mute reachable in one gesture.
- **The second half, and it is a different feature wearing the same word: speech into a
  panel.** Dictating a prompt is plausible and the canvas is a good place for it (long
  prompts, hands on nothing). It must arrive through `paste()`, not `write()` — the same
  bracketed-paste requirement #27 documents, and for the same reason: a dictated paragraph
  written raw is several partial submissions. Note it; it is a much larger feature and
  should not be smuggled in beside earcons.

## 38. First run — what an empty infinite canvas teaches

M4b made the canvas restore what was there last time. The corollary nobody has designed
yet: on a first launch there is nothing there, and an empty infinite canvas is
indistinguishable from a broken one.

- **Why this is worth an entry rather than a to-do:** `SEED_PANELS` is twelve hand-authored
  panels, and it is scaffolding — it exists so there is something to render, and every
  argument in this file about placement (#25), templates (#34), and dormancy assumes it goes
  away. The moment it does, the first thing a new user sees is a grey field with a zoom
  percentage in the corner and no affordance whatsoever, because **every canvas shortcut is
  `Cmd`-gated by design and therefore undiscoverable by design.** That trade was made for a
  good reason (bare keys belong to the TUI) and it hands the entire discovery burden to the
  first-run experience.
- **The right shape is almost certainly not a tour.** A modal walkthrough of an app whose
  whole pitch is "it is a canvas, put things on it" is a contradiction. The candidates worth
  weighing are: a canvas that starts with *one* panel and a nearby annotation (#15) saying
  what the gestures are; a persistent hint layer that fades once each gesture has been used
  once; or a template picker (#34) as the empty state, so the first action is "make a
  workspace" rather than "make a shell".
- **Constraint: the first panel must be created through the real path.** A hardcoded
  first-run panel is `SEED_PANELS` again with a nicer name, and it will diverge from
  whatever #25 decides about placement and whatever #34 decides about specs. Whatever the
  empty state offers, it should call the same create path a user's own gesture calls.
- **Constraint: it interacts with dormancy in a way that is easy to get backwards.** A
  restored canvas is *not* a first run, but it looks like one until panels are woken — no
  output, no processes. The empty state must key off "there are no panels", never off
  "nothing is running", or it appears on top of a perfectly good restored workspace.
- **Adjacent and cheap: an honest failure state for the shell probe.** `shell-env.ts` logs
  loudly when the login-shell probe fails, and the user-visible consequence is "command not
  found" in every panel with no explanation. First run is where that lands, and a one-line
  banner naming the actual cause is worth more than most of this entry.

## 39. Export and share — a screenshot, a transcript, a receipt

Take what is on the canvas out of the app: an image of a region, a panel's output as text,
a summary of what an agent did. The unglamorous half of "the canvas is where work happens"
is that work has to leave.

- **Why it fits:** every current path out of this app is a manual selection and `Cmd+C` from
  one panel. The canvas's own artifacts — the arrangement, the annotations (#15), the edges
  (#24), which agents ran where — have no representation anywhere else, which means none of
  the thinking the canvas holds can be sent to anyone.
- **The silent failure to know about before starting: a naive DOM-to-image capture renders
  every terminal blank.** The panels are WebGL-backed, and a WebGL canvas does not appear in
  a DOM serialisation; even a direct `toDataURL` on it comes back empty unless the context
  was created with `preserveDrawingBuffer`, which the app does not do and should not start
  doing (it costs memory on every context, and there are up to `LIVE_BUDGET` of them). The
  working route is Electron's main-side page capture, which composites the real
  frame — so **screenshotting is a main-process feature and a new IPC channel**, not a
  renderer utility, and it fails in exactly the "looks implemented, produces blank
  rectangles" way this file catalogues.
- **Constraint: a carded panel has no live terminal to capture, and a dormant one has no
  buffer at all.** A region export is therefore a composite of live pixels and card
  renderings, and it must not silently promote panels to make itself prettier — that is a
  budget violation and a spawn the user did not ask for. Export what the canvas *is*.
- **Constraint: text export depends on #30 and is bounded by it.** Without durable
  scrollback, "export this panel's output" means "export whatever xterm still holds", which
  is a truncation the user cannot see. With it, the cap is explicit and can be stated.
- **Constraint: #31, and this is the entry where it bites hardest**, because export is the
  one operation whose entire purpose is to move terminal bytes to another human.
- **Open question: is there a canvas-native artifact, or only images and text?** A shareable
  file that another instance of the app can open as a read-only canvas — panels, positions,
  titles, annotations, no processes — is a genuinely different thing from a PNG, and it is
  most of #4's data model without any of its transport. It is also nearly free once #2's
  format is a keyed collection of workspaces, since that file *is* the artifact minus the
  running state.

## 40. The canvas from somewhere else — a read-only view on a phone

See what your canvas is doing when you are not at the machine: which agents are running,
which finished, which is asking a question. Not a remote desktop, not a way to type into an
agent from a train.

- **Why it belongs in this file even though it is far out:** it is the natural end of #17's
  argument. Attention routing exists because an agent finishing while you are not looking
  tells you nothing; the strongest version of "not looking" is "not there". Agents that run
  for tens of minutes make this the question the app will eventually be asked.
- **It is gated on M4c, and honestly rather than nominally.** Sessions die with their
  renderer today, so "what is happening while the app is closed" has no answer at all. Once
  tmux backs the session and the process survives the window, this becomes a reporting
  problem instead of an architectural one — which is the same reason #4 and #20's third tier
  wait for it.
- **Constraint: report from `Panel` facts, not from a buffer.** Titles, statuses, exit
  codes, and costs (#19) are small, structured, and meaningful off-machine. Streaming
  terminal bytes to a phone is a different and much worse product: it is unreadable at that
  size, it is the largest possible #31 exposure, and it makes the transport expensive for
  the least useful payload.
- **Constraint: read-only is a design position, not a v1 shortcut.** The moment a remote
  surface can send input, every argument in #24's "functional edges" entry applies with the
  authorisation question multiplied — something typing into an agent with shell access from
  off-machine needs an audit trail that does not live on the machine being typed into.
  Approving a permission prompt remotely is the one write worth considering, and it should
  be considered separately and later.
- **The identity for it already has an entry: #28.** If accounts exist, this is the second
  thing they are for, and it is a better argument for them than sync is — a canvas that can
  tell you it finished is worth signing in for in a way that a synced window position is
  not.
- **Worth resisting:** rebuilding the canvas on a small screen. The value is a list, sorted
  by "wants me", with a notification. The canvas is a desktop idea and does not need to
  travel.

## A second capture, 2026-08-26: entries 41–75

Everything above was captured on 2026-08-24 against M4c. **Entries 41–75 were captured on
2026-08-26**, after M5a's presets and while M5b's palette was on the branch, by reading the
four layers of the app separately: main's process/persistence layer, the canvas and its
input, the session/terminal substrate, and the build/verify tooling.

They share a pattern worth stating once, because it is the cheapest heuristic this file has
found for where the next idea lives: **almost every one of them is a fact the app already
computes and then discards.** `#{pane_current_path}` is parsed and dropped after boot.
`intersectsViewport` is recomputed every frame and read by nothing but tiering. The
`pane_dead_status` recovered through the `pane-died` hook is sent once and forgotten.
`History<T>` is generic and only ever instantiated at one type. In a codebase with
invariants this strong, the gaps are rarely missing machinery — they are unconsumed outputs.

Three of these entries are corrections rather than features, and they are marked as such:
**#41** repairs a false assumption that four earlier entries rest on, and **#49** and **#43**
are live defects that happen to be shaped like features.

## 41. Live cwd and live command — landed in M12; review's cwd resolution is what's left

M12 shipped the correction: `parseListOutput`'s `#{pane_current_path}`/
`#{pane_current_command}` are polled on a slow timer, deduped, and fanned out through a
third per-panel-id store (`live-session-store.ts`) that deliberately never rides
`registry.version()`. The inspector shows the live cwd and command **beside** the
spawn-time ones rather than over them, both preset-save surfaces read the live cwd when one
exists, and project-prompt reading does too — falling back to the spawn cwd exactly where no
live answer exists (no tmux, or a session's first tick has not landed). See `CLAUDE.md`'s
"Live cwd is a poll, a dedupe, and a third store" for the mechanism and its accepted costs.

What's still open: review resolves a panel's repository against its SPAWN cwd, not its live
one, so a panel that `cd`'d into a second repository is still reviewed against the first.
The stored baseline sha lives in that first repository, so correcting it needs a
recapture-or-refuse policy — a design of its own, and the natural successor to M12.

## 42. Camera bookmarks — named viewports, saved and jumped to

The camera is a first-class object — `Viewport` is `{x, y, scale}` and is already persisted
into the layout — yet nobody can *name* one. Save "where I am looking right now" as a named
view; `Cmd+Shift+1..9` to set, `Cmd+1..9` to recall, plus a Bookmark group in the palette.
On an infinite canvas the return trip is the expensive gesture, and a bookmark is three
numbers, which makes this the best value-per-byte item in the canvas layer.

- **Constraint: the viewport setter is private on purpose.** `useViewport` exports
  `resetViewport` and a read-only `worldCentre()` and deliberately keeps `setViewport` in
  the hook, because nothing outside should move the camera. Bookmarks need a **third named
  verb** — `goToViewport(vp)` — not the setter, and it has to be `useCallback`-stable for
  the reason the file already records: an unstable identity re-seats the palette's selected
  row on every mousemove.
- **Constraint: `Cmd+1` is taken.** It is `fitTo` today. The keymap needs deciding rather
  than assuming, and that is the whole design cost of this entry.
- **Nearest existing entry: the nav grid (shipped in M11).** Its own design spec resolved
  the open question this entry once left — "what does a cell *mean*? Nine viewport
  quadrants, nine saved bookmarks, and nine workspaces are three different features
  wearing the same UI" — by landing on workspaces: the only one of the three with a stable
  identity across launches, which a hold-to-reveal gesture needs in order to be worth
  learning at all. This entry is the saved-bookmark answer built as a data model and a
  palette group, with no hold-to-reveal overlay at all. The nav grid's hard part was the
  gesture; this one has none.

## 43. Unicode 11 widths — a silent misalignment nobody has attributed yet

`createTerminal` sets `allowProposedApi: true` but loads no `@xterm/addon-unicode11`, so
xterm measures character widths against its built-in Unicode 6 table. Modern agent CLIs draw
box frames, spinners and emoji status glyphs whose widths changed after Unicode 6 — the
frame drifts one column per wide glyph, and because the shell believes the cursor is
somewhere the screen does not show it, the corruption compounds down the pane.

- **This is a defect, not a preference.** It is one addon and one
  `term.unicode.activeVersion = '11'`, in the one place a `Terminal` is constructed. It is
  in this file rather than fixed on the spot only because it wants a check alongside it.
- **Constraint: it must be set before `open()`.** `create-terminal.ts` is "the only place a
  `Terminal` is constructed" for exactly this class of reason. Changing the width table
  after the fact is a re-measure that would need the same `refresh(0, rows - 1)` treatment
  `attachTerminal` already carries on re-attach.
- **Why it is cheap: nothing about the grid changes.** No `pty:resize`, no SIGWINCH, no
  refit. That is the difference between this and #36.
- **Nearest existing entry: #36 (panel typography),** which changes font *size* — a grid
  change wearing a hat, in that entry's own words. This changes nothing about the grid.

## 45. Camera undo — a back button for the viewport

`History<T>` is generic and is instantiated at `History<Panel[]>` only, so `Cmd+Z` unwinds
panel geometry and nothing about where you were looking. The camera is exactly the state a
user most often wants to revert: a stray pinch, a `Cmd+0`, a jump that lost their place. A
small separate camera trail on `Cmd+[` / `Cmd+]`, pushed only on *discrete* jumps — fit,
reset, bookmark, go-to-panel — and never on continuous gestures.

- **Constraint: one history entry per committed gesture, restated.** The wheel handler calls
  `setViewport` per event, so a camera trail that pushed there would take sixty presses to
  unwind one pan — the same defect that note already exists to prevent for drags.
- **Constraint: it must NOT go into the existing `History<Panel[]>`.** `applyHistory` reaches
  into `registry.dispose`, so folding the camera in would make undoing a pan walk the
  session-disposal path. Two stacks, one generic module — `history.ts` is already generic for
  precisely this.
- **Nearest existing entry: #23 and #33** both move the camera and neither notices it is
  absent from the undo stack. This is a gap in an existing mechanism rather than a new
  surface.

## 46. A run ledger — what each panel ran, and how it ended

`exitCodeFor` goes to real trouble to recover a truthful exit code through the `pane-died`
hook and a file on disk, and then that number is sent once as `pty:exit` and forgotten.
Append it instead: panel id, command, cwd, start time, duration, exit code — a small JSONL
beside `layout.json`. That is the difference between "this panel exited with code 1" and
"this panel has failed the same command four times this afternoon".

- **Constraint: this is an append stream, not `layout-store.ts`'s pattern** — the same line
  #30 draws. Write-temp-then-rename is wrong for a growing log, so it needs its own writer,
  and `flushSync` must stay the only thing `before-quit` waits on.
- **Constraint: it must survive the direct backend,** where `exitCodeFor` returns `null` by
  contract and the client's own exit code stands.
- **Why it is not #30 wearing a hat: it records no output bytes.** A few hundred bytes per
  panel lifetime, all of it metadata, which is what keeps it entirely outside #31's
  disclosure surface — no redaction question, no retention policy, no size cap.
- **Nearest existing entry: #30 (durable scrollback),** which persists what a session
  *said* and is gated on retention, caps and secret redaction. This persists only what it
  *ran and returned*.

## 47. The environment report — everything main already knows and never says

Main resolves the login environment, logs whether `claude`, `codex` and `git` were found,
picks a backend with a human-readable `reason`, and computes per-preset PATH availability.
Almost all of that reaches the user as console output nobody sees; only `reason` surfaces,
and only when it is `'direct'`. One read-only report — resolved PATH, which CLIs were found
and where, tmux version or the exact cause of the fallback, the layout file path and whether
a `.bak` was written — turns "why does this panel say command not found" from an hour into a
glance.

- **Constraint: it must not quietly absorb the loud fallback.** `shell-env.ts` logs its
  failure deliberately. A report that shows the same fact calmly, in a pane nobody opened,
  is not a replacement for it.
- **Constraint: the probe is cached and runs once, so the report must say when it was
  taken.** A `brew install` mid-session is invisible until relaunch — already recorded as a
  known limit, and a report that does not timestamp itself turns that limit into a lie.
- **Constraint: this is a dump of a resolved login environment, i.e. the user's exported
  secrets.** #31 already flags the login-shell probe as a second copy of the same problem.
  Key names only; never values.
- **Nearest existing entry: #11 (settings surface).** #11 is where toggles live; this reads
  nothing back and changes nothing. By #11's own standing rule it would be a page *in* the
  settings surface rather than a home of its own.

## 48. Lock and pin a panel — geometry that resists the gesture layer

Every panel is draggable, resizable and closable at all times. A long-running agent whose
panel you nudged four pixels during a pan is harmless; one you *closed* by a mis-click is a
dead process. Two independent booleans: a **lock** (position and size frozen — the drag hook
refuses to start a gesture) and a **pin** (the panel is always live, exempt from demotion).

- **The lock half is one early return. The pin half is budget arithmetic, and it is sharp.**
  Pinning is a second unconditional promotion alongside the focused panel, so N pins plus a
  focused panel can only ever be allowed to consume `LIVE_BUDGET`. Pins must be counted
  **inside `assignTiers`**, not applied at the `Canvas.tsx` apply step — otherwise the second
  budget re-check that exists because of held-back demotions sees live panels it did not
  count, and the twelve-WebGL-contexts failure returns through a new door. That re-check is
  documented as "the cap is enforced in two places"; this is the third thing that would have
  to respect both.
- **Nearest existing entry: #23 (focus mode),** whose open question "does focus mode imply
  *only* this panel is live" is the same budget arithmetic from the opposite direction, and
  **#29**, which is about a panel's process rather than its geometry. Neither proposes
  user-controlled exemption from the tiering rules.

## 50. Git worktree per panel — isolation for agents that share a repo

The app's premise is many agents at once, and nothing in the codebase *or in the forty
entries above* coordinates two of them editing the same checkout. A preset should be able to
declare "spawn in a fresh worktree of this repo on a new branch", so four agents on one repo
are four working trees and four branches, merged deliberately.

- **This is the largest correctness gap in the product thesis.** The canvas actively
  encourages the one configuration that silently corrupts work: two agents, one checkout,
  both editing. Every other entry in this file makes the app better at something; this one
  stops it being wrong at the thing it is *for*.
- **Constraint: a `cwd`/worktree field is a fifth layer for the absent-`command` rule.**
  "An absent `command` must stay absent through four layers" is already the most expensive
  invariant in the preset path, and each of those four rebuilds its object field by field
  rather than spreading. A worktree field inherits that discipline exactly.
- **Constraint: it adds a fourth `registry.dispose` consumer's worth of cleanup.** Closing a
  panel has to decide whether its worktree is removed — and `CLAUDE.md` says the dispose
  call-site count is a number to re-derive from the code rather than trust, because it has
  already gone stale once.
- **Open question: what happens on undo?** `Cmd+N` then `Cmd+Z` must dispose the session, per
  the note that entry exists for. If it also removes a worktree, undo becomes destructive to
  files on disk, which nothing in this app currently is.
- **Nearest existing entry: #4's separable git-status badge** and **#12's ticket→branch→panel
  flow.** Both of those *display* or *source* git state. This one owns write isolation, and
  it is the prerequisite that makes #12's "four tickets in flight" not a merge disaster.

## 51. Discard — the half of per-panel review that writes in the other direction

M9a–M9c shipped the review layer: a baseline captured once per session at spawn and dropped
when the session dies, a diff on demand in the inspector, a review node that outlives its
subject because it asks by baseline rather than by panel id, per-file hunks, and a commit —
porcelain `git commit` so the repository's own hooks run, against a scratch index, with the
user's real index reconciled per path afterwards and a HEAD-moved guard against a second
committer. "Keep" is therefore built, more carefully than this entry imagined.

**"Discard" is not, and it is not the mirror image of commit** — it is the only operation this
app would have that destroys work.

- **Constraint: there is no undo for it, and `Cmd+Z` must not pretend otherwise.** The undo
  stack moves panels; a discard moves files on disk. The reasoning `CLAUDE.md` records for
  why a commit pushes no history entry applies here with more force.
- **Constraint: the baseline is what a discard would restore to, which is also what it has to
  disclose.** The `stash create` snapshot holds the tree as it was at spawn, so anything the
  *user* changed by hand since then sits inside the same diff and would go with it. And the
  `shared` arm — two panels in one checkout — must refuse outright rather than merely decline
  to attribute, because there the diff is provably somebody else's work as well.
- **Constraint: the commit path's safety answer does not transfer.** A scratch `GIT_INDEX_FILE`
  is what lets a commit avoid touching state an agent may be mid-write against; a working-tree
  restore has no equivalent — it writes the real tree, under a running agent, by definition.
- **Open question: per-file, or all of it?** The node already renders a file list and expands
  one file's hunks, so per-file is the useful version. It is also the harder one, and it
  inherits `verify:rail` 57's rule: the set of paths comes from the *result*, never from the
  display-capped rows on screen.

## 52. Multi-select — rubber-band, shift-click, and group drag

`Canvas.tsx` tracks a single `selectedId` and a single `focusedId`, and `hitTest` returns
exactly one id. Build the selection model once: `selectedIds: Set<string>`, a background drag
that rubber-bands, shift-click to add, and `applyDrag` run per member so a group moves as one.

- **Three entries above each independently assume this already exists** — #2's "move to new
  workspace", #21's broadcast, and #25's tidy-the-selection. #21 says so outright: "what is
  missing is **multi-selection**, which the canvas does not have today." This proposes it as
  its own scheduled piece of machinery, deliberately *without* #21's broadcast half, which is
  the dangerous part ("a mode you can forget you are in").
- **Constraint: the background `onMouseDown` currently means "clear selection and release
  focus".** A marquee has to claim that drag without breaking the focus-release rule — an
  uncleared `focusedId` holds a WebGL context and a budget slot for the rest of the run.
- **Constraint: group drag is `applyDrag` N times from N origin rects,** never one delta
  applied to a bounding box. The recompute-from-origin rule is caller-side, and a bounding-box
  implementation is exactly the accumulate-drift bug wearing a group costume.
- **Constraint: one history push for the whole group,** per the one-entry-per-committed-gesture
  rule.
- **Nearest existing entry: #21,** which needs this and says so.

## 53. Cards that show the last real screen, not a text tail

`PanelCard` renders `handle.tail(6)`, and `tail()` unshifts only non-empty, trimmed lines — so
a full-screen agent TUI's card is six fragments of a box frame with the colour stripped and
the blank lines that carried its layout deleted. Two better sources exist and neither needs a
disk log: `@xterm/addon-serialize` snapshotted at `detachSlot` for panels that ran this
session, and `tmux capture-pane -p -e` on the surviving session for a panel restored dormant.

- **The second half is the interesting one: it is the only thing in this codebase that can
  make a freshly relaunched canvas show what it showed yesterday without storing a byte.**
  The bytes never leave tmux's own memory, so none of #31's on-disk exposure applies.
- **Constraint: the three-state lifetime at the bottom of this file is the whole problem.** A
  dormant panel's `SessionHandle` has never been attached, its buffer is empty and `tail()`
  returns `[]` — which is every panel on the canvas the moment the app starts.
- **Constraint: the serialize snapshot has to be taken in `detachSlot`,** before the WebGL
  context goes, and `capture-pane` is a new main-side read on the private socket that must
  use the exact-match `=` target discipline `verify:tmux` 19 pins.
- **Nearest existing entry: #30 (durable scrollback),** and it is distinct in the way that
  matters — no append stream, no retention policy, no ring buffer, no redaction question. It
  is most of #30's *display* value at none of its storage cost. Also distinct from **#22**,
  which decides how *little* a card shows when far away; this decides whether what it shows
  is true at all.

## 54. Cmd-click a path or URL in agent output

Agent CLIs print `src/main/pty-manager.ts:118`, `http://localhost:5173` and stack traces all
day, and none of it is clickable — only the fit and webgl addons are installed, so neither
OSC 8 hyperlinks nor a path/URL link provider exists. `registerLinkProvider` plus a main-side
`shell.openPath`/`openExternal` channel turns every printed path into "open in my editor at
that line", which is the highest-frequency interaction a terminal-on-a-canvas is missing.

- **Constraint: this is the feature that makes the known hover limit user-visible.** Pointer
  correction is anchored to a slot pinned at mousedown, so a hover with no prior in-slot
  mousedown returns early uncorrected — recorded in `xterm-pointer.ts` as a known limit left
  to a later milestone. Link underlines follow the hover, so at any zoom ≠ 1 the underline
  appears over the wrong cell. **This entry is gated on that correction, not merely adjacent
  to it.**
- **Constraint: opening a URL goes through main, never the renderer.** The CSP is
  `default-src 'self'` and `will-navigate` is blocked outright, because a navigation kills
  the window's PTYs.
- **Constraint: tmux `mouse` must stay off,** which is already load-bearing for all of M4a's
  pointer work.
- **Nearest existing entry: #13 (drag-drop images),** which is also "a path crosses the
  terminal boundary" — but in the opposite direction. #13 writes a path *into* the PTY; this
  reads one *out* of the rendered buffer.

## 55. Ad-hoc task panels — `> npm test` from the palette

The palette spawns *presets*: named, persisted, reusable. The missing sibling is the
throwaway — type a command and get a panel that runs it, reports its real exit code, and is
honestly a *task* rather than a shell. All the exit-code fidelity work already exists. This
is what keeps presets for the things you actually repeat.

- **Constraint: this collides with lazy spawn and fit-before-spawn head on.** A task panel
  the user launched must start **now**, even if the canvas is scrolled elsewhere and
  `LIVE_BUDGET` is full — but `spawn()` reads `handle.size()`, which throws by design for a
  terminal that was never attached, because a fabricated 80×24 is exactly the silent failure
  that guard exists to prevent. Resolving it means an explicit "spawn at a stated grid" path,
  deliberately named, rather than quietly relaxing the guard.
- **This is the entry that surfaces a distinction the app has so far been able to ignore:
  user-initiated spawn vs. camera-initiated spawn.** Lazy spawn and dormancy both treat every
  spawn as something the viewport decided. A typed command is the first one the user decided,
  and #29's restart is the second.
- **Nearest existing entry: #34 (panel templates)** and **#29**, both about *repeating* a
  spawn. This is about a spawn worth zero ceremony.

## 56. Agents that outlive the app — detach on quit, reattach on launch

`before-quit` calls `killAll()` then `shutdown()`, i.e. `kill-server`, with an explicit
comment that agents never outlive the app. That is a deliberate M4c scope line, not a
technical limit: the substrate that already survives `Cmd+R` survives `Cmd+Q` for free,
because `detachAll()` and `new-session -A` are the same two calls in a different order. An
opt-in "keep agents running when I quit" reverses one call and lets the existing boot
reconcile do the rest.

- **Constraint: it makes the boot orphan-killer a correctness pair with the coalesced write.**
  Boot kills any session with no saved panel. With quit-survival on, a layout write that has
  not landed means an agent is killed for not being written down yet.
- **Constraint: `RestoreSettings` is the right home, and this is the first setting that
  breaks its shape.** Every existing setting affects only what the renderer is handed at boot.
  This one changes what main *does to processes*, so `settings()` stops being
  renderer-facing-only.
- **Nearest existing entry: #29 (restart in place),** which is about deliberately ending and
  recreating one process. This is about not ending any of them, and it is the only entry in
  this file that changes what quitting means.

## 57. `tc` — a CLI and a URL scheme, so the canvas is drivable from outside

One binary and one `terminal-canvas://` handler: `tc open --preset claude --cwd ~/repo` spawns
a panel on the running canvas, from a shell, a script, a git hook, or a launcher. Everything
needed already lives in main and is reachable without a renderer — `templateOf` and a
`PRESET_SPAWN` send. It also means an agent *inside* a panel can open its own panel, which
makes the canvas something agents extend rather than only something a human arranges.

- **This is the cheap version of several entries above.** #12 Jira, #26 toolbox and #9
  integrations each become "something else calls `tc`" rather than "the app grows another
  OAuth client".
- **Constraint: a URL-scheme flavour must not become the navigation hole `will-navigate` and
  `setWindowOpenHandler` exist to close.** Both deny everything today, because a navigation
  kills the window's PTYs.
- **Constraint: panel ids are minted by the renderer alone, and main must not mint one** —
  that is the duplicate-id defect, whose symptom is two panels rendering as one because
  `handle.host` can live in exactly one DOM slot.
- **Constraint: it is the third input shape.** `CLAUDE.md`'s "`Cmd+N` stays a renderer
  keybinding" note reasons about exactly two cases, menu accelerator and renderer listener.
  An external spawn request is neither.
- **Constraint: it is a trust boundary pointed inward.** The caller is an agent running
  arbitrary commands. #9's "every integration is a new trust boundary" applies to the app
  itself here.
- **Nearest existing entry: #21** and **#12**, both of which are gestures *inside* the app.
  This is the app's first external control surface.

## 58. Backpressure on a runaway panel

`enqueue` pushes every chunk into a per-session buffer with no cap and flushes the whole join
every 16ms. The batching solves message *count*; it does nothing about message *size*. A
`yes`, a `find /`, or an agent dumping a large file produces multi-megabyte strings crossing
IPC every frame, and the UI locks up in exactly the way the batcher exists to prevent — the
measured 33,198-reads-to-105-messages win says nothing about bytes.

- **Constraint: an eliding cap must keep the tail.** The pending buffer is flushed *before*
  `pty:exit` is announced precisely because the last lines are usually the error explaining
  the exit. A naive head-preserving truncation drops exactly the bytes that note exists to
  protect.
- **Constraint: elision is a lie the panel must be told about.** `[N MB elided]` written into
  the stream, or a user debugging missing output has no way to learn bytes were dropped —
  which is the same silent-failure shape every note in `CLAUDE.md` is written against.
- **Nearest existing entry: #18 (what the canvas costs the machine).** #18 reports what the
  machine is spending. This is a *control* that stops one panel taking the app down with it,
  and it lives in the batcher rather than in a new sampler.

## 59. OSC 133 shell integration — command boundaries as first-class objects

Nothing in the byte stream is parsed for structure today. If the spawned shell emits OSC 133
prompt marks — and a preset can *make* it, by having main inject the marker into the shell's
rc via the env it already resolves — then each command gets an xterm `Marker`, and the
decorations API can paint a gutter rib per command, green or red by exit status. That gives
"jump to the previous prompt", "copy the last command's output", and the first non-heuristic
answer to "is this agent waiting for me": the shell said so.

- **Constraint: the parse runs on every chunk, which is the hot path the memo design
  protects.** A per-command *event* fires at human speed, but the *scan* does not. This must
  not bump `registry.version()` — the fifth entry to record that same rule.
- **Constraint: injection must survive the `$SHELL -ilc env` probe's fallback path,** and
  because `PanelSpec.command` may be absent, main is the only party that knows which shell it
  is decorating.
- **Nearest existing entry: #5's detection option 4** ("terminal bell / OSC sequences — worth
  checking whether Claude Code or Codex already do"). That is a one-line "check if it
  exists"; this is the answer that does not depend on a vendor volunteering, because we can
  install the marker ourselves at spawn. It also produces navigation and per-command exit
  status, not just a state colour.

## 60. Zoom-independent chrome — panel headers that stay operable

At `scale = 0.3` a panel's chrome bar, close button and resize handle are 30% size, so the hit
targets that let you *manage* the canvas vanish exactly when you are looking at the whole
canvas. Counter-scale the chrome by `1/scale`, clamped to a band, so headers and controls keep
a constant screen size while the terminal body scales normally.

- **Constraint: this is a deliberate local exception to "one transform, not N layouts", and
  the boundary is load-bearing.** The counter-scale must apply only to chrome, **never** to
  the `.panel__slot` that hosts xterm — a transform on that subtree changes what
  `getBoundingClientRect()` reports while `dimensions.css.cell.width` stays blind, which is
  the exact arithmetic the pointer correction exists to compensate for. Counter-scale the
  wrong node and the correction factor is wrong by a second unknown.
- **Nearest existing entry: #22 (semantic zoom),** which changes what a *card* renders at low
  zoom. This is the opposite question — what stays constant regardless of zoom — and it
  applies to the *live* tier that #22 explicitly does not touch. They compose.

## 61. Recover an orphan session instead of killing it

At boot, any tmux session whose panel id is not in the saved layout is killed outright, with a
comment saying adoption was rejected because it would mint geometry the user never chose. That
is a fair trade for a rare crash, but it means the one moment the app has recovered work
nobody else can reach — an agent mid-run when the machine died between spawn and the coalesced
write — it destroys it. "N sessions from a previous run: restore or discard?" costs one dialog.

- **The geometry objection is answered by #25.** Placement is the actual prerequisite, and
  once new panels have a placement rule, a recovered orphan uses it like any other.
- **Constraint: `parseListOutput`'s dead-pane filter decides whether a listed orphan is even
  alive.** Offering to restore a corpse is worse than killing it silently.
- **Constraint: the restore path must mint ids the renderer owns,** and a restored id that
  collides with `nextIdRef`'s sequence is the id-collision defect again — the same one
  "`nextIdRef` seeds from the restored ids" already fixed once through a different door.
- **Nearest existing entry: #2 (named saved canvases).** #2 is about deliberately organising
  layouts. This is about the sessions that exist with *no* layout at all — a state only main
  can see, and today only main destroys.

## 62. Camera animation — tweened flights, and where they fight tiering

Every camera change today is an instantaneous jump: reset, `fitTo`, and the palette's
go-to-panel. A teleport destroys spatial continuity, which is the one thing a spatial
workspace is supposed to preserve. A short eased tween on discrete jumps — never on gestures —
is a small pure addition and it is what makes #42's bookmarks, go-to-panel and #17's attention
jumps legible rather than disorienting.

- **Constraint: a tween must interpolate through *clamped* scales at every frame.** Deriving
  translation from an unclamped intermediate is the sideways-drift bug `verify:viewport` check
  3 exists for, reappearing mid-flight instead of at a pinch limit.
- **Constraint: it fights `DEMOTE_DELAY_MS`, and this is the real cost.** A 300ms flight
  crosses the canvas, every frame is a tiering input, and a flight could promote and demote a
  dozen panels in transit — a dozen WebGL contexts created and destroyed for panels the user
  never stopped at. Tiering has to be suppressed until the tween settles.
- **Nearest existing entry: #32,** which notes "`prefers-reduced-motion` applies to the camera,
  and nothing else in this file". That is a constraint on a feature nobody had proposed. This
  is the feature — and the tiering interaction, which #32 does not mention, is the expensive
  half.

## 63. Spatial ordering the LOD already knows

`assignTiers` computes `intersectsViewport` for every panel on every viewport change, and
`lastFocusedAt` already records recency per panel. That is a live, sorted answer to "which
panels are on screen, and which did I last care about" — and nothing outside tiering consumes
it. Expose it: the palette's go-to-panel list has no order at all today and should list
on-screen panels first, then by recency; a `Cmd+\`` cycle-to-next-panel falls out of the same
data.

- **Constraint: it must be a separate exported pure function over the same inputs,** not a
  fourth return value from `assignTiers`. `lod.ts` is bundled into the plain-node verify
  target and its job is rationing WebGL contexts — the same reason #22 is told that "the file
  that rations contexts" must not start answering presentation questions.
- **Nearest existing entry: #33 (minimap)** and **#17 (attention routing),** both of which need
  to know where panels are relative to the viewport and both of which propose a *rendering*
  surface. This is the query underneath, it is a prerequisite either way, and it is useful on
  its own the day the palette ships.

## 64. Something has to ration terminal memory, not just WebGL contexts

`LIVE_BUDGET` is the app's only resource ceiling and it rations exactly one thing — WebGL
contexts — because that has a hard cliff near 16 and a permanent failure mode. Meanwhile every
session that has ever attached holds a `Terminal` with up to 10,000 lines of scrollback for
the whole renderer lifetime, and M4c means those sessions now routinely outlive several days
of canvas use.

- **Constraint: anything that frees buffer memory is one careless step from `dispose()`.**
  `pty.kill` must keep exactly two callers and tiering must never reach either — four checks
  exist for that property alone.
- **Constraint: trimming is destructive in a way detaching never was.** `detachTerminal`
  explicitly "never touches the `Terminal`". This would be the first operation that does, so it
  needs its own check in `verify:registry` beside 5 and 15.
- **#53's snapshot is what makes this survivable** — a trimmed buffer with a captured last
  screen still shows a truthful card.
- **Nearest existing entry: #18,** which measures the *processes* via the pid in `PanelStatus`.
  This is the renderer's own footprint, which no pid can see and which #18's main-side sampler
  would attribute to a single Electron process. It is also the one #18 could not turn into a
  governor even if it wanted to.

## 65. Panes inside a panel — tmux splits as panel content

The backend already runs a real tmux session per panel with `prefix None`, which means tmux's
own splitting is switched off by design. Turning one panel into a two- or three-pane workspace
— agent above, `git status` or a dev server below — is a genuinely different affordance from
two panels side by side: the panes share a cwd, a lifetime and a rect, and they move as one.

- **Constraint: `PanelSession` assumes exactly one `SessionHandle` and one `handle.host`,** and
  `pty:create`/`pty:write`/`pty:resize` are all keyed by `PanelId`. A second pane needs a second
  addressable stream under one panel id.
- **Constraint: each pane is a `Terminal` and therefore a WebGL context,** so a split panel
  costs two of eight — and `lod.ts`'s arithmetic counts panels, not contexts. That divergence is
  the whole structural cost.
- **Nearest existing entry: #35 (groups),** also "several things that move together" — but a
  group is a canvas-space container of independent panels with no session at all. The structural
  pressure is opposite: **#35 pushes toward the panel-kind union; this pushes toward a panel
  owning N handles.** Worth noticing that the two pull the model in different directions, and
  that building either one carelessly makes the other harder.

## 66. Images in the terminal — let an agent show you the chart it made

`@xterm/addon-image` supports sixel and the iTerm2 inline-image protocol. Agents already
produce plots, diagrams and screenshots and can only tell you a file path. On an infinite
canvas this is unusually valuable, because "twelve panels, three of which are showing a
rendered diff or a chart" is legible in a way twelve text panes are not.

- **Constraint: the image layer composites separately from the WebGL canvas,** and the
  `webglDisabled` fallback after a context loss changes which of the two is drawing.
- **Constraint: it silently defeats #53's card.** An image is not in `buffer.getLine()`, so
  `tail()` sees a blank region and the card shows nothing at all.
- **Constraint: image storage is per-`Terminal` memory that nothing rations,** on top of a
  10,000-line scrollback that nothing rations either — see #64.
- **Nearest existing entry: #13 (drag-drop images),** which is the inbound half: a human gives
  an agent an image. This is the outbound half, and it needs no path-typing, no temp-file
  cleanup and no per-CLI capability question.

## 67. Layout time machine — the atomic write already earns it

`writeNow` writes to a `.tmp` and renames, and `load` already knows how to preserve a file it
must not overwrite as `.bak`. Keeping the last N renamed snapshots instead of one is a handful
of lines, and it gives "put the canvas back to how it was this morning" — which `Cmd+Z` cannot,
because the undo stack is renderer state that dies with the page, and the one action it
explicitly cannot take back is reset.

- **Constraint: this quietly makes `reset()` reversible,** and `reset()`'s whole design is that
  it is not — it is the operation with a confirmation dialog whose promise is finality. Making
  it undoable is either the point or a contradiction of that promise, and it has to be chosen
  out loud rather than fallen into.
- **Constraint: snapshots must not resurrect built-in presets.** Built-ins are code and never on
  disk, for the stated reason that persisting them makes deleting one resurrect it.
- **Constraint: a restored snapshot naming panels whose tmux sessions are long gone lands
  straight in dormancy's rules** — "dormancy is about spawning, not attaching".
- **Nearest existing entry: #2 (named saved canvases).** #2 is many canvases the user names and
  switches between. This is the same canvas at earlier times, nobody names it, and it exists
  because the machinery is already written.

## 68. Space-drag and middle-drag — the mouse-only user has no pan

There is no way to pan with a mouse button at all. A user with no trackpad can only pan by
wheel: no middle-drag, no space-hold-drag, no right-drag marquee. Add the vocabulary every
canvas app has.

- **Constraint: "Cmd is required for every canvas shortcut", and space is a bare key.** Bare
  keys belong to the agent TUI. So space-drag is legal only while the pointer is over the
  background with nothing focused, or it must be dropped for a Cmd-family chord — and that
  constraint is the whole design problem here, worth writing down before someone copies
  Figma's keymap wholesale. **Middle-drag has no such conflict and is the free half.**
- **Constraint: a drag-pan must be arbitrated by the same focus question, in the same place,**
  as the capture-phase wheel listener — not by a second competing listener, which is how the
  double-handling defect that listener fixed got introduced the first time.
- **Nearest existing entry: #32 (keyboard-first canvas),** which is about keyboard traversal and
  a11y. This is about the pointer, and specifically about the mouse-only user the current design
  has no answer for.

## 69. A gesture-history HUD line

`CanvasHud` renders four facts and is described as "the fastest way to see the math misbehave".
It is the only chrome outside `.world` and it is nearly empty. Add a transient line naming the
last camera or layout action — "fit to 12 panels", "reset zoom", "undo: moved p3" — which does
double duty as user feedback and as the debugging surface the HUD was built to be.

- **Constraint: it must stay a status, not a toggle.** The HUD's own comment draws that line:
  anything user-configurable moves to #11's settings surface by the standing rule.
- **Constraint: it must not read `registry.version()`** — the same rule #5, #17, #18, #41 and
  #59 each record.
- **Constraint: the bottom-right corner is claimed.** #33 already notes the HUD owns it and
  pushes the minimap to a top corner.
- **Nearest existing entry: #38 (first run),** which wants the empty canvas to teach its own
  gestures. This is the ongoing version, for a user who already knows the app, and it is a HUD
  change rather than an onboarding flow.

## 70. A shared verify harness with named checks and a printed manifest

Eleven `scripts/verify-*.cjs` files each hand-roll the same `ok(n, pass, detail)` helper, each
numbers its checks by hand, and none can run a single check — `CLAUDE.md` says so outright:
"There is no test-name filter in any of them". Extract one harness that keeps the
plain-node/Electron split exactly as it is but gives every check a stable **id and a one-line
name**, supports `--only <id>`, and emits a manifest that a `verify:manifest` script diffs
against the suite table.

- **The suite table has already drifted, which is the argument for this.** `package.json`
  declares `verify:palette` and `npm run verify` runs it, and it appears in **neither**
  `README.md`'s script list nor `CLAUDE.md`'s suite table. That is exactly the failure
  `CLAUDE.md` warns about for the `dispose(id)` call-site count — a number asserted in prose
  that the code moved out from under — now happening to the table that documents the checks.
- **What this changes: the numbering becomes generated rather than asserted.** "41 checks",
  "checks 27–34", "`verify:panels` 26" are load-bearing references scattered through
  `CLAUDE.md` and through this file, and today adding a check silently invalidates four
  paragraphs of prose.
- **Constraint: the plain-node entries must keep their `@shared` alias wiring,** which is
  itself a note in `CLAUDE.md` about a resolution that only started mattering when a real
  value crossed the boundary.
- **Half of the drift argument has since been closed, and by a check rather than a
  harness.** `scripts/verify-meta.cjs` asserts the README against the IPC contract, and
  that every declared `verify:*` script is wired into the chain — the stale-by-omission
  failure this entry opens with. It also carries **named** check ids (`ok('14 every IPC
  channel appears in the README', …)`) rather than bare numbers, which is this entry's own
  proposal demonstrated in one suite. What is still hand-rolled everywhere else: the
  duplicated `ok()` helper, hand-numbered checks, no `--only`, and a suite table in
  `CLAUDE.md` whose check *counts* are still prose a human has to keep true.
- **Nearest existing entry: none of the forty** — the original backlog is entirely
  product-facing. Closest in spirit is the settings-schema rule at the top of this file:
  one structure decided once keeps toggle number ten cheap. This is that argument applied
  to check number two hundred.

## 72. One versioned automation surface, replacing the `__m4a*` / `__m5a*` hooks

`Canvas.tsx` now carries **ten** global test hooks across two naming generations — eight
`__m4a*` plus `__m5aSpecOf` and `__m5aDefaultSpec` — and every milestone adds more with a
fresh prefix. `CLAUDE.md` still says eight. Consolidate them into one `window.__tc` namespace
with a version field and a deliberately narrow, documented question-per-method contract,
stripped from production builds by a vite define.

- **The count in `CLAUDE.md` is the second confirmed drift, alongside #70's.** Both were found
  by reading rather than by a check failing, which is the argument for #70 restated.
- **What it unlocks: headless driving of everything after M5** — palette, multi-select,
  annotations — without each milestone minting a prefix that permanently pins its era into a
  component.
- **Constraint: `CLAUDE.md`'s instruction stands and is the thing to preserve** — "keep the set
  narrow and named by what each one answers", because the alternative is exposing the registry
  and letting the suites drift into testing internals instead of behaviour. A namespace makes
  that discipline easier to hold, not optional.
- **Constraint: `tail` and `scrollPosition` exist *for* these hooks,** which `panel-session.ts`
  documents. Renaming the surface must not orphan the reason those methods are on the
  interface.
- **Nearest existing entry: #32,** which also wants programmatic reach into panel state. That is
  a user-facing input model; this is a test seam that must not ship to users.

## 73. A flag registry — the constants verify currently cannot vary

`LIVE_BUDGET` (8), `DEMOTE_DELAY_MS` (250), `CULL_MARGIN_PX` and the backend choice are
compile-time constants, so a suite that wants to exercise budget pressure must either open
eight panels or not test it. A small typed registry — defaults in code, overridable by env for
verify — lets `verify:panels` force `LIVE_BUDGET=1` to prove the budget re-check at the apply
step, and force the direct backend to test the no-tmux degradation path deterministically.

- **This is what would have caught the held-demotion budget bug directly** rather than through
  a twelve-panel pan. "The cap is enforced in two places and holds at every moment" is
  currently asserted by prose and by a scenario, not by a check that can cheaply construct the
  pressure.
- **Constraint: developer flags and user settings must stay separate,** which is #11's own
  warning read carefully — "exposing a performance knob invites a user to set it somewhere the
  app misbehaves". This has no UI and no persistence guarantee, deliberately.
- **Constraint: `probeTmux` already has the shape this generalises** — fall back and say why.
  A forced-backend flag must go through the same loud path, not around it.
- **Nearest existing entry: #11,** which is a user-facing pane with a search bar over durable
  preferences. This is the opposite: a developer override layer with no home in that surface at
  all.

## 74. Updates that survive the tmux server

M5c is packaging only; nothing addresses shipping the *second* build. The sharp part is
architectural rather than logistical: **an in-app update restarts the app, and `before-quit`
calls `shutdown()`, which is `kill-server` on the private socket** — so a "restart to update"
prompt destroys every running agent, the exact outcome M4c exists to prevent.

- **This wants deciding before the first update ships, not after a user loses twelve agents to
  a version bump.** The stance it needs is the same one #56 needs: restart without
  `kill-server`, reattach on relaunch. Whichever of the two is built first should establish it.
- **Constraint: "one operation became three".** `detachAll` / `kill(id)` / `shutdown` are
  distinct for exactly this reason, and an updater is a fourth caller that must pick the right
  one. `verify:pty-manager` check 15 is the check that calls `shutdown()`.
- **Constraint: the relaunch must land on the same socket,** which makes this and #49's
  socket-naming question the same question asked twice.
- **Nearest existing entry: none of the forty** — distribution is absent from the original
  backlog. #28 is nearest and covers identity, not delivery.

## 75. A diagnostics overlay, and a scrubbed bundle to hand a maintainer

The HUD shows zoom and cursor. Almost every hard-won invariant in this codebase fails
*silently*, and none of them are visible: held demotions, the live count against
`LIVE_BUDGET`, each session's `{dormant, spawned, pid, tier}`, the backend kind and its
fallback reason, the IPC message rate. A `Cmd`-gated overlay reading the registry, plus an
"export diagnostics" writing a scrubbed bundle the user can inspect before sending, is the
cheapest available reduction in the cost of every future silent bug — and it needs no server,
so it collects nothing.

- **The overlay half answers "which invariant just broke",** which no entry above does. This
  file and `CLAUDE.md` together document roughly thirty failures whose defining property is
  that nothing appears in any log; the overlay is the one surface where several of them would
  be visible at a glance.
- **Constraint: it must not bump `registry.version()`** — a diagnostics readout that re-renders
  the canvas at 60Hz on a chatty agent is the exact cost the memo design exists to avoid.
  Sixth entry to record it.
- **Constraint: the export half is squarely under #31's standing rule,** since `layout.json`
  holds preset commands and a main log may hold agent output.
- **Nearest existing entry: #18** and **#39.** #18 measures what the *machine* spends and is
  aimed at the user; #39 exports work product. This exports *app state*, for debugging.

## 76. An app icon

M5c ships with Electron's default icon. That is a deliberate deferral, not an oversight:
choosing an app icon is a design pass, and acquiring one as a side effect of "make it
package" is how a placeholder becomes permanent.

- **Cheap and self-contained:** an `.icns` under `build/`, which electron-builder picks up
  from `directories.buildResources` with no config change at all.
- **Constraint: it is the first visual asset this repo would own,** and there is currently
  no place for one — every pixel in the app today is CSS or xterm.
- **Nearest existing entry: none.** Distribution is absent from the original backlog; #74
  is the only other M5c-adjacent entry and it covers updates, not appearance.

## A note on sequencing for 41–75

The section below was written for entries 1–40 and has **not** been re-ordered to include
these. Three observations that would change it if it were:

- **#41 and #52 are load-bearing for entries that already exist,** in the same way the
  panel-kind union is. Four entries assume live cwd; three assume multi-selection. Both are
  cheap, and both are currently assumed-to-exist rather than built. They belong near the front
  of any real ordering.
- **#43 is a defect, not a feature,** and #70's drift finding was a second. #49 was a third
  and is fixed. Defects should be fixed rather than scheduled.
- **#50 (worktree isolation) is the one entry here that changes what the product is for.**
  Everything else in this file makes the canvas better at something. That one stops it being
  wrong at the thing it exists to do — and its cost is real, because it lands on the
  absent-`command` rule and on the dispose call-site count, the two most expensive invariants
  in the app.

## Rough sequencing, if these were ever scheduled

**Written before M5b and never re-ordered since.** Ten of its items have shipped and are
struck below; the surviving order was computed against a codebase that had no palette, no
settings schema, no workspaces, no shell and no review layer, so treat it as a record of
how these were once weighed rather than as advice about what to do next.

Ordered by (value × confidence) ÷ effort, not by preference:

0. ~~**The file-drop guard from #13**~~ — **done.** It was never a feature, it was a
   latent bug: an unhandled file drop navigates the renderer and `window-lifecycle.ts`
   then kills every PTY in the window. `src/renderer/drop-guard.ts` now `preventDefault()`s
   `dragover`/`drop` at the document level, independently of whether the drag-and-drop
   feature is ever built.
1. ~~**#6 panel names**~~ — **done, M6a.**
2. **#37, the bell half only** — agent CLIs already ring the terminal bell and nothing
   listens. One xterm event, one sound, one setting. It is the cheapest completion signal
   in this file and it exists before #5 does any detection at all.
3. **#23, the zoom-to-fit half only** — a camera animation to a panel's rect. Pure
   `viewport.ts`, no session state touched. Cheapest useful thing on this list, and
   building it first is what surfaces the surprise the rest of #23 is about.
4. ~~**#27 prompt library**~~ — **done, M5b.** The interop question was decided the way
   this item suggested deciding it: project `.claude/commands/*.md` are read, never
   written. Placeholders are what #27 has been rewritten down to.
5. **#8, part 1 only** — effort/permission/model selectable at spawn for the CLI already
   running. Flags on a process the panel owns; no architecture at risk.
6. ~~**#29 restart a panel in place**~~ — **done, M8c**, and the prediction here was
   wrong in an interesting way: it did **not** add a third caller into `pty.kill`. Routing
   through `dispose(id)` is what kept the count at two, and what made `dispose` return its
   kill so the respawn could be ordered behind it.
7. **#22 semantic zoom** — a rendering change below tiering, no new IPC, no lifecycle.
   It is what makes the zoomed-out view worth having, which the nav grid (M11) and #17
   both assume.
8. **#33 minimap** — pure `viewport.ts` at a second scale over rects the app already holds,
   in a top corner (the bottom-right is the HUD's), on a settings toggle that defaults off.
   Schedule it *after* #22, because #22 is what decides whether a persistent locator is
   still worth having — and note it is a plausible *first* customer for #11, since a
   toggle plus a corner preference is two settings arriving at once.
9. ~~**#5 agent-state glow**~~ — **done, M6c.** PTY idleness *and* the bell, with an
   escape-grammar scanner in front of the bell because a window title ends in one.
10. ~~**#17 attention routing**~~ — **done, M6d**, in-app; the OS-notification half is
   what #17 has been rewritten down to.
11. **#25 placement, snapping, tidy** — three small pieces of world-space arithmetic in
   code that already exists (`applyDrag`, `viewport.ts`), and the best available test of
   M4b's undo stack.
12. **#32 keyboard-first navigation** — nearest-panel-in-a-direction is plain-node math over
   the same rects. The design work is the rule that traversal moves *selection*, not focus,
   so arrowing across a canvas does not spawn everything it passes.
13. ~~**#2 workspaces**~~ — **done, M7**, and not free: the switch had to become a
   transaction that writes the outgoing canvas before it flips the active id.
14. ~~**#34 panel templates**~~ — **done, M5a**, as presets. The "new workspace from a
   template set" half is what #34 has been rewritten down to.
15. **#38 first run** — schedule it whenever `SEED_PANELS` goes away, and not a day later:
   an empty infinite canvas with only `Cmd`-gated shortcuts has no discoverable
   affordances at all.
16. ~~**#1 Cmd nav grid**~~ — **done, M11**, and the prediction held exactly: cells are
   workspaces, self-contained once #2 (M7) gave it destinations. The other two candidates
   the original entry left open — viewport quadrants and saved bookmarks — were rejected
   in the design spec; see #42 for the bookmark half.
17. **#21 broadcast input** — the loop is trivial; the work is multi-selection (shared
   with #2, build it once) and the safety story around a mode you can forget you are in.
18. **#15 annotations — sticky notes and world-anchored ink first.** Unusually high
   feel-per-effort: SVG in the `.world` layer inherits pan/zoom for free, and no process,
   API, or token is involved. Ink and panel-anchored annotations follow once the mode
   arbitration is settled.
19. **#24 edges, decorative flavour only** — same SVG-in-`.world` machinery as #15 and
   arguably a feature of it. The functional flavour is much later and much more dangerous.
20. **#35 groups** — world-space rects plus membership, and the second-cleanest candidate
   for the panel-kind union after #14. Its two real constraints (recompute drags from the
   origin rects; never touch array order) are both already written down.
21. ~~**#11 settings surface**~~ — **done, M6b**, at exactly the point this item names,
   and the prediction held: every toggle since has been a `SettingDef` and nothing else.
22. **#31 secrets — the standing rule** — costs nothing to state and must be stated before
   #30, #16, #39, or #28 move a single byte of terminal output off the panel. Write it
   down here; implement it inside whichever of those ships first.
23. **#18 machine cost readout** — the pid is already in `PanelStatus`; the work is
   main-side sampling on a slow timer. Worth having before #11 exposes any WebGL-budget
   knob, since it is what makes such a knob mean something.
24. **#10 light/dark** — chrome is easy; the real work is xterm's `theme` option fanned
   across the registry plus a readable light ANSI palette.
25. **#36 panel typography** — commit-on-release like a resize, because a font change is a
   grid change is a SIGWINCH. Pair it with #10: both are `Terminal` options fanned across
   the registry, and whichever lands first should build the fan-out.
26. **#13 image drop/paste, Finder + clipboard cases** — small now that the guard exists;
   the terminal path is "write a file path into the PTY", which needs no new channel.
27. **#23, the actually-maximise half** — a layout mutation with a restore rect, a
   SIGWINCH on entry and exit, and a decision about whether focus mode pins the budget.
28. **#19 token and dollar accounting** — gated on the transcript watcher, which is the
   same machinery #7 needs. Build the watcher once, deliberately, for whichever of the
   two is scheduled first.
29. **#14 tier 1 — a watched local-file panel kind.** The first non-terminal panel, and
   the one that forces the union below to exist. Markdown/CSV/JSON beside a live agent
   is most of this idea's value for a fraction of its cost.
30. **#3 file tree** — real work (new IPC surface, viewport interaction), well understood.
31. **#26 agent toolbox, read-only inventory** — after #3 or #14 tier 1, because it is
   the same watched-directory machinery and should not invent a second copy of it. The
   editing half is a separate, later decision.
32. **#30 durable scrollback** — schedule it *before* #16 rather than alongside it: it is the
   larger question (retention, byte caps, and #31) and it is what makes a restored canvas
   show anything at all. Write it from `pty-manager`'s existing flush, as an append stream
   and emphatically not with `layout-store`'s rewrite-the-file pattern.
33. **#16 canvas-wide search** — the search itself is small; it is gated on durable
   scrollback, which is a bigger question than search (retention, size caps, and secrets
   in agent output) and should be costed on its own before this is scheduled.
34. **#39 export and share** — main-side page capture, because a WebGL-backed panel comes out
   blank of any renderer-side DOM capture. Bounded by #30 for the text half.
35. **#9, one integration each from tier 1 and tier 2** — Obsidian and GitHub as the two
   reference implementations, after the trust-boundary design pass.
36. **#12 Jira, read-only** — after #9 establishes the auth-and-token surface it shares.
37. **#7 subagent visualisation** — highest ceiling, gated on a detection spike.
38. **#8, part 3 (native chat panels)** — after the panel-kind refactor exists.
39. **#20 two windows** — tier 1 (separate workspaces) is nearly free after #2; tier 3
   (one live panel in two windows) waits for M4c for the same reason #4 does.
40. **#28 accounts** — free to run, but only *after* #9's trust-boundary pass, and only
   once #2 has given the persisted format names worth syncing. Google sign-in and the
   email-code flow are the small half; deciding the machine-owns-processes rule is the
   half that makes it either shippable or M4c in disguise.
41. **#4 multiplayer** — largest; revisit after M4c, when tmux may have done half of it.
42. **#40 the read-only remote view** — after M4c for the same reason #4 is, and a better
   argument for #28's accounts than sync is.
43. **#14 tier 2 (`.xlsx` rendering)** — after tier 1 proves the panel kind.
44. **#24, the functional flavour** — an edge that writes to a PTY on its own initiative.
   Only after there is somewhere to audit automations that is not the canvas itself.
45. **#14 tier 3 (web panels)** — only with an answer to the transform collision.
    Tier 4 (embedding a native app's real window) is a **no**, not a later.

## The structural decision underneath all of this — **made in M9b**

`Panel` is now a discriminated union. `kind` is optional on disk (absent means terminal,
because that is every file written before M9b) and a *present* unknown kind is dropped with
a warning rather than guessed at, because a mis-guessed kind is the one that spawns a
process. `Canvas.tsx` partitions the array **once** and hands only the terminal panels to
tiering, so there is no code path at all from a non-terminal node to a PTY, a WebGL context
or a `LIVE_BUDGET` slot — a structural answer rather than a guard every future caller has
to remember. See `CLAUDE.md`'s "`kind` is optional on disk" and "A review node never reaches
`assignTiers` or `registry.ensure`".

The review node (#51) paid for it, which is not who this section predicted. The rest of this
section is left as written, because the entries below still inherit the decision and the
reasoning still says what a second kind costs:

Ten separate entries (#3 file tree, #7 subagent nodes, #8 chat box, #9 integrations,
#12 Jira boards, #14 live document panels, #15 annotations, #24 edges, #26 the agent
toolbox, #35 groups) all need the same thing:
**a canvas node that is not a terminal.** Today `Panel` means
"a PTY behind an xterm", and `LIVE_BUDGET`, `fit()`-before-spawn, the pointer
correction, and the WebGL accounting all assume it.

Turning `Panel` into a discriminated union of kinds — with the terminal as one variant
and cheap DOM nodes as another that never touch the live budget — is the unlock for the
super-app direction. It is not urgent, and it should *not* be done speculatively. But it
is the thing to build deliberately the first time a second panel kind is genuinely
needed, rather than bolting a special case onto the terminal path and discovering the
union three features later.

**#35 is the entry most likely to force it first, and #14 is the cleanest place to make
it.** A group is a canvas node with no session, no PTY, and no claim on `LIVE_BUDGET` —
so if groups are built before the union exists, they will be built as a special case
bolted onto the terminal path, which is precisely the outcome this section exists to
avoid. Whichever of the two is scheduled first is the one that should pay for the union.

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

Two entries added later answer this directly rather than working around it. **#30 durable
scrollback is the only thing that makes fact two recoverable** — a log on disk is what a
restored panel can show when its xterm buffer has never held a byte — which is why it is
sequenced ahead of #16 rather than beside it. **M8c's restart-in-place is the operation that
moves a panel backwards through these states on purpose** (this was #29), and it is the
reason the states needed naming: killing a process while keeping the session and the id is
a transition the app had no word for. Two more states have arrived since and belong in this
list — a panel with a *session* but no terminal at all (a review node, which never reaches
the registry), and a panel whose baseline main has dropped, which is what lets a review node
outlive its subject.

The general rule, worth applying to every entry above: **ask which of the three facts a
feature needs, and what it does when the answer is "none of them yet".** A feature that
assumes a buffer exists will work perfectly for the whole session in which it was written
and be blank the first time the app is relaunched.
