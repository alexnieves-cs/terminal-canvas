# M56 — The camera: flights, a trail, bookmarks

**Status:** designed 2026-09-02. Backlog #62 (flights), #45 (camera undo),
#42 (bookmarks). Deprioritised by the scope amendment but not cut; the
amendment says the milestone "keeps zoom-to-fit and the reduced-motion
flight rule, which criterion 3 needs regardless of bookmarks". Zoom-to-fit
already landed (`fitAll`, M46's HUD cluster), so this milestone is the
other three, flights first.

## Flights (#62)

Every discrete camera jump today is a teleport: `centreOn` (rail rows,
search, attention, go-to-panel), `fitAll`, `resetViewport`, and now
bookmarks and the trail. A teleport destroys the one thing a spatial
workspace exists to preserve. Every discrete jump becomes a short eased
flight; NO continuous gesture (wheel, pinch, pan drag) is ever tweened.

- `canvas/flight.ts` (pure): `interpolateViewport(from, to, t)` — scale
  in LOG space and CLAMPED at every frame (deriving translation from an
  unclamped intermediate is `verify:viewport` check 3's sideways drift,
  mid-flight); translation chosen so the world point at the screen centre
  moves in a straight line. `easeInOut(t)`. `flightDuration(from, to,
  size, reduced)` — 0 when reduced motion is on, else 160–320ms by
  distance in screen units, so a two-panel hop is quick and a cross-canvas
  jump is legible.
- `useViewport`: one internal `flyTo(target)` behind every discrete verb.
  rAF-driven, cancellable (a gesture or a second jump mid-flight cancels
  and lands the gesture's own math on the CURRENT frame, never on the
  target). Reduced motion: `matchMedia('(prefers-reduced-motion:
  reduce)')`, overridable by a test hook so the harness is deterministic.
- **Tiering is suppressed until the flight settles.** A 300ms flight
  crosses the canvas and every frame is a tiering input; a dozen WebGL
  contexts created and destroyed in transit for panels the user never
  stopped at. `useViewport` exposes `flying` (state, not a ref: the tier
  effect has to re-run when it turns false), and `Canvas.tsx`'s
  tier-assignment effect returns early while it is true.

## The trail (#45)

A second `History<Viewport>` — `history.ts` is generic for exactly this;
it must NOT join `History<Panel[]>`, whose `applyHistory` reaches
`registry.dispose`. Pushed on discrete jumps only, never on gestures:
`Cmd+[` back, `Cmd+]` forward (Cmd+Shift+[ / ] are the workspace keys;
plain Cmd+[ / ] are free — `event.code` is compared, for the Shift reason
`useViewport` already records). Palette rows `Camera: back` / `Camera:
forward`, disabled with "nothing to go back to" rather than absent.

## Bookmarks (#42)

`bookmarks: { id, name, camera }[]` on `CanvasState`, absent on disk for
every earlier layout (parsed as `[]`, no warning), malformed entries
dropped per entry. `goToViewport(vp)` is the third named verb, stable
like the others. No number keys: `Cmd+1` stays fit-all, and the nav grid
owns the hold gesture. Palette section **Bookmarks** (new, between
Workspaces and Canvas): `Bookmark this view` (auto-named "View N", with a
count of panels in view in the subtitle), one `Go to <name>` row per
bookmark, one `Delete <name>` row per bookmark behind the same confirm
`workspace.delete` uses. Bookmarks are per workspace, saved through the
ordinary layout write.

## What it must not break

- `verify:viewport` 1–115: `viewport.ts` unchanged; `flight.ts` is new.
- The setter stays private; every new move is a named verb.
- `restoreCamera` at boot stays instantaneous.
- No new IPC channel; bookmarks ride `layout:save`.

## Verification

- `verify:viewport flight.1` endpoints exact, scale clamped at every
  sampled t even with endpoints at the limits, log-space midpoint;
  `flight.2` duration 0 under reduced motion, bounded otherwise, longer
  for farther. `trail.1` a `History<Viewport>` pushes only what it is
  given and steps both ways.
- `verify:layout bookmark.1` absent → `[]` with no warning; a malformed
  entry dropped with a warning and the rest kept; round-trip.
- `verify:palette bookmark.1` the section exists in order; rows per
  bookmark; back/forward disabled with a reason at the trail's ends.
- `verify:panels flight.1` a rail-row centreOn with reduced motion OFF
  takes more than one frame and lands exactly; with it ON lands in one;
  `trail.1` `Cmd+[` returns to the previous camera; `bookmark.1` a
  bookmark saved through the palette survives a reload and `Go to` lands
  on it.
