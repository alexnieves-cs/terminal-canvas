# M3 — Real terminals on the canvas

Date: 2026-08-23
Status: approved, not yet implemented
Milestone: M3 (`README.md` roadmap)

## Goal

Merge the two halves built deliberately apart. M1 shipped a live PTY with no
transform math; M2 shipped transform math with no PTY. M3 puts real terminals
into the canvas's world layer, adds level-of-detail tiers and viewport culling,
and ends the temporary regression where `App.tsx` renders placeholder rectangles.

This is the first milestone where a bug could plausibly come from either side,
so the design's main job is to keep the two lifetimes — a panel's process and a
panel's rendering — from being confused for one another.

## Scope

**In scope**

- A retained per-panel session that owns the `Terminal` and outlives React mounts
- Two LOD tiers: a live xterm, and a cheap card for everything else
- Viewport culling with a WebGL context budget
- Lazy PTY spawn on first live-ification
- Focus model: panel chrome selects, panel body passes through to xterm
- `Cmd+N` to spawn a panel at the viewport centre

**Explicitly out of scope**

- Dragging, resizing, or closing panels (M4)
- Persisting viewport or panel positions (M4)
- tmux-backed sessions surviving a reload (M4)
- Correcting pointer coordinates at arbitrary zoom (deferred; see "Focus and input")
- Presets and a command palette (M5)

**The M2 regression ends here.** `PlaceholderPanel.tsx` and
`placeholder-panels.ts` are deleted; the canvas renders sessions.

## The central problem

`TerminalPanel`'s effect cleanup calls `pty.kill(panelId)`. That is correct in
M1, where a panel is mounted for the lifetime of the app, because "this
component is unmounting" and "this panel is going away" are the same statement.

Culling breaks that equivalence. If a tier change unmounts the component, an
off-screen panel's agent is killed — and the failure is silent: the panel scrolls
back into view looking like a fresh terminal, and nothing logs an error. Work is
destroyed by a zoom gesture.

So panel state splits into two lifetimes:

- **The session** — created once, disposed once. Owns the `Terminal`, the PTY,
  and the panel's status. Lives in a module-level `Map`, outside React.
- **The view** — mounted and unmounted freely by tiering. Owns nothing.

Everything else in this document follows from that split.

## Architecture

```
src/renderer/session/
  panel-session.ts      one panel's retained state; no React
  session-registry.ts   Map<PanelId, PanelSession>, the single IPC subscription

src/renderer/panels/
  panels.ts             panel geometry + specs; replaces placeholder-panels.ts

src/renderer/canvas/
  lod.ts                pure tier assignment — no DOM, no React
  Canvas.tsx            renders sessions, owns selection + focus

src/renderer/components/
  TerminalPanel.tsx     thin view: attaches a host, or renders a card

src/renderer/terminal/
  create-terminal.ts    split into construct (detached) and attach (opens)
```

### `panel-session.ts`

```ts
interface PanelSession {
  spec: PanelSpec
  host: HTMLDivElement       // created detached, never re-created
  term: Terminal | null      // constructed on first live-ification
  fitAddon: FitAddon | null
  webgl: WebglAddon | null   // held only while live
  status: Status
  live: boolean
  lastFocusedAt: number
}
```

`host` is what makes tiering non-destructive. `term.open(host)` happens exactly
once, the first time the panel goes live. After that, changing tier moves that
div between the React slot and a detached holder. Moving a DOM node preserves
the element and everything xterm has drawn into it; calling `open()` a second
time is not a supported operation.

### `session-registry.ts`

Owns the `Map`, and **one** `onData` / `onExit` subscription for the whole
canvas, routing chunks by `panelId`.

Today each panel subscribes and filters by id, so with N panels every chunk
crosses N listeners and is discarded N−1 times. At one panel that is free; at
twenty panels with an agent repainting, it is twenty times the work to deliver
the same bytes.

Chunks are written straight to `session.term` and never enter React state.
Routing 16ms-batched output through `setState` would re-render the canvas at
60Hz for content React does not draw. React subscribes to the registry for
*status* changes only (`useSyncExternalStore`).

### `create-terminal.ts`

Splits into `createTerminal()` — constructs the `Terminal`, loads the fit addon,
returns it detached — and `attachTerminal(handles, host)` — calls `open()`, loads
a WebGL addon, fits. The split is required because `open()` measures font
metrics and cannot run against a node outside the document. The file remains the
only place a `Terminal` is constructed.

