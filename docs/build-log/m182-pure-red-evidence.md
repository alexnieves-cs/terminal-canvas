# M182 — pure-tier red run (template editing)

The red-first evidence for M182's plain-node checks, written before any
production module exists. Seven scoped ids appended to `scripts/verify-layout.cjs`
(and one `try { require } catch` row in `scripts/layout-entry.cjs` for
`src/shared/template-edit.ts`, M181's shape, so the suite still BUILDS while the
module is absent and each check fails by name).

## Command and result

```
node scripts/verify-layout.cjs
exit code: 1
tally: 238/245 passed
```

Every one of the 238 pre-existing checks still passes. The seven that fail are
all new:

| id | why it is red today |
|---|---|
| `edit.1` | `src/shared/template-edit.ts does not exist` (guarded by name: `nextNodeKey`/`addNode`/… are not functions on the bundle) |
| `edit.2` | same — module absent |
| `edit.3` | same — module absent |
| `edit.4` | same — module absent |
| `edit.5` | `parseTemplates` keeps every template regardless of `revision`/`nextKey` — the ten fixtures all survive (`frac`, `neg`, `revstr`, `nkfrac`, `nkneg`, `nkstr` should have dropped by id) and a present `revision: 3` is not carried |
| `edit.6` | `parseLayout` drops `templateBinding` silently for every panel (b1's good binding is gone, no warning names b2–b5); `carryMarks` does not carry it; `toPanels`/`fromPanels` drop it |
| `store.edit.1` | `saveTemplate` returns `undefined` (today it is `void`), no `revision` is minted, and the mismatched "stale write" was written to disk — the re-read shows `name: "stale write"` on the file |

## What each check pins

- `edit.1` — `nextNodeKey`: `n4` over keys `n1,n3,custom`; `n7` with `nextKey: 7`; `n1` for no nodes. `addNode` mints `n4`, sets `nextKey: 5`, returns a fresh template (input's JSON unchanged); after `removeNode('n4')` the next add is `n5` (never reused) with `nextKey: 6`; a chat with `cwd: ''` refused naming `cwd`; a pool with width `POOL_WIDTH_MAX + 1`, `0` or `1.5` refused naming `width`; width `3` accepted.
- `edit.2` — `moveNode` sets absolute `dx`/`dy` (a second move replaces, not adds); the other node untouched; a missing key refused naming `n9`; `NaN` and `Infinity` refused; input unchanged.
- `edit.3` — terminal patch of all six fields; chat `message`; `width` on a terminal refused naming `width`; `title: 7` naming `title`; `args: ['a', 1]` naming `args`; `kind` and `key` patches refused naming them; `cwd: ''` on a chat naming `cwd`; pool's four fields; pool width `MAX+1` and `2.5` refused; `title` on a pool refused; orchestrator `prompt`/`cwd`; `list` on an orchestrator refused; collect `target`; `prompt` on a collect refused; a missing key naming `n9`.
- `edit.4` — chain a→b→c; `removeNode('b')` leaves `a,c` and zero edges; `removeNode('zz')` refused naming it; `addEdge` from `zz` / to `yy` refused naming the end; a→a refused; a→b under another trigger refused (duplicate); c→a refused with the word `cycle`; a→c appended as edge 3 with its trigger; `removeEdge(a,c)` drops it; `removeEdge(c,a)` (absent) refused.
- `edit.5` — `revision`/`nextKey` absent stay absent (`!('revision' in t)`); `3`/`5` and `0`/`1` carried; `1.5`, `-1`, `'2'`, `2.5`, `-3`, `'n4'` each drop that template with a warning containing its id; `plain,rev,zero,last` survive in order.
- `edit.6` — `templateBinding` through `parseLayout` (good kept; `{templateId}` only, empty `templateId`, a string, a numeric `key` each drop the binding only with a warning containing the panel id, the panel kept; absent absent), `carryMarks` (absent absent; present copied, not the same object), `toPanels`/`fromPanels` (round-trip, copied not shared).
- `store.edit.1` — real store over a temp file: new record → `saved`, `revision: 0`; `saveTemplate(t, 0)` → `saved`, `revision: 1`; a second `saveTemplate(t', 0)` → `stale` with `current.revision === 1` and a non-empty `reason`, and after `flushSync` the file re-read still holds revision 1 / name `second`; then a save with no expectation on the existing record → `saved`, `revision: 2`, on disk.

## Assumptions where the agreed API was ambiguous

1. `docs/superpowers/specs/2026-09-08-m182-template-editing.md` and the matching plan do not exist in this worktree (only M180/M181's do); the checks are written from the API as stated in the task, not from a spec.
2. `nextNodeKey` derives from the highest `n<digits>` key when `nextKey` is absent; a non-`n<digits>` key (`custom`) is ignored for the derivation. `nextNodeKey` with `nextKey` present returns `n<nextKey>` exactly (it does not also scan the nodes).
3. `addNode`'s returned template carries `nextKey` = minted N + 1 (`5` after minting `n4`), and the returned `nextKey` after a `removeNode` is unchanged, so the next mint is `n5`.
4. A `refused` reason is matched by substring (`reason.includes('cwd')`, `includes('width')`, the key text, `'cycle'`) — the exact wording is the implementer's.
5. `moveNode` with a non-finite number is only asserted `kind === 'refused'` (no word required). Self-edge, duplicate edge and a missing edge on `removeEdge` are likewise asserted `refused` with no required word.
6. `addEdge`'s trigger is not validated by any check here (an unknown trigger's fate is unspecified); `parseTemplates` already refuses it on disk.
7. `configureNode` is asserted to keep `dx`/`dy`, `kind` and `key` intact after a patch; a patch with several fields is applied atomically (all six terminal fields checked on one result).
8. `parseTemplates` drops a template on a bad `revision` or `nextKey` and the warning must contain the template's id; `revision: 0` is a valid present value and is carried as `0`.
9. `templateBinding`'s warning must contain the panel id; a numeric `key` counts as malformed (both fields must be non-empty strings).
10. `saveTemplate` is called with two arguments on the existing `void` signature; the check folds a throw into `{ kind: 'threw' }` so a partial implementation still reads. `stale.reason` is only asserted non-empty. The unconditional overwrite of an existing record bumps `revision` by 1 from the CURRENT record (1 → 2), not from the caller's copy.
11. `store.edit.1` reads the disk through `L.parseLayout(readFileSync(path))`, so it depends on `edit.5`'s parser change too — a store that mints revisions correctly but a parser that still drops the field will keep this red until both land.

## Harness notes

- `verify:meta` (plain node) was run after the splice: 37/38. The duplicate-id
  check (22) passes over the new scoped ids. The one red is `milestones.1`
  (`missingRows: [182]`): this very file is a `docs/build-log/m182-*` log and
  `README.md` has no M182 row yet. That row lands with the milestone; until it
  does, `verify:meta` reads M182 as a log without a row.
- No Electron suite was run; no production module was touched.
