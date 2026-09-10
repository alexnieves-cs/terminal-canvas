# Act II — the workflow becomes an editor (M182–M184)

The v9 run's second act, on `v9-act2-workflow`, merged into `main` as one `--no-ff` commit.
Its ledger lines, with the specs, the plans, the red-first evidence, the critics' findings and
the golden sentences, are `docs/build-log/m180-m200-ledger.md` under `## M182`, `## M183` and
`## M184`. This file is the act's close: what the three milestones are together, and the three
commands that stand behind the merge.

## What the act is

M133 shipped the workflow panel as a PROJECTION: the live canvas was the editor, the diagram
drew what was stored, and Save was disabled by design. The 5.0 brief strikes that principle by
name (its deliberate-amendments table, row one) and this act is the replacement — **one
template with two editors that cannot disagree**, because both go through one door.

- **M182 — the operations and the draft.** `shared/template-edit.ts` is six pure operations over
  a template (add, move, set, remove, edge, unedge) plus `retriggerEdge`, `fieldsOf`,
  `edgeWouldCycle` and `nextNodeKey`. `renderer/workflow/template-draft-store.ts` holds the
  draft per template id and `applyDraftOp` is the ONE door every editor calls, so the diagram's
  drag, the palette's row and an agent's plan are the same operation with three front ends. The
  record grew a `revision`, `layout-store.ts`'s `saveTemplate(template, expectedRevision)`
  answers `saved` or `stale`, and `templateBinding` is the fifth panel mark — the canvas half
  of "two editors", with its Update as one member.
- **M183 — the library, the wire and the inspector.** `shared/template-library.ts` is one entry
  per node kind with a glyph, a name, a sentence, an example, a parser-acceptable default node
  and a placement. The library is a DISCLOSURE, not a column: the critic refused the column
  outright, because a 180 px column beside a 640 px panel left half the diagram past the frame's
  edge at rest, and a block diagram that cannot show its blocks is a worse resting state than
  the one before it. A port drag previews the wire and lights the block under it as allowed or
  refused, a cycle is refused in the preview and commits nothing, an edge is selected by a click
  on its word and removed with Delete, and the context pane renders the selected block's fields
  from its kind's schema.
- **M184 — Save, Run and Stop.** Save writes the draft back at its base revision; a record saved
  underneath is refused as STALE with the draft kept and two verbs out of it (Reload, Save a
  copy). A built-in saves as a copy, and the panel is rebound to the copy so the edits stay on
  screen. Run runs the shape on the diagram — the draft when there is one — and records the
  shape it ran on the run itself (`definition` + `mapping`), so the diagram draws that run's own
  blocks and words while it is selected and a later edit can never rewrite a finished run. Stop
  interrupts the selected run's pools and chats and kills nothing.

## The three commands

Run on `v9-act2-workflow` at `05a8d97`, in the environment `evidence/v9-run/run-electron.sh`
sets (the system `TMPDIR`, every other transient directory local, `TC_VERIFY_SUFFIX=v9`).

| Command | Exit | Result | Log |
|---|---|---|---|
| `npm run verify` | 0 | 38 suite tallies, no FAIL line | `evidence/v9-run/m184b-verify-chain.log` |
| `npm run verify:visual` | 0 | 59/59, 172.7 s wall | `evidence/v9-run/act2-visual.log` |
| `npm run verify:packaged` | 0 | 12/12 — the built `.app` launches with a stripped PATH, spawns a PTY, and a second instance refuses and leaves the incumbent's PTY alive | `evidence/v9-run/act2-packaged.log` |

The chain's tallies, in order:

```
14/14 38/38 56/56 140/140 6/6 12/12 38/38 248/248 18/18 15/15 7/7 143/143 194/194 98/98
27/27 85/85 103/103 26/26 7/7 35/35 27/27 141/141 22/22 25/25 4/4 26/26 13/13 10/10
63/63 4/4 1/1 6/6 11/11 78/78 96/96 49/49 80/80 71/71
```

Five goldens changed in this act's close and each carries its critic's sentence in the ledger
(`### Act II — the goldens that changed`): `workflow`, `workflow-edit`, `wide`, `palette-query`
and `starter`. M183's own three scenes carry theirs under `## M183`.

## What this act owes

- The workflow door of the four-door rule is DATA, not a claim: every `V9_DOORS` row in this act
  records `workflow: { reason: 'canvas-action adapter ships with node execution', due: 'M189' }`,
  and `verify:verbs closure.v9.1` reads it. Nothing here pretends a workflow node can run a
  canvas verb yet.
- `Test this node` (the brief's "reports input, output, duration and a named failure without
  falsely running its neighbors") is M188's, with the node schemas and the executor.
- A person still owes the timed trial the brief asks for: a beginner opening the app, editing a
  workflow and running it, with live authentication and installation delays reported honestly.
