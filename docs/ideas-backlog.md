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
| #2 the workspace extras M7 did not ship | M18 | "The merged view's obstacle is COORDINATES, not `LIVE_BUDGET`", "The merged view has no writer, and that is why geometry is read-only", "Entering the merged view resolves dormancy BEFORE it commits", "A move touches no session and pushes no history", "The marquee starts only where `hitTest` finds nothing", "The workspace chords match `event.code`" |
| #5 agent-state glow | M6c | "A title is not a bell", "`wants-you` is sticky", "The glow reaches the card" |
| #6 user-set panel names | M6a | "The header's honest chain, and the backfill that must never happen" |
| #7 subagent nodes on the canvas | M15 | "Subagent nodes are derived, not a `Panel` kind", "The slug is a hint" |
| #11 a settings surface with search | M6b | "One map, and a typed view over it", "Settings are a drill-in, not a flat list" |
| #29 restart a panel in place | M8c | "Restart is dispose-then-ensure at one id", "`bumpVersion()` exists because `ensure()` deliberately does not bump" |
| #44 honest chrome | M6a | "`reattached` costs a probe because `-A` erased the question" |
| #49 two copies of the app eating each other | M5c fix | "...and two copies of ONE build must not either" |
| #71 CI on a macOS runner | oss-beta | `.github/workflows/verify.yml`, and `verify:meta` 16 |
| #1 Cmd-held navigation grid | M11 | "The nav grid is the first held-modifier state in this app" |
| #3 file tree / codebase browser | M20 | "Every file row mounts `shellControl`, and here that is not a convention" |
| #52 multi-select | M26 | "A group drag is N origin-based drags and one history gesture", "Selection stays inside the active workspace" |
| #18 what the canvas costs the machine | M29 | "`machine:sample` is polled by the RENDERER against pids the renderer already holds" |
| #35 groups | M30 | "A group owns panel IDS, never panel records, and a collapse is a presentation request" |
| #21 broadcast input | M31 | `session-registry.ts`'s broadcast verb and the palette's broadcast rows; `verify:registry` and `verify:palette` carry its checks |
| #75 a diagnostics overlay and a scrubbed bundle | M32 | "The diagnostics bundle is scrubbed by its TYPE, not by a runtime filter" |
| #68 space-drag and middle-drag pan | M34 | "The pan-drag design" entries — one narrow verb, `beginPanDrag`, beside the wheel listener |
| #43 Unicode 11 widths | M36 | "xterm measures widths against Unicode 11, loaded in `createTerminal` before `open()`" |
| #58 backpressure on a runaway panel | M36 | "The flush is capped by bytes and the cap keeps the TAIL" |
| #50 git worktree per panel | M37 | "A worktree record OUTLIVES its panel, and attachment is COMPUTED, never stored", "The worktree decides the cwd BEFORE the baseline is captured" |
| #56 agents that outlive the app | M38 | "Quit survival is opt-in, and the flush sits between teardown and shutdown in BOTH arms" |
| #30 durable scrollback | M39 | "The scrollback log is an append stream written from the flush", "A dormant card reads the log; a spawned card reads its buffer" |

Twelve more entries were rewritten rather than removed, because a milestone shipped most
of each and stopped somewhere deliberate: **#12** (M19 left writes, Server/Data Center,
OAuth 3LO and a second provider), **#13** (the drop guard and Finder path resolution both
landed; the handoff into the PTY did not), **#14** (M16 left tiers 2–4, and M22 answered
the who-wins-on-conflict question), **#17** (M6d left the OS notification), **#19** (M17
left history/retention, a second CLI adapter, the un-pinned panel and aggregate totals),
**#25** (M6 left snapping and tidy), **#26** (M21
left the cross-panel query and the editing half), **#27** (M5b left placeholders), **#34**
(M5a left per-preset environment), **#41** (M12 left review's cwd resolution), **#51**
(M9a–c left discard). The membership churns rather than only growing, and that is the shape
to expect: **#2** left this list for the gone table above when M18 finished it, while
**#12**, **#13** and **#26** joined it. An entry rewritten down to its open half is one
milestone from leaving the file entirely.

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
  multiplayer — and **the "dirty" third of it effectively landed in M9a**, from a different
  direction: the inspector's Changes section names the files a panel's agent has touched
  since its session started, diffed against a baseline captured at spawn. That is a
  strictly better answer than a dirty flag for the local question, and it says nothing at
  all about **ahead/behind**, which is the half this bullet still owns and which needs a
  remote read rather than a working-tree one. Whoever builds it should reuse
  `main/git-runner.ts` and `main/git-args.ts` rather than starting a second git surface —
  they already carry the resolved-by-absolute-path rule, the per-call timeout, and the
  `not-a-repo` / `repo-unreadable` split this feature would otherwise rediscover.

## 8. Chat-box mode and model choice — M23 shipped part (1); parts (2) and (3) are what is left

This entry called itself **"three features wearing one coat"** and recommended doing (1)
alone first. M23 did exactly that, so what follows is the entry rewritten down to the two
parts that are still open — the file's own rule for a milestone that ships most of an entry
and stops somewhere deliberate.

**What shipped (part 1).** Per-panel permission mode, effort and model for the agent CLI a
panel already spawns, carried as one `agentOptions` record on `PanelSpec`/`Preset`/the
persisted panel, emitted as argv by a pure `agentArgs`, shown as an inspector row set and a
header chip, chosen either by a preset (there is a built-in "Claude (plan mode)") or by the
compound **"Restart in \<mode\>"** palette gesture. `CLAUDE.md` records the mechanisms; the
one worth knowing before extending this is that the compound gesture is what makes the
display honest, because tmux `new-session -A` ignores the argv on a reattach.

**Still open — (2) model choice ACROSS VENDORS.** M23 ships `--model`, but only as a flag on
`claude`. The cross-vendor version is still a presets problem: a preset is a command, its
args, its env and a label, and a second vendor needs a second `AgentKind` before its flags
can be validated or emitted at all. That is the concrete trigger recorded in
`shared/cost.ts`'s `AGENT_FLAGS` comment: **the per-agent capability table gets built when
the second `AgentKind` lands, and not before** — with one member it would have one row, one
consumer, and would still leave exactly the one `spec.agent` branch it claims to remove.

