# M17: The workspace extras M7 did not ship — Design

**Status:** designed, not yet implemented.
**Number:** M17, and it has been renumbered THREE times. This milestone was designed and
built as M14; while it was in flight the credential boundary reached `main` and took
M14, the subagent nodes reached `main` behind it and took M15 (that track is the
`m13-subagent-nodes` referenced below, itself renumbered on the way in), and the file
panels reached `main` behind THAT and took M16. The rule
applied each time is the one the README's milestone table now states: the number
belongs to whichever milestone reaches `main` first, and the branch arriving later
renames itself rather than renaming the row other documents are already citing. **The
FILENAME of this spec and of its plan deliberately still say `m14`** — renaming them
would lose their history for no benefit, and the heading above is the authority on the
number. M10 and M11 are claimed by the visual-system track. This milestone shares no source file
with any of the three — it touches `Canvas.tsx`, `lod.ts`'s callers (not
`lod.ts`), the IPC contract, `layout-store.ts`, `layout-schema.ts` and two new
pure renderer modules. The number records claim order, not build order.
**Predecessor by DEPENDENCY:** M7 (workspaces) and M8d (workspaces in the rail).
**Backlog entries:** #2 in full — all three of the pieces M7 left open — plus the
marquee half of #52, which #2's move gesture is blocked on.

## Goal

Pay off the three things M7 designed, understood, and deliberately did not
build, in the order their dependencies actually run: a merged view across every
workspace, a selection model that can name more than one panel, a move that
relocates panels between workspaces without killing anything, and the switching
chord M7 declined to guess at.

M7's own README paragraph names all three and gives a reason for each. Two of
those reasons have expired and one has not:

- The merged view's stated blocker was `LIVE_BUDGET` — "a cap on live WebGL
  contexts that is global, not per-workspace, so a merged view has no natural
  budget of its own to spend". That is true and is **not** a blocker: a global
  cap is exactly what a merged view wants, because tiering already spends it
  correctly. What actually made the view hard is a problem M7 did not name — see
  "The real obstacle is coordinates" below.
- The move's stated blocker was that rubber-band selection does not exist. That
  is still true, so this milestone builds it (the marquee half of #52, and only
  that half).
- The chord's stated reason was that "nobody yet knows how often switching
  happens in practice, and a wrong guess is a worse outcome than a palette-only
  path **for one more milestone**." Seven milestones have passed. The chord is
  assigned here.

## The real obstacle is coordinates, not budget

Every workspace stores its panels in the same world coordinate space, and every
workspace's panels cluster around wherever that canvas's camera has been. Two
workspaces' panels therefore **overlap by construction** — not sometimes, and
not because of a cascade collision, but because nothing has ever kept them
apart. `cascadeCentre` cannot help: it steps a *new* panel away from a
coincident one within one array, and here the two arrays were laid out
independently, months apart, by two cameras that never knew about each other.

So a merged view is not "render the union of the arrays". It has to place them,
and the placement is the design.

