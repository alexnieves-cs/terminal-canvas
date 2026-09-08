# M183 — the library, the wire and the inspector

The second milestone of Act II. M182 gave the template a draft and six pure operations; M183
gives the three gestures the n8n posture is made of: a library to drag a node from, a port to
wire an edge from, and an inspector that edits the selected node from its kind's schema.

## The library

Inside the workflow panel's Definition tab, a LIBRARY column on the left of the diagram: one
entry per node kind (terminal, chat, pool, orchestrator, collect; Act V adds its kinds through
the same registry), each a glyph, a name, one useful sentence and an example line. Dragging
an entry over the diagram previews the block's outline under the pointer; dropping applies
`addNode` at the drop point's authored offset. Each entry also has an `Add` control (keyboard
reach, M44's rule): it applies the same operation at the established placement point — to
the right of the rightmost block, one gap over. The library is `shared/template-library.ts`,
a pure table the inspector and the validator share (`fieldsOf`).

## The wire

Every block carries a PORT on its right edge. A pointer down on the port and a drag draws a
preview line from the port to the pointer; over another block the line says whether the edge
is allowed (the block's outline in the accent or in the refusal tone); releasing over a block
applies `addEdge(from, to, 'exit')` — `exit` is the default trigger, changed in the inspector.
A refused wire (a cycle, a duplicate, a self edge) commits nothing and its reason shows under
the verbs for a moment (`data-workflow-refusal`), the M133 pattern of a reason on screen. An
edge is selectable by a click on its label; Delete removes it (`removeEdge`).

## The inspector

When a block is selected, the context pane (M46's inspector) names the node — kind and key —
and renders its fields from `fieldsOf(kind)`: a text field per string, a number field for
`width`, a list field for `args`, an `exit / idle / …` select for a selected edge's trigger.
Every commit (Enter, or blur) applies `configureNode` (or the edge's re-add with the new
trigger) through the draft store's one door; a refusal keeps the typed value and shows the
reason beside the field — the draft is never lost to validation. The selected block is a
fact of the draft store (`selectedOf(templateId)`), so the panel, the inspector and the
palette rows agree on which node is meant. A workflow panel with no selected block keeps
M133's inspector model (the template's name and its block count).

## Doors

Canvas: the drag from the library and its `Add` control (`workflow-add`), the port drag
(`workflow-edge`), the edge's Delete (`workflow-unedge`), the inspector's fields
(`workflow-set`). Palette and agent: M182's rows and verbs, unchanged. Workflow: the M189
omission. The `V9_DOORS` rows that said "M183" are rewritten to name these gestures.

## Not here

Save, Run and Stop on the diagram (M184). Act V's node kinds and Test this node (M189). A
node's example is a sentence in the library entry, not an instantiable fixture.