**Still open — (3) a native chat box that is not a terminal.** Unchanged, and still the
expensive one. Every invariant in this codebase assumes a panel is a PTY behind an xterm:
the two-lifetimes registry, `fit()`-before-spawn, cols/rows, the pointer correction,
`LIVE_BUDGET`'s WebGL accounting, the capture-phase wheel ownership. A chat panel has none
of that — plain DOM, cheap to render, no WebGL context, and it does not belong in the live
budget at all.

- **The `Panel` union it wanted already exists.** This entry used to say the discriminated
  union "needs to happen before this lands". It has: M9b added `kind`, and M16 and the Jira
  work added a third and fourth arm. A chat panel is a fifth, and the partition in
  `Canvas.tsx` is what keeps it away from `assignTiers` and `registry.ensure` structurally
  rather than by a guard someone has to remember.
- **Constraint, unchanged:** a chat panel talks to an API, which means a key, which means
  the credential boundary. M14 built that too — `credential-store.ts`, encrypted at rest,
  with no `credential:get` — so the storage half is answered. What is NOT answered is the
  request path: the renderer's CSP is `default-src 'self'` and must stay that way, so the
  call goes through main over a new IPC channel, never `fetch` from the renderer. Note that
  M14's rule is stricter than it first looks: a credential this app obtained must never
  reach a PTY, so a chat panel's key is main's alone.
- **Open question, unchanged and still the interesting one:** does the chat box share
  history with the CLI session, or are they separate conversations? "Same agent, two
  front-ends" is a much stronger product claim than "two unrelated panel types" — and much
  harder. M17's transcript reading is the first thing that makes it even conceivable, since
  a Claude Code session's history is a file this app can already find and parse.


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

  Jira is currently the first tier-2 implementation; it deliberately does not claim this
  surface. GitHub remains the preferred second reference implementation, at which point the
  common boundary can be derived rather than guessed.

## 10. Light mode / dark mode — DONE, M45

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

## 12. Jira connection — reads landed in M19 and the two writes in M24; Server/DC, OAuth and a second provider are what's left

**M19 shipped the Jira Cloud read path AND the handoff this entry called "the version worth
building".** Jira is deliberately the first #9 tier-2 implementation rather than an invented
integration surface: `main/jira-client.ts` behind the `jira:list` invoke, a `kind: 'jira'`
panel listing the tickets assigned to the authenticated user, and a **Start session** control
per ticket that spawns an ordinary titled terminal panel with the ticket's description handed
to the agent as a bracketed `paste()` — never a raw `write()`, the distinction #27 records and
`verify:panels` 40 is the only check able to tell apart. The vendor-neutral boundary this entry
asked for is `shared/work-item.ts`'s `WorkItem` (`id`, `title`, `description`, `assignee`,
`state`, `url`), and the Jira types genuinely do not leak into the panel-spawning code.

Two decisions worth not re-litigating. **Cloud API-token Basic auth was chosen deliberately
over OAuth 3LO** for this private client — the redirect, expiry and refresh lifecycle needs a
milestone of its own, and #28's constraint about an OAuth callback navigating the window
(which would kill every PTY) is the reason it is not a small one. And the credential itself
goes through M14's store, so this integration **inherited a boundary rather than inventing
one** — which is what #9's design-pass bullet said the first tier-2 implementation should be
able to do.

**M24 made the decision this entry said had not been made, and settled it narrowly.** The
read-only-first constraint was a stance rather than a scope cut — writing to Jira from an app
where agents run arbitrary commands is a meaningfully different risk posture than reading —
and what shipped is the smallest thing that answers it: exactly **two verbs**, comment and
transition, on a ticket the panel is already showing. Both are reached **only from a human
gesture** in the renderer; there is no channel taking a panel id and nothing main can call on
a PTY's behalf, so no agent-reachable path triggers a write. That rule has **no runtime symptom
when broken** — add such a path and the app works exactly as it does now, plus one capability
nobody asked for — so it is pinned as **source text** rather than as behaviour, by `verify:meta`
22 (the `JIRA_*` channel set asserted exactly equal to {list, transitions, comment, transition},
an allowlist so a fifth cannot arrive unremarked) and 23 (no module that builds a process
environment imports the Jira client), with both of 23's honest limits stated in its own comment
rather than left to be discovered. **Transition screens are explicitly still open**: a Jira
workflow can require fields at transition time, and this app neither collects nor renders them,
so a transition into such a screen is refused with Jira's own sentence rather than handled.

What's still open:

- ~~**One declaration for the three Jira result types.**~~ **Done, M36**: all three are
  declared in `shared/ipc-contract.ts` alone and `main/jira-client.ts` imports them, pinned
  by `verify:jira` `types.1`. What is still open from that note:
  **`listAssignedWorkItems` is where the same drift recurs next** — it still maps HTTP
  statuses inline rather than through `statusFailure`, correctly for now (a different
  union answering a different question), and the day it grows a `refused` arm is the day
  that inline copy has to agree with a mapping it does not share.

- **Server / Data Center.** A different auth story entirely, and still unaddressed. Cloud was
  assumed and said so, which is what this entry asked for.
- **OAuth 3LO**, per the deferral above.
- **A second provider — Linear or GitHub Issues.** `WorkItem` is the vendor-neutral shape the
  original note asked to keep, and the constraint it came with is unchanged: **do not build
  the abstraction until the second provider is actually wanted.** One adapter exists.
- **The wall-of-tickets-in-progress view.** Combined with the agent-state glow (M6c), several
  ticket-spawned panels running at once are legible at a glance in a way a Jira board is not —
  but nothing groups or labels them as such today. That is #35's territory, not this entry's.

## 13. Drag and drop images into a session — the guard and the path both landed; the handoff did not

