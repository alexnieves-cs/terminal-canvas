# M184 — pure-tier red run (the run's snapshot and its outcomes)

The red-first evidence for M184's plain-node checks, written before any
production change exists. Two scoped ids: `run.def.1` appended to
`scripts/verify-layout.cjs` (the parser side) and `run.outcome.1` appended to
`scripts/verify-viewport.cjs` (the pure outcome side), plus one
`try { require } catch { return {} }` row in `scripts/viewport-entry.cjs` for
`src/shared/run-outcome.ts` — M181/M182's shape, so the bundle still BUILDS while
the module is absent and the check fails by name rather than at `buildSync`.
`scripts/layout-entry.cjs` needed no new row: `run.def.1` drives `parseLayout`
and `serialiseLayout`, which are already in that bundle.

No Electron suite was run and no production module was written.

## Commands and results

```
node scripts/verify-layout.cjs
exit code: 1
tally: 245/246 passed
FAILED: run.def.1

node scripts/verify-viewport.cjs
exit code: 1
tally: 139/140 passed
FAILED: run.outcome.1
```

Every pre-existing check passes in both suites. This worktree (branch
`v9-act2-workflow`, no M183 rows) printed 245 pre-existing layout checks, not
the 247 the shared checkout prints with M183's uncommitted work — the two
missing rows are M183's, not a regression.

## Why each new id is red today

| id | suite | why it is red |
|---|---|---|
| `run.def.1` | `verify:layout` | `parseRuns` rebuilds the run field by field and carries no `definition` or `mapping`: the `good` run comes back with neither key, no warning names `badrev` or `badmap` (`warnings: []`). The absent-stays-absent and serialise-to-no-key arms already hold (`plainHasKey: false`); the round-trip, the field-level drops and the two warnings are what fail. |
| `run.outcome.1` | `verify:viewport` | `src/shared/run-outcome.ts` does not exist; the entry's guarded require yields `{}`, so `typeof V.blockOutcomes` is not a function and the check fails by name: `blockOutcomes / outcomeWord do not exist in src/shared/run-outcome.ts`. |

## What each check pins

- `run.def.1` — six runs on one workspace of panels `a`, `b`, `c`, each with one
  `exit 0` entry and `templateId: 't1'`:
  - `plain` (neither field): `!('definition' in run) && !('mapping' in run)`,
    and `serialiseLayout(snapshot)` contains neither `"definition"` nor
    `"mapping"` as text — the pre-M184 file is written back byte-shape-identical.
  - `good`: a definition of three nodes (a terminal with `command`/`args`/`title`/`dx`,
    a chat with `message`, a `pool` block with `list`/`prompt`) and two edges
    (`idle`, `exit-ok`) plus a mapping `{n1:'a', n2:'b', n3:'c'}` — every field
    asserted after `parseLayout`, and again after
    `parseLayout(serialiseLayout(parseLayout(...)))`.
  - `badrev` (`revision: 1.5`): `!('definition' in run)`, the mapping kept, the
    entries and `templateId` kept, a warning containing both `run badrev` and
    `definition`.
  - `badnodes` (nodes `n1` good, `n2` with `kind: 'nope'`, a node with an empty
    key): `definition.nodes` is exactly `[n1]`, `definition.edges` is `[]` (the
    `n1→n2` edge named a dropped node), `revision` still `2`.
  - `badmapentry` (`n2: 7`): `mapping` is exactly `{n1:'a', n3:'c'}`; the
    definition intact.
  - `badmap` (`mapping: 'n1=a'`): `!('mapping' in run)`, the definition intact,
    a warning containing both `run badmap` and `mapping`.
  - All six runs survive (`runs.length === 6`).
- `run.outcome.1` — `blockOutcomes` over a run whose definition has keys
  `n1..n4` and a mapping of `n1..n3` → `a..c`: `b` started with no outcome →
  `working`; `c` with `outcome: 'exit 0'` → `finished`; `a` with no entry →
  `queued`; `n4` with no mapping at all → `queued` (the key is still a node of
  the snapshot, so it still gets an entry). A second run: `exit 1` → `failed`,
  `a turn` → `finished`, `exit by signal` → `failed`. A run with no
  `definition` → `{}` (own keys length 0). `outcomeWord` over all five members
  joins to `queued|working|finished|failed|needs you`.

## The `RunEntry` fields asserted on

`src/shared/runs.ts`'s `RunEntry` is `{ panelId, startedAt, endedAt?, outcome?: string }`.
The fixtures use exactly those four; `outcome` is a free string whose only
writer is `useHandoff.ts`'s `fired` events (`` `exit ${code ?? 'by signal'}` ``
and `'a turn'`) and `useRuns.ts`'s auto-mode seal (`'passed'`, `'stopped'`,
`` `stuck — …` ``). So: an ok exit is the literal `exit 0`; an idle is the
literal `a turn`; a failing exit is `exit <non-zero>` or `exit by signal`.
`working` is an entry present with `outcome === undefined`.

`RunEntry` has NO pending-question field, so no fixture produces `wants-you`;
the check states this in its own header comment and only asserts
`outcomeWord('wants-you') === 'needs you'`.

## Assumptions where the agreed API left room

1. `docs/superpowers/plans/2026-09-08-m184-save-run-stop.md` does not exist in
   this worktree (only the spec does); the checks follow the API as stated in
   the task and the spec's `definition`/`mapping` paragraph.
2. Warnings are matched by SUBSTRING — `run <id>` and the field name
   (`definition` / `mapping`) both present in one warning line — so the exact
   wording is the implementer's. `parseRuns`' existing lines already read
   `run ${entry.id}: …`, so this fits the file's idiom.
3. A definition's edge naming a node that was dropped is dropped with it
   (`parseTemplates`' own rule — "a dropped node takes its edges with it").
   The check asserts `edges.length === 0` for `badnodes`.
4. A pool node in a definition (`kind: 'pool'`, `list`, `prompt`) survives the
   definition parse the way `parseTemplates` routes it through
   `parseWorkflowNode`; the check asserts only `kind === 'pool'` on it, not the
   block's other fields.
5. The mapping's VALUES are not required to name surviving panels (the task
   did not ask; a mapping onto a since-closed panel is still true history), so
   the check never asserts a mapping entry is pruned for a missing panel.
6. `blockOutcomes` answers with one entry per key in `definition.nodes` even
   when the mapping lacks that key (`n4` → `queued`); a stricter
   implementation that omits unmapped keys would fail the key-set assertion.
7. Outcome classification is by the recorder's literal vocabulary: `exit 0` →
   finished, any other `exit …` (including `exit by signal`) → failed,
   `a turn` → finished. The auto-mode words (`passed`/`stopped`/`stuck — …`)
   and the handoff `skipped — …`/`handed off …` sentences are not in the
   fixtures; how they classify is the implementer's call.
8. `outcomeWord` returns the word (`needs you` for `wants-you`), never a token
   or class name.
