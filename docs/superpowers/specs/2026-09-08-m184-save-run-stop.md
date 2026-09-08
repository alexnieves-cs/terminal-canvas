# M184 — Save, Run and Stop on the diagram

The last milestone of Act II. M182 gave the template a draft and six operations; M183 the
library, the wire and the inspector. M184 lets the diagram SAVE the draft back as the template
with the revision check, RUN it from the draft, STOP what it started, and watch each node's
outcome on the same diagram — with every outcome belonging to the run's own snapshot, so a
later edit never rewrites it.

## Save

The workflow panel's `Save` verb is enabled while the draft is dirty and disabled with the
sentence "nothing to save — the diagram matches the template" otherwise (present always).
Save calls `template:save` with the draft and `baseRevision`; `saved` resets the draft to the
record (clean, revision + 1, the rows reloaded); `stale` keeps the draft and shows the reason
under the verbs with two verbs beside it — `Reload` (the record replaces the draft) and `Save
a copy` (the draft under a new name, a new id at revision 0). A built-in template's Save is
always `Save a copy`, named so on the button. A dirty panel's `⋯` and close ask nothing: the
draft outlives the panel (M182's amendment) until saved, reloaded or the record deleted.

## Run, and the run's snapshot

`Run` on a dirty draft runs the DRAFT (what the person sees is what runs), through
`instantiateTemplate` unchanged. A run's record (`PersistedRun`, M79) gains `definition`: the
template as it was at the run's start — id, revision, nodes and edges — and `mapping`: node
key → panel id for every panel the instantiation minted. Both absent on every pre-M184 run and
never normalised; a malformed one drops the field, never the run. The Runs tab lists each run
with its revision; selecting a run shows its outcome ON THE DIAGRAM: each block wears the
state tone of its panel's run entry — queued (no entry yet), working, finished (exit ok /
idle), failed (exit fail) — through the existing state vocabulary and the run's own entries
(`useRuns`' reducer), never a second store. Editing the draft after a run leaves that run's
blocks and words exactly as they were, because they are drawn from the snapshot's nodes.

## Stop

`Stop` interrupts every chat and pool of the selected run (the pool's own `stop`, M138; a
chat's `interrupt`) and kills nothing — a killed agent loses its turn (M82's rule). Present
always, disabled by name when nothing of this template is running.

## Doors

Canvas: the three verbs on the panel, and the run's outcome on the diagram. Palette:
`Workflow: save`, `Workflow: run`, `Workflow: stop` rows on the selected workflow panel.
Agent: `workflow-save <template>`, `workflow-run <template>`, `workflow-stop <template>` through
M180's door (a save that is stale answers the reason; run through the same instantiation).
Workflow: the M189 omission.

## Not here

Approvals on the graph beyond the state tone (the approval's question stays on the chat and
in the attention popover, M76 — the block reads `wants-you`). Node-level input/output results
(M189's executor). Cross-view agreement beyond the binding (M182).