Drop an image onto a panel and have the AI in it receive the image — whether that panel
is a terminal running an agent CLI or a native chat box (#8).

- ~~**Read this constraint before anything else: an unhandled file drop can kill every
  session in the app.**~~ **Done, and it was the highest-value line in this entry.**
  `src/renderer/drop-guard.ts` now `preventDefault()`s both `dragover` and `drop` at the
  document level, independently of whether this feature is ever built, with
  `main/index.ts`'s `will-navigate` refusal as a second line of defence. Both listeners
  are required and they cancel different things — cancel only `drop` and the default
  navigation still happens; cancel only `dragover` and the drop fires uncancelled — which
  is why `verify:canvas` 5 and 6 assert each half separately. The failure it removes was
  never "the drop does nothing": it was *every running agent dies and the canvas reloads
  into a blank grid*, because `window-lifecycle.ts` kills a window's PTYs on navigation by
  design. **When this feature is built it hangs off these same two events — the handlers
  gain behaviour, but they must keep cancelling.**
- **The chat-box half is the straightforward one.** A chat panel talks to an API that
  takes images as base64 parts. Read the file in main, attach it to the request. Ordinary.
- **The terminal half is the interesting one, and it has a real answer.** A PTY is a byte
  stream — you cannot hand it an image. But the agent CLIs already solved this: they
  accept **file paths** in their input and read the image themselves. So the drop
  handler's job is to produce a path and type it into the terminal. Two cases:
  1. **A file dragged from Finder** — already has a path, and **half of this case is
     already built**. M16 needed the same resolution for its file panels, so
     `webUtils.getPathForFile(file)` is exposed through the preload as
     `window.canvas.file.pathForFile` and `Canvas.tsx`'s `onDrop` already calls it — the
     Electron 32+ removal of `File.path` this bullet warned about is handled, and
     `CLAUDE.md` records why it had to be (a missing property reads as `undefined`
     exactly like a legitimately absent one, so the mint silently does nothing). What is
     missing is only the *destination*: a Finder drop currently mints a file panel, and
     routing it into the hovered panel's PTY over the existing `pty:write` channel is the
     remaining work. Note it must go through `paste()` rather than a raw write if more
     than a bare path is ever sent, per #27.
     **Also still unresolved: a drop now has two plausible meanings** — open this file as
     a panel (M16) or hand it to the agent under the cursor (this entry) — and nothing
     disambiguates them. A modifier, or the drop target, has to decide, and that choice is
     this entry's real remaining design cost rather than the plumbing.
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

**Tier 1 landed in M16** — a read-only, live-watched local-file panel: `main/file-read.ts`'s
five-arm read (`text`/`missing`/`too-large`/`binary`/`unreadable`), `main/file-watch.ts`'s
directory watch, `FileNode.tsx` on the canvas, and a Finder drop. Tiers 2–4 below are
explicitly still open and unstarted; nothing about M16's design commits to how any of them
would work. The "who wins when both edit" question in the last bullet was **answered in
M22**, which made the panel editable: a save carries the mtime its draft was
seeded from, and main refuses the write outright if the disk has moved since —
"reload unless the panel is dirty, then warn" as this entry proposed, plus an
explicit overwrite the user reaches only after being shown the conflict. Tiers
2–4 remain open and unstarted; nothing about M16's or M22's design commits to
how any of them would work.

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
  1. ~~**Text-ish local files**~~ — **done, M16, M22 and M27**, and the "start here" advice was
     right for the stated reason: it shares almost nothing with the terminal path, so it
     could not be faked as a special case of one. A five-arm read
     (`text`/`missing`/`too-large`/`binary`/`unreadable`), a **directory** watch rather
     than a file one (an atomic `rename()` replaces the inode and a file-scoped watch dies
     with it — the single most important line in that milestone), and M22's
     compare-and-swap write keyed on the mtime the draft was seeded from.
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
- ~~**Open question worth deciding early:** when the agent and the user edit the same file
  at the same moment, who wins?~~ **Answered in M22**, and close to the stance this bullet
  proposed: a save carries the mtime its draft was seeded from, main refuses the write
  outright if the disk has moved since, and an explicit overwrite is reachable only after
  the user has been shown the conflict. Tiers 2–4 inherit that answer rather than needing
  their own.

## 15. An annotation layer — ink, highlights, sticky notes on the canvas

> **M27 shipped the cheapest slice of the intent behind this entry, and it is
> worth knowing before this is built.** "Somewhere thinking happens alongside
> the work" is now partly answered by a NOTE — a file panel in prose mode,
> created from the palette, backed by a real `.md` under the selected panel's
> cwd. That is deliberately NOT this entry: a note is a panel, so it has a
> rect, a z, a close button and a place in the rail, where an annotation is a
> world-space object with none of those. What M27 removes from this entry's
> scope is only the sticky-note-as-text-container case; ink, highlights,
> arrows and panel-ANCHORED annotations are all untouched, and the input
> arbitration problem below — which is this entry's real cost — is unchanged.
> A note also survives outside the app and version-controls with the project,
> which an annotation stored in `layout.json` never will; if that turns out to
> be the property people actually wanted, this entry is smaller than it looks.


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

## 17. Attention that reaches you outside the window — DONE, M43

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

## 19. Token and dollar accounting — landed in M17; aggregate totals landed in M46 (the context pane's no-selection summary); the open half is history, a second adapter and the un-pinned panel

M17 shipped the live-readout half: a pinned `--session-id`, a poller reading the pinned
transcript on its own tick, deduped, and an inspector Cost section rendering three states
— nothing, a note, or four token figures and a labelled dollar total. See `CLAUDE.md`'s
"The session id is persisted, never re-minted", "`detachAll()` clears the cached
transcript path and NOT the totals", "Four token classes, never two", "The carry buffer
is the parser's whole correctness", "Zero and unmeasured are different facts", and "The
transcript path is globbed, not rebuilt" for the mechanism, plus the honesty note on the
one unverified link (`--session-id` actually causing Claude Code to write that filename).

What's still open:

- **History and retention.** This shipped as a LIVE readout only — a number on a card,
  read from the transcript's current tail, with no record kept once a panel closes and its
  usage state is dropped. "What did this canvas cost me last week" is a data-retention
  feature with its own storage question, and it is still unowned: it should share whatever
  #46's run ledger settles on rather than inventing a third store for a second piece of
  per-panel history.
- **A second CLI adapter.** The neutral model shipped — `AgentKind` is a union with one
  member, `'claude-code'`, and `costOf`/the parser/the accumulator all take a model string
  and totals with nothing Claude-specific baked into their shapes — but no `codex` adapter
  exists, because none was asked for. Keep the original constraint attached: **do not build
  the abstraction beyond one member until a second CLI actually wants it.**
- **The un-pinned panel.** Accounting is gated on `spec.agent`, set only by a preset that
  declares one — a `claude` typed by hand into a login shell panel is invisible to this
  feature and reports nothing, by design (`verify:panels` 140 pins exactly this: no pin, no
  Cost section, not an empty one). The honest fallback this entry once proposed — the
  panel's cwd plus start time — is a GUESS whenever two panels share a directory, which two
  panels spawned from the same preset routinely do, and a wrong attribution here is worse
  than no attribution at all: it tells the user the wrong agent is expensive.
- **Per-workspace and canvas-wide totals.** The accumulator is keyed per panel id in one
  `Map`, so summing across a workspace or across every workspace is a fold over that map's
  existing values — the store makes both cheap. Neither reads anywhere on screen; nothing
  in the rail or a workspace row aggregates them yet.

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

## 24. Edges between panels — functional restart-on-exit shipped in M25

**The decorative half is now complete, in two milestones.** M13 built the
MODEL: a directed, optionally labelled line from one panel to another, which
persists, survives a reload, and leaves in the same undoable step as either
endpoint. M35 built the ERGONOMICS, which is what made the model findable —
four port handles revealed on hover, a drag with a live ghost curve and a ring
on the prospective target, snapping to a panel within a screen-space radius,
edges rendered as bezier curves that leave each border perpendicular, and an
`×` badge on hover that removes one. M13 shipped links that worked and that
almost nobody would find (arm a mode from the palette, then click); M35 is the
milestone that made linking a thing you do by pointing at the two panels. See
`CLAUDE.md`'s "The code says `link`, and `edge` already means something else"
and the entries after it — including M35's own, beginning at "The link layer's
guarantee moved from STRUCTURAL to CONVENTIONAL" — and both specs:
[`m13-panel-links-design.md`](superpowers/specs/2026-08-30-m13-panel-links-design.md)
and
[`m24-link-drawing-design.md`](superpowers/specs/2026-08-30-m24-link-drawing-design.md).

The entry named **two flavours and said they should not be built at once**.
Both are now built: decorative links shipped in M13; M25 adds the smallest
functional action that is useful without turning the canvas into an invisible
PTY writer.

- **Functional action — shipped.** On an outgoing terminal-to-terminal link,
  the Inspector's `↻` enables “when this exits, restart that terminal.” The
  Inspector also has a plain **Automations** list, naming both endpoints,
  enabled state and the most recent run/skipped outcome; the canvas line is
  never the only evidence that a process can be restarted.
- **Safety boundaries.** The action never wakes a dormant or never-started
  target, so a saved rule cannot launch an agent merely because another panel
  exited. It only acts after the registry records the source exit, and a
  directed cycle is refused at creation and stripped on load — a rate limit
  would only turn a configured loop into a delayed surprise. A restart may
  cascade down a finite configured chain; that is visible in the list and is
  the semantics of “on exit,” including an exit caused by an upstream restart.
- **Deliberately not included.** Piping terminal output remains absent. It
  would make the canvas write arbitrary bytes to a PTY, needs a payload/audit
  model beyond this relation-owned action, and must be designed separately.
- **What M13 leaves ready.** The primitive is built generally rather than as a
  private detail of #7's subagent visualisation, which is what #24 asked for:
  same renderer, same z-order answer, same persistence. #7's parent-to-subagent
  edges can render on `LinkLayer` without inventing a second scheme. **M35 adds
  to that inventory**: `linkPath`/`linkControls` (a bezier from two anchors,
  pure and plain-node checkable), `nearestLinkTarget` (a drop resolver that
  prefers containment and excludes its own source), and `PanelPorts` (one
  component, five call sites) — so a functional edge would be a new MEANING on
  an existing gesture rather than a second gesture.
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
  never wake a dormant panel — `verify:panels` 126 for M13's armed click, and
  175 for M35's port drag, which holds it by CONSTRUCTION (waking hangs off
  `onSelectPanel`, which fires from mousedown, and the port consumed ours) and
  is checked anyway, because "holds by construction" is exactly the claim a
  later refactor breaks silently. A rule that *fires* on a dormant panel is a
  harder version of the same question, and neither milestone answers it.
