# M183 implementation plan

1. Pure: `shared/template-library.ts` (`LIBRARY`: kind, glyph name, name, sentence, example;
   `defaultNodeOf(kind)`; `placementFor(template)` — to the right of the rightmost block) and
   the draft store's `selectedOf`/`select`. Checks red first in `verify:layout`: `library.1`
   (one entry per kind in `fieldsOf`'s table, each with a sentence and an example),
   `library.2` (`placementFor` never overlaps an existing block; empty template at 0,0).
2. Renderer: the library column in `WorkflowNode.tsx` (a `<ul data-workflow-library>` with
   `data-workflow-library-kind` entries, a real drag through mousedown/move/up with a preview
   outline over the SVG, drop → `add` at the SVG point; the `Add` button → `placementFor`);
   the port (`data-workflow-port`) and the wire preview line (`data-workflow-wire`), release
   over a block → `edge`; refusal sentence `data-workflow-refusal`; edge selection by label
   click and Delete. The inspector: `inspector-fields.ts` gains the `workflow` model's
   `node` arm (fields from `fieldsOf`), `Inspector.tsx` renders editable fields for it and
   commits through `actions.editWorkflow`. The selected block moves into the draft store.
3. Product checks red first: `workflow.lib.1` (a real drag from the library entry to the
   diagram adds a block at the drop point; `Add` adds one at the placement point),
   `workflow.wire.1` (a real port drag wires an edge; a second drag closing a cycle shows the
   refusal and adds nothing), `workflow.inspect.1` (selecting a block shows its fields in the
   inspector; editing `title` and pressing Enter renames the block; a bad `width` keeps the
   value and shows the reason). Shot scene `workflow-edit` (the library, a selected block
   with its port, the inspector's fields) with its intent and sentence before the golden.
4. Critic, verifier, ledger, `feat(m183)`.
