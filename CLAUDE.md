# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Electron app for macOS: an infinite canvas where every node is a live terminal panel
running a coding-agent CLI. **M1, M2, and M3 have landed.** M1 is the PTY layer, M2 is the
canvas and its coordinate math — deliberately built apart so that a blank panel had exactly
one possible cause in each. M3 merges them: `Canvas.tsx` now renders real terminal panels
instead of M2's placeholder rectangles, with level-of-detail tiering and viewport culling so
the canvas can hold more panels than the browser can afford live WebGL contexts for.

The milestone table in `README.md` is the roadmap contract — several modules are
deliberately shaped for a milestone that has not landed yet, and the code comments say so.
Don't "simplify" those away.

## Commands

```sh
npm run dev            # electron-vite dev (unsets ELECTRON_RUN_AS_NODE first)
npm run build          # typecheck + electron-vite build
npm run typecheck      # both projects; or typecheck:node / typecheck:web individually
npm run verify         # every suite below, then a build, then the suites that need the build
```

There is no unit-test runner and no linter. `npm run verify` is the whole verification
story — it chains typecheck and build in the middle — and it must be green before claiming
work is done. Individual suites:

| Script | Runtime | Covers |
|---|---|---|
| `verify:viewport` | plain node | 47 checks: `viewport.ts`'s pure canvas math (1–11b), `lod.ts`'s pure tiering (20–25), `panel-interaction.ts` + `panels.ts` drag/z math (26–34), `pointer-correct.ts` (35–39), the undo `history.ts` stack (40–45), and dormancy outranking focus in `lod.ts` (46–47) |
| `verify:registry` | plain node | 23 assertions against `session-registry.ts`'s lifecycle, using a fake bridge and fake terminal factory — numbered 1–15 with lettered sub-checks (`3b`, `3c`, `7b`, `7c`, `7d`), including explicit close (13–15) and dormant attach/wake (16–18) |
| `verify:layout` | plain node | 25 checks: `shared/layout-schema.ts`'s on-disk format validation and `layout-store.ts`'s coalescing, atomic write, and settings resolution |
| `verify:tmux` | plain node | 17 checks: `tmux-args.ts`'s argv, config text, version parsing and list parsing (1–13), and `tmux-probe.ts`'s pure backend selection (14–17) |
| `verify:pty` | Electron as node | 10 checks: `node-pty` behaviour end to end |
| `verify:pty-manager` | Electron as node | 8 checks: the real `PtyManager` |
| `verify:window` | real Electron | 3 checks: renderer teardown reaches the PTY layer |
| `verify:ipc` | real Electron | 1 check: every contract channel has a handler |
| `verify:canvas` | real Electron | 6 checks: real input into the built renderer |
| `verify:xterm` | real Electron | 6 checks: an xterm `Terminal` survives its host being detached and reattached |
| `verify:panels` | real Electron | 24 checks: tiering, the pointer corrector, drag, resize, wheel ownership, close, z-order, id uniqueness, dormant restore/wake (18), layout persistence (19), undo/redo (20–22), reset (23), and boot reconcile (24) |

None need a display; the real-Electron ones open a window with `show: false`. There is no
test-name filter in any of them — each runs everything and exits non-zero on any failure.
To add a check, append an `ok(...)` assertion in the IIFE.

**Why the Electron binary and not `node`.** `node-pty` is a native module compiled against
Electron's ABI by the `postinstall` `electron-rebuild`, so it will not load under system
Node. `verify:pty` and `verify:pty-manager` therefore run under Electron with
`ELECTRON_RUN_AS_NODE=1`; `verify:window`, `verify:ipc`, `verify:canvas`, `verify:xterm`, and
`verify:panels` need the real app lifecycle and `unset` it instead. `verify:viewport`,
`verify:registry`, `verify:layout`, and `verify:tmux` are plain node, because `viewport.ts`,
`lod.ts`, `session-registry.ts`, `shared/layout-schema.ts`, `main/layout-store.ts`, and
`main/tmux-args.ts` have no native dependency, no DOM, and no direct `window`/`document` use —
`session-registry.ts` gets there by taking its IPC bridge and its terminal factory as injected
dependencies, so `verify:registry` can drive the whole session lifecycle against fakes instead
of a real PTY or a real xterm, `layout-store.ts` gets there by taking the filesystem paths it
reads and writes as constructor arguments instead of resolving `app.getPath('userData')`
itself, and `tmux-args.ts` gets there by being pure argv/config/parsing builders that never
import `node-pty` — the module that actually spawns a tmux client, `session-backend.ts`,
deliberately stays out of this file's reach so `verify:tmux` can run under plain node at all.