- **Constraint the functional half inherits, added by M35:** the layer's
  pointer guarantee is no longer structural. It was one CSS declaration
  (`pointer-events: none` on `.link-layer` and everything in it) and is now a
  convention — two descendants opt back in, and hold the invariant only because
  neither consumes the event. Anything the functional half adds to that layer
  inherits the same obligation and the same silent failure; `CLAUDE.md`'s entry
  and `verify:panels` 127 are the authority.
- **Deliberately still absent, and each is a decision rather than an
  oversight:** link SELECTION on the canvas — M35 gave a link a hover hit
  target and a remove badge, so removing one is no longer a trip to the
  inspector, but there is still no selected-edge state, no `Delete` key owner
  and no relabel-by-keyboard, because a hairline at `MIN_SCALE` (0.1) is a
  sub-pixel target and edge selection would have to coexist with panel
  selection and the marquee; ROUTING, in the sense of avoidance — M35 replaced
  the straight segment with a bezier that leaves each border perpendicular, and
  a curve still passes under intervening panels because nothing routes around
  them; PERSISTED PORT SIDES, so an edge does not remember it left A's right
  side and re-derives its anchors from the live centre-to-centre bearing every
  frame (`linkAnchors` reserves an unused third parameter for the milestone
  that changes that, and taking it grows `PanelLink`, both parsers and
  `layout-adapt`'s round trip — which is exactly the scope M35 saved by
  declining it); culling and any bound on link count; and cross-workspace
  links, which are representable — `PanelId` is global — and render as nothing.

## 25. Where a new panel goes — placement, snapping, and tidy — DONE, M50 (snapping and tidy; spawn placement landed in M6)

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
     rect math over `Panel[]`. "The selection" is no longer hypothetical: M18 added
     `selectedIds`, and M26 completed its shift-click and group-drag gestures, so a tidy has
     a real set to arrange rather than a single `selectedId` that made "tidy the selection"
     mean "tidy one panel".
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

## 26. The agent's toolbox — the READ half shipped as M21; what is left

