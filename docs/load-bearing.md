# Load-bearing details

> Split out of `CLAUDE.md` so it is not resident in every session's context.
> Nothing here changed; `CLAUDE.md` keeps the pointer and the reading
> instructions. Cross-references elsewhere in the repo that say "see
> CLAUDE.md" about a specific invariant mean this file — every entry's bold
> first sentence is unchanged, so `grep` still finds them.

  GroupLayer.tsx        the frame, label and collapse control, inside .world beneath the
                        panels — LinkLayer's position, and deaf to the pointer for the
                        same reason everywhere but its own header controls

src/renderer/session/
  panel-session.ts      the PanelSession/SessionHandle/SessionFactory interfaces — what the
                        registry needs from a terminal, with nothing xterm-specific in it
  session-registry.ts   the registry itself (see above)
  useRegistry.ts        useSyncExternalStore glue so React re-renders on registry.version()
  file-store.ts         another module-level store, subscribed per panel id like agent state
                        and live sessions — main's answer to "what does this file say now",
                        never a second author of it

src/renderer/file/
  file-node-model.ts    pure view-model construction: a FileResult in, a heading/directory/
                        numbered lines/note out. Bundled into the plain-node verify:rail
                        target alongside inspector-fields.ts and rail-sections.ts, the same
                        precedent review-node-model.ts already set for a sessionless kind.
  FileNode.tsx          the component: an EDITABLE (M22), live-watched file on the canvas
                        — no PanelSession, no xterm, no process. Owns the draft, the
                        compare-and-swap token, and both halves of the truncation gate