The second, quieter obstacle is **write-back**. `activateWorkspace(id, outgoing)`
is write-then-flip precisely so a 500ms-coalesced save can never land on the
wrong workspace record (CLAUDE.md: "`activateWorkspace` takes the outgoing
canvas, and that parameter IS the mechanism"). A merged view puts panels from N
records on screen simultaneously, which is exactly the state that ordering
exists to make impossible. Every design below is chosen to keep the number of
writers at one.

## Scope

In:

- **A merged view**: one canvas showing every workspace's panels at once, in
  per-workspace lanes, with terminals live and geometry read-only.
- **`selectedIds: Set<string>`** replacing `selectedId`, plus a **rubber-band
  marquee** on the canvas background.
- **Moving a marquee selection to another workspace** — an existing one, or a
  new one created in the same gesture — without any session dying.
- **Three chords**: `Cmd+Shift+[` / `Cmd+Shift+]` previous/next workspace,
  `Cmd+Shift+A` toggles the merged view.

Out, deliberately:

- **Shift-click and group drag** — the other two thirds of #52. The move needs
  a way to name several panels and nothing more. #52 stays in the backlog,
  rewritten down to the two gestures still open. Group drag in particular is
  real risk for no benefit here: it is the accumulate-drift bug in a group
  costume, and this milestone's one geometry-editing surface is the ordinary
  canvas, unchanged.
- **Editing geometry in the merged view.** No drag, no resize, no close. See
  "Why the merged view is read-only" below; this is the decision the whole
  design rests on.
- **Marquee inside the merged view.** Lassoing across lanes and moving in one
  gesture is the obvious next want and is deliberately not here: a selection
  spanning lanes is a selection spanning workspace records, and a move whose
  source is N records rather than one is a different transaction. The merged
  view's background drag pans, exactly as it does today.
- **Persisting the merged mode.** It is a view like the palette, not furniture
  like the rail. See "Why the mode is not a setting".
- **A merged-view camera of its own.** Toggling in and out restores the active
  workspace's camera; the merged view gets a `Cmd+1`-style fit on entry and
  nothing more.

## Components

### 1. `workspace:merged` — one new read

```ts
export interface MergedWorkspace {
  id: string
  name: string
  active: boolean
  panels: PanelRecord[]   // the same shape layout.json stores
}
IPC.WORKSPACE_MERGED: 'workspace:merged'   // (): Promise<MergedWorkspace[]>
```

Two alternatives were rejected.

**Widening `WORKSPACE_LIST`** to carry panels rather than `panelIds` is the
smaller diff and the wrong one: that channel already fires on mount, on every
palette open, on every workspace mutation, on every switch, and on every
`panels.length` change (CLAUDE.md's "One waiting count" entry lists the sixth
reload and why it is keyed on `length`). Putting every panel of every workspace
on that payload makes a hot path fat to serve a mode that is off almost always.

**Having main compute the lanes** and hand back a ready-made `Panel[]` puts
layout math in the process that cannot test it cheaply. Lane placement is pure
geometry over plain data — precisely the tier `viewport.ts` and `lod.ts` live
in, testable under plain node in milliseconds.

The channel returns records, not display panels. The renderer places them.

`verify:ipc` goes 31 → 33 (this, and `workspace:move-panels` below). Note the
wording that entry uses: it is one check reporting `1/1` over 33 channels, not
"33 checks".

### 2. `merged-layout.ts` — a new pure module

```ts
export interface Lane { workspaceId: string; name: string; active: boolean
                        origin: Point; bounds: WorldRect }
export interface MergedLayout { panels: Panel[]; lanes: Lane[] }
export function mergedLayout(workspaces: MergedWorkspace[]): MergedLayout
```

Each workspace's panels keep their **relative** geometry — the arrangement the
user built is the information worth preserving — and the whole cluster is
translated by a lane origin. Lanes are laid left to right in workspace order,
each lane as wide as its own content's bounding box, separated by
`LANE_GUTTER_PX` of world units. The active workspace's lane is first, so
toggling the mode does not scroll the user away from where they were.

Three properties this module owes, each of which fails silently if dropped:

- **The offset is display-only.** The returned `Panel.rect` values are for
  rendering; nothing writes them back. A `Panel` in the merged array carries its
  real id, its real spec, its real title and its real kind, so the registry,
  agent state, edge pips, the rail and the inspector all work with no change at
  all. Only `rect.x`/`rect.y` are synthetic.
- **An empty workspace still gets a lane.** A workspace with no panels has no
  bounding box; it renders as a header and a gap of `LANE_MIN_WIDTH`. Skipping
  it would make the merged view silently disagree with the rail about how many
  workspaces exist.
- **Placement is a pure function of the input order and geometry only.** No
  camera, no viewport, no time. It is recomputed whenever the merged data is
  refetched, and a lane must not shuffle because a panel moved by one pixel.

Lane headers render as chrome in the world layer, not as panels — they scale
with the zoom, which is correct here (they label world regions, unlike edge
pips, which must not scale; CLAUDE.md's "The pips are outside `.world`" states
that distinction from the other side).

### 3. The merged mode in `Canvas.tsx`

`panels` stays exactly what it is today: the active workspace's real array, the
only thing the `layout.save` effect ever writes. `mergedPanels` is separate
state, populated from `workspace:merged` on entry and refetched when the active
workspace's own array changes. What is **rendered and tiered** is
`displayPanels = merged ? mergedPanels : panels`.

That split is what keeps the writer count at one. There is no moment at which
the merged array can be mistaken for a workspace's panels, because the save
effect never reads it.

Behaviour inside the mode:

- **Foreign panels enter dormant unless `pty.list()` says they are live** — the
  boot rule, resolved before the merged array is committed, in the same
  synchronous batch, for exactly the reason `switchWorkspace`'s doc comment
  gives at length: `registry.ensure` early-returns for a session that already
  exists, so a `dormantIds` correction arriving one render late can never repair
  a session that was already created non-dormant. Getting this wrong means
  entering the merged view launches up to `LIVE_BUDGET` agent CLIs with no user
  gesture. This is the single most dangerous line in the milestone.
- **Tiering is untouched.** `assignTiers` sees a bigger `rects` array and spends
  the same global budget on it, culling by the same viewport. That is the whole
  answer to M7's stated blocker: a merged view does not need a budget of its
  own, it needs the existing one to be spent by the existing rule.
- **`Cmd+N` spawns into the active workspace** and appears in its lane, because
  `panels` — the thing `onSpawn` appends to — is still the active workspace's
  array.
- **Selection, focus, typing, `Cmd+J` and the rail all work** on any panel in
  any lane. A foreign panel is a real panel with a real session.

### Why the merged view is read-only

Geometry editing is the only thing in this design that would require a second
writer. A drag in the merged view means a rect belonging to workspace B has to
be un-offset by B's lane origin and written into B's record — while the
coalesced save is writing A's array on its own schedule, and while
`activateWorkspace` still believes it is the only thing that writes a
non-active record. The failure is not a crash: it is a well-formed
`layout.json` with the wrong rects in it, discovered launches later, with
nothing in any log naming the drag that caused it.

Read-only geometry removes the question. It also costs less than it sounds:
the merged view's job is to see everything at once, and rearranging is what
the ordinary canvas is for. Close is off for the same reason in the other
direction — closing a foreign panel is a record edit — and off for *own*
panels too, because "some panels here have a close button and some do not" is
a rule the user has to learn from failure.

The one mutation the merged view does offer is spawning, which appends to the
active workspace through the path that already exists.

### Why the mode is not a setting

The standing rule from #11 is that anything a user can toggle goes in
`settings-schema.ts`, which buys persistence, validation, a palette row and a
menu item. The merged mode deliberately does not, and the reason is
persistence rather than the rest: a persisted merged mode means a launch that
reads every workspace's panels and tiers them before the user has done
anything. That is a boot that spawns nothing (dormancy holds) but reads
everything, and it makes first paint depend on how many workspaces exist.

The mode is transient view state, like the palette being open. It gets its
chord, a toolbar button and a palette row, all built by hand — three surfaces,
which is the cost of declining the free row.

### 4. The selection model

`selectedId: string | null` becomes `selectedIds: Set<string>`. Every current
reader wants "the one selected panel" and keeps working through a derived
`selectedId = selectedIds.size === 1 ? [...selectedIds][0] : null` — the
inspector, the review query, `.panel--selected`, `restoreCamera`'s callers. The
inspector showing nothing for a multi-selection is correct and is the honest
empty state it already has.

**`focusedId` stays a single id and is untouched.** Selection and focus are
different facts here — focus is where the keyboard is, and there is exactly one
keyboard. Widening focus would be a second, silent way to hold `LIVE_BUDGET`
slots.

The marquee:

- **Starts only when `hitTest` returns null.** The background `onMouseDown` is
  not "empty space" — a *carded* panel has no chrome handler of its own, so its
  click falls through here and is resolved by `hitTest` (that is what
  `onSelectPanel(hit)` in the current handler is for). A marquee that started on
  any background mousedown would rubber-band instead of selecting whenever the
  user clicked a card.
- **Still releases focus.** The current handler's `setFocusedId(null)` is
  load-bearing: `assignTiers` pins the focused panel live unconditionally, so an
  uncleared `focusedId` holds a WebGL context and a budget slot for the rest of
  the run. A marquee must not become the drag that forgot to release it.
- **Selects on intersection, not containment.** A marquee that required full
  containment cannot select a panel larger than the visible canvas, which at
  ordinary zoom levels is most of them.
- **Renders outside `.world`**, like the edge pips and for the same reason: it
  is a screen-space rectangle following the cursor, and a marquee that scaled
  with the zoom would stop tracking the pointer.
- **Pushes no history entry.** Selection is not a panel-array change. The
  one-entry-per-committed-gesture rule is about gestures that move panels.

Marquee math (`marqueeSelection(rect, panels)`) is pure and joins the plain-node
tier.

### 5. The move

```ts
IPC.WORKSPACE_MOVE_PANELS: 'workspace:move-panels'
// (panelIds: PanelId[], target: { workspaceId: string } | { newName: string })
//   => Promise<{ workspaceId: string } | null>
```

Main removes those panel records from whichever workspace holds them and
appends them to the target, minting the target first when the request names a
new name. The renderer drops them from `panels` locally.

The two rules that make it correct:

- **No session is touched, on either side.** Not `dispose`, not `pty.kill`, not
  `dropBaseline`. A moved panel becomes a hidden workspace's panel with a live
  tmux session, which is precisely the state M7 already supports and M8d already
  renders a waiting count for. This is "demote, not dispose" reaching a third
  door, and `verify:panels` 64's lesson applies verbatim: every count-based
  check stays green against a move that quietly disposed and respawned, and only
  the pid can tell them apart.
- **The move pushes no undo entry.** The undo stack is one stack over one
  `Panel[]`, and `applyHistory` disposes any panel the undone state no longer
  contains — which reaches `pty.kill`. An undo after a move would either restore
  panels locally that main's record no longer lists (a stack lying about what it
  reversed) or kill sessions that now belong to another workspace. This is the
  reasoning M9c's commit already records, arriving through a second door: the
  stack moves panels within a canvas, and a move crosses records.

