# M24 — Drawing links: ports, snapping, and a curve that reads as deliberate

**Status:** design, approved 2026-08-30. Not yet planned.

**Backlog:** [#24](../../ideas-backlog.md), the decorative flavour. M13 built the
data model and the rendering; this milestone builds the *gesture*. #24's open
half — functional edges, an edge that pipes or restarts — stays open and is
explicitly out of scope here.

**Prior art in this repo:** M13's design spec
([`2026-08-30-m13-panel-links-design.md`](2026-08-30-m13-panel-links-design.md))
and the eleven `CLAUDE.md` entries beginning at "The code says `link`, and
`edge` already means something else". Everything M13 decided about the data
model stands unchanged.

---

## The problem

M13 shipped links that work and that almost nobody would find. Creating one is
a two-step armed mode: open the palette (or select the panel and find the
inspector's Link button), run a row, then click a target. The line that results
is a straight hairline between two borders — correct, and indistinguishable
from a debug overlay.

Three specific gaps:

1. **No direct manipulation.** Every other spatial act on this canvas is a
   drag: moving a panel, resizing one, sweeping a marquee. Linking is the one
   spatial relationship you cannot express by pointing at the two things.
2. **No aiming feedback.** The armed mode gives no preview. You click and find
   out. Releasing near-but-not-on a panel does nothing at all, and a gesture
   that silently does nothing reads as a broken feature rather than a miss.
3. **No undo affordance short of the sidebar.** `Cmd+Z` works, but a link drawn
   by mistake five gestures ago is a trip to the inspector.

## What ships

- Four **port handles** on every panel's border, revealed on hover. Press one
  and drag; release over a panel, or near one, to link.
- A **live ghost curve** following the cursor during the drag, with the
  prospective target highlighted, and every panel's ports revealed so the drop
  targets are visible rather than guessed at.
- **Snapping**: a panel you release over wins; otherwise the nearest panel
  within a screen-space radius.
- Links render as a **tapered cubic bezier** leaving each border
  perpendicular, with a solid arrowhead at the target end.
- **Hover an edge** to reveal a `×` badge at its midpoint that removes it.

## What does not ship

Named so a later reader does not mistake any of these for an oversight.

- **Persisted port sides.** An edge does not remember it left A's right side.
  Anchors stay derived from the live centre-to-centre bearing, so an edge
  re-routes itself when either panel moves. `linkAnchors` reserves an optional
  third parameter in its signature so a later milestone can pass explicit sides
  without rewriting the module; nothing passes it, and `PanelLink` does not
  grow a field.
- **Link selection.** No selected-edge state, no `Delete` key owner, no
  relabel-by-keyboard. A hairline at `MIN_SCALE` (0.1) is a sub-pixel target,
  which is why M13 declined this, and the reason has not changed. Relabelling
  stays the inspector's job.
- **Functional edges.** #24's open half. This milestone writes to no PTY.
- **Edge culling.** An SVG path holds no process, no WebGL context and no
  `LIVE_BUDGET` slot, so the reason panels are culled does not apply. If a
  canvas with two hundred links is ever slow, `LinkLayer` is where the
  viewport intersection test goes.
- **Removal of the existing armed mode.** `useLinkMode`, the palette's
  `panel.link` row and the inspector's Link button all stay exactly as they
  are. They are the keyboard-reachable path, `verify:palette` 76/77 pin them,
  and ports are an *additional* entry point rather than a replacement.

---

## Decisions, and what each one bought

Four choices were made before any code was designed, and they are recorded
here because each one closed off a materially different milestone.

**1. Ports, not modifier-drag.** A modifier-drag from anywhere on a panel needs
no new chrome, and is undiscoverable — and it would have to be prevented from
reaching xterm, which owns every bare gesture inside `.panel__slot`. Ports are
their own hit targets outside the slot, so they collide with nothing: not the
chrome's move-drag, not the resize handles, not the marquee, not the terminal.

**2. Snap to panel, anchors derived.** The alternative — remembering which side
each end left from — is a better diagramming tool and a materially larger
milestone: `PanelLink` grows two fields, so `parsePanel` and `parsePreset` both
move, `layout-adapt`'s `fromPanels`/`toPanels` round trip moves, and
`verify:layout` grows a block. **Because this decision went the other way,
`shared/layout-schema.ts` does not change at all in this milestone**, and
neither does the on-disk format. That is the single largest scope saving here
and it is why this question was settled second rather than last.

**3. Bezier, not orthogonal routing.** Elbow routing fits a dot-grid canvas
well and needs real routing logic — choosing the elbow, and deciding what to do
when two edges run collinearly, which is the common case rather than the rare
one. A bezier needs no routing decisions at all: the control points fall out of
the two anchor sides, and two edges between nearby panels stay
distinguishable because their curvature differs.

**4. Hover-only hit targets.** Fully selectable edges were declined for M13's
own reason (a sub-pixel target at low zoom) plus a new one: edge selection has
to coexist with panel selection and the marquee, and `Delete` would acquire a
second owner. A fully inert layer was declined because drawing an edge becomes
one gesture while removing one stays a trip to the sidebar. The middle answer
costs one documented guarantee a downgrade, described in full below.

---

## Architecture

### Module layout

| File | Change |
|---|---|
| `renderer/canvas/link-geometry.ts` | Extended: `linkAnchors` reports each anchor's **side**; new `linkPath()` and `nearestLinkTarget()` |
| `renderer/canvas/useLinkDraw.ts` | **New.** The drag gesture |
| `renderer/canvas/LinkLayer.tsx` | Curves, hover hit strokes, the `×` badge, the in-flight ghost |
| `renderer/components/PanelPorts.tsx` | **New.** The four handles, one component, five call sites |
| `renderer/components/TerminalPanel.tsx` | Mounts `<PanelPorts>` |
| `renderer/review/ReviewNode.tsx`, `renderer/file/FileNode.tsx`, `renderer/jira/JiraNode.tsx`, `renderer/toolbox/ToolboxNode.tsx` | Mount `<PanelPorts>` |
| `renderer/canvas/Canvas.tsx` | Owns the draw state; passes it to the layer and the ports |
| `renderer/styles.css` | `.panel__port`, the ghost, the badge, the curve |
| `renderer/panels/panels.ts` | **Unchanged** — `addLink`/`removeLink` already do exactly this |
| `shared/layout-schema.ts` | **Unchanged** |
| `shared/ipc-contract.ts` | **Unchanged** — no new channel; see below |

**No IPC channel is added, and `verify:ipc` stays at 45.** Links ride inside
`CanvasState` exactly as `panels` does, through the existing `layout:load`,
`layout:save` and `workspace:activate`. This is the sixth time this boundary
has been reached and declined (M6d's attention set, M7's waiting counts, M12's
`session:live`, M13's links themselves, M15's `subagent:state`, M17's
`usage:panel`), and it is stated because a draft spec has previously named a
wrong post-milestone channel count and a task written from it would have failed
the suite by "fixing" a correct number.

### Geometry — `link-geometry.ts`

Three functions, all pure, all in the plain-node `verify:viewport` bundle
beside `viewport.ts` and `lod.ts`.

**`linkAnchors(from, to, sides?)`** keeps its existing arithmetic verbatim. It
clips the centre-to-centre ray to each rect's border by taking the *smaller* of
the two per-axis parametric crossings and scaling the whole ray by that one
`t` — never clamping the two axes independently, which is `edgeIndicator`'s
documented mistake and which corners every diagonal while still rendering
something that looks like a working feature. `verify:viewport` 84 pins that
with a deliberately shallow diagonal, and this milestone does not touch it.

What it *adds* is a report of which side each anchor landed on
(`'n' | 'e' | 's' | 'w'`), which is a read of a decision the function already
makes: the side is determined by whether `tx` or `ty` bound the crossing, plus
the sign of `dx`/`dy`. It is new output, not new arithmetic.

The `sides` parameter is reserved and unused. It exists so decision 2's deferred
half can be taken later without rewriting the module; passing `undefined` is
today's behaviour and is what every caller does.

`null` for coincident centres is unchanged and stays load-bearing: there is no
direction to draw, and normalising a zero-length vector is how a `NaN` reaches
a transform and takes the *whole layer's* paint with it — every link gone, not
only that one, with nothing thrown.

**`linkPath(anchors)`** returns the SVG `d` string for a cubic bezier whose two
control points push **perpendicular out of the side each anchor sits on**:

```
        ╭──────╮
   ╭────╯      ╰──╮        control offset is axis-aligned to
A ─╯               ╰─▶ B   the reported side; magnitude is
                           clamp(distance × CURVE_RATIO, MIN, MAX)
```

Perpendicular is what makes the curve *leave* the border rather than kink at
it. The magnitude is clamped at both ends because an unclamped
`distance × ratio` makes a short link loop absurdly and a long one nearly
straight — the clamp is what keeps the curve reading the same way at every
distance.

**`nearestLinkTarget(rects, world, radiusWorld, excludeId)`** resolves a drop.
A panel *containing* the point always wins, which is `hitTest` unchanged.
Otherwise the nearest panel whose rect is within `radiusWorld`. The source is
excluded, or every drag would snap back to itself and the gesture could never
complete.

**The radius is screen pixels divided by `scale`, deliberately unlike
`CASCADE_STEP`.** `cascadeCentre`'s step is world-fixed on purpose, so a
cascade stays constant *relative to the panels* at every zoom. A snap radius is
the opposite problem: the user aims with a cursor in screen space, so a
world-fixed radius would be unhittable at 0.2× and absurdly grabby at 3×. Both
constants get a comment naming the other and why they differ.

### The gesture — `useLinkDraw.ts`

Modelled line for line on `usePanelDrag`: state in a ref, a `depsRef` mirroring
the callbacks so the listeners are installed once and never torn down, and
move/up listeners on `document` — the cursor leaves the panel immediately and a
listener on the panel would stop receiving events the moment it did.

```
mousedown on a port  →  stopPropagation + preventDefault
                        never starts a panel move, never reaches
                        xterm, never starts a marquee
mousemove            →  recompute the snap target every frame;
                        ghost curve and target highlight repaint
mouseup              →  snapTarget && !== source ? addLink : cancel
Escape               →  cancel
blur                 →  cancel
```

It carries `usePanelDrag`'s **buttons-up branch**: a move event arriving with
no button held ends the gesture rather than skipping it, because a gesture
whose document listeners outlive it is a mousemove that keeps recomputing state
nobody asked for.

`Escape` and `blur` listeners are installed **only while a draw is in flight**,
which is what keeps this from being an always-installed bare-key handler. The
app's rule is that a bare keystroke always reaches the PTY; every exception is
a visibly-present modal state, and a draw in flight — with a ghost curve on
screen following the cursor — is exactly that. `blur` is required rather than
defensive for `useNavGrid`'s reason: `Cmd+Tab` away means the `mouseup` may
never arrive here at all.

**Dropping on a dormant panel cannot wake it, structurally.** Waking hangs off
`onSelectPanel`, which fires from *mousedown*. Our mousedown was consumed by
the port; the mouseup lands on a panel that has no mouseup handler at all. So
M13's success criterion 2 holds by construction rather than by a guard — and it
still earns its own check, because "holds by construction" is precisely the
claim a later refactor breaks silently. Without it, one agent CLI spawns per
link the user draws on a restored canvas.

**Commit follows the existing rule.** `addLink` returns the *same array* when
it refuses (a self-link, or a duplicate), so `commitHistory` runs only on an
identity change: one undo entry per *committed* gesture, never one per attempt.
A refused drop is silent rather than a no-op that reads as a link which failed.

### Ports — `PanelPorts.tsx`

Four dots at the border midpoints, children of `.panel` so they ride `.world`'s
single transform exactly as `.panel__resize` does — placing them in screen
pixels instead would make them drift on every zoom.

```
      ┌──────·──────┐
      │             │        opacity: 0 at rest
      ·   panel A   ·        opacity: 1 on .panel:hover
      │             │        opacity: 1 on EVERY panel while
      └──────·──────┘          a draw is in flight
```

- **`z-index: 4`**, so a port beats `.panel__resize--se` (3) and `--e` / `--s`
  (2) where they overlap — `--e` covers the entire right border, so the
  midpoint port sits on top of it by construction. The cursor changing to
  `crosshair` over the port is honest feedback about which one wins.
- **Suppressed when `readOnly`**, matching the resize handles. That is the
  merged view, whose geometry is read-only; `addLink` there would write to a
  workspace record this canvas does not own.
- **Hidden below a minimum scale.** At 0.1× a 10px dot is one screen pixel. An
  affordance that cannot be hit is worse than one that is not offered, because
  it reads as a bug rather than as a limit.
- **The fade is `opacity: 0` → `1`.** Never a fractional rest value —
  `verify:styles` check 3 forbids fractional opacity, so a `.5` rest state
  fails the suite, and integers are what the design wanted anyway.
- **Every panel reveals its ports while a draw is in flight**, so the drop
  targets are visible rather than hunted for. This is the single largest
  contributor to the gesture feeling aimed rather than guessed.

Mounted by all five panel kinds. `links` lives on `PanelBase` and
`verify:viewport` 88 pins that the geometry never asks a panel its kind, so
every kind is *already* a valid endpoint today; this makes the gesture as
kind-agnostic as the arithmetic. One component, five call sites — terminal, review, file,
Jira and toolbox, the same shape the resize-handle block already takes in each
kind. The count is five rather than four because M19's Jira panel is a kind
this spec's own first draft forgot; `isTerminalPanel`'s negation names all four
non-terminal kinds and is the authority on the list.

### Rendering — `LinkLayer.tsx`

Unchanged in placement and in every reason for it: inside `.world` so it
inherits the one transform and pans, zooms and clips with the panels; beneath
the panels at `z-index: 0`, which is `Panel.z`'s own scheme rather than a
second one, and which costs nothing because `linkAnchors` puts both endpoints
*on* the borders so the whole curve including the arrowhead is outside both
rects.

Each edge now renders **two** paths plus an optional badge:

1. The **visible curve** — `linkPath`'s `d`, `markerEnd` arrowhead,
   `pointer-events: none`.
2. A **transparent hit stroke** — the same `d` at `stroke-width: 18`,
   `stroke: transparent`, `pointer-events: stroke`. It sets hover state and
   **never calls `stopPropagation`**.
3. The **`×` badge** at the curve's midpoint, rendered only while that edge is
   hovered. It **does** `stopPropagation`, because removing a link must not
   also deselect the canvas underneath.

The **in-flight ghost** renders in this same layer, since it needs the same
world-space transform: a dashed curve from the source anchor to the cursor,
plus a highlight ring on the prospective target. It is the one thing here drawn
from state that is not persisted.

### The guarantee that changes

`.link-layer` today sets `pointer-events: none` on the layer *and everything in
it*, and `CLAUDE.md` records why: a link must never swallow the background
click that clears `focusedId`, because `assignTiers` pins the focused panel
live unconditionally and an uncleared id holds a WebGL context and a
`LIVE_BUDGET` slot for the rest of the run.

The layer keeps `pointer-events: none`; the hit stroke and the badge opt back
in individually. So a mousedown *can* now land on something inside this layer,
and the guarantee is preserved by a different mechanism:

**`Canvas`'s background `onMouseDown` computes its hit from `clientX`/`clientY`
through `toWorld` and `hitTest` — it never reads `event.target`.** So a
mousedown on the hit stroke bubbles to it and behaves *identically* to a click
on bare canvas: selection clears, `focusedId` clears, a marquee begins.

That is a real downgrade in how hard the invariant is to break. It moves from
**"nothing in this layer can be hit"** — a property of one CSS declaration, and
structurally impossible to violate by accident — to **"things that can be hit
do not consume"**, which any future `stopPropagation` on the hit path
silently violates. A `stopPropagation` there would look entirely reasonable in
review, and the failure it produces is a panel pinned live for the rest of the
run with nothing on screen to explain it.

The response is to stop checking the structure and check the behaviour, which
is a stronger claim anyway. See the check-rewrite below.

---

## Verification

### `verify:viewport` — plain node, cheapest tier

- **`linkAnchors` reports the correct side.** Fixture is a deliberately
  **shallow** diagonal, for check 84's own reason: at 45° a wrong
  implementation answers the same side and the check proves nothing.
- **`linkPath` is pure**, and its control offsets are **axis-aligned to the
  reported sides**. Asserted as a *relation*, never as literal coordinates,
  which would go stale on any tuning of `CURVE_RATIO` and would then be
  "fixed" by pasting in whatever the implementation currently returns.
- **`linkPath` clamps at both ends** — a very short link and a very long one
  each produce an offset at the respective bound. One-sided clamps pass a
  one-sided check.
- **`nearestLinkTarget`**, three clauses that each reject a different wrong
  implementation: a *containing* panel beats a merely-near one; the source is
  excluded; a panel outside the radius returns `null`.
- **Existing checks 79–88 stay green untouched.** Any red there means the
  anchor arithmetic moved, which this milestone does not do.

### `verify:panels` — real Electron

- **The rewrite of check 127.** It currently asserts that `elementFromPoint` at
  a link's midpoint returns the **canvas** — structurally false the moment a
  hit stroke exists. It becomes the behavioural claim it was always really
  making: a real `sendInputEvent` click at a link's midpoint still reaches the
  background handler and moves the selection to `null`. That is strictly
  stronger, and it is the check that fails if a stray `stopPropagation` ever
  lands on the hit path. Its first draft must not read `__m4aSelection`, which
  is the focused terminal's *text* selection and answers `''` whatever the
  click did — the trap 127's own history already records.
- **A drag from a port to a target creates exactly one link**, end to end,
  asserted by the `data-link` key carrying **both ids in order** rather than by
  "an svg exists", which an empty layer satisfies.
- **The dormancy check** — 126's argument through the new door. Asserted as
  `spawned === false`, **never** as the id being absent from `__m4aSessions()`:
  the registry mints a `PanelSession` for every rendered panel including a
  dormant one, so the absence form fails against correct code, which is exactly
  how 126's own first draft failed.
- **A drop in empty space, outside the radius, creates nothing** — and the
  non-vacuity clause is that the same fixture's *in-radius* drop does create a
  link, or the check passes against a gesture that never worked at all.
- **The `×` badge removes a link, and one `Cmd+Z` restores it.** Driven through
  `__m4bUndo`, never a dispatched `Cmd+Z`: undo is a main-process menu
  accelerator delivered as IPC, so a synthetic `KeyboardEvent` reaches nothing
  — the trap check 128's first draft fell into.
- **Ports are absent in the merged view**, asserted alongside a panel that
  *has* them in the same read, so "no ports anywhere" cannot pass as success.

### `verify:styles`

No new rules. The port fade must use integer opacity (check 3), the curve and
badge take their colours from theme tokens only (checks 1 and 2), and any new
spacing or radius comes from the scales (checks 4–6).

### What no check can cover

Stated up front rather than discovered later. **There is no visual regression
test in this repo, and that is a position rather than an omission.** So:

- The **feel** of the curve — `CURVE_RATIO` and its two clamps — is verified by
  hand once and by nothing else. A green suite says the curve is pure and
  correctly anchored; it says nothing about whether it looks right.
- The **snap radius** is the same. A radius that is too grabby links the wrong
  panel and every check still passes.
- **`opacity` transitions and hover reveal** are CSS, and no suite here renders
  anything.

These get a hand-check once, recorded in the implementation plan's final task
with the same standing this repo already gives the `isAutoRepeat` probe, the
`--session-id` filename rule and the link layer's own pixel probe: a fact about
one machine on one day, written down, and not counted as coverage.

---

## Risks

**The pointer-events downgrade is the one that matters**, and it is described
in full above. Its mitigation is check 127's rewrite and a `CLAUDE.md` entry
stating the new mechanism in the same terms as the old.

**Ports could crowd a small panel.** Four dots on a panel dragged down to its
minimum size is visually tight. Mitigated by the hover reveal — at rest there
is nothing there — and by the minimum-scale hide. If it still reads badly at
minimum size, the fix is to drop the north and west ports rather than to shrink
the dots below a hittable size.

**A drag that starts on a port and ends on the same panel** must cancel
silently. `addLink` already refuses a self-link, so this is free, but the
gesture must not leave the ghost curve on screen — the cancel path and the
commit path both have to clear the draw state.

**`hitOrder` is already sorted by `z`,** so `nearestLinkTarget`'s
containing-panel case inherits correct top-of-stack behaviour for free. A
future change that hands it an unsorted array would break the overlap case
quietly; the function's comment must say which order it expects.

---

## Success criteria

1. A user who has never opened the palette can draw a link, by hovering a panel
   and dragging from a dot.
2. Releasing *near* a panel links to it; releasing in genuinely empty space
   creates nothing, and neither outcome is silent-and-ambiguous — the ghost and
   the target highlight say which one is about to happen before the release.
3. No path through this gesture spawns a process. Dropping on a dormant panel
   links it and leaves it dormant.
4. A plain click on a link behaves exactly as a click on bare canvas: selection
   clears, `focusedId` clears, a marquee begins.
5. Hovering a link offers removal; one `Cmd+Z` undoes a drawn link, and one
   undoes a removed one.
6. `shared/layout-schema.ts`, `shared/ipc-contract.ts` and `panels/panels.ts`
   are byte-identical to their pre-milestone state.
