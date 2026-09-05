# M93 — The canvas as a document

**Status:** design, 2026-09-05. **Branch:** `m93-document`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 7 (three states), 9 (a disabled row names the fix);
2.0 principle 13 (`Canvas.tsx` owns the gesture, the pure module owns the rule).
**Thesis sentence:** a canvas that is a saved workflow (M79) is a document — it has a history
you can go back to, and margins you can write in.

## What this milestone is for

Backlog #67 (the layout time machine) and #15 (annotations, narrowed), as the scope document
decided: snapshots are of SAVES, kept beside `layout.json`, listed by time, restored as a NEW
workspace so reset stays final and built-ins are never resurrected; annotations are
world-anchored and panel-anchored labels as SVG in `.world`, an explicit mode from the
palette with a loud exit, persisted with the record rules, drawn on the minimap.

## Design

### Snapshots (`main/layout-snapshots.ts`, `layout-store.ts`, `verify:layout snap.1`)

- On every successful `writeNow`, the store hands the bytes it just wrote to
  `layout-snapshots.ts`, which keeps the last `SNAPSHOT_MAX` (20) under
  `userData/layout-snapshots/<iso-stamp>.json`, ring-trimmed oldest-first, written with the
  same temp-and-rename. A write that fails writes no snapshot. Snapshots are a SIDE EFFECT of
  a save, never a second author: nothing reads them back except the restore verb.
- Coalesced: a snapshot is taken at most once per `SNAPSHOT_MIN_MS` (60 s) — a drag saves
  every gesture and twenty snapshots of one afternoon of dragging would be no history at all.
  The first save after launch always snapshots.
- `snapshot:list` → `{ at, bytes, workspaces: number, panels: number }[]` newest first, three
  states in the pane (none yet, asked, a list). `snapshot:restore(at)` parses the file with
  `parseLayout` (the ONE parser; a malformed snapshot is refused by name, never partially
  applied), takes its ACTIVE workspace, mints a new workspace named `<name> @ <time>` through
  `createWorkspace`'s path with that workspace's panels/groups/bookmarks/runs/annotations,
  every panel id re-minted (ids are one sequence; a restored panel must not collide with a
  live one), and activates it. The current workspace is never overwritten. Reset's dialog
  says `N snapshots exist — restore one from the Workspaces pane` when any do.
- The Workspaces pane gains a `History` section beneath the workspace rows: one row per
  snapshot (`3 min ago · 2 workspaces · 14 panels`), `Restore` on each, disabled by name
  while merged. The palette gets `workspace.restore-snapshot…` (a scope listing the same
  rows) and the row is present with `no snapshots yet` when none exist.

### Annotations (`shared/annotations.ts`, `renderer/canvas/AnnotationLayer.tsx`, `annotation-model.ts`)

- A record on the workspace: `annotations: PersistedAnnotation[]`, absent on every pre-M93
  file; each `{ id, text, anchor: { kind: 'world'; x; y } | { kind: 'panel'; panelId; dx; dy } }`,
  malformed entries dropped by name, a panel-anchored entry whose panel is gone dropped with
  the rest kept (the run/group rule), capped at `ANNOTATIONS_MAX` (200) newest-kept.
- Pure: `annotationRect(a, panels)` → the world point (a panel anchor is the panel's rect
  plus the offset, so it moves with the panel); `resolveAnchor(point, panels)` → a panel
  anchor when the point is inside a panel's rect, else world; `pruneAnnotations`.
- The layer is an SVG sibling of `LinkLayer` inside `.world`: a `foreignObject`-free text
  label with a hairline leader from a panel-anchored note to its panel's edge, `pointer-events`
  only on the label; a click on a label selects it (Delete removes, Escape clears — `Canvas.tsx`
  owns `selectedAnnotation` like `selectedLink`); double-click edits in place (a plain
  `<input>` positioned over it, the composer's rule about `Cmd+Z` applies and is recorded).
- **Annotate mode** is explicit: `Annotate…` in the palette (Canvas group) enters it; the
  top bar shows a LOUD strip (`Annotating — click to place a note, Esc to stop`) and the
  cursor is a crosshair; a click places a note at the point (world or panel anchor by
  `resolveAnchor`) and opens its editor; Escape or the strip's `Done` leaves. Entering it
  while merged is refused by name (the merged view's geometry is read-only).
- The minimap draws every annotation as a 2px dot in `--fg-3`; the far tiers keep labels
  legible at the summary tier (`font-size` in world units scaled like the frame border, M91).

## Amended after the verifier

- A workspace switch loads the incoming workspace's annotations and reset clears them.
- Notes are OUTSIDE the panel history: deleting one is not undoable; a note whose panel is
  gone draws nothing and is dropped by the parser on the next load (never pruned live).
- An existing note emptied and blurred keeps its text; a fresh empty note removes itself.
- The renderer's id counter rides `snapshot:restore` as a hint.
- The palette scope for snapshots is not built: the pane's History section is the door.
- The pure anchoring lives in `shared/annotations.ts`; the panels check is `history.1`.

## What it must not break

- Reset stays final: a restore never touches the current workspace and never resurrects a
  deleted one in place. `verify:layout snap.1` proves the restore path mints new ids.
- `registry.version()` carries nothing new; annotations are layout.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A snapshot written on a failed save, the ring not trimmed, two saves within the window both snapshotting | `verify:layout snap.1` (pure ring + coalesce over an injected fs/now) |
| A restore overwriting the current workspace or reusing a live panel id | `verify:layout snap.2` |
| A malformed annotation crashing the parse; a panel-anchored note surviving its panel | `verify:layout annot.1` |
| A panel-anchored note not moving with its panel; a click inside a panel yielding a world anchor | `verify:viewport annot.1` |
| Annotate mode reachable while merged; a note placed and edited through the real surfaces | `verify:panels annot.1` |
| The History rows missing when snapshots exist, or a restore not activating the new workspace | `verify:panels history.1` |
