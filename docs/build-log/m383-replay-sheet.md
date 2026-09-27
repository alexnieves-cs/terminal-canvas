# M383 — the Replay sheet: scrub a conversation back, see its files as they stood, and compare

**Verdict: shipped.** This closes Arc 2's "encrypted session replay per node: rewind any
node, compare two nodes' runs side by side, virtual filesystem at any timestamp":
- M381 is the model;
- M382 sealed the record at rest;
- this is where a person reads it.

**Replay this conversation…** is on a chat's Activity tab and in the palette. It opens a
sheet over the canvas with a scrubber over the conversation's turns. At any turn it
shows:
- how far into the run that turn is ("turn 8 of 12 · 3m in");
- the agent's last words by then;
- every file it had changed, each **known whole** or **not known whole**, with its count
  of changes. Opening a file shows its content as it stood, or, when not known whole,
  its edits in order and why.

When a shell command had run by then, the sheet says it may have changed files the
replay cannot see. **Compare with** puts a second conversation beside the first, each on
its own moment, with every file both changed marked the same, different, cannot tell, or
changed by only one.

## What landed

- **`renderer/replay/ReplaySheet.tsx`** and **`replay-store.ts`** (new): the sheet, and
  the share dialog's store shape (`openReplay`, `compareReplay`, `closeReplay`).
- **`shared/replay.ts`**: the sheet's words:
  - `fileStateWords`;
  - `compareWords`, where "cannot tell" is its own answer;
  - `shellWords`;
  - `replayPath`, a path shown from the conversation's folder;
  - `sinceStartWords`.
- **The doors**:
  - the Activity tab's `Replay this conversation…` for a chat (`Inspector.tsx`);
  - the palette's `chat.replay`, refused by name on anything that is not a chat
    (`commands.ts`, the `openReplay` action in the presets slice);
  - `verb-table.ts` names why a plan never opens it.
- **`Canvas.tsx`** renders the sheet over every chat on the canvas, reading each
  transcript from the renderer's own store.
- **`styles.css`**: the sheet, the share dialog's scrim-and-card shape.
  `verify:styles shadow.1` names `.replay` as an overlay.
- **The `replay` shot scene**: two runs sent as transcript turns, both scrubbed back,
  a partial file and an exact one open.

## Decisions, and why

- **A view, not a verb.** The sheet reads and changes nothing. Its doors are a person's,
  the gesture and the palette row, for `openBoard`'s and `openWorkflow`'s reason. A plan
  reads a conversation through its own verbs.
- **Each side keeps its own moment.** Two agents rarely ran at the same hours, so a
  shared clock would compare one's start with the other's end. Both open on their
  latest moment, where each one ended up.
- **Time since the run began, not the wall clock.** A replay is read as a run's own
  course, and two runs side by side started at different times. That is also what makes
  the golden stable.
- **A sheet, not a panel kind.** A new kind would enter the layout schema and the
  shared canvas for something that is only looked at. The sheet opens over whatever is
  on screen and leaves nothing behind.
- **Content is cut at 20,000 characters on screen, and says so.** The sheet is for
  reading what changed, not a file viewer.

## Checks

- `verify:palette replay.row.1`: the row is enabled on a captured chat and opens the
  sheet on it. On a terminal it is refused by name, and with nothing captured it says so.
  163/163.
- `verify:agent-session replay.words.1`: the file words, all four compare answers, the
  shell note only after a shell ran, paths from the folder, and "12m 30s in". 184/184.
- `verify:rail labels.1`, `verify:styles` 6 and `shadow.1` hold the sheet to the house
  rules. 257/257 and 81/81.

**Visual: the `replay` scene, a new golden.** Its intent was corrected once before the
critic read it. Only the LEFT side is a rewind ("turn 8 of 12 · 3m in", the fixture's own
later turns not yet reached). The right, codex, holds nothing but this run, so it reads
"turn 6 of 6 · 3m in · latest".

- **Round 1, on the full `npm run shot` image and a crop: DEFECT, "the canvas behind the
  sheet is not visibly dimmed".** Otherwise it read every part as intended: "Left column
  … scrubber thumb sits at ~2/3, labeled 'turn 8 of 12 · 3m in' (a rewind) … server.ts as
  'not known whole · 1 change' in amber, followed by the amber '1 shell command had run
  by then…' note and a numbered edit diff (old `listen(3000)` struck in red, new
  `listen(3000, routes)` inserted in green). Right column … 'turn 6 of 6 · 3m in ·
  latest' … routes.ts open beneath showing full content … FILES, SIDE BY SIDE correctly
  shows health.ts 'the same', routes.ts 'different' (amber), server.ts 'cannot tell —
  one side is not known whole'."
- **Measured, not changed.** The canvas behind the sheet reads RGB (141, 143, 148) at an
  empty spot. So does the canvas behind the approved Share dialog's scrim
  (`share-dialog.png`) at the same spot. The sheet uses the same `--scrim` token.
- **Round 2, the two side by side: Matches intent.** "Side by side, both halves show the
  same muted treatment: the top bar tabs … and left sidebar are equally grayed and
  flattened in both … confirming my earlier flag (based on the Replay screenshot alone
  looking 'too vivid') was a miscalibration, not an actual defect."

`UPDATE_GOLDENS=1 npm run verify:visual` wrote `replay.png` (it was missing). The Work-tab
scenes it moved are M380's and are judged in its ledger.

## Gate

At this commit: `npm run typecheck` is clean and the plain suites this milestone reaches
are green (see Checks). The full `npm run verify` ran once for the chain M381–M384 and
M380 on the tree holding all five; its result is in M384's ledger.

## Owed

- **`unreadable` on screen** (M382). A conversation whose sealed lines this Mac cannot
  open should say so in the sheet and in the chat. That needs the count carried from
  main's read to the renderer's store.
- **A terminal's replay** (its durable scrollback over time) is its own milestone.

Next: M379 (the team asks' palette rows), then M380 (cache return and context burn-down).