**`verify:pty` duplicates production code on purpose.** It re-implements `shell-env.ts`'s
probe and `pty-manager.ts`'s batching by hand so it can test them without Electron's app
lifecycle. If you change either module's behaviour, mirror it there. (`verify:pty-manager`
drives the real module and does not duplicate anything.)

**`verify:canvas` and `verify:panels` are the suites that consume the build.** Both load
`out/renderer/index.html` in a hidden window, which is why `npm run verify` runs `build`
before them — run either alone against a stale `out/` and you are testing the previous
commit. `verify:panels` is also its own Electron entry point (not `out/main/index.js`), so
nothing has registered `ipcMain` handlers for it the way `main/index.ts` does at real
startup; `scripts/panels-entry.cjs` hand-wires `resolveShellEnv` + `registerIpcHandlers` + a
`PtyManager` to fix that, the same pattern `verify-ipc-surface.cjs` and
`verify-window-lifecycle.cjs` use. The other Electron suites esbuild their own entry from
source into `out/verify/`, so they are always current without a build step.

**`verify:panels` reaches the registry through eight narrow `window.__m4a*` hooks
(`__m4aScale`, `__m4aWrite`, `__m4aSelection`, `__m4aCellToScreen`, `__m4aGrid`,
`__m4aViewport`, `__m4aScrollY`, `__m4aSessions`) installed by `Canvas.tsx`.** The registry is a module-level
closure by design (see "Two lifetimes, not one" below), and `executeJavaScript` has no other
route into it. Keep the set narrow and named by what each one answers — the alternative is
exposing the registry itself and letting the suite drift into testing internals instead of
behaviour.

**`verify:xterm` is a spike, not a regression suite for a module.** It exists to prove the
assumption the whole M3 eviction design rests on: that an xterm `Terminal` keeps accepting
writes while its host `div` is out of the document, and repaints once the host returns. It
runs a DOM-renderer control terminal alongside the WebGL one under test, because under WebGL
`.xterm-rows` stays empty even when the terminal is healthy — DOM text content is not a valid
repaint signal for a WebGL-backed terminal, so the control terminal is what the check actually
reads to confirm a repaint happened.

## Architecture

Three processes, one shared contract. **The main process owns every PTY; the renderer never
spawns a process.**

```
renderer --invoke--> pty:create / pty:write / pty:resize / pty:kill / pty:list --> main
renderer --invoke--> layout:load / layout:save                                 --> main
renderer --invoke--> session:backend                                          --> main
renderer <--send---  pty:data (batched ~16ms) / pty:exit                       <-- main
main     --send-->   edit:copy / edit:paste / edit:undo / edit:redo            --> renderer
main     --send-->   canvas:counts / canvas:reset                              --> renderer
```

`canvas:counts` reverses the usual direction: main sends it and the renderer replies, on an
ephemeral `canvas:counts:reply:<timestamp>` channel invented per call in `main/ipc.ts` and
never declared in `ipc-contract.ts` — which is why `verify:ipc`'s "every channel has a handler"
check does not, and should not, cover it.

- `src/shared/ipc-contract.ts` — single source of truth for channels and the
  `window.canvas` bridge type. Imported by all three processes; add a channel here first.
  `verify:ipc` fails if a channel there has no main-process handler.
- `src/main/pty-manager.ts` — owns the `Map<PanelId, Session>`. All PTY lifecycle.
- `src/main/window-lifecycle.ts` — detaches (not kills) a window's sessions when its renderer
  navigates or closes, so their tmux sessions survive; see "One operation became three" below.
- `src/preload/index.ts` — `contextBridge` exposes `window.canvas`. Every `on*` subscribe
  returns its own unsubscribe so React effects can clean up without stacking listeners.
- `src/renderer/session/session-registry.ts` — owns every panel's **session** (its xterm
  `Terminal` and its PTY) for the lifetime of the renderer, in a module-level registry outside
  React. Created once, disposed once. `pty.kill` has exactly two callers in the renderer —
  `disposeAll` (renderer teardown) and `dispose(id)` (explicit panel close) — and a tier
  change must never reach either.
- `src/renderer/components/TerminalPanel.tsx` — the **view**: one panel's React component,
  mounted and unmounted freely by tiering, owning nothing. It renders whichever `SessionHandle`
  the registry hands it and calls back into the registry (`attachSlot`/`detachSlot`) around its
  own mount lifecycle.