The panel keeps its rect. A moved panel lands in the target workspace at the
coordinates it had, which may collide with something already there — acceptable
and honest, and the user can see it the next time they switch. Silently
cascading it would move a panel the user did not ask to move.

The target list is offered in the palette: every workspace except the ones the
selection is already in, plus a `Move to new workspace…` row that reuses the
rename input mode to name it and moves in one gesture.

**A selection spanning more than one workspace cannot happen**, because the
marquee only exists in the ordinary canvas, where every panel belongs to the
active workspace. The channel takes ids rather than assuming that, so the
constraint is the caller's rather than the format's.

### 6. The chords

| Chord | Verb |
|---|---|
| `Cmd+Shift+[` | previous workspace |
| `Cmd+Shift+]` | next workspace |
| `Cmd+Shift+A` | toggle the merged view |

All three are `Cmd`-gated, because agent TUIs claim every bare key and a bare or
`Ctrl`-based chord would be taken from the agent — the rule `useViewport`
enforces for every canvas shortcut. `Cmd+Shift+K` is specifically unavailable:
`usePalette` excludes `shiftKey` precisely because that chord arrives as
`key === 'K'` and would otherwise silently be the palette's.

**None of the three joins `REPEATABLE_KEYS`.** A held switching chord steps
through every canvas at the OS repeat rate and lands wherever the stream stopped
rather than where the user meant to look — the same argument `Cmd+J` already
carries. A held merged toggle strobes the whole canvas and re-runs the
`pty.list()` round trip on every flip.