**M21 shipped the read-only inventory** — `docs/superpowers/specs/2026-08-30-m21-agent-toolbox-design.md`
— which is exactly what item 31 of the sequencing list below said to do first,
and it landed after M16 for that item's stated reason: it is the same
directory-reading machinery and should not have invented a second copy of it.
Select a panel and the inspector's Toolbox section names its skills, slash
commands, subagents, MCP servers, hooks and permission counts, across the user
and project scopes at once; open that as a `kind: 'toolbox'` node and it keeps
answering after the panel it was opened from is closed, because it is addressed
by CWD rather than by a panel id.

**This entry is rewritten down rather than deleted, because the differentiating
claim it was written for is still unshipped.** What follows is what is left, and
the ordering is roughly the order it is worth doing in.

- **The cross-panel answer — the entry's whole original argument, and still the
  best reason for any of this.** "These extensions resolve per project, so a
  canvas holding twelve panels in twelve directories is the only place where
  'which of these agents can actually do X' is a question the UI can answer."
  M21 answers it for ONE panel at a time; the cross-panel form is a palette
  scope where typing a capability name lists the panels that have it, and the
  panels that do not. It needs a per-cwd cache across N panels, which
  `ToolboxCache` already is — the read is keyed by resolved cwd precisely so
  twelve panels in one repository cost one parse. **This is the next
  milestone**, and it is much smaller now than the read was.
- **The editing half, still deliberately unshipped.** "Ship the browser, then
  decide about the editor." M21 shipped the browser and the decision is still
  open. The asymmetry the original entry named is unchanged and is the reason:
  listing is inert, while hooks are arbitrary code that runs on tool calls,
  permission settings decide what an agent may do without asking, and an MCP
  server is a process with its own reach. A one-click toggle is a very
  different affordance from a file an agent had to deliberately edit. Note that
  M21 makes editing *cheaper* to build and no safer to ship: every entry
  already carries the absolute `sourcePath` a writer would need.
- **Plugins as first-class entries.** M21 reads `enabledPlugins` for the one
  cheap fact — which ids are on — and lists nothing from them, which is why
  every `unknown/plugin-owned` arm exists. Measured on one machine:
  `~/.claude/plugins` is **663 MB containing 700 `SKILL.md` files** under
  `cache/`. Walking that is a different milestone with its own caps, and the
  honest question it has to answer first is whether a user wants 700 more rows
  at all or only wants to know which plugin a hidden skill came from.
- **A path-keyed, refcounted watcher, if pull ever proves not enough.** M21 is
  PULL — an invoke on selection, a refresh control on the node, a stat-sweep
  cache — and `FileWatchers` was the wrong tool rather than merely unbuilt:
  it is keyed by PANEL id, which is right for a file panel and wrong here,
  because half of this feature's sources (`~/.claude/settings.json`,
  `~/.claude.json`, `~/.claude/skills`, `~/.claude/commands`) are shared by
  every panel on the canvas. Twelve panels would arm twelve watchers on the
  same four paths. Doing it properly is a registry keyed by PATH with a
  refcount, and it is its own milestone; the node renders `readAt` in the
  meantime so a stale node is honest rather than silently wrong.
- **The three resolution unknowns, which no amount of reading files can
  settle.** M21 answers `unknown` for each rather than guessing, and each would
  need confirming against the CLI itself: whether `permissions.allow` UNIONS or
  is OVERRIDDEN across the three settings files (M21 never merges, and
  attributes every count to its own file); whether a project skill SHADOWS a
  same-named user one (M21 reports the LINK in `alsoDefinedIn` and refuses to
  name a winner); and whether the newer `enabledMcpServers` pair outranks
  `enabledMcpjsonServers` when both name one server (M21 answers
  `contradictory-config`). Answering any of them turns an `unknown` arm into a
  real one — and getting one wrong turns an honest refusal into a confident
  lie, which is strictly worse than what is there now.
- **Managed settings.** `/Library/Application Support/ClaudeCode/managed-settings.json`
  did not exist on the machine M21 was measured against and is not read. A
  managed DENY that this app hides is the worst possible wrong answer for a
  feature whose whole promise is "what can this agent do", so if that path is
  real it should be a fourth scope rather than an omission.
- **Codex, or any second vendor.** Unchanged and still declined: "do not build
  the abstraction until Codex or another CLI actually wants it." M21's
  `ToolEntry` is a discriminated union with a shared base, which is the shape
  an adapter would slot into, and no adapter exists.
- **"Turn this panel's last hour into a skill."** Noted in the original entry
  and still a genuinely interesting, much larger feature. Untouched.

**One constraint from the original entry is now resolved and should not be
re-raised.** It warned that "the app has no restart-in-place path today" and
that a config UI must not be the feature that quietly introduces one. M8c
shipped `restartPanel` for its own reasons, so the worry no longer applies —
and M21 still declines to offer restart from the toolbox surface, because that
would make killing a working agent one click away from an mtime. What it does
instead is state the fact: a `stale` freshness arm says "config on disk has
changed since this panel started", naming the files, and says nothing whatever
about the running agent.

**Two things M21 measured that any successor should not re-derive.**
`~/.claude/settings.json` was **64,152 bytes** on the machine it was built
against, which is 1,384 bytes short of `MAX_PROMPT_BYTES` — so `prompts.ts`'s
cap must never be reused here, and `SETTINGS_MAX_BYTES` is 1 MB for that reason.
And `projects[*].history` was observed PRESENT on one machine and ABSENT across
all twelve projects on another, which is why the `~/.claude.json` read is an
ALLOWLIST of four paths: a denylist is silently wrong on one of those two
machines and the failure is invisible, because the payload merely gets bigger.

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

## 31. Secrets in agent output — a standing rule; the scrubber shipped in M39, its customers are next

> **M39 wrote `shared/redact.ts`** — the pattern-based scrubber this entry asks
> for, with kind-named placeholders and a count, plain-node checked — and
> applied it to NOTHING, per this entry's own guidance: redact what leaves the
> machine, mark what stays, never touch the live terminal. The local log is
> marked by `scrollback.persist`'s description. What is still open is the
> application: M48's text export and the diagnostics bundle.

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

## 32. A keyboard-first canvas — and the accessibility that comes with it — DONE, M44

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

## 36. Panel typography — font size, and why it is a resize wearing a hat — DONE, M49

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

## 37. Sound — the channel that works when you are not looking — DONE, M43 (the bell half)

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

## 38. First run — what an empty infinite canvas teaches — DONE, M48