- `src/renderer/canvas/lod.ts` — pure tier-assignment function; decides which panels' sessions
  are attached (`live`) vs. carded, based on viewport, focus, and budget.
- `src/renderer/terminal/create-terminal.ts` — the only place a `Terminal` is constructed, and
  it returns one **detached**. `src/renderer/terminal/session-factory.ts` implements
  `SessionHandle` over `attachTerminal`/`detachTerminal` from the same module, and is what the
  registry's session-factory dependency actually is at runtime.

The session/view split is the milestone's whole point: in M1, "this component is unmounting"
and "this panel is going away" were the same statement. Culling makes them different
statements, and `session-registry.ts` is where that difference lives.

The canvas is layered so that the math is testable without a browser, and each layer may
only import downward:

```
src/renderer/canvas/
  viewport.ts       pure math — no DOM, no React imports. Enforced by review and by the
                    fact that verify:viewport runs it under plain node.
  canvas-input.ts   platform events -> pan/zoom intents — no React. Takes a plain
                    {deltaX, deltaY, deltaMode, ctrlKey, metaKey, shiftKey}, not a
                    WheelEvent, so it stays a pure function.
  lod.ts            pure tier assignment — no DOM, no React. Bundled alongside viewport.ts
                    into the plain-node verify:viewport target.
  useViewport.ts    React state + listener wiring — the only place the two meet. The
                    setter stays private on purpose: nothing outside should move the camera.
  Canvas.tsx        clipping host + the single transformed world layer; owns the registry,
                    the tier-assignment effect, and the one Cmd+C/Cmd+V subscription
  CanvasHud.tsx     zoom % and world-space cursor — the fastest way to see the math misbehave

src/renderer/session/
  panel-session.ts      the PanelSession/SessionHandle/SessionFactory interfaces — what the
                        registry needs from a terminal, with nothing xterm-specific in it
  session-registry.ts   the registry itself (see above)
  useRegistry.ts        useSyncExternalStore glue so React re-renders on registry.version()
```

`@shared/*` and `@renderer/*` path aliases are declared in **both** `electron.vite.config.ts`
and the tsconfigs — adding one means editing both.

## Load-bearing details

Each of these exists because the naive version fails *silently*. Don't undo them.

**Login-shell PATH (`src/main/shell-env.ts`).** macOS GUI apps are launched by launchd, so
they inherit a bare PATH and no dotfile exports — `claude`/`codex` work in Terminal but are
"command not found" in the app. We probe `$SHELL -ilc env` once at startup (`-i` is what
makes zsh read `.zshrc`) and use that env for every PTY. A non-zero exit from the probe is
normal; success is judged by whether a `PATH` came back. The fallback logs loudly on purpose.

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

**Sessions die with their renderer (`window-lifecycle.ts`).** Cmd+R and Cmd+W destroy the
page without running React cleanup, so the renderer never sends `pty:kill`. Left alone the
old PTY survives and the next `pty:create` throws "already has a live PTY" — a dead panel
with no recovery short of quitting. Surviving a reload instead of dying is M4c's job, once
tmux backs the session; `pty:list` is the channel a fresh renderer will reconcile against.

**Cmd+C / Cmd+V (`src/main/menu.ts`).** The stock `'copy'`/`'paste'` menu roles drive
`document.execCommand`, but xterm's selection under the WebGL renderer is not a DOM
selection — the role copies nothing or the wrong thing. We keep the accelerators but forward
to the renderer, which asks xterm directly. **Ctrl+C is deliberately untouched** and flows to
the PTY as SIGINT. As of M3 this is **one subscription in `Canvas.tsx`**, not a per-panel one:
it reads whichever session is currently focused (via a ref mirroring `focusedId`, the same
pattern `useViewport` uses) and calls `getSelection()`/`paste()` on that session's
`SessionHandle`. A per-panel subscription would mean every panel but the focused one receives
and discards the event — twenty times the work to deliver the same copy/paste with twenty
panels open.

**Two lifetimes, not one (`session/session-registry.ts`).** A panel's session — its
`Terminal` and its PTY — is created once and disposed once, in a module-level registry outside
React. The React panel (`TerminalPanel.tsx`) is mounted and unmounted freely by tiering and
owns nothing. In M1 "this component is unmounting" and "this panel is going away" were the
same statement; culling makes them different, and confusing them kills a running agent with no
error anywhere. `pty.kill` has exactly two callers, both inside `session-registry.ts` —
`disposeAll` (renderer teardown) and `dispose(id)` — but **a tier change must never reach
either one.** Four checks exist for exactly that property: `verify:registry` 5 and 15, and
`verify:panels` 4 and 15. `dispose(id)` itself now has three call sites in `Canvas.tsx` — the
close button, undo/redo removing a panel, and the reset handler — and every one of them keeps
the `pty.kill` count at two precisely because it routes through `dispose(id)` instead of
calling `pty.kill` directly; see "Undo removing a panel must dispose its session" below for the
call-site history.

