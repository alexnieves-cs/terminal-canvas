# M388–M394 — flowcharts on the canvas

The act log for the flowchart half of the canvas run (prompt:
`docs/superpowers/specs/2026-09-29-canvas-revamp-flowchart-prompt-opus55.md`). The run's state,
its decisions (D1–D11) and its ranking live in the ledger,
[m388-m396-ledger.md](m388-m396-ledger.md); this file says what each milestone built and how
it is checked.

**The picture, in one sentence:** a person double-clicks the ground, types "Start", presses Tab,
types the next step, Tab again, turns a step into a decision from the inspector, ⌥→ for the
`no` branch, and has a routed, labelled flowchart without touching the mouse again — and the
chart can become the plan for real work, and then shows that work's state.

## M388 — Shapes

- **The kind.** `shape` (`src/shared/flowchart.ts`): eight forms — process, decision,
  terminator, input/output, document, subprocess, junction, free text — with a label and
  optional fill / line / text from EXISTING tokens (D7: fills are M187's four sticky tints
  plus the panel surface and none; the state hues are never a fill, because colour means state
  and M393 paints state on a shape's outline).
- **The reader.** `parseShapeRecord` (absent ≠ malformed; an unknown form drops the panel by
  name, a malformed field costs the field) in `layout-schema/panels.ts`, clamped to
  `SHAPE_MIN` not the terminal's 200x160; every copy site (`layout-adapt`, the rename arm in
  `presets.ts`, portable's `TRAVELS`) carries it field by field; `seedAfter` now knows every
  prefix the canvas mints (`nt`, `sh`, `cx`, `img`, … — `nt` ids had been invisible to it).
- **The layer.** `flowchart/ShapeLayer.tsx` — one memoised layer, not PanelFrame (ledger D1;
  load-bearing entry). Chromeless by M236's test (recorded in `styles.css`'s frame-rule list and
  CLAUDE.md). The label is a textarea typed in place (plain text by construction). Eight-edge
  resize at the shape's own floor (`DragState.min`, `applyDrag` generalised). At the summary /
  block tiers the outline thickens and the label hides — a diagram stays a diagram.
- **Not rail rows** (D8); drawn on the minimap as one path.
- **Doors.** `shape-add`, `shape-set`, `shape-style` — a double-click on the ground; the
  palette's eight Add rows; `tc plan shape-add decision Is it valid`; a workflow action node.
- **PRODUCT.md**, written from README / CLAUDE.md / product-rules only — owed the owner's review.

## M389 — Connectors

- **Their own record, on the source** (`PanelBase.connectors`, D2) — not a link: an arrow in a
  diagram must never mean task membership or handoff. Parsed per entry (`parseConnectors`),
  dangling targets pruned by the workspace pass, pruned by `removePanel`, carried by every copy.
- **Geometry** (`shared/flowchart-geometry.ts`): outlines per form, ports on the outline (the
  input/output's slanted sides inset), auto ports that face each other, three routes — elbow
  (an A* over a sparse orthogonal grid that routes AROUND shapes, rounded corners), straight,
  curved (the panel links' own Bézier constants) — arrowheads at either, both or neither end
  with the stroke trimmed under the head. 260 connectors among 200 shapes route in 4–11ms.
- **The layer** (`flowchart/ConnectorLayer.tsx`): the link layer's slot and rules (1px SVG,
  hit strokes that never consume, select on click); labels as HTML chips typed in place;
  routes REUSED across frames unless their ends or nearby shapes moved (`connector-model.ts`).
- **Drawing.** From a shape's port onto an object (a connector), or onto empty ground (the NEXT
  step, connected, its label open). From a live object's port: onto a shape → a connector; onto
  empty ground → a connected process step (quick-connect from any object, D11).
- **The inspector's Connector section:** route, arrows, line, dashed, label, Remove.
- **Doors.** `connect`, `connector-style`.

## M390 — Building fast

- **Keys** (D3, `useShapeKeys.ts`): Enter edits; Tab adds the next step in the chart's flow (and
  Tab inside a label commits AND adds it); ⌥+arrow a branch; arrows nudge (⇧ ×10), committed once
  on release; Delete deletes authored objects; ⌘D duplicates (diagnostics → ⌘⌥D, D4). Bare keys,
  behind three gates — the load-bearing entry says why a terminal can never see one.
