# M13 — links between panels

Backlog [#24](../../ideas-backlog.md). Draw a line from one panel to another and
have it mean something: this agent's output feeds that one, these three are the
same ticket, this shell is the server the panel beside it is testing against.

Relationships between concurrent work are invisible in every tabbed terminal,
because a tab list has one dimension and a relationship needs two. After #7
(subagent visualisation) this is the second thing an infinite canvas can show
that a multiplexer structurally cannot.

## The name is `link`, not `edge`

Backlog #24 says "edges". The code says **link**, everywhere, and the rename is
deliberate rather than a preference.

`edge` is already taken twice in this repository, and both meanings are about
something else entirely: `renderer/canvas/EdgeIndicators.tsx` is the off-screen
attention pip layer, and `viewport.ts`'s `edgeIndicator` is the function that
computes where one of those pips lands on the viewport's edge. A second,
unrelated "edge" concept landing in `renderer/canvas/` would make every future
`grep -rn edge src/` ambiguous between "a pip pointing at an off-screen agent"
and "a line between two panels" — two features that have nothing to do with
each other and would then be one search result.

This entry exists so a later reader who arrives from the backlog does not read
the absence of the word "edge" as the absence of the feature.

## What this is, and what it deliberately is not

#24 names two flavours and says in as many words that they "should not be built
at once". This milestone builds the first and **only** the first.

- **Decorative — this milestone.** A link means whatever the user says it means,
  like a line on a whiteboard. It is a directed, optionally labelled line
  between two panels. It costs a data model, a create gesture, a delete
  affordance, and persistence.
- **Functional — not this milestone, and not next by default.** An edge that
  *does* something: pipe this panel's output into that one's input, restart this
  one when that one exits. #24 calls it "genuinely powerful and genuinely
  dangerous, because it means the canvas is now writing to PTYs on its own
  initiative", and everything #21 says about a mode you can forget you are in
  applies double to a rule that fires while you are not present. #24 also asks
  an open question this milestone does not answer: whether a rule you can only
  see by finding a line on the canvas is auditable at all, or whether the canvas
  would first need a plain list view of its own automations.

Building the primitive generally rather than as a private detail of #7's
subagent visualisation is #24's own recommendation: same renderer, same
z-order question, same persistence.

## Success criteria

1. A user can create a directed link between two panels, and it survives a quit
   and a relaunch.
2. Creating a link never starts a process. The completing click must not reach
   `onSelectPanel`, which wakes a dormant panel.
3. Closing a panel removes every link touching it — both directions — and a
   single `Cmd+Z` restores the panel **and** those links together.
4. A link takes no `LIVE_BUDGET` slot and no WebGL context, and no link can
   cause a panel to be demoted.
5. A link never intercepts a pointer event. Every click that would have hit a
   panel or the background still does.
6. There is no state in which the link-creating mode is armed and invisible.
7. No new IPC channel: `verify:ipc` stays at 31, and `verify:meta` 14 (every
   channel appears in the README) needs no README edit.

## The data model: adjacency on the source panel

```ts
export interface PanelLink {
  /** The panel this link points AT. The source is the panel holding it. */
  to: string
  label?: string
}

export interface PanelBase {
  rect: WorldRect
  z: number
  title?: string
  links?: PanelLink[]
}
```

A link lives on the panel it points *from*. The obvious alternative — a
top-level `links: Link[]` beside `panels` — was considered and rejected, and the
reason is specific to this codebase rather than general modelling taste.

**The undo stack is literally typed to the panel array.** `Canvas.tsx` holds
`History<Panel[]>`, and `history.ts`'s own header records why: "the undo stack
and the persistence snapshot are the same data". A top-level links array is a
second piece of canvas state, so it would force `History<{ panels, links }>` and
a rewrite of `commitHistory` and `applyHistory` — which are the two functions in
this repository carrying the loudest caveat there is. `commitHistory` is called
from *inside* `setPanels` updaters and `applyHistory` calls four setters from
inside a `setHistory` updater; the comment above them says this is safe "ONLY
because this app deliberately runs without StrictMode" and that the whole chain
"needs re-auditing before trusting it again" if that ever changes. Rewriting
them to carry a second collection is the single most expensive change this
feature could ask for, and adjacency asks for none of it: a link rides `Panel`,
so undo and redo work with **zero** changes to either function.

**The link is directed, so the source is a natural owner.** The usual objection
to storing a relation on one endpoint is that the choice of endpoint is
arbitrary. It is not arbitrary here — the arrowhead is at `to`, so `from` is a
real asymmetry in the model, and adjacency-on-source is the standard
representation of a directed graph.

**Cascade-delete becomes one pure function.** See below.

The cost, recorded rather than hidden: answering "what points at this panel"
is a scan of every panel rather than a lookup, and the render layer must
flatten `panels.flatMap(p => p.links)` on every frame of a drag. Both are O(n)
over a canvas that `LIVE_BUDGET` already caps interaction with at eight live
panels and which has never held more than a few dozen; neither is worth an
index. If the functional flavour ever lands and links acquire behaviour,
scheduling, or their own identity, that is the moment to revisit this — and
the History refactor above is exactly what such a milestone would have to pay.

`links` sits on `PanelBase`, so a review node can be an endpoint too. Linking a
review node to a second agent's panel is meaningful, and there is no reason for
the union's two arms to disagree about this.

## Cascade delete: one pure function, one undo entry

`removePanel(panels, id)` grows a second responsibility: it drops the panel
**and** strips every link that points at it.

```ts
export function removePanel(panels: Panel[], id: string): Panel[] {
  return panels
    .filter((p) => p.rect.id !== id)
    .map((p) => pruneLinksTo(p, id))
}
```

Outgoing links vanish with the panel that holds them, for free. Incoming links
are what this map is for, and they are the half that produces #24's named
failure — "dangling edges are the standard failure of every graph UI that stored
ids without deciding this".

Putting the prune **in `removePanel`** rather than at its call sites is what
makes success criterion 3 true without touching the undo plumbing at all.
`removePanel` has exactly two callers, and both are the two branches of
`Canvas.tsx`'s `onClosePanel` — the review-node branch, which drops the panel
and nothing else, and the terminal branch, which disposes the session first.
Both are already inside a `setPanels` updater whose result is handed straight to
`commitHistory(next)` — so the panel and its links
leave in one committed gesture, land in one history entry, and one `Cmd+Z`
brings back both. A prune written at the call sites instead would have to be
repeated correctly at each one, and the one that got missed would leave a link
pointing at nothing with no error anywhere.

The three paths that remove many panels at once need nothing: `applyHistory`
replaces the whole array from a stored snapshot, and `resetCanvas` and
`deleteWorkspace` discard every panel in scope, so none of them can leave a
survivor holding a stale link.

**The render layer prunes again anyway**, and that redundancy is deliberate.
`buildLinkSegments` skips a link whose `to` is not in the panel array it was
handed. That is defence against a state `removePanel` cannot see: a file
hand-edited between launches, a future third removal path, or the workspace
boundary (`PanelId` is global — see CLAUDE.md's "Panel ids are global, not
per-workspace" — so a link naming a panel that lives in a *different* workspace
resolves to nothing on this canvas and must render nothing rather than throw).

## Geometry — `renderer/canvas/link-geometry.ts`

| File | Tier | Responsibility |
|---|---|---|
| `renderer/canvas/link-geometry.ts` | plain node | `linkAnchors`, `buildLinkSegments` — pure |
| `renderer/canvas/LinkLayer.tsx` | — | the one SVG layer inside `.world` |
| `renderer/canvas/useLinkMode.ts` | — | the one-shot armed state |

`link-geometry.ts` imports nothing but types, so it joins the plain-node
`verify:viewport` bundle beside `viewport.ts` and `lod.ts` — the same placement
`nav-grid.ts` and `rail-rows.ts` earned for the same reason. The gesture is the
risky half of this milestone and the arithmetic is not, and keeping them in
separate files is what lets the arithmetic be checked in seconds.

```ts
linkAnchors(from: WorldRect, to: WorldRect): LinkSegment | null
```

The line runs between the two rects' **borders**, not their centres: a line
drawn to a centre disappears under the panel it points at, so the arrowhead —
the only thing carrying direction — would never be visible. Each endpoint is the
centre-to-centre ray clipped to that rect's border.

**It clips a ray; it does not clamp two axes independently.** This is the same
mistake `CLAUDE.md` records for `edgeIndicator` one file over, and it fails the
same silent way: clamping `dx` to the half-width and `dy` to the half-height
separately sends every diagonal to a corner, so links leave and enter panels at
the same four points regardless of the true bearing — and still render, and
still look like a working feature. The computation takes the smaller of the two
per-axis parametric crossings and scales the whole ray by that one `t`.

`null` for coincident centres: there is no direction to draw, and normalising a
zero-length vector is how a `NaN` gets into a transform and takes the whole
layer's paint with it. Overlapping-but-distinct centres still return a segment;
it is short, and that is the honest picture of two overlapping panels.

## Rendering — one layer, beneath the panels, deaf to the pointer

One `<svg>` element inside `.world`, a sibling of the panels, at `z-index: 0`.

**Inside `.world`, so it inherits the one transform.** `.world` carries the
single `translate()` `scale()`, so a world-space SVG pans, zooms and clips
correctly with no additional math — the same argument that puts panels there and
the exact opposite of `EdgeIndicators`, which is a sibling *of* `.world`
precisely because a viewport-pinned pip must not zoom away.

**Beneath the panels, and that IS `Panel.z`'s scheme rather than a second one.**
#24's constraint is that links "join `Panel.z`'s ordering rather than inventing
a second scheme"; a single layer at `z-index: 0` is a position *within* that
scheme. `nextZ` returns `max(..., 0) + 1`, so every panel this app has ever
minted has `z >= 1` and sits above it. Below rather than above is the right
choice on its own merits too: a line painted over a terminal obscures the agent
output the app exists to show, and because the anchors sit on the panel borders
the whole segment — arrowhead included — is outside both rects and visible
anyway.

The one gap, recorded rather than closed: `parsePanel` accepts any finite `z`,
so a hand-edited `layout.json` with `"z": -1` would paint that panel *under* the
links. Clamping in the parser would change the behaviour of existing files for a
cosmetic case that no gesture in this app can produce, so it is left alone.

**`pointer-events: none` on the layer and everything in it.** This is success
criterion 5, and making it a property of the layer rather than of a hit-test is
what makes it hold without anyone remembering. A link cannot swallow a click
aimed at a panel, cannot swallow a background click (which is what clears
`focusedId`, releasing a pinned live panel and a WebGL context), and cannot
interfere with the capture-phase palette dismissal on `.shell`. It also means
this milestone adds nothing whatsoever to `shouldYieldWheel`.

**No culling.** A link is an SVG path with no process, no WebGL context and no
budget slot, so the reason panels are culled does not apply. Stated as a known
limit rather than a claim: nobody has measured a canvas with two hundred links,
and if that is ever slow the fix is the viewport intersection test this layer
does not currently do.

The layer is `memo`'d on the flattened segment list so a re-render of `Canvas`
that changed no rect repaints nothing. It re-renders on every frame of a panel
drag, which is correct — the link's endpoint is moving — and is the same cost
`EdgeIndicators` already pays.

## Creating a link — a one-shot armed mode

Arming is a verb on a panel: a palette row (`panel.link`, aimed at
`capturedId` — the same rule `panel.rename` obeys, since opening the palette
moves DOM focus to its input and deliberately leaves `focusedId` alone) and an
inspector button on the selected panel. Either sets `linkFrom`, and the canvas
shows a banner naming the source panel and the two ways out.

The next **mousedown inside `.canvas`** resolves it, on a capture-phase listener:

- it hit-tests the click's world point against `hitOrder`, the same z-sorted
  rect list the background handler already uses;
- a hit on any panel other than the source completes the link;
- a hit on the source, or on the background, cancels;
- either way the event is stopped, and the mode disarms.

**Capture phase is the load-bearing part, not a detail.** Every panel's own
chrome handler `stopPropagation`s its mousedown, so a listener on the background
`onMouseDown` would never see a click on a panel — which is every click that can
complete a link. Worse, letting the click through to a panel's own handler
reaches `onSelectPanel`, which clears the dormant id and calls `registry.wake`:
completing a link onto a dormant panel would **spawn an agent**, which is
success criterion 2 failing and precisely the accident the dormancy rule exists
to prevent. Stopping the event in the capture phase is what makes the completing
click do one thing.

Hit-testing the **world point** rather than reading `event.target` is what makes
a click on a panel's chrome, its card, and its terminal body all mean the same
thing, and it reuses arithmetic that is already pinned.

**`Escape` cancels**, and this is the one place this milestone claims a bare
key. The rule everywhere else is that a bare keystroke must always reach the
PTY, and the exceptions are all modal surfaces that are visibly present: the
palette swallows every key while it is open, and `useNavGrid` claims bare
`Escape` and bare arrows while its overlay is up. An armed link mode is the same
shape — visible, and claiming exactly one key — and it is **one-shot**: the
first mousedown anywhere resolves it either way, so unlike #21's broadcast mode
there is no state to be left in. That, plus the banner, is success criterion 6.

`blur` disarms too, for `useNavGrid`'s reason: `Cmd+Tab` away and back should
not leave a canvas armed.

**Two rules refuse a link at creation**, both in the pure module so both are
checkable: a panel cannot link to itself (`from === to` is a segment with no
direction and a self-loop this renderer has no shape for), and a second link
`A → B` is a no-op rather than a duplicate (two identical overlapping paths are
indistinguishable from one, which is the same indistinguishability argument
`cascadeCentre` is built on). `B → A` alongside `A → B` **is** allowed: they are
different claims.

A link is created **unlabelled**. The alternative — prompting for a label as a
third step — makes the common case slower and gives `Escape` two meanings mid
gesture. Labelling is a separate, later act, exactly as a panel is created
unnamed and renamed from the palette afterwards.

## Deleting and labelling — the inspector

The inspector grows a **Links** section for the selected panel, listing both
directions (`→ auth refactor`, `← server`) with each link's label, a remove
control, and a rename control that reuses the existing palette input mode.

There is deliberately **no link selection and no bare `Delete` key**. Selecting
a link means hit-testing a hairline, which at `MIN_SCALE` (0.1) is a sub-pixel
target — an affordance that exists in the code and not on the screen — and it
would force the layer to take pointer events, giving up success criterion 5 for
it. The inspector is where this app already manages the things it can list, and
a link is discoverable there whether or not the user can see the line.

`buildLinkFields` joins `inspector-fields.ts`'s existing model and therefore
`verify:rail`, the same placement `rail-sections.ts` and `review-node-model.ts`
already have, and for the reason that entry gives: a fourth pure file does not
need a fourth suite to re-prove the same esbuild wiring.

The inspector model is frozen on `inspectorSignature`, so the signature must
cover the links — a live value the signature does not cover renders once and
then never updates again, stuck at whatever it was when the panel was selected,
with nothing throwing. That is `verify:rail` 63's lesson from M12 and it applies
here unchanged.

## Persistence — no new key, no new channel

`links` is an optional field on `PersistedPanelBase`, so it round-trips through
`layout-adapt.ts`'s `fromPanels`/`toPanels` and `parsePanel` beside `title`.

**Absent means none**, which is every `layout.json` ever written. This is the
`kind` rule from M9b restated: absence is a historical fact about every existing
file, so it must parse rather than warn. A **present but malformed** `links`
warns and is replaced with none, the line `parsePresets` and `parseBaselines`
already draw — a silently vanished field is a user's work gone with nothing
said.

Individual links are dropped individually, the rule the file obeys everywhere:
a link whose `to` is not a valid id is dropped with a warning and its
neighbours survive.

**A link naming a panel that did not survive validation is dropped**, and
`parseWorkspace` is where that has to happen, because it is the only place that
knows the whole surviving set. It already builds a `seen` set for exactly this
purpose — `selectedId` and `focusedId` are already filtered through it — so the
link prune is a second pass over the parsed panels using a set that already
exists. This is the on-disk half of the dangling-edge stance; `removePanel` is
the in-memory half, and a canvas needs both because a file can be edited between
launches.

**No new IPC channel.** Links ride inside `CanvasState`, exactly as `panels`
does, through the existing `layout:load`, `layout:save` and `workspace:activate`.
`verify:ipc` stays at 31 and `README.md`'s channel list is untouched, which is
what keeps `verify:meta` 14 green without an edit. Recording this because the
opposite conclusion is the tempting one — "links are a new kind of thing, so
they need a channel" — and M6d and M7 both reached this same boundary and
declined it for the same reason.

## Verification

| Suite | What it gains |
|---|---|
| `verify:viewport` | `linkAnchors` (border anchoring, the ray-clip vs axis-clamp discriminator, the coincident-centre `null`), `buildLinkSegments`' drop of an unresolvable `to`, `removePanel`'s incoming prune, and the two creation rules |
| `verify:layout` | the round trip, absent-vs-malformed, the individual drop, and `parseWorkspace` dropping a link to a panel that did not survive |
| `verify:rail` | the inspector's Links fields, both directions, and `inspectorSignature` moving when they change |
| `verify:panels` | end to end: arm, click, the path is in the DOM; the completing click spawns nothing; close the target and the link is gone; `Cmd+Z` restores panel and link together; a click over a link still reaches the panel beneath it |
| `verify:styles` | unchanged, but the new CSS must use existing tokens — check 1 fails on any hardcoded colour outside a theme block |

The two checks worth naming in advance, because each is the only thing that
could catch its defect:

- **The completing click must not wake.** A check that only asserts "a link
  appeared" passes against an implementation that also spawned an agent. The
  check has to assert the target panel is *still dormant* — and it must be built
  on a genuinely dormant panel, which on this canvas means the disk-append-and-
  reload route `verify:panels` 39 and 84 already use.
- **`Cmd+Z` restores both.** A check that undoes and asserts the panel is back
  passes against an implementation that pruned the links in a *separate* commit,
  which is two history entries and needs two presses. The assertion has to be
  one press restoring the panel **and** the link in the same read.

There is no visual regression test in this repo, which is a stated position
rather than an omission — so nothing here proves the links *look* right, only
that they are where the arithmetic says.

## What this milestone does not solve

- **The functional flavour**, above, with #24's auditability question unanswered.
- **Cross-workspace links.** `PanelId` is global, so a link naming a panel in
  another workspace is representable and renders as nothing. It is not an error
  and not a feature; the render-layer prune is what keeps it quiet.
- **Link selection, and therefore any gesture that acts on a link directly.**
  The inspector is the only surface.
- **Culling and any bound on link count.**
- **Routing.** A link is a straight segment. It passes under intervening panels
  rather than around them, which is the honest picture at two panels and gets
  harder to read as the canvas fills. Orthogonal routing is a real feature and a
  much larger one.