**Lazy spawn (`session-registry.ts`).** A PTY is created when its panel first goes live, not
at startup. "Fit before spawn" (below) needs real cols/rows, which needs an attached, laid-out
node — so a panel that has never been on screen has no size to spawn at. It also stops a
twelve-panel canvas launching twelve agents on boot: `LIVE_BUDGET` (8) caps how many are live
at once, whatever the panel count. As of M4b, a fresh install's actual boot data is
`firstRunPanels()` — one centred placeholder — not `SEED_PANELS`; `SEED_PANELS`'
twelve scattered entries in `panels/panels.ts` stay put purely as `verify:panels` fixture
data, which is what they were always actually exercising. The cap is
enforced in two places and holds at every moment, not just when the canvas is at rest:
`assignTiers` never promotes more than the budget, and `Canvas.tsx` re-checks it when it
applies the map, because a held-back demotion (below) is a live panel `assignTiers` did not
count. Without the second check, panning past twelve panels left all twelve live for the
duration of the gesture — twelve WebGL contexts against a browser cap near sixteen, and a
dropped context is permanent for the run (`create-terminal.ts` sets `webglDisabled`).

**Promote now, demote later (`Canvas.tsx`, `DEMOTE_DELAY_MS = 250`).** Promotion to `live` is
applied immediately; a demotion to `card` is held for `DEMOTE_DELAY_MS` and re-applied only if
still true after the delay. Together with `lod.ts`'s `CULL_MARGIN_PX` this makes promotion and
demotion happen at different boundaries. Without it, a panel sitting at the viewport edge
destroys and recreates a WebGL context every frame while you pan, and the symptom only shows
up mid-gesture, not in a static screenshot. Two details keep the hold from becoming the bug it
prevents. The release timer is armed against a **ref**, never re-armed in an effect cleanup:
the tiering effect depends on `viewport`, which changes on every wheel event, so a cleanup
that cleared the timer let a continuous trackpad pan restart the 250ms clock forever and
nothing ever demoted. And the hold yields to the budget — when live-plus-held would exceed
`LIVE_BUDGET`, the oldest holds are released immediately, since they have already had most of
the grace period they exist to provide.

**Focus is released on a background click (`Canvas.tsx`).** `assignTiers` pins the focused
panel live unconditionally, so `focusedId` is not just a highlight: an id that is never
cleared holds a WebGL context and a budget slot for the rest of the run, and keeps routing
`Cmd+C` to a panel whose textarea the browser blurred long ago. Background `onMouseDown`
clears `focusedId` alongside `selectedId`. This is also what lets a panel the user typed into
ever demote — `verify:panels` check 8 depends on it to read the terminal's buffer back out of
its card.

**Pointer coordinates are corrected, not gated (`components/xterm-pointer.ts`,
`canvas/pointer-correct.ts`).** xterm computes a cell as
`(clientX - rect.left) / dimensions.css.cell.width`. `rect.left` is transform-aware and in
screen pixels; `cell.width` is transform-blind and in CSS pixels, so under `scale(k)` xterm
reports a column `k` times the true one. M3's answer was to gate body clicks to
`[0.9, 1.1]` and leave the error uncorrected everywhere else; M4a removes the gate and
rewrites the event instead. `installPointerCorrection` is a **capture-phase listener on
`document`**, not on the panel — xterm binds its own drag listeners
(`mousemove`/`mouseup`) to the document once a gesture starts, so a panel-scoped listener
would correct the mousedown and then miss every move that follows, and drag-selection would
stop partway through. It pins the target slot at mousedown and holds that pin until mouseup,
because mid-drag the cursor spends most of the gesture outside the slot's DOM bounds. Three
fields on the synthetic `MouseEvent` are load-bearing and each fails silently if dropped:
`detail` (click count — drop it and double/triple-click word/line select stop working),
`buttons` (drop it and every corrected move reads as a hover, so selection never extends),
and the modifier flags. A `WeakSet` marks synthetic events; without it the clone re-enters
the same capture listener and recurses until the stack overflows. At `scale === 1` the
interceptor returns before doing any work, so the common case pays nothing. **Known limit,
not yet covered:** correction is anchored to the slot pinned at mousedown, so a hover
`mousemove` with no prior in-slot mousedown returns early uncorrected — a mouse-reporting TUI
still sees `k`-times-wrong coordinates via `getMouseReportCoords` on hover. That is recorded
in `xterm-pointer.ts` itself and left to a later milestone; do not read the file as though
hover were already handled.