### `lod.ts`

Pure, plain-node testable alongside `viewport.ts`:

```ts
assignTiers(input: {
  rects: WorldRect[]
  viewport: Viewport
  size: { width: number; height: number }
  focusedId: PanelId | null
  budget: number
  lastFocusedAt: Record<PanelId, number>
}): Record<PanelId, 'live' | 'card'>
```

A panel is live when it intersects the margin-expanded viewport rect, `scale >=
LIVE_MIN_SCALE` (0.5), and it fits within `budget` (8) — plus the focused panel,
always, unconditionally. Eviction is least-recently-focused.

The budget is 8 rather than the browser's ~16 context cap because the cap is
where contexts start being dropped, not where it is safe to sit.

## Panel model and spawning

A panel is its geometry plus its spec. `src/renderer/panels/panels.ts` replaces
`placeholder-panels.ts` and holds both:

```ts
interface Panel { rect: WorldRect; spec: Omit<PanelSpec, 'cols' | 'rows'> }
```

`cols`/`rows` are deliberately absent: they are not known until the panel is
attached and fitted, and inventing them here would reintroduce the spawn-at-80x24
problem that lazy spawn exists to avoid. The registry supplies them at
`pty.create` time from the fitted terminal.

Panel rects live in React state in `Canvas`, seeded from a hardcoded list of
about a dozen entries scattered well outside the initial viewport — the same
arrangement M2 used, so that panning to find something and culling having
something to cull both remain testable by hand.

`Cmd+N` appends a panel whose rect is centred on the current viewport in world
coordinates, at the same default size as the seeded ones, with a default spec
(the login shell, cwd `~`). It is the one M4 item pulled forward, because
exercising culling and eviction by hand is impractical when the panel count is
fixed at build time. It creates geometry and a session only; the PTY still
spawns lazily on first live-ification, like every other panel. Closing panels
remains out of scope, so `Cmd+N` is one-way within a run.

Panel rect size is fixed for M3. Resizing is M4.

## Data flow

```
main --pty:data--> registry (single listener) --> session.term.write(data)
main --pty:exit--> registry --> session.status --> React re-render (status only)

pan/zoom --> viewport --> assignTiers() --> promote / demote
```

### Tier transitions

```
never-live --first live--> createTerminal, append host, attachTerminal,
                           fit, THEN pty.create
live       --demoted-----> dispose WebGL addon (frees the context), remove host
                           from the DOM. Terminal survives. PTY keeps running.
card       --promoted----> re-append host, load a FRESH WebglAddon, fit,
                           pty.resize only if cols/rows changed
any        --disposed----> pty.kill  (M4's close button; M3 calls this only on
                           window teardown)
```

Only WebGL addons are created and destroyed by tiering. The `Terminal` and the
PTY are created once and destroyed once.

### Lazy spawn is forced by an existing invariant

A PTY is created when its panel first goes live, not at startup. This is not an
optimization. "Fit before spawn" requires real `cols`/`rows`, which requires an
attached, laid-out DOM node — so a panel that has never been on screen cannot
know its size. Spawning it early would mean spawning at 80x24 and resizing,
which is exactly what makes agent TUIs draw their frame twice and leave
artifacts. Lazy spawn is what lets the invariant hold.

It also prevents a hardcoded twenty-panel list from launching twenty coding
agents the moment the app opens. Un-spawned panels render as a card reading
"not started".

### The card's text is derived, not stored

A card shows the panel's title, status, and last few output lines read from
`term.buffer.active` at render time. Keeping a separate rolling buffer would
duplicate every byte and require a hand-rolled ANSI stripper; xterm already
maintains a parsed, escape-free grid. A session that has never been live has no
buffer — and no output either, because of lazy spawn.

## Focus and input

**Panel chrome selects; panel body passes through.** Clicking the header strip
selects the panel (and becomes drag in M4) and stops propagation so the canvas
does not treat it as a background click. Clicking the body focuses xterm's
textarea. Clicking empty canvas deselects.

Keyboard is zoom-independent and needs no correction: focus is a DOM concept.
Keystrokes reach the PTY through the existing `term.onData` path. Cmd-modified
keys are intercepted at the window level by `useViewport`, and agent TUIs never
claim Cmd. Ctrl+C remains untouched and arrives as SIGINT.

### Pointer coordinates: gated, not corrected