```

`@shared/*` and `@renderer/*` path aliases are declared in **both** `electron.vite.config.ts`
and the tsconfigs — adding one means editing both.

## Load-bearing details

Each of these exists because the naive version fails *silently*. Don't undo them.

> **How to read this section.** An entry is a paragraph whose first sentence is
> **bold** and normally names its own files in backticks; sub-points inside one
> entry are bold too. Entries are in rough milestone order, not subsystem order.
>
> **So search it, don't scroll it, and search for the FILE rather than the
> symptom.** Nearly every entry names its own module, so `grep -n 'pty-manager'`
> or `grep -n 'session-registry'` over this file is the reliable way in; the
> subsystem keyword clusters worth knowing are `pty-manager`/`tmux`/`shell-env`,
> `Canvas.tsx`/`viewport`/`lod`, `panels.ts`/panel kinds, `palette`,
> `layout-store`/`layout-schema`, `review-`/`git-`, `rail-`/`inspector-`,
> `credential`, `file-`, `toolbox`, `usage`/`pricing`, `subagent`, and
> `-store.ts`. Searching the SYMPTOM ("panel is blank") mostly fails, because
> the entries are written from the cause. Where one entry restates a rule
> another already states in full, it says so and cross-references rather than
> re-deriving the "why" — search the cross-referenced name if you land on the
> short version first.

**Login-shell PATH (`src/main/shell-env.ts`).** macOS GUI apps are launched by launchd, so
they inherit a bare PATH and no dotfile exports — `claude`/`codex` work in Terminal but are
"command not found" in the app. We probe `$SHELL -ilc env` once at startup (`-i` is what
makes zsh read `.zshrc`) and use that env for every PTY. A non-zero exit from the probe is
normal; success is judged by whether a `PATH` came back. The fallback logs loudly on purpose.
`tmux` (`tmux-probe.ts`) and `git` (`main/index.ts`'s `gitPath`) are resolved by absolute path
from this same login env, for the identical reason and after it: spawning either by bare name
against launchd's bare PATH silently fails or resolves the wrong binary, and both are logged
loudly, once, when unresolved — a git-dependent feature (the Changes section) used to render as
the ordinary, silent `not-a-repo` case rather than the actual `git-missing` arm when this
resolution was missing, which is worse than an error because it looks like most panels.

**The renderer has no `process.env` (`shared/types.ts`, `main/pty-manager.ts`,
`renderer/panels/panels.ts`).** electron-vite compiles `process.env` in the renderer bundle
down to a literal `{}`, so `process.env.SHELL ?? '/bin/zsh'` there is not a lookup with a
fallback — the fallback is the *only* branch that ever runs, and a bash or fish user silently
gets zsh while the code reads as though it asked. `PanelSpec.command` is therefore **optional**:
absent means "the user's login shell", and main resolves it from the env it already probed
(`resolveCommand`, same fallback chain as `shell-env.ts`). `panels.ts` omits it; anything in
the renderer that displays `spec.command` needs a label for the absent case, because only main
knows the answer. Never reintroduce a `process.env` read on the renderer side.

**Output batching (`pty-manager.ts`, `FLUSH_INTERVAL_MS = 16`).** One IPC message per PTY
read floods the renderer's event loop and locks the UI — an agent TUI repainting emits
thousands of reads/sec. Measured: 33,198 reads → 105 messages. The pending buffer is flushed
*before* `pty:exit` is announced, or the last lines (usually the error explaining the exit)
are dropped.

**Renderers die; sessions do not (`window-lifecycle.ts`).** Cmd+R and Cmd+W destroy the page
without running React cleanup, so the renderer never sends `pty:kill`. Something main-side
still has to act, or the abandoned handle survives and the next `pty:create` throws "already
has a live PTY" — a dead panel with no recovery short of quitting. Since M4c that action is
`detachAll()`, not `killAll()`: the local handle (a tmux *client*) dies and the tmux
*session* keeps running the agent. `pty:list` is the channel the fresh renderer reconciles
against — it asks the backend first, so it sees sessions this run has never spawned and
restores those panels non-dormant. Without tmux the app degrades to the old behaviour and the
processes really do die; see "One operation became three" below.

**Cmd+C / Cmd+V (`src/main/menu.ts`).** The stock `'copy'`/`'paste'` menu roles drive
`document.execCommand`, but xterm's selection under the WebGL renderer is not a DOM
selection — the role copies nothing or the wrong thing. We keep the accelerators but forward
to the renderer, which asks xterm directly. **Ctrl+C is deliberately untouched** and flows to
the PTY as SIGINT. This is **one subscription in `Canvas.tsx`**, not a per-panel one: it reads
whichever session is currently focused (via a ref mirroring `focusedId`) and calls
`getSelection()`/`paste()` on that session's `SessionHandle` — a per-panel subscription would
mean every panel but the focused one receives and discards the event.

**Two lifetimes, not one (`session/session-registry.ts`).** A panel's session — its
`Terminal` and its PTY — is created once and disposed once, in a module-level registry outside
React. The React panel (`TerminalPanel.tsx`) is mounted and unmounted freely by tiering and
owns nothing. Confusing "this component is unmounting" with "this panel is going away" kills a
running agent with no error anywhere. `pty.kill` has exactly two callers, both inside
`session-registry.ts` — `disposeAll` (no production caller since M4c) and `dispose(id)` — but
**a tier change must never reach either one.** Neither caller is guarded on whether the session
has ever spawned: main's `PtyManager.kill` reaches `backend.destroy(panelId)` even for an id it
has no local session for, because under tmux a never-spawned panel can still own a surviving
session (off-screen or over `LIVE_BUDGET`), and skipping the kill there would leak it forever.
`dispose(id)` has five call sites in the canvas layer — close button, undo/redo removing a
panel, canvas reset, and restart-in-place in `Canvas.tsx`, plus workspace delete, which M28
carried out into `canvas/usePaletteActions.ts` — and every one keeps the `pty.kill` count
at two precisely by routing through `dispose(id)` instead of calling it directly; re-derive
this count from source (`grep -rn "registry.dispose" src/renderer/canvas/` / count `pty.kill` callers in
`session-registry.ts`) rather than trusting a stale number here — `verify:panels` 94 pins both
counts by reading the source text for exactly this reason. `dispose(id)` itself also sends
`pty.kill` even when this renderer holds no LOCAL session for that id — the identical shape one
door further out, needed because a hidden workspace's panel is absent from a fresh reload's
registry (`sessions.get(id)` is `undefined`) even though its tmux session may still be alive;
skipping the call there once meant deleting a hidden workspace disposed nothing and its
sessions ran forever, unreachable, burning tokens with no UI able to stop them.

**Lazy spawn (`session-registry.ts`).** A PTY is created when its panel first goes live, not
at startup — "fit before spawn" (below) needs real cols/rows from an attached, laid-out node,
and a twelve-panel restored canvas must not launch twelve agents on boot. `LIVE_BUDGET` (8)
caps how many are live at once regardless of panel count, enforced in TWO places: `assignTiers`
never promotes more than the budget, and `Canvas.tsx` re-checks it when applying the tier map,
because a held-back demotion (below) is a live panel `assignTiers` did not count — without the
second check, panning past twelve panels left all twelve live for the gesture's duration, a
WebGL-context count against a browser cap that is permanent for the run once exceeded
(`create-terminal.ts` sets `webglDisabled`).

**Promote now, demote later (`Canvas.tsx`, `DEMOTE_DELAY_MS = 250`).** Promotion to `live` is
applied immediately; a demotion to `card` is held for 250ms and re-applied only if still true
after the delay — without it, a panel sitting at the viewport edge destroys and recreates a
WebGL context every frame while panning. The release timer is armed against a **ref**, never
re-armed in an effect cleanup keyed on `viewport` (which changes every wheel event) — a cleanup
there would let a continuous pan restart the clock forever and nothing would ever demote. The
hold also yields to the budget: when live-plus-held would exceed `LIVE_BUDGET`, the oldest
holds release immediately.

**Focus is released on a background click (`Canvas.tsx`).** `assignTiers` pins the focused
panel live unconditionally, so an id that is never cleared holds a WebGL context and a budget
slot forever, and keeps routing `Cmd+C` to a panel whose textarea the browser blurred long ago.
Background `onMouseDown` clears `focusedId` alongside `selectedId` — this is also what lets a
panel the user typed into ever demote.

**Pointer coordinates are corrected, not gated (`components/xterm-pointer.ts`,
`canvas/pointer-correct.ts`).** xterm computes a cell from `(clientX - rect.left) /
dimensions.css.cell.width` — `rect.left` is transform-aware (screen px) and `cell.width` is
transform-blind (CSS px), so under `scale(k)` xterm reports a column `k` times off. Rather than
gating clicks to a narrow scale band, `installPointerCorrection` is a **capture-phase listener
on `document`** (xterm binds its own drag listeners to the document once a gesture starts, so a
panel-scoped listener would correct mousedown and then miss every subsequent move) that pins
the target slot at mousedown and re-dispatches a corrected synthetic event. Three fields on the
synthetic event are each individually load-bearing and fail silently if dropped: `detail`
(click count — drop it and double/triple-click select stops working), `buttons` (drop it and
every corrected move reads as a hover, so selection never extends), and the modifier flags. A
`WeakSet` marks synthetic events to stop the capture listener recursing on its own re-dispatch.
At `scale === 1` the interceptor returns before doing any work. **Known limit**: correction is
anchored to the slot pinned at mousedown, so a hover `mousemove` with no prior in-slot mousedown
is uncorrected — a mouse-reporting TUI still sees `k`-times-wrong coordinates on hover.

**`version` exists only so `memo` can see a mutation (`TerminalPanel.tsx`,
`session-registry.ts`).** `TerminalPanel` is wrapped in `memo`, and the registry mutates a
`PanelSession` **in place** — `registry.get(id)` returns the same object reference forever, so
`session` alone is always "equal" by shallow comparison no matter how its tier/status/spawned
fields flip underneath it. `Canvas.tsx` passes `registry.version()` down purely so the shallow
compare has something that changes: without it, promoting a panel never re-renders it and no
PTY is ever spawned. `version` bumps only on tier/status/focus/exit — never on 16ms-batched PTY
data, never on pointer moves — which is what keeps the memo blocking the 60Hz pan/zoom cascade
from reaching every panel. This is the FIRST of several module-level stores in this codebase
that must never ride this counter for a higher-frequency fact; see "One counter, many stores
that must stay off it" below for the canonical statement and every instance.

**One transform, not N layouts (`Canvas.tsx`).** A single `.world` element carries
`translate(...) scale(...)`; panels are positioned once in world coordinates and never
recomputed per frame. This is not only performance: a CSS `scale()` on an ancestor is invisible
to `getComputedStyle`/`ResizeObserver`, which xterm's `FitAddon` consults — zooming *cannot*
change a panel's cols/rows this way. The same blindness is why pointer coordinates need
correcting rather than gating (above): `getBoundingClientRect()` is transform-aware while
`dimensions.css.cell.width` is not, so a click under `scale(k)` lands on a cell off by `k`.

**`passive: false` on the wheel listener (`useViewport.ts`).** Chromium treats ctrl+wheel as
its own page-zoom gesture; without `preventDefault()` a pinch zooms the whole UI. React's
`onWheel` prop may attach passively (where `preventDefault()` silently does nothing), hence a
manual `addEventListener('wheel', handler, { passive: false })` in an effect, plus
`setVisualZoomLevelLimits(1, 1)` in `src/main/index.ts` as a second line of defence.

**Clamp scale before deriving translation (`zoomAt`).** Deriving the translation from a
*requested* scale while applying a *clamped* one makes the canvas drift sideways while
appearing frozen — visible only while holding a pinch at the limit. `verify:viewport` 3.

**Cmd is required for every canvas shortcut (`useViewport.ts`).** Agent TUIs claim
essentially every bare key, so a bare keystroke must always reach the PTY. Trackpad gestures
are safe to claim because terminals don't use them.

**No `StrictMode` (`src/renderer/main.tsx`).** Double-invoked effects would spawn a PTY, kill
it, and spawn it again on every mount. Intentional; leave it off while the PTY lifecycle is
still being proven. (This is also why `Canvas.tsx`'s history-committing updaters, which call
`setState` from inside another updater, are safe — StrictMode would double-invoke them.)

**Fit before spawn (`session-registry.ts`'s `attachSlot`/`spawn`).** `attachSlot` calls
`session.handle.attach()` — which opens the terminal against its now-mounted host and fits it
— before `spawn()` reads real `cols`/`rows` and passes them to `pty:create`. Spawning at 80x24
and resizing after makes agent TUIs draw their frame twice and leave artifacts.

**`externalizeDepsPlugin` (`electron.vite.config.ts`).** Keeps `node-pty` out of the bundle
so its native `.node` binary is `require`d from `node_modules`. Anything with a native
binding belongs in `dependencies`, not `devDependencies`.

**`term.open()` runs at most once, ever (`create-terminal.ts`).** `TerminalHandles.opened`
guards it: xterm's `open()` is not repeatable, and everything a terminal has drawn lives inside
the `Terminal` instance, not the host `div`. `detachTerminal` disposes the WebGL addon and
removes the host from the document but never touches the `Terminal`; `attachTerminal` on
re-attach loads a fresh `WebglAddon`, fits, and calls `term.refresh(0, rows - 1)` — `verify:xterm`
proved a fresh WebGL context does not repaint on its own after re-attach, so that refresh call
is load-bearing, not a defensive extra.

**Resize commits on release, not live (`Canvas.tsx`'s `onCommit`, `registry.refit`).** The
panel's box follows the cursor every frame during a resize drag, but `refit()` — which fits
the terminal and fires `pty:resize` — runs exactly once, on mouseup. A full-screen agent TUI
repaints its entire frame on every SIGWINCH; resizing live would mean ~sixty repaints a second
at intermediate sizes the user never meant to keep. `verify:panels` 11.

**Stacking is `Panel.z`, never array order (`panels/panels.ts`, `Canvas.tsx`).** React
reconciles a reordered keyed list by remove-then-insert, which would momentarily detach the
subtree holding a live terminal's host and its WebGL context. `raisePanel` only ever changes
`z`; `Canvas.tsx` sorts by `z` before `hitTest`, so paint order and pick order still agree.
`verify:panels` 16.

**Wheel ownership is decided in one predicate, in the capture phase (`useViewport.ts`,
`Canvas.tsx`'s `shouldYieldWheel`).** `shouldYieldWheel` is the SOLE authority — never
post-filtered by an AND in the caller, which can only ever *narrow* what the predicate says.
Rules, in order: **(1)** the palette owns every wheel over `.palette` (see "Scrolling the
palette is a yield" below), and the nav grid owns every wheel over itself the same way. **(2)**
otherwise a zoom gesture (`ctrlKey` trackpad pinch, or `metaKey` mouse wheel) is always the
camera's, covering the focused panel too — `Cmd` is the modifier every other canvas shortcut
requires, so it can't be the one input the canvas defers on. **(3)** otherwise a wheel over the
element carrying `data-scroll-host` (a live terminal's slot, a review node's diff body, a file
panel's body) scrolls that region; everything else pans the camera — see "Rule 3 is
attribute-driven" below for why this is a DOM marker rather than a branch on panel kind. The
listener is capture-phase, `{ passive: false }`, on the canvas host — xterm's own wheel handler
is bound on a descendant and runs first in the target phase, so a bubble-phase listener would
already be too late; the shipped listener calls neither `preventDefault` nor `stopPropagation`
over the scroll-host case (so xterm sees the untouched event) and both otherwise (so xterm's
target-phase listener never runs at all). `verify:panels` 12 asserts all three halves in one
fixture. Reverting to a bubble-phase listener reintroduces double-handling (both the terminal
and the camera react to one wheel).

**Rule 3 of `shouldYieldWheel` is attribute-driven, not a branch on panel kind.** With a single
panel kind, "wheel over the focused panel scrolls it" was implicit; with five kinds the
predicate would otherwise need an `if (isReviewPanel(panel)) …` for every one, which is wrong
twice over — it has to be edited every time a kind is added, and it consults the panel MODEL to
answer a DOM question the model can't fully answer anyway (a review node's header isn't
scrollable even though its body is). Instead each kind's component renders `[data-scroll-host]`
on the element that actually scrolls, or renders no marker at all if it owns none, and
`shouldYieldWheel` just asks `panel.querySelector('[data-scroll-host]')`. A dormant/carded panel
correctly renders no marker (a card has no xterm to hand the event to), which is also why the
old `.panel__slot`-based test was subtly wrong even before other kinds existed.

**Backlog #68's drag-pan lives inside `useViewport.ts`, next to the wheel listener's own pan
logic, and never inside `Canvas.tsx` — the same "arbitrated in one place" rule the wheel
predicate above states.** `beginPanDrag(originScreen)` is a sixth narrow verb (the setter
stays private, as every entry on this camera already says); its document-level
`mousemove`/`mouseup` effect mirrors `usePanelDrag.ts`'s shape exactly — origin captured once,
recomputed from that fixed origin every frame, a `buttons === 0` mid-gesture end for a missed
mouseup — and calls the same `panBy(vp, dx, dy)` the wheel path already uses, screen-pixel
deltas needing no scale correction because `.world`'s translate sits outside its scale.

**Middle-drag is claimed in the CAPTURE phase, composed with `onLinkModeMouseDownCapture`,
because no panel chrome handler in this codebase checks `event.button`.** Every panel's own
mousedown handler (chrome drag, resize, close) fires on ANY button today, so an unguarded
middle-press over a panel's chrome would start a *panel* drag via `usePanelDrag` rather than a
camera pan — the identical class of gap `useLinkMode`'s own capture-phase listener exists to
close for the completing click of a link. `onCanvasMouseDownCapture` therefore checks
`onLinkModeMouseDownCapture(event)` FIRST — never a second, competing `onMouseDownCapture`
prop, since React allows exactly one per element — and only then `event.button === 1`, gated on
the palette and the nav grid (mirroring `shouldYieldWheel`'s rules 0-1, both of which already
stand every other canvas gesture down while open). No `merged` gate, matching the wheel's own
rules: panning the lane-space camera is harmless read-only navigation.

**Space-drag is gated on `document.activeElement`, never on reconstructing `focusedId` /
`palette.isOpen()` / draft-element checks by hand (`useSpaceHeld.ts`).** Space is a bare key
that belongs to whatever agent is running in a focused panel — "Cmd is required for every
canvas shortcut" names the identical hazard — so a naive global claim would swallow a literal
space keystroke meant for `vim`/`claude`. The backlog's own "nothing focused" is most precisely
the DOM's own answer: when nothing legitimately wants a keystroke, `document.activeElement` is
`document.body`. That ONE test subsumes four app-level facts a hand-built equivalent would need
to get right separately — no panel focused (xterm's hidden textarea isn't active), the palette
closed (its input isn't active), and no open review/file draft (their textareas aren't active)
— the same DOM-truth-over-app-state instinct `xterm-pointer.ts`'s `.panel__slot` test and
`useNavGrid`'s `.review-node__commit-form, .file-node__editor` test both already use. When
something IS focused, the keydown handler does nothing at all — no `preventDefault`, no state
change — so the keystroke flows exactly as if the hook did not exist.

It arms ONLY inside the marquee's own background-press branch of `onMouseDown` (`hitTest`
found nothing, `!palette.isOpen() && !merged`) — never a second branch, never capture phase —
so space-drag and the marquee are two interpretations of the identical "background press"
moment, never both: `if (spaceHeld.isHeld()) beginPanDrag(...) else beginMarquee(world)`. This
is deliberately narrower than a Figma-style "space pans anywhere, even over a panel": the
backlog's own text says "over the background," and a press that lands on a panel already goes
through `onSelectPanel` in the `if (hit)` branch above, untouched. `verify:panels` 174-177: 174
and 175 pin the middle-drag delta over background and over a live panel's chrome (the panel's
own screen rect must shift by EXACTLY the camera's delta, proving it was panned and not
dragged); 176 pins space-drag panning when nothing is focused; 177 pins that the identical
gesture over a PANEL does not pan at all.

**Dormancy outranks focus (`lod.ts`).** `assignTiers` pins the focused panel live
unconditionally, so restoring focus onto a restored panel would spawn a process at boot,
contradicting "dormant until clicked" before the user ever touches the canvas. `attachSlot`
carries a second, deliberate dormancy guard on top of the tiering rule, so "no process starts by
itself" doesn't rest on one pure function alone — `verify:viewport` 46–47 and `verify:registry`
16 cover the two layers separately. Dormancy is about SPAWNING, not attaching: a panel with a
live tmux session has nothing to spawn, so it reattaches like any panel and `LIVE_BUDGET` still
caps concurrency; a failed `pty:list` degrades to the empty set, which restores everything
dormant — the safe direction, since it spawns nothing.

**The store is main's because the quit flush cannot ask a dead renderer
(`main/layout-store.ts`).** `app.on('before-quit')` is main-side; if the renderer owned the
debounce, main would have to ask a renderer that Cmd+R/Cmd+W may already have destroyed.
`flushSync` must never throw, because an exception there can wedge the quit before the window
is allowed to close.

**`parseLayout` never throws and drops entries individually (`shared/layout-schema.ts`).** One
malformed panel costs that panel, not the whole file. **This is the canonical statement of the
absent-vs-malformed rule this schema — and nearly every parser added after it — draws
throughout the file: an ABSENT key is every pre-existing file and must warn nothing; a
PRESENT-but-malformed value warns and is dropped (never silently coerced); and a per-entry
failure (one bad panel, one bad preset, one bad link) costs only that entry, never the whole
collection.** `parsePresets`/`parsePreferences`/`parseBaselines`/`parseSessions`/the panel-kind
union/the `agent` field/`main/toolbox-scan.ts`'s `SourceRead`/`main/fs-tree.ts`'s `DirResult`
all restate this same three-way split for their own format; where one of those has something
genuinely different to say (a specific number, a specific asymmetry) it's called out below
under its own name, but the underlying rule is this one. **Duplicate ids are the one failure
with no visible symptom**: `registry.ensure` returns the existing session for a repeated id, so
two panels in `layout.json` silently render as one, because `handle.host` can live in exactly
one DOM slot.

**`nextIdRef` seeds from every kind's ids, across every workspace (`Canvas.tsx`).**
Initialising the id counter to `1` collides with a restored `n5` after five `Cmd+N` presses on
a previous run. This has recurred repeatedly as the app grew more kinds and more workspaces,
each time through a door the previous fix didn't close: the counter recovers its seed by
scanning existing ids with a regex, and that regex has to list EVERY live kind prefix
(`n`/`r`/`f`/`j`/`t` as of the newest kind) or it silently ignores every panel of the kind it
forgot — recomputing a max blind to persisted `r7`s, say, and then minting a literal duplicate
`r7`, which React keys collide on and `parseLayout` drops silently at the next load. It also has
to run at BOTH seed sites — boot, and every `switchWorkspace` — because `PanelId` doubles as a
tmux session name (see "Panel ids are global, not per-workspace" below) and a workspace switch
can reveal ids a narrower, single-workspace scan would never have seen. When adding a sixth
kind: widen the regex at both sites, or the id-collision defect resurfaces through the same
door.

**One history entry per committed gesture (`Canvas.tsx`).** A drag calls `setPanels` roughly
sixty times as the pointer moves; pushing an undo entry there makes one drag take sixty
`Cmd+Z` presses to unwind. History is pushed once, on commit, not per intermediate update.

**Undo removing a panel must dispose its session, and the call-site count only moves by
addition (`src/renderer/canvas/`, `session-registry.ts`).** `registry.dispose` has five call
sites in the canvas LAYER today — close button, undo/redo removing a panel, canvas reset and
restart-in-place in `Canvas.tsx`, workspace delete in `usePaletteActions.ts` — and adding a new one that forgets to route through `dispose()` (calling
`pty.kill` directly, say) breaks the two-caller invariant `session-registry.ts` depends on.
Re-derive the count from `grep -rn "registry.dispose" src/renderer/canvas/` rather than a number
written down here — this file has gone stale on this exact count before, inside the very commit
that recorded it, which is why `verify:panels` 94 pins both counts by reading source text
instead. Workspace delete disposes rather than demotes (the one workspace-switch path where
that's correct) because a doomed workspace's record is about to be deleted entirely — a
surviving session there is one no UI can ever reach or stop again.

**`dispose(id)` sends `pty.kill` even when this renderer holds no local session for that id —
see "Two lifetimes, not one" above**, which states this rule and its consequence in full.

**No `beforeunload` teardown (`Canvas.tsx`).** The renderer deliberately does NOT dispose its
sessions on unload; re-adding that listener silently deletes M4c's headline feature (session
survival across a reload). `disposeAll()` would send `pty:kill` for every panel and WIN the race
against `window-lifecycle.ts`'s `did-start-navigation` `detachAll()`, because `beforeunload`
runs first — every unit-level check stayed green while a reload destroyed the user's agents,
which is why `verify:panels` 26 (a real renderer reload) is the check that actually catches a
regressed listener; `verify:pty-manager` 12 and `verify:window` 4 each drive only one half.

**`Cmd+Z` is claimed, `Ctrl+Z` is not (`src/main/menu.ts`).** The same split as `Cmd+C`/`Ctrl+C`.
The stock `'undo'`/`'redo'` menu roles drive `document.execCommand` against whatever DOM element
happens to be focused, not the canvas's own history stack. `Ctrl+Z` reaches the PTY untouched
and still suspends the foreground process as SIGTSTP.

**The tmux client's exit code is always 1 (`session-backend.ts`, `tmux-args.ts`).** Measured:
an inner command exiting 0 and one exiting 42 both produce client exit 1. `remain-on-exit on`
plus a `pane-died` hook recovers the real `#{pane_dead_status}`; the hook writes the file
*before* `kill-session`, and killing the session is what makes the client exit, so by the time
`node-pty`'s `onExit` fires the file is already on disk. Reversing the two hook commands races
and reports the wrong code intermittently.

**`parseListOutput` must filter `#{pane_dead}`.** `remain-on-exit on` means a session whose
command exited still *exists* until the hook kills it — an unfiltered list reports a finished
process as live, boot reconciliation restores that panel non-dormant, and the user gets a panel
attached to a corpse that can never produce another byte.

**tmux is resolved by absolute path from the login env (`tmux-probe.ts`)** — see "Login-shell
PATH" above, which now states this rule (and git's identical one) in one place.

**The probe checks that the SERVER starts, not just that a binary exists (`tmux-probe.ts`).**
`tmux -V` proves a version, not a working server — an unwritable `TMUX_TMPDIR`, a
socket-directory permission problem, or a stale socket owned by someone else would leave `kind`
at `'tmux'` while every panel's client dies instantly, with nothing in the HUD. `probeTmux`
therefore writes the config and runs `start-server -f <conf>` on the private socket before
committing to that backend; a failure falls back to `DirectBackend` with a named reason.

**The bundled tmux config is generated, not shipped (`tmux-args.ts`'s `buildTmuxConf`).** It
embeds `exitDir` (a per-run path under `userData`, unknowable until the app is running). Every
line fails *silently* if changed: `prefix None` is what keeps `Ctrl+B` reaching the agent (the
same split as `Ctrl+C`/`Ctrl+Z`), `terminal-features ",xterm-256color:RGB"` stops 24-bit output
being downsampled to 256 colours, and `mouse` must stay **off** — `mouse on` makes tmux capture
mouse reporting instead of passing it through, silently defeating all of M4a's pointer
correction one process further down.

**The `pane-died` hook's redirect target must stay quoted (`buildTmuxConf`) — this repo's
single costliest silent bug.** `exitDir` (under `app.getPath('userData')`) always contains a
space on macOS (`~/Library/Application Support/…`). Unquoted, the shell splits it: the exit
code lands in a junk file, `exitCodeFor()` finds nothing, and *every* panel reports
`[process exited with code 1]` regardless of the real exit code — while the session still dies
normally, so nothing else looks wrong. It shipped through eight task reviews because every
fixture used a space-free path. Both `verify:tmux` and `verify:pty-manager` now deliberately
use a spaced fixture directory for this reason, and it is why the file-panel/toolbox/subagent
fixtures added later all copied the same habit — treat a spaced fixture path as load-bearing
test infrastructure, not incidental.

**Two concurrent verify runs, and packaged vs. dev, and two copies of one build, must each get
their own tmux socket (`tmux-args.ts`'s `resolveSocket`, `scripts/verify-socket.cjs`,
`main/index.ts`).** Every argv builder takes the socket as a *defaulted* parameter so
production always resolves `'terminal-canvas'` while `verify:pty-manager` runs on
`'terminal-canvas-verify'` (its own `shutdown()` — `kill-server` — must never touch a real
instance's agents). Two simultaneous `npm run verify` runs (ordinary once git worktrees made it
common) would otherwise kill each other's sessions mid-run via that same `shutdown()`; a
`TC_VERIFY_SUFFIX` env var appends a sanitised (`[A-Za-z0-9_-]` only, since a socket name is a
filename) suffix per run. Separately, a packaged build resolves a DIFFERENT socket
(`'terminal-canvas-app'`) than dev, so quitting one build can't `kill-server` the other's
agents; a blank `TC_TMUX_SOCKET` override must be treated as *unset* rather than an empty `-L`
(which falls back to tmux's OWN default socket — the user's regular tmux server, which
`shutdown()` would then destroy). Separately again, two copies of the SAME build share a
`userData` directory and would resolve the same socket — `app.requestSingleInstanceLock()` at
module scope with two early-return guards (inside `whenReady` and inside `second-instance`,
never a conditional *registration*) refuses a second launch outright, because `app.quit()`
still runs the ready/quit handlers, so a losing instance that got even one line into `whenReady`
would start a tmux client on the winner's socket and flush an empty store over the winner's
`layout.json`. Dev-plus-packaged is not blocked by this (different `app.getName()`, different
`userData`, different socket already) — only two copies of one build are, which is the only
destructive pairing.

**Every check appended to `verify:pty-manager`'s tmux block must leave that block ending in a
definite `kill-server`, and this has been forgotten once already.** A leftover server from a
prior run keeps its OLD `pane-died` hook wired to a now-deleted `exitDir`, and `-f <conf>` is
silently ignored against a server that's already running — a check reading the exit code from
that hook's file (like `verify:tmux` 18) then falls through to the client's own (wrong) exit
code, in a LATER run, for a reason that has nothing to do with the code it's testing. Re-running
usually hides it, since the closing `shutdown()` restarts things clean.

**`reattached` costs a probe because `-A` erased the question (`tmux-args.ts`'s
`buildHasSessionArgs`, `pty-manager.ts`'s `create`).** `new-session -A` attaches if the session
exists and creates it otherwise — create and reattach are the same call, so telling them apart
in the UI means asking `has-session` **before** the spawn, not after (after, `-A` has already
created the session and the answer is always `true`). The exact-match `=` on the probed target
is the same rule every kill target obeys — without it, panel `n1` reports a surviving session
whenever `n12` is running. This fact sat unread in `PanelStatus` for two milestones before the
inspector became its first reader (`buildInspectorModel`'s `reattached` badge, `verify:rail`
24) — `TerminalPanel.tsx`'s own header never displays it, and `verify:panels` 91 is the only
place a real tmux session surviving a real reload is observed with the badge on screen, needing
tmux to run at all.

**The baseline is captured once per SESSION, not once ever, and `reattached` is why
(`pty-manager.ts`'s `create`, `main/baseline-capture.ts`).** `captureBaseline` fires from inside
`create()`, gated on an in-memory `capturedBaselineIds` set — because `-A` makes create and
reattach the same call, `create()` runs again on every reload whether or not anything actually
respawned, and under tmux that second call REATTACHES to a session that may have run for an
hour. An ungated recapture there would silently reset the baseline to "now", so the pane would
report "no changes" for an agent that had rewritten half the repository. A SECOND, independent
guard (`deps.baselineOf(panelId) !== undefined`, a persisted record) is what makes the baseline
survive an app RELAUNCH even though the in-memory set does not — and that persisted record has
its own resolution trap: `baselineOf === undefined` used to mean one thing and is actually two —
"never spawned" and "spawned into a non-repo cwd, so nothing was ever stored" — with the latter
permanently misreported as "no session yet" for the rest of that panel's life. `notARepo(panelId)`
(a second membership-only set, optional and defaulted `false` for backward compatibility with
every fixture built before it) is what lets `review()` tell the two apart. **A relaunch is a
NEW session, and "once" therefore also needs a startup sweep**: quitting runs `shutdown()`
(kill-server), so at the next launch nothing survives, yet `layout.json` still holds the
previous baseline — without a sweep dropping the baseline of every panel whose session did not
survive, every panel would be diffed against a stale, previous-session snapshot forever. That
sweep must NOT touch the in-memory `Cmd+R` guarantee (a fresh main process's copy of
`capturedBaselineIds` is empty by construction, so the two can't collide), and `before-quit`
must tear down (dropping baselines) BEFORE it flushes the store, wrapped in a `try` so a throw
there can't also lose the flush — flushing first would lose every dropped-baseline write on a
process that's about to exit.

**An absent `command` must stay absent through FIVE layers (`shared/layout-schema.ts`'s
`parsePresets`, `main/presets.ts`'s `templateOf`, the `PRESET_SPAWN`/`PRESET_DEFAULT` payloads,
`Canvas.tsx`'s `onSpawn`/`onCapture`, and `session-registry.ts`'s `pty.create` request).** Each
rebuilds its object field by field rather than spreading, because spreading carries
`command: undefined` across the IPC structured clone — where `'command' in template` then
reads **true**, a different fact from the key being absent. The failure is total and silent:
every command-less preset (the built-in login shell, and any user preset saved from one) would
spawn a hardcoded shell instead of the user's actual one. `verify:layout` 34, `verify:panels`
31. **The fifth layer cuts the other way, and it was found in M37**: a field-by-field copy also
DROPS any field it does not name, with no error and a chrome that keeps rendering the spec as
though the copy had carried it. The registry's request carried `agent` and not `agentOptions`
from M23 until M37, so a "plan mode" panel wore its chip and its inspector rows — both read the
renderer's own spec — while main's `agentArgs` saw an absent record and spawned the CLI in its
default mode. `verify:panels` 172 asserted the two renderings agreed with each other; nothing
asserted the request agreed with them. `verify:registry` `copy-site.1` and `worktree.1` now
read the request itself, and every optional spec field added from here owes that site a line
and a check.

**`Cmd+N` stays a renderer keybinding, not a menu accelerator (`useViewport.ts`).** Moving it
to `main/menu.ts` would be architecturally tidier but breaks every `verify:panels` check that
dispatches a synthetic `KeyboardEvent` on `window` to drive it, since a main-process accelerator
never receives that. Main instead pushes the default preset template over `PRESET_DEFAULT` at
every `did-finish-load` (including a reload's), which is what stops a reload silently reverting
`Cmd+N` to a login shell.

**The default preset is caught at module scope, not in an effect (`renderer/main.tsx`).** Main
sends `PRESET_DEFAULT` from the page's load event, but `boot()` awaits TWO IPC round trips
before its first `render()` — a subscription inside a `Canvas.tsx` effect would be at least two
macrotask hops too late, the push landing with no listener and being dropped. The subscription
therefore runs at module scope, ahead of `boot()`'s first `await` (an ordering guarantee, not a
narrower race), and seeds `defaultTemplateRef` as a prop. `Canvas` keeps its OWN `onDefault`
subscription too, for the re-push case — the two cover different moments and neither is
redundant. The failure this prevents is completely silent: `defaultTemplateRef` staying
`undefined` falls through to a hardcoded shell template that is byte-identical to the shipped
default, so only a user who changed `defaultPresetId` would ever see `Cmd+N` silently ignore
it. `verify:panels` 32 is deliberately the one preset check that sends nothing itself — every
other check drives the channel by hand, which is precisely how this could stay inert while the
suite stayed green.

**Built-in presets are code, not data (`main/presets.ts`'s `BUILT_IN_PRESETS`).** Persisting
them into `layout.json` means deleting one resurrects it on the next launch with no
explanation, and grows a file rewritten in full on every coalesced save for no benefit.

**Who owns the keyboard (`palette/usePalette.ts`, `Canvas.tsx`).** The palette is the first
surface that must *swallow* bare keys — the inverse of "a bare keystroke must always reach the
PTY" above. Four rules, each silently broken if any one is missing: **(1)** opening focuses the
input (xterm reads only its own hidden textarea, so moving DOM focus is what stops typing
reaching the agent). **(2)** DOM focus is not app focus: `focusedId` is CAPTURED, never cleared
— clearing it would demote the panel, lose the `Cmd+C` target, and disable every
`capturedId`-gated row. **(3)** canvas shortcuts (keyboard AND wheel, via `shouldYieldWheel`
rule 1) stand down via `isOpen()`, a `useCallback` reading a ref rather than state so it can sit
in dependency arrays without tearing listeners down on every open/close. **(4)** closing calls
`restoreFocus(capturedId)` — nothing else gives the keyboard back, since an unmounted input's
blur leaves focus on `<body>` and every keystroke goes nowhere. There are exactly **three ways
out**: `Escape`, `Enter` on a runnable row, and a click outside — `Tab` is folded into the same
`switch` as `Escape` rather than left to the browser's default focus walk (which could land on
xterm's own tabbable helper textarea and leave the overlay up with the keyboard on the agent).
`Cmd+K` itself excludes `shiftKey` explicitly, because `Cmd+Shift+K` is a distinct shortcut in
every editor a user might have open and arrives with the same `key === 'K'`.

**`edit:paste` is guarded, `edit:copy` is redirected, and the palette owns its own subscriptions
(`Palette.tsx`, `Canvas.tsx`).** `Cmd+C`/`Cmd+V` are main-process menu accelerators, so the
browser never delivers a *native* paste to the palette's `<input>` — a guard against the canvas
handling them isn't enough, since nobody would then be serving the input either. `Palette.tsx`
subscribes to the same two events and inserts at the caret. The copy half is asymmetric because
a selection inside an `<input>` is not part of `window.getSelection()` in Chromium — the palette
reads `selectionStart`/`selectionEnd` off the input instead.

**A prompt insert is `paste()`, never `write()` (`canvas/usePaletteActions.ts`'s `insertPrompt`).** `term.paste`
wraps the payload in bracketed-paste markers and normalises LF to CR, delivering a multi-line
prompt as ONE input; a raw write submits every newline separately, firing incomplete fragments.
Every prompt worth saving is multi-line, so this affects the whole feature. `verify:panels` 40
is the only check that can tell the two apart, since its fixture panel deliberately enables
bracketed paste itself.

**Navigating must not wake (`canvas/usePaletteActions.ts`'s `goToPanel`).** Waking hangs off *selection*
(`onSelectPanel` clears the dormant id and calls `registry.wake`), so reusing it for the
switcher would spawn an agent as a side effect of navigating — on a restored twelve-panel canvas
that's twelve CLIs launched by a keyboard tour. `goToPanel` factors out just the select-and-raise
half. This rule recurs for every later navigation surface that lists panels (rail rows, the nav
grid, links) — see "The rail navigates; only the start control wakes" below for the rail's own
instance, which states the same split for a second surface.

**The palette swallows its own mousedowns (`Palette.tsx`).** The overlay mounts INSIDE
`.canvas`, whose background `onMouseDown` clears `focusedId`, hit-tests the click's world point,
and (via `onSelectPanel`) WAKES whatever panel lies underneath — so without a bubble-phase
`stopPropagation` (no `preventDefault`, so the input can still place a caret) on `.palette`'s
root, clicking into the palette's own text field spawns a process. The nav grid's overlay
inherited this same trap when it shipped, needing the identical one-line fix
(`onMouseDownCapture` on the grid's root — see the nav grid entry below).

**Scrolling the palette is a yield, not a scroll handler (`Canvas.tsx`'s `shouldYieldWheel` rule
1).** `.palette__list` has always been `overflow-y: auto` — what stopped it scrolling was
`useViewport`'s capture-phase wheel listener seeing the wheel FIRST and calling
`preventDefault()` on the ancestor `.canvas` before the browser's default scroll ever ran. The
fix is subtractive (rule 1 returns `true` and `useViewport` touches nothing), and **no
`onWheel` handler in `Palette.tsx` would help** — a bubble-phase handler there runs after the
capture listener has already cancelled the event. `verify:panels` 47 asserts CANCELLATION, not
`scrollTop`, because a synthetic `WheelEvent` performs no real scroll in Chromium even against
correct code.

**Three ways out of the palette, and the third must not restore focus (`Canvas.tsx`'s
`onMouseDownCapture`, `usePalette.ts`'s `dismissPalette`).** A click outside closes the overlay
— without it, one click leaves the overlay on screen with the input blurred and every key
reaching the agent, and `Escape` can't even undo it since the key no longer reaches the
palette's own handler. This listener is capture-phase on the canvas host (every panel's own
handler `stopPropagation`s its mousedown, so a background-only listener would miss the common
case) with an explicit `closest('.palette')` containment test, and it calls `dismissPalette()`
WITHOUT `restoreFocus` — the click itself is the focus gesture, so restoring would yank the
keyboard back to whatever the user just clicked away from.

**The palette's selection moves only when the user moves it (`Palette.tsx`, `Canvas.tsx`'s
`panelRows`).** Three routes silently re-seated it and all three look correct in a screenshot
(the highlight is just somewhere the user doesn't expect, and `Enter` runs the wrong command):
re-seeding on every `rows` identity change (fixed to re-seed only on a query/scope change, and
to fall back to `bestMatchIndex` — the top-scoring RUNNABLE row, never `firstRunnable`, which
would ignore the query the instant rows became section-ordered — rather than `firstRunnable`
when the selected command becomes unrunnable); `panelRows` tracking the panels array (a fresh
identity on every drag frame) rather than being keyed on `palette.open` and read out of a ref;
and `resetViewport`/`centreOn`/`restoreCamera` not being stable `useCallback`s (an unstable
identity propagates into `Palette.tsx`'s `commands` memo, whose `[rows]` effect re-seats the
selection on every unrelated re-render, e.g. a mousemove over the canvas). The selected row also
carries a ref and `scrollIntoView({ block: 'nearest' })`, because the list is long by
construction (four rows per preset, one per panel, two per prompt).

**Hover is a fourth way the selection moves, and needs two guards to keep the rule above true
(`Palette.tsx`'s `lastPointerRef`/`pointerSelectRef`).** Hovering a row sets the same `index`
the arrow keys set (one highlight, not two). Two failure directions, both silent: a
pointer-driven index change must suppress its own `scrollIntoView` (a partly-visible row at the
list edge would otherwise scroll itself into view and shift every other row out from under a
cursor that never moved), and a keyboard-driven scroll must NOT re-trigger hover — Blink
re-dispatches a `mousemove` at the UNCHANGED cursor position after a scroll to refresh `:hover`,
so an ArrowDown that scrolls the list would otherwise "hover" whichever row slid underneath and
drag the selection straight back. `lastPointerRef` compares raw coordinates against the previous
move and ignores an identical pair — the only thing separating the synthetic re-dispatch from a
real one. Disabled rows take no hover, matching `stepRunnable`'s rule for the arrow keys.
`verify:panels` 72c is the only one of the three hover checks that has ever caught anything (72
and 72b pass even with no coordinate guard at all).

**Project prompts are read, never written (`main/prompts.ts`).** `.claude/commands/*.md` under
a panel's cwd belongs to the repository (version-controlled with the project, usable in a plain
terminal) — writing it would mean authoring a file someone will commit as a side effect of
"save", so `prompt:save` always writes the app's own store and `prompt:delete` returns `false`
for a project id. Four limits protect a directory this app doesn't own: at most 100 files, at
most 64KB each (skipped, never truncated — half a prompt read as a whole instruction is worse
than a missing one), one level deep, and a missing/unreadable directory is the empty list rather
than an error (most cwds have none, and throwing would take the saved prompts down with them).
Same-named prompts from the two sources are never deduped — they stay two rows, each labelled
with its source, because pasting the wrong project's context into an agent is silent and
expensive.

**`centreOn`/`restoreCamera` are narrow camera verbs; the setter stays private
(`useViewport.ts`).** Anything that needs to move the camera asks by name (`resetViewport`,
`worldCentre`, `centreOn(rect)`, and M7's `restoreCamera(camera)`) rather than being handed the
setter, which is what keeps the coordinate math something `verify:viewport` can pin purely.
`centreOn` deliberately does not change scale (framing a panel shouldn't discard the user's
chosen zoom); `restoreCamera` is the one exception, setting `x`/`y` AND `scale` exactly, because
a workspace's saved zoom level is part of what it means to come back to it.

**`Cmd+N` cascades, and the test is CENTRES, not overlap (`panels/panels.ts`'s
`cascadeCentre`, `Canvas.tsx`'s `onSpawn`).** Every panel-minting path funnels through
`onSpawn`, which used to hand the camera's world centre straight to `makePanel` — N presses at
an unmoved camera produced N byte-identical rects, invisible and total: the canvas looks like
one panel, the buried ones can't be closed, and each still holds a budget slot.
`cascadeCentre` returns the requested centre unless a panel is ALREADY centred there, otherwise
stepping down-and-right until it finds a free slot. Five details are load-bearing: it compares
panel CENTRES, never rect overlap (overlap is the NORMAL state of a working canvas, so an
overlap rule would step nearly every press away from where the user is looking); the epsilon
is half a pixel, not a "looks stacked" radius, because every real coincidence this app produces
is EXACT; the step is in WORLD units, never divided by scale, so the cascade stays visually
constant at every zoom; it runs inside the `setPanels` updater on `current`, never a ref, so two
spawns batched into one tick each see the previous one's array; and it WRAPS at
`CASCADE_MAX_STEPS` rather than marching a panel outside the cull region, where it would never
promote and `Cmd+N` would appear to do nothing.

**The header's honest chain, and the backfill that must never happen (`TerminalPanel.tsx`).**
The label is `title ?? status.command ?? spec.command ?? 'login shell'`. The resolved command
(from `pty:create`'s reply) is **never copied back into `PanelSpec`** — doing so would make it a
fifth place M5a's absent-`command` rule can be lost, and every command-less preset would spawn a
hardcoded shell instead of the user's real one. The rail row (`railLabel`), the inspector's
heading, and the Attention section's rows are all later readers of this SAME chain rather than
independent re-derivations — a re-derivation from `spec.command` alone says `/bin/zsh` beside a
row that correctly says the panel's real title; `verify:rail` 35/73 pin this for the rail. The
inspector additionally renders the resolved command and the SPEC's own answer as two SEPARATE
fields (see "The inspector shows the links, not the answer" below) — a backfill would make those
two fields falsely agree.

**One map, and a typed view over it (`shared/settings-schema.ts`, `main/layout-store.ts`).**
Settings live in ONE sparse `preferences` map in `layout.json`, keyed by `SettingDef.id`.
`LayoutStore.settings()`/`setSetting()` are a VIEW over that same map, not a second storage —
`verify:layout` 73 asserts this by writing through one accessor and reading through the other,
because two storages that agree the day they're written and drift later is exactly the failure
this arrangement removes. Sparse matters: an id absent from the map means "still at the schema
default", which is what lets a default change reach users later rather than freezing at
whatever it was the day they first launched. `parsePreferences` drops an unknown id or a
wrong-typed value with a WARNING rather than coercing it, the same absent-vs-malformed rule
`parseLayout` states in full above.

**Settings are a drill-in, not a flat list (`palette/palette-model.ts`'s `SECTIONS`).** A
setting is `{ id: 'setting', label: 'Settings' }` inserted into `SECTIONS` (ordered data, not a
closed union — appending a section is one object literal), with every boolean row
`hiddenAtRest: true` behind an always-visible `manage.settings` door. This isn't polish: three
more un-hidden rows the day a milestone adds them is the same "silently missing feature" trap
`hiddenAtRest` exists to prevent for presets and prompts. Typing a setting's keyword still
surfaces it at rest, so the hiding is honest rather than a second way to lose a row.
`SettingDef['type']` deliberately tracks only what `typeof` can return (an earlier `'enum'`
member with no enum-typed setting to back it was removed as a customer-free abstraction).
The `main/menu.ts` Restore submenu is DERIVED from `settingsInCategory(RESTORE_CATEGORY)` rather
than hand-listed, so the label and the query can't drift by typo — but nothing in `npm run
verify` constructs a real menu and reads its items, so this derivation is checked only at the
schema level (`verify:layout` 74), not at the menu; see the consolidated manual-verification
list near the end of this section.

**A title is not a bell (`main/agent-state.ts`'s `scanForBell`).** Claude Code sets its window
title with `ESC ] 0 ; <title> BEL` — the terminator is a literal BEL, not a distinct one — so a
naive `indexOf(0x07)` rings a bell on every title change, tracking UI state rather than a need
for attention. `scanForBell` is a small state machine over the escape grammar (`text`/`esc`/
`osc`/`osc-esc`/`dcs`/`dcs-esc`) so a BEL inside an OSC or DCS body is consumed as that string's
terminator. Scanner state is carried BETWEEN calls, never reset per chunk, because output is
flushed roughly every 16ms and an OSC body routinely straddles two flushes — a per-chunk
scanner would re-enter the tail of a split title as ordinary text and ring intermittently, only
under load. **Under tmux this whole trap is unreachable**: `node-pty` spawns a tmux CLIENT, not
the agent, so the bytes reaching the scanner are tmux's redraw, not the agent's stream verbatim
— tmux consumes the agent's OSC title itself (this config sets no `set-titles`) and never
re-emits one, while a pane BELL is passed through unchanged. That asymmetry is why a
tmux-backed fixture can't prove the title scanner works at all; `verify:panels` deliberately
swaps to the DIRECT backend for its bell/title checks (54–57) for this reason, and the scanner
still earns its place because the direct backend is a real, shipped fallback (used whenever
tmux is absent, too old, or its own server fails to start).

**`wants-you` is sticky, and who clears it is asymmetric (`main/agent-state.ts`'s `nextState`,
`IPC.AGENT_ACKNOWLEDGE`).** A TUI typically rings its bell and THEN prints its question, so a
naive "output clears wants-you" rule would clear it milliseconds after setting it. It survives
further output and is cleared only by `acknowledge`. Typing into the panel is a fact MAIN
already holds (via `pty:write`) and clears it there for free; focus is a RENDERER fact main
can't see on its own, so the renderer tells main via `agent:acknowledge` rather than clearing a
local copy — a local clear would make the renderer a second, driftable author of a state main
owns. *(No fault-injection seam in `npm run verify` proves main is the sole author rather than
an implementation that also clears a renderer-local copy that happens to agree — see the
consolidated list near the end of this section.)*

**The jump key does not acknowledge, and `wants-you` outranks selection (`Canvas.tsx`'s
`onJumpAttention`, `styles.css`).** `Cmd+J` is `centreOn` + `selectAndRaise` and nothing else —
no wake, no focus, no acknowledge — so a landed-on panel stays in `wants-you`, and
`.panel--selected.panel--agent-wants-you` paints amber rather than letting `.panel--selected`'s
usual blue win, or the jump would hide the very border it exists to draw attention to.
`verify:panels` 62 reads the rendered border COLOUR rather than the underlying state, because
main can hold `wants-you` correctly while the screen shows the wrong colour.

**`starting` is sent directly, and a killed exit is not sent at all (`pty-manager.ts`'s `create`
and `onExit`).** Two exceptions to "send only on a state CHANGE": `starting` is the detector's
BORN state, so nothing ever *enters* it and a change-gated send would never emit it during the
seconds a real `claude` takes to boot — `create` sends it directly, once. And an exit WE asked
for (`session.killed`) must not send `'exited'`, because it lands after the renderer has already
run its own cleanup at the dispose site — an unguarded send re-adds the map entry, growing it
for the renderer's life and letting a recycled id inherit a dead panel's border.

**The idleness tick is a second, independent timer (`pty-manager.ts`'s `IDLE_TICK_MS`).** The
existing flush timer only runs while there's PTY data pending, so it can never observe the
ABSENCE of output — an agent that goes quiet produces nothing to flush. A separate 500ms
interval, independent of any panel's traffic, is the only way "busy" ever becomes "idle" without
a human doing something; `unref()`'d so it can't hold a plain-node verify process open.

**One counter, many stores that must stay off it — the `registry.version()` rule, stated once.**
`TerminalPanel`'s `memo` is gated on `registry.version()`, which bumps ONLY on tier/status/
focus/exit (see "`version` exists only so `memo` can see a mutation" above) — riding it with
anything higher-frequency re-renders every panel on the canvas on every OTHER panel's unrelated
change, the exact 60Hz cascade the counter exists to block. Every module-level store added after
it — `agent-state-store.ts` (per-bell), `live-session-store.ts` (per-2s-tick cwd/command),
`subagent-store.ts` (per-fan-out), `file-store.ts` (per-write), `toolbox-store.ts` (per-config
read) — is subscribed **per panel id**, not globally, holds a CACHED snapshot object rather than
building one fresh per call (`useSyncExternalStore` compares by reference; a fresh object every
read makes React believe the store changes every render and loops), and is cleared at every one
of `Canvas.tsx`'s panel-removing call sites (plus, for the subagent and usage stores, at
restart-in-place too — a restarted panel is the same panel with a new process, so it must not
inherit the dead one's fan-out or transcript state) or a recycled panel id inherits a dead
panel's data.

**The glow reaches the card, not just the border (`styles.css`'s `.panel__card--agent-*`).**
`LIVE_BUDGET` caps live panels at 8 regardless of canvas size, so most of what a "what needs me"
scan is for is sitting in a CARD. `TerminalPanel.tsx` renders the card variant from the same
`data-agent-state` the live variant reads, so a bell on a demoted panel is exactly as visible.

**`exited` (the detector state) is not an exit code (`main/agent-state.ts`'s `Detector`).** It
exists only to stop further transitions once a process is gone — a dying process's last bytes
arrive AFTER `onExit` fires — and carries no success/failure information; `PanelStatus.exited`
(the real exit code, from `pty:exit`) is the sole authority on that.

**`agent.idleAfterMs` is bounded on TWO independent doors (`shared/settings-schema.ts`,
`LayoutStore`/`parsePreferences`).** The write path (`setSetting`) refuses an out-of-range
number; the LOAD path (`parsePreferences`) independently drops an out-of-range value read from a
hand-edited `layout.json` rather than clamping or carrying it — only guarding the write path
leaves a hand-edited file as an unguarded second door that silently changes idle-detection
timing with nothing in any log. The shipped default (1500ms) is a provisional stand-in, not a
measured value — a planned measurement of real turn-boundary gaps was never run.

**Five milestones have reached the "should this be a new IPC channel" boundary and declined it
(`agent-state-store.ts` and friends).** The attention set (M6d), workspace waiting counts (M7),
live cwd/`session:live` (M12), `subagent:state` (M15), `usage:panel` (M17) each sound like a
query main should answer, and each time the renderer already had everything it needed from
messages already crossing for another reason — a second channel would make main a second,
driftable author of a fact the renderer can derive correctly on its own. `session:live`,
`subagent:state`, `usage:panel` and `agent:state` are all `IPC_EVENTS` **sends**, which is why
`verify:ipc`'s channel count does not move for any of them — that suite counts INVOKE channels
(each needing an `ipcMain.handle`), and a send is handled by nobody and counted by nothing.

**The attention set is a second subscription, not a second store (`agent-state-store.ts`).** A
naive "who wants me" implementation has every panel subscribe to every OTHER panel's state just
to filter for `wants-you` — the exact fan-out `version()` exists to keep off per-panel
subscriptions. `syncAttention` instead maintains one membership-only `Set`, notifying only when
a panel enters or leaves it, and `useAttentionIds` reads a CACHED array rebuilt exactly once per
real membership change (never fresh per read, for the `useSyncExternalStore` reference-identity
reason above). One pre-existing, non-M7 consequence: waiting counts do not survive a reload,
since nothing re-emits the current state of every session to a freshly loaded renderer.

**Live cwd is a poll, a dedupe, and a third store (`pty-manager.ts`'s `LIVE_TICK_MS`/`pollLive`,
`renderer/session/live-session-store.ts`).** `PanelSpec.cwd`/`PtyCreateResult.cwd` both freeze
at spawn time, so the inspector's cwd was confidently wrong for any panel that later `cd`'d.
`buildListArgs` already asks tmux for EVERY session at once, so a poll costs one subprocess per
tick regardless of canvas size, riding a NEW `#{pane_current_command}` column onto an answer
that was already coming. Four rules, each silently wrong if inverted: the poll runs on its OWN
500ms/2000ms-separate timer from the idle tick (merging them would coarsen `agent.idleAfterMs`
detection four times over, silently); the dedupe (last cwd/command pair per panel, keyed with a
NUL separator so a path containing a space can't collide two different pairs into one key) is
the design, not an optimisation — undeduped this is thirty messages a minute per panel
describing a fact that changes when a human types `cd`, and the failure shows up only as CPU
heat, never a wrong pixel; `detachAll()` must clear the cached dedupe value too, or a reload
compares the next real poll against a stale pre-reload value and never sends again; and DISPLAY
renders nothing without a live answer while CONSUMERS (project-prompt reading, preset capture,
M20's file-tree root) fall back to the spawn cwd, because a spawn value under a present-tense
label is a confident wrong answer while a fallback for a consumer asking "a" directory (not "the
current" one) is never worse than not shipping. One deliberate exception: the switcher's own row
text (`panelLabel`) still reads `spec.cwd` and always will, because "where this panel started"
makes no present-tense claim to go stale.

**A workspace switch is a second boot, but the undo stack and dormancy calculation must not lag
behind it (`canvas/useWorkspaceVerbs.ts`'s `switchWorkspace`).** Everything derived from starting state is
RE-DERIVED (id counter, camera, selection); the undo stack is CLEARED outright, for the same
reason a workspace MOVE clears it too (see below) — applying a stale history entry from before
the switch would `dispose` a session that now belongs to a different, no-longer-active
workspace. `pty.list()` must be AWAITED and `dormantIds` computed in the SAME synchronous batch
as `setPanels`, never corrected a render later — the tiering memo's `registry.ensure` early-returns
for a session that already exists, so a late `dormantIds` correction can never undo a session
already minted non-dormant; the registry's own guard then agrees for the wrong reason and
`attachSlot` spawns. This produced up to `LIVE_BUDGET` agent CLIs launched by a bare workspace
switch with no user gesture, and every check that only switches between ALREADY-rendered
workspaces (with an already-settled session for every panel) is blind to it — hence a dedicated
fixture (`verify:panels` 68) built specifically against a workspace this renderer has never
rendered before. **The registry itself is deliberately NOT disposed on switch** — unmounting
calls `detachSlot` (tears down the WebGL host) while the `PanelSession`/PTY/tmux session stay
exactly where they are, which is "two lifetimes, not one" paying out at canvas scale;
`switchWorkspace` contains no `registry.dispose` call anywhere.

**`activateWorkspace` takes the outgoing canvas, and that parameter IS the mechanism
(`main/layout-store.ts`).** `save()` merges into whichever workspace is active WHEN IT RUNS, on
a 500ms debounce — a switch that merely flipped `activeWorkspaceId` would let the next coalesced
save land on the WRONG workspace's on-disk record, well-formed and silently wrong.
`activateWorkspace(id, outgoing)` writes `outgoing` into the OLD record BEFORE flipping the
active id, closing the window entirely. The identical hazard recurs one layer up in
`Canvas.tsx`'s workspace delete (`switchWorkspace` must run BEFORE `workspace.remove`, never
after — main's `remove()` reassigns `activeWorkspaceId` to a neighbour the instant the record is
gone, so an activate afterward would write the doomed workspace's stale panels into whatever
main just made active) and in the only-workspace-left case (a fresh replacement is created and
switched to FIRST, exactly as if it were a pre-existing neighbour). It does NOT apply
`restore.*` settings on either side of the transaction (`applyRestoreSettings: false`) — those
answer "what to show at launch", not "at a switch": applying them made `restore.layout` OFF
silently discard a workspace's panels on the way out and read empty on the way back in, when
main and the renderer both had the real state the whole time.

**Panel ids are global, not per-workspace (`Canvas.tsx`'s `nextIdRef`, `main/layout-store.ts`'s
`allPanelIds`).** `PanelId` doubles as the tmux session name, so two panels in two different
workspaces minting the same id would make the second one attach to the FIRST's tmux session
instead of starting its own — both panels showing one agent's output, with nothing visibly
wrong. `nextIdRef` seeds from `allPanelIds()` (every workspace, not only the active one) at
BOTH boot and every `switchWorkspace`, because a workspace can be switched TO while some OTHER,
hidden workspace holds a higher id.

**The shell insets the canvas, and that's only safe because nothing measures the window
(`Canvas.tsx`, `styles.css`'s `.shell`).** `useViewport`/`Canvas.tsx`/`EdgeIndicators` all read
`getBoundingClientRect()` on the `.canvas` host at event time, and the pip layer carries its own
`ResizeObserver` precisely so `Canvas` needs no window-size state at all — a future
`window.innerWidth` read breaks that silently, aiming pips at the window's edge while the canvas
ends short of it. `verify:panels` 73 pins the exact inset identity (not a loose bound) because a
missing `min-width: 0` on the canvas grid cell would let the canvas overflow while
`getBoundingClientRect` still reports plausible widths for everything. **A known, deliberately
unfixed limitation, now with a dock on it (M46: the navigator's three panes, the context pane,
and whatever comes next)**: nothing observes the canvas host's SIZE, so opening/closing any of these regions
re-tiers NOTHING — a panel just pushed outside the narrower cull region stays live and one just
revealed stays a card until the next pan/zoom/focus change. This is pre-existing (a window
resize has always had this effect); these buttons just make it reachable in one click. The fix,
if ever taken, is one shared `ResizeObserver` (or a canvas-width dependency on the tiering
effect) that all of them would use — don't add a `ResizeObserver` "on the way past" to just one.

**A shell control never takes DOM focus (`shell/shell-control.ts`).** Every button on the bar
and every region toggle mounts `shellControl()`, whose `onMouseDown` calls `preventDefault()` so
focus never leaves xterm's hidden textarea — the alternative (let focus move, then blur back)
has a window where a keystroke goes nowhere. `focusedId` is never cleared by a shell click
either, since `assignTiers` pins the focused panel live and a clear would demote it and strand
the clipboard from a click on a zoom stepper. `stopPropagation` is deliberately NOT called on
mousedown, because a shell click legitimately SHOULD dismiss an open palette (whose own
outside-click listener has already run by then).

**A boolean `SettingDef` mints a palette row nobody wrote, so whatever renders it must
re-read on a signal, not read once at mount (`shell/useShellChrome.ts`).** `shell.railOpen`/
`shell.inspectorOpen` are ordinary booleans, so main's `settings:list` auto-generates a palette
row for each — running that row writes through `settings:set` without touching the shell
directly, so a renderer that read its copy once at mount would persist the write and never
visibly move. `useShellChrome` takes a `settingsSignal` and re-reads on it — the general rule for
anything that renders a setting.

**The rail is always MOUNTED, so its rows are frozen on a signature, not a memo key
(`shell/rail-rows.ts`, `canvas/useRailModels.ts`'s `railRows`).** Collapsing the rail is a CSS class
(`.shell--rail-collapsed`, `display: none` on the list) — `Canvas.tsx` renders `<SideRail>`
unconditionally, so every row stays mounted and reconciled while invisible, and a memo keyed on
`chrome.railOpen` would be keyed on a value that changes nothing about what React has to build.
Rows rebuild on every render (cheap) and their ARRAY IDENTITY is frozen on `railSignature`
(`JSON.stringify` over the rows, never a separator-joined string a user's own title is free to
contain and use to forge a field boundary — `verify:rail` 14). Every model in this codebase that
a component freezes on a signature (`inspectorSignature`, `reviewSignature`, `toolboxSignature`,
`treeSignature`) follows this identical shape: byte-identical on a high-frequency, cosmetically
irrelevant change (every frame of a drag) and definitely different on each real field's own
change, independently.

**The rail navigates; only the start control wakes (`shell/RailPanelRow.tsx`).** A row's body
calls `goToPanel(id)` (frame/select/raise) and never `onSelectPanel` (which also clears
dormancy and wakes) — the same split "Navigating must not wake" states above, reached a second
time. The wake is reachable only through an explicit start control on dormant rows.

**`closePanel`/`startPanel` are palette `actions` members with no palette rows of their own
(`palette/commands.ts`).** The shell reaches the app only through the `actions` object, so a
rail that closed over `registry.dispose`/`registry.wake` directly would be a second
implementation of a verb that already has one authority. They emit no `Command` rows because
both verbs already have a gesture on screen (the panel's own `×`; the "click to start" card).

**One waiting count, and the rail is a view over it (`shell/rail-sections.ts`'s
`waitingCount`).** Computed once and called by both the rail and the palette, rather than each
computing its own expression that could silently drift. The INTERSECTION (this workspace's own
panel ids ∩ the attention set) is what does the real work — a global count reads as "every
workspace is waiting for you", and an id from some other workspace or a phantom (a `wants-you`
panel that's since been closed) must contribute nothing.

**The attention section takes the already-BUILT rail rows, not the raw panel list
(`shell/rail-sections.ts`'s `buildAttentionRows`).** Filtering the queue down to ids that have a
rail row IS the phantom-panel filter, and reading the label off that same row is what stops the
Panels and Attention sections naming one panel differently. It iterates the QUEUE and looks rows
up, never the reverse (which would render canvas order instead of arrival order). It is also
scoped to the ACTIVE workspace only, structurally — a waiting panel elsewhere surfaces only as
the waiting COUNT on its own workspace's rail row.

**The inspector shows the links, not the answer (`shell/inspector-fields.ts`,
`shell/Inspector.tsx`).** The panel header/rail row collapse to ONE label; the inspector
deliberately does NOT — the resolved `command` and the spec's own `asked for` are two SEPARATE
fields, because "why does this say login shell" is answerable only when the user can see both
that the spec asked for nothing AND that main resolved `/bin/zsh`. A merged field would render
something plausible and unanswerable. `cwd` gets the same live/spawn split once a live answer
exists, gated on `isRunning(status)` so an exited panel doesn't go on showing a stale
present-tense value forever.

**One predicate for "running" (`shell/inspector-fields.ts`'s `isRunning`).** `starting` counts
— a panel whose `pty:create` hasn't resolved yet is emphatically a process the user started.
This ONE function is shared by the inspector's summary AND `canvas:counts` (the number main's
own reset-confirmation dialog names before destroying everything) — two independent
derivations of "how many agents are running" would drift the first time one is wrong, at
exactly the moment a spawn is in flight.

**`dispose(id)` returns its kill, and `bumpVersion`/`touch` exist because `ensure()`
deliberately does not (`session-registry.ts`, `Canvas.tsx`'s `restartPanel`).** `dispose` is
`async` and hands back the kill promise so `restartPanel` can await the DESTROY before
re-`ensure`ing — under tmux, `new-session -A` reattaches rather than creates, so a `create` that
overtakes its own `kill` would reattach to the very session the restart meant to replace. This
ordering holds TODAY only because every real link in the chain happens to be synchronous, not by
design — the moment any link becomes asynchronous, the race is live and nothing in this repo's
suites would see it. `ensure()` is normally called from a render and stays silent on purpose;
`restartPanel` calls it from an event handler a tick later, so it must call `bumpVersion()`
itself or the new session's host never mounts. `touch(id)` stamps the eviction-order timestamp
WITHOUT calling `focus()` — a restarted panel joins `assignTiers`' eviction order at the back
otherwise (`ensure` mints at timestamp `0`), and using `focus()` instead would move the
keyboard, which a shell control must never do.

**Restart is dispose-then-ensure at one id, and `clearAgentState` runs FIRST (`Canvas.tsx`'s
`restartPanel`).** Sequence: clear agent state, await dispose, RE-CHECK the panel still exists
(it may have been closed during the await), `ensure(..., { dormant: false })` (explicit, never
inherited), `touch`, `bumpVersion`. **Restart kills unconditionally but only respawns on
PROMOTION**: a restarted panel over-budget or off-screen shows the process die, nothing take its
place, and the Restart control immediately grey out denying it happened — recoverable by
clicking the panel, with nothing on screen saying so.

**Three surfaces close a panel and only one arms a confirm, deliberately (`TerminalPanel.tsx`'s
`handleClose`, the rail's close control, the inspector's "Close panel").** The panel's own `×`
asks once for a running process because it sits where a mis-click while dragging/resizing is
easy; the rail row and inspector button close outright because both act on a panel the user has
already deliberately selected and aimed at a labelled control.

**`kind` is optional on disk, absent means terminal, and a present-but-unknown kind is DROPPED,
never guessed (`shared/layout-schema.ts`, `renderer/panels/panels.ts`'s `isReviewPanel` etc).**
The two halves answer different questions: absent is every file written before the panel-kind
union existed, so a required discriminator would drop every panel in every pre-existing file. A
PRESENT unknown kind (e.g. `"whiteboard"`) was written by a version that knows something this
one doesn't, and guessing `terminal` would spawn a PROCESS in a cwd its author never chose —
dropped with a warning instead, the same individual-drop rule `parseLayout` already states.
Runtime kind tests are POSITIVE everywhere (`isReviewPanel(p)`, never `!isTerminalPanel(p)`),
and `isTerminalPanel` is itself a negation of every KNOWN non-terminal kind (currently
review/file/jira/toolbox) rather than of "the one other kind there used to be" — adding a sixth
kind means widening this negation, or that kind silently falls through and mints a `PanelSession`
for something with no spec (`verify:viewport` 90b/92 pin this across four and five kinds).

**A sessionless panel kind never reaches `assignTiers` or `registry.ensure`, structurally
(`Canvas.tsx`'s partition).** Rather than teaching every consumer (tiering, dormancy, boot
reconcile, eviction, restart) its own guard for each new kind, `Canvas.tsx` partitions `panels`
ONCE into a terminal-only array, and everything downstream of tiering is handed that array — a
sessionless kind is simply not in the input. Closing one must also send NO `pty.kill` for its
id: `Canvas.tsx`'s four panel-removing loops and restart-in-place all branch on kind BEFORE
disposing, which has no positive symptom to notice if missed (a kill aimed at a session-less id
is silently swallowed at every layer below the IPC door), so the corresponding
`verify:panels` checks shadow `PtyManager.kill` and assert the node's id is NOT among the
recorded calls while a REAL terminal panel closed in the same window IS.

**`makeReviewPanel`/`makeToolboxPanel` must not force the minted id into their own `source`
object's identity field (`panels/panels.ts`).** Every OTHER constructor stamps its minted id
into the object it builds, so copying that pattern here (`subject: { ...subject, subjectId: id }`)
is a one-line change that reads as consistency and is catastrophic: it makes a review node's
subject ITSELF, so it asks main to diff a panel that never spawned, gets `never-started`
forever, and renders a well-formed empty state beside a panel that plainly has changes.

**A review node asks by BASELINE, never by panel id (`shared/review.ts`'s `ReviewSubject`,
`IPC.REVIEW_AT`).** Main drops a panel's baseline the instant its session is killed, so a node
querying `review:panel(subjectId)` would work only while its subject stayed open — going blank
at exactly the moment reviewing FINISHED work is most useful. The node instead stores the
repository root, the captured baseline sha, and a snapshotted label; the subject id survives
only for things still genuinely about the panel (excluding it from the shared-repo peer count,
re-reading when its agent goes idle), never for the lookup. This can only be PROVEN by fault
injection (pointing the query at the panel-id form) rather than watched failing against
otherwise-correct code, since with the subject still alive both forms answer identically.

**Commit is porcelain `git commit -m` through a scratch index, never `write-tree`/`commit-tree`/
`update-ref`, and a reconcile step is what stops the user's own index lying afterward
(`main/review-commit.ts`, `main/git-args.ts`).** `commit-tree` runs NO HOOKS, silently
delivering `--no-verify` behaviour the design forbids — porcelain `git commit` under a per-call
`GIT_INDEX_FILE` scratch index (seeded from HEAD via `read-tree`, removed in a `finally`) honours
real hooks. Once HEAD moves and the REAL index doesn't, `git status` in the agent's own shell
reports phantom `D`/`MM` entries — so a fifth call, `update-index --cacheinfo` per committed
path (staged by BLOB SHA read back after the commit, never a wholesale restage that would
clobber the user's own unrelated staged files), reconciles exactly the committed paths. A
SECOND reconcile call, `--force-remove` for paths the commit DELETED, closes the sharper version
of the same phantom (`AD`, staged-as-new for a file the commit just deleted, which an agent
reading it would re-add). A failure AFTER the irreversible commit must never downgrade the
result away from `committed`. Rename detection means committed `paths` must include BOTH sides
of a `git mv`, or HEAD's own old name survives and resurrects a deleted file. HEAD is read
TWICE — before `read-tree` and again immediately before the commit — because the window between
is the ENTIRE duration of a possibly-slow `pre-commit` hook, and a second committer landing in
it must cause `head-moved`, not a silent erasure of their work.

**The nav grid claims `keydown` in the capture phase on `window`, which is invisible to any
input's own bubble-phase self-defense (`navgrid/useNavGrid.ts`).** A review node's commit-message
field and a file panel's editor each `stopPropagation()` every key in the BUBBLE phase to keep
`Cmd+N`/`Cmd+K` from firing while typing — which works against `usePalette`/`useViewport` (also
bubble-phase on `window`) and does nothing against the nav grid's capture-phase listener, which
has already run by the time bubble phase starts. Unguarded, `Cmd+G` typed into an open draft
reveals the grid, the grid's open-branch `default:` arm then swallows every further keystroke,
and releasing `Cmd` switches workspace and unmounts the draft unsaved. The guard has to test the
event's TARGET (`closest('.review-node__commit-form')` / `.file-node__editor`), never
`document.activeElement` — xterm's own helper is itself a `<textarea>`, so an activeElement test
would disable `Cmd+G` over every ordinary terminal panel too.

**The nav grid is this app's first HELD-modifier state, and `blur` is what makes it dismissable
(`navgrid/useNavGrid.ts`).** Every other keyboard path fires once on the down-stroke; `Cmd+G`
stays revealed for as long as `Cmd` stays down, so "is a key still held" is real state for the
first time, with a stuck-modal failure mode rather than a missed keystroke. The commit test is
`event.key === 'Meta'` on `keyup`, deliberately not `!event.metaKey` — the latter's behaviour
against a real physical keyup could not be verified by anything this repo can run (a
synthetic `sendInputEvent` only ever echoes back the modifiers it was handed), so the more
robust test was chosen. **`blur` is required, not defensive**: `Cmd+Tab` is the ORDINARY way to
lose this, not exotic — the user holds `Cmd`, taps `Tab`, macOS switches applications, and the
`keyup` for `Cmd` is delivered to the OTHER application, never this one. A `keyup`-only design
leaves the overlay stuck on screen forever with no key left to dismiss it and no recovery short
of `Cmd+R` (confirmed by fault injection: deleting the `blur` listener leaves every other nav-grid
check green and this one alone red, reporting the overlay genuinely stuck). The overlay takes no
DOM focus (inheriting `usePalette`'s `restoreFocus` would fire mid-workspace-switch), so xterm
still holds focus while it's open — every claimed key must `stopPropagation()` in the capture
phase or a bare arrow reaches the running agent. The four `edit:*` menu accelerators
(`Cmd+C`/`V`/`Z`/`Shift+Z`) are IPC events that never pass through a renderer keydown at all, so
neither the grid's capture listener nor `useViewport`'s guard touches them on their own — they
each independently check `navGrid.isOpen` (alongside `palette.isOpen`) or a held `Cmd+Z` behind
the overlay would silently `dispose` a panel with nothing on screen changing to explain it, and
the workspace switch on release then carries the evidence away. Cell 8 is unconditionally
"More…", never conditional on a ninth workspace existing, for the same reason a disabled
palette row must stay visible (see `verify:palette`'s table entry above): a cell whose position
moves the day it's first needed defeats the muscle memory the whole gesture exists for.
*(The already-active-workspace guard — releasing with no arrow pressed must not call
`switchWorkspace` at all — and the real-hardware `keyup`/`Meta` link are both unverified by any
check in `npm run verify`; see the consolidated list near the end of this section.)*

**Links are adjacency stored on the SOURCE panel (`PanelBase.links`), not a top-level
collection, because of `History<Panel[]>` (`panels.ts`).** `Canvas.tsx`'s undo stack is typed
over the panel array alone; a second top-level `links` collection would force
`History<{ panels, links }>` and a rewrite of the two functions in this file that already carry
the loudest caveat here (`commitHistory`/`applyHistory`, which call `setState` from inside an
updater and are safe only because this app runs without `StrictMode`). Storing a link on its
source panel means undo/redo need zero changes to either function, and persistence is one
optional field beside `title`. The relation is DIRECTED (arrowhead at `to`), so the source is a
real owner rather than an arbitrary choice; the cost, accepted rather than hidden, is that "what
points at this panel" is an O(n) scan and the render layer flattens adjacency every drag frame —
both bounded by `LIVE_BUDGET` already.

**`removePanel` prunes INCOMING links so a close and its links are ONE undo entry
(`panels.ts`).** Outgoing links leave for free with their panel; incoming ones (#24's named
"dangling edge" failure) are what the prune removes, inside `removePanel` itself rather than at
its call sites — both callers are already inside a `setPanels` updater feeding one
`commitHistory`, so the panel and its links leave together and one `Cmd+Z` restores both. The
over-correction guard matters here too: stripping every link from every survivor would satisfy
"the dangling one is gone" while silently emptying the canvas on any close.
`parseWorkspace` prunes AGAIN on load, deriving the surviving panel set from `panels` and NOT
from the parser's internal `seen` set — `seen` looks like the surviving set and isn't, since it's
populated to reject duplicate ids BEFORE the checks (like a missing `cwd`) that can still drop a
panel, so reusing it lets a link name a panel that didn't actually survive.

**The link layer is inside `.world`, beneath the panels, ZERO-SIZED with `overflow: visible`,
and deaf to the pointer (`LinkLayer.tsx`).** Inside `.world` so it pans/zooms/clips with the
panels for free (the opposite of `EdgeIndicators`, a sibling of `.world` because a
viewport-pinned pip must NOT zoom away). Zero-sized because `.world` is a positioning origin with
no width/height and world coordinates are freely negative — a percentage size would clip every
link out of existence with correct-looking geometry still in the DOM. `pointer-events: none` on
the layer is what stops a link swallowing a click meant for a panel or the background (which
clears `focusedId`). **As of M35 the clause "and everything in it" is no longer true** — two
descendants opt back in, and the entry below ("The link layer's guarantee moved from STRUCTURAL
to CONVENTIONAL") is the authority on what replaced it. That the layer actually PAINTS was verified with a real pixel probe against
the built renderer, not a DOM assertion — clipping changes neither geometry nor layout, so
`getBoundingClientRect` reports a correct rect for a layer that draws nothing; if you need to
re-verify SVG paint under a transformed ancestor, verify the capture INSTRUMENT itself first
(a plain sized `<div>` alongside the real element) before trusting a "broken" result, since an
artificial reproduction of this exact scenario once reported the opposite of what the real app
does.

**The link layer's guarantee moved from STRUCTURAL to CONVENTIONAL, and the new
one looks entirely reasonable to break (`styles.css`'s `.link-layer`,
`.link-layer__hit`, `.link-layer__badge`).** Until M35 the rule was one CSS
declaration — `pointer-events: none` on the layer *and everything in it* — and
it was impossible to violate by accident, because there was nothing in the
layer that could be hit at all. M35 needed a link to be hoverable (to reveal
the `×` badge that removes it) and traded that away. **The layer is still
`pointer-events: none`; exactly two descendants opt back in** —
`.link-layer__hit` at `pointer-events: stroke` (the transparent 18px hover
stroke) and `.link-layer__badge` at `pointer-events: all` — and nothing else in
the layer may.

What the invariant BECAME is **"things that can be hit do not consume"**, and it
holds for one specific reason worth stating rather than assuming: **`Canvas`'s
background `onMouseDown` computes its hit from `clientX`/`clientY` through
`toWorld` and `hitTest`, and never reads `event.target`.** So a mousedown that
lands on the hit stroke bubbles to it and behaves *identically* to a mousedown
on bare canvas — the selection clears, `focusedId` clears, a marquee begins.
The badge is the one deliberate exception and DOES `stopPropagation`, because
removing a link must not also deselect the canvas underneath it.

**Any future `stopPropagation` on `.link-layer__hit` silently breaks it**, and
it is precisely the line that would pass review: "stop the click on the link
from also hitting the canvas" reads as an obvious tidy-up. The failure it
produces is the one the old declaration existed to prevent — `assignTiers` pins
the focused panel live unconditionally, so a `focusedId` that never clears
holds a WebGL context and a `LIVE_BUDGET` slot for the rest of the run, keeps
routing `Cmd+C` to a panel the user left, and there is nothing on screen to
explain any of it.

`verify:panels` **127 is the guard, and it was REWRITTEN in place from a
structural claim to a behavioural one.** It used to assert that
`elementFromPoint` at a link's midpoint returned the CANVAS, which M35 makes
false by design. It now drives a real `sendInputEvent` click at a link's
midpoint and asserts the SELECTION moved to `null` — read from
`.panel--selected`'s own `data-panel-id`, never from `__m4aSelection`, which is
the focused terminal's TEXT selection and answers `''` whatever the click did
(the trap that check's own first draft fell into). That is strictly stronger
than what it replaced. It also keeps ONE structural clause — `.link-layer`
itself still computes `pointer-events: none` — because the behavioural half
alone cannot see a revert of the LAYER's own declaration: the topmost element
at the midpoint would become `.link-layer__line`, which carries no handler, so
the mousedown still bubbles and the click still clears the selection. That
particular regression is inert today (nothing in `src/` calls
`elementFromPoint`), and "inert today" is not "inert forever".

**`linkAnchors` clips a ray AND reports the SIDE it left through; `linkPath`
pulls its control points along those two normals (`link-geometry.ts`).** The
clip is M13's and is untouched — take the SMALLER of the two per-axis
parametric crossings and scale the whole ray by that one `t`, never clamp the
axes independently, which is `edgeIndicator`'s documented mistake and which
corners every diagonal while still rendering something that looks like a
working feature (`verify:viewport` 84, with its deliberately shallow diagonal).
What M35 adds is a READ of a decision that clip already makes: whichever of
`tx`/`ty` bound the crossing says whether the anchor sits on a vertical or a
horizontal border, and the sign of `dx`/`dy` says which one. It is new output,
not new arithmetic, which is why checks 83-88 stay green beside it. The
`tx <= ty` tie-break settles the exact-45-degree case toward the vertical
border deterministically — either answer is defensible, and picking one in code
rather than leaving it to float comparison is what keeps `linkPath`
reproducible frame to frame. The `sides` third parameter is RESERVED and
unused: M35's decision 2 chose derived anchors, which is the entire reason
`shared/layout-schema.ts` did not move in that milestone, and the parameter is
there so the deferred half — an edge that REMEMBERS which side it left from —
can be taken later without rewriting the module.

**`linkControls` pushes each control point PERPENDICULAR TO ITS OWN SIDE, never
along the segment, and a horizontal fixture cannot tell the two apart
(`link-geometry.ts`).** Perpendicular is what makes the curve *leave* the
border rather than kink at it. The shorthand — push along the segment direction
— is IDENTICAL to the correct answer for a horizontal pair, which is exactly
the fixture a first check reaches for, so a horizontal-only check passes
against an implementation that never reads the side at all, and every
non-horizontal pair then renders a curve with a visible kink at both ends.
`verify:viewport` **94's fixture is a VERTICAL pair** for that reason, and it
asserts a RELATION (c1 shares x with the exit and lies below it; c2 shares x
with the entry and lies above it) rather than literal coordinates — literals go
stale the instant `CURVE_RATIO` is tuned, and the repair a later reader reaches
for is to paste in whatever the implementation currently returns, which is a
check that can no longer fail. Check 95 pins the clamp at BOTH ends, because a
one-sided clamp passes a one-sided check: unclamped, a short link loops
absurdly and a long one is indistinguishable from a straight line, so the clamp
is what makes the curve read the same way at every distance.

**`SNAP_RADIUS_PX` is screen-space and `CASCADE_STEP` is world-fixed, and both
are right (`link-geometry.ts`, `panels.ts`).** They look like the same decision
made twice in opposite directions, so the reason is recorded at both constants
and here. `CASCADE_STEP` separates a NEW PANEL from a coincident one, and a
panel scales with the zoom — so a world-fixed step keeps the cascade constant
*relative to the panels* at every zoom, always one chrome-height of each card
showing. `SNAP_RADIUS_PX` is the opposite problem: **the user aims with a
cursor, which does not scale.** A world-fixed snap radius would be unhittable
at 0.2x and absurdly grabby at 3x — the same panel would demand a five times
more accurate release depending only on how far out the user happened to be
zoomed. It is divided by `viewport.scale` at the call site in `useLinkDraw`, so
the constant itself stays a screen-pixel number a human can reason about.

**`nearestLinkTarget` checks `excludeId` AFTER a containment match, never
during the scan (`link-geometry.ts`).** The plan's own code had this backwards,
and the difference is invisible on every fixture but one. Filtering the source
OUT of the containment scan means a release still inside the source panel falls
through to the PROXIMITY half — and then resolves to whatever neighbour happens
to lie within `SNAP_RADIUS_PX`, so a drag that overshoots its own border by a
pixel and comes back links a panel it was never released near. Checking the
match and THEN answering `null` for the source is the behaviour the app already
has one gesture over: M13's armed-click handler is
`if (!hit || hit === source) return true` — a click still on the source cancels
rather than retargeting. `verify:viewport` 96's (b) clause puts a neighbour
well inside the radius of a point still inside the source specifically to catch
this; it passes every OTHER clause and looks like a working implementation.
The containment scan also walks `rects` BACKWARD, because `Canvas` hands it
`hitOrderRef`, which is already sorted by `Panel.z` — so a drop over a stack
resolves to the TOPMOST panel, the one the user can see and is pointing at.
That is worth recording precisely because a mismatch between the geometry's
order and the z-order is the obvious thing to suspect here and there isn't one:
`hitTest` and this function agree by construction. A caller that hands it an
unsorted array gets a defensible but arbitrary answer on overlap, silently.

**Every COMMIT decision in `useLinkDraw` reads `gestureRef`, never `state`, and
that was a reproduced defect rather than a precaution (`useLinkDraw.ts`).** The
hook is modelled line for line on `usePanelDrag` — a `depsRef` mirroring the
callbacks so the document listeners install once and never tear down, move/up
on `document` because the cursor leaves the port immediately — with ONE
deviation. An earlier draft had no `gestureRef`: it mirrored `state` into a ref
DURING RENDER, the pattern `focusedIdRef` and `viewportRef` use elsewhere in
this codebase, and had `onUp` read that mirror. **React 18 automatic batching
puts a coalesced `mousemove` and the following `mouseup` in ONE JS task**, so
the `setState` from `onMove` had not been committed by the time `onUp` ran:
`onUp` read the state `begin()` had set — `target: null`, cursor at the PRESS
position — and never called `onCommit` at all. Every link commit was silently
dropped, and the ghost curve looked perfect the whole time, because the ghost
is the one thing that legitimately reads `state`.

`usePanelDrag` cannot hit this, and that is the transferable half: **its own
gesture tracking is already a plain ref with no `useState` anywhere in the
loop.** The `useState` this hook additionally needs (to repaint the ghost and
toggle `.canvas--linking`) is precisely the seam. `state` still exists and
still drives render, one render behind, which is fine for something painted on
screen and fatal for something a commit is gated on. `verify:panels` 174/175
are what reproduced it.

**`linkTarget` is REQUIRED on all five kinds, and requiredness protects only
the components that DECLARE it (`PanelPorts.tsx` and the five call sites).**
`onBeginLink` survived M35's fix rounds by a stronger mechanism than a required
prop: `<PanelPorts>` does not compile without it, so a kind that mounted the
ports had to pass it. `linkTarget` has no such forcing function — it is
consumed by the panel's own root element as `data-link-target`, and **a
component that never declares a prop has nothing to omit, so there is no
compile error to catch the omission.** All four non-terminal kinds shipped
without it and rendered ports that worked, drew a ghost, committed links, and
never once showed a target ring; the gesture looked functional and simply never
told you where it was going to land. Making the prop required on each component
is what turns the sixth kind's omission into a `tsc` error rather than a
missing ring. `verify:panels` 179 is what found it, and it asserts the ring by
the target's OWN `data-panel-id` rather than "does `[data-link-target]` exist
anywhere" — check 58's rule, since a ring on the wrong panel still renders a
ring.

**A SIXTH panel kind needs FOUR edits for links, not one (`PanelPorts.tsx`'s
own doc comment carries the same list, and is the copy that will actually be
read).** Three of the four are exactly what M35's fix rounds found missing
after the first cut, so this is a measured list rather than a careful one:

1. **`isTerminalPanel`'s negation** in `panels.ts` — the standing rule since
   M16, and the one whose omission mints a `PanelSession` for a `<div>`.
2. **A `<PanelPorts>` mount** in the new component, beside its resize handles,
   gated on `readOnly` exactly as they are. Without it the kind is a valid link
   TARGET (the geometry never asks a panel its kind — `verify:viewport` 88) and
   can never be a link SOURCE, which reads as the ports being broken on that
   kind rather than as a kind nobody wired.
3. **A required `linkTarget` prop plus `data-link-target` on the root** — see
   the entry above for why requiredness alone does not reach a component that
   never declares it.
4. **`readOnly={merged}` at the call site in `Canvas.tsx`.** `readOnly` is
   optional-with-a-default on every non-terminal kind, so omitting it compiles
   clean and renders ports in the merged view; see the entry below for what a
   drag there actually writes — corrected in the M35 final review from an
   earlier draft of this note that overstated the damage.

**The merged view refuses links at the VERB now, not only at the affordance
(`Canvas.tsx`'s `linkDraw.onCommit`).** Three mechanisms, in the order they
fire: `readOnly` suppresses the ports so no draw can BEGIN there;
`linkDraw.end()` runs at `toggleMerged`, so a draw begun on the ordinary canvas
and still held when the user enters the merged view is stood down rather than
left painting a ghost across lane space; and `onCommit` early-returns on
`mergedRef.current`. The third is the one added last, and it is there for the
reason the move verb already states — it "refuses on `mergedRef` too rather
than only its palette rows going disabled — a disabled row is an affordance,
and the verb has to be the authority." The guard stays for exactly that
reason: it is still correct, even though the failure it was written to
describe turned out not to be reachable — see below.

**What a dropped `readOnly={merged}` actually reaches, corrected from an
earlier draft that claimed a foreign-panel write.** The earlier text said a
drag there calls `addLink` into the active workspace's record naming a
FOREIGN panel id, persisted and then silently pruned. That path is NOT
reachable, and the reason is `addLink`'s own guard in the FROZEN
`panels.ts` (line 445): `displayPanels` is the merged, lane-translated array
the ports would render against, but `setPanels`'s `current` — the array
`onCommit`'s `addLink(current, from, to)` actually mutates — is always the
ACTIVE workspace's own `panels`, merged or not (`Canvas.tsx`'s `displayPanels
= merged && mergedView ? mergedView.panels : panels`, read only for display).
`addLink` refuses unless BOTH `from` and `to` are already in that array, so a
foreign endpoint on either end returns the SAME array — nothing written, no
history entry, nothing persisted. A dropped `readOnly` cannot smuggle a
cross-workspace link onto disk.

What IS reachable with a dropped `readOnly={merged}` is a drag between two
panels that are BOTH in the active workspace, drawn while the merged view
happens to be showing them in a foreign lane: a REAL write, of a perfectly
ordinary, valid link between two panels this canvas already owns. That is not
data corruption — it is a violation of "the merged view is read-only", the
same category of violation the drag/resize/close/marquee gates on `mergedRef`
already exist to prevent, reached through the one gesture that had not yet
been gated when this was written.

**No check exercises the `onCommit` guard**, and that is stated rather than
implied: ports do not render while merged, so the gesture cannot be driven
through the UI there at all, and a check that reached past the UI to call
`onCommit` directly would be asserting against a fixture rather than against
the feature. `verify:panels` 179 covers the affordance half (ports absent while
merged) for a file panel and a terminal panel; Review, Jira and Toolbox are
argued from the identity of one conditional expression, not observed.

**A draw held across an ordinary WORKSPACE SWITCH — not a merge — is safe for
a reason M35 does not own and did not build (`Canvas.tsx`'s
`switchWorkspace`, `panels.ts`'s `addLink`, frozen).** `toggleMerged` calls
`linkDraw.end()` synchronously, before its first await, precisely so an
in-flight draw cannot survive entering or leaving the merged view (see the
entries above). `switchWorkspace` calls no such thing — a draw begun on
workspace A and still held when the user switches to workspace B via the
rail, the palette, or `Cmd+Shift+]`/`[` is left running with nothing to stand
it down. If the release lands after the switch, `onCommit`'s `addLink(current,
from, to)` runs with `current` now B's own panel array and `from` naming a
panel that belongs to A — a foreign id at the SOURCE end this time, the
mirror image of the merged-view case above. The whole of what stops that
becoming a real cross-workspace write is `addLink`'s own both-endpoint guard
in the FROZEN `panels.ts`, a module M35 deliberately did not touch and does
not own: refuse unless BOTH `from` and `to` are already in the array handed
to it. **A future milestone that relaxes that guard — to allow a link across
workspaces on purpose, say — turns this into a genuine corruption, and
nothing in M35 would notice**, because M35 built no defence of its own here
and the safety is entirely borrowed. While the draw is held across the
switch, `.canvas--linking` stays on (`linkDraw.state !== null` does not care
which workspace is displayed), so every panel in the ARRIVING workspace
reveals its ports via `.canvas--linking .panel__port` and a panel there can
take the target ring exactly as if the draw had started in that workspace.
All of it is cosmetic and clears on the eventual mouseup (which calls
`onCommit` once, wherever it lands, and then always calls the drag's own
`end()`); no data is at risk from the visual half, only from the write
`addLink`'s guard is what actually refuses.

**The ports sit flush INSIDE the border, never straddling it, because `.panel`
carries `overflow: hidden` (`styles.css`).** Found by a failing check rather
than by inspection, and it is not cosmetic. `.panel` clips its own children so
a terminal's content cannot bleed past the rounded corners — so a port centred
ON the border has HALF its hit area clipped away by that ancestor, which puts
its `getBoundingClientRect()` CENTRE exactly on the clip edge, where a real
mousedown resolves to whatever is behind it rather than to the port. The dot is
visible, its box measures correctly, and pressing its own reported centre does
nothing. `.panel__resize--e`/`--s` are already inside for the identical reason.
The four `-7px` margins that centre them are this stylesheet's first negative
margins and `verify:styles` 6 structurally cannot see them (its pattern is
`/^\d+px$/`, so `7px` would fail and `-7px` passes silently) — that is a
centring offset in the idiomatic `top: 50%; margin-top: -half` form rather than
a spacing literal drawn from the scale that check polices, and a later auditor
should not read it as a crack in the tokenised stylesheet.

**The curve's feel and the snap radius are TUNING VALUES with no coverage, and
the hand pass that would settle them HAS NOT BEEN RUN.** `CURVE_RATIO` (0.4),
`CURVE_MIN` (24), `CURVE_MAX` (160) and `SNAP_RADIUS_PX` (90) were chosen by
eye while the module was written. `verify:viewport` 94 and 95 pin that the
curve is pure, perpendicular and clamped at both ends, and say nothing whatever
about whether it LOOKS right; there is no visual regression test in this repo
and that is a stated position rather than an omission. So these four numbers
have exactly the standing this file already gives the `isAutoRepeat` modifier
probe, the `--session-id` transcript filename rule and `agent.idleAfterMs`'s
1500ms default: **provisional stand-ins that let the feature ship and let the
checks exercise a real number, not evidence that any of them sits where the
design intends.** Unlike those three, this one has not even been observed once
— the hand pass is written down as a numbered checklist in M35's task-8 report
and nobody has run it. A future task replacing any of the four with a value
chosen after actually watching a drag is expected, not a regression. Tuning
must not turn 94 or 95 red; if it does, the check was written with literals
after all and that is the bug.

**The completing click for a link is intercepted in the CAPTURE phase, or it wakes a panel
(`canvas/useCanvasPointer.ts`'s `onLinkModeMouseDownCapture`).** Every panel's chrome `stopPropagation`s its own
mousedown, so a bubble-phase listener never sees a click on a panel — which is every click that
can complete a link — and letting one through reaches `onSelectPanel`, which wakes a dormant
panel: completing a link would spawn an agent as a side effect of drawing an arrow. The mode is
ONE-SHOT (the next mousedown anywhere resolves it either way) and `Escape`/`blur` both disarm it,
so unlike a stateful mode there's no way to be stranded in it — the only affordance is a banner
naming the source panel via the honest chain (never a re-derivation from `spec.command`).

**There is deliberately no link SELECTION on the canvas; the inspector is the only surface that
acts on one (`Inspector.tsx`, `buildLinkRows`).** Hit-testing a hairline at `MIN_SCALE` (0.1) is
a sub-pixel target that would exist in code and not on screen, and selecting one would force the
link layer to take pointer events, undoing the guarantee above. Incoming rows list the OTHER
panel as `from` — reversed, the remove/relabel controls on an incoming row silently do nothing,
because the mutator looks for a link on a panel that doesn't hold it.

**A credential never reaches a PTY, and that's STRICTER than `shell-env.ts` on purpose
(`main/credential-store.ts`, `main/shell-env.ts`).** This is the entry most likely to be "fixed"
for consistency, and undoing it deletes the milestone in one line. `shell-env.ts` already hands
every PTY the user's ENTIRE login environment (how `claude` finds its own API key) — that stays,
because it's the user's own pre-existing configuration. The axis isn't sensitivity, it's WHOSE
DECISION it was: a credential in this store is one this app obtained, through a UI this app
built, for a purpose this app performs, so handing it to an agent would be a choice made
gratuitously on the user's behalf. This has NO runtime symptom when broken, which is why
`verify:meta` 21 pins it as SOURCE TEXT: none of `shell-env.ts`/`pty-manager.ts`/
`session-backend.ts` may import the credential store, directly or through
`credential-verify.ts`.

**The store refuses rather than falling back to plaintext (`main/credential-store.ts`'s
`set`).** With the OS keychain unavailable, `set()` fails with a stated reason and writes
NOTHING. A plaintext fallback would be the worst option available, because it's
indistinguishable from success at every surface the user can see (the credential lists, verify
works and returns the account login). A refusal is visible at the moment it happens and
recoverable. Log lines defend the identical rule from a second angle: neither a refusal reason
nor a warning may ever quote the submitted token, even when `encrypt` itself THROWS while
holding the plaintext.

**`credentials.json` is its own file, not a key in `layout.json` (`main/index.ts`).** Reusing
`LayoutStore` breaks three of its own deliberate properties: its 500ms debounce would write a
secret repeatedly at an arbitrary moment rather than once at a moment the user can point to;
hand-editing `layout.json` is a documented SUPPORTED path, so the file people are invited to
paste into an issue must not contain a credential; and a future-version file is copied to
`.bak` rather than dropped on load — correct for a canvas, wrong for a secret.

**There is no `credential:get`, and its absence is the design (`shared/ipc-contract.ts`).**
`credential:list` returns metadata only; the store's `read()` is main-internal with exactly one
caller, `credential-verify.ts`, which uses the secret to make a request and never returns it.
This has no runtime symptom — adding the channel breaks nothing observable, it just puts the
plaintext in the renderer. `verify:meta` 20 pins the `CREDENTIAL_*` channel set as an ALLOWLIST
plus no `cipher` field anywhere `CredentialMeta` is declared.

**Subagent nodes are derived, not a `Panel` kind (`subagent-scan.ts`, `subagent-watch.ts`,
`SubagentLayer.tsx`).** `Panel` is the PERSISTED type with four separate contracts (a
`layout-schema` arm, `layout.save` writing it, `nextIdRef` minting it collision-free, and every
panel-removing surface learning to skip it) — a third kind fighting that contract would need a
fifth signature nowhere near those four (tiering/`registry.ensure` would need to learn a node
holds no PTY). Subagent nodes instead never enter `panels` at all: they're a sibling layer
inside `.world`, rebuilt every launch from the watcher, with no id prefix and no schema arm —
there's no code path from a subagent record to `registry.ensure` to forget to guard, which
`verify:panels` 132 confirms by reading the registry's session COUNT unchanged before and after
a fan-out renders. Cost, accepted rather than hidden: a node can't be dragged, closed, or
selected on its own, and doesn't appear in the rail.

**The slug is a hint; a confirmation read is what makes it safe (`subagent-scan.ts`'s
`slugFor`/`cwdOf`).** Claude Code's own project-directory-slug mapping (replace every character
outside `[A-Za-z0-9]` with `-`) is UNDOCUMENTED and inferred from real directory names that
happened not to contain an underscore or space — a genuine unknown. Nothing trusts the guess: a
claimed session directory is confirmed by reading its OWN transcript's recorded cwd against the
panel's actual cwd, and a mismatch is never claimed however well the slug matched — converting
an undocumented mapping from a CORRECTNESS risk into an AVAILABILITY one (a wrong slug degrades
to no nodes, indistinguishable from "no session yet", the safe direction).

**The subagent poll rides the live-cwd tick, deliberately outside its tmux gate
(`pty-manager.ts`'s `pollLive`).** Not a third timer (merging it with the 500ms idle tick would
coarsen `agent.idleAfterMs` detection). It reads the FILESYSTEM, not tmux, so it must run
UNCONDITIONALLY rather than only when `backend.list()` answers non-null — gating it on tmux
would silently disable this whole feature on the direct backend, a real, shipped, production
configuration.

**A claim follows the panel's SLUG and is re-derived every tick, not made once and trusted
forever (`subagent-watch.ts`'s `PanelState.slug`).** `attributable` recomputes from the live cwd
every tick, but the underlying claim (session directory, byte offset) was made once — so a
panel that `cd`s into a different repository kept rendering the FIRST repository's subagents
forever, a confident WRONG attribution rather than an absent one. `PanelState` now carries the
slug it was claimed from and re-claims on a mismatch. **A known, unfixed limit**: a SECOND
`claude` run in the same shell (same slug, so no re-claim trigger) is never picked up — the
panel's nodes sit `done` forever beside a live agent fanning out beside them. Fixing this would
need re-`chooseSession` on an already-claimed panel, which risks a claim that keeps jumping to
whatever session is newest (adopting a neighbour's conversation) — left alone on purpose.

**`spawnedAt` is the session's, not the client's (`pty-manager.ts`'s `firstSpawnedAt`).** A
REATTACHED session reuses the `spawnedAt` this manager already recorded, because `new-session
-A` makes "this client just attached" and "this process just started" the same call — a
reattached session's Claude Code directory was necessarily created BEFORE this attach.
Without reuse, `chooseSession`'s post-spawn filter (`createdAt >= spawnedAt`) rejects the
panel's own valid session directory the moment `Date.now()` is used instead, and a panel's
subagent nodes vanish at the first `Cmd+R` forever. **Known limit**: after a full app relaunch
(not a reload) this manager holds no prior value, so a session predating the relaunch becomes
permanently unclaimable for that panel — the safe direction (no nodes) either way.

**`detachAll()` forgets the dedupe key, never the claim itself (`pty-manager.ts`,
`subagent-watch.ts`'s `clearDedupe`/`clear`).** A reload's `detachAll()` calls `clearDedupe()`,
never `.clear()` — a full clear would also drop the confirmed session directory and byte offset,
forcing a re-derivation against the reattaching `create()` call's newer `spawnedAt`, which would
then reject the real (older) session directory. This was a real defect once, not hypothetical.

**The record list and the ambiguity count are both CAPPED and the overflow is NAMED, never
silently dropped (`SUBAGENT_CAP`, `DESCRIPTION_MAX`, `slugSharing`).** Nothing removes a record
once added, so the list only grows for a panel's life — capped, with the remainder reported as
`+N more`, the same rule `REVIEW_FILE_CAP` and the prompt-reading caps already state. The
ambiguity sentence's count (`"N panels share this repository"`) is the SAME number `attributable`
refuses on, computed once (`slugSharing`) rather than twice, so the refusal and the sentence
can't drift apart.

**A failed confirmation is remembered; a malformed `.meta.json` deliberately is not
(`subagent-watch.ts`'s `failedClaims`, `ingestMeta`).** A repeated confirmation failure used to
re-derive the same session directory and re-read the same (growing) parent transcript every 2s
forever, getting nowhere — reachable because `slugFor` maps `/` and `-` alike, so two
differently-named directories can share a slug. It's now remembered, keyed on the session
directory judged against, so a genuinely new session is still claimable. A malformed
`.meta.json`, by contrast, is retried rather than remembered — Claude Code writes those sidecars
WHILE this app is listing the directory, so a mid-write parse failure is a race to retry, not a
permanently bad file.

**The file watch is on the DIRECTORY, filtered to the basename — never on the file itself, and
this is the single most important line in the file-panel milestone (`main/file-watch.ts`'s
`FileWatchers`).** Agents and editors write a temp file and `rename()` it over the target,
replacing the inode — `fs.watch(path)` stays bound to the OLD inode and fires once for the
initial truncate or not at all, leaving a panel permanently stale with no error anywhere,
indistinguishable from a watcher that was never wired up. Watching the directory survives the
rename and delivers deletion/re-creation for free.

**A truncated file is READ-ONLY, enforced at TWO doors, because one wasn't enough
(`file-node-model.ts`'s `editable`, `FileNode.tsx`).** `FileResult.content` is capped while
`lines` reports the real count, so saving an edited truncated buffer would delete everything past
the cap while reporting success. The button-disable gate alone missed a second door: the
reseed effect's only conflict test was "not text", and a truncated result IS text — so an
untouched draft could silently reseed itself INTO a truncated state (e.g. an agent appends
40,000 lines while the draft sits open) and then save over the truncated view. The reseed effect
now treats truncation as a CONFLICT (never a silent reseed), and `save()` independently refuses
when `model.editable` is false — neither alone is sufficient, since a draft can arrive at
"now truncated" without the Edit button ever being pressed again.

**The draft lives in the component; `file-store.ts` stays a cache of main's answer, never a
second author (`FileNode.tsx`).** Watcher pushes keep landing while a draft is open; the
component decides not to reseed from them when DIRTY (an untouched draft reseeds freely — a
panel that went stale the moment you opened it to edit is a worse read view — a dirty one raises
a banner instead). The close `×` and a bare `Escape` in the textarea are both armed (one press
shows a warning line, a second press discards) rather than discarding unsaved text outright on
one press, matching `TerminalPanel`'s existing arming pattern rather than a modal.

**`FileWriteResult.mtimeMs` must be ADOPTED after a save, or the very next save reports a
conflict that never happened (`FileNode.tsx`'s `lastWriteRef`).** `file-watch.ts`'s dedupe hash
deliberately excludes `mtimeMs`, so saving byte-identical content (or reverting an edit) still
advances the file's mtime on disk without the watcher sending a push — the store keeps the
pre-save mtime, the next edit seeds `baseMtimeMs` from it, and the compare-and-swap then refuses
a legitimate save with "this file changed on disk" for a writer that doesn't exist. The
component adopts the returned mtime itself, keyed on the CONTENT it wrote so a genuine
third-party write (which changes the content) still invalidates the record correctly.
**Known, unfixed gap**: a workspace switch or reload still silently drops an unsaved draft with
no warning, because the draft lives in component state and a switch unmounts the panel with no
gesture to arm against.

**The toolbox reader is a PROJECTOR, not a passthrough — M14's credential-boundary rule reaching
a second data source (`main/toolbox-scan.ts`).** MCP server `env` blocks, `settings.json`'s
`env`, and free-text hook `command` strings can all carry secrets, so every function here
rebuilds its object field by field (never spreads): an MCP server's `env` values never cross,
`args` are reduced to a COUNT, a hook's command is reduced to its PROGRAM plus a real length —
this has no runtime symptom when broken (a spread would just work, and work with more detail),
which is why it's checked on the returned object's own KEYS (`verify:toolbox` 11/12). Dropping
MCP args entirely is a real UI cost (can't say which npm package a server is) accepted because
any rule that tried to RECOGNISE a secret in an arg string is a rule that can't be written
correctly. `readClaudeJson` reads exactly four allowlisted fields out of `~/.claude.json` (never
a denylist) because `projects[*].history` — the user's own past prompts — was observed present
on one real machine and absent on another; a denylist tuned against either is silently wrong on
the other.

**There is no `toolbox:changed` push, deliberately (pull, not push).** Half this feature's
sources (`settings.json`, `~/.claude.json`, `skills/`, `commands/`) are shared by every panel on
the canvas, so a panel-keyed watcher (the shape `FileWatchers` already uses for file panels)
would arm twelve watchers on the same four paths for twelve panels. Instead a node re-reads on
mount and on its own refresh control, and `readAt` is RENDERED — a pull model that didn't say
when it last looked would be a node confidently showing a config that changed an hour ago.

**`configStamps` stamps individual FILES, not only directories (`main/toolbox-read.ts`).** A
directory's mtime does NOT move when a file inside a SUBDIRECTORY changes — editing
`~/.claude/skills/foo/SKILL.md` leaves `~/.claude/skills` untouched, so a stamp vector holding
only directories is correct for every ADDED skill and permanently stale for every EDITED one,
with nothing on screen wrong. `configStampedAt` is captured at PANEL SPAWN (config is read at CLI
startup) and follows the same reattach rule `firstSpawnedAt` does — restamping on every `Cmd+R`
would clear the staleness flag on a genuinely stale, still-running agent.

**The toolbox node's model differs from the pane's on exactly one decision — the same split
`review-node-model.ts` already makes against `buildReviewFields` (`toolbox-node-model.ts`).**
`no-cwd` is HIDDEN in the 260px pane (which must vanish when it has nothing to say) and RENDERED
in the node (which the user deliberately opened — a node rendering nothing is indistinguishable
from broken). A hook row renders a COORDINATE (its event + matcher + slot), never a synthesised
name like `PreToolUse #2` — a fabricated name in a searchable list starts matching queries it has
no business matching.

**The agent knobs are ONE record (`shared/cost.ts`'s `AgentOptions`), not several optional
fields (`shared/toolbox.ts` and friends).** A permission mode, an effort tier and a model touch
NINE separate places that rebuild a spec or preset field-by-field
(`parsePanel`/`parsePreset`/`templateOf`/`presetFromCapture`/`toPanels`/`fromPanels`/two spots in
`Canvas.tsx`/the `pty.create` payload) — three OPTIONAL fields would be three conditional copies
at each site, and `tsc` sees nothing wrong at any of them since every one is legally optional.
One record and one shared `parseAgentOptions` (called by both the panel and preset parsers, never
pasted twice) makes it nine failure points instead of twenty-seven. Mode and effort are CLOSED
unions (an unrecognised value drops, falling back to the CLI's own — more restrictive — default);
`model` is deliberately an OPEN string with only a leading-alphanumeric-anchor guard, because a
closed model list rots the day a new model ships, and the guard exists only because `claude`'s
own arg parser reads a value starting with `--` as a FLAG rather than as `--model`'s operand
(shareable artifacts like `layout.json` and presets make this reachable, not shell injection,
which is unreachable — args cross as an argv array, never through a shell).

**A second CLI made the record's second half necessary: `AgentKind` and
`AGENT_CAPABILITIES` (`shared/cost.ts`, `main/agent-args.ts`).** With one vendor, the knob NAMES
could double as the flag spellings. With Codex integrated they cannot — `permissionMode` and
`effort` are Claude Code's alone, `sandbox` and `approvalPolicy` are Codex's alone, and only
`model` is shared — so `agentArgs` iterates THAT agent's `flags` table rather than writing the
append out per knob. The failure a per-knob version has is silent in the worst direction: a saved
`permissionMode` on a Codex panel would be passed with Claude's spelling, and a foreign flag does
not degrade — it stops the panel starting at all, from a preset the user saved months earlier
against a different CLI. An unsupported saved field is instead deliberately INERT. Two more
rules of `agentArgs` are load-bearing and each documented at its own line: it is gated on
`spec.agent`, never on the knob, so nothing is ever appended to a command the user typed (the
same refusal `resolveCommand` makes); and a user-supplied flag WINS per flag, because `claude`
rejects a duplicated flag outright rather than ignoring it, so a second `--permission-mode` is
not an override but a failed spawn. `sessionIdFlag` lives in the same table for the same reason
and not as a generic promise — Codex's TUI has no create-session flag, so it gets no synthetic
id and `transcriptAccounting: false`, which is what stops the Cost section claiming a per-panel
figure it has no adapter to earn. The spec carries this as TWO fields, `agent` (the kind) and
`agentOptions` (the record), and both obey the absent-stays-absent rule this file states for
`command`, `title` and `prose`.

**The display reads `session.spec`, never `panel.spec` — safe only because the ONE way to change
a knob is a compound restart gesture (`inspector-fields.ts`, `Canvas.tsx`'s
`restartPanelWithMode`).** `registry.ensure` returns an existing session unchanged, so
`session.spec` is what most recently reached `pty.create`, while `panel.spec` is merely what the
canvas holds — reading the panel could claim a permission mode the running agent isn't actually
in, a confident wrong answer about a permission boundary. A "requested vs. running" split with a
durable record was designed and REJECTED: under tmux a reload's `create()` reconstructs rather
than observes the running argv, so that field would have lied in exactly the case it existed
for. Because restarting is the only mutation path and a restart always re-reads the argv, the
session's spec and the running process cannot disagree without a bare (non-restart) "edit this
panel's mode" ever being added — which would break this silently and is exactly what
`verify:rail`'s fixture (built with the two specs deliberately disagreeing) is pinned against.
Only the two knobs that describe what an agent is ALLOWED TO DO reach the chrome —
`permissionMode` and Codex's `sandbox` — while effort and model stay inspector rows, because a
`bypassPermissions` or `danger-full-access` panel scrolled off screen is the one fact a canvas
built for unattended agents must never make someone hunt for, and cost/quality knobs are not
that fact; the built-in preset is `plan`, never `bypassPermissions`, since the one that ships to
everyone must be the one that can't write.

**The merged view's obstacle is COORDINATES, not `LIVE_BUDGET` (`renderer/canvas/merged-layout.ts`).**
An earlier design doc blamed the global WebGL-context budget for why a merged view couldn't
work; that was simply wrong — `assignTiers` spends the same eight slots whether the canvas holds
one workspace or four. The real obstacle is that every workspace lays its panels out in the SAME
world space around wherever ITS OWN camera has been, so two workspaces' panels overlap by
construction, and `cascadeCentre` can't help (it only separates a NEW panel from a coincident one
within one array). The fix is per-workspace LANE translation on the way to the screen.

**The merged view has no writer, and that's why its geometry is read-only (`Canvas.tsx`'s save
effect, `LayoutStore.mergedWorkspaces()`).** There is exactly one channel into this feature
(`workspace:merged`, a READ) and `panels` remains the only array `layout.save` ever writes — a
merged panel's `rect` is SYNTHETIC (a lane offset for one render) while its id/spec/title/kind
are the panel's own, unchanged copies. Persisting a synthetic rect would write a display offset
into `layout.json` as though it were real geometry, discovered launches later as every
workspace's panels having drifted a lane's width sideways. Drag/resize/close/marquee are all
gated on "merged" refusing outright, not merely a disabled palette row — the verb itself must be
the authority, since a disabled row is only an affordance.

**Entering the merged view resolves dormancy BEFORE it commits — the single most dangerous line
in this feature, and "a workspace switch is a second boot" reached a third door (`Canvas.tsx`'s
`toggleMerged`).** `pty.list()` is awaited BEFORE the merged array and its `dormantIds` commit,
in the same synchronous batch — the identical reasoning as the workspace-switch entry above, at a
worse scale: a merged view can spawn agents in EVERY workspace at once from a bare view toggle,
with no gesture aimed at any specific panel. This was only caught by MEASUREMENT (moving the
commit above the await reproduced it exactly, sessions count jumping and foreign panels reading
`dormant:false spawned:true`), not by argument. Leaving the view re-derives the active
workspace's dormant set from a FRESH `pty.list()` rather than carrying the merged one back.
Clicking a foreign panel's "click to start" card DOES still wake it deliberately — geometry is
read-only, processes are not, and one deliberate click differs from an unattended mass spawn.

**The merge/panel-count refetch is keyed on WHICH WORKSPACES EXIST, not only on this canvas's
panel count (`Canvas.tsx`'s `workspaceListSignature`).** A workspace MUTATION (delete, rename,
create) changes no panel on this canvas, so a refetch effect keyed only on `panels.length` missed
it entirely — deleting a NON-active workspace while merged left its lane rendering panels whose
sessions had just been disposed, and that lane is CLICKABLE: clicking a ghost runs
`onSelectPanel`, which mints a FRESH session for an id no workspace owns any more, reachable from
no UI ever again. The signature is a STRING derived from the workspace rows (id/name/active),
deliberately not the array itself (a fresh identity on every reload proves nothing moved) and
deliberately not the rail's OWN `workspaceSignature` (which also folds in waiting counts and
would refire on every bell).

**A move touches no session and pushes no history, and the history-clearing half is the one the
original design got wrong (`canvas/useWorkspaceVerbs.ts`'s `movePanelsToWorkspace`).** No session/registry call in
the move loop, confirmed by the same `pty.kill`-caller-count regex the rest of the file relies
on. "Push no undo entry" is necessary and NOT sufficient: leaving the PRE-move history intact
meant one `Cmd+Z` after a move stepped back to a state that still listed the moved panel and
DISPOSED it — an agent now belonging to another workspace, killed by an undo in the workspace it
just left. The fix is to CLEAR the history stack on a move, the identical ruling a workspace
switch already makes for the identical reason. **Known, accepted cost**: this also makes every
EARLIER gesture in the canvas un-undoable after a move, with no inverse gesture short of moving
the panels back by hand.

**The marquee starts only where `hitTest` finds nothing, never merely "the background handler
ran" (`canvas/useCanvasPointer.ts`'s `onMouseDown`).** A CARDED (demoted) panel has no chrome handler of its own,
so its press falls through to the background path exactly like empty space — and once
`LIVE_BUDGET` is spent, cards are most of the canvas. Arming the marquee unconditionally in the
background handler would rubber-band every time a user clicks a card, which is the ordinary
case, not an edge one — the guard has to be inside the miss branch of the hit test. It's also
gated off entirely while merged (a band swept across lanes would hand a multi-workspace
selection to a move verb that can't act on it) and ends any in-progress band the instant the
merged view is entered, via a ref-published `endMarquee` rather than merely gating `onMove`
(which would leave the gesture's document-level listeners running past the point they mean
anything).

**Workspace-switch chords match `event.code`, never `event.key` (`useViewport.ts`).** Shift
rewrites the printed character (`Cmd+Shift+]` arrives as `key === '}'`), so a `key`-based test
works perfectly for whoever wrote it and is silently dead for anyone on a different keyboard
layout, where that physical key prints something else under Shift — a failure with no error and
no complaint from the person it fails for, since it simply never worked for them.

**`switchWorkspace` leaves the merged view FIRST, at the source, not in the chord handler
(`Canvas.tsx`).** `workspace.activate` has exactly one call site reached from four different UI
surfaces (rail row, palette row, a test hook, delete-active) — a guard placed in the newest
chord handler alone would leave the other three able to switch away from an open merged view
without clearing it, and every subsequent save would then write the PREVIOUS workspace's
pre-merge camera/selection into the INCOMING workspace's on-disk record.

**One in-flight flag covers BOTH async workspace transitions — switch and merge-toggle — because
either can interleave with the other or with itself (`Canvas.tsx`'s `transitionRef`).** Both are
multi-await sequences (an IPC round trip plus, for a switch, a captured `outgoing` snapshot), and
two overlapping transitions can each write a different workspace's stale panel array into the
wrong on-disk record, or leave `merged` true while `preMergeRef` describes a workspace that's no
longer active. A second transition attempt while one is in flight is REFUSED outright, never
queued (a queued switch would land on a canvas the user has since left) — set synchronously at
entry, released in a `finally` positioned so a throw from the state-writing code can't leave it
permanently stuck (a stuck flag would silently disable both workspace chords for the rest of the
run, which is worse than the corruption it prevents). `deleteWorkspace` is the one caller that
must treat a refused switch as an ABORT rather than proceeding to remove the workspace anyway —
proceeding would remove the still-active record without ever having left it.

**The inspector's Save reads what's DISPLAYED, not what's stored, and this is the one place the
read-only/write-only split runs the other way (`canvas/usePaletteActions.ts`'s `savePanelAsPreset`).** Everything
that acts on what's SAVED reads the stored panel array; everything that acts on what's DISPLAYED
reads the merged/lane-shifted one — Save was on the wrong side of that split, so saving a preset
from a foreign panel while merged silently found nothing and did nothing, an affordance that
lied rather than one that was disabled with a reason. It now reads the displayed array, because
a preset is a pure READ (it writes no workspace record, moves no session, and the panel's own
`w`/`h` are unaffected by a lane offset) — unlike dragging a foreign panel, which remains
refused.

**A move captures `focusedId` BEFORE its own IPC await — a live, unfixed instance of the trap the
marquee entry above exists to prevent (`canvas/useWorkspaceVerbs.ts`'s `movePanelsToWorkspace`).** If focus moves
onto one of the panels being moved DURING the round trip, `focusedId` is left naming a panel this
canvas no longer holds — held live by `assignTiers` forever, with no rect and no row anywhere on
screen to reveal it. The fix (re-read `focusedIdRef.current` after the await, the same pattern
`restartPanel` and `openReview` already use across their own awaits) has not been applied; this
is recorded here as a known, narrow-window gap rather than a shipped fix.

**No file contents ever cross the `fs:list` IPC boundary (`main/fs-tree.ts`, `shared/fs-tree.ts`).**
`readDir` answers names and kinds only — there is no `fs:read` channel and none is planned,
deliberately: a preview of file contents would be a second, silent disclosure channel for
whatever an agent just wrote to disk (this repo's standing rule that any feature moving
terminal bytes off the panel is a disclosure surface).

**Every file-tree row mounts `shellControl`, and here losing it is FATAL, not merely bad
(`shell/FileTree.tsx`).** A file row's whole job is to paste its path into whatever panel DOM
focus currently names — a row that stole focus to itself would read its own click back as the
paste target (a panel with no PTY at all), and the symptom ("clicking a file does nothing") has
no error to point at the missing `preventDefault`. This is the one control in the app where the
`shellControl` convention is load-bearing rather than merely consistent; `verify:panels` 157 is
the only check in this feature that CANNOT be written with a dispatched event, since a synthetic
`MouseEvent` never moves DOM focus regardless of whether `preventDefault()` ran.

**A filename is a wider door than a title (`shell/file-tree-model.ts`'s `treeSignature`).** The
rail's own `JSON.stringify`-over-separator-join rule (see the rail-signature entry above) matters
MORE here: a panel's title is USER text (typed into a rename prompt this app controls), while a
filename is AGENT text (written by whatever CLI is running, into a directory this app doesn't
own, with no rename prompt required) — a wider, easier-to-hit door to the same field-boundary
collision.

**The tree roots on the SELECTED panel and pastes into the FOCUSED one, deliberately different
panels (`canvas/useFileTree.ts`'s `treeRoot`/`insertPath`).** A rail-row click selects without focusing (see
"The rail navigates" above), so a user routinely has one panel selected (browsing) and a
different one focused (holding DOM focus, the `Cmd+C`/paste target) — the tree roots on
SELECTED (browsing shouldn't require re-focusing its terminal) while a paste has to land where a
keystroke would, which is FOCUSED. This split makes the relative-vs-absolute path decision a real
question: a relative path is only guaranteed correct when the paste target and the tree's root
happen to be the SAME panel, so `insertPath` resolves absolute in every other case — a
naive always-relative version is silently wrong (and never errors) the moment the two diverge.

**Two colour blocks, one token set, and the instrument that measures BOTH (`styles.css`,
`verify:styles` 11/`theme.1`/`theme.2`).** M45 replaced the single soft-machine block with a
light block (`:root, :root[data-theme="light"]`) and a dark block (`:root[data-theme="dark"]`)
that declare exactly the same token names. Three things fail silently if undone. A token
declared in one block and not the other FALLS THROUGH: a dark-only `--s-4` makes light hover
fill dark grey, visible only when a user hovers, in the theme the author was not looking at —
`theme.1` diffs the two name sets. Bare `:root` must carry the LIGHT values (`theme.2`), because
the frame before `useTheme`'s first `settings.list()` resolves renders with no attribute, and
`system` resolves to light on a light desktop; a mismatch is a flash of the wrong theme on
every launch, visible once and never reported. And check 11 used to FLATTEN every theme block
into one map, last declaration wins — the M19 stylesheet's own comment names that as the
reason it shipped one block — so a second block was measured only where it overwrote the
first. It now files each rule under every theme its selector list names and measures each
separately, plus the non-text 3:1 rule for the five accents on `--s-1`/`--s-4`. Values are
DERIVED against it: do not nudge one without re-running it.

**A boundary is a LINE, and `--e-*` is elevation only (`styles.css`).** M19 drew depth with
shadow pairs, and its forced-colours block had to restore borders by hand — the design admitting
lines were load-bearing all along. M45 makes that structural: every surface has a `--line`
hairline, and no shadow carries a boundary, which is what lets a dark theme be a VALUES block
rather than a re-derivation of every shadow. The one deliberate survivor from the old grammar is
`.panel--agent-wants-you`'s untransformed `border-color: var(--amber)` (`verify:panels` 62/97
compare it by resolved value); `--amber` may be re-tuned per block and may never become a
gradient or a shadow.

**`appearance.theme` is the schema's first ENUM, and both doors check membership
(`shared/settings-schema.ts`, `parsePreferences`, `layout-store.ts`'s `writePreference`).** The
'enum' type M23's spec removed as customer-free has its customer. `parsePreferences` drops a
value outside `values` with a WARNING, never coerces to the default — the identical rule the
number range uses, for the identical reason: a hand-edited or synced `layout.json` never passes
through `setPreference`, and a value that silently became `system` is a preference that stopped
applying with nothing saying why. A stray value that survived would reach `useTheme`, which would
stamp `data-theme="blue"`, matching no block, and the app would render bare `:root`'s light
values while the row said "blue". The palette renders an enum as a CYCLE row (`Theme: system` →
light → dark, wrapping) through the same `toggleSetting` a boolean uses — it was always a plain
`SettingValue` write — and the menu's `Appearance` submenu is a radio group DERIVED from
`settingsInCategory(APPEARANCE_CATEGORY)`, like Restore's checkboxes.

**The terminal follows the theme through M44's fan-out, and the MENU's write needs an event
(`terminal/themes.ts`, `useTheme.ts`, `session-factory.ts`'s `configure`, `settings:changed`).**
A theme change is `registry.applyTerminalOptions({ theme })`: every session, live AND detached,
and sessions created later inherit it (`verify:registry` `theme.1`, fault-injected to prove a
live-only walk turns it red). `configure()` refreshes an OPENED terminal itself — under WebGL the
option setter re-derives the palette but a fresh paint of every row is what makes the old colours
leave the screen — and a never-opened one paints in the new theme on its first attach, which
`attachTerminal` already forces. `themes.ts`'s `background` must equal the stylesheet's `--well`
for the same theme or the slot shows a seam in the frame before xterm paints; `verify:panels`
`theme.1` reads the card slot's computed background against it. And the menu's radio group
writes through main with NO palette open: without `settings:changed` (main → renderer, sent
after any settings write from either surface) the theme would land in `layout.json` and apply on
the next Cmd+K — a picker that appears to do nothing. `useTheme` re-reads on it, the way glow and
pips re-read on the palette's own reload.

**Icon controls are SVG with `aria-hidden`, 24×24 by measurement, and rail row controls hide by
OPACITY with `:focus-within` (`icons.tsx`, `.icon-button`, `verify:styles` `icons.1`,
`verify:panels` `targets.1`/`reveal.1`).** A glyph icon renders from whichever font the stack
resolves, at its own optical centre and a stroke weight the font chose, and `⚙`/`▶` are
emoji-presentation-eligible; `icons.1` greps the renderer's source for the inventory so one cannot
creep back. `aria-hidden` on every icon because the button already carries `aria-label`, and an
un-hidden SVG is a SECOND accessible name. `targets.1` measures `getBoundingClientRect` on every
icon control rather than trusting a declared size (WCAG 2.2 SC 2.5.8's 24×24). The rail's
rename/close controls are `opacity: 0` at rest and `1` on `:hover` AND `:focus-within` — the
focus half is what keeps them Tab-reachable — and `.rail-row__start` is ALWAYS visible, because it
is a dormant panel's only affordance and a control that disappears is indistinguishable from a
feature that is missing. `reveal.1` reads computed opacity AFTER the `--dur-1` transition: a
read in the same tick as `focus()` is still `0`, which is how the check's first cut went red for
the wrong reason.

**The shell's breakpoint is measured on `.shell`, never on the window, and it is stamped, not
queried (`shell/useShellBreakpoint.ts`, `styles.css`'s `.shell[data-bp]`).** A ResizeObserver
on the shell element names the breakpoint (`compact` < 1100 ≤ `standard` < 1600 ≤ `wide`) as a
`data-bp` attribute; the stylesheet keys its column widths on it and the chrome hook keys the
presence rule on it — ONE source of truth for the thresholds. The spec's most dangerous line
still holds: nothing reads `window.innerWidth`, because `useViewport`, `Canvas` and
`EdgeIndicators` all measure the `.canvas` host at event time, and a window-derived layout
would aim every edge pip at the window's edge while the canvas ends short of it, with nothing
thrown. The observer is on the SHELL, and it touches nothing but chrome state — it is not the
canvas-host observer the tiering note above declines, and adding one "on the way past" here
would still be the wrong place.

**A resident region is a grid COLUMN of real width, and a hidden one is a zero-width column,
never `display: none` and never an overlay (`styles.css`'s `.shell`, `shell/Navigator.tsx`,
`shell/Inspector.tsx`).** Only Compact's transient drawers overlay the canvas, and the
distinction is DWELL: a drawer is dismissed by Escape and by an outside mousedown exactly as
the palette is, while a RESIDENT overlay would put panels permanently under chrome and make
every world coordinate the canvas reports a lie. Zero width rather than `display: none` is
what keeps every pane MOUNTED — its rows stay reconciled and frozen on their signatures
(`railSignature`, `treeSignature`, `inspectorSignature`), and `verify:panels` 73/156 read the
column widths as the inset identity. The navigator shows ONE pane at a time, so
`[data-rail-row]` rows exist only while the Panels pane is up; a check that navigates through
the rail after showing Files has to switch back through the dock, which the tree block does.

**Absent means the breakpoint decides; present means the user won at every width
(`shell/useShellChrome.ts`, `SettingRow.persisted`, `LayoutStore.clearPreference`).** The
preferences map is sparse, so `shell.railOpen` and `shell.inspectorOpen` each have THREE states
without a tri-state type: absent (the navigator is resident at Standard and Wide, the context
pane only at Wide), true, false. `persisted` — "the map holds a key for it" — is what carries
absence across the bridge; a row's `value` alone is the schema default and cannot tell the two
apart. Compact consults neither boolean: both panes are drawers there, opened from the dock or
the chord and dismissed like the palette. `clearPreference` exists so the never-touched state
is reachable again — `verify:panels shell.1` needs it, since every earlier check that toggled
a region left a key behind.

**`inspectorSignature` covers the WHOLE model, hidden tabs included, and inactive tabs are
rendered `hidden` rather than unmounted (`shell/Inspector.tsx`, `verify:rail` 86).** Narrowing
the signature to the visible tab is the obvious optimisation and it freezes hidden tabs stale:
switching to Work would show the totals from whenever the user last looked at Work — plausible,
current-looking, and wrong, the freeze `verify:rail` 75/86 exist to catch reintroduced through
a new door. Keeping the tabs in the DOM is the other half: a hidden panel's figures are as
current as the visible one's the instant it is switched to, and the checks that read
`[data-review-*]`/`[data-usage-*]` off a selected panel still find them whichever tab is up.

**A transient shell surface composes into `shouldIgnoreKeys` — one predicate, never a copy
(`Canvas.tsx`'s `chromeTransientRef`).** A Compact drawer or the Attention popover stands the
canvas's shortcuts down exactly as the palette and the nav grid do; without it `Cmd+N` spawns a
panel behind an open drawer. The outside-click dismissal is the `.shell` capture handler the
palette already uses, with the dock excluded because its icons toggle these surfaces
themselves.

**Close in the context pane is armed, not confirmed (`shell/Inspector.tsx`).** The panel's own
× and this button share one gesture: first click arms (`data-close-armed`, "close?"), second
closes, and a selection change disarms — an armed Close carried to the NEXT panel would close a
panel the user never armed. Never a modal: this app has one modal-shaped surface and keeps it
that way. The M8b reasoning that the inspector's Close needed no gate ("the user aimed at a
labelled control") held for one of five identical buttons a scroll away and does not hold for
a button pinned at a fixed corner, which is a mis-click target. `verify:panels ctx.2` reads the
gate back from the panel list, not off the button.

**One panel frame, and the DOM contract is kept as ALIASES (`components/PanelFrame.tsx`,
`styles.css`'s `.pf-*`, `verify:styles` `frame.1`).** M47 replaced five hand-rolled headers with
`PanelFrame`: a kind supplies its title, its chrome controls, its body and its close arming
rule; the frame owns the box, the chrome row, the close control, the resize handles and the link
ports. Roughly two hundred end-to-end checks select on `.panel`, `.panel__chrome`,
`.panel__title`, `.panel__close`, `.panel__slot`, `.panel__card`, `.panel__resize` and the
`review-node__*`/`file-node__*`/`toolbox-node__*`/`jira-node__*` hooks, so every frame element
carries its `.pf__*` class AND the alias — the duplicates were deleted from the STYLESHEET, never
from the DOM. `frame.1` counts the five families (`__summary`/`__refresh`/`__note`/`__more`/
`__body`) over stylesheet selectors and fails if a kind namespace declares one again; a kind's
element that needs the style takes `.pf__note`/`.pf__summary`/`.pf__more`/`.pf__body--text`
beside its alias. Deleting an alias class "because nothing styles it" turns a dozen checks red
at once, which is the loud version; the quiet version is renaming one and watching a single
check pass vacuously.

**`.pf__body` is never transformed (`PanelFrame.tsx`, `styles.css`, `verify:panels`
`frame.2`).** A transform on the subtree hosting xterm changes what `getBoundingClientRect()`
reports while xterm's cell metrics stay transform-blind — exactly the arithmetic
`pointer-correct.ts` compensates for — and every click in that panel then lands on the wrong
cell with nothing thrown. Zoom-independent chrome (#60) was cut for 1.0; if it returns it
counter-scales `.pf__chrome` and `.pf__handle` and NOTHING below them. `frame.2` reads the
stylesheet for a transform on any `.pf__body` rule and measures a cell through
`__m4aCellToScreen` at scale 0.5, and is written to stay green: it is the guard for whoever
tries.

**One status dot (`.status-dot`, `styles.css`).** The rail's dot, the context pane's dot and the
frame's `.pf__state` share one rule set keyed on `data-agent-state`; the four state colours used
to be repeated across five selector lists, and a fifth copy is how one surface ends up
disagreeing with the panel border about what an agent is doing. `.panel--agent-wants-you` still
keeps `border-color: var(--amber)` untransformed (`verify:panels` 62/97).

**The launcher is keyed on `panels.length === 0`, never on "nothing running", and it calls the
real create path (`canvas/Launcher.tsx`, `panels.ts`'s `firstRunPanels`).** A restored canvas has
no output and no processes until its panels are woken — that is every panel on the canvas the
moment the app relaunches — so a first-run state keyed on activity would appear on top of a
perfectly good workspace (`verify:panels` `firstrun.2` restores one DORMANT panel and expects no
launcher). `firstRunPanels()` returns `[]` since M48: an empty canvas is a designed state, and
the placeholder it used to mint was `SEED_PANELS` with a nicer name. Every launcher control is a
`paletteActions` member — `spawnPreset` through `preset:spawn-by-id`, `openFile`, `beginNewNote` —
so a panel minted there is indistinguishable from one minted by `⌘N`; a hardcoded first-run
panel would diverge from whatever placement and presets decide later, silently. A preset whose
command is not on PATH is present and DISABLED with `REASON_NOT_ON_PATH` and an install line,
never absent: the card is also the answer to "why does Claude not appear".

**The environment report carries key NAMES only, and says when it looked (`main/env-report.ts`,
`env:report`).** It is built by a pure function from facts main already held and printed to
stdout, where nobody debugging "command not found" could see them. Values of the login
environment never cross the bridge — #31's rule, and the credential boundary's: a report is
exactly the artifact that gets pasted into an issue (`verify:tmux` `env.1` feeds a secret in and
asserts it is not in the output). `probedAt` is load-bearing: the probe runs ONCE, so a
`brew install` mid-session is invisible until relaunch, and a report that did not say when it
looked would turn that limit into a lie. The probe's failure used to be swallowed into a
`process.env` fallback with a `console.error`; `shellProbeOutcome()` records it, and the banner
over the canvas is the first place a user ever sees it.

**A gesture hint fades on the STATE the gesture moves, not on the event (`canvas/HintStrip.tsx`,
`Canvas.tsx`'s `markHint`, `hints.seen`).** Pan when the camera's translation moves, zoom when
its scale moves, `⌘K` when the palette opens, `⌘N` when the panel count grows — read off state
Canvas already holds, so no input path needed a hook for a fact it already produced. Written to
`hints.seen` (a LIST setting, the second non-boolean type after M45's enum; both parsers drop a
non-list with a warning) after the list has been READ once — `hintsLoadedRef` — or the first
render's empty set would overwrite a persisted list and every hint would come back on every
launch.

**A font size is a resize wearing a hat: committed, never live, and resolved in the registry
(`session-registry.ts`'s `setFontSizes`, `terminal.fontSize`, `TerminalPanel.fontSize`).**
Bigger cells mean fewer columns, which is a `pty:resize`, which is a SIGWINCH, which is a
full-screen agent TUI repainting its frame — so the palette offers three COMMIT rows (larger,
smaller, default) and the global setting's number row, never a slider: a slider that refits on
every tick is sixty full repaints a second through a 16ms-batched channel. The registry holds the
global size and the override map and configures each session with its EFFECTIVE size, including
a session created later (seeded at `ensure()`, so its first fit is the right one rather than a
fit at 13 followed by a refit and a second SIGWINCH), and refits each LIVE session once per
commit — a detached one has no host to measure and settles on its next attach. **Zoom is not
font size**: the camera's `scale()` is invisible to `getComputedStyle` and the fit, which is
deliberate ("one transform, not N layouts"), and an implementation that reached for the camera
or made zoom adjust font size would turn a working invariant into a reflow storm. `cellSize()`
reads the rendered screen on every call and caches nothing, which is what keeps the pointer
corrector right after a size change; `verify:panels` `type.1` clicks a marker cell for real after
the commit.

**`fontSize` is the sixth field-by-field copy site of the absent-stays-absent rule, and rename
was a seventh nobody had counted (`layout-adapt.ts`, `layout-schema.ts`'s `parsePanel`,
`usePaletteActions.ts`'s rename and `setPanelFontSize`).** A spread writes `fontSize: undefined`,
which survives IPC and reads as present. `verify:viewport` `type.1` pins `toPanels`/`fromPanels`;
`verify:layout` `type.1` pins the parse (present-but-out-of-range costs the FIELD with a warning,
never the panel). Adding the field found that the rename action rebuilt a terminal panel from
four named fields and so silently dropped its `links` too — every link a renamed panel held,
gone on the next save. Both ride along now; a new optional field on `Panel` has to be added to
rename's arms as well as the adapter's.

**Snapping is a pure function over `applyDrag`'s OUTPUT, and its threshold is SCREEN pixels
over the scale (`canvas/placement.ts`'s `snapRect`, `SNAP_PX`, `Canvas.tsx`'s `snapNow`).**
`applyDrag` is the single place a drag resolves to a rect, and it stays pure; `snapRect` takes
its result, every OTHER panel's rect, and a world-unit threshold the caller derives as
`SNAP_PX / viewport.scale` — the same `1/k` relationship `applyDrag` embodies and
`verify:viewport` 27 pins. A world-unit threshold is huge zoomed out and invisible zoomed in,
and both failures look like "snapping is flaky". Nothing snaps to itself (the caller may pass
the whole list); a resize snaps only its growing edges and REFUSES a snap that would take the
size under `MIN_PANEL_W`/`MIN_PANEL_H` rather than clamping into a different size — the shared
validator rejects such a rect, and a canvas holding one cannot be saved. A group snaps as ONE
rect (its members' bounding rect) and the delta shifts the cursor's world point, so every member
moves by the same amount: snapping members individually would shear them apart mid-gesture, the
failure `applyGroupDrag`'s own entry names. Guides live in `.world`, like the link layer, so they
ride the one transform; they are cleared on commit. `placement.snap` turns the whole thing off,
because a user aligning by eye against a snap is fighting the app.

**Tidy compacts WITHOUT reordering and WITHOUT resizing, in ONE undoable step
(`placement.ts`'s `tidyPanels`, `usePaletteActions.ts`'s `tidyPanels`).** Rows are formed by
the panels' current vertical overlap, ordered top to bottom, and packed left to right from the
selection's origin — a panel that was left of another stays left of it. A tidy that sorted by id
would destroy exactly the information the canvas was carrying (panels grouped by project), and
one that resized could produce a rect under the floor. Sizes are the input's, so the floor is
structurally safe, and the result is idempotent (`verify:viewport` `tidy.1`). One
`commitHistory` for the whole arrangement: twenty panels moving is one gesture to undo, not
twenty — the same rule a drag and a rename follow. The palette row acts on the selection when
two or more are selected and on everything otherwise, disabled with a reason on a lone panel.

**A hover is corrected per event against the slot under the cursor; only main opens a link, and
only on Cmd (`components/xterm-pointer.ts`, `terminal/session-factory.ts`'s link provider,
`main/link-open.ts`, `link:open`).** Pointer correction was anchored to a slot pinned at
mousedown, so a hover — no mousedown — returned early uncorrected, a limit the file recorded for
years and which became user-visible the moment link underlines followed the hover: at any zoom
≠ 1 the underline sat over the wrong cell, and a link that underlines the wrong cell is worse
than no link. M51 resolves the slot for each hover event and corrects it exactly as a drag's
move; the pin is still released, so a stale pin cannot outlive a gesture, and a hover outside
any slot passes untouched (the HUD's world cursor keeps seeing originals). `verify:panels`
`hover.1` sends a REAL mouse move at 48% zoom and reads the provider's hover off the host —
fault-injected (hover left uncorrected) to prove it lands cells away. Activation is Cmd-click
ONLY: agent TUIs use clicks. The renderer sends the underlined TEXT and the panel id; main
resolves (`resolveLinkOpen`, pure: http/https only, a path against the panel's cwd with `~`
expanded and `:line:col` stripped, existing files only) and opens through `shell` — never a
navigation, because `will-navigate` kills every PTY in the window. Opening AT a line needs an
editor integration this app does not have; the result's reason says so rather than pretending.

**A panel's state is ONE word from ONE function (`renderer/panels/panel-state.ts`), and
every surface that says what a panel is doing reads it — the rail row, the frame's pill,
the card's state line, the summary and block tiers, the attention popover, the inspector's
pinned label.** Before M63 the same panel read `dormant` in the rail, `idle` on its pill and
`click to start` on its card, each file locally consistent, and the drift was invisible until
a screenshot put two of them side by side. The tone (`data-tone`) is a closed set bound to a
hue in ONE stylesheet block; the state edge (`.pf::before`), the dots and the far tiers all
read `var(--tone)`. Undoing either half fails silently in the same way it did: a new surface
spells its own word, or a new rule binds `--amber` to its own selector, and nothing errors —
`verify:rail state.2` reads the tree as text for the words and `verify:styles tone.1` for the
hues, because neither has a runtime symptom. `railTail` is now a wrapper over `panelState`
with no agent state (a live process reads `running`); the ROW applies the agent state it
subscribes to, which is why `RailRow` carries `state` and why the signature does not carry
the agent word.

**The spawn sheet's directory is checked with `expandTilde`, never `resolveCwd`
(`main/index.ts` `spawnWith`, and the same stub in `verify-panels.cjs`).** `resolveCwd` falls
back to the home directory when a path is missing — right for a restored panel whose
directory went away, and exactly wrong for a path a person just typed: the sheet's first
check run spawned two panels at `~` from a typo and refused nothing, because the fallback
made the missing directory look present. The refusal names the path and is shown in the
sheet; nothing spawns. The recent-directories list is recorded in the `pty:create` handler,
not in the sheet's, so `⌘N` and a menu pick count too — it is "where panels start", and a
list fed only by the sheet would be a list of where the sheet was used.

**Known manual-only verifications, not covered by any automated check.** Each of these was
confirmed once, by hand, against a real machine/keyboard/CLI/build rather than by anything
`npm run verify` re-runs — treat a green suite as silent on each of them, not as proof:

- **The real OS attention surfaces (M43)** — `new Notification(...).show()` and its click
  handler, `app.dock.setBadge`, and `shell.beep`, all wired in `main/index.ts`. No suite reaches
  them: `verify:pty-manager` drives a FAKE `AttentionSink` and counts its calls. That a real
  notification appears when the window is behind another, that clicking it focuses the window and
  flies to the panel, that the dock shows the count, and that the beep uses the user's own alert
  sound were each confirmed once by hand.
- **`scrollback.persist` off in the REAL main process** — `main/index.ts` wires the sink's
  `enabled()` and the `scrollback:tail` gate to `layoutStore.getSetting('scrollback.persist')`,
  and no suite runs that line: `verify:pty-manager` drives the sink with a fake `enabled()`, and
  `verify:panels`' harness wires `enabled: () => true`. That turning the setting off stops the
  append and makes a restored card show no recorded lines was confirmed once by hand.
- **Auto-repeat guards** (`verify:panels` 7b/33b/75b/153 and siblings) prove only that the code
  *reads* `event.repeat`; that a physically held `Cmd`-modified key actually sets that flag on
  macOS/Electron was confirmed once via a throwaway `sendInputEvent` probe using the
  `isAutoRepeat` MODIFIER STRING (not a top-level field, which is silently ignored).
- **The nav grid's `Cmd+Tab` dismissal** (`useNavGrid.ts`) relies on a physically released `Cmd`
  emitting a `keyup` with `key === 'Meta'` while the window has focus — unverified beyond
  argument, since a synthetic `sendInputEvent` only ever echoes the modifiers it's handed.
- **The nav grid's already-active-workspace guard** (a release with no arrow pressed must not
  call `switchWorkspace`) was verified once with a throwaway call counter never checked into
  any suite; nothing renderer-visible distinguishes a same-id switch from a true no-op.
- **`safeStorage`'s actual OS-level protection** (a Keychain ACL bound to the app's code
  identity) is unobserved by `verify:credentials`, which drives the store against an injected
  fake crypto — and this app's own unsigned beta builds (`identity: null`) bind that ACL more
  weakly than a signed release would; re-verify against a signed build before trusting it.
- **A real GitHub PAT verify** was confirmed once by hand against a real token: the row's title
  moved from the default label to the account's real login, and `credentials.json` on disk held
  a `cipher` field, no `token` key, and zero plaintext token patterns. The REJECTION path (a
  revoked/under-scoped token) has only ever been exercised against a fake fetcher.
  `verify:panels` 130 deliberately makes NO real network request, by probing `verify()` before
  any credential is stored (hitting an early guard) — `npm run verify` must stay offline.
- **`webUtils.getPathForFile` resolving a Finder drag's real path** cannot be exercised by any
  synthetic `dataTransfer` (which carries no OS-backed `File`); `verify:panels` 134 drives the
  same mint function through a test hook instead, which proves the rest of the pipeline and
  nothing about the drop gesture itself.
- **The `--session-id <uuid>` flag causing Claude Code to name its transcript `<uuid>.jsonl`**
  is an assumption about another program's undocumented behaviour, observed once on one Claude
  Code version. No suite spawns a real `claude`; a future release changing this makes the whole
  Cost feature go silently and permanently quiet (never an error) with every suite still green.
- **The exact flag spellings for `--permission-mode`/`--effort`/`--model` and their accepted
  values** were read off `claude --help` once, on one CLI version. `agentArgs` never appends a
  flag to a user-typed command (see "An absent `command` must stay absent"), but a future CLI
  rename of an accepted value turns every panel using that mode into one that fails to spawn,
  with every suite here still green, since none of them spawn a real `claude`.
- **A dispatched `KeyboardEvent`/`MouseEvent` never proves what a REAL keypress or Finder
  interaction does, only what the handler under test does** — this shows up repeatedly (nav
  grid keyups, palette focus-restore after close, `ReviewNode`/`FileNode` draft-close focus
  restore, `shellControl`'s focus-preservation): a synthetic event is `isTrusted: false` and
  Blink performs no default action for one, so any check built from `dispatchEvent` can at best
  show the guard reads the right flag, never that the platform sets it the way assumed.
- **Native dialogs (M55, M58) and the URL scheme (M54)** — the orphan-recovery
  `showMessageBox`, the two export `showSaveDialog`s and the Finder reveal, `open-url` on a real
  packaged build with a real link, and `setAsDefaultProtocolClient` registering the scheme with
  Launch Services: no suite drives a native dialog or Launch Services. Each was exercised by
  hand once at 1.0 on one machine, no more.
- **The OS reduced-motion preference (M56)** — `matchMedia('(prefers-reduced-motion: reduce)')`
  is read in production and OVERRIDDEN in the harness, which proves both answers of the flight
  code and nothing about the media query on a real machine.
- **Whether a rail row's agent-state glow comes from that row's own per-id subscription (the
  design) or from one list-level read passed down** — both paint identical DOM, and no test in
  this repo can tell them apart without adding an impure render-counting side effect to
  production code, which was deliberately declined.
- **The real `claude` behind an agent session (M71).** `claude-cli-runner.ts` against the
  installed CLI — a turn, a tool call whose permission request was answered on the wire, an
  interrupt mid-turn, `--resume` after an exit — was driven once by hand under plain node
  (`docs/build-log/m71-agent-session.md` carries the transcript). No suite spawns a real
  `claude`; `verify:agent-session` replays streams recorded from 2.1.259, so a CLI release
  that changes a record type shows up as the session's `unknown` counter, and one that
  changes a flag shows up as `exited` with the CLI's own stderr — never as a red suite. The
  `deny` branch of a permission response has only the SDK's documented shape behind it.
- **The summary tier's Allow/Deny (M76).** The card's far tier renders the question with its
  verbs; no suite drives the camera below `SUMMARY_ENTER` and clicks one. The `approval` scene
  is a picture at scale 1.
- **A chat's OS notification (M76).** The tracker is proven against a fake sink (`approve.1–.3`):
  that the real toast is titled `claude asks to run <tool>` with `<dir> needs you` beneath,
  and that its click frames the chat panel without waking anything, was never observed by a
  suite — the same standing as the M43 surfaces above.
- **Every pixel (M61–M70).** `npm run shot` renders twenty-five scenes and asserts nothing;
  each milestone's look was a person's (and a fresh-context critic's) reading of the PNGs,
  recorded in the build logs. A green `npm run verify` is silent on how anything LOOKS —
  the state edge's hue, the minimap's legibility, the compact drawer at 1000px on a real
  display, the dark theme's hairlines — and the harness renders one machine's Chromium at
  one device pixel ratio. The minimap's drag on a real trackpad (a preview, then a flight on
  release) was confirmed once by hand; `verify:panels overview.2` drives a synthetic click.

**A note is a file panel in PROSE mode, and refusing a sixth `kind` is the
whole of M27's design (`shared/file-panel.ts`'s `FileSource.prose`).** Every
panel kind this app had was a read-out of something the machine already knows —
a diff, a file, a config, a ticket, a process. A note is the first that is a
place the user puts thought, and the temptation is to make it a kind. It is not
one, because a note is not a different sort of THING from a file panel: same
`FileSource`, same `file:read`/`file:write`/`file:close`/`file:changed`, same
directory watcher, same compare-and-swap M22 hardened. What differs is how it
is painted and that it opens in edit mode, and both are display facts.

The ceremony that buys is worth listing, because each line of it is a silent
failure this file already records: `isTerminalPanel` would gain a sixth
negation (miss it and a note gets a `PanelSession`, a `LIVE_BUDGET` slot and a
WebGL context for a `<div>`), BOTH `nextIdRef` regexes would need a sixth
prefix (miss one and duplicate panel ids are dropped silently at the next
load), five `registry.dispose` guards would need a sixth arm, and three store
clears a sixth site. All of them are already correct for `kind: 'file'` and
none of them moves. `verify:panels` 94's two source-text counts — five
disposes, two `pty.kill` callers — are UNCHANGED by this milestone, which is
the fact to check before "fixing" that number.

**The rail still says `note`, through a DISPLAY kind rather than the union's**
(`rail-rows.ts`'s `RailTailKind = Panel['kind'] | 'note'`). The tail is the one
place the distinction is worth making to a user — the rail is how a panel is
found again — and deriving it in `buildRailRows`, which holds the panel, rather
than inside `railTail`, which is handed a bare kind, is what keeps every other
caller of `railTail` untouched. Build it as a kind the day notes diverge for
real (markdown rendering, backlinks, an index); not before, which is
`AgentKind`'s own rule and `ideas-backlog.md` #11's.

**`prose` is `true` or ABSENT, never `false`, at five copy sites.** The
absent-stays-absent rule `command`, `title` and `agent` each already record,
reaching a fourth field: `parseFileSource`, `toPanels`, `fromPanels`,
`makeFilePanel` and `Canvas.tsx`'s `openFilePanel` all copy it CONDITIONALLY.
A spread writes `prose: undefined` into `layout.json`, where `'prose' in
source` reads TRUE for a file panel that was never a note. `parseFileSource`
accepts only an exact `true` and drops anything else — dropping the FIELD and
keeping the PANEL, which is the toolbox `label` precedent rather than its own
all-or-drop `path` rule: a path is the fact a file panel is made of, a note
flag is a display convenience, and losing the panel over one trades a wrong
view for no view at all. `verify:layout` 150-152, `verify:viewport` 93.

**`createFile` uses `wx`, and that is not a stylistic preference
(`main/file-create.ts`).** `writeFileSync(target, seed, { flag: 'wx' })` asks
the kernel to create-or-fail atomically. The obvious `existsSync` check
followed by a write is a TOCTOU, and in THIS app the racing writer is an
autonomous agent working in the same directory — so the race is the ordinary
case rather than an exotic one, the same reasoning `review-commit.ts`'s
HEAD-moved guard already records. `verify:file` 20 is the check, and its
second clause is the whole of it: the existing file's BYTES are unchanged.
Asserting only the refusal passes against an implementation that refused the
caller and clobbered the file anyway, which is `verify:file` 12's own rule for
the write path and `verify:credentials` 6's for the credential store.

**An existing name RE-PROMPTS rather than opening the file.** "Create" and
"open" are different acts, and silently turning one into the other is how a
user ends up appending to work they did not know was there. `exists` is its
own arm rather than a `failed` for the same reason `refused` and `failed` are
split in `review-commit.ts`: the fix is to rename, not to go and look at the
filesystem. The re-prompt reaches the user through `InputMode.feedback`,
and `beginNewNote`'s `prompt` MUST call `palette.openPalette()` alongside
`setInputMode` — Palette.tsx closes the overlay before calling submit, so a
mode set on a closed palette is wiped by Canvas's own clear-on-close effect.
That is the pairing `beginRenamePreset`, `deletePreset` and `beginEditSetting`
all already make, and it was watched failing here: `verify:panels` 176
reported the palette back in command mode, so a duplicate name silently did
nothing at all.

**`noteRoot` is deliberately NOT `treeRoot` (`Canvas.tsx`).** The tree roots
on a terminal panel's cwd or a review node's repo root and answers null for a
file panel, which is right for browsing a project. It is wrong for notes for a
reason that only appears in use: creating a note SELECTS it, so the very next
New note row would be disabled by the note just made, and a second note would
need the user to go back and re-select a terminal. `noteRoot` therefore falls
back to a selected FILE panel's own containing directory. The tree is left
alone rather than widened, because re-rooting it on a file panel is a change
to M20's behaviour this milestone has no business making on the way past.
Found by `verify:panels` 176 failing with the row DISABLED, not by reading the
code — and the same fact is what makes that check re-select the terminal panel
before its duplicate attempt, since otherwise the same relative name resolves
under `notes/` and is a perfectly legitimate create.

**A note auto-enters edit mode exactly ONCE (`FileNode.tsx`'s
`autoEditedRef`).** Not on every render where `draft === null`: re-entering
there would make Escape appear to do nothing, since the effect would reopen
the draft the user had just discarded. It is gated on `model.editable` for the
same reason the save path is — a truncated or non-text note must not open an
editor whose save the gate will then refuse — so such a note opens as a read
view, which is the honest answer rather than a degradation. M22's truncation
gate is inherited UNCHANGED: `prose` is a rendering fact and `editable` is a
safety one, and treating "notes are for writing" as a reason to bypass the
gate would let a save delete every line past `FILE_MAX_LINES` while reporting
success. `verify:rail` 111.

**The editor keeps the `.file-node__editor` class, and that is load-bearing.**
`useNavGrid`'s target test names that class, so a note inherits the guard with
no edit. A new `.note-node__editor` would have silently reopened the
documented failure: `Cmd+G` typed into a draft reveals the grid, the open
branch's `default:` arm swallows every further keystroke, and releasing `Cmd`
switches workspace and unmounts the panel with the draft unsaved.

**No markdown rendering, and the refusal is the same one `parseFrontmatter`
already makes.** A renderer means a new runtime dependency this repo declines,
or a hand-rolled parser whose failure mode is a PARSER DIFFERENTIAL — this app
rendering what its own parser says while the user's real markdown tool says
something else, which is invisible rather than merely wrong. The value here is
the place to write, not the formatting.

**M27 adds ONE invoke: `file:create`.** Deliberately not a flag on
`file:write`: a write is a compare-and-swap against a file that EXISTS and a
create is refused precisely BECAUSE one does, so sharing a door would turn
`baseMtimeMs: null` — the deliberate force-overwrite a user reaches only after
seeing a conflict — into an accidental create. This milestone's own branch
recorded a before/after channel count here, and both halves of it were stale
within two merges: the SCRIPT is the authority, which is why the number is no
longer written down in this paragraph at all.

**`verify:file` checks 7 and 9 were flaky before M27 touched them, MEASURED at
5 failures in 20 runs on unmodified main.** `fs.watch` arms asynchronously on
macOS, so `watch()` returns before FSEvents is delivering and a rename or an
`rmSync` issued on the very next synchronous line can land unobserved —
nothing about `FileWatchers` is wrong. A fixed sleep is what this repo refuses
everywhere else, so both now RE-DRIVE the real gesture until it is observed;
each iteration is a genuine atomic write or a genuine delete, so what is
asserted is unchanged, and the naive `fs.watch(path)` implementation check 7
exists to reject still fails because no repetition rescues a watch bound to a
dead inode. 0 failures in 20 runs after. **Checks 8 and 10 carry the same race
and are NOT fixed**: both are NEGATIVE assertions, so the race makes them pass
for the wrong reason rather than fail, and closing that means proving the
watcher is live with a probe write and asserting a delta — a larger edit to
checks whose subject M27 does not touch. Recorded in both checks' own comments.

**What M27 did NOT solve, kept honest.** No markdown rendering, no note index,
no backlinks, no search. A workspace switch or a `Cmd+R` reload still takes an
unsaved draft with it — M22 records that limitation, and a note auto-entering
edit mode makes it MORE reachable rather than less, so it is restated here
rather than left as M22's footnote. And a note with no panel selected is
unreachable: the row is present and disabled with its own reason rather than
falling back to `$HOME`, because a note dropped in the home directory is not a
note about anything.

**`method` is REQUIRED on `JiraRequest`, and that requirement is what makes a
write checkable offline (`main/jira-client.ts`).** The requester is injected —
`review-engine.ts`'s `GitRunner` trade, reached by a second door — so
`verify:jira` can assert the URL, the headers and the POSTed body of a real
write with no network anywhere in earshot, which is what keeps `npm run verify`
the repo's one fast, offline green-or-not signal. That only works if the method
is a field somebody has to fill in. Declared optional with a GET default it
still type-checks at every call site, and a write function that simply forgot to
set it performs a **GET against a POST endpoint** — which Jira answers
successfully, with the issue's own JSON, so nothing throws, no arm reports a
failure, and the comment is never posted. The panel says "comment added". The
ticket does not have one. Required makes `tsc` list every call site instead of
silently defaulting the one that was missed, and `verify:jira` 6 is what fails
if the field is ever softened back.

**`refused` is not a flavour of `unavailable`
(`main/jira-client.ts`'s `JiraWriteResult`, `statusFailure`).**
`review-commit.ts` already draws this line for a repository's own hooks — a
`pre-commit` saying no and git failing to run are two situations with two
different fixes — and a workflow board is the same shape one service further
out. Collapsing them sends a user to check their network when their BOARD is
what said no, and the wrong direction is the common one: on a correctly
configured, fully reachable Jira, `refused` is the arm that happens
**routinely**, because a workflow legitimately forbids most transitions from
most states. So `refused` carries **Jira's own sentence** rather than a phrase
this app invented — "Transition is not valid for this issue" is a thing the user
can act on and a thing this app cannot derive, the identical reason
`review-commit` carries a hook's output verbatim. **404 is `refused` too, and
that is deliberate rather than sloppy**: Jira answers 404 for an issue the
account may not browse, precisely so it does not disclose that the issue exists,
so it is a permission answer wearing a not-found status — and its fix is "check
your permissions", never "check your connection". Only a status that is neither
a rejection nor a refusal falls through to `unavailable`. `verify:jira` 12.

**And the READ obeys the same mapping, through the same function — which it did
not until M24's final review.** The helper was called `writeFailure` and the
transitions read carried a second, narrower copy of the rule inline
(`if (response.status !== 200) return { kind: 'unavailable' … }`), so one 404 on
one issue answered `refused` from a write and `unavailable` from the read of
that same issue: the exact two-situations-one-signal collapse this milestone was
scoped to avoid, on the path a user reaches FIRST, since clicking `Move…` is
what fetches the list and the fetch is where "you cannot move this ticket" is
DISCOVERED at all. It is now one `statusFailure(response, okStatuses)` shared by
both, renamed off "write" so its scope is legible, and `JiraTransitionsResult`
gained the `refused` arm in BOTH of its declarations (`jira-client.ts` and
`ipc-contract.ts` — a duplication this repo accepts and which is itself an
argument for unifying the three Jira result types in a follow-up). Two copies of
one rule agree the day they are written and drift the first time only one is
edited, which is what happened here. `listAssignedWorkItems` deliberately still
maps its own statuses inline: its union has no `refused` arm, and a 404 on a JQL
SEARCH is not a per-issue permission answer, so widening it is M19's surface
rather than this milestone's. `verify:jira` 14 pins the agreement as an EQUALITY
between the read's arm and the write's rather than against the literal
`'refused'` — a check written against the literal stays green when one side is
later changed and the other is not, which is the drift it exists to catch.

**Transitions are read per issue, on demand, and folding them into `jira:list`
is the mistake that never looks like one (`listWorkItemTransitions`,
`IPC.JIRA_TRANSITIONS`).** A transition list is workflow-defined per ISSUE, so
there is no single answer `jira:list` could carry — it would have to fetch one
per ticket, on every panel load, for every ticket including the ones nobody is
ever going to move. At the 50-ticket cap `jira:list` already sets, that is 51
requests where there was 1, against somebody else's rate limit, to populate a
menu almost nobody opens. It is `review:diff`'s arithmetic exactly: the file
list rides the answer already coming, and one file's hunks are PULLED when a
user asks. The failure is not a crash — the panel merely takes many seconds to
load and the tenant's API budget drains — which is why the shape is written down
rather than left to be rediscovered. The fetch is also where "you cannot move
this ticket" is DISCOVERED, before a button that would fail is ever offered.

**No agent-reachable path triggers a Jira write, and it is pinned as SOURCE
TEXT (`verify:meta` `jira-write.2`).** This is M14's asymmetry one service further out, and
the axis is the same: `shell-env.ts` hands every PTY the user's own login
environment on purpose, and that must stay — but a write to somebody else's
ticket tracker, through a credential THIS APP obtained, is a decision the app
would be making gratuitously on the user's behalf. It matters here more than in
most apps for this app's own reason: every panel is an arbitrary LLM-driven CLI
running as the user, so a path from agent output to a Jira write is a path from
a hallucinated sentence to a comment on a colleague's ticket, under the user's
name, with no gesture anywhere. **The rule has NO runtime symptom when broken** —
add such a path and the app works exactly as it does now, plus one capability
nobody asked for — so behaviour cannot check it and source text does.
`verify:meta` `jira-write.1` is the allowlist half (the `JIRA_*` set is exactly
four, so a fifth cannot arrive unremarked) and `jira-write.2` is the import half.
(Both arrived numbered 22 and 23 and were renumbered to scoped ids on merge —
main had independently taken those integers for the M27 audit's own checks, which
is precisely the collision check 22 exists to catch.) **Both of `jira-write.2`'s
limits
are stated rather than hidden**, in its own comment and here: it does not follow
a SECOND hop, so an offender reaching `jira-client.ts` through some other,
non-Jira module is unchecked; and its three-file offender list is a HARDCODED
SNAPSHOT of "the modules that build a process environment" as of M24, so a
fourth such module added later is unchecked BY CONSTRUCTION until somebody adds
it to that array. A green run means these shapes hold. It is not proof the rule
holds.

**`.jira-node__comment-form` is the THIRD entry in `useNavGrid`'s target test
(`renderer/navgrid/useNavGrid.ts`).** `.review-node__commit-form` was the first
and `.file-node__editor` the second, and every text surface added to this app
inherits the same diagnosis: that listener is CAPTURE-phase on `window`, so it
has already run by the time the field's own bubble-phase `stopPropagation` could
help. Unguarded, `Cmd+G` typed into a comment draft reveals the nav grid, the
open branch's `default:` arm then swallows every further keystroke so the field
goes dead, and releasing `Cmd` switches workspace and unmounts the panel with
the comment unsent — three failures from one missing selector, and the user's
text is simply gone. The test is the event's TARGET and never
`document.activeElement`, because xterm's own helper is a `<textarea>` and an
activeElement test would disable `Cmd+G` over every ordinary terminal panel.
**A FOURTH text surface will need the same line**, and there is nothing that
will remind whoever adds it: the omission compiles, renders and reads correctly
until somebody happens to press `Cmd+G` while typing.

**`textToAdf` is deliberately no more capable than `adfText`
(`main/jira-client.ts`).** Jira Cloud's v3 comment endpoint requires Atlassian
Document Format going in, and the tempting move is a Markdown-to-ADF converter —
this is a developer tool, developers type Markdown. It is the wrong move,
because the READ half is `adfText`, a flattener that produces plain text: a
richer writer invents structure the reader cannot round-trip, so a comment stops
reading back as it was typed. The user posts a fenced code block and the panel
re-reads it as a run-on line; they post a list and it comes back as prose. This
app does not own ADF, and the honest size of the subset it should write is
exactly the subset it can read. `verify:jira` 7 asserts the pair as a ROUND TRIP
rather than as two independent guesses, and its fixture carries a BLANK LINE
between paragraphs — the case a naive one-paragraph builder loses.

**A comment is sent by a human gesture, and both draft exits restore focus —
which no check can observe (`renderer/jira/JiraTicket.tsx`).** The draft is
per ROW, which is why `JiraTicket` is its own component rather than more JSX
inside `JiraNode`'s `.map()`: each row needs its own draft, its own fetched
transition list and its own in-flight flag, and per-row state means per-row
hooks, which cannot live in a loop. The input is the fourth surface in this app
to take DOM focus off xterm, so it is heir to rule 4 of "Who owns the keyboard":
an unmounting input's blur leaves focus on `<body>`, where every subsequent
keystroke goes nowhere at all. Both exits — a successful send, and toggling the
control shut — therefore close through one `closeDraft`, which restores focus to
the panel captured when the draft OPENED, captured rather than read at close
time for `usePalette`'s reason. **Nothing in `npm run verify` can see this**:
DOM focus after an unmount is a browser default action an untrusted event never
performs, the same limit `verify:panels` 47 and 75c each record from their own
sides. Delete the `restoreFocus` call and every suite stays green. A rejected
invoke lands in an arm rather than being swallowed, for a symptom of its own —
an unresolved promise leaves the row reading "sending…" forever — and a
successful transition RE-READS rather than patching the row in place, so the
screen cannot claim a state the server never confirmed.

**What M24 did NOT solve, kept honest: the four `edit:*` chords reach the
FOCUSED PANEL from inside an open text draft, on all THREE of this app's text
surfaces.** `Cmd+C`, `Cmd+V`, `Cmd+Z` and `Cmd+Shift+Z` are main-process MENU
ACCELERATORS delivered as IPC events (`main/menu.ts` -> `Canvas.tsx`'s four
`edit:*` subscriptions), so they pass through NO renderer keydown at all — a
draft's own bubble-phase `stopPropagation` cannot touch them, and neither can
`useNavGrid`'s capture-phase listener, which is why the `.jira-node__comment-form`
entry above covers the keydown half thoroughly and this half not at all. All
four gate on `shouldIgnoreKeys()`, which is `palette.isOpen() || navGrid.isOpen`

**The flush is capped by bytes and the cap keeps the TAIL (`main/pty-manager.ts`'s
`FLUSH_MAX_BYTES`, `enqueue`, `flush`).** Batching solved message COUNT — thousands of
reads become one send per 16ms — and did nothing about message SIZE, so `yes`, `find /`
or an agent `cat`ing a large file joined a multi-megabyte string every frame and stalled
the renderer in exactly the way the batcher exists to prevent. Three rules, each with its
own silent failure. **Whole chunks are dropped from the HEAD**, and only a single chunk
larger than the whole cap is sliced (to its last cap characters): a chunk boundary is where
node-pty already cut, and a cut inside one lands mid-escape-sequence. **The tail survives**,
because the flush-before-exit rule exists so the last lines a dying process prints — the
error explaining the exit — are not lost, and a head-preserving cap drops precisely those;
`verify:pty-manager` `backpressure.2` is the guard. **The elision is TOLD to the user in the
stream**, as one `[terminal-canvas: N KB of output elided]` line prepended to the next flush
with attributes reset first — a user debugging missing output otherwise has no way to learn
bytes were dropped, which is the same silent failure every entry in this file is written
against; `backpressure.1`. The scan for bells runs on every byte BEFORE buffering, so a bell
in a dropped chunk was still counted. The cap is a constructor parameter with the constant
as its default so the suite can force it low; against the real 256 KB cap a 180 KB fixture
elides nothing on a fast read and everything on a slow one, which is a check that passes or
fails by the weather.

**xterm measures widths against Unicode 11, loaded in `createTerminal` before `open()`
(`renderer/terminal/create-terminal.ts`).** The built-in table is Unicode 6, under which
every emoji status glyph and post-6 box character an agent TUI draws is one column narrower
than the shell believes — the frame drifts a column per wide glyph and compounds down the
pane, in a way that reads as the TUI's own fault, which is why backlog #43 sat unattributed.
It loads in the one place a `Terminal` is constructed, before `open()`, and never later:
changing the width table after the fact is a re-measure of every buffered line that would
need `attachTerminal`'s `refresh(0, rows - 1)` treatment. Nothing about the grid moves — no
`pty:resize`, no SIGWINCH — which is the whole difference between this and a font change.
`verify:xterm` `unicode.1` asserts the cursor advances TWO cells after one grinning face;
`activeVersion` alone would pass against an addon that was loaded and never activated.

**`onContextPasted` and `LinkLayer`'s `onRemove` are stable identities, and the memo they
protect has no runtime symptom when broken (`canvas/Canvas.tsx`).** `onContextPasted` was an
inline arrow on every `TerminalPanel` — a new function on every Canvas render, and Canvas
renders on every mousemove — so every panel's memo re-rendered at 60Hz regardless of
`version`, `title`, `glow` and M35's `onBeginLink`/`linkTarget` discipline, every one of which
exists to protect that memo. `onRemove` was `paletteActions.removeLink`, whose identity
follows the palette's captured id, so the link layer re-rendered on every palette open
despite its own comment naming that as a case the memo stops. Nothing throws and nothing
looks wrong; the app gets heavy while a panel is dragged. Both are `useCallback`s with empty
dependency lists — the second reads `paletteActions` through a ref — and `verify:panels`
`memo-stable.1` pins the JSX as source text, because that is the only place the defect is
visible.

**A worktree record OUTLIVES its panel, and attachment is COMPUTED, never stored
(`shared/layout-schema.ts`'s `WorktreeRecord`, `main/ipc.ts`'s `worktree:list`).** M37's
records are a sibling of `baselines` and `sessions`, keyed by their own id and carrying the
panel id that spawned them, and NOTHING clears that panel id on close. Two paths depend on
it. Restart-in-place is dispose-then-ensure at the SAME id, so a `kill()`-time detach would
hand the restarted panel a brand-new worktree and quietly abandon the branch it was on.
Undoing a close restores the same id, which must land back in its own worktree. Whether a
record is attached is therefore answered at list time — its `panelId` is in some workspace's
panel list or it is not — and the manager's `forPanel(panelId, root)` reuses a detached
record for the same id in the same `root`. The `root` clause is the guard: a recycled panel
id in a DIFFERENT repository creates a new worktree, so no panel is ever spawned into a
stranger's branch. A closed panel's worktree is thus a directory with a branch on it, listed
in the palette as detached, which is exactly what "merged deliberately" needs.

**The worktree decides the cwd BEFORE the baseline is captured, and that is why the review
engine needed no change (`main/pty-manager.ts`'s `create()`, `main/worktree-manager.ts`).**
`worktreeFor` runs first, `cwd` becomes the worktree path, and everything downstream —
`captureBaseline`, `configStamps`, the spawn itself, `PtyCreateResult.cwd` — sees an ordinary
directory inside an ordinary repository root. `resolveRepo(worktreePath)` answers the
worktree's own root (`rev-parse --show-toplevel` does), `stash create` runs there, and
`baselinePeers` counts by root, so two panels in two worktrees of one repository are two
ATTRIBUTABLE answers where they used to be `shared`. The panel's `spec.cwd` stays the
REPOSITORY cwd the preset asked for; the worktree path lives on `PtyCreateResult`, which is
the inspector's existing `asked for` / `cwd` split. Move the worktree resolution below the
baseline capture and the snapshot is taken in the main checkout while the agent works in the
worktree — every review of that panel then reports the wrong tree's changes, confidently.

**The worktree lives under `userData`, never inside the repository (`main/worktree.ts`'s
`worktreePath`).** Inside it, the worktree would be untracked files in the main checkout's own
`git status`, and the review engine's `ls-files --others` would list a sibling agent's whole
worktree as THIS agent's new files. The parent directory carries a hash of the root so two
repositories sharing a basename get different parents, and the leaf is the branch with `/`
replaced, because a path component cannot hold one.

**A worktree is refused loudly, and removed only without `--force` (`main/worktree-manager.ts`,
`renderer/shell/inspector-fields.ts`).** A panel that asked for a worktree and could not get
one — not a repository, an unborn HEAD, git unreachable — spawns in its requested cwd AND
carries the refusal on `PtyCreateResult.worktree`, which the inspector renders as one row
reading `refused — <reason>`; the three states (never asked, active, refused) render three
different things, and the first renders nothing. `worktree:remove` runs `git worktree remove`
with no `--force`, for the reason `review:commit` runs no `--no-verify`: a dirty tree is
refused with git's own sentence and the directory survives. The branch is never deleted by
this app — deleting an unmerged branch is the one irreversible act in the feature, and it is
the user's, in git, once they have merged.

**Quit survival is opt-in, and the flush sits between teardown and shutdown in BOTH arms
(`main/quit.ts`'s `runQuit`, `shared/settings-schema.ts`'s `session.keepOnQuit`).** M38 made
`before-quit` a choice: `end` (the default) is `killAll()`, `flushSync()`, `shutdown()` —
exactly M4c's sequence — and `keep` is `detachAll()`, `flushSync()`, and NO `shutdown()`, so
the clients die, every tmux session stays on the socket, and the next launch's boot
reconciliation (which already reattaches every session whose panel the layout knows) brings
the agents back. Two things are load-bearing. **The default is OFF**, decided rather than
defaulted into: a person who quits an app expects its processes to stop, and an agent left
burning tokens behind a quit is the surprise the setting's own description names; the author
who wants the opposite is one palette row away. **The flush stays AFTER the teardown in both
arms, and the keep arm has its own reason**: the boot orphan-killer ends any session whose
panel the layout does not know, so a flush that ran before a store write landed would be an
agent killed at the next launch for not having been written down yet. `detachAll()` schedules
no writes today; `flushSync` after it keeps that true by construction. The setting is read AT
quit time, never captured at boot — a captured value would freeze the toggle until the next
launch, which is the "setting that silently does nothing" shape this repo has paid for before.
`runQuit` takes its collaborators injected because `app.on('before-quit')` is unreachable from
any suite; `verify:pty-manager` `keep-on-quit.1`/`.2` run the real sequence against a real
server on the verify socket, and `.1`'s discriminating clause is the pane pid: a kept session
reattaches at the SAME pid, where a killed-and-respawned one would not (check 20's rule).
Two limits stay as they were and are recorded rather than fixed: `firstSpawnedAt` after a
relaunch falls back to now, so a kept `claude` panel's subagent nodes are unclaimable until
its next spawn; and a reattached session's detector starts at `starting`, so a kept agent that
is mid-question shows no `wants-you` until its next bell.

**The scrollback log is an append stream written from the flush, and it is NOT
`layout-store.ts`'s pattern (`main/scrollback-log.ts`, `main/pty-manager.ts`'s `flush()`).**
M39 writes one append per 16 ms flush — the same string the renderer was sent, elision marker
included — through a per-panel promise queue, so order is preserved and the flush path never
waits on disk. The layout store's write-temp-then-rename is right for a few kilobytes of state
twice a minute and exactly wrong for a byte stream from twelve processes: copied here it would
rewrite the whole file every 16 ms. This is the app's third "state that survives a relaunch"
and it is legitimately a different shape. Retention is the feature rather than a footnote: a
file past 1.25× `SCROLLBACK_MAX_BYTES` is trimmed to its last cap bytes at a line boundary,
inside the same queue so a trim can never race an append; `verify:file` `scrollback.3` pins
the bound as 1.25× and NOT "the cap at every instant", because the file legitimately grows
between trims and a bound of the cap would demand the per-append rewrite the design refuses.
The `enabled()` gate is read per flush, never captured, so the `scrollback.persist` toggle
takes effect on the next flush rather than the next launch. **A closed panel's log is dropped
in `kill()`** beside its baseline and its session pin: search over closed panels is not a
promise this app makes, and this is what keeps the directory bounded by the canvas — a
restart-in-place therefore starts a fresh log, matching its fresh process.

**A dormant card reads the log; a spawned card reads its buffer (`session/scrollback-store.ts`,
`TerminalPanel.tsx`'s `PanelCard`).** The tail is fetched from main ONCE per dormant panel,
through a per-panel store that never bumps `registry.version()`, and shown ABOVE "click to
start" rather than instead of it — the lines say what the panel was doing, the prompt says how
to resume it. A spawned panel keeps reading `handle.tail()`, the live truth. Nothing renders
while the tail is unanswered or empty, so a card never flashes a blank block, and the store is
cleared at every panel-removing site like every store beside it. The tail answers `[]` when
persistence is off — even for a log written before the toggle — so a card never shows lines
from a record the user asked not to keep. `verify:panels` `scrollback.1` reloads on the DIRECT
backend so the process dies and the panel restores dormant: the state every panel is in the
moment the app relaunches, and the one M39 exists to make non-blank.

**The secret scrubber exists before its first customer, and it is applied to nothing local
(`shared/redact.ts`).** Backlog #31's rule is that the answer to "agents print secrets" must
exist BEFORE a feature moves a byte off the panel, and M39 is the first that does, so the
scrubber lands here and M48's export is its customer. It is deliberately applied to nothing in
this milestone — not the live terminal (the user's own screen), not the local log (marked by
the setting's description rather than redacted). Detection is heuristic and fails toward the
user: every match becomes a placeholder naming its kind, nothing is dropped silently, the count
comes back; a bare hex sha, a UUID and the word "token" are never touched, because an export
that redacts a commit sha is one nobody can act on. `verify:usage` `redact.3` pins the
over-match direction, which is the failure a scrubber grows into.

**Broadcast has three exits and ONE guard (`Canvas.tsx`, `useBroadcastChord.ts`,
`usePaletteActions.ts`).** M31 shipped the mode with a single way out — find the palette
row again — which is a dead end for whoever armed it from the chord M40 adds (`Cmd+Shift+I`;
`Cmd+Shift+B`, the obvious spelling, is NOT free: `useShellChrome` matches `KeyB` without
testing Shift, so it toggles the tree). The banner's Stop and the chord both call
`toggleBroadcastInput` through `paletteActionsRef`, the same verb the palette row runs, so
the "two live selected terminals, or the mode is already on" rule lives in one function and
the three doors cannot disagree in the cases nobody tests. The banner is `pointer-events:
none` so it never eats a click meant for the canvas beneath it; the Stop control alone opts
back in, and it mounts `shellControl` so the press never moves DOM focus off the terminal
that is still receiving the keystrokes — AND it stops the mousedown's propagation, which no
other shell control needs: the banner is the one control INSIDE the canvas host, so its press
otherwise bubbles to `useCanvasPointer`'s background handler, which hit-tests the world point
under the banner, selects the panel beneath or clears the selection and starts a marquee, and
releases focus. `broadcast.2` went red on exactly that — Stop had cleared the two-panel
selection, so the chord that followed was refused by its own guard. No first-time confirmation: the mode is visibly
armed (a banner with a count, M13's "an armed mode must never be invisible"), it is
reversible with one key, and a confirm on every arming would cost the four-agent case its
whole point. `verify:panels` `broadcast.1` is the end-to-end proof, read from the M39 log
rather than any renderer hook — a keystroke into the focused member lands in BOTH panels'
logs, a real click on Stop ends the mode, and the next keystroke lands in one.

**A handoff edge WAKES its target, and that overrules M25's refusal for this one kind, in
writing (`renderer/canvas/useHandoff.ts`, `shared/handoff.ts`).** M25's restart-on-exit
refuses to wake a dormant target on purpose: a saved rule must not launch an agent merely
because another panel exited while the user was away. A handoff rule is the opposite ask —
the user drew the link and chose "when A completes, hand B its output", so STARTING B is the
rule's whole meaning. `useHandoff` therefore calls `registry.wake` (dormant/never-spawned) or
`restartWithSpec` (exited) for a handoff target, and restart-on-exit keeps its refusal
untouched beside it. Four consequences are load-bearing. **The payload is a bracketed
`handle.paste`, never `write`** — the fourth surface to reach this rule after the file panel,
the review commit draft and the Jira comment: a raw write submits every newline as a separate
line into the agent, firing fragments before the context arrives. **Delivery waits for a
target that can RECEIVE, not merely one that is running**: a woken target has no fitted
terminal until tiering promotes it (the fit-before-spawn rule), and pasting into a `claude`
that has not left `starting` loses the paste — so the payload is queued in a ref and delivered
by the agent-state transition listener when the target leaves `starting`, plus one short
settle. **The queue is never persisted**, for the reason the broadcast mode is not: it is
in-flight state, and a saved queue would re-deliver a stale payload on the next launch; an
entry older than `HANDOFF_QUEUE_MS` (5 min) is dropped with its own sentence. **Both bounds
are named where the rule is made** — the inspector row states `last 200 lines`, because a user
must never learn the cap from a silently truncated paste. The idle trigger rides a new
`onAgentTransition` fan-out on the agent-state store rather than a second `agent.onState` IPC
subscription — the single-subscription rule the store already enforces for its per-id and
attention readers.

**One automation per link, and a handoff REPLACES a restart rule rather than stacking beside
it (`shared/handoff.ts`, `panels.ts` `setLinkAutomation`).** `PanelLink.automation` is a union
of the two kinds, not a collection: a link is a directed pair and carries one meaning, so the
mutator `setLinkAutomation` (which `setRestartOnExit` is now a thin call into) sets or replaces
the one rule, and the cycle check reaches across BOTH kinds together — a handoff A→B on `idle`
plus a restart B→A is an infinite ping-pong, refused at creation and stripped on load exactly
as a same-kind cycle is. A `nextHandoffState` three-state cycle (off → on exit → on idle → off)
drives the inspector's handoff control, whose title names the NEXT state because a cycle button
labelled only with its current state leaves the user guessing what a press does.

**Search is the LOG read by main, and the id list is main's — never the renderer's
(`main/scrollback-log.ts` `search`, `main/ipc.ts` SCROLLBACK_SEARCH, `renderer/palette/commands.ts`).**
M42 is the reader M39's durable log was built for: before it, an xterm-backed search found
nothing on a restored canvas and did so silently. Three things are load-bearing. **The handler
supplies the panel ids from `mergedWorkspaces()`, never from a renderer argument** — a closed
panel's log is already dropped, and a search that accepted ids could ask for a log the layout no
longer holds; this is the SCROLLBACK_TAIL rule reached again, the bytes staying main's until
something wants to show them. **Search is gated on `scrollback.persist` exactly as tail is** —
it reads the same files, so a user who turned persistence off gets nothing rather than stale
hits from a log they asked not to keep. **A hit moves the CAMERA, never the terminal**: Enter on
a row runs `goToPanel`, the switcher's verb, which frames and selects but never wakes and never
scrolls a live terminal to the match — scrolling a running session is a real side effect this
repo already asserts the absence of, and the matched line is visible in the row itself. The
palette owns the query (its input box IS the term) and reports it to Canvas only while the scope
is `search`; Canvas debounces 120 ms, asks main, and CLEARS the answer when the scope leaves, so
a reopened palette starts from null (no answer yet) rather than stale hits — the null-vs-`[]`
distinction the three empty states depend on (off / no matches / nothing typed yet).

**Main owns `wants-you` and every out-of-window surface is a READER; the reload SNAPSHOT is a
no-op and must not be claimed otherwise (`main/pty-manager.ts` AttentionSink/`syncAttention`,
`main/index.ts`, `main/window-lifecycle.ts`).** M43 hangs the dock badge, an OS notification and
a beep off the SAME detectors M6d built, through an injected `AttentionSink` so the whole
decision path (when to notify, when to beep, the window-focus gate) runs under plain node in
`verify:pty-manager`; the real `Notification`/`app.dock`/`shell.beep` live in `main/index.ts` and
are on the manual-only list. Nothing here CLEARS a state — focus (`agent:acknowledge`) and a
`pty:write` stay the only two clearers, so a notification click frames the panel (through
`goToPanel`, the `Cmd+J` never-wake path, over the new `attention:jump` EVENT — an event, not an
invoke, so `verify:ipc`'s count is unmoved) but leaves it amber until the user clicks in. **The
snapshot (`resendStates()`) is the milestone's one dead end, and it is documented as one**: a
Cmd+R reload runs `detachAll()` from `window-lifecycle.ts`'s `did-start-navigation`, which
DELETES main's `Session` objects and their detectors (the tmux processes survive), so at
`did-finish-load` there is nothing to re-emit and the reattaching sessions get fresh
`starting` detectors. `resendStates()` is kept as a cheap, correct-shaped method and called
there for fidelity, but it restores no attention across a reload — and a check that "proved"
it would only pass because the verify harness does not wire `window-lifecycle`, the same
harness-not-app trap check 32 records. `verify:panels` `attention.1` therefore tests the one
path that works: a dispatched `attention:jump` frames and selects an off-screen panel and spawns
nothing.

**The canvas host is FOCUSABLE (M44), and any guard that read `activeElement === body` must
also accept it (`Canvas.tsx` host `tabIndex`/`role`, `useSpaceHeld.ts`).** M44 gave the host
`tabIndex={0}` and `role="application"` so `Cmd+Escape` can land DOM focus there and `Tab` can
walk the chrome. A silent consequence: a background CLICK now focuses the host, so
`document.activeElement` after a background click is the host, NOT `<body>` as it was for the
life of the app before. Every guard that armed only when "nothing is focused" by testing
`activeElement === body` breaks — `useSpaceHeld`'s space-pan arm did exactly that and
`verify:panels` 176 caught it. The fix is to treat the host as canvas-focus: `useSpaceHeld`
arms when the active element is null, body, OR the element with `role="application"`, because
focusing the canvas IS canvas focus. A FOURTH such guard added later inherits this and nothing
will remind whoever adds it.

**Keyboard traversal moves SELECTION and never wakes; only the deliberate second key wakes
(`renderer/canvas/useKeyboardNav.ts`, `spatial-order.ts`).** `Cmd+Arrow` runs
`nearestInDirection` (pure: candidates in the half-plane ahead, scored `along + 2*perp` so
dead-ahead beats nearer-but-sideways) and frames the result through `goToPanel` — the
switcher's verb, which raises and frames but NEVER wakes, because `assignTiers` pins the
FOCUSED panel live unconditionally and arrowing across a restored twelve-panel canvas with
focus attached would spawn a PTY per step and blow `LIVE_BUDGET`. `Cmd+Enter` is the second,
deliberate key: it runs the CLICK path (`onFocusPanel` — clears dormancy, spawns, focuses).
This is the same "dormancy outranks focus, and a wake is a separate deliberate act" rule the
registry is built on, reached from the keyboard.

**`registry.applyTerminalOptions` is the ONE fan-out of xterm options across every session,
present and future (`session-registry.ts`, `session-factory.ts`).** It accumulates the options
and applies them to every existing handle's `configure` AND to every handle created afterwards,
so "all terminals" genuinely means present and future. `configure` on a handle whose terminal
does not exist yet stores the options as PENDING and applies them when `createTerminal` first
runs — it must not `ensure()` a Terminal into existence just to set a font size on a carded
panel that has never gone live. M44's screen-reader toggle is its first caller; M45's theme and
M49's font size are meant to reuse it rather than each writing a one-off loop.

**Main INJECTS the OSC 133 hooks and main SCANS for the marks; the renderer only paints them
(`main/shell-integration.ts`, `main/agent-state.ts`'s `scanChunk`, `pty-manager.ts`,
`session-factory.ts`).** Two halves that could each have lived in the renderer, and each
would then fail without a symptom. Injection is main's because main is the only party that
knows which shell `resolveCommand` picked for an ABSENT `command` — the renderer sees a
panel spec with no command and cannot tell zsh from bash, and an agent CLI must never be
decorated (the same rule that keeps `--session-id` off a typed command). Scanning is main's
because the ledger (`run-ledger.ts`) is written from `PtyManager.flush()`'s byte path,
where `scanForBell` already ran: `scanChunk` is that scanner widened to carry an OSC
accumulator across chunk boundaries, since a mark split over two `pty:data` batches is the
ordinary case at 16ms batching, not the edge. The renderer registers its own xterm OSC 133
handler purely to place markers and decorations — it reads the same bytes, so the two
never disagree on WHERE a boundary is, but only main's copy records anything. The rc files
are written idempotently at every spawn (compare, then write) into
`userData/shell-integration`, and zsh's shim restores the user's own `ZDOTDIR` through
`TC_ORIG_ZDOTDIR` before sourcing their files, so a user's `.zshrc` runs unchanged and
first. A spec with NO `args` (the harness seed, any programmatic `create({ panelId, cwd })`)
must inject rather than throw: an unguarded spread of `args` threw inside `create()` BEFORE
the spawn, and because `verify:panels` awaits its seed create ahead of arming the watchdog,
the whole suite hung silently with zero checks printed — `verify:tmux shell-integration.2`
pins the absent case.

**The run ledger is an append stream that records NO terminal bytes (`main/run-ledger.ts`,
`shared/run-ledger.ts`).** A row is `panelId`, `command`, `cwd`, `startedAt`, `endedAt`,
`exitCode` — the command text is what the shell reported in its `133;C` mark,
percent-decoded, and that is the whole payload. Output never enters the file, by type:
`RunRow` has nowhere to put it, the same trick `DiagnosticsSessionRow` and
`credential-store.ts`'s `list()` use, so a later field on `Session` cannot leak through. It
is an append-only JSONL file with a per-file queue and a ring trim at the cap, like
`scrollback-log.ts` and deliberately NOT `layout-store.ts`'s temp-and-rename: one row per
command at human speed is exactly the rate an append stream is for, and a rewrite-the-world
save would turn every command into a full file write. The trim is count-tracked and runs
whenever the count passes the cap — an earlier "every fiftieth append" version let the file
run to cap+49 rows between trims, a bounded leak nobody would see. A malformed line costs
that line, never the list, and `ledger:list` returns newest first with a caller-chosen
limit, so the Work tab asks for twenty and a future search can ask for more without a
second reader.

**A mark's BEL is not a bell (`main/agent-state.ts`).** OSC sequences end in either `ESC \`
or a raw BEL (0x07), and the hooks emit `\a` because it is the form every shell's `printf`
can write. `scanForBell` previously counted every 0x07 in the stream as the agent asking for
attention — so with integration on, every prompt would have rung the M43 attention path
(badge, notification, beep) once per command. `scanChunk` therefore consumes the terminator
as part of the OSC it closes and reports it in `marks`, not `bells`; `verify:agent-state
osc133.1` pins that a chunk holding only marks yields zero bells. Only an OSC whose body
could still begin `133;` is accumulated (capped at 4096 bytes, poisoned past that), so an
unrelated OSC — a title set, a hyperlink — costs nothing, and a bell inside one is still a
bell, exactly as before.

**A discard writes the WORKTREE only, removes through the filesystem, and reports per path
(`main/review-discard.ts`, `git-args.ts`'s `buildRestoreArgs`/`buildLsTreeArgs`,
`review/ReviewNode.tsx`).** The only operation in this app that destroys work, and the
design is mostly refusals, each BEFORE any write and in a fixed order: a shared checkout —
counted by MAIN through `peersInRepo`, not read off the renderer's result, because a node's
result can be stale and a refusal that lives only in the UI is one a later UI forgets; a lost
baseline, because there is nothing to restore TO and removing the added files while
restoring nothing would be half a discard presented as one; git missing. Then three git
calls at most — `cat-file -e`, `ls-tree -r -z --name-only <baseline> -- <paths>`, and ONE
`restore --source=<baseline> --worktree` over exactly the held paths. `--worktree` and never
`--staged`, the inverse of the commit path's scratch-index rule for the same reason: an
agent may be mid-write against the real index. A path the baseline never held is removed
through the injected `removeFile` (an unlink), NEVER `git rm`, so no call writes the index
and the transaction runs under plain node in `verify:review`; `verify:panels discard.1`
closes with `git status --porcelain` empty, which is the index clause read from disk. The
result carries `restored`, `removed` and `failed` TOGETHER: a restore that fails for one
path does not un-restore the others (it cannot), and a result that said only `failed` would
have the user retry what already happened. A DIRECTORY path is refused per path before
`ls-tree`, because a directory pathspec lists its children and never itself, so it would read
as absent and the unlink would be asked to take a tree. There is no HEAD guard — a discard
restores from the baseline, not HEAD, so M9c's `head-moved` does not transfer and is not
copied. **No history entry is pushed, and the armed sentence says so**: the undo stack moves
panels, a discard moves files, and the reasoning that keeps a commit out of history applies
here with more force. The row's control is disabled with the model's reason on `shared`,
never removed, and the ARMED state is the disclosure — which of two sentences a row shows
("restore to spawn" or "did not exist at spawn — delete") is chosen by `untracked`, and the
outcome line then names what actually happened, so the node never claims a restore it did
not do.

**One parser behind both doors, and `command` is refused in the PARSER (`main/control-protocol.ts`,
`main/control-server.ts`, `main/control-handler.ts`, `index.ts`).** The socket and the URL
scheme yield the same `ControlRequest` and reach the same handler, so a verb or a field
accepted at one door is accepted at the other — which is exactly why an arbitrary command is
refused in `fromFields` rather than at a door: a URL can arrive from a web page or another
app, and a parser that took a command from the socket would be one edit away from taking it
from the URL. The preset system answers "what to run"; the doors answer "where, and which".
The URL door accepts ONLY `open` (its host is the verb) — a URL that could `list` is a URL
that could probe. The socket is a Unix domain socket in `userData`, unlinked before listen (a
stale file from a crashed instance refuses the bind, and the app would come up without its
door and no symptom) and chmod'd 0600 after (a Unix socket honours file permissions on
darwin; the default would let any local user open panels). There is no port and no way to
add one without changing the single listen call. A malformed line is ANSWERED and the server
keeps listening; a client that can take the door down with a typo is a client that can take
the app's control surface down. **Only the winning side of the single-instance lock listens
or writes the launcher** — the losing instance quits through the same gate that keeps it off
the tmux socket and the layout file. `open` answers "reached the canvas", never a panel id,
because main does not have one to give: the renderer alone mints ids (the duplicate-id defect
whose symptom is two panels rendering as one). `focus` and `list` see RUNNING sessions only;
a dormant card has no session in main, and the reply's `note` says so rather than the id
silently failing to match.

**The control socket and the launcher dir reach EVERY spawn's environment, and the launcher
runs the app binary as node over an UNPACKED file (`pty-manager.ts`'s `RunsDeps.control`,
`main/launcher.ts`, `build/builder-config.cjs`).** Injected in `create()` on the env BEFORE
the shell integration reads it, so a login shell, its decorated copy and an agent CLI's own
subprocess shell all find `tc` — "an agent inside a panel can open its own panel" is the
milestone's point, and an injection limited to login shells would leave the agent, the one
caller that matters, without it. PATH is PREPENDED so `tc` resolves with nothing installed.
The launcher is a two-line `sh` script main writes into `userData/bin` (compare-then-write,
so a launch is not a write) that `exec`s `process.execPath` with `ELECTRON_RUN_AS_NODE=1`
over `out/main/tc.js`, both paths quoted because the packaged app lives under "Terminal
Canvas.app". That file must be in `asarUnpack`: the CLI runs as node OUTSIDE the app process,
where `app.asar` is not readable, so a packed path is a launcher that dies with ENOENT on
every machine but the dev one — `verify:package cli.1` pins it, beside `protocol.1` for the
scheme, which without its `protocols` entry works only in the dev build. The dev binary never
calls `setAsDefaultProtocolClient`: it would register `Electron.app` as the handler for every
`terminal-canvas://` link on the Mac. The CLI itself (`src/cli/tc.ts`) is pure over an
injected connect and exits 0 / 1 / 2 for ok / refused / not running — three answers, because
"the app said no" and "there is no app" need different fixes and a script must tell them
apart without parsing prose.

**An orphan session is ASKED about, never adopted silently, and "known" means every workspace
(`main/orphans.ts`, `index.ts`'s boot block, `renderer/panels/recover.ts`, `session:recover`).**
Three rules, each with a quiet failure. **The known set is every workspace's ids**
(`layoutStore.workspaces()`), not `initial().panels`: the latter is the active workspace only,
and until M55 a session kept across quit (M38's keep arm) for a panel in a HIDDEN workspace was
killed as an orphan at the next launch — the user saw a dormant card where a running agent had
been, with a `[tmux] orphan` line in a log nobody reads. `verify:tmux orphan.1` pins the set
by drawing known ids from two workspaces. **`findOrphans` adds no dead-pane filter**: it is fed
by `ptyManager.list()`, whose tmux rows have been through `parseListOutput`'s `dead !== '0'`
drop, so a corpse is never a candidate by construction; a second filter here would be a second
opinion that could disagree with the first, and offering to restore a corpse is worse than
killing it silently. **No dialog, no send**: `session:recover` goes out only after a Restore
answer, and the stale-baseline sweep counts restored ids as surviving, since a baseline dropped
for a session the user just chose to keep would diff its next edit against nothing. On the
renderer side a recovered panel takes **the session's own id** — tmux names the session by it,
and `new-session -A` reattaching by that name is the entire mechanism — and the id counter
moves PAST every adopted id through `seedAfter`, which is now the ONE seeding rule
`Canvas.tsx` and `switchWorkspace` share (two inline copies of the `[nrfjt]` class each warned
that missing the other reopened the duplicate-id defect; a third copy for recovery would have
been a third door). Recovery goes through `commitHistory` like a spawn, so `Cmd+Z` un-adopts —
which disposes the sessions, and that is right: the user was asked and said yes, then said no.
The dialog itself is manual-only; no suite drives `showMessageBox`.

**Every DISCRETE camera jump is a flight through one path, no gesture ever is, and tiering
waits for the flight to land (`canvas/flight.ts`, `useViewport.ts`'s `flyTo`/`jump`,
`Canvas.tsx`'s tier effect).** `centreOn`, `fitAll`, `resetViewport`, `goToViewport` and the
trail all go through `jump` → `flyTo`; the wheel and the pan drag call `setViewport` directly
and `cancelFlight()` first, landing their own math on the CURRENT frame — the user grabbed
the camera mid-air and it must stay where it is, never snap to a target they can no longer
see the reason for. Scale interpolates in LOG space and is CLAMPED at every frame: a linear
scale tween lurches, and an unclamped intermediate is `verify:viewport` check 3's sideways
drift reappearing mid-flight. Translation is chosen so the world point under the screen
centre moves in a straight line. **The tier-assignment effect returns early while `flying`**,
which is STATE rather than a ref on purpose: a flight across the canvas would otherwise create
and destroy a dozen WebGL contexts for panels the user never stopped at, and a ref could not
re-run the effect when the flight settles. `prefers-reduced-motion` collapses every flight to
one frame, and the harness's override of it is persisted in localStorage because the harness
reloads the renderer many times in one run — a module-level override lapsed at the first
reload and every later check sampled a camera still in the air, which read as "centreOn
does nothing" (observed: nine reds with the camera unchanged, all after a reload). The
harness runs with reduced motion ON by default, as a user who set the preference would, and
turns it off for exactly one jump; it also disables background throttling, because a hidden
window pauses `requestAnimationFrame` and a flight driven by it never lands.

**The trail is a SECOND `History<Viewport>`, pushed on discrete jumps only, and a workspace
switch starts a new one (`useViewport.ts`).** Never the panels' history: `applyHistory`
reaches `registry.dispose`, so folding the camera in would walk the session-disposal path to
undo a pan. `present` is re-read from the live camera at push time because gestures move
the camera without telling the trail — a trail that trusted its own `present` would step
back to where the camera was before the last GESTURE, not the last jump. `restoreCamera` (a
workspace switch, a boot) replaces the trail rather than pushing: the previous workspace's
places are not this one's. `Cmd+[` / `Cmd+]` are matched on `event.code` for the reason the
shifted workspace pair already records, and the unshifted pair is checked AFTER the shifted
block so a held Shift never reaches the trail. Bookmarks persist beside the camera on
`CanvasState` (`bookmarks`, absent on every earlier file, parsed as `[]` with no warning,
malformed entries dropped per entry, a zero-scale camera dropping the bookmark rather than
pointing it at the origin), are saved UNGATED by the restore settings (a place is not
layout), and travel with a workspace switch exactly as groups do.

**Semantic zoom is a RENDER tier below tiering, with hysteresis, and never a fourth state in
`assignTiers` (`canvas/card-detail.ts`, `Canvas.tsx`'s `cardDetail`, `TerminalPanel.tsx`'s
`PanelCard`).** `lod.ts` rations WebGL contexts and PTYs and is plain-node tested for exactly
that; a card's typography has no resource consequence and reads the same scale through a
different function, so the file that rations contexts never makes a typography decision.
One value for the whole canvas (the scale is global), advanced by an effect on
`viewport.scale` through `nextCardDetail`, whose bands — enter `summary` below 0.26, leave
above 0.32; enter `block` below 0.11, leave above 0.15 — are the whole point: a pinch
hovering on a single threshold would flip every card on the canvas twice a frame, the same
class of thrash `DEMOTE_DELAY_MS` and `CULL_MARGIN_PX` exist to prevent, cheaper here since
nothing is destroyed and still visibly bad. **The `summary` and `block` tiers draw from facts
the `Panel` holds** — title, agent state, cost, at most one recorded or tail line — so a
DORMANT panel, which has no buffer to `tail()`, has the same three renderings as a live one.
**The `tail` markup is byte-identical and the idle affordance element survives into
`summary`**: `.panel__card-idle` with its exact text is read by three checks that FIT-ALL
first, which lands the camera in the summary band — the first cut of this tier replaced the
element with a state word and all three went red with "need one idle and one running panel".
A summary of an unstarted panel is "not started", and the element that says so is the same
one.

**Export reads the DURABLE log, never the xterm buffer, and the PNG is main's `capturePage`,
never a DOM capture (`main/export.ts`, `scrollback-log.ts`'s `readAll`, `index.ts`).** Two
silent failures, one per door. The text door: the xterm buffer is whatever scrollback xterm
still holds, a truncation the user cannot see, so with `scrollback.persist` off the row is
DISABLED with that reason and the export answers `off` rather than falling back — and it
reads the WHOLE file through `readAll` (after the panel's write queue drains, so it never
races a flush mid-line), not `tail`, whose 64KB window would truncate silently in the other
direction. The text is stripped by `shared/ansi.ts` and scrubbed by `shared/redact.ts`, the
same module the diagnostics bundle uses, and the result carries the redaction COUNT: a file
that quietly differs from the screen is the failure #31 is about, and the only honest
answer is to say how much differs. The picture door: the panels are WebGL-backed, a DOM
serialisation does not include a WebGL canvas, and `toDataURL` on one comes back empty
without `preserveDrawingBuffer` (which costs memory on every context, up to `LIVE_BUDGET`
of them) — so the capture is `webContents.capturePage()`, which composites the real frame,
and what it captures is what the canvas IS: cards stay cards, nothing is promoted to make
the picture prettier. The dialog and the capture are injected, so every arm — cancel writes
nothing, off reads nothing, the bytes written are the bytes captured — runs under plain node
in `verify:file`; `registerIpcHandlers` takes the exporters as a trailing parameter with an
INERT default that answers `failed`, which is exactly the red `verify:panels export.1` was
watched at before the harness wired its own.

**The minimap moves the camera only through `goToViewport`, and previews a drag rather than
tracking it (`canvas/MinimapOverlay.tsx`, `canvas/minimap.ts`).** `useViewport` keeps the
camera's setter private on purpose — nothing outside it should move the camera — and the
minimap is the first control that wanted to. It got the public verb, not the setter: a click
flies there (one trail entry, `Cmd+[` returns), a drag draws the camera's rectangle under the
pointer and flies on release. A live-tracking drag would have needed the setter, and the
obvious way to get it is to export it, after which the next control wants it too and the trail
stops being complete. The projection is pure (`verify:viewport minimap.1–.3`): one uniform
scale over every rect AND the camera's own world rectangle, so the camera is always inside the
map even when it is far from every panel — the case a map fitted to panels alone gets wrong
silently, drawing the rectangle off its edge.

**The frame's far tiers HIDE a kind's body; they never unmount it (`components/PanelFrame.tsx`,
`.pf__keep`).** Below `SUMMARY_ENTER` every sessionless kind renders `edge · title · word` in
place of its body, and the first cut did that with `farBody ?? children`. A Jira ticket's
comment draft lives in that child subtree; zooming out past 26% discarded typed, unsent text
with no sign. The body is wrapped in `.pf__keep` (`display: contents`, so the DOM the checks
select is unchanged) and given the `hidden` attribute under the far tiers. `hidden.1` in
`verify:styles` is why the class carries its own `[hidden]` reset.

**An agent session's process is gated on TWO identities, and the second one is the
exit-then-resume case (`main/agent-session.ts`).** M61 fixed the PTY layer's late-event bug
with one test — `sessions.get(id) === session` — because there a recreated id is a new
`Session` object. The agent runtime has a case the PTY layer does not: after an exit, the
NEXT `send` respawns the SAME session object with `--resume`, so the dead process's farewell
bytes and its exit callback arrive against a session that is still in the map and still
itself. Every data and exit callback therefore checks `session.proc === proc` as well, with
`proc` captured at spawn. Drop the second clause and a killed process's exit marks the
resumed session `exited` a moment after it started, with the new process alive and unwatched
— the resurrected-log failure wearing a different coat. `verify:agent-session
session.identity` drives the disposed case; the resumed case holds by the same line and is
the reason the guard is written as two clauses rather than the one M61 needed.

**The CLI's `usage` is per turn and its `total_cost_usd` is cumulative, and the session
treats them differently on purpose (`main/agent-session.ts`, `shared/transcript.ts`).**
Measured on claude 2.1.259: three turns of one process reported `output_tokens` 166, 135, 43
and `total_cost_usd` 0.0215, 0.1609, 0.1684. Usage is SUMMED into the session's four token
classes; cost is TAKEN as the latest value. The obvious accumulator sums both and reports a
session that cost three times what it did, growing quadratically with turn count — a number
that looks plausible on every screen it reaches. The interrupted turn's result reports a
zero usage and an unchanged cost, which the same rule handles without a branch.
`verify:agent-session session.accounting` pins the asymmetry with the real figures.

**A permission request needs `--permission-prompt-tool stdio`, or it is a refusal
(`main/agent-session-args.ts`).** Without that flag a headless `claude` DENIES every tool
that would have asked, emits a `system/permission_denied` line, and carries on — the agent
reports it could not run the command, the transcript reads as an ordinary turn, and nothing
anywhere says a question was skipped. `--permission-prompts host` alone does not change this,
and neither does an `initialize` control request (both measured). With the flag the CLI emits
a `control_request` of subtype `can_use_tool` and WAITS; the session holds it as `pending`
and answers only through `answerPermission`, and a request whose process exits is dropped by
name (`permission-dropped`) so no surface can show a question nobody can answer.

**An agent session spawns on the first `send`, never on `create`, and respawns with
`--resume` after any exit (`main/agent-session.ts`).** A restored chat panel (M72) creates its
session at boot for every panel on the canvas; spawning there would boot one `claude` per
restored panel — the exact decision-on-the-user's-behalf dormancy exists to refuse for
terminals. The CLI session UUID is minted at create and pinned with `--session-id`, so the
first process and every later one name the same conversation, and the conversation's own
durability is the CLI's transcript under `~/.claude/projects`, not a file this app writes.
A `send` during a turn is queued in the session (the transcript shows it, dispose drops it);
a `send` after an exit is a respawn, so a crashed or interrupt-killed process costs the user
one message, never the conversation.

**A chat panel is a PROCESS node that is not a terminal, and the partition is the one line
that keeps it out of tiering (`renderer/panels/panels.ts`, `Canvas.tsx`).** M73's `ChatPanel`
is the sixth kind and the first with a process behind it that is not a PTY. Its process is
MAIN's (`AgentSessionManager`, keyed by the panel id); the renderer holds a store mirror
(`chat/chat-store.ts`) and never a `PanelSession`. `isTerminalPanel` gained a sixth clause and
`verify:viewport 92` reads all six kinds in one assertion, because a partition that admitted
a chat panel would hand it to `assignTiers` and `registry.ensure` with no spec — a
`LIVE_BUDGET` slot and a WebGL context spent on a transcript, and nothing on screen to say
so. `verify:panels chat.1` pins the other side: minting one creates no PTY and no xterm.

**A chat panel's disposal is EXPLICIT at the panel-removing sites, never a diff of the
visible list (`chat/useChatSessions.ts`).** `useChatSessions` keeps main told about every
chat panel on the canvas (`agent:create` once per id, idempotent) and seeds the store from
the durable file; it never disposes. A reconciler that disposed whatever left `panels` would
kill every conversation on a WORKSPACE SWITCH, exactly the case the registry keeps a
switched-away terminal alive for. `disposeChat(id, drop)` therefore sits beside each
`registry.dispose` (close, undo/redo, reset, workspace delete) and is not one — the
`pty.kill` caller count and `verify:panels` 94 are unchanged, and `chat.4` pins that a chat
close sends no kill and does drop the session and its file.

**The durable chat transcript is written by MAIN from the runtime's own events, and a
restored panel renders it before any process exists (`main/agent-transcript-log.ts`,
`main/index.ts`).** One append-only file per panel under `userData/agent-transcripts`,
a `turn` line per `turn` event (a merged turn re-written whole; the reader keeps the last
line per turn id in first-seen order) and a `meta` line per `result`. The renderer never
echoes a turn back, so a chat that streamed while the window was closed is still on disk.
Whether the first spawn says `--session-id` or `--resume` is decided at spawn by the CLI's
own transcript (`transcriptExists`, M17's glob), never by a flag this app persists.
`verify:panels chat.3` disposes main's session to stand in for a relaunch and reads the
file back through the real panel; the turn count in the chrome is counted from the
transcript for the same reason (a fresh session reports zero while the file holds
yesterday's).

**`claudeAvailable(presets)` is the ONE fact the three chat doors share
(`palette/commands.ts`).** The palette row, the launcher line, the spawn sheet's arm and the
composer all read whether a claude-kind preset is available — the preset rows' own
resolution of the CLI on the login PATH — so no two of them can disagree about whether
`claude` was found, and each names the same fix (`REASON_NO_CLAUDE`). The panels harness
seeds a claude-kind preset over `/bin/sh` to make that gate answer the way a machine with
the CLI does, through the real path.

**One front-end at a time: a Claude session moves between a terminal and a chat, it is never
shared (`main/index.ts`'s `importSession`, `Canvas.tsx`'s `openAsChat`/`openInTerminal`).**
Two processes on one session id would both append to the CLI's transcript, and the CLI's
`--resume` reads that file: the conversation would fork silently and each front-end would
show a different half. So `Open as chat` refuses BY NAME while the terminal's process is
live (`ptyManager.list()` names it), and moving either way REMOVES the panel it came from
through its ordinary close path before the new one is minted at its rect. The verbs move a
conversation; nothing copies one. `verify:panels front.1` drives the refusal and the move.

**The pin FOLLOWS the resume (`main/agent-args.ts`, `main/pty-manager.ts`).** A terminal
spawned with `claude --resume <id>` must not also be given `--session-id <fresh>`: the CLI
refuses the pair, and had it not, M17's cost accounting would read a transcript that never
exists while the real one grew. `agentArgs` skips the pin when the args carry `--resume`, and
`PtyManager.create` adopts the resumed id as the panel's pinned session, so cost and a later
`Open as chat` both name the conversation actually running. `verify:agent-session args.5` and
`verify:pty-manager resume-pin.1`; both fault-injected.

**The CLI's transcript is imported with its subagents and its meta records left out
(`main/claude-transcript-import.ts`).** `isSidechain: true` records are a subagent's own
turns in the same file (M15's finding, reached again); `isMeta: true` records are the CLI's
injected notes. Either rendered as the user's conversation would show turns nobody typed. A
typed prompt is a bare STRING in that file — the one shape the stream never produces — and
is one text block, never an empty turn. `verify:agent-session import.1–.3`.

**An attachment is resolved in MAIN and refused whole by name; the transcript holds a
placeholder, never the bytes (`main/attachments.ts`, `shared/transcript.ts`).** The renderer
has no `fs`, so a dropped image's path is read in main — and the same door is where a
non-image, an oversize file or a missing one is refused, each naming its fix (reference a
file by its path; the 5 MB cap; is it still there?). A refused attachment refuses the SEND
whole and the composer keeps the draft: a message that went with one image missing would
read as sent and be wrong. On the wire an image is a base64 block after the text (the
API's shape, which the CLI's stream-json input takes); in the stored turn it is
`{ type: 'image', mediaType, size }`, because a screenshot is a megabyte and a transcript is
many, and the renderer says `image · png · 42 KB`. `verify:agent-session attach.1` pins the
placeholder by asserting the base64 is ABSENT from the stored turn; `attach.2` the refusals.

**A trigger opens a completion only at a token's start with the caret inside it
(`renderer/chat/composer-model.ts`).** `a/b` is a path, `me@x` an address, and a caret
before the `@` is not inside the token; without the rule every path typed by hand opens a
list over the transcript. `verify:rail composer.1` names the four non-triggers.

**A saved prompt's holes are filled before insertion; a project prompt is NEVER expanded
(`composer-model.ts`, `ChatNode.tsx`, `usePaletteActions.ts`).** M5b decided a project
prompt is a file this app does not own, and expanding a placeholder the CLI's own format
does not define would make the same file behave differently inside the app than in a plain
terminal. So only the SAVED library gets the fill step — in the composer's popup, or in
the palette's text line for either front-end — and a hole with no value stays as typed,
never blanked into a prompt that silently says less. `composer.2` and `verify:panels
composer.3` (a project prompt inserted verbatim, `{{target}}` intact).

**A chat's `needs you` is decided in MAIN and travels on the terminal's channel; the
renderer's store is a cache, never a second author (`main/approvals.ts`, `main/index.ts`,
`chat-store.ts`).** The obvious renderer-side version — derive the attention set from the chat
store's pending lists — makes two authors of "who wants me": the store fed by `agent:state` and
a second list fed by `agent:event`, which agree until a dispose races an event and then differ
forever, with the pip pointing at a panel whose card says idle. The tracker emits `wants-you`
when a panel's pending set goes from empty to non-empty and `idle` when it empties, on the SAME
channel the terminal detector uses, so the store, the pips, Cmd+J, the popover, the workspace
counts and the palette's `state:` order need nothing new. The card, the rail row and the far
tiers still read the word from the snapshot's pending list, and the two readings agree by
construction because both are main's one fact. `agent:acknowledge` (focus) never clears a
chat's `needs you`: a question with no answer is a fact, not a bell. `verify:agent-session
approve.1`, `verify:panels approve.1`.

**One dock badge, two authors, one writer (`createAttentionUnion`).** `PtyManager.syncAttention`
sets the badge from its waiting set on every change; the approval tracker sets it from its own.
Each writing `app.dock.setBadge` directly leaves the number reading whichever spoke last — a
terminal going quiet zeroes a badge that should still say one chat is asking. The union hands
each a child sink that records its own count and writes the SUM. PtyManager is untouched; the
M43 checks run against the same interface. `approve.2`.

**The tracker notifies on ENTRY only, and a second request re-notifies nothing.** The same rule
`syncAttention` states: a notification per request would toast every tool call of a busy agent
while one is already waiting, and clearing on the first answer of two would tell the user the
panel is done while a question is still open. `approve.1`; `approve.3` for focus and the two
settings.

**A chat's baseline is captured by `agent:create` through the SAME capture PtyManager uses, and
it SURVIVES a relaunch (`main/index.ts`, `baseline-capture.ts`).** The obvious alternative — a
second capture path for chats — would drift from the terminal's once-only guard and epoch
poisoning silently. The relaunch rule is the opposite of the terminal's on purpose: a terminal's
next launch spawns a NEW agent, so a surviving baseline would blame it for yesterday's edits;
a chat RESUMES the same conversation (`--resume`), so its starting point is still the right
thing to diff against. The startup sweep therefore counts every saved chat panel as surviving.
`verify:panels tools.1`; the sweep's rule is `verify:review` 37's `staleBaselineIds` with chat
ids in the surviving list (main-only wiring, read in `index.ts`).

**A tool's path is matched to a review row by suffix when it is not under the root
(`shared/tool-index.ts`).** git reports the repository root's REAL path (`/private/var/…` on
macOS) while the agent's cwd, and so every `file_path` it emits, is the logical one (`/var/…`);
a pure function cannot resolve the symlink. `matchReviewPath` takes the LONGEST known row path
the tool's path ends with, and null when none matches — never a guess, because a wrong match
attributes an edit to the wrong file with no symptom. The panels check found this on its first
run: touches read null and the Edit row's `diff` said `unchanged`. `verify:review tools.1`.

**A tool row's `diff` is a three-state body, and `unchanged` is an answer, not an error.** A
`Read` that names a file which nothing changed reads `unchanged against the baseline`; a chat
created outside a repository or before its agent ran reads `no baseline`; `reading…` is its
own sentence. Collapsing any two tells the user the wrong fix (principle 7). `verify:panels
tools.2`.

**`handoffFires` is the ONE table, and an edge that fails its condition is recorded by name
(`shared/handoff.ts`, `useHandoff.ts`).** Five triggers and two events make ten cells; a second
copy of the table in the hook, the parser or the pane drifts in the cell nobody tests (`exit-ok`
on a signal, `always` on a turn). The hook asks the table and nothing else; a failed exit
condition writes `skipped — exit 1 is not exit 0` to the automation list, because an edge that
silently did not fire is indistinguishable from one that is broken. `verify:viewport graph.1`,
`verify:panels graph.1`.

**A join fires ONCE, when the LAST expected source arrives, with the payload in the panels'
order — and the arrivals live in a ref, never in the layout (`handoff-rules.ts`, `useHandoff.ts`).**
Firing on each arrival would start the target twice with half the context each time; persisting
arrivals would replay yesterday's output on the next launch (the same reason M41's queue is a
ref). `incomingHandoffs` is computed at each arrival from the CURRENT panels, so an edge added
or removed while a join waits changes what it waits for, and `waiting for <source>` names what
is still owed. `verify:viewport graph.2`, `verify:panels graph.1`.

**An edge is selected on CLICK, never on mousedown (`LinkLayer.tsx`).** The canvas background's
mousedown clears every selection and, by M35's rule, reads nothing from `event.target` — so a
mousedown on the hit stroke that selected the edge would be cleared by the same event a moment
later, and stopping propagation there would pin a panel live (M35's own comment names the
failure). A click fires after the mousedown has run, so the selection lands last. The first
draft made the hover BADGE select, which broke M35's remove check; the badge stays the remove
control. `verify:panels graph.2`, `link-draw.5`.

**A handoff into a shell EXECUTES the pasted transcript (a harness fact worth keeping).** The
join check's first target was a `/bin/sh`, and the source's own `exit 0` line, pasted, ended it
before the second source's part arrived; a bare `cat` never leaves `starting` (no output, no
idle) and is never receivable. The target that works is a shell that prints once and sleeps:
the tty echoes the paste into the log without running it. This is also the honest limit of a
handoff into a plain shell — it is INPUT, and a shell runs input. `verify:panels graph.1`.

**The link layer's SVG is 1px, never 0px (`styles.css` `.link-layer`).** A zero-sized SVG root
with `overflow: visible` inside the world's `will-change: transform` compositing layer painted
NOTHING of its overflow: the lines were in the DOM, at the right client rects, with visible
computed strokes, and the screenshot showed bare canvas. Every link check reads the DOM and
computed styles, so every one was green while no link had been visible in the built app for
some time. The `graph` scene (M78) was the first time a picture of a link was looked at. One
pixel gives the layer a box and the overflow paints. Manual-only: that this holds on the next
Chromium.