**`version` exists only so `memo` can see a mutation (`TerminalPanel.tsx`,
`session-registry.ts`).** `TerminalPanel` is wrapped in `memo`, and the registry mutates a
`PanelSession` **in place** — `registry.get(id)` returns the same object reference forever, so
`session` alone is always "equal" by `memo`'s shallow comparison no matter how many times its
tier/status/spawned fields flip underneath it. `Canvas.tsx` passes `registry.version()` down as
its own prop purely so the shallow compare has something that actually changes: without it,
promoting a panel never re-renders it, no slot is ever mounted, and no PTY is ever spawned.
`version` bumps only on tier/status/focus/exit — never on 16ms-batched PTY data, never on
pointer moves — which is what keeps the memo doing its actual job of blocking the 60Hz
pan/zoom cascade from reaching every panel.

**One transform, not N layouts (`Canvas.tsx`).** A single `.world` element carries
`translate(...) scale(...)`; panels are positioned once in world coordinates and never
recomputed. This is not only about performance. A CSS `scale()` on an ancestor is invisible
to `getComputedStyle` and `ResizeObserver` — exactly what xterm's `FitAddon` consults — so
zooming *cannot* change a panel's cols/rows. The rejected alternative, sizing each panel in
screen pixels per frame, would reflow the running shell on every zoom gesture.

**...which is why pointer coordinates needed correcting, not just gating.** The same
blindness means `getBoundingClientRect()` is transform-aware while
`dimensions.css.cell.width` is not, so under `scale(k)` every click lands on a cell off by a
factor of `k`. M3 gated body clicks to a band near 1:1 rather than fix the arithmetic; M4a
fixes it instead (see "Pointer coordinates are corrected, not gated" above) by intercepting
and re-dispatching mouse events with rewritten `clientX`/`clientY` before they reach xterm.

**`passive: false` on the wheel listener (`useViewport.ts`).** Chromium treats ctrl+wheel as
its own page-zoom gesture; without `preventDefault()` a pinch zooms the whole UI and every
coordinate the canvas computes silently becomes wrong. React's `onWheel` prop may be attached
passively, where `preventDefault()` does not throw — it just does nothing. Hence
`addEventListener('wheel', handler, { passive: false })` in an effect, never a JSX prop, plus
`setVisualZoomLevelLimits(1, 1)` in `src/main/index.ts` as a second line of defence.

**Clamp scale before deriving translation (`zoomAt`).** Deriving the translation from a
*requested* scale while applying a *clamped* one makes the canvas drift sideways while
appearing frozen — visible only while holding a pinch at the limit. `verify:viewport`
check 3 exists solely for this.

**Cmd is required for every canvas shortcut (`useViewport.ts`).** Agent TUIs claim
essentially every bare key, so from M3 a bare keystroke must always reach the PTY. Trackpad
gestures are safe to claim because terminals do not use them.

**No `StrictMode` (`src/renderer/main.tsx`).** Double-invoked effects would spawn a PTY, kill
it, and spawn it again on every mount. Intentional; leave it off while the PTY lifecycle is
still being proven.

**Fit before spawn (`session-registry.ts`'s `attachSlot`/`spawn`).** `attachSlot` calls
`session.handle.attach()` — which opens the terminal against its now-mounted host and fits it
— before `spawn()` reads `session.handle.size()` and passes those real `cols`/`rows` to
`pty:create`. Spawning at 80x24 and resizing after makes agent TUIs draw their frame twice and
leave artifacts.

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
repaints its entire frame on every SIGWINCH; resizing live would mean roughly sixty full
repaints a second, through a 16ms-batched channel, at intermediate sizes the user never meant
to keep. `verify:panels` check 11 asserts the grid (`__m4aGrid()`) is unchanged mid-drag and
only changes after mouseup.

**Stacking is `Panel.z`, never array order (`panels/panels.ts`, `Canvas.tsx`).** React
reconciles a reordered keyed list by moving DOM nodes, and a move is remove-then-insert —
which would momentarily detach the subtree holding a live terminal's host and its WebGL
context. M3's eviction proves a *deliberate* detach is survivable (dispose the addon,
`refresh()` on the way back); an incidental one triggered by clicking an unrelated panel does
none of that. `raisePanel` (`panels.ts`) only ever changes `z`; `Panel.z` renders as
`zIndex`, and `Canvas.tsx` sorts by `z` before calling `hitTest`, which returns the last
match — so paint order and pick order still agree. `verify:panels` check 16 asserts DOM order
is stable across a raise.

