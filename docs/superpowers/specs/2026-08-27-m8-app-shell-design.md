# M8: The App Shell — Design

**Status:** M8a, M8b and M8c implemented and landed. M8d's section amended
2026-08-28 with the decisions its own brainstorming settled; not yet
implemented.
**Predecessor:** `2026-08-27-m7-workspaces-design.md`
**Backlog entries:** #11 (a real settings surface — the visible half), #17
(attention routing, second surface), #29 (restart a panel in place), #32
(keyboard-first canvas — the inverse of it), #44 (honest chrome), #41 (live
cwd and live command)

## Goal

Give the app a **visible UI**. Through M6d every verb this application has is
a chord or a row inside a `Cmd+K` overlay that is invisible until summoned:
spawning, presets, prompts, panel switching, settings, workspaces, the
attention queue. A user who does not already know the app can open it, see an
infinite grey plane with one panel on it, and have no affordance to discover
anything at all — `docs/ideas-backlog.md` #38 says exactly this about the
empty canvas, and it is now true of the whole application, not just its first
run.

M8 adds a persistent app frame around the canvas: a top bar, a collapsible
left rail, and a collapsible right inspector. Every verb it exposes already
exists. **M8 is a view problem, not a capability problem** — with exactly one
exception, restart-in-place (#29), which is called out as its own task.

## Relationship to M7

M7 (named workspaces) is **being implemented in a separate session** and this
spec does not modify it, re-plan it, or touch its files.

- **M8a, M8b and M8c do not depend on M7** and can be built against the
  single-canvas app as it stands today.
- **M8d depends on M7's store and its `activateWorkspace` transaction.** If M7
  has not landed when M8d is scheduled, M8d waits; the rail simply ships its
  Panels and Attention sections and grows its Workspaces section later.

## Scope

In:

- **A frame** — `App.tsx` becomes a CSS grid owning a top bar, a left rail, the
  canvas, and a right inspector. Both side regions collapse.
- **A top bar** — visible spawn (default preset plus a dropdown), a zoom
  cluster, a search button that opens the palette, a settings button.
- **A panel outline** — every panel in the canvas as a row: agent state, title,
  status.
- **An inspector** — the selected panel's resolved command, cwd, pid,
  reattached flag, agent state and exit code, with rename / save-as-preset /
  close / **restart**.
- **A workspaces section and an attention queue** in the rail (M8d, gated on
  M7).

Out, and deliberately so:

- **The file tree** (backlog #3). It needs a new IPC surface and a directory
  watcher, it shares that machinery with #26 (the agent toolbox), and it is the
  most likely thing to force the panel-kind union. It becomes **M9**, with its
  own spec. Bolting it into a rail slice is precisely the "special case
  discovered three features later" outcome `ideas-backlog.md`'s structural note
  warns about.
- **A settings pane in the inspector.** The palette already indexes every
  `SettingDef` and M6b decided settings are a drill-in. The settings button in
  the top bar opens that drill-in. Rendering a second settings surface would be
  a second author of the same map — the failure "One map, and a typed view over
  it" exists to prevent.
- **Any new modal.** See "The shell owns no modality" below.
- **Removing or de-emphasising any keyboard path.** Every chord that works
  today works identically after M8. The shell is additive.
- **Moving panels between workspaces**, deferred by M7 and still deferred here.
- **Multi-select** (backlog #52). The rail lists panels; it does not select
  sets of them.

## Architecture

```
.app                        CSS grid: top bar spans; [rail | canvas | inspector]
├── <TopBar/>               spawn · zoom · search · settings
├── <SideRail/>             collapsible; sections: Workspaces · Panels · Attention
├── <Canvas/>               internals unchanged; it simply receives less width
└── <Inspector/>            collapsible; the selected panel
```

**The frame is rendered by `Canvas.tsx`, not by `App.tsx`.** `App.tsx`'s
comment says it "exists to own the outer layout, not state", and the diagram
above reads as though the shell belongs there — but every verb the shell needs
(`paletteActions`, `openPalette`, the camera verbs, `presetRows`) is state that
lives inside `Canvas`. An `App`-owned frame would mean lifting all of it up or
threading it back through a callback, buying a nicer diagram at the price of
making `App` a state owner. So `Canvas` returns the `.shell` grid with the
existing `.canvas` host as its middle cell; `.app` keeps its `padding: 38px 0 0`
for the traffic lights. `hostRef` stays on `.canvas`, which is what keeps
`useViewport`, `EdgeIndicators` and every `getBoundingClientRect()` measuring
the right box. The rules below are unaffected: the shell's components are still
presentational and still reach the app only through `CanvasActions`.

### The shell is a second view over one verb surface

`palette/commands.ts` already exports `PaletteActions` — every verb the app
has, as plain callbacks with no React and no DOM in them, constructed once in
`Canvas.tsx`'s `paletteActions` memo. **The shell consumes that same object.**
It is renamed `CanvasActions` (a type alias keeps `PaletteActions` valid so no
palette code churns), and `Canvas.tsx` passes the one memo to both views.

This is the load-bearing decision of the milestone. A shell that reached into
`Canvas` for its own copies of these callbacks would be a second
implementation of every verb, and the two would agree the day they were
written and drift the first time one was wrong — the same shape of bug "One
map, and a typed view over it" prevents for settings, and the reason
`preset:spawn-by-id` and `canvas:request-reset` exist as invokes at all.

Three consequences worth stating:

- **A verb the shell needs that the palette does not have is added to
  `CanvasActions`, not to the shell.** `restartPanel` is the only such verb in
  M8, and it gets a palette row for free.
- **`CanvasActions` members stay required, never optional.** `commands.ts`
  already spells out why: an optional member lets a half-finished wiring
  satisfy the interface while forgetting a callback, and `tsc` says nothing.
- **`verify:palette`'s tier still covers the verbs.** What the shell adds is
  rendering, which is `verify:panels`' tier.

### Three rules the shell must obey

Each fails silently rather than loudly, which is why they are written here
rather than left to review.

1. **The shell never owns canvas state.** Rail and inspector receive derived
   props and call `CanvasActions`. In particular a rail row calls
   `goToPanel(id)` — frame, select, raise — and **never** `onSelectPanel`,
   which clears the dormant id and calls `registry.wake`. A list whose rows
   spawn agents as a side effect of being clicked is the exact failure M4b's
   dormancy rule and M5b's panel switcher both exist to prevent, and on a
   restored twelve-panel canvas it is twelve CLIs launched by browsing a list.
2. **The shell is not a keyboard owner.** All four of `usePalette`'s focus
   rules hold unchanged. Clicking a shell control must **not** clear
   `focusedId`: `assignTiers` pins the focused panel live, and `focusedId` is
   also the `Cmd+C`/`Cmd+V` target and what every `capturedId`-gated palette row
   acts on. Shell controls therefore **never take DOM focus in the first
   place**: each one `preventDefault()`s its own `mousedown` (`shell-control.ts`
   in the shipped M8a), so focus never leaves xterm's hidden textarea and there
   is nothing to restore afterwards. No shell element swallows a bare key.

   *Amended after M8a shipped.* This rule originally mandated the opposite
   shape — let focus move, then blur back with `SessionHandle.focus()`, the
   same call `restoreFocus` makes. That was rejected during implementation and
   the rule now commands what shipped, because blur-back leaves a window
   between the two in which a keystroke goes nowhere, and it fails exactly as
   silently as an unrestored palette close: the button works, and the next
   thing the user types vanishes. Never taking focus has no such window. New
   controls in M8b–M8d mount `shellControl()`; they do not blur back.
3. **The palette's outside-click exit must be raised to the shell — this is a
   defect M8a introduces if it is not.** `onMouseDownCapture` is a prop on the
   `.canvas` div, and the shell's regions are **siblings** of it. So a click on
   a shell control while the palette is open never reaches that listener: the
   overlay stays up, looking ready to take a query, while DOM focus sits on a
   button and every bare key goes to the agent — a fourth, un-audited exit,
   precisely the state "Three ways out of the palette" was written to remove,
   and `Escape` cannot even undo it because the key no longer reaches the
   palette's `onKeyDown`.

   The fix is to move that capture listener from `.canvas` up to the shell
   root, keeping
   the `closest('.palette')` containment test and `dismissPalette()` (which
   deliberately does **not** restore focus, because the click itself is the
   focus gesture) exactly as they are. *Amended after M8a shipped:* it went to
   `.shell` — the grid root `Canvas.tsx` returns — not to `.app`, because
   `.app` is not where the frame lives (see "The frame is rendered by
   `Canvas.tsx`, not by `App.tsx`" above). Anything M8b–M8d adds must be a
   descendant of `.shell` to be covered by it. `verify:panels` 42 must still pass
   unchanged — it asserts both halves of the canvas case — and M8a adds the
   shell case beside it. The shell's own regions additionally
   `stopPropagation` on mousedown, and any popover rendered inside `.canvas`
   needs the same `stopPropagation` plus `closest()` treatment `Palette.tsx`
   documents; prefer rendering popovers inside the shell's own regions so that
   question does not arise.

### The shell owns no modality

Rename and delete, from anywhere in the shell, **route into the palette's
existing `InputMode`** — the shell calls `beginRenamePreset` / `deletePreset` /
`beginRenamePanel` and the palette opens in text or confirm mode.

M5a deferred preset editing entirely because "building a preset-manager dialog
now would be the first modal in this app, and it would collide with xterm's
keyboard focus", and M6p's confirm gate resolved that by reusing input mode so
a confirm inherits all four focus rules. A shell-native dialog would reopen
that question and would be the app's first un-audited focus trap: an element
that takes DOM focus away from xterm with no rule about giving it back. The
one existing exception stays main's — `canvas:request-reset`, whose
confirmation dialog main owns.

### Geometry: the shell insets the canvas

The rail and inspector take real layout width; the canvas host shrinks.

This is safe by construction and the spec records why, because it is the fact
the whole geometry decision rests on: **nothing in the canvas measures the
window.** `useViewport`, `Canvas.tsx` and `EdgeIndicators` all read
`getBoundingClientRect()` on the `.canvas` host at event time, and the pip
layer carries its own `ResizeObserver` precisely so `Canvas` need not hold a
size. There is no `window.innerWidth` to go stale. A future change that
introduces one breaks the shell silently — pips would aim at the window's edge
while the canvas ended 280px earlier.

Two second-order effects are real and must be handled:

- **A narrower canvas host is a smaller cull region.** `assignTiers` will
  legitimately demote panels when the rail opens. That is correct, not a bug.
- **An animated width transition fires `ResizeObserver` every frame**, which
  would re-run tiering at 60Hz mid-animation — the cascade `TerminalPanel`'s
  memo and `registry.version()` both exist to block. The collapse is therefore
  a **discrete** width change from tiering's point of view: the tiering effect
  reads the committed size, and any visual transition must not be sampled per
  frame. The existing 250ms demote hold absorbs the transient, provided nothing
  clears it on resize — the same "never re-arm the hold in an effect cleanup"
  rule `Canvas.tsx` already documents.

## M8a — The frame

**Ships:** the `.shell` grid, **returned by `Canvas.tsx`** — `App.tsx` is
unchanged and stays a pass-through; `TopBar.tsx`; `SideRail.tsx` and
`Inspector.tsx` as headers with empty bodies; collapse and its persistence.
(*Amended after M8a shipped.* This line said "`App.tsx` as a grid", which
contradicts the Architecture section's own decision above and the code as
built. An earlier amendment corrected only that paragraph.)

**Top bar contents**, all wired to verbs that exist:

- **New panel** — a split button. The main action spawns the default preset;
  the dropdown lists the rest and calls `spawnPreset(id)`, which invokes
  `preset:spawn-by-id`. It must route through main for the reason M5b already
  records: only main can resolve an **absent** `command` into the user's login
  shell, and a renderer-side reconstruction would spawn a hardcoded shell for
  every command-less preset.

  **Scope actually shipped in M8a: a PLAIN button, no dropdown.** It spawns the
  default preset through `preset:spawn-by-id` exactly as specified; the
  non-default presets are not listed anywhere on the bar, and they remain
  reachable only through the palette. This was dropped silently during
  implementation rather than decided, and it is recorded here so a later reader
  does not take the paragraph above as a description of the code.
  **The dropdown moves to M8b**, which is already opening the rail's own
  per-panel surface and is where a menu-shaped control belongs; it needs no new
  verb (`spawnPreset(id)` exists and has a palette row), and it must obey rule
  2 — a popover is another element that can take DOM focus. Do not build it as
  part of a fix to M8a.
- **Zoom cluster** — `−` / a percentage readout / `+` / *Fit*. Wired to
  `zoomToFit()` and to the existing narrow camera verbs. The `setViewport`
  setter **stays private**; a shell control that needed the setter would make
  the shell a camera owner and take the coordinate math out of
  `verify:viewport`'s reach. If `−`/`+` need a verb that does not exist yet, it
  is added to `useViewport` as a named verb (`zoomBy(factor)`), not by exposing
  the setter.
- **Search** — calls `openPalette()`. Labelled with its chord, which is how the
  shell teaches the keyboard rather than replacing it.
- **Settings** — opens the palette in its `settings` scope.

**Collapse.** Each side collapses to a narrow strip with a click target. State
lives in the `preferences` map as two new `SettingDef`s — `shell.railOpen` and
`shell.inspectorOpen`, both booleans, default true — so persistence, the
palette rows and the schema validation all come for free and no second store
is invented. `Cmd+\` toggles the rail and `Cmd+Shift+\` the inspector; both are
**excluded** from `REPEATABLE_KEYS`, because a held toggle flickering at the OS
repeat rate is the `Cmd+K` auto-repeat defect exactly.

**Checks.**

- `verify:layout`: the two new defs are declared with label/description/
  keywords and round-trip through a write and a reopen.
- `verify:panels`: collapsing the rail changes the canvas host's measured
  width, **and** a panel near the canvas edge still has an `.xterm` under it
  afterwards — the same "is it still promoted" proof check 51 makes for the
  spawn cascade, and the only way to show a narrower cull region did not
  silently demote the panel the user was looking at.
- `verify:panels`: the toggle reaches main's store, read back through
  `settings:list` (the shape check 53 already uses).
- `verify:panels`: `Cmd+\` held with `repeat: true` toggles once, not fifteen
  times.
- `verify:panels`: with the palette open, a mousedown on a shell control
  dismisses it — the raised capture listener — while check 42's existing
  canvas-case assertions stay green.
- *Added by M8a's final review, and required of M8b–M8d too:* both settings are
  ordinary booleans, so main auto-generates a **palette row** for each of them
  that nobody wrote. Running that row must move the frame, not only the store
  (`verify:panels` 78) — the palette→screen direction, which the store-facing
  checks above all pass against a renderer that never re-reads. And the
  inspector chord must be exercised as macOS delivers it,
  `{ key: '|', code: 'Backslash', shiftKey: true }` (`verify:panels` 79): a
  chord check that sends a matching `key` AND `code` cannot fail against a
  `code`→`key` revert, and the Shift branch was otherwise unexercised.

## M8b — The panel outline

**Ships:** the rail's Panels section. One row per panel: an agent-state dot,
the title, and a status tail (`pid 48213`, `dormant`, `exited 1`).

The title uses the same honest chain the header does —
`title ?? status.command ?? spec.command ?? 'login shell'`. The resolved
command is **never copied back into `PanelSpec`**; the rail reads
`PanelStatus` exactly as `TerminalPanel` does.

**The 60Hz trap.** `panels` is a fresh array on every `setPanelRect`, i.e.
every frame of a drag. The palette hit this: its `panelRows` re-seated the
selection at 60Hz until it was keyed on `palette.open` and read out of
`panelsRef`. The rail cannot use that escape hatch because it is always open,
so the fix is structural:

- Row data is derived in a pure module (`renderer/shell/rail-rows.ts`) and
  memoised on a **signature** of only the fields a row renders (`id`, `title`),
  never on `panels` identity. A drag moves rects; the signature does not move;
  no row re-renders.
- Each row is a `memo` component that subscribes to `useAgentState(id)`
  **individually**. A bell on `n3` re-renders one row. Subscribing the list to
  every panel's state would be the fan-out `agent-state-store.ts` already
  refuses for exactly this reason.

**Interactions.**

- **Click → `goToPanel(id)`.** Frames, selects, raises. Never wakes. (Rule 1.)
- **A dormant row carries an explicit start control** that does wake, via the
  path `onSelectPanel` already takes. Waking becomes a deliberate act with a
  visible affordance rather than a side effect of navigation.
- **Close → the existing `onClosePanel`.** `registry.dispose` gains no new call
  pattern and `pty.kill`'s two-caller count is untouched. (`CLAUDE.md` records
  that this count has already gone stale once; re-derive it after M8c, which
  does change it.)
- **The two new verbs join the actions object and emit no palette rows.**
  `closePanel(id)` and `startPanel(id)` are required members of
  `PaletteActions`, per rule 1 — the shell reaches the app only through that
  object, and a rail that closed over `onClosePanel` directly would be a second
  implementation of a verb the palette already has an authority for. They are
  deliberately NOT given `Command` rows, which is the one place M8b declines
  something the shell/palette symmetry would otherwise hand it for free: both
  verbs already have a gesture (the panel's own `×`, and clicking the panel to
  wake it), and M6p sized the resting palette list to roughly eight rows on
  purpose. `restartPanel` in M8c is the verb that DOES earn a row, because it
  has no other gesture at all.
- **No drag-to-reorder.** `Panel.z` is stacking and array order is deliberately
  not; reordering the rendered list would move DOM nodes, and a move is
  remove-then-insert, which momentarily detaches a live terminal's WebGL host.

**Checks.**

- New plain-node coverage for `rail-rows.ts` in a **new `verify:rail` suite**,
  not appended to an existing one: the signature ignores rect changes and
  reacts to a title change and to a status change; the honest chain resolves in
  the documented order. It gets its own script, esbuild entry and `npm run
  verify` slot rather than joining `verify:viewport` — that suite is already a
  six-module grab-bag named for canvas math, and `verify:rail` is where M8c's
  inspector rows and M8d's workspace and attention rows land too, so the cost
  is paid once for three sub-milestones.
- `verify:panels`: a row exists per panel; a rename typed into the palette
  changes the row (one title source, not two); clicking a dormant row frames it
  and leaves it dormant, confirmed through `__m4aSessions` (no spawn); a real
  bell changes that panel's row and no other.

## M8c — The inspector

**Ships:** the right pane, and restart-in-place.

**Read half.** Editable title; agent state with its label; the resolved
`command` and `cwd` from `PanelStatus.running`; `pid`; `exited <code>` when
exited; and a **`reattached` badge**.

That badge closes a criterion this repo records as explicitly unmet: M6a
carried `PanelStatus.running.reattached` and `.cwd` as live fields with **zero
readers**, and `CLAUDE.md` states the spec's "a reattached panel visibly says
so" success criterion "is deliberately NOT met by this milestone". M8c is the
milestone that meets it. The inspector shows each link of the header's chain
separately rather than the collapsed answer, which is what makes "why does this
say login shell" an answerable question.

Note what the inspector must **not** claim: the detector's `exited` state is
not an exit code, and `PanelStatus.exited` stays the sole authority on
success or failure. The inspector renders the number from `PanelStatus` and the
colour from the detector, and never substitutes one for the other.

**Empty state.** Nothing selected → a summary of the canvas: panel count, how
many live, how many waiting. This is also where M8d's cross-workspace counts
land naturally.

**Act half.** Rename (through `beginRenamePanel`, so one `Cmd+Z` still undoes
the whole gesture — "one history entry per committed gesture"); Save as preset;
Close panel (`onClosePanel`); Restart.

*Amended before M8c was planned.* This line originally said Save as preset went
through "the existing `preset:capture` path". **There is no such path reachable
from the renderer.** `preset:capture` is a main→renderer *request* — main asks,
the renderer answers, exactly as `canvas:counts` does — and the answer it gives
is read off `focusedIdRef.current` (`Canvas.tsx`'s `onCapture` provider). The
inspector, however, describes the **selected** panel, and this app keeps
`selectedId` and `focusedId` deliberately distinct: a rail row selects without
focusing, and a background click clears `focusedId` alone. Wiring the
inspector's button to the existing path would therefore save a *different panel
than the one the inspector is describing* whenever the two diverge — which is
most of the time the button is worth pressing — and it would fail silently,
because the preset it writes is perfectly well-formed and merely wrong.

M8c adds a renderer→main invoke instead, `preset:save-panel`, carrying the
selected panel's `CapturedPanel`. Main stays the sole author of preset identity:
`mintPresetId` and `autoName` do not move, and the mint-add-`rebuildMenu` tail of
`savePresetFromFocusedPanel` is **extracted and shared** with the new handler
rather than copied. A second copy would be a second implementation of preset
naming, which is the drift "The shell is a second view over one verb surface"
exists to prevent — and it would show up as two presets named differently for
the same panel depending on which surface saved it. This is the milestone's one
new IPC channel; `verify:ipc`'s documented channel count moves 25 → 26.

**Restart in place (backlog #29).** This is the one new capability in M8, and
it is a task with its own checks, not a button:

- It routes through `registry.dispose(id)` and a fresh `ensure`, **never** a
  direct `pty.kill`. `dispose` and `disposeAll` remain the only two callers
  inside `session-registry.ts`; what changes is that `dispose(id)` gains a
  fourth call site in `Canvas.tsx`. Re-derive and update the documented count
  (`grep -n "registry.dispose" src/renderer/canvas/Canvas.tsx`) as part of this
  task — that number has gone stale once already.
- Under tmux the session must be **destroyed** before the respawn, or
  `new-session -A` reattaches to the very session the restart was meant to
  replace. `PtyManager.kill` already reaches `backend.destroy(panelId)`, which
  is the behaviour to rely on.

  *Amended before M8c was planned, after reading the path end to end.* That
  ordering holds today **for a reason nothing states and nothing checks**:
  `ipcMain.handle(PTY_KILL)` is a synchronous handler, `PtyManager.kill` is
  synchronous, and the tmux backend's `destroy` bottoms out in `execFileSync`
  — so main finishes killing before it dequeues the `pty:create` the restart
  sends next. Every link in that chain is incidental. Make `destroy` async, or
  await anything inside that handler, and the create overtakes the kill:
  `new-session -A` finds the doomed session still alive, attaches to it, and
  the restart silently becomes a no-op that returns the user to the same agent
  they asked to replace. Nothing throws, and the pid check named below is the
  only thing that would notice.

  M8c therefore does not rely on it. `Registry.dispose(id)` **returns** the
  `pty.kill` promise instead of `void`-ing it, and `restartPanel` awaits it
  before re-ensuring. This adds no `pty.kill` call site — it is the same single
  call, with its result no longer discarded — and it makes the ordering a
  property of the restart code rather than of main's current synchrony. The
  four existing `dispose` call sites ignore the returned promise, as they
  should: none of them respawns anything.
- The `Terminal` cannot be reused: `term.open()` runs at most once ever. A
  restart disposes the `SessionHandle` and creates a new one — the path
  close-then-new already exercises.

  *Added before M8c was planned:* the re-attach this implies needs **no new
  code**, and the reason is worth recording because it makes an existing line
  load-bearing for a second, undocumented purpose. `TerminalPanel`'s slot
  effect lists `session.handle.host` in its dependency array. A fresh `ensure`
  mints a new handle and therefore a new host **element**, so React tears the
  old host out of the slot and runs the effect again — which calls
  `onSlotMount`, i.e. `attachSlot`, i.e. `spawn`. Restart rides the path
  promotion already takes. Removing `session.handle.host` from that dep array
  (it reads like a redundant sibling of `session.id`, which never changes here)
  would leave a restarted panel showing a dead terminal with no process and no
  error anywhere.
- Agent state must be cleared and re-seeded. `create` sends `starting`
  directly, so the respawn produces it; the dispose site must call
  `clearAgentState(id)` so a restarted panel cannot inherit the dead one's
  `wants-you` border.
- It is **not** destructive in the palette's sense (no confirm), because the
  process it ends is the one the user is asking to replace — but a restart of a
  panel in `wants-you` discards a question the agent asked. The inspector's
  button says what it will do.

  *Decided before M8c was planned:* **no confirm, in any state**, including
  `wants-you`. The alternative considered was a confirm that appears only for a
  waiting panel, reusing the palette's `InputMode` so it would inherit all four
  focus rules at no architectural cost. It was rejected on the shape of the
  gate rather than its cost: a confirm the user meets on one restart in twenty
  is a gate they have no model for, and an unexpected question is answered
  reflexively rather than read — which buys none of the protection it charges
  for. The button's own label carries the warning instead.

- **Restart is offered for a SPAWNED panel only — running or exited — and is
  disabled, never hidden, otherwise.** Exited is the most natural target the
  verb has, not an edge case: "run that again" is most of why anyone wants it.
  A dormant or never-started panel is the opposite case, and it already has its
  own verb with its own visible affordance (M8b's start control, and the card
  that says "click to start"); collapsing the two would undo the separation
  M8b's rule 1 draws between navigating and waking. Disabled with a reason
  rather than absent, per the rule `verify:palette` 31 states in its own
  comment: a row that disappears is indistinguishable from a feature that is
  missing. The palette's `Restart panel…` row carries the same gate, which is
  what puts a `restartable` flag on `PanelRow` — without it the row would be
  runnable on a dormant captured panel and would silently do nothing.

**Checks.**

- `verify:rail`: the inspector's own pure module joins M8b's suite through the
  entry that already predicts it. The fields resolve each link of the honest
  chain **separately** rather than collapsing it (the read half's whole point);
  the summary counts panels, live and waiting; and the signature ignores a rect
  change while reacting to a title, status and dormancy change — M8b's 60Hz
  trap reaches the inspector unchanged, since the selected panel comes out of
  the same `panels` array that is fresh on every drag frame.
- `verify:registry`: restart disposes and re-ensures at the same panel id, and
  the new session is not dormant.
- `verify:pty-manager`: restarting a live tmux-backed session yields a
  **different** pid — the mirror of check 12's "detach and reattach is the same
  pid", and the one assertion that separates a real restart from a reattach.
  This is also the only check that would notice the ordering hazard amended
  into the restart bullets above.
- `verify:layout`: main's extracted mint-add path, exercised once, so the menu
  and the new invoke are provably one implementation rather than two that agree
  today.
- `verify:ipc`: 26 channels.
- `verify:panels`: the inspector renders the resolved command for a login-shell
  panel (not `'login shell'`, which would mean it read the spec); a reattached
  panel shows the badge; restart clears a `wants-you` state; save-as-preset
  saves the **selected** panel rather than the focused one, driven with the two
  ids deliberately different (a check taken with them equal passes against the
  defect this decision exists to remove); and the `pty.kill` caller count is
  still two while `registry.dispose`'s call-site count in `Canvas.tsx` is
  re-derived, not trusted.

## M8d — Workspaces and attention in the rail

**Gated on M7.** M7 landed on 2026-08-27, so the gate is open.

*Amended 2026-08-28.* The M8d brainstorming session settled three questions
this section had left to implementation — what a workspace row carries, what
an empty section renders, and which panels the attention queue is allowed to
name — plus the module shape that keeps the waiting count a single
derivation. The four settled decisions are marked *Settled:* below and the
paragraphs after them spell out what each costs; nothing already written here
was changed or removed.

**Workspaces section.** M7's named canvases as rows: name, panel count,
waiting count. Click switches, through M7's own `activateWorkspace`
transaction — the shell adds no second switching path. `+` creates. Rename and
delete route into the palette's input mode (see "The shell owns no modality"),
which is also what preserves M7's destructive confirm and its "the agent count
named in the question" rule. The counts are a second **view** over M7's
derivation, never a second derivation.

*Settled: a workspace row carries switch, rename and delete.* Three sibling
controls, the shape `RailPanelRow` already uses — the row body switches, and
a `✎` and a `×` sit beside it — plus the `+` on the section header. The
alternative considered was leaving rename and delete in the palette's
`Manage workspaces…` drill-in and putting only `×` on the row, which is fewer
controls and an arbitrary split: rename is the *safer* of the two verbs, so a
rail that shipped delete and withheld rename would make the harmless one the
one you need a shortcut for. Both route into input mode exactly as the
palette's own rows do, so the destructive confirm, the count named in the
question, and `Canvas.tsx`'s switch-before-remove ordering are all *reached*
rather than reimplemented — the row is a second door onto one action, which
is the whole of "The shell is a second view over one verb surface". Every
control mounts `shellControl()`; none takes DOM focus.

**Attention section.** `useAttentionIds()` rendered as a queue, in order.

- Clicking a row does what `Cmd+J` does — `centreOn` plus `selectAndRaise` —
  and **does not acknowledge**. Focus remains the renderer's single
  acknowledgement trigger and main remains the sole author of the state; a
  shell row that cleared it locally would make the renderer a second author of
  a fact main owns.
- The landed-on panel therefore stays amber, which is what
  `.panel--selected.panel--agent-wants-you` is for.
- Rows must filter phantoms the same way `reachableQueue` does: an id whose
  panel is gone but whose agent state survived the closure must not render a
  row that navigates nowhere.

*Settled: the attention section names only the ACTIVE workspace's waiting
panels.* A row's entire job is to navigate, and `centreOn` can only frame a
rect on this canvas — a row for a panel in a hidden workspace would either go
nowhere or smuggle in a second switching path, and the section rejects both.
A waiting panel in a hidden workspace surfaces as the **waiting count on its
workspace row** instead, which is the count M7 already derives and
`verify:panels` 70b already proves survives a hidden canvas. The two sections
therefore divide one question between them — *who is waiting here* and *where
else is anyone waiting* — and that division is deliberate rather than a
limitation nobody noticed. It is recorded because the obvious "fix" (list
every workspace's waiting panels in one flat queue) breaks the click.

*Settled: all three section headers are always rendered.* Attention shows a
quiet "nothing waiting" line at rest rather than vanishing, and Workspaces
renders its header on a fresh install where there is exactly one row. This is
the rule `hiddenAtRest` already states for the palette read the other way
round: *a row that disappears is indistinguishable from a feature that is
missing*, and the palette gets away with hiding only because typing a query
brings the row back. A rail section has no query to type into, so hiding it at
rest is hiding it permanently from the user who has never seen it fire. It
also keeps the rail's own height stable, so the Panels list does not move
under the pointer whenever a bell rings.

*Settled: one derivation for the waiting count, in a new pure module.*
`palette/commands.ts` computes a workspace's waiting count inline today
(`w.panelIds.filter((id) => ctx.attentionIds.includes(id)).length`). The rail
must not write that expression a second time — two derivations agree the day
they are written and drift the first time one is wrong, and the drift here is
a count on screen that no log explains. It moves into
`renderer/shell/rail-sections.ts` as `waitingCount(panelIds, attentionIds)`,
which `commands.ts` then calls; this is `isRunning`'s trade from M8c applied
to a second derived number. The module joins `rail-rows.ts` and
`inspector-fields.ts` in the plain-node `verify:rail` tier and carries the
rest of the section's pure half: `buildWorkspaceRows`, `buildAttentionRows`,
and a signature for each, `JSON.stringify` over the rows for `railSignature`'s
own reason — a workspace **name** is user text, and a hand-rolled separator is
a field boundary a name is free to forge. It is a new file rather than an
append to `rail-rows.ts`, whose stated subject is the Panels section.

`buildAttentionRows` takes the **already-built `RailRow[]`** rather than the
panel list, and that is the load-bearing part of its signature: filtering the
queue down to ids that have a panel row *is* `reachableQueue`'s phantom
filter, and reading the label off that same row is what stops the two sections
rendering two different names for one panel. One lookup, both guarantees.
Queue order is preserved — it is entry order, longest-waiting first, which is
what makes the section a queue rather than a set.

**Two frozen arrays, not two fresh ones.** `Canvas.tsx` freezes both new row
arrays on their signatures beside `railRows`, for the reason that file already
records: the rail is rendered unconditionally and `panels` is a fresh array on
every `setPanelRect`, so an unfrozen array defeats `SideRail`'s `memo`
outright. The symptom is invisible on a four-panel canvas, which is the same
risk the M8b bullet under "Risks" names, arriving through a second door.

**M8d adds no verb and no IPC channel.** Every callback it needs is already on
`CanvasActions` — `switchWorkspace`, `beginCreateWorkspace`,
`beginRenameWorkspace`, `deleteWorkspace`, `goToPanel` — so `verify:ipc` stays
at 26 channels. This is worth stating because a cross-workspace waiting count
reads like a main-owned query, and it is not: `workspace:list` already returns
`panelIds` and the renderer already holds the attention set, exactly as
`WORKSPACE_LIST`'s own doc comment argues.

**The rail does not replace the edge pips.** They answer different questions —
a pip says *which direction*, a rail row says *what is in the queue and how
deep*. `agent.edgeIndicators` still governs the pips alone.

**Checks.**

- `verify:rail`: `waitingCount` including the phantom case; `buildWorkspaceRows`'
  counts and its active flag; `buildAttentionRows` dropping a phantom while
  preserving queue order, and its label agreeing with the Panels row for the
  same id; and both signatures stable under a rect change while moving on a
  name, a count and a queue change.
- `verify:panels`: a waiting panel appears in the attention section; clicking
  the row frames it and leaves it `wants-you` (read the rendered border colour,
  as check 62 does, because this failure is purely visual); focusing it clears
  both the state and the row.
- `verify:panels`: switching workspaces from the rail lands on the same state
  the palette's switcher produces — the same pid, which is the only observable
  that separates a demote from a dispose-and-respawn (check 64).
- `verify:panels`: a hidden workspace holding a waiting panel shows a non-zero
  count on its **rail** row — 70b's fixture reached from the new surface.
- `verify:palette`: 64 stays green after `commands.ts` switches to the shared
  helper. It pins that `waiting` is a typed field the view composes into a
  title, never spliced into the haystack `fuzzyMatch` scans.

## Success criteria

1. A user who has never read a keyboard shortcut can launch the app, spawn a
   panel, switch workspaces, find a waiting agent, and change a setting — using
   only the mouse.
2. Every chord that worked before M8 works identically after it, and the shell
   labels the chord wherever it duplicates one.
3. Collapsing both sides returns the canvas to full-bleed, and no panel that
   was live before the collapse is demoted by it.
4. A reattached panel visibly says so — M6a's outstanding criterion.
5. `npm run verify` is green, including the new checks named above.

## Risks

- **The keyboard-ownership rule is the one most likely to be violated
  silently.** A shell button that leaves DOM focus on itself does not throw;
  it just means the next keystroke never reaches the agent, and the user reads
  that as the app being broken in a way no log explains. Every shell control
  needs the blur-back, and the check for it belongs in M8a, before there are
  many controls.
- **The rail's re-render cost is invisible until there are many panels.** The
  signature memo must be built in M8b, not retrofitted — a rail that
  re-renders on drag frames is exactly the cascade the memo architecture
  exists to prevent, and it will not be noticed on a four-panel canvas.
- **Restart is the only capability here**, and it touches the two most
  expensive invariants in the app (the `pty.kill` caller count and the tmux
  session identity). It is last in M8c for that reason and can slip to its own
  milestone without blocking the inspector.
