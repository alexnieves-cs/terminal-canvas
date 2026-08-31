# M26 — Complete multi-select

## Decision

M26 completes backlog #52 with two canvas gestures:

- Shift-clicking a panel chrome adds that panel to the active workspace's
  selection. It is add-only; clicking empty background remains the explicit
  clear gesture.
- Dragging the chrome of a selected member moves every selected panel. A
  selected member keeps the selection through its press so Shift does not need
  to remain held during the drag.

Every panel kind participates: terminal, file, review, toolbox and Jira nodes
all use the same selection state and drag entry point.

## Geometry and history contract

A group gesture carries one immutable `DragState` per selected panel. Each
mousemove runs `applyDrag` separately from that member's original rect; no
group bounding box is created. This preserves the existing recompute-from-
origin rule at every zoom level and never turns a group move into accumulated
frame deltas.

The document-level drag hook commits the entire state list once on mouseup,
giving the group exactly one history entry. Resize remains a one-member
gesture and still refits only its resized terminal.

## Workspace boundary

Merged view is read-only. Its existing drag gate remains authoritative, and
additive selection also refuses while merged, so a selection cannot collect ids
from different workspace records and later be handed to a workspace action.

## Verification

`verify:viewport` checks that two distinct source rects receive the same delta
through independent `applyDrag` calls. `verify:panels` drives the full
shift-click → ordinary group drag → one undo interaction and proves both
members move and return together.