**Wheel ownership is decided by focus, in the capture phase (`useViewport.ts`,
`Canvas.tsx`'s `shouldYieldWheel`).** A wheel over the *focused* panel scrolls that terminal;
every other wheel — background, an unfocused panel, or any zoom gesture (a `ctrlKey` trackpad
pinch or a `metaKey` mouse wheel, the two spellings `canvas-input.ts` reads as zoom) — pans or
zooms the camera. The zoom exemption is unconditional and covers the focused panel too: `Cmd`
is the modifier every other canvas shortcut requires, so it cannot be the one input where the
canvas defers, and without the `metaKey` half a mouse user who had clicked into a panel could
not zoom while the cursor was over it. The listener is installed on the canvas host with `{ capture: true, passive: false }`,
not the bubble phase, and that is forced rather than chosen: xterm's own wheel handler is
bound on a descendant and runs first in the target phase, so by the time a bubble-phase
listener saw the event xterm had already scrolled. The first M4a implementation used bubble
phase and returned early without `preventDefault`, which fixed the easy case but not the real
one — a wheel over an *unfocused* panel still reached xterm on the way up and scrolled it
while the canvas also panned underneath, the same double-handling bug merely narrowed to a
smaller trigger. The shipped capture-phase listener asks the opposite question at the right
time: over the focused panel it returns with no `preventDefault`/`stopPropagation`, so the
event is untouched by the time it reaches xterm in the target phase; for everything else it
calls `stopPropagation()` first so xterm's target-phase listener never runs at all, then
`preventDefault()` and handles the pan/zoom itself. `verify:panels` check 12 asserts all three
halves: the focused terminal scrolls and the camera does not move, a `metaKey` wheel over that
same focused panel *does* move the camera, and an unfocused terminal does not scroll while the
camera does. Reverting this to a bubble-phase listener reintroduces
the double-handling defect it was written to fix.

**Dormancy outranks focus (`lod.ts`).** `assignTiers` pins the focused panel live
unconditionally, so restoring focus onto a restored panel would spawn a process at boot and
contradict "dormant until clicked" before the user ever touches the canvas. `attachSlot`
carries a second, deliberate dormancy guard on top of the tiering rule, so "no process starts
by itself" does not rest entirely on one pure function being right — `verify:viewport` 46–47
and `verify:registry` 16 cover the two layers separately.

**The store is main's because the quit flush cannot ask a dead renderer
(`main/layout-store.ts`).** `app.on('before-quit')` is main-side; if the renderer owned the
debounce, main would have to ask a renderer that `Cmd+R`/`Cmd+W` may already have destroyed —
the same failure `window-lifecycle.ts` exists to handle. `flushSync` must never throw, because
an exception there can wedge the quit before the window is allowed to close.

**`parseLayout` never throws and drops entries individually (`shared/layout-schema.ts`).** One
malformed panel costs that panel, not the whole file — a canvas that was mostly fine on disk
still opens mostly fine. **Duplicate ids are the one failure with no visible symptom**:
`registry.ensure` returns the existing session for a repeated id, so two panels in `layout.json`
silently render as one, because `handle.host` can live in exactly one DOM slot.

**`nextIdRef` seeds from the restored ids (`Canvas.tsx`).** Initialising it to `1` collides
with a restored `n5` after five `Cmd+N` presses on the previous run — the same id-collision
defect M4a fixed by replacing length-derived ids, resurrected through a different door if the
counter doesn't take the restored state into account.

**One history entry per committed gesture (`Canvas.tsx`).** A drag calls `setPanels` roughly
sixty times as the pointer moves; pushing an undo entry there makes one drag take sixty
`Cmd+Z` presses to unwind, while every check that only asserts final state still passes.
History is pushed once, on commit, not per intermediate update.

**Undo removing a panel must dispose its session.** `registry.dispose` has **three call sites
in `Canvas.tsx`** — the close button (`onClosePanel`), undo/redo removing a panel
(`applyHistory`), and the reset handler (`onReset`, dropping every panel at once). This is a
count worth re-deriving from the code rather than trusting a stale number: it was two until
the reset handler arrived in a later task and this line did not get updated alongside it — the
exact failure this note exists to prevent happening again. None of the three adds a caller of
`pty.kill`: `dispose(id)` and `disposeAll()` remain the only two inside `session-registry.ts`,
and routing all three through `dispose()` rather than calling `pty.kill` directly is exactly
what keeps that count true. Without the undo/redo call site, `Cmd+N` then `Cmd+Z` leaked a live
process with no panel left to close it.

**`Cmd+Z` is claimed, `Ctrl+Z` is not (`src/main/menu.ts`).** The same split the file already
draws between `Cmd+C` (copy) and `Ctrl+C` (SIGINT). The stock `'undo'`/`'redo'` menu roles are
unusable for the same reason `'copy'`/`'paste'` are: they drive `document.execCommand` against
whatever DOM element happens to be focused, not the canvas's own history stack. `Ctrl+Z`
reaches the PTY untouched and still suspends the foreground process as SIGTSTP.

**The plain-node verify bundles now configure a `@shared` alias
(`verify-viewport.cjs`, `verify-registry.cjs`, `verify-layout.cjs`).** Before M4b they
resolved no path aliases and got away with it because every cross-boundary import from
`@shared` was `import type`, which esbuild erases before bundling — nothing was ever actually
resolved. `panel-interaction.ts` now imports a real *value* from `@shared`, and that fails to
resolve without the alias wired into each esbuild config, the same one
`electron.vite.config.ts` and the tsconfigs already carry. The real-Electron suites
(`verify:canvas`, `verify:panels`) need no such alias — they load the already-built
`out/renderer/index.html`, where electron-vite resolved it long before esbuild ever runs.

**`RestoreSettings` lives in `layout.json`, not a second store.** The renderer never learns the
settings exist as a distinct concept; main applies them in `LayoutStore.initial()` and hands
the renderer an already-resolved starting state. A future settings surface should reach for
the same mechanism — one file, behind `LayoutStore` — rather than inventing a second store for
a fourth toggle.

**One operation became three (`window-lifecycle.ts`, `pty-manager.ts`,
`main/index.ts`).** Before M4c a single `killAll()` served every teardown path,
because under `node-pty` those paths genuinely meant the same thing. Under tmux
they do not: a renderer teardown calls **`detachAll()`** (local handles die, tmux
sessions live), closing a panel calls **`kill(id)`** which also calls
`backend.destroy(id)` (the session dies), and `before-quit` calls
**`shutdown()`** (`kill-server` on our private socket). Reverting
`attachPtyLifecycle`'s callback to `killAll` keeps every check in
`verify:window` green while silently restoring the M3 behaviour M4c exists to
remove — which is why `verify:pty-manager` check 12 asserts the reattached pid
is the *same* pid.

**The tmux client's exit code is always 1 (`session-backend.ts`,
`tmux-args.ts`).** Measured: an inner command exiting 0 and one exiting 42 both
produce client exit 1. `remain-on-exit on` plus a `pane-died` hook recovers the
real `#{pane_dead_status}`; the hook writes the file *before* `kill-session`, and
killing the session is what makes the client exit, so by the time `node-pty`'s
`onExit` fires the file is already on disk and main reads it in the handler it
already had. No watcher, no polling, no new IPC. Reversing those two hook
commands is a race that reports the wrong code intermittently.

