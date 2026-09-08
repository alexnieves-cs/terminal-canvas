# M182 implementation plan

Spec: `docs/superpowers/specs/2026-09-08-m182-template-editing.md`. Grep the load-bearing
files for `templates`, `layout-schema`, `workflow`, `handoff-rules`, `setLinkAutomation`.

1. Pure first, checks red: `shared/template-edit.ts` (the six operations, `nextKey`), the
   `revision` field and its parse rule, `templateBinding` on the panel record (absent stays
   absent through `fromPanels`/`toPanels`/rename). Checks in `verify:layout`: `edit.1`
   (addNode mints unique keys, never reuses), `edit.2` (configureNode validates by kind and
   refuses an unknown field), `edit.3` (removeNode drops its edges), `edit.4` (addEdge refuses
   missing end, self, duplicate, cycle), `edit.5` (revision absent → 0; a non-integer drops the
   template with the rest kept), `edit.6` (templateBinding record rules). Delegated writer.
2. Main: `saveTemplate(template, expectedRevision?)` → `saved | stale`; `template:save`'s
   answer widened; `verify:layout store.edit.1` over the real store in a temp file.
3. Renderer: the draft store; the workflow panel draws the draft; block DRAG on the SVG
   (pointer down on a block, move, release → one `moveNode`); Delete on a selected block;
   the three palette text modes; the four verbs in the table and their executor arms;
   `instantiateTemplate` stamps the binding; `beginSaveTemplate` offers Update when the
   selection carries one binding.
4. Real renderer: `verify:panels:product workflow.edit.1` (drag a block → the draft moved,
   the diagram follows, the saved record unchanged until M184), `workflow.edit.2` (Update
   over bound panels saves the same id with revision + 1; a stale expectation is refused
   with the record kept). A `workflow-edit` shot scene is deferred to M183, where the
   library changes the panel's face; M182 changes no golden.
5. Critic, verifier, ledger, `feat(m182)`.
