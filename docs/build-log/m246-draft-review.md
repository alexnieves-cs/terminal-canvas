# M246 — per-cell draft review (a generic item draft)

Spec: `docs/superpowers/specs/2026-09-10-m246-draft-review.md`.
Plan: `docs/superpowers/plans/2026-09-10-m246-draft-review.md`.
On `m245-sheet`, after M245 (8fb1ea84).

## Evidence
- **Watched failing:** `verify:draft` 0/20 before `sheet-draft.ts` existed; 11/20 once the adapter
  landed and before the session/view/door edits. `draft-review.ts` was written just before its
  checks, so `draft.generic.*` never went red — recorded here rather than claimed as TDD.
- **Green:** `verify:draft` 20/20 (the generic interface exercised on SLIDE ids; a partial keep
  writing only the kept cells; discard byte-identical, Buffer against Buffer; a change underneath
  named by file and cell with keep refused; rebase keeping the still-valid items; a pending draft
  surviving a restart; the export strip; the agent door proposing, never keeping); `verify:sheet`
  48/48; `verify:verbs` 25/25 with `sheet-review`'s four doors; `verify:meta` 45/45; `typecheck`
  exit 0; `verify:styles` green.
- **`verify:styles` caught M245's CSS**, committed without that suite having been run: an
  undeclared `--fg-1` and literal font-size/radius/spacing values off the scale. Fixed here, in
  both the M245 and M246 blocks.

## Decisions
- The draft lives in `SheetView.draft`, persisted with the layout — no sidecar in the user's repo,
  no new channel. Restart states: none / pending / applied (`draftOutcome`), and conflict.
- A malformed draft costs the DRAFT (named in `dropped`, warned by `layout-schema`), never the
  view — dropping the view would reopen the sheet as a text file.
- Who asked decides: `caller.panelId` (agent door, or a workflow an agent triggered) proposes; the
  palette runner, a person's run and the grid write. `sheet-edit` left the teammate refusal list:
  proposing writes nothing. Keeping through the agent door is refused by name.
- A person's own write rebases the draft onto it (items they overwrote are dropped and named), so
  the person never causes a "conflict" by editing another cell.
- `contentHash` is a sync FNV-1a pair: detection only — main's CAS guards the write itself.

## Fresh-context critic (feature-dev:code-reviewer, read-only)
Two findings, both verified against the code and fixed; each now has a check.
1. **Critical — an agent could bypass the gate through `workflow-run`.** The node loop called
   every action node with a hard-coded `undefined` caller, and the `workflow-run` verb dropped
   the caller it had, so `sheet-review f1 keep all` inside a template ran as a person's keep.
   The caller now rides `workflow-run` → `runWorkflowNow` → `runWorkflow` →
   `instantiateTemplate` → each node. Canvas had passed `runWorkflow` itself as
   `runWorkflowNow`, whose second parameter is the SOURCE, so a stable `runWorkflowFromPlan`
   wrapper carries it instead. A timer's fire keeps no caller (a person authored the template).
   `draft.door.4` scans for it, since the run path is React.
2. **Important — undo/redo moved the file under a draft without reconciling it**: a false
   conflict after undoing a person's own edit, and a proposal permanently lost when the edit
   that dropped it was undone. Each history step now carries the draft; a traversal merges it
   with anything proposed since, removes what the person discarded, and rebases onto the
   restored bytes (`draft.undo.1`).
Checked clean by the critic: the generic interface, the draft parsers (no `key: undefined`),
keep's re-read and single CAS write, discard never writing, the export strip, the routing
through the palette and the direct agent line, `parseReviewTarget`.

After the fixes: `verify:draft` 22/22, `verify:sheet` 48/48, `verify:verbs` 25/25,
`verify:styles` 60/60, `verify:meta` 45/45, `typecheck` exit 0.

## Open
- Electron tier and the full `npm run verify`: not run on this commit (memory-starved machine, see
  M245's entry). No Electron check was added for the draft UI; its behaviour is pinned in plain
  node through the real session and real file writes.