**`parseListOutput` must filter `#{pane_dead}`.** The one place `remain-on-exit
on` leaks outside the exit path: a session whose command has exited still
*exists* until the hook kills it, so an unfiltered list reports a finished
process as live, boot reconciliation restores that panel non-dormant, and the
user gets a panel attached to a corpse that can never produce another byte.

**tmux is resolved by absolute path from the login env (`tmux-probe.ts`).** The
same defect `shell-env.ts` exists for: launchd gives a GUI app a bare PATH, so
`/opt/homebrew/bin/tmux` is not on it and spawning `tmux` by name fails exactly
the way `claude` does. `whichFromEnv('tmux', env)` is the fix, and it must run
*after* `resolveShellEnv()`.

**Dormancy is about spawning, not attaching (`renderer/main.tsx`).** A panel
with a live tmux session has nothing to spawn, so M4b's "restored panels are
dormant" rule does not apply to it — it reattaches like any M3 panel and
`LIVE_BUDGET` still caps how many at once. A panel with no live session still
restores dormant. `lod.ts` is untouched: a reattachable panel is not dormant and
never consults "dormancy outranks focus". A failed `pty:list` degrades to the
empty set, which restores everything dormant — the safe direction, because it
spawns nothing.

**The bundled tmux config is generated, not shipped (`tmux-args.ts`'s
`buildTmuxConf`).** The `pane-died` hook embeds `exitDir`, a per-run path under
`userData` that is unknowable until the app is running. Every line in it fails
*silently*: `prefix None` is what keeps `Ctrl+B` reaching the agent (the same
split as `Ctrl+C` and `Ctrl+Z`), `terminal-features ",xterm-256color:RGB"` is
what stops 24-bit agent output being downsampled to 256, and `mouse` must stay
**off** — `mouse on` makes tmux capture mouse reporting instead of passing it
through, silently defeating all of M4a's pointer correction from one process
further down.

