# M256 — documents and the Skills workspace

Design items 14 (files, notes, checklists, sheets, decks) and 15 (skills and
toolbox). Built on branch `m256-docs-skills` in its own worktree.

## What landed

**Documents**

- **Document focus** (`Canvas.tsx`'s `docFocusId`, `viewport.ts`'s `docFocusRect`).
  A file panel's focus control centres the file (a camera *jump*, so Camera
  Back returns), widens it to at least 920×720 around its own centre, and
  quiets every other panel with a grayscale filter. This is a VIEW state only:
  the widened rect is never written to the layout or history, a drag on the
  focused panel leaves focus rather than moving it, and deselecting it leaves
  focus too. Escape in the read view leaves; in a draft Escape still means
  discard.
- **Reading type**: prose is `--t-md` at 1.7 line-height on a 68ch measure;
  the directory, gutter and code stay small and mono.
- **Edit vs view**: `data-file-mode` on the body. Editing gets an iris rail, a
  tinted ground and a sticky action bar (the mode word, Source/Rich, the keys,
  Done/Discard). Save stays in the chrome row (`verify:panels:kinds` pins it there).
- **Save state**: Saving…, Saved (for 2.4s, then quiet: a permanent "Saved"
  at rest would be a zero-value statement), Couldn't save (stays until the next try).
- **Missing file**: a centred recovery (Look again / Recreate it here / Close
  panel) under one of two stories from `missingStory`. *Deleted or moved* when
  this panel read text from the path before; *never found here* when it never
  did. A rename and a delete look the same to the watcher, so the first story
  names both rather than guessing.
- **Backlinks and tags** move into a closed `<details>` with counts in the
  summary. The `none` arm's sentence is still in the DOM.
- **Checklists**: a progress bar with "n of m done" / "All done", 20px
  checkboxes on 32px rows, and done items struck through.
- **Sheets**: the column and row headers get a raised, shadowed look so they
  read as frozen; the active column/row header and the cursor get an iris treatment.
- **Decks**: a dark stage, 152px thumbnails with an iris current ring, and
  presenter chrome (bar and notes) hidden until hover or focus.

**Skills**

- **Skills workspace** (`shell/SkillsWorkspace.tsx`), opened from the Skills
  pane's expand control. List on the left (grouped by collection, the
  one-line purpose under each name), the skill in the centre (purpose first,
  then a SKILL.md preview with frontmatter stripped, read through `file:read`
  under its own id and closed on exit), and the metadata on the right: state,
  scope, collection, location, recent use, and an Advanced disclosure holding
  the key, the active word, bundled files and the raw path.
  It is a view over the pane's own props, so the query and kind tab are shared.
- **Badges**: `skillBadge` gives User / Project / Local / Plugin (Plugin wins
  over the scope a plugin was read under). `skillState` gives On canvas /
  Installed / Available (present but off or awaiting approval) / Unavailable
  (a shelf ghost), each with a reason.
- **"New column" → "Create collection"** (the hook `data-skills-new-column` is unchanged).
- **Inspector relevance**: `buildToolboxFields(result, { used })` lists project
  and local skills plus any user or plugin skill the selected agent's trail
  has used, and COUNTS the rest (`elsewhere`) instead of dropping them. With no
  second argument the behaviour is unchanged.

## Checks

`verify:rail` skills-ws.1–5, inspector-skills.1, file-missing.1;
`verify:viewport` doc-focus.1. These were written alongside the models, not
watched failing first.

## Owed

- Goldens: the prose size, sheet headers and deck stage change pixels in
  scenes that show them. They need a looked-at `npm run shot` pass and a
  critic's sentence per changed scene before any `UPDATE_GOLDENS=1`.
- No Electron check drives document focus or the workspace yet.
