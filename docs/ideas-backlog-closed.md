# Ideas backlog — closed entries

> Entries from [ideas-backlog.md](ideas-backlog.md) whose heading marks them DONE or declined,
> moved here verbatim so the open file is cheaper to grep. Numbers are unchanged; the open
> file keeps each heading with a pointer, so a citation like "backlog #22" still resolves there.

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

## 22. Semantic zoom — a card that changes with distance — DONE, M57

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

## 39. Export and share — a screenshot, a transcript, a receipt — DONE, M58 (narrowed: a panel's text and the canvas as PNG)

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

## 42. Camera bookmarks — named viewports, saved and jumped to — DONE, M56

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

## 45. Camera undo — a back button for the viewport — DONE, M56

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

## 62. Camera animation — tweened flights, and where they fight tiering — DONE, M56

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

## 80. `cursor-agent` as a fifth row — declined in the v6 run (M117), unmeasured

The registry (M99) makes an engine one row, one adapter and one parser over recorded
fixtures — and the premise of every engine milestone is the recording. `cursor-agent`
(2026.05.16) is installed on this machine and was NOT logged in on 2026-09-06: the headless
door refuses with "Authentication required. Please run 'agent login' first, or set
CURSOR_API_KEY". Login opens a browser, which only a person can do, so no stream exists and a
row written from the help text alone would be a guess dressed as a fact. What it takes, in
order: (1) `cursor-agent login` (or `CURSOR_API_KEY` in the login environment); (2) Act 0's
step 3 verbatim — `agent -p --output-format stream-json --trust --workspace <scratch>` with a
two-turn prompt, once with `--stream-partial-output`, into
`scripts/fixtures/agent-session/cursor/`, noting whether the stream carries a turn-end
record, a session id (`--resume [chatId]` implies one), tool-call pairs, usage and permission
asks, and whether the process exits at turn end; (3) M118's shape row for row — a `cursor`
row, `shared/cursor-transcript.ts`, `verify:agent-session cursor.1–.3`. Half a day once the
recording exists.

## 81. The canvas as an ACP HOST for files and terminals — declined by measurement (M119)

M119 made this app an ACP client (`copilot --acp`): the handshake, `session/prompt`,
`session/cancel`, `session/load`, `session/request_permission` through the one
`answerPermission`. The protocol's inversion — the AGENT asking the HOST for
`fs/read_text_file`, `fs/write_text_file` and `terminal/create` — was advertised to copilot's
agent in Act 0's probe and it NEVER asked: it ran its own tools and reported them as
`tool_call` updates with a `kind`. A host answer would be code with no consumer (the
customer-free-abstraction rule), so `initialize` declares
`clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }`
(`verify:agent-session acp.4` pins the line). What it takes, when an ACP agent that asks
arrives: flip the two `fs` lines and answer from main under the Places gate (a path outside
every place refused with M100's sentence; the write through M22's mtime rule); the
`terminal` line is the harder one — a terminal the agent owns is a panel whose lifetime the
registry does not own (the two-lifetimes rule from the other side) and needs its own design
before the flag flips. Record a stream from that agent first.
