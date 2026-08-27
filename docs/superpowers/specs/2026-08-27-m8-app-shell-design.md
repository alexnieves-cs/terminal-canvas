# M8: The App Shell — Design

**Status:** approved in brainstorming, not yet implemented
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

`App.tsx`'s existing comment already says it "exists to own the outer layout,
not state". That is the shell's home, and `Canvas` stays a child that never
learns it got narrower.

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
   acts on. Shell buttons therefore blur back to the focused session's terminal
   after acting (`SessionHandle.focus()`, the same call `restoreFocus` makes),
   and no shell element swallows a bare key.
3. **The palette's outside-click exit must be raised to the shell — this is a
   defect M8a introduces if it is not.** `onMouseDownCapture` is a prop on the
   `.canvas` div, and the shell's regions are **siblings** of it. So a click on
   a shell control while the palette is open never reaches that listener: the
   overlay stays up, looking ready to take a query, while DOM focus sits on a
   button and every bare key goes to the agent — a fourth, un-audited exit,
   precisely the state "Three ways out of the palette" was written to remove,
   and `Escape` cannot even undo it because the key no longer reaches the
   palette's `onKeyDown`.

   The fix is to move that capture listener from `.canvas` to `.app`, keeping
   the `closest('.palette')` containment test and `dismissPalette()` (which
   deliberately does **not** restore focus, because the click itself is the
   focus gesture) exactly as they are. `verify:panels` 42 must still pass
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

**Ships:** `App.tsx` as a grid; `TopBar.tsx`; `SideRail.tsx` and
`Inspector.tsx` as headers with empty bodies; collapse and its persistence.

**Top bar contents**, all wired to verbs that exist:

- **New panel** — a split button. The main action spawns the default preset;
  the dropdown lists the rest and calls `spawnPreset(id)`, which invokes
  `preset:spawn-by-id`. It must route through main for the reason M5b already
  records: only main can resolve an **absent** `command` into the user's login
  shell, and a renderer-side reconstruction would spawn a hardcoded shell for
  every command-less preset.
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
- **No drag-to-reorder.** `Panel.z` is stacking and array order is deliberately
  not; reordering the rendered list would move DOM nodes, and a move is
  remove-then-insert, which momentarily detaches a live terminal's WebGL host.

**Checks.**

- New plain-node coverage for `rail-rows.ts` (the `verify:viewport` tier): the
  signature ignores rect changes and reacts to a title change; the honest chain
  resolves in the documented order.
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
the whole gesture — "one history entry per committed gesture"); Save as preset
(the existing `preset:capture` path); Close panel (`onClosePanel`); Restart.

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
- The `Terminal` cannot be reused: `term.open()` runs at most once ever. A
  restart disposes the `SessionHandle` and creates a new one — the path
  close-then-new already exercises.
- Agent state must be cleared and re-seeded. `create` sends `starting`
  directly, so the respawn produces it; the dispose site must call
  `clearAgentState(id)` so a restarted panel cannot inherit the dead one's
  `wants-you` border.
- It is **not** destructive in the palette's sense (no confirm), because the
  process it ends is the one the user is asking to replace — but a restart of a
  panel in `wants-you` discards a question the agent asked. The inspector's
  button says what it will do; the confirm question is deferred, not decided.

**Checks.**

- `verify:registry`: restart disposes and re-ensures at the same panel id, and
  the new session is not dormant.
- `verify:pty-manager`: restarting a live tmux-backed session yields a
  **different** pid — the mirror of check 12's "detach and reattach is the same
  pid", and the one assertion that separates a real restart from a reattach.
- `verify:panels`: the inspector renders the resolved command for a login-shell
  panel (not `'login shell'`, which would mean it read the spec); a reattached
  panel shows the badge; restart clears a `wants-you` state; the `pty.kill`
  caller count is still two.

## M8d — Workspaces and attention in the rail

**Gated on M7.**

**Workspaces section.** M7's named canvases as rows: name, panel count,
waiting count. Click switches, through M7's own `activateWorkspace`
transaction — the shell adds no second switching path. `+` creates. Rename and
delete route into the palette's input mode (see "The shell owns no modality"),
which is also what preserves M7's destructive confirm and its "the agent count
named in the question" rule. The counts are a second **view** over M7's
derivation, never a second derivation.

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

**The rail does not replace the edge pips.** They answer different questions —
a pip says *which direction*, a rail row says *what is in the queue and how
deep*. `agent.edgeIndicators` still governs the pips alone.

**Checks.**

- `verify:panels`: a waiting panel appears in the attention section; clicking
  the row frames it and leaves it `wants-you` (read the rendered border colour,
  as check 62 does, because this failure is purely visual); focusing it clears
  both the state and the row.
- `verify:panels`: switching workspaces from the rail lands on the same state
  the palette's switcher produces.

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