M4b made the canvas restore what was there last time. The corollary nobody has designed
yet: on a first launch there is nothing there, and an empty infinite canvas is
indistinguishable from a broken one.

- **This entry's premise has already come true, which moves it from "later" to "now".** It
  was written when `SEED_PANELS`' twelve hand-authored panels were the boot data and the
  question was what happens when that scaffolding goes away. **It went away in M4b**: a fresh
  install now boots `firstRunPanels()` — *one* centred placeholder — and `SEED_PANELS`
  survives only as `verify:panels` fixture data, which is what it was always really
  exercising. So the thing this entry predicted is what a new user sees today: one panel on a
  grey field with a zoom percentage in the corner and no affordance whatsoever, because
  **every canvas shortcut is `Cmd`-gated by design and therefore undiscoverable by design.**
  That trade was made for a good reason (bare keys belong to the TUI) and it hands the entire
  discovery burden to a first-run experience that does not exist.
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

## 46. A run ledger — what each panel ran, and how it ended — DONE, M52

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
- **The same writer serves #19.** Token accounting reaches this identical question — an
  append-only stream of small metadata records, beside `layout.json` and deliberately not
  through `layout-store.ts` — from the other side. Whichever of the two ships first should
  build the writer for both rather than leaving the second to discover the same
  constraints again.

## 47. The environment report — everything main already knows and never says — DONE, M48

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

## 51. Discard — the half of per-panel review that writes in the other direction — DONE, M53

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

## 53. Cards that show the last real screen — the dormant half landed in M39; the live-tier half is what is left

> **M39 made the DORMANT card honest**: a restored panel's card shows the
> tail of its durable log above "click to start", which is the half of this
> entry the log makes free. What is left is the other half — a spawned
> panel's card is still `handle.tail(6)`, the colour-stripped fragments this
> entry opens with — and the `serialize`-at-detach source that would fix it.
> `capture-pane` on a surviving session is no longer needed for the restore
> case and is not planned.

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

## 54. Cmd-click a path or URL in agent output — DONE, M51

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

## 57. `tc` — a CLI and a URL scheme, so the canvas is drivable from outside — DONE, M54

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

## 59. OSC 133 shell integration — command boundaries as first-class objects — DONE, M52

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

## 61. Recover an orphan session instead of killing it — DONE, M55

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

## 63. Spatial ordering the LOD already knows — DONE, M44

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

- **The specific drift this entry opened with has since been closed, and the argument
  survives it.** It read: `package.json` declares `verify:palette`, `npm run verify` runs
  it, and it appears in **neither** `README.md`'s script list nor `CLAUDE.md`'s suite
  table. Both now list it, so that sentence is no longer true — but it was closed by
  someone noticing, which is the entry's point rather than a refutation of it. The
  mechanism that *would* have caught it, `verify:meta` 19 (every declared `verify:*`
  script is wired into the chain), is the one below. Note what that check still cannot
  see: it asserts the chain, not the two documents, so a suite added to `package.json` and
  to the chain but never written up drifts exactly as `verify:palette` did. **Eleven
  hand-rolled suites is now twenty-six**, which is the same argument at more than double
  the size.
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

`Canvas.tsx` now carries **fourteen** global test hooks across **six** naming generations —
eight `__m4a*`, plus `__m4bUndo`/`__m4bReset`, `__m5aSpecOf`/`__m5aDefaultSpec`,
`__m7aWorkspace`, `__m13Open` and `__m20Toolbox` — and every milestone adds more with a fresh
prefix. `CLAUDE.md` still says eight and names only the `__m4a*` set. Consolidate them into
one `window.__tc` namespace with a version field and a deliberately narrow, documented
question-per-method contract, stripped from production builds by a vite define.

- **The count in `CLAUDE.md` is the second confirmed drift, alongside #70's — and unlike
  #70's it is still open, and it has since drifted further.** Both were found by reading
  rather than by a check failing, which is the argument for #70 restated. The prefixes are
  also now actively misleading rather than merely dated: two of the six name milestones the
  work was **renumbered away from** on merge (`__m13Open` mints a *file* panel, which
  shipped as M16; `__m20Toolbox` belongs to M21), so the prefix records the branch's own
  working title rather than the milestone that shipped it. A prefix scheme that encodes a
  number the repo reassigns is one this file's own numbering rule already rejects.
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

## 77. M35 link drawing — what Task 8 left, rewritten down after M36

M35's plan assigned a Task 8 to sweep up loose ends; it did not land, and the
final review found four items. M36 closed the two that were code — the
`onContextPasted` inline arrow that defeated every terminal panel's memo, and
`LinkLayer`'s `onRemove` re-rendering the layer on every palette open — both
pinned by `verify:panels` `memo-stable.1`. Two remain, and neither is work:

- **The badge/label overlap** was fixed by M35's own final review (the label
  sits 16 world units above the midpoint, leaving the `×` badge on its click
  target) and is **unverified by any check** — a visual property the harness
  cannot judge, on the by-hand checklist rather than in `npm run verify`.
- **A CORRECTION, not a defect: armed link-mode and the removal badge do not
  double-fire.** `onLinkModeMouseDownCapture` is a React CAPTURE-phase handler
  on `.canvas` that calls `stopPropagation()`, and React checks
  `isPropagationStopped()` between nodes on the way down, so while armed a
  press on a port or a badge completes the armed link and does nothing else.
  Recorded because the belief was reasonable and wrong, so nobody re-opens it.

## A note on sequencing for 41–75

The section below was written for entries 1–40 and has **not** been re-ordered to include
these. Three observations that would change it if it were:

- **#41 was load-bearing for entries that already exist,** in the same way the panel-kind
  union is. Four entries assume live cwd; #52's multi-selection assumption is now built by
  M26. Both belonged near the front of any real ordering.
- **#43 is a defect, not a feature,** and #70's drift finding was a second. #49 was a third
  and is fixed. Defects should be fixed rather than scheduled.
- **#50 (worktree isolation) was the one entry here that changed what the product is for,
  and it shipped in M37.** Its cost landed where this note predicted — the absent-`command`
  rule gained a fifth field — and where it did not: the dispose call-site count never moved,
  because a worktree record outlives its panel and no close removes anything from disk.

## Rough sequencing, if these were ever scheduled

