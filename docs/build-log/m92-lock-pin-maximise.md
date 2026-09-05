# M92 — Lock, pin and maximise: build log

Branch `m92-lock-pin-maximise`, 2026-09-05. Spec: `docs/superpowers/specs/2026-09-05-m92-lock-pin-maximise-design.md`.

## Red first

`verify:viewport pin.1`/`max.1`, `verify:layout lockpin.1`, `verify:groups lock.1` and
`verify:palette lockpin.1` were written and watched red (a missing function, a missing field,
a missing row) before the record, the tier function, the rect and the rows landed;
`verify:panels lockpin.1` drives the real surfaces last: a real chrome drag on a locked panel
moves nothing, the pin mark and the record on disk, the `fill` control and `Restore panel`
row, and two undo entries in order.

## Shape decisions worth recording

- **Pins are counted INSIDE `assignTiers`** — first, in array order, off-screen included —
  and `pinCount` is the same number the palette's ninth-pin refusal reads, so the verb and
  the tier cannot disagree. A dormant or force-carded pin yields: neither can be live.
- **Lock is one early return at `onBeginDrag`**, the gate every move and resize already
  passes (the merged view's gate, one line above). The group drag skips locked members in
  `groupDragState`, so `applyGroupDrag` has no state for them and nothing shears.
- **Maximise is a rect and a restore rect**, one history entry each way; the first move or
  resize clears the mark in `onDrag`, because the restore rect would lie after that.
- **The marks reach every frame through ONE context** (`PanelMarksContext`, provided beside
  `CardDetailContext`), so no kind threads three props it does not understand; the inspector
  model gets `marks` in one wrapper around the builder rather than in each kind's arm.

## What the checks caught

- `max.1`'s first arithmetic was mine, not the function's (the world→screen mapping is
  `world × scale + camera`); the check now maps the rect's corner back and expects the margin.
- The harness's `runRow` dispatches `mousedown` on a palette row, but a chrome control runs on
  `click` (`shellControl`); the panels check dispatches the right event for each.
- A disabled palette row carries its reason as row text, not a `title`; the check reads both.

## Findings (fresh-context verifier)

Ten findings; seven accepted, one documented, two noted.

**Accepted.**

1. **Two existing copy sites dropped the marks** (blocker): the rename's nine kind arms and
   the font-size change rebuild a panel by name and carried `title`/`links`/`fontSize` only,
   so renaming a locked panel silently unlocked it. `carryMarks(p)` in `panels.ts` is the one
   spread every by-name rebuild adds; both sites use it. This is the absent-stays-absent rule
   reaching its fourth and fifth copy sites in one milestone.
2. **The focused panel could be carded** (blocker): the pins loop took the budget and the
   focus arm was gated on a free slot, contradicting the comment above it. Focus is
   unconditional again — with pins filling the budget it EVICTS the last-promoted pin — and
   the verb refuses at `PIN_MAX = LIVE_BUDGET − 1`, so the eviction is the belt under the
   brace. `pin.1` drives both.
3. **`pinCount` and the tier function disagreed on kinds**: the row accepted a pin on a
   review node, which never tiers, and spent one of the refusals. `pinCount` counts terminal
   panels; `pinRefusal(kind, pinned, count)` in `lod.ts` is the ONE sentence the palette row,
   the pane's button and the verb read, so the three doors cannot disagree.
4. **The pane's Pin had no budget refusal**: it reads `pinRefusal` now, with the count.
5. **The marks context was rebuilt on every `panels` change**, i.e. at 60Hz behind a drag;
   it is frozen on a signature of the marks, the rail's own freeze.
6. **Maximise's raise was a second setState outside the history entry**; the raise rides the
   patch (`z: nextZ`), one entry.
7. **Arrange moved locked panels**: `tidyPanels` is handed the unlocked members only.

**Documented, not changed.** Lock is a rule about GESTURES — drag, resize, arrange — not
about every rect write: a locked panel can still be maximised and restored, because those
are explicit verbs with their own undo, and refusing them would make a locked panel the
one kind that cannot fill the window. Recorded in the spec.

**Noted.** The stale `assignTiers` comment is rewritten. A group whose every member is
locked builds an empty drag state; the drag is a safe no-op (the frame says `N locked`).

**Not verified by any suite:** the SIGWINCH count on maximise (the rect change flows
through the ordinary resize effect; nothing here calls `refit`), and the real inspector
toggles — the panels check drives the palette rows and the frame control.