## Gotchas

- **`Cannot read properties of undefined (reading 'whenReady')`** — your shell exports
  `ELECTRON_RUN_AS_NODE=1` (VS Code's extension host does this), so the Electron binary boots
  as plain Node. `dev`/`start` already `unset` it; you only hit this invoking `electron-vite`
  directly.
- **`Error: Electron uninstall`** — the binary download didn't run:
  `node node_modules/electron/install.js`.
- The renderer has a strict CSP in `src/renderer/index.html` (`default-src 'self'`). No CDN
  scripts, no remote assets.
- `tsconfig.node.json` / `tsconfig.web.json` both set `noUnusedLocals` and
  `noUnusedParameters` — prefix intentionally-unused params with `_`.
- A trackpad pinch arrives as a wheel event with **`ctrlKey: true`** and no key held. It is a
  WebKit convention Chromium adopted, and it is the only signal separating pinch from scroll.
- `deltaMode` is not always pixels: trackpads report `0`, mouse wheels report lines (`1`) and
  need roughly a 16x multiplier before the deltas are comparable.
- **A drag delta is `screenToWorld(p₂) − screenToWorld(p₁)`, never
  `screenToWorld(p₂ − p₁)`.** `screenToWorld` subtracts the viewport translation before
  dividing by scale; applying it to a delta subtracts a translation that should have
  cancelled, so the panel drifts off the cursor as soon as the viewport isn't at the origin.
  `verify:viewport` check 27 exists for this.
- **`applyDrag` (`panel-interaction.ts`) recomputes from the gesture's origin rect every
  frame, never from the previous frame's result.** Accumulating per-frame deltas drifts (each
  frame rounds, and at `scale: 0.1` one rounding is worth ten world units) and breaks outright
  if the user zooms mid-drag, since earlier deltas were measured under a transform that no
  longer applies. `applyDrag` itself only ever receives two already-resolved *world* points,
  so neither bug is reachable from inside the function — both are caller-side mistakes.
  `verify:viewport` checks 27 and 28 pin real properties of `applyDrag` (drag distance scales
  as `1/k`; the function is stateless) but are not what would catch either regression; the
  actual discriminator is `verify:panels` check 10, which dispatches a zoom mid-drag
  specifically to separate a correct recompute-from-origin implementation from one that
  accumulates screen-space deltas. A variant that instead advances *both* the drag state's
  origin fields together every frame is mathematically identical to the origin-based
  implementation and cannot be told apart by any assertion on the final rect — check 10's own
  header records that limit; don't rediscover it by trying to tighten the check.
- **A dispatched event on `.panel__slot` never reaches xterm's listeners.** `.panel__slot`
  only wraps the terminal's host div; xterm binds both its selection mousedown
  (`addDisposableDomListener(this.element, "mousedown", ...)`) and its mouse-reporting
  handlers (`bindMouse()`: `const t = this.element`) on `.xterm` — one level *below* the slot,
  not on `.xterm-screen`, which supplies only the rect the coordinates are measured against.
  Capture-toward-target traversal does not visit a target's own descendants, so an
  `executeJavaScript` check that dispatches on `.panel__slot` to verify "does xterm see this"
  will pass or fail for the wrong reason no matter what the guard under test actually does.
  Dispatch on `.xterm-screen` — a descendant of `.xterm`, so `.xterm`'s listeners are on its
  propagation path, and the same node a real cursor over the rendered terminal would be over.
  This cost two fix rounds in `verify-panels.cjs` during M4a.

## Working on this repo

Milestones follow a fixed shape: a design spec in `docs/superpowers/specs/`, then an
implementation plan in `docs/superpowers/plans/`, then tasks executed test-first — failing
checks written and *watched failing* against a non-existent module before it is implemented.
M2 and M3 are both worked examples of this. Follow it when starting M4c, the next unstarted milestone.

## Conventions

- Commits: conventional format scoped by milestone, e.g. `feat(m3): ...`, `fix(m3): ...`.
- Comments in this codebase explain *why*, especially for the workarounds above. Match that
  density; a non-obvious line without a reason attached will be "fixed" by someone later.