**Written before M5b and never re-ordered since.** **Sixteen** of its items have shipped and
are struck below; the surviving order was computed against a codebase that had no palette, no
settings schema, no workspaces, no shell, no review layer, no panel-kind union and no
integrations at all, so treat it as a record of how these were once weighed rather than as
advice about what to do next. Two of the four most recent strikes landed **out of this
order** — #24's decorative half (item 19) and #12's Jira read (item 36) both shipped well
ahead of prerequisites this list gave them — which is the clearest evidence that the ordering
has stopped being predictive.

Ordered by (value × confidence) ÷ effort, not by preference:

0. ~~**The file-drop guard from #13**~~ — **done.** It was never a feature, it was a
   latent bug: an unhandled file drop navigates the renderer and `window-lifecycle.ts`
   then kills every PTY in the window. `src/renderer/drop-guard.ts` now `preventDefault()`s
   `dragover`/`drop` at the document level, independently of whether the drag-and-drop
   feature is ever built.
1. ~~**#6 panel names**~~ — **done, M6a.**
2. ~~**#37, the bell half only**~~ — **done, M43.** The bell already drives wants-you (M6d);
   M43 adds the SOUND on that transition — `shell.beep()`, off by default, using the user's
   own alert sound so it needs no bundled asset and works when the window is hidden. The full
   #37 (distinct per-state sounds) remains a later, larger design.
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
12. ~~**#32 keyboard-first navigation**~~ — **done, M44.** Nearest-panel-in-a-direction is plain-node math over
   the same rects. The design work is the rule that traversal moves *selection*, not focus,
   so arrowing across a canvas does not spawn everything it passes.
13. ~~**#2 workspaces**~~ — **done, M7 and M18**, and not free: the switch had to become a
   transaction that writes the outgoing canvas before it flips the active id, and M18's
   merged view and cross-workspace move both had to obey that same ordering one door
   further out.
14. ~~**#34 panel templates**~~ — **done, M5a**, as presets. The "new workspace from a
   template set" half is what #34 has been rewritten down to.
15. **#38 first run** — schedule it whenever `SEED_PANELS` goes away, and not a day later:
   an empty infinite canvas with only `Cmd`-gated shortcuts has no discoverable
   affordances at all.
16. ~~**#1 Cmd nav grid**~~ - **done, M11**, and the prediction held exactly: cells are
   workspaces, self-contained once #2 (M7) gave it destinations. The other two candidates
   the original entry left open - viewport quadrants and saved bookmarks - were rejected
   in the design spec; see #42 for the bookmark half.
17. ~~**#21 broadcast input**~~ — **done, M31.** M18's marquee and M26's shift-click
   supplied the selection; the loop over `pty:write` is what shipped, with the safety
   story (a loud armed state, an obvious exit) as the milestone's whole design cost.
18. **#15 annotations — sticky notes and world-anchored ink first.** Unusually high
   feel-per-effort: SVG in the `.world` layer inherits pan/zoom for free, and no process,
   API, or token is involved. Ink and panel-anchored annotations follow once the mode
   arbitration is settled.
19. ~~**#24 edges, decorative flavour only**~~ — **done, M13**, as *links*, and it did not
   wait for #15 as this item assumed: the SVG-in-`.world` machinery was built here first
   rather than inherited from an annotation layer that still does not exist. The functional
   flavour is what #24 has been rewritten down to, and it remains much later and much more
   dangerous.
20. ~~**#35 groups**~~ — **done, M30**, and NOT as a panel kind: a group owns panel ids
   and derives its rect from its members, so tiering, the registry, the rail, undo and
   persistence each needed zero code of their own. Both recorded constraints held.
21. ~~**#11 settings surface**~~ — **done, M6b**, at exactly the point this item names,
   and the prediction held: every toggle since has been a `SettingDef` and nothing else.
22. **#31 secrets — the standing rule** — costs nothing to state and must be stated before
   #30, #16, #39, or #28 move a single byte of terminal output off the panel. Write it
   down here; implement it inside whichever of those ships first.
23. ~~**#18 machine cost readout**~~ — **done, M29**: one `ps` snapshot per two-second
   tick, requested by the renderer for the pids it already holds, aggregated recursively
   over each process tree and totalled as a union so nothing is counted twice.
24. **#10 light/dark** — chrome is easy; the real work is xterm's `theme` option fanned
   across the registry plus a readable light ANSI palette.
25. **#36 panel typography** — commit-on-release like a resize, because a font change is a
   grid change is a SIGWINCH. Pair it with #10: both are `Terminal` options fanned across
   the registry, and whichever lands first should build the fan-out.
26. **#13 image drop/paste, Finder + clipboard cases** — small now that the guard exists;
   the terminal path is "write a file path into the PTY", which needs no new channel.
27. **#23, the actually-maximise half** — a layout mutation with a restore rect, a
   SIGWINCH on entry and exit, and a decision about whether focus mode pins the budget.
28. ~~**#19 token and dollar accounting**~~ — **done, M17**, and the "build the watcher
   once" advice was half-followed: #7's subagent nodes (M15) and this both read a vendor
   transcript, but they read *different* files for different facts and each built its own
   reader. What M17 actually needed was a pinned `--session-id`, which nothing here
   predicted. History, a second CLI adapter, the un-pinned panel and aggregate totals are
   what #19 has been rewritten down to.
29. ~~**#14 tier 1 — a watched local-file panel kind.**~~ — **done, M16**, and later made
   editable in M22. The one prediction here that did *not* hold is the important one: it
   was **not** the first non-terminal panel and did **not** force the union, because M9b's
   review node had already paid for it (see the section below, which records the same
   correction). Tiers 2–4 are what #14 has been rewritten down to.
30. ~~**#3 file tree**~~ — **done, M20**, rooted on the selected panel rather than a
   workspace-level root, which the open question here left unsettled: each panel is a
   shell that can `cd` anywhere, so the tree follows the panel the user has selected
   instead of picking one root for the whole canvas.
