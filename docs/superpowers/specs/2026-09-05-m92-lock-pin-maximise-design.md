# M92 — Lock, pin and maximise

**Status:** design, 2026-09-05. **Branch:** `m92-lock-pin-maximise`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 6 (every control says what it is), 9 (a disabled row
names the fix); 2.0 principle 13 (`Canvas.tsx` owns the gesture, the pure module owns the rule).
**Thesis sentence:** three small verbs a dense canvas needs — a panel that stays where it is,
a panel that stays live, a panel that fills the window for a while — each a layout fact with
a named refusal, never a lifecycle command.

## What this milestone is for

Backlog #48 (lock and pin) and #23 (focus mode), answered as the scope document decided:
lock is one early return in the drag hook; pin is counted INSIDE `assignTiers`, capped with
the focused panel at `LIVE_BUDGET`; maximise is a layout mutation with a restore rect,
committed on entry and on exit, undoable, and it does not pin.

## Design

### The record (`renderer/panels/panels.ts`, `shared/layout-schema.ts`, `layout-adapt.ts`)

- `PanelBase` gains three optional fields, each ABSENT unless set and carried through every
  field-by-field copy site by the same conditional spread `title` uses: `locked?: true`,
  `pinned?: true`, `maximised?: { restore: WorldRect }`.
- On disk: absent is every pre-M92 file; a present value that is not `true` (or not a rect
  with four finite numbers) warns by panel id and is dropped, the panel kept.

### Lock (`usePanelDrag.ts`, `PanelFrame.tsx`)

- A locked panel's `onBeginDrag` returns before any state is built — move AND resize; the
  frame's handles keep rendering (a control that vanishes reads as a bug) with the cursor
  `not-allowed` and a title naming the fix (`locked — unlock in the palette or the pane`).
- A group drag SKIPS locked members (`applyGroupDrag` is handed only the unlocked ids) and
  the group's frame says `N locked` beside its label. Close still arms exactly as before:
  lock is about geometry, never lifecycle.
- The merged view already refuses every geometry write; lock adds nothing there.

### Pin (`lod.ts`)

- `TierInput.pinnedIds?: Set<string>`. Pinned panels are promoted FIRST, before the focused
  panel, in their array order, up to `budget`; the focused panel takes the next slot; the
  recency list fills what is left. A pin off-screen is still live (that is what a pin is
  for — an agent you are watching from elsewhere), but a pin on a dormant or force-carded
  panel yields, since neither can be live.
- The Nth pin past the budget is REFUSED at the verb with a named reason (`8 panels are
  already pinned — unpin one`), never silently carded: `assignTiers` is where the count is
  enforced, and the verb reads the same count through `pinCount(panels)`.
- `verify:viewport pin.1`: pins before recency; a pin off-screen is live; pins beyond the
  budget are carded in array order (the tier function's own arithmetic, so the verb's
  refusal and the tier agree).

### Maximise (`Canvas.tsx`, `panels.ts`'s `maximiseRect`)

- `maximiseRect(viewport, size, margin)` → the world rect that fills the visible viewport
  at the CURRENT scale, inset by the margin. Maximise writes it as the panel's rect, stores
  the previous rect as `maximised.restore`, raises the panel, and commits ONE history entry;
  restore writes the restore rect back, clears the field, and commits one more. Undo of
  either is the ordinary undo. A maximised panel is a panel whose rect happens to fill the
  view: it tiers, drags and resizes like any other, and the first drag or resize CLEARS the
  maximised mark (the restore rect would lie once the user moved it).
- One SIGWINCH in and one out: the rect change reaches the terminal through the ordinary
  resize path, and nothing here calls `refit` itself.
- Maximise does not pin (the scope's answer): it fills the viewport, so tiering keeps it
  live for the ordinary reason.

### Three ways each

The palette (`panel.lock`/`panel.unlock`, `panel.pin`/`panel.unpin`, `panel.maximise`/
`panel.restore` — six rows, each present and disabled with a named reason when it cannot
apply), the context pane's action bar (three toggles beside Close), and the frame's chrome
(a lock glyph and a pin glyph as state marks with a title, the maximise verb as a control).
The rail row carries the lock and pin marks after the state word.

## What it must not break

- `registry.version()` carries nothing new; the three fields are layout, read by render.
- A locked panel's Close, the M61 identity rule, the merged view's read-only geometry.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A pin silently carded past the budget; pins losing to recency | `verify:viewport pin.1` |
| A maximise that cannot be undone, or that stays marked after a move | `verify:viewport max.1` (the pure rect), `verify:panels lockpin.1` |
| A locked panel moved by a group drag | `verify:groups lock.1` |
| The three fields written as `undefined` or dropped on reload | `verify:layout lockpin.1` |
| A row hidden rather than disabled | `verify:palette lockpin.1` |
