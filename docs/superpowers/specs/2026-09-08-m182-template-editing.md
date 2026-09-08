# M182 — one template, two editors: the shared operations

The first milestone of Act II. M133 drew a saved template as a projection and disabled Save
with the sentence "the live canvas is the editor". The 5.0 brief strikes that: the diagram
and the canvas become two editors of ONE record. M182 lays the operations both editors apply,
the revision that keeps two saves honest, and the canvas binding; M183 adds the library, the
wiring gesture and the schema inspector; M184 adds Save, Run and Stop on the diagram.

## The operations, pure

`src/shared/template-edit.ts` holds every mutation a template can undergo, each pure over a
`PersistedTemplate` and answering `{ kind: 'ok', template } | { kind: 'refused', reason }`:
`addNode` (a key minted unique in the record, `n<N>`, never reused after a removal — the
record remembers `nextKey`; the node placed at the given offset), `moveNode`, `configureNode`
(a patch of the node's own fields, validated by kind: a terminal or chat's `cwd` non-empty, a
pool's `width` within `POOL_WIDTH_MAX`, a collect's `target`; an unknown field refused by
name), `removeNode` (its edges go with it, as `parseTemplates` already rules), `addEdge`
(refused by name for a missing end, a self edge, a duplicate pair, and a CYCLE — the same rule
`setLinkAutomation` refuses on the canvas, reached from the record's side), `removeEdge`.
Nothing here touches React, the layout store or a run. `verify:layout edit.1–.6`.

## Revision and conflict

`PersistedTemplate.revision` (absent on every pre-M182 file and read as 0; an integer, else
the template drops by name with the rest kept). The store's `saveTemplate` takes an
`expectedRevision`: when it matches the record on disk the save writes revision + 1 and
answers `saved`; when it does not, nothing is written and the answer is `stale` with the
current record — the draft is the caller's to keep, and the two verbs it is offered are
reload and save a copy. A built-in template saves as a user COPY with a new id (the built-ins
are code, M80's rule). `template:save` answers this shape; the palette's existing
`Save selection as template` passes no expectation (a new record) and is unchanged.

## The draft, and the canvas binding

The workflow panel edits a DRAFT: `renderer/workflow/template-draft-store.ts`, a per-template
mirror (the M105 shape: subscribed by id, a cached snapshot, cleared when the last panel of
that template closes) holding the draft template, the revision it was read at, and `dirty`.
Every operation goes through the store's one `apply(templateId, op)`, which calls the pure
function and keeps the draft; the diagram is `buildDiagram(draft)` — the projection of the
draft now, and of the saved record when there is no draft.

The canvas binding: a panel minted by `instantiateTemplate` carries `templateBinding:
{ templateId, key }` on its record (absent on every other panel; carried by name at every copy
site; dropped by the parser when malformed). `Save selection as template` over a selection
whose panels all carry ONE binding offers "Update <name>" beside "Save as new": the update
rebuilds that template's nodes from the panels' live positions and specs through the same
`configureNode`/`moveNode` operations against the saved record and saves with the record's
revision — so a person who ran a template, dragged its panels into a better shape and saved
has edited the SAME record the diagram draws, and a stale save is refused the same way.

## Doors

Canvas: dragging a block on the diagram moves the node (a real drag on the SVG, committed on
release as one `moveNode`); the binding above for move and configure; Delete on a selected
block removes it. Palette: `Workflow: add node…`, `Workflow: remove node…`,
`Workflow: set…` on the selected workflow panel, each a text mode over the same operations.
Agent: `workflow-add <template> <kind>`, `workflow-move <template> <key> <dx> <dy>`,
`workflow-set <template> <key> <field> <value>`, `workflow-remove <template> <key>` through
M180's door. Workflow: the M189 omission. A node kind's library entry and the schema-driven
inspector are M183's; wiring edges by gesture is M183's (the `addEdge` operation and its
palette/agent doors are here).

## Not here

Save on the diagram (M184 — the draft stays in the store until then; the canvas binding's
update path saves through the palette today), Run on the draft, a node library, the inspector
fields. Historical runs are untouched by every operation: a run's `templateId` mark names
the record, not a revision, and M184 gives runs their definition snapshot.