31. ~~**#26 agent toolbox, read-only inventory**~~ — **done, M21**, at exactly the point
   this item names and for exactly its stated reason: it landed after M16's file panel and
   reused that milestone's shape rather than inventing a second copy. The prediction that
   held is the sequencing one; the prediction that did NOT is the machinery — see #26's
   own rewrite for why `FileWatchers` turned out to be the wrong tool (it is keyed by
   PANEL id, and half of this feature's sources are shared by every panel on the canvas),
   so M21 is PULL with a cwd-keyed cache rather than the watched-directory design this
   item assumed. The editing half and the cross-panel query are the two pieces left.
   The original text follows: after #3 or #14 tier 1, because it is
   the same watched-directory machinery and should not invent a second copy of it. The
   editing half is a separate, later decision.
32. **#30 durable scrollback** — schedule it *before* #16 rather than alongside it: it is the
   larger question (retention, byte caps, and #31) and it is what makes a restored canvas
   show anything at all. Write it from `pty-manager`'s existing flush, as an append stream
   and emphatically not with `layout-store`'s rewrite-the-file pattern.
33. ~~**#16 canvas-wide search**~~ — **done, M42.** `Cmd+F` opens the palette in a
   `search` scope whose query box IS the term; main searches every panel's durable log
   (case-insensitive, ANSI-stripped, capped 50 total / 5 per panel, newest first) and each
   hit is a row that frames its panel through `goToPanel` — never waking it, never scrolling
   the live terminal. Three empty states (off / no matches / nothing typed yet). Gated on
   M39, as this entry required.
34. **#39 export and share** — main-side page capture, because a WebGL-backed panel comes out
   blank of any renderer-side DOM capture. Bounded by #30 for the text half.
35. **#9, one integration each from tier 1 and tier 2** — Obsidian and GitHub as the two
   reference implementations, after the trust-boundary design pass.
36. ~~**#12 Jira, read-only**~~ — **done, M19**, and deliberately **not** in this order:
   it did not wait for #9's two reference implementations to establish a shared
   auth-and-token surface, because M14's credential boundary had already supplied the part
   that actually mattered. Jira is therefore the *first* tier-2 implementation and
   explicitly declines to claim the surface; GitHub remains the preferred second one, at
   which point the common boundary can be derived rather than guessed.
37. **#8, part 3 (native chat panels)** — after the panel-kind refactor exists.
38. **#20 two windows** — tier 1 (separate workspaces) is nearly free after #2; tier 3
   (one live panel in two windows) waits for M4c for the same reason #4 does.
39. **#28 accounts** — free to run, but only *after* #9's trust-boundary pass, and only
   once #2 has given the persisted format names worth syncing. Google sign-in and the
   email-code flow are the small half; deciding the machine-owns-processes rule is the
   half that makes it either shippable or M4c in disguise.
40. **#4 multiplayer** — largest; revisit after M4c, when tmux may have done half of it.
41. **#40 the read-only remote view** — after M4c for the same reason #4 is, and a better
   argument for #28's accounts than sync is.
42. **#14 tier 2 (`.xlsx` rendering)** — after tier 1 proves the panel kind.
43. ~~**#24, the functional flavour**~~ — **done, M25 then M41.** Restart-on-exit
   is guarded by the Inspector's automation list; M41 added the OTHER half #24
   named — a handoff edge that starts the target with the source's recorded
   output as context — on the same audit surface. Both bounds (200 lines,
   16 KiB) are named in the row where the rule is made, the payload is a
   bracketed paste of main's own scrollback tail (never a raw write), and the
   rule overrules M25's no-wake refusal for its own kind in writing, because
   "start B with A's output" is what the user configured. Nothing in #24 is
   left open.
44. **#14 tier 3 (web panels)** — only with an answer to the transform collision.
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

The review node (#51) paid for it, which is not who this section predicted. **Four more kinds
have arrived since, and the union has held every time** — `review` (M9b), `file` (M16, made
editable in M22), `jira` (M19) and `toolbox` (M21) — so `isTerminalPanel` is now a positive
partition test (`!isReviewPanel && !isFilePanel && !isJiraPanel && !isToolboxPanel`) rather
than the single negation it could safely be while there was exactly one alternative. That
change is the union's one recurring maintenance cost and it fails in the **dangerous**
direction if forgotten: a new kind that satisfies a stale negation lands in `assignTiers` and
`registry.ensure` with no spec, burning a `LIVE_BUDGET` slot and a WebGL context on a panel
that owns no process. `verify:viewport` `90b` is the check, and whoever adds a sixth kind
inherits that one-line obligation.

Two entries have left this list by being built rather than by being reasoned about. **#3**
(file tree) shipped in M20 as a rail column reading a panel's cwd over `fs:list`, never as a
canvas node — so it needed no `Panel` variant at all. **#12** (Jira) and **#26** (the agent
toolbox) went the other way and each took a kind, which is the outcome this section wanted:
neither was faked as a special case bolted onto the terminal path.

**Five separate entries** (#7 subagent nodes, #8 chat box, #9 integrations, #14 tiers 2–4,
#15 annotations, #35 groups) still want one — though #7 is worth reading as a caution rather
than a queue entry, because M15 answered it **without** a kind at all: subagent nodes are
*derived*, rebuilt every launch from a watcher, never in the `panels` array, and therefore
never near `parseLayout`, `nextIdRef` or the four panel-removing surfaces. "It needs a canvas
node that is not a terminal" and "it needs a `Panel` variant" turned out to be different
claims, and the cheaper answer is available whenever the thing has no identity worth
persisting.

The reasoning below is left as written, because it still says what a kind costs:

Turning `Panel` into a discriminated union of kinds — with the terminal as one variant
and cheap DOM nodes as another that never touch the live budget — is the unlock for the
super-app direction. It is not urgent, and it should *not* be done speculatively. But it
is the thing to build deliberately the first time a second panel kind is genuinely
needed, rather than bolting a special case onto the terminal path and discovering the
union three features later.

Both of the "who pays for the union" paragraphs that stood here are spent — the union
exists, and neither #35 nor #14 is what bought it. They are worth one line of what they got
right, because the criterion transfers to whatever kind comes sixth. Each argued from the
same property: a node that **shares almost nothing with the terminal path** is a good first
variant *precisely because it cannot be faked as a special case of one*. That is what M9b's
review node turned out to have, and it is the test to apply to #35's groups (a canvas node
with no session, no PTY and no claim on `LIVE_BUDGET`) whenever they are scheduled — not
"does this force the union", which is settled, but "does this fit the partition, or is it
about to be bolted onto the terminal path".

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
