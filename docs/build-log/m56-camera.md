# M56 — The camera: flights, a trail, bookmarks

**Status:** finished 2026-09-02.
**Branch:** `m56-camera`. **Spec:** `docs/superpowers/specs/2026-09-02-m56-camera-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m56-camera.md`. Backlog #62, #45, #42.

One line: every discrete camera jump is an eased flight (one frame under reduced motion)
with tiering held until it lands; `⌘[`/`⌘]` walk a camera trail separate from `⌘Z`; bookmarks
are named cameras persisted per workspace and reachable from a Bookmarks palette section.

## What landed

- `canvas/flight.ts` (pure): `interpolateViewport` (log-space scale, clamped every frame,
  straight-line screen-centre), `easeInOut`, `flightDuration` (0 under reduced motion, 160–320ms).
- `useViewport`: `flyTo` behind `jump`, which `centreOn` / `fitAll` / `resetViewport` /
  `goToViewport` share; gestures cancel; `flying` state; a `History<Viewport>` trail with
  `cameraBack` / `cameraForward` and the unshifted bracket keys; a reduced-motion override
  (test hook `__m56ReducedMotion`) persisted in localStorage.
- `Canvas.tsx`: the tier effect returns early while flying; `bookmarks` state saved with the
  layout and switched with the workspace.
- Layout: `bookmarks` on `CanvasState` (absent → `[]`, per-entry drops), store read/write.
- Palette: a **Bookmarks** section (between Workspaces and Canvas), `Bookmark this view`,
  `Go to`, `Delete…` (confirm), `Camera: back/forward` disabled with a reason at the ends.
- Checks: `verify:viewport flight.1/.2`, `trail.1`; `verify:layout bookmark.1`;
  `verify:palette bookmark.1`; `verify:panels flight.1` (red by faulting the duration to 0),
  `trail.1`, `bookmark.1`.

## Snags

- Nine existing panels checks went red once flights existed: each sampled the camera right
  after a jump. The harness now runs with reduced motion on (a user's preference, honoured)
  and a hidden window's paused `requestAnimationFrame` needed `backgroundThrottling: false`.
- The override then lapsed on every renderer reload; it is now persisted in localStorage.
- Check 48 restates the section labels and gained "Bookmarks".

## Not proven

- The flight against a real display's frame pacing; the harness only proves multi-frame and
  landing. Bookmark rename is not built (names are "View N").