Prev/next wrap, in `workspace:list` order, and stand down while the palette is
open (`isOpen()`), like every other canvas shortcut.

**They are matched on `event.code`, never `event.key`** — the lesson M8a's
inspector chord already paid for and which `verify:panels` 80 exists to pin.
Shift rewrites the printed character: `Cmd+Shift+[` arrives as `key === '{'`,
not `'['`, exactly as `Cmd+Shift+\` arrives as `'|'`. A `key === '['` test is
therefore dead on arrival, and a `key === '{'` test is correct on a US layout
and wrong everywhere else, which is the worse of the two failures because it
works for whoever wrote it. `code === 'BracketLeft'`/`'BracketRight'`/`'KeyA'`
is layout-independent and is what the shell chord already uses.

## What can go wrong, and what catches it

| Failure | Why it is silent | What catches it |
|---|---|---|
| Entering the merged view spawns foreign panels' agents | Looks like the app is busy; nothing logs | `verify:panels`: enter merged with a seeded second workspace, assert `pty:list` count unchanged |
| The move disposes and respawns | Every count, row and file stays correct | `verify:panels`: the moved panel's pid is unchanged across the move |
| Lane offsets get written back to a record | A well-formed `layout.json` with wrong rects, found launches later | `verify:layout`: a merged-view session leaves every workspace's stored rects byte-identical |
| A marquee starting on a carded panel | Feels like the card "does not select" | `verify:panels`: mousedown-drag from a card selects it and draws no marquee |
| Focus not released by a marquee | A WebGL context and budget slot held for the run | `verify:panels`: `focusedId` null after a marquee |
| Undo after a move | Kills another workspace's sessions | `verify:panels`: `Cmd+Z` after a move is inert |
| An empty workspace vanishes from the merged view | Reads as a deleted workspace | `verify:merged`: an empty workspace still gets a lane |

## Verification

A new plain-node suite, **`verify:merged`**, for `merged-layout.ts` and the
marquee math. Both are pure, DOM-free and import neither `electron` nor
`node-pty`, so they belong in the cheapest tier — and both are the kind of
geometry that is easy to get subtly wrong and unpleasant to debug through a
running canvas, which is the same argument `lod.ts` and `viewport.ts` already
won.

`verify:layout` grows the store's move mutation: panels leave the source record
and arrive in the target, `allPanelIds` is unchanged across a move (ids are
global and the move mints none), a move naming an unknown target changes
nothing, and a move to a new name creates exactly one workspace.

`verify:ipc` goes to 33 channels.

`verify:panels` grows the end-to-end half, per the table above. The pid check is
the one that matters; the rest are cheap once the fixture exists.

`verify:palette` grows the move rows: present with a target list that excludes
the selection's own workspace, disabled with a reason rather than absent when
the selection is empty, and the `Move to new workspace…` door.

## Success criteria

1. With two workspaces holding panels, `Cmd+Shift+A` shows both, in lanes, with
   no panel overlapping a panel from another workspace, and spawns nothing.
2. A terminal in a foreign lane can be read and typed into, and its agent-state
   border, edge pip and rail row all behave as they do on the ordinary canvas.
3. Nothing in the merged view can be dragged, resized or closed, and every
   workspace's stored rects are byte-identical after a merged-view session.
4. A rubber-band marquee on the ordinary canvas selects several panels; a
   background click still releases focus.
5. Moving that selection to another workspace removes it from this canvas,
   leaves every pid unchanged, and the panels are there after switching to the
   target — with their tmux sessions still running.
6. `Cmd+Z` immediately after a move does nothing.
7. `Cmd+Shift+[` and `Cmd+Shift+]` walk the workspace list and wrap; held, they
   move exactly one step.

## Backlog consequences

- **#2 is deleted.** All three of its open pieces ship here.
- **#52 is rewritten down** to shift-click and group drag, keeping its recorded
  constraints attached to the half still open: the background-mousedown
  focus-release rule is discharged by this milestone, but the
  `applyDrag`-per-member and one-history-push constraints belong to group drag
  and are untouched.
- **#21 (broadcast) and #25 (tidy the selection)** each assume multi-selection
  exists. After this milestone it half exists — a selection can be built by
  marquee only — which is enough for both, and each entry should say so.