- **Object copy/paste** (D9): an in-app clipboard with a content-free marker on the system one.
- **Arranging** (`canvas/arrange.ts`): align (six edges), distribute (equal gaps), and
  `smartSnap` replacing `snapRect` — edge/centre alignment as before plus EQUAL-SPACING guides
  that light every equal gap with its distance; a multi-object move now snaps as one rect.
- **No grid** (D10 — `ground.1` records a flat canvas).
- **Doors.** `duplicate`, `align`, `distribute` (the pill's Line up / Space evenly on a selection).

## M391 — Auto-layout and Mermaid

- **Layout** (`shared/flowchart-layout.ts`): layered, cycles broken, dummy nodes for long edges,
  crossing reduction, variable sizes, four directions — 200 nodes in ~3ms. Applied to a
  selected chart (one shape selected means its whole chart), animated on the camera tier
  (160–320ms by distance, one history entry at the end), instant under reduced motion.
- **Mermaid in** (`shared/flowchart-mermaid.ts`): a hand-written scanner (no dependency, bounded,
  no backtracking regexes), every shape and edge syntax mapped, subgraphs → groups, and every
  `click`/`style`/`classDef`/… DROPPED AND COUNTED — the import sentence says what was left out.
  Inert by construction: a shape is a form and words. Doors: ⌘V of Mermaid text on the canvas,
  the palette's Import (a file), `tc plan flowchart-import /abs/path.mmd` (refused to a teammate's
  plan), a workflow node. An agent's diagram lands as a group named for its source.
- **Mermaid and SVG out**: text, through `outward` in main (`export:flowchart`), the scrub count
  in the verb's note; the SVG is built from the model (no raster, no script, no href — main
  refuses one that has any), so the canvas PNG stays the ONE binary door (D6).
- **IPC.** `export:flowchart`, `flowchart:read` (`main/flowchart-files.ts`, injected deps).

## M392 — Shared flowcharts

- **The wire.** `SharedPanel.shape` and `SharedPanel.connectors`, two more keys in a panel's
  field map, JSON strings capped at 2 KB / 16 KB (`SHARED_SHAPE_MAX`, `SHARED_CONNECTORS_MAX`);
  parsed on read by the same readers as the layout (a bad field costs the field; an arrow to a
  panel not live in the doc is dropped). A shape's shared `title` is its label's first line, so
  a client that does not draw shapes still names it. Written by main only for panels it HOSTS,
  the words scrubbed through canvas-sync's existing `redactSecrets` door (no new caller).
- **The gate.** `panel-content` (field `shape` | `connectors`), the retitle rule: the panel's
  owner only; `inspectUpdate` recognises exactly those two fields and still refuses every other
  unknown one; the collab server judges it through `authorizeCanvasOp` and counts it in the
  `edited` summary (`diagram edits N`) — the audit's action set is pinned by its migration.
- **What a peer sees.** A teammate's shape drawn in the ShapeLayer as the real shape, READ-ONLY
  (no handles, ports or editor), an owner-colour dot on its outline; an editor may move it (the
  placeholder write-through); the workspace owner may remove it. Their arrows draw read-only.
- **Limits.** A peer cannot edit a teammate's words or arrows; a local panel cannot connect TO a
  teammate's shape (a connector's target must be in the holder's own layout); a peer's shape
  does not wear M393's live state.
- Checks: `cs.flow.1–9`, `srv.flow.1`, `audit.flow.1`, `flowchart.shared.1–6`.

## M393 — The living flowchart

A shape joined by a connector to a live object — a terminal, an agent's chat, a watcher, a work
card — wears that object's state: its outline again in the tone, and ONE word on a chip, from
`panels/useShownState.ts` (extracted from the rail row, so the shape and the rail cannot say
different words). The binding is derived from the connectors every render and reused when
nothing changed; the badge has its own per-id subscriptions.

## M394 — Sketch → plan

`flowchart-plan` ("Start work from this chart…"): the selected chart's labelled steps, in the
order the connectors say, become a `TaskPlan` (processes → agent steps, decisions → review steps
a person answers; starts, junctions and labels pass their dependencies through; a loop-back
arrow does not make steps wait on each other; over twelve steps is refused by name). It opens the
ordinary Start work sheet with the plan and a brief — the sheet is the approval; nothing is
minted until a person presses Start, and every step is then started by that person (M327's
rule). Once the card exists each shape learns its step (`shape.step`), and from then on shows
the STEP's state — the same `planView` derivation Orchestrate's task row reads. Doors: the pill's
Start work and the inspector's Start work… on a selected chart, the palette row, an agent line
(it opens the sheet; the person decides), a workflow node.
