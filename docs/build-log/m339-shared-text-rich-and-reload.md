# M339 — shared text: Rich mode is live-bound, and Reload (discard mine) reverts for everyone

**Verdict: shipped.** Closes both "Shared text gaps" owed by
[m330-m335-collaboration.md](m330-m335-collaboration.md). A shared note in Rich mode now
writes through to the shared Y.Text as it is edited and takes a teammate's changes as they
arrive, and the conflict banner's Reload (discard mine) puts the shared text back to what
is on disk. Built 2026-09-26 on local `main` on top of 87949083; first milestone of the
Opus 5.5 autonomous run (M339 onward).

## What landed

- **Rich mode is bound** (`src/renderer/shared-text/useSharedValue.ts`, `value.ts`,
  `binding.ts`'s `bindSharedValue`). Before, only Source mode was bound, through
  CodeEditor's y-monaco binding. A Rich edit reached the shared text only when its author
  went back to Source, and then it won over everything a teammate had typed in the
  meantime. Now the note's draft string is bound to the file's Y.Text while Rich mode is
  on. A block commit is written through as one minimal edit, and a teammate's change
  arrives as the whole new draft. RichNoteEditor's existing reseed rule (a block whose
  source moved under an open edit is refused and reopened as source) keeps an in-progress
  block from being overwritten.
- **A commit made on a stale text is rebased, not replayed** (`value.ts rebaseText`).
  `push(next, base)` takes the text the commit was computed on. If a teammate's change
  landed since, both changes are single regions of `base`. Disjoint regions both survive;
  overlapping ones resolve to the local edit over their union. That is last writer wins at
  block grain, the rule the canvas's field maps already follow. The first version pushed a
  plain minimal diff against the current text, and `text.value.2` caught it deleting a
  concurrent keystroke. The harness relays synchronously, so the "concurrent" edit had
  already landed: the real race, reproduced.
- **Reload (discard mine) reverts the shared text** (`FileNode.tsx`, `data-file-node-reload`).
  The button used to call `closeDraft()` only, so teammates' editors kept the discarded
  text and the next draft here got it back. It now follows the Escape-discard rule ("a
  shared draft's discard is everyone's"). The shared text goes back to what is on disk
  NOW, which is what the panel is about to show. If nothing readable is left on disk, it
  goes back to the text the draft was opened from.
- **One replica lifecycle for both attachments** (`binding.ts bindShared`): acquire, find or
  (on the host) create the Y.Text, wait for a teammate's file to be shared, and re-open
  from scratch on a reset. y-monaco (`bindSharedText`) and the value binding
  (`bindSharedValue`) are attachments to it. The lifecycle is the part with the traps, so
  it exists once.

## Key files

`src/renderer/shared-text/{value.ts (new), useSharedValue.ts (new), binding.ts}`,
`src/renderer/file/{FileNode.tsx, CodeEditor.tsx}`, `scripts/verify-canvas-sync.cjs`,
`src/renderer/CLAUDE.md` (the yjs row of the library-door table).

## Decisions, and why

- **"Owner wins once" now reads an UNSYNCED flag, not `dirty`.** `preferLocal()` used to
  be `dirty`. With two bindings, a draft can be dirty only with edits the doc already
  holds: a teammate's, or ours made in the other mode. Preferring that draft on a Source ↔
  Rich switch would write a stale copy over anything typed during the switch. FileNode now
  tracks `unsyncedRef`: set when the draft changes while no binding is live, cleared the
  moment one reports `live` or `read-only`. CodeEditor reports its state upward through the
  new `onSharedState` prop. A panel re-mounted after a zoom-out tier (the "draft reopened
  dirty" case) now takes the doc's text. Before, it would have written its pre-unmount copy
  over a teammate's edits.
- **`push` is synchronous in the change handler, never an effect on the draft.** An effect
  runs after render, and a teammate's update landing between the two would be written
  back over.
- **The value binding is its own yjs-only module (`value.ts`)** so node can test it without
  y-monaco or the DOM. It widens the renderer's yjs door by one file, deliberately:
  `text.door.1` names it, and `text.door.2` names the second lazy importer
  (`useSharedValue.ts`). Nothing reaches the chunk statically.
- **No carets in Rich mode.** Rich edits block by block, and a Monaco caret has nowhere to
  sit. Presence still shows who is in the panel.

## Checks

`verify:canvas-sync` (52/52), over two real hubs' docs and their replicas:
- `text.value.1`: a teammate's change reaches the bound draft as the whole text. A Rich
  commit reaches every doc and does not echo back.
- `text.value.2`: a commit computed on a stale text is rebased. The teammate's keystroke
  survives, and the draft is told the merged text.
- `text.value.3`: a discard reverts the shared text for everyone, and the bound draft is
  told.
- `text.value.4`: a disposed binding hears nothing more, and a viewer's push never reaches
  main.
- `text.value.5` (source text): FileNode binds Rich through `useSharedValue` and pushes on
  commit, both bindings prefer the local draft only on unsynced typing, and Reload reverts
  before it closes.
- `text.door.1` / `.2`: widened as above.

No Electron DOM check mounts a shared note, and none exists for the M334 Source binding
either. That gap is recorded below.

## Gate

`npm run verify` (2026-09-26, 730.8s): 59/61 suites. Typecheck is clean, and every
plain suite and the build pass. The two red suites carry only the documented baseline
reds, checked against the M336–M338 gate:
- `verify:panels:agents` 80/82: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1`, `workflow.edit.1`, `workflow.edit.2`,
  `workflow.lib.1`, `workflow.wire.1`, `workflow.inspect.1`, `workflow.save.1`,
  `workflow.panel.1e` and `reach.1`.

`verify:canvas-sync` is 52/52 and `verify:meta` 51/51 after the README row. No flake
reruns were needed.

## Owed

- **An Electron DOM check with a shared workspace mounted** (Source and Rich bound, Reload
  reverting). No harness seeds a shared workspace in a real renderer yet. It pairs with
  the M336–M338 owed item (account menu and share dialog click-through) and should land in
  the same milestone, proposed **M345**.

Next: M340 (verify:visual made a signal again: `shot.cjs`'s positional ledger arguments and
the golden debt re-judged by fresh critics).