Verified against the installed xterm 5.5.0: `getCoordsRelativeToElement`
computes `clientX - rect.left - paddingLeft`, and `getBoundingClientRect()` is
transform-aware, so that offset is in *screen* pixels. `getCoords` then divides
it by `dimensions.css.cell.width`, which is unscaled CSS pixels. The reported
column is therefore exactly `k` times the true column. The padding subtraction
is unscaled too, a second and smaller error term.

The correction is arithmetically trivial — hand xterm a synthetic `clientX` of
`rect.left + (realClientX - rect.left) / k` — but delivering it means
intercepting and re-dispatching mouse events, tracking drag-selection out to the
document, and handling mouse-reporting TUIs as a second path.

**M3 gates instead.** Body clicks reach xterm only when `k` is within
`[0.9, 1.1]`; outside that band a body click focuses the panel and nothing more.
`claude` and `codex` are keyboard-driven; the mouse mostly matters for selecting
text to copy, which happens at reading zoom anyway. Full correction is available
as an additive change in M4, next to the drag/resize work that needs pointer
math regardless.

## Error handling

- **Spawn failure** sets `status: error`; the card shows the message. No retry loop.
- **Process exit** sets `status: exited`, writes the existing exit notice into the
  terminal, and leaves the buffer readable. The panel stays until M4.
- **WebGL context loss** disposes the addon and falls back to DOM rendering, as
  today, and additionally marks the session so promotion does not immediately
  request a fresh context and lose it again.

Three failure modes specific to this design:

**The detach/refit trap.** `TerminalPanel`'s `ResizeObserver` refits and resizes
the PTY on any container size change. Detaching a host makes its content box
zero, so the observer fires at 0x0, `fit()` computes a nonsense grid, and a
running agent's shell is resized to roughly 1x1 — it reflows and redraws into a
sliver, looking like a rendering bug rather than a lifecycle bug. Ignore any
observation with zero width or height, and ignore observations entirely while
the session is not live.

**Tier thrash.** A panel at the viewport edge would flip live/card every frame,
destroying and recreating a WebGL context each time. Cull against a
margin-expanded viewport rect so promotion and demotion happen at different
boundaries, and demote on a short delay while promoting immediately. The symptom
appears only during a gesture, which is the hardest kind to notice in review.

**Budget versus focus.** The focused panel is pinned live unconditionally, so a
full budget must evict something else — possibly a panel that is fully on
screen. That is correct and surprising, so it needs a comment where it happens.

## Testing

### Unit — plain node, extending `verify:viewport`

`lod.ts` is pure, so it joins `viewport.ts` under the existing script.

| # | Assertion |
|---|---|
| 1 | Off-screen panels are cards; on-screen panels are live |
| 2 | The margin band promotes earlier than it demotes (no thrash at the edge) |
| 3 | Below `LIVE_MIN_SCALE` every unfocused panel is a card |
| 4 | Live count never exceeds the budget |
| 5 | The focused panel is live off-screen, below threshold, and over budget |
| 6 | Eviction picks the least-recently-focused panel |

### Integration — real Electron, against the built renderer

Written and watched failing before the implementation exists. Check 1 comes
first because everything else rests on it.

| # | Assertion |
|---|---|
| 1 | A `Terminal` whose host is detached accepts `write()` and renders correctly once re-attached and refitted |
| 2 | Zooming out demotes panels to cards and `pty:list` returns the same session count |
| 3 | The focused panel stays live below the zoom threshold |
| 4 | Live panels never exceed the context budget |
| 5 | A body click at 100% reaches xterm; the same click at 0.7 focuses without reaching xterm |

Check 2 is the one to keep if only one could be kept: it is the check that
catches culling killing a running agent, a failure that is silent, delayed, and
destroys user work. It is only possible because M1 built `pty:list` for an
unrelated reason.

Check 1 is an assumption, not a known: that xterm tolerates a detached host. If
it needs an explicit `refresh()` on re-attach, that is a small addition; if the
buffer corrupts while detached, the eviction design changes shape — which is why
it is proven on day one rather than discovered three tasks in.

## Forward notes for M4

- `pty:list` plus the session registry is the reconciliation path: a fresh
  renderer asks main what survived and rebuilds sessions around it, rather than
  spawning duplicates.
- Full pointer correction lands here, alongside drag and resize, which need
  screen-to-world math on panel geometry anyway.
- The registry is the seam tmux backs. Sessions already survive React; M4 makes
  them survive the renderer.
