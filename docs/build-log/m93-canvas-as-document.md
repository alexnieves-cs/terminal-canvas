# M93 — The canvas as a document: build log

Branch `m93-document`, 2026-09-05. Spec: `docs/superpowers/specs/2026-09-05-m93-canvas-as-document-design.md`.

## Red first

`verify:layout snap.1`/`snap.2`/`annot.1` and `verify:viewport annot.1` failed at bundle time
against two modules that did not exist (`main/layout-snapshots.ts`, `shared/annotations.ts`),
then went green as the ring, the pure restore, the parser and the anchoring landed.
`verify:panels annot.1` and `history.1` drive the real surfaces: the palette's `Annotate…`,
a real click on the ground and one on a live panel, typing into the in-place editor, the
record on disk with both anchors, a real drag of the panel with its note following, Delete,
the merged refusal; the Workspaces pane's History rows and a Restore that mints a new
workspace beside the untouched original and switches to it.

## Shape decisions worth recording

- **Snapshots are a SIDE EFFECT of a successful write**, handed the bytes after the rename
  through the store's `onWritten`; the ring coalesces within a minute and keeps twenty.
  Nothing reads one back except Restore, and Restore never touches the current workspace.
- **`parseLayout` never throws**, which is right for a boot and wrong for a restore, where
  the user asked for THIS file: `restoreFromSnapshot` checks the JSON first and refuses a
  corrupt snapshot by name rather than restoring an empty canvas.
- **Re-minted ids.** A restored `n3` beside a live `n3` would be two panels with one registry
  entry; the restore mints past every id in the current layout with links, groups, runs and
  annotations following the rename.
- **A note is layout.** `annotations` rides the workspace record beside bookmarks and runs,
  absent on disk when empty (the store deletes the key), pruned when its panel goes.
- **The annotate sheet.** A panel's own mousedown stops propagation, so a mode that placed
  notes only through the host's handler could place them on the ground and never on a
  panel. In annotate mode a transparent sheet lies over the world and every click reaches
  the host, which resolves the anchor against the panels in paint order.

## What the checks caught

- The store's `save`/`initial` copy the workspace record BY NAME (bookmarks, runs…), so the
  annotations the renderer sent never reached disk until the two sites carried them.
- The panels suite's real drags in `lockpin.1` (M92) and here sent `mouseMove` with
  `buttons: 1`, which the drag hook reads as a release — so M92's "a locked panel does not
  move" had been proven by a drag that never happened. Both carry `leftButtonDown` now (the
  harness lesson the memory already recorded, missed twice).
- A duplicate check id (`snap.1` already named a snapping check) — renamed `history.1`
  before `verify:meta` could say so.
- A restored panel is a CARD; the harness's "click inside the slot" found no slot. The
  annotate half seeds the panel focused and waits for its slot, which also makes the drag
  half honest.
- `__m7aWorkspace()` returns functions and cannot cross `executeJavaScript`; the check reads
  the active id from the harness's own store.

## Narrowed

The spec's palette scope for snapshots (`workspace.restore-snapshot…`) is not built: the
Workspaces pane's History section is the one door, and a second listing of the same rows
would be the drift the palette's other scopes were built to avoid. Recorded here, not hidden.

## Findings (fresh-context verifier)

Eleven findings; eight accepted, one narrowed, two nits noted.

**Accepted.**

1. **A workspace switch never loaded the incoming notes and carried the outgoing ones
   across** (blocker): the switch set panels, groups, runs and bookmarks and nothing else,
   so the next save wrote the old workspace's notes into the new one — silently. The switch
   sets annotations from the incoming state; reset clears them in the renderer and main
   deletes the key.
2. **Notes were pruned on every panels change, so undoing a panel's removal lost its note
   for good** (blocker) — and the comment claimed undo covered notes, which it never did
   (History is one stack over one `Panel[]`). The prune is gone: a note whose panel is gone
   draws nothing and the ONE parser drops it on the next load. Notes stay OUTSIDE history —
   deleting a note is not undoable — said in the code and here rather than pretended.
3. Reset's dialog says how many snapshots exist and where to restore one (the spec's line,
   missed).
4. A link, membership or run entry naming a panel outside the source workspace is dropped
   in the restore rather than on the next boot; the check found the parser already drops
   the cross-workspace link before the restore sees it, and says so.
5. The renderer's id counter rides `snapshot:restore` as a hint, closing the window between
   a spawn and the store's coalesced write where a restored id could equal a live one.
6. Far-tier labels scale in world units like M91's frame border; the minimap's dots are 2px.
7. An EXISTING note emptied and blurred keeps its text (clearing is not deleting; Delete
   is the verb); a fresh mis-click still removes itself.
8. An unwritable snapshot directory warns once, not once per save.

**Narrowed.** The palette scope for snapshots is not built (recorded above); the spec's
`annotation-model.ts` is `shared/annotations.ts` (pure, in the viewport bundle); the
spec's `verify:panels snap.1` is `history.1` (the id was taken by a snapping check).

**Noted.** `SnapshotMeta` was defined twice — the contract's is the one, re-exported by the
ring. `list()` reads twenty small files synchronously on a pane open; sub-10 ms, on main's
thread, acceptable.

## Findings (critic, one scene)

Five findings; three accepted, two declined. **Accepted:** the panel note was occluded by the
panels beside it (the layer painted UNDER every panel; it paints above them now, under the
sheet and the chrome); no leader was visible (it started below the label and ran up through
it when the note hung under its panel; it starts at the label's own near edge now); the two
seeded notes collided in the fixture (moved). **Declined:** that the world note "does not
read as ground-placed" is the fixture's framing, and that a note lacks a visible affordance —
a note is content, not a control; its title says what it is on hover, a click selects it
with the iris ring every selection uses, and a control strip on each note would make the
margins loud.

**Not verified by any suite:** the merged view's rendering of world notes over lane-shifted
panels (the mode is refused there, the notes still draw), and the composer's `Cmd+Z` limit
with the note editor focused (the documented limitation, now on a fourth text surface).

